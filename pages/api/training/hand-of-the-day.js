import { getServerUserWithFallback } from '../../../src/lib/serverAuth';

import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { withTiming } from '../../../src/utils/trainingApiUtils';
import { reportApiError } from '../../../src/lib/apiErrorHandler';
import { getTodayCST } from '../../../src/lib/trivia/getTodayCST';
import {
  enforceTrainingQuestionContract,
  isTrainingQuestionValid,
} from '../../../src/lib/training/questionContract.mjs';
import { toPublicTrainingQuestion } from '../../../src/lib/training/gradingReceipt.mjs';
import { applyDifficultyToQuestion } from '../../../src/lib/training/difficultyQuestionContract.mjs';
import {
  buildTrainingQuestionSnapshot,
  isTrainingAttemptContractError,
  isTrainingQuestionCampaignEligible,
  prepareTrainingAttemptDelivery,
  recordTrainingQuestionsServedForAttempt,
} from '../../../src/lib/training/trainingAttemptDelivery.mjs';
import {
  isTrainingPersistenceUnavailable,
  runTrainingPersistenceQuery,
  trainingPersistenceUnavailableBody,
} from '../../../src/lib/training/trainingPersistence.mjs';
import {
  cacheRowIsServingEligible,
  withPersistedCacheReceipt,
} from '../../../src/lib/training/cacheTruthPersistence.mjs';

const DAILY_GAME_ID = 'daily-challenge';
const DAILY_LEVEL = 1;
const DAILY_ENGINE_TYPES = Object.freeze(['PIO', 'CHART']);
const CANDIDATE_BATCH_SIZE = 64;
const RECOVERY_PAGE_SIZE = 16;
const RECOVERY_MAX_PAGES = 4;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

let _supabase = null;
function getSupabase() {
  if (!_supabase) {
    _supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
    );
  }
  return _supabase;
}

function dateHash(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function tomorrowAtChicagoMidnight(today) {
  const cursor = new Date(`${today}T12:00:00Z`);
  cursor.setUTCDate(cursor.getUTCDate() + 1);
  const tomorrow = cursor.toISOString().slice(0, 10);

  // America/Chicago midnight is always 05:00Z or 06:00Z. Resolve the exact
  // instant by asking Intl which candidate formats as the requested local day.
  for (const hour of [5, 6]) {
    const candidate = new Date(`${tomorrow}T${String(hour).padStart(2, '0')}:00:00Z`);
    const localParts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Chicago',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      hour12: false,
    }).formatToParts(candidate);
    const part = (type) => localParts.find((entry) => entry.type === type)?.value;
    const localDate = `${part('year')}-${part('month')}-${part('day')}`;
    if (localDate === tomorrow && ['00', '24'].includes(part('hour'))) {
      return candidate.toISOString();
    }
  }

  // Fail closed to the later candidate if an unexpected Intl implementation
  // cannot identify local midnight. This never expires a challenge early.
  return new Date(`${tomorrow}T06:00:00Z`).toISOString();
}

function canonicalizeCandidate(row) {
  if (!cacheRowIsServingEligible(row)) return null;
  let question;
  try {
    question = withPersistedCacheReceipt(row.question_data, row);
  } catch {
    return null;
  }
  question.id = String(row.question_id || question.id || '').slice(0, 180);
  if (!question.id) return null;
  question = enforceTrainingQuestionContract(question);
  return isTrainingQuestionValid(question) && isTrainingQuestionCampaignEligible(question)
    ? { row, question }
    : null;
}

async function readCandidateRange(start, end) {
  return runTrainingPersistenceQuery(
    () => getSupabase()
      .from('training_question_cache')
      .select('question_data, question_id, game_id, engine_type, question_kind, level, canonical_policy, source_classification, quality_status, policy_version, policy_checksum')
      .in('question_kind', DAILY_ENGINE_TYPES)
      .in('quality_status', ['active', 'active_fallback'])
      .order('question_id', { ascending: true })
      .range(start, end),
    { label: 'DailyChallenge:candidate-read' },
  );
}

/**
 * Pick the first contract-valid row in a stable circular ordering seeded by
 * the Chicago product date. An invalid cache row can never make the daily
 * challenge leak, disappear, or silently fall back to an invented question.
 */
