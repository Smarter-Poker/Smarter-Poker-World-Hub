// Club Arena sessions in the Bankroll Manager.
//
// Club Arena and the World Hub share one database and one signed-in session,
// so a player's finished Club Arena cash sittings and tournaments can be read
// here and offered to the bankroll ledger in one tap.
//
// WHERE THE RECORD COMES FROM
// `chip_ledger` is Club Arena's double-entry chip journal, written by the
// server's own money RPCs (never by the browser). Its row policy lets a player
// read every row where they are `from_entity_id`, `to_entity_id` or
// `performed_by`; the reads here ask for the player's own wallet legs only:
//   cash:        player_wallet -> table_stack      (buyin, addon, rebuy)
//                table_stack   -> player_wallet    (table_cashout, refund,
//                                                   player_funding, cashout)
//   tournaments: player_wallet -> prize_liability  (tournament_buyin, rebuy, addon)
//                prize_liability -> player_wallet  (tournament_prize, bounty, refund)
// `session_history` exists too, but the Club Arena browser writes it, fire and
// forget, only for sittings with a played hand, so it is the weaker witness.
//
// A CASH SITTING is a run of funding legs at one game followed by its return
// legs. A game is the table's cluster (`tables.cluster_id`): Club Arena moves a
// seated player between the tables of one cluster (`cash_seat_moves`) without a
// ledger row, so grouping by table would leave the first table "still seated"
// and the second "cashed out without a buy-in". The next funding leg after a
// return starts a new sitting. A sitting with no return yet is still open and
// is not offered.
//
// WHAT A CHIP IS WORTH
// Club Arena's play currency is the club chip. The one documented valuation in
// the code base is the owner's ruling recorded on `ca_bridge_rate` (Dan,
// 2026-09-07): "1 diamond = $0.01, 1 chip = $1.00". Club Arena's own published
// terms say its chips carry no cash value and are not cashed out through the
// app; players settle with their club's agent off the platform. So results are
// shown as chips, and logging them as dollars is an offer the player takes, at
// that stated rate, never an automatic import. Diamond Arena clubs
// (`clubs.asset = 'diamonds'`) play for diamonds, a purchased in-app currency
// that is not cashed out: those are left out, and counted so the panel can say
// so.
//
// DEDUPE
// bankroll_ledger has no source or external-id column, so each imported row's
// notes carry a deterministic marker, `[club-arena:cash:<first leg id>]` or
// `[club-arena:mtt:<tournament id>]`, and a session whose marker is already in
// the player's ledger shows as logged and is never offered again. The column
// this wants is `bankroll_ledger.external_ref text` with a unique index on
// (user_id, external_ref) where external_ref is not null.

import { toCents } from './ledgerMath.mjs';
import { localDay } from './localDates.mjs';

/** Dollars per club chip, from the owner's ruling on ca_bridge_rate (2026-09-07). */
export const CHIP_USD_RATE_CENTS = 100;
export const CHIP_RATE_NOTE = 'Amounts Are Club Chips. Logging Uses Club Arena\'s Rate Of 1 Chip = $1.00 (Owner Ruling, 2026-09-07). Club Arena Itself Pays No Cash, So Log A Result Only If It Is Money You Actually Won Or Lost.';

export const MARKER_PREFIX = '[club-arena:';
const MARKER_RE = /\[club-arena:(cash|mtt):([0-9a-zA-Z-]+)\]/g;

/** Days read before the start date so a sitting that began earlier is never cut in two. */
export const LOOKBACK_DAYS = 3;
export const PAGE_SIZE = 1000;
export const MAX_ROWS = 100000;
export const ID_BATCH = 100;

export const CASH_IN = Object.freeze({ from: 'player_wallet', to: 'table_stack' });
export const CASH_OUT = Object.freeze({ from: 'table_stack', to: 'player_wallet' });
export const MTT_IN = Object.freeze({ from: 'player_wallet', to: 'prize_liability' });
export const MTT_OUT = Object.freeze({ from: 'prize_liability', to: 'player_wallet' });

