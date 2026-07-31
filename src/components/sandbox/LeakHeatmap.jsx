/**
 * POSITION-BASED LEAK HEATMAP
 * 6-position grid coloured by coach mode accuracy at each position.
 * Data fetched from /api/sandbox/session-stats (positionStats).
 *
 * The grid ALWAYS renders — skeleton, sign-in, error+retry, no-data and data
 * are five distinct states, never a silent `return null`. Every cell is a
 * button that deep-links into the sandbox pre-set to that position.
 */
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useRouter } from 'next/router';
import { Map as MapIcon } from 'lucide-react';
import { getAccessToken } from '../../lib/authUtils';
import { T, F, S, R, card, numeric, sectionTitle } from './paTokens';
import {
    PAStyles, Skeleton, ErrorState, SignInState,
    useThrottledRefresh, useAbortableFetch, isAbortError, buildPracticeHref,
} from './paKit';

const POSITION_ORDER = ['UTG', 'MP', 'CO', 'BTN', 'SB', 'BB'];

/** Text tier so accuracy is never encoded by colour alone. */
function tier(pct) {
    if (pct == null) return { label: 'No data', color: T.textMuted };
    if (pct >= 70) return { label: 'Strong', color: T.success };
    if (pct >= 50) return { label: 'Mixed', color: T.warn };
    return { label: 'Leaky', color: T.danger };
}

function cellBg(pct, lowConfidence) {
    if (pct == null) return T.surface2;
    const base = pct >= 70 ? T.successSoft : pct >= 50 ? T.warnSoft : T.dangerSoft;
    if (!lowConfidence) return base;
    // Hatched treatment marks a single-hand sample as low confidence.
    return `repeating-linear-gradient(135deg, ${base} 0 6px, rgba(255,255,255,0.04) 6px 12px)`;
}

export default function LeakHeatmap({ userId }) {
    const router = useRouter();
    const [positionStats, setPositionStats] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [authRequired, setAuthRequired] = useState(false);
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
            const res = await abortableFetch('/api/sandbox/session-stats', {
                headers: token ? { Authorization: `Bearer ${token}` } : {},
            });
            if (!mountedRef.current) return;
            if (res.status === 401) { setAuthRequired(true); return; }
            const json = await res.json().catch(() => null);
            if (!mountedRef.current) return;
            setAuthRequired(false);
            if (json?.success) setPositionStats(Array.isArray(json.positionStats) ? json.positionStats : []);
            else setError(json?.error || `Leak map unavailable (${res.status})`);
        } catch (e) {
            if (isAbortError(e) || !mountedRef.current) return;
            console.warn('[LeakHeatmap] Fetch error:', e);
            setError(e?.message || 'Leak map unavailable');
        } finally {
            if (mountedRef.current) setLoading(false);
        }
    }, [userId, abortableFetch]);

    const refresh = useThrottledRefresh(load, {
        enabled: !!userId,
        minIntervalMs: 60000,
        events: ['sandbox-coach-result-saved'],
    });

    const positions = useMemo(() => {
        const map = {};
        positionStats.forEach(p => { if (p?.position) map[String(p.position).toUpperCase()] = p; });
        return POSITION_ORDER.map(pos => map[pos] || { position: pos, total: 0, correct: 0, pct: null });
    }, [positionStats]);

    const hasData = positions.some(p => (p.total || 0) > 0);

    const header = (
        <div style={{ display: 'flex', alignItems: 'center', gap: S.sm, marginBottom: S.md, minHeight: 28 }}>
            <MapIcon size={18} strokeWidth={2} color={T.accent} />
            <h3 style={{ fontSize: F.h3, fontWeight: 700, color: T.text, margin: 0 }}>Position Leak Map</h3>
        </div>
    );

    let body;
    if (loading) {
        body = (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: S.sm }} aria-busy="true">
                {POSITION_ORDER.map(p => <Skeleton key={p} h={78} />)}
            </div>
        );
    } else if (!userId) {
        body = <SignInState compact title="Sign in to map your leaks" body="Position accuracy comes from your coach-mode history." />;
    } else if (authRequired) {
        body = <SignInState compact title="Session expired" body="Sign in again to reload your position map." />;
    } else if (error) {
        body = <ErrorState title="Could not load position stats" body={error} onRetry={() => { setLoading(true); refresh(true); }} />;
    } else {
        body = (
            <>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: S.sm }}>
                    {positions.map(p => {
                        const t = tier(p.pct);
                        const lowConfidence = p.total > 0 && p.total < 3;
                        const empty = !p.total;
                        return (
                            <button
                                key={p.position}
                                type="button"
                                className="pa-btn"
                                onClick={() => router.push(buildPracticeHref({
                                    position: p.position,
                                    label: `Position leak: ${p.position}`,
                                }))}
                                aria-label={empty
                                    ? `${p.position}, no data yet. Practice from ${p.position}.`
                                    : `${p.position}, ${p.pct} percent over ${p.total} hands, ${t.label}. Practice from ${p.position}.`}
                                style={{
                                    display: 'flex', flexDirection: 'column', alignItems: 'center',
                                    justifyContent: 'center', gap: 2, minHeight: 78, padding: S.sm,
                                    borderRadius: R.sm, cursor: 'pointer', boxSizing: 'border-box',
                                    background: cellBg(p.pct, lowConfidence),
                                    border: `1px solid ${empty ? T.border : `${t.color}55`}`,
                                    color: T.text, minWidth: 0,
                                }}
                            >
                                <span style={{ fontSize: F.h2, fontWeight: 800, color: empty ? T.textMuted : t.color, ...numeric }}>
                                    {empty ? '—' : `${p.pct}%`}
                                </span>
                                <span style={{ fontSize: F.caption, fontWeight: 800, color: T.textMuted, letterSpacing: 0.5 }}>
                                    {p.position}
                                </span>
                                <span style={{ fontSize: F.caption, fontWeight: 700, color: empty ? T.textMuted : t.color }}>
                                    {empty ? 'Play here' : t.label}
                                </span>
                                <span style={{ fontSize: F.caption, color: T.textMuted, ...numeric }}>
                                    {empty ? '0 hands' : `${p.total} hand${p.total === 1 ? '' : 's'}`}
                                </span>
                            </button>
                        );
                    })}
                </div>
                <p style={{ fontSize: F.caption, color: T.textMuted, margin: `${S.md}px 0 0`, lineHeight: 1.45 }}>
                    {hasData
                        ? 'Tap a seat to open the Sandbox with that position pre-set. Hatched cells have fewer than 3 hands, so treat them as provisional.'
                        : 'No coach hands recorded yet — tap any seat to start playing that position in the Sandbox.'}
                </p>
            </>
        );
    }

    return (
        <div style={{ ...card, marginBottom: S.md }}>
            <PAStyles />
            {header}
            <div style={{ ...sectionTitle, marginBottom: S.sm }}>Coach accuracy by seat</div>
            {body}
        </div>
    );
}
