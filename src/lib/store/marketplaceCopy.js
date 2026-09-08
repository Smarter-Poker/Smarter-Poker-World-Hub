const BANNED_LONG_BARS = /[\u2013\u2014]/gu;
const WORD_START = /(^|[\s/([{":;+-])([a-z])/gu;
const STRUCTURED_COPY_FIELDS = new Set(['category', 'description', 'headline', 'name']);

/**
 * Normalize shopper-facing Marketplace prose at its render boundary.
 * Identifiers, URLs, SKUs, and transaction references must not use this helper.
 */
export function marketplaceCopy(value) {
  if (value == null) return '';
  return String(value)
    .replace(/\s*[\u2013\u2014]\s*/gu, ': ')
    .replace(/\s{2,}/gu, ' ')
    .replace(WORD_START, (_match, boundary, firstLetter) => (
      `${boundary}${firstLetter.toUpperCase()}`
    ))
    .trim();
}

export function marketplaceStructuredData(value, field = '') {
  if (Array.isArray(value)) {
    return value.map(entry => marketplaceStructuredData(entry));
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [
        key,
        marketplaceStructuredData(entry, key),
      ])
    );
  }
  if (typeof value === 'string' && STRUCTURED_COPY_FIELDS.has(field)) {
    return marketplaceCopy(value);
  }
  return value;
}
