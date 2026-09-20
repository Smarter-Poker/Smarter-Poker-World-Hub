/**
 * DOES THIS TITLE SURVIVE A RESULT (AEO phase 3, 2026-09-18).
 *
 * The one place that answers it, because this programme has now got the
 * answer wrong in three separate templates, each in its own way:
 *
 *   - venue pages clamped at 110, the length at which a <title> stops being
 *     sensible markup rather than the length at which a result cuts
 *   - the Poker Near Me tab table was never measured at all
 *   - home game pages hung " - Cash Games & Tournaments" off the end
 *
 * Two things are easy to forget and are handled here once. SEOHead appends
 * " | Smarter.Poker" unless the title already names the site, and that is
 * part of what a reader sees. And "&" is serialised as "&amp;", so it costs
 * four characters more than it shows.
 *
 * Plain JS, no JSX, no imports, so a law test can run it under node.
 */

/** SEOHead appends this unless the title already contains the site name. */
export const BRAND_SUFFIX = ' | Smarter.Poker';

/** Where a result cuts. Not where a title tag stops being valid. */
export const TITLE_BUDGET = 60;

/** Length as rendered: "&" becomes "&amp;" and costs four more. */
export function renderedLength(text) {
  return String(text).length + 4 * (String(text).split('&').length - 1);
}

/** Does it still fit once SEOHead has added the brand? */
export function fitsInAResult(title) {
  const withBrand = String(title).includes('Smarter.Poker') ? String(title) : String(title) + BRAND_SUFFIX;
  return renderedLength(withBrand) <= TITLE_BUDGET;
}

/**
 * The first candidate that fits, most informative first. Nothing fitting
 * means the last one is cut by RENDERED length on a word boundary, never
 * mid word and never left ending on punctuation.
 */
export function firstThatFits(candidates) {
  const list = candidates.map((c) => String(c || '').trim()).filter(Boolean);
  for (const candidate of list) {
    if (fitsInAResult(candidate)) return candidate;
  }
  const room = TITLE_BUDGET - BRAND_SUFFIX.length;
  const last = list.length ? list[list.length - 1] : '';
  let cut = '';
  for (const ch of last) {
    if (renderedLength(cut + ch) > room) break;
    cut += ch;
  }
  const space = cut.lastIndexOf(' ');
  if (space > cut.length * 0.6) cut = cut.slice(0, space);
  return cut.replace(/[\s,\-–—&]+$/, '');
}
