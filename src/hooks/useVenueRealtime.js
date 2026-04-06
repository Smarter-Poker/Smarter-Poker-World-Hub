/**
 * useVenueRealtime — Hardened Supabase Realtime hook for Global Venues
 * ═══════════════════════════════════════════════════════════════════════════════
 * Subscribes to changes on poker_venues and venue_daily_tournaments.
 * Calls onUpdate() whenever data changes to enable real-time UI refresh.
 */
import { useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';

const DEBOUNCE_MS = 500;

export default function useVenueRealtime(onUpdate) {
    const onUpdateRef = useRef(onUpdate);
    onUpdateRef.current = onUpdate;

    const channelRef = useRef(null);
    const debounceTimerRef = useRef(null);

    useEffect(() => {
        if (typeof window === 'undefined') return;

        const client = supabase;
        if (!client) return;

        const debouncedUpdate = () => {
            if (typeof document !== 'undefined' && document.hidden) return; // skip if hidden
            if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
            debounceTimerRef.current = setTimeout(() => {
                debounceTimerRef.current = null;
                onUpdateRef.current?.();
            }, DEBOUNCE_MS);
        };

        // [HARDENING] Use a deterministic channel name so Supabase natively multiplexes 
        // multiple hook invocations (e.g., from different components on the same page)
        // onto a single WebSocket topic, preventing "Too Many Channels" quota errors.
        const channelName = `global-venues-sync`;
        
        const channel = client.channel(channelName)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'poker_venues' }, debouncedUpdate)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'venue_daily_tournaments' }, debouncedUpdate)
            .subscribe((status) => {
                if (status === 'SUBSCRIBED') {
                    console.log(`[Realtime] ✅ Connected: global venues sync`);
                }
            });

        channelRef.current = channel;

        return () => {
            if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
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
