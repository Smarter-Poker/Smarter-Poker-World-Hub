/**
 * 🎮 GOD MODE ENGINE — Fetch Hand API
 * ═══════════════════════════════════════════════════════════════════════════
 * POST /api/god-mode/fetch-hand
 * 
 * Fetches the next training hand for a user with suit isomorphism applied.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// Suit rotation mappings (cyclic permutations)
const SUIT_ROTATIONS = {
    0: { s: 's', h: 'h', d: 'd', c: 'c' }, // Identity
    1: { s: 'h', h: 'd', d: 'c', c: 's' }, // Rotate +1
    2: { s: 'd', h: 'c', d: 's', c: 'h' }, // Rotate +2
    3: { s: 'c', h: 's', d: 'h', c: 'd' }, // Rotate +3
};

/**
 * Apply suit rotation to a card string
 */
function rotateSuits(cards, rotationKey) {
    if (!cards) return cards;
    const suitMap = SUIT_ROTATIONS[rotationKey];
    let result = '';

    for (let i = 0; i < cards.length; i++) {
        const char = cards[i];
        if (suitMap[char]) {
            result += suitMap[char];
        } else {
            result += char;
        }
    }

    return result;
}

/**
 * Fisher-Yates shuffle
 */
function shuffle(array) {
    const result = [...array];
    for (let i = result.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
}

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { gameId, userId } = req.body;

        if (!gameId || !userId) {
            return res.status(400).json({ error: 'Missing gameId or userId' });
        }

        // 1. Get game configuration
        const { data: gameConfig, error: gameError } = await supabase
            .from('game_registry')
            .select('*')
            .eq('id', gameId)
            .single();

        if (gameError || !gameConfig) {
            // Try by slug
            const { data: gameBySlug } = await supabase
                .from('game_registry')
                .select('*')
                .eq('slug', gameId)
                .single();

            if (!gameBySlug) {
                return res.status(404).json({ error: 'Game not found' });
            }

            Object.assign(gameConfig || {}, gameBySlug);
        }

        // 2. Get user's seen hands
        const { data: seenHands } = await supabase
            .from('god_mode_hand_history')
            .select('source_file_id, variant_hash')
            .eq('user_id', userId)
            .eq('game_id', gameId);

        const seenSet = new Set(
            (seenHands || []).map(h => `${h.source_file_id}_${h.variant_hash}`)
        );

        // 3. Fetch candidate hands based on engine type
        let candidates = [];
        const engineType = gameConfig.engine_type;
        const config = gameConfig.config || {};

        if (engineType === 'PIO') {
            // Query solved_spots_gold
            let query = supabase.from('solved_spots_gold').select('*');

            if (config.stack_depth) {
                const depth = config.stack_depth;
                query = query.gte('effective_stack', depth - 20).lte('effective_stack', depth + 20);
            }

            if (config.street) {
                query = query.eq('street', config.street);
            }

            const { data } = await query.limit(200);
            candidates = data || [];

        } else if (engineType === 'CHART') {
            // Generate from static charts
            candidates = generateChartHands(config);

        } else if (engineType === 'SCENARIO') {
            // Load scripted scenarios
            candidates = getScenarios(config.scenario_type);
        }

        // 4. Shuffle and find unseen hand + rotation
        candidates = shuffle(candidates);
        const rotations = shuffle([0, 1, 2, 3]);

        for (const candidate of candidates) {
            const fileId = candidate.id || candidate.file_id;

            for (const rotation of rotations) {
                const variantHash = String(rotation);
                const key = `${fileId}_${variantHash}`;

                if (!seenSet.has(key)) {
                    // Apply suit rotation
                    const hand = {
                        fileId,
                        variantHash,
                        heroHand: rotateSuits(candidate.hero_hand, rotation),
                        board: rotateSuits(candidate.board, rotation),
                        potSize: candidate.pot_size || 100,
                        heroStack: candidate.hero_stack || config.stack_depth || 100,
                        villainStack: candidate.villain_stack || config.stack_depth || 100,
                        position: candidate.position || 'BTN',
                        street: candidate.street || 'flop',
                        actionHistory: candidate.action_history || [],
                        solverNode: candidate.solver_node || candidate.strategy || {},
                    };

                    return res.status(200).json({ hand, game: gameConfig });
                }
            }
        }

        // No hands available
        return res.status(200).json({
            hand: null,
            message: 'All hands exhausted for this game'
        });

    } catch (error) {
        console.error('Fetch hand error:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
}

/**
 * Generate hands from static charts for CHART engine
 */
function generateChartHands(config) {
    const hands = [];
    const allHands = [
        'AA', 'KK', 'QQ', 'JJ', 'TT', '99', '88', '77', '66', '55', '44', '33', '22',
        'AKs', 'AQs', 'AJs', 'ATs', 'A9s', 'A8s', 'A7s', 'A6s', 'A5s', 'A4s', 'A3s', 'A2s',
        'AKo', 'AQo', 'AJo', 'ATo', 'A9o', 'A8o', 'A7o', 'A6o', 'A5o', 'A4o', 'A3o', 'A2o',
        'KQs', 'KJs', 'KTs', 'K9s', 'K8s', 'K7s', 'K6s', 'K5s', 'K4s', 'K3s', 'K2s',
        'KQo', 'KJo', 'KTo', 'K9o', 'K8o', 'K7o',
        'QJs', 'QTs', 'Q9s', 'Q8s', 'Q7s', 'Q6s', 'Q5s',
        'QJo', 'QTo', 'Q9o',
        'JTs', 'J9s', 'J8s', 'J7s',
        'JTo', 'J9o',
        'T9s', 'T8s', 'T7s',
        'T9o',
        '98s', '97s', '96s',
        '87s', '86s',
        '76s', '75s',
        '65s', '64s',
        '54s', '53s',
        '43s',
    ];

    const positions = config.position_filter || ['BTN', 'CO', 'HJ', 'LJ', 'SB', 'BB'];

    for (const hand of allHands) {
        for (const position of positions) {
            hands.push({
                id: `chart_${hand}_${position}`,
                hero_hand: convertToCards(hand),
                board: '',
                pot_size: 2.5,
                hero_stack: config.stack_depth || 20,
                villain_stack: config.stack_depth || 20,
                position,
                street: 'preflop',
                action_history: [],
                solver_node: {
                    actions: getChartAction(hand, position, config.stack_depth || 20)
                }
            });
        }
    }

    return hands;
}

/**
 * Convert hand notation to card string
 */
function convertToCards(hand) {
    const ranks = { A: 'A', K: 'K', Q: 'Q', J: 'J', T: 'T', '9': '9', '8': '8', '7': '7', '6': '6', '5': '5', '4': '4', '3': '3', '2': '2' };

    if (hand.length === 2) {
        // Pocket pair
        return `${hand[0]}h${hand[1]}s`;
    } else if (hand.endsWith('s')) {
        // Suited
        return `${hand[0]}h${hand[1]}h`;
    } else {
        // Offsuit
        return `${hand[0]}h${hand[1]}s`;
    }
}

/**
 * Get chart action for a hand/position
 */
function getChartAction(hand, position, stackDepth) {
    // Simplified push/fold chart for short stacks
    const premiumHands = ['AA', 'KK', 'QQ', 'JJ', 'TT', 'AKs', 'AQs', 'AKo'];
    const goodHands = ['99', '88', '77', 'AJs', 'ATs', 'AQo', 'AJo', 'KQs', 'KJs'];

    if (stackDepth <= 15) {
        // Push/fold mode
        if (premiumHands.includes(hand)) {
            return { allin: { frequency: 1.0, ev: 15 }, fold: { frequency: 0, ev: 0 } };
        } else if (goodHands.includes(hand) && ['BTN', 'CO', 'SB'].includes(position)) {
            return { allin: { frequency: 0.7, ev: 8 }, fold: { frequency: 0.3, ev: 0 } };
        } else {
            return { fold: { frequency: 1.0, ev: 0 }, allin: { frequency: 0, ev: -5 } };
        }
    }

    // Standard open ranges
    if (premiumHands.includes(hand)) {
        return { raise: { frequency: 1.0, ev: 5 }, fold: { frequency: 0, ev: 0 } };
    }

    return { fold: { frequency: 0.6, ev: 0 }, raise: { frequency: 0.4, ev: 1 } };
}

/**
 * Get scripted scenarios for SCENARIO engine
 */
function getScenarios(scenarioType) {
    const scenarios = {
        bad_beat: [
            {
                id: 'bb_001',
                hero_hand: 'AhAs',
                board: 'Ad7c2s8h9h',
                pot_size: 200,
                hero_stack: 0,
                villain_stack: 0,
                position: 'BTN',
                street: 'river',
                action_history: ['Hero:raises', 'Villain:3-bets', 'Hero:4-bets all-in', 'Villain:calls'],
                solver_node: { correct_response: 'stay_calm' }
            },
            {
                id: 'bb_002',
                hero_hand: 'KhKd',
                board: 'Kc4s2d5c7c',
                pot_size: 150,
                hero_stack: 0,
                villain_stack: 0,
                position: 'CO',
                street: 'river',
                action_history: ['Hero:raises', 'Villain:calls', 'Hero:bets', 'Villain:raises all-in', 'Hero:calls'],
                solver_node: { correct_response: 'stay_calm' }
            },
        ],
        tilt_test: [
            {
                id: 'tt_001',
                hero_hand: 'QhQd',
                board: 'AhKs3c',
                pot_size: 50,
                hero_stack: 100,
                villain_stack: 100,
                position: 'BTN',
                street: 'flop',
                action_history: ['Villain:bets 50%'],
                solver_node: {
                    actions: {
                        fold: { frequency: 0.4, ev: 0 },
                        call: { frequency: 0.5, ev: 5 },
                        raise: { frequency: 0.1, ev: 3 }
                    }
                }
            },
        ]
    };

    return scenarios[scenarioType] || scenarios.bad_beat;
}
