/**
 * NearMeNowFeed.jsx — Feature #10: "Near Me Now" Live Feed
 * Real-time scrolling feed combining live games, check-ins, tournament starts, and promotions.
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';

const FEED_REFRESH_MS = 60000; // 1 minute

function timeAgo(dateStr) {
    const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
    if (diff < 30) return 'Just now';
    if (diff < 60) return `${diff}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
}

// Dynamic SVG icons for each feed item type
const FEED_ICONS = {
    live_game: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" stroke="#22c55e" />
            <circle cx="12" cy="12" r="4" fill="#22c55e" stroke="none" />
            <circle cx="12" cy="12" r="7" stroke="#22c55e" opacity="0.3" />
        </svg>
    ),
    checkin: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" />
            <circle cx="12" cy="10" r="3" />
        </svg>
    ),
    tournament: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 9H4.5a2.5 2.5 0 110-5H6" />
            <path d="M18 9h1.5a2.5 2.5 0 000-5H18" />
            <path d="M4 22h16" />
            <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20 7 22" />
            <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20 17 22" />
            <path d="M18 2H6v7a6 6 0 0012 0V2z" />
        </svg>
    ),
    promotion: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#a855f7" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z" />
            <line x1="7" y1="7" x2="7.01" y2="7" />
        </svg>
    ),
};

const TYPE_COLORS = {
    live_game: { bg: 'rgba(34,197,94,0.1)', border: 'rgba(34,197,94,0.3)', text: '#22c55e', label: 'Live Game' },
    checkin: { bg: 'rgba(59,130,246,0.1)', border: 'rgba(59,130,246,0.3)', text: '#3b82f6', label: 'Check-In' },
    tournament: { bg: 'rgba(245,158,11,0.1)', border: 'rgba(245,158,11,0.3)', text: '#f59e0b', label: 'Tournament' },
    promotion: { bg: 'rgba(168,85,247,0.1)', border: 'rgba(168,85,247,0.3)', text: '#a855f7', label: 'Promotion' },
};

const RADIUS_OPTIONS = [10, 25, 50, 100];

export default function NearMeNowFeed({ userLocation, venues = [] }) {
    const [feedItems, setFeedItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [radius, setRadius] = useState(50);
    const [filter, setFilter] = useState('all');
    const refreshRef = useRef(null);
    const [lastRefresh, setLastRefresh] = useState(null);

    // Distance filter helper
    const isWithinRadius = useCallback((venue) => {
        if (!userLocation || !venue.latitude || !venue.longitude) return true; // show all if no GPS
        const R = 3958.8;
        const toRad = (d) => (d * Math.PI) / 180;
        const dLat = toRad(parseFloat(venue.latitude) - userLocation.lat);
        const dLng = toRad(parseFloat(venue.longitude) - userLocation.lng);
        const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(userLocation.lat)) * Math.cos(toRad(parseFloat(venue.latitude))) * Math.sin(dLng / 2) ** 2;
        const dist = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return dist <= radius;
    }, [userLocation, radius]);

    // Fetch all feed data
    const fetchFeed = useCallback(async () => {
        const items = [];

        try {
            // Live games
            const liveRes = await fetch('/api/poker/live-games?limit=50');
            const liveData = await liveRes.json();
            (liveData.games || liveData.data || []).forEach(g => {
                const venue = venues.find(v => String(v.id) === String(g.venue_id));
                if (venue && isWithinRadius(venue)) {
                    items.push({
                        type: 'live_game',
                        title: `${g.game_type || 'Cash Game'} ${g.stakes || ''}`.trim(),
                        subtitle: venue.name,
                        detail: g.players ? `${g.players} players` : '',
                        venue,
                        time: g.updated_at || g.created_at || new Date().toISOString(),
                        id: `live-${g.id || g.venue_id}`,
                    });
                }
            });
        } catch { /* continue */ }

        try {
            // Recent check-ins (from all venues)
            const now = new Date();
            const twoHoursAgo = new Date(now - 2 * 60 * 60 * 1000).toISOString();
            // Get checkins from nearby venues (last 2 hours)
            const nearbyVenues = venues.filter(isWithinRadius).slice(0, 20);
            for (const v of nearbyVenues) {
                try {
                    const res = await fetch(`/api/poker/checkins?venue_id=${v.id}&count_only=false&since=${encodeURIComponent(twoHoursAgo)}`);
                    const data = await res.json();
                    (data.checkins || []).forEach(c => {
                        items.push({
                            type: 'checkin',
                            title: `${c.user_name || 'Someone'} checked in`,
                            subtitle: v.name,
                            detail: c.message || '',
                            venue: v,
                            time: c.created_at,
                            id: `checkin-${c.id}`,
                        });
                    });
                } catch { /* continue */ }
            }
        } catch { /* continue */ }

        try {
            // Promotions
            const promoRes = await fetch('/api/poker/promotions?limit=30');
            const promoData = await promoRes.json();
            (promoData.promotions || promoData.data || []).forEach(p => {
                const venue = venues.find(v => String(v.id) === String(p.page_id) || String(v.id) === String(p.venue_id));
                if (venue && isWithinRadius(venue)) {
                    items.push({
                        type: 'promotion',
                        title: p.title || 'Promotion',
                        subtitle: venue.name,
                        detail: p.description || '',
                        venue,
                        time: p.created_at || new Date().toISOString(),
                        id: `promo-${p.id}`,
                    });
                }
            });
        } catch { /* continue */ }

        // Sort by time descending
        items.sort((a, b) => new Date(b.time) - new Date(a.time));
        setFeedItems(items);
        setLoading(false);
        setLastRefresh(new Date());
    }, [venues, isWithinRadius]);

    useEffect(() => {
        fetchFeed();
        refreshRef.current = setInterval(fetchFeed, FEED_REFRESH_MS);
        return () => { if (refreshRef.current) clearInterval(refreshRef.current); };
    }, [fetchFeed]);

    const filteredItems = filter === 'all' ? feedItems : feedItems.filter(f => f.type === filter);

    return (
        <div className="near-me-feed">
            <div className="nmf-header">
                <div className="nmf-icon">
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" strokeWidth="1.5">
                        <circle cx="12" cy="12" r="3" fill="#d4a853" stroke="none" />
                        <circle cx="12" cy="12" r="7" stroke="#d4a853" opacity="0.5" fill="none" strokeDasharray="3 3">
                            <animateTransform attributeName="transform" type="rotate" dur="8s" from="0 12 12" to="360 12 12" repeatCount="indefinite" />
                        </circle>
                        <circle cx="12" cy="12" r="11" stroke="#d4a853" opacity="0.25" fill="none" strokeDasharray="2 4">
                            <animateTransform attributeName="transform" type="rotate" dur="12s" from="360 12 12" to="0 12 12" repeatCount="indefinite" />
                        </circle>
                    </svg>
                </div>
                <h2>Near Me Now</h2>
                {lastRefresh && (
                    <span className="nmf-refresh-time">Updated {timeAgo(lastRefresh.toISOString())}</span>
                )}
            </div>

            {/* Radius filter */}
            <div className="nmf-controls">
                <div className="nmf-radius">
                    <span className="nmf-ctrl-label">Radius:</span>
                    {RADIUS_OPTIONS.map(r => (
                        <button key={r} className={'nmf-chip' + (radius === r ? ' active' : '')} onClick={() => setRadius(r)}>{r} mi</button>
                    ))}
                </div>
                <div className="nmf-type-filter">
                    <button className={'nmf-chip' + (filter === 'all' ? ' active' : '')} onClick={() => setFilter('all')}>All</button>
                    {Object.entries(TYPE_COLORS).map(([key, val]) => (
                        <button key={key} className={'nmf-chip' + (filter === key ? ' active' : '')} onClick={() => setFilter(key)} style={filter === key ? { background: val.bg, borderColor: val.border, color: val.text } : {}}>
                            {val.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Feed */}
            {loading && (
                <div className="nmf-loading">
                    <div className="nmf-spinner" />
                    <span>Scanning nearby activity...</span>
                </div>
            )}

            {!loading && filteredItems.length === 0 && (
                <div className="nmf-empty">
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="1.5">
                        <circle cx="12" cy="12" r="10" />
                        <path d="M12 8v4M12 16h.01" />
                    </svg>
                    <p>No activity nearby right now</p>
                    <p style={{ fontSize: 12 }}>Try increasing your radius or check back soon</p>
                </div>
            )}

            {!loading && filteredItems.length > 0 && (
                <div className="nmf-feed-list">
                    {filteredItems.map((item, i) => {
                        const typeStyle = TYPE_COLORS[item.type] || TYPE_COLORS.live_game;
                        return (
                            <div key={item.id || i} className="nmf-item" style={{ borderLeftColor: typeStyle.border }}>
                                <div className="nmf-item-icon">{FEED_ICONS[item.type]}</div>
                                <div className="nmf-item-content">
                                    <div className="nmf-item-top">
                                        <span className="nmf-item-title">{item.title}</span>
                                        <span className="nmf-item-time">{timeAgo(item.time)}</span>
                                    </div>
                                    <div className="nmf-item-subtitle">{item.subtitle}</div>
                                    {item.detail && <div className="nmf-item-detail">{item.detail}</div>}
                                </div>
                                <span className="nmf-item-type" style={{ background: typeStyle.bg, color: typeStyle.text, borderColor: typeStyle.border }}>
                                    {typeStyle.label}
                                </span>
                            </div>
                        );
                    })}
                </div>
            )}

            <style jsx>{`
        .near-me-feed { padding: 0 0 20px; }
        .nmf-header { display: flex; align-items: center; gap: 10px; margin-bottom: 16px; }
        .nmf-header h2 { font-size: 22px; font-weight: 700; color: #fff; margin: 0; flex: 1; }
        .nmf-icon { display: flex; align-items: center; }
        .nmf-refresh-time { font-size: 11px; color: rgba(255,255,255,0.3); }
        .nmf-controls { display: flex; flex-direction: column; gap: 10px; margin-bottom: 16px; }
        .nmf-radius, .nmf-type-filter { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
        .nmf-ctrl-label { font-size: 12px; color: rgba(255,255,255,0.4); font-weight: 500; }
        .nmf-chip { padding: 6px 12px; border-radius: 8px; background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.1); color: rgba(255,255,255,0.6); font-size: 12px; cursor: pointer; transition: all 0.2s; white-space: nowrap; }
        .nmf-chip.active { background: rgba(212,168,83,0.15); border-color: rgba(212,168,83,0.4); color: #d4a853; }
        .nmf-loading { display: flex; flex-direction: column; align-items: center; padding: 60px 20px; gap: 12px; }
        .nmf-spinner { width: 32px; height: 32px; border: 3px solid rgba(255,255,255,0.1); border-top-color: #d4a853; border-radius: 50%; animation: spin 0.8s linear infinite; }
        .nmf-loading span { color: rgba(255,255,255,0.4); font-size: 13px; }
        .nmf-empty { display: flex; flex-direction: column; align-items: center; padding: 60px 20px; text-align: center; }
        .nmf-empty p { color: rgba(255,255,255,0.4); font-size: 14px; margin: 8px 0 0; }
        .nmf-feed-list { display: flex; flex-direction: column; gap: 6px; }
        .nmf-item { display: flex; align-items: flex-start; gap: 12px; padding: 14px 16px; background: rgba(15,23,42,0.5); border: 1px solid rgba(255,255,255,0.06); border-left: 3px solid #d4a853; border-radius: 10px; transition: all 0.2s; }
        .nmf-item:hover { background: rgba(15,23,42,0.7); border-color: rgba(255,255,255,0.1); }
        .nmf-item-icon { flex-shrink: 0; margin-top: 2px; }
        .nmf-item-content { flex: 1; min-width: 0; }
        .nmf-item-top { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
        .nmf-item-title { font-size: 14px; font-weight: 600; color: #fff; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .nmf-item-time { font-size: 11px; color: rgba(255,255,255,0.3); flex-shrink: 0; }
        .nmf-item-subtitle { font-size: 12px; color: rgba(255,255,255,0.5); margin-top: 2px; }
        .nmf-item-detail { font-size: 12px; color: rgba(255,255,255,0.3); margin-top: 2px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .nmf-item-type { padding: 3px 8px; border-radius: 4px; font-size: 10px; font-weight: 600; border: 1px solid; flex-shrink: 0; align-self: center; }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
        </div>
    );
}
