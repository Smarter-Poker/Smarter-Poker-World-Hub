/**
 *  POKER NEAR ME - Live Venue Finder
 * Find poker rooms, venues, and tournaments near you
 */

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { usePersistedFilters } from '../../src/hooks/usePersistedFilters';
import SEOHead from '../../src/components/seo/SEOHead';
import { useRouter } from 'next/router';
import Image from 'next/image';
import dynamic from 'next/dynamic';
import { useAvatar } from '../../src/contexts/AvatarContext';
import HamburgerMenu from '../../src/components/ui/HamburgerMenu';
import { getMenuConfig } from '../../src/config/hamburgerMenus';
import { getPokerNearMePreferences, updatePokerNearMePreferences } from '../../src/services/pokerNearMePreferences';
import { getVenueFavorites, addVenueFavorite, removeVenueFavorite } from '../../src/services/pokerNearMeFavorites';
import { addSearchHistory as addSearchHistoryToDb, getSearchHistory as getSearchHistoryFromDb } from '../../src/services/pokerNearMeSearchHistory';
import { eventBus, busEmit, EventType } from '../../src/engine/EventBus';
import useVenueRealtime from '../../src/hooks/useVenueRealtime';
import UniversalHeader from '../../src/components/ui/UniversalHeader';
const GlobalSearchOverlay = dynamic(() => import('../../src/components/poker-near-me/GlobalSearchOverlay'), { ssr: false });
import { useFeatureGate } from '../../src/components/gates/FeatureGatePopup';
import FullScreenPageOverlay from '../../src/components/ui/FullScreenPageOverlay';

import BottomNavBar from '../../src/components/ui/BottomNavBar';
import InteractiveTutorial, { PNM_TAB_TUTORIALS } from '../../src/components/poker-near-me/InteractiveTutorial';
// Extracted tab panel components — lazy-loaded for code splitting
const MapTabPanel = dynamic(() => import('../../src/components/poker-near-me/MapTabPanel'), { ssr: false });
const VenuesTabPanel = dynamic(() => import('../../src/components/poker-near-me/VenuesTabPanel'), { ssr: false });
const ToursTabPanel = dynamic(() => import('../../src/components/poker-near-me/ToursTabPanel'), { ssr: false });
const SeriesTabPanel = dynamic(() => import('../../src/components/poker-near-me/SeriesTabPanel'), { ssr: false });
const DailyTournamentsTabPanel = dynamic(() => import('../../src/components/poker-near-me/DailyTournamentsTabPanel'), { ssr: false });
const FavoritesTabPanel = dynamic(() => import('../../src/components/poker-near-me/FavoritesTabPanel'), { ssr: false });
const MoreTabPanel = dynamic(() => import('../../src/components/poker-near-me/MoreTabPanel'), { ssr: false });

// Components still used directly in the main file
const GeofenceAlertBanner = dynamic(() => import('../../src/components/poker-near-me/GeofenceAlertBanner'), { ssr: false });
const VenueReviews = dynamic(() => import('../../src/components/poker-near-me/VenueReviews'), { ssr: false });
const VoiceSearch = dynamic(() => import('../../src/components/poker-near-me/VoiceSearch'), { ssr: false });
const SeasonalCalendar = dynamic(() => import('../../src/components/poker-near-me/SeasonalCalendar'), { ssr: false });
const LiveGamesFeed = dynamic(() => import('../../src/components/poker-near-me/LiveGamesFeed'), { ssr: false });

import { cachedFetch, fetchWithRetry } from '../../src/components/poker-near-me/lobby/PnmApiCache';
import LocationEnableModal from '../../src/components/ui/LocationEnableModal';

// Page configuration constants
const PAGE_SIZE = 20;
const PAGE_SIZE_DAILY = 50;
const PAGE_SIZE_LIVE = 30;
const LIVE_REFRESH_MS = 120000; // 2 minutes
const SEARCH_DEBOUNCE_MS = 400;
const SEARCH_HISTORY_MAX = 8;
const DEFAULT_RADIUS_MILES = 50;
const RADIUS_TIERS = [50, 100, 200, 500]; // Progressive radius expansion for "Load More"

