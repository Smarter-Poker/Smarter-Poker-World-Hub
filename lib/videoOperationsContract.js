'use strict';

const OPERATION_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const REEL_QUARANTINE_REASON_CODES = new Set([
  'active_transcode_job', 'existing_alias_chain', 'interaction_collision',
  'like_collision', 'mixed_attribution', 'mixed_author', 'mixed_canonical_key',
  'mixed_media', 'mixed_playback', 'mixed_rights', 'mixed_source_post',
  'mixed_topic', 'missing_reel', 'other', 'save_collision',
]);
const REEL_QUARANTINE_COUNT_FIELDS = [
  'openGroups', 'reelRows', 'suppressedRows', 'publicRows', 'unsafeRows',
  'nativeProcessingRows', 'missingSnapshots', 'missingReelReferences',
];

function isVideoOperationsOperationId(value) {
  return typeof value === 'string' && OPERATION_ID_PATTERN.test(value);
}

function isVideoReconciliationQuarantineSnapshot(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  if (!REEL_QUARANTINE_COUNT_FIELDS.every((field) => Number.isSafeInteger(value[field]) && value[field] >= 0)) return false;
  if (!Array.isArray(value.byReason)) return false;
  const seenReasons = new Set();
  let reasonGroupCount = 0;
  for (const row of value.byReason) {
    if (!row || typeof row !== 'object' || Array.isArray(row)
      || !REEL_QUARANTINE_REASON_CODES.has(row.reasonCode)
      || !Number.isSafeInteger(row.groups) || row.groups < 0
      || seenReasons.has(row.reasonCode)) return false;
    seenReasons.add(row.reasonCode);
    reasonGroupCount += row.groups;
  }
  return reasonGroupCount === value.openGroups;
}

function formatVideoOperationsMetric(value) {
  if (typeof value === 'string') {
    const label = value.trim();
    if (/^\$-?\d+(?:\.\d{2})?$/.test(label)) return label;
    const parsed = Number(label);
    return Number.isFinite(parsed) ? parsed.toLocaleString() : '0';
  }
  const numericValue = Number(value ?? 0);
  return Number.isFinite(numericValue) ? numericValue.toLocaleString() : '0';
}

module.exports = {
  formatVideoOperationsMetric,
  isVideoOperationsOperationId,
  isVideoReconciliationQuarantineSnapshot,
};
