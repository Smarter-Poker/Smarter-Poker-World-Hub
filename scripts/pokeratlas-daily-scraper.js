#!/usr/bin/env node
/**
 * PokerAtlas Daily Tournament Scraper
 *
 * SOURCE OF TRUTH: data/tournament-venues.json (178 verified venues)
 * TARGET: venue_daily_tournaments table in Supabase
 *
 * This scraper fetches REAL tournament schedules from PokerAtlas
 * for all verified venues with daily tournaments.
 *
 * Usage:
 *   node scripts/pokeratlas-daily-scraper.js                    # Scrape all venues
 *   node scripts/pokeratlas-daily-scraper.js --state NV         # Nevada only
 *   node scripts/pokeratlas-daily-scraper.js --state TX         # Texas only
 *   node scripts/pokeratlas-daily-scraper.js --limit 10         # First 10 venues
 *   node scripts/pokeratlas-daily-scraper.js --venue "Bellagio" # Single venue
 *   node scripts/pokeratlas-daily-scraper.js --dry-run          # Test without DB writes
 *
 * Schedule: Run daily via GitHub Actions at 6am UTC
 */

const puppeteer = require('puppeteer');
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

require('dotenv').config({ path: '.env.local' });

// =============================================================================
// CONFIGURATION
// =============================================================================

const CONFIG = {
    // Rate limiting between requests (ms)
    rateLimitMs: 3000,

    // Page load timeout
    pageTimeout: 30000,

    // Max retries per venue
    maxRetries: 2,

    // Batch size for DB inserts
    batchSize: 50,

    // Puppeteer settings
    puppeteer: {
        headless: 'new',
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--disable-gpu',
            '--window-size=1920,1080'
        ]
    }
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
// SCRAPER CLASS
// =============================================================================