async function selectDailyCanonicalQuestion(today) {
  const countResult = await runTrainingPersistenceQuery(
    () => getSupabase()
      .from('training_question_cache')
      .select('question_id', { count: 'exact', head: true })
      .in('question_kind', DAILY_ENGINE_TYPES)
      .in('quality_status', ['active', 'active_fallback']),
    { label: 'DailyChallenge:candidate-count' },
  );
  const count = Number(countResult.count || 0);
  if (!Number.isInteger(count) || count < 1) return null;

  const initialOffset = dateHash(today) % count;
  let scanned = 0;
  while (scanned < count) {
    const start = (initialOffset + scanned) % count;
    const remainingBeforeWrap = count - start;
    const take = Math.min(CANDIDATE_BATCH_SIZE, count - scanned, remainingBeforeWrap);
    const result = await readCandidateRange(start, start + take - 1);
    const rows = Array.isArray(result.data) ? result.data : [];
    for (const row of rows) {
      const candidate = canonicalizeCandidate(row);
      if (candidate) return candidate;
    }
    // A short page means the cache changed during selection. Retrying would no
    // longer be deterministic for this request, so fail closed.
    if (rows.length !== take) return null;
    scanned += take;
  }
  return null;
}

function sealedDailyCandidate(seal, snapshot) {
  if (
    !seal
    || !snapshot
    || String(seal.snapshot_key || '') !== String(snapshot.snapshot_key || '')
    || String(seal.source_question_id || '') !== String(snapshot.source_question_id || '')
    || String(snapshot.game_id || '') !== DAILY_GAME_ID
    || Number(snapshot.level) !== DAILY_LEVEL
    || String(snapshot.question_data?.id || '') !== String(seal.source_question_id || '')
    || String(snapshot.question_data?.policyChecksum || '').toLowerCase()
      !== String(seal.source_policy_checksum || '').toLowerCase()
  ) {
    return null;
  }

  let rebuilt;
  try {
    rebuilt = buildTrainingQuestionSnapshot({
      canonicalQuestion: snapshot.question_data,
      gameId: DAILY_GAME_ID,
      level: DAILY_LEVEL,
    });
  } catch {
    return null;
  }
  if (
    rebuilt.snapshot_key !== snapshot.snapshot_key
    || rebuilt.content_digest !== snapshot.content_digest
    || !isTrainingQuestionCampaignEligible(snapshot.question_data)
  ) {
    return null;
  }

  return {
    snapshotKey: snapshot.snapshot_key,
    row: {
      question_id: seal.source_question_id,
      policy_checksum: seal.source_policy_checksum,
    },
    question: snapshot.question_data,
  };
}

async function readSealedDailyQuestion(dailyId) {
  const sealResult = await runTrainingPersistenceQuery(
    () => getSupabase()
      .from('training_daily_question_seals')
      .select('daily_id, snapshot_key, source_question_id, source_policy_checksum')
      .eq('daily_id', dailyId)
      .maybeSingle(),
    { label: 'DailyChallenge:seal-read' },
  );
  const seal = sealResult.data;
  if (!seal) return null;

  const snapshotResult = await runTrainingPersistenceQuery(
    () => getSupabase()
      .from('training_question_snapshots')
      .select('snapshot_key, source_question_id, game_id, level, content_digest, question_data')
      .eq('snapshot_key', seal.snapshot_key)
      .maybeSingle(),
    { label: 'DailyChallenge:sealed-snapshot-read' },
  );
  return sealedDailyCandidate(seal, snapshotResult.data) || {
    integrityCode: 'TRAINING_DAILY_SNAPSHOT_BINDING_MISMATCH',
  };
}

async function dailyQuestionHasConflict(dailyId) {
  const result = await runTrainingPersistenceQuery(
    () => getSupabase()
      .from('training_daily_question_conflicts')
      .select('attempt_id')
      .eq('daily_id', dailyId)
      .limit(1)
      .maybeSingle(),
    { label: 'DailyChallenge:current-conflict-read' },
  );
  return Boolean(result.data?.attempt_id);
}

async function sealDailyCanonicalQuestion(dailyId, candidate) {
  const snapshot = buildTrainingQuestionSnapshot({
    canonicalQuestion: candidate.question,
    gameId: DAILY_GAME_ID,
    level: DAILY_LEVEL,
  });
  await runTrainingPersistenceQuery(
    () => getSupabase()
      .from('training_question_snapshots')
      .upsert([snapshot], {
        onConflict: 'snapshot_key',
        ignoreDuplicates: true,
        defaultToNull: false,
      }),
    { label: 'DailyChallenge:sealed-snapshot-write' },
  );
  await runTrainingPersistenceQuery(
    () => getSupabase()
      .from('training_daily_question_seals')
      .upsert([{
        daily_id: dailyId,
        snapshot_key: snapshot.snapshot_key,
        source_question_id: candidate.row.question_id,
        source_policy_checksum: candidate.row.policy_checksum,
      }], {
        onConflict: 'daily_id',
        ignoreDuplicates: true,
        defaultToNull: false,
      }),
    { label: 'DailyChallenge:seal-write' },
  );

  // The insert is intentionally first-writer-wins. Always read the winner
  // back instead of assuming this request's candidate won a concurrent race.
  return readSealedDailyQuestion(dailyId);
}

