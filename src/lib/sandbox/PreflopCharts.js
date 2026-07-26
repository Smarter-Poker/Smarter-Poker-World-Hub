/**
 * PreflopCharts — Standard 6-Max GTO Opening Ranges (100BB)
 * ═══════════════════════════════════════════════════════════════
 * Static data for preflop open, 3bet, and call ranges by position.
 * Based on standard GTO 6-max solver solutions.
 *
 * Key: hand notation (e.g. 'AKs', 'TT', 'A5o')
 * Value: action ('raise', '3bet', 'call', 'fold')
 */

const RANKS = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2'];

// Generate all 169 hand combos in standard grid order
function generateHandGrid() {
    const grid = [];
    for (let r = 0; r < 13; r++) {
        const row = [];
        for (let c = 0; c < 13; c++) {
            if (r === c) row.push(`${RANKS[r]}${RANKS[c]}`);       // Pocket pair
            else if (r < c) row.push(`${RANKS[r]}${RANKS[c]}s`);   // Suited (above diagonal)
            else row.push(`${RANKS[c]}${RANKS[r]}o`);              // Offsuit (below diagonal)
        }
        grid.push(row);
    }
    return grid;
}

export const HAND_GRID = generateHandGrid();

// Open raise ranges by position (RFI — first in, no prior raises)
// 'r' = raise, 'f' = fold
const RFI_RANGES = {
    // ~17% of combos — standard 100bb 6-max UTG open (no 75s/86s/97s/T8s/54s/K9s
    // "cutoff hands"; suited connectors kept from 65s up).
    UTG: new Set([
        'AA', 'KK', 'QQ', 'JJ', 'TT', '99', '88', '77', '66', '55',
        'AKs', 'AQs', 'AJs', 'ATs', 'A9s', 'A5s', 'A4s', 'A3s', 'A2s',
        'KQs', 'KJs', 'KTs',
        'QJs', 'QTs',
        'JTs', 'J9s',
        'T9s',
        '98s',
        '87s',
        '76s',
        '65s',
        'AKo', 'AQo', 'AJo', 'ATo',
        'KQo',
    ]),
    // ~20-21% of combos
    MP: new Set([
        'AA', 'KK', 'QQ', 'JJ', 'TT', '99', '88', '77', '66',
        'AKs', 'AQs', 'AJs', 'ATs', 'A9s', 'A8s', 'A5s', 'A4s', 'A3s', 'A2s',
        'KQs', 'KJs', 'KTs', 'K9s',
        'QJs', 'QTs', 'Q9s',
        'JTs', 'J9s',
        'T9s', 'T8s',
        '98s',
        '87s',
        '76s',
        '65s',
        '54s',
        'AKo', 'AQo', 'AJo', 'ATo',
        'KQo', 'KJo',
        'QJo',
    ]),
    CO: new Set([
        'AA', 'KK', 'QQ', 'JJ', 'TT', '99', '88', '77', '66', '55',
        'AKs', 'AQs', 'AJs', 'ATs', 'A9s', 'A8s', 'A7s', 'A6s', 'A5s', 'A4s', 'A3s', 'A2s',
        'KQs', 'KJs', 'KTs', 'K9s', 'K8s', 'K7s', 'K6s',
        'QJs', 'QTs', 'Q9s', 'Q8s',
        'JTs', 'J9s', 'J8s', 'J7s',
        'T9s', 'T8s', 'T7s',
        '98s', '97s', '96s',
        '87s', '86s', '85s',
        '76s', '75s',
        '65s', '64s',
        '54s', '53s',
        'AKo', 'AQo', 'AJo', 'ATo', 'A9o', 'A8o',
        'KQo', 'KJo', 'KTo',
        'QJo', 'QTo',
        'JTo',
        'T9o',
    ]),
    BTN: new Set([
        'AA', 'KK', 'QQ', 'JJ', 'TT', '99', '88', '77', '66', '55', '44', '33', '22',
        'AKs', 'AQs', 'AJs', 'ATs', 'A9s', 'A8s', 'A7s', 'A6s', 'A5s', 'A4s', 'A3s', 'A2s',
        'KQs', 'KJs', 'KTs', 'K9s', 'K8s', 'K7s', 'K6s', 'K5s', 'K4s', 'K3s', 'K2s',
        'QJs', 'QTs', 'Q9s', 'Q8s', 'Q7s', 'Q6s', 'Q5s',
        'JTs', 'J9s', 'J8s', 'J7s', 'J6s',
        'T9s', 'T8s', 'T7s', 'T6s',
        '98s', '97s', '96s', '95s',
        '87s', '86s', '85s',
        '76s', '75s', '74s',
        '65s', '64s', '63s',
        '54s', '53s', '52s',
        '43s', '42s',
        '32s',
        'AKo', 'AQo', 'AJo', 'ATo', 'A9o', 'A8o', 'A7o', 'A6o', 'A5o', 'A4o', 'A3o', 'A2o',
        'KQo', 'KJo', 'KTo', 'K9o', 'K8o', 'K7o',
        'QJo', 'QTo', 'Q9o', 'Q8o',
        'JTo', 'J9o', 'J8o',
        'T9o', 'T8o',
        '98o', '97o',
        '87o', '86o',
        '76o', '75o',
        '65o',
        '54o',
    ]),
    SB: new Set([
        'AA', 'KK', 'QQ', 'JJ', 'TT', '99', '88', '77', '66', '55', '44', '33', '22',
        'AKs', 'AQs', 'AJs', 'ATs', 'A9s', 'A8s', 'A7s', 'A6s', 'A5s', 'A4s', 'A3s', 'A2s',
        'KQs', 'KJs', 'KTs', 'K9s', 'K8s', 'K7s', 'K6s', 'K5s', 'K4s', 'K3s',
        'QJs', 'QTs', 'Q9s', 'Q8s', 'Q7s', 'Q6s', 'Q5s', 'Q4s',
        'JTs', 'J9s', 'J8s', 'J7s', 'J6s', 'J5s',
        'T9s', 'T8s', 'T7s', 'T6s',
        '98s', '97s', '96s', '95s',
        '87s', '86s', '85s',
        '76s', '75s', '74s',
        '65s', '64s', '63s',
        '54s', '53s', '52s',
        '43s', '42s',
        '32s',
        'AKo', 'AQo', 'AJo', 'ATo', 'A9o', 'A8o', 'A7o', 'A6o', 'A5o', 'A4o', 'A3o', 'A2o',
        'KQo', 'KJo', 'KTo', 'K9o', 'K8o', 'K7o', 'K6o',
        'QJo', 'QTo', 'Q9o', 'Q8o', 'Q7o',
        'JTo', 'J9o', 'J8o', 'J7o',
        'T9o', 'T8o', 'T7o',
        '98o', '97o', '96o',
        '87o', '86o', '85o',
        '76o', '75o',
        '65o', '64o',
        '54o', '53o',
        '43o',
    ]),
};

