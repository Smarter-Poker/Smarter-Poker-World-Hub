// Bankroll Manager reports group (2026-11-27): exports, tax reports, run
// projections, player notes, hand review, leak insights and badges.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildCsv, csvCell, exportRow, fetchAllRows, formatUsd, ledgerCsv, summarizeLedger } from '../src/lib/bankroll/ledgerReport.mjs';
import { calcFederalTax, estimateTax, lossDeductionRate, taxYearTotals, w2gThresholds } from '../src/lib/bankroll/taxMath.mjs';
import { projectionInputs, runProjection, seededRandom, sessionResults } from '../src/lib/bankroll/projectionMath.mjs';
import { filterPlayers, playerNoteRecord } from '../src/lib/bankroll/playerNotesSearch.mjs';
import { badgeMetrics, computeBadges } from '../src/lib/bankroll/bankrollBadges.mjs';
import { describeAction } from '../src/lib/bankroll/handActions.mjs';
import { analysisWindow, clientToday } from '../src/lib/bankroll/sessionInsights.mjs';

const read = (p) => fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const row = (category, gross_in, gross_out, entry_date = '2026-03-10', extra = {}) => ({ category, gross_in, gross_out, entry_date, ...extra });

test('ledger totals count gaming sessions only; deposits are never profit', () => {
  const s = summarizeLedger([
    row('poker_cash', 300, 500),
    row('poker_mtt', 100, 0),
    row('expense', 80, 0),
    row('deposit', 0, 5000),
    row('withdrawal', 1000, 0),
    row('poker_cash', 200, 900, '2026-03-11', { is_revision: true }),
  ]);
  assert.equal(s.sessions, 2);
  assert.equal(s.wins, 1);
  assert.equal(s.sessionNet, 100);
  assert.equal(s.expenses, 80);
  assert.equal(s.netAfterExpenses, 20);
  assert.equal(s.deposits, 5000);
  assert.equal(s.withdrawals, 1000);
  assert.equal(s.winRate, 50);
});

test('CSV cells are escaped in every column and formulas are neutralised', () => {
  assert.equal(csvCell('Bellagio, Las Vegas'), '"Bellagio, Las Vegas"');
  assert.equal(csvCell('He said "fold"'), '"He said ""fold"""');
  assert.equal(csvCell('line one\nline two'), '"line one\nline two"');
  assert.equal(csvCell('=HYPERLINK("x")'), '"\'=HYPERLINK(""x"")"');
  assert.equal(csvCell('@SUM(A1)'), "'@SUM(A1)");
  assert.equal(csvCell(-125.5), '-125.5', 'a negative net stays a number');
  assert.equal(csvCell(null), '');
  assert.equal(buildCsv([['a', 1], ['b, c', -2]]), 'a,1\r\n"b, c",-2');
});

test('the CSV file carries every row with correct signs and dates, and an honest summary', () => {
  const rows = [row('poker_cash', 200, 50, '2026-01-01', { stakes: '1/2, NL', notes: 'tilted' }), row('deposit', 0, 1000, '2026-01-02')].map(exportRow);
  assert.equal(rows[0].net_pl, -150);
  assert.equal(rows[0].date, '2026-01-01');
  const csv = ledgerCsv(rows).split('\r\n');
  assert.equal(csv[1], '2026-01-01,Cash Game,200,50,-150,"1/2, NL",,,,,,tilted');
  assert.ok(csv.includes('Gaming Sessions,1'));
  assert.ok(csv.includes('Session Net P/L,-150'));
  assert.ok(csv.includes('Deposits,1000'));
});

test('exports read every page instead of stopping at a fixed row cap', async () => {
  const all = Array.from({ length: 2345 }, (_, i) => ({ id: i }));
  const ranges = [];
  const rows = await fetchAllRows(() => ({ range: async (from, to) => { ranges.push([from, to]); return { data: all.slice(from, to + 1), error: null }; } }));
  assert.equal(rows.length, 2345);
  assert.deepEqual(ranges, [[0, 999], [1000, 1999], [2000, 2999]]);
  await assert.rejects(fetchAllRows(() => ({ range: async () => ({ data: null, error: new Error('boom') }) })), /boom/);
});

test('money is written -$1,234.50, not $-1,234.5', () => {
  assert.equal(formatUsd(-1234.5), '-$1,234.50');
  assert.equal(formatUsd(980, { cents: false }), '$980');
});