/**
 * Resolve the globally sealed question for one product day. Mutable cache
 * count/order is consulted only when a day has never been sealed; every later
 * user reads the same immutable Training snapshot.
 */
async function getOrCreateSealedDailyQuestion(today, dailyId) {
  if (await dailyQuestionHasConflict(dailyId)) {
    return { integrityCode: 'TRAINING_DAILY_SNAPSHOT_CONFLICT' };
  }
  const existing = await readSealedDailyQuestion(dailyId);
  if (existing) return existing;

  const candidate = await selectDailyCanonicalQuestion(today);
  if (!candidate) return null;
  return sealDailyCanonicalQuestion(dailyId, candidate);
}

function optionText(options, answerId) {
  const match = (Array.isArray(options) ? options : []).find(
    (option) => String(option?.id ?? option) === String(answerId || ''),
  );
  return String(match?.text ?? match ?? answerId ?? '');
}

function postCompletionFeedback(canonicalQuestion, answer) {
  if (!canonicalQuestion || !answer) return null;
  const correctAnswer = String(canonicalQuestion.correctAnswer || '');
  if (!correctAnswer) return null;
  const solverVerified = answer.solver_verified === true;
  const evLossMeasured = solverVerified
    && answer.ev_loss_measured === true
    && Number.isFinite(Number(answer.ev_loss));
  return {
    correctAnswer,
    correctAnswerText: String(
      canonicalQuestion.correctAnswerText
      || optionText(canonicalQuestion.options, correctAnswer),
    ),
    explanation: String(canonicalQuestion.explanation || ''),
    structuredExplanation: canonicalQuestion.structuredExplanation || null,
    gtoFrequencies: solverVerified ? (canonicalQuestion.gtoFrequencies || null) : null,
    frequencies: solverVerified ? (canonicalQuestion.frequencies || null) : null,
    rawFrequencies: solverVerified ? (canonicalQuestion.rawFrequencies || null) : null,
    evData: solverVerified ? (canonicalQuestion.evData || null) : null,
    actionEVs: solverVerified ? (canonicalQuestion.actionEVs || null) : null,
    solverVerified,
    evLossMeasured,
    evLoss: evLossMeasured ? Number(answer.ev_loss) : null,
    dataQuality: canonicalQuestion.dataQuality || null,
  };
}

async function readDailyRows(userId, dailyId) {
  const [currentResult, historyResult] = await Promise.all([
    runTrainingPersistenceQuery(
      () => getSupabase()
        .from('training_daily_challenge')
        .select('daily_id, score, ev_loss, selected_action, completed_at, attempt_id')
        .eq('user_id', userId)
        .eq('daily_id', dailyId)
        .maybeSingle(),
      { label: 'DailyChallenge:current-completion-read' },
    ),
    runTrainingPersistenceQuery(
      () => getSupabase()
        .from('training_daily_challenge')
        .select('daily_id, attempt_id, completed_at')
        .eq('user_id', userId)
        .like('daily_id', 'daily-%')
        .order('completed_at', { ascending: false })
        .limit(365),
      { label: 'DailyChallenge:completion-history-read' },
    ),
  ]);
  const current = currentResult.data;
  const rows = Array.isArray(historyResult.data) ? historyResult.data : [];
  return {
    row: current?.daily_id === dailyId
      && UUID_RE.test(String(current.attempt_id || ''))
      ? current
      : null,
    // Legacy browser-authored rows without a sealed attempt are deliberately
    // excluded from streak/progress truth.
    completedDays: rows
      .filter((candidate) => UUID_RE.test(String(candidate.attempt_id || '')))
      .map((candidate) => String(candidate.daily_id).replace(/^daily-/, '')),
  };
}

