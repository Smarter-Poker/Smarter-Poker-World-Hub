/**
 * LiveActivityFeed — Friends Currently At The Table
 * ═══════════════════════════════════════════════════════════════════════════
 * Shows active live sessions from friends and public players.
 * Each card displays: avatar, username, venue, game, stakes, duration, profit.
 * Includes "Sweat My Session" link to spectator view with chat.
 * ═══════════════════════════════════════════════════════════════════════════
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { getAccessToken, getFreshAccessToken } from '../../lib/authUtils';
import dynamic from 'next/dynamic';

const SpectatorView = dynamic(() => import('./SpectatorView'), { ssr: false });

const T = {
    bg: '#0a0a0a', card: '#18191a', border: '#3E4042',
    text: '#E4E6EB', textSec: '#B0B3B8', textDim: '#65676B',
    green: '#2ECC71', red: '#E74C3C', gold: '#FFD700',
    accent: '#4facfe',
};

function formatDuration(startedAt) {
    if (!startedAt) return '0m';
    const s = Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export default function LiveActivityFeed({ currentUser }) {
    const [sessions, setSessions] = useState([]);
    const [publicSessions, setPublicSessions] = useState([]);
    const [loading, setLoading] = useState(true);
    const [tab, setTab] = useState('friends');
    const [spectatingSession, setSpectatingSession] = useState(null);
    const [elapsed, setElapsed] = useState({});
    const intervalRef = useRef(null);

    const fetchSessions = useCallback(async () => {
        try {
            // BUG-FIX-DEEP-AUDIT-R5 LAF-3: this component is long-running
            // (60s polling interval) so a viewer leaving the tab open for
            // an hour will have a stale token. Use getFreshAccessToken
            // to refresh before the request — falling back to the cached
            // one if the refresh path isn't available.
            const token = (await getFreshAccessToken()) || getAccessToken();
            if (!token) { setLoading(false); return; }
            const headers = { Authorization: `Bearer ${token}` };

            const [friendRes, publicRes] = await Promise.all([
                fetch('/api/social/live-session?type=friends', { headers }),
                fetch('/api/social/live-session?type=public', { headers }),
            ]);

            if (friendRes.ok) {
                const { sessions: fs } = await friendRes.json();
                setSessions(fs || []);
            }
            if (publicRes.ok) {
                const { sessions: ps } = await publicRes.json();
                setPublicSessions(ps || []);
            }
        } catch (err) {
            console.warn('[LiveFeed] Error:', err);
        }
        setLoading(false);
    }, []);

    useEffect(() => { fetchSessions(); }, [fetchSessions]);

    // Refresh every 60s
    useEffect(() => {
        const id = setInterval(fetchSessions, 60000);
        return () => clearInterval(id);
    }, [fetchSessions]);

    // Elapsed time ticker
    useEffect(() => {
        intervalRef.current = setInterval(() => {
            const all = [...sessions, ...publicSessions];
            const e = {};
            all.forEach(s => { e[s.id] = formatDuration(s.started_at); });
            setElapsed(e);
        }, 30000);
        // Initial
        const all = [...sessions, ...publicSessions];
        const e = {};
        all.forEach(s => { e[s.id] = formatDuration(s.started_at); });
        setElapsed(e);
        return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
    }, [sessions, publicSessions]);

    const activeSessions = tab === 'friends' ? sessions : publicSessions;

    if (spectatingSession) {
        return <SpectatorView session={spectatingSession} currentUser={currentUser} onClose={() => setSpectatingSession(null)} />;
    }

    return (
        <div style={{
            background: T.card, borderRadius: 12, padding: 16, marginBottom: 16,
            border: `1px solid ${T.border}`,
        }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ fontSize: 18 }}>🟢</div>
                    <div>
                        <div style={{ color: T.text, fontSize: 16, fontWeight: 700 }}>LIVE SESSIONS</div>
                        <div style={{ color: T.textSec, fontSize: 11 }}>Friends At The Table Right Now</div>
                    </div>
                </div>
                <div style={{
                    background: 'rgba(46,204,113,0.15)', color: T.green,
                    padding: '4px 10px', borderRadius: 12, fontSize: 12, fontWeight: 700,
                }}>
                    {sessions.length + publicSessions.length} Live
                </div>
            </div>

            {/* Tabs */}
            <div style={{ display: 'flex', gap: 4, marginBottom: 12 }}>
                {['friends', 'public'].map(t => (
                    <button key={t} onClick={() => setTab(t)} style={{
                        flex: 1, padding: '6px 0', borderRadius: 8, border: 'none',
                        background: tab === t ? 'rgba(79,172,254,0.12)' : 'transparent',
                        color: tab === t ? T.accent : T.textSec,
                        fontSize: 12, fontWeight: 700, cursor: 'pointer',
                        textTransform: 'capitalize',
                    }}>
                        {t === 'friends' ? `Friends (${sessions.length})` : `Public (${publicSessions.length})`}
                    </button>
                ))}
            </div>

            {/* Loading */}
            {loading && <div style={{ color: T.textSec, textAlign: 'center', padding: 20, fontSize: 13 }}>Loading live sessions...</div>}

            {/* Empty state */}
            {!loading && activeSessions.length === 0 && (
                <div style={{ textAlign: 'center', padding: '20px 0' }}>
                    <div style={{ color: T.textSec, fontSize: 13 }}>
                        {tab === 'friends'
                            ? 'No Friends Are Live Right Now. Start A Session To Let Them Know!'
                            : 'No public sessions right now.'}
                    </div>
                </div>
            )}

            {/* Session cards */}
            {activeSessions.map(s => {
                // BUG-FIX-DEEP-AUDIT-R5 LAF-4: coerce to number and gate
                // NaN/Infinity. The previous `|| 0` lets NaN through
                // because `NaN || 0` → 0, but `s.current_profit` could
                // be a string from API ('+12.5'), which numerically is
                // already fine for `>=` but renders unchanged. Defend.
                const rawProfit = s.current_profit;
                const profit = Number.isFinite(rawProfit) ? rawProfit : (Number.isFinite(Number(rawProfit)) ? Number(rawProfit) : 0);
                return (
                    <div key={s.id} style={{
                        background: 'rgba(255,255,255,0.03)', borderRadius: 10, padding: 12,
                        marginBottom: 8, border: `1px solid ${T.border}`,
                        display: 'flex', alignItems: 'center', gap: 12,
                    }}>
                        {/* Avatar */}
                        <div style={{
                            width: 44, height: 44, borderRadius: 22, overflow: 'hidden',
                            border: `2px solid ${s.status === 'break' ? T.gold : T.green}`,
                            flexShrink: 0, position: 'relative',
                        }}>
                            <img src={s.profiles?.avatar_url || '/avatars/default.png'}
                                alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} loading="lazy" />
                            {/* Status dot */}
                            <div style={{
                                position: 'absolute', bottom: -1, right: -1,
                                width: 12, height: 12, borderRadius: 6,
                                background: s.status === 'break' ? T.gold : T.green,
                                border: '2px solid #18191a',
                            }} />
                        </div>

                        {/* Details */}
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ color: T.text, fontSize: 14, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {s.profiles?.full_name || s.profiles?.username || 'Player'}
                            </div>
                            <div style={{ color: T.textSec, fontSize: 11 }}>
                                {s.venue_name} — {s.stakes} {s.game_type}
                            </div>
                            <div style={{ display: 'flex', gap: 8, marginTop: 2, fontSize: 10 }}>
                                <span style={{ color: T.textDim }}>{elapsed[s.id] || formatDuration(s.started_at)}</span>
                                {s.status === 'break' && <span style={{ color: T.gold, fontWeight: 700 }}>ON BREAK</span>}
                            </div>
                        </div>

                        {/* Profit + Sweat */}
                        <div style={{ textAlign: 'right', flexShrink: 0 }}>
                            <div style={{
                                fontSize: 16, fontWeight: 800,
                                color: profit >= 0 ? T.green : T.red,
                            }}>
                                {profit >= 0 ? '+' : ''}{profit}
                            </div>
                            <button onClick={() => setSpectatingSession(s)} style={{
                                background: 'none', border: 'none', color: T.accent,
                                fontSize: 10, fontWeight: 700, cursor: 'pointer', marginTop: 2,
                                padding: 0,
                            }}>
                                Sweat Session
                            </button>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
