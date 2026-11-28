import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LIVE_SESSION_CATEGORIES,
  addTopUp,
  dueTimeAlerts,
  elapsedMs,
  endLiveSession,
  formatElapsed,
  investedCents,
  liveSessionKey,
  markAlerts,
  parseLiveSession,
  readLiveSession,
  resumeLiveSession,
  startLiveSession,
  startWarnings,
  toLogPrefill,
  topUpWarnings,
  warningText,
  writeLiveSession,
} from '../src/lib/bankroll/liveSession.mjs';

function memoryStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
    keys: () => [...map.keys()],
  };
}

const at = (h, m = 0, day = 28) => new Date(2026, 10, day, h, m).getTime();
const MIN = 60000;

test('a running session is stored per user and never shown to anyone else', () => {
  const storage = memoryStorage();
  const s = startLiveSession({ userId: 'alice', id: 's1', category: 'poker_cash', detail: '1/3 NLH', buyInCents: 30000, now: at(19) });
  assert.ok(writeLiveSession(storage, 'alice', s));
  assert.deepEqual(storage.keys(), [liveSessionKey('alice')]);
  assert.ok(liveSessionKey('alice').includes('alice'));
  assert.equal(readLiveSession(storage, 'alice').id, 's1');
  assert.equal(readLiveSession(storage, 'bob'), null, 'another user reads their own key, which is empty');
  assert.equal(readLiveSession(storage, null), null, 'signed out sees nothing');
  assert.equal(liveSessionKey(null), null);
  // A record copied under the wrong user key is refused on its userId.
  storage.setItem(liveSessionKey('bob'), storage.getItem(liveSessionKey('alice')));
  assert.equal(readLiveSession(storage, 'bob'), null);
  // Garbage never crashes and never shows.
  storage.setItem(liveSessionKey('carol'), '{not json');
  assert.equal(readLiveSession(storage, 'carol'), null);
  assert.equal(parseLiveSession({ v: 1, userId: 'x', category: 'expense', startedAt: 1, buyIns: [{ kind: 'buy_in', cents: 1, at: 1 }] }, 'x'), null);
  assert.ok(writeLiveSession(storage, 'alice', null));
  assert.equal(readLiveSession(storage, 'alice'), null);
});

test('expense is not a live session category; tournaments may be freerolls, cash may not be $0', () => {
  assert.ok(!LIVE_SESSION_CATEGORIES.some((c) => c.id === 'expense'));
  assert.throws(() => startLiveSession({ userId: 'u', category: 'expense', buyInCents: 100, now: 1 }));
  assert.throws(() => startLiveSession({ userId: 'u', category: 'poker_cash', buyInCents: 0, now: 1 }));
  assert.throws(() => startLiveSession({ userId: null, category: 'poker_cash', buyInCents: 100, now: 1 }));
  assert.equal(startLiveSession({ userId: 'u', category: 'poker_mtt', buyInCents: 0, now: 1 }).buyIns[0].cents, 0);
});

test('rebuys and add-ons add to the buy-in with their own time; elapsed time is clock based', () => {
  let s = startLiveSession({ userId: 'u', id: 'a', category: 'poker_cash', buyInCents: 20000, now: at(19) });
  s = addTopUp(s, { kind: 'rebuy', cents: 20000, now: at(20, 10) });
  s = addTopUp(s, { kind: 'add_on', cents: 5050, now: at(21) });
  assert.equal(investedCents(s), 45050);
  assert.deepEqual(s.buyIns.map((b) => b.at), [at(19), at(20, 10), at(21)]);
  assert.equal(formatElapsed(elapsedMs(s, at(21, 5) + 9000)), '2:05:09');
  assert.throws(() => addTopUp(s, { kind: 'rebuy', cents: 0, now: at(22) }));
  const ended = endLiveSession(s, { cashOutCents: 0, now: at(22) });
  assert.throws(() => addTopUp(ended, { kind: 'rebuy', cents: 100, now: at(22) }));
  assert.equal(elapsedMs(ended, at(23)), 3 * 3600000, 'an ended session stops its clock');
  assert.equal(resumeLiveSession(ended).ended, null);
});

