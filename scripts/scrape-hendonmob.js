#!/usr/bin/env node
/**
 * Hendon Mob Tournament Scraper
 *
 * Scrapes recurring tournament schedules from The Hendon Mob poker database.
 * This provides additional coverage for venues not well-covered by PokerAtlas.
 */

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

require('dotenv').config({ path: '.env.local' });
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const { createClient } = require('@supabase/supabase-js');

puppeteer.use(StealthPlugin());

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Map US state names to abbreviations
const STATE_MAP = {
    'alabama': 'AL', 'alaska': 'AK', 'arizona': 'AZ', 'arkansas': 'AR',
    'california': 'CA', 'colorado': 'CO', 'connecticut': 'CT', 'delaware': 'DE',
    'florida': 'FL', 'georgia': 'GA', 'hawaii': 'HI', 'idaho': 'ID',
    'illinois': 'IL', 'indiana': 'IN', 'iowa': 'IA', 'kansas': 'KS',
    'kentucky': 'KY', 'louisiana': 'LA', 'maine': 'ME', 'maryland': 'MD',
    'massachusetts': 'MA', 'michigan': 'MI', 'minnesota': 'MN', 'mississippi': 'MS',
    'missouri': 'MO', 'montana': 'MT', 'nebraska': 'NE', 'nevada': 'NV',
    'new hampshire': 'NH', 'new jersey': 'NJ', 'new mexico': 'NM', 'new york': 'NY',
    'north carolina': 'NC', 'north dakota': 'ND', 'ohio': 'OH', 'oklahoma': 'OK',
    'oregon': 'OR', 'pennsylvania': 'PA', 'rhode island': 'RI', 'south carolina': 'SC',
    'south dakota': 'SD', 'tennessee': 'TN', 'texas': 'TX', 'utah': 'UT',
    'vermont': 'VT', 'virginia': 'VA', 'washington': 'WA', 'west virginia': 'WV',
    'wisconsin': 'WI', 'wyoming': 'WY'
};

