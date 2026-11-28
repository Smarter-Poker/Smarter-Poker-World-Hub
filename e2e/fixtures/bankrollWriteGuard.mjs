/**
 * Write guard for the bankroll-write-live production suite.
 *
 * bankroll-write-live signs in as the platform service account and drives the
 * Bankroll Manager's own UI to write: it seeds a deterministic fixture and
 * exercises Log Entry, Adjust Bankroll, Trips, Staking and delete. Every write
 * it makes must touch ONLY rows that are its own, so every non-read request is
 * judged here before it leaves the browser:
 *
 *   allow  - a write to a row this suite created or is creating: an insert
 *            whose rows carry the session's user_id and the suite's note
 *            marker, or an update / delete whose filter names that user_id and
 *            an id the suite already owns. Continued.
 *   shell  - a write the GLOBAL signed-in shell makes on every page (the same
 *            list as the read-only suite). Aborted; not a Bankroll write.
 *   telemetry - analytics and third-party pings. Aborted; not a ledger write.
 *   refuse - anything else. Aborted, and the test that saw it FAILS with the
 *            method, path and reason.
 *
 * The note markers make a row recognisable in the database and in the UI:
 *   FIXTURE_MARKER on the thirteen trend-fixture sessions (kept),
 *   TEST_MARKER on every row a write-path step creates (deleted by that step).
 *
 * Plain .mjs so __tests__/bankroll-write-live-suite.test.mjs can unit-test it.
 */
import { APP_ORIGIN, READ_ONLY_POSTS, READ_ONLY_RPCS, SHELL_SIDE_EFFECTS } from './bankrollLiveGuard.mjs';

export const FIXTURE_MARKER = 'bankroll-live fixture';
export const TEST_MARKER = 'bankroll-live test';

