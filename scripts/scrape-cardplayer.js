#!/usr/bin/env node
/**
 * CardPlayer.com Tournament Scraper
 * Scrapes poker tournament schedules from cardplayer.com
 *
 * CardPlayer provides comprehensive tournament listings including
 * daily tournaments, special events, and tournament series.
 */

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

require('dotenv').config({ path: '.env.local' });
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const { createClient } = require('@supabase/supabase-js');

puppeteer.use(StealthPlugin());

const CARDPLAYER_URLS = {
    lasVegas: 'https://www.cardplayer.com/lasvegaspoker',
    tournaments: 'https://www.cardplayer.com/poker-tournaments',
    monthly: 'https://www.cardplayer.com/poker-tournaments/monthly'
};

class CardPlayerScraper {
    constructor() {
        this.browser = null;
        this.supabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL,
            process.env.SUPABASE_SERVICE_ROLE_KEY
        );
        this.stats = {
            pagesProcessed: 0,
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

    async scrapeLasVegasPage() {
        const page = await this.browser.newPage();

        try {
            await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

            this.log('📡', `Fetching: ${CARDPLAYER_URLS.lasVegas}`);
            await page.goto(CARDPLAYER_URLS.lasVegas, { waitUntil: 'networkidle2', timeout: 60000 });

            // Wait for content
            await page.waitForSelector('body', { timeout: 10000 });

            const tournaments = await page.evaluate(() => {
                const results = [];

                // CardPlayer lists tournaments in tables
                const tables = document.querySelectorAll('table');

                tables.forEach(table => {
                    const rows = table.querySelectorAll('tr');

                    rows.forEach(row => {
                        const cells = row.querySelectorAll('td');
                        if (cells.length >= 3) {
                            const text = row.innerText;

                            // Extract venue name (usually first cell or header context)
                            let venueName = '';
                            const venueCell = cells[0];
                            if (venueCell) {
                                const link = venueCell.querySelector('a');
                                venueName = link ? link.innerText : venueCell.innerText;
                            }

                            // Extract tournament details
                            const buyInMatch = text.match(/\$(\d+(?:,\d+)?)/);
                            const timeMatch = text.match(/(\d{1,2}:\d{2}\s*(?:AM|PM|am|pm|a\.m\.|p\.m\.)?)/i);
                            const dayMatch = text.match(/(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|Daily)/i);
                            const guaranteeMatch = text.match(/\$(\d+(?:,\d+)?)\s*(?:GTD|Guaranteed)/i);

                            if ((buyInMatch || timeMatch) && venueName) {
                                results.push({
                                    venue_name: venueName.trim(),
                                    buy_in: buyInMatch ? parseInt(buyInMatch[1].replace(',', '')) : null,
                                    start_time: timeMatch ? timeMatch[1].trim() : null,
                                    day_of_week: dayMatch ? dayMatch[1] : 'Daily',
                                    guaranteed: guaranteeMatch ? parseInt(guaranteeMatch[1].replace(',', '')) : null,
                                    game_type: text.includes('PLO') ? 'PLO' : 'NLH',
                                    raw_text: text.substring(0, 300)
                                });
                            }
                        }
                    });
                });

                // Also look for list-based tournament displays
                const listItems = document.querySelectorAll('.tournament-item, .event-item, .schedule-item');
                listItems.forEach(item => {
                    const text = item.innerText;

                    const venueMatch = text.match(/^([A-Za-z\s&']+?)(?:\s*[-–]|\s*\$)/);
                    const buyInMatch = text.match(/\$(\d+(?:,\d+)?)/);
                    const timeMatch = text.match(/(\d{1,2}:\d{2}\s*(?:AM|PM)?)/i);

                    if (venueMatch && (buyInMatch || timeMatch)) {
                        results.push({
                            venue_name: venueMatch[1].trim(),
                            buy_in: buyInMatch ? parseInt(buyInMatch[1].replace(',', '')) : null,
                            start_time: timeMatch ? timeMatch[1] : null,
                            day_of_week: 'Daily',
                            game_type: 'NLH',
                            raw_text: text.substring(0, 300)
                        });
                    }
                });

                return results;
            });

            this.log('✅', `Found ${tournaments.length} tournaments on Las Vegas page`);
            return tournaments;

        } catch (error) {
            this.log('❌', `Error scraping CardPlayer Las Vegas: ${error.message}`);
            this.stats.errors++;
            return [];
        } finally {
            await page.close();
        }
    }

    async scrapeTournamentSeriesPage() {
        const page = await this.browser.newPage();

        try {
            await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');

            // Get current month's tournaments
            const now = new Date();
            const monthUrl = `${CARDPLAYER_URLS.monthly}/${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}`;

            this.log('📡', `Fetching: ${monthUrl}`);
            await page.goto(monthUrl, { waitUntil: 'networkidle2', timeout: 60000 });

            const tournaments = await page.evaluate(() => {
                const results = [];

                // Look for tournament series listings
                const eventItems = document.querySelectorAll('.event-item, .tournament-item, tr');

                eventItems.forEach(item => {
                    const text = item.innerText;
                    const link = item.querySelector('a');

                    if (link && text.length > 10) {
                        const nameMatch = link ? link.innerText : text.split('\n')[0];
                        const dateMatch = text.match(/(\w+\s+\d+)(?:\s*-\s*(\w+\s+\d+))?/);
                        const locationMatch = text.match(/(?:at|@)\s+([A-Za-z\s&']+)/i);

                        results.push({
                            event_name: nameMatch,
                            venue_name: locationMatch ? locationMatch[1].trim() : null,
                            dates: dateMatch ? dateMatch[0] : null,
                            url: link ? link.href : null,
                            raw_text: text.substring(0, 300)
                        });
                    }
                });

                return results;
            });

            this.log('✅', `Found ${tournaments.length} tournament series`);
            return tournaments;

        } catch (error) {
            this.log('❌', `Error scraping tournament series: ${error.message}`);
            this.stats.errors++;
            return [];
        } finally {
            await page.close();
        }
    }

    async findVenueId(venueName, state = null) {
        // Clean up venue name for matching
        const cleanName = venueName.replace(/['']/g, "'").trim();

        let query = this.supabase
            .from('poker_venues')
            .select('id, name, state')
            .ilike('name', `%${cleanName.split(' ')[0]}%`);

        if (state) {
            query = query.eq('state', state);
        }

        const { data: venues, error } = await query.limit(5);

        if (error || !venues || venues.length === 0) {
            // Try partial match on first significant word
            const words = cleanName.split(' ').filter(w => w.length > 3);
            for (const word of words) {
                const { data: matches } = await this.supabase
                    .from('poker_venues')
                    .select('id, name')
                    .ilike('name', `%${word}%`)
                    .limit(1);

                if (matches && matches.length > 0) {
                    return matches[0].id;
                }
            }
            return null;
        }

        return venues[0].id;
    }

    async saveTournaments(tournaments, source) {
        let saved = 0;

        for (const tournament of tournaments) {
            if (!tournament.venue_name) continue;

            // Try to find venue in database
            const venueId = await this.findVenueId(tournament.venue_name);

            if (!venueId) {
                this.log('⚠️', `Could not find venue: ${tournament.venue_name}`);
                continue;
            }

            const { error } = await this.supabase
                .from('venue_daily_tournaments')
                .upsert({
                    venue_id: venueId,
                    venue_name: tournament.venue_name,
                    day_of_week: tournament.day_of_week || 'Daily',
                    start_time: tournament.start_time,
                    buy_in: tournament.buy_in,
                    guaranteed: tournament.guaranteed,
                    game_type: tournament.game_type || 'NLH',
                    source_url: source,
                    last_scraped: new Date().toISOString()
                }, {
                    onConflict: 'venue_id,day_of_week,start_time'
                });

            if (!error) {
                saved++;
                this.stats.tournamentsFound++;
            }
        }

        return saved;
    }

    async run() {
        console.log('═'.repeat(60));
        console.log('🃏 CARDPLAYER.COM TOURNAMENT SCRAPER');
        console.log('═'.repeat(60));
        console.log(`📅 Started: ${new Date().toISOString()}`);
        console.log('═'.repeat(60));

        await this.initBrowser();

        // Scrape Las Vegas daily tournaments
        console.log('\n📍 Scraping Las Vegas Tournaments...');
        const lvTournaments = await this.scrapeLasVegasPage();
        if (lvTournaments.length > 0) {
            const saved = await this.saveTournaments(lvTournaments, CARDPLAYER_URLS.lasVegas);
            this.log('💾', `Saved ${saved} Las Vegas tournaments`);
        }
        this.stats.pagesProcessed++;

        // Scrape tournament series
        console.log('\n📍 Scraping Tournament Series...');
        const seriesEvents = await this.scrapeTournamentSeriesPage();
        // Series events are typically special events, not daily tournaments
        // Log them for reference but don't save as daily tournaments
        this.log('📋', `Found ${seriesEvents.length} upcoming tournament series`);
        this.stats.pagesProcessed++;

        await this.browser.close();

        console.log('\n' + '═'.repeat(60));
        console.log('📊 CARDPLAYER SCRAPER RESULTS');
        console.log('═'.repeat(60));
        console.log(`Pages Processed:    ${this.stats.pagesProcessed}`);
        console.log(`Tournaments Found:  ${this.stats.tournamentsFound}`);
        console.log(`Errors:             ${this.stats.errors}`);
        console.log('═'.repeat(60));
    }
}

// Run if called directly
if (require.main === module) {
    const scraper = new CardPlayerScraper();
    scraper.run().catch(console.error);
}

module.exports = CardPlayerScraper;