test('a tournament rebuy is one more buy-in at the starting price', () => {
  let s = startLiveSession({ userId: 'u', id: 't', category: 'poker_mtt', detail: 'Deepstack', buyInCents: 15000, now: at(12) });
  s = addTopUp(s, { kind: 'rebuy', cents: 99999, now: at(13) });
  s = addTopUp(s, { kind: 'add_on', cents: 5000, now: at(14) });
  const { category, fields } = toLogPrefill(endLiveSession(s, { cashOutCents: 120000, now: at(18) }));
  assert.equal(category, 'poker_mtt');
  assert.equal(fields.buy_in_amount, '150');
  assert.equal(fields.reentry_count, '1');
  assert.equal(fields.add_on_amount, '50');
  assert.equal(fields.gross_in, '350');
  assert.equal(fields.gross_out, '1200');
  assert.equal(fields.tournament_name, 'Deepstack');
});

test('End Session prefills the log: overnight times, venue, trip, buy-in log', () => {
  let s = startLiveSession({
    userId: 'u', id: 'n', category: 'poker_cash', detail: '2/5 NLH', tripId: 'trip-1', buyInCents: 50000, now: at(21, 5, 27),
    venue: { location_id: 'loc-1', location_name: 'Bellagio', venue_type: 'casino', poker_venue_id: 42, venue_lat: 36.1, venue_lng: -115.2 },
  });
  s = addTopUp(s, { kind: 'rebuy', cents: 50000, now: at(23, 30, 27) });
  const { fields, sessionId } = toLogPrefill(endLiveSession(s, { cashOutCents: 180025, now: at(3, 15, 28) }));
  assert.equal(sessionId, 'n');
  assert.equal(fields.entry_date, '2026-11-27', 'dated the day it started');
  assert.equal(fields.start_time_text, '9:05');
  assert.equal(fields.start_period, 'PM');
  assert.equal(fields.end_time_text, '3:15');
  assert.equal(fields.end_period, 'AM', 'the Log form stores an earlier end as the next morning');
  assert.equal(fields.gross_in, '1000');
  assert.equal(fields.gross_out, '1800.25');
  assert.equal(fields.stakes, '2/5 NLH');
  assert.equal(fields.location_name, 'Bellagio');
  assert.equal(fields.poker_venue_id, 42);
  assert.equal(fields.trip_id, 'trip-1');
  assert.match(fields.notes, /Buy-In \$500\.00 at 9:05 PM; Rebuy \$500\.00 at 11:30 PM/);
  assert.throws(() => toLogPrefill(s), /End The Session First/);
});

const rule = (rule_type, value) => ({ rule_type, value, is_active: true });

test('a rebuy that would cross the Daily Stop-Loss warns, counting today\'s saved sessions', () => {
  const s = startLiveSession({ userId: 'u', id: 'd', category: 'poker_cash', buyInCents: 20000, now: at(19) });
  const today = [
    { id: 'x', category: 'poker_cash', entry_date: '2026-11-28', gross_in: 300, gross_out: 100 },
    { id: 'w', category: 'withdrawal', entry_date: '2026-11-28', gross_in: 5000, gross_out: 0 },
    { id: 'y', category: 'poker_cash', entry_date: '2026-11-27', gross_in: 9000, gross_out: 0 },
  ];
  const rules = [rule('stop_loss_day', 500)];
  // Saved today: -200. Running: -200. A $50 rebuy makes -450: under the limit.
  assert.deepEqual(topUpWarnings({ rules, session: s, addCents: 5000, now: at(20), todayEntries: today, balanceCents: null }), []);
  // A $100 rebuy makes -500: at the limit.
  const w = topUpWarnings({ rules, session: s, addCents: 10000, now: at(20), todayEntries: today, balanceCents: null });
  assert.equal(w.length, 1);
  assert.equal(w[0].rule, 'Daily Stop-Loss');
  assert.equal(w[0].actual, '-$500.00');
});

test('warning text follows the display formatter when the violation carries cents', () => {
  const v = { rule: 'Daily Stop-Loss', limit: '$300.00', actual: '-$500.00', limitCents: 30000, actualCents: -50000 };
  const eur = (c) => (c < 0 ? '-' : '') + 'EUR ' + (Math.abs(c) / 100).toFixed(2);
  assert.equal(warningText(v, eur), 'Daily Stop-Loss EUR 300.00: Today Would Be -EUR 500.00 If This Is Lost.');
  assert.equal(warningText({ rule: 'Daily Stop-Loss', limit: '$300.00', actual: '-$500.00' }, eur),
    'Daily Stop-Loss $300.00: Today Would Be -$500.00 If This Is Lost (USD).', 'no cents: the USD strings, labelled');
  assert.equal(warningText({ rule: 'Max Buy-In %', limit: '25%', actual: '30.0%' }, eur), 'Max Buy-In 25% Of Bankroll: This Would Be 30.0%.');
});

