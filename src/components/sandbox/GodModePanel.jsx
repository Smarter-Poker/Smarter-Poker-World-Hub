/**
 * SANDBOX GOD MODE (W6-5)
 * Admin-only utility panel for forcing specific solver outcomes, testing experimental 
 * ranges, and inspecting raw EV metrics without gameplay filtering.
 */
import { useState } from 'react';
import { motion } from 'framer-motion';

const M = {
    bg: '#18191A', card: '#242526', border: '#3E4042',
    accent: '#4599FF', green: '#00cc6a', text: '#E4E6EB', sub: '#B0B3B8', red: '#EF5350'
};

const ACTIONS = ['Fold', 'Check', 'Call', 'Bet', 'Raise'];

/**
 * God Mode injects fabricated solver output, so it must never be reachable by
 * ordinary users. The panel gates itself: an explicit isAdmin prop wins, then a
 * locally-stored admin flag, and finally non-production builds.
 */
function hasGodModeAccess(isAdmin) {
    if (isAdmin === true) return true;
    if (isAdmin === false) return false;
    try {
        if (typeof window !== 'undefined' && window.localStorage?.getItem('sp-god-mode-admin') === 'true') return true;
    } catch (e) { console.warn('[App] Handled exception:', e?.message || e); }
    return process.env.NODE_ENV !== 'production';
}

export default function GodModePanel({ onClose, setResults, sandboxState, isAdmin }) {
    const [overrideType, setOverrideType] = useState('Call');
    const [overrideEv, setOverrideEv] = useState(0.5);
    const [showRawState, setShowRawState] = useState(false);

    const allowed = hasGodModeAccess(isAdmin);

    const applyForceOverride = () => {
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
            isCorrect: false, // forces the coach logic to trigger on a "bad" play if we want
            explanation: `God Mode forced result: ${overrideType} at 100%.`,
            forcedMode: true,
        };

        if (typeof setResults !== 'function') {
            console.warn('[GodModePanel] setResults handler missing — nothing injected');
            onClose?.();
            return;
        }
        setResults(mockResults);
        onClose?.();
    };

    return (
        <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100005, padding: 16 }}
            onClick={onClose}
        >
            <motion.div
                initial={{ scale: 0.95, y: 10 }} animate={{ scale: 1, y: 0 }}
                onClick={e => e.stopPropagation()}
                style={{ background: '#0b001a', borderRadius: 16, width: '100%', maxWidth: 640, border: `1px solid #7c3aed`, boxShadow: '0 12px 48px rgba(124,58,237,0.4)', overflow: 'hidden' }}
            >
                <div style={{ padding: '20px', borderBottom: `1px solid rgba(124,58,237,0.3)`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ fontSize: 18, fontWeight: 800, color: '#c4b5fd', display: 'flex', alignItems: 'center', gap: 8 }}>
                        {'⚡ Sandbox God Mode'}
                        <span style={{ fontSize: 10, background: '#7c3aed', color: '#fff', padding: '2px 6px', borderRadius: 4 }}>ADMIN ONLY</span>
                    </div>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#8b5cf6', fontSize: 18, cursor: 'pointer' }}>✕</button>
                </div>

                {!allowed ? (
                    <div style={{ padding: 24, textAlign: 'center' }}>
                        <div style={{ fontSize: 14, fontWeight: 700, color: '#ddd6fe', marginBottom: 6 }}>Admin access required</div>
                        <div style={{ fontSize: 12, color: M.sub, lineHeight: 1.5 }}>
                            God Mode injects fabricated solver output and is restricted to staff accounts.
                        </div>
                        <button
                            onClick={onClose}
                            style={{ marginTop: 16, padding: '10px 20px', background: 'rgba(255,255,255,0.06)', color: M.text, border: `1px solid ${M.border}`, borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
                        >
                            Close
                        </button>
                    </div>
                ) : (
                <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 20 }}>
                    {/* Solver Force Switch */}
                    <div style={{ background: 'rgba(124,58,237,0.1)', border: '1px solid rgba(124,58,237,0.3)', borderRadius: 12, padding: 16 }}>
                        <div style={{ fontSize: 14, fontWeight: 700, color: '#ddd6fe', marginBottom: 12 }}>Force Solver Result</div>

                        <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
                            {ACTIONS.map(a => (
                                <button
                                    key={a}
                                    onClick={() => setOverrideType(a)}
                                    style={{ flex: 1, padding: '8px', background: overrideType === a ? '#7c3aed' : 'rgba(255,255,255,0.05)', color: overrideType === a ? '#fff' : '#a78bfa', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
                                >
                                    {a}
                                </button>
                            ))}
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                            <div style={{ flex: 1 }}>
                                <div style={{ fontSize: 12, color: '#a78bfa', marginBottom: 4 }}>Forced EV Delta ({overrideEv.toFixed(2)})</div>
                                <input
                                    type="range" min="-10" max="10" step="0.1" value={overrideEv} onChange={(e) => setOverrideEv(parseFloat(e.target.value))}
                                    style={{ width: '100%', accentColor: '#7c3aed' }}
                                />
                            </div>
                            <button
                                onClick={applyForceOverride}
                                style={{ padding: '12px 24px', background: '#ec4899', color: '#fff', fontSize: 14, fontWeight: 800, border: 'none', borderRadius: 8, cursor: 'pointer' }}
                            >
                                Inject
                            </button>
                        </div>
                    </div>

                    {/* Raw State Inspector */}
                    <div style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid #3E4042', borderRadius: 12, padding: 16 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: showRawState ? 12 : 0 }}>
                            <div style={{ fontSize: 14, fontWeight: 700, color: M.text }}>Raw Sandbox State JSON</div>
                            <button onClick={() => setShowRawState(!showRawState)} style={{ background: 'none', border: '1px solid #555', color: M.sub, padding: '4px 8px', borderRadius: 4, fontSize: 11, cursor: 'pointer' }}>
                                {showRawState ? 'Hide' : 'Inspect'}
                            </button>
                        </div>
                        {showRawState && (
                            <pre style={{ margin: 0, padding: 12, background: '#000', borderRadius: 8, fontSize: 11, color: '#4ade80', overflowX: 'auto', maxHeight: 200 }}>
                                {sandboxState
                                    ? JSON.stringify(sandboxState, null, 2)
                                    : 'No sandbox state passed to this panel.'}
                            </pre>
                        )}
                    </div>
                </div>
                )}
            </motion.div>
        </motion.div>
    );
}
