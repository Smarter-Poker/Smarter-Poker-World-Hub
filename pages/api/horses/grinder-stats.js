/**
 * GRINDER STATS API - the horse fleet as it is actually playing.
 *
 * GET  /api/horses/grinder-stats?limit=&offset=
 * POST /api/horses/grinder-stats { action: 'add_to_club' | 'start' | 'stop' }
 *
 * PHASE 1 NOTE (2026-09-02). Rebuilt onto src/lib/horses/operatorRoute.js:
 * fleet.read on GET, fleet.write on POST, and - contract item 8 - the GET is
 * now rate limited, which it never was despite pulling ten thousand rows a
 * call. The roster pages, and seats and player_stats are read ONLY for the
 * horse ids on the page, chunked at 200 ids per .in(), instead of dragging the
 * whole player_stats table across the wire and grouping it in JS.
 *
 * Because the performance figures are now read for the page rather than for the
 * fleet, the totals derived from them are PAGE-SCOPED and say so, in
 * `totalsScope` and in `derivationNote`. A capped figure presented as a total
 * is the exact failure this console's audit is about; a page-scoped figure that
 * announces itself is not.
 *
 * POST is honest about being unbuilt: contract item 9, 501 with code
 * 'not_built'. All three actions were no-ops that returned success -
 * add_to_club reported "Added N horses to Shark Club with 10000 initial chips
 * each" without inserting a single club_members row or moving one chip. Seating
 * horses and granting chips is real money movement, and the house rule is that
 * chip paths are not exercised speculatively.
 */
import { withOperatorRoute } from '../../../src/lib/horses/operatorRoute.js';
import { PERMISSIONS } from '../../../src/lib/horses/permissions.js';
import { ApiError, badRequest } from '../../../src/lib/horses/apiEnvelope.js';
import { paging, runPaged, pagedResult } from '../../../src/lib/horses/paged.js';
import { enumOf } from '../../../src/lib/horses/validate.js';

const ROSTER_PAGE = { defaultLimit: 50, max: 200 };
/** PostgREST .in() lists are sent in the URL; 200 ids per call keeps it sane. */
const IN_CHUNK = 200;

const CLUB_ACTIONS = ['add_to_club', 'start', 'stop'];

