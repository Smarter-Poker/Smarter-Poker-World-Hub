/**
 * useTournamentRealtime — Supabase Realtime hook for Tournament Director
 *
 * Subscribes to changes on commander_tournament_entries and commander_tournaments
 * for the given tournamentId. Calls onUpdate() whenever data changes, providing
 * instant updates across all connected TD tablets instead of relying on polling.
 *
 * Usage:
 *   useTournamentRealtime(tournamentId, fetchFloor);
 *
 * Falls back gracefully if Realtime connection fails — polling still works as backup.
 */
import { useEffect, useRef } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

let _client = null;
function getClient() {
    if (!_client && supabaseUrl && supabaseAnonKey) {
        _client = createClient(supabaseUrl, supabaseAnonKey, {
            realtime: { params: { eventsPerSecond: 10 } }
        });
    }
    return _client;
}

export default function useTournamentRealtime(tournamentId, onUpdate) {
    const channelRef = useRef(null);

    useEffect(() => {
        if (!tournamentId || typeof window === 'undefined') return;

        const client = getClient();
        if (!client) {
            console.warn('[Realtime] Supabase client not available — using polling only');
            return;
        }

        // Debounce rapid-fire events (e.g. batch moves trigger multiple INSERTs)
        let debounceTimer = null;
        const debouncedUpdate = () => {
            if (debounceTimer) clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
                onUpdate?.();
            }, 300);
        };

        const channelName = `td-${tournamentId.slice(0, 8)}`;

        const channel = client
            .channel(channelName)
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'commander_tournament_entries',
                    filter: `tournament_id=eq.${tournamentId}`
                },
                () => debouncedUpdate()
            )
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'commander_tournaments',
                    filter: `id=eq.${tournamentId}`
                },
                () => debouncedUpdate()
            )
            .subscribe((status) => {
                if (status === 'SUBSCRIBED') {
                    console.log(`[Realtime] ✅ Connected: ${channelName}`);
                } else if (status === 'CHANNEL_ERROR') {
                    console.warn(`[Realtime] ⚠️ Channel error: ${channelName}`);
                }
            });

        channelRef.current = channel;

        return () => {
            if (debounceTimer) clearTimeout(debounceTimer);
            if (channelRef.current) {
                client.removeChannel(channelRef.current);
                channelRef.current = null;
            }
        };
    }, [tournamentId, onUpdate]);
}
