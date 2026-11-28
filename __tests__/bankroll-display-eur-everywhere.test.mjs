/**
 * Display EUR is one switch with one formatter.
 *
 * Before: the Settings toggle converted the stat tiles, the trend chart and a
 * few panels, while Recent Activity, the category views, Trip, Series,
 * Staking, Toke, Goals, Rules, the calendar and the projection kept printing
 * "$" - so a player with EUR on saw euros and dollars side by side, and the
 * rate (0.92) carried no date. Now every display of a bankroll result,
 * balance, total or average goes through src/lib/bankroll/currencyUtils.js
 * with a `displayEUR` prop passed down from the page, the rate is one dated
 * constant, and tax, exports and entry forms stay in US dollars on purpose.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  USD_TO_EUR, USD_TO_EUR_AS_OF, convertCurrency, eurRateNote, formatCentsCurrency,
  formatCurrency, formatCurrencyCompact, formatCurrencyWithSign, formatSplit,
} from '../src/lib/bankroll/currencyUtils.js';

const read = (path) => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const code = (path) => read(path).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

test('the rate is one dated constant from a cited primary source', () => {
  assert.equal(USD_TO_EUR, 0.9127);
  assert.match(USD_TO_EUR_AS_OF, /^\d{4}-\d{2}-\d{2}$/);
  const src = read('src/lib/bankroll/currencyUtils.js');
  assert.match(src, /European Central Bank/);
  assert.match(src, /ecb\.europa\.eu/);
  assert.equal((src.match(/USD_TO_EUR = /g) || []).length, 1);
  assert.doesNotMatch(src, /fetch\(|setInterval|setTimeout/);
  assert.equal(eurRateNote(), 'Converted at 0.9127 per dollar, rate as of Nov 27, 2026. Tax reports, exports and entry forms stay in US dollars.');
});

test('the rate is applied once, never twice', () => {
  assert.equal(formatCurrency(1000, true), '€913');
  assert.equal(formatCurrency(1000, false), '$1,000');
  // 1000 * 0.9127 * 0.9127 would read €833.
  assert.notEqual(formatCurrency(1000, true), '€833');
  assert.equal(convertCurrency(1000, true), 912.7);
  assert.equal(convertCurrency(1000, false), 1000);
  assert.equal(formatCentsCurrency(100000, true), '€912.70');
});

test('negatives, zero and null', () => {
  assert.equal(formatCurrency(-250, true), '-€228');
  assert.equal(formatCurrencyWithSign(-250, false), '-$250');
  assert.equal(formatCurrencyWithSign(250, true), '+€228');
  assert.equal(formatCurrencyWithSign(0, true), '€0');
  assert.equal(formatCurrencyWithSign(0, false, { cents: true }), '$0.00');
  // Something that rounds to nothing never reads "-€0".
  assert.equal(formatCurrencyWithSign(-0.004, true), '€0');
  assert.equal(formatCurrencyWithSign(-0.4, true), '€0');
  assert.equal(formatCurrency(null, true), '€0');
  assert.equal(formatCurrency(undefined, false), '$0');
  assert.equal(formatCentsCurrency(null, false), '$0.00');
  assert.equal(formatCentsCurrency(-123456, true, { signed: true }), '-€1,126.78');
  assert.equal(formatCentsCurrency(123456, false, { signed: true }), '+$1,234.56');
});

test('cents variants are cents-safe', () => {
  assert.equal(formatCurrency(425.5, false, { cents: 'auto' }), '$425.50');
  assert.equal(formatCurrency(425, false, { cents: 'auto' }), '$425');
  assert.equal(formatCurrency(425, true, { cents: 'auto' }), '€387.90');
  assert.equal(formatCurrency(0.1 + 0.2, false, { cents: true }), '$0.30');
  assert.equal(formatCurrencyWithSign(-50.5, true, { cents: true }), '-€46.09');
  assert.equal(formatCurrencyCompact(1234, true), '€1.1K');
  assert.equal(formatCurrencyCompact(500000, false), '$500K');
  assert.equal(formatCurrencyCompact(-34000, false), '-$34K');
  assert.equal(formatCurrencyCompact(1000000, false), '$1M');
});

test('staking shares still add up to the gross in euros', () => {
  // Converted one by one: 776.71 against 388.35 + 388.35.
  assert.deepEqual(formatSplit(851, 425.5, 425.5, true, { cents: 'auto' }), ['€776.71', '€388.35', '€388.36']);
  assert.deepEqual(formatSplit(851, 425.5, 425.5, false, { cents: 'auto' }), ['$851', '$425.50', '$425.50']);
  assert.deepEqual(formatSplit(-300, -150, -150, true, { cents: 'auto' }), ['-€273.81', '-€136.90', '-€136.91']);
  // Shares that do not add up are not forced to.
  assert.deepEqual(formatSplit(100, 50, 40, false), ['$100', '$50', '$40']);
  const tracker = code('src/components/bankroll/StakingTracker.jsx');
  assert.match(tracker, /formatShares\(stats\.totalGrossResult, stats\.playerShare, stats\.backerShare, displayEUR\)/);
  assert.match(tracker, /formatShares\(s\.gross_result, s\.player_share, s\.backer_share, displayEUR\)/);
});

// Every component that displays bankroll money, and the page prop that feeds it.
const DISPLAY = {
  'src/components/bankroll/BankrollRulesCard.jsx': /<BankrollRulesCard userId=\{userId\} displayEUR=\{preferences\.currencyEUR\} \/>/,
  'src/components/bankroll/SeriesTracker.jsx': /<SeriesTracker\s+displayEUR=\{preferences\.currencyEUR\}/,
  'src/components/bankroll/TripTracker.jsx': /<TripTracker\s+displayEUR=\{preferences\.currencyEUR\}/,
  'src/components/bankroll/TripReport.jsx': null,
  'src/components/bankroll/StakingTracker.jsx': /<StakingTracker [^>]*displayEUR=\{preferences\.currencyEUR\}/,
  'src/components/bankroll/TournamentCalendar.jsx': /<TournamentCalendar [^>]*displayEUR=\{preferences\.currencyEUR\}/,
  'src/components/bankroll/TokeTracker.jsx': /<TokeTracker [^>]*displayEUR=\{preferences\.currencyEUR\}/,
  'src/components/bankroll/TokeDashboard.jsx': null,
  'src/components/bankroll/VenueIntelligence.jsx': null,
  'src/components/bankroll/toke/CompletedEventsList.jsx': null,
  'src/components/bankroll/toke/MonthlyIncomeGoal.jsx': null,
  'src/components/bankroll/toke/TokeEarningsChart.jsx': null,
  'src/components/bankroll/CategoryOverview.jsx': /<CategoryOverview\s+displayEUR=\{preferences\.currencyEUR\}/,
  'src/components/bankroll/LedgerTimeline.jsx': /<LedgerTimeline\s+displayEUR=\{preferences\.currencyEUR\}\s+entries=\{entries\.slice\(0, 5\)\}/,
  'src/components/bankroll/BankrollGoals.jsx': /<BankrollGoals userId=\{userId\} displayEUR=\{preferences\.currencyEUR\} \/>/,
  'src/components/bankroll/BankrollProjection.jsx': /currentBankroll=\{stats\?\.totalBankroll \|\| 0\}\s+displayEUR=\{preferences\.currencyEUR\}/,
  'src/components/bankroll/SavedReceipts.jsx': /<SavedReceipts userId=\{userId\} displayEUR=\{preferences\.currencyEUR\} \/>/,
  'src/components/bankroll/JarvisLeakInsights.jsx': /<JarvisLeakInsights userId=\{userId\} displayEUR=\{preferences\.currencyEUR\}/,
};

test('every display component accepts the flag and formats through currencyUtils', () => {
  const page = read('pages/hub/bankroll-manager.js');
  for (const [file, wiring] of Object.entries(DISPLAY)) {
    const src = code(file);
    assert.match(src, /displayEUR = false/, file + ' accepts displayEUR');
    assert.match(src, /from '(\.\.\/)+lib\/bankroll\/currencyUtils'/, file + ' formats through currencyUtils');
    assert.match(src, /(formatCurrency\w*|formatCentsCurrency)\([^;]*displayEUR/, file + ' passes the flag to the formatter');
    assert.doesNotMatch(src, /currency: 'USD'/, file + ' keeps no private USD formatter');
    assert.doesNotMatch(src, /formatSignedCents|formatCents\(/, file + ' keeps no ledger-only USD formatter');
    if (wiring) assert.match(page, wiring, file + ' receives the page flag');
  }
});

test('the flag reaches the nested views', () => {
  assert.match(code('src/components/bankroll/TripTracker.jsx'), /<TripReport\s+displayEUR=\{displayEUR\}/);
  assert.match(code('src/components/bankroll/SeriesTracker.jsx'), /<TripReport\s+displayEUR=\{displayEUR\}/);
  assert.match(code('src/components/bankroll/TripReport.jsx'), /<TripROICalculator report=\{report\} displayEUR=\{displayEUR\} \/>/);
  assert.match(code('src/components/bankroll/CategoryOverview.jsx'), /<LedgerTimeline\s+displayEUR=\{displayEUR\}/);
  const toke = code('src/components/bankroll/TokeTracker.jsx');
  for (const child of ['TokeDashboard', 'VenueIntelligence', 'MonthlyIncomeGoal']) {
    assert.match(toke, new RegExp('<' + child + ' [^>]*displayEUR=\\{displayEUR\\}'), child);
  }
  assert.match(toke, /<CompletedEventsList\s+displayEUR=\{displayEUR\}/);
  const page = read('pages/hub/bankroll-manager.js');
  assert.match(page, /<LedgerTimeline\s+displayEUR=\{preferences\.currencyEUR\}\s+entries=\{entries\}/);
});

test('page money all comes from currencyUtils, and Settings states the rate', () => {
  const page = code('pages/hub/bankroll-manager.js');
  assert.doesNotMatch(page, /currency: preferences\.currencyEUR \? 'EUR' : 'USD'/);
  assert.doesNotMatch(page, /reportCurrency|convertCurrency/);
  assert.match(page, /formatCurrencyWithSign\(report\.net, preferences\.currencyEUR, \{ cents: true \}\)/);
  assert.match(page, /formatCurrencyWithSign\(entry\.net_result, preferences\.currencyEUR\)/);
  assert.match(page, /data-testid="eur-rate-note"[^>]*>\{eurRateNote\(\)\}/);
  assert.match(page, /Tax Reports Stay In US Dollars\./);
  assert.match(page, /Exports Stay In US Dollars\./);
});

test('nothing converts an amount that was already converted', () => {
  for (const file of [...Object.keys(DISPLAY), 'pages/hub/bankroll-manager.js', 'src/components/bankroll/analyticsDisplay.jsx']) {
    assert.doesNotMatch(code(file), /format\w*\(\s*convertCurrency\(/, file);
  }
});

// Tax, exports and entry forms are US dollars by design: stored data is USD
// and a form must never convert what the player types.
const STAY_USD = [
  'src/components/bankroll/TaxReportPanel.jsx',
  'src/components/bankroll/AdvancedTaxReport.jsx',
  'src/components/bankroll/TaxSummaryModal.jsx',
  'src/components/bankroll/DealerVault.jsx',
  'src/components/bankroll/BankrollExportFormats.jsx',
  'src/components/bankroll/LogEntryModal.jsx',
  'src/components/bankroll/AdjustBankrollModal.jsx',
  'src/components/bankroll/StartingBankrollModal.jsx',
  'src/components/bankroll/ReceiptScanner.jsx',
  'src/components/bankroll/toke/AddDownModal.jsx',
  'src/components/bankroll/toke/AddExpenseModal.jsx',
  'src/lib/bankroll/tokeReport.mjs',
  'src/lib/bankroll/stakingMath.mjs',
  'src/lib/bankroll/ledgerReport.mjs',
];

test('tax, exports and entry forms never convert', () => {
  for (const file of STAY_USD) {
    const src = code(file);
    assert.doesNotMatch(src, /currencyUtils|displayEUR|currencyEUR|convertCurrency|USD_TO_EUR|'EUR'|€/, file);
  }
  // The scanner used to print "EUR " in front of an unconverted US amount.
  assert.doesNotMatch(read('src/components/bankroll/ReceiptScanner.jsx'), /'EUR '/);
  // Forms that sit next to converted figures say they are in dollars.
  assert.match(code('src/components/bankroll/AdjustBankrollModal.jsx'), /Amount \(USD\)/);
  assert.match(code('src/components/bankroll/AdjustBankrollModal.jsx'), /Current Balance \(USD\)/);
  assert.match(code('src/components/bankroll/LogEntryModal.jsx'), /Net \(USD\):/);
  assert.match(code('src/components/bankroll/StakingTracker.jsx'), /Starting Makeup \(\$\)/);
});

test('exports inside display components stay in US dollars', () => {
  const dash = code('src/components/bankroll/TokeDashboard.jsx');
  assert.match(dash, /const usdText = \(n\) => formatCurrency\(n \|\| 0, false, \{ cents: true \}\)/);
  assert.doesNotMatch(dash, /\$\{show\(/, 'the copied summary never uses the display formatter');
  const toke = code('src/components/bankroll/TokeTracker.jsx');
  assert.match(toke, /const usdText = \(amount\) => formatCurrency\(amount \|\| 0, false, \{ cents: true \}\)/);
  assert.doesNotMatch(toke, /`[^`]*\$\{showMoney\(/, 'the copied report never uses the display formatter');
});

test('the dead BankrollDashboard is gone, not a second copy of the dashboard to keep in step', () => {
  assert.throws(() => read('src/components/bankroll/BankrollDashboard.jsx'));
  assert.doesNotMatch(read('src/components/bankroll/index.js'), /BankrollDashboard/);
});

test('the standalone Toke Tracker pages stay in US dollars', () => {
  for (const page of ['index', 'shift', 'analytics', 'vault', 'venues']) {
    let src;
    try { src = read('pages/hub/toke-tracker/' + page + '.js'); } catch { continue; }
    assert.doesNotMatch(src, /displayEUR|currencyEUR/, page);
  }
});
