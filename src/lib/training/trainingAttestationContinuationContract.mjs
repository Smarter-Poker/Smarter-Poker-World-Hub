import { createHash } from 'node:crypto';

export const TRAINING_ATTESTATION_CONTINUATION_SELECTION_RULE =
  'public-three-quarter-pot-aggression-v1';

const ATTESTATION_COHORT_VERSION = 1;
const SHA256_HEX_RE = /^[0-9a-f]{64}$/;

function publicOptionId(option) {
  return String(option?.id ?? option ?? '').trim();
}

function isPublicThreeQuarterPotAggression(option) {
  const id = publicOptionId(option).toLowerCase();
  const label = String(option?.text || option?.label || '').trim().toLowerCase();
  const publicPotFraction = Number(option?.size?.potFraction);
  return id === 'grouped_medium'
    || /^(?:bet|raise)[_-]?75(?:pct)?$/.test(id)
    || /(?:bet|raise).*?(?:75\s*%|three[- ]quarter)/.test(label)
    || (['bet', 'raise'].includes(String(option?.family || '').toLowerCase())
      && Number.isFinite(publicPotFraction)
      && Math.abs(publicPotFraction - 0.75) <= Number.EPSILON);
}

export function selectPublicAttestationContinuationAnswer(
  question,
  selectionRule = TRAINING_ATTESTATION_CONTINUATION_SELECTION_RULE,
) {
  if (selectionRule !== TRAINING_ATTESTATION_CONTINUATION_SELECTION_RULE) return null;
  const selected = (Array.isArray(question?.options) ? question.options : [])
    .find(isPublicThreeQuarterPotAggression);
  return selected ? publicOptionId(selected) : null;
}

export function buildTrainingAttestationContinuationPrecommit({
  selectionRule = TRAINING_ATTESTATION_CONTINUATION_SELECTION_RULE,
  sessionId,
  gameId,
  level,
  targetHands,
}) {
  const safeSessionId = String(sessionId || '').trim();
  const safeGameId = String(gameId || '').trim();
  const safeLevel = Number(level);
  const safeTargetHands = Number(targetHands);
  if (
    selectionRule !== TRAINING_ATTESTATION_CONTINUATION_SELECTION_RULE
    || !safeSessionId
    || !safeGameId
    || !Number.isSafeInteger(safeLevel)
    || safeLevel < 1
    || !Number.isSafeInteger(safeTargetHands)
    || safeTargetHands !== 20
  ) return null;
  const commitment = createHash('sha256').update([
    'training-attestation-continuation-cohort-v1',
    selectionRule,
    safeSessionId,
    safeGameId,
    String(safeLevel),
    String(safeTargetHands),
  ].join('\u0000')).digest('hex');
  return Object.freeze({
    version: ATTESTATION_COHORT_VERSION,
    selectionRule,
    commitment,
  });
}

export function validateTrainingAttestationContinuationPrecommit({
  selectionRule,
  commitment,
  sessionId,
  gameId,
  level,
  targetHands,
}) {
  const expected = buildTrainingAttestationContinuationPrecommit({
    selectionRule,
    sessionId,
    gameId,
    level,
    targetHands,
  });
  return expected
    && SHA256_HEX_RE.test(String(commitment || '').trim().toLowerCase())
    && expected.commitment === String(commitment).trim().toLowerCase()
    ? expected
    : null;
}

export function isTrainingAttestationContinuationPrecommit(value) {
  return Boolean(
    value
    && value.version === ATTESTATION_COHORT_VERSION
    && value.selectionRule === TRAINING_ATTESTATION_CONTINUATION_SELECTION_RULE
    && SHA256_HEX_RE.test(String(value.commitment || ''))
  );
}
