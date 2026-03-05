/**
 * GET /api/training/get-question
 * Fetches next question for a training game session
 * 
 * Query params:
 * - gameId: Game identifier
 * - userId: User ID (for no-repeat tracking)
 * - level: Current level (1-10)
 * - engineType: PIO | CHART | SCENARIO
 */

import { createClient } from '@supabase/supabase-js';
import { getGrokClient } from '../../../src/lib/grokClient';
import TRAINING_CONFIG from '../../../src/config/trainingConfig';
import { getGameConfig, getStackDepthNumber } from '../../../src/config/gameConfigs';
import { pioQueryService } from '../../../src/services/PIOQueryService';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export default async function handler(req, res) {
  if (!applyRateLimit(req, res, LIMITS.read)) return;

    // BUG #245 FIX: Require JWT auth
    const _token = req.headers.authorization?.replace('Bearer ', '');
    if (!_token) return res.status(401).json({ error: 'Auth required' });
    const { data: { user: _authUser }, error: _authErr } = await supabase.auth.getUser(_token);
    if (_authErr || !_authUser) return res.status(401).json({ error: 'Invalid token' });

    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { gameId, userId, level = 1, engineType = 'PIO' } = req.query;

    if (!gameId) {
        return res.status(400).json({ error: 'gameId required' });
    }

    try {
        // ═══════════════════════════════════════════════════════════════════
        // STEP 1: GET COMPREHENSIVE GAME CONFIGURATION
        // ═══════════════════════════════════════════════════════════════════
        const TRAINING_LIBRARY = require('../../../src/data/TRAINING_LIBRARY').default;
        const game = TRAINING_LIBRARY.find(g => g.id === gameId);

        if (!game) {
            return res.status(404).json({ error: 'Game not found' });
        }

        // Get comprehensive game configuration
        const gameConfig = getGameConfig(gameId);
        const gameType = gameConfig.gameType; // 'cash', 'tournament', or 'sng'
        const playerCount = gameConfig.players; // 2, 3, 6, or 9
        const gameFormat = gameConfig.format; // "Heads-Up Cash", "6-Max Cash", etc.
        const stackDepth = getStackDepthNumber(gameConfig.stackDepth); // Numeric BB
        const preferredEngine = gameConfig.engine; // 'PIO', 'CHART', or 'SCENARIO'


        // ═══════════════════════════════════════════════════════════════════
        // STEP 2: GET SEEN QUESTIONS (No-Repeat Logic)
        // ═══════════════════════════════════════════════════════════════════
        let seenQuestionIds = [];
        if (userId) {
            const { data: seen } = await supabase
                .from('user_seen_questions')
                .select('question_id')
                .eq('user_id', userId)
                .eq('game_id', gameId)
                    .limit(100);

            seenQuestionIds = (seen || []).map(s => s.question_id);
        }

        // ═══════════════════════════════════════════════════════════════════
        // STEP 3: ROUTE TO CORRECT ENGINE BASED ON GAME CONFIG
        // ═══════════════════════════════════════════════════════════════════
        let question = null;

        // Route based on preferredEngine from game config
        if (preferredEngine === 'SCENARIO') {
            // SCENARIO ENGINE: Mental Game / Psychology - Uses Grok AI
            question = await generateQuestionWithGrok(gameId, 'SCENARIO', level, gameType, game, gameConfig);

        } else if (preferredEngine === 'CHART') {
            // CHART ENGINE: Push/Fold Charts - Uses memory_charts_gold
            question = await generateQuestionFromChart(gameId, level, game, stackDepth);

            // Fallback to Grok for ICM/push-fold questions if no chart data
            if (!question) {
                question = await generateChartQuestionWithGrok(gameId, level, game, gameConfig);
            }

        } else {
            // PIO ENGINE: GTO Solver Data (Default)
            try {
                const pioScenarios = await pioQueryService.queryScenarios(gameId, parseInt(level), userId);

                if (pioScenarios && pioScenarios.length > 0) {
                    question = await generateQuestionFromPIO(pioScenarios, gameId, level, game);
                } else {
                }
            } catch (pioError) {
                console.error('[Training] ⚠️ PIO query failed:', pioError.message);
            }
        }

        // ═══════════════════════════════════════════════════════════════════
        // STEP 4: TRY CACHED QUESTIONS (Fallback)
        // ═══════════════════════════════════════════════════════════════════
        if (!question) {

            const { data: cachedQuestions } = await supabase
                .from('training_question_cache')
                .select('question_data, question_id')
                .eq('game_id', gameId)
                .eq('level', level)
                .not('question_id', 'in', `(${seenQuestionIds.join(',') || 'null'})`)
                .limit(10);

            if (cachedQuestions && cachedQuestions.length > 0) {
                const randomIndex = Math.floor(Math.random() * cachedQuestions.length);
                question = cachedQuestions[randomIndex].question_data;

                await supabase
                    .from('training_question_cache')
                    .update({ times_used: supabase.raw('times_used + 1') })
                    .eq('question_id', cachedQuestions[randomIndex].question_id);

            } else {
            }
        }


        // ═══════════════════════════════════════════════════════════════════
        // STEP 4: GENERATE WITH GROK AI (Last Resort)
        // ═══════════════════════════════════════════════════════════════════
        if (!question) {
            question = await generateQuestionWithGrok(gameId, engineType, level, gameType, game, gameConfig);

            // Save to cache for future use
            if (question) {
                try {
                    await supabase
                        .from('training_question_cache')
                        .insert({
                            question_id: question.id,
                            game_id: gameId,
                            engine_type: engineType.toUpperCase(),
                            game_type: gameType,
                            level: parseInt(level),
                            question_data: question,
                            times_used: 1,
                        });
                } catch (cacheError) {
                    // Ignore duplicate errors (question already cached)
                    if (!cacheError.message?.includes('duplicate')) {
                        console.error('[Training] ⚠️ Cache save failed:', cacheError.message);
                    }
                }
            }
        }

        if (!question) {
            return res.status(404).json({
                error: 'No questions available',
                message: 'All questions for this game have been completed'
            });
        }

        return res.status(200).json({
            success: true,
            question,
            level: parseInt(level),
            passThreshold: TRAINING_CONFIG.passThresholds[level] || 85,
            gameType, // Return game type for debugging
        });

    } catch (error) {
        console.error('[Training] ❌ Get question error:', error);
        return res.status(500).json({ error: error.message });
    }
}

