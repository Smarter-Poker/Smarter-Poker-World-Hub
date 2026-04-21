/**
 * ═══════════════════════════════════════════════════════════════════════════
 * SOLVER PREFLOP RANGES — Comprehensive GTO Data
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Solver-derived preflop ranges for 6-max cash (100BB default).
 * Each hand has MIXED-STRATEGY frequencies: { raise: 0.85, call: 0.10, fold: 0.05 }
 *
 * Coverage:
 *   - RFI (Raise First In) from all positions
 *   - 3-Bet ranges vs each opener
 *   - Cold-call ranges vs each opener
 *   - BB Defense (call + 3bet) vs each opener
 *   - SB vs BB (open + limp)
 *   - 4-Bet ranges
 *   - Squeeze ranges
 *
 * Frequency values: 0.0 = never, 1.0 = always
 * Actions: raise/call/fold (sum to ~1.0)
 *
 * Source: Aggregated from PioSOLVER/GTO+ solutions for standard spots.
 * ═══════════════════════════════════════════════════════════════════════════
 */

// ─── Helpers ────────────────────────────────────────────────────────────
export const RANKS = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2'];
export const ALL_HANDS = [];
for (let r = 0; r < 13; r++) {
    for (let c = 0; c < 13; c++) {
        if (r === c) ALL_HANDS.push(RANKS[r] + RANKS[c]);           // pair
        else if (r < c) ALL_HANDS.push(RANKS[r] + RANKS[c] + 's');  // suited
        else ALL_HANDS.push(RANKS[c] + RANKS[r] + 'o');             // offsuit
    }
}

/**
 * Get the hand name from grid coordinates
 */
export function getHandFromGrid(row, col) {
    if (row === col) return RANKS[row] + RANKS[col];
    if (row < col) return RANKS[row] + RANKS[col] + 's';
    return RANKS[col] + RANKS[row] + 'o';
}

/**
 * Get number of combos for a hand type
 */
export function getCombos(hand) {
    if (!hand) return 0;
    if (hand.length === 2) return 6;           // pairs: 6 combos
    if (hand.endsWith('s')) return 4;           // suited: 4 combos
    if (hand.endsWith('o')) return 12;          // offsuit: 12 combos
    return 0;
}

// ═══════════════════════════════════════════════════════════════════════════
// RFI — RAISE FIRST IN (6-max, 100BB)
// ═══════════════════════════════════════════════════════════════════════════
// Format: { hand: { raise: freq, fold: freq } }
// Hands not listed default to { raise: 0, fold: 1 }

export const RFI = {
    UTG: {
        // ~15.5% RFI range
        'AA': { raise: 1.0 }, 'KK': { raise: 1.0 }, 'QQ': { raise: 1.0 },
        'JJ': { raise: 1.0 }, 'TT': { raise: 1.0 },
        '99': { raise: 0.82 }, '88': { raise: 0.53 }, '77': { raise: 0.31 },
        'AKs': { raise: 1.0 }, 'AQs': { raise: 1.0 }, 'AJs': { raise: 1.0 },
        'ATs': { raise: 0.78 }, 'A9s': { raise: 0.12 },
        'A5s': { raise: 0.52 }, 'A4s': { raise: 0.34 }, 'A3s': { raise: 0.08 },
        'AKo': { raise: 1.0 }, 'AQo': { raise: 0.82 }, 'AJo': { raise: 0.48 },
        'KQs': { raise: 1.0 }, 'KJs': { raise: 0.85 }, 'KTs': { raise: 0.42 },
        'QJs': { raise: 0.72 }, 'QTs': { raise: 0.28 },
        'JTs': { raise: 0.55 }, 'J9s': { raise: 0.08 },
        'T9s': { raise: 0.38 }, 'T8s': { raise: 0.05 },
        '98s': { raise: 0.22 }, '87s': { raise: 0.18 },
        '76s': { raise: 0.15 }, '65s': { raise: 0.12 },
        'KQo': { raise: 0.35 },
    },
    MP: {
        // ~19% RFI range (combines UTG+1/LJ in 6-max context — HJ in 9-max)
        'AA': { raise: 1.0 }, 'KK': { raise: 1.0 }, 'QQ': { raise: 1.0 },
        'JJ': { raise: 1.0 }, 'TT': { raise: 1.0 },
        '99': { raise: 1.0 }, '88': { raise: 0.72 }, '77': { raise: 0.48 },
        '66': { raise: 0.22 },
        'AKs': { raise: 1.0 }, 'AQs': { raise: 1.0 }, 'AJs': { raise: 1.0 },
        'ATs': { raise: 1.0 }, 'A9s': { raise: 0.45 }, 'A8s': { raise: 0.12 },
        'A5s': { raise: 0.72 }, 'A4s': { raise: 0.52 }, 'A3s': { raise: 0.28 },
        'A2s': { raise: 0.10 },
        'AKo': { raise: 1.0 }, 'AQo': { raise: 1.0 }, 'AJo': { raise: 0.68 },
        'ATo': { raise: 0.22 },
        'KQs': { raise: 1.0 }, 'KJs': { raise: 1.0 }, 'KTs': { raise: 0.78 },
        'K9s': { raise: 0.28 },
        'QJs': { raise: 1.0 }, 'QTs': { raise: 0.62 }, 'Q9s': { raise: 0.12 },
        'JTs': { raise: 0.82 }, 'J9s': { raise: 0.25 },
        'T9s': { raise: 0.58 }, 'T8s': { raise: 0.12 },
        '98s': { raise: 0.42 }, '87s': { raise: 0.32 },
        '76s': { raise: 0.25 }, '65s': { raise: 0.20 }, '54s': { raise: 0.10 },
        'KQo': { raise: 0.55 }, 'KJo': { raise: 0.22 },
    },
    HJ: {
        // ~22% RFI
        'AA': { raise: 1.0 }, 'KK': { raise: 1.0 }, 'QQ': { raise: 1.0 },
        'JJ': { raise: 1.0 }, 'TT': { raise: 1.0 },
        '99': { raise: 1.0 }, '88': { raise: 0.88 }, '77': { raise: 0.65 },
        '66': { raise: 0.38 }, '55': { raise: 0.15 },
        'AKs': { raise: 1.0 }, 'AQs': { raise: 1.0 }, 'AJs': { raise: 1.0 },
        'ATs': { raise: 1.0 }, 'A9s': { raise: 0.68 }, 'A8s': { raise: 0.32 },
        'A7s': { raise: 0.08 },
        'A5s': { raise: 0.82 }, 'A4s': { raise: 0.62 }, 'A3s': { raise: 0.38 },
        'A2s': { raise: 0.18 },
        'AKo': { raise: 1.0 }, 'AQo': { raise: 1.0 }, 'AJo': { raise: 0.82 },
        'ATo': { raise: 0.42 },
        'KQs': { raise: 1.0 }, 'KJs': { raise: 1.0 }, 'KTs': { raise: 0.92 },
        'K9s': { raise: 0.48 }, 'K8s': { raise: 0.10 },
        'QJs': { raise: 1.0 }, 'QTs': { raise: 0.88 }, 'Q9s': { raise: 0.35 },
        'JTs': { raise: 0.95 }, 'J9s': { raise: 0.48 }, 'J8s': { raise: 0.08 },
        'T9s': { raise: 0.78 }, 'T8s': { raise: 0.28 },
        '98s': { raise: 0.58 }, '87s': { raise: 0.45 },
        '76s': { raise: 0.38 }, '65s': { raise: 0.30 }, '54s': { raise: 0.18 },
        'KQo': { raise: 0.78 }, 'KJo': { raise: 0.42 }, 'KTo': { raise: 0.10 },
        'QJo': { raise: 0.25 },
    },
    CO: {
        // ~27% RFI
        'AA': { raise: 1.0 }, 'KK': { raise: 1.0 }, 'QQ': { raise: 1.0 },
        'JJ': { raise: 1.0 }, 'TT': { raise: 1.0 },
        '99': { raise: 1.0 }, '88': { raise: 1.0 }, '77': { raise: 0.82 },
        '66': { raise: 0.58 }, '55': { raise: 0.38 }, '44': { raise: 0.18 },
        'AKs': { raise: 1.0 }, 'AQs': { raise: 1.0 }, 'AJs': { raise: 1.0 },
        'ATs': { raise: 1.0 }, 'A9s': { raise: 0.85 }, 'A8s': { raise: 0.55 },
        'A7s': { raise: 0.28 }, 'A6s': { raise: 0.12 },
        'A5s': { raise: 1.0 }, 'A4s': { raise: 0.82 }, 'A3s': { raise: 0.58 },
        'A2s': { raise: 0.35 },
        'AKo': { raise: 1.0 }, 'AQo': { raise: 1.0 }, 'AJo': { raise: 1.0 },
        'ATo': { raise: 0.72 }, 'A9o': { raise: 0.25 },
        'KQs': { raise: 1.0 }, 'KJs': { raise: 1.0 }, 'KTs': { raise: 1.0 },
        'K9s': { raise: 0.68 }, 'K8s': { raise: 0.28 }, 'K7s': { raise: 0.08 },
        'QJs': { raise: 1.0 }, 'QTs': { raise: 1.0 }, 'Q9s': { raise: 0.55 },
        'Q8s': { raise: 0.15 },
        'JTs': { raise: 1.0 }, 'J9s': { raise: 0.65 }, 'J8s': { raise: 0.15 },
        'T9s': { raise: 1.0 }, 'T8s': { raise: 0.42 },
        '98s': { raise: 0.75 }, '97s': { raise: 0.10 },
        '87s': { raise: 0.62 }, '76s': { raise: 0.52 },
        '65s': { raise: 0.42 }, '54s': { raise: 0.28 },
        'KQo': { raise: 1.0 }, 'KJo': { raise: 0.72 }, 'KTo': { raise: 0.35 },
        'QJo': { raise: 0.52 }, 'QTo': { raise: 0.18 },
        'JTo': { raise: 0.28 },
    },
    BTN: {
        // ~48% RFI
        'AA': { raise: 1.0 }, 'KK': { raise: 1.0 }, 'QQ': { raise: 1.0 },
        'JJ': { raise: 1.0 }, 'TT': { raise: 1.0 },
        '99': { raise: 1.0 }, '88': { raise: 1.0 }, '77': { raise: 1.0 },
        '66': { raise: 1.0 }, '55': { raise: 0.85 }, '44': { raise: 0.72 },
        '33': { raise: 0.52 }, '22': { raise: 0.38 },
        'AKs': { raise: 1.0 }, 'AQs': { raise: 1.0 }, 'AJs': { raise: 1.0 },
        'ATs': { raise: 1.0 }, 'A9s': { raise: 1.0 }, 'A8s': { raise: 0.88 },
        'A7s': { raise: 0.75 }, 'A6s': { raise: 0.58 }, 'A5s': { raise: 1.0 },
        'A4s': { raise: 1.0 }, 'A3s': { raise: 0.82 }, 'A2s': { raise: 0.65 },
        'AKo': { raise: 1.0 }, 'AQo': { raise: 1.0 }, 'AJo': { raise: 1.0 },
        'ATo': { raise: 1.0 }, 'A9o': { raise: 0.62 }, 'A8o': { raise: 0.32 },
        'A7o': { raise: 0.12 },
        'KQs': { raise: 1.0 }, 'KJs': { raise: 1.0 }, 'KTs': { raise: 1.0 },
        'K9s': { raise: 0.92 }, 'K8s': { raise: 0.55 }, 'K7s': { raise: 0.35 },
        'K6s': { raise: 0.22 }, 'K5s': { raise: 0.10 },
        'QJs': { raise: 1.0 }, 'QTs': { raise: 1.0 }, 'Q9s': { raise: 0.82 },
        'Q8s': { raise: 0.42 }, 'Q7s': { raise: 0.12 },
        'JTs': { raise: 1.0 }, 'J9s': { raise: 0.85 }, 'J8s': { raise: 0.38 },
        'J7s': { raise: 0.08 },
        'T9s': { raise: 1.0 }, 'T8s': { raise: 0.72 }, 'T7s': { raise: 0.18 },
        '98s': { raise: 1.0 }, '97s': { raise: 0.38 }, '96s': { raise: 0.05 },
        '87s': { raise: 0.92 }, '86s': { raise: 0.28 },
        '76s': { raise: 0.82 }, '75s': { raise: 0.18 },
        '65s': { raise: 0.72 }, '64s': { raise: 0.08 },
        '54s': { raise: 0.55 }, '53s': { raise: 0.05 },
        '43s': { raise: 0.22 },
        'KQo': { raise: 1.0 }, 'KJo': { raise: 1.0 }, 'KTo': { raise: 0.82 },
        'K9o': { raise: 0.38 }, 'K8o': { raise: 0.10 },
        'QJo': { raise: 1.0 }, 'QTo': { raise: 0.72 }, 'Q9o': { raise: 0.28 },
        'JTo': { raise: 0.82 }, 'J9o': { raise: 0.25 }, 'J8o': { raise: 0.05 },
        'T9o': { raise: 0.52 }, 'T8o': { raise: 0.10 },
        '98o': { raise: 0.28 }, '87o': { raise: 0.15 },
        '76o': { raise: 0.08 },
    },
    SB: {
        // SB open (raise or fold — no limp in GTO)
        // ~42% open-raise range
        'AA': { raise: 1.0 }, 'KK': { raise: 1.0 }, 'QQ': { raise: 1.0 },
        'JJ': { raise: 1.0 }, 'TT': { raise: 1.0 },
        '99': { raise: 1.0 }, '88': { raise: 1.0 }, '77': { raise: 1.0 },
        '66': { raise: 0.88 }, '55': { raise: 0.75 }, '44': { raise: 0.58 },
        '33': { raise: 0.42 }, '22': { raise: 0.30 },
        'AKs': { raise: 1.0 }, 'AQs': { raise: 1.0 }, 'AJs': { raise: 1.0 },
        'ATs': { raise: 1.0 }, 'A9s': { raise: 1.0 }, 'A8s': { raise: 0.78 },
        'A7s': { raise: 0.62 }, 'A6s': { raise: 0.45 }, 'A5s': { raise: 1.0 },
        'A4s': { raise: 0.88 }, 'A3s': { raise: 0.72 }, 'A2s': { raise: 0.55 },
        'AKo': { raise: 1.0 }, 'AQo': { raise: 1.0 }, 'AJo': { raise: 1.0 },
        'ATo': { raise: 0.85 }, 'A9o': { raise: 0.48 }, 'A8o': { raise: 0.22 },
        'KQs': { raise: 1.0 }, 'KJs': { raise: 1.0 }, 'KTs': { raise: 1.0 },
        'K9s': { raise: 0.82 }, 'K8s': { raise: 0.42 }, 'K7s': { raise: 0.22 },
        'K6s': { raise: 0.10 },
        'QJs': { raise: 1.0 }, 'QTs': { raise: 1.0 }, 'Q9s': { raise: 0.65 },
        'Q8s': { raise: 0.28 }, 'Q7s': { raise: 0.08 },
        'JTs': { raise: 1.0 }, 'J9s': { raise: 0.75 }, 'J8s': { raise: 0.28 },
        'T9s': { raise: 1.0 }, 'T8s': { raise: 0.55 }, 'T7s': { raise: 0.12 },
        '98s': { raise: 0.82 }, '97s': { raise: 0.28 },
        '87s': { raise: 0.72 }, '86s': { raise: 0.18 },
        '76s': { raise: 0.62 }, '75s': { raise: 0.08 },
        '65s': { raise: 0.52 }, '54s': { raise: 0.38 },
        '43s': { raise: 0.12 },
        'KQo': { raise: 1.0 }, 'KJo': { raise: 0.78 }, 'KTo': { raise: 0.48 },
        'K9o': { raise: 0.18 },
        'QJo': { raise: 0.62 }, 'QTo': { raise: 0.32 },
        'JTo': { raise: 0.48 }, 'J9o': { raise: 0.12 },
        'T9o': { raise: 0.32 }, '98o': { raise: 0.18 },
        '87o': { raise: 0.10 },
    },
};