class HendonMobScraper {
    constructor() {
        this.browser = null;
        this.stats = {
            venuesChecked: 0,
            tournamentsFound: 0,
            tournamentsSaved: 0,
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
                '--disable-gpu'
            ]
        });

        this.log('✅', `Browser ready (using: ${executablePath || 'bundled'})`);
    }

    generateHendonMobSlug(name) {
        // Hendon Mob uses lowercase with hyphens
        return name
            .toLowerCase()
            .replace(/[''`]/g, '')
            .replace(/&/g, 'and')
            .replace(/[^a-z0-9\s-]/g, '')
            .replace(/\s+/g, '-')
            .replace(/-+/g, '-')
            .replace(/^-|-$/g, '');
    }

    async checkHendonMobVenue(venue) {
        const page = await this.browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

        const tournaments = [];
        const slug = this.generateHendonMobSlug(venue.name);

        // Try different URL patterns
        const urlPatterns = [
            `https://pokerdb.thehendonmob.com/venues/${slug}/recurring`,
            `https://pokerdb.thehendonmob.com/venues/${slug}`,
            `https://www.thehendonmob.com/venues/${slug}`
        ];

        for (const url of urlPatterns) {
            try {
                await page.goto(url, { waitUntil: 'networkidle2', timeout: 15000 });

                // Check if we found a valid venue page
                const pageContent = await page.content();
                if (pageContent.includes('Page not found') || pageContent.includes('404')) {
                    continue;
                }

                // Look for recurring tournaments
                const foundTournaments = await page.evaluate(() => {
                    const results = [];

                    // Look for tournament schedule tables
                    const tables = document.querySelectorAll('table');
                    tables.forEach(table => {
                        const rows = table.querySelectorAll('tr');
                        rows.forEach(row => {
                            const cells = row.querySelectorAll('td');
                            if (cells.length >= 3) {
                                const text = row.textContent.toLowerCase();
                                // Look for day names and times
                                const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday', 'daily'];
                                const dayMatch = days.find(d => text.includes(d));
                                const timeMatch = text.match(/(\d{1,2}:\d{2}\s*(am|pm)?)/i);
                                const buyInMatch = text.match(/\$(\d+)/);

                                if (dayMatch || timeMatch) {
                                    results.push({
                                        day: dayMatch || 'Daily',
                                        time: timeMatch ? timeMatch[1] : null,
                                        buyIn: buyInMatch ? buyInMatch[1] : null,
                                        text: row.textContent.trim()
                                    });
                                }
                            }
                        });
                    });

                    // Also look for schedule lists
                    const scheduleItems = document.querySelectorAll('.schedule-item, .tournament-item, .recurring-tournament');
                    scheduleItems.forEach(item => {
                        results.push({
                            text: item.textContent.trim()
                        });
                    });

                    return results;
                });

                if (foundTournaments.length > 0) {
                    tournaments.push(...foundTournaments.map(t => ({
                        ...t,
                        sourceUrl: url
                    })));
                    break;
                }

            } catch (e) {
                // Continue to next URL pattern
            }
        }

        await page.close();
        return tournaments;
    }

    async findMatchingVenue(hendonMobVenue) {
        // Try to match Hendon Mob venue to our database
        const { data: venues } = await supabase
            .from('poker_venues')
            .select('id, name, city, state')
            .eq('is_active', true)
            .ilike('name', `%${hendonMobVenue.name}%`);

        if (venues && venues.length === 1) {
            return venues[0];
        }

        // Try city match
        if (hendonMobVenue.city) {
            const { data: cityVenues } = await supabase
                .from('poker_venues')
                .select('id, name, city, state')
                .eq('is_active', true)
                .ilike('city', `%${hendonMobVenue.city}%`);

            if (cityVenues && cityVenues.length > 0) {
                // Find closest name match
                const match = cityVenues.find(v =>
                    v.name.toLowerCase().includes(hendonMobVenue.name.toLowerCase()) ||
                    hendonMobVenue.name.toLowerCase().includes(v.name.toLowerCase())
                );
                if (match) return match;
            }
        }

        return null;
    }

    async saveTournament(venue, tournament) {
        const dayOfWeek = this.normalizeDayOfWeek(tournament.day);
        const startTime = this.normalizeTime(tournament.time);
        const buyIn = tournament.buyIn ? `$${tournament.buyIn}` : null;

        try {
            const { error } = await supabase
                .from('venue_daily_tournaments')
                .upsert({
                    venue_id: venue.id,
                    venue_name: venue.name,
                    day_of_week: dayOfWeek,
                    start_time: startTime,
                    buy_in: buyIn,
                    game_type: 'NLH',
                    source_url: tournament.sourceUrl,
                    last_scraped: new Date().toISOString()
                }, {
                    onConflict: 'venue_id,day_of_week,start_time'
                });

            if (error) {
                this.log('❌', `Failed to save tournament: ${error.message}`);
                return false;
            }
            return true;
        } catch (e) {
            this.log('❌', `Exception saving tournament: ${e.message}`);
            return false;
        }
    }

    normalizeDayOfWeek(day) {
        if (!day) return 'Daily';
        const d = day.toLowerCase();
        if (d.includes('mon')) return 'Monday';
        if (d.includes('tue')) return 'Tuesday';
        if (d.includes('wed')) return 'Wednesday';
        if (d.includes('thu')) return 'Thursday';
        if (d.includes('fri')) return 'Friday';
        if (d.includes('sat')) return 'Saturday';
        if (d.includes('sun')) return 'Sunday';
        return 'Daily';
    }

    normalizeTime(time) {
        if (!time) return '12:00 PM';
        return time.toUpperCase();
    }

    async run(limit = 50) {
        console.log('═'.repeat(60));
        console.log('🎰 HENDON MOB TOURNAMENT SCRAPER');
        console.log('═'.repeat(60));
        console.log(`📅 Started: ${new Date().toISOString()}`);
        console.log('═'.repeat(60));

        await this.initBrowser();

        // Get venues that need additional data sources
        const { data: venues, error } = await supabase
            .from('poker_venues')
            .select('id, name, city, state')
            .eq('is_active', true)
            .in('scrape_status', ['needs_manual', 'no_data'])
            .order('state')
            .limit(limit);

        if (error) {
            this.log('❌', `Database error: ${error.message}`);
            return;
        }

        this.log('📊', `Found ${venues.length} venues to check on Hendon Mob`);

        for (let i = 0; i < venues.length; i++) {
            const venue = venues[i];
            console.log(`\n[${i + 1}/${venues.length}] ─────────────────────────────`);
            this.log('🔍', `Checking: ${venue.name} (${venue.city}, ${venue.state})`);

            try {
                const tournaments = await this.checkHendonMobVenue(venue);
                this.stats.venuesChecked++;

                if (tournaments.length > 0) {
                    this.log('✅', `Found ${tournaments.length} tournaments`);
                    this.stats.tournamentsFound += tournaments.length;

                    for (const t of tournaments) {
                        if (await this.saveTournament(venue, t)) {
                            this.stats.tournamentsSaved++;
                        }
                    }

                    // Update venue status
                    await supabase
                        .from('poker_venues')
                        .update({ scrape_status: 'complete', last_scraped: new Date().toISOString() })
                        .eq('id', venue.id);
                } else {
                    this.log('⚠️', `No tournaments found`);
                }

            } catch (e) {
                this.log('❌', `Error: ${e.message}`);
                this.stats.errors++;
            }

            // Rate limiting
            await new Promise(r => setTimeout(r, 2000));
        }

        await this.browser.close();

        console.log('\n' + '═'.repeat(60));
        console.log('📊 HENDON MOB SCRAPE RESULTS');
        console.log('═'.repeat(60));
        console.log(`Venues Checked:        ${this.stats.venuesChecked}`);
        console.log(`Tournaments Found:     ${this.stats.tournamentsFound}`);
        console.log(`Tournaments Saved:     ${this.stats.tournamentsSaved}`);
        console.log(`Errors:                ${this.stats.errors}`);
        console.log('═'.repeat(60));
    }
}

// Run the scraper
const limit = parseInt(process.argv[2]) || 50;
const scraper = new HendonMobScraper();
scraper.run(limit).catch(console.error);
