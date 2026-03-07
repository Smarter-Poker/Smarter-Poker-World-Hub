/**
 * API: Runout Report — Turn/River EV Impact Analysis
 * ═══════════════════════════════════════════════════════════════════════════
 * GET /api/training/runout-report
 *
 * Query params:
 *   scenarioHash: current scenario hash (the Flop/Turn node)
 *   gameType: game type (optional extra filter)
 *   stackDepth: stack depth (optional extra filter)
 *
 * Returns:
 *   { success, runouts: [{ card, ev_delta, eq_shift, has_data }] }
 *   Covers all 52 cards — 49 non-dead (3 on flop, or 4 on turn).
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { createClient } from '../../../src/lib/supabaseServerClient';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

const RANKS = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2'];
const SUITS = ['s', 'h', 'd', 'c'];

function parseBoardFromHash(hash) {
    if (!hash) return [];
    const parts = hash.split('_');
    const lastPart = parts[parts.length - 1];
    if (!lastPart || lastPart.length < 4) return [];
    const cards = [];
    for (let i = 0; i < lastPart.length - 1; i += 2) {
        const rank = lastPart[i];
        const suit = lastPart[i + 1];
        if (/[2-9TJQKAtjqka]/.test(rank) && /[shdc]/.test(suit)) {
            cards.push(`${rank}${suit}`);
        }
    }
    return cards;
}

/**
 * Calculate aggregate "strategy aggression" as a proxy for EV
 * when hand_evs is not available. Higher raise/bet frequency = higher EV spot for IP player.
 */
function calculateAggressionIndex(strategyMatrix) {
    if (!strategyMatrix) return 0;
    const actions = strategyMatrix.actions || [];
    const frequencies = strategyMatrix.frequencies || {};

    let totalBetRaise = 0;
    let totalCheckCall = 0;
    let totalFold = 0;
    let handCount = 0;

    for (const action of actions) {
        const freqs = frequencies[action] || {};
        const actionLower = action.toLowerCase();
        const isBetRaise = actionLower.includes('r') || actionLower.includes('b') || actionLower === 'allin';
        const isFold = actionLower.includes('f');

        for (const [hand, freq] of Object.entries(freqs)) {
            if (freq > 0) {
                if (isBetRaise) totalBetRaise += freq;
                else if (isFold) totalFold += freq;
                else totalCheckCall += freq;
                handCount++;
            }
        }
    }

    // Aggression index: (bet+raise) - fold as a EV proxy
    const total = totalBetRaise + totalCheckCall + totalFold;
    if (total === 0) return 0;
    return ((totalBetRaise - totalFold) / total) * 100;
}

export default async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ success: false, error: 'Method not allowed' });
    }

    try {
        const { scenarioHash } = req.query;

        if (!scenarioHash) {
            return res.status(400).json({ success: false, error: 'scenarioHash is required' });
        }

        // Parse current board from hash
        const currentBoard = parseBoardFromHash(scenarioHash);
        const deadSet = new Set(currentBoard.map(c => c.toLowerCase()));

        // Build all 52 cards
        const allCards = [];
        for (const rank of RANKS) {
            for (const suit of SUITS) {
                allCards.push(`${rank}${suit}`);
            }
        }

        // Get current spot's aggression index as baseline
        const { data: currentSpot } = await supabase
            .from('solved_spots_gold')
            .select('strategy_matrix')
            .eq('scenario_hash', scenarioHash)
            .maybeSingle();

        const baselineAggression = currentSpot
            ? calculateAggressionIndex(currentSpot.strategy_matrix)
            : 0;

        // Query all child spots for possible runout cards
        // A child has the same scenario_hash but with 2 more characters (one more card)
        // Use the full current hash + 2 wildcard chars for precision

        const { data: childSpots, error } = await supabase
            .from('solved_spots_gold')
            .select('scenario_hash, strategy_matrix, hand_evs')
            .ilike('scenario_hash', `${scenarioHash}__`)
            .limit(200);

        if (error) {
            console.error('[RunoutReport] Query error:', error);
            return res.status(500).json({ success: false, error: 'Database query failed' });
        }

        // Build a map of next-card → child spot data
        const childMap = {};
        (childSpots || []).forEach(spot => {
            const childBoard = parseBoardFromHash(spot.scenario_hash);
            // Only consider spots that are exactly 1 card deeper
            if (childBoard.length === currentBoard.length + 1) {
                const nextCard = childBoard[currentBoard.length];
                if (nextCard) {
                    const childAggression = calculateAggressionIndex(spot.strategy_matrix);
                    childMap[nextCard.toLowerCase()] = {
                        aggression: childAggression,
                        ev_delta: childAggression - baselineAggression,
                        handEvs: spot.hand_evs,
                    };
                }
            }
        });

        // Build the runout report for all 52 cards
        const runouts = {};
        allCards.forEach(card => {
            const key = card.toLowerCase();
            const isDead = deadSet.has(key);
            const childData = childMap[key];

            runouts[card] = {
                card,
                is_dead: isDead,
                has_data: !isDead && !!childData,
                ev_delta: childData?.ev_delta ?? null,
                eq_shift: childData?.ev_delta ? (childData.ev_delta > 0 ? 'positive' : 'negative') : null,
            };
        });

        return res.status(200).json({
            success: true,
            runouts,
            currentBoard,
            childrenFound: Object.keys(childMap).length,
            baselineAggression: Math.round(baselineAggression * 100) / 100,
        });

    } catch (err) {
        console.error('[RunoutReport] Error:', err);
        return res.status(500).json({ success: false, error: err.message });
    }
}
