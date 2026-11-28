// bankroll-write-live: the write-path production suite for the Bankroll
// Manager. Pins the write guard (only the suite's own marked rows, for the
// signed-in user, may be written), the fixture (Dan's +$29,217 / -$14,363
// case, idempotent), and the workflow wiring (service account, deployed SHA,
// no service-role key, no credential artifact).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  FIXTURE_LOW_CENTS, FIXTURE_PEAK_CENTS, FIXTURE_SESSIONS, FIXTURE_MARKER, TEST_MARKER,
  fixtureMismatches, fixtureNote, fixtureNumber, judgeRequest, missingFixtureSessions,
} from '../e2e/fixtures/bankrollWriteGuard.mjs';
import { buildTrend } from '../src/lib/bankroll/analyticsView.mjs';

const SB = 'https://kuklfnapbkmacvwxktbh.supabase.co';
const APP = 'https://smarter.poker';
const UID = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const ctx = (extra = {}) => ({
  uid: UID,
  owned: { ledger: new Set(['L1']), trips: new Set(['T1']), arrangements: new Set(['A1']), stakingSessions: new Set(['S1']) },
  allowStartingBankroll: false,
  allowDeactivateAll: false,
  ...extra,
});
const judge = (method, path, body = null, extra = {}, headers = {}) =>
  judgeRequest({ method, url: path.startsWith('http') ? path : `${SB}${path}`, headers, body: body === null ? null : JSON.stringify(body) }, ctx(extra)).kind;

test('the fixture rebuilds the reported case: +$29,217 within November, closing at -$14,363', () => {
  assert.equal(FIXTURE_SESSIONS.length, 13);
  const rows = FIXTURE_SESSIONS.map((s) => ({ category: 'poker_cash', entry_date: s.date, gross_in: s.buyIn, gross_out: s.cashOut }));
  const trend = buildTrend(rows, '2000-01-01', '2026-11-28');
  assert.equal(trend.high, FIXTURE_PEAK_CENTS);
  assert.equal(trend.low, FIXTURE_LOW_CENTS);
  assert.equal(trend.total, FIXTURE_LOW_CENTS, 'the line ends at its low');
  const peakDay = trend.line.find((p) => p.cumulative === FIXTURE_PEAK_CENTS).date;
  assert.equal(peakDay.slice(0, 7), '2026-11', 'peak and close are in the same month');
  assert.ok(FIXTURE_SESSIONS.every((s) => s.date >= '2026-02-01' && s.date <= '2026-11-30'));
  // A monthly-bucketed line keeps only November's close: the peak must come from per-day points.
  assert.ok(trend.series.every((p) => p.cumulative < FIXTURE_PEAK_CENTS));
});

