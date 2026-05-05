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
// ═══ Phase GTO-CLONE: Grok AI removed — all questions from engines only ═══
// import { getGrokClient } from '../../../src/lib/grokClient';
import TRAINING_CONFIG from '../../../src/config/trainingConfig';
import { getGameConfig, getStackDepthNumber } from '../../../src/config/gameConfigs';
import { pioQueryService } from '../../../src/services/PIOQueryService';
import { deterministicEngine } from '../../../src/engines/DeterministicGTOEngine';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { sanitizeParam, withTiming } from '../../../src/utils/trainingApiUtils';
import { reportApiError } from '../../../src/lib/sentryWrap';

// ── Deterministic hash for seeded fallback data ──
function hashSeed(str) {
    let h = 0;
    for (let i = 0; i < (str || '').length; i++) {
        h = ((h << 5) - h + str.charCodeAt(i)) | 0;
    }
    return Math.abs(h);
}

// ── Lazy Supabase getter (SSG-safe) ─────────────────────────────
let _supabase = null;
function getSupabase() {
    if (!_supabase) {
        _supabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL,
            process.env.SUPABASE_SERVICE_ROLE_KEY
        );
    }
    return _supabase;
}
export default async function handler(req, res) {
  try {
      withTiming(res);
      if (!applyRateLimit(req, res, LIMITS.read)) return;

      // BUG #245 FIX: Require JWT auth
      const _token = req.headers.authorization?.replace('Bearer ', '');
      if (!_token) return res.status(401).json({ success: false, error: 'Auth required' });
      const { data: authData, error: _authErr } = await getSupabase().auth.getUser(_token);
      const _authUser = authData?.user;
      if (_authErr || !_authUser) return res.status(401).json({ success: false, error: 'Invalid token' });

      if (req.method !== 'GET') {
          return res.status(405).json({ success: false, error: 'Method not allowed' });
      }

      const { gameId: rawGameId, level: rawLevel = 1, engineType: rawEngine = 'PIO' } = req.query;
      const gameId = sanitizeParam(rawGameId, 100);
      const level = Math.min(10, Math.max(1, parseInt(rawLevel, 10) || 1));
      const engineType = ['PIO', 'CHART', 'SCENARIO'].includes(rawEngine) ? rawEngine : 'PIO';
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
              const { data: seen } = await getSupabase()
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
              // Inject service-role client so engine bypasses RLS
              deterministicEngine.setSupabaseClient(getSupabase());
              try {
                  question = await deterministicEngine.generateQuestion({
                      gameId,
                      level: parseInt(level, 10),
                      seenIds: seenQuestionIds,
                      gameConfig: pioConfig,
                  });
                  if (question) {
                      console.debug(`[Training] Deterministic engine served: ${question.source}`);
                  }
              } catch (detErr) {
                  console.warn('[Training] ⚠️ Deterministic engine failed, falling back:', detErr.message);
              }
          }

          // FALLBACK: Route to legacy PIO engine if deterministic failed
          if (!question) {
              if (preferredEngine === 'SCENARIO') {
                  // SCENARIO ENGINE: Now handled by DeterministicGTOEngine — no AI fallback
                  console.debug(`[Training] SCENARIO engine for ${gameId} — engine-only, no Grok.`);
              } else {
                  // PIO ENGINE: GTO Solver Data (Default)
                  try {
                      const pioScenarios = await pioQueryService.queryScenarios(gameId, parseInt(level, 10), userId);

                      if (pioScenarios && pioScenarios.length > 0) {
                          question = await generateQuestionFromPIO(pioScenarios, gameId, level, game);
                      }
                  } catch (pioError) {
                      console.warn('[Training] ⚠️ PIO query failed:', pioError.message);
                  }
              }
          }

          // ═══════════════════════════════════════════════════════════════════
          // STEP 4: TRY CACHED QUESTIONS (Fallback)
          // ═══════════════════════════════════════════════════════════════════
          if (!question) {

              const { data: cachedQuestions } = await getSupabase()
                  .from('training_question_cache')
                  .select('question_data, question_id')
                  .eq('game_id', gameId)
                  .eq('level', level)
                  .not('question_id', 'in', `(${seenQuestionIds.join(',') || 'null'})`)
                  .limit(10);

              if (cachedQuestions && cachedQuestions.length > 0) {
                  const randomIndex = Math.floor(Math.random() * cachedQuestions.length);
                  // Enrich cached questions that were generated before GTO fields were added
                  question = enrichLegacyCachedQuestion(cachedQuestions[randomIndex].question_data, gameConfig, parseInt(level, 10), gameType);

                  // Increment times_used (getSupabase().raw() doesn't exist in JS SDK v2)
                  const questionId = cachedQuestions[randomIndex].question_id;
                  const { data: currentQ } = await getSupabase()
                      .from('training_question_cache')
                      .select('times_used')
                      .eq('question_id', questionId)
                      .maybeSingle();
                  await getSupabase()
                      .from('training_question_cache')
                      .update({ times_used: (currentQ?.times_used || 0) + 1 })
                      .eq('question_id', questionId);

              } else {
              }
          }


          // ═══════════════════════════════════════════════════════════════════
          // STEP 4: ENGINE-ONLY — No AI fallback
          // All questions come from DeterministicGTOEngine, PostflopScenarioGenerator,
          // or Supabase cache. If none available, return error.
          // ═══════════════════════════════════════════════════════════════════
          if (!question) {
              console.warn(`[Training] No question available for ${gameId} level ${level} — all engines returned empty.`);
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
              level: parseInt(level, 10),
              passThreshold: TRAINING_CONFIG.passThresholds[level] || 85,
              gameType, // Return game type for debugging
          });

      } catch (error) {
          console.warn('[Training] ❌ Get question error:', error);
          return res.status(500).json({ success: false, error: 'Internal server error' });
      }

  } catch (err) {
    try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
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
        const allHands = Object.keys(handFreqs || {});

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
        let validActions = [];

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

        // ═══ FREQUENCY CLAMPING PROTOCOL (Ghost Hand Bug Fix) ═══
        const clampedActions = validActions.filter(action => handActions[action] >= 0.01);
        if (clampedActions.length > 0) {
            validActions = clampedActions;
            // Re-evaluate optimal action among clamped
            maxFreq = -1;
            validActions.forEach(action => {
                const freq = handActions[action];
                if (freq > maxFreq) {
                    maxFreq = freq;
                    optimalAction = action;
                }
            });
        }

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
        const maxHandEV = Object.keys(handEVs || {}).length > 0
            ? Math.max(...Object.values(handEVs || {}).filter(v => typeof v === 'number'))
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
                : `GTO mixes here: ${Object.entries(handActions || {})
                    .filter(([, f]) => f > 0.01)
                    .map(([a, f]) => `${actionNameMap[a] || a} ${(f * 100).toFixed(0)}%`)
                    .join(', ')}. The highest frequency play is ${actionNameMap[optimalAction] || optimalAction}.`,
            difficulty: level,
            heroHand: heroHand
        };

        return question;

    } catch (error) {
        console.warn('[Training] ❌ Error generating PIO question:', error);
        return null;
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// PHASE 28: Dead code removed — 7 deprecated functions with 0 callers:
// buildOptionsFromActions, getPIOQuestion, generateQuestionFromChart,
// generateChartQuestionWithGrok, buildPIOOptions, getChartQuestion,
// getScenarioQuestion
// ═══════════════════════════════════════════════════════════════════════════









// ═══════════════════════════════════════════════════════════════════════════
// Operation Grok-Sweep (2026-05): generateQuestionWithGrok() removed.
//
// This was a ~180-line LLM-fallback that hallucinated training questions when
// the deterministic engine and Supabase question cache both missed. The main
// handler stopped calling it months ago (see Step 4 — strict engine-only
// policy: 404 instead of synthesizing). The function had no in-tree callers
// and its `getGrokClient` import was already commented out at the top of the
// file, so it would have errored at runtime if ever reached.
//
// We are now committed to the rule: no AI hallucinations for GTO math. The
// SCENARIO/psychology branch in /api/training/explain-answer.js is the ONLY
// remaining LLM call for the training pipeline, and it uses grok-3-mini.
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Enrich a legacy cached question with all GTO Wizard-level fields.
 * Ensures heroCards, boardCards, gtoFrequencies, evData always exist.
 * This makes every question render full GTO feedback UI.
 *
 * NOTE (Operation Grok-Sweep, 2026-05): renamed from enrichGrokQuestion.
 * The function does NOT call any LLM — it deterministically backfills missing
 * fields on cached question rows that were authored before the GTO-Wizard UI
 * fields existed. New questions never need this; only legacy cache entries do.
 */
function enrichLegacyCachedQuestion(q, gameConfig, level, gameType) {
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

    // 2.5. Phase 36: GTO Engine Identical/Collision Check
    let seenCards = new Set();
    let collision = false;
    (q.heroCards || []).forEach(c => {
        if (seenCards.has(c)) collision = true;
        seenCards.add(c);
    });
    (q.boardCards || []).forEach(c => {
        if (seenCards.has(c)) collision = true;
        seenCards.add(c);
    });

    if (collision) {
        console.warn('[GetQuestion] AI hallucinated duplicate cards! Fallback triggered.');
        q.heroCards = ['As', 'Ks'];
        q.boardCards = q.boardCards.length ? ['2d', '7c', '9h'].slice(0, q.boardCards.length) : [];
        q.scenario.heroHand = 'As Ks';
        q.scenario.board = q.boardCards.join(' ');
    }

    // 3. Ensure gtoFrequencies exist (map option ids to 0-100 percentages)
    if (!q.gtoFrequencies || Object.keys(q.gtoFrequencies || {}).length === 0) {
        q.gtoFrequencies = {};
        let remaining = 100;

        // Map options safely
        const mappedOptions = options.map((opt, idx) => ({
            id: opt.id || String.fromCharCode(97 + idx),
            isCorrect: (opt.id || String.fromCharCode(97 + idx)) === correctAnswer
        }));

        const correctOpt = mappedOptions.find(o => o.isCorrect);
        if (correctOpt) {
            const dominance = Math.max(35, 80 - (level * 4)) + (hashSeed(correctOpt.id + (q.id || '')) % 10);
            q.gtoFrequencies[correctOpt.id] = Math.min(dominance, remaining);
            remaining -= q.gtoFrequencies[correctOpt.id];
        }

        // Distribute remaining evenly/deterministically among incorrect options
        const incorrectOpts = mappedOptions.filter(o => !o.isCorrect);
        incorrectOpts.forEach((opt, idx) => {
            const isLast = idx === incorrectOpts.length - 1;
            if (isLast) {
                q.gtoFrequencies[opt.id] = Math.max(0, remaining);
            } else {
                const share = Math.floor(remaining / (incorrectOpts.length - idx)) + (hashSeed(opt.id) % 5) - 2;
                const clampedShare = Math.max(0, Math.min(share, remaining));
                q.gtoFrequencies[opt.id] = clampedShare;
                remaining -= clampedShare;
            }
        });

        const sum = Object.values(q.gtoFrequencies || {}).reduce((s, v) => s + v, 0);
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
    // Operation Grok-Sweep: default tag is now CACHED_LEGACY (was GROK_GTO).
    // Older rows already in the cache may still have q.source === 'GROK_GTO',
    // which is fine — we don't overwrite an existing tag.
    if (!q.source) q.source = 'CACHED_LEGACY';

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


// Deploy trigger Wed Jan 28 23:02:33 CST 2026
