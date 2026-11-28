// Deletes with an undo window.
//
// Deleting a ledger entry used to be permanent the instant the button was
// tapped. Now the row is hidden at once, "Entry Deleted" offers Undo for eight
// seconds, and only then is the real delete sent. Undo inside the window
// writes nothing.
//
// A delete the player asked for must never be silently lost, so every pending
// delete is also recorded in localStorage under a key namespaced by the
// signed-in user. Closing or leaving the page inside the window flushes the
// queue (pagehide / visibilitychange), and the next load finishes whatever is
// still recorded for that same user. A record that names another user, or a
// kind this page cannot delete, is abandoned, never run.
//
// Exactly once: a record moves pending -> committing -> settled, and only a
// pending record can be committed, so the timer, a flush and a recovery can
// never send the same delete twice from one page. If a page died after its
// delete reached the server, the retry on the next load gets "not found";
// an executor can say that means "already done" (attempt > 1 or recovered)
// and run its idempotent follow-up instead (the ledger one returns the
// entry's receipts to Receipts Waiting, which is a no-op when already done).
//
// No timer outlives the page: dispose() clears them, and a timer is only
// ever the undo window itself.

import { centsToDollars, entryCents, isMovementRow, isResultRow, toCents } from './ledgerMath.mjs';

export const UNDO_WINDOW_MS = 8000;
const VERSION = 1;

export function pendingDeletesKey(userId) {
  return userId ? `bankroll:pending-deletes:v${VERSION}:${userId}` : null;
}

export function deleteKey(kind, id) {
  return `${kind}:${id}`;
}

function readStored(storage, key) {
  if (!storage || !key) return [];
  try {
    const raw = storage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return [];
  }
}

function writeStored(storage, key, items) {
  if (!storage || !key) return;
  try {
    if (items.length === 0) storage.removeItem(key);
    else storage.setItem(key, JSON.stringify(items));
  } catch (_) {
    // Storage full or blocked: the in-page queue still works, and the
    // pagehide flush is what protects the delete then.
  }
}

/**
 * @param {object} options
 * @param {string} options.userId
 * @param {Storage} [options.storage]       localStorage (or a stand-in)
 * @param {Record<string, {run: Function, alreadyDone?: Function, afterAlreadyDone?: Function}>} options.executors
 * @param {() => number} [options.now]
 * @param {Function} [options.setTimer]
 * @param {Function} [options.clearTimer]
 * @param {number} [options.windowMs]
 * @param {(record) => void} [options.onCommitted]
 * @param {(record, error) => void} [options.onFailed]
 */
