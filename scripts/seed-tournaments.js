/**
 * Seed Tournaments Script
 * Populates tournament_series table from PokerAtlas JSON data
 */

require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs').promises;
const path = require('path');

// Initialize Supabase client
const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

class TournamentSeedService {
    constructor() {
        this.stats = {
            inserted: 0,
            errors: 0,
            skipped: 0
        };
    }

    /**
     * Load tournament data from JSON file
     */
    async loadTournamentData() {
        const jsonPath = path.join(process.env.HOME, 'Downloads/US_Poker_Series_Master_PokerAtlas_Upcoming_asof_2026-01-18.json');
        const rawData = await fs.readFile(jsonPath, 'utf8');
        return JSON.parse(rawData);
    }

    /**
     * Transform PokerAtlas JSON to our schema
     */
    transformSeries(series) {
        // Determine series type
        let seriesType = 'regional';
        const nameLower = series.series_name.toLowerCase();

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

        return {
            name: series.series_name,
            short_name: this.extractShortName(series.series_name),
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

    /**
     * Extract short name from series name
     */
    extractShortName(name) {
        // Common abbreviations
        const abbrevMap = {
            'World Series of Poker': 'WSOP',
            'World Poker Tour': 'WPT',
            'Mid-States Poker Tour': 'MSPT',
            'RunGood Poker Series': 'RGPS',
            'Poker Pilgrims': 'PP',
            'DeepStack': 'DSE',
            'Borgata': 'BWPO',
        };

        for (const [full, abbrev] of Object.entries(abbrevMap)) {
            if (name.includes(full)) return abbrev;
        }

        // Extract acronym from name
        const words = name.split(' ').filter(w => w.length > 2);
        if (words.length <= 3) {
            return words.map(w => w[0]).join('').toUpperCase();
        }

        return name.substring(0, 10).toUpperCase();
    }

    /**
     * Seed all tournaments
     */
    async seedTournaments() {
        console.log('=== Tournament Seeding Started ===\n');

        // Load data
        const seriesData = await this.loadTournamentData();
        console.log(`Loaded ${seriesData.length} tournament series from JSON\n`);

        // Filter to next 90 days
        const now = new Date();
        const ninetyDaysFromNow = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);

        const upcomingSeries = seriesData.filter(s => {
            const startDate = new Date(s.start_date);
            return startDate >= now && startDate <= ninetyDaysFromNow;
        });

        console.log(`Filtered to ${upcomingSeries.length} series in next 90 days\n`);

        // Insert each series
        for (const series of upcomingSeries) {
            try {
                const transformed = this.transformSeries(series);

                const { data, error } = await supabase
                    .from('tournament_series')
                    .upsert(transformed, {
                        onConflict: 'name,start_date',
                        ignoreDuplicates: false
                    })
                    .select();

                if (error) {
                    console.error(`❌ Error inserting ${series.series_name}:`, error.message);
                    this.stats.errors++;
                } else {
                    console.log(`✅ Inserted: ${series.series_name} (${series.city}, ${series.state})`);
                    this.stats.inserted++;
                }

                // Small delay
                await new Promise(resolve => setTimeout(resolve, 100));

            } catch (error) {
                console.error(`❌ Exception for ${series.series_name}:`, error.message);
                this.stats.errors++;
            }
        }

        console.log('\n=== Seeding Complete ===');
        console.log(`✅ Inserted: ${this.stats.inserted}`);
        console.log(`❌ Errors: ${this.stats.errors}`);

        return this.stats;
    }
}

// Main execution
async function main() {
    const seeder = new TournamentSeedService();

    try {
        const stats = await seeder.seedTournaments();

        console.log('\n📊 Final Stats:');
        console.log(JSON.stringify(stats, null, 2));

        process.exit(0);
    } catch (error) {
        console.error('\n❌ Seeding failed:', error);
        process.exit(1);
    }
}

// Run if executed directly
if (require.main === module) {
    main();
}

module.exports = TournamentSeedService;
