#!/usr/bin/env node
/**
 * GTO Panel Bootstrap Script
 * ═══════════════════════════════════════════════════════════════════════════
 * Pre-generates GTO analysis panels for common scenarios.
 * Uses PioSolver data from solved_spots_gold + Grok AI for explanations.
 * 
 * Usage: node scripts/bootstrap-gto-panels.js [--count=100] [--dry-run]
 */

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
);

// All 169 starting hands
const HANDS = [
    // Pairs
    'AA', 'KK', 'QQ', 'JJ', 'TT', '99', '88', '77', '66', '55', '44', '33', '22',
    // Suited combos (top)
    'AKs', 'AQs', 'AJs', 'ATs', 'A9s', 'A8s', 'A7s', 'A6s', 'A5s', 'A4s', 'A3s', 'A2s',
    'KQs', 'KJs', 'KTs', 'K9s', 'K8s', 'K7s', 'K6s', 'K5s', 'K4s', 'K3s', 'K2s',
    'QJs', 'QTs', 'Q9s', 'Q8s', 'Q7s', 'Q6s', 'Q5s', 'Q4s', 'Q3s', 'Q2s',
    'JTs', 'J9s', 'J8s', 'J7s', 'J6s', 'J5s', 'J4s', 'J3s', 'J2s',
    'T9s', 'T8s', 'T7s', 'T6s', 'T5s', 'T4s', 'T3s', 'T2s',
    '98s', '97s', '96s', '95s', '94s', '93s', '92s',
    '87s', '86s', '85s', '84s', '83s', '82s',
    '76s', '75s', '74s', '73s', '72s',
    '65s', '64s', '63s', '62s',
    '54s', '53s', '52s',
    '43s', '42s',
    '32s',
    // Offsuit combos (top)
    'AKo', 'AQo', 'AJo', 'ATo', 'A9o', 'A8o', 'A7o', 'A6o', 'A5o', 'A4o', 'A3o', 'A2o',
    'KQo', 'KJo', 'KTo', 'K9o', 'K8o', 'K7o', 'K6o', 'K5o', 'K4o', 'K3o', 'K2o',
    'QJo', 'QTo', 'Q9o', 'Q8o', 'Q7o', 'Q6o', 'Q5o', 'Q4o', 'Q3o', 'Q2o',
    'JTo', 'J9o', 'J8o', 'J7o', 'J6o', 'J5o', 'J4o', 'J3o', 'J2o',
    'T9o', 'T8o', 'T7o', 'T6o', 'T5o', 'T4o', 'T3o', 'T2o',
    '98o', '97o', '96o', '95o', '94o', '93o', '92o',
    '87o', '86o', '85o', '84o', '83o', '82o',
    '76o', '75o', '74o', '73o', '72o',
    '65o', '64o', '63o', '62o',
    '54o', '53o', '52o',
    '43o', '42o',
    '32o',
];

// Common positions
const POSITIONS = ['BTN', 'CO', 'MP', 'UTG', 'SB', 'BB'];

// Common actions
const ACTIONS = ['RAISE', 'CALL', 'FOLD', '3-BET', 'CHECK', 'BET'];

// Common board textures for flop
const FLOP_TEXTURES = [
    'AKQ', 'AK2', 'AQ7', 'AJ8', 'AT9', // High
    'KQJ', 'KJ7', 'KT5', 'K92', // King high
    'QJT', 'QJ5', 'Q83', // Queen high
    'JT9', 'J87', 'J54', // Jack high
    'T98', 'T76', 'T52', // Ten high
    '987', '976', '865', '754', '643', // Connected
    'A72', 'K83', 'Q94', 'J62', 'T73', // Disconnected
    '222', '333', '444', '555', '666', '777', // Paired
];

