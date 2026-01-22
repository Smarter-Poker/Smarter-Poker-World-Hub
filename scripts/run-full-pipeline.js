#!/usr/bin/env node
/**
 * Full Poker Data Pipeline Orchestrator
 *
 * This is the MASTER SCRIPT that runs the complete tournament/venue data pipeline:
 * 1. Database setup (migrations)
 * 2. Series finalization (40 tournament series)
 * 3. Venue URL setup (777 venues)
 * 4. Tournament series scraping
 * 5. Venue daily tournament scraping
 *
 * Usage:
 *   node scripts/run-full-pipeline.js              # Run everything
 *   node scripts/run-full-pipeline.js --setup-only # Just setup, no scraping
 *   node scripts/run-full-pipeline.js --scrape-only # Just scraping
 *   node scripts/run-full-pipeline.js --test       # Test with 10 venues
 *   node scripts/run-full-pipeline.js --state TX   # Scrape Texas only
 */

const { createClient } = require('@supabase/supabase-js');
const https = require('https');
const http = require('http');

require('dotenv').config({ path: '.env.local' });

// Configuration
const CONFIG = {
    baseUrl: process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000',
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
    supabaseKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    rateLimitMs: 2000,  // 2 seconds between requests
    maxRetries: 3,
    testLimit: 10
};

