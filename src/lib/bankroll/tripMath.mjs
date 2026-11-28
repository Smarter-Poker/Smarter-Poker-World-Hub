// Trip and series arithmetic, shared by the Trip Tracker, the Series Tracker,
// their reports and the Recent Activity summary row, so every surface shows
// the same totals for the same trip.
//
// A trip's ledger rows come in three kinds:
// - gaming rows (cash, tournaments, casino, slots, sports): net = gross_out - gross_in;
// - expense rows: always a cost, whatever sign the row carries;
// - accounting rows (deposit, withdrawal): bankroll transfers, never profit or loss.
//
// Every total is summed in whole cents (ledgerMath.mjs) and handed back in
// dollars: adding dollar floats row by row made a trip of 0.10 and 0.20
// sessions read 0.30000000000000004, and a trip of a few thousand rows drift.
// A superseded revision is never counted.
//
// Trip dates are calendar days the player recorded (YYYY-MM-DD), so day counts
// are taken between calendar days, never between UTC instants.

import { localDay } from './localDates.mjs';
import { centsToDollars, expenseCostCents, isCurrentRow, sessionHours as clockHours, toCents } from './ledgerMath.mjs';

export const ACCOUNTING_CATEGORIES = ['deposit', 'withdrawal'];
const DAY_MS = 24 * 60 * 60 * 1000;
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;


/** The row's own result in cents: gross_out - gross_in (net_result is generated the same way). */
function entryNetCents(entry) {
  if (!entry) return 0;
  if (entry.gross_in != null || entry.gross_out != null) return toCents(entry.gross_out) - toCents(entry.gross_in);
  return toCents(entry.net_result);
}

/** The row's own result: gross_out - gross_in (net_result is generated the same way). */
export function entryNet(entry) {
  return centsToDollars(entryNetCents(entry));
}

function expenseCents(entry) {
  if (entry && entry.gross_in == null && entry.gross_out == null) return Math.abs(toCents(entry.net_result));
  return expenseCostCents(entry);
}

/** What an expense row costs, as a positive amount (expenseCostCents in ledgerMath.mjs). */
export function expenseCost(entry) {
  return centsToDollars(expenseCents(entry));
}

export function isExpense(entry) {
  return entry?.category === 'expense';
}

export function isAccounting(entry) {
  return ACCOUNTING_CATEGORIES.includes(entry?.category);
}

export function isSession(entry) {
  return !!entry && !isExpense(entry) && !isAccounting(entry);
}

/**
 * What a row contributes to the trip's P/L: a session's result, minus an
 * expense's cost, nothing for a transfer.
 */
function contributionCents(entry) {
  if (isExpense(entry)) return -expenseCents(entry);
  if (isAccounting(entry)) return 0;
  return entryNetCents(entry);
}

export function tripContribution(entry) {
  return centsToDollars(contributionCents(entry));
}

/** Running totals for one trip's rows. */
export function summarizeTripEntries(entries) {
  const rows = (Array.isArray(entries) ? entries : []).filter(isCurrentRow);
  let gamingNet = 0;
  let totalExpenses = 0;
  let sessionCount = 0;
  const breakdownCents = {};
  for (const entry of rows) {
    const cat = entry?.category || 'other';
    if (isAccounting(entry)) continue;
    if (!breakdownCents[cat]) breakdownCents[cat] = { count: 0, net: 0 };
    breakdownCents[cat].count += 1;
    const contribution = contributionCents(entry);
    breakdownCents[cat].net += contribution;
    if (isExpense(entry)) {
      totalExpenses += -contribution;
    } else {
      gamingNet += contribution;
      sessionCount += 1;
    }
  }
  const categoryBreakdown = {};
  for (const [cat, b] of Object.entries(breakdownCents)) categoryBreakdown[cat] = { count: b.count, net: centsToDollars(b.net) };
  return {
    totalNet: centsToDollars(gamingNet - totalExpenses),
    gamingNet: centsToDollars(gamingNet),
    totalExpenses: centsToDollars(totalExpenses),
    sessionCount,
    expenseCount: rows.filter(isExpense).length,
    entryCount: rows.length,
    categoryBreakdown,
  };
}

/** Group rows by trip_id, then summarise each group. */
export function summarizeByTrip(entries) {
  const groups = new Map();
  for (const entry of Array.isArray(entries) ? entries : []) {
    if (!entry?.trip_id) continue;
    if (!groups.has(entry.trip_id)) groups.set(entry.trip_id, []);
    groups.get(entry.trip_id).push(entry);
  }
  const out = {};
  for (const [tripId, rows] of groups) out[tripId] = summarizeTripEntries(rows);
  return out;
}

const EMPTY_SUMMARY = Object.freeze({
  totalNet: 0, gamingNet: 0, totalExpenses: 0, sessionCount: 0, expenseCount: 0, entryCount: 0, categoryBreakdown: {},
});

