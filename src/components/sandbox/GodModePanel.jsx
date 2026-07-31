/**
 * SANDBOX GOD MODE (W6-5)
 * ═══════════════════════════════════════════════════════════════════════════
 * Admin utility for forcing a solver outcome and inspecting raw sandbox state.
 *
 * Gating: an explicit `isAdmin` prop (server-verified upstream) always wins.
 * The localStorage flag is a DEV convenience only — it is ignored in production
 * builds now, because a client-writable key must never unlock a path that
 * injects fabricated solver output into the coach tables.
 *
 * Every injected result carries `forcedMode: true` so the results panel can
 * badge it and refuse to persist it as a real hand.
 */
import React, { useState, useCallback } from 'react';
import { Zap, ShieldAlert, Sparkles } from 'lucide-react';
import { T, F, S, R, btn, pill, numeric } from './paTokens';
import { BottomSheet, PAStyles, EmptyState } from './paKit';

const ACTIONS = ['Fold', 'Check', 'Call', 'Bet', 'Raise'];

/**
 * God Mode injects fabricated solver output, so it must never be reachable by
 * ordinary users. An explicit isAdmin prop wins; the dev-only localStorage flag
 * is honoured outside production builds.
 */
export function hasGodModeAccess(isAdmin) {
    if (isAdmin === true) return true;
    if (isAdmin === false) return false;
    // In production only a server-verified isAdmin prop opens this panel — the
    // old localStorage key was client-writable, so anyone could forge access.
    if (process.env.NODE_ENV === 'production') return false;
    // Non-production builds stay open for local testing.
    return true;
}

