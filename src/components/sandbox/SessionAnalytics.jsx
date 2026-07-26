/**
 * SESSION ANALYTICS DASHBOARD
 * Aggregated coach mode analytics: accuracy trend, position stats, street breakdown.
 * Renders as a collapsible card in the Personal Assistant hub or Leak Finder.
 */
import { useState, useEffect, useCallback } from 'react';
import { getAccessToken } from '../../lib/authUtils';

const M = {
    bg: '#1a1d21', card: '#242526', border: '#3a3b3c',
    cyan: '#4599FF', green: '#00E676', red: '#EF5350',
    gold: '#F5A623', dim: 'rgba(255,255,255,0.4)',
    text: '#E4E6EB', sub: '#B0B3B8',
};

function pctColor(pct) {
    if (pct == null) return M.dim;
    if (pct >= 70) return M.green;
    if (pct >= 50) return M.gold;
    return M.red;
}

/**
 * Mini sparkline bar chart (pure CSS, no dependencies)
 */
function Sparkline({ data }) {
    if (!data?.length) return null;
    const max = Math.max(...data.map(d => d.total), 1);
    return (
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 32 }}>
            {data.map((d, i) => (
                <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1, minWidth: 0 }}>
                    <div style={{
                        width: '100%', maxWidth: 14,
                        height: Math.max(3, (d.total / max) * 28),
                        borderRadius: 2,
                        background: pctColor(d.pct),
                        opacity: 0.85,
                        transition: 'height 0.3s ease',
                    }} />
                </div>
            ))}
        </div>
    );
}

/**
 * Position stat badge
 */
function PosBadge({ pos, pct, total, isTop, isWeak }) {
    const col = pctColor(pct);
    return (
        <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
            padding: '6px 4px', borderRadius: 6,
            background: isTop ? 'rgba(0,230,118,0.08)' : isWeak ? 'rgba(239,83,80,0.08)' : 'rgba(255,255,255,0.03)',
            border: `1px solid ${isTop ? M.green + '44' : isWeak ? M.red + '44' : M.border}`,
            minWidth: 44,
        }}>
            <span style={{ fontSize: 10, fontWeight: 800, color: col, fontFamily: '"Orbitron", monospace' }}>{pct}%</span>
            <span style={{ fontSize: 8, fontWeight: 700, color: M.sub, letterSpacing: 0.5 }}>{pos}</span>
            <span style={{ fontSize: 7, color: M.dim }}>{total} hands</span>
        </div>
    );
}

