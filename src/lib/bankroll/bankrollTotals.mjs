// The dashboard totals, as the database function fn_bankroll_totals returns
// them and as this client computes them from rows. Both produce the SAME
// shape (integer cents), and statsFromTotals turns that shape into what
// getBankrollStats (calculations.ts) has always returned.
//
// The function's rules are listed in its migration header
// (supabase/migrations/20261128101707_fn_bankroll_totals.sql, R1-R12; R5 became
// expense = -|gross_out - gross_in| in 20261128103322_fn_bankroll_totals_expense_rule.sql). totalsFromRows is the client-side statement of the same rules,
// built only from ledgerMath.mjs and bankrollStats.mjs, so a disagreement
// between the two is a bug in one of them, never a matter of taste.

import {
  centsToDollars,
  entryCents,
  isMovementRow,
  isResultRow,
  isSessionRow,
  sessionHours,
  toCents,
} from './ledgerMath.mjs';
import { leakRiskOf } from './bankrollStats.mjs';

export const TOTALS_VERSION = 1;
const HOUR_MS = 3600000;
const POKER = ['poker_cash', 'poker_mtt'];
const NON_POKER = ['casino_table', 'slots', 'sports'];

const add = (map, key, cents) => map.set(key, (map.get(key) || 0) + cents);

/** Milliseconds of one session, by ledgerMath's overnight-correct rule. */
export function sessionMs(entry) {
  return Math.round(sessionHours(entry?.start_time, entry?.end_time) * HOUR_MS);
}

/** Whether a row falls in the period the dashboard is showing (R7). */
export function inPeriod(entry, { from, to, locationId } = {}) {
  const day = String(entry?.entry_date || '');
  if (from && day < from) return false;
  if (to && day > to) return false;
  if (locationId && entry?.location_id !== locationId) return false;
  return true;
}

/**
 * The fn_bankroll_totals shape from rows. `ledgerRows` are every ledger row of
 * the player (any period); `segments` their bankroll_segments rows.
 */
export function totalsFromRows({ ledgerRows = [], segments = [], from, to, locationId } = {}) {
  // R2: the client reads .eq('is_revision', false), which a NULL never matches.
  const rows = (ledgerRows || []).filter((entry) => entry && entry.is_revision === false);

  let start = 0;
  for (const segment of segments || []) {
    if (segment && segment.segment_type !== 'life') start += toCents(segment.initial_deposit);
  }
  let lifetime = 0, deposits = 0, withdrawals = 0;
  for (const entry of rows) {
    const cents = entryCents(entry);
    if (isResultRow(entry)) lifetime += cents;
    else if (entry.category === 'deposit') deposits += cents;
    else if (entry.category === 'withdrawal') withdrawals -= cents;
  }

  let results = 0, poker = 0, nonPoker = 0, expense = 0;
  let sessions = 0, wins = 0, ms = 0, pokerTimedCents = 0, pokerTimedMs = 0;
  const byCategory = new Map();
  const byLocation = new Map();
  const byMonth = new Map();
  const byDay = new Map();
  for (const entry of rows) {
    if (!isResultRow(entry) || isMovementRow(entry) || !inPeriod(entry, { from, to, locationId })) continue;
    const cents = entryCents(entry);
    results += cents;
    add(byCategory, entry.category, cents);
    add(byLocation, entry.location_id ?? null, cents);
    add(byMonth, String(entry.entry_date).slice(0, 7), cents);
    add(byDay, String(entry.entry_date), cents);
    if (entry.category === 'expense') expense -= cents;
    if (!isSessionRow(entry)) continue;
    sessions += 1;
    if (cents > 0) wins += 1;
    const length = sessionMs(entry);
    ms += length;
    if (POKER.includes(entry.category)) {
      poker += cents;
      if (length > 0) { pokerTimedCents += cents; pokerTimedMs += length; }
    } else if (NON_POKER.includes(entry.category)) {
      nonPoker += cents;
    }
  }

  let running = 0, peak = 0, lowest = 0;
  for (const day of [...byDay.keys()].sort()) {
    running += byDay.get(day);
    peak = Math.max(peak, running);
    lowest = Math.min(lowest, running);
  }

  return {
    version: TOTALS_VERSION,
    balance: {
      starting_deposit_cents: start,
      deposit_cents: deposits,
      withdrawal_cents: withdrawals,
      lifetime_results_cents: lifetime,
      balance_cents: start + lifetime + deposits - withdrawals,
    },
    period: {
      results_cents: results,
      poker_cents: poker,
      non_poker_cents: nonPoker,
      expense_cents: expense,
      session_count: sessions,
      win_count: wins,
      session_ms: ms,
      poker_timed_cents: pokerTimedCents,
      poker_timed_ms: pokerTimedMs,
      by_category: Object.fromEntries(byCategory),
      by_location: [...byLocation.entries()]
        .sort(([a], [b]) => (a === null ? -1 : b === null ? 1 : String(a).localeCompare(String(b))))
        .map(([location_id, cents]) => ({ location_id, cents })),
      by_month: Object.fromEntries(byMonth),
      peak_cumulative_cents: peak,
      lowest_cumulative_cents: lowest,
    },
  };
}

