/**
 * LEDGER ENTRY HISTORY
 *
 * The "History" disclosure on an entry's edit view: every change to this one
 * entry, newest first, field by field (old -> new) and when. Rows come from
 * bankroll_ledger_changes, written only by the ledger's own UPDATE/DELETE
 * trigger, and are read for this entry_id alone, a page at a time.
 *
 * Amounts stored in US dollars follow Display EUR; amounts the player typed in
 * another currency are shown in that currency. Formatting and diffing live in
 * src/lib/bankroll/ledgerHistory.mjs.
 */

import { useCallback, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { HISTORY_PAGE_SIZE, historyItems } from '../../lib/bankroll/ledgerHistory.mjs';

const HISTORY_COLUMNS = 'id, entry_id, changed_at, op, old_row, new_row';

/** One page of an entry's history, newest first. Throws on a read error. */
export async function fetchEntryHistoryPage(client, userId, entryId, from = 0, pageSize = HISTORY_PAGE_SIZE) {
  const { data, error } = await client
    .from('bankroll_ledger_changes')
    .select(HISTORY_COLUMNS)
    .eq('user_id', userId)
    .eq('entry_id', entryId)
    .order('changed_at', { ascending: false })
    .order('id', { ascending: false })
    .range(from, from + pageSize - 1);
  if (error) throw error;
  const rows = Array.isArray(data) ? data : [];
  return { rows, more: rows.length === pageSize };
}

export function HistoryList({ items }) {
  return (
    <ol style={styles.list} data-testid="entry-history-list">
      {items.map((item) => (
        <li key={item.id} style={styles.item}>
          <div style={styles.when}>{item.op === 'DELETE' ? 'Deleted, Then Restored' : 'Edited'} <span style={styles.whenTime}>{item.when}</span></div>
          {item.changes.length > 0 && (
            <dl style={styles.changes}>
              {item.changes.map((c) => (
                <div key={c.field} style={styles.change}>
                  <dt style={styles.field}>{c.label}</dt>
                  <dd style={styles.values}>
                    <span style={styles.before}>{c.before}</span>
                    <span aria-hidden="true" style={styles.arrow}>{' -> '}</span>
                    <span style={styles.visuallyHidden}>changed to</span>
                    <span style={styles.after}>{c.after}</span>
                  </dd>
                </div>
              ))}
            </dl>
          )}
        </li>
      ))}
    </ol>
  );
}

export default function LedgerEntryHistory({ userId, entryId, displayEUR = false, client = supabase }) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState({ loaded: false, loading: false, error: null, rows: [], more: false });

  const load = useCallback(async (from) => {
    if (!userId || !entryId) return;
    setState((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const page = await fetchEntryHistoryPage(client, userId, entryId, from);
      setState((prev) => ({
        loaded: true, loading: false, error: null,
        rows: from === 0 ? page.rows : [...prev.rows, ...page.rows],
        more: page.more,
      }));
    } catch (error) {
      setState((prev) => ({ ...prev, loading: false, error: error?.message || String(error) }));
    }
  }, [client, userId, entryId]);

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next && !state.loaded && !state.loading) void load(0);
  };

  const items = historyItems(state.rows, { displayEUR });

  return (
    <section style={styles.wrap} data-testid="entry-history">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open ? 'true' : 'false'}
        style={styles.toggle}
      >
        <span>History</span>
        <span aria-hidden="true" style={styles.chevron}>{open ? '−' : '+'}</span>
      </button>
      {open && (
        <div style={styles.body}>
          {state.error && (
            <p role="alert" style={styles.error}>
              Could Not Read This Entry&apos;s History: {state.error}{' '}
              <button type="button" onClick={() => load(0)} style={styles.linkBtn}>Try Again</button>
            </p>
          )}
          {!state.error && state.loading && items.length === 0 && <p style={styles.muted}>Loading History...</p>}
          {!state.error && state.loaded && items.length === 0 && (
            <p style={styles.muted}>No Changes Yet. Every Edit From Now On Is Listed Here.</p>
          )}
          {items.length > 0 && <HistoryList items={items} />}
          {state.more && !state.error && (
            <button type="button" onClick={() => load(state.rows.length)} disabled={state.loading} style={styles.moreBtn}>
              {state.loading ? 'Loading...' : 'Show Older Changes'}
            </button>
          )}
        </div>
      )}
    </section>
  );
}

const styles = {
  wrap: {
    border: '1px solid rgba(255, 255, 255, 0.12)',
    borderRadius: 10,
    background: 'rgba(0, 0, 0, 0.2)',
    overflow: 'hidden',
  },
  toggle: {
    width: '100%',
    minHeight: 44,
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '10px 14px',
    background: 'transparent',
    border: 'none',
    color: '#edf6ff',
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
    touchAction: 'manipulation',
  },
  visuallyHidden: { position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap' },
  chevron: { fontSize: 18, color: '#94a3b8' },
  body: { padding: '0 14px 12px' },
  list: { listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 10 },
  item: { borderTop: '1px solid rgba(255, 255, 255, 0.08)', paddingTop: 10 },
  when: { fontSize: 13, fontWeight: 600, color: '#edf6ff', marginBottom: 6 },
  whenTime: { fontWeight: 400, color: '#94a3b8', marginLeft: 6 },
  changes: { margin: 0, display: 'flex', flexDirection: 'column', gap: 4 },
  change: { display: 'grid', gridTemplateColumns: 'minmax(90px, 35%) 1fr', gap: 8, fontSize: 13 },
  field: { color: '#94a3b8', margin: 0 },
  values: { margin: 0, color: '#edf6ff', overflowWrap: 'anywhere', minWidth: 0 },
  before: { color: '#a5b7cc', textDecoration: 'line-through', textDecorationColor: 'rgba(165,183,204,0.5)' },
  arrow: { color: '#64748b' },
  after: { color: '#edf6ff', fontWeight: 600 },
  muted: { fontSize: 13, color: '#94a3b8', margin: '4px 0 0' },
  error: { fontSize: 13, color: '#fca5a5', margin: '4px 0 0' },
  linkBtn: { background: 'none', border: 'none', color: '#94e7ff', textDecoration: 'underline', cursor: 'pointer', padding: 0, fontSize: 13 },
  moreBtn: {
    marginTop: 10, width: '100%', minHeight: 44, borderRadius: 8,
    border: '1px solid rgba(255, 255, 255, 0.15)', background: 'rgba(255, 255, 255, 0.06)',
    color: '#edf6ff', fontSize: 13, fontWeight: 600, cursor: 'pointer',
  },
};
