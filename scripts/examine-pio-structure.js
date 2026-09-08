/**
 * Deep Dive Part 2: Examine Full Scenario Structure
 * ═══════════════════════════════════════════════════════════════════════════
 * Query a complete scenario to understand the exact data format
 */

const fs = require('fs');
const path = require('path');
const { createSolverOperatorPool } = require('./lib/solver-operator-db');
require('dotenv').config({ path: '.env.local' });

async function examineFullStructure() {
    const pool = createSolverOperatorPool({ statementTimeout: 120_000 });
    try {
    console.log('🔬 EXAMINING FULL PIO SCENARIO STRUCTURE\n');
    console.log('═'.repeat(80));

    // Get one complete scenario
    const scenarioResult = await pool.query(
        'SELECT * FROM public.solved_spots_gold ORDER BY id LIMIT 1',
    );
    const scenario = scenarioResult.rows[0] || null;
    if (!scenario) {
        throw new Error('solved_spots_gold is empty; there is no scenario to examine.');
    }

    console.log('\n📋 FULL SCENARIO DATA:');
    console.log('─'.repeat(80));
    console.log(JSON.stringify(scenario, null, 2));

    // Persist only when an operator explicitly selects an output path. The
    // old machine-specific .gemini path failed on every other checkout and
    // made a successful database inspection look like a query failure.
    if (process.env.PIO_STRUCTURE_OUTPUT) {
        const outputPath = path.resolve(process.env.PIO_STRUCTURE_OUTPUT);
        fs.mkdirSync(path.dirname(outputPath), { recursive: true });
        fs.writeFileSync(outputPath, JSON.stringify(scenario, null, 2));
        console.log(`\n💾 Saved full scenario to: ${outputPath}`);
    } else {
        console.log('\nℹ️ Full scenario was not persisted; set PIO_STRUCTURE_OUTPUT to save it.');
    }

    // Analyze strategy matrix
    if (scenario.strategy_matrix) {
        console.log('\n📊 STRATEGY MATRIX ANALYSIS:');
        console.log('─'.repeat(80));

        const keys = Object.keys(scenario.strategy_matrix);
        console.log(`Total entries: ${keys.length}`);
        console.log(`Key type: ${typeof keys[0]}`);
        console.log(`Sample keys: ${keys.slice(0, 10).join(', ')}`);

        // Examine first entry
        const firstKey = keys[0];
        const firstEntry = scenario.strategy_matrix[firstKey];
        console.log(`\nFirst entry (key: ${firstKey}):`);
        console.log(JSON.stringify(firstEntry, null, 2));

        // Check if there's a pattern
        if (keys.length === 1326) {
            console.log('\n✅ Matrix has 1,326 entries (all possible hands)');
        } else {
            console.log(`\n⚠️  Matrix has ${keys.length} entries (expected 1,326)`);
        }
    }

    // Use the structured artifact board rather than guessing at one of the
    // historical scenario-hash layouts.
    const structuredBoard = scenario.strategy_matrix_v2?.board || scenario.board_cards;
    if (Array.isArray(structuredBoard)) {
        console.log('\n🃏 BOARD CARD PARSING:');
        console.log('─'.repeat(80));
        console.log(`Scenario Hash: ${scenario.scenario_hash}`);
        console.log(`Structured Board: ${structuredBoard.join(' ')}`);
    }

    // Query data coverage
    console.log('\n\n📊 DATA COVERAGE BY PARAMETERS:');
    console.log('═'.repeat(80));

    // By game_type
    const { rows: byGameType } = await pool.query(
        'SELECT game_type, count(*)::integer AS count FROM public.solved_spots_gold GROUP BY game_type ORDER BY game_type',
    );

    if (byGameType) {
        console.log('\n📊 By Game Type:');
        const total = byGameType.reduce((sum, row) => sum + Number(row.count), 0);
        byGameType.forEach(row => {
            const percentage = ((Number(row.count) / total) * 100).toFixed(1);
            console.log(`  ${row.game_type}: ${Number(row.count).toLocaleString()} (${percentage}%)`);
        });
    }

    // By stack_depth
    const { rows: byStack } = await pool.query(
        'SELECT stack_depth, count(*)::integer AS count FROM public.solved_spots_gold GROUP BY stack_depth ORDER BY stack_depth',
    );

    if (byStack) {
        console.log('\n📊 By Stack Depth:');
        const total = byStack.reduce((sum, row) => sum + Number(row.count), 0);
        byStack.forEach(row => {
            const percentage = ((Number(row.count) / total) * 100).toFixed(1);
            console.log(`  ${row.stack_depth}BB: ${Number(row.count).toLocaleString()} (${percentage}%)`);
        });
    }

    // By street
    const { rows: byStreet } = await pool.query(
        'SELECT street, count(*)::integer AS count FROM public.solved_spots_gold GROUP BY street ORDER BY street',
    );

    if (byStreet) {
        console.log('\n📊 By Street:');
        const total = byStreet.reduce((sum, row) => sum + Number(row.count), 0);
        byStreet.forEach(row => {
            const percentage = ((Number(row.count) / total) * 100).toFixed(1);
            console.log(`  ${row.street}: ${Number(row.count).toLocaleString()} (${percentage}%)`);
        });
    }

    console.log('\n' + '═'.repeat(80));
    } finally {
        await pool.end();
    }
}

examineFullStructure()
    .then(() => {
        console.log('\n✅ Analysis complete!\n');
        process.exit(0);
    })
    .catch(error => {
        console.error('\n❌ Error:', error);
        process.exit(1);
    });
