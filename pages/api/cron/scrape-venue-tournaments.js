/**
 * Venue Tournament Schedule Auto-Scraper
 *
 * Scrapes daily tournament schedules from all 163 venues that have tournaments.
 * Designed to run as a Vercel Cron job in a 3-day rotation across 3 batches.
 *
 * GET /api/cron/scrape-venue-tournaments
 *   - Default: scrapes batch 1 (venues 0-54)
 *
 * GET /api/cron/scrape-venue-tournaments?batch=2
 *   - Scrapes batch 2 (venues 55-108)
 *
 * GET /api/cron/scrape-venue-tournaments?batch=3
 *   - Scrapes batch 3 (venues 109-163)
 *
 * GET /api/cron/scrape-venue-tournaments?state=NV
 *   - Scrapes only venues in Nevada (overrides batch)
 *
 * GET /api/cron/scrape-venue-tournaments?force=true
 *   - Re-scrape even if recently scraped
 *
 * Rotation: batch 1 = venues 0-54, batch 2 = venues 55-108, batch 3 = venues 109-163
 * Rate limit: 2 second delay between venues
 * Max 55 venues per batch (stays within Vercel function timeout)
 *
 * Data sources:
 *   - Reads: data/all-venues.json (venue list, filter has_tournaments=true)
 *   - Reads/Writes: data/daily-tournament-schedules.json (existing schedule data)
 *   - Writes: Supabase venue_daily_tournaments table (if available)
 *
 * @module api/cron/scrape-venue-tournaments
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
    // Supabase not available – will fall back to JSON file storage
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const RATE_LIMIT_MS = 2000;
const MAX_VENUES_PER_BATCH = 55;
const VENUES_JSON_PATH = path.join(process.cwd(), 'data', 'all-venues.json');
const SCHEDULES_JSON_PATH = path.join(process.cwd(), 'data', 'daily-tournament-schedules.json');

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

        request.setTimeout(15000, () => {
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
// HTML Parsing — PokerAtlas tournament tables
// ---------------------------------------------------------------------------

/**
 * Parse PokerAtlas tournament HTML for recurring daily schedules.
 * Looks for table rows containing dollar amounts, times, and day names.
 */
