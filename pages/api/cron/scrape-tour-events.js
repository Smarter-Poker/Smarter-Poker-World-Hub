/**
 * Tour Events Auto-Scraper
 *
 * Scrapes event data for all 23+ poker tours registered in tour-source-registry.json.
 * Designed to run as a Vercel Cron job in a 3-day rotation across 3 batches.
 *
 * GET /api/cron/scrape-tour-events
 *   - Default: scrapes batch 1 (tours 0-7)
 *
 * GET /api/cron/scrape-tour-events?batch=2
 *   - Scrapes batch 2 (tours 8-15)
 *
 * GET /api/cron/scrape-tour-events?batch=3
 *   - Scrapes batch 3 (tours 16-23)
 *
 * GET /api/cron/scrape-tour-events?tour=WSOP
 *   - Scrapes only the WSOP tour (overrides batch)
 *
 * GET /api/cron/scrape-tour-events?force=true
 *   - Re-scrape even if recently scraped
 *
 * Rotation: batch 1 = tours 0-7, batch 2 = tours 8-15, batch 3 = tours 16-23
 * Rate limit: 5 second delay between tours
 *
 * Data sources:
 *   - Reads: data/tour-source-registry.json (tour list and source URLs)
 *   - Writes: data/{code}-2026-events.json (individual tour event files)
 *   - Writes: Supabase tour_events table (if available)
 *
 * @module api/cron/scrape-tour-events
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
const RATE_LIMIT_MS = 5000;
const BATCH_SIZE = 8;
const DATA_DIR = path.join(process.cwd(), 'data');
const REGISTRY_PATH = path.join(DATA_DIR, 'tour-source-registry.json');
const CURRENT_YEAR = 2026;

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
async function fetchUrl(url, retries = 3, redirectCount = 0) {
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

        request.setTimeout(20000, () => {
            request.destroy();
            reject(new Error('Timeout'));
        });
    });
}

/**
 * Load a JSON file from the data directory. Returns null on failure.
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
 * Write a JSON file to the data directory.
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
// HTML Parsing — Tour event schedules
// ---------------------------------------------------------------------------

/**
 * Parse tour event data from HTML.
 * Looks for structured tables and event cards containing:
 *   - Event name
 *   - Buy-in (dollar amount)
 *   - Date
 *   - Game type
 *   - Format
 *   - Venue/location
 *
 * @param {string} html - Raw HTML from the tour's schedule page
 * @param {string} tourCode - The tour code (e.g. "WSOP")
 * @param {object} scrapeConfig - Scrape config from the registry
 * @returns {Array} Array of parsed event objects
 */
function parseTourEvents(html, tourCode, scrapeConfig) {
    const events = [];

    // Strategy 1: Parse HTML tables (common for schedule pages)
    const tableEvents = parseTableEvents(html, tourCode);
    if (tableEvents.length > 0) return tableEvents;

    // Strategy 2: Parse event cards / divs
    const cardEvents = parseCardEvents(html, tourCode);
    if (cardEvents.length > 0) return cardEvents;

    // Strategy 3: Parse raw text for event-like patterns
    const textEvents = parseTextEvents(html, tourCode);
    return textEvents;
}

/**
 * Parse events from HTML table rows.
 */
