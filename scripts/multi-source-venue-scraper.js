#!/usr/bin/env node
/**
 * Multi-Source Venue Tournament Scraper
 *
 * Scrapes daily/nightly tournament schedules from 777 poker venues using multiple sources:
 * 1. PokerAtlas (primary - ~400 venues)
 * 2. Venue official websites (secondary)
 * 3. Web search discovery (tertiary - for unlisted venues)
 * 4. Manual entry queue (for venues requiring human review)
 *
 * Usage:
 *   node scripts/multi-source-venue-scraper.js
 *   node scripts/multi-source-venue-scraper.js --state TX
 *   node scripts/multi-source-venue-scraper.js --source pokeratlas
 *   node scripts/multi-source-venue-scraper.js --discover  # Find new sources via search
 *
 * Schedule: Run daily via GitHub Actions
 */

const { createClient } = require('@supabase/supabase-js');
const https = require('https');

require('dotenv').config({ path: '.env.local' });

// Source priority order
const SOURCES = {
    POKERATLAS: 'pokeratlas',
    VENUE_WEBSITE: 'venue_website',
    CARDPLAYER: 'cardplayer',
    HENDONMOB: 'hendonmob',
    WEBSEARCH: 'websearch',
    MANUAL: 'manual'
};

// Known venue source mappings (hand-verified best sources)
const VENUE_SOURCES = {
    // Texas poker clubs (NOT on PokerAtlas - use official sites)
    'Lodge Poker Club': { source: SOURCES.VENUE_WEBSITE, url: 'https://thelodgeaustin.com/tournaments' },
    'The Lodge': { source: SOURCES.VENUE_WEBSITE, url: 'https://thelodgeaustin.com/tournaments' },
    'Texas Card House Austin': { source: SOURCES.POKERATLAS, slug: 'texas-card-house-austin' },
    'Texas Card House Dallas': { source: SOURCES.POKERATLAS, slug: 'texas-card-house-dallas' },
    'Texas Card House Houston': { source: SOURCES.POKERATLAS, slug: 'texas-card-house-houston' },
    'Prime Social': { source: SOURCES.VENUE_WEBSITE, url: 'https://primesocialclub.com/tournaments' },
    'Champions Club': { source: SOURCES.VENUE_WEBSITE, url: 'https://championsclubpoker.com/tournaments' },
    '52 Social': { source: SOURCES.VENUE_WEBSITE, url: 'https://52social.com/tournaments' },
    'Shuffle 214': { source: SOURCES.VENUE_WEBSITE, url: 'https://shuffle214.com/tournaments' },

    // Florida card rooms
    'Seminole Hard Rock Hollywood': { source: SOURCES.POKERATLAS, slug: 'seminole-hard-rock-hollywood' },
    'Seminole Hard Rock Tampa': { source: SOURCES.POKERATLAS, slug: 'seminole-hard-rock-tampa' },
    'bestbet Jacksonville': { source: SOURCES.POKERATLAS, slug: 'bestbet-jacksonville' },
    'TGT Poker': { source: SOURCES.POKERATLAS, slug: 'tgt-poker-racebook' },
    'Derby Lane': { source: SOURCES.POKERATLAS, slug: 'derby-lane' },
    'Palm Beach Kennel Club': { source: SOURCES.POKERATLAS, slug: 'palm-beach-kennel-club' },

    // California
    'Commerce Casino': { source: SOURCES.POKERATLAS, slug: 'commerce-casino' },
    'Bicycle Casino': { source: SOURCES.POKERATLAS, slug: 'bicycle-casino' },
    'Hustler Casino': { source: SOURCES.POKERATLAS, slug: 'hustler-casino' },
    'Bay 101': { source: SOURCES.POKERATLAS, slug: 'bay-101-casino' },
    'Thunder Valley': { source: SOURCES.POKERATLAS, slug: 'thunder-valley-casino-resort' },

    // Las Vegas
    'Bellagio': { source: SOURCES.POKERATLAS, slug: 'bellagio' },
    'ARIA': { source: SOURCES.POKERATLAS, slug: 'aria-poker-room' },
    'Wynn': { source: SOURCES.POKERATLAS, slug: 'wynn-las-vegas' },
    'Venetian': { source: SOURCES.POKERATLAS, slug: 'venetian-poker-room' },

    // Atlantic City
    'Borgata': { source: SOURCES.POKERATLAS, slug: 'borgata-hotel-casino-spa' },

    // Regional
    'Foxwoods': { source: SOURCES.POKERATLAS, slug: 'foxwoods-resort-casino' },
    'Mohegan Sun': { source: SOURCES.POKERATLAS, slug: 'mohegan-sun-casino' },
    'Parx Casino': { source: SOURCES.POKERATLAS, slug: 'parx-casino' },
    'Maryland Live': { source: SOURCES.POKERATLAS, slug: 'maryland-live-casino' },
};