async function readDailyAttemptIntegrity(attempt, snapshotKey) {
  if (!attempt?.id || !attempt?.client_nonce || !snapshotKey) {
    return { ok: false, code: 'TRAINING_DAILY_SNAPSHOT_BINDING_MISMATCH' };
  }
  const [conflictResult, sealResult] = await Promise.all([
    runTrainingPersistenceQuery(
      () => getSupabase()
        .from('training_daily_question_conflicts')
        .select('attempt_id, daily_id')
        .eq('daily_id', attempt.client_nonce)
        .limit(1)
        .maybeSingle(),
      { label: 'DailyChallenge:attempt-conflict-read' },
    ),
    runTrainingPersistenceQuery(
      () => getSupabase()
        .from('training_daily_question_seals')
        .select('daily_id, snapshot_key, source_question_id, source_policy_checksum')
        .eq('daily_id', attempt.client_nonce)
        .maybeSingle(),
      { label: 'DailyChallenge:attempt-seal-read' },
    ),
  ]);
  if (conflictResult.data?.daily_id === attempt.client_nonce) {
    return { ok: false, code: 'TRAINING_DAILY_SNAPSHOT_CONFLICT' };
  }
  if (!sealResult.data
      || String(sealResult.data.snapshot_key || '') !== String(snapshotKey)
      || String(sealResult.data.daily_id || '') !== String(attempt.client_nonce)) {
    return { ok: false, code: 'TRAINING_DAILY_SNAPSHOT_BINDING_MISMATCH' };
  }
  return { ok: true, code: null, seal: sealResult.data };
}

async function readAttemptEvidence(attempt) {
  if (!attempt?.id) return null;
  const handResult = await runTrainingPersistenceQuery(
    () => getSupabase()
      .from('training_attempt_hands')
      .select('snapshot_key')
      .eq('attempt_id', attempt.id)
      .eq('hand_ordinal', 1)
      .maybeSingle(),
    { label: 'DailyChallenge:hand-read' },
  );
  const snapshotKey = handResult.data?.snapshot_key;
  const integrity = await readDailyAttemptIntegrity(attempt, snapshotKey);
  if (!integrity.ok) {
    return {
      attempt,
      answer: null,
      question: null,
      feedback: null,
      integrityCode: integrity.code,
    };
  }
  const answerResult = await runTrainingPersistenceQuery(
    () => getSupabase()
      .from('training_answers')
      .select('answer_id, is_correct, solver_verified, ev_loss, ev_loss_measured, answered_at, snapshot_key')
      .eq('attempt_id', attempt.id)
      .eq('hand_ordinal', 1)
      .eq('decision_ordinal', 1)
      .maybeSingle(),
    { label: 'DailyChallenge:answer-read' },
  );
  const snapshotResult = snapshotKey
    ? await runTrainingPersistenceQuery(
      () => getSupabase()
        .from('training_question_snapshots')
        .select('snapshot_key, source_question_id, game_id, level, content_digest, question_data')
        .eq('snapshot_key', snapshotKey)
        .maybeSingle(),
      { label: 'DailyChallenge:snapshot-read' },
    )
    : { data: null };
  // A matching foreign key is not sufficient evidence that the stored body is
  // still the body named by the daily seal. Rebuild the content-addressed
  // snapshot on every completed/pending replay, just as the midnight recovery
  // path does, and fail closed on any source, policy, or digest drift.
  const sealed = sealedDailyCandidate(integrity.seal, snapshotResult.data);
  if (!sealed) {
    return {
      attempt,
      answer: null,
      question: null,
      feedback: null,
      integrityCode: 'TRAINING_DAILY_SNAPSHOT_BINDING_MISMATCH',
    };
  }
  const canonicalQuestion = sealed.question;
  const servedQuestion = canonicalQuestion
    ? applyDifficultyToQuestion(canonicalQuestion, attempt.difficulty || 'standard')
    : null;
  const answer = answerResult.data
    && String(answerResult.data.snapshot_key) === String(snapshotKey)
    && typeof answerResult.data.is_correct === 'boolean'
    ? answerResult.data
    : null;

  return {
    attempt,
    answer,
    question: servedQuestion ? toPublicTrainingQuestion(servedQuestion) : null,
    feedback: postCompletionFeedback(servedQuestion, answer),
  };
}

