import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
/**
 * BATCH QUESTION PRE-LOADER — API Endpoint
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 * Fetches 25 questions for a game level at once
 * Returns array of questions for instant client-side serving
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 */

import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { sanitizeParam, withTiming, reconcileAnswerKey } from '../../../src/utils/trainingApiUtils';
import { deterministicEngine } from '../../../src/engines/DeterministicGTOEngine';
import { applyDeterministicEnginePatches } from '../../../src/engines/deterministicEnginePatches';
// 2026-07-19 engine-audit runtime patches (see that module's header)
applyDeterministicEnginePatches(deterministicEngine);
import { pioQueryService } from '../../../src/services/PIOQueryService';
import { getGameConfig as getGameCfg } from '../../../src/config/gameConfigs';
import { getGameScenarioConfig } from '../../../src/config/GameScenarioMap';
import { filterCachedRowsForGame } from '../../../src/lib/training/cacheContract.mjs';
import { streetOfCachedRow } from '../../../src/lib/training/declaredStreet';
import { enforceTrainingQuestionContract, isTrainingQuestionValid } from '../../../src/lib/training/questionContract.mjs';
import { enforceSolverClaimHonesty, normalizeAuditedChartQuestion } from '../../../src/lib/training/solverDecisionEvidence';
import { reportApiError } from '../../../src/lib/sentryWrap';
import {
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
    filterTrainingQuestionsForAttempt,
    normalizeTrainingGameMode,
    normalizeTrainingHandSelection,
    trainingQuestionMatchesSelection,
} from '../../../src/lib/training/questionSelectionContract.mjs';
import { shuffleBalancedQuestionOrder } from '../../../src/lib/training/questionOrderContract.mjs';
import {
    selectPublicAttestationContinuationAnswerForStrictParent,
    selectTrainingAttestationContinuationCohort,
} from '../../../src/lib/training/trainingContinuationEligibility.mjs';
import {
    validateTrainingAttestationContinuationPrecommit,
} from '../../../src/lib/training/trainingAttestationContinuationContract.mjs';
import {
    buildTrainingCacheRow,
    cacheQuestionFromRow,
    cacheRowIsServingEligible,
    withPersistedCacheReceipt,
} from '../../../src/lib/training/cacheTruthPersistence.mjs';

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

/**
 * Losslessly normalize a canonical row, then enforce the receipt authority
 * boundary. This deliberately does not add cards, a board, seats, a street,
 * pot geometry, stacks, options, frequencies, or provenance that the source
 * did not provide.
 */
function normalizeCampaignQuestionWithoutFabrication(question) {
    if (!question || typeof question !== 'object' || Array.isArray(question)) return null;
    if (String(question.type || '').toUpperCase() === 'CHART') {
        normalizeAuditedChartQuestion(question);
    }
    reconcileAnswerKey(question);

    // Some audited local sources store their exact distribution twice under
    // `frequencies` and `gtoFrequencies`. Reconstruct only the lossless 0-100
    // view; do not infer a distribution from the answer key.
    if ((!question.gtoFrequencies || Object.keys(question.gtoFrequencies).length === 0)
        && question.frequencies && typeof question.frequencies === 'object') {
        const measured = Object.fromEntries(Object.entries(question.frequencies)
            .filter(([, value]) => Number.isFinite(Number(value)) && Number(value) >= 0 && Number(value) <= 1)
            .map(([action, value]) => [action, Math.round(Number(value) * 100)]));
        if (Object.keys(measured).length > 0) question.gtoFrequencies = measured;
    }

    const canonical = enforceTrainingQuestionContract(enforceSolverClaimHonesty(question));
    return isTrainingQuestionValid(canonical) && isTrainingQuestionCampaignEligible(canonical)
        ? canonical
        : null;
}

