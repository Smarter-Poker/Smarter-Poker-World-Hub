/**
 * ═══════════════════════════════════════════════════════════════
 * useIdempotentAction — Fat Finger / Double-Tap Defense Hook
 * ═══════════════════════════════════════════════════════════════
 *
 * Prevents duplicate mutation submissions via:
 *   1. UI-side debounce (configurable cooldown)
 *   2. X-Idempotency-Key header per unique action
 *   3. In-flight request tracking
 *
 * Usage:
 *   const { execute, isLoading, lastResult } = useIdempotentAction();
 *
 *   const reviewFlag = () => execute({
 *     url: '/api/club-arena/anti-cheat',
 *     body: { action: 'review_flag', clubId, flagId, newStatus: 'reviewed' },
 *     debounceMs: 1000,
 *   });
 * ═══════════════════════════════════════════════════════════════
 */
import { useState, useRef, useCallback } from 'react';

export function useIdempotentAction(defaultDebounceMs = 1000) {
    const [isLoading, setIsLoading] = useState(false);
    const [lastResult, setLastResult] = useState(null);
    const inFlightRef = useRef(false);
    const cooldownRef = useRef(null);

    const execute = useCallback(async ({
        url,
        body,
        token,
        debounceMs = defaultDebounceMs,
        idempotencyKey = null,
    }) => {
        // Guard 1: In-flight request already running
        if (inFlightRef.current) {
            console.warn('[IdempotentAction] Request already in flight - ignoring duplicate');
            return { success: false, reason: 'in_flight', replayed: false };
        }

        // Guard 2: Cooldown period active (fat-finger debounce)
        if (cooldownRef.current) {
            console.warn('[IdempotentAction] Cooldown active - ignoring duplicate');
            return { success: false, reason: 'cooldown', replayed: false };
        }

        // Generate idempotency key if not provided
        const key = idempotencyKey || `${body?.action || 'mutation'}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

        inFlightRef.current = true;
        setIsLoading(true);

        try {
            const headers = {
                'Content-Type': 'application/json',
                'X-Idempotency-Key': key,
            };
            if (token) headers['Authorization'] = `Bearer ${token}`;

            const res = await fetch(url, {
                method: 'POST',
                headers,
                body: JSON.stringify(body),
            });

            const data = await res.json().catch(() => ({}));
            const replayed = res.headers.get('X-Idempotent-Replayed') === 'true';

            const result = {
                success: res.ok,
                status: res.status,
                data,
                replayed,
                idempotencyKey: key,
            };

            setLastResult(result);

            // Start cooldown timer
            cooldownRef.current = setTimeout(() => {
                cooldownRef.current = null;
            }, debounceMs);

            return result;
        } catch (err) {
            const errResult = { success: false, error: err.message, replayed: false };
            setLastResult(errResult);
            return errResult;
        } finally {
            inFlightRef.current = false;
            setIsLoading(false);
        }
    }, [defaultDebounceMs]);

    const reset = useCallback(() => {
        if (cooldownRef.current) {
            clearTimeout(cooldownRef.current);
            cooldownRef.current = null;
        }
        inFlightRef.current = false;
        setIsLoading(false);
        setLastResult(null);
    }, []);

    return { execute, isLoading, lastResult, reset };
}

export default useIdempotentAction;