export default function GodModePanel({ onClose, setResults, sandboxState, isAdmin }) {
    const [overrideType, setOverrideType] = useState('Call');
    const [overrideEv, setOverrideEv] = useState(0.5);
    const [showRawState, setShowRawState] = useState(false);

    const allowed = hasGodModeAccess(isAdmin);

    const applyForceOverride = useCallback(() => {
        if (!allowed) return;
        // ONE object argument carrying BOTH shapes: the canonical analyze.js
        // fields (actions / ev / explanation) and the flat
        // { optimalAction, frequencies, evDelta } fields the sandbox page's
        // injector reads. optimalAction stays a string label so it is safe to
        // render either way.
        const frequencies = ACTIONS.reduce((acc, a) => {
            acc[a] = a === overrideType ? 100 : 0;
            return acc;
        }, {});
        const ev = Number(overrideEv) || 0;

        const mockResults = {
            evDelta: ev,
            optimalAction: overrideType,
            frequencies,
            actions: ACTIONS.map(a => ({
                id: a.toLowerCase(),
                label: a,
                frequency: a === overrideType ? 100 : 0,
                isOptimal: a === overrideType,
            })),
            ev: {
                hero: ev,
                heroDisplay: `${ev >= 0 ? '+' : ''}${ev.toFixed(2)} BB`,
            },
            gtoSizing: 'N/A',
            isCorrect: false,
            explanation: `God Mode forced result: ${overrideType} at 100%.`,
            // Consumed downstream to badge the panel and block persistence.
            forcedMode: true,
            source: 'God Mode Override',
        };

        if (typeof setResults !== 'function') {
            console.warn('[GodModePanel] setResults handler missing — nothing injected');
            onClose?.();
            return;
        }
        setResults(mockResults);
        onClose?.();
    }, [allowed, overrideType, overrideEv, setResults, onClose]);

    return (
        <BottomSheet
            open
            onClose={onClose}
            title="God Mode"
            titleIcon={<Zap size={18} strokeWidth={2} color={T.purple} />}
            subtitle={allowed ? 'Force a solver result and inspect raw state.' : 'Restricted to staff accounts.'}
            ariaLabel="Sandbox God Mode"
            headerRight={<span style={pill('purple')}>ADMIN</span>}
            footer={allowed ? (
                <button type="button" className="pa-btn" onClick={applyForceOverride} style={{ ...btn('primary', { block: true }) }}>
                    <Sparkles size={18} strokeWidth={2} /> Inject forced result
                </button>
            ) : null}
        >
            <PAStyles />

            {!allowed ? (
                <EmptyState
                    icon={<ShieldAlert size={22} strokeWidth={2} />}
                    title="Admin access required"
                    body="God Mode injects fabricated solver output, so it is restricted to staff accounts."
                    action={<button type="button" className="pa-btn" onClick={onClose} style={btn('secondary')}>Close</button>}
                />
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: S.lg }}>
                    <div style={{
                        background: T.purpleSoft, border: '1px solid rgba(167,139,250,0.35)',
                        borderRadius: R.md, padding: S.md,
                    }}>
                        <h4 style={{ fontSize: F.bodySm, fontWeight: 800, color: T.purple, margin: `0 0 ${S.md}px` }}>
                            Force solver result
                        </h4>

                        <div
                            role="group"
                            aria-label="Forced action"
                            style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: S.sm }}
                        >
                            {ACTIONS.map(a => {
                                const on = overrideType === a;
                                return (
                                    <button
                                        key={a}
                                        type="button"
                                        className="pa-btn"
                                        aria-pressed={on}
                                        onClick={() => setOverrideType(a)}
                                        style={{
                                            ...btn('secondary'), minHeight: 44, width: '100%', padding: '0 8px',
                                            fontSize: F.label,
                                            background: on ? T.purpleSoft : T.surface2,
                                            color: on ? T.purple : T.textMuted,
                                            borderColor: on ? 'rgba(167,139,250,0.5)' : T.borderHi,
                                        }}
                                    >
                                        {a}
                                    </button>
                                );
                            })}
                        </div>

                        <label
                            htmlFor="gm-ev"
                            style={{
                                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                fontSize: F.label, fontWeight: 700, color: T.textMuted,
                                margin: `${S.lg}px 0 ${S.xs}px`,
                            }}
                        >
                            <span>Forced EV delta</span>
                            <span style={{ ...numeric, color: T.purple }}>{Number(overrideEv).toFixed(2)} BB</span>
                        </label>
                        <div style={{ display: 'flex', alignItems: 'center', minHeight: 44 }}>
                            <input
                                id="gm-ev"
                                type="range"
                                min="-10" max="10" step="0.1"
                                value={overrideEv}
                                onChange={(e) => setOverrideEv(parseFloat(e.target.value))}
                                style={{ width: '100%', accentColor: T.purple, fontSize: F.input }}
                            />
                        </div>
                    </div>

                    <div style={{
                        background: T.surface2, border: `1px solid ${T.border}`, borderRadius: R.md, padding: S.md,
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: S.sm }}>
                            <h4 style={{ fontSize: F.bodySm, fontWeight: 800, color: T.text, margin: 0 }}>
                                Raw sandbox state
                            </h4>
                            <button
                                type="button"
                                className="pa-btn"
                                aria-expanded={showRawState}
                                onClick={() => setShowRawState(v => !v)}
                                style={{ ...btn('secondary'), padding: '0 14px', fontSize: F.label }}
                            >
                                {showRawState ? 'Hide' : 'Inspect'}
                            </button>
                        </div>
                        {showRawState && (
                            <pre style={{
                                margin: `${S.md}px 0 0`, padding: S.md, background: T.bg, borderRadius: R.sm,
                                fontSize: F.caption, color: T.success, overflowX: 'auto', maxHeight: 240,
                                lineHeight: 1.5, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                            }}>
                                {sandboxState ? JSON.stringify(sandboxState, null, 2) : 'No sandbox state passed to this panel.'}
                            </pre>
                        )}
                    </div>

                    <p style={{ fontSize: F.caption, color: T.textDim, margin: 0, lineHeight: 1.45 }}>
                        Injected results are tagged forcedMode and must never be persisted as coach results or
                        counted in accuracy stats.
                    </p>
                </div>
            )}
        </BottomSheet>
    );
}