function chunk(list, size) {
  const out = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

/** One .in() per chunk, merged. Returns { rows, error } and never throws. */
async function readByIds(db, ids, build) {
  const rows = [];
  let error = null;
  for (const part of chunk(ids, IN_CHUNK)) {
    const res = await build(part);
    if (res.error) {
      error = res.error;
      break;
    }
    rows.push(...(res.data || []));
  }
  return { rows, error };
}

export const spec = {
  name: 'horses.grinder-stats',
  methods: ['GET', 'POST'],
  permission: { GET: PERMISSIONS.FLEET_READ, POST: PERMISSIONS.FLEET_WRITE },
  limit: { GET: 'read', POST: 'write' },
};

async function readFleet(db, query) {
  const page = paging(query, ROSTER_PAGE);

  // A HORSE IS A ROW WITH A POKER PROFILE (2026-09-02). content_authors also
  // holds 39 social-only personas created 2026-03-10 with a null profile_id:
  // they post, but they have no wallet, no club membership, and cannot be
  // dealt a hand. Counting them here overstated the fleet and, worse, they can
  // never appear in the seat or player_stats joins below - which key on
  // profile_id - so every derived figure was a ratio with a padded denominator.
  const [personasRes, activeCountRes, totalHorsesRes, activeTablesRes] = await Promise.all([
    runPaged(
      db
        .from('content_authors')
        .select('id, name, profile_id, is_active', { count: 'exact' })
        .not('profile_id', 'is', null)
        .eq('is_active', true)
        .order('name', { ascending: true }),
      page
    ),
    db
      .from('content_authors')
      .select('id', { count: 'exact', head: true })
      .not('profile_id', 'is', null)
      .eq('is_active', true),
    // Every horse, active or not, so the UI can label the two populations
    // honestly instead of calling the active subset "total".
    db.from('content_authors').select('id', { count: 'exact', head: true }).not('profile_id', 'is', null),
    db.from('tables').select('id', { count: 'exact', head: true }).in('status', ['running', 'active']),
  ]);

  if (personasRes.error) {
    console.error('[horses.grinder-stats] content_authors read failed:', personasRes.error.message);
    throw new ApiError(503, 'The Fleet Roster Is Unavailable', 'roster_unavailable');
  }

  const personas = personasRes.data || [];
  const profileIds = [...new Set(personas.map((p) => p.profile_id).filter(Boolean))];

  // A horse occupies a seat as its linked profile: the mapping is
  // content_authors.profile_id -> table_seats.user_id. Verified against
  // production 2026-08-26 (366 of 381 occupied seats match a
  // content_authors.profile_id). table_seats.horse_id exists but is NULL for
  // every row, and table_seats.player_id matches no content_authors.id, so
  // neither can be used.
  const seatsRead = profileIds.length
    ? await readByIds(db, profileIds, (ids) =>
        db.from('table_seats').select('table_id, user_id').is('left_at', null).in('user_id', ids)
      )
    : { rows: [], error: null };

  // player_stats is one row per (user_id, club_id). Read for the page's horses
  // only and summed across their clubs. PostgREST aggregate functions are
  // DISABLED on this project (`hands_played.sum()` returns PGRST123 "Use of
  // aggregate functions is not allowed", verified against production
  // 2026-08-26), so the sum happens here; the row set it happens over is now
  // bounded by the page instead of by the table.
  const statsRead = profileIds.length
    ? await readByIds(db, profileIds, (ids) =>
        db
          .from('player_stats')
          .select('user_id, hands_played, total_winnings, total_losses')
          .in('user_id', ids)
      )
    : { rows: [], error: null };

  if (seatsRead.error) console.warn('[horses.grinder-stats] table_seats error:', seatsRead.error.message);
  if (statsRead.error) console.warn('[horses.grinder-stats] player_stats error:', statsRead.error.message);

  const playerStatsAvailable = !statsRead.error;

  // Lifetime hands + profit per user, summed over that user's rows (one per
  // club they have played in).
  const perfByUser = new Map();
  statsRead.rows.forEach((row) => {
    if (!row?.user_id) return;
    const agg = perfByUser.get(row.user_id) || { hands: 0, profit: 0 };
    agg.hands += Number(row.hands_played) || 0;
    agg.profit += (Number(row.total_winnings) || 0) - (Number(row.total_losses) || 0);
    perfByUser.set(row.user_id, agg);
  });

  // Seats currently held, per horse profile id.
  const seatsByProfile = new Map();
  seatsRead.rows.forEach((s) => {
    if (!s.user_id) return;
    const set = seatsByProfile.get(s.user_id) || new Set();
    if (s.table_id) set.add(s.table_id);
    seatsByProfile.set(s.user_id, set);
  });

  const roster = personas.map((p) => {
    const heldTables = p.profile_id ? seatsByProfile.get(p.profile_id)?.size || 0 : 0;
    // Measured, not fabricated. A horse with no player_stats row has genuinely
    // never been recorded playing a hand, so 0 is the true answer; null is
    // reserved for the case where the player_stats read itself failed.
    const perf = p.profile_id ? perfByUser.get(p.profile_id) : null;
    return {
      horse_id: p.id,
      name: p.name,
      tables: heldTables,
      hands: playerStatsAvailable ? perf?.hands || 0 : null,
      profit: playerStatsAvailable ? Math.round((perf?.profit || 0) * 100) / 100 : null,
      status: heldTables > 0 ? 'playing' : 'idle',
    };
  });

  const measuredRoster = roster.filter((r) => r.hands != null);
  const totalHands = measuredRoster.reduce((sum, r) => sum + r.hands, 0);
  const totalProfit = Math.round(measuredRoster.reduce((sum, r) => sum + (r.profit || 0), 0) * 100) / 100;

  const rosterPage = { ...pagedResult(personasRes, page), rows: roster };

  const scopeSentence =
    'Hands, profit and Currently Playing are measured for the horses on THIS PAGE of the roster ' +
    `(${roster.length} of ${rosterPage.total}); page the roster to see the rest. ` +
    'Total Grinders and Total Horses are whole-fleet counts, and Active Tables counts tables with ' +
    'status running or active.';

  const stats = {
    // Active horses across the whole fleet, not the page.
    totalGrinders: activeCountRes.count ?? rosterPage.total,
    // Every content_authors row carrying a poker profile, active or not.
    totalHorses: totalHorsesRes.count ?? null,
    currentlyPlaying: roster.filter((r) => r.tables > 0).length,
    currentlyPlayingScope: 'current page',
    activeTables: activeTablesRes.count ?? null,
    totalHands: playerStatsAvailable ? totalHands : null,
    totalProfit: playerStatsAvailable ? totalProfit : null,
    totalsScope: 'current page',
    roster,
    // Kept for the console that reads it. The page-scoped read cannot be
    // truncated by a row cap any more, so it is always false.
    performanceTruncated: false,
    // One human-readable sentence, INSIDE stats, because the frontend reads
    // data.stats and renders this value directly. It was previously an object
    // returned as a sibling of stats, so it never reached the UI at all - and
    // would have thrown "Objects are not valid as a React child" if it had.
    derivationNote: playerStatsAvailable
      ? `All figures are measured. Hands and profit are lifetime totals from player_stats, summed across every club a horse has played in (profit = total_winnings - total_losses). ${scopeSentence} A horse is a roster row carrying a poker profile - social-only personas are excluded, because they cannot hold a seat or a player_stats row and would pad every denominator here.`
      : `Hands and profit are unavailable: the player_stats read failed, so they are reported as null rather than as zero. ${scopeSentence} A horse is a roster row carrying a poker profile - social-only personas are excluded, because they cannot hold a seat or a player_stats row and would pad every denominator here.`,
  };

  return {
    stats,
    // Contract item 8: the roster pages, and says how many horses there are.
    roster: rosterPage,
    limit: page.limit,
    offset: page.offset,
  };
}

export async function handle({ db, body, query, method }) {
  if (method === 'GET') return readFleet(db, query);

  const action = enumOf(body.action, CLUB_ACTIONS);
  if (!action) throw badRequest('Unknown Action');
  // Contract item 9. The client renders an honest Not Built Yet state rather
  // than a disabled button with a paragraph next to it.
  throw new ApiError(501, 'Not Built Yet', 'not_built');
}

export default withOperatorRoute(spec, handle);
