/**
 * Venue Info Freshness Checker
 *
 * Checks venue data freshness by scraping venue homepages for changes to
 * phone number, hours, and address. Updates all-venues.json and Supabase.
 *
 * Designed to run as a Vercel Cron job with 5 batches across a 3-day cycle
 * (~2 batches per day, covering all ~483 venues).
 *
 * GET /api/cron/scrape-venue-info
 *   - Default: scrapes batch 1 (venues 0-99)
 *
 * GET /api/cron/scrape-venue-info?batch=2
 *   - Scrapes batch 2 (venues 100-199)
 *
 * GET /api/cron/scrape-venue-info?batch=3
 *   - Scrapes batch 3 (venues 200-299)
 *
 * GET /api/cron/scrape-venue-info?batch=4
 *   - Scrapes batch 4 (venues 300-399)
 *
 * GET /api/cron/scrape-venue-info?batch=5
 *   - Scrapes batch 5 (venues 400-483)
 *
 * GET /api/cron/scrape-venue-info?state=NV
 *   - Scrapes only Nevada venues (overrides batch)
 *
 * Rotation: 5 batches over 3 days (~2 batches per day)
 * Rate limit: 3 second delay between venues
 *
 * Data sources:
 *   - Reads/Writes: data/all-venues.json
 *   - Writes: Supabase poker_venues table (if available)
 *
 * @module api/cron/scrape-venue-info
 */

import { createClient } from '@supabase/supabase-js';
import https from 'https';
import http from 'http';
import fs from 'fs';
import path from 'path';

// ---------------------------------------------------------------------------
// Supabase client (may be unavailable in some environments)
// ---------------------------------------------------------------------------
let supabase = null;
try {
    if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
        supabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL,
            process.env.SUPABASE_SERVICE_ROLE_KEY
        );
    }
} catch (_) {
    // Supabase not available
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const RATE_LIMIT_MS = 3000;
const BATCH_SIZE = 100;
const VENUES_JSON_PATH = path.join(process.cwd(), 'data', 'all-venues.json');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Fetch a URL using native https/http with redirect support and retry logic.
 * @param {string} url - The URL to fetch
 * @param {number} retries - Number of retries remaining
 * @param {number} redirectCount - Current redirect depth (max 5)
 * @returns {Promise<string>} The response body
 */
async function fetchUrl(url, retries = 2, redirectCount = 0) {
    if (redirectCount > 5) throw new Error('Too many redirects');

    const protocol = url.startsWith('https') ? https : http;

    return new Promise((resolve, reject) => {
        const request = protocol.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.9'
            }
        }, (response) => {
            // Handle redirects
            if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
                let redirectUrl = response.headers.location;
                if (!redirectUrl.startsWith('http')) {
                    const urlObj = new URL(url);
                    redirectUrl = `${urlObj.protocol}//${urlObj.host}${redirectUrl}`;
                }
                return fetchUrl(redirectUrl, retries, redirectCount + 1).then(resolve).catch(reject);
            }

            if (response.statusCode !== 200) {
                reject(new Error(`HTTP ${response.statusCode}`));
                return;
            }

            let data = '';
            response.on('data', chunk => data += chunk);
            response.on('end', () => resolve(data));
        });

        request.on('error', async (error) => {
            if (retries > 0) {
                await sleep(1000);
                fetchUrl(url, retries - 1, redirectCount).then(resolve).catch(reject);
            } else {
                reject(error);
            }
        });

        request.setTimeout(12000, () => {
            request.destroy();
            reject(new Error('Timeout'));
        });
    });
}

/**
 * Load a JSON file. Returns null on failure.
 */
function loadJsonFile(filePath) {
    try {
        const raw = fs.readFileSync(filePath, 'utf-8');
        return JSON.parse(raw);
    } catch (_) {
        return null;
    }
}

/**
 * Write a JSON file.
 */
function saveJsonFile(filePath, data) {
    try {
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
        return true;
    } catch (_) {
        return false;
    }
}

// ---------------------------------------------------------------------------
// Data extraction from venue HTML
// ---------------------------------------------------------------------------

/**
 * Extract phone numbers from page text.
 * Returns the first US-format phone number found, or null.
 */
