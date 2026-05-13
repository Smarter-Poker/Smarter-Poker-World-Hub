/**
 *  POKER NEAR ME - Live Venue & Cash Games Finder v4.2
 * Find poker rooms, venues, and live cash games near you
 */

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { usePersistedFilters } from '../../../src/hooks/usePersistedFilters';
import SEOHead from '../../../src/components/seo/SEOHead';
import { useRouter } from 'next/router';
import Image from 'next/image';
import dynamic from 'next/dynamic';
import { useAvatar } from '../../../src/contexts/AvatarContext';
import HamburgerMenu from '../../../src/components/ui/HamburgerMenu';
import { getMenuConfig } from '../../../src/config/hamburgerMenus';
import { getPokerNearMePreferences, updatePokerNearMePreferences } from '../../../src/services/pokerNearMePreferences';
import { getVenueFavorites, addVenueFavorite, removeVenueFavorite } from '../../../src/services/pokerNearMeFavorites';
import { addSearchHistory as addSearchHistoryToDb, getSearchHistory as getSearchHistoryFromDb } from '../../../src/services/pokerNearMeSearchHistory';
import { eventBus, busEmit, EventType } from '../../../src/engine/EventBus';
import useTourMapStops from '../../../src/hooks/useTourMapStops';
import useVenueRealtime from '../../../src/hooks/useVenueRealtime';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
const GlobalSearchOverlay = dynamic(() => import('../../../src/components/poker-near-me/GlobalSearchOverlay'), { ssr: false });
import { useFeatureGate } from '../../../src/components/gates/FeatureGatePopup';
const FullScreenPageOverlay = dynamic(() => import('../../../src/components/ui/FullScreenPageOverlay'), { ssr: false });

import BottomNavBar from '../../../src/components/ui/BottomNavBar';
import { PNM_TAB_TUTORIALS } from '../../../src/components/poker-near-me/InteractiveTutorial';
const InteractiveTutorial = dynamic(() => import('../../../src/components/poker-near-me/InteractiveTutorial'), { ssr: false });
// Extracted tab panel components — lazy-loaded for code splitting
const MapTabPanel = dynamic(() => import('../../../src/components/poker-near-me/MapTabPanel'), { ssr: false });
const VenuesTabPanel = dynamic(() => import('../../../src/components/poker-near-me/VenuesTabPanel'), { ssr: false });
const ToursTabPanel = dynamic(() => import('../../../src/components/poker-near-me/ToursTabPanel'), { ssr: false });
const SeriesTabPanel = dynamic(() => import('../../../src/components/poker-near-me/SeriesTabPanel'), { ssr: false });
const DailyTournamentsTabPanel = dynamic(() => import('../../../src/components/poker-near-me/DailyTournamentsTabPanel'), { ssr: false });
const FavoritesTabPanel = dynamic(() => import('../../../src/components/poker-near-me/FavoritesTabPanel'), { ssr: false });
const MoreTabPanel = dynamic(() => import('../../../src/components/poker-near-me/MoreTabPanel'), { ssr: false });

// Components still used directly in the main file
const GeofenceAlertBanner = dynamic(() => import('../../../src/components/poker-near-me/GeofenceAlertBanner'), { ssr: false });
const VenueReviews = dynamic(() => import('../../../src/components/poker-near-me/VenueReviews'), { ssr: false });
const VoiceSearch = dynamic(() => import('../../../src/components/poker-near-me/VoiceSearch'), { ssr: false });
const SeasonalCalendar = dynamic(() => import('../../../src/components/poker-near-me/SeasonalCalendar'), { ssr: false });
const LiveGamesFeed = dynamic(() => import('../../../src/components/poker-near-me/LiveGamesFeed'), { ssr: false });

import { cachedFetch, fetchWithRetry } from '../../../src/components/poker-near-me/lobby/PnmApiCache';
import { resolveCityCoordsArray as resolveCityCoords } from '../../../src/data/city-coordinates';
const LocationEnableModal = dynamic(() => import('../../../src/components/ui/LocationEnableModal'), { ssr: false });

// Page configuration constants
const PAGE_SIZE = 20;
const PAGE_SIZE_DAILY = 50;
const PAGE_SIZE_LIVE = 30;
const LIVE_REFRESH_MS = 120000; // 2 minutes
const SEARCH_DEBOUNCE_MS = 400;
const SEARCH_HISTORY_MAX = 8;
const DEFAULT_RADIUS_MILES = 50;
const RADIUS_TIERS = [50, 100, 200, 500]; // Progressive radius expansion for "Load More"

// City coordinates imported from ../../../src/data/city-coordinates.js
// resolveCityCoords is imported as resolveCityCoordsArray above

// Tab order for swipe navigation
const TAB_ORDER = ['venues', 'events', 'live', 'map', 'saved', 'more'];
const EVENTS_SUB_TABS = ['tours', 'series', 'daily', 'calendar'];
const MORE_SUB_TABS = ['overview', 'roadtrip', 'social', 'alerts', 'nearmenow', 'tripcost'];

// ── Safe localStorage helper — evicts large cache blobs if quota is exceeded ──
// Priority eviction order: offline-venues (largest), map-filters, analytics
function safeSetItem(key, value) {
    try {
        localStorage.setItem(key, value);
    } catch (e) {
        if (e && (e.name === 'QuotaExceededError' || e.code === 22)) {
            // Evict largest known cache blobs and retry once
            const EVICT_KEYS = ['sp-offline-venues', 'sp-search-analytics', 'poker-near-me-map-filters'];
            let freed = false;
            for (const evictKey of EVICT_KEYS) {
                if (evictKey !== key && localStorage.getItem(evictKey)) {
                    localStorage.removeItem(evictKey);
                    freed = true;
                    try { localStorage.setItem(key, value); return; } catch (_) { console.warn('[App] Handled exception:', _?.message || _); }
                }
            }
            if (!freed) console.warn('[PNM] localStorage quota exhausted — could not write:', key);
        }
    }
}

// Search analytics tracker
function trackSearchEvent(eventName, data) {
    try {
        // Log for analytics (can be wired to Sentry, Mixpanel, etc.)
        if (typeof window !== 'undefined' && window.__SEARCH_ANALYTICS__) {
            window.__SEARCH_ANALYTICS__.push({ event: eventName, data, timestamp: Date.now() });
        }
        // Store locally for aggregate analysis
        const key = 'sp-search-analytics';
        const existing = JSON.parse(localStorage.getItem(key) || '[]');
        // Prevent quota exhaustion by omitting large/non-scalar data
        const safeData = { ...data };
        delete safeData.venues; delete safeData.results; delete safeData.filteredData;
        existing.push({ event: eventName, ...safeData, ts: Date.now() });
        // Keep last 50 events
        if (existing.length > 50) existing.splice(0, existing.length - 50);
        safeSetItem(key, JSON.stringify(existing));
    } catch (e) { console.warn('[App] Handled exception:', e?.message || e); }
}

// Popular cities for autocomplete
const POPULAR_CITIES = [
    { name: 'Las Vegas', state: 'NV' }, { name: 'Los Angeles', state: 'CA' },
    { name: 'Atlantic City', state: 'NJ' }, { name: 'Miami', state: 'FL' },
    { name: 'Houston', state: 'TX' }, { name: 'Dallas', state: 'TX' },
    { name: 'Chicago', state: 'IL' }, { name: 'Phoenix', state: 'AZ' },
    { name: 'San Diego', state: 'CA' }, { name: 'Tampa', state: 'FL' },
    { name: 'Denver', state: 'CO' }, { name: 'Portland', state: 'OR' },
    { name: 'Seattle', state: 'WA' }, { name: 'San Francisco', state: 'CA' },
    { name: 'New Orleans', state: 'LA' }, { name: 'Oklahoma City', state: 'OK' },
    { name: 'Biloxi', state: 'MS' }, { name: 'Tunica', state: 'MS' },
    { name: 'Reno', state: 'NV' }, { name: 'San Jose', state: 'CA' },
    { name: 'Ft. Lauderdale', state: 'FL' }, { name: 'Orlando', state: 'FL' },
    { name: 'Austin', state: 'TX' }, { name: 'San Antonio', state: 'TX' },
    { name: 'Nashville', state: 'TN' }, { name: 'Detroit', state: 'MI' },
    { name: 'Minneapolis', state: 'MN' }, { name: 'St. Louis', state: 'MO' },
    { name: 'Charlotte', state: 'NC' }, { name: 'Sacramento', state: 'CA' },
];
const GEOFENCE_ALERT_TIMEOUT_MS = 30000;
// TOTAL_VENUES removed — now derived dynamically from allVenuesForMap.length


// ─── Home games adapter ───────────────────────────────────────────────
// Pulls home groups from /api/public/home-games/discover and maps each
// one into the same shape that the rest of this page (cards, map, sort,
// filter) already uses for casinos / poker clubs / charity / tour stops.
//
// Mapping notes:
//   • venue_type: 'home_game'   → map marker is the gold dot (already
//     defined in VenueMap.jsx VENUE_TYPE_COLORS), and createVenueIcon
//     renders venue.logo_url || profile_photo_url inside the dot.
//   • logo_url ← g.avatar_url   → so the marker shows the actual venue
//     logo (e.g. The Midway Club's Midway Union crown) instead of
//     falling back to initials.
//   • id: 'hg_' + g.id          → namespaced to prevent UUID collisions
//     with the numeric venue IDs from the legacy /data/all-venues.json
//     dataset.
//   • detailUrl points to the native /hub/home-games/<slug> page rather
//     than the venue detail page (which is for scraped casino venues).
//   • games_offered: synthesized from default_game_type + default_stakes
//     so existing chips/cards on the PNM page render correctly.
async function fetchHomeGamesAsVenues() {
    try {
        const res = await fetch('/api/public/home-games/discover?limit=200');
        if (!res.ok) return [];
        const j = await res.json();
        if (!j || !j.success || !Array.isArray(j.groups)) return [];
        return j.groups.map((g) => ({
            id: 'hg_' + g.id,
            home_group_id: g.id,
            slug: g.slug,
            club_code: g.club_code,
            invite_code: g.invite_code,
            name: g.name,
            description: g.description,
            venue_type: 'home_game',
            city: g.city,
            state: g.state,
            country: g.country || 'US',
            latitude: g.approximate_lat ?? g.latitude ?? null,
            longitude: g.approximate_lng ?? g.longitude ?? null,
            distance_mi: g.distance_miles ?? null,
            // Marker + card avatar / cover
            logo_url: g.avatar_url || null,
            profile_photo_url: g.avatar_url || null,
            cover_photo_url: g.cover_url || null,
            avatar_url: g.avatar_url || null,
            // Game data (drives chips, sort, badges)
            games_offered: g.default_game_type
                ? [
                      (g.default_game_type || '').toUpperCase() +
                          (g.default_stakes ? ' ' + g.default_stakes : ''),
                  ]
                : [],
            default_game_type: g.default_game_type,
            default_stakes: g.default_stakes,
            typical_buyin_min: g.typical_buyin_min,
            typical_buyin_max: g.typical_buyin_max,
            frequency: g.frequency,
            typical_day: g.typical_day,
            typical_time: g.typical_time,
            max_players: g.max_players,
            // Counts (footer stats on cards)
            member_count: g.member_count || 0,
            saves_count: g.follower_count || 0,
            games_hosted: g.games_hosted || 0,
            // Next scheduled game
            next_game_date: g.next_game_date,
            next_game_time: g.next_game_time,
            next_game_title: g.next_game_title,
            next_game_seats_left: g.next_game_seats_left,
            // Host
            host_display_name: g.host?.display_name || null,
            host_avatar_url: g.host?.avatar_url || null,
            // Status (home games are always "live" in the sense of being
            // discoverable; the actual session is gated by next_game_date)
            is_active: true,
            is_24_hours: false,
            trust_score: null,
            // Click destination — native home-game page, not the scraped
            // venue page used for casinos
            detailUrl:
                '/hub/home-games/' +
                encodeURIComponent(g.slug || g.club_code || g.invite_code || g.id),
        }));
    } catch (e) {
        if (typeof console !== 'undefined' && console.warn) {
            console.warn('[PNM] fetchHomeGamesAsVenues failed:', e?.message || e);
        }
        return [];
    }
}

// Haversine distance in miles — used to apply the user's selected radius
// to home games after the static fetch (which has no radius param).
function _hgHaversineMi(aLat, aLng, bLat, bLng) {
    const R = 3958.8;
    const dLat = ((bLat - aLat) * Math.PI) / 180;
    const dLng = ((bLng - aLng) * Math.PI) / 180;
    const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos((aLat * Math.PI) / 180) *
            Math.cos((bLat * Math.PI) / 180) *
            Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const VENUE_TYPE_LABELS = {
    casino: 'Casino',
    card_room: 'Poker Club',
    poker_club: 'Poker Club',
    home_game: 'Home Game',
    charity: 'Charity',
    tour_stop: 'Poker Tour',
    poker_tour: 'Poker Tour'
};

const TOUR_TYPE_LABELS = {
    major: 'Major Tour',
    circuit: 'Circuit',
    high_roller: 'High Roller',
    regional: 'Regional',
    grassroots: 'Grassroots',
    charity: 'Charity',
    cruise: 'Cruise'
};

const TOUR_COLORS = {
    'WSOP': { bg: 'linear-gradient(135deg, #c9a227, #8b6914)', text: '#000', border: '#c9a227' },
    'WPT': { bg: 'linear-gradient(135deg, #dc2626, #991b1b)', text: '#fff', border: '#dc2626' },
    'WSOPC': { bg: 'linear-gradient(135deg, #c9a227, #8b6914)', text: '#000', border: '#c9a227' },
    'MSPT': { bg: 'linear-gradient(135deg, #1e40af, #1e3a8a)', text: '#fff', border: '#3b82f6' },
    'RGPS': { bg: 'linear-gradient(135deg, #059669, #047857)', text: '#fff', border: '#10b981' },
    'PGT': { bg: 'linear-gradient(135deg, #7c3aed, #5b21b6)', text: '#fff', border: '#8b5cf6' },
    'default': { bg: 'linear-gradient(135deg, #374151, #1f2937)', text: '#fff', border: '#4b5563' }
};

const DAYS_OF_WEEK = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function getTrustLevel(score) {
    if (score >= 4.5) return { label: 'High', color: '#22c55e' };
    if (score >= 4.0) return { label: 'Good', color: '#3b82f6' };
    if (score >= 3.0) return { label: 'Moderate', color: '#f59e0b' };
    return { label: 'Low', color: '#ef4444' };
}


function getCurrentDay() {
    return DAYS_OF_WEEK[new Date().getDay()];
}

// Geofence radii by venue type (meters)
const GEOFENCE_RADII = {
    casino: 500,
    card_room: 300,
    poker_club: 200,
    charity: 200,
};
const DEFAULT_GEOFENCE_RADIUS = 300;

function getGeofenceRadius(venueType) {
    return GEOFENCE_RADII[venueType] || DEFAULT_GEOFENCE_RADIUS;
}

// Tour Badge Component
function TourBadge({ tourCode, size = 'normal' }) {
    const style = TOUR_COLORS[tourCode] || TOUR_COLORS.default;
    const padding = size === 'small' ? '4px 10px' : '8px 16px';
    const fontSize = size === 'small' ? '11px' : '14px';

    return (
        <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding,
            borderRadius: '6px',
            background: style.bg,
            border: '1px solid ' + style.border,
            minWidth: size === 'small' ? '50px' : '70px'
        }}>
            <span style={{ color: style.text, fontSize, fontWeight: 800, letterSpacing: '0.5px' }}>
                {tourCode || 'TOUR'}
            </span>
        </div>
    );
}

// ═══ FAVORITE VENUE LIVE TOAST ═══
// Appears 5s after mount, visible for 2s, then auto-hides
function FavLiveToast({ message, onClick }) {
    const [visible, setVisible] = useState(false);
    const [exiting, setExiting] = useState(false);

    useEffect(() => {
        const showTimer = setTimeout(() => setVisible(true), 5000);
        const hideTimer = setTimeout(() => setExiting(true), 7000); // 5s delay + 2s visible
        const removeTimer = setTimeout(() => setVisible(false), 7400); // allow exit animation
        return () => { clearTimeout(showTimer); clearTimeout(hideTimer); clearTimeout(removeTimer); };
    }, []);

    if (!visible) return null;

    return (
        <div
            className={`pnm-fav-toast${exiting ? ' pnm-fav-toast-exit' : ''}`}
            onClick={onClick}
        >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="#ef4444" stroke="none"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg>
            <span>{message}</span>
        </div>
    );
}

// ─── Error Boundary for Tab Panels (prevents one tab crash from killing the page) ───
class TabErrorBoundary extends React.Component {
    constructor(props) { super(props); this.state = { hasError: false, error: null }; }
    static getDerivedStateFromError(error) { return { hasError: true, error }; }
    componentDidCatch(error, info) { console.warn(`[PNM] Tab crashed:`, error, info); }
    render() {
        if (this.state.hasError) {
            return React.createElement('div', {
                style: { textAlign: 'center', padding: 60, color: 'rgba(200,214,229,0.6)' }
            },
                React.createElement('div', { style: { fontSize: 40, marginBottom: 16, opacity: 0.3 } }, '\u26A0'),
                React.createElement('p', { style: { fontSize: 16, fontWeight: 600, marginBottom: 8, color: '#f59e0b' } }, 'This Tab Encountered An Error'),
                React.createElement('p', { style: { fontSize: 12, marginBottom: 20, color: 'rgba(200,214,229,0.4)', maxWidth: 300, margin: '0 auto 20px' } }, String(this.state.error?.message || 'Unknown error')),
                React.createElement('button', {
                    onClick: () => this.setState({ hasError: false, error: null }),
                    style: { padding: '10px 24px', borderRadius: 20, border: '1px solid rgba(212,168,83,0.3)', background: 'rgba(212,168,83,0.1)', color: '#d4a853', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }
                }, 'Reset Tab')
            );
        }
        return this.props.children;
    }
}