export default function SessionAnalytics({ userId }) {
    const [stats, setStats] = useState(null);
    const [loading, setLoading] = useState(true);
    const [expanded, setExpanded] = useState(true);

    const load = useCallback(async () => {
        if (!userId) return;
        try {
            const token = getAccessToken();
            const res = await fetch('/api/sandbox/session-stats', {
                headers: token ? { Authorization: `Bearer ${token}` } : {},
            });
            const json = await res.json().catch(() => null);
            if (json?.success) setStats(json);
        } catch (e) {
            console.warn('[SessionAnalytics] Fetch error:', e);
        } finally {
            setLoading(false);
        }
    }, [userId]);

    useEffect(() => {
        if (!userId) return undefined;
        load();

        // Coach results are written from the sandbox route, so its in-page
        // custom event never reaches this page — refetch on tab focus instead.
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

    if (loading) {
        return (
            <div style={{ ...s.card, opacity: 0.5 }}>
                <div className="analytics-shimmer" style={s.shimmer} />
                <style jsx>{`
                    .analytics-shimmer { animation: analyticsShimmer 1.5s infinite; }
                    @keyframes analyticsShimmer {
                        0% { background-position: 200% 0; }
                        100% { background-position: -200% 0; }
                    }
                `}</style>
            </div>
        );
    }

    if (!stats || stats.totalHands === 0) {
        return (
            <div style={s.card}>
                <div style={s.header}>
                    <span style={s.title}>{'📊 Session Analytics'}</span>
                </div>
                <p style={{ fontSize: 11, color: M.dim, textAlign: 'center', padding: '16px 0' }}>
                    Play Coach Mode in the Sandbox to see your analytics here.
                </p>
            </div>
        );
    }

    return (
        <div style={s.card}>
            {/* Header */}
            <button onClick={() => setExpanded(!expanded)} style={s.header}>
                <span style={s.title}>{'📊 Session Analytics'}</span>
                <span style={{ fontSize: 12, color: M.dim, transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>▼</span>
            </button>

            {expanded && (
                <div style={{ padding: '0 12px 12px' }}>

                    {/* ── Row 1: Big Stats ─────────────────────────── */}
                    <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                        <div style={s.statBox}>
                            <span style={{ ...s.statVal, color: M.cyan }}>{stats.totalHands}</span>
                            <span style={s.statLabel}>Total Hands</span>
                        </div>
                        <div style={s.statBox}>
                            <span style={{ ...s.statVal, color: pctColor(stats.accuracyPct) }}>
                                {stats.accuracyPct != null ? `${stats.accuracyPct}%` : '—'}
                            </span>
                            <span style={s.statLabel}>GTO Accuracy</span>
                        </div>
                        <div style={s.statBox}>
                            <span style={{ ...s.statVal, color: M.red }}>
                                {stats.avgLeakEv != null ? `${Number(stats.avgLeakEv).toFixed(1)}bb` : '—'}
                            </span>
                            <span style={s.statLabel}>Avg Leak EV</span>
                        </div>
                    </div>

                    {/* ── Row 2: Accuracy Trend Sparkline ──────────── */}
                    {stats.accuracyTrend?.length > 1 && (
                        <div style={{ marginBottom: 10 }}>
                            <span style={{ fontSize: 8, color: M.dim, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                                Accuracy Trend (Last 30 Days)
                            </span>
                            <Sparkline data={stats.accuracyTrend} />
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 2 }}>
                                <span style={{ fontSize: 7, color: M.dim }}>{stats.accuracyTrend[0]?.date}</span>
                                <span style={{ fontSize: 7, color: M.dim }}>{stats.accuracyTrend[stats.accuracyTrend.length - 1]?.date}</span>
                            </div>
                        </div>
                    )}

                    {/* ── Row 3: Position Heatmap ─────────────────── */}
                    {stats.positionStats?.length > 0 && (
                        <div style={{ marginBottom: 10 }}>
                            <span style={{ fontSize: 8, color: M.dim, textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', marginBottom: 4 }}>
                                Position Accuracy
                            </span>
                            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                                {stats.positionStats.map(p => (
                                    <PosBadge
                                        key={p.position}
                                        pos={p.position} pct={p.pct} total={p.total}
                                        isTop={p.position === stats.topPosition}
                                        isWeak={p.position === stats.weakPosition}
                                    />
                                ))}
                            </div>
                        </div>
                    )}

                    {/* ── Row 4: Street Breakdown ─────────────────── */}
                    {stats.streetStats?.length > 0 && (
                        <div>
                            <span style={{ fontSize: 8, color: M.dim, textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', marginBottom: 4 }}>
                                Street Accuracy
                            </span>
                            <div style={{ display: 'flex', gap: 6 }}>
                                {stats.streetStats.map(st => (
                                    <div key={st.street} style={{
                                        flex: 1, textAlign: 'center', padding: '6px 2px',
                                        borderRadius: 6, background: 'rgba(255,255,255,0.03)',
                                        border: `1px solid ${st.street === stats.weakestStreet ? M.red + '44' : M.border}`,
                                    }}>
                                        <div style={{ fontSize: 11, fontWeight: 800, color: pctColor(st.pct), fontFamily: '"Orbitron", monospace' }}>{st.pct}%</div>
                                        <div style={{ fontSize: 7, color: M.sub, textTransform: 'capitalize', marginTop: 1 }}>{st.street}</div>
                                        <div style={{ fontSize: 7, color: M.dim }}>{st.total}</div>
                                    </div>
                                ))}
                            </div>
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
    statBox: {
        flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
        padding: '8px 4px', borderRadius: 8,
        background: 'rgba(255,255,255,0.03)',
        border: `1px solid ${M.border}`,
    },
    statVal: {
        fontSize: 18, fontWeight: 800, fontFamily: '"Orbitron", monospace',
        lineHeight: 1.1,
    },
    statLabel: {
        fontSize: 7, color: M.dim, textTransform: 'uppercase',
        letterSpacing: 0.4, marginTop: 3,
    },
    shimmer: {
        height: 80, borderRadius: 8,
        background: 'linear-gradient(90deg, #242526 25%, #3a3b3c 50%, #242526 75%)',
        backgroundSize: '200% 100%',
    },
};