// ═══════════════════════════════════════════════════════════════════════════
// 3-BET RANGES — Position vs Opener (6-max, 100BB)
// ═══════════════════════════════════════════════════════════════════════════
// Format: { hand: { raise: 3bet_freq, call: cold_call_freq, fold: fold_freq } }

export const THREE_BET = {
    // IP 3-bet from BTN vs each opener
    BTN_vs_UTG: {
        'AA': { raise: 1.0 }, 'KK': { raise: 1.0 }, 'QQ': { raise: 0.85, call: 0.15 },
        'JJ': { raise: 0.55, call: 0.45 }, 'TT': { raise: 0.18, call: 0.72 },
        '99': { call: 0.65 }, '88': { call: 0.48 }, '77': { call: 0.32 },
        '66': { call: 0.15 },
        'AKs': { raise: 1.0 }, 'AQs': { raise: 0.72, call: 0.28 },
        'AJs': { raise: 0.35, call: 0.55 }, 'ATs': { raise: 0.12, call: 0.58 },
        'A9s': { call: 0.35 }, 'A8s': { call: 0.15 },
        'A5s': { raise: 0.45 }, 'A4s': { raise: 0.32 },
        'AKo': { raise: 1.0 }, 'AQo': { raise: 0.48, call: 0.32 },
        'AJo': { raise: 0.10, call: 0.25 },
        'KQs': { raise: 0.42, call: 0.48 }, 'KJs': { raise: 0.15, call: 0.52 },
        'KTs': { call: 0.45 }, 'K9s': { call: 0.18 },
        'QJs': { raise: 0.08, call: 0.52 }, 'QTs': { call: 0.42 },
        'JTs': { raise: 0.05, call: 0.48 }, 'J9s': { call: 0.22 },
        'T9s': { call: 0.38 }, 'T8s': { call: 0.10 },
        '98s': { call: 0.28 }, '87s': { call: 0.22 },
        '76s': { call: 0.18 }, '65s': { call: 0.12 },
        'KQo': { raise: 0.15, call: 0.28 },
    },
    BTN_vs_MP: {
        'AA': { raise: 1.0 }, 'KK': { raise: 1.0 }, 'QQ': { raise: 0.92, call: 0.08 },
        'JJ': { raise: 0.65, call: 0.35 }, 'TT': { raise: 0.28, call: 0.62 },
        '99': { raise: 0.08, call: 0.62 }, '88': { call: 0.52 }, '77': { call: 0.38 },
        '66': { call: 0.22 }, '55': { call: 0.10 },
        'AKs': { raise: 1.0 }, 'AQs': { raise: 0.82, call: 0.18 },
        'AJs': { raise: 0.45, call: 0.48 }, 'ATs': { raise: 0.18, call: 0.55 },
        'A9s': { call: 0.42 }, 'A8s': { call: 0.22 },
        'A5s': { raise: 0.52 }, 'A4s': { raise: 0.38 }, 'A3s': { raise: 0.15 },
        'AKo': { raise: 1.0 }, 'AQo': { raise: 0.55, call: 0.28 },
        'AJo': { raise: 0.15, call: 0.32 }, 'ATo': { call: 0.18 },
        'KQs': { raise: 0.52, call: 0.42 }, 'KJs': { raise: 0.22, call: 0.52 },
        'KTs': { raise: 0.05, call: 0.52 }, 'K9s': { call: 0.28 },
        'QJs': { raise: 0.12, call: 0.55 }, 'QTs': { call: 0.48 }, 'Q9s': { call: 0.15 },
        'JTs': { raise: 0.08, call: 0.55 }, 'J9s': { call: 0.32 },
        'T9s': { call: 0.45 }, 'T8s': { call: 0.15 },
        '98s': { call: 0.35 }, '87s': { call: 0.28 },
        '76s': { call: 0.22 }, '65s': { call: 0.15 },
        'KQo': { raise: 0.22, call: 0.32 }, 'KJo': { call: 0.22 },
        'QJo': { call: 0.15 },
    },
    BTN_vs_HJ: {
        'AA': { raise: 1.0 }, 'KK': { raise: 1.0 }, 'QQ': { raise: 0.95 },
        'JJ': { raise: 0.72, call: 0.28 }, 'TT': { raise: 0.35, call: 0.58 },
        '99': { raise: 0.12, call: 0.58 }, '88': { call: 0.55 }, '77': { call: 0.42 },
        '66': { call: 0.28 }, '55': { call: 0.15 },
        'AKs': { raise: 1.0 }, 'AQs': { raise: 0.88, call: 0.12 },
        'AJs': { raise: 0.52, call: 0.42 }, 'ATs': { raise: 0.22, call: 0.55 },
        'A9s': { raise: 0.05, call: 0.45 }, 'A8s': { call: 0.28 },
        'A5s': { raise: 0.55 }, 'A4s': { raise: 0.42 }, 'A3s': { raise: 0.20 },
        'AKo': { raise: 1.0 }, 'AQo': { raise: 0.62, call: 0.25 },
        'AJo': { raise: 0.18, call: 0.35 }, 'ATo': { call: 0.25 },
        'KQs': { raise: 0.58, call: 0.38 }, 'KJs': { raise: 0.28, call: 0.52 },
        'KTs': { raise: 0.08, call: 0.55 }, 'K9s': { call: 0.32 },
        'QJs': { raise: 0.15, call: 0.58 }, 'QTs': { raise: 0.05, call: 0.52 },
        'Q9s': { call: 0.22 },
        'JTs': { raise: 0.10, call: 0.58 }, 'J9s': { call: 0.38 },
        'T9s': { call: 0.48 }, 'T8s': { call: 0.18 },
        '98s': { call: 0.38 }, '87s': { call: 0.30 },
        '76s': { call: 0.25 }, '65s': { call: 0.18 },
        'KQo': { raise: 0.28, call: 0.35 }, 'KJo': { call: 0.28 },
        'QJo': { call: 0.20 }, 'JTo': { call: 0.10 },
    },
    BTN_vs_CO: {
        'AA': { raise: 1.0 }, 'KK': { raise: 1.0 }, 'QQ': { raise: 1.0 },
        'JJ': { raise: 0.82, call: 0.18 }, 'TT': { raise: 0.45, call: 0.50 },
        '99': { raise: 0.18, call: 0.55 }, '88': { raise: 0.05, call: 0.52 },
        '77': { call: 0.45 }, '66': { call: 0.32 }, '55': { call: 0.18 },
        'AKs': { raise: 1.0 }, 'AQs': { raise: 0.92, call: 0.08 },
        'AJs': { raise: 0.62, call: 0.35 }, 'ATs': { raise: 0.32, call: 0.52 },
        'A9s': { raise: 0.10, call: 0.48 }, 'A8s': { call: 0.35 },
        'A5s': { raise: 0.62 }, 'A4s': { raise: 0.48 }, 'A3s': { raise: 0.25 },
        'A2s': { raise: 0.08 },
        'AKo': { raise: 1.0 }, 'AQo': { raise: 0.72, call: 0.22 },
        'AJo': { raise: 0.28, call: 0.35 }, 'ATo': { raise: 0.05, call: 0.32 },
        'KQs': { raise: 0.65, call: 0.32 }, 'KJs': { raise: 0.35, call: 0.52 },
        'KTs': { raise: 0.12, call: 0.55 }, 'K9s': { call: 0.38 },
        'QJs': { raise: 0.22, call: 0.58 }, 'QTs': { raise: 0.08, call: 0.55 },
        'Q9s': { call: 0.28 },
        'JTs': { raise: 0.15, call: 0.58 }, 'J9s': { call: 0.42 },
        'T9s': { call: 0.52 }, 'T8s': { call: 0.22 },
        '98s': { call: 0.42 }, '87s': { call: 0.35 },
        '76s': { call: 0.28 }, '65s': { call: 0.22 },
        'KQo': { raise: 0.35, call: 0.35 }, 'KJo': { raise: 0.08, call: 0.32 },
        'QJo': { call: 0.25 }, 'JTo': { call: 0.15 },
    },

    // OOP 3-bet from SB vs each opener
    SB_vs_UTG: {
        'AA': { raise: 1.0 }, 'KK': { raise: 1.0 }, 'QQ': { raise: 0.78 },
        'JJ': { raise: 0.42 }, 'TT': { raise: 0.12 },
        'AKs': { raise: 1.0 }, 'AQs': { raise: 0.65 }, 'AJs': { raise: 0.22 },
        'A5s': { raise: 0.35 }, 'A4s': { raise: 0.18 },
        'AKo': { raise: 0.92 }, 'AQo': { raise: 0.28 },
        'KQs': { raise: 0.28 },
    },
    SB_vs_CO: {
        'AA': { raise: 1.0 }, 'KK': { raise: 1.0 }, 'QQ': { raise: 1.0 },
        'JJ': { raise: 0.82 }, 'TT': { raise: 0.48 }, '99': { raise: 0.18 },
        'AKs': { raise: 1.0 }, 'AQs': { raise: 0.92 }, 'AJs': { raise: 0.62 },
        'ATs': { raise: 0.28 }, 'A5s': { raise: 0.55 }, 'A4s': { raise: 0.38 },
        'A3s': { raise: 0.12 },
        'AKo': { raise: 1.0 }, 'AQo': { raise: 0.72 }, 'AJo': { raise: 0.28 },
        'KQs': { raise: 0.65 }, 'KJs': { raise: 0.32 }, 'KTs': { raise: 0.10 },
        'QJs': { raise: 0.18 }, 'JTs': { raise: 0.12 },
        'KQo': { raise: 0.22 },
    },
    SB_vs_BTN: {
        'AA': { raise: 1.0 }, 'KK': { raise: 1.0 }, 'QQ': { raise: 1.0 },
        'JJ': { raise: 0.92 }, 'TT': { raise: 0.68 }, '99': { raise: 0.38 },
        '88': { raise: 0.12 },
        'AKs': { raise: 1.0 }, 'AQs': { raise: 1.0 }, 'AJs': { raise: 0.82 },
        'ATs': { raise: 0.52 }, 'A9s': { raise: 0.18 },
        'A5s': { raise: 0.72 }, 'A4s': { raise: 0.55 }, 'A3s': { raise: 0.32 },
        'A2s': { raise: 0.15 },
        'AKo': { raise: 1.0 }, 'AQo': { raise: 0.88 }, 'AJo': { raise: 0.55 },
        'ATo': { raise: 0.18 },
        'KQs': { raise: 0.82 }, 'KJs': { raise: 0.55 }, 'KTs': { raise: 0.28 },
        'K9s': { raise: 0.08 },
        'QJs': { raise: 0.42 }, 'QTs': { raise: 0.18 },
        'JTs': { raise: 0.28 }, 'J9s': { raise: 0.05 },
        'T9s': { raise: 0.12 },
        'KQo': { raise: 0.52 }, 'KJo': { raise: 0.18 },
        'QJo': { raise: 0.08 },
    },

    // BB 3-bet vs each opener (separate from BB_DEFENSE which includes calls)
    BB_vs_UTG: {
        'AA': { raise: 1.0 }, 'KK': { raise: 1.0 }, 'QQ': { raise: 0.72 },
        'JJ': { raise: 0.35 }, 'TT': { raise: 0.08 },
        'AKs': { raise: 1.0 }, 'AQs': { raise: 0.58 }, 'AJs': { raise: 0.18 },
        'A5s': { raise: 0.32 }, 'A4s': { raise: 0.15 },
        'AKo': { raise: 0.88 }, 'AQo': { raise: 0.22 },
        'KQs': { raise: 0.22 },
    },
    BB_vs_BTN: {
        'AA': { raise: 1.0 }, 'KK': { raise: 1.0 }, 'QQ': { raise: 1.0 },
        'JJ': { raise: 0.88 }, 'TT': { raise: 0.58 }, '99': { raise: 0.28 },
        '88': { raise: 0.08 },
        'AKs': { raise: 1.0 }, 'AQs': { raise: 1.0 }, 'AJs': { raise: 0.78 },
        'ATs': { raise: 0.45 }, 'A9s': { raise: 0.15 },
        'A5s': { raise: 0.68 }, 'A4s': { raise: 0.52 }, 'A3s': { raise: 0.28 },
        'A2s': { raise: 0.12 },
        'AKo': { raise: 1.0 }, 'AQo': { raise: 0.85 }, 'AJo': { raise: 0.48 },
        'ATo': { raise: 0.15 },
        'KQs': { raise: 0.78 }, 'KJs': { raise: 0.48 }, 'KTs': { raise: 0.22 },
        'K9s': { raise: 0.05 },
        'QJs': { raise: 0.35 }, 'QTs': { raise: 0.15 },
        'JTs': { raise: 0.22 }, 'J9s': { raise: 0.05 },
        'T9s': { raise: 0.10 },
        'KQo': { raise: 0.45 }, 'KJo': { raise: 0.15 },
        'QJo': { raise: 0.05 },
    },
    BB_vs_SB: {
        'AA': { raise: 1.0 }, 'KK': { raise: 1.0 }, 'QQ': { raise: 1.0 },
        'JJ': { raise: 0.95 }, 'TT': { raise: 0.78 }, '99': { raise: 0.55 },
        '88': { raise: 0.32 }, '77': { raise: 0.15 },
        'AKs': { raise: 1.0 }, 'AQs': { raise: 1.0 }, 'AJs': { raise: 0.92 },
        'ATs': { raise: 0.72 }, 'A9s': { raise: 0.42 }, 'A8s': { raise: 0.18 },
        'A5s': { raise: 0.82 }, 'A4s': { raise: 0.68 }, 'A3s': { raise: 0.48 },
        'A2s': { raise: 0.28 },
        'AKo': { raise: 1.0 }, 'AQo': { raise: 0.95 }, 'AJo': { raise: 0.72 },
        'ATo': { raise: 0.42 }, 'A9o': { raise: 0.15 },
        'KQs': { raise: 0.92 }, 'KJs': { raise: 0.72 }, 'KTs': { raise: 0.48 },
        'K9s': { raise: 0.22 }, 'K8s': { raise: 0.05 },
        'QJs': { raise: 0.62 }, 'QTs': { raise: 0.38 }, 'Q9s': { raise: 0.12 },
        'JTs': { raise: 0.48 }, 'J9s': { raise: 0.18 },
        'T9s': { raise: 0.32 }, 'T8s': { raise: 0.05 },
        '98s': { raise: 0.18 }, '87s': { raise: 0.10 },
        '76s': { raise: 0.05 },
        'KQo': { raise: 0.68 }, 'KJo': { raise: 0.38 }, 'KTo': { raise: 0.12 },
        'QJo': { raise: 0.28 }, 'QTo': { raise: 0.08 },
        'JTo': { raise: 0.15 },
    },
};