function parseTableEvents(html, tourCode) {
    const events = [];
    const rows = html.split(/<tr[^>]*>/gi);

    let eventNumber = 0;
    for (const row of rows) {
        if (row.includes('<th') || !row.includes('$')) continue;

        const cells = [];
        const cellMatches = row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi);
        for (const match of cellMatches) {
            cells.push(match[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
        }

        if (cells.length < 2) continue;

        const fullText = cells.join(' | ');

        // Extract buy-in
        const buyinMatch = fullText.match(/\$(\d{1,3}(?:,\d{3})*)/);
        if (!buyinMatch) continue;

        const buyin = parseInt(buyinMatch[1].replace(/,/g, ''));
        if (buyin < 50 || buyin > 500000) continue;

        eventNumber++;

        // Extract event name (usually first or second cell with meaningful text)
        let eventName = '';
        for (const cell of cells) {
            if (cell.length > 5 && !/^\$/.test(cell) && !/^\d{1,2}\//.test(cell)) {
                eventName = cell;
                break;
            }
        }
        if (!eventName) eventName = `Event #${eventNumber}`;

        // Extract date
        const dateMatch = fullText.match(
            /(\d{1,2}[\/-]\d{1,2}(?:[\/-]\d{2,4})?)|(\w+\s+\d{1,2}(?:\s*[-,]\s*\d{1,2})?(?:,?\s*\d{4})?)/
        );
        let startDate = null;
        if (dateMatch) {
            startDate = dateMatch[0].trim();
        }

        // Extract time
        const timeMatch = fullText.match(/(\d{1,2}:\d{2}\s*(?:AM|PM|am|pm)?)/i);

        // Determine game type
        let gameType = 'NLH';
        if (/\bPLO\b/i.test(fullText)) gameType = 'PLO';
        else if (/\bOmaha\b/i.test(fullText)) gameType = 'Omaha';
        else if (/\bStud\b/i.test(fullText)) gameType = 'Stud';
        else if (/\bRazz\b/i.test(fullText)) gameType = 'Razz';
        else if (/\bHORSE\b/i.test(fullText)) gameType = 'HORSE';
        else if (/\bMixed\b/i.test(fullText)) gameType = 'Mixed';
        else if (/\b8-Game\b/i.test(fullText)) gameType = '8-Game';
        else if (/\bBig-O\b/i.test(fullText)) gameType = 'Big-O';
        else if (/\bShort\s*Deck\b/i.test(fullText)) gameType = 'Short Deck';

        // Determine format
        let format = null;
        if (/turbo/i.test(fullText)) format = 'Turbo';
        else if (/deep\s*stack/i.test(fullText)) format = 'Deep Stack';
        else if (/bounty/i.test(fullText)) format = 'Bounty';
        else if (/mystery/i.test(fullText)) format = 'Mystery Bounty';
        else if (/freezeout/i.test(fullText)) format = 'Freezeout';
        else if (/6[\s-]*max/i.test(fullText)) format = '6-Max';
        else if (/shootout/i.test(fullText)) format = 'Shootout';
        else if (/rebuy/i.test(fullText)) format = 'Rebuy';
        else if (/tag\s*team/i.test(fullText)) format = 'Tag Team';

        // Extract guaranteed amount
        const gtdMatch = fullText.match(/(?:GTD|Guaranteed)[:\s]*\$?([\d,]+)/i);

        // Extract venue
        const venueMatch = fullText.match(
            /(?:at|@|venue:?)\s+([A-Z][A-Za-z\s&'-]+(?:Casino|Resort|Hotel|Room|Club|Palace))/i
        );

        events.push({
            tour_code: tourCode,
            event_number: eventNumber,
            event_name: eventName.substring(0, 200),
            buy_in: buyin,
            start_date: startDate,
            start_time: timeMatch ? timeMatch[1].toUpperCase().replace(/\s/g, '') : null,
            game_type: gameType,
            format: format,
            guaranteed: gtdMatch ? parseInt(gtdMatch[1].replace(/,/g, '')) : null,
            venue: venueMatch ? venueMatch[1].trim() : null
        });
    }

    return events;
}

/**
 * Parse events from card-style HTML elements (divs, articles, etc.)
 */
function parseCardEvents(html, tourCode) {
    const events = [];

    // Match common event card patterns
    const cardPatterns = [
        /<(?:div|article|section)[^>]*class="[^"]*(?:event|tournament|schedule)[^"]*"[^>]*>([\s\S]*?)<\/(?:div|article|section)>/gi,
        /<li[^>]*class="[^"]*(?:event|tournament)[^"]*"[^>]*>([\s\S]*?)<\/li>/gi
    ];

    let eventNumber = 0;

    for (const pattern of cardPatterns) {
        const matches = html.matchAll(pattern);
        for (const match of matches) {
            const cardHtml = match[1];
            const cardText = cardHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

            if (cardText.length < 10 || cardText.length > 2000) continue;

            // Must have a dollar amount
            const buyinMatch = cardText.match(/\$(\d{1,3}(?:,\d{3})*)/);
            if (!buyinMatch) continue;

            const buyin = parseInt(buyinMatch[1].replace(/,/g, ''));
            if (buyin < 50 || buyin > 500000) continue;

            eventNumber++;

            // Extract title (look for headings within the card)
            let eventName = '';
            const titleMatch = cardHtml.match(/<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/i);
            if (titleMatch) {
                eventName = titleMatch[1].replace(/<[^>]+>/g, '').trim();
            }
            if (!eventName) {
                // Take the first meaningful text chunk
                const firstText = cardText.match(/^([^$]+)/);
                eventName = firstText ? firstText[1].trim().substring(0, 100) : `Event #${eventNumber}`;
            }

            // Extract date
            const dateMatch = cardText.match(
                /(\w+\s+\d{1,2}(?:\s*[-,]\s*\d{1,2})?(?:,?\s*\d{4})?)|(\d{1,2}[\/-]\d{1,2}(?:[\/-]\d{2,4})?)/
            );

            // Determine game type
            let gameType = 'NLH';
            if (/\bPLO\b/i.test(cardText)) gameType = 'PLO';
            else if (/\bOmaha\b/i.test(cardText)) gameType = 'Omaha';
            else if (/\bMixed\b/i.test(cardText)) gameType = 'Mixed';
            else if (/\bStud\b/i.test(cardText)) gameType = 'Stud';
            else if (/\bHORSE\b/i.test(cardText)) gameType = 'HORSE';

            // Determine format
            let format = null;
            if (/turbo/i.test(cardText)) format = 'Turbo';
            else if (/deep\s*stack/i.test(cardText)) format = 'Deep Stack';
            else if (/bounty/i.test(cardText)) format = 'Bounty';
            else if (/mystery/i.test(cardText)) format = 'Mystery Bounty';
            else if (/freezeout/i.test(cardText)) format = 'Freezeout';
            else if (/6[\s-]*max/i.test(cardText)) format = '6-Max';

            // Guaranteed
            const gtdMatch = cardText.match(/(?:GTD|Guaranteed)[:\s]*\$?([\d,]+)/i);

            // Venue
            const venueMatch = cardText.match(
                /(?:at|@|venue:?|location:?)\s+([A-Z][A-Za-z\s&'-]+)/i
            );

            events.push({
                tour_code: tourCode,
                event_number: eventNumber,
                event_name: eventName.substring(0, 200),
                buy_in: buyin,
                start_date: dateMatch ? dateMatch[0].trim() : null,
                start_time: null,
                game_type: gameType,
                format: format,
                guaranteed: gtdMatch ? parseInt(gtdMatch[1].replace(/,/g, '')) : null,
                venue: venueMatch ? venueMatch[1].trim() : null
            });
        }

        if (events.length > 0) break;
    }

    return events;
}

/**
 * Parse events from raw stripped HTML text as a last resort.
 */
function parseTextEvents(html, tourCode) {
    const events = [];
    const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

    // Split on dollar signs to find buy-in blocks
    const blocks = text.split(/(?=\$\d)/);
    let eventNumber = 0;

    for (const block of blocks) {
        if (block.length > 800 || block.length < 10) continue;

        const buyinMatch = block.match(/\$(\d{1,3}(?:,\d{3})*)/);
        if (!buyinMatch) continue;

        const buyin = parseInt(buyinMatch[1].replace(/,/g, ''));
        if (buyin < 50 || buyin > 500000) continue;

        eventNumber++;

        // Look for event name in context before/around the buy-in
        let eventName = `$${buyinMatch[1]} Event`;
        const nameMatch = block.match(/([A-Z][A-Za-z\s&'-]+(?:Event|Tournament|Open|Classic|Championship|Series|Showdown|Special))/i);
        if (nameMatch) eventName = nameMatch[1].trim();

        // Date
        const dateMatch = block.match(
            /(\w+\s+\d{1,2}(?:\s*[-,]\s*\d{1,2})?(?:,?\s*\d{4})?)|(\d{1,2}[\/-]\d{1,2}(?:[\/-]\d{2,4})?)/
        );

        // Game type
        let gameType = 'NLH';
        if (/PLO|Omaha/i.test(block)) gameType = 'PLO';
        else if (/Mixed/i.test(block)) gameType = 'Mixed';

        // Format
        let format = null;
        if (/turbo/i.test(block)) format = 'Turbo';
        else if (/deep\s*stack/i.test(block)) format = 'Deep Stack';
        else if (/bounty/i.test(block)) format = 'Bounty';

        events.push({
            tour_code: tourCode,
            event_number: eventNumber,
            event_name: eventName.substring(0, 200),
            buy_in: buyin,
            start_date: dateMatch ? dateMatch[0].trim() : null,
            start_time: null,
            game_type: gameType,
            format: format,
            guaranteed: null,
            venue: null
        });
    }

    return events;
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

    const { batch: batchParam, tour: tourFilter, force } = req.query;
    const batchNumber = parseInt(batchParam) || 1;

    const stats = {
        success: true,
        batch: batchNumber,
        toursProcessed: 0,
        totalEventsFound: 0,
        eventsUpserted: 0,
        filesWritten: 0,
        errors: [],
        skipped: 0,
        startedAt: new Date().toISOString()
    };

    try {
        // ----- Load tour registry -----
        const registry = loadJsonFile(REGISTRY_PATH);
        if (!registry || !registry.tours) {
            return res.status(500).json({
                success: false,
                error: 'Could not load tour-source-registry.json'
            });
        }

        // Build tour list (exclude defunct tours)
        let tourEntries = Object.entries(registry.tours).filter(([_, tour]) => {
            return tour.is_active !== false && tour.priority !== 99;
        });

        // Optional: filter by specific tour
        if (tourFilter) {
            const code = tourFilter.toUpperCase();
            tourEntries = tourEntries.filter(([key, _]) => key === code);
            if (tourEntries.length === 0) {
                return res.status(404).json({
                    success: false,
                    error: `Tour not found: ${tourFilter}`
                });
            }
        } else {
            // Apply batch slicing (3-day rotation)
            const startIdx = (batchNumber - 1) * BATCH_SIZE;
            const endIdx = Math.min(startIdx + BATCH_SIZE, tourEntries.length);
            tourEntries = tourEntries.slice(startIdx, endIdx);
        }

        // ----- Process each tour -----
        for (let i = 0; i < tourEntries.length; i++) {
            const [tourCode, tourConfig] = tourEntries[i];
            stats.toursProcessed++;

            // Build file path for this tour's events
            const eventFileName = `${tourCode.toLowerCase()}-${CURRENT_YEAR}-events.json`;
            const eventFilePath = path.join(DATA_DIR, eventFileName);

            // Check if recently scraped (unless force=true)
            if (force !== 'true') {
                const existing = loadJsonFile(eventFilePath);
                if (existing && existing.metadata && existing.metadata.last_scraped) {
                    const lastScraped = new Date(existing.metadata.last_scraped);
                    const refreshDays = tourConfig.refresh_interval_days || 3;
                    const refreshMs = refreshDays * 24 * 60 * 60 * 1000;
                    if (Date.now() - lastScraped.getTime() < refreshMs) {
                        stats.skipped++;
                        continue;
                    }
                }
            }

            // Determine the URL to scrape
            const sourceUrls = tourConfig.source_urls || {};
            const primaryUrl = sourceUrls.primary || sourceUrls.schedule_2026 || tourConfig.official_website;

            if (!primaryUrl) {
                stats.skipped++;
                continue;
            }

            // Skip tours marked as manual-only scrape method
            if (tourConfig.scrape_config && tourConfig.scrape_config.method === 'manual') {
                stats.skipped++;
                continue;
            }

            let events = [];
            let scrapedUrl = primaryUrl;

            try {
                // Try primary source URL
                const html = await fetchUrl(primaryUrl);
                events = parseTourEvents(html, tourCode, tourConfig.scrape_config || {});

                // If primary yields nothing, try secondary URLs
                if (events.length === 0) {
                    const secondaryUrls = [
                        sourceUrls.schedule,
                        sourceUrls.schedule_2026,
                        sourceUrls.pokeratlas,
                        sourceUrls.hendonmob
                    ].filter(Boolean).filter(u => u !== primaryUrl);

                    for (const altUrl of secondaryUrls) {
                        try {
                            const altHtml = await fetchUrl(altUrl);
                            events = parseTourEvents(altHtml, tourCode, tourConfig.scrape_config || {});
                            if (events.length > 0) {
                                scrapedUrl = altUrl;
                                break;
                            }
                        } catch (_) {
                            // Try next URL
                        }
                    }
                }

                stats.totalEventsFound += events.length;

                // ----- Write to individual tour event file -----
                const eventFileData = {
                    metadata: {
                        tour: tourConfig.tour_name,
                        tour_code: tourCode,
                        year: CURRENT_YEAR,
                        source_url: scrapedUrl,
                        last_scraped: new Date().toISOString(),
                        last_updated: new Date().toISOString().split('T')[0],
                        events_found: events.length,
                        notes: `Auto-scraped by cron job. Source: ${scrapedUrl}`
                    },
                    events: events
                };

                // Merge with existing data if we found no new events
                if (events.length === 0) {
                    const existing = loadJsonFile(eventFilePath);
                    if (existing && existing.events && existing.events.length > 0) {
                        eventFileData.events = existing.events;
                        eventFileData.metadata.events_found = existing.events.length;
                        eventFileData.metadata.notes = `No new events scraped; retained existing ${existing.events.length} events.`;
                    }
                }

                const saved = saveJsonFile(eventFilePath, eventFileData);
                if (saved) stats.filesWritten++;

                // ----- Upsert to Supabase if available -----
                if (supabase && events.length > 0) {
                    for (const event of events) {
                        try {
                            const record = {
                                tour_code: event.tour_code,
                                event_number: event.event_number,
                                event_name: event.event_name,
                                buy_in: event.buy_in,
                                start_date: event.start_date,
                                start_time: event.start_time,
                                game_type: event.game_type,
                                format: event.format,
                                guaranteed: event.guaranteed,
                                venue: event.venue,
                                source_url: scrapedUrl,
                                year: CURRENT_YEAR,
                                last_scraped: new Date().toISOString()
                            };

                            const { error: upsertError } = await supabase
                                .from('tour_events')
                                .upsert(record, {
                                    onConflict: 'tour_code,event_number,year'
                                });

                            if (!upsertError) stats.eventsUpserted++;
                        } catch (_) {
                            // Individual upsert failure is non-fatal
                        }
                    }
                }
            } catch (error) {
                stats.errors.push({
                    tour: tourCode,
                    url: primaryUrl,
                    error: error.message
                });
            }

            // Rate limiting between tours
            if (i < tourEntries.length - 1) {
                await sleep(RATE_LIMIT_MS);
            }
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