class MultiSourceVenueScraper {
    constructor() {
        this.supabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL,
            process.env.SUPABASE_SERVICE_ROLE_KEY
        );

        this.stats = {
            venuesProcessed: 0,
            tournamentsFound: 0,
            tournamentsInserted: 0,
            sourceBreakdown: {
                pokeratlas: 0,
                venue_website: 0,
                websearch: 0,
                manual_queue: 0,
                errors: 0
            },
            errors: [],
            needsManualReview: []
        };
    }

    /**
     * Fetch HTML from URL
     */
    async fetchUrl(url, retries = 3) {
        return new Promise((resolve, reject) => {
            const urlObj = new URL(url);
            const protocol = urlObj.protocol === 'https:' ? https : require('http');

            const request = protocol.get(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (compatible; SmarterPoker/1.0; +https://smarter.poker)',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9',
                    'Accept-Language': 'en-US,en;q=0.9'
                }
            }, (response) => {
                if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
                    let redirectUrl = response.headers.location;
                    if (!redirectUrl.startsWith('http')) {
                        redirectUrl = `${urlObj.protocol}//${urlObj.host}${redirectUrl}`;
                    }
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
                    await this.sleep(1000);
                    this.fetchUrl(url, retries - 1).then(resolve).catch(reject);
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
     * Determine best source for a venue
     */
    getVenueSource(venue) {
        // Check known mappings first
        if (VENUE_SOURCES[venue.name]) {
            return VENUE_SOURCES[venue.name];
        }

        // Check if venue has a manually set source
        if (venue.scrape_source && venue.scrape_url) {
            return { source: venue.scrape_source, url: venue.scrape_url };
        }

        // Check if on PokerAtlas (generate slug)
        if (venue.pokeratlas_slug) {
            return { source: SOURCES.POKERATLAS, slug: venue.pokeratlas_slug };
        }

        // Default: try PokerAtlas with generated slug
        const slug = this.generateSlug(venue.name);
        return { source: SOURCES.POKERATLAS, slug, tentative: true };
    }

    /**
     * Generate URL slug from venue name
     */
    generateSlug(name) {
        return name
            .toLowerCase()
            .replace(/['']/g, '')
            .replace(/&/g, 'and')
            .replace(/[^a-z0-9\s-]/g, '')
            .replace(/\s+/g, '-')
            .replace(/-+/g, '-')
            .replace(/^-|-$/g, '');
    }

    /**
     * Parse PokerAtlas tournament page
     */
    parsePokerAtlas(html, venue) {
        const tournaments = [];

        // PokerAtlas has structured tournament tables
        // Look for tournament entries with buy-in, time, day patterns
        const tournamentBlocks = html.match(/<tr[^>]*class="[^"]*tournament[^"]*"[^>]*>[\s\S]*?<\/tr>/gi) || [];

        for (const block of tournamentBlocks) {
            const tournament = this.extractTournamentData(block, venue);
            if (tournament) {
                tournaments.push(tournament);
            }
        }

        // Also try generic table parsing
        if (tournaments.length === 0) {
            const genericTournaments = this.parseGenericTournamentTable(html, venue);
            tournaments.push(...genericTournaments);
        }

        return tournaments;
    }

    /**
     * Parse generic tournament table HTML
     */
    parseGenericTournamentTable(html, venue) {
        const tournaments = [];
        const rows = html.split(/<tr[^>]*>/gi);

        const buyinPattern = /\$(\d{1,3}(?:,\d{3})*|\d+)/g;
        const timePattern = /(\d{1,2}:\d{2}\s*(?:AM|PM|am|pm)?)/gi;
        const dayPattern = /(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|Daily|Mon|Tue|Wed|Thu|Fri|Sat|Sun)/gi;

        for (const row of rows) {
            if (row.includes('<th') || !row.includes('$')) continue;

            const buyinMatches = row.match(buyinPattern);
            const timeMatches = row.match(timePattern);
            const dayMatches = row.match(dayPattern);

            if (buyinMatches && timeMatches) {
                const buyin = parseInt(buyinMatches[0].replace(/[$,]/g, ''));

                if (buyin > 0 && buyin < 50000) {
                    tournaments.push({
                        venue_id: venue.id,
                        venue_name: venue.name,
                        day_of_week: dayMatches ? this.normalizeDay(dayMatches[0]) : 'Daily',
                        start_time: this.normalizeTime(timeMatches[0]),
                        buy_in: buyin,
                        game_type: this.detectGameType(row),
                        source_url: venue.scrape_url,
                        last_scraped: new Date().toISOString()
                    });
                }
            }
        }

        return tournaments;
    }

    /**
     * Extract tournament data from HTML block
     */
    extractTournamentData(html, venue) {
        const buyinMatch = html.match(/\$(\d{1,3}(?:,\d{3})*|\d+)/);
        const timeMatch = html.match(/(\d{1,2}:\d{2}\s*(?:AM|PM|am|pm)?)/i);
        const dayMatch = html.match(/(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|Daily)/i);
        const gtdMatch = html.match(/(?:GTD|Guaranteed)[:\s]*\$?([\d,]+)/i);
        const nameMatch = html.match(/<td[^>]*>([^<]+(?:Tournament|Bounty|Deep ?Stack|Turbo|NLH|PLO)[^<]*)<\/td>/i);

        if (!buyinMatch || !timeMatch) return null;

        const buyin = parseInt(buyinMatch[1].replace(/,/g, ''));
        if (buyin <= 0 || buyin > 50000) return null;

        return {
            venue_id: venue.id,
            venue_name: venue.name,
            day_of_week: dayMatch ? this.normalizeDay(dayMatch[1]) : 'Daily',
            start_time: this.normalizeTime(timeMatch[1]),
            buy_in: buyin,
            tournament_name: nameMatch ? nameMatch[1].trim() : null,
            guaranteed: gtdMatch ? parseInt(gtdMatch[1].replace(/,/g, '')) : null,
            game_type: this.detectGameType(html),
            source_url: venue.scrape_url,
            last_scraped: new Date().toISOString()
        };
    }

    /**
     * Detect game type from text
     */
    detectGameType(text) {
        const lower = text.toLowerCase();
        if (lower.includes('plo') || lower.includes('pot limit omaha')) return 'PLO';
        if (lower.includes('omaha hi-lo') || lower.includes('o8')) return 'Omaha Hi-Lo';
        if (lower.includes('omaha')) return 'Omaha';
        if (lower.includes('stud')) return 'Stud';
        if (lower.includes('mixed')) return 'Mixed';
        return 'NLH';
    }

    /**
     * Normalize day of week
     */
    normalizeDay(day) {
        const mapping = {
            'mon': 'Monday', 'tue': 'Tuesday', 'wed': 'Wednesday',
            'thu': 'Thursday', 'fri': 'Friday', 'sat': 'Saturday', 'sun': 'Sunday'
        };
        const lower = day.toLowerCase().substring(0, 3);
        return mapping[lower] || day;
    }

    /**
     * Normalize time format
     */
    normalizeTime(time) {
        // Ensure consistent format: "7:00 PM"
        return time.toUpperCase().replace(/\s+/g, ' ').trim();
    }

    /**
     * Search web for venue tournament schedule URL
     */
    async discoverTournamentUrl(venue) {
        // This would use a web search API to find tournament pages
        // For now, return null and queue for manual review
        const searchQuery = `${venue.name} ${venue.city} ${venue.state} poker tournament schedule`;
        console.log(`  🔍 Would search: "${searchQuery}"`);

        // Placeholder - would call search API
        return null;
    }

    /**
     * Scrape venue using appropriate source
     */
    async scrapeVenue(venue) {
        const sourceInfo = this.getVenueSource(venue);
        let url, html, tournaments = [];

        try {
            switch (sourceInfo.source) {
                case SOURCES.POKERATLAS:
                    url = `https://www.pokeratlas.com/poker-room/${sourceInfo.slug}/tournaments`;
                    console.log(`  📡 [PokerAtlas] ${url}`);
                    html = await this.fetchUrl(url);
                    tournaments = this.parsePokerAtlas(html, { ...venue, scrape_url: url });
                    this.stats.sourceBreakdown.pokeratlas++;
                    break;

                case SOURCES.VENUE_WEBSITE:
                    url = sourceInfo.url;
                    console.log(`  📡 [Venue Site] ${url}`);
                    html = await this.fetchUrl(url);
                    tournaments = this.parseGenericTournamentTable(html, { ...venue, scrape_url: url });
                    this.stats.sourceBreakdown.venue_website++;
                    break;

                case SOURCES.WEBSEARCH:
                    url = await this.discoverTournamentUrl(venue);
                    if (url) {
                        console.log(`  📡 [Discovered] ${url}`);
                        html = await this.fetchUrl(url);
                        tournaments = this.parseGenericTournamentTable(html, { ...venue, scrape_url: url });
                        this.stats.sourceBreakdown.websearch++;
                    } else {
                        throw new Error('No tournament page discovered');
                    }
                    break;

                default:
                    throw new Error('Unknown source type');
            }

            this.stats.tournamentsFound += tournaments.length;

            // Insert tournaments
            if (tournaments.length > 0) {
                for (const tournament of tournaments) {
                    const { error } = await this.supabase
                        .from('venue_daily_tournaments')
                        .upsert(tournament, {
                            onConflict: 'venue_id,day_of_week,start_time,buy_in'
                        });

                    if (!error) {
                        this.stats.tournamentsInserted++;
                    }
                }

                console.log(`  ✅ Found ${tournaments.length} tournaments`);
            } else if (sourceInfo.tentative) {
                // Tentative source failed - queue for manual review
                console.log(`  ⚠️  No data found - queuing for manual review`);
                this.stats.needsManualReview.push(venue);
                this.stats.sourceBreakdown.manual_queue++;
            }

            // Update venue record
            await this.supabase
                .from('poker_venues')
                .update({
                    pokeratlas_url: sourceInfo.source === SOURCES.POKERATLAS ? url : null,
                    pokeratlas_slug: sourceInfo.slug || null,
                    scrape_source: sourceInfo.source,
                    scrape_url: url,
                    last_scraped: new Date().toISOString(),
                    scrape_status: tournaments.length > 0 ? 'complete' : 'no_data'
                })
                .eq('id', venue.id);

        } catch (error) {
            console.log(`  ❌ Error: ${error.message}`);
            this.stats.errors.push({ venue: venue.name, error: error.message });
            this.stats.sourceBreakdown.errors++;

            // If tentative PokerAtlas failed, queue for manual review
            if (sourceInfo.tentative) {
                this.stats.needsManualReview.push(venue);
            }

            await this.supabase
                .from('poker_venues')
                .update({
                    scrape_status: 'error',
                    last_scraped: new Date().toISOString()
                })
                .eq('id', venue.id);
        }
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Main execution
     */
    async run(options = {}) {
        console.log('🎰 Multi-Source Venue Tournament Scraper');
        console.log(`📅 ${new Date().toISOString()}`);
        console.log('═'.repeat(60));

        // Build query
        let query = this.supabase
            .from('poker_venues')
            .select('*')
            .eq('is_active', true)
            .order('state', { ascending: true })
            .order('name', { ascending: true });

        if (options.state) {
            query = query.eq('state', options.state.toUpperCase());
        }

        if (options.venue) {
            query = query.ilike('name', `%${options.venue}%`);
        }

        if (options.source) {
            query = query.eq('scrape_source', options.source);
        }

        if (options.limit) {
            query = query.limit(parseInt(options.limit));
        }

        // Skip recently scraped unless forced
        if (!options.force && !options.discover) {
            const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
            query = query.or(`last_scraped.is.null,last_scraped.lt.${yesterday}`);
        }

        const { data: venues, error } = await query;

        if (error) {
            console.error('❌ Failed to fetch venues:', error.message);
            process.exit(1);
        }

        console.log(`\n📍 Processing ${venues.length} venues\n`);

        for (let i = 0; i < venues.length; i++) {
            const venue = venues[i];
            this.stats.venuesProcessed++;

            console.log(`[${i + 1}/${venues.length}] ${venue.name} (${venue.city}, ${venue.state})`);

            await this.scrapeVenue(venue);

            // Rate limiting: 2 seconds between requests
            if (i < venues.length - 1) {
                await this.sleep(2000);
            }
        }

        this.printReport();

        // Export manual review queue if any
        if (this.stats.needsManualReview.length > 0) {
            await this.exportManualReviewQueue();
        }

        return this.stats;
    }

    /**
     * Export venues needing manual review
     */
    async exportManualReviewQueue() {
        console.log('\n📋 MANUAL REVIEW QUEUE');
        console.log('─'.repeat(60));

        for (const venue of this.stats.needsManualReview.slice(0, 20)) {
            console.log(`  • ${venue.name} (${venue.city}, ${venue.state})`);
            console.log(`    Website: ${venue.website || 'Unknown'}`);
        }

        if (this.stats.needsManualReview.length > 20) {
            console.log(`  ... and ${this.stats.needsManualReview.length - 20} more`);
        }
    }

    printReport() {
        console.log('\n' + '═'.repeat(60));
        console.log('📊 SCRAPER REPORT');
        console.log('═'.repeat(60));
        console.log(`Venues Processed:      ${this.stats.venuesProcessed}`);
        console.log(`Tournaments Found:     ${this.stats.tournamentsFound}`);
        console.log(`Tournaments Inserted:  ${this.stats.tournamentsInserted}`);
        console.log('');
        console.log('Source Breakdown:');
        console.log(`  PokerAtlas:          ${this.stats.sourceBreakdown.pokeratlas}`);
        console.log(`  Venue Websites:      ${this.stats.sourceBreakdown.venue_website}`);
        console.log(`  Web Search:          ${this.stats.sourceBreakdown.websearch}`);
        console.log(`  Manual Queue:        ${this.stats.sourceBreakdown.manual_queue}`);
        console.log(`  Errors:              ${this.stats.sourceBreakdown.errors}`);
        console.log('═'.repeat(60));
    }
}

// CLI
function parseArgs() {
    const args = process.argv.slice(2);
    const options = {};

    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--state' && args[i + 1]) options.state = args[++i];
        else if (args[i] === '--venue' && args[i + 1]) options.venue = args[++i];
        else if (args[i] === '--source' && args[i + 1]) options.source = args[++i];
        else if (args[i] === '--limit' && args[i + 1]) options.limit = args[++i];
        else if (args[i] === '--force') options.force = true;
        else if (args[i] === '--discover') options.discover = true;
    }

    return options;
}

if (require.main === module) {
    const options = parseArgs();
    const scraper = new MultiSourceVenueScraper();

    scraper.run(options)
        .then(stats => {
            process.exit(stats.errors.length > 20 ? 1 : 0);
        })
        .catch(error => {
            console.error('Fatal error:', error);
            process.exit(1);
        });
}

module.exports = MultiSourceVenueScraper;
