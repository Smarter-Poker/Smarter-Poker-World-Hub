/**
 * Server-only diagnostics for the production attestation continuation cohort.
 *
 * `batch-preload` answers every cohort failure with one identical 422
 * (`TRAINING_ATTESTATION_CONTINUATION_COHORT_UNAVAILABLE`) on purpose: the
 * response must not reveal which parent qualified, why a candidate was
 * rejected, or anything about the hidden continuation branch. That leaves the
 * operator reading the same three words whether the catalog is empty, every
 * parent lost its provenance, or no exact child exists. This module writes a
 * structured stage-and-counts line to the server log instead. It never
 * carries a question id, an answer id, a solver action, an option list, a
 * receipt, or a credential, and nothing here is ever serialized to a client.
 */
export const TRAINING_ATTESTATION_COHORT_LOG_PREFIX = '[BatchPreload:attestation-cohort]';

export const TRAINING_ATTESTATION_COHORT_STAGES = Object.freeze([
  'precommit_rejected',
  'solver_engine_failed',
  'no_candidate_questions',
  'configured_candidate_shortfall',
  'canonical_pair_shortfall',
  'cohort_unavailable',
  'selected_pair_shortfall',
]);

const STAGE_SET = new Set(TRAINING_ATTESTATION_COHORT_STAGES);
const CODE_RE = /^[A-Z0-9_]{1,80}$/;
const MAX_CODES = 32;

function boundedCount(value) {
  const count = Number(value);
  return Number.isSafeInteger(count) && count >= 0 ? count : 0;
}

function boundedText(value, limit = 200) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, limit);
}

/**
 * Collect why individual parents fell out of the cohort. Only rejection
 * reasons and counts are retained: the caller decides which parent qualified
 * and this object never learns a question or answer identifier.
 */
export function createTrainingAttestationCohortCollector() {
  const counts = {
    candidates: 0,
    publicAnswerMissing: 0,
    resolverThrew: 0,
    qualified: 0,
  };
  const resolutionFailures = {};
  return Object.freeze({
    candidate() { counts.candidates += 1; },
    publicAnswerMissing() { counts.publicAnswerMissing += 1; },
    resolverThrew() { counts.resolverThrew += 1; },
    qualified() { counts.qualified += 1; },
    resolutionFailed(code) {
      const key = CODE_RE.test(String(code || '')) ? String(code) : 'UNKNOWN';
      if (!(key in resolutionFailures) && Object.keys(resolutionFailures).length >= MAX_CODES) {
        resolutionFailures.OTHER = (resolutionFailures.OTHER || 0) + 1;
        return;
      }
      resolutionFailures[key] = (resolutionFailures[key] || 0) + 1;
    },
    summary() {
      return { ...counts, resolutionFailures: { ...resolutionFailures } };
    },
  });
}

/**
 * Build the exact structured record a refusal writes. Exported separately so
 * a test can prove the shape without capturing a logger.
 */
export function buildTrainingAttestationCohortRecord({ stage, counts = {}, detail = null }) {
  if (!STAGE_SET.has(stage)) {
    throw new Error(`Unknown attestation cohort diagnostic stage: ${stage}`);
  }
  const record = { stage };
  for (const [key, value] of Object.entries(counts)) {
    if (!/^[a-zA-Z][a-zA-Z0-9]{0,40}$/.test(key)) continue;
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      record[key] = Object.fromEntries(
        Object.entries(value)
          .filter(([nestedKey]) => CODE_RE.test(nestedKey) || /^[a-zA-Z][a-zA-Z0-9]{0,40}$/.test(nestedKey))
          .map(([nestedKey, nestedValue]) => [nestedKey, boundedCount(nestedValue)]),
      );
    } else if (typeof value === 'string') {
      record[key] = boundedText(value, 40);
    } else {
      record[key] = boundedCount(value);
    }
  }
  if (detail) record.detail = boundedText(detail);
  return record;
}

/**
 * Write one refusal line. `log` defaults to console.warn so production output
 * lands in the ordinary Vercel function log stream.
 */
export function logTrainingAttestationCohortStage(input, log = console.warn) {
  const record = buildTrainingAttestationCohortRecord(input);
  if (typeof log === 'function') log(TRAINING_ATTESTATION_COHORT_LOG_PREFIX, JSON.stringify(record));
  return record;
}
