#!/usr/bin/env node
/**
 * Bravo Poker Live Scraper
 * Scrapes tournament schedules from bravopokerlive.com
 *
 * Bravo Poker Live is used by many US poker rooms for
 * tournament management and real-time game data.
 */

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

require('dotenv').config({ path: '.env.local' });
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const { createClient } = require('@supabase/supabase-js');

puppeteer.use(StealthPlugin());

const BRAVO_BASE_URL = 'https://www.bravopokerlive.com';

// Map of poker room Bravo IDs (discovered through scraping)
const BRAVO_ROOMS = [
    { bravoId: 'commerce', name: 'Commerce Casino', state: 'CA' },
    { bravoId: 'bicycle', name: 'Bicycle Casino', state: 'CA' },
    { bravoId: 'bayareacardroom', name: 'Bay 101', state: 'CA' },
    { bravoId: 'hustler', name: 'Hustler Casino', state: 'CA' },
    { bravoId: 'gardens', name: 'The Gardens Casino', state: 'CA' },
    { bravoId: 'stones', name: 'Stones Gambling Hall', state: 'CA' },
    { bravoId: 'luckyladycasino', name: 'Larry Flynt Lucky Lady', state: 'CA' },
    { bravoId: 'turningstone', name: 'Turning Stone', state: 'NY' },
    { bravoId: 'foxwoods', name: 'Foxwoods Resort Casino', state: 'CT' },
    { bravoId: 'mohegansun', name: 'Mohegan Sun', state: 'CT' },
    { bravoId: 'bestbetjax', name: 'bestbet Jacksonville', state: 'FL' },
    { bravoId: 'bestbetop', name: 'bestbet Orange Park', state: 'FL' },
    { bravoId: 'seminolehrhollywood', name: 'Seminole Hard Rock Hollywood', state: 'FL' },
    { bravoId: 'seminolehrtampa', name: 'Seminole Hard Rock Tampa', state: 'FL' },
    { bravoId: 'derbylane', name: 'Derby Lane', state: 'FL' },
    { bravoId: 'tampabaydowns', name: 'Tampa Bay Downs', state: 'FL' },
    { bravoId: 'gulfstream', name: 'Gulfstream Park', state: 'FL' },
    { bravoId: 'calder', name: 'Calder Casino', state: 'FL' },
    { bravoId: 'daytona', name: 'Daytona Beach Racing', state: 'FL' },
    { bravoId: 'islepompano', name: 'Isle Casino Pompano', state: 'FL' },
    { bravoId: 'parx', name: 'Parx Casino', state: 'PA' },
    { bravoId: 'windcreek', name: 'Wind Creek Bethlehem', state: 'PA' },
    { bravoId: 'livephilly', name: 'Live! Casino Philadelphia', state: 'PA' },
    { bravoId: 'riverspgh', name: 'Rivers Casino Pittsburgh', state: 'PA' },
    { bravoId: 'borgata', name: 'Borgata', state: 'NJ' },
    { bravoId: 'marylandlive', name: 'Maryland Live! Casino', state: 'MD' },
    { bravoId: 'horseshoebaltimore', name: 'Horseshoe Baltimore', state: 'MD' },
    { bravoId: 'mgmnationalharbor', name: 'MGM National Harbor', state: 'MD' },
    { bravoId: 'choctaw', name: 'Choctaw Casino Durant', state: 'OK' },
    { bravoId: 'hardrocktulsa', name: 'Hard Rock Tulsa', state: 'OK' },
    { bravoId: 'winstar', name: 'WinStar World Casino', state: 'OK' },
    { bravoId: 'horseshoeindy', name: 'Horseshoe Hammond', state: 'IN' },
    { bravoId: 'firekeepers', name: 'FireKeepers Casino', state: 'MI' },
    { bravoId: 'motorcity', name: 'MotorCity Casino', state: 'MI' },
    { bravoId: 'runningaces', name: 'Running Aces', state: 'MN' },
    { bravoId: 'canterburypark', name: 'Canterbury Park', state: 'MN' },
    { bravoId: 'cherokee', name: "Harrah's Cherokee", state: 'NC' },
    { bravoId: 'beaurivage', name: 'Beau Rivage', state: 'MS' },
    { bravoId: 'caesarsnola', name: 'Caesars New Orleans', state: 'LA' },
    { bravoId: 'horseshoetunica', name: 'Horseshoe Tunica', state: 'MS' },
];

