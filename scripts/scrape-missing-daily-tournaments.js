#!/usr/bin/env node
/**
 * Scrape Missing Daily Tournament Schedules
 *
 * Fetches daily tournament data from PokerAtlas for venues that have
 * tournaments but are missing daily schedule data.
 *
 * Reads the master CSV of verified venues and cross-references against
 * the existing daily-tournament-schedules.json to find gaps. For each
 * missing venue with a PokerAtlas URL, fetches the /tournaments page
 * and parses the HTML table for schedule data.
 *
 * Usage:
 *   node scripts/scrape-missing-daily-tournaments.js                  # Scrape all missing
 *   node scripts/scrape-missing-daily-tournaments.js --dry-run        # Preview without fetching
 *   node scripts/scrape-missing-daily-tournaments.js --state=TX       # Texas venues only
 *   node scripts/scrape-missing-daily-tournaments.js --state=NV       # Nevada venues only
 *   node scripts/scrape-missing-daily-tournaments.js --limit=10       # First 10 missing venues
 *   node scripts/scrape-missing-daily-tournaments.js --venue="Bellagio"  # Single venue
 *   node scripts/scrape-missing-daily-tournaments.js --dry-run --state=CA
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

// =============================================================================
// PATHS & CONSTANTS
// =============================================================================

const DATA_DIR = path.join(__dirname, '..', 'data');
const DAILY_FILE = path.join(DATA_DIR, 'daily-tournament-schedules.json');
const CSV_FILE = path.join(DATA_DIR, 'verified-venues-master.csv');
const RATE_LIMIT_MS = 3000;

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// =============================================================================
// ARGUMENT PARSING
// =============================================================================

function parseArgs() {
    const args = process.argv.slice(2);
    const options = {
        dryRun: false,
        state: null,
        limit: null,
        venue: null,
    };

    for (const arg of args) {
        if (arg === '--dry-run') {
            options.dryRun = true;
        } else if (arg.startsWith('--state=')) {
            options.state = arg.split('=')[1].toUpperCase();
        } else if (arg.startsWith('--limit=')) {
            options.limit = parseInt(arg.split('=')[1], 10);
        } else if (arg.startsWith('--venue=')) {
            options.venue = arg.split('=')[1].replace(/^["']|["']$/g, '');
        } else if (arg === '--help' || arg === '-h') {
            console.log(`
Usage: node scripts/scrape-missing-daily-tournaments.js [options]

Options:
  --dry-run         Show what would be scraped without fetching
  --state=XX        Limit to a specific state (e.g., --state=NV)
  --limit=N         Limit to first N missing venues
  --venue="Name"    Scrape a single venue by name
  --help, -h        Show this help message
`);
            process.exit(0);
        }
    }

    return options;
}

// =============================================================================
// CSV PARSER
// =============================================================================

/**
 * Parse a CSV line handling quoted fields that may contain commas.
 * Returns an array of field values.
 */
function parseCSVLine(line) {
    const fields = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
        const char = line[i];

        if (char === '"') {
            if (inQuotes && i + 1 < line.length && line[i + 1] === '"') {
                // Escaped quote inside quoted field
                current += '"';
                i++;
            } else {
                // Toggle quote mode
                inQuotes = !inQuotes;
            }
        } else if (char === ',' && !inQuotes) {
            fields.push(current.trim());
            current = '';
        } else {
            current += char;
        }
    }

    // Push the last field
    fields.push(current.trim());
    return fields;
}

/**
 * Parse the verified-venues-master.csv file.
 * Returns an array of venue objects with normalized field names.
 */
function parseCSV(filePath) {
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n').filter(line => line.trim());

    if (lines.length === 0) {
        throw new Error('CSV file is empty');
    }

    // Parse header row
    const headers = parseCSVLine(lines[0]);
    const headerMap = {};
    headers.forEach((h, i) => {
        headerMap[h.trim().toUpperCase()] = i;
    });

    // Verify required columns exist
    const required = ['VENUE', 'TOURNAMENTS'];
    for (const col of required) {
        if (!(col in headerMap)) {
            throw new Error(`Required column "${col}" not found in CSV. Found: ${headers.join(', ')}`);
        }
    }

    const venues = [];

    for (let i = 1; i < lines.length; i++) {
        const fields = parseCSVLine(lines[i]);
        if (fields.length < 2) continue;

        const venue = {
            name: fields[headerMap['VENUE']] || '',
            website: fields[headerMap['WEBSITE']] || '',
            address: fields[headerMap['ADDRESS']] || '',
            city: fields[headerMap['CITY']] || '',
            state: fields[headerMap['STATE']] || '',
            phone: fields[headerMap['PHONE']] || '',
            type: fields[headerMap['TYPE']] || '',
            tournaments: fields[headerMap['TOURNAMENTS']] || '',
            pokerAtlasUrl: fields[headerMap['POKERATLASURL']] || '',
            hours: fields[headerMap['HOURS']] || '',
        };

        venues.push(venue);
    }

    return venues;
}

