/**
 * useCommanderSync — Two-layer real-time sync for Commander pages
 *
 * Layer 1: BroadcastChannel (instant, same browser)
 *   When any tab writes data, it calls broadcastChange('tables')
 *   All other tabs hear it instantly and refetch.
 *
 * Layer 2: Supabase Realtime (cross-device, ~1s)
 *   Subscribes to postgres_changes on shared Commander tables.
 *
 * Usage:
 *   useCommanderSync(venueId, fetchData);
 *   // → auto-refetches when other tabs/devices change data
 *
 *   import { broadcastChange } from '.../useCommanderSync';
 *   broadcastChange('tables');
 *   // → tells all open tabs to refetch immediately
 */
import { useEffect, useRef, useCallback } from 'react';
import { supabase } from '../supabase';

const CHANNEL_NAME = 'commander-sync';

// Debounce helper to prevent refetch storms
let _debounceTimer = null;
function debounceRefetch(fn, ms = 300) {
    clearTimeout(_debounceTimer);
    _debounceTimer = setTimeout(fn, ms);
}

/**
 * Broadcast a data change to all other open Commander tabs.
 * Call this AFTER a successful write (POST/PUT/PATCH/DELETE).
 *
 * @param {string} table - The table/entity that changed
 *   e.g. 'tables', 'games', 'floor_calls', 'waitlist', 'settings'
 */
export function broadcastChange(table) {
    try {
        if (typeof BroadcastChannel === 'undefined') return;
        const bc = new BroadcastChannel(CHANNEL_NAME);
        bc.postMessage({ type: 'data-changed', table, ts: Date.now() });
        bc.close();
    } catch { /* BroadcastChannel not supported — silent fallback */ }
}

/**
 * Hook: listen for cross-tab + cross-device changes and auto-refetch.
 *
 * @param {string|number} venueId - venue to subscribe to
 * @param {function} onRefetch - called when data changes detected
 * @param {object} opts - { tables: ['tables','games','waitlist','floor_calls','seats'] }
 */
export function useCommanderSync(venueId, onRefetch, opts = {}) {
    const refetchRef = useRef(onRefetch);
    refetchRef.current = onRefetch;

    const channelRef = useRef(null);

    // Layer 1: BroadcastChannel (same browser, instant)
    useEffect(() => {
        if (typeof BroadcastChannel === 'undefined') return;

        const bc = new BroadcastChannel(CHANNEL_NAME);
        bc.onmessage = (event) => {
            if (event.data?.type === 'data-changed') {
                debounceRefetch(() => refetchRef.current?.());
            }
        };

        return () => bc.close();
    }, []);

    // Layer 2: Supabase Realtime (cross-device)
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

        const channel = client.channel(`commander-sync:${venueId}`);

        listenTables.forEach(table => {
            channel.on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table,
                    filter: table === 'commander_seats' ? undefined : `venue_id=eq.${venueId}`,
                },
                () => {
                    debounceRefetch(() => refetchRef.current?.());
                }
            );
        });

        channel.subscribe();
        channelRef.current = channel;

        return () => {
            if (channelRef.current) {
                client.removeChannel(channelRef.current);
                channelRef.current = null;
            }
        };
    }, [venueId]); // eslint-disable-line react-hooks/exhaustive-deps
}

export default useCommanderSync;
