/**
 * Tournament Series Processor
 * Processes PokerAtlas tournament JSON and inserts into database
 */

require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs').promises;
const path = require('path');

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

class TournamentProcessor {
    constructor() {
        this.stats = {
            total: 0,
            inserted: 0,
            duplicates: 0,
            errors: 0
        };
    }

    transformSeries(series) {
        const nameLower = series.series_name.toLowerCase();

        // Determine series type
        let seriesType = 'regional';
        if (nameLower.includes('wsop') || nameLower.includes('wpt') || nameLower.includes('lapc')) {
            seriesType = 'major';
        } else if (nameLower.includes('circuit') || nameLower.includes('mspt') || nameLower.includes('rgps')) {
            seriesType = 'circuit';
        }

        // Determine if featured
        const isFeatured = seriesType === 'major' ||
            nameLower.includes('wsop') ||
            nameLower.includes('wpt') ||
            (series.event_count && series.event_count > 30);

        // Extract short name
        let shortName = series.series_name.substring(0, 15).toUpperCase();
        if (nameLower.includes('wsop')) shortName = 'WSOP';
        if (nameLower.includes('wpt')) shortName = 'WPT';
        if (nameLower.includes('mspt')) shortName = 'MSPT';
        if (nameLower.includes('rgps')) shortName = 'RGPS';

        return {
            name: series.series_name,
            short_name: shortName,
            venue_name: series.venue,
            location: `${series.city}, ${series.state}`,
            start_date: series.start_date,
            end_date: series.end_date,
            total_events: series.event_count || null,
            series_type: seriesType,
            is_featured: isFeatured,
            website: series.source_url || null,
        };
    }

    async processTournaments(jsonPath) {
        console.log('\n=== Tournament Series Processing ===\n');

        // Load JSON
        const rawData = await fs.readFile(jsonPath, 'utf8');
        const seriesData = JSON.parse(rawData);

        console.log(`📂 Loaded ${seriesData.length} tournament series`);

        // Filter to next 90 days
        const now = new Date();
        const ninetyDaysFromNow = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);

        const upcomingSeries = seriesData.filter(s => {
            const startDate = new Date(s.start_date);
            return startDate >= now && startDate <= ninetyDaysFromNow;
        });

        console.log(`📅 Filtered to ${upcomingSeries.length} series in next 90 days\n`);

        this.stats.total = upcomingSeries.length;

        // Transform and insert
        const BATCH_SIZE = 10;
        for (let i = 0; i < upcomingSeries.length; i += BATCH_SIZE) {
            const batch = upcomingSeries.slice(i, i + BATCH_SIZE);
            const transformed = batch.map(s => this.transformSeries(s));

            console.log(`📦 Batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(upcomingSeries.length / BATCH_SIZE)} (${batch.length} series):`);

            try {
                const { data, error } = await supabase
                    .from('tournament_series')
                    .upsert(transformed, {
                        onConflict: 'name,start_date',
                        ignoreDuplicates: false
                    })
                    .select();

                if (error) {
                    console.error(`   ❌ Error:`, error.message);
                    this.stats.errors += batch.length;
                } else {
                    batch.forEach(s => console.log(`   ✅ ${s.series_name}`));
                    this.stats.inserted += batch.length;
                }

                await new Promise(r => setTimeout(r, 500));
            } catch (error) {
                console.error(`   ❌ Exception:`, error.message);
                this.stats.errors += batch.length;
            }
        }

        console.log('\n=== Processing Complete ===');
        console.log(`Total: ${this.stats.total}`);
        console.log(`Inserted: ${this.stats.inserted}`);
        console.log(`Errors: ${this.stats.errors}`);

        // Get final count
        const { count } = await supabase
            .from('tournament_series')
            .select('*', { count: 'exact', head: true });

        console.log(`\n📊 Total in database: ${count}\n`);

        return this.stats;
    }
}

// Main execution
async function main() {
    const processor = new TournamentProcessor();

    try {
        const jsonPath = path.join(process.env.HOME, 'Downloads/US_Poker_Series_Master_PokerAtlas_Upcoming_asof_2026-01-18.json');
        await processor.processTournaments(jsonPath);

        console.log('✅ Processing successful!');
        process.exit(0);
    } catch (error) {
        console.error('❌ Processing failed:', error);
        process.exit(1);
    }
}

if (require.main === module) {
    main();
}

module.exports = TournamentProcessor;
