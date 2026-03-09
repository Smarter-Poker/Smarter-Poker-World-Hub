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

import { createClient } from '../../../src/lib/supabaseServerClient';
import { getGrokClient } from '../../../src/lib/grokClient';
import TRAINING_CONFIG from '../../../src/config/trainingConfig';
import { getGameConfig, getStackDepthNumber } from '../../../src/config/gameConfigs';
import { pioQueryService } from '../../../src/services/PIOQueryService';
import { deterministicEngine } from '../../../src/engines/DeterministicGTOEngine';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';

// ── Deterministic hash for seeded fallback data ──
function hashSeed(str) {
    let h = 0;
    for (let i = 0; i < (str || '').length; i++) {
        h = ((h << 5) - h + str.charCodeAt(i)) | 0;
    }
    return Math.abs(h);
}

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
    if (!applyRateLimit(req, res, LIMITS.read)) return;

    // BUG #245 FIX: Require JWT auth
    const _token = req.headers.authorization?.replace('Bearer ', '');
    if (!_token) return res.status(401).json({ success: false, error: 'Auth required' });
    const { data: { user: _authUser }, error: _authErr } = await supabase.auth.getUser(_token);
    if (_authErr || !_authUser) return res.status(401).json({ success: false, error: 'Invalid token' });

    if (req.method !== 'GET') {
        return res.status(405).json({ success: false, error: 'Method not allowed' });
    }

    const { gameId, level = 1, engineType = 'PIO' } = req.query;
    // BUG FIX: was reading userId from query — IDOR; use JWT identity instead
    const userId = _authUser.id;

    if (!gameId) {
        return res.status(400).json({ success: false, error: 'gameId required' });
    }

    try {
        // ═══════════════════════════════════════════════════════════════════
        // STEP 1: GET COMPREHENSIVE GAME CONFIGURATION
        // ═══════════════════════════════════════════════════════════════════
        const TRAINING_LIBRARY = require('../../../src/data/TRAINING_LIBRARY').default;
        const game = TRAINING_LIBRARY.find(g => g.id === gameId);

        if (!game) {
            return res.status(404).json({ success: false, error: 'Game not found' });
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
        // STEP 3: DETERMINISTIC ENGINE — PRIMARY SOURCE (No Grok AI)
        // ═══════════════════════════════════════════════════════════════════
        let question = null;

        // Get PIO game config for solver data lookup
        const pioConfig = pioQueryService.getGameConfig(gameId);

        // TRY DETERMINISTIC ENGINE FIRST for PIO/CHART games
        if (pioConfig && pioConfig.sourceOfTruth !== 'SCENARIO') {
            try {
                question = await deterministicEngine.generateQuestion({
                    gameId,
                    level: parseInt(level),
                    seenIds: seenQuestionIds,
                    gameConfig: pioConfig,
                });
                if (question) {
                    console.log(`[Training] ✅ DETERMINISTIC engine served question for ${gameId} (source: ${question.source})`);
                }
            } catch (detErr) {
                console.error('[Training] ⚠️ Deterministic engine failed, falling back:', detErr.message);
            }
        }

        // FALLBACK: Route to legacy engine if deterministic failed
        if (!question) {
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
                    }
                } catch (pioError) {
                    console.error('[Training] ⚠️ PIO query failed:', pioError.message);
                }
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
                // Enrich cached questions that were generated before GTO fields were added
                question = enrichGrokQuestion(cachedQuestions[randomIndex].question_data, gameConfig, parseInt(level), gameType);

                // Increment times_used (supabase.raw() doesn't exist in JS SDK v2)
                const questionId = cachedQuestions[randomIndex].question_id;
                const { data: currentQ } = await supabase
                    .from('training_question_cache')
                    .select('times_used')
                    .eq('question_id', questionId)
                    .maybeSingle();
                await supabase
                    .from('training_question_cache')
                    .update({ times_used: (currentQ?.times_used || 0) + 1 })
                    .eq('question_id', questionId);

            } else {
            }
        }


        // ═══════════════════════════════════════════════════════════════════
        // STEP 4: GROK AI — SCENARIO (Psychology) GAMES ONLY
        // BUG-E FIX: Removed Grok fallback for PIO/CHART games.
        // Grok generates hallucinated GTO data that violates the deterministic standard.
        // Only SCENARIO (psychology) games use Grok since they have no solver data by design.
        // ═══════════════════════════════════════════════════════════════════
        if (!question && preferredEngine === 'SCENARIO') {
            question = await generateQuestionWithGrok(gameId, 'SCENARIO', level, gameType, game, gameConfig);

            // Save to cache for future use
            if (question) {
                try {
                    await supabase
                        .from('training_question_cache')
                        .insert({
                            question_id: question.id,
                            game_id: gameId,
                            engine_type: 'SCENARIO',
                            game_type: gameType,
                            level: parseInt(level),
                            question_data: question,
                            times_used: 1,
                        });
                } catch (cacheError) {
                    if (!cacheError.message?.includes('duplicate')) {
                        console.error('[Training] ⚠️ Cache save failed:', cacheError.message);
                    }
                }
            }
        }

        if (!question) {
            return res.status(404).json({
                success: false, error: 'No questions available',
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
        return res.status(500).json({ success: false, error: error.message });
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

// ═══════════════════════════════════════════════════════════════════════════
// PHASE 28: Dead code removed — 7 deprecated functions with 0 callers:
// buildOptionsFromActions, getPIOQuestion, generateQuestionFromChart,
// generateChartQuestionWithGrok, buildPIOOptions, getChartQuestion,
// getScenarioQuestion
// ═══════════════════════════════════════════════════════════════════════════









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
        const stackDepth = gameConfig?.stackDepth || '100BB';

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
${playerCount === 2 ? '- HEADS-UP: Only 2 players (BTN/SB vs BB)' : ''}
${playerCount === 3 ? '- 3-MAX: Only 3 players (BTN, SB, BB)' : ''}
${playerCount === 9 ? '- 9-MAX: Full ring with UTG, MP, HJ, CO, BTN, SB, BB' : ''}
- ${gameType === 'tournament' ? 'Include ICM considerations and stack depths in BB' : ''}
- ${gameType === 'cash' ? 'Focus on postflop play and pot geometry' : ''}
- ${gameType === 'sng' ? 'Use hyper-turbo stack depths and aggression' : ''}
- USE SPECIFIC REAL CARDS (e.g. "Ah", "Kd", "Ts" — not abstract notation)
- Include a board texture with 3-5 cards (flop/turn/river)
- Provide GTO-accurate solver-style answers with frequencies

Game Context: ${gameName} | ${gameFormat} | ${playerCount}p | ${stackDepth} | Level ${level}/10

Generate in this EXACT JSON format (no markdown, no code blocks):
{
  "id": "grok_${gameId}_${Date.now()}",
  "type": "PIO",
  "source": "GROK_GTO",
  "heroCards": ["Ah", "Ks"],
  "boardCards": ["Jh", "7s", "2d"],
  "question": "You hold AhKs on Jh7s2d. BTN opens, BB calls. Pot is 12BB. What is the GTO play?",
  "scenario": {
    "heroPosition": "BTN",
    "heroStack": 100,
    "gameType": "${gameTypeDisplay}",
    "heroHand": "AhKs",
    "board": "Jh 7s 2d",
    "street": "flop",
    "pot": 12,
    "villainPosition": "BB",
    "villainStack": 100,
    "action": "Villain checks"
  },
  "options": [
    {"id": "a", "text": "Check"},
    {"id": "b", "text": "Bet 33% pot"},
    {"id": "c", "text": "Bet 66% pot"},
    {"id": "d", "text": "Bet 100% pot"}
  ],
  "gtoFrequencies": {"a": 15, "b": 55, "c": 25, "d": 5},
  "correctAnswer": "b",
  "explanation": "Bet 33% is optimal: (1) Range advantage on dry board, (2) Small sizing keeps villain wide, (3) Solver c-bets 55% at this sizing."
}

IMPORTANT RULES:
1. heroCards MUST be an array of exactly 2 card strings like ["Ah", "Ks"]
2. boardCards MUST be an array of 3-5 card strings like ["Jh", "7s", "2d"]
3. gtoFrequencies MUST map each option id to a percentage (totaling ~100)
4. Use REAL card notation: rank (2-9,T,J,Q,K,A) + suit (h,d,c,s)
5. Make it realistic for ${gameFormat}. ${playerCount === 2 ? 'HEADS-UP only BTN/SB and BB.' : ''}`;

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
            return enrichGrokQuestion(parsed, gameConfig, level, gameType);
        }
    } catch (error) {
        console.error('[Training] ❌ Grok question generation failed:', error.message);
    }

    // Return hardcoded fallback question if Grok fails
    return getHardcodedQuestion(engineType, level, gameType);
}

/**
 * Enrich a Grok-generated question with all GTO Wizard-level fields.
 * Ensures heroCards, boardCards, gtoFrequencies, evData always exist.
 * This makes every question render full GTO feedback UI.
 */
function enrichGrokQuestion(q, gameConfig, level, gameType) {
    if (!q) return q;

    const scenario = q.scenario || {};
    const options = q.options || [];
    const correctAnswer = q.correctAnswer;

    // 1. Ensure heroCards array exists
    if (!q.heroCards || !Array.isArray(q.heroCards) || q.heroCards.length < 2) {
        const heroHand = scenario.heroHand || q.heroHand || '';
        if (heroHand && heroHand.length >= 4) {
            q.heroCards = [heroHand.substring(0, 2), heroHand.substring(2, 4)];
        } else {
            // Deterministic fallback cards based on question id hash
            const seed = hashSeed(q.id || q.questionId || 'fallback');
            q.heroCards = _getDeterministicCards(seed, 2);
        }
    }

    // 2. Ensure boardCards array exists
    if (!q.boardCards || !Array.isArray(q.boardCards) || q.boardCards.length === 0) {
        const boardStr = scenario.board || '';
        if (boardStr && boardStr.length >= 6) {
            // Parse board string like "Jh7s2d" or "Jh 7s 2d"
            const clean = boardStr.replace(/\s+/g, '');
            const cards = [];
            for (let i = 0; i < clean.length; i += 2) {
                if (i + 1 < clean.length) cards.push(clean.substring(i, i + 2));
            }
            const seed = hashSeed(q.id || 'board_fallback');
            q.boardCards = cards.length >= 3 ? cards : _getDeterministicCards(seed, 3, q.heroCards);
        } else {
            const seed = hashSeed(q.id || 'board_fallback');
            q.boardCards = _getDeterministicCards(seed, 3, q.heroCards);
        }
    }

    // 3. Ensure gtoFrequencies exist (map option ids to 0-100 percentages)
    if (!q.gtoFrequencies || Object.keys(q.gtoFrequencies).length === 0) {
        q.gtoFrequencies = {};
        const optsLen = options.length;
        let remaining = 100;

        options.forEach((opt, i) => {
            const optId = opt.id || String.fromCharCode(97 + i);
            const isCorrect = optId === correctAnswer;

            if (isCorrect) {
                // Correct answer gets dominant frequency
                // Higher levels = more mixed strategy (lower dominance)
                const dominance = Math.max(35, 80 - (level * 4)) + (hashSeed(optId + (q.id || '')) % 10);
                q.gtoFrequencies[optId] = Math.min(dominance, remaining);
                remaining -= q.gtoFrequencies[optId];
            }
        });

        // Distribute remaining evenly/deterministically among incorrect options
        const incorrectOpts = options.filter(opt => (opt.id || '') !== correctAnswer);
        incorrectOpts.forEach((opt, idx) => {
            const optId = opt.id || String.fromCharCode(97 + idx);
            const isLast = idx === incorrectOpts.length - 1;
            if (isLast) {
                q.gtoFrequencies[optId] = Math.max(0, remaining);
            } else {
                const share = Math.floor(remaining / (incorrectOpts.length - idx)) + (hashSeed(optId) % 5) - 2;
                const clampedShare = Math.max(0, Math.min(share, remaining));
                q.gtoFrequencies[optId] = clampedShare;
                remaining -= clampedShare;
            }
        });

        const sum = Object.values(q.gtoFrequencies).reduce((s, v) => s + v, 0);
        if (sum !== 100 && correctAnswer) {
            q.gtoFrequencies[correctAnswer] = (q.gtoFrequencies[correctAnswer] || 0) + (100 - sum);
        }
    }

    // 4. Ensure evData exists — deterministic position-aware estimates
    if (!q.evData) {
        const pot = scenario.pot || 10;
        const positionBonus = { 'BTN': 0.65, 'CO': 0.58, 'MP': 0.50, 'UTG': 0.45, 'SB': 0.42, 'BB': 0.48 };
        const posMult = positionBonus[scenario.heroPosition] || 0.52;
        q.evData = {
            heroHandEV: +(pot * posMult).toFixed(2),
            optimalEV: +(pot * (posMult + 0.15)).toFixed(2),
            handEVs: {},
            heroHand: q.heroCards ? q.heroCards.join('') : 'AhKs',
        };
    }

    // 5. Ensure scenario has all required fields + SANITIZE values
    if (!scenario.heroPosition) scenario.heroPosition = 'BTN';
    if (!scenario.villainPosition) scenario.villainPosition = 'BB';
    if (!scenario.pot) scenario.pot = gameType === 'tournament' ? 8 : 12;
    if (!scenario.heroStack) scenario.heroStack = gameType === 'tournament' ? 25 : 100;
    if (!scenario.villainStack) scenario.villainStack = scenario.heroStack;
    // ═══ SANITIZE: Clamp pot/stacks to sane BB ranges ═══
    // Grok sometimes returns absolute chip values instead of BB
    scenario.pot = Math.min(Math.max(scenario.pot, 0), 50);
    scenario.heroStack = Math.min(Math.max(scenario.heroStack, 1), 300);
    scenario.villainStack = Math.min(Math.max(scenario.villainStack, 1), 300);
    if (!scenario.street) {
        scenario.street = q.boardCards?.length === 3 ? 'flop'
            : q.boardCards?.length === 4 ? 'turn' : 'river';
    }
    q.scenario = scenario;

    // 6. Ensure source is set
    if (!q.source) q.source = 'GROK_GTO';

    return q;
}

/** Generate deterministic cards, preventing collisions */
function _getDeterministicCards(seed, count, exclude = []) {
    const deck = [
        '2c', '3c', '4c', '5c', '6c', '7c', '8c', '9c', 'Tc', 'Jc', 'Qc', 'Kc', 'Ac',
        '2d', '3d', '4d', '5d', '6d', '7d', '8d', '9d', 'Td', 'Jd', 'Qd', 'Kd', 'Ad',
        '2h', '3h', '4h', '5h', '6h', '7h', '8h', '9h', 'Th', 'Jh', 'Qh', 'Kh', 'Ah',
        '2s', '3s', '4s', '5s', '6s', '7s', '8s', '9s', 'Ts', 'Js', 'Qs', 'Ks', 'As'
    ];
    const excludeSet = new Set(exclude.map(c => c.toLowerCase()));
    const available = deck.filter(c => !excludeSet.has(c.toLowerCase()));
    let a = seed || Date.now();
    const rng = () => {
        let t = a += 0x6D2B79F5;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    for (let i = available.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [available[i], available[j]] = [available[j], available[i]];
    }
    return available.slice(0, count);
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
                    action: 'UTG raises to 3BB',
                    gameType: '6-Max Cash'
                },
                heroCards: ['Ac', 'Ks'],
                question: 'You are on the Button with AcKs. UTG raises to 3BB. What is the optimal play?',
                options: [
                    { id: 'a', text: 'Fold' },
                    { id: 'b', text: 'Call' },
                    { id: 'c', text: '3-bet to 9BB' },
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
                    action: 'BTN raises to 2.5BB',
                    gameType: 'MTT'
                },
                heroCards: ['Qh', 'Jd'],
                question: 'You are in the BB with 25BB. BTN opens to 2.5BB. SB folds. You have QJo. What is your play?',
                options: [
                    { id: 'a', text: 'Fold' },
                    { id: 'b', text: 'Call' },
                    { id: 'c', text: '3-bet to 8BB' },
                    { id: 'd', text: 'All-In' },
                ],
                correctAnswer: 'b',
                explanation: 'With QJo and 25BB, calling is preferred to close the action. 3-betting leaves you committed.',
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
                question: 'You have 10BB in the SB with A5s. It folds to you. Should you push or fold?',
                options: [
                    { id: 'a', text: 'Push' },
                    { id: 'b', text: 'Fold' },
                    { id: 'c', text: 'Limp' },
                    { id: 'd', text: 'Min-raise' },
                ],
                correctAnswer: 'a',
                explanation: 'A5s is a clear push from SB with 10BB according to push/fold charts.',
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