// ═══════════════════════════════════════════════════════════════════════════
// BB DEFENSE — Full call + 3bet ranges vs each opener (6-max, 100BB)
// ═══════════════════════════════════════════════════════════════════════════
// This combines calling and 3-betting. Hands with only 'call' defend by flatting.
// Hands with only 'raise' defend by 3-betting (see THREE_BET.BB_vs_X above).

export const BB_DEFENSE = {
    vs_UTG: {
        // ~32% total defense (call ~25%, 3bet ~7%)
        'AA': { raise: 1.0 }, 'KK': { raise: 1.0 }, 'QQ': { raise: 0.72, call: 0.28 },
        'JJ': { raise: 0.35, call: 0.65 }, 'TT': { call: 0.92 },
        '99': { call: 0.82 }, '88': { call: 0.65 }, '77': { call: 0.48 },
        '66': { call: 0.32 }, '55': { call: 0.18 },
        'AKs': { raise: 1.0 }, 'AQs': { raise: 0.58, call: 0.42 },
        'AJs': { raise: 0.18, call: 0.72 }, 'ATs': { call: 0.82 },
        'A9s': { call: 0.55 }, 'A8s': { call: 0.32 }, 'A7s': { call: 0.10 },
        'A5s': { raise: 0.32, call: 0.48 }, 'A4s': { raise: 0.15, call: 0.45 },
        'A3s': { call: 0.28 }, 'A2s': { call: 0.12 },
        'AKo': { raise: 0.88, call: 0.12 }, 'AQo': { raise: 0.22, call: 0.58 },
        'AJo': { call: 0.52 }, 'ATo': { call: 0.28 },
        'KQs': { raise: 0.22, call: 0.68 }, 'KJs': { call: 0.72 },
        'KTs': { call: 0.55 }, 'K9s': { call: 0.28 },
        'QJs': { call: 0.68 }, 'QTs': { call: 0.48 }, 'Q9s': { call: 0.15 },
        'JTs': { call: 0.62 }, 'J9s': { call: 0.28 },
        'T9s': { call: 0.48 }, 'T8s': { call: 0.10 },
        '98s': { call: 0.38 }, '87s': { call: 0.28 },
        '76s': { call: 0.22 }, '65s': { call: 0.12 },
    },
    vs_CO: {
        // ~42% total defense
        'AA': { raise: 1.0 }, 'KK': { raise: 1.0 }, 'QQ': { raise: 0.88, call: 0.12 },
        'JJ': { raise: 0.55, call: 0.45 }, 'TT': { raise: 0.22, call: 0.72 },
        '99': { raise: 0.05, call: 0.82 }, '88': { call: 0.78 }, '77': { call: 0.62 },
        '66': { call: 0.48 }, '55': { call: 0.35 }, '44': { call: 0.18 },
        'AKs': { raise: 1.0 }, 'AQs': { raise: 0.78, call: 0.22 },
        'AJs': { raise: 0.42, call: 0.55 }, 'ATs': { raise: 0.15, call: 0.72 },
        'A9s': { call: 0.68 }, 'A8s': { call: 0.48 }, 'A7s': { call: 0.25 },
        'A6s': { call: 0.10 },
        'A5s': { raise: 0.52, call: 0.38 }, 'A4s': { raise: 0.35, call: 0.42 },
        'A3s': { raise: 0.12, call: 0.42 }, 'A2s': { call: 0.28 },
        'AKo': { raise: 1.0 }, 'AQo': { raise: 0.55, call: 0.38 },
        'AJo': { raise: 0.18, call: 0.58 }, 'ATo': { call: 0.55 },
        'A9o': { call: 0.22 },
        'KQs': { raise: 0.52, call: 0.45 }, 'KJs': { raise: 0.18, call: 0.68 },
        'KTs': { call: 0.72 }, 'K9s': { call: 0.48 }, 'K8s': { call: 0.18 },
        'QJs': { raise: 0.12, call: 0.72 }, 'QTs': { call: 0.68 },
        'Q9s': { call: 0.38 }, 'Q8s': { call: 0.12 },
        'JTs': { raise: 0.05, call: 0.72 }, 'J9s': { call: 0.52 },
        'J8s': { call: 0.15 },
        'T9s': { call: 0.65 }, 'T8s': { call: 0.32 },
        '98s': { call: 0.55 }, '97s': { call: 0.12 },
        '87s': { call: 0.48 }, '86s': { call: 0.08 },
        '76s': { call: 0.38 }, '65s': { call: 0.28 },
        '54s': { call: 0.18 },
        'KQo': { raise: 0.22, call: 0.48 }, 'KJo': { call: 0.42 },
        'KTo': { call: 0.18 },
        'QJo': { call: 0.32 }, 'QTo': { call: 0.10 },
        'JTo': { call: 0.22 },
    },
    vs_BTN: {
        // ~55% total defense (wide — BTN opens very wide)
        'AA': { raise: 1.0 }, 'KK': { raise: 1.0 }, 'QQ': { raise: 1.0 },
        'JJ': { raise: 0.88, call: 0.12 }, 'TT': { raise: 0.58, call: 0.42 },
        '99': { raise: 0.28, call: 0.65 }, '88': { raise: 0.08, call: 0.72 },
        '77': { call: 0.72 }, '66': { call: 0.62 }, '55': { call: 0.52 },
        '44': { call: 0.38 }, '33': { call: 0.22 }, '22': { call: 0.10 },
        'AKs': { raise: 1.0 }, 'AQs': { raise: 1.0 },
        'AJs': { raise: 0.78, call: 0.22 }, 'ATs': { raise: 0.45, call: 0.50 },
        'A9s': { raise: 0.15, call: 0.68 }, 'A8s': { call: 0.65 },
        'A7s': { call: 0.52 }, 'A6s': { call: 0.35 },
        'A5s': { raise: 0.68, call: 0.28 }, 'A4s': { raise: 0.52, call: 0.38 },
        'A3s': { raise: 0.28, call: 0.48 }, 'A2s': { raise: 0.12, call: 0.42 },
        'AKo': { raise: 1.0 }, 'AQo': { raise: 0.85, call: 0.15 },
        'AJo': { raise: 0.48, call: 0.42 }, 'ATo': { raise: 0.15, call: 0.58 },
        'A9o': { call: 0.45 }, 'A8o': { call: 0.22 },
        'KQs': { raise: 0.78, call: 0.22 }, 'KJs': { raise: 0.48, call: 0.48 },
        'KTs': { raise: 0.22, call: 0.62 }, 'K9s': { call: 0.62 },
        'K8s': { call: 0.35 }, 'K7s': { call: 0.15 },
        'QJs': { raise: 0.35, call: 0.58 }, 'QTs': { raise: 0.15, call: 0.65 },
        'Q9s': { call: 0.55 }, 'Q8s': { call: 0.28 },
        'JTs': { raise: 0.22, call: 0.62 }, 'J9s': { call: 0.58 },
        'J8s': { call: 0.28 },
        'T9s': { raise: 0.10, call: 0.68 }, 'T8s': { call: 0.52 },
        'T7s': { call: 0.12 },
        '98s': { call: 0.62 }, '97s': { call: 0.25 },
        '87s': { call: 0.55 }, '86s': { call: 0.18 },
        '76s': { call: 0.48 }, '75s': { call: 0.08 },
        '65s': { call: 0.42 }, '54s': { call: 0.32 },
        '43s': { call: 0.12 },
        'KQo': { raise: 0.45, call: 0.42 }, 'KJo': { raise: 0.15, call: 0.52 },
        'KTo': { call: 0.42 }, 'K9o': { call: 0.15 },
        'QJo': { call: 0.48 }, 'QTo': { call: 0.28 },
        'Q9o': { call: 0.08 },
        'JTo': { call: 0.38 }, 'J9o': { call: 0.12 },
        'T9o': { call: 0.28 }, '98o': { call: 0.15 },
        '87o': { call: 0.08 },
    },
    vs_SB: {
        // ~62% total defense (very wide — getting great price)
        'AA': { raise: 1.0 }, 'KK': { raise: 1.0 }, 'QQ': { raise: 1.0 },
        'JJ': { raise: 0.95, call: 0.05 }, 'TT': { raise: 0.78, call: 0.22 },
        '99': { raise: 0.55, call: 0.42 }, '88': { raise: 0.32, call: 0.58 },
        '77': { raise: 0.12, call: 0.68 }, '66': { call: 0.72 }, '55': { call: 0.62 },
        '44': { call: 0.52 }, '33': { call: 0.38 }, '22': { call: 0.25 },
        'AKs': { raise: 1.0 }, 'AQs': { raise: 1.0 },
        'AJs': { raise: 0.92, call: 0.08 }, 'ATs': { raise: 0.72, call: 0.25 },
        'A9s': { raise: 0.42, call: 0.48 }, 'A8s': { raise: 0.18, call: 0.58 },
        'A7s': { call: 0.62 }, 'A6s': { call: 0.48 },
        'A5s': { raise: 0.82, call: 0.15 }, 'A4s': { raise: 0.68, call: 0.28 },
        'A3s': { raise: 0.48, call: 0.42 }, 'A2s': { raise: 0.28, call: 0.48 },
        'AKo': { raise: 1.0 }, 'AQo': { raise: 0.95 },
        'AJo': { raise: 0.72, call: 0.25 }, 'ATo': { raise: 0.42, call: 0.45 },
        'A9o': { raise: 0.12, call: 0.52 }, 'A8o': { call: 0.42 },
        'A7o': { call: 0.22 },
        'KQs': { raise: 0.92, call: 0.08 }, 'KJs': { raise: 0.72, call: 0.25 },
        'KTs': { raise: 0.48, call: 0.45 }, 'K9s': { raise: 0.22, call: 0.55 },
        'K8s': { call: 0.45 }, 'K7s': { call: 0.28 },
        'K6s': { call: 0.12 },
        'QJs': { raise: 0.62, call: 0.35 }, 'QTs': { raise: 0.38, call: 0.52 },
        'Q9s': { raise: 0.12, call: 0.55 }, 'Q8s': { call: 0.38 },
        'Q7s': { call: 0.12 },
        'JTs': { raise: 0.48, call: 0.45 }, 'J9s': { raise: 0.18, call: 0.58 },
        'J8s': { call: 0.38 }, 'J7s': { call: 0.08 },
        'T9s': { raise: 0.32, call: 0.55 }, 'T8s': { call: 0.55 },
        'T7s': { call: 0.18 },
        '98s': { raise: 0.18, call: 0.62 }, '97s': { call: 0.35 },
        '87s': { raise: 0.10, call: 0.62 }, '86s': { call: 0.28 },
        '76s': { raise: 0.05, call: 0.55 }, '75s': { call: 0.18 },
        '65s': { call: 0.48 }, '64s': { call: 0.08 },
        '54s': { call: 0.38 }, '53s': { call: 0.05 },
        '43s': { call: 0.22 },
        'KQo': { raise: 0.68, call: 0.28 }, 'KJo': { raise: 0.38, call: 0.48 },
        'KTo': { raise: 0.12, call: 0.55 }, 'K9o': { call: 0.38 },
        'K8o': { call: 0.12 },
        'QJo': { raise: 0.28, call: 0.48 }, 'QTo': { call: 0.42 },
        'Q9o': { call: 0.18 },
        'JTo': { raise: 0.15, call: 0.48 }, 'J9o': { call: 0.28 },
        'T9o': { call: 0.38 }, 'T8o': { call: 0.08 },
        '98o': { call: 0.25 }, '87o': { call: 0.15 },
        '76o': { call: 0.08 },
    },
};

