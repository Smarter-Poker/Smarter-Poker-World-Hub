/**
 * Deep Dive Part 2: Examine Full Scenario Structure
 * ═══════════════════════════════════════════════════════════════════════════
 * Query a complete scenario to understand the exact data format
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function examineFullStructure() {
    console.log('🔬 EXAMINING FULL PIO SCENARIO STRUCTURE\n');
    console.log('═'.repeat(80));

    // Get one complete scenario
    const { data: scenario, error } = await supabase
        .from('solved_spots_gold')
        .select('*')
        .limit(1)
        .single();

    if (error) {
        console.error('❌ Error:', error.message);
        return;
    }

    console.log('\n📋 FULL SCENARIO DATA:');
    console.log('─'.repeat(80));
    console.log(JSON.stringify(scenario, null, 2));

    // Save to file for detailed analysis
    const outputPath = path.join(__dirname, '../.gemini/antigravity/brain/8224c3c2-82c2-4505-ade7-9c8033b1a8c6/sample_pio_scenario.json');
    fs.writeFileSync(outputPath, JSON.stringify(scenario, null, 2));
    console.log(`\n💾 Saved full scenario to: ${outputPath}`);

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

    // Try to parse board cards from scenario_hash
    if (scenario.scenario_hash) {
        console.log('\n🃏 BOARD CARD PARSING:');
        console.log('─'.repeat(80));
        console.log(`Scenario Hash: ${scenario.scenario_hash}`);

        // Extract board cards (e.g., "AsKs7d" from "AsKs7d.csv_Cash_100bb_Flop")
        const match = scenario.scenario_hash.match(/^([A-K0-9][shdc]+)/);
        if (match) {
            const boardString = match[1];
            console.log(`Board String: ${boardString}`);

            // Parse into individual cards
            const cards = [];
            for (let i = 0; i < boardString.length; i += 2) {
                if (i + 1 < boardString.length) {
                    cards.push(boardString.substr(i, 2));
                }
            }
            console.log(`Parsed Board: ${cards.join(' ')}`);
        }
    }

    // Query data coverage
    console.log('\n\n📊 DATA COVERAGE BY PARAMETERS:');
    console.log('═'.repeat(80));

    // By game_type
    const { data: byGameType } = await supabase
        .from('solved_spots_gold')
        .select('game_type');

    if (byGameType) {
        const gameTypeCounts = {};
        byGameType.forEach(row => {
            gameTypeCounts[row.game_type] = (gameTypeCounts[row.game_type] || 0) + 1;
        });

        console.log('\n📊 By Game Type:');
        Object.entries(gameTypeCounts).forEach(([type, count]) => {
            const percentage = ((count / byGameType.length) * 100).toFixed(1);
            console.log(`  ${type}: ${count.toLocaleString()} (${percentage}%)`);
        });
    }

    // By stack_depth
    const { data: byStack } = await supabase
        .from('solved_spots_gold')
        .select('stack_depth');

    if (byStack) {
        const stackCounts = {};
        byStack.forEach(row => {
            stackCounts[row.stack_depth] = (stackCounts[row.stack_depth] || 0) + 1;
        });

        console.log('\n📊 By Stack Depth:');
        Object.entries(stackCounts)
            .sort((a, b) => parseInt(a[0]) - parseInt(b[0]))
            .forEach(([stack, count]) => {
                const percentage = ((count / byStack.length) * 100).toFixed(1);
                console.log(`  ${stack}BB: ${count.toLocaleString()} (${percentage}%)`);
            });
    }

    // By street
    const { data: byStreet } = await supabase
        .from('solved_spots_gold')
        .select('street');

    if (byStreet) {
        const streetCounts = {};
        byStreet.forEach(row => {
            streetCounts[row.street] = (streetCounts[row.street] || 0) + 1;
        });

        console.log('\n📊 By Street:');
        Object.entries(streetCounts).forEach(([street, count]) => {
            const percentage = ((count / byStreet.length) * 100).toFixed(1);
            console.log(`  ${street}: ${count.toLocaleString()} (${percentage}%)`);
        });
    }

    console.log('\n' + '═'.repeat(80));
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
