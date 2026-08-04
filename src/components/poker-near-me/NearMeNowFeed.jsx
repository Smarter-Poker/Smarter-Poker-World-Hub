/**
 * NearMeNowFeed.jsx — Feature #10: "Near Me Now" Live Feed
 * Real-time scrolling feed combining live games, check-ins, tournament starts, and promotions.
 * v2.0 — Enhanced with CTA-rich empty states and skeleton loading
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { haversineMiles, timeAgo, getZonedNow, resolveVenueTimeZone } from './pnm-utils';

const FEED_REFRESH_MS = 60000; // 1 minute

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

// How far ahead a tournament start counts as "upcoming" for this feed.
const TOURNAMENT_LOOKAHEAD_MIN = 6 * 60;

/**
 * Parse a daily-tournament start_time ("7:00 PM", "19:00", "11:00 AM") into
 * minutes since midnight. Returns null when unparseable.
 */
function parseStartMinutes(startTime) {
    const match = String(startTime || '').match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
    if (!match) return null;
    let hour = parseInt(match[1], 10);
    const minute = parseInt(match[2], 10);
    if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
    const ampm = match[3];
    if (ampm) {
        const upper = ampm.toUpperCase();
        if (upper === 'PM' && hour !== 12) hour += 12;
        if (upper === 'AM' && hour === 12) hour = 0;
    }
    if (hour > 23 || minute > 59) return null;
    return hour * 60 + minute;
}


// Skeleton placeholder for loading state
function FeedSkeleton({ count = 3 }) {
    return (
        <div className="nmf-feed-list">
            {Array.from({ length: count }).map((_, i) => (
                <div key={`skel-${i}`} className="nmf-item nmf-skeleton">
                    <div className="nmf-skel-icon" />
                    <div className="nmf-skel-content">
                        <div className="nmf-skel-line nmf-skel-title" />
                        <div className="nmf-skel-line nmf-skel-sub" />
                    </div>
                    <div className="nmf-skel-badge" />
                </div>
            ))}
        </div>
    );
}

