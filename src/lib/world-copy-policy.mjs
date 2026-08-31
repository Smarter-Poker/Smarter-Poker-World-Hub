const BANNED_LONG_BARS = /[\u2013\u2014]/gu;
const SPACED_LONG_BARS = /\s*[\u2013\u2014]\s*/gu;
const WORD_START = /(^|[\s/([{":;+.\-])([a-z])/gu;

export const WORLD_COPY_SCOPE_CLASS = 'world-copy-scope';

/**
 * Normalize user-facing World Hub copy without touching identifiers or source
 * data. Existing acronyms and poker notation remain authored exactly; only a
 * lowercase first letter at a visible word boundary is promoted.
 */
export function normalizeWorldCopy(value) {
  if (value == null) return '';
  const source = String(value);
  const withoutBars = source.trim() && source.trim().replace(BANNED_LONG_BARS, '') === ''
    ? source.replace(BANNED_LONG_BARS, 'Not Available')
    : source.replace(SPACED_LONG_BARS, ': ');

  return withoutBars.replace(
    WORD_START,
    (_match, boundary, firstLetter) => `${boundary}${firstLetter.toUpperCase()}`,
  );
}
export function containsBannedWorldBar(value) {
  BANNED_LONG_BARS.lastIndex = 0;
  return BANNED_LONG_BARS.test(String(value ?? ''));
}
