#!/usr/bin/env node
/**
 * Tournament Scraper with curl-based Supabase operations
 * Uses Puppeteer with stealth plugin to bypass Cloudflare
 */

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const { execSync } = require('child_process');
const fs = require('fs');

puppeteer.use(StealthPlugin());

require('dotenv').config({ path: '.env.local' });

const CONFIG = {
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co',
    supabaseKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    rateLimitMs: 3000,
    testLimit: 10
};

// Use curl for Supabase operations
function supabaseQuery(endpoint, method = 'GET', body = null) {
    const url = `${CONFIG.supabaseUrl}/rest/v1/${endpoint}`;
    let cmd = `curl -sk "${url}" -H "apikey: ${CONFIG.supabaseKey}" -H "Authorization: Bearer ${CONFIG.supabaseKey}"`;

    if (method === 'PATCH' || method === 'POST') {
        cmd += ` -X ${method} -H "Content-Type: application/json" -H "Prefer: return=minimal"`;
        if (body) {
            cmd += ` -d '${JSON.stringify(body)}'`;
        }
    }

    try {
        const result = execSync(cmd, { encoding: 'utf8', maxBuffer: 50 * 1024 * 1024 });
        return method === 'GET' ? JSON.parse(result) : null;
    } catch (error) {
        console.error('Supabase query error:', error.message);
        return null;
    }
}

function supabaseUpsert(table, data) {
    const url = `${CONFIG.supabaseUrl}/rest/v1/${table}`;
    const cmd = `curl -sk "${url}" -X POST -H "apikey: ${CONFIG.supabaseKey}" -H "Authorization: Bearer ${CONFIG.supabaseKey}" -H "Content-Type: application/json" -H "Prefer: resolution=merge-duplicates" -d '${JSON.stringify(data)}'`;

    try {
        execSync(cmd, { encoding: 'utf8' });
        return true;
    } catch (error) {
        return false;
    }
}

function supabaseUpdate(table, id, data) {
    const url = `${CONFIG.supabaseUrl}/rest/v1/${table}?id=eq.${id}`;
    const cmd = `curl -sk "${url}" -X PATCH -H "apikey: ${CONFIG.supabaseKey}" -H "Authorization: Bearer ${CONFIG.supabaseKey}" -H "Content-Type: application/json" -H "Prefer: return=minimal" -d '${JSON.stringify(data)}'`;

    try {
        execSync(cmd, { encoding: 'utf8' });
        return true;
    } catch (error) {
        return false;
    }
}