function extractPhone(text) {
    // Match common US phone formats
    const patterns = [
        /\((\d{3})\)\s*(\d{3})[-.](\d{4})/,          // (555) 555-5555
        /(\d{3})[-.](\d{3})[-.](\d{4})/,              // 555-555-5555 or 555.555.5555
        /1[-.](\d{3})[-.](\d{3})[-.](\d{4})/,         // 1-555-555-5555
        /\+1\s*\((\d{3})\)\s*(\d{3})[-.](\d{4})/     // +1 (555) 555-5555
    ];

    for (const pattern of patterns) {
        const match = text.match(pattern);
        if (match) {
            // Normalize to (XXX) XXX-XXXX format
            const digits = match[0].replace(/\D/g, '');
            const last10 = digits.slice(-10);
            if (last10.length === 10) {
                return `(${last10.slice(0, 3)}) ${last10.slice(3, 6)}-${last10.slice(6)}`;
            }
        }
    }

    return null;
}

/**
 * Extract hours of operation from page text.
 * Returns a string like "24/7", "Mon-Fri 10am-2am", etc.
 */
function extractHours(text) {
    // Look for common hours patterns
    const hoursPatterns = [
        // "24/7" or "24 hours"
        /\b(24\s*\/\s*7)\b/i,
        /\b(24\s+hours?(?:\s+a\s+day)?)\b/i,
        // "Open daily" patterns
        /(?:open|hours)[:\s]*([^.;\n]{5,80}(?:am|pm|midnight|noon|24\/7))/i,
        // "Mon-Sun 10am-4am" or similar
        /\b((?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)(?:day)?(?:\s*[-\/]\s*(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)(?:day)?)*\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)\s*[-to]+\s*\d{1,2}(?::\d{2})?\s*(?:am|pm))/i,
        // "Daily Xam-Yam"
        /\b(Daily\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)\s*[-to]+\s*\d{1,2}(?::\d{2})?\s*(?:am|pm))/i,
        // Poker room hours specifically
        /(?:poker\s+(?:room|area)?)\s+(?:hours?|open)[:\s]*([^.;\n]{5,80})/i
    ];

    for (const pattern of hoursPatterns) {
        const match = text.match(pattern);
        if (match) {
            let hours = (match[1] || match[0]).trim();
            // Clean up
            hours = hours.replace(/\s+/g, ' ').substring(0, 100);
            return hours;
        }
    }

    return null;
}

/**
 * Extract a street address from page text.
 * Returns an address string or null.
 */
function extractAddress(text) {
    // Match common US address patterns
    const addressPatterns = [
        // "1234 Street Name (St|Ave|Blvd|Rd|Dr|Way|Ln|Ct|Pkwy|Hwy)"
        /(\d{1,6}\s+(?:[A-Z][a-zA-Z]+\s+){1,4}(?:Street|St|Avenue|Ave|Boulevard|Blvd|Road|Rd|Drive|Dr|Way|Lane|Ln|Court|Ct|Parkway|Pkwy|Highway|Hwy|Place|Pl|Circle|Cir)\.?)\b/i
    ];

    for (const pattern of addressPatterns) {
        const match = text.match(pattern);
        if (match) {
            return match[1].trim().substring(0, 200);
        }
    }

    return null;
}

/**
 * Normalize a phone string for comparison (strip all non-digits).
 */
function normalizePhone(phone) {
    if (!phone) return '';
    return phone.replace(/\D/g, '').slice(-10);
}

/**
 * Normalize an hours string for comparison (lowercase, strip extra whitespace).
 */
