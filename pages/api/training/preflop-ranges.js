/**
 * API: Preflop Ranges — Browse GTO Preflop Charts
 * ═══════════════════════════════════════════════════════════════════════════
 * GET /api/training/preflop-ranges
 *
 * Query params:
 *   gameType: 'cash_6max' | 'mtt' | 'spins' (default: cash_6max)
 *   stackDepth: number (default: 100)
 *   position: 'UTG' | 'MP' | 'HJ' | 'CO' | 'BTN' | 'SB' | 'BB'
 *   scenario: 'rfi' | 'vs3bet' | 'bb_defense' | 'push_fold' (default: rfi)
 *
 * Returns:
 *   { success, range: { actions, frequencies, stats } }
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

const RANKS = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2'];

function getAllHands() {
    const hands = [];
    for (let r = 0; r < 13; r++) {
        for (let c = 0; c < 13; c++) {
            if (r === c) hands.push(`${RANKS[r]}${RANKS[c]}`);
            else if (r < c) hands.push(`${RANKS[r]}${RANKS[c]}s`);
            else hands.push(`${RANKS[c]}${RANKS[r]}o`);
        }
    }
    return hands;
}

// ═══════════════════════════════════════════════════════════════════════════
// GTO PREFLOP RANGES — Solver-derived open-raising ranges (6-max, 100BB)
// ═══════════════════════════════════════════════════════════════════════════
const PREFLOP_RFI_RANGES = {
    UTG: {
        'AA': 1, 'KK': 1, 'QQ': 1, 'JJ': 1, 'TT': 1, '99': 0.8, '88': 0.5, '77': 0.3,
        'AKs': 1, 'AQs': 1, 'AJs': 1, 'ATs': 0.8, 'A5s': 0.5, 'A4s': 0.3,
        'AKo': 1, 'AQo': 0.8, 'AJo': 0.5,
        'KQs': 1, 'KJs': 1, 'KTs': 0.7, 'K9s': 0.3,
        'QJs': 1, 'QTs': 0.6, 'Q9s': 0.2,
        'JTs': 0.8, 'J9s': 0.3,
        'T9s': 0.6, 'T8s': 0.2,
        '98s': 0.4, '87s': 0.3, '76s': 0.25, '65s': 0.2,
        'KQo': 0.5, 'KJo': 0.3,
    },
    MP: {
        'AA': 1, 'KK': 1, 'QQ': 1, 'JJ': 1, 'TT': 1, '99': 1, '88': 0.7, '77': 0.5, '66': 0.3,
        'AKs': 1, 'AQs': 1, 'AJs': 1, 'ATs': 1, 'A9s': 0.5, 'A5s': 0.7, 'A4s': 0.5, 'A3s': 0.3,
        'AKo': 1, 'AQo': 1, 'AJo': 0.7, 'ATo': 0.3,
        'KQs': 1, 'KJs': 1, 'KTs': 0.8, 'K9s': 0.4,
        'QJs': 1, 'QTs': 0.8, 'Q9s': 0.3,
        'JTs': 1, 'J9s': 0.5, 'J8s': 0.15,
        'T9s': 0.8, 'T8s': 0.3,
        '98s': 0.6, '87s': 0.4, '76s': 0.3, '65s': 0.25, '54s': 0.15,
        'KQo': 0.7, 'KJo': 0.4, 'QJo': 0.2,
    },
    HJ: {
        'AA': 1, 'KK': 1, 'QQ': 1, 'JJ': 1, 'TT': 1, '99': 1, '88': 0.85, '77': 0.65, '66': 0.4, '55': 0.2,
        'AKs': 1, 'AQs': 1, 'AJs': 1, 'ATs': 1, 'A9s': 0.7, 'A8s': 0.3, 'A5s': 0.8, 'A4s': 0.6, 'A3s': 0.4, 'A2s': 0.2,
        'AKo': 1, 'AQo': 1, 'AJo': 0.8, 'ATo': 0.5,
        'KQs': 1, 'KJs': 1, 'KTs': 0.9, 'K9s': 0.5, 'K8s': 0.15,
        'QJs': 1, 'QTs': 0.9, 'Q9s': 0.4,
        'JTs': 1, 'J9s': 0.6, 'J8s': 0.2,
        'T9s': 0.9, 'T8s': 0.4,
        '98s': 0.7, '87s': 0.5, '76s': 0.4, '65s': 0.35, '54s': 0.2,
        'KQo': 0.8, 'KJo': 0.5, 'KTo': 0.2, 'QJo': 0.3,
    },
    CO: {
        'AA': 1, 'KK': 1, 'QQ': 1, 'JJ': 1, 'TT': 1, '99': 1, '88': 1, '77': 0.8, '66': 0.6, '55': 0.4, '44': 0.3,
        'AKs': 1, 'AQs': 1, 'AJs': 1, 'ATs': 1, 'A9s': 0.8, 'A8s': 0.5, 'A7s': 0.3, 'A5s': 1, 'A4s': 0.8, 'A3s': 0.6, 'A2s': 0.4,
        'AKo': 1, 'AQo': 1, 'AJo': 1, 'ATo': 0.7, 'A9o': 0.3,
        'KQs': 1, 'KJs': 1, 'KTs': 1, 'K9s': 0.7, 'K8s': 0.3,
        'QJs': 1, 'QTs': 1, 'Q9s': 0.6, 'Q8s': 0.2,
        'JTs': 1, 'J9s': 0.6, 'J8s': 0.2,
        'T9s': 1, 'T8s': 0.4,
        '98s': 0.7, '87s': 0.6, '76s': 0.5, '65s': 0.4, '54s': 0.3,
        'KQo': 1, 'KJo': 0.7, 'KTo': 0.4,
        'QJo': 0.5, 'QTo': 0.3,
        'JTo': 0.3,
    },
    BTN: {
        'AA': 1, 'KK': 1, 'QQ': 1, 'JJ': 1, 'TT': 1, '99': 1, '88': 1, '77': 1, '66': 1, '55': 0.8, '44': 0.7, '33': 0.5, '22': 0.4,
        'AKs': 1, 'AQs': 1, 'AJs': 1, 'ATs': 1, 'A9s': 1, 'A8s': 0.8, 'A7s': 0.7, 'A6s': 0.5, 'A5s': 1, 'A4s': 1, 'A3s': 0.8, 'A2s': 0.6,
        'AKo': 1, 'AQo': 1, 'AJo': 1, 'ATo': 1, 'A9o': 0.6, 'A8o': 0.3,
        'KQs': 1, 'KJs': 1, 'KTs': 1, 'K9s': 0.9, 'K8s': 0.5, 'K7s': 0.3, 'K6s': 0.2,
        'QJs': 1, 'QTs': 1, 'Q9s': 0.8, 'Q8s': 0.4,
        'JTs': 1, 'J9s': 0.8, 'J8s': 0.4,
        'T9s': 1, 'T8s': 0.7, 'T7s': 0.2,
        '98s': 1, '97s': 0.4, '87s': 0.9, '86s': 0.3,
        '76s': 0.8, '75s': 0.2, '65s': 0.7, '54s': 0.5, '43s': 0.2,
        'KQo': 1, 'KJo': 1, 'KTo': 0.8, 'K9o': 0.4, 'K8o': 0.2,
        'QJo': 1, 'QTo': 0.7, 'Q9o': 0.3,
        'JTo': 0.8, 'J9o': 0.3,
        'T9o': 0.5, 'T8o': 0.15,
        '98o': 0.3, '87o': 0.2, '76o': 0.1,
    },
    SB: {
        'AA': 1, 'KK': 1, 'QQ': 1, 'JJ': 1, 'TT': 1, '99': 1, '88': 1, '77': 1, '66': 0.8, '55': 0.7, '44': 0.5, '33': 0.4, '22': 0.3,
        'AKs': 1, 'AQs': 1, 'AJs': 1, 'ATs': 1, 'A9s': 1, 'A8s': 0.7, 'A7s': 0.5, 'A6s': 0.3, 'A5s': 1, 'A4s': 0.8, 'A3s': 0.6, 'A2s': 0.5,
        'AKo': 1, 'AQo': 1, 'AJo': 1, 'ATo': 0.8, 'A9o': 0.4, 'A8o': 0.2,
        'KQs': 1, 'KJs': 1, 'KTs': 1, 'K9s': 0.8, 'K8s': 0.4, 'K7s': 0.2,
        'QJs': 1, 'QTs': 1, 'Q9s': 0.6, 'Q8s': 0.3,
        'JTs': 1, 'J9s': 0.7, 'J8s': 0.3,
        'T9s': 1, 'T8s': 0.5, 'T7s': 0.15,
        '98s': 0.8, '97s': 0.3, '87s': 0.7, '86s': 0.2,
        '76s': 0.6, '65s': 0.5, '54s': 0.4, '43s': 0.15,
        'KQo': 1, 'KJo': 0.7, 'KTo': 0.5, 'K9o': 0.2,
        'QJo': 0.6, 'QTo': 0.4,
        'JTo': 0.5, 'J9o': 0.2,
        'T9o': 0.3, '98o': 0.2, '87o': 0.15,
    },
};

// Vs 3-Bet calling/4-betting ranges (simplified)
const VS_3BET_RANGES = {
    UTG: {
        'AA': 1, 'KK': 1, 'QQ': 0.8, 'JJ': 0.5, 'AKs': 1, 'AKo': 0.8,
        'AQs': 0.7, 'AJs': 0.3, 'KQs': 0.3,
    },
    CO: {
        'AA': 1, 'KK': 1, 'QQ': 1, 'JJ': 0.8, 'TT': 0.5,
        'AKs': 1, 'AQs': 0.9, 'AJs': 0.6, 'ATs': 0.3,
        'AKo': 1, 'AQo': 0.6, 'AJo': 0.2,
        'KQs': 0.6, 'KJs': 0.3,
    },
    BTN: {
        'AA': 1, 'KK': 1, 'QQ': 1, 'JJ': 1, 'TT': 0.7, '99': 0.3,
        'AKs': 1, 'AQs': 1, 'AJs': 0.8, 'ATs': 0.5, 'A5s': 0.4,
        'AKo': 1, 'AQo': 0.8, 'AJo': 0.4,
        'KQs': 0.8, 'KJs': 0.5, 'KTs': 0.2,
        'QJs': 0.3, 'JTs': 0.2,
    },
    SB: {
        'AA': 1, 'KK': 1, 'QQ': 1, 'JJ': 0.7, 'TT': 0.4,
        'AKs': 1, 'AQs': 0.8, 'AJs': 0.5, 'ATs': 0.2,
        'AKo': 1, 'AQo': 0.5,
        'KQs': 0.5, 'KJs': 0.2,
    },
};

// BB Defense ranges vs open (simplified)
const BB_DEFENSE_RANGES = {
    vs_UTG: {
        'AA': 1, 'KK': 1, 'QQ': 1, 'JJ': 1, 'TT': 1, '99': 0.8, '88': 0.6, '77': 0.4, '66': 0.3, '55': 0.2,
        'AKs': 1, 'AQs': 1, 'AJs': 1, 'ATs': 0.8, 'A9s': 0.5, 'A8s': 0.3, 'A5s': 0.6, 'A4s': 0.4,
        'AKo': 1, 'AQo': 0.8, 'AJo': 0.5, 'ATo': 0.2,
        'KQs': 1, 'KJs': 0.8, 'KTs': 0.5, 'K9s': 0.2,
        'QJs': 0.8, 'QTs': 0.5,
        'JTs': 0.7, 'J9s': 0.3,
        'T9s': 0.5, '98s': 0.4, '87s': 0.3, '76s': 0.2,
    },
    vs_MP: {
        'AA': 1, 'KK': 1, 'QQ': 1, 'JJ': 1, 'TT': 1, '99': 0.9, '88': 0.7, '77': 0.5, '66': 0.35, '55': 0.25,
        'AKs': 1, 'AQs': 1, 'AJs': 1, 'ATs': 0.9, 'A9s': 0.6, 'A8s': 0.4, 'A5s': 0.7, 'A4s': 0.5, 'A3s': 0.2,
        'AKo': 1, 'AQo': 0.9, 'AJo': 0.6, 'ATo': 0.3,
        'KQs': 1, 'KJs': 0.9, 'KTs': 0.6, 'K9s': 0.3,
        'QJs': 0.9, 'QTs': 0.6, 'Q9s': 0.2,
        'JTs': 0.8, 'J9s': 0.4,
        'T9s': 0.6, '98s': 0.5, '87s': 0.35, '76s': 0.25, '65s': 0.15,
    },
    vs_HJ: {
        'AA': 1, 'KK': 1, 'QQ': 1, 'JJ': 1, 'TT': 1, '99': 0.95, '88': 0.8, '77': 0.6, '66': 0.45, '55': 0.3, '44': 0.15,
        'AKs': 1, 'AQs': 1, 'AJs': 1, 'ATs': 0.95, 'A9s': 0.7, 'A8s': 0.5, 'A7s': 0.2, 'A5s': 0.8, 'A4s': 0.6, 'A3s': 0.3,
        'AKo': 1, 'AQo': 1, 'AJo': 0.7, 'ATo': 0.4,
        'KQs': 1, 'KJs': 0.95, 'KTs': 0.7, 'K9s': 0.35, 'K8s': 0.1,
        'QJs': 0.95, 'QTs': 0.7, 'Q9s': 0.3,
        'JTs': 0.9, 'J9s': 0.5, 'J8s': 0.15,
        'T9s': 0.7, 'T8s': 0.3,
        '98s': 0.6, '87s': 0.45, '76s': 0.3, '65s': 0.2,
    },
    vs_CO: {
        'AA': 1, 'KK': 1, 'QQ': 1, 'JJ': 1, 'TT': 1, '99': 1, '88': 0.9, '77': 0.75, '66': 0.6, '55': 0.45, '44': 0.3, '33': 0.15,
        'AKs': 1, 'AQs': 1, 'AJs': 1, 'ATs': 1, 'A9s': 0.85, 'A8s': 0.6, 'A7s': 0.35, 'A6s': 0.15, 'A5s': 0.9, 'A4s': 0.75, 'A3s': 0.5, 'A2s': 0.25,
        'AKo': 1, 'AQo': 1, 'AJo': 0.85, 'ATo': 0.6, 'A9o': 0.3,
        'KQs': 1, 'KJs': 1, 'KTs': 0.85, 'K9s': 0.55, 'K8s': 0.25,
        'QJs': 1, 'QTs': 0.85, 'Q9s': 0.5, 'Q8s': 0.2,
        'JTs': 0.95, 'J9s': 0.65, 'J8s': 0.25,
        'T9s': 0.85, 'T8s': 0.45, 'T7s': 0.1,
        '98s': 0.75, '97s': 0.2, '87s': 0.6, '86s': 0.15,
        '76s': 0.5, '65s': 0.35, '54s': 0.25,
        'KQo': 0.8, 'KJo': 0.5, 'KTo': 0.2,
        'QJo': 0.4, 'QTo': 0.15,
        'JTo': 0.3,
    },
    vs_BTN: {
        'AA': 1, 'KK': 1, 'QQ': 1, 'JJ': 1, 'TT': 1, '99': 1, '88': 1, '77': 0.9, '66': 0.8, '55': 0.7, '44': 0.5, '33': 0.3, '22': 0.2,
        'AKs': 1, 'AQs': 1, 'AJs': 1, 'ATs': 1, 'A9s': 1, 'A8s': 0.8, 'A7s': 0.7, 'A6s': 0.5, 'A5s': 1, 'A4s': 0.9, 'A3s': 0.7, 'A2s': 0.5,
        'AKo': 1, 'AQo': 1, 'AJo': 1, 'ATo': 0.9, 'A9o': 0.6, 'A8o': 0.3,
        'KQs': 1, 'KJs': 1, 'KTs': 1, 'K9s': 0.9, 'K8s': 0.5, 'K7s': 0.3,
        'QJs': 1, 'QTs': 1, 'Q9s': 0.8, 'Q8s': 0.4, 'Q7s': 0.15,
        'JTs': 1, 'J9s': 0.9, 'J8s': 0.4, 'J7s': 0.1,
        'T9s': 1, 'T8s': 0.7, 'T7s': 0.2,
        '98s': 0.9, '97s': 0.4, '87s': 0.8, '86s': 0.3,
        '76s': 0.7, '75s': 0.2, '65s': 0.6, '54s': 0.5, '43s': 0.2,
        'KQo': 1, 'KJo': 0.8, 'KTo': 0.5, 'K9o': 0.2,
        'QJo': 0.7, 'QTo': 0.4, 'Q9o': 0.15,
        'JTo': 0.6, 'J9o': 0.2,
        'T9o': 0.4, '98o': 0.25, '87o': 0.15,
    },
    vs_SB: {
        'AA': 1, 'KK': 1, 'QQ': 1, 'JJ': 1, 'TT': 1, '99': 1, '88': 0.9, '77': 0.8, '66': 0.7, '55': 0.5, '44': 0.4, '33': 0.2,
        'AKs': 1, 'AQs': 1, 'AJs': 1, 'ATs': 1, 'A9s': 0.9, 'A8s': 0.7, 'A7s': 0.5, 'A6s': 0.3, 'A5s': 0.9, 'A4s': 0.8, 'A3s': 0.6, 'A2s': 0.4,
        'AKo': 1, 'AQo': 1, 'AJo': 0.9, 'ATo': 0.7, 'A9o': 0.4, 'A8o': 0.2,
        'KQs': 1, 'KJs': 1, 'KTs': 0.9, 'K9s': 0.7, 'K8s': 0.4, 'K7s': 0.2,
        'QJs': 1, 'QTs': 0.9, 'Q9s': 0.6, 'Q8s': 0.3,
        'JTs': 1, 'J9s': 0.7, 'J8s': 0.3,
        'T9s': 0.9, 'T8s': 0.5, 'T7s': 0.15,
        '98s': 0.7, '97s': 0.3, '87s': 0.6, '86s': 0.2,
        '76s': 0.5, '65s': 0.4, '54s': 0.3,
        'KQo': 0.9, 'KJo': 0.6, 'KTo': 0.3,
        'QJo': 0.5, 'QTo': 0.3,
        'JTo': 0.4, 'J9o': 0.15,
        'T9o': 0.3, '98o': 0.2,
    },
};

/**
 * Compute stats from a frequency map
 */
