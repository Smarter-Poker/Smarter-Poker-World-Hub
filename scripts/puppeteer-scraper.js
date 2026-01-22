#!/usr/bin/env node
/**
 * Puppeteer-based scraper for PokerAtlas
 * Uses headless Chrome to bypass Cloudflare protection
 */

const puppeteer = require('puppeteer');
const { createClient } = require('@supabase/supabase-js');

require('dotenv').config({ path: '.env.local' });

const CONFIG = {
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
    supabaseKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    rateLimitMs: 3000
};

class PuppeteerScraper {
    constructor() {
        this.supabase = createClient(CONFIG.supabaseUrl, CONFIG.supabaseKey);
        this.browser = null;
    }

    async init() {
        this.browser = await puppeteer.launch({
            headless: 'new',
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--disable-gpu'
            ]
        });
    }

    async close() {
        if (this.browser) await this.browser.close();
    }

    async scrapeVenue(venue) {
        const page = await this.browser.newPage();
        
        // Set realistic viewport and user agent
        await page.setViewport({ width: 1920, height: 1080 });
        await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        
        try {
            const url = venue.scrape_url || venue.pokeratlas_url;
            if (!url) return [];

            console.log(`  Fetching: ${url}`);
            await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
            
            // Wait for content
            await page.waitForSelector('body', { timeout: 10000 });
            
            // Extract tournament data
            const tournaments = await page.evaluate(() => {
                const results = [];
                const rows = document.querySelectorAll('table tr, .tournament-row, [class*="tournament"]');
                
                rows.forEach(row => {
                    const text = row.textContent;
                    const buyinMatch = text.match(/\$(\d+)/);
                    const timeMatch = text.match(/(\d{1,2}:\d{2}\s*(?:AM|PM)?)/i);
                    const dayMatch = text.match(/(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|Daily)/i);
                    
                    if (buyinMatch && timeMatch) {
                        results.push({
                            buy_in: parseInt(buyinMatch[1]),
                            start_time: timeMatch[1],
                            day_of_week: dayMatch ? dayMatch[1] : 'Daily',
                            game_type: text.includes('PLO') ? 'PLO' : 'NLH'
                        });
                    }
                });
                
                return results;
            });

            return tournaments;
        } catch (error) {
            console.log(`  Error: ${error.message}`);
            return [];
        } finally {
            await page.close();
        }
    }

    async run() {
        console.log('🎰 Puppeteer Scraper Starting...\n');
        
        await this.init();
        
        // Get venues
        const { data: venues } = await this.supabase
            .from('poker_venues')
            .select('id, name, city, state, scrape_url, pokeratlas_url')
            .eq('state', 'NV')
            .limit(5);

        let totalTournaments = 0;

        for (const venue of venues) {
            console.log(`\n[${venue.name}] (${venue.city}, ${venue.state})`);
            
            const tournaments = await this.scrapeVenue(venue);
            console.log(`  Found ${tournaments.length} tournaments`);
            
            // Insert tournaments
            for (const t of tournaments) {
                try {
                    await this.supabase.from('venue_daily_tournaments').upsert({
                        venue_id: venue.id,
                        venue_name: venue.name,
                        day_of_week: t.day_of_week,
                        start_time: t.start_time,
                        buy_in: t.buy_in,
                        game_type: t.game_type,
                        source_url: venue.scrape_url || venue.pokeratlas_url
                    }, { onConflict: 'venue_id,day_of_week,start_time,buy_in' });
                    totalTournaments++;
                } catch (e) {
                    console.log(`  Insert error: ${e.message}`);
                }
            }
            
            await new Promise(r => setTimeout(r, CONFIG.rateLimitMs));
        }

        await this.close();
        console.log(`\n✅ Done! Total tournaments: ${totalTournaments}`);
    }
}

new PuppeteerScraper().run().catch(console.error);
