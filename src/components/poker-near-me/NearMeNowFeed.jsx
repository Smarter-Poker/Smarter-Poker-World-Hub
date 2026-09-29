/**
 * NearMeNowFeed.jsx — Feature #10: "Near Me Now" Live Feed
 * Real-time scrolling feed combining live games, check-ins, tournament starts, and promotions.
 * v2.0 — Enhanced with CTA-rich empty states and skeleton loading
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { haversineMiles, timeAgo, getZonedNow, resolveVenueTimeZone } from './pnm-utils';
import { PokerNearMeConsoleIcon, PokerNearMePanelShell } from './PokerNearMeConsole';

const FEED_REFRESH_MS = 60000; // 1 minute

const FEED_ICON_NAMES = {
    live_game: 'globe',
    checkin: 'location',
    tournament: 'calendar',
    promotion: 'saved',
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
                        // SCHEMA FIX: `players` is not a live_games column (the table has
                        // table_count and wait_time), so this detail line was always empty.
                        detail: [
                            g.table_count ? `${g.table_count} table${Number(g.table_count) === 1 ? '' : 's'}` : null,
                            g.wait_time ? `${g.wait_time} waiting` : null,
                        ].filter(Boolean).join(' - '),
                        venue,
                        // `updated_at` is also absent from live_games — created_at is the real column.
                        time: g.created_at || new Date().toISOString(),
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
        <PokerNearMePanelShell
            as="section"
            className="near-me-feed pnm-console-tool"
            bodyClassName="pnm-console-tool__body"
            aria-labelledby="pnm-near-me-feed-title"
        >
            <div className="nmf-header">
                <div className="nmf-icon">
                    <PokerNearMeConsoleIcon name="location" className="pnm-console-tool__header-icon" />
                </div>
                <h2 id="pnm-near-me-feed-title">Near Me Now</h2>
                {lastRefresh && (
                    <span className="nmf-refresh-time">Updated {timeAgo(lastRefresh.toISOString())}</span>
                )}
            </div>

            {/* Radius filter */}
            <div className="nmf-controls">
                <div className="nmf-radius">
                    <span className="nmf-ctrl-label">Radius:</span>
                    {RADIUS_OPTIONS.map(r => (
                        <button type="button" key={r} className={'nmf-chip' + (radius === r ? ' active' : '')} aria-pressed={radius === r} onClick={() => setRadius(r)}>{r} Mi</button>
                    ))}
                </div>
                <div className="nmf-type-filter">
                    <button type="button" className={'nmf-chip' + (filter === 'all' ? ' active' : '')} aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>All</button>
                    {Object.entries(TYPE_COLORS || {}).map(([key, val]) => (
                        <button type="button" key={key} className={`nmf-chip nmf-chip--${key}${filter === key ? ' active' : ''}`} aria-pressed={filter === key} onClick={() => setFilter(key)}>
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
                        <PokerNearMeConsoleIcon name="location" className="pnm-console-tool__state-icon" />
                    </div>
                    <p className="nmf-empty-title">No Activity Nearby Right Now</p>
                    <p className="nmf-empty-hint">Try Increasing Your Radius Or Check Back Soon</p>
                    
                    {/* CTA Buttons */}
                    <div className="nmf-empty-ctas">
                        {!userLocation && onRequestGPS && (
                            <button type="button" className="nmf-cta-btn nmf-cta-gps" onClick={onRequestGPS}>
                                <PokerNearMeConsoleIcon name="location" />
                                Enable GPS
                            </button>
                        )}
                        {onSwitchTab && (
                            <button type="button" className="nmf-cta-btn nmf-cta-live" onClick={() => onSwitchTab('live')}>
                                <PokerNearMeConsoleIcon name="globe" />
                                View Live Games
                            </button>
                        )}
                        {onSwitchTab && (
                            <button type="button" className="nmf-cta-btn nmf-cta-map" onClick={() => onSwitchTab('map')}>
                                <PokerNearMeConsoleIcon name="location" />
                                Browse Map
                            </button>
                        )}
                    </div>
                </div>
            )}

            {!loading && filteredItems.length > 0 && (
                <div className="nmf-feed-list">
                    {filteredItems.map((item, i) => {
                        const typeKey = TYPE_COLORS[item.type] ? item.type : 'live_game';
                        const typeStyle = TYPE_COLORS[typeKey];
                        // A11Y FIX: these rows were click-only divs — no role, no tabIndex, no key
                        // handler and no accessible name — so the entire feed was unreachable
                        // without a pointer. Matches PeakActivityHeatmap / SeasonalCalendar.
                        const activateItem = () => {
                            if (item.venue?.id && onNavigateVenue) {
                                onNavigateVenue(item.venue.id);
                            } else if (item.type === 'tournament' && onSwitchTab) {
                                onSwitchTab('daily');
                            } else if (onSwitchTab) {
                                onSwitchTab('live');
                            }
                        };
                        return (
                            <div key={item.id || i} className={`nmf-item nmf-item--${typeKey}`}
                                role="button"
                                tabIndex={0}
                                aria-label={[item.title, item.subtitle].filter(Boolean).join(' at ')}
                                onClick={activateItem}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
                                        e.preventDefault();
                                        activateItem();
                                    }
                                }}>
                                <div className="nmf-item-icon">
                                    <PokerNearMeConsoleIcon name={FEED_ICON_NAMES[typeKey]} />
                                </div>
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
                                                <span className="nmf-item-distance">
                                                    {d < 1 ? '<1' : Math.round(d)} Mi
                                                </span>
                                            ) : null;
                                        })()}
                                    </div>
                                    {item.detail && <div className="nmf-item-detail">{item.detail}</div>}
                                </div>
                                <span className="nmf-item-type">
                                    {typeStyle.label}
                                </span>
                            </div>
                        );
                    })}
                </div>
            )}

        </PokerNearMePanelShell>
    );
}