/**
 * Generate question from PIO solver data
 * Transforms raw PIO scenarios into training questions
 * 
 * Strategy Matrix Format (ACTUAL):
 * {
 *   "actions": ["b16", "c", "b45", "f"],   // bet 16%, check, bet 45%, fold
 *   "frequencies": {
 *     "c": { "AA": 1.0, "KK": 0.83, ... },  // check frequencies per hand
 *     "b16": { "AA": 0, "KK": 0.17, ... },  // bet 16% frequencies
 *     ...
 *   },
 *   "hand_evs": { "AA": 1.5, ... }          // EV per hand
 * }
 */
async function generateQuestionFromPIO(pioScenarios, gameId, level, game) {
    try {
        // Pick a random scenario from the available ones
        const scenario = pioScenarios[Math.floor(Math.random() * pioScenarios.length)];


        // Extract strategy matrix
        const strategyMatrix = scenario.strategies || {};
        const actions = strategyMatrix.actions || [];
        const frequencies = strategyMatrix.frequencies || {};

        if (actions.length === 0) {
            return null;
        }

        // Select a random hero hand from the frequency data
        const sampleAction = actions[0];
        const handFreqs = frequencies[sampleAction] || {};
        const allHands = Object.keys(handFreqs);

        if (allHands.length === 0) {
            return null;
        }

        // Pick a random hand for the question
        const heroHand = allHands[Math.floor(Math.random() * allHands.length)];

        // Find the optimal action for this hand (highest frequency)
        // Filter out invalid frequencies (some actions like 'f' may have bogus values > 1)
        let optimalAction = null;
        let maxFreq = -1;
        const handActions = {};
        const validActions = [];

        actions.forEach(action => {
            const freq = frequencies[action]?.[heroHand] || 0;
            // Only consider valid frequencies in 0-1 range
            if (freq >= 0 && freq <= 1) {
                handActions[action] = freq;
                validActions.push(action);
                if (freq > maxFreq) {
                    maxFreq = freq;
                    optimalAction = action;
                }
            } else {
                // Skip invalid frequency values (likely data import errors)
            }
        });

        // Fallback if no valid actions found
        if (!optimalAction || validActions.length === 0) {
            optimalAction = actions[0];
            maxFreq = 0.5;
            handActions[optimalAction] = maxFreq;
            validActions.push(optimalAction);
        }

        // Map action codes to readable names
        const actionNameMap = {
            'c': 'Check',
            'f': 'Fold',
            'x': 'Check',
            'b': 'Bet',
            'b16': 'Bet Small (16%)',
            'b25': 'Bet 25%',
            'b33': 'Bet 33%',
            'b45': 'Bet Medium (45%)',
            'b50': 'Bet Half Pot',
            'b66': 'Bet 2/3 Pot',
            'b75': 'Bet 75%',
            'b100': 'Bet Pot',
            'b150': 'Overbet 150%',
            'allin': 'All-In',
            'r': 'Raise'
        };

        const readableActions = validActions.map(a => ({
            id: a,
            text: actionNameMap[a] || a.toUpperCase(),
            frequency: handActions[a]
        }));

        // Format hero hand for display (e.g., "AKs" → "A♠K♠")
        const formatHand = (hand) => {
            if (!hand) return 'Unknown';
            const suitMap = { 's': '♠', 'h': '♥', 'd': '♦', 'c': '♣', 'o': '' };
            if (hand.length === 2) return hand; // Pair like "AA"
            if (hand.length === 3) {
                const [r1, r2, suit] = [hand[0], hand[1], hand[2]];
                if (suit === 's') return `${r1}♠${r2}♠`;
                if (suit === 'o') return `${r1}♠${r2}♥`;
            }
            return hand;
        };

        // Build question with actual GTO data
        // EXTRACT heroPosition from scenario_hash (e.g., "hu_cash_BTN_100bb_3h7c7s" → "BTN")
        const scenarioParts = scenario.scenarioHash?.split('_') || [];
        const extractedPosition = scenarioParts.find(p =>
            ['BTN', 'SB', 'BB', 'UTG', 'MP', 'CO', 'HJ'].includes(p.toUpperCase())
        ) || 'BTN';

        // Calculate realistic pot size based on street
        const potByStreet = {
            'preflop': 2.5,
            'flop': 6,
            'turn': 15,
            'river': 30
        };
        const estimatedPot = potByStreet[scenario.street] || 6;

        // Determine villain position based on hero position
        const villainPositionMap = {
            'BTN': 'BB',
            'SB': 'BB',
            'BB': 'BTN',
            'UTG': 'BB',
            'MP': 'BB',
            'CO': 'BTN',
            'HJ': 'BB'
        };

        // Build normalized GTO frequencies (0-100% scale) for UI frequency bars
        const gtoFrequencies = {};
        validActions.forEach(action => {
            gtoFrequencies[action] = Math.round((handActions[action] || 0) * 100);
        });

        // Extract hand EVs from strategy matrix for real EV loss computation
        const handEVs = strategyMatrix.hand_evs || scenario.handEVs || {};
        const heroHandEV = handEVs[heroHand] || 0;
        const maxHandEV = Object.keys(handEVs).length > 0
            ? Math.max(...Object.values(handEVs).filter(v => typeof v === 'number'))
            : heroHandEV;

        const question = {
            id: `pio_${scenario.id}_${Date.now()}`,
            type: 'PIO',
            source: 'PIO_DATABASE',
            scenario: {
                board: scenario.board.join(' ') || 'Unknown Board',
                street: scenario.street,
                stackDepth: scenario.stackDepth,
                gameType: scenario.gameType,
                scenarioHash: scenario.scenarioHash,
                heroHand: heroHand,
                // DYNAMIC TABLE DATA - Added for UniversalDynamicTable
                heroPosition: extractedPosition.toUpperCase(),
                heroStack: scenario.stackDepth || 100,
                pot: estimatedPot,
                villainPosition: villainPositionMap[extractedPosition.toUpperCase()] || 'BB',
                villainStack: scenario.stackDepth || 100, // Effective stacks
                action: scenario.street !== 'preflop' ? 'Villain checks' : ''
            },
            // Add heroCards in the format expected by UniversalDynamicTable
            heroCards: heroHand ? [heroHand.substring(0, 2), heroHand.substring(2, 4)] : ['As', 'Ks'],
            question: `You hold ${formatHand(heroHand)} on the ${scenario.street} with board ${scenario.board.join(' ')}. Stack: ${scenario.stackDepth}BB. What is the GTO play?`,
            options: readableActions.slice(0, 4).map(a => ({
                id: a.id,
                text: a.text
            })),
            correctAnswer: optimalAction,
            correctAnswerText: actionNameMap[optimalAction] || optimalAction,
            frequencies: handActions,  // Raw 0.0-1.0 per action (legacy compatibility)
            // ═══ REAL PIO DATA FOR GTO WIZARD UI ═══
            gtoFrequencies,  // Percentage frequencies (0-100%) per action ID for UI
            rawFrequencies: frequencies,  // Full per-hand frequency matrix from PIO
            evData: {
                heroHandEV,
                optimalEV: maxHandEV,
                handEVs,
                heroHand,
            },
            explanation: maxFreq >= 0.95
                ? `According to GTO, this is a pure ${actionNameMap[optimalAction] || optimalAction} (${(maxFreq * 100).toFixed(0)}% frequency).`
                : `GTO mixes here: ${Object.entries(handActions)
                    .filter(([, f]) => f > 0.01)
                    .map(([a, f]) => `${actionNameMap[a] || a} ${(f * 100).toFixed(0)}%`)
                    .join(', ')}. The highest frequency play is ${actionNameMap[optimalAction] || optimalAction}.`,
            difficulty: level,
            heroHand: heroHand
        };

        return question;

    } catch (error) {
        console.error('[Training] ❌ Error generating PIO question:', error);
        return null;
    }
}

