/**
 * STUDY FOLDERS BROWSER (W6-1)
 * ═══════════════════════════════════════════════════════════════════════════
 * Browses saved sandbox scenarios and reloads them into the table.
 *
 * Rebuilt for mobile:
 *   • single column bottom sheet — folders become a snap carousel, hand cards
 *     stack (the old side-by-side row overflowed 375px)
 *   • three distinct failure states: sign-in (401), retry (network/5xx) and a
 *     genuine empty archive — the old code showed "Empty Archive" for all three
 *   • delete is two-step and undoable (re-POSTs the hand for 6 seconds)
 *   • search + tag filter + 20-per-page paging, with state_json parsed once per
 *     hand id instead of on every render
 */
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import toast from 'react-hot-toast';
import { FolderOpen, Play, Trash2, Search, RotateCcw } from 'lucide-react';
import { getAccessToken } from '../../lib/authUtils';
import { T, F, S, R, btn, pill, numeric } from './paTokens';
import { BottomSheet, PAStyles, Skeleton, EmptyState, ErrorState, SignInState } from './paKit';

const PAGE_SIZE = 20;

/** Saved states can be a JSON string, an object, or corrupt legacy data. */
function parseState(raw) {
    try {
        if (typeof raw === 'string') return JSON.parse(raw) || {};
        return raw && typeof raw === 'object' ? raw : {};
    } catch (e) {
        console.warn('[StudyFolders] Corrupt state_json skipped:', e?.message || e);
        return {};
    }
}

function describe(state) {
    const board = state?.board?.flop?.filter(Boolean).join(' ')
        || (Array.isArray(state?.board) ? state.board.filter(Boolean).join(' ') : '')
        || 'Preflop';
    const hero = state?.heroHand
        ? `${state.heroHand.card1 || '?'}${state.heroHand.card2 || '?'}`
        : 'Unknown';
    return {
        board,
        hero,
        position: state?.heroPosition || null,
        loadable: !!(state?.heroHand || state?.board),
    };
}

