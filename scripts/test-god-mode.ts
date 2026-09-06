/**
 * Quick test script for God Mode service
 * Checks database connectivity and scenario count
 */

import { getGTOScenarioCount, getGTOStrategy, hasGTODataForScenario } from '../lib/god-mode-service';

async function testGodMode() {
    console.log('═'.repeat(80));
    console.log('🔥 GOD MODE SERVICE TEST');
    console.log('═'.repeat(80));
    console.log();

    // Test 1: Count scenarios
    console.log('📊 Test 1: Counting scenarios in database...');
    const count = await getGTOScenarioCount();
    console.log(`   ✅ Found ${count} scenarios in solved_spots_gold`);
    console.log();

    if (count === 0) {
        console.log('⚠️  No scenarios found yet.');
        console.log('   Windows ingestion may still be running.');
        console.log('   Check back once solver data is imported.');
        return;
    }

    // Test 2: Check if specific scenario exists
    console.log('📊 Test 2: Checking for sample scenario...');
    const hasData = await hasGTODataForScenario({
        gameType: 'MTT',
        stackDepth: 40,
        boardCards: ['As', 'Ks', '2d', '3c'],
        mode: 'ICM'
    });
    console.log(`   ${hasData ? '✅' : '⚠️ '} MTT 40bb Turn scenario: ${hasData ? 'FOUND' : 'NOT FOUND'}`);
    console.log();

    // Test 3: Fetch full strategy (if data exists)
    if (hasData) {
        console.log('📊 Test 3: Fetching full strategy matrix...');
        const strategy = await getGTOStrategy({
            gameType: 'MTT',
            stackDepth: 40,
            boardCards: ['As', 'Ks', '2d', '3c'],
            mode: 'ICM',
            street: 'Turn'
        });

        if (strategy) {
            console.log(`   ✅ Strategy loaded: ${strategy.scenario_hash}`);
            console.log(`   📋 Board: ${strategy.board_cards.join(' ')}`);
            console.log(`   📈 Hands in matrix: ${Object.keys(strategy.strategy_matrix).length}`);

            // Show sample hand
            const sampleHand = strategy.strategy_matrix['AhKd'];
            if (sampleHand) {
                console.log();
                console.log('   Sample Hand: AhKd');
                console.log(`   └─ Best Action: ${sampleHand.best_action}`);
                console.log(`   └─ Max EV: ${sampleHand.max_ev === null ? 'not supplied' : sampleHand.max_ev.toFixed(2)}`);
                console.log(`   └─ Is Mixed: ${sampleHand.is_mixed ? 'Yes' : 'No'}`);
            }
        }
    }

    console.log();
    console.log('═'.repeat(80));
    console.log('✅ GOD MODE SERVICE TEST COMPLETE');
    console.log('═'.repeat(80));
}

// Run test
testGodMode().catch(console.error);
