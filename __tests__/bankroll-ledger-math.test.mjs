// The Bankroll Manager's core ledger math: balance, results, hours and the
// rule check. See src/lib/bankroll/ledgerMath.mjs and ruleViolations.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  bankrollBalanceCents,
  centsToDollars,
  entryCents,
  formatCents,
  resultsCents,
  sessionEndStamp,
  sessionHours,
  toCents,
} from '../src/lib/bankroll/ledgerMath.mjs';
import { evaluateRuleViolations, monthBounds } from '../src/lib/bankroll/ruleViolations.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

const session = (over) => ({ category: 'poker_cash', gross_in: 0, gross_out: 0, entry_date: '2026-11-20', ...over });

test('an Adjust Bankroll deposit and withdrawal move the balance', () => {
  const segments = [{ segment_type: 'poker', initial_deposit: 1000 }, { segment_type: 'life', initial_deposit: 999 }];
  const entries = [
    session({ gross_in: 200, gross_out: 450 }),
    { category: 'expense', gross_in: 50, gross_out: 0 },
    { category: 'deposit', gross_in: 0, gross_out: 500 },
    { category: 'withdrawal', gross_in: 300, gross_out: 0 },
  ];
  // 1000 start + 250 session - 50 expense + 500 deposit - 300 withdrawal; life segment excluded
  assert.equal(bankrollBalanceCents(entries, segments), 140000);
  // Net Results never counts money moved in or out.
  assert.equal(resultsCents(entries), 20000);
});

test('money is summed in cents, not drifting dollar floats', () => {
  const entries = [0.1, 0.2, 0.3].map((v) => session({ gross_out: v }));
  assert.equal(resultsCents(entries), 60);
  assert.equal(centsToDollars(resultsCents(entries)), 0.6);
  assert.equal(toCents('12.345'), 1235);
  assert.equal(toCents('abc'), 0);
});

test('an expense is always money out, whatever sign it was typed with', () => {
  assert.equal(entryCents({ category: 'expense', gross_in: 80, gross_out: 0 }), -8000);
  assert.equal(entryCents({ category: 'expense', gross_in: -80, gross_out: 0 }), -8000);
  assert.equal(entryCents({ category: 'withdrawal', gross_in: 80, gross_out: 0 }), -8000);
  assert.equal(entryCents({ category: 'deposit', gross_in: 0, gross_out: 80 }), 8000);
});

test('a session that runs past midnight has positive hours', () => {
  assert.equal(sessionHours('2026-11-20T21:00:00', '2026-11-20T03:00:00'), 6);
  assert.equal(sessionHours('2026-11-20T13:00:00', '2026-11-20T17:30:00'), 4.5);
  assert.equal(sessionHours('2026-11-20T13:00:00', '2026-11-20T13:00:00'), 0);
  assert.equal(sessionHours(null, '2026-11-20T13:00:00'), 0);
  assert.equal(sessionEndStamp('2026-11-30', '21:00', '03:00'), '2026-12-01T03:00:00');
  assert.equal(sessionEndStamp('2026-12-31', '22:00', '01:15'), '2027-01-01T01:15:00');
  assert.equal(sessionEndStamp('2026-11-20', '13:00', '17:00'), '2026-11-20T17:00:00');
  assert.equal(sessionEndStamp('2026-11-20', '', '17:00'), '2026-11-20T17:00:00');
  assert.equal(sessionEndStamp('2026-11-20', '13:00', ''), null);
});

test('money is shown with cents and one sign', () => {
  assert.equal(formatCents(123450), '$1,234.50');
  assert.equal(formatCents(-5), '-$0.05');
});

const rules = (pairs) => pairs.map(([rule_type, value]) => ({ rule_type, value, is_active: true }));

test('a withdrawal or an expense never trips a stop-loss or a buy-in limit', () => {
  const active = rules([['stop_loss_day', 100], ['max_buyin_percent', 5], ['stop_loss_session', 100]]);
  const withdrawal = { id: 'w', category: 'withdrawal', gross_in: 2000, gross_out: 0, entry_date: '2026-11-20' };
  assert.deepEqual(evaluateRuleViolations({ rules: active, entry: withdrawal, monthEntries: [withdrawal], bankrollCents: 100000 }), []);
  const expense = { id: 'e', category: 'expense', gross_in: 900, gross_out: 0, entry_date: '2026-11-20' };
  assert.deepEqual(evaluateRuleViolations({ rules: active, entry: expense, monthEntries: [expense], bankrollCents: 100000 }), []);
  // A session on the same day is judged on sessions only, not on the withdrawal.
  const small = session({ id: 's', gross_in: 50, gross_out: 0 });
  const found = evaluateRuleViolations({ rules: active, entry: small, monthEntries: [withdrawal, small], bankrollCents: 100000 });
  assert.deepEqual(found.map((v) => v.rule), []);
});

