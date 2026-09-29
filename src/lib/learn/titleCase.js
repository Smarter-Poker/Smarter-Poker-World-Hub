/**
 * TITLE CASE FOR LESSON COPY (AEO section 3.7, 2026-09-22).
 *
 * Dan's rule is that every forward facing word starts with a capital, and
 * scripts/ci/check-title-case.mjs enforces it for JSX text. Lesson prose is
 * data rendered through expressions, which that gate cannot see, so the
 * /learn module applies the rule itself when it exports a lesson, the same
 * way src/utils/popupStyle.ts cases every toast at render.
 *
 * This is the gate's own transform, ported line for line (its acronym list
 * and its digit and entity guards), so the two cannot disagree about what
 * Title Case means. The law checks the exported copy independently.
 *
 * Plain JavaScript, no JSX and no imports, so a law can run it under node.
 */

/** Initialisms that are shouted, not Title Cased. Mirrors the gate. */
const ACRONYMS = new Set([
  'nlh', 'nlhe', 'plo', 'plo4', 'plo5', 'plo6', 'plo8', 'flh', 'flo', 'ofc',
  'nl', 'pl', 'fl', 'sng', 'mtt', 'xmtt', 'pko', 'ko', 'gtd', 'hu', 'wsop',
  'bbj', 'vip', 'id', 'utg', 'sb', 'bb', 'btn', 'co', 'mp', 'hj', 'lj',
  'rit', 'gto', 'ev', 'roi', 'itm', 'usd', 'kyc', 'tos', 'faq', 'api', 'url',
  'pc', 'ios', 'os', 'ui', 'ux', 'qr', 'sms', 'otp', '2fa',
]);

export function titleCase(text) {
  return String(text).replace(/[A-Za-z][A-Za-z0-9'’]*/g, (word, offset, whole) => {
    const before = whole.slice(Math.max(0, offset - 1), offset);
    if (before === '&') return word;
    if (/\d/.test(before)) return word;
    const lower = word.toLowerCase();
    if (ACRONYMS.has(lower)) return lower.toUpperCase();
    if (word.length > 1 && word === word.toUpperCase()) return word;
    return word.charAt(0).toUpperCase() + word.slice(1);
  });
}
