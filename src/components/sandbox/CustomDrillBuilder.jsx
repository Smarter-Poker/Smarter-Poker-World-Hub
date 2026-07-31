/**
 * CUSTOM DRILL BUILDER (W6-3)
 * ═══════════════════════════════════════════════════════════════════════════
 * Configures the street / position / length of a QuickSpotDrill run.
 *
 * The filters are probed live against /api/sandbox/custom-drill so the user is
 * never dropped into an empty drill: the sheet reports how many spots match,
 * disables Launch at zero and offers a one-tap "widen to any position".
 *
 * NOTE: the API clamps `limit` to 20, so 20 is the largest honest option here.
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Zap, Search, AlertTriangle } from 'lucide-react';
import { T, F, S, R, btn, pill, numeric } from './paTokens';
import { BottomSheet, PAStyles, Segmented, Skeleton } from './paKit';

const STREETS = ['Any', 'Preflop', 'Flop', 'Turn', 'River'];
// Canonical position vocabulary (matches sandbox.js POSITIONS, LeakHeatmap and
// the stored metadata->>hero_position values — 'EP' matches nothing).
const POSITIONS = ['Any', 'UTG', 'MP', 'CO', 'BTN', 'SB', 'BB'];
// The custom-drill route clamps limit to 20 — offering 50 silently delivered 20.
const HAND_COUNTS = [5, 10, 20];
const PROBE_LIMIT = 20;

export default function CustomDrillBuilder({ onClose, onStartDrill }) {
    const [street, setStreet] = useState('Any');
    const [position, setPosition] = useState('Any');
    const [handCount, setHandCount] = useState(10);

    // Live match probe: 'idle' | 'loading' | 'ok' | 'error'
    const [probe, setProbe] = useState({ state: 'loading', count: null, capped: false });
    const abortRef = useRef(null);
    const timerRef = useRef(null);

    const runProbe = useCallback((nextStreet, nextPosition) => {
        try { abortRef.current?.abort(); } catch (e) { /* noop */ }
        const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
        abortRef.current = ctrl;
        setProbe(p => ({ ...p, state: 'loading' }));

        const params = new URLSearchParams({
            street: nextStreet, position: nextPosition, limit: String(PROBE_LIMIT),
        });
        fetch(`/api/sandbox/custom-drill?${params.toString()}`, ctrl ? { signal: ctrl.signal } : undefined)
            .then(res => res.json().catch(() => null))
            .then(json => {
                if (!json || json.success === false) throw new Error('probe failed');
                const pool = Array.isArray(json.pool) ? json.pool : (Array.isArray(json.questions) ? json.questions : []);
                setProbe({ state: 'ok', count: pool.length, capped: pool.length >= PROBE_LIMIT });
            })
            .catch(err => {
                if (err?.name === 'AbortError') return;
                console.warn('[CustomDrillBuilder] probe error:', err?.message || err);
                setProbe({ state: 'error', count: null, capped: false });
            });
    }, []);

    // Debounced so rapid chip taps do not fan out a request per tap.
    useEffect(() => {
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => runProbe(street, position), 280);
        return () => { if (timerRef.current) clearTimeout(timerRef.current); };
    }, [street, position, runProbe]);

    useEffect(() => () => { try { abortRef.current?.abort(); } catch (e) { /* noop */ } }, []);

    const noMatches = probe.state === 'ok' && probe.count === 0;
    const effectiveCount = probe.state === 'ok' && probe.count != null
        ? Math.min(handCount, probe.capped ? handCount : probe.count)
        : handCount;

    const launch = useCallback(() => {
        if (noMatches) return;
        onStartDrill?.({ street, position, limit: handCount });
    }, [noMatches, onStartDrill, street, position, handCount]);

    return (
        <BottomSheet
            open
            onClose={onClose}
            title="Custom drill"
            titleIcon={<Zap size={18} strokeWidth={2} color={T.accent} />}
            subtitle="Pick the exact spots you want to practise."
            ariaLabel="Custom drill builder"
            footer={(
                <button
                    type="button"
                    className="pa-btn"
                    onClick={launch}
                    disabled={noMatches}
                    style={{ ...btn('primary', { block: true, disabled: noMatches }) }}
                >
                    {noMatches ? 'No spots match these filters' : `Launch ${effectiveCount} spot${effectiveCount === 1 ? '' : 's'}`}
                </button>
            )}
        >
            <PAStyles />

            <div style={{ display: 'flex', flexDirection: 'column', gap: S.xl }}>
                <Segmented
                    label="Target street"
                    idPrefix="cdb-street"
                    value={street}
                    onChange={setStreet}
                    options={STREETS}
                />

                <Segmented
                    label="Hero position"
                    idPrefix="cdb-pos"
                    tone="purple"
                    value={position}
                    onChange={setPosition}
                    options={POSITIONS}
                />

                <Segmented
                    label="Number of hands"
                    idPrefix="cdb-count"
                    tone="success"
                    columns={3}
                    value={handCount}
                    onChange={setHandCount}
                    options={HAND_COUNTS.map(c => ({ value: c, label: String(c) }))}
                />

                {/* Live match count — loading / ok / empty / error, never silent */}
                <div
                    aria-live="polite"
                    style={{
                        background: T.surface2, border: `1px solid ${noMatches ? 'rgba(251,191,36,0.4)' : T.border}`,
                        borderRadius: R.sm, padding: S.md, display: 'flex', flexDirection: 'column', gap: S.sm,
                    }}
                >
                    {probe.state === 'loading' && (
                        <>
                            <Skeleton h={14} w="60%" />
                            <Skeleton h={12} w="40%" />
                        </>
                    )}

                    {probe.state === 'ok' && !noMatches && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: S.sm, flexWrap: 'wrap' }}>
                            <Search size={18} strokeWidth={2} color={T.success} />
                            <span style={{ fontSize: F.bodySm, color: T.text, ...numeric }}>
                                {probe.capped ? `${PROBE_LIMIT}+ spots match` : `${probe.count} spot${probe.count === 1 ? '' : 's'} match`}
                            </span>
                            <span style={pill('success')}>Ready</span>
                        </div>
                    )}

                    {noMatches && (
                        <>
                            <div style={{ display: 'flex', alignItems: 'center', gap: S.sm }}>
                                <AlertTriangle size={18} strokeWidth={2} color={T.warn} />
                                <span style={{ fontSize: F.bodySm, fontWeight: 700, color: T.warn }}>
                                    No spots match yet
                                </span>
                            </div>
                            <p style={{ fontSize: F.caption, color: T.textMuted, margin: 0, lineHeight: 1.45 }}>
                                Nothing in the question pool covers {street === 'Any' ? 'any street' : street.toLowerCase()}
                                {position === 'Any' ? '' : ` from ${position}`}. Widen a filter to continue.
                            </p>
                            <div style={{ display: 'flex', gap: S.sm, flexWrap: 'wrap' }}>
                                {position !== 'Any' && (
                                    <button
                                        type="button"
                                        className="pa-btn"
                                        onClick={() => setPosition('Any')}
                                        style={{ ...btn('secondary'), fontSize: F.label, padding: '0 14px' }}
                                    >
                                        Any position
                                    </button>
                                )}
                                {street !== 'Any' && (
                                    <button
                                        type="button"
                                        className="pa-btn"
                                        onClick={() => setStreet('Any')}
                                        style={{ ...btn('secondary'), fontSize: F.label, padding: '0 14px' }}
                                    >
                                        Any street
                                    </button>
                                )}
                            </div>
                        </>
                    )}

                    {probe.state === 'error' && (
                        <>
                            <div style={{ display: 'flex', alignItems: 'center', gap: S.sm }}>
                                <AlertTriangle size={18} strokeWidth={2} color={T.danger} />
                                <span style={{ fontSize: F.bodySm, fontWeight: 700, color: T.danger }}>
                                    Could not check the pool
                                </span>
                            </div>
                            <p style={{ fontSize: F.caption, color: T.textMuted, margin: 0, lineHeight: 1.45 }}>
                                You can still launch — the drill will tell you if nothing matches.
                            </p>
                            <button
                                type="button"
                                className="pa-btn"
                                onClick={() => runProbe(street, position)}
                                style={{ ...btn('secondary'), fontSize: F.label, padding: '0 14px', alignSelf: 'flex-start' }}
                            >
                                Retry
                            </button>
                        </>
                    )}
                </div>
            </div>
        </BottomSheet>
    );
}