test('the fixture is idempotent: existing numbers are never logged twice', () => {
  assert.equal(fixtureNote(3), `${FIXTURE_MARKER} #03`);
  assert.equal(fixtureNumber(`${FIXTURE_MARKER} #11`), 11);
  assert.equal(fixtureNumber('my own note bankroll-live fixture #11'), null, 'only a note that starts with the marker');
  const have = [{ notes: fixtureNote(1) }, { notes: fixtureNote(13) }, { notes: 'unrelated' }];
  assert.deepEqual(missingFixtureSessions(have).map((s) => s.n), [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  const all = FIXTURE_SESSIONS.map((s) => ({ id: 'f' + s.n, notes: fixtureNote(s.n), category: 'poker_cash', entry_date: s.date, gross_in: String(s.buyIn), gross_out: String(s.cashOut) }));
  assert.deepEqual(missingFixtureSessions(all), []);
  assert.deepEqual(fixtureMismatches(all), []);
  assert.equal(fixtureMismatches([...all, { ...all[0], id: 'dup' }]).length, 1, 'a duplicate is reported');
  assert.equal(fixtureMismatches([{ ...all[0], gross_out: 9 }]).length, 1, 'an edited amount is reported');
});

test('inserts: only marked rows for the signed-in user', () => {
  assert.equal(judge('POST', '/rest/v1/bankroll_ledger?select=*', { user_id: UID, notes: `${TEST_MARKER} 1 log entry`, category: 'poker_cash' }), 'allow');
  assert.equal(judge('POST', '/rest/v1/bankroll_ledger', { user_id: UID, notes: fixtureNote(4) }), 'allow');
  assert.equal(judge('POST', '/rest/v1/bankroll_ledger', { user_id: UID, notes: 'Bankroll deposit' }), 'refuse', 'unmarked');
  assert.equal(judge('POST', '/rest/v1/bankroll_ledger', { user_id: OTHER, notes: `${TEST_MARKER}` }), 'refuse', 'another user');
  assert.equal(judge('POST', '/rest/v1/bankroll_ledger', [{ user_id: UID, notes: TEST_MARKER }, { user_id: OTHER, notes: TEST_MARKER }]), 'refuse');
  assert.equal(judge('POST', '/rest/v1/bankroll_trips', { user_id: UID, name: `${TEST_MARKER} trip` }), 'allow');
  assert.equal(judge('POST', '/rest/v1/staking_arrangements', { user_id: UID, backer_name: `${TEST_MARKER} backer` }), 'allow');
  assert.equal(judge('POST', '/rest/v1/staking_sessions', { arrangement_id: 'A1', ledger_entry_id: 'L1' }), 'allow');
  assert.equal(judge('POST', '/rest/v1/staking_sessions', { arrangement_id: 'A1', ledger_entry_id: 'L-other' }), 'refuse');
  assert.equal(judge('POST', '/rest/v1/staking_sessions', { arrangement_id: 'A-other', ledger_entry_id: 'L1' }), 'refuse');
  assert.equal(judge('POST', '/rest/v1/bankroll_locations', { user_id: UID, name: TEST_MARKER }), 'refuse', 'no venue writes');
  assert.equal(judge('POST', '/rest/v1/rpc/fn_anything', {}), 'refuse');
  assert.equal(judge('POST', `${APP}/api/bankroll/export`, {}), 'refuse');
  const createOnly = { prefer: 'resolution=ignore-duplicates,return=minimal' };
  assert.equal(judge('POST', '/rest/v1/bankroll_segments?on_conflict=user_id%2Csegment_type', { user_id: UID }, {}, createOnly), 'allow');
  assert.equal(judge('POST', '/rest/v1/bankroll_segments?on_conflict=user_id%2Csegment_type', { user_id: OTHER }, {}, createOnly), 'refuse');
  assert.equal(judge('POST', '/rest/v1/bankroll_segments?on_conflict=user_id%2Csegment_type', { user_id: UID }, {}, { prefer: 'resolution=merge-duplicates' }), 'refuse');
});

test('updates and deletes: only owned ids, under this user', () => {
  assert.equal(judge('DELETE', `/rest/v1/bankroll_ledger?id=eq.L1&user_id=eq.${UID}&select=id,category`), 'allow');
  assert.equal(judge('DELETE', `/rest/v1/bankroll_ledger?id=eq.L9&user_id=eq.${UID}`), 'refuse', 'a fixture or foreign row');
  assert.equal(judge('DELETE', `/rest/v1/bankroll_ledger?id=eq.L1&user_id=eq.${OTHER}`), 'refuse');
  assert.equal(judge('DELETE', '/rest/v1/bankroll_ledger?id=eq.L1'), 'refuse', 'no user filter');
  assert.equal(judge('PATCH', `/rest/v1/bankroll_ledger?user_id=eq.${UID}&trip_id=eq.T1`, { trip_id: null }), 'allow');
  assert.equal(judge('PATCH', `/rest/v1/bankroll_ledger?user_id=eq.${UID}&trip_id=eq.T9`, { trip_id: null }), 'refuse');
  assert.equal(judge('PATCH', `/rest/v1/bankroll_ledger?user_id=eq.${UID}&trip_id=eq.T1`, { gross_out: 1 }), 'refuse');
  assert.equal(judge('PATCH', `/rest/v1/bankroll_segments?user_id=eq.${UID}&segment_type=eq.poker`, { current_balance: 5, updated_at: 'x' }), 'allow');
  assert.equal(judge('PATCH', `/rest/v1/bankroll_segments?user_id=eq.${UID}&segment_type=eq.poker`, { initial_deposit: 50000, updated_at: 'x' }), 'refuse', 'starting bankroll only when none was set');
  assert.equal(judge('PATCH', `/rest/v1/bankroll_segments?user_id=eq.${UID}&segment_type=eq.poker&select=id`, { initial_deposit: 50000, updated_at: 'x' }, { allowStartingBankroll: true }), 'allow');
  assert.equal(judge('PATCH', `/rest/v1/bankroll_segments?user_id=eq.${OTHER}&segment_type=eq.poker`, { current_balance: 5 }), 'refuse');
  assert.equal(judge('PATCH', `/rest/v1/bankroll_receipts?user_id=eq.${UID}&assigned_id=eq.L1`, { status: 'unassigned' }), 'allow');
  assert.equal(judge('PATCH', `/rest/v1/bankroll_receipts?user_id=eq.${UID}&assigned_id=eq.L9`, { status: 'unassigned' }), 'refuse');
  assert.equal(judge('PATCH', `/rest/v1/bankroll_trips?user_id=eq.${UID}&id=eq.T1&status=eq.active&select=*`, { status: 'completed' }), 'allow');
  assert.equal(judge('PATCH', `/rest/v1/bankroll_trips?user_id=eq.${UID}&id=eq.T9`, { status: 'deleted' }), 'refuse');
  assert.equal(judge('PATCH', '/rest/v1/staking_arrangements?id=eq.A1', { is_active: false }), 'allow');
  assert.equal(judge('DELETE', '/rest/v1/staking_arrangements?id=eq.A1'), 'allow');
  assert.equal(judge('DELETE', '/rest/v1/staking_arrangements?id=eq.A9'), 'refuse');
  assert.equal(judge('PATCH', `/rest/v1/staking_arrangements?user_id=eq.${UID}&is_active=eq.true`, { is_active: false, updated_at: 'x' }), 'refuse', 'would end a foreign deal');
  assert.equal(judge('PATCH', `/rest/v1/staking_arrangements?user_id=eq.${UID}&is_active=eq.true`, { is_active: false, updated_at: 'x' }, { allowDeactivateAll: true }), 'allow');
  assert.equal(judge('DELETE', '/rest/v1/staking_sessions?id=eq.S1'), 'allow');
  assert.equal(judge('PATCH', '/rest/v1/staking_sessions?id=eq.S7', { player_share: 1 }), 'lookup', 'resolved by reading the row');
  assert.equal(judge('DELETE', '/rest/v1/staking_sessions'), 'refuse');
  assert.equal(judge('DELETE', `/rest/v1/bankroll_trips?id=eq.T1&user_id=eq.${UID}`), 'refuse', 'trips are never hard-deleted');
});

test('reads, the session refresh, shell writes and telemetry are classified like the read-only suite', () => {
  assert.equal(judge('GET', '/rest/v1/bankroll_ledger?select=*'), 'read');
  assert.equal(judge('POST', '/auth/v1/token?grant_type=refresh_token', {}), 'session');
  assert.equal(judge('POST', '/auth/v1/token?grant_type=password', {}), 'refuse');
  assert.equal(judge('POST', '/rest/v1/rpc/fn_update_presence', {}), 'shell');
  assert.equal(judge('POST', '/rest/v1/rpc/fn_lightning_my_sessions', {}), 'read');
  assert.equal(judge('POST', 'https://us.i.posthog.com/e/', {}), 'telemetry');
  assert.equal(judgeRequest({ method: 'POST', url: `${SB}/rest/v1/bankroll_ledger`, body: '{}' }, { ...ctx(), uid: null }).kind, 'refuse', 'no user, no writes');
});

test('the workflow runs bankroll-write-live as the service account, pinned, and never with service-role', () => {
  const wf = readFileSync(new URL('../.github/workflows/e2e-tests.yml', import.meta.url), 'utf8');
  assert.match(wf, /options: \[[^\]]*\bbankroll-write-live\b[^\]]*\]/);
  const job = wf.match(/^  bankroll-write-live:\n[\s\S]*?(?=^  [a-zA-Z0-9_-]+:\n|(?![\s\S]))/m)?.[0] || '';
  assert.ok(job, 'bankroll-write-live job missing');
  assert.match(job, /if: \$\{\{ inputs\.suite == 'bankroll-write-live' \}\}/);
  assert.match(job, /TEST_USER_EMAIL: \$\{\{ vars\.TEST_USER_EMAIL \|\| secrets\.TEST_USER_EMAIL \}\}/);
  assert.match(job, /TEST_USER_PASSWORD: \$\{\{ secrets\.TEST_USER_PASSWORD \}\}/);
  assert.match(job, /BANKROLL_LIVE_EXPECTED_SHA: \$\{\{ inputs\.expected_sha \}\}/);
  assert.match(job, /\^\[0-9a-f\]\{40\}\$/);
  assert.match(job, /npx playwright test --config=playwright\.bankroll-write-live\.config\.ts/);
  assert.match(job, /path: test-results\/bankroll-write-live\//);
  assert.match(job, /cancel-in-progress: false/, 'two runs never write at once');
  assert.doesNotMatch(job, /playwright\/\.auth|SERVICE_ROLE|service_role/);
  const config = readFileSync(new URL('../playwright.bankroll-write-live.config.ts', import.meta.url), 'utf8');
  assert.match(config, /baseURL: 'https:\/\/smarter\.poker'/);
  assert.match(config, /retries: 0/);
  assert.match(config, /workers: 1/);
  assert.match(config, /width: 375/);
  const base = readFileSync(new URL('../playwright.config.ts', import.meta.url), 'utf8');
  assert.equal((base.match(/\/bankroll-write-live\\\.spec\\\.ts\$\//g) || []).length, 2, 'the default config never runs it');
  const spec = readFileSync(new URL('../e2e/bankroll-write-live.spec.ts', import.meta.url), 'utf8');
  assert.match(spec, /judgeRequest\(/);
  assert.match(spec, /route\.abort\('blockedbyclient'\)/);
  assert.match(spec, /expect\(ctx\.refused/);
  assert.doesNotMatch(spec, /TEST_USER_PASSWORD|SERVICE_ROLE|service_role|console\.log/);
});