/** Attach running totals to trip rows (location name flattened from the join). */
export function withTripTotals(trips, summaries) {
  return (Array.isArray(trips) ? trips : []).map((trip) => {
    const s = summaries?.[trip.id] || EMPTY_SUMMARY;
    return {
      ...trip,
      location_name: trip.bankroll_locations?.name || trip.location_name || null,
      totalNet: s.totalNet,
      totalExpenses: s.totalExpenses,
      sessionCount: s.sessionCount,
      entryCount: s.entryCount,
      categoryBreakdown: { ...s.categoryBreakdown },
    };
  });
}

function dayIndex(day) {
  if (!ISO_DAY.test(String(day || ''))) return null;
  const [y, m, d] = String(day).split('-').map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / DAY_MS);
}

/** Whole calendar days from `from` to `to` (YYYY-MM-DD); null if either is missing. */
export function daysBetween(from, to) {
  const a = dayIndex(from);
  const b = dayIndex(to);
  return a == null || b == null ? null : b - a;
}

/**
 * Length of a trip in calendar days, counting both the first and the last day:
 * a Friday-to-Sunday trip is 3 days, a same-day trip is 1. An open trip runs
 * to today.
 */
export function tripDurationDays(startDate, endDate, today = localDay()) {
  const end = endDate || today;
  const diff = daysBetween(startDate, end);
  if (diff == null) return 1;
  return Math.max(1, diff + 1);
}

/**
 * Which day of the trip today is (Day 1 on the start date), or a negative
 * number of days until a trip that has not started yet.
 */
export function tripDayNumber(startDate, today = localDay()) {
  const diff = daysBetween(startDate, today);
  if (diff == null) return 1;
  return diff >= 0 ? diff + 1 : diff;
}

/** "Day 3", or "Starts In 4 Days" / "Starts Tomorrow" for a future start. */
export function tripDayLabel(startDate, today = localDay()) {
  const n = tripDayNumber(startDate, today);
  if (n > 0) return `Day ${n}`;
  return n === -1 ? 'Starts Tomorrow' : `Starts In ${-n} Days`;
}

/**
 * The end date recorded when a trip is completed: today in the player's own
 * calendar, never earlier than the start date (a trip completed before its
 * planned start would otherwise end before it began).
 */
export function completionEndDate(startDate, today = localDay()) {
  const diff = daysBetween(startDate, today);
  return diff != null && diff < 0 ? startDate : today;
}

/** Sanitise a date field from a form: '' and invalid values become null. */
export function cleanDay(value) {
  return ISO_DAY.test(String(value || '')) ? String(value) : null;
}

/** An error message when the end date falls before the start date, else null. */
export function dateRangeProblem(startDate, endDate) {
  const diff = daysBetween(startDate, endDate);
  return diff != null && diff < 0 ? 'The End Date Cannot Be Before The Start Date' : null;
}

/**
 * Hours a session ran, by the same rule as the dashboard (sessionHours in
 * ledgerMath.mjs): an end clock before the start ran past midnight. This used
 * to return 0 for those, so a 9 PM to 3 AM session played on a trip added no
 * hours to the trip while the dashboard counted six.
 */
export function sessionHours(entry) {
  return clockHours(entry?.start_time, entry?.end_time);
}

/**
 * The full report for one trip: totals, per-category and per-day results,
 * duration, averages, and the trip's return on everything it cost (buy-ins
 * plus expenses).
 */