export function cashMarker(key) { return `${MARKER_PREFIX}cash:${key}]`; }
export function mttMarker(tournamentId) { return `${MARKER_PREFIX}mtt:${tournamentId}]`; }
export function markerOf(session) {
  return session.kind === 'cash' ? cashMarker(session.key) : mttMarker(session.key);
}

/** Every Club Arena marker found in a list of ledger notes. */
export function markersIn(notesList) {
  const found = new Set();
  for (const notes of notesList || []) {
    if (!notes) continue;
    for (const match of String(notes).matchAll(MARKER_RE)) found.add(`${MARKER_PREFIX}${match[1]}:${match[2]}]`);
  }
  return found;
}

/** Split ids into URL-sized batches for `.in()` reads. */
export function idBatches(ids, size = ID_BATCH) {
  const unique = [...new Set((ids || []).filter(Boolean))];
  const out = [];
  for (let i = 0; i < unique.length; i += size) out.push(unique.slice(i, i + size));
  return out;
}

const byTime = (a, b) => (a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : String(a.id) < String(b.id) ? -1 : String(a.id) > String(b.id) ? 1 : 0);

/**
 * Group a player's cash legs into sittings.
 * @param {Array} legs chip_ledger rows (id, created_at, from_type, to_type, amount, club_id, table_id)
 * @param {Map|object} gameOf table_id -> game key (cluster id); a missing table is its own game
 * @returns {{ finished: Array, open: number, orphanReturns: number }}
 */
export function groupCashSittings(legs, gameOf = new Map()) {
  const lookup = (tableId) => (gameOf instanceof Map ? gameOf.get(tableId) : gameOf?.[tableId]) || tableId;
  const current = new Map();
  const finished = [];
  let orphanReturns = 0;
  const close = (sitting) => { if (sitting && sitting.returns > 0) finished.push(sitting); };

  for (const leg of [...(legs || [])].sort(byTime)) {
    if (!leg || !leg.table_id) continue;
    const isIn = leg.from_type === CASH_IN.from && leg.to_type === CASH_IN.to;
    const isOut = leg.from_type === CASH_OUT.from && leg.to_type === CASH_OUT.to;
    if (!isIn && !isOut) continue;
    const game = lookup(leg.table_id);
    let sitting = current.get(game);
    if (isIn) {
      if (!sitting || sitting.returns > 0) {
        close(sitting);
        sitting = {
          kind: 'cash', key: String(leg.id), game, clubId: leg.club_id || null,
          tableIds: [], satDownAt: leg.created_at, stoodUpAt: null,
          buyInCents: 0, cashOutCents: 0, fundings: 0, returns: 0,
        };
        current.set(game, sitting);
      }
      sitting.buyInCents += toCents(leg.amount);
      sitting.fundings += 1;
    } else {
      if (!sitting) { orphanReturns += 1; continue; }
      sitting.cashOutCents += toCents(leg.amount);
      sitting.returns += 1;
      sitting.stoodUpAt = leg.created_at;
    }
    if (!sitting.clubId && leg.club_id) sitting.clubId = leg.club_id;
    if (!sitting.tableIds.includes(leg.table_id)) sitting.tableIds.push(leg.table_id);
  }
  let open = 0;
  for (const sitting of current.values()) {
    if (sitting.returns > 0) finished.push(sitting); else open += 1;
  }
  finished.sort((a, b) => (a.satDownAt < b.satDownAt ? -1 : a.satDownAt > b.satDownAt ? 1 : 0));
  return { finished, open, orphanReturns };
}

