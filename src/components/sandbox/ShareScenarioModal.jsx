/**
 * SHARE SCENARIO MODAL (W6-2: Hardened Internal Sharing)
 * ═══════════════════════════════════════════════════════════════════════════
 * Internal sharing for authored Virtual Sandbox scenarios:
 *   1. Post an ungraded scenario summary to the Smarter.Poker Study Feed
 *      (POST /api/sandbox/social-export, verified via readPersistenceResponse
 *      and `result.success && result.persisted`).
 *   2. Copy structured scenario text or JSON for internal study groups.
 *   3. Audit & revoke any historical /sandbox/[id] links on the user's account
 *      (GET / DELETE /api/sandbox/create-share) while honestly noting that new
 *      unsealed public snapshot links are retired.
 */
import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import toast from 'react-hot-toast';
import { Share2, Copy, Check, Send, Trash2, ShieldAlert, FileCode } from 'lucide-react';
import { getFreshAccessToken } from '../../lib/authUtils';
import { readPersistenceResponse, persistenceMessage } from '../../lib/personal-assistant/persistenceContract';
import { T, F, S, R, btn, pill } from './paTokens';
import { BottomSheet, PAStyles, ErrorState, Skeleton, useAbortableFetch, isAbortError } from './paKit';

function formatScenarioSummary(state) {
    if (!state || typeof state !== 'object') return 'Virtual Sandbox Scenario (Ungraded Study)';
    const hero = state.heroHand?.card1 && state.heroHand?.card2
        ? `${state.heroHand.card1}${state.heroHand.card2}`
        : 'No Hero Cards';
    const boardCards = Array.isArray(state.board)
        ? state.board.filter(Boolean)
        : [...(state.board?.flop || []), state.board?.turn, state.board?.river].filter(Boolean);
    const boardText = boardCards.length ? boardCards.join(' ') : 'Preflop';
    const pos = state.heroPosition || 'BTN';
    const stack = Number.isFinite(Number(state.heroStack)) ? `${Math.round(Number(state.heroStack))} BB` : '100 BB';
    const pot = Number.isFinite(Number(state.potSize)) ? `${Number(state.potSize).toFixed(1)} BB` : '6.5 BB';
    const villains = Array.isArray(state.villains) && state.villains.length
        ? state.villains.map((v) => `${v.position || 'BB'} (${v.archetype?.name || 'GTO Neutral'})`).join(', ')
        : 'BB (GTO Neutral)';
    const line = Array.isArray(state.actionHistory) && state.actionHistory.length
        ? state.actionHistory.map((a) => `${a.actor === 'hero' ? 'Hero' : 'Villain'} ${a.action || a.label || ''}`.trim()).join(' -> ')
        : 'No Actions Logged';
    return [
        `Virtual Sandbox Scenario (Ungraded Study)`,
        `Hero: ${hero} (${pos}, ${stack}) | Pot: ${pot}`,
        `Board: ${boardText}`,
        `Villains: ${villains}`,
        `Line: ${line}`,
    ].join('\n');
}

