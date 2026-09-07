import {
  createHash,
  createHmac,
  randomInt,
  randomUUID,
  timingSafeEqual,
} from 'node:crypto';

import { applyDifficultyToQuestion, normalizeTrainingDifficultyMode } from './difficultyQuestionContract.mjs';
import { normalizeRngMode } from './rngDecisionContract.mjs';
import { normalizeTrainingAttemptReceiptFields } from './sessionAttemptContract.mjs';
import { isVerifiedSolverQuestion } from './solverDecisionEvidence.js';

const RECEIPT_VERSION = 2;
const DEFAULT_TTL_SECONDS = 12 * 60 * 60;
const MAX_TTL_SECONDS = 24 * 60 * 60;

export class TrainingGradingReceiptError extends Error {
  constructor(message, code, status = 400) {
    super(message);
    this.name = 'TrainingGradingReceiptError';
    this.code = code;
    this.status = status;
  }
}

function receiptSecret(explicitSecret) {
  const secret = explicitSecret
    || process.env.TRAINING_GRADING_RECEIPT_SECRET;
  if (typeof secret !== 'string' || secret.length < 32) {
    throw new TrainingGradingReceiptError(
      'Training grading receipts are not configured.',
      'TRAINING_GRADING_RECEIPT_NOT_CONFIGURED',
      503,
    );
  }
  return secret;
}

function normalizedJsonValue(value) {
  if (Array.isArray(value)) return value.map(normalizedJsonValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .filter((key) => value[key] !== undefined && key !== '_gradingContext')
        .sort()
        .map((key) => [key, normalizedJsonValue(value[key])]),
    );
  }
  if (Number.isNaN(value)) return null;
  return value;
}

export function stableTrainingQuestionJson(question) {
  return JSON.stringify(normalizedJsonValue(question));
}

export function trainingQuestionDigest(question) {
  return createHash('sha256')
    .update(stableTrainingQuestionJson(question))
    .digest('hex');
}

function encodePayload(payload) {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

function signPayload(encodedPayload, secret) {
  return createHmac('sha256', secret).update(encodedPayload).digest('base64url');
}

function safeSignatureMatch(left, right) {
  try {
    const leftBytes = Buffer.from(String(left || ''), 'base64url');
    const rightBytes = Buffer.from(String(right || ''), 'base64url');
    return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes);
  } catch {
    return false;
  }
}

function receiptFailure(message, code, status = 400) {
  throw new TrainingGradingReceiptError(message, code, status);
}

const PRIVATE_GRADING_KEYS = new Set([
  'correct',
  'correctanswer',
  'correctanswerid',
  'correctanswertext',
  'correctoption',
  'correctoptionid',
  'correctflag',
  'iscorrect',
  'is_correct',
  'answerkey',
  'bestaction',
  'bestactionid',
  'isbest',
  'ispreferred',
  'preferredaction',
  'optimalaction',
  'optimalactionid',
  'explanation',
  'structuredexplanation',
  'mistakefeedback',
  'feedback',
  'gtofrequencies',
  'frequency',
  'solverfrequency',
  'actionfrequency',
  'probability',
  'weight',
  'frequencies',
  'rawfrequencies',
  'actionevs',
  'ev',
  'expectedvalue',
  'handevs',
  'evdata',
  'solverstrategy',
  'strategy',
  'gtodata',
  '_originalcorrect',
  '_originalfrequencies',
  '_originalactionevs',
  '_originaloptions',
  '_difficultymembers',
  '_deviationnote',
  'contractdistractor',
  'solverrank',
  'nextstreetcontinuation',
  'nextstreetcontinuationaction',
  'answer',
  'solution',
  'rationale',
  'reason',
  'analysis',
  'hint',
  'tip',
  'recommendation',
  'recommended',
  'isrecommended',
  'isoptimal',
  'verdict',
  'grade',
  'score',
]);