/** Group a player's tournament legs by tournament. */
export function groupTournamentEntries(legs) {
  const byTournament = new Map();
  for (const leg of [...(legs || [])].sort(byTime)) {
    if (!leg || !leg.tournament_id) continue;
    const isIn = leg.from_type === MTT_IN.from && leg.to_type === MTT_IN.to;
    const isOut = leg.from_type === MTT_OUT.from && leg.to_type === MTT_OUT.to;
    if (!isIn && !isOut) continue;
    let t = byTournament.get(leg.tournament_id);
    if (!t) {
      t = {
        kind: 'mtt', key: String(leg.tournament_id), clubId: leg.club_id || null,
        firstLegAt: leg.created_at, lastLegAt: leg.created_at,
        entries: 0, entryCents: 0, firstEntryCents: 0, rebuys: 0, addons: 0, addonCents: 0,
        debitCents: 0, prizeCents: 0, bountyCents: 0, refundCents: 0,
      };
      byTournament.set(leg.tournament_id, t);
    }
    const cents = toCents(leg.amount);
    t.lastLegAt = leg.created_at;
    if (!t.clubId && leg.club_id) t.clubId = leg.club_id;
    if (isIn) {
      t.debitCents += cents;
      if (leg.category === 'tournament_buyin') {
        if (t.entries === 0) t.firstEntryCents = cents;
        t.entries += 1;
        t.entryCents += cents;
      } else if (leg.category === 'addon') { t.addons += 1; t.addonCents += cents; }
      else t.rebuys += 1;
    } else if (leg.category === 'bounty') t.bountyCents += cents;
    else if (leg.category === 'refund') t.refundCents += cents;
    else t.prizeCents += cents;
  }
  return [...byTournament.values()];
}

const VARIANT_NAMES = {
  nlh: 'NLH', plo4: 'PLO', plo5: 'PLO5', plo6: 'PLO6', plo8: 'PLO8 Hi-Lo',
  flh: 'Limit Hold\'em', flo8: 'Limit Omaha Hi-Lo', short_deck: 'Short Deck', pineapple: 'Pineapple',
};

/** Club Arena game variant (tables.game_variant or tournaments.game_type) to the ledger's game_type. */
export function ledgerGameType(variant) {
  const v = String(variant || '').toLowerCase();
  if (v === 'nlh' || v === 'nlhe') return 'nlhe';
  if (/^plo/.test(v)) return 'plo';
  if (!v) return null;
  return 'other';
}

export function variantName(variant) {
  const v = String(variant || '').toLowerCase();
  return VARIANT_NAMES[v] || (v ? v.toUpperCase() : '');
}

function blindText(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '';
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0$/, '');
}

/** "1/2 NLH" from a table's blinds and variant; null when the table is unknown. */
export function stakesText(table) {
  if (!table) return null;
  const sb = blindText(table.small_blind);
  const bb = blindText(table.big_blind);
  const blinds = sb && bb ? `${sb}/${bb}` : (table.stakes || '');
  const name = variantName(table.game_variant);
  const text = [blinds, name].filter(Boolean).join(' ');
  return text || null;
}

const MTT_TYPES = {
  sng: 'sit_n_go', spin: 'sit_n_go', satellite: 'satellite', bounty: 'bounty',
  progressive_bounty: 'pko', mystery_bounty: 'mystery_bounty', freezeout: 'mtt', rebuy: 'mtt',
};

export function ledgerTournamentType(tournament) {
  if (!tournament) return null;
  const variant = String(tournament.variant || '').toLowerCase();
  if (MTT_TYPES[variant]) return MTT_TYPES[variant];
  const type = String(tournament.tournament_type || '').toUpperCase();
  if (type === 'SNG' || type === 'SPIN') return 'sit_n_go';
  if (type === 'SATELLITE') return 'satellite';
  return 'mtt';
}

export function venueName(clubName) {
  const name = String(clubName || '').trim();
  return `Club Arena - ${name || 'Unknown Club'}`;
}

export function durationMinutes(startIso, endIso) {
  const start = Date.parse(startIso);
  const end = Date.parse(endIso);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return null;
  return Math.round((end - start) / 60000);
}

/** Chip cents (a chip amount times 100) to US cents at the stated rate. */
export function chipCentsToUsdCents(chipCents) {
  return Math.round((chipCents * CHIP_USD_RATE_CENTS) / 100);
}

/** "1,234.50 Chips" / "+1,234.50 Chips" from chip cents. Exact, never abbreviated. */
export function formatChipCents(chipCents, { signed = false } = {}) {
  const n = Math.round(Number(chipCents) || 0);
  const sign = n < 0 ? '-' : signed && n > 0 ? '+' : '';
  const abs = Math.abs(n);
  const whole = Math.floor(abs / 100).toLocaleString('en-US');
  const part = abs % 100;
  return `${sign}${whole}${part ? '.' + String(part).padStart(2, '0') : ''} Chips`;
}

