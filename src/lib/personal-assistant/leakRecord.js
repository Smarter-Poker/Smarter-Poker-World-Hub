const CONFIDENCE_SCORES = Object.freeze({
  low: 0.3,
  medium: 0.65,
  high: 0.9,
});

function finiteNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function positiveInteger(value, fallback = 1) {
  const number = finiteNumber(value);
  return number === null ? fallback : Math.max(1, Math.round(number));
}

export function confidenceScore(value) {
  const label = String(value || '').trim().toLowerCase();
  if (Object.prototype.hasOwnProperty.call(CONFIDENCE_SCORES, label)) {
    return CONFIDENCE_SCORES[label];
  }
  const number = finiteNumber(value);
  return number === null ? CONFIDENCE_SCORES.low : clamp(number, 0, 1);
}

export function confidenceTier(value) {
  const label = String(value || '').trim().toLowerCase();
  if (Object.prototype.hasOwnProperty.call(CONFIDENCE_SCORES, label)) return label;
  const score = confidenceScore(value);
  if (score >= 0.75) return 'high';
  if (score >= 0.5) return 'medium';
  return 'low';
}

export function leakTypeSlug(value, fallback = 'legacy_leak') {
  const slug = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 180);
  return slug || fallback;
}

export function leakTypeTitle(value) {
  return String(value || 'Leak')
    .replace(/[_-]+/g, ' ')
    .trim()
    .replace(/\b\w/g, character => character.toUpperCase());
}

const ACTIVE_STATUSES = new Set(['emerging', 'persistent', 'improving']);

/**
 * Keep the hybrid user_leaks lifecycle fields in lockstep. Modern readers use
 * status/resolved_at while the training accountant still uses is_active.
 */
export function leakStatusPersistenceFields(status, { resolvedAt = null, now = new Date().toISOString() } = {}) {
  const normalized = String(status || 'emerging').trim().toLowerCase();
  if (normalized === 'resolved') {
    return { status: 'resolved', resolved_at: resolvedAt || now, is_active: false };
  }
  const activeStatus = ACTIVE_STATUSES.has(normalized) ? normalized : 'emerging';
  return { status: activeStatus, resolved_at: null, is_active: true };
}

/**
 * Convert either generation of user_leaks rows into the API's canonical
 * record. The table is intentionally shared with the original training
 * accountant, whose rows use leak_name/mistake_count/numeric confidence.
 */
export function normalizeUserLeakRow(row = {}) {
  const isLegacyTrainingRow = !row.leak_type && !!row.leak_name;
  const leakType = row.leak_type || leakTypeSlug(row.leak_name || row.situation_class);
  const occurrenceCount = finiteNumber(row.occurrence_count) ?? finiteNumber(row.mistake_count) ?? 0;
  const firstDetected = row.first_detected_at || row.detected_at || row.created_at || null;
  const status = row.status || (row.is_active === false ? 'resolved' : 'emerging');

  return {
    ...row,
    leak_type: leakType,
    leak_category: row.leak_category || 'training',
    situation_class: leakTypeTitle(row.situation_class || row.leak_name || leakType),
    status,
    confidence: confidenceTier(row.confidence),
    occurrence_count: Math.max(0, Math.round(occurrenceCount)),
    first_detected_at: firstDetected,
    last_detected_at: row.last_detected_at || row.updated_at || firstDetected,
    source_system: isLegacyTrainingRow ? 'training_accountant' : (row.source_system || 'training_accountant'),
    resolved_at: row.resolved_at || (status === 'resolved' ? row.remediation_completed_at || null : null),
  };
}

/**
 * Build a row accepted by the live hybrid schema. New detector fields remain
 * canonical, while the four required legacy fields are populated with honest
 * equivalents so a deterministic audit can be saved atomically.
 */
export function toUserLeakPersistenceRow(leak = {}, options = {}) {
  const userId = options.userId || leak.user_id;
  const leakType = leakTypeSlug(leak.leak_type || leak.leak_name || leak.situation_class);
  const mistakes = positiveInteger(
    options.mistakeCount ?? leak.mistake_count ?? leak.occurrence_count,
  );
  const samples = Math.max(
    mistakes,
    positiveInteger(options.totalSamples ?? leak.total_samples ?? leak.occurrence_count),
  );
  const suppliedErrorRate = finiteNumber(leak.error_rate);
  const errorRate = clamp(
    suppliedErrorRate === null ? mistakes / samples : suppliedErrorRate,
    0,
    1,
  );
  const { _sample_count, _mistake_count, _ev_measured_count, ...publicFields } = leak;

  return {
    ...publicFields,
    ...leakStatusPersistenceFields(leak.status, { resolvedAt: leak.resolved_at }),
    user_id: userId,
    leak_type: leakType,
    leak_name: leak.leak_name || leak.situation_class || leakTypeTitle(leakType),
    error_rate: +errorRate.toFixed(4),
    confidence: confidenceScore(leak.confidence),
    total_samples: samples,
    mistake_count: Math.min(mistakes, samples),
  };
}

export default {
  confidenceScore,
  confidenceTier,
  leakTypeSlug,
  leakTypeTitle,
  leakStatusPersistenceFields,
  normalizeUserLeakRow,
  toUserLeakPersistenceRow,
};
