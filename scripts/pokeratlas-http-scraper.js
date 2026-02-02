#!/usr/bin/env node
/**
 * PokerAtlas HTTP Daily Tournament Scraper
 *
 * SOURCE OF TRUTH: data/tournament-venues.json (178 verified venues)
 * TARGET: venue_daily_tournaments table in Supabase
 *
 * Uses native HTTP requests (no Puppeteer/Chrome required)
 *
 * Usage:
 *   node scripts/pokeratlas-http-scraper.js                    # Scrape all venues
 *   node scripts/pokeratlas-http-scraper.js --state NV         # Nevada only
 *   node scripts/pokeratlas-http-scraper.js --limit 10         # First 10 venues
 *   node scripts/pokeratlas-http-scraper.js --dry-run          # Test without DB writes
 */

const https = require('https');
const http = require('http');
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

require('dotenv').config({ path: '.env.local' });

// =============================================================================
// CONFIGURATION
// =============================================================================

const CONFIG = {
    rateLimitMs: 2500,
    requestTimeout: 20000,
    maxRetries: 2,
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
};

// =============================================================================
// LOAD SOURCE OF TRUTH
// =============================================================================

const VENUES_FILE = path.join(__dirname, '../data/tournament-venues.json');
let SOURCE_VENUES = { venues: [], metadata: {} };

try {
    SOURCE_VENUES = JSON.parse(fs.readFileSync(VENUES_FILE, 'utf8'));
    console.log(`[INIT] Loaded ${SOURCE_VENUES.venues.length} venues from source of truth`);
} catch (e) {
    console.error('[FATAL] Could not load tournament-venues.json:', e.message);
    process.exit(1);
}

// =============================================================================
// HTTP SCRAPER CLASS
// =============================================================================

class PokerAtlasHttpScraper {
    constructor(options = {}) {
        this.options = options;
        this.supabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL,
            process.env.SUPABASE_SERVICE_ROLE_KEY
        );