export function createPendingDeletes({
  userId,
  storage = null,
  executors = {},
  now = () => Date.now(),
  setTimer = (fn, ms) => setTimeout(fn, ms),
  clearTimer = (handle) => clearTimeout(handle),
  windowMs = UNDO_WINDOW_MS,
  onCommitted = () => {},
  onFailed = () => {},
}) {
  if (!userId) throw new Error('A pending delete needs a signed-in user');
  const key = pendingDeletesKey(userId);
  const records = new Map();
  const settled = new Set();
  const timers = new Map();
  const listeners = new Set();
  let version = 0;

  const emit = () => {
    version += 1;
    for (const fn of [...listeners]) {
      try { fn(); } catch (_) { /* a listener never breaks the queue */ }
    }
  };

  // Storage holds every record that has not settled: pending AND committing,
  // so a page that dies mid-request leaves the delete to be finished later.
  const persist = () => {
    const items = [];
    for (const record of records.values()) {
      items.push({ kind: record.kind, id: record.id, userId: record.userId, label: record.label, dueAt: record.dueAt, attempts: record.attempts });
    }
    writeStored(storage, key, items);
  };

  const stillRecorded = (record) => {
    if (!storage) return true;
    let raw;
    try { raw = storage.getItem(key); } catch (_) { return true; }
    if (raw === null || raw === undefined) return false;
    return readStored(storage, key).some((item) => item && item.kind === record.kind && item.id === record.id);
  };

  const stopTimer = (k) => {
    if (timers.has(k)) {
      clearTimer(timers.get(k));
      timers.delete(k);
    }
  };

  async function commit(k) {
    const record = records.get(k);
    if (!record || record.state !== 'pending') return false;
    stopTimer(k);
    // Another tab undid it (it shares this storage key): nothing to send.
    if (!stillRecorded(record)) {
      records.delete(k);
      emit();
      return false;
    }
    record.state = 'committing';
    record.attempts += 1;
    persist();
    emit();
    const executor = executors[record.kind];
    const context = { attempt: record.attempts, recovered: record.recovered };
    try {
      try {
        await executor.run(userId, record.id, context);
      } catch (error) {
        const retry = record.attempts > 1 || record.recovered;
        if (retry && executor.alreadyDone && executor.alreadyDone(error)) {
          if (executor.afterAlreadyDone) await executor.afterAlreadyDone(userId, record.id, context);
        } else {
          throw error;
        }
      }
    } catch (error) {
      records.delete(k);
      persist();
      emit();
      try { onFailed(record, error); } catch (_) { /* reported by the caller */ }
      return false;
    }
    records.delete(k);
    // A deleted id stays hidden for the life of the page: the rows already on
    // screen came from a read made before the delete, and showing it again
    // until the next read finished would look like Undo had happened.
    settled.add(k);
    persist();
    emit();
    try { onCommitted(record); } catch (_) { /* reported by the caller */ }
    return true;
  }

  function schedule({ kind, id, label = 'Entry Deleted', snapshot = null }) {
    if (!executors[kind]) throw new Error(`No delete is known for ${kind}`);
    if (id === null || id === undefined || id === '') throw new Error('A delete needs an id');
    const k = deleteKey(kind, id);
    if (records.has(k) || settled.has(k)) return records.get(k) || null;
    const record = { key: k, kind, id, userId, label, snapshot, dueAt: now() + windowMs, attempts: 0, state: 'pending', recovered: false };
    records.set(k, record);
    timers.set(k, setTimer(() => { timers.delete(k); void commit(k); }, windowMs));
    persist();
    emit();
    return record;
  }

  function undo(k) {
    const record = records.get(k);
    if (!record || record.state !== 'pending') return false;
    stopTimer(k);
    records.delete(k);
    persist();
    emit();
    return true;
  }

  /** Send every pending delete now (page hidden or closing). */
  function flush() {
    const keys = [...records.values()].filter((r) => r.state === 'pending').map((r) => r.key);
    return Promise.all(keys.map((k) => commit(k)));
  }

  /**
   * Finish the deletes a closed page left recorded for this user. Nothing is
   * offered for undo again: the page that offered it is gone. Returns the
   * number finished and abandoned.
   */
  async function recover() {
    const stored = readStored(storage, key);
    let abandoned = 0;
    const toRun = [];
    const keep = [];
    for (const item of stored) {
      const valid = item && typeof item === 'object' && item.userId === userId
        && typeof item.kind === 'string' && executors[item.kind]
        && item.id !== null && item.id !== undefined && item.id !== '';
      if (!valid) { abandoned += 1; continue; }
      const k = deleteKey(item.kind, item.id);
      keep.push(item);
      if (records.has(k) || settled.has(k)) continue;
      records.set(k, {
        key: k, kind: item.kind, id: item.id, userId, label: item.label || 'Entry Deleted', snapshot: null,
        dueAt: Number(item.dueAt) || now(), attempts: Math.max(0, Number(item.attempts) || 0), state: 'pending', recovered: true,
      });
      toRun.push(k);
    }
    if (abandoned > 0) writeStored(storage, key, keep);
    if (toRun.length) emit();
    const results = await Promise.all(toRun.map((k) => commit(k)));
    return { finished: results.filter(Boolean).length, failed: results.filter((r) => !r).length, abandoned };
  }

  /** Every key whose row must not be shown: pending, committing, deleted. */
  function hiddenKeys() {
    return new Set([...records.keys(), ...settled]);
  }

  /** Pending records, oldest first, for the undo toasts. */
  function pending() {
    return [...records.values()].filter((r) => r.state === 'pending').sort((a, b) => a.dueAt - b.dueAt);
  }

  /** Rows (with their snapshot) that are hidden but not yet deleted on the server. */
  function unsettled() {
    return [...records.values()];
  }

  function subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  }

  function dispose() {
    for (const k of [...timers.keys()]) stopTimer(k);
    listeners.clear();
  }

  return {
    userId,
    schedule,
    undo,
    flush,
    recover,
    commit,
    hiddenKeys,
    pending,
    unsettled,
    subscribe,
    dispose,
    getVersion: () => version,
  };
}

/**
 * Totals shown while deletes are pending. `stats.totalBankroll` and
 * `stats.allInNet` are server reads made before the delete, so the hidden
 * rows still in them are taken back out. Only rows that are still present in
 * the data on screen count: once a reload comes back without them, the read
 * itself is already right and nothing is subtracted twice.
 */
export function withoutHiddenFromStats(stats, presentHiddenRows) {
  if (!stats || !presentHiddenRows || presentHiddenRows.length === 0) return stats;
  let balanceCents = toCents(stats.totalBankroll);
  let netCents = toCents(stats.allInNet);
  for (const row of presentHiddenRows) {
    if (!row || row.is_revision) continue;
    const cents = entryCents(row);
    if (isResultRow(row) || isMovementRow(row)) balanceCents -= cents;
    if (isResultRow(row)) netCents -= cents;
  }
  return { ...stats, totalBankroll: centsToDollars(balanceCents), allInNet: centsToDollars(netCents) };
}

/** Rows whose `${kind}:${id}` is in the hidden set. */
export function withoutHidden(rows, hidden, kind = 'ledger') {
  if (!rows || !hidden || hidden.size === 0) return rows;
  return rows.filter((row) => !(row && hidden.has(deleteKey(kind, row.id))));
}

/**
 * The hidden ledger rows still present in the data on screen (any of the
 * lists given), each once. These are the rows the totals must take out.
 */
export function hiddenRowsIn(lists, hidden, kind = 'ledger') {
  if (!hidden || hidden.size === 0) return [];
  const seen = new Map();
  for (const rows of lists || []) {
    for (const row of rows || []) {
      if (!row || row.id === undefined || row.id === null) continue;
      if (row._isTripSummary) continue;
      if (hidden.has(deleteKey(kind, row.id)) && !seen.has(row.id)) seen.set(row.id, row);
    }
  }
  return [...seen.values()];
}