export default async function handler(req, res) {
  try {
      res.setHeader('Cache-Control', 'private, no-store');
      res.setHeader('Vary', 'Authorization');
      withTiming(res);
      if (!applyRateLimit(req, res, LIMITS.read)) return;

      // BUG-05 FIX: Include success:false for consistent client error parsing
      const _token = req.headers.authorization?.replace('Bearer ', '');
      if (!_token) return res.status(401).json({ success: false, error: 'Auth required' });
      const { user: authUser, error: authErr } = await getServerUserWithFallback(req, getSupabase());
    const authData = { user: authUser };
      const _authUser = authData?.user;
      if (authErr || !_authUser) return res.status(401).json({ success: false, error: 'Invalid token' });

      if (req.method !== 'GET') {
          return res.status(405).json({ success: false, error: 'Method not allowed' });
      }

      const {
          gameId: rawGameId, level = '1', count = '25',
          // ●●● PHASE 15: Weak-spot targeting params ●●●
          targetPositions: rawTargetPositions,  // Comma-separated: "BB,SB"
          targetStreet: rawTargetStreet,         // "flop", "turn", "river"
          // ●●● PHASE 19: Difficulty selector ●●●
          difficulty: rawDifficulty,             // "beginner", "standard", "expert"
          sessionId: rawSessionId,
          handOrdinalStart: rawHandOrdinalStart,
          gameMode: rawGameMode,
          handSelection: rawHandSelection,
          attestationContinuationRule: rawAttestationContinuationRule,
          attestationContinuationPrecommit: rawAttestationContinuationPrecommit,
      } = req.query;
      const gameId = sanitizeParam(rawGameId, 100);
      const attestationContinuationRequested =
          rawAttestationContinuationRule !== undefined
          || rawAttestationContinuationPrecommit !== undefined;

      if (attestationContinuationRequested) {
          const designatedAuditUserId = String(
              process.env.TRAINING_PHASE6_DELIVERY_EXPECTED_AUDIT_USER_ID || '',
          ).trim();
          if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
              designatedAuditUserId,
          ) || String(_authUser.id) !== designatedAuditUserId) {
              return res.status(403).json({
                  success: false,
                  error: 'This production attestation cohort is restricted to the designated audit account.',
                  code: 'TRAINING_ATTESTATION_AUDIT_ACCOUNT_REQUIRED',
              });
          }
      }

      if (!gameId) {
          return res.status(400).json({ success: false, error: 'gameId is required' });
      }

      try {
          const gameLevel = Math.min(12, Math.max(1, parseInt(level, 10) || 1));
          const requestedQuestionCount = Math.min(50, Math.max(1, parseInt(count, 10) || 25));
          const attemptTargetHands = trainingMasteryMinimum(gameLevel);
          const isSingleHandRecovery = requestedQuestionCount === 1;
          // Campaign attempts always own the Level Registry's complete hand
          // count. A one-row request is the explicit recovery path; every
          // normal preload receives the full 20/25/30-hand manifest even when
          // an older browser asks for the former global count of 20.
          const questionCount = isSingleHandRecovery ? 1 : attemptTargetHands;
          const gameMode = normalizeTrainingGameMode(rawGameMode);
          const handSelection = normalizeTrainingHandSelection(rawHandSelection);
          // Selection happens before the immutable attempt manifest is signed.
          // Pull a larger candidate pool for selective drills so the browser
          // still receives the attempt's complete 20/25/30-hand contract.
          // Always retain a bounded surplus until canonical persistence has
          // succeeded. `buildTrainingCacheRow` is deliberately stricter than
          // the source normalization pass, so selecting exactly N candidates
          // here lets one malformed row turn an otherwise healthy N-hand
          // attempt into an outage. Selective drills need a wider pool because
          // their street/frequency filter runs before canonical construction.
          const candidateQuestionCount = attestationContinuationRequested
              ? 100
              : handSelection === 'all'
              ? Math.min(100, Math.max(questionCount + 5, questionCount * 2))
              : Math.min(100, questionCount * 4);
          const handOrdinalStart = isSingleHandRecovery
              ? Math.min(attemptTargetHands, Math.max(1, parseInt(rawHandOrdinalStart, 10) || 1))
              : 1;

          // ●●● PHASE 15: Parse targeting params ●●●
          const targetPositions = rawTargetPositions
              ? rawTargetPositions.split(',').map(p => p.trim().toUpperCase()).filter(p => ['UTG', 'MP', 'CO', 'BTN', 'SB', 'BB', 'HJ', 'UTG+1', 'MP+1'].includes(p))
              : null;
          const validStreets = ['flop', 'turn', 'river', 'preflop'];
          const targetStreet = rawTargetStreet && validStreets.includes(rawTargetStreet.toLowerCase())
              ? rawTargetStreet.toLowerCase()
              : null;
          // ●●● PHASE 19: Difficulty mapping ●●●
          const validDifficulties = ['beginner', 'standard', 'expert', 'simple', 'grouped', 'exact'];
          const difficulty = rawDifficulty && validDifficulties.includes(rawDifficulty.toLowerCase())
              ? rawDifficulty.toLowerCase()
              : 'standard';
          const requestedSessionId = sanitizeParam(rawSessionId, 180);
          const hasExplicitSessionId = Boolean(requestedSessionId);
          const trainingSessionId = requestedSessionId || createTrainingSessionId();
          const enforcedTargetStreet = gameMode === 'street' ? targetStreet : null;
          const attestationContinuationPrecommit = attestationContinuationRequested
              ? validateTrainingAttestationContinuationPrecommit({
                  selectionRule: sanitizeParam(rawAttestationContinuationRule, 100),
                  commitment: sanitizeParam(rawAttestationContinuationPrecommit, 64),
                  sessionId: trainingSessionId,
                  gameId,
                  level: gameLevel,
                  targetHands: attemptTargetHands,
              })
              : null;
          const refuseUnavailableAttestationContinuationCohort = () => res.status(422).json({
              success: false,
              error: 'No exact 20-hand continuation cohort is available for this public precommit.',
              code: 'TRAINING_ATTESTATION_CONTINUATION_COHORT_UNAVAILABLE',
          });
          if (attestationContinuationRequested
              && (!attestationContinuationPrecommit || isSingleHandRecovery)) {
              return refuseUnavailableAttestationContinuationCohort();
          }
          const attemptSelection = {
              gameMode,
              handSelection,
              targetStreet: enforcedTargetStreet,
              ...(attestationContinuationPrecommit
                  ? { attestationContinuationCohort: attestationContinuationPrecommit }
                  : {}),
          };

          // A one-hand request is recovery, not a request to replace an
          // already-registered ordinal with whatever happens to be in today's
          // mutable cache. Resume the manifest winner before reading any source.
          if (isSingleHandRecovery && hasExplicitSessionId) {
              try {
                  const recovered = await recoverTrainingAttemptHand({
                      supabase: getSupabase(),
                      userId: _authUser.id,
                      clientSessionId: trainingSessionId,
                      gameId,
                      level: gameLevel,
                      sessionKind: 'campaign',
                      difficultyMode: difficulty,
                      requestedHands: attemptTargetHands,
                      handOrdinal: handOrdinalStart,
                      config: attemptSelection,
                      questionSelection: attemptSelection,
                  });
                  if (recovered?.questions?.length === 1) {
                      await recordTrainingQuestionsServedForAttempt(getSupabase(), {
                          userId: _authUser.id,
                          delivery: recovered,
                      });
                      return res.status(200).json({
                          success: true,
                          gameId,
                          level: gameLevel,
                          sessionId: trainingSessionId,
                          attemptId: recovered.attemptId,
                          sessionKind: recovered.sessionKind,
                          targetHands: recovered.targetHands,
                          count: recovered.questions.length,
                          questions: recovered.questions,
                      });
                  }
              } catch (recoveryError) {
                  console.warn('[BatchPreload] Attempt recovery failed:', recoveryError?.message || recoveryError);
                  if (isTrainingAttemptContractError(recoveryError)) {
                      return res.status(recoveryError.status || 409).json({
                          success: false,
                          error: recoveryError.message,
                          code: recoveryError.code,
                      });
                  }
                  return res.status(503).json(trainingPersistenceUnavailableBody());
              }
          }


          // Fetch questions from cache
          // 2026-07-19 ENGINE AUDIT FIX: limiting to questionCount BEFORE the
          // shuffle meant Postgres returned the same first-N rows every call —
          // users looped the identical 15 questions per level forever. Over-
          // fetch the pool, then shuffle, then slice.
          // ●●● SEEN-QUESTION EXCLUSION (fail-safe, non-blocking) ●●●
          let seenIds = new Set();
          try {
              const { data: seen } = await runTrainingPersistenceQuery(
                  () => getSupabase()
                      .from('user_seen_questions')
                      .select('question_id')
                      .eq('user_id', _authUser.id)
                      .eq('game_id', gameId)
                      .limit(2000),
                  { label: 'BatchPreload:seen-read' },
              );
              seenIds = new Set((seen || []).map((r) => r.question_id));
          } catch (e) {
              console.warn('[BatchPreload] Seen history unavailable; continuing without exclusion:', e.message);
          }

          // Fetch questions from cache (over-fetch so seen-filtering has room)
          let questions;
          try {
              const cacheResult = await runTrainingPersistenceQuery(
                  () => getSupabase()
                      .from('training_question_cache')
                      .select('id, question_id, question_data, engine_type, question_kind, canonical_policy, source_classification, quality_status, policy_version, policy_checksum, generated_at, source_created_at')
                      .eq('game_id', gameId)
                      .eq('level', gameLevel)
                      .in('quality_status', ['active', 'active_fallback'])
                      .limit(Math.max(100, candidateQuestionCount * 3)),
                  { label: 'BatchPreload:cache-read' },
              );
              questions = cacheResult.data;
          } catch (cacheError) {
              console.warn('[BatchPreload] Canonical cache read unavailable:', cacheError.message);
              return res.status(503).json(trainingPersistenceUnavailableBody());
          }

          // ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
          // SOLVER ENGINE FALLBACK: If cache is empty or insufficient,
          // generate LIVE questions from DeterministicGTOEngine (187k+ records)
          // ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
          // Filter out already-seen questions, but never drop below the
          // requested count — repeats beat 404s.
          // roadmap #16 -- a game that DECLARES a street does not get served
          // cached rows of a different one. The cache is read first by design,
          // so without this the engine's street routing is unreachable in
          // production: cash-001 declares preflop, its cache holds 25 postflop
          // rows per level, 25 > the 20 a session asks for, and the engine
          // branch below never ran. Games that declare no street are untouched.
          const declaredCfg = pioQueryService.getGameConfig(gameId);
          const hydratedCacheRows = (questions || [])
              .map((row) => {
                  const question = cacheQuestionFromRow(row);
                  if (question && row?.question_id) question.id = String(row.question_id);
                  return { ...row, question_data: question };
              })
              .filter((row) => cacheRowIsServingEligible(row));
          const contractedRows = filterCachedRowsForGame(
              hydratedCacheRows.slice(0, candidateQuestionCount * 3),
              declaredCfg,
          );
          const authorityEligibleRows = contractedRows
              .map((row) => ({
                  ...row,
                  question_data: normalizeCampaignQuestionWithoutFabrication(row?.question_data),
              }))
              .filter((row) => row.question_data);
          // An explicit street target is a hard training contract, not a hint.
          // Applying it only to generated rows meant a warm cache silently
          // ignored the user's Turn/Flop/River selection whenever it already
          // held enough mixed-street questions.
          const rows = targetStreet
              ? authorityEligibleRows.filter((row) => streetOfCachedRow(row) === targetStreet)
              : authorityEligibleRows;
          const selectableRows = rows.filter((row) => (
              trainingQuestionMatchesSelection(row?.question_data, attemptSelection)
          ));
          const fresh = seenIds.size > 0
              ? selectableRows.filter((r) => !seenIds.has(r.id) && !seenIds.has(r.question_data?.id))
              : selectableRows;
          const usable = [...(fresh.length >= candidateQuestionCount ? fresh : selectableRows)];
          // Shuffle BEFORE slicing so the same first-N cache rows are not
          // served on every call (2026-07-19 engine-audit intent preserved)
          for (let i = usable.length - 1; i > 0; i--) {
              const j = Math.floor(Math.random() * (i + 1));
              [usable[i], usable[j]] = [usable[j], usable[i]];
          }
          // Apply the immutable drill selection to the complete bounded cache
          // pool before slicing. Sampling four arbitrary rows for a one-hand
          // close-spot recovery can otherwise miss a valid fifth row and claim
          // a false shortfall without ever reaching generation.
          const cachedQuestions = usable.slice(0, candidateQuestionCount);
          let solverQuestions = [];

          if (cachedQuestions.length < candidateQuestionCount
              || attestationContinuationPrecommit) {
              const pioConfig = declaredCfg;
              const gameCfg = getGameCfg(gameId);

              // ●●● SOLVER SCENARIO MAP: Route game to correct solver levels/spots ●●●
              const scenarioConfig = getGameScenarioConfig(gameId);

              if (pioConfig && pioConfig.sourceOfTruth !== 'SCENARIO') {
                  // PIO/CHART ENGINE: Generate from real solver data
                  // Inject service-role client so engine bypasses RLS
                  deterministicEngine.setSupabaseClient(getSupabase());
                  try {
                      // A warm mutable cache can hold a full browsing pool
                      // while containing zero exact continuation parents. The
                      // audit cohort therefore performs one bounded, read-only
                      // solver-catalog fetch even when cache capacity is full.
                      const needed = attestationContinuationPrecommit
                          ? 25
                          : candidateQuestionCount - cachedQuestions.length;
                      const generationSeenIds = Array.from(new Set([
                          ...seenIds,
                          ...cachedQuestions.flatMap((row) => [row?.id, row?.question_data?.id]).filter(Boolean),
                      ]));
                      const batch = attestationContinuationPrecommit
                          ? await deterministicEngine.generateAttestationContinuationParentCandidates({
                              gameConfig: pioConfig,
                              level: gameLevel,
                              count: needed,
                              targetStreet: targetStreet || undefined,
                              acceptQuestion: (question) => Boolean(
                                  selectPublicAttestationContinuationAnswerForStrictParent(
                                      question,
                                      attestationContinuationPrecommit,
                                      difficulty,
                                  ),
                              ),
                          })
                          : await deterministicEngine.generateBatch({
                              gameId,
                              level: gameLevel,
                              count: needed,
                              gameConfig: pioConfig,
                              // ●●● PHASE 15: Pass targeting hints ●●●
                              targetPositions: targetPositions || (scenarioConfig?.positions) || undefined,
                              targetStreet: targetStreet || undefined,
                              // ●●● PHASE 19: Difficulty filter ●●●
                              difficulty: difficulty || 'standard',
                              // ●●● SOLVER SCENARIO MAP: Inject solver routing ●●●
                              scenarioLevels: scenarioConfig?.scenarioLevels || undefined,
                              spotTypes: scenarioConfig?.spotTypes || undefined,
                              stackDepths: scenarioConfig?.stackDepths || undefined,
                              seenIds: generationSeenIds,
                          });
                      if (batch && batch.length > 0) {
                          solverQuestions = batch
                              .map(question => ({
                                  question_data: normalizeCampaignQuestionWithoutFabrication(question),
                              }))
                              .filter(row => row.question_data);
                          console.debug(`[BatchPreload] DeterministicEngine generated ${batch.length} solver questions for ${gameId}`);
                      }
                  } catch (solverErr) {
                      console.warn('[BatchPreload] ▲ Solver engine failed:', solverErr.message);
                  }
              } else if (gameCfg?.engine === 'SCENARIO' || pioConfig?.sourceOfTruth === 'SCENARIO') {
                  // SCENARIO/PSYCHOLOGY: Use DeterministicEngine for scenario questions too
                  // No AI fallback — engines handle all question generation
                  try {
                      // 2026-07-19 ENGINE AUDIT FIX: generateBatch destructures a
                      // single options object — the old positional call passed the
                      // level as the object, so gameConfig was undefined and ALL 20
                      // psychology games returned zero engine questions.
                      const batch = await deterministicEngine.generateBatch({
                          gameId,
                          level: gameLevel,
                          count: candidateQuestionCount - cachedQuestions.length,
                          gameConfig: pioConfig || gameCfg || { id: gameId, sourceOfTruth: 'SCENARIO' },
                          seenIds: Array.from(seenIds),
                      });
                      if (batch && batch.length > 0) {
                          solverQuestions = batch
                              .map(question => ({
                                  question_data: normalizeCampaignQuestionWithoutFabrication(question),
                              }))
                              .filter(row => row.question_data);
                          console.debug(`[BatchPreload] Engine generated ${batch.length} scenario questions for ${gameId}`);
                      }
                  } catch (scenarioErr) {
                      console.warn('[BatchPreload] ▲ Scenario engine failed:', scenarioErr.message);
                  }
              }
          }

          // Merge cached + solver-generated questions
          const allQuestions = [...cachedQuestions, ...solverQuestions];

          if (allQuestions.length === 0) {
              // ●●● Engine-only — no AI fallback. Return 404 if no solver data exists. ●●●
              console.warn(`[BatchPreload] No questions for ${gameId} level ${gameLevel} - engines returned empty.`);
              if (attestationContinuationPrecommit) {
                  return refuseUnavailableAttestationContinuationCohort();
              }
              return res.status(404).json({ success: false, error: 'No questions available for this game/level. Solver data not yet loaded for this configuration.' });
          }

          // BUG-03 FIX: Use Fisher-Yates shuffle (sort-based shuffle is biased in V8 TimSort)
          const shuffled = [...allQuestions];
          for (let i = shuffled.length - 1; i > 0; i--) {
              const j = Math.floor(Math.random() * (i + 1));
              [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
          }

          // ●●● 2026-07-19 ENGINE AUDIT FIX — ANSWER-CLASS BALANCE ●●●
          // Live sampling showed 73% of served questions graded "Check" as
          // correct — a user who always checks passes levels. When the pool
          // allows it, interleave passive-answer and aggressive-answer
          // questions so no single action dominates the answer key.
          const isAggressiveAnswer = (q) => {
              const ca = q?.question_data?.correctAnswer || '';
              return /^b|^r|allin|jam|push/i.test(String(ca));
          };
          const aggressive = shuffled.filter(isAggressiveAnswer);
          const passive = shuffled.filter(q => !isAggressiveAnswer(q));
          let batch;
          if (aggressive.length > 0 && passive.length > 0) {
              batch = [];
              let ai = 0, pi = 0;
              while (batch.length < candidateQuestionCount && (ai < aggressive.length || pi < passive.length)) {
                  // Alternate, preferring whichever class is underrepresented so far
                  const takeAggressive =
                      ai < aggressive.length && (pi >= passive.length || batch.length % 2 === 1);
                  if (takeAggressive) batch.push(aggressive[ai++]);
                  else batch.push(passive[pi++]);
              }
          } else {
              // Only one class available in the pool — serve what exists
              batch = shuffled.slice(0, candidateQuestionCount);
          }

          // Balancing the two broad action classes must not make the answer
          // class predictable from the hand number. The earlier alternating
          // pass intentionally fixes the quota, then this independent
          // cryptographic shuffle removes the passive/even, aggressive/odd
          // side channel before the immutable attempt manifest is sealed.
          batch = shuffleBalancedQuestionOrder(batch);
          if (attestationContinuationPrecommit && solverQuestions.length > 0) {
              const includedQuestionIds = new Set(
                  batch.map((row) => String(row?.question_data?.id || '')).filter(Boolean),
              );
              batch = [
                  ...batch,
                  ...solverQuestions.filter((row) => {
                      const questionId = String(row?.question_data?.id || '');
                      if (!questionId || includedQuestionIds.has(questionId)) return false;
                      includedQuestionIds.add(questionId);
                      return true;
                  }),
              ];
          }

          // Cache truth owns the immutable grading policy and its persisted
          // receipt. It may classify a complete authored question, but it must
          // never fill missing cards, boards, seats, stacks, or pot geometry.
          const originalCacheRowByQuestionId = new Map(cachedQuestions.flatMap((row) => {
              const ids = [row?.question_id, row?.question_data?.id]
                  .filter(Boolean)
                  .map(String);
              return ids.map((id) => [id, row]);
          }));

          // Canonicalization is deliberately non-generative. A row either
          // arrives with an audited source and complete material context or it
          // cannot enter a progress-bearing attempt.
          const enrichedCandidates = batch
              .map(row => normalizeCampaignQuestionWithoutFabrication(row?.question_data))
              .filter(Boolean)
              .filter(question => (
                  isTrainingQuestionValid(question)
                  && isTrainingQuestionCampaignEligible(question)
              ));

          const configuredCandidates = filterTrainingQuestionsForAttempt(
              enrichedCandidates,
              attemptSelection,
          );

          if (configuredCandidates.length < questionCount) {
              if (attestationContinuationPrecommit) {
                  return refuseUnavailableAttestationContinuationCohort();
              }
              return res.status(422).json({
                  success: false,
                  error: `Only ${configuredCandidates.length} of ${questionCount} questions satisfy this immutable drill configuration.`,
                  code: 'TRAINING_ATTEMPT_QUESTION_SHORTFALL',
              });
          }

          // Every served question must be persisted in the exact post-contract
          // envelope the player receives. Authority-ineligible legacy,
          // heuristic, simulated, and incomplete rows were already rejected
          // above and therefore can never be laundered by this write.
          /* ═══ ONE UNBUILDABLE QUESTION MUST NOT 500 THE WHOLE BATCH ══════
           *
           * (2026-09-07) `buildTrainingCacheRow` throws on six separate
           * conditions — a mismatched answer key, an option set that disagrees
           * with the distribution, a missing canonical identifier. This block
           * sat OUTSIDE the try below, so a single bad row out of ~25 threw
           * straight to the handler's outer catch and answered
           * `500 Internal server error` for the entire request.
           *
           * That 500 was terminal for the player, because the client's
           * "fallback" called this same route (see the note in
           * `useGTOTrainer.fetchSingleQuestion`). One bad question therefore
           * bricked the whole GTO arena until a page reload, showing
           * `Loading Solver Data...` on a permanently disabled button.
           *
           * A question that cannot be canonicalised is reported and skipped.
           * A later candidate replaces it; only successfully built rows may
           * enter persistence or delivery. If the bounded surplus is still
           * insufficient, the route returns an honest 422 before either write.
           */
          const canonicalizeFailures = [];
          const canonicalPairs = [];
          const canonicalQuestionIds = new Set();
          const questionKind = String(gameId).startsWith('psy-') ? 'SCENARIO'
              : pioQueryService.getGameConfig(gameId)?.sourceOfTruth === 'ICMIZER' ? 'CHART' : 'PIO';
          const gameType = String(gameId).startsWith('mtt-') ? 'tournament'
              : String(gameId).startsWith('spins-') ? 'sng' : 'cash';
          for (const question of configuredCandidates) {
              if (!attestationContinuationPrecommit
                  && canonicalPairs.length >= questionCount) break;
              const original = originalCacheRowByQuestionId.get(String(question?.id));
              const questionId = String(original?.question_id || question?.id || '');
              try {
                  const row = buildTrainingCacheRow({
                      question,
                      questionId,
                      gameId,
                      questionKind,
                      gameType,
                      level: gameLevel,
                      generatedAt: original?.generated_at || new Date().toISOString(),
                      id: original?.id || null,
                  });
                  const canonicalQuestionId = String(row?.question_id || '');
                  if (!canonicalQuestionId || canonicalQuestionIds.has(canonicalQuestionId)) {
                      throw new Error(canonicalQuestionId
                          ? 'Duplicate canonical question identifier'
                          : 'Canonical question identifier is missing');
                  }
                  canonicalQuestionIds.add(canonicalQuestionId);
                  canonicalPairs.push({ question, row });
              } catch (rowError) {
                  canonicalizeFailures.push({
                      questionId,
                      reason: String(rowError?.message || rowError).slice(0, 200),
                  });
              }
          }

          if (canonicalizeFailures.length > 0) {
              console.warn(
                  `[BatchPreload] ${canonicalizeFailures.length} of ${configuredCandidates.length} ` +
                  `candidate question(s) could not be canonicalised and were skipped: ` +
                  `${JSON.stringify(canonicalizeFailures.slice(0, 5))}`
              );
          }
          if (canonicalPairs.length < questionCount) {
              if (attestationContinuationPrecommit) {
                  return refuseUnavailableAttestationContinuationCohort();
              }
              return res.status(422).json({
                  success: false,
                  error: `Only ${canonicalPairs.length} of ${questionCount} questions satisfy this immutable drill configuration.`,
                  code: 'TRAINING_ATTEMPT_QUESTION_SHORTFALL',
              });
          }

          let selectedCanonicalPairs = canonicalPairs.slice(0, questionCount);
          let attestationContinuationCohort = null;
          if (attestationContinuationPrecommit) {
              deterministicEngine.setSupabaseClient(getSupabase());
              const cohort = await selectTrainingAttestationContinuationCohort({
                  questionPairs: canonicalPairs,
                  targetHands: questionCount,
                  difficultyMode: difficulty,
                  gameConfig: declaredCfg,
                  precommit: attestationContinuationPrecommit,
                  queryNextStreet: (request) => deterministicEngine.queryNextStreet(request),
              });
              if (!cohort) {
                  return refuseUnavailableAttestationContinuationCohort();
              }
              selectedCanonicalPairs = [...cohort.questionPairs];
              attestationContinuationCohort = cohort.publicContract;
          }
          if (selectedCanonicalPairs.length !== questionCount) {
              if (attestationContinuationPrecommit) {
                  return refuseUnavailableAttestationContinuationCohort();
              }
              return res.status(422).json({
                  success: false,
                  error: `Only ${selectedCanonicalPairs.length} of ${questionCount} questions satisfy this immutable drill configuration.`,
                  code: 'TRAINING_ATTEMPT_QUESTION_SHORTFALL',
              });
          }
          const canonicalRows = selectedCanonicalPairs.map(({ row }) => row);

          let servedBatch;
          try {
              const persisted = await runTrainingPersistenceQuery(
                  () => getSupabase().from('training_question_cache')
                      .upsert(canonicalRows, {
                          onConflict: 'question_id',
                          defaultToNull: false,
                      })
                      .select('question_id, question_data, canonical_policy, source_classification, quality_status, policy_version, policy_checksum'),
                  { label: 'BatchPreload:canonicalize' },
              );
              const receiptByQuestionId = new Map(
                  (persisted.data || []).map((row) => [row.question_id, row]),
              );
              if (receiptByQuestionId.size !== canonicalRows.length) {
                  throw new Error('Database did not return one canonical receipt per question');
              }
              servedBatch = selectedCanonicalPairs.map(({ row }) => {
                  const questionId = String(row.question_id);
                  return withPersistedCacheReceipt(
                      row.question_data,
                      receiptByQuestionId.get(questionId),
                  );
              });
          } catch (canonicalizeError) {
              console.warn('[BatchPreload] Refusing to serve uncanonicalized questions:', canonicalizeError.message);
              return res.status(503).json(trainingPersistenceUnavailableBody());
          }
          let delivery;
          try {
              delivery = await prepareTrainingAttemptDelivery({
                  supabase: getSupabase(),
                  userId: _authUser.id,
                  clientSessionId: trainingSessionId,
                  gameId,
                  level: gameLevel,
                  sessionKind: 'campaign',
                  difficultyMode: difficulty,
                  requestedHands: attemptTargetHands,
                  questions: servedBatch,
                  handOrdinalStart,
                  requireFullAttempt: !isSingleHandRecovery,
                  config: attemptSelection,
              });
          } catch (deliveryError) {
              console.warn('[BatchPreload] Attempt delivery failed:', deliveryError?.message || deliveryError);
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
                  userId: _authUser.id,
                  delivery,
              });
          } catch (servedAuditError) {
              console.warn('[BatchPreload] Delivered question audit failed:', servedAuditError?.message || servedAuditError);
              return res.status(503).json(trainingPersistenceUnavailableBody());
          }

          return res.status(200).json({
              success: true,
              gameId,
              level: gameLevel,
              sessionId: trainingSessionId,
              attemptId: delivery.attemptId,
              sessionKind: delivery.sessionKind,
              targetHands: delivery.targetHands,
              count: delivery.questions.length,
              questions: delivery.questions,
              ...(attestationContinuationCohort
                  ? { attestationContinuationCohort }
                  : {}),
          });

      } catch (err) {
          console.warn('[BatchPreload] Unexpected error:', err);
          return res.status(500).json({ success: false, error: 'Internal server error' });
      }

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
