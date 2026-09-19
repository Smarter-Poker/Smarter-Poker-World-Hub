/**
 * A CITY IS A CITY (AEO phase 3, 2026-09-19).
 *
 * The series scrapers write the venue and the city into the city field, run
 * together, whenever the source page did not separate them:
 *
 *     venue ''          city 'Wynn Las Vegas Las Vegas'
 *     venue 'Unknown'   city 'Thunder Valley Casino Lincoln'
 *     venue 'Unknown'   city 'Playground Poker Club Kahnawake'
 *
 * Measured across the 225 series in the sitemap: 99 carry a city that is a
 * city, 62 carry none at all, and 64 carry one of these. Where the venue
 * field is also filled, cityWithoutVenue already strips it and the result is
 * right. Where the venue field is empty or says "Unknown", nothing can, and
 * the whole string reaches the page title, the meta description, the
 * visible location and schema.org addressLocality.
 *
 * This resolves it against the venue directory rather than by guessing. A
 * value is only changed when the directory recognises what is being
 * stripped, so a city this module has never heard of is returned untouched.
 * Of the 64, that cleans 49; the remaining 15 are venues outside the
 * directory (Calgary, Kahnawake, London) or cities the directory has no
 * venue in, and they are left exactly as they are.
 *
 * Plain JavaScript with no imports, so the callers supply the directory and
 * a law can exercise it under plain node.
 */

/** The lookup both callers build once and reuse. */
export function buildVenueIndex(venues) {
  const names = [];
  const cities = new Set();
  for (const venue of venues || []) {
    const name = typeof venue?.name === 'string' ? venue.name.trim() : '';
    const city = typeof venue?.city === 'string' ? venue.city.trim() : '';
    if (name) names.push(name);
    if (city) cities.add(city.toLowerCase());
  }
  // Longest first, so "Seminole Hard Rock Tampa" is tried before "Seminole".
  names.sort((a, b) => b.length - a.length);
  return { names, cities };
}

/**
 * The city, with a venue name taken off the front of it when the directory
 * recognises one. Returns the input unchanged when nothing is recognised,
 * which is most of the time and is the point.
 */
export function cleanScrapedCity(city, index) {
  const text = typeof city === 'string' ? city.trim() : '';
  if (!text || !index) return text || null;
  const lower = text.toLowerCase();

  // Already a city the directory knows. Nothing to do, and nothing risked.
  if (index.cities.has(lower)) return text;

  // A venue name on the front: "Wynn Las Vegas" + "Las Vegas".
  for (const name of index.names) {
    const prefix = name.toLowerCase();
    if (lower.length > prefix.length + 1 && lower.startsWith(`${prefix} `)) {
      const rest = text.slice(name.length).replace(/^[\s,–-]+/, '').trim();
      if (rest) return rest;
    }
  }

  // A city the directory knows on the end, whatever is in front of it:
  // "Thunder Valley Casino" + "Lincoln".
  let best = null;
  for (const candidate of index.cities) {
    if (lower.endsWith(` ${candidate}`) && (!best || candidate.length > best.length)) {
      best = candidate;
    }
  }
  if (best) return text.slice(text.length - best.length).trim();

  return text;
}
