/**
 * Deep Dive: Analyze PIO Solver Data in Supabase
 * ═══════════════════════════════════════════════════════════════════════════
 * Queries solved_spots_gold and memory_charts_gold to understand data coverage
 */

const { createSolverOperatorPool } = require('./lib/solver-operator-db');
require('dotenv').config({ path: '.env.local' });

async function analyzePIOData() {
    const pool = createSolverOperatorPool({ statementTimeout: 120_000 });
    try {
        console.log('🔍 DEEP DIVE: PIO Solver Database Analysis\n');
        console.log('═'.repeat(80));

    // ═══════════════════════════════════════════════════════════════════════
    // 1. Check if tables exist and count rows
    // ═══════════════════════════════════════════════════════════════════════
    console.log('\n📊 TABLE 1: solved_spots_gold (Postflop Engine)');
    console.log('─'.repeat(80));

    const { rows: spotCountRows } = await pool.query(
        'SELECT count(*)::integer AS count FROM public.solved_spots_gold',
    );
    const spotsCount = Number(spotCountRows[0]?.count || 0);
    console.log('✅ Table exists');
    console.log(`📈 Total rows: ${spotsCount}`);

    // ═══════════════════════════════════════════════════════════════════════
    // 2. Analyze data coverage if rows exist
    // ═══════════════════════════════════════════════════════════════════════
    if (spotsCount && spotsCount > 0) {
        console.log('\n🔬 Data Coverage Analysis:');
        console.log('─'.repeat(80));

        // Group by game_type
        const groupedQueries = [
            ['Game Type', 'game_type', 'ORDER BY game_type'],
            ['Topology', 'topology', 'ORDER BY topology'],
            ['Stack Depth', 'stack_depth', 'ORDER BY stack_depth'],
            ['Street', 'street', 'ORDER BY street'],
        ];
        for (const [label, column, order] of groupedQueries) {
            const { rows } = await pool.query(
                `SELECT ${column}, count(*)::integer AS count FROM public.solved_spots_gold GROUP BY ${column} ${order}`,
            );
            console.log(`\n📊 By ${label}:`);
            rows.forEach(row => console.log(`  ${row[column]}: ${row.count} scenarios`));
        }

        // ═══════════════════════════════════════════════════════════════════
        // 3. Sample a few scenarios to see structure
        // ═══════════════════════════════════════════════════════════════════
        console.log('\n📝 Sample Scenarios:');
        console.log('─'.repeat(80));

        const { rows: samples } = await pool.query(
            'SELECT * FROM public.solved_spots_gold ORDER BY id LIMIT 3',
        );

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

    const { rows: chartCountRows } = await pool.query(
        'SELECT count(*)::integer AS count FROM public.memory_charts_gold',
    );
    const chartsCount = Number(chartCountRows[0]?.count || 0);
    console.log('✅ Table exists');
    console.log(`📈 Total rows: ${chartsCount}`);

    if (chartsCount && chartsCount > 0) {
        console.log('\n🔬 Chart Coverage Analysis:');
        console.log('─'.repeat(80));

        const { rows: categoryRows } = await pool.query(
            `SELECT game_type, count(*)::integer AS count
             FROM public.memory_charts_gold
             GROUP BY game_type
             ORDER BY game_type`,
        );
        console.log('\n📊 By Game Type:');
        categoryRows.forEach(row => console.log(`  ${row.game_type}: ${row.count} charts`));

        // Keep the full inventory exact without transferring every chart's
        // potentially large JSON grid merely to print its name.
        const { rows: chartNames } = await pool.query(
            `SELECT chart_id, game_type, stack_depth, hero_position, villain_action
             FROM public.memory_charts_gold
             ORDER BY chart_id`,
        );
        console.log('\n📋 All Charts:');
        chartNames.forEach(chart => console.log(
            `  - ${chart.chart_id} (${chart.game_type || 'unknown'}, ${chart.hero_position || 'unknown'}, ${chart.stack_depth || '?'}BB, ${chart.villain_action || 'unknown'})`,
        ));

        const { rows: samples } = await pool.query(
            `SELECT chart_id, game_type, stack_depth, hero_position, villain_action, hand_matrix
             FROM public.memory_charts_gold
             ORDER BY chart_id
             LIMIT 1`,
        );
        const sample = samples[0];
        if (sample) {
            console.log('\n📝 Sample Chart:');
            console.log('─'.repeat(80));
            console.log(`  Chart ID: ${sample.chart_id}`);
            console.log(`  Game Type: ${sample.game_type}`);
            console.log(`  Stack Depth: ${sample.stack_depth}BB`);
            console.log(`  Hero Position: ${sample.hero_position}`);
            console.log(`  Villain Action: ${sample.villain_action}`);

            if (sample.hand_matrix) {
                const hands = Object.keys(sample.hand_matrix);
                console.log(`  Total Hands: ${hands.length}`);
                console.log('  Sample Hands:');
                hands.slice(0, 5).forEach(hand => {
                    const action = sample.hand_matrix[hand];
                    console.log(`    ${hand}: ${JSON.stringify(action)}`);
                });
            }
        }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 5. Summary and Recommendations
    // ═══════════════════════════════════════════════════════════════════════
    console.log('\n\n📋 SUMMARY & RECOMMENDATIONS');
    console.log('═'.repeat(80));

    console.log(`   - Postflop scenarios: ${spotsCount}`);
    console.log(`   - Preflop charts: ${chartsCount}`);
    if (spotsCount === 0 || chartsCount === 0) {
        throw new Error(
            'Required solver warehouse data is absent; no readiness conclusion can be issued.',
        );
    }
    console.log('\n✅ Both solver warehouse sources contain data.');
    console.log('   This command is an inspection only. It does not admit artifacts,');
    console.log('   certify Training coverage, ingest rows, or authorize either solver host.');
    console.log('   Use the protected catalog and 107-game runtime audits for those decisions.');

        console.log('\n' + '═'.repeat(80));
    } finally {
        await pool.end();
    }
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
