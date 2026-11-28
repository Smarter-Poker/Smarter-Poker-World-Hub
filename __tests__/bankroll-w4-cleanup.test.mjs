// Wave 4 cleanup lane: dead bankroll code stays gone, help text says what the
// app does, the filter menus keep their own width, Jarvis findings follow
// Display EUR, and the funnel steps fire once at the right moment without
// personal data.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import * as insights from '../src/lib/bankroll/sessionInsights.mjs';
import { formatCurrency } from '../src/lib/bankroll/currencyUtils.js';
import { FunnelEvents } from '../src/lib/analytics.js';
import {
  noteBankrollOpened, noteReceiptFiled, noteSessionLogged, noteTripStarted, resetFunnelMemory, OPENED_SESSION_KEY,
} from '../src/lib/bankroll/funnelSteps.mjs';
import { BANKROLL_MANAGER_PAGE, bankrollManagerSource } from './helpers/bankroll-manager-source.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// The page reads as itself plus its section modules (the 2026-11-28 split;
// __tests__/helpers/bankroll-manager-source.mjs).
const read = (rel) => (rel === BANKROLL_MANAGER_PAGE ? bankrollManagerSource() : fs.readFileSync(path.join(ROOT, rel), 'utf8'));
const exists = (rel) => fs.existsSync(path.join(ROOT, rel));

test('dead bankroll code is gone and nothing refers to it', () => {
  for (const file of [
    'src/components/bankroll/BankrollHeatMap.jsx', 'src/components/bankroll/BankrollStreaks.jsx',
    'src/components/bankroll/LeakAlertPanel.jsx', 'src/components/bankroll/WeeklySummary.jsx',
    'src/components/bankroll/SessionTimer.jsx', 'pages/api/bankroll/geofence-visit.js',
  ]) assert.equal(exists(file), false, file + ' stays deleted');
  const index = read('src/components/bankroll/index.js');
  assert.doesNotMatch(index, /BankrollHeatMap|BankrollStreaks|LeakAlertPanel|WeeklySummary|SessionTimer/);
  assert.doesNotMatch(read('src/lib/bankroll/leakDetection.ts'), /checkRuleViolations|logRuleViolation|bankroll_rule_violations/);
  assert.doesNotMatch(read('src/lib/bankroll/calendarSelectors.ts'), /updateCalendarEvent|fetchEventsForMonth/);
  assert.doesNotMatch(read('src/lib/bankroll/apiGuard.mjs'), /geofenceVisitRequest/);
  const sel = read('src/lib/bankroll/bankrollSelectors.ts');
  for (const fn of ['fetchLedgerEntry', 'updateBankrollRule', 'fetchUnreadAlerts', 'dismissAlert', 'getStakingStats']) {
    assert.doesNotMatch(sel, new RegExp('function ' + fn + '\\b'), fn + ' stays deleted');
  }
  assert.doesNotMatch(read('src/lib/bankroll/tokeSelectors.ts'), /function fetchExpenses\b/);
  assert.doesNotMatch(read('src/lib/bankroll/ledgerMath.mjs'), /formatSignedCents/);
});

test('help text describes the app as it now works', () => {
  const help = read('src/components/bankroll/BankrollHelp.jsx');
  assert.match(help, /settings: \['Display EUR shows balances[^']*\. Tax Reports, exports and the entry forms stay in US dollars/);
  assert.match(help, /badges: \[/, 'Badges has its own guide');
  assert.match(help, /Leak Analysis and Hand Review, opens in its own view with its own address/);
  assert.match(help, /staking: \['[^']*Only poker cash games and tournaments can be linked/);
  assert.match(help, /Makeup is replayed in the order the sessions were played/);
  assert.match(help, /'staking-profile': \['[^']*poker cash games and tournaments only/);
  assert.match(help, /A W-2G is offered for the W-2G Vault in Tax Reports\. A buy-in is logged as a session on your active trip, and a trip is started for it if none is active\. An expense goes to your Expenses list\./);
  assert.match(help, /Every scan is saved as soon as it is read/);
  assert.match(help, /A trip counts both its first and last day/);
  assert.match(help, /always in US dollars, whatever Display EUR is set to/);
  assert.match(help, /Amounts follow Display EUR/);
  assert.doesNotMatch(help, /Quick Log/i);
  const tutorial = read('src/tutorials/bankroll-manager.js');
  assert.match(tutorial, /Leak Analysis, Hand Review, Receipts, Projections/);
  assert.doesNotMatch(tutorial, /The Add Button Logs Anything/, 'Add + does not take deposits or withdrawals');
  assert.doesNotMatch(read('pages/hub/bankroll-manager.js'), /BB\/100, ROI|and home games with an immutable ledger/);
});

test('each filter menu keeps its own width and stays on a 375px screen', () => {
  const css = read('src/styles/worlds/bankroll.css');
  const rule = css.match(/\.bankroll-dropdown-menu \{([^}]*)\}/);
  assert.ok(rule, 'the menu rule exists');
  assert.doesNotMatch(rule[1], /min-width/, 'no forced width over the component');
  assert.match(rule[1], /max-width: calc\(100vw - 24px\)/);
  const menu = read('src/components/bankroll/BankrollFilterMenu.jsx');
  assert.match(menu, /minWidth: `max\(\$\{minWidth\}px, 100%\)`/);
  assert.match(read('pages/hub/bankroll-manager.js'), /label="Game Types"[\s\S]{0,200}minWidth=\{200\}/);
});

