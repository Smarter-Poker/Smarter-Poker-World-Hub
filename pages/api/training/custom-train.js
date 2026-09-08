import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
import { createHash, randomUUID } from 'node:crypto';
/**
 * GET /api/training/custom-train
 * Fetches training questions based on custom trainer configuration.
 * Queries DeterministicGTOEngine with user-specified filters.
 *
 * Query params:
 * - gameType: 'cash' | 'mtt' | 'spins'
 * - position: Hero position (e.g., 'BTN', 'BB')
 * - stackDepth: Stack depth in BB (e.g., 100)
 * - street: Specific street ('flop', 'turn', 'river') or omit for random
 * - boardTexture: 'dry_rainbow' | 'monotone' | 'two_tone' | 'paired' |
 *   'connected' | 'broadway' (or 'any' / omitted). Applied to the board
 *   encoded in scenario_hash, not in SQL — see BOARD_TEXTURE_PREDICATES.
 * - count: Number of questions (default 25)
 */

import { createClient } from '../../../src/lib/supabaseServerClient';
import { DeterministicGTOEngine } from '../../../src/engines/DeterministicGTOEngine';
import { applyDeterministicEnginePatches } from '../../../src/engines/deterministicEnginePatches';
import { SolverPolicyService } from '../../../src/services/SolverPolicyService.js';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { sanitizeParam, withTiming } from '../../../src/utils/trainingApiUtils';
import { reportApiError } from '../../../src/lib/sentryWrap';
import { enforceTrainingQuestionContract, isTrainingQuestionValid } from '../../../src/lib/training/questionContract.mjs';
import {
    createTrainingSessionId,
} from '../../../src/lib/training/gradingReceipt.mjs';
import {
    isTrainingAttemptContractError,
    prepareTrainingAttemptDelivery,
    recordTrainingQuestionsServedForAttempt,
} from '../../../src/lib/training/trainingAttemptDelivery.mjs';
import {
    trainingQuestionMatchesSelection,
    normalizeTrainingGameMode,
    normalizeTrainingHandSelection,
} from '../../../src/lib/training/questionSelectionContract.mjs';
import {
    trainingPersistenceUnavailableBody,
} from '../../../src/lib/training/trainingPersistence.mjs';
import {
    CustomTrainingConfigError,
    customTrainingBoardMatchesTexture,
    customTrainingAttemptConfig,
    customTrainingQuestionMatchesConfig,
    normalizeCustomTrainingConfig,
} from '../../../src/lib/training/customTrainerConfigContract.mjs';

import { persistCanonicalTrainingQuestions } from '../../../src/lib/training/cacheTruthPersistence.mjs';

// ●● Lazy Supabase getter (SSG-safe) ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
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
// ═══════════════════════════════════════════════════════════════════════════
// BOARD TEXTURE TARGETING (GTOW parity #8)
// ═══════════════════════════════════════════════════════════════════════════
// The authority-joining catalog RPC has no board-texture parameter. The board
// is encoded in the last underscore segment of `scenario_hash`
// ("hu_cash_BTN_100bb_3h7c7s"), so an admitted row's texture is knowable
// without touching the solver payload or building the question.
// Filtering here — on rows, before DeterministicGTOEngine runs — is both
// cheaper than filtering built questions and keeps `buildAndReturnQuestions`
// unaware that texture exists.
//
// This mirrors DeterministicGTOEngine's own private parseBoardFromHash rather
// than importing it (it is not exported, and the engine module is heavy).
// Kept deliberately identical in behaviour: same segment, same 2-char stride,
// same rank/suit validation, same "return nothing rather than guess" on a
// preflop hash whose tail is not a board.
function parseBoardFromHash(scenarioHash) {
    if (!scenarioHash || typeof scenarioHash !== 'string') return [];
    const parts = scenarioHash.split('_');
    const boardStr = parts[parts.length - 1];
    if (!boardStr || boardStr.length < 4) return [];

    const cards = [];
    for (let i = 0; i + 1 < boardStr.length; i += 2) {
        const card = boardStr.substring(i, i + 2);
        if (/^[2-9TJQKA][shdc]$/i.test(card)) cards.push(card);
    }
    return cards;
}