// =============================================================================
// JSON FILE MANAGEMENT
// =============================================================================

/**
 * Load the existing daily tournament schedules JSON file.
 */
function loadDailySchedules(filePath) {
    try {
        const content = fs.readFileSync(filePath, 'utf8');
        return JSON.parse(content);
    } catch (e) {
        console.error(`[ERROR] Failed to load ${filePath}: ${e.message}`);
        return {
            metadata: {
                description: 'Daily/Recurring Tournament Schedules for Verified Venues',
                lastUpdated: new Date().toISOString().split('T')[0],
                totalVenues: 0,
                venuesWithDailyTournaments: 0,
                sources: ['PokerAtlas', 'Direct venue websites']
            },
            tournaments: [],
            venuesWithoutDailyTournaments: [],
            texasCardRoomsAdditional: [],
            michiganCharityRooms: [],
            californiaCardRoomsAdditional: []
        };
    }
}

/**
 * Save the daily tournament schedules JSON file.
 */
function saveDailySchedules(filePath, data) {
    // Update metadata
    data.metadata.lastUpdated = new Date().toISOString().split('T')[0];
    data.metadata.venuesWithDailyTournaments = data.tournaments.length;

    const json = JSON.stringify(data, null, 2);
    fs.writeFileSync(filePath, json + '\n', 'utf8');
}

// =============================================================================
// VENUE NAME MATCHING
// =============================================================================

/**
 * Normalize a venue name for fuzzy comparison.
 * Strips common suffixes, lowercases, removes non-alphanumeric chars.
 */
function normalizeVenueName(name) {
    if (!name) return '';
    return name
        .toLowerCase()
        .replace(/\b(resort|casino|hotel|spa|club|room|poker|card|house|social)\b/gi, '')
        .replace(/[^a-z0-9]/g, '')
        .trim();
}

/**
 * Check if a venue name from the CSV already has actual schedule data
 * in the JSON tournaments array. Only checks the `tournaments` array
 * (which contains real schedule data), NOT the placeholder arrays like
 * venuesWithoutDailyTournaments, texasCardRoomsAdditional, etc.
 * Those placeholder arrays contain venues that NEED schedules scraped.
 *
 * Uses exact match first, then normalized fuzzy match.
 */
function venueExistsInSchedules(csvVenueName, csvCity, csvState, dailyData) {
    const csvNameLower = csvVenueName.toLowerCase();
    const csvNormalized = normalizeVenueName(csvVenueName);

    // Only check the main tournaments array (venues with actual schedule data)
    for (const entry of dailyData.tournaments) {
        // Exact case-insensitive match
        if (entry.venue_name.toLowerCase() === csvNameLower) return true;

        // Normalized fuzzy match (must also match state to avoid false positives)
        const entryNormalized = normalizeVenueName(entry.venue_name);
        if (entryNormalized === csvNormalized && entry.state === csvState) return true;

        // Also check if the CSV name contains the JSON name or vice versa
        // (handles cases like "Central Valley Gaming (Turlock Poker Room)" matching "Turlock Poker Room")
        if (entry.state === csvState) {
            const csvWords = csvNameLower.replace(/[()]/g, '').split(/\s+/);
            const entryWords = entry.venue_name.toLowerCase().split(/\s+/);
            // If the entry name appears fully within the CSV name
            if (csvNameLower.includes(entry.venue_name.toLowerCase())) return true;
            if (entry.venue_name.toLowerCase().includes(csvNameLower)) return true;
        }
    }

    return false;
}

// =============================================================================
// HTTP FETCHING
// =============================================================================

/**
 * Sleep for a given number of milliseconds.
 */
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Fetch a URL using native https/http modules.
 * Follows redirects and retries on failure.
 */
