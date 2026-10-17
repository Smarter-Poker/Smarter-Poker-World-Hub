const BANNED_LONG_BARS = /[\u2013\u2014]/gu;
const SPACED_LONG_BARS = /\s*[\u2013\u2014]\s*/gu;
const WORD_START = /(^|[\s/([{":;+.\-])([a-z])/gu;
/*
 * A web address, an email, a handle or a path is printed exactly as written
 * (2026-10-17). The Shark Club social page printed its own share link as
 * "Https://Smarter.Poker/Hub/Social-Pages/Eba7d82a-..." - and paths are case
 * sensitive, so the address on screen pointed nowhere. Such a token is left
 * untouched; the words around it are still Title Cased.
 */
const VERBATIM_TOKEN =
  /^(?:[a-z][a-z0-9+.-]*:\/\/|www\.|@[\w.-]+|[^\s@]+@[^\s@]+\.[a-z]{2,}|\/[\w.~-]+\/)|\b[a-z0-9-]+\.(?:poker|com|net|org|io|app|gg|co|us|tv|me|dev)(?:\/|\b)/iu;

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

  return withoutBars
    .split(/(\s+)/u)
    .map((token) =>
      VERBATIM_TOKEN.test(token)
        ? token
        : token.replace(
            WORD_START,
            (_match, boundary, firstLetter) => `${boundary}${firstLetter.toUpperCase()}`,
          ),
    )
    .join('');
}
export function containsBannedWorldBar(value) {
  BANNED_LONG_BARS.lastIndex = 0;
  return BANNED_LONG_BARS.test(String(value ?? ''));
}
