/**
 * TrendingVenues.jsx — Widget showing venues with the most check-ins today.
 * Rendered in the social media feed to encourage check-in engagement.
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { eventBus, EventType } from '../../engine/EventBus';

const C = {
    card: '#FFFFFF', bg: '#F0F2F5', text: '#050505', textSec: '#65676B',
    border: '#DADDE1', blue: '#1877F2',
};

export default function TrendingVenues({ onCheckIn }) {
    const [venues, setVenues] = useState([]);
    const [loading, setLoading] = useState(true);
    const isMountedRef = useRef(true);

    useEffect(() => {
        isMountedRef.current = true;
        return () => { isMountedRef.current = false; };
    }, []);

    // Fetch trending venues data
    const fetchTrending = useCallback(async () => {
        try {
            const res = await fetch('/api/poker/checkins/trending?limit=5');
            const data = await res.json();
            if (!data.success) return;
            if (isMountedRef.current) setVenues(data.venues || []);
        } catch { /* silent */ }
        if (isMountedRef.current) setLoading(false);
    }, []);

    // Fetch on mount
    useEffect(() => {
        let cancelled = false;
        (async () => {
            await fetchTrending();
            if (cancelled) return;
        })();
        return () => { cancelled = true; };
    }, [fetchTrending]);

    // Auto-refresh when a check-in is created
    useEffect(() => {
        const unsub = eventBus.on(EventType.VENUE_CHECKIN_CREATED, () => {
            // Delay slightly to let the DB write settle
            setTimeout(() => fetchTrending(), 1000);
        });
        return unsub;
    }, [fetchTrending]);

    if (loading || venues.length === 0) return null;

    return (
        <div style={{
            background: C.card, borderRadius: 12, border: `1px solid ${C.border}`,
            padding: 16, marginBottom: 12,
        }}>
            {/* Header */}
            <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                marginBottom: 12,
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#e74c3c" strokeWidth="2">
                        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" />
                        <circle cx="12" cy="10" r="3" />
                    </svg>
                    <span style={{ fontSize: 15, fontWeight: 700, color: C.text }}>
                        Trending Venues
                    </span>
                </div>
                <span style={{
                    fontSize: 11, fontWeight: 600, color: '#E65100',
                    padding: '2px 8px', borderRadius: 10, background: '#FFF3E0',
                }}>
                    LIVE
                </span>
            </div>

            {/* Venue List */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {venues.map((v, i) => (
                    <button
                        key={v.venue_id}
                        onClick={() => onCheckIn?.({
                            id: v.venue_id,
                            name: v.venue_name,
                            city: v.city,
                            state: v.state,
                        })}
                        style={{
                            display: 'flex', alignItems: 'center', gap: 10,
                            padding: '8px 10px', border: 'none', background: 'transparent',
                            borderRadius: 8, cursor: 'pointer', textAlign: 'left',
                            transition: 'background 0.15s', width: '100%',
                        }}
                        onMouseEnter={e => e.currentTarget.style.background = C.bg}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                    >
                        {/* Rank Badge */}
                        <div style={{
                            width: 26, height: 26, borderRadius: '50%',
                            background: i === 0 ? '#FFD700' : i === 1 ? '#C0C0C0' : i === 2 ? '#CD7F32' : C.bg,
                            color: i < 3 ? '#fff' : C.text,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 12, fontWeight: 800, flexShrink: 0,
                        }}>
                            {i + 1}
                        </div>

                        {/* Venue Info */}
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{
                                fontSize: 13, fontWeight: 600, color: C.text,
                                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                            }}>
                                {v.venue_name}
                            </div>
                            <div style={{ fontSize: 11, color: C.textSec }}>
                                {[v.city, v.state].filter(Boolean).join(', ')}
                            </div>
                        </div>

                        {/* Count Badge */}
                        <div style={{
                            padding: '3px 8px', borderRadius: 12,
                            background: '#FFF3E0', color: '#E65100',
                            fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap',
                            flexShrink: 0,
                        }}>
                            {v.count} {v.count === 1 ? 'check-in' : 'check-ins'}
                        </div>
                    </button>
                ))}
            </div>
        </div>
    );
}
