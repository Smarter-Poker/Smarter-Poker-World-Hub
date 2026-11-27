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
import { sanitizeParam, withTiming, reconcileAnswerKey, resolveSyncedHandForTrainingDrill, evaluateTrainingSpotWithHorseBrain } from '../../../src/utils/trainingApiUtils';
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
import { reportApiError } from '../../../src/lib/apiErrorHandler';
import {
    orderRowsForConcurrentWrite,
    runTrainingPersistenceQuery,
    trainingPersistenceUnavailableBody,
} from '../../../src/lib/training/trainingPersistence.mjs';
import {
    createTrainingSessionId,
    createSignedTrainingDuelToken,
    verifyTrainingDuelToken,
} from '../../../src/lib/training/gradingReceipt.mjs';
import { trainingMasteryMinimum } from '../../../src/lib/training/sessionAttemptContract.mjs';
import {
    isTrainingAttemptContractError,
    isTrainingQuestionCampaignEligible,
    prepareTrainingAttemptDelivery,
    recordTrainingQuestionsServedForAttempt,
    recoverTrainingAttemptHand,
    trainingQuestionCampaignEligibility,
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
    createTrainingAttestationCohortCollector,
    logTrainingAttestationCohortStage,
} from '../../../src/lib/training/trainingAttestationCohortDiagnostics.mjs';
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

const WARM_QUESTION_CACHE = new Map();
const WARM_CACHE_TTL_MS = 300_000;
const WARM_CACHE_MAX_ENTRIES = 256;

export function buildWarmCacheKey({
    gameId,
    level,
    variant = null,
    bettingStructure = null,
    format = null,
} = {}) {
    if (!gameId) return '';
    const normLevel = Math.min(12, Math.max(1, parseInt(level, 10) || 1));
    const normVariant = variant ? String(variant).trim().toLowerCase() : 'default';
    const normBetting = bettingStructure ? String(bettingStructure).trim().toLowerCase() : 'default';
    const normFormat = format ? String(format).trim().toLowerCase() : 'default';
    return `${gameId}:L${normLevel}:v=${normVariant}:bs=${normBetting}:fmt=${normFormat}`;
}

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