/**
 * Build answer options from available actions
 */
function buildOptionsFromActions(actions) {
    const allActions = ['Fold', 'Check', 'Call', 'Bet', 'Raise', 'All-In'];
    const options = [];

    // Add actions from PIO data
    actions.forEach(action => {
        options.push({
            id: action.toLowerCase().replace(/\s/g, '_'),
            text: action
        });
    });

    // Fill with other common actions if needed
    while (options.length < 4) {
        const filler = allActions.find(a => !options.some(o => o.text === a));
        if (filler) {
            options.push({
                id: filler.toLowerCase().replace(/\s/g, '_'),
                text: filler
            });
        } else {
            break;
        }
    }

    return options.slice(0, 4);
}

/**
 * DEPRECATED: Old PIO Engine (kept for reference)
 * PIO Engine: Get solver-based question from Supabase
 */
async function getPIOQuestion(gameId, level, seenIds) {
    // This function is now deprecated in favor of generateQuestionFromPIO
    // which uses the new PIO Query Service
    return null;
}

/**
 * CHART ENGINE: Generate question from push/fold charts
 * Uses memory_charts_gold table
 */
async function generateQuestionFromChart(gameId, level, game, stackDepth) {
    try {

        // Query chart data matching the stack depth
        const { data: charts, error } = await supabase
            .from('memory_charts_gold')
            .select('*')
            .lte('stack_depth', stackDepth + 5)
            .gte('stack_depth', stackDepth - 5)
            .limit(10);

        if (error || !charts || charts.length === 0) {
            return null;
        }

        // Pick random chart
        const chart = charts[Math.floor(Math.random() * charts.length)];
        const handMatrix = chart.hand_matrix || {};
        const hands = Object.keys(handMatrix);

        if (hands.length === 0) {
            return null;
        }

        // Pick random hand
        const heroHand = hands[Math.floor(Math.random() * hands.length)];
        const handData = handMatrix[heroHand];

        // Determine correct action (push if push freq > 0.5)
        const pushFreq = handData?.push || 0;
        const correctAction = pushFreq > 0.5 ? 'push' : 'fold';

        // Parse hero hand into card format for UniversalDynamicTable
        const parseHandToCards = (hand) => {
            if (!hand || hand.length < 2) return ['As', 'Ks'];
            // Hand format could be "AKs" or "AA" or "T9o"
            const suits = ['s', 'h', 'd', 'c'];
            const r1 = hand[0];
            const r2 = hand.length >= 2 ? hand[1] : hand[0];
            const suited = hand.endsWith('s');
            return [r1 + (suited ? 's' : 'h'), r2 + (suited ? 's' : 'd')];
        };

        const question = {
            id: `chart_${chart.chart_id}_${Date.now()}`,
            type: 'CHART',
            source: 'CHART_DATABASE',
            scenario: {
                stackDepth: chart.stack_depth,
                heroPosition: chart.hero_position || 'BTN',
                heroStack: chart.stack_depth || 15,
                villainAction: chart.villain_action || '',
                villainPosition: 'BB',
                villainStack: chart.stack_depth || 15,
                pot: 1.5, // Preflop push/fold pot
                board: '', // Preflop
                action: chart.villain_action || 'Folded to you',
                heroHand: heroHand
            },
            heroCards: parseHandToCards(heroHand),
            question: `You're in ${chart.hero_position || 'the button'} with ${heroHand}. Stack: ${chart.stack_depth}BB. ${chart.villain_action || 'Folded to you'}. Push or Fold?`,
            options: [
                { id: 'push', text: 'Push All-In' },
                { id: 'fold', text: 'Fold' }
            ],
            correctAnswer: correctAction,
            explanation: pushFreq > 0.5
                ? `This is a ${(pushFreq * 100).toFixed(0)}% push in ICM charts. ${heroHand} has enough equity to shove here.`
                : `This is a fold in ICM charts (only ${(pushFreq * 100).toFixed(0)}% push). ${heroHand} doesn't have enough equity.`,
            difficulty: level,
            heroHand: heroHand
        };

        return question;

    } catch (error) {
        console.error('[Training] ❌ Error generating chart question:', error);
        return null;
    }
}