function fetchUrl(url, retries = 3) {
    const protocol = url.startsWith('https') ? https : http;

    return new Promise((resolve, reject) => {
        const request = protocol.get(url, {
            headers: {
                'User-Agent': USER_AGENT,
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.9',
                'Accept-Encoding': 'identity',
                'Connection': 'keep-alive',
                'Cache-Control': 'no-cache'
            }
        }, (response) => {
            // Follow redirects (301, 302, 303, 307, 308)
            if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
                let redirectUrl = response.headers.location;
                if (!redirectUrl.startsWith('http')) {
                    const urlObj = new URL(url);
                    redirectUrl = `${urlObj.protocol}//${urlObj.host}${redirectUrl}`;
                }
                return fetchUrl(redirectUrl, retries).then(resolve).catch(reject);
            }

            if (response.statusCode !== 200) {
                reject(new Error(`HTTP ${response.statusCode} for ${url}`));
                return;
            }

            let data = '';
            response.on('data', chunk => data += chunk);
            response.on('end', () => resolve(data));
            response.on('error', reject);
        });

        request.on('error', async (error) => {
            if (retries > 0) {
                await sleep(1000);
                fetchUrl(url, retries - 1).then(resolve).catch(reject);
            } else {
                reject(error);
            }
        });

        request.setTimeout(15000, () => {
            request.destroy();
            reject(new Error(`Timeout fetching ${url}`));
        });
    });
}

// =============================================================================
// HTML PARSING - POKERATLAS TOURNAMENT TABLES
// =============================================================================

/**
 * Parse PokerAtlas tournament HTML to extract daily schedule data.
 *
 * PokerAtlas tournament pages typically contain HTML tables with columns for:
 * - Day of week
 * - Start time
 * - Buy-in amount (with $ sign)
 * - Game type (NLH, PLO, etc.)
 * - Format (Turbo, Deep Stack, Bounty, etc.)
 * - Guaranteed prize pool
 *
 * This parser handles both table-based and div-based layouts.
 */