// ═══ CITY COORDINATES — used to place individual tour stop pins on the map ═══
const TOUR_CITY_COORDS = {
    'las vegas, nv': [36.1699, -115.1398],
    'hollywood, fl': [26.0112, -80.1495],
    'atlantic city, nj': [39.3643, -74.4229],
    'lincoln, ca': [38.8916, -121.293],
    'durant, ok': [33.9943, -96.3709],
    'tampa, fl': [27.9506, -82.4572],
    'bell gardens, ca': [33.9653, -118.1514],
    'elgin, il': [42.0354, -88.2826],
    'lake tahoe, nv': [39.0968, -120.0324],
    'tunica, ms': [34.6846, -90.3829],
    'biloxi, ms': [30.396, -88.8853],
    'cherokee, nc': [35.4743, -83.3146],
    'san diego, ca': [32.7157, -117.1611],
    'el cajon, ca': [32.7948, -116.9625],
    'portland, or': [45.5155, -122.6789],
    'council bluffs, ia': [41.2619, -95.8608],
    'black hawk, co': [39.7969, -105.4903],
    'choctaw, ok': [35.4976, -97.2687],
    'shreveport, la': [32.5252, -93.7502],
    'new orleans, la': [29.9511, -90.0715],
    'kinder, la': [30.4855, -92.851],
    'gulfport, ms': [30.3674, -89.0928],
    'marksville, la': [31.1268, -92.0632],
    'oklahoma city, ok': [35.4676, -97.5164],
    'minneapolis, mn': [44.9778, -93.265],
    'kansas city, mo': [39.0997, -94.5786],
    'st. louis, mo': [38.627, -90.1994],
    'los angeles, ca': [34.0522, -118.2437],
    'phoenix, az': [33.4484, -112.074],
    'scottsdale, az': [33.4942, -111.9261],
    'chicago, il': [41.8781, -87.6298],
    'east chicago, in': [41.6354, -87.4473],
    'gary, in': [41.5934, -87.3464],
    'detroit, mi': [42.3314, -83.0458],
    'bismarck, nd': [46.8083, -100.7837],
    'fargo, nd': [46.8772, -96.7898],
    'deadwood, sd': [44.3767, -103.7296],
    'thackerville, ok': [33.7918, -97.1303],
    'mount pleasant, mi': [43.5978, -84.7753],
    'prior lake, mn': [44.7133, -93.4227],
    'welch, mn': [44.5669, -92.7233],
    'columbus, mn': [45.2448, -93.0343],
    'charleston, wv': [38.3498, -81.6326],
    'temecula, ca': [33.4936, -117.1484],
    'west palm beach, fl': [26.7153, -80.0534],
    'jacksonville, fl': [30.3322, -81.6557],
    'austin, tx': [30.2672, -97.7431],
    'round rock, tx': [30.5083, -97.6789],
    'houston, tx': [29.7604, -95.3698],
    'san jose, ca': [37.3382, -121.8863],
    'commerce, ca': [33.9975, -118.1597],
    'bossier city, la': [32.516, -93.7321],
    'fort yates, nd': [46.0886, -100.6301],
    'mandan, nd': [46.8267, -100.8891],
    'dickinson, nd': [46.8792, -102.7896],
    'belcourt, nd': [48.8411, -99.7457],
    'philadelphia, pa': [39.9526, -75.1652],
    'choctaw, ms': [32.7693, -89.117],
    'larchwood, ia': [43.4525, -96.5378],
    'riverside, ia': [41.4797, -91.5829],
    'st. charles, mo': [38.7881, -90.4974],
    'milwaukee, wi': [43.0389, -87.9065],
    'battle creek, mi': [42.3212, -85.1797],
    'cleveland, oh': [41.4993, -81.6944],
    'cincinnati, oh': [39.1031, -84.512],
    'columbus, oh': [39.9612, -82.9988],
    'pittsburgh, pa': [40.4406, -79.9959],
    'denver, co': [39.7392, -104.9903],
    'salt lake city, ut': [40.7608, -111.891],
    'reno, nv': [39.5296, -119.8138],
    'laughlin, nv': [35.1679, -114.5716],
    'henderson, nv': [36.0395, -114.9817],
    'miami, fl': [25.7617, -80.1918],
    'orlando, fl': [28.5383, -81.3792],
    'daytona beach, fl': [29.2108, -81.0228],
    'memphis, tn': [35.1495, -90.049],
    'nashville, tn': [36.1627, -86.7816],
    'atlanta, ga': [33.749, -84.388],
    'charlotte, nc': [35.2271, -80.8431],
    'richmond, va': [37.5407, -77.436],
    'baltimore, md': [39.2904, -76.6122],
    'washington, dc': [38.9072, -77.0369],
    'boston, ma': [42.3601, -71.0589],
    'new york, ny': [40.7128, -74.006],
    'minnetonka, mn': [44.9211, -93.4687],
    'burnsville, mn': [44.7677, -93.2777],
    'isle, mn': [46.1478, -93.4694],
    // Additional cities needed for complete tour coverage
    'stateline, nv': [38.9627, -119.9494],
    'robinsonville, ms': [34.7015, -90.3665],
    'dallas, tx': [32.7767, -96.797],
    'rohnert park, ca': [38.3396, -122.7011],
    'pompano beach, fl': [26.2379, -80.1248],
    'verona, ny': [43.0653, -75.5388],
    'pine bluff, ar': [34.2284, -92.0032],
    'north kansas city, mo': [39.1336, -94.5669],
    'sacramento, ca': [38.5816, -121.4944],
    'san francisco, ca': [37.7749, -122.4194],
    'tulsa, ok': [36.154, -95.9928],
    'council bluffs, ia': [41.2619, -95.8608],
    'sioux city, ia': [42.4999, -96.4003],
    'vicksburg, ms': [32.3526, -90.8779],
    'natchez, ms': [31.5604, -91.4032],
    'lake charles, la': [30.2266, -93.2174],
    'baton rouge, la': [30.4515, -91.1871],
    'hammond, in': [41.5834, -87.5001],
    'joliet, il': [41.525, -88.0817],
};

function resolveCityCoords(location) {
    if (!location) return null;
    const key = location.toLowerCase().trim();
    if (TOUR_CITY_COORDS[key]) return TOUR_CITY_COORDS[key];
    const cityPart = key.split(',')[0].trim();
    for (const [k, v] of Object.entries(TOUR_CITY_COORDS)) {
        if (k.startsWith(cityPart + ',')) return v;
    }
    return null;
}

// Tab order for swipe navigation
const TAB_ORDER = ['venues', 'events', 'live', 'map', 'saved', 'more'];
const EVENTS_SUB_TABS = ['tours', 'series', 'daily', 'calendar'];
const MORE_SUB_TABS = ['overview', 'roadtrip', 'social', 'alerts', 'nearmenow', 'tripcost'];

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
        existing.push({ event: eventName, ...data, ts: Date.now() });
        // Keep last 100 events
        if (existing.length > 100) existing.splice(0, existing.length - 100);
        localStorage.setItem(key, JSON.stringify(existing));
    } catch (e) { /* analytics should never break the app */ }
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

