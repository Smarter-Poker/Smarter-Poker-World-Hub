import React, { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { authedFetch, getAccessToken } from '../../lib/authUtils';
import CashoutRequestActions from './CashoutRequestActions';
import {
    mergeNotices,
    pendingPins,
    compareNotices,
    ROLE_META,
    formatRoleLabel,
    normalizeRoleCounts,
    formatMemberSummary,
} from '../../lib/clubNoticeBoard.mjs';

function dayKey(iso) {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatDayLabel(iso) {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    const now = new Date();
    const today = dayKey(now.toISOString());
    const yesterday = dayKey(new Date(now.getTime() - 86400000).toISOString());
    const key = dayKey(iso);
    if (key === today) return 'Today';
    if (key === yesterday) return 'Yesterday';
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatShortTime(iso) {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

function initialsOf(name) {
    const clean = String(name || 'Club').trim();
    if (!clean) return 'C';
    const parts = clean.split(/\s+/).filter(Boolean);
    return parts.length >= 2 ? (parts[0][0] + parts[1][0]).toUpperCase() : clean.slice(0, 2).toUpperCase();
}

function formatChipsSimple(amount) {
    const n = Number(amount);
    return Number.isFinite(n) ? n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : String(amount || '0.00');
}

// Keyed by authenticated actor + club at the caller. No state crosses identities.
export default function NoticeBoard({ club, userId, theme: C, onBack }) {
    const [rows, setRows] = useState([]);
    const [pins, setPins] = useState([]);
    const [canManage, setCanManage] = useState(false);
    const [viewerRole, setViewerRole] = useState(null);
    const [members, setMembers] = useState([]);
    const [memberCount, setMemberCount] = useState(0);
    const [roleCounts, setRoleCounts] = useState(() => normalizeRoleCounts(null, 0));
    const [overduePayouts, setOverduePayouts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [olderLoading, setOlderLoading] = useState(false);
    const [error, setError] = useState('');
    const [live, setLive] = useState(false);
    const [hasMore, setHasMore] = useState(false);
    const [draft, setDraft] = useState('');
    const [kind, setKind] = useState('notice');
    const [pinOnPost, setPinOnPost] = useState(false);
    const [editing, setEditing] = useState(null);
    const [busy, setBusy] = useState(false);
    const [newItems, setNewItems] = useState(false);
    const [noteTarget, setNoteTarget] = useState(null);
    const [noteDraft, setNoteDraft] = useState('');
    const [activePinIndex, setActivePinIndex] = useState(0);
    const [pinsExpanded, setPinsExpanded] = useState(false);
    const [overdueExpanded, setOverdueExpanded] = useState(false);
    const [highlightedId, setHighlightedId] = useState(null);
    const [searchOpen, setSearchOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [filterKind, setFilterKind] = useState('all');
    const [rosterOpen, setRosterOpen] = useState(false);
    const [rosterSearch, setRosterSearch] = useState('');
    const [rosterRoleFilter, setRosterRoleFilter] = useState('all');

    const rosterTitleId = useId();
    const rosterDialogRef = useRef(null);
    const noteIntent = useRef(null);
    const scroller = useRef(null);
    const state = useRef({ rows: [], pinRows: [], members: [], cursor: null, alive: true, loading: false, events: [], generation: 0, epoch: 0 });
    const anchor = useRef(null);
    const createIntent = useRef(null);
    const highlightTimer = useRef(null);

    const surfaceBg = C.card || C.bg || '#18191b';
    const subtleBg = 'rgba(255, 255, 255, 0.04)';
    const accentBlue = C.blue || '#0084ff';
    const button = {
        border: `1px solid ${C.border}`,
        borderRadius: 8,
        background: C.bg,
        color: C.text,
        padding: '6px 10px',
        cursor: 'pointer',
        fontFamily: 'inherit',
        fontSize: 12,
        fontWeight: 500,
    };

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

    // Native <dialog> modal lifecycle + Safari closedby fallback.
    useEffect(() => {
        const dialog = rosterDialogRef.current;
        if (!dialog) return;
        if (rosterOpen) {
            if (typeof dialog.showModal === 'function' && !dialog.open) {
                try { dialog.showModal(); } catch { /* noop in non-DOM test renderers */ }
            }
        } else if (typeof dialog.close === 'function' && dialog.open) {
            try { dialog.close(); } catch { /* noop */ }
        }
    }, [rosterOpen]);

    useEffect(() => {
        const dialog = rosterDialogRef.current;
        if (!dialog || typeof dialog.addEventListener !== 'function') return;
        const onClose = () => {
            if (typeof dialog.returnValue === 'string') dialog.returnValue = '';
            setRosterOpen(false);
        };
        dialog.addEventListener('close', onClose);
        let cleanupOutside = null;
        if (typeof HTMLDialogElement !== 'undefined' && !('closedBy' in HTMLDialogElement.prototype)) {
            const outside = (e) => {
                const r = dialog.getBoundingClientRect();
                return e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
            };
            let pressedOutside = false;
            const onDown = (e) => { pressedOutside = outside(e); };
            const onUp = (e) => { if (pressedOutside && outside(e) && dialog.open) dialog.close(); };
            dialog.addEventListener('pointerdown', onDown);
            dialog.addEventListener('pointerup', onUp);
            cleanupOutside = () => {
                dialog.removeEventListener('pointerdown', onDown);
                dialog.removeEventListener('pointerup', onUp);
            };
        }
        return () => {
            dialog.removeEventListener('close', onClose);
            cleanupOutside?.();
        };
    }, []);

    function clearAccess() {
        const s = state.current;
        s.denied = true; s.epoch++; s.generation++; s.loading = false; s.refreshAfterLoad = false;
        s.events = []; s.rows = []; s.pinRows = []; s.members = []; s.cursor = null;
        setRows([]); setPins([]); setCanManage(false); setViewerRole(null);
        setMembers([]); setMemberCount(0); setRoleCounts(normalizeRoleCounts(null, 0));
        setOverduePayouts([]); setHasMore(false); setNewItems(false);
        setEditing(null); setDraft(''); setNoteTarget(null); setNoteDraft('');
        setRosterOpen(false); setPinsExpanded(false); setOverdueExpanded(false);
        setLoading(false); setOlderLoading(false); setLive(false);
        createIntent.current = null; noteIntent.current = null;
    }

    async function request(method, payload = {}, action) {
        const epoch = state.current.epoch;
        const token = getAccessToken();
        const response = await authedFetch('/api/messenger/notice-board', {
            method,
            headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
            body: JSON.stringify({ clubId: club.id, payload, ...(action ? { action } : {}) }),
        });
        const result = await response.json();
        if (!state.current.alive || state.current.epoch !== epoch) return null;
        if (response.status === 401 || response.status === 403) {
            clearAccess();
        }
        if (!response.ok || !result.success) throw Object.assign(new Error(result.error || 'Notice Board Unavailable'), { status: response.status });
        if (method === 'POST') state.current.denied = false;
        return result;
    }

    function enrichWithRoster(entries) {
        const byId = new Map((state.current.members || []).map(m => [m.user_id, m]));
        return entries.map(row => {
            if (!row || !row.author_id || (row.author_name && row.author_role)) return row;
            const staff = byId.get(row.author_id);
            if (!staff) return row;
            return {
                ...row,
                author_name: row.author_name ?? staff.display_name ?? staff.username,
                author_avatar: row.author_avatar ?? staff.avatar_url,
                author_role: row.author_role ?? staff.role,
            };
        });
    }

    function accept(entries) {
        const enriched = enrichWithRoster(entries);
        const box = scroller.current;
        const bottom = !box || box.scrollHeight - box.scrollTop - box.clientHeight < 80;
        captureAnchor(bottom);
        const oldest = state.current.rows.find(row => !row.is_deleted);
        const updates = enriched.filter(row => state.current.rows.some(old => old.id === row.id) || !oldest || compareNotices(row, oldest) >= 0);
        const knownIds = new Set(state.current.rows.map(row => row.id));
        const hasNewEntries = updates.some(row => !row.is_deleted && !knownIds.has(row.id));
        state.current.rows = mergeNotices(state.current.rows, updates);
        setRows(state.current.rows);
        state.current.pinRows = mergeNotices(state.current.pinRows, enriched);
        setPins(pendingPins(state.current.pinRows));
        if (!bottom && hasNewEntries) setNewItems(true);
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
            setRows(s.rows);
            setPins(pendingPins(s.pinRows));
            setCanManage(page.canManage);
            setViewerRole(page.viewerRole || null);
            const nextMembers = Array.isArray(page.members) ? page.members : [];
            const nextCount = Number.isFinite(Number(page.memberCount)) ? Number(page.memberCount) : nextMembers.length;
            state.current.members = nextMembers;
            setMembers(nextMembers);
            setMemberCount(nextCount);
            setRoleCounts(normalizeRoleCounts(page.roleCounts, nextCount));
            setOverduePayouts(Array.isArray(page.overduePayouts) ? page.overduePayouts : []);
            setHasMore(more);
            setError('');
        } catch (failure) { if (s.alive) setError(failure.message); }
        finally {
            if (s.alive && generation === s.generation) {
                s.loading = false;
                setLoading(false);
                if (s.refreshAfterLoad) { s.refreshAfterLoad = false; void hydrate(); }
            }
        }
    }

    useEffect(() => {
        const s = state.current; s.alive = true; s.loading = false; s.epoch++;
        const instanceSuffix = Math.random().toString(36).slice(2, 8);
        const channel = supabase.channel(`club-notice-board:${club.id}:${userId}:${instanceSuffix}`)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'club_notice_board', filter: `club_id=eq.${club.id}` }, event => {
                const row = event.new;
                if (!s.alive || s.denied || row?.club_id !== club.id) return;
                // Joined cash-out details must come from the authorized reader, never
                // from an unjoined realtime table row.
                if (row.cashout_id) { if (s.loading) s.refreshAfterLoad = true; else void hydrate(); }
                else if (s.loading) s.events.push(row); else accept([row]);
            }).on('postgres_changes', { event: '*', schema: 'public', table: 'club_notice_access_events', filter: `user_id=eq.${userId}` }, event => {
                const access = event.new;
                if (!s.alive || access?.club_id !== club.id || access?.user_id !== userId) return;
                // Revocation is self-readable even after club access ends.
                // Invalidate pending reads before clearing the mounted history.
                clearAccess();
                if (access.can_access === true) { setLoading(true); void hydrate(); }
                else setError('Your Club Role No Longer Has Access To This Notice Board.');
            }).subscribe(status => {
                if (!s.alive) return;
                setLive(status === 'SUBSCRIBED');
                if (['CLOSED', 'CHANNEL_ERROR', 'TIMED_OUT'].includes(status)) {
                    clearAccess(); setError('Connection Lost. Refresh To Check Notice Board Access.');
                }
                if (status === 'SUBSCRIBED') {
                    if (s.loading) s.refreshAfterLoad = true; else void hydrate();
                }
            });
        // Initial read does not depend on a working socket. A subscribed event
        // refreshes after connection to close the read/subscription race.
        void hydrate();
        const refresh = () => { if (document.visibilityState === 'visible') void hydrate(); };
        const offline = () => { clearAccess(); setError('You Are Offline. Reconnect To Check Notice Board Access.'); };
        window.addEventListener('offline', offline);
        window.addEventListener('online', refresh);
        window.addEventListener('focus', refresh);
        document.addEventListener('visibilitychange', refresh);
        return () => {
            s.alive = false; s.generation++; s.epoch++;
            if (highlightTimer.current) clearTimeout(highlightTimer.current);
            window.removeEventListener('offline', offline);
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
        finally {
            if (s.alive) {
                s.loading = false;
                setOlderLoading(false);
                if (s.refreshAfterLoad) { s.refreshAfterLoad = false; void hydrate(); }
            }
        }
    }

    useEffect(() => {
        if (!editing) return;
        const entry = [...state.current.rows, ...state.current.pinRows].find(row => row.id === editing.id && row.is_deleted);
        if (!entry) return;
        setEditing(null); setDraft('');
        setError('This Notice Was Removed. Your Edit Was Not Saved.');
    }, [rows, pins, editing]);

    useEffect(() => {
        if (pins.length === 0) setActivePinIndex(0);
        else if (activePinIndex >= pins.length) setActivePinIndex(pins.length - 1);
    }, [pins.length, activePinIndex]);

    async function mutate(method, payload, action) {
        if (busy) return false;
        setBusy(true); setError('');
        try {
            const result = await request(method, payload, action);
            if (!result) return false;
            // A delayed read must replay acknowledged writes even without a socket.
            if (state.current.loading) state.current.events.push(result.entry);
            accept([result.entry]); return true;
        } catch (failure) {
            if (state.current.alive) {
                if (action === 'add_note' && failure.status === 409) {
                    // A rejected stale note made no write. Refresh its version
                    // while retaining the draft; uncertain outcomes keep their ID.
                    noteIntent.current = null;
                    await hydrate();
                    const current = [...state.current.rows, ...state.current.pinRows].find(row => row.id === payload.id && !row.is_deleted);
                    if (current) setNoteTarget(current);
                }
                setError(failure.message);
            }
            return false;
        }
        finally { if (state.current.alive) setBusy(false); }
    }

    async function submit(event) {
        event.preventDefault();
        const content = draft.trim();
        if (!content) return;
        if (editing) {
            if (await mutate('PATCH', { id: editing.id, version: editing.version, content })) { setEditing(null); setDraft(''); }
        } else {
            const shouldPin = kind === 'pending_payout' ? true : Boolean(pinOnPost);
            // Reuse the same creation identity after an uncertain network result.
            if (!createIntent.current || createIntent.current.content !== content || createIntent.current.status !== kind || createIntent.current.is_pinned !== shouldPin) {
                createIntent.current = { id: crypto.randomUUID(), content, status: kind, is_pinned: shouldPin };
            }
            if (await mutate('PUT', createIntent.current)) { createIntent.current = null; setDraft(''); setPinOnPost(false); }
        }
    }

    async function submitNote(event) {
        event.preventDefault();
        if (!noteTarget || !noteDraft.trim() || !canManage) return;
        const note = noteDraft.trim();
        if (!noteIntent.current || noteIntent.current.id !== noteTarget.id || noteIntent.current.note !== note) {
            noteIntent.current = { id: noteTarget.id, version: noteTarget.version, note, op_id: crypto.randomUUID() };
        }
        if (await mutate('PATCH', noteIntent.current, 'add_note')) { noteIntent.current = null; setNoteTarget(null); setNoteDraft(''); }
    }

    function jumpToNotice(id) {
        const box = scroller.current;
        if (box && typeof box.querySelector === 'function') {
            const node = box.querySelector(`[data-notice-id="${id}"]`);
            if (node && typeof node.scrollIntoView === 'function') {
                node.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        }
        setHighlightedId(id);
        if (highlightTimer.current) clearTimeout(highlightTimer.current);
        highlightTimer.current = setTimeout(() => setHighlightedId(null), 1800);
    }

    const visibleRows = useMemo(() => {
        const active = rows.filter(row => !row.is_deleted);
        const q = searchQuery.trim().toLowerCase();
        return active.filter(row => {
            if (filterKind === 'notices' && (row.status !== 'notice' || row.cashout_id)) return false;
            if (filterKind === 'payouts' && row.status !== 'pending_payout' && row.status !== 'paid' && !row.cashout_id) return false;
            if (filterKind === 'pinned' && !row.is_pinned) return false;
            if (!q) return true;
            const hay = [
                row.content,
                row.author_name,
                row.cashout?.player_name,
                row.cashout?.player_note,
                ...(Array.isArray(row.manager_notes) ? row.manager_notes.map(n => `${n.actor_name || ''} ${n.note || ''}`) : []),
            ].filter(Boolean).join(' ').toLowerCase();
            return hay.includes(q);
        });
    }, [rows, filterKind, searchQuery]);

    const feedCounts = useMemo(() => {
        const active = rows.filter(row => !row.is_deleted);
        return {
            all: active.length,
            notices: active.filter(r => r.status === 'notice' && !r.cashout_id).length,
            payouts: active.filter(r => r.status === 'pending_payout' || r.status === 'paid' || r.cashout_id).length,
            pinned: pins.length,
        };
    }, [rows, pins]);

    const filteredMembers = useMemo(() => {
        const q = rosterSearch.trim().toLowerCase();
        return members.filter(m => {
            if (rosterRoleFilter === 'management' && !['owner', 'co_owner', 'admin'].includes(m.role)) return false;
            if (rosterRoleFilter === 'agents' && !['super_agent', 'agent', 'sub_agent'].includes(m.role)) return false;
            if (!q) return true;
            return `${m.display_name || ''} ${m.username || ''} ${formatRoleLabel(m.role)}`.toLowerCase().includes(q);
        });
    }, [members, rosterSearch, rosterRoleFilter]);

    const memberSummary = formatMemberSummary(roleCounts, memberCount);
    const orderedPins = useMemo(() => [...pins].reverse(), [pins]);
    const currentPin = orderedPins[activePinIndex] || orderedPins[0] || null;

    const rolePill = (role) => {
        const meta = ROLE_META[role] || { label: formatRoleLabel(role), color: C.textSec, bg: subtleBg };
        return (
            <span style={{
                display: 'inline-flex',
                alignItems: 'center',
                padding: '1px 7px',
                borderRadius: 999,
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: '0.03em',
                textTransform: 'uppercase',
                color: meta.color,
                background: meta.bg,
                border: `1px solid ${meta.color}40`,
                whiteSpace: 'nowrap',
            }}>
                {meta.label}
            </span>
        );
    };

    const card = (row, pinned = false) => {
        const authorName = row.author_name || 'Club Management';
        const authorRole = row.author_role || 'admin';
        const roleMeta = ROLE_META[authorRole] || { color: accentBlue, bg: 'rgba(0,132,255,0.16)' };
        const isHighlighted = !pinned && highlightedId === row.id;
        const isPayout = Boolean(row.cashout_id) || row.status === 'pending_payout' || row.status === 'paid';
        const statusText = row.cashout_id
            ? 'Payout Request'
            : row.status === 'pending_payout'
                ? 'Pending Payout'
                : row.status === 'paid'
                    ? 'Marked Paid'
                    : 'Club Notice';
        const statusColor = row.status === 'pending_payout'
            ? accentBlue
            : row.status === 'paid'
                ? '#22c55e'
                : C.textSec;

        return (
            <article
                key={pinned ? `pin:${row.id}` : row.id}
                data-notice-id={pinned ? undefined : row.id}
                style={{
                    display: 'flex',
                    gap: 10,
                    marginBottom: pinned ? 8 : 12,
                    alignItems: 'flex-start',
                }}
            >
                {!pinned && (
                    <div
                        aria-hidden="true"
                        style={{
                            width: 34,
                            height: 34,
                            borderRadius: '50%',
                            flexShrink: 0,
                            overflow: 'hidden',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: 12,
                            fontWeight: 700,
                            color: roleMeta.color,
                            background: roleMeta.bg,
                            border: `1.5px solid ${roleMeta.color}66`,
                        }}
                    >
                        {row.author_avatar
                            ? <img src={row.author_avatar} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            : initialsOf(authorName)}
                    </div>
                )}
                <div
                    style={{
                        flex: 1,
                        minWidth: 0,
                        padding: pinned ? '10px 12px' : '11px 14px',
                        borderRadius: pinned ? 10 : '4px 14px 14px 14px',
                        border: `1px solid ${isHighlighted ? accentBlue : pinned || row.is_pinned ? `${accentBlue}88` : C.border}`,
                        background: isHighlighted ? 'rgba(0, 132, 255, 0.14)' : surfaceBg,
                        boxShadow: isHighlighted ? `0 0 0 2px ${accentBlue}55` : 'none',
                        transition: 'border-color 0.2s ease, background 0.2s ease, box-shadow 0.2s ease',
                    }}
                >
                    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                        <strong style={{ fontSize: 13, color: roleMeta.color }}>{authorName}</strong>
                        {rolePill(authorRole)}
                        <span style={{
                            fontSize: 10,
                            fontWeight: 700,
                            padding: '1px 6px',
                            borderRadius: 6,
                            color: statusColor,
                            background: isPayout ? 'rgba(0, 132, 255, 0.12)' : subtleBg,
                        }}>
                            {statusText}
                        </span>
                        {row.is_pinned && (
                            <span style={{ fontSize: 10, fontWeight: 700, color: accentBlue }}>📌 Pinned</span>
                        )}
                        <time
                            dateTime={row.created_at}
                            title={new Date(row.created_at).toLocaleString()}
                            style={{ marginLeft: 'auto', color: C.textSec, fontSize: 11 }}
                        >
                            {formatShortTime(row.created_at)}{row.version > 1 && !row.cashout_id ? ' · Edited' : ''}
                        </time>
                    </div>
                    <p style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', lineHeight: 1.5, fontSize: 14, margin: '4px 0 8px' }}>
                        {row.content}
                    </p>
                    {row.cashout_id && (
                        <CashoutRequestActions
                            cashoutId={row.cashout_id}
                            currentUserId={userId}
                            theme={C}
                            initialCard={row.cashout || null}
                            onChanged={() => void hydrate()}
                        />
                    )}
                    {Array.isArray(row.manager_notes) && row.manager_notes.length > 0 && (
                        <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
                            {row.manager_notes.map(note => (
                                <div key={note.id} style={{ borderLeft: `2px solid ${accentBlue}`, paddingLeft: 10, fontSize: 12, background: subtleBg, borderRadius: '0 6px 6px 0', padding: '6px 10px' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                                        <strong>{note.actor_name || 'Club Management'}</strong>
                                        <time style={{ color: C.textSec, fontSize: 11 }} dateTime={note.created_at}>{new Date(note.created_at).toLocaleString()}</time>
                                    </div>
                                    <p style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', margin: '3px 0 0' }}>{note.note}</p>
                                </div>
                            ))}
                        </div>
                    )}
                    {canManage && row.cashout_id && (
                        <div aria-label="Payout Board Actions" style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                            {row.cashout?.status === 'pending' && (
                                <button type="button" disabled={busy} style={button} onClick={() => void mutate('PATCH', { id: row.id, version: row.version, is_pinned: !row.is_pinned })}>
                                    {row.is_pinned ? 'Unpin' : 'Pin'}
                                </button>
                            )}
                            <button type="button" disabled={busy} style={button} onClick={() => { setNoteTarget(row); setNoteDraft(''); noteIntent.current = null; }}>
                                Add Note
                            </button>
                        </div>
                    )}
                    {canManage && !row.cashout_id && (
                        <div aria-label="Notice Actions" style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                            <button type="button" disabled={busy} style={button} onClick={() => { setEditing(row); setDraft(row.content); }}>Edit</button>
                            {row.status !== 'paid' && (
                                <button type="button" disabled={busy} style={button} onClick={() => void mutate('PATCH', { id: row.id, version: row.version, is_pinned: !row.is_pinned })}>
                                    {row.is_pinned ? 'Unpin' : 'Pin'}
                                </button>
                            )}
                            {row.status === 'pending_payout' && (
                                <button type="button" disabled={busy} style={button} onClick={() => {
                                    if (window.confirm('Confirm This Payout Has Already Been Paid? This Updates The Board Record Only.')) {
                                        void mutate('PATCH', { id: row.id, version: row.version, status: 'paid' });
                                    }
                                }}>
                                    Mark As Paid
                                </button>
                            )}
                            {row.status === 'paid' && (
                                <button type="button" disabled={busy} style={button} onClick={() => {
                                    if (window.confirm('Reopen This Payout Request? This Updates The Board Record Only.')) {
                                        void mutate('PATCH', { id: row.id, version: row.version, status: 'pending_payout', is_pinned: true });
                                    }
                                }}>
                                    Reopen Payout
                                </button>
                            )}
                            <button type="button" disabled={busy} style={{ ...button, color: '#ef4444' }} onClick={() => {
                                if (window.confirm('Remove This Notice From The Board?')) {
                                    void mutate('DELETE', { id: row.id, version: row.version });
                                }
                            }}>
                                Delete
                            </button>
                        </div>
                    )}
                </div>
            </article>
        );
    };

    return (
        <section aria-label="Club Notice Board" style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, width: '100%', maxWidth: '100%', overflowX: 'hidden', boxSizing: 'border-box', color: C.text, position: 'relative' }}>
            <style>{`
                .nb-scroller {
                    --scrollbar-thumb: rgba(176, 179, 184, 0.55);
                    --scrollbar-track: transparent;
                    scrollbar-width: thin;
                    scrollbar-color: var(--scrollbar-thumb) var(--scrollbar-track);
                }
                @supports not (scrollbar-color: auto) {
                    .nb-scroller { scrollbar-width: auto; }
                    .nb-scroller::-webkit-scrollbar { width: 8px; height: 8px; }
                    .nb-scroller::-webkit-scrollbar-thumb { background: var(--scrollbar-thumb); border-radius: 4px; }
                    .nb-scroller::-webkit-scrollbar-track { background: var(--scrollbar-track); }
                }
                dialog.nb-roster-dialog[open] {
                    display: flex;
                    flex-direction: column;
                }
                dialog.nb-roster-dialog:modal {
                    overscroll-behavior: contain;
                }
                dialog.nb-roster-dialog::backdrop {
                    overflow: hidden;
                    overscroll-behavior: contain;
                    background: rgba(0, 0, 0, 0.68);
                }
            `}</style>

            {/* Telegram-Style Channel Header */}
            <header style={{
                padding: '9px 12px',
                borderBottom: `1px solid ${C.border}`,
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                background: surfaceBg,
                flexShrink: 0,
                minWidth: 0,
                boxSizing: 'border-box',
            }}>
                <button type="button" style={{ ...button, padding: '5px 9px', flexShrink: 0 }} onClick={onBack} aria-label="Back To Club Inbox">Back</button>
                <button
                    type="button"
                    onClick={() => setRosterOpen(true)}
                    aria-label="Open Staff And Agents Roster"
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        minWidth: 0,
                        flex: 1,
                        background: 'transparent',
                        border: 'none',
                        padding: 0,
                        color: 'inherit',
                        cursor: 'pointer',
                        textAlign: 'left',
                    }}
                >
                    <div
                        aria-hidden="true"
                        style={{
                            width: 34,
                            height: 34,
                            borderRadius: '50%',
                            flexShrink: 0,
                            overflow: 'hidden',
                            background: 'linear-gradient(135deg, #0084ff, #2563eb)',
                            color: '#fff',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontWeight: 800,
                            fontSize: 13,
                        }}
                    >
                        {club.avatar_url
                            ? <img src={club.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            : initialsOf(club.name)}
                    </div>
                    <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5, minWidth: 0 }}>
                            <h2 style={{ fontSize: 14, fontWeight: 700, margin: 0, flexShrink: 0, whiteSpace: 'nowrap' }}>
                                Notice Board
                            </h2>
                            <span style={{ fontSize: 11, color: C.textSec, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>
                                · {club.name}
                            </span>
                        </div>
                        <div data-testid="notice-member-summary" style={{ color: accentBlue, fontSize: 11, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {loading && memberCount === 0 ? 'Loading Staff Channel...' : memberSummary}
                        </div>
                    </div>
                </button>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
                    <button
                        type="button"
                        aria-label="View Staff And Agents"
                        style={{ ...button, padding: '4px 8px', fontSize: 11, borderColor: accentBlue, color: accentBlue, fontWeight: 700, whiteSpace: 'nowrap' }}
                        onClick={() => setRosterOpen(true)}
                    >
                        {`Staff (${roleCounts.total || memberCount})`}
                    </button>
                    <span
                        role="status"
                        title={live ? 'Live' : 'Connecting'}
                        style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4,
                            color: live ? '#22c55e' : C.textSec,
                            fontSize: 10,
                            fontWeight: 600,
                            padding: '3px 6px',
                            borderRadius: 999,
                            background: live ? 'rgba(34, 197, 94, 0.12)' : subtleBg,
                            whiteSpace: 'nowrap',
                        }}
                    >
                        <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: '50%', background: live ? '#22c55e' : '#f59e0b' }} />
                        {live ? 'Live' : '...'}
                    </span>
                </div>
            </header>

            {/* Telegram-Style Sticky Pinned Message Bar */}
            <section
                aria-label="Recent Payout Requests"
                style={{
                    flexShrink: 0,
                    borderBottom: `1px solid ${C.border}`,
                    background: C.bg,
                }}
            >
                {currentPin ? (
                    <>
                        <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 10,
                            padding: '8px 14px',
                            background: 'rgba(0, 132, 255, 0.08)',
                        }}>
                            <div aria-hidden="true" style={{ display: 'flex', flexDirection: 'column', gap: 2, flexShrink: 0 }}>
                                {orderedPins.slice(0, 5).map((p, idx) => (
                                    <span key={p.id} style={{
                                        width: 3,
                                        height: orderedPins.length === 1 ? 26 : Math.max(5, Math.floor(26 / Math.min(orderedPins.length, 5))),
                                        borderRadius: 2,
                                        background: idx === (activePinIndex % Math.min(orderedPins.length, 5)) ? accentBlue : `${accentBlue}44`,
                                    }} />
                                ))}
                            </div>
                            <button
                                type="button"
                                onClick={() => {
                                    jumpToNotice(currentPin.id);
                                    if (orderedPins.length > 1) setActivePinIndex(prev => (prev + 1) % orderedPins.length);
                                }}
                                style={{
                                    flex: 1,
                                    minWidth: 0,
                                    background: 'transparent',
                                    border: 'none',
                                    padding: 0,
                                    color: 'inherit',
                                    cursor: 'pointer',
                                    textAlign: 'left',
                                }}
                            >
                                <div style={{ fontSize: 11, fontWeight: 700, color: accentBlue, display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <span>
                                        {`📌 Pinned ${currentPin.status === 'pending_payout' || currentPin.cashout_id ? 'Payout Request' : 'Message'}${orderedPins.length > 1 ? ` #${activePinIndex + 1} of ${orderedPins.length}` : ''}`}
                                    </span>
                                    {currentPin.author_name && <span style={{ color: C.textSec, fontWeight: 500 }}>· {currentPin.author_name}</span>}
                                </div>
                                <div style={{ fontSize: 12, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 2 }}>
                                    {currentPin.cashout?.player_name
                                        ? `${currentPin.cashout.player_name} · ${formatChipsSimple(currentPin.cashout.amount)} Chips - ${currentPin.content}`
                                        : currentPin.content}
                                </div>
                            </button>
                            <button
                                type="button"
                                style={{ ...button, fontSize: 11, padding: '4px 8px', flexShrink: 0 }}
                                aria-expanded={pinsExpanded}
                                onClick={() => setPinsExpanded(prev => !prev)}
                            >
                                {pinsExpanded ? 'Hide Pinned' : `All Pinned (${orderedPins.length})`}
                            </button>
                        </div>
                        {pinsExpanded && (
                            <div className="nb-scroller" style={{ maxHeight: 240, overflowY: 'auto', padding: '10px 14px', borderTop: `1px solid ${C.border}`, background: C.bg }}>
                                <h3 style={{ fontSize: 12, margin: '0 0 8px', color: accentBlue }}>
                                    Pinned Messages & Pending Payouts ({orderedPins.length})
                                </h3>
                                {orderedPins.map(row => card(row, true))}
                            </div>
                        )}
                    </>
                ) : (
                    <div style={{ padding: '7px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                        <span style={{ fontSize: 12, color: C.textSec }}>
                            {loading ? 'Loading Pinned Messages...' : '📌 No Pinned Messages'}
                        </span>
                        {canManage && !loading && (
                            <span style={{ fontSize: 11, color: C.textSec }}>Pin Any Club Notice Or Payout To Keep It At The Top</span>
                        )}
                    </div>
                )}
            </section>

            {/* Overdue >4-Hour Unfulfilled Downline Payout Alert Banner (Management Only) */}
            {canManage && overduePayouts.length > 0 && (
                <section
                    aria-label="Unfulfilled Payouts Over 4 Hours"
                    style={{
                        flexShrink: 0,
                        padding: '8px 14px',
                        borderBottom: `1px solid ${C.border}`,
                        background: 'rgba(245, 158, 11, 0.12)',
                    }}
                >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: '#f59e0b' }}>
                            ⏰ {overduePayouts.length} Downline Payout {overduePayouts.length === 1 ? 'Request' : 'Requests'} Unfulfilled Over 4 Hours
                        </div>
                        <button
                            type="button"
                            style={{ ...button, fontSize: 11, padding: '4px 8px', borderColor: 'rgba(245, 158, 11, 0.45)', color: '#f59e0b' }}
                            onClick={() => setOverdueExpanded(prev => !prev)}
                        >
                            {overdueExpanded ? 'Hide' : 'Details'}
                        </button>
                    </div>
                    {overdueExpanded && (
                        <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
                            {overduePayouts.map(item => (
                                <div key={item.cashout_id} style={{
                                    display: 'flex',
                                    flexWrap: 'wrap',
                                    justifyContent: 'space-between',
                                    gap: 6,
                                    padding: '6px 10px',
                                    borderRadius: 8,
                                    background: surfaceBg,
                                    border: `1px solid ${C.border}`,
                                    fontSize: 12,
                                }}>
                                    <span>
                                        <strong>{item.player_name}</strong> · {formatChipsSimple(item.amount)} Chips
                                        <span style={{ color: C.textSec }}> (Upline: {item.agent_name})</span>
                                    </span>
                                    <span style={{ color: '#f59e0b', fontWeight: 700 }}>
                                        Pending {item.hours_pending}h+{item.is_escalated ? ' · Escalated' : ''}
                                    </span>
                                </div>
                            ))}
                        </div>
                    )}
                </section>
            )}

            {/* Quick Filter & Search Bar */}
            <div style={{
                flexShrink: 0,
                padding: '6px 12px',
                borderBottom: `1px solid ${C.border}`,
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'center',
                gap: 6,
                background: C.bg,
                minWidth: 0,
                boxSizing: 'border-box',
            }}>
                {[
                    { id: 'all', label: `All (${feedCounts.all})` },
                    { id: 'notices', label: `Notices (${feedCounts.notices})` },
                    { id: 'payouts', label: `Payouts (${feedCounts.payouts})` },
                    { id: 'pinned', label: `Pinned (${feedCounts.pinned})` },
                ].map(tab => (
                    <button
                        key={tab.id}
                        type="button"
                        aria-pressed={filterKind === tab.id}
                        onClick={() => setFilterKind(tab.id)}
                        style={{
                            border: `1px solid ${filterKind === tab.id ? accentBlue : C.border}`,
                            borderRadius: 999,
                            background: filterKind === tab.id ? 'rgba(0, 132, 255, 0.16)' : 'transparent',
                            color: filterKind === tab.id ? accentBlue : C.textSec,
                            padding: '3px 9px',
                            fontSize: 11,
                            fontWeight: 600,
                            cursor: 'pointer',
                            fontFamily: 'inherit',
                        }}
                    >
                        {tab.label}
                    </button>
                ))}
                <button
                    type="button"
                    aria-label="Search Notices"
                    aria-pressed={searchOpen}
                    onClick={() => { setSearchOpen(prev => !prev); if (searchOpen) setSearchQuery(''); }}
                    style={{
                        marginLeft: 'auto',
                        border: `1px solid ${searchOpen ? accentBlue : C.border}`,
                        borderRadius: 999,
                        background: searchOpen ? 'rgba(0, 132, 255, 0.16)' : 'transparent',
                        color: searchOpen ? accentBlue : C.textSec,
                        padding: '3px 9px',
                        fontSize: 11,
                        fontWeight: 600,
                        cursor: 'pointer',
                        fontFamily: 'inherit',
                    }}
                >
                    Search
                </button>
                {searchOpen && (
                    <input
                        type="search"
                        aria-label="Filter Notice History"
                        placeholder="Search Notices, Authors, Players..."
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        style={{
                            width: '100%',
                            boxSizing: 'border-box',
                            border: `1px solid ${C.border}`,
                            borderRadius: 8,
                            background: surfaceBg,
                            color: C.text,
                            padding: '5px 10px',
                            fontSize: 12,
                            fontFamily: 'inherit',
                        }}
                    />
                )}
            </div>

            {error && (
                <div role="alert" style={{ padding: '8px 14px', fontSize: 12, background: 'rgba(239, 68, 68, 0.12)', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ flex: 1 }}>{error}</span>
                    <button type="button" style={button} disabled={loading || olderLoading} onClick={() => void hydrate()}>Refresh Board</button>
                </div>
            )}

            {/* Telegram-Style Message Feed */}
            <div
                ref={scroller}
                tabIndex={0}
                aria-label="Notice History"
                className="nb-scroller"
                style={{ flex: 1, minHeight: 0, overflowY: 'auto', overflowAnchor: 'none', padding: '14px 16px', background: C.bg }}
                onScroll={() => { if (scroller.current?.scrollTop <= 50 && !error) void older(); }}
            >
                {hasMore && (
                    <button type="button" style={{ ...button, width: '100%', marginBottom: 12 }} disabled={olderLoading} onClick={() => void older()}>
                        {olderLoading ? 'Loading Earlier Notices...' : 'Load Earlier Notices'}
                    </button>
                )}
                {loading ? (
                    <p role="status" style={{ color: C.textSec, textAlign: 'center', padding: 24 }}>Loading Notice Board...</p>
                ) : visibleRows.length === 0 ? (
                    <div style={{ color: C.textSec, textAlign: 'center', padding: '32px 16px' }}>
                        <div style={{ fontSize: 28, marginBottom: 8 }}>📢</div>
                        <p style={{ margin: 0, fontWeight: 600, color: C.text }}>
                            {rows.some(r => !r.is_deleted) ? 'No Matching Notices' : 'No Notices Yet'}
                        </p>
                        <p style={{ margin: '6px 0 0', fontSize: 12 }}>
                            {roleCounts.total > 0
                                ? `${memberSummary} Are Automatically Enrolled In This Club Notice Board.`
                                : 'Club Owners, Admins, And Active Agents Appear Here Automatically.'}
                        </p>
                    </div>
                ) : (
                    visibleRows.map((row, idx) => {
                        const prev = idx > 0 ? visibleRows[idx - 1] : null;
                        const showDay = !prev || dayKey(prev.created_at) !== dayKey(row.created_at);
                        return (
                            <React.Fragment key={row.id}>
                                {showDay && (
                                    <div style={{ display: 'flex', justifyContent: 'center', margin: '10px 0 12px' }}>
                                        <span style={{
                                            fontSize: 11,
                                            fontWeight: 600,
                                            color: C.textSec,
                                            background: surfaceBg,
                                            border: `1px solid ${C.border}`,
                                            borderRadius: 999,
                                            padding: '2px 10px',
                                        }}>
                                            {formatDayLabel(row.created_at)}
                                        </span>
                                    </div>
                                )}
                                {card(row)}
                            </React.Fragment>
                        );
                    })
                )}
            </div>

            {newItems && (
                <button
                    type="button"
                    style={{
                        ...button,
                        position: 'absolute',
                        right: 18,
                        bottom: canManage ? 124 : 58,
                        background: accentBlue,
                        color: '#fff',
                        borderColor: accentBlue,
                        borderRadius: 999,
                        padding: '7px 14px',
                        fontWeight: 700,
                        boxShadow: '0 4px 14px rgba(0, 0, 0, 0.35)',
                    }}
                    onClick={() => { scroller.current.scrollTop = scroller.current.scrollHeight; setNewItems(false); }}
                >
                    Latest Notices ↓
                </button>
            )}

            {/* Manager Payout Note Composer */}
            {canManage && noteTarget && (
                <form onSubmit={submitNote} style={{ padding: '10px 14px', borderTop: `1px solid ${C.border}`, background: surfaceBg }}>
                    <div style={{ fontSize: 12, marginBottom: 6, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span>Adding Payout Note</span>
                        <button type="button" style={button} disabled={busy} onClick={() => { setNoteTarget(null); setNoteDraft(''); }}>Cancel Note</button>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                        <textarea
                            aria-label="Payout Note"
                            placeholder="Add An Internal Payout Coordination Note..."
                            value={noteDraft}
                            onChange={e => setNoteDraft(e.target.value)}
                            maxLength={2000}
                            disabled={busy}
                            rows={2}
                            style={{ ...button, flex: 1, minWidth: 0, resize: 'vertical', textAlign: 'left', padding: '8px 10px' }}
                        />
                        <button type="submit" disabled={busy || !noteDraft.trim()} style={{ ...button, background: accentBlue, color: '#fff', borderColor: accentBlue, fontWeight: 700 }}>
                            {busy ? 'Saving...' : 'Save Note'}
                        </button>
                    </div>
                </form>
            )}

            {/* Read-Only Agent Broadcast Footer */}
            {!loading && !canManage && !error && (
                <div style={{
                    padding: '10px 14px',
                    borderTop: `1px solid ${C.border}`,
                    background: surfaceBg,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 10,
                }}>
                    <p style={{ margin: 0, color: C.textSec, fontSize: 12 }}>
                        Read Only · Club Management Handles Payouts And Notes{viewerRole ? ` · Enrolled As ${formatRoleLabel(viewerRole)}` : ''}
                    </p>
                    <button type="button" style={{ ...button, fontSize: 11 }} onClick={() => setRosterOpen(true)}>
                        View Staff ({roleCounts.total || memberCount})
                    </button>
                </div>
            )}

            {/* Telegram-Style Management Broadcast Composer */}
            {canManage && !noteTarget && (
                <form onSubmit={submit} style={{ padding: '10px 14px', borderTop: `1px solid ${C.border}`, background: surfaceBg }}>
                    {editing ? (
                        <div style={{ fontSize: 12, marginBottom: 6, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <span>Editing Notice</span>
                            <button type="button" style={button} onClick={() => { setEditing(null); setDraft(''); }}>Cancel Edit</button>
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                            <select
                                aria-label="Notice Type"
                                value={kind}
                                disabled={busy}
                                onChange={e => {
                                    const nextKind = e.target.value;
                                    setKind(nextKind);
                                    if (nextKind === 'pending_payout') setPinOnPost(true);
                                }}
                                style={button}
                            >
                                <option value="notice">Club Notice</option>
                                <option value="pending_payout">Payout Request</option>
                            </select>
                            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, color: pinOnPost || kind === 'pending_payout' ? accentBlue : C.textSec, cursor: 'pointer' }}>
                                <input
                                    type="checkbox"
                                    checked={kind === 'pending_payout' ? true : pinOnPost}
                                    disabled={busy || kind === 'pending_payout'}
                                    onChange={e => setPinOnPost(e.target.checked)}
                                />
                                📌 Pin To Top
                            </label>
                            {draft.length > 3200 && (
                                <span style={{ marginLeft: 'auto', fontSize: 11, color: draft.length > 3800 ? '#f59e0b' : C.textSec }}>
                                    {draft.length}/4000
                                </span>
                            )}
                        </div>
                    )}
                    <div style={{ display: 'flex', gap: 8 }}>
                        <textarea
                            aria-label="Notice Text"
                            placeholder="Write A Club Notice..."
                            value={draft}
                            onChange={e => setDraft(e.target.value)}
                            onKeyDown={e => {
                                if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && draft.trim() && !busy) {
                                    void submit(e);
                                }
                            }}
                            maxLength={4000}
                            disabled={busy}
                            rows={2}
                            style={{ ...button, flex: 1, minWidth: 0, resize: 'vertical', maxHeight: 120, textAlign: 'left', padding: '8px 10px' }}
                        />
                        <button
                            type="submit"
                            disabled={busy || !draft.trim()}
                            style={{ ...button, background: accentBlue, color: '#fff', borderColor: accentBlue, fontWeight: 700, padding: '8px 16px' }}
                        >
                            {busy ? 'Saving...' : editing ? 'Save' : 'Post'}
                        </button>
                    </div>
                </form>
            )}

            {/* Native <dialog> Telegram-Style Staff & Agents Roster Modal */}
            <dialog
                ref={rosterDialogRef}
                closedby="any"
                aria-labelledby={rosterTitleId}
                className="nb-roster-dialog"
                style={{
                    width: 'min(480px, calc(100vw - 24px))',
                    maxHeight: '82vh',
                    padding: 0,
                    border: `1px solid ${C.border}`,
                    borderRadius: 14,
                    background: surfaceBg,
                    color: C.text,
                    boxShadow: '0 20px 60px rgba(0, 0, 0, 0.55)',
                    overflow: 'hidden',
                }}
            >
                <div style={{ padding: '14px 16px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                    <div style={{ minWidth: 0 }}>
                        <h1 id={rosterTitleId} style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>
                            {club.name} · Notice Board Staff
                        </h1>
                        <div style={{ fontSize: 12, color: C.textSec, marginTop: 2 }}>
                            {memberSummary}
                        </div>
                    </div>
                    {rosterOpen && (
                        <form method="dialog" style={{ margin: 0 }}>
                            <button type="submit" value="close" autoFocus style={button} aria-label="Close Staff Roster">Close</button>
                        </form>
                    )}
                </div>

                {/* Role Breakdown Grid */}
                <div style={{ padding: '12px 16px', borderBottom: `1px solid ${C.border}`, background: C.bg }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(84px, 1fr))', gap: 8 }}>
                        {[
                            { label: 'Total Staff', value: roleCounts.total, color: C.text },
                            { label: 'Admins', value: roleCounts.management, color: '#f59e0b' },
                            { label: 'Super Agents', value: roleCounts.super_agent, color: '#06b6d4' },
                            { label: 'Agents', value: roleCounts.agent, color: '#3b82f6' },
                            { label: 'Sub-Agents', value: roleCounts.sub_agent, color: '#94a3b8' },
                        ].map(stat => (
                            <div key={stat.label} style={{ padding: '8px 10px', borderRadius: 10, border: `1px solid ${C.border}`, background: surfaceBg, textAlign: 'center' }}>
                                <div style={{ fontSize: 17, fontWeight: 800, color: stat.color }}>{stat.value}</div>
                                <div style={{ fontSize: 10, color: C.textSec, marginTop: 2 }}>{stat.label}</div>
                            </div>
                        ))}
                    </div>
                    <p style={{ margin: '10px 0 0', fontSize: 11, color: C.textSec }}>
                        ✓ Auto-Synced · All Active Club Owners, Admins, And Agents Are Enrolled Automatically.
                    </p>
                </div>

                {/* Roster Search & Role Filter */}
                <div style={{ padding: '10px 16px', borderBottom: `1px solid ${C.border}`, display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                    <input
                        type="search"
                        aria-label="Search Staff Roster"
                        placeholder="Search Agents & Admins..."
                        value={rosterSearch}
                        onChange={e => setRosterSearch(e.target.value)}
                        style={{
                            flex: '1 1 160px',
                            minWidth: 140,
                            border: `1px solid ${C.border}`,
                            borderRadius: 8,
                            background: C.bg,
                            color: C.text,
                            padding: '6px 10px',
                            fontSize: 12,
                            fontFamily: 'inherit',
                        }}
                    />
                    {[
                        { id: 'all', label: `All (${roleCounts.total})` },
                        { id: 'management', label: `Admins (${roleCounts.management})` },
                        { id: 'agents', label: `Agents (${roleCounts.agents})` },
                    ].map(f => (
                        <button
                            key={f.id}
                            type="button"
                            onClick={() => setRosterRoleFilter(f.id)}
                            style={{
                                border: `1px solid ${rosterRoleFilter === f.id ? accentBlue : C.border}`,
                                borderRadius: 999,
                                background: rosterRoleFilter === f.id ? 'rgba(0, 132, 255, 0.16)' : 'transparent',
                                color: rosterRoleFilter === f.id ? accentBlue : C.textSec,
                                padding: '4px 10px',
                                fontSize: 11,
                                fontWeight: 600,
                                cursor: 'pointer',
                                fontFamily: 'inherit',
                            }}
                        >
                            {f.label}
                        </button>
                    ))}
                </div>

                {/* Scrollable Member List */}
                <div className="nb-scroller" style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '10px 16px' }}>
                    {filteredMembers.length === 0 ? (
                        <p style={{ color: C.textSec, textAlign: 'center', fontSize: 12, padding: 20 }}>
                            {members.length === 0 ? 'No Active Staff Found For This Club.' : 'No Staff Match Your Filter.'}
                        </p>
                    ) : (
                        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
                            {filteredMembers.map(member => {
                                const meta = ROLE_META[member.role] || { color: accentBlue, bg: subtleBg };
                                return (
                                    <li
                                        key={member.user_id}
                                        style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: 10,
                                            padding: '8px 10px',
                                            borderRadius: 10,
                                            border: `1px solid ${C.border}`,
                                            background: C.bg,
                                        }}
                                    >
                                        <div style={{ position: 'relative', flexShrink: 0 }}>
                                            <div style={{
                                                width: 34,
                                                height: 34,
                                                borderRadius: '50%',
                                                overflow: 'hidden',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                fontSize: 12,
                                                fontWeight: 700,
                                                color: meta.color,
                                                background: meta.bg,
                                                border: `1.5px solid ${meta.color}66`,
                                            }}>
                                                {member.avatar_url
                                                    ? <img src={member.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                                    : initialsOf(member.display_name || member.username)}
                                            </div>
                                            {member.is_online && (
                                                <span
                                                    aria-label="Online"
                                                    style={{
                                                        position: 'absolute',
                                                        right: 0,
                                                        bottom: 0,
                                                        width: 9,
                                                        height: 9,
                                                        borderRadius: '50%',
                                                        background: '#22c55e',
                                                        border: `2px solid ${C.bg}`,
                                                    }}
                                                />
                                            )}
                                        </div>
                                        <div style={{ minWidth: 0, flex: 1 }}>
                                            <div style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                {member.display_name || member.username || 'Club Staff'}
                                                {member.user_id === userId && <span style={{ color: C.textSec, fontWeight: 400 }}> (You)</span>}
                                            </div>
                                            {member.username && (
                                                <div style={{ fontSize: 11, color: C.textSec, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                    @{member.username}
                                                </div>
                                            )}
                                        </div>
                                        {rolePill(member.role)}
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </div>
            </dialog>
        </section>
    );
}