export default function NearMeNowFeed({ userLocation, venues = [], onRequestGPS, onSwitchTab, onNavigateVenue }) {
    const [feedItems, setFeedItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [radius, setRadius] = useState(50);
    const [filter, setFilter] = useState('all');
    const refreshRef = useRef(null);
    const abortRef = useRef(null);
    const isMounted = useRef(true);
    const [lastRefresh, setLastRefresh] = useState(null);

    useEffect(() => {
        isMounted.current = true;
        return () => {
            isMounted.current = false;
            if (abortRef.current) abortRef.current.abort();
        };
    }, []);

    const computeDistance = useCallback((venue) => {
        if (!userLocation || !venue.latitude || !venue.longitude) return null;
        return haversineMiles(userLocation.lat, userLocation.lng, parseFloat(venue.latitude), parseFloat(venue.longitude));
    }, [userLocation]);

    // Distance filter helper
    const isWithinRadius = useCallback((venue) => {
        const dist = computeDistance(venue);
        if (dist === null) return true; // show all if no GPS
        return dist <= radius;
    }, [computeDistance, radius]);

    // Fetch all feed data
    const fetchFeed = useCallback(async () => {
        if (abortRef.current) abortRef.current.abort();
        const ac = new AbortController();
        abortRef.current = ac;
        const signal = ac.signal;
        const items = [];

        try {
            // Live games
            const liveRes = await fetch('/api/poker/live-games?active=true', { signal });
            if (!liveRes.ok) throw new Error(`Live games: HTTP ${liveRes.status}`);
            const liveData = await liveRes.json();
            // WIRING FIX: the active=true branch of /api/poker/live-games answers
            // { success, venues: { [venue_id]: [game, ...] } } — `games` is only returned
            // by the venue_id branch. Reading `liveData.games || liveData.data` was always
            // undefined, so the live_game feed type (the first filter chip) was always
            // empty. Read the grouped shape, keeping the flat keys as a fallback.
            // (`limit` was also dropped from the request: the handler hardcodes .limit(100).)
            const liveGames = Array.isArray(liveData.games)
                ? liveData.games
                : (Array.isArray(liveData.data)
                    ? liveData.data
                    : Object.values(liveData.venues || {}).flat());
            liveGames.forEach(g => {
                if (!g) return;
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
            // Recent check-ins (from all venues) — parallel fetch to avoid O(N) serial timeout
            const now = new Date();
            const twoHoursAgo = new Date(now - 2 * 60 * 60 * 1000).toISOString();
            // BUG FIX: this used to be `venues.filter(isWithinRadius).slice(0, 20)`.
            // isWithinRadius keeps every venue that has no lat/lng, and nothing sorted the
            // survivors, so the 20 sampled venues were whatever happened to sit first in
            // array order — the user's own local room was frequently never queried while
            // rooms 2,000 miles away filled the stream. Sort nearest-first (unknown last).
            const nearbyVenues = venues
                .filter(isWithinRadius)
                .map(v => ({ v, d: computeDistance(v) }))
                .sort((a, b) => (a.d === null ? Infinity : a.d) - (b.d === null ? Infinity : b.d))
                .slice(0, 20)
                .map(entry => entry.v);
            
            // [NMF1 FIX] Was a serial for-of loop that could fire setFeedItems after unmount between iterations.
            // Now parallel via Promise.allSettled with a single isMounted guard after all settle.
            const checkinResults = await Promise.allSettled(
                nearbyVenues.map(v =>
                    fetch(`/api/poker/checkins?venue_id=${v.id}&count_only=false&since=${encodeURIComponent(twoHoursAgo)}`, { signal })
                        .then(r => r.ok ? r.json() : { checkins: [] })
                        .then(data => ({ v, checkins: data.checkins || [] }))
                        .catch(() => ({ v, checkins: [] }))
                )
            );
            
            if (!isMounted.current || ac.signal.aborted) return;
            checkinResults.forEach(result => {
                if (result.status !== 'fulfilled') return;
                const { v, checkins } = result.value;
                checkins.forEach(c => {
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
            });
        } catch { /* continue */ }

        if (!isMounted.current || ac.signal.aborted) return;
        try {
            // Upcoming tournament starts.
            // GAP FIX: TYPE_COLORS/FEED_ICONS have always defined a 'tournament' type
            // with its own filter chip, but nothing ever fetched tournaments — selecting
            // the chip showed the empty state and the tournament click-through branch
            // below was dead code. /api/poker/daily-tournaments defaults to today.
            const tourneyRes = await fetch('/api/poker/daily-tournaments?limit=100', { signal });
            if (!tourneyRes.ok) throw new Error(`Daily tournaments: HTTP ${tourneyRes.status}`);
            const tourneyData = await tourneyRes.json();
            const nowDate = new Date();
            (tourneyData.tournaments || tourneyData.data || []).forEach(t => {
                const venue = venues.find(v =>
                    String(v.id) === String(t.venue_id) ||
                    (t.venue_name && (v.name || '').toLowerCase() === String(t.venue_name).toLowerCase())
                );
                if (!venue || !isWithinRadius(venue)) return;
                const startMinutes = parseStartMinutes(t.start_time);
                if (startMinutes === null) return;
                // BUG FIX: "now" used to be the BROWSER's clock (nowDate.getHours()), but
                // start_time is the venue's posted LOCAL time. On a nationwide directory
                // that is wrong by the whole timezone offset — an East-Coast user saw a
                // 7:00 PM Las Vegas tournament as three hours past (and the minsAway < -30
                // filter dropped it). Compare wall clocks inside the VENUE's zone.
                const venueTz = resolveVenueTimeZone({
                    timezone: venue.timezone,
                    state: venue.state || t.venue_state || t.state,
                });
                const zoned = venueTz ? getZonedNow(venueTz, nowDate) : null;
                // No usable zone means we cannot honestly say how far away the start is.
                if (!zoned) return;
                const nowMinutes = zoned.minutes;
                const minsAway = startMinutes - nowMinutes;
                // Only surface starts still ahead of us (or just underway) today.
                if (minsAway < -30 || minsAway > TOURNAMENT_LOOKAHEAD_MIN) return;
                const buyIn = Number(t.buy_in) || 0;
                // Absolute instant of the start, derived from the venue-local offset
                // (setHours would re-anchor it to the viewer's clock and undo the fix).
                const startDate = new Date(nowDate.getTime() + minsAway * 60000);
                const hoursAway = Math.floor(Math.abs(minsAway) / 60);
                items.push({
                    type: 'tournament',
                    title: t.tournament_name || t.name || `${t.game_type || 'Tournament'}`,
                    subtitle: venue.name,
                    detail: [
                        minsAway <= 0 ? 'Underway' : `Starts ${t.start_time}`,
                        buyIn > 0 ? `$${buyIn.toLocaleString()} buy-in` : null,
                    ].filter(Boolean).join(' - '),
                    venue,
                    time: startDate.toISOString(),
                    // timeAgo() would render a future start as "Just now"; show the wait instead.
                    timeLabel: minsAway <= 0
                        ? 'Now'
                        : (minsAway < 60 ? `in ${minsAway}m` : `in ${hoursAway}h ${minsAway % 60}m`),
                    // The feed sorts newest-first; anchor imminent starts near the top
                    // instead of letting a start 6 hours out outrank a 1-minute-old check-in.
                    sortTime: new Date(nowDate.getTime() - Math.max(minsAway, 0) * 60000).toISOString(),
                    id: `tournament-${t.id || `${t.venue_id}-${t.start_time}`}`,
                });
            });
        } catch { /* continue */ }

        if (!isMounted.current || ac.signal.aborted) return;
        try {
            // Promotions
            const promoRes = await fetch('/api/poker/promotions?limit=30', { signal });
            // [NMF2 FIX] Was missing .ok check — a 500 response body would still be parsed
            // and then crash accessing .promotions on the error JSON object.
            if (!promoRes.ok) throw new Error(`Promotions: HTTP ${promoRes.status}`);
            const promoData = await promoRes.json();
            (promoData.promotions || promoData.data || []).forEach(p => {
                // WIRING FIX: page_id is only a venue id when page_type === 'venue'.
                // Matching it unconditionally misattributed a tour/series promotion to
                // whichever venue happened to share that numeric id.
                const venue = venues.find(v =>
                    (p.venue_id != null && String(v.id) === String(p.venue_id)) ||
                    (p.page_type === 'venue' && String(v.id) === String(p.page_id))
                );
                if (venue && isWithinRadius(venue)) {
                    items.push({
                        type: 'promotion',
                        // WIRING FIX: /api/poker/promotions emits { title, content, ... } —
                        // there is no `description` key, so every promotion rendered with an
                        // empty body, and activity-sourced rows (title hardcoded null) showed
                        // only the generic literal "Promotion".
                        title: p.title || p.page_name || 'Promotion',
                        subtitle: venue.name,
                        detail: p.content || p.description || '',
                        venue,
                        time: p.created_at || new Date().toISOString(),
                        id: `promo-${p.id}`,
                    });
                }
            });
        } catch { /* continue */ }

        if (!isMounted.current || ac.signal.aborted) return;
        // Sort by time descending
        items.sort((a, b) => new Date(b.sortTime || b.time) - new Date(a.sortTime || a.time));
        setFeedItems(items);
        setLoading(false);
        setLastRefresh(new Date());
    }, [venues, isWithinRadius]);

    useEffect(() => {
        fetchFeed();
        // Disabled auto-refresh per user request!
        // refreshRef.current = setInterval(fetchFeed, FEED_REFRESH_MS);
        return () => { if (refreshRef.current) clearInterval(refreshRef.current); };
    }, [fetchFeed]);

    const filteredItems = filter === 'all' ? feedItems : feedItems.filter(f => f.type === filter);

    return (
        <div className="near-me-feed">
            <div className="nmf-header">
                <div className="nmf-icon">
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" strokeWidth="1.5">
                        <circle cx="12" cy="12" r="3" fill="#ffffff" stroke="none" />
                        <circle cx="12" cy="12" r="7" stroke="#ffffff" opacity="0.5" fill="none" strokeDasharray="3 3">
                            <animateTransform attributeName="transform" type="rotate" dur="8s" from="0 12 12" to="360 12 12" repeatCount="indefinite" />
                        </circle>
                        <circle cx="12" cy="12" r="11" stroke="#ffffff" opacity="0.25" fill="none" strokeDasharray="2 4">
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
                    {Object.entries(TYPE_COLORS || {}).map(([key, val]) => (
                        <button key={key} className={'nmf-chip' + (filter === key ? ' active' : '')} onClick={() => setFilter(key)} style={filter === key ? { background: val.bg, borderColor: val.border, color: val.text } : {}}>
                            {val.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Feed */}
            {loading && <FeedSkeleton count={4} />}

            {!loading && filteredItems.length === 0 && (
                <div className="nmf-empty">
                    <div className="nmf-empty-icon">
                        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="1.5">
                            <circle cx="12" cy="12" r="10" />
                            <path d="M12 8v4M12 16h.01" />
                        </svg>
                    </div>
                    <p className="nmf-empty-title">No activity nearby right now</p>
                    <p className="nmf-empty-hint">Try increasing your radius or check back soon</p>
                    
                    {/* CTA Buttons */}
                    <div className="nmf-empty-ctas">
                        {!userLocation && onRequestGPS && (
                            <button className="nmf-cta-btn nmf-cta-gps" onClick={onRequestGPS}>
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <circle cx="12" cy="12" r="10" /><path d="M22 12h-4M6 12H2M12 6V2M12 22v-4" />
                                </svg>
                                Enable GPS
                            </button>
                        )}
                        {onSwitchTab && (
                            <button className="nmf-cta-btn nmf-cta-live" onClick={() => onSwitchTab('live')}>
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 01-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
                                </svg>
                                View Live Games
                            </button>
                        )}
                        {onSwitchTab && (
                            <button className="nmf-cta-btn nmf-cta-map" onClick={() => onSwitchTab('map')}>
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" /><line x1="8" y1="2" x2="8" y2="18" /><line x1="16" y1="6" x2="16" y2="22" />
                                </svg>
                                Browse Map
                            </button>
                        )}
                    </div>
                </div>
            )}

            {!loading && filteredItems.length > 0 && (
                <div className="nmf-feed-list">
                    {filteredItems.map((item, i) => {
                        const typeStyle = TYPE_COLORS[item.type] || TYPE_COLORS.live_game;
                        return (
                            <div key={item.id || i} className="nmf-item" onClick={() => {
                                if (item.venue?.id && onNavigateVenue) {
                                    onNavigateVenue(item.venue.id);
                                } else if (item.type === 'tournament' && onSwitchTab) {
                                    onSwitchTab('daily');
                                } else if (onSwitchTab) {
                                    onSwitchTab('live');
                                }
                            }} style={{ borderLeftColor: typeStyle.border, cursor: 'pointer' }}>
                                <div className="nmf-item-icon">{FEED_ICONS[item.type]}</div>
                                <div className="nmf-item-content">
                                    <div className="nmf-item-top">
                                        <span className="nmf-item-title">{item.title}</span>
                                        <span className="nmf-item-time">{item.timeLabel || timeAgo(item.time)}</span>
                                    </div>
                                    <div className="nmf-item-subtitle">
                                        {item.subtitle}
                                        {item.venue && (() => {
                                            const d = computeDistance(item.venue);
                                            return d !== null ? (
                                                <span style={{ marginLeft: 6, padding: '1px 6px', borderRadius: 4, fontSize: 10, fontWeight: 600, background: 'rgba(63,185,80,0.15)', color: '#3fb950', border: '1px solid rgba(63,185,80,0.25)' }}>
                                                    {d < 1 ? '<1' : Math.round(d)} mi
                                                </span>
                                            ) : null;
                                        })()}
                                    </div>
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

            <style>{`
        .near-me-feed { padding: 0 0 20px; }
        .nmf-header { display: flex; align-items: center; gap: 10px; margin-bottom: 16px; }
        .nmf-header h2 { font-size: 22px; font-weight: 700; color: #fff; margin: 0; flex: 1; }
        .nmf-icon { display: flex; align-items: center; }
        .nmf-refresh-time { font-size: 11px; color: rgba(255,255,255,0.3); }
        .nmf-controls { display: flex; flex-direction: column; gap: 10px; margin-bottom: 16px; }
        .nmf-radius, .nmf-type-filter { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
        .nmf-ctrl-label { font-size: 12px; color: rgba(255,255,255,0.4); font-weight: 500; }
        .nmf-chip { padding: 6px 12px; border-radius: 8px; background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.1); color: rgba(255,255,255,0.6); font-size: 12px; cursor: pointer; transition: all 0.2s; white-space: nowrap; font-family: inherit; }
        .nmf-chip.active { background: rgba(255,255,255,0.15); border-color: rgba(255,255,255,0.4); color: #ffffff; }
        .nmf-feed-list { display: flex; flex-direction: column; gap: 6px; }
        .nmf-item { display: flex; align-items: flex-start; gap: 12px; padding: 14px 16px; background: rgba(15,23,42,0.5); border: 1px solid rgba(255,255,255,0.06); border-left: 3px solid #ffffff; border-radius: 10px; transition: all 0.2s; cursor: pointer; }
        .nmf-item:hover { background: rgba(15,23,42,0.7); border-color: rgba(255,255,255,0.1); transform: translateX(2px); }
        .nmf-item:active { transform: scale(0.98); }
        .nmf-item-icon { flex-shrink: 0; margin-top: 2px; }
        .nmf-item-content { flex: 1; min-width: 0; }
        .nmf-item-top { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
        .nmf-item-title { font-size: 14px; font-weight: 600; color: #fff; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .nmf-item-time { font-size: 11px; color: rgba(255,255,255,0.3); flex-shrink: 0; }
        .nmf-item-subtitle { font-size: 12px; color: rgba(255,255,255,0.5); margin-top: 2px; }
        .nmf-item-detail { font-size: 12px; color: rgba(255,255,255,0.3); margin-top: 2px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .nmf-item-type { padding: 3px 8px; border-radius: 4px; font-size: 10px; font-weight: 600; border: 1px solid; flex-shrink: 0; align-self: center; }
        
        /* Skeleton styles */
        .nmf-skeleton { animation: nmf-pulse 1.5s ease-in-out infinite; }
        .nmf-skel-icon { width: 18px; height: 18px; border-radius: 50%; background: rgba(255,255,255,0.06); flex-shrink: 0; }
        .nmf-skel-content { flex: 1; display: flex; flex-direction: column; gap: 6px; }
        .nmf-skel-line { border-radius: 4px; background: rgba(255,255,255,0.06); }
        .nmf-skel-title { width: 65%; height: 14px; }
        .nmf-skel-sub { width: 40%; height: 10px; }
        .nmf-skel-badge { width: 60px; height: 20px; border-radius: 4px; background: rgba(255,255,255,0.04); flex-shrink: 0; align-self: center; }
        
        /* Empty state with CTAs */
        .nmf-empty { display: flex; flex-direction: column; align-items: center; padding: 48px 20px 32px; text-align: center; }
        .nmf-empty-icon { width: 72px; height: 72px; border-radius: 50%; background: rgba(255,255,255,0.06); display: flex; align-items: center; justify-content: center; margin-bottom: 16px; }
        .nmf-empty-title { color: rgba(255,255,255,0.6); font-size: 16px; font-weight: 600; margin: 0 0 4px; }
        .nmf-empty-hint { color: rgba(255,255,255,0.3); font-size: 13px; margin: 0 0 20px; }
        .nmf-empty-ctas { display: flex; gap: 8px; flex-wrap: wrap; justify-content: center; }
        .nmf-cta-btn { display: flex; align-items: center; gap: 6px; padding: 10px 16px; border-radius: 10px; font-size: 13px; font-weight: 600; cursor: pointer; transition: all 0.2s; border: 1px solid; font-family: inherit; }
        .nmf-cta-gps { background: rgba(34,197,94,0.1); border-color: rgba(34,197,94,0.3); color: #22c55e; }
        .nmf-cta-gps:hover { background: rgba(34,197,94,0.2); }
        .nmf-cta-live { background: rgba(239,68,68,0.1); border-color: rgba(239,68,68,0.3); color: #ef4444; }
        .nmf-cta-live:hover { background: rgba(239,68,68,0.2); }
        .nmf-cta-map { background: linear-gradient(180deg, rgba(255,255,255,0.12), rgba(200,214,229,0.08)); border-color: rgba(255,255,255,0.35); color: #ffffff; }
        .nmf-cta-map:hover { border-color: rgba(255,255,255,0.5); }
        
        @keyframes nmf-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
        </div>
    );
}
