/**
 * Privacy-Safe Personal Assistant Local Milestone Telemetry.
 *
 * Stores ONLY aggregate non-PII event counts in localStorage under
 * `pa_milestones_v1`. Strictly strips any user IDs, emails, UUIDs,
 * free-form hand text, or arbitrary metadata payloads.
 */

export const PA_MILESTONES_STORAGE_KEY = 'pa_milestones_v1';

const ALLOWED_EVENTS = new Set([
  'sandbox_action',
  'hand_logged',
  'leak_opened_on_table',
  'sample_hand_loaded',
  'sample_leak_previewed',
  'shorthand_parsed',
  'study_exported',
  'review_opened_on_table',
  'post_session_debrief_clicked',
]);

const UUID_PATTERN = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
const EMAIL_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const SAFE_TAG_KEYS = new Set(['format', 'surface', 'variant', 'source']);
const SAFE_TAG_VALUE_RE = /^[a-z0-9_-]{1,24}$/i;

function getStorage(explicitStorage) {
  if (explicitStorage) return explicitStorage;
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage || null;
  } catch {
    return null;
  }
}

function sanitizeEventName(eventName) {
  if (typeof eventName !== 'string') return null;
  const clean = eventName.trim().toLowerCase();
  if (!clean || !ALLOWED_EVENTS.has(clean)) return null;
  return clean;
}

function sanitizeMetaBucket(meta) {
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) return null;
  const parts = [];
  for (const key of Object.keys(meta)) {
    if (!SAFE_TAG_KEYS.has(key)) continue;
    const rawVal = meta[key];
    if (typeof rawVal !== 'string') continue;
    const val = rawVal.trim().toLowerCase();
    if (!val || !SAFE_TAG_VALUE_RE.test(val)) continue;
    if (UUID_PATTERN.test(val) || EMAIL_PATTERN.test(val)) continue;
    parts.push(`${key}:${val}`);
  }
  return parts.length > 0 ? parts.sort().join('|') : null;
}

function readRawMilestones(storage) {
  if (!storage) return { version: 1, counts: {}, buckets: {} };
  try {
    const raw = storage.getItem(PA_MILESTONES_STORAGE_KEY);
    if (!raw) return { version: 1, counts: {}, buckets: {} };
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') {
      return { version: 1, counts: {}, buckets: {} };
    }
    const counts = {};
    if (parsed.counts && typeof parsed.counts === 'object' && !Array.isArray(parsed.counts)) {
      for (const [k, v] of Object.entries(parsed.counts)) {
        const cleanKey = sanitizeEventName(k);
        const n = Number(v);
        if (cleanKey && Number.isInteger(n) && n >= 0) {
          counts[cleanKey] = n;
        }
      }
    }
    const buckets = {};
    if (parsed.buckets && typeof parsed.buckets === 'object' && !Array.isArray(parsed.buckets)) {
      for (const [k, v] of Object.entries(parsed.buckets)) {
        if (typeof k !== 'string' || k.length > 80) continue;
        if (UUID_PATTERN.test(k) || EMAIL_PATTERN.test(k)) continue;
        const n = Number(v);
        if (Number.isInteger(n) && n >= 0) {
          buckets[k] = n;
        }
      }
    }
    return { version: 1, counts, buckets };
  } catch {
    return { version: 1, counts: {}, buckets: {} };
  }
}

/**
 * Increment a privacy-safe aggregate milestone counter.
 * Never persists PII, user IDs, emails, UUIDs, or hand text.
 */
export function recordPaMilestone(eventName, meta = null, options = {}) {
  const cleanEvent = sanitizeEventName(eventName);
  if (!cleanEvent) return null;
  const storage = getStorage(options?.storage);
  const current = readRawMilestones(storage);
  current.counts[cleanEvent] = (current.counts[cleanEvent] || 0) + 1;

  const bucketSuffix = sanitizeMetaBucket(meta);
  if (bucketSuffix) {
    const bucketKey = `${cleanEvent}#${bucketSuffix}`;
    if (Object.keys(current.buckets).length < 64 || Object.prototype.hasOwnProperty.call(current.buckets, bucketKey)) {
      current.buckets[bucketKey] = (current.buckets[bucketKey] || 0) + 1;
    }
  }

  if (storage) {
    try {
      storage.setItem(PA_MILESTONES_STORAGE_KEY, JSON.stringify(current));
    } catch {
      /* ignore quota or restricted storage errors */
    }
  }
  return current;
}

/**
 * Read current aggregate milestone counts (read-only snapshot).
 */
export function getPaMilestones(options = {}) {
  const storage = getStorage(options?.storage);
  return readRawMilestones(storage);
}
