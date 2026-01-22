/**
 * 🎮 GOD MODE ENGINE — Fetch Hand API
 * ═══════════════════════════════════════════════════════════════════════════
 * POST /api/god-mode/fetch-hand
 *
 * Fetches the next training hand from solved_spots_gold with suit isomorphism.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// Suit rotation mappings (cyclic permutations for isomorphism)
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

/**
 * Pick a random hand from the strategy matrix
 */
function pickRandomHand(strategyMatrix) {
    const hands = Object.keys(strategyMatrix);
    if (hands.length === 0) return null;
    return hands[Math.floor(Math.random() * hands.length)];
}

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { gameId, userId, currentLevel = 1 } = req.body;

        if (!gameId || !userId) {
            return res.status(400).json({ error: 'Missing gameId or userId' });
        }

        // 1. Get game configuration from game_registry
        let gameConfig = null;

        // Try by ID first
        const { data: gameById } = await supabase
            .from('game_registry')
            .select('*')
            .eq('id', gameId)
            .single();

        if (gameById) {
            gameConfig = gameById;
        } else {
            // Try by slug
            const { data: gameBySlug } = await supabase
                .from('game_registry')
                .select('*')
                .eq('slug', gameId)
                .single();

            if (gameBySlug) {
                gameConfig = gameBySlug;
            }
        }

        if (!gameConfig) {
            return res.status(404).json({ error: 'Game not found', gameId });
        }

        const engineType = gameConfig.engine_type;
        const config = gameConfig.config || {};

        // 2. Get user's seen scenarios
        const { data: seenHands } = await supabase
            .from('god_mode_hand_history')
            .select('source_file_id, variant_hash')
            .eq('user_id', userId)
            .eq('game_id', gameConfig.id);

        const seenSet = new Set(
            (seenHands || []).map(h => `${h.source_file_id}_${h.variant_hash}`)
        );

        // 3. Query solved_spots_gold based on game config
        if (engineType === 'PIO') {
            // Build query for solved_spots_gold
            let query = supabase.from('solved_spots_gold').select('*');

            // Filter by game_type (Cash, MTT, Spin)
            if (config.game_type) {
                query = query.eq('game_type', config.game_type);
            }

            // Filter by stack depth range
            if (config.stack_depth) {
                const depth = config.stack_depth;
                const range = config.stack_range || 10; // +/- range
                query = query.gte('stack_depth', depth - range).lte('stack_depth', depth + range);
            }

            // Filter by street
            if (config.street) {
                query = query.eq('street', config.street);
            }

            // Filter by position
            if (config.position) {
                query = query.ilike('scenario_hash', `%${config.position}%`);
            }

            // Filter by mode (ChipEV, ICM, PKO)
            if (config.mode) {
                query = query.eq('mode', config.mode);
            }

            // Limit results
            const { data: scenarios, error: queryError } = await query.limit(100);

            if (queryError) {
                console.error('Error querying solved_spots_gold:', queryError);
                return res.status(500).json({ error: 'Database query failed', details: queryError.message });
            }

            if (!scenarios || scenarios.length === 0) {
                return res.status(200).json({
                    hand: null,
                    message: 'No scenarios available for this game configuration',
                    debug: { engineType, config }
                });
            }

            // 4. Shuffle scenarios and find unseen one
            const shuffledScenarios = shuffle(scenarios);
            const rotations = shuffle([0, 1, 2, 3]);

            for (const scenario of shuffledScenarios) {
                const fileId = scenario.id || scenario.scenario_hash;

                for (const rotation of rotations) {
                    const variantHash = String(rotation);
                    const key = `${fileId}_${variantHash}`;

                    if (!seenSet.has(key)) {
                        // Pick a random hand from strategy matrix
                        const strategyMatrix = scenario.strategy_matrix || {};
                        const heroHandKey = pickRandomHand(strategyMatrix);

                        if (!heroHandKey) {
                            continue; // No hands in this scenario
                        }

                        const heroStrategy = strategyMatrix[heroHandKey];

                        // Parse board cards (stored as array or string)
                        const boardCards = Array.isArray(scenario.board_cards)
                            ? scenario.board_cards.join('')
                            : scenario.board_cards || '';

                        // Apply suit rotation for isomorphism
                        const hand = {
                            fileId,
                            variantHash,
                            scenario_hash: scenario.scenario_hash,
                            hero_hand: rotateSuits(heroHandKey, rotation),
                            board: rotateSuits(boardCards, rotation),
                            pot_size: scenario.macro_metrics?.pot_size || config.pot_size || 100,
                            hero_stack: scenario.stack_depth || config.stack_depth || 100,
                            villain_stack: scenario.stack_depth || config.stack_depth || 100,
                            hero_position: config.hero_position || 'BTN',
                            villain_position: config.villain_position || 'BB',
                            street: scenario.street || 'Flop',
                            action_history: scenario.action_history || [],
                            solver_node: {
                                actions: heroStrategy?.actions || {},
                                best_action: heroStrategy?.best_action,
                                max_ev: heroStrategy?.max_ev,
                                is_mixed: heroStrategy?.is_mixed
                            },
                            macro_metrics: scenario.macro_metrics
                        };

                        return res.status(200).json({
                            hand,
                            game: gameConfig,
                            engineType: 'PIO'
                        });
                    }
                }
            }

            // All scenarios exhausted
            return res.status(200).json({
                hand: null,
                message: 'All scenarios exhausted for this game. Great job completing them all!'
            });

        } else if (engineType === 'CHART') {
            // CHART engine - generate from static charts
            const candidates = generateChartHands(config);
            const shuffled = shuffle(candidates);
            const rotations = shuffle([0, 1, 2, 3]);

            for (const candidate of shuffled) {
                const fileId = candidate.id;

                for (const rotation of rotations) {
                    const variantHash = String(rotation);
                    const key = `${fileId}_${variantHash}`;

                    if (!seenSet.has(key)) {
                        const hand = {
                            fileId,
                            variantHash,
                            hero_hand: rotateSuits(candidate.hero_hand, rotation),
                            board: '',
                            pot_size: candidate.pot_size,
                            hero_stack: candidate.hero_stack,
                            villain_stack: candidate.villain_stack,
                            hero_position: candidate.position,
                            villain_position: getVillainPosition(candidate.position),
                            street: 'preflop',
                            action_history: [],
                            solver_node: candidate.solver_node
                        };

                        return res.status(200).json({
                            hand,
                            game: gameConfig,
                            engineType: 'CHART'
                        });
                    }
                }
            }

            return res.status(200).json({
                hand: null,
                message: 'All chart scenarios exhausted'
            });

        } else if (engineType === 'SCENARIO') {
            // SCENARIO engine - mental game drills
            const scenarios = getScenarios(config.scenario_type);
            const shuffled = shuffle(scenarios);

            for (const scenario of shuffled) {
                const key = `${scenario.id}_0`;
                if (!seenSet.has(key)) {
                    return res.status(200).json({
                        hand: scenario,
                        game: gameConfig,
                        engineType: 'SCENARIO'
                    });
                }
            }

            return res.status(200).json({
                hand: null,
                message: 'All mental game scenarios exhausted'
            });
        }

        return res.status(400).json({ error: `Unknown engine type: ${engineType}` });

    } catch (error) {
        console.error('Fetch hand error:', error);
        return res.status(500).json({ error: 'Internal server error', details: error.message });
    }
}