async function readCompletedAttempt(userId, row) {
  if (!row?.attempt_id) return null;
  const attemptResult = await runTrainingPersistenceQuery(
    () => getSupabase()
      .from('training_attempts')
      .select('id, user_id, client_nonce, game_id, level, session_kind, difficulty, status, expected_hands, answered_hands, correct_hands, accuracy_percentage, reward_diamonds, completed_at')
      .eq('id', row.attempt_id)
      .eq('user_id', userId)
      .eq('game_id', DAILY_GAME_ID)
      .eq('session_kind', 'daily')
      .eq('status', 'completed')
      .maybeSingle(),
    { label: 'DailyChallenge:attempt-read' },
  );
  const attempt = attemptResult.data;
  if (!attempt?.id || attempt.client_nonce !== row.daily_id || Number(attempt.expected_hands) !== 1) {
    return null;
  }
  const evidence = await readAttemptEvidence(attempt);
  if (evidence?.integrityCode) return evidence;
  // A completion is an identity-bound historical record, not merely a set of
  // aggregate counters. Never substitute today's candidate when any part of
  // the completed hand's snapshot/answer/feedback chain is unavailable.
  if (!evidence?.question || !evidence?.answer || !evidence?.feedback) return null;
  const answeredHands = Number(attempt.answered_hands);
  const correctHands = Number(attempt.correct_hands);
  const storedAccuracy = attempt.accuracy_percentage === null
    || attempt.accuracy_percentage === undefined
    || attempt.accuracy_percentage === ''
    ? null
    : Number(attempt.accuracy_percentage);
  const score = Number.isFinite(storedAccuracy)
    ? storedAccuracy
    : Number.isInteger(answeredHands) && answeredHands > 0
      && Number.isInteger(correctHands) && correctHands >= 0 && correctHands <= answeredHands
      ? Math.round((correctHands / answeredHands) * 100)
      : typeof evidence.answer?.is_correct === 'boolean'
        ? (evidence.answer.is_correct ? 100 : 0)
        : null;
  if (score === null) return null;
  return {
    ...evidence,
    completion: {
      attemptId: attempt.id,
      selectedAction: evidence.answer?.answer_id || row.selected_action || null,
      isCorrect: typeof evidence.answer?.is_correct === 'boolean' ? evidence.answer.is_correct : null,
      score,
      evLoss: evidence.answer?.ev_loss_measured ? Number(evidence.answer.ev_loss || 0) : null,
      diamondsEarned: Number(attempt.reward_diamonds || 0),
      completedAt: attempt.completed_at || row.completed_at || null,
    },
  };
}

async function readPendingScoredAttempt(userId, dailyId) {
  const attemptResult = await runTrainingPersistenceQuery(
    () => getSupabase()
      .from('training_attempts')
      .select('id, user_id, client_nonce, game_id, level, session_kind, difficulty, status, expected_hands, expires_at')
      .eq('user_id', userId)
      .eq('client_nonce', dailyId)
      .eq('game_id', DAILY_GAME_ID)
      .eq('level', DAILY_LEVEL)
      .eq('session_kind', 'daily')
      .eq('status', 'open')
      .maybeSingle(),
    { label: 'DailyChallenge:pending-attempt-read' },
  );
  const attempt = attemptResult.data;
  if (
    !attempt?.id
    || Number(attempt.expected_hands) !== 1
    || Date.parse(attempt.expires_at || '') <= Date.now()
  ) {
    return null;
  }
  const evidence = await readAttemptEvidence(attempt);
  if (evidence?.integrityCode) return evidence;
  return evidence?.answer && evidence?.feedback ? evidence : null;
}

function chicagoProductDate(value) {
  const instant = new Date(value);
  if (!Number.isFinite(instant.getTime())) return null;
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Chicago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(instant);
  const part = (type) => parts.find((entry) => entry.type === type)?.value;
  const date = `${part('year')}-${part('month')}-${part('day')}`;
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null;
}

/**
 * Find a previous product day's answer that was durably scored while its
 * sealed attempt is still open. This runs before today's hand is minted, so a
 * Chicago-midnight boundary cannot hide the only attempt that still needs its
 * idempotent completion transaction.
 */
