/**
 * Real-time updates hook for Club Commander dashboard
 * Uses Supabase real-time subscriptions
 */
import { useEffect, useRef } from 'react';
import { createClient } from '@supabase/supabase-js';

// Create Supabase client for real-time
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

let supabase = null;

function getSupabase() {
  if (!supabase && supabaseUrl && supabaseAnonKey) {
    supabase = createClient(supabaseUrl, supabaseAnonKey);
  }
  return supabase;
}

/**
 * Hook to subscribe to real-time updates for a venue
 * @param {string|number} venueId - The venue ID to subscribe to
 * @param {function} onUpdate - Callback when data changes
 * @param {boolean} enabled - Whether to enable subscriptions
 */
export function useRealtimeUpdates(venueId, onUpdate, enabled = true) {
  const channelRef = useRef(null);

  useEffect(() => {
    if (!venueId || !enabled) return;

    const client = getSupabase();
    if (!client) {
      console.warn('Supabase client not available for real-time');
      return;
    }

    // Create a channel for this venue
    const channel = client.channel(`club-commander:venue:${venueId}`);

    // Subscribe to waitlist changes
    channel.on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'captain_waitlist',
        filter: `venue_id=eq.${venueId}`
      },
      (payload) => {
        console.log('Waitlist change:', payload);
        onUpdate?.('waitlist', payload);
      }
    );

    // Subscribe to game changes
    channel.on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'captain_games',
        filter: `venue_id=eq.${venueId}`
      },
      (payload) => {
        console.log('Game change:', payload);
        onUpdate?.('games', payload);
      }
    );

    // Subscribe to table changes
    channel.on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'captain_tables',
        filter: `venue_id=eq.${venueId}`
      },
      (payload) => {
        console.log('Table change:', payload);
        onUpdate?.('tables', payload);
      }
    );

    // Subscribe to seat changes
    channel.on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'captain_seats',
      },
      (payload) => {
        console.log('Seat change:', payload);
        onUpdate?.('seats', payload);
      }
    );

    // Start subscription
    channel.subscribe((status) => {
      console.log('Club Commander real-time subscription status:', status);
    });

    channelRef.current = channel;

    // Cleanup
    return () => {
      if (channelRef.current) {
        client.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [venueId, onUpdate, enabled]);
}

/**
 * Hook for tournament clock real-time updates
 * @param {string} tournamentId - The tournament ID
 * @param {function} onTick - Callback for clock ticks
 */
export function useTournamentClock(tournamentId, onTick, enabled = true) {
  const channelRef = useRef(null);

  useEffect(() => {
    if (!tournamentId || !enabled) return;

    const client = getSupabase();
    if (!client) return;

    const channel = client.channel(`club-commander:tournament:${tournamentId}`);

    channel.on('broadcast', { event: 'clock:tick' }, (payload) => {
      onTick?.(payload.payload);
    });

    channel.subscribe();
    channelRef.current = channel;

    return () => {
      if (channelRef.current) {
        client.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [tournamentId, onTick, enabled]);
}

export default useRealtimeUpdates;
