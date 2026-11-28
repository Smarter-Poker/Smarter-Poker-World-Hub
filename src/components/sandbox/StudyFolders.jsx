/**
 * STUDY FOLDERS BROWSER (W6-1)
 * ═══════════════════════════════════════════════════════════════════════════
 * Browses saved sandbox scenarios and reloads them into the table.
 *
 * Rebuilt for mobile:
 *   • single column bottom sheet · folders become a snap carousel, hand cards
 *     stack (the old side-by-side row overflowed 375px)
 *   • three distinct failure states: sign-in (401), retry (network/5xx) and a
 *     genuine empty archive · the old code showed "Empty Archive" for all three
 *   • delete is two-step and undoable (re-POSTs the hand for 6 seconds)
 *   • search + tag filter + 20-per-page paging, with state_json parsed once per
 *     hand id instead of on every render
 */
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import toast from 'react-hot-toast';
import { FolderOpen, Play, Trash2, Search, RotateCcw, Copy, Check } from 'lucide-react';
import { getFreshAccessToken } from '../../lib/authUtils';
import { readPersistenceResponse, persistenceMessage } from '../../lib/personal-assistant/persistenceContract';
import { T, F, S, R, btn, pill, numeric } from './paTokens';
import {
    BottomSheet, PAStyles, Skeleton, EmptyState, ErrorState, SignInState,
    useAbortableFetch, isAbortError,
} from './paKit';

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