const PERIOD_FIELDS = [
  'results_cents', 'poker_cents', 'non_poker_cents', 'expense_cents', 'session_count', 'win_count',
  'session_ms', 'poker_timed_cents', 'poker_timed_ms', 'peak_cumulative_cents', 'lowest_cumulative_cents',
];
const BALANCE_FIELDS = ['starting_deposit_cents', 'deposit_cents', 'withdrawal_cents', 'lifetime_results_cents', 'balance_cents'];

function integerField(group, name, source) {
  const value = Number(source?.[name]);
  if (!Number.isFinite(value) || !Number.isInteger(value)) {
    throw new Error('fn_bankroll_totals returned no whole-cent ' + group + '.' + name);
  }
  return value;
}

/**
 * The totals shape, checked. A response missing a figure throws: it is never
 * read as zero.
 */
export function readTotals(data) {
  if (!data || typeof data !== 'object' || data.version !== TOTALS_VERSION) {
    throw new Error('fn_bankroll_totals returned an unrecognised answer');
  }
  const balance = {};
  for (const name of BALANCE_FIELDS) balance[name] = integerField('balance', name, data.balance);
  const period = {};
  for (const name of PERIOD_FIELDS) period[name] = integerField('period', name, data.period);
  period.by_category = { ...(data.period.by_category || {}) };
  period.by_location = Array.isArray(data.period.by_location) ? data.period.by_location : [];
  period.by_month = { ...(data.period.by_month || {}) };
  return { version: data.version, balance, period };
}

/**
 * The BankrollStats figures (all but travelROI) from the totals shape, by
 * the same formulas as calculateTotalBankroll and periodStats.
 */
export function statsFromTotals(data) {
  const { balance, period } = readTotals(data);
  const pokerHours = period.poker_timed_ms / HOUR_MS;
  return {
    totalBankroll: centsToDollars(balance.balance_cents),
    allInNet: centsToDollars(period.results_cents),
    pokerNet: centsToDollars(period.poker_cents),
    nonPokerNet: centsToDollars(period.non_poker_cents),
    expenseTotal: centsToDollars(period.expense_cents),
    leakRisk: leakRiskOf(period.poker_cents, period.non_poker_cents),
    hourlyRate: pokerHours > 0 ? Math.round(period.poker_timed_cents / pokerHours) / 100 : 0,
    totalHours: period.session_ms / HOUR_MS,
    sessionCount: period.session_count,
    winRate: period.session_count > 0 ? (period.win_count / period.session_count) * 100 : 0,
  };
}

/**
 * Differences between two totals shapes, as readable strings (empty = equal).
 * by_location is compared as a set, so row order never matters.
 */
export function diffTotals(a, b) {
  const left = readTotals(a);
  const right = readTotals(b);
  const out = [];
  for (const name of BALANCE_FIELDS) {
    if (left.balance[name] !== right.balance[name]) out.push('balance.' + name + ': ' + left.balance[name] + ' vs ' + right.balance[name]);
  }
  for (const name of PERIOD_FIELDS) {
    if (left.period[name] !== right.period[name]) out.push('period.' + name + ': ' + left.period[name] + ' vs ' + right.period[name]);
  }
  const mapDiff = (label, x, y) => {
    for (const key of new Set([...Object.keys(x), ...Object.keys(y)])) {
      if (Number(x[key] || 0) !== Number(y[key] || 0)) out.push(label + '[' + key + ']: ' + (x[key] ?? 0) + ' vs ' + (y[key] ?? 0));
    }
  };
  mapDiff('period.by_category', left.period.by_category, right.period.by_category);
  mapDiff('period.by_month', left.period.by_month, right.period.by_month);
  const locations = (list) => Object.fromEntries(list.map((row) => [String(row.location_id ?? 'none'), Number(row.cents)]));
  mapDiff('period.by_location', locations(left.period.by_location), locations(right.period.by_location));
  return out;
}