// ═══════════════════════════════════════════════════════════════════════════
// 4-BET RANGES — Facing a 3-bet after opening (6-max, 100BB)
// ═══════════════════════════════════════════════════════════════════════════
// Format: { hand: { raise: 4bet_freq, call: call_freq, fold: fold_freq } }

export const FOUR_BET = {
    UTG_vs_3bet: {
        'AA': { raise: 1.0 }, 'KK': { raise: 1.0 }, 'QQ': { raise: 0.72, call: 0.28 },
        'JJ': { raise: 0.18, call: 0.72 }, 'TT': { call: 0.55 },
        '99': { call: 0.22 },
        'AKs': { raise: 1.0 }, 'AQs': { raise: 0.42, call: 0.48 },
        'AJs': { call: 0.42 }, 'ATs': { call: 0.18 },
        'A5s': { raise: 0.28 }, 'A4s': { raise: 0.15 },
        'AKo': { raise: 0.92, call: 0.08 }, 'AQo': { raise: 0.18, call: 0.32 },
        'KQs': { call: 0.35 },
    },
    CO_vs_3bet: {
        'AA': { raise: 1.0 }, 'KK': { raise: 1.0 }, 'QQ': { raise: 0.82, call: 0.18 },
        'JJ': { raise: 0.32, call: 0.58 }, 'TT': { raise: 0.08, call: 0.62 },
        '99': { call: 0.38 }, '88': { call: 0.12 },
        'AKs': { raise: 1.0 }, 'AQs': { raise: 0.58, call: 0.38 },
        'AJs': { raise: 0.15, call: 0.55 }, 'ATs': { call: 0.45 },
        'A5s': { raise: 0.42 }, 'A4s': { raise: 0.28 },
        'AKo': { raise: 1.0 }, 'AQo': { raise: 0.35, call: 0.38 },
        'AJo': { call: 0.28 },
        'KQs': { raise: 0.12, call: 0.48 }, 'KJs': { call: 0.32 },
        'QJs': { call: 0.18 }, 'JTs': { call: 0.15 },
    },
    BTN_vs_3bet: {
        'AA': { raise: 1.0 }, 'KK': { raise: 1.0 }, 'QQ': { raise: 0.88, call: 0.12 },
        'JJ': { raise: 0.45, call: 0.52 }, 'TT': { raise: 0.15, call: 0.62 },
        '99': { raise: 0.05, call: 0.52 }, '88': { call: 0.35 },
        '77': { call: 0.12 },
        'AKs': { raise: 1.0 }, 'AQs': { raise: 0.68, call: 0.32 },
        'AJs': { raise: 0.28, call: 0.55 }, 'ATs': { raise: 0.08, call: 0.52 },
        'A9s': { call: 0.28 },
        'A5s': { raise: 0.52 }, 'A4s': { raise: 0.38 }, 'A3s': { raise: 0.15 },
        'AKo': { raise: 1.0 }, 'AQo': { raise: 0.48, call: 0.35 },
        'AJo': { raise: 0.10, call: 0.38 }, 'ATo': { call: 0.22 },
        'KQs': { raise: 0.25, call: 0.48 }, 'KJs': { raise: 0.05, call: 0.42 },
        'KTs': { call: 0.28 },
        'QJs': { call: 0.28 }, 'JTs': { call: 0.25 },
        'T9s': { call: 0.12 },
        'KQo': { raise: 0.08, call: 0.28 },
    },
};

// ═══════════════════════════════════════════════════════════════════════════
// SQUEEZE RANGES — 3-bet when facing open + cold call (6-max, 100BB)
// ═══════════════════════════════════════════════════════════════════════════

export const SQUEEZE = {
    BTN_vs_UTG_open_MP_call: {
        'AA': { raise: 1.0 }, 'KK': { raise: 1.0 }, 'QQ': { raise: 0.72 },
        'JJ': { raise: 0.28 },
        'AKs': { raise: 1.0 }, 'AQs': { raise: 0.48 },
        'A5s': { raise: 0.25 }, 'A4s': { raise: 0.12 },
        'AKo': { raise: 0.82 }, 'AQo': { raise: 0.15 },
    },
    SB_vs_CO_open_BTN_call: {
        'AA': { raise: 1.0 }, 'KK': { raise: 1.0 }, 'QQ': { raise: 0.82 },
        'JJ': { raise: 0.42 }, 'TT': { raise: 0.10 },
        'AKs': { raise: 1.0 }, 'AQs': { raise: 0.65 }, 'AJs': { raise: 0.18 },
        'A5s': { raise: 0.38 }, 'A4s': { raise: 0.22 },
        'AKo': { raise: 0.92 }, 'AQo': { raise: 0.28 },
        'KQs': { raise: 0.22 },
    },
    BB_vs_CO_open_BTN_call: {
        'AA': { raise: 1.0 }, 'KK': { raise: 1.0 }, 'QQ': { raise: 0.78 },
        'JJ': { raise: 0.38 }, 'TT': { raise: 0.08 },
        'AKs': { raise: 1.0 }, 'AQs': { raise: 0.58 }, 'AJs': { raise: 0.15 },
        'A5s': { raise: 0.35 }, 'A4s': { raise: 0.18 },
        'AKo': { raise: 0.88 }, 'AQo': { raise: 0.22 },
        'KQs': { raise: 0.18 },
    },
};

// ═══════════════════════════════════════════════════════════════════════════
// COLD-CALL — Calling an open without 3-betting (IP flat ranges)
// Format: { hand: { call: freq } }  — raise freq used for occasional 3-bet mixes
// ═══════════════════════════════════════════════════════════════════════════