test('the rule check judges the saved entry and its own day, counted once', () => {
  const active = rules([['stop_loss_day', 500], ['stop_loss_session', 300]]);
  const earlier = session({ id: 'a', gross_in: 300, gross_out: 0, entry_date: '2026-11-03' });
  const saved = session({ id: 'b', gross_in: 400, gross_out: 0, entry_date: '2026-11-03' });
  const otherDay = session({ id: 'c', gross_in: 5000, gross_out: 0, entry_date: '2026-11-04' });
  const found = evaluateRuleViolations({ rules: active, entry: saved, monthEntries: [otherDay, saved, earlier], bankrollCents: 500000 });
  assert.deepEqual(found.map((v) => [v.rule, v.actual]), [['Daily Stop-Loss', '-$700.00'], ['Session Stop-Loss', '-$400.00']]);
  // The saved row is counted even when the re-read has not caught up.
  const again = evaluateRuleViolations({ rules: active, entry: saved, monthEntries: [earlier], bankrollCents: 500000 });
  assert.equal(again.find((v) => v.rule === 'Daily Stop-Loss').actual, '-$700.00');
});

test('Monthly Stop-Loss and Session Time Limit are evaluated', () => {
  const active = rules([['stop_loss_month', 1000], ['time_limit_session', 8]]);
  const prior = session({ id: 'a', gross_in: 900, entry_date: '2026-11-02' });
  const lastMonth = session({ id: 'z', gross_in: 9000, entry_date: '2026-10-31' });
  const saved = session({ id: 'b', gross_in: 200, entry_date: '2026-11-20', start_time: '2026-11-20T20:00:00', end_time: '2026-11-20T06:00:00' });
  const found = evaluateRuleViolations({ rules: active, entry: saved, monthEntries: [prior, saved, lastMonth], bankrollCents: 1000000 });
  assert.deepEqual(found.map((v) => [v.rule, v.actual]), [['Monthly Stop-Loss', '-$1,100.00'], ['Session Time Limit', '10 hrs']]);
});

test('Max Buy-In % compares the buy-in with the roll before the session', () => {
  const active = rules([['max_buyin_percent', 5]]);
  // $60 buy-in, lost; roll after is $940, before was $1,000: 6% trips, 5% would not.
  const lost = session({ id: 'x', gross_in: 60, gross_out: 0 });
  assert.equal(evaluateRuleViolations({ rules: active, entry: lost, monthEntries: [lost], bankrollCents: 94000 })[0].actual, '6.0%');
  const fine = session({ id: 'y', gross_in: 50, gross_out: 0 });
  assert.deepEqual(evaluateRuleViolations({ rules: active, entry: fine, monthEntries: [fine], bankrollCents: 95000 }), []);
  // An inactive rule is ignored.
  assert.deepEqual(evaluateRuleViolations({ rules: [{ rule_type: 'max_buyin_percent', value: 1, is_active: false }], entry: lost, monthEntries: [lost], bankrollCents: 94000 }), []);
});

test('monthBounds covers the whole calendar month', () => {
  assert.deepEqual(monthBounds('2026-02-14'), { startDate: '2026-02-01', endDate: '2026-02-28' });
  assert.deepEqual(monthBounds('2028-02-01'), { startDate: '2028-02-01', endDate: '2028-02-29' });
  assert.deepEqual(monthBounds('2026-12-31'), { startDate: '2026-12-01', endDate: '2026-12-31' });
});

test('the balance tile, the segment balance and Adjust Bankroll share the ledger math', () => {
  const calc = read('src/lib/bankroll/calculations.ts');
  assert.match(calc, /bankrollBalanceCents\(/);
  assert.doesNotMatch(calc, /category === 'deposit' \|\| e\.category === 'withdrawal'\) return/);
  const selectors = read('src/lib/bankroll/bankrollSelectors.ts');
  // Adjust Bankroll writes the ledger row on the player's own calendar day.
  const adjust = selectors.slice(selectors.indexOf('export async function adjustBankroll'));
  assert.match(adjust.slice(0, 2500), /entry_date: localDay\(\)/);
  assert.doesNotMatch(selectors, /toISOString\(\)\.split\('T'\)\[0\]/);
  // net_result is a generated column: an insert naming it is refused outright.
  assert.doesNotMatch(selectors, /net_result: amount/);
});

test('Net Results and the trend chart are summed from the same rows', () => {
  const page = read('pages/hub/bankroll-manager.js');
  assert.match(page, /resultsCents\(chartEntries\)/);
  assert.match(page, /evaluateRuleViolations\(/);
});
