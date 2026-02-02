#!/usr/bin/env node
/**
 * Comprehensive Poker Tour Events Seeder
 *
 * Seeds the database with all verified poker tour events from:
 * - WSOP 2026
 * - WPT 2026
 * - WSOP Circuit 2025-2026 Season
 * - MSPT 2026
 * - RGPS 2026
 * - Regional Series
 *
 * Also exports all data to CSV spreadsheet.
 *
 * Usage:
 *   node scripts/seed-all-tour-events.js
 *   node scripts/seed-all-tour-events.js --dry-run
 *   node scripts/seed-all-tour-events.js --export-only
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

require('dotenv').config({ path: '.env.local' });

// =============================================================================
// DATA FILES
// =============================================================================

const DATA_DIR = path.join(__dirname, '../data');

const DATA_FILES = {
    tourSeries: 'poker-tour-series-2026.json',
    wsopEvents: 'wsop-2026-events.json',
    wptEvents: 'wpt-2026-events.json',
    wsopCircuit: 'wsop-circuit-2026-events.json',
};

// =============================================================================
// SEEDER CLASS
// =============================================================================

class TourEventsSeeder {
    constructor(options = {}) {
        this.options = options;
        this.supabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL,
            process.env.SUPABASE_SERVICE_ROLE_KEY
        );

        this.stats = {
            seriesLoaded: 0,
            eventsLoaded: 0,
            seriesInserted: 0,
            eventsInserted: 0,
            errors: [],
        };

        this.allSeries = [];
        this.allEvents = [];
    }

    /**
     * Load all data files
     */
    loadData() {
        console.log('\n[LOADING] Data files...\n');

        // Load tour series
        try {
            const seriesPath = path.join(DATA_DIR, DATA_FILES.tourSeries);
            const seriesData = JSON.parse(fs.readFileSync(seriesPath, 'utf8'));
            this.allSeries = seriesData.series_2026 || [];
            this.stats.seriesLoaded = this.allSeries.length;
            console.log(`  [OK] Loaded ${this.allSeries.length} series from ${DATA_FILES.tourSeries}`);
        } catch (e) {
            console.log(`  [SKIP] ${DATA_FILES.tourSeries}: ${e.message}`);
        }

        // Load WSOP events
        try {
            const wsopPath = path.join(DATA_DIR, DATA_FILES.wsopEvents);
            const wsopData = JSON.parse(fs.readFileSync(wsopPath, 'utf8'));
            const wsopEvents = (wsopData.events || []).map(e => ({
                ...e,
                tour: 'WSOP',
                series_name: wsopData.metadata.series,
                venue: wsopData.metadata.venue,
                city: wsopData.metadata.city,
                state: wsopData.metadata.state,
                source_url: wsopData.metadata.source_url,
            }));
            this.allEvents.push(...wsopEvents);
            console.log(`  [OK] Loaded ${wsopEvents.length} WSOP events from ${DATA_FILES.wsopEvents}`);
        } catch (e) {
            console.log(`  [SKIP] ${DATA_FILES.wsopEvents}: ${e.message}`);
        }

        // Load WPT events
        try {
            const wptPath = path.join(DATA_DIR, DATA_FILES.wptEvents);
            const wptData = JSON.parse(fs.readFileSync(wptPath, 'utf8'));
            let wptEvents = [];
            for (const series of (wptData.series || [])) {
                const events = (series.events || []).map(e => ({
                    ...e,
                    tour: 'WPT',
                    series_name: series.name,
                    venue: series.venue,
                    city: series.city,
                    state: series.state,
                    source_url: wptData.metadata.source_url,
                }));
                wptEvents.push(...events);
            }
            this.allEvents.push(...wptEvents);
            console.log(`  [OK] Loaded ${wptEvents.length} WPT events from ${DATA_FILES.wptEvents}`);
        } catch (e) {
            console.log(`  [SKIP] ${DATA_FILES.wptEvents}: ${e.message}`);
        }

        // Load WSOP Circuit events
        try {
            const circuitPath = path.join(DATA_DIR, DATA_FILES.wsopCircuit);
            const circuitData = JSON.parse(fs.readFileSync(circuitPath, 'utf8'));
            let circuitEvents = [];
            for (const stop of (circuitData.stops || [])) {
                const events = (stop.events || []).map(e => ({
                    ...e,
                    tour: 'WSOPC',
                    series_name: stop.name,
                    venue: stop.venue,
                    city: stop.city,
                    state: stop.state,
                    source_url: circuitData.metadata.source_url,
                }));
                circuitEvents.push(...events);
            }
            this.allEvents.push(...circuitEvents);
            console.log(`  [OK] Loaded ${circuitEvents.length} WSOP Circuit events from ${DATA_FILES.wsopCircuit}`);
        } catch (e) {
            console.log(`  [SKIP] ${DATA_FILES.wsopCircuit}: ${e.message}`);
        }

        this.stats.eventsLoaded = this.allEvents.length;

        console.log(`\n[TOTAL] ${this.stats.seriesLoaded} series, ${this.stats.eventsLoaded} events loaded\n`);
    }

    /**
     * Generate unique event UID
     */
    generateEventUid(event, index) {
        const tour = event.tour || 'UNKNOWN';
        const num = event.event_number || `E${index}`;
        const date = event.start_date || '2026';
        const flight = event.flight ? `-${event.flight}` : '';

        // Create a unique identifier
        return `${tour}-${date}-${num}${flight}`.replace(/[^a-zA-Z0-9-]/g, '-');
    }

    /**
     * Seed series to database
     */
    async seedSeries() {
        if (this.options.exportOnly) {
            console.log('[SKIP] Series seeding (export-only mode)');
            return;
        }

        console.log('[SEEDING] Tournament series...\n');

        for (const series of this.allSeries) {
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
                scrape_status: 'verified',
            };

            if (this.options.dryRun) {
                console.log(`  [DRY-RUN] Would insert: ${series.short_name}`);
                this.stats.seriesInserted++;
                continue;
            }

            try {
                const { error } = await this.supabase
                    .from('tournament_series')
                    .upsert(record, {
                        onConflict: 'name,start_date',
                        ignoreDuplicates: false,
                    });

                if (error && !error.message.includes('duplicate')) {
                    console.log(`  [ERROR] ${series.short_name}: ${error.message}`);
                    this.stats.errors.push({ type: 'series', name: series.short_name, error: error.message });
                } else {
                    this.stats.seriesInserted++;
                }
            } catch (e) {
                this.stats.errors.push({ type: 'series', name: series.short_name, error: e.message });
            }
        }

        console.log(`\n  [DONE] ${this.stats.seriesInserted} series processed\n`);
    }

    /**
     * Seed events to database
     */
    async seedEvents() {
        if (this.options.exportOnly) {
            console.log('[SKIP] Events seeding (export-only mode)');
            return;
        }

        console.log('[SEEDING] Tournament events...\n');

        for (let i = 0; i < this.allEvents.length; i++) {
            const event = this.allEvents[i];

            const record = {
                event_uid: this.generateEventUid(event, i + 1),
                event_number: typeof event.event_number === 'number' ? event.event_number : null,
                event_name: event.event_name,
                event_type: event.event_type || 'side_event',
                buy_in: event.buy_in || 0,
                fee: event.fee || 0,
                guaranteed: event.guaranteed || null,
                start_date: event.start_date || null,
                start_time: event.start_time || null,
                flight: event.flight || null,
                game_type: event.game_type || 'NLH',
                format: event.format || null,
                starting_stack: event.starting_stack || null,
                blind_levels: event.blind_levels || null,
                venue_name: event.venue || null,
                city: event.city || null,
                state: event.state || null,
                source_url: event.source_url || null,
                last_scraped: new Date().toISOString(),
                is_active: true,
            };

            if (this.options.dryRun) {
                if (i < 10 || i % 50 === 0) {
                    console.log(`  [DRY-RUN] Would insert: ${event.event_name?.substring(0, 50)}...`);
                }
                this.stats.eventsInserted++;
                continue;
            }

            try {
                const { error } = await this.supabase
                    .from('poker_events')
                    .upsert(record, {
                        onConflict: 'event_uid',
                        ignoreDuplicates: false,
                    });

                if (error && !error.message.includes('duplicate')) {
                    this.stats.errors.push({ type: 'event', name: event.event_name, error: error.message });
                } else {
                    this.stats.eventsInserted++;
                }
            } catch (e) {
                this.stats.errors.push({ type: 'event', name: event.event_name, error: e.message });
            }

            // Progress indicator
            if ((i + 1) % 100 === 0) {
                console.log(`  [PROGRESS] ${i + 1}/${this.allEvents.length} events processed`);
            }
        }

        console.log(`\n  [DONE] ${this.stats.eventsInserted} events processed\n`);
    }

    /**
     * Export all data to CSV
     */
    exportToCSV() {
        console.log('[EXPORTING] Generating CSV spreadsheet...\n');

        const headers = [
            'Tour',
            'Series Name',
            'Event Number',
            'Event Name',
            'Event Type',
            'Buy-In',
            'Fee',
            'Total Cost',
            'Guaranteed',
            'Start Date',
            'Start Time',
            'Flight',
            'Game Type',
            'Format',
            'Starting Stack',
            'Blind Levels',
            'Venue',
            'City',
            'State',
            'Source URL',
        ];

        const rows = this.allEvents.map(e => {
            const totalCost = (e.buy_in || 0) + (e.fee || 0);
            return [
                e.tour || '',
                `"${(e.series_name || '').replace(/"/g, '""')}"`,
                e.event_number || '',
                `"${(e.event_name || '').replace(/"/g, '""')}"`,
                e.event_type || '',
                e.buy_in || '',
                e.fee || '',
                totalCost || '',
                e.guaranteed || '',
                e.start_date || '',
                e.start_time || '',
                e.flight || '',
                e.game_type || '',
                e.format || '',
                e.starting_stack || '',
                e.blind_levels || '',
                `"${(e.venue || '').replace(/"/g, '""')}"`,
                e.city || '',
                e.state || '',
                e.source_url || '',
            ];
        });

        // Sort by date, then tour, then event number
        rows.sort((a, b) => {
            const dateA = a[9] || '9999';
            const dateB = b[9] || '9999';
            if (dateA !== dateB) return dateA.localeCompare(dateB);
            const tourA = a[0] || '';
            const tourB = b[0] || '';
            if (tourA !== tourB) return tourA.localeCompare(tourB);
            return (parseInt(a[2]) || 999) - (parseInt(b[2]) || 999);
        });

        const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');

        const csvPath = path.join(DATA_DIR, 'poker-tour-events-2026.csv');
        fs.writeFileSync(csvPath, csv);

        console.log(`  [OK] Saved ${this.allEvents.length} events to ${csvPath}\n`);

        // Also create a series summary CSV
        const seriesHeaders = [
            'Tour',
            'Series Name',
            'Short Name',
            'Venue',
            'City',
            'State',
            'Start Date',
            'End Date',
            'Total Events',
            'Main Event Buy-In',
            'Main Event GTD',
            'Series Type',
            'Featured',
            'Source URL',
        ];

        const seriesRows = this.allSeries.map(s => [
            s.tour || '',
            `"${(s.name || '').replace(/"/g, '""')}"`,
            s.short_name || '',
            `"${(s.venue || '').replace(/"/g, '""')}"`,
            s.city || '',
            s.state || '',
            s.start_date || '',
            s.end_date || '',
            s.total_events || '',
            s.main_event_buyin || '',
            s.main_event_guaranteed || '',
            s.series_type || '',
            s.is_featured ? 'Yes' : 'No',
            s.source_url || '',
        ]);

        seriesRows.sort((a, b) => {
            const dateA = a[6] || '9999';
            const dateB = b[6] || '9999';
            return dateA.localeCompare(dateB);
        });

        const seriesCsv = [seriesHeaders.join(','), ...seriesRows.map(r => r.join(','))].join('\n');

        const seriesCsvPath = path.join(DATA_DIR, 'poker-tour-series-2026.csv');
        fs.writeFileSync(seriesCsvPath, seriesCsv);

        console.log(`  [OK] Saved ${this.allSeries.length} series to ${seriesCsvPath}\n`);

        return { eventsCsv: csvPath, seriesCsv: seriesCsvPath };
    }

    /**
     * Main execution
     */
    async run() {
        console.log('\n' + '='.repeat(70));
        console.log('COMPREHENSIVE POKER TOUR EVENTS SEEDER');
        console.log('='.repeat(70));
        console.log(`Started: ${new Date().toISOString()}`);
        if (this.options.dryRun) console.log('MODE: DRY RUN (no database writes)');
        if (this.options.exportOnly) console.log('MODE: EXPORT ONLY');
        console.log('='.repeat(70));

        // Load all data files
        this.loadData();

        // Seed to database
        await this.seedSeries();
        await this.seedEvents();

        // Export to CSV
        const csvFiles = this.exportToCSV();

        // Print report
        this.printReport(csvFiles);

        return this.stats;
    }

    printReport(csvFiles) {
        console.log('\n' + '='.repeat(70));
        console.log('SEEDER REPORT');
        console.log('='.repeat(70));
        console.log(`Series Loaded:      ${this.stats.seriesLoaded}`);
        console.log(`Events Loaded:      ${this.stats.eventsLoaded}`);
        console.log(`Series Inserted:    ${this.stats.seriesInserted}`);
        console.log(`Events Inserted:    ${this.stats.eventsInserted}`);

        // Breakdown by tour
        const byTour = {};
        for (const event of this.allEvents) {
            const tour = event.tour || 'Unknown';
            byTour[tour] = (byTour[tour] || 0) + 1;
        }

        console.log('\nEvents by Tour:');
        Object.entries(byTour).sort((a, b) => b[1] - a[1]).forEach(([tour, count]) => {
            console.log(`  ${tour}: ${count}`);
        });

        // Breakdown by event type
        const byType = {};
        for (const event of this.allEvents) {
            const type = event.event_type || 'Unknown';
            byType[type] = (byType[type] || 0) + 1;
        }

        console.log('\nEvents by Type:');
        Object.entries(byType).sort((a, b) => b[1] - a[1]).forEach(([type, count]) => {
            console.log(`  ${type}: ${count}`);
        });

        if (csvFiles) {
            console.log('\nExported Files:');
            console.log(`  Events CSV: ${csvFiles.eventsCsv}`);
            console.log(`  Series CSV: ${csvFiles.seriesCsv}`);
        }

        if (this.stats.errors.length > 0) {
            console.log(`\nErrors: ${this.stats.errors.length}`);
            this.stats.errors.slice(0, 10).forEach(e => {
                console.log(`  - ${e.type}: ${e.name?.substring(0, 40)}: ${e.error}`);
            });
            if (this.stats.errors.length > 10) {
                console.log(`  ... and ${this.stats.errors.length - 10} more errors`);
            }
        }

        console.log('='.repeat(70));
        console.log(`Completed: ${new Date().toISOString()}`);
        console.log('='.repeat(70) + '\n');
    }
}

// =============================================================================
// CLI
// =============================================================================

function parseArgs() {
    const args = process.argv.slice(2);
    const options = {};

    for (const arg of args) {
        if (arg === '--dry-run') options.dryRun = true;
        if (arg === '--export-only') options.exportOnly = true;
        if (arg === '--help') {
            console.log(`
Comprehensive Poker Tour Events Seeder

Usage:
  node scripts/seed-all-tour-events.js [options]

Options:
  --dry-run       Don't write to database
  --export-only   Only export CSV files
  --help          Show this help

Data Files:
  data/poker-tour-series-2026.json
  data/wsop-2026-events.json
  data/wpt-2026-events.json
  data/wsop-circuit-2026-events.json

Output:
  data/poker-tour-events-2026.csv
  data/poker-tour-series-2026.csv
            `);
            process.exit(0);
        }
    }

    return options;
}

// Run
if (require.main === module) {
    const options = parseArgs();
    const seeder = new TourEventsSeeder(options);

    seeder.run()
        .then(stats => {
            process.exit(stats.errors.length > 10 ? 1 : 0);
        })
        .catch(error => {
            console.error('[FATAL]', error);
            process.exit(1);
        });
}

module.exports = TourEventsSeeder;