// The modal's chip ids expressed against BoardTextureEngine's analysis.
// Written as predicates over one `analyzeBoard()` result rather than as
// `matchesBoardFilter` filter objects because two of the six chips cannot be
// expressed as field equality: "Paired" must also admit trips (a player
// asking for paired boards means "not unpaired", and excluding 7-7-7 would be
// a surprise), and "Broadway" is a two-high-cards property, not the `height`
// bucket — a lone ace makes a board HIGH by avgRank without making it a
// broadway board. Evaluating one analysis against a predicate also costs a
// single pass per row instead of one per filter field.
/**
 * Keep only rows whose board matches the requested texture.
 * Returns the input untouched when no texture is requested or the id is not
 * one this build knows, so an unrecognised chip degrades to "any board"
 * rather than to an empty session.
 */
function filterScenariosByTexture(scenarios, textureId) {
    if (!Array.isArray(scenarios)) return scenarios;

    return scenarios.filter(row => {
        const board = parseBoardFromHash(row?.scenario_hash);
        return customTrainingBoardMatchesTexture(board, textureId);
    });
}

export default async function handler(req, res) {
  try {
      res.setHeader('Cache-Control', 'private, no-store');
      res.setHeader('Vary', 'Authorization');
      withTiming(res);
      if (!applyRateLimit(req, res, LIMITS.read)) return;

      // Auth
      const token = req.headers.authorization?.replace('Bearer ', '');
      if (!token) return res.status(401).json({ success: false, error: 'Auth required' });
      const { user: authUser, error: authErr } = await getServerUserWithFallback(req, getSupabase());
    const authData = { user: authUser };
      const user = authData?.user;
      if (authErr || !user) return res.status(401).json({ success: false, error: 'Invalid token' });

      if (req.method !== 'GET') {
          return res.status(405).json({ success: false, error: 'Method not allowed' });
      }

      const {
          gameId: rawGameId,
          gameType = 'cash',
          position,
          villainPosition,
          actionScenario,
          stackDepth = '100',
          street,
          handClass,
          boardTexture,
          spotType,
          count = '25',
          level = '1',
          difficulty = 'standard',
          sessionId: rawSessionId,
          gameMode: rawGameMode,
          handSelection: rawHandSelection,
      } = req.query;
      const gameId = sanitizeParam(rawGameId, 100);
      if (!gameId) {
          return res.status(400).json({ success: false, error: 'gameId is required' });
      }

      let customConfig;
      try {
          customConfig = normalizeCustomTrainingConfig({
              gameType,
              position,
              villainPosition,
              actionScenario,
              stackDepth,
              street,
              handClass,
              boardTexture,
              spotType,
              count,
          });
      } catch (configError) {
          if (configError instanceof CustomTrainingConfigError) {
              return res.status(configError.status).json({
                  success: false,
                  error: configError.message,
                  code: configError.code,
                  field: configError.field,
              });
          }
          throw configError;
      }
      const {
          gameType: safeGameType,
          position: safePosition,
          stackDepth: parsedStack,
          street: safeStreet,
          boardTexture: safeBoardTexture,
          questionsCount: parsedCount,
          pioGameTypes,
      } = customConfig;
      const parsedLevel = Math.min(12, Math.max(1, parseInt(level, 10) || 1));
      const safeDifficulty = ['beginner', 'standard', 'expert', 'simple', 'grouped', 'exact'].includes(String(difficulty).toLowerCase())
          ? String(difficulty).toLowerCase()
          : 'standard';
      const gameMode = normalizeTrainingGameMode(rawGameMode);
      const handSelection = normalizeTrainingHandSelection(rawHandSelection);
      const deliveryContext = {
          userId: user.id,
          gameId,
          gameType: safeGameType,
          level: parsedLevel,
          difficultyMode: safeDifficulty,
          sessionId: sanitizeParam(rawSessionId, 180) || createTrainingSessionId(),
          gameMode,
          handSelection,
      };
      const textureRequested = safeBoardTexture !== 'any';

      try {
          console.debug(`[CustomTrain] Config: ${safeGameType} | ${safePosition} | ${parsedStack}BB | ${parsedCount} hands`);

          // Fetch pool.
          // #8: a texture filter throws rows away AFTER the database has
          // returned them, so the pre-filter pool has to be much larger or the
          // filter starves the session. Monotone flops are roughly 5% of all
          // flops, so a 3x pool would routinely yield one or two questions for
          // a 25-hand request. 12x, capped at 600, keeps a monotone request
          // viable while staying within the service's bounded catalog scan.
          const poolSize = textureRequested
              ? Math.min(parsedCount * 12, 600)
              : Math.min(parsedCount * 3, 150);
          const policyService = new SolverPolicyService({ db: getSupabase() });
          const { rows: rawScenarios } = await policyService.readSolvedRows({
              gameTypes: pioGameTypes,
              stackDepth: parsedStack,
              street: safeStreet === 'all' ? undefined : safeStreet,
              position: safePosition === 'any' ? undefined : safePosition,
              villainPosition: customConfig.villainPosition === 'any'
                  ? undefined
                  : customConfig.villainPosition,
              limit: poolSize,
          });
          // Board texture is an exact part of the requested drill. It may
          // reduce the candidate pool, but it is never silently relaxed.
          const scenarios = textureRequested
              ? filterScenariosByTexture(rawScenarios, safeBoardTexture)
              : rawScenarios;

          if (!scenarios || scenarios.length === 0) {
              return res.status(422).json({
                  success: false,
                  questions: [],
                  code: 'TRAINING_CUSTOM_EXACT_MATCH_UNAVAILABLE',
                  error: 'No solver data matches every selected Custom Training filter.',
              });
          }

          return await buildAndReturnQuestions(res, scenarios, customConfig, deliveryContext);
      } catch (err) {
          console.warn('[CustomTrain] Error:', err);
          return res.status(500).json({ success: false, error: 'Internal server error' });
      }

  } catch (err) {
      try {
          reportApiError(err, req);
      } catch (_sentryErr) {
          console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr);
          void _sentryErr;
      }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}

