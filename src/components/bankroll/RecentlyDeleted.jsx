/**
 * RECENTLY DELETED
 *
 * Ledger entries deleted in the last 30 days, read from the DELETE rows the
 * ledger's own trigger writes to bankroll_ledger_changes (old_row is the whole
 * deleted row). Restore puts the entry back through createLedgerEntry with its
 * original id, so its date, amounts, notes, photos and created time are what
 * they were. Delete Forever removes the entry's saved history.
 *
 * Restoring the same deleted entry twice is impossible: an entry that is in
 * the ledger is never listed (whatever brought it back: this screen, or the
 * undo another screen offers), the restore re-checks the ledger just before it
 * writes, and the database refuses a second row with the same id (23505).
 *
 * Not brought back, and said so on screen: links to a staking deal (deleting
 * the entry deleted them) and scanned receipts (deleting the entry sent them
 * back to Receipts Waiting, which records no link to the entry).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase';
import toast from '../../stores/toastStore';
import { createLedgerEntry } from '../../lib/bankroll/bankrollSelectors';
import { formatCurrencyWithSign, formatCurrency } from '../../lib/bankroll/currencyUtils';
import { entryNetCents } from '../../lib/bankroll/ledgerReport.mjs';
import { foreignEntryNote } from '../../lib/bankroll/entryCurrency.mjs';
import {
  DELETED_PAGE_SIZE,
  changedAtLabel,
  daysLeft,
  deletedSince,
  deletedSummary,
  recentlyDeleted,
  restorableRow,
  restoreFailureText,
  restoreProblem,
} from '../../lib/bankroll/ledgerHistory.mjs';

const ID_BATCH = 100;

/** One page of DELETE rows from the last 30 days, newest first. Throws on a read error. */
export async function fetchDeletedPage(client, userId, from = 0, { now = new Date(), pageSize = DELETED_PAGE_SIZE } = {}) {
  const { data, error } = await client
    .from('bankroll_ledger_changes')
    .select('id, entry_id, user_id, changed_at, op, old_row')
    .eq('user_id', userId)
    .eq('op', 'DELETE')
    .gte('changed_at', deletedSince(now))
    .order('changed_at', { ascending: false })
    .order('id', { ascending: false })
    .range(from, from + pageSize - 1);
  if (error) throw error;
  const rows = Array.isArray(data) ? data : [];
  return { rows, more: rows.length === pageSize };
}

/** Which of these entry ids are in the ledger now. Throws on a read error. */
export async function fetchExistingIds(client, userId, ids) {
  const unique = [...new Set((ids || []).filter(Boolean))];
  const found = new Set();
  for (let i = 0; i < unique.length; i += ID_BATCH) {
    const { data, error } = await client
      .from('bankroll_ledger')
      .select('id')
      .eq('user_id', userId)
      .in('id', unique.slice(i, i + ID_BATCH));
    if (error) throw error;
    for (const row of data || []) found.add(row.id);
  }
  return found;
}

/**
 * Restore one deleted entry. Returns { ok: true, entry } or { ok: false, message }.
 * Never throws for an expected refusal.
 */
export async function restoreDeletedEntry(client, userId, row, create = createLedgerEntry) {
  const exists = await fetchExistingIds(client, userId, [row?.entry_id]);
  const problem = restoreProblem(row, { entryExists: exists.has(row?.entry_id), userId });
  if (problem) return { ok: false, message: problem };
  let insert;
  try {
    insert = restorableRow(row.old_row);
  } catch (error) {
    return { ok: false, message: error.message };
  }
  try {
    const entry = await create(userId, insert);
    return { ok: true, entry };
  } catch (error) {
    return { ok: false, message: restoreFailureText(error), code: error?.code || null };
  }
}

/** Delete Forever: every saved history row of an entry that is not in the ledger. */
export async function deleteEntryHistory(client, userId, entryId) {
  const exists = await fetchExistingIds(client, userId, [entryId]);
  if (exists.has(entryId)) return { ok: false, message: 'This Entry Is Back In Your Ledger, So Its History Is Kept' };
  const { data, error } = await client
    .from('bankroll_ledger_changes')
    .delete()
    .eq('user_id', userId)
    .eq('entry_id', entryId)
    .select('id');
  if (error) throw error;
  if (!data || data.length === 0) return { ok: false, message: 'Already Removed' };
  return { ok: true, removed: data.length };
}

