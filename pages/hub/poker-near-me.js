/**
 *  POKER NEAR ME - Live Venue Finder
 * Find poker rooms, casinos, and tournaments near you
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
import useTrainingBus from '../../src/hooks/useTrainingBus';
import UniversalHeader from '../../src/components/ui/UniversalHeader';
import { useFeatureGate } from '../../src/components/gates/FeatureGatePopup';
import { supabase } from '../../src/lib/supabase';
import BottomNavBar from '../../src/components/ui/BottomNavBar';
import InteractiveTutorial, { PNM_TAB_TUTORIALS } from '../../src/components/poker-near-me/InteractiveTutorial';
const VenueCard = dynamic(() => import('../../src/components/poker-near-me/VenueCard'), { ssr: false });
const TourCard = dynamic(() => import('../../src/components/poker-near-me/TourCard'), { ssr: false });
const SeriesCard = dynamic(() => import('../../src/components/poker-near-me/SeriesCard'), { ssr: false });
const VenueMap = dynamic(() => import('../../src/components/poker-near-me/VenueMap'), { ssr: false });
const GeofenceAlertBanner = dynamic(() => import('../../src/components/poker-near-me/GeofenceAlertBanner'), { ssr: false });

// Feature #3-#15 — New feature components
const RoadTripPlanner = dynamic(() => import('../../src/components/poker-near-me/RoadTripPlanner'), { ssr: false });
const SocialLayer = dynamic(() => import('../../src/components/poker-near-me/SocialLayer'), { ssr: false });
const TournamentAlerts = dynamic(() => import('../../src/components/poker-near-me/TournamentAlerts'), { ssr: false });
const VenueReviews = dynamic(() => import('../../src/components/poker-near-me/VenueReviews'), { ssr: false });
const NearMeNowFeed = dynamic(() => import('../../src/components/poker-near-me/NearMeNowFeed'), { ssr: false });
const VoiceSearch = dynamic(() => import('../../src/components/poker-near-me/VoiceSearch'), { ssr: false });
const TripCostCalculator = dynamic(() => import('../../src/components/poker-near-me/TripCostCalculator'), { ssr: false });
const SeasonalCalendar = dynamic(() => import('../../src/components/poker-near-me/SeasonalCalendar'), { ssr: false });

import { cachedFetch, fetchWithRetry } from '../../src/components/poker-near-me/lobby/PnmApiCache';
import { MapErrorBoundary } from '../../src/components/poker-near-me/VenueMap';

// Page configuration constants
const PAGE_SIZE = 50;
const PAGE_SIZE_DAILY = 50;
const PAGE_SIZE_LIVE = 30;
const LIVE_REFRESH_MS = 120000; // 2 minutes
const SEARCH_DEBOUNCE_MS = 400;
const SEARCH_HISTORY_MAX = 8;
const DEFAULT_RADIUS_MILES = 50;

// Tab order for swipe navigation
const TAB_ORDER = ['venues', 'events', 'live', 'map', 'saved', 'more'];
const EVENTS_SUB_TABS = ['tours', 'series', 'daily', 'calendar'];

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
const TOTAL_VENUES = 525;


const VENUE_TYPE_LABELS = {
    casino: 'Casino',
    card_room: 'Card Room',
    poker_club: 'Poker Club',
    home_game: 'Home Game',
    charity: 'Charity Room'
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

function formatDate(dateStr) {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatMoney(amount) {
    if (!amount) return '';
    if (amount >= 1000000) return '$' + (amount / 1000000).toFixed(0) + 'M';
    if (amount >= 1000) return '$' + (amount / 1000).toFixed(0) + 'K';
    return '$' + amount.toLocaleString();
}

function formatGameType(raw) {
    if (!raw) return 'NLH';
    const lower = raw.toLowerCase();
    if (lower === 'holdem' || lower === 'hold\'em' || lower === 'texas hold\'em') return 'Hold\'em';
    if (lower === 'nlh' || lower === 'no limit holdem' || lower === 'no limit hold\'em') return 'NLH';
    if (lower === 'plo' || lower === 'omaha') return 'PLO';
    if (lower === 'horse') return 'HORSE';
    if (lower === 'mixed') return 'Mixed';
    if (lower === 'stud') return 'Stud';
    if (lower === 'deepstack' || lower === 'deep stack') return 'Deep Stack';
    return raw.replace(/[_-]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
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
    const bus = useTrainingBus();
    const userId = user?.id;

    // ═══ VIP ACTION GATE ═══
    const { guardAction, UpgradePopup } = useFeatureGate('poker_near_me');

    // Active tab state — persisted with sortBy and seriesViewMode
    const { filters: uiFilters, setFilter: setUiFilter } = usePersistedFilters('poker-near-me', {
        activeTab: 'venues',
        activeEventTab: 'daily',
        sortBy: 'default',
        seriesViewMode: 'grid',
        venueViewMode: 'list'
    });

    const activeTab = uiFilters.activeTab;
    const activeEventTab = uiFilters.activeEventTab || 'daily';
    const sortBy = uiFilters.sortBy;
    const seriesViewMode = uiFilters.seriesViewMode;
    const venueViewMode = uiFilters.venueViewMode || 'list';
    const setActiveTab = (val) => {
        if (typeof navigator !== 'undefined' && navigator.vibrate) {
            try { navigator.vibrate(1); } catch (e) { /* ignore */ }
        }
        setUiFilter('activeTab', val);
    };
    const setActiveEventTab = (val) => setUiFilter('activeEventTab', val);
    const setSortBy = (val) => setUiFilter('sortBy', val);
    const setSeriesViewMode = (val) => setUiFilter('seriesViewMode', val);
    const setVenueViewMode = (val) => setUiFilter('venueViewMode', val);


    // Data states
    const [venues, setVenues] = useState([]);
    const [allVenuesForMap, setAllVenuesForMap] = useState([]);
    const [tours, setTours] = useState([]);
    const [series, setSeries] = useState([]);
    const [dailyTournaments, setDailyTournaments] = useState([]);
    const [dbStats, setDbStats] = useState({ total: 0, tournaments: 0, states: 0 });

    // UI states
    const [loading, setLoading] = useState(true);
    const [venueLoading, setVenueLoading] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [userLocation, setUserLocation] = useState(null);
    const [gpsLoading, setGpsLoading] = useState(false);
    const [gpsLocationLabel, setGpsLocationLabel] = useState(null);
    const [showFilters, setShowFilters] = useState(false);
    const [selectedCity, setSelectedCity] = useState(null);
    const [nearestDistance, setNearestDistance] = useState(null);
    const [hasSearched, setHasSearched] = useState(true);

    // Geofence alert state
    const [geofenceAlert, setGeofenceAlert] = useState(null);
    const geofenceRef = useRef(null);
    const [menuOpen, setMenuOpen] = useState(false);

    // Review panel state (Feature #9)
    const [reviewVenue, setReviewVenue] = useState(null);

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

    // Intro video state - only show once per session
    const [showIntro, setShowIntro] = useState(() => {
        if (typeof window !== 'undefined') {
            return !sessionStorage.getItem('poker-near-me-intro-seen');
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
    useEffect(() => {
        if (activeTab && !tabTutorialsSeen[activeTab] && PNM_TAB_TUTORIALS[activeTab]) {
            // Small delay to let the tab content render first
            const timer = setTimeout(() => {
                setCurrentTutorialTab(activeTab);
                setShowTabTutorial(true);
            }, 500);
            return () => clearTimeout(timer);
        }
    }, [activeTab, tabTutorialsSeen]);

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
                if (saved) return JSON.parse(saved);
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

    // Real-time Master Saving & Bus Synchronization
    useEffect(() => {
        if (typeof window !== 'undefined') {
            localStorage.setItem('poker-near-me-search-filters', JSON.stringify(filters));
            window.dispatchEvent(new CustomEvent('poker-near-me-filters-sync', { detail: filters }));
        }
    }, [filters]);

    useEffect(() => {
        const handleSync = (e) => {
            if (e.detail && typeof window !== 'undefined') {
                const currentStr = JSON.stringify(filters);
                const newStr = JSON.stringify(e.detail);
                if (currentStr !== newStr) {
                    setFilters(e.detail);
                }
            }
        };
        window.addEventListener('poker-near-me-filters-sync', handleSync);
        return () => window.removeEventListener('poker-near-me-filters-sync', handleSync);
    }, [filters]);

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

    useEffect(() => {
        const handleSync = (e) => {
            if (e.detail && typeof window !== 'undefined') {
                const currentStr = JSON.stringify(mapFilters);
                const newStr = JSON.stringify(e.detail);
                if (currentStr !== newStr) {
                    setMapFilters(e.detail);
                }
            }
        };
        window.addEventListener('poker-near-me-map-filters-sync', handleSync);
        return () => window.removeEventListener('poker-near-me-map-filters-sync', handleSync);
    }, [mapFilters]);

    // Selected room for detail panel
    const [selectedRoom, setSelectedRoom] = useState(null);

    // Load all venues for the map (from static JSON) on mount — with offline cache
    useEffect(() => {
        if (typeof window === 'undefined') return;
        const CACHE_KEY = 'sp-offline-venues';
        let hadCacheHit = false;
        // Try offline cache first
        try {
            const cached = localStorage.getItem(CACHE_KEY);
            if (cached) {
                const parsed = JSON.parse(cached);
                if (parsed.venues && parsed.time && (Date.now() - parsed.time) < 3600000) { // 1hr TTL
                    setAllVenuesForMap(parsed.venues);
                    hadCacheHit = true;
                }
            }
        } catch (e) { /* ignore */ }
        // Fetch fresh and update cache
        fetch('/data/all-venues.json')
            .then(function (r) { return r.json(); })
            .then(function (json) {
                var v = json.venues || json.data || json || [];
                var arr = Array.isArray(v) ? v : [];
                setAllVenuesForMap(arr);
                // Cache for offline use
                try {
                    localStorage.setItem(CACHE_KEY, JSON.stringify({ venues: arr, time: Date.now() }));
                } catch (e) { /* storage full, ignore */ }
            })
            .catch(function () {
                // Only show error if we have no cached data at all
                if (!hadCacheHit) {
                    setFetchError('Unable to load venue data. Check your connection.');
                }
            });
    }, []);

    // Fetch ALL data on mount (venues + tours + series + daily tournaments)
    useEffect(() => {
        fetchAllData({ includeVenues: true });
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // When city or GPS location is set, search for venues
    useEffect(() => {
        if (selectedCity || userLocation) {
            setHasSearched(true);
            fetchVenues();
        }
    }, [selectedCity, userLocation]); // eslint-disable-line react-hooks/exhaustive-deps

    // Auto-refresh venues when venue-affecting filter values change
    const filterRefreshRef = useRef(null);
    useEffect(() => {
        if (!hasSearched) return;
        // Debounce to prevent rapid re-fetching during filter cascades
        if (filterRefreshRef.current) clearTimeout(filterRefreshRef.current);
        filterRefreshRef.current = setTimeout(() => {
            fetchVenues();
        }, 400);
        return () => { if (filterRefreshRef.current) clearTimeout(filterRefreshRef.current); };
    }, [filters.radius, filters.venueType, filters.hasNLH, filters.hasPLO, filters.hasMixed]); // eslint-disable-line react-hooks/exhaustive-deps

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
                });

                setGeofenceStatus('active');
            }).catch(function () {
                // Fallback: just in-app alerts (push not available)
                gfService.start(allVenuesForMap, function (venue) {
                    setGeofenceAlert(venue);
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

    // --- Merge geocoded social pages into geofence feed ---
    useEffect(() => {
        if (!venues || venues.length === 0) return;
        const socialWithCoords = venues.filter(v =>
            v.is_social_page && v.latitude && v.longitude
        );
        if (socialWithCoords.length === 0) return;

        setAllVenuesForMap(prev => {
            // Remove any previously merged social pages, then add fresh ones
            const withoutSocial = prev.filter(v => !String(v.id).startsWith('sp-'));
            return [...withoutSocial, ...socialWithCoords];
        });
    }, [venues]);

    // --- NEW: Persist favorites to localStorage + bus sync ---
    useEffect(() => {
        if (typeof window !== 'undefined') {
            localStorage.setItem('sp-favorites', JSON.stringify(favorites));
            window.dispatchEvent(new CustomEvent('poker-favorites-sync', { detail: favorites }));
        }
    }, [favorites]);

    // Listen for favorites changes from other tabs
    useEffect(() => {
        const handleFavSync = (e) => {
            if (e.detail && typeof window !== 'undefined') {
                const currentStr = JSON.stringify(favorites);
                const newStr = JSON.stringify(e.detail);
                if (currentStr !== newStr) {
                    setFavorites(e.detail);
                }
            }
        };
        window.addEventListener('poker-favorites-sync', handleFavSync);

        // Map global EventBus events to our local state
        const handleBusFavSync = (data) => {
            if (data && data.venueId) {
                setFavorites(prev => {
                    const next = { ...prev };
                    next['venue-' + data.venueId] = Date.now();
                    return next;
                });
            }
        };
        const handleBusUnfavSync = (data) => {
            if (data && data.venueId) {
                setFavorites(prev => {
                    const next = { ...prev };
                    delete next['venue-' + data.venueId];
                    return next;
                });
            }
        };

        let unsubFav, unsubUnfav;
        if (bus && bus.on) {
            unsubFav = bus.on('venue:favorite', handleBusFavSync);
            unsubUnfav = bus.on('venue:unfavorite', handleBusUnfavSync);
        }

        return () => {
            window.removeEventListener('poker-favorites-sync', handleFavSync);
            if (unsubFav) unsubFav();
            if (unsubUnfav) unsubUnfav();
        };
    }, [favorites, bus]);

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
        const key = type + '-' + id;
        const isCurrentlyFavorited = favorites[key];

        // Update local state immediately
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
                    try { bus?.emit?.('venue:unfavorite', { venueId: id }); } catch { }
                } else {
                    await addVenueFavorite(userId, id, {
                        name: itemData.name,
                        address: itemData.address,
                        city: itemData.city,
                        state: itemData.state
                    });
                    try { bus?.emit?.('venue:favorite', { venueId: id, name: itemData.name }); } catch { }
                }
            } catch (err) {
                console.error('Error syncing favorite:', err);
            }
        }
    }, [favorites, userId, bus]);

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
        if (effectiveSort === 'default') return venueList;
        const sorted = [...venueList];
        const VENUE_TYPE_ORDER = { casino: 0, card_room: 1, poker_club: 2, charity: 3, home_game: 4 };
        switch (effectiveSort) {
            case 'trust-desc': return sorted.sort((a, b) => (b.trust_score || 0) - (a.trust_score || 0));
            case 'trust-asc': return sorted.sort((a, b) => (a.trust_score || 0) - (b.trust_score || 0));
            case 'distance': return sorted.sort((a, b) => (a.distance_mi || 9999) - (b.distance_mi || 9999));
            case 'name-az': return sorted.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
            case 'name-za': return sorted.sort((a, b) => (b.name || '').localeCompare(a.name || ''));
            case 'venue-type': return sorted.sort((a, b) => (VENUE_TYPE_ORDER[a.venue_type] ?? 99) - (VENUE_TYPE_ORDER[b.venue_type] ?? 99));
            case 'state-az': return sorted.sort((a, b) => (a.state || '').localeCompare(b.state || ''));
            case 'most-tables': return sorted.sort((a, b) => (b.poker_tables || 0) - (a.poker_tables || 0));
            default: return sorted;
        }
    };

    const loadMore = (tab) => {
        setDisplayCount(prev => ({ ...prev, [tab]: prev[tab] + PAGE_SIZE }));
    };

    const isNewcomerFriendly = (venue) => {
        if (!venue) return false;
        const hasLowStakes = venue.stakes_cash && venue.stakes_cash.some(s => {
            const match = s.match(/\$?(\d+)/);
            return match && parseInt(match[1]) <= 2;
        });
        const highTrust = (venue.trust_score || 0) >= 4.0;
        const isCardRoom = venue.venue_type === 'card_room' || venue.venue_type === 'charity';
        return (hasLowStakes && highTrust) || (isCardRoom && highTrust);
    };

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
        setGpsLocationLabel('Locating...');
        setHasSearched(true);
        setDisplayCount({ venues: PAGE_SIZE, tours: PAGE_SIZE, series: PAGE_SIZE, daily: PAGE_SIZE_DAILY, live: PAGE_SIZE_LIVE });
        setTimeout(() => { fetchAllData({ includeVenues: true }); }, 0);
        setGpsLoading(false);
        // Resolve city/state asynchronously
        reverseGeocode(loc.lat, loc.lng).then(label => {
            if (label) setGpsLocationLabel(label);
            else setGpsLocationLabel(`${loc.lat.toFixed(4)}, ${loc.lng.toFixed(4)}`);
        });
    }, [reverseGeocode]); // eslint-disable-line react-hooks/exhaustive-deps

    const requestGpsLocation = () => {
        if (!navigator.geolocation) {
            alert('Geolocation is not supported by your browser');
            return;
        }
        setGpsLoading(true);
        setGpsLocationLabel('Locating...');
        // Tier 1: High accuracy (GPS/cellular)
        navigator.geolocation.getCurrentPosition(
            handleGpsSuccess,
            (highAccErr) => {
                if (highAccErr.code === 1) {
                    alert('Location access denied. Please enable location services in your browser settings.');
                    setGpsLoading(false);
                    setGpsLocationLabel(null);
                    return;
                }
                // Tier 2: Fallback to WiFi/IP-based (works on desktops)
                navigator.geolocation.getCurrentPosition(
                    handleGpsSuccess,
                    () => {
                        alert('Unable to determine your location. Please enter a city manually or try enabling location services.');
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
    }, [preferences]);

    const menuConfig = getMenuConfig('poker-near-me', null, preferences, {
        setGeofenceAlerts: (val) => updatePreference('geofenceAlerts', val),
        setLocationEnabled: (val) => updatePreference('locationEnabled', val),
        setShowNewcomerFriendly: (val) => updatePreference('showNewcomerFriendly', val),
        replayTutorial,
    });

    const fetchAllData = async ({ includeVenues = false } = {}) => {
        setLoading(true);
        const fetches = [fetchTours(), fetchSeries(), fetchDailyTournaments()];
        if (includeVenues) {
            fetches.push(fetchVenues());
        }
        await Promise.all(fetches);
        setLoading(false);
    };

    const fetchVenues = async () => {
        setVenueLoading(true);
        setFetchError(null);
        try {
            const params = new URLSearchParams({ limit: '500' });
            if (selectedCity) {
                params.set('city', selectedCity.name);
                params.set('state', selectedCity.state);
            }
            if (userLocation) {
                params.set('lat', userLocation.lat.toString());
                params.set('lng', userLocation.lng.toString());
                const kmRadius = filters.radius === 'Any' ? 5000 : Math.round(filters.radius * 1.60934);
                params.set('radius', String(kmRadius));
            }
            if (searchQuery) {
                params.set('search', searchQuery);
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

            const url = '/api/poker/venues?' + params;
            const json = await fetchWithRetry(url);
            const data = json.data;
            let filteredData = data || [];

            setVenues(filteredData);
            // Update stats from response
            if (json.total) {
                const stateSet = new Set(filteredData.map(v => v.state).filter(Boolean));
                setDbStats(prev => ({
                    ...prev,
                    total: json.total,
                    states: stateSet.size || prev.states
                }));
            }
            if (filteredData.length > 0 && filteredData[0].distance_mi) {
                setNearestDistance(filteredData[0].distance_mi);
            }
        } catch (e) {
            setLoading(false);
            console.error('Fetch venues error:', e);
            setFetchError('Failed to load venues. Tap to retry.');
            setVenues([]);
        }
        setVenueLoading(false);
    };

    const fetchTours = async () => {
        try {
            const params = new URLSearchParams({ include_series: 'true', limit: '999' });
            if (filters.tourType !== 'all') {
                params.set('type', filters.tourType);
            }
            if (searchQuery) {
                params.set('search', searchQuery);
            }

            const url = '/api/poker/tours?' + params;
            const json = await cachedFetch(url);
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
            const json = await cachedFetch(url);
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
            const json = await cachedFetch(url);
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
        e.preventDefault();
        if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
        addToSearchHistory(searchQuery);
        setShowSearchHistory(false);
        setShowCitySuggestions(false);
        setHasSearched(true);
        setShowFilters(false);
        // Reset pagination on new search
        setDisplayCount({ venues: PAGE_SIZE, tours: PAGE_SIZE, series: PAGE_SIZE, daily: PAGE_SIZE_DAILY, live: PAGE_SIZE_LIVE });
        // Track search analytics
        trackSearchEvent('search', { query: searchQuery, tab: activeTab, hasGPS: !!userLocation });
        fetchAllData({ includeVenues: true });
    };

    const handleSearchInputChange = (e) => {
        const value = e.target.value;
        setSearchQuery(value);
        if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);

        // City autocomplete — debounced to prevent jank during fast typing
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

        if (value.trim().length >= 3) {
            searchDebounceRef.current = setTimeout(() => {
                setHasSearched(true);
                setDisplayCount({ venues: PAGE_SIZE, tours: PAGE_SIZE, series: PAGE_SIZE, daily: PAGE_SIZE_DAILY, live: PAGE_SIZE_LIVE });
                trackSearchEvent('auto_search', { query: value, tab: activeTab });
                fetchAllData({ includeVenues: true });
            }, SEARCH_DEBOUNCE_MS);
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
    };

    const handleCityClick = (city) => {
        setSelectedCity(city);
        setUserLocation(null);
    };

    // ═══ DEEP LINK PERSISTENCE: write tab + search to URL (debounced) ═══
    const deepLinkRef = useRef(null);
    useEffect(() => {
        if (typeof window === 'undefined') return;
        if (deepLinkRef.current) clearTimeout(deepLinkRef.current);
        deepLinkRef.current = setTimeout(() => {
            const params = new URLSearchParams();
            if (activeTab !== 'venues') params.set('tab', activeTab);
            if (activeTab === 'events' && activeEventTab !== 'daily') params.set('sub', activeEventTab);
            if (searchQuery) params.set('q', searchQuery);
            if (filters.venueType !== 'all') params.set('filter', filters.venueType);
            const qs = params.toString();
            const newUrl = '/hub/poker-near-me' + (qs ? '?' + qs : '');
            if (router.asPath !== newUrl) {
                router.replace(newUrl, undefined, { shallow: true });
            }
        }, 500);
        return () => { if (deepLinkRef.current) clearTimeout(deepLinkRef.current); };
    }, [activeTab, activeEventTab, searchQuery, filters.venueType]); // eslint-disable-line react-hooks/exhaustive-deps

    // Read deep link params on mount (backward-compatible with legacy tab URLs)
    useEffect(() => {
        if (router.query.q) setSearchQuery(String(router.query.q));
        if (router.query.tab) {
            const tab = String(router.query.tab);
            // Legacy tab mapping: tours/series/daily/calendar → events + sub-tab
            const LEGACY_EVENT_TABS = { tours: 'tours', series: 'series', daily: 'daily', calendar: 'calendar' };
            if (LEGACY_EVENT_TABS[tab]) {
                setActiveTab('events');
                setActiveEventTab(LEGACY_EVENT_TABS[tab]);
            } else if (tab === 'favorites') {
                setActiveTab('saved');
            } else if (TAB_ORDER.includes(tab)) {
                setActiveTab(tab);
            }
        }
        // Read events sub-tab from URL
        if (router.query.sub && EVENTS_SUB_TABS.includes(router.query.sub)) {
            setActiveEventTab(String(router.query.sub));
        }
        if (router.query.filter) {
            setFilters(prev => ({ ...prev, venueType: String(router.query.filter) }));
        }
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // ═══ SWIPE GESTURE HANDLERS ═══
    const handleTouchStart = useCallback((e) => {
        touchStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, time: Date.now() };
        touchEndRef.current = null;
    }, []);

    const handleTouchMove = useCallback((e) => {
        touchEndRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    }, []);

    const handleTouchEnd = useCallback(() => {
        if (!touchStartRef.current || !touchEndRef.current) return;
        const dx = touchEndRef.current.x - touchStartRef.current.x;
        const dy = touchEndRef.current.y - touchStartRef.current.y;
        const elapsed = Date.now() - touchStartRef.current.time;
        // Must be a horizontal swipe: fast, horizontal dominant, > 80px
        if (Math.abs(dx) > 80 && Math.abs(dx) > Math.abs(dy) * 1.5 && elapsed < 500) {
            // For swiping at the main level
            const currentIdx = TAB_ORDER.indexOf(activeTab);
            if (currentIdx !== -1) {
                if (dx < 0 && currentIdx < TAB_ORDER.length - 1) {
                    setActiveTab(TAB_ORDER[currentIdx + 1]);
                } else if (dx > 0 && currentIdx > 0) {
                    setActiveTab(TAB_ORDER[currentIdx - 1]);
                }
            } else if (activeTab === 'events') {
                // Nested swiping within events tab
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
            }
        }
        touchStartRef.current = null;
        touchEndRef.current = null;
    }, [activeTab]);

    // ═══ PULL-TO-REFRESH ═══
    const pullDistanceRef = useRef(0);
    const handlePullStart = useCallback((e) => {
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
    // Realtime subscription — live updates
    useEffect(() => {
        if (!user?.id) return;
        const _ch = supabase
            .channel(`pnm:${user?.id}`)
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'tables' }, () => { fetchAllData({ includeVenues: true }); })
            .subscribe();
        return () => { supabase.removeChannel(_ch); };
    }, [user?.id]);

    const requestPushPermission = useCallback(async () => {
        const controller = new AbortController();
        const { signal } = controller;
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

    // ═══ FAVORITES TAB RENDERER ═══
    const renderFavorites = () => {
        const favVenues = (allVenuesForMap.length > 0 ? allVenuesForMap : venues).filter(v => isFavorited('venue', v.id));
        const favCount = Object.keys(favorites).filter(k => favorites[k]).length;

        if (favCount === 0) {
            return (
                <div className="empty-state" style={{ padding: '60px 20px', background: 'radial-gradient(circle at center, rgba(239,68,68,0.05) 0%, transparent 70%)' }}>
                    <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'rgba(239,68,68,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
                        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2">
                            <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" />
                        </svg>
                    </div>
                    <h3 style={{ fontSize: 20, fontWeight: 700, color: '#fff', marginBottom: 8 }}>Your Saved Venues</h3>
                    <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.6)', maxWidth: 320, lineHeight: 1.5, margin: '0 auto 24px' }}>Keep Track Of Your Favorite Card Rooms, Local Games, And Regular Stops. Tap The Heart Icon On Any Venue Card To Save It Here.</p>
                    <button onClick={() => setActiveTab('venues')} className="primary-btn" style={{ background: '#ef4444', color: '#fff', border: 'none', padding: '12px 24px', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer', boxShadow: '0 4px 14px rgba(239,68,68,0.3)' }}>Explore Venues</button>
                </div>
            );
        }

        return (
            <>
                <div className="results-bar">
                    <span className="results-count">{favVenues.length} saved venue{favVenues.length !== 1 ? 's' : ''}</span>
                </div>
                <div className="card-grid">
                    {favVenues.map((venue, i) => {
                        const maxGtd = venueMaxGtd[String(venue.id)] || 0;
                        return (
                            <VenueCard
                                key={venue.id || i}
                                venue={{ ...venue, max_gtd: maxGtd }}
                                index={i}
                                isFavorited={true}
                                isNewcomer={isNewcomerFriendly(venue)}
                                onFavorite={(e) => toggleFavorite('venue', venue.id, e, venue)}
                                onNavigate={(path) => router.push(path)}
                            />
                        );
                    })}
                </div>
            </>
        );
    };

    const clearFilters = () => {
        setSelectedCity(null);
        setUserLocation(null);
        setGpsLocationLabel(null);
        setSearchQuery('');
        setHasSearched(false);
        setVenues([]);
        setShowCitySuggestions(false);
        setFetchError(null);
        setNearestDistance(null);
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
    };

    // Get counts for tabs
    const getCounts = () => ({
        venues: venues.length,
        tours: tours.length,
        series: series.length,
        daily: dailyTournaments.length,
        live: liveGames.length
    });

    const counts = getCounts();

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
    const renderContent = () => {
        if (activeTab === 'map') return renderMap();
        if (activeTab === 'live') return renderLiveGames();
        if (activeTab === 'saved') return renderFavorites();

        // For venues tab: show search landing if no search yet, skip skeleton
        if (activeTab === 'venues' && !hasSearched) return renderVenues();

        // Show loading — skeletons for all data-driven tabs
        if ((activeTab === 'venues' && venueLoading) || loading) {
            return renderSkeletons(activeTab === 'events' ? 6 : 8);
        }

        switch (activeTab) {
            case 'venues':
                return renderVenues();
            case 'events':
                switch (activeEventTab) {
                    case 'tours': return renderTours();
                    case 'series': return renderSeries();
                    case 'calendar': return <SeasonalCalendar series={series} tours={tours} dailyTournaments={dailyTournaments} />;
                    case 'daily':
                    default:
                        return renderDailyTournaments();
                }
            case 'more':
                return (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, padding: '20px 0' }}>
                        <div onClickCapture={(e) => {
                            if (!guardAction(() => {})) {
                                e.stopPropagation();
                                e.preventDefault();
                            }
                        }}>
                            <RoadTripPlanner venues={allVenuesForMap.length > 0 ? allVenuesForMap : venues} userLocation={userLocation} dailyTournaments={dailyTournaments} series={series} />
                        </div>
                        <SocialLayer userId={userId} userLocation={userLocation} venues={allVenuesForMap.length > 0 ? allVenuesForMap : venues} authToken={user?.access_token} />
                        <TournamentAlerts dailyTournaments={dailyTournaments} userId={userId} authToken={user?.access_token} />
                        <NearMeNowFeed userLocation={userLocation} venues={allVenuesForMap.length > 0 ? allVenuesForMap : venues} />
                        <div onClickCapture={(e) => {
                            if (!guardAction(() => {})) {
                                e.stopPropagation();
                                e.preventDefault();
                            }
                        }}>
                            <TripCostCalculator venues={allVenuesForMap.length > 0 ? allVenuesForMap : venues} userLocation={userLocation} />
                        </div>
                    </div>
                );
            default:
                return renderVenues();
        }
    };

    const renderMap = () => {
        // Use searched venues if a search/GPS is active, otherwise fallback to all venues
        let baseVenues = (hasSearched && venues.length > 0) ? venues : allVenuesForMap;
        let filteredVenues = baseVenues;
        if (mapFilters.cashGames) {
            filteredVenues = filteredVenues.filter(v => v.games_offered && v.games_offered.length > 0);
        }
        if (mapFilters.tournaments) {
            filteredVenues = filteredVenues.filter(v => v.has_tournaments);
        }
        if (mapFilters.is24Hours) {
            filteredVenues = filteredVenues.filter(v => !['charity', 'home_game'].includes(v.venue_type) && (v.is_24_hours || (v.hours_of_operation && v.hours_of_operation.includes('24'))));
        }
        if (mapFilters.lowStakes) {
            filteredVenues = filteredVenues.filter(v => v.stakes_cash && v.stakes_cash.some(s => {
                const match = s.match(/\$?(\d+)/);
                return match && parseInt(match[1]) <= 2;
            }));
        }
        if (mapFilters.topRated) {
            filteredVenues = filteredVenues.filter(v => (v.trust_score || 0) >= 4.0);
        }

        // Apply sidebar filters
        if (filters.gameType === 'cash') {
            filteredVenues = filteredVenues.filter(v => v.games_offered && v.games_offered.length > 0);
        } else if (filters.gameType === 'mtt') {
            filteredVenues = filteredVenues.filter(v => v.has_tournaments);
        } else if (filters.gameType === 'mixed') {
            filteredVenues = filteredVenues.filter(v => v.games_offered && v.games_offered.some(g => /mixed|horse|8-game/i.test(g)));
        }

        if (filters.stakes === '$1/2') {
            filteredVenues = filteredVenues.filter(v => v.stakes_cash && v.stakes_cash.some(s => s.includes('1/2') || s.includes('1/3')));
        } else if (filters.stakes === '$2/5') {
            filteredVenues = filteredVenues.filter(v => v.stakes_cash && v.stakes_cash.some(s => s.includes('2/5')));
        } else if (filters.stakes === '$5/10+') {
            filteredVenues = filteredVenues.filter(v => v.stakes_cash && v.stakes_cash.some(s => s.includes('5/10') || s.includes('10/20') || s.includes('25/50')));
        }

        const toggleMapFilter = (key) => {
            setMapFilters(prev => ({ ...prev, [key]: !prev[key] }));
        };

        return (
            <div className="map-desktop-layout">
                {/* LEFT COLUMN: Map Section */}
                <div className="map-main-section">
                    {/* Header Row */}
                    <div className="map-header-row">
                        <h2 className="map-title">Poker Rooms Near You</h2>
                        <span className="map-stats">{filteredVenues.length} rooms • {liveGames.length} active tables • {dailyTournaments.length} tournaments today</span>
                    </div>

                    {/* Quick Filter Chips */}
                    <div className="map-filter-chips">
                        <button className={'filter-chip' + (mapFilters.cashGames ? ' active' : '')} onClick={() => toggleMapFilter('cashGames')}>
                            <span className="chip-dot cash"></span> Cash Games
                        </button>
                        <button className={'filter-chip' + (mapFilters.tournaments ? ' active' : '')} onClick={() => toggleMapFilter('tournaments')}>
                            <span className="chip-dot mtt"></span> Tournaments
                        </button>
                        <button className={'filter-chip' + (mapFilters.is24Hours ? ' active' : '')} onClick={() => toggleMapFilter('is24Hours')}>
                            <span className="chip-dot live"></span> 24/7 Open
                        </button>
                        <button className={'filter-chip' + (mapFilters.lowStakes ? ' active' : '')} onClick={() => toggleMapFilter('lowStakes')}>
                            <span className="chip-dot stakes"></span> Low Stakes
                        </button>
                        <button className={'filter-chip' + (mapFilters.topRated ? ' active' : '')} onClick={() => toggleMapFilter('topRated')}>
                            <span className="chip-dot rated"></span> Top Rated
                        </button>
                    </div>

                    {/* Map Container - wrapped in Error Boundary */}
                    <MapErrorBoundary>
                        <VenueMap
                            key={filteredVenues.length + '-' + (filteredVenues[0]?.id || 'none') + '-' + (filteredVenues[filteredVenues.length - 1]?.id || 'none')}
                            venues={filteredVenues}
                            userLocation={userLocation}
                        />
                    </MapErrorBoundary>

                    {/* Recenter Button */}
                    {userLocation && (
                        <button className="map-recenter-btn" onClick={requestGpsLocation} aria-label="Recenter on my location">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <circle cx="12" cy="12" r="3" />
                                <path d="M12 2v4M12 18v4M2 12h4M18 12h4" />
                            </svg>
                            My Location
                        </button>
                    )}

                    {/* Room List Below Map */}
                    <div className="map-room-list">
                        <h3 className="room-list-title">Closest Poker Rooms</h3>
                        <div className="room-list-grid">
                            {filteredVenues.slice(0, 6).map((venue, i) => (
                                <div key={venue.id || i} className="room-list-card" onClick={() => setSelectedRoom(venue)}>
                                    <div className="room-card-header">
                                        <span className="room-name">{venue.name}</span>
                                        <span className="room-hours">{venue.is_24_hours ? '24/7' : venue.hours_of_operation || '—'}</span>
                                    </div>
                                    <div className="room-card-location">
                                        {venue.city}, {venue.state}
                                        {venue.distance_mi && <span className="room-distance"> • {venue.distance_mi.toFixed(1)} mi</span>}
                                    </div>
                                    <div className="room-card-tags">
                                        {venue.venue_type && <span className="room-tag">{VENUE_TYPE_LABELS[venue.venue_type] || venue.venue_type}</span>}
                                        {venue.has_tournaments && <span className="room-tag"> • Tournaments</span>}
                                        {venue.games_offered && venue.games_offered.length > 0 && <span className="room-tag"> • {venue.games_offered.slice(0, 3).join(', ')}</span>}
                                    </div>
                                    <button className="room-view-btn" onClick={(e) => { e.stopPropagation(); router.push(venue.is_social_page ? `/club/${venue.social_page_id}` : `/hub/venues/${venue.id}`); }}>View Room</button>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* RIGHT COLUMN: Sidebar Filters + Room Detail */}
                <div className="map-sidebar">
                    <div className="sidebar-filters">
                        <h3 className="sidebar-title">Filters</h3>

                        {/* Game Type */}
                        <div className="sidebar-filter-group">
                            <label className="sidebar-label">Game Type</label>
                            <div className="sidebar-chips">
                                {['all', 'Cash', 'MTT', 'Mixed'].map(type => (
                                    <button
                                        key={type}
                                        className={'sidebar-chip' + (filters.gameType === type.toLowerCase() ? ' active' : '')}
                                        onClick={() => setFilters(p => ({ ...p, gameType: type.toLowerCase() }))}
                                    >{type === 'all' ? 'All' : type}</button>
                                ))}
                            </div>
                        </div>

                        {/* Stakes */}
                        <div className="sidebar-filter-group">
                            <label className="sidebar-label">Stakes</label>
                            <div className="sidebar-chips">
                                {['all', '$1/2', '$2/5', '$5/10+'].map(stake => (
                                    <button
                                        key={stake}
                                        className={'sidebar-chip' + (filters.stakes === stake ? ' active' : '')}
                                        onClick={() => setFilters(p => ({ ...p, stakes: stake }))}
                                    >{stake === 'all' ? 'All' : stake}</button>
                                ))}
                            </div>
                        </div>

                        {/* Buy-in Range */}
                        <div className="sidebar-filter-group">
                            <label className="sidebar-label">Buy-In Range</label>
                            <div className="sidebar-range-inputs">
                                <input
                                    type="number"
                                    placeholder="Min"
                                    className="sidebar-input"
                                    value={filters.minBuyin}
                                    onChange={e => setFilters(p => ({ ...p, minBuyin: e.target.value }))}
                                />
                                <span className="range-divider">—</span>
                                <input
                                    type="number"
                                    placeholder="Max"
                                    className="sidebar-input"
                                    value={filters.maxBuyin}
                                    onChange={e => setFilters(p => ({ ...p, maxBuyin: e.target.value }))}
                                />
                            </div>
                        </div>

                        {/* Amenities group completely removed per Real Filters mandate */}

                        <button className="sidebar-apply-btn" onClick={() => {
                            setHasSearched(true);
                            fetchAllData({ includeVenues: true });
                        }}>
                            Apply Filters
                        </button>
                    </div>

                    {/* Room Detail Panel */}
                    {selectedRoom && (
                        <div className="room-detail-panel">
                            <div className="detail-header">
                                <h3>{selectedRoom.name}</h3>
                                <button className="detail-close" onClick={() => setSelectedRoom(null)}>×</button>
                            </div>
                            <p className="detail-location">{selectedRoom.city}, {selectedRoom.state}</p>
                            <button className="detail-view-btn" onClick={() => router.push(selectedRoom.is_social_page ? `/club/${selectedRoom.social_page_id}` : `/hub/venues/${selectedRoom.id}`)}>View Full Details</button>
                        </div>
                    )}
                </div>
            </div>
        );
    };

    const renderVenues = () => {
        // Always show venues — no gate

        if (venues.length === 0 && !venueLoading && !loading) {
            return (
                <div className="empty-state">
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="1.5"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" /><polyline points="9 22 9 12 15 12 15 22" /></svg>
                    <p>No Venues Found Matching Your Criteria</p>
                    <p style={{ fontSize: 13, opacity: 0.5, marginTop: 4 }}>Try A Different City, Adjust Filters, Or Use GPS</p>
                    <button onClick={clearFilters}>Clear All Filters</button>
                </div>
            );
        }

        const sorted = getSortedVenues(venues);
        const displayed = sorted.slice(0, displayCount.venues);

        return (
            <>
                {/* Results count bar */}
                <div className="results-bar">
                    <span className="results-count">{venues.length} result{venues.length !== 1 ? 's' : ''} found{userLocation && sortBy === 'default' ? ' (sorted by distance)' : ''}</span>
                </div>

                {/* ═══ DUAL VIEW: Cards + Map ═══ */}
                <div className="dual-view-layout">
                    {/* LEFT: Venue Cards */}
                    <div className="dual-view-list">
                        <div className="card-grid">
                            {displayed.map((venue, i) => {
                                const maxGtd = venueMaxGtd[String(venue.id)] || 0;
                                return (
                                    <VenueCard
                                        key={venue.id || i}
                                        venue={{ ...venue, max_gtd: maxGtd }}
                                        index={i}
                                        isFavorited={isFavorited('venue', venue.id)}
                                        isNewcomer={isNewcomerFriendly(venue)}
                                        hasPromo={promotionVenueIds.has(String(venue.id))}
                                        onFavorite={(e) => toggleFavorite('venue', venue.id, e, venue)}
                                        onNavigate={(path) => router.push(path)}
                                    />
                                );
                            })}
                        </div>
                        {/* Load More */}
                        {displayCount.venues < venues.length && (
                            <div className="load-more">
                                <button className="load-more-btn" onClick={() => loadMore('venues')}>
                                    Show More Results ({venues.length - displayed.length} more)
                                </button>
                            </div>
                        )}
                    </div>

                    {/* RIGHT: Interactive Map */}
                    <div className="dual-view-map">
                        <div className="dual-map-header">
                            <h3 className="dual-map-title">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#d4a853" strokeWidth="2"><polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" /><line x1="8" y1="2" x2="8" y2="18" /><line x1="16" y1="6" x2="16" y2="22" /></svg>
                                Map View
                            </h3>
                            <span className="dual-map-count">{sorted.length} pins</span>
                        </div>
                        <MapErrorBoundary>
                            <VenueMap
                                key={'dual-' + sorted.length + '-' + (sorted[0]?.id || 'none')}
                                venues={sorted}
                                userLocation={userLocation}
                            />
                        </MapErrorBoundary>
                        {userLocation && (
                            <button className="map-recenter-btn" onClick={requestGpsLocation} aria-label="Recenter on my location" style={{ marginTop: 8 }}>
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <circle cx="12" cy="12" r="3" />
                                    <path d="M12 2v4M12 18v4M2 12h4M18 12h4" />
                                </svg>
                                My Location
                            </button>
                        )}
                    </div>
                </div>
            </>
        );
    };

    const renderTours = () => {
        const tourSearchVal = filters.hubTourSearch || '';
        const tourStateVal = filters.hubTourState || 'all';
        let filteredTours = tours;
        if (tourSearchVal) {
            const lower = tourSearchVal.toLowerCase();
            filteredTours = filteredTours.filter(t => (t.name || '').toLowerCase().includes(lower) || (t.city || '').toLowerCase().includes(lower) || (t.state || '').toLowerCase().includes(lower) || (t.tour_code || '').toLowerCase().includes(lower));
        }
        if (tourStateVal !== 'all') {
            filteredTours = filteredTours.filter(t => t.state === tourStateVal);
        }

        return (
            <>
                {/* Search + State Filter */}
                <div style={{ display: 'flex', gap: 8, marginBottom: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                    <input type="text" placeholder="Search tours..." value={tourSearchVal}
                        onChange={(e) => setFilters(f => ({ ...f, hubTourSearch: e.target.value }))}
                        style={{ flex: 1, minWidth: 140, padding: '8px 12px', borderRadius: 8, border: '1px solid rgba(212,168,83,0.25)', background: 'rgba(0,0,0,0.3)', color: '#e0e8f0', fontSize: 13, fontFamily: 'inherit' }} />
                    <select value={tourStateVal}
                        onChange={(e) => setFilters(f => ({ ...f, hubTourState: e.target.value }))}
                        className="sort-select" style={{ minWidth: 100 }}>
                        <option value="all">All States</option>
                        {['AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY','DC'].map(st => (
                            <option key={st} value={st}>{st}</option>
                        ))}
                    </select>
                </div>
                <div className="results-bar">
                    <span className="results-count"><span style={{ color: '#d4a853', fontWeight: 800 }}>{filteredTours.length}</span> tour{filteredTours.length !== 1 ? 's' : ''}</span>
                </div>
                {filteredTours.length === 0 ? (
                    <div className="empty-state">
                        <p>No Matching Tours</p>
                        <p style={{ fontSize: 13, opacity: 0.5, marginTop: 4 }}>{tourSearchVal || tourStateVal !== 'all' ? 'Try adjusting your search or filters.' : 'Check back soon for poker tour schedules.'}</p>
                        <button onClick={() => setFilters(f => ({ ...f, hubTourSearch: '', hubTourState: 'all' }))}>Clear Tour Filters</button>
                    </div>
                ) : (
                    <>
                        <div className="card-grid tours-grid">
                            {filteredTours.slice(0, displayCount.tours).map((tour, i) => (
                                <TourCard
                                    key={tour.tour_code || i}
                                    tour={tour}
                                    isFavorited={isFavorited('tour', tour.tour_code)}
                                    onFavorite={(e) => toggleFavorite('tour', tour.tour_code, e)}
                                    onNavigate={(path) => router.push(path)}
                                />
                            ))}
                        </div>
                        {displayCount.tours < filteredTours.length && (
                            <div className="load-more">
                                <button className="load-more-btn" onClick={() => loadMore('tours')}>
                                    Load More ({filteredTours.length - displayCount.tours} remaining)
                                </button>
                            </div>
                        )}
                    </>
                )}
            </>
        );
    };

    const renderSeries = () => {
        const seriesSearchVal = filters.hubSeriesSearch || '';
        const seriesStateVal = filters.hubSeriesState || 'all';
        let filteredSeries = series;
        if (seriesSearchVal) {
            const lower = seriesSearchVal.toLowerCase();
            filteredSeries = filteredSeries.filter(s => (s.name || '').toLowerCase().includes(lower) || (s.city || '').toLowerCase().includes(lower) || (s.state || '').toLowerCase().includes(lower) || (s.series_code || '').toLowerCase().includes(lower));
        }
        if (seriesStateVal !== 'all') {
            filteredSeries = filteredSeries.filter(s => s.state === seriesStateVal);
        }

        return (
            <>
                {/* Search + State Filter */}
                <div style={{ display: 'flex', gap: 8, marginBottom: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                    <input type="text" placeholder="Search series..." value={seriesSearchVal}
                        onChange={(e) => setFilters(f => ({ ...f, hubSeriesSearch: e.target.value }))}
                        style={{ flex: 1, minWidth: 140, padding: '8px 12px', borderRadius: 8, border: '1px solid rgba(212,168,83,0.25)', background: 'rgba(0,0,0,0.3)', color: '#e0e8f0', fontSize: 13, fontFamily: 'inherit' }} />
                    <select value={seriesStateVal}
                        onChange={(e) => setFilters(f => ({ ...f, hubSeriesState: e.target.value }))}
                        className="sort-select" style={{ minWidth: 100 }}>
                        <option value="all">All States</option>
                        {['AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY','DC'].map(st => (
                            <option key={st} value={st}>{st}</option>
                        ))}
                    </select>
                </div>
                <div className="results-bar">
                    <span className="results-count"><span style={{ color: '#d4a853', fontWeight: 800 }}>{filteredSeries.length}</span> series</span>
                    <div className="view-toggle">
                        <button className={'view-btn' + (seriesViewMode === 'grid' ? ' active' : '')} onClick={() => setSeriesViewMode('grid')}>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /></svg>
                            Grid
                        </button>
                        <button className={'view-btn' + (seriesViewMode === 'calendar' ? ' active' : '')} onClick={() => setSeriesViewMode('calendar')}>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
                            Calendar
                        </button>
                    </div>
                </div>

                {filteredSeries.length === 0 ? (
                    <div className="empty-state">
                        <p>No Matching Series</p>
                        <p style={{ fontSize: 13, opacity: 0.5, marginTop: 4 }}>{seriesSearchVal || seriesStateVal !== 'all' ? 'Try adjusting your search or filters.' : 'Check back soon for poker series.'}</p>
                        <button onClick={() => setFilters(f => ({ ...f, hubSeriesSearch: '', hubSeriesState: 'all' }))}>Clear Series Filters</button>
                    </div>
                ) : seriesViewMode === 'calendar' ? renderSeriesCalendar() : (
                    <>
                        <div className="card-grid">
                            {filteredSeries.slice(0, displayCount.series).map((s, i) => (
                                <SeriesCard
                                    key={s.id || i}
                                    series={s}
                                    index={i}
                                    isFavorited={isFavorited('series', s.id || (i + 1))}
                                    onFavorite={(e) => toggleFavorite('series', s.id || (i + 1), e)}
                                    onNavigate={(path) => router.push(path)}
                                />
                            ))}
                        </div>
                        {displayCount.series < filteredSeries.length && (
                            <div className="load-more">
                                <button className="load-more-btn" onClick={() => loadMore('series')}>
                                    Load More ({filteredSeries.length - displayCount.series} remaining)
                                </button>
                            </div>
                        )}
                    </>
                )}
            </>
        );
    };

    const renderDailyTournaments = () => {
        // Local filter state for daily tournaments on hub page
        const dtGameType = filters.hubDailyGameType || 'all';
        const dtMinBuyin = filters.hubDailyMinBuyin || '';
        const dtMaxBuyin = filters.hubDailyMaxBuyin || '';
        const dtMinGtd = filters.hubDailyMinGtd || '';
        const dtSort = filters.hubDailySort || 'time';

        // Apply client-side filters
        let filtered = dailyTournaments;
        if (dtGameType !== 'all') {
            filtered = filtered.filter(t => {
                const gt = (t.game_type || '').toLowerCase();
                if (dtGameType === 'nlh') return gt.includes('nlh') || gt.includes('hold') || gt.includes('holdem') || gt === 'no limit holdem';
                if (dtGameType === 'plo') return gt.includes('plo') || gt.includes('omaha hi-lo') || gt.includes('pot limit omaha');
                if (dtGameType === 'mixed') return gt.includes('mix') || gt.includes('horse') || gt.includes('dealer');
                if (dtGameType === 'omaha') return gt.includes('omaha') && !gt.includes('hi-lo');
                return true;
            });
        }
        if (dtMinBuyin) filtered = filtered.filter(t => (t.buy_in || 0) >= Number(dtMinBuyin));
        if (dtMaxBuyin) filtered = filtered.filter(t => (t.buy_in || 0) <= Number(dtMaxBuyin));
        if (dtMinGtd) filtered = filtered.filter(t => (t.guaranteed || 0) >= Number(dtMinGtd));

        // Sort
        if (dtSort === 'buyin') filtered = [...filtered].sort((a, b) => (a.buy_in || 0) - (b.buy_in || 0));
        else if (dtSort === 'guaranteed') filtered = [...filtered].sort((a, b) => (b.guaranteed || 0) - (a.guaranteed || 0));

        return (
            <>
                {/* Day selector */}
                <div className="day-selector">
                    {DAYS_OF_WEEK.map(day => (
                        <button
                            key={day}
                            className={'day-btn' + (filters.selectedDay === day ? ' active' : '')}
                            onClick={() => {
                                setFilters({ ...filters, selectedDay: day });
                                fetchDailyTournaments(day);
                            }}
                        >
                            {day.slice(0, 3)}
                        </button>
                    ))}
                </div>

                {/* Game type chips */}
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
                    {[{ key: 'all', label: 'All Games' }, { key: 'nlh', label: 'NLH' }, { key: 'plo', label: 'PLO' }, { key: 'mixed', label: 'Mixed' }, { key: 'omaha', label: 'Omaha' }].map(g => (
                        <button key={g.key}
                            onClick={() => setFilters(f => ({ ...f, hubDailyGameType: g.key }))}
                            style={{ padding: '5px 14px', borderRadius: 20, fontSize: 12, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer', border: dtGameType === g.key ? '1px solid #d4a853' : '1px solid rgba(255,255,255,0.15)', background: dtGameType === g.key ? 'rgba(212,168,83,0.2)' : 'rgba(255,255,255,0.05)', color: dtGameType === g.key ? '#d4a853' : 'rgba(255,255,255,0.6)' }}
                        >{g.label}</button>
                    ))}
                </div>

                {/* Buy-in range + GTD + Sort */}
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12, alignItems: 'center' }}>
                    <input type="number" placeholder="Min $" value={dtMinBuyin}
                        onChange={(e) => setFilters(f => ({ ...f, hubDailyMinBuyin: e.target.value }))}
                        style={{ width: 70, padding: '5px 8px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(0,0,0,0.3)', color: '#e0e8f0', fontSize: 12, fontFamily: 'inherit' }} />
                    <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: 12 }}>to</span>
                    <input type="number" placeholder="Max $" value={dtMaxBuyin}
                        onChange={(e) => setFilters(f => ({ ...f, hubDailyMaxBuyin: e.target.value }))}
                        style={{ width: 70, padding: '5px 8px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(0,0,0,0.3)', color: '#e0e8f0', fontSize: 12, fontFamily: 'inherit' }} />
                    <input type="number" placeholder="Min GTD" value={dtMinGtd}
                        onChange={(e) => setFilters(f => ({ ...f, hubDailyMinGtd: e.target.value }))}
                        style={{ width: 80, padding: '5px 8px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(0,0,0,0.3)', color: '#e0e8f0', fontSize: 12, fontFamily: 'inherit' }} />
                    <select value={dtSort}
                        onChange={(e) => setFilters(f => ({ ...f, hubDailySort: e.target.value }))}
                        className="sort-select" style={{ fontSize: 12 }}>
                        <option value="time">Start Time</option>
                        <option value="buyin">Buy-In</option>
                        <option value="guaranteed">Guaranteed</option>
                    </select>
                </div>

                {/* Result count */}
                <div className="results-bar" style={{ marginBottom: 8 }}>
                    <span className="results-count"><span style={{ color: '#d4a853', fontWeight: 800 }}>{filtered.length}</span> tournament{filtered.length !== 1 ? 's' : ''}</span>
                </div>

                {filtered.length === 0 ? (
                    <div className="empty-state">
                        <p>No daily tournaments match your filters for {filters.selectedDay}</p>
                        <button onClick={() => setFilters(f => ({ ...f, hubDailyGameType: 'all', hubDailyMinBuyin: '', hubDailyMaxBuyin: '', hubDailyMinGtd: '' }))}>Clear Daily Filters</button>
                    </div>
                ) : (
                    <div className="card-grid daily-grid">
                        {filtered.slice(0, 50).map((t, i) => (
                            <div key={t.id || i} className="entity-card daily-card">
                                <div className="card-header">
                                    <span className="time-badge">{t.start_time}</span>
                                    <span className="badge game-type">{formatGameType(t.game_type)}</span>
                                </div>
                                <h4>{t.venue_name}</h4>
                                {(t.city || t.state) && <p className="card-location">{[t.city, t.state].filter(Boolean).join(', ')}</p>}
                                <div className="card-tags">
                                    <span className="tag buyin">${t.buy_in}</span>
                                    {t.guaranteed && <span className="tag gtd">{formatMoney(t.guaranteed)} GTD</span>}
                                    {t.format && <span className="tag format">{t.format}</span>}
                                </div>
                                {t.tournament_name && (
                                    <p className="card-detail">{t.tournament_name}</p>
                                )}
                                <div className="card-footer">
                                    {t.venueType && t.venueType !== 'Unknown' && <span className="venue-type">{t.venueType.replace(/[_-]/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}</span>}
                                    {t.pokerAtlasUrl && (
                                        <a href={t.pokerAtlasUrl} target="_blank" rel="noopener noreferrer" className="action-btn primary">
                                            Info
                                        </a>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </>
        );
    };

    // --- Live Games Renderer (Search-First) ---
    const renderLiveGames = () => {
        const totalTables = liveGames.reduce((sum, g) => sum + (g.table_count || 0), 0);

        return (
            <>
                {/* Search Bar */}
                <div style={{ position: 'relative', marginBottom: 20 }}>
                    <div style={{
                        display: 'flex', alignItems: 'center', gap: 10,
                        background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)',
                        borderRadius: 12, padding: '10px 16px',
                    }}>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="2">
                            <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
                        </svg>
                        <input
                            ref={liveSearchInputRef}
                            type="text"
                            value={liveSearchQuery}
                            onChange={(e) => handleLiveSearchInput(e.target.value)}
                            onFocus={() => { if (liveVenueList.length === 0) fetchLiveVenueList(); if (liveVenueSuggestions.length > 0) setShowLiveSuggestions(true); }}
                            placeholder="Search for a casino or poker room..."
                            style={{
                                flex: 1, background: 'transparent', border: 'none', outline: 'none',
                                color: '#fff', fontSize: 15, fontWeight: 500,
                            }}
                        />
                        {selectedLiveVenue && (
                            <button onClick={handleClearLiveVenue} style={{
                                background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: 6,
                                padding: '4px 8px', color: 'rgba(255,255,255,0.5)', cursor: 'pointer', fontSize: 12,
                            }}>Clear</button>
                        )}
                    </div>

                    {/* Autocomplete Dropdown */}
                    {showLiveSuggestions && liveVenueSuggestions.length > 0 && (
                        <div style={{
                            position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100,
                            background: 'rgba(15, 23, 42, 0.98)', backdropFilter: 'blur(16px)',
                            border: '1px solid rgba(212,168,83,0.3)', borderRadius: 10,
                            marginTop: 4, overflow: 'hidden', maxHeight: 320, overflowY: 'auto',
                            boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
                        }}>
                            {liveVenueSuggestions.map((v, i) => (
                                <div key={v.slug || i} onClick={() => handleSelectLiveVenue(v)} style={{
                                    padding: '12px 16px', cursor: 'pointer',
                                    borderBottom: i < liveVenueSuggestions.length - 1 ? '1px solid rgba(255,255,255,0.06)' : 'none',
                                    display: 'flex', alignItems: 'center', gap: 10,
                                    transition: 'background 0.15s',
                                }}
                                    onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(212,168,83,0.1)'}
                                    onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                                >
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#d4a853" strokeWidth="2">
                                        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" /><circle cx="12" cy="10" r="3" />
                                    </svg>
                                    <span style={{ color: '#fff', fontSize: 14, fontWeight: 500 }}>{v.name}</span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* No venue selected — prompt */}
                {!selectedLiveVenue && !liveLoading && (
                    <div className="empty-state">
                        <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="rgba(212,168,83,0.3)" strokeWidth="1.5">
                            <circle cx="12" cy="12" r="4" fill="rgba(239,68,68,0.3)" />
                            <circle cx="12" cy="12" r="7" stroke="rgba(239,68,68,0.2)" strokeWidth="1.5" />
                            <circle cx="12" cy="12" r="10" stroke="rgba(239,68,68,0.1)" strokeWidth="1" />
                        </svg>
                        <p style={{ fontSize: 16, fontWeight: 600, color: 'rgba(255,255,255,0.7)', marginTop: 12 }}>Search For A Casino</p>
                        <p style={{ fontSize: 13, opacity: 0.4, marginTop: 6, maxWidth: 320, textAlign: 'center' }}>
                            Type a casino or poker room name above to see what games are running right now. Data updates every 15 minutes via Smarter.Poker Intelligence.
                        </p>
                    </div>
                )}

                {/* Loading state */}
                {liveLoading && renderSkeletons(4)}

                {/* Selected venue — show results */}
                {selectedLiveVenue && !liveLoading && liveGames.length === 0 && (
                    <div className="empty-state">
                        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="1.5">
                            <circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" />
                        </svg>
                        <p style={{ fontWeight: 600 }}>No Live Games At {selectedLiveVenue.name} Right Now</p>
                        <p style={{ fontSize: 13, opacity: 0.5, marginTop: 4 }}>Check back later—data refreshes every 15 minutes</p>
                        <button onClick={() => fetchLiveGames(selectedLiveVenue.slug)} style={{
                            marginTop: 12, padding: '8px 20px', background: 'rgba(212,168,83,0.2)',
                            border: '1px solid rgba(212,168,83,0.4)', borderRadius: 8,
                            color: '#d4a853', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                        }}>{liveLoading ? 'Checking...' : 'Check Again'}</button>
                    </div>
                )}

                {selectedLiveVenue && liveGames.length > 0 && (
                    <>
                        <div className="results-bar">
                            <span className="results-count">
                                {totalTables} table{totalTables !== 1 ? 's' : ''} running
                            </span>
                            <div className="live-refresh">
                                <span className="live-dot"></span>
                                <span>Smarter.Poker Live</span>
                                <button className="refresh-btn" onClick={() => fetchLiveGames(selectedLiveVenue.slug)} disabled={liveLoading}>
                                    {liveLoading ? 'Refreshing...' : 'Refresh'}
                                </button>
                            </div>
                        </div>
                        <div className="card-grid">
                            <div className="entity-card live-card" style={{ cursor: 'default' }}>
                                <div className="card-header">
                                    <h4>{selectedLiveVenue.name}</h4>
                                    <span className="live-badge">LIVE</span>
                                </div>
                                <div className="live-games-list">
                                    {liveGames.map((game, gi) => (
                                        <div key={gi} className="live-game-row">
                                            <span className="live-game-type">{formatGameType(game.game_type)}</span>
                                            <span className="live-game-stakes">{game.stakes || game.game_name_raw || '-'}</span>
                                            <span className="live-game-tables">{game.table_count || 0} table{(game.table_count || 0) !== 1 ? 's' : ''}</span>
                                            {game.wait_time !== null && game.wait_time !== undefined && (
                                                <span className="live-game-wait" style={{ color: game.wait_time <= 3 ? '#22c55e' : game.wait_time <= 10 ? '#d4a853' : '#ef4444' }}>
                                                    {game.wait_time + ' waiting'}
                                                </span>
                                            )}
                                        </div>
                                    ))}
                                </div>
                                <div className="card-footer">
                                    <span className="live-time">Updated {liveGames[0]?.created_at ? new Date(liveGames[0].created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'recently'}</span>
                                    <span style={{ fontSize: 11, opacity: 0.4 }}>via Smarter.Poker</span>
                                </div>
                            </div>
                        </div>
                    </>
                )}
            </>
        );
    };

    // --- NEW: Series Calendar Renderer ---
    const renderSeriesCalendar = () => {
        const today = new Date();
        const months = [];
        for (let m = 0; m < 4; m++) {
            const d = new Date(today.getFullYear(), today.getMonth() + m, 1);
            months.push({ year: d.getFullYear(), month: d.getMonth(), label: d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) });
        }

        return (
            <div className="calendar-view">
                {months.map((mo, mi) => {
                    const daysInMonth = new Date(mo.year, mo.month + 1, 0).getDate();
                    const firstDay = new Date(mo.year, mo.month, 1).getDay();
                    const monthSeries = series.filter(s => {
                        if (!s.start_date) return false;
                        const start = new Date(s.start_date);
                        const end = s.end_date ? new Date(s.end_date) : start;
                        const moStart = new Date(mo.year, mo.month, 1);
                        const moEnd = new Date(mo.year, mo.month + 1, 0);
                        return start <= moEnd && end >= moStart;
                    });

                    return (
                        <div key={mi} className="calendar-month">
                            <h3 className="calendar-month-title">{mo.label}</h3>
                            <div className="calendar-grid-header">
                                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
                                    <div key={d} className="cal-header-cell">{d}</div>
                                ))}
                            </div>
                            <div className="calendar-grid-body">
                                {Array.from({ length: firstDay }).map((_, i) => (
                                    <div key={'empty-' + i} className="cal-cell empty"></div>
                                ))}
                                {Array.from({ length: daysInMonth }).map((_, di) => {
                                    const dayNum = di + 1;
                                    const dateStr = mo.year + '-' + String(mo.month + 1).padStart(2, '0') + '-' + String(dayNum).padStart(2, '0');
                                    const dayDate = new Date(mo.year, mo.month, dayNum);
                                    const daySeries = monthSeries.filter(s => {
                                        const start = new Date(s.start_date);
                                        const end = s.end_date ? new Date(s.end_date) : start;
                                        return dayDate >= new Date(start.getFullYear(), start.getMonth(), start.getDate()) &&
                                            dayDate <= new Date(end.getFullYear(), end.getMonth(), end.getDate());
                                    });
                                    const isToday = dayDate.toDateString() === today.toDateString();
                                    return (
                                        <div key={dayNum} className={'cal-cell' + (isToday ? ' today' : '') + (daySeries.length > 0 ? ' has-events' : '')}>
                                            <span className="cal-day-num">{dayNum}</span>
                                            {daySeries.slice(0, 2).map((s, si) => {
                                                const tourColor = TOUR_COLORS[s.tour_code] || TOUR_COLORS.default;
                                                return (
                                                    <div key={si} className="cal-event"
                                                        style={{ background: tourColor.border, color: tourColor.text === '#000' ? '#000' : '#fff' }}
                                                        onClick={() => router.push('/hub/series/' + (s.id || si + 1))}
                                                        title={s.name}>
                                                        {(s.tour_code || s.short_name || '').slice(0, 5)}
                                                    </div>
                                                );
                                            })}
                                            {daySeries.length > 2 && <div className="cal-more">+{daySeries.length - 2}</div>}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    );
                })}
            </div>
        );
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
                title="Poker Near Me — Find Live Poker Rooms & Casinos"
                description="Discover Live Poker Rooms, Casinos, And Card Rooms Near You. Real-time Game Info, Tournament Schedules, And Interactive Maps Across The United States."
                canonical="/hub/poker-near-me"
            />

            <div className="pnm-page">
                <div className="space-bg"></div>
                <div className="space-overlay"></div>

                <UniversalHeader pageDepth={1} onMenuClick={() => setMenuOpen(true)} />

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

                {/* ═══ PAGE TITLE ═══ */}
                <div className="pnm-title-bar">
                    <h1 className="pnm-title">POKER NEAR ME</h1>
                    <p className="pnm-subtitle">{dbStats.total || venues.length || '525'} Venues &bull; {dbStats.states || '41'} States &bull; Real-Time Data</p>
                </div>

                {/* ═══ SIDEBAR + MAIN LAYOUT ═══ */}
                <div className="pnm-layout">

                    {/* ─── LEFT SIDEBAR NAVIGATION ─── */}
                    <aside className="pnm-sidebar" role="navigation" aria-label="Poker Near Me navigation">
                        <nav className="sidebar-nav">
                            {[
                                { key: 'venues', label: 'Venues', icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" /><circle cx="12" cy="10" r="3" /></svg> },
                                { key: 'events', label: 'Events', icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg> },
                                { key: 'live', label: 'Live Games', icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="4" fill="#ef4444" /><circle cx="12" cy="12" r="7" stroke="#ef4444" strokeWidth="1.5" opacity="0.5" /><circle cx="12" cy="12" r="10" stroke="#ef4444" strokeWidth="1" opacity="0.25" /></svg>, badge: liveGames.length > 0 ? liveGames.length : null },
                                { key: 'map', label: 'Full Map', icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" /><line x1="8" y1="2" x2="8" y2="18" /><line x1="16" y1="6" x2="16" y2="22" /></svg> },
                                { key: 'saved', label: 'Saved', icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" /></svg>, badge: Object.keys(favorites).filter(k => favorites[k]).length || null },
                            ].map(tab => (
                                <button
                                    key={tab.key}
                                    className={'sidebar-tab' + (activeTab === tab.key ? ' active' : '')}
                                    onClick={() => setActiveTab(tab.key)}
                                    role="tab"
                                    aria-selected={activeTab === tab.key}
                                    aria-label={tab.label + ' tab'}
                                >
                                    <span className="sidebar-tab-icon">{tab.icon}</span>
                                    <span className="sidebar-tab-label">{tab.label}</span>
                                    {tab.badge && <span className="sidebar-tab-badge">{tab.badge}</span>}
                                </button>
                            ))}
                        </nav>

                        {/* Event sub-tabs inside sidebar */}
                        {activeTab === 'events' && (
                            <div className="sidebar-sub-nav">
                                {['tours', 'series', 'daily', 'calendar'].map(sub => (
                                    <button
                                        key={sub}
                                        className={'sidebar-sub-tab' + (activeEventTab === sub ? ' active' : '')}
                                        onClick={() => setActiveEventTab(sub)}
                                    >
                                        {sub.charAt(0).toUpperCase() + sub.slice(1)}
                                    </button>
                                ))}
                            </div>
                        )}

                        {/* ─── SIDEBAR FILTERS ─── */}
                        <div className="sidebar-filters">
                            <div className="sidebar-section-title">Search</div>
                            <form className="sidebar-search-form" onSubmit={handleSearch}>
                                <input
                                    type="text"
                                    className="sidebar-search-input"
                                    placeholder="City, State, Venue..."
                                    value={searchQuery}
                                    onChange={handleSearchInputChange}
                                    autoComplete="off"
                                />
                                <button type="submit" className="sidebar-search-btn" aria-label="Search">
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
                                    </svg>
                                </button>
                            </form>

                            <button className={'sidebar-gps-btn' + (userLocation ? ' active' : '') + (gpsLoading ? ' loading' : '')} onClick={requestGpsLocation} disabled={gpsLoading}>
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <circle cx="12" cy="12" r="3" />
                                    <path d="M12 2v4M12 18v4M2 12h4M18 12h4" />
                                </svg>
                                {gpsLoading ? 'Locating...' : userLocation ? 'GPS Active' : 'Enable GPS'}
                            </button>

                            {gpsLocationLabel && userLocation && (
                                <div className="sidebar-gps-label">
                                    <div className="gps-pulse-dot" />
                                    Near <strong>{gpsLocationLabel}</strong>
                                    <button onClick={() => { setUserLocation(null); setGpsLocationLabel(null); setHasSearched(false); setVenues([]); setNearestDistance(null); }} className="sidebar-gps-clear">&times;</button>
                                </div>
                            )}

                            {activeTab === 'venues' && (
                                <>
                                    <div className="sidebar-section-title">Filters</div>

                                    <div className="sidebar-filter-group">
                                        <label>Radius</label>
                                        <div className="sidebar-chips">
                                            {[25, 50, 100, 250, 'Any'].map(dist => (
                                                <button key={dist} className={'sidebar-chip' + (filters.radius === dist ? ' active' : '')} onClick={() => { setFilters({ ...filters, radius: dist }); setHasSearched(true); }}>
                                                    {dist === 'Any' ? 'Any' : `${dist} mi`}
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    <div className="sidebar-filter-group">
                                        <label>Venue Type</label>
                                        <div className="sidebar-chips">
                                            {['all', 'casino', 'card_room', 'poker_club', 'charity'].map(type => (
                                                <button key={type} className={'sidebar-chip' + (filters.venueType === type ? ' active' : '')} onClick={() => setFilters({ ...filters, venueType: type })}>
                                                    {type === 'all' ? 'All' : VENUE_TYPE_LABELS[type]}
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    <div className="sidebar-filter-group">
                                        <label>Games</label>
                                        <div className="sidebar-chips">
                                            <button className={'sidebar-chip' + (filters.hasNLH ? ' active' : '')} onClick={() => setFilters({ ...filters, hasNLH: !filters.hasNLH })}>NLH</button>
                                            <button className={'sidebar-chip' + (filters.hasPLO ? ' active' : '')} onClick={() => setFilters({ ...filters, hasPLO: !filters.hasPLO })}>PLO</button>
                                            <button className={'sidebar-chip' + (filters.hasMixed ? ' active' : '')} onClick={() => setFilters({ ...filters, hasMixed: !filters.hasMixed })}>Mixed</button>
                                        </div>
                                    </div>

                                    <div className="sidebar-filter-group">
                                        <label>State</label>
                                        <select
                                            value={filters.selectedState}
                                            onChange={e => setFilters(f => ({ ...f, selectedState: e.target.value }))}
                                            className="sidebar-select"
                                        >
                                            <option value="all">All States</option>
                                            {['AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY','DC'].map(st => (
                                                <option key={st} value={st}>{st}</option>
                                            ))}
                                        </select>
                                    </div>

                                    <div className="sidebar-filter-group">
                                        <label>Sort By</label>
                                        <select value={sortBy} onChange={e => setSortBy(e.target.value)} className="sidebar-select">
                                            <option value="default">{userLocation ? 'Distance (Nearest)' : 'Default'}</option>
                                            <option value="trust-desc">Trust (High to Low)</option>
                                            <option value="distance">Distance (Nearest)</option>
                                            <option value="name-az">Name (A-Z)</option>
                                            <option value="venue-type">Venue Type</option>
                                            <option value="state-az">State (A-Z)</option>
                                            <option value="most-tables">Most Tables</option>
                                        </select>
                                    </div>
                                </>
                            )}
                        </div>
                    </aside>

                    {/* ─── MAIN CONTENT AREA ─── */}
                    <div className="pnm-main">

                    {/* Distance / Geofence notices (below HUD) */}
                    {(userLocation || nearestDistance) && (
                        <div className="distance-display" style={{ textAlign: 'center', padding: '6px 0', color: 'rgba(255,255,255,0.5)', fontSize: 12 }}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ verticalAlign: -2, marginRight: 4 }}>
                                <polygon points="3 11 22 2 13 21 11 13 3 11" />
                            </svg>
                            <span>Nearest: ~{nearestDistance || '0'} miles</span>
                        </div>
                    )}
                    {geofenceStatus === 'denied' && (
                        <div className="geofence-notice denied">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" />
                            </svg>
                            <span>Notifications Blocked - Venue Alerts Will Show In-App Only</span>
                        </div>
                    )}


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

                        {/* Push notification opt-in */}
                        {pushPermission === 'default' && userLocation && (
                            <div className="push-optin-banner">
                                <span><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ verticalAlign: -2, marginRight: 4 }}><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 01-3.46 0" /></svg> Get notified when you’re near a poker room?</span>
                                <button onClick={requestPushPermission}>Enable</button>
                                <button onClick={() => setPushPermission('dismissed')} style={{ background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.4)', fontSize: 12, cursor: 'pointer' }}>Dismiss</button>
                            </div>
                        )}

                        {renderContent()}
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

                    <style jsx global>{`
                    .pnm-page {
                        min-height: 100vh; padding-bottom: 70px;
                        position: relative;
                        color: #fff;
                        font-family: 'Inter', -apple-system, sans-serif;
                        overflow-x: hidden;
                        padding-bottom: 40px;
                    }

                    /* ═══ PAGE TITLE BAR ═══ */
                    .pnm-title-bar {
                        text-align: center;
                        padding: 28px 20px 18px;
                        position: relative;
                    }
                    .pnm-title {
                        font-size: 36px;
                        font-weight: 900;
                        letter-spacing: 3px;
                        margin: 0;
                        background: linear-gradient(135deg, #d4a853 0%, #f5d799 40%, #d4a853 60%, #b8860b 100%);
                        -webkit-background-clip: text;
                        -webkit-text-fill-color: transparent;
                        background-clip: text;
                        text-shadow: none;
                        filter: drop-shadow(0 0 20px rgba(212,168,83,0.3));
                    }
                    .pnm-subtitle {
                        margin: 6px 0 0;
                        font-size: 14px;
                        color: rgba(148,163,184,0.6);
                        letter-spacing: 1px;
                        font-weight: 500;
                    }

                    /* ═══ SIDEBAR + MAIN LAYOUT ═══ */
                    .pnm-layout {
                        display: flex;
                        max-width: 1600px;
                        margin: 0 auto;
                        min-height: calc(100vh - 160px);
                        gap: 0;
                    }

                    /* ═══ LEFT SIDEBAR NAVIGATION ═══ */
                    .pnm-sidebar {
                        width: 240px;
                        min-width: 240px;
                        background: linear-gradient(180deg, rgba(12,20,35,0.97) 0%, rgba(8,14,26,0.99) 100%);
                        border-right: 2px solid rgba(148,163,184,0.12);
                        padding: 12px 0;
                        position: sticky;
                        top: 64px;
                        height: calc(100vh - 64px);
                        overflow-y: auto;
                        overflow-x: hidden;
                        z-index: 50;
                        box-shadow: 4px 0 24px rgba(0,0,0,0.3);
                        scrollbar-width: thin;
                        scrollbar-color: rgba(212,168,83,0.3) transparent;
                    }
                    .pnm-sidebar::-webkit-scrollbar { width: 4px; }
                    .pnm-sidebar::-webkit-scrollbar-thumb { background: rgba(212,168,83,0.25); border-radius: 2px; }

                    .sidebar-nav {
                        display: flex;
                        flex-direction: column;
                        gap: 2px;
                        padding: 0 8px;
                        margin-bottom: 16px;
                    }

                    .sidebar-tab {
                        display: flex;
                        align-items: center;
                        gap: 12px;
                        width: 100%;
                        padding: 14px 16px;
                        border-radius: 10px;
                        background: transparent;
                        border: 1.5px solid transparent;
                        cursor: pointer;
                        transition: all 0.2s;
                        color: rgba(148,163,184,0.65);
                        position: relative;
                        text-align: left;
                    }
                    .sidebar-tab:hover {
                        background: rgba(148,163,184,0.06);
                        color: rgba(200,214,229,0.85);
                    }
                    .sidebar-tab.active {
                        background: linear-gradient(135deg, rgba(212,168,83,0.12) 0%, rgba(184,134,11,0.06) 100%);
                        border-color: rgba(212,168,83,0.3);
                        color: #d4a853;
                        box-shadow: inset 0 0 12px rgba(212,168,83,0.06), 0 0 8px rgba(212,168,83,0.08);
                    }
                    .sidebar-tab.active::before {
                        content: '';
                        position: absolute;
                        left: 0;
                        top: 6px;
                        bottom: 6px;
                        width: 3px;
                        background: #d4a853;
                        border-radius: 0 3px 3px 0;
                        box-shadow: 0 0 8px rgba(212,168,83,0.4);
                    }

                    .sidebar-tab-icon {
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        width: 24px;
                        height: 24px;
                        flex-shrink: 0;
                    }
                    .sidebar-tab-label {
                        font-size: 15px;
                        font-weight: 600;
                        white-space: nowrap;
                    }
                    .sidebar-tab-badge {
                        margin-left: auto;
                        background: #ef4444;
                        color: #fff;
                        font-size: 11px;
                        font-weight: 700;
                        padding: 2px 7px;
                        border-radius: 10px;
                        min-width: 20px;
                        text-align: center;
                        animation: livePulse 2s ease-in-out infinite;
                    }

                    /* Sidebar Sub-Nav (Events sub-tabs) */
                    .sidebar-sub-nav {
                        display: flex;
                        flex-direction: column;
                        gap: 2px;
                        padding: 4px 12px 12px;
                        margin-left: 24px;
                        border-left: 2px solid rgba(148,163,184,0.1);
                    }
                    .sidebar-sub-tab {
                        padding: 10px 14px;
                        background: transparent;
                        border: none;
                        border-radius: 8px;
                        color: rgba(148,163,184,0.6);
                        font-size: 14px;
                        font-weight: 500;
                        cursor: pointer;
                        text-align: left;
                        transition: all 0.2s;
                    }
                    .sidebar-sub-tab:hover {
                        background: rgba(148,163,184,0.06);
                        color: #e2e8f0;
                    }
                    .sidebar-sub-tab.active {
                        background: rgba(212,168,83,0.1);
                        color: #d4a853;
                        font-weight: 700;
                    }

                    /* ═══ SIDEBAR FILTERS ═══ */
                    .sidebar-filters {
                        padding: 0 12px;
                        border-top: 1px solid rgba(148,163,184,0.08);
                        margin-top: 8px;
                        padding-top: 12px;
                    }
                    .sidebar-section-title {
                        font-size: 11px;
                        font-weight: 800;
                        text-transform: uppercase;
                        letter-spacing: 1.5px;
                        color: rgba(148,163,184,0.4);
                        margin-bottom: 10px;
                        padding: 0 4px;
                    }
                    .sidebar-search-form {
                        display: flex;
                        gap: 6px;
                        margin-bottom: 10px;
                    }
                    .sidebar-search-input {
                        flex: 1;
                        padding: 10px 12px;
                        background: rgba(0,0,0,0.35);
                        border: 1.5px solid rgba(148,163,184,0.15);
                        border-radius: 8px;
                        color: #e2e8f0;
                        font-size: 14px;
                        font-family: inherit;
                        outline: none;
                        transition: border-color 0.2s;
                    }
                    .sidebar-search-input:focus {
                        border-color: rgba(212,168,83,0.4);
                    }
                    .sidebar-search-input::placeholder {
                        color: rgba(148,163,184,0.35);
                    }
                    .sidebar-search-btn {
                        width: 40px;
                        background: rgba(0,0,0,0.3);
                        border: 1.5px solid rgba(148,163,184,0.15);
                        border-radius: 8px;
                        color: rgba(148,163,184,0.5);
                        cursor: pointer;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        transition: all 0.2s;
                    }
                    .sidebar-search-btn:hover {
                        color: #d4a853;
                        border-color: rgba(212,168,83,0.3);
                    }

                    .sidebar-gps-btn {
                        display: flex;
                        align-items: center;
                        gap: 8px;
                        width: 100%;
                        padding: 10px 12px;
                        background: rgba(0,0,0,0.25);
                        border: 1.5px solid rgba(148,163,184,0.12);
                        border-radius: 8px;
                        color: rgba(148,163,184,0.6);
                        font-size: 13px;
                        font-weight: 600;
                        cursor: pointer;
                        transition: all 0.2s;
                        margin-bottom: 10px;
                    }
                    .sidebar-gps-btn:hover {
                        border-color: rgba(59,130,246,0.3);
                        color: #60a5fa;
                    }
                    .sidebar-gps-btn.active {
                        background: rgba(34,197,94,0.08);
                        border-color: rgba(34,197,94,0.25);
                        color: #4ade80;
                    }

                    .sidebar-gps-label {
                        display: flex;
                        align-items: center;
                        gap: 8px;
                        padding: 8px 10px;
                        background: rgba(34,197,94,0.06);
                        border: 1px solid rgba(34,197,94,0.15);
                        border-radius: 8px;
                        font-size: 12px;
                        color: rgba(255,255,255,0.7);
                        margin-bottom: 12px;
                    }
                    .sidebar-gps-clear {
                        margin-left: auto;
                        background: none;
                        border: none;
                        color: rgba(255,255,255,0.3);
                        font-size: 18px;
                        cursor: pointer;
                        line-height: 1;
                        padding: 0;
                    }
                    .sidebar-gps-clear:hover { color: #ef4444; }

                    .sidebar-filter-group {
                        margin-bottom: 14px;
                    }
                    .sidebar-filter-group label {
                        display: block;
                        font-size: 13px;
                        font-weight: 700;
                        color: rgba(255,255,255,0.55);
                        margin-bottom: 8px;
                        padding: 0 2px;
                    }
                    .sidebar-chips {
                        display: flex;
                        flex-wrap: wrap;
                        gap: 6px;
                    }
                    .sidebar-chip {
                        padding: 8px 14px;
                        background: rgba(0,0,0,0.35);
                        border: 1.5px solid rgba(148,163,184,0.12);
                        border-radius: 8px;
                        color: rgba(255,255,255,0.6);
                        font-size: 13px;
                        font-weight: 600;
                        cursor: pointer;
                        transition: all 0.2s;
                    }
                    .sidebar-chip:hover {
                        background: rgba(255,255,255,0.06);
                        border-color: rgba(255,255,255,0.2);
                        color: #fff;
                    }
                    .sidebar-chip.active {
                        background: rgba(212,168,83,0.15);
                        border-color: rgba(212,168,83,0.4);
                        color: #d4a853;
                    }

                    .sidebar-select {
                        width: 100%;
                        padding: 10px 12px;
                        background: rgba(0,0,0,0.35);
                        border: 1.5px solid rgba(148,163,184,0.15);
                        border-radius: 8px;
                        color: #e2e8f0;
                        font-size: 14px;
                        font-family: inherit;
                        cursor: pointer;
                        appearance: auto;
                    }
                    .sidebar-select:focus {
                        border-color: rgba(212,168,83,0.4);
                        outline: none;
                    }

                    /* ═══ MAIN CONTENT AREA ═══ */
                    .pnm-main {
                        flex: 1;
                        min-width: 0;
                        padding: 0 20px 40px;
                    }

                    /* ═══ MOBILE SIDEBAR → DRAWER ═══ */
                    @media (max-width: 768px) {
                        .pnm-title {
                            font-size: 28px;
                            letter-spacing: 2px;
                        }
                        .pnm-title-bar {
                            padding: 20px 16px 12px;
                        }
                        .pnm-layout {
                            flex-direction: column;
                        }
                        .pnm-sidebar {
                            width: 100%;
                            min-width: 100%;
                            position: relative;
                            top: 0;
                            height: auto;
                            max-height: none;
                            border-right: none;
                            border-bottom: 2px solid rgba(148,163,184,0.12);
                            box-shadow: 0 4px 24px rgba(0,0,0,0.3);
                            padding: 8px 0 12px;
                        }
                        .sidebar-nav {
                            flex-direction: row;
                            overflow-x: auto;
                            -webkit-overflow-scrolling: touch;
                            gap: 4px;
                            padding: 0 12px;
                            margin-bottom: 8px;
                        }
                        .sidebar-tab {
                            flex-direction: column;
                            gap: 4px;
                            padding: 10px 14px;
                            min-width: 72px;
                            align-items: center;
                            text-align: center;
                        }
                        .sidebar-tab.active::before {
                            display: none;
                        }
                        .sidebar-tab.active {
                            box-shadow: inset 0 -2px 0 #d4a853, inset 0 0 8px rgba(212,168,83,0.08);
                        }
                        .sidebar-tab-label {
                            font-size: 12px;
                        }
                        .sidebar-tab-icon {
                            width: 22px;
                            height: 22px;
                        }
                        .sidebar-sub-nav {
                            flex-direction: row;
                            margin-left: 0;
                            border-left: none;
                            gap: 4px;
                            padding: 0 12px 8px;
                            overflow-x: auto;
                        }
                        .sidebar-sub-tab {
                            padding: 8px 16px;
                            font-size: 13px;
                            white-space: nowrap;
                        }
                        .sidebar-filters {
                            padding: 0 12px 8px;
                            display: flex;
                            flex-wrap: wrap;
                            gap: 8px;
                            align-items: flex-start;
                        }
                        .sidebar-section-title {
                            width: 100%;
                            margin-bottom: 4px;
                        }
                        .sidebar-search-form {
                            flex: 1;
                            min-width: 200px;
                            margin-bottom: 0;
                        }
                        .sidebar-gps-btn {
                            min-width: 120px;
                            flex: 0;
                            margin-bottom: 0;
                        }
                        .sidebar-gps-label { width: 100%; }
                        .sidebar-filter-group {
                            margin-bottom: 0;
                        }
                        .sidebar-chips {
                            gap: 4px;
                        }
                        .sidebar-chip {
                            padding: 6px 12px;
                            font-size: 12px;
                        }
                        .sidebar-select {
                            font-size: 13px;
                            padding: 8px 10px;
                        }
                        .sidebar-filter-group label {
                            font-size: 12px;
                            margin-bottom: 4px;
                        }
                        .pnm-main {
                            padding: 0 12px 40px;
                        }
                    }

                    /* Space Background */
                    .space-bg {
                        position: fixed;
                        inset: 0;
                        background:
                            radial-gradient(ellipse at 20% 20%, rgba(59, 130, 246, 0.12) 0%, transparent 50%),
                            radial-gradient(ellipse at 80% 80%, rgba(139, 92, 246, 0.08) 0%, transparent 50%),
                            radial-gradient(ellipse at 50% 50%, rgba(6, 182, 212, 0.06) 0%, transparent 60%),
                            linear-gradient(180deg, #020408 0%, #0a1628 30%, #0d1b2a 50%, #0a1628 70%, #020408 100%);
                        z-index: -2;
                    }
                    .space-bg::before {
                        content: '';
                        position: absolute;
                        inset: 0;
                        background-image:
                            repeating-linear-gradient(0deg, transparent, transparent 39px, rgba(148,163,184,0.04) 39px, rgba(148,163,184,0.04) 40px),
                            repeating-linear-gradient(90deg, transparent, transparent 39px, rgba(148,163,184,0.04) 39px, rgba(148,163,184,0.04) 40px);
                        background-size: 40px 40px;
                    }
                    .space-bg::after {
                        content: '';
                        position: absolute;
                        inset: 0;
                        background: repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.03) 2px, rgba(0,0,0,0.03) 4px);
                        pointer-events: none;
                    }
                    .space-overlay {
                        position: fixed;
                        inset: 0;
                        background:
                            radial-gradient(ellipse at 50% 0%, rgba(148,163,184,0.05) 0%, transparent 50%),
                            linear-gradient(180deg, rgba(3,7,18,0.4) 0%, transparent 15%, transparent 85%, rgba(3,7,18,0.6) 100%);
                        z-index: -1;
                    }

                    /* ═══ CSS NATIVE SEARCH ROW — Metal Framed ═══ */
                    .native-search-row {
                        position: relative;
                        display: flex;
                        gap: 10px;
                        padding: 16px 20px;
                        margin: 0 auto;
                        max-width: 1400px;
                        z-index: 10;
                    }
                    .native-search-form {
                        flex: 1;
                        position: relative;
                        background: linear-gradient(180deg, rgba(20,30,48,0.95) 0%, rgba(12,18,30,0.98) 100%);
                        border: 2px solid rgba(148,163,184,0.18);
                        border-radius: 12px;
                        display: flex;
                        align-items: center;
                        overflow: hidden;
                        box-shadow:
                            inset 0 2px 6px rgba(0,0,0,0.4),
                            inset 0 -1px 0 rgba(148,163,184,0.08),
                            0 2px 8px rgba(0,0,0,0.3);
                    }
                    .native-search-input {
                        flex: 1;
                        background: transparent;
                        border: none;
                        padding: 14px 16px;
                        color: #e2e8f0;
                        font-size: 16px;
                        font-family: inherit;
                        outline: none;
                    }
                    .native-search-input::placeholder { color: rgba(148,163,184,0.4); }
                    .native-search-btn {
                        background: transparent;
                        border: none;
                        color: rgba(148,163,184,0.6);
                        padding: 0 16px;
                        cursor: pointer;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        transition: color 0.2s;
                    }
                    .native-search-btn:hover { color: #d4a853; }
                    .native-gps-btn, .native-filter-btn {
                        background: linear-gradient(180deg, rgba(20,30,48,0.95) 0%, rgba(12,18,30,0.98) 100%);
                        border: 2px solid rgba(148,163,184,0.18);
                        border-radius: 12px;
                        width: 48px;
                        flex-shrink: 0;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        color: rgba(148,163,184,0.7);
                        cursor: pointer;
                        transition: all 0.25s;
                        box-shadow:
                            inset 0 2px 4px rgba(0,0,0,0.35),
                            inset 0 -1px 0 rgba(148,163,184,0.06),
                            0 2px 6px rgba(0,0,0,0.25);
                    }
                    .native-gps-btn:hover, .native-filter-btn:hover {
                        border-color: rgba(148,163,184,0.3);
                        color: #e2e8f0;
                    }
                    .native-gps-btn.active, .native-filter-btn.active {
                        background: linear-gradient(180deg, rgba(212,168,83,0.15) 0%, rgba(184,134,11,0.1) 100%);
                        border-color: rgba(212,168,83,0.5);
                        color: #d4a853;
                        box-shadow:
                            inset 0 2px 4px rgba(0,0,0,0.3),
                            0 0 12px rgba(212,168,83,0.15);
                    }

                    /* ═══ EVENT SUB-TABS ROW — Metal Strip ═══ */
                    .sub-tab-row {
                        display: flex;
                        justify-content: center;
                        gap: 6px;
                        padding: 0 20px 16px;
                        max-width: 1400px;
                        margin: 0 auto;
                    }
                    .sub-tab-btn {
                        padding: 8px 18px;
                        background: linear-gradient(180deg, rgba(25,35,55,0.9) 0%, rgba(15,23,42,0.95) 100%);
                        border: 1.5px solid rgba(148,163,184,0.15);
                        border-radius: 8px;
                        color: rgba(148,163,184,0.7);
                        font-size: 13px;
                        font-weight: 600;
                        cursor: pointer;
                        transition: all 0.25s;
                        box-shadow:
                            inset 0 1px 0 rgba(255,255,255,0.06),
                            0 2px 4px rgba(0,0,0,0.3);
                        text-transform: uppercase;
                        letter-spacing: 0.5px;
                    }
                    .sub-tab-btn:hover {
                        border-color: rgba(148,163,184,0.3);
                        color: #e2e8f0;
                    }
                    .sub-tab-btn.active {
                        background: linear-gradient(180deg, rgba(212,168,83,0.12) 0%, rgba(184,134,11,0.08) 100%);
                        border-color: rgba(212,168,83,0.45);
                        color: #d4a853;
                        box-shadow:
                            inset 0 1px 0 rgba(212,168,83,0.15),
                            0 0 10px rgba(212,168,83,0.1),
                            0 2px 4px rgba(0,0,0,0.3);
                    }


                    /* Main Content */
                    .pnm-content {
                        padding: 0 20px;
                        max-width: 1400px;
                        margin: 0 auto;
                    }

                    /* Loading / Empty State — Metal Container */
                    .loading-state, .empty-state, .search-landing {
                        display: flex;
                        flex-direction: column;
                        align-items: center;
                        justify-content: center;
                        padding: 60px 20px;
                        color: rgba(148,163,184,0.6);
                        text-align: center;
                        background: linear-gradient(160deg, rgba(15,23,42,0.5) 0%, rgba(8,14,25,0.7) 100%);
                        border: 1.5px solid rgba(148,163,184,0.1);
                        border-radius: 16px;
                        box-shadow:
                            inset 0 1px 0 rgba(255,255,255,0.04),
                            0 4px 16px rgba(0,0,0,0.3);
                        margin: 8px 0;
                    }
                    .spinner {
                        width: 40px;
                        height: 40px;
                        border: 3px solid rgba(148,163,184,0.12);
                        border-top-color: #d4a853;
                        border-radius: 50%;
                        animation: spin 1s linear infinite;
                        margin-bottom: 16px;
                        box-shadow: 0 0 12px rgba(212,168,83,0.15);
                    }
                    @keyframes spin { to { transform: rotate(360deg); } }
                    .empty-state button {
                        margin-top: 16px;
                        padding: 12px 24px;
                        background: linear-gradient(180deg, rgba(212,168,83,0.15) 0%, rgba(184,134,11,0.1) 100%);
                        border: 1.5px solid rgba(212,168,83,0.4);
                        border-radius: 8px;
                        color: #d4a853;
                        cursor: pointer;
                        box-shadow:
                            inset 0 1px 0 rgba(212,168,83,0.15),
                            0 2px 6px rgba(0,0,0,0.3);
                        transition: all 0.25s;
                    }
                    .empty-state button:hover {
                        border-color: rgba(212,168,83,0.6);
                        box-shadow:
                            inset 0 1px 0 rgba(212,168,83,0.2),
                            0 0 12px rgba(212,168,83,0.15),
                            0 2px 6px rgba(0,0,0,0.3);
                    }

                    /* Card Grid */
                    .card-grid {
                        display: grid;
                        grid-template-columns: 1fr;
                        gap: 16px;
                    }
                    @media (min-width: 640px) {
                        .card-grid {
                            grid-template-columns: repeat(2, 1fr);
                        }
                    }
                    @media (min-width: 1024px) {
                        .card-grid {
                            grid-template-columns: repeat(3, 1fr);
                        }
                    }
                    @media (min-width: 1280px) {
                        .card-grid {
                            grid-template-columns: repeat(4, 1fr);
                        }
                    }

                    /* Entity Cards — Vault-V3 Metal Frame */
                    .entity-card {
                        position: relative;
                        background: linear-gradient(160deg, rgba(18,28,45,0.92) 0%, rgba(10,16,28,0.96) 100%);
                        border: 2px solid rgba(148,163,184,0.16);
                        border-radius: 14px;
                        padding: 16px 18px;
                        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                        box-shadow:
                            inset 0 1px 0 rgba(255,255,255,0.06),
                            inset 0 -1px 0 rgba(0,0,0,0.3),
                            inset 0 0 20px rgba(148,163,184,0.04),
                            0 4px 20px rgba(0,0,0,0.4),
                            0 1px 3px rgba(0,0,0,0.2);
                    }
                    .entity-card::before {
                        content: '';
                        position: absolute;
                        top: 0; left: 0; right: 0;
                        height: 1px;
                        background: linear-gradient(90deg, transparent 10%, rgba(148,163,184,0.2) 50%, transparent 90%);
                        border-radius: 14px 14px 0 0;
                    }
                    .entity-card:hover {
                        border-color: rgba(212,168,83,0.35);
                        background: linear-gradient(160deg, rgba(20,32,50,0.95) 0%, rgba(12,20,34,0.98) 100%);
                        box-shadow:
                            inset 0 1px 0 rgba(212,168,83,0.1),
                            inset 0 0 20px rgba(212,168,83,0.03),
                            0 8px 32px rgba(0,0,0,0.5),
                            0 0 0 1px rgba(212,168,83,0.08);
                        transform: translateY(-2px);
                    }
                    .card-header {
                        display: flex;
                        justify-content: space-between;
                        align-items: flex-start;
                        margin-bottom: 10px;
                    }
                    .entity-card h4 {
                        font-size: 16px;
                        font-weight: 600;
                        margin: 0 0 4px;
                        color: #fff;
                    }

                    /* ═══ PREMIUM VENUE CARD v3.0 — Vault-V3 Metal Frame ═══ */
                    .vc3-card {
                        position: relative;
                        overflow: hidden;
                        background: linear-gradient(160deg, rgba(16,24,36,0.95) 0%, rgba(10,16,26,0.98) 100%);
                        border: 2px solid rgba(148,163,184,0.16);
                        border-radius: 14px;
                        padding: 16px 18px 14px;
                        transition: border-color 0.3s, box-shadow 0.3s, background 0.3s;
                        box-shadow:
                            inset 0 1px 0 rgba(255,255,255,0.06),
                            inset 0 -1px 0 rgba(0,0,0,0.3),
                            inset 0 0 20px rgba(148,163,184,0.04),
                            0 4px 20px rgba(0,0,0,0.45),
                            0 1px 3px rgba(0,0,0,0.2);
                    }
                    .vc3-card::after {
                        content: '';
                        position: absolute;
                        top: 0; left: 0; right: 0;
                        height: 1px;
                        background: linear-gradient(90deg, transparent 5%, rgba(148,163,184,0.25) 30%, rgba(148,163,184,0.15) 70%, transparent 95%);
                        pointer-events: none;
                    }
                    .vc3-card:hover {
                        border-color: rgba(212,168,83,0.35);
                        background: linear-gradient(160deg, rgba(18,28,42,0.97) 0%, rgba(12,20,32,0.99) 100%);
                        box-shadow:
                            inset 0 1px 0 rgba(212,168,83,0.1),
                            inset 0 0 20px rgba(212,168,83,0.03),
                            0 8px 32px rgba(0,0,0,0.55),
                            0 0 0 1px rgba(212,168,83,0.08);
                    }

                    /* Accent Line */
                    .vc3-accent {
                        position: absolute;
                        top: 0; left: 0; right: 0;
                        height: 3px;
                        border-radius: 14px 14px 0 0;
                        opacity: 0.75;
                        transition: opacity 0.3s;
                    }
                    .vc3-card:hover .vc3-accent { opacity: 1; }

                    /* Header zone: type badge + status indicators */
                    .vc3-header {
                        display: flex;
                        align-items: center;
                        justify-content: space-between;
                        gap: 8px;
                        margin-bottom: 10px;
                    }
                    .vc3-type-badge {
                        display: inline-flex;
                        align-items: center;
                        gap: 5px;
                        padding: 3px 9px;
                        border-radius: 6px;
                        font-size: 10.5px;
                        font-weight: 700;
                        text-transform: uppercase;
                        letter-spacing: 0.4px;
                        border: 1px solid;
                    }
                    .vc3-status-group {
                        display: flex;
                        align-items: center;
                        gap: 6px;
                    }
                    .vc3-open-pill {
                        display: inline-flex;
                        align-items: center;
                        gap: 4px;
                        padding: 3px 8px;
                        background: rgba(34,197,94,0.10);
                        border: 1px solid rgba(34,197,94,0.22);
                        border-radius: 12px;
                        font-size: 10px;
                        font-weight: 600;
                        color: #4ade80;
                        white-space: nowrap;
                    }
                    .vc3-open-dot {
                        width: 5px; height: 5px;
                        background: #4ade80;
                        border-radius: 50%;
                        animation: vc3pulse 2s ease-in-out infinite;
                    }
                    @keyframes vc3pulse { 0%, 100% { opacity: 1; box-shadow: 0 0 4px #4ade80; } 50% { opacity: 0.5; box-shadow: 0 0 8px #4ade80; } }
                    .vc3-distance {
                        display: inline-flex;
                        align-items: center;
                        gap: 3px;
                        padding: 3px 8px;
                        background: rgba(255,255,255,0.05);
                        border: 1px solid rgba(255,255,255,0.1);
                        border-radius: 12px;
                        font-size: 10.5px;
                        font-weight: 600;
                        color: rgba(255,255,255,0.6);
                        white-space: nowrap;
                    }

                    /* Favorite button */
                    .vc3-fav {
                        position: absolute;
                        top: 12px; right: 12px;
                        background: rgba(0,0,0,0.35);
                        border: 1px solid rgba(255,255,255,0.08);
                        border-radius: 50%;
                        width: 34px; height: 34px;
                        display: flex; align-items: center; justify-content: center;
                        cursor: pointer;
                        z-index: 2;
                        transition: all 0.2s;
                    }
                    .vc3-fav:hover { background: rgba(239,68,68,0.2); border-color: rgba(239,68,68,0.3); transform: scale(1.1); }
                    .vc3-fav.active { background: rgba(239,68,68,0.15); border-color: rgba(239,68,68,0.25); }

                    /* Venue name */
                    .vc3-name {
                        font-size: 17px;
                        font-weight: 800;
                        margin: 0 0 5px;
                        color: #e8ecf0;
                        padding-right: 42px;
                        line-height: 1.3;
                        letter-spacing: -0.15px;
                    }

                    /* Address */
                    .vc3-address {
                        display: flex;
                        align-items: flex-start;
                        gap: 5px;
                        font-size: 12.5px;
                        color: rgba(255,255,255,0.48);
                        margin: 0 0 8px;
                        line-height: 1.35;
                    }
                    .vc3-address span {
                        overflow: hidden;
                        text-overflow: ellipsis;
                    }

                    /* Host row (home games) */
                    .vc3-host {
                        display: flex;
                        align-items: center;
                        gap: 6px;
                        margin: 2px 0 4px;
                    }
                    .vc3-host-name { font-size: 12px; color: #58a6ff; font-weight: 600; }
                    .vc3-host-link { font-size: 11px; color: #3fb950; text-decoration: underline; margin-left: 2px; }
                    .vc3-description { font-size: 12px; color: rgba(255,255,255,0.4); margin: 0 0 6px; line-height: 1.4; font-style: italic; }

                    /* Badge row */
                    .vc3-badges {
                        display: flex;
                        flex-wrap: wrap;
                        gap: 5px;
                        margin-bottom: 8px;
                    }
                    .vc3-badge {
                        padding: 2px 8px;
                        border-radius: 4px;
                        font-size: 10px;
                        font-weight: 700;
                        text-transform: uppercase;
                        letter-spacing: 0.4px;
                        border: 1px solid transparent;
                    }
                    .vc3-badge-featured { background: rgba(212,168,83,0.12); color: #d4a853; border-color: rgba(212,168,83,0.25); }
                    .vc3-badge-newcomer { background: rgba(34,197,94,0.10); color: #4ade80; border-color: rgba(34,197,94,0.2); }
                    .vc3-badge-promo { background: rgba(139,92,246,0.10); color: #a78bfa; border-color: rgba(139,92,246,0.2); }
                    .vc3-badge-live {
                        display: inline-flex; align-items: center; gap: 4px;
                        background: rgba(239,68,68,0.12); color: #ef4444; border-color: rgba(239,68,68,0.3);
                        animation: vc3livePulse 2s ease-in-out infinite;
                    }
                    .vc3-live-dot { width: 5px; height: 5px; background: #ef4444; border-radius: 50%; }
                    @keyframes vc3livePulse { 0%, 100% { box-shadow: 0 0 6px rgba(239,68,68,0.15); } 50% { box-shadow: 0 0 12px rgba(239,68,68,0.3); } }
                    .vc3-badge-tourney { background: rgba(59,130,246,0.10); color: #60a5fa; border-color: rgba(59,130,246,0.2); }
                    .vc3-badge-checkin { background: rgba(230,81,0,0.10); color: #fb923c; border-color: rgba(230,81,0,0.2); cursor: pointer; }

                    /* Data zone */
                    .vc3-data-zone {
                        margin-bottom: 4px;
                    }

                    /* Live info row */
                    .vc3-live-info {
                        display: flex;
                        gap: 16px;
                        padding: 8px 12px;
                        background: rgba(34,197,94,0.06);
                        border: 1px solid rgba(34,197,94,0.12);
                        border-radius: 8px;
                        margin-bottom: 8px;
                    }
                    .vc3-live-stat {
                        display: flex;
                        align-items: center;
                        gap: 4px;
                    }
                    .vc3-live-stat-val { font-size: 14px; font-weight: 800; color: #e8ecf0; }
                    .vc3-live-stat-label { font-size: 11px; color: rgba(255,255,255,0.45); font-weight: 500; }

                    /* Hours */
                    .vc3-hours {
                        display: flex;
                        align-items: center;
                        gap: 5px;
                        font-size: 12px;
                        color: rgba(255,255,255,0.42);
                        margin: 0 0 6px;
                    }

                    /* Game chips — color-coded */
                    .vc3-games {
                        display: flex;
                        flex-wrap: wrap;
                        gap: 5px;
                        margin-bottom: 6px;
                    }
                    .vc3-game-chip {
                        padding: 3px 8px;
                        border-radius: 4px;
                        font-size: 11px;
                        font-weight: 600;
                        border: 1px solid;
                        white-space: nowrap;
                    }

                    /* Stakes */
                    .vc3-stakes {
                        display: flex;
                        align-items: center;
                        gap: 5px;
                        font-size: 12px;
                        color: rgba(212,168,83,0.8);
                        font-weight: 600;
                        margin: 0 0 6px;
                    }

                    /* Trust score — Illuminated Gauge */
                    .vc3-trust {
                        padding: 8px 0 6px;
                        border-top: 1px solid rgba(148,163,184,0.08);
                        margin-top: 4px;
                    }
                    .vc3-trust-header {
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                        margin-bottom: 5px;
                    }
                    .vc3-trust-label { font-size: 11px; font-weight: 700; }
                    .vc3-trust-val { font-size: 11px; font-weight: 800; }
                    .vc3-trust-track {
                        height: 6px;
                        background: rgba(148,163,184,0.08);
                        border-radius: 3px;
                        overflow: hidden;
                        box-shadow:
                            inset 0 1px 2px rgba(0,0,0,0.4),
                            0 0 0 1px rgba(148,163,184,0.06);
                    }
                    .vc3-trust-fill {
                        height: 100%;
                        border-radius: 3px;
                        transition: width 0.8s cubic-bezier(0.4, 0, 0.2, 1);
                        box-shadow: 0 0 8px currentColor;
                        position: relative;
                    }
                    .vc3-trust-fill::after {
                        content: '';
                        position: absolute;
                        top: 0; left: 0; right: 0;
                        height: 2px;
                        background: linear-gradient(90deg, transparent, rgba(255,255,255,0.3), transparent);
                        border-radius: 3px;
                    }

                    /* Action bar */
                    .vc3-actions {
                        display: flex;
                        align-items: center;
                        justify-content: space-between;
                        gap: 8px;
                        padding-top: 10px;
                        border-top: 1px solid rgba(255,255,255,0.06);
                        margin-top: 6px;
                    }
                    .vc3-actions-secondary { display: flex; gap: 5px; }
                    .vc3-actions-primary { display: flex !important; gap: 6px; flex: 1; justify-content: flex-end; flex-wrap: nowrap; }

                    .vc3-icon-btn {
                        display: flex; align-items: center; justify-content: center;
                        width: 34px; height: 34px; border-radius: 8px;
                        border: 1.5px solid rgba(148,163,184,0.12);
                        background: linear-gradient(180deg, rgba(25,35,55,0.8) 0%, rgba(15,23,42,0.9) 100%);
                        color: rgba(148,163,184,0.5);
                        text-decoration: none; cursor: pointer;
                        transition: all 0.25s;
                        box-shadow:
                            inset 0 1px 0 rgba(255,255,255,0.04),
                            0 2px 4px rgba(0,0,0,0.25);
                    }
                    .vc3-icon-btn:hover {
                        background: linear-gradient(180deg, rgba(30,42,65,0.9) 0%, rgba(20,30,48,0.95) 100%);
                        border-color: rgba(148,163,184,0.25);
                        color: #e2e8f0;
                        transform: translateY(-1px);
                        box-shadow:
                            inset 0 1px 0 rgba(255,255,255,0.06),
                            0 4px 8px rgba(0,0,0,0.35);
                    }

                    .vc3-pill {
                        display: inline-flex !important; align-items: center; gap: 5px;
                        padding: 8px 12px; border-radius: 8px;
                        font-size: 11.5px; font-weight: 700;
                        cursor: pointer; border: 1.5px solid transparent;
                        transition: all 0.25s; font-family: inherit;
                        white-space: nowrap; line-height: 1;
                        box-shadow:
                            inset 0 1px 0 rgba(255,255,255,0.06),
                            0 2px 4px rgba(0,0,0,0.25);
                    }
                    .vc3-pill span { font-size: 11px; }
                    .vc3-pill-checkin {
                        background: linear-gradient(180deg, rgba(34,197,94,0.18) 0%, rgba(34,197,94,0.1) 100%);
                        color: #4ade80;
                        border-color: rgba(34,197,94,0.25);
                    }
                    .vc3-pill-checkin:hover {
                        background: linear-gradient(180deg, rgba(34,197,94,0.28) 0%, rgba(34,197,94,0.18) 100%);
                        box-shadow: 0 0 12px rgba(34,197,94,0.15), inset 0 1px 0 rgba(34,197,94,0.2);
                    }
                    .vc3-pill-review {
                        background: linear-gradient(180deg, rgba(59,130,246,0.18) 0%, rgba(59,130,246,0.1) 100%);
                        color: #60a5fa;
                        border-color: rgba(59,130,246,0.25);
                    }
                    .vc3-pill-review:hover {
                        background: linear-gradient(180deg, rgba(59,130,246,0.28) 0%, rgba(59,130,246,0.18) 100%);
                        box-shadow: 0 0 12px rgba(59,130,246,0.15), inset 0 1px 0 rgba(59,130,246,0.2);
                    }
                    .vc3-pill-details {
                        background: linear-gradient(180deg, rgba(212,168,83,0.18) 0%, rgba(212,168,83,0.1) 100%);
                        color: #d4a853;
                        border-color: rgba(212,168,83,0.25);
                    }
                    .vc3-pill-details:hover {
                        background: linear-gradient(180deg, rgba(212,168,83,0.28) 0%, rgba(212,168,83,0.18) 100%);
                        box-shadow: 0 0 12px rgba(212,168,83,0.15), inset 0 1px 0 rgba(212,168,83,0.2);
                    }
                    .card-location {
                        font-size: 13px;
                        color: rgba(255,255,255,0.5);
                        margin: 0 0 10px;
                    }
                    .card-dates {
                        font-size: 12px;
                        color: rgba(255,255,255,0.6);
                        margin: 0 0 10px;
                    }
                    .card-detail {
                        font-size: 13px;
                        color: rgba(255,255,255,0.6);
                        margin: 8px 0;
                    }
                    .card-detail.guaranteed {
                        color: #4ade80;
                        font-weight: 600;
                    }

                    /* Badges */
                    .badge {
                        padding: 4px 10px;
                        border-radius: 6px;
                        font-size: 11px;
                        font-weight: 600;
                        text-transform: uppercase;
                    }
                    .badge.venue-type {
                        background: rgba(59,130,246,0.2);
                        color: #60a5fa;
                    }
                    .badge.tour-type {
                        background: rgba(139,92,246,0.2);
                        color: #a78bfa;
                    }
                    .badge.series-type {
                        background: rgba(34,197,94,0.2);
                        color: #4ade80;
                    }
                    .badge.game-type {
                        background: rgba(212,168,83,0.2);
                        color: #d4a853;
                    }

                    /* Tags */
                    .card-tags {
                        display: flex;
                        flex-wrap: wrap;
                        gap: 6px;
                        margin-bottom: 10px;
                    }
                    .tag {
                        padding: 4px 8px;
                        border-radius: 4px;
                        font-size: 11px;
                        background: rgba(255,255,255,0.08);
                        color: rgba(255,255,255,0.7);
                    }
                    .tag.distance {
                        background: rgba(34,197,94,0.15);
                        color: #4ade80;
                    }
                    .tag.game {
                        background: rgba(255,255,255,0.08);
                    }
                    .tag.region {
                        background: rgba(59,130,246,0.15);
                        color: #60a5fa;
                    }
                    .tag.events {
                        background: rgba(139,92,246,0.15);
                        color: #a78bfa;
                    }
                    .tag.buyin {
                        background: rgba(212,168,83,0.15);
                        color: #d4a853;
                    }
                    .tag.gtd {
                        background: rgba(34,197,94,0.15);
                        color: #4ade80;
                    }
                    .tag.format {
                        background: rgba(239,68,68,0.15);
                        color: #f87171;
                    }

                    /* Card Footer */
                    .card-footer {
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                        padding-top: 12px;
                        border-top: 1px solid rgba(255,255,255,0.06);
                        margin-top: 12px;
                    }
                    .trust-badge {
                        font-size: 12px;
                        font-weight: 500;
                    }
                    .established {
                        font-size: 12px;
                        color: rgba(255,255,255,0.4);
                    }
                    .venue-type {
                        font-size: 12px;
                        color: rgba(255,255,255,0.5);
                    }
                    .card-actions {
                        display: flex;
                        gap: 8px;
                    }
                    .action-btn {
                        padding: 6px 12px;
                        font-size: 12px;
                        font-weight: 500;
                        color: rgba(255,255,255,0.7);
                        text-decoration: none;
                        border: 1px solid rgba(255,255,255,0.15);
                        border-radius: 6px;
                        transition: all 0.2s;
                    }
                    .action-btn:hover {
                        background: rgba(255,255,255,0.05);
                    }
                    .action-btn.primary {
                        background: rgba(212,168,83,0.15);
                        border-color: rgba(212,168,83,0.3);
                        color: #d4a853;
                    }

                    /* Tour-specific */
                    .tour-name {
                        margin-top: 10px;
                    }
                    .upcoming-series {
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                        padding: 8px 10px;
                        background: rgba(255,255,255,0.05);
                        border-radius: 6px;
                        margin-top: 10px;
                    }
                    .upcoming-label {
                        font-size: 12px;
                        color: rgba(255,255,255,0.7);
                    }
                    .upcoming-date {
                        font-size: 12px;
                        color: #d4a853;
                    }

                    /* Daily tournaments — Metal day selector */
                    .day-selector {
                        display: flex;
                        justify-content: center;
                        gap: 6px;
                        margin-bottom: 20px;
                        flex-wrap: wrap;
                    }
                    .day-btn {
                        padding: 10px 16px;
                        background: linear-gradient(180deg, rgba(25,35,55,0.85) 0%, rgba(15,23,42,0.92) 100%);
                        border: 1.5px solid rgba(148,163,184,0.12);
                        border-radius: 8px;
                        color: rgba(148,163,184,0.65);
                        font-size: 13px;
                        font-weight: 500;
                        cursor: pointer;
                        transition: all 0.25s;
                        box-shadow:
                            inset 0 1px 0 rgba(255,255,255,0.04),
                            0 2px 4px rgba(0,0,0,0.25);
                    }
                    .day-btn:hover {
                        border-color: rgba(148,163,184,0.25);
                        color: #e2e8f0;
                    }
                    .day-btn.active {
                        background: linear-gradient(180deg, rgba(212,168,83,0.15) 0%, rgba(184,134,11,0.08) 100%);
                        border-color: rgba(212,168,83,0.45);
                        color: #d4a853;
                        box-shadow:
                            inset 0 1px 0 rgba(212,168,83,0.15),
                            0 0 10px rgba(212,168,83,0.1),
                            0 2px 4px rgba(0,0,0,0.3);
                    }
                    .time-badge {
                        padding: 4px 10px;
                        background: rgba(59,130,246,0.2);
                        border-radius: 6px;
                        font-size: 12px;
                        font-weight: 600;
                        color: #60a5fa;
                    }

                    /* --- NEW STYLES --- */

                    /* Favorite Button */
                    .fav-btn {
                        position: absolute;
                        top: 10px;
                        right: 10px;
                        background: rgba(0,0,0,0.4);
                        border: none;
                        border-radius: 50%;
                        width: 32px;
                        height: 32px;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        cursor: pointer;
                        z-index: 2;
                        transition: all 0.2s;
                    }
                    .fav-btn:hover {
                        background: rgba(239,68,68,0.3);
                        transform: scale(1.1);
                    }
                    .fav-btn.active {
                        background: rgba(239,68,68,0.2);
                    }
                    .entity-card {
                        position: relative;
                    }

                    /* Results Bar */
                    .results-bar {
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                        padding: 12px 4px;
                        margin-bottom: 16px;
                        flex-wrap: wrap;
                        gap: 10px;
                    }
                    .results-count {
                        font-size: 15px;
                        color: rgba(255,255,255,0.6);
                        font-weight: 600;
                    }
                    .sort-controls {
                        display: flex;
                        align-items: center;
                        gap: 8px;
                    }
                    .sort-controls label {
                        font-size: 14px;
                        color: rgba(255,255,255,0.5);
                        font-weight: 500;
                    }
                    .sort-select {
                        padding: 10px 14px;
                        background: rgba(15,23,42,0.8);
                        border: 1.5px solid rgba(255,255,255,0.15);
                        border-radius: 8px;
                        color: #fff;
                        font-size: 14px;
                        cursor: pointer;
                    }

                    /* ═══ DUAL VIEW LAYOUT ═══ */
                    .dual-view-layout {
                        display: grid;
                        grid-template-columns: 1fr 420px;
                        gap: 20px;
                        align-items: start;
                    }
                    .dual-view-list {
                        min-width: 0;
                    }
                    .dual-view-map {
                        position: sticky;
                        top: 80px;
                        border-radius: 14px;
                        overflow: hidden;
                        background: linear-gradient(160deg, rgba(16,24,36,0.95) 0%, rgba(10,16,26,0.98) 100%);
                        border: 2px solid rgba(148,163,184,0.14);
                        box-shadow: 0 4px 20px rgba(0,0,0,0.4);
                    }
                    .dual-map-header {
                        display: flex;
                        align-items: center;
                        justify-content: space-between;
                        padding: 12px 16px;
                        border-bottom: 1px solid rgba(148,163,184,0.08);
                    }
                    .dual-map-title {
                        display: flex;
                        align-items: center;
                        gap: 8px;
                        font-size: 15px;
                        font-weight: 700;
                        color: #d4a853;
                        margin: 0;
                    }
                    .dual-map-count {
                        font-size: 12px;
                        color: rgba(148,163,184,0.5);
                        font-weight: 600;
                    }
                    @media (max-width: 1024px) {
                        .dual-view-layout {
                            grid-template-columns: 1fr;
                        }
                        .dual-view-map {
                            position: relative;
                            top: 0;
                            order: -1;
                            max-height: 350px;
                        }
                    }
                    @media (max-width: 768px) {
                        .dual-view-map {
                            max-height: 280px;
                        }
                    }

                    /* Badge Row */
                    .badge-row {
                        display: flex;
                        flex-wrap: wrap;
                        gap: 6px;
                        margin-bottom: 8px;
                    }
                    .mini-badge {
                        padding: 3px 9px;
                        border-radius: 5px;
                        font-size: 11px;
                        font-weight: 700;
                        text-transform: uppercase;
                        letter-spacing: 0.4px;
                    }
                    .live-badge { background: rgba(239,68,68,0.18); color: #ef4444; border: 1px solid rgba(239,68,68,0.4); box-shadow: 0 0 8px rgba(239,68,68,0.2); animation: livePulse 2s ease-in-out infinite; }
                    .checkin-badge { background: rgba(230,81,0,0.15); color: #E65100; border: 1px solid rgba(230,81,0,0.3); cursor: pointer; }
                    @keyframes livePulse { 0%, 100% { box-shadow: 0 0 8px rgba(239,68,68,0.2); } 50% { box-shadow: 0 0 14px rgba(239,68,68,0.35); } }
                    .featured-badge {
                        background: rgba(212,168,83,0.2);
                        color: #d4a853;
                        border: 1px solid rgba(212,168,83,0.3);
                    }
                    .newcomer-badge {
                        background: rgba(34,197,94,0.15);
                        color: #4ade80;
                        border: 1px solid rgba(34,197,94,0.25);
                    }
                    .promo-badge {
                        background: rgba(139,92,246,0.15);
                        color: #a78bfa;
                        border: 1px solid rgba(139,92,246,0.25);
                    }
                    .tourney-badge {
                        background: rgba(239,68,68,0.12);
                        color: #f87171;
                        border: 1px solid rgba(239,68,68,0.2);
                    }

                    /* Card Hours */
                    .card-hours {
                        font-size: 12px;
                        color: rgba(255,255,255,0.5);
                        margin: 0 0 8px;
                        font-style: italic;
                    }

                    /* Quick Actions */
                    .quick-actions {
                        display: flex;
                        gap: 6px;
                        padding-top: 10px;
                        border-top: 1px solid rgba(255,255,255,0.06);
                        margin-top: 8px;
                    }
                    .quick-btn {
                        flex: 1;
                        padding: 7px 10px;
                        border-radius: 6px;
                        font-size: 12px;
                        font-weight: 600;
                        cursor: pointer;
                        border: none;
                        transition: all 0.2s;
                    }
                    .checkin-btn {
                        background: rgba(34,197,94,0.15);
                        color: #4ade80;
                        border: 1px solid rgba(34,197,94,0.3);
                    }
                    .checkin-btn:hover { background: rgba(34,197,94,0.25); }
                    .review-btn {
                        background: rgba(59,130,246,0.15);
                        color: #60a5fa;
                        border: 1px solid rgba(59,130,246,0.3);
                    }
                    .review-btn:hover { background: rgba(59,130,246,0.25); }

                    /* Action bar borders — Metal */
                    .vc3-actions {
                        display: flex;
                        align-items: center;
                        justify-content: space-between;
                        gap: 8px;
                        padding-top: 10px;
                        border-top: 1px solid rgba(148,163,184,0.08);
                        margin-top: 6px;
                    }

                    /* Load More — Metal Button */
                    .load-more {
                        display: flex;
                        justify-content: center;
                        padding: 24px 0;
                    }
                    .load-more-btn {
                        padding: 12px 32px;
                        background: linear-gradient(180deg, rgba(212,168,83,0.12) 0%, rgba(184,134,11,0.06) 100%);
                        border: 1.5px solid rgba(212,168,83,0.3);
                        border-radius: 10px;
                        color: #d4a853;
                        font-size: 14px;
                        font-weight: 500;
                        cursor: pointer;
                        transition: all 0.25s;
                        box-shadow:
                            inset 0 1px 0 rgba(212,168,83,0.1),
                            0 2px 6px rgba(0,0,0,0.3);
                    }
                    .load-more-btn:hover {
                        background: linear-gradient(180deg, rgba(212,168,83,0.2) 0%, rgba(184,134,11,0.12) 100%);
                        border-color: rgba(212,168,83,0.5);
                        box-shadow:
                            inset 0 1px 0 rgba(212,168,83,0.15),
                            0 0 12px rgba(212,168,83,0.1),
                            0 2px 6px rgba(0,0,0,0.3);
                    }

                    /* Live Games */
                    .live-badge {
                        padding: 3px 10px;
                        border-radius: 6px;
                        font-size: 11px;
                        font-weight: 700;
                        background: rgba(239,68,68,0.2);
                        color: #f87171;
                        border: 1px solid rgba(239,68,68,0.4);
                        animation: livePulse 2s ease-in-out infinite;
                    }
                    @keyframes livePulse {
                        0%, 100% { opacity: 1; }
                        50% { opacity: 0.6; }
                    }
                    .live-games-list {
                        display: flex;
                        flex-direction: column;
                        gap: 6px;
                        margin: 8px 0;
                    }
                    .live-game-row {
                        display: flex;
                        align-items: center;
                        gap: 10px;
                        padding: 6px 8px;
                        background: rgba(255,255,255,0.04);
                        border-radius: 6px;
                        font-size: 13px;
                    }
                    .live-game-type {
                        font-weight: 600;
                        color: #d4a853;
                        min-width: 40px;
                    }
                    .live-game-stakes {
                        color: #fff;
                        font-weight: 500;
                    }
                    .live-game-tables {
                        color: rgba(255,255,255,0.5);
                        font-size: 12px;
                    }
                    .live-game-wait {
                        margin-left: auto;
                        font-size: 12px;
                        font-weight: 500;
                    }
                    .live-time {
                        font-size: 11px;
                        color: rgba(255,255,255,0.4);
                    }
                    .live-refresh {
                        display: flex;
                        align-items: center;
                        gap: 8px;
                        font-size: 12px;
                        color: rgba(255,255,255,0.4);
                    }
                    .live-dot {
                        width: 8px;
                        height: 8px;
                        border-radius: 50%;
                        background: #ef4444;
                        animation: livePulse 2s ease-in-out infinite;
                    }
                    .refresh-btn {
                        padding: 4px 12px;
                        background: rgba(255,255,255,0.1);
                        border: 1px solid rgba(255,255,255,0.15);
                        border-radius: 6px;
                        color: rgba(255,255,255,0.7);
                        font-size: 12px;
                        cursor: pointer;
                    }
                    .refresh-btn:hover { background: rgba(255,255,255,0.15); }
                    .live-count {
                        background: rgba(239,68,68,0.3) !important;
                    }

                    /* View Toggle */
                    .view-toggle {
                        display: flex;
                        gap: 4px;
                    }
                    .view-btn {
                        display: flex;
                        align-items: center;
                        gap: 6px;
                        padding: 6px 14px;
                        background: rgba(0,0,0,0.3);
                        border: 1px solid rgba(255,255,255,0.1);
                        border-radius: 8px;
                        color: rgba(255,255,255,0.5);
                        font-size: 12px;
                        cursor: pointer;
                        transition: all 0.2s;
                    }
                    .view-btn.active {
                        background: rgba(212,168,83,0.15);
                        border-color: rgba(212,168,83,0.3);
                        color: #d4a853;
                    }

                    /* Calendar View */
                    .calendar-view {
                        display: grid;
                        gap: 24px;
                    }
                    .calendar-month {
                        background: rgba(15,23,42,0.5);
                        border: 1px solid rgba(255,255,255,0.1);
                        border-radius: 12px;
                        padding: 16px;
                    }
                    .calendar-month-title {
                        font-size: 18px;
                        font-weight: 600;
                        color: #d4a853;
                        margin: 0 0 12px;
                        text-align: center;
                    }
                    .calendar-grid-header {
                        display: grid;
                        grid-template-columns: repeat(7, 1fr);
                        gap: 2px;
                        margin-bottom: 4px;
                    }
                    .cal-header-cell {
                        text-align: center;
                        font-size: 11px;
                        color: rgba(255,255,255,0.4);
                        padding: 6px 0;
                        font-weight: 600;
                    }
                    .calendar-grid-body {
                        display: grid;
                        grid-template-columns: repeat(7, 1fr);
                        gap: 2px;
                    }
                    .cal-cell {
                        min-height: 60px;
                        padding: 4px;
                        background: rgba(0,0,0,0.2);
                        border-radius: 6px;
                        border: 1px solid rgba(255,255,255,0.05);
                    }
                    .cal-cell.empty {
                        background: transparent;
                        border: none;
                    }
                    .cal-cell.today {
                        border-color: rgba(212,168,83,0.4);
                        background: rgba(212,168,83,0.08);
                    }
                    .cal-cell.has-events {
                        background: rgba(59,130,246,0.06);
                    }
                    .cal-day-num {
                        display: block;
                        font-size: 11px;
                        color: rgba(255,255,255,0.5);
                        margin-bottom: 2px;
                    }
                    .cal-cell.today .cal-day-num {
                        color: #d4a853;
                        font-weight: 700;
                    }
                    .cal-event {
                        padding: 1px 4px;
                        border-radius: 3px;
                        font-size: 9px;
                        font-weight: 700;
                        margin-bottom: 1px;
                        cursor: pointer;
                        white-space: nowrap;
                        overflow: hidden;
                        text-overflow: ellipsis;
                    }
                    .cal-event:hover {
                        opacity: 0.8;
                    }
                    .cal-more {
                        font-size: 9px;
                        color: rgba(255,255,255,0.4);
                        text-align: center;
                    }

                    /* Search History Dropdown */
                    .search-input-wrapper {
                        flex: 1;
                        position: relative;
                    }
                    .search-input-wrapper input {
                        width: 100%;
                        padding: 14px 16px 14px 48px;
                        background: rgba(0,0,0,0.3);
                        border: 1px solid rgba(255,255,255,0.15);
                        border-radius: 12px;
                        color: #fff;
                        font-size: 15px;
                        outline: none;
                    }
                    .search-input-wrapper input:focus {
                        border-color: rgba(212,168,83,0.5);
                    }
                    .search-input-wrapper input::placeholder { color: rgba(255,255,255,0.4); }
                    .search-history-dropdown {
                        position: absolute;
                        top: calc(100% + 4px);
                        left: 0;
                        right: 0;
                        background: rgba(15,23,42,0.98);
                        border: 1px solid rgba(255,255,255,0.15);
                        border-radius: 10px;
                        overflow: hidden;
                        z-index: 50;
                        box-shadow: 0 8px 24px rgba(0,0,0,0.4);
                    }
                    .search-history-header {
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                        padding: 8px 12px;
                        border-bottom: 1px solid rgba(255,255,255,0.1);
                        font-size: 11px;
                        color: rgba(255,255,255,0.4);
                    }
                    .search-history-header button {
                        background: none;
                        border: none;
                        color: #d4a853;
                        font-size: 11px;
                        cursor: pointer;
                    }
                    .search-history-item {
                        display: flex;
                        align-items: center;
                        gap: 10px;
                        width: 100%;
                        padding: 10px 12px;
                        background: transparent;
                        border: none;
                        color: rgba(255,255,255,0.7);
                        font-size: 14px;
                        text-align: left;
                        cursor: pointer;
                    }
                    .search-history-item:hover {
                        background: rgba(255,255,255,0.05);
                    }

                    /* Loading Skeletons */
                    .skeleton-card {
                        min-height: 180px;
                    }
                    .skel {
                        border-radius: 6px;
                        background: linear-gradient(90deg, rgba(255,255,255,0.02) 25%, rgba(212,168,83,0.06) 50%, rgba(255,255,255,0.02) 75%);
                        background-size: 400% 100%;
                        animation: shimmer 1.8s cubic-bezier(0.4, 0, 0.2, 1) infinite;
                        box-shadow: inset 0 0 0 1px rgba(255,255,255,0.02);
                        overflow: hidden;
                        position: relative;
                    }
                    .skel::after {
                        content: '';
                        position: absolute;
                        inset: 0;
                        background: linear-gradient(90deg, transparent, rgba(255,255,255,0.02), transparent);
                        transform: skewX(-20deg) translateX(-150%);
                        animation: shimmer-glare 1.8s cubic-bezier(0.4, 0, 0.2, 1) infinite;
                    }
                    @keyframes shimmer {
                        0% { background-position: 100% 0; }
                        100% { background-position: -100% 0; }
                    }
                    @keyframes shimmer-glare {
                        0% { transform: skewX(-20deg) translateX(-150%); }
                        100% { transform: skewX(-20deg) translateX(150%); }
                    }
                    .skel-header {
                        height: 20px;
                        width: 60%;
                        margin-bottom: 12px;
                    }
                    .skel-title {
                        height: 16px;
                        width: 80%;
                        margin-bottom: 10px;
                    }
                    .skel-text {
                        height: 12px;
                        width: 50%;
                        margin-bottom: 10px;
                    }
                    .skel-tags {
                        height: 24px;
                        width: 70%;
                        margin-bottom: 12px;
                    }
                    .skel-footer {
                        height: 32px;
                        width: 100%;
                    }

                    /* Filter Panel Controls */
                    .filter-group {
                        margin-bottom: 20px;
                    }
                    .filter-group label {
                        display: block;
                        font-size: 13px;
                        color: rgba(255,255,255,0.6);
                        margin-bottom: 10px;
                        font-weight: 500;
                    }
                    .filter-chips {
                        display: flex;
                        flex-wrap: wrap;
                        gap: 8px;
                    }
                    .chip {
                        padding: 8px 16px;
                        background: rgba(0,0,0,0.4);
                        border: 1px solid rgba(255,255,255,0.1);
                        border-radius: 20px;
                        color: rgba(255,255,255,0.7);
                        font-size: 13px;
                        font-weight: 500;
                        cursor: pointer;
                        transition: all 0.2s;
                    }
                    .chip:hover {
                        background: rgba(255,255,255,0.1);
                        border-color: rgba(255,255,255,0.2);
                        color: #fff;
                    }
                    .chip.active {
                        background: rgba(212,168,83,0.2);
                        border-color: rgba(212,168,83,0.5);
                        color: #d4a853;
                    }

                    /* ═══ CITY AUTOCOMPLETE DROPDOWN ═══ */
                    .city-autocomplete {
                        background: rgba(15,23,42,0.98);
                        border: 1px solid rgba(255,255,255,0.15);
                        border-radius: 10px;
                        overflow: hidden;
                        margin-bottom: 12px;
                        box-shadow: 0 8px 24px rgba(0,0,0,0.4);
                    }
                    .city-suggestion {
                        display: flex;
                        align-items: center;
                        gap: 10px;
                        width: 100%;
                        padding: 12px 14px;
                        background: transparent;
                        border: none;
                        border-bottom: 1px solid rgba(255,255,255,0.06);
                        color: rgba(255,255,255,0.8);
                        font-size: 14px;
                        text-align: left;
                        cursor: pointer;
                        transition: background 0.15s;
                    }
                    .city-suggestion:last-child { border-bottom: none; }
                    .city-suggestion:hover {
                        background: rgba(212,168,83,0.1);
                        color: #d4a853;
                    }

                    /* ═══ PULL-TO-REFRESH ═══ */
                    .pull-indicator {
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        overflow: hidden;
                        font-size: 13px;
                        color: rgba(255,255,255,0.6);
                        transition: height 0.15s;
                    }
                    .pull-spinner {
                        animation: spin 0.8s linear infinite;
                    }
                    @keyframes spin {
                        to { transform: rotate(360deg); }
                    }

                    /* ═══ FETCH ERROR BANNER ═══ */
                    .fetch-error-banner {
                        display: flex;
                        align-items: center;
                        gap: 10px;
                        padding: 12px 16px;
                        margin-bottom: 12px;
                        background: rgba(239,68,68,0.12);
                        border: 1px solid rgba(239,68,68,0.3);
                        border-radius: 10px;
                        color: #f87171;
                        font-size: 13px;
                        font-weight: 500;
                        cursor: pointer;
                        transition: background 0.2s;
                    }
                    .fetch-error-banner:hover {
                        background: rgba(239,68,68,0.2);
                    }

                    /* ═══ PUSH NOTIFICATION OPT-IN ═══ */
                    .push-optin-banner {
                        display: flex;
                        align-items: center;
                        gap: 10px;
                        padding: 10px 14px;
                        margin-bottom: 12px;
                        background: rgba(59,130,246,0.1);
                        border: 1px solid rgba(59,130,246,0.2);
                        border-radius: 10px;
                        font-size: 13px;
                        color: rgba(255,255,255,0.7);
                        flex-wrap: wrap;
                    }
                    .push-optin-banner span {
                        flex: 1;
                        min-width: 180px;
                    }
                    .push-optin-banner button:first-of-type {
                        padding: 6px 16px;
                        background: rgba(59,130,246,0.25);
                        border: 1px solid rgba(59,130,246,0.4);
                        border-radius: 8px;
                        color: #60a5fa;
                        font-size: 12px;
                        font-weight: 600;
                        cursor: pointer;
                    }

                    /* ═══ FAVORITES BADGE VARIANT ═══ */
                    .mtab-badge.fav {
                        background: #ef4444;
                    }

                    /* Mobile Filter Drawer */
                    @media (max-width: 768px) {
                        .filter-panel {
                            position: fixed !important;
                            bottom: 0 !important;
                            left: 0 !important;
                            right: 0 !important;
                            top: auto !important;
                            margin: 0 !important;
                            border-radius: 16px 16px 0 0 !important;
                            max-height: 70vh;
                            overflow-y: auto;
                            z-index: 1000;
                            box-shadow: 0 -8px 32px rgba(0,0,0,0.5);
                            padding: 20px 16px !important;
                        }
                        .filter-panel::before {
                            content: '';
                            display: block;
                            width: 40px;
                            height: 4px;
                            background: rgba(255,255,255,0.2);
                            border-radius: 2px;
                            margin: 0 auto 16px;
                        }
                    }

                    /* ═══ MOBILE TAB BAR — Metal Navigation Rail ═══ */
                    .mobile-tab-bar {
                        display: none;
                    }
                    @media (max-width: 768px) {
                        .mobile-tab-bar {
                            display: flex;
                            justify-content: space-between;
                            gap: 2px;
                            padding: 6px 8px;
                            margin: -8px 4px 8px;
                            background: linear-gradient(180deg, rgba(20,30,48,0.96) 0%, rgba(10,16,28,0.98) 100%);
                            border: 2px solid rgba(148,163,184,0.15);
                            border-radius: 12px;
                            overflow-x: auto;
                            -webkit-overflow-scrolling: touch;
                            position: sticky;
                            top: 8px;
                            z-index: 100;
                            box-shadow:
                                inset 0 1px 0 rgba(255,255,255,0.06),
                                inset 0 -1px 0 rgba(0,0,0,0.4),
                                0 4px 20px rgba(0,0,0,0.5),
                                0 1px 3px rgba(0,0,0,0.3);
                        }
                    }
                    .mtab {
                        flex: 1;
                        display: flex;
                        flex-direction: column;
                        align-items: center;
                        gap: 2px;
                        padding: 8px 4px;
                        border-radius: 8px;
                        background: transparent;
                        border: 1px solid transparent;
                        cursor: pointer;
                        transition: all 0.25s;
                        position: relative;
                        min-width: 0;
                        color: rgba(148,163,184,0.55);
                    }
                    .mtab:hover {
                        background: rgba(148,163,184,0.08);
                        color: rgba(200,214,229,0.7);
                    }
                    .mtab.active {
                        background: linear-gradient(180deg, rgba(212,168,83,0.14) 0%, rgba(184,134,11,0.06) 100%);
                        border-color: rgba(212,168,83,0.3);
                        color: #d4a853;
                        box-shadow:
                            inset 0 -2px 0 #d4a853,
                            inset 0 0 8px rgba(212,168,83,0.1),
                            0 0 10px rgba(212,168,83,0.12);
                    }
                    .mtab-icon {
                        font-size: 16px;
                        line-height: 1;
                        transition: filter 0.25s;
                    }
                    .mtab.active .mtab-icon {
                        filter: drop-shadow(0 0 6px rgba(212,168,83,0.4));
                    }
                    .mtab-label {
                        font-size: 9px;
                        font-weight: 600;
                        color: rgba(148,163,184,0.55);
                        text-transform: uppercase;
                        letter-spacing: 0.3px;
                        transition: color 0.25s;
                    }
                    .mtab:hover .mtab-label {
                        color: rgba(200,214,229,0.65);
                    }
                    .mtab.active .mtab-label {
                        color: #d4a853;
                    }
                    .mtab-badge {
                        position: absolute;
                        top: 2px;
                        right: 4px;
                        background: #ef4444;
                        color: #fff;
                        font-size: 8px;
                        font-weight: 700;
                        padding: 1px 4px;
                        border-radius: 8px;
                        min-width: 14px;
                        text-align: center;
                        animation: livePulse 2s ease-in-out infinite;
                    }

                    /* ═══ MAP RECENTER BUTTON ═══ */
                    .map-recenter-btn {
                        display: flex;
                        align-items: center;
                        gap: 8px;
                        margin: 8px 0;
                        padding: 10px 16px;
                        background: rgba(59,130,246,0.15);
                        border: 1px solid rgba(59,130,246,0.3);
                        border-radius: 10px;
                        color: #60a5fa;
                        font-size: 13px;
                        font-weight: 600;
                        cursor: pointer;
                        transition: all 0.2s;
                    }
                    .map-recenter-btn:hover {
                        background: rgba(59,130,246,0.25);
                    }

                    /* ═══ ROOM DISTANCE LABEL ═══ */
                    .room-distance {
                        color: #4ade80;
                        font-weight: 500;
                    }

                    /* ═══ COMPREHENSIVE MOBILE OPTIMIZATION ═══ */

                    /* Base: padding/margin reductions */
                    @media (max-width: 640px) {
                        .pnm-page {
                            padding-bottom: 24px;
                        }
                        .pnm-hud-panel {
                            padding: 0 2px;
                        }
                        .hud-content-overlay {
                            padding: 16% 12% 10%;
                        }
                        .pnm-content {
                            padding: 0 10px;
                        }
                        .results-bar {
                            flex-direction: column;
                            align-items: flex-start;
                            gap: 6px;
                            padding: 8px 0;
                        }
                        .quick-actions {
                            flex-wrap: wrap;
                        }

                        /* Card grid: single column on mobile */
                        .card-grid {
                            grid-template-columns: 1fr !important;
                            gap: 12px;
                        }
                        .entity-card {
                            padding: 14px;
                        }
                        .entity-card h4 {
                            font-size: 15px;
                        }

                        /* Day selector: horizontal scroll */
                        .day-selector {
                            justify-content: flex-start;
                            flex-wrap: nowrap;
                            overflow-x: auto;
                            -webkit-overflow-scrolling: touch;
                            gap: 4px;
                            padding-bottom: 4px;
                        }
                        .day-btn {
                            flex-shrink: 0;
                            padding: 8px 12px;
                            font-size: 12px;
                        }

                        /* Calendar */
                        .cal-cell {
                            min-height: 40px;
                            padding: 2px;
                        }
                        .cal-event {
                            font-size: 7px;
                        }
                        .calendar-month {
                            padding: 8px;
                        }
                        .calendar-month-title {
                            font-size: 16px;
                        }

                        /* Map */
                        .map-header-row {
                            flex-direction: column;
                            align-items: flex-start;
                            gap: 4px;
                        }
                        .map-title {
                            font-size: 18px;
                        }
                        .map-filter-chips {
                            overflow-x: auto;
                            -webkit-overflow-scrolling: touch;
                            flex-wrap: nowrap;
                            padding-bottom: 4px;
                        }
                        .filter-chip {
                            flex-shrink: 0;
                            padding: 6px 10px;
                            font-size: 12px;
                        }
                        .room-list-grid {
                            grid-template-columns: 1fr !important;
                            gap: 10px;
                        }
                        .room-list-card {
                            padding: 12px;
                        }
                        .map-recenter-btn {
                            width: 100%;
                            justify-content: center;
                        }

                        /* Filter chips */
                        .filter-chips {
                            overflow-x: auto;
                            -webkit-overflow-scrolling: touch;
                            flex-wrap: nowrap;
                            padding-bottom: 4px;
                        }
                        .chip {
                            flex-shrink: 0;
                            padding: 6px 12px;
                            font-size: 12px;
                        }

                        /* Live games */
                        .live-game-row {
                            flex-wrap: wrap;
                            gap: 6px;
                        }
                        .live-badge {
                            font-size: 10px;
                        }

                        /* View toggle */
                        .view-toggle {
                            width: 100%;
                        }
                        .view-btn {
                            flex: 1;
                            justify-content: center;
                            font-size: 11px;
                            padding: 6px 8px;
                        }

                        /* Tour cards */
                        .upcoming-series {
                            flex-direction: column;
                            text-align: center;
                            gap: 4px;
                        }

                        /* Sort controls */
                        .sort-controls {
                            width: 100%;
                        }
                        .sort-select {
                            flex: 1;
                        }

                        /* Card actions */
                        .card-actions {
                            flex-wrap: wrap;
                        }
                        .action-btn {
                            flex: 1;
                            text-align: center;
                            min-width: 80px;
                        }

                        /* vc3 Venue card mobile */
                        .vc3-card {
                            padding: 14px 14px 12px;
                            border-radius: 12px;
                        }
                        .vc3-name {
                            font-size: 15px;
                            padding-right: 38px;
                        }
                        .vc3-header {
                            gap: 4px;
                            margin-bottom: 8px;
                        }
                        .vc3-type-badge {
                            font-size: 9.5px;
                            padding: 2px 7px;
                        }
                        .vc3-status-group {
                            gap: 4px;
                        }
                        .vc3-fav {
                            width: 32px; height: 32px;
                            top: 10px; right: 10px;
                        }
                        .vc3-actions {
                            gap: 6px;
                            flex-wrap: nowrap;
                        }
                        .vc3-actions-primary {
                            display: flex !important;
                            flex-wrap: nowrap !important;
                            gap: 5px;
                            overflow-x: auto;
                            -webkit-overflow-scrolling: touch;
                        }
                        .vc3-pill {
                            display: inline-flex !important;
                            align-items: center;
                            padding: 8px 10px;
                            font-size: 11px;
                            min-height: 36px;
                            flex-shrink: 0;
                        }
                        .vc3-icon-btn {
                            width: 36px;
                            height: 36px;
                        }
                        .vc3-live-info {
                            padding: 6px 10px;
                            gap: 12px;
                        }
                        .vc3-games {
                            gap: 4px;
                        }
                        .vc3-game-chip {
                            font-size: 10px;
                            padding: 2px 6px;
                        }

                        /* Search landing */
                        .search-landing, .empty-state, .loading-state {
                            padding: 40px 16px;
                        }

                        /* Load more */
                        .load-more-btn {
                            width: 100%;
                            padding: 14px;
                        }
                    }

                    /* Mobile map sidebar: slide-up drawer instead of hidden */
                    @media (max-width: 1024px) {
                        .map-desktop-layout {
                            grid-template-columns: 1fr !important;
                        }
                        .map-sidebar {
                            display: flex !important;
                            position: fixed;
                            bottom: 0;
                            left: 0;
                            right: 0;
                            z-index: 900;
                            background: rgba(15,23,42,0.98);
                            border-top: 1px solid rgba(255,255,255,0.1);
                            border-radius: 16px 16px 0 0;
                            max-height: 50vh;
                            overflow-y: auto;
                            padding: 20px 16px;
                            box-shadow: 0 -8px 32px rgba(0,0,0,0.5);
                            backdrop-filter: blur(12px);
                            -webkit-backdrop-filter: blur(12px);
                            transform: translateY(calc(100% - 50px));
                            transition: transform 0.3s ease;
                        }
                        .map-sidebar::before {
                            content: 'Filters ▲';
                            display: block;
                            text-align: center;
                            font-size: 12px;
                            font-weight: 600;
                            color: rgba(255,255,255,0.4);
                            margin-bottom: 12px;
                            cursor: pointer;
                        }
                        .map-sidebar:hover,
                        .map-sidebar:focus-within {
                            transform: translateY(0);
                        }
                    }

                    /* Extra-small screens (under 375px) */
                    @media (max-width: 375px) {
                        .mtab-label {
                            font-size: 8px;
                        }
                        .mtab-icon {
                            font-size: 14px;
                        }
                        .pnm-content {
                            padding: 0 6px;
                        }
                        .hud-abs-search-input {
                            font-size: 13px !important;
                        }
                    }
                `}</style>

                    {/* Global styles for Leaflet overrides and user pulse animation */}
                    <style jsx global>{`
                    @keyframes userPulse {
                        0% { transform: scale(1); opacity: 0.6; }
                        50% { transform: scale(2.2); opacity: 0; }
                        100% { transform: scale(1); opacity: 0; }
                    }
                    /* Override Leaflet default cluster styles to match dark theme */
                    .marker-cluster-small,
                    .marker-cluster-medium,
                    .marker-cluster-large {
                        background: transparent !important;
                    }
                    .marker-cluster-small div,
                    .marker-cluster-medium div,
                    .marker-cluster-large div {
                        background: transparent !important;
                    }
                    .venue-popup .leaflet-popup-content-wrapper {
                        border-radius: 10px;
                        box-shadow: 0 4px 20px rgba(0,0,0,0.5);
                        background: #0f172a;
                        color: #fff;
                        border: 1px solid rgba(255,255,255,0.1);
                    }
                    .venue-popup .leaflet-popup-content {
                        margin: 0;
                    }
                    .venue-popup .leaflet-popup-tip {
                        box-shadow: none;
                        background: #0f172a;
                    }
                    .leaflet-container {
                        background: #0f172a !important;
                        font-family: 'Inter', -apple-system, sans-serif;
                    }
                    /* Leaflet controls dark theme */
                    .leaflet-control-zoom a {
                        background: rgba(15,23,42,0.9) !important;
                        color: #fff !important;
                        border-color: rgba(255,255,255,0.15) !important;
                    }
                    .leaflet-control-attribution {
                        background: rgba(15,23,42,0.8) !important;
                        color: rgba(255,255,255,0.3) !important;
                        font-size: 10px !important;
                    }
                    .leaflet-control-attribution a {
                        color: rgba(255,255,255,0.4) !important;
                    }

                    /* Two-Column Map Layout */
                    .map-desktop-layout {
                        display: grid;
                        grid-template-columns: 1fr 320px;
                        gap: 24px;
                        width: 100%;
                    }

                    .map-main-section {
                        display: flex;
                        flex-direction: column;
                        gap: 16px;
                    }

                    .map-header-row {
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                        flex-wrap: wrap;
                        gap: 8px;
                    }
                    .map-title {
                        font-size: 22px;
                        font-weight: 700;
                        color: #fff;
                        margin: 0;
                    }
                    .map-stats {
                        font-size: 13px;
                        color: rgba(255,255,255,0.5);
                    }

                    /* Filter Chips */
                    .map-filter-chips {
                        display: flex;
                        flex-wrap: wrap;
                        gap: 8px;
                    }
                    .filter-chip {
                        display: flex;
                        align-items: center;
                        gap: 6px;
                        padding: 8px 14px;
                        border-radius: 8px;
                        background: linear-gradient(180deg, rgba(25,35,55,0.8) 0%, rgba(15,23,42,0.9) 100%);
                        border: 1.5px solid rgba(148,163,184,0.12);
                        font-size: 13px;
                        color: rgba(148,163,184,0.65);
                        cursor: pointer;
                        transition: all 0.25s;
                        box-shadow:
                            inset 0 1px 0 rgba(255,255,255,0.04),
                            0 2px 4px rgba(0,0,0,0.25);
                    }
                    .filter-chip:hover {
                        border-color: rgba(148,163,184,0.25);
                        color: #e2e8f0;
                    }
                    .filter-chip.active {
                        background: linear-gradient(180deg, rgba(212,168,83,0.15) 0%, rgba(184,134,11,0.08) 100%);
                        border-color: rgba(212,168,83,0.4);
                        color: #d4a853;
                        box-shadow:
                            inset 0 1px 0 rgba(212,168,83,0.12),
                            0 0 8px rgba(212,168,83,0.08);
                    }
                    .chip-dot {
                        width: 8px;
                        height: 8px;
                        border-radius: 50%;
                    }
                    .chip-dot.cash { background: #22c55e; }
                    .chip-dot.mtt { background: #3b82f6; }
                    .chip-dot.live { background: #ef4444; }
                    .chip-dot.stakes { background: #f59e0b; }
                    .chip-dot.rated { background: #d4a853; }

                    /* Room List Below Map */
                    .map-room-list {
                        margin-top: 20px;
                    }
                    .room-list-title {
                        font-size: 18px;
                        font-weight: 600;
                        color: #fff;
                        margin: 0 0 12px 0;
                    }
                    .room-list-grid {
                        display: grid;
                        grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
                        gap: 12px;
                    }
                    .room-list-card {
                        background: linear-gradient(160deg, rgba(18,28,45,0.85) 0%, rgba(10,16,28,0.92) 100%);
                        border: 1.5px solid rgba(148,163,184,0.12);
                        border-radius: 12px;
                        padding: 16px;
                        cursor: pointer;
                        transition: all 0.25s;
                        box-shadow:
                            inset 0 1px 0 rgba(255,255,255,0.04),
                            0 3px 12px rgba(0,0,0,0.3);
                    }
                    .room-list-card:hover {
                        background: linear-gradient(160deg, rgba(20,32,50,0.9) 0%, rgba(12,20,34,0.95) 100%);
                        border-color: rgba(212,168,83,0.3);
                        box-shadow:
                            inset 0 1px 0 rgba(212,168,83,0.06),
                            0 6px 20px rgba(0,0,0,0.4);
                    }
                    .room-card-header {
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                        margin-bottom: 6px;
                    }
                    .room-name {
                        font-size: 15px;
                        font-weight: 600;
                        color: #fff;
                    }
                    .room-hours {
                        font-size: 11px;
                        color: #22c55e;
                        font-weight: 500;
                    }
                    .room-card-location {
                        font-size: 13px;
                        color: rgba(255,255,255,0.5);
                        margin-bottom: 8px;
                    }
                    .room-card-tags {
                        margin-bottom: 12px;
                    }
                    .room-tag {
                        font-size: 12px;
                        color: rgba(255,255,255,0.4);
                    }
                    .room-view-btn {
                        width: 100%;
                        padding: 8px 12px;
                        border-radius: 8px;
                        background: rgba(212,168,83,0.2);
                        border: 1px solid rgba(212,168,83,0.4);
                        color: #d4a853;
                        font-size: 13px;
                        font-weight: 600;
                        cursor: pointer;
                        transition: all 0.2s;
                    }
                    .room-view-btn:hover {
                        background: rgba(212,168,83,0.3);
                    }

                    /* Sidebar Styles */
                    .map-sidebar {
                        display: flex;
                        flex-direction: column;
                        gap: 16px;
                    }
                    .sidebar-filters {
                        background: linear-gradient(160deg, rgba(18,28,45,0.85) 0%, rgba(10,16,28,0.92) 100%);
                        border: 1.5px solid rgba(148,163,184,0.12);
                        border-radius: 12px;
                        padding: 20px;
                        box-shadow:
                            inset 0 1px 0 rgba(255,255,255,0.04),
                            0 4px 16px rgba(0,0,0,0.3);
                    }
                    .sidebar-title {
                        font-size: 16px;
                        font-weight: 600;
                        color: #fff;
                        margin: 0 0 16px 0;
                    }
                    .sidebar-filter-group {
                        margin-bottom: 16px;
                    }
                    .sidebar-label {
                        display: block;
                        font-size: 12px;
                        font-weight: 500;
                        color: rgba(255,255,255,0.5);
                        margin-bottom: 8px;
                        text-transform: uppercase;
                        letter-spacing: 0.5px;
                    }
                    .sidebar-chips {
                        display: flex;
                        flex-wrap: wrap;
                        gap: 6px;
                    }
                    .sidebar-chip {
                        padding: 6px 12px;
                        border-radius: 6px;
                        background: linear-gradient(180deg, rgba(25,35,55,0.75) 0%, rgba(15,23,42,0.85) 100%);
                        border: 1px solid rgba(148,163,184,0.1);
                        font-size: 12px;
                        color: rgba(148,163,184,0.65);
                        cursor: pointer;
                        transition: all 0.25s;
                        box-shadow: inset 0 1px 0 rgba(255,255,255,0.03);
                    }
                    .sidebar-chip:hover {
                        border-color: rgba(148,163,184,0.22);
                        color: #e2e8f0;
                    }
                    .sidebar-chip.active {
                        background: linear-gradient(180deg, rgba(212,168,83,0.14) 0%, rgba(184,134,11,0.07) 100%);
                        border-color: rgba(212,168,83,0.4);
                        color: #d4a853;
                        box-shadow: inset 0 1px 0 rgba(212,168,83,0.1);
                    }
                    .sidebar-range-inputs {
                        display: flex;
                        align-items: center;
                        gap: 8px;
                    }
                    .sidebar-input {
                        flex: 1;
                        padding: 8px 10px;
                        border-radius: 6px;
                        background: rgba(255,255,255,0.06);
                        border: 1px solid rgba(255,255,255,0.1);
                        font-size: 13px;
                        color: #fff;
                    }
                    .sidebar-input::placeholder {
                        color: rgba(255,255,255,0.3);
                    }
                    .range-divider {
                        color: rgba(255,255,255,0.3);
                    }
                    .sidebar-checkboxes {
                        display: grid;
                        grid-template-columns: 1fr 1fr;
                        gap: 8px;
                    }
                    .sidebar-checkbox {
                        display: flex;
                        align-items: center;
                        gap: 6px;
                        font-size: 13px;
                        color: rgba(255,255,255,0.7);
                        cursor: pointer;
                    }
                    .sidebar-checkbox input {
                        accent-color: #d4a853;
                    }
                    .sidebar-apply-btn {
                        width: 100%;
                        padding: 12px;
                        border-radius: 8px;
                        background: linear-gradient(135deg, #d4a853, #b8860b);
                        border: none;
                        font-size: 14px;
                        font-weight: 600;
                        color: #000;
                        cursor: pointer;
                        transition: all 0.2s;
                        margin-top: 8px;
                    }
                    .sidebar-apply-btn:hover {
                        filter: brightness(1.1);
                    }

                    /* Room Detail Panel — Metal Frame */
                    .room-detail-panel {
                        background: linear-gradient(160deg, rgba(18,28,45,0.9) 0%, rgba(10,16,28,0.95) 100%);
                        border: 1.5px solid rgba(148,163,184,0.12);
                        border-radius: 12px;
                        padding: 20px;
                        box-shadow:
                            inset 0 1px 0 rgba(255,255,255,0.04),
                            0 4px 16px rgba(0,0,0,0.3);
                    }
                    .detail-header {
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                        margin-bottom: 8px;
                    }
                    .detail-header h3 {
                        font-size: 16px;
                        font-weight: 600;
                        color: #fff;
                        margin: 0;
                    }
                    .detail-close {
                        background: none;
                        border: none;
                        font-size: 20px;
                        color: rgba(255,255,255,0.5);
                        cursor: pointer;
                    }
                    .detail-location {
                        font-size: 13px;
                        color: rgba(255,255,255,0.5);
                        margin: 0 0 12px 0;
                    }
                    .detail-view-btn {
                        width: 100%;
                        padding: 10px;
                        border-radius: 8px;
                        background: rgba(212,168,83,0.2);
                        border: 1px solid rgba(212,168,83,0.4);
                        color: #d4a853;
                        font-size: 13px;
                        font-weight: 600;
                        cursor: pointer;
                    }

                    /* ═══ GPS LOCATION BANNER ═══ */
                    .gps-location-banner {
                        padding: 0 20px 12px;
                        max-width: 1400px;
                        margin: 0 auto;
                    }
                    .gps-banner-inner {
                        display: flex;
                        align-items: center;
                        gap: 10px;
                        padding: 10px 16px;
                        background: rgba(59, 130, 246, 0.1);
                        border: 1px solid rgba(59, 130, 246, 0.25);
                        border-radius: 12px;
                        backdrop-filter: blur(12px);
                        -webkit-backdrop-filter: blur(12px);
                        animation: gpsBannerSlideIn 0.3s ease-out;
                    }
                    @keyframes gpsBannerSlideIn {
                        from { opacity: 0; transform: translateY(-8px); }
                        to { opacity: 1; transform: translateY(0); }
                    }
                    .gps-pulse-dot {
                        width: 10px;
                        height: 10px;
                        border-radius: 50%;
                        background: #3b82f6;
                        box-shadow: 0 0 0 0 rgba(59, 130, 246, 0.5);
                        animation: gpsDotPulse 2s ease-in-out infinite;
                        flex-shrink: 0;
                    }
                    @keyframes gpsDotPulse {
                        0%, 100% { box-shadow: 0 0 0 0 rgba(59, 130, 246, 0.5); }
                        50% { box-shadow: 0 0 0 6px rgba(59, 130, 246, 0); }
                    }
                    .gps-label {
                        flex: 1;
                        font-size: 13px;
                        color: rgba(255,255,255,0.8);
                        font-weight: 500;
                    }
                    .gps-label strong {
                        color: #60a5fa;
                        font-weight: 700;
                    }
                    .gps-clear-btn {
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        width: 28px;
                        height: 28px;
                        border-radius: 8px;
                        border: 1px solid rgba(255,255,255,0.15);
                        background: rgba(255,255,255,0.06);
                        color: rgba(255,255,255,0.5);
                        cursor: pointer;
                        transition: all 0.2s;
                        flex-shrink: 0;
                    }
                    .gps-clear-btn:hover {
                        background: rgba(239,68,68,0.15);
                        border-color: rgba(239,68,68,0.3);
                        color: #ef4444;
                    }

                    /* ═══ VIEW MODE TOGGLE ═══ */
                    .sort-and-view-controls {
                        display: flex;
                        align-items: center;
                        gap: 12px;
                    }
                    .view-mode-toggle {
                        display: flex;
                        background: rgba(15, 23, 42, 0.6);
                        border: 1px solid rgba(255,255,255,0.12);
                        border-radius: 10px;
                        overflow: hidden;
                    }
                    .view-mode-btn {
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        width: 36px;
                        height: 32px;
                        border: none;
                        background: transparent;
                        color: rgba(255,255,255,0.4);
                        cursor: pointer;
                        transition: all 0.2s;
                    }
                    .view-mode-btn.active {
                        background: rgba(212, 168, 83, 0.2);
                        color: #d4a853;
                    }
                    .view-mode-btn:hover:not(.active) {
                        background: rgba(255,255,255,0.06);
                        color: rgba(255,255,255,0.7);
                    }

                    /* ═══ INLINE MAP CONTAINER (Venues Tab) ═══ */
                    .inline-map-container {
                        margin-top: 4px;
                    }
                    .inline-map-venue-list {
                        margin-top: 16px;
                    }
                    .inline-map-list-title {
                        font-size: 15px;
                        font-weight: 700;
                        color: rgba(255,255,255,0.8);
                        margin: 0 0 12px;
                    }
                    .inline-map-list-scroll {
                        display: grid;
                        grid-template-columns: 1fr;
                        gap: 8px;
                    }
                    @media (min-width: 640px) {
                        .inline-map-list-scroll {
                            grid-template-columns: repeat(2, 1fr);
                        }
                    }
                    @media (min-width: 1024px) {
                        .inline-map-list-scroll {
                            grid-template-columns: repeat(3, 1fr);
                        }
                    }
                    .inline-map-mini-card {
                        padding: 12px 16px;
                        background: rgba(15, 23, 42, 0.7);
                        border: 1px solid rgba(255,255,255,0.1);
                        border-radius: 12px;
                        cursor: pointer;
                        transition: all 0.2s;
                    }
                    .inline-map-mini-card:hover {
                        border-color: rgba(212,168,83,0.3);
                        background: rgba(15, 23, 42, 0.85);
                        transform: translateY(-1px);
                    }
                    .mini-card-name {
                        font-size: 14px;
                        font-weight: 700;
                        color: #f0f4f8;
                        margin-bottom: 3px;
                        white-space: nowrap;
                        overflow: hidden;
                        text-overflow: ellipsis;
                    }
                    .mini-card-loc {
                        font-size: 12px;
                        color: rgba(255,255,255,0.5);
                        margin-bottom: 4px;
                    }
                    .mini-card-dist {
                        color: #4ade80;
                        font-weight: 600;
                    }
                    .mini-card-tags {
                        display: flex;
                        gap: 4px;
                    }
                    .mini-card-tag {
                        padding: 2px 8px;
                        border-radius: 4px;
                        background: rgba(99,102,241,0.15);
                        color: #818cf8;
                        font-size: 10px;
                        font-weight: 600;
                        text-transform: uppercase;
                    }

                    /* GPS button loading animation */
                    .native-gps-btn.loading {
                        opacity: 0.7;
                        pointer-events: none;
                    }

                    @keyframes userPulse {
                        0%, 100% { transform: scale(1); opacity: 0.5; }
                        50% { transform: scale(1.8); opacity: 0; }
                    }
                `}</style>
                      <BottomNavBar />
                      {UpgradePopup}

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