async function readRecoverablePriorScoredAttempt(userId, currentDailyId) {
  let cursor = null;
  const nowIso = new Date().toISOString();

  for (let page = 0; page < RECOVERY_MAX_PAGES; page += 1) {
    const attemptResult = await runTrainingPersistenceQuery(
      () => {
        let query = getSupabase()
          .from('training_attempts')
          .select(
            'id, user_id, client_nonce, game_id, level, session_kind, difficulty, status, expected_hands, started_at, expires_at',
            { count: 'exact' },
          )
          .eq('user_id', userId)
          .eq('game_id', DAILY_GAME_ID)
          .eq('level', DAILY_LEVEL)
          .eq('session_kind', 'daily')
          .eq('status', 'open')
          .neq('client_nonce', currentDailyId)
          .gt('expires_at', nowIso);
        if (cursor) {
          query = query.or(
            `started_at.lt.${cursor.startedAt},and(started_at.eq.${cursor.startedAt},id.lt.${cursor.id})`,
          );
        }
        return query
          .order('started_at', { ascending: false })
          .order('id', { ascending: false })
          .limit(RECOVERY_PAGE_SIZE + 1);
      },
      { label: 'DailyChallenge:prior-pending-attempt-read' },
    );

    const fetched = Array.isArray(attemptResult.data) ? attemptResult.data : [];
    const reportedRemaining = attemptResult.count;
    const countKnown = Number.isInteger(reportedRemaining) && reportedRemaining >= 0;
    // The query deliberately asks for one sentinel row beyond the page. When
    // PostgREST cannot return an exact count, only that sentinel proves another
    // page exists; a full final page by itself is still complete.
    const hasMore = fetched.length > RECOVERY_PAGE_SIZE
      || (countKnown && reportedRemaining > fetched.length);
    const attempts = fetched.slice(0, RECOVERY_PAGE_SIZE);
    const eligibleAttempts = attempts.filter((attempt) => {
      const startedProductDate = chicagoProductDate(attempt.started_at);
      return attempt?.id
        && Number(attempt.expected_hands) === 1
        && startedProductDate
        && attempt.client_nonce === `daily-${startedProductDate}`
        && Date.parse(attempt.expires_at || '') > Date.now();
    });

    if (eligibleAttempts.length > 0) {
      const attemptIds = eligibleAttempts.map((attempt) => attempt.id);
      const dailyIds = [...new Set(eligibleAttempts.map((attempt) => attempt.client_nonce))];
      const [handsResult, answersResult, conflictsResult, sealsResult] = await Promise.all([
        runTrainingPersistenceQuery(
          () => getSupabase()
            .from('training_attempt_hands')
            .select('attempt_id, snapshot_key')
            .in('attempt_id', attemptIds)
            .eq('hand_ordinal', 1),
          { label: 'DailyChallenge:prior-pending-hands-read' },
        ),
        runTrainingPersistenceQuery(
          () => getSupabase()
            .from('training_answers')
            .select('attempt_id, answer_id, is_correct, solver_verified, ev_loss, ev_loss_measured, answered_at, snapshot_key')
            .in('attempt_id', attemptIds)
            .eq('hand_ordinal', 1)
            .eq('decision_ordinal', 1),
          { label: 'DailyChallenge:prior-pending-answers-read' },
        ),
        runTrainingPersistenceQuery(
          () => getSupabase()
            .from('training_daily_question_conflicts')
            .select('attempt_id, daily_id')
            .in('daily_id', dailyIds),
          { label: 'DailyChallenge:prior-pending-conflicts-read' },
        ),
        runTrainingPersistenceQuery(
          () => getSupabase()
            .from('training_daily_question_seals')
            .select('daily_id, snapshot_key, source_question_id, source_policy_checksum')
            .in('daily_id', dailyIds),
          { label: 'DailyChallenge:prior-pending-seals-read' },
        ),
      ]);
      const hands = new Map(
        (handsResult.data || []).map((row) => [String(row.attempt_id), row]),
      );
      const answers = new Map(
        (answersResult.data || []).map((row) => [String(row.attempt_id), row]),
      );
      const conflictDailyIds = new Set(
        (conflictsResult.data || []).map((row) => String(row.daily_id)),
      );
      const seals = new Map(
        (sealsResult.data || []).map((row) => [String(row.daily_id), row]),
      );
      const snapshotKeys = [...new Set(
        [...hands.values()].map((hand) => hand.snapshot_key).filter(Boolean),
      )];
      const snapshotResult = snapshotKeys.length > 0
        ? await runTrainingPersistenceQuery(
          () => getSupabase()
            .from('training_question_snapshots')
            .select('snapshot_key, source_question_id, game_id, level, content_digest, question_data')
            .in('snapshot_key', snapshotKeys),
          { label: 'DailyChallenge:prior-pending-snapshots-read' },
        )
        : { data: [] };
      const snapshots = new Map(
        (snapshotResult.data || []).map((row) => [String(row.snapshot_key), row]),
      );

      for (const attempt of eligibleAttempts) {
        const hand = hands.get(String(attempt.id));
        const answer = answers.get(String(attempt.id));
        if (conflictDailyIds.has(String(attempt.client_nonce))) {
          return {
            evidence: null,
            conflict: true,
            incomplete: false,
            integrityCode: 'TRAINING_DAILY_SNAPSHOT_CONFLICT',
          };
        }
        const seal = seals.get(String(attempt.client_nonce));
        if (!answer) continue;
        if (!hand?.snapshot_key
          || String(answer.snapshot_key || '') !== String(hand.snapshot_key)
          || !seal
          || String(seal.snapshot_key || '') !== String(hand.snapshot_key)) {
          return {
            evidence: null,
            conflict: false,
            incomplete: false,
            integrityCode: 'TRAINING_DAILY_SNAPSHOT_BINDING_MISMATCH',
          };
        }
        const snapshot = snapshots.get(String(hand.snapshot_key));
        const sealed = sealedDailyCandidate(seal, snapshot);
        if (!sealed || typeof answer.is_correct !== 'boolean') {
          return {
            evidence: null,
            conflict: false,
            incomplete: false,
            integrityCode: 'TRAINING_DAILY_SNAPSHOT_BINDING_MISMATCH',
          };
        }
        const canonicalQuestion = sealed.question;
        const servedQuestion = canonicalQuestion
          ? applyDifficultyToQuestion(canonicalQuestion, attempt.difficulty || 'standard')
          : null;
        const feedback = postCompletionFeedback(servedQuestion, answer);
        if (!servedQuestion || !feedback) {
          return {
            evidence: null,
            conflict: false,
            incomplete: false,
            integrityCode: 'TRAINING_DAILY_SNAPSHOT_BINDING_MISMATCH',
          };
        }
        const evidence = {
          attempt,
          answer,
          question: toPublicTrainingQuestion(servedQuestion),
          feedback,
        };
        return { evidence, conflict: false, incomplete: false, integrityCode: null };
      }
    }

    if (!hasMore) return {
      evidence: null,
      conflict: false,
      incomplete: false,
      integrityCode: null,
    };
    const tail = attempts[attempts.length - 1];
    if (!tail?.started_at || !tail?.id) {
      return { evidence: null, conflict: false, incomplete: true, integrityCode: null };
    }
    cursor = { startedAt: tail.started_at, id: tail.id };
  }

  return { evidence: null, conflict: false, incomplete: true, integrityCode: null };
}