test('Max Buy-In % judges the total in against the roll the player sat down with', () => {
  const rules = [rule('max_buyin_percent', 10)];
  const s = startLiveSession({ userId: 'u', id: 'm', category: 'poker_cash', buyInCents: 50000, now: at(19) });
  assert.deepEqual(topUpWarnings({ rules, session: s, addCents: 50000, now: at(20), todayEntries: [], balanceCents: 1000000 }), []);
  const w = topUpWarnings({ rules, session: s, addCents: 50100, now: at(20), todayEntries: [], balanceCents: 1000000 });
  assert.equal(w[0].rule, 'Max Buy-In %');
  assert.equal(w[0].actual, '10.0%');
  assert.deepEqual(topUpWarnings({ rules, session: s, addCents: 500000, now: at(20), todayEntries: [], balanceCents: null }), [],
    'an unknown balance is not judged as zero');
  assert.equal(startWarnings({ rules, userId: 'u', category: 'poker_cash', buyInCents: 200000, now: at(19), todayEntries: [], balanceCents: 1000000 })[0].rule, 'Max Buy-In %');
});

test('Session Time Limit warns once 15 minutes before and once at the limit', () => {
  const rules = [rule('time_limit_session', 2)];
  let s = startLiveSession({ userId: 'u', id: 't', category: 'poker_cash', buyInCents: 100, now: at(19) });
  assert.deepEqual(dueTimeAlerts({ rules, session: s, now: at(20, 30) }).alerts, []);
  let due = dueTimeAlerts({ rules, session: s, now: at(20, 46) });
  assert.deepEqual(due.alerts.map((a) => a.key), ['time-soon']);
  s = markAlerts(s, due.keys);
  assert.deepEqual(dueTimeAlerts({ rules, session: s, now: at(20, 50) }).alerts, [], 'the early warning is shown once');
  due = dueTimeAlerts({ rules, session: s, now: at(21, 0) + 1000 });
  assert.deepEqual(due.alerts.map((a) => a.key), ['time-limit']);
  s = markAlerts(s, due.keys);
  assert.deepEqual(dueTimeAlerts({ rules, session: s, now: at(23) }).alerts, []);
});

test('a page reopened past the limit shows only the limit alert; a tiny limit gets no early warning', () => {
  const s = startLiveSession({ userId: 'u', id: 'r', category: 'slots', buyInCents: 100, now: at(19) });
  const late = dueTimeAlerts({ rules: [rule('time_limit_session', 1)], session: s, now: at(21) });
  assert.deepEqual(late.alerts.map((a) => a.key), ['time-limit']);
  assert.deepEqual(late.keys.sort(), ['time-limit', 'time-soon']);
  const tiny = dueTimeAlerts({ rules: [rule('time_limit_session', 0.2)], session: s, now: at(19, 1) });
  assert.deepEqual(tiny.alerts, []);
  assert.deepEqual(dueTimeAlerts({ rules: [], session: s, now: at(23) }).alerts, []);
  assert.deepEqual(dueTimeAlerts({ rules: [rule('time_limit_session', 1)], session: endLiveSession(s, { cashOutCents: 0, now: at(19, 5) }), now: at(23) }).alerts, []);
});

test('the live session UI reuses the rule logic and the Log form path', async () => {
  const { readFileSync } = await import('node:fs');
  const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
  const lib = read('src/lib/bankroll/liveSession.mjs');
  assert.match(lib, /import \{ evaluateRuleViolations \} from '\.\/ruleViolations\.mjs'/);
  const ui = read('src/components/bankroll/LiveSession.jsx');
  assert.doesNotMatch(ui, /createLedgerEntry|from\('bankroll_ledger'\)\.insert/, 'the bar never saves a row itself');
  assert.doesNotMatch(ui, /setInterval\([^)]*\)\s*;?\s*$/m, 'the clock interval is cleared on unmount');
  assert.match(ui, /clearInterval/);
  assert.doesNotMatch(ui, /serviceWorker|PushManager/, 'no server push');
  const modal = read('src/components/bankroll/LogEntryModal.jsx');
  assert.match(modal, /livePrefill/);
  const page = read('pages/hub/bankroll-manager.js');
  assert.match(page, /<LiveSession\b/);
  assert.match(page, /livePrefill=\{livePrefill\}/);
});
