import { createHash } from 'node:crypto';

/** Canonical JSON: object keys sorted at every level, so the hash is stable. */
export function canonicalJson(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value ?? null);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const keys = Object.keys(value).filter((k) => value[k] !== undefined).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(value[k])}`).join(',')}}`;
}

export function sha256(text) {
  return createHash('sha256').update(text).digest('hex');
}

export function snapshotHash(payload) {
  return sha256(canonicalJson(payload));
}

const READ_TIME_KEYS = new Set(['source_read_at', 'read_at']);

/** The parts of a payload that, if changed, make a new revision (every read time excluded, at any depth). */
export function contentOf(payload) {
  if (Array.isArray(payload)) return payload.map(contentOf);
  if (!payload || typeof payload !== 'object') return payload;
  return Object.fromEntries(Object.entries(payload).filter(([k]) => !READ_TIME_KEYS.has(k)).map(([k, v]) => [k, contentOf(v)]));
}

export function sameContent(a, b) {
  return snapshotHash(contentOf(a)) === snapshotHash(contentOf(b));
}
