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
import {
  sanitizeParam,
  withTiming,
  reconcileAnswerKey,
  evaluateTrainingSpotWithHorseBrain,
} from '../../../src/utils/trainingApiUtils';
import { reportApiError } from '../../../src/lib/apiErrorHandler';
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

const PLO8_CURATED_HANDS = [
  ['As', '2s', 'Kd', '3d'],
  ['Ah', '2c', '4h', '5c'],
  ['Ad', '3d', 'Qh', 'Jc'],
  ['Ac', '2d', '5c', '6d'],
  ['As', '3s', '4d', '7d'],
  ['Ah', '2h', 'Ks', 'Qs'],
];

const PLO4_CURATED_HANDS = [
  ['As', 'Ks', 'Qh', 'Jd'],
  ['Ah', 'Kh', 'Tc', '9c'],
  ['Ad', 'Kd', 'Qc', 'Jc'],
  ['As', 'Ah', 'Ks', 'Kh'],
  ['Qd', 'Qc', '7h', '7c'],
  ['8h', '6c', '5d', '3h'],
];

const PLO5_CURATED_HANDS = [
  ['As', 'Ks', 'Qh', 'Jd', 'Tc'],
  ['Ah', 'Kh', 'Qc', 'Jc', '9d'],
  ['Ad', 'Kd', 'Qh', 'Ts', '9s'],
  ['As', 'Ah', 'Ks', 'Kh', 'Qd'],
  ['Qd', 'Qc', '7h', '7c', 'Ac'],
  ['8h', '6c', '5d', '3h', '2d'],
];

const PLO6_CURATED_HANDS = [
  ['As', 'Ks', 'Qh', 'Jd', 'Tc', '9h'],
  ['Ah', 'Kh', 'Qc', 'Jc', '9d', '8d'],
  ['Ad', 'Kd', 'Qh', 'Ts', '9s', '8c'],
  ['As', 'Ah', 'Ks', 'Kh', 'Qd', 'Jc'],
  ['Qd', 'Qc', '7h', '7c', 'Ac', 'Kc'],
  ['8h', '6c', '5d', '3h', '2d', '9c'],
];

const NLH_CURATED_HANDS = [
  ['As', 'Kd'],
  ['Ah', 'Kc'],
  ['Ks', 'Qd'],
  ['Ad', 'Jc'],
  ['Qd', 'Qc'],
  ['8h', '3d'],
];

const FALLBACK_NON_COLLIDING_DECK = [
  'As', '2s', '3d', '4h', '5c', '6s', '7d', '8h', '9c', 'Ts', 'Jd', 'Qh', 'Kc',
  'Ah', '2h', '3c', '4s', '5d', '6h', '7c', '8s', '9d', 'Th', 'Jc', 'Qs', 'Kd',
  'Ad', '2d', '3s', '4c', '5h', '6c', '7s', '8d', '9h', 'Tc', 'Js', 'Qd', 'Kh',
  'Ac', '2c', '3h', '4d', '5s', '6d', '7h', '8c', '9s', 'Td', 'Jh', 'Qc', 'Ks',
];

function dealNonCollidingHoleCards(basePreset, boardCards = [], holeCardsCount = 4) {
  const boardSet = new Set(
    (Array.isArray(boardCards) ? boardCards : [])
      .map((c) => String(c || '').trim().toLowerCase())
      .filter(Boolean),
  );
  const chosen = [];
  const chosenSet = new Set();
  for (const card of Array.isArray(basePreset) ? basePreset : []) {
    const clean = String(card || '').trim();
    const lower = clean.toLowerCase();
    if (clean.length === 2 && !boardSet.has(lower) && !chosenSet.has(lower)) {
      chosen.push(`${clean[0].toUpperCase()}${clean[1].toLowerCase()}`);
      chosenSet.add(lower);
      if (chosen.length === holeCardsCount) return chosen;
    }
  }
  for (const card of FALLBACK_NON_COLLIDING_DECK) {
    const lower = card.toLowerCase();
    if (!boardSet.has(lower) && !chosenSet.has(lower)) {
      chosen.push(card);
      chosenSet.add(lower);
      if (chosen.length === holeCardsCount) return chosen;
    }
  }
  return chosen.slice(0, holeCardsCount);
}