function DeletedRow({ row, displayEUR, busy, onRestore, onForget }) {
  const [confirmForget, setConfirmForget] = useState(false);
  const old = row.old_row || {};
  const { name, detail, day } = deletedSummary(old);
  const cents = entryNetCents(old);
  const isExpense = old.category === 'expense';
  const amount = isExpense ? formatCurrency(Math.abs(Number(old.gross_in) || 0), displayEUR, { cents: 'auto' }) : formatCurrencyWithSign(cents / 100, displayEUR, { cents: 'auto' });
  const foreign = foreignEntryNote(old);
  const left = daysLeft(row.changed_at);
  return (
    <li style={styles.row} data-testid="recently-deleted-row">
      <div style={styles.rowTop}>
        <div style={styles.rowText}>
          <div style={styles.rowTitle}>{name}{detail ? ` - ${detail}` : ''}</div>
          <div style={styles.rowMeta}>{day}</div>
          {foreign && <div style={styles.foreign}>{foreign}</div>}
        </div>
        <div style={{ ...styles.amount, color: isExpense || cents < 0 ? '#f87171' : '#4ade80' }}>{amount}</div>
      </div>
      <div style={styles.rowMeta}>
        Deleted {changedAtLabel(row.changed_at)}. {left > 0 ? `Listed For ${left} More ${left === 1 ? 'Day' : 'Days'}.` : 'Last Day On This List.'}
      </div>
      {!confirmForget ? (
        <div style={styles.actions}>
          <button type="button" disabled={busy} onClick={() => onRestore(row)} style={{ ...styles.restoreBtn, opacity: busy ? 0.6 : 1 }}>
            {busy === 'restore' ? 'Restoring...' : 'Restore'}
          </button>
          <button type="button" disabled={busy} onClick={() => setConfirmForget(true)} style={{ ...styles.forgetBtn, opacity: busy ? 0.6 : 1 }}>
            Delete Forever
          </button>
        </div>
      ) : (
        <div style={styles.confirm} role="group" aria-label="Confirm Delete Forever">
          <span style={styles.confirmText}>Remove This Entry And Its Edit History For Good? It Cannot Be Restored After This.</span>
          <div style={styles.actions}>
            <button type="button" disabled={busy} onClick={() => { setConfirmForget(false); onForget(row); }} style={styles.forgetConfirmBtn}>
              {busy === 'forget' ? 'Removing...' : 'Delete Forever'}
            </button>
            <button type="button" onClick={() => setConfirmForget(false)} style={styles.cancelBtn}>Keep It</button>
          </div>
        </div>
      )}
    </li>
  );
}

export default function RecentlyDeleted({ userId, displayEUR = false, client = supabase }) {
  const [state, setState] = useState({ loading: true, error: null, rows: [], present: new Set(), more: false, nextFrom: 0 });
  const [busy, setBusy] = useState({});
  const generation = useRef(0);

  const load = useCallback(async (from = 0) => {
    if (!userId) { setState({ loading: false, error: null, rows: [], present: new Set(), more: false, nextFrom: 0 }); return; }
    const mine = ++generation.current;
    setState((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const page = await fetchDeletedPage(client, userId, from);
      const present = await fetchExistingIds(client, userId, page.rows.map((r) => r.entry_id));
      if (mine !== generation.current) return;
      setState((prev) => ({
        loading: false,
        error: null,
        rows: from === 0 ? page.rows : [...prev.rows, ...page.rows],
        present: from === 0 ? present : new Set([...prev.present, ...present]),
        more: page.more,
        nextFrom: from + page.rows.length,
      }));
    } catch (error) {
      if (mine === generation.current) setState((prev) => ({ ...prev, loading: false, error: error?.message || String(error) }));
    }
  }, [client, userId]);

  useEffect(() => { void load(0); }, [load]);

  // An entry restored or deleted elsewhere (the undo on the ledger, another
  // tab) changes what belongs here.
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const reload = () => { void load(0); };
    window.addEventListener('bankroll-updated', reload);
    return () => window.removeEventListener('bankroll-updated', reload);
  }, [load]);

  const listed = recentlyDeleted(state.rows, state.present);

  const handleRestore = async (row) => {
    if (busy[row.entry_id]) return;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) { toast.error('You Are Offline. Connect To Restore An Entry.'); return; }
    setBusy((b) => ({ ...b, [row.entry_id]: 'restore' }));
    try {
      const result = await restoreDeletedEntry(client, userId, row);
      if (result.ok) {
        toast.success('Entry Restored');
        setState((prev) => ({ ...prev, present: new Set([...prev.present, row.entry_id]) }));
        // The page reloads the ledger and every total on this event.
        if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('bankroll-updated'));
      } else {
        toast.error(result.message);
        if (result.code === '23505' || /Already Back/.test(result.message)) {
          setState((prev) => ({ ...prev, present: new Set([...prev.present, row.entry_id]) }));
        }
      }
    } catch (error) {
      console.warn('[RecentlyDeleted] Restore failed:', error);
      toast.error('Could Not Restore That Entry. Try Again.');
    } finally {
      setBusy((b) => { const next = { ...b }; delete next[row.entry_id]; return next; });
    }
  };

  const handleForget = async (row) => {
    if (busy[row.entry_id]) return;
    setBusy((b) => ({ ...b, [row.entry_id]: 'forget' }));
    try {
      const result = await deleteEntryHistory(client, userId, row.entry_id);
      if (result.ok || result.message === 'Already Removed') {
        toast.success('Deleted Forever');
        setState((prev) => ({ ...prev, rows: prev.rows.filter((r) => r.entry_id !== row.entry_id) }));
      } else {
        toast.error(result.message);
        void load(0);
      }
    } catch (error) {
      console.warn('[RecentlyDeleted] Delete Forever failed:', error);
      toast.error('Could Not Remove That Entry. Try Again.');
    } finally {
      setBusy((b) => { const next = { ...b }; delete next[row.entry_id]; return next; });
    }
  };

  return (
    <div style={styles.wrap} aria-busy={state.loading && listed.length === 0 ? 'true' : 'false'} data-testid="recently-deleted">
      <p style={styles.intro}>
        Entries You Deleted In The Last 30 Days. Restore Puts One Back Exactly As It Was, With Its Date, Amounts, Notes And Photos, And Your Totals Update.
        A Restored Entry Is Not Linked To A Staking Deal Again, And A Receipt Filed To It Stays In Receipts Waiting: Link Or File Them Again If You Need To.
      </p>
      {state.error && (
        <div role="alert" style={styles.error}>
          Could Not Read Recently Deleted Entries: {state.error}{' '}
          <button type="button" onClick={() => load(0)} style={styles.linkBtn}>Try Again</button>
        </div>
      )}
      {!state.error && state.loading && listed.length === 0 && <p style={styles.muted}>Loading...</p>}
      {!state.error && !state.loading && listed.length === 0 && (
        <p style={styles.empty} data-testid="recently-deleted-empty">No Entries Deleted In The Last 30 Days.</p>
      )}
      {listed.length > 0 && (
        <ul style={styles.list}>
          {listed.map((row) => (
            <DeletedRow
              key={row.entry_id}
              row={row}
              displayEUR={displayEUR}
              busy={busy[row.entry_id] || false}
              onRestore={handleRestore}
              onForget={handleForget}
            />
          ))}
        </ul>
      )}
      {state.more && !state.error && (
        <button type="button" onClick={() => load(state.nextFrom)} disabled={state.loading} style={styles.moreBtn}>
          {state.loading ? 'Loading...' : 'Show More'}
        </button>
      )}
    </div>
  );
}