function parsePokerAtlasTournaments(html, venueName) {
    const tournaments = [];

    // Strategy 1: Parse HTML table rows (<tr> with <td> cells)
    const tableRows = html.split(/<tr[^>]*>/gi);

    for (const row of tableRows) {
        // Skip header rows and rows without dollar amounts
        if (!row.includes('$') || row.includes('<th')) continue;

        // Extract cell contents
        const cells = [];
        const cellMatches = row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi);
        for (const match of cellMatches) {
            // Strip HTML tags, normalize whitespace
            cells.push(match[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
        }

        if (cells.length < 2) continue;

        const fullText = cells.join(' ');
        const tournament = extractTournamentFromText(fullText);
        if (tournament) {
            tournaments.push(tournament);
        }
    }

    // Strategy 2: If no table rows found, try div-based layout
    if (tournaments.length === 0) {
        const divBlocks = html.split(/<div[^>]*class="[^"]*(?:tournament|event|schedule)[^"]*"[^>]*>/gi);
        for (const block of divBlocks) {
            if (!block.includes('$')) continue;
            const text = block.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
            if (text.length > 1000) continue; // Skip overly large blocks

            const tournament = extractTournamentFromText(text);
            if (tournament) {
                tournaments.push(tournament);
            }
        }
    }

    // Strategy 3: If still nothing, try splitting stripped text on dollar signs
    if (tournaments.length === 0) {
        const plainText = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
        const dollarBlocks = plainText.split(/(?=\$\d)/);

        for (const block of dollarBlocks) {
            if (block.length > 500) continue;
            const tournament = extractTournamentFromText(block);
            if (tournament) {
                tournaments.push(tournament);
            }
        }
    }

    // Deduplicate by day + time + buy-in
    const seen = new Set();
    return tournaments.filter(t => {
        const key = `${t.day_of_week}-${t.start_time}-${t.buy_in}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

/**
 * Extract a single tournament entry from a text fragment.
 * Returns null if the text doesn't contain valid tournament data.
 */
function extractTournamentFromText(text) {
    // Must have a buy-in dollar amount
    const buyinMatch = text.match(/\$(\d{1,3}(?:,\d{3})*)/);
    if (!buyinMatch) return null;

    const buyin = parseInt(buyinMatch[1].replace(/,/g, ''), 10);
    // Sanity check: buy-ins typically range from $10 to $50,000
    if (buyin < 10 || buyin > 50000) return null;

    // Must have a time
    const timeMatch = text.match(/(\d{1,2}:\d{2}\s*(?:AM|PM|am|pm|a\.m\.|p\.m\.)?)/i);
    if (!timeMatch) return null;

    // Normalize time format
    let startTime = timeMatch[1]
        .toUpperCase()
        .replace(/\s/g, '')
        .replace(/\.M\./g, 'M')
        .replace(/A\.M/g, 'AM')
        .replace(/P\.M/g, 'PM');

    // Ensure AM/PM is present - if time has no AM/PM suffix, try to infer
    if (!/[AP]M$/.test(startTime)) {
        const hour = parseInt(startTime.split(':')[0], 10);
        // Heuristic: hours 1-6 are likely PM for poker tournaments
        startTime += (hour >= 1 && hour <= 6) ? 'PM' : 'AM';
    }

    // Format nicely: "10:00AM" -> "10:00 AM"
    startTime = startTime.replace(/(\d)(AM|PM)/, '$1 $2');

    // Day of week
    const dayMatch = text.match(/(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|Mon|Tue|Wed|Thu|Fri|Sat|Sun|Daily)/i);
    let dayOfWeek = 'Daily';
    if (dayMatch) {
        const dayMap = {
            'mon': 'Monday', 'tue': 'Tuesday', 'wed': 'Wednesday',
            'thu': 'Thursday', 'fri': 'Friday', 'sat': 'Saturday', 'sun': 'Sunday',
            'monday': 'Monday', 'tuesday': 'Tuesday', 'wednesday': 'Wednesday',
            'thursday': 'Thursday', 'friday': 'Friday', 'saturday': 'Saturday',
            'sunday': 'Sunday', 'daily': 'Daily'
        };
        dayOfWeek = dayMap[dayMatch[1].toLowerCase()] || dayMatch[1];
    }

    // Guaranteed prize pool
    const gtdMatch = text.match(/(?:GTD|Guaranteed|guarantee)[:\s]*\$?([\d,]+)/i)
        || text.match(/\$?([\d,]+)\s*(?:GTD|Guaranteed)/i);
    let guaranteed = null;
    if (gtdMatch) {
        guaranteed = parseInt(gtdMatch[1].replace(/,/g, ''), 10);
        // Sanity check: guaranteed should differ from buy-in and be reasonable
        if (guaranteed === buyin || guaranteed < 100 || guaranteed > 5000000) {
            guaranteed = null;
        }
    }

    // Game type detection
    let gameType = 'NLH';
    if (/\bPLO\b/i.test(text)) gameType = 'PLO';
    else if (/\bPot.?Limit\s+Omaha\b/i.test(text)) gameType = 'PLO';
    else if (/\bOmaha\b/i.test(text) && !/\bNLH\b/i.test(text)) gameType = 'Omaha';
    else if (/\bBig[\s-]?O\b/i.test(text)) gameType = 'Big-O';
    else if (/\bMixed\b/i.test(text)) gameType = 'Mixed';
    else if (/\bH\.?O\.?R\.?S\.?E\.?\b/i.test(text)) gameType = 'HORSE';
    else if (/\bStud\b/i.test(text)) gameType = 'Stud';
    else if (/\bLimit\s+Hold/i.test(text) && !/\bNo[\s-]?Limit/i.test(text)) gameType = 'LHE';

    // Format/variant detection
    let format = null;
    if (/\bturbo\b/i.test(text)) format = 'Turbo';
    else if (/\bsuper\s*turbo\b/i.test(text)) format = 'Super Turbo';
    else if (/\bdeep\s*stack\b/i.test(text)) format = 'Deep Stack';
    else if (/\bmystery\s*bounty\b/i.test(text)) format = 'Mystery Bounty';
    else if (/\bbounty\b/i.test(text) || /\bknockout\b/i.test(text)) format = 'Bounty';
    else if (/\bfreeroll\b/i.test(text)) format = 'Freeroll';
    else if (/\bfreeze\s*out\b/i.test(text)) format = 'Freezeout';
    else if (/\brebuy\b/i.test(text)) format = 'Rebuy';
    else if (/\bre-?entry\b/i.test(text)) format = 'Re-entry';
    else if (/\bsatellite\b/i.test(text)) format = 'Satellite';
    else if (/\bcrazy\s*pineapple\b/i.test(text)) format = 'Crazy Pineapple';

    return {
        day_of_week: dayOfWeek,
        start_time: startTime,
        buy_in: buyin,
        game_type: gameType,
        format: format,
        guaranteed: guaranteed,
        notes: null
    };
}

// =============================================================================
// MAIN LOGIC
// =============================================================================

/**
 * Identify venues from CSV that have TOURNAMENTS=Yes but are missing
 * from the daily-tournament-schedules.json.
 */
function findMissingVenues(csvVenues, dailyData, options) {
    const missing = [];
    const seen = new Set(); // Deduplicate by name+state (CSV may have entries in multiple sections)

    for (const venue of csvVenues) {
        // Only venues with tournaments
        if (venue.tournaments.toLowerCase() !== 'yes') continue;

        // Filter by state if specified
        if (options.state && venue.state.toUpperCase() !== options.state) continue;

        // Filter by venue name if specified
        if (options.venue && !venue.name.toLowerCase().includes(options.venue.toLowerCase())) continue;

        // Check if already in the JSON
        if (venueExistsInSchedules(venue.name, venue.city, venue.state, dailyData)) continue;

        // Must have a PokerAtlas URL to scrape
        if (!venue.pokerAtlasUrl || venue.pokerAtlasUrl.trim() === '') continue;

        // Deduplicate by name + state (CSV may list same venue in multiple sections)
        const dedupeKey = `${venue.name.toLowerCase()}|${venue.state}`;
        if (seen.has(dedupeKey)) continue;
        seen.add(dedupeKey);

        missing.push(venue);
    }

    // Apply limit
    if (options.limit && options.limit > 0) {
        return missing.slice(0, options.limit);
    }

    return missing;
}

/**
 * Build the PokerAtlas tournament URL from a venue's base PokerAtlas URL.
 */
function buildTournamentUrl(pokerAtlasUrl) {
    let url = pokerAtlasUrl.trim().replace(/\/$/, '');
    if (!url.endsWith('/tournaments')) {
        url += '/tournaments';
    }
    return url;
}

/**
 * Main entry point.
 */
async function main() {
    const options = parseArgs();

    console.log('='.repeat(70));
    console.log(' Scrape Missing Daily Tournament Schedules');
    console.log('='.repeat(70));
    console.log(`  Mode:     ${options.dryRun ? 'DRY RUN (no fetching)' : 'LIVE'}`);
    if (options.state) console.log(`  State:    ${options.state}`);
    if (options.limit) console.log(`  Limit:    ${options.limit}`);
    if (options.venue) console.log(`  Venue:    ${options.venue}`);
    console.log(`  CSV:      ${CSV_FILE}`);
    console.log(`  JSON:     ${DAILY_FILE}`);
    console.log(`  Rate:     ${RATE_LIMIT_MS}ms between requests`);
    console.log('='.repeat(70));
    console.log('');

    // Step 1: Load CSV data
    console.log('[1/5] Loading verified venues CSV...');
    let csvVenues;
    try {
        csvVenues = parseCSV(CSV_FILE);
        console.log(`       Loaded ${csvVenues.length} venues from CSV`);
    } catch (e) {
        console.error(`[FATAL] Failed to parse CSV: ${e.message}`);
        process.exit(1);
    }

    const tournamentVenues = csvVenues.filter(v => v.tournaments.toLowerCase() === 'yes');
    console.log(`       ${tournamentVenues.length} venues have TOURNAMENTS=Yes`);

    // Step 2: Load existing JSON data
    console.log('[2/5] Loading existing daily tournament schedules...');
    const dailyData = loadDailySchedules(DAILY_FILE);
    console.log(`       ${dailyData.tournaments.length} venues already have schedules`);

    // Step 3: Find missing venues
    console.log('[3/5] Identifying missing venues...');
    const missingVenues = findMissingVenues(csvVenues, dailyData, options);
    console.log(`       ${missingVenues.length} venues need schedules scraped`);
    console.log('');

    if (missingVenues.length === 0) {
        console.log('[DONE] All tournament venues already have schedule data. Nothing to do.');
        process.exit(0);
    }

    // Display the missing venues
    console.log('[4/5] Missing venues to scrape:');
    console.log('-'.repeat(70));
    for (let i = 0; i < missingVenues.length; i++) {
        const v = missingVenues[i];
        const url = buildTournamentUrl(v.pokerAtlasUrl);
        console.log(`  ${String(i + 1).padStart(3)}. ${v.name}`);
        console.log(`       ${v.city}, ${v.state} | ${url}`);
    }
    console.log('-'.repeat(70));
    console.log('');

    // If dry run, stop here
    if (options.dryRun) {
        console.log('[DRY RUN] Would scrape the above venues. Exiting without fetching.');
        console.log('');
        console.log('Summary:');
        console.log(`  Total tournament venues in CSV: ${tournamentVenues.length}`);
        console.log(`  Already have schedules:         ${dailyData.tournaments.length}`);
        console.log(`  Missing (to scrape):            ${missingVenues.length}`);

        // Group by state for overview
        const stateGroups = {};
        for (const v of missingVenues) {
            stateGroups[v.state] = (stateGroups[v.state] || 0) + 1;
        }
        console.log('');
        console.log('  By state:');
        for (const [st, count] of Object.entries(stateGroups).sort((a, b) => b[1] - a[1])) {
            console.log(`    ${st}: ${count}`);
        }

        process.exit(0);
    }

    // Step 5: Scrape each missing venue
    console.log('[5/5] Scraping tournament data...');
    console.log('');

    const stats = {
        attempted: 0,
        succeeded: 0,
        tournamentsFound: 0,
        failed: 0,
        noData: 0,
        errors: []
    };

    for (let i = 0; i < missingVenues.length; i++) {
        const venue = missingVenues[i];
        const url = buildTournamentUrl(venue.pokerAtlasUrl);
        stats.attempted++;

        const progress = `[${i + 1}/${missingVenues.length}]`;
        console.log(`${progress} Scraping: ${venue.name} (${venue.city}, ${venue.state})`);
        console.log(`          URL: ${url}`);

        try {
            // Fetch the tournament page
            const html = await fetchUrl(url);
            console.log(`          Fetched ${html.length} bytes`);

            // Parse tournaments from HTML
            const tournaments = parsePokerAtlasTournaments(html, venue.name);

            if (tournaments.length > 0) {
                console.log(`          Found ${tournaments.length} tournament(s):`);
                for (const t of tournaments) {
                    const gtd = t.guaranteed ? ` ($${t.guaranteed.toLocaleString()} GTD)` : '';
                    const fmt = t.format ? ` [${t.format}]` : '';
                    console.log(`            - ${t.day_of_week} ${t.start_time}: $${t.buy_in} ${t.game_type}${fmt}${gtd}`);
                }

                // Add to the daily data tournaments array
                const newEntry = {
                    venue_name: venue.name,
                    city: venue.city,
                    state: venue.state,
                    schedules: tournaments,
                    source_url: url
                };

                dailyData.tournaments.push(newEntry);
                stats.succeeded++;
                stats.tournamentsFound += tournaments.length;

                // Write incrementally after each successful venue
                saveDailySchedules(DAILY_FILE, dailyData);
                console.log(`          Saved to JSON (incremental write)`);

            } else {
                console.log(`          No tournament data found in HTML`);
                stats.noData++;

                // Add to venuesWithoutDailyTournaments if not already there
                if (!dailyData.venuesWithoutDailyTournaments) {
                    dailyData.venuesWithoutDailyTournaments = [];
                }
                const alreadyInNoData = dailyData.venuesWithoutDailyTournaments.some(
                    v => v.venue_name.toLowerCase() === venue.name.toLowerCase()
                );
                if (!alreadyInNoData) {
                    dailyData.venuesWithoutDailyTournaments.push({
                        venue_name: venue.name,
                        city: venue.city,
                        state: venue.state,
                        reason: 'No daily tournament data found on PokerAtlas page'
                    });
                    saveDailySchedules(DAILY_FILE, dailyData);
                }
            }

        } catch (error) {
            console.log(`          ERROR: ${error.message}`);
            stats.failed++;
            stats.errors.push({
                venue: venue.name,
                state: venue.state,
                url: url,
                error: error.message
            });
        }

        // Rate limit between requests
        if (i < missingVenues.length - 1) {
            console.log(`          Waiting ${RATE_LIMIT_MS}ms...`);
            await sleep(RATE_LIMIT_MS);
        }

        console.log('');
    }

    // Final summary
    console.log('='.repeat(70));
    console.log(' SCRAPING COMPLETE');
    console.log('='.repeat(70));
    console.log(`  Venues attempted:      ${stats.attempted}`);
    console.log(`  Venues with data:      ${stats.succeeded}`);
    console.log(`  Tournaments found:     ${stats.tournamentsFound}`);
    console.log(`  Venues without data:   ${stats.noData}`);
    console.log(`  Errors/failures:       ${stats.failed}`);
    console.log(`  Total venues in JSON:  ${dailyData.tournaments.length}`);
    console.log('');

    if (stats.errors.length > 0) {
        console.log('  Errors:');
        for (const err of stats.errors) {
            console.log(`    - ${err.venue} (${err.state}): ${err.error}`);
        }
        console.log('');
    }

    console.log(`  Output: ${DAILY_FILE}`);
    console.log('='.repeat(70));
}

// Run
main().catch(err => {
    console.error('[FATAL]', err);
    process.exit(1);
});