const isFinishedTournament = (t) => String(t?.status || '').toUpperCase() === 'COMPLETED';
const isCancelledTournament = (t) => String(t?.status || '').toUpperCase() === 'CANCELLED';

/**
 * Turn grouped legs and their lookups into panel rows.
 * Returns { sessions, notes } where notes counts what was left out and why.
 */
export function buildClubArenaSessions({
  sittings = [], tournaments = [], tables = new Map(), clubs = new Map(),
  tournamentRows = new Map(), placings = new Map(), logged = new Set(), sinceIso,
  openSittings = 0,
}) {
  const get = (m, k) => (m instanceof Map ? m.get(k) : m?.[k]);
  const notes = { diamonds: 0, openSittings, unfinishedTournaments: 0, cancelledTournaments: 0, unreadableTournaments: 0 };
  const sessions = [];
  const since = sinceIso ? Date.parse(sinceIso) : -Infinity;

  for (const s of sittings) {
    if (Date.parse(s.satDownAt) < since) continue;
    const club = get(clubs, s.clubId);
    if (club && club.asset === 'diamonds') { notes.diamonds += 1; continue; }
    const table = get(tables, s.tableIds[s.tableIds.length - 1]) || get(tables, s.tableIds[0]);
    const row = {
      kind: 'cash', key: s.key, clubId: s.clubId, clubName: club?.name || null,
      title: table?.name || 'Cash Game', stakes: stakesText(table),
      gameType: ledgerGameType(table?.game_variant), gameName: variantName(table?.game_variant),
      startAt: s.satDownAt, endAt: s.stoodUpAt,
      minutes: durationMinutes(s.satDownAt, s.stoodUpAt),
      inCents: s.buyInCents, outCents: s.cashOutCents, netCents: s.cashOutCents - s.buyInCents,
      topUps: Math.max(0, s.fundings - 1),
    };
    row.marker = markerOf(row);
    row.logged = logged.has(row.marker);
    sessions.push(row);
  }

  for (const t of tournaments) {
    if (Date.parse(t.firstLegAt) < since) continue;
    const club = get(clubs, t.clubId);
    if (club && club.asset === 'diamonds') { notes.diamonds += 1; continue; }
    const info = get(tournamentRows, t.key);
    if (!info) { notes.unreadableTournaments += 1; continue; }
    if (isCancelledTournament(info)) { notes.cancelledTournaments += 1; continue; }
    if (!isFinishedTournament(info)) { notes.unfinishedTournaments += 1; continue; }
    // A prize with no entry leg in the window is either a free entry (freeroll,
    // ticket, union promo) or the tail of an entry made before the read window.
    // Only the first is this window's session.
    if (t.entries === 0 && !(info.started_at && Date.parse(info.started_at) >= since)) continue;
    const placing = get(placings, t.key);
    const stakeCents = Math.max(0, t.debitCents - t.refundCents);
    const outCents = t.prizeCents + t.bountyCents;
    const endAt = placing?.eliminated_at || info.ended_at || t.lastLegAt;
    const startAt = info.started_at && Date.parse(info.started_at) <= Date.parse(endAt) ? info.started_at : t.firstLegAt;
    const row = {
      kind: 'mtt', key: t.key, clubId: t.clubId, clubName: club?.name || null,
      title: info.name || 'Tournament', stakes: null,
      gameType: ledgerGameType(info.game_type), gameName: variantName(info.game_type),
      tournamentType: ledgerTournamentType(info),
      startAt, endAt, minutes: durationMinutes(startAt, endAt),
      inCents: stakeCents, outCents, netCents: outCents - stakeCents,
      entries: t.entries, firstEntryCents: t.firstEntryCents, rebuys: t.rebuys + Math.max(0, t.entries - 1),
      addonCents: t.addonCents, bountyCents: t.bountyCents,
      position: Number.isInteger(placing?.position) && placing.position > 0 ? placing.position : null,
    };
    row.marker = markerOf(row);
    row.logged = logged.has(row.marker);
    sessions.push(row);
  }

  sessions.sort((a, b) => (a.startAt < b.startAt ? 1 : a.startAt > b.startAt ? -1 : 0));
  return { sessions, notes };
}

