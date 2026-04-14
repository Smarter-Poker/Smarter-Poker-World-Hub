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

    const missedUpdateRef = useRef(false);

    useEffect(() => {
        if (typeof window === 'undefined') return;

        const client = supabase;
        if (!client) return;

        const debouncedUpdate = () => {
            if (typeof document !== 'undefined' && document.hidden) {
                // BUG FIX: Flag that we missed an update while backgrounded,
                // instead of unconditionally discarding it forever and leaving UI stale.
                missedUpdateRef.current = true;
                return;
            }
            if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
            debounceTimerRef.current = setTimeout(() => {
                debounceTimerRef.current = null;
                onUpdateRef.current?.();
            }, DEBOUNCE_MS);
        };

        // [HARDENING] Use a deterministic channel prefix but WITH a unique suffix.
        // Previously, static strings forced Supabase to reuse the SAME exact channel object
        // across different components. When Component A unmounted, it destroyed the channel
        // for Component B (Adversarial Data-Loss vector).
        const channelName = `global-venues-sync-${Math.random().toString(36).substring(2, 10)}`;
        
        const channel = client.channel(channelName)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'poker_venues' }, debouncedUpdate)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'venue_daily_tournaments' }, debouncedUpdate)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'poker_series' }, debouncedUpdate)
            .subscribe((status, err) => {
                if (status === 'SUBSCRIBED') {
                    console.log(`[Realtime] ✅ Connected: ${channelName}`);
                    // Trigger a delayed refresh upon successful connection (which includes 
                    // offline->online reconnections) to guarantee no events were dropped.
                    debouncedUpdate();
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
                onUpdateRef.current?.(); // Hard refresh
            }
        };
        document.addEventListener('visibilitychange', handleVisibilityChange);

        return () => {
            if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
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
