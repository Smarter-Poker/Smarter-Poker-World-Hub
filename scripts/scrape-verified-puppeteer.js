#!/usr/bin/env node
/**
 * Puppeteer-based scraper for verified venues
 * Uses stealth plugin to bypass Cloudflare
 * Reads venues from local JSON, uses curl for DB updates
 */

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const fs = require('fs');
const { execSync } = require('child_process');

require('dotenv').config({ path: '.env.local' });

const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const stats = {
    venuesProcessed: 0,
    venuesWithTournaments: 0,
    venuesNoTournaments: 0,
    tournamentsFound: 0,
    tournamentsInserted: 0,
    errors: []
};

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function updateVenueStatus(venueId, status, sourceUrl) {
    const data = {
        scrape_status: status,
        last_scraped: new Date().toISOString()
    };
    if (sourceUrl) data.scrape_url = sourceUrl;

    const url = `${SUPABASE_URL}/rest/v1/poker_venues?id=eq.${venueId}`;
    const payload = JSON.stringify(data).replace(/'/g, "'\\''");

    try {
        execSync(`curl -s -X PATCH "${url}" \
            -H "apikey: ${SUPABASE_KEY}" \
            -H "Authorization: Bearer ${SUPABASE_KEY}" \
            -H "Content-Type: application/json" \
            -H "Prefer: return=minimal" \
            -d '${payload}'`,
            { encoding: 'utf8', stdio: 'pipe' }
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
            { encoding: 'utf8', stdio: 'pipe' }
        );
        return true;
    } catch (e) {
        return false;
    }
}

async function scrapeVenue(browser, venue) {
    const page = await browser.newPage();

    await page.setViewport({ width: 1920, height: 1080 });
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    try {
        const url = venue.scrape_url;
        console.log(`  📡 Fetching: ${url}`);

        await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });

        // Wait for page to load
        await sleep(2000);

        // Extract tournament data
        const tournaments = await page.evaluate((venueName) => {
            const results = [];
            const text = document.body?.innerText || '';

            // Look for tournament table rows
            const rows = document.querySelectorAll('table tr, .tournament-row, [class*="schedule"] tr');

            rows.forEach(row => {
                const rowText = row.textContent || '';

                const buyinMatch = rowText.match(/\$(\d+)/);
                const timeMatch = rowText.match(/(\d{1,2}:\d{2}\s*(?:AM|PM|am|pm)?)/i);
                const dayMatch = rowText.match(/(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|Daily)/i);
                const gtdMatch = rowText.match(/\$?([\d,]+)\s*(?:GTD|Guaranteed)/i);

                if (buyinMatch && timeMatch) {
                    const buyin = parseInt(buyinMatch[1]);
                    if (buyin > 0 && buyin < 50000) {
                        results.push({
                            venue_name: venueName,
                            buy_in: buyin,
                            start_time: timeMatch[1].toUpperCase(),
                            day_of_week: dayMatch ? dayMatch[1] : 'Daily',
                            game_type: rowText.toLowerCase().includes('plo') || rowText.toLowerCase().includes('omaha') ? 'PLO' : 'NLH',
                            guaranteed: gtdMatch ? parseInt(gtdMatch[1].replace(/,/g, '')) : null
                        });
                    }
                }
            });

            // Deduplicate
            const seen = new Set();
            return results.filter(t => {
                const key = `${t.buy_in}-${t.start_time}-${t.day_of_week}`;
                if (seen.has(key)) return false;
                seen.add(key);
                return true;
            });
        }, venue.name);

        stats.tournamentsFound += tournaments.length;

        if (tournaments.length > 0) {
            stats.venuesWithTournaments++;
            console.log(`  ✅ Found ${tournaments.length} tournaments`);

            for (const t of tournaments) {
                t.venue_id = venue.id;
                t.source_url = url;
                t.last_scraped = new Date().toISOString();

                if (insertTournament(t)) {
                    stats.tournamentsInserted++;
                }
            }

            updateVenueStatus(venue.id, 'complete', url);
        } else {
            stats.venuesNoTournaments++;
            console.log(`  ⚠️  No tournaments found`);
            updateVenueStatus(venue.id, 'no_tournaments', url);
        }

    } catch (error) {
        console.log(`  ❌ Error: ${error.message}`);
        stats.errors.push({ venue: venue.name, error: error.message });
        updateVenueStatus(venue.id, 'error', venue.scrape_url);
    } finally {
        await page.close();
    }
}

async function main() {
    console.log('🎰 Puppeteer Verified Venue Scraper');
    console.log(`📅 ${new Date().toISOString()}`);
    console.log('═'.repeat(50));

    // Load verified venues
    const venues = JSON.parse(fs.readFileSync('/tmp/verified_venues_to_scrape.json', 'utf8'));
    console.log(`\n📍 Scraping ${venues.length} verified venues\n`);

    // Find Chrome
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

    const browser = await puppeteer.launch({
        headless: 'new',
        executablePath: executablePath || undefined,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
            '--disable-web-security'
        ]
    });

    console.log('✅ Browser launched\n');

    for (let i = 0; i < venues.length; i++) {
        const venue = venues[i];
        stats.venuesProcessed++;

        console.log(`[${i + 1}/${venues.length}] ${venue.name} (${venue.city}, ${venue.state})`);

        await scrapeVenue(browser, venue);

        // Rate limiting
        await sleep(3000);

        // Progress update every 25 venues
        if ((i + 1) % 25 === 0) {
            console.log(`\n📊 Progress: ${i + 1}/${venues.length} | Tournaments: ${stats.tournamentsFound}\n`);
        }
    }

    await browser.close();

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
