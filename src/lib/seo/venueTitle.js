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

// The measuring is shared with every other title template on the site
// (AEO phase 3, 2026-09-18): three of them got the answer wrong in three
// different ways, so there is now one place that answers it.
import { firstThatFits, renderedLength, fitsInAResult, TITLE_BUDGET } from './titleFit.js';

export { renderedLength, fitsInAResult, TITLE_BUDGET };

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
  return firstThatFits([...venueTitleCandidates({ name, city, state }), String(name || '').trim()]);
}