export const COLD_CALL = {
    // CO cold-call vs UTG open
    CO_vs_UTG: {
        'JJ': { call: 0.38 }, 'TT': { call: 0.72 },
        '99': { call: 0.85 }, '88': { call: 0.68 }, '77': { call: 0.52 },
        '66': { call: 0.30 }, '55': { call: 0.15 },
        'AQs': { call: 0.35 }, 'AJs': { call: 0.62 }, 'ATs': { call: 0.78 },
        'A9s': { call: 0.42 }, 'A8s': { call: 0.15 },
        'A5s': { call: 0.25 }, 'A4s': { call: 0.12 },
        'KQs': { call: 0.55 }, 'KJs': { call: 0.48 }, 'KTs': { call: 0.35 },
        'QJs': { call: 0.65 }, 'QTs': { call: 0.48 },
        'JTs': { call: 0.72 }, 'J9s': { call: 0.28 },
        'T9s': { call: 0.65 }, 'T8s': { call: 0.18 },
        '98s': { call: 0.55 }, '87s': { call: 0.45 },
        '76s': { call: 0.38 }, '65s': { call: 0.30 }, '54s': { call: 0.22 },
    },
    // BTN cold-call vs UTG open
    BTN_vs_UTG: {
        'JJ': { call: 0.42 }, 'TT': { call: 0.78 },
        '99': { call: 0.90 }, '88': { call: 0.75 }, '77': { call: 0.60 },
        '66': { call: 0.42 }, '55': { call: 0.25 }, '44': { call: 0.12 },
        'AQs': { call: 0.40 }, 'AJs': { call: 0.68 }, 'ATs': { call: 0.82 },
        'A9s': { call: 0.52 }, 'A8s': { call: 0.25 }, 'A5s': { call: 0.30 },
        'AQo': { call: 0.15 },
        'KQs': { call: 0.62 }, 'KJs': { call: 0.55 }, 'KTs': { call: 0.45 },
        'K9s': { call: 0.18 },
        'QJs': { call: 0.72 }, 'QTs': { call: 0.58 }, 'Q9s': { call: 0.20 },
        'JTs': { call: 0.80 }, 'J9s': { call: 0.42 },
        'T9s': { call: 0.72 }, 'T8s': { call: 0.28 },
        '98s': { call: 0.65 }, '97s': { call: 0.10 },
        '87s': { call: 0.55 }, '76s': { call: 0.48 },
        '65s': { call: 0.40 }, '54s': { call: 0.30 }, '43s': { call: 0.10 },
    },
    // BTN cold-call vs CO open
    BTN_vs_CO: {
        'TT': { call: 0.45 }, '99': { call: 0.72 },
        '88': { call: 0.80 }, '77': { call: 0.68 }, '66': { call: 0.52 },
        '55': { call: 0.35 }, '44': { call: 0.18 },
        'AJs': { call: 0.48 }, 'ATs': { call: 0.72 }, 'A9s': { call: 0.62 },
        'A8s': { call: 0.38 }, 'A7s': { call: 0.15 },
        'A5s': { call: 0.20 }, 'A4s': { call: 0.10 },
        'KQs': { call: 0.45 }, 'KJs': { call: 0.58 }, 'KTs': { call: 0.55 },
        'K9s': { call: 0.30 },
        'QJs': { call: 0.70 }, 'QTs': { call: 0.62 }, 'Q9s': { call: 0.30 },
        'JTs': { call: 0.78 }, 'J9s': { call: 0.52 }, 'J8s': { call: 0.12 },
        'T9s': { call: 0.75 }, 'T8s': { call: 0.38 },
        '98s': { call: 0.68 }, '97s': { call: 0.15 },
        '87s': { call: 0.60 }, '86s': { call: 0.10 },
        '76s': { call: 0.52 }, '75s': { call: 0.08 },
        '65s': { call: 0.45 }, '54s': { call: 0.35 },
        'KQo': { call: 0.20 }, 'KJo': { call: 0.10 },
        'QJo': { call: 0.15 },
    },
    // SB cold-call vs BTN open (SB has a calling range in addition to 3-bet)
    SB_vs_BTN: {
        'TT': { call: 0.25 }, '99': { call: 0.52 },
        '88': { call: 0.60 }, '77': { call: 0.48 }, '66': { call: 0.32 },
        '55': { call: 0.18 },
        'AJs': { call: 0.30 }, 'ATs': { call: 0.55 }, 'A9s': { call: 0.42 },
        'A8s': { call: 0.22 },
        'KQs': { call: 0.35 }, 'KJs': { call: 0.42 }, 'KTs': { call: 0.35 },
        'QJs': { call: 0.52 }, 'QTs': { call: 0.40 },
        'JTs': { call: 0.58 }, 'J9s': { call: 0.30 },
        'T9s': { call: 0.52 }, 'T8s': { call: 0.18 },
        '98s': { call: 0.45 }, '87s': { call: 0.38 },
        '76s': { call: 0.30 }, '65s': { call: 0.22 }, '54s': { call: 0.15 },
    },
};

// ═══════════════════════════════════════════════════════════════════════════
// STACK-DEPTH VARIANTS — RFI adjustments for non-100BB depths
// Key insight: shorter stacks → tighter ranges, deeper stacks → wider with speculative hands
// ═══════════════════════════════════════════════════════════════════════════

export const RFI_20BB = {
    // Push/Fold territory — very wide shove ranges from late positions
    UTG: {
        'AA': { raise: 1.0 }, 'KK': { raise: 1.0 }, 'QQ': { raise: 1.0 },
        'JJ': { raise: 1.0 }, 'TT': { raise: 1.0 }, '99': { raise: 1.0 },
        '88': { raise: 0.85 }, '77': { raise: 0.65 }, '66': { raise: 0.40 },
        'AKs': { raise: 1.0 }, 'AQs': { raise: 1.0 }, 'AJs': { raise: 1.0 },
        'ATs': { raise: 0.90 }, 'A9s': { raise: 0.45 }, 'A5s': { raise: 0.60 },
        'A4s': { raise: 0.40 }, 'A3s': { raise: 0.25 }, 'A2s': { raise: 0.15 },
        'AKo': { raise: 1.0 }, 'AQo': { raise: 1.0 }, 'AJo': { raise: 0.75 },
        'ATo': { raise: 0.35 },
        'KQs': { raise: 1.0 }, 'KJs': { raise: 0.80 }, 'KTs': { raise: 0.50 },
        'QJs': { raise: 0.55 }, 'JTs': { raise: 0.40 },
        'KQo': { raise: 0.55 },
    },
    CO: {
        'AA': { raise: 1.0 }, 'KK': { raise: 1.0 }, 'QQ': { raise: 1.0 },
        'JJ': { raise: 1.0 }, 'TT': { raise: 1.0 }, '99': { raise: 1.0 },
        '88': { raise: 1.0 }, '77': { raise: 0.85 }, '66': { raise: 0.65 },
        '55': { raise: 0.45 }, '44': { raise: 0.25 },
        'AKs': { raise: 1.0 }, 'AQs': { raise: 1.0 }, 'AJs': { raise: 1.0 },
        'ATs': { raise: 1.0 }, 'A9s': { raise: 0.80 }, 'A8s': { raise: 0.55 },
        'A7s': { raise: 0.35 }, 'A6s': { raise: 0.20 },
        'A5s': { raise: 0.85 }, 'A4s': { raise: 0.65 }, 'A3s': { raise: 0.45 },
        'A2s': { raise: 0.30 },
        'AKo': { raise: 1.0 }, 'AQo': { raise: 1.0 }, 'AJo': { raise: 1.0 },
        'ATo': { raise: 0.70 }, 'A9o': { raise: 0.35 },
        'KQs': { raise: 1.0 }, 'KJs': { raise: 1.0 }, 'KTs': { raise: 0.85 },
        'K9s': { raise: 0.50 },
        'QJs': { raise: 0.90 }, 'QTs': { raise: 0.65 },
        'JTs': { raise: 0.75 }, 'T9s': { raise: 0.50 },
        '98s': { raise: 0.35 }, '87s': { raise: 0.25 },
        'KQo': { raise: 1.0 }, 'KJo': { raise: 0.55 },
        'QJo': { raise: 0.30 },
    },
    BTN: {
        'AA': { raise: 1.0 }, 'KK': { raise: 1.0 }, 'QQ': { raise: 1.0 },
        'JJ': { raise: 1.0 }, 'TT': { raise: 1.0 }, '99': { raise: 1.0 },
        '88': { raise: 1.0 }, '77': { raise: 1.0 }, '66': { raise: 0.90 },
        '55': { raise: 0.75 }, '44': { raise: 0.55 }, '33': { raise: 0.35 }, '22': { raise: 0.20 },
        'AKs': { raise: 1.0 }, 'AQs': { raise: 1.0 }, 'AJs': { raise: 1.0 },
        'ATs': { raise: 1.0 }, 'A9s': { raise: 1.0 }, 'A8s': { raise: 0.85 },
        'A7s': { raise: 0.65 }, 'A6s': { raise: 0.50 }, 'A5s': { raise: 1.0 },
        'A4s': { raise: 0.90 }, 'A3s': { raise: 0.70 }, 'A2s': { raise: 0.55 },
        'AKo': { raise: 1.0 }, 'AQo': { raise: 1.0 }, 'AJo': { raise: 1.0 },
        'ATo': { raise: 1.0 }, 'A9o': { raise: 0.70 }, 'A8o': { raise: 0.40 },
        'KQs': { raise: 1.0 }, 'KJs': { raise: 1.0 }, 'KTs': { raise: 1.0 },
        'K9s': { raise: 0.85 }, 'K8s': { raise: 0.50 }, 'K7s': { raise: 0.30 },
        'QJs': { raise: 1.0 }, 'QTs': { raise: 1.0 }, 'Q9s': { raise: 0.70 },
        'Q8s': { raise: 0.35 },
        'JTs': { raise: 1.0 }, 'J9s': { raise: 0.75 }, 'J8s': { raise: 0.30 },
        'T9s': { raise: 0.90 }, 'T8s': { raise: 0.55 },
        '98s': { raise: 0.75 }, '87s': { raise: 0.60 },
        '76s': { raise: 0.45 }, '65s': { raise: 0.35 }, '54s': { raise: 0.25 },
        'KQo': { raise: 1.0 }, 'KJo': { raise: 1.0 }, 'KTo': { raise: 0.75 },
        'K9o': { raise: 0.35 },
        'QJo': { raise: 0.85 }, 'QTo': { raise: 0.50 },
        'JTo': { raise: 0.55 }, 'T9o': { raise: 0.25 },
    },
    SB: {
        // SB shove range at 20BB is very wide
        'AA': { raise: 1.0 }, 'KK': { raise: 1.0 }, 'QQ': { raise: 1.0 },
        'JJ': { raise: 1.0 }, 'TT': { raise: 1.0 }, '99': { raise: 1.0 },
        '88': { raise: 1.0 }, '77': { raise: 1.0 }, '66': { raise: 1.0 },
        '55': { raise: 0.90 }, '44': { raise: 0.75 }, '33': { raise: 0.55 }, '22': { raise: 0.40 },
        'AKs': { raise: 1.0 }, 'AQs': { raise: 1.0 }, 'AJs': { raise: 1.0 },
        'ATs': { raise: 1.0 }, 'A9s': { raise: 1.0 }, 'A8s': { raise: 1.0 },
        'A7s': { raise: 0.90 }, 'A6s': { raise: 0.80 }, 'A5s': { raise: 1.0 },
        'A4s': { raise: 1.0 }, 'A3s': { raise: 0.85 }, 'A2s': { raise: 0.70 },
        'AKo': { raise: 1.0 }, 'AQo': { raise: 1.0 }, 'AJo': { raise: 1.0 },
        'ATo': { raise: 1.0 }, 'A9o': { raise: 0.85 }, 'A8o': { raise: 0.60 },
        'A7o': { raise: 0.35 }, 'A5o': { raise: 0.40 },
        'KQs': { raise: 1.0 }, 'KJs': { raise: 1.0 }, 'KTs': { raise: 1.0 },
        'K9s': { raise: 0.92 }, 'K8s': { raise: 0.65 }, 'K7s': { raise: 0.45 },
        'K6s': { raise: 0.30 }, 'K5s': { raise: 0.20 },
        'QJs': { raise: 1.0 }, 'QTs': { raise: 1.0 }, 'Q9s': { raise: 0.80 },
        'Q8s': { raise: 0.45 }, 'Q7s': { raise: 0.15 },
        'JTs': { raise: 1.0 }, 'J9s': { raise: 0.85 }, 'J8s': { raise: 0.40 },
        'T9s': { raise: 1.0 }, 'T8s': { raise: 0.65 }, 'T7s': { raise: 0.15 },
        '98s': { raise: 0.85 }, '97s': { raise: 0.30 },
        '87s': { raise: 0.75 }, '86s': { raise: 0.20 },
        '76s': { raise: 0.60 }, '65s': { raise: 0.50 }, '54s': { raise: 0.40 },
        'KQo': { raise: 1.0 }, 'KJo': { raise: 1.0 }, 'KTo': { raise: 0.85 },
        'K9o': { raise: 0.50 }, 'K8o': { raise: 0.20 },
        'QJo': { raise: 0.90 }, 'QTo': { raise: 0.60 }, 'Q9o': { raise: 0.25 },
        'JTo': { raise: 0.65 }, 'J9o': { raise: 0.20 },
        'T9o': { raise: 0.35 }, '98o': { raise: 0.15 },
    },
};

