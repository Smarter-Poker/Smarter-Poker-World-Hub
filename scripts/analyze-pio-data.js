/**
 * Deep Dive: Analyze PIO Solver Data in Supabase
 * ═══════════════════════════════════════════════════════════════════════════
 * Queries solved_spots_gold and memory_charts_gold to understand data coverage
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Missing Supabase credentials');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function analyzePIOData() {
    console.log('🔍 DEEP DIVE: PIO Solver Database Analysis\n');
    console.log('═'.repeat(80));

    // ═══════════════════════════════════════════════════════════════════════
    // 1. Check if tables exist and count rows
    // ═══════════════════════════════════════════════════════════════════════
    console.log('\n📊 TABLE 1: solved_spots_gold (Postflop Engine)');
    console.log('─'.repeat(80));

    const { data: spotsData, error: spotsError, count: spotsCount } = await supabase
        .from('solved_spots_gold')
        .select('*', { count: 'exact', head: true });

    if (spotsError) {
        console.error('❌ Error querying solved_spots_gold:', spotsError.message);
    } else {
        console.log(`✅ Table exists`);
        console.log(`📈 Total rows: ${spotsCount || 0}`);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 2. Analyze data coverage if rows exist
    // ═══════════════════════════════════════════════════════════════════════
    if (spotsCount && spotsCount > 0) {
        console.log('\n🔬 Data Coverage Analysis:');
        console.log('─'.repeat(80));

        // Group by game_type
        const { data: byGameType } = await supabase
            .rpc('analyze_spots_by_game_type');

        if (byGameType) {
            console.log('\n📊 By Game Type:');
            byGameType.forEach(row => {
                console.log(`  ${row.game_type}: ${row.count} scenarios`);
            });
        } else {
            // Manual query if RPC doesn't exist
            const { data: allSpots } = await supabase
                .from('solved_spots_gold')
                .select('game_type, topology, stack_depth, street');

            if (allSpots) {
                const coverage = {};
                allSpots.forEach(spot => {
                    const key = `${spot.game_type}`;
                    coverage[key] = (coverage[key] || 0) + 1;
                });

                console.log('\n📊 By Game Type:');
                Object.entries(coverage).forEach(([type, count]) => {
                    console.log(`  ${type}: ${count} scenarios`);
                });

                // By topology
                const topologyCoverage = {};
                allSpots.forEach(spot => {
                    const key = `${spot.topology}`;
                    topologyCoverage[key] = (topologyCoverage[key] || 0) + 1;
                });

                console.log('\n📊 By Topology:');
                Object.entries(topologyCoverage).forEach(([topology, count]) => {
                    console.log(`  ${topology}: ${count} scenarios`);
                });

                // By stack depth
                const stackCoverage = {};
                allSpots.forEach(spot => {
                    const key = `${spot.stack_depth}BB`;
                    stackCoverage[key] = (stackCoverage[key] || 0) + 1;
                });

                console.log('\n📊 By Stack Depth:');
                Object.entries(stackCoverage).sort((a, b) => {
                    return parseInt(a[0]) - parseInt(b[0]);
                }).forEach(([stack, count]) => {
                    console.log(`  ${stack}: ${count} scenarios`);
                });

                // By street
                const streetCoverage = {};
                allSpots.forEach(spot => {
                    const key = `${spot.street}`;
                    streetCoverage[key] = (streetCoverage[key] || 0) + 1;
                });

                console.log('\n📊 By Street:');
                Object.entries(streetCoverage).forEach(([street, count]) => {
                    console.log(`  ${street}: ${count} scenarios`);
                });
            }
        }

        // ═══════════════════════════════════════════════════════════════════
        // 3. Sample a few scenarios to see structure
        // ═══════════════════════════════════════════════════════════════════
        console.log('\n📝 Sample Scenarios:');
        console.log('─'.repeat(80));

        const { data: samples } = await supabase
            .from('solved_spots_gold')
            .select('*')
            .limit(3);

        if (samples && samples.length > 0) {
            samples.forEach((sample, idx) => {
                console.log(`\n🎯 Sample ${idx + 1}:`);
                console.log(`  Scenario Hash: ${sample.scenario_hash}`);
                console.log(`  Street: ${sample.street}`);
                console.log(`  Stack Depth: ${sample.stack_depth}BB`);
                console.log(`  Game Type: ${sample.game_type}`);
                console.log(`  Topology: ${sample.topology}`);
                console.log(`  Mode: ${sample.mode}`);
                console.log(`  Board: ${sample.board_cards?.join(' ') || 'N/A'}`);

                // Show a sample hand from strategy matrix
                if (sample.strategy_matrix) {
                    const hands = Object.keys(sample.strategy_matrix);
                    if (hands.length > 0) {
                        const sampleHand = hands[0];
                        const strategy = sample.strategy_matrix[sampleHand];
                        console.log(`  Sample Hand: ${sampleHand}`);
                        console.log(`    Best Action: ${strategy.best_action}`);
                        console.log(`    Max EV: ${strategy.max_ev}`);
                        console.log(`    Is Mixed: ${strategy.is_mixed}`);
                    }
                }
            });
        }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 4. Check memory_charts_gold
    // ═══════════════════════════════════════════════════════════════════════
    console.log('\n\n📊 TABLE 2: memory_charts_gold (Preflop Engine)');
    console.log('─'.repeat(80));

    const { data: chartsData, error: chartsError, count: chartsCount } = await supabase
        .from('memory_charts_gold')
        .select('*', { count: 'exact', head: true });

    if (chartsError) {
        console.error('❌ Error querying memory_charts_gold:', chartsError.message);
    } else {
        console.log(`✅ Table exists`);
        console.log(`📈 Total rows: ${chartsCount || 0}`);
    }

    if (chartsCount && chartsCount > 0) {
        console.log('\n🔬 Chart Coverage Analysis:');
        console.log('─'.repeat(80));

        const { data: allCharts } = await supabase
            .from('memory_charts_gold')
            .select('*');

        if (allCharts) {
            // By category
            const categoryCoverage = {};
            allCharts.forEach(chart => {
                const key = chart.category;
                categoryCoverage[key] = (categoryCoverage[key] || 0) + 1;
            });

            console.log('\n📊 By Category:');
            Object.entries(categoryCoverage).forEach(([category, count]) => {
                console.log(`  ${category}: ${count} charts`);
            });

            // List all chart names
            console.log('\n📋 All Charts:');
            allCharts.forEach(chart => {
                console.log(`  - ${chart.chart_name} (${chart.category})`);
            });

            // Sample a chart
            if (allCharts.length > 0) {
                console.log('\n📝 Sample Chart:');
                console.log('─'.repeat(80));
                const sample = allCharts[0];
                console.log(`  Chart Name: ${sample.chart_name}`);
                console.log(`  Category: ${sample.category}`);
                console.log(`  Stack Depth: ${sample.stack_depth}BB`);
                console.log(`  Topology: ${sample.topology}`);
                console.log(`  Position: ${sample.position}`);

                if (sample.chart_grid) {
                    const hands = Object.keys(sample.chart_grid);
                    console.log(`  Total Hands: ${hands.length}`);
                    console.log(`  Sample Hands:`);
                    hands.slice(0, 5).forEach(hand => {
                        const action = sample.chart_grid[hand];
                        console.log(`    ${hand}: ${JSON.stringify(action)}`);
                    });
                }
            }
        }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 5. Summary and Recommendations
    // ═══════════════════════════════════════════════════════════════════════
    console.log('\n\n📋 SUMMARY & RECOMMENDATIONS');
    console.log('═'.repeat(80));

    if (spotsCount === 0 && chartsCount === 0) {
        console.log('\n❌ NO DATA FOUND');
        console.log('   Both tables are empty. You need to:');
        console.log('   1. Ingest PioSolver files into solved_spots_gold');
        console.log('   2. Import preflop charts into memory_charts_gold');
        console.log('   3. Use Grok AI as the primary question source until data is loaded');
    } else if (spotsCount > 0 || chartsCount > 0) {
        console.log('\n✅ DATA EXISTS!');
        console.log(`   - Postflop scenarios: ${spotsCount || 0}`);
        console.log(`   - Preflop charts: ${chartsCount || 0}`);
        console.log('\n   Next steps:');
        console.log('   1. Map the 100 training games to PIO queries');
        console.log('   2. Update get-question.js API to query PIO first');
        console.log('   3. Implement suit isomorphism for uniqueness');
        console.log('   4. Add no-repeat tracking');
        console.log('   5. Fall back to Grok only when PIO data doesn\'t exist');
    }

    console.log('\n' + '═'.repeat(80));
}

// Run the analysis
analyzePIOData()
    .then(() => {
        console.log('\n✅ Analysis complete!\n');
        process.exit(0);
    })
    .catch(error => {
        console.error('\n❌ Analysis failed:', error);
        process.exit(1);
    });
