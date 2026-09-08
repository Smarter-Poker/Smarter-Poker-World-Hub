import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
/**
 * GET /api/training/get-question
 * Fetches next question for a training game session
 *
 * Query params:
 * - gameId: Game identifier
 * - userId: User ID (for no-repeat tracking)
 * - level: Current level (1-12)
 * - engineType: PIO | CHART | SCENARIO
 */

import { createClient } from '../../../src/lib/supabaseServerClient';
// ═══ Phase GTO-CLONE: Grok AI removed — all questions from engines only ═══
// import { getGrokClient } from '../../../src/lib/grokClient';
import TRAINING_CONFIG from '../../../src/config/trainingConfig';
import { getGameConfig } from '../../../src/config/gameConfigs';
import { pioQueryService } from '../../../src/services/PIOQueryService';
import { getGameScenarioConfig } from '../../../src/config/GameScenarioMap';
import { deterministicEngine } from '../../../src/engines/DeterministicGTOEngine';
import { applyDeterministicEnginePatches } from '../../../src/engines/deterministicEnginePatches';
// 2026-07-19 engine-audit runtime patches (see that module's header)
applyDeterministicEnginePatches(deterministicEngine);
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { sanitizeParam, withTiming, reconcileAnswerKey } from '../../../src/utils/trainingApiUtils';
import { reportApiError } from '../../../src/lib/sentryWrap';
import { filterCachedRowsForGame } from '../../../src/lib/training/cacheContract.mjs';
import { enforceTrainingQuestionContract, isTrainingQuestionValid } from '../../../src/lib/training/questionContract.mjs';
import { enforceSolverClaimHonesty, normalizeAuditedChartQuestion } from '../../../src/lib/training/solverDecisionEvidence';
import {
  isTrainingPersistenceUnavailable,
  runTrainingPersistenceQuery,
  trainingPersistenceUnavailableBody,
} from '../../../src/lib/training/trainingPersistence.mjs';
import {
  createTrainingSessionId,
} from '../../../src/lib/training/gradingReceipt.mjs';
import { trainingMasteryMinimum } from '../../../src/lib/training/sessionAttemptContract.mjs';
import {
  isTrainingAttemptContractError,
  isTrainingQuestionCampaignEligible,
  prepareTrainingAttemptDelivery,
  recordTrainingQuestionsServedForAttempt,
  recoverTrainingAttemptHand,
} from '../../../src/lib/training/trainingAttemptDelivery.mjs';
import {
  normalizeTrainingGameMode,
  normalizeTrainingHandSelection,
  trainingQuestionMatchesSelection,
} from '../../../src/lib/training/questionSelectionContract.mjs';
import {
  buildTrainingCacheRow,
  cacheQuestionFromRow,
  cacheRowIsServingEligible,
  withPersistedCacheReceipt,
} from '../../../src/lib/training/cacheTruthPersistence.mjs';

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
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('Vary', 'Authorization');
    withTiming(res);
    if (!applyRateLimit(req, res, LIMITS.read)) return;

    // BUG #245 FIX: Require JWT auth
    const _token = req.headers.authorization?.replace('Bearer ', '');
    if (!_token) return res.status(401).json({ success: false, error: 'Auth required' });
    const { user: authUser, error: authErr } = await getServerUserWithFallback(req, getSupabase());
    const authData = { user: authUser };
    const _authUser = authData?.user;
    if (authErr || !_authUser)
      return res.status(401).json({ success: false, error: 'Invalid token' });

    if (req.method !== 'GET') {
      return res.status(405).json({ success: false, error: 'Method not allowed' });
    }

    const {
      gameId: rawGameId,
      level: rawLevel = 1,
      engineType: rawEngine = 'PIO',
      difficulty: rawDifficulty = 'standard',
      sessionId: rawSessionId,
      handOrdinal: rawHandOrdinal = '1',
      gameMode: rawGameMode,
      handSelection: rawHandSelection,
      targetStreet: rawTargetStreet,
    } = req.query;
    const gameId = sanitizeParam(rawGameId, 100);
    const level = Math.min(12, Math.max(1, parseInt(rawLevel, 10) || 1));
    const engineType = ['PIO', 'CHART', 'SCENARIO'].includes(rawEngine) ? rawEngine : 'PIO';
    const difficulty = ['beginner', 'standard', 'expert', 'simple', 'grouped', 'exact'].includes(String(rawDifficulty).toLowerCase())
      ? String(rawDifficulty).toLowerCase()
      : 'standard';
    const requestedSessionId = sanitizeParam(rawSessionId, 180);
    const hasExplicitSessionId = Boolean(requestedSessionId);
    const trainingSessionId = requestedSessionId || createTrainingSessionId();
    const gameMode = normalizeTrainingGameMode(rawGameMode);
    const handSelection = normalizeTrainingHandSelection(rawHandSelection);
    const validStreets = new Set(['preflop', 'flop', 'turn', 'river']);
    const requestedStreet = String(rawTargetStreet || '').trim().toLowerCase();
    const targetStreet = gameMode === 'street' && validStreets.has(requestedStreet)
      ? requestedStreet
      : null;
    if (gameMode === 'street' && !targetStreet) {
      return res.status(400).json({
        success: false,
        error: 'A valid targetStreet is required for street training.',
        code: 'TRAINING_ATTEMPT_SELECTION_INVALID',
      });
    }
    const attemptSelection = { gameMode, handSelection, targetStreet };
    const handOrdinal = Math.min(
      trainingMasteryMinimum(level),
      Math.max(1, Number.parseInt(rawHandOrdinal, 10) || 1),
    );
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
      const game = TRAINING_LIBRARY.find((g) => g.id === gameId);

      if (!game) {
        return res.status(404).json({ success: false, error: 'Game not found' });
      }

      // Get comprehensive game configuration
      const gameConfig = getGameConfig(gameId);
      const gameType = gameConfig.gameType; // 'cash', 'tournament', or 'sng'
      const preferredEngine = gameConfig.engine; // 'PIO', 'CHART', or 'SCENARIO'
      const sourceOfTruth = pioQueryService.getGameConfig(gameId)?.sourceOfTruth;
      const buildCanonicalCandidate = (candidate, sourceRow = null) => buildTrainingCacheRow({
        question: candidate,
        questionId: sourceRow?.question_id || candidate?.id,
        gameId,
        questionKind: preferredEngine === 'SCENARIO' ? 'SCENARIO'
          : sourceOfTruth === 'ICMIZER' ? 'CHART' : 'PIO',
        gameType: String(gameId).startsWith('mtt-') ? 'tournament'
          : String(gameId).startsWith('spins-') ? 'sng' : 'cash',
        level,
        generatedAt: sourceRow?.generated_at || new Date().toISOString(),
        id: sourceRow?.id || null,
      });

      // Retry an already-registered ordinal from its immutable attempt
      // manifest before consulting the mutable serving cache. A refresh may
      // remove or replace the source row, but it cannot erase a hand that won
      // the original registration race.
      let attemptConfig = attemptSelection;
      let recovered = null;
      let recoveryFailure = null;
      const recoverWithConfig = (config) => recoverTrainingAttemptHand({
        supabase: getSupabase(),
        userId,
        clientSessionId: trainingSessionId,
        gameId,
        level,
        sessionKind: 'campaign',
        difficultyMode: difficulty,
        requestedHands: trainingMasteryMinimum(level),
        handOrdinal,
        config,
        questionSelection: attemptSelection,
      });
      if (hasExplicitSessionId) {
        try {
          recovered = await recoverWithConfig(attemptConfig);
        } catch (initialRecoveryError) {
          const canResumePredecessorConfig = initialRecoveryError?.code === 'TRAINING_ATTEMPT_NONCE_CONFLICT'
            && attemptSelection.gameMode === 'full'
            && attemptSelection.handSelection === 'all'
            && attemptSelection.targetStreet === null;
          if (canResumePredecessorConfig) {
            // The immediately preceding release bound this nonce to
            // { engineType }. Open attempts expire after 24 hours, so this exact
            // compatibility retry is bounded. Constrained drills never use it.
            attemptConfig = { engineType };
            try {
              recovered = await recoverWithConfig(attemptConfig);
            } catch (legacyRecoveryError) {
              recoveryFailure = legacyRecoveryError;
            }
          } else {
            recoveryFailure = initialRecoveryError;
          }
        }
      }
      if (recoveryFailure) {
        console.warn('[Training] Attempt recovery failed:', recoveryFailure?.message || recoveryFailure);
        if (isTrainingAttemptContractError(recoveryFailure)) {
          return res.status(recoveryFailure.status || 409).json({
            success: false,
            error: recoveryFailure.message,
            code: recoveryFailure.code,
          });
        }
        return res.status(503).json(trainingPersistenceUnavailableBody());
      }
      if (recovered?.questions?.length === 1) {
        await recordTrainingQuestionsServedForAttempt(getSupabase(), {
          userId,
          delivery: recovered,
        });
        return res.status(200).json({
          success: true,
          question: recovered.questions[0],
          level,
          sessionId: trainingSessionId,
          attemptId: recovered.attemptId,
          sessionKind: recovered.sessionKind,
          targetHands: recovered.targetHands,
          passThreshold: TRAINING_CONFIG.passThresholds[level] || 85,
          gameType,
          engineType,
        });
      }

      // ═══════════════════════════════════════════════════════════════════
      // STEP 2: GET SEEN QUESTIONS (No-Repeat Logic)
      // ═══════════════════════════════════════════════════════════════════
      let seenQuestionIds = [];
      if (userId) {
        try {
          const { data: seen } = await runTrainingPersistenceQuery(
            () => getSupabase()
              .from('user_seen_questions')
              .select('question_id')
              .eq('user_id', userId)
              .eq('game_id', gameId)
              .limit(100),
            { label: 'GetQuestion:seen-read' },
          );
          seenQuestionIds = (seen || []).map((s) => s.question_id);
        } catch (seenError) {
          // Seen history is an optimization, not grading truth. Bound the wait
          // and continue without de-duplication rather than hanging delivery.
          console.warn('[Training] Seen history unavailable; continuing without exclusion:', seenError.message);
        }
      }

      // ═══════════════════════════════════════════════════════════════════
      // STEP 3: CACHED QUESTIONS — PRIMARY SOURCE (Phase 92 reorder)
      // ═══════════════════════════════════════════════════════════════════
      // Cache rows are the canonical truth: pre-rebalanced (Phase 77/78/79/80
      // pedagogical curve), pre-enriched (Phase 83/88 contextual explanations),
      // and pre-validated (Phase 82 integrity audit: 0 issues across 27,413 rows).
      // Fresh-from-solver regeneration loses all of that pedagogical work, so
      // we try cache FIRST and fall back to engines only on cache miss.
      let question = null;
      let canonicalPayload = null;

      {
        let cachedQuestions;
        try {
          const cachedResult = await runTrainingPersistenceQuery(
            () => getSupabase()
              .from('training_question_cache')
              .select('id, question_data, question_id, engine_type, question_kind, canonical_policy, source_classification, quality_status, policy_version, policy_checksum, generated_at, source_created_at')
              .eq('game_id', gameId)
              .eq('level', level)
              .in('quality_status', ['active', 'active_fallback'])
              .limit(50),
            { label: 'GetQuestion:cache-read' },
          );
          cachedQuestions = cachedResult.data;
        } catch (cacheError) {
          if (isTrainingPersistenceUnavailable(cacheError)) {
            return res.status(503).json(trainingPersistenceUnavailableBody());
          }
          throw cacheError;
        }

        // roadmap #16 -- same declared-street rule the batch route applies. The
        // cache is the primary source here too (Phase 92 reorder), so a game
        // that declares a street must not be handed a cached row of another
        // one; when the filter empties the pool the engine path below runs,
        // which is the correct source for a declaration the cache predates.
        const eligibleCached = filterCachedRowsForGame(
          (cachedQuestions || [])
            .map((row) => ({ ...row, question_data: cacheQuestionFromRow(row) }))
            .filter((row) => cacheRowIsServingEligible(row) && !seenQuestionIds.includes(row.question_id)),
          pioQueryService.getGameConfig(gameId),
        ).map((row) => ({
          ...row,
          question_data: normalizeCampaignQuestionWithoutFabrication(row?.question_data),
        })).filter((row) => (
          row.question_data
          && trainingQuestionMatchesSelection(row.question_data, attemptSelection)
        ));

        if (eligibleCached && eligibleCached.length > 0) {
          const randomIndex = Math.floor(Math.random() * eligibleCached.length);
          const randomizedCandidates = [
            ...eligibleCached.slice(randomIndex),
            ...eligibleCached.slice(0, randomIndex),
          ];
          for (const candidateRow of randomizedCandidates) {
            const candidateQuestion = candidateRow.question_data;
            if (candidateQuestion) {
              candidateQuestion.id = candidateRow.question_id || candidateQuestion.id;
            }
            try {
              const candidatePayload = buildCanonicalCandidate(candidateQuestion, candidateRow);
              question = candidateQuestion;
              canonicalPayload = candidatePayload;
              break;
            } catch (candidateError) {
              console.warn(
                `[Training] Skipping an uncanonicalizable cached candidate ${String(candidateRow.question_id || candidateQuestion?.id || 'unknown')}:`,
                candidateError?.message || candidateError,
              );
            }
          }
        }
      }

      // ═══════════════════════════════════════════════════════════════════
      // STEP 4: DETERMINISTIC ENGINE — FALLBACK (cache miss only)
      // ═══════════════════════════════════════════════════════════════════
      const pioConfig = pioQueryService.getGameConfig(gameId);
      const scenarioConfig = getGameScenarioConfig(gameId);

      if (!question && pioConfig) {
        // Inject service-role client so engine bypasses RLS
        deterministicEngine.setSupabaseClient(getSupabase());
        try {
          const generated = await deterministicEngine.generateBatch({
            gameId,
            level: parseInt(level, 10),
            count: gameMode === 'street' || handSelection !== 'all'
              ? Math.min(50, trainingMasteryMinimum(level) * 2)
              : 1,
            seenIds: seenQuestionIds,
            gameConfig: pioConfig,
            targetStreet: targetStreet || undefined,
            targetPositions: scenarioConfig?.positions || undefined,
            scenarioLevels: scenarioConfig?.scenarioLevels || undefined,
            spotTypes: scenarioConfig?.spotTypes || undefined,
            stackDepths: scenarioConfig?.stackDepths || undefined,
          });
          const generatedCandidates = (generated || [])
            .map((candidate) => normalizeCampaignQuestionWithoutFabrication(candidate))
            .filter((candidate) => candidate && trainingQuestionMatchesSelection(candidate, attemptSelection));
          for (const candidate of generatedCandidates) {
            try {
              const candidatePayload = buildCanonicalCandidate(candidate);
              question = candidate;
              canonicalPayload = candidatePayload;
              break;
            } catch (candidateError) {
              console.warn(
                `[Training] Skipping an uncanonicalizable generated candidate ${String(candidate?.id || 'unknown')}:`,
                candidateError?.message || candidateError,
              );
            }
          }
          if (question) {
            console.debug(
              `[Training] Deterministic engine served (cache miss): ${question.source}`
            );
          }
        } catch (detErr) {
          console.warn('[Training] ▲ Deterministic engine failed, falling back:', detErr.message);
        }
      }

      // There is deliberately no second, permissive legacy PIO fallback here.
      // The deterministic engine is the sole solver reader because it applies
      // the strict v2 bridge, legacy sanitizer, board/hand checks, and EV gate.
      // If that reader rejects the warehouse row, return an honest unavailable
      // response instead of grading from corrupt data or inventing an action.
      if (!question && preferredEngine === 'SCENARIO') {
    console.debug(`[Training] SCENARIO engine for ${gameId} - engine-only, no Grok.`);
      }

      // ═══════════════════════════════════════════════════════════════════
      // STEP 4: ENGINE-ONLY — No AI fallback
      // Questions come from the deterministic engine's verified sources or the
      // sealed Supabase cache. Local postflop heuristics are never an API fallback.
      // ═══════════════════════════════════════════════════════════════════
      if (!question) {
        console.warn(
          `[Training] No question available for ${gameId} level ${level} - all engines returned empty.`
        );
      }

      if (!question) {
        const constrainedAttempt = gameMode === 'street' || handSelection !== 'all';
        return res.status(constrainedAttempt ? 422 : 404).json({
          success: false,
          error: constrainedAttempt
            ? 'No canonical question satisfies this immutable drill configuration.'
            : 'No questions available',
          code: constrainedAttempt ? 'TRAINING_ATTEMPT_QUESTION_SHORTFALL' : undefined,
          message: constrainedAttempt ? undefined : 'All questions for this game have been completed',
        });
      }

      question = normalizeCampaignQuestionWithoutFabrication(question);
      if (!question) {
        console.warn('[Training] Question rejected by integrity or campaign authority contract.');
        return res.status(422).json({
          success: false,
          error: 'This question did not pass the Training integrity and authority audit.',
          code: 'TRAINING_ATTEMPT_QUESTION_AUTHORITY_INELIGIBLE',
        });
      }

      // Persist the exact post-contract envelope before serving so the answer
      // API can independently regrade the same question. Authority-ineligible
      // legacy, heuristic, simulated, and incomplete rows cannot reach here.
      if (question?.id) {
        if (!canonicalPayload) {
          return res.status(422).json({
            success: false,
            error: 'This question did not pass canonical persistence validation.',
            code: 'TRAINING_ATTEMPT_QUESTION_AUTHORITY_INELIGIBLE',
          });
        }
        try {
          const persisted = await runTrainingPersistenceQuery(
            () => getSupabase()
              .from('training_question_cache')
              .upsert(canonicalPayload, {
                onConflict: 'question_id',
                defaultToNull: false,
              })
              .select('question_id, question_data, canonical_policy, source_classification, quality_status, policy_version, policy_checksum')
              .maybeSingle(),
            { label: 'GetQuestion:canonicalize' },
          );
          if (!persisted.data?.question_id || !persisted.data?.policy_checksum) {
            throw new Error('Canonical cache persistence returned no verifiable receipt');
          }
          question = withPersistedCacheReceipt(canonicalPayload.question_data, persisted.data);
        } catch (canonicalizeError) {
          console.warn('[Training] Refusing to serve an uncanonicalized question:', canonicalizeError.message);
          return res.status(503).json(trainingPersistenceUnavailableBody());
        }
      } else {
        return res.status(422).json({
          success: false,
          error: 'This question has no canonical identifier.',
        });
      }

      let delivery;
      try {
        delivery = await prepareTrainingAttemptDelivery({
          supabase: getSupabase(),
          userId,
          clientSessionId: trainingSessionId,
          gameId,
          level,
          sessionKind: 'campaign',
          difficultyMode: difficulty,
          requestedHands: trainingMasteryMinimum(level),
          questions: [question],
          handOrdinalStart: handOrdinal,
          requireFullAttempt: false,
          config: attemptConfig,
        });
      } catch (deliveryError) {
        console.warn('[Training] Attempt delivery failed:', deliveryError?.message || deliveryError);
        if (isTrainingAttemptContractError(deliveryError)) {
          return res.status(deliveryError.status || 409).json({
            success: false,
            error: deliveryError.message,
            code: deliveryError.code,
          });
        }
        return res.status(503).json(trainingPersistenceUnavailableBody());
      }
      const servedQuestion = delivery.questions[0];
      try {
        await recordTrainingQuestionsServedForAttempt(getSupabase(), {
          userId,
          delivery,
        });
      } catch (servedAuditError) {
        console.warn('[Training] Delivered question audit failed:', servedAuditError?.message || servedAuditError);
        return res.status(503).json(trainingPersistenceUnavailableBody());
      }

      return res.status(200).json({
        success: true,
        question: servedQuestion,
        level: parseInt(level, 10),
        sessionId: trainingSessionId,
        attemptId: delivery.attemptId,
        sessionKind: delivery.sessionKind,
        targetHands: delivery.targetHands,
        passThreshold: TRAINING_CONFIG.passThresholds[level] || 85,
        gameType, // Return game type for debugging
        engineType,
      });
    } catch (error) {
      console.warn('[Training] ✕ Get question error:', error);
      return res.status(500).json({ success: false, error: 'Internal server error' });
    }
  } catch (err) {
    try {
      reportApiError(err, req);
    } catch (_sentryErr) {
      console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr);
    }
    console.warn('[API Error]', err);
    if (!res.headersSent)
      return res.status(500).json({ success: false, error: 'Internal server error' });
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
 * Losslessly normalize a canonical source row. Missing poker state is an
 * authority failure; this path never manufactures cards, boards, seats,
 * streets, pot geometry, stacks, frequencies, or provenance.
 */
