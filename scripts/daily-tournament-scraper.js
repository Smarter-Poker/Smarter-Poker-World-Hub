#!/usr/bin/env node
/**
 * Daily Tournament Scraper
 * 
 * Checks poker_series for missing event data and scrapes from source URLs.
 * Runs daily via GitHub Actions.
 * 
 * Usage: node scripts/daily-tournament-scraper.js
 */

const { createClient } = require('@supabase/supabase-js');

// Tour-specific scraper configurations
const TOUR_SCRAPERS = {
    'WSOP Circuit': {
        baseUrl: 'https://www.wsop.com/tournaments/',
        urlPattern: (seriesName) => {
            const slug = seriesName.toLowerCase()
                .replace(/wsop circuit /i, '2026-wsop-circuit-')
                .replace(/\s+/g, '-')
                .replace(/[^a-z0-9-]/g, '');
            return `https://www.wsop.com/tournaments/${slug}/`;
        },
        checkInterval: 7, // days between checks
    },
    'WPT Main Tour': {
        baseUrl: 'https://www.worldpokertour.com/schedule/',
        checkInterval: 7,
    },
    'WPT Prime': {
        baseUrl: 'https://www.worldpokertour.com/schedule/',
        checkInterval: 7,
    },
    'RunGood Poker Series': {
        baseUrl: 'https://rungood.com/schedule/',
        checkInterval: 14, // RGPS releases schedules later
    },
    'MSPT': {
        baseUrl: 'https://msptpoker.com/schedule/',
        checkInterval: 7,
    },
    'Venetian Poker Room': {
        baseUrl: 'https://www.venetianlasvegas.com/casino/poker.html',
        checkInterval: 14,
    },
};

class TournamentScraper {
    constructor() {
        this.supabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL,
            process.env.SUPABASE_SERVICE_ROLE_KEY
        );
        this.stats = {
            seriesChecked: 0,
            eventsFound: 0,
            eventsInserted: 0,
            errors: [],
        };
    }

    async run() {
        console.log('🎰 Daily Tournament Scraper Started');
        console.log(`📅 Date: ${new Date().toISOString()}`);
        console.log('─'.repeat(50));

        try {
            // 1. Get series needing updates
            const seriesToCheck = await this.getSeriesToCheck();
            console.log(`📋 Found ${seriesToCheck.length} series to check\n`);

            // 2. Process each series
            for (const series of seriesToCheck) {
                await this.processSeries(series);
            }

            // 3. Report results
            this.printReport();

            return this.stats;
        } catch (error) {
            console.error('❌ Fatal error:', error.message);
            this.stats.errors.push({ fatal: error.message });
            throw error;
        }
    }

    async getSeriesToCheck() {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - 7); // Check if not scraped in 7 days

        const { data, error } = await this.supabase
            .from('poker_series')
            .select('*')
            .eq('events_scraped', false)
            .or(`last_scraped.is.null,last_scraped.lt.${cutoffDate.toISOString()}`)
            .gte('start_date', new Date().toISOString().split('T')[0]) // Only future series
            .order('start_date', { ascending: true })
            .limit(50);

        if (error) {
            console.error('Error fetching series:', error);
            return [];
        }

        return data || [];
    }

    async processSeries(series) {
        this.stats.seriesChecked++;
        console.log(`\n🔍 Checking: ${series.series_name}`);
        console.log(`   Tour: ${series.tour}`);
        console.log(`   Dates: ${series.start_date} to ${series.end_date}`);

        const scraperConfig = TOUR_SCRAPERS[series.tour];
        if (!scraperConfig) {
            console.log(`   ⚠️  No scraper configured for tour: ${series.tour}`);
            await this.updateSeriesStatus(series.series_uid, 'no_scraper');
            return;
        }

        try {
            // Get scrape URL
            const scrapeUrl = series.scrape_url ||
                (scraperConfig.urlPattern ? scraperConfig.urlPattern(series.series_name) : scraperConfig.baseUrl);

            console.log(`   URL: ${scrapeUrl}`);

            // For now, just mark as checked - actual scraping requires Puppeteer
            // This will be enhanced when we add headless browser support
            await this.updateSeriesStatus(series.series_uid, 'pending', scrapeUrl);

            console.log(`   ✅ Marked for manual review`);
        } catch (error) {
            console.log(`   ❌ Error: ${error.message}`);
            this.stats.errors.push({ series: series.series_name, error: error.message });
            await this.updateSeriesStatus(series.series_uid, 'failed');
        }
    }

    async updateSeriesStatus(seriesUid, status, scrapeUrl = null) {
        const updates = {
            scrape_status: status,
            last_scraped: new Date().toISOString(),
        };

        if (scrapeUrl) {
            updates.scrape_url = scrapeUrl;
        }

        const { error } = await this.supabase
            .from('poker_series')
            .update(updates)
            .eq('series_uid', seriesUid);

        if (error) {
            console.error(`   Failed to update status: ${error.message}`);
        }
    }

    async insertEvents(events, seriesUid) {
        if (!events || events.length === 0) return 0;

        const { data, error } = await this.supabase
            .from('poker_events')
            .upsert(events, { onConflict: 'event_uid' });

        if (error) {
            console.error(`   Insert error: ${error.message}`);
            return 0;
        }

        return events.length;
    }

    printReport() {
        console.log('\n' + '═'.repeat(50));
        console.log('📊 SCRAPER REPORT');
        console.log('═'.repeat(50));
        console.log(`Series Checked:  ${this.stats.seriesChecked}`);
        console.log(`Events Found:    ${this.stats.eventsFound}`);
        console.log(`Events Inserted: ${this.stats.eventsInserted}`);
        console.log(`Errors:          ${this.stats.errors.length}`);

        if (this.stats.errors.length > 0) {
            console.log('\n⚠️  Errors:');
            this.stats.errors.forEach(e => {
                console.log(`   - ${e.series || 'System'}: ${e.error || e.fatal}`);
            });
        }

        console.log('═'.repeat(50));
    }
}

// Run if called directly
if (require.main === module) {
    require('dotenv').config({ path: '.env.local' });

    const scraper = new TournamentScraper();
    scraper.run()
        .then(stats => {
            process.exit(stats.errors.length > 0 ? 1 : 0);
        })
        .catch(error => {
            console.error(error);
            process.exit(1);
        });
}

module.exports = TournamentScraper;
