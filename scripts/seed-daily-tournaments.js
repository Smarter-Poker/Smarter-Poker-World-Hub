#!/usr/bin/env node
/**
 * Daily Tournament Seeder
 *
 * Populates the venue_daily_tournaments table from data/daily-tournament-schedules.json
 *
 * Usage:
 *   node scripts/seed-daily-tournaments.js          # Seed all tournaments
 *   node scripts/seed-daily-tournaments.js --dry-run  # Preview without inserting
 *   node scripts/seed-daily-tournaments.js --state TX # Seed only Texas venues
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

require('dotenv').config({ path: '.env.local' });

const DATA_FILE = path.join(__dirname, '../data/daily-tournament-schedules.json');

class TournamentSeeder {
    constructor(options = {}) {
        this.options = options;
        this.supabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL,
            process.env.SUPABASE_SERVICE_ROLE_KEY
        );

        this.stats = {
            inserted: 0,
            updated: 0,
            skipped: 0,
            errors: [],
            startTime: new Date()
        };
    }

    loadData() {
        try {
            const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
            console.log(`[LOAD] Loaded ${data.tournaments.length} venues from source`);
            return data;
        } catch (e) {
            console.error('[FATAL] Could not load data file:', e.message);
            process.exit(1);
        }
    }

    async seedTournaments() {
        const data = this.loadData();
        let allTournaments = [];

        // Process venues with schedules
        for (const venue of data.tournaments) {
            // Filter by state if specified
            if (this.options.state && venue.state !== this.options.state.toUpperCase()) {
                continue;
            }

            for (const schedule of venue.schedules) {
                allTournaments.push({
                    venue_name: venue.venue_name,
                    day_of_week: schedule.day_of_week,
                    start_time: schedule.start_time,
                    buy_in: schedule.buy_in,
                    game_type: schedule.game_type || 'NLH',
                    format: schedule.format || null,
                    guaranteed: schedule.guaranteed || null,
                    tournament_name: schedule.notes || `${schedule.day_of_week} ${schedule.start_time}`,
                    source_url: venue.source_url,
                    last_scraped: new Date().toISOString(),
                    is_active: true
                });
            }
        }

        console.log(`[SEED] Prepared ${allTournaments.length} tournaments for insertion`);

        if (this.options.dryRun) {
            console.log('[DRY-RUN] Would insert the following:');
            const byVenue = {};
            allTournaments.forEach(t => {
                if (!byVenue[t.venue_name]) byVenue[t.venue_name] = [];
                byVenue[t.venue_name].push(t);
            });
            Object.entries(byVenue).forEach(([venue, tournaments]) => {
                console.log(`  ${venue}: ${tournaments.length} tournaments`);
            });
            return;
        }

        // Insert in batches of 50
        const batchSize = 50;
        for (let i = 0; i < allTournaments.length; i += batchSize) {
            const batch = allTournaments.slice(i, i + batchSize);

            const { data: result, error } = await this.supabase
                .from('venue_daily_tournaments')
                .upsert(batch, {
                    onConflict: 'venue_name,day_of_week,start_time,buy_in',
                    ignoreDuplicates: false
                })
                .select('id');

            if (error) {
                console.error(`[ERROR] Batch ${Math.floor(i/batchSize) + 1}: ${error.message}`);
                this.stats.errors.push(error.message);
            } else {
                const count = result?.length || batch.length;
                this.stats.inserted += count;
                console.log(`[BATCH] Inserted/updated ${count} tournaments (${i + batch.length}/${allTournaments.length})`);
            }
        }

        await this.printStats();
    }

    async printStats() {
        const duration = (new Date() - this.stats.startTime) / 1000;

        // Get total count from database
        const { count } = await this.supabase
            .from('venue_daily_tournaments')
            .select('*', { count: 'exact', head: true })
            .eq('is_active', true);

        console.log('\n' + '='.repeat(60));
        console.log('SEEDING COMPLETE');
        console.log('='.repeat(60));
        console.log(`Duration:           ${Math.round(duration)}s`);
        console.log(`Records processed:  ${this.stats.inserted}`);
        console.log(`Total in database:  ${count || 'unknown'}`);

        if (this.stats.errors.length > 0) {
            console.log(`\nErrors: ${this.stats.errors.length}`);
            this.stats.errors.slice(0, 5).forEach(e => console.log(`  - ${e}`));
        }

        console.log('='.repeat(60) + '\n');
    }
}

// CLI
function parseArgs() {
    const args = process.argv.slice(2);
    const options = {};

    for (let i = 0; i < args.length; i++) {
        switch (args[i]) {
            case '--dry-run':
                options.dryRun = true;
                break;
            case '--state':
                options.state = args[++i];
                break;
            case '--help':
                console.log(`
Daily Tournament Seeder

Usage:
  node scripts/seed-daily-tournaments.js [options]

Options:
  --dry-run       Preview without inserting
  --state <ST>    Filter by state (e.g., TX, NV, FL)
  --help          Show this help
                `);
                process.exit(0);
        }
    }

    return options;
}

// Run
if (require.main === module) {
    const options = parseArgs();
    const seeder = new TournamentSeeder(options);

    console.log('\n' + '='.repeat(60));
    console.log('DAILY TOURNAMENT SEEDER');
    console.log('='.repeat(60));
    console.log(`Source: ${DATA_FILE}`);
    console.log(`Mode: ${options.dryRun ? 'DRY RUN' : 'LIVE'}`);
    if (options.state) console.log(`Filter: State = ${options.state}`);
    console.log('='.repeat(60) + '\n');

    seeder.seedTournaments()
        .then(() => process.exit(0))
        .catch(error => {
            console.error('[FATAL]', error);
            process.exit(1);
        });
}

module.exports = TournamentSeeder;
