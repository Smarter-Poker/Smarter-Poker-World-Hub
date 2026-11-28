import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  UNDO_WINDOW_MS,
  createPendingDeletes,
  deleteKey,
  hiddenRowsIn,
  pendingDeletesKey,
  withoutHidden,
  withoutHiddenFromStats,
} from '../src/lib/bankroll/pendingDeletes.mjs';

function memoryStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
    raw: map,
  };
}

// A clock the test advances by hand.
function fakeClock() {
  let t = 1_000_000;
  let seq = 0;
  const timers = new Map();
  return {
    now: () => t,
    setTimer: (fn, ms) => { const id = ++seq; timers.set(id, { fn, at: t + ms }); return id; },
    clearTimer: (id) => timers.delete(id),
    advance(ms) {
      t += ms;
      for (const [id, timer] of [...timers]) if (timer.at <= t) { timers.delete(id); timer.fn(); }
    },
    pending: () => timers.size,
  };
}

const tick = () => new Promise((r) => setImmediate(r));

function ledgerExecutor(log, { fail = false, gone = new Set() } = {}) {
  return {
    run: async (userId, id) => {
      log.push(['delete', userId, id]);
      if (fail) throw new Error('Network Down');
      if (gone.has(id)) throw new Error('Entry Not Found');
      gone.add(id);
      log.push(['release-receipts', id]);
    },
    alreadyDone: (e) => e && e.message === 'Entry Not Found',
    afterAlreadyDone: async (userId, id) => { log.push(['release-receipts', id]); },
  };
}

function queueFor(userId, { storage, clock, log, executor, committed = [], failed = [] }) {
  return createPendingDeletes({
    userId, storage, now: clock.now, setTimer: clock.setTimer, clearTimer: clock.clearTimer,
    executors: { ledger: executor || ledgerExecutor(log) },
    onCommitted: (r) => committed.push(r.id), onFailed: (r, e) => failed.push([r.id, e.message]),
  });
}

test('a delete hides at once and is sent after eight seconds, exactly once', async () => {
  const storage = memoryStorage(); const clock = fakeClock(); const log = []; const committed = [];
  const q = queueFor('alice', { storage, clock, log, committed });
  q.schedule({ kind: 'ledger', id: 'e1' });
  assert.ok(q.hiddenKeys().has(deleteKey('ledger', 'e1')));
  assert.equal(q.pending().length, 1);
  assert.equal(log.length, 0, 'nothing is written inside the window');
  assert.ok(storage.getItem(pendingDeletesKey('alice')).includes('e1'), 'recorded so a closed page still finishes it');
  clock.advance(UNDO_WINDOW_MS - 1);
  assert.equal(log.length, 0);
  clock.advance(1);
  await tick();
  assert.deepEqual(log, [['delete', 'alice', 'e1'], ['release-receipts', 'e1']]);
  assert.deepEqual(committed, ['e1']);
  assert.equal(storage.getItem(pendingDeletesKey('alice')), null);
  assert.ok(q.hiddenKeys().has('ledger:e1'), 'a deleted row stays hidden until the next read drops it');
  // A flush, a second schedule and a recovery after the fact send nothing more.
  await q.flush();
  q.schedule({ kind: 'ledger', id: 'e1' });
  await q.recover();
  assert.equal(log.filter((l) => l[0] === 'delete').length, 1);
});

test('Undo restores the row and writes nothing', async () => {
  const storage = memoryStorage(); const clock = fakeClock(); const log = [];
  const q = queueFor('alice', { storage, clock, log });
  q.schedule({ kind: 'ledger', id: 'e1' });
  clock.advance(5000);
  assert.ok(q.undo('ledger:e1'));
  assert.equal(q.hiddenKeys().size, 0);
  assert.equal(clock.pending(), 0);
  clock.advance(60_000);
  await tick();
  assert.deepEqual(log, []);
  assert.equal(storage.getItem(pendingDeletesKey('alice')), null);
  assert.equal(q.undo('ledger:e1'), false);
});