async function bootstrapGTOPanels(options = {}) {
    const { count = 100, dryRun = false } = options;

    console.log(`\n🚀 GTO Panel Bootstrap Script`);
    console.log(`═══════════════════════════════════════`);
    console.log(`Mode: ${dryRun ? 'DRY RUN' : 'LIVE'}`);
    console.log(`Target: ${count} panels\n`);

    // Get existing PioSolver data
    const { data: pioScenarios, error } = await supabase
        .from('solved_spots_gold')
        .select('scenario_hash, street, stack_depth, strategy_matrix')
        .limit(500);

    if (error) {
        console.error('❌ Failed to fetch PioSolver data:', error.message);
        return;
    }

    console.log(`📊 Found ${pioScenarios?.length || 0} PioSolver scenarios`);

    // Generate scenarios to bootstrap
    const scenarios = [];

    // Priority 1: Use actual PioSolver scenarios
    for (const pio of (pioScenarios || []).slice(0, count / 2)) {
        if (!pio.strategy_matrix?.actions) continue;

        // Pick a random hand from the strategy matrix
        const hands = Object.keys(pio.strategy_matrix.frequencies?.[pio.strategy_matrix.actions[0]] || {});
        if (hands.length === 0) continue;

        const randomHand = hands[Math.floor(Math.random() * hands.length)];

        scenarios.push({
            source: 'PIO',
            hand: randomHand,
            board: extractBoard(pio.scenario_hash),
            street: pio.street,
            stackDepth: pio.stack_depth,
            pioData: pio.strategy_matrix,
        });
    }

    // Priority 2: Generate common preflop scenarios
    const preflopCombos = [];
    for (const hand of HANDS.slice(0, 50)) { // Top 50 hands
        for (const position of POSITIONS.slice(0, 3)) { // BTN, CO, MP
            preflopCombos.push({
                source: 'GROK',
                hand,
                position,
                street: 'preflop',
                stackDepth: 100,
            });
        }
    }

    // Shuffle and take remaining
    const shuffled = preflopCombos.sort(() => Math.random() - 0.5);
    scenarios.push(...shuffled.slice(0, count - scenarios.length));

    console.log(`\n📝 Scenarios to generate: ${scenarios.length}`);
    console.log(`   - From PioSolver: ${scenarios.filter(s => s.source === 'PIO').length}`);
    console.log(`   - From Grok AI: ${scenarios.filter(s => s.source === 'GROK').length}\n`);

    if (dryRun) {
        console.log('🔍 DRY RUN - Sample scenarios:');
        scenarios.slice(0, 5).forEach((s, i) => {
            console.log(`   ${i + 1}. ${s.hand} | ${s.position || 'N/A'} | ${s.street} | ${s.source}`);
        });
        return;
    }

    // Generate panels
    let success = 0;
    let failed = 0;
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://smarter.poker';

    for (let i = 0; i < scenarios.length; i++) {
        const scenario = scenarios[i];

        try {
            // Call the GTO analysis API first to get data
            const analysisResponse = await fetch(`${baseUrl}/api/gto/gto-analysis`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    hand: scenario.hand,
                    position: scenario.position || 'BTN',
                    stackDepth: scenario.stackDepth || 100,
                    board: scenario.board || '',
                    street: scenario.street || 'preflop',
                    gameType: 'cash',
                }),
            });

            const analysis = await analysisResponse.json();

            if (!analysis.success) {
                throw new Error(analysis.error || 'Analysis failed');
            }

            // Now generate the image
            const renderResponse = await fetch(`${baseUrl}/api/gto/render-analysis-card`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: analysis.optimalAction,
                    frequency: Math.round(analysis.frequency * 100),
                    explanation: analysis.explanation,
                    gtoApproach: analysis.gtoApproach,
                    evValue: analysis.evAnalysis?.evDisplay || '+0.00bb',
                    evDescription: analysis.evAnalysis?.description || '',
                    alternateLines: analysis.alternateLines || [],
                }),
            });

            const result = await renderResponse.json();

            if (result.success) {
                success++;
                process.stdout.write(`\r✅ Generated ${success}/${scenarios.length} panels`);
            } else {
                failed++;
                console.log(`\n❌ Failed for ${scenario.hand}: ${result.error}`);
            }

            // Rate limit
            await sleep(500);

        } catch (error) {
            failed++;
            console.log(`\n❌ Error for ${scenario.hand}: ${error.message}`);
        }
    }

    console.log(`\n\n═══════════════════════════════════════`);
    console.log(`🎉 Bootstrap Complete!`);
    console.log(`   ✅ Success: ${success}`);
    console.log(`   ❌ Failed: ${failed}`);
    console.log(`═══════════════════════════════════════\n`);
}

function extractBoard(scenarioHash) {
    if (!scenarioHash) return '';
    const parts = scenarioHash.split('_');
    return parts[parts.length - 1] || '';
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Parse CLI args
const args = process.argv.slice(2);
const options = {
    count: 100,
    dryRun: false,
};

for (const arg of args) {
    if (arg.startsWith('--count=')) {
        options.count = parseInt(arg.split('=')[1], 10);
    }
    if (arg === '--dry-run') {
        options.dryRun = true;
    }
}

// Run
bootstrapGTOPanels(options).catch(console.error);