function computeRangeStats(freqMap) {
    const allHands = getAllHands();
    let totalCombos = 0;
    let pairCombos = 0;
    let suitedCombos = 0;
    let offsuitCombos = 0;
    let mixedHands = 0;
    let pureHands = 0;

    // Combos per hand type: pair=6, suited=4, offsuit=12
    allHands.forEach(hand => {
        const freq = freqMap[hand] || 0;
        if (freq <= 0) return;

        const isPair = hand.length === 2;
        const isSuited = hand.endsWith('s');

        const combos = isPair ? 6 : isSuited ? 4 : 12;
        const weightedCombos = combos * freq;

        totalCombos += weightedCombos;
        if (isPair) pairCombos += weightedCombos;
        else if (isSuited) suitedCombos += weightedCombos;
        else offsuitCombos += weightedCombos;

        if (freq >= 0.95) pureHands++;
        else if (freq > 0.05) mixedHands++;
    });

    const rfiPct = (totalCombos / 1326 * 100).toFixed(1);

    return {
        totalCombos: Math.round(totalCombos),
        maxCombos: 1326,
        rfiPct: parseFloat(rfiPct),
        pairCombos: Math.round(pairCombos),
        suitedCombos: Math.round(suitedCombos),
        offsuitCombos: Math.round(offsuitCombos),
        pureHands,
        mixedHands,
    };
}