test('several deletes in a row each get their own window and undo', async () => {
  const storage = memoryStorage(); const clock = fakeClock(); const log = [];
  const q = queueFor('alice', { storage, clock, log });
  q.schedule({ kind: 'ledger', id: 'a' });
  clock.advance(2000);
  q.schedule({ kind: 'ledger', id: 'b' });
  clock.advance(2000);
  q.schedule({ kind: 'ledger', id: 'c' });
  assert.deepEqual(q.pending().map((r) => r.id), ['a', 'b', 'c']);
  q.undo('ledger:b');
  clock.advance(4000); // a is due
  await tick();
  assert.deepEqual(log.filter((l) => l[0] === 'delete').map((l) => l[2]), ['a']);
  clock.advance(4000); // c is due
  await tick();
  assert.deepEqual(log.filter((l) => l[0] === 'delete').map((l) => l[2]), ['a', 'c']);
});

test('leaving the page flushes every pending delete; the timer then sends nothing twice', async () => {
  const storage = memoryStorage(); const clock = fakeClock(); const log = [];
  const q = queueFor('alice', { storage, clock, log });
  q.schedule({ kind: 'ledger', id: 'a' });
  q.schedule({ kind: 'ledger', id: 'b' });
  await q.flush();
  assert.deepEqual(log.filter((l) => l[0] === 'delete').map((l) => l[2]), ['a', 'b']);
  clock.advance(UNDO_WINDOW_MS * 2);
  await tick();
  assert.equal(log.filter((l) => l[0] === 'delete').length, 2);
});

test('a page closed inside the window: the next load finishes the delete for the same user only', async () => {
  const storage = memoryStorage(); const clock = fakeClock(); const log = [];
  const first = queueFor('alice', { storage, clock, log });
  first.schedule({ kind: 'ledger', id: 'e1' });
  first.dispose(); // the page went away without its flush landing
  assert.equal(log.length, 0);

  // Bob signs in on the same device: he never sees or runs Alice's delete.
  const bob = queueFor('bob', { storage, clock, log });
  const bobResult = await bob.recover();
  assert.deepEqual(bobResult, { finished: 0, failed: 0, abandoned: 0 });
  assert.equal(log.length, 0);

  const again = queueFor('alice', { storage, clock, log });
  const result = await again.recover();
  assert.equal(result.finished, 1);
  assert.deepEqual(log, [['delete', 'alice', 'e1'], ['release-receipts', 'e1']]);
  assert.equal(storage.getItem(pendingDeletesKey('alice')), null);
});

test('a record naming another user or an unknown kind is abandoned, never run', async () => {
  const storage = memoryStorage(); const clock = fakeClock(); const log = [];
  storage.setItem(pendingDeletesKey('alice'), JSON.stringify([
    { kind: 'ledger', id: 'x', userId: 'mallory', dueAt: 1, attempts: 0 },
    { kind: 'trip', id: 'y', userId: 'alice', dueAt: 1, attempts: 0 },
    'junk',
    { kind: 'ledger', id: 'z', userId: 'alice', dueAt: 1, attempts: 0 },
  ]));
  const q = queueFor('alice', { storage, clock, log });
  const result = await q.recover();
  assert.deepEqual(result, { finished: 1, failed: 0, abandoned: 3 });
  assert.deepEqual(log.filter((l) => l[0] === 'delete').map((l) => l[2]), ['z']);
});

test('a delete that reached the server before the page died is finished, receipts released once', async () => {
  const storage = memoryStorage(); const clock = fakeClock(); const log = [];
  const gone = new Set();
  const first = queueFor('alice', { storage, clock, log, executor: {
    // The request lands on the server but the page dies before it hears back.
    run: async (u, id) => { log.push(['delete', u, id]); gone.add(id); log.push(['release-receipts', id]); await new Promise(() => {}); },
  } });
  first.schedule({ kind: 'ledger', id: 'e1' });
  void first.flush();
  await tick();
  assert.match(storage.getItem(pendingDeletesKey('alice')), /"attempts":1/, 'the attempt is recorded before the request');

  const failed = [];
  const next = queueFor('alice', { storage, clock, log, executor: ledgerExecutor(log, { gone }), failed });
  const result = await next.recover();
  assert.equal(result.finished, 1);
  assert.deepEqual(failed, []);
  // Release ran in the first attempt and the idempotent follow-up in the second;
  // RECEIPT_UNASSIGN only matches receipts still assigned to the row.
  assert.equal(log.filter((l) => l[0] === 'delete').length, 2);
});