class TournamentScraper {
    constructor(options = {}) {
        this.options = options;
        this.browser = null;
        this.stats = {
            startTime: Date.now(),
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
        this.log('🌐', 'Launching headless browser with stealth...');

        const chromePaths = [
            '/usr/bin/google-chrome',
            '/usr/bin/google-chrome-stable',
            '/usr/bin/chromium-browser',
            '/usr/bin/chromium'
        ];

        let executablePath;
        for (const p of chromePaths) {
            try {
                fs.accessSync(p);
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
        this.log('✅', `Browser ready (using: ${executablePath || 'bundled'})`);
    }

    async closeBrowser() {
        if (this.browser) {
            await this.browser.close();
            this.browser = null;
        }
    }

    async run() {
        console.log('═'.repeat(60));
        console.log('🎰 POKER TOURNAMENT SCRAPER (Puppeteer + Curl)');
        console.log('═'.repeat(60));
        console.log(`📅 Started: ${new Date().toISOString()}`);
        if (this.options.state) console.log(`🗺️  State Filter: ${this.options.state}`);
        if (this.options.test) console.log(`🧪 Test Mode: ${CONFIG.testLimit} venues`);
        console.log('═'.repeat(60));

        try {
            await this.initBrowser();

            // Fetch venues to scrape
            let endpoint = 'poker_venues?select=id,name,city,state,scrape_url,pokeratlas_url&scrape_status=eq.ready&is_active=eq.true';

            if (this.options.state) {
                endpoint += `&state=eq.${this.options.state.toUpperCase()}`;
            }

            if (this.options.test) {
                endpoint += `&limit=${CONFIG.testLimit}`;
            }

            const venues = supabaseQuery(endpoint);

            if (!venues || venues.length === 0) {
                this.log('⚠️', 'No venues found to scrape');
                await this.closeBrowser();
                return;
            }

            this.log('📍', `Scraping ${venues.length} venues...`);
            console.log('');

            for (let i = 0; i < venues.length; i++) {
                const venue = venues[i];
                console.log(`[${i + 1}/${venues.length}] ${venue.name} (${venue.city}, ${venue.state})`);

                try {
                    const tournaments = await this.scrapeVenue(venue);

                    if (tournaments.length > 0) {
                        await this.saveTournaments(venue, tournaments);
                        this.log('✅', `Found ${tournaments.length} tournaments`);
                        this.stats.tournamentsFound += tournaments.length;

                        supabaseUpdate('poker_venues', venue.id, {
                            scrape_status: 'complete',
                            last_scraped: new Date().toISOString()
                        });
                    } else {
                        this.log('⚠️', 'No tournaments found');
                        supabaseUpdate('poker_venues', venue.id, {
                            scrape_status: 'no_data',
                            last_scraped: new Date().toISOString()
                        });
                    }

                } catch (error) {
                    this.log('❌', `Error: ${error.message}`);
                    this.stats.errors.push({ venue: venue.name, error: error.message });
                    supabaseUpdate('poker_venues', venue.id, { scrape_status: 'error' });
                }

                this.stats.venuesProcessed++;
                await this.sleep(CONFIG.rateLimitMs);
                console.log('');
            }

            await this.closeBrowser();
            this.printFinalReport();

        } catch (error) {
            this.log('❌', `Fatal error: ${error.message}`);
            this.stats.errors.push({ phase: 'main', error: error.message });
            await this.closeBrowser();
            throw error;
        }
    }

    async scrapeVenue(venue) {
        const page = await this.browser.newPage();

        try {
            await page.setViewport({ width: 1920, height: 1080 });

            const url = venue.scrape_url || venue.pokeratlas_url;
            this.log('📡', `Fetching: ${url}`);

            await page.goto(url, {
                waitUntil: 'networkidle2',
                timeout: 30000
            });

            await page.waitForSelector('body', { timeout: 10000 });
            await this.sleep(2000);

            // Check if blocked
            const content = await page.content();
            if (content.includes('cf-error') || content.includes('Just a moment')) {
                throw new Error('Cloudflare challenge detected');
            }

            const tournaments = await page.evaluate(() => {
                const results = [];
                const selectors = [
                    'table tbody tr',
                    '.tournament-schedule tr',
                    '[class*="tournament"] tr',
                    'table tr'
                ];

                let rows = [];
                for (const selector of selectors) {
                    rows = document.querySelectorAll(selector);
                    if (rows.length > 1) break;
                }

                rows.forEach((row, index) => {
                    if (row.querySelector('th')) return;
                    if (index === 0 && row.textContent.toLowerCase().includes('day')) return;

                    const text = row.textContent || '';
                    const buyinMatch = text.match(/\$(\d{1,3}(?:,\d{3})*|\d+)/);
                    const timeMatch = text.match(/(\d{1,2}:\d{2}\s*(?:AM|PM|am|pm)?)/i);
                    const dayMatch = text.match(/(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|Daily|Mon|Tue|Wed|Thu|Fri|Sat|Sun)/i);
                    const gtdMatch = text.match(/(?:GTD|Guaranteed)[:\s]*\$?([\d,]+)/i) ||
                                     text.match(/\$(\d{1,3}(?:,\d{3})+)\s*(?:GTD|Guaranteed)/i);

                    if (buyinMatch && (timeMatch || dayMatch)) {
                        const buyin = parseInt(buyinMatch[1].replace(/,/g, ''));

                        if (buyin > 0 && buyin < 50000) {
                            let day = dayMatch ? dayMatch[1] : 'Daily';
                            const dayMap = {
                                'Mon': 'Monday', 'Tue': 'Tuesday', 'Wed': 'Wednesday',
                                'Thu': 'Thursday', 'Fri': 'Friday', 'Sat': 'Saturday', 'Sun': 'Sunday'
                            };
                            day = dayMap[day] || day;

                            results.push({
                                day_of_week: day,
                                start_time: timeMatch ? timeMatch[1].toUpperCase() : '7:00 PM',
                                buy_in: buyin,
                                guaranteed: gtdMatch ? parseInt(gtdMatch[1].replace(/,/g, '')) : null,
                                game_type: text.toLowerCase().includes('plo') || text.toLowerCase().includes('omaha') ? 'PLO' : 'NLH'
                            });
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
                supabaseUpsert('venue_daily_tournaments', {
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
                });
            } catch (error) {
                // Ignore duplicate errors
            }
        }
    }

    printFinalReport() {
        const duration = Math.round((Date.now() - this.stats.startTime) / 1000);

        console.log('\n' + '═'.repeat(60));
        console.log('📊 FINAL REPORT');
        console.log('═'.repeat(60));
        console.log(`Duration:           ${duration} seconds`);
        console.log(`Venues Processed:   ${this.stats.venuesProcessed}`);
        console.log(`Tournaments Found:  ${this.stats.tournamentsFound}`);
        console.log(`Errors:             ${this.stats.errors.length}`);

        if (this.stats.errors.length > 0) {
            console.log('\nErrors:');
            this.stats.errors.slice(0, 10).forEach(e => {
                console.log(`  • ${e.venue || e.phase}: ${e.error}`);
            });
            if (this.stats.errors.length > 10) {
                console.log(`  ... and ${this.stats.errors.length - 10} more`);
            }
        }

        console.log('═'.repeat(60));
        console.log('\n✅ Scraping completed!');
    }
}

// Parse CLI args
const args = process.argv.slice(2);
const options = {
    test: args.includes('--test'),
    state: null
};

const stateIndex = args.indexOf('--state');
if (stateIndex !== -1 && args[stateIndex + 1]) {
    options.state = args[stateIndex + 1].toUpperCase();
}

const scraper = new TournamentScraper(options);
scraper.run()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error('\n❌ Scraper failed:', error.message);
        process.exit(1);
    });
