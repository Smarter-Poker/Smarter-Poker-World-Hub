/**
 * GRINDER STATS API - the horse fleet as it is actually playing.
 *
 * GET  /api/horses/grinder-stats?limit=&offset=
 * POST /api/horses/grinder-stats { action: 'add_to_club' | 'start' | 'stop' }
 *
 * PHASE 1 NOTE (2026-09-02). Rebuilt onto src/lib/horses/operatorRoute.js:
 * fleet.read on GET, fleet.write on POST, and - contract item 8 - the GET is
 * now rate limited, which it never was despite pulling ten thousand rows a
 * call.
 *
 * REVIEW ADDENDUM ITEM 12 (2026-09-02, second pass). The first rebuild paged
 * the roster at 50 rows AND computed "Currently Playing", "Hands Played" and
 * "Fleet Profit" over that page. The console sends no paging parameters and
 * joins the roster against the WHOLE persona list, so every horse past the
 * first fifty rendered Tables 0/4, Hands -, Profit -, Status Idle: fabricated
 * looking data for ~95% of a 1,000 horse fleet, under three headline numbers
 * that had quietly become page-scoped.
 *
 * So now:
 *   - the roster pages with limit (max 500) and offset, and the client pages it;
 *   - the fleet figures are WHOLE FLEET. Every active horse profile id is read
 *     once (in pages of 1,000), then seats and player_stats are read for all of
 *     them in chunks of 200 ids per .in(). `totalsScope` says 'fleet' and the
 *     derivation note says the same thing in a sentence;
 *   - a failed seat or player_stats read nulls the figures it feeds instead of
 *     reporting a partial read as a total, and names itself in `failedSources`.
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
import { paging, runPaged, fetchAll } from '../../../src/lib/horses/paged.js';
import { IN_CHUNK, readByIds, shapeList, sourceCollector } from '../../../src/lib/horses/listShape.js';
import { enumOf } from '../../../src/lib/horses/validate.js';

/**
 * The roster is a real pager now, so the default is the number of rows the
 * console shows at once rather than a console-wide 50, and the ceiling is the
 * 500 the contract fixes. Both are explicit here so a future change to the
 * shared default cannot shrink this list without touching this line.
 */
const ROSTER_PAGE = { defaultLimit: 200, max: 500 };

/** Every active horse profile id, read in pages of this size. */
const FLEET_SCAN_SIZE = 1000;
/** A hard stop so a runaway table cannot turn one request into a full scan. */
const FLEET_MAX = 20000;

const CLUB_ACTIONS = ['add_to_club', 'start', 'stop'];

export const spec = {
  name: 'horses.grinder-stats',
  methods: ['GET', 'POST'],
  permission: { GET: PERMISSIONS.FLEET_READ, POST: PERMISSIONS.FLEET_WRITE },
  limit: { GET: 'read', POST: 'write' },
};

