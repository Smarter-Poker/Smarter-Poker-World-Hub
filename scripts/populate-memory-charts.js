/**
 * Populate memory_charts_gold with comprehensive push/fold charts
 * 
 * Chart types:
 * - Push/Fold charts for various stack depths (5bb, 10bb, 15bb, 20bb)
 * - All positions: UTG, MP, CO, BTN, SB, BB
 * - Both Cash and Tournament game types
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

// All 169 hand combos in standard notation
const HANDS = [
    // Pocket pairs
    'AA', 'KK', 'QQ', 'JJ', 'TT', '99', '88', '77', '66', '55', '44', '33', '22',
    // Suited hands
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
    // Offsuit hands
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

// GTO-based push ranges by position and stack depth
// Format: { position: { stackDepth: [hands to push] } }
const PUSH_RANGES = {
    'BTN': {
        5: ['AA', 'KK', 'QQ', 'JJ', 'TT', '99', '88', '77', '66', '55', '44', '33', '22',
            'AKs', 'AQs', 'AJs', 'ATs', 'A9s', 'A8s', 'A7s', 'A6s', 'A5s', 'A4s', 'A3s', 'A2s',
            'AKo', 'AQo', 'AJo', 'ATo', 'A9o', 'A8o', 'A7o', 'A6o', 'A5o', 'A4o', 'A3o', 'A2o',
            'KQs', 'KJs', 'KTs', 'K9s', 'K8s', 'K7s', 'K6s', 'K5s', 'K4s', 'K3s', 'K2s',
            'KQo', 'KJo', 'KTo', 'K9o', 'K8o', 'K7o', 'K6o', 'K5o',
            'QJs', 'QTs', 'Q9s', 'Q8s', 'Q7s', 'Q6s', 'Q5s', 'Q4s', 'Q3s', 'Q2s',
            'QJo', 'QTo', 'Q9o', 'Q8o', 'Q7o',
            'JTs', 'J9s', 'J8s', 'J7s', 'J6s', 'J5s', 'J4s',
            'JTo', 'J9o', 'J8o',
            'T9s', 'T8s', 'T7s', 'T6s', 'T5s',
            'T9o', 'T8o',
            '98s', '97s', '96s', '95s',
            '87s', '86s', '85s',
            '76s', '75s', '65s', '54s'],
        10: ['AA', 'KK', 'QQ', 'JJ', 'TT', '99', '88', '77', '66', '55', '44', '33', '22',
            'AKs', 'AQs', 'AJs', 'ATs', 'A9s', 'A8s', 'A7s', 'A6s', 'A5s', 'A4s', 'A3s', 'A2s',
            'AKo', 'AQo', 'AJo', 'ATo', 'A9o', 'A8o', 'A7o', 'A5o', 'A4o',
            'KQs', 'KJs', 'KTs', 'K9s', 'K8s', 'K7s', 'K6s', 'K5s',
            'KQo', 'KJo', 'KTo', 'K9o',
            'QJs', 'QTs', 'Q9s', 'Q8s', 'Q7s',
            'QJo', 'QTo', 'Q9o',
            'JTs', 'J9s', 'J8s',
            'JTo', 'J9o',
            'T9s', 'T8s',
            '98s', '87s', '76s', '65s', '54s'],
        15: ['AA', 'KK', 'QQ', 'JJ', 'TT', '99', '88', '77', '66', '55',
            'AKs', 'AQs', 'AJs', 'ATs', 'A9s', 'A8s', 'A7s', 'A5s', 'A4s', 'A3s', 'A2s',
            'AKo', 'AQo', 'AJo', 'ATo', 'A9o',
            'KQs', 'KJs', 'KTs', 'K9s',
            'KQo', 'KJo',
            'QJs', 'QTs', 'Q9s',
            'JTs', 'J9s',
            'T9s', '98s', '87s', '76s'],
        20: ['AA', 'KK', 'QQ', 'JJ', 'TT', '99', '88', '77',
            'AKs', 'AQs', 'AJs', 'ATs', 'A9s', 'A5s', 'A4s',
            'AKo', 'AQo', 'AJo',
            'KQs', 'KJs', 'KTs',
            'KQo',
            'QJs', 'QTs',
            'JTs', 'T9s'],
    },
    'SB': {
        5: ['AA', 'KK', 'QQ', 'JJ', 'TT', '99', '88', '77', '66', '55', '44', '33', '22',
            'AKs', 'AQs', 'AJs', 'ATs', 'A9s', 'A8s', 'A7s', 'A6s', 'A5s', 'A4s', 'A3s', 'A2s',
            'AKo', 'AQo', 'AJo', 'ATo', 'A9o', 'A8o', 'A7o', 'A6o', 'A5o', 'A4o', 'A3o', 'A2o',
            'KQs', 'KJs', 'KTs', 'K9s', 'K8s', 'K7s', 'K6s', 'K5s', 'K4s', 'K3s', 'K2s',
            'KQo', 'KJo', 'KTo', 'K9o', 'K8o', 'K7o', 'K6o',
            'QJs', 'QTs', 'Q9s', 'Q8s', 'Q7s', 'Q6s', 'Q5s',
            'QJo', 'QTo', 'Q9o', 'Q8o',
            'JTs', 'J9s', 'J8s', 'J7s',
            'JTo', 'J9o',
            'T9s', 'T8s', 'T7s',
            'T9o',
            '98s', '97s', '96s',
            '87s', '86s', '76s', '75s', '65s', '54s'],
        10: ['AA', 'KK', 'QQ', 'JJ', 'TT', '99', '88', '77', '66', '55', '44', '33',
            'AKs', 'AQs', 'AJs', 'ATs', 'A9s', 'A8s', 'A7s', 'A6s', 'A5s', 'A4s', 'A3s', 'A2s',
            'AKo', 'AQo', 'AJo', 'ATo', 'A9o', 'A8o', 'A5o', 'A4o',
            'KQs', 'KJs', 'KTs', 'K9s', 'K8s', 'K7s',
            'KQo', 'KJo', 'KTo', 'K9o',
            'QJs', 'QTs', 'Q9s', 'Q8s',
            'QJo', 'QTo',
            'JTs', 'J9s', 'J8s',
            'JTo',
            'T9s', 'T8s',
            '98s', '87s', '76s', '65s'],
        15: ['AA', 'KK', 'QQ', 'JJ', 'TT', '99', '88', '77', '66',
            'AKs', 'AQs', 'AJs', 'ATs', 'A9s', 'A8s', 'A5s', 'A4s',
            'AKo', 'AQo', 'AJo', 'ATo',
            'KQs', 'KJs', 'KTs', 'K9s',
            'KQo', 'KJo',
            'QJs', 'QTs', 'Q9s',
            'JTs', 'J9s',
            'T9s', '98s', '87s'],
        20: ['AA', 'KK', 'QQ', 'JJ', 'TT', '99', '88',
            'AKs', 'AQs', 'AJs', 'ATs', 'A9s', 'A5s',
            'AKo', 'AQo', 'AJo',
            'KQs', 'KJs', 'KTs',
            'KQo',
            'QJs', 'QTs',
            'JTs'],
    },
    'CO': {
        5: ['AA', 'KK', 'QQ', 'JJ', 'TT', '99', '88', '77', '66', '55', '44', '33', '22',
            'AKs', 'AQs', 'AJs', 'ATs', 'A9s', 'A8s', 'A7s', 'A6s', 'A5s', 'A4s', 'A3s', 'A2s',
            'AKo', 'AQo', 'AJo', 'ATo', 'A9o', 'A8o', 'A7o', 'A6o', 'A5o', 'A4o',
            'KQs', 'KJs', 'KTs', 'K9s', 'K8s', 'K7s', 'K6s', 'K5s',
            'KQo', 'KJo', 'KTo', 'K9o', 'K8o',
            'QJs', 'QTs', 'Q9s', 'Q8s', 'Q7s',
            'QJo', 'QTo', 'Q9o',
            'JTs', 'J9s', 'J8s',
            'JTo', 'J9o',
            'T9s', 'T8s',
            '98s', '97s', '87s', '76s', '65s', '54s'],
        10: ['AA', 'KK', 'QQ', 'JJ', 'TT', '99', '88', '77', '66', '55', '44',
            'AKs', 'AQs', 'AJs', 'ATs', 'A9s', 'A8s', 'A7s', 'A5s', 'A4s', 'A3s',
            'AKo', 'AQo', 'AJo', 'ATo', 'A9o', 'A8o',
            'KQs', 'KJs', 'KTs', 'K9s', 'K8s',
            'KQo', 'KJo', 'KTo',
            'QJs', 'QTs', 'Q9s',
            'QJo', 'QTo',
            'JTs', 'J9s',
            'JTo',
            'T9s', '98s', '87s', '76s'],
        15: ['AA', 'KK', 'QQ', 'JJ', 'TT', '99', '88', '77',
            'AKs', 'AQs', 'AJs', 'ATs', 'A9s', 'A5s',
            'AKo', 'AQo', 'AJo', 'ATo',
            'KQs', 'KJs', 'KTs',
            'KQo', 'KJo',
            'QJs', 'QTs',
            'JTs', 'T9s'],
        20: ['AA', 'KK', 'QQ', 'JJ', 'TT', '99',
            'AKs', 'AQs', 'AJs', 'ATs',
            'AKo', 'AQo',
            'KQs', 'KJs',
            'KQo',
            'QJs'],
    },
    'MP': {
        5: ['AA', 'KK', 'QQ', 'JJ', 'TT', '99', '88', '77', '66', '55', '44',
            'AKs', 'AQs', 'AJs', 'ATs', 'A9s', 'A8s', 'A7s', 'A5s', 'A4s', 'A3s', 'A2s',
            'AKo', 'AQo', 'AJo', 'ATo', 'A9o', 'A8o', 'A7o',
            'KQs', 'KJs', 'KTs', 'K9s', 'K8s',
            'KQo', 'KJo', 'KTo', 'K9o',
            'QJs', 'QTs', 'Q9s',
            'QJo', 'QTo',
            'JTs', 'J9s',
            'JTo',
            'T9s', '98s', '87s', '76s'],
        10: ['AA', 'KK', 'QQ', 'JJ', 'TT', '99', '88', '77', '66',
            'AKs', 'AQs', 'AJs', 'ATs', 'A9s', 'A8s', 'A5s',
            'AKo', 'AQo', 'AJo', 'ATo', 'A9o',
            'KQs', 'KJs', 'KTs', 'K9s',
            'KQo', 'KJo',
            'QJs', 'QTs',
            'QJo',
            'JTs', 'T9s', '98s'],
        15: ['AA', 'KK', 'QQ', 'JJ', 'TT', '99', '88',
            'AKs', 'AQs', 'AJs', 'ATs', 'A5s',
            'AKo', 'AQo', 'AJo',
            'KQs', 'KJs',
            'KQo',
            'QJs', 'JTs'],
        20: ['AA', 'KK', 'QQ', 'JJ', 'TT',
            'AKs', 'AQs', 'AJs',
            'AKo', 'AQo',
            'KQs'],
    },
    'UTG': {
        5: ['AA', 'KK', 'QQ', 'JJ', 'TT', '99', '88', '77', '66', '55',
            'AKs', 'AQs', 'AJs', 'ATs', 'A9s', 'A8s', 'A5s', 'A4s',
            'AKo', 'AQo', 'AJo', 'ATo', 'A9o',
            'KQs', 'KJs', 'KTs', 'K9s',
            'KQo', 'KJo',
            'QJs', 'QTs',
            'QJo',
            'JTs', 'T9s', '98s', '87s'],
        10: ['AA', 'KK', 'QQ', 'JJ', 'TT', '99', '88', '77',
            'AKs', 'AQs', 'AJs', 'ATs', 'A9s',
            'AKo', 'AQo', 'AJo',
            'KQs', 'KJs', 'KTs',
            'KQo',
            'QJs', 'QTs',
            'JTs'],
        15: ['AA', 'KK', 'QQ', 'JJ', 'TT', '99',
            'AKs', 'AQs', 'AJs', 'ATs',
            'AKo', 'AQo',
            'KQs', 'KJs',
            'QJs'],
        20: ['AA', 'KK', 'QQ', 'JJ',
            'AKs', 'AQs',
            'AKo'],
    },
    'BB': {
        5: ['AA', 'KK', 'QQ', 'JJ', 'TT', '99', '88', '77', '66', '55', '44', '33', '22',
            'AKs', 'AQs', 'AJs', 'ATs', 'A9s', 'A8s', 'A7s', 'A6s', 'A5s', 'A4s', 'A3s', 'A2s',
            'AKo', 'AQo', 'AJo', 'ATo', 'A9o', 'A8o', 'A7o', 'A6o', 'A5o', 'A4o', 'A3o',
            'KQs', 'KJs', 'KTs', 'K9s', 'K8s', 'K7s', 'K6s', 'K5s', 'K4s',
            'KQo', 'KJo', 'KTo', 'K9o', 'K8o', 'K7o',
            'QJs', 'QTs', 'Q9s', 'Q8s', 'Q7s', 'Q6s',
            'QJo', 'QTo', 'Q9o',
            'JTs', 'J9s', 'J8s', 'J7s',
            'JTo', 'J9o',
            'T9s', 'T8s', 'T7s',
            'T9o',
            '98s', '97s', '96s',
            '87s', '86s', '76s', '65s', '54s'],
        10: ['AA', 'KK', 'QQ', 'JJ', 'TT', '99', '88', '77', '66', '55', '44',
            'AKs', 'AQs', 'AJs', 'ATs', 'A9s', 'A8s', 'A7s', 'A6s', 'A5s', 'A4s', 'A3s',
            'AKo', 'AQo', 'AJo', 'ATo', 'A9o', 'A8o', 'A5o',
            'KQs', 'KJs', 'KTs', 'K9s', 'K8s', 'K7s',
            'KQo', 'KJo', 'KTo', 'K9o',
            'QJs', 'QTs', 'Q9s', 'Q8s',
            'QJo', 'QTo',
            'JTs', 'J9s', 'J8s',
            'JTo',
            'T9s', 'T8s',
            '98s', '87s', '76s'],
        15: ['AA', 'KK', 'QQ', 'JJ', 'TT', '99', '88', '77',
            'AKs', 'AQs', 'AJs', 'ATs', 'A9s', 'A8s', 'A5s',
            'AKo', 'AQo', 'AJo', 'ATo',
            'KQs', 'KJs', 'KTs', 'K9s',
            'KQo', 'KJo',
            'QJs', 'QTs', 'Q9s',
            'JTs', 'J9s',
            'T9s', '98s'],
        20: ['AA', 'KK', 'QQ', 'JJ', 'TT', '99',
            'AKs', 'AQs', 'AJs', 'ATs', 'A5s',
            'AKo', 'AQo', 'AJo',
            'KQs', 'KJs', 'KTs',
            'KQo',
            'QJs', 'QTs',
            'JTs'],
    },
};

// Create hand matrix with frequencies
function createHandMatrix(pushRange) {
    const matrix = {};
    for (const hand of HANDS) {
        const isPush = pushRange.includes(hand);
        matrix[hand] = {
            push: isPush ? 1 : 0,
            fold: isPush ? 0 : 1,
        };
    }
    return matrix;
}

// Generate chart records
async function populateCharts() {
    console.log('🎯 Populating memory_charts_gold with GTO push/fold ranges...\n');

    const positions = Object.keys(PUSH_RANGES);
    const stackDepths = [5, 10, 15, 20];
    const gameTypes = ['Tournament', 'Cash'];

    const records = [];

    for (const gameType of gameTypes) {
        for (const position of positions) {
            for (const stackDepth of stackDepths) {
                const pushRange = PUSH_RANGES[position][stackDepth];
                const handMatrix = createHandMatrix(pushRange);

                records.push({
                    game_type: gameType,
                    stack_depth: stackDepth,
                    hero_position: position,
                    villain_action: 'fold_to_hero',
                    hand_matrix: handMatrix,
                });
            }
        }
    }

    console.log(`📊 Generated ${records.length} chart records`);
    console.log(`   Positions: ${positions.join(', ')}`);
    console.log(`   Stack depths: ${stackDepths.join('bb, ')}bb`);
    console.log(`   Game types: ${gameTypes.join(', ')}\n`);

    // Clear existing mock data
    console.log('🗑️  Clearing existing mock records...');
    const { error: deleteError } = await sb.from('memory_charts_gold').delete().neq('chart_id', '00000000-0000-0000-0000-000000000000');
    if (deleteError) {
        console.error('Delete error:', deleteError.message);
    }

    // Insert new records in batches
    console.log('📝 Inserting new chart records...');
    const batchSize = 10;
    let inserted = 0;

    for (let i = 0; i < records.length; i += batchSize) {
        const batch = records.slice(i, i + batchSize);
        const { error } = await sb.from('memory_charts_gold').insert(batch);
        if (error) {
            console.error(`Batch ${i / batchSize + 1} error:`, error.message);
        } else {
            inserted += batch.length;
        }
    }

    console.log(`\n✅ Successfully inserted ${inserted} chart records`);

    // Verify
    const { count } = await sb.from('memory_charts_gold').select('*', { count: 'exact', head: true });
    console.log(`📊 Total records in memory_charts_gold: ${count}`);
}

populateCharts().catch(console.error);
