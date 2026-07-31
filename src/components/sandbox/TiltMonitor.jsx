/**
 * TILT AWARENESS MONITOR (W5-2)
 * Tracks recent coach verdicts to detect tilt / losing streaks.
 *
 * Behaviour notes:
 *  - The recovery window is `slice(-5,-2)` so it can never overlap the last two
 *    results (the old `slice(-5).slice(0,3)` fired "recovery" off 3 hands).
 *  - Dismissing re-arms: once four more results land while still in a warning
 *    state, the banner comes back. Dismiss used to be permanent per level.
 *  - At `moderate` the banner offers a real, visible 60-second cooldown timer
 *    and broadcasts `sandbox-tilt-cooldown` so the page can gate Analyze.
 */
import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { AlertTriangle, AlertOctagon, CheckCircle2, X, Coffee } from 'lucide-react';
import { T, F, S, R, btn, iconBtn, numeric } from './paTokens';
import { PAStyles, usePrefersReducedMotion } from './paKit';

const COOLDOWN_SECONDS = 60;
const REARM_AFTER = 4;

const TILT_STATES = {
    none: null,
    mild: {
        Icon: AlertTriangle,
        title: 'Tilt warning',
        message: 'Three incorrect in a row. Take a breath before the next hand.',
        color: T.warn,
        bg: T.warnSoft,
        borderColor: 'rgba(251,191,36,0.4)',
        vibrate: [20, 10, 20],
        offerBreak: false,
    },
    moderate: {
        Icon: AlertOctagon,
        title: 'Cool down recommended',
        message: 'Five or more mistakes in the last ten hands. Step away for a minute.',
        color: T.danger,
        bg: T.dangerSoft,
        borderColor: 'rgba(239,68,68,0.4)',
        vibrate: [30, 20, 30, 20, 30],
        offerBreak: true,
    },
    recovery: {
        Icon: CheckCircle2,
        title: 'Recovery detected',
        message: 'Back on track — two correct in a row after a losing streak.',
        color: T.success,
        bg: T.successSoft,
        borderColor: 'rgba(34,197,94,0.4)',
        vibrate: [10],
        offerBreak: false,
    },
};

