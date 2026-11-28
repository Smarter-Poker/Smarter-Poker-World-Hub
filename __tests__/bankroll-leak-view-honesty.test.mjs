/**
 * Review of the Bankroll Manager shell change (#3256): the views it made
 * reachable must tell the truth.
 *
 * - Leak Analysis: a failed ledger read is "Could Not Read Your Ledger", not
 *   a green "No Leaks Detected"; every detector honours the venue the view is
 *   headed with; amounts follow Display EUR and a losing hourly rate reads
 *   "-$24/hr", never "$-24/hr".
 * - Hand Review: signed out it says so instead of loading forever, and the
 *   session amounts follow Display EUR.
 * - Reports: the totals say which venue and time range they cover, because
 *   the page keeps the dashboard filters across views now.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { rowsOf, leakValueText } from '../src/lib/bankroll/leakMath.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

test('a failed Supabase read throws instead of reading as an empty ledger', () => {
  assert.deepEqual(rowsOf({ data: [{ a: 1 }], error: null }), [{ a: 1 }]);
  assert.deepEqual(rowsOf({ data: null, error: null }), []);
  assert.throws(() => rowsOf({ data: null, error: { message: 'Failed to fetch' } }), /Could not read the ledger: Failed to fetch/);
  assert.throws(() => rowsOf({ data: null, error: { message: 'x' } }, 'trips'), /Could not read the trips/);
});

test('leak amounts are formatted in the display currency with the sign in front', () => {
  assert.equal(leakValueText({ hourly: -24.4, value: '$-24/hr' }, false), '-$24/hr');
  assert.equal(leakValueText({ hourly: -24.4 }, true), '-€22/hr');
  assert.equal(leakValueText({ amount: -180 }, false), '-$180');
  // -180 x 0.9127 (ECB reference rate, 2026-11-27) = -164.29
  assert.equal(leakValueText({ amount: -180 }, true), '-€164');
  assert.equal(leakValueText({ amount: -1234.6 }, false), '-$1,235');
  // A finding from an older shape still shows its text.
  assert.equal(leakValueText({ value: '-$50' }, true), '-$50');
  assert.equal(leakValueText(null), '');
});

test('every leak detector reads through rowsOf and honours the venue', () => {
  const src = read('src/lib/bankroll/leakDetection.ts');
  const analysis = src.slice(src.indexOf('export async function runLeakAnalysis'));
  assert.match(analysis, /detectStakeLeaks\(userId, \d+, locationId\)/);
  assert.match(analysis, /detectTimeLeaks\(userId, locationId\)/);
  assert.match(analysis, /detectNonPokerLeaks\(userId, locationId\)/);
  assert.match(analysis, /detectExpenseLeaks\(userId, locationId\)/);
  const detectors = src.slice(src.indexOf('export async function getCategoryLeakPercentage'), src.indexOf('export async function runLeakAnalysis'));
  // No detector destructures `data` and drops `error` any more.
  assert.doesNotMatch(detectors, /const \{ data(: \w+)? \} = await/);
  assert.doesNotMatch(detectors, /const \[\{ data/);
  for (const fn of ['detectStakeLeaks', 'detectTimeLeaks', 'detectExpenseLeaks']) {
    const body = detectors.slice(detectors.indexOf(`export async function ${fn}`));
    const end = body.indexOf('\nexport async function', 10);
    assert.match(end > 0 ? body.slice(0, end) : body, /if \(locationId\) \w+ = \w+\.eq\('location_id', locationId\)/, `${fn} filters by venue`);
  }
  // Each finding carries its number so the view can format it.
  assert.match(detectors, /hourly: hourlyRate/);
  assert.equal((detectors.match(/amount: /g) || []).length, 3);
  assert.doesNotMatch(detectors, /\$\{hourlyRate >= 0 \? '\+' : ''\}\$\$\{/);
});

test('Leak Analysis shows each row through leakValueText', () => {
  const view = read('src/components/bankroll/LeakAnalysisView.jsx');
  assert.match(view, /leakValueText\(leak, displayEUR\)/);
  assert.doesNotMatch(view, /\{leak\.value\}/);
});

test('Hand Review is honest signed out and follows Display EUR', () => {
  const view = read('src/components/bankroll/SessionHandReview.jsx');
  assert.match(view, /if \(userId\) loadData\(\);\s*else setLoading\(false\);/);
  assert.match(view, /if \(!userId\) \{[\s\S]{0,200}SIGN IN TO LINK YOUR HANDS/);
  assert.match(view, /displayEUR \? formatCurrencyWithSign\(Number\(session\.result\), true\)/);
  const page = read('pages/hub/bankroll-manager.js');
  assert.match(page, /<SessionHandReview userId=\{userId\} displayEUR=\{preferences\.currencyEUR\} \/>/);
});

test('Reports say which venue and time range the totals cover', () => {
  const page = read('pages/hub/bankroll-manager.js');
  const reports = page.slice(page.indexOf("{activeSection === 'reports' && ("), page.indexOf('{/* Settings View */}'));
  assert.match(reports, /data-testid="reports-scope"/);
  assert.match(reports, /locationFilter \? `At \$\{selectedLocationName\}` : 'All Locations'\} · \{timeFilter\}/);
  assert.doesNotMatch(page, /Show Every Amount In Euros/);
});
