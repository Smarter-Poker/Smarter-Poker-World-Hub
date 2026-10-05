'use strict';

const OPERATION_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isVideoOperationsOperationId(value) {
  return typeof value === 'string' && OPERATION_ID_PATTERN.test(value);
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

module.exports = { formatVideoOperationsMetric, isVideoOperationsOperationId };
