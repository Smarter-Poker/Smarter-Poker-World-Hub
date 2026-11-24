import { safeStorage } from '../../components/sandbox/paKit';
import { SCHEMA_VERSION as REVIEW_SCHEMA_VERSION } from '../sandbox/leakReview.js';
export { dueInLabel, queueReason } from './reviewQueueLabels.mjs';

const REVIEW_STORE_KEY = `pa-leak-review-v${REVIEW_SCHEMA_VERSION}`;
const LEGACY_REVIEW_STORE_KEYS = ['pa-leak-review-v2', 'pa-leak-review-v1']
  .filter(key => key !== REVIEW_STORE_KEY);

export function readLocalReviewRecords() {
  const map = {};
  for (const key of [...LEGACY_REVIEW_STORE_KEYS].reverse().concat(REVIEW_STORE_KEY)) {
    try {
      const raw = safeStorage.get(key, null);
      if (!raw) continue;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) continue;
      const records = (parsed.records && typeof parsed.records === 'object' && !Array.isArray(parsed.records))
        ? parsed.records
        : parsed;
      if (records && typeof records === 'object' && !Array.isArray(records)) Object.assign(map, records);
    } catch (error) {
      console.warn(`[LeakFinder] Local Review Store ${key} Unreadable:`, error?.message || error);
    }
  }
  return Object.keys(map)
    .map((key) => {
      const value = map[key];
      if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
      return value.leakId ? value : { ...value, leakId: key };
    })
    .filter(Boolean);
}

export function definedOnly(obj) {
  const out = {};
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return out;
  try {
    for (const key of Object.keys(obj)) {
      const value = obj[key];
      if (value !== undefined && value !== null) out[key] = value;
    }
  } catch (_) {
    return out;
  }
  return out;
}

export function fromServerReviewRecord(row) {
  if (!row || typeof row !== 'object') return null;
  return { ...row, lastReviewedAt: row.updatedAt || row.createdAt || null };
}
