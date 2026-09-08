export const TRAINING_GRADING_RECEIPT_EXAMPLE_SENTINEL =
  'generate-a-dedicated-32-byte-or-longer-secret';

const OBVIOUS_PLACEHOLDER_RE = /^(?:changeme|replaceme|placeholder|password|example|default|todo|test)(?:secret|key|value|now|please|123|1234)*$/i;

function hasShortRepeatingUnit(value) {
  for (let unitLength = 1; unitLength <= 8; unitLength += 1) {
    if (value.length % unitLength !== 0) continue;
    const unit = value.slice(0, unitLength);
    if (unit.repeat(value.length / unitLength) === value) return true;
  }
  return false;
}

function isObviousPlaceholder(value) {
  const normalized = value.toLowerCase().replace(/[^a-z0-9]/g, '');
  return OBVIOUS_PLACEHOLDER_RE.test(normalized)
    || /^(?:changeme|replaceme|placeholder|password|example|default|todo)/.test(normalized);
}

export function isDedicatedTrainingGradingReceiptSecret(secret, serviceRoleKey) {
  return typeof secret === 'string'
    && secret.length >= 32
    && secret.trim() === secret
    && new Set(secret).size >= 8
    && !hasShortRepeatingUnit(secret)
    && !isObviousPlaceholder(secret)
    && secret !== TRAINING_GRADING_RECEIPT_EXAMPLE_SENTINEL
    && (typeof serviceRoleKey !== 'string' || serviceRoleKey.length === 0 || secret !== serviceRoleKey);
}