export function buildTripReport(trip, entries, today = localDay()) {
  const rows = (Array.isArray(entries) ? entries : []).filter((e) => isCurrentRow(e) && !isAccounting(e));
  const summary = summarizeTripEntries(rows);
  const sessions = rows.filter(isSession);
  const categoryCents = {};
  const dailyCents = {};
  const expenseTypeCents = {};
  let biggestWin = null;
  let biggestLoss = null;
  let winCount = 0;
  let buyInCents = 0;
  let cashOutCents = 0;
  let totalHours = 0;

  for (const entry of rows) {
    const cat = entry.category || 'other';
    if (!categoryCents[cat]) categoryCents[cat] = { count: 0, net: 0, grossIn: 0, grossOut: 0 };
    const contribution = contributionCents(entry);
    categoryCents[cat].count += 1;
    categoryCents[cat].net += contribution;
    categoryCents[cat].grossIn += toCents(entry.gross_in);
    categoryCents[cat].grossOut += toCents(entry.gross_out);
    if (entry.entry_date) dailyCents[entry.entry_date] = (dailyCents[entry.entry_date] || 0) + contribution;
    if (isExpense(entry)) {
      const type = entry.expense_type || 'other';
      expenseTypeCents[type] = (expenseTypeCents[type] || 0) + expenseCents(entry);
    }
  }
  for (const entry of sessions) {
    const net = entryNetCents(entry);
    if (net > 0) winCount += 1;
    if (biggestWin == null || net > biggestWin) biggestWin = net;
    if (biggestLoss == null || net < biggestLoss) biggestLoss = net;
    buyInCents += toCents(entry.gross_in);
    cashOutCents += toCents(entry.gross_out);
    totalHours += sessionHours(entry);
  }
  const categoryBreakdown = {};
  for (const [cat, c] of Object.entries(categoryCents)) {
    categoryBreakdown[cat] = { count: c.count, net: centsToDollars(c.net), grossIn: centsToDollars(c.grossIn), grossOut: centsToDollars(c.grossOut) };
  }
  const dailyBreakdown = {};
  for (const [day, c] of Object.entries(dailyCents)) dailyBreakdown[day] = centsToDollars(c);
  const expenseBreakdown = {};
  for (const [type, c] of Object.entries(expenseTypeCents)) expenseBreakdown[type] = centsToDollars(c);
  const buyIns = centsToDollars(buyInCents);
  const cashOuts = centsToDollars(cashOutCents);
  if (biggestWin != null) biggestWin = centsToDollars(biggestWin);
  if (biggestLoss != null) biggestLoss = centsToDollars(biggestLoss);

  const durationDays = tripDurationDays(trip?.start_date, trip?.end_date, today);
  const totalCost = centsToDollars(buyInCents + toCents(summary.totalExpenses));
  return {
    trip: { ...trip, location_name: trip?.bankroll_locations?.name || trip?.location_name || null },
    entries: rows,
    stats: {
      totalNet: summary.totalNet,
      totalExpenses: summary.totalExpenses,
      totalGrossNet: summary.gamingNet,
      sessionCount: summary.sessionCount,
      entryCount: rows.length,
      winRate: sessions.length > 0 ? Math.round((winCount / sessions.length) * 100) : 0,
      biggestWin,
      biggestLoss,
      durationDays,
      avgPerDay: Math.round(summary.totalNet / durationDays),
      avgPerSession: sessions.length > 0 ? Math.round(summary.gamingNet / sessions.length) : 0,
      buyIns,
      cashOuts,
      totalCost,
      roi: totalCost > 0 ? (summary.totalNet / totalCost) * 100 : null,
      costPerDay: summary.totalExpenses / durationDays,
      totalHours,
      hourlyRate: totalHours > 0 ? summary.totalNet / totalHours : null,
    },
    categoryBreakdown,
    dailyBreakdown,
    expenseBreakdown,
  };
}

/**
 * Recent Activity rows for the dashboard. Rows on an active trip or series
 * stay hidden until it is completed; a completed trip or series then appears
 * as ONE summary row with the totals of every one of its rows, not just the
 * ones that happened to fall in the newest page.
 *
 * `trips` are all known trips and series (any status). A row whose trip is
 * not known is still grouped, never shown loose, because its trip may be
 * active.
 */
export function buildRecentActivity(entries, trips, limit = 50) {
  const tripById = new Map((Array.isArray(trips) ? trips : []).map((t) => [t.id, t]));
  const visible = [];
  const groups = new Map();
  for (const entry of Array.isArray(entries) ? entries : []) {
    if (!entry?.trip_id) {
      visible.push(entry);
      continue;
    }
    const trip = tripById.get(entry.trip_id);
    if (trip && trip.status === 'active') continue;
    if (!groups.has(entry.trip_id)) groups.set(entry.trip_id, []);
    groups.get(entry.trip_id).push(entry);
  }
  for (const [tripId, items] of groups) {
    const trip = tripById.get(tripId) || null;
    const summary = summarizeTripEntries(items);
    let latestDate = '';
    for (const item of items) if ((item.entry_date || '') > latestDate) latestDate = item.entry_date;
    const isSeries = trip?.trip_type === 'series';
    visible.push({
      id: 'trip-summary-' + tripId,
      category: 'trip_summary',
      entry_date: latestDate,
      net_result: summary.totalNet,
      gross_in: 0,
      gross_out: 0,
      location_name: trip?.location_name || items.find((i) => i.location_name)?.location_name || '',
      _tripId: tripId,
      _tripType: isSeries ? 'series' : 'trip',
      _tripName: trip?.name || (isSeries ? 'Series' : 'Trip'),
      _sessionCount: summary.sessionCount,
      _isTripSummary: true,
    });
  }
  visible.sort((a, b) => String(b.entry_date || '').localeCompare(String(a.entry_date || '')));
  return visible.slice(0, limit);
}

/** Rows to leave out of analysis while their trip or series is still running. */
export function withoutActiveTripRows(entries, trips) {
  const active = new Set((Array.isArray(trips) ? trips : []).filter((t) => t.status === 'active').map((t) => t.id));
  return (Array.isArray(entries) ? entries : []).filter((e) => !e.trip_id || !active.has(e.trip_id));
}
