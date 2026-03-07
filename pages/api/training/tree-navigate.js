/**
 * API: Tree Navigate — Game Tree Traversal for the Solutions Browser
 * ═══════════════════════════════════════════════════════════════════════════
 * GET /api/training/tree-navigate
 *
 * Query params:
 *   scenarioHash: current scenario hash (e.g., 'hu_cash_BTN_100bb_7h8h2c')
 *   nextCard: the turn/river card to navigate to (e.g., 'Td')
 *   gameType: game type filter
 *   stackDepth: stack depth filter
 *
 * Returns:
 *   { success, childSpot: { id, scenarioHash, board, gridData, actions, handEVs, handCount }, siblings }
 *   siblings: list of other available runout cards that have solver data
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

const RANKS_GRID = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2'];

function getAllHandNotations() {
    const hands = [];
    for (let r = 0; r < 13; r++) {
        for (let c = 0; c < 13; c++) {
            if (r === c) hands.push(`${RANKS_GRID[r]}${RANKS_GRID[c]}`);
            else if (r < c) hands.push(`${RANKS_GRID[r]}${RANKS_GRID[c]}s`);
            else hands.push(`${RANKS_GRID[c]}${RANKS_GRID[r]}o`);
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
        const { scenarioHash, nextCard, gameType, stackDepth } = req.query;

        if (!scenarioHash) {
            return res.status(400).json({ success: false, error: 'scenarioHash is required' });
        }

        // ─── STRATEGY 1: Exact hash extension ──────────────────────────
        // If nextCard is provided, append it to the current board in the hash
        // to find the child node for the next street.
        if (nextCard) {
            const cardStr = nextCard.toLowerCase();
            // Build the child hash by appending the card to the parent hash
            const childHash = `${scenarioHash}${cardStr}`;

            // Try exact match first
            let { data: childSpot, error } = await supabase
                .from('solved_spots_gold')
                .select('id, scenario_hash, game_type, stack_depth, strategy_matrix, hand_evs')
                .eq('scenario_hash', childHash)
                .single();

            // If exact match fails, try with appended card directly to the board part
            if (!childSpot) {
                // Some hashes might have different separators or formats
                // Try the child hash with underscore separation in case board is a separate segment
                const hashParts = scenarioHash.split('_');
                const boardSegment = hashParts[hashParts.length - 1];
                const prefix = hashParts.slice(0, -1).join('_');
                const altChildHash = `${prefix}_${boardSegment}${cardStr}`;

                const { data: altSpots } = await supabase
                    .from('solved_spots_gold')
                    .select('id, scenario_hash, game_type, stack_depth, strategy_matrix, hand_evs')
                    .eq('scenario_hash', altChildHash)
                    .limit(1);
                childSpot = altSpots?.[0] || null;
            }

            if (childSpot) {
                const matrix = childSpot.strategy_matrix || {};
                const actions = matrix.actions || [];
                const frequencies = matrix.frequencies || {};
                const allHands = getAllHandNotations();
                const gridData = {};

                allHands.forEach(hand => {
                    gridData[hand] = {};
                    let hasData = false;
                    actions.forEach(action => {
                        const freq = frequencies[action]?.[hand];
                        if (freq !== undefined && freq >= 0) {
                            gridData[hand][action] = Math.round(freq * 1000) / 10;
                            hasData = true;
                        }
                    });
                    if (!hasData) gridData[hand] = null;
                });

                return res.status(200).json({
                    success: true,
                    childSpot: {
                        id: childSpot.id,
                        scenarioHash: childSpot.scenario_hash,
                        gameType: childSpot.game_type,
                        stackDepth: childSpot.stack_depth,
                        board: parseBoardFromHash(childSpot.scenario_hash),
                        heroPosition: extractPositionFromHash(childSpot.scenario_hash),
                        actions,
                        gridData,
                        handEVs: childSpot.hand_evs || {},
                        handCount: Object.keys(gridData).filter(h => gridData[h] !== null).length,
                    },
                });
            }

            // No child found
            return res.status(200).json({
                success: false,
                error: 'No solver data found for this runout card',
                queriedHash: childHash,
            });
        }

        // ─── STRATEGY 2: List available children ────────────────────────
        // Without nextCard, find all possible child nodes (next street extensions).
        // This powers the Card Selector Modal by showing which cards have data.
        const currentBoard = parseBoardFromHash(scenarioHash);
        const boardStr = currentBoard.join('').toLowerCase();

        // Query all spots that have the same hash prefix with exactly 2 more chars (1 card)
        const { data: childSpots, error } = await supabase
            .from('solved_spots_gold')
            .select('scenario_hash')
            .ilike('scenario_hash', `${scenarioHash}__`)
            .limit(100);

        if (error) {
            console.error('[TreeNavigate] Children query error:', error);
            return res.status(500).json({ success: false, error: 'Query failed' });
        }

        // Extract the unique next cards from child hashes
        const availableCards = new Set();
        (childSpots || []).forEach(s => {
            const childBoard = parseBoardFromHash(s.scenario_hash);
            if (childBoard.length > currentBoard.length) {
                const nextCard = childBoard[currentBoard.length];
                if (nextCard) availableCards.add(nextCard);
            }
        });

        return res.status(200).json({
            success: true,
            currentBoard,
            availableCards: [...availableCards],
            childCount: availableCards.size,
        });

    } catch (err) {
        console.error('[TreeNavigate] Error:', err);
        return res.status(500).json({ success: false, error: err.message });
    }
}