export default function ShareScenarioModal({ onClose, sandboxState }) {
    const [note, setNote] = useState('');
    const [posting, setPosting] = useState(false);
    const [posted, setPosted] = useState(false);
    const [postError, setPostError] = useState(null);
    const [copiedKind, setCopiedKind] = useState(null);

    const [links, setLinks] = useState([]);
    const [linksLoading, setLinksLoading] = useState(true);
    const [linksError, setLinksError] = useState(null);
    const [revokingId, setRevokingId] = useState(null);

    const mountedRef = useRef(true);
    const copyTimer = useRef(null);
    const linksReqId = useRef(0);
    const requestLinks = useAbortableFetch(12000);
    const requestPost = useAbortableFetch(12000);
    const requestRevoke = useAbortableFetch(12000);

    const summaryText = useMemo(() => formatScenarioSummary(sandboxState), [sandboxState]);
    const jsonText = useMemo(() => {
        try {
            return JSON.stringify(sandboxState || {}, null, 2);
        } catch {
            return '{}';
        }
    }, [sandboxState]);

    useEffect(() => {
        mountedRef.current = true;
        return () => {
            mountedRef.current = false;
            linksReqId.current += 1;
            if (copyTimer.current) clearTimeout(copyTimer.current);
        };
    }, []);

    const loadHistoricalLinks = useCallback(async () => {
        const reqId = ++linksReqId.current;
        setLinksLoading(true);
        setLinksError(null);
        try {
            const token = await getFreshAccessToken();
            if (reqId !== linksReqId.current) return;
            if (!token) {
                setLinks([]);
                return;
            }
            const res = await requestLinks('/api/sandbox/create-share', {
                headers: { Authorization: `Bearer ${token}` },
                timeoutMs: 12000,
            });
            if (reqId !== linksReqId.current) return;
            if (res.status === 401) {
                setLinks([]);
                return;
            }
            const json = await res.json().catch(() => null);
            if (reqId !== linksReqId.current) return;
            if (res.ok && json?.success) {
                setLinks(Array.isArray(json.shares) ? json.shares : []);
            } else {
                setLinksError(json?.error || 'Historical Link List Is Temporarily Unavailable.');
            }
        } catch (err) {
            if (isAbortError(err) || reqId !== linksReqId.current) return;
            setLinksError('Could Not Reach Historical Share Links.');
        } finally {
            if (reqId === linksReqId.current) setLinksLoading(false);
        }
    }, [requestLinks]);

    useEffect(() => {
        loadHistoricalLinks();
    }, [loadHistoricalLinks]);

    const copyText = useCallback(async (text, kind) => {
        if (typeof navigator?.clipboard?.writeText !== 'function') {
            toast.error('Clipboard Is Unavailable In This Browser');
            return;
        }
        try {
            await navigator.clipboard.writeText(text);
            setCopiedKind(kind);
            if (copyTimer.current) clearTimeout(copyTimer.current);
            copyTimer.current = setTimeout(() => setCopiedKind(null), 2200);
            toast.success(kind === 'json' ? 'Scenario JSON Copied' : 'Scenario Summary Copied');
        } catch {
            toast.error('Could Not Copy To Clipboard');
        }
    }, []);

    const handlePostToStudyFeed = useCallback(async () => {
        setPosting(true);
        setPostError(null);
        try {
            const token = await getFreshAccessToken();
            if (!mountedRef.current) return;
            if (!token) {
                setPostError('Sign In To Share Scenarios To The Smarter.Poker Study Feed.');
                return;
            }
            const content = note.trim()
                ? `${note.trim()}\n\n${summaryText}`.slice(0, 500)
                : summaryText.slice(0, 500);

            const res = await requestPost('/api/sandbox/social-export', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({
                    handCount: 1,
                    evLoss: null,
                    content,
                    metadata: {
                        ungraded: true,
                        authority: 'authored-sandbox-ungraded',
                        heroPosition: sandboxState?.heroPosition || null,
                    },
                }),
                timeoutMs: 12000,
            });
            const result = await readPersistenceResponse(res);
            if (!mountedRef.current) return;

            if (res.status === 401) {
                setPostError('Sign In To Share Scenarios To The Smarter.Poker Study Feed.');
                return;
            }
            if (result.success && result.persisted) {
                setPosted(true);
                toast.success('Shared To Smarter.Poker Study Feed');
                return;
            }
            setPostError(persistenceMessage(result, 'Could Not Publish This Scenario.'));
        } catch (err) {
            if (isAbortError(err) || !mountedRef.current) return;
            setPostError('Request Timed Out Or Dropped. Check Your Feed Before Retrying.');
        } finally {
            if (mountedRef.current) setPosting(false);
        }
    }, [note, summaryText, sandboxState, requestPost]);

    const handleRevoke = useCallback(async (id) => {
        if (!id) return;
        setRevokingId(id);
        try {
            const token = await getFreshAccessToken();
            if (!token) {
                toast.error('Sign In Again To Revoke Historical Links');
                return;
            }
            const res = await requestRevoke(`/api/sandbox/create-share/${encodeURIComponent(id)}`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${token}` },
                timeoutMs: 12000,
            });
            const result = await readPersistenceResponse(res);
            if (!mountedRef.current) return;
            if (result.success && result.persisted) {
                setLinks((prev) => prev.filter((item) => item.id !== id));
                toast.success('Historical Share Link Revoked');
            } else if (res.status === 404) {
                setLinks((prev) => prev.filter((item) => item.id !== id));
                toast.success('Historical Link Already Removed');
            } else {
                toast.error(persistenceMessage(result, 'Could Not Revoke Historical Link'));
            }
        } catch (err) {
            if (isAbortError(err) || !mountedRef.current) return;
            toast.error('Could Not Confirm Revocation. Refreshing Links.');
            loadHistoricalLinks();
        } finally {
            if (mountedRef.current) setRevokingId(null);
        }
    }, [requestRevoke, loadHistoricalLinks]);

    return (
        <BottomSheet
            open
            onClose={onClose}
            title="Internal Scenario Sharing"
            titleIcon={<Share2 size={18} strokeWidth={2} color={T.accent} />}
            subtitle="Share Ungraded Scenarios Internally Or Copy Structured Study Notes."
            ariaLabel="Share scenario internally"
            footer={(
                <button type="button" className="pa-btn" onClick={onClose} style={btn('secondary', { block: true })}>
                    Done
                </button>
            )}
        >
            <PAStyles />

            <div style={{ display: 'flex', flexDirection: 'column', gap: S.lg }}>
                <div style={{
                    background: T.surface2, border: `1px solid ${T.border}`, borderRadius: R.sm,
                    padding: S.md,
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: S.sm, marginBottom: S.sm }}>
                        <span style={{ fontSize: F.label, fontWeight: 700, color: T.text }}>Scenario Summary</span>
                        <span style={pill('accent')}>Ungraded Study</span>
                    </div>
                    <pre
                        data-pa-verbatim="true"
                        style={{
                            margin: 0, fontSize: F.caption, color: T.textMuted, lineHeight: 1.5,
                            whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                        }}
                    >
                        {summaryText}
                    </pre>
                    <div style={{ display: 'flex', gap: S.sm, flexWrap: 'wrap', marginTop: S.md }}>
                        <button
                            type="button"
                            className="pa-btn"
                            onClick={() => copyText(summaryText, 'summary')}
                            style={{ ...btn('secondary'), flex: '1 1 140px', fontSize: F.label }}
                        >
                            {copiedKind === 'summary' ? <Check size={16} strokeWidth={2.5} /> : <Copy size={16} strokeWidth={2} />}
                            {copiedKind === 'summary' ? 'Copied Summary' : 'Copy Summary'}
                        </button>
                        <button
                            type="button"
                            className="pa-btn"
                            onClick={() => copyText(jsonText, 'json')}
                            style={{ ...btn('secondary'), flex: '1 1 140px', fontSize: F.label }}
                        >
                            {copiedKind === 'json' ? <Check size={16} strokeWidth={2.5} /> : <FileCode size={16} strokeWidth={2} />}
                            {copiedKind === 'json' ? 'Copied JSON' : 'Copy JSON'}
                        </button>
                    </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: S.sm }}>
                    <label htmlFor="share-feed-note" style={{ fontSize: F.label, fontWeight: 700, color: T.text }}>
                        Share To Smarter.Poker Study Feed
                    </label>
                    <textarea
                        id="share-feed-note"
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        rows={2}
                        placeholder="Add A Study Question Or Context Note (Optional)"
                        style={{
                            width: '100%', minHeight: 72, padding: S.md, boxSizing: 'border-box',
                            background: T.surface2, border: `1px solid ${T.borderHi}`, borderRadius: R.sm,
                            color: T.text, fontSize: F.input, fontFamily: 'inherit', resize: 'vertical',
                        }}
                    />
                    {postError && (
                        <ErrorState title="Could Not Publish" body={postError} onRetry={handlePostToStudyFeed} />
                    )}
                    <button
                        type="button"
                        className="pa-btn"
                        onClick={handlePostToStudyFeed}
                        disabled={posting || posted}
                        style={btn('primary', { block: true, disabled: posting || posted })}
                    >
                        {posted ? <Check size={18} strokeWidth={2.5} /> : <Send size={18} strokeWidth={2} />}
                        {posted ? 'Shared To Study Feed' : posting ? 'Sharing…' : 'Post To Study Feed'}
                    </button>
                </div>

                <div style={{
                    background: T.surface2, border: `1px solid ${T.border}`, borderRadius: R.sm,
                    padding: S.md, display: 'flex', flexDirection: 'column', gap: S.sm,
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: S.sm }}>
                        <ShieldAlert size={16} strokeWidth={2} color={T.accent} />
                        <span style={{ fontSize: F.label, fontWeight: 700, color: T.text }}>
                            Legacy Public Links Retired
                        </span>
                    </div>
                    <p style={{ margin: 0, fontSize: F.caption, color: T.textMuted, lineHeight: 1.45 }}>
                        Unsealed Public Snapshot Links Are Retired. Use Internal Study Feed Sharing, Scenario JSON, Or
                        Study Folders Instead. Historical Links On Your Account Can Still Be Revoked Below.
                    </p>

                    {linksLoading ? (
                        <Skeleton h={36} />
                    ) : linksError ? (
                        <ErrorState title="Link History Unavailable" body={linksError} onRetry={loadHistoricalLinks} />
                    ) : links.length > 0 ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: S.xs }}>
                            {links.map((item) => (
                                <div
                                    key={item.id}
                                    style={{
                                        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: S.sm,
                                        padding: S.sm, borderRadius: R.sm, background: T.surface,
                                        border: `1px solid ${T.border}`,
                                    }}
                                >
                                    <div style={{ minWidth: 0 }}>
                                        <div style={{ fontSize: F.bodySm, fontWeight: 700, color: T.text }}>{item.url || `/sandbox/${item.id}`}</div>
                                        <div style={{ fontSize: F.caption, color: T.textDim }}>
                                            {item.created_at ? new Date(item.created_at).toLocaleDateString() : 'Historical Link'}
                                        </div>
                                    </div>
                                    <button
                                        type="button"
                                        className="pa-btn"
                                        onClick={() => handleRevoke(item.id)}
                                        disabled={revokingId === item.id}
                                        style={{ ...btn('danger', { disabled: revokingId === item.id }), padding: '0 12px', fontSize: F.caption }}
                                    >
                                        <Trash2 size={14} strokeWidth={2} />
                                        {revokingId === item.id ? 'Revoking…' : 'Revoke'}
                                    </button>
                                </div>
                            ))}
                        </div>
                    ) : null}
                </div>
            </div>
        </BottomSheet>
    );
}
