/**
 * COACH LEADERBOARD (W5-5)
 * Weekly accuracy leaderboard from sandbox_coach_results (min 20 hands).
 *
 * The card shell always renders: skeleton → sign-in → error+retry → "not
 * qualified yet" → the board. The collapsed header previews the caller's own
 * rank so there is a reason to open it.
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/router';
import { Trophy, ChevronDown, Medal } from 'lucide-react';
import { getAccessToken } from '../../lib/authUtils';
import { T, F, S, R, card, btn, pill, numeric } from './paTokens';
import {
    PAStyles, Skeleton, ErrorState, EmptyState, SignInState,
    useThrottledRefresh, useAbortableFetch, isAbortError, buildPracticeHref,
} from './paKit';

const MIN_HANDS = 20;

function pctColor(pct) {
    if (pct >= 70) return T.success;
    if (pct >= 50) return T.warn;
    return T.danger;
}

const RANK_TONE = ['warn', 'neutral', 'purple'];

export default function CoachLeaderboard({ userId }) {
    const router = useRouter();
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [authRequired, setAuthRequired] = useState(false);
    const [expanded, setExpanded] = useState(false);
    const [autoExpanded, setAutoExpanded] = useState(false);
    const abortableFetch = useAbortableFetch();
    const mountedRef = useRef(true);

    useEffect(() => {
        mountedRef.current = true;
        return () => { mountedRef.current = false; };
    }, []);

    useEffect(() => { if (!userId) setLoading(false); }, [userId]);

    const load = useCallback(async () => {
        if (!userId) { setLoading(false); return; }
        setError(null);
        try {
            const token = getAccessToken();
            const res = await abortableFetch('/api/sandbox/leaderboard', {
                headers: token ? { Authorization: `Bearer ${token}` } : {},
            });
            if (!mountedRef.current) return;
            if (res.status === 401) { setAuthRequired(true); return; }
            const json = await res.json().catch(() => null);
            if (!mountedRef.current) return;
            setAuthRequired(false);
            if (json?.success) setData(json);
            else setError(json?.error || `Leaderboard unavailable (${res.status})`);
        } catch (e) {
            if (isAbortError(e) || !mountedRef.current) return;
            console.warn('[CoachLeaderboard] Fetch error:', e);
            setError(e?.message || 'Leaderboard unavailable');
        } finally {
            if (mountedRef.current) setLoading(false);
        }
    }, [userId, abortableFetch]);

    const refresh = useThrottledRefresh(load, {
        enabled: !!userId,
        minIntervalMs: 60000,
        events: ['sandbox-coach-result-saved'],
    });

    // Default to open when the user is actually on the board near the top.
    useEffect(() => {
        if (autoExpanded || !data) return;
        if (data.userRank && data.userRank <= 10) {
            setExpanded(true);
            setAutoExpanded(true);
        }
    }, [data, autoExpanded]);

    const rows = Array.isArray(data?.leaderboard) ? data.leaderboard : [];
    const me = rows.find(r => r?.isYou === true || (r?.user_id && r.user_id === userId));
    const myRank = data?.userRank || (me ? rows.indexOf(me) + 1 : null);

    const header = (
        <button
            type="button"
            className="pa-btn"
            onClick={() => setExpanded(v => !v)}
            aria-expanded={expanded}
            style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                gap: S.sm, width: '100%', minHeight: 44, padding: 0,
                background: 'none', border: 'none', cursor: 'pointer', color: T.text,
            }}
        >
            <span style={{ display: 'flex', alignItems: 'center', gap: S.sm, fontSize: F.h3, fontWeight: 700, minWidth: 0 }}>
                <Trophy size={18} strokeWidth={2} color={T.warn} />
                Weekly Leaderboard
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: S.sm, flexShrink: 0 }}>
                {myRank && (
                    <span style={pill('accent')}>
                        You: #{myRank}{me ? ` · ${me.accuracy_pct}%` : ''}
                    </span>
                )}
                <ChevronDown
                    size={18}
                    strokeWidth={2}
                    color={T.textMuted}
                    style={{ transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }}
                />
            </span>
        </button>
    );

    let body;
    if (loading) {
        body = (
            <div style={{ display: 'flex', flexDirection: 'column', gap: S.sm }} aria-busy="true">
                {[0, 1, 2, 3, 4].map(i => <Skeleton key={i} h={44} />)}
            </div>
        );
    } else if (!userId) {
        body = <SignInState compact title="Sign in to join the leaderboard" body={`Play ${MIN_HANDS} coach hands in a week to be ranked against other players.`} />;
    } else if (authRequired) {
        body = <SignInState compact title="Session expired" body="Sign in again to see this week's ranking." />;
    } else if (error) {
        body = <ErrorState title="Could not load the leaderboard" body={error} onRetry={() => { setLoading(true); refresh(true); }} />;
    } else if (rows.length === 0) {
        body = (
            <EmptyState
                compact
                icon={<Medal size={22} strokeWidth={2} />}
                title="No one has qualified this week yet"
                body={`Play ${MIN_HANDS} coach-mode hands between Monday and Sunday to enter the board — be the first.`}
                action={
                    <button type="button" className="pa-btn" style={btn('primary')} onClick={() => router.push(buildPracticeHref({}))}>
                        Play coach hands
                    </button>
                }
            />
        );
    } else {
        body = (
            <div>
                <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: S.xs }}>
                    {rows.map((entry, i) => {
                        const isMe = entry?.isYou === true || (entry?.user_id && entry.user_id === userId);
                        return (
                            <li
                                key={isMe ? 'me' : `${entry.username || 'player'}-${i}`}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: S.sm,
                                    minHeight: 44, padding: `${S.sm}px ${S.md}px`, borderRadius: R.sm,
                                    background: isMe ? T.accentSoft : T.surface2,
                                    border: `1px solid ${isMe ? 'rgba(69,153,255,0.4)' : T.border}`,
                                    boxSizing: 'border-box',
                                }}
                            >
                                <span style={{
                                    width: 26, flexShrink: 0, textAlign: 'center',
                                    fontSize: F.label, fontWeight: 800,
                                    color: i < 3 ? [T.warn, T.textMuted, T.purple][i] : T.textMuted, ...numeric,
                                }}>
                                    {i + 1}
                                </span>
                                <span style={{
                                    flex: 1, minWidth: 0, fontSize: F.bodySm, fontWeight: isMe ? 800 : 600,
                                    color: isMe ? T.accent : T.text,
                                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                }}>
                                    {entry.username || 'Player'}{isMe ? ' (You)' : ''}
                                </span>
                                {i < 3 && <span style={pill(RANK_TONE[i])}>Top {i + 1}</span>}
                                <span style={{ fontSize: F.bodySm, fontWeight: 800, color: pctColor(entry.accuracy_pct), ...numeric, flexShrink: 0 }}>
                                    {entry.accuracy_pct}%
                                </span>
                                <span style={{ fontSize: F.caption, color: T.textMuted, ...numeric, flexShrink: 0 }}>
                                    {entry.total_hands}h
                                </span>
                            </li>
                        );
                    })}
                </ol>

                {myRank && myRank > 10 && (
                    <p style={{
                        textAlign: 'center', margin: `${S.md}px 0 0`, paddingTop: S.md,
                        borderTop: `1px solid ${T.border}`, fontSize: F.caption, color: T.textMuted, ...numeric,
                    }}>
                        Your rank this week: #{myRank}
                    </p>
                )}

                {!myRank && (
                    <p style={{ margin: `${S.md}px 0 0`, fontSize: F.caption, color: T.textMuted, lineHeight: 1.45 }}>
                        You are not ranked yet — {MIN_HANDS} coach hands this week qualifies you.
                    </p>
                )}

                <button
                    type="button"
                    className="pa-btn"
                    style={{ ...btn('secondary', { block: true }), marginTop: S.md }}
                    onClick={() => router.push(buildPracticeHref({}))}
                >
                    Play coach hands
                </button>
            </div>
        );
    }

    return (
        <div style={{ ...card, marginBottom: S.md }}>
            <PAStyles />
            {header}
            {expanded && <div style={{ marginTop: S.md }}>{body}</div>}
        </div>
    );
}