/**
 * CHART ENGINE GROK FALLBACK: Generate push/fold question when no chart data exists
 * Specifically for: mtt-001 (Push/Fold Mastery), mtt-016 (Chip & Chair), cash-010 (Short Stack Rat)
 */
async function generateChartQuestionWithGrok(gameId, level, game, gameConfig) {
    try {
        const grok = getGrokClient();

        const gameName = game?.name || 'Push/Fold Training';
        const stackDepth = gameConfig?.stackDepth || '10-15bb';
        const playerCount = gameConfig?.players || 9;
        const format = gameConfig?.format || '9-Max Tournament';


        const pushFoldPrompt = `You are an ICM poker expert specializing in push/fold and short-stack strategy. Generate a PUSH/FOLD training question for "${gameName}".

CRITICAL: This is about SHORT-STACK ICM DECISION MAKING:
- Stack sizes: ${stackDepth} (very short stacks!)
- Format: ${format} (${playerCount} players)
- Decisions are binary: PUSH ALL-IN or FOLD
- Use Nash equilibrium and ICM pressure considerations
- Include realistic tournament spots (bubble, final table, etc.)

Generate a realistic SHORT-STACK scenario where the hero must decide: PUSH or FOLD.

Generate in this EXACT JSON format (no markdown, no code blocks):
{
  "id": "grok_chart_${gameId}_${Date.now()}",
  "type": "CHART",
  "question": "Push or Fold?",
  "scenario": {
    "heroPosition": "BTN",
    "heroStack": 12,
    "gameType": "${format}",
    "heroHand": "A5s",
    "board": "",
    "pot": 2.5,
    "villainPosition": "BB",
    "villainStack": 18,
    "action": "Folded to you",
    "tournamentStage": "Bubble",
    "blindLevel": "500/1000 with 100 ante"
  },
  "options": [
    {"id": "push", "text": "Push All-In"},
    {"id": "fold", "text": "Fold"}
  ],
  "correctAnswer": "push",
  "explanation": "With ${stackDepth}, A5s is a mandatory push from the button according to Nash charts. Your fold equity combined with hand equity makes this +EV even if called."
}

IMPORTANT: 
- Use realistic stack sizes between 1-20 big blinds
- Hero hand should be a decision point (not obvious like AA or 72o)
- Include ICM context when appropriate (bubble, pay jumps, etc.)
- Difficulty: ${level}/10`;

        const response = await grok.chat.completions.create({
            model: 'grok-3',
            messages: [{ role: 'user', content: pushFoldPrompt }],
            temperature: 0.85,
            max_tokens: 700,
        });

        const content = response.choices[0]?.message?.content || '';
        const jsonMatch = content.match(/\{[\s\S]*\}/);

        if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            return parsed;
        }
    } catch (error) {
        console.error('[Training] ❌ Grok chart question failed:', error.message);
    }

    // Return hardcoded chart fallback
    return getHardcodedQuestion('CHART', level, 'tournament');
}

