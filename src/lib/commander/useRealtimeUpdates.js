/**
 * useRealtimeUpdates — Supabase Realtime Subscriptions for Commander
 * ═══════════════════════════════════════════════════════════════════
 *
 * Subscribes to postgres_changes on Commander tables.
 * Used by pages that need granular per-table callbacks.
 *
 * For general "refetch everything" sync, prefer useCommanderSync instead.
 *
 * Hardening:
 *   ✓ Auto-reconnect on channel error (max 5 attempts, exponential backoff)
 *   ✓ Stable callback ref (no stale closures)
 *   ✓ Debug-only logging (no console.log in production)
 *   ✓ Includes commander_floor_calls subscription
 */
import { useEffect, useRef } from 'react';
import { supabase } from '../supabase';

const MAX_RECONNECT = 5;
const RECONNECT_DELAY = 3000;
const IS_DEV = typeof process !== 'undefined' && process.env.NODE_ENV === 'development';

function getSupabase() {
  return supabase;
}

/**
 * Hook to subscribe to real-time updates for a venue
 * @param {string|number} venueId - The venue ID to subscribe to
 * @param {function} onUpdate - Callback when data changes: (tableName, payload) => void
 * @param {boolean} enabled - Whether to enable subscriptions
 */
export function useRealtimeUpdates(venueId, onUpdate, enabled = true) {
  const channelRef = useRef(null);
  const onUpdateRef = useRef(onUpdate);
  const reconnectCountRef = useRef(0);
  onUpdateRef.current = onUpdate;

  useEffect(() => {
    if (!venueId || !enabled) return;

    const client = getSupabase();
    if (!client) {
      if (IS_DEV) console.warn('[Commander RT] Supabase client not available');
      return;
    }

    const connectChannel = () => {
      // Clean up existing channel
      if (channelRef.current) {
        try { client.removeChannel(channelRef.current); } catch { /* ignore */ }
        channelRef.current = null;
      }

      const channel = client.channel(`commander:venue:${venueId}:${Date.now()}`);

      // Subscribe to all Commander tables
      const tables = [
        { table: 'commander_waitlist', name: 'waitlist' },
        { table: 'commander_games', name: 'games' },
        { table: 'commander_tables', name: 'tables' },
        { table: 'commander_floor_calls', name: 'floor_calls' },
        { table: 'commander_seats', name: 'seats', noFilter: true },
      ];

      tables.forEach(({ table, name, noFilter }) => {
        channel.on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table,
            filter: noFilter ? undefined : `venue_id=eq.${venueId}`,
          },
          (payload) => {
            if (IS_DEV) console.debug(`[Commander RT] ${name}:`, payload.eventType);
            onUpdateRef.current?.(name, payload);
          }
        );
      });

      channel.subscribe((status) => {
        if (IS_DEV) console.debug('[Commander RT] Status:', status);

        if (status === 'SUBSCRIBED') {
          reconnectCountRef.current = 0;
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          if (reconnectCountRef.current < MAX_RECONNECT) {
            reconnectCountRef.current++;
            const delay = RECONNECT_DELAY * reconnectCountRef.current;
            if (IS_DEV) console.warn(`[Commander RT] Reconnecting in ${delay}ms (attempt ${reconnectCountRef.current})`);
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
  }, [venueId, enabled]);
}

/**
 * Hook for tournament clock real-time updates
 * @param {string} tournamentId - The tournament ID
 * @param {function} onTick - Callback for clock ticks
 * @param {boolean} enabled - Whether to enable
 */
export function useTournamentClock(tournamentId, onTick, enabled = true) {
  const channelRef = useRef(null);
  const onTickRef = useRef(onTick);
  onTickRef.current = onTick;

  useEffect(() => {
    if (!tournamentId || !enabled) return;

    const client = getSupabase();
    if (!client) return;

    const channel = client.channel(`commander:tournament:${tournamentId}`);

    channel.on('broadcast', { event: 'clock:tick' }, (payload) => {
      onTickRef.current?.(payload.payload);
    });

    channel.subscribe();
    channelRef.current = channel;

    return () => {
      if (channelRef.current) {
        try { client.removeChannel(channelRef.current); } catch { /* ignore */ }
        channelRef.current = null;
      }
    };
  }, [tournamentId, enabled]);
}

export default useRealtimeUpdates;