const w = insights.analysisWindow(7, new Date('2026-05-07T23:59:00Z'));
const row = (id, entry_date, net_result, category = 'poker_cash') => ({ id, entry_date, net_result, category, is_revision: false });
const report = () => insights.analyzeSessionRecords([
  ...Array.from({ length: 5 }, (_, i) => row('a' + i, w.end, -3.21, 'slots')),
  ...Array.from({ length: 5 }, (_, i) => row('b' + i, w.previousStart, -20)),
], w);

test('Jarvis findings carry their amounts, and still read as USD sentences for older clients', () => {
  const [slots, change] = report().findings;
  assert.deepEqual(slots.values, { sessions: 5, net: -16.05, minimum: 5 });
  assert.deepEqual(slots.money, ['net']);
  assert.equal(slots.evidence, '5 sessions totaled -$16.05, the lowest net among formats with at least 5 recorded results.');
  assert.equal(change.action, 'Review the change of $16.79 more per session alongside the formats you played.');
  // Through currencyUtils with Display EUR: -16.05 x 0.9127 = -14.65.
  const eur = (v) => formatCurrency(v, true, { cents: true });
  assert.equal(insights.renderFindingPart(slots, 'evidence', eur), '5 sessions totaled -€14.65, the lowest net among formats with at least 5 recorded results.');
  assert.match(insights.renderFindingPart(change, 'evidence', eur), /^-€2\.93 across 5 sessions this period, versus -€18\.25 across 5 from 2026-04-24 through 2026-04-30\.$/);
  // An old-shape finding (a server from before this change) still renders.
  assert.equal(insights.renderFindingPart({ title: 'X', evidence: 'Old $5 text', action: 'Do it' }, 'evidence', eur), 'Old $5 text');
  assert.equal(insights.renderFindingPart(null, 'action', eur), '');
});

test('Jarvis Insights formats through currencyUtils with the page flag and no USD pin', () => {
  const src = read('src/components/bankroll/JarvisLeakInsights.jsx');
  assert.doesNotMatch(src, /· USD/);
  assert.doesNotMatch(src, /currency: 'USD'/);
  assert.match(src, /formatCurrency\(value, displayEUR, \{ cents: true \}\)/);
  assert.match(src, /renderFindingPart\(item, part, money\)/);
  assert.match(read('pages/hub/bankroll-manager.js'), /<JarvisLeakInsights userId=\{userId\} displayEUR=\{preferences\.currencyEUR\}/);
});

function memoryStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) };
}
function countingDb(counts, calls = []) {
  return {
    from(table) {
      const q = { table, filters: [] };
      calls.push(q);
      const chain = {
        select(fields, opts) { q.fields = fields; q.opts = opts; return chain; },
        eq(k, v) { q.filters.push(['eq', k, v]); return chain; },
        in(k, v) { q.filters.push(['in', k, v]); return chain; },
        then(resolve) {
          const c = counts[table];
          return Promise.resolve(c instanceof Error ? { error: c } : { count: c, error: null }).then(resolve);
        },
      };
      return chain;
    },
  };
}

test('the funnel steps fire once, at the right count, with no personal data', async () => {
  resetFunnelMemory();
  const fired = [];
  const capture = (event, props) => fired.push([event, props]);
  const storage = memoryStorage();
  assert.equal(noteBankrollOpened({ storage, capture, signedIn: true }), true);
  assert.equal(noteBankrollOpened({ storage, capture, signedIn: true }), false, 'once per browser session');
  assert.equal(storage.getItem(OPENED_SESSION_KEY), '1');

  const calls = [];
  const db = countingDb({ bankroll_ledger: 2, bankroll_trips: 1, bankroll_receipts: 1 }, calls);
  assert.equal(await noteSessionLogged(db, 'u1', { category: 'expense' }, { capture }), false, 'an expense is not a session');
  assert.equal(calls.length, 0, 'and costs no read');
  assert.equal(await noteSessionLogged(db, 'u1', { category: 'poker_cash', gross_in: 500 }, { capture }), true);
  assert.equal(await noteSessionLogged(db, 'u1', { category: 'poker_cash' }, { capture }), false, 'past the step, never again');
  assert.equal(calls.filter((q) => q.table === 'bankroll_ledger').length, 1, 'and no further reads this session');
  const ledger = calls[0];
  assert.deepEqual(ledger.opts, { count: 'exact', head: true }, 'a head count: no row contents read');
  assert.ok(ledger.filters.some(([op, k, v]) => op === 'eq' && k === 'user_id' && v === 'u1'));
  assert.ok(ledger.filters.some(([op, k, v]) => op === 'eq' && k === 'is_revision' && v === false));

  assert.equal(await noteTripStarted(db, 'u1', { capture }), true);
  assert.equal(await noteReceiptFiled(db, 'u1', { capture, kind: 'ledger_entry' }), true);
  assert.equal(await noteTripStarted(countingDb({ bankroll_trips: 3 }), 'u2', { capture }), false, 'a fourth trip is not a first');
  assert.equal(await noteReceiptFiled(countingDb({ bankroll_receipts: new Error('boom') }), 'u3', { capture }), false, 'a failed count records nothing');

  assert.deepEqual(fired.map(([e]) => e), [
    FunnelEvents.BANKROLL_OPENED, FunnelEvents.BANKROLL_SECOND_SESSION,
    FunnelEvents.BANKROLL_FIRST_TRIP, FunnelEvents.BANKROLL_FIRST_RECEIPT_FILED,
  ]);
  const text = JSON.stringify(fired);
  assert.doesNotMatch(text, /u1|500|gross|amount|name|venue|location|email/i, 'no ids, amounts or names in properties');
});
