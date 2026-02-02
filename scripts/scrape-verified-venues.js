#!/usr/bin/env node
/**
 * Scrape Verified Venues
 *
 * Scrapes all 295 verified venues using local JSON file
 * Uses https module for scraping and curl for database updates
 */

const fs = require('fs');
const https = require('https');
const { execSync } = require('child_process');

require('dotenv').config({ path: '.env.local' });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const RATE_LIMIT_MS = 2000;

const stats = {
    venuesProcessed: 0,
    tournamentsFound: 0,
    tournamentsInserted: 0,
    venuesWithTournaments: 0,
    venuesNoTournaments: 0,
    errors: []
};

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function fetchUrl(url, retries = 3) {
    return new Promise((resolve, reject) => {
        const request = https.get(url, {
            headers: {
                'User-Agent': 'SmarterPoker/1.0 (Tournament Aggregator)',
                'Accept': 'text/html,application/xhtml+xml',
                'Accept-Language': 'en-US,en;q=0.9'
            }
        }, (response) => {
            if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
                return fetchUrl(response.headers.location, retries).then(resolve).catch(reject);
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
                await sleep(1000);
                fetchUrl(url, retries - 1).then(resolve).catch(reject);
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

function parseTournaments(html, venueName) {
    const tournaments = [];
    const buyinPattern = /\$(\d{1,3}(?:,\d{3})*)/g;
    const timePattern = /(\d{1,2}:\d{2}\s*(?:AM|PM|am|pm))/gi;
    const dayPattern = /(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|Daily)/gi;
    const guaranteePattern = /(?:GTD|Guaranteed)[:\s]*\$?([\d,]+)/gi;

    const rows = html.split(/<tr[^>]*>/gi);

    for (const row of rows) {
        if (row.includes('<th') || !row.includes('$')) continue;

        const cellMatches = row.match(/<td[^>]*>([\s\S]*?)<\/td>/gi) || [];
        if (cellMatches.length < 3) continue;

        const cellText = cellMatches.map(cell =>
            cell.replace(/<[^>]+>/g, '').trim()
        );

        const timeMatch = row.match(timePattern);
        const buyinMatch = row.match(buyinPattern);
        const dayMatch = row.match(dayPattern);
        const gtdMatch = row.match(guaranteePattern);

        if (timeMatch && buyinMatch) {
            const buyinStr = buyinMatch[0].replace(/[$,]/g, '');
            const buyin = parseInt(buyinStr);

            if (buyin > 0 && buyin < 100000) {
                let tournamentName = null;
                for (const cell of cellText) {
                    if (cell.length > 5 &&
                        !cell.match(/^\$?\d/) &&
                        !cell.match(/^\d{1,2}:\d{2}/) &&
                        !cell.match(/^(Mon|Tue|Wed|Thu|Fri|Sat|Sun)/i)) {
                        tournamentName = cell.substring(0, 100);
                        break;
                    }
                }

                tournaments.push({
                    venue_name: venueName,
                    start_time: timeMatch[0].toUpperCase(),
                    buy_in: buyin,
                    day_of_week: dayMatch ? dayMatch[0] : 'Daily',
                    game_type: row.toLowerCase().includes('plo') ? 'PLO' :
                              row.toLowerCase().includes('omaha') ? 'Omaha' : 'NLH',
                    guaranteed: gtdMatch ? parseInt(gtdMatch[1].replace(/,/g, '')) : null,
                    tournament_name: tournamentName
                });
            }
        }
    }

    return tournaments;
}

function updateViaAPI(endpoint, data, method = 'POST') {
    const payload = JSON.stringify(data);
    const url = `${SUPABASE_URL}/rest/v1/${endpoint}`;

    try {
        const result = execSync(`curl -s -X ${method} "${url}" \
            -H "apikey: ${SUPABASE_KEY}" \
            -H "Authorization: Bearer ${SUPABASE_KEY}" \
            -H "Content-Type: application/json" \
            -H "Prefer: return=minimal" \
            -d '${payload.replace(/'/g, "'\\''")}'`,
            { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 }
        );
        return { success: true, result };
    } catch (e) {
        return { success: false, error: e.message };
    }
}

function updateVenueStatus(venueId, status, sourceUrl) {
    const data = {
        scrape_status: status,
        last_scraped: new Date().toISOString(),
        scrape_url: sourceUrl
    };

    const url = `${SUPABASE_URL}/rest/v1/poker_venues?id=eq.${venueId}`;

    try {
        execSync(`curl -s -X PATCH "${url}" \
            -H "apikey: ${SUPABASE_KEY}" \
            -H "Authorization: Bearer ${SUPABASE_KEY}" \
            -H "Content-Type: application/json" \
            -H "Prefer: return=minimal" \
            -d '${JSON.stringify(data).replace(/'/g, "'\\''")}'`,
            { encoding: 'utf8' }
        );
        return true;
    } catch (e) {
        return false;
    }
}

function insertTournament(tournament) {
    const url = `${SUPABASE_URL}/rest/v1/venue_daily_tournaments`;
    const payload = JSON.stringify(tournament).replace(/'/g, "'\\''");

    try {
        execSync(`curl -s -X POST "${url}" \
            -H "apikey: ${SUPABASE_KEY}" \
            -H "Authorization: Bearer ${SUPABASE_KEY}" \
            -H "Content-Type: application/json" \
            -H "Prefer: return=minimal,resolution=merge-duplicates" \
            -d '${payload}'`,
            { encoding: 'utf8' }
        );
        return true;
    } catch (e) {
        return false;
    }
}

async function scrapeVenue(venue) {
    const url = venue.scrape_url;

    try {
        console.log(`  📡 Fetching: ${url}`);
        const html = await fetchUrl(url);

        const tournaments = parseTournaments(html, venue.name);
        stats.tournamentsFound += tournaments.length;

        if (tournaments.length > 0) {
            stats.venuesWithTournaments++;

            for (const tournament of tournaments) {
                tournament.venue_id = venue.id;
                tournament.source_url = url;
                tournament.last_scraped = new Date().toISOString();

                if (insertTournament(tournament)) {
                    stats.tournamentsInserted++;
                }
            }

            console.log(`  ✅ Found ${tournaments.length} tournaments`);
        } else {
            stats.venuesNoTournaments++;
            console.log(`  ⚠️  No tournaments found`);
        }

        // Update venue status
        updateVenueStatus(venue.id, tournaments.length > 0 ? 'complete' : 'no_tournaments', url);

    } catch (error) {
        console.log(`  ❌ Error: ${error.message}`);
        stats.errors.push({ venue: venue.name, error: error.message });
        updateVenueStatus(venue.id, 'error', url);
    }
}

async function main() {
    console.log('🎰 Verified Venue Tournament Scraper');
    console.log(`📅 ${new Date().toISOString()}`);
    console.log('═'.repeat(50));

    // Load verified venues from local file
    const venues = JSON.parse(fs.readFileSync('/tmp/verified_venues_to_scrape.json', 'utf8'));
    console.log(`\n📍 Scraping ${venues.length} verified venues\n`);

    for (let i = 0; i < venues.length; i++) {
        const venue = venues[i];
        stats.venuesProcessed++;

        console.log(`[${i + 1}/${venues.length}] ${venue.name} (${venue.city}, ${venue.state})`);

        await scrapeVenue(venue);

        // Rate limiting
        if (i < venues.length - 1) {
            await sleep(RATE_LIMIT_MS);
        }

        // Progress update every 25 venues
        if ((i + 1) % 25 === 0) {
            console.log(`\n📊 Progress: ${i + 1}/${venues.length} venues | ${stats.tournamentsFound} tournaments found\n`);
        }
    }

    // Final report
    console.log('\n' + '═'.repeat(50));
    console.log('📊 FINAL SCRAPER REPORT');
    console.log('═'.repeat(50));
    console.log(`Venues Processed:        ${stats.venuesProcessed}`);
    console.log(`Venues with Tournaments: ${stats.venuesWithTournaments}`);
    console.log(`Venues no Tournaments:   ${stats.venuesNoTournaments}`);
    console.log(`Tournaments Found:       ${stats.tournamentsFound}`);
    console.log(`Tournaments Inserted:    ${stats.tournamentsInserted}`);
    console.log(`Errors:                  ${stats.errors.length}`);

    if (stats.errors.length > 0) {
        console.log('\n⚠️  Errors:');
        stats.errors.slice(0, 20).forEach(e => {
            console.log(`   - ${e.venue}: ${e.error}`);
        });
    }

    console.log('═'.repeat(50));
}

main().catch(console.error);