// ---- Geofence Alert Banner (bottom of screen) ----------------------------
export default function PokerNearMePage() {
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

    // [HARDENING] Bind venue component to Supabase postgres_changes for global updates
    useVenueRealtime(() => {
        if (fetchVenuesRef.current) {
            fetchVenuesRef.current({ silent: true });
        }
    });

    // ═══ VIP ACTION GATE ═══
    const { guardAction, UpgradePopup } = useFeatureGate('poker_near_me');

    // Active tab state — persisted with sortBy and seriesViewMode
    const { filters: uiFilters, setFilter: setUiFilter } = usePersistedFilters('poker-near-me', {
        activeTab: 'map',
        activeEventTab: 'daily',
        activeMoreTab: 'overview',
        sortBy: 'distance',
        seriesViewMode: 'grid',
        venueViewMode: 'list'
    });

    const activeTab = uiFilters.activeTab;
    const activeEventTab = uiFilters.activeEventTab || 'daily';
    const activeMoreTab = uiFilters.activeMoreTab || 'overview';
    const sortBy = uiFilters.sortBy;
    const seriesViewMode = uiFilters.seriesViewMode;
    const venueViewMode = uiFilters.venueViewMode || 'list';
    const setActiveTab = (val) => {
        if (typeof navigator !== 'undefined' && navigator.vibrate) {
            try { navigator.vibrate(1); } catch (e) { /* ignore */ }
        }
        // Reset More sub-tab to overview when switching to 'more' tab
        if (val === 'more') {
            setUiFilter('activeMoreTab', 'overview');
        }
        setUiFilter('activeTab', val);
    };
    const setActiveEventTab = (val) => setUiFilter('activeEventTab', val);
    const setActiveMoreTab = (val) => setUiFilter('activeMoreTab', val);
    const setSortBy = (val) => setUiFilter('sortBy', val);
    const setSeriesViewMode = (val) => setUiFilter('seriesViewMode', val);
    const setVenueViewMode = (val) => setUiFilter('venueViewMode', val);


    // Data states
    const [venues, setVenues] = useState([]);
    const [allVenuesForMap, setAllVenuesForMap] = useState([]);
    const [tours, setTours] = useState([]);
    const [series, setSeries] = useState([]);
    const [dailyTournaments, setDailyTournaments] = useState([]);
    const [dbStats, setDbStats] = useState({ total: 507, tournaments: 679, states: 50 });



    // Live table count for map stats (fetched from live-tables API)
    const [liveTableCount, setLiveTableCount] = useState(316);

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
            .catch(() => { /* silent */ });
    }, [venues]);

    // ─── Live Cash Game Data Merger ───
    // Fetches /api/poker/live-tables once, builds a name-normalized lookup,
    // then injects live_data into venue objects so VenueCard can display it.
    const [liveDataMap, setLiveDataMap] = useState({}); // bravo_slug/normalized_name → live_data
    useEffect(() => {
        fetch('/api/poker/live-tables')
            .then(r => r.json())
            .then(json => {
                if (!json.venues) return;
                const map = {};
                json.venues.forEach(v => {
                    const normName = (v.venue_name || '').toLowerCase()
                        .replace(/&/g, 'and').replace(/'/g, '').replace(/-/g, ' ')
                        .replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
                    const totalTables = v.games.reduce((s, g) => s + (g.tables_running || 0), 0);
                    const totalWaiting = v.games.reduce((s, g) => s + (g.players_waiting || 0), 0);
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
                setLiveDataMap(map);
            })
            .catch(() => { /* silent — live data is best-effort */ });
    }, []);

    // Merge live_data into venues whenever either venues or liveDataMap changes
    useEffect(() => {
        if (venues.length === 0 || Object.keys(liveDataMap).length === 0) return;
        const hasNew = venues.some(v => !v._liveMerged);
        if (!hasNew) return; // all venues already processed, stop
        setVenues(prev => prev.map(venue => {
            if (venue._liveMerged) return venue; // already processed
            const normName = (venue.name || '').toLowerCase()
                .replace(/&/g, 'and').replace(/'/g, '').replace(/-/g, ' ')
                .replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
            const liveEntry = (venue.bravo_slug && liveDataMap[venue.bravo_slug])
                || liveDataMap[normName]
                || null;
            // Always mark as merged to prevent infinite loop.
            // Only inject live_data if there are actually tables running.
            if (liveEntry && liveEntry.tables_running > 0) {
                return { ...venue, _liveMerged: true, live_data: liveEntry };
            }
            return { ...venue, _liveMerged: true };
        }));
    }, [venues, liveDataMap]); // eslint-disable-line react-hooks/exhaustive-deps


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
            .catch(() => {});
    }, []);

    // ─── Listen for review submissions to refresh review stats for that venue ───
    useEffect(() => {
        const handleReviewSubmitted = (e) => {
            const venueId = e?.detail?.venueId;
            if (!venueId) return;
            fetch('/api/poker/reviews?stats_only=true&venue_ids=' + venueId)
                .then(r => r.json())
                .then(j => { if (j.success && j.stats) setPnmReviewStatsMap(prev => ({ ...prev, ...j.stats })); })
                .catch(() => { /* silent */ });
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
            try { localStorage.setItem('pnm_tab_tutorials_seen', JSON.stringify(updated)); } catch {}
        }
    }, [currentTutorialTab, tabTutorialsSeen]);

    const handleTutorialDontShow = useCallback(() => {
        setShowTabTutorial(false);
        // Mark ALL tabs as seen
        const allSeen = { venues: true, events: true, live: true, map: true, saved: true, more: true };
        setTabTutorialsSeen(allSeen);
        try { localStorage.setItem('pnm_tab_tutorials_seen', JSON.stringify(allSeen)); } catch {}
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
                    // ENFORCE defaults on every page entry — this is the expected behavior
                    // when the Poker Near Me icon is clicked. Users can change once on the page.
                    parsed.radius = 50;
                    // ENFORCE venueType=all so tour pins + all venues always show on map
                    parsed.venueType = 'all';
                    // ENFORCE game/stakes filters so tour pins aren't accidentally filtered out
                    parsed.gameType = 'all';
                    parsed.stakes = 'all';
                    return { ...parsed };
                }
            } catch (e) { console.error(e); }
        }
        return {
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
    const allVenuesWithTours = useMemo(() => { try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const MONTHS = { Jan:0, Feb:1, Mar:2, Apr:3, May:4, Jun:5, Jul:6, Aug:7, Sep:8, Oct:9, Nov:10, Dec:11 };

        function parseStopDates(dateStr) {
            if (!dateStr) return null;
            const parts = dateStr.split(/\s*[-–]\s*/);
            function parseOne(s, fallbackMonth) {
                if (!s) return null;
                s = s.trim().replace(',', '');
                const m = s.match(/^([A-Z][a-z]{2})\s+(\d{1,2})(?:\s+(\d{4}))?/);
                if (m) {
                    const month = MONTHS[m[1]];
                    if (month === undefined) return null;
                    return new Date(m[3] ? parseInt(m[3]) : 2026, month, parseInt(m[2]));
                }
                const dayOnly = s.match(/^(\d{1,2})$/);
                if (dayOnly && fallbackMonth !== undefined) return new Date(2026, fallbackMonth, parseInt(dayOnly[1]));
                return null;
            }
            const start = parseOne(parts[0]);
            if (!start) return null;
            const end = parts.length >= 2 ? (parseOne(parts[parts.length - 1], start.getMonth()) || start) : start;
            return { start, end };
        }

        // ─── Resolve stop coordinates + host venue info by matching against real venue database ───
        // Cross-validates venue DB matches against TOUR_CITY_COORDS to catch bad data
        // Returns { lat, lng, hostLogo?, hostName? } so tour pins can render a double-icon
        function findStopCoords(stop) {
            const venueName = (stop.venue || stop.name || '').toLowerCase();
            const location = (stop.location || '').toLowerCase();
            const locationCity = location.split(',')[0]?.trim() || '';
            const locationState = location.split(',')[1]?.trim() || '';

            // Get trusted city coords for cross-validation
            const trustedCity = resolveCityCoords(stop.location || '');

            // Distance check helper — reject if >15 miles from expected city
            function isTooFar(lat, lng) {
                if (!trustedCity) return false; // no city coords = can't validate, allow it
                const dlat = (lat - trustedCity[0]) * 69;
                const dlng = (lng - trustedCity[1]) * 69 * Math.cos(trustedCity[0] * Math.PI / 180);
                return Math.sqrt(dlat * dlat + dlng * dlng) > 15;
            }

            // Helper: extract host venue metadata from a matched venue
            function withHostInfo(match) {
                return {
                    lat: match.latitude, lng: match.longitude,
                    hostLogo: match.logo_url || match.profile_photo_url || match.cover_photo_url || match.image_url || '',
                    hostName: match.name || '',
                };
            }

            // 1. Exact venue name match against real venue DB
            if (venueName.length > 2 && allVenuesForMap.length > 0) {
                let match = allVenuesForMap.find(v => v.name && v.name.toLowerCase() === venueName && v.latitude);
                if (match && !isTooFar(match.latitude, match.longitude)) {
                    return withHostInfo(match);
                }

                // 2. Partial venue name match (contains)
                if (venueName.length > 5) {
                    match = allVenuesForMap.find(v => {
                        if (!v.name || !v.latitude) return false;
                        const n = v.name.toLowerCase();
                        return n.includes(venueName) || venueName.includes(n);
                    });
                    if (match && !isTooFar(match.latitude, match.longitude)) {
                        return withHostInfo(match);
                    }
                }

                // 3. City + state match (first venue in that city)
                if (locationCity && locationState) {
                    match = allVenuesForMap.find(v =>
                        v.latitude &&
                        (v.city || '').toLowerCase() === locationCity &&
                        (v.state || '').toLowerCase() === locationState
                    );
                    if (match && !isTooFar(match.latitude, match.longitude)) {
                        return withHostInfo(match);
                    }
                }
            }

            // 4. Fallback to TOUR_CITY_COORDS hardcoded map (trusted source)
            if (trustedCity) return { lat: trustedCity[0], lng: trustedCity[1] };

            return null;
        }

        const tourPins = [];
        const seen = new Set();

        const effRad = filters.radius === 'Any' ? 5000 : Number(filters.radius || 50);
        let centerLat = null, centerLng = null;
        if (userLocation) {
            centerLat = userLocation.lat; centerLng = userLocation.lng;
        } else if (selectedCity) {
            centerLat = selectedCity.latitude; centerLng = selectedCity.longitude;
        }

        (tours || []).forEach(tour => {
            const allStops = [
                ...(tour.stops_2026 || []),
                ...(tour.series_2026 || []),
            ];

            // ─── Find current running stop or next upcoming stop (ONE per tour) ───
            let currentRunning = null;
            let nextUpcoming = null;

            for (const stop of allStops) {
                const dates = parseStopDates(stop.dates);
                if (!dates) continue;
                if (dates.start <= today && dates.end >= today) {
                    currentRunning = stop;
                }
                if (dates.start > today) {
                    if (!nextUpcoming) {
                        nextUpcoming = stop;
                    } else {
                        const existingDates = parseStopDates(nextUpcoming.dates);
                        if (existingDates && dates.start < existingDates.start) {
                            nextUpcoming = stop;
                        }
                    }
                }
            }

            const activeStop = currentRunning || nextUpcoming;
            if (!activeStop) return; // No current or upcoming stop — skip this tour

            // 30-day lookahead cap: if the tour isn't currently running,
            // only show the next-upcoming stop if it starts within 30 days.
            // Prevents events months out (e.g. August) from cluttering the map.
            if (!currentRunning && nextUpcoming) {
                const upcomingDates = parseStopDates(nextUpcoming.dates);
                if (upcomingDates) {
                    const daysAway = (upcomingDates.start - today) / (1000 * 60 * 60 * 24);
                    if (daysAway > 30) return; // Too far out — don't show on map yet
                }
            }

            // ─── Resolve coordinates using venue DB, then city map, then tour lat/lng ───
            let resolved = findStopCoords(activeStop);

            // Ultimate fallback: use lat/lng stored directly on the tour object
            if (!resolved && tour.latitude && tour.longitude) {
                resolved = { lat: tour.latitude, lng: tour.longitude };
            }

            if (!resolved) return; // Cannot resolve coordinates — skip

            let lat = resolved.lat;
            let lng = resolved.lng;

            // DISTANCE FILTER — respect radius
            let distanceMi = null;
            if (centerLat !== null && centerLng !== null) {
                const dlat = (lat - centerLat) * 69;
                const dlng = (lng - centerLng) * 69 * Math.cos(centerLat * Math.PI / 180);
                distanceMi = Math.sqrt(dlat * dlat + dlng * dlng);
                if (distanceMi > effRad) return;
            }

            // Dedupe by tour code (ONE pin per tour)
            if (seen.has(tour.tour_code)) return;
            seen.add(tour.tour_code);

            const isActive = !!currentRunning;
            const location = activeStop.location || '';
            const locParts = location.split(',');
            const city = locParts[0]?.trim() || '';
            const state = locParts[1]?.trim() || '';

            // No offset — tour pin sits directly on the host venue.
            // The double-label pill + zIndexOffset: 500 ensures the tour takes visual precedence.

            tourPins.push({
                id: `tour-stop-${tour.tour_code}`,
                name: activeStop.name || `${tour.tour_name || tour.tour_code} — ${city}`,
                stop_name: activeStop.name || activeStop.venue || '',
                stop_venue: activeStop.venue || '',
                venue_type: 'tour_stop',
                tour_code: tour.tour_code,
                tour_name: tour.tour_name || tour.tour_code,
                logo_url: tour.logo_url,
                // Host venue metadata for double-icon rendering
                host_venue_logo_url: resolved.hostLogo || '',
                host_venue_name: resolved.hostName || activeStop.venue || '',
                latitude: lat,
                longitude: lng,
                city,
                state,
                location,
                dates: activeStop.dates || '',
                buyin: activeStop.buyin,
                distance_mi: distanceMi,
                is_running: isActive,
                has_tournaments: true,
                // Lean TourCard data — only the fields TourCard.js reads, matching
                // exactly what the Tours tab passes so the card is identical.
                tour_card_data: {
                    tour_code: tour.tour_code,
                    tour_name: tour.tour_name || tour.tour_code,
                    logo_url: tour.logo_url,
                    tour_type: tour.tour_type || (isActive ? 'circuit' : 'regional'),
                    headquarters: activeStop.venue
                        ? `${activeStop.venue}${city ? ' — ' + city : ''}${state ? ', ' + state : ''}`
                        : location || '',
                    typical_buyins: tour.typical_buyins || null,
                    regions: Array.isArray(tour.regions) ? tour.regions : [],
                    established: tour.established || null,
                    upcoming_series: Array.isArray(tour.upcoming_series)
                        ? tour.upcoming_series
                        : [],
                    official_website: tour.official_website || tour.website || null,
                },
            });
        });

        // ─── Map-only suppression: venues hosted by a tour stop are hidden on the MAP
        // (so only the WSOP logo pin shows, not an overlapping plain venue dot) but they
        // still appear as a VenueCard in the card list alongside the RichTourCard.
        const consumedVenueNames = new Set();
        const consumedVenueStems = new Set();
        tourPins.forEach(tp => {
            if (tp.host_venue_name) {
                const n = tp.host_venue_name.toLowerCase();
                consumedVenueNames.add(n);
                const words = n.split(/\s+/).filter(Boolean);
                if (words.length >= 2) consumedVenueStems.add(words.slice(0, 2).join(' '));
                if (words.length >= 3) consumedVenueStems.add(words.slice(0, 3).join(' '));
            }
        });

        // --- NEW: Deduplicate charity venues so they only show ONE pin (the "next" or primary event) ---
        const charityBestIds = new Set();
        const charityGroups = new Map();

        allVenuesForMap.forEach(v => {
            if (v.venue_type === 'charity' && v.name) {
                let bn = v.name.replace(/\s*\(.*\)/g, ''); // Remove parentheticals like (CCG Poker)
                bn = bn.split(' — ')[0]; // Em dash
                bn = bn.split(' - ')[0]; // En dash / Hyphen
                bn = bn.split(' @ ')[0];
                bn = bn.toLowerCase().trim();
                
                if (!charityGroups.has(bn)) {
                    charityGroups.set(bn, []);
                }
                charityGroups.get(bn).push(v);
            }
        });

        charityGroups.forEach(group => {
            if (group.length === 1) {
                charityBestIds.add(group[0].id);
            } else {
                // Sort to pick the "best" representation — data richness wins over stub records
                const sorted = group.sort((a, b) => {
                    // 1. Prefer venues with actual scrape data (games_offered, tournament_schedule)
                    const aRich = (a.games_offered && a.games_offered.length > 0) || (a.tournament_schedule && a.tournament_schedule.length > 0);
                    const bRich = (b.games_offered && b.games_offered.length > 0) || (b.tournament_schedule && b.tournament_schedule.length > 0);
                    if (aRich && !bRich) return -1;
                    if (bRich && !aRich) return 1;
                    // 2. Prefer complete scrape_status over empty/no_data
                    const statusRank = { complete: 0, verified: 1, scraped_verified: 2, no_data: 99 };
                    const aRank = statusRank[a.scrape_status] ?? 50;
                    const bRank = statusRank[b.scrape_status] ?? 50;
                    if (aRank !== bRank) return aRank - bRank;
                    // 3. Prefer high scrape_confidence
                    const confRank = { high: 0, medium: 1, low: 2, unverified: 99 };
                    const aC = confRank[a.scrape_confidence] ?? 50;
                    const bC = confRank[b.scrape_confidence] ?? 50;
                    if (aC !== bC) return aC - bC;
                    // 4. Highest trust_score, then higher id as final tiebreaker
                    if ((b.trust_score || 0) !== (a.trust_score || 0)) return (b.trust_score || 0) - (a.trust_score || 0);
                    return b.id - a.id;
                });
                charityBestIds.add(sorted[0].id);
            }
        });
        // -------------------------------------------------------------------------------------------------

        const filteredVenues = allVenuesForMap.filter(v => {
            // Strip out parent tour/series metadata records (e.g. "Illinois Poker Championship")
            // These have coordinates but are NOT playable venues — they're tour containers
            if (v.venue_type === 'series' || v.venue_type === 'tour') return false;

            // MAP-ONLY: if this venue is the host of a tour stop, hide its plain dot on the map
            // (the WSOP logo pin already appears there). The venue card still shows in the list.
            if (v.name) {
                const vName = v.name.toLowerCase();
                const vWords = vName.split(/\s+/).filter(Boolean);
                const nameMatch = consumedVenueNames.has(vName)
                    || (vWords.length >= 2 && consumedVenueStems.has(vWords.slice(0, 2).join(' ')))
                    || (vWords.length >= 3 && consumedVenueStems.has(vWords.slice(0, 3).join(' ')));
                if (nameMatch) v.hideOnMap = true; // ← card stays, map pin removed
            }
            if (!v.hideOnMap && v.latitude && v.longitude) {
                for (const tp of tourPins) {
                    const dlat = (v.latitude - tp.latitude) * 69;
                    const dlng = (v.longitude - tp.longitude) * 69 * Math.cos(v.latitude * Math.PI / 180);
                    if (Math.sqrt(dlat * dlat + dlng * dlng) < 0.1) { v.hideOnMap = true; break; }
                }
            }

            // Charity deduplication (allow only ONE venue per charity brand)
            if (v.venue_type === 'charity' && v.id) {
                if (!charityBestIds.has(v.id)) return false;
            }
            
            // Radius filter + distance computation
            // Only enforce the radius when the user has a REAL location (GPS or city).
            // Skip enforcement when no real location is known or during global text searches.
            if (centerLat !== null && centerLng !== null && v.latitude && v.longitude) {
                const vDlat = (v.latitude - centerLat) * 69;
                const vDlng = (v.longitude - centerLng) * 69 * Math.cos(centerLat * Math.PI / 180);
                const vDist = Math.sqrt(vDlat * vDlat + vDlng * vDlng);
                v.distance_mi = vDist;
                const hasRealLoc = !!(userLocation || selectedCity);
                if (hasRealLoc && !globalSearchModeRef.current && vDist > effRad) return false;
            }
            return true;
        });
        const combined = [...filteredVenues, ...tourPins];

        // Apply UI filters to BOTH arrays here so BOTH map feeds and list feeds are correctly filtered
        return combined.filter(v => {
            // Only bypass dropdown filters during a global text search, NOT during GPS/city searches
            if (globalSearchModeRef.current && hasSearched) return true;

            const isTour = v.venue_type === 'tour_stop' || v.venue_type === 'series';

            // Venue Type filter
            if (filters.venueType && filters.venueType !== 'all') {
                if (v.venue_type !== filters.venueType) {
                    // special rule: 'card_room' filter also shows 'poker_club'
                    if (!(filters.venueType === 'card_room' && v.venue_type === 'poker_club') &&
                        !(filters.venueType === 'tour_stop' && isTour)) {
                        return false; 
                    }
                }
            }

            // Game Type filter
            if (filters.gameType === 'cash') {
                if (isTour || !(v.games_offered && v.games_offered.length > 0)) return false;
            } else if (filters.gameType === 'mtt') {
                if (!isTour && !v.has_tournaments) return false;
            } else if (filters.gameType === 'mixed') {
                if (isTour || !(v.games_offered && v.games_offered.some(g => /mixed|horse|8-game/i.test(g)))) return false;
            }

            // Stakes filter (exclude tour stops, they don't have stakes_cash)
            if (filters.stakes === '$1/2') {
                if (isTour || !(v.stakes_cash && v.stakes_cash.some(s => s.includes('1/2') || s.includes('1/3')))) return false;
            } else if (filters.stakes === '$2/5') {
                if (isTour || !(v.stakes_cash && v.stakes_cash.some(s => s.includes('2/5')))) return false;
            } else if (filters.stakes === '$5/10+') {
                if (isTour || !(v.stakes_cash && v.stakes_cash.some(s => s.includes('5/10') || s.includes('10/20') || s.includes('25/50')))) return false;
            }

            return true;
        });
    } catch (err) {
        console.error('[PNM] allVenuesWithTours crash — returning safe empty array:', err);
        return Array.isArray(allVenuesForMap) ? allVenuesForMap : [];
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [allVenuesForMap, tours, filters.radius, userLocation, selectedCity, filters.venueType, filters.gameType, filters.stakes, hasSearched]);

    // Real-time Master Saving & Bus Synchronization
    useEffect(() => {
        if (typeof window !== 'undefined') {
            localStorage.setItem('poker-near-me-search-filters', JSON.stringify(filters));
            window.dispatchEvent(new CustomEvent('poker-near-me-filters-sync', { detail: filters }));
            // Fulfill hard rule: Wire Real-Time pushes to the Global Event Bus 
            if (bus && bus.emit) bus.emit('PNM_FILTERS_UPDATED', filters);
        }
    }, [filters, bus]);

    const filtersRef = useRef(filters);
    filtersRef.current = filters;
    useEffect(() => {
        const handleSync = (e) => {
            if (e.detail && typeof window !== 'undefined') {
                const currentStr = JSON.stringify(filtersRef.current);
                const newStr = JSON.stringify(e.detail);
                if (currentStr !== newStr) {
                    setFilters(e.detail);
                }
            }
        };
        window.addEventListener('poker-near-me-filters-sync', handleSync);
        return () => window.removeEventListener('poker-near-me-filters-sync', handleSync);
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
            try { return JSON.parse(localStorage.getItem('sp-favorites') || '{}'); } catch { return {}; }
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
            } catch (e) { console.error(e); }
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
            localStorage.setItem('poker-near-me-map-filters', JSON.stringify(mapFilters));
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
        } catch (e) { /* ignore */ }
        // Fetch fresh and update cache (bust browser cache with timestamp)
        fetch('/data/all-venues.json?v=' + Date.now())
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
                } catch (e) { /* storage full, ignore */ }
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
            const json = await cachedFetch('/api/poker/live-tables');
            if (json && json.metadata && typeof json.metadata.total_tables_running === 'number') {
                setLiveTableCount(json.metadata.total_tables_running);
            }
        } catch (e) {
            /* silent fail */
        }
    }, [cachedFetch]);

    // Fetch live table count for map stats header
    useEffect(() => {
        fetchLiveCount();
    }, [fetchLiveCount]);

    // Fetch non-venue data on mount (tours, series, daily tournaments)
    // Venues are fetched AFTER GPS resolves to enforce 50mi radius default
    useEffect(() => {
        fetchAllData({ includeVenues: false });
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // When city or GPS location is set, search for venues
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
                        // Migrate to sp-user-gps for future consistency
                        localStorage.setItem('sp-user-gps', JSON.stringify({
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
                    } catch (e) { /* corrupt data */ }
                }
            }
        } catch (e) { /* ignore corrupt data */ }

        // Request fresh GPS — silent refresh if we already have saved GPS location
        // SKIP entirely if a saved city was restored (user chose a city, not GPS)
        if (!hasSavedCity && typeof navigator !== 'undefined' && navigator.geolocation) {
            setTimeout(() => {
                if (hasSavedLocation) {
                    // Silent refresh — don't show alerts, just update if GPS is available
                    navigator.geolocation.getCurrentPosition(
                        (pos) => handleGpsSuccess(pos),
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
            fetchVenues();
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

    useEffect(() => {
        if (typeof window === 'undefined') return;
        if (!userLocation) return;
        if (allVenuesForMap.length === 0) return;

        var gfService = null;

        // Dynamic import to keep SSR safe
        import('../../src/lib/geofence').then(function (mod) {
            var GeofenceService = mod.default;
            gfService = new GeofenceService();

            // Also try requesting push permission
            import('../../src/lib/pushAlerts').then(function (pushMod) {
                pushMod.requestPermission().then(function (permission) {
                    if (permission === 'denied') {
                        setGeofenceStatus('denied');
                    }
                }).catch(function () {
                    setGeofenceStatus('denied');
                });

                gfService.start(allVenuesForMap, function (venue) {
                    // Try browser notification first
                    pushMod.showVenueAlert(venue, 'checkin');
                    // Also show in-app banner
                    setGeofenceAlert(venue);
                    
                    fetch('/api/venues/record-geofence', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ venue_id: venue.id, venue_name: venue.name })
                    }).catch(console.error);
                });

                setGeofenceStatus('active');
            }).catch(function () {
                // Fallback: just in-app alerts (push not available)
                gfService.start(allVenuesForMap, function (venue) {
                    setGeofenceAlert(venue);
                    fetch('/api/venues/record-geofence', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ venue_id: venue.id, venue_name: venue.name })
                    }).catch(console.error);
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
                geofenceRef.current = null;
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
    useEffect(() => {
        if (typeof window !== 'undefined') {
            localStorage.setItem('sp-favorites', JSON.stringify(favorites));
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
                    const currentStr = JSON.stringify(favoritesRef.current);
                    if (currentStr !== e.newValue) {
                        setFavorites(newFavs);
                    }
                } catch { }
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

        const handleBusDataMutated = (event) => {
            const { entity } = event.payload || {};
            if (entity === 'live_tables' || entity === 'venues') {
                // Use ref so we always call the current fetchVenues closure (avoids stale reference)
                if (fetchVenuesRef.current) fetchVenuesRef.current({ silent: true });
                if (typeof fetchLiveCount === 'function') fetchLiveCount();
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
            .catch(() => { });
    }, []);

    // --- Auto-refresh live games when venue is selected ---
    useEffect(() => {
        if (activeTab === 'live') {
            // Pre-fetch venue list for search autocomplete
            if (liveVenueList.length === 0) fetchLiveVenueList();
            // Only auto-refresh if a venue is selected
            if (selectedLiveVenue) {
                fetchLiveGames(selectedLiveVenue.slug);
                liveRefreshRef.current = setInterval(() => fetchLiveGames(selectedLiveVenue.slug), LIVE_REFRESH_MS);
            }
        }
        return () => { if (liveRefreshRef.current) clearInterval(liveRefreshRef.current); };
    }, [activeTab, selectedLiveVenue]); // eslint-disable-line react-hooks/exhaustive-deps

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
                console.error('Error syncing favorite:', err);
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
            localStorage.setItem('sp-search-history', JSON.stringify(next));
            return next;
        });
        // Async sync to Supabase if logged in
        if (userId) {
            addSearchHistoryToDb(userId, query.trim(), {
                location: selectedCity ? selectedCity.name : null,
                filters: filters
            }).catch(() => { /* localStorage is the primary store */ });
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
                        try { localStorage.setItem('poker-near-me-search-filters', JSON.stringify(updated)); } catch (e) {}
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
    const reverseGeocode = useCallback(async (lat, lng) => {
        try {
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

    const handleGpsSuccess = useCallback((pos) => {
        setSearchQuery('');
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
        } catch (e) { /* storage full */ }
        // Re-fetch location-dependent data (daily tournaments, tours); venues handled by userLocation useEffect
        setTimeout(() => { fetchAllData({ includeVenues: false, overrideLocation: loc }); }, 0);
        // Resolve city/state asynchronously and persist label
        reverseGeocode(loc.lat, loc.lng).then(label => {
            if (label) {
                setGpsLocationLabel(label);
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
                } catch (e) { /* ignore */ }
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
            }).catch(err => console.error('Error loading venue favorites:', err));

            // Merge search history from Supabase with localStorage
            getSearchHistoryFromDb(userId, SEARCH_HISTORY_MAX).then(dbHistory => {
                if (dbHistory && dbHistory.length > 0) {
                    setSearchHistory(prev => {
                        const merged = [...new Set([...prev, ...dbHistory.map(h => h.search_query)])].slice(0, SEARCH_HISTORY_MAX);
                        localStorage.setItem('sp-search-history', JSON.stringify(merged));
                        return merged;
                    });
                }
            }).catch(() => { /* localStorage is the primary store */ });
        }
    }, [userId]);

    // Hamburger menu handlers - save to Supabase
    const updatePreference = useCallback(async (key, value) => {
        const newPrefs = { ...preferences, [key]: value };
        setPreferences(newPrefs);

        if (userId) {
            try {
                await updatePokerNearMePreferences(userId, { [key]: value });
            } catch (error) {
                console.error('Failed to save preference:', error);
            }
        }
    }, [preferences, userId]);

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
        // Always keep ref current so realtime/bus callbacks see the latest closure
        fetchVenuesRef.current = fetchVenues; // eslint-disable-line no-use-before-define
        if (!silent) setVenueLoading(true);
        setFetchError(null);
        try {
            const params = new URLSearchParams({ limit: '1000' });

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
                    const miRadius = effectiveRadius === 'Any' ? 5000 : Number(effectiveRadius);
                    params.set('radius', String(miRadius));
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
            if (fetchSequenceRef.current !== currentSeq) {
                return;
            }
            
            const data = json.data;
            let filteredData = data || [];

            setVenues(filteredData);
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
            console.error('Fetch venues error:', e);
            setFetchError('Failed to load venues. Tap to retry.');
            setVenues([]);
        }
        if (!silent) setVenueLoading(false);
    };

    const fetchTours = async (overrideLocation = null) => {
        try {
            const loc = overrideLocation || userLocation;
            const params = new URLSearchParams({ include_series: 'true', limit: '999' });
            if (filters.tourType !== 'all') {
                params.set('type', filters.tourType);
            }
            if (searchQuery) {
                params.set('search', searchQuery);
            }
            
            // Add location for distance-based sorting on the backend
            if (loc) {
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
            console.error('Fetch tours error:', e);
            setTours([]);
        }
    };

    const fetchSeries = async () => {
        try {
            const params = new URLSearchParams({ upcoming: 'true', limit: '999' });

            const today = new Date();
            const endDate = new Date();
            endDate.setDate(today.getDate() + filters.seriesTimeframe);
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
            console.error('Fetch series error:', e);
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
            console.error('Fetch daily tournaments error:', e);
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
            console.error('Fetch venue list error:', e);
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
            console.error('Fetch live games error:', e);
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
        trackSearchEvent('city_select', { city: city.name, state: city.state });
        // Persist selected city to localStorage for cross-session restoration
        try {
            localStorage.setItem('pnm_last_city', city.name);
            localStorage.setItem('pnm_last_state', city.state || '');
            localStorage.setItem('pnm_last_selected_city', JSON.stringify(city));
        } catch (e) { /* storage full */ }
    };

    const handleCityClick = (city) => {
        setSelectedCity(city);
        setUserLocation(null);
        // Persist selected city to localStorage for cross-session restoration
        try {
            localStorage.setItem('pnm_last_city', city.name);
            localStorage.setItem('pnm_last_state', city.state || '');
            localStorage.setItem('pnm_last_selected_city', JSON.stringify(city));
        } catch (e) { /* storage full */ }
    };

    // ═══ DEEP LINK PERSISTENCE: write tab + search to URL (debounced) ═══
    const deepLinkRef = useRef(null);
    const paramsAbsorbed = useRef(false);

    useEffect(() => {
        if (typeof window === 'undefined' || !router.isReady || !paramsAbsorbed.current) return;
        if (deepLinkRef.current) clearTimeout(deepLinkRef.current);
        deepLinkRef.current = setTimeout(() => {
            const params = new URLSearchParams();
            if (activeTab !== 'venues') params.set('tab', activeTab);
            if (activeTab === 'events' && activeEventTab !== 'daily') params.set('sub', activeEventTab);
            if (searchQuery) {
                params.set('q', searchQuery);
            } else if (typeof window !== 'undefined' && window.location.search.includes('q=')) {
                // Failsafe: if React state is out of sync but the URL still has ?q=, 
                // preserve it so we don't accidentally annihilate the deep link.
                const fallbackQ = new URLSearchParams(window.location.search).get('q');
                if (fallbackQ) params.set('q', fallbackQ);
            }
            if (filters.venueType !== 'all') params.set('filter', filters.venueType);
            const qs = params.toString();
            const newUrl = '/hub/poker-near-me' + (qs ? '?' + qs : '');
            
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
    }, [activeTab, activeEventTab, searchQuery, filters.venueType, router.isReady, router.asPath]); // eslint-disable-line react-hooks/exhaustive-deps

    // Read deep link params on mount (Bypass Next.js router.query hydration delays)
    useEffect(() => {
        if (typeof window === 'undefined' || paramsAbsorbed.current) return;

        // Parse native URL immediately for 100% reliable deep-linking on first load
        const searchParams = new URLSearchParams(window.location.search);
        const qParam = searchParams.get('q');
        const tabParam = searchParams.get('tab');
        const subParam = searchParams.get('sub');
        const filterParam = searchParams.get('filter');

        if (qParam) {
            setSearchQuery(qParam);
            setShowGlobalSearch(true); // Automatically open the global search modal!
        }
        
        if (tabParam) {
            // Legacy tab mapping: tours/series/daily/calendar → events + sub-tab
            const LEGACY_EVENT_TABS = { tours: 'tours', series: 'series', daily: 'daily', calendar: 'calendar' };
            if (LEGACY_EVENT_TABS[tabParam]) {
                setActiveTab('events');
                setActiveEventTab(LEGACY_EVENT_TABS[tabParam]);
            } else if (tabParam === 'favorites') {
                setActiveTab('saved');
            } else if (TAB_ORDER.includes(tabParam)) {
                setActiveTab(tabParam);
            }
        }
        
        // Read events sub-tab from URL
        if (subParam && EVENTS_SUB_TABS.includes(subParam)) {
            setActiveEventTab(subParam);
        }
        if (subParam && MORE_SUB_TABS.includes(subParam)) {
            setActiveMoreTab(subParam);
        }
        
        if (filterParam) {
            setFilters(prev => ({ ...prev, venueType: filterParam }));
        }

        // Only release the writer block once Next's router is successfully hydrated
        if (router.isReady) {
            paramsAbsorbed.current = true;
        }
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
                        setActiveTab(TAB_ORDER[currentIdx + 1]);
                    } else if (dx > 0 && currentIdx > 0) {
                        setActiveTab(TAB_ORDER[currentIdx - 1]);
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

    const handlePullEnd = useCallback(() => {
        const dist = pullDistanceRef.current;
        if (dist > 80 && !isRefreshing) {
            setIsRefreshing(true);
            setPullDistance(0);
            pullDistanceRef.current = 0;
            fetchAllData({ includeVenues: true }).finally(() => {
                setIsRefreshing(false);
            });
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
            console.error('Push permission error:', e);
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
        try { localStorage.removeItem('pnm_last_selected_city'); } catch (e) { /* */ }
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

    // Shared VenuesTabPanel JSX — single definition for 3 render paths
    const venuesTabJsx = (
        <VenuesTabPanel
            venues={allVenuesWithTours}
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
        if (activeTab === 'live') return (
            <LiveGamesFeed
                venues={allVenuesWithTours.length > 0 ? allVenuesWithTours : venues}
                userLocation={userLocation}
                favorites={favorites}
                handleToggleFavorite={(venueId, venueData) => toggleFavorite('venue', venueId, null, venueData)}
                router={router}
                openVenueModal={openVenueModal}
                setSelectedVenueForReview={setReviewVenue}
                user={user}
            />
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
                canonical="/hub/poker-near-me"
            />

            <div className="pnm-page">
                <div className="space-bg"></div>
                <div className="space-overlay"></div>

                <UniversalHeader 
                    pageDepth={1} 
                    hideLeftIcon={true}
                    onMenuClick={() => setMenuOpen(true)} 
                />

                {/* In-page back button — brushed metal style */}
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    padding: '8px 16px',
                }}>
                    <img
                        src="/images/btn-back.png"
                        alt="Back To Lobby"
                        onClick={() => window.location.href = '/hub/poker-near-me-lobby'}
                        style={{
                            height: 18,
                            cursor: 'pointer',
                            transition: 'opacity 0.15s, transform 0.15s',
                            opacity: 0.9,
                            filter: 'drop-shadow(0 2px 6px rgba(0,0,0,0.5))',
                        }}
                        onMouseOver={(e) => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.transform = 'scale(1.04)'; }}
                        onMouseOut={(e) => { e.currentTarget.style.opacity = '0.9'; e.currentTarget.style.transform = 'scale(1)'; }}
                    />
                </div>

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
                                const cleanUrl = '/hub/poker-near-me';
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
                    <h1 className="pnm-title">POKER NEAR ME</h1>
                    <p className="pnm-subtitle">
                        {dbStats.total.toLocaleString()} Venues
                        &nbsp;&bull;&nbsp;
                        {liveTableCount.toLocaleString()} Live Tables
                        &nbsp;&bull;&nbsp;
                        {dbStats.tournaments.toLocaleString()} Today&apos;s Tournaments
                    </p>
                </div>



                {/* ═══ TOP FILTER BAR: Location + Dropdowns + Apply + Live Games ═══ */}
                {(activeTab === 'map' || activeTab === 'venues') && (
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
                                    onChange={e => setFilters({ ...filters, radius: e.target.value === 'Any' ? 'Any' : Number(e.target.value) })}
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
                                    onChange={e => setFilters({ ...filters, venueType: e.target.value })}
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
                                    onChange={e => setFilters({ ...filters, gameType: e.target.value })}
                                >
                                    <option value="all">All Games</option>
                                    <option value="cash">Cash Games</option>
                                    <option value="mtt">Tournaments</option>
                                    <option value="mixed">Mixed</option>
                                </select>
                            </div>
                            <div className="pnm-filter-group">
                                <label className="pnm-filter-label">Stakes</label>
                                <select
                                    className="pnm-filter-select"
                                    value={filters.stakes}
                                    onChange={e => setFilters({ ...filters, stakes: e.target.value })}
                                >
                                    <option value="all">All Stakes</option>
                                    <option value="$1/2">$1/2</option>
                                    <option value="$2/5">$2/5</option>
                                    <option value="$5/10+">$5/10+</option>
                                </select>
                            </div>
                            {/* Live Games button */}
                            <button
                                className={'pnm-top-tab live pnm-live-games-inline' + (activeTab === 'live' ? ' active' : '')}
                                onClick={() => setActiveTab(activeTab === 'live' ? 'map' : 'live')}
                            >
                                <span className="pnm-live-dot" />
                                Live Games
                                {liveGames.length > 0 && <span className="pnm-tab-badge">{liveGames.length}</span>}
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

                        {renderContent()}

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
