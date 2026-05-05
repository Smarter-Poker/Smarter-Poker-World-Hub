import { SHOVE_FOLD } from './src/config/solverRanges.js';

// SHOVE_FOLD shape: { '10BB': { BTN: { 'AA': { shove: 1.0 }, ... } } }
// memory_charts_gold needs: { game_type, stack_depth, hero_position, hand_matrix }
// hand_matrix format: { hand: action_string } where action is 'shove' or 'fold'

function buildHandMatrix(positionData) {
    const out = {};
    for (const [hand, freqs] of Object.entries(positionData || {})) {
        // Determine top action
        const entries = Object.entries(freqs).filter(([, v]) => typeof v === 'number' && v > 0);
        if (entries.length === 0) {
            out[hand] = 'fold';
        } else {
            entries.sort((a, b) => b[1] - a[1]);
            const [action, freq] = entries[0];
            // For mixed strategies, encode as 'shove50' etc; for pure, just 'shove' or 'fold'
            if (freq >= 0.95) {
                out[hand] = action;
            } else {
                out[hand] = action + Math.round(freq * 100);
            }
        }
    }
    return out;
}

// Build rows for each (stack_depth, position) — duplicated for both 'Cash' and 'Tournament' game types
const rows = [];
for (const [bucketKey, bucketData] of Object.entries(SHOVE_FOLD)) {
    const stackDepth = parseInt(bucketKey, 10); // '10BB' → 10
    if (!Number.isFinite(stackDepth)) continue;
    for (const [position, positionData] of Object.entries(bucketData)) {
        const matrix = buildHandMatrix(positionData);
        for (const gameType of ['Cash', 'Tournament']) {
            rows.push({
                game_type: gameType,
                stack_depth: stackDepth,
                hero_position: position,
                villain_action: 'fold_to_hero',
                hand_matrix: matrix,
            });
        }
    }
}

console.log('-- Generated', rows.length, 'memory_charts_gold rows from solverRanges.SHOVE_FOLD');
console.log('-- Distinct stack depths:', [...new Set(rows.map(r => r.stack_depth))].join(','));
console.log('-- Distinct positions:', [...new Set(rows.map(r => r.hero_position))].join(','));
console.log('-- Distinct game types:', [...new Set(rows.map(r => r.game_type))].join(','));
console.log('-- Sample row matrix size:', Object.keys(rows[0].hand_matrix).length);

// Output as SQL UPDATE statements (rather than INSERT — shells already exist)
console.log('');
console.log('-- BEGIN MIGRATION');
console.log('BEGIN;');
console.log('');

for (const r of rows) {
    const matrixJson = JSON.stringify(r.hand_matrix).replace(/'/g, "''");
    console.log(`UPDATE memory_charts_gold SET hand_matrix = '${matrixJson}'::jsonb WHERE game_type = '${r.game_type}' AND stack_depth = ${r.stack_depth} AND hero_position = '${r.hero_position}' AND villain_action = '${r.villain_action}';`);
}

console.log('');
console.log('COMMIT;');
