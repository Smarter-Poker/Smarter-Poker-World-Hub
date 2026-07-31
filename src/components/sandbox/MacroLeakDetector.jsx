/**
 * MACRO LEAK DETECTOR (W6-4)
 * Analyses up to 1,000 recent coach results for systemic flaws.
 *
 * The API returns prose insights plus the raw aggregates (streetErrors,
 * biggestStreet, biggestPos, totalEvLost). We derive RANKED, ACTIONABLE cards
 * from the aggregates — each with a "Practice this" deep link — and fall back
 * to the prose list when only that is available.
 */
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useRouter } from 'next/router';
import { Microscope, Loader2, Layers, MapPin, TrendingDown, Play } from 'lucide-react';
import { getAccessToken } from '../../lib/authUtils';
import { T, F, S, R, card, btn, pill, numeric, sectionTitle } from './paTokens';
import {
    PAStyles, Skeleton, ErrorState, SignInState,
    useThrottledRefresh, useAbortableFetch, isAbortError, buildPracticeHref,
} from './paKit';

const MIN_SAMPLE = 50;
const STREET_ORDER = ['preflop', 'flop', 'turn', 'river'];

/** Renders **bold** markdown segments without dangerouslySetInnerHTML. */
function renderInsight(text) {
    return String(text ?? '').split('**').map((part, i) => (
        i % 2 === 1
            ? <strong key={i} style={{ color: T.text }}>{part}</strong>
            : <span key={i}>{part}</span>
    ));
}

/**
 * Turns the API's aggregate fields into ranked leak objects the UI can act on.
 * Ordering is by severity (error count), so the worst leak is always first.
 */
function deriveLeaks(data) {
    if (!data) return [];
    const out = [];
    const streetErrors = data.streetErrors && typeof data.streetErrors === 'object' ? data.streetErrors : {};
    const totalStreetErrors = STREET_ORDER.reduce((a, s) => a + (Number(streetErrors[s]) || 0), 0);
    const evLost = Number(data.totalEvLost) || 0;

    STREET_ORDER.forEach(street => {
        const errs = Number(streetErrors[street]) || 0;
        if (errs <= 0) return;
        const share = totalStreetErrors > 0 ? errs / totalStreetErrors : 0;
        out.push({
            id: `street-${street}`,
            type: 'street',
            street,
            position: null,
            errors: errs,
            share,
            evLost: evLost * share,
            title: `${street.charAt(0).toUpperCase()}${street.slice(1)} decisions`,
            text: `${errs} mistake${errs === 1 ? '' : 's'} on the ${street} — ${Math.round(share * 100)}% of everything you got wrong.`,
        });
    });

    const pos = data.biggestPos && data.biggestPos !== 'Unknown' ? String(data.biggestPos).toUpperCase() : null;
    if (pos) {
        out.push({
            id: `position-${pos}`,
            type: 'position',
            street: null,
            position: pos,
            errors: null,
            share: 0.5,
            evLost: evLost * 0.5,
            title: `Playing from ${pos}`,
            text: `${pos} is the seat where you deviate from the solver most often.`,
        });
    }

    return out.sort((a, b) => (b.evLost - a.evLost) || (b.errors || 0) - (a.errors || 0));
}

/** A tiny inline bar showing this leak's share of total errors. */
function ShareBar({ share, tone }) {
    const pct = Math.max(2, Math.min(100, Math.round((Number(share) || 0) * 100)));
    return (
        <div
            style={{ height: 6, borderRadius: R.pill, background: T.surface2, overflow: 'hidden', marginTop: S.sm }}
            role="img"
            aria-label={`${pct} percent of your errors`}
        >
            <div style={{ width: `${pct}%`, height: '100%', background: tone, borderRadius: R.pill }} />
        </div>
    );
}

