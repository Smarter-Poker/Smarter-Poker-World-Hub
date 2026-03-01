/**
 * FloorCallAlert — Real-time fullscreen popup when a table calls the floor
 * 
 * This component subscribes to the `commander_floor_calls` table via Supabase Realtime.
 * When a new floor call arrives, it shows a fullscreen red alert on ALL Commander screens
 * except cashier pages. Auto-dismisses after 30 seconds.
 *
 * Usage: Add <FloorCallAlert venueId={venueId} /> to any Commander layout/page
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../../../lib/supabase';
import { Phone, X } from 'lucide-react';

export default function FloorCallAlert({ venueId }) {
    const [activeCall, setActiveCall] = useState(null);
    const dismissTimer = useRef(null);
    const audioRef = useRef(null);

    // Check if we're on a cashier page — cashiers don't see floor calls
    const isCashier = typeof window !== 'undefined' && window.location.pathname.includes('/cashier');

    const dismissCall = useCallback(() => {
        setActiveCall(null);
        if (dismissTimer.current) { clearTimeout(dismissTimer.current); dismissTimer.current = null; }
    }, []);

    // Subscribe to Supabase Realtime for floor calls
    useEffect(() => {
        if (!venueId || isCashier) return;
        const client = supabase;
        if (!client) return;

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
            (payload) => {
                const call = payload.new;
                if (call && call.status === 'active') {
                    setActiveCall({
                        id: call.id,
                        table_number: call.table_number,
                        table_name: call.table_name || `Table ${call.table_number}`,
                        created_at: call.created_at,
                    });
                    // Auto-dismiss after 30 seconds
                    if (dismissTimer.current) clearTimeout(dismissTimer.current);
                    dismissTimer.current = setTimeout(() => {
                        setActiveCall(null);
                        dismissTimer.current = null;
                    }, 30000);
                }
            }
        );

        channel.subscribe();

        return () => {
            try { client.removeChannel(channel); } catch { /* ignore */ }
            if (dismissTimer.current) { clearTimeout(dismissTimer.current); dismissTimer.current = null; }
        };
    }, [venueId, isCashier]);

    if (!activeCall || isCashier) return null;

    return (
        <div style={{
            position: 'fixed', inset: 0, zIndex: 99999,
            background: 'rgba(220, 38, 38, 0.95)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            animation: 'floorCallIn 0.3s ease-out',
            cursor: 'pointer',
        }} onClick={dismissCall}>
            {/* Pulsing phone icon */}
            <div style={{
                width: 100, height: 100, borderRadius: '50%',
                background: 'rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                marginBottom: 24, animation: 'floorCallPulse 1s infinite alternate',
            }}>
                <Phone size={60} color="#fff" />
            </div>

            {/* Alert text */}
            <div style={{ fontSize: 56, fontWeight: 900, color: '#fff', textAlign: 'center', letterSpacing: -1, lineHeight: 1.1 }}>
                TABLE {activeCall.table_number}
            </div>
            <div style={{ fontSize: 28, fontWeight: 700, color: 'rgba(255,255,255,0.9)', marginTop: 8, textTransform: 'uppercase', letterSpacing: 3 }}>
                NEEDS FLOOR
            </div>
            {activeCall.table_name && activeCall.table_name !== `Table ${activeCall.table_number}` && (
                <div style={{ fontSize: 18, color: 'rgba(255,255,255,0.7)', marginTop: 8 }}>
                    {activeCall.table_name}
                </div>
            )}

            {/* Dismiss button */}
            <button
                onClick={(e) => { e.stopPropagation(); dismissCall(); }}
                style={{
                    marginTop: 40, padding: '16px 48px', borderRadius: 16,
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
                @keyframes floorCallPulse {
                    from { transform: scale(1); box-shadow: 0 0 0 0 rgba(255,255,255,0.3); }
                    to { transform: scale(1.1); box-shadow: 0 0 40px 20px rgba(255,255,255,0.1); }
                }
            `}</style>
        </div>
    );
}
