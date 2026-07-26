/**
 * TILT AWARENESS MONITOR (W5-2)
 * Tracks recent coach verdicts to detect tilt / losing streaks.
 * Shows context-aware warnings and recovery detection.
 */
import { useState, useEffect, useMemo } from 'react';

const M = {
    card: '#242526', border: '#3a3b3c',
    green: '#00E676', red: '#EF5350', gold: '#F5A623',
    text: '#E4E6EB', sub: '#B0B3B8', dim: 'rgba(255,255,255,0.4)',
};

const TILT_STATES = {
    none: null,
    mild: {
        emoji: '⚠️',
        title: 'Tilt Warning',
        message: '3 incorrect in a row. Take a breath before the next hand.',
        color: M.gold,
        bg: 'rgba(245,166,35,0.06)',
        borderColor: 'rgba(245,166,35,0.25)',
        vibrate: [20, 10, 20],
    },
    moderate: {
        emoji: '🛑',
        title: 'Cool Down Recommended',
        message: '5+ mistakes in the last 10 hands. Step away for a few minutes.',
        color: M.red,
        bg: 'rgba(239,83,80,0.06)',
        borderColor: 'rgba(239,83,80,0.25)',
        vibrate: [30, 20, 30, 20, 30],
    },
    recovery: {
        emoji: '✅',
        title: 'Recovery Detected',
        message: 'You\'re back on track! 2+ correct after a losing streak.',
        color: M.green,
        bg: 'rgba(0,230,118,0.06)',
        borderColor: 'rgba(0,230,118,0.25)',
        vibrate: [10],
    },
};

export default function TiltMonitor({ recentResults = [] }) {
    const [dismissed, setDismissed] = useState(false);
    const [lastState, setLastState] = useState('none');

    const tiltState = useMemo(() => {
        if (recentResults.length < 3) return 'none';

        const last10 = recentResults.slice(-10);
        const last3 = recentResults.slice(-3);
        const last5 = recentResults.slice(-5);

        // Count incorrect in last 10
        const incorrectLast10 = last10.filter(r => !r.isCorrect).length;

        // Check for 3 consecutive incorrect (last 3 all wrong)
        const allLast3Wrong = last3.every(r => !r.isCorrect);

        // Check for recovery: was in a losing streak but last 2 are correct
        const last2 = recentResults.slice(-2);
        const wasInStreak = last5.slice(0, 3).filter(r => !r.isCorrect).length >= 3;
        const last2Correct = last2.length >= 2 && last2.every(r => r.isCorrect);
        const isRecovery = wasInStreak && last2Correct;

        if (isRecovery) return 'recovery';
        if (incorrectLast10 >= 5) return 'moderate';
        if (allLast3Wrong) return 'mild';
        return 'none';
    }, [recentResults]);

    // Trigger haptic when state changes
    useEffect(() => {
        if (tiltState !== lastState && tiltState !== 'none') {
            setDismissed(false);
            setLastState(tiltState);
            const state = TILT_STATES[tiltState];
            if (state?.vibrate) {
                try { navigator.vibrate?.(state.vibrate); } catch (e) { console.warn('[App] Handled exception:', e?.message || e); }
            }
            // Dispatch bus event for tilt warnings
            if (tiltState === 'mild' || tiltState === 'moderate') {
                if (typeof window !== 'undefined') {
                    window.dispatchEvent(new CustomEvent('sandbox-tilt-warning', {
                        detail: { level: tiltState },
                    }));
                }
            }
        } else if (tiltState === 'none') {
            setLastState('none');
        }
    }, [tiltState, lastState]);

    // Recovery auto-dismisses after 5 seconds. Scheduling this in an effect (not
    // in the render body) keeps a re-render from stacking timers and from
    // dismissing a NEW warning that replaced the recovery banner.
    useEffect(() => {
        if (tiltState !== 'recovery') return undefined;
        const t = setTimeout(() => setDismissed(true), 5000);
        return () => clearTimeout(t);
    }, [tiltState]);

    if (tiltState === 'none' || dismissed) return null;

    const state = TILT_STATES[tiltState];
    if (!state) return null;

    return (
        <div style={{
            ...s.banner,
            background: state.bg,
            borderColor: state.borderColor,
        }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
                <span style={{ fontSize: 16 }}>{state.emoji}</span>
                <div>
                    <div style={{ fontSize: 11, fontWeight: 800, color: state.color }}>
                        {state.title}
                    </div>
                    <div style={{ fontSize: 9, color: M.sub, lineHeight: 1.4, marginTop: 1 }}>
                        {state.message}
                    </div>
                </div>
            </div>
            <button
                onClick={() => setDismissed(true)}
                style={s.dismissBtn}
            >
                ✕
            </button>
        </div>
    );
}

const s = {
    banner: {
        display: 'flex', alignItems: 'center',
        padding: '8px 10px',
        borderRadius: 10,
        border: '1px solid',
        marginBottom: 6,
        gap: 8,
    },
    dismissBtn: {
        background: 'none', border: 'none',
        color: M.dim, fontSize: 14, cursor: 'pointer',
        padding: '4px 6px',
        outline: 'none', WebkitTapHighlightColor: 'transparent',
    },
};