function normalizeHours(hours) {
    if (!hours) return '';
    return hours.toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * Normalize an address string for comparison.
 */
function normalizeAddress(addr) {
    if (!addr) return '';
    return addr.toLowerCase().replace(/\s+/g, ' ').replace(/[.,]/g, '').trim();
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------
export default async function handler(req, res) {
    // CRON_SECRET auth — optional, skip in dev
    if (process.env.NODE_ENV === 'production' && process.env.CRON_SECRET) {
        if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
    }

    const { batch: batchParam, state } = req.query;
    const batchNumber = parseInt(batchParam) || 1;

    const stats = {
        success: true,
        batch: batchNumber,
        venuesChecked: 0,
        updatesFound: 0,
        phoneUpdates: 0,
        hoursUpdates: 0,
        addressUpdates: 0,
        errors: [],
        skipped: 0,
        startedAt: new Date().toISOString()
    };

    try {
        // ----- Load venue data -----
        const venuesData = loadJsonFile(VENUES_JSON_PATH);
        if (!venuesData || !venuesData.venues) {
            return res.status(500).json({
                success: false,
                error: 'Could not load all-venues.json'
            });
        }

        let allVenues = venuesData.venues;
        let venueSubset;

        // Optional: filter by state (overrides batch)
        if (state) {
            venueSubset = allVenues.filter(v =>
                v.state && v.state.toUpperCase() === state.toUpperCase()
            );
        } else {
            // Apply batch slicing (5 batches, ~100 venues each)
            const startIdx = (batchNumber - 1) * BATCH_SIZE;
            const endIdx = Math.min(startIdx + BATCH_SIZE, allVenues.length);
            venueSubset = allVenues.slice(startIdx, endIdx);
        }

        // Track whether we made any changes to venues data
        let venuesModified = false;

        // ----- Process each venue -----
        for (let i = 0; i < venueSubset.length; i++) {
            const venue = venueSubset[i];

            // Skip venues without a website
            if (!venue.website) {
                stats.skipped++;
                continue;
            }

            stats.venuesChecked++;

            let url = venue.website;
            if (!url.startsWith('http')) {
                url = 'https://' + url;
            }

            try {
                const html = await fetchUrl(url);
                const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

                let venueUpdated = false;
                const updates = {};

                // ----- Check phone number -----
                const foundPhone = extractPhone(text);
                if (foundPhone) {
                    const normalizedFound = normalizePhone(foundPhone);
                    const normalizedExisting = normalizePhone(venue.phone);

                    if (normalizedFound !== normalizedExisting && normalizedFound.length === 10) {
                        updates.phone = foundPhone;
                        venueUpdated = true;
                        stats.phoneUpdates++;
                    }
                }

                // ----- Check hours -----
                const foundHours = extractHours(text);
                if (foundHours) {
                    const normalizedFound = normalizeHours(foundHours);
                    const normalizedExisting = normalizeHours(venue.hours);

                    if (normalizedFound !== normalizedExisting && normalizedFound.length > 3) {
                        updates.hours = foundHours;
                        venueUpdated = true;
                        stats.hoursUpdates++;
                    }
                }

                // ----- Check address -----
                const foundAddress = extractAddress(text);
                if (foundAddress) {
                    const normalizedFound = normalizeAddress(foundAddress);
                    const normalizedExisting = normalizeAddress(venue.address);

                    // Only update if it looks substantially different (not just a formatting change)
                    if (normalizedFound !== normalizedExisting && normalizedFound.length > 5) {
                        // Additional check: must share at least one number to avoid false positives
                        const existingNumbers = (venue.address || '').match(/\d+/g) || [];
                        const foundNumbers = foundAddress.match(/\d+/g) || [];
                        const sharedNumber = foundNumbers.some(n => existingNumbers.includes(n));

                        // If existing address is empty, or addresses share a number (likely same place, updated format)
                        if (!venue.address || sharedNumber || existingNumbers.length === 0) {
                            updates.address = foundAddress;
                            venueUpdated = true;
                            stats.addressUpdates++;
                        }
                    }
                }

                // ----- Apply updates -----
                if (venueUpdated) {
                    stats.updatesFound++;

                    // Find venue in main array and update
                    const venueIdx = allVenues.findIndex(v => v.id === venue.id);
                    if (venueIdx !== -1) {
                        if (updates.phone) allVenues[venueIdx].phone = updates.phone;
                        if (updates.hours) allVenues[venueIdx].hours = updates.hours;
                        if (updates.address) allVenues[venueIdx].address = updates.address;
                        allVenues[venueIdx].last_info_check = new Date().toISOString();
                        venuesModified = true;
                    }

                    // Update Supabase if available
                    if (supabase && venue.id) {
                        try {
                            const supabaseUpdates = { ...updates };
                            supabaseUpdates.last_info_check = new Date().toISOString();

                            await supabase
                                .from('poker_venues')
                                .update(supabaseUpdates)
                                .eq('id', venue.id);
                        } catch (_) {
                            // Supabase update failure is non-fatal
                        }
                    }
                } else {
                    // No changes found, but mark as checked
                    const venueIdx = allVenues.findIndex(v => v.id === venue.id);
                    if (venueIdx !== -1) {
                        allVenues[venueIdx].last_info_check = new Date().toISOString();
                        venuesModified = true;
                    }
                }
            } catch (error) {
                stats.errors.push({
                    venue: venue.name,
                    website: venue.website,
                    error: error.message
                });
            }

            // Rate limiting between venues
            if (i < venueSubset.length - 1) {
                await sleep(RATE_LIMIT_MS);
            }
        }

        // ----- Save updated venues JSON -----
        if (venuesModified) {
            venuesData.venues = allVenues;
            venuesData.metadata.last_info_check = new Date().toISOString();
            const saved = saveJsonFile(VENUES_JSON_PATH, venuesData);
            stats.jsonSaved = saved;
        } else {
            stats.jsonSaved = false;
        }

        stats.finishedAt = new Date().toISOString();
        return res.status(200).json(stats);

    } catch (error) {
        stats.success = false;
        stats.error = error.message;
        stats.finishedAt = new Date().toISOString();
        return res.status(500).json(stats);
    }
}
