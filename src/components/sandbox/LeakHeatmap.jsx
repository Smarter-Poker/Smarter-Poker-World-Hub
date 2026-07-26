/**
 * POSITION-BASED LEAK HEATMAP
 * 6-position grid colored by coach mode accuracy at each position.
 * Data fetched from /api/sandbox/session-stats (positionStats).
 * Used in the Leak Finder page.
 */
import { useState, useEffect, useCallback } from 'react';
import { getAccessToken } from '../../lib/authUtils';

const M = {
    card: '#242526', border: '#3a3b3c',
    green: '#00E676', gold: '#F5A623', red: '#EF5350',
    text: '#E4E6EB', sub: '#B0B3B8', dim: 'rgba(255,255,255,0.4)',
};

const POSITION_ORDER = ['UTG', 'MP', 'CO', 'BTN', 'SB', 'BB'];

function pctColor(pct) {
    if (pct == null) return M.dim;
    if (pct >= 70) return M.green;
    if (pct >= 50) return M.gold;
    return M.red;
}

function pctBg(pct) {
    if (pct == null) return 'rgba(255,255,255,0.03)';
    if (pct >= 70) return 'rgba(0,230,118,0.08)';
    if (pct >= 50) return 'rgba(245,166,35,0.08)';
    return 'rgba(239,83,80,0.08)';
}

export default function LeakHeatmap({ userId }) {
    const [positionStats, setPositionStats] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const load = useCallback(async () => {
        if (!userId) return;
        setError(null);
        try {
            const token = getAccessToken();
            const res = await fetch('/api/sandbox/session-stats', {
                headers: token ? { Authorization: `Bearer ${token}` } : {},
            });
            const json = await res.json().catch(() => null);
            if (json?.success) setPositionStats(json.positionStats || []);
            else setError(json?.error || `Leak map unavailable (${res.status})`);
        } catch (e) {
            console.warn('[LeakHeatmap] Fetch error:', e);
            setError(e?.message || 'Leak map unavailable');
        } finally {
            setLoading(false);
        }
    }, [userId]);

    useEffect(() => {
        if (!userId) return undefined;
        load();

        // Sandbox coach results are recorded on a different route, so the
        // in-page 'sandbox-coach-result-saved' event never reaches this page.
        // Refetch when the tab regains focus instead — that is what actually
        // happens ("played the sandbox in another tab, came back").
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

    if (loading) return null;

    if (error) {
        return (
            <div style={s.card}>
                <div style={s.header}>
                    <span style={s.title}>{'🗺 Position Leak Map'}</span>
                </div>
                <div style={{ padding: '0 12px 12px' }}>
                    <div style={{ fontSize: 10, color: M.sub, marginBottom: 8 }}>Could not load position stats.</div>
                    <button
                        onClick={() => { setLoading(true); load(); }}
                        style={{
                            padding: '6px 12px', borderRadius: 6,
                            background: 'rgba(69,153,255,0.12)', border: '1px solid rgba(69,153,255,0.35)',
                            color: '#4599FF', fontSize: 11, fontWeight: 700, cursor: 'pointer',
                            outline: 'none', WebkitTapHighlightColor: 'transparent',
                        }}
                    >
                        Retry
                    </button>
                </div>
            </div>
        );
    }

    // Merge fetched stats with expected positions
    const statsMap = {};
    positionStats.forEach(p => { statsMap[p.position] = p; });

    const positions = POSITION_ORDER.map(pos => statsMap[pos] || { position: pos, total: 0, correct: 0, pct: null });

    // Only show if we have at least 1 position with data
    const hasData = positions.some(p => p.total > 0);
    if (!hasData) return null;

    return (
        <div style={s.card}>
            <div style={s.header}>
                <span style={s.title}>{'🗺 Position Leak Map'}</span>
            </div>
            <div style={s.grid}>
                {positions.map(p => (
                    <div key={p.position} style={{
                        ...s.cell,
                        background: pctBg(p.pct),
                        border: `1px solid ${p.total > 0 ? pctColor(p.pct) + '33' : M.border}`,
                    }}>
                        <span style={{
                            fontSize: 16, fontWeight: 900,
                            color: p.total > 0 ? pctColor(p.pct) : M.dim,
                            fontFamily: '"Orbitron", monospace',
                        }}>
                            {p.total > 0 ? `${p.pct}%` : '—'}
                        </span>
                        <span style={{ fontSize: 9, fontWeight: 800, color: M.sub, letterSpacing: 0.5 }}>
                            {p.position}
                        </span>
                        <span style={{ fontSize: 7, color: M.dim }}>
                            {p.total > 0 ? `${p.total} hands` : 'No data'}
                        </span>
                    </div>
                ))}
            </div>
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
        padding: '10px 12px 6px',
    },
    title: {
        fontSize: 13, fontWeight: 700, color: M.text,
        letterSpacing: 0.3,
    },
    grid: {
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: 4, padding: '0 8px 10px',
    },
    cell: {
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        padding: '10px 4px', borderRadius: 8,
        gap: 2,
    },
};
