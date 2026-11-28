// The one undo queue for Bankroll deletes on this page (src/lib/bankroll/
// pendingDeletes.mjs holds the logic and its tests). Every screen that deletes
// shares it, so a row hidden in Recent Activity is hidden in the category view
// and the trip view too, and the undo toasts are drawn once.

import { useEffect, useSyncExternalStore } from 'react';
import { createPendingDeletes, deleteKey } from '../../lib/bankroll/pendingDeletes.mjs';
import {
  deleteLedgerEntry,
  deleteStakingArrangement,
  releaseDeletedEntryReceipts,
} from '../../lib/bankroll/bankrollSelectors';
import { supabase } from '../../lib/supabase';
import toast from '../../stores/toastStore';

async function deleteOwnedRow(table, userId, id) {
  const { error } = await supabase.from(table).delete().eq('id', id).eq('user_id', userId);
  if (error) throw error;
}

// Each kind is ONE call, so a delete is either sent or not: nothing is left
// half done for the next load to guess about.
const EXECUTORS = {
  // deleteLedgerEntry deletes the row and then returns its receipts to
  // Receipts Waiting (#3235). It is sent once per delete; a retry after a
  // closed page that finds the row already gone runs only the idempotent
  // release.
  ledger: {
    run: (userId, id) => deleteLedgerEntry(userId, id),
    alreadyDone: (error) => Boolean(error && error.message === 'Entry Not Found'),
    afterAlreadyDone: (userId, id) => releaseDeletedEntryReceipts(userId, id),
  },
  goal: { run: (userId, id) => deleteOwnedRow('bankroll_goals', userId, id) },
  player_note: { run: (userId, id) => deleteOwnedRow('player_notes', userId, id) },
  staking_deal: { run: (_userId, id) => deleteStakingArrangement(id) },
};

const FAILED = {
  ledger: 'Could Not Delete The Entry. It Has Been Restored.',
  goal: 'Could Not Remove The Goal. It Has Been Restored.',
  player_note: 'Could Not Delete The Player. They Have Been Restored.',
  staking_deal: 'Could Not Delete The Arrangement. It Has Been Restored.',
};

let current = null;
const NONE = Object.freeze([]);
const EMPTY = Object.freeze({ version: 0, queue: null, hidden: new Set(), pending: NONE });
let snapshot = EMPTY;
const outer = new Set();
// One snapshot per change, so the hidden set keeps its identity between
// renders and the lists filtered by it are only rebuilt when it changes.
const notify = () => {
  snapshot = {
    version: (snapshot.version || 0) + 1,
    queue: current,
    hidden: current ? current.hiddenKeys() : EMPTY.hidden,
    pending: current ? current.pending() : NONE,
  };
  for (const fn of [...outer]) fn();
};

function storage() {
  try { return typeof window !== 'undefined' ? window.localStorage : null; } catch (_) { return null; }
}

function announce() {
  // Every Bankroll list and total reloads on this event.
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('bankroll-updated'));
}

function queueFor(userId) {
  if (current && current.userId === userId) return current;
  if (current) {
    // A different account: the previous one's deletes are sent now, while
    // its session may still be valid, and stay recorded under ITS key if
    // they cannot be, for its next sign-in to finish.
    void current.flush();
    current.dispose();
    current = null;
  }
  if (!userId) { notify(); return null; }
  const queue = createPendingDeletes({
    userId,
    storage: storage(),
    executors: EXECUTORS,
    onCommitted: (record) => {
      announce();
      window.dispatchEvent(new CustomEvent('bankroll-entry-deleted', { detail: { kind: record.kind } }));
    },
    onFailed: (record, error) => {
      console.warn('[Bankroll] Delete failed:', record.kind, error);
      const detail = error && error.message && error.message !== 'Entry Not Found' ? ' ' + error.message : '';
      toast.error((FAILED[record.kind] || 'Could Not Delete.') + detail);
      announce();
    },
  });
  queue.subscribe(notify);
  current = queue;
  notify();
  // Finish what a page closed inside its undo window left behind.
  void queue.recover().then(({ finished }) => { if (finished > 0) announce(); });
  return queue;
}

function subscribe(fn) {
  outer.add(fn);
  return () => outer.delete(fn);
}
const getSnapshot = () => snapshot;
const getServerSnapshot = () => EMPTY;

/**
 * The shared queue for this user, plus the hidden-key set to filter by.
 * Mount once per screen that deletes or lists; all mounts share one queue.
 */
export function usePendingDeletes(userId) {
  const snap = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  useEffect(() => { queueFor(userId || null); }, [userId]);

  useEffect(() => {
    if (!userId) return undefined;
    // The page is closing or going to the background: send every pending
    // delete now. Anything that does not finish stays recorded for the next
    // load (recover above).
    const flush = () => { if (current && current.userId === userId) void current.flush(); };
    const onVisibility = () => { if (document.visibilityState === 'hidden') flush(); };
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [userId]);

  const mine = snap.queue && snap.queue.userId === userId;
  return {
    queue: mine ? snap.queue : null,
    hidden: mine ? snap.hidden : EMPTY.hidden,
    pending: mine ? snap.pending : NONE,
    version: snap.version,
  };
}

/** Hide a ledger row now and delete it when its undo window closes. */
export function scheduleLedgerDelete(userId, entry, label = 'Entry Deleted') {
  const queue = queueFor(userId);
  if (!queue || !entry || !entry.id) return null;
  return queue.schedule({ kind: 'ledger', id: entry.id, label, snapshot: entry });
}

/** The same for a goal, a player note or a staking deal. */
export function scheduleDelete(userId, kind, id, label) {
  const queue = queueFor(userId);
  if (!queue || !id) return null;
  return queue.schedule({ kind, id, label });
}

export function isHidden(hidden, kind, id) {
  return hidden.has(deleteKey(kind, id));
}
