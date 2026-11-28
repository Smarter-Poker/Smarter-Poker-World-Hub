/**
 * LIVE room counts, read from the database. Server-only (getServerSideProps,
 * getStaticProps, API routes, build scripts).
 *
 * Every page and API that states how many poker rooms Smarter.Poker lists,
 * how many carry a verification date, how many states they cover, how many
 * rooms a state has or how many spread a game, reads it here. The rows are the
 * listed rooms exactly as the venue directory serves them: the same filter,
 * applyListedRoomFilter from src/lib/poker-near-me/listedRooms.mjs, so a state
 * page, /poker-rooms/states and /hub/poker-near-me/in/<state> agree.
 *
 * When the database cannot be read (error, timeout, or an empty answer that a
 * live directory never gives) the snapshot in src/lib/venueCount.mjs answers,
 * with source 'snapshot', so a page still renders and still never claims more
 * than the last verified read. CI compares that snapshot with live data.
 *
 * One query per process per CACHE_MS: the listed set is a few hundred rows.
 */
import {
  GAME_COUNT_TAGS,
  SNAPSHOT_VENUE_STATS,
  buildVenueStats,
} from '../venueCount.mjs';
import { applyListedRoomFilter, isListedRoom } from '../poker-near-me/listedRooms.mjs';

export const VENUE_STATS_CACHE_MS = 5 * 60 * 1000;
export const VENUE_STATS_TIMEOUT_MS = 5000;
/** ISR window for pages that state counts (seconds). */
export const VENUE_STATS_REVALIDATE_S = 3600;

export const LISTED_ROOM_FIELDS = 'id,name,city,state,games_offered,last_verified_at,poker_tables,is_featured,trust_score';
const PAGE = 1000;
const MAX_ROWS = 10_000;

let cache = null; // { at, rows, stats }
let inflight = null;

/** Test hook: forget the cached read. */
export function resetVenueStatsCache() {
  cache = null;
  inflight = null;
}

async function defaultClient() {
  const { createClient } = await import('../supabaseServerClient.js');
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('venueStats: no Supabase URL or key in this environment');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function withTimeout(promise, ms) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`venueStats: no answer in ${ms} ms`)), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}

/** Read every listed room row (paged). Throws on any error. */
export async function fetchListedRoomRows(client) {
  const rows = [];
  for (let from = 0; from < MAX_ROWS; from += PAGE) {
    const { data, error } = await applyListedRoomFilter(
      client.from('poker_venues').select(LISTED_ROOM_FIELDS),
    )
      .order('id', { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`venueStats: ${error.message || error.code || 'query failed'}`);
    const page = Array.isArray(data) ? data : [];
    rows.push(...page);
    if (page.length < PAGE) break;
  }
  return rows;
}

const STATE_CODE = /^[A-Z]{2}$/;

/** Compute the stats object from listed room rows. Pure. */
export function computeVenueStats(rows, { source = 'live', readAt = new Date().toISOString() } = {}) {
  const byState = {};
  let withoutState = 0;
  let verified = 0;
  const games = { nlh: 0, plo: 0, limitOrMixed: 0, mixed: 0 };
  for (const r of rows) {
    const st = String(r?.state || '').trim().toUpperCase();
    if (STATE_CODE.test(st)) byState[st] = (byState[st] || 0) + 1;
    else withoutState += 1;
    if (r?.last_verified_at) verified += 1;
    const offered = Array.isArray(r?.games_offered) ? r.games_offered : [];
    for (const [k, tags] of Object.entries(GAME_COUNT_TAGS)) {
      if (offered.some((g) => tags.includes(g))) games[k] += 1;
    }
  }
  const sorted = Object.fromEntries(Object.keys(byState).sort().map((k) => [k, byState[k]]));
  return buildVenueStats({
    source, readAt, listed: rows.length, verified, byState: sorted, withoutState, games,
  });
}

async function readLive(client) {
  const c = client || (await defaultClient());
  const rows = await withTimeout(fetchListedRoomRows(c), VENUE_STATS_TIMEOUT_MS);
  // A live directory is never empty; an empty answer is a fault, not a fact.
  if (rows.length === 0) throw new Error('venueStats: the listed set came back empty');
  return { rows, stats: computeVenueStats(rows) };
}

async function load({ client, now = Date.now() } = {}) {
  if (!client && cache && now - cache.at < VENUE_STATS_CACHE_MS) return cache;
  if (!client && inflight) return inflight;
  const p = readLive(client)
    .then((r) => {
      const entry = { at: now, ...r };
      if (!client) cache = entry;
      return entry;
    })
    .finally(() => { if (!client) inflight = null; });
  if (!client) inflight = p;
  return p;
}

/**
 * The live stats, or the snapshot when the database cannot answer.
 * Never throws. `onFallback(error)` is called when the snapshot answers.
 */
export async function getVenueStats({ client, onFallback } = {}) {
  try {
    return (await load({ client })).stats;
  } catch (error) {
    if (typeof onFallback === 'function') onFallback(error);
    return SNAPSHOT_VENUE_STATS;
  }
}

function rankRooms(a, b) {
  if (Boolean(b.is_featured) !== Boolean(a.is_featured)) return b.is_featured ? 1 : -1;
  const tablesDiff = (Number(b.poker_tables) || 0) - (Number(a.poker_tables) || 0);
  if (tablesDiff !== 0) return tablesDiff;
  const trustDiff = (Number(b.trust_score) || 0) - (Number(a.trust_score) || 0);
  if (trustDiff !== 0) return trustDiff;
  return String(a.name || '').localeCompare(String(b.name || ''));
}

function toTopRoom(v) {
  return {
    id: v.id,
    name: v.name,
    city: v.city || '',
    pokerTables: Number(v.poker_tables) || 0,
  };
}

/**
 * The top listed rooms in one state plus that state's stats, from the same
 * read. `fallbackVenues` (the checked-in directory snapshot rows) answers
 * only when the database cannot.
 */
export async function getStateRooms(stateCode, { client, fallbackVenues = [], limit = 8, onFallback } = {}) {
  const code = String(stateCode || '').trim().toUpperCase();
  const inState = (v) => String(v?.state || '').trim().toUpperCase() === code && v?.id != null && v?.name;
  try {
    const { rows, stats } = await load({ client });
    const all = rows.filter(inState).sort(rankRooms);
    return { stats, count: stats.byState[code] || 0, topRooms: all.slice(0, limit).map(toTopRoom), source: stats.source };
  } catch (error) {
    if (typeof onFallback === 'function') onFallback(error);
    const all = (Array.isArray(fallbackVenues) ? fallbackVenues : []).filter(isListedRoom).filter(inState).sort(rankRooms);
    return {
      stats: SNAPSHOT_VENUE_STATS,
      count: SNAPSHOT_VENUE_STATS.byState[code] || 0,
      topRooms: all.slice(0, limit).map(toTopRoom),
      source: 'snapshot',
    };
  }
}

/** Plain JSON copy for page props (Next.js serialises props as JSON). */
export function venueStatsProps(stats) {
  return JSON.parse(JSON.stringify(stats));
}