// 3-bet ranges by position (when facing a raise) — value hands plus the
// standard suited-wheel-ace / suited-connector bluff combos so the grids are
// not pure value.
const THREE_BET_RANGES = {
    UTG: new Set(['AA', 'KK', 'QQ', 'AKs', 'AKo', 'A5s', 'A4s']),
    MP: new Set(['AA', 'KK', 'QQ', 'JJ', 'AKs', 'AKo', 'AQs', 'A5s', 'A4s']),
    CO: new Set(['AA', 'KK', 'QQ', 'JJ', 'TT', 'AKs', 'AKo', 'AQs', 'AQo', 'AJs', 'A5s', 'A4s', 'KJs']),
    BTN: new Set(['AA', 'KK', 'QQ', 'JJ', 'TT', '99', 'AKs', 'AKo', 'AQs', 'AQo', 'AJs', 'AJo', 'ATs', 'KQs', 'KJs', 'A5s', 'A4s', 'A3s', '76s', '65s']),
    SB: new Set(['AA', 'KK', 'QQ', 'JJ', 'TT', '99', '88', 'AKs', 'AKo', 'AQs', 'AQo', 'AJs', 'AJo', 'ATs', 'A5s', 'A4s', 'A3s', 'KQs', 'KJs', 'KTs', '65s']),
    BB: new Set(['AA', 'KK', 'QQ', 'JJ', 'TT', '99', '88', '77', 'AKs', 'AKo', 'AQs', 'AQo', 'AJs', 'ATs', 'A5s', 'A4s', 'A3s', 'A2s', 'KQs', 'KJs', 'QJs', '76s', '65s', '54s']),
};

