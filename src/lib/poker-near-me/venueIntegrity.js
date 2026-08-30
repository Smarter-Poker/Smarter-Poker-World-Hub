const VALID_LOCATION_STATES = new Set(['verified', 'border', 'approximate', 'unverified', 'missing', 'conflict']);

function coordinate(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizedPart(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function venueLocationState(venue) {
  const supplied = venue?.location_quality?.status;
  if (VALID_LOCATION_STATES.has(supplied)) return supplied;
  if (venue?.venue_type === 'home_game') return 'approximate';
  const latitude = coordinate(venue?.latitude ?? venue?.lat);
  const longitude = coordinate(venue?.longitude ?? venue?.lng);
  return latitude === null || longitude === null ? 'missing' : 'unverified';
}

export function isVenueMapEligible(venue) {
  const latitude = coordinate(venue?.latitude ?? venue?.lat);
  const longitude = coordinate(venue?.longitude ?? venue?.lng);
  if (latitude === null || longitude === null) return false;
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return false;
  return venueLocationState(venue) !== 'conflict' && venue?.location_quality?.mappable !== false;
}

export function summarizeVenueIntegrity(venues = []) {
  const summary = {
    input: 0,
    mapped: 0,
    verified: 0,
    approximate: 0,
    unverified: 0,
    missing: 0,
    held: 0,
  };

  for (const venue of Array.isArray(venues) ? venues : []) {
    if (!venue) continue;
    summary.input += 1;
    const state = venueLocationState(venue);
    if (state === 'verified' || state === 'border') summary.verified += 1;
    else if (state === 'approximate') summary.approximate += 1;
    else if (state === 'missing') summary.missing += 1;
    else if (state === 'conflict') summary.held += 1;
    else summary.unverified += 1;
    if (isVenueMapEligible(venue)) summary.mapped += 1;
  }

  return summary;
}

export function venueIdentityKey(venue) {
  const name = normalizedPart(venue?.name);
  const city = normalizedPart(venue?.city || venue?.location_city);
  const state = normalizedPart(venue?.state || venue?.location_state);
  if (name && city && state) return `place:${name}|${city}|${state}`;
  const id = String(venue?.id || venue?.social_page_id || '').trim();
  return id ? `id:${id}` : null;
}

export function venueRecordScore(venue) {
  const state = venueLocationState(venue);
  let score = 0;
  if (state === 'verified' || state === 'border') score += 40;
  else if (state === 'approximate') score += 20;
  else if (state === 'conflict') score -= 50;
  if (/^\d+$/.test(String(venue?.id || ''))) score += 12;
  if (venue?.data_quality === 'scraped_verified') score += 10;
  if (venue?.address) score += 5;
  if (venue?.phone) score += 4;
  if (venue?.website) score += 3;
  if (venue?.logo_url || venue?.profile_photo_url || venue?.cover_photo_url) score += 2;
  score += Math.max(0, Math.min(5, Number(venue?.trust_score) || 0));
  return score;
}

/**
 * Remove exact same-name/city/state duplicates without ever merging fields from
 * different sources. Field-level merging is what created several cross-venue
 * identity records; this deliberately selects one complete record instead.
 */
export function dedupeVenueRecords(venues = []) {
  const records = Array.isArray(venues) ? venues : [];
  const selected = new Map();
  const order = [];
  let duplicateCount = 0;

  for (const venue of records) {
    if (!venue) continue;
    // Incomplete anonymous records cannot be proven identical. A unique symbol
    // keeps each one intact instead of collapsing unrelated partial imports.
    const key = venueIdentityKey(venue) || Symbol('anonymous-venue');
    if (!selected.has(key)) {
      selected.set(key, venue);
      order.push(key);
      continue;
    }
    duplicateCount += 1;
    if (venueRecordScore(venue) > venueRecordScore(selected.get(key))) selected.set(key, venue);
  }

  return { venues: order.map((key) => selected.get(key)), duplicateCount };
}

export const venueIntegrityContract = Object.freeze({
  statuses: [...VALID_LOCATION_STATES],
  conflictBehavior: 'hold-from-map',
  duplicateBehavior: 'select-whole-record',
});
