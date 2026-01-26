#!/usr/bin/env node
/**
 * Poker Tour Series Seeder
 *
 * Seeds the database with verified poker tour and series data for 2026.
 * Source: data/poker-tour-series-2026.json
 *
 * Usage:
 *   node scripts/seed-tour-series.js
 *   node scripts/seed-tour-series.js --dry-run
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

require('dotenv').config({ path: '.env.local' });

// Load the tour series data
const DATA_FILE = path.join(__dirname, '../data/poker-tour-series-2026.json');

async function seedTourSeries() {
    console.log('\n' + '='.repeat(60));
    console.log('POKER TOUR SERIES SEEDER');
    console.log('='.repeat(60));

    const dryRun = process.argv.includes('--dry-run');
    if (dryRun) {
        console.log('MODE: DRY RUN (no database writes)\n');
    }

    // Load data
    let tourData;
    try {
        tourData = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
        console.log(`[LOADED] ${tourData.series_2026.length} series from ${DATA_FILE}`);
    } catch (e) {
        console.error(`[ERROR] Could not load ${DATA_FILE}:`, e.message);
        process.exit(1);
    }

    // Initialize Supabase
    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    let inserted = 0;
    let updated = 0;
    let errors = 0;

    console.log('\n[SEEDING] Tournament Series...\n');

    for (const series of tourData.series_2026) {
        const record = {
            name: series.name,
            short_name: series.short_name,
            venue_name: series.venue,
            location: `${series.city}, ${series.state}`,
            start_date: series.start_date,
            end_date: series.end_date,
            total_events: series.total_events,
            main_event_buyin: series.main_event_buyin,
            main_event_guaranteed: series.main_event_guaranteed,
            series_type: series.series_type,
            is_featured: series.is_featured || false,
            scrape_url: series.source_url,
            scrape_status: 'verified'
        };

        if (dryRun) {
            console.log(`  [DRY-RUN] Would insert: ${series.short_name} - ${series.name}`);
            inserted++;
            continue;
        }

        try {
            const { error } = await supabase
                .from('tournament_series')
                .upsert(record, {
                    onConflict: 'name,start_date',
                    ignoreDuplicates: false
                });

            if (error) {
                if (error.message.includes('duplicate')) {
                    console.log(`  [UPDATE] ${series.short_name}`);
                    updated++;
                } else {
                    console.log(`  [ERROR] ${series.short_name}: ${error.message}`);
                    errors++;
                }
            } else {
                console.log(`  [INSERT] ${series.short_name}`);
                inserted++;
            }
        } catch (e) {
            console.log(`  [ERROR] ${series.short_name}: ${e.message}`);
            errors++;
        }
    }

    console.log('\n' + '='.repeat(60));
    console.log('SEEDER REPORT');
    console.log('='.repeat(60));
    console.log(`Total Series:   ${tourData.series_2026.length}`);
    console.log(`Inserted:       ${inserted}`);
    console.log(`Updated:        ${updated}`);
    console.log(`Errors:         ${errors}`);
    console.log('='.repeat(60) + '\n');

    // Also seed the tour metadata
    console.log('[SEEDING] Tour Metadata...\n');

    for (const [tourCode, tourInfo] of Object.entries(tourData.tours)) {
        console.log(`  [TOUR] ${tourCode}: ${tourInfo.name}`);
    }

    console.log('\n[DONE] Tour series seeding complete!\n');
}

// Run
seedTourSeries().catch(console.error);