function normalizedPrivateKey(key) {
  return String(key || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function isPrivateGradingKey(key) {
  const normalized = normalizedPrivateKey(key);
  if (!normalized) return false;
  if (String(key).startsWith('_')) return true;
  if (PRIVATE_GRADING_KEYS.has(normalized)) return true;

  // Fail closed for the common aliases emitted by authored, cached, and
  // solver-backed question families. This boundary is intentionally based on
  // field names rather than values so nested copies cannot evade it through
  // casing, punctuation, or snake_case variants.
  return normalized.startsWith('correct')
    || normalized.includes('answerkey')
    || normalized.startsWith('bestaction')
    || normalized.startsWith('preferredaction')
    || normalized.startsWith('optimalaction')
    || normalized.startsWith('isbest')
    || normalized.startsWith('ispreferred')
    || normalized.startsWith('isoptimal')
    || normalized.startsWith('isrecommended')
    || normalized.endsWith('explanation')
    || normalized.endsWith('feedback')
    || normalized.endsWith('frequency')
    || normalized.endsWith('frequencies')
    || normalized.endsWith('probability')
    || normalized.endsWith('weight')
    || normalized.endsWith('expectedvalue')
    || normalized.endsWith('actionevs')
    || normalized.endsWith('handevs')
    || normalized.endsWith('evdata')
    || normalized.endsWith('solverstrategy')
    || normalized.endsWith('solverrank')
    || normalized.startsWith('nextstreetcontinuation');
}

function stripPrivateGradingData(value) {
  if (Array.isArray(value)) return value.map(stripPrivateGradingData);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !isPrivateGradingKey(key))
      .map(([key, child]) => [key, stripPrivateGradingData(child)]),
  );
}

/**
 * Produce the only question shape that may cross the pre-answer boundary.
 * The browser receives the legal choices and poker state, but never an answer
 * key, explanation, solver mix, EV table, hidden grouping map, or nested copy
 * of any of those fields. Those values are revealed by record-question only
 * after the signed answer has been durably recorded.
 */
export function toPublicTrainingQuestion(servedQuestion) {
  return stripPrivateGradingData(servedQuestion);
}

export function createTrainingSessionId() {
  return randomUUID();
}

/**
 * Transform a canonical question into the exact difficulty shape the player
 * receives and attach a signed, user-bound grading receipt. The receipt owns
 * both randomizer rolls; the browser may choose Low or High, but it cannot
 * invent a roll, change difficulty, replay a different answer, or move the
 * question to another account/game.
 */