test('export routes use the shared rules: no 500/50 row caps, no revisions, local day file names', () => {
  const exp = read('pages/api/bankroll/export.js');
  const pdf = read('pages/api/bankroll/export-pdf.js');
  const tax = read('pages/api/bankroll/tax-report.js');
  for (const src of [exp, pdf, tax]) {
    assert.match(src, /fetchAllRows/);
    assert.match(src, /\.eq\('is_revision', false\)/);
    assert.doesNotMatch(src, /\.limit\(500\)/);
  }
  assert.doesNotMatch(pdf, /slice\(0, 50\)/);
  assert.match(exp, /req\.body\?\.today/);
  assert.match(read('src/lib/bankroll/exportDownload.mjs'), /localDay\(now\)/);
});

test('a tax year is Jan 1 to Dec 31 by ledger day, session method, deposits excluded', () => {
  const t = taxYearTotals([
    row('poker_cash', 100, 400, '2026-01-01'),
    row('poker_mtt', 500, 0, '2026-04-15'),
    row('slots', 200, 100, '2026-12-31'),
    row('deposit', 0, 9000, '2026-02-01'),
    row('withdrawal', 700, 0, '2026-02-02'),
    row('expense', 50, 0, '2026-05-05'),
    row('poker_cash', 100, 9999, '2025-12-31'),
    row('poker_cash', 100, 9999, '2026-06-01', { is_revision: true }),
  ], 2026);
  assert.equal(t.sessions, 3);
  assert.equal(t.winnings, 300);
  assert.equal(t.losses, 600);
  assert.equal(t.quarters[0].net, 300, 'Jan 1 stays in Q1 of its own year');
  assert.equal(t.quarters[1].losses, 500);
  assert.equal(t.quarters[3].losses, 100, 'Dec 31 stays in Q4');
  assert.equal(t.recordedExpenses, 50);
  assert.equal(t.deductibleLosses, 300, 'losses never deduct past winnings');
});

test('2026 allows 90% of losses; earlier years 100%', () => {
  assert.equal(lossDeductionRate(2025), 1);
  assert.equal(lossDeductionRate(2026), 0.9);
  const y26 = taxYearTotals([row('poker_cash', 0, 10000, '2026-02-01'), row('poker_cash', 10000, 0, '2026-03-01')], 2026);
  assert.equal(y26.deductibleLosses, 9000);
  assert.equal(estimateTax(y26).taxable, 1000, 'breaking even in 2026 still leaves taxable income');
  const y25 = taxYearTotals([row('poker_cash', 0, 10000, '2025-02-01'), row('poker_cash', 10000, 0, '2025-03-01')], 2025);
  assert.equal(estimateTax(y25).taxable, 0);
});

test('federal brackets follow the tax year', () => {
  assert.equal(calcFederalTax(50400, 2026), 5800);
  assert.equal(calcFederalTax(47150, 2024), 5426);
  assert.equal(calcFederalTax(48475, 2025), 5578.5);
  assert.equal(calcFederalTax(0, 2026), 0);
  assert.equal(w2gThresholds(2025).slots, 1200);
  assert.equal(w2gThresholds(2026).slots, 2000);
  assert.equal(w2gThresholds(2026).poker, 5000);
});

test('the State Tax Report reads its own year, not the dashboard filter', () => {
  const src = read('src/components/bankroll/AdvancedTaxReport.jsx');
  assert.match(src, /fetchReportLedger\(userId, \{ startDate: year \+ '-01-01', endDate: year \+ '-12-31', includeExpenses: true \}\)/);
  assert.doesNotMatch(src, /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u, 'no emoji in source');
});