const cents2 = (c) => Math.round(c) / 100;

/**
 * The bankroll_ledger entry for one session, at the stated chip rate.
 * The marker is the last line of notes; it is what keeps the import single.
 */
export function ledgerEntryFor(session, { locationId = null } = {}) {
  const grossIn = cents2(chipCentsToUsdCents(session.inCents));
  const grossOut = cents2(chipCentsToUsdCents(session.outCents));
  const lines = [`Imported from Club Arena${session.clubName ? ` (${session.clubName})` : ''}: ${session.title}.`];
  lines.push(`Chips: in ${formatChipCents(session.inCents)}, out ${formatChipCents(session.outCents)}, logged at 1 chip = $1.00.`);
  lines.push(markerOf(session));
  const entry = {
    category: session.kind === 'cash' ? 'poker_cash' : 'poker_mtt',
    location_id: locationId,
    entry_date: localDay(new Date(session.startAt)),
    start_time: session.startAt,
    end_time: session.endAt,
    gross_in: grossIn,
    gross_out: grossOut,
    game_type: session.gameType,
    notes: lines.join('\n'),
  };
  if (session.kind === 'cash') {
    entry.stakes = session.stakes;
  } else {
    entry.tournament_name = session.title;
    entry.tournament_type = session.tournamentType;
    entry.buy_in_amount = cents2(chipCentsToUsdCents(session.firstEntryCents));
    entry.reentry_count = session.rebuys;
    entry.add_on_amount = session.addonCents ? cents2(chipCentsToUsdCents(session.addonCents)) : null;
    entry.bounties_collected = session.bountyCents ? cents2(chipCentsToUsdCents(session.bountyCents)) : null;
    entry.finish_position = session.position;
  }
  return entry;
}

/** Sessions still to log, oldest first so the ledger fills in order. */
export function unloggedSessions(sessions) {
  return (sessions || []).filter((s) => !s.logged).sort((a, b) => (a.startAt < b.startAt ? -1 : a.startAt > b.startAt ? 1 : 0));
}

// ---------------------------------------------------------------------------
// Reading. Every read throws on an error: a failed read is never an empty list.

function failure(what, error) {
  const err = new Error(`Could Not Read ${what}: ${error?.message || error}`);
  err.cause = error;
  return err;
}

/** Every page of a query, 1,000 rows at a time; past maxRows it refuses rather than truncate. */
export async function readAllPages(makeQuery, what, { pageSize = PAGE_SIZE, maxRows = MAX_ROWS } = {}) {
  const rows = [];
  for (let from = 0; ; from += pageSize) {
    if (from >= maxRows) throw new Error(`Too Many ${what} To Read At Once. Choose A Later Start Date.`);
    const { data, error } = await makeQuery().range(from, from + pageSize - 1);
    if (error) throw failure(what, error);
    const page = Array.isArray(data) ? data : [];
    rows.push(...page);
    if (page.length < pageSize) return rows;
  }
}

async function readByIds(supabase, table, columns, column, ids, what, extra) {
  const out = [];
  for (const batch of idBatches(ids)) {
    let query = supabase.from(table).select(columns).in(column, batch);
    if (extra) query = extra(query);
    const { data, error } = await query;
    if (error) throw failure(what, error);
    out.push(...(data || []));
  }
  return out;
}

const LEG_COLUMNS = 'id, created_at, category, from_type, to_type, amount, club_id, table_id, tournament_id';

function legQuery(supabase, side, userId, fromType, toType, sinceIso) {
  return () => supabase
    .from('chip_ledger')
    .select(LEG_COLUMNS)
    .eq(side, userId)
    .eq('from_type', fromType)
    .eq('to_type', toType)
    .eq('status', 'posted')
    .gte('created_at', sinceIso)
    .order('created_at', { ascending: true })
    .order('id', { ascending: true });
}