export function adaptQuestionToVariant(question, requestedVariant, index = 0, extraOptions = {}) {
    if (!question || typeof question !== 'object') return question;
    const scenario = question.scenario && typeof question.scenario === 'object' ? question.scenario : {};
    const rawVar = String(requestedVariant || extraOptions?.variant || scenario.variant || '').trim().toLowerCase();
    const normVariant = ['plo8', 'omaha8', 'plo_hilo'].includes(rawVar)
        ? 'plo8'
        : ['plo6', 'omaha6'].includes(rawVar)
            ? 'plo6'
            : ['plo5', 'omaha5'].includes(rawVar)
                ? 'plo5'
                : ['plo4', 'omaha4', 'plo', 'omaha'].includes(rawVar)
                    ? 'plo4'
                    : rawVar === 'nlh' || rawVar === 'holdem'
                        ? 'nlh'
                        : null;

    const rawBetting = String(extraOptions?.bettingStructure || scenario.bettingStructure || '').trim().toLowerCase();
    const resolvedBettingStructure = ['no_limit', 'pot_limit', 'fixed_limit'].includes(rawBetting)
        ? rawBetting
        : (normVariant && normVariant.startsWith('plo'))
            ? 'pot_limit'
            : 'no_limit';

    const rawFormat = String(extraOptions?.format || scenario.format || '').trim().toLowerCase();
    const resolvedFormat = ['cash', 'mtt', 'spins', 'hu', '9max'].includes(rawFormat)
        ? rawFormat
        : (extraOptions?.gameId && String(extraOptions.gameId).startsWith('mtt-'))
            ? 'mtt'
            : (extraOptions?.gameId && String(extraOptions.gameId).startsWith('spins-'))
                ? 'spins'
                : 'cash';

    const effectiveVariant = normVariant || scenario.variant || 'nlh';
    const holeCardsCount = effectiveVariant === 'plo6' ? 6
        : effectiveVariant === 'plo5' ? 5
        : (effectiveVariant === 'plo4' || effectiveVariant === 'plo8') ? 4
        : 2;

    const boardCards = Array.isArray(question.boardCards)
        ? question.boardCards
        : Array.isArray(scenario.boardCards)
            ? scenario.boardCards
            : [];

    let heroCards = Array.isArray(question.heroCards) ? [...question.heroCards] : [];
    const presetPool = effectiveVariant === 'plo8' ? PLO8_CURATED_HANDS
        : effectiveVariant === 'plo6' ? PLO6_CURATED_HANDS
        : effectiveVariant === 'plo5' ? PLO5_CURATED_HANDS
        : effectiveVariant === 'plo4' ? PLO4_CURATED_HANDS
        : NLH_CURATED_HANDS;

    if (
        heroCards.length !== holeCardsCount
        || (effectiveVariant === 'plo8' && !scenario.hiLo && scenario.variant !== 'plo8')
    ) {
        const preset = presetPool[Math.abs(Number(index) || 0) % presetPool.length];
        heroCards = dealNonCollidingHoleCards(preset, boardCards, holeCardsCount);
    } else {
        heroCards = dealNonCollidingHoleCards(heroCards, boardCards, holeCardsCount);
    }

    let brainResult = null;
    if (typeof evaluateTrainingSpotWithHorseBrain === 'function') {
        try {
            brainResult = evaluateTrainingSpotWithHorseBrain({
                gameId: extraOptions?.gameId || question.gameId || 'cash-001',
                variant: effectiveVariant,
                bettingStructure: resolvedBettingStructure,
                format: resolvedFormat,
                street: scenario.street || question.street || (boardCards.length === 0 ? 'preflop' : boardCards.length === 3 ? 'flop' : boardCards.length === 4 ? 'turn' : 'river'),
                heroCards,
                boardCards,
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
        } catch (_err) {
            brainResult = null;
        }
    }

    const isPlo8 = effectiveVariant === 'plo8';
    const plo8LowEvaluation = isPlo8
        ? (brainResult?.plo8LowEvaluation || brainResult?.brainEvaluation?.plo8LowEvaluation || scenario.plo8LowEvaluation || null)
        : (brainResult?.plo8LowEvaluation || null);
    const engineModule = isPlo8
        ? 'plo8-brain.js'
        : (brainResult?.engineModule || brainResult?.brainEvaluation?.engineModule || scenario.brainEvaluation?.engineModule || null);

    const mergedBrainEvaluation = brainResult?.brainEvaluation
        ? {
            ...brainResult.brainEvaluation,
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
        variant: effectiveVariant,
        bettingStructure: resolvedBettingStructure,
        format: resolvedFormat,
        ...(engineModule ? { engineModule } : {}),
        ...(isPlo8 ? { hiLo: true, plo8LowEvaluation } : {}),
        scenario: {
            ...scenario,
            variant: effectiveVariant,
            holeCardCount: heroCards.length,
            bettingStructure: resolvedBettingStructure,
            format: resolvedFormat,
            ...(engineModule ? { engineModule } : {}),
            ...(isPlo8 ? { hiLo: true, plo8LowEvaluation } : {}),
            ...(mergedBrainEvaluation ? { brainEvaluation: mergedBrainEvaluation } : {}),
            ...(brainResult?.madeHandCategory ? { madeHandCategory: brainResult.madeHandCategory } : {}),
            ...(brainResult?.potLimitSizing ? { potLimitSizing: brainResult.potLimitSizing } : {}),
        },
    };
}

export function getWarmCachedQuestions(cacheKey) {
    if (!cacheKey || typeof cacheKey !== 'string') return null;
    const entry = WARM_QUESTION_CACHE.get(cacheKey);
    if (!entry) return null;
    if (Date.now() - entry.timestamp > WARM_CACHE_TTL_MS) {
        WARM_QUESTION_CACHE.delete(cacheKey);
        return null;
    }
    WARM_QUESTION_CACHE.delete(cacheKey);
    WARM_QUESTION_CACHE.set(cacheKey, entry);
    return Array.isArray(entry.rows) ? entry.rows : null;
}

export function setWarmCachedQuestions(cacheKey, rows) {
    if (!cacheKey || typeof cacheKey !== 'string' || !Array.isArray(rows) || rows.length === 0) {
        return;
    }
    if (WARM_QUESTION_CACHE.has(cacheKey)) {
        WARM_QUESTION_CACHE.delete(cacheKey);
    } else if (WARM_QUESTION_CACHE.size >= WARM_CACHE_MAX_ENTRIES) {
        const oldestKey = WARM_QUESTION_CACHE.keys().next().value;
        if (oldestKey !== undefined) WARM_QUESTION_CACHE.delete(oldestKey);
    }
    WARM_QUESTION_CACHE.set(cacheKey, {
        rows,
        timestamp: Date.now(),
    });
}

/**
 * Losslessly normalize a canonical row, then enforce the receipt authority
 * boundary. This deliberately does not add cards, a board, seats, a street,
 * pot geometry, stacks, options, frequencies, or provenance that the source
 * did not provide.
 *
 * `rejections` is an optional server-only tally (reason -> count). A dropped
 * candidate used to vanish between "engine generated N" and "engines returned
 * empty" with no trace of why; the tally names the contract or eligibility
 * reason without recording the question itself.
 */
function normalizeCampaignQuestionWithoutFabrication(question, rejections = null) {
    const reject = (reason) => {
        if (rejections) rejections[reason] = (rejections[reason] || 0) + 1;
        return null;
    };
    if (!question || typeof question !== 'object' || Array.isArray(question)) {
        return reject('question_missing');
    }
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
            .filter(([, value]) => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1)
            .map(([action, value]) => [action, Number((value * 100).toFixed(6))]));
        if (Object.keys(measured).length > 0) question.gtoFrequencies = measured;
    }

    const canonical = enforceTrainingQuestionContract(enforceSolverClaimHonesty(question));
    if (!isTrainingQuestionValid(canonical)) {
        const issue = String(canonical?.questionContract?.issues?.[0] || 'unspecified').slice(0, 120);
        return reject(`question_contract_invalid: ${issue}`);
    }
    if (!isTrainingQuestionCampaignEligible(canonical)) {
        const { reason } = trainingQuestionCampaignEligibility(canonical);
        return reject(`campaign_ineligible: ${String(reason || 'unspecified').slice(0, 80)} `
            + `(source=${String(canonical?.source || '').slice(0, 40)}, `
            + `classification=${String(canonical?.dataQuality || '').slice(0, 40)})`);
    }
    return canonical;
}

