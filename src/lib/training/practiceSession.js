import { authedFetch } from '../authUtils';

const SAFE_TOOL_ID = /^[a-z0-9][a-z0-9_-]{0,79}$/i;
let fallbackRecordCounter = 0;

function finiteNumber(value) {
  if (value === null || value === undefined || value === '' || typeof value === 'boolean') {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function boundedInteger(value, { min = 0, max = 100000 } = {}) {
  const parsed = finiteNumber(value);
  if (parsed === null) return null;
  return Math.min(max, Math.max(min, Math.round(parsed)));
}

function boundedNumber(value, { min = -1000000, max = 1000000 } = {}) {
  const parsed = finiteNumber(value);
  if (parsed === null) return null;
  return Math.min(max, Math.max(min, parsed));
}

function boundedText(value, maxLength) {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized ? normalized.slice(0, maxLength) : null;
}

function sanitizeContext(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const safe = {};
  for (const [key, candidate] of Object.entries(value).slice(0, 20)) {
    if (!/^[a-z0-9_-]{1,40}$/i.test(key)) continue;
    if (typeof candidate === 'boolean') safe[key] = candidate;
    else if (typeof candidate === 'string') safe[key] = candidate.slice(0, 160);
    else if (Number.isFinite(Number(candidate))) safe[key] = Number(candidate);
  }
  return Object.keys(safe).length > 0 ? safe : null;
}

function firstDefined(source, keys) {
  for (const key of keys) {
    if (source[key] !== undefined && source[key] !== null) return source[key];
  }
  return null;
}

/**
 * Normalize a legacy or specialty-tool score into an explicitly unverified
 * practice record. These records are deliberately isolated from
 * training_sessions, progress, mastery, leaderboards, achievements, and
 * Diamond rewards. They are useful as user-owned activity notes only.
 */
export function normalizePracticeSummary(toolId, rawSummary = {}) {
  if (!SAFE_TOOL_ID.test(String(toolId || ''))) {
    throw new TypeError('A valid Training practice tool id is required');
  }
  const summary = rawSummary && typeof rawSummary === 'object' && !Array.isArray(rawSummary)
    ? rawSummary
    : {};
  const handsPlayed = boundedInteger(firstDefined(summary, [
    'handsPlayed', 'hands_played', 'questionsAnswered', 'totalQuestions',
    'total_questions', 'totalHands',
  ]));
  const correctAnswers = boundedInteger(firstDefined(summary, [
    'correctCount', 'correct_answers', 'questionsCorrect', 'correctAnswers',
  ]), { max: handsPlayed ?? 100000 });
  const reportedAccuracy = boundedInteger(firstDefined(summary, [
    'accuracy', 'gtowScore', 'solverAccuracy', 'score',
  ]), { max: 100 });
  const derivedAccuracy = handsPlayed > 0 && correctAnswers !== null
    ? Math.round((correctAnswers / handsPlayed) * 100)
    : null;

  return {
    authority: 'client_reported_unverified',
    practiceOnly: true,
    affectsAuthoritativeProgress: false,
    eligibleForRewards: false,
    gameId: boundedText(firstDefined(summary, ['gameId', 'game_id']), 100) || toolId,
    title: boundedText(firstDefined(summary, ['gameName', 'title']), 180),
    handsPlayed,
    correctAnswers,
    reportedAccuracy,
    derivedAccuracy,
    reportedEVLoss: boundedNumber(firstDefined(summary, [
      'totalEVLoss', 'total_ev_loss', 'measuredEVLoss',
    ])),
    reportedPassed: typeof firstDefined(summary, ['levelPassed', 'passed']) === 'boolean'
      ? firstDefined(summary, ['levelPassed', 'passed'])
      : null,
    level: boundedInteger(firstDefined(summary, ['level', 'currentLevel']), { min: 1, max: 100 }),
    context: sanitizeContext(firstDefined(summary, ['context', 'trainerConfig'])),
    recordedAt: new Date().toISOString(),
  };
}

export function createPracticeRecordKey() {
  const uuid = globalThis.crypto?.randomUUID?.();
  if (uuid) return `practice:${uuid}`;
  fallbackRecordCounter += 1;
  return `practice:${Date.now().toString(36)}:${fallbackRecordCounter.toString(36)}`;
}

export async function savePracticeSession(toolId, summary, { recordKey } = {}) {
  const normalized = normalizePracticeSummary(toolId, summary);
  const resolvedRecordKey = boundedText(recordKey, 160) || createPracticeRecordKey();
  const response = await authedFetch('/api/training/tool-records', {
    method: 'POST',
    body: JSON.stringify({
      toolId,
      recordType: 'practice_session',
      recordKey: resolvedRecordKey,
      data: normalized,
    }),
  });
  if (!response.ok) {
    throw new Error(`Practice session save failed (${response.status})`);
  }
  const body = await response.json();
  if (body?.success !== true || !body?.record) {
    throw new Error('Practice session save returned an invalid response');
  }
  return body.record;
}
