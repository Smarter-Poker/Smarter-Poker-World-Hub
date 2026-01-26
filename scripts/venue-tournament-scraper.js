#!/usr/bin/env node
/**
 * Venue Daily Tournament Scraper
 *
 * SOURCE OF TRUTH: data/tournament-venues.json
 * Only scrapes from 163 venues with confirmed daily tournaments
 *
 * Sources:
 *   - PokerAtlas (primary) - URLs stored in tournament-venues.json
 *   - Direct venue websites (fallback)
 *
 * Usage:
 *   node scripts/venue-tournament-scraper.js                  # Scrape all tournament venues
 *   node scripts/venue-tournament-scraper.js --state TX       # Scrape Texas only
 *   node scripts/venue-tournament-scraper.js --venue "Lodge"  # Single venue
 *   node scripts/venue-tournament-scraper.js --limit 50       # First 50 venues
 *   node scripts/venue-tournament-scraper.js --force          # Re-scrape even if recent
 *
 * Schedule: Run daily via GitHub Actions at 4am UTC
 */

const { createClient } = require('@supabase/supabase-js');
const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

// Load environment variables
require('dotenv').config({ path: '.env.local' });

// Load Source of Truth: Tournament venues
const TOURNAMENT_VENUES_PATH = path.join(__dirname, '../data/tournament-venues.json');
let TOURNAMENT_VENUES = { venues: [] };
try {
    TOURNAMENT_VENUES = JSON.parse(fs.readFileSync(TOURNAMENT_VENUES_PATH, 'utf8'));
    console.log(`Loaded ${TOURNAMENT_VENUES.venues.length} tournament venues from source of truth`);
} catch (e) {
    console.warn('Warning: Could not load tournament-venues.json, will use database');
}