/** ISO instant LOOKBACK_DAYS before the local start of `sinceDay` (YYYY-MM-DD). */
export function readWindow(sinceDay) {
  const start = new Date(`${sinceDay}T00:00:00`);
  const sinceIso = start.toISOString();
  const readFrom = new Date(start.getTime() - LOOKBACK_DAYS * 86400000).toISOString();
  return { sinceIso, readFrom };
}

/** The notes markers already in this player's ledger, every page. */
export async function fetchLoggedMarkers(supabase, userId) {
  const rows = await readAllPages(() => supabase
    .from('bankroll_ledger')
    .select('id, notes')
    .eq('user_id', userId)
    .ilike('notes', '%[club-arena:%')
    .order('id', { ascending: true }), 'Your Bankroll Ledger');
  return markersIn(rows.map((r) => r.notes));
}

/** One finishing row per tournament: the best place, and the latest bust time. */
export function bestPlacings(rows) {
  const out = new Map();
  for (const row of rows || []) {
    const prev = out.get(row.tournament_id);
    if (!prev) { out.set(row.tournament_id, { ...row }); continue; }
    const pos = Number.isInteger(row.position) && row.position > 0 ? row.position : null;
    if (pos && (!prev.position || pos < prev.position)) prev.position = pos;
    if (row.eliminated_at && (!prev.eliminated_at || row.eliminated_at > prev.eliminated_at)) prev.eliminated_at = row.eliminated_at;
  }
  return out;
}

/** Everything the panel shows, read under the player's own session. */
export async function fetchClubArenaSessions(supabase, userId, sinceDay) {
  const { sinceIso, readFrom } = readWindow(sinceDay);
  const [cashIn, cashOut, mttIn, mttOut, logged] = await Promise.all([
    readAllPages(legQuery(supabase, 'from_entity_id', userId, CASH_IN.from, CASH_IN.to, readFrom), 'Your Club Arena Buy-Ins'),
    readAllPages(legQuery(supabase, 'to_entity_id', userId, CASH_OUT.from, CASH_OUT.to, readFrom), 'Your Club Arena Cash-Outs'),
    readAllPages(legQuery(supabase, 'from_entity_id', userId, MTT_IN.from, MTT_IN.to, readFrom), 'Your Club Arena Tournament Entries'),
    readAllPages(legQuery(supabase, 'to_entity_id', userId, MTT_OUT.from, MTT_OUT.to, readFrom), 'Your Club Arena Tournament Prizes'),
    fetchLoggedMarkers(supabase, userId),
  ]);

  const cashLegs = [...cashIn, ...cashOut];
  const tableIds = cashLegs.map((l) => l.table_id);
  const tableRows = await readByIds(supabase, 'tables', 'id, name, club_id, cluster_id, game_variant, stakes, small_blind, big_blind', 'id', tableIds, 'Club Arena Tables');
  const tables = new Map(tableRows.map((t) => [t.id, t]));
  const gameOf = new Map(tableRows.map((t) => [t.id, t.cluster_id || t.id]));
  const { finished, open } = groupCashSittings(cashLegs, gameOf);
  const tournaments = groupTournamentEntries([...mttIn, ...mttOut]);

  const tournamentIds = tournaments.map((t) => t.key);
  const [tournamentList, placingList] = await Promise.all([
    readByIds(supabase, 'tournaments', 'id, name, status, game_type, variant, tournament_type, started_at, ended_at, club_id', 'id', tournamentIds, 'Club Arena Tournaments'),
    readByIds(supabase, 'tournament_players', 'tournament_id, position, eliminated_at', 'tournament_id', tournamentIds, 'Your Club Arena Finishing Places', (q) => q.eq('user_id', userId)),
  ]);
  const clubIds = [...finished.map((s) => s.clubId), ...tournaments.map((t) => t.clubId)];
  const clubList = await readByIds(supabase, 'clubs', 'id, name, asset', 'id', clubIds, 'Club Arena Clubs');

  return buildClubArenaSessions({
    sittings: finished,
    openSittings: open,
    tournaments,
    tables,
    clubs: new Map(clubList.map((c) => [c.id, c])),
    tournamentRows: new Map(tournamentList.map((t) => [t.id, t])),
    placings: bestPlacings(placingList),
    logged,
    sinceIso,
  });
}