export default function MacroLeakDetector() {
    const router = useRouter();
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [authRequired, setAuthRequired] = useState(false);
    const abortableFetch = useAbortableFetch();
    const mountedRef = useRef(true);

    useEffect(() => {
        mountedRef.current = true;
        return () => { mountedRef.current = false; };
    }, []);

    const fetchAnalysis = useCallback(async () => {
        setError(null);
        try {
            const token = getAccessToken();
            const headers = token ? { Authorization: `Bearer ${token}` } : {};
            const res = await abortableFetch('/api/sandbox/macro-analysis', { headers });
            if (!mountedRef.current) return;
            if (res.status === 401) { setAuthRequired(true); setData(null); return; }
            const json = await res.json().catch(() => null);
            if (!mountedRef.current) return;
            setAuthRequired(false);
            if (json?.success) setData(json);
            else setError(json?.error || `Macro analysis unavailable (${res.status})`);
        } catch (err) {
            if (isAbortError(err) || !mountedRef.current) return;
            setError(err?.message || 'Macro analysis unavailable');
        } finally {
            if (mountedRef.current) setLoading(false);
        }
    }, [abortableFetch]);

    const refresh = useThrottledRefresh(fetchAnalysis, {
        minIntervalMs: 60000,
        events: ['sandbox-coach-result-saved'],
    });

    const leaks = useMemo(() => deriveLeaks(data), [data]);
    const proseInsights = Array.isArray(data?.insights) ? data.insights : [];

    const header = (
        <div style={{ marginBottom: S.md }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: S.sm, minHeight: 28 }}>
                <Microscope size={18} strokeWidth={2} color={T.purple} />
                <h3 style={{ fontSize: F.h3, fontWeight: 700, color: T.text, margin: 0 }}>Macro Leak Detector</h3>
            </div>
            {data && !data.insufficientData && (
                <div style={{ fontSize: F.caption, color: T.textMuted, marginTop: S.xs, ...numeric }}>
                    {Number(data.totalHands) || 0} hands
                    {' · '}
                    <span style={{ color: T.danger, fontWeight: 700 }}>
                        {(Number(data.totalEvLost) || 0).toFixed(2)} EV lost
                    </span>
                </div>
            )}
        </div>
    );

    let body;
    if (loading) {
        body = (
            <div style={{ display: 'flex', flexDirection: 'column', gap: S.md }} aria-busy="true">
                <div style={{ display: 'flex', alignItems: 'center', gap: S.sm, fontSize: F.bodySm, color: T.textMuted }}>
                    <Loader2 className="pa-spin" size={18} strokeWidth={2} />
                    Running systemic leak aggregation…
                </div>
                <Skeleton h={72} />
                <Skeleton h={72} />
                <Skeleton h={72} />
            </div>
        );
    } else if (authRequired) {
        body = (
            <SignInState
                compact
                title="Sign in to run macro leak detection"
                body="Systemic leaks are computed from your own coach-mode history, so this needs an account."
            />
        );
    } else if (error) {
        body = <ErrorState title="Macro analysis unavailable" body={error} onRetry={() => { setLoading(true); refresh(true); }} />;
    } else if (data?.insufficientData) {
        const total = Number(data.total) || 0;
        return (
            <div style={{ ...card, marginBottom: S.md }}>
                <PAStyles />
                {header}
                <p style={{ fontSize: F.bodySm, color: T.textMuted, margin: 0, lineHeight: 1.45 }}>
                    Systemic leaks need a real sample. Play at least {MIN_SAMPLE} coach-mode hands and this
                    unlocks automatically.
                </p>
                <div style={{
                    height: 8, background: T.surface2, borderRadius: R.pill, marginTop: S.md, overflow: 'hidden',
                }} role="progressbar" aria-valuenow={total} aria-valuemin={0} aria-valuemax={MIN_SAMPLE}>
                    <div style={{
                        width: `${Math.min(100, (total / MIN_SAMPLE) * 100)}%`,
                        background: T.accent, height: '100%', borderRadius: R.pill,
                    }} />
                </div>
                <div style={{ fontSize: F.caption, color: T.textMuted, marginTop: S.sm, ...numeric }}>
                    {total} / {MIN_SAMPLE} hands
                </div>
                <button
                    type="button"
                    className="pa-btn"
                    style={{ ...btn('primary', { block: true }), marginTop: S.md }}
                    onClick={() => router.push(buildPracticeHref({}))}
                >
                    <Play size={18} strokeWidth={2} />
                    Play coach hands
                </button>
            </div>
        );
    } else if (leaks.length === 0 && proseInsights.length === 0) {
        body = (
            <p style={{ fontSize: F.bodySm, color: T.textMuted, margin: 0, lineHeight: 1.45 }}>
                No systemic leak stands out across your sample — your errors are spread evenly. Keep
                logging hands and check back.
            </p>
        );
    } else {
        body = (
            <div style={{ display: 'flex', flexDirection: 'column', gap: S.md }}>
                {leaks.map((leak, idx) => {
                    const tone = idx === 0 ? T.danger : idx === 1 ? T.warn : T.accent;
                    return (
                        <div
                            key={leak.id}
                            style={{
                                padding: S.md, borderRadius: R.sm, background: T.surface2,
                                borderLeft: `3px solid ${tone}`, boxSizing: 'border-box',
                            }}
                        >
                            <div style={{ display: 'flex', alignItems: 'center', gap: S.sm, flexWrap: 'wrap' }}>
                                {leak.type === 'street'
                                    ? <Layers size={18} strokeWidth={2} color={tone} />
                                    : <MapPin size={18} strokeWidth={2} color={tone} />}
                                <span style={{ fontSize: F.body, fontWeight: 700, color: T.text, minWidth: 0 }}>{leak.title}</span>
                                {idx === 0 && <span style={pill('danger')}>Biggest leak</span>}
                            </div>
                            <p style={{ fontSize: F.bodySm, color: T.textMuted, margin: `${S.sm}px 0 0`, lineHeight: 1.45 }}>
                                {leak.text}
                            </p>
                            <ShareBar share={leak.share} tone={tone} />
                            <div style={{
                                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                gap: S.sm, marginTop: S.md, flexWrap: 'wrap',
                            }}>
                                <span style={{ fontSize: F.caption, color: T.danger, fontWeight: 700, ...numeric }}>
                                    <TrendingDown size={14} strokeWidth={2} style={{ verticalAlign: '-2px', marginRight: 4 }} />
                                    ≈ {leak.evLost.toFixed(2)} EV
                                </span>
                                <button
                                    type="button"
                                    className="pa-btn"
                                    style={btn('secondary')}
                                    onClick={() => router.push(buildPracticeHref({
                                        position: leak.position,
                                        street: leak.street,
                                        label: leak.type === 'street' ? `Street leak: ${leak.street}` : `Position leak: ${leak.position}`,
                                    }))}
                                >
                                    <Play size={18} strokeWidth={2} />
                                    Practice this
                                </button>
                            </div>
                        </div>
                    );
                })}

                {proseInsights.length > 0 && (
                    <div>
                        <div style={{ ...sectionTitle, marginBottom: S.sm }}>Full read-out</div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: S.sm }}>
                            {proseInsights.map((insight, i) => (
                                <p key={i} style={{
                                    margin: 0, fontSize: F.bodySm, color: T.textMuted, lineHeight: 1.45,
                                    padding: S.md, borderRadius: R.sm, background: T.surface2, boxSizing: 'border-box',
                                }}>
                                    {renderInsight(insight)}
                                </p>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        );
    }

    return (
        <div style={{ ...card, marginBottom: S.md }}>
            <PAStyles />
            {header}
            {body}
        </div>
    );
}
