#!/usr/bin/env node
/**
 * Full Poker Data Pipeline Orchestrator
 * Uses Puppeteer with stealth plugin to bypass Cloudflare protection
 */

// Handle TLS certificate issues in some environments
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const { createClient } = require('@supabase/supabase-js');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');

puppeteer.use(StealthPlugin());

require('dotenv').config({ path: '.env.local' });

const CONFIG = {
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co',
    supabaseKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    rateLimitMs: 3000,
    testLimit: 10
};

class PipelineOrchestrator {
    constructor(options = {}) {
        this.options = options;
        this.supabase = createClient(CONFIG.supabaseUrl, CONFIG.supabaseKey);
        this.browser = null;
        this.stats = {
            startTime: Date.now(),
            setupSteps: [],
            venuesProcessed: 0,
            tournamentsFound: 0,
            errors: []
        };
    }

    log(emoji, message) {
        const timestamp = new Date().toISOString().split('T')[1].split('.')[0];
        console.log(`[${timestamp}] ${emoji} ${message}`);
    }

    async sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async initBrowser() {
        this.log('>', 'Launching headless browser with stealth...');

        // Try to find Chrome executable
        const chromePaths = [
            '/usr/bin/google-chrome',
            '/usr/bin/google-chrome-stable',
            '/usr/bin/chromium-browser',
            '/usr/bin/chromium'
        ];

        let executablePath;
        for (const p of chromePaths) {
            try {
                require('fs').accessSync(p);
                executablePath = p;
                break;
            } catch (e) {}
        }

        this.browser = await puppeteer.launch({
            headless: 'new',
            executablePath: executablePath || undefined,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--disable-gpu',
                '--window-size=1920,1080'
            ]
        });
        this.log('OK', `Browser ready (using: ${executablePath || 'bundled'})`);
    }

    async closeBrowser() {
        if (this.browser) {
            await this.browser.close();
            this.browser = null;
        }
    }

    async run() {
        console.log('='.repeat(60));
        console.log('POKER DATA PIPELINE ORCHESTRATOR (Puppeteer)');
        console.log('='.repeat(60));
        console.log(`Started: ${new Date().toISOString()}`);
        console.log(`Mode: ${this.options.setupOnly ? 'Setup Only' : this.options.scrapeOnly ? 'Scrape Only' : 'Full Pipeline'}`);
        if (this.options.state) console.log(`State Filter: ${this.options.state}`);
        if (this.options.test) console.log(`Test Mode: ${CONFIG.testLimit} venues`);
        console.log('='.repeat(60));

        try {
            if (!this.options.scrapeOnly) {
                await this.runSetupPhase();
            }

            if (!this.options.setupOnly) {
                await this.initBrowser();
                await this.runScrapingPhase();
                await this.closeBrowser();
            }

            this.printFinalReport();

        } catch (error) {
            this.log('X', `Fatal error: ${error.message}`);
            this.stats.errors.push({ phase: 'main', error: error.message });
            await this.closeBrowser();
            throw error;
        }
    }

    async runSetupPhase() {
        console.log('\n' + '-'.repeat(60));
        console.log('PHASE 1: DATABASE SETUP');
        console.log('-'.repeat(60));

        this.log('>', 'Verifying database connection...');
        const { count, error } = await this.supabase
            .from('poker_venues')
            .select('*', { count: 'exact', head: true });

        if (error) throw new Error(`Database connection failed: ${error.message}`);
        this.log('OK', `Connected! Found ${count} venues in database`);
        this.stats.setupSteps.push({ step: 'DB Connection', status: 'success' });

        const { count: seriesCount } = await this.supabase
            .from('tournament_series')
            .select('*', { count: 'exact', head: true });
        this.log('>', `Found ${seriesCount} tournament series`);

        this.log('>', 'Setting up venue scrape URLs...');
        await this.setupVenueUrls();
    }

    async setupVenueUrls() {
        let query = this.supabase
            .from('poker_venues')
            .select('id, name, city, state, pokeratlas_url')
            .is('pokeratlas_url', null);

        if (this.options.state) {
            query = query.eq('state', this.options.state.toUpperCase());
        }

        if (this.options.test) {
            query = query.limit(CONFIG.testLimit);
        }

        const { data: venues, error } = await query;
        if (error) {
            this.log('X', `Failed to fetch venues: ${error.message}`);
            return;
        }

        if (!venues || venues.length === 0) {
            this.log('OK', 'All venues already have URLs configured');
            return;
        }

        this.log('>', `Processing ${venues.length} venues...`);

        for (const venue of venues) {
            const slug = this.generateSlug(venue.name);
            const pokeratlasUrl = `https://www.pokeratlas.com/poker-room/${slug}/tournaments`;

            await this.supabase
                .from('poker_venues')
                .update({
                    pokeratlas_url: pokeratlasUrl,
                    pokeratlas_slug: slug,
                    scrape_url: pokeratlasUrl,
                    scrape_source: 'pokeratlas',
                    scrape_status: 'ready'
                })
                .eq('id', venue.id);
        }

        this.log('OK', `Updated ${venues.length} venue URLs`);
        this.stats.setupSteps.push({ step: 'Venue URLs', status: 'success' });
    }

    generateSlug(name) {
        return name
            .toLowerCase()
            .replace(/['']/g, '')
            .replace(/&/g, 'and')
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-|-$/g, '');
    }

    async runScrapingPhase() {
        console.log('\n' + '-'.repeat(60));
        console.log('PHASE 2: DATA SCRAPING (Puppeteer + Stealth)');
        console.log('-'.repeat(60));

        // Only scrape venues with verified URLs (scrape_status='ready')
        let query = this.supabase
            .from('poker_venues')
            .select('id, name, city, state, scrape_url, pokeratlas_url')
            .not('scrape_url', 'is', null)
            .eq('is_active', true);

        if (this.options.state) {
            query = query.eq('state', this.options.state.toUpperCase());
        }

        if (this.options.test) {
            query = query.limit(CONFIG.testLimit);
        }

        const { data: venues, error } = await query;

        if (error) {
            throw new Error(`Failed to fetch venues: ${error.message}`);
        }

        this.log('>', `Scraping ${venues?.length || 0} venues...`);
        console.log('');

        for (let i = 0; i < (venues?.length || 0); i++) {
            const venue = venues[i];
            console.log(`[${i + 1}/${venues.length}] ${venue.name} (${venue.city}, ${venue.state})`);

            try {
                const tournaments = await this.scrapeVenueWithPuppeteer(venue);

                if (tournaments.length > 0) {
                    await this.saveTournaments(venue, tournaments);
                    this.log('OK', `Found ${tournaments.length} tournaments`);
                    this.stats.tournamentsFound += tournaments.length;

                    await this.supabase
                        .from('poker_venues')
                        .update({
                            scrape_status: 'complete',
                            last_scraped: new Date().toISOString()
                        })
                        .eq('id', venue.id);
                } else {
                    this.log('!', 'No tournaments found');

                    await this.supabase
                        .from('poker_venues')
                        .update({
                            scrape_status: 'no_data',
                            last_scraped: new Date().toISOString()
                        })
                        .eq('id', venue.id);
                }

            } catch (error) {
                this.log('X', `Error: ${error.message}`);
                this.stats.errors.push({ venue: venue.name, error: error.message });

                await this.supabase
                    .from('poker_venues')
                    .update({ scrape_status: 'error' })
                    .eq('id', venue.id);
            }

            this.stats.venuesProcessed++;
            await this.sleep(CONFIG.rateLimitMs);
            console.log('');
        }
    }

    async scrapeVenueWithPuppeteer(venue) {
        const page = await this.browser.newPage();

        try {
            await page.setViewport({ width: 1920, height: 1080 });

            const url = venue.scrape_url || venue.pokeratlas_url;
            this.log('>', `Fetching: ${url}`);

            await page.goto(url, {
                waitUntil: 'networkidle2',
                timeout: 30000
            });

            // Wait for page to fully load and JS to execute
            await page.waitForSelector('body', { timeout: 10000 });
            await this.sleep(3000); // Wait longer for JS content

            // Check if we got blocked
            const content = await page.content();
            if (content.includes('cf-error') || content.includes('Just a moment')) {
                throw new Error('Cloudflare challenge detected');
            }

            // Try to wait for tournament table specifically
            try {
                await page.waitForSelector('table, .schedule, [class*="tournament"]', { timeout: 5000 });
            } catch (e) {
                // Table might not exist, continue anyway
            }

            const tournaments = await page.evaluate(() => {
                const results = [];

                // More comprehensive selectors for PokerAtlas
                const selectors = [
                    'table.schedule tbody tr',
                    'table.tournaments tbody tr',
                    '.tournament-list tr',
                    '.schedule-table tr',
                    'table tbody tr',
                    '.tournament-schedule tr',
                    '[class*="tournament"] tr',
                    'table tr',
                    '.tournament-row',
                    '.schedule-row',
                    '[class*="schedule"] > div'
                ];

                let rows = [];
                for (const selector of selectors) {
                    const found = document.querySelectorAll(selector);
                    if (found.length > rows.length) {
                        rows = found;
                    }
                }

                // Also check for any elements containing tournament-like text
                const allText = document.body.innerText || '';
                const lines = allText.split('\n').filter(l => l.trim());

                // Look for patterns in the full page text
                lines.forEach(line => {
                    const text = line.trim();
                    if (text.length < 10 || text.length > 200) return;

                    const buyinMatch = text.match(/\$(\d{1,3}(?:,\d{3})*|\d+)/);
                    const timeMatch = text.match(/(\d{1,2}:\d{2}\s*(?:AM|PM|am|pm)?)/i);
                    const dayMatch = text.match(/(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|Daily|Mon|Tue|Wed|Thu|Fri|Sat|Sun)/i);

                    if (buyinMatch && (timeMatch || dayMatch)) {
                        const buyin = parseInt(buyinMatch[1].replace(/,/g, ''));

                        if (buyin >= 20 && buyin < 50000) {
                            const gtdMatch = text.match(/(?:GTD|Guaranteed)[:\s]*\$?([\d,]+)/i) ||
                                           text.match(/\$(\d{1,3}(?:,\d{3})+)\s*(?:GTD|Guaranteed)/i);

                            let day = dayMatch ? dayMatch[1] : 'Daily';
                            const dayMap = {
                                'Mon': 'Monday', 'Tue': 'Tuesday', 'Wed': 'Wednesday',
                                'Thu': 'Thursday', 'Fri': 'Friday', 'Sat': 'Saturday', 'Sun': 'Sunday'
                            };
                            day = dayMap[day] || day;

                            // Avoid duplicates
                            const existing = results.find(r =>
                                r.day_of_week === day &&
                                r.buy_in === buyin &&
                                r.start_time === (timeMatch ? timeMatch[1].toUpperCase() : '7:00 PM')
                            );

                            if (!existing) {
                                results.push({
                                    day_of_week: day,
                                    start_time: timeMatch ? timeMatch[1].toUpperCase() : '7:00 PM',
                                    buy_in: buyin,
                                    guaranteed: gtdMatch ? parseInt(gtdMatch[1].replace(/,/g, '')) : null,
                                    game_type: text.toLowerCase().includes('plo') || text.toLowerCase().includes('omaha') ? 'PLO' : 'NLH'
                                });
                            }
                        }
                    }
                });

                return results;
            });

            return tournaments;

        } catch (error) {
            throw error;
        } finally {
            await page.close();
        }
    }

    async saveTournaments(venue, tournaments) {
        for (const t of tournaments) {
            try {
                await this.supabase
                    .from('venue_daily_tournaments')
                    .upsert({
                        venue_id: venue.id,
                        venue_name: venue.name,
                        day_of_week: t.day_of_week,
                        start_time: t.start_time,
                        buy_in: t.buy_in,
                        guaranteed: t.guaranteed,
                        game_type: t.game_type,
                        source_url: venue.scrape_url,
                        last_scraped: new Date().toISOString(),
                        is_active: true
                    }, {
                        onConflict: 'venue_id,day_of_week,start_time,buy_in'
                    });
            } catch (error) {
                if (!error.message?.includes('duplicate')) {
                    console.log(`    Insert warning: ${error.message}`);
                }
            }
        }
    }

    printFinalReport() {
        const duration = Math.round((Date.now() - this.stats.startTime) / 1000);

        console.log('\n' + '='.repeat(60));
        console.log('FINAL REPORT');
        console.log('='.repeat(60));
        console.log(`Duration:           ${duration} seconds`);
        console.log(`Venues Processed:   ${this.stats.venuesProcessed}`);
        console.log(`Tournaments Found:  ${this.stats.tournamentsFound}`);
        console.log(`Errors:             ${this.stats.errors.length}`);

        if (this.stats.setupSteps.length > 0) {
            console.log('\nSetup Steps:');
            this.stats.setupSteps.forEach(s => {
                console.log(`  - ${s.step}: ${s.status}`);
            });
        }

        if (this.stats.errors.length > 0) {
            console.log('\nErrors:');
            this.stats.errors.slice(0, 10).forEach(e => {
                console.log(`  - ${e.venue || e.phase}: ${e.error}`);
            });
            if (this.stats.errors.length > 10) {
                console.log(`  ... and ${this.stats.errors.length - 10} more`);
            }
        }

        console.log('='.repeat(60));
        console.log('\nPipeline completed successfully!');
    }
}

// Parse CLI args
const args = process.argv.slice(2);
const options = {
    setupOnly: args.includes('--setup-only'),
    scrapeOnly: args.includes('--scrape-only'),
    test: args.includes('--test'),
    state: null
};

const stateIndex = args.indexOf('--state');
if (stateIndex !== -1 && args[stateIndex + 1]) {
    options.state = args[stateIndex + 1].toUpperCase();
}

const orchestrator = new PipelineOrchestrator(options);
orchestrator.run()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error('\nPipeline failed:', error.message);
        process.exit(1);
    });
