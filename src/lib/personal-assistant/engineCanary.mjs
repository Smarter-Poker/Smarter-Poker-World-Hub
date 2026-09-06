import { createHash } from 'node:crypto';

const DEFAULT_THRESHOLDS = Object.freeze({
  minimumSamples: 100,
  maximumFailurePercent: 2,
  maximumMismatchPercent: 5,
  maximumP95Ms: 8000,
});

function boundedPercent(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.min(100, number)) : 0;
}

export function canaryAssignment(ownerId, { candidatePercent = 0, candidateEnabled = true } = {}) {
  const percentage = candidateEnabled ? boundedPercent(candidatePercent) : 0;
  const bucket = Number.parseInt(createHash('sha256').update(String(ownerId || 'anonymous')).digest('hex').slice(0, 8), 16) % 100;
  return { cohort: bucket < percentage ? 'candidate' : 'stable', bucket, candidatePercent: percentage };
}

export function evaluateCanaryHealth(observation = {}, thresholds = {}) {
  const policy = { ...DEFAULT_THRESHOLDS, ...thresholds };
  const samples = Math.max(0, Number(observation.samples) || 0);
  const failurePercent = samples ? ((Number(observation.failures) || 0) / samples) * 100 : 0;
  const mismatchPercent = samples ? ((Number(observation.mismatches) || 0) / samples) * 100 : 0;
  const p95Ms = Math.max(0, Number(observation.p95Ms) || 0);
  const reasons = [];
  if (samples < policy.minimumSamples) reasons.push('Minimum Sample Has Not Been Reached');
  if (failurePercent > policy.maximumFailurePercent) reasons.push('Failure Threshold Was Exceeded');
  if (mismatchPercent > policy.maximumMismatchPercent) reasons.push('Output Divergence Threshold Was Exceeded');
  if (p95Ms > policy.maximumP95Ms) reasons.push('Latency Threshold Was Exceeded');
  const unsafe = reasons.some(reason => reason !== 'Minimum Sample Has Not Been Reached');
  return {
    decision: unsafe ? 'rollback' : samples < policy.minimumSamples ? 'hold' : 'promote',
    samples,
    failurePercent: +failurePercent.toFixed(2),
    mismatchPercent: +mismatchPercent.toFixed(2),
    p95Ms,
    reasons,
  };
}

export default { canaryAssignment, evaluateCanaryHealth };