export const RFI_50BB = {
    // 50BB: Slightly tighter than 100BB, less implied odds for speculative hands
    UTG: {
        'AA': { raise: 1.0 }, 'KK': { raise: 1.0 }, 'QQ': { raise: 1.0 },
        'JJ': { raise: 1.0 }, 'TT': { raise: 1.0 },
        '99': { raise: 0.75 }, '88': { raise: 0.40 }, '77': { raise: 0.18 },
        'AKs': { raise: 1.0 }, 'AQs': { raise: 1.0 }, 'AJs': { raise: 1.0 },
        'ATs': { raise: 0.70 }, 'A5s': { raise: 0.45 }, 'A4s': { raise: 0.25 },
        'AKo': { raise: 1.0 }, 'AQo': { raise: 0.78 }, 'AJo': { raise: 0.38 },
        'KQs': { raise: 1.0 }, 'KJs': { raise: 0.75 }, 'KTs': { raise: 0.30 },
        'QJs': { raise: 0.60 }, 'QTs': { raise: 0.18 },
        'JTs': { raise: 0.40 }, 'T9s': { raise: 0.20 },
        '98s': { raise: 0.10 }, '87s': { raise: 0.08 },
        'KQo': { raise: 0.25 },
    },
    BTN: {
        'AA': { raise: 1.0 }, 'KK': { raise: 1.0 }, 'QQ': { raise: 1.0 },
        'JJ': { raise: 1.0 }, 'TT': { raise: 1.0 },
        '99': { raise: 1.0 }, '88': { raise: 1.0 }, '77': { raise: 0.92 },
        '66': { raise: 0.82 }, '55': { raise: 0.65 }, '44': { raise: 0.48 },
        '33': { raise: 0.30 }, '22': { raise: 0.18 },
        'AKs': { raise: 1.0 }, 'AQs': { raise: 1.0 }, 'AJs': { raise: 1.0 },
        'ATs': { raise: 1.0 }, 'A9s': { raise: 0.92 }, 'A8s': { raise: 0.72 },
        'A7s': { raise: 0.55 }, 'A6s': { raise: 0.38 }, 'A5s': { raise: 0.92 },
        'A4s': { raise: 0.85 }, 'A3s': { raise: 0.65 }, 'A2s': { raise: 0.45 },
        'AKo': { raise: 1.0 }, 'AQo': { raise: 1.0 }, 'AJo': { raise: 1.0 },
        'ATo': { raise: 0.88 }, 'A9o': { raise: 0.45 }, 'A8o': { raise: 0.18 },
        'KQs': { raise: 1.0 }, 'KJs': { raise: 1.0 }, 'KTs': { raise: 1.0 },
        'K9s': { raise: 0.80 }, 'K8s': { raise: 0.40 }, 'K7s': { raise: 0.20 },
        'QJs': { raise: 1.0 }, 'QTs': { raise: 1.0 }, 'Q9s': { raise: 0.68 },
        'Q8s': { raise: 0.28 },
        'JTs': { raise: 1.0 }, 'J9s': { raise: 0.72 }, 'J8s': { raise: 0.25 },
        'T9s': { raise: 0.92 }, 'T8s': { raise: 0.55 },
        '98s': { raise: 0.80 }, '97s': { raise: 0.22 },
        '87s': { raise: 0.72 }, '76s': { raise: 0.58 },
        '65s': { raise: 0.48 }, '54s': { raise: 0.32 },
        'KQo': { raise: 1.0 }, 'KJo': { raise: 0.90 }, 'KTo': { raise: 0.65 },
        'K9o': { raise: 0.22 },
        'QJo': { raise: 0.78 }, 'QTo': { raise: 0.42 },
        'JTo': { raise: 0.50 }, 'T9o': { raise: 0.18 },
    },
};

export const RFI_200BB = {
    // 200BB: Wider with speculative hands (more implied odds), slightly tighter with dominated hands
    UTG: {
        'AA': { raise: 1.0 }, 'KK': { raise: 1.0 }, 'QQ': { raise: 1.0 },
        'JJ': { raise: 1.0 }, 'TT': { raise: 1.0 },
        '99': { raise: 0.88 }, '88': { raise: 0.65 }, '77': { raise: 0.48 },
        '66': { raise: 0.25 }, '55': { raise: 0.15 },
        'AKs': { raise: 1.0 }, 'AQs': { raise: 1.0 }, 'AJs': { raise: 1.0 },
        'ATs': { raise: 0.82 }, 'A9s': { raise: 0.18 },
        'A5s': { raise: 0.58 }, 'A4s': { raise: 0.42 }, 'A3s': { raise: 0.15 },
        'AKo': { raise: 1.0 }, 'AQo': { raise: 0.75 }, 'AJo': { raise: 0.38 },
        'KQs': { raise: 1.0 }, 'KJs': { raise: 0.90 }, 'KTs': { raise: 0.52 },
        'QJs': { raise: 0.78 }, 'QTs': { raise: 0.38 },
        'JTs': { raise: 0.65 }, 'J9s': { raise: 0.15 },
        'T9s': { raise: 0.48 }, 'T8s': { raise: 0.12 },
        '98s': { raise: 0.35 }, '87s': { raise: 0.28 },
        '76s': { raise: 0.22 }, '65s': { raise: 0.18 }, '54s': { raise: 0.12 },
        'KQo': { raise: 0.42 },
    },
    BTN: {
        'AA': { raise: 1.0 }, 'KK': { raise: 1.0 }, 'QQ': { raise: 1.0 },
        'JJ': { raise: 1.0 }, 'TT': { raise: 1.0 },
        '99': { raise: 1.0 }, '88': { raise: 1.0 }, '77': { raise: 1.0 },
        '66': { raise: 1.0 }, '55': { raise: 0.92 }, '44': { raise: 0.82 },
        '33': { raise: 0.65 }, '22': { raise: 0.50 },
        'AKs': { raise: 1.0 }, 'AQs': { raise: 1.0 }, 'AJs': { raise: 1.0 },
        'ATs': { raise: 1.0 }, 'A9s': { raise: 1.0 }, 'A8s': { raise: 0.92 },
        'A7s': { raise: 0.82 }, 'A6s': { raise: 0.68 }, 'A5s': { raise: 1.0 },
        'A4s': { raise: 1.0 }, 'A3s': { raise: 0.90 }, 'A2s': { raise: 0.75 },
        'AKo': { raise: 1.0 }, 'AQo': { raise: 1.0 }, 'AJo': { raise: 1.0 },
        'ATo': { raise: 1.0 }, 'A9o': { raise: 0.72 }, 'A8o': { raise: 0.42 },
        'A7o': { raise: 0.18 },
        'KQs': { raise: 1.0 }, 'KJs': { raise: 1.0 }, 'KTs': { raise: 1.0 },
        'K9s': { raise: 0.95 }, 'K8s': { raise: 0.62 }, 'K7s': { raise: 0.42 },
        'K6s': { raise: 0.28 }, 'K5s': { raise: 0.15 },
        'QJs': { raise: 1.0 }, 'QTs': { raise: 1.0 }, 'Q9s': { raise: 0.88 },
        'Q8s': { raise: 0.50 }, 'Q7s': { raise: 0.18 },
        'JTs': { raise: 1.0 }, 'J9s': { raise: 0.90 }, 'J8s': { raise: 0.45 },
        'J7s': { raise: 0.12 },
        'T9s': { raise: 1.0 }, 'T8s': { raise: 0.78 }, 'T7s': { raise: 0.25 },
        '98s': { raise: 1.0 }, '97s': { raise: 0.45 }, '96s': { raise: 0.10 },
        '87s': { raise: 0.95 }, '86s': { raise: 0.35 },
        '76s': { raise: 0.88 }, '75s': { raise: 0.25 },
        '65s': { raise: 0.80 }, '64s': { raise: 0.15 },
        '54s': { raise: 0.65 }, '53s': { raise: 0.08 },
        '43s': { raise: 0.30 }, '32s': { raise: 0.05 },
        'KQo': { raise: 1.0 }, 'KJo': { raise: 1.0 }, 'KTo': { raise: 0.85 },
        'K9o': { raise: 0.45 }, 'K8o': { raise: 0.15 },
        'QJo': { raise: 1.0 }, 'QTo': { raise: 0.75 }, 'Q9o': { raise: 0.35 },
        'JTo': { raise: 0.85 }, 'J9o': { raise: 0.35 },
        'T9o': { raise: 0.55 }, 'T8o': { raise: 0.15 },
        '98o': { raise: 0.38 }, '87o': { raise: 0.25 }, '76o': { raise: 0.12 },
    },
};

/**
 * Get RFI range for a specific stack depth and position.
 * Falls back to 100BB data if no specific depth data exists.
 */
export function getRFIByDepth(stackDepth, position) {
    if (stackDepth <= 25) return RFI_20BB[position] || RFI[position];
    if (stackDepth <= 65) return RFI_50BB[position] || RFI[position];
    if (stackDepth >= 150) return RFI_200BB[position] || RFI[position];
    return RFI[position]; // Default 100BB
}

// ═══════════════════════════════════════════════════════════════════════════
// SB COMPLETE (LIMP) — SB vs BB, 6-max cash 100BB
// ═══════════════════════════════════════════════════════════════════════════
// SB limping strategy: complete (limp) or raise (open). Mixed frequencies.
// Modern solvers use a mixed open/limp strategy from the SB.
// ~30-35% complete, ~22-28% raise, rest fold.

export const SB_COMPLETE = {
    'AA': { raise: 0.82, complete: 0.18 }, 'KK': { raise: 0.80, complete: 0.20 },
    'QQ': { raise: 0.78, complete: 0.22 }, 'JJ': { raise: 0.72, complete: 0.28 },
    'TT': { raise: 0.65, complete: 0.35 }, '99': { raise: 0.45, complete: 0.55 },
    '88': { raise: 0.30, complete: 0.70 }, '77': { raise: 0.20, complete: 0.80 },
    '66': { raise: 0.12, complete: 0.88 }, '55': { raise: 0.10, complete: 0.90 },
    '44': { raise: 0.08, complete: 0.92 }, '33': { raise: 0.06, complete: 0.94 },
    '22': { raise: 0.05, complete: 0.95 },
    'AKs': { raise: 0.85, complete: 0.15 }, 'AQs': { raise: 0.80, complete: 0.20 },
    'AJs': { raise: 0.72, complete: 0.28 }, 'ATs': { raise: 0.60, complete: 0.40 },
    'A9s': { raise: 0.35, complete: 0.65 }, 'A8s': { raise: 0.28, complete: 0.72 },
    'A7s': { raise: 0.22, complete: 0.78 }, 'A6s': { raise: 0.18, complete: 0.82 },
    'A5s': { raise: 0.45, complete: 0.55 }, 'A4s': { raise: 0.38, complete: 0.62 },
    'A3s': { raise: 0.30, complete: 0.70 }, 'A2s': { raise: 0.25, complete: 0.75 },
    'AKo': { raise: 0.82, complete: 0.18 }, 'AQo': { raise: 0.70, complete: 0.30 },
    'AJo': { raise: 0.55, complete: 0.45 }, 'ATo': { raise: 0.38, complete: 0.62 },
    'A9o': { raise: 0.15, complete: 0.85 }, 'A8o': { raise: 0.10, complete: 0.90 },
    'A7o': { raise: 0.05, complete: 0.75 }, 'A6o': { raise: 0.03, complete: 0.65 },
    'A5o': { raise: 0.12, complete: 0.88 }, 'A4o': { raise: 0.08, complete: 0.82 },
    'A3o': { raise: 0.05, complete: 0.75 }, 'A2o': { raise: 0.03, complete: 0.70 },
    'KQs': { raise: 0.75, complete: 0.25 }, 'KJs': { raise: 0.62, complete: 0.38 },
    'KTs': { raise: 0.50, complete: 0.50 }, 'K9s': { raise: 0.25, complete: 0.75 },
    'K8s': { raise: 0.12, complete: 0.88 }, 'K7s': { raise: 0.08, complete: 0.92 },
    'K6s': { raise: 0.06, complete: 0.94 }, 'K5s': { raise: 0.10, complete: 0.90 },
    'K4s': { raise: 0.08, complete: 0.92 }, 'K3s': { raise: 0.05, complete: 0.95 },
    'K2s': { raise: 0.04, complete: 0.96 },
    'KQo': { raise: 0.65, complete: 0.35 }, 'KJo': { raise: 0.42, complete: 0.58 },
    'KTo': { raise: 0.28, complete: 0.72 }, 'K9o': { raise: 0.10, complete: 0.80 },
    'QJs': { raise: 0.60, complete: 0.40 }, 'QTs': { raise: 0.45, complete: 0.55 },
    'Q9s': { raise: 0.20, complete: 0.80 }, 'Q8s': { raise: 0.08, complete: 0.92 },
    'Q7s': { raise: 0.04, complete: 0.86 }, 'Q6s': { raise: 0.04, complete: 0.86 },
    'QJo': { raise: 0.35, complete: 0.65 }, 'QTo': { raise: 0.18, complete: 0.72 },
    'JTs': { raise: 0.55, complete: 0.45 }, 'J9s': { raise: 0.25, complete: 0.75 },
    'J8s': { raise: 0.10, complete: 0.90 }, 'J7s': { raise: 0.04, complete: 0.86 },
    'JTo': { raise: 0.22, complete: 0.68 }, 'J9o': { raise: 0.05, complete: 0.70 },
    'T9s': { raise: 0.45, complete: 0.55 }, 'T8s': { raise: 0.18, complete: 0.82 },
    'T7s': { raise: 0.06, complete: 0.84 }, 'T9o': { raise: 0.08, complete: 0.62 },
    '98s': { raise: 0.35, complete: 0.65 }, '97s': { raise: 0.12, complete: 0.88 },
    '96s': { raise: 0.04, complete: 0.76 }, '98o': { raise: 0.05, complete: 0.55 },
    '87s': { raise: 0.28, complete: 0.72 }, '86s': { raise: 0.08, complete: 0.82 },
    '76s': { raise: 0.22, complete: 0.78 }, '75s': { raise: 0.06, complete: 0.74 },
    '65s': { raise: 0.18, complete: 0.82 }, '64s': { raise: 0.04, complete: 0.66 },
    '54s': { raise: 0.15, complete: 0.85 }, '53s': { raise: 0.03, complete: 0.57 },
    '43s': { raise: 0.08, complete: 0.72 }, '42s': { raise: 0.02, complete: 0.48 },
    '32s': { raise: 0.02, complete: 0.48 },
};

