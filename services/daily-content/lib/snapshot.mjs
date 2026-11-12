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

/** The parts of a payload that, if changed, make a new revision (read time excluded). */
export function contentOf(payload) {
  const { source_read_at, ...rest } = payload || {};
  return rest;
}

export function sameContent(a, b) {
  return snapshotHash(contentOf(a)) === snapshotHash(contentOf(b));
}
