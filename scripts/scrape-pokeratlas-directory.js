#!/usr/bin/env node
/**
 * Scrape PokerAtlas Directory to get correct venue URLs
 * This gets the actual slugs PokerAtlas uses for each venue
 */

const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const { createClient } = require('@supabase/supabase-js');

puppeteer.use(StealthPlugin());
require('dotenv').config({ path: '.env.local' });

const CONFIG = {
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
    supabaseKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
};

const supabase = createClient(CONFIG.supabaseUrl, CONFIG.supabaseKey);

// US States to scrape
const STATES = [
    'alabama', 'arizona', 'arkansas', 'california', 'colorado', 'connecticut',
    'delaware', 'florida', 'georgia', 'idaho', 'illinois', 'indiana', 'iowa',
    'kansas', 'kentucky', 'louisiana', 'maine', 'maryland', 'massachusetts',
    'michigan', 'minnesota', 'mississippi', 'missouri', 'montana', 'nebraska',
    'nevada', 'new-hampshire', 'new-jersey', 'new-mexico', 'new-york',
    'north-carolina', 'north-dakota', 'ohio', 'oklahoma', 'oregon', 'pennsylvania',
    'rhode-island', 'south-carolina', 'south-dakota', 'tennessee', 'texas',
    'utah', 'virginia', 'washington', 'west-virginia', 'wisconsin', 'wyoming'
];

async function scrapeStateDirectory(browser, state) {
    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });

    const url = `https://www.pokeratlas.com/poker-rooms/${state}`;
    console.log(`\n📍 Scraping ${state}...`);

    try {
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
        await page.waitForSelector('body', { timeout: 10000 });

        // Wait for content
        await new Promise(r => setTimeout(r, 3000));

        // Extract venue links
        const venues = await page.evaluate(() => {
            const results = [];
            // Look for poker room links
            const links = document.querySelectorAll('a[href*="/poker-room/"]');

            links.forEach(link => {
                const href = link.href;
                const match = href.match(/\/poker-room\/([^\/]+)/);
                if (match) {
                    const slug = match[1];
                    const name = link.textContent.trim();
                    if (name && slug && !results.find(r => r.slug === slug)) {
                        results.push({
                            name: name,
                            slug: slug,
                            url: `https://www.pokeratlas.com/poker-room/${slug}/tournaments`
                        });
                    }
                }
            });

            return results;
        });

        console.log(`   Found ${venues.length} venues`);
        return venues;

    } catch (error) {
        console.log(`   Error: ${error.message}`);
        return [];
    } finally {
        await page.close();
    }
}

async function main() {
    console.log('🎰 PokerAtlas Directory Scraper');
    console.log('================================\n');

    const browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    });

    const allVenues = [];

    for (const state of STATES) {
        const venues = await scrapeStateDirectory(browser, state);
        allVenues.push(...venues.map(v => ({ ...v, state })));
        await new Promise(r => setTimeout(r, 2000)); // Rate limit
    }

    await browser.close();

    console.log(`\n\n📊 Total venues found: ${allVenues.length}`);

    // Update database with correct URLs
    console.log('\n🔄 Updating database with correct URLs...');

    let updated = 0;
    for (const venue of allVenues) {
        // Try to match by name
        const { data, error } = await supabase
            .from('poker_venues')
            .update({
                pokeratlas_slug: venue.slug,
                pokeratlas_url: venue.url,
                scrape_url: venue.url,
                scrape_source: 'pokeratlas',
                scrape_status: 'ready'
            })
            .ilike('name', `%${venue.name.split(' ')[0]}%`)
            .select();

        if (data && data.length > 0) {
            updated += data.length;
        }
    }

    console.log(`✅ Updated ${updated} venues with correct PokerAtlas URLs`);

    // Save full list
    const fs = require('fs');
    fs.writeFileSync('/tmp/pokeratlas-venues.json', JSON.stringify(allVenues, null, 2));
    console.log('\n📄 Saved full venue list to /tmp/pokeratlas-venues.json');
}

main().catch(console.error);
