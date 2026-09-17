/**
 * Server-side venue data for the public Club Commander venue pages.
 *
 * DISCOVERABILITY PHASE 4 (2026-09-17). /hub/commander/venues and
 * /hub/commander/venues/[id] fetched everything in the browser, so a crawler
 * (and the server HTML) saw a spinner: a directory with no entries and a
 * venue page with no venue. Both pages now render their first content on
 * the server from the same Commander API the browser uses, so the words are
 * in the HTML.
 *
 * The venue records are the poker-near-me venues table: /hub/venues/[id]
 * is the entity page for the same venue (server rendered, Casino schema,
 * indexed). The Commander venue page is the live-games view of that entity,
 * so it canonicalizes to the entity page rather than competing with it.
 */
const COMMANDER_API = process.env.COMMANDER_API_ORIGIN || 'https://commander.smarter.poker';
const TIMEOUT_MS = 4000;

/** Resolves to { status, data }: status is the HTTP status, 0 when the API could not be reached in time. */
async function fetchJson(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { accept: 'application/json' } });
    let data = null;
    try {
      data = await res.json();
    } catch {
      data = null;
    }
    return { status: res.status, data };
  } catch {
    return { status: 0, data: null };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * The subset of a Commander venue record the two pages render, under the
 * API's own field names so the server-rendered venue and the browser-fetched
 * venue are the same shape. Props must be JSON: every field is a string, a
 * number, a string array or null (never undefined).
 */
export function toSeoVenue(v) {
  if (!v || typeof v !== 'object' || v.id === undefined || v.id === null) return null;
  const s = (x) => (typeof x === 'string' && x.trim() ? x.trim() : null);
  const n = (x) => (typeof x === 'number' && Number.isFinite(x) ? x : null);
  return {
    id: Number(v.id),
    name: s(v.name),
    city: s(v.city),
    state: s(v.state),
    address: s(v.address),
    phone: s(v.phone),
    website: s(v.website),
    description: s(v.description) || s(v.about) || s(v.tagline),
    hours: s(v.hours) || s(v.hours_weekday),
    rating: n(v.rating),
    total_tables: n(v.total_tables) ?? n(v.poker_tables),
    venue_type: s(v.venue_type),
    active_games: n(v.active_games) || 0,
    waitlist_count: n(v.waitlist_count) || 0,
    stakes_spread: Array.isArray(v.stakes_spread) ? v.stakes_spread.filter((x) => typeof x === 'string').slice(0, 8) : [],
    distance_mi: null,
  };
}

/** Home games have no public entity page, so their Commander page stays out of the index. */
export function isPublicVenue(v) {
  return !!v && !!v.name && v.venue_type !== 'home_game';
}

/**
 * The first page of the public directory. Resolves to { venues, status }:
 * status is 'ok' when the API answered, 'unavailable' when it did not, so the
 * page can tell an empty directory from an outage.
 */
export async function fetchVenueList(limit = 50) {
  const { status, data } = await fetchJson(`${COMMANDER_API}/api/venues?filter=all&limit=${limit}`);
  const venues = data?.success ? data.data?.venues : null;
  if (!Array.isArray(venues)) return { venues: [], status: 'unavailable' };
  return { venues: venues.map(toSeoVenue).filter(Boolean), status: 'ok' };
}

/**
 * One venue. Resolves to { venue, status }: status is 'ok', 'not-found' (the
 * API says so, or the id is not a venue id) or 'unavailable' (the API did not
 * answer), so the page can send a true 404 for a venue that does not exist
 * and a 503 for one it could not look up.
 */
export async function fetchVenue(id) {
  if (!/^\d+$/.test(String(id))) return { venue: null, status: 'not-found' };
  const { status, data } = await fetchJson(`${COMMANDER_API}/api/venues/${id}`);
  const venue = data?.success ? toSeoVenue(data.data?.venue) : null;
  if (venue) return { venue, status: 'ok' };
  if (status === 404 || data?.error?.code === 'NOT_FOUND') return { venue: null, status: 'not-found' };
  return { venue: null, status: 'unavailable' };
}

export function venueTitle(v) {
  const place = [v.city, v.state].filter(Boolean).join(', ');
  return place ? `${v.name} Poker Room In ${place}` : `${v.name} Poker Room`;
}

export function venueDescription(v) {
  const place = [v.city, v.state].filter(Boolean).join(', ');
  return `Live Games, Waitlists And Tournaments At ${v.name}${place ? ` In ${place}` : ''} On Club Commander. See What Is Running, Join The Waitlist Before You Leave The House, And Earn Rewards At The Table.`;
}

/** The entity page for the same venue: server rendered, Casino schema, indexed. */
export function venueEntityPath(v) {
  return `/hub/venues/${v.id}`;
}
