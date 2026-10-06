export const ACHIEVEMENT_CONTRACT = 'trivia-achievements/2';
export const ACHIEVEMENT_VERSION = 2;

const ACHIEVEMENT_ID_RE = /^[a-z0-9_]{2,64}$/;
const STATES = new Set(['locked', 'eligible', 'awarded', 'error']);

function nonnegativeInteger(value, fallback = 0) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 0) return fallback;
  return number;
}

function nullableText(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export function sanitizeAchievementId(value) {
  if (typeof value !== 'string') return null;
  const id = value.trim();
  return ACHIEVEMENT_ID_RE.test(id) ? id : null;
}

/**
 * Fail-closed DTO boundary for the achievement UI. In particular, database
 * reward metadata never becomes a displayed balance claim: diamonds and
 * receipt identifiers survive only when the authority marks the item awarded.
 */
export function normalizeAchievementItem(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new TypeError('invalid achievement item');
  }
  const id = sanitizeAchievementId(raw.id);
  if (!id) throw new TypeError('invalid achievement id');

  const state = typeof raw.state === 'string' ? raw.state : '';
  if (!STATES.has(state)) throw new TypeError('invalid achievement state');

  const version = Number(raw.version);
  if (version !== ACHIEVEMENT_VERSION) throw new TypeError('invalid achievement version');

  const progressTarget = nonnegativeInteger(raw.progressTarget);
  const progressCurrent = nonnegativeInteger(raw.progressCurrent);
  const isAwarded = state === 'awarded';
  const settledDiamonds = isAwarded ? nonnegativeInteger(raw.settledDiamonds, -1) : null;
  const receiptId = isAwarded ? nullableText(raw.receiptId) : null;
  const journalId = isAwarded ? nullableText(raw.journalId) : null;
  const transactionId = isAwarded ? nullableText(raw.transactionId) : null;

  if (isAwarded && (settledDiamonds <= 0 || !receiptId || !journalId || !transactionId)) {
    throw new TypeError('awarded achievement is missing its settled receipt');
  }

  return {
    id,
    version,
    title: String(raw.title || '').trim(),
    description: String(raw.description || '').trim(),
    category: String(raw.category || '').trim(),
    rarity: String(raw.rarity || '').trim(),
    criteria: raw.criteria && typeof raw.criteria === 'object' && !Array.isArray(raw.criteria)
      ? raw.criteria
      : {},
    state,
    progressCurrent,
    progressTarget,
    awardedAt: isAwarded ? nullableText(raw.awardedAt) : null,
    settledDiamonds,
    receiptId,
    journalId,
    transactionId,
    errorCode: state === 'error' ? nullableText(raw.errorCode) || 'award_receipt_inconsistent' : null,
  };
}

export function normalizeAchievementSnapshot(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new TypeError('invalid achievement snapshot');
  }
  if (raw.contract !== ACHIEVEMENT_CONTRACT || Number(raw.version) !== ACHIEVEMENT_VERSION) {
    throw new TypeError('invalid achievement contract');
  }
  if (!Array.isArray(raw.items)) throw new TypeError('invalid achievement items');
  return {
    contract: ACHIEVEMENT_CONTRACT,
    version: ACHIEVEMENT_VERSION,
    generatedAt: nullableText(raw.generatedAt),
    items: raw.items.map(normalizeAchievementItem),
  };
}

export function achievementErrorStatus(code) {
  switch (code) {
    case 'authentication_required': return 401;
    case 'invalid_achievement_id': return 400;
    case 'achievement_not_found': return 404;
    case 'not_eligible': return 409;
    case 'idempotency_conflict': return 409;
    case 'retryable_conflict': return 503;
    case 'award_failed': return 503;
    default: return 500;
  }
}