function normalizeCampaignQuestionWithoutFabrication(q) {
  if (!q || typeof q !== 'object' || Array.isArray(q)) return null;
  if (String(q.type || '').toUpperCase() === 'CHART') normalizeAuditedChartQuestion(q);

  // ═══ 2026-07-19 AUDIT FIX: reconcile answer key with solver frequencies
  // BEFORE enrichment. ~7% of cached rows had correctAnswer /
  // correctAnswerText / gtoFrequencies contradicting their own
  // `frequencies` distribution (grading key vs displayed label vs bars). ═══
  reconcileAnswerKey(q);

  // Audited local sources sometimes store the same exact distribution as
  // decimals under `frequencies`. Converting that view to percentages is
  // lossless; no percentage is inferred from the correct-answer key.
  if (!q.gtoFrequencies || Object.keys(q.gtoFrequencies || {}).length === 0) {
    if (q.frequencies && typeof q.frequencies === 'object') {
      const measured = Object.fromEntries(Object.entries(q.frequencies)
        .filter(([, value]) => Number.isFinite(Number(value)) && Number(value) >= 0 && Number(value) <= 1)
        .map(([action, value]) => [action, Math.round(Number(value) * 100)]));
      if (Object.keys(measured).length > 0) q.gtoFrequencies = measured;
    }
  }

  const canonical = enforceTrainingQuestionContract(enforceSolverClaimHonesty(q));
  return isTrainingQuestionValid(canonical) && isTrainingQuestionCampaignEligible(canonical)
    ? canonical
    : null;
}

// Deploy trigger Wed Jan 28 23:02:33 CST 2026