export function applyHorseBrainEnrichment(questionPayload, gameIdOrOpts = {}, reqQuery = {}) {
  const question = questionPayload;
  if (!question || typeof question !== 'object') return question;
  const scenario = question.scenario && typeof question.scenario === 'object'
    ? question.scenario
    : {};

  let gameId = null;
  let level = question.level;
  let rawVariantInput = null;
  let rawBettingInput = null;
  let rawFormatInput = null;

  if (typeof gameIdOrOpts === 'string') {
    gameId = gameIdOrOpts;
    if (reqQuery && typeof reqQuery === 'object') {
      if (reqQuery.level !== undefined) level = reqQuery.level;
      rawVariantInput = reqQuery.variant;
      rawBettingInput = reqQuery.bettingStructure;
      rawFormatInput = reqQuery.format;
    }
  } else if (gameIdOrOpts && typeof gameIdOrOpts === 'object') {
    gameId = gameIdOrOpts.gameId || reqQuery?.gameId || question.gameId;
    if (gameIdOrOpts.level !== undefined) level = gameIdOrOpts.level;
    else if (reqQuery?.level !== undefined) level = reqQuery.level;
    rawVariantInput = gameIdOrOpts.variant ?? reqQuery?.variant;
    rawBettingInput = gameIdOrOpts.bettingStructure ?? reqQuery?.bettingStructure;
    rawFormatInput = gameIdOrOpts.format ?? reqQuery?.format;
  }

  const rawVar = String(rawVariantInput || scenario.variant || '').trim().toLowerCase();
  const mappedVariant = ['plo8', 'omaha8', 'plo_hilo'].includes(rawVar)
    ? 'plo8'
    : ['plo6', 'omaha6'].includes(rawVar)
      ? 'plo6'
      : ['plo5', 'omaha5'].includes(rawVar)
        ? 'plo5'
        : ['plo4', 'omaha4', 'plo', 'omaha'].includes(rawVar)
          ? 'plo4'
          : (rawVar === 'nlh' || rawVar === 'holdem')
            ? 'nlh'
            : null;
  const resolvedVariant = mappedVariant
    || (['cash-005', 'cash-015', 'mtt-018'].includes(String(gameId)) ? 'plo4' : 'nlh');

  const normBettingRaw = String(rawBettingInput || scenario.bettingStructure || '').trim().toLowerCase();
  const resolvedBettingStructure = ['no_limit', 'pot_limit', 'fixed_limit'].includes(normBettingRaw)
    ? normBettingRaw
    : String(resolvedVariant).startsWith('plo')
      ? 'pot_limit'
      : 'no_limit';

  const normFormatRaw = String(rawFormatInput || scenario.format || '').trim().toLowerCase();
  const resolvedFormat = ['cash', 'mtt', 'spins', 'hu', '9max'].includes(normFormatRaw)
    ? normFormatRaw
    : String(gameId || '').startsWith('mtt-')
      ? 'mtt'
      : String(gameId || '').startsWith('spins-')
        ? 'spins'
        : 'cash';

  const expectedHoleCount = resolvedVariant === 'plo6' ? 6
    : resolvedVariant === 'plo5' ? 5
    : (resolvedVariant === 'plo4' || resolvedVariant === 'plo8') ? 4
    : 2;

  const boardCards = Array.isArray(question.boardCards)
    ? question.boardCards
    : Array.isArray(scenario.boardCards)
      ? scenario.boardCards
      : [];

  let heroCards = Array.isArray(question.heroCards) ? [...question.heroCards] : [];
  const presetPool = resolvedVariant === 'plo8' ? PLO8_CURATED_HANDS
    : resolvedVariant === 'plo6' ? PLO6_CURATED_HANDS
    : resolvedVariant === 'plo5' ? PLO5_CURATED_HANDS
    : resolvedVariant === 'plo4' ? PLO4_CURATED_HANDS
    : NLH_CURATED_HANDS;

  const seedIdx = String(question.id || gameId || '')
    .split('')
    .reduce((acc, ch) => acc + ch.charCodeAt(0), 0);

  if (
    heroCards.length !== expectedHoleCount
    || (resolvedVariant === 'plo8' && !scenario.hiLo && scenario.variant !== 'plo8')
  ) {
    const preset = presetPool[Math.abs(seedIdx) % presetPool.length];
    heroCards = dealNonCollidingHoleCards(preset, boardCards, expectedHoleCount);
  } else {
    heroCards = dealNonCollidingHoleCards(heroCards, boardCards, expectedHoleCount);
  }

  let brainEval = null;
  if (typeof evaluateTrainingSpotWithHorseBrain === 'function') {
    try {
      brainEval = evaluateTrainingSpotWithHorseBrain({
        gameId,
        variant: resolvedVariant,
        bettingStructure: resolvedBettingStructure,
        format: resolvedFormat,
        street: scenario.street || (boardCards.length === 0 ? 'preflop' : boardCards.length === 3 ? 'flop' : boardCards.length === 4 ? 'turn' : 'river'),
        heroCards,
        boardCards: boardCards.length > 0 ? boardCards : undefined,
        heroPosition: scenario.heroPosition || 'BTN',
        villainPosition: scenario.villainPosition || 'BB',
        pot: scenario.pot,
        toCall: scenario.toCall,
        stackDepth: scenario.stackDepth || scenario.heroStack || 100,
        isPKO: Boolean(scenario.isPKO),
        bountyBb: scenario.bountyBb,
        isICM: Boolean(scenario.isICM || resolvedFormat === 'mtt'),
        bubbleFactor: scenario.bubbleFactor,
        villainStats: scenario.villainStats,
      });
    } catch (_enrichErr) {
      brainEval = null;
    }
  }

  const isPlo8 = resolvedVariant === 'plo8';
  const plo8LowEvaluation = isPlo8
    ? (brainEval?.plo8LowEvaluation || brainEval?.brainEvaluation?.plo8LowEvaluation || scenario.plo8LowEvaluation || null)
    : (brainEval?.plo8LowEvaluation || null);
  const engineModule = isPlo8
    ? 'plo8-brain.js'
    : (brainEval?.engineModule || brainEval?.brainEvaluation?.engineModule || scenario.brainEvaluation?.engineModule || null);

  const mergedBrainEvaluation = brainEval?.brainEvaluation
    ? {
        ...brainEval.brainEvaluation,
        ...(isPlo8 ? { engineModule: 'plo8-brain.js', hiLo: true, plo8LowEvaluation } : {}),
        bettingStructure: resolvedBettingStructure,
        format: resolvedFormat,
      }
    : (scenario.brainEvaluation
      ? {
          ...scenario.brainEvaluation,
          ...(isPlo8 ? { engineModule: 'plo8-brain.js', hiLo: true, plo8LowEvaluation } : {}),
          bettingStructure: resolvedBettingStructure,
          format: resolvedFormat,
        }
      : (isPlo8
        ? {
            engineModule: 'plo8-brain.js',
            variant: 'plo8',
            hiLo: true,
            plo8LowEvaluation,
            bettingStructure: resolvedBettingStructure,
            format: resolvedFormat,
          }
        : null));

  return {
    ...question,
    heroCards,
    variant: resolvedVariant,
    bettingStructure: resolvedBettingStructure,
    format: resolvedFormat,
    plo8LowEvaluation,
    ...(engineModule ? { engineModule } : {}),
    ...(isPlo8 ? { hiLo: true } : {}),
    scenario: {
      ...scenario,
      variant: resolvedVariant,
      holeCardCount: heroCards.length,
      bettingStructure: resolvedBettingStructure,
      format: resolvedFormat,
      plo8LowEvaluation,
      ...(engineModule ? { engineModule } : {}),
      ...(isPlo8 ? { hiLo: true } : {}),
      ...(mergedBrainEvaluation ? { brainEvaluation: mergedBrainEvaluation } : {}),
      madeHandCategory: brainEval?.madeHandCategory || scenario.madeHandCategory,
      potLimitSizing: brainEval?.potLimitSizing || scenario.potLimitSizing,
    },
    level: level ?? question.level,
  };
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
      targetPositions: rawTargetPositions,
      variant: rawVariant,
      bettingStructure: rawBettingStructure,
      format: rawFormat,
    } = req.query;
    const gameId = sanitizeParam(rawGameId, 100);
    const normalizedRawVariant = sanitizeParam(rawVariant, 16)?.toLowerCase() || '';
    const mappedRawVariant = ['plo8', 'omaha8', 'plo_hilo', 'plo-hi-lo', 'plo_hi_lo', 'omaha_hi_lo', 'flo8', 'o8'].includes(normalizedRawVariant)
      ? 'plo8'
      : ['plo6', 'omaha6', 'plo-6', '6-card-plo'].includes(normalizedRawVariant)
        ? 'plo6'
        : ['plo5', 'omaha5', 'plo-5', '5-card-plo'].includes(normalizedRawVariant)
          ? 'plo5'
          : ['plo4', 'plo', 'omaha', 'omaha4', 'plo-4', '4-card-plo', 'flo'].includes(normalizedRawVariant)
            ? 'plo4'
            : ['nlh', 'holdem', 'nlhe', 'flh'].includes(normalizedRawVariant)
              ? 'nlh'
              : normalizedRawVariant;
    const requestedVariant = ['nlh', 'plo4', 'plo5', 'plo6', 'plo8'].includes(mappedRawVariant)
      ? mappedRawVariant
      : null;
    const normalizedRawBettingStructure = sanitizeParam(rawBettingStructure, 24)?.toLowerCase() || '';
    const requestedBettingStructure = ['no_limit', 'pot_limit', 'fixed_limit'].includes(normalizedRawBettingStructure)
      ? normalizedRawBettingStructure
      : null;
    const normalizedRawFormat = sanitizeParam(rawFormat, 24)?.toLowerCase() || '';
    const requestedFormat = ['cash', 'mtt', 'spins', 'hu', '9max'].includes(normalizedRawFormat)
      ? normalizedRawFormat
      : null;
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
    const targetPositions = rawTargetPositions
      ? String(rawTargetPositions)
          .split(',')
          .map((p) => p.trim().toUpperCase())
          .filter((p) => ['UTG', 'MP', 'CO', 'BTN', 'SB', 'BB', 'HJ', 'LJ', 'UTG+1', 'UTG+2', 'MP+1'].includes(p))
      : null;
    const attemptSelection = {
      gameMode,
      handSelection,
      targetStreet,
      ...(targetPositions && targetPositions.length > 0 ? { targetPositions } : {}),
      ...(requestedVariant ? { variant: requestedVariant } : {}),
      ...(requestedBettingStructure ? { bettingStructure: requestedBettingStructure } : {}),
      ...(requestedFormat ? { format: requestedFormat } : {}),
    };
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
        const recoveredQuestion = (
          requestedVariant
          || requestedBettingStructure
          || requestedFormat
          || ['cash-005', 'cash-015', 'mtt-018'].includes(gameId)
        )
          ? applyHorseBrainEnrichment(recovered.questions[0], gameId, {
              ...req.query,
              level,
              variant: requestedVariant || undefined,
              bettingStructure: requestedBettingStructure || undefined,
              format: requestedFormat || undefined,
            })
          : recovered.questions[0];
        return res.status(200).json({
          success: true,
          question: recoveredQuestion,
          level,
          sessionId: trainingSessionId,
          attemptId: recovered.attemptId,
          sessionKind: recovered.sessionKind,
          targetHands: recovered.targetHands,
          passThreshold: TRAINING_CONFIG.passThresholds[level] || 85,
          gameType,
          engineType,
          ...(requestedVariant ? { variant: requestedVariant } : {}),
          ...(requestedBettingStructure ? { bettingStructure: requestedBettingStructure } : {}),
          ...(requestedFormat ? { format: requestedFormat } : {}),
        });
      }

      // ═══════════════════════════════════════════════════════════════════
      // STEP 2 & 3: PARALLEL SEEN QUESTIONS & CACHED QUESTIONS READ
      // ═══════════════════════════════════════════════════════════════════
      // Cache rows are the canonical truth: pre-rebalanced (Phase 77/78/79/80
      // pedagogical curve), pre-enriched (Phase 83/88 contextual explanations),
      // and pre-validated (Phase 82 integrity audit: 0 issues across 27,413 rows).
      // Fresh-from-solver regeneration loses all of that pedagogical work, so
      // we try cache FIRST and fall back to engines only on cache miss.
      let seenQuestionIds = [];
      let question = null;
      let canonicalPayload = null;

      {
        const seenPromise = userId
          ? runTrainingPersistenceQuery(
              () => getSupabase()
                .from('user_seen_questions')
                .select('question_id')
                .eq('user_id', userId)
                .eq('game_id', gameId)
                .limit(100),
              { label: 'GetQuestion:seen-read' },
            ).catch((seenError) => {
              // Seen history is an optimization, not grading truth. Bound the wait
              // and continue without de-duplication rather than hanging delivery.
              console.warn('[Training] Seen history unavailable; continuing without exclusion:', seenError.message);
              return { data: [] };
            })
          : Promise.resolve({ data: [] });

        const cachePromise = runTrainingPersistenceQuery(
          () => getSupabase()
            .from('training_question_cache')
            .select('id, question_data, question_id, engine_type, question_kind, canonical_policy, source_classification, quality_status, policy_version, policy_checksum, generated_at, source_created_at')
            .eq('game_id', gameId)
            .eq('level', level)
            .in('quality_status', ['active', 'active_fallback'])
            .limit(50),
          { label: 'GetQuestion:cache-read' },
        ).then((cachedResult) => ({ data: cachedResult?.data, error: null }))
          .catch((cacheError) => ({ data: null, error: cacheError }));

        const [seenOutcome, cacheOutcome] = await Promise.all([seenPromise, cachePromise]);
        seenQuestionIds = (seenOutcome?.data || []).map((s) => s.question_id);

        if (cacheOutcome.error) {
          if (isTrainingPersistenceUnavailable(cacheOutcome.error)) {
            return res.status(503).json(trainingPersistenceUnavailableBody());
          }
          throw cacheOutcome.error;
        }
        const cachedQuestions = cacheOutcome.data;

        // roadmap #16 -- same declared-street rule the batch route applies. The
        // cache is the primary source here too (Phase 92 reorder), so a game
        // that declares a street must not be handed a cached row of another
        // one; when the filter empties the pool the engine path below runs,
        // which is the correct source for a declaration the cache predates.
        const targetVariantFilter = requestedVariant
          || (['cash-005', 'cash-015', 'mtt-018'].includes(gameId) ? 'plo4' : null);
        const expectedHoleCardCount = targetVariantFilter === 'plo6' ? 6
          : targetVariantFilter === 'plo5' ? 5
          : (targetVariantFilter === 'plo4' || targetVariantFilter === 'plo8') ? 4
          : targetVariantFilter === 'nlh' ? 2
          : null;
        const expectedEngineModule = targetVariantFilter === 'plo8' ? 'plo8-brain.js'
          : targetVariantFilter === 'plo6' ? 'plo6-brain.js'
          : targetVariantFilter === 'plo5' ? 'plo5-brain.js'
          : targetVariantFilter === 'plo4' ? 'plo-core.js'
          : targetVariantFilter === 'nlh' ? 'holdem-brain.js'
          : null;
        const eligibleCached = filterCachedRowsForGame(
          (cachedQuestions || [])
            .map((row) => ({ ...row, question_data: cacheQuestionFromRow(row) }))
            .filter((row) => cacheRowIsServingEligible(row) && !seenQuestionIds.includes(row.question_id)),
          pioQueryService.getGameConfig(gameId),
        ).map((row) => ({
          ...row,
          question_data: normalizeCampaignQuestionWithoutFabrication(row?.question_data),
        })).filter((row) => {
          const q = row.question_data;
          if (!q || !trainingQuestionMatchesSelection(q, attemptSelection)) return false;
          if (Array.isArray(targetPositions) && targetPositions.length > 0) {
            const heroPos = String(q.scenario?.heroPosition || q.scenario?.position || '').toUpperCase();
            if (heroPos && !targetPositions.includes(heroPos)) return false;
          }
          if (expectedHoleCardCount !== null) {
            const cards = Array.isArray(q.heroCards) ? q.heroCards : [];
            if (cards.length !== expectedHoleCardCount) return false;
            const rowEngine = String(q.scenario?.brainEvaluation?.engineModule || '');
            if (!rowEngine) return false;
            if (expectedEngineModule && rowEngine !== expectedEngineModule) return false;
            if (targetVariantFilter === 'plo8' && !q.scenario?.hiLo && q.scenario?.variant !== 'plo8') return false;
            if (targetVariantFilter === 'plo4' && (q.scenario?.hiLo || q.scenario?.variant === 'plo8')) return false;
          }
          return true;
        });

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
      const basePioConfig = pioQueryService.getGameConfig(gameId);
      const pioConfig = requestedVariant && basePioConfig
        ? { ...basePioConfig, variant: requestedVariant }
        : basePioConfig;
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
            targetPositions: (targetPositions && targetPositions.length > 0 ? targetPositions : scenarioConfig?.positions) || undefined,
            scenarioLevels: scenarioConfig?.scenarioLevels || undefined,
            spotTypes: scenarioConfig?.spotTypes || undefined,
            stackDepths: scenarioConfig?.stackDepths || undefined,
            // Same campaign admissibility as batch-preload: see the preflop
            // branch of DeterministicGTOEngine.generateBatch.
            admissibleForCaller: isTrainingQuestionCampaignEligible,
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
      let servedQuestion = delivery.questions[0];
      if (
        requestedVariant
        || requestedBettingStructure
        || requestedFormat
        || ['cash-005', 'cash-015', 'mtt-018'].includes(gameId)
      ) {
        servedQuestion = applyHorseBrainEnrichment(servedQuestion, gameId, {
          ...req.query,
          level,
          variant: requestedVariant || undefined,
          bettingStructure: requestedBettingStructure || undefined,
          format: requestedFormat || undefined,
        });
      }
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
        ...(requestedVariant ? { variant: requestedVariant } : {}),
        ...(requestedBettingStructure ? { bettingStructure: requestedBettingStructure } : {}),
        ...(requestedFormat ? { format: requestedFormat } : {}),
      });
    } catch (error) {
      console.warn('[Training] ✕ Get question error:', error);
      return res.status(500).json({ success: false, error: 'Internal server error' });
    }
  } catch (err) {
    try {
      reportApiError(err, req);
    } catch (_reportError) {
      console.warn('[App] Handled exception:', _reportError?.message || _reportError);
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
        .filter(([, value]) => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1)
        .map(([action, value]) => [action, Number((value * 100).toFixed(6))]));
      if (Object.keys(measured).length > 0) q.gtoFrequencies = measured;
    }
  }

  const canonical = enforceTrainingQuestionContract(enforceSolverClaimHonesty(q));
  return isTrainingQuestionValid(canonical) && isTrainingQuestionCampaignEligible(canonical)
    ? canonical
    : null;
}

// Deploy trigger Wed Jan 28 23:02:33 CST 2026