const READ_VERBS = new Set(['GET', 'HEAD', 'OPTIONS']);
const DATA_PATHS = [/^\/rest\/v1\//, /^\/storage\/v1\//, /^\/functions\/v1\//, /^\/graphql\/v1/];

/** The thirteen fixture sessions: Dan's reported case, rebuilt.
 *  The running net climbs to +$29,217 on Nov 5 and closes the same month at
 *  -$14,363, the lowest point and the final figure. A monthly-bucketed line
 *  drew only the closing value, so the intra-month peak vanished. */
export const FIXTURE_SESSIONS = Object.freeze([
  { n: 1, date: '2026-02-10', buyIn: 1000, cashOut: 2200 },
  { n: 2, date: '2026-03-14', buyIn: 1500, cashOut: 700 },
  { n: 3, date: '2026-04-18', buyIn: 1000, cashOut: 3500 },
  { n: 4, date: '2026-05-09', buyIn: 2000, cashOut: 900 },
  { n: 5, date: '2026-06-20', buyIn: 1000, cashOut: 4000 },
  { n: 6, date: '2026-07-11', buyIn: 3000, cashOut: 1000 },
  { n: 7, date: '2026-08-15', buyIn: 1000, cashOut: 2500 },
  { n: 8, date: '2026-09-06', buyIn: 2500, cashOut: 700 },
  { n: 9, date: '2026-10-03', buyIn: 1000, cashOut: 3717 },
  { n: 10, date: '2026-11-02', buyIn: 2000, cashOut: 14000 },
  { n: 11, date: '2026-11-05', buyIn: 2000, cashOut: 14000 },
  { n: 12, date: '2026-11-12', buyIn: 25000, cashOut: 1420 },
  { n: 13, date: '2026-11-20', buyIn: 20000, cashOut: 0 },
]);
export const FIXTURE_PEAK_CENTS = 2921700;
export const FIXTURE_LOW_CENTS = -1436300;
export const FIXTURE_STARTING_BANKROLL = 50000;

export const fixtureNote = (n) => `${FIXTURE_MARKER} #${String(n).padStart(2, '0')}`;

/** Which fixture session a note belongs to, or null. */
export function fixtureNumber(notes) {
  const m = new RegExp(`^${FIXTURE_MARKER} #(\\d{2})\\b`).exec(String(notes || '').trim());
  return m ? Number(m[1]) : null;
}

export const isFixtureRow = (row) => fixtureNumber(row?.notes) !== null;
export const isTestRow = (row) => String(row?.notes || '').includes(TEST_MARKER);

/** The fixture sessions still to log: none of an existing number is ever logged twice. */
export function missingFixtureSessions(rows) {
  const have = new Set((rows || []).map((r) => fixtureNumber(r?.notes)).filter((n) => n !== null));
  return FIXTURE_SESSIONS.filter((s) => !have.has(s.n));
}

/** Fixture rows whose stored amounts or date differ from the definition. */
export function fixtureMismatches(rows) {
  const problems = [];
  const seen = new Map();
  for (const row of rows || []) {
    const n = fixtureNumber(row?.notes);
    if (n === null) continue;
    if (seen.has(n)) problems.push(`fixture #${n} exists twice (${seen.get(n)} and ${row.id})`);
    seen.set(n, row.id);
    const want = FIXTURE_SESSIONS.find((s) => s.n === n);
    if (!want) { problems.push(`fixture #${n} is not defined`); continue; }
    const cents = (v) => Math.round(Number(v) * 100);
    if (row.category !== 'poker_cash' || row.entry_date !== want.date || cents(row.gross_in) !== want.buyIn * 100 || cents(row.gross_out) !== want.cashOut * 100) {
      problems.push(`fixture #${n} reads ${row.category} ${row.entry_date} ${row.gross_in}/${row.gross_out}, expected poker_cash ${want.date} ${want.buyIn}/${want.cashOut}`);
    }
  }
  return problems;
}

function filters(url) {
  const out = {};
  for (const [key, value] of url.searchParams) out[key] = value;
  return out;
}

const eqValue = (value) => (typeof value === 'string' && value.startsWith('eq.') ? value.slice(3) : null);

function bodyRows(body) {
  if (body == null || body === '') return [];
  let parsed = body;
  if (typeof body === 'string') {
    try { parsed = JSON.parse(body); } catch { return null; }
  }
  return Array.isArray(parsed) ? parsed : [parsed];
}

function markedForSuite(row) {
  const text = [row?.notes, row?.name, row?.backer_name].map((v) => String(v || '')).join(' ');
  return text.includes(TEST_MARKER) || text.includes(FIXTURE_MARKER);
}

/**
 * Judge one request.
 * ctx = { uid, owned: { ledger, trips, arrangements, stakingSessions } (Sets of ids),
 *         allowStartingBankroll, allowDeactivateAll }
 * Returns { kind: 'read'|'session'|'allow'|'shell'|'telemetry'|'refuse'|'lookup', reason }.
 */
export function judgeRequest({ method, url: rawUrl, headers = {}, body = null }, ctx) {
  const verb = String(method || '').toUpperCase();
  let url;
  try { url = new URL(rawUrl); } catch { return { kind: 'telemetry', reason: 'unparseable url' }; }
  if (url.protocol === 'data:' || url.protocol === 'blob:') return { kind: 'read' };
  if (READ_VERBS.has(verb)) return { kind: 'read' };
  if (verb === 'POST' && url.pathname.endsWith('/auth/v1/token') && url.searchParams.get('grant_type') === 'refresh_token') return { kind: 'session' };
  if (verb === 'POST' && READ_ONLY_POSTS.some((e) => url.origin === e.origin && url.pathname === e.path)) return { kind: 'read' };
  if (verb === 'POST' && SHELL_SIDE_EFFECTS.some((e) => url.pathname === e.path && (!e.origin || url.origin === e.origin))) return { kind: 'shell' };
  const rpc = url.pathname.match(/^\/rest\/v1\/rpc\/([a-z0-9_]+)$/);
  if (verb === 'POST' && rpc && READ_ONLY_RPCS.includes(rpc[1])) return { kind: 'read' };

  const isData = DATA_PATHS.some((p) => p.test(url.pathname)) || (url.origin === APP_ORIGIN && url.pathname.startsWith('/api/')) || url.pathname.startsWith('/auth/v1/');
  if (!isData) return { kind: 'telemetry' };

  const refuse = (reason) => ({ kind: 'refuse', reason });
  const uid = ctx?.uid;
  if (!uid) return refuse('no signed-in user id to guard writes with');
  const owned = ctx.owned || {};
  const has = (set, id) => !!id && !!set && set.has(id);
  const table = url.pathname.match(/^\/rest\/v1\/([a-z0-9_]+)$/)?.[1];
  if (!table) return refuse('not a table write');
  const q = filters(url);
  const userEq = eqValue(q.user_id);
  const idEq = eqValue(q.id);
  const prefer = String(headers?.prefer || headers?.Prefer || '');
  const rows = bodyRows(body);

  if (verb === 'POST') {
    if (rows === null) return refuse('unreadable insert body');
    // Create-only defaults (ON CONFLICT DO NOTHING) for this user: changes nothing that exists.
    if ((table === 'bankroll_segments' || table === 'bankroll_rules') && /resolution=ignore-duplicates/.test(prefer) && q.on_conflict) {
      return rows.every((r) => r?.user_id === uid) ? { kind: 'allow', reason: `create-only ${table}` } : refuse(`${table} default for another user`);
    }
    if (table === 'bankroll_ledger' || table === 'bankroll_trips' || table === 'staking_arrangements') {
      if (!rows.length) return refuse(`empty insert into ${table}`);
      for (const r of rows) {
        if (r?.user_id !== uid) return refuse(`${table} insert for another user`);
        if (!markedForSuite(r)) return refuse(`${table} insert without the suite marker`);
      }
      return { kind: 'allow', reason: `${table} insert (marked)` };
    }
    if (table === 'staking_sessions') {
      for (const r of rows) {
        if (!has(owned.arrangements, r?.arrangement_id)) return refuse('staking link on a deal this suite does not own');
        if (!has(owned.ledger, r?.ledger_entry_id)) return refuse('staking link of a session this suite does not own');
      }
      return rows.length ? { kind: 'allow', reason: 'staking link (owned deal, owned session)' } : refuse('empty staking link');
    }
    return refuse(`insert into ${table}`);
  }

  if (verb === 'PATCH' || verb === 'DELETE') {
    const patch = verb === 'PATCH' ? (rows || [])[0] || {} : null;
    const keys = patch ? Object.keys(patch) : [];
    if (table === 'bankroll_ledger') {
      if (userEq !== uid) return refuse('ledger write without this user filter');
      if (has(owned.ledger, idEq)) return { kind: 'allow', reason: `ledger ${verb} of an owned row` };
      // deleteTrip unlinks the trip's rows (trip_id -> null) before marking it deleted.
      if (verb === 'PATCH' && has(owned.trips, eqValue(q.trip_id)) && keys.length === 1 && keys[0] === 'trip_id' && patch.trip_id === null) {
        return { kind: 'allow', reason: 'unlink rows of an owned trip' };
      }
      return refuse(`ledger ${verb} of a row this suite does not own`);
    }
    if (table === 'bankroll_segments' && verb === 'PATCH') {
      if (userEq !== uid) return refuse('segment write without this user filter');
      const derived = keys.every((k) => k === 'current_balance' || k === 'updated_at');
      if (derived) return { kind: 'allow', reason: 'segment balance recomputed from the ledger' };
      if (ctx.allowStartingBankroll && eqValue(q.segment_type) === 'poker' && keys.every((k) => k === 'initial_deposit' || k === 'updated_at')) {
        return { kind: 'allow', reason: 'starting bankroll (fixture, none was set)' };
      }
      return refuse(`segment PATCH of ${keys.join(',')}`);
    }
    if (table === 'bankroll_receipts' && verb === 'PATCH') {
      // deleteLedgerEntry returns a receipt filed to the deleted row to Receipts Waiting.
      if (userEq === uid && has(owned.ledger, eqValue(q.assigned_id))) return { kind: 'allow', reason: 'receipt release of an owned row' };
      return refuse('receipt write not tied to an owned row');
    }
    if (table === 'bankroll_trips' && verb === 'PATCH') {
      if (userEq === uid && has(owned.trips, idEq)) return { kind: 'allow', reason: 'owned trip update' };
      return refuse('trip write on a trip this suite does not own');
    }
    if (table === 'staking_arrangements') {
      if (has(owned.arrangements, idEq)) return { kind: 'allow', reason: `owned deal ${verb}` };
      // A new deal first deactivates every active deal of the user; only
      // allowed when the suite checked that no other deal is active.
      if (verb === 'PATCH' && ctx.allowDeactivateAll && userEq === uid && eqValue(q.is_active) === 'true' && patch.is_active === false) {
        return { kind: 'allow', reason: 'deactivate (no foreign active deal)' };
      }
      return refuse(`staking deal ${verb} on a deal this suite does not own`);
    }
    if (table === 'staking_sessions') {
      if (has(owned.stakingSessions, idEq)) return { kind: 'allow', reason: `owned staking session ${verb}` };
      // The link insert returns no row, and reloading the deal re-saves its
      // sessions' splits at once. The caller reads the row (as this user) and
      // owns it only if it belongs to a deal the suite owns.
      if (idEq) return { kind: 'lookup', table: 'staking_sessions', id: idEq, field: 'arrangement_id', ownedBy: 'arrangements', into: 'stakingSessions' };
      return refuse(`staking session ${verb} this suite does not own`);
    }
    return refuse(`${verb} on ${table}`);
  }
  return refuse(`${verb} ${url.pathname}`);
}
