import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { authedFetch, getAccessToken } from '../../lib/authUtils';
import { mergeNotices, pendingPins, compareNotices } from '../../lib/clubNoticeBoard.mjs';

// Keyed by authenticated actor + club at the caller. No state crosses identities.
export default function NoticeBoard({ club, userId, theme: C, onBack }) {
    const [rows, setRows] = useState([]);
    const [pins, setPins] = useState([]);
    const [canManage, setCanManage] = useState(false);
    const [loading, setLoading] = useState(true);
    const [olderLoading, setOlderLoading] = useState(false);
    const [error, setError] = useState('');
    const [live, setLive] = useState(false);
    const [hasMore, setHasMore] = useState(false);
    const [draft, setDraft] = useState('');
    const [kind, setKind] = useState('notice');
    const [editing, setEditing] = useState(null);
    const [busy, setBusy] = useState(false);
    const [newItems, setNewItems] = useState(false);
    const scroller = useRef(null);
    const state = useRef({ rows: [], pinRows: [], cursor: null, alive: true, loading: false, events: [], generation: 0, epoch: 0 });
    const anchor = useRef(null);
    const createIntent = useRef(null);
    const button = { border: `1px solid ${C.border}`, borderRadius: 8, background: C.bg, color: C.text, padding: '8px 12px', cursor: 'pointer', font: 'inherit', fontSize: 12 };

    function captureAnchor(bottom = false) {
        const box = scroller.current;
        if (!box) return;
        if (bottom) { anchor.current = { bottom: true }; return; }
        const top = box.getBoundingClientRect().top;
        const item = [...box.querySelectorAll('[data-notice-id]')].find(node => node.getBoundingClientRect().bottom > top);
        anchor.current = item ? { id: item.dataset.noticeId, top: item.getBoundingClientRect().top } : null;
    }
    useLayoutEffect(() => {
        const box = scroller.current;
        const saved = anchor.current;
        if (!box || !saved) return;
        if (saved.bottom) box.scrollTop = box.scrollHeight;
        else {
            const item = box.querySelector(`[data-notice-id="${saved.id}"]`);
            if (item) box.scrollTop += item.getBoundingClientRect().top - saved.top;
        }
        anchor.current = null;
    }, [rows, pins, loading]);

    async function request(method, payload = {}) {
        const epoch = state.current.epoch;
        const token = getAccessToken();
        const response = await authedFetch('/api/messenger/notice-board', { method,
            headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
            body: JSON.stringify({ clubId: club.id, payload }) });
        const result = await response.json();
        if (!state.current.alive || state.current.epoch !== epoch) return null;
        if (response.status === 401 || response.status === 403) {
            state.current.denied = true; state.current.events = []; state.current.pinRows = [];
            state.current.rows = []; setRows([]); setPins([]); setCanManage(false);
        }
        if (!response.ok || !result.success) throw new Error(result.error || 'Notice Board Unavailable');
        if (method === 'POST') state.current.denied = false;
        return result;
    }
    function accept(entries) {
        const box = scroller.current;
        const bottom = !box || box.scrollHeight - box.scrollTop - box.clientHeight < 80;
        captureAnchor(bottom);
        const oldest = state.current.rows.find(row => !row.is_deleted);
        const updates = entries.filter(row => state.current.rows.some(old => old.id === row.id) || !oldest || compareNotices(row, oldest) >= 0);
        state.current.rows = mergeNotices(state.current.rows, updates);
        setRows(state.current.rows);
        state.current.pinRows = mergeNotices(state.current.pinRows, entries);
        setPins(pendingPins(state.current.pinRows));
        if (!bottom && entries.some(row => !row.is_deleted && !state.current.rows.some(old => old.id === row.id && old.version > row.version))) setNewItems(true);
    }
    async function hydrate() {
        const s = state.current;
        if (s.loading) return;
        s.loading = true;
        s.events = [];
        const generation = ++s.generation;
        const oldest = s.rows.find(row => !row.is_deleted);
        try {
            let page = await request('POST');
            if (!page || !s.alive || generation !== s.generation) return;
            let all = page.entries;
            let cursor = page.cursor;
            let more = page.hasMore;
            // Reconnect re-reads the whole displayed interval, so missed edits,
            // deletes and new messages cannot leave holes in a scrolled feed.
            while (oldest && more && all[0] && compareNotices(all[0], oldest) > 0) {
                const next = await request('POST', cursor);
                if (!next || !s.alive || generation !== s.generation) return;
                all = mergeNotices(next.entries, all); cursor = next.cursor; more = next.hasMore;
            }
            captureAnchor(!oldest);
            s.rows = mergeNotices(all, s.events);
            s.cursor = cursor;
            s.pinRows = mergeNotices(page.pinned, s.events);
            setRows(s.rows); setPins(pendingPins(s.pinRows));
            setCanManage(page.canManage); setHasMore(more); setError('');
        } catch (failure) { if (s.alive) setError(failure.message); }
        finally { if (s.alive && generation === s.generation) { s.loading = false; setLoading(false); if (s.refreshAfterLoad) { s.refreshAfterLoad = false; void hydrate(); } } }
    }
    useEffect(() => {
        const s = state.current; s.alive = true; s.loading = false; s.epoch++;
        const channel = supabase.channel(`club-notice-board:${club.id}:${userId}`)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'club_notice_board', filter: `club_id=eq.${club.id}` }, event => {
                const row = event.new;
                if (!s.alive || s.denied || row?.club_id !== club.id) return;
                if (s.loading) s.events.push(row); else accept([row]);
            }).subscribe(status => {
                if (!s.alive) return;
                setLive(status === 'SUBSCRIBED');
                if (status === 'SUBSCRIBED') {
                    if (s.loading) s.refreshAfterLoad = true; else void hydrate();
                }
            });
        // Initial read does not depend on a working socket. A subscribed event
        // refreshes after connection to close the read/subscription race.
        void hydrate();
        const refresh = () => { if (document.visibilityState === 'visible') void hydrate(); };
        window.addEventListener('online', refresh);
        window.addEventListener('focus', refresh);
        document.addEventListener('visibilitychange', refresh);
        return () => {
            s.alive = false; s.generation++; s.epoch++;
            window.removeEventListener('online', refresh); window.removeEventListener('focus', refresh);
            document.removeEventListener('visibilitychange', refresh); void supabase.removeChannel(channel);
        };
    }, [club.id, userId]);

    async function older() {
        const s = state.current;
        if (!hasMore || s.loading || olderLoading || !s.cursor) return;
        s.loading = true; s.events = []; setOlderLoading(true);
        try {
            const page = await request('POST', s.cursor);
            if (!page || !s.alive) return;
            captureAnchor();
            s.rows = mergeNotices(mergeNotices(s.rows, page.entries), s.events);
            s.cursor = page.cursor;
            s.pinRows = mergeNotices(page.pinned, s.events);
            setRows(s.rows); setPins(pendingPins(s.pinRows));
            setCanManage(page.canManage); setHasMore(page.hasMore); setError('');
        } catch (failure) { if (s.alive) setError(failure.message); }
        finally { if (s.alive) { s.loading = false; setOlderLoading(false); if (s.refreshAfterLoad) { s.refreshAfterLoad = false; void hydrate(); } } }
    }
    useEffect(() => {
        if (!editing) return;
        const entry = [...state.current.rows, ...state.current.pinRows].find(row => row.id === editing.id && row.is_deleted);
        if (!entry) return;
        setEditing(null); setDraft('');
        setError('This Notice Was Removed. Your Edit Was Not Saved.');
    }, [rows, pins, editing]);

    async function mutate(method, payload) {
        if (busy) return false;
        setBusy(true); setError('');
        try {
            const result = await request(method, payload);
            if (!result) return false;
            accept([result.entry]); return true;
        } catch (failure) { if (state.current.alive) setError(failure.message); return false; }
        finally { if (state.current.alive) setBusy(false); }
    }
    async function submit(event) {
        event.preventDefault();
        const content = draft.trim();
        if (!content) return;
        if (editing) {
            if (await mutate('PATCH', { id: editing.id, version: editing.version, content })) { setEditing(null); setDraft(''); }
        } else {
            // Reuse the same creation identity after an uncertain network result.
            if (!createIntent.current || createIntent.current.content !== content || createIntent.current.status !== kind) {
                createIntent.current = { id: crypto.randomUUID(), content, status: kind, is_pinned: kind === 'pending_payout' };
            }
            if (await mutate('PUT', createIntent.current)) { createIntent.current = null; setDraft(''); }
        }
    }
    const card = (row, pinned = false) => <article key={row.id} data-notice-id={pinned ? undefined : row.id}
        style={{ padding: 12, marginBottom: 8, border: `1px solid ${pinned ? C.blue : C.border}`, borderRadius: 10, background: C.bg }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, color: C.textSec, fontSize: 11 }}>
            <strong style={{ color: row.status === 'pending_payout' ? C.blue : C.text }}>{row.status === 'pending_payout' ? 'Pending Payout' : row.status === 'paid' ? 'Marked Paid' : 'Club Notice'}</strong>
            <time dateTime={row.created_at}>{new Date(row.created_at).toLocaleString()}</time>
        </div>
        <p style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', lineHeight: 1.5, fontSize: 14, margin: '8px 0' }}>{row.content}</p>
        {canManage && <div aria-label="Notice Actions" style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            <button type="button" disabled={busy} style={button} onClick={() => { setEditing(row); setDraft(row.content); }}>Edit</button>
            {row.status === 'pending_payout' && <>
                <button type="button" disabled={busy} style={button} onClick={() => void mutate('PATCH', { id: row.id, version: row.version, is_pinned: !row.is_pinned })}>{row.is_pinned ? 'Unpin' : 'Pin'}</button>
                <button type="button" disabled={busy} style={button} onClick={() => { if (window.confirm('Confirm This Payout Has Already Been Paid? This Updates The Board Record Only.')) void mutate('PATCH', { id: row.id, version: row.version, status: 'paid' }); }}>Mark As Paid</button>
            </>}
            {row.status === 'paid' && <button type="button" disabled={busy} style={button} onClick={() => { if (window.confirm('Reopen This Payout Request? This Updates The Board Record Only.')) void mutate('PATCH', { id: row.id, version: row.version, status: 'pending_payout', is_pinned: true }); }}>Reopen Payout</button>}
            <button type="button" disabled={busy} style={button} onClick={() => { if (window.confirm('Remove This Notice From The Board?')) void mutate('DELETE', { id: row.id, version: row.version }); }}>Delete</button>
        </div>}
    </article>;
    return <section aria-label="Club Notice Board" style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, color: C.text }}>
        <header style={{ padding: '12px 16px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', gap: 10 }}>
            <button type="button" style={button} onClick={onBack} aria-label="Back To Club Inbox">Back</button>
            <div style={{ minWidth: 0 }}><h2 style={{ fontSize: 17, margin: 0 }}>Notice Board</h2><div style={{ color: C.textSec, fontSize: 12 }}>{club.name}</div></div>
            <span role="status" style={{ marginLeft: 'auto', color: C.textSec, fontSize: 11 }}>{live ? 'Live' : 'Connecting'}</span>
        </header>
        <section aria-label="Recent Payout Requests" style={{ flexShrink: 0, maxHeight: '30%', overflowY: 'auto', padding: '10px 16px', borderBottom: `2px solid ${C.border}`, background: C.bg }}>
            <h3 style={{ fontSize: 13, margin: '0 0 8px', color: C.blue }}>Recent Payout Requests {pins.length > 0 ? `(${pins.length})` : ''}</h3>
            {pins.length ? pins.map(row => card(row, true)) : <p style={{ fontSize: 12, color: C.textSec, margin: 0 }}>{loading ? 'Loading Requests...' : 'No Pinned Pending Requests'}</p>}
        </section>
        {error && <div role="alert" style={{ padding: '8px 16px', fontSize: 12 }}>{error} <button type="button" style={button} disabled={loading || olderLoading} onClick={() => void hydrate()}>Refresh Board</button></div>}
        <div ref={scroller} tabIndex={0} aria-label="Notice History" style={{ flex: 1, minHeight: 0, overflowY: 'auto', overflowAnchor: 'none', padding: '12px 16px' }}
            onScroll={() => { if (scroller.current?.scrollTop <= 50 && !error) void older(); }}>
            {hasMore && <button type="button" style={{ ...button, width: '100%', marginBottom: 10 }} disabled={olderLoading} onClick={() => void older()}>{olderLoading ? 'Loading Earlier Notices...' : 'Load Earlier Notices'}</button>}
            {loading ? <p role="status">Loading Notice Board...</p> : !rows.some(row => !row.is_deleted) && <p style={{ color: C.textSec, textAlign: 'center', padding: 24 }}>No Notices Yet</p>}
            {rows.filter(row => !row.is_deleted).map(row => card(row))}
        </div>
        {newItems && <button type="button" style={button} onClick={() => { scroller.current.scrollTop = scroller.current.scrollHeight; setNewItems(false); }}>Latest Notices</button>}
        {canManage && <form onSubmit={submit} style={{ padding: '10px 16px', borderTop: `1px solid ${C.border}` }}>
            {editing ? <div style={{ fontSize: 12, marginBottom: 6 }}>Editing Notice <button type="button" style={button} onClick={() => { setEditing(null); setDraft(''); }}>Cancel Edit</button></div>
                : <select aria-label="Notice Type" value={kind} disabled={busy} onChange={e => setKind(e.target.value)} style={{ ...button, marginBottom: 8 }}><option value="notice">Club Notice</option><option value="pending_payout">Payout Request</option></select>}
            <div style={{ display: 'flex', gap: 8 }}><textarea aria-label="Notice Text" placeholder="Write A Club Notice..." value={draft} onChange={e => setDraft(e.target.value)} maxLength={4000} disabled={busy} rows={2} style={{ ...button, flex: 1, minWidth: 0, resize: 'vertical', maxHeight: 120, textAlign: 'left' }} />
                <button type="submit" disabled={busy || !draft.trim()} style={{ ...button, background: C.blue, color: '#fff' }}>{busy ? 'Saving...' : editing ? 'Save' : 'Post'}</button></div>
        </form>}
    </section>;
}