class PipelineOrchestrator {
    constructor(options = {}) {
        this.options = options;
        this.supabase = createClient(CONFIG.supabaseUrl, CONFIG.supabaseKey);
        this.stats = {
            startTime: Date.now(),
            setupSteps: [],
            seriesProcessed: 0,
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

    /**
     * Main execution
     */
    async run() {
        console.log('═'.repeat(60));
        console.log('🎰 POKER DATA PIPELINE ORCHESTRATOR');
        console.log('═'.repeat(60));
        console.log(`📅 Started: ${new Date().toISOString()}`);
        console.log(`🔧 Mode: ${this.options.setupOnly ? 'Setup Only' : this.options.scrapeOnly ? 'Scrape Only' : 'Full Pipeline'}`);
        console.log('═'.repeat(60));

        try {
            // PHASE 1: Setup (unless scrape-only)
            if (!this.options.scrapeOnly) {
                await this.runSetupPhase();
            }

            // PHASE 2: Scraping (unless setup-only)
            if (!this.options.setupOnly) {
                await this.runScrapingPhase();
            }

            // PHASE 3: Report
            this.printFinalReport();

        } catch (error) {
            this.log('❌', `Fatal error: ${error.message}`);
            this.stats.errors.push({ phase: 'main', error: error.message });
            throw error;
        }
    }

    /**
     * PHASE 1: Database Setup
     */
    async runSetupPhase() {
        console.log('\n' + '─'.repeat(60));
        console.log('📦 PHASE 1: DATABASE SETUP');
        console.log('─'.repeat(60));

        // Step 1.1: Verify database connection
        this.log('🔌', 'Verifying database connection...');
        const { count: venueCount, error: venueError } = await this.supabase
            .from('poker_venues')
            .select('*', { count: 'exact', head: true });

        if (venueError) {
            throw new Error(`Database connection failed: ${venueError.message}`);
        }
        this.log('✅', `Connected! Found ${venueCount} venues in database`);
        this.stats.setupSteps.push({ step: 'DB Connection', status: 'success', venues: venueCount });

        // Step 1.2: Check tournament series
        const { count: seriesCount } = await this.supabase
            .from('tournament_series')
            .select('*', { count: 'exact', head: true });

        this.log('📊', `Found ${seriesCount} tournament series`);
        this.stats.setupSteps.push({ step: 'Series Count', count: seriesCount });

        // Step 1.3: Add final 2 series if not present
        if (seriesCount < 40) {
            this.log('📝', 'Adding final tournament series...');
            await this.addFinalSeries();
        }

        // Step 1.4: Setup venue scrape URLs
        this.log('🔗', 'Setting up venue scrape URLs...');
        await this.setupVenueScrapeUrls();
    }

    /**
     * Add ARIA Poker Classic and U.S. Poker Open
     */
    async addFinalSeries() {
        const FINAL_SERIES = [
            {
                name: 'ARIA Poker Classic Summer 2026',
                short_name: 'ARIA',
                location: 'Las Vegas, NV',
                start_date: '2026-05-28',
                end_date: '2026-07-13',
                total_events: 45,
                series_type: 'major',
                is_featured: true
            },
            {
                name: 'U.S. Poker Open 2026',
                short_name: 'USPO',
                location: 'Las Vegas, NV',
                start_date: '2026-06-01',
                end_date: '2026-06-15',
                total_events: 12,
                series_type: 'major',
                is_featured: true
            }
        ];

        const { data, error } = await this.supabase
            .from('tournament_series')
            .upsert(FINAL_SERIES, { onConflict: 'name,start_date' })
            .select();

        if (error) {
            this.log('⚠️', `Series upsert warning: ${error.message}`);
        } else {
            this.log('✅', `Added/updated ${data?.length || 0} series`);
        }
        this.stats.setupSteps.push({ step: 'Add Final Series', status: error ? 'warning' : 'success' });
    }

    /**
     * Setup PokerAtlas URLs for all venues
     */
    async setupVenueScrapeUrls() {
        // Known venue slug mappings
        const VENUE_SLUGS = {
            'Bellagio': 'bellagio',
            'ARIA': 'aria-poker-room',
            'Wynn': 'wynn-las-vegas',
            'Wynn Las Vegas': 'wynn-las-vegas',
            'Venetian': 'venetian-poker-room',
            'Venetian Las Vegas': 'venetian-poker-room',
            'MGM Grand': 'mgm-grand-poker-room',
            'Commerce Casino': 'commerce-casino',
            'Bicycle Casino': 'bicycle-casino',
            'Hustler Casino': 'hustler-casino',
            'Bay 101': 'bay-101-casino',
            'Thunder Valley': 'thunder-valley-casino-resort',
            'Seminole Hard Rock Hollywood': 'seminole-hard-rock-hollywood',
            'Seminole Hard Rock Tampa': 'seminole-hard-rock-tampa',
            'bestbet Jacksonville': 'bestbet-jacksonville',
            'Borgata': 'borgata-hotel-casino-spa',
            'Parx Casino': 'parx-casino',
            'Foxwoods': 'foxwoods-resort-casino',
            'Mohegan Sun': 'mohegan-sun-casino',
            'Maryland Live': 'maryland-live-casino',
            'MGM National Harbor': 'mgm-national-harbor',
            'Lodge Poker Club': 'the-lodge-card-club',
            'Texas Card House': 'texas-card-house',
            'Choctaw': 'choctaw-casino-durant',
            'Hard Rock Tulsa': 'hard-rock-hotel-casino-tulsa',
            'Talking Stick': 'talking-stick-resort',
            'FireKeepers': 'firekeepers-casino-hotel',
            'Canterbury Park': 'canterbury-park',
            'Running Aces': 'running-aces-casino',
            'Beau Rivage': 'beau-rivage-resort-casino',
        };

        // Venues that need official website (not on PokerAtlas)
        const VENUE_WEBSITES = {
            'Lodge Poker Club': 'https://thelodgeaustin.com/tournaments',
            'Prime Social': 'https://primesocialclub.com/tournaments',
            'Champions Club': 'https://championsclubpoker.com/tournaments',
            '52 Social': 'https://52social.com/tournaments',
        };

        // Get venues needing URL setup
        const { data: venues, error } = await this.supabase
            .from('poker_venues')
            .select('id, name, city, state')
            .or('pokeratlas_url.is.null,scrape_status.eq.pending')
            .limit(this.options.test ? CONFIG.testLimit : 1000);

        if (error) {
            this.log('❌', `Failed to fetch venues: ${error.message}`);
            return;
        }

        this.log('📍', `Processing ${venues?.length || 0} venues...`);

        let updated = 0;
        for (const venue of venues || []) {
            // Check for known slug
            let slug = null;
            let source = 'pokeratlas';
            let scrapeUrl = null;

            // Check venue website mapping first
            for (const [name, url] of Object.entries(VENUE_WEBSITES)) {
                if (venue.name.includes(name)) {
                    source = 'venue_website';
                    scrapeUrl = url;
                    break;
                }
            }

            // Check PokerAtlas slugs
            if (!scrapeUrl) {
                for (const [name, knownSlug] of Object.entries(VENUE_SLUGS)) {
                    if (venue.name.includes(name)) {
                        slug = knownSlug;
                        break;
                    }
                }

                // Generate slug if not known
                if (!slug) {
                    slug = this.generateSlug(venue.name);
                }

                scrapeUrl = `https://www.pokeratlas.com/poker-room/${slug}/tournaments`;
            }

            // Update venue
            const { error: updateError } = await this.supabase
                .from('poker_venues')
                .update({
                    pokeratlas_slug: slug,
                    pokeratlas_url: source === 'pokeratlas' ? scrapeUrl : null,
                    scrape_source: source,
                    scrape_url: scrapeUrl,
                    scrape_status: 'ready'
                })
                .eq('id', venue.id);

            if (!updateError) updated++;
        }

        this.log('✅', `Updated ${updated} venue URLs`);
        this.stats.setupSteps.push({ step: 'Venue URLs', status: 'success', updated });
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
     * PHASE 2: Scraping
     */
    async runScrapingPhase() {
        console.log('\n' + '─'.repeat(60));
        console.log('🕷️  PHASE 2: DATA SCRAPING');
        console.log('─'.repeat(60));

        // Build query
        let query = this.supabase
            .from('poker_venues')
            .select('id, name, city, state, scrape_url, scrape_source, pokeratlas_slug')
            .eq('is_active', true)
            .in('scrape_status', ['ready', 'pending'])
            .order('state')
            .order('name');

        // Apply filters
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

        this.log('📍', `Scraping ${venues?.length || 0} venues...`);

        // Process each venue
        for (let i = 0; i < (venues?.length || 0); i++) {
            const venue = venues[i];
            this.stats.venuesProcessed++;

            console.log(`\n[${i + 1}/${venues.length}] ${venue.name} (${venue.city}, ${venue.state})`);

            try {
                const tournaments = await this.scrapeVenue(venue);
                this.stats.tournamentsFound += tournaments.length;

                if (tournaments.length > 0) {
                    this.log('✅', `Found ${tournaments.length} tournaments`);

                    // Insert tournaments
                    await this.insertTournaments(venue.id, venue.name, tournaments);

                    // Update venue status
                    await this.supabase
                        .from('poker_venues')
                        .update({
                            scrape_status: 'complete',
                            last_scraped: new Date().toISOString()
                        })
                        .eq('id', venue.id);
                } else {
                    this.log('⚠️', 'No tournaments found');

                    await this.supabase
                        .from('poker_venues')
                        .update({
                            scrape_status: 'no_data',
                            last_scraped: new Date().toISOString()
                        })
                        .eq('id', venue.id);
                }

            } catch (error) {
                this.log('❌', `Error: ${error.message}`);
                this.stats.errors.push({ venue: venue.name, error: error.message });

                await this.supabase
                    .from('poker_venues')
                    .update({
                        scrape_status: 'error',
                        last_scraped: new Date().toISOString()
                    })
                    .eq('id', venue.id);
            }

            // Rate limiting
            if (i < venues.length - 1) {
                await this.sleep(CONFIG.rateLimitMs);
            }
        }
    }

    /**
     * Scrape a single venue
     */
    async scrapeVenue(venue) {
        const url = venue.scrape_url;
        if (!url) return [];

        this.log('📡', `Fetching: ${url}`);

        try {
            const html = await this.fetchUrl(url);
            return this.parseTournaments(html, venue);
        } catch (error) {
            throw new Error(`Fetch failed: ${error.message}`);
        }
    }

    /**
     * Fetch URL with retries
     */
    async fetchUrl(url, retries = CONFIG.maxRetries) {
        return new Promise((resolve, reject) => {
            const urlObj = new URL(url);
            const protocol = urlObj.protocol === 'https:' ? https : http;

            const request = protocol.get(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (compatible; SmarterPoker/1.0)',
                    'Accept': 'text/html,application/xhtml+xml',
                    'Accept-Language': 'en-US,en;q=0.9'
                }
            }, (response) => {
                // Handle redirects
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
     * Parse tournament data from HTML
     */
    parseTournaments(html, venue) {
        const tournaments = [];

        // Match patterns for tournament data
        const buyinPattern = /\$(\d{1,3}(?:,\d{3})*|\d+)/g;
        const timePattern = /(\d{1,2}:\d{2}\s*(?:AM|PM|am|pm)?)/gi;
        const dayPattern = /(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|Daily|Mon|Tue|Wed|Thu|Fri|Sat|Sun)/gi;
        const gtdPattern = /(?:GTD|Guaranteed)[:\s]*\$?([\d,]+)/gi;

        // Split by table rows
        const rows = html.split(/<tr[^>]*>/gi);

        for (const row of rows) {
            if (row.includes('<th') || !row.includes('$')) continue;

            const buyinMatches = row.match(buyinPattern);
            const timeMatches = row.match(timePattern);
            const dayMatches = row.match(dayPattern);
            const gtdMatches = row.match(gtdPattern);

            if (buyinMatches && timeMatches) {
                const buyin = parseInt(buyinMatches[0].replace(/[$,]/g, ''));

                if (buyin > 0 && buyin < 50000) {
                    tournaments.push({
                        day_of_week: dayMatches ? this.normalizeDay(dayMatches[0]) : 'Daily',
                        start_time: timeMatches[0].toUpperCase(),
                        buy_in: buyin,
                        guaranteed: gtdMatches ? parseInt(gtdMatches[0].replace(/[^0-9]/g, '')) : null,
                        game_type: this.detectGameType(row)
                    });
                }
            }
        }

        return tournaments;
    }

    normalizeDay(day) {
        const mapping = {
            'mon': 'Monday', 'tue': 'Tuesday', 'wed': 'Wednesday',
            'thu': 'Thursday', 'fri': 'Friday', 'sat': 'Saturday', 'sun': 'Sunday'
        };
        return mapping[day.toLowerCase().substring(0, 3)] || day;
    }

    detectGameType(text) {
        const lower = text.toLowerCase();
        if (lower.includes('plo')) return 'PLO';
        if (lower.includes('omaha')) return 'Omaha';
        if (lower.includes('stud')) return 'Stud';
        if (lower.includes('mixed')) return 'Mixed';
        return 'NLH';
    }

    /**
     * Insert tournaments into database
     */
    async insertTournaments(venueId, venueName, tournaments) {
        for (const tournament of tournaments) {
            const record = {
                venue_id: venueId,
                venue_name: venueName,
                ...tournament,
                source_url: tournaments.scrape_url,
                last_scraped: new Date().toISOString(),
                is_active: true
            };

            const { error } = await this.supabase
                .from('venue_daily_tournaments')
                .upsert(record, {
                    onConflict: 'venue_id,day_of_week,start_time,buy_in'
                });

            if (error && !error.message.includes('duplicate')) {
                this.log('⚠️', `Insert warning: ${error.message}`);
            }
        }
    }

    /**
     * Print final report
     */
    printFinalReport() {
        const elapsed = Math.round((Date.now() - this.stats.startTime) / 1000);

        console.log('\n' + '═'.repeat(60));
        console.log('📊 FINAL REPORT');
        console.log('═'.repeat(60));
        console.log(`Duration:           ${elapsed} seconds`);
        console.log(`Venues Processed:   ${this.stats.venuesProcessed}`);
        console.log(`Tournaments Found:  ${this.stats.tournamentsFound}`);
        console.log(`Errors:             ${this.stats.errors.length}`);

        if (this.stats.setupSteps.length > 0) {
            console.log('\nSetup Steps:');
            this.stats.setupSteps.forEach(step => {
                console.log(`  • ${step.step}: ${step.status || step.count || 'done'}`);
            });
        }

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
    }
}

// CLI argument parsing
function parseArgs() {
    const args = process.argv.slice(2);
    const options = {};

    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--setup-only') options.setupOnly = true;
        else if (args[i] === '--scrape-only') options.scrapeOnly = true;
        else if (args[i] === '--test') options.test = true;
        else if (args[i] === '--state' && args[i + 1]) options.state = args[++i];
        else if (args[i] === '--limit' && args[i + 1]) options.limit = parseInt(args[++i]);
    }

    return options;
}

// Main execution
if (require.main === module) {
    const options = parseArgs();
    const orchestrator = new PipelineOrchestrator(options);

    orchestrator.run()
        .then(() => {
            console.log('\n✅ Pipeline completed successfully!');
            process.exit(0);
        })
        .catch(error => {
            console.error('\n❌ Pipeline failed:', error.message);
            process.exit(1);
        });
}

module.exports = PipelineOrchestrator;