export function prepareTrainingQuestionForDelivery({
  canonicalQuestion,
  userId,
  gameId,
  level,
  sessionId,
  attemptId,
  snapshotKey,
  sessionKind = 'campaign',
  sessionTargetHands,
  handOrdinal,
  decisionOrdinal = 1,
  countsTowardCompletion = decisionOrdinal === 1,
  practiceOnly = sessionKind === 'replay',
  difficultyMode = 'standard',
  nowMs = Date.now(),
  ttlSeconds = DEFAULT_TTL_SECONDS,
  secret,
  receiptId,
  rngRolls,
}) {
  const normalizedDifficulty = normalizeTrainingDifficultyMode(difficultyMode);
  const servedQuestion = applyDifficultyToQuestion(canonicalQuestion, normalizedDifficulty);
  const questionId = String(servedQuestion?.id || '');
  if (!questionId || !userId || !gameId || !sessionId || !attemptId || !snapshotKey) {
    receiptFailure(
      'A canonical question, authenticated user, game, and session are required.',
      'TRAINING_GRADING_RECEIPT_INPUT_INVALID',
      500,
    );
  }

  const attemptFields = normalizeTrainingAttemptReceiptFields({
    level,
    sessionKind,
    sessionTargetHands,
    handOrdinal,
    decisionOrdinal,
    countsTowardCompletion,
    practiceOnly,
  });

  const nowSeconds = Math.floor(Number(nowMs) / 1000);
  const safeTtl = Math.max(60, Math.min(MAX_TTL_SECONDS, Math.floor(Number(ttlSeconds) || DEFAULT_TTL_SECONDS)));
  const rolls = {
    low: Number.isInteger(rngRolls?.low) ? rngRolls.low : randomInt(1, 101),
    high: Number.isInteger(rngRolls?.high) ? rngRolls.high : randomInt(1, 101),
  };
  if (![rolls.low, rolls.high].every((roll) => roll >= 1 && roll <= 100)) {
    receiptFailure('Randomizer rolls must be integers from 1 to 100.', 'TRAINING_GRADING_RECEIPT_RNG_INVALID', 500);
  }

  const payload = {
    v: RECEIPT_VERSION,
    jti: receiptId || randomUUID(),
    sub: String(userId),
    sessionId: String(sessionId).slice(0, 180),
    attemptId: String(attemptId),
    snapshotKey: String(snapshotKey),
    gameId: String(gameId),
    questionId,
    level: Math.min(12, Math.max(1, Number(level) || 1)),
    difficultyMode: normalizedDifficulty,
    questionDigest: trainingQuestionDigest(servedQuestion),
    rngRolls: rolls,
    ...attemptFields,
    iat: nowSeconds,
    exp: nowSeconds + safeTtl,
  };
  const encodedPayload = encodePayload(payload);
  const receipt = `${encodedPayload}.${signPayload(encodedPayload, receiptSecret(secret))}`;

  const solverEvidenceAvailable = isVerifiedSolverQuestion(servedQuestion);

  return {
    ...toPublicTrainingQuestion(servedQuestion),
    _gradingContext: {
      receipt,
      submissionId: payload.jti,
      sessionId: payload.sessionId,
      attemptId: payload.attemptId,
      snapshotKey: payload.snapshotKey,
      sessionKind: payload.sessionKind,
      sessionTargetHands: payload.sessionTargetHands,
      handOrdinal: payload.handOrdinal,
      decisionOrdinal: payload.decisionOrdinal,
      countsTowardCompletion: payload.countsTowardCompletion,
      practiceOnly: payload.practiceOnly,
      difficultyMode: payload.difficultyMode,
      rngRolls: payload.rngRolls,
      solverEvidenceAvailable,
      expiresAt: new Date(payload.exp * 1000).toISOString(),
    },
  };
}

