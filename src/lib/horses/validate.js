/**
 * Input validation for the operator console API routes.
 *
 * Every helper returns a plain value or null/undefined and NEVER throws, so a
 * route can read `const id = uuid(req.query.id); if (!id) return fail(...)`.
 * Malformed input becomes a 400 at the route, never a Postgres 22P02 and a 500.
 *
 * Pure module: no imports, safe to unit test under node --test.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Any RFC 4122 layout, including v7. Returns the lower-cased id or null. */
export function uuid(value) {
  if (typeof value !== 'string') return null;
  const v = value.trim();
  return UUID_RE.test(v) ? v.toLowerCase() : null;
}

export function isUuid(value) {
  return uuid(value) !== null;
}

/** Every element must be a uuid; returns the de-duplicated list or null. */
export function uuidList(value, { max = 500 } = {}) {
  if (!Array.isArray(value) || value.length === 0 || value.length > max) return null;
  const out = [];
  const seen = new Set();
  for (const v of value) {
    const id = uuid(v);
    if (!id) return null;
    if (!seen.has(id)) {
      seen.add(id);
      out.push(id);
    }
  }
  return out;
}

/**
 * Integer within [min, max]. Accepts numbers and numeric strings. Returns the
 * fallback (default null) for anything else, including NaN and 1e3 notation.
 */
export function int(value, { min = -Infinity, max = Infinity, fallback = null } = {}) {
  if (value === undefined || value === null || value === '') return fallback;
  const s = String(value).trim();
  if (!/^-?\d+$/.test(s)) return fallback;
  const n = Number(s);
  if (!Number.isSafeInteger(n) || n < min || n > max) return fallback;
  return n;
}

/** One of an allowlist. Returns the value or the fallback (default null). */
export function enumOf(value, allowed, { fallback = null } = {}) {
  if (typeof value !== 'string' || !Array.isArray(allowed)) return fallback;
  return allowed.includes(value) ? value : fallback;
}

/** Trimmed string bounded by length. Empty after trim -> null. */
export function text(value, { min = 1, max = 2000 } = {}) {
  if (typeof value !== 'string') return null;
  const v = value.trim();
  if (v.length < min || v.length > max) return null;
  return v;
}

/**
 * A money amount with at most two decimal places, as a Number, parsed from
 * the STRING representation so float precision cannot reject 0.07 or 1.15.
 * Positive by default. Returns null for anything else.
 */
export function money2dp(value, { allowZero = false, max = Number.MAX_SAFE_INTEGER } = {}) {
  if (value === undefined || value === null) return null;
  const s = String(value).trim();
  if (!/^\d{1,15}(\.\d{1,2})?$/.test(s)) return null;
  const n = Number(s);
  if (!Number.isFinite(n) || n > max) return null;
  if (n === 0 && !allowZero) return null;
  return n;
}

/**
 * Paging from query params. `limit` is clamped to [1, max] and `offset` to
 * [0, maxOffset]. Always returns a usable object so a route never has to
 * branch on paging validity.
 */
export function paging(query, { defaultLimit = 50, max = 200, maxOffset = 1_000_000 } = {}) {
  const rawLimit = int(query?.limit, { min: 1, fallback: defaultLimit });
  const rawOffset = int(query?.offset, { min: 0, fallback: 0 });
  const limit = Math.min(rawLimit, max);
  const offset = Math.min(rawOffset, maxOffset);
  return { limit, offset, rangeEnd: offset + limit - 1 };
}

/**
 * Strip PostgREST filter grammar from a free-text search term so it can be
 * placed inside an .or()/.ilike() pattern safely. Returns null when nothing
 * searchable is left.
 */
export function searchTerm(value, { max = 80 } = {}) {
  if (typeof value !== 'string') return null;
  const cleaned = value.replace(/[%_,().*\\"']/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
  return cleaned.length ? cleaned : null;
}

/** ISO date (YYYY-MM-DD) or full ISO timestamp -> ISO string, else null. */
export function isoDate(value) {
  if (typeof value !== 'string') return null;
  const v = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}(T[\d:.]+(Z|[+-]\d{2}:?\d{2})?)?$/.test(v)) return null;
  const t = Date.parse(v);
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}

export function bool(value, { fallback = null } = {}) {
  if (value === true || value === 'true' || value === 1 || value === '1') return true;
  if (value === false || value === 'false' || value === 0 || value === '0') return false;
  return fallback;
}

/** Keep only allow-listed keys of an object (shallow). */
export function pick(obj, keys) {
  const out = {};
  if (!obj || typeof obj !== 'object') return out;
  for (const k of keys) if (Object.prototype.hasOwnProperty.call(obj, k)) out[k] = obj[k];
  return out;
}