/**
 * Get villain position based on hero position
 */
function getVillainPosition(heroPosition) {
    const positions = {
        'BTN': 'BB',
        'CO': 'BTN',
        'HJ': 'CO',
        'LJ': 'HJ',
        'SB': 'BB',
        'BB': 'SB'
    };
    return positions[heroPosition] || 'BB';
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
    const premiumHands = ['AA', 'KK', 'QQ', 'JJ', 'TT', 'AKs', 'AQs', 'AKo'];
    const goodHands = ['99', '88', '77', 'AJs', 'ATs', 'AQo', 'AJo', 'KQs', 'KJs'];

    if (stackDepth <= 15) {
        if (premiumHands.includes(hand)) {
            return { allin: { frequency: 1.0, ev: 15 }, fold: { frequency: 0, ev: 0 } };
        } else if (goodHands.includes(hand) && ['BTN', 'CO', 'SB'].includes(position)) {
            return { allin: { frequency: 0.7, ev: 8 }, fold: { frequency: 0.3, ev: 0 } };
        } else {
            return { fold: { frequency: 1.0, ev: 0 }, allin: { frequency: 0, ev: -5 } };
        }
    }

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
                action_history: ['Hero raises', 'Villain 3-bets', 'Hero 4-bets all-in', 'Villain calls'],
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
                action_history: ['Villain bets 50%'],
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
