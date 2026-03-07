/**
 * API: Grade Range — Compare user-constructed range to GTO solution
 * ═══════════════════════════════════════════════════════════════════════════
 * POST /api/training/grade-range
 *
 * Body:
 *   {
 *     gameType: 'cash_6max',
 *     stackDepth: 100,
 *     position: 'BTN',
 *     scenario: 'rfi',
 *     selectedHands: ['AA', 'AKs', 'AKo', ...]  // Hands the user selected
 *   }
 *
 * Returns:
 *   {
 *     success: true,
 *     grade: { letter: 'B+', score: 82, accuracy: 82.5 },
 *     diff: {
 *       correct: ['AA', 'KK', ...],       // User included, GTO also includes
 *       missed: ['A5s', ...],              // GTO includes but user didn't
 *       wrong: ['T7o', ...],               // User included but GTO doesn't
 *       mixed: { hand: { userIncluded, gtoFreq } }
 *     },
 *     stats: { totalGTOCombos, userCombos, overlapCombos }
 *   }
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

function getCombos(hand) {
    if (hand.length === 2) return 6;       // Pair
    if (hand.endsWith('s')) return 4;       // Suited
    return 12;                              // Offsuit
}

// ═══════════════════════════════════════════════════════════════════════════
// GTO RANGES (shared with preflop-ranges.js — in production these would
// come from a shared module, but duplicating here avoids circular deps)
// ═══════════════════════════════════════════════════════════════════════════
const GTO_RFI = {
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

/**
 * Calculate letter grade from numeric score
 */
function getLetterGrade(score) {
    if (score >= 97) return 'A+';
    if (score >= 93) return 'A';
    if (score >= 90) return 'A-';
    if (score >= 87) return 'B+';
    if (score >= 83) return 'B';
    if (score >= 80) return 'B-';
    if (score >= 77) return 'C+';
    if (score >= 73) return 'C';
    if (score >= 70) return 'C-';
    if (score >= 67) return 'D+';
    if (score >= 63) return 'D';
    if (score >= 60) return 'D-';
    return 'F';
}

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ success: false, error: 'POST only' });
    }

    try {
        // Auth check
        const token = req.headers.authorization?.replace('Bearer ', '');
        if (!token) return res.status(401).json({ success: false, error: 'Auth required' });
        const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
        if (authErr || !user) return res.status(401).json({ success: false, error: 'Invalid token' });

        const { position = 'BTN', scenario = 'rfi', selectedHands = [] } = req.body;

        if (!Array.isArray(selectedHands)) {
            return res.status(400).json({ success: false, error: 'selectedHands must be an array' });
        }

        const pos = position.toUpperCase();
        const gtoRange = GTO_RFI[pos] || GTO_RFI['BTN'];
        const allHands = getAllHands();
        const userSet = new Set(selectedHands.map(h => h.toUpperCase ? h : h));

        // ─── Classify each hand ────────────────────────────────────────
        const correct = [];    // User included, GTO freq >= 0.5
        const missed = [];     // GTO freq >= 0.5, user didn't include
        const wrong = [];      // User included, GTO freq < 0.1 (definitely not in range)
        const mixed = {};      // User included but GTO has partial frequency

        let totalGTOCombos = 0;
        let userCombos = 0;
        let overlapCombos = 0;
        let weightedScore = 0;
        let totalWeight = 0;

        allHands.forEach(hand => {
            const gtoFreq = gtoRange[hand] || 0;
            const userIncluded = userSet.has(hand);
            const combos = getCombos(hand);

            if (gtoFreq >= 0.5) totalGTOCombos += combos;
            if (userIncluded) userCombos += combos;

            // Weight by combos — offsuit hands (12 combos) matter more
            const weight = combos;
            totalWeight += weight;

            if (userIncluded && gtoFreq >= 0.5) {
                // Correct: user included a hand that GTO includes
                correct.push(hand);
                overlapCombos += combos;
                weightedScore += weight * 1.0;
            } else if (!userIncluded && gtoFreq < 0.1) {
                // Correct: user correctly excluded a hand GTO doesn't play
                weightedScore += weight * 1.0;
            } else if (userIncluded && gtoFreq < 0.1) {
                // Wrong: user included a hand that's clearly not in GTO range
                wrong.push(hand);
                weightedScore += weight * 0;
            } else if (!userIncluded && gtoFreq >= 0.5) {
                // Missed: user forgot a hand that's in GTO range
                missed.push(hand);
                weightedScore += weight * 0;
            } else if (userIncluded && gtoFreq >= 0.1 && gtoFreq < 0.5) {
                // Partially correct: user included a mixed hand (GTO plays it sometimes)
                mixed[hand] = { userIncluded: true, gtoFreq };
                weightedScore += weight * gtoFreq; // Partial credit
            } else if (!userIncluded && gtoFreq >= 0.1 && gtoFreq < 0.5) {
                // Partially correct: user excluded a mixed hand (acceptable)
                mixed[hand] = { userIncluded: false, gtoFreq };
                weightedScore += weight * (1 - gtoFreq); // Partial credit for not including
            }
        });

        const score = totalWeight > 0 ? Math.round(weightedScore / totalWeight * 100) : 0;
        const accuracy = totalGTOCombos > 0 ? Math.round(overlapCombos / totalGTOCombos * 1000) / 10 : 0;

        // Build grid diff for visual display
        const gridDiff = {};
        allHands.forEach(hand => {
            const gtoFreq = gtoRange[hand] || 0;
            const userIncluded = userSet.has(hand);

            if (userIncluded && gtoFreq >= 0.5) {
                gridDiff[hand] = 'correct';     // Green
            } else if (userIncluded && gtoFreq < 0.1) {
                gridDiff[hand] = 'wrong';        // Red
            } else if (!userIncluded && gtoFreq >= 0.5) {
                gridDiff[hand] = 'missed';       // Yellow
            } else if (userIncluded && gtoFreq >= 0.1) {
                gridDiff[hand] = 'partial';      // Orange (mixed)
            } else {
                gridDiff[hand] = 'neutral';      // Gray (correctly excluded)
            }
        });

        return res.status(200).json({
            success: true,
            grade: {
                letter: getLetterGrade(score),
                score,
                accuracy,
            },
            diff: {
                correct,
                missed,
                wrong,
                mixed,
                gridDiff,
            },
            stats: {
                totalGTOCombos,
                userCombos,
                overlapCombos,
                totalHands: allHands.length,
                correctCount: correct.length,
                missedCount: missed.length,
                wrongCount: wrong.length,
                mixedCount: Object.keys(mixed).length,
            },
        });

    } catch (err) {
        console.error('[GradeRange] Error:', err);
        return res.status(500).json({ success: false, error: err.message });
    }
}
