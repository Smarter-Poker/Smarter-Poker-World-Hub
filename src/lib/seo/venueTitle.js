/**
 * A VENUE TITLE THAT SURVIVES A RESULT (AEO phase 3, 2026-09-18).
 *
 * /hub/venues/[id] built its title as
 *
 *     `${venue.name} - Poker Room in ${city}, ${state}`
 *
 * and clamped it at 110 characters. 110 is roughly where a <title> stops
 * being sensible markup; it is not where a result cuts, which is nearer 60
 * once the " | Smarter.Poker" suffix SEOHead appends is counted. Measured on
 * production, 290 of the 478 venue pages in the sitemap were over that, the
 * longest at 90 characters.
 *
 * What got cut was always the end of the string, which is exactly where the
 * city and the state were. A venue page's whole job is to answer "poker in
 * <city>", and the part naming the city was the part thrown away.
 *
 * So the title steps down through candidates until one fits, instead of one
 * template being clamped after the fact. Across all 478 live venues this
 * leaves none over budget, keeps the city on 450 and the state on 476.
 *
 * Plain JS, no JSX and no imports, so a law test can run it under node.
 */

/** SEOHead appends this unless the title already contains the site name. */
const BRAND_SUFFIX = ' | Smarter.Poker';

/** Where a result cuts. Not where a title tag stops being valid. */
export const TITLE_BUDGET = 60;

/**
 * An ampersand is serialised as &amp;, which costs four characters more
 * than the one it shows. Several venues are "X & Y Casino".
 */
export function renderedLength(text) {
  return text.length + 4 * (text.split('&').length - 1);
}

export function fitsInAResult(title) {
  const withBrand = title.includes('Smarter.Poker') ? title : title + BRAND_SUFFIX;
  return renderedLength(withBrand) <= TITLE_BUDGET;
}

/**
 * The candidates, most informative first. `namesPoker` drops the redundant
 * "Poker Room" from a venue whose name already says it, which is the same
 * thing the old code did and worth keeping.
 */
export function venueTitleCandidates({ name, city, state }) {
  const trimmed = String(name || '').trim();
  const namesPoker = /poker/i.test(trimmed);
  const out = [];
  if (city && state) {
    if (!namesPoker) out.push(`${trimmed} - Poker Room in ${city}, ${state}`);
    out.push(`${trimmed} Poker Room, ${city}, ${state}`);
    out.push(`${trimmed}, ${city}, ${state}`);
    out.push(`${trimmed}, ${state}`);
  } else if (state) {
    if (!namesPoker) out.push(`${trimmed} - Poker Room in ${state}`);
    out.push(`${trimmed}, ${state}`);
  } else if (city) {
    out.push(`${trimmed}, ${city}`);
  }
  out.push(namesPoker ? trimmed : `${trimmed} Poker Room`);
  out.push(trimmed);
  return out.filter(Boolean);
}

/**
 * The first candidate that fits. If even the bare name does not, it is cut
 * on a word boundary rather than mid word, and never left ending on a
 * comma or a dash.
 */
export function venueTitle({ name, city, state }) {
  const candidates = venueTitleCandidates({ name, city, state });
  for (const candidate of candidates) {
    if (fitsInAResult(candidate)) return candidate;
  }
  const room = TITLE_BUDGET - BRAND_SUFFIX.length;
  const bare = String(name || '').trim();
  if (renderedLength(bare) <= room) return bare;

  // Cut by RENDERED length, not by character count. Slicing to `room`
  // characters is wrong the moment the name contains an ampersand, because
  // each one costs five rendered characters and shows as one: a name of
  // twenty ampersands sliced to 44 still renders at 116. The law caught
  // exactly that case.
  let cut = '';
  for (const ch of bare) {
    if (renderedLength(cut + ch) > room) break;
    cut += ch;
  }
  const space = cut.lastIndexOf(' ');
  if (space > cut.length * 0.6) cut = cut.slice(0, space);
  return cut.replace(/[\s,\-–—&]+$/, '');
}
