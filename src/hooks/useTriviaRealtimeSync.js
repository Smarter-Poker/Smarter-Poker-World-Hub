import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';

/**
 * Extracts a positive monotonic sequence number from a Supabase Realtime
 * broadcast envelope (`{ payload: { seq } }` or `{ seq }`).
 */
export function extractRealtimeSeq(envelope) {
    if (!envelope || typeof envelope !== 'object') return null;
    const raw = envelope?.payload?.seq ?? envelope?.seq ?? null;
    const num = Number(raw);
    return Number.isSafeInteger(num) && num > 0 ? num : null;
}

/**
 * Pure deduplication helper for sequence-numbered realtime events.
 * Returns `{ accept: true, nextSeq }` for strictly newer or unsequenced events,
 * and `{ accept: false, nextSeq: lastSeq }` for duplicate/stale deliveries.
 */
export function evaluateRealtimeSeq(lastSeq, incomingEnvelope) {
    const prev = Number.isSafeInteger(lastSeq) && lastSeq > 0 ? lastSeq : 0;
    const seq = extractRealtimeSeq(incomingEnvelope);
    if (seq === null) {
        return { accept: true, seq: null, nextSeq: prev };
    }
    if (seq <= prev) {
        return { accept: false, seq, nextSeq: prev };
    }
    return { accept: true, seq, nextSeq: seq };
}

/**
 * Supabase Realtime subscription hook for Trivia PvP and Nightly Tournaments
 * with sequence deduplication, reconnect missed-event reconciliation, and
 * automatic graceful fallback to polling.
 *
 * When Realtime is SUBSCRIBED:
 *   - Incoming broadcast / postgres_changes events are sequence-deduplicated
 *     via `lastSeqRef` and trigger a debounced `onSync()`.
 *   - Reconnecting after a disconnect (`fallback`/`connecting` -> `connected`)
 *     automatically fires `onSync({ source: 'reconnect' })` to reconcile any
 *     state changes missed while offline.
 *   - Caller can slow its safety-net poll interval to `effectivePollMs` (`connectedPollMs`).
 * When Realtime is disconnected, unavailable, or errored:
 *   - `effectivePollMs` automatically drops back to `fallbackPollMs`.
 */
export function useTriviaRealtimeSync({
    channelName,
    enabled = true,
    broadcastEvents = ['state_update', 'bracket_update', 'match_update'],
    table = null,
    filter = null,
    fallbackPollMs = 8000,
    connectedPollMs = 30000,
    debounceMs = 450,
    onSync,
} = {}) {
    const [status, setStatus] = useState('idle');
    const [lastEventAt, setLastEventAt] = useState(null);
    const [reconnectCount, setReconnectCount] = useState(0);
    const onSyncRef = useRef(onSync);
    const debounceRef = useRef(null);
    const lastSeqRef = useRef(0);
    const hasConnectedOnceRef = useRef(false);
    const wasDisconnectedRef = useRef(false);
    const statusRef = useRef('idle');
    onSyncRef.current = onSync;

    const updateStatus = useCallback((next) => {
        statusRef.current = next;
        setStatus(next);
    }, []);

    const triggerSync = useCallback((payload = null, { immediate = false } = {}) => {
        setLastEventAt(Date.now());
        if (debounceRef.current) {
            clearTimeout(debounceRef.current);
            debounceRef.current = null;
        }
        const invoke = () => {
            try {
                onSyncRef.current?.(payload);
            } catch (err) {
                console.warn('[useTriviaRealtimeSync] onSync failed:', err?.message || err);
            }
        };
        if (immediate || debounceMs <= 0) {
            invoke();
            return;
        }
        debounceRef.current = setTimeout(() => {
            debounceRef.current = null;
            invoke();
        }, debounceMs);
    }, [debounceMs]);

    useEffect(() => {
        lastSeqRef.current = 0;
        hasConnectedOnceRef.current = false;
        wasDisconnectedRef.current = false;

        if (!enabled || !channelName || typeof window === 'undefined' || !supabase?.channel) {
            updateStatus('idle');
            return undefined;
        }

        let cancelled = false;
        updateStatus('connecting');

        let channel = null;
        try {
            channel = supabase.channel(channelName, {
                config: { broadcast: { self: false } },
            });

            for (const eventName of broadcastEvents) {
                channel = channel.on('broadcast', { event: eventName }, (payload) => {
                    if (cancelled) return;
                    const decision = evaluateRealtimeSeq(lastSeqRef.current, payload);
                    if (!decision.accept) return;
                    lastSeqRef.current = decision.nextSeq;
                    triggerSync({
                        source: 'broadcast',
                        event: eventName,
                        seq: decision.seq,
                        payload,
                    });
                });
            }

            if (table) {
                const changeConfig = {
                    event: '*',
                    schema: 'public',
                    table,
                    ...(filter ? { filter } : {}),
                };
                channel = channel.on('postgres_changes', changeConfig, (payload) => {
                    if (!cancelled) triggerSync({ source: 'postgres_changes', table, payload });
                });
            }

            channel.subscribe((nextStatus) => {
                if (cancelled) return;
                if (nextStatus === 'SUBSCRIBED') {
                    const shouldReconcile = wasDisconnectedRef.current
                        || (hasConnectedOnceRef.current && statusRef.current !== 'connected');
                    hasConnectedOnceRef.current = true;
                    wasDisconnectedRef.current = false;
                    updateStatus('connected');
                    if (shouldReconcile) {
                        setReconnectCount((count) => count + 1);
                        triggerSync(
                            {
                                source: 'reconnect',
                                channelName,
                                lastSeq: lastSeqRef.current,
                                reconnectedAt: Date.now(),
                            },
                            { immediate: true },
                        );
                    }
                } else if (nextStatus === 'CHANNEL_ERROR' || nextStatus === 'TIMED_OUT' || nextStatus === 'CLOSED') {
                    wasDisconnectedRef.current = true;
                    updateStatus('fallback');
                }
            });
        } catch (err) {
            console.warn('[useTriviaRealtimeSync] subscribe failed, using polling fallback:', err?.message || err);
            wasDisconnectedRef.current = true;
            updateStatus('fallback');
        }

        const handleOnline = () => {
            if (cancelled) return;
            if (wasDisconnectedRef.current || statusRef.current === 'fallback') {
                triggerSync(
                    {
                        source: 'reconnect',
                        reason: 'browser_online',
                        channelName,
                        lastSeq: lastSeqRef.current,
                        reconnectedAt: Date.now(),
                    },
                    { immediate: true },
                );
            }
        };

        if (typeof window.addEventListener === 'function') {
            window.addEventListener('online', handleOnline);
        }

        return () => {
            cancelled = true;
            if (typeof window.removeEventListener === 'function') {
                window.removeEventListener('online', handleOnline);
            }
            if (debounceRef.current) {
                clearTimeout(debounceRef.current);
                debounceRef.current = null;
            }
            if (channel) {
                try {
                    supabase.removeChannel(channel);
                } catch (err) {
                    console.warn('[useTriviaRealtimeSync] cleanup warning:', err?.message || err);
                }
            }
        };
    }, [channelName, enabled, table, filter, triggerSync, updateStatus, broadcastEvents.join(',')]);

    const connected = status === 'connected';
    const effectivePollMs = connected ? connectedPollMs : fallbackPollMs;

    return {
        connected,
        status,
        lastEventAt,
        lastSeq: lastSeqRef.current,
        reconnectCount,
        effectivePollMs,
        triggerSync,
    };
}

export default useTriviaRealtimeSync;
