/**
 * FloorCallAlert — Real-time fullscreen popup when a table calls the floor
 * 
 * Uses Supabase Realtime (postgres_changes) + polling fallback every 5s.
 * Shows a fullscreen red alert on ALL Commander screens except cashier.
 * Auto-dismisses after 30 seconds.
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../../../lib/supabase';
import { X } from 'lucide-react';

export default function FloorCallAlert({ venueId }) {
    const [activeCall, setActiveCall] = useState(null);
    const dismissTimer = useRef(null);
    const pollInterval = useRef(null);
    const lastSeenId = useRef(null);

    const isCashier = typeof window !== 'undefined' && window.location.pathname.includes('/cashier');

    const dismissCall = useCallback(() => {
        setActiveCall(null);
        if (dismissTimer.current) { clearTimeout(dismissTimer.current); dismissTimer.current = null; }
    }, []);

    const handleNewCall = useCallback((call) => {
        if (!call || call.status !== 'active') return;
        if (lastSeenId.current === call.id) return; // Already showing this call
        lastSeenId.current = call.id;
        setActiveCall({
            id: call.id,
            table_number: call.table_number,
            description: call.description || `Table ${call.table_number} needs floor`,
            created_at: call.created_at,
        });
        // Auto-dismiss after 30 seconds
        if (dismissTimer.current) clearTimeout(dismissTimer.current);
        dismissTimer.current = setTimeout(() => {
            setActiveCall(null);
            dismissTimer.current = null;
        }, 30000);
    }, []);

    useEffect(() => {
        if (!venueId || isCashier) return;
        const client = supabase;
        if (!client) return;

        // ── Realtime subscription ──
        const channelName = `floor-calls-${venueId}-${Date.now()}`;
        const channel = client.channel(channelName);
        channel.on(
            'postgres_changes',
            {
                event: 'INSERT',
                schema: 'public',
                table: 'commander_floor_calls',
                filter: `venue_id=eq.${venueId}`,
            },
            (payload) => handleNewCall(payload.new)
        );
        channel.subscribe((status) => {
            console.log('[FloorCallAlert] Realtime status:', status);
        });

        // ── Polling fallback (every 5 seconds) ──
        const poll = async () => {
            try {
                const { data } = await client
                    .from('commander_floor_calls')
                    .select('*')
                    .eq('venue_id', venueId)
                    .eq('status', 'active')
                    .order('created_at', { ascending: false })
                    .limit(1);
                if (data && data.length > 0) {
                    const call = data[0];
                    // Only show if created within the last 60 seconds
                    const age = (Date.now() - new Date(call.created_at).getTime()) / 1000;
                    if (age < 60) {
                        handleNewCall(call);
                    }
                }
            } catch { /* ignore polling errors */ }
        };
        // Initial check
        poll();
        pollInterval.current = setInterval(poll, 5000);

        return () => {
            try { client.removeChannel(channel); } catch { /* ignore */ }
            if (dismissTimer.current) { clearTimeout(dismissTimer.current); dismissTimer.current = null; }
            if (pollInterval.current) { clearInterval(pollInterval.current); pollInterval.current = null; }
        };
    }, [venueId, isCashier, handleNewCall]);

    if (!activeCall || isCashier) return null;

    return (
        <div style={{
            position: 'fixed', inset: 0, zIndex: 99999,
            background: 'rgba(220, 38, 38, 0.95)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            animation: 'floorCallIn 0.3s ease-out',
            cursor: 'pointer',
        }} onClick={dismissCall}>
            {/* Alert text */}
            <div style={{ fontSize: 72, fontWeight: 900, color: '#fff', textAlign: 'center', letterSpacing: -1, lineHeight: 1.1 }}>
                TABLE {activeCall.table_number}
            </div>
            <div style={{ fontSize: 36, fontWeight: 700, color: 'rgba(255,255,255,0.9)', marginTop: 12, textTransform: 'uppercase', letterSpacing: 4 }}>
                NEEDS FLOOR
            </div>

            {/* Dismiss button */}
            <button
                onClick={(e) => { e.stopPropagation(); dismissCall(); }}
                style={{
                    marginTop: 48, padding: '16px 48px', borderRadius: 16,
                    background: 'rgba(255,255,255,0.2)', border: '2px solid rgba(255,255,255,0.4)',
                    color: '#fff', fontSize: 18, fontWeight: 800, cursor: 'pointer',
                    display: 'flex', alignItems: 'center', gap: 8,
                }}
            >
                <X size={20} /> Dismiss
            </button>

            <div style={{ position: 'absolute', bottom: 24, fontSize: 13, color: 'rgba(255,255,255,0.5)' }}>
                Auto-dismisses in 30 seconds · Tap anywhere to dismiss
            </div>

            <style jsx>{`
                @keyframes floorCallIn {
                    from { opacity: 0; transform: scale(1.05); }
                    to { opacity: 1; transform: scale(1); }
                }
            `}</style>
        </div>
    );
}