function failureStatus(error) {
  return Number.isInteger(error?.status) ? error.status : 409;
}

export default async function handler(req, res) {
  try {
    withTiming(res);
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('Vary', 'Authorization');

    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET');
      return res.status(405).json({ success: false, error: 'Method not allowed' });
    }
    if (!applyRateLimit(req, res, LIMITS.read)) return;

    const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
    if (!token) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }
    const { user, error: authError } = await getServerUserWithFallback(req, getSupabase());
    if (authError || !user?.id) {
      return res.status(401).json({ success: false, error: 'Invalid token' });
    }

    try {
      const today = getTodayCST();
      const dailyId = `daily-${today}`;
      const dailyState = await readDailyRows(user.id, dailyId);
      const persisted = dailyState.row
        ? await readCompletedAttempt(user.id, dailyState.row)
        : null;

      if (persisted?.integrityCode) {
        return res.status(503).json({
          success: false,
          code: persisted.integrityCode,
          error: persisted.integrityCode === 'TRAINING_DAILY_SNAPSHOT_CONFLICT'
            ? 'This Daily Challenge has conflicting sealed evidence. Please contact support.'
            : 'The completed Daily Challenge does not match its immutable daily seal.',
          retryable: persisted.integrityCode !== 'TRAINING_DAILY_SNAPSHOT_CONFLICT',
        });
      }

      if (dailyState.row && !persisted) {
        return res.status(503).json({
          success: false,
          code: 'TRAINING_DAILY_COMPLETION_INTEGRITY_UNAVAILABLE',
          error: 'The completed Daily Challenge evidence is temporarily unavailable. Please retry.',
          retryable: true,
        });
      }

      if (persisted) {
        return res.status(200).json({
          success: true,
          dailyId,
          question: persisted.question,
          completion: persisted.completion,
          feedback: persisted.feedback,
          completionPending: false,
          completedDays: dailyState.completedDays,
          expiresAt: tomorrowAtChicagoMidnight(today),
        });
      }

      // A record-question write can commit before the separate completion RPC
      // experiences a transport failure. Restore that durable verdict without
      // reissuing a receipt or asking the player to submit the hand again.
      const pending = await readPendingScoredAttempt(user.id, dailyId);
      if (pending?.integrityCode) {
        return res.status(503).json({
          success: false,
          code: pending.integrityCode,
          error: pending.integrityCode === 'TRAINING_DAILY_SNAPSHOT_CONFLICT'
            ? 'This Daily Challenge has conflicting sealed evidence. Please contact support.'
            : 'This Daily Challenge attempt does not match its immutable daily seal.',
          retryable: pending.integrityCode !== 'TRAINING_DAILY_SNAPSHOT_CONFLICT',
        });
      }
      if (pending) {
        return res.status(200).json({
          success: true,
          dailyId,
          question: pending.question,
          completion: null,
          completionPending: true,
          persistedAnswer: {
            attemptId: pending.attempt.id,
            selectedAction: pending.answer.answer_id,
            isCorrect: pending.answer.is_correct,
          },
          feedback: pending.feedback,
          completedDays: dailyState.completedDays,
          expiresAt: tomorrowAtChicagoMidnight(today),
        });
      }

      const priorRecovery = await readRecoverablePriorScoredAttempt(user.id, dailyId);
      if (priorRecovery.integrityCode || priorRecovery.incomplete) {
        const integrityConflict = priorRecovery.integrityCode === 'TRAINING_DAILY_SNAPSHOT_CONFLICT';
        return res.status(503).json({
          success: false,
          code: priorRecovery.integrityCode || 'TRAINING_DAILY_RECOVERY_SCAN_INCOMPLETE',
          error: integrityConflict
            ? 'A prior Daily Challenge has conflicting sealed evidence. Please contact support.'
            : priorRecovery.integrityCode
              ? 'A prior Daily Challenge does not match its immutable daily seal.'
              : 'Prior Daily Challenge recovery could not be completed safely. Please retry.',
          retryable: !integrityConflict,
        });
      }
      const priorPending = priorRecovery.evidence;
      if (priorPending) {
        return res.status(200).json({
          success: true,
          dailyId: priorPending.attempt.client_nonce,
          question: priorPending.question,
          completion: null,
          completionPending: true,
          persistedAnswer: {
            attemptId: priorPending.attempt.id,
            selectedAction: priorPending.answer.answer_id,
            isCorrect: priorPending.answer.is_correct,
          },
          feedback: priorPending.feedback,
          completedDays: dailyState.completedDays,
          expiresAt: priorPending.attempt.expires_at,
        });
      }

      const candidate = await getOrCreateSealedDailyQuestion(today, dailyId);
      if (candidate?.integrityCode) {
        return res.status(503).json({
          success: false,
          code: candidate.integrityCode,
          error: candidate.integrityCode === 'TRAINING_DAILY_SNAPSHOT_CONFLICT'
            ? 'Today’s Daily Challenge has conflicting sealed evidence. Please contact support.'
            : 'Today’s sealed Daily Challenge could not be verified. Please retry.',
          retryable: candidate.integrityCode !== 'TRAINING_DAILY_SNAPSHOT_CONFLICT',
        });
      }
      if (!candidate) {
        return res.status(503).json({
          success: false,
          code: 'TRAINING_DAILY_QUESTION_UNAVAILABLE',
          error: 'Today\u2019s canonical Daily Challenge is temporarily unavailable.',
        });
      }

      let delivery;
      try {
        delivery = await prepareTrainingAttemptDelivery({
          supabase: getSupabase(),
          userId: user.id,
          clientSessionId: dailyId,
          gameId: DAILY_GAME_ID,
          level: DAILY_LEVEL,
          sessionKind: 'daily',
          difficultyMode: 'standard',
          requestedHands: 1,
          questions: [candidate.question],
          handOrdinalStart: 1,
          requireFullAttempt: true,
          config: {
            dailyId,
          },
        });
      } catch (deliveryError) {
        if (isTrainingAttemptContractError(deliveryError)) {
          return res.status(failureStatus(deliveryError)).json({
            success: false,
            code: deliveryError.code,
            error: deliveryError.message,
          });
        }
        throw deliveryError;
      }

      const deliveredQuestion = delivery.questions[0];
      if (
        !deliveredQuestion
        || String(deliveredQuestion?._gradingContext?.snapshotKey || '') !== candidate.snapshotKey
      ) {
        return res.status(503).json({
          success: false,
          code: 'TRAINING_DAILY_SNAPSHOT_BINDING_MISMATCH',
          error: 'Today\u2019s sealed Daily Challenge could not be verified. Please retry.',
          retryable: true,
        });
      }

      try {
        await recordTrainingQuestionsServedForAttempt(getSupabase(), {
          userId: user.id,
          delivery,
        });
      } catch (receiptError) {
        console.warn('[HandOfTheDay] Refusing to serve an unreceipted attempt hand:', receiptError?.message || receiptError);
        return res.status(503).json(trainingPersistenceUnavailableBody());
      }

      return res.status(200).json({
        success: true,
        dailyId,
        question: deliveredQuestion,
        completion: null,
        completionPending: false,
        feedback: null,
        completedDays: dailyState.completedDays,
        expiresAt: tomorrowAtChicagoMidnight(today),
      });
    } catch (error) {
      console.warn('[HandOfTheDay] Error:', error?.message || error);
      if (isTrainingPersistenceUnavailable(error)) {
        return res.status(503).json(trainingPersistenceUnavailableBody());
      }
      return res.status(500).json({ success: false, error: 'Internal server error' });
    }
  } catch (error) {
    try {
      reportApiError(error, req);
    } catch (reportingError) {
      const reportingMessage = reportingError?.message || reportingError;
      console.warn('[HandOfTheDay] Error reporting failed:', reportingMessage);
    }
    console.warn('[HandOfTheDay] Unhandled error:', error?.message || error);
    if (!res.headersSent) {
      return res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }
}
