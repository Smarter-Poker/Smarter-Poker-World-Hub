/**
 * 🎰 USE MILLIONAIRE GAME — GTO Wizard-Style Training Flow Controller
 * ═══════════════════════════════════════════════════════════════════════════
 * Manages the training game with GTOW scoring integration:
 * - Fetches questions via API (PIO/CHART/SCENARIO engines)
 * - Tracks answers and enforces no-repeat logic
 * - Calculates GTOW Score, EV loss, and 5-tier move classification
 * - Exposes scoring metrics for GTO Wizard-style feedback UI
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { authedFetch, getAuthUser } from '../lib/authUtils';
import { createBoundedTrainingFetch } from '../lib/training/boundedTrainingFetch';
import TRAINING_CONFIG, {
  getRequiredCorrect,
} from '../config/trainingConfig';
import useGTOWScore from './useGTOWScore';
import { eventBus } from '../engine/EventBus';
import { getScoreGrade, getScoreColor } from '../engines/GTOScoreEngine';
import { trainingSounds } from '../utils/trainingSounds';
import { MultiStreetHand } from '../engines/MultiStreetHandManager';

// ═══ Phase GTO-CLONE: ActionTreeEngine for GTO action mapping + scoring ═══
import { scoreAction, mapToSolverAction } from '../engines/ActionTreeEngine';
import { isCustomTrainerConfig } from '../lib/training/trainerConfigMode.mjs';
import {
  consumeOfflineQuestion,
  createOfflineQuestionCacheContract,
  getOfflineQuestions,
  setOfflineQuestions,
} from '../lib/training/offlineQuestionCache';

const trainingFetch = createBoundedTrainingFetch(authedFetch);

/**
 * roadmap #3 — GAME MODE.
 * GTO Wizard offers Full Hand (play the hand out across streets), Spot (a
 * single decision, then a fresh hand) and Street (drill one street only).
 * We only ever played the Full Hand behaviour: any flop/turn question silently
 * started a multi-street hand, so there was no way to drill isolated decisions.
 *
 *   'full'   -> continue across streets (previous behaviour, still the default)
 *   'spot'   -> one decision per hand, never continue
 *   'street' -> like spot, but restricted to questions on `targetStreet`
 *
 * An explicit street is a hard contract. Selection happens on the server,
 * before the attempt manifest is signed and before answer-bearing fields are
 * stripped from the browser DTO. The browser may validate that contract, but
 * it must never filter a signed attempt and silently redefine its hand count.
 */
export function applyStreetFilter(questions, gameMode, targetStreet) {
  if (!Array.isArray(questions) || questions.length === 0) return questions;
  if (gameMode !== 'street' || !targetStreet) return questions;
  const want = String(targetStreet).toLowerCase();
  const mismatched = questions.find(
    (question) => String(question?.scenario?.street || '').toLowerCase() !== want
  );
  if (mismatched) {
    throw new Error(`The signed Training attempt contains a non-${want} question.`);
  }
  return questions;
}

const QUESTIONS_PER_LEVEL = TRAINING_CONFIG.questionsPerLevel;
const TOTAL_LEVELS = TRAINING_CONFIG.totalLevels; // 12 (from LevelRegistry)

// classifyMove returns lowercase classifications — compare in lowercase everywhere
const MISTAKE_CLASSES = ['inaccuracy', 'wrong', 'blunder'];

/**
 * The browser used to instantiate the solver/question engine for optional review
 * widgets. That engine also imports authored solver ranges, curated questions,
 * psychology answers, and generation helpers, so the Arena bundle contained
 * the grading oracle before a player submitted anything.
 *
 * Keep the old optional widget call surface inert while those reports move to
 * an authenticated post-session endpoint. The only state retained here is a
 * count of verdicts the server has already revealed. Unknown insight methods
 * deliberately return null; they can neither author a question nor infer a
 * correct action.
 */
function createServerFeedbackOnlyInsightBoundary() {
  const revealedResults = [];
  const unavailable = () => null;
  const boundary = {
    _recentResults: revealedResults,
    _getSessionQuestionCount: () => revealedResults.length,
    recordRecentResult(result) {
      revealedResults.push(Boolean(result));
      if (revealedResults.length > 100) revealedResults.shift();
    },
    resetSession() {
      revealedResults.length = 0;
    },
    resetSessionDifficulty() {
      revealedResults.length = 0;
    },
  };

  return new Proxy(boundary, {
    get(target, property) {
      if (Reflect.has(target, property)) return Reflect.get(target, property);
      return unavailable;
    },
  });
}

const RECOVERABLE_ATTEMPT_START_CODES = new Set([
  'TRAINING_ATTEMPT_NONCE_CONFLICT',
  'TRAINING_ATTEMPT_EXPIRED',
  'TRAINING_ATTEMPT_NOT_OPEN',
  'TRAINING_ATTEMPT_ALREADY_COMPLETED',
]);

function trainingApiResponseError(payload, response, fallback) {
  const error = new Error(payload?.error || fallback || `Training request failed (${response?.status || 500}).`);
  error.code = payload?.code || null;
  error.status = response?.status || null;
  return error;
}

// ---------------------------------------------------------------------------
// Multi-table residual (#10, shared prefs): 'gma_difficulty' is ONE
// localStorage key shared by every mounted arena, and this hook re-reads it
// every time a question is served. With N tables mounted, a difficulty change
// on table A's settings panel leaked into tables B/C/D's engines on their next
// deal. A caller that mounts several arenas at once (pages/hub/training/
// multi-table.js) now passes prefsScope: 'table' in initialConfig; a
// table-scoped mount resolves difficulty from its OWN config and never from
// the shared key. GodModeArena now gives every mount a normalized config and
// merges panel changes into it, so an explicit config always wins. The stored
// key is only a backward-compatible default for older/direct callers.
//
// NOTE for the GodModeArena owner: for a table-scoped mount, the settings
// panel's setDifficulty currently reaches this hook only through the shared
// key we now ignore. To make a mid-game panel change land on ITS OWN table,
// GodModeArena.jsx's difficulty-persist effect must also merge the value into
// trainerConfig -- see the comment beside prefsScope in multi-table.js for
// the exact replacement.
// ---------------------------------------------------------------------------
function resolveSharedDifficulty(trainerConfig) {
  if (trainerConfig?.difficulty) return trainerConfig.difficulty;
  return (
    (typeof localStorage !== 'undefined' ? localStorage.getItem('gma_difficulty') : null) ||
    'standard'
  );
}

function resolveDeliveryDifficulty(trainerConfig) {
  return trainerConfig?.difficultyMode || resolveSharedDifficulty(trainerConfig);
}

function createClientTrainingSessionId() {
  const randomUUID = globalThis?.crypto?.randomUUID;
  if (typeof randomUUID === 'function') return randomUUID.call(globalThis.crypto);
  return `training-${Date.now()}-${Math.random().toString(36).slice(2, 14)}`;
}

function createChildTrainingSessionId(baseSessionId, purpose) {
  const suffix = `${purpose}-${createClientTrainingSessionId()}`;
  const base = normalizeExternalTrainingSessionId(baseSessionId) || 'training';
  return `${base.slice(0, Math.max(1, 179 - suffix.length))}-${suffix}`.slice(0, 180);
}

function normalizeExternalTrainingSessionId(value) {
  if (typeof value !== 'string') return null;
  const normalized = value.replace(/[^a-zA-Z0-9_+\-.]/g, '').slice(0, 180);
  return normalized || null;
}

function createDeliveryFamilyKey(gameId, level, trainerConfig) {
  return JSON.stringify({
    gameId,
    level: Math.max(1, Math.min(12, Number(level) || 1)),
    difficulty: String(resolveDeliveryDifficulty(trainerConfig)).toLowerCase(),
    gameMode: String(trainerConfig?.gameMode || 'full').toLowerCase(),
    targetStreet: String(trainerConfig?.targetStreet || trainerConfig?.street || '').toLowerCase() || null,
    handSelection: String(trainerConfig?.handSelection || 'all').toLowerCase(),
    custom: isCustomTrainerConfig(trainerConfig) ? {
      gameType: String(trainerConfig?.gameType || 'cash').toLowerCase(),
      stackDepth: Number(trainerConfig?.stackDepth) || 100,
      position: String(trainerConfig?.position || 'any').toUpperCase(),
      villainPosition: String(trainerConfig?.villainPosition || 'any').toUpperCase(),
      actionScenario: String(trainerConfig?.actionScenario || 'any').toUpperCase(),
      handClass: String(trainerConfig?.handClass || 'all').toLowerCase(),
      boardTexture: String(trainerConfig?.boardTexture || 'any').toLowerCase(),
      spotType: String(trainerConfig?.spotType || 'any').toLowerCase(),
      questionsCount: Number(trainerConfig?.questionsCount) || QUESTIONS_PER_LEVEL,
    } : null,
  });
}

function createDeliveryContractKey(gameId, sessionId, trainerConfig, level = 1) {
  return JSON.stringify({
    sessionId,
    family: createDeliveryFamilyKey(gameId, level, trainerConfig),
  });
}

const PRE_ANSWER_PRIVATE_KEYS = new Set([
  'actionevs', 'answer', 'answerkey', 'bestaction', 'classification',
  'correct', 'correctanswer', 'correctanswerid', 'correctanswertext',
  'evdata', 'explanation', 'feedback', 'frequencies', 'frequency',
  'gtofrequencies', 'iscorrect', 'nextstreetcontinuation',
  'nextstreetcontinuationaction', 'optimalaction', 'preferredaction',
  'rawfrequencies', 'rngguidance', 'solution', 'solverstrategy',
  'structuredexplanation', 'targetactionid', 'targetactiontext',
]);

function containsPreAnswerGradingData(value) {
  if (Array.isArray(value)) return value.some(containsPreAnswerGradingData);
  if (!value || typeof value !== 'object') return false;
  return Object.entries(value).some(([key, child]) => {
    const normalizedKey = String(key).toLowerCase().replace(/[^a-z0-9]/g, '');
    return PRE_ANSWER_PRIVATE_KEYS.has(normalizedKey)
      || normalizedKey.startsWith('correct')
      || normalizedKey.startsWith('bestaction')
      || normalizedKey.startsWith('preferredaction')
      || normalizedKey.startsWith('optimalaction')
      || normalizedKey.startsWith('nextstreetcontinuation')
      || normalizedKey.startsWith('targetaction')
      || normalizedKey.endsWith('explanation')
      || normalizedKey.endsWith('frequencies')
      || normalizedKey.endsWith('actionevs')
      || containsPreAnswerGradingData(child);
  });
}

/**
 * A question may only be graded when it came from the authenticated delivery
 * boundary. Besides catching accidental unsigned mocks/fallbacks, this makes
 * sure every online request in one mounted Arena remains bound to the same
 * server-visible session.
 */
function assertSignedTrainingDelivery(payload, expectedSessionId, expectedAttempt = null) {
  const questions = Array.isArray(payload?.questions)
    ? payload.questions
    : payload?.question ? [payload.question] : [];
  if (String(payload?.sessionId || '') !== String(expectedSessionId || '')) {
    throw new Error('Training delivery returned a mismatched session. Reload the Arena.');
  }
  if (!payload?.attemptId) {
    throw new Error('Training delivery returned without an attempt identity. Reload the Arena.');
  }
  const seenSubmissionIds = new Set();
  const seenHandOrdinals = new Set();
  let attemptContract = null;
  for (const question of questions) {
    if (containsPreAnswerGradingData(question)) {
      throw new Error('Training delivery exposed private grading data. Reload the Arena.');
    }
    const context = question?._gradingContext;
    if (
      !context?.receipt
      || !context?.submissionId
      || !context?.sessionId
      || !context?.attemptId
      || !context?.snapshotKey
      || !context?.sessionKind
      || !Number.isInteger(Number(context?.sessionTargetHands))
      || Number(context.sessionTargetHands) < 1
      || !Number.isInteger(Number(context?.handOrdinal))
      || Number(context.handOrdinal) < 1
      || Number(context.handOrdinal) > Number(context.sessionTargetHands)
      || !Number.isInteger(Number(context?.decisionOrdinal))
      || Number(context.decisionOrdinal) < 1
      || typeof context?.countsTowardCompletion !== 'boolean'
      || typeof context?.practiceOnly !== 'boolean'
    ) {
      throw new Error('Training delivery returned an unsigned question. Reload the Arena.');
    }
    const expiresAt = Date.parse(context.expiresAt || '');
    if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
      throw new Error('Training delivery returned an expired question. Reload the Arena.');
    }
    if (String(context.sessionId) !== String(expectedSessionId || '')) {
      throw new Error('Training question belongs to a different session. Reload the Arena.');
    }
    if (String(context.attemptId) !== String(payload.attemptId)) {
      throw new Error('Training question belongs to a different attempt. Reload the Arena.');
    }
    const contractKey = JSON.stringify({
      sessionKind: context.sessionKind,
      sessionTargetHands: Number(context.sessionTargetHands),
      practiceOnly: context.practiceOnly,
    });
    if (attemptContract && attemptContract !== contractKey) {
      throw new Error('Training questions disagree about their attempt contract. Reload the Arena.');
    }
    attemptContract = contractKey;
    if (
      seenSubmissionIds.has(String(context.submissionId))
      || seenHandOrdinals.has(Number(context.handOrdinal))
    ) {
      throw new Error('Training delivery repeated a signed hand. Reload the Arena.');
    }
    seenSubmissionIds.add(String(context.submissionId));
    seenHandOrdinals.add(Number(context.handOrdinal));
    if (
      payload?.targetHands !== undefined
      && Number(payload.targetHands) !== Number(context.sessionTargetHands)
    ) {
      throw new Error('Training delivery returned a mismatched attempt target. Reload the Arena.');
    }
    if (Boolean(context.countsTowardCompletion) !== (Number(context.decisionOrdinal) === 1)) {
      throw new Error('Training question has an invalid decision count contract. Reload the Arena.');
    }
    if (expectedAttempt && (
      (expectedAttempt.attemptId
        && String(context.attemptId) !== String(expectedAttempt.attemptId))
      || (expectedAttempt.snapshotKey
        && String(context.snapshotKey) !== String(expectedAttempt.snapshotKey))
      || (expectedAttempt.handOrdinal !== undefined
        && Number(context.handOrdinal) !== Number(expectedAttempt.handOrdinal))
      || (expectedAttempt.decisionOrdinal !== undefined
        && Number(context.decisionOrdinal) !== Number(expectedAttempt.decisionOrdinal))
    )) {
      throw new Error('Training continuation does not match the active hand attempt.');
    }
  }
  return questions;
}

function assertRecordedAnswerAcknowledgement(payload, submission) {
  if (
    payload?.success !== true
    || String(payload?.submissionId || '') !== String(submission?.submissionId || '')
    || String(payload?.sessionId || '') !== String(submission?.sessionId || '')
    || String(payload?.attemptId || '') !== String(submission?.attemptId || '')
    || String(payload?.snapshotKey || '') !== String(submission?.snapshotKey || '')
    || Number(payload?.handOrdinal) !== Number(submission?.handOrdinal)
    || Number(payload?.decisionOrdinal) !== Number(submission?.decisionOrdinal)
    || typeof payload?.countsTowardCompletion !== 'boolean'
    || typeof payload?.practiceOnly !== 'boolean'
    || Boolean(payload?.countsTowardCompletion) !== Boolean(submission?.countsTowardCompletion)
    || Boolean(payload?.practiceOnly) !== Boolean(submission?.practiceOnly)
  ) {
    throw new Error('The Training server did not acknowledge this exact signed answer.');
  }
}

