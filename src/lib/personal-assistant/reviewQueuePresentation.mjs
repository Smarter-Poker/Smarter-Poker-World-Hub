import { safeStorage } from '../../components/sandbox/paKit';
import { SCHEMA_VERSION as REVIEW_SCHEMA_VERSION } from '../sandbox/leakReview.js';

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

export function dueInLabel(iso, nowMs) {
  const time = new Date(iso || '').getTime();
  if (!Number.isFinite(time) || !Number.isFinite(nowMs) || nowMs <= 0) return null;
  const days = Math.ceil((time - nowMs) / 86_400_000);
  if (days <= 0) return 'today';
  if (days === 1) return 'tomorrow';
  if (days < 7) return `in ${days} days`;
  try {
    return `on ${new Date(time).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}`;
  } catch (_) {
    return `in ${days} days`;
  }
}

export function queueReason(entry) {
  if (!entry) return '';
  if (entry.isNew) return 'Not drilled yet';
  if (entry.revived) return 'Detected again since your last review';
  const overdue = Math.floor(Number(entry.overdueDays) || 0);
  if (overdue >= 1) return `${overdue} day${overdue === 1 ? '' : 's'} overdue`;
  return 'Due today';
}