const UUID_RE = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;
const EMAIL_RE = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const HANDLE_RE = /(^|[\s(])@[A-Za-z0-9_.-]{2,32}\b/g;
const POSITION_WORDS = new Set(['UTG', 'UTG1', 'UTG2', 'LJ', 'MP', 'HJ', 'CO', 'BTN', 'SB', 'BB', 'HERO', 'VILLAIN', 'REG', 'FISH', 'TAG', 'LAG', 'NIT', 'REC', 'PRO', 'UNKNOWN', 'EP', 'LP', 'BU', 'STR', 'STRADDLE']);
const OPPONENT_LABEL_RE = /\b(villain|opponent|player|user|username|handle)\s*[:=]\s*([A-Za-z0-9_.-]{2,32})/gi;
const VS_NAME_RE = /\b(vs\.?|against)\s+([A-Za-z0-9_.-]{2,32})\b/gi;

/**
 * Strictly scrubs UUIDs, email addresses, @handles, and opponent usernames
 * before exporting an anonymized study packet.
 */
export function scrubStudyText(raw) {
    if (raw == null) return '';
    let text = String(raw)
        .replace(/[\u0000-\u001f\u007f]/g, ' ')
        .replace(/\u2014/g, ' - ')
        .replace(UUID_RE, '[Redacted]')
        .replace(EMAIL_RE, '[Redacted]')
        .replace(HANDLE_RE, '$1Villain')
        .replace(OPPONENT_LABEL_RE, (_m, label, candidate) => {
            if (POSITION_WORDS.has(String(candidate || '').toUpperCase())) return `${label}: ${candidate}`;
            return `${label}: Villain`;
        })
        .replace(VS_NAME_RE, (_m, prep, candidate) => {
            if (POSITION_WORDS.has(String(candidate || '').toUpperCase())) return `${prep} ${candidate}`;
            return `${prep} Villain`;
        })
        .replace(/\s+/g, ' ')
        .trim();
    return text;
}

function extractBoardCards(state) {
    if (!state) return [];
    if (Array.isArray(state.board)) return state.board.filter(Boolean).map(String);
    if (state.board && typeof state.board === 'object') {
        const flop = Array.isArray(state.board.flop) ? state.board.flop.filter(Boolean) : [];
        const turn = state.board.turn ? [state.board.turn] : [];
        const river = state.board.river ? [state.board.river] : [];
        return [...flop, ...turn, ...river].map(String);
    }
    if (typeof state.board === 'string' && state.board.trim()) {
        return state.board.trim().split(/[\s,]+/).filter(Boolean);
    }
    return [];
}

function extractHeroCards(state) {
    if (!state) return [];
    const hh = state.heroHand;
    if (Array.isArray(hh)) return hh.filter(Boolean).map(String);
    if (typeof hh === 'string' && hh.trim()) return hh.trim().split(/[\s,]+/).filter(Boolean);
    if (hh && typeof hh === 'object') {
        const ordered = [hh.card1, hh.card2, hh.card3, hh.card4, hh.card5, hh.card6].filter(Boolean);
        if (ordered.length > 0) return ordered.map(String);
    }
    return [];
}

function inferStreet(state, boardCards) {
    const raw = typeof state?.street === 'string' ? state.street.trim() : '';
    if (raw) return raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
    if (boardCards.length >= 5) return 'River';
    if (boardCards.length === 4) return 'Turn';
    if (boardCards.length >= 3) return 'Flop';
    return 'Preflop';
}

function formatPot(state) {
    const potNum = Number(state?.potSize ?? state?.pot);
    if (Number.isFinite(potNum) && potNum > 0) return `${potNum.toFixed(1)} BB`;
    if (typeof state?.pot === 'string' && state.pot.trim()) return scrubStudyText(state.pot);
    return 'Not Set';
}

/**
 * Builds a clean, anonymized Markdown study digest for a Study Folder.
 */
export function buildStudyPacketMarkdown(folderName, folderHands) {
    const safeFolder = scrubStudyText(folderName || 'Study Folder') || 'Study Folder';
    const list = Array.isArray(folderHands) ? folderHands : [];
    const lines = [
        `# Study Packet: ${safeFolder}`,
        `Saved Hands: ${list.length} · Anonymized Study Digest`,
        '',
    ];

    list.forEach((hand, idx) => {
        const state = parseState(hand?.state_json);
        const heroCards = extractHeroCards(state);
        const boardCards = extractBoardCards(state);
        const position = scrubStudyText(state?.heroPosition || 'Unknown').toUpperCase() || 'UNKNOWN';
        const street = inferStreet(state, boardCards);
        const pot = formatPot(state);
        const rawNote = state?.note || state?.notes || hand?.note || hand?.notes || '';
        const cleanNote = scrubStudyText(rawNote);
        const cleanTags = Array.isArray(hand?.tags)
            ? hand.tags.map(t => scrubStudyText(t)).filter(Boolean)
            : [];

        lines.push(`## Hand ${idx + 1}: ${position} (${heroCards.length ? heroCards.join(' ') : 'No Cards'})`);
        lines.push(`- Street: ${street}`);
        lines.push(`- Position: ${position}`);
        lines.push(`- Hero Cards: ${heroCards.length ? heroCards.join(' ') : 'Not Set'}`);
        lines.push(`- Board: ${boardCards.length ? boardCards.join(' ') : 'Preflop'}`);
        lines.push(`- Pot: ${pot}`);
        if (cleanTags.length > 0) {
            lines.push(`- Tags: ${cleanTags.map(t => `#${t}`).join(', ')}`);
        }
        if (cleanNote) {
            lines.push(`- Notes: ${cleanNote}`);
        }
        lines.push('');
    });

    lines.push('*Anonymized Study Digest · Smarter.Poker Club Arena*');
    return lines.join('\n');
}

async function copyTextToClipboard(text) {
    if (typeof navigator !== 'undefined' && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        await navigator.clipboard.writeText(text);
        return true;
    }
    if (typeof document !== 'undefined') {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.setAttribute('readonly', '');
        ta.style.position = 'fixed';
        ta.style.top = '-9999px';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        const ok = document.execCommand('copy');
        document.body.removeChild(ta);
        if (ok) return true;
    }
    throw new Error('Clipboard unavailable');
}

function describe(state) {
    const boardList = extractBoardCards(state);
    const board = boardList.join(' ') || 'Preflop';
    const heroList = extractHeroCards(state);
    const hero = heroList.length ? heroList.join('') : 'Unknown';
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
    const [blockedMessage, setBlockedMessage] = useState(null);
    const [fetchError, setFetchError] = useState(null);
    const [activeFolder, setActiveFolder] = useState(null);
    const [deletingId, setDeletingId] = useState(null);
    const [confirmId, setConfirmId] = useState(null);
    const [query, setQuery] = useState('');
    const [activeTag, setActiveTag] = useState(null);
    const [page, setPage] = useState(1);
    const [copiedFolder, setCopiedFolder] = useState(null);

    const confirmTimer = useRef(null);
    const copyTimer = useRef(null);
    const parseCache = useRef(new Map());
    const fetchRequestId = useRef(0);
    const requestHands = useAbortableFetch(12000);
    const requestMutation = useAbortableFetch(12000);

    useEffect(() => () => {
        fetchRequestId.current += 1;
        if (confirmTimer.current) clearTimeout(confirmTimer.current);
        if (copyTimer.current) clearTimeout(copyTimer.current);
    }, []);

    const stateFor = useCallback((hand) => {
        const key = hand?.id ?? JSON.stringify(hand?.state_json || {}).slice(0, 64);
        const cache = parseCache.current;
        if (!cache.has(key)) cache.set(key, describe(parseState(hand?.state_json)));
        return cache.get(key);
    }, []);

    const fetchHands = useCallback(async () => {
        const requestId = ++fetchRequestId.current;
        setLoading(true);
        setAuthError(false);
        setBlockedMessage(null);
        setFetchError(null);
        try {
            const token = await getFreshAccessToken();
            if (requestId !== fetchRequestId.current) return;
            if (!token) {
                setAuthError(true);
                setHands([]);
                return;
            }
            const headers = { Authorization: `Bearer ${token}` };

            const res = await requestHands('/api/sandbox/saved-hands', { headers, timeoutMs: 12000 });
            if (requestId !== fetchRequestId.current) return;
            if (res.status === 401) {
                setAuthError(true);
                setHands([]);
                return;
            }
            const json = await res.json().catch(() => null);
            if (requestId !== fetchRequestId.current) return;
            if (res.status === 403 && json?.blocked) {
                setBlockedMessage(json.error || 'Study Folders Are Unavailable During Active Play.');
                setHands([]);
                return;
            }
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
            if (isAbortError(err) || requestId !== fetchRequestId.current) return;
            console.warn('[StudyFolders] fetch error:', err?.message || err);
            setFetchError('Could not reach your saved scenarios.');
        } finally {
            if (requestId === fetchRequestId.current) setLoading(false);
        }
    }, [requestHands]);

    useEffect(() => {
        fetchHands();
        const onSaved = () => fetchHands();
        window.addEventListener('sandbox-hand-saved', onSaved);
        return () => window.removeEventListener('sandbox-hand-saved', onSaved);
    }, [fetchHands]);

    // ── delete with undo ──────────────────────────────────────────────────
    const restoreHand = useCallback(async (hand) => {
        try {
            const token = await getFreshAccessToken();
            if (!token) {
                toast.error('Sign In Again To Restore Saved Hands');
                return;
            }
            const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
            const res = await requestMutation('/api/sandbox/save-hand', {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    folder_name: hand.folder_name,
                    tags: hand.tags || [],
                    state_json: parseState(hand.state_json),
                }),
                timeoutMs: 12000,
            });
            const result = await readPersistenceResponse(res);
            if (result.success && result.persisted) {
                toast.success('Scenario Restored');
                fetchHands();
            } else {
                toast.error(persistenceMessage(result, 'Could not restore that scenario'));
            }
        } catch (e) {
            if (isAbortError(e)) return;
            console.warn('[StudyFolders] restore error:', e?.message || e);
            toast.error('Could Not Confirm Restore. Refreshing Your Saved Folders.');
            fetchHands();
        }
    }, [fetchHands, requestMutation]);

    const handleDelete = useCallback(async (hand) => {
        const id = hand?.id;
        if (!id) return;
        setDeletingId(id);
        setConfirmId(null);
        try {
            const token = await getFreshAccessToken();
            if (!token) {
                toast.error('Sign In Again To Delete Saved Hands');
                return;
            }
            const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };

            const res = await requestMutation('/api/sandbox/save-hand', {
                method: 'DELETE',
                headers,
                body: JSON.stringify({ id }),
                timeoutMs: 12000,
            });
            const result = await readPersistenceResponse(res);
            if (result.success && result.persisted) {
                // The active folder can vanish with its last hand · the effect
                // below re-points it once `folders` recomputes.
                setHands(prev => prev.filter(h => h.id !== id));
                window.dispatchEvent(new CustomEvent('sandbox-hand-deleted', { detail: { id } }));
                toast((t) => (
                    <span style={{ display: 'flex', alignItems: 'center', gap: S.sm, fontSize: F.bodySm }}>
                        Scenario Deleted
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
                toast.error('Sign In Again To Delete Saved Hands');
            } else {
                toast.error(persistenceMessage(result, 'Could not delete that scenario'));
            }
        } catch (err) {
            if (isAbortError(err)) return;
            console.warn('[StudyFolders] Delete error:', err);
            toast.error('Could Not Confirm Delete. Refreshing Server State.');
            fetchHands();
        } finally {
            setDeletingId(null);
        }
    }, [restoreHand, requestMutation, fetchHands]);

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

    const handleCopyStudyPacket = useCallback(async (targetFolderName) => {
        const folderToCopy = targetFolderName || activeFolder;
        if (!folderToCopy) return;
        const targetHands = hands.filter(h => h.folder_name === folderToCopy);
        if (targetHands.length === 0) {
            toast.error('No Saved Hands In This Folder To Copy');
            return;
        }
        try {
            const markdown = buildStudyPacketMarkdown(folderToCopy, targetHands);
            await copyTextToClipboard(markdown);
            setCopiedFolder(folderToCopy);
            if (copyTimer.current) clearTimeout(copyTimer.current);
            copyTimer.current = setTimeout(() => setCopiedFolder(null), 2200);
            toast.success(`Study Packet Copied (${targetHands.length} ${targetHands.length === 1 ? 'Hand' : 'Hands'})`);
        } catch (err) {
            console.warn('[StudyFolders] Copy study packet failed:', err?.message || err);
            toast.error('Could Not Copy Study Packet To Clipboard');
        }
    }, [activeFolder, hands]);

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
            ) : blockedMessage ? (
                <ErrorState title="Active Play Restriction" body={blockedMessage} onRetry={fetchHands} retryLabel="Recheck Status" />
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
                    body='Use "Save to folder" in the sandbox menu to start building your study library.'
                    action={<button type="button" className="pa-btn" onClick={onClose} style={btn('primary')}>Back To The Table</button>}
                />
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: S.md }}>
                    {/* Folder chips (wrapped, no hidden horizontal rail) */}
                    <div
                        role="tablist"
                        aria-label="Folders"
                        style={{
                            display: 'flex', gap: S.sm, flexWrap: 'wrap', paddingBottom: S.xs,
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
                                        borderColor: on ? 'rgba(99,231,255,0.45)' : T.borderHi,
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
                        <span className="pa-vh">Search Saved Scenarios</span>
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
                                            borderColor: on ? 'rgba(99,231,255,0.45)' : T.borderHi,
                                        }}
                                    >
                                        #{t}
                                    </button>
                                );
                            })}
                        </div>
                    )}

                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: S.sm, flexWrap: 'wrap' }}>
                        <div style={{ fontSize: F.caption, color: T.textMuted, ...numeric }}>
                            {`${filtered.length} ${filtered.length === 1 ? 'Setup' : 'Setups'} In ${activeFolder || 'Not Available'}`}
                        </div>
                        {activeFolder && folderHands.length > 0 && (
                            <button
                                type="button"
                                className="pa-btn"
                                data-copy-study-packet="true"
                                data-folder-name={activeFolder}
                                onClick={() => handleCopyStudyPacket(activeFolder)}
                                aria-label={`Copy Anonymized Study Packet For ${activeFolder}`}
                                style={{
                                    ...btn('secondary'),
                                    padding: '0 14px',
                                    fontSize: F.label,
                                    minHeight: 44,
                                    color: copiedFolder === activeFolder ? T.success : T.accent,
                                    borderColor: copiedFolder === activeFolder ? 'rgba(77,224,165,0.45)' : 'rgba(99,231,255,0.42)',
                                }}
                            >
                                {copiedFolder === activeFolder ? <Check size={16} strokeWidth={2} /> : <Copy size={16} strokeWidth={2} />}
                                {copiedFolder === activeFolder ? 'Packet Copied' : 'Copy Study Packet'}
                            </button>
                        )}
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
                                    Clear Filters
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
                                    Load {Math.min(PAGE_SIZE, filtered.length - visible.length)} More
                                </button>
                            )}
                        </>
                    )}
                </div>
            )}
        </BottomSheet>
    );
}
