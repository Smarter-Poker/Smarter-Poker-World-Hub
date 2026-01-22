#!/usr/bin/env node
/**
 * Venue Daily Tournament Scraper
 *
 * Scrapes daily/nightly tournament schedules from 777 poker venues
 * Primary source: PokerAtlas.com
 *
 * Usage:
 *   node scripts/venue-tournament-scraper.js                  # Scrape all venues
 *   node scripts/venue-tournament-scraper.js --state NV       # Scrape Nevada only
 *   node scripts/venue-tournament-scraper.js --venue "Bellagio" # Single venue
 *   node scripts/venue-tournament-scraper.js --limit 50       # First 50 venues
 *
 * Schedule: Run daily via GitHub Actions at 4am UTC
 */

const { createClient } = require('@supabase/supabase-js');
const https = require('https');

// Load environment variables
require('dotenv').config({ path: '.env.local' });

const POKERATLAS_BASE = 'https://www.pokeratlas.com/poker-room';

// Rate limiting: 1 request per 2 seconds to be respectful
const RATE_LIMIT_MS = 2000;

class VenueTournamentScraper {
    constructor() {
        this.supabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL,
            process.env.SUPABASE_SERVICE_ROLE_KEY
        );

        this.stats = {
            venuesProcessed: 0,
            tournamentsFound: 0,
            tournamentsInserted: 0,
            errors: [],
            skipped: 0
        };
    }

    /**
     * Fetch HTML from URL with retry logic
     */
    async fetchUrl(url, retries = 3) {
        return new Promise((resolve, reject) => {
            const request = https.get(url, {
                headers: {
                    'User-Agent': 'SmarterPoker/1.0 (Tournament Aggregator; contact@smarter.poker)',
                    'Accept': 'text/html,application/xhtml+xml',
                    'Accept-Language': 'en-US,en;q=0.9'
                }
            }, (response) => {
                // Handle redirects
                if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
                    return this.fetchUrl(response.headers.location, retries).then(resolve).catch(reject);
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

            request.setTimeout(10000, () => {
                request.destroy();
                reject(new Error('Timeout'));
            });
        });
    }

    /**
     * Parse PokerAtlas tournament schedule HTML
     * Returns array of daily tournament objects
     */
    parseTournamentSchedule(html, venueName) {
        const tournaments = [];

        // PokerAtlas uses structured tables for tournament schedules
        // Pattern: <tr> with tournament data in <td> cells

        // Match tournament rows - look for buy-in patterns
        const buyinPattern = /\$(\d{1,3}(?:,\d{3})*)/g;
        const timePattern = /(\d{1,2}:\d{2}\s*(?:AM|PM|am|pm))/gi;
        const dayPattern = /(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|Daily)/gi;
        const guaranteePattern = /(?:GTD|Guaranteed)[:\s]*\$?([\d,]+)/gi;

        // Split by table rows
        const rows = html.split(/<tr[^>]*>/gi);

        for (const row of rows) {
            // Skip header rows
            if (row.includes('<th') || !row.includes('$')) continue;

            // Extract cells
            const cellMatches = row.match(/<td[^>]*>([\s\S]*?)<\/td>/gi) || [];
            if (cellMatches.length < 3) continue;

            const cellText = cellMatches.map(cell =>
                cell.replace(/<[^>]+>/g, '').trim()
            );

            // Try to extract tournament data
            const timeMatch = row.match(timePattern);
            const buyinMatch = row.match(buyinPattern);
            const dayMatch = row.match(dayPattern);
            const gtdMatch = row.match(guaranteePattern);

            if (timeMatch && buyinMatch) {
                const buyinStr = buyinMatch[0].replace(/[$,]/g, '');
                const buyin = parseInt(buyinStr);

                if (buyin > 0 && buyin < 100000) { // Sanity check
                    const tournament = {
                        venue_name: venueName,
                        start_time: timeMatch[0].toUpperCase(),
                        buy_in: buyin,
                        day_of_week: dayMatch ? dayMatch[0] : 'Daily',
                        game_type: row.toLowerCase().includes('plo') ? 'PLO' :
                                  row.toLowerCase().includes('omaha') ? 'Omaha' : 'NLH',
                        guaranteed: gtdMatch ? parseInt(gtdMatch[1].replace(/,/g, '')) : null,
                        tournament_name: this.extractTournamentName(cellText)
                    };

                    tournaments.push(tournament);
                }
            }
        }

        return tournaments;
    }

    /**
     * Extract tournament name from cell text
     */
    extractTournamentName(cells) {
        // Look for descriptive text that's not just a number or time
        for (const cell of cells) {
            if (cell.length > 5 &&
                !cell.match(/^\$?\d/) &&
                !cell.match(/^\d{1,2}:\d{2}/) &&
                !cell.match(/^(Mon|Tue|Wed|Thu|Fri|Sat|Sun)/i)) {
                return cell.substring(0, 100); // Limit length
            }
        }
        return null;
    }

    /**
     * Generate PokerAtlas URL slug from venue name
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
     * Scrape a single venue
     */
    async scrapeVenue(venue) {
        const slug = venue.pokeratlas_slug || this.generateSlug(venue.name);
        const url = `${POKERATLAS_BASE}/${slug}/tournaments`;

        try {
            console.log(`  📡 Fetching: ${url}`);
            const html = await this.fetchUrl(url);

            const tournaments = this.parseTournamentSchedule(html, venue.name);
            this.stats.tournamentsFound += tournaments.length;

            if (tournaments.length > 0) {
                // Insert tournaments
                for (const tournament of tournaments) {
                    tournament.venue_id = venue.id;
                    tournament.source_url = url;
                    tournament.last_scraped = new Date().toISOString();

                    const { error } = await this.supabase
                        .from('venue_daily_tournaments')
                        .upsert(tournament, {
                            onConflict: 'venue_id,day_of_week,start_time,buy_in',
                            ignoreDuplicates: false
                        });

                    if (!error) {
                        this.stats.tournamentsInserted++;
                    }
                }

                console.log(`  ✅ Found ${tournaments.length} tournaments`);
            } else {
                console.log(`  ⚠️  No tournaments found (may need manual verification)`);
                this.stats.skipped++;
            }

            // Update venue scrape status
            await this.supabase
                .from('poker_venues')
                .update({
                    pokeratlas_url: url,
                    pokeratlas_slug: slug,
                    last_scraped: new Date().toISOString(),
                    scrape_status: tournaments.length > 0 ? 'complete' : 'no_data'
                })
                .eq('id', venue.id);

        } catch (error) {
            console.log(`  ❌ Error: ${error.message}`);
            this.stats.errors.push({ venue: venue.name, error: error.message });

            // Update venue with error status
            await this.supabase
                .from('poker_venues')
                .update({
                    scrape_status: 'error',
                    last_scraped: new Date().toISOString()
                })
                .eq('id', venue.id);
        }
    }

    /**
     * Sleep helper for rate limiting
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Main execution
     */
    async run(options = {}) {
        console.log('🎰 Venue Daily Tournament Scraper');
        console.log(`📅 ${new Date().toISOString()}`);
        console.log('═'.repeat(50));

        // Build query
        let query = this.supabase
            .from('poker_venues')
            .select('id, name, city, state, pokeratlas_url, pokeratlas_slug, last_scraped')
            .eq('is_active', true)
            .order('name');

        // Apply filters
        if (options.state) {
            query = query.eq('state', options.state.toUpperCase());
        }

        if (options.venue) {
            query = query.ilike('name', `%${options.venue}%`);
        }

        if (options.limit) {
            query = query.limit(parseInt(options.limit));
        }

        // Only scrape venues not scraped in last 24 hours (unless forced)
        if (!options.force) {
            const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
            query = query.or(`last_scraped.is.null,last_scraped.lt.${yesterday}`);
        }

        const { data: venues, error } = await query;

        if (error) {
            console.error('❌ Failed to fetch venues:', error.message);
            process.exit(1);
        }

        console.log(`\n📍 Found ${venues.length} venues to scrape\n`);

        // Process each venue with rate limiting
        for (let i = 0; i < venues.length; i++) {
            const venue = venues[i];
            this.stats.venuesProcessed++;

            console.log(`[${i + 1}/${venues.length}] ${venue.name} (${venue.city}, ${venue.state})`);

            await this.scrapeVenue(venue);

            // Rate limiting
            if (i < venues.length - 1) {
                await this.sleep(RATE_LIMIT_MS);
            }
        }

        // Print report
        this.printReport();

        return this.stats;
    }

    printReport() {
        console.log('\n' + '═'.repeat(50));
        console.log('📊 SCRAPER REPORT');
        console.log('═'.repeat(50));
        console.log(`Venues Processed:      ${this.stats.venuesProcessed}`);
        console.log(`Tournaments Found:     ${this.stats.tournamentsFound}`);
        console.log(`Tournaments Inserted:  ${this.stats.tournamentsInserted}`);
        console.log(`Skipped (no data):     ${this.stats.skipped}`);
        console.log(`Errors:                ${this.stats.errors.length}`);

        if (this.stats.errors.length > 0) {
            console.log('\n⚠️  Errors:');
            this.stats.errors.slice(0, 10).forEach(e => {
                console.log(`   - ${e.venue}: ${e.error}`);
            });
            if (this.stats.errors.length > 10) {
                console.log(`   ... and ${this.stats.errors.length - 10} more`);
            }
        }

        console.log('═'.repeat(50));
    }
}

// CLI argument parsing
function parseArgs() {
    const args = process.argv.slice(2);
    const options = {};

    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--state' && args[i + 1]) {
            options.state = args[++i];
        } else if (args[i] === '--venue' && args[i + 1]) {
            options.venue = args[++i];
        } else if (args[i] === '--limit' && args[i + 1]) {
            options.limit = args[++i];
        } else if (args[i] === '--force') {
            options.force = true;
        }
    }

    return options;
}

// Run if called directly
if (require.main === module) {
    const options = parseArgs();
    const scraper = new VenueTournamentScraper();

    scraper.run(options)
        .then(stats => {
            process.exit(stats.errors.length > 10 ? 1 : 0);
        })
        .catch(error => {
            console.error('Fatal error:', error);
            process.exit(1);
        });
}

module.exports = VenueTournamentScraper;