/** One bounded server-log line for engine candidates the campaign contract refused. */
function reportRejectedEngineCandidates({ gameId, level, generated, accepted, rejections }) {
    if (generated <= accepted) return;
    console.warn(
        `[BatchPreload] ${generated - accepted} of ${generated} engine candidates for ${gameId} `
        + `L${level} were refused by the campaign contract: ${JSON.stringify(rejections)}`,
    );
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
          variant: rawVariant,
          bettingStructure: rawBettingStructure,
          format: rawFormat,
          duelToken: rawDuelToken,
          duelRole: rawDuelRole,
          createDuel: rawCreateDuel,
          syncedHandId: rawSyncedHandId,
          attestationContinuationRule: rawAttestationContinuationRule,
          attestationContinuationPrecommit: rawAttestationContinuationPrecommit,
      } = req.query;
      const gameId = sanitizeParam(rawGameId, 100);
      const syncedHandId = sanitizeParam(rawSyncedHandId, 120);
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
      const createDuelRequested = String(rawCreateDuel || '') === '1';
      const trimmedDuelToken = typeof rawDuelToken === 'string' ? rawDuelToken.trim() : '';
      const duelPayload = trimmedDuelToken ? verifyTrainingDuelToken(trimmedDuelToken) : null;
      if (trimmedDuelToken && (!duelPayload || String(duelPayload.gameId) !== String(gameId))) {
          return res.status(400).json({
              success: false,
              error: 'Invalid or expired duel challenge token for this game.',
              code: 'TRAINING_DUEL_TOKEN_INVALID',
          });
      }
      const effectiveVariant = duelPayload?.variant && ['nlh', 'plo4', 'plo5', 'plo6', 'plo8'].includes(String(duelPayload.variant))
          ? String(duelPayload.variant)
          : requestedVariant;
      const effectiveBettingStructure = (duelPayload?.bettingStructure && ['no_limit', 'pot_limit', 'fixed_limit'].includes(String(duelPayload.bettingStructure)))
          ? String(duelPayload.bettingStructure)
          : (requestedBettingStructure || (effectiveVariant && String(effectiveVariant).startsWith('plo') ? 'pot_limit' : null));
      const effectiveFormat = (duelPayload?.format && ['cash', 'mtt', 'spins', 'hu', '9max'].includes(String(duelPayload.format)))
          ? String(duelPayload.format)
          : (requestedFormat || null);
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
          const isTenHandCustomSession = Boolean(
              createDuelRequested || duelPayload || syncedHandId || requestedQuestionCount === 10
          );
          const effectiveSessionKind = isTenHandCustomSession ? 'custom' : 'campaign';
          const effectiveTargetHands = isTenHandCustomSession ? 10 : attemptTargetHands;
          const isSingleHandRecovery = requestedQuestionCount === 1;
          // Campaign attempts always own the Level Registry's complete hand
          // count. Duels, synced-hand drills, and 10-hand leak-fix/shared-pack
          // sprints use the approved 10-hand custom challenge contract.
          const questionCount = isSingleHandRecovery ? 1 : effectiveTargetHands;
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
              ? Math.min(effectiveTargetHands, Math.max(1, parseInt(rawHandOrdinalStart, 10) || 1))
              : 1;

          // ●●● PHASE 15: Parse targeting params ●●●
          const targetPositions = rawTargetPositions
              ? rawTargetPositions.split(',').map(p => p.trim().toUpperCase()).filter(p => ['UTG', 'MP', 'CO', 'BTN', 'SB', 'BB', 'HJ', 'LJ', 'UTG+1', 'UTG+2', 'MP+1'].includes(p))
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
          // Every cohort refusal is the same public 422 by design: the body
          // must not reveal which stage failed, which parent qualified, or
          // anything about the hidden continuation branch. The server log
          // receives a structured stage + counts line instead (never ids,
          // answers, options, receipts, or secrets) so an operator can tell an
          // empty catalog from a lost provenance seal from a missing child.
          const refuseUnavailableAttestationContinuationCohort = (stage, counts = {}, detail = null) => {
              logTrainingAttestationCohortStage({
                  stage,
                  counts: {
                      gameId,
                      level: gameLevel,
                      difficulty,
                      targetStreet: targetStreet || 'any',
                      questionCount,
                      ...counts,
                  },
                  detail,
              });
              return res.status(422).json({
                  success: false,
                  error: 'No exact 20-hand continuation cohort is available for this public precommit.',
                  code: 'TRAINING_ATTESTATION_CONTINUATION_COHORT_UNAVAILABLE',
              });
          };
          if (attestationContinuationRequested
              && (!attestationContinuationPrecommit || isSingleHandRecovery)) {
              return refuseUnavailableAttestationContinuationCohort('precommit_rejected', {
                  precommitValid: attestationContinuationPrecommit ? 1 : 0,
                  singleHandRecovery: isSingleHandRecovery ? 1 : 0,
              });
          }
          const attemptSelection = {
              gameMode,
              handSelection,
              targetStreet: enforcedTargetStreet,
              ...(effectiveVariant ? { variant: effectiveVariant } : {}),
              ...(effectiveBettingStructure ? { bettingStructure: effectiveBettingStructure } : {}),
              ...(effectiveFormat ? { format: effectiveFormat } : {}),
              ...(duelPayload?.duelId ? { duelId: String(duelPayload.duelId) } : {}),
              ...(syncedHandId ? { syncedHandId: String(syncedHandId) } : {}),
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
                      sessionKind: effectiveSessionKind,
                      difficultyMode: difficulty,
                      requestedHands: effectiveTargetHands,
                      handOrdinal: handOrdinalStart,
                      config: attemptSelection,
                      questionSelection: attemptSelection,
                  });
                  if (recovered?.questions?.length === 1) {
                      await recordTrainingQuestionsServedForAttempt(getSupabase(), {
                          userId: _authUser.id,
                          delivery: recovered,
                      });
                      const shouldAdaptRecovered = Boolean(
                          effectiveVariant
                          || effectiveBettingStructure
                          || effectiveFormat
                          || ['cash-005', 'cash-015', 'mtt-018'].includes(gameId),
                      );
                      const adaptedRecoveredQuestions = shouldAdaptRecovered
                          ? recovered.questions.map((q, idx) => adaptQuestionToVariant(q, effectiveVariant, idx, {
                              gameId,
                              variant: effectiveVariant,
                              bettingStructure: effectiveBettingStructure,
                              format: effectiveFormat,
                          }))
                          : recovered.questions;
                      return res.status(200).json({
                          success: true,
                          gameId,
                          level: gameLevel,
                          sessionId: trainingSessionId,
                          attemptId: recovered.attemptId,
                          sessionKind: recovered.sessionKind,
                          targetHands: recovered.targetHands,
                          count: adaptedRecoveredQuestions.length,
                          questions: adaptedRecoveredQuestions,
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

          let syncedResolution = null;
          if (syncedHandId && typeof resolveSyncedHandForTrainingDrill === 'function') {
              syncedResolution = await resolveSyncedHandForTrainingDrill({
                  supabase: getSupabase(),
                  userId: _authUser.id,
                  syncedHandId,
                  gameId,
                  level: gameLevel,
              });
              if (!syncedResolution?.ok) {
                  return res.status(syncedResolution?.status || 422).json({
                      success: false,
                      error: syncedResolution?.error || 'Unable to load synced hand drill.',
                      code: syncedResolution?.code || 'HAND_DRILL_UNSUPPORTED',
                  });
              }
          }


          // Fetch questions from cache
          // 2026-07-19 ENGINE AUDIT FIX: limiting to questionCount BEFORE the
          // shuffle meant Postgres returned the same first-N rows every call —
          // users looped the identical 15 questions per level forever. Over-
          // fetch the pool, then shuffle, then slice.
          // ●●● SEEN-QUESTION EXCLUSION (fail-safe, non-blocking) & CACHE READ ●●●
          let seenIds = new Set();
          let questions;
          const seenPromise = !duelPayload && _authUser?.id
              ? runTrainingPersistenceQuery(
                  () => getSupabase()
                      .from('user_seen_questions')
                      .select('question_id')
                      .eq('user_id', _authUser.id)
                      .eq('game_id', gameId)
                      .limit(2000),
                  { label: 'BatchPreload:seen-read' },
              ).then((res) => ({ data: res?.data || [], error: null }))
               .catch((e) => ({ data: [], error: e }))
              : Promise.resolve({ data: [], error: null });

          const warmCacheKey = !duelPayload
              ? buildWarmCacheKey({
                  gameId,
                  level: gameLevel,
                  variant: effectiveVariant,
                  bettingStructure: effectiveBettingStructure,
                  format: effectiveFormat,
              })
              : '';
          const warmCachedRows = warmCacheKey ? getWarmCachedQuestions(warmCacheKey) : null;
          const warmHit = Array.isArray(warmCachedRows) && warmCachedRows.length > 0;
          res.setHeader('X-Training-Cache-Mode', warmHit ? 'WARM_MEM' : 'DB_READ');

          const cachePromise = warmHit
              ? Promise.resolve({ data: getWarmCachedQuestions(warmCacheKey), error: null })
              : runTrainingPersistenceQuery(
                  () => {
                      let query = getSupabase()
                          .from('training_question_cache')
                          .select('id, question_id, question_data, engine_type, question_kind, canonical_policy, source_classification, quality_status, policy_version, policy_checksum, generated_at, source_created_at')
                          .eq('game_id', gameId)
                          .eq('level', gameLevel)
                          .in('quality_status', ['active', 'active_fallback']);
                      if (duelPayload?.questionIds?.length > 0) {
                          query = query.in('question_id', duelPayload.questionIds.slice(0, 30));
                      }
                      return query.limit(Math.max(100, candidateQuestionCount * 3));
                  },
                  { label: 'BatchPreload:cache-read' },
              ).then((res) => {
                  if (!duelPayload && warmCacheKey && Array.isArray(res?.data) && res.data.length > 0) {
                      setWarmCachedQuestions(warmCacheKey, res?.data);
                  }
                  return { data: res?.data, error: null };
              })
               .catch((err) => ({ data: null, error: err }));

          const [seenOutcome, cacheOutcome] = await Promise.all([seenPromise, cachePromise]);

          if (!duelPayload) {
              if (seenOutcome.error) {
                  console.warn('[BatchPreload] Seen history unavailable; continuing without exclusion:', seenOutcome.error.message);
              } else {
                  seenIds = new Set((seenOutcome.data || []).map((r) => r.question_id));
              }
          }

          if (cacheOutcome.error) {
              console.warn('[BatchPreload] Canonical cache read unavailable:', cacheOutcome.error.message);
              return res.status(503).json(trainingPersistenceUnavailableBody());
          }
          questions = cacheOutcome.data;

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
          const targetVariantFilter = effectiveVariant
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
          const requiresPkoScenarioTelemetry = ['mtt-005', 'mtt-020'].includes(gameId);
          const requiresExploitScenarioTelemetry = ['adv-003', 'adv-015', 'adv-016', 'cash-020'].includes(gameId);
          const authorityEligibleRows = contractedRows
              .map((row) => ({
                  ...row,
                  question_data: normalizeCampaignQuestionWithoutFabrication(row?.question_data),
              }))
              .filter((row) => {
                  const q = row.question_data;
                  if (!q) return false;
                  const madeCat = String(q.scenario?.madeHandCategory || q.scenario?.brainEvaluation?.madeHandCategory || '');
                  if (madeCat.includes('undefined')) return false;
                  if (
                      madeCat.startsWith('Pocket Pair (')
                      && Array.isArray(q.heroCards)
                      && q.heroCards.length === 2
                      && String(q.heroCards[0] || '')[0] !== String(q.heroCards[1] || '')[0]
                  ) {
                      return false;
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
                  if (requiresPkoScenarioTelemetry && (!Number.isFinite(Number(q.scenario?.bountyBb)) || !q.scenario?.brainEvaluation?.engineModule)) {
                      return false;
                  }
                  if (requiresExploitScenarioTelemetry && (!Number.isFinite(Number(q.scenario?.villainStats?.vpip)) || !q.scenario?.brainEvaluation?.engineModule)) {
                      return false;
                  }
                  return true;
              });
          // An explicit street target is a hard training contract, not a hint.
          // Applying it only to generated rows meant a warm cache silently
          // ignored the user's Turn/Flop/River selection whenever it already
          // held enough mixed-street questions.
          const rows = targetStreet
              ? authorityEligibleRows.filter((row) => streetOfCachedRow(row) === targetStreet)
              : authorityEligibleRows;
          const positionFilteredRows = Array.isArray(targetPositions) && targetPositions.length > 0
              ? rows.filter((row) => {
                  const heroPos = String(
                      row?.question_data?.scenario?.heroPosition
                      || row?.question_data?.scenario?.position
                      || ''
                  ).toUpperCase();
                  return targetPositions.includes(heroPos);
              })
              : rows;
          const selectableRows = positionFilteredRows.filter((row) => (
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
          // Server-only count of engine-built parents before the four-choice
          // and campaign-eligibility contracts filtered them. It lets the
          // cohort log separate "the catalog returned nothing" from "the
          // catalog returned parents that the delivery contract rejected".
          let generatedParentCandidates = 0;

          if (cachedQuestions.length < candidateQuestionCount
              || attestationContinuationPrecommit) {
              const pioConfig = effectiveVariant && declaredCfg
                  ? { ...declaredCfg, variant: effectiveVariant }
                  : declaredCfg;
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
                              // Campaign attempts admit only progress-bearing
                              // authority; the engine uses this to choose its
                              // honest fallback instead of rows this route
                              // would have to refuse.
                              admissibleForCaller: isTrainingQuestionCampaignEligible,
                          });
                      generatedParentCandidates = Array.isArray(batch) ? batch.length : 0;
                      if (batch && batch.length > 0) {
                          const rejections = {};
                          solverQuestions = batch
                              .map(question => ({
                                  question_data: normalizeCampaignQuestionWithoutFabrication(question, rejections),
                              }))
                              .filter(row => row.question_data);
                          console.debug(`[BatchPreload] DeterministicEngine generated ${batch.length} solver questions for ${gameId}`);
                          reportRejectedEngineCandidates({
                              gameId,
                              level: gameLevel,
                              generated: batch.length,
                              accepted: solverQuestions.length,
                              rejections,
                          });
                      }
                  } catch (solverErr) {
                      console.warn('[BatchPreload] ▲ Solver engine failed:', solverErr.message);
                      if (attestationContinuationPrecommit) {
                          logTrainingAttestationCohortStage({
                              stage: 'solver_engine_failed',
                              counts: { gameId, level: gameLevel, difficulty },
                              detail: solverErr?.message,
                          });
                      }
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
                          const rejections = {};
                          solverQuestions = batch
                              .map(question => ({
                                  question_data: normalizeCampaignQuestionWithoutFabrication(question, rejections),
                              }))
                              .filter(row => row.question_data);
                          console.debug(`[BatchPreload] Engine generated ${batch.length} scenario questions for ${gameId}`);
                          reportRejectedEngineCandidates({
                              gameId,
                              level: gameLevel,
                              generated: batch.length,
                              accepted: solverQuestions.length,
                              rejections,
                          });
                      }
                  } catch (scenarioErr) {
                      console.warn('[BatchPreload] ▲ Scenario engine failed:', scenarioErr.message);
                  }
              }
          }

          // Merge cached + solver-generated questions
          const allQuestions = syncedResolution?.questions?.length > 0
              ? syncedResolution.questions
                  .map((question) => ({
                      question_data: normalizeCampaignQuestionWithoutFabrication(question),
                  }))
                  .filter((row) => row.question_data)
              : [...cachedQuestions, ...solverQuestions];

          if (allQuestions.length === 0) {
              // ●●● Engine-only — no AI fallback. Return 404 if no solver data exists. ●●●
              console.warn(`[BatchPreload] No questions for ${gameId} level ${gameLevel} - engines returned empty.`);
              if (attestationContinuationPrecommit) {
                  return refuseUnavailableAttestationContinuationCohort('no_candidate_questions', {
                      cachedQuestions: cachedQuestions.length,
                      generatedParentCandidates,
                      solverQuestions: solverQuestions.length,
                  });
              }
              return res.status(404).json({ success: false, error: 'No questions available for this game/level. Solver data not yet loaded for this configuration.' });
          }

          let batch;
          if (syncedResolution?.questions?.length > 0) {
              // Preserve the exact server-stored synced hand as Hand #1
              batch = [...allQuestions];
          } else {
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
          }
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
                  return refuseUnavailableAttestationContinuationCohort('configured_candidate_shortfall', {
                      cachedQuestions: cachedQuestions.length,
                      generatedParentCandidates,
                      solverQuestions: solverQuestions.length,
                      batchCandidates: batch.length,
                      enrichedCandidates: enrichedCandidates.length,
                      configuredCandidates: configuredCandidates.length,
                  });
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
              : (pioQueryService.getGameConfig(gameId)?.sourceOfTruth === 'ICMIZER' && !['plo4', 'plo5', 'plo6', 'plo8'].includes(effectiveVariant || '')) ? 'CHART' : 'PIO';
          const gameType = String(gameId).startsWith('mtt-') ? 'tournament'
              : String(gameId).startsWith('spins-') ? 'sng' : 'cash';
          for (const question of configuredCandidates) {
              if (!attestationContinuationPrecommit
                  && !duelPayload
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
                  return refuseUnavailableAttestationContinuationCohort('canonical_pair_shortfall', {
                      configuredCandidates: configuredCandidates.length,
                      canonicalPairs: canonicalPairs.length,
                      canonicalizeFailures: canonicalizeFailures.length,
                  });
              }
              return res.status(422).json({
                  success: false,
                  error: `Only ${canonicalPairs.length} of ${questionCount} questions satisfy this immutable drill configuration.`,
                  code: 'TRAINING_ATTEMPT_QUESTION_SHORTFALL',
              });
          }

          if (duelPayload?.questionIds?.length > 0) {
              const duelOrder = new Map(
                  duelPayload.questionIds.map((id, idx) => [String(id), idx]),
              );
              canonicalPairs.sort((a, b) => {
                  const idxA = duelOrder.has(String(a?.row?.question_id))
                      ? duelOrder.get(String(a.row.question_id))
                      : 9999;
                  const idxB = duelOrder.has(String(b?.row?.question_id))
                      ? duelOrder.get(String(b.row.question_id))
                      : 9999;
                  return idxA - idxB;
              });
          }

          let selectedCanonicalPairs = canonicalPairs.slice(0, questionCount);
          let attestationContinuationCohort = null;
          if (attestationContinuationPrecommit) {
              deterministicEngine.setSupabaseClient(getSupabase());
              const cohortCollector = createTrainingAttestationCohortCollector();
              const cohort = await selectTrainingAttestationContinuationCohort({
                  questionPairs: canonicalPairs,
                  targetHands: questionCount,
                  difficultyMode: difficulty,
                  gameConfig: declaredCfg,
                  precommit: attestationContinuationPrecommit,
                  queryNextStreet: (request) => deterministicEngine.queryNextStreet(request),
                  collector: cohortCollector,
              });
              if (!cohort) {
                  return refuseUnavailableAttestationContinuationCohort('cohort_unavailable', {
                      canonicalPairs: canonicalPairs.length,
                      ...cohortCollector.summary(),
                  });
              }
              selectedCanonicalPairs = [...cohort.questionPairs];
              attestationContinuationCohort = cohort.publicContract;
          }
          if (selectedCanonicalPairs.length !== questionCount) {
              if (attestationContinuationPrecommit) {
                  return refuseUnavailableAttestationContinuationCohort('selected_pair_shortfall', {
                      selectedCanonicalPairs: selectedCanonicalPairs.length,
                  });
              }
              return res.status(422).json({
                  success: false,
                  error: `Only ${selectedCanonicalPairs.length} of ${questionCount} questions satisfy this immutable drill configuration.`,
                  code: 'TRAINING_ATTEMPT_QUESTION_SHORTFALL',
              });
          }
          const canonicalRows = selectedCanonicalPairs.map(({ row }) => row);
          const unchangedReceiptByQuestionId = new Map();
          const dirtyCanonicalRows = canonicalRows.filter((row) => {
              const questionId = String(row?.question_id || '');
              const existingRow = originalCacheRowByQuestionId.get(questionId);
              const existingChecksum = existingRow?.question_data?.canonical_policy?.policy_checksum
                  || existingRow?.policy_checksum;
              const rowChecksum = row?.question_data?.canonical_policy?.policy_checksum
                  || row?.policy_checksum
                  || row?.question_data?.policyChecksum;
              if (
                  existingRow
                  && Boolean(rowChecksum)
                  && existingChecksum === rowChecksum
                  && cacheRowIsServingEligible(existingRow)
              ) {
                  unchangedReceiptByQuestionId.set(questionId, existingRow);
                  return false;
              }
              return true;
          });
          // Two players preloading the same game/level upsert the same
          // deterministic question ids. Submitting them in one stable
          // question_id order means both writers lock rows in the same
          // sequence; the served order below still follows
          // selectedCanonicalPairs and is unaffected.
          const canonicalRowsForWrite = orderRowsForConcurrentWrite(canonicalRows, 'question_id')
              .filter((row) => !unchangedReceiptByQuestionId.has(String(row?.question_id || '')));

          let servedBatch;
          try {
              const persisted = canonicalRowsForWrite.length > 0
                  ? await runTrainingPersistenceQuery(
                      () => getSupabase().from('training_question_cache')
                          .upsert(canonicalRowsForWrite, {
                              onConflict: 'question_id',
                              defaultToNull: false,
                          })
                          .select('question_id, question_data, canonical_policy, source_classification, quality_status, policy_version, policy_checksum'),
                      { label: 'BatchPreload:canonicalize' },
                  )
                  : { data: [] };
              const receiptByQuestionId = new Map([
                  ...unchangedReceiptByQuestionId.entries(),
                  ...(persisted.data || []).map((row) => [row.question_id, row]),
              ]);
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
              if (!duelPayload && !warmHit && warmCacheKey && Array.isArray(persisted.data) && persisted.data.length > 0) {
                  setWarmCachedQuestions(warmCacheKey, [...(questions || []), ...persisted.data]);
              }
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
                  sessionKind: effectiveSessionKind,
                  difficultyMode: difficulty,
                  requestedHands: effectiveTargetHands,
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

          const shouldAdaptServed = Boolean(
              effectiveVariant
              || effectiveBettingStructure
              || effectiveFormat
              || ['cash-005', 'cash-015', 'mtt-018'].includes(gameId),
          );
          const finalDeliveredQuestions = shouldAdaptServed
              ? (delivery.questions || []).map((q, idx) => adaptQuestionToVariant(q, effectiveVariant, idx, {
                  gameId,
                  variant: effectiveVariant,
                  bettingStructure: effectiveBettingStructure,
                  format: effectiveFormat,
              }))
              : delivery.questions;

          let duelResponse = null;
          if (createDuelRequested || duelPayload) {
              try {
                  const servedQuestionIds = (delivery.questions || []).map((q) => String(q.id));
                  const userName = _authUser.user_metadata?.display_name
                      || _authUser.user_metadata?.username
                      || 'Player';
                  const activeDuelId = duelPayload?.duelId
                      || `duel_${String(delivery.attemptId || '').replace(/[^a-zA-Z0-9]/g, '').slice(0, 24)}`;
                  const resolvedDuelVariant = effectiveVariant
                      || (['cash-005', 'cash-015', 'mtt-018'].includes(gameId) ? 'plo4' : 'nlh');
                  const resolvedDuelStructure = effectiveBettingStructure
                      || (resolvedDuelVariant.startsWith('plo') ? 'pot_limit' : 'no_limit');
                  const resolvedDuelFormat = effectiveFormat
                      || (String(gameId).startsWith('mtt-') ? 'mtt' : String(gameId).startsWith('spins-') ? 'spins' : 'cash');
                  const activeDuelToken = duelPayload
                      ? trimmedDuelToken
                      : createSignedTrainingDuelToken({
                          duelId: activeDuelId,
                          gameId,
                          level: gameLevel,
                          variant: resolvedDuelVariant,
                          bettingStructure: resolvedDuelStructure,
                          format: resolvedDuelFormat,
                          targetHands: servedQuestionIds.length,
                          questionIds: servedQuestionIds,
                          challengerId: _authUser.id,
                          challengerName: userName,
                          challengerAttemptId: delivery.attemptId,
                      });
                  const isChallengerUser = !duelPayload
                      || (rawDuelRole !== 'opponent' && (
                          String(_authUser.id) === String(duelPayload.challengerId || '')
                          || String(delivery.attemptId) === String(duelPayload.challengerAttemptId || '')
                      ));
                  const role = rawDuelRole === 'opponent' ? 'opponent' : (isChallengerUser ? 'challenger' : 'opponent');
                  const recordKey = role === 'opponent' && String(_authUser.id) === String(duelPayload?.challengerId || '')
                      ? `${activeDuelId}:opponent:${_authUser.id}`
                      : `${activeDuelId}:${_authUser.id}`;
                  await getSupabase()
                      .from('training_tool_records')
                      .upsert({
                          user_id: _authUser.id,
                          tool_id: 'async-duel',
                          record_type: 'participant',
                          record_key: recordKey,
                          data: {
                              duelId: activeDuelId,
                              duelToken: activeDuelToken,
                              gameId,
                              level: gameLevel,
                              variant: effectiveVariant || 'nlh',
                              targetHands: servedQuestionIds.length,
                              questionIds: duelPayload?.questionIds || servedQuestionIds,
                              challengerId: duelPayload?.challengerId || _authUser.id,
                              challengerName: duelPayload?.challengerName || userName,
                              challengerAttemptId: duelPayload?.challengerAttemptId || delivery.attemptId,
                              participantId: _authUser.id,
                              participantName: userName,
                              attemptId: delivery.attemptId,
                              sessionId: trainingSessionId,
                              role,
                              updatedAt: new Date().toISOString(),
                          },
                          updated_at: new Date().toISOString(),
                      }, { onConflict: 'user_id,tool_id,record_key' });
                  duelResponse = {
                      duelId: activeDuelId,
                      duelToken: activeDuelToken,
                      gameId,
                      level: gameLevel,
                      variant: effectiveVariant || 'nlh',
                      targetHands: servedQuestionIds.length,
                      questionIds: duelPayload?.questionIds || servedQuestionIds,
                      challengerAttemptId: duelPayload?.challengerAttemptId || delivery.attemptId,
                      attemptId: delivery.attemptId,
                      role,
                  };
              } catch (duelRecordErr) {
                  console.warn('[BatchPreload] Non-fatal duel record persistence warning:', duelRecordErr?.message || duelRecordErr);
              }
          }

          return res.status(200).json({
              success: true,
              gameId,
              level: gameLevel,
              sessionId: trainingSessionId,
              attemptId: delivery.attemptId,
              sessionKind: delivery.sessionKind,
              targetHands: delivery.targetHands,
              count: finalDeliveredQuestions.length,
              questions: finalDeliveredQuestions,
              ...(effectiveVariant ? { variant: effectiveVariant } : {}),
              ...(effectiveBettingStructure ? { bettingStructure: effectiveBettingStructure } : {}),
              ...(effectiveFormat ? { format: effectiveFormat } : {}),
              ...(duelResponse ? { duel: duelResponse } : {}),
              ...(syncedResolution?.syncedHand ? { syncedHand: syncedResolution.syncedHand } : {}),
              ...(attestationContinuationCohort
                  ? { attestationContinuationCohort }
                  : {}),
          });

      } catch (err) {
          console.warn('[BatchPreload] Unexpected error:', err);
          return res.status(500).json({ success: false, error: 'Internal server error' });
      }

  } catch (err) {
      try { reportApiError(err, req); } catch (_reportError) { console.warn('[App] Handled exception:', _reportError?.message || _reportError); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
