/**
 * STAKING SHARE PANEL
 *
 * "Share With Backer" on a staking deal: creates a read-only link to the
 * deal's statement, shows and copies its URL, and lists the deal's links with
 * their expiry and a Revoke action. Links live in staking_share_links under
 * owner-only RLS; user_id defaults to the signed-in player and expires_at to
 * 30 days out. The backer's page is /staking/statement/<token> (no sign-in),
 * which shows dates, game, result, the two shares and makeup only.
 */

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import toast from '../../stores/toastStore';
import {
  SHARE_LINK_DAYS,
  shareLinkStatus,
  sortShareLinks,
  statementUrl,
} from '../../lib/bankroll/stakingStatement.mjs';

const LINK_COLUMNS = 'token, arrangement_id, created_at, expires_at, revoked_at';

export async function fetchShareLinks(client, userId, arrangementId) {
  const { data, error } = await client
    .from('staking_share_links')
    .select(LINK_COLUMNS)
    .eq('user_id', userId)
    .eq('arrangement_id', arrangementId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

export async function createShareLink(client, arrangementId) {
  const { data, error } = await client
    .from('staking_share_links')
    .insert({ arrangement_id: arrangementId })
    .select(LINK_COLUMNS)
    .maybeSingle();
  if (error) throw error;
  if (!data || !data.token) throw new Error('The Link Was Not Created');
  return data;
}

export async function revokeShareLink(client, userId, token, now = new Date()) {
  const { data, error } = await client
    .from('staking_share_links')
    .update({ revoked_at: now.toISOString() })
    .eq('user_id', userId)
    .eq('token', token)
    .is('revoked_at', null)
    .select(LINK_COLUMNS);
  if (error) throw error;
  if (!data || data.length === 0) throw new Error('That Link Was Already Revoked');
  return data[0];
}

const dayText = (iso) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

async function copyText(text) {
  if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
    await navigator.clipboard.writeText(text);
    return true;
  }
  return false;
}

export default function StakingSharePanel({ userId, arrangement, sessionCount = 0, client = supabase }) {
  const arrangementId = arrangement?.id;
  const [state, setState] = useState({ loading: true, error: null, links: [] });
  const [creating, setCreating] = useState(false);
  const [revoking, setRevoking] = useState(null);
  const [fresh, setFresh] = useState(null);

  const load = useCallback(async () => {
    if (!userId || !arrangementId) return;
    setState((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const links = await fetchShareLinks(client, userId, arrangementId);
      setState({ loading: false, error: null, links });
    } catch (error) {
      setState((prev) => ({ ...prev, loading: false, error: error?.message || String(error) }));
    }
  }, [client, userId, arrangementId]);

  useEffect(() => { void load(); }, [load]);

  const copy = async (url) => {
    try {
      if (await copyText(url)) toast.success('Link Copied');
      else toast.info('Select The Link Above To Copy It');
    } catch {
      toast.info('Select The Link Above To Copy It');
    }
  };

  const handleCreate = async () => {
    if (creating || !arrangementId) return;
    setCreating(true);
    try {
      const link = await createShareLink(client, arrangementId);
      setFresh(link.token);
      setState((prev) => ({ ...prev, links: [link, ...prev.links] }));
      await copy(statementUrl(link.token));
    } catch (error) {
      console.warn('[StakingSharePanel] Create failed:', error);
      toast.error('Could Not Create A Link. Try Again.');
    } finally {
      setCreating(false);
    }
  };

  const handleRevoke = async (token) => {
    if (revoking) return;
    setRevoking(token);
    try {
      const updated = await revokeShareLink(client, userId, token);
      setState((prev) => ({ ...prev, links: prev.links.map((l) => (l.token === token ? updated : l)) }));
      if (fresh === token) setFresh(null);
      toast.success('Link Revoked');
    } catch (error) {
      console.warn('[StakingSharePanel] Revoke failed:', error);
      toast.error(error?.message === 'That Link Was Already Revoked' ? error.message : 'Could Not Revoke That Link. Try Again.');
      void load();
    } finally {
      setRevoking(null);
    }
  };

  const links = sortShareLinks(state.links);
  const freshUrl = fresh ? statementUrl(fresh) : null;

  return (
    <section style={styles.wrap} aria-label="Share With Backer" data-testid="staking-share-panel">
      <h4 style={styles.title}>Share With Backer</h4>
      <p style={styles.hint}>
        A Read-Only Link To The Statement Of This Deal: Session Dates, Game, Result, Each Share And Makeup, In US Dollars.
        No Sign-In Is Needed, So Send It Only To Your Backer. It Expires In {SHARE_LINK_DAYS} Days, And You Can Revoke It At Any Time.
      </p>
      {sessionCount === 0 && (
        <p style={styles.warn}>This Deal Has No Linked Sessions Yet, So The Link Will Show Nothing Until You Link One.</p>
      )}
      <button type="button" onClick={handleCreate} disabled={creating} style={{ ...styles.createBtn, opacity: creating ? 0.6 : 1 }}>
        {creating ? 'Creating Link...' : 'Share With Backer'}
      </button>

      {freshUrl && (
        <div style={styles.fresh}>
          <label htmlFor="staking-share-url" style={styles.label}>New Link</label>
          <input id="staking-share-url" readOnly value={freshUrl} onFocus={(e) => e.target.select()} style={styles.url} />
          <button type="button" onClick={() => copy(freshUrl)} style={styles.copyBtn}>Copy Link</button>
        </div>
      )}

      {state.error && (
        <p role="alert" style={styles.error}>
          Could Not Read The Links For This Deal: {state.error}{' '}
          <button type="button" onClick={load} style={styles.linkBtn}>Try Again</button>
        </p>
      )}
      {!state.error && links.length > 0 && (
        <ul style={styles.list}>
          {links.map((link) => {
            const status = shareLinkStatus(link);
            const url = statementUrl(link.token);
            return (
              <li key={link.token} style={styles.item} data-testid="staking-share-link">
                <div style={styles.itemText}>
                  <div style={styles.itemTitle}>
                    Link Made {dayText(link.created_at)}
                    <span style={{ ...styles.badge, ...(status === 'active' ? styles.badgeActive : styles.badgeOff) }}>
                      {status === 'active' ? 'Active' : status === 'expired' ? 'Expired' : 'Revoked'}
                    </span>
                  </div>
                  <div style={styles.itemMeta}>
                    {status === 'revoked' ? `Revoked ${dayText(link.revoked_at)}` : status === 'expired' ? `Expired ${dayText(link.expires_at)}` : `Expires ${dayText(link.expires_at)}`}
                    {' - Ends '}{link.token.slice(-6)}
                  </div>
                </div>
                {status === 'active' && (
                  <div style={styles.itemActions}>
                    <button type="button" onClick={() => copy(url)} style={styles.smallBtn}>Copy</button>
                    <button type="button" onClick={() => handleRevoke(link.token)} disabled={revoking === link.token} style={styles.revokeBtn}>
                      {revoking === link.token ? 'Revoking...' : 'Revoke'}
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

const styles = {
  wrap: {
    marginTop: 14, padding: 12, borderRadius: 10, border: '1px solid rgba(255, 255, 255, 0.12)',
    background: 'rgba(0, 0, 0, 0.2)', display: 'flex', flexDirection: 'column', gap: 10,
  },
  title: { margin: 0, fontSize: 15, fontWeight: 700, color: '#edf6ff' },
  hint: { margin: 0, fontSize: 12, lineHeight: 1.5, color: '#a5b7cc' },
  warn: { margin: 0, fontSize: 12, color: '#fcd34d' },
  createBtn: {
    minHeight: 44, borderRadius: 8, border: '1px solid rgba(148, 231, 255, 0.5)',
    background: 'rgba(55, 127, 194, 0.35)', color: '#edf6ff', fontSize: 14, fontWeight: 600, cursor: 'pointer',
  },
  fresh: { display: 'flex', flexDirection: 'column', gap: 6 },
  label: { fontSize: 12, color: '#94a3b8' },
  url: {
    width: '100%', boxSizing: 'border-box', minHeight: 44, padding: '10px 12px', borderRadius: 8,
    border: '1px solid rgba(255, 255, 255, 0.2)', background: 'rgba(0, 0, 0, 0.35)', color: '#edf6ff', fontSize: 13,
  },
  copyBtn: {
    minHeight: 44, borderRadius: 8, border: '1px solid rgba(255, 255, 255, 0.2)', background: 'rgba(255, 255, 255, 0.08)',
    color: '#edf6ff', fontSize: 14, fontWeight: 600, cursor: 'pointer',
  },
  error: { margin: 0, fontSize: 13, color: '#fca5a5' },
  linkBtn: { background: 'none', border: 'none', color: '#94e7ff', textDecoration: 'underline', cursor: 'pointer', padding: 0, fontSize: 13 },
  list: { listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 },
  item: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap',
    borderTop: '1px solid rgba(255, 255, 255, 0.08)', paddingTop: 8,
  },
  itemText: { minWidth: 0, flex: '1 1 160px' },
  itemTitle: { fontSize: 13, fontWeight: 600, color: '#edf6ff', display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' },
  itemMeta: { fontSize: 12, color: '#94a3b8' },
  badge: { fontSize: 12, fontWeight: 700, borderRadius: 999, padding: '2px 8px' },
  badgeActive: { background: 'rgba(74, 222, 128, 0.15)', color: '#4ade80' },
  badgeOff: { background: 'rgba(148, 163, 184, 0.15)', color: '#94a3b8' },
  itemActions: { display: 'flex', gap: 6 },
  smallBtn: {
    minHeight: 44, minWidth: 64, borderRadius: 8, border: '1px solid rgba(255, 255, 255, 0.2)',
    background: 'transparent', color: '#edf6ff', fontSize: 13, fontWeight: 600, cursor: 'pointer',
  },
  revokeBtn: {
    minHeight: 44, minWidth: 72, borderRadius: 8, border: '1px solid rgba(248, 113, 113, 0.45)',
    background: 'transparent', color: '#f87171', fontSize: 13, fontWeight: 600, cursor: 'pointer',
  },
};
