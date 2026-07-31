/**
 * SESSION ANALYTICS DASHBOARD
 * Aggregated coach mode analytics: accuracy trend, position stats, street breakdown.
 * Renders as a collapsible card on the Leak Finder page.
 *
 * Every stat is a practice deep-link into the sandbox (?p=<pos>) so the card
 * ends in an action instead of a number.
 */
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useRouter } from 'next/router';
import { BarChart3, ChevronDown, Target, TrendingUp } from 'lucide-react';
import { getAccessToken } from '../../lib/authUtils';
import { T, F, S, R, card, btn, pill, numeric, sectionTitle } from './paTokens';
import {
    PAStyles, Skeleton, ErrorState, EmptyState, SignInState,
    useThrottledRefresh, useAbortableFetch, isAbortError, buildPracticeHref,
} from './paKit';

function pctColor(pct) {
    if (pct == null) return T.textDim;
    if (pct >= 70) return T.success;
    if (pct >= 50) return T.warn;
    return T.danger;
}

const GRID_LINES = [70, 50];

/**
 * Group consecutive daily points into 7-day buckets, newest bucket last.
 * `pct` is re-derived weighted by sample size, never averaged naively.
 */
function toWeekly(data) {
    const out = [];
    for (let end = data.length; end > 0; end -= 7) {
        const chunk = data.slice(Math.max(0, end - 7), end);
        const total = chunk.reduce((sum, d) => sum + (Number(d.total) || 0), 0);
        const correct = chunk.reduce((sum, d) => sum + ((Number(d.pct) || 0) * (Number(d.total) || 0)) / 100, 0);
        out.unshift({
            date: chunk.length > 1 ? `${chunk[0]?.date} – ${chunk[chunk.length - 1]?.date}` : chunk[0]?.date,
            total,
            pct: total > 0 ? Math.round((100 * correct) / total) : 0,
        });
    }
    return out;
}

/**
 * Accuracy trend — bar HEIGHT is accuracy (the thing the label promises);
 * sample size is carried by opacity and revealed on tap. Tapping a bar pins a
 * readout row underneath, so nothing is hover-only.
 *
 * MOBILE: bars are full 44px tap targets in a deliberate horizontal snap
 * carousel — they used to be 14px wide with a 3px gap, effectively unhittable
 * on a phone — and a Weekly view collapses 30 days into ~5 on-screen bars.
 */