export default function TiltMonitor({ recentResults = [] }) {
    const reduce = usePrefersReducedMotion();
    const [dismissedAt, setDismissedAt] = useState(null); // recentResults.length at dismissal
    const [lastState, setLastState] = useState('none');
    const [cooldownLeft, setCooldownLeft] = useState(0);
    const cooldownRef = useRef(null);

    const results = Array.isArray(recentResults) ? recentResults : [];

    const tiltState = useMemo(() => {
        if (results.length < 3) return 'none';

        const last10 = results.slice(-10);
        const last3 = results.slice(-3);
        const last2 = results.slice(-2);

        const incorrectLast10 = last10.filter(r => !r?.isCorrect).length;
        const allLast3Wrong = last3.length === 3 && last3.every(r => !r?.isCorrect);

        // Recovery: the three results BEFORE the last two were a losing streak,
        // and the last two are both correct. Needs >= 5 results to be meaningful.
        const priorWindow = results.length >= 5 ? results.slice(-5, -2) : [];
        const wasInStreak = priorWindow.length === 3 && priorWindow.every(r => !r?.isCorrect);
        const last2Correct = last2.length === 2 && last2.every(r => r?.isCorrect);

        if (wasInStreak && last2Correct) return 'recovery';
        if (incorrectLast10 >= 5) return 'moderate';
        if (allLast3Wrong) return 'mild';
        return 'none';
    }, [results]);

    // Haptics + bus event on state change
    useEffect(() => {
        if (tiltState !== lastState && tiltState !== 'none') {
            setDismissedAt(null);
            setLastState(tiltState);
            const state = TILT_STATES[tiltState];
            if (state?.vibrate && !reduce) {
                try { navigator.vibrate?.(state.vibrate); } catch (e) { console.warn('[App] Handled exception:', e?.message || e); }
            }
            if ((tiltState === 'mild' || tiltState === 'moderate') && typeof window !== 'undefined') {
                window.dispatchEvent(new CustomEvent('sandbox-tilt-warning', { detail: { level: tiltState } }));
            }
        } else if (tiltState === 'none' && lastState !== 'none') {
            setLastState('none');
            setDismissedAt(null);
        }
    }, [tiltState, lastState, reduce]);

    // Recovery auto-dismisses after 5s (effect, so re-renders cannot stack timers).
    useEffect(() => {
        if (tiltState !== 'recovery') return undefined;
        const t = setTimeout(() => setDismissedAt(results.length), 5000);
        return () => clearTimeout(t);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tiltState]);

    useEffect(() => () => { if (cooldownRef.current) clearInterval(cooldownRef.current); }, []);

    const startCooldown = useCallback(() => {
        if (cooldownRef.current) clearInterval(cooldownRef.current);
        const deadline = Date.now() + COOLDOWN_SECONDS * 1000;
        setCooldownLeft(COOLDOWN_SECONDS);
        if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('sandbox-tilt-cooldown', { detail: { ms: COOLDOWN_SECONDS * 1000 } }));
        }
        cooldownRef.current = setInterval(() => {
            const left = Math.ceil((deadline - Date.now()) / 1000);
            if (left <= 0) {
                clearInterval(cooldownRef.current);
                cooldownRef.current = null;
                setCooldownLeft(0);
                setDismissedAt(null);
                if (typeof window !== 'undefined') {
                    window.dispatchEvent(new CustomEvent('sandbox-tilt-cooldown-end'));
                }
            } else {
                setCooldownLeft(left);
            }
        }, 250);
    }, []);

    // Re-arm: four more results while still in a warning state brings it back.
    const dismissed = dismissedAt != null && (results.length - dismissedAt) < REARM_AFTER;

    if (tiltState === 'none' || (dismissed && cooldownLeft === 0)) return null;

    const state = TILT_STATES[tiltState];
    if (!state) return null;
    const { Icon } = state;

    return (
        <div
            role="status"
            aria-live="polite"
            style={{
                display: 'flex', alignItems: 'flex-start', gap: S.sm,
                padding: S.md, borderRadius: R.md,
                border: `1px solid ${state.borderColor}`, background: state.bg,
                marginBottom: S.sm, boxSizing: 'border-box', width: '100%',
            }}
        >
            <PAStyles />
            <Icon size={20} strokeWidth={2} color={state.color} style={{ flexShrink: 0, marginTop: 2 }} />

            <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: F.bodySm, fontWeight: 800, color: state.color }}>
                    {state.title}
                </div>
                <div style={{ fontSize: F.caption, color: T.textMuted, lineHeight: 1.45, marginTop: 2 }}>
                    {cooldownLeft > 0
                        ? 'Breathe. The next hand will still be there.'
                        : state.message}
                </div>

                {cooldownLeft > 0 ? (
                    <div style={{ marginTop: S.sm }}>
                        <div style={{
                            fontSize: F.h2, fontWeight: 800, color: state.color, ...numeric,
                        }}>
                            {cooldownLeft}s
                        </div>
                        <div style={{ height: 6, background: T.surface2, borderRadius: R.pill, overflow: 'hidden', marginTop: S.xs }}>
                            <div style={{
                                width: `${(cooldownLeft / COOLDOWN_SECONDS) * 100}%`, height: '100%',
                                background: state.color, borderRadius: R.pill,
                                transition: reduce ? 'none' : 'width .25s linear',
                            }} />
                        </div>
                    </div>
                ) : state.offerBreak && (
                    <button
                        type="button"
                        className="pa-btn"
                        onClick={startCooldown}
                        style={{ ...btn('danger'), marginTop: S.sm }}
                    >
                        <Coffee size={18} strokeWidth={2} />
                        Take a {COOLDOWN_SECONDS}s break
                    </button>
                )}
            </div>

            <button
                type="button"
                className="pa-btn"
                onClick={() => {
                    if (cooldownRef.current) { clearInterval(cooldownRef.current); cooldownRef.current = null; }
                    setCooldownLeft(0);
                    setDismissedAt(results.length);
                }}
                aria-label="Dismiss tilt warning"
                style={iconBtn({ transparent: true, color: T.textMuted })}
            >
                <X size={18} strokeWidth={2} />
            </button>
        </div>
    );
}
