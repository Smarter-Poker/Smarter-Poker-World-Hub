/**
 * useVenueRealtime — Hardened Supabase Realtime hook for Global Venues
 * ═══════════════════════════════════════════════════════════════════════════════
 * Subscribes to changes on poker_venues and venue_daily_tournaments.
 * Calls onUpdate(payload) for surgical SWR local-cache swapping.
 * Calls onUpdate(null) for hard refreshes upon network reconnect/visibility.
 */
import { useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';

export default function useVenueRealtime(onUpdate) {
    const onUpdateRef = useRef(onUpdate);
    onUpdateRef.current = onUpdate;

    const channelRef = useRef(null);
    const missedUpdateRef = useRef(false);
    // [RTH1 FIX] Track whether this is the first SUBSCRIBED event.
    // The null-payload hard-refresh should NOT fire on initial connection (SWR already fetches on mount).
    // It SHOULD fire on RE-subscriptions (network reconnect) to recover missed events.
    const firstSubscribeRef = useRef(true);

    useEffect(() => {
        if (typeof window === 'undefined') return;

        const client = supabase;
        if (!client) return;

        const handlePayload = (payload) => {
            if (typeof document !== 'undefined' && document.hidden) {
                // Backgrounded — discard payload but flag that our local cache is now stale.
                missedUpdateRef.current = true;
                return;
            }
            onUpdateRef.current?.(payload);
        };

        const channelName = `global-venues-sync-${Math.random().toString(36).substring(2, 10)}`;
        
        const channel = client.channel(channelName)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'poker_venues' }, handlePayload)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'venue_daily_tournaments' }, handlePayload)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'poker_series' }, handlePayload)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'tournament_series' }, handlePayload)
            .subscribe((status, err) => {
                if (status === 'SUBSCRIBED') {
                    console.log(`[Realtime] ✅ Connected: ${channelName}`);
                    if (firstSubscribeRef.current) {
                        // First connection: SWR already fetching — skip double-fetch
                        firstSubscribeRef.current = false;
                    } else {
                        // RE-subscribe (reconnect after drop): hard-refresh to recover missed events
                        onUpdateRef.current?.(null);
                    }
                } else if (status === 'CLOSED') {
                    console.warn(`[Realtime] ⚠️ Channel Closed: ${channelName}`);
                } else if (status === 'CHANNEL_ERROR') {
                    console.error(`[Realtime] ❌ Channel Error: ${channelName}`, err);
                }
            });

        channelRef.current = channel;

        // [HARDENING] Tab visibility sync: fetch lost updates
        const handleVisibilityChange = () => {
            if (!document.hidden && missedUpdateRef.current) {
                console.log(`[Realtime] 🔄 Recovering missed updates from background state...`);
                missedUpdateRef.current = false;
                onUpdateRef.current?.(null); // Hard refresh
            }
        };
        document.addEventListener('visibilitychange', handleVisibilityChange);

        return () => {
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            if (channelRef.current) {
                try { 
                    client.removeChannel(channelRef.current); 
                } catch (e) { 
                    console.warn('[Realtime] Cleanup warning:', e);
                } finally {
                    channelRef.current = null;
                }
            }
        };
    }, []);
}