// Cold-calling / defending ranges when facing an open (NOT the RFI range —
// a defend range is a different object entirely, and the BB defends widest).
const FACING_RAISE_CALL_RANGES = {
    UTG: new Set(['JJ', 'TT', '99', 'AQs', 'AJs', 'KQs']),
    MP: new Set(['JJ', 'TT', '99', '88', 'AQs', 'AJs', 'ATs', 'KQs', 'KJs', 'QJs', 'JTs']),
    CO: new Set(['TT', '99', '88', '77', 'AJs', 'ATs', 'KQs', 'KJs', 'KTs', 'QJs', 'QTs', 'JTs', 'T9s', '98s', '87s', '76s', 'AQo']),
    BTN: new Set([
        'TT', '99', '88', '77', '66', '55', '44', '33', '22',
        'AJs', 'ATs', 'A9s', 'A8s', 'A7s', 'A6s', 'A2s',
        'KQs', 'KTs', 'K9s', 'QJs', 'QTs', 'Q9s', 'JTs', 'J9s', 'T9s', 'T8s', '98s', '87s', '76s', '65s', '54s',
        'AQo', 'AJo', 'ATo', 'KQo', 'KJo', 'QJo',
    ]),
    SB: new Set([
        '77', '66', '55', '44', '33', '22',
        'AJs', 'ATs', 'A9s', 'A8s', 'A7s', 'A6s', 'A2s',
        'QJs', 'QTs', 'JTs', 'T9s', '98s', '87s', '76s', '54s',
        'AJo', 'ATo', 'KQo', 'KJo',
    ]),
    // BB defends ~33% of combos closing the action with a discount
    BB: new Set([
        'JJ', 'TT', '99', '88', '77', '66', '55', '44', '33', '22',
        'AJs', 'ATs', 'A9s', 'A8s', 'A7s', 'A6s', 'A2s',
        'KQs', 'KJs', 'KTs', 'K9s', 'K8s', 'K7s', 'K6s', 'K5s',
        'QJs', 'QTs', 'Q9s', 'Q8s',
        'JTs', 'J9s', 'J8s',
        'T9s', 'T8s',
        '98s', '97s',
        '87s', '86s',
        '76s', '75s',
        '65s', '64s',
        '54s', '53s',
        '43s',
        'AQo', 'AJo', 'ATo',
        'KQo', 'KJo', 'KTo',
        'QJo', 'QTo',
        'JTo',
    ]),
};

/**
 * Get the recommended action for a hand at a given position.
 * @param {string} hand - e.g. 'AKs', 'TT', 'Q9o'
 * @param {string} position - e.g. 'BTN', 'UTG'
 * @param {string} scenario - 'rfi' (first in) or '3bet' (facing raise)
 * @returns {{ action: string, inRange: boolean }}
 */
export function getHandAction(hand, position, scenario = 'rfi') {
    if (scenario === '3bet') {
        const range = THREE_BET_RANGES[position];
        if (!range) return { action: 'fold', inRange: false };
        if (range.has(hand)) return { action: '3bet', inRange: true };
        // Explicit defend range — never "RFI minus 3bet", which is a different
        // strategic object and leaves the BB with no calling range at all.
        const callRange = FACING_RAISE_CALL_RANGES[position];
        if (callRange) {
            return callRange.has(hand)
                ? { action: 'call', inRange: true }
                : { action: 'fold', inRange: false };
        }
        // Positions without an explicit table: fall back to the old heuristic.
        const rfi = RFI_RANGES[position];
        if (rfi && rfi.has(hand)) return { action: 'call', inRange: true };
        return { action: 'fold', inRange: false };
    }

    // RFI (first in). The BB is never "first in" — an unopened pot is checked
    // through, so every hand continues rather than folding.
    if (position === 'BB') return { action: 'check', inRange: true };

    const range = RFI_RANGES[position];
    if (!range) return { action: 'fold', inRange: false };
    return range.has(hand) ? { action: 'raise', inRange: true } : { action: 'fold', inRange: false };
}

/**
 * Get the full range grid for a position and scenario.
 * Returns 13x13 array of { hand, action, inRange }.
 */
export function getRangeGrid(position, scenario = 'rfi') {
    return HAND_GRID.map(row =>
        row.map(hand => ({
            hand,
            ...getHandAction(hand, position, scenario),
        }))
    );
}

/**
 * Combo weight of a hand notation: pair = 6, suited = 4, offsuit = 12.
 */
function comboWeight(hand) {
    if (!hand || hand.length < 2) return 0;
    if (hand.length === 2) return 6;       // pocket pair
    if (hand.endsWith('s')) return 4;      // suited
    if (hand.endsWith('o')) return 12;     // offsuit
    return 0;
}

/**
 * Combo-weighted percentage of a set/array of hand notations (of 1326 combos).
 */
export function getRangePercentFromHands(hands) {
    const list = hands instanceof Set ? [...hands] : (hands || []);
    const combos = list.reduce((sum, h) => sum + comboWeight(h), 0);
    return Math.round(combos / 1326 * 100);
}

/**
 * Get the percentage of hands in range for a position.
 * Weighted by combinations (pair 6, suited 4, offsuit 12) — a raw cell count
 * over 169 overweights pairs and suited hands badly.
 */
export function getRangePercentage(position, scenario = 'rfi') {
    // The BB never opens first-in; it continues with 100% of hands (check).
    if (scenario !== '3bet' && position === 'BB') return 100;

    if (scenario === '3bet') {
        const threeBet = THREE_BET_RANGES[position];
        const call = FACING_RAISE_CALL_RANGES[position];
        if (!threeBet && !call) return 0;
        const combined = new Set([...(threeBet || []), ...(call || [])]);
        return getRangePercentFromHands(combined);
    }

    const range = RFI_RANGES[position];
    if (!range) return 0;
    return getRangePercentFromHands(range);
}
