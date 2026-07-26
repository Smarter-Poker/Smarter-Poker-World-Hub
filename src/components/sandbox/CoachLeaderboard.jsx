/**
 * COACH LEADERBOARD (W5-5)
 * Weekly accuracy leaderboard from sandbox_coach_results.
 * Shows top 10 users by accuracy % (min 20 hands).
 */
import { useState, useEffect, useCallback } from 'react';
import { getAccessToken } from '../../lib/authUtils';

const M = {
    card: '#242526', border: '#3a3b3c',
    cyan: '#4599FF', green: '#00E676', gold: '#F5A623',
    red: '#EF5350', text: '#E4E6EB', sub: '#B0B3B8',
    dim: 'rgba(255,255,255,0.4)',
};

function pctColor(pct) {
    if (pct >= 70) return M.green;
    if (pct >= 50) return M.gold;
    return M.red;
}

const RANK_EMOJI = ['🥇', '🥈', '🥉'];

export default function CoachLeaderboard({ userId }) {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [expanded, setExpanded] = useState(false);

    const load = useCallback(async () => {
        if (!userId) return;
        try {
            const token = getAccessToken();
            const res = await fetch('/api/sandbox/leaderboard', {
                headers: token ? { Authorization: `Bearer ${token}` } : {},
            });
            const json = await res.json().catch(() => null);
            if (json?.success) setData(json);
        } catch (e) {
            console.warn('[CoachLeaderboard] Fetch error:', e);
        } finally {
            setLoading(false);
        }
    }, [userId]);

    useEffect(() => {
        if (!userId) return undefined;
        load();

        // The sandbox dispatches 'sandbox-coach-result-saved' on its own route,
        // so that event never reaches this page. Refetch on tab focus instead.
        const onVisible = () => {
            if (typeof document === 'undefined' || document.visibilityState === 'visible') load();
        };
        window.addEventListener('focus', onVisible);
        document.addEventListener('visibilitychange', onVisible);
        return () => {
            window.removeEventListener('focus', onVisible);
            document.removeEventListener('visibilitychange', onVisible);
        };
    }, [userId, load]);

    if (loading || !data?.leaderboard?.length) return null;

    return (
        <div style={s.card}>
            <button onClick={() => setExpanded(!expanded)} style={s.header}>
                <span style={s.title}>{'🏆 Weekly Leaderboard'}</span>
                <span style={{
                    fontSize: 12, color: M.dim,
                    transform: expanded ? 'rotate(180deg)' : 'none',
                    transition: 'transform 0.2s',
                }}>▼</span>
            </button>

            {expanded && (
                <div style={{ padding: '0 10px 10px' }}>
                    {data.leaderboard.map((entry, i) => {
                        const isMe = entry.user_id === userId;
                        return (
                            <div key={entry.user_id || i} style={{
                                display: 'flex', alignItems: 'center', gap: 8,
                                padding: '6px 8px', borderRadius: 6,
                                background: isMe ? 'rgba(69,153,255,0.08)' : 'transparent',
                                border: isMe ? `1px solid ${M.cyan}33` : '1px solid transparent',
                                marginBottom: 2,
                            }}>
                                <span style={{ fontSize: 12, width: 20, textAlign: 'center' }}>
                                    {i < 3 ? RANK_EMOJI[i] : <span style={{ fontSize: 10, color: M.dim }}>{i + 1}</span>}
                                </span>
                                <span style={{
                                    flex: 1, fontSize: 10, fontWeight: isMe ? 800 : 600,
                                    color: isMe ? M.cyan : M.text,
                                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                }}>
                                    {entry.username || 'Player'}
                                    {isMe && ' (You)'}
                                </span>
                                <span style={{
                                    fontSize: 11, fontWeight: 800,
                                    color: pctColor(entry.accuracy_pct),
                                    fontFamily: '"Orbitron", monospace',
                                }}>
                                    {entry.accuracy_pct}%
                                </span>
                                <span style={{ fontSize: 8, color: M.dim }}>
                                    {entry.total_hands}h
                                </span>
                            </div>
                        );
                    })}

                    {data.userRank && data.userRank > 10 && (
                        <div style={{
                            textAlign: 'center', padding: '6px 0 2px',
                            fontSize: 9, color: M.sub,
                            borderTop: `1px solid ${M.border}`, marginTop: 4,
                        }}>
                            Your rank: #{data.userRank}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

const s = {
    card: {
        background: M.card,
        border: `1px solid ${M.border}`,
        borderRadius: 12,
        overflow: 'hidden',
        marginBottom: 10,
    },
    header: {
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '10px 12px',
        background: 'none', border: 'none', width: '100%',
        cursor: 'pointer',
        outline: 'none', WebkitTapHighlightColor: 'transparent',
    },
    title: {
        fontSize: 13, fontWeight: 700, color: M.text,
        letterSpacing: 0.3,
    },
};