// ═══════════════════════════════════════════════════════════════════════════
// SHOVE/FOLD CHARTS — Short stack push/fold (Nash equilibrium)
// ═══════════════════════════════════════════════════════════════════════════
// Format: SHOVE_FOLD[depth][position] = { hand: { shove: freq } }
// BB_CALL[depth][vs_position] = { hand: { call: freq } }

export const SHOVE_FOLD = {
    '10BB': {
        BTN: {
            'AA': { shove: 1.0 }, 'KK': { shove: 1.0 }, 'QQ': { shove: 1.0 }, 'JJ': { shove: 1.0 },
            'TT': { shove: 1.0 }, '99': { shove: 1.0 }, '88': { shove: 1.0 }, '77': { shove: 1.0 },
            '66': { shove: 1.0 }, '55': { shove: 1.0 }, '44': { shove: 1.0 }, '33': { shove: 1.0 }, '22': { shove: 1.0 },
            'AKs': { shove: 1.0 }, 'AQs': { shove: 1.0 }, 'AJs': { shove: 1.0 }, 'ATs': { shove: 1.0 },
            'A9s': { shove: 1.0 }, 'A8s': { shove: 1.0 }, 'A7s': { shove: 1.0 }, 'A6s': { shove: 1.0 },
            'A5s': { shove: 1.0 }, 'A4s': { shove: 1.0 }, 'A3s': { shove: 1.0 }, 'A2s': { shove: 1.0 },
            'AKo': { shove: 1.0 }, 'AQo': { shove: 1.0 }, 'AJo': { shove: 1.0 }, 'ATo': { shove: 1.0 },
            'A9o': { shove: 1.0 }, 'A8o': { shove: 1.0 }, 'A7o': { shove: 1.0 }, 'A6o': { shove: 1.0 },
            'A5o': { shove: 1.0 }, 'A4o': { shove: 1.0 }, 'A3o': { shove: 1.0 }, 'A2o': { shove: 1.0 },
            'KQs': { shove: 1.0 }, 'KJs': { shove: 1.0 }, 'KTs': { shove: 1.0 }, 'K9s': { shove: 1.0 },
            'K8s': { shove: 1.0 }, 'K7s': { shove: 1.0 }, 'K6s': { shove: 1.0 }, 'K5s': { shove: 1.0 },
            'K4s': { shove: 0.85 }, 'K3s': { shove: 0.72 }, 'K2s': { shove: 0.60 },
            'KQo': { shove: 1.0 }, 'KJo': { shove: 1.0 }, 'KTo': { shove: 1.0 }, 'K9o': { shove: 0.90 },
            'K8o': { shove: 0.72 }, 'K7o': { shove: 0.55 }, 'K6o': { shove: 0.42 },
            'QJs': { shove: 1.0 }, 'QTs': { shove: 1.0 }, 'Q9s': { shove: 1.0 }, 'Q8s': { shove: 0.88 },
            'Q7s': { shove: 0.70 }, 'Q6s': { shove: 0.62 }, 'Q5s': { shove: 0.55 },
            'QJo': { shove: 1.0 }, 'QTo': { shove: 0.92 }, 'Q9o': { shove: 0.68 },
            'JTs': { shove: 1.0 }, 'J9s': { shove: 1.0 }, 'J8s': { shove: 0.82 }, 'J7s': { shove: 0.62 },
            'JTo': { shove: 0.88 }, 'J9o': { shove: 0.55 },
            'T9s': { shove: 1.0 }, 'T8s': { shove: 0.85 }, 'T7s': { shove: 0.55 },
            'T9o': { shove: 0.65 },
            '98s': { shove: 0.92 }, '97s': { shove: 0.68 }, '87s': { shove: 0.85 },
            '76s': { shove: 0.72 }, '65s': { shove: 0.65 }, '54s': { shove: 0.55 },
        },
        SB: {
            'AA': { shove: 1.0 }, 'KK': { shove: 1.0 }, 'QQ': { shove: 1.0 }, 'JJ': { shove: 1.0 },
            'TT': { shove: 1.0 }, '99': { shove: 1.0 }, '88': { shove: 1.0 }, '77': { shove: 1.0 },
            '66': { shove: 1.0 }, '55': { shove: 1.0 }, '44': { shove: 1.0 }, '33': { shove: 1.0 }, '22': { shove: 1.0 },
            'AKs': { shove: 1.0 }, 'AQs': { shove: 1.0 }, 'AJs': { shove: 1.0 }, 'ATs': { shove: 1.0 },
            'A9s': { shove: 1.0 }, 'A8s': { shove: 1.0 }, 'A7s': { shove: 1.0 }, 'A6s': { shove: 1.0 },
            'A5s': { shove: 1.0 }, 'A4s': { shove: 1.0 }, 'A3s': { shove: 1.0 }, 'A2s': { shove: 1.0 },
            'AKo': { shove: 1.0 }, 'AQo': { shove: 1.0 }, 'AJo': { shove: 1.0 }, 'ATo': { shove: 1.0 },
            'A9o': { shove: 1.0 }, 'A8o': { shove: 1.0 }, 'A7o': { shove: 1.0 }, 'A6o': { shove: 1.0 },
            'A5o': { shove: 1.0 }, 'A4o': { shove: 1.0 }, 'A3o': { shove: 1.0 }, 'A2o': { shove: 1.0 },
            'KQs': { shove: 1.0 }, 'KJs': { shove: 1.0 }, 'KTs': { shove: 1.0 }, 'K9s': { shove: 1.0 },
            'K8s': { shove: 1.0 }, 'K7s': { shove: 1.0 }, 'K6s': { shove: 1.0 }, 'K5s': { shove: 1.0 },
            'K4s': { shove: 1.0 }, 'K3s': { shove: 0.90 }, 'K2s': { shove: 0.82 },
            'KQo': { shove: 1.0 }, 'KJo': { shove: 1.0 }, 'KTo': { shove: 1.0 }, 'K9o': { shove: 1.0 },
            'K8o': { shove: 0.88 }, 'K7o': { shove: 0.75 }, 'K6o': { shove: 0.62 }, 'K5o': { shove: 0.50 },
            'QJs': { shove: 1.0 }, 'QTs': { shove: 1.0 }, 'Q9s': { shove: 1.0 }, 'Q8s': { shove: 1.0 },
            'Q7s': { shove: 0.88 }, 'Q6s': { shove: 0.78 }, 'Q5s': { shove: 0.72 }, 'Q4s': { shove: 0.60 },
            'QJo': { shove: 1.0 }, 'QTo': { shove: 1.0 }, 'Q9o': { shove: 0.85 }, 'Q8o': { shove: 0.62 },
            'JTs': { shove: 1.0 }, 'J9s': { shove: 1.0 }, 'J8s': { shove: 0.95 }, 'J7s': { shove: 0.78 },
            'JTo': { shove: 1.0 }, 'J9o': { shove: 0.75 }, 'J8o': { shove: 0.45 },
            'T9s': { shove: 1.0 }, 'T8s': { shove: 0.95 }, 'T7s': { shove: 0.72 },
            'T9o': { shove: 0.82 }, 'T8o': { shove: 0.45 },
            '98s': { shove: 1.0 }, '97s': { shove: 0.82 }, '96s': { shove: 0.55 },
            '98o': { shove: 0.55 },
            '87s': { shove: 0.95 }, '86s': { shove: 0.65 },
            '76s': { shove: 0.88 }, '75s': { shove: 0.50 },
            '65s': { shove: 0.82 }, '54s': { shove: 0.72 }, '43s': { shove: 0.45 },
        },
        CO: {
            'AA': { shove: 1.0 }, 'KK': { shove: 1.0 }, 'QQ': { shove: 1.0 }, 'JJ': { shove: 1.0 },
            'TT': { shove: 1.0 }, '99': { shove: 1.0 }, '88': { shove: 1.0 }, '77': { shove: 1.0 },
            '66': { shove: 1.0 }, '55': { shove: 0.90 }, '44': { shove: 0.72 }, '33': { shove: 0.55 }, '22': { shove: 0.42 },
            'AKs': { shove: 1.0 }, 'AQs': { shove: 1.0 }, 'AJs': { shove: 1.0 }, 'ATs': { shove: 1.0 },
            'A9s': { shove: 1.0 }, 'A8s': { shove: 0.92 }, 'A7s': { shove: 0.85 }, 'A6s': { shove: 0.78 },
            'A5s': { shove: 1.0 }, 'A4s': { shove: 0.92 }, 'A3s': { shove: 0.82 }, 'A2s': { shove: 0.72 },
            'AKo': { shove: 1.0 }, 'AQo': { shove: 1.0 }, 'AJo': { shove: 1.0 }, 'ATo': { shove: 0.92 },
            'A9o': { shove: 0.75 }, 'A8o': { shove: 0.60 }, 'A7o': { shove: 0.45 },
            'KQs': { shove: 1.0 }, 'KJs': { shove: 1.0 }, 'KTs': { shove: 1.0 }, 'K9s': { shove: 0.82 },
            'K8s': { shove: 0.60 }, 'K7s': { shove: 0.45 },
            'KQo': { shove: 1.0 }, 'KJo': { shove: 0.88 }, 'KTo': { shove: 0.65 },
            'QJs': { shove: 1.0 }, 'QTs': { shove: 0.92 }, 'Q9s': { shove: 0.68 },
            'QJo': { shove: 0.78 }, 'QTo': { shove: 0.52 },
            'JTs': { shove: 0.95 }, 'J9s': { shove: 0.72 }, 'JTo': { shove: 0.55 },
            'T9s': { shove: 0.88 }, 'T8s': { shove: 0.55 },
            '98s': { shove: 0.72 }, '87s': { shove: 0.65 }, '76s': { shove: 0.55 },
            '65s': { shove: 0.45 }, '54s': { shove: 0.38 },
        },
        UTG: {
            'AA': { shove: 1.0 }, 'KK': { shove: 1.0 }, 'QQ': { shove: 1.0 }, 'JJ': { shove: 1.0 },
            'TT': { shove: 1.0 }, '99': { shove: 0.85 }, '88': { shove: 0.62 }, '77': { shove: 0.40 },
            'AKs': { shove: 1.0 }, 'AQs': { shove: 1.0 }, 'AJs': { shove: 1.0 }, 'ATs': { shove: 0.88 },
            'A9s': { shove: 0.55 }, 'A5s': { shove: 0.72 }, 'A4s': { shove: 0.55 },
            'AKo': { shove: 1.0 }, 'AQo': { shove: 0.92 }, 'AJo': { shove: 0.65 },
            'KQs': { shove: 1.0 }, 'KJs': { shove: 0.78 }, 'KTs': { shove: 0.50 },
            'KQo': { shove: 0.62 },
            'QJs': { shove: 0.60 }, 'QTs': { shove: 0.35 },
            'JTs': { shove: 0.52 }, 'T9s': { shove: 0.35 },
            '98s': { shove: 0.28 }, '87s': { shove: 0.22 }, '76s': { shove: 0.18 },
        },
    },
    '15BB': {
        BTN: {
            'AA': { shove: 1.0 }, 'KK': { shove: 1.0 }, 'QQ': { shove: 1.0 }, 'JJ': { shove: 1.0 },
            'TT': { shove: 1.0 }, '99': { shove: 1.0 }, '88': { shove: 0.92 }, '77': { shove: 0.78 },
            '66': { shove: 0.62 }, '55': { shove: 0.48 }, '44': { shove: 0.35 }, '33': { shove: 0.25 }, '22': { shove: 0.18 },
            'AKs': { shove: 1.0 }, 'AQs': { shove: 1.0 }, 'AJs': { shove: 1.0 }, 'ATs': { shove: 1.0 },
            'A9s': { shove: 0.85 }, 'A8s': { shove: 0.72 }, 'A7s': { shove: 0.58 }, 'A6s': { shove: 0.48 },
            'A5s': { shove: 0.82 }, 'A4s': { shove: 0.68 }, 'A3s': { shove: 0.52 }, 'A2s': { shove: 0.40 },
            'AKo': { shove: 1.0 }, 'AQo': { shove: 1.0 }, 'AJo': { shove: 0.88 }, 'ATo': { shove: 0.65 },
            'A9o': { shove: 0.42 }, 'A8o': { shove: 0.28 },
            'KQs': { shove: 1.0 }, 'KJs': { shove: 0.88 }, 'KTs': { shove: 0.72 }, 'K9s': { shove: 0.48 },
            'KQo': { shove: 0.85 }, 'KJo': { shove: 0.55 }, 'KTo': { shove: 0.32 },
            'QJs': { shove: 0.82 }, 'QTs': { shove: 0.62 }, 'Q9s': { shove: 0.35 },
            'QJo': { shove: 0.45 }, 'QTo': { shove: 0.25 },
            'JTs': { shove: 0.72 }, 'J9s': { shove: 0.42 },
            'T9s': { shove: 0.62 }, 'T8s': { shove: 0.32 },
            '98s': { shove: 0.48 }, '87s': { shove: 0.40 }, '76s': { shove: 0.32 },
            '65s': { shove: 0.25 }, '54s': { shove: 0.20 },
        },
        SB: {
            'AA': { shove: 1.0 }, 'KK': { shove: 1.0 }, 'QQ': { shove: 1.0 }, 'JJ': { shove: 1.0 },
            'TT': { shove: 1.0 }, '99': { shove: 1.0 }, '88': { shove: 1.0 }, '77': { shove: 0.88 },
            '66': { shove: 0.72 }, '55': { shove: 0.58 }, '44': { shove: 0.42 }, '33': { shove: 0.30 }, '22': { shove: 0.22 },
            'AKs': { shove: 1.0 }, 'AQs': { shove: 1.0 }, 'AJs': { shove: 1.0 }, 'ATs': { shove: 1.0 },
            'A9s': { shove: 0.92 }, 'A8s': { shove: 0.80 }, 'A7s': { shove: 0.68 }, 'A6s': { shove: 0.58 },
            'A5s': { shove: 0.92 }, 'A4s': { shove: 0.78 }, 'A3s': { shove: 0.62 }, 'A2s': { shove: 0.50 },
            'AKo': { shove: 1.0 }, 'AQo': { shove: 1.0 }, 'AJo': { shove: 0.95 }, 'ATo': { shove: 0.75 },
            'A9o': { shove: 0.52 }, 'A8o': { shove: 0.38 }, 'A7o': { shove: 0.22 },
            'KQs': { shove: 1.0 }, 'KJs': { shove: 0.92 }, 'KTs': { shove: 0.78 }, 'K9s': { shove: 0.55 },
            'K8s': { shove: 0.35 },
            'KQo': { shove: 0.92 }, 'KJo': { shove: 0.65 }, 'KTo': { shove: 0.42 },
            'QJs': { shove: 0.88 }, 'QTs': { shove: 0.68 }, 'Q9s': { shove: 0.42 },
            'QJo': { shove: 0.55 }, 'QTo': { shove: 0.32 },
            'JTs': { shove: 0.78 }, 'J9s': { shove: 0.48 },
            'JTo': { shove: 0.35 },
            'T9s': { shove: 0.68 }, 'T8s': { shove: 0.38 },
            '98s': { shove: 0.55 }, '87s': { shove: 0.45 }, '76s': { shove: 0.38 },
            '65s': { shove: 0.30 }, '54s': { shove: 0.25 },
        },
    },
};