// ---- Geofence Alert Banner (bottom of screen) ----------------------------
export default function PokerNearMePage({ initialTab }) {
    const router = useRouter();
    const { user } = useAvatar();
    const bus = eventBus;
    const userId = user?.id;
    const fetchSequenceRef = useRef(0);
    const fetchToursSeqRef = useRef(0);
    const fetchSeriesSeqRef = useRef(0);
    const fetchDailySeqRef = useRef(0);
    // [BUG FIX] fetchVenuesRef avoids temporal dead zone: fetchVenues is declared later
    // as a const, so useVenueRealtime cannot reference it directly at mount time.
    const fetchVenuesRef = useRef(null);
    // Persists the last confirmed 2-letter US state ('IL', 'NV', etc.) for GPS user.
    // Unlike gpsLocationLabel (which temporarily becomes raw coordinates when fresh GPS fires
    // before reverseGeocode resolves), this ref is never cleared — it ensures user_state=IL
    // is always sent to the API even during the raw-coordinate phase of GPS refresh.
    const gpsStateRef = useRef('');

    // [HARDENING] Bind venue component to Supabase postgres_changes for global updates
    // BUG FIX: Prevent global DDOS vector! Previously `useVenueRealtime` monitored all global 
    // changes to poker_venues, venue_daily_tournaments, etc and indiscriminately spammed fetchVenues()
    // across all 10,000+ connected users for a single tournament add. Now we use surgical injection!
    useVenueRealtime((payload) => {
        // Drop manual reconnect hard refreshes given we map to filter scopes.
        if (!payload || payload.table !== 'poker_venues') return;
        
        const { eventType, new: newRec } = payload;
        if (eventType === 'UPDATE' && newRec) {
            const isHidden = newRec.is_active === false || newRec.is_suppressed === true;
            
            setVenues(prev => {
                const idx = prev.findIndex(v => v.id === newRec.id);
                if (idx === -1) return prev; // Ignore venue not currently loaded in our local UI sphere
                const next = [...prev];
                if (isHidden) {
                    next.splice(idx, 1);
                } else {
                    next[idx] = { ...next[idx], ...newRec };
                }
                return next; 
            });
            // Update the map array as well so pins stay perfectly in sync
            setAllVenuesForMap(prev => {
                const idx = prev.findIndex(v => v.id === newRec.id);
                if (idx === -1) return prev;
                const next = [...prev];
                if (isHidden) {
                    next.splice(idx, 1);
                } else {
                    next[idx] = { ...next[idx], ...newRec };
                }
                return next;
            });
        }
    });

    // ═══ VIP ACTION GATE ═══
    const { guardAction, UpgradePopup } = useFeatureGate('poker_near_me');

    // Active tab state — persisted with sortBy and seriesViewMode
    // Always default to 'map' tab — never persist 'live' tab across sessions
    const { filters: uiFilters, setFilter: setUiFilter } = usePersistedFilters('poker-near-me', {
        activeTab: 'map',
        activeEventTab: 'daily',
        activeMoreTab: 'overview',
        sortBy: 'distance',
        seriesViewMode: 'grid',
        venueViewMode: 'list'
    });

    // HARDENED: Reset 'live' tab back to 'map' on every mount — live tab is ephemeral
    const tabResetDoneRef = useRef(false);

    // If persisted tab is 'live', reset it to 'map' immediately (live tab must not persist)
    const rawActiveTab = uiFilters.activeTab;
    const activeTab = (rawActiveTab === 'live' || !rawActiveTab) ? 'map' : rawActiveTab;
    const activeEventTab = uiFilters.activeEventTab || 'daily';
    const activeMoreTab = uiFilters.activeMoreTab || 'overview';
    const sortBy = uiFilters.sortBy;
    const seriesViewMode = uiFilters.seriesViewMode;
    const venueViewMode = uiFilters.venueViewMode || 'list';

    // Ephemeral live tab state — never persisted across sessions. Starts always false.
    const [showLiveTab, setShowLiveTab] = React.useState(false);
    const setActiveTab = (val) => {
        if (typeof navigator !== 'undefined' && navigator.vibrate) {
            try { navigator.vibrate(1); } catch (e) { console.warn('[App] Handled exception:', e?.message || e); }
        }
        // Reset More sub-tab to overview when switching to 'more' tab
        if (val === 'more') {
            setUiFilter('activeMoreTab', 'overview');
        }
        // 'live' is handled by showLiveTab state — don't write it to persisted storage
        if (val !== 'live') {
            setUiFilter('activeTab', val);
        }
    };
    // Helper to toggle live tab — also hides it when switching to any real tab
    const activateTab = (val) => {
        if (val === 'live') {
            setShowLiveTab(prev => !prev);
        } else {
            setShowLiveTab(false);
            setActiveTab(val);
        }
    };
    const setActiveEventTab = (val) => setUiFilter('activeEventTab', val);
    const setActiveMoreTab = (val) => setUiFilter('activeMoreTab', val);
    const setSortBy = (val) => setUiFilter('sortBy', val);
    const setSeriesViewMode = (val) => setUiFilter('seriesViewMode', val);
    const setVenueViewMode = (val) => setUiFilter('venueViewMode', val);

    // ─── HARDENING: Sync Next.js route parameter to LocalStorage active tabs ───
    // When returning via BACK button to /hub/poker-near-me/tours, initialTab is 'tours'.
    // If localStorage was stale or out-of-sync, it overrides the URL parameter. This forces sync.
    useEffect(() => {
        if (!initialTab) return;
        if (['tours', 'series', 'daily'].includes(initialTab)) {
            if (rawActiveTab !== 'events' || activeEventTab !== initialTab) {
                setUiFilter('activeTab', 'events');
                setUiFilter('activeEventTab', initialTab);
            }
        } else if (['lobby', 'venues', 'live', 'map', 'saved', 'more'].includes(initialTab)) {
            if (rawActiveTab !== initialTab) {
                setUiFilter('activeTab', initialTab);
            }
        }
    }, [initialTab, rawActiveTab, activeEventTab]);


    // Data states
    const [venues, setVenues] = useState([]);
    const [allVenuesForMap, setAllVenuesForMap] = useState([]);
    const [tours, setTours] = useState([]);
    const [series, setSeries] = useState([]);
    const [dailyTournaments, setDailyTournaments] = useState([]);
    const [dbStats, setDbStats] = useState({ total: 0, tournaments: 0, states: 0 });



    // Live table count for map stats (fetched from live-tables API)
    const [liveTableCount, setLiveTableCount] = useState(0);
    const [liveVenueCount, setLiveVenueCount] = useState(0);

    // UI states
    const [loading, setLoading] = useState(true);
    const [venueLoading, setVenueLoading] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [userLocation, setUserLocation] = useState(null);
    const [gpsLoading, setGpsLoading] = useState(false);
    const [gpsLocationLabel, setGpsLocationLabel] = useState(null);
    const [showLocationModal, setShowLocationModal] = useState(false);
    const [iframeModal, setIframeModal] = useState({ isOpen: false, url: '', title: '' });
    const [showFilters, setShowFilters] = useState(false);
    const [selectedCity, setSelectedCity] = useState(null);
    const [nearestDistance, setNearestDistance] = useState(null);
    const [hasSearched, setHasSearched] = useState(true);

    // Geofence alert state
    const [geofenceAlert, setGeofenceAlert] = useState(null);
    const geofenceRef = useRef(null);
    const [menuOpen, setMenuOpen] = useState(false);
    const [showGlobalSearch, setShowGlobalSearch] = useState(false);

    // Map fullscreen modal state
    const [mapFullscreen, setMapFullscreen] = useState(false);

    // ─── Batch fetch review stats for venue cards (star ratings) ───
    const [pnmReviewStatsMap, setPnmReviewStatsMap] = useState({});
    const pnmReviewStatsRef = useRef(pnmReviewStatsMap);
    pnmReviewStatsRef.current = pnmReviewStatsMap;
    useEffect(() => {
        if (venues.length === 0) return;
        const newIds = venues
            .map(v => v.id)
            .filter(id => id && !pnmReviewStatsRef.current[String(id)])
            .slice(0, 50);
        if (newIds.length === 0) return;
        fetch('/api/poker/reviews?stats_only=true&venue_ids=' + newIds.join(','))
            .then(r => r.json())
            .then(j => { if (j.success && j.stats) setPnmReviewStatsMap(prev => ({ ...prev, ...j.stats })); })
            .catch(e => { console.warn('[App] Handled promise rejection:', e?.message || e); });
    }, [venues]);

    // ─── Live Cash Game Data Merger ───
    // Fetches /api/poker/live-tables on mount AND every 15 minutes (matching scraper cadence)
    // to keep VenueCard live_data counts fresh. LiveGamesFeed has its own 2-min polling;
    // this is a lightweight background sync for the Venues tab cards only.
    const [liveDataMap, setLiveDataMap] = useState({}); // bravo_slug/normalized_name → live_data
    const buildLiveDataMap = useCallback(() => {
        fetch('/api/poker/live-tables')
            .then(r => r.json())
            .then(json => {
                if (!json.venues) return;
                const map = {};
                json.venues.forEach(v => {
                    const normName = (v.venue_name || '').toLowerCase()
                        .replace(/&/g, 'and').replace(/'/g, '').replace(/-/g, ' ')
                        .replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
                    const totalTables = (v.games || []).reduce((s, g) => s + (g.tables_running || 0), 0);
                    const totalWaiting = (v.games || []).reduce((s, g) => s + (g.players_waiting || 0), 0);
                    const liveEntry = {
                        tables_running: totalTables,
                        players_waiting: totalWaiting,
                        games: v.games || [],
                        last_updated: v.last_updated,
                        bravo_slug: v.bravo_slug,
                    };
                    if (v.bravo_slug) map[v.bravo_slug] = liveEntry;
                    if (normName) map[normName] = liveEntry;
                });
                setLiveDataMap(prev => {
                    // POLICY: Never overwrite good data with empty data.
                    // If the new fetch returns fewer venues, preserve entries from
                    // previous fetch that aren't in the new response.
                    const merged = { ...prev, ...map };
                    return merged;
                });
            })
            .catch(e => { console.warn('[App] Handled promise rejection:', e?.message || e); });
    }, []);
    useEffect(() => {
        buildLiveDataMap(); // Initial fetch on mount
        const refreshTimer = setInterval(buildLiveDataMap, 15 * 60 * 1000); // 15-min refresh
        return () => clearInterval(refreshTimer);
    }, [buildLiveDataMap]);
    const liveDataMapRef = useRef({});
    useEffect(() => { liveDataMapRef.current = liveDataMap; }, [liveDataMap]);

    // Merge live_data into venues whenever liveDataMap changes (runs on every scrape cycle)
    // FIXED: was guarded by _liveMerged one-shot flag that permanently prevented re-merging.
    // Now always re-merges when liveDataMap updates, using last_updated timestamp to skip
    // venues where the data hasn't actually changed (avoids unnecessary re-renders).
    useEffect(() => {
        if (Object.keys(liveDataMap || {}).length === 0) return;
        setVenues(prev => {
            let changed = false;
            const next = prev.map(venue => {
                const normName = (venue.name || '').toLowerCase()
                    .replace(/&/g, 'and').replace(/'/g, '').replace(/-/g, ' ')
                    .replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
                const liveEntry = (venue.bravo_slug && liveDataMap[venue.bravo_slug])
                    || liveDataMap[normName]
                    || null;
                // POLICY: Never strip live_data from venue cards.
                // Even when scraper is down and tables_running=0, show games list
                // (stakes offered, game types). Only strip if the entry has zero games.
                const hasGameData = liveEntry && (liveEntry.games || []).length > 0;
                const newLiveData = hasGameData ? liveEntry : null;
                // Skip if timestamp hasn't changed (avoid unnecessary object churn)
                const curTs = venue.live_data?.last_updated;
                const newTs = newLiveData?.last_updated;
                if (!newLiveData && !venue.live_data) return venue; // no change
                if (curTs && newTs && curTs === newTs) return venue; // same data
                changed = true;
                // POLICY: Never replace existing live_data with null.
                // If the new data is empty but we had data before, keep the old data.
                if (!newLiveData && venue.live_data) return venue;
                return { ...venue, live_data: newLiveData };
            });
            return changed ? next : prev; // referential equality guard
        });
    }, [liveDataMap]);


    const [checkinCounts, setCheckinCounts] = useState({});
    useEffect(() => {
        fetch('/api/poker/checkins?today=true')
            .then(r => r.json())
            .then(json => {
                if (json.success && json.data) {
                    const counts = {};
                    json.data.forEach(c => {
                        counts[String(c.venue_id)] = (counts[String(c.venue_id)] || 0) + 1;
                    });
                    setCheckinCounts(counts);
                }
            })
            .catch(e => console.warn('[App] Handled promise rejection:', e?.message || e));
    }, []);

    // ─── Listen for review submissions to refresh review stats for that venue ───
    useEffect(() => {
        const handleReviewSubmitted = (e) => {
            const venueId = e?.detail?.venueId;
            if (!venueId) return;
            fetch('/api/poker/reviews?stats_only=true&venue_ids=' + venueId)
                .then(r => r.json())
                .then(j => { if (j.success && j.stats) setPnmReviewStatsMap(prev => ({ ...prev, ...j.stats })); })
                .catch(e => { console.warn('[App] Handled promise rejection:', e?.message || e); });
        };
        window.addEventListener('pnm:review-submitted', handleReviewSubmitted);
        return () => window.removeEventListener('pnm:review-submitted', handleReviewSubmitted);
    }, []);



    // Review panel state (Feature #9)
    const [reviewVenue, setReviewVenue] = useState(null);

    // Pin-to-card highlight state
    const [highlightedVenueId, setHighlightedVenueId] = useState(null);
    const highlightTimeoutRef = useRef(null);

    // Swipe gesture state
    const touchStartRef = useRef(null);
    const touchEndRef = useRef(null);
    const contentRef = useRef(null);

    // Pull-to-refresh state
    const [pullDistance, setPullDistance] = useState(0);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const pullStartRef = useRef(null);

    // City autocomplete state
    const [citySuggestions, setCitySuggestions] = useState([]);
    const [showCitySuggestions, setShowCitySuggestions] = useState(false);

    // Push notification state
    const [pushPermission, setPushPermission] = useState('default');

    // Fetch error state for retry UI
    const [fetchError, setFetchError] = useState(null);

    // Hamburger menu preferences
    const [preferences, setPreferences] = useState({
        geofenceAlerts: true,
        locationEnabled: true,
        showNewcomerFriendly: true
    });

    // Intro video state - ONLY show when navigated directly from World Hub card click
    // NOT when navigating via lobby pods (which add ?tab= params)
    const [showIntro, setShowIntro] = useState(() => {
        if (typeof window !== 'undefined') {
            // If there's a tab param in the URL, user came from lobby — never play intro
            const urlParams = new URLSearchParams(window.location.search);
            if (urlParams.get('tab')) {
                // Consume the flag so it doesn't stick around
                sessionStorage.removeItem('poker-near-me-from-hub');
                return false;
            }
            // Only play intro when user came from World Hub page (flag set by WorldHub.tsx)
            const fromHub = sessionStorage.getItem('poker-near-me-from-hub');
            if (fromHub === '1' && !sessionStorage.getItem('poker-near-me-intro-seen')) {
                // Consume the flag immediately so it doesn't replay on refresh
                sessionStorage.removeItem('poker-near-me-from-hub');
                return true;
            }
        }
        return false;
    });
    const introVideoRef = useRef(null);
    const cityDebounceRef = useRef(null);

    // ─── Tab-specific tutorial state ───
    const [tabTutorialsSeen, setTabTutorialsSeen] = useState(() => {
        if (typeof window !== 'undefined') {
            try {
                return JSON.parse(localStorage.getItem('pnm_tab_tutorials_seen') || '{}');
            } catch { return {}; }
        }
        return {};
    });
    const [showTabTutorial, setShowTabTutorial] = useState(false);
    const [currentTutorialTab, setCurrentTutorialTab] = useState(null);

    // Trigger tab tutorial on first visit to each tab
    // DISABLED: Tutorials should no longer auto-play per new standard.
    // They are now exclusively accessible via the Hamburger Menu.
    useEffect(() => {
        // Auto-play disabled
    }, []);

    const handleTutorialDismiss = useCallback(() => {
        setShowTabTutorial(false);
        if (currentTutorialTab) {
            const updated = { ...tabTutorialsSeen, [currentTutorialTab]: true };
            setTabTutorialsSeen(updated);
            try { localStorage.setItem('pnm_tab_tutorials_seen', JSON.stringify(updated)); } catch (e) { console.warn('[App] Handled exception:', e); }
        }
    }, [currentTutorialTab, tabTutorialsSeen]);

    const handleTutorialDontShow = useCallback(() => {
        setShowTabTutorial(false);
        // Mark ALL tabs as seen
        const allSeen = { venues: true, events: true, live: true, map: true, saved: true, more: true };
        setTabTutorialsSeen(allSeen);
        try { localStorage.setItem('pnm_tab_tutorials_seen', JSON.stringify(allSeen)); } catch (e) { console.warn('[App] Handled exception:', e); }
    }, []);

    const replayTutorial = useCallback(() => {
        if (PNM_TAB_TUTORIALS[activeTab]) {
            setCurrentTutorialTab(activeTab);
            setShowTabTutorial(true);
        }
        setMenuOpen(false);
    }, [activeTab]);

    const handleIntroEnd = useCallback(() => {
        sessionStorage.setItem('poker-near-me-intro-seen', 'true');
        setShowIntro(false);
    }, []);

    const handleIntroPlay = useCallback(() => {
        if (introVideoRef.current) {
            introVideoRef.current.muted = false;
        }
    }, []);

    const [filters, setFilters] = useState(() => {
        if (typeof window !== 'undefined') {
            try {
                const saved = localStorage.getItem('poker-near-me-search-filters');
                if (saved) {
                    const parsed = JSON.parse(saved);
                    // ENFORCE venueType=all so tour pins + all venues always show on map
                    // Also sanitize stale 'undefined' string values from the ?filter=undefined bug
                    const VALID_VT = new Set(['all', 'casino', 'card_room', 'poker_club', 'home_game', 'charity', 'tour_stop', 'poker_tour']);
                    parsed.venueType = VALID_VT.has(parsed.venueType) ? parsed.venueType : 'all';
                    // REMOVED gameType and stakes forced resets to allow user preference persistence.
                    // Sanitize old cached 'tournaments' value back to 'all'
                    if (['tournament', 'mtt', 'tournaments'].includes(String(parsed.gameType).toLowerCase())) {
                        parsed.gameType = 'all';
                    }
                    // Normalize stakes: 'any' means no filter — treat same as 'all'
                    // BUG FIX: 'any' was stored as default but !== 'all', causing the client-side
                    // stakes filter to fire with s.includes('any') → zero venues matched → blank page.
                    parsed.stakes = (parsed.stakes && !['any', 'all', 'undefined', 'null', ''].includes(String(parsed.stakes).toLowerCase()))
                        ? parsed.stakes
                        : 'all';
                    // To safeguard tour pins from being filtered out entirely, the map will ignore cash filters for pins.
                    // Keep the user's saved radius — do NOT override it to 50mi
                    // Default to 50mi only if no saved radius exists
                    if (!parsed.radius) parsed.radius = 50;
                    parsed.gameType = parsed.gameType || 'all';
                    // Write sanitized filters BACK to localStorage to prevent stale 'any' from persisting
                    try { localStorage.setItem('poker-near-me-search-filters', JSON.stringify(parsed)); } catch (e) { console.warn('[App] Handled exception:', e?.message || e); }
                    return { ...parsed };
                }
            } catch (e) { console.warn(e); }
        }
        return {
            radius: 50,
            venueType: 'all',
            gameType: 'all',
            stakes: 'all',
            hasNLH: false,
            hasPLO: false,
            hasMixed: false,
            tourType: 'all',
            seriesTimeframe: 90,
            seriesType: 'all',
            selectedDay: getCurrentDay(),
            minBuyin: '',
            maxBuyin: '',
            selectedState: 'all'
        };
    });

    // Global search mode: when true, GPS/city useEffect skips re-fetching so text search results persist
    // CRITICAL: Must be declared BEFORE allVenuesWithTours useMemo which references globalSearchModeRef.current
    const globalSearchModeRef = useRef(false);

    // ═══ MERGE TOUR STOPS INTO MAP VENUES — ONE pin per tour at current/next stop ═══
    // Mirrors the poker-tours page approach: find current or next-upcoming stop per tour,
    // resolve coordinates by matching venue name against allVenuesForMap (real venue DB),
    // then fall back to TOUR_CITY_COORDS, then tour.latitude/longitude.
    // Tour pins offset slightly from venue pins so both are visible simultaneously.
    // Fix (2026-04-14): code-splitting refactor dropped ALL upstream declarations
    // this hook depends on. Each needs a sensible default that makes the map
    // degrade gracefully (no crash during SSR, no visual regression from the
    // point before code-splitting happened — these inputs only affect dedup
    // and styling enhancements, none of the core rendering).
    const centerLat = userLocation?.lat ?? selectedCity?.latitude ?? null;
    const centerLng = userLocation?.lng ?? selectedCity?.longitude ?? null;
    const effRad = (filters && (filters.radius === 'any' || String(filters.radius).toLowerCase() === 'any')) ? 25000 : (filters && typeof filters.radius === 'number') ? filters.radius : 50;
    const consumedVenueNames = typeof Set !== 'undefined' ? new Set() : {};
    const consumedVenueStems = typeof Set !== 'undefined' ? new Set() : {};
    const charityBestIds = typeof Set !== 'undefined' ? new Set() : {};
    const tourPins = [];
    const filteredVenues = Array.isArray(allVenuesForMap) ? allVenuesForMap : [];
    const allVenuesWithTours = useTourMapStops({ tours, allVenuesForMap, userLocation, selectedCity, filters, globalSearchModeRef, hasSearched, centerLat, centerLng, effRad, consumedVenueNames, consumedVenueStems, charityBestIds, tourPins, filteredVenues });

    const filterSyncPrevStrRef = useRef(null);
    useEffect(() => {
        if (typeof window !== 'undefined') {
            const currentStr = JSON.stringify(filters);
            if (filterSyncPrevStrRef.current !== currentStr) {
                try {
                    localStorage.setItem('poker-near-me-search-filters', currentStr);
                } catch (e) {
                    if (e.name === 'QuotaExceededError') {
                        console.warn('[PNM] Storage quota exceeded, skipping filter persistence.');
                    }
                }
                window.dispatchEvent(new CustomEvent('poker-near-me-filters-sync', { detail: filters }));
                // Fulfill hard rule: Wire Real-Time pushes to the Global Event Bus 
                eventBus.emit('PNM_FILTERS_UPDATED', filters);
                filterSyncPrevStrRef.current = currentStr;
            }
        }
    }, [filters]);

    const filtersRef = useRef(filters);
    filtersRef.current = filters;
    useEffect(() => {
        const handleSync = (e) => {
            if (e && e.detail && typeof window !== 'undefined') {
                const currentStr = JSON.stringify(filtersRef.current);
                const newStr = JSON.stringify(e.detail);
                if (currentStr !== newStr) {
                    setFilters(e.detail);
                }
            }
        };
        const handleBusSync = (payload) => {
            if (payload && typeof window !== 'undefined') {
                const currentStr = JSON.stringify(filtersRef.current);
                const newStr = JSON.stringify(payload);
                if (currentStr !== newStr) {
                    setFilters(payload);
                }
            }
        };
        const handleStorage = (e) => {
            if (e.key === 'poker-near-me-search-filters' && e.newValue) {
                try {
                    const parsed = JSON.parse(e.newValue);
                    const currentStr = JSON.stringify(filtersRef.current);
                    if (currentStr !== e.newValue) {
                        setFilters(parsed);
                    }
                } catch (err) { console.warn('[App] Handled exception:', err?.message || err); }
            }
        };
        window.addEventListener('poker-near-me-filters-sync', handleSync);
        window.addEventListener('storage', handleStorage);
        const unsubFilters = eventBus?.on('PNM_FILTERS_UPDATED', handleBusSync);
        return () => {
            window.removeEventListener('poker-near-me-filters-sync', handleSync);
            window.removeEventListener('storage', handleStorage);
            if (unsubFilters) unsubFilters();
        };
    }, []);

    // --- Live games search-first ---
    const [liveGames, setLiveGames] = useState([]);
    const [liveLoading, setLiveLoading] = useState(false);
    const liveRefreshRef = useRef(null);
    const [liveSearchQuery, setLiveSearchQuery] = useState('');
    const [liveVenueList, setLiveVenueList] = useState([]);
    const [liveVenueSuggestions, setLiveVenueSuggestions] = useState([]);
    const [selectedLiveVenue, setSelectedLiveVenue] = useState(null);
    const [showLiveSuggestions, setShowLiveSuggestions] = useState(false);
    const liveSearchInputRef = useRef(null);
    const [favorites, setFavorites] = useState(() => {
        if (typeof window !== 'undefined') {
            try {
                const favs = JSON.parse(localStorage.getItem('sp-favorites') || '{}');
                try {
                    const seriesIds = JSON.parse(localStorage.getItem('followed-series') || '[]');
                    seriesIds.forEach(id => { favs['series-' + id] = true; });
                } catch (e) { console.warn('[App] Handled exception:', e); }
                return favs;
            } catch { return {}; }
        }
        return {};
    });
    const [displayCount, setDisplayCount] = useState({ venues: PAGE_SIZE, tours: PAGE_SIZE, series: PAGE_SIZE, daily: PAGE_SIZE_DAILY, live: PAGE_SIZE_LIVE });
    const [searchHistory, setSearchHistory] = useState(() => {
        if (typeof window !== 'undefined') {
            try {
                const raw = JSON.parse(localStorage.getItem('sp-search-history') || '[]');
                // Prune entries older than 30 days (if stored with timestamps)
                const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
                const now = Date.now();
                const pruned = raw.filter(entry => {
                    if (typeof entry === 'object' && entry.ts) return (now - entry.ts) < MAX_AGE_MS;
                    return true; // Legacy string entries are kept
                });
                if (pruned.length !== raw.length) {
                    localStorage.setItem('sp-search-history', JSON.stringify(pruned));
                }
                return pruned;
            } catch { return []; }
        }
        return [];
    });
    const [showSearchHistory, setShowSearchHistory] = useState(false);
    const searchDebounceRef = useRef(null);
    const searchWrapperRef = useRef(null);
    const [promotionVenueIds, setPromotionVenueIds] = useState(new Set());

    // Map view filters (for enhanced map-first experience)
    const [mapFilters, setMapFilters] = useState(() => {
        if (typeof window !== 'undefined') {
            try {
                const saved = localStorage.getItem('poker-near-me-map-filters');
                if (saved) return JSON.parse(saved);
            } catch (e) { console.warn(e); }
        }
        return {
            cashGames: false,
            tournaments: false,
            is24Hours: false,
            lowStakes: false,
            topRated: false
        };
    });

    useEffect(() => {
        if (typeof window !== 'undefined') {
            safeSetItem('poker-near-me-map-filters', JSON.stringify(mapFilters));
            window.dispatchEvent(new CustomEvent('poker-near-me-map-filters-sync', { detail: mapFilters }));
        }
    }, [mapFilters]);

    const mapFiltersRef = useRef(mapFilters);
    mapFiltersRef.current = mapFilters;
    useEffect(() => {
        const handleSync = (e) => {
            if (e.detail && typeof window !== 'undefined') {
                const currentStr = JSON.stringify(mapFiltersRef.current);
                const newStr = JSON.stringify(e.detail);
                if (currentStr !== newStr) {
                    setMapFilters(e.detail);
                }
            }
        };
        window.addEventListener('poker-near-me-map-filters-sync', handleSync);
        return () => window.removeEventListener('poker-near-me-map-filters-sync', handleSync);
    }, []);

    // Selected room for detail panel
    const [selectedRoom, setSelectedRoom] = useState(null);

    // ═══ MAP CENTER — Compute center for map zoom (GPS or city venue centroid) ═══
    const mapCenter = useMemo(() => {
        // Priority 1: GPS location
        if (userLocation) return userLocation;
        // Priority 2: Centroid of returned venues (city search)
        if (selectedCity && venues.length > 0) {
            const withCoords = venues.filter(v => v.latitude && v.longitude);
            if (withCoords.length > 0) {
                const sumLat = withCoords.reduce((s, v) => s + v.latitude, 0);
                const sumLng = withCoords.reduce((s, v) => s + v.longitude, 0);
                return { lat: sumLat / withCoords.length, lng: sumLng / withCoords.length };
            }
        }
        return null;
    }, [userLocation, selectedCity, venues]);

    // ═══ AUTO-REFETCH on radius change — re-searches with new radius ═══
    const prevRadiusRef = useRef(filters.radius);
    useEffect(() => {
        if (prevRadiusRef.current === filters.radius) return;
        prevRadiusRef.current = filters.radius;
        // Only re-fetch if user has already searched (has location or city)
        if (userLocation || selectedCity || hasSearched) {
            setDisplayCount(prev => ({ ...prev, venues: PAGE_SIZE, tours: PAGE_SIZE, series: PAGE_SIZE, daily: PAGE_SIZE_DAILY }));
            fetchAllData({ includeVenues: true });
        }
    }, [filters.radius]); // eslint-disable-line react-hooks/exhaustive-deps

    // ═══ AUTO-REFETCH on venueType change — dropdown auto-submit (no button needed) ═══
    const prevVenueTypeRef = useRef(filters.venueType);
    useEffect(() => {
        if (prevVenueTypeRef.current === filters.venueType) return;
        prevVenueTypeRef.current = filters.venueType;
        // Re-fetch venues with new type filter whenever user has a location/city context
        // Use fetchVenuesRef.current to avoid temporal dead zone (fetchVenues declared later)
        if (userLocation || selectedCity || hasSearched) {
            setDisplayCount(prev => ({ ...prev, venues: PAGE_SIZE }));
            if (fetchVenuesRef.current) fetchVenuesRef.current();
        }
    }, [filters.venueType]); // eslint-disable-line react-hooks/exhaustive-deps

    // Load all venues for the map (from static JSON) on mount — with offline cache
    useEffect(() => {
        if (typeof window === 'undefined') return;
        const CACHE_KEY = 'sp-offline-venues';
        let hadCacheHit = false;

        const setGlobalVenues = (activeArr) => {
            setAllVenuesForMap(activeArr);
            const realPlayableVenues = activeArr.filter(v => !['series', 'tour'].includes(v.venue_type));
            if (realPlayableVenues.length > 0) {
                setDbStats(prev => {
                    if (prev.total === realPlayableVenues.length) return prev;
                    return { ...prev, total: realPlayableVenues.length };
                });
            }
        };

        // Try offline cache first
        try {
            const cached = localStorage.getItem(CACHE_KEY);
            if (cached) {
                const parsed = JSON.parse(cached);
                if (parsed.venues && parsed.time && (Date.now() - parsed.time) < 3600000) { // 1hr TTL
                    // Filter inactive venues — e.g. Ameristar East Chicago (no permanent cash games)
                    const activeFromCache = parsed.venues.filter(v => v.is_active !== false && v.id !== 3109);
                    setGlobalVenues(activeFromCache);
                    hadCacheHit = true;
                }
            }
        } catch (e) { console.warn('[App] Handled exception:', e?.message || e); }
        // [PNM1 FIX] Was ?v=Date.now() — busted Vercel edge cache on every page load.
        // [GAP 6.3 FIX] Changed to daily cache-buster to ensure daily updates aren't frozen indefinitely.
        const dailyBuster = new Date().toISOString().split('T')[0];
        fetch(`/data/all-venues.json?v=${dailyBuster}`)
            .then(function (r) { return r.json(); })
            .then(function (json) {
                var v = json.venues || json.data || json || [];
                var arr = Array.isArray(v) ? v : [];
                // CRITICAL: Exclude inactive venues (is_active:false) from the map — these are venues
                // that no longer operate permanent cash games (e.g. Ameristar East Chicago, which only
                // activates during MSPT tour stops). Also exclude Grand Victoria duplicate (ID 3109).
                var activeArr = arr.filter(function(venue) { return venue.is_active !== false && venue.id !== 3109; });
                setGlobalVenues(activeArr);
                // Cache for offline use (cache the filtered list)
                try {
                    localStorage.setItem(CACHE_KEY, JSON.stringify({ venues: activeArr, time: Date.now() }));
                } catch (e) { console.warn('[App] Handled exception:', e?.message || e); }

                // ─── [HOME-GAMES MERGE] ──────────────────────────────
                // Pull home games from the discover API and append them
                // to the venue list so they appear on the PNM map (as
                // gold dots with their venue logo inside) and in the
                // card grid alongside casinos / poker clubs / charity.
                // This is a separate fetch because home games live in
                // commander_home_groups, not in the static /data/all-
                // venues.json snapshot used for scraped venues.
                fetchHomeGamesAsVenues().then(function (hgs) {
                    if (hgs && hgs.length > 0) {
                        setGlobalVenues(activeArr.concat(hgs));
                    }
                }).catch(function () { /* non-fatal */ });
            })
            .catch(function () {
                // Only show error if we have no cached data at all
                if (!hadCacheHit) {
                    setFetchError('Unable to load venue data. Check your connection.');
                }
            });
    }, []);

    const fetchLiveCount = useCallback(async () => {
        try {
            // FIXED: was cachedFetch — could return 60s-stale data when called via DATA_MUTATED.
            // Live counts displayed in the map header badge should always be fresh.
            const res = await fetch('/api/poker/live-tables');
            if (!res.ok) return;
            const json = await res.json();
            if (json && json.metadata) {
                if (typeof json.metadata.total_tables_running === 'number') {
                    // POLICY: Never decrease live count to 0.
                    // If API returns 0 (scraper down), keep the last known count.
                    setLiveTableCount(prev => {
                        if (json.metadata.total_tables_running > 0) return json.metadata.total_tables_running;
                        return prev > 0 ? prev : 0; // keep previous if new is 0
                    });
                }
                if (typeof json.metadata.venues_with_live_data === 'number') {
                    setLiveVenueCount(prev => {
                        if (json.metadata.venues_with_live_data > 0) return json.metadata.venues_with_live_data;
                        return prev > 0 ? prev : 0;
                    });
                }
            }
        } catch (e) { console.warn('[App] Handled exception:', e?.message || e); }
    }, []);

    // Fetch live table count for map stats header
    useEffect(() => {
        fetchLiveCount();
    }, [fetchLiveCount]);

    // ─── Initial data load on mount ───
    // ALWAYS include venues so the page is never blank regardless of GPS state.
    // If GPS restores a location, the useEffect below re-fetches with lat/lng/radius.
    useEffect(() => {
        fetchAllData({ includeVenues: true });
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // When city or GPS location is set, re-fetch venues with proximity filter
    // GUARD: skip if globalSearchModeRef is active — user did a text search, don't overwrite results
    useEffect(() => {
        if ((selectedCity || userLocation) && !globalSearchModeRef.current) {
            setHasSearched(true);
            fetchVenues();
        }
    }, [selectedCity, userLocation]); // eslint-disable-line react-hooks/exhaustive-deps

    // Auto-request GPS on mount — restore saved location first for instant display
    const gpsAutoRequestedRef = useRef(false);
    useEffect(() => {
        if (gpsAutoRequestedRef.current) return;
        
        // Safety check: if deep-linking a search query, DO NOT load GPS as it overwrites searchQuery state
        if (typeof window !== 'undefined' && window.location.search.includes('q=')) {
            gpsAutoRequestedRef.current = true;
            return;
        }
        
        gpsAutoRequestedRef.current = true;

        // Restore saved GPS location from localStorage for instant venue display
        // Check BOTH keys: sp-user-gps (main page) AND pnm_last_location (lobby page)
        let hasSavedLocation = false;
        let hasSavedCity = false;
        try {
            const saved = localStorage.getItem('sp-user-gps');
            if (saved) {
                const parsed = JSON.parse(saved);
                // Use saved location if less than 24 hours old
                if (parsed.lat && parsed.lng && parsed.time && (Date.now() - parsed.time) < 86400000) {
                    setUserLocation({ lat: parsed.lat, lng: parsed.lng });
                    setGpsLocationLabel(parsed.label || `${parsed.lat.toFixed(3)}, ${parsed.lng.toFixed(3)}`);
                    setHasSearched(true);
                    hasSavedLocation = true;
                    // Persist last known state to gpsStateRef so fetchVenues always sends user_state
                    if (parsed.label) {
                        const parts = parsed.label.split(',');
                        const s = parts.length >= 2 ? parts[parts.length - 1].trim().toUpperCase() : '';
                        if (/^[A-Z]{2}$/.test(s)) gpsStateRef.current = s;
                    }
                }
            }
            // Fallback: check lobby page's GPS key if main page key is missing/expired
            if (!hasSavedLocation) {
                const lobbyLoc = localStorage.getItem('pnm_last_location');
                const lobbyEnabled = localStorage.getItem('pnm_location_enabled');
                if (lobbyLoc && lobbyEnabled === '1') {
                    const parsed = JSON.parse(lobbyLoc);
                    if (parsed.lat && parsed.lng) {
                        setUserLocation({ lat: parsed.lat, lng: parsed.lng });
                        const city = localStorage.getItem('pnm_last_city') || '';
                        const state = localStorage.getItem('pnm_last_state') || '';
                        setGpsLocationLabel(city && state ? `${city}, ${state}` : `${parsed.lat.toFixed(3)}, ${parsed.lng.toFixed(3)}`);
                        setHasSearched(true);
                        hasSavedLocation = true;
                        // Set gpsStateRef so fetchVenues always has user_state even before geocoding
                        if (state && /^[A-Z]{2}$/i.test(state)) gpsStateRef.current = state.toUpperCase();
                        // Migrate to sp-user-gps for future consistency
                        safeSetItem('sp-user-gps', JSON.stringify({
                            lat: parsed.lat, lng: parsed.lng,
                            time: Date.now(),
                            label: city && state ? `${city}, ${state}` : null
                        }));
                        window.dispatchEvent(new Event('sp_user_gps_updated'));
                    }
                }
            }
            // Fallback 3: check for a previously-selected city (user chose from city list)
            if (!hasSavedLocation) {
                const savedCity = localStorage.getItem('pnm_last_selected_city');
                if (savedCity) {
                    try {
                        const city = JSON.parse(savedCity);
                        if (city && city.name) {
                            setSelectedCity(city);
                            setSearchQuery(city.name + (city.state ? ', ' + city.state : ''));
                            setHasSearched(true);
                            hasSavedLocation = true; // skip GPS auto-request
                            hasSavedCity = true; // city-based — do NOT request GPS
                        }
                    } catch (e) { console.warn('[App] Handled exception:', e?.message || e); }
                }
            }
        } catch (e) { console.warn('[App] Handled exception:', e?.message || e); }

        // Request fresh GPS — silent refresh if we already have saved GPS location
        // SKIP entirely if a saved city was restored (user chose a city, not GPS)
        if (!hasSavedCity && typeof navigator !== 'undefined' && navigator.geolocation) {
            setTimeout(() => {
                if (hasSavedLocation) {
                    // Silent refresh — don't show alerts, just update if GPS is available
                    navigator.geolocation.getCurrentPosition(
                        (pos) => handleGpsSuccess(pos, true),
                        () => { /* silent fail — saved location is still active */ },
                        { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 }
                    );
                } else {
                    requestGpsLocation();
                }
            }, hasSavedLocation ? 2000 : 600);
        }
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // GPS fallback — if GPS loading finishes without a location, show all venues
    const gpsFallbackRef = useRef(false);
    useEffect(() => {
        // Only trigger once: when gpsLoading transitions true→false without a location
        if (gpsFallbackRef.current && !gpsLoading && !userLocation && !selectedCity) {
            // [GAP 2.2] Removed fetchVenues() when no location to avoid 750-venue payload
        }
        if (gpsLoading) gpsFallbackRef.current = true;
    }, [gpsLoading]); // eslint-disable-line react-hooks/exhaustive-deps

    // Close search history on outside click
    useEffect(() => {
        if (!showSearchHistory) return;
        const handleClickOutside = (e) => {
            if (searchWrapperRef.current && !searchWrapperRef.current.contains(e.target)) {
                setShowSearchHistory(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        document.addEventListener('touchstart', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            document.removeEventListener('touchstart', handleClickOutside);
        };
    }, [showSearchHistory]);

    // ---------- Geofence monitoring ----------
    const [geofenceStatus, setGeofenceStatus] = useState(null); // 'active' | 'denied' | 'error'
    const gfModulesRef = useRef(null); // Cache dynamic imports to avoid re-importing

    useEffect(() => {
        if (typeof window === 'undefined') return;
        if (!userLocation) return;
        if (allVenuesForMap.length === 0) return;

        // If geofence service already exists, just update the venue list
        if (geofenceRef.current && gfModulesRef.current) {
            const { pushMod } = gfModulesRef.current;
            geofenceRef.current.stop();
            geofenceRef.current.start(allVenuesForMap, function (venue) {
                if (pushMod) pushMod.showVenueAlert(venue, 'checkin');
                setGeofenceAlert(venue);
                fetch('/api/venues/record-geofence', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ venue_id: venue.id, venue_name: venue.name })
                }).catch(console.warn);
            });
            return;
        }

        // First initialization — dynamic import (SSR safe)
        import('../../../src/lib/geofence').then(function (mod) {
            var GeofenceService = mod.default;
            var gfService = new GeofenceService();

            import('../../../src/lib/pushAlerts').then(function (pushMod) {
                gfModulesRef.current = { pushMod };
                pushMod.requestPermission().then(function (permission) {
                    if (permission === 'denied') {
                        setGeofenceStatus('denied');
                    }
                }).catch(function () {
                    setGeofenceStatus('denied');
                });

                gfService.start(allVenuesForMap, function (venue) {
                    pushMod.showVenueAlert(venue, 'checkin');
                    setGeofenceAlert(venue);
                    
                    fetch('/api/venues/record-geofence', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ venue_id: venue.id, venue_name: venue.name })
                    }).catch(console.warn);
                });

                setGeofenceStatus('active');
            }).catch(function () {
                gfModulesRef.current = { pushMod: null };
                gfService.start(allVenuesForMap, function (venue) {
                    setGeofenceAlert(venue);
                    fetch('/api/venues/record-geofence', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ venue_id: venue.id, venue_name: venue.name })
                    }).catch(console.warn);
                });
                setGeofenceStatus('active');
            });

            geofenceRef.current = gfService;
        }).catch(function (err) {
            setGeofenceStatus('error');
        });

        return function () {
            if (geofenceRef.current) {
                geofenceRef.current.stop();
            }
        };
    }, [userLocation, allVenuesForMap]);

    useEffect(() => {
        if (router.isReady && router.query.q) {
            setShowGlobalSearch(true);
        }
    }, [router.isReady, router.query.q]);

    // --- Merge real-time venue updates and social pages into map feed ---
    useEffect(() => {
        if (!venues || venues.length === 0) return;
        
        // Extract social pages
        const socialWithCoords = venues.filter(v =>
            v.is_social_page && v.latitude && v.longitude
        );

        // Build a map of updated standard venues from the live fetch
        const liveUpdates = {};
        venues.forEach(v => {
            if (!v.is_social_page && v.id) {
                liveUpdates[String(v.id)] = v;
            }
        });

        setAllVenuesForMap(prev => {
            // 1. Remove previously merged social pages
            const withoutSocial = prev.filter(v => !String(v.id).startsWith('sp-'));
            
            // 2. Overwrite standard venues with fresh live data (to sync has_tournaments, etc)
            const syncedStandard = withoutSocial.map(v => {
                const fresh = liveUpdates[String(v.id)];
                return fresh ? { ...v, ...fresh } : v;
            });

            // 3. Append fresh social pages
            return [...syncedStandard, ...socialWithCoords];
        });
    }, [venues]);

    // --- NEW: Persist favorites to localStorage + bus sync ---
    const lastSavedFavoritesRef = useRef('');
    
    useEffect(() => {
        if (typeof window !== 'undefined') {
            const spFavs = {};
            const seriesFavs = [];
            Object.keys(favorites || {}).forEach(k => {
                if (k.startsWith('venue-') && favorites[k]) spFavs[k] = favorites[k];
                if (k.startsWith('series-') && favorites[k]) seriesFavs.push(k.split('-')[1]);
            });
            const newFavoritesState = JSON.stringify({ spFavs, seriesFavs });
            if (lastSavedFavoritesRef.current !== newFavoritesState) {
                lastSavedFavoritesRef.current = newFavoritesState;
                safeSetItem('sp-favorites', JSON.stringify(spFavs));
                safeSetItem('followed-series', JSON.stringify(seriesFavs));
            }
        }
    }, [favorites]);

    // Listen for favorites changes from other tabs via native 'storage' event
    const favoritesRef = useRef(favorites);
    favoritesRef.current = favorites;
    useEffect(() => {
        const handleStorageSync = (e) => {
            if (e.key === 'sp-favorites' && e.newValue) {
                try {
                    const newFavs = JSON.parse(e.newValue);
                    setFavorites(prev => {
                        const next = { ...prev };
                        let changed = false;
                        const newFavIds = Object.keys(newFavs || {});
                        Object.keys(next || {}).forEach(k => {
                            if (k.startsWith('venue-') && !newFavIds.includes(k)) { delete next[k]; changed = true; }
                        });
                        newFavIds.forEach(k => {
                            if (!next[k]) { next[k] = newFavs[k]; changed = true; }
                        });
                        return changed ? next : prev;
                    });
                } catch (e) { console.warn('[App] Handled exception:', e); }
            }
            if (e.key === 'followed-series' && e.newValue) {
                try {
                    const rawSeriesIds = JSON.parse(e.newValue);
                    setFavorites(prev => {
                        const next = { ...prev };
                        let changed = false;
                        Object.keys(next || {}).forEach(k => {
                            if (k.startsWith('series-') && !rawSeriesIds.includes(k.split('-')[1])) { delete next[k]; changed = true; }
                        });
                        rawSeriesIds.forEach(id => {
                            if (!next[`series-${id}`]) { next[`series-${id}`] = true; changed = true; }
                        });
                        return changed ? next : prev;
                    });
                } catch (e) { console.warn('[App] Handled exception:', e); }
            }
        };
        window.addEventListener('storage', handleStorageSync);

        // Map global EventBus events to our local state (Intra-tab SPA sync)
        const handleBusFavSync = (event) => {
            const data = event.payload;
            if (data && data.venueId) {
                setFavorites(prev => {
                    const next = { ...prev };
                    next['venue-' + data.venueId] = Date.now();
                    return next;
                });
            }
        };
        const handleBusUnfavSync = (event) => {
            const data = event.payload;
            if (data && data.venueId) {
                setFavorites(prev => {
                    const next = { ...prev };
                    delete next['venue-' + data.venueId];
                    return next;
                });
            }
        };

        // [GAP 4.3 FIX] Debounce DATA_MUTATED to prevent redundant fetches from rapid-fire events
        // FIXED: mutateDebounce was a local let — not cleared on unmount. Timer would fire
        // fetchVenuesRef/fetchLiveCount AFTER unmount → setState on unmounted component.
        // FIXED: live_tables entity was triggering fetchVenuesRef (full DB re-fetch of poker_venues)
        // on every scraper cycle. live_tables mutations should only refresh live counts, not venues.
        let mutateDebounce = null;
        const handleBusDataMutated = (event) => {
            const { entity } = event.payload || {};
            if (entity === 'live_tables') {
                // Live data changed — only refresh live counts, NOT the full venue list
                if (mutateDebounce) clearTimeout(mutateDebounce);
                mutateDebounce = setTimeout(() => {
                    if (typeof fetchLiveCount === 'function') fetchLiveCount();
                }, 1000);
            } else if (entity === 'venues') {
                // Venue metadata changed — refresh venue list + live counts
                if (mutateDebounce) clearTimeout(mutateDebounce);
                mutateDebounce = setTimeout(() => {
                    if (fetchVenuesRef.current) fetchVenuesRef.current({ silent: true });
                    if (typeof fetchLiveCount === 'function') fetchLiveCount();
                }, 1000);
            }
        };

        const handleBusCheckinCreated = (event) => {
            const data = event.payload;
            if (data && data.venueId) {
                setCheckinCounts(prev => ({
                    ...prev,
                    [String(data.venueId)]: (prev[String(data.venueId)] || 0) + 1
                }));
            }
        };

        let unsubFav, unsubUnfav, unsubMutate, unsubCheckin;
        if (bus && bus.on) {
            unsubFav = bus.on(EventType.VENUE_SAVED, handleBusFavSync);
            unsubUnfav = bus.on(EventType.VENUE_UNSAVED, handleBusUnfavSync);
            unsubMutate = bus.on(EventType.DATA_MUTATED, handleBusDataMutated);
            unsubCheckin = bus.on(EventType.VENUE_CHECKIN_CREATED, handleBusCheckinCreated);
        }

        return () => {
            window.removeEventListener('storage', handleStorageSync);
            if (mutateDebounce) clearTimeout(mutateDebounce); // FIXED: prevent post-unmount setState
            if (unsubFav) unsubFav();
            if (unsubUnfav) unsubUnfav();
            if (unsubMutate) unsubMutate();
            if (unsubCheckin) unsubCheckin();
        };
    }, []);

    // --- NEW: Fetch promotion venue IDs on mount ---
    useEffect(() => {
        fetch('/api/poker/promotions?limit=200')
            .then(r => r.json())
            .then(json => {
                const ids = new Set();
                (json.promotions || json.data || []).forEach(p => { if (p.page_id) ids.add(String(p.page_id)); });
                setPromotionVenueIds(ids);
            })
            .catch(e => console.warn('[App] Handled promise rejection:', e?.message || e));
    }, []);

    // --- Auto-refresh live games when venue is selected ---
    // NOTE: This only refreshes live table data for the selected venue, NOT the entire page.
    const lastLiveFetchRef = useRef(0);
    useEffect(() => {
        if (showLiveTab) {
            // Pre-fetch venue list for search autocomplete (refresh if older than 5 mins — GAP 6.1)
            if (liveVenueList.length === 0 || (Date.now() - lastLiveFetchRef.current > 300000)) {
                fetchLiveVenueList();
                lastLiveFetchRef.current = Date.now();
            }
            // Only auto-refresh if a venue is selected
            if (selectedLiveVenue) {
                fetchLiveGames(selectedLiveVenue.slug);
                liveRefreshRef.current = setInterval(() => fetchLiveGames(selectedLiveVenue.slug), LIVE_REFRESH_MS);
            }
        }
        return () => { if (liveRefreshRef.current) clearInterval(liveRefreshRef.current); };
    }, [showLiveTab, selectedLiveVenue]); // eslint-disable-line react-hooks/exhaustive-deps

    // --- NEW: Helper functions ---
    const toggleFavorite = useCallback(async (type, id, e, itemData = {}) => {
        if (e) { e.stopPropagation(); e.preventDefault(); }
        if (!id) return;
        const key = type + '-' + id;
        const isCurrentlyFavorited = favorites[key];

        // Update local state immediately
        // Synchronous optimistic update
        setFavorites(prev => {
            const next = { ...prev };
            if (next[key]) { delete next[key]; } else { next[key] = Date.now(); }
            return next;
        });

        // Sync venue favorites to Supabase
        if (type === 'venue' && userId) {
            try {
                if (isCurrentlyFavorited) {
                    await removeVenueFavorite(userId, id);
                    busEmit.venueUnsaved(id);
                } else {
                    await addVenueFavorite(userId, id, {
                        name: itemData.name,
                        address: itemData.address,
                        city: itemData.city,
                        state: itemData.state
                    });
                    busEmit.venueSaved(id, itemData.name);
                }
            } catch (err) {
                console.warn('Error syncing favorite:', err);
                // Rollback on failure
                setFavorites(prev => {
                    const next = { ...prev };
                    if (isCurrentlyFavorited) { next[key] = Date.now(); } else { delete next[key]; }
                    return next;
                });
            }
        }
    }, [favorites, userId]);

    const isFavorited = (type, id) => !!favorites[type + '-' + id];

    const addToSearchHistory = (query) => {
        if (!query || !query.trim()) return;
        const trimmed = query.trim();
        setSearchHistory(prev => {
            const filtered = prev.filter(s => s !== trimmed);
            const next = [trimmed, ...filtered].slice(0, SEARCH_HISTORY_MAX);
            safeSetItem('sp-search-history', JSON.stringify(next));
            return next;
        });
        // Async sync to Supabase if logged in
        if (userId) {
            addSearchHistoryToDb(userId, query.trim(), {
                location: selectedCity ? selectedCity.name : null,
                filters: filters
            }).catch(e => { console.warn('[App] Handled promise rejection:', e?.message || e); });
        }
    };

    const getSortedVenues = (venueList) => {
        // When GPS is active and sort is 'default', auto-sort by distance
        const effectiveSort = (sortBy === 'default' && userLocation) ? 'distance' : sortBy;
        // Default sort: casinos first, then card rooms, then by trust score descending
        if (effectiveSort === 'default') {
            const VENUE_PRIORITY = { casino: 0, card_room: 1, poker_club: 1, home_game: 2, charity: 3 };
            return [...venueList].sort((a, b) => {
                const typeDiff = (VENUE_PRIORITY[a.venue_type] ?? 5) - (VENUE_PRIORITY[b.venue_type] ?? 5);
                if (typeDiff !== 0) return typeDiff;
                return (b.trust_score || 0) - (a.trust_score || 0);
            });
        }
        const sorted = [...venueList];
        const VENUE_TYPE_ORDER = { casino: 0, card_room: 1, poker_club: 1, charity: 2, home_game: 3 };
        switch (effectiveSort) {
            case 'trust-desc': return sorted.sort((a, b) => (b.trust_score || 0) - (a.trust_score || 0));
            case 'trust-asc': return sorted.sort((a, b) => (a.trust_score || 0) - (b.trust_score || 0));
            case 'distance': return sorted.sort((a, b) => (a.distance_mi || 9999) - (b.distance_mi || 9999));
            case 'name-az': return sorted.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
            case 'name-za': return sorted.sort((a, b) => (b.name || '').localeCompare(a.name || ''));
            case 'venue-type': return sorted.sort((a, b) => (VENUE_TYPE_ORDER[a.venue_type] ?? 99) - (VENUE_TYPE_ORDER[b.venue_type] ?? 99));
            case 'state-az': return sorted.sort((a, b) => (a.state || '').localeCompare(b.state || ''));
            case 'most-tables': return sorted.sort((a, b) => (b.poker_tables || 0) - (a.poker_tables || 0));
            case 'most-games': return sorted.sort((a, b) => ((b.games_offered || []).length) - ((a.games_offered || []).length));
            case 'city-az': return sorted.sort((a, b) => (a.city || '').localeCompare(b.city || ''));
            default: return sorted;
        }
    };

    const loadMore = (tab) => {
        if (tab === 'venues') {
            // If there are still un-rendered venues, just show more
            if (displayCount.venues < venues.length) {
                setDisplayCount(prev => ({ ...prev, venues: prev.venues + PAGE_SIZE }));
            } else if (userLocation) {
                // All current results shown — expand radius to next tier and re-fetch
                const currentRadius = Number(filters.radius) || 50;
                const nextTier = RADIUS_TIERS.find(r => r > currentRadius);
                if (nextTier) {
                    // Update radius in state, then trigger a re-fetch
                    setFilters(prev => {
                        const updated = { ...prev, radius: nextTier };
                        // Persist to localStorage immediately
                        try { localStorage.setItem('poker-near-me-search-filters', JSON.stringify(updated)); } catch (e) { console.warn('[App] Handled exception:', e?.message || e); }
                        return updated;
                    });
                    // Reset display count for fresh batch
                    setDisplayCount(prev => ({ ...prev, venues: PAGE_SIZE }));
                    // Schedule fetch with explicit radius override (avoids stale closure)
                    setTimeout(() => fetchVenues({ radiusOverride: nextTier }), 50);
                }
            }
        } else {
            setDisplayCount(prev => ({ ...prev, [tab]: prev[tab] + PAGE_SIZE }));
        }
    };

    // Pin→Card sync: scroll to and highlight venue card when map pin is clicked
    const onMapVenueClick = useCallback((venue) => {
        if (!venue || !venue.id) return;
        // Close fullscreen map if it's open so the card is visible
        setMapFullscreen(false);
        // Ensure we're on the Venues tab so cards are visible
        if (activeTab !== 'venues') setActiveTab('venues');
        
        // Try to find the card immediately
        const tryScroll = () => {
            const cardEl = document.getElementById('venue-card-' + venue.id);
            if (cardEl) {
                cardEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
                setHighlightedVenueId(venue.id);
                if (highlightTimeoutRef.current) clearTimeout(highlightTimeoutRef.current);
                highlightTimeoutRef.current = setTimeout(() => setHighlightedVenueId(null), 3000);
                return true;
            }
            return false;
        };
        
        if (!tryScroll()) {
            // Card not in DOM yet — expand display count to show all venues, then retry
            setDisplayCount(prev => ({ ...prev, venues: Math.max(prev.venues, venues.length) }));
            // Wait for React to re-render with expanded list
            setTimeout(() => tryScroll(), 150);
        }
    }, [activeTab, venues.length]);

    const openVenueModal = useCallback((path) => {
        if (!path) return;
        if (path.includes('/hub/venues/')) {
            setIframeModal({
                isOpen: true,
                url: path,
                title: 'Venue Details'
            });
        } else {
            router.push(path);
        }
    }, [router]);



    // Reverse geocode lat/lng to city, state using OpenStreetMap Nominatim (free, no API key)
    // [GAP 2.3 FIX] Rate limit to 1 request/second to comply with Nominatim usage policy
    const lastGeocodeTime = useRef(0);
    const reverseGeocode = useCallback(async (lat, lng) => {
        try {
            const now = Date.now();
            const timeSinceLast = now - lastGeocodeTime.current;
            if (timeSinceLast < 1100) {
                await new Promise(r => setTimeout(r, 1100 - timeSinceLast));
            }
            lastGeocodeTime.current = Date.now();
            const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&addressdetails=1&zoom=12`;
            const resp = await fetch(url, { headers: { 'Accept-Language': 'en-US,en' } });
            if (!resp.ok) return null;
            const data = await resp.json();
            const addr = data.address || {};
            const city = addr.city || addr.town || addr.village || addr.hamlet || addr.county || '';
            const state = addr.state || '';
            // Abbreviate US state names
            const STATE_ABBREVS = { Alabama:'AL',Alaska:'AK',Arizona:'AZ',Arkansas:'AR',California:'CA',Colorado:'CO',Connecticut:'CT',Delaware:'DE',Florida:'FL',Georgia:'GA',Hawaii:'HI',Idaho:'ID',Illinois:'IL',Indiana:'IN',Iowa:'IA',Kansas:'KS',Kentucky:'KY',Louisiana:'LA',Maine:'ME',Maryland:'MD',Massachusetts:'MA',Michigan:'MI',Minnesota:'MN',Mississippi:'MS',Missouri:'MO',Montana:'MT',Nebraska:'NE',Nevada:'NV','New Hampshire':'NH','New Jersey':'NJ','New Mexico':'NM','New York':'NY','North Carolina':'NC','North Dakota':'ND',Ohio:'OH',Oklahoma:'OK',Oregon:'OR',Pennsylvania:'PA','Rhode Island':'RI','South Carolina':'SC','South Dakota':'SD',Tennessee:'TN',Texas:'TX',Utah:'UT',Vermont:'VT',Virginia:'VA',Washington:'WA','West Virginia':'WV',Wisconsin:'WI',Wyoming:'WY','District of Columbia':'DC' };
            const stateAbbrev = STATE_ABBREVS[state] || state;
            if (city && stateAbbrev) return `${city}, ${stateAbbrev}`;
            if (city) return city;
            if (stateAbbrev) return stateAbbrev;
            return null;
        } catch (e) {
            console.warn('Reverse geocode failed:', e);
            return null;
        }
    }, []);

    const handleGpsSuccess = useCallback((pos, keepSearch = false) => {
        if (!keepSearch) {
            setSearchQuery('');
        }
        setSelectedCity(null);
        const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setUserLocation(loc);
        // Show coordinates immediately while geocoding resolves
        setGpsLocationLabel(`${loc.lat.toFixed(3)}, ${loc.lng.toFixed(3)}`);
        setHasSearched(true);
        setDisplayCount({ venues: PAGE_SIZE, tours: PAGE_SIZE, series: PAGE_SIZE, daily: PAGE_SIZE_DAILY, live: PAGE_SIZE_LIVE });
        setGpsLoading(false);
        // Save GPS to localStorage for instant restore on next visit
        // Write to BOTH keys: sp-user-gps (main page) + pnm_last_location (lobby page)
        try {
            localStorage.setItem('sp-user-gps', JSON.stringify({ lat: loc.lat, lng: loc.lng, time: Date.now() }));
            localStorage.setItem('pnm_last_location', JSON.stringify(loc));
            localStorage.setItem('pnm_location_enabled', '1');
            window.dispatchEvent(new Event('sp_user_gps_updated'));
            // GPS takes priority — clear any saved city selection
            localStorage.removeItem('pnm_last_selected_city');
        } catch (e) { console.warn('[App] Handled exception:', e?.message || e); }
        // Re-fetch location-dependent data (daily tournaments, tours); venues handled by userLocation useEffect
        setTimeout(() => { fetchAllData({ includeVenues: false, overrideLocation: loc }); }, 0);
        // Resolve city/state asynchronously and persist label
        reverseGeocode(loc.lat, loc.lng).then(label => {
            if (label) {
                setGpsLocationLabel(label);
                // Update gpsStateRef with confirmed state so future fetchVenues always have user_state
                const labelParts = label.split(', ');
                const stateCode = labelParts.length >= 2 ? labelParts[labelParts.length - 1].trim().toUpperCase() : '';
                if (/^[A-Z]{2}$/.test(stateCode)) gpsStateRef.current = stateCode;
                // Update saved GPS with human-readable label + lobby page keys
                try {
                    const saved = JSON.parse(localStorage.getItem('sp-user-gps') || '{}');
                    saved.label = label;
                    localStorage.setItem('sp-user-gps', JSON.stringify(saved));
                    window.dispatchEvent(new Event('sp_user_gps_updated'));
                    // Also write lobby-compatible keys for cross-page sync
                    const parts = label.split(', ');
                    if (parts.length >= 2) {
                        localStorage.setItem('pnm_last_city', parts[0]);
                        localStorage.setItem('pnm_last_state', parts[parts.length - 1]);
                    }
                } catch (e) { console.warn('[App] Handled exception:', e?.message || e); }
                // Trigger a silent venue refetch now that we have the proper "City, ST" label.
                // The initial GPS-triggered fetch runs while label is still coordinates ("41.7, -87.7"),
                // which means user_state can't be extracted and the API returns 0 local venues.
                // This corrective refetch ensures venues appear once geocoding completes (~1-2s later).
                if (fetchVenuesRef.current) fetchVenuesRef.current({ silent: true });
            }
        });
    }, [reverseGeocode]); // eslint-disable-line react-hooks/exhaustive-deps

    const requestGpsLocation = () => {
        if (!navigator.geolocation) {
            setShowLocationModal(true);
            return;
        }
        setGpsLoading(true);
        setGpsLocationLabel('Locating...');
        // Tier 1: High accuracy (GPS/cellular)
        const gpsTimeoutId = setTimeout(() => {
            // Failsafe: if GPS hasn't responded in 20s, stop loading
            setGpsLoading(false);
            if (!userLocation) {
                setGpsLocationLabel(null);
            }
        }, 20000);
        navigator.geolocation.getCurrentPosition(
            (pos) => { clearTimeout(gpsTimeoutId); handleGpsSuccess(pos); },
            (highAccErr) => {
                if (highAccErr.code === 1) {
                    clearTimeout(gpsTimeoutId);
                    setShowLocationModal(true);
                    setGpsLoading(false);
                    setGpsLocationLabel(null);
                    return;
                }
                // Tier 2: Fallback to WiFi/IP-based (works on desktops)
                navigator.geolocation.getCurrentPosition(
                    (pos) => { clearTimeout(gpsTimeoutId); handleGpsSuccess(pos); },
                    () => {
                        clearTimeout(gpsTimeoutId);
                        setShowLocationModal(true);
                        setGpsLoading(false);
                        setGpsLocationLabel(null);
                    },
                    { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 }
                );
            },
            { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 }
        );
    };

    // Load preferences, venue favorites, and search history from Supabase on mount
    useEffect(() => {
        if (userId) {
            getPokerNearMePreferences(userId).then(setPreferences);

            // Load venue favorites from Supabase
            getVenueFavorites(userId).then(data => {
                const favMap = {};
                data.forEach(f => { favMap['venue-' + f.venue_id] = Date.now(); });
                setFavorites(prev => ({ ...prev, ...favMap }));
            }).catch(err => console.warn('Error loading venue favorites:', err));

            // Merge search history from Supabase with localStorage
            getSearchHistoryFromDb(userId, SEARCH_HISTORY_MAX).then(dbHistory => {
                if (dbHistory && dbHistory.length > 0) {
                    setSearchHistory(prev => {
                        const merged = [...new Set([...prev, ...dbHistory.map(h => h.search_query)])].slice(0, SEARCH_HISTORY_MAX);
                        localStorage.setItem('sp-search-history', JSON.stringify(merged));
                        return merged;
                    });
                }
            }).catch(e => { console.warn('[App] Handled promise rejection:', e?.message || e); });
        }
    }, [userId]);

    // Hamburger menu handlers - save to Supabase
    const updatePreference = useCallback(async (key, value) => {
        setPreferences(prev => ({ ...prev, [key]: value }));

        if (userId) {
            try {
                await updatePokerNearMePreferences(userId, { [key]: value });
            } catch (error) {
                console.warn('Failed to save preference:', error);
            }
        }
    }, [userId]);

    const menuConfig = getMenuConfig('poker-near-me', null, preferences, {
        setGeofenceAlerts: (val) => updatePreference('geofenceAlerts', val),
        setLocationEnabled: (val) => updatePreference('locationEnabled', val),
        setShowNewcomerFriendly: (val) => updatePreference('showNewcomerFriendly', val),
        replayTutorial,
        openGlobalSearch: () => { setMenuOpen(false); setTimeout(() => setShowGlobalSearch(true), 50); },
    });

    const fetchAllData = async ({ includeVenues = false, silent = false, overrideLocation = null } = {}) => {
        if (!silent) setLoading(true);
        const fetches = [fetchTours(overrideLocation), fetchSeries(), fetchDailyTournaments()];
        if (includeVenues) {
            fetches.push(fetchVenues({ silent }));
        }
        await Promise.allSettled(fetches); // allSettled: one failing fetch never blocks tours/series/venues
        if (!silent) setLoading(false);
    };

    const fetchVenues = async ({ silent = false, radiusOverride = null, searchOverride = null, globalSearch = false } = {}) => {
        if (!silent) setVenueLoading(true);
        setFetchError(null);
        try {
            // [PNM4 FIX] Was limit=1000 which exactly equals Supabase project-level max_rows cap.
            // Any query returning >1000 rows was silently truncated. Lowered to 500 which covers
            // ~99% of filtered queries; unfiltered queries are capped gracefully.
            const params = new URLSearchParams({ limit: '500' });

            // Use searchOverride when provided (avoids stale closure from React async state)
            const effectiveSearch = searchOverride !== null ? searchOverride : searchQuery;

            if (!globalSearch) {
                // Location-browse mode: send GPS/city/state/radius params
                if (selectedCity) {
                    params.set('city', selectedCity.name);
                    params.set('state', selectedCity.state);
                }
                if (userLocation) {
                    params.set('lat', userLocation.lat.toString());
                    params.set('lng', userLocation.lng.toString());
                    const effectiveRadius = radiusOverride || filters.radius;
                    const miRadius = (String(effectiveRadius).toLowerCase() === 'any') ? 5000 : (isNaN(Number(effectiveRadius)) ? 50 : Number(effectiveRadius));
                    params.set('radius', String(miRadius));
                    // Determine user_state for API (ensures IL venues don't get cut off by global top-500 limit).
                    // Priority: gpsStateRef (in-memory, never cleared) → gpsLocationLabel extraction → pnm_last_state localStorage
                    // gpsStateRef persists the last geocoded state even when gpsLocationLabel temporarily
                    // shows raw coordinates ("41.716, -87.742") while fresh GPS reverseGeocode is running.
                    let stateForApi = gpsStateRef.current || '';
                    if (!stateForApi) {
                        // Try label extraction: "Oak Lawn, IL" → "IL"
                        const labelParts = (gpsLocationLabel || '').split(',');
                        const stateFromLabel = labelParts.length >= 2 ? labelParts[labelParts.length - 1].trim().toUpperCase() : '';
                        if (stateFromLabel && /^[A-Z]{2}$/.test(stateFromLabel)) stateForApi = stateFromLabel;
                    }
                    if (!stateForApi) {
                        // Fallback: read from localStorage (set by lobby or GPS restore)
                        try {
                            const s = (localStorage.getItem('pnm_last_state') || '').trim().toUpperCase();
                            if (s.length === 2 && /^[A-Z]{2}$/.test(s)) stateForApi = s;
                        } catch (e) { console.warn('[App] Handled exception:', e?.message || e); }
                    }
                    if (stateForApi) params.set('user_state', stateForApi);
                }
                if (filters.venueType !== 'all') {
                    params.set('type', filters.venueType);
                }
                if (filters.selectedState && filters.selectedState !== 'all') {
                    params.set('state', filters.selectedState);
                }
                if (filters.hasNLH) params.set('hasNLH', 'true');
                if (filters.hasPLO) params.set('hasPLO', 'true');
                if (filters.hasMixed) params.set('hasMixed', 'true');
            }
            // Always send the search term (both modes)
            if (effectiveSearch) {
                params.set('search', effectiveSearch);
            }

            const url = '/api/poker/venues?' + params;
            const currentSeq = ++fetchSequenceRef.current;
            const json = await fetchWithRetry(url);
            
            // [HARDENING] Prevent Race Condition: discard if a newer fetch was initiated
            // IMPORTANT: must set venueLoading=false before returning so skeletons don't get stuck
            if (fetchSequenceRef.current !== currentSeq) {
                if (!silent) setVenueLoading(false);
                return;
            }
            
            const data = json.data;
            let filteredData = data || [];
            
            // Merge live data immediately to prevent extra renders
            filteredData = filteredData.map(venue => {
                const normName = (venue.name || '').toLowerCase()
                    .replace(/&/g, 'and').replace(/'/g, '').replace(/-/g, ' ')
                    .replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
                const liveEntry = (venue.bravo_slug && liveDataMapRef.current[venue.bravo_slug])
                    || liveDataMapRef.current[normName]
                    || null;
                if (liveEntry && (liveEntry.games || []).length > 0) {
                    return { ...venue, _liveMerged: true, live_data: liveEntry };
                }
                return { ...venue, _liveMerged: true };
            });

            setVenues(filteredData);

            // ─── [HOME-GAMES MERGE] ──────────────────────────────
            // Same logic as initial load, plus respect the active venue
            // type filter and radius filter. The /api/poker/venues call
            // never returns home games (it queries the scraped venues
            // table), so they'd be missing from filtered results unless
            // we merge them here.
            fetchHomeGamesAsVenues().then(function (hgs) {
                if (!hgs || hgs.length === 0) return;
                // Respect venue type filter
                if (filters.venueType && filters.venueType !== 'all' && filters.venueType !== 'home_game') {
                    return;
                }
                let merged = hgs;
                // Respect radius filter when user has a location
                if (userLocation && filters.radius && filters.radius !== 'Any') {
                    const radiusMi = Number(filters.radius);
                    if (!isNaN(radiusMi)) {
                        merged = merged.filter(function (hg) {
                            if (hg.latitude == null || hg.longitude == null) return false;
                            const d = _hgHaversineMi(userLocation.lat, userLocation.lng, hg.latitude, hg.longitude);
                            hg.distance_mi = d;
                            return d <= radiusMi;
                        });
                    }
                }
                // Optional state filter (if present in the page)
                if (filters.selectedState && filters.selectedState !== 'all') {
                    merged = merged.filter(function (hg) { return hg.state === filters.selectedState; });
                }
                if (merged.length > 0) {
                    setVenues(function (prev) { return prev.concat(merged); });
                }
            }).catch(function () { /* non-fatal */ });

            // Update stats from response (only update states, leave global total alone)
            if (json.total) {
                const stateSet = new Set(filteredData.map(v => v.state).filter(Boolean));
                setDbStats(prev => {
                    const newStates = stateSet.size || prev.states;
                    if (prev.states === newStates) return prev;
                    return { ...prev, states: newStates };
                });
            }
            if (filteredData.length > 0 && filteredData[0].distance_mi) {
                setNearestDistance(filteredData[0].distance_mi);
            }
        } catch (e) {
            if (!silent) setLoading(false);
            console.warn('Fetch venues error:', e);
            setFetchError('Failed to load venues. Tap to retry.');
            setVenues([]);
        }
        if (!silent) setVenueLoading(false);
    };

    const fetchTours = async (overrideLocation = null) => {
        try {
            const loc = overrideLocation || userLocation;
            const params = new URLSearchParams({ include_series: 'true', limit: '999' });
            // Guard against stale 'undefined' string values stored in localStorage breaking the API
            if (filters.tourType && filters.tourType !== 'all' && filters.tourType !== 'undefined') {
                params.set('type', filters.tourType);
            }
            if (searchQuery && searchQuery !== 'undefined') {
                params.set('search', searchQuery);
            }
            
            // Add location for distance-based sorting on the backend. Hardened against malformed loc objects.
            if (loc && typeof loc.lat !== 'undefined' && typeof loc.lng !== 'undefined') {
                params.set('lat', loc.lat.toString());
                params.set('lng', loc.lng.toString());
            } else if (selectedCity && selectedCity.latitude && selectedCity.longitude) {
                params.set('lat', selectedCity.latitude.toString());
                params.set('lng', selectedCity.longitude.toString());
            }

            const url = '/api/poker/tours?' + params;
            const currentSeq = ++fetchToursSeqRef.current;
            const json = await cachedFetch(url);
            
            if (fetchToursSeqRef.current !== currentSeq) return;
            
            setTours(json.data || []);
        } catch (e) {
            console.warn('Fetch tours error:', e);
            setTours([]);
        }
    };

    const fetchSeries = async () => {
        try {
            const params = new URLSearchParams({ upcoming: 'true', limit: '999' });

            const today = new Date();
            const endDate = new Date();
            // Guard: seriesTimeframe must be a valid positive number — fallback to 90 days
            const seriesTimeframeDays = Number(filters.seriesTimeframe);
            endDate.setDate(today.getDate() + (isNaN(seriesTimeframeDays) || seriesTimeframeDays <= 0 ? 90 : seriesTimeframeDays));
            params.set('end_date', endDate.toISOString().split('T')[0]);

            if (filters.seriesType !== 'all') {
                params.set('type', filters.seriesType);
            }
            if (searchQuery) {
                params.set('search', searchQuery);
            }

            const url = '/api/poker/series?' + params;
            const currentSeq = ++fetchSeriesSeqRef.current;
            const json = await cachedFetch(url);
            
            if (fetchSeriesSeqRef.current !== currentSeq) return;
            
            setSeries(json.data || []);
        } catch (e) {
            console.warn('Fetch series error:', e);
            setSeries([]);
        }
    };

    const fetchDailyTournaments = async (dayOverride) => {
        try {
            const params = new URLSearchParams({ limit: '999' });
            params.set('day', dayOverride || filters.selectedDay);

            if (selectedCity && selectedCity.state) {
                params.set('state', selectedCity.state);
            }
            if (filters.selectedState && filters.selectedState !== 'all') {
                params.set('state', filters.selectedState);
            }
            // Also pass GPS-derived state when available
            if (!selectedCity && userLocation) {
                params.set('lat', userLocation.lat.toString());
                params.set('lng', userLocation.lng.toString());
            }
            if (searchQuery) {
                params.set('venue', searchQuery);
            }
            if (filters.minBuyin) {
                params.set('minBuyin', filters.minBuyin);
            }
            if (filters.maxBuyin) {
                params.set('maxBuyin', filters.maxBuyin);
            }
            if (filters.gameType && filters.gameType !== 'all') {
                params.set('game_type', filters.gameType === 'cash' ? 'NLH' : filters.gameType);
            }

            const url = '/api/poker/daily-tournaments?' + params;
            const currentSeq = ++fetchDailySeqRef.current;
            const json = await cachedFetch(url);
            
            if (fetchDailySeqRef.current !== currentSeq) return;
            
            const tournamentList = json.tournaments || [];
            setDailyTournaments(tournamentList);
            // Update dbStats with tournament count
            if (tournamentList.length > 0) {
                setDbStats(prev => ({ ...prev, tournaments: json.stats?.total || tournamentList.length }));
            }
        } catch (e) {
            console.warn('Fetch daily tournaments error:', e);
            setDailyTournaments([]);
        }
    };

    // Pre-compute venueId → maxGuaranteed lookup (eliminates O(n*m) per-card computation)
    const venueMaxGtd = useMemo(() => {
        const map = {};
        (dailyTournaments || []).forEach(t => {
            if (t.guaranteed) {
                const vid = String(t.venue_id);
                map[vid] = Math.max(map[vid] || 0, Number(t.guaranteed));
            }
        });
        return map;
    }, [dailyTournaments]);

    // Fetch the full venue list for search suggestions
    const fetchLiveVenueList = async () => {
        try {
            const res = await fetch('/api/poker/live-tables?list=true');
            if (!res.ok) return;
            const json = await res.json();
            setLiveVenueList(json.venues || []);
        } catch (e) {
            console.warn('Fetch venue list error:', e);
        }
    };

    // Fetch live games for a specific venue
    const fetchLiveGames = async (venueSlug) => {
        if (!venueSlug) return;
        setLiveLoading(true);
        try {
            const res = await fetch('/api/poker/live-tables?venue=' + encodeURIComponent(venueSlug));
            if (!res.ok) throw new Error(`Request failed (${res.status})`);
            const json = await res.json();
            let games = [];
            if (json.venues && Array.isArray(json.venues)) {
                json.venues.forEach(v => {
                    (v.games || []).forEach(g => {
                        const name = g.game || '';
                        let gameType = 'NLH';
                        if (/PLO|omaha/i.test(name)) gameType = /big\s?o/i.test(name) ? 'Big O' : 'PLO';
                        else if (/limit\s+holdem/i.test(name) && !/no\s+limit/i.test(name)) gameType = 'Limit';
                        else if (/stud/i.test(name)) gameType = 'Stud';
                        else if (/mixed|mix/i.test(name)) gameType = 'Mixed';
                        else if (/dealer/i.test(name)) gameType = 'DC';
                        else if (/tourney|tournament/i.test(name)) gameType = 'Tournament';
                        const stakesMatch = name.match(/(\d+)-(\d+)/);
                        const stakes = stakesMatch ? `$${stakesMatch[1]}/$${stakesMatch[2]}` : '';
                        games.push({
                            venue_id: v.bravo_slug,
                            venue_name: v.venue_name,
                            game_type: gameType,
                            stakes: stakes,
                            table_count: g.tables_running || 0,
                            wait_time: g.players_waiting > 0 ? g.players_waiting : null,
                            game_name_raw: name,
                            created_at: v.last_updated,
                        });
                    });
                });
            }
            setLiveGames(games);
        } catch (e) {
            console.warn('Fetch live games error:', e);
            setLiveGames([]);
        }
        setLiveLoading(false);
    };

    // Handle live venue search input
    const handleLiveSearchInput = (value) => {
        setLiveSearchQuery(value);
        if (value.trim().length >= 2) {
            const q = value.trim().toLowerCase();
            const matches = liveVenueList.filter(v =>
                v.name && v.name.toLowerCase().includes(q)
            ).slice(0, 8);
            setLiveVenueSuggestions(matches);
            setShowLiveSuggestions(matches.length > 0);
        } else {
            setLiveVenueSuggestions([]);
            setShowLiveSuggestions(false);
        }
    };

    // Handle venue selection from suggestions
    const handleSelectLiveVenue = (venue) => {
        setSelectedLiveVenue(venue);
        setLiveSearchQuery(venue.name);
        setShowLiveSuggestions(false);
        setLiveGames([]);
        fetchLiveGames(venue.slug);
    };

    // Clear live venue selection
    const handleClearLiveVenue = () => {
        setSelectedLiveVenue(null);
        setLiveSearchQuery('');
        setLiveGames([]);
        setShowLiveSuggestions(false);
    };

    const handleSearch = (e) => {
        if (e) e.preventDefault();
        if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
        if (cityDebounceRef.current) clearTimeout(cityDebounceRef.current);
        const query = searchQuery.trim();
        if (!query) return; // nothing to search
        addToSearchHistory(query);
        setShowSearchHistory(false);
        setShowCitySuggestions(false);
        setHasSearched(true);
        setShowFilters(false);
        // Activate global search mode — prevents GPS/city useEffect from overwriting results
        globalSearchModeRef.current = true;
        // Always land on Venues tab when searching
        setActiveTab('venues');
        setDisplayCount({ venues: PAGE_SIZE, tours: PAGE_SIZE, series: PAGE_SIZE, daily: PAGE_SIZE_DAILY, live: PAGE_SIZE_LIVE });
        trackSearchEvent('search', { query, tab: 'venues' });
        // Global search: no location params — treat like a Google search across the whole DB
        fetchVenues({ searchOverride: query, globalSearch: true });
    };

    const handleSearchInputChange = (e) => {
        const value = e.target.value;
        setSearchQuery(value);
        // Cancel any pending search debounces
        if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);

        // City autocomplete suggestions only — NO auto-fetch
        if (cityDebounceRef.current) clearTimeout(cityDebounceRef.current);
        if (value.trim().length >= 2) {
            cityDebounceRef.current = setTimeout(() => {
                const q = value.trim().toLowerCase();
                const matches = POPULAR_CITIES.filter(c =>
                    c.name.toLowerCase().includes(q) || c.state.toLowerCase().includes(q)
                ).slice(0, 6);
                setCitySuggestions(matches);
                setShowCitySuggestions(matches.length > 0);
            }, 200);
        } else {
            setShowCitySuggestions(false);
        }

        // If user clears the search field, exit global search mode and reset to location-based browse
        if (value.trim().length === 0) {
            globalSearchModeRef.current = false;
            setHasSearched(false);
            setVenues([]);
        }
    };

    // City suggestion click handler
    const handleCitySuggestionClick = (city) => {
        // Clear any pending search debounce to prevent double-fetch
        if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
        setSearchQuery(city.name + ', ' + city.state);
        setSelectedCity(city);
        setUserLocation(null);
        setShowCitySuggestions(false);
        setHasSearched(true);
        globalSearchModeRef.current = false;
        trackSearchEvent('city_select', { city: city.name, state: city.state });
        // Persist selected city to localStorage for cross-session restoration
        try {
            localStorage.setItem('pnm_last_city', city.name);
            localStorage.setItem('pnm_last_state', city.state || '');
            localStorage.setItem('pnm_last_selected_city', JSON.stringify(city));
        } catch (e) { console.warn('[App] Handled exception:', e?.message || e); }
    };

    const handleCityClick = (city) => {
        setSelectedCity(city);
        setUserLocation(null);
        setHasSearched(true);
        globalSearchModeRef.current = false;
        // Persist selected city to localStorage for cross-session restoration
        try {
            localStorage.setItem('pnm_last_city', city.name);
            localStorage.setItem('pnm_last_state', city.state || '');
            localStorage.setItem('pnm_last_selected_city', JSON.stringify(city));
        } catch (e) { console.warn('[App] Handled exception:', e?.message || e); }
    };

    // ═══ DEEP LINK PERSISTENCE: write tab + search to URL (debounced) ═══
    const deepLinkRef = useRef(null);
    const paramsAbsorbed = useRef(false);

    useEffect(() => {
        if (typeof window === 'undefined' || !router.isReady || !paramsAbsorbed.current) return;
        if (deepLinkRef.current) clearTimeout(deepLinkRef.current);
        deepLinkRef.current = setTimeout(() => {
            let pathSlug = 'venues';
            if (showLiveTab) {
                pathSlug = 'live-games';
            } else if (activeTab === 'map') {
                pathSlug = 'map';
            } else if (activeTab === 'saved') {
                pathSlug = 'saved';
            } else if (activeTab === 'more') {
                pathSlug = activeMoreTab === 'alerts' ? 'alerts' : activeMoreTab === 'roadtrip' ? 'roadtrip' : 'more';
            } else if (activeTab === 'events') {
                pathSlug = activeEventTab || 'events';
            } else if (activeTab === 'venues') {
                pathSlug = 'venues';
            }

            const params = new URLSearchParams();
            if (searchQuery) {
                params.set('q', searchQuery);
            }
            // Only write ?filter= for KNOWN valid venue types — never write 'undefined'
            const SAFE_VENUE_TYPES = new Set(['casino', 'card_room', 'poker_club', 'home_game', 'charity', 'tour_stop', 'poker_tour']);
            if (SAFE_VENUE_TYPES.has(filters.venueType)) params.set('filter', filters.venueType);
            const qs = params.toString();
            const newUrl = '/hub/poker-near-me/' + pathSlug + (qs ? '?' + qs : '');
            
            // Re-read current path to check if we really need to replace
            const currentUrl = router.asPath;
            if (currentUrl !== newUrl) {
                // IMPORTANT: Use window.history.replaceState, NOT router.replace.
                // router.replace can cause a re-render cycle that resets component state,
                // which wipes out searchQuery and causes an empty URL to be pushed immediately after.
                window.history.replaceState({ ...window.history.state, as: newUrl, url: newUrl }, '', newUrl);
            }
        }, 500);
        return () => { if (deepLinkRef.current) clearTimeout(deepLinkRef.current); };
    }, [activeTab, activeEventTab, activeMoreTab, showLiveTab, searchQuery, filters.venueType, router.isReady, router.asPath]); // eslint-disable-line react-hooks/exhaustive-deps

    // Read deep link params on mount (Bypass Next.js router.query hydration delays)
    useEffect(() => {
        if (typeof window === 'undefined' || paramsAbsorbed.current) return;

        // Parse native URL immediately for 100% reliable deep-linking on first load
        const searchParams = new URLSearchParams(window.location.search);
        const qParam = searchParams.get('q');
        const tabParam = searchParams.get('tab');
        const subParam = searchParams.get('sub');
        const filterParam = searchParams.get('filter');

        const pathname = window.location.pathname;
        const parts = pathname.split('/');
        const slug = parts[parts.length - 1]; // e.g. 'live-games', 'map', 'venues'

        if (qParam) {
            setSearchQuery(qParam);
            setShowGlobalSearch(true); // Automatically open the global search modal!
        }
        
        if (slug) {
            let internalTab = slug;
            let internalSub = null;
            let isLive = false;

            if (slug === 'live-games') {
                isLive = true;
            } else if (slug === 'venues') {
                internalTab = 'venues';
            } else if (slug === 'map') {
                internalTab = 'map';
            } else if (slug === 'saved') {
                internalTab = 'saved';
            } else if (['series', 'tours', 'events', 'daily-tournaments', 'events-calendar'].includes(slug)) {
                internalTab = 'events';
                if (slug === 'daily-tournaments') internalSub = 'daily';
                else if (slug === 'events-calendar') internalSub = 'calendar';
                else internalSub = slug === 'events' ? 'series' : slug;
            } else if (['roadtrip', 'alerts', 'more'].includes(slug)) {
                internalTab = 'more';
                if (slug === 'roadtrip' || slug === 'alerts') setActiveMoreTab(slug);
            } else if (tabParam) {
                // Fallback for legacy deep links (e.g. ?tab=live backwards compat)
                if (tabParam === 'live') isLive = true;
                else internalTab = tabParam === 'favorites' ? 'saved' : tabParam;
            }

            if (isLive) {
                setShowLiveTab(true);
                if (typeof window !== 'undefined') {
                    // Update URL to clean format and drop query
                    const cleanUrl = '/hub/poker-near-me/live-games' + (qParam ? '?q=' + qParam : '');
                    window.history.replaceState({ ...window.history.state, as: cleanUrl, url: cleanUrl }, '', cleanUrl);
                }
            } else if (TAB_ORDER.includes(internalTab) || internalTab === 'events' || internalTab === 'more') {
                setShowLiveTab(false); // Reset live tab when navigating to any other tab
                setActiveTab(internalTab);
                if (internalSub) setActiveEventTab(internalSub);
            }
        }
        
        // Read events sub-tab from URL
        if (subParam && EVENTS_SUB_TABS.includes(subParam)) {
            setActiveEventTab(subParam);
        }
        if (subParam && MORE_SUB_TABS.includes(subParam)) {
            setActiveMoreTab(subParam);
        }
        
        // GUARD: reject 'undefined' (string) or any non-real venue type as a filter param
        const VALID_VENUE_TYPES = new Set(['all', 'casino', 'card_room', 'poker_club', 'home_game', 'charity', 'tour_stop', 'poker_tour']);
        if (filterParam && VALID_VENUE_TYPES.has(filterParam)) {
            setFilters(prev => ({ ...prev, venueType: filterParam }));
        }

        // Set unconditionally so the writer effect can activate when router is ready
        paramsAbsorbed.current = true;
    }, [router.isReady]); // eslint-disable-line react-hooks/exhaustive-deps

    // ═══ SWIPE GESTURE HANDLERS ═══
    const handleTouchStart = useCallback((e) => {
        if (e.target.closest && e.target.closest('.leaflet-container')) return;
        touchStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, time: Date.now() };
        touchEndRef.current = null;
    }, []);

    const handleTouchMove = useCallback((e) => {
        if (e.target.closest && e.target.closest('.leaflet-container')) return;
        touchEndRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    }, []);

    const handleTouchEnd = useCallback(() => {
        if (!touchStartRef.current || !touchEndRef.current) return;
        const dx = touchEndRef.current.x - touchStartRef.current.x;
        const dy = touchEndRef.current.y - touchStartRef.current.y;
        const elapsed = Date.now() - touchStartRef.current.time;
        // Must be a horizontal swipe: fast, horizontal dominant, > 80px
        if (Math.abs(dx) > 80 && Math.abs(dx) > Math.abs(dy) * 1.5 && elapsed < 500) {
            // Events tab: handle sub-tab swiping FIRST (tours/series/daily/calendar)
            if (activeTab === 'events') {
                const evtIdx = EVENTS_SUB_TABS.indexOf(activeEventTab);
                if (evtIdx !== -1) {
                    if (dx < 0 && evtIdx < EVENTS_SUB_TABS.length - 1) {
                        setActiveEventTab(EVENTS_SUB_TABS[evtIdx + 1]);
                    } else if (dx > 0 && evtIdx > 0) {
                        setActiveEventTab(EVENTS_SUB_TABS[evtIdx - 1]);
                    } else if (dx > 0 && evtIdx === 0) {
                        setActiveTab('venues'); // Exit left to venues
                    } else if (dx < 0 && evtIdx === EVENTS_SUB_TABS.length - 1) {
                        setActiveTab('live'); // Exit right to live
                        setShowLiveTab(true);
                    }
                }
            } else if (activeTab === 'more') {
                const moreIdx = MORE_SUB_TABS.indexOf(activeMoreTab);
                if (moreIdx !== -1) {
                    if (dx < 0 && moreIdx < MORE_SUB_TABS.length - 1) {
                        setActiveMoreTab(MORE_SUB_TABS[moreIdx + 1]);
                    } else if (dx > 0 && moreIdx > 0) {
                        setActiveMoreTab(MORE_SUB_TABS[moreIdx - 1]);
                    } else if (dx > 0 && moreIdx === 0) {
                        setActiveTab('saved'); // Exit left to saved
                    }
                }
            } else {
                // All other tabs: main-level tab swiping
                const currentIdx = TAB_ORDER.indexOf(activeTab);
                if (currentIdx !== -1) {
                    if (dx < 0 && currentIdx < TAB_ORDER.length - 1) {
                        const nextTab = TAB_ORDER[currentIdx + 1];
                        setActiveTab(nextTab);
                        if (nextTab === 'live') setShowLiveTab(true);
                    } else if (dx > 0 && currentIdx > 0) {
                        const nextTab = TAB_ORDER[currentIdx - 1];
                        setActiveTab(nextTab);
                        if (nextTab === 'live') setShowLiveTab(true);
                    }
                }
            }
        }
        touchStartRef.current = null;
        touchEndRef.current = null;
    }, [activeTab, activeEventTab, activeMoreTab]);

    // ═══ PULL-TO-REFRESH ═══
    const pullDistanceRef = useRef(0);
    const handlePullStart = useCallback((e) => {
        if (e.target.closest && e.target.closest('.leaflet-container')) return;
        if (window.scrollY <= 0) {
            pullStartRef.current = e.touches[0].clientY;
        }
    }, []);

    const handlePullMove = useCallback((e) => {
        if (pullStartRef.current === null) return;
        const diff = e.touches[0].clientY - pullStartRef.current;
        if (diff > 0 && diff < 150) {
            pullDistanceRef.current = diff;
            setPullDistance(diff);
        }
    }, []);

    const fetchAllDataRef = useRef(null);
    fetchAllDataRef.current = fetchAllData;
    fetchVenuesRef.current = fetchVenues;

    const handlePullEnd = useCallback(() => {
        const dist = pullDistanceRef.current;
        if (dist > 80 && !isRefreshing) {
            setIsRefreshing(true);
            setPullDistance(0);
            pullDistanceRef.current = 0;
            if (fetchAllDataRef.current) {
                fetchAllDataRef.current({ includeVenues: true }).finally(() => {
                    setIsRefreshing(false);
                });
            }
        } else {
            setPullDistance(0);
            pullDistanceRef.current = 0;
        }
        pullStartRef.current = null;
    }, [isRefreshing]); // eslint-disable-line react-hooks/exhaustive-deps

    // ═══ PUSH NOTIFICATION REGISTRATION ═══
    useEffect(() => {
        if (typeof window !== 'undefined' && 'Notification' in window) {
            setPushPermission(Notification.permission);
        }
    }, []);
    // NOTE: Realtime subscription on 'tables' was removed — it fired fetchAllData
    // on every single postgres UPDATE, causing constant page glitching/flickering.
    // Users can pull-to-refresh or search to get fresh data instead.

    const requestPushPermission = useCallback(async () => {
        if (!('Notification' in window)) return;
        try {
            const result = await Notification.requestPermission();
            setPushPermission(result);
            if (result === 'granted') {
                trackSearchEvent('push_enabled', {});
            }
        } catch (e) {
            console.warn('Push permission error:', e);
        }
    }, []);



    const clearFilters = useCallback(() => {
        setSelectedCity(null);
        setUserLocation(null);
        setGpsLocationLabel(null);
        setSearchQuery('');
        setHasSearched(false);
        setVenues([]);
        setShowCitySuggestions(false);
        setFetchError(null);
        setNearestDistance(null);
        setSortBy('default');
        setDisplayCount(prev => ({ ...prev, venues: PAGE_SIZE }));
        setFilters({
            radius: 50,
            venueType: 'all',
            hasNLH: false,
            hasPLO: false,
            hasMixed: false,
            tourType: 'all',
            seriesTimeframe: 90,
            seriesType: 'all',
            selectedDay: getCurrentDay(),
            minBuyin: '',
            maxBuyin: '',
            stakes: 'all',
            gameType: 'all',
            selectedState: 'all'
        });
        // Clear persisted city selection so it doesn't ghost-restore on next visit
        try { localStorage.removeItem('pnm_last_selected_city'); } catch (e) { console.warn('[App] Handled exception:', e?.message || e); }
    }, []);

    // Memoize counts for tabs
    const counts = useMemo(() => ({
        venues: venues.length,
        tours: tours.length,
        series: series.length,
        daily: dailyTournaments.length,
        live: liveGames.length
    }), [venues.length, tours.length, series.length, dailyTournaments.length, liveGames.length]);

    // Loading skeleton component
    const renderSkeletons = (count = 8) => (
        <div className="card-grid">
            {Array.from({ length: count }).map((_, i) => (
                <div key={i} className="entity-card skeleton-card">
                    <div className="skel skel-header"></div>
                    <div className="skel skel-title"></div>
                    <div className="skel skel-text"></div>
                    <div className="skel skel-tags"></div>
                    <div className="skel skel-footer"></div>
                </div>
            ))}
        </div>
    );

    // Render content based on active tab

    // ─── CARD LIST: Use API-filtered `venues` (server-side GPS+radius filtered) ───
    // Tour stops come from allVenuesWithTours since the venues API doesn't serve them.
    // This prevents Las Vegas venues from appearing in an Oak Lawn 50mi search.
    const venueCardList = React.useMemo(() => {
        const tourStops = allVenuesWithTours.filter(v => v.venue_type === 'tour_stop');
        // Dedupe: don't add a tour stop if a matching venue is already in `venues`
        const venueIds = new Set(venues.map(v => String(v.id)));
        const uniqueTourStops = tourStops.filter(t => !venueIds.has(String(t.id)));
        let combined = [...venues, ...uniqueTourStops];

        // ─── CLIENT-SIDE: Auto-filter by gameType (nlh/plo/mixed) ───
        // venueType is server-side; gameType and stakes are applied client-side instantly.
        // Values match the dropdown: 'nlh' | 'plo' | 'mixed' | 'all'
        if (filters.gameType && filters.gameType !== 'all') {
            combined = combined.filter(v => {
                const games = v.games_offered || [];
                const hasNLH = games.some(g => {
                    const name = (g.game_type || g.name || g || '').toString().toLowerCase();
                    return name.includes('nlh') || name.includes('hold') || name.includes('holdem') || name === 'no limit holdem';
                });
                const hasPLO = games.some(g => {
                    const name = (g.game_type || g.name || g || '').toString().toLowerCase();
                    return name.includes('plo') || name.includes('omaha') || name.includes('pot limit');
                });
                const hasMixed = games.some(g => {
                    const name = (g.game_type || g.name || g || '').toString().toLowerCase();
                    return name.includes('mix') || name.includes('horse') || name.includes('hors') || name.includes('dealer');
                });
                const hasPLO8 = games.some(g => {
                    const name = (g.game_type || g.name || g || '').toString().toLowerCase();
                    return name.includes('plo8') || name.includes('omaha hi') || name.includes('o8') || name.includes('big o');
                });
                const hasStud = games.some(g => {
                    const name = (g.game_type || g.name || g || '').toString().toLowerCase();
                    return name.includes('stud');
                });
                if (filters.gameType === 'nlh') return hasNLH;
                if (filters.gameType === 'plo') return hasPLO;
                if (filters.gameType === 'plo8') return hasPLO8;
                if (filters.gameType === 'mixed') return hasMixed || (hasNLH && hasPLO);
                if (filters.gameType === 'stud') return hasStud;
                if (filters.gameType === 'other') return !hasNLH && !hasPLO && !hasPLO8 && !hasStud;
                return true; // unknown/future filter keys — show all

            });
        }

        // ─── CLIENT-SIDE: Stakes filter ───
        // NOTE: The catalog's `games_offered` stores game type names (["NLH","PLO"]) with no
        // stake data, so `.includes('1/2')` will NEVER match → every catalog venue gets hidden.
        // Stakes filtering is only valid in the LiveGamesFeed where Bravo/PA data includes
        // actual stake strings per game. Skip catalog stakes filter to prevent blank page.
        // TODO: Enable once `poker_venues.games_offered` includes per-game stake ranges.
        // if (filters.stakes && filters.stakes !== 'all' && filters.stakes !== 'any') { ... }

        return combined;
    }, [venues, allVenuesWithTours, filters.gameType, filters.stakes]);

    // Shared VenuesTabPanel JSX — single definition for 3 render paths
    const venuesTabJsx = (
        <VenuesTabPanel
            venues={venueCardList}
            venueLoading={venueLoading}
            loading={loading}
            sortBy={sortBy}
            setSortBy={setSortBy}
            getSortedVenues={getSortedVenues}
            displayCount={displayCount}
            loadMore={loadMore}
            mapFullscreen={mapFullscreen}
            setMapFullscreen={setMapFullscreen}
            mapCenter={mapCenter}
            userLocation={userLocation}
            isFavorited={isFavorited}
            toggleFavorite={toggleFavorite}
            venueMaxGtd={venueMaxGtd}
            promotionVenueIds={promotionVenueIds}
            highlightedVenueId={highlightedVenueId}
            nearestDistance={nearestDistance}
            filters={filters}
            clearFilters={clearFilters}
            pnmReviewStatsMap={pnmReviewStatsMap}
            router={router}
            openVenueModal={openVenueModal}
            onMapVenueClick={onMapVenueClick}
            iframeModal={iframeModal}
            setIframeModal={setIframeModal}
            checkinCounts={checkinCounts}
        />
    );
    
    const renderContent = () => {
        if (activeTab === 'map') return (
            <MapTabPanel
                allVenuesForMap={allVenuesWithTours}
                mapFilters={mapFilters}
                setMapFilters={setMapFilters}
                filters={filters}
                setFilters={setFilters}
                userLocation={userLocation}
                mapCenter={mapCenter}
                liveTableCount={liveTableCount}
                dailyTournaments={dailyTournaments}
                onMapVenueClick={onMapVenueClick}
                requestGpsLocation={requestGpsLocation}
                selectedRoom={selectedRoom}
                setSelectedRoom={setSelectedRoom}
                setHasSearched={setHasSearched}
                fetchAllData={fetchAllData}
                router={router}
                openVenueModal={openVenueModal}
                setIframeModal={setIframeModal}
            />
        );
        if (showLiveTab) return (
            <div>
                {/* ─── LIVE CASH GAMES SECTION HEADER ─── */}
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '14px 20px 10px',
                    borderBottom: '1px solid rgba(255,255,255,0.06)',
                    marginBottom: 0,
                }}>
                    <span style={{
                        width: 9,
                        height: 9,
                        borderRadius: '50%',
                        background: '#ef4444',
                        boxShadow: '0 0 10px #ef4444',
                        animation: 'lgf-pulse 1.5s ease-in-out infinite',
                        flexShrink: 0,
                        display: 'inline-block',
                    }} />
                    <h2 style={{
                        margin: 0,
                        fontSize: 18,
                        fontWeight: 800,
                        color: '#ffffff',
                        letterSpacing: '1.5px',
                        textTransform: 'uppercase',
                    }}>Cash Games Near Me</h2>
                </div>
                <LiveGamesFeed
                    venues={allVenuesWithTours.length > 0 ? allVenuesWithTours : venues}
                    userLocation={userLocation}
                    selectedCity={selectedCity}
                    globalFilters={filters}
                    setGlobalFilters={setFilters}
                    favorites={favorites}
                    handleToggleFavorite={(venueId, venueData) => toggleFavorite('venue', venueId, null, venueData)}
                    router={router}
                    openVenueModal={openVenueModal}
                    setSelectedVenueForReview={setReviewVenue}
                    user={user}
                />
            </div>
        );
        if (activeTab === 'saved') return (
            <FavoritesTabPanel
                allVenuesForMap={allVenuesForMap}
                venues={venues}
                isFavorited={isFavorited}
                favorites={favorites}
                toggleFavorite={toggleFavorite}
                venueMaxGtd={venueMaxGtd}
                promotionVenueIds={promotionVenueIds}
                pnmReviewStatsMap={pnmReviewStatsMap}
                setActiveTab={setActiveTab}
                router={router}
                openVenueModal={openVenueModal}
            />
        );

        // For venues tab: show search landing if no search yet, skip skeleton
        if (activeTab === 'venues' && !hasSearched) return venuesTabJsx;

        // Show loading — skeletons for all data-driven tabs
        if ((activeTab === 'venues' && venueLoading) || loading) {
            return renderSkeletons(activeTab === 'events' ? 6 : 8);
        }

        switch (activeTab) {
            case 'venues':
                return venuesTabJsx;
            case 'events':
                switch (activeEventTab) {
                    case 'tours': return (
                        <ToursTabPanel
                            tours={tours}
                            filters={filters}
                            setFilters={setFilters}
                            displayCount={displayCount}
                            loadMore={loadMore}
                            isFavorited={isFavorited}
                            toggleFavorite={toggleFavorite}
                            router={router}
                            openVenueModal={openVenueModal}
                        />
                    );
                    case 'series': return (
                        <SeriesTabPanel
                            series={series}
                            filters={filters}
                            setFilters={setFilters}
                            displayCount={displayCount}
                            loadMore={loadMore}
                            seriesViewMode={seriesViewMode}
                            setSeriesViewMode={setSeriesViewMode}
                            isFavorited={isFavorited}
                            toggleFavorite={toggleFavorite}
                            router={router}
                            openVenueModal={openVenueModal}
                        />
                    );
                    case 'calendar': return <SeasonalCalendar series={series} tours={tours} dailyTournaments={dailyTournaments} />;
                    case 'daily':
                    default:
                        return (
                            <DailyTournamentsTabPanel
                                dailyTournaments={dailyTournaments}
                                filters={filters}
                                setFilters={setFilters}
                                fetchDailyTournaments={fetchDailyTournaments}
                            />
                        );
                }
            case 'more':
                return (
                    <MoreTabPanel
                        activeMoreTab={activeMoreTab}
                        setActiveMoreTab={setActiveMoreTab}
                        allVenuesForMap={allVenuesForMap}
                        venues={venues}
                        userLocation={userLocation}
                        userId={userId}
                        user={user}
                        dailyTournaments={dailyTournaments}
                        series={series}
                        gpsLocationLabel={gpsLocationLabel}
                        geofenceStatus={geofenceStatus}
                        pushPermission={pushPermission}
                        requestPushPermission={requestPushPermission}
                        setPushPermission={setPushPermission}
                        guardAction={guardAction}
                        requestGpsLocation={requestGpsLocation}
                        setActiveTab={setActiveTab}
                        router={router}
                        openVenueModal={openVenueModal}
                    />
                );
            default:
                return venuesTabJsx;
        }
    };

    return (
        <>
            {/* Intro video overlay */}
            {showIntro && (
                <div style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    zIndex: 99999,
                    background: '#000',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                }}>
                    <video
                        ref={introVideoRef}
                        src="/videos/poker-near-me-intro.mp4"
                        autoPlay
                        muted
                        playsInline
                        preload="none"
                        poster="/images/pnm-poster.jpg"
                        onPlay={handleIntroPlay}
                        onEnded={handleIntroEnd}
                        onError={handleIntroEnd}
                        style={{
                            width: '100%',
                            height: '100%',
                            objectFit: 'contain'
                        }}
                    />
                    <button
                        onClick={handleIntroEnd}
                        style={{
                            position: 'absolute',
                            top: 20,
                            right: 20,
                            padding: '8px 20px',
                            background: 'rgba(255,255,255,0.2)',
                            backdropFilter: 'blur(10px)',
                            border: '1px solid rgba(255,255,255,0.3)',
                            borderRadius: 20,
                            color: 'white',
                            fontSize: 14,
                            fontWeight: 500,
                            cursor: 'pointer',
                            zIndex: 100000
                        }}
                    >
                        Skip
                    </button>
                </div>
            )}

            <SEOHead
                title={activeTab === 'live' ? "Live Cash Games — Find Live Poker Rooms & Casinos Near You" : "Poker Near Me — Find Live Poker Rooms & Casinos"}
                description={activeTab === 'live' ? "Discover Live Cash Games, Poker Rooms, Casinos, And Card Rooms Near You. Real-Time Game Info, Tournament Schedules, And Interactive Maps Across The United States." : "Discover Live Poker Rooms, Casinos, And Card Rooms Near You. Real-Time Game Info, Tournament Schedules, And Interactive Maps Across The United States."}
                canonical={`/hub/poker-near-me/${showLiveTab ? 'live-games' : activeTab === 'events' ? (activeEventTab || 'events') : activeTab === 'more' ? (activeMoreTab === 'alerts' ? 'alerts' : activeMoreTab === 'roadtrip' ? 'roadtrip' : 'more') : activeTab}`}
            />

            <div className="pnm-page">
                <div className="space-bg"></div>
                <div className="space-overlay"></div>

                <UniversalHeader 
                    pageDepth={2} 
                    showSearch={true}
                    onSearchClick={() => setShowGlobalSearch(true)}
                    onBackClick={() => {
                        // Bug 4: Implement a robust fallback for the "BACK" button
                        if (typeof window !== 'undefined' && window.history.length > 2) {
                            router.back();
                        } else {
                            router.push('/hub');
                        }
                    }}
                    onMenuClick={() => setMenuOpen(true)} 
                />

                {/* Hamburger Menu */}
                <HamburgerMenu
                    isOpen={menuOpen}
                    onClose={() => setMenuOpen(false)}
                    direction="left"
                    theme="dark"
                    user={null}
                    showProfile={false}
                    menuItems={menuConfig.menuItems}
                    bottomLinks={menuConfig.bottomLinks}
                />

                {/* Global Search Overlay — opened from hamburger menu */}
                {showGlobalSearch && (
                    <GlobalSearchOverlay
                        isOpen={showGlobalSearch}
                        onClose={() => {
                            setShowGlobalSearch(false);
                            // Only replace if URL currently contains ?q=
                            if (typeof window !== 'undefined' && window.location.search.includes('q=')) {
                                const cleanUrl = '/hub/poker-near-me/lobby';
                                window.history.replaceState({ ...window.history.state, as: cleanUrl, url: cleanUrl }, '', cleanUrl);
                            }
                        }}
                        searchQuery={searchQuery}
                        onSearchChange={() => {}}
                        trackSearchEvent={trackSearchEvent}
                        allTours={tours || []}
                        allSeries={series || []}
                        searchHistory={[]}
                        cachedFetch={cachedFetch}
                    />
                )}

                {/* ═══ PAGE TITLE ═══ */}
                <div className="pnm-title-bar">
                    <h1 className="pnm-title">{showLiveTab ? 'CASH GAMES NEAR ME' : 'POKER NEAR ME'}</h1>
                    <p className="pnm-subtitle">
                        {dbStats.total === 0 && liveTableCount === 0 ? (
                            'Loading Live Data...'
                        ) : (
                            <>
                                {dbStats.total > 0 ? dbStats.total.toLocaleString() : '—'} Venues
                                &nbsp;&bull;&nbsp;
                                {liveTableCount.toLocaleString()} Live Tables
                                {dbStats.tournaments > 0 && (
                                    <>
                                        &nbsp;&bull;&nbsp;
                                        {dbStats.tournaments.toLocaleString()} Today&apos;s Tournaments
                                    </>
                                )}
                            </>
                        )}
                    </p>
                </div>

                {/* ═══ FAVORITE VENUE LIVE TOAST (5s delay, 2s visible) ═══ */}
                {(() => {
                    const favKeys = Object.keys(favorites || {}).filter(k => k.startsWith('venue-'));
                    if (favKeys.length === 0) return null;
                    const favIds = new Set(favKeys.map(k => k.replace('venue-', '')));
                    const liveFavs = allVenuesWithTours.filter(v => 
                        favIds.has(String(v.id)) && v.live_data && v.live_data.tables_running > 0
                    );
                    if (liveFavs.length === 0) return null;
                    const toastMsg = liveFavs.length === 1
                        ? `${liveFavs[0].name} Has ${liveFavs[0].live_data.tables_running} Table${liveFavs[0].live_data.tables_running !== 1 ? 's' : ''} Running!`
                        : `${liveFavs.length} Of Your Favorites Have Live Tables Running!`;
                    return <FavLiveToast message={toastMsg} onClick={() => setActiveTab('saved')} />;
                })()}


                {/* ═══ TOP FILTER BAR: Location + Dropdowns + Apply + Live Games ═══ */}
                {(activeTab === 'map' || activeTab === 'venues' || showLiveTab) && (
                    <>
                        <div className="pnm-filter-bar">
                            {/* Location pill / GPS button — left of Radius */}
                            <div className="pnm-location-area">
                                {userLocation && gpsLocationLabel ? (
                                    <div className="pnm-location-pill">
                                        <div className="pnm-location-dot" />
                                        <span className="pnm-location-label">Location Active</span>
                                        <span className="pnm-location-city">{gpsLocationLabel}</span>
                                        <button
                                            className="pnm-location-clear"
                                            onClick={() => { setUserLocation(null); setGpsLocationLabel(null); setHasSearched(false); setVenues([]); setNearestDistance(null); }}
                                            aria-label="Clear location"
                                        >&times;</button>
                                    </div>
                                ) : (
                                    <button
                                        className={'pnm-gps-btn' + (gpsLoading ? ' loading' : '')}
                                        onClick={requestGpsLocation}
                                        disabled={gpsLoading}
                                    >
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                            <circle cx="12" cy="12" r="3" />
                                            <path d="M12 2v4M12 18v4M2 12h4M18 12h4" />
                                        </svg>
                                        {gpsLoading ? 'Locating...' : 'Enable GPS'}
                                    </button>
                                )}
                            </div>
                            <div className="pnm-filter-group">
                                <label className="pnm-filter-label">Radius</label>
                                <select
                                    className="pnm-filter-select"
                                    value={filters.radius}
                                    onChange={e => setFilters(f => ({ ...f, radius: String(e.target.value).toLowerCase() === 'any' ? 'any' : Number(e.target.value) }))}
                                >
                                    <option value={25}>25 Miles</option>
                                    <option value={50}>50 Miles</option>
                                    <option value={100}>100 Miles</option>
                                    <option value={200}>200 Miles</option>
                                    <option value={500}>500 Miles</option>
                                    <option value="Any">Any Distance</option>
                                </select>
                            </div>
                            <div className="pnm-filter-group">
                                <label className="pnm-filter-label">Venue Type</label>
                                <select
                                    className="pnm-filter-select"
                                    value={filters.venueType}
                                    onChange={e => setFilters(f => ({ ...f, venueType: e.target.value }))}
                                >
                                    <option value="all">All Locations</option>
                                    <option value="casino">Casino</option>
                                    <option value="poker_club">Poker Club</option>
                                    <option value="charity">Charity</option>
                                    <option value="tour_stop">Poker Tour</option>
                                </select>
                            </div>
                            <div className="pnm-filter-group">
                                <label className="pnm-filter-label">Game Type</label>
                                <select
                                    className="pnm-filter-select"
                                    value={filters.gameType}
                                    onChange={e => setFilters(f => ({ ...f, gameType: e.target.value }))}
                                >
                                    <option value="all">All Games</option>
                                    <option value="nlh">No Limit Hold'em</option>
                                    <option value="plo">Pot Limit Omaha</option>
                                    <option value="mixed">Mixed Games</option>
                                </select>
                            </div>
                            <div className="pnm-filter-group">
                                <label className="pnm-filter-label">Stakes</label>
                                <select
                                    className="pnm-filter-select"
                                    value={filters.stakes}
                                    onChange={e => setFilters(f => ({ ...f, stakes: e.target.value }))}
                                >
                                    <option value="all">All Stakes</option>
                                    <option value="$1/2">$1/2</option>
                                    <option value="$2/5">$2/5</option>
                                    <option value="$5/10+">$5/10+</option>
                                </select>
                            </div>

                            {/* Live Games button */}
                            <button
                                className={'pnm-top-tab live pnm-live-games-inline' + (showLiveTab ? ' active' : '')}
                                onClick={() => activateTab('live')}
                            >
                                <span className="pnm-live-dot" />
                                Live Games
                                {liveTableCount > 0 && <span className="pnm-tab-badge">{liveTableCount}</span>}
                            </button>
                        </div>
                    </>
                )}

                {/* ═══ MAIN CONTENT — full width, no sidebar ═══ */}
                <div className="pnm-layout">
                    <div className="pnm-main">


                    {/* ─── MAIN CONTENT AREA ─── */}


                    {/* Geofence notice moved to 'more' tab */}


                    {/* Content area */}
                    <div
                        className="pnm-content"
                        ref={contentRef}
                        onTouchStart={(e) => { handleTouchStart(e); handlePullStart(e); }}
                        onTouchMove={(e) => { handleTouchMove(e); handlePullMove(e); }}
                        onTouchEnd={() => { handleTouchEnd(); handlePullEnd(); }}
                    >
                        {/* Pull-to-refresh indicator */}
                        {(pullDistance > 0 || isRefreshing) && (
                            <div className="pull-indicator" style={{ height: isRefreshing ? 40 : pullDistance * 0.5, opacity: isRefreshing ? 1 : Math.min(pullDistance / 80, 1) }}>
                                <span className={isRefreshing ? 'pull-spinner' : ''}>{isRefreshing ? '↻ Refreshing...' : pullDistance > 80 ? '↑ Release to refresh' : '↓ Pull to refresh'}</span>
                            </div>
                        )}

                        {/* City autocomplete dropdown */}
                        {showCitySuggestions && citySuggestions.length > 0 && (
                            <div className="city-autocomplete">
                                {citySuggestions.map((city, i) => (
                                    <button key={i} className="city-suggestion" onClick={() => handleCitySuggestionClick(city)}>
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0 }}>
                                            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" />
                                            <circle cx="12" cy="10" r="3" />
                                        </svg>
                                        {city.name}, {city.state}
                                    </button>
                                ))}
                            </div>
                        )}

                        {/* Fetch error retry banner */}
                        {fetchError && (
                            <div className="fetch-error-banner" onClick={() => { setFetchError(null); fetchAllData({ includeVenues: true }); }}>
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
                                {fetchError}
                            </div>
                        )}

                        {/* Push notification setup moved to the 'more' settings tab */}

                        <TabErrorBoundary>
                            {renderContent()}
                        </TabErrorBoundary>

                        {/* Venues button — below the map */}
                        {activeTab === 'map' && (
                            <div className="pnm-venues-below-map">
                                <button
                                    className={'pnm-venues-below-btn' + (activeTab === 'venues' ? ' active' : '')}
                                    onClick={() => setActiveTab('venues')}
                                >
                                    Venues
                                    {venues.length > 0 && <span className="pnm-tab-badge">{venues.length}</span>}
                                </button>
                            </div>
                        )}
                    </div>{/* end pnm-content */}
                    </div>{/* end pnm-main */}
                </div>{/* end pnm-layout */}

                    {/* Geofence Alert Banner */}
                    {geofenceAlert && (
                        <GeofenceAlertBanner
                            venue={geofenceAlert}
                            onCheckin={() => {
                                const gfUrl = geofenceAlert.is_social_page
                                    ? '/club/' + geofenceAlert.social_page_id
                                    : '/hub/venues/' + geofenceAlert.id;
                                router.push(gfUrl + '?action=checkin');
                                setGeofenceAlert(null);
                            }}
                            onReview={() => {
                                const gfUrl = geofenceAlert.is_social_page
                                    ? '/club/' + geofenceAlert.social_page_id
                                    : '/hub/venues/' + geofenceAlert.id;
                                router.push(gfUrl + '?action=review');
                                setGeofenceAlert(null);
                            }}
                            onDismiss={() => setGeofenceAlert(null)}
                        />
                    )}

                    {/* Voice Search Floating Button (Feature #11) */}
                    <VoiceSearch
                        onResult={(parsed) => {
                            if (parsed.searchQuery) setSearchQuery(parsed.searchQuery);
                            if (parsed.filters.gameType) setFilters(f => ({ ...f, gameType: parsed.filters.gameType }));
                            if (parsed.filters.radius) setFilters(f => ({ ...f, radius: parsed.filters.radius }));
                            if (parsed.filters.stakes) setFilters(f => ({ ...f, stakes: parsed.filters.stakes }));
                            if (parsed.filters.venueType) setFilters(f => ({ ...f, venueType: parsed.filters.venueType }));
                            if (parsed.filters.minBuyin) setFilters(f => ({ ...f, minBuyin: parsed.filters.minBuyin }));
                            if (parsed.filters.maxBuyin) setFilters(f => ({ ...f, maxBuyin: parsed.filters.maxBuyin }));
                            if (parsed.filters.tab) setActiveTab(parsed.filters.tab);
                            setHasSearched(true);
                            fetchAllData({ includeVenues: true });
                        }}
                    />

                    {/* Full Screen Venue Detail overlay */}
                    <FullScreenPageOverlay
                        isOpen={iframeModal.isOpen}
                        onClose={() => setIframeModal({ ...iframeModal, isOpen: false })}
                        url={iframeModal.url}
                        title={iframeModal.title}
                    />

                    {/* Venue Reviews Panel (Feature #9) */}
                    <VenueReviews
                        venueId={reviewVenue?.id}
                        venueName={reviewVenue?.name}
                        userId={userId}
                        userName={user?.display_name || user?.email}
                        authToken={user?.access_token}
                        isOpen={!!reviewVenue}
                        onClose={() => setReviewVenue(null)}
                    />

                    {/* CSS moved to styles/poker-near-me.css */}

                      {UpgradePopup}

            {/* ═══ SMART LOCATION ENABLE MODAL ═══ */}
            <LocationEnableModal
                isOpen={showLocationModal}
                onClose={() => setShowLocationModal(false)}
                onRetry={() => { setShowLocationModal(false); requestGpsLocation(); }}
                onManualEntry={() => {
                    // Focus the search input for manual city entry
                    setTimeout(() => {
                        const searchEl = document.querySelector('.sidebar-search-input');
                        if (searchEl) { searchEl.focus(); searchEl.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
                    }, 200);
                }}
            />

            {/* ═══ Tab-Specific Interactive Tutorial ═══ */}
            <InteractiveTutorial
                steps={currentTutorialTab ? (PNM_TAB_TUTORIALS[currentTutorialTab] || []) : []}
                storageKey={`pnm_tab_tutorial_${currentTutorialTab}_seen`}
                visible={showTabTutorial}
                onDismiss={handleTutorialDismiss}
                onDontShowAgain={handleTutorialDontShow}
            />
            </div>
        </>
    );
}