test('the tax report API reads expenses from the ledger and real trips', () => {
  const src = read('pages/api/bankroll/tax-report.js');
  assert.match(src, /from\('bankroll_trips'\)/);
  assert.doesNotMatch(src, /trip\.expenses/);
  // The report itself is built by taxYearReport in taxMath.mjs (summed in cents).
  assert.match(src, /taxYearReport\(/);
  assert.match(read('src/lib/bankroll/taxMath.mjs'), /w2gThresholds\(year\)/);
});

test('projection inputs are validated and only gaming sessions are sampled', () => {
  assert.ok(projectionInputs({ sessionsPerWeek: NaN, projectionDays: 90 }).error);
  assert.ok(projectionInputs({ sessionsPerWeek: 1e9, projectionDays: 90 }).error);
  assert.ok(projectionInputs({ sessionsPerWeek: 3, projectionDays: 45 }).error);
  assert.deepEqual(projectionInputs({ sessionsPerWeek: 3, projectionDays: 30, currentBankroll: 2000 }), { sessionsPerWeek: 3, projectionDays: 30, currentBankroll: 2000 });
  assert.deepEqual(sessionResults([row('poker_cash', 100, 250), row('deposit', 0, 5000), row('expense', 40, 0), row('slots', 50, 0, 'x', { is_revision: true })]), [150]);
});

test('projection math: session count, real peak-to-trough drawdown, ruin and determinism', () => {
  const inputs = { currentBankroll: 1000, sessionsPerWeek: 3, projectionDays: 30 };
  const flat = runProjection([100, 100, 100, 100, 100], inputs, { random: seededRandom(7), runs: 200 });
  assert.equal(flat.projection.sessionsSimulated, 13, '30 days at 3 a week is 13 sessions, not 15');
  assert.equal(flat.projection.expected, 1000 + 13 * 100);
  assert.equal(flat.projection.avgMaxDrawdown, 0);
  assert.equal(flat.projection.ruinProbability, 0);
  // Up 500 then down 500 each pair: a peak-to-trough drawdown of 500 even though it never drops below the start.
  const swing = runProjection([500, -500, 500, -500, 500, -500], inputs, { random: seededRandom(1), runs: 50 });
  assert.ok(swing.projection.avgMaxDrawdown > 0);
  const a = runProjection([200, -150, 80, -300, 400, -50], inputs, { random: seededRandom(42), runs: 300 });
  const b = runProjection([200, -150, 80, -300, 400, -50], inputs, { random: seededRandom(42), runs: 300 });
  assert.deepEqual(a, b);
  const broke = runProjection([-400, -500, -300, -450, -350], { ...inputs, currentBankroll: 500 }, { random: seededRandom(3), runs: 100 });
  assert.equal(broke.projection.ruinProbability, 100);
  assert.equal(runProjection([1, 2, 3, 4, 5], { ...inputs, currentBankroll: 0 }, { random: seededRandom(1), runs: 10 }).projection.ruinProbability, null);
});

test('Run Projections sends the player token (the route answered 401 to every request)', () => {
  const src = read('src/components/bankroll/BankrollProjection.jsx');
  assert.match(src, /Authorization: `Bearer \$\{token\}`/);
  assert.doesNotMatch(src, /userId,\n\s*currentBankroll/);
});

test('player notes search covers tells, tendencies, venue and stakes, with every word', () => {
  const players = [
    { id: 1, nickname: 'Tight Mike', tells: 'Shakes With Monsters', venue: 'Rivers', player_type: 'nit' },
    { id: 2, real_name: 'José Diaz', tendencies: '3-bets light', stakes: '2/5 NL', player_type: 'lag' },
  ];
  const labels = { nit: 'Nit (Ultra-Tight)', lag: 'Loose Aggressive (LAG)' };
  assert.deepEqual(filterPlayers(players, 'shakes', labels).map(p => p.id), [1]);
  assert.deepEqual(filterPlayers(players, '3-bets 2/5', labels).map(p => p.id), [2]);
  assert.deepEqual(filterPlayers(players, 'jose', labels).map(p => p.id), [2], 'accents fold');
  assert.deepEqual(filterPlayers(players, 'loose', labels).map(p => p.id), [2]);
  assert.equal(filterPlayers(players, '   ', labels).length, 2);
  assert.equal(filterPlayers(players, 'nobody', labels).length, 0);
});

test('player notes save trims text, requires a name and keeps the sheet open on failure', () => {
  assert.ok(playerNoteRecord({ nickname: '   ', real_name: '' }).error);
  assert.deepEqual(playerNoteRecord({ nickname: ' Mike ', notes: ' x ' }).record, { nickname: 'Mike', notes: 'x' });
  const src = read('src/components/bankroll/PlayerNotes.jsx');
  assert.doesNotMatch(src, /Silent mutation failed/);
  assert.match(src, /if \(error\) throw error;\n\s*setIsSaving\(false\);\n\s*onSave\(\);/);
  assert.match(src, /No Players Match/);
  assert.doesNotMatch(src, /&#[xX]21A9/);
});

test('hand actions stored as jsonb render as text', () => {
  assert.equal(describeAction([{ street: 'flop', position: 'BTN', action: 'bet', amount: 12 }, { street: 'turn', action: 'check' }]), 'flop BTN bet 12, turn check');
  assert.equal(describeAction([]), '');
  assert.equal(describeAction('raise 3x'), 'raise 3x');
  assert.equal(describeAction(null), '');
  const src = read('src/components/bankroll/SessionHandReview.jsx');
  assert.match(src, /\.in\('category', SESSION_CATEGORIES\)/);
  assert.match(src, /Could Not Link This Hand/);
});

test('Jarvis Insights ends its window on the player’s own day', () => {
  const evening = new Date('2026-11-28T02:30:00Z'); // 8:30 PM Nov 27 in Chicago
  assert.equal(analysisWindow(7, evening).end, '2026-11-28');
  const w = analysisWindow(7, evening, '2026-11-27');
  assert.equal(w.end, '2026-11-27');
  assert.equal(w.start, '2026-11-21');
  assert.equal(clientToday('2026-11-25', evening), null, 'a day that cannot be today anywhere is ignored');
  assert.equal(clientToday('2026-02-30', evening), null);
  assert.match(read('src/components/bankroll/JarvisLeakInsights.jsx'), /today: localDay\(\)/);
  assert.match(read('pages/api/jarvis/bankroll-analysis.js'), /analysisWindow\(days, now, req\.body\?\.today\)/);
});

test('leak checks use gaming categories; rule checks judge the saved entry on its own day', () => {
  const src = read('src/lib/bankroll/leakDetection.ts');
  assert.match(src, /\.in\('category', GAMING_CATEGORIES\)/);
  assert.doesNotMatch(src, /toISOString\(\)\.split/);
  assert.match(src, /severityOf\(/);
  // The live rule check (the page calls it after every save) measures the
  // entry's own calendar day, never the UTC date of "now". The older
  // checkRuleViolations in leakDetection.ts had no caller and was removed.
  assert.doesNotMatch(src, /checkRuleViolations|logRuleViolation/);
  const rules = read('src/lib/bankroll/ruleViolations.mjs');
  assert.match(rules, /const day = String\(entry\.entry_date\)\.slice\(0, 10\);/);
  assert.doesNotMatch(rules, /toISOString\(\)/);
  assert.match(read('pages/hub/bankroll-manager.js'), /evaluateRuleViolations\(\{/);
});

test('badges are measured from recorded sessions, hours, trips and W-2G forms', () => {
  const entries = [
    row('poker_cash', 100, 200, '2026-01-02', { start_time: '2026-01-02T18:00:00Z', end_time: '2026-01-02T23:00:00Z' }),
    row('poker_cash', 100, 300, '2026-01-05'),
    row('poker_mtt', 100, 150, '2026-01-09'),
    row('slots', 100, 0, '2026-02-01'),
    row('deposit', 0, 900, '2026-01-03'),
    row('poker_cash', 0, 999, '2026-01-04', { is_revision: true }),
    row('poker_cash', 100, 200, '2026-03-01', { start_time: '2026-03-01T00:00:00Z', end_time: '2026-03-09T00:00:00Z' }),
  ];
  const m = badgeMetrics(entries, { completedTrips: 1, w2gForms: 0 });
  assert.equal(m.sessions, 5);
  assert.equal(m.wins, 4);
  assert.equal(m.bestStreak, 3);
  assert.equal(m.winningMonths, 1);
  assert.equal(m.hours, 5, 'an eight-day span is ignored');
  const { badges, earned } = computeBadges(entries, { completedTrips: 1, w2gForms: 0 });
  const by = Object.fromEntries(badges.map(b => [b.key, b]));
  assert.equal(by.first_session.earned, true);
  assert.equal(by.hot_streak.earned, true);
  assert.equal(by.road_warrior.earned, true);
  assert.equal(by.paper_trail.earned, false);
  assert.equal(by.bankroll_builder.progress, 5 / 30);
  assert.equal(earned, 5);
});

test('the footer BADGES button opens Badges, not Bankroll Rules', () => {
  const footer = JSON.parse(read('src/config/world-footer-navigation.json'));
  const items = footer.worlds.find(w => w.id === 'bankroll-manager').items;
  assert.deepEqual(items.map(i => i.label), ['Summary', 'Log', 'Trips', 'Reports', 'Badges', 'Export']);
  assert.equal(items[4].href, '/hub/bankroll-manager?view=badges');
  const page = read('pages/hub/bankroll-manager.js');
  assert.match(page, /badges: 'Badges'/);
  assert.match(page, /activeSection === 'badges'[\s\S]*<BankrollBadges userId=\{userId\} \/>/);
  assert.match(read('src/config/hamburgerMenus.js'), /bankroll-manager\?view=rules/, 'Rules stays reachable from the menu');
});