// Rate limiting: 2 seconds between requests
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
            skipped: 0,
            bySource: {
                pokeratlas: { processed: 0, found: 0 },
                direct_website: { processed: 0, found: 0 },
                manual: { skipped: 0 }
            }
        };
    }

    /**
     * Fetch HTML from URL with retry logic
     */
    async fetchUrl(url, retries = 3) {
        const protocol = url.startsWith('https') ? https : http;

        return new Promise((resolve, reject) => {
            const request = protocol.get(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                    'Accept-Language': 'en-US,en;q=0.9',
                    'Accept-Encoding': 'identity'
                }
            }, (response) => {
                // Handle redirects
                if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
                    let redirectUrl = response.headers.location;
                    if (!redirectUrl.startsWith('http')) {
                        const urlObj = new URL(url);
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
     * Parse PokerAtlas tournament schedule HTML
     */
    parsePokerAtlasTournaments(html, venueName) {
        const tournaments = [];

        // PokerAtlas tournament page structure:
        // Look for tournament schedule tables and rows

        // Common patterns for tournament data
        const rows = html.split(/<tr[^>]*>/gi);

        for (const row of rows) {
            // Skip rows without dollar amounts (not tournament data)
            if (!row.includes('$')) continue;

            // Skip header rows
            if (row.includes('<th')) continue;

            // Extract cell contents
            const cells = [];
            const cellMatches = row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi);
            for (const match of cellMatches) {
                cells.push(match[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
            }

            if (cells.length < 2) continue;

            // Try to parse tournament info
            const fullText = cells.join(' ');

            // Extract buy-in (required)
            const buyinMatch = fullText.match(/\$(\d{1,3}(?:,\d{3})*)/);
            if (!buyinMatch) continue;

            const buyin = parseInt(buyinMatch[1].replace(/,/g, ''));
            if (buyin < 10 || buyin > 50000) continue; // Sanity check

            // Extract time
            const timeMatch = fullText.match(/(\d{1,2}:\d{2}\s*(?:AM|PM|am|pm)?)/i);
            const startTime = timeMatch ? timeMatch[1].toUpperCase().replace(/\s/g, '') : null;
            if (!startTime) continue;

            // Extract day of week
            const dayMatch = fullText.match(/(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|Mon|Tue|Wed|Thu|Fri|Sat|Sun|Daily)/i);
            let dayOfWeek = 'Daily';
            if (dayMatch) {
                const dayMap = {
                    'mon': 'Monday', 'tue': 'Tuesday', 'wed': 'Wednesday',
                    'thu': 'Thursday', 'fri': 'Friday', 'sat': 'Saturday', 'sun': 'Sunday'
                };
                dayOfWeek = dayMap[dayMatch[1].toLowerCase().substring(0, 3)] || dayMatch[1];
            }

            // Extract guarantee
            const gtdMatch = fullText.match(/(?:GTD|Guaranteed|G\s*=)[:\s]*\$?([\d,]+)/i);
            const guaranteed = gtdMatch ? parseInt(gtdMatch[1].replace(/,/g, '')) : null;

            // Extract game type
            let gameType = 'NLH';
            if (/\bPLO\b/i.test(fullText)) gameType = 'PLO';
            else if (/\bOmaha\b/i.test(fullText)) gameType = 'Omaha';
            else if (/\bLimit\b/i.test(fullText) && !/No.?Limit/i.test(fullText)) gameType = 'Limit';

            // Extract format
            let format = null;
            if (/turbo/i.test(fullText)) format = 'Turbo';
            else if (/deep\s*stack/i.test(fullText)) format = 'Deep Stack';
            else if (/bounty|knockout/i.test(fullText)) format = 'Bounty';
            else if (/rebuy/i.test(fullText)) format = 'Rebuy';

            // Extract tournament name (first non-numeric cell or descriptive text)
            let tournamentName = null;
            for (const cell of cells) {
                if (cell.length > 5 &&
                    !/^\$?\d/.test(cell) &&
                    !/^\d{1,2}:\d{2}/.test(cell) &&
                    !/(Mon|Tue|Wed|Thu|Fri|Sat|Sun|Daily)/i.test(cell)) {
                    tournamentName = cell.substring(0, 100);
                    break;
                }
            }

            tournaments.push({
                venue_name: venueName,
                day_of_week: dayOfWeek,
                start_time: startTime,
                buy_in: buyin,
                game_type: gameType,
                format: format,
                guaranteed: guaranteed,
                tournament_name: tournamentName
            });
        }

        // Dedupe by day/time/buyin
        const seen = new Set();
        return tournaments.filter(t => {
            const key = `${t.day_of_week}-${t.start_time}-${t.buy_in}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
    }

    /**
     * Parse generic venue website for tournaments
     * This is a best-effort parser for various website formats
     */
    parseDirectWebsiteTournaments(html, venueName, url) {
        const tournaments = [];

        // Look for common tournament patterns in any HTML
        const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

        // Pattern: "$XX buy-in" or "Buy-in: $XX" with time and day
        const tournamentBlocks = text.split(/(?=\$\d)/);

        for (const block of tournamentBlocks) {
            if (block.length > 500) continue; // Skip huge blocks

            const buyinMatch = block.match(/\$(\d{1,3}(?:,\d{3})*)/);
            if (!buyinMatch) continue;

            const buyin = parseInt(buyinMatch[1].replace(/,/g, ''));
            if (buyin < 10 || buyin > 50000) continue;

            const timeMatch = block.match(/(\d{1,2}:\d{2}\s*(?:AM|PM)?)/i);
            if (!timeMatch) continue;

            const dayMatch = block.match(/(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|Daily)/i);

            tournaments.push({
                venue_name: venueName,
                day_of_week: dayMatch ? dayMatch[1] : 'Daily',
                start_time: timeMatch[1].toUpperCase().replace(/\s/g, ''),
                buy_in: buyin,
                game_type: /PLO|Omaha/i.test(block) ? 'PLO' : 'NLH',
                format: /turbo/i.test(block) ? 'Turbo' : null,
                guaranteed: null,
                tournament_name: null
            });
        }

        // Dedupe
        const seen = new Set();
        return tournaments.filter(t => {
            const key = `${t.day_of_week}-${t.start_time}-${t.buy_in}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
    }

    /**
     * Scrape a single venue based on its scrape source
     */
    async scrapeVenue(venue) {
        const source = venue.scrape_source || 'manual';

        // Skip manual-only venues
        if (source === 'manual' || !venue.scrape_url) {
            console.log(`  -- Skipped (no scrape URL)`);
            this.stats.skipped++;
            this.stats.bySource.manual.skipped++;
            return;
        }

        let url = venue.scrape_url;
        let tournaments = [];

        try {
            if (source === 'pokeratlas') {
                // PokerAtlas: append /tournaments to get schedule page
                url = venue.pokeratlas_url || venue.scrape_url;
                if (!url.endsWith('/tournaments')) {
                    url = url.replace(/\/$/, '') + '/tournaments';
                }

                console.log(`  [PokerAtlas] ${url}`);
                const html = await this.fetchUrl(url);
                tournaments = this.parsePokerAtlasTournaments(html, venue.name);
                this.stats.bySource.pokeratlas.processed++;
                this.stats.bySource.pokeratlas.found += tournaments.length;

            } else if (source === 'direct_website') {
                // Direct website scraping
                url = venue.scrape_url;
                if (!url.startsWith('http')) {
                    url = 'https://' + url;
                }

                // Try common poker/tournament paths
                const paths = ['', '/poker', '/poker/tournaments', '/tournaments', '/poker-room'];

                for (const path of paths) {
                    try {
                        const tryUrl = url.replace(/\/$/, '') + path;
                        console.log(`  [Direct] Trying: ${tryUrl}`);
                        const html = await this.fetchUrl(tryUrl);
                        tournaments = this.parseDirectWebsiteTournaments(html, venue.name, tryUrl);

                        if (tournaments.length > 0) {
                            url = tryUrl;
                            break;
                        }
                    } catch (e) {
                        // Try next path
                    }
                }

                this.stats.bySource.direct_website.processed++;
                this.stats.bySource.direct_website.found += tournaments.length;
            }

            this.stats.tournamentsFound += tournaments.length;

            if (tournaments.length > 0) {
                // Insert tournaments
                for (const tournament of tournaments) {
                    tournament.venue_id = venue.id;
                    tournament.source_url = url;
                    tournament.last_scraped = new Date().toISOString();
                    tournament.is_active = true;

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

                console.log(`  ++ Found ${tournaments.length} tournaments`);
            } else {
                console.log(`  ?? No tournaments found`);
                this.stats.skipped++;
            }

            // Update venue scrape status
            await this.supabase
                .from('poker_venues')
                .update({
                    last_scraped: new Date().toISOString(),
                    scrape_status: tournaments.length > 0 ? 'complete' : 'no_tournaments'
                })
                .eq('id', venue.id);

        } catch (error) {
            console.log(`  !! Error: ${error.message}`);
            this.stats.errors.push({ venue: venue.name, error: error.message, url });

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

    async run(options = {}) {
        console.log('='.repeat(60));
        console.log('VENUE DAILY TOURNAMENT SCRAPER');
        console.log(`Source of Truth: data/tournament-venues.json`);
        console.log(`Started: ${new Date().toISOString()}`);
        console.log('='.repeat(60));

        // Create set of tournament venue names for filtering
        const tournamentVenueNames = new Set(
            TOURNAMENT_VENUES.venues.map(v => v.name.toLowerCase())
        );
        const tournamentVenuesByName = new Map(
            TOURNAMENT_VENUES.venues.map(v => [v.name.toLowerCase(), v])
        );

        console.log(`\nFiltering to ${tournamentVenueNames.size} venues with confirmed tournaments`);

        // Build query
        let query = this.supabase
            .from('poker_venues')
            .select('id, name, city, state, scrape_source, scrape_url, pokeratlas_url, last_scraped')
            .eq('is_active', true)
            .order('name');

        // Apply filters
        if (options.state) {
            query = query.eq('state', options.state.toUpperCase());
        }

        if (options.venue) {
            query = query.ilike('name', `%${options.venue}%`);
        }

        if (options.source) {
            query = query.eq('scrape_source', options.source);
        }

        // Only scrape venues not scraped in last 24 hours (unless forced)
        if (!options.force) {
            const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
            query = query.or(`last_scraped.is.null,last_scraped.lt.${yesterday}`);
        }

        let { data: venues, error } = await query;

        // Filter to only tournament venues from source of truth
        if (venues && TOURNAMENT_VENUES.venues.length > 0) {
            const beforeCount = venues.length;
            venues = venues.filter(v => {
                const match = tournamentVenueNames.has(v.name.toLowerCase());
                if (match) {
                    // Enrich with PokerAtlas URL from source of truth if missing
                    const sourceVenue = tournamentVenuesByName.get(v.name.toLowerCase());
                    if (sourceVenue?.pokerAtlasUrl && !v.pokeratlas_url) {
                        v.pokeratlas_url = sourceVenue.pokerAtlasUrl;
                        v.scrape_source = 'pokeratlas';
                    }
                }
                return match;
            });
            console.log(`Filtered from ${beforeCount} to ${venues.length} tournament venues`);
        }

        // Apply limit after filtering
        if (options.limit) {
            venues = venues.slice(0, parseInt(options.limit));
        }

        if (error) {
            console.error('Failed to fetch venues:', error.message);
            process.exit(1);
        }

        // Count by source
        const sourceCount = { pokeratlas: 0, direct_website: 0, manual: 0 };
        venues.forEach(v => {
            sourceCount[v.scrape_source || 'manual']++;
        });

        console.log(`\nFound ${venues.length} venues to process:`);
        console.log(`  - PokerAtlas:     ${sourceCount.pokeratlas}`);
        console.log(`  - Direct Website: ${sourceCount.direct_website}`);
        console.log(`  - Manual (skip):  ${sourceCount.manual}`);
        console.log('');

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

        this.printReport();
        return this.stats;
    }

    printReport() {
        console.log('\n' + '='.repeat(60));
        console.log('SCRAPER REPORT');
        console.log('='.repeat(60));
        console.log(`Venues Processed:      ${this.stats.venuesProcessed}`);
        console.log(`Tournaments Found:     ${this.stats.tournamentsFound}`);
        console.log(`Tournaments Inserted:  ${this.stats.tournamentsInserted}`);
        console.log(`Skipped (no data):     ${this.stats.skipped}`);
        console.log(`Errors:                ${this.stats.errors.length}`);
        console.log('');
        console.log('By Source:');
        console.log(`  PokerAtlas:     ${this.stats.bySource.pokeratlas.processed} processed, ${this.stats.bySource.pokeratlas.found} tournaments`);
        console.log(`  Direct Website: ${this.stats.bySource.direct_website.processed} processed, ${this.stats.bySource.direct_website.found} tournaments`);
        console.log(`  Manual:         ${this.stats.bySource.manual.skipped} skipped`);

        if (this.stats.errors.length > 0) {
            console.log('\nErrors (first 10):');
            this.stats.errors.slice(0, 10).forEach(e => {
                console.log(`  - ${e.venue}: ${e.error}`);
            });
            if (this.stats.errors.length > 10) {
                console.log(`  ... and ${this.stats.errors.length - 10} more`);
            }
        }

        console.log('='.repeat(60));
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
        } else if (args[i] === '--source' && args[i + 1]) {
            options.source = args[++i];
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
