// One number everywhere: the SAME synthetic ledger fed through every code path
// that totals Bankroll Manager money must give the same figure to the cent, and
// where two figures differ by design (the tax report leaves out expenses and
// deposits, the balance adds the starting bankroll and the movements) the
// difference must be exactly the documented one.
//
// The ledger is 2,500 rows, so it crosses PostgREST's 1,000-row page: it holds
// cash, tournament, casino, slots and sports sessions; expenses (including the
// older negative-amount and amount-as-cash-out shapes); deposits and
// withdrawals; superseded revision rows; overnight sessions stored both as a
// next-morning end stamp and as a same-day end before the start; cents values
// such as 0.1 + 0.2; and Jan 1 sessions.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  bankrollBalanceCents, entryCents, expenseCostCents, resultsCents, sessionEndStamp, sessionHours, toCents,
} from '../src/lib/bankroll/ledgerMath.mjs';
import { periodStats } from '../src/lib/bankroll/bankrollStats.mjs';
import { buildTrend, comparePeriods, netCents, sessionSummary, venueBreakdown } from '../src/lib/bankroll/analyticsView.mjs';
import { exportRow, fetchAllRows, ledgerCsv, sessionReport, summarizeLedger } from '../src/lib/bankroll/ledgerReport.mjs';
import { taxYearReport, taxYearTotals } from '../src/lib/bankroll/taxMath.mjs';
import { buildTripReport, summarizeByTrip, summarizeTripEntries, tripContribution, sessionHours as tripHours } from '../src/lib/bankroll/tripMath.mjs';
import { netDollars, stakeTotals, timeBlockTotals, tripTotals } from '../src/lib/bankroll/leakMath.mjs';
import { sessionResults } from '../src/lib/bankroll/projectionMath.mjs';
import { badgeMetrics } from '../src/lib/bankroll/bankrollBadges.mjs';
import { parseLedgerDay } from '../src/lib/bankroll/localDates.mjs';
import { statsFromTotals, totalsFromRows } from '../src/lib/bankroll/bankrollTotals.mjs';

// ---------------------------------------------------------------------------
// The ledger. Deterministic (a fixed LCG), built in cents so the expected
// figures are computed independently of every module under test.
// ---------------------------------------------------------------------------
const SESSIONS = ['poker_cash', 'poker_mtt', 'casino_table', 'slots', 'sports'];
const POKER = ['poker_cash', 'poker_mtt'];
const ROWS = 2500;

