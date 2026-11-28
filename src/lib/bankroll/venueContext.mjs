// What the Poker Near Me directory knows about a room the player has logged.
//
// A bankroll_locations row is linked to a directory venue by
// bankroll_locations.poker_venue_id -> poker_venues.id, the same link
// /api/bankroll/linked-venues.js reads (through the embedded
// poker_venues(...) relationship) to resolve directory coordinates. This
// reads that link for the player's own locations and nothing else: a venue
// with no link shows nothing extra, never a guessed match by name.
//
// Only catalogue fields are read (games and cash stakes listed, opening
// hours). Nothing here comes from venue_live_tables or game_live_history,
// and nothing is presented as a live table count. The directory has no rake
// column, so rake is not shown.

export const DIRECTORY_FIELDS = 'id, name, venue_type, city, state, games_offered, stakes_cash, hours, hours_weekday, hours_weekend, is_active, is_suppressed, canonical_venue_id';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BATCH = 100;

function cleanList(values, max = 8) {
  const out = [];
  const seen = new Set();
  for (const value of Array.isArray(values) ? values : []) {
    const text = String(value ?? '').replace(/\s+/g, ' ').trim();
    if (!text || text.length > 40) continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(text);
    if (out.length >= max) break;
  }
  return out;
}

const cleanText = (value) => {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  return text && text.length <= 80 ? text : null;
};

/**
 * The directory facts for one directory row, or null when the row cannot be
 * shown (missing, inactive, a home game, or suppressed with no canonical room).
 */
export function directoryFacts(venue) {
  if (!venue || venue.id === null || venue.id === undefined) return null;
  if (venue.is_active === false || venue.is_suppressed === true) return null;
  if (venue.venue_type === 'home_game') return null;
  const hours = [];
  const weekday = cleanText(venue.hours_weekday);
  const weekend = cleanText(venue.hours_weekend);
  const general = cleanText(venue.hours);
  if (weekday) hours.push({ label: 'Weekdays', text: weekday });
  if (weekend) hours.push({ label: 'Weekends', text: weekend });
  if (!hours.length && general) hours.push({ label: 'Hours', text: general });
  return {
    id: venue.id,
    name: cleanText(venue.name),
    place: [cleanText(venue.city), cleanText(venue.state)].filter(Boolean).join(', ') || null,
    games: cleanList(venue.games_offered),
    stakes: cleanList(venue.stakes_cash),
    hours,
    href: '/hub/venues/' + encodeURIComponent(String(venue.id)),
  };
}

const idBatches = (ids) => {
  const out = [];
  for (let i = 0; i < ids.length; i += BATCH) out.push(ids.slice(i, i + BATCH));
  return out;
};

/**
 * Map of bankroll location id -> directory facts, for the given location ids.
 * A suppressed duplicate is followed to its canonical room. Read errors throw.
 */
export async function loadVenueContext(client, locationIds) {
  const ids = [...new Set((locationIds || []).filter((id) => UUID.test(String(id))))];
  const result = new Map();
  if (!ids.length) return result;

  const links = [];
  for (const batch of idBatches(ids)) {
    const { data, error } = await client
      .from('bankroll_locations')
      .select(`id, poker_venue_id, poker_venues(${DIRECTORY_FIELDS})`)
      .in('id', batch);
    if (error) throw new Error(`Could not read your venues: ${error.message || error}`);
    links.push(...(data || []));
  }

  const canonicalIds = [];
  for (const link of links) {
    const venue = link && link.poker_venue_id !== null && link.poker_venue_id !== undefined ? link.poker_venues : null;
    if (venue && venue.is_suppressed === true && venue.canonical_venue_id) canonicalIds.push(venue.canonical_venue_id);
  }
  const canonical = new Map();
  const uniqueCanonical = [...new Set(canonicalIds)];
  for (const batch of idBatches(uniqueCanonical)) {
    const { data, error } = await client.from('poker_venues').select(DIRECTORY_FIELDS).in('id', batch);
    if (error) throw new Error(`Could not read the venue directory: ${error.message || error}`);
    for (const row of data || []) canonical.set(String(row.id), row);
  }

  for (const link of links) {
    if (!link || link.poker_venue_id === null || link.poker_venue_id === undefined) continue;
    let venue = link.poker_venues;
    // The embedded row must be the linked one, or it is not a match.
    if (!venue || String(venue.id) !== String(link.poker_venue_id)) continue;
    if (venue.is_suppressed === true && venue.canonical_venue_id) venue = canonical.get(String(venue.canonical_venue_id));
    const facts = directoryFacts(venue);
    if (facts) result.set(link.id, facts);
  }
  return result;
}