function parsePokerAtlasTournaments(html, venueName) {
    const tournaments = [];
    const rows = html.split(/<tr[^>]*>/gi);

    for (const row of rows) {
        if (!row.includes('$') || row.includes('<th')) continue;

        // Extract table cells
        const cells = [];
        const cellMatches = row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi);
        for (const match of cellMatches) {
            cells.push(match[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
        }

        if (cells.length < 2) continue;

        const fullText = cells.join(' ');

        // Extract buy-in
        const buyinMatch = fullText.match(/\$(\d{1,3}(?:,\d{3})*)/);
        if (!buyinMatch) continue;

        const buyin = parseInt(buyinMatch[1].replace(/,/g, ''));
        if (buyin < 10 || buyin > 50000) continue;

        // Extract time
        const timeMatch = fullText.match(/(\d{1,2}:\d{2}\s*(?:AM|PM|am|pm)?)/i);
        if (!timeMatch) continue;

        // Extract day of week
        const dayMatch = fullText.match(/(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|Mon|Tue|Wed|Thu|Fri|Sat|Sun|Daily)/i);
        let dayOfWeek = 'Daily';
        if (dayMatch) {
            const dayMap = {
                'mon': 'Monday', 'tue': 'Tuesday', 'wed': 'Wednesday',
                'thu': 'Thursday', 'fri': 'Friday', 'sat': 'Saturday', 'sun': 'Sunday',
                'daily': 'Daily'
            };
            dayOfWeek = dayMap[dayMatch[1].toLowerCase().substring(0, 3)] || dayMatch[1];
        }

        // Extract guaranteed amount
        const gtdMatch = fullText.match(/(?:GTD|Guaranteed)[:\s]*\$?([\d,]+)/i);

        // Determine game type
        let gameType = 'NLH';
        if (/\bPLO\b/i.test(fullText)) gameType = 'PLO';
        else if (/\bOmaha\b/i.test(fullText)) gameType = 'Omaha';
        else if (/\bMixed\b/i.test(fullText)) gameType = 'Mixed';
        else if (/\bBig-O\b/i.test(fullText)) gameType = 'Big-O';

        // Determine format
        let format = null;
        if (/turbo/i.test(fullText)) format = 'Turbo';
        else if (/deep\s*stack/i.test(fullText)) format = 'Deep Stack';
        else if (/bounty/i.test(fullText)) format = 'Bounty';
        else if (/mystery/i.test(fullText)) format = 'Mystery Bounty';
        else if (/freezeout/i.test(fullText)) format = 'Freezeout';
        else if (/rebuy/i.test(fullText)) format = 'Rebuy';

        tournaments.push({
            venue_name: venueName,
            day_of_week: dayOfWeek,
            start_time: timeMatch[1].toUpperCase().replace(/\s/g, ''),
            buy_in: buyin,
            game_type: gameType,
            format: format,
            guaranteed: gtdMatch ? parseInt(gtdMatch[1].replace(/,/g, '')) : null
        });
    }

    // Deduplicate
    const seen = new Set();
    return tournaments.filter(t => {
        const key = `${t.day_of_week}-${t.start_time}-${t.buy_in}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

// ---------------------------------------------------------------------------
// HTML Parsing — Direct venue website
// ---------------------------------------------------------------------------

/**
 * Parse tournament info from a venue's own website.
 * Splits on dollar amounts and looks for time/day context.
 */
function parseDirectWebsiteTournaments(html, venueName) {
    const tournaments = [];
    const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
    const blocks = text.split(/(?=\$\d)/);

    for (const block of blocks) {
        if (block.length > 500) continue;

        const buyinMatch = block.match(/\$(\d{1,3}(?:,\d{3})*)/);
        if (!buyinMatch) continue;

        const buyin = parseInt(buyinMatch[1].replace(/,/g, ''));
        if (buyin < 10 || buyin > 50000) continue;

        const timeMatch = block.match(/(\d{1,2}:\d{2}\s*(?:AM|PM)?)/i);
        if (!timeMatch) continue;

        const dayMatch = block.match(/(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|Daily)/i);

        let gameType = 'NLH';
        if (/PLO|Omaha/i.test(block)) gameType = 'PLO';
        else if (/Mixed/i.test(block)) gameType = 'Mixed';
        else if (/Big-O/i.test(block)) gameType = 'Big-O';

        let format = null;
        if (/turbo/i.test(block)) format = 'Turbo';
        else if (/deep\s*stack/i.test(block)) format = 'Deep Stack';
        else if (/bounty/i.test(block)) format = 'Bounty';
        else if (/freezeout/i.test(block)) format = 'Freezeout';
        else if (/rebuy/i.test(block)) format = 'Rebuy';

        const gtdMatch = block.match(/(?:GTD|Guaranteed)[:\s]*\$?([\d,]+)/i);

        tournaments.push({
            venue_name: venueName,
            day_of_week: dayMatch ? dayMatch[1] : 'Daily',
            start_time: timeMatch[1].toUpperCase().replace(/\s/g, ''),
            buy_in: buyin,
            game_type: gameType,
            format: format,
            guaranteed: gtdMatch ? parseInt(gtdMatch[1].replace(/,/g, '')) : null
        });
    }

    // Deduplicate
    const seen = new Set();
    return tournaments.filter(t => {
        const key = `${t.day_of_week}-${t.start_time}-${t.buy_in}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
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

    const { batch: batchParam, state, force } = req.query;
    const batchNumber = parseInt(batchParam) || 1;

    const stats = {
        success: true,
        batch: batchNumber,
        venuesProcessed: 0,
        tournamentsFound: 0,
        tournamentsUpserted: 0,
        errors: [],
        skipped: 0,
        startedAt: new Date().toISOString()
    };

    try {
        // ----- Load venue list from JSON -----
        const venuesData = loadJsonFile(VENUES_JSON_PATH);
        if (!venuesData || !venuesData.venues) {
            return res.status(500).json({
                success: false,
                error: 'Could not load all-venues.json'
            });
        }

        // Filter to venues with tournaments
        let tournamentVenues = venuesData.venues.filter(v => v.has_tournaments === true);

        // Optional: filter by state
        if (state) {
            tournamentVenues = tournamentVenues.filter(v =>
                v.state && v.state.toUpperCase() === state.toUpperCase()
            );
        } else {
            // Apply batch slicing (3-day rotation)
            const batchSize = MAX_VENUES_PER_BATCH;
            const startIdx = (batchNumber - 1) * batchSize;
            const endIdx = Math.min(startIdx + batchSize, tournamentVenues.length);
            tournamentVenues = tournamentVenues.slice(startIdx, endIdx);
        }

        // Cap to max per batch
        tournamentVenues = tournamentVenues.slice(0, MAX_VENUES_PER_BATCH);

        // ----- Load existing schedules JSON (for fallback writes) -----
        let schedulesData = loadJsonFile(SCHEDULES_JSON_PATH);
        if (!schedulesData) {
            schedulesData = {
                metadata: {
                    description: 'Daily/Recurring Tournament Schedules for Verified Venues',
                    lastUpdated: new Date().toISOString().split('T')[0],
                    totalVenues: 0,
                    venuesWithDailyTournaments: 0,
                    sources: ['Auto-scraper cron job']
                },
                tournaments: []
            };
        }

        // Index existing schedules by venue_name for quick lookup
        const schedulesByVenue = {};
        for (const entry of schedulesData.tournaments) {
            schedulesByVenue[entry.venue_name] = entry;
        }

        // ----- Process each venue -----
        for (let i = 0; i < tournamentVenues.length; i++) {
            const venue = tournamentVenues[i];
            stats.venuesProcessed++;

            // Determine scrape URL
            const pokerAtlasUrl = venue.poker_atlas_url;
            const website = venue.website;

            if (!pokerAtlasUrl && !website) {
                stats.skipped++;
                continue;
            }

            // Skip if recently scraped (unless force=true)
            if (force !== 'true' && schedulesByVenue[venue.name]) {
                const existing = schedulesByVenue[venue.name];
                if (existing.last_scraped) {
                    const lastScraped = new Date(existing.last_scraped);
                    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
                    if (lastScraped > oneDayAgo) {
                        stats.skipped++;
                        continue;
                    }
                }
            }

            let tournaments = [];
            let sourceUrl = '';

            try {
                // Strategy 1: Try PokerAtlas first (most structured data)
                if (pokerAtlasUrl) {
                    let paUrl = pokerAtlasUrl;
                    if (!paUrl.endsWith('/tournaments')) {
                        paUrl = paUrl.replace(/\/$/, '') + '/tournaments';
                    }

                    try {
                        const html = await fetchUrl(paUrl);
                        tournaments = parsePokerAtlasTournaments(html, venue.name);
                        sourceUrl = paUrl;
                    } catch (paError) {
                        // PokerAtlas failed, fall through to direct website
                    }
                }

                // Strategy 2: Try direct venue website
                if (tournaments.length === 0 && website) {
                    let baseUrl = website;
                    if (!baseUrl.startsWith('http')) {
                        baseUrl = 'https://' + baseUrl;
                    }

                    const paths = ['', '/poker', '/poker/tournaments', '/tournaments', '/poker-room'];
                    for (const pathSuffix of paths) {
                        try {
                            const tryUrl = baseUrl.replace(/\/$/, '') + pathSuffix;
                            const html = await fetchUrl(tryUrl);
                            const parsed = parseDirectWebsiteTournaments(html, venue.name);
                            if (parsed.length > 0) {
                                tournaments = parsed;
                                sourceUrl = tryUrl;
                                break;
                            }
                        } catch (_) {
                            // Try next path
                        }
                    }
                }

                stats.tournamentsFound += tournaments.length;

                if (tournaments.length > 0) {
                    // ----- Upsert to Supabase if available -----
                    if (supabase) {
                        for (const tournament of tournaments) {
                            try {
                                const record = {
                                    venue_name: tournament.venue_name,
                                    day_of_week: tournament.day_of_week,
                                    start_time: tournament.start_time,
                                    buy_in: tournament.buy_in,
                                    game_type: tournament.game_type,
                                    format: tournament.format,
                                    guaranteed: tournament.guaranteed,
                                    source_url: sourceUrl,
                                    last_scraped: new Date().toISOString(),
                                    is_active: true
                                };

                                // Include venue_id if we can resolve it
                                if (venue.id) record.venue_id = venue.id;

                                const { error: upsertError } = await supabase
                                    .from('venue_daily_tournaments')
                                    .upsert(record, {
                                        onConflict: 'venue_id,day_of_week,start_time,buy_in'
                                    });

                                if (!upsertError) stats.tournamentsUpserted++;
                            } catch (_) {
                                // Individual upsert failure is non-fatal
                            }
                        }
                    }

                    // ----- Update JSON file data -----
                    schedulesByVenue[venue.name] = {
                        venue_name: venue.name,
                        city: venue.city,
                        state: venue.state,
                        schedules: tournaments.map(t => ({
                            day_of_week: t.day_of_week,
                            start_time: t.start_time,
                            buy_in: t.buy_in,
                            game_type: t.game_type,
                            format: t.format,
                            guaranteed: t.guaranteed,
                            notes: null
                        })),
                        source_url: sourceUrl,
                        last_scraped: new Date().toISOString()
                    };
                } else {
                    // No tournaments found — mark as checked
                    if (schedulesByVenue[venue.name]) {
                        schedulesByVenue[venue.name].last_scraped = new Date().toISOString();
                    }
                }
            } catch (error) {
                stats.errors.push({
                    venue: venue.name,
                    error: error.message
                });
            }

            // Rate limiting between venues
            if (i < tournamentVenues.length - 1) {
                await sleep(RATE_LIMIT_MS);
            }
        }

        // ----- Write updated schedules back to JSON -----
        const updatedTournaments = Object.values(schedulesByVenue);
        schedulesData.tournaments = updatedTournaments;
        schedulesData.metadata.lastUpdated = new Date().toISOString().split('T')[0];
        schedulesData.metadata.totalVenues = updatedTournaments.length;
        schedulesData.metadata.venuesWithDailyTournaments = updatedTournaments.filter(
            v => v.schedules && v.schedules.length > 0
        ).length;

        const saved = saveJsonFile(SCHEDULES_JSON_PATH, schedulesData);
        stats.jsonSaved = saved;
        stats.finishedAt = new Date().toISOString();

        return res.status(200).json(stats);

    } catch (error) {
        stats.success = false;
        stats.error = error.message;
        stats.finishedAt = new Date().toISOString();
        return res.status(500).json(stats);
    }
}
