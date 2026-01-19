/**
 * Data Census & Verification Script
 * Verifies database coverage and reports intelligence
 */

require('dotenv').config({ path: '.env.local' });

async function runCensus() {
    console.log('=== DATA CENSUS REPORT ===\n');

    try {
        // Fetch venues
        const venuesRes = await fetch('http://localhost:3000/api/poker/venues?limit=1000');
        const venuesData = await venuesRes.json();
        const venues = venuesData.data || [];

        // Fetch series
        const seriesRes = await fetch('http://localhost:3000/api/poker/series?limit=1000');
        const seriesData = await seriesRes.json();
        const series = seriesData.data || [];

        console.log('📊 TOTAL COUNT:');
        console.log(`   Venues: ${venues.length} (Target > 30)`);
        console.log(`   Tournaments: ${series.length} (Target > 50)`);
        console.log('');

        // Anchor Check - Critical venues
        console.log('🎯 ANCHOR CHECK (Critical Venues):');
        const anchors = [
            { name: 'Lodge Card Club Austin', city: 'Round Rock', state: 'TX' },
            { name: 'Bellagio Poker Room', city: 'Las Vegas', state: 'NV' },
            { name: 'Seminole Hard Rock Hollywood', city: 'Hollywood', state: 'FL' },
            { name: 'Maryland Live! Casino at Arundel Mills', city: 'Hanover', state: 'MD' },
            { name: 'Commerce Casino', city: 'Los Angeles', state: 'CA' },
        ];

        anchors.forEach(anchor => {
            const found = venues.find(v =>
                v.name.includes(anchor.name.split(' ')[0]) &&
                v.city === anchor.city &&
                v.state === anchor.state
            );

            if (found) {
                console.log(`   ✅ FOUND: ${anchor.name} (${anchor.city}, ${anchor.state})`);
            } else {
                console.log(`   ❌ MISSING: ${anchor.name} (${anchor.city}, ${anchor.state})`);
            }
        });
        console.log('');

        // Ghost Check - Missing coordinates
        console.log('👻 GHOST CHECK (Missing Coordinates):');
        const ghostVenues = venues.filter(v => !v.lat || !v.lng);
        console.log(`   Venues with null lat/lng: ${ghostVenues.length} (Target: 0)`);

        if (ghostVenues.length > 0) {
            console.log('   Missing coordinates:');
            ghostVenues.slice(0, 5).forEach(v => {
                console.log(`      - ${v.name} (${v.city}, ${v.state})`);
            });
            if (ghostVenues.length > 5) {
                console.log(`      ... and ${ghostVenues.length - 5} more`);
            }
        } else {
            console.log('   ✅ All venues have coordinates!');
        }
        console.log('');

        // State Coverage
        console.log('🗺️  STATE COVERAGE:');
        const stateGroups = venues.reduce((acc, v) => {
            acc[v.state] = (acc[v.state] || 0) + 1;
            return acc;
        }, {});

        const sortedStates = Object.entries(stateGroups)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10);

        sortedStates.forEach(([state, count]) => {
            console.log(`   ${state}: ${count} venues`);
        });
        console.log('');

        // Series Coverage
        console.log('🏆 TOURNAMENT SERIES COVERAGE:');
        const seriesTypes = series.reduce((acc, s) => {
            acc[s.series_type] = (acc[s.series_type] || 0) + 1;
            return acc;
        }, {});

        Object.entries(seriesTypes).forEach(([type, count]) => {
            console.log(`   ${type}: ${count} series`);
        });
        console.log('');

        // Final Verdict
        console.log('⚖️  FINAL VERDICT:');
        const venuesPassing = venues.length >= 30;
        const seriesPassing = series.length >= 50;
        const ghostsPassing = ghostVenues.length === 0;

        if (venuesPassing && seriesPassing && ghostsPassing) {
            console.log('   ✅ DATABASE READY FOR PRODUCTION');
        } else {
            console.log('   ⚠️  DATABASE NEEDS ATTENTION:');
            if (!venuesPassing) console.log('      - Need more venues');
            if (!seriesPassing) console.log('      - Need more tournament series');
            if (!ghostsPassing) console.log('      - Need to geocode venues');
        }

        console.log('\n=== END CENSUS ===\n');

    } catch (error) {
        console.error('❌ Census failed:', error.message);
        console.log('\n💡 TIP: Make sure dev server is running on localhost:3000');
    }
}

// Run census
runCensus();