export function verifyTrainingGradingReceiptEnvelope(receipt, {
  userId,
  gameId,
  questionId,
  sessionId,
  attemptId,
  snapshotKey,
  nowMs = Date.now(),
  secret,
} = {}) {
  if (typeof receipt !== 'string' || receipt.length > 8192) {
    receiptFailure('A valid grading receipt is required.', 'TRAINING_GRADING_RECEIPT_REQUIRED');
  }
  const parts = receipt.split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    receiptFailure('The grading receipt is malformed.', 'TRAINING_GRADING_RECEIPT_MALFORMED');
  }
  const [encodedPayload, suppliedSignature] = parts;
  const expectedSignature = signPayload(encodedPayload, receiptSecret(secret));
  if (!safeSignatureMatch(suppliedSignature, expectedSignature)) {
    receiptFailure('The grading receipt signature is invalid.', 'TRAINING_GRADING_RECEIPT_SIGNATURE_INVALID');
  }

  let payload;
  try {
    payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'));
  } catch {
    receiptFailure('The grading receipt payload is invalid.', 'TRAINING_GRADING_RECEIPT_MALFORMED');
  }
  if (
    payload?.v !== RECEIPT_VERSION
    || !payload?.jti
    || !payload?.questionDigest
    || !payload?.attemptId
    || !payload?.snapshotKey
  ) {
    receiptFailure('The grading receipt version is unsupported.', 'TRAINING_GRADING_RECEIPT_VERSION_INVALID');
  }

  const nowSeconds = Math.floor(Number(nowMs) / 1000);
  if (!Number.isInteger(payload.iat) || !Number.isInteger(payload.exp) || payload.iat > nowSeconds + 60) {
    receiptFailure('The grading receipt timestamp is invalid.', 'TRAINING_GRADING_RECEIPT_TIME_INVALID');
  }
  if (payload.exp <= nowSeconds) {
    receiptFailure('This training hand has expired. Load a fresh hand.', 'TRAINING_GRADING_RECEIPT_EXPIRED', 409);
  }
  if (String(payload.sub) !== String(userId || '')) {
    receiptFailure('The grading receipt belongs to another user.', 'TRAINING_GRADING_RECEIPT_USER_MISMATCH', 403);
  }
  if (gameId && String(payload.gameId) !== String(gameId)) {
    receiptFailure('The grading receipt belongs to another game.', 'TRAINING_GRADING_RECEIPT_GAME_MISMATCH');
  }
  if (questionId && String(payload.questionId) !== String(questionId)) {
    receiptFailure('The grading receipt belongs to another question.', 'TRAINING_GRADING_RECEIPT_QUESTION_MISMATCH');
  }
  if (sessionId && String(payload.sessionId) !== String(sessionId)) {
    receiptFailure('The grading receipt belongs to another session.', 'TRAINING_GRADING_RECEIPT_SESSION_MISMATCH');
  }

  if (attemptId && String(payload.attemptId) !== String(attemptId)) {
    receiptFailure('The grading receipt belongs to another attempt.', 'TRAINING_GRADING_RECEIPT_ATTEMPT_MISMATCH');
  }
  if (snapshotKey && String(payload.snapshotKey) !== String(snapshotKey)) {
    receiptFailure('The grading receipt belongs to another question snapshot.', 'TRAINING_GRADING_RECEIPT_SNAPSHOT_MISMATCH');
  }

  const attemptFields = normalizeTrainingAttemptReceiptFields(payload);
  return { payload: { ...payload, ...attemptFields } };
}

export function verifyTrainingGradingReceipt(receipt, {
  userId,
  gameId,
  questionId,
  sessionId,
  attemptId,
  snapshotKey,
  canonicalQuestion,
  nowMs = Date.now(),
  secret,
} = {}) {
  const { payload } = verifyTrainingGradingReceiptEnvelope(receipt, {
    userId,
    gameId,
    questionId,
    sessionId,
    attemptId,
    snapshotKey,
    nowMs,
    secret,
  });

  const servedQuestion = applyDifficultyToQuestion(canonicalQuestion, payload.difficultyMode);
  if (trainingQuestionDigest(servedQuestion) !== payload.questionDigest) {
    receiptFailure(
      'The canonical question changed after it was served. Load a fresh hand.',
      'TRAINING_GRADING_RECEIPT_QUESTION_CHANGED',
      409,
    );
  }
  return { payload, servedQuestion };
}

/**
 * Validate client RNG metadata against the server-issued roll.
 *
 * The browser deliberately submits only the selected dial direction and the
 * signed roll. The action band is grading authority and is derived later from
 * the immutable canonical solver mix. Accepting (or returning) a browser
 * target would reveal the answer before the decision and needlessly widen the
 * tampering surface.
 */
export function deriveReceiptRng(payload, submittedRng) {
  if (!submittedRng) return null;
  const mode = normalizeRngMode(submittedRng.mode);
  const expectedRoll = Number(payload?.rngRolls?.[mode]);
  if (!mode || !Number.isInteger(expectedRoll) || Number(submittedRng.roll) !== expectedRoll) {
    receiptFailure('Randomizer mode or roll does not match the served hand.', 'TRAINING_GRADING_RECEIPT_RNG_MISMATCH');
  }
  return {
    mode,
    roll: expectedRoll,
  };
}