export default function useGTOTrainer(
  gameId,
  engineType = 'PIO',
  initialLevel = 1,
  trainerConfig = null,
  externalSessionId = null,
) {
  // Session analytics must be isolated per Arena mount. Multi-table Training
  // renders several hooks concurrently; sharing the module singleton allowed
  // one table's reset and answers to erase or contaminate every other table.
  const postAnswerInsightsRef = useRef(null);
  if (!postAnswerInsightsRef.current) {
    postAnswerInsightsRef.current = createServerFeedbackOnlyInsightBoundary();
  }
  // Backward-compatible name for the optional post-answer widget wrappers
  // below. This is the inert boundary above, never the solver/question engine.
  const postAnswerInsights = postAnswerInsightsRef.current;

  // If custom trainer config provided, use its questions count
  const baseQuestionsPerLevel = trainerConfig?.questionsCount || QUESTIONS_PER_LEVEL;
  const [effectiveQuestionsPerLevel, setEffectiveQuestionsPerLevel] =
    useState(baseQuestionsPerLevel);
  // Game state
  const [currentQuestion, setCurrentQuestion] = useState(null);
  const [questionNumber, setQuestionNumber] = useState(1);
  const [level, setLevel] = useState(initialLevel);
  // ═══ 2026-07-19 AUDIT FIX (wave-1 regression sweep): adaptive difficulty
  // mutates `level` mid-session (crushing 5 in a row bumps it +1), which then
  // leaked into progress persistence, pass thresholds, and UI labels — a user
  // who SELECTED Level 1 could get their completion recorded as Level 2 and
  // see "Retry Level 2". `selectedLevel` is the immutable level the user
  // entered with: use it for persistence/thresholds/labels; keep `level` as
  // the adaptive CONTENT difficulty only. ═══
  const [selectedLevel, setSelectedLevel] = useState(initialLevel);
  const [loading, setLoading] = useState(true); // Start true until pre-load completes
  const [error, setError] = useState(null);

  // 🚀 PRE-LOADED QUESTIONS - All 25 fetched at once
  const [preloadedQuestions, setPreloadedQuestions] = useState([]);
  const [preloadComplete, setPreloadComplete] = useState(false);
  // A served question can become ineligible before its answer reaches the
  // canonical recorder (stale offline pack, cache repair, or replica lag).
  // Keep feedback visible, remember the server verdict, and replace that hand
  // only after the player explicitly clicks Next.
  const refreshRequiredQuestionIdsRef = useRef(new Set());
  const pendingAnswerPersistenceRef = useRef(null);
  const nextQuestionInFlightRef = useRef(null);
  const submitAnswerInFlightRef = useRef(null);
  const [answerSaveError, setAnswerSaveError] = useState(null);
  const [answerSaveRetrying, setAnswerSaveRetrying] = useState(false);
  const [answerSaveRequiresRefresh, setAnswerSaveRequiresRefresh] = useState(false);
  const trainingSessionIdRef = useRef(null);
  const trainingSessionGameIdRef = useRef(null);
  const externalSessionIdRef = useRef(null);
  const loadedDeliveryContractRef = useRef(null);
  const loadedSessionConfigContractRef = useRef(null);
  const pendingSessionConfigContractRef = useRef(null);
  const deliveryGenerationRef = useRef(0);
  const terminalRecoveryBudgetRef = useRef({ familyKey: null, used: false });
  const runtimeIdentityChangedRef = useRef(false);
  const resetAttemptRuntimeRef = useRef(() => {});
  const [, bumpTrainingSessionRevision] = useState(0);
  const normalizedExternalSessionId = normalizeExternalTrainingSessionId(externalSessionId);
  if (
    !trainingSessionIdRef.current
    || trainingSessionGameIdRef.current !== gameId
    || externalSessionIdRef.current !== normalizedExternalSessionId
  ) {
    if (trainingSessionIdRef.current) runtimeIdentityChangedRef.current = true;
    trainingSessionIdRef.current = normalizedExternalSessionId || createClientTrainingSessionId();
    trainingSessionGameIdRef.current = gameId;
    externalSessionIdRef.current = normalizedExternalSessionId;
    loadedDeliveryContractRef.current = null;
    loadedSessionConfigContractRef.current = null;
    pendingSessionConfigContractRef.current = null;
    terminalRecoveryBudgetRef.current = { familyKey: null, used: false };
    deliveryGenerationRef.current += 1;
  }
  const trainingSessionId = trainingSessionIdRef.current;

  const activateFreshTrainingSession = useCallback((purpose, explicitSessionId = null) => {
    const nextSessionId = normalizeExternalTrainingSessionId(explicitSessionId)
      || createChildTrainingSessionId(trainingSessionIdRef.current, purpose);
    trainingSessionIdRef.current = nextSessionId;
    trainingSessionGameIdRef.current = gameId;
    externalSessionIdRef.current = normalizedExternalSessionId;
    loadedDeliveryContractRef.current = null;
    deliveryGenerationRef.current += 1;
    refreshRequiredQuestionIdsRef.current.clear();
    nextLevelCacheRef.current = null;
    if (purpose !== 'attempt-recovery') {
      terminalRecoveryBudgetRef.current = { familyKey: null, used: false };
    }
    bumpTrainingSessionRevision((revision) => revision + 1);
    return nextSessionId;
  }, [gameId, normalizedExternalSessionId]);

  const captureTrainingLease = useCallback(() => ({
    generation: deliveryGenerationRef.current,
    sessionId: trainingSessionIdRef.current,
    gameId,
  }), [gameId]);

  const isTrainingLeaseActive = useCallback((lease) => Boolean(
    lease
    && lease.generation === deliveryGenerationRef.current
    && lease.sessionId === trainingSessionIdRef.current
    && lease.gameId === trainingSessionGameIdRef.current
  ), []);

  const recoverTerminalAttempt = useCallback((error, effectiveLevel, requestLease) => {
    if (!isTrainingLeaseActive(requestLease)) return false;
    const familyKey = createDeliveryFamilyKey(gameId, effectiveLevel, trainerConfig);
    const budget = terminalRecoveryBudgetRef.current;
    if (budget.familyKey === familyKey && budget.used) {
      setPreloadComplete(false);
      setLoading(false);
      setError(
        error?.message
        || 'This Training attempt could not be refreshed automatically. Start a new session.',
      );
      return false;
    }
    terminalRecoveryBudgetRef.current = { familyKey, used: true };
    resetAttemptRuntimeRef.current();
    activateFreshTrainingSession('attempt-recovery');
    setLoading(true);
    return true;
  }, [activateFreshTrainingSession, gameId, isTrainingLeaseActive, trainerConfig]);

  // Score tracking
  const [correctCount, setCorrectCount] = useState(0);
  const [streak, setStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);

  // Feedback state
  const [showFeedback, setShowFeedback] = useState(false);
  const [feedbackResult, setFeedbackResult] = useState(null); // 'correct' | 'wrong'
  const [explanation, setExplanation] = useState('');
  // Phase 251: Structured explanation object
  const [structuredExplanation, setStructuredExplanation] = useState(null);

  // Game completion state
  const [gameComplete, setGameComplete] = useState(false);
  const [levelPassed, setLevelPassed] = useState(false);
  const [diamondsEarned, setDiamondsEarned] = useState(0);

  // GTOW scoring integration
  const gtowScoring = useGTOWScore();
  const [lastMoveClassification, setLastMoveClassification] = useState(null);
  const [lastEVLoss, setLastEVLoss] = useState(null);
  const [lastEVLossMeasured, setLastEVLossMeasured] = useState(false);
  const [lastGTOFrequencies, setLastGTOFrequencies] = useState(null);

  // ═══ MULTI-STREET STATE ═══
  const [currentStreet, setCurrentStreet] = useState('flop');
  const [isMultiStreetActive, setIsMultiStreetActive] = useState(false);
  const [handSummary, setHandSummary] = useState(null);
  const [lastSelectedAction, setLastSelectedAction] = useState(null);
  const multiStreetHandRef = useRef(null);

  const activateNewTrainingQuestion = useCallback((question) => {
    if (!question) throw new Error('A signed Training question is required.');
    const scenario = question.scenario || {};
    const street = String(scenario.street || 'flop').toLowerCase();
    // Continuation eligibility is deliberately absent from the blind DTO: it
    // reveals which answer keeps a solved line alive. The manager is created
    // only after record-question persists the decision and reveals that
    // canonical action in its feedback response.
    multiStreetHandRef.current = null;
    setIsMultiStreetActive(false);
    setCurrentStreet(street);
    setCurrentQuestion(question);
    return question;
  }, []);

  // ═══ MISTAKE REPLAY STATE ═══
  const mistakeQuestionsRef = useRef([]);

  // ═══ ADAPTIVE DIFFICULTY STATE ═══
  const [adaptiveLevelChange, setAdaptiveLevelChange] = useState(null); // { from, to, direction }
  const adaptiveCheckpointRef = useRef(5); // Check every 5 questions

  // ═══ PHASE 14: NEXT-LEVEL PREFETCH STATE ═══
  const nextLevelCacheRef = useRef(null); // { level, questions } — prefetched next level
  const prefetchTriggeredRef = useRef(false);

  // Tracks per-position, per-street, per-spotType accuracy for smart targeting.
  // This must be declared before the preload callback because preload uses the
  // latest weakness map to request targeted questions.
  const weakSpotMapRef = useRef({});
  const getWeakSpots = useCallback(() => {
    const map = weakSpotMapRef.current;
    return Object.values(map || {})
      .filter((spot) => spot.total >= 3)
      .map((spot) => ({ ...spot, mistakeRate: spot.mistakes / spot.total }))
      .sort((a, b) => b.mistakeRate - a.mistakeRate)
      .slice(0, 5);
  }, []);

  // Get user ID for no-repeat tracking
  const userId = getAuthUser()?.id;
  const offlineCacheContract = createOfflineQuestionCacheContract({
    difficulty: resolveDeliveryDifficulty(trainerConfig),
    gameMode: trainerConfig?.gameMode || 'full',
    handSelection: trainerConfig?.handSelection || 'all',
    targetStreet: trainerConfig?.targetStreet || trainerConfig?.street || null,
  });

  /**
   * ═══ PHASE 14: Background prefetch for next level ═══
   * Fires when player is ~60% through current level
   * Ensures zero loading time when advancing to next level
   */
  const prefetchNextLevel = useCallback(async () => {
    if (prefetchTriggeredRef.current) return;
    if (selectedLevel >= TOTAL_LEVELS) return; // Max campaign level, nothing to prefetch
    if (isCustomTrainerConfig(trainerConfig)) return; // Custom trainers don't auto-advance

    prefetchTriggeredRef.current = true;
    const nextLevel = selectedLevel + 1;
    const prefetchSessionId = createChildTrainingSessionId(
      trainingSessionIdRef.current,
      `prefetch-L${nextLevel}`,
    );
    const requestLease = captureTrainingLease();

    try {
      const params = new URLSearchParams({
        gameId,
        level: nextLevel.toString(),
        count: effectiveQuestionsPerLevel.toString(),
        difficulty: resolveDeliveryDifficulty(trainerConfig),
        sessionId: prefetchSessionId,
        gameMode: trainerConfig?.gameMode || 'full',
        handSelection: trainerConfig?.handSelection || 'all',
      });
      if (trainerConfig?.gameMode === 'street' && trainerConfig?.targetStreet) {
        params.set('targetStreet', trainerConfig.targetStreet);
      }

      const response = await trainingFetch(`/api/training/batch-preload?${params}`);
      if (!isTrainingLeaseActive(requestLease)) return;

      const textResponse = await response.text();
      if (!isTrainingLeaseActive(requestLease)) return;
      const data = JSON.parse(textResponse);

      if (response.ok && data.questions && data.questions.length > 0) {
        if (!isTrainingLeaseActive(requestLease)) return;
        assertSignedTrainingDelivery(data, prefetchSessionId);
        const selected = applyStreetFilter(
          data.questions,
          trainerConfig?.gameMode,
          trainerConfig?.targetStreet,
        );
        if (selected.length === 0) return;
        nextLevelCacheRef.current = {
          level: nextLevel,
          sessionId: prefetchSessionId,
          questions: selected,
        };
        console.debug(
          `[GTOTrainer] 🚀 Prefetched ${selected.length} questions for level ${nextLevel}`
        );
      }
    } catch (err) {
      if (!isTrainingLeaseActive(requestLease)) return;
      console.warn('[App] Handled exception:', err?.message || err);
    }
  }, [captureTrainingLease, effectiveQuestionsPerLevel, gameId, isTrainingLeaseActive, selectedLevel, trainerConfig]);

  /**
   * Resolve the active difficulty mode (Simple/Grouped/Standard) —
   * same resolution order used everywhere a question is served.
   */
  const resolveDifficultyMode = useCallback(() => {
    return resolveDeliveryDifficulty(trainerConfig);
  }, [trainerConfig]);

  /**
   * FALLBACK: Fetch single question via deterministic batch-preload (count=1)
   * Eliminates all Grok AI dependency — pure solver data only
   */
  const fetchSingleQuestion = useCallback(async (
    levelOverride = null,
    handOrdinalOverride = questionNumber,
    { throwOnError = false } = {},
  ) => {
    if (!gameId) {
      const missingGameError = new Error('A Training game is required to load a signed hand.');
      if (throwOnError) throw missingGameError;
      return null;
    }

    const effectiveLevel = levelOverride ?? selectedLevel;
    const requestLease = captureTrainingLease();
    const requestSessionId = requestLease.sessionId;
    if (!isTrainingLeaseActive(requestLease) || trainingSessionId !== requestSessionId) return null;
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({
        gameId,
        level: effectiveLevel.toString(),
        count: '1',
        difficulty: resolveDeliveryDifficulty(trainerConfig),
        sessionId: trainingSessionId,
        handOrdinalStart: Math.max(1, Number(handOrdinalOverride) || 1).toString(),
        gameMode: trainerConfig?.gameMode || 'full',
        handSelection: trainerConfig?.handSelection || 'all',
      });
      if (trainerConfig?.gameMode === 'street' && trainerConfig?.targetStreet) {
        params.set('targetStreet', trainerConfig.targetStreet);
      }

      const response = await trainingFetch(`/api/training/batch-preload?${params}`);
      if (!isTrainingLeaseActive(requestLease)) return null;

      // Safe JSON parsing
      let data;
      const textResponse = await response.text();
      if (!isTrainingLeaseActive(requestLease)) return null;
      try {
        data = JSON.parse(textResponse);
      } catch (e) {
        if (response.status === 401) throw new Error('Auth required');
        throw new Error(`Server error (${response.status})`);
      }

      if (!response.ok || !data.questions || data.questions.length === 0) {
        throw trainingApiResponseError(data, response, 'No solver data available');
      }
      if (!isTrainingLeaseActive(requestLease)) return null;
      assertSignedTrainingDelivery(data, trainingSessionId, {
        handOrdinal: Math.max(1, Number(handOrdinalOverride) || 1),
        decisionOrdinal: 1,
      });

      const selected = applyStreetFilter(
        data.questions,
        trainerConfig?.gameMode,
        trainerConfig?.targetStreet,
      );
      if (selected.length === 0) {
        throw new Error(`No ${trainerConfig.targetStreet} question is available for this game.`);
      }
      const signedTargetHands = Number(data.targetHands);
      if (
        !Number.isInteger(signedTargetHands)
        || signedTargetHands < 1
        || Number(selected[0]?._gradingContext?.sessionTargetHands) !== signedTargetHands
      ) {
        throw new Error('The signed Training hand does not match its attempt target.');
      }
      terminalRecoveryBudgetRef.current = {
        familyKey: createDeliveryFamilyKey(gameId, effectiveLevel, trainerConfig),
        used: false,
      };
      const activatedQuestion = activateNewTrainingQuestion(selected[0]);
      setEffectiveQuestionsPerLevel(signedTargetHands);
      setShowFeedback(false);
      return activatedQuestion;
    } catch (err) {
      if (!isTrainingLeaseActive(requestLease)) return null;
      if (RECOVERABLE_ATTEMPT_START_CODES.has(err?.code)) {
        recoverTerminalAttempt(err, effectiveLevel, requestLease);
        return null;
      }
      console.warn('[GTOTrainer] Fetch error:', err);
      setError(err.message);
      if (throwOnError) throw err;
      return null;
    } finally {
      if (isTrainingLeaseActive(requestLease)) setLoading(false);
    }
  }, [activateNewTrainingQuestion, captureTrainingLease, gameId, isTrainingLeaseActive, questionNumber, recoverTerminalAttempt, selectedLevel, trainerConfig, trainingSessionId]);

  const reissueSignedQuestions = useCallback(async (
    sourceQuestions,
    sessionIdOverride = trainingSessionId,
    levelOverride = selectedLevel,
    {
      sessionKind = 'campaign',
      handOrdinalStart = 1,
      parentAttemptId = null,
      attemptId = null,
    } = {},
  ) => {
    const requestLease = captureTrainingLease();
    if (!isTrainingLeaseActive(requestLease)) {
      throw new Error('The Training session changed before questions could be reissued.');
    }
    const questionIds = Array.from(new Set(
      (Array.isArray(sourceQuestions) ? sourceQuestions : [])
        .map((question) => String(question?.id || ''))
        .filter(Boolean),
    ));
    if (questionIds.length === 0) throw new Error('No canonical questions are available to reissue.');

    const reissueBody = {
      gameId,
      questionIds,
      level: levelOverride,
      difficulty: resolveDeliveryDifficulty(trainerConfig),
      sessionId: sessionIdOverride,
      sessionKind,
      parentAttemptId,
      requestedHands: questionIds.length,
      handOrdinalStart,
      gameMode: trainerConfig?.gameMode || 'full',
      handSelection: trainerConfig?.handSelection || 'all',
      targetStreet: trainerConfig?.targetStreet || trainerConfig?.street || null,
    };
    if (attemptId) reissueBody.attemptId = attemptId;
    const immutableBody = JSON.stringify(reissueBody);
    let lastError = null;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const response = await trainingFetch('/api/training/reissue-questions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: immutableBody,
      });
      if (!isTrainingLeaseActive(requestLease)) {
        throw new Error('The Training session changed while questions were being reissued.');
      }
      let payload = null;
      try { payload = await response.json(); } catch (_) { /* handled below */ }
      if (!isTrainingLeaseActive(requestLease)) {
        throw new Error('The Training session changed while questions were being reissued.');
      }
      if (response.ok && Array.isArray(payload?.questions) && payload.questions.length > 0) {
        assertSignedTrainingDelivery(payload, sessionIdOverride);
        return payload.questions;
      }
      lastError = new Error(payload?.error || `Question reissue failed (${response.status})`);
      const retryable = response.status === 429 || response.status >= 500;
      if (!retryable || attempt === 2) break;
      await new Promise((resolve) => setTimeout(resolve, 250 * (2 ** attempt)));
      if (!isTrainingLeaseActive(requestLease)) {
        throw new Error('The Training session changed while questions were being reissued.');
      }
    }
    throw lastError || new Error('Question reissue failed.');
  }, [captureTrainingLease, gameId, isTrainingLeaseActive, selectedLevel, trainerConfig, trainingSessionId]);

  const recoverCachedQuestions = useCallback(async (cachedQuestions, effectiveLevel) => {
    if (!Array.isArray(cachedQuestions) || cachedQuestions.length === 0) return null;
    const cachedSessionId = String(cachedQuestions[0]?._gradingContext?.sessionId || '');
    const cachedAttemptId = String(cachedQuestions[0]?._gradingContext?.attemptId || '');
    const cachedSessionKind = String(cachedQuestions[0]?._gradingContext?.sessionKind || '');
    const cachedTargetHands = Number(
      cachedQuestions[0]?._gradingContext?.sessionTargetHands,
    );
    const cachedPayload = {
      success: true,
      sessionId: cachedSessionId,
      attemptId: cachedAttemptId,
      targetHands: cachedTargetHands,
      questions: cachedQuestions,
    };
    assertSignedTrainingDelivery(cachedPayload, cachedSessionId);
    const sameSession = cachedQuestions.every(
      (question) => String(question?._gradingContext?.sessionId || '') === trainingSessionId,
    );
    if (sameSession) {
      return cachedPayload;
    }

    let recoveredQuestions = cachedQuestions;
    if (typeof navigator === 'undefined' || navigator.onLine !== false) {
      recoveredQuestions = await reissueSignedQuestions(
        cachedQuestions,
        cachedSessionId,
        effectiveLevel,
        {
          sessionKind: cachedSessionKind,
          attemptId: cachedAttemptId,
        },
      );
      await setOfflineQuestions(
        gameId,
        effectiveLevel,
        recoveredQuestions,
        userId,
        offlineCacheContract,
      );
    }

    // The database binds every persisted decision to the attempt's original
    // client nonce. Adopt that immutable identity and let the delivery effect
    // restart under it; never move cached hands into a newly minted campaign.
    resetAttemptRuntimeRef.current();
    activateFreshTrainingSession('offline-resume', cachedSessionId);
    return {
      ...cachedPayload,
      questions: recoveredQuestions,
      recovered: true,
      adoptedSession: true,
    };
  }, [
    activateFreshTrainingSession,
    gameId,
    offlineCacheContract,
    reissueSignedQuestions,
    trainingSessionId,
    userId,
  ]);

  /**
   * 🚀 BATCH PRE-LOAD ALL QUESTIONS AT ONCE
   * Fetches all 25 questions when game starts
   * No more individual loading - instant question serving
   */
  const preloadAllQuestions = useCallback(async (levelOverride = null) => {
    if (!gameId) return;

    // levelOverride avoids stale-closure fetches when callers change the
    // level state and preload in the same tick (startNextLevel/resetGame)
    const effectiveLevel = levelOverride ?? selectedLevel;
    const requestLease = captureTrainingLease();
    const requestSessionId = requestLease.sessionId;
    if (!isTrainingLeaseActive(requestLease) || trainingSessionId !== requestSessionId) return;
    setLoading(true);
    setError(null);

    try {
      let apiUrl;
      let params;

      if (isCustomTrainerConfig(trainerConfig)) {
        // CUSTOM TRAINER MODE — use custom-train API with detailed config
        params = new URLSearchParams({
          gameId,
          gameType: trainerConfig.gameType || 'cash',
          stackDepth: (trainerConfig.stackDepth || 100).toString(),
          count: (trainerConfig.questionsCount || effectiveQuestionsPerLevel).toString(),
          level: effectiveLevel.toString(),
          difficulty: resolveDeliveryDifficulty(trainerConfig),
          sessionId: trainingSessionId,
          gameMode: trainerConfig.gameMode || 'full',
          handSelection: trainerConfig.handSelection || 'all',
        });
        if (trainerConfig.position && trainerConfig.position !== 'any') {
          params.set('position', trainerConfig.position);
        }
        if (trainerConfig.villainPosition) {
          params.set('villainPosition', trainerConfig.villainPosition);
        }
        if (trainerConfig.actionScenario) {
          params.set('actionScenario', trainerConfig.actionScenario);
        }
        const customTargetStreet = trainerConfig.targetStreet || trainerConfig.street;
        if (customTargetStreet) {
          params.set('street', customTargetStreet);
        }
        if (trainerConfig.handClass) {
          params.set('handClass', trainerConfig.handClass);
        }
        // GTOW parity #8 — board-texture targeting. TrainerConfigModal has
        // offered a Board Texture row (Dry Rainbow / Monotone / Two-Tone /
        // Paired / Connected / Broadway) since it shipped, and the value was
        // collected, stored on trainerConfig and then dropped right here: it
        // was the one config field never forwarded to the API, so picking
        // "Monotone" trained you on exactly the same boards as picking
        // nothing. The modal already normalises 'any' to null, so a plain
        // truthiness check is the whole guard needed.
        if (trainerConfig.boardTexture) {
          params.set('boardTexture', trainerConfig.boardTexture);
        }
        if (trainerConfig.spotType) {
          params.set('spotType', trainerConfig.spotType);
        }
        apiUrl = `/api/training/custom-train?${params}`;
        console.debug(`[GTOTrainer] Custom trainer: ${trainerConfig.label || 'custom config'}`);
      } else {
        // STANDARD MODE — use batch-preload
        params = new URLSearchParams({
          gameId,
          level: effectiveLevel.toString(),
          count: effectiveQuestionsPerLevel.toString(),
          sessionId: trainingSessionId,
          gameMode: trainerConfig?.gameMode || 'full',
          handSelection: trainerConfig?.handSelection || 'all',
        });

        // ═══ PHASE 15: Pass weak-spot targeting hints if available ═══
        const weakSpots = getWeakSpots();
        if (weakSpots.length > 0) {
          // Extract the weakest positions and streets
          const weakPositions = [...new Set(weakSpots.map((s) => s.position))].slice(0, 3);
          if (weakPositions.length > 0) {
            params.set('targetPositions', weakPositions.join(','));
          }
          // If the top weak spot has a clear street pattern, target that
          if (weakSpots[0].street && weakSpots[0].mistakeRate >= 0.5) {
            params.set('targetStreet', weakSpots[0].street);
          }
          console.debug(
            `[GTOTrainer] 🎯 Targeting weak spots: positions=${weakPositions.join(',')} street=${weakSpots[0].street || 'any'}`
          );
        }

        // Session configuration is authoritative. Reading localStorage here
        // raced the Arena's persistence effect, so the first question after a
        // Hub launch could be generated for the previous difficulty.
        params.set('difficulty', resolveDeliveryDifficulty(trainerConfig));
        if (trainerConfig?.gameMode === 'street' && trainerConfig?.targetStreet) {
          params.set('targetStreet', trainerConfig.targetStreet);
        }

        apiUrl = `/api/training/batch-preload?${params}`;
        console.debug(
          `[GTOTrainer] Pre-loading ${effectiveQuestionsPerLevel} questions for ${gameId} level ${effectiveLevel}`
        );
      }

      let data;
      let response = null;
      const isStandardSession = !isCustomTrainerConfig(trainerConfig);
      const browserIsOffline = typeof navigator !== 'undefined' && navigator.onLine === false;

      if (isStandardSession && browserIsOffline) {
        const cachedQuestions = await getOfflineQuestions(
          gameId,
          effectiveLevel,
          userId,
          offlineCacheContract,
        );
        if (!isTrainingLeaseActive(requestLease)) return;
        if (cachedQuestions.length > 0) {
          data = await recoverCachedQuestions(cachedQuestions, effectiveLevel);
          if (!isTrainingLeaseActive(requestLease)) return;
          console.debug(`[GTOTrainer] Recovered ${cachedQuestions.length} signed session questions`);
        }
      }

      if (!data) {
        // A short upstream interruption must not demote a full session to the
        // single-question fallback. That fallback intentionally requests one
        // hand at a time and cannot preserve the batch's bounded completion
        // target. Retry only transient responses; auth/contract failures still
        // fail closed immediately and use the existing recovery path below.
        for (let attempt = 0; attempt < 3; attempt += 1) {
          response = await trainingFetch(apiUrl);
          if (!isTrainingLeaseActive(requestLease)) return;
          const retryable = response.status === 429 || response.status >= 500;
          if (response.ok || !retryable || attempt === 2) break;
          await new Promise((resolve) => setTimeout(resolve, 250 * (2 ** attempt)));
          if (!isTrainingLeaseActive(requestLease)) return;
        }

        // Safe JSON parsing to prevent Unexpected Token '<' HTML crash
        const textResponse = await response.text();
        if (!isTrainingLeaseActive(requestLease)) return;
        try {
          data = JSON.parse(textResponse);
        } catch (e) {
          console.warn('[GTOTrainer] Non-JSON response:', textResponse.substring(0, 100));
          if (response.status === 401) throw new Error('Auth required');
          throw new Error(`Server error (${response.status})`);
        }
      }

      if ((response && !response.ok) || !data.questions || data.questions.length === 0) {
        const responseError = trainingApiResponseError(
          data,
          response,
          isStandardSession
            ? 'Training questions could not be delivered.'
            : 'Custom Training questions could not be delivered.',
        );
        if (RECOVERABLE_ATTEMPT_START_CODES.has(responseError.code)) throw responseError;
        if (!isStandardSession) {
          throw responseError;
        }
        console.warn('[GTOTrainer] Pre-load failed, using single-question mode');
        setPreloadComplete(false);
        setLoading(false);
        if (!isTrainingLeaseActive(requestLease)) return;
        return fetchSingleQuestion(effectiveLevel, questionNumber);
      }

      if (!isTrainingLeaseActive(requestLease)) return;
      assertSignedTrainingDelivery(data, trainingSessionId);

      if (isStandardSession) {
        if (!isTrainingLeaseActive(requestLease)) return;
        await setOfflineQuestions(
          gameId,
          effectiveLevel,
          data.questions,
          userId,
          offlineCacheContract,
        );
        if (!isTrainingLeaseActive(requestLease)) return;
      }

      console.debug(`[GTOTrainer] ✅ Pre-loaded ${data.questions.length} questions`);

      // Hand/street selection was already applied before this immutable
      // attempt was signed. Validate the visible street only; never filter the
      // blind DTO and redefine the server-owned target.
      const selected = applyStreetFilter(
        data.questions,
        trainerConfig?.gameMode,
        trainerConfig?.targetStreet
      );
      if (selected.length === 0) {
        throw new Error(`No ${trainerConfig.targetStreet} questions are available for this game.`);
      }
      if (selected.length !== data.questions.length) {
        throw new Error('The signed Training attempt changed size in the browser.');
      }
      const signedTargetHands = Number(data.targetHands);
      if (!Number.isInteger(signedTargetHands) || selected.length !== signedTargetHands) {
        throw new Error('The signed Training attempt does not contain its complete hand target.');
      }

      terminalRecoveryBudgetRef.current = {
        familyKey: createDeliveryFamilyKey(gameId, effectiveLevel, trainerConfig),
        used: false,
      };

      setPreloadedQuestions(selected);
      setPreloadComplete(true);
      // The API has already applied the requested difficulty and signed the
      // exact displayed shape. Never rewrite its answer vocabulary here.
      activateNewTrainingQuestion(selected[0]);

      // The signed attempt owns its exact target (20/25/30 for campaign,
      // configured count for custom). The UI and completion gate must use the
      // delivered target in both directions, not only cap short responses.
      if (signedTargetHands !== effectiveQuestionsPerLevel) {
        console.warn(
          `[GTOTrainer] Signed attempt target is ${signedTargetHands} questions (was ${effectiveQuestionsPerLevel})`
        );
        setEffectiveQuestionsPerLevel(signedTargetHands);
      }

      setLoading(false);
    } catch (err) {
      if (!isTrainingLeaseActive(requestLease)) return;
      console.warn('[GTOTrainer] Pre-load error:', err);
      if (RECOVERABLE_ATTEMPT_START_CODES.has(err?.code)) {
        recoverTerminalAttempt(err, effectiveLevel, requestLease);
        return;
      }
      if (!isCustomTrainerConfig(trainerConfig)) {
        const cachedQuestions = await getOfflineQuestions(
          gameId,
          effectiveLevel,
          userId,
          offlineCacheContract,
        );
        if (!isTrainingLeaseActive(requestLease)) return;
        if (cachedQuestions.length > 0) {
          try {
            const recovered = await recoverCachedQuestions(cachedQuestions, effectiveLevel);
            if (!isTrainingLeaseActive(requestLease)) return;
            const selected = applyStreetFilter(
              recovered.questions,
              trainerConfig?.gameMode,
              trainerConfig?.targetStreet,
            );
            const recoveredTargetHands = Number(
              selected[0]?._gradingContext?.sessionTargetHands,
            );
            if (
              selected.length > 0
              && Number.isInteger(recoveredTargetHands)
              && selected.length === recoveredTargetHands
            ) {
              setPreloadedQuestions(selected);
              setPreloadComplete(true);
              activateNewTrainingQuestion(selected[0]);
              setEffectiveQuestionsPerLevel(recoveredTargetHands);
              setLoading(false);
              return;
            }
            throw new Error('A partial offline attempt cannot be resumed.');
          } catch (cacheContractError) {
            console.warn('[GTOTrainer] Ignoring unsigned offline cache:', cacheContractError.message);
          }
        }
      }
      if (!isTrainingLeaseActive(requestLease)) return;
      setPreloadComplete(false);
      setLoading(false);
      if (isCustomTrainerConfig(trainerConfig)) {
        setError(err?.message || 'Custom Training questions could not be delivered.');
        return;
      }
      return fetchSingleQuestion(effectiveLevel, questionNumber);
    }
  }, [
    gameId,
    selectedLevel,
    trainerConfig,
    effectiveQuestionsPerLevel,
    fetchSingleQuestion,
    offlineCacheContract,
    recoverCachedQuestions,
    resolveDifficultyMode,
    getWeakSpots,
    trainingSessionId,
    userId,
    activateFreshTrainingSession,
    activateNewTrainingQuestion,
    captureTrainingLease,
    isTrainingLeaseActive,
    recoverTerminalAttempt,
  ]);

  /**
   * Derive the spot type from scenario context
   * e.g., 'facing_cbet', 'open_raise', '3bet_defense', 'check_raise', etc.
   */
  const deriveSpotType = useCallback((scenario) => {
    if (!scenario) return 'unknown';
    // 2026-07-19 AUDIT FIX (E2E defect D4b): scenario.context sometimes
    // arrives as a non-string (object) — calling .toLowerCase() threw an
    // unhandled TypeError repeatedly during live play. Coerce defensively.
    const ctx = (typeof scenario.context === 'string' ? scenario.context : '').toLowerCase();
    const title = (typeof scenario.title === 'string' ? scenario.title : '').toLowerCase();
    const combined = ctx + ' ' + title;

    if (combined.includes('3-bet') || combined.includes('3bet')) return '3bet_defense';
    if (combined.includes('4-bet') || combined.includes('4bet')) return '4bet_pot';
    if (
      combined.includes('c-bet') ||
      combined.includes('cbet') ||
      combined.includes('continuation')
    )
      return 'facing_cbet';
    if (
      combined.includes('check-raise') ||
      combined.includes('checkraise') ||
      combined.includes('check raise')
    )
      return 'check_raise';
    if (combined.includes('donk')) return 'donk_bet';
    if (combined.includes('squeeze')) return 'squeeze';
    if (combined.includes('open') || combined.includes('raise first')) return 'open_raise';
    if (combined.includes('blind') && combined.includes('defend')) return 'blind_defense';
    // Infer from position
    const hero = scenario.heroPosition || '';
    if (hero === 'BB') return 'bb_defense';
    if (hero === 'SB') return 'sb_play';
    if (hero === 'BTN') return 'btn_play';
    return 'general';
  }, []);

  /**
   * Update weak-spot map with a new data point
   */
  const updateWeakSpotMap = useCallback((position, street, spotType, classification) => {
    const map = weakSpotMapRef.current;
    const key = `${position}_${street}_${spotType}`;
    if (!map[key]) {
      map[key] = { total: 0, mistakes: 0, position, street, spotType };
    }
    map[key].total++;
    if (MISTAKE_CLASSES.includes((classification || '').toLowerCase())) {
      map[key].mistakes++;
    }
  }, []);

  /**
   * Record answer to API (for no-repeat tracking + weak-spot metadata)
   */
  const recordAnswer = useCallback(
    async (submission) => {
      if (!userId || !gameId) {
        return {
          ok: false,
          error: 'Sign in again before this answer can be graded and credited.',
        };
      }

      const { questionId, selectedAnswer } = submission;
      try {
        for (let attempt = 0; attempt < 3; attempt++) {
          const response = await trainingFetch('/api/training/record-question', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              userId,
              gameId,
              questionId,
              submissionId: submission.submissionId,
              sessionId: submission.sessionId,
              attemptId: submission.attemptId,
              snapshotKey: submission.snapshotKey,
              sessionKind: submission.sessionKind,
              sessionTargetHands: submission.sessionTargetHands,
              handOrdinal: submission.handOrdinal,
              decisionOrdinal: submission.decisionOrdinal,
              countsTowardCompletion: submission.countsTowardCompletion,
              practiceOnly: submission.practiceOnly,
              gradingReceipt: submission.gradingReceipt,
              selectedAnswer,
              gradingMode: submission.gradingMode,
              rng: submission.rng,
            }),
          });
          if (response.ok) {
            const payload = await response.json().catch(() => ({}));
            assertRecordedAnswerAcknowledgement(payload, submission);
            const serverEvidence = payload?.evidence || null;
            if (!serverEvidence || !payload?.feedback || typeof serverEvidence.isCorrect !== 'boolean') {
              throw new Error('The Training server did not return an authoritative verdict and feedback reveal.');
            }
            return {
              ok: true,
              evidence: serverEvidence,
              feedback: payload.feedback,
              idempotentReplay: payload.idempotentReplay === true,
            };
          }

          let detail = '';
          let code = '';
          try {
            const payload = await response.json();
            detail = payload?.error || '';
            code = payload?.code || '';
          } catch (_) { /* response may be empty */ }
          if (response.status === 409 && [
            'TRAINING_QUESTION_REFRESH_REQUIRED',
            'TRAINING_GRADING_RECEIPT_EXPIRED',
            'TRAINING_GRADING_RECEIPT_QUESTION_CHANGED',
          ].includes(code)) {
            return { ok: false, refreshRequired: true, error: detail };
          }
          const retryable = response.status === 429 || response.status >= 500;
          if (!retryable || attempt === 2) {
            throw new Error(detail || `Answer persistence failed (${response.status})`);
          }
          await new Promise(resolve => setTimeout(resolve, 250 * (2 ** attempt)));
        }
      } catch (err) {
        console.warn('[Training] Answer evidence was not persisted:', err?.message || err);
        return { ok: false, error: err?.message || 'Answer persistence failed' };
      }
    },
    [userId, gameId, selectedLevel]
  );

  const isPendingAnswerEntryActive = useCallback((entry) => Boolean(
    entry
    && pendingAnswerPersistenceRef.current === entry
    && isTrainingLeaseActive(entry.lease)
    && String(entry.submission?.sessionId || '') === String(trainingSessionIdRef.current || '')
  ), [isTrainingLeaseActive]);

  const persistPendingAnswer = useCallback(async (entry, { retry = false } = {}) => {
    if (!entry) return { ok: true };
    if (!isPendingAnswerEntryActive(entry)) return { ok: false, stale: true };
    if (entry.inFlight && entry.promise) return entry.promise;
    if (entry.result?.ok) return entry.result;

    entry.inFlight = true;
    if (retry) setAnswerSaveRetrying(true);
    entry.promise = recordAnswer(entry.submission)
      .then(async (result) => {
        entry.result = result;
        if (!isPendingAnswerEntryActive(entry)) return { ...result, stale: true };
        if (result?.ok) {
          if (!entry.finalized && typeof entry.onPersisted === 'function') {
            entry.onPersisted(result);
            entry.finalized = true;
          }
          if (!isPendingAnswerEntryActive(entry)) return { ...result, stale: true };
          await consumeOfflineQuestion(
            gameId,
            selectedLevel,
            entry.submission.questionId,
            userId,
            offlineCacheContract,
          ).catch((cacheError) => {
            console.warn('[Training] Submitted question cache cleanup failed:', cacheError?.message || cacheError);
          });
          if (!isPendingAnswerEntryActive(entry)) return { ...result, stale: true };
          setAnswerSaveRequiresRefresh(false);
          setAnswerSaveError(null);
        }
        else if (result?.refreshRequired) {
          refreshRequiredQuestionIdsRef.current.add(String(entry.submission?.questionId || ''));
          setPreloadComplete(false);
          console.warn('[Training] Canonical question expired; a fresh hand will load on Next.');
          setAnswerSaveRequiresRefresh(true);
          setAnswerSaveError(
            result?.error || 'This signed hand expired before it could be graded. Load a fresh hand.'
          );
        } else {
          setAnswerSaveRequiresRefresh(false);
          setAnswerSaveError(result?.error || 'Your answer could not be saved.');
        }
        return result;
      })
      .catch((error) => {
        const result = { ok: false, error: error?.message || 'The saved answer could not be rendered.' };
        entry.result = result;
        if (!isPendingAnswerEntryActive(entry)) return { ...result, stale: true };
        setAnswerSaveError(result.error);
        return result;
      })
      .finally(() => {
        entry.inFlight = false;
        if (retry && isPendingAnswerEntryActive(entry)) setAnswerSaveRetrying(false);
      });
    return entry.promise;
  }, [gameId, isPendingAnswerEntryActive, offlineCacheContract, recordAnswer, selectedLevel, userId]);

  const retryAnswerPersistence = useCallback(async () => {
    const entry = pendingAnswerPersistenceRef.current;
    if (!entry || !isPendingAnswerEntryActive(entry)) return false;
    if (entry.result?.ok) return true;
    if (entry.result?.refreshRequired) {
      setAnswerSaveRetrying(true);
      try {
        setShowFeedback(false);
        setLastGTOFrequencies(null);
        const replacement = await fetchSingleQuestion(selectedLevel, questionNumber, { throwOnError: true });
        if (!replacement || !isPendingAnswerEntryActive(entry)) return false;
        refreshRequiredQuestionIdsRef.current.delete(String(entry.submission?.questionId || ''));
        pendingAnswerPersistenceRef.current = null;
        setAnswerSaveRequiresRefresh(false);
        setAnswerSaveError(null);
        return true;
      } catch (refreshError) {
        // Keep the expired entry as a recovery token so the same visible
        // button can retry loading a replacement after a transient failure.
        setAnswerSaveRequiresRefresh(true);
        setAnswerSaveError(
          refreshError?.message || 'A fresh Training hand could not be loaded. Try again.'
        );
        return false;
      } finally {
        setAnswerSaveRetrying(false);
      }
    }
    const result = await persistPendingAnswer(entry, { retry: true });
    return result?.ok === true && result?.stale !== true;
  }, [fetchSingleQuestion, isPendingAnswerEntryActive, persistPendingAnswer, questionNumber, selectedLevel]);

  /**
   * Submit answer and show feedback
   */
  const submitAnswer = useCallback(
    async (selectedOptionId, meta) => {
      if (!currentQuestion || showFeedback) return;
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        setAnswerSaveError(
          'Reconnect before submitting. Offline hands remain visible, but cannot be graded or credited.'
        );
        return;
      }
      if (!userId) {
        setAnswerSaveError('Sign in again before this answer can be graded and credited.');
        return;
      }

      const publicQuestion = currentQuestion;
      const options = publicQuestion.options || [];
      const scenario = publicQuestion.scenario || {};
      const selectedText = options.find((o) => o.id === selectedOptionId)?.text || selectedOptionId;
      const gradingContext = publicQuestion?._gradingContext || null;
      if (
        !gradingContext?.receipt
        || !gradingContext?.submissionId
        || !gradingContext?.sessionId
        || !gradingContext?.attemptId
        || !gradingContext?.snapshotKey
        || !gradingContext?.sessionKind
        || !Number.isInteger(Number(gradingContext?.sessionTargetHands))
        || !Number.isInteger(Number(gradingContext?.handOrdinal))
        || !Number.isInteger(Number(gradingContext?.decisionOrdinal))
      ) {
        setAnswerSaveError('This hand is missing its secure grading receipt. Reload the Arena.');
        return;
      }
      const submittedRng = gradingContext?.solverEvidenceAvailable === true
        && meta?.rngMode
        && Number.isInteger(Number(meta?.rngRoll))
        ? {
            roll: Number(meta?.rngRoll),
            mode: meta?.rngMode,
          }
        : null;
      if (submittedRng && Number(gradingContext?.rngRolls?.[submittedRng.mode]) !== submittedRng.roll) {
        setAnswerSaveError('The randomizer target no longer matches this signed hand. Reload the Arena.');
        return;
      }

      const submission = {
        submissionId: gradingContext.submissionId,
        sessionId: gradingContext.sessionId,
        attemptId: gradingContext.attemptId,
        snapshotKey: gradingContext.snapshotKey,
        sessionKind: gradingContext.sessionKind,
        sessionTargetHands: gradingContext.sessionTargetHands,
        handOrdinal: gradingContext.handOrdinal,
        decisionOrdinal: gradingContext.decisionOrdinal,
        countsTowardCompletion: gradingContext.countsTowardCompletion,
        practiceOnly: gradingContext.practiceOnly,
        gradingReceipt: gradingContext.receipt,
        questionId: publicQuestion.id,
        selectedAnswer: selectedOptionId,
        gradingMode: gradingContext.difficultyMode || resolveDifficultyMode(),
        rng: submittedRng,
      };
      const submissionLease = captureTrainingLease();
      if (
        !isTrainingLeaseActive(submissionLease)
        || String(submission.sessionId) !== String(submissionLease.sessionId)
      ) {
        setAnswerSaveError('This Training session changed before the answer could be submitted.');
        return;
      }
      if (submitAnswerInFlightRef.current) return;

      const finalizePersistedAnswer = (recorded) => {
        const serverEvidence = recorded?.evidence || null;
        const feedback = recorded?.feedback || null;
        if (!serverEvidence || !feedback || typeof serverEvidence.isCorrect !== 'boolean') {
          throw new Error('The Training server did not return a complete authoritative verdict.');
        }
        const revealedContinuationAction = String(
          feedback?.continuation?.actionId || '',
        );
        const revealedScenario = revealedContinuationAction
          ? {
              ...(publicQuestion.scenario || {}),
              nextStreetContinuationAction: revealedContinuationAction,
            }
          : { ...(publicQuestion.scenario || {}) };
        const currentQuestion = {
          ...publicQuestion,
          ...feedback,
          scenario: revealedScenario,
          _gradingContext: publicQuestion._gradingContext,
        };
        setCurrentQuestion(currentQuestion);
        const revealedStreet = String(revealedScenario.street || '').toLowerCase();
        const fullHandMode = (trainerConfig?.gameMode || 'full') === 'full';
        if (
          fullHandMode
          && revealedContinuationAction
          && (revealedStreet === 'flop' || revealedStreet === 'turn')
        ) {
          try {
            if (!multiStreetHandRef.current) {
              multiStreetHandRef.current = new MultiStreetHand(currentQuestion);
              setIsMultiStreetActive(true);
            } else {
              // A continuation question was already adopted before it was
              // answered. Replace its blind DTO with the post-persistence reveal
              // so recordAction validates the exact canonical line.
              multiStreetHandRef.current.currentQuestion = currentQuestion;
            }
          } catch (multiStreetSetupError) {
            // This answer is already durably persisted. A malformed optional
            // continuation must fail closed for the next street without
            // suppressing the authoritative verdict or trapping the user in
            // an idempotent retry loop.
            multiStreetHandRef.current = null;
            setIsMultiStreetActive(false);
            console.warn(
              '[GTOTrainer] Multi-street setup rejected after persistence (non-critical):',
              multiStreetSetupError?.message || multiStreetSetupError,
            );
          }
        }
        const solverCorrectAnswer = feedback.correctAnswer;
        const correctAnswer = serverEvidence?.rng?.targetActionId || solverCorrectAnswer;
        const correctText = options.find((o) => o.id === correctAnswer)?.text
          || feedback.correctAnswerText
          || correctAnswer;
        const frequencies = feedback.gtoFrequencies || feedback.frequencies || {};
        const gradingFrequencies = serverEvidence.solverVerified === true ? frequencies : {};
        const solverVerified = serverEvidence.solverVerified === true;
        const frequencyDiff = Number.isFinite(Number(serverEvidence.selectedFrequency))
          && Number.isFinite(Number(serverEvidence.optimalFrequency))
          ? Math.abs(Number(serverEvidence.optimalFrequency) - Number(serverEvidence.selectedFrequency))
          : 0;
        const hasMeasuredEVLoss = serverEvidence.evLossMeasured === true
          && Number.isFinite(Number(serverEvidence.evLoss));
        const moveResult = {
          classification: String(serverEvidence.classification || 'wrong').toLowerCase(),
          isCorrect: serverEvidence.isCorrect,
          evLoss: hasMeasuredEVLoss ? Number(serverEvidence.evLoss) : null,
          frequencyDiff,
          isRealData: hasMeasuredEVLoss,
          solverVerified,
          selectedFrequency: serverEvidence.selectedFrequency,
          optimalFrequency: serverEvidence.optimalFrequency,
          optimalAction: serverEvidence.optimalAction,
        };
        const isCorrect = serverEvidence.isCorrect === true;
        let renderedExplanation = currentQuestion.explanation || '';

        // From this point onward every operation is a browser-side projection
        // of an answer that the server has already graded and persisted. A
        // broken sound device, analytics engine, replay helper, or prefetch
        // must never turn that durable success into a false save failure or
        // hide the authoritative Correct/Incorrect reveal.
        try {

      // ═══ Phase GTO-CLONE: ActionTreeEngine score for solver-node accuracy ═══
      let actionTreeScore = null;
      try {
        if (solverVerified && gradingFrequencies && Object.keys(gradingFrequencies || {}).length > 0) {
          const gtoStrategy = Object.entries(gradingFrequencies || {}).map(([id, freq]) => ({
            id,
            text: options.find((o) => o.id === id)?.text || id,
            frequency: freq,
          }));
          actionTreeScore = scoreAction(
            { id: selectedOptionId, text: selectedText },
            gtoStrategy,
            scenario.pot || 10
          );
        }
      } catch (e) {
        console.warn('[App] Handled exception:', e?.message || e);
      }

      // Store for UI consumption
      setLastMoveClassification(moveResult.classification);
      setLastEVLoss(moveResult.evLoss);
      setLastEVLossMeasured(moveResult.isRealData);
      setLastGTOFrequencies(frequencies);

      // Record to GTOW scoring engine. This projection is deliberately
      // isolated from the durable answer acknowledgement above.
      try {
        gtowScoring.recordMove({
        classification: moveResult.classification,
        evLoss: moveResult.evLoss,
        frequencyDiff: moveResult.frequencyDiff,
        isRealData: moveResult.isRealData || false,
        handData: {
          // Stable per-hand id so multi-street decisions count as ONE hand.
          //
          // roadmap #28a — this used to read `currentQuestion.id` first, which
          // looks per-hand and is not. advanceToNextStreet replaces the whole
          // question object (`setCurrentQuestion(nextQ)` with `nextQ =
          // data.question` straight off /api/training/next-street), so the id
          // changes on every street. useGTOWScore.recordMove increments
          // handsPlayed whenever that key changes, so a 20-question session
          // whose hands ran flop->turn->river counted 34 "hands" and divided
          // total EV loss by 34 -- while the tile beside it printed
          // totalQuestions (20). The screen showed -5.0 EV LOSS, 20 HANDS and
          // -0.15 EV LOSS/HAND, which is not arithmetic anyone can follow.
          //
          // questionNumber is the ONLY counter that advances once per hand:
          // nextQuestion increments it and advanceToNextStreet deliberately
          // never touches it. Key off that and nothing else.
          handId: `q_${selectedLevel}_${questionNumber}`,
          heroCards: currentQuestion.heroCards || scenario.heroHand,
          board: scenario.board,
          heroPosition: scenario.heroPosition || scenario.position,
          pot: scenario.pot,
          action: selectedText,
          correctAction: correctText,
          question: currentQuestion.question || currentQuestion.text,
          source: currentQuestion.source || 'UNKNOWN',
          gtoFrequencies: frequencies || {},
          solverVerified,
          dataQuality: currentQuestion.dataQuality || null,
          evLossMeasured: Boolean(moveResult.isRealData),
          // ═══ PHASE 20: Raw solver matrix for RangeGrid display ═══
          rawFrequencies: currentQuestion.rawFrequencies || null,
          heroHand: currentQuestion.heroHand || scenario.heroHand || null,
          street: scenario.street || null,
          scenarioHash: scenario.scenarioHash || null,
          // roadmap #40 — spotType was derived further down this same callback
          // and forwarded ONLY to recordAnswer (the backend write). It never
          // reached the in-memory hand history, so every consumer that buckets
          // by pot type -- LifetimeStatsCard's SRP / 3BP / 4BP+ breakdown above
          // all -- read `undefined` and collapsed every hand into SRP.
          spotType: deriveSpotType(scenario),
          // ═══ PHASE 21: EV data for RangeGrid EV overlay ═══
          evData: currentQuestion.evData || null,
          // ═══ PHASE 27: Explanation text for hand replay review ═══
          explanation: currentQuestion.explanation || null,
          // ═══ Phase GTO-CLONE: ActionTreeEngine solver-node score ═══
          actionTreeScore: actionTreeScore || null,
          // ═══ PHASE 51: Hand categorization for replay display ═══
          handCategory: currentQuestion.handCategory || null,
        },
        });
      } catch (scoreError) {
        console.warn('[GTOTrainer] Local score projection failed (non-critical):', scoreError?.message || scoreError);
      }

      // Save full question for mistake replay
      const isMistakeMove = MISTAKE_CLASSES.includes(
        (moveResult?.classification || '').toLowerCase()
      );
      if (isMistakeMove) {
        mistakeQuestionsRef.current.push({
          ...currentQuestion,
          _mistakeMeta: {
            classification: moveResult.classification,
            evLoss: moveResult.isRealData ? moveResult.evLoss : null,
            evLossMeasured: moveResult.isRealData,
            chosenAction: selectedOptionId,
          },
        });
      }

      // Phase 75: Update adaptive difficulty tracking
      try {
        postAnswerInsights.updateSessionDifficulty(isCorrect);
      } catch (e) {
        console.warn('[App] Handled exception:', e?.message || e);
      }

      // SESSION ANALYTICS FIX (2026-08-08): _sessionStats.history was NEVER
      // populated — ~20 engine analysis methods (mistake clusters, EV-loss
      // heatmap, concept mastery, quick-fire review cards, streak analysis,
      // the comprehensive session report...) all read it and all returned
      // null/empty in every session ever played. Record the graded decision
      // in the exact shape those consumers destructure. Action fields carry
      // the human-readable option text because getExploitativeAdjustments /
      // getBettingSizeAnalysis pattern-match on words like 'fold' and '50%'.
      try {
        postAnswerInsights.recordSessionHand({
          correct: isCorrect,
          classification: moveResult.classification,
          evLoss: moveResult.isRealData ? moveResult.evLoss : null,
          evLossMeasured: moveResult.isRealData,
          street: scenario.street || null,
          nodeType: scenario.nodeType || '',
          action: selectedText,
          selectedAction: selectedText,
          correctAction: correctText,
          handCategory: currentQuestion.handCategory || '',
          frequencies: frequencies || null,
          // Measured at the felt (UniversalDynamicTable passes it in `meta`).
          // getSessionPacingAnalysis prefers it over the gap between recorded
          // hands, which also contains however long the player spent reading
          // the previous explanation.
          answerTimeSeconds: Number(meta?.answerTimeSeconds) || null,
          heroPosition: scenario.heroPosition || scenario.position || null,
          // Real texture classification from the board when one exists;
          // preflop spots stay null rather than inventing a texture.
          texture:
            scenario.boardTexture?.description ||
            (Array.isArray(scenario.board) && scenario.board.length >= 3
              ? postAnswerInsights.classifyBoardTexture(scenario.board)?.desc || null
              : null),
        });
      } catch (e) {
        console.warn('[App] Handled exception:', e?.message || e);
      }

      // Phase 76: Record mistake pattern for dynamic explanation depth
      try {
        postAnswerInsights.recordMistakePattern({
          isCorrect,
          street: scenario.street || 'flop',
          handCategory: currentQuestion.handCategory || '',
          correctAction: correctAnswer,
          chosenAction: selectedOptionId,
          spotType: deriveSpotType(scenario),
          nodeType: scenario.nodeType || '',
          classification: moveResult.classification,
        });
      } catch (e) {
        console.warn('[App] Handled exception:', e?.message || e);
      }

      // ═══ PHASE 140: GTO deviation detection ═══
      try {
        const deviationNote = postAnswerInsights.detectGTODeviation(
          selectedOptionId,
          correctAnswer,
          currentQuestion.frequencies?.[correctAnswer] || 0,
          scenario.street || 'flop',
          currentQuestion.handCategory || ''
        );
        if (deviationNote && !isCorrect) {
          // Append deviation warning to explanation
          const prevExpl = currentQuestion.explanation || '';
          if (deviationNote && !prevExpl.includes('Deviation:')) {
            currentQuestion._deviationNote = deviationNote;
          }
        }
      } catch (e) {
        console.warn('[App] Handled exception:', e?.message || e);
      }

      // ═══ PHASE 143: Auto-difficulty adjustment ═══
      try {
        postAnswerInsights.recordRecentResult(isCorrect);
      } catch (e) {
        console.warn('[App] Handled exception:', e?.message || e);
      }

      // ═══ PHASE 144: Concept mastery tracking ═══
      try {
        const concept = postAnswerInsights.deriveConceptFromContext(
          scenario.nodeType || '',
          scenario.street || 'flop',
          correctAnswer,
          currentQuestion.handCategory || ''
        );
        postAnswerInsights.recordConceptExposure(concept, isCorrect);
      } catch (e) {
        console.warn('[App] Handled exception:', e?.message || e);
      }

      // ═══ PHASE 146: Spaced repetition for missed scenarios ═══
      try {
        if (!isCorrect) {
          postAnswerInsights.recordMissedScenario(scenario, moveResult.classification);
        }
      } catch (e) {
        console.warn('[App] Handled exception:', e?.message || e);
      }

      // ═══ PHASE 153: EV graph data ═══
      try {
        const evLossData = postAnswerInsights.estimateEVLoss(
          selectedOptionId,
          correctAnswer,
          currentQuestion.actionEVs || {},
          currentQuestion.estimatedPot || 0
        );
        postAnswerInsights.recordEVDataPoint(
          postAnswerInsights._getSessionQuestionCount(),
          isCorrect,
          evLossData ? parseFloat(evLossData.evLossBB) : 0,
          scenario.street || 'flop'
        );
      } catch (e) {
        console.warn('[App] Handled exception:', e?.message || e);
      }

      // ═══ PHASE 158: Aggression tracking ═══
      try {
        postAnswerInsights.recordAggressionAction(selectedOptionId, scenario.street || 'flop');
      } catch (e) {
        console.warn('[App] Handled exception:', e?.message || e);
      }

      // ═══ PHASE 159: VPIP/PFR tracking ═══
      try {
        if (scenario.street === 'preflop') {
          postAnswerInsights.recordPreflopAction(selectedOptionId, scenario.nodeType || '');
        }
      } catch (e) {
        console.warn('[App] Handled exception:', e?.message || e);
      }

      // ═══ PHASE 160: Positional awareness ═══
      try {
        postAnswerInsights.recordPositionalDecision(scenario.heroPosition || '', isCorrect);
      } catch (e) {
        console.warn('[App] Handled exception:', e?.message || e);
      }

      // ═══ PHASE 180: Question type diversity ═══
      try {
        postAnswerInsights.recordQuestionType(
          `${scenario.street || 'flop'}:${scenario.nodeType || 'general'}`
        );
      } catch (e) {
        console.warn('[App] Handled exception:', e?.message || e);
      }

      // ═══ PHASE 185: User vs solver frequency ═══
      try {
        postAnswerInsights.recordUserAction(
          selectedOptionId,
          correctAnswer,
          scenario.street || 'flop',
          scenario.nodeType || ''
        );
      } catch (e) {
        console.warn('[App] Handled exception:', e?.message || e);
      }

      // ═══ PHASE 190: Hand history replay ═══
      try {
        postAnswerInsights.recordHandForReplay(
          scenario,
          currentQuestion.heroHand || '',
          currentQuestion.board || [],
          selectedOptionId,
          correctAnswer,
          currentQuestion.explanation || ''
        );
      } catch (e) {
        console.warn('[App] Handled exception:', e?.message || e);
      }

      // ═══ PHASE 227: Deviation cost tracking ═══
      try {
        const evLossForCost = postAnswerInsights.estimateEVLoss(
          selectedOptionId,
          correctAnswer,
          currentQuestion.actionEVs || {},
          currentQuestion.estimatedPot || 0
        );
        if (evLossForCost && !isCorrect) {
          postAnswerInsights.recordDeviationCost(parseFloat(evLossForCost.evLossBB) || 0);
        }
      } catch (e) {
        console.warn('[App] Handled exception:', e?.message || e);
      }

      // ═══ PHASE 241: Training calendar ═══
      try {
        postAnswerInsights.recordDailyTraining();
      } catch (e) {
        console.warn('[App] Handled exception:', e?.message || e);
      }

      // ═══ PHASE 179: Session bests tracking ═══
      try {
        if (isCorrect) {
          const recentResults = postAnswerInsights._recentResults || [];
          const currentStreakVal = recentResults.reduce((acc, r) => (r ? acc + 1 : 0), 0);
          postAnswerInsights.recordSessionBest('streak', currentStreakVal);
        }
      } catch (e) {
        console.warn('[App] Handled exception:', e?.message || e);
      }

      // Update legacy scores
      // Multi-street: questionNumber only advances once per hand, so only the
      // FIRST street answer of a hand may credit correctCount. Continuation
      // streets (recordAction already called at least once on the active hand)
      // must not inflate the numerator past the question denominator.
      const isStreetContinuation =
        multiStreetHandRef.current &&
        !multiStreetHandRef.current.isComplete &&
        (multiStreetHandRef.current.streetActions?.length || 0) > 0;
      if (isCorrect) {
        if (!isStreetContinuation) {
          setCorrectCount((prev) => prev + 1);
        }
        setStreak((prev) => {
          const newStreak = prev + 1;
          if (newStreak > bestStreak) setBestStreak(newStreak);
          if (newStreak % 5 === 0) {
            try { trainingSounds.play('streak'); } catch (_) { /* non-critical audio */ }
          }
          return newStreak;
        });
      } else {
        setStreak(0);
      }

      // Audio Feedback for Move Quality
      const cls = moveResult.classification;
      try {
        if (cls === 'blunder' || cls === 'wrong' || cls === 'inaccuracy') {
          trainingSounds.play('incorrect');
        } else {
          trainingSounds.play('correct');
        }
      } catch (_) {
        // Audio feedback is useful, but never part of grading authority.
      }

      // Phase 80: Append frequency deviation note when player picks a secondary action
      let fullExplanation = currentQuestion.explanation || '';
      if (!isCorrect && selectedOptionId !== correctAnswer) {
        try {
          const deviationNote = postAnswerInsights.getFrequencyDeviationNote(
            selectedOptionId,
            correctAnswer,
            currentQuestion.frequencies || {},
            currentQuestion.handCategory || '',
            scenario.street || 'flop',
            null, // texture not easily available here
            scenario.nodeType || ''
          );
          if (deviationNote) {
            fullExplanation = fullExplanation
              ? `${fullExplanation} ${deviationNote}`
              : deviationNote;
          }
        } catch (e) {
          console.warn('[App] Handled exception:', e?.message || e);
        }

        // ═══ PHASE 140: Append GTO deviation note ═══
        try {
          if (currentQuestion._deviationNote) {
            fullExplanation = `${fullExplanation} ${currentQuestion._deviationNote}`;
          }
        } catch (e) {
          console.warn('[App] Handled exception:', e?.message || e);
        }

        // ═══ PHASE 147: EV loss quantification ═══
        try {
          const evLoss = postAnswerInsights.estimateEVLoss(
            selectedOptionId,
            correctAnswer,
            currentQuestion.actionEVs || {},
            currentQuestion.estimatedPot || 0
          );
          if (evLoss && evLoss.message) {
            fullExplanation = `${fullExplanation} ${evLoss.message}`;
          }
        } catch (e) {
          console.warn('[App] Handled exception:', e?.message || e);
        }
      }

      // ═══ PHASE 150: Coaching message ═══
      try {
        const coachMsg = postAnswerInsights.getCoachingMessage(
          moveResult.classification,
          postAnswerInsights._getSessionQuestionCount()
        );
        if (coachMsg) {
          fullExplanation = coachMsg + ' ' + fullExplanation;
        }
      } catch (e) {
        console.warn('[App] Handled exception:', e?.message || e);
      }

      // ═══ PHASE 249: Tilt detection ═══
      try {
        const tiltStatus = postAnswerInsights.detectTilt();
        if (tiltStatus && tiltStatus.message) {
          fullExplanation = `${fullExplanation} ${tiltStatus.message}`;
        }
      } catch (e) {
        console.warn('[App] Handled exception:', e?.message || e);
      }

      // ═══ PHASE 198: Mental game note ═══
      try {
        const mentalNote = postAnswerInsights.getMentalGameNote();
        if (mentalNote) {
          fullExplanation = `${fullExplanation} ${mentalNote}`;
        }
      } catch (e) {
        console.warn('[App] Handled exception:', e?.message || e);
      }

      // ═══ PHASE 225: Smart recap ═══
      try {
        const recap = postAnswerInsights.generateSmartRecap(
          postAnswerInsights._getSessionQuestionCount()
        );
        if (recap) {
          const recapText = recap.sections.map((s) => `${s.title}: ${s.content}`).join(' | ');
          fullExplanation = `${fullExplanation} 📊 Session recap - ${recapText}`;
        }
      } catch (e) {
        console.warn('[App] Handled exception:', e?.message || e);
      }

      renderedExplanation = fullExplanation;

      // ═══ PHASE 251: Generate structured explanation for rich UI rendering ═══
      try {
        const structured = postAnswerInsights.generateStructuredExplanation(
          selectedOptionId,
          correctAnswer,
          currentQuestion.frequencies || {},
          currentQuestion.handCategory || '',
          scenario.street || 'flop',
          scenario.nodeType || '',
          scenario,
          fullExplanation
        );
        // Phase 256: Attach spot difficulty estimation
        try {
          structured.spotDifficulty = postAnswerInsights.estimateSpotDifficulty(
            currentQuestion.frequencies || {},
            scenario.street || 'flop',
            scenario.stackDepth,
            scenario.nodeType || ''
          );
        } catch (_e) {
          console.warn('[App] Handled exception:', _e?.message || _e);
        }
        setStructuredExplanation(structured);
      } catch (e) {
        setStructuredExplanation(null);
      }

      // ═══ ADAPTIVE DIFFICULTY: Auto-adjust level every 5 questions ═══
      // Also identifies weak spots and emits them for targeted practice
      const answeredSoFar = questionNumber; // 1-based, this is the Nth answer
      if (
        answeredSoFar >= adaptiveCheckpointRef.current &&
        answeredSoFar < effectiveQuestionsPerLevel
      ) {
        const windowSize = 5;
        const recentHistory = gtowScoring.handHistory.slice(-windowSize);
        const recentCorrect = recentHistory.filter(
          (h) => h.classification === 'best' || h.classification === 'correct'
        ).length;
        const recentAccuracy = (recentCorrect / windowSize) * 100;

        if (recentAccuracy >= 90 && level < TOTAL_LEVELS) {
          // Player is crushing it → increase difficulty
          const newLevel = Math.min(TOTAL_LEVELS, level + 1);
          setLevel(newLevel);
          setAdaptiveLevelChange({ from: level, to: newLevel, direction: 'up' });
          try {
            eventBus.emit('adaptiveDifficultyChange', {
              // Multi-table residual (#10, bus scoping): without a table id in
              // the envelope, every mounted GodModeArena's listener consumed
              // this and toasted table A's adaptive change on tables B/C/D.
              gameId,
              from: level,
              to: newLevel,
              direction: 'up',
            });
          } catch (_) {
            console.warn('[App] Handled exception:', _?.message || _);
          }
          console.debug(
            `[GTOTrainer] 📈 Adaptive: Level ${level} → ${newLevel} (accuracy ${recentAccuracy}%)`
          );
        } else if (recentAccuracy < 50 && level > 1) {
          // Player struggling → decrease difficulty
          const newLevel = Math.max(1, level - 1);
          setLevel(newLevel);
          setAdaptiveLevelChange({ from: level, to: newLevel, direction: 'down' });
          try {
            eventBus.emit('adaptiveDifficultyChange', {
              gameId, // #10 bus scoping -- see the 'up' emission above
              from: level,
              to: newLevel,
              direction: 'down',
            });
          } catch (_) {
            console.warn('[App] Handled exception:', _?.message || _);
          }
          console.debug(
            `[GTOTrainer] 📉 Adaptive: Level ${level} → ${newLevel} (accuracy ${recentAccuracy}%)`
          );
        }

        // ═══ PHASE 14: Emit weak-spot analysis for UI consumption ═══
        const weakSpots = getWeakSpots();
        if (weakSpots.length > 0) {
          try {
            eventBus.emit('weakSpotAnalysis', {
              gameId, // #10 bus scoping -- no listeners today, scoped for when one appears
              weakSpots,
              topWeakSpot: weakSpots[0],
              checkpoint: answeredSoFar,
            });
          } catch (_) {
            console.warn('[App] Handled exception:', _?.message || _);
          }
          console.debug(
            `[GTOTrainer] 🎯 Weak spots detected:`,
            weakSpots
              .map(
                (s) =>
                  `${s.position}/${s.street}/${s.spotType} (${Math.round(s.mistakeRate * 100)}%)`
              )
              .join(', ')
          );
        }

        adaptiveCheckpointRef.current = answeredSoFar + 5; // Next checkpoint
      }

      // ═══ MULTI-STREET: Record action on current hand ═══
      if (multiStreetHandRef.current && !multiStreetHandRef.current.isComplete) {
        try {
          multiStreetHandRef.current.recordAction(
            selectedOptionId,
            moveResult.classification,
            moveResult.evLoss
          );
        } catch (multiStreetError) {
          console.warn('[GTOTrainer] Multi-street projection failed (non-critical):', multiStreetError?.message || multiStreetError);
        }
      }

      // ═══ PHASE 14: Trigger background prefetch at 60% through level ═══
      const progress = questionNumber / effectiveQuestionsPerLevel;
      if (progress >= 0.6 && !prefetchTriggeredRef.current) {
        void Promise.resolve(prefetchNextLevel()).catch((prefetchError) => {
          console.warn('[GTOTrainer] Background prefetch failed (non-critical):', prefetchError?.message || prefetchError);
        });
      }

      // ═══ PHASE 14: Track weak spots + record with spot metadata ═══
      const spotType = deriveSpotType(scenario);
      const heroPos = scenario.heroPosition || 'BTN';
      const streetName = scenario.street || 'flop';
      try {
        updateWeakSpotMap(heroPos, streetName, spotType, moveResult.classification);
      } catch (weakSpotError) {
        console.warn('[GTOTrainer] Weak-spot projection failed (non-critical):', weakSpotError?.message || weakSpotError);
      }

        } catch (projectionError) {
          console.warn('[GTOTrainer] Optional answer projection failed (non-critical):', projectionError?.message || projectionError);
        } finally {
          // These four fields are the mandatory browser rendering of the
          // already-persisted server verdict. They remain explicit and gated
          // by manual Next even if every optional projection above fails.
          setFeedbackResult(isCorrect ? 'correct' : 'wrong');
          setExplanation(renderedExplanation);
          setShowFeedback(true);
          setLastSelectedAction(selectedOptionId);
        }
      };

      // Preserve one immutable submission until the exact write and feedback
      // reveal succeed. The callback runs once after the server acknowledges
      // this receipt, including after an idempotent Retry Save. No visible
      // verdict, score, streak, or explanation is derived in the browser.
      const entry = {
        lease: submissionLease,
        submission,
        promise: null,
        result: null,
        inFlight: false,
        finalized: false,
        onPersisted: finalizePersistedAnswer,
      };
      submitAnswerInFlightRef.current = entry;
      pendingAnswerPersistenceRef.current = entry;
      setAnswerSaveRequiresRefresh(false);
      setAnswerSaveError(null);
      try {
        await persistPendingAnswer(entry);
      } finally {
        if (submitAnswerInFlightRef.current === entry) submitAnswerInFlightRef.current = null;
      }
    },
    [
      currentQuestion,
      showFeedback,
      bestStreak,
      persistPendingAnswer,
      resolveDifficultyMode,
      level,
      gtowScoring,
      questionNumber,
      effectiveQuestionsPerLevel,
      deriveSpotType,
      updateWeakSpotMap,
      getWeakSpots,
      prefetchNextLevel,
      gameId,
      userId,
      captureTrainingLease,
      isTrainingLeaseActive,
      trainerConfig,
    ]
  );

  /**
   * ═══ MULTI-STREET: Advance to next street within same hand ═══
   * Called by nextQuestion() when multi-street hand is active.
   * Queries API for next-street solver data.
   */
  const advanceToNextStreet = useCallback(async () => {
    const hand = multiStreetHandRef.current;
    if (!hand || hand.isComplete) return false;
    const requestLease = captureTrainingLease();
    if (!isTrainingLeaseActive(requestLease)) return null;
    const activeContext = currentQuestion?._gradingContext;
    if (
      !activeContext?.attemptId
      || !activeContext?.snapshotKey
      || !Number.isInteger(Number(activeContext?.handOrdinal))
      || !Number.isInteger(Number(activeContext?.decisionOrdinal))
    ) {
      setError('This hand cannot continue without its signed attempt context. Reload the Arena.');
      return false;
    }

    try {
      setLoading(true);
      // A street is a decision (roadmap #49). The flop's graded mix must not
      // survive into the turn -- RNG grades against these bands.
      setLastGTOFrequencies(null);

      // The server reconstructs every card, position, street, stack, pot and
      // attempt field from the immutable signed snapshot. The browser sends
      // only the parent receipt, so it cannot splice a more favourable hand
      // state into a continuation.
      const response = await trainingFetch('/api/training/next-street', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gradingReceipt: activeContext.receipt }),
      });
      if (!isTrainingLeaseActive(requestLease) || multiStreetHandRef.current !== hand) return null;

      let data = null;
      try { data = await response.json(); } catch (_) { /* handled below */ }
      if (!isTrainingLeaseActive(requestLease) || multiStreetHandRef.current !== hand) return null;
      if (response.ok && data?.question) {
          assertSignedTrainingDelivery(data, activeContext.sessionId, {
            attemptId: activeContext.attemptId,
            handOrdinal: activeContext.handOrdinal,
            decisionOrdinal: Number(activeContext.decisionOrdinal) + 1,
          });
          // The hand manager validates and adopts the entire continuation
          // atomically; no browser field may partially mutate before a board,
          // street, card, or canonical-question mismatch is discovered.
          const nextQ = hand.applyServerContinuation(data);

          if (!isTrainingLeaseActive(requestLease) || multiStreetHandRef.current !== hand) return null;
          setCurrentQuestion(nextQ);
          setCurrentStreet(data.street || hand.currentStreet);
          setShowFeedback(false);
          setLoading(false);
          return true;
      }

      if (response.status === 404 && data?.code === 'TRAINING_CONTINUATION_SOLVER_MISS') {
        hand.finishAtSolverBoundary(data.code);
        setAnswerSaveError(null);
        setLoading(false);
        return 'solver-boundary';
      }

      setAnswerSaveError(
        data?.error
          || `The next street could not be dealt (${response.status}). Your completed decision is still saved; try Next again.`
      );
      setLoading(false);
      return false;
    } catch (err) {
      if (!isTrainingLeaseActive(requestLease) || multiStreetHandRef.current !== hand) return null;
      console.warn('[GTOTrainer] Multi-street advance error:', err);
      setAnswerSaveError(
        err?.message
          || 'The next street could not be dealt. Your completed decision is still saved; try Next again.'
      );
      setLoading(false);
      return false;
    }
  }, [captureTrainingLease, currentQuestion, isTrainingLeaseActive]);

  /**
   * Save progress to database
   */
  // ═══ MASTERY GATE: Store mastery token from server response ═══
  const [masteryToken, setMasteryToken] = useState(null);
  const [masteryStatus, setMasteryStatus] = useState(null); // server-verified mastery result

  const saveProgress = useCallback(async (attemptId, requestLease = captureTrainingLease()) => {
    if (!userId || !gameId || !attemptId) {
      throw new Error('This Training attempt cannot be completed without a signed identity.');
    }
    if (!isTrainingLeaseActive(requestLease)) {
      throw new Error('The Training session changed before completion could be verified.');
    }

    const postAttempt = async (endpoint, label) => {
      const response = await trainingFetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ attemptId }),
      });
      if (!isTrainingLeaseActive(requestLease)) {
        throw new Error('The Training session changed while completion was being verified.');
      }
      let payload;
      try {
        payload = await response.json();
      } catch (_parseError) {
        throw new Error(`${label} returned invalid JSON (${response.status}).`);
      }
      if (!isTrainingLeaseActive(requestLease)) {
        throw new Error('The Training session changed while completion was being verified.');
      }
      if (!response.ok || payload?.success !== true) {
        throw new Error(payload?.error || `${label} failed (${response.status}).`);
      }
      if (String(payload.attemptId || '').toLowerCase() !== String(attemptId).toLowerCase()) {
        throw new Error(`${label} acknowledged a different Training attempt.`);
      }
      return payload;
    };

    // Completion owns mastery, history, progress, leaderboards, and rewards in
    // one database transaction. The analytics projection is a second
    // idempotent server-derived operation over that completed attempt.
    const completion = await postAttempt('/api/training/save-progress', 'Training completion');
    await postAttempt('/api/training/save-session', 'Training analytics');
    if (!isTrainingLeaseActive(requestLease)) {
      throw new Error('The Training session changed while completion was being verified.');
    }

    const mastery = {
      passed: Boolean(completion.passed),
      requiredCorrect: Number(completion.requiredCorrect) || 0,
      requiredQuestions: Number(completion.requiredQuestions) || 0,
      nextLevelUnlocked: Boolean(completion.passed) && selectedLevel < TOTAL_LEVELS,
      message: completion.passed
        ? `Mastery verified: ${completion.correct}/${completion.requiredQuestions}.`
        : `Keep training: ${completion.correct}/${completion.requiredCorrect} required answers.`,
    };
    setMasteryStatus(mastery);
    setMasteryToken(null);
    setLevelPassed(mastery.passed);

    try {
      eventBus.emit(
        'training:session-saved',
        {
          gameId,
          attemptId,
          gtowScore: gtowScoring.gtowScore,
          handsPlayed: completion.answered,
        },
        'useGTOTrainer'
      );
    } catch (busError) {
      console.warn('[GTOTrainer] Bus emit failed (non-critical):', busError.message);
    }
    return completion;
  }, [captureTrainingLease, gameId, gtowScoring.gtowScore, isTrainingLeaseActive, selectedLevel, userId]);

  /**
   * Advance to next question or complete level
   * 🚀 MULTI-STREET: First tries to advance the street within same hand
   * If no next street → advance to next hand from pre-loaded array
   */
  const nextQuestion = useCallback(async () => {
    if (nextQuestionInFlightRef.current) return;
    const transitionLease = captureTrainingLease();
    if (!isTrainingLeaseActive(transitionLease)) return;
    const transitionToken = { lease: transitionLease };
    nextQuestionInFlightRef.current = transitionToken;
    try {
    // Do not outrun the canonical answer recorder. A refresh-required response
    // means this browser question is no longer trustworthy, so explicit Next
    // replaces it at the same question number instead of consuming another
    // possibly stale preloaded entry or auto-advancing behind the feedback.
    const pendingPersistence = pendingAnswerPersistenceRef.current;
    const persistenceResult = pendingPersistence
      ? await persistPendingAnswer(pendingPersistence)
      : { ok: true };
    if (!isTrainingLeaseActive(transitionLease)) return;

    const answeredQuestionId = String(currentQuestion?.id || '');
    if (answeredQuestionId && refreshRequiredQuestionIdsRef.current.has(answeredQuestionId)) {
      setShowFeedback(false);
      setLastGTOFrequencies(null);
      try {
        const replacement = await fetchSingleQuestion(selectedLevel, questionNumber, { throwOnError: true });
        if (!replacement || !isTrainingLeaseActive(transitionLease)) return;
        refreshRequiredQuestionIdsRef.current.delete(answeredQuestionId);
        pendingAnswerPersistenceRef.current = null;
        setAnswerSaveRequiresRefresh(false);
        setAnswerSaveError(null);
      } catch (refreshError) {
        setAnswerSaveRequiresRefresh(true);
        setAnswerSaveError(
          refreshError?.message || 'A fresh Training hand could not be loaded. Try again.'
        );
      }
      return;
    }
    if (persistenceResult?.ok !== true) {
      // The player has already had unlimited time to read the verdict. Once
      // they explicitly ask to continue, fail visibly instead of silently
      // consuming a new question whose predecessor was never recorded.
      setAnswerSaveError(
        persistenceResult?.error || 'Your answer could not be saved. Check your connection, then retry.'
      );
      return;
    }
    const pendingConfigContract = pendingSessionConfigContractRef.current;
    const isFinalRequiredHand = questionNumber >= effectiveQuestionsPerLevel;
    if (pendingConfigContract && !isFinalRequiredHand) {
      // Never abandon an answer merely because settings changed while its
      // authoritative write was still in flight. Rotate only after the old
      // attempt has acknowledged the persisted decision.
      loadedSessionConfigContractRef.current = pendingConfigContract;
      pendingSessionConfigContractRef.current = null;
      resetAttemptRuntimeRef.current();
      activateFreshTrainingSession('config');
      return;
    }
    pendingAnswerPersistenceRef.current = null;
    setAnswerSaveError(null);
    if (!pendingConfigContract || !isFinalRequiredHand) setShowFeedback(false);
    // The graded mix belongs to the decision just finished. Leaving it set
    // meant the felt served it as the NEXT spot's solver output until that one
    // was graded too -- see the note on `computedFrequencies` in
    // UniversalDynamicTable.jsx.
    setLastGTOFrequencies(null);

    // ═══ MULTI-STREET: Try advancing street first ═══
    if (
      isMultiStreetActive &&
      multiStreetHandRef.current &&
      !multiStreetHandRef.current.isComplete
    ) {
      // Hero didn't fold — try to advance to next street
      const isFold = ['f', 'fold', 'simple_fold'].includes(lastSelectedAction);
      if (!isFold) {
        const advanced = await advanceToNextStreet();
        if (!isTrainingLeaseActive(transitionLease)) return;
        if (advanced === true) return; // Successfully moved to next street
        if (advanced === null || advanced === false) {
        // An active, unfinished multi-street hand has no legitimate silent
        // fallback. Keep the persisted verdict and manual Next on screen so a
        // transport or integrity failure cannot shorten the server-owned attempt.
        setShowFeedback(true);
        return;
        }
        if (advanced === 'solver-boundary') {
          const finishedHand = multiStreetHandRef.current;
          if (finishedHand && typeof finishedHand.getHandSummary === 'function') {
            setHandSummary(finishedHand.getHandSummary());
          }
          setIsMultiStreetActive(false);
          multiStreetHandRef.current = null;
        }
      }

      // Multi-street hand is done — save summary (persists until next hand feedback dismisses it)
      // 2026-07-19 AUDIT FIX (E2E defect D4a): advanceToNextStreet is async —
      // by the time it resolves, another code path may have already cleared
      // multiStreetHandRef, and calling getHandSummary() on null threw an
      // unhandled TypeError 19 times in one live session. Re-check the ref.
      const finishedHand = multiStreetHandRef.current;
      if (finishedHand && typeof finishedHand.getHandSummary === 'function') {
        setHandSummary(finishedHand.getHandSummary());
      }
      setIsMultiStreetActive(false);
      multiStreetHandRef.current = null;
    } else if (multiStreetHandRef.current?.isComplete) {
      const finishedHand = multiStreetHandRef.current;
      if (typeof finishedHand.getHandSummary === 'function') {
        setHandSummary(finishedHand.getHandSummary());
      }
      setIsMultiStreetActive(false);
      multiStreetHandRef.current = null;
    } else {
      // Only clear hand summary when starting a fresh hand (not when finishing multi-street)
      setHandSummary(null);
      // A continuation-free or off-tree answer marks MultiStreetHand complete
      // inside recordAction(). That completed hand used to miss the cleanup
      // branch above, leaving isMultiStreetActive true while the next authored
      // question loaded. A River question was then labelled River but its five
      // cards were clamped through the stale Flop state to three. Completed
      // hands never own the next decision.
      if (isMultiStreetActive || multiStreetHandRef.current) {
        setIsMultiStreetActive(false);
        multiStreetHandRef.current = null;
      }
    }

    // Reset street state for new hand
    setCurrentStreet('flop');

    if (questionNumber >= effectiveQuestionsPerLevel) {
      // The browser never declares a level complete. It supplies only the
      // opaque signed attempt id, then waits for the atomic server verdict.
      const attemptId = currentQuestion?._gradingContext?.attemptId;
      try {
        const completion = await saveProgress(attemptId, transitionLease);
        if (!isTrainingLeaseActive(transitionLease)) return;
        const passed = Boolean(completion.passed);
        const accuracy = Number(completion.accuracy) || 0;
        setDiamondsEarned(Number(completion.diamondsEarned) || 0);
        setLevelPassed(passed);
        setGameComplete(true);
        try {
          if (passed) {
            if (accuracy === 100) trainingSounds.play('mastery');
            else trainingSounds.play('levelUp');
          } else {
            trainingSounds.play('incorrect');
          }
        } catch (soundError) {
          // Audio is presentation only. A disabled/broken output device must
          // not turn a durable server completion into a fake completion error
          // or invite the player to retry an already-settled reward.
          console.warn('[GTOTrainer] Completion sound failed (non-critical):', soundError?.message || soundError);
        }
      } catch (completionError) {
        // Keep the final verdict and explicit Next available. The RPC is
        // idempotent, so the same button safely retries both completion and
        // analytics without duplicating progress or rewards.
        setShowFeedback(true);
        setAnswerSaveError(
          completionError?.message || 'Training completion could not be verified. Try Next again.'
        );
        return;
      }
    } else {
      if (preloadComplete && preloadedQuestions[questionNumber]) {
        // Serve the already transformed and signed next question (INSTANT).
        const nextQ = preloadedQuestions[questionNumber];
        if (!isTrainingLeaseActive(transitionLease)) return;
        activateNewTrainingQuestion(nextQ);
        setQuestionNumber((prev) => prev + 1);
      } else {
        // Fallback to single-question mode
        try {
          const loadedQuestion = await fetchSingleQuestion(
            selectedLevel,
            questionNumber + 1,
            { throwOnError: true },
          );
          if (!loadedQuestion || !isTrainingLeaseActive(transitionLease)) return;
          setQuestionNumber((prev) => prev + 1);
        } catch (loadError) {
          // Keep the just-persisted verdict and explicit Next visible. The
          // ordinal advances only after a new signed hand is actually active.
          setShowFeedback(true);
          setAnswerSaveError(
            loadError?.message || 'The next Training hand could not be loaded. Try Next again.',
          );
          return;
        }
      }
    }
    } finally {
      if (nextQuestionInFlightRef.current === transitionToken) {
        nextQuestionInFlightRef.current = null;
      }
    }
  }, [
    questionNumber,
    correctCount,
    preloadComplete,
    preloadedQuestions,
    saveProgress,
    fetchSingleQuestion,
    isMultiStreetActive,
    advanceToNextStreet,
    lastSelectedAction,
    effectiveQuestionsPerLevel,
    selectedLevel,
    currentQuestion,
    persistPendingAnswer,
    trainerConfig,
    activateNewTrainingQuestion,
    activateFreshTrainingSession,
    captureTrainingLease,
    isTrainingLeaseActive,
  ]);

  /**
   * Start next level (if passed)
   * 🚀 Uses prefetched cache if available, otherwise fetches fresh
   */
  const startNextLevel = useCallback(async () => {
    if (!levelPassed || selectedLevel >= TOTAL_LEVELS) return;
    const operationLease = captureTrainingLease();
    if (!isTrainingLeaseActive(operationLease)) return;

    const nextLevel = selectedLevel + 1;
    let nextSessionId = createChildTrainingSessionId(trainingSessionIdRef.current, 'level');
    const prefetched = nextLevelCacheRef.current;
    let prefetchedQuestions = null;
    if (prefetched && prefetched.level === nextLevel && prefetched.questions.length > 0) {
      try {
        const candidateSessionId = String(prefetched.sessionId || '');
        const candidateAttemptId = String(
          prefetched.questions[0]?._gradingContext?.attemptId || '',
        );
        const candidateTargetHands = Number(
          prefetched.questions[0]?._gradingContext?.sessionTargetHands,
        );
        assertSignedTrainingDelivery({
          success: true,
          sessionId: candidateSessionId,
          attemptId: candidateAttemptId,
          targetHands: candidateTargetHands,
          questions: prefetched.questions,
        }, candidateSessionId);
        if (prefetched.questions.length !== candidateTargetHands) {
          throw new Error('The prefetched attempt is incomplete.');
        }
        nextSessionId = candidateSessionId;
        prefetchedQuestions = prefetched.questions;
      } catch (prefetchError) {
        console.warn('[GTOTrainer] Next-level prefetch could not be adopted:', prefetchError.message);
      }
    }

    if (!isTrainingLeaseActive(operationLease)) return;

    activateFreshTrainingSession('level', nextSessionId);
    loadedSessionConfigContractRef.current = createDeliveryFamilyKey(
      gameId,
      nextLevel,
      trainerConfig,
    );
    pendingSessionConfigContractRef.current = null;
    setSelectedLevel(nextLevel);
    setLevel(nextLevel);
    setQuestionNumber(1);
    setCorrectCount(0);
    setStreak(0);
    setGameComplete(false);
    setLevelPassed(false);
    setDiamondsEarned(0);
    prefetchTriggeredRef.current = false; // Reset for next level

    // Background prefetch already created a distinct server-owned attempt for
    // the next level. Adopt that exact attempt instead of minting a duplicate
    // reward-eligible campaign from its browser-visible question ids.
    if (prefetchedQuestions?.length > 0) {
      console.debug(
        `[GTOTrainer] ⚡ Using signed prefetch for level ${nextLevel} (${prefetchedQuestions.length} questions)`
      );
      loadedDeliveryContractRef.current = createDeliveryContractKey(
        gameId,
        nextSessionId,
        trainerConfig,
        nextLevel,
      );
      setPreloadedQuestions(prefetchedQuestions);
      setPreloadComplete(true);
      activateNewTrainingQuestion(prefetchedQuestions[0]);
      if (prefetchedQuestions.length !== effectiveQuestionsPerLevel) {
        setEffectiveQuestionsPerLevel(prefetchedQuestions.length);
      }
      setLoading(false);
    } else {
      setCurrentQuestion(null);
      setPreloadComplete(false);
      setLoading(true);
    }
    nextLevelCacheRef.current = null;
  }, [
    levelPassed,
    selectedLevel,
    effectiveQuestionsPerLevel,
    activateFreshTrainingSession,
    gameId,
    trainerConfig,
    activateNewTrainingQuestion,
    captureTrainingLease,
    isTrainingLeaseActive,
  ]);

  /**
   * Retry current level
   * 🚀 Pre-loads fresh set of questions
   */
  const retryLevel = useCallback(() => {
    resetAttemptRuntimeRef.current();
    pendingSessionConfigContractRef.current = null;
    activateFreshTrainingSession('retry');
    setLevel(selectedLevel);
    setQuestionNumber(1);
    setCorrectCount(0);
    setStreak(0);
    setGameComplete(false);
    setLevelPassed(false);
    setDiamondsEarned(0);
    setPreloadComplete(false);
    setEffectiveQuestionsPerLevel(baseQuestionsPerLevel); // Reset to original count
    // Reset per-session scoring + tracking state
    gtowScoring.resetScore();
    // Keep the engine-side session accumulator (_sessionStats.history) in
    // step with the hook's — otherwise a retry's review screen would mix
    // two sessions' histories.
    try { postAnswerInsights.resetSessionDifficulty(); } catch (_) {}
    mistakeQuestionsRef.current = [];
    adaptiveCheckpointRef.current = 5;
    prefetchTriggeredRef.current = false;
    setCurrentQuestion(null);
    setLoading(true);
  }, [activateFreshTrainingSession, baseQuestionsPerLevel, gtowScoring, selectedLevel]);

  /**
   * Retrain only the hands the player got wrong.
   * Injects saved mistake questions directly into the queue.
   */
  const retrainMistakes = useCallback(async () => {
    const mistakes = mistakeQuestionsRef.current;
    if (!mistakes || mistakes.length === 0) return;

    const operationLease = captureTrainingLease();
    if (!isTrainingLeaseActive(operationLease)) return false;
    setLoading(true);
    setError(null);
    const nextSessionId = createChildTrainingSessionId(trainingSessionIdRef.current, 'retrain');
    const parentAttemptIds = Array.from(new Set(
      mistakes.map((question) => String(question?._gradingContext?.attemptId || '')).filter(Boolean),
    ));
    if (parentAttemptIds.length !== 1) {
      setError('Mistake replay requires one completed, server-verified source attempt.');
      setLoading(false);
      return false;
    }
    let reissued;
    try {
      reissued = await reissueSignedQuestions(mistakes, nextSessionId, selectedLevel, {
        sessionKind: 'replay',
        handOrdinalStart: 1,
        parentAttemptId: parentAttemptIds[0],
      });
      if (!isTrainingLeaseActive(operationLease)) return false;
    } catch (reissueError) {
      setError(reissueError?.message || 'Mistake hands could not be refreshed.');
      setLoading(false);
      return false;
    }
    if (!isTrainingLeaseActive(operationLease)) return false;
    activateFreshTrainingSession('retrain', nextSessionId);
    loadedSessionConfigContractRef.current = createDeliveryFamilyKey(
      gameId,
      selectedLevel,
      trainerConfig,
    );
    pendingSessionConfigContractRef.current = null;

    // Shuffle mistake questions for varied practice.
    // Phase 62: Fisher-Yates instead of biased sort(()=>Math.random()-0.5).
    const shuffled = [...reissued];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    setQuestionNumber(1);
    setCorrectCount(0);
    setStreak(0);
    setGameComplete(false);
    setLevelPassed(false);
    setDiamondsEarned(0);
    setShowFeedback(false);
    setPreloadedQuestions(shuffled);
    setPreloadComplete(true);
    setEffectiveQuestionsPerLevel(shuffled.length);
    activateNewTrainingQuestion(shuffled[0]);
    setLoading(false);
    loadedDeliveryContractRef.current = createDeliveryContractKey(
      gameId,
      nextSessionId,
      trainerConfig,
      selectedLevel,
    );

    // Reset scoring for the retrain session
    gtowScoring.resetScore();
    try { postAnswerInsights.resetSessionDifficulty(); } catch (_) {}
    // Clear the mistakes ref so this retrain session tracks fresh mistakes
    mistakeQuestionsRef.current = [];

    console.debug(`[GTOTrainer] Retraining ${shuffled.length} mistake hands`);
    return true;
  }, [activateFreshTrainingSession, activateNewTrainingQuestion, captureTrainingLease, gameId, gtowScoring, isTrainingLeaseActive, selectedLevel, reissueSignedQuestions, trainerConfig]);

  /**
   * Reset entire game
   * 🚀 Pre-loads questions for level 1
   */
  const resetGame = useCallback(() => {
    resetAttemptRuntimeRef.current();
    pendingSessionConfigContractRef.current = null;
    activateFreshTrainingSession('reset');
    setSelectedLevel(1);
    setLevel(1);
    setQuestionNumber(1);
    setCorrectCount(0);
    setStreak(0);
    setBestStreak(0);
    setGameComplete(false);
    setLevelPassed(false);
    setDiamondsEarned(0);
    setPreloadComplete(false);
    setEffectiveQuestionsPerLevel(baseQuestionsPerLevel); // Reset to original count
    // Reset per-session scoring + tracking state
    gtowScoring.resetScore();
    // Keep the engine-side session accumulator (_sessionStats.history) in
    // step with the hook's — otherwise a retry's review screen would mix
    // two sessions' histories.
    try { postAnswerInsights.resetSessionDifficulty(); } catch (_) {}
    mistakeQuestionsRef.current = [];
    adaptiveCheckpointRef.current = 5;
    prefetchTriggeredRef.current = false;
    setCurrentQuestion(null);
    setLoading(true);
  }, [activateFreshTrainingSession, baseQuestionsPerLevel, gtowScoring]);

  // Central reset used by configuration changes and terminal-attempt recovery.
  // It preserves the selected campaign level, but no question, score, receipt,
  // continuation, or review state is allowed to cross into the fresh attempt.
  resetAttemptRuntimeRef.current = () => {
    pendingAnswerPersistenceRef.current = null;
    submitAnswerInFlightRef.current = null;
    refreshRequiredQuestionIdsRef.current.clear();
    nextQuestionInFlightRef.current = null;
    nextLevelCacheRef.current = null;
    prefetchTriggeredRef.current = false;
    mistakeQuestionsRef.current = [];
    adaptiveCheckpointRef.current = 5;
    multiStreetHandRef.current = null;
    weakSpotMapRef.current = {};
    setQuestionNumber(1);
    setLevel(selectedLevel);
    setCorrectCount(0);
    setStreak(0);
    setBestStreak(0);
    setCurrentQuestion(null);
    setPreloadedQuestions([]);
    setPreloadComplete(false);
    setEffectiveQuestionsPerLevel(baseQuestionsPerLevel);
    setError(null);
    setAnswerSaveError(null);
    setAnswerSaveRetrying(false);
    setAnswerSaveRequiresRefresh(false);
    setShowFeedback(false);
    setFeedbackResult(null);
    setExplanation('');
    setStructuredExplanation(null);
    setGameComplete(false);
    setLevelPassed(false);
    setDiamondsEarned(0);
    setMasteryToken(null);
    setMasteryStatus(null);
    setLastMoveClassification(null);
    setLastEVLoss(null);
    setLastEVLossMeasured(false);
    setLastGTOFrequencies(null);
    setCurrentStreet('flop');
    setIsMultiStreetActive(false);
    setHandSummary(null);
    setLastSelectedAction(null);
    setAdaptiveLevelChange(null);
    gtowScoring.resetScore();
    try { postAnswerInsights.resetSessionDifficulty(); } catch (_) {}
    setLoading(true);
  };

  // 🚀 Load on mount/game change and refetch whenever the server-owned
  // delivery contract changes. Difficulty/street/custom filters cannot be
  // rewritten client-side because doing so invalidates the signed question
  // digest. A change made while feedback is visible waits for explicit Next.
  // Ref pattern: preloadAllQuestions changes identity whenever level or
  // effectiveQuestionsPerLevel change (e.g. adaptive difficulty mid-game),
  // and having it in the dep array re-fired the effect mid-game, wiping the
  // in-progress question set. Level transitions call preloadAllQuestions
  // explicitly (startNextLevel/retryLevel/resetGame), so no re-fire is needed.
  const preloadRef = useRef(preloadAllQuestions);
  preloadRef.current = preloadAllQuestions;
  const deliveryContractKey = createDeliveryContractKey(
    gameId,
    trainingSessionId,
    trainerConfig,
    selectedLevel,
  );
  const sessionConfigContractKey = createDeliveryFamilyKey(gameId, selectedLevel, trainerConfig);
  useEffect(() => {
    if (!gameId) return;
    if (runtimeIdentityChangedRef.current) {
      runtimeIdentityChangedRef.current = false;
      resetAttemptRuntimeRef.current();
      loadedSessionConfigContractRef.current = sessionConfigContractKey;
      pendingSessionConfigContractRef.current = null;
      loadedDeliveryContractRef.current = deliveryContractKey;
      preloadRef.current();
      return;
    }
    if (loadedSessionConfigContractRef.current === null) {
      loadedSessionConfigContractRef.current = sessionConfigContractKey;
    } else if (loadedSessionConfigContractRef.current !== sessionConfigContractKey) {
      if (
        showFeedback
        || nextQuestionInFlightRef.current
        || submitAnswerInFlightRef.current
        || pendingAnswerPersistenceRef.current
        || (
          questionNumber >= effectiveQuestionsPerLevel
          && Number(multiStreetHandRef.current?.streetActions?.length || 0) > 0
        )
      ) {
        pendingSessionConfigContractRef.current = sessionConfigContractKey;
        return;
      }
      loadedSessionConfigContractRef.current = sessionConfigContractKey;
      pendingSessionConfigContractRef.current = null;
      resetAttemptRuntimeRef.current();
      activateFreshTrainingSession('config');
      return;
    } else {
      pendingSessionConfigContractRef.current = null;
    }
    if (showFeedback) return;
    if (loadedDeliveryContractRef.current === deliveryContractKey) return;
    loadedDeliveryContractRef.current = deliveryContractKey;
    preloadRef.current();
  }, [
    activateFreshTrainingSession,
    deliveryContractKey,
    gameId,
    effectiveQuestionsPerLevel,
    questionNumber,
    sessionConfigContractKey,
    showFeedback,
  ]);

  return {
    // Current state
    currentQuestion,
    questionNumber,
    totalQuestions: effectiveQuestionsPerLevel,
    // 2026-07-19: `level` = the user-selected level (stable, for UI labels +
    // persistence); `contentLevel` = adaptive difficulty actually being served
    level: selectedLevel,
    contentLevel: level,
    trainingSessionId,
    loading,
    error,
    answerSaveError,
    answerSaveRetrying,
    answerSaveRequiresRefresh,

    // Pre-load state
    preloadComplete,

    // Score state
    correctCount,
    streak,
    bestStreak,
    requiredCorrect: getRequiredCorrect(selectedLevel, effectiveQuestionsPerLevel),
    passThreshold: TRAINING_CONFIG.passThresholds[selectedLevel],
    totalLevels: TOTAL_LEVELS,

    // ═══ MASTERY GATE: Server-verified mastery state ═══
    masteryToken,
    masteryStatus,

    // Feedback state
    showFeedback,
    feedbackResult,
    explanation,

    // GTOW scoring state
    moveClassification: lastMoveClassification,
    evLoss: lastEVLoss,
    evLossMeasured: lastEVLossMeasured,
    gtoFrequencies: lastGTOFrequencies,
    gtowScore: gtowScoring.gtowScore,
    totalEVLoss: gtowScoring.totalEVLoss,
    measuredTotalEVLoss: gtowScoring.measuredTotalEVLoss,
    measuredEVDecisions: gtowScoring.measuredEVDecisions,
    sessionMistakes: gtowScoring.mistakeCount,
    handHistory: gtowScoring.handHistory,
    avgEVLossPerHand: gtowScoring.avgEVLossPerHand,
    avgEVLossPerMistake: gtowScoring.avgEVLossPerMistake,
    avgFrequencyDiff: gtowScoring.avgFrequencyDiff,

    // Phase 37: Enhanced session metrics from useGTOWScore
    classificationCounts: gtowScoring.classificationCounts,
    currentStreak: gtowScoring.currentStreak,
    bestGTOWStreak: gtowScoring.bestStreak,
    lastClassification: gtowScoring.lastClassification,
    gtowAccuracy: gtowScoring.accuracy,

    // Phase 38: Position & street accuracy
    positionAccuracy: gtowScoring.positionAccuracy,
    streetAccuracy: gtowScoring.streetAccuracy,
    weakestPosition: gtowScoring.weakestPosition,

    // Phase 40: Mistake patterns
    mistakePatterns: gtowScoring.mistakePatterns,
    // Phase 59: Hand type performance
    handTypePerformance: gtowScoring.handTypePerformance,

    // Multi-street state
    currentStreet,
    isMultiStreetActive,
    handSummary,

    // Completion state
    gameComplete,
    levelPassed,
    diamondsEarned,

    // Adaptive difficulty
    adaptiveLevelChange,

    // ═══ PHASE 14: Weak-spot targeting ═══
    getWeakSpots,
    weakSpotMap: weakSpotMapRef.current,

    // ═══ PHASE 90: Session weakness summary ═══
    getSessionSummary: () => {
      try {
        return postAnswerInsights.generateSessionSummary();
      } catch (e) {
        return null;
      }
    },
    getMistakeTrackerData: () => {
      try {
        return postAnswerInsights.getMistakeTrackerData();
      } catch (e) {
        return {};
      }
    },
    // ═══ PHASE 94: Milestone coaching ═══
    getMilestoneCoaching: (qNum) => {
      try {
        return postAnswerInsights.getMilestoneCoaching(qNum);
      } catch (e) {
        return null;
      }
    },
    // ═══ PHASE 124: Performance trend tracking ═══
    getPerformanceTrend: () => {
      try {
        return postAnswerInsights.getPerformanceTrend();
      } catch (e) {
        return null;
      }
    },
    // ═══ PHASE 125: Engine stats ═══
    getEngineStats: () => {
      try {
        return postAnswerInsights.getEngineStats();
      } catch (e) {
        return null;
      }
    },
    // ═══ PHASE 140: GTO deviation summary ═══
    getDeviationSummary: () => {
      try {
        return postAnswerInsights.getDeviationSummary();
      } catch (e) {
        return null;
      }
    },
    // ═══ PHASE 143: Auto-adjusted difficulty ═══
    getAutoAdjustedDifficulty: () => {
      try {
        return postAnswerInsights.getAutoAdjustedDifficulty();
      } catch (e) {
        return 'standard';
      }
    },
    // ═══ PHASE 144: Concept mastery ═══
    getConceptMastery: () => {
      try {
        return postAnswerInsights.getConceptMastery();
      } catch (e) {
        return {};
      }
    },
    // ═══ PHASE 145: Weakness targets ═══
    getWeaknessTargets: () => {
      try {
        return postAnswerInsights.getWeaknessTargets();
      } catch (e) {
        return null;
      }
    },
    // ═══ PHASE 146: Spaced repetition ═══
    getSpacedRepetitionDue: () => {
      try {
        return postAnswerInsights.getSpacedRepetitionDue();
      } catch (e) {
        return null;
      }
    },
    // ═══ PHASE 148: Optimal play comparison ═══
    getOptimalPlayComparison: () => {
      try {
        return postAnswerInsights.getOptimalPlayComparison();
      } catch (e) {
        return null;
      }
    },
    // ═══ PHASE 149: Detailed session report ═══
    generateDetailedSessionReport: () => {
      try {
        return postAnswerInsights.generateDetailedSessionReport();
      } catch (e) {
        return null;
      }
    },
    // ═══ PHASE 151: Range grid data ═══
    generateRangeGridData: (handActions, nodeType) => {
      try {
        return postAnswerInsights.generateRangeGridData(handActions, nodeType);
      } catch (e) {
        return null;
      }
    },
    // ═══ PHASE 152: Action heatmap ═══
    generateActionHeatmap: () => {
      try {
        return postAnswerInsights.generateActionHeatmap();
      } catch (e) {
        return null;
      }
    },
    // ═══ PHASE 153: EV graph data ═══
    getEVGraphData: () => {
      try {
        return postAnswerInsights.getEVGraphData();
      } catch (e) {
        return [];
      }
    },
    // ═══ PHASE 158: Aggression factors ═══
    getAggressionFactors: () => {
      try {
        return postAnswerInsights.getAggressionFactors();
      } catch (e) {
        return {};
      }
    },
    // ═══ PHASE 159: Preflop stats ═══
    getPreflopStats: () => {
      try {
        return postAnswerInsights.getPreflopStats();
      } catch (e) {
        return null;
      }
    },
    // ═══ PHASE 160: Positional awareness ═══
    getPositionalAwarenessScore: () => {
      try {
        return postAnswerInsights.getPositionalAwarenessScore();
      } catch (e) {
        return null;
      }
    },
    // ═══ PHASE 178: Streak messages ═══
    getStreakMessage: (streak) => {
      try {
        return postAnswerInsights.getStreakMessage(streak);
      } catch (e) {
        return null;
      }
    },
    // ═══ PHASE 181-183: Quiz generators ═══
    generateTextureQuiz: (board) => {
      try {
        return postAnswerInsights.generateTextureQuiz(board);
      } catch (e) {
        return null;
      }
    },
    generateRangeQuiz: (position) => {
      try {
        return postAnswerInsights.generateRangeQuiz(position);
      } catch (e) {
        return null;
      }
    },
    generatePotOddsQuiz: () => {
      try {
        return postAnswerInsights.generatePotOddsQuiz();
      } catch (e) {
        return null;
      }
    },
    // ═══ PHASE 185: Frequency comparison ═══
    getFrequencyComparison: () => {
      try {
        return postAnswerInsights.getFrequencyComparison();
      } catch (e) {
        return null;
      }
    },
    // ═══ PHASE 187: Leak finder ═══
    generateLeakFinderReport: () => {
      try {
        return postAnswerInsights.generateLeakFinderReport();
      } catch (e) {
        return null;
      }
    },
    // ═══ PHASE 188: Timing analysis ═══
    getTimingAnalysis: () => {
      try {
        return postAnswerInsights.getTimingAnalysis();
      } catch (e) {
        return null;
      }
    },
    // ═══ PHASE 190: Hand history ═══
    getHandHistory: (filter) => {
      try {
        return filter
          ? postAnswerInsights.getFilteredHandHistory(filter)
          : postAnswerInsights.getHandHistory();
      } catch (e) {
        return [];
      }
    },
    // ═══ PHASE 191: Custom drills ═══
    createCustomDrill: (config) => {
      try {
        return postAnswerInsights.createCustomDrill(config);
      } catch (e) {
        return null;
      }
    },
    getCustomDrills: () => {
      try {
        return postAnswerInsights.getCustomDrills();
      } catch (e) {
        return [];
      }
    },
    // ═══ PHASE 192: Progressive level ═══
    getProgressiveLevel: () => {
      try {
        return postAnswerInsights.getProgressiveLevelDescription();
      } catch (e) {
        return null;
      }
    },
    // ═══ PHASE 196: Thought prompts ═══
    generateThoughtPrompts: (scenario, heroHand, board) => {
      try {
        return postAnswerInsights.generateThoughtPrompts(scenario, heroHand, board);
      } catch (e) {
        return [];
      }
    },
    // ═══ PHASE 198: Mental game ═══
    getMentalGameNote: () => {
      try {
        return postAnswerInsights.getMentalGameNote();
      } catch (e) {
        return null;
      }
    },
    // ═══ PHASE 200: Engine health ═══
    getEngineHealth: () => {
      try {
        return postAnswerInsights.getEngineHealth();
      } catch (e) {
        return null;
      }
    },
    resetSession: () => {
      try {
        postAnswerInsights.resetSession();
      } catch (e) {
        console.warn('[App] Handled exception:', e?.message || e);
      }
    },
    // ═══ PHASE 203: Board coverage ═══
    generateBoardCoverageData: (board, heroPos, isPFR) => {
      try {
        return postAnswerInsights.generateBoardCoverageData(board, heroPos, isPFR);
      } catch (e) {
        return null;
      }
    },
    // ═══ PHASE 204: Nut combos ═══
    countNutCombos: (board) => {
      try {
        return postAnswerInsights.countNutCombos(board);
      } catch (e) {
        return null;
      }
    },
    // ═══ PHASE 213: Action clusters ═══
    getActionClusters: () => {
      try {
        return postAnswerInsights.getActionClusters();
      } catch (e) {
        return null;
      }
    },
    // ═══ PHASE 214: Tagging ═══
    tagScenario: (handId, tag) => {
      try {
        postAnswerInsights.tagScenario(handId, tag);
      } catch (e) {
        console.warn('[App] Handled exception:', e?.message || e);
      }
    },
    getTaggedScenarios: (tag) => {
      try {
        return postAnswerInsights.getTaggedScenarios(tag);
      } catch (e) {
        return [];
      }
    },
    // ═══ PHASE 216: Explanation ratings ═══
    rateExplanation: (handId, rating, feedback) => {
      try {
        postAnswerInsights.rateExplanation(handId, rating, feedback);
      } catch (e) {
        console.warn('[App] Handled exception:', e?.message || e);
      }
    },
    // ═══ PHASE 218: Frequency-weighted scoring ═══
    calculateFrequencyWeightedScore: (chosen, handActions) => {
      try {
        return postAnswerInsights.calculateFrequencyWeightedScore(chosen, handActions);
      } catch (e) {
        return null;
      }
    },
    // ═══ PHASE 219: Challenge mode ═══
    initChallengeMode: (config) => {
      try {
        return postAnswerInsights.initChallengeMode(config);
      } catch (e) {
        return null;
      }
    },
    recordChallengeAnswer: (isCorrect, timeMs) => {
      try {
        return postAnswerInsights.recordChallengeAnswer(isCorrect, timeMs);
      } catch (e) {
        return null;
      }
    },
    getChallengeResults: () => {
      try {
        return postAnswerInsights.getChallengeResults();
      } catch (e) {
        return null;
      }
    },
    // ═══ PHASE 220: Achievements ═══
    checkAchievements: () => {
      try {
        return postAnswerInsights.checkAchievements();
      } catch (e) {
        return null;
      }
    },
    // ═══ PHASE 221-222: Concept tree & drill recommendations ═══
    getConceptDependencyTree: () => {
      try {
        return postAnswerInsights.getConceptDependencyTree();
      } catch (e) {
        return {};
      }
    },
    getRecommendedDrills: () => {
      try {
        return postAnswerInsights.getRecommendedDrills();
      } catch (e) {
        return [];
      }
    },
    // ═══ PHASE 224: Frequency balance ═══
    getExpectedFrequencyBalance: () => {
      try {
        return postAnswerInsights.getExpectedFrequencyBalance();
      } catch (e) {
        return null;
      }
    },
    // ═══ PHASE 225: Smart recap ═══
    generateSmartRecap: (qNum) => {
      try {
        return postAnswerInsights.generateSmartRecap(qNum);
      } catch (e) {
        return null;
      }
    },
    // ═══ PHASE 227: Cumulative deviation cost ═══
    getCumulativeDeviationCost: () => {
      try {
        return postAnswerInsights.getCumulativeDeviationCost();
      } catch (e) {
        return null;
      }
    },
    // ═══ PHASE 229: Runout simulation ═══
    simulateRunouts: (board, handStrength, street) => {
      try {
        return postAnswerInsights.simulateRunouts(board, handStrength, street);
      } catch (e) {
        return null;
      }
    },
    // ═══ PHASE 230: 3-bet defense matrix ═══
    get3BetDefenseMatrix: () => {
      try {
        return postAnswerInsights.get3BetDefenseMatrix();
      } catch (e) {
        return {};
      }
    },
    // ═══ PHASE 232: Sizing optimizer ═══
    recommendBetSizing: (handStrength, street, texture, pot, stack) => {
      try {
        return postAnswerInsights.recommendBetSizing(handStrength, street, texture, pot, stack);
      } catch (e) {
        return null;
      }
    },
    // ═══ PHASE 236: Draw equity ═══
    calculateDrawEquity: (handStrength, street) => {
      try {
        return postAnswerInsights.calculateDrawEquity(handStrength, street);
      } catch (e) {
        return null;
      }
    },
    // ═══ PHASE 237: Fold equity ═══
    calculateFoldEquity: (betSize, potSize) => {
      try {
        return postAnswerInsights.calculateFoldEquity(betSize, potSize);
      } catch (e) {
        return null;
      }
    },
    // ═══ PHASE 238: EV calculator ═══
    calculateActionEV: (action, equity, potSize, betSize, foldEquity) => {
      try {
        return postAnswerInsights.calculateActionEV(action, equity, potSize, betSize, foldEquity);
      } catch (e) {
        return null;
      }
    },
    // ═══ PHASE 239: Bluff ratio ═══
    calculateOptimalBluffRatio: (betSizePct) => {
      try {
        return postAnswerInsights.calculateOptimalBluffRatio(betSizePct);
      } catch (e) {
        return null;
      }
    },
    // ═══ PHASE 240: Leaderboard ═══
    getLeaderboardEntry: () => {
      try {
        return postAnswerInsights.getLeaderboardEntry();
      } catch (e) {
        return null;
      }
    },
    // ═══ PHASE 241: Training calendar ═══
    getTrainingCalendar: () => {
      try {
        return postAnswerInsights.getTrainingCalendar();
      } catch (e) {
        return {};
      }
    },
    getTrainingStreak: () => {
      try {
        return postAnswerInsights.getTrainingStreak();
      } catch (e) {
        return 0;
      }
    },
    // ═══ PHASE 244: Board texture classification ═══
    classifyBoardTexture: (board) => {
      try {
        return postAnswerInsights.classifyBoardTexture(board);
      } catch (e) {
        return null;
      }
    },
    // ═══ PHASE 245: Action tree ═══
    generateActionTree: (handActions, heroHand) => {
      try {
        return postAnswerInsights.generateActionTree(handActions, heroHand);
      } catch (e) {
        return null;
      }
    },
    // ═══ PHASE 246: Range vs range ═══
    getRangeVsRangeEquity: (heroRange, villainRange, boardType) => {
      try {
        return postAnswerInsights.getRangeVsRangeEquity(heroRange, villainRange, boardType);
      } catch (e) {
        return null;
      }
    },
    // ═══ PHASE 249: Tilt detection ═══
    detectTilt: () => {
      try {
        return postAnswerInsights.detectTilt();
      } catch (e) {
        return null;
      }
    },
    // ═══ PHASE 250: Training dashboard ═══
    getTrainingDashboard: () => {
      try {
        return postAnswerInsights.getTrainingDashboard();
      } catch (e) {
        return null;
      }
    },
    // ═══ PHASE 251: Structured explanation ═══
    structuredExplanation,
    // ═══ PHASE 254: Leak report ═══
    generateLeakReport: () => {
      try {
        return postAnswerInsights.generateLeakReport();
      } catch (e) {
        return { leaks: [], summary: '' };
      }
    },
    // ═══ PHASE 255: Session grade ═══
    getSessionGrade: () => {
      // 2026-07-19 AUDIT FIX (wave-1 E2E): the review screen graded via TWO
      // systems at once — this returned postAnswerInsights's internal grade
      // while other panels graded gtowScore, so one screen showed "C-" and
      // "D" simultaneously. Single source of truth: grade the GTOW score.
      try {
        const score = Number(gtowScoring.gtowScore) || 0;
        const GRADE_LABELS = {
          S: 'GTO Master', 'A+': 'Elite', A: 'Excellent', 'B+': 'Strong',
          B: 'Solid', 'C+': 'Developing', C: 'Learning', D: 'Struggling',
          F: 'Review Fundamentals',
        };
        const g = getScoreGrade(score);
        return { grade: g, label: GRADE_LABELS[g] || '', color: getScoreColor(score) };
      } catch (e) {
        return { grade: '-', label: 'N/A', color: '#64748b' };
      }
    },
    // ═══ PHASE 256: Spot difficulty ═══
    estimateSpotDifficulty: (frequencies, street, stackDepth, nodeType) => {
      try {
        return postAnswerInsights.estimateSpotDifficulty(
          frequencies,
          street,
          stackDepth,
          nodeType
        );
      } catch (e) {
        return { difficulty: 3, label: 'Intermediate' };
      }
    },
    // ═══ PHASE 257: Improvement velocity ═══
    getImprovementVelocity: () => {
      try {
        return postAnswerInsights.getImprovementVelocity();
      } catch (e) {
        return { velocity: 0, trend: 'INSUFFICIENT_DATA' };
      }
    },
    // ═══ PHASE 258: Drill prescription ═══
    prescribeDrills: () => {
      try {
        return postAnswerInsights.prescribeDrills();
      } catch (e) {
        return [];
      }
    },
    // ═══ PHASE 259: Frequency mastery ═══
    getFrequencyMasteryScore: () => {
      try {
        return postAnswerInsights.getFrequencyMasteryScore();
      } catch (e) {
        return { score: 0, label: 'No data' };
      }
    },
    // ═══ PHASE 260: Full session report ═══
    generateSessionReport: () => {
      try {
        return postAnswerInsights.generateSessionReport();
      } catch (e) {
        return null;
      }
    },
    // ═══ PHASE 261-270: Deep coaching intelligence ═══
    getTeachingPrinciple: (street, nodeType, correctAction, handStrength, texture) => {
      try {
        return postAnswerInsights.getTeachingPrinciple(
          street,
          nodeType,
          correctAction,
          handStrength,
          texture
        );
      } catch (e) {
        return null;
      }
    },
    getPositionReminder: (heroPosition, street, nodeType) => {
      try {
        return postAnswerInsights.getPositionReminder(heroPosition, street, nodeType);
      } catch (e) {
        return null;
      }
    },
    getTextureStrategyGuide: (texture, street, heroPosition, villainPosition) => {
      try {
        return postAnswerInsights.getTextureStrategyGuide(
          texture,
          street,
          heroPosition,
          villainPosition
        );
      } catch (e) {
        return null;
      }
    },
    getSPRStrategyGuide: (estimatedPot, stackDepth) => {
      try {
        return postAnswerInsights.getSPRStrategyGuide(estimatedPot, stackDepth);
      } catch (e) {
        return null;
      }
    },
    getVillainRangeNarration: (street, nodeType, villainActions) => {
      try {
        return postAnswerInsights.getVillainRangeNarration(street, nodeType, villainActions);
      } catch (e) {
        return null;
      }
    },
    getMultiStreetPlanningGuide: (
      street,
      handStrength,
      optimalAction,
      estimatedPot,
      stackDepth
    ) => {
      try {
        return postAnswerInsights.getMultiStreetPlanningGuide(
          street,
          handStrength,
          optimalAction,
          estimatedPot,
          stackDepth
        );
      } catch (e) {
        return null;
      }
    },
    getFrequencyCorrectionPrompt: () => {
      try {
        return postAnswerInsights.getFrequencyCorrectionPrompt();
      } catch (e) {
        return null;
      }
    },
    getTiltRecoveryAdvice: () => {
      try {
        return postAnswerInsights.getTiltRecoveryAdvice();
      } catch (e) {
        return null;
      }
    },
    getSessionPacingAnalysis: () => {
      try {
        return postAnswerInsights.getSessionPacingAnalysis();
      } catch (e) {
        return null;
      }
    },
    estimateSpotDifficultyEnhanced: (
      frequencies,
      street,
      stackDepth,
      nodeType,
      heroPosition,
      villainPosition,
      handStrength,
      texture
    ) => {
      try {
        return postAnswerInsights.estimateSpotDifficultyEnhanced(
          frequencies,
          street,
          stackDepth,
          nodeType,
          heroPosition,
          villainPosition,
          handStrength,
          texture
        );
      } catch (e) {
        return { difficulty: 3, label: 'Intermediate' };
      }
    },
    // ═══ PHASE 271-280: Advanced coaching + analytics ═══
    classifyHandStrength: (handCategory, boardTexture, street) => {
      try {
        return postAnswerInsights.classifyHandStrength(handCategory, boardTexture, street);
      } catch (e) {
        return null;
      }
    },
    estimateEquityVsRange: (handCategory, street, nodeType, heroPosition, villainPosition) => {
      try {
        return postAnswerInsights.estimateEquityVsRange(
          handCategory,
          street,
          nodeType,
          heroPosition,
          villainPosition
        );
      } catch (e) {
        return null;
      }
    },
    getActionEVComparison: (frequencies, correctAction, selectedAction) => {
      try {
        return postAnswerInsights.getActionEVComparison(
          frequencies,
          correctAction,
          selectedAction
        );
      } catch (e) {
        return null;
      }
    },
    getSolverLineComparison: (selectedAction, correctAction, frequencies, street, nodeType) => {
      try {
        return postAnswerInsights.getSolverLineComparison(
          selectedAction,
          correctAction,
          frequencies,
          street,
          nodeType
        );
      } catch (e) {
        return null;
      }
    },
    getConceptMasteryReport: () => {
      try {
        return postAnswerInsights.getConceptMasteryReport();
      } catch (e) {
        return { concepts: [], overallMastery: 0 };
      }
    },
    generateHints: (frequencies, street, nodeType, handCategory, heroPosition, texture) => {
      try {
        return postAnswerInsights.generateHints(
          frequencies,
          street,
          nodeType,
          handCategory,
          heroPosition,
          texture
        );
      } catch (e) {
        return { hints: [], currentLevel: 0, maxLevel: 0 };
      }
    },
    getRunoutImpactPreview: (handCategory, street, correctAction, boardTexture) => {
      try {
        return postAnswerInsights.getRunoutImpactPreview(
          handCategory,
          street,
          correctAction,
          boardTexture
        );
      } catch (e) {
        return null;
      }
    },
    getMixedFrequencyDrillData: () => {
      try {
        return postAnswerInsights.getMixedFrequencyDrillData();
      } catch (e) {
        return { mixedSpots: [], needsPractice: false };
      }
    },
    getHandCategoryBreakdown: () => {
      try {
        return postAnswerInsights.getHandCategoryBreakdown();
      } catch (e) {
        return { categories: [] };
      }
    },
    getSessionComparison: (previousSessionData) => {
      try {
        return postAnswerInsights.getSessionComparison(previousSessionData);
      } catch (e) {
        return null;
      }
    },
    // ═══ PHASE 281-290: Advanced analytics + coaching ═══
    getPreDecisionPreview: (handCategory, street, nodeType, heroPosition, frequencies) => {
      try {
        return postAnswerInsights.getPreDecisionPreview(
          handCategory,
          street,
          nodeType,
          heroPosition,
          frequencies
        );
      } catch (e) {
        return null;
      }
    },
    getRunningActionFrequencies: () => {
      try {
        return postAnswerInsights.getRunningActionFrequencies();
      } catch (e) {
        return null;
      }
    },
    getMistakeClusters: () => {
      try {
        return postAnswerInsights.getMistakeClusters();
      } catch (e) {
        return { clusters: [], totalMistakes: 0 };
      }
    },
    getBoardCoverageAnalysis: () => {
      try {
        return postAnswerInsights.getBoardCoverageAnalysis();
      } catch (e) {
        return null;
      }
    },
    getBluffToValueRatio: () => {
      try {
        return postAnswerInsights.getBluffToValueRatio();
      } catch (e) {
        return null;
      }
    },
    getEVLossHeatmap: () => {
      try {
        return postAnswerInsights.getEVLossHeatmap();
      } catch (e) {
        return null;
      }
    },
    getQuickFireReviewCards: () => {
      try {
        return postAnswerInsights.getQuickFireReviewCards();
      } catch (e) {
        return [];
      }
    },
    generateFrequencyQuizQuestion: () => {
      try {
        return postAnswerInsights.generateFrequencyQuizQuestion();
      } catch (e) {
        return null;
      }
    },
    getPositionLeaderboard: () => {
      try {
        return postAnswerInsights.getPositionLeaderboard();
      } catch (e) {
        return null;
      }
    },
    generateCoachingSummary: () => {
      try {
        return postAnswerInsights.generateCoachingSummary();
      } catch (e) {
        return { summary: '', tips: [] };
      }
    },

    // Phase 291-300: Advanced Training Intelligence II
    getStreakAnalysis: () => {
      try {
        return postAnswerInsights.getStreakAnalysis();
      } catch (e) {
        return null;
      }
    },
    getTimePressureAnalysis: () => {
      try {
        return postAnswerInsights.getTimePressureAnalysis();
      } catch (e) {
        return null;
      }
    },
    getRangeConstructionDrill: (position, nodeType) => {
      try {
        return postAnswerInsights.getRangeConstructionDrill(position, nodeType);
      } catch (e) {
        return null;
      }
    },
    getExploitativeAdjustments: () => {
      try {
        return postAnswerInsights.getExploitativeAdjustments();
      } catch (e) {
        return null;
      }
    },
    getICMPressureAnalysis: (stackSize, avgStack, playersLeft, payoutSpots) => {
      try {
        return postAnswerInsights.getICMPressureAnalysis(
          stackSize,
          avgStack,
          playersLeft,
          payoutSpots
        );
      } catch (e) {
        return null;
      }
    },
    getMultiGameTypeStats: () => {
      try {
        return postAnswerInsights.getMultiGameTypeStats();
      } catch (e) {
        return null;
      }
    },
    getBettingSizeAnalysis: () => {
      try {
        return postAnswerInsights.getBettingSizeAnalysis();
      } catch (e) {
        return null;
      }
    },
    getHandReadingDrill: (street, villainActions) => {
      try {
        return postAnswerInsights.getHandReadingDrill(street, villainActions);
      } catch (e) {
        return null;
      }
    },
    getVarianceSimulator: (winRate, sampleSize) => {
      try {
        return postAnswerInsights.getVarianceSimulator(winRate, sampleSize);
      } catch (e) {
        return null;
      }
    },
    getPerformanceTrendAnalysis: () => {
      try {
        return postAnswerInsights.getPerformanceTrendAnalysis();
      } catch (e) {
        return null;
      }
    },

    // Phase 301-310: Advanced Training Intelligence III
    getOptimalLineNarration: (
      correctAction,
      frequencies,
      street,
      nodeType,
      heroPosition,
      handCategory
    ) => {
      try {
        return postAnswerInsights.getOptimalLineNarration(
          correctAction,
          frequencies,
          street,
          nodeType,
          heroPosition,
          handCategory
        );
      } catch (e) {
        return null;
      }
    },
    getStreetTransitionAnalysis: () => {
      try {
        return postAnswerInsights.getStreetTransitionAnalysis();
      } catch (e) {
        return null;
      }
    },
    getDefenseFrequencyCheck: () => {
      try {
        return postAnswerInsights.getDefenseFrequencyCheck();
      } catch (e) {
        return null;
      }
    },
    getPolarizationIndex: () => {
      try {
        return postAnswerInsights.getPolarizationIndex();
      } catch (e) {
        return null;
      }
    },
    getMistakeRecoveryRate: () => {
      try {
        return postAnswerInsights.getMistakeRecoveryRate();
      } catch (e) {
        return null;
      }
    },
    getConceptQuiz: () => {
      try {
        return postAnswerInsights.getConceptQuiz();
      } catch (e) {
        return null;
      }
    },
    getSessionMilestones: () => {
      try {
        return postAnswerInsights.getSessionMilestones();
      } catch (e) {
        return [];
      }
    },
    getAdaptiveDrillRecommendation: () => {
      try {
        return postAnswerInsights.getAdaptiveDrillRecommendation();
      } catch (e) {
        return null;
      }
    },
    getCriticalHandHighlights: () => {
      try {
        return postAnswerInsights.getCriticalHandHighlights();
      } catch (e) {
        return null;
      }
    },
    getComprehensiveSessionReport: () => {
      try {
        return postAnswerInsights.getComprehensiveSessionReport();
      } catch (e) {
        return null;
      }
    },

    // Phase 311-320: Training Edge Features
    getNodeTypeBreakdown: () => {
      try {
        return postAnswerInsights.getNodeTypeBreakdown();
      } catch (e) {
        return null;
      }
    },
    getActionTimeline: () => {
      try {
        return postAnswerInsights.getActionTimeline();
      } catch (e) {
        return null;
      }
    },
    getStreetSpecificLeaks: () => {
      try {
        return postAnswerInsights.getStreetSpecificLeaks();
      } catch (e) {
        return null;
      }
    },
    getOverbetAnalysis: () => {
      try {
        return postAnswerInsights.getOverbetAnalysis();
      } catch (e) {
        return null;
      }
    },
    getCheckRaiseAnalysis: () => {
      try {
        return postAnswerInsights.getCheckRaiseAnalysis();
      } catch (e) {
        return null;
      }
    },
    getCBetAnalysis: () => {
      try {
        return postAnswerInsights.getCBetAnalysis();
      } catch (e) {
        return null;
      }
    },
    getPositionPairAnalysis: () => {
      try {
        return postAnswerInsights.getPositionPairAnalysis();
      } catch (e) {
        return null;
      }
    },
    getFrequencyConvergenceTracker: () => {
      try {
        return postAnswerInsights.getFrequencyConvergenceTracker();
      } catch (e) {
        return null;
      }
    },
    getSmartSessionLength: () => {
      try {
        return postAnswerInsights.getSmartSessionLength();
      } catch (e) {
        return null;
      }
    },
    getTrainingPlan: () => {
      try {
        return postAnswerInsights.getTrainingPlan();
      } catch (e) {
        return null;
      }
    },

    // Phase 321-330: Polish & Competitive Edge
    getHandStrengthDistribution: () => {
      try {
        return postAnswerInsights.getHandStrengthDistribution();
      } catch (e) {
        return null;
      }
    },
    getAggressionProfile: () => {
      try {
        return postAnswerInsights.getAggressionProfile();
      } catch (e) {
        return null;
      }
    },
    getWinRateByHandCategory: () => {
      try {
        return postAnswerInsights.getWinRateByHandCategory();
      } catch (e) {
        return null;
      }
    },
    getTightLooseProfile: () => {
      try {
        return postAnswerInsights.getTightLooseProfile();
      } catch (e) {
        return null;
      }
    },
    getBluffSpotAnalysis: () => {
      try {
        return postAnswerInsights.getBluffSpotAnalysis();
      } catch (e) {
        return null;
      }
    },
    getValueBetAnalysis: () => {
      try {
        return postAnswerInsights.getValueBetAnalysis();
      } catch (e) {
        return null;
      }
    },
    getSessionSummaryCard: () => {
      try {
        return postAnswerInsights.getSessionSummaryCard();
      } catch (e) {
        return null;
      }
    },
    getDifficultyProgression: () => {
      try {
        return postAnswerInsights.getDifficultyProgression();
      } catch (e) {
        return null;
      }
    },
    getWeaknessHeatmap: () => {
      try {
        return postAnswerInsights.getWeaknessHeatmap();
      } catch (e) {
        return null;
      }
    },
    getGTOComplianceScore: () => {
      try {
        return postAnswerInsights.getGTOComplianceScore();
      } catch (e) {
        return null;
      }
    },

    // Phase 331-340: Ultimate Training Intelligence
    getRangeBalanceScore: () => {
      try {
        return postAnswerInsights.getRangeBalanceScore();
      } catch (e) {
        return null;
      }
    },
    getCheckBackAnalysis: () => {
      try {
        return postAnswerInsights.getCheckBackAnalysis();
      } catch (e) {
        return null;
      }
    },
    getDonkBetAnalysis: () => {
      try {
        return postAnswerInsights.getDonkBetAnalysis();
      } catch (e) {
        return null;
      }
    },
    getMultiWayPotAnalysis: () => {
      try {
        return postAnswerInsights.getMultiWayPotAnalysis();
      } catch (e) {
        return null;
      }
    },
    getThinValueFrequency: () => {
      try {
        return postAnswerInsights.getThinValueFrequency();
      } catch (e) {
        return null;
      }
    },
    getProtectionBetAnalysis: () => {
      try {
        return postAnswerInsights.getProtectionBetAnalysis();
      } catch (e) {
        return null;
      }
    },
    getShowdownAnalysis: () => {
      try {
        return postAnswerInsights.getShowdownAnalysis();
      } catch (e) {
        return null;
      }
    },
    getRiverDecisionQuality: () => {
      try {
        return postAnswerInsights.getRiverDecisionQuality();
      } catch (e) {
        return null;
      }
    },
    getPreFlopLeaks: () => {
      try {
        return postAnswerInsights.getPreFlopLeaks();
      } catch (e) {
        return null;
      }
    },
    getSessionProgressionChart: () => {
      try {
        return postAnswerInsights.getSessionProgressionChart();
      } catch (e) {
        return null;
      }
    },

    // Phase 341-350: Mastery & Deep Analysis
    getEquityRealizationAnalysis: () => {
      try {
        return postAnswerInsights.getEquityRealizationAnalysis();
      } catch (e) {
        return null;
      }
    },
    getPotControlAnalysis: () => {
      try {
        return postAnswerInsights.getPotControlAnalysis();
      } catch (e) {
        return null;
      }
    },
    getBoardTextureQuiz: () => {
      try {
        return postAnswerInsights.getBoardTextureQuiz();
      } catch (e) {
        return null;
      }
    },
    getStackDepthStrategy: (effectiveStack) => {
      try {
        return postAnswerInsights.getStackDepthStrategy(effectiveStack);
      } catch (e) {
        return null;
      }
    },
    getMixedStrategyAccuracy: () => {
      try {
        return postAnswerInsights.getMixedStrategyAccuracy();
      } catch (e) {
        return null;
      }
    },
    getEndgameReport: () => {
      try {
        return postAnswerInsights.getEndgameReport();
      } catch (e) {
        return null;
      }
    },
    getPlaystyleEvolution: () => {
      try {
        return postAnswerInsights.getPlaystyleEvolution();
      } catch (e) {
        return null;
      }
    },
    getKeyConceptReminders: (street, nodeType, heroPosition) => {
      try {
        return postAnswerInsights.getKeyConceptReminders(street, nodeType, heroPosition);
      } catch (e) {
        return null;
      }
    },
    getNextSessionPrep: () => {
      try {
        return postAnswerInsights.getNextSessionPrep();
      } catch (e) {
        return null;
      }
    },
    getUltimatePlayerRating: () => {
      try {
        return postAnswerInsights.getUltimatePlayerRating();
      } catch (e) {
        return null;
      }
    },

    // Phase 356: Post-session game tree. Until it has an authenticated report
    // endpoint this compatibility callback returns no browser-authored tree.
    buildDetailedGameTree: (spotData, heroHand, heroPosition, villainPosition, street) => {
      try {
        return postAnswerInsights.buildDetailedGameTree(
          spotData,
          heroHand,
          heroPosition,
          villainPosition,
          street
        );
      } catch (e) {
        return null;
      }
    },

    // Actions
    submitAnswer,
    nextQuestion,
    retryAnswerPersistence,
    startNextLevel,
    retryLevel,
    retrainMistakes,
    resetGame,
  };
}