class PokerAtlasDailyScraper {
    constructor(options = {}) {
        this.options = options;
        this.browser = null;
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

    async init() {
        console.log('[INIT] Launching Puppeteer browser...');
        this.browser = await puppeteer.launch(CONFIG.puppeteer);
        console.log('[INIT] Browser ready');
    }

    async close() {
        if (this.browser) {
            await this.browser.close();
            console.log('[CLEANUP] Browser closed');
        }
    }

    /**
     * Build the PokerAtlas tournaments URL from the venue's pokerAtlasUrl
     */
    buildTournamentUrl(venue) {
        let url = venue.pokerAtlasUrl;
        if (!url) return null;

        // Ensure /tournaments suffix
        url = url.replace(/\/$/, '');
        if (!url.endsWith('/tournaments')) {
            url += '/tournaments';
        }

        return url;
    }

    /**
     * Scrape a single venue's tournament page
     */
    async scrapeVenue(venue, retryCount = 0) {
        const url = this.buildTournamentUrl(venue);

        if (!url) {
            console.log(`  [SKIP] No PokerAtlas URL for ${venue.name}`);
            this.stats.venuesSkipped++;
            return [];
        }

        const page = await this.browser.newPage();

        // Set realistic browser fingerprint
        await page.setViewport({ width: 1920, height: 1080 });
        await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

        // Block unnecessary resources for faster loading
        await page.setRequestInterception(true);
        page.on('request', req => {
            const resourceType = req.resourceType();
            if (['image', 'stylesheet', 'font', 'media'].includes(resourceType)) {
                req.abort();
            } else {
                req.continue();
            }
        });

        try {
            console.log(`  [FETCH] ${url}`);

            const response = await page.goto(url, {
                waitUntil: 'domcontentloaded',
                timeout: CONFIG.pageTimeout
            });

            if (!response || response.status() !== 200) {
                throw new Error(`HTTP ${response?.status() || 'unknown'}`);
            }

            // Wait for tournament content to load
            await page.waitForSelector('body', { timeout: 5000 });

            // Small delay for JS to render
            await this.sleep(1000);

            // Extract tournament data from the page
            const tournaments = await page.evaluate((venueName, venueCity, venueState) => {
                const results = [];

                // PokerAtlas uses tables for tournament schedules
                // Look for schedule tables
                const tables = document.querySelectorAll('table');

                for (const table of tables) {
                    const rows = table.querySelectorAll('tr');

                    for (const row of rows) {
                        const cells = row.querySelectorAll('td');
                        if (cells.length < 2) continue;

                        const rowText = row.textContent || '';

                        // Must contain a dollar amount (buy-in)
                        const buyinMatch = rowText.match(/\$(\d{1,3}(?:,\d{3})*)/);
                        if (!buyinMatch) continue;

                        const buyin = parseInt(buyinMatch[1].replace(/,/g, ''));
                        if (buyin < 10 || buyin > 50000) continue;

                        // Must contain a time
                        const timeMatch = rowText.match(/(\d{1,2}:\d{2}\s*(?:AM|PM|am|pm))/i);
                        if (!timeMatch) continue;

                        // Extract day of week
                        const dayMatch = rowText.match(/(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|Mon|Tue|Wed|Thu|Fri|Sat|Sun|Daily|Everyday)/i);
                        let dayOfWeek = 'Daily';
                        if (dayMatch) {
                            const dayMap = {
                                'mon': 'Monday', 'tue': 'Tuesday', 'wed': 'Wednesday',
                                'thu': 'Thursday', 'fri': 'Friday', 'sat': 'Saturday',
                                'sun': 'Sunday', 'everyday': 'Daily'
                            };
                            const shortDay = dayMatch[1].toLowerCase().substring(0, 3);
                            dayOfWeek = dayMap[shortDay] || dayMatch[1];
                            if (dayOfWeek.length === 3) {
                                dayOfWeek = dayMap[dayOfWeek.toLowerCase()] || dayOfWeek;
                            }
                        }

                        // Extract guaranteed prize pool
                        const gtdMatch = rowText.match(/(?:GTD|Guaranteed|G\s*=|guarantee)[:\s]*\$?([\d,]+)/i);
                        const guaranteed = gtdMatch ? parseInt(gtdMatch[1].replace(/,/g, '')) : null;

                        // Extract game type
                        let gameType = 'NLH';
                        if (/\bPLO\b|Pot.?Limit.?Omaha/i.test(rowText)) gameType = 'PLO';
                        else if (/\bOmaha\b/i.test(rowText) && !/Hold/i.test(rowText)) gameType = 'Omaha';
                        else if (/\bLimit\b/i.test(rowText) && !/No.?Limit/i.test(rowText)) gameType = 'Limit';
                        else if (/mixed|horse|8-game/i.test(rowText)) gameType = 'Mixed';

                        // Extract format
                        let format = null;
                        if (/turbo/i.test(rowText)) format = 'Turbo';
                        else if (/super.?turbo/i.test(rowText)) format = 'Super Turbo';
                        else if (/deep.?stack/i.test(rowText)) format = 'Deep Stack';
                        else if (/bounty|knockout|ko\b/i.test(rowText)) format = 'Bounty';
                        else if (/rebuy/i.test(rowText)) format = 'Rebuy';
                        else if (/freeze.?out/i.test(rowText)) format = 'Freezeout';

                        // Extract starting stack
                        const stackMatch = rowText.match(/(\d{1,3}(?:,\d{3})*)\s*(?:chips|starting)/i);
                        const startingStack = stackMatch ? parseInt(stackMatch[1].replace(/,/g, '')) : null;

                        // Extract blind levels
                        const blindMatch = rowText.match(/(\d+)\s*(?:min|minute)/i);
                        const blindLevels = blindMatch ? `${blindMatch[1]} min` : null;

                        // Try to extract tournament name from first cell
                        let tournamentName = null;
                        if (cells.length > 0) {
                            const firstCell = cells[0].textContent.trim();
                            if (firstCell.length > 3 && firstCell.length < 100 &&
                                !/^\$?\d/.test(firstCell) && !/^\d{1,2}:/.test(firstCell)) {
                                tournamentName = firstCell;
                            }
                        }

                        results.push({
                            venue_name: venueName,
                            city: venueCity,
                            state: venueState,
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
                }

                // Also check for div-based tournament listings
                const tournamentDivs = document.querySelectorAll('[class*="tournament"], [class*="schedule"], [class*="event"]');
                for (const div of tournamentDivs) {
                    const text = div.textContent || '';

                    const buyinMatch = text.match(/\$(\d{1,3}(?:,\d{3})*)/);
                    const timeMatch = text.match(/(\d{1,2}:\d{2}\s*(?:AM|PM))/i);

                    if (buyinMatch && timeMatch) {
                        const buyin = parseInt(buyinMatch[1].replace(/,/g, ''));
                        if (buyin >= 10 && buyin <= 50000) {
                            const dayMatch = text.match(/(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|Daily)/i);

                            // Check if we already have this tournament
                            const key = `${timeMatch[1]}-${buyin}`;
                            const exists = results.some(r => `${r.start_time}-${r.buy_in}` === key);

                            if (!exists) {
                                results.push({
                                    venue_name: venueName,
                                    city: venueCity,
                                    state: venueState,
                                    day_of_week: dayMatch ? dayMatch[1] : 'Daily',
                                    start_time: timeMatch[1].toUpperCase().replace(/\s+/g, ''),
                                    buy_in: buyin,
                                    game_type: /PLO|Omaha/i.test(text) ? 'PLO' : 'NLH',
                                    format: /turbo/i.test(text) ? 'Turbo' : null,
                                    guaranteed: null,
                                    starting_stack: null,
                                    blind_levels: null,
                                    tournament_name: null
                                });
                            }
                        }
                    }
                }

                return results;
            }, venue.name, venue.city, venue.state);

            // Deduplicate by day/time/buyin
            const seen = new Set();
            const uniqueTournaments = tournaments.filter(t => {
                const key = `${t.day_of_week}-${t.start_time}-${t.buy_in}`;
                if (seen.has(key)) return false;
                seen.add(key);
                return true;
            });

            console.log(`  [FOUND] ${uniqueTournaments.length} tournaments`);
            return uniqueTournaments;

        } catch (error) {
            if (retryCount < CONFIG.maxRetries) {
                console.log(`  [RETRY] ${error.message} - attempt ${retryCount + 1}/${CONFIG.maxRetries}`);
                await this.sleep(2000);
                return this.scrapeVenue(venue, retryCount + 1);
            }

            console.log(`  [ERROR] ${error.message}`);
            this.stats.errors.push({ venue: venue.name, url, error: error.message });
            this.stats.venuesFailed++;
            return [];

        } finally {
            await page.close();
        }
    }

    /**
     * Insert tournaments into database
     */
    async insertTournaments(tournaments, venue, sourceUrl) {
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
            } else if (!error.message.includes('duplicate')) {
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

        // Filter by state
        if (this.options.state) {
            const state = this.options.state.toUpperCase();
            venues = venues.filter(v => v.state === state);
            console.log(`[FILTER] State: ${state} (${venues.length} venues)`);
        }

        // Filter by venue name
        if (this.options.venue) {
            const search = this.options.venue.toLowerCase();
            venues = venues.filter(v => v.name.toLowerCase().includes(search));
            console.log(`[FILTER] Venue: "${this.options.venue}" (${venues.length} venues)`);
        }

        // Filter to only venues with PokerAtlas URLs
        venues = venues.filter(v => v.pokerAtlasUrl);
        console.log(`[FILTER] With PokerAtlas URLs: ${venues.length} venues`);

        // Apply limit
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
        console.log('POKERATLAS DAILY TOURNAMENT SCRAPER');
        console.log('='.repeat(70));
        console.log(`Source of Truth: data/tournament-venues.json`);
        console.log(`Total Verified Venues: ${SOURCE_VENUES.metadata.totalVenues}`);
        console.log(`Started: ${this.stats.startTime.toISOString()}`);
        if (this.options.dryRun) console.log('MODE: DRY RUN (no database writes)');
        console.log('='.repeat(70) + '\n');

        await this.init();

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
                const sourceUrl = this.buildTournamentUrl(venue);
                const inserted = await this.insertTournaments(tournaments, venue, sourceUrl);
                this.stats.tournamentsInserted += inserted;
                console.log(`  [SAVED] ${inserted} tournaments to database`);
            }

            // Rate limiting between requests
            if (i < venues.length - 1) {
                await this.sleep(CONFIG.rateLimitMs);
            }
        }

        await this.close();
        this.printReport();

        return this.stats;
    }

    printReport() {
        const duration = (new Date() - this.stats.startTime) / 1000;

        console.log('\n' + '='.repeat(70));
        console.log('SCRAPER REPORT');
        console.log('='.repeat(70));
        console.log(`Duration:               ${Math.round(duration)}s`);
        console.log(`Venues Processed:       ${this.stats.venuesProcessed}`);
        console.log(`Venues with Tournaments: ${this.stats.venuesWithTournaments}`);
        console.log(`Venues Skipped:         ${this.stats.venuesSkipped}`);
        console.log(`Venues Failed:          ${this.stats.venuesFailed}`);
        console.log(`Tournaments Found:      ${this.stats.tournamentsFound}`);
        console.log(`Tournaments Inserted:   ${this.stats.tournamentsInserted}`);

        if (this.stats.errors.length > 0) {
            console.log('\nErrors:');
            this.stats.errors.slice(0, 15).forEach(e => {
                console.log(`  - ${e.venue}: ${e.error}`);
            });
            if (this.stats.errors.length > 15) {
                console.log(`  ... and ${this.stats.errors.length - 15} more errors`);
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
PokerAtlas Daily Tournament Scraper

Usage:
  node scripts/pokeratlas-daily-scraper.js [options]

Options:
  --state <ST>     Filter by state (e.g., NV, TX, CA)
  --venue <name>   Filter by venue name (partial match)
  --limit <n>      Limit to first N venues
  --dry-run        Don't write to database
  --help           Show this help

Examples:
  node scripts/pokeratlas-daily-scraper.js --state NV --limit 5
  node scripts/pokeratlas-daily-scraper.js --venue "Bellagio" --dry-run
  node scripts/pokeratlas-daily-scraper.js --state TX
                `);
                process.exit(0);
        }
    }

    return options;
}

// Run
if (require.main === module) {
    const options = parseArgs();
    const scraper = new PokerAtlasDailyScraper(options);

    scraper.run()
        .then(stats => {
            const exitCode = stats.venuesFailed > stats.venuesProcessed / 2 ? 1 : 0;
            process.exit(exitCode);
        })
        .catch(error => {
            console.error('[FATAL]', error);
            process.exit(1);
        });
}

module.exports = PokerAtlasDailyScraper;
