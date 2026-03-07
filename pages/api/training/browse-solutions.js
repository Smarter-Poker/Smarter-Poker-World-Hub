/**
 * API: Browse Solutions — Query solver data for the Solutions Browser
 * ═══════════════════════════════════════════════════════════════════════════
 * GET /api/training/browse-solutions
 * 
 * Query params:
 *   gameType: 'hu_cash' | 'mtt_6max_icm' | 'mtt_9max_icm' | 'postflop_complete' | 'turn_spin'
 *   stackDepth: number (e.g., 100)
 *   street: 'flop' | 'turn' | 'river' (default: flop)
 *   position: 'BTN' | 'SB' | 'BB' | etc (optional filter)
 *   spotId: string (optional — specific scenario_hash to load)
 *   page: number (default: 1)
 *   limit: number (default: 20, max: 50)
 * 
 * Returns:
 *   { spots: [...], total: number, page: number }
 *   Each spot: { id, scenario_hash, game_type, stack_depth, board, heroPosition, actions, handCount }
 *   If spotId is provided: full strategy_matrix with frequencies for all 1326 hands
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// Standard 13×13 hand matrix
const RANKS = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2'];

function getAllHandNotations() {
    const hands = [];
    for (let r = 0; r < 13; r++) {
        for (let c = 0; c < 13; c++) {
            if (r === c) hands.push(`${RANKS[r]}${RANKS[c]}`);         // Pairs
            else if (r < c) hands.push(`${RANKS[r]}${RANKS[c]}s`);    // Suited (above diagonal)
            else hands.push(`${RANKS[c]}${RANKS[r]}o`);               // Offsuit (below diagonal)
        }
    }
    return hands;
}

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

function extractPositionFromHash(hash) {
    if (!hash) return 'UNK';
    const parts = hash.split('_');
    const positions = ['UTG', 'UTG+1', 'MP', 'MP+1', 'HJ', 'CO', 'BTN', 'SB', 'BB'];
    for (const part of parts) {
        if (positions.includes(part.toUpperCase())) return part.toUpperCase();
    }
    return 'UNK';
}

export default async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ success: false, error: 'Method not allowed' });
    }

    try {
        const {
            gameType = 'hu_cash',
            stackDepth = '100',
            street = 'flop',
            position,
            spotId,
            page = '1',
            limit = '20',
        } = req.query;

        const pageNum = Math.max(1, parseInt(page) || 1);
        const limitNum = Math.min(50, Math.max(1, parseInt(limit) || 20));
        const offset = (pageNum - 1) * limitNum;

        // If requesting a specific spot's full data
        if (spotId) {
            const { data: spot, error } = await supabase
                .from('solved_spots_gold')
                .select('id, scenario_hash, game_type, stack_depth, strategy_matrix, hand_evs')
                .eq('id', spotId)
                .single();

            if (error || !spot) {
                return res.status(404).json({ success: false, error: 'Spot not found' });
            }

            const matrix = spot.strategy_matrix || {};
            const actions = matrix.actions || [];
            const frequencies = matrix.frequencies || {};

            // Build full 13×13 grid data for every hand
            const allHands = getAllHandNotations();
            const gridData = {};
            allHands.forEach(hand => {
                gridData[hand] = {};
                let hasData = false;
                actions.forEach(action => {
                    const freq = frequencies[action]?.[hand];
                    if (freq !== undefined && freq >= 0) {
                        gridData[hand][action] = Math.round(freq * 1000) / 10; // 0-100 with 1 decimal
                        hasData = true;
                    }
                });
                if (!hasData) {
                    gridData[hand] = null; // Hand not in range
                }
            });

            // Get EV data if available
            const handEVs = spot.hand_evs || {};

            // Calculate range equity from hand EVs and frequencies
            let heroEqSum = 0;
            let villainEqSum = 0;
            let eqCount = 0;
            const allHands2 = getAllHandNotations();
            allHands2.forEach(hand => {
                const ev = handEVs[hand];
                if (ev !== undefined && ev !== null && gridData[hand]) {
                    // Positive EV = Hero advantage, scale to 0-100 equity
                    const handEq = Math.max(0, Math.min(100, 50 + (ev * 2)));
                    heroEqSum += handEq;
                    villainEqSum += (100 - handEq);
                    eqCount++;
                }
            });
            const rangeEquity = eqCount > 0 ? {
                hero: Math.round((heroEqSum / eqCount) * 10) / 10,
                villain: Math.round((villainEqSum / eqCount) * 10) / 10,
            } : { hero: 50, villain: 50 };

            return res.status(200).json({
                success: true,
                spot: {
                    id: spot.id,
                    scenarioHash: spot.scenario_hash,
                    gameType: spot.game_type,
                    stackDepth: spot.stack_depth,
                    board: parseBoardFromHash(spot.scenario_hash),
                    heroPosition: extractPositionFromHash(spot.scenario_hash),
                    actions,
                    gridData,
                    handEVs,
                    handCount: Object.keys(gridData).filter(h => gridData[h] !== null).length,
                    rangeEquity,
                },
            });
        }

        // List spots with pagination
        let query = supabase
            .from('solved_spots_gold')
            .select('id, scenario_hash, game_type, stack_depth', { count: 'exact' })
            .eq('game_type', gameType)
            .eq('stack_depth', parseInt(stackDepth));

        // Filter by street (based on board card count in scenario_hash)
        // Flop = 3 cards (6 chars), Turn = 4 cards (8 chars), River = 5 cards (10 chars)
        if (position) {
            query = query.ilike('scenario_hash', `%_${position}_%`);
        }

        // Order and paginate
        query = query.order('scenario_hash', { ascending: true }).range(offset, offset + limitNum - 1);

        const { data: spots, error, count } = await query;

        if (error) {
            console.error('[BrowseSolutions] Query error:', error);
            return res.status(500).json({ success: false, error: 'Database query failed' });
        }

        // Enrich spots with parsed metadata (without heavy strategy_matrix)
        const enriched = (spots || []).map(s => ({
            id: s.id,
            scenarioHash: s.scenario_hash,
            gameType: s.game_type,
            stackDepth: s.stack_depth,
            board: parseBoardFromHash(s.scenario_hash),
            heroPosition: extractPositionFromHash(s.scenario_hash),
        }));

        return res.status(200).json({
            success: true,
            spots: enriched,
            total: count || 0,
            page: pageNum,
            limit: limitNum,
            totalPages: Math.ceil((count || 0) / limitNum),
        });

    } catch (err) {
        console.error('[BrowseSolutions] Error:', err);
        return res.status(500).json({ success: false, error: err.message });
    }
}
