/**
 * Personal data never leaves through a public venue surface.
 *
 * On 2026-11-11 two public downloads (public/data/all-venues.json and
 * public/data/poker-venue-directory-snapshot.json) and the /api/poker/venues
 * list and detail responses were found to carry operator PII: an operator's
 * personal email and claiming user id on a self-registered club, and the
 * street address, ZIP and phone of an unverified self-registered listing.
 *
 * Two rules, applied at every public boundary (API responses, the directory
 * projection, SSR venue props, and the generators that write the JSON files):
 *
 * 1. Operator and account fields are never public: email, claimed_by,
 *    primary_contact_id. A club's chosen public contact is published through
 *    its own club page, not through bulk venue data.
 * 2. A self-registered listing that has not been verified is not a confirmed
 *    business, so its street address, ZIP, phone and coordinates stay private
 *    until it is verified. City and state remain, so it is still findable.
 *    Verified venues keep their business address and phone.
 *
 * __tests__/public-venue-privacy.test.mjs holds both rules in place.
 */

export const OPERATOR_PRIVATE_FIELDS = Object.freeze(['email', 'claimed_by', 'primary_contact_id']);
export const UNVERIFIED_LOCATION_FIELDS = Object.freeze(['address', 'zip', 'phone', 'latitude', 'longitude', 'lat', 'lng']);

// poker_venues.data_quality holds 'scraped_verified', 'canonical' or
// 'unverified' (2026-11-11). Only the first two count as verified; anything
// else, including a missing value, is treated as unverified.
const VERIFIED_QUALITIES = new Set(['scraped_verified', 'canonical']);

export function isUnverifiedSelfRegistration(venue) {
  return Boolean(venue)
    && String(venue.source || '').toLowerCase() === 'self_registration'
    && !VERIFIED_QUALITIES.has(String(venue.data_quality || '').toLowerCase());
}

/** Return a copy of a venue that is safe to publish. Non-objects pass through. */
export function redactPublicVenue(venue) {
  if (!venue || typeof venue !== 'object' || Array.isArray(venue)) return venue;
  const out = { ...venue };
  for (const field of OPERATOR_PRIVATE_FIELDS) delete out[field];
  if (isUnverifiedSelfRegistration(venue)) {
    for (const field of UNVERIFIED_LOCATION_FIELDS) {
      if (field in out) out[field] = null;
    }
  }
  return out;
}

export function redactPublicVenues(venues) {
  return Array.isArray(venues) ? venues.map(redactPublicVenue) : venues;
}