export default function StudyFolders({ onClose, onLoadTarget }) {
    const [hands, setHands] = useState([]);
    const [loading, setLoading] = useState(true);
    const [authError, setAuthError] = useState(false);
    const [fetchError, setFetchError] = useState(null);
    const [activeFolder, setActiveFolder] = useState(null);
    const [deletingId, setDeletingId] = useState(null);
    const [confirmId, setConfirmId] = useState(null);
    const [query, setQuery] = useState('');
    const [activeTag, setActiveTag] = useState(null);
    const [page, setPage] = useState(1);

    const confirmTimer = useRef(null);
    const parseCache = useRef(new Map());

    useEffect(() => () => { if (confirmTimer.current) clearTimeout(confirmTimer.current); }, []);

    const stateFor = useCallback((hand) => {
        const key = hand?.id ?? JSON.stringify(hand?.state_json || {}).slice(0, 64);
        const cache = parseCache.current;
        if (!cache.has(key)) cache.set(key, describe(parseState(hand?.state_json)));
        return cache.get(key);
    }, []);

    const fetchHands = useCallback(async () => {
        setLoading(true);
        setAuthError(false);
        setFetchError(null);
        try {
            const token = getAccessToken();
            const headers = {};
            if (token) headers.Authorization = `Bearer ${token}`;

            const res = await fetch('/api/sandbox/saved-hands', { headers });
            if (res.status === 401) {
                setAuthError(true);
                setHands([]);
                return;
            }
            const json = await res.json().catch(() => null);
            if (!res.ok || !json?.success) {
                setFetchError('Could not reach your saved scenarios.');
                return;
            }
            const list = Array.isArray(json.hands) ? json.hands : [];
            setHands(list);
            if (list.length > 0) {
                const folderNames = [...new Set(list.map(h => h.folder_name))];
                setActiveFolder(prev => (prev && folderNames.includes(prev) ? prev : folderNames[0]));
            } else {
                setActiveFolder(null);
            }
        } catch (err) {
            console.warn('[StudyFolders] fetch error:', err?.message || err);
            setFetchError('Could not reach your saved scenarios.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchHands();
        const onSaved = () => fetchHands();
        window.addEventListener('sandbox-hand-saved', onSaved);
        return () => window.removeEventListener('sandbox-hand-saved', onSaved);
    }, [fetchHands]);

    // ── delete with undo ──────────────────────────────────────────────────
    const restoreHand = useCallback(async (hand) => {
        try {
            const token = getAccessToken();
            const headers = { 'Content-Type': 'application/json' };
            if (token) headers.Authorization = `Bearer ${token}`;
            const res = await fetch('/api/sandbox/save-hand', {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    folder_name: hand.folder_name,
                    tags: hand.tags || [],
                    state_json: parseState(hand.state_json),
                }),
            });
            const json = await res.json().catch(() => null);
            if (res.ok && json?.success) {
                toast.success('Scenario restored');
                fetchHands();
            } else {
                toast.error('Could not restore that scenario');
            }
        } catch (e) {
            console.warn('[StudyFolders] restore error:', e?.message || e);
            toast.error('Could not restore that scenario');
        }
    }, [fetchHands]);

    const handleDelete = useCallback(async (hand) => {
        const id = hand?.id;
        if (!id) return;
        setDeletingId(id);
        setConfirmId(null);
        try {
            const token = getAccessToken();
            const headers = { 'Content-Type': 'application/json' };
            if (token) headers.Authorization = `Bearer ${token}`;

            const res = await fetch('/api/sandbox/save-hand', {
                method: 'DELETE',
                headers,
                body: JSON.stringify({ id }),
            });
            const json = await res.json().catch(() => null);
            if (res.ok && json?.success) {
                // The active folder can vanish with its last hand — the effect
                // below re-points it once `folders` recomputes.
                setHands(prev => prev.filter(h => h.id !== id));
                window.dispatchEvent(new CustomEvent('sandbox-hand-deleted', { detail: { id } }));
                toast((t) => (
                    <span style={{ display: 'flex', alignItems: 'center', gap: S.sm, fontSize: F.bodySm }}>
                        Scenario deleted
                        <button
                            type="button"
                            className="pa-btn"
                            onClick={() => { toast.dismiss(t.id); restoreHand(hand); }}
                            style={{ ...btn('secondary'), padding: '0 14px', fontSize: F.label, flexShrink: 0 }}
                        >
                            <RotateCcw size={16} strokeWidth={2} /> Undo
                        </button>
                    </span>
                ), { duration: 6000 });
            } else if (res.status === 401) {
                toast.error('Sign in again to delete saved hands');
            } else {
                toast.error('Could not delete that scenario');
            }
        } catch (err) {
            console.warn('[StudyFolders] Delete error:', err);
            toast.error('Could not delete that scenario');
        } finally {
            setDeletingId(null);
        }
    }, [restoreHand]);

    const askDelete = useCallback((id) => {
        setConfirmId(id);
        if (confirmTimer.current) clearTimeout(confirmTimer.current);
        confirmTimer.current = setTimeout(() => setConfirmId(null), 3000);
    }, []);

    // ── derived data ──────────────────────────────────────────────────────
    const folders = useMemo(() => [...new Set(hands.map(h => h.folder_name))], [hands]);

    // Keeps activeFolder pointing at a folder that still exists (e.g. after the
    // last hand in it is deleted).
    useEffect(() => {
        if (folders.length === 0) {
            if (activeFolder !== null) setActiveFolder(null);
            return;
        }
        if (!activeFolder || !folders.includes(activeFolder)) setActiveFolder(folders[0]);
    }, [folders, activeFolder]);

    const folderHands = useMemo(
        () => hands.filter(h => h.folder_name === activeFolder),
        [hands, activeFolder],
    );

    const tags = useMemo(() => {
        const set = new Set();
        folderHands.forEach(h => (h.tags || []).forEach(t => set.add(t)));
        return [...set].slice(0, 12);
    }, [folderHands]);

    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        return folderHands.filter(h => {
            if (activeTag && !(h.tags || []).includes(activeTag)) return false;
            if (!q) return true;
            const info = stateFor(h);
            return [info.hero, info.board, info.position, ...(h.tags || [])]
                .filter(Boolean)
                .some(v => String(v).toLowerCase().includes(q));
        });
    }, [folderHands, query, activeTag, stateFor]);

    useEffect(() => { setPage(1); }, [activeFolder, query, activeTag]);

    const visible = filtered.slice(0, page * PAGE_SIZE);

    return (
        <BottomSheet
            open
            onClose={onClose}
            title="Study folders"
            titleIcon={<FolderOpen size={18} strokeWidth={2} color={T.accent} />}
            subtitle={loading ? 'Loading your archive…' : `${hands.length} saved scenario${hands.length === 1 ? '' : 's'}`}
            ariaLabel="Study folders"
            maxWidth={640}
        >
            <PAStyles />

            {loading ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: S.md }} aria-hidden="true">
                    <Skeleton h={44} />
                    <Skeleton h={72} />
                    <Skeleton h={72} />
                    <Skeleton h={72} />
                </div>
            ) : authError ? (
                <SignInState
                    title="Sign in to open your archive"
                    body="Saved scenarios are tied to your account, so we cannot show them while you are signed out."
                />
            ) : fetchError ? (
                <ErrorState title="Could not load your folders" body={fetchError} onRetry={fetchHands} />
            ) : hands.length === 0 ? (
                <EmptyState
                    icon={<FolderOpen size={22} strokeWidth={2} />}
                    title="Empty archive"
                    body='Use "Save to folder" in the sandbox menu to start building a drilling library.'
                    action={<button type="button" className="pa-btn" onClick={onClose} style={btn('primary')}>Back to the table</button>}
                />
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: S.md }}>
                    {/* Folder carousel */}
                    <div
                        role="tablist"
                        aria-label="Folders"
                        style={{
                            display: 'flex', gap: S.sm, overflowX: 'auto', paddingBottom: S.xs,
                            scrollSnapType: 'x mandatory', WebkitOverflowScrolling: 'touch',
                        }}
                    >
                        {folders.map(f => {
                            const on = f === activeFolder;
                            return (
                                <button
                                    key={f}
                                    type="button"
                                    role="tab"
                                    aria-selected={on}
                                    className="pa-btn"
                                    onClick={() => setActiveFolder(f)}
                                    style={{
                                        ...btn('secondary'),
                                        flexShrink: 0, scrollSnapAlign: 'start', padding: '0 14px', fontSize: F.label,
                                        background: on ? T.accentSoft : T.surface2,
                                        color: on ? T.accent : T.textMuted,
                                        borderColor: on ? 'rgba(69,153,255,0.45)' : T.borderHi,
                                    }}
                                >
                                    {f}
                                    <span style={{ ...numeric, opacity: 0.8 }}>
                                        {hands.filter(h => h.folder_name === f).length}
                                    </span>
                                </button>
                            );
                        })}
                    </div>

                    {/* Search */}
                    <label style={{ display: 'flex', alignItems: 'center', gap: S.sm, background: T.surface2, border: `1px solid ${T.border}`, borderRadius: R.sm, padding: `0 ${S.md}px`, minHeight: 44 }}>
                        <Search size={18} strokeWidth={2} color={T.textDim} />
                        <span className="pa-vh">Search saved scenarios</span>
                        <input
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            placeholder="Search hand, board or tag"
                            style={{
                                flex: 1, minWidth: 0, background: 'transparent', border: 'none', outline: 'none',
                                color: T.text, fontSize: F.input, fontFamily: 'inherit', minHeight: 44,
                            }}
                        />
                    </label>

                    {/* Tag filter */}
                    {tags.length > 0 && (
                        <div style={{ display: 'flex', gap: S.sm, flexWrap: 'wrap' }}>
                            {tags.map(t => {
                                const on = t === activeTag;
                                return (
                                    <button
                                        key={t}
                                        type="button"
                                        className="pa-btn"
                                        aria-pressed={on}
                                        onClick={() => setActiveTag(on ? null : t)}
                                        style={{
                                            ...btn('secondary'), padding: '0 12px', fontSize: F.label,
                                            background: on ? T.accentSoft : T.surface2,
                                            color: on ? T.accent : T.textMuted,
                                            borderColor: on ? 'rgba(69,153,255,0.45)' : T.borderHi,
                                        }}
                                    >
                                        #{t}
                                    </button>
                                );
                            })}
                        </div>
                    )}

                    <div style={{ fontSize: F.caption, color: T.textMuted, ...numeric }}>
                        {filtered.length} setup{filtered.length === 1 ? '' : 's'} in {activeFolder || '—'}
                    </div>

                    {filtered.length === 0 ? (
                        <EmptyState
                            compact
                            icon={<Search size={22} strokeWidth={2} />}
                            title="Nothing matches"
                            body="No saved scenario in this folder matches your search or tag filter."
                            action={(
                                <button
                                    type="button"
                                    className="pa-btn"
                                    onClick={() => { setQuery(''); setActiveTag(null); }}
                                    style={btn('secondary')}
                                >
                                    Clear filters
                                </button>
                            )}
                        />
                    ) : (
                        <>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: S.md }}>
                                {visible.map(h => {
                                    const info = stateFor(h);
                                    const confirming = confirmId === h.id;
                                    return (
                                        <div
                                            key={h.id}
                                            style={{
                                                background: T.surface2, border: `1px solid ${T.border}`,
                                                borderRadius: R.md, padding: S.md,
                                                display: 'flex', flexDirection: 'column', gap: S.sm,
                                                boxSizing: 'border-box', width: '100%',
                                            }}
                                        >
                                            <div style={{ display: 'flex', alignItems: 'center', gap: S.sm, flexWrap: 'wrap' }}>
                                                <span style={{ fontSize: F.bodySm, fontWeight: 800, color: T.text, ...numeric }}>
                                                    {info.hero}
                                                </span>
                                                {info.position && <span style={pill('accent')}>{info.position}</span>}
                                                <span style={{ fontSize: F.caption, color: T.textMuted, minWidth: 0, ...numeric }}>
                                                    {info.board}
                                                </span>
                                            </div>

                                            <div style={{ display: 'flex', gap: S.sm, flexWrap: 'wrap', alignItems: 'center' }}>
                                                {(h.tags || []).map(t => (
                                                    <span key={t} style={pill('neutral')}>#{t}</span>
                                                ))}
                                                <span style={{ fontSize: F.caption, color: T.textDim }}>
                                                    {h.created_at ? new Date(h.created_at).toLocaleDateString() : ''}
                                                </span>
                                            </div>

                                            <div style={{ display: 'flex', gap: S.sm, alignItems: 'center' }}>
                                                <button
                                                    type="button"
                                                    className="pa-btn"
                                                    onClick={() => {
                                                        if (!info.loadable) return;
                                                        onLoadTarget?.(parseState(h.state_json));
                                                        onClose?.();
                                                    }}
                                                    disabled={!info.loadable}
                                                    aria-label={info.loadable ? 'Load this scenario into the sandbox' : 'This saved state is unreadable'}
                                                    style={{ ...btn('success', { disabled: !info.loadable }), flex: 1 }}
                                                >
                                                    <Play size={18} strokeWidth={2} />
                                                    {info.loadable ? 'Load in sandbox' : 'Unreadable'}
                                                </button>

                                                {confirming ? (
                                                    <button
                                                        type="button"
                                                        className="pa-btn"
                                                        onClick={() => handleDelete(h)}
                                                        disabled={deletingId === h.id}
                                                        aria-label="Confirm delete"
                                                        style={{ ...btn('danger'), padding: '0 14px', fontSize: F.label }}
                                                    >
                                                        Delete?
                                                    </button>
                                                ) : (
                                                    <button
                                                        type="button"
                                                        className="pa-btn"
                                                        onClick={() => askDelete(h.id)}
                                                        disabled={deletingId === h.id || !h.id}
                                                        aria-label="Delete saved hand"
                                                        style={{ ...btn('danger'), width: 44, minWidth: 44, padding: 0 }}
                                                    >
                                                        <Trash2 size={18} strokeWidth={2} />
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>

                            {visible.length < filtered.length && (
                                <button
                                    type="button"
                                    className="pa-btn"
                                    onClick={() => setPage(p => p + 1)}
                                    style={{ ...btn('secondary', { block: true }) }}
                                >
                                    Load {Math.min(PAGE_SIZE, filtered.length - visible.length)} more
                                </button>
                            )}
                        </>
                    )}
                </div>
            )}
        </BottomSheet>
    );
}