test('a first-attempt "not found" is a real failure and the row comes back', async () => {
  const storage = memoryStorage(); const clock = fakeClock(); const log = []; const failed = [];
  const q = queueFor('alice', { storage, clock, log, failed, executor: ledgerExecutor(log, { gone: new Set(['e1']) }) });
  q.schedule({ kind: 'ledger', id: 'e1' });
  await q.flush();
  assert.deepEqual(failed, [['e1', 'Entry Not Found']]);
  assert.equal(q.hiddenKeys().size, 0);
});

test('a failed delete un-hides the row, reports, and clears its record', async () => {
  const storage = memoryStorage(); const clock = fakeClock(); const log = []; const failed = []; const committed = [];
  const q = queueFor('alice', { storage, clock, log, failed, committed, executor: ledgerExecutor(log, { fail: true }) });
  q.schedule({ kind: 'ledger', id: 'e1' });
  clock.advance(UNDO_WINDOW_MS);
  await tick();
  assert.deepEqual(failed, [['e1', 'Network Down']]);
  assert.deepEqual(committed, []);
  assert.equal(q.hiddenKeys().size, 0);
  assert.equal(storage.getItem(pendingDeletesKey('alice')), null);
});

test('Undo in another tab (same storage) stops this tab sending the delete', async () => {
  const storage = memoryStorage(); const clock = fakeClock(); const log = [];
  const tabA = queueFor('alice', { storage, clock, log });
  tabA.schedule({ kind: 'ledger', id: 'e1' });
  const tabB = queueFor('alice', { storage, clock, log });
  // Tab B's view of the record: it ran recover() on load. To simulate A's
  // undo racing B's commit, A undoes first, then B tries the record.
  tabA.undo('ledger:e1');
  const result = await tabB.recover();
  assert.equal(result.finished, 0);
  assert.deepEqual(log, []);
});

test('totals while pending: hidden rows still in the data are taken out, once', () => {
  const rows = [
    { id: 'a', category: 'poker_cash', gross_in: 100, gross_out: 350 },
    { id: 'b', category: 'deposit', gross_in: 0, gross_out: 1000 },
    { id: 'c', category: 'expense', gross_in: 40, gross_out: 0 },
  ];
  const hidden = new Set(['ledger:a', 'ledger:b', 'ledger:c', 'ledger:gone']);
  const present = hiddenRowsIn([rows, rows], hidden);
  assert.deepEqual(present.map((r) => r.id), ['a', 'b', 'c']);
  const stats = withoutHiddenFromStats({ totalBankroll: 5000, allInNet: 300, other: 1 }, present);
  // Balance loses +250, +1000 and -40; Net Results loses +250 and -40.
  assert.equal(stats.totalBankroll, 3790);
  assert.equal(stats.allInNet, 90);
  assert.equal(stats.other, 1);
  // After the reload drops the rows, nothing is subtracted.
  assert.equal(withoutHiddenFromStats({ totalBankroll: 3790, allInNet: 90 }, hiddenRowsIn([[]], hidden)).totalBankroll, 3790);
  assert.deepEqual(withoutHidden(rows, hidden).map((r) => r.id), []);
  assert.equal(withoutHidden(rows, new Set()), rows);
  assert.deepEqual(hiddenRowsIn([[{ id: 'a', _isTripSummary: true }]], hidden), []);
});

test('the UI routes every ledger delete through the undo queue', () => {
  const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
  const page = read('pages/hub/bankroll-manager.js');
  const handler = page.slice(page.indexOf('const handleDeleteEntry'), page.indexOf('const handleDeleteEntry') + 1400);
  assert.doesNotMatch(handler, /await deleteLedgerEntry\(/, 'the page no longer deletes immediately');
  assert.match(handler, /scheduleLedgerDelete\(/);
  const overview = read('src/components/bankroll/CategoryOverview.jsx');
  assert.doesNotMatch(overview, /await deleteLedgerEntry\(/);
  assert.match(overview, /scheduleLedgerDelete\(/);
  const hook = read('src/components/bankroll/usePendingDeletes.js');
  assert.match(hook, /pagehide/);
  assert.match(hook, /visibilitychange/);
  assert.match(hook, /deleteLedgerEntry/, 'the queue sends the one shared delete, which releases receipts');
  assert.match(hook, /recover\(\)/);
});