// BB calling ranges vs shove
export const BB_CALL_VS_SHOVE = {
    '10BB': {
        vs_BTN: {
            'AA': { call: 1.0 }, 'KK': { call: 1.0 }, 'QQ': { call: 1.0 }, 'JJ': { call: 1.0 },
            'TT': { call: 1.0 }, '99': { call: 0.88 }, '88': { call: 0.65 }, '77': { call: 0.40 },
            '66': { call: 0.22 },
            'AKs': { call: 1.0 }, 'AQs': { call: 1.0 }, 'AJs': { call: 0.92 }, 'ATs': { call: 0.78 },
            'A9s': { call: 0.55 }, 'A8s': { call: 0.42 }, 'A7s': { call: 0.30 }, 'A5s': { call: 0.35 },
            'AKo': { call: 1.0 }, 'AQo': { call: 0.88 }, 'AJo': { call: 0.65 }, 'ATo': { call: 0.42 },
            'A9o': { call: 0.22 },
            'KQs': { call: 0.82 }, 'KJs': { call: 0.55 }, 'KTs': { call: 0.35 },
            'KQo': { call: 0.48 }, 'KJo': { call: 0.25 },
            'QJs': { call: 0.42 }, 'QTs': { call: 0.28 },
            'JTs': { call: 0.32 }, 'T9s': { call: 0.20 },
        },
        vs_SB: {
            'AA': { call: 1.0 }, 'KK': { call: 1.0 }, 'QQ': { call: 1.0 }, 'JJ': { call: 1.0 },
            'TT': { call: 1.0 }, '99': { call: 0.92 }, '88': { call: 0.75 }, '77': { call: 0.55 },
            '66': { call: 0.35 }, '55': { call: 0.20 },
            'AKs': { call: 1.0 }, 'AQs': { call: 1.0 }, 'AJs': { call: 1.0 }, 'ATs': { call: 0.88 },
            'A9s': { call: 0.68 }, 'A8s': { call: 0.52 }, 'A7s': { call: 0.38 }, 'A6s': { call: 0.25 },
            'A5s': { call: 0.45 }, 'A4s': { call: 0.30 },
            'AKo': { call: 1.0 }, 'AQo': { call: 0.95 }, 'AJo': { call: 0.78 }, 'ATo': { call: 0.55 },
            'A9o': { call: 0.35 }, 'A8o': { call: 0.20 },
            'KQs': { call: 0.92 }, 'KJs': { call: 0.68 }, 'KTs': { call: 0.48 }, 'K9s': { call: 0.28 },
            'KQo': { call: 0.62 }, 'KJo': { call: 0.38 }, 'KTo': { call: 0.20 },
            'QJs': { call: 0.55 }, 'QTs': { call: 0.38 },
            'QJo': { call: 0.22 },
            'JTs': { call: 0.42 }, 'J9s': { call: 0.22 },
            'T9s': { call: 0.28 }, '98s': { call: 0.18 },
        },
    },
};

// ═══════════════════════════════════════════════════════════════════════════
// UTILITY: Lookup helpers
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get the action frequencies for a specific hand in a specific spot.
 * Returns { raise: 0, call: 0, fold: 1 } for hands not in the range.
 */
export function getHandFrequencies(spotData, hand) {
    const entry = spotData?.[hand];
    if (!entry) return { raise: 0, call: 0, fold: 1 };

    const raise = entry.raise || 0;
    const call = entry.call || 0;
    const fold = Math.max(0, 1 - raise - call);
    return { raise, call, fold };
}

/**
 * Get the primary action for a hand (highest frequency action).
 */
export function getPrimaryAction(spotData, hand) {
    const freq = getHandFrequencies(spotData, hand);
    if (freq.raise >= freq.call && freq.raise >= freq.fold) return 'raise';
    if (freq.call >= freq.raise && freq.call >= freq.fold) return 'call';
    return 'fold';
}

/**
 * Check if a hand is "in the range" (any non-fold action > threshold).
 */
export function isInRange(spotData, hand, threshold = 0.05) {
    const freq = getHandFrequencies(spotData, hand);
    return (freq.raise > threshold) || (freq.call > threshold);
}

/**
 * Calculate total range percentage (weighted by combos).
 */
export function getRangePercentage(spotData) {
    let totalCombos = 0;
    let inRangeCombos = 0;

    for (const hand of ALL_HANDS) {
        const combos = getCombos(hand);
        const freq = getHandFrequencies(spotData, hand);
        const inRange = freq.raise + freq.call;
        totalCombos += combos;
        inRangeCombos += combos * inRange;
    }

    return totalCombos > 0 ? (inRangeCombos / totalCombos * 100) : 0;
}

/**
 * Get all spot keys organized by category.
 */
export function getAvailableSpots() {
    return {
        rfi: Object.keys(RFI || {}).map(pos => ({ key: `RFI.${pos}`, label: `${pos} Open`, data: RFI[pos] })),
        threeBet: Object.keys(THREE_BET || {}).map(key => {
            const [pos, , villain] = key.split('_');
            return { key: `3BET.${key}`, label: `${pos} 3-Bet vs ${villain}`, data: THREE_BET[key] };
        }),
        bbDefense: Object.keys(BB_DEFENSE || {}).map(key => {
            const villain = key.replace('vs_', '');
            return { key: `BB_DEF.${key}`, label: `BB Defense vs ${villain}`, data: BB_DEFENSE[key] };
        }),
        fourBet: Object.keys(FOUR_BET || {}).map(key => {
            const [pos] = key.split('_');
            return { key: `4BET.${key}`, label: `${pos} 4-Bet`, data: FOUR_BET[key] };
        }),
        squeeze: Object.keys(SQUEEZE || {}).map(key => ({
            key: `SQZ.${key}`,
            label: key.replace(/_/g, ' ').replace('vs', 'vs').replace('open', 'open,'),
            data: SQUEEZE[key],
        })),
        coldCall: Object.keys(COLD_CALL || {}).map(key => {
            const parts = key.split('_vs_');
            const pos = parts[0];
            const villain = parts[1] || key;
            return { key: `CC.${key}`, label: `${pos} Flat vs ${villain}`, data: COLD_CALL[key] };
        }),
    };
}

/**
 * Resolve a spot key to its data.
 */
export function resolveSpot(spotKey) {
    const [category, ...rest] = spotKey.split('.');
    const key = rest.join('.');

    switch (category) {
        case 'RFI': return RFI[key];
        case '3BET': return THREE_BET[key];
        case 'BB_DEF': return BB_DEFENSE[key];
        case '4BET': return FOUR_BET[key];
        case 'SQZ': return SQUEEZE[key];
        case 'CC': return COLD_CALL[key];
        default: return null;
    }
}
