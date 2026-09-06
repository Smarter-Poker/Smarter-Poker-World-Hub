import { idbDelete, idbGet, idbSet } from '../idbCacheStore';

const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
// Version 2 invalidates packs written before the solver source-trust boundary.
// Those packs can contain questions derived from the legacy V1 `f` channel,
// which is not a Fold probability. Only questions fetched after the boundary
// shipped may be served while the browser is offline.
export const OFFLINE_QUESTION_CACHE_VERSION = 2;

export function offlineQuestionCacheKey(gameId, level) {
  return `training_questions:${gameId}:L${Math.max(1, Math.min(12, Number(level) || 1))}`;
}

export async function getOfflineQuestions(gameId, level) {
  const cached = await idbGet(offlineQuestionCacheKey(gameId, level));
  if (!cached
    || cached.version !== OFFLINE_QUESTION_CACHE_VERSION
    || cached.gameId !== gameId
    || Number(cached.level) !== Number(level)) return [];
  return Array.isArray(cached.questions) ? cached.questions.filter(Boolean) : [];
}

export async function setOfflineQuestions(gameId, level, questions) {
  if (!gameId || !Array.isArray(questions) || questions.length === 0) return false;
  await idbSet(
    offlineQuestionCacheKey(gameId, level),
    {
      version: OFFLINE_QUESTION_CACHE_VERSION,
      gameId,
      level: Number(level),
      savedAt: new Date().toISOString(),
      questions,
    },
    CACHE_TTL_MS,
  );
  return true;
}

export async function deleteOfflineQuestions(gameId, level) {
  await idbDelete(offlineQuestionCacheKey(gameId, level));
}

export function estimateQuestionBytes(questions) {
  try {
    return new Blob([JSON.stringify(questions || [])]).size;
  } catch {
    return JSON.stringify(questions || []).length;
  }
}