function makeLedger() {
  let seed = 20261128;
  const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  const rows = [];
  const expected = {
    sessionCents: 0, pokerCents: 0, nonPokerCents: 0, expenseCents: 0, depositCents: 0, withdrawalCents: 0,
    sessions: 0, wins: 0, losses: 0, buyInCents: 0, cashOutCents: 0, hours: 0, revisions: 0,
    byYear: {}, tripCents: {}, startCents: 250000, // $2,500.00 starting bankroll
  };
  const days = [];
  for (let y = 2024; y <= 2026; y++) for (let m = 1; m <= 12; m++) for (let d = 1; d <= 28; d += 3) {
    days.push(`${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
  }
  const money = (max) => Math.round(rand() * max * 100); // cents
  const yearOf = (day) => (expected.byYear[day.slice(0, 4)] ||= { winCents: 0, lossCents: 0, sessions: 0, expenseCents: 0 });

  for (let i = 0; i < ROWS; i++) {
    const id = `row-${String(i).padStart(5, '0')}`;
    const day = i < 6 ? ['2024-01-01', '2025-01-01', '2026-01-01', '2025-12-31', '2026-12-31', '2026-01-01'][i] : days[i % days.length];
    const kind = rand();
    const tripId = i % 7 === 0 ? `trip-${i % 3}` : null;
    let row;
    if (i % 97 === 5) {
      // A superseded revision: it must never be counted anywhere.
      row = { id, category: 'poker_cash', gross_in: 100, gross_out: 99999.99, entry_date: day, is_revision: true, trip_id: tripId };
      expected.revisions++;
      rows.push(row);
      continue;
    }
    if (kind < 0.06) {
      const amount = money(3000) + 1;
      row = { id, category: 'deposit', gross_in: 0, gross_out: amount / 100, entry_date: day };
      expected.depositCents += amount;
    } else if (kind < 0.1) {
      const amount = money(1500) + 1;
      row = { id, category: 'withdrawal', gross_in: amount / 100, gross_out: 0, entry_date: day };
      expected.withdrawalCents += amount;
    } else if (kind < 0.2) {
      const amount = money(400) + 1;
      // The canonical write is gross_in = amount, gross_out = 0. Older rows
      // were typed negative, or put the amount in gross_out.
      const shape = i % 3;
      const gin = shape === 0 ? amount / 100 : shape === 1 ? -amount / 100 : 0;
      const gout = shape === 2 ? amount / 100 : 0;
      row = { id, category: 'expense', gross_in: gin, gross_out: gout, entry_date: day, expense_type: ['hotel', 'travel', 'food'][i % 3], trip_id: tripId };
      expected.expenseCents += amount;
      yearOf(day).expenseCents += amount;
      if (tripId) expected.tripCents[tripId] = (expected.tripCents[tripId] || 0) - amount;
    } else {
      const category = SESSIONS[i % SESSIONS.length];
      let inCents = money(800);
      let outCents = rand() < 0.45 ? 0 : money(1600);
      if (i % 50 === 9) { inCents = 10; outCents = 40; } // 0.1 in, 0.4 out
      if (i % 50 === 19) { inCents = 20; outCents = 50; } // 0.2 in, 0.5 out
      if (i % 50 === 29) { inCents = 30; outCents = 30; } // an even session
      const net = outCents - inCents;
      // Time: every third session is overnight. Half of those are stored the
      // way the log form stores them now (next-morning end stamp), half the
      // old way (end clock before the start on the same day).
      let start_time = null, end_time = null, hours = 0;
      if (i % 4 !== 3) {
        const startHour = i % 3 === 0 ? 21 : 13;
        const endHour = i % 3 === 0 ? 3 : 17;
        start_time = `${day}T${startHour}:00:00`;
        end_time = i % 3 === 0 && i % 2 === 0
          ? sessionEndStamp(day, `${startHour}:00`, `0${endHour}:00`)
          : `${day}T${String(endHour).padStart(2, '0')}:00:00`;
        hours = i % 3 === 0 ? 6 : 4;
      }
      row = {
        id, category, gross_in: inCents / 100, gross_out: outCents / 100,
        // net_result is the generated gross_out - gross_in column.
        net_result: net / 100,
        entry_date: day, start_time, end_time, trip_id: tripId,
        stakes: category === 'poker_cash' ? ['1/2', '2/5'][i % 2] : null,
        location_id: `venue-${i % 4}`, location_name: `Venue ${i % 4}`,
      };
      expected.sessions++;
      expected.sessionCents += net;
      expected.buyInCents += inCents;
      expected.cashOutCents += outCents;
      expected.hours += hours;
      if (net > 0) expected.wins++;
      else if (net < 0) expected.losses++;
      if (POKER.includes(category)) expected.pokerCents += net;
      else expected.nonPokerCents += net;
      const y = yearOf(day);
      y.sessions++;
      if (net > 0) y.winCents += net; else y.lossCents += -net;
      if (tripId) expected.tripCents[tripId] = (expected.tripCents[tripId] || 0) + net;
    }
    row.is_revision = false; // the column is NOT NULL; every read returns it
    rows.push(row);
  }
  expected.resultsCents = expected.sessionCents - expected.expenseCents;
  expected.balanceCents = expected.startCents + expected.resultsCents + expected.depositCents - expected.withdrawalCents;
  return { rows, expected };
}

const { rows: LEDGER, expected: E } = makeLedger();
const SEGMENTS = [
  { segment_type: 'poker', initial_deposit: 2500 },
  // A life segment's deposit is not part of the playing bankroll.
  { segment_type: 'life', initial_deposit: 999999 },
];
const cents = (dollars) => Math.round(dollars * 100);

test('the synthetic ledger is what it claims to be', () => {
  assert.equal(LEDGER.length, ROWS);
  assert.ok(LEDGER.length > 2000, 'crosses two 1,000-row pages');
  for (const c of [...SESSIONS, 'expense', 'deposit', 'withdrawal']) assert.ok(LEDGER.some((r) => r.category === c), c);
  assert.ok(E.revisions > 20);
  assert.ok(LEDGER.some((r) => r.gross_in === 0.1) && LEDGER.some((r) => r.gross_in === 0.2), 'cents rows');
  assert.equal(0.1 + 0.2 === 0.3, false, 'float drift is real, so cents matter');
  assert.ok(LEDGER.some((r) => r.entry_date.endsWith('-01-01') && SESSIONS.includes(r.category)), 'a Jan 1 session');
  assert.ok(LEDGER.some((r) => r.end_time && r.end_time < r.start_time), 'a legacy overnight row');
  assert.ok(LEDGER.some((r) => r.end_time && r.end_time.slice(0, 10) > r.entry_date), 'a next-morning end stamp');
  assert.ok(LEDGER.some((r) => r.category === 'expense' && r.gross_in < 0), 'a negative-typed expense');
  assert.ok(LEDGER.some((r) => r.category === 'expense' && r.gross_out > 0), 'an expense typed as cash-out');
  assert.ok(E.sessionCents !== 0 && E.expenseCents > 0 && E.depositCents > 0 && E.withdrawalCents > 0);
});

test('fetchAllRows pages past 1,000 rows and returns every one, in order', async () => {
  let calls = 0;
  const makeQuery = () => ({
    range: async (from, to) => {
      calls++;
      return { data: LEDGER.slice(from, to + 1), error: null };
    },
  });
  const all = await fetchAllRows(makeQuery);
  assert.equal(all.length, ROWS);
  assert.equal(calls, 3);
  assert.deepEqual(all.map((r) => r.id), LEDGER.map((r) => r.id));
  await assert.rejects(fetchAllRows(() => ({ range: async () => ({ data: null, error: new Error('boom') }) })), /boom/);
});

test('every results total agrees to the cent: tile, stats, chart, reports, trips, leaks, projection', () => {
  const R = E.resultsCents;
  // ledgerMath: the Net Results tile.
  assert.equal(resultsCents(LEDGER), R);
  // bankrollStats: getBankrollStats' allInNet, and its parts.
  const stats = periodStats(LEDGER);
  assert.equal(cents(stats.allInNet), R);
  assert.equal(cents(stats.pokerNet), E.pokerCents);
  assert.equal(cents(stats.nonPokerNet), E.nonPokerCents);
  assert.equal(cents(stats.expenseTotal), E.expenseCents);
  assert.equal(cents(stats.pokerNet) + cents(stats.nonPokerNet) - cents(stats.expenseTotal), R);
  assert.equal(stats.sessionCount, E.sessions);
  // analyticsView: the trend's total, the line's last point, and the summary.
  const trend = buildTrend(LEDGER, '2000-01-01', '2026-12-31');
  assert.equal(trend.total, R);
  assert.equal(trend.line.at(-1).cumulative, R);
  assert.equal(trend.series.at(-1).cumulative, R);
  assert.equal(trend.sessions.length, E.sessions);
  assert.equal(trend.categories.reduce((s, c) => s + c.cents, 0), R);
  assert.equal(sessionSummary(LEDGER).net, E.sessionCents);
  assert.equal(venueBreakdown(LEDGER).reduce((s, v) => s + v.net, 0), E.sessionCents);
  assert.equal(LEDGER.filter((r) => !r.is_revision && r.category !== 'deposit' && r.category !== 'withdrawal')
    .reduce((s, r) => s + netCents(r), 0), R, 'netCents and entryCents are one rule');
  // ledgerReport: CSV / JSON / PDF summaries, export rows, the Reports section.
  const summary = summarizeLedger(LEDGER);
  assert.equal(cents(summary.netAfterExpenses), R);
  assert.equal(cents(summary.sessionNet), E.sessionCents);
  assert.equal(cents(summary.expenses), E.expenseCents);
  assert.equal(cents(summary.deposits), E.depositCents);
  assert.equal(cents(summary.withdrawals), E.withdrawalCents);
  assert.equal(cents(summary.totalBuyIns), E.buyInCents);
  assert.equal(cents(summary.totalCashOuts), E.cashOutCents);
  assert.equal(summary.sessions, E.sessions);
  assert.equal(summary.wins, E.wins);
  assert.equal(summary.losses, E.losses);
  const current = LEDGER.filter((r) => !r.is_revision);
  const exported = current.map(exportRow);
  assert.equal(exported.filter((r) => SESSIONS.includes(r.category_id)).reduce((s, r) => s + cents(r.net_pl), 0), E.sessionCents);
  const csv = ledgerCsv(exported).split('\r\n');
  const csvValue = (label) => Number(csv.find((line) => line.startsWith(label + ','))?.split(',')[1]);
  assert.equal(cents(csvValue('Net After Expenses')), R);
  assert.equal(cents(csvValue('Session Net P/L')), E.sessionCents);
  assert.equal(cents(csvValue('Expenses')), -E.expenseCents);
  assert.equal(cents(csvValue('Deposits')), E.depositCents);
  assert.equal(csvValue('Gaming Sessions'), E.sessions);
  const report = sessionReport(LEDGER);
  assert.equal(cents(report.net), E.sessionCents);
  assert.equal(report.count, E.sessions);
  assert.equal(report.winRate, Math.round((E.wins / E.sessions) * 100));
  // tripMath: every row seen as one trip (movements are not trip results).
  const asTrip = summarizeTripEntries(LEDGER);
  assert.equal(cents(asTrip.totalNet), R);
  assert.equal(cents(asTrip.gamingNet), E.sessionCents);
  assert.equal(cents(asTrip.totalExpenses), E.expenseCents);
  assert.equal(asTrip.sessionCount, E.sessions);
  assert.equal(current.reduce((s, r) => s + cents(tripContribution(r)), 0), R);
  const tripReport = buildTripReport({ id: 'all', start_date: '2024-01-01', end_date: '2026-12-31' }, LEDGER, '2026-12-31');
  assert.equal(cents(tripReport.stats.totalNet), R);
  assert.equal(Object.values(tripReport.dailyBreakdown).reduce((s, v) => s + cents(v), 0), R);
  assert.equal(Object.values(tripReport.categoryBreakdown).reduce((s, v) => s + cents(v.net), 0), R);
  assert.equal(Object.values(tripReport.expenseBreakdown).reduce((s, v) => s + cents(v), 0), E.expenseCents);
  assert.equal(cents(tripReport.stats.buyIns), E.buyInCents);
  // leakMath: trip totals and the net of a session set.
  const leakTrip = tripTotals(current);
  assert.equal(cents(leakTrip.net), R);
  assert.equal(cents(netDollars(current.filter((r) => SESSIONS.includes(r.category)))), E.sessionCents);
  const blocks = timeBlockTotals(current.filter((r) => SESSIONS.includes(r.category)));
  const timedCents = current.filter((r) => SESSIONS.includes(r.category) && r.start_time).reduce((s, r) => s + entryCents(r), 0);
  assert.equal(Object.values(blocks).reduce((s, b) => s + cents(b.net), 0), timedCents);
  const cash = current.filter((r) => r.category === 'poker_cash');
  assert.equal(Object.values(stakeTotals(cash)).reduce((s, b) => s + cents(b.net), 0), cash.reduce((s, r) => s + entryCents(r), 0));
  // projectionMath: the session results the simulation samples.
  const sampled = sessionResults(LEDGER);
  assert.equal(sampled.length, E.sessions);
  assert.equal(sampled.reduce((s, v) => s + cents(v), 0), E.sessionCents);
  // bankrollBadges: same session set.
  assert.equal(badgeMetrics(LEDGER).sessions, E.sessions);
  assert.equal(badgeMetrics(LEDGER).wins, E.wins);
  // bankrollTotals: the client statement of fn_bankroll_totals, and the stats it maps to.
  const totals = totalsFromRows({ ledgerRows: LEDGER, segments: SEGMENTS });
  assert.equal(totals.period.results_cents, R);
  assert.equal(totals.balance.lifetime_results_cents, R);
  assert.equal(totals.period.poker_cents, E.pokerCents);
  assert.equal(totals.period.non_poker_cents, E.nonPokerCents);
  assert.equal(totals.period.expense_cents, E.expenseCents);
  assert.equal(totals.period.session_count, E.sessions);
  assert.equal(totals.period.win_count, E.wins);
  assert.equal(Object.values(totals.period.by_category).reduce((a, b) => a + b, 0), R);
  assert.equal(Object.values(totals.period.by_month).reduce((a, b) => a + b, 0), R);
  assert.equal(totals.period.by_location.reduce((a, b) => a + b.cents, 0), R);
  const mapped = statsFromTotals(totals);
  for (const key of ['allInNet', 'pokerNet', 'nonPokerNet', 'expenseTotal', 'hourlyRate', 'sessionCount', 'winRate', 'leakRisk', 'totalBankroll']) {
    const fromRows = key === 'totalBankroll' ? bankrollBalanceCents(LEDGER, SEGMENTS) / 100 : stats[key];
    assert.equal(mapped[key], fromRows, `statsFromTotals.${key} matches the row path`);
  }
  assert.ok(Math.abs(mapped.totalHours - stats.totalHours) < 1e-9);
});

test('trip totals per trip agree with the rows each trip holds', () => {
  const byTrip = summarizeByTrip(LEDGER);
  for (const [tripId, expectedCents] of Object.entries(E.tripCents)) {
    assert.equal(cents(byTrip[tripId].totalNet), expectedCents, tripId);
    const rows = LEDGER.filter((r) => r.trip_id === tripId);
    assert.equal(resultsCents(rows), expectedCents, tripId);
    assert.equal(cents(tripTotals(rows.filter((r) => !r.is_revision)).net), expectedCents, tripId);
  }
});

test('the balance differs from results by exactly the starting bankroll and the movements', () => {
  const balance = bankrollBalanceCents(LEDGER, SEGMENTS);
  assert.equal(balance, E.balanceCents);
  const totals = totalsFromRows({ ledgerRows: LEDGER, segments: SEGMENTS }).balance;
  assert.equal(totals.balance_cents, E.balanceCents);
  assert.equal(totals.starting_deposit_cents, E.startCents);
  assert.equal(totals.deposit_cents, E.depositCents);
  assert.equal(totals.withdrawal_cents, E.withdrawalCents);
  assert.equal(balance - resultsCents(LEDGER), E.startCents + E.depositCents - E.withdrawalCents);
  const summary = summarizeLedger(LEDGER);
  assert.equal(balance, E.startCents + cents(summary.netAfterExpenses) + cents(summary.deposits) - cents(summary.withdrawals));
});

test('the trend line: peak and low are the running extremes, and the line rises and falls', () => {
  const trend = buildTrend(LEDGER, '2000-01-01', '2026-12-31');
  let running = 0, high = 0, low = 0;
  const byDay = new Map();
  for (const r of LEDGER) {
    if (r.is_revision || r.category === 'deposit' || r.category === 'withdrawal') continue;
    byDay.set(r.entry_date, (byDay.get(r.entry_date) || 0) + entryCents(r));
  }
  for (const day of [...byDay.keys()].sort()) {
    running += byDay.get(day);
    high = Math.max(high, running);
    low = Math.min(low, running);
  }
  assert.equal(trend.high, high);
  assert.equal(trend.low, low);
  const totals = totalsFromRows({ ledgerRows: LEDGER, segments: SEGMENTS });
  assert.equal(totals.period.peak_cumulative_cents, high, 'fn_bankroll_totals peak = the chart peak');
  assert.equal(totals.period.lowest_cumulative_cents, low, 'fn_bankroll_totals low = the chart low');
  const points = trend.line.filter((p) => !p.synthetic);
  assert.equal(points.length, byDay.size, 'one point per recorded day, never bucketed');
  assert.equal(Math.max(0, ...trend.line.map((p) => p.cumulative)), high);
  assert.equal(Math.min(0, ...trend.line.map((p) => p.cumulative)), low);
  assert.equal(trend.period, 'Month');
});

test('tax report: session net only, by year; the documented gaps are exact', () => {
  let taxNet = 0, taxExpenses = 0, taxSessions = 0;
  for (const year of ['2024', '2025', '2026']) {
    const y = E.byYear[year];
    const totals = taxYearTotals(LEDGER, Number(year));
    assert.equal(cents(totals.winnings), y.winCents, year);
    assert.equal(cents(totals.losses), y.lossCents, year);
    assert.equal(cents(totals.net), y.winCents - y.lossCents, year);
    assert.equal(cents(totals.recordedExpenses), y.expenseCents, year);
    assert.equal(totals.sessions, y.sessions, year);
    assert.equal(totals.quarters.reduce((s, q) => s + cents(q.net), 0), cents(totals.net), year);
    // The API's report (JSON and PDF) is built from the same rows.
    const report = taxYearReport(LEDGER, [], Number(year));
    assert.equal(cents(report.summary.netGamblingResult), cents(totals.net));
    assert.equal(cents(report.breakdown.cashGame.net) + cents(report.breakdown.tournament.net), cents(totals.net), year);
    assert.equal(cents(report.breakdown.cashGame.winnings) + cents(report.breakdown.tournament.winnings), y.winCents, year);
    assert.equal(Object.values(report.expenses).reduce((s, v) => s + cents(v), 0), y.expenseCents, year);
    assert.equal(report.sessions.reduce((s, r) => s + cents(r.net), 0), y.winCents - y.lossCents, year);
    assert.equal(cents(report.summary.taxableIncome), cents(totals.winnings) - cents(totals.deductibleLosses));
    taxNet += cents(totals.net);
    taxExpenses += cents(totals.recordedExpenses);
    taxSessions += totals.sessions;
  }
  // By design: the tax net is gaming sessions only. Expenses are listed apart
  // and deposits / withdrawals are not gambling. Every year together is the
  // session net; Net Results differs from it by exactly the expenses.
  assert.equal(taxNet, E.sessionCents);
  assert.equal(taxSessions, E.sessions);
  assert.equal(taxExpenses, E.expenseCents);
  assert.equal(resultsCents(LEDGER) - taxNet, -E.expenseCents);
  // 2026 allows only 90% of losses, never more than winnings.
  const t26 = taxYearTotals(LEDGER, 2026);
  assert.equal(cents(t26.deductibleLosses), Math.min(Math.round(cents(t26.losses) * 0.9), cents(t26.winnings)));
});

test('a Jan 1 session belongs to its own year in every path', () => {
  const jan1 = [
    { id: 'j', category: 'poker_cash', gross_in: 100, gross_out: 350.1, entry_date: '2026-01-01' },
    { id: 'd', category: 'poker_cash', gross_in: 0.2, gross_out: 0.1, entry_date: '2025-12-31' },
  ];
  assert.equal(parseLedgerDay('2026-01-01').getFullYear(), 2026);
  assert.equal(parseLedgerDay('2026-01-01').getDate(), 1);
  assert.equal(cents(taxYearTotals(jan1, 2026).net), 25010);
  assert.equal(cents(taxYearTotals(jan1, 2025).net), -10);
  assert.equal(buildTrend(jan1, '2026-01-01', '2026-12-31').total, 25010);
  assert.equal(periodStats(jan1.filter((r) => r.entry_date >= '2026-01-01')).allInNet, 250.1);
  const years = comparePeriods(jan1, 'year', '2026-06-30');
  assert.equal(years.current.net, 25010);
  assert.equal(years.previous.net, -10);
});

test('cents rows add to cents in every path (0.1 + 0.2 is 0.30)', () => {
  const rows = [
    { category: 'poker_cash', gross_in: 0, gross_out: 0.1, entry_date: '2026-03-01' },
    { category: 'poker_cash', gross_in: 0, gross_out: 0.2, entry_date: '2026-03-02' },
  ];
  assert.equal(resultsCents(rows), 30);
  assert.equal(periodStats(rows).allInNet, 0.3);
  assert.equal(buildTrend(rows, '2026-03-01', '2026-03-31').total, 30);
  assert.equal(summarizeLedger(rows).sessionNet, 0.3);
  assert.equal(sessionReport(rows).net, 0.3);
  assert.equal(taxYearTotals(rows, 2026).net, 0.3);
  assert.equal(summarizeTripEntries(rows).totalNet, 0.3, 'trip totals used to read 0.30000000000000004');
  assert.equal(buildTripReport({}, rows, '2026-03-02').stats.buyIns, 0);
  assert.equal(buildTripReport({}, rows, '2026-03-02').dailyBreakdown['2026-03-02'], 0.2);
  assert.equal(netDollars(rows), 0.3);
});

test('overnight sessions are hours in every path, however they were stored', () => {
  const legacy = { category: 'poker_cash', gross_in: 100, gross_out: 160, entry_date: '2026-05-01', start_time: '2026-05-01T21:00:00', end_time: '2026-05-01T03:00:00' };
  const stamped = { ...legacy, end_time: sessionEndStamp('2026-05-01', '21:00', '03:00') };
  for (const row of [legacy, stamped]) {
    assert.equal(sessionHours(row.start_time, row.end_time), 6);
    assert.equal(tripHours(row), 6);
    assert.equal(periodStats([row]).totalHours, 6);
    assert.equal(periodStats([row]).hourlyRate, 10);
    assert.equal(sessionSummary([row]).hours, 6);
    assert.equal(buildTripReport({}, [row], '2026-05-01').stats.totalHours, 6);
    assert.equal(badgeMetrics([row]).hours, 6);
  }
  assert.equal(periodStats(LEDGER).totalHours, E.hours);
  assert.equal(sessionSummary(LEDGER).hours, E.hours);
  assert.equal(buildTripReport({}, LEDGER, '2026-12-31').stats.totalHours, E.hours);
});

test('a revision row is never money, in any path', () => {
  const live = { id: 'a', category: 'poker_cash', gross_in: 100, gross_out: 250, entry_date: '2026-04-01' };
  const old = { ...live, id: 'b', gross_out: 5000, is_revision: true };
  const rows = [live, old];
  assert.equal(resultsCents(rows), 15000);
  assert.equal(bankrollBalanceCents(rows, []), 15000);
  assert.equal(periodStats(rows).allInNet, 150);
  assert.equal(buildTrend(rows, '2026-04-01', '2026-04-30').total, 15000);
  assert.equal(sessionSummary(rows).count, 1);
  assert.equal(summarizeLedger(rows).sessionNet, 150);
  assert.equal(sessionReport(rows).count, 1);
  assert.equal(taxYearTotals(rows, 2026).net, 150);
  assert.equal(taxYearReport(rows, [], 2026).sessions.length, 1);
  assert.equal(summarizeTripEntries(rows).totalNet, 150);
  assert.equal(buildTripReport({}, rows, '2026-04-01').stats.totalNet, 150);
  assert.deepEqual(sessionResults(rows), [150]);
  assert.equal(badgeMetrics(rows).sessions, 1);
});

test('an expense is a cost in every path, whatever shape its row has', () => {
  const shapes = [
    { category: 'expense', gross_in: 80, gross_out: 0, entry_date: '2026-02-02', expense_type: 'hotel' },
    { category: 'expense', gross_in: -80, gross_out: 0, entry_date: '2026-02-02', expense_type: 'hotel' },
    { category: 'expense', gross_in: 0, gross_out: 80, entry_date: '2026-02-02', expense_type: 'hotel' },
  ];
  for (const row of shapes) {
    const label = JSON.stringify([row.gross_in, row.gross_out]);
    assert.equal(expenseCostCents(row), 8000, label);
    assert.equal(entryCents(row), -8000, label);
    assert.equal(netCents({ ...row, net_result: row.gross_out - row.gross_in }), -8000, label);
    assert.equal(resultsCents([row]), -8000, label);
    assert.equal(periodStats([row]).expenseTotal, 80, label);
    assert.equal(buildTrend([row], '2026-02-01', '2026-02-28').total, -8000, label);
    assert.equal(summarizeLedger([row]).expenses, 80, label);
    assert.equal(taxYearTotals([row], 2026).recordedExpenses, 80, label);
    assert.equal(taxYearReport([row], [], 2026).expenses.hotel, 80, label);
    assert.equal(summarizeTripEntries([row]).totalNet, -80, label);
    assert.equal(tripTotals([row]).expenses, 80, label);
  }
});

test('dollar amounts round-trip through cents without residue', () => {
  for (const v of [0.1, 0.2, 0.3, 1.005, 29217, -14363, 1234.56, '99.99']) assert.equal(toCents(v), Math.round(Number(v) * 100));
});