        this.stats = {
            venuesProcessed: 0,
            venuesWithTournaments: 0,
            venuesSkipped: 0,
            venuesFailed: 0,
            tournamentsFound: 0,
            tournamentsInserted: 0,
            errors: [],
            startTime: new Date()
        };
    }

    /**
     * Fetch URL with retry logic
     */
    async fetchUrl(url, retries = CONFIG.maxRetries) {
        const protocol = url.startsWith('https') ? https : http;

        return new Promise((resolve, reject) => {
            const request = protocol.get(url, {
                headers: {
                    'User-Agent': CONFIG.userAgent,
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                    'Accept-Language': 'en-US,en;q=0.9',
                    'Accept-Encoding': 'identity',
                    'Cache-Control': 'no-cache'
                }
            }, (response) => {
                // Handle redirects
                if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
                    let redirectUrl = response.headers.location;
                    if (!redirectUrl.startsWith('http')) {
                        const urlObj = new URL(url);
                        redirectUrl = `${urlObj.protocol}//${urlObj.host}${redirectUrl}`;
                    }
                    console.log(`  [REDIRECT] -> ${redirectUrl}`);
                    return this.fetchUrl(redirectUrl, retries).then(resolve).catch(reject);
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
                    console.log(`  [RETRY] ${error.message} - ${retries} attempts left`);
                    await this.sleep(2000);
                    this.fetchUrl(url, retries - 1).then(resolve).catch(reject);
                } else {
                    reject(error);
                }
            });

            request.setTimeout(CONFIG.requestTimeout, () => {
                request.destroy();
                reject(new Error('Request timeout'));
            });
        });
    }

    /**
     * Parse PokerAtlas tournament schedule from HTML
     */
    parseTournaments(html, venue) {
        const tournaments = [];

        // Split by table rows
        const rows = html.split(/<tr[^>]*>/gi);

        for (const row of rows) {
            // Skip rows without dollar amounts
            if (!row.includes('$')) continue;
            // Skip header rows
            if (row.includes('<th')) continue;

            // Extract cell contents
            const cells = [];
            const cellMatches = row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi);
            for (const match of cellMatches) {
                const cellText = match[1]
                    .replace(/<[^>]+>/g, ' ')
                    .replace(/&nbsp;/g, ' ')
                    .replace(/&amp;/g, '&')
                    .replace(/\s+/g, ' ')
                    .trim();
                cells.push(cellText);
            }

            if (cells.length < 2) continue;

            const fullText = cells.join(' ');

            // Extract buy-in (required)
            const buyinMatch = fullText.match(/\$(\d{1,3}(?:,\d{3})*)/);
            if (!buyinMatch) continue;

            const buyin = parseInt(buyinMatch[1].replace(/,/g, ''));
            if (buyin < 10 || buyin > 50000) continue;

            // Extract time (required)
            const timeMatch = fullText.match(/(\d{1,2}:\d{2}\s*(?:AM|PM|am|pm))/i);
            if (!timeMatch) continue;

            // Extract day of week
            const dayMatch = fullText.match(/(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|Mon|Tue|Wed|Thu|Fri|Sat|Sun|Daily|Everyday)/i);
            let dayOfWeek = 'Daily';
            if (dayMatch) {
                const dayMap = {
                    'mon': 'Monday', 'tue': 'Tuesday', 'wed': 'Wednesday',
                    'thu': 'Thursday', 'fri': 'Friday', 'sat': 'Saturday',
                    'sun': 'Sunday', 'everyday': 'Daily'
                };
                const shortDay = dayMatch[1].toLowerCase().substring(0, 3);
                dayOfWeek = dayMap[shortDay] || dayMatch[1];
            }

            // Extract guaranteed
            const gtdMatch = fullText.match(/(?:GTD|Guaranteed|G\s*=)[:\s]*\$?([\d,]+)/i);
            const guaranteed = gtdMatch ? parseInt(gtdMatch[1].replace(/,/g, '')) : null;

            // Extract game type
            let gameType = 'NLH';
            if (/\bPLO\b|Pot.?Limit.?Omaha/i.test(fullText)) gameType = 'PLO';
            else if (/\bOmaha\b/i.test(fullText) && !/Hold/i.test(fullText)) gameType = 'Omaha';
            else if (/mixed|horse|8-game/i.test(fullText)) gameType = 'Mixed';

            // Extract format
            let format = null;
            if (/turbo/i.test(fullText)) format = 'Turbo';
            else if (/deep.?stack/i.test(fullText)) format = 'Deep Stack';
            else if (/bounty|knockout/i.test(fullText)) format = 'Bounty';
            else if (/rebuy/i.test(fullText)) format = 'Rebuy';

            // Extract starting stack
            const stackMatch = fullText.match(/(\d{1,3}(?:,\d{3})*)\s*(?:chips|starting)/i);
            const startingStack = stackMatch ? parseInt(stackMatch[1].replace(/,/g, '')) : null;

            // Extract blind levels
            const blindMatch = fullText.match(/(\d+)\s*(?:min|minute)/i);
            const blindLevels = blindMatch ? `${blindMatch[1]} min` : null;

            // Extract tournament name
            let tournamentName = null;
            for (const cell of cells) {
                if (cell.length > 5 && cell.length < 100 &&
                    !/^\$?\d/.test(cell) && !/^\d{1,2}:/.test(cell) &&
                    !/(Mon|Tue|Wed|Thu|Fri|Sat|Sun|Daily)/i.test(cell)) {
                    tournamentName = cell;
                    break;
                }
            }

            tournaments.push({
                venue_name: venue.name,
                day_of_week: dayOfWeek,
                start_time: timeMatch[1].toUpperCase().replace(/\s+/g, ''),
                buy_in: buyin,
                game_type: gameType,
                format: format,
                guaranteed: guaranteed,
                starting_stack: startingStack,
                blind_levels: blindLevels,
                tournament_name: tournamentName
            });
        }

        // Also try to find tournament info in divs/spans
        const textBlocks = html.split(/(?=\$\d)/);
        for (const block of textBlocks) {
            if (block.length > 1000) continue;

            const cleanBlock = block.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
            const buyinMatch = cleanBlock.match(/\$(\d{1,3}(?:,\d{3})*)/);
            const timeMatch = cleanBlock.match(/(\d{1,2}:\d{2}\s*(?:AM|PM))/i);

            if (buyinMatch && timeMatch) {
                const buyin = parseInt(buyinMatch[1].replace(/,/g, ''));
                if (buyin >= 10 && buyin <= 50000) {
                    const dayMatch = cleanBlock.match(/(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|Daily)/i);
                    const key = `${timeMatch[1].toUpperCase()}-${buyin}`;
                    const exists = tournaments.some(t => `${t.start_time}-${t.buy_in}` === key);

                    if (!exists) {
                        tournaments.push({
                            venue_name: venue.name,
                            day_of_week: dayMatch ? dayMatch[1] : 'Daily',
                            start_time: timeMatch[1].toUpperCase().replace(/\s+/g, ''),
                            buy_in: buyin,
                            game_type: /PLO|Omaha/i.test(cleanBlock) ? 'PLO' : 'NLH',
                            format: /turbo/i.test(cleanBlock) ? 'Turbo' : null,
                            guaranteed: null,
                            starting_stack: null,
                            blind_levels: null,
                            tournament_name: null
                        });
                    }
                }
            }
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

    /**
     * Scrape a single venue
     */
    async scrapeVenue(venue) {
        let url = venue.pokerAtlasUrl;
        if (!url) {
            console.log(`  [SKIP] No PokerAtlas URL`);
            this.stats.venuesSkipped++;
            return [];
        }

        // Append /tournaments
        url = url.replace(/\/$/, '');
        if (!url.endsWith('/tournaments')) {
            url += '/tournaments';
        }

        try {
            console.log(`  [FETCH] ${url}`);
            const html = await this.fetchUrl(url);

            const tournaments = this.parseTournaments(html, venue);
            console.log(`  [FOUND] ${tournaments.length} tournaments`);

            return tournaments;

        } catch (error) {
            console.log(`  [ERROR] ${error.message}`);
            this.stats.errors.push({ venue: venue.name, url, error: error.message });
            this.stats.venuesFailed++;
            return [];
        }
    }

    /**
     * Insert tournaments into database
     */
    async insertTournaments(tournaments, sourceUrl) {
        if (this.options.dryRun) {
            console.log(`  [DRY-RUN] Would insert ${tournaments.length} tournaments`);
            return tournaments.length;
        }

        let inserted = 0;

        for (const t of tournaments) {
            const record = {
                venue_name: t.venue_name,
                day_of_week: t.day_of_week,
                start_time: t.start_time,
                buy_in: t.buy_in,
                game_type: t.game_type,
                format: t.format,
                guaranteed: t.guaranteed,
                starting_stack: t.starting_stack,
                blind_levels: t.blind_levels,
                tournament_name: t.tournament_name,
                source_url: sourceUrl,
                last_scraped: new Date().toISOString(),
                is_active: true
            };

            const { error } = await this.supabase
                .from('venue_daily_tournaments')
                .upsert(record, {
                    onConflict: 'venue_name,day_of_week,start_time,buy_in',
                    ignoreDuplicates: false
                });

            if (!error) {
                inserted++;
            } else if (!error.message?.includes('duplicate')) {
                console.log(`  [DB-ERROR] ${error.message}`);
            }
        }

        return inserted;
    }

    /**
     * Get venues to scrape based on options
     */
    getVenuesToScrape() {
        let venues = [...SOURCE_VENUES.venues];

        if (this.options.state) {
            const state = this.options.state.toUpperCase();
            venues = venues.filter(v => v.state === state);
            console.log(`[FILTER] State: ${state} (${venues.length} venues)`);
        }

        if (this.options.venue) {
            const search = this.options.venue.toLowerCase();
            venues = venues.filter(v => v.name.toLowerCase().includes(search));
            console.log(`[FILTER] Venue: "${this.options.venue}" (${venues.length} venues)`);
        }

        venues = venues.filter(v => v.pokerAtlasUrl);
        console.log(`[FILTER] With PokerAtlas URLs: ${venues.length} venues`);

        if (this.options.limit) {
            const limit = parseInt(this.options.limit);
            venues = venues.slice(0, limit);
            console.log(`[FILTER] Limit: ${limit} venues`);
        }

        return venues;
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Main execution
     */
    async run() {
        console.log('\n' + '='.repeat(70));
        console.log('POKERATLAS HTTP DAILY TOURNAMENT SCRAPER');
        console.log('='.repeat(70));
        console.log(`Source of Truth: data/tournament-venues.json`);
        console.log(`Total Verified Venues: ${SOURCE_VENUES.metadata.totalVenues}`);
        console.log(`Started: ${this.stats.startTime.toISOString()}`);
        if (this.options.dryRun) console.log('MODE: DRY RUN (no database writes)');
        console.log('='.repeat(70) + '\n');

        const venues = this.getVenuesToScrape();
        console.log(`\n[START] Processing ${venues.length} venues...\n`);

        for (let i = 0; i < venues.length; i++) {
            const venue = venues[i];
            this.stats.venuesProcessed++;

            console.log(`[${i + 1}/${venues.length}] ${venue.name} (${venue.city}, ${venue.state})`);

            const tournaments = await this.scrapeVenue(venue);
            this.stats.tournamentsFound += tournaments.length;

            if (tournaments.length > 0) {
                this.stats.venuesWithTournaments++;
                const sourceUrl = venue.pokerAtlasUrl.replace(/\/$/, '') + '/tournaments';
                const inserted = await this.insertTournaments(tournaments, sourceUrl);
                this.stats.tournamentsInserted += inserted;
                console.log(`  [SAVED] ${inserted} tournaments to database`);
            }

            // Rate limiting
            if (i < venues.length - 1) {
                await this.sleep(CONFIG.rateLimitMs);
            }
        }

        this.printReport();
        return this.stats;
    }

    printReport() {
        const duration = (new Date() - this.stats.startTime) / 1000;

        console.log('\n' + '='.repeat(70));
        console.log('SCRAPER REPORT');
        console.log('='.repeat(70));
        console.log(`Duration:                ${Math.round(duration)}s`);
        console.log(`Venues Processed:        ${this.stats.venuesProcessed}`);
        console.log(`Venues with Tournaments: ${this.stats.venuesWithTournaments}`);
        console.log(`Venues Skipped:          ${this.stats.venuesSkipped}`);
        console.log(`Venues Failed:           ${this.stats.venuesFailed}`);
        console.log(`Tournaments Found:       ${this.stats.tournamentsFound}`);
        console.log(`Tournaments Inserted:    ${this.stats.tournamentsInserted}`);

        if (this.stats.errors.length > 0) {
            console.log('\nErrors:');
            this.stats.errors.slice(0, 10).forEach(e => {
                console.log(`  - ${e.venue}: ${e.error}`);
            });
            if (this.stats.errors.length > 10) {
                console.log(`  ... and ${this.stats.errors.length - 10} more errors`);
            }
        }

        console.log('='.repeat(70));
        console.log(`Completed: ${new Date().toISOString()}`);
        console.log('='.repeat(70) + '\n');
    }
}

// =============================================================================
// CLI
// =============================================================================

function parseArgs() {
    const args = process.argv.slice(2);
    const options = {};

    for (let i = 0; i < args.length; i++) {
        switch (args[i]) {
            case '--state':
                options.state = args[++i];
                break;
            case '--venue':
                options.venue = args[++i];
                break;
            case '--limit':
                options.limit = args[++i];
                break;
            case '--dry-run':
                options.dryRun = true;
                break;
            case '--help':
                console.log(`
PokerAtlas HTTP Daily Tournament Scraper

Usage:
  node scripts/pokeratlas-http-scraper.js [options]

Options:
  --state <ST>     Filter by state (e.g., NV, TX, CA)
  --venue <name>   Filter by venue name
  --limit <n>      Limit to first N venues
  --dry-run        Don't write to database
  --help           Show this help
                `);
                process.exit(0);
        }
    }

    return options;
}

// Run
if (require.main === module) {
    const options = parseArgs();
    const scraper = new PokerAtlasHttpScraper(options);

    scraper.run()
        .then(stats => {
            process.exit(stats.venuesFailed > stats.venuesProcessed / 2 ? 1 : 0);
        })
        .catch(error => {
            console.error('[FATAL]', error);
            process.exit(1);
        });
}

module.exports = PokerAtlasHttpScraper;