class BravoScraper {
    constructor() {
        this.browser = null;
        this.supabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL,
            process.env.SUPABASE_SERVICE_ROLE_KEY
        );
        this.stats = {
            roomsProcessed: 0,
            tournamentsFound: 0,
            errors: 0
        };
    }

    log(emoji, message) {
        const timestamp = new Date().toISOString().substr(11, 8);
        console.log(`[${timestamp}] ${emoji} ${message}`);
    }

    async initBrowser() {
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
                '--disable-gpu',
                '--single-process'
            ]
        });

        this.log('✅', `Browser ready (using: ${executablePath || 'bundled'})`);
    }

    async scrapeRoom(room) {
        const page = await this.browser.newPage();

        try {
            await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

            // Try different Bravo URL patterns
            const urls = [
                `${BRAVO_BASE_URL}/room/${room.bravoId}`,
                `${BRAVO_BASE_URL}/${room.bravoId}`,
                `${BRAVO_BASE_URL}/tournaments/${room.bravoId}`
            ];

            let tournaments = [];

            for (const url of urls) {
                try {
                    this.log('📡', `Trying: ${url}`);
                    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });

                    // Wait for content to load
                    await page.waitForSelector('body', { timeout: 5000 });

                    // Look for tournament data
                    tournaments = await page.evaluate(() => {
                        const results = [];

                        // Look for common Bravo tournament selectors
                        const selectors = [
                            '.tournament-row',
                            '.tournament-item',
                            '[data-tournament]',
                            'table tbody tr',
                            '.event-list-item',
                            '.schedule-item'
                        ];

                        for (const selector of selectors) {
                            const rows = document.querySelectorAll(selector);
                            if (rows.length > 0) {
                                rows.forEach(row => {
                                    const text = row.innerText;

                                    // Try to extract tournament info
                                    const buyInMatch = text.match(/\$(\d+)/);
                                    const timeMatch = text.match(/(\d{1,2}:\d{2}\s*(?:AM|PM|am|pm)?)/i);
                                    const gameTypeMatch = text.match(/(NLH|PLO|NL Hold'em|No Limit|Omaha)/i);

                                    if (buyInMatch || timeMatch) {
                                        results.push({
                                            raw_text: text.substring(0, 200),
                                            buy_in: buyInMatch ? parseInt(buyInMatch[1]) : null,
                                            start_time: timeMatch ? timeMatch[1] : null,
                                            game_type: gameTypeMatch ? gameTypeMatch[1] : 'NLH'
                                        });
                                    }
                                });
                                break;
                            }
                        }

                        return results;
                    });

                    if (tournaments.length > 0) {
                        this.log('✅', `Found ${tournaments.length} tournaments at ${room.name}`);
                        break;
                    }
                } catch (e) {
                    // Try next URL pattern
                }
            }

            return tournaments;

        } catch (error) {
            this.log('❌', `Error scraping ${room.name}: ${error.message}`);
            this.stats.errors++;
            return [];
        } finally {
            await page.close();
        }
    }

    async saveTournaments(room, tournaments) {
        // First, find the venue in our database
        const { data: venue, error: venueError } = await this.supabase
            .from('poker_venues')
            .select('id')
            .ilike('name', `%${room.name.split(' ')[0]}%`)
            .eq('state', room.state)
            .limit(1)
            .single();

        if (venueError || !venue) {
            this.log('⚠️', `Could not find venue ${room.name} in database`);
            return;
        }

        for (const tournament of tournaments) {
            const { error: upsertError } = await this.supabase
                .from('venue_daily_tournaments')
                .upsert({
                    venue_id: venue.id,
                    venue_name: room.name,
                    day_of_week: 'Daily', // Bravo shows today's tournaments
                    start_time: tournament.start_time,
                    buy_in: tournament.buy_in,
                    game_type: tournament.game_type || 'NLH',
                    source_url: `${BRAVO_BASE_URL}/room/${room.bravoId}`,
                    last_scraped: new Date().toISOString()
                }, {
                    onConflict: 'venue_id,day_of_week,start_time'
                });

            if (!upsertError) {
                this.stats.tournamentsFound++;
            }
        }
    }

    async run() {
        console.log('═'.repeat(60));
        console.log('🎰 BRAVO POKER LIVE SCRAPER');
        console.log('═'.repeat(60));
        console.log(`📅 Started: ${new Date().toISOString()}`);
        console.log(`📍 Rooms to scrape: ${BRAVO_ROOMS.length}`);
        console.log('═'.repeat(60));

        await this.initBrowser();

        for (let i = 0; i < BRAVO_ROOMS.length; i++) {
            const room = BRAVO_ROOMS[i];
            console.log(`\n[${i + 1}/${BRAVO_ROOMS.length}] ${room.name} (${room.state})`);

            const tournaments = await this.scrapeRoom(room);

            if (tournaments.length > 0) {
                await this.saveTournaments(room, tournaments);
            }

            this.stats.roomsProcessed++;

            // Rate limiting
            await new Promise(r => setTimeout(r, 2000));
        }

        await this.browser.close();

        console.log('\n' + '═'.repeat(60));
        console.log('📊 BRAVO SCRAPER RESULTS');
        console.log('═'.repeat(60));
        console.log(`Rooms Processed:    ${this.stats.roomsProcessed}`);
        console.log(`Tournaments Found:  ${this.stats.tournamentsFound}`);
        console.log(`Errors:             ${this.stats.errors}`);
        console.log('═'.repeat(60));
    }
}

// Run if called directly
if (require.main === module) {
    const scraper = new BravoScraper();
    scraper.run().catch(console.error);
}

module.exports = BravoScraper;