async function readFleet(db, query, requestId) {
  const page = paging(query, ROSTER_PAGE);
  const c = sourceCollector({ requestId, route: 'horses.grinder-stats' });

  // A HORSE IS A ROW WITH A POKER PROFILE (2026-09-02). content_authors also
  // holds 39 social-only personas created 2026-03-10 with a null profile_id:
  // they post, but they have no wallet, no club membership, and cannot be
  // dealt a hand. Counting them here overstated the fleet and, worse, they can
  // never appear in the seat or player_stats joins below - which key on
  // profile_id - so every derived figure was a ratio with a padded denominator.
  const [personasRes, activeCountRes, totalHorsesRes, activeTablesRes, fleetRead] = await Promise.all([
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
    // The WHOLE fleet's profile ids, so the headline figures below are fleet
    // figures. Ids only: this is four bytes of uuid per horse, not a roster.
    fetchAll(
      () =>
        db
          .from('content_authors')
          .select('profile_id')
          .not('profile_id', 'is', null)
          .eq('is_active', true),
      { size: FLEET_SCAN_SIZE, maxRows: FLEET_MAX }
    ),
  ]);

  if (personasRes.error) {
    console.error(
      `[horses.grinder-stats] ${requestId} content_authors read failed:`,
      personasRes.error.message
    );
    throw new ApiError(503, 'The Fleet Roster Is Unavailable', 'roster_unavailable');
  }

  c.check('content_authors_active_count', activeCountRes);
  c.check('content_authors_total_count', totalHorsesRes);
  c.check('tables_active_count', activeTablesRes);
  c.check('content_authors_fleet_ids', fleetRead);

  const personas = personasRes.data || [];
  const fleetIds = [...new Set((fleetRead.rows || []).map((r) => r.profile_id).filter(Boolean))];
  const fleetIdsComplete = !fleetRead.error && !fleetRead.truncated;

  // A horse occupies a seat as its linked profile: the mapping is
  // content_authors.profile_id -> table_seats.user_id. Verified against
  // production 2026-08-26 (366 of 381 occupied seats match a
  // content_authors.profile_id). table_seats.horse_id exists but is NULL for
  // every row, and table_seats.player_id matches no content_authors.id, so
  // neither can be used.
  const seatsRead = fleetIds.length
    ? await readByIds(
        db,
        fleetIds,
        (ids) => db.from('table_seats').select('table_id, user_id').is('left_at', null).in('user_id', ids),
        { size: IN_CHUNK }
      )
    : { rows: [], error: null, partial: false };

  // player_stats is one row per (user_id, club_id). PostgREST aggregate
  // functions are DISABLED on this project (`hands_played.sum()` returns
  // PGRST123 "Use of aggregate functions is not allowed", verified against
  // production 2026-08-26), so the sum happens here - over the fleet's ids,
  // read 200 at a time, rather than by dragging the whole table across.
  const statsRead = fleetIds.length
    ? await readByIds(
        db,
        fleetIds,
        (ids) =>
          db
            .from('player_stats')
            .select('user_id, hands_played, total_winnings, total_losses')
            .in('user_id', ids),
        { size: IN_CHUNK }
      )
    : { rows: [], error: null, partial: false };

  if (seatsRead.error) c.fail('table_seats', seatsRead.error);
  if (statsRead.error) c.fail('player_stats', statsRead.error);

  // A PARTIAL READ IS NOT A TOTAL. readByIds stops at the first failing chunk,
  // so the rows it did collect describe an arbitrary prefix of the fleet.
  // Reporting seats from that prefix means every horse in a later chunk reads
  // as "idle, 0 tables" - which is indistinguishable from the truth and is not
  // it. Both flags are surfaced, and both null the figures they feed.
  const seatsAvailable = !seatsRead.error && fleetIdsComplete;
  const playerStatsAvailable = !statsRead.error && fleetIdsComplete;

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

  const tablesFor = (profileId) => {
    if (!seatsAvailable) return null;
    if (!profileId) return 0;
    return seatsByProfile.get(profileId)?.size || 0;
  };

  const roster = personas.map((p) => {
    const heldTables = tablesFor(p.profile_id);
    // Measured, not fabricated. A horse with no player_stats row has genuinely
    // never been recorded playing a hand, so 0 is the true answer; null is
    // reserved for the case where the read itself failed.
    const perf = p.profile_id ? perfByUser.get(p.profile_id) : null;
    return {
      horse_id: p.id,
      name: p.name,
      tables: heldTables,
      hands: playerStatsAvailable ? perf?.hands || 0 : null,
      profit: playerStatsAvailable ? Math.round((perf?.profit || 0) * 100) / 100 : null,
      status: heldTables === null ? 'unknown' : heldTables > 0 ? 'playing' : 'idle',
    };
  });

  // WHOLE-FLEET figures, computed over every id read above rather than over the
  // page the operator happens to be looking at.
  let fleetHands = 0;
  let fleetProfit = 0;
  for (const id of fleetIds) {
    const perf = perfByUser.get(id);
    if (!perf) continue;
    fleetHands += perf.hands;
    fleetProfit += perf.profit;
  }
  const currentlyPlaying = fleetIds.reduce(
    (n, id) => n + ((seatsByProfile.get(id)?.size || 0) > 0 ? 1 : 0),
    0
  );

  const rosterPage = shapeList(personasRes, page, roster);

  const scopeSentence =
    `Currently Playing, Hands Played and Fleet Profit are WHOLE-FLEET figures over all ${fleetIds.length} ` +
    'active horse profiles, read 200 ids at a time; they do not move when you page the roster. ' +
    `The roster below is one page of ${roster.length} of ${rosterPage.total}. ` +
    'Total Grinders and Total Horses are whole-fleet counts, and Active Tables counts tables with ' +
    'status running or active.';

  const horseSentence =
    'A horse is a roster row carrying a poker profile - social-only personas are excluded, because ' +
    'they cannot hold a seat or a player_stats row and would pad every denominator here.';

  let derivationNote;
  if (playerStatsAvailable && seatsAvailable) {
    derivationNote =
      'All figures are measured. Hands and profit are lifetime totals from player_stats, summed across ' +
      `every club a horse has played in (profit = total_winnings - total_losses). ${scopeSentence} ${horseSentence}`;
  } else {
    const broken = [
      playerStatsAvailable ? null : 'player_stats',
      seatsAvailable ? null : 'table_seats',
    ]
      .filter(Boolean)
      .join(' and ');
    derivationNote =
      `Some figures are unavailable: the ${broken} read did not complete for the whole fleet, so the ` +
      'numbers it feeds are reported as null rather than as zero or as a partial total. ' +
      `${scopeSentence} ${horseSentence}`;
  }

  const stats = {
    // Active horses across the whole fleet, not the page.
    totalGrinders: activeCountRes.count ?? rosterPage.total,
    // Every content_authors row carrying a poker profile, active or not.
    totalHorses: totalHorsesRes.count ?? null,
    currentlyPlaying: seatsAvailable ? currentlyPlaying : null,
    currentlyPlayingScope: 'fleet',
    activeTables: activeTablesRes.count ?? null,
    totalHands: playerStatsAvailable ? fleetHands : null,
    totalProfit: playerStatsAvailable ? Math.round(fleetProfit * 100) / 100 : null,
    totalsScope: 'fleet',
    fleetSize: fleetIds.length,
    roster,
    // True when the fleet id scan hit its ceiling, which would make the fleet
    // figures a floor rather than a total.
    performanceTruncated: Boolean(fleetRead.truncated),
    seatsAvailable,
    playerStatsAvailable,
    // One human-readable sentence, INSIDE stats, because the frontend reads
    // data.stats and renders this value directly. It was previously an object
    // returned as a sibling of stats, so it never reached the UI at all - and
    // would have thrown "Objects are not valid as a React child" if it had.
    derivationNote,
    failedSources: c.list(),
  };

  return {
    stats,
    // Contract item 8: the roster pages, and says how many horses there are.
    roster: rosterPage,
    limit: page.limit,
    offset: page.offset,
    totalsScope: 'fleet',
    failedSources: c.list(),
  };
}

export async function handle({ db, body, query, method, requestId }) {
  if (method === 'GET') return readFleet(db, query, requestId);

  const action = enumOf(body.action, CLUB_ACTIONS);
  if (!action) throw badRequest('Unknown Action');
  // Contract item 9. The client renders an honest Not Built Yet state rather
  // than a disabled button with a paragraph next to it.
  throw new ApiError(501, 'Not Built Yet', 'not_built');
}

export default withOperatorRoute(spec, handle);