function AccuracyTrend({ data, avg }) {
    const [activeIdx, setActiveIdx] = useState(null);
    const [bucket, setBucket] = useState('daily');

    const points = useMemo(
        () => (bucket === 'weekly' ? toWeekly(data || []) : (data || [])),
        [data, bucket],
    );

    useEffect(() => { setActiveIdx(null); }, [bucket]);

    if (!data?.length) return null;

    const maxTotal = Math.max(...points.map(d => Number(d.total) || 0), 1);
    const active = activeIdx != null ? points[activeIdx] : null;

    return (
        <div>
            <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                gap: S.sm, flexWrap: 'wrap', marginBottom: S.sm,
            }}>
                <div style={{ ...sectionTitle, marginBottom: 0 }}>
                    Accuracy Trend ({bucket === 'weekly' ? 'weekly' : 'last 30 days'})
                </div>
                {data.length > 7 && (
                    <div role="group" aria-label="Trend grouping" style={{ display: 'flex', gap: S.sm }}>
                        {[{ v: 'daily', l: 'Daily' }, { v: 'weekly', l: 'Weekly' }].map(o => (
                            <button
                                key={o.v}
                                type="button"
                                className="pa-btn"
                                onClick={() => setBucket(o.v)}
                                aria-pressed={bucket === o.v}
                                style={{
                                    ...btn('secondary'),
                                    padding: '0 12px', fontSize: F.label,
                                    background: bucket === o.v ? T.accentSoft : T.surface2,
                                    color: bucket === o.v ? T.accent : T.textMuted,
                                    borderColor: bucket === o.v ? 'rgba(69,153,255,0.45)' : T.border,
                                }}
                            >
                                {o.l}
                            </button>
                        ))}
                    </div>
                )}
            </div>
            <div style={{ position: 'relative', height: 84, marginBottom: S.sm }}>
                {GRID_LINES.map(g => (
                    <div key={g} style={{
                        position: 'absolute', left: 0, right: 0, bottom: `${g * 0.8}%`,
                        borderTop: `1px dashed ${T.border}`, pointerEvents: 'none',
                    }}>
                        <span style={{
                            position: 'absolute', right: 0, top: -14, fontSize: F.caption,
                            fontWeight: 700, color: T.textDim, ...numeric,
                        }}>{g}%</span>
                    </div>
                ))}
                {Number.isFinite(avg) && (
                    <div style={{
                        position: 'absolute', left: 0, right: 0, bottom: `${avg * 0.8}%`,
                        borderTop: `1px solid ${T.accent}66`, pointerEvents: 'none',
                    }} />
                )}
                {/* Deliberate horizontal snap carousel: 44px targets beat a
                    squeezed-to-fit strip of 14px slivers on a phone. */}
                <div
                    data-hscroll="true"
                    style={{
                        position: 'absolute', inset: 0, display: 'flex', alignItems: 'flex-end',
                        gap: S.sm, overflowX: 'auto', WebkitOverflowScrolling: 'touch',
                        scrollSnapType: 'x proximity',
                    }}
                >
                    {points.map((d, i) => {
                        const pct = Number(d.pct) || 0;
                        const on = activeIdx === i;
                        return (
                            <button
                                key={d.date || i}
                                type="button"
                                className="pa-btn"
                                onClick={() => setActiveIdx(on ? null : i)}
                                aria-label={`${d.date}: ${pct} percent over ${d.total} hands`}
                                aria-pressed={on}
                                style={{
                                    flex: '0 0 44px', width: 44, minWidth: 44, height: '100%', padding: 0,
                                    background: 'transparent', border: 'none', cursor: 'pointer',
                                    display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
                                    scrollSnapAlign: 'center', touchAction: 'manipulation',
                                }}
                            >
                                <span style={{
                                    display: 'block', width: '100%', maxWidth: 28,
                                    height: `${Math.max(4, pct * 0.8)}%`,
                                    borderRadius: `${R.sm}px ${R.sm}px 0 0`,
                                    background: pctColor(pct),
                                    opacity: on ? 1 : 0.35 + 0.55 * ((Number(d.total) || 0) / maxTotal),
                                    outline: on ? `2px solid ${T.text}` : 'none',
                                }} />
                            </button>
                        );
                    })}
                </div>
            </div>
            <div style={{
                minHeight: 22, fontSize: F.caption, color: T.textMuted, ...numeric,
                display: 'flex', justifyContent: 'space-between', gap: S.sm,
            }}>
                {active ? (
                    <span style={{ color: T.text, fontWeight: 700 }}>
                        {active.date} — {active.pct}% over {active.total} hand{active.total === 1 ? '' : 's'}
                    </span>
                ) : (
                    <>
                        <span>{points[0]?.date}</span>
                        <span style={{ color: T.textDim, fontWeight: 700 }}>Tap a bar</span>
                        <span>{points[points.length - 1]?.date}</span>
                    </>
                )}
            </div>
        </div>
    );
}

function StatBox({ value, label, color }) {
    return (
        <div style={{
            flex: '1 1 30%', minWidth: 100, display: 'flex', flexDirection: 'column',
            alignItems: 'center', gap: S.xs, padding: `${S.md}px ${S.sm}px`,
            borderRadius: R.sm, background: T.surface2, border: `1px solid ${T.border}`,
            boxSizing: 'border-box',
        }}>
            <span style={{ fontSize: 20, fontWeight: 800, color, ...numeric }}>{value}</span>
            <span style={{ fontSize: F.caption, color: T.textMuted, textAlign: 'center', lineHeight: 1.2 }}>{label}</span>
        </div>
    );
}

