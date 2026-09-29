import { createHash } from 'node:crypto';
import {
  isTrainingContinuationTargetPotFraction,
  selectUniqueTrainingContinuationCandidate,
} from './continuationSizingContract.mjs';

export const TRAINING_ATTESTATION_CONTINUATION_SELECTION_RULE =
  'public-three-quarter-pot-aggression-v1';

const ATTESTATION_COHORT_VERSION = 1;
const SHA256_HEX_RE = /^[0-9a-f]{64}$/;
// Canonical policy ids: `bet_75pct`, `bet_74_91pct`, `raise_125_09pct`.
const EXACT_SIZE_ID_RE = /^(bet|raise)[_-](\d+)(?:[_.](\d+))?(?:pct)?$/;
// Player-facing labels: `Bet 74.9% Pot`, `Raise 75% Pot`.
const EXACT_SIZE_LABEL_RE = /^(?:bet|raise)\b[^%]*?(\d+(?:\.\d+)?)\s*%/;
// The grouped-difficulty band whose 41-80% range contains the target. Bands
// and exact sizes never coexist in one served option set (the question
// contract rejects that mix), and the server separately proves the band holds
// exactly one canonical continuation member before the parent is admitted.
const TARGET_BAND_ID = 'grouped_medium';

function publicOptionId(option) {
  return String(option?.id ?? option ?? '').trim();
}

/**
 * Read the pot fraction an aggressive public option describes, from the only
 * fields the pre-answer payload carries: a numeric public size when present,
 * otherwise the canonical id, otherwise the label. Passive options, bands and
 * raw Pio tokens such as `b412` (a cumulative chip target, never a percent)
 * return null.
 */
export function publicOptionPotFraction(option) {
  const id = publicOptionId(option).toLowerCase();
  const label = String(option?.text || option?.label || '').trim().toLowerCase();
  const family = String(option?.family || '').toLowerCase();
  const publicPotFraction = Number(option?.size?.potFraction);
  if (['bet', 'raise'].includes(family) && Number.isFinite(publicPotFraction)) {
    return publicPotFraction;
  }
  const idMatch = EXACT_SIZE_ID_RE.exec(id);
  if (idMatch) return Number(`${idMatch[2]}.${idMatch[3] || '0'}`) / 100;
  const labelMatch = EXACT_SIZE_LABEL_RE.exec(label);
  if (labelMatch) return Number(labelMatch[1]) / 100;
  if (/^(?:bet|raise)\b.*three[- ]quarter/.test(label)) return 0.75;
  return null;
}

/**
 * Apply the public rule to a served option set. Exactly one aggressive option
 * may sit inside the shared three-quarter-pot tolerance band; two sizes inside
 * the band are different tree branches, so that case returns null instead of
 * guessing. This mirrors the canonical selector byte for byte in its band
 * arithmetic, so the harness accepts precisely the sizes the server certifies.
 */
export function selectPublicAttestationContinuationAnswer(
  question,
  selectionRule = TRAINING_ATTESTATION_CONTINUATION_SELECTION_RULE,
) {
  if (selectionRule !== TRAINING_ATTESTATION_CONTINUATION_SELECTION_RULE) return null;
  const options = Array.isArray(question?.options) ? question.options : [];
  const sized = options
    .map((option) => ({ option, potFraction: publicOptionPotFraction(option) }))
    .filter((entry) => entry.potFraction !== null);
  if (sized.length > 0) {
    const selected = selectUniqueTrainingContinuationCandidate(
      sized,
      (entry) => entry.potFraction,
    );
    return selected ? publicOptionId(selected.option) : null;
  }
  const band = options.filter((option) => publicOptionId(option).toLowerCase() === TARGET_BAND_ID);
  return band.length === 1 ? publicOptionId(band[0]) : null;
}

export { isTrainingContinuationTargetPotFraction };

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
