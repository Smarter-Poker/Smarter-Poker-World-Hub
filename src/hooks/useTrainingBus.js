/**
 * 🚌 useTrainingBus — Reusable Bus Hook for Training Pages
 * ═══════════════════════════════════════════════════════════════════════════
 * Auto-emits SESSION_START on mount and SESSION_END on unmount.
 * Exposes decision emitters for interactive pages.
 *
 * Usage:
 *   const bus = useTrainingBus('preflop-charts', { position: 'BTN' });
 *   bus.emitDecisionCorrect();
 *   bus.emitHandComplete({ hand: 'AKs', result: 'correct' });
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { useEffect, useRef, useCallback } from 'react';
import { eventBus, EventType, busEmit } from '../engine/EventBus';

export default function useTrainingBus(pageName, context = {}) {
    const startTimeRef = useRef(null);
    const mountedRef = useRef(false);

    // ─── Session Start / End ─────────────────────────────────────────
    useEffect(() => {
        if (mountedRef.current) return;
        mountedRef.current = true;
        startTimeRef.current = Date.now();

        eventBus.emit(EventType.SESSION_START, {
            page: pageName,
            ...context,
            timestamp: new Date().toISOString(),
        }, pageName);

        return () => {
            const duration = Date.now() - (startTimeRef.current || Date.now());
            eventBus.emit(EventType.SESSION_END, {
                page: pageName,
                ...context,
                duration_ms: duration,
                duration_s: Math.round(duration / 1000),
                timestamp: new Date().toISOString(),
            }, pageName);
        };
    }, [pageName]); // Only on mount/unmount

    // ─── Decision Emitters ───────────────────────────────────────────
    const emitDecisionCorrect = useCallback((streak = 0) => {
        busEmit.decisionCorrect(streak);
    }, []);

    const emitDecisionIncorrect = useCallback((lostStreak = false) => {
        busEmit.decisionIncorrect(lostStreak);
    }, []);

    const emitHandComplete = useCallback((data = {}) => {
        eventBus.emit(EventType.HAND_COMPLETE, {
            page: pageName,
            ...data,
        }, pageName);
    }, [pageName]);

    const emitDiamondsEarned = useCallback((amount, reason) => {
        busEmit.diamondsEarned(amount, reason);
    }, []);

    const emitCelebration = useCallback((type = 'confetti') => {
        busEmit.celebration(type);
    }, []);

    return {
        emitDecisionCorrect,
        emitDecisionIncorrect,
        emitHandComplete,
        emitDiamondsEarned,
        emitCelebration,
    };
}