export default function SessionAnalytics({ userId }) {
    const router = useRouter();
    const [stats, setStats] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [authRequired, setAuthRequired] = useState(false);
    const [expanded, setExpanded] = useState(true);
    const abortableFetch = useAbortableFetch();
    const mountedRef = useRef(true);

    useEffect(() => {
        mountedRef.current = true;
        return () => { mountedRef.current = false; };
    }, []);

    // A null userId is the signed-out case (leaks.js resolves it async) — it
    // must resolve the loading state, not leave a skeleton up forever.
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
            if (res.status === 401) { setAuthRequired(true); setStats(null); return; }
            const json = await res.json().catch(() => null);
            if (!mountedRef.current) return;
            setAuthRequired(false);
            if (json?.success) setStats(json);
            else setError(json?.error || `Analytics unavailable (${res.status})`);
        } catch (e) {
            if (isAbortError(e) || !mountedRef.current) return;
            console.warn('[SessionAnalytics] Fetch error:', e);
            setError(e?.message || 'Analytics unavailable');
        } finally {
            if (mountedRef.current) setLoading(false);
        }
    }, [userId, abortableFetch]);

    const refresh = useThrottledRefresh(load, {
        enabled: !!userId,
        minIntervalMs: 60000,
        events: ['sandbox-coach-result-saved'],
    });

    const retry = useCallback(() => { setLoading(true); refresh(true); }, [refresh]);

    const practice = useCallback((opts) => {
        router.push(buildPracticeHref(opts));
    }, [router]);

    const avgAccuracy = useMemo(() => {
        const t = stats?.accuracyTrend;
        if (!Array.isArray(t) || t.length === 0) return null;
        const totals = t.reduce((a, d) => a + (Number(d.total) || 0), 0);
        if (!totals) return null;
        return Math.round(100 * t.reduce((a, d) => a + (Number(d.correct) || 0), 0) / totals);
    }, [stats]);

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
                <BarChart3 size={18} strokeWidth={2} color={T.accent} />
                Session Analytics
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: S.sm, flexShrink: 0 }}>
                {stats?.accuracyPct != null && (
                    <span style={pill(stats.accuracyPct >= 70 ? 'success' : stats.accuracyPct >= 50 ? 'warn' : 'danger')}>
                        {stats.accuracyPct}%
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

    let body = null;
    if (loading) {
        body = (
            <div style={{ display: 'flex', flexDirection: 'column', gap: S.md }} aria-busy="true">
                <div style={{ display: 'flex', gap: S.sm, flexWrap: 'wrap' }}>
                    <Skeleton h={66} w="31%" /><Skeleton h={66} w="31%" /><Skeleton h={66} w="31%" />
                </div>
                <Skeleton h={84} />
                <Skeleton h={56} />
            </div>
        );
    } else if (!userId) {
        body = <SignInState compact title="Sign in to see your coach analytics" body="Accuracy, position leaks and EV trends are stored against your account." />;
    } else if (authRequired) {
        body = <SignInState compact title="Session expired" body="Sign in again to reload your coach analytics." />;
    } else if (error) {
        body = <ErrorState title="Could not load analytics" body={error} onRetry={retry} />;
    } else if (!stats || !stats.totalHands) {
        body = (
            <EmptyState
                compact
                icon={<Target size={22} strokeWidth={2} />}
                title="No coached hands yet"
                body="Turn on Coach Mode in the Sandbox and play a few spots — your accuracy, positions and streets show up here."
                action={
                    <button type="button" className="pa-btn" style={btn('primary')} onClick={() => practice({})}>
                        Open the Sandbox
                    </button>
                }
            />
        );
    } else {
        body = (
            <div style={{ display: 'flex', flexDirection: 'column', gap: S.lg }}>
                <div style={{ display: 'flex', gap: S.sm, flexWrap: 'wrap' }}>
                    <StatBox value={stats.totalHands} label="Total hands" color={T.accent} />
                    <StatBox
                        value={stats.accuracyPct != null ? `${stats.accuracyPct}%` : '—'}
                        label="GTO accuracy"
                        color={pctColor(stats.accuracyPct)}
                    />
                    <StatBox
                        value={stats.avgLeakEv != null ? `${Number(stats.avgLeakEv).toFixed(1)}bb` : '—'}
                        label="Avg leak EV"
                        color={stats.avgLeakEv != null && Number(stats.avgLeakEv) < 0 ? T.danger : T.textMuted}
                    />
                </div>

                {stats.accuracyTrend?.length > 1 && (
                    <AccuracyTrend data={stats.accuracyTrend} avg={avgAccuracy} />
                )}

                {stats.positionStats?.length > 0 && (
                    <div>
                        <div style={{ ...sectionTitle, marginBottom: S.sm }}>Position accuracy — tap to drill</div>
                        <div style={{ display: 'flex', gap: S.sm, flexWrap: 'wrap' }}>
                            {stats.positionStats.map(p => {
                                const isWeak = p.position === stats.weakPosition;
                                const isTop = p.position === stats.topPosition;
                                return (
                                    <button
                                        key={p.position}
                                        type="button"
                                        className="pa-btn"
                                        onClick={() => practice({ position: p.position, label: `Position leak: ${p.position}` })}
                                        aria-label={`Practice ${p.position}. ${p.pct} percent over ${p.total} hands.`}
                                        style={{
                                            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
                                            minWidth: 72, minHeight: 64, padding: `${S.sm}px ${S.md}px`,
                                            borderRadius: R.sm, cursor: 'pointer',
                                            background: isTop ? T.successSoft : isWeak ? T.dangerSoft : T.surface2,
                                            border: `1px solid ${isTop ? 'rgba(34,197,94,0.4)' : isWeak ? 'rgba(239,68,68,0.4)' : T.border}`,
                                            color: T.text,
                                        }}
                                    >
                                        <span style={{ fontSize: F.h3, fontWeight: 800, color: pctColor(p.pct), ...numeric }}>{p.pct}%</span>
                                        <span style={{ fontSize: F.caption, fontWeight: 700, color: T.textMuted }}>{p.position}</span>
                                        <span style={{ fontSize: F.caption, color: T.textDim, fontWeight: 700 }}>
                                            {isWeak ? 'Fix this' : `${p.total} hands`}
                                        </span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                )}

                {stats.streetStats?.length > 0 && (
                    <div>
                        <div style={{ ...sectionTitle, marginBottom: S.sm }}>Street accuracy</div>
                        <div style={{ display: 'flex', gap: S.sm, flexWrap: 'wrap' }}>
                            {stats.streetStats.map(st => {
                                const weakest = st.street === stats.weakestStreet;
                                return (
                                    <button
                                        key={st.street}
                                        type="button"
                                        className="pa-btn"
                                        onClick={() => practice({ street: st.street, label: `Street leak: ${st.street}` })}
                                        aria-label={`Practice ${st.street}. ${st.pct} percent over ${st.total} hands.`}
                                        style={{
                                            flex: '1 1 72px', minWidth: 72, minHeight: 64,
                                            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
                                            padding: `${S.sm}px ${S.xs}px`, borderRadius: R.sm, cursor: 'pointer',
                                            background: weakest ? T.dangerSoft : T.surface2,
                                            border: `1px solid ${weakest ? 'rgba(239,68,68,0.4)' : T.border}`,
                                            color: T.text,
                                        }}
                                    >
                                        <span style={{ fontSize: F.h3, fontWeight: 800, color: pctColor(st.pct), ...numeric }}>{st.pct}%</span>
                                        <span style={{ fontSize: F.caption, color: T.textMuted, textTransform: 'capitalize', fontWeight: 700 }}>{st.street}</span>
                                        <span style={{ fontSize: F.caption, color: T.textDim, fontWeight: 700, ...numeric }}>{st.total}</span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                )}

                {stats.weakPosition && (
                    <button
                        type="button"
                        className="pa-btn"
                        style={btn('primary', { block: true })}
                        onClick={() => practice({ position: stats.weakPosition, label: `Position leak: ${stats.weakPosition}` })}
                    >
                        <TrendingUp size={18} strokeWidth={2} />
                        Drill your weakest position ({stats.weakPosition})
                    </button>
                )}
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
