/**
 * Leak Analysis helpers shared by src/lib/bankroll/leakDetection.ts (which
 * reads the ledger) and src/components/bankroll/LeakAnalysisView.jsx (which
 * shows it).
 *
 * rowsOf: a Supabase read that failed returns { data: null, error } instead of
 * throwing. The detectors used to treat that as "no rows", so a dropped
 * connection showed a green "No Leaks Detected" and the view's own
 * "Could Not Read Your Ledger" state could never appear. A failed read now
 * throws and the view says so.
 *
 * leakValueText: each finding carries its amount as a number (`amount`, a
 * signed USD total, or `hourly`, signed USD per hour) and the view formats it
 * in the player's display currency. The detectors used to bake a dollar
 * string into the finding, so with Display EUR on the panel read
 * "Total Leak Amount: €764" over rows in dollars, and a losing hourly rate
 * printed as "$-24/hr".
 */

import { formatCurrencyWithSign } from './currencyUtils.js';
import { entryCents, isSessionRow, sessionHours } from './ledgerMath.mjs';

export function rowsOf(result, what = 'ledger') {
  if (result && result.error) {
    const error = new Error(`Could not read the ${what}: ${result.error.message || result.error}`);
    error.cause = result.error;
    throw error;
  }
  return (result && result.data) || [];
}

export function leakValueText(leak, displayEUR = false) {
  if (!leak) return '';
  if (Number.isFinite(leak.hourly)) return `${formatCurrencyWithSign(Math.round(leak.hourly), displayEUR)}/hr`;
  if (Number.isFinite(leak.amount)) return formatCurrencyWithSign(Math.round(leak.amount), displayEUR);
  return leak.value || '';
}

// ---------------------------------------------------------------------------
// Reading and totalling (wave 3 library audit).
//
// Each detector used to make one unpaged read, which stopped silently at
// PostgREST's 1,000-row cap, and added dollar floats row by row. A 9 PM to
// 3 AM session counted -18 hours (enough to hide a losing stake), the
// session's clock hour was read in the viewer's time zone (start_time is the
// typed wall clock stored as UTC, so an 8 PM session in Chicago landed in
// "afternoon"), and a deposit or withdrawal logged on a trip counted as
// gambling. These helpers read every page through rowsOf and total in cents.


const PAGE = 1000;

/**
 * Every row a query returns, a page at a time. `makeQuery` returns a fresh,
 * fully ordered query each call; a failed page throws through rowsOf.
 */
export async function allRowsOf(makeQuery, what = 'ledger') {
  const rows = [];
  for (let from = 0; ; from += PAGE) {
    const page = rowsOf(await makeQuery().range(from, from + PAGE - 1), what);
    rows.push(...page);
    if (page.length < PAGE) return rows;
  }
}

/** Net of rows in dollars, summed in cents (cash-out less buy-in). */
export function netDollars(rows) {
  let cents = 0;
  for (const row of rows || []) cents += entryCents(row);
  return cents / 100;
}

/**
 * The clock hour the player typed for a session. start_time holds the typed
 * wall clock ('2026-11-20T20:00:00', returned as 20:00 UTC), the same text the
 * log form reads back when editing, so the hour comes from the text and is
 * never converted to the viewer's zone.
 */
export function sessionClockHour(startTime) {
  const match = /T(\d{2}):/.exec(String(startTime || ''));
  if (!match) return null;
  const hour = Number(match[1]);
  return hour >= 0 && hour < 24 ? hour : null;
}

export function timeBlockOf(hour) {
  if (hour < 6) return 'late_night';
  if (hour < 12) return 'morning';
  if (hour < 18) return 'afternoon';
  return 'evening';
}

/**
 * Cash-game results by stakes: { [stakes]: { net, hours, sessions } }, net in dollars.
 * @returns {Record<string, { net: number, hours: number, sessions: number }>}
 */
export function stakeTotals(rows) {
  /** @type {Record<string, number>} */
  const cents = {};
  /** @type {Record<string, { net: number, hours: number, sessions: number }>} */
  const out = {};
  for (const row of rows || []) {
    if (!row || !row.stakes) continue;
    const s = out[row.stakes] || (out[row.stakes] = { net: 0, hours: 0, sessions: 0 });
    cents[row.stakes] = (cents[row.stakes] || 0) + entryCents(row);
    s.hours += sessionHours(row.start_time, row.end_time);
    s.sessions += 1;
  }
  for (const key of Object.keys(out)) out[key].net = cents[key] / 100;
  return out;
}

/**
 * Results by time of day: { late_night, morning, afternoon, evening: { net, count } }.
 * @returns {Record<string, { net: number, count: number }>}
 */
export function timeBlockTotals(rows) {
  const cents = { late_night: 0, morning: 0, afternoon: 0, evening: 0 };
  const count = { late_night: 0, morning: 0, afternoon: 0, evening: 0 };
  for (const row of rows || []) {
    const hour = sessionClockHour(row && row.start_time);
    if (hour === null) continue;
    const block = timeBlockOf(hour);
    cents[block] += entryCents(row);
    count[block] += 1;
  }
  /** @type {Record<string, { net: number, count: number }>} */
  const out = {};
  for (const block of Object.keys(cents)) out[block] = { net: cents[block] / 100, count: count[block] };
  return out;
}

/**
 * One trip's result: sessions (gambling) and expenses (a positive cost), in
 * dollars. Deposits and withdrawals logged during a trip move the bankroll
 * and are neither.
 */
export function tripTotals(rows) {
  let sessionCents = 0;
  let expenseCents = 0;
  for (const row of rows || []) {
    if (isSessionRow(row)) sessionCents += entryCents(row);
    else if (row && row.category === 'expense') expenseCents += -entryCents(row);
  }
  return { gambling: sessionCents / 100, expenses: expenseCents / 100, net: (sessionCents - expenseCents) / 100 };
}
