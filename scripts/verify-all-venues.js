#!/usr/bin/env node
/**
 * Comprehensive Venue Tournament Verifier
 *
 * Checks multiple sources for each venue to find tournament schedules:
 * 1. PokerAtlas (with smart slug matching)
 * 2. Direct venue website
 * 3. Bravo Poker Live
 *
 * Marks venues as:
 * - 'complete': Found tournaments
 * - 'no_tournaments': Verified no tournaments offered
 * - 'needs_manual': Could not automatically determine
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

class VenueVerifier {
    constructor() {
        this.browser = null;
        this.stats = {
            processed: 0,
            foundTournaments: 0,
            noTournaments: 0,
            needsManual: 0,
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

        this.log('✅', `Browser ready`);
    }

    // Generate possible PokerAtlas slugs from venue name
    generatePossibleSlugs(name, city, state) {
        const slugs = [];

        // Clean the name
        const cleanName = name
            .toLowerCase()
            .replace(/[''`]/g, '')
            .replace(/&/g, 'and')
            .replace(/[^a-z0-9\s-]/g, '')
            .replace(/\s+/g, '-')
            .replace(/-+/g, '-')
            .replace(/^-|-$/g, '');

        slugs.push(cleanName);

        // Without common suffixes
        const withoutSuffixes = cleanName
            .replace(/-?casino-?/g, '-')
            .replace(/-?hotel-?/g, '-')
            .replace(/-?resort-?/g, '-')
            .replace(/-?spa-?/g, '-')
            .replace(/-?poker-?room-?/g, '-')
            .replace(/-?poker-?/g, '-')
            .replace(/-+/g, '-')
            .replace(/^-|-$/g, '');

        if (withoutSuffixes !== cleanName) slugs.push(withoutSuffixes);

        // With city
        const withCity = `${cleanName}-${city.toLowerCase().replace(/\s+/g, '-')}`;
        slugs.push(withCity);

        // First word only
        const firstWord = cleanName.split('-')[0];
        if (firstWord.length > 3) slugs.push(firstWord);

        // Common patterns
        if (name.toLowerCase().includes('card house')) {
            slugs.push(`texas-card-house-${city.toLowerCase().replace(/\s+/g, '-')}`);
        }
        if (name.toLowerCase().includes('hard rock')) {
            slugs.push(`hard-rock-hotel-casino-${city.toLowerCase().replace(/\s+/g, '-')}`);
        }
        if (name.toLowerCase().includes('seminole')) {
            slugs.push(`seminole-${cleanName.replace('seminole-', '')}`);
        }
        if (name.toLowerCase().includes('harrahs') || name.toLowerCase().includes("harrah's")) {
            slugs.push(`harrahs-${city.toLowerCase().replace(/\s+/g, '-')}`);
        }
        if (name.toLowerCase().includes('horseshoe')) {
            slugs.push(`horseshoe-${city.toLowerCase().replace(/\s+/g, '-')}`);
        }
        if (name.toLowerCase().includes('hollywood casino')) {
            slugs.push(`hollywood-casino-${city.toLowerCase().replace(/\s+/g, '-')}`);
        }

        return [...new Set(slugs)]; // Remove duplicates
    }

    async checkPokerAtlas(venue) {
        const page = await this.browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');

        const slugs = this.generatePossibleSlugs(venue.name, venue.city, venue.state);

        for (const slug of slugs.slice(0, 5)) { // Try up to 5 slugs
            const url = `https://www.pokeratlas.com/poker-room/${slug}/tournaments`;

            try {
                await page.goto(url, { waitUntil: 'networkidle2', timeout: 15000 });

                const title = await page.title();

                // Skip 404 pages
                if (title.includes('404') || title.includes('Bad Beat')) {
                    continue;
                }

                // Check for tournament content
                const content = await page.content();
                const bodyText = await page.evaluate(() => document.body?.innerText || '');

                // Look for tournament indicators
                const hasTournaments =
                    bodyText.includes('Buy-In') ||
                    bodyText.includes('buy-in') ||
                    bodyText.includes('$') && bodyText.includes('Daily') ||
                    content.includes('tournament-schedule') ||
                    content.includes('schedule-table');

                const hasNoTournaments =
                    bodyText.includes('No tournaments') ||
                    bodyText.includes('no scheduled tournaments') ||
                    bodyText.includes('does not currently offer');

                if (hasTournaments) {
                    await page.close();
                    return { found: true, url, hasTournaments: true };
                }

                if (hasNoTournaments) {
                    await page.close();
                    return { found: true, url, hasTournaments: false };
                }

                // Found the page but unclear about tournaments
                await page.close();
                return { found: true, url, hasTournaments: null };

            } catch (e) {
                // Continue to next slug
            }
        }

        await page.close();
        return { found: false };
    }

    async checkDirectWebsite(venue) {
        if (!venue.website) return { found: false };

        const page = await this.browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');

        // URLs to try
        const urlsToTry = [
            venue.website,
            venue.website.replace(/\/$/, '') + '/poker',
            venue.website.replace(/\/$/, '') + '/tournaments',
            venue.website.replace(/\/$/, '') + '/poker-room',
            venue.website.replace(/\/$/, '') + '/poker/tournaments'
        ];

        for (const url of urlsToTry) {
            try {
                await page.goto(url, { waitUntil: 'networkidle2', timeout: 15000 });

                const bodyText = await page.evaluate(() => document.body?.innerText?.toLowerCase() || '');

                // Check for tournament keywords
                const tournamentKeywords = [
                    'tournament', 'buy-in', 'buy in', 'guaranteed',
                    'nlh tournament', 'no limit holdem', 'poker tournament',
                    'daily tournament', 'weekly tournament', 'tournament schedule'
                ];

                const noPokerKeywords = [
                    'no poker', 'poker room closed', 'poker room is closed',
                    'poker room temporarily closed', 'we do not offer poker'
                ];

                const hasTournamentKeywords = tournamentKeywords.some(kw => bodyText.includes(kw));
                const hasNoPokerKeywords = noPokerKeywords.some(kw => bodyText.includes(kw));

                if (hasNoPokerKeywords) {
                    await page.close();
                    return { found: true, url, hasTournaments: false, noPoker: true };
                }

                if (hasTournamentKeywords) {
                    // Try to extract tournament details
                    const tournaments = await this.extractTournamentsFromPage(page);
                    await page.close();
                    return { found: true, url, hasTournaments: true, tournaments };
                }

            } catch (e) {
                // Try next URL
            }
        }

        await page.close();
        return { found: false };
    }

    async extractTournamentsFromPage(page) {
        return await page.evaluate(() => {
            const tournaments = [];
            const text = document.body?.innerText || '';

            // Look for patterns like "$50 NLH" or "Buy-in: $100"
            const buyInPattern = /\$(\d+)\s*(NLH|PLO|No Limit|Omaha|tournament)/gi;
            const timePattern = /(\d{1,2}:\d{2}\s*(?:AM|PM|am|pm))/g;
            const dayPattern = /(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|Daily)/gi;

            const buyIns = text.match(buyInPattern) || [];
            const times = text.match(timePattern) || [];
            const days = text.match(dayPattern) || [];

            // Create tournament entries
            for (let i = 0; i < Math.min(buyIns.length, 10); i++) {
                const buyInMatch = buyIns[i].match(/\$(\d+)/);
                tournaments.push({
                    buy_in: buyInMatch ? parseInt(buyInMatch[1]) : null,
                    start_time: times[i] || null,
                    day_of_week: days[i] || 'Daily',
                    game_type: buyIns[i].includes('PLO') ? 'PLO' : 'NLH'
                });
            }

            return tournaments;
        });
    }

    async saveTournaments(venue, tournaments, sourceUrl) {
        for (const t of tournaments) {
            try {
                await supabase
                    .from('venue_daily_tournaments')
                    .upsert({
                        venue_id: venue.id,
                        venue_name: venue.name,
                        day_of_week: t.day_of_week || 'Daily',
                        start_time: t.start_time,
                        buy_in: t.buy_in,
                        game_type: t.game_type || 'NLH',
                        source_url: sourceUrl,
                        last_scraped: new Date().toISOString()
                    }, {
                        onConflict: 'venue_id,day_of_week,start_time'
                    });
            } catch (e) {
                // Continue
            }
        }
    }

    async updateVenueStatus(venueId, status, sourceUrl = null) {
        const update = {
            scrape_status: status,
            last_scraped: new Date().toISOString()
        };

        if (sourceUrl) {
            update.scrape_url = sourceUrl;
        }

        await supabase
            .from('poker_venues')
            .update(update)
            .eq('id', venueId);
    }

    async verifyVenue(venue) {
        this.log('🔍', `Checking: ${venue.name} (${venue.city}, ${venue.state})`);

        // Try PokerAtlas first
        const pokerAtlasResult = await this.checkPokerAtlas(venue);

        if (pokerAtlasResult.found && pokerAtlasResult.hasTournaments === true) {
            this.log('✅', `Found on PokerAtlas with tournaments`);
            await this.updateVenueStatus(venue.id, 'ready', pokerAtlasResult.url);
            this.stats.foundTournaments++;
            return 'found_pa';
        }

        if (pokerAtlasResult.found && pokerAtlasResult.hasTournaments === false) {
            this.log('📝', `Found on PokerAtlas - NO tournaments`);
            await this.updateVenueStatus(venue.id, 'no_tournaments', pokerAtlasResult.url);
            this.stats.noTournaments++;
            return 'no_tournaments_pa';
        }

        // Try direct website
        const websiteResult = await this.checkDirectWebsite(venue);

        if (websiteResult.noPoker) {
            this.log('❌', `Website says no poker offered`);
            await this.updateVenueStatus(venue.id, 'no_poker');
            this.stats.noTournaments++;
            return 'no_poker';
        }

        if (websiteResult.found && websiteResult.hasTournaments && websiteResult.tournaments?.length > 0) {
            this.log('✅', `Found ${websiteResult.tournaments.length} tournaments on website`);
            await this.saveTournaments(venue, websiteResult.tournaments, websiteResult.url);
            await this.updateVenueStatus(venue.id, 'complete', websiteResult.url);
            this.stats.foundTournaments++;
            return 'found_website';
        }

        // Could not determine - needs manual review
        this.log('⚠️', `Could not automatically verify`);
        await this.updateVenueStatus(venue.id, 'needs_manual');
        this.stats.needsManual++;
        return 'needs_manual';
    }

    async run(limit = 100) {
        console.log('═'.repeat(60));
        console.log('🔍 COMPREHENSIVE VENUE TOURNAMENT VERIFIER');
        console.log('═'.repeat(60));
        console.log(`📅 Started: ${new Date().toISOString()}`);
        console.log('═'.repeat(60));

        await this.initBrowser();

        // Get unverified venues
        const { data: venues, error } = await supabase
            .from('poker_venues')
            .select('id, name, city, state, website')
            .eq('is_active', true)
            .eq('scrape_status', 'no_data')
            .order('state')
            .limit(limit);

        if (error) {
            this.log('❌', `Database error: ${error.message}`);
            return;
        }

        this.log('📊', `Found ${venues.length} unverified venues to check`);
        console.log('');

        for (let i = 0; i < venues.length; i++) {
            const venue = venues[i];
            console.log(`\n[${i + 1}/${venues.length}] ─────────────────────────────`);

            try {
                await this.verifyVenue(venue);
            } catch (e) {
                this.log('❌', `Error: ${e.message}`);
                this.stats.errors++;
            }

            this.stats.processed++;

            // Rate limiting
            await new Promise(r => setTimeout(r, 2000));
        }

        await this.browser.close();

        console.log('\n' + '═'.repeat(60));
        console.log('📊 VERIFICATION RESULTS');
        console.log('═'.repeat(60));
        console.log(`Venues Processed:      ${this.stats.processed}`);
        console.log(`Found Tournaments:     ${this.stats.foundTournaments}`);
        console.log(`Verified No Tourn.:    ${this.stats.noTournaments}`);
        console.log(`Needs Manual Review:   ${this.stats.needsManual}`);
        console.log(`Errors:                ${this.stats.errors}`);
        console.log('═'.repeat(60));
    }
}

// Run if called directly
const limit = parseInt(process.argv[2]) || 50;
const verifier = new VenueVerifier();
verifier.run(limit).catch(console.error);
