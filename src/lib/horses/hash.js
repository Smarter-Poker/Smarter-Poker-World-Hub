/**
 * Deterministic string hashing for the operator console.
 *
 * Why this exists (Phase 1, 2026-09-02): generate-avatars.js picked an image
 * style with `styleOptions[horse.id % styleOptions.length]`. content_authors.id
 * is a uuid, so `uuid % n` is NaN, `style` became `undefined`, and the literal
 * word "undefined" was interpolated into a PAID image prompt for every horse
 * ever generated. A string hash is the fix, and it has to be stable so the same
 * horse re-rolls to the same style rather than a new one on every run.
 *
 * FNV-1a, 32 bit, returned as an unsigned integer. Not a cryptographic hash and
 * must never be used as one; it exists to spread ids evenly over a small list.
 *
 * Pure module: no imports, safe to unit test under node --test.
 */

const FNV_OFFSET_BASIS = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

/** Stable unsigned 32-bit hash of any value's string form. */
export function stableHash(value) {
  const s = value === null || value === undefined ? '' : String(value);
  let hash = FNV_OFFSET_BASIS;
  for (let i = 0; i < s.length; i += 1) {
    hash ^= s.charCodeAt(i) & 0xff;
    // Multiply by the FNV prime in 32-bit space without overflowing a double.
    hash = Math.imul(hash, FNV_PRIME);
  }
  return hash >>> 0;
}

/** Index into a list of `length` items, chosen stably from `value`. */
export function stableIndex(value, length) {
  if (!Number.isInteger(length) || length <= 0) return 0;
  return stableHash(value) % length;
}

/** The element of `list` this value stably maps to, or null for an empty list. */
export function stablePick(list, value) {
  if (!Array.isArray(list) || list.length === 0) return null;
  return list[stableIndex(value, list.length)];
}
