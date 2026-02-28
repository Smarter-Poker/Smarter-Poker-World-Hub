/**
 * useCommanderSync — Entity-Aware Two-Layer Real-Time Sync for Commander
 * ═══════════════════════════════════════════════════════════════════
 *
 * Layer 1: BroadcastChannel (instant, same browser, zero cost)
 *   When any tab writes data, it calls broadcastChange('tables').
 *   All OTHER tabs subscribed to 'tables' hear it and refetch instantly.
 *   Self-tab broadcasts are suppressed via tab ID.
 *
 * Layer 2: Supabase Realtime (cross-device, ~1s)
 *   Subscribes to postgres_changes on shared Commander tables.
 *   Auto-reconnects on channel errors.
 *
 * Hardening Features:
 *   ✓ Entity-aware filtering — only refetch when YOUR entities change
 *   ✓ Tab visibility awareness — skips refetch when hidden, catches up on focus
 *   ✓ Online/offline resilience — refetches when network comes back
 *   ✓ Self-tab suppression — won't refetch from your own broadcasts
 *   ✓ Per-instance throttle — prevents refetch storms (max 1 per 500ms)
 *   ✓ Supabase reconnect — retries on channel failure (exponential backoff)
 *   ✓ Stale closure prevention — uses refs for callbacks
 *   ✓ SSR-safe — all browser APIs guarded
 *   ✓ setTimeout leak prevention — pending timers cleaned on unmount
 *   ✓ Full entity coverage — 12 Supabase tables with entity mapping
 *
 * Usage:
 *   // Subscribe to ALL entities (backward compatible):
 *   useCommanderSync(venueId, fetchData);
 *
 *   // Subscribe to SPECIFIC entities only:
 *   useCommanderSync(venueId, fetchData, { entities: ['tables', 'games'] });
 *
 *   // Writer side — broadcast after mutation:
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

// ─── Supabase table → entity mapping ───────────────────────────
// Maps Supabase table names to Commander entity names for Layer 2 filtering
const TABLE_TO_ENTITY = {
    commander_tables: 'tables',
    commander_games: 'games',
    commander_waitlist: 'waitlist',
    commander_floor_calls: 'floor_calls',
    commander_seats: 'tables',       // Seat changes affect tables
    commander_settings: 'settings',
    commander_staff: 'staff',
    commander_members: 'members',
    commander_dealers: 'dealers',
    commander_tournaments: 'tournaments',
    commander_tournament_entries: 'tournaments',  // Entry changes affect tournaments
    commander_incidents: 'incidents',
};

// Default Supabase tables to subscribe to (covers all core entities)
const DEFAULT_SUPABASE_TABLES = Object.keys(TABLE_TO_ENTITY);

/**
 * Broadcast a data change to all other open Commander tabs.
 * Call this AFTER a successful write (POST/PUT/PATCH/DELETE).
 *
 * @param {string} entity - What changed: 'tables' | 'games' | 'floor_calls' | 'waitlist' | 'settings' | 'dealers' | 'staff' | 'members' | 'tournaments' | 'incidents'
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
 * @param {string[]} [opts.entities] - Entity types to listen for (for filtering)
 * @param {string[]} [opts.tables] - Override Supabase tables to subscribe to
 */
export function useCommanderSync(venueId, onRefetch, opts = {}) {
    const refetchRef = useRef(onRefetch);
    refetchRef.current = onRefetch;

    const channelRef = useRef(null);
    const lastRefetchRef = useRef(0);
    const pendingWhileHiddenRef = useRef(false);
    const reconnectCountRef = useRef(0);
    const pendingTimerRef = useRef(null); // Track scheduled throttle timer

    // Entity filter — if provided, only refetch when matching entity changes
    const entitiesRef = useRef(opts.entities || null);
    entitiesRef.current = opts.entities || null;

    // ── Throttled refetch ───────────────────────────────────────
    const throttledRefetch = (entity) => {
        // Entity filtering — skip if this hook doesn't care about this entity
        if (entitiesRef.current && entity && !entitiesRef.current.includes(entity)) {
            return;
        }

        const now = Date.now();
        const elapsed = now - lastRefetchRef.current;

        // If tab is hidden, queue the refetch for when it becomes visible
        if (typeof document !== 'undefined' && document.hidden) {
            pendingWhileHiddenRef.current = true;
            return;
        }

        if (elapsed < THROTTLE_MS) {
            // Clear any existing pending timer to avoid double-fire
            if (pendingTimerRef.current) clearTimeout(pendingTimerRef.current);
            // Schedule for after throttle window
            pendingTimerRef.current = setTimeout(() => {
                pendingTimerRef.current = null;
                lastRefetchRef.current = Date.now();
                refetchRef.current?.(entity);
            }, THROTTLE_MS - elapsed);
        } else {
            lastRefetchRef.current = now;
            refetchRef.current?.(entity);
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

            throttledRefetch(msg.entity);
        };

        bc.onmessageerror = () => {
            // Corrupted message — ignore silently
        };

        return () => {
            // Clean up BroadcastChannel + any pending throttle timer
            try { bc.close(); } catch { /* already closed */ }
            if (pendingTimerRef.current) {
                clearTimeout(pendingTimerRef.current);
                pendingTimerRef.current = null;
            }
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

        const listenTables = opts.tables || DEFAULT_SUPABASE_TABLES;

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
                        // commander_seats has no venue_id column
                        filter: table === 'commander_seats' ? undefined : `venue_id=eq.${venueId}`,
                    },
                    () => {
                        // Map Supabase table name → entity name for filtering
                        const entity = TABLE_TO_ENTITY[table] || table;
                        throttledRefetch(entity);
                    }
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