/**
 * Build questions from scenarios and return response
 */
async function buildAndReturnQuestions(res, scenarios, customConfig, deliveryContext = {}) {
    const count = customConfig.questionsCount;
    const engine = new DeterministicGTOEngine();
    engine.setSupabaseClient(getSupabase());
    applyDeterministicEnginePatches(engine);
    const questions = [];
    const usedIds = new Set();
    const usedDecisionKeys = new Set();

    // BUG-D FIX: Fisher-Yates shuffle (sort-based shuffle is biased in V8 TimSort)
    const shuffled = [...scenarios];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    // A scenario contains up to 169 hand classes. Two passes over rows could
    // never satisfy a 100-hand drill when a rare board-texture filter left
    // fewer than 50 rows. Explore a bounded set of deterministic hand seeds
    // while refusing duplicate scenario+hand decisions.
    const buildBudget = Math.min(
        shuffled.length * 169,
        Math.max(count * 20, shuffled.length * 8),
    );
    for (let i = 0; questions.length < count && i < buildBudget; i++) {
        const scenario = shuffled[i % shuffled.length];
        const gameConfig = {
            sourceOfTruth: 'PioSOLVER',
            pioGameType: scenario.game_type,
            pioStackDepth: scenario.stack_depth,
            handClass: customConfig.handClass,
        };

        const question = engine.buildQuestionFromScenario(scenario, gameConfig, deliveryContext.level, i);
        const sourceQuestionId = String(question?.id || '');
        if (question?.solverProvenance?.verified === true && sourceQuestionId && !usedIds.has(sourceQuestionId)) {
            question.id = `custom:${createHash('sha256').update(JSON.stringify({
                gameId: deliveryContext.gameId,
                sourceQuestionId,
                boardTexture: customConfig.boardTexture,
                handClass: customConfig.handClass,
            })).digest('hex')}`;
            const contractedQuestion = enforceTrainingQuestionContract(question);
            const decisionKey = [
                contractedQuestion?.scenario?.scenarioHash,
                contractedQuestion?.scenario?.heroHand || contractedQuestion?.heroHand,
            ].map((value) => String(value || '')).join('::');
            if (
                isTrainingQuestionValid(contractedQuestion)
                && !usedDecisionKeys.has(decisionKey)
                && customTrainingQuestionMatchesConfig(contractedQuestion, customConfig)
                && trainingQuestionMatchesSelection(
                    contractedQuestion,
                    {
                        gameMode: deliveryContext.gameMode,
                        targetStreet: customConfig.street === 'all' ? null : customConfig.street,
                        handSelection: deliveryContext.handSelection,
                    },
                )
            ) {
                const canonicalQuestion = contractedQuestion;
                if (!isTrainingQuestionValid(canonicalQuestion)) continue;
                questions.push(canonicalQuestion);
                usedIds.add(sourceQuestionId);
                usedDecisionKeys.add(decisionKey);
            }
        }

        if (questions.length >= count) break;
    }

    console.debug(`[CustomTrain] Generated ${questions.length}/${count} questions from ${scenarios.length} scenarios`);

    if (questions.length !== count) {
        return res.status(422).json({
            success: false,
            questions: [],
            code: 'TRAINING_CUSTOM_EXACT_MATCH_SHORTFALL',
            error: `Only ${questions.length} of ${count} required solver questions match every selected filter.`,
            matched: questions.length,
            required: count,
        });
    }

    let servedQuestions;
    try {
        servedQuestions = await persistCanonicalTrainingQuestions(getSupabase(), {
            questions,
            gameId: deliveryContext.gameId,
            questionKind: 'PIO',
            gameType: deliveryContext.gameType === 'mtt' ? 'tournament'
                : deliveryContext.gameType === 'spins' ? 'sng' : 'cash',
            level: deliveryContext.level,
            userId: deliveryContext.userId,
            requestId: randomUUID(),
            recordServed: false,
            label: 'CustomTrain:canonicalize',
        });
    } catch (canonicalizeError) {
        console.warn('[CustomTrain] Refusing to serve uncanonicalized questions:', canonicalizeError.message);
        return res.status(503).json(trainingPersistenceUnavailableBody());
    }

    let delivery;
    try {
        delivery = await prepareTrainingAttemptDelivery({
            supabase: getSupabase(),
            userId: deliveryContext.userId,
            clientSessionId: deliveryContext.sessionId,
            gameId: deliveryContext.gameId,
            level: deliveryContext.level,
            sessionKind: 'custom',
            difficultyMode: deliveryContext.difficultyMode,
            requestedHands: count,
            questions: servedQuestions,
            requireFullAttempt: true,
            config: customTrainingAttemptConfig(customConfig, deliveryContext),
        });
    } catch (deliveryError) {
        console.warn('[CustomTrain] Attempt delivery failed:', deliveryError?.message || deliveryError);
        if (isTrainingAttemptContractError(deliveryError)) {
            return res.status(deliveryError.status || 409).json({
                success: false,
                error: deliveryError.message,
                code: deliveryError.code,
            });
        }
        return res.status(503).json(trainingPersistenceUnavailableBody());
    }
    try {
        await recordTrainingQuestionsServedForAttempt(getSupabase(), {
            userId: deliveryContext.userId,
            delivery,
        });
    } catch (servedAuditError) {
        console.warn('[CustomTrain] Delivered question audit failed:', servedAuditError?.message || servedAuditError);
        return res.status(503).json(trainingPersistenceUnavailableBody());
    }

    return res.status(200).json({
        success: true,
        questions: delivery.questions,
        sessionId: deliveryContext.sessionId,
        attemptId: delivery.attemptId,
        sessionKind: delivery.sessionKind,
        targetHands: delivery.targetHands,
        totalAvailable: scenarios.length,
        boardTexture: customConfig.boardTexture === 'any' ? null : customConfig.boardTexture,
        boardTextureApplied: customConfig.boardTexture !== 'any',
        exactFiltersApplied: true,
        config: customTrainingAttemptConfig(customConfig, deliveryContext),
    });
}