/**
 * Build options from solver template frequencies
 */
function buildPIOOptions(template) {
    const frequencies = template.frequencies || {};
    const actions = Object.keys(frequencies);

    // Ensure we have 4 options
    const allActions = ['Fold', 'Check/Call', 'Bet 33%', 'Bet 66%', 'Bet 100%', 'Raise', 'All-In'];
    const options = [];

    // Add actions from template
    actions.forEach(action => {
        options.push({
            id: action.toLowerCase().replace(/\s/g, '_'),
            text: action,
            frequency: frequencies[action],
        });
    });

    // Fill with other actions if needed
    while (options.length < 4) {
        const filler = allActions.find(a => !options.some(o => o.text === a));
        if (filler) {
            options.push({ id: filler.toLowerCase().replace(/\s/g, '_'), text: filler, frequency: 0 });
        } else {
            break;
        }
    }

    return options.slice(0, 4);
}

/**
 * CHART Engine: Get range chart question
 */
async function getChartQuestion(gameId, level, seenIds) {
    // Load from chart data files or database
    let charts;
    try {
        charts = require('../../../data/charts/push_fold_ranges.json');
    } catch {
        charts = [];
    }

    // If no charts, return null to fall back to Grok
    if (!Array.isArray(charts) || charts.length === 0) return null;

    // Find unseen chart scenario
    const available = charts.filter(c => !seenIds.includes(c.id));
    if (available.length === 0) return null;

    // Pick based on difficulty
    const chart = available[Math.floor(Math.random() * available.length)];

    return {
        id: chart.id || `chart_${Date.now()}`,
        type: 'CHART',
        scenario: {
            position: chart.position,
            stackBB: chart.stack_bb,
            chartType: chart.type,
            // DYNAMIC TABLE DATA - Added for UniversalDynamicTable
            heroPosition: chart.position || 'BTN',
            heroStack: chart.stack_bb || 15,
            pot: 1.5, // Preflop push/fold typical pot
            villainPosition: 'BB',
            villainStack: chart.stack_bb || 15,
            action: '', // Preflop - no villain action yet
            board: '' // Preflop - no board
        },
        // Add heroCards in the format expected by UniversalDynamicTable
        heroCards: chart.hand ? [chart.hand.substring(0, 2), chart.hand.substring(2, 4)] : ['As', 'Ks'],
        question: chart.question || `Should you ${chart.type} with this hand from ${chart.position}?`,
        hand: chart.hand,
        options: [
            { id: 'push', text: 'Push/Raise' },
            { id: 'fold', text: 'Fold' },
            { id: 'call', text: 'Call' },
            { id: 'limp', text: 'Limp' },
        ],
        correctAnswer: chart.correct_action,
        explanation: chart.explanation,
        difficulty: level,
    };
}

