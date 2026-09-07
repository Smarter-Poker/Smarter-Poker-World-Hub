const SESSION_KINDS = new Set(['campaign', 'custom', 'daily', 'replay']);
const CUSTOM_TARGETS = new Set([10, 25, 50, 100]);

export class TrainingSessionAttemptContractError extends Error {
  constructor(message, code = 'TRAINING_SESSION_ATTEMPT_INVALID', status = 400) {
    super(message);
    this.name = 'TrainingSessionAttemptContractError';
    this.code = code;
    this.status = status;
  }
}

function integer(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : null;
}

export function trainingMasteryMinimum(level) {
  const safeLevel = Math.min(12, Math.max(1, integer(level) || 1));
  if (safeLevel === 12) return 30;
  if (safeLevel === 11) return 25;
  return 20;
}

export function normalizeTrainingSessionKind(value, fallback = 'campaign') {
  const candidate = String(value || '').trim().toLowerCase();
  if (SESSION_KINDS.has(candidate)) return candidate;
  const safeFallback = String(fallback || '').trim().toLowerCase();
  return SESSION_KINDS.has(safeFallback) ? safeFallback : 'campaign';
}

/**
 * Resolve the immutable number of hands owned by one signed attempt.
 * Campaign counts come from the 12-level mastery contract, custom counts are
 * the four values exposed by the trainer, Daily Challenge is exactly one
 * server-selected hand, and replay is explicitly practice only. Callers may
 * request fewer rows at a time for recovery, but that never changes the
 * attempt target embedded in each receipt.
 */
export function resolveTrainingSessionTarget({ level, sessionKind = 'campaign', requestedHands } = {}) {
  const kind = normalizeTrainingSessionKind(sessionKind);
  if (kind === 'campaign') return trainingMasteryMinimum(level);
  if (kind === 'daily') {
    if (integer(requestedHands) !== 1) {
      throw new TrainingSessionAttemptContractError(
        'Daily Challenge attempts must contain exactly one hand.',
        'TRAINING_DAILY_HAND_COUNT_INVALID',
      );
    }
    return 1;
  }

  const requested = integer(requestedHands);
  if (kind === 'custom') {
    if (!CUSTOM_TARGETS.has(requested)) {
      throw new TrainingSessionAttemptContractError(
        'Custom Training sessions must contain 10, 25, 50, or 100 hands.',
        'TRAINING_CUSTOM_HAND_COUNT_INVALID',
      );
    }
    return requested;
  }

  if (!requested || requested < 1 || requested > 100) {
    throw new TrainingSessionAttemptContractError(
      'Mistake replay must contain 1 to 100 hands.',
      'TRAINING_REPLAY_HAND_COUNT_INVALID',
    );
  }
  return requested;
}

/** Validate the signed per-hand contract shared by delivery, answer storage,
 * and atomic completion. */
export function normalizeTrainingAttemptReceiptFields({
  level,
  sessionKind = 'campaign',
  sessionTargetHands,
  handOrdinal,
  decisionOrdinal = 1,
  countsTowardCompletion = true,
  practiceOnly,
} = {}) {
  const kind = normalizeTrainingSessionKind(sessionKind);
  const target = integer(sessionTargetHands);
  const hand = integer(handOrdinal);
  const decision = integer(decisionOrdinal);
  const expectedPractice = kind === 'replay';

  if (!target || target < 1 || target > 100) {
    throw new TrainingSessionAttemptContractError('The signed session target is invalid.');
  }
  if (!hand || hand < 1 || hand > target) {
    throw new TrainingSessionAttemptContractError('The signed hand ordinal is invalid.');
  }
  if (!decision || decision < 1 || decision > 8) {
    throw new TrainingSessionAttemptContractError('The signed decision ordinal is invalid.');
  }
  if (Boolean(countsTowardCompletion) !== (decision === 1)) {
    throw new TrainingSessionAttemptContractError(
      'Only the first decision in a hand may count toward session completion.',
      'TRAINING_SESSION_DECISION_COUNT_INVALID',
    );
  }
  if (practiceOnly !== undefined && Boolean(practiceOnly) !== expectedPractice) {
    throw new TrainingSessionAttemptContractError(
      'The practice flag does not match the signed session kind.',
      'TRAINING_SESSION_PRACTICE_FLAG_INVALID',
    );
  }
  if (kind === 'campaign' && target !== trainingMasteryMinimum(level)) {
    throw new TrainingSessionAttemptContractError(
      'The campaign hand target does not match the selected level.',
      'TRAINING_CAMPAIGN_HAND_COUNT_INVALID',
    );
  }
  if (kind === 'custom' && !CUSTOM_TARGETS.has(target)) {
    throw new TrainingSessionAttemptContractError(
      'The custom hand target is not supported.',
      'TRAINING_CUSTOM_HAND_COUNT_INVALID',
    );
  }
  if (kind === 'daily' && target !== 1) {
    throw new TrainingSessionAttemptContractError(
      'The Daily Challenge hand target must be one.',
      'TRAINING_DAILY_HAND_COUNT_INVALID',
    );
  }

  return Object.freeze({
    sessionKind: kind,
    sessionTargetHands: target,
    handOrdinal: hand,
    decisionOrdinal: decision,
    countsTowardCompletion: decision === 1,
    practiceOnly: expectedPractice,
  });
}

export const trainingSessionAttemptContract = Object.freeze({
  sessionKinds: Object.freeze([...SESSION_KINDS]),
  customTargets: Object.freeze([...CUSTOM_TARGETS]),
  maxHands: 100,
  maxDecisionsPerHand: 8,
});