const styles = {
  wrap: { display: 'flex', flexDirection: 'column', gap: 12 },
  intro: { fontSize: 13, lineHeight: 1.5, color: '#a5b7cc', margin: 0 },
  muted: { fontSize: 14, color: '#94a3b8', margin: 0 },
  empty: { fontSize: 14, color: '#94a3b8', margin: 0, padding: '18px 0', textAlign: 'center' },
  error: { fontSize: 14, color: '#fca5a5' },
  linkBtn: { background: 'none', border: 'none', color: '#94e7ff', textDecoration: 'underline', cursor: 'pointer', padding: 0, fontSize: 14 },
  list: { listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 10 },
  row: {
    border: '1px solid rgba(255, 255, 255, 0.12)', borderRadius: 10, background: 'rgba(0, 0, 0, 0.25)',
    padding: 12, display: 'flex', flexDirection: 'column', gap: 8,
  },
  rowTop: { display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start' },
  rowText: { minWidth: 0, flex: 1 },
  rowTitle: { fontSize: 15, fontWeight: 600, color: '#edf6ff', overflowWrap: 'anywhere' },
  rowMeta: { fontSize: 12, color: '#94a3b8' },
  foreign: { fontSize: 12, color: '#94e7ff', marginTop: 2 },
  amount: { fontSize: 15, fontWeight: 700, whiteSpace: 'nowrap' },
  actions: { display: 'flex', gap: 8, flexWrap: 'wrap' },
  restoreBtn: {
    flex: 1, minHeight: 44, borderRadius: 8, border: '1px solid rgba(148, 231, 255, 0.5)',
    background: 'rgba(55, 127, 194, 0.35)', color: '#edf6ff', fontSize: 14, fontWeight: 600, cursor: 'pointer',
  },
  forgetBtn: {
    flex: 1, minHeight: 44, borderRadius: 8, border: '1px solid rgba(248, 113, 113, 0.45)',
    background: 'transparent', color: '#f87171', fontSize: 14, fontWeight: 600, cursor: 'pointer',
  },
  confirm: { display: 'flex', flexDirection: 'column', gap: 8 },
  confirmText: { fontSize: 13, color: '#fca5a5' },
  forgetConfirmBtn: {
    flex: 1, minHeight: 44, borderRadius: 8, border: 'none', background: '#ef4444', color: '#fff',
    fontSize: 14, fontWeight: 700, cursor: 'pointer',
  },
  cancelBtn: {
    flex: 1, minHeight: 44, borderRadius: 8, border: '1px solid rgba(255, 255, 255, 0.2)',
    background: 'transparent', color: '#edf6ff', fontSize: 14, fontWeight: 600, cursor: 'pointer',
  },
  moreBtn: {
    minHeight: 44, borderRadius: 8, border: '1px solid rgba(255, 255, 255, 0.15)',
    background: 'rgba(255, 255, 255, 0.06)', color: '#edf6ff', fontSize: 14, fontWeight: 600, cursor: 'pointer',
  },
};