/**
 * SCENARIO Engine: Get mental game question
 */
async function getScenarioQuestion(gameId, level, seenIds) {
    // Load mental game scenarios
    let scenarios;
    try {
        scenarios = require('../../../data/scenarios/mental_game.json');
    } catch {
        scenarios = [];
    }

    // If no scenarios, return null to fall back to Grok
    if (!Array.isArray(scenarios) || scenarios.length === 0) return null;

    const available = scenarios.filter(s => !seenIds.includes(s.id));
    if (available.length === 0) return null;

    const scenario = available[Math.floor(Math.random() * available.length)];

    return {
        id: scenario.id || `scenario_${Date.now()}`,
        type: 'SCENARIO',
        scenario: {
            title: scenario.title,
            context: scenario.context,
        },
        question: scenario.prompt,
        options: scenario.options.map(o => ({
            id: o.id,
            text: o.text,
            type: o.type,
        })),
        correctAnswer: scenario.options.find(o => o.correct)?.id,
        explanation: scenario.options.find(o => o.correct)?.feedback,
        difficulty: level,
        timeoutSeconds: scenario.timeout_seconds || 30,
    };
}

/**
 * Grok AI Fallback: Generate question when database is exhausted
 * Routes to different prompts based on engine type:
 * - SCENARIO: Psychology/Mental Game questions (no GTO math)
 * - PIO/CHART: GTO solver-based poker questions
 */
