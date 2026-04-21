// src/lib/home-games/locationUtils.js
//
// Shared helpers for home-games geo-landing pages:
//   /hub/home-games/in
//   /hub/home-games/in/[state]
//   /hub/home-games/in/[state]/[city]
//
// The canonical storage format in the DB (see phase-1 unification work):
//   social_pages.location_state — 2-letter uppercase code ('NV', 'TX')
//   social_pages.location_city  — title-cased full name ('Las Vegas', 'Austin')
//
// URL slugs are always lowercase, hyphen-separated, accent-stripped:
//   /hub/home-games/in/nv
//   /hub/home-games/in/nv/las-vegas
//
// To keep the pages generous about what people type, state slugs also
// accept the full lowercase name ('nevada' -> 'NV') with a redirect.

export const US_STATES_BY_CODE = {
  AL: 'Alabama',        AK: 'Alaska',         AZ: 'Arizona',        AR: 'Arkansas',
  CA: 'California',     CO: 'Colorado',       CT: 'Connecticut',    DE: 'Delaware',
  FL: 'Florida',        GA: 'Georgia',        HI: 'Hawaii',         ID: 'Idaho',
  IL: 'Illinois',       IN: 'Indiana',        IA: 'Iowa',           KS: 'Kansas',
  KY: 'Kentucky',       LA: 'Louisiana',      ME: 'Maine',          MD: 'Maryland',
  MA: 'Massachusetts',  MI: 'Michigan',       MN: 'Minnesota',      MS: 'Mississippi',
  MO: 'Missouri',       MT: 'Montana',        NE: 'Nebraska',       NV: 'Nevada',
  NH: 'New Hampshire',  NJ: 'New Jersey',     NM: 'New Mexico',     NY: 'New York',
  NC: 'North Carolina', ND: 'North Dakota',   OH: 'Ohio',           OK: 'Oklahoma',
  OR: 'Oregon',         PA: 'Pennsylvania',   RI: 'Rhode Island',   SC: 'South Carolina',
  SD: 'South Dakota',   TN: 'Tennessee',      TX: 'Texas',          UT: 'Utah',
  VT: 'Vermont',        VA: 'Virginia',       WA: 'Washington',     WV: 'West Virginia',
  WI: 'Wisconsin',      WY: 'Wyoming',        DC: 'District of Columbia',
};

// Reverse map: lowercase full name -> 2-letter code
const _NAME_TO_CODE = Object.fromEntries(
  Object.entries(US_STATES_BY_CODE || {}).map(([code, name]) => [name.toLowerCase(), code])
);

/**
 * Turn a slug like 'las-vegas' or 'Las Vegas' into the canonical DB form:
 * 'Las Vegas'. Handles multi-word city names and O'Fallon-style apostrophes
 * (which are stripped from the slug and ignored on match).
 */
export function citySlugToTitle(slug) {
  if (!slug || typeof slug !== 'string') return '';
  return String(slug)
    .replace(/[-_]+/g, ' ')
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .map(w => (w.length === 0 ? w : w[0].toUpperCase() + w.slice(1)))
    .join(' ');
}

/**
 * Canonical lowercase hyphenated form of a city for URLs.
 * 'Las Vegas' -> 'las-vegas', "O'Fallon" -> 'ofallon'
 */
export function cityTitleToSlug(title) {
  if (!title || typeof title !== 'string') return '';
  return String(title)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')      // strip accents
    .replace(/[^\w\s-]+/g, '')            // drop apostrophes, punctuation
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

/**
 * Normalize whatever the URL segment is into a 2-letter state code,
 * or return null if it doesn't map to a US state. Accepts:
 *   'nv', 'NV', 'nevada', 'Nevada', 'NEVADA'
 */
export function stateSlugToCode(slug) {
  if (!slug || typeof slug !== 'string') return null;
  const normalized = slug.trim().toLowerCase();
  // 2-letter?
  if (normalized.length === 2) {
    const upper = normalized.toUpperCase();
    return US_STATES_BY_CODE[upper] ? upper : null;
  }
  // full name (with hyphens from URL slugification)
  const spaced = normalized.replace(/-/g, ' ');
  return _NAME_TO_CODE[spaced] || null;
}

/**
 * Full state name from a 2-letter code. 'NV' -> 'Nevada'. Unknown -> null.
 */
export function stateCodeToName(code) {
  if (!code) return null;
  return US_STATES_BY_CODE[String(code).toUpperCase()] || null;
}

/**
 * Canonical URL slug for a state. Just the lowercase code.
 * 'NV' -> 'nv'. Unknown -> null.
 */
export function stateCodeToSlug(code) {
  if (!code) return null;
  const upper = String(code).toUpperCase();
  return US_STATES_BY_CODE[upper] ? upper.toLowerCase() : null;
}

/**
 * Build the canonical URL for a (state, city?) pair.
 * stateCode='NV' -> '/hub/home-games/in/nv'
 * stateCode='NV', city='Las Vegas' -> '/hub/home-games/in/nv/las-vegas'
 */
export function buildGeoUrl(stateCode, city) {
  const stateSlug = stateCodeToSlug(stateCode);
  if (!stateSlug) return '/hub/home-games';
  if (!city) return `/hub/home-games/in/${stateSlug}`;
  const citySlug = cityTitleToSlug(city);
  if (!citySlug) return `/hub/home-games/in/${stateSlug}`;
  return `/hub/home-games/in/${stateSlug}/${citySlug}`;
}
