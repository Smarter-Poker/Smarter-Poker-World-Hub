/**
 * useTriviaIntegrityTelemetry
 *
 * Non-punitive client-side integrity signal collector for Trivia runs.
 * While `active === true`, listens for `visibilitychange` (tab blurs), `copy`,
 * and `paste` events, and records per-question answer latencies.
 *
 * `flushTelemetry(sessionId, mode, accuracyPct)` fires a non-blocking POST to
 * `/api/trivia/integrity-signal` and swallows all network/auth errors so
 * telemetry can never delay, block, or disrupt gameplay.
 */

import { useCallback, useEffect, useRef } from 'react';
import { UUID_RE } from '../lib/trivia/integrityAndElo.mjs';

const FAST_CORRECT_MS_THRESHOLD = 1500;
const MAX_ANSWER_MS = 600000;

export default function useTriviaIntegrityTelemetry({
    active = false,
    accessToken = null,
    accessTokenProvider = null,
} = {}) {
    const tabBlurCountRef = useRef(0);
    const copyAttemptCountRef = useRef(0);
    const pasteAttemptCountRef = useRef(0);
    const answerDurationsRef = useRef([]);
    const fastCorrectCountRef = useRef(0);
    const questionPresentedAtRef = useRef(null);
    const flushedSessionsRef = useRef(new Set());

    useEffect(() => {
        if (!active || typeof document === 'undefined') return undefined;

        if (questionPresentedAtRef.current === null) {
            questionPresentedAtRef.current = Date.now();
        }

        const handleVisibilityChange = () => {
            if (document.visibilityState === 'hidden') {
                tabBlurCountRef.current += 1;
            }
        };
        const handleCopy = () => {
            copyAttemptCountRef.current += 1;
        };
        const handlePaste = () => {
            pasteAttemptCountRef.current += 1;
        };

        document.addEventListener('visibilitychange', handleVisibilityChange);
        document.addEventListener('copy', handleCopy);
        document.addEventListener('paste', handlePaste);

        return () => {
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            document.removeEventListener('copy', handleCopy);
            document.removeEventListener('paste', handlePaste);
        };
    }, [active]);

    const markQuestionPresented = useCallback((now = Date.now()) => {
        questionPresentedAtRef.current = now;
    }, []);

    const recordAnswerTiming = useCallback(({ wasCorrect = false, now = Date.now() } = {}) => {
        const startedAt = questionPresentedAtRef.current;
        if (typeof startedAt === 'number' && Number.isFinite(startedAt)) {
            const elapsed = Math.min(MAX_ANSWER_MS, Math.max(0, Math.round(now - startedAt)));
            answerDurationsRef.current.push(elapsed);
            if (wasCorrect === true && elapsed > 0 && elapsed < FAST_CORRECT_MS_THRESHOLD) {
                fastCorrectCountRef.current += 1;
            }
        }
        questionPresentedAtRef.current = now;
    }, []);

    const resetTelemetry = useCallback(() => {
        tabBlurCountRef.current = 0;
        copyAttemptCountRef.current = 0;
        pasteAttemptCountRef.current = 0;
        answerDurationsRef.current = [];
        fastCorrectCountRef.current = 0;
        questionPresentedAtRef.current = Date.now();
    }, []);

    const getSnapshot = useCallback((accuracyPct = null) => {
        const durations = answerDurationsRef.current;
        const avgAnswerMs = durations.length > 0
            ? Math.round(durations.reduce((sum, ms) => sum + ms, 0) / durations.length)
            : null;
        const minAnswerMs = durations.length > 0
            ? Math.min(...durations)
            : null;
        const normalizedAccuracy = Number.isFinite(Number(accuracyPct))
            ? Math.min(100, Math.max(0, Math.round(Number(accuracyPct) * 100) / 100))
            : null;

        return {
            tabBlurCount: tabBlurCountRef.current,
            copyAttemptCount: copyAttemptCountRef.current,
            pasteAttemptCount: pasteAttemptCountRef.current,
            avgAnswerMs,
            minAnswerMs,
            fastCorrectCount: fastCorrectCountRef.current,
            accuracyPct: normalizedAccuracy,
        };
    }, []);

    const flushTelemetry = useCallback((sessionId, mode, accuracyPct = null) => {
        if (typeof fetch !== 'function') return;
        const cleanSessionId = typeof sessionId === 'string' ? sessionId.trim() : '';
        const cleanMode = typeof mode === 'string' ? mode.trim().toLowerCase() : '';
        if (!UUID_RE.test(cleanSessionId) || !cleanMode) return;
        if (flushedSessionsRef.current.has(cleanSessionId)) return;
        flushedSessionsRef.current.add(cleanSessionId);

        const payload = {
            sessionId: cleanSessionId,
            mode: cleanMode,
            ...getSnapshot(accuracyPct),
        };

        void (async () => {
            try {
                const headers = { 'Content-Type': 'application/json' };
                const token = typeof accessTokenProvider === 'function'
                    ? await accessTokenProvider()
                    : accessToken;
                if (typeof token === 'string' && token) {
                    headers.Authorization = `Bearer ${token}`;
                }
                await fetch('/api/trivia/integrity-signal', {
                    method: 'POST',
                    headers,
                    credentials: 'include',
                    keepalive: true,
                    body: JSON.stringify(payload),
                });
            } catch (_error) {
                // Non-punitive telemetry must never surface errors or block UI.
            }
        })();
    }, [accessToken, accessTokenProvider, getSnapshot]);

    return {
        markQuestionPresented,
        recordAnswerTiming,
        resetTelemetry,
        getSnapshot,
        flushTelemetry,
    };
}