async function generateQuestionWithGrok(gameId, engineType, level, gameType, game, gameConfig) {
    try {
        const grok = getGrokClient();

        const gameName = game?.name || 'Training Game';
        const gameCategory = game?.category || 'CASH';
        const gameFocus = game?.focus || 'poker training';

        // ═══════════════════════════════════════════════════════════════════
        // SCENARIO ENGINE: Psychology/Mental Game Questions
        // ═══════════════════════════════════════════════════════════════════
        if (engineType === 'SCENARIO' || gameCategory === 'PSYCHOLOGY') {

            const psychologyPrompt = `You are an elite poker mental game coach. Generate a PSYCHOLOGY / MENTAL GAME training question for "${gameName}" focusing on: ${gameFocus}.

CRITICAL: This is NOT about GTO strategy or poker math. This is about:
- Emotional control and tilt management
- Decision-making under pressure
- Mindset and psychological resilience
- Focus, discipline, and mental stamina
- Handling variance and bad beats
- Table presence and composure

Game Context:
- Training Game: ${gameName}
- Focus Area: ${gameFocus}
- Difficulty: ${level}/10 (1=beginner, 10=master)

Generate a realistic poker MENTAL GAME scenario. The question should test the player's psychological response, NOT their GTO knowledge.

Generate in this EXACT JSON format (no markdown, no code blocks):
{
  "id": "grok_${gameId}_${Date.now()}",
  "type": "SCENARIO",
  "question": "How would you handle this situation?",
  "scenario": {
    "title": "${gameName}",
    "context": "Describe a realistic poker scenario that tests mental game...",
    "isPsychology": true
  },
  "options": [
    {"id": "a", "text": "First option (typically impulsive/tilted response)"},
    {"id": "b", "text": "Second option (optimal mental game response)"},
    {"id": "c", "text": "Third option (passive/avoidant response)"},
    {"id": "d", "text": "Fourth option (aggressive overreaction)"}
  ],
  "correctAnswer": "b",
  "explanation": "The optimal response is [b] because... (explain the psychology)"
}

EXAMPLES OF GOOD PSYCHOLOGY QUESTIONS:
- "You just lost a huge pot with AA vs 72o all-in preflop. What do you do next?"
- "An opponent is deliberately tanking on every decision. How do you maintain focus?"
- "You're on a 10 buy-in downswing over 3 sessions. What's your approach?"
- "A recreational player berated you in chat after a bad beat. How do you respond?"
- "You've been card dead for 2 hours in a tournament. How do you stay sharp?"

Make the scenario realistic and the options psychologically distinct.`;

            const response = await grok.chat.completions.create({
                model: 'grok-3',
                messages: [{ role: 'user', content: psychologyPrompt }],
                temperature: 0.9, // Higher creativity for varied scenarios
                max_tokens: 800,
            });

            const content = response.choices[0]?.message?.content || '';
            const jsonMatch = content.match(/\{[\s\S]*\}/);

            if (jsonMatch) {
                const parsed = JSON.parse(jsonMatch[0]);
                // Ensure isPsychology flag is set
                if (parsed.scenario) {
                    parsed.scenario.isPsychology = true;
                }
                return parsed;
            }

            // Psychology fallback
            return getHardcodedQuestion('SCENARIO', level, gameType);
        }

        // ═══════════════════════════════════════════════════════════════════
        // PIO/CHART ENGINE: GTO Solver-Based Questions  
        // ═══════════════════════════════════════════════════════════════════

        // Get player count and format from game config
        const playerCount = gameConfig?.players || 6;
        const gameFormat = gameConfig?.format || '6-Max Cash';
        const stackDepth = gameConfig?.stackDepth || '100bb';

        // Map game type to readable format with accurate player count
        const gameTypeDisplay = gameType === 'tournament'
            ? `${playerCount === 9 ? '9-Max' : playerCount === 3 ? '3-Max' : playerCount === 2 ? 'Heads-Up' : '6-Max'} Tournament (MTT)`
            : gameType === 'sng'
                ? `${playerCount === 2 ? 'Heads-Up' : '3-Max'} Spin & Go`
                : `${playerCount === 2 ? 'Heads-Up' : '6-Max'} Cash Game`;


        const gtoPrompt = `You are a GTO poker solver expert. Generate a realistic poker training question for "${gameName}" at difficulty level ${level}/10.

CRITICAL REQUIREMENTS:
- Game Format: ${gameFormat} (${playerCount} players)
- Stack Depth: ${stackDepth}
- Game Type: ${gameTypeDisplay}
${playerCount === 2 ? '- This is HEADS-UP: Only 2 players (BTN/SB vs BB)' : ''}
${playerCount === 3 ? '- This is 3-MAX: Only 3 players (BTN, SB, BB)' : ''}
${playerCount === 9 ? '- This is 9-MAX: Full ring with UTG, MP, HJ, CO, BTN, SB, BB' : ''}
- ${gameType === 'tournament' ? 'Include ICM considerations and stack depths in BB' : ''}
- ${gameType === 'cash' ? 'Focus on postflop play and pot geometry' : ''}
- ${gameType === 'sng' ? 'Use hyper-turbo stack depths and aggression' : ''}
- Provide GTO-accurate solver-style answers
- Include specific stack depths, positions, and board textures
- Explain WHY the GTO play is optimal

Game Context:
- Game: ${gameName}
- Format: ${gameFormat}
- Players: ${playerCount}
- Stack: ${stackDepth}
- Difficulty: ${level}/10

Generate in this EXACT JSON format (no markdown, no code blocks):
{
  "id": "grok_${gameId}_${Date.now()}",
  "type": "PIO",
  "question": "What is the GTO play in this spot?",
  "scenario": {
    "heroPosition": "${playerCount === 2 ? 'SB' : 'BTN'}",
    "heroStack": ${gameType === 'tournament' ? '25' : gameType === 'sng' ? '15' : '100'},
    "gameType": "${gameTypeDisplay}",
    "heroHand": "AhKs",
    "board": "Jh7s2d",
    "pot": ${gameType === 'tournament' ? '8' : gameType === 'sng' ? '5' : '12'},
    "villainPosition": "BB",
    "villainStack": ${gameType === 'tournament' ? '22' : gameType === 'sng' ? '12' : '100'},
    "action": "Villain checks"
  },
  "options": [
    {"id": "a", "text": "Check"},
    {"id": "b", "text": "Bet small (33%)"},
    {"id": "c", "text": "Bet medium (66%)"},
    {"id": "d", "text": "Bet large (100%+)"}
  ],
  "correctAnswer": "b",
  "explanation": "Betting 33% is optimal because: (1) We have range advantage on this dry board, (2) Small sizing extracts value from weaker hands while keeping villain's range wide, (3) Solver shows high c-bet frequency with this sizing."
}

IMPORTANT: Make the scenario realistic for ${gameFormat}. ${playerCount === 2 ? 'Remember this is HEADS-UP with only BTN/SB and BB.' : ''}`;

        const response = await grok.chat.completions.create({
            model: 'grok-3',
            messages: [{ role: 'user', content: gtoPrompt }],
            temperature: 0.8,
            max_tokens: 800,
        });

        const content = response.choices[0]?.message?.content || '';
        const jsonMatch = content.match(/\{[\s\S]*\}/);

        if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            return parsed;
        }
    } catch (error) {
        console.error('[Training] ❌ Grok question generation failed:', error.message);
    }

    // Return hardcoded fallback question if Grok fails
    return getHardcodedQuestion(engineType, level, gameType);
}

