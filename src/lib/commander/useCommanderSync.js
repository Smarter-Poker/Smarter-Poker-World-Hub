/**
 * useCommanderSync — Hardened Two-Layer Real-Time Sync for Commander
 * ═══════════════════════════════════════════════════════════════════
 *
 * Layer 1: BroadcastChannel (instant, same browser, zero cost)
 *   When any tab writes data, it calls broadcastChange('tables').
 *   All OTHER tabs hear it and refetch instantly.
 *   Self-tab broadcasts are suppressed via tab ID.
 *
 * Layer 2: Supabase Realtime (cross-device, ~1s)
 *   Subscribes to postgres_changes on shared Commander tables.
 *   Auto-reconnects on channel errors.
 *
 * Hardening Features:
 *   ✓ Tab visibility awareness — skips refetch when hidden, catches up on focus
 *   ✓ Online/offline resilience — refetches when network comes back
 *   ✓ Self-tab suppression — won't refetch from your own broadcasts
 *   ✓ Per-instance throttle — prevents refetch storms (max 1 per 500ms)
 *   ✓ Supabase reconnect — retries on channel failure
 *   ✓ Stale closure prevention — uses refs for callbacks
 *   ✓ SSR-safe — all browser APIs guarded
 *
 * Usage:
 *   useCommanderSync(venueId, fetchData);
 *
 *   import { broadcastChange } from '.../useCommanderSync';
 *   await fetch('/api/...');
 *   broadcastChange('tables');
 */
import { useEffect, useRef } from 'react';
import { supabase } from '../supabase';

// ─── Constants ─────────────────────────────────────────────────
const CHANNEL_NAME = 'commander-sync';
const THROTTLE_MS = 500;       // Max 1 refetch per 500ms per hook instance
const RECONNECT_DELAY = 3000;  // Retry after 3s on Supabase channel failure
const MAX_RECONNECT = 5;       // Max reconnect attempts before giving up

// Unique ID for this tab — used to suppress self-broadcasts
const TAB_ID = typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `tab_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

// ─── broadcastChange ───────────────────────────────────────────
/**
 * Broadcast a data change to all other open Commander tabs.
 * Call this AFTER a successful write (POST/PUT/PATCH/DELETE).
 *
 * @param {string} entity - What changed: 'tables' | 'games' | 'floor_calls' | 'waitlist' | 'settings'
 */
export function broadcastChange(entity) {
    try {
        if (typeof BroadcastChannel === 'undefined') return;
        const bc = new BroadcastChannel(CHANNEL_NAME);
        bc.postMessage({
            type: 'data-changed',
            entity,
            tabId: TAB_ID,
            ts: Date.now(),
        });
        bc.close();
    } catch {
        // BroadcastChannel not supported or SecurityError in cross-origin iframe — silent
    }
}

// ─── useCommanderSync ──────────────────────────────────────────
/**
 * Hook: listen for cross-tab + cross-device changes and auto-refetch.
 *
 * @param {string|number} venueId - Venue to subscribe to
 * @param {function} onRefetch - Called when data changes are detected
 * @param {object} [opts] - Options
 * @param {string[]} [opts.tables] - Supabase tables to subscribe to
 */
export function useCommanderSync(venueId, onRefetch, opts = {}) {
    const refetchRef = useRef(onRefetch);
    refetchRef.current = onRefetch;

    const channelRef = useRef(null);
    const lastRefetchRef = useRef(0);
    const pendingWhileHiddenRef = useRef(false);
    const reconnectCountRef = useRef(0);

    // ── Throttled refetch ───────────────────────────────────────
    const throttledRefetch = () => {
        const now = Date.now();
        const elapsed = now - lastRefetchRef.current;

        // If tab is hidden, queue the refetch for when it becomes visible
        if (typeof document !== 'undefined' && document.hidden) {
            pendingWhileHiddenRef.current = true;
            return;
        }

        if (elapsed < THROTTLE_MS) {
            // Schedule for after throttle window
            setTimeout(() => {
                lastRefetchRef.current = Date.now();
                refetchRef.current?.();
            }, THROTTLE_MS - elapsed);
        } else {
            lastRefetchRef.current = now;
            refetchRef.current?.();
        }
    };

    // ── Layer 1: BroadcastChannel (same browser, instant) ───────
    useEffect(() => {
        if (typeof BroadcastChannel === 'undefined') return;

        const bc = new BroadcastChannel(CHANNEL_NAME);
        bc.onmessage = (event) => {
            const msg = event.data;
            if (msg?.type !== 'data-changed') return;

            // Suppress self-tab broadcasts — this tab already has fresh data
            if (msg.tabId === TAB_ID) return;

            // Guard against stale messages (older than 10s)
            if (msg.ts && Date.now() - msg.ts > 10000) return;

            throttledRefetch();
        };

        bc.onmessageerror = () => {
            // Corrupted message — ignore silently
        };

        return () => {
            try { bc.close(); } catch { /* already closed */ }
        };
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // ── Visibility + Online awareness ───────────────────────────
    useEffect(() => {
        if (typeof document === 'undefined' || typeof window === 'undefined') return;

        const handleVisibility = () => {
            if (!document.hidden && pendingWhileHiddenRef.current) {
                pendingWhileHiddenRef.current = false;
                // Small delay to let rendering settle after tab focus
                setTimeout(() => {
                    lastRefetchRef.current = Date.now();
                    refetchRef.current?.();
                }, 100);
            }
        };

        const handleOnline = () => {
            // Network came back — refetch to catch up
            lastRefetchRef.current = Date.now();
            refetchRef.current?.();
        };

        document.addEventListener('visibilitychange', handleVisibility);
        window.addEventListener('online', handleOnline);

        return () => {
            document.removeEventListener('visibilitychange', handleVisibility);
            window.removeEventListener('online', handleOnline);
        };
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // ── Layer 2: Supabase Realtime (cross-device) ───────────────
    useEffect(() => {
        if (!venueId) return;
        const client = supabase;
        if (!client) return;

        const listenTables = opts.tables || [
            'commander_tables',
            'commander_games',
            'commander_waitlist',
            'commander_floor_calls',
        ];

        const connectChannel = () => {
            // Clean up any existing channel first
            if (channelRef.current) {
                try { client.removeChannel(channelRef.current); } catch { /* ignore */ }
                channelRef.current = null;
            }

            const channel = client.channel(`commander-sync:${venueId}:${Date.now()}`);

            listenTables.forEach(table => {
                channel.on(
                    'postgres_changes',
                    {
                        event: '*',
                        schema: 'public',
                        table,
                        filter: table === 'commander_seats' ? undefined : `venue_id=eq.${venueId}`,
                    },
                    () => throttledRefetch()
                );
            });

            channel.subscribe((status) => {
                if (status === 'SUBSCRIBED') {
                    reconnectCountRef.current = 0; // Reset on success
                } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
                    // Auto-reconnect with backoff
                    if (reconnectCountRef.current < MAX_RECONNECT) {
                        reconnectCountRef.current++;
                        const delay = RECONNECT_DELAY * reconnectCountRef.current;
                        setTimeout(() => {
                            if (channelRef.current === channel) {
                                connectChannel();
                            }
                        }, delay);
                    }
                }
            });

            channelRef.current = channel;
        };

        connectChannel();

        return () => {
            if (channelRef.current) {
                try { client.removeChannel(channelRef.current); } catch { /* ignore */ }
                channelRef.current = null;
            }
        };
    }, [venueId]); // eslint-disable-line react-hooks/exhaustive-deps
}

export default useCommanderSync;