export default async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ success: false, error: 'GET only' });
    }

    try {
        // Auth check
        const token = req.headers.authorization?.replace('Bearer ', '');
        if (!token) return res.status(401).json({ success: false, error: 'Auth required' });
        const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
        if (authErr || !user) return res.status(401).json({ success: false, error: 'Invalid token' });

        const {
            gameType = 'cash_6max',
            stackDepth = '100',
            position = 'BTN',
            scenario = 'rfi',
        } = req.query;

        const pos = position.toUpperCase();
        const allHands = getAllHands();
        let rangeData = {};
        let actions = [];
        let source = 'solver_derived';

        // ─── RFI Ranges ────────────────────────────────────────────────
        if (scenario === 'rfi') {
            const posRange = PREFLOP_RFI_RANGES[pos] || {};
            actions = ['Raise', 'Fold'];
            allHands.forEach(hand => {
                const raiseFreq = posRange[hand] || 0;
                rangeData[hand] = raiseFreq > 0
                    ? { 'Raise': Math.round(raiseFreq * 1000) / 10, 'Fold': Math.round((1 - raiseFreq) * 1000) / 10 }
                    : null;
            });
        }

        // ─── Vs 3-Bet ──────────────────────────────────────────────────
        else if (scenario === 'vs3bet') {
            const posRange = VS_3BET_RANGES[pos] || VS_3BET_RANGES['BTN'] || {};
            actions = ['4-Bet', 'Call', 'Fold'];
            allHands.forEach(hand => {
                const freq = posRange[hand] || 0;
                if (freq > 0) {
                    // High freq = 4-bet, medium = call, low = fold
                    const fourBetFreq = freq > 0.7 ? freq * 0.6 : freq * 0.3;
                    const callFreq = freq - fourBetFreq;
                    const foldFreq = 1 - freq;
                    rangeData[hand] = {
                        '4-Bet': Math.round(fourBetFreq * 1000) / 10,
                        'Call': Math.round(callFreq * 1000) / 10,
                        'Fold': Math.round(foldFreq * 1000) / 10,
                    };
                } else {
                    rangeData[hand] = null;
                }
            });
        }

        // ─── BB Defense ────────────────────────────────────────────────
        else if (scenario === 'bb_defense') {
            // BB defense varies by who opened
            const vsPos = pos === 'BB' ? 'vs_BTN' : `vs_${pos}`;
            const defenseRange = BB_DEFENSE_RANGES[vsPos] || BB_DEFENSE_RANGES['vs_BTN'] || {};
            actions = ['3-Bet', 'Call', 'Fold'];
            allHands.forEach(hand => {
                const freq = defenseRange[hand] || 0;
                if (freq > 0) {
                    const threeBetFreq = freq > 0.8 ? freq * 0.4 : freq * 0.15;
                    const callFreq = freq - threeBetFreq;
                    const foldFreq = 1 - freq;
                    rangeData[hand] = {
                        '3-Bet': Math.round(threeBetFreq * 1000) / 10,
                        'Call': Math.round(callFreq * 1000) / 10,
                        'Fold': Math.round(foldFreq * 1000) / 10,
                    };
                } else {
                    rangeData[hand] = null;
                }
            });
        }

        // ─── Push/Fold (Short Stack) ───────────────────────────────────
        else if (scenario === 'push_fold') {
            actions = ['Push', 'Fold'];
            const sd = parseInt(stackDepth) || 15;

            // Try loading from memory_charts_gold
            const { data: charts } = await supabase
                .from('memory_charts_gold')
                .select('hand_matrix, hero_position, stack_depth')
                .eq('hero_position', pos)
                .gte('stack_depth', sd - 3)
                .lte('stack_depth', sd + 3)
                .limit(1)
                .maybeSingle();

            if (charts?.hand_matrix) {
                const matrix = charts.hand_matrix;
                allHands.forEach(hand => {
                    const pushFreq = matrix[hand]?.push || 0;
                    rangeData[hand] = pushFreq > 0
                        ? { 'Push': Math.round(pushFreq * 1000) / 10, 'Fold': Math.round((1 - pushFreq) * 1000) / 10 }
                        : null;
                });
                source = 'memory_charts_gold';
            } else {
                // Fallback: generate simplified push/fold based on stack depth
                const pushThreshold = sd <= 8 ? 0.4 : sd <= 12 ? 0.3 : sd <= 15 ? 0.25 : 0.2;
                const rfiRange = PREFLOP_RFI_RANGES[pos] || {};
                allHands.forEach(hand => {
                    const rfiFreq = rfiRange[hand] || 0;
                    if (rfiFreq >= pushThreshold) {
                        rangeData[hand] = { 'Push': Math.round(rfiFreq * 1000) / 10, 'Fold': Math.round((1 - rfiFreq) * 1000) / 10 };
                    } else {
                        rangeData[hand] = null;
                    }
                });
                source = 'derived_from_rfi';
            }
        }

        // ─── Compute stats ─────────────────────────────────────────────
        const freqMap = {};
        allHands.forEach(hand => {
            if (rangeData[hand]) {
                const foldKey = Object.keys(rangeData[hand]).find(k => k === 'Fold');
                const foldPct = foldKey ? rangeData[hand][foldKey] : 0;
                freqMap[hand] = (100 - foldPct) / 100;
            }
        });

        const stats = computeRangeStats(freqMap);

        return res.status(200).json({
            success: true,
            range: {
                actions,
                gridData: rangeData,
                stats,
                position: pos,
                scenario,
                gameType,
                stackDepth: parseInt(stackDepth),
                source,
            },
        });

    } catch (err) {
        console.error('[PreflopRanges] Error:', err);
        return res.status(500).json({ success: false, error: err.message });
    }
}