/**
 * Hardcoded fallback questions when all else fails
 */
function getHardcodedQuestion(engineType, level, gameType) {
    const questions = {
        PIO: [
            {
                id: `fallback_pio_${Date.now()}`,
                type: 'PIO',
                scenario: {
                    heroPosition: 'BTN',
                    heroStack: 100,
                    villainPosition: 'UTG',
                    villainStack: 100,
                    pot: 4.5,
                    board: '',
                    action: 'UTG raises to 3bb',
                    gameType: '6-Max Cash'
                },
                heroCards: ['Ac', 'Ks'],
                question: 'You are on the Button with AcKs. UTG raises to 3bb. What is the optimal play?',
                options: [
                    { id: 'a', text: 'Fold' },
                    { id: 'b', text: 'Call' },
                    { id: 'c', text: '3-bet to 9bb' },
                    { id: 'd', text: 'All-In' },
                ],
                correctAnswer: 'c',
                explanation: 'AKs is a premium hand that should be 3-bet for value from the Button against a UTG open.',
            },
            {
                id: `fallback_pio2_${Date.now()}`,
                type: 'PIO',
                scenario: {
                    heroPosition: 'BB',
                    heroStack: 25,
                    villainPosition: 'BTN',
                    villainStack: 30,
                    pot: 4,
                    board: '',
                    action: 'BTN raises to 2.5bb',
                    gameType: 'MTT'
                },
                heroCards: ['Qh', 'Jd'],
                question: 'You are in the BB with 25bb. BTN opens to 2.5bb. SB folds. You have QJo. What is your play?',
                options: [
                    { id: 'a', text: 'Fold' },
                    { id: 'b', text: 'Call' },
                    { id: 'c', text: '3-bet to 8bb' },
                    { id: 'd', text: 'All-In' },
                ],
                correctAnswer: 'b',
                explanation: 'With QJo and 25bb, calling is preferred to close the action. 3-betting leaves you committed.',
            },
        ],
        CHART: [
            {
                id: `fallback_chart_${Date.now()}`,
                type: 'CHART',
                scenario: {
                    heroPosition: 'SB',
                    heroStack: 10,
                    villainPosition: 'BB',
                    villainStack: 12,
                    pot: 1.5,
                    board: '',
                    action: 'Folded to you',
                    position: 'SB',
                    stackBB: 10
                },
                heroCards: ['As', '5s'],
                question: 'You have 10bb in the SB with A5s. It folds to you. Should you push or fold?',
                options: [
                    { id: 'a', text: 'Push' },
                    { id: 'b', text: 'Fold' },
                    { id: 'c', text: 'Limp' },
                    { id: 'd', text: 'Min-raise' },
                ],
                correctAnswer: 'a',
                explanation: 'A5s is a clear push from SB with 10bb according to push/fold charts.',
            },
        ],
        SCENARIO: [
            {
                id: `fallback_scenario_${Date.now()}`,
                type: 'SCENARIO',
                scenario: {
                    title: 'Tilt Management',
                    isPsychology: true // Flag for specialized UI
                },
                question: 'You just lost a big pot with AA vs 72o all-in preflop. What should you do?',
                options: [
                    { id: 'a', text: 'Play faster to win it back' },
                    { id: 'b', text: 'Take a 5-minute break' },
                    { id: 'c', text: 'Move up stakes for easier games' },
                    { id: 'd', text: 'Review the hand right now' },
                ],
                correctAnswer: 'b',
                explanation: 'Taking a short break helps reset your mental state and prevents tilt-driven decisions.',
            },
        ],
    };

    const engineQuestions = questions[engineType] || questions.PIO;
    const index = Math.floor(Math.random() * engineQuestions.length);
    return engineQuestions[index];
}

// Deploy trigger Wed Jan 28 23:02:33 CST 2026
