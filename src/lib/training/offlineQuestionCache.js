import { idbDelete, idbGet, idbSet } from '../idbCacheStore.js';
import { normalizeTrainingDifficultyMode } from './difficultyQuestionContract.mjs';

const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const RECEIPT_EXPIRY_SAFETY_MS = 60 * 1000;
export const OFFLINE_QUESTION_CACHE_VERSION = 3;

export function createOfflineQuestionCacheContract({
  difficulty = 'standard',
  gameMode = 'full',
  handSelection = 'all',
  targetStreet = null,
} = {}) {
  const safeMode = ['full', 'spot', 'street'].includes(String(gameMode).toLowerCase())
    ? String(gameMode).toLowerCase()
    : 'full';
  const safeSelection = String(handSelection || 'all')
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '')
    .slice(0, 40) || 'all';
  const safeStreet = safeMode === 'street'
    ? String(targetStreet || '').toLowerCase().replace(/[^a-z]/g, '').slice(0, 12) || 'any'
    : 'any';
  return [
    `difficulty=${normalizeTrainingDifficultyMode(difficulty)}`,
    `mode=${safeMode}`,
    `selection=${safeSelection}`,
    `street=${safeStreet}`,
  ].join('&');
}

const DEFAULT_CACHE_CONTRACT = createOfflineQuestionCacheContract();

function normalizeCacheContract(value) {
  const contract = String(value || DEFAULT_CACHE_CONTRACT).slice(0, 240);
  return contract || DEFAULT_CACHE_CONTRACT;
}

function questionsMatchCacheContract(questions, contract) {
  const difficulty = new URLSearchParams(normalizeCacheContract(contract)).get('difficulty');
  return Boolean(difficulty) && questions.every((question) => (
    String(question?._gradingContext?.difficultyMode || '') === difficulty
  ));
}

function hasCompleteOfflineGradingContext(question) {
  const context = question?._gradingContext;
  return Boolean(
    question?.id
    && context?.receipt
    && context?.submissionId
    && context?.sessionId
    && context?.attemptId
    && context?.snapshotKey
    && context?.sessionKind
    && context?.difficultyMode
    && Number.isInteger(Number(context?.sessionTargetHands))
    && Number(context.sessionTargetHands) > 0
    && Number.isInteger(Number(context?.handOrdinal))
    && Number(context.handOrdinal) > 0
    && Number(context.handOrdinal) <= Number(context.sessionTargetHands)
    && Number.isInteger(Number(context?.decisionOrdinal))
    && Number(context.decisionOrdinal) > 0
    && typeof context?.countsTowardCompletion === 'boolean'
    && typeof context?.practiceOnly === 'boolean'
  );
}

export function getOfflineQuestionCacheTtl(questions, now = Date.now()) {
  if (!Array.isArray(questions) || questions.length === 0) return 0;
  if (!questions.every(hasCompleteOfflineGradingContext)) return 0;
  const firstContext = questions[0]._gradingContext;
  const oneAttempt = questions.every((question) => (
    String(question._gradingContext.sessionId) === String(firstContext.sessionId)
    && String(question._gradingContext.attemptId) === String(firstContext.attemptId)
    && String(question._gradingContext.sessionKind) === String(firstContext.sessionKind)
    && String(question._gradingContext.difficultyMode) === String(firstContext.difficultyMode)
    && Boolean(question._gradingContext.practiceOnly) === Boolean(firstContext.practiceOnly)
    && Number(question._gradingContext.sessionTargetHands) === Number(firstContext.sessionTargetHands)
    && Number(question._gradingContext.decisionOrdinal) === 1
    && question._gradingContext.countsTowardCompletion === true
  ));
  const uniqueQuestionIds = new Set(questions.map((question) => String(question.id))).size;
  const uniqueSubmissionIds = new Set(
    questions.map((question) => String(question._gradingContext.submissionId)),
  ).size;
  const uniqueSnapshotKeys = new Set(
    questions.map((question) => String(question._gradingContext.snapshotKey)),
  ).size;
  const targetHands = Number(firstContext.sessionTargetHands);
  const ordinals = new Set(
    questions.map((question) => Number(question._gradingContext.handOrdinal)),
  );
  const completeAttempt = questions.length === targetHands
    && ordinals.size === targetHands
    && Array.from({ length: targetHands }, (_, index) => index + 1)
      .every((ordinal) => ordinals.has(ordinal));
  if (
    !oneAttempt
    || !completeAttempt
    || uniqueQuestionIds !== questions.length
    || uniqueSubmissionIds !== questions.length
    || uniqueSnapshotKeys !== questions.length
    || Boolean(firstContext.practiceOnly) !== (firstContext.sessionKind === 'replay')
  ) return 0;
  const expiries = questions.map((question) => Date.parse(question?._gradingContext?.expiresAt || ''));
  if (expiries.some((expiresAt) => !Number.isFinite(expiresAt))) return 0;
  const receiptTtl = Math.min(...expiries) - Number(now) - RECEIPT_EXPIRY_SAFETY_MS;
  return Math.max(0, Math.min(CACHE_TTL_MS, receiptTtl));
}

