import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';

/**
 * Supabase Realtime subscription hook for Trivia PvP and Nightly Tournaments
 * with automatic graceful fallback to polling.
 *
 * When Realtime is SUBSCRIBED:
 *   - Incoming broadcast / postgres_changes events trigger a debounced onSync().
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
    const onSyncRef = useRef(onSync);
    const debounceRef = useRef(null);
    onSyncRef.current = onSync;

    const triggerSync = useCallback((payload = null) => {
        setLastEventAt(Date.now());
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => {
            debounceRef.current = null;
            try {
                onSyncRef.current?.(payload);
            } catch (err) {
                console.warn('[useTriviaRealtimeSync] onSync failed:', err?.message || err);
            }
        }, debounceMs);
    }, [debounceMs]);

    useEffect(() => {
        if (!enabled || !channelName || typeof window === 'undefined' || !supabase?.channel) {
            setStatus('idle');
            return undefined;
        }

        let cancelled = false;
        setStatus('connecting');

        let channel = null;
        try {
            channel = supabase.channel(channelName, {
                config: { broadcast: { self: false } },
            });

            for (const eventName of broadcastEvents) {
                channel = channel.on('broadcast', { event: eventName }, (payload) => {
                    if (!cancelled) triggerSync({ source: 'broadcast', event: eventName, payload });
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
                    setStatus('connected');
                } else if (nextStatus === 'CHANNEL_ERROR' || nextStatus === 'TIMED_OUT' || nextStatus === 'CLOSED') {
                    setStatus('fallback');
                }
            });
        } catch (err) {
            console.warn('[useTriviaRealtimeSync] subscribe failed, using polling fallback:', err?.message || err);
            setStatus('fallback');
        }

        return () => {
            cancelled = true;
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
    }, [channelName, enabled, table, filter, triggerSync, broadcastEvents.join(',')]);

    const connected = status === 'connected';
    const effectivePollMs = connected ? connectedPollMs : fallbackPollMs;

    return {
        connected,
        status,
        lastEventAt,
        effectivePollMs,
        triggerSync,
    };
}

export default useTriviaRealtimeSync;