export function offlineQuestionCacheKey(
  gameId,
  level,
  userId,
  deliveryContract = DEFAULT_CACHE_CONTRACT,
) {
  const subject = encodeURIComponent(String(userId || ''));
  const contract = encodeURIComponent(normalizeCacheContract(deliveryContract));
  return `training_questions:v${OFFLINE_QUESTION_CACHE_VERSION}:${subject}:${gameId}:L${Math.max(1, Math.min(12, Number(level) || 1))}:${contract}`;
}

export async function getOfflineQuestions(
  gameId,
  level,
  userId,
  deliveryContract = DEFAULT_CACHE_CONTRACT,
) {
  if (!gameId || !userId) return [];
  const contract = normalizeCacheContract(deliveryContract);
  const cached = await idbGet(offlineQuestionCacheKey(gameId, level, userId, contract));
  if (
    !cached
    || cached.version !== OFFLINE_QUESTION_CACHE_VERSION
    || cached.gameId !== gameId
    || String(cached.userId || '') !== String(userId)
    || Number(cached.level) !== Number(level)
    || String(cached.deliveryContract || '') !== contract
  ) return [];
  const questions = Array.isArray(cached.questions) ? cached.questions.filter(Boolean) : [];
  return getOfflineQuestionCacheTtl(questions) > 0
    && questionsMatchCacheContract(questions, contract)
    ? questions
    : [];
}

export async function setOfflineQuestions(
  gameId,
  level,
  questions,
  userId,
  deliveryContract = DEFAULT_CACHE_CONTRACT,
) {
  if (!gameId || !userId || !Array.isArray(questions) || questions.length === 0) return false;
  const contract = normalizeCacheContract(deliveryContract);
  const ttlMs = getOfflineQuestionCacheTtl(questions);
  if (ttlMs <= 0 || !questionsMatchCacheContract(questions, contract)) return false;
  const key = offlineQuestionCacheKey(gameId, level, userId, contract);
  await idbSet(
    key,
    {
      version: OFFLINE_QUESTION_CACHE_VERSION,
      userId: String(userId),
      gameId,
      level: Number(level),
      deliveryContract: contract,
      savedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + ttlMs).toISOString(),
      questions,
    },
    ttlMs,
  );
  const persisted = await idbGet(key);
  return Boolean(
    persisted
    && persisted.version === OFFLINE_QUESTION_CACHE_VERSION
    && String(persisted.userId || '') === String(userId)
    && persisted.gameId === gameId
    && Number(persisted.level) === Number(level)
    && String(persisted.deliveryContract || '') === contract
    && Array.isArray(persisted.questions)
    && persisted.questions.length === questions.length
  );
}

export async function deleteOfflineQuestions(
  gameId,
  level,
  userId,
  deliveryContract = DEFAULT_CACHE_CONTRACT,
) {
  if (!gameId || !userId) return;
  await idbDelete(offlineQuestionCacheKey(gameId, level, userId, deliveryContract));
}

export async function consumeOfflineQuestion(
  gameId,
  level,
  questionId,
  userId,
  deliveryContract = DEFAULT_CACHE_CONTRACT,
) {
  if (!gameId || !questionId || !userId) return false;
  const questions = await getOfflineQuestions(gameId, level, userId, deliveryContract);
  if (questions.length === 0) return false;
  const remaining = questions.filter((question) => String(question?.id || '') !== String(questionId));
  if (remaining.length === questions.length) return false;
  // A signed campaign attempt is immutable and its target never shrinks. A
  // partial pack cannot be resumed safely after reload because the browser no
  // longer owns the already-answered ordinals or their authoritative score.
  // Remove the entire pack after its first persisted decision; a reconnect
  // starts a fresh complete attempt instead of misrepresenting 19/20 as 19/19.
  await deleteOfflineQuestions(gameId, level, userId, deliveryContract);
  return true;
}

export function estimateQuestionBytes(questions) {
  try {
    return new Blob([JSON.stringify(questions || [])]).size;
  } catch {
    return JSON.stringify(questions || []).length;
  }
}
