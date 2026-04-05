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
import useTrainingBus from '../../src/hooks/useTrainingBus';
import useVenueRealtime from '../../src/hooks/useVenueRealtime';
import UniversalHeader from '../../src/components/ui/UniversalHeader';
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
const PAGE_SIZE = 12;
const PAGE_SIZE_DAILY = 50;
const PAGE_SIZE_LIVE = 30;
const LIVE_REFRESH_MS = 120000; // 2 minutes
const SEARCH_DEBOUNCE_MS = 400;
const SEARCH_HISTORY_MAX = 8;
const DEFAULT_RADIUS_MILES = 50;
const RADIUS_TIERS = [50, 100, 200, 500]; // Progressive radius expansion for "Load More"

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

    // [HARDENING] Bind venue component to Supabase postgres_changes for global updates
    useVenueRealtime(() => {
        if (typeof fetchVenues === 'function') {
            fetchVenues({ silent: true });
        }
    });

    // ═══ VIP ACTION GATE ═══
    const { guardAction, UpgradePopup } = useFeatureGate('poker_near_me');

    // Active tab state — persisted with sortBy and seriesViewMode
    const { filters: uiFilters, setFilter: setUiFilter } = usePersistedFilters('poker-near-me', {
        activeTab: 'venues',
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
    const [dbStats, setDbStats] = useState({ total: 0, tournaments: 0, states: 0 });

    // Live table count for map stats (fetched from live-tables API)
    const [liveTableCount, setLiveTableCount] = useState(0);

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

    // ─── Batch fetch venue predictions for "Best Time to Go" card badges ───
    const [venuePredictionsMap, setVenuePredictionsMap] = useState({});
    const venuePredictionsRef = useRef(venuePredictionsMap);
    venuePredictionsRef.current = venuePredictionsMap;
    useEffect(() => {
        if (venues.length === 0) return;
        const newIds = venues
            .map(v => v.id)
            .filter(id => id && !venuePredictionsRef.current[String(id)])
            .slice(0, 50);
        if (newIds.length === 0) return;
        fetch('/api/poker/venue-predictions-batch?venue_ids=' + newIds.join(','))
            .then(r => r.json())
            .then(j => {
                if (j.success && j.predictions) {
                    setVenuePredictionsMap(prev => ({ ...prev, ...j.predictions }));
                }
            })
            .catch(() => { /* silent */ });
    }, [venues]);

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
    // DISABLED on mobile/tablet — tutorials block the entire mobile view
    useEffect(() => {
        if (typeof window !== 'undefined' && window.innerWidth < 900) return; // skip on mobile + tablet
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
                if (saved) {
                    const parsed = JSON.parse(saved);
                    // Reverted: We do not maliciously override radius here because it breaks Back-Button persistence.
                    // The 50-mile enforcement on entry is now handled upstream via Lobby initialization.
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

    // Fetch live table count for map stats header
    useEffect(() => {
        const fetchLiveCount = () => {
            fetch('/api/poker/live-tables')
                .then(r => r.json())
                .then(json => {
                    if (json.metadata && typeof json.metadata.total_tables_running === 'number') {
                        setLiveTableCount(json.metadata.total_tables_running);
                    }
                })
                .catch(() => { /* silent fail */ });
        };
        fetchLiveCount();
        const interval = setInterval(fetchLiveCount, 120000); // refresh every 2 min
        return () => clearInterval(interval);
    }, []);

    // Fetch non-venue data on mount (tours, series, daily tournaments)
    // Venues are fetched AFTER GPS resolves to enforce 50mi radius default
    useEffect(() => {
        fetchAllData({ includeVenues: false });
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // When city or GPS location is set, search for venues
    useEffect(() => {
        if (selectedCity || userLocation) {
            setHasSearched(true);
            fetchVenues();
        }
    }, [selectedCity, userLocation]); // eslint-disable-line react-hooks/exhaustive-deps

    // Auto-request GPS on mount — restore saved location first for instant display
    const gpsAutoRequestedRef = useRef(false);
    useEffect(() => {
        if (gpsAutoRequestedRef.current) return;
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
        const handleBusFavSync = (data) => {
            if (data && data.venueId) {
                setFavorites(prev => {
                    const next = { ...prev };
                    next['venue-' + data.venueId] = Date.now();
                    return next;
                });
            }
            if (data && data.tourId) {
                setFavorites(prev => {
                    const next = { ...prev };
                    next['tour-' + data.tourId] = Date.now();
                    return next;
                });
            }
             if (data && data.seriesId) {
                setFavorites(prev => {
                    const next = { ...prev };
                    next['series-' + data.seriesId] = Date.now();
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
            if (data && data.tourId) {
                setFavorites(prev => {
                    const next = { ...prev };
                    delete next['tour-' + data.tourId];
                    return next;
                });
            }
             if (data && data.seriesId) {
                setFavorites(prev => {
                    const next = { ...prev };
                    delete next['series-' + data.seriesId];
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
            window.removeEventListener('storage', handleStorageSync);
            if (unsubFav) unsubFav();
            if (unsubUnfav) unsubUnfav();
        };
    }, [bus]);

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
                // Rollback on failure
                setFavorites(prev => {
                    const next = { ...prev };
                    if (isCurrentlyFavorited) { next[key] = Date.now(); } else { delete next[key]; }
                    return next;
                });
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
        // Default sort: casinos first, then card rooms, then by trust score descending
        if (effectiveSort === 'default') {
            const VENUE_PRIORITY = { casino: 0, card_room: 1, poker_club: 2, home_game: 3, charity: 4 };
            return [...venueList].sort((a, b) => {
                const typeDiff = (VENUE_PRIORITY[a.venue_type] ?? 5) - (VENUE_PRIORITY[b.venue_type] ?? 5);
                if (typeDiff !== 0) return typeDiff;
                return (b.trust_score || 0) - (a.trust_score || 0);
            });
        }
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
            // GPS takes priority — clear any saved city selection
            localStorage.removeItem('pnm_last_selected_city');
        } catch (e) { /* storage full */ }
        // Re-fetch location-dependent data (daily tournaments); venues handled by userLocation useEffect
        setTimeout(() => { fetchAllData({ includeVenues: false }); }, 0);
        // Resolve city/state asynchronously and persist label
        reverseGeocode(loc.lat, loc.lng).then(label => {
            if (label) {
                setGpsLocationLabel(label);
                // Update saved GPS with human-readable label + lobby page keys
                try {
                    const saved = JSON.parse(localStorage.getItem('sp-user-gps') || '{}');
                    saved.label = label;
                    localStorage.setItem('sp-user-gps', JSON.stringify(saved));
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
    });

    const fetchAllData = async ({ includeVenues = false, silent = false } = {}) => {
        if (!silent) setLoading(true);
        const fetches = [fetchTours(), fetchSeries(), fetchDailyTournaments()];
        if (includeVenues) {
            fetches.push(fetchVenues({ silent }));
        }
        await Promise.all(fetches);
        if (!silent) setLoading(false);
    };

    const fetchVenues = async ({ silent = false, radiusOverride = null } = {}) => {
        if (!silent) setVenueLoading(true);
        setFetchError(null);
        try {
            const params = new URLSearchParams({ limit: '1000' });
            if (selectedCity) {
                params.set('city', selectedCity.name);
                params.set('state', selectedCity.state);
            }
            if (userLocation) {
                params.set('lat', userLocation.lat.toString());
                params.set('lng', userLocation.lng.toString());
                // Use override radius if provided (loadMore case), else read from state
                const effectiveRadius = radiusOverride || filters.radius;
                const miRadius = effectiveRadius === 'Any' ? 5000 : Number(effectiveRadius);
                params.set('radius', String(miRadius));
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
            if (!silent) setLoading(false);
            console.error('Fetch venues error:', e);
            setFetchError('Failed to load venues. Tap to retry.');
            setVenues([]);
        }
        if (!silent) setVenueLoading(false);
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
        if (router.query.sub && MORE_SUB_TABS.includes(router.query.sub)) {
            setActiveMoreTab(String(router.query.sub));
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
            venues={venues}
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
            venuePredictionsMap={venuePredictionsMap}
            router={router}
            onMapVenueClick={onMapVenueClick}
            iframeModal={iframeModal}
            setIframeModal={setIframeModal}
        />
    );
    
    const renderContent = () => {
        if (activeTab === 'map') return (
            <MapTabPanel
                allVenuesForMap={allVenuesForMap}
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
                setIframeModal={setIframeModal}
            />
        );
        if (activeTab === 'live') return (
            <LiveGamesFeed
                venues={allVenuesForMap.length > 0 ? allVenuesForMap : venues}
                userLocation={userLocation}
                favorites={favorites}
                handleToggleFavorite={(venueId, venueData) => toggleFavorite('venue', venueId, null, venueData)}
                router={router}
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
                venuePredictionsMap={venuePredictionsMap}
                setActiveTab={setActiveTab}
                router={router}
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
                    pageDepth={2} 
                    onMenuClick={() => setMenuOpen(true)} 
                    onSettingsClick={() => setMenuOpen(true)} 
                    onBackClick={() => router.push('/hub')}
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

                {/* ═══ PAGE TITLE ═══ */}
                <div className="pnm-title-bar">
                    <h1 className="pnm-title">{activeTab === 'live' ? 'LIVE CASH GAMES' : 'POKER NEAR ME'}</h1>
                    <p className="pnm-subtitle">{allVenuesForMap.length > 0 ? allVenuesForMap.length.toLocaleString() : '---'} Venues &bull; 40 States &bull; Real-Time Data</p>
                </div>

                {/* ═══ MOBILE GPS ACTION ROW — visible only on mobile ═══ */}
                <div className="mobile-gps-row">
                    {!userLocation ? (
                        <button
                            className={'mobile-gps-enable-btn' + (gpsLoading ? ' loading' : '')}
                            onClick={requestGpsLocation}
                            disabled={gpsLoading}
                        >
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <circle cx="12" cy="12" r="3" />
                                <path d="M12 2v4M12 18v4M2 12h4M18 12h4" />
                            </svg>
                            {gpsLoading ? 'Locating...' : 'Enable GPS For Nearby Venues'}
                        </button>
                    ) : gpsLocationLabel ? (
                        <div className="mobile-gps-active">
                            <div className="mobile-gps-pulse" />
                            <div className="mobile-gps-info">
                                <span className="mobile-gps-label-text">Your Location</span>
                                <strong className="mobile-gps-city">{gpsLocationLabel}</strong>
                            </div>
                            <button
                                className="mobile-gps-clear"
                                onClick={() => { setUserLocation(null); setGpsLocationLabel(null); setHasSearched(false); setVenues([]); setNearestDistance(null); }}
                                aria-label="Clear location"
                            >&times;</button>
                        </div>
                    ) : null}
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
                                { key: 'more', label: 'More Tools', icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="1.5" /><circle cx="19" cy="12" r="1.5" /><circle cx="5" cy="12" r="1.5" /></svg> },
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

                        {/* More tools sub-tabs inside sidebar */}
                        {activeTab === 'more' && (
                            <div className="sidebar-sub-nav">
                                {[
                                    { id: 'overview', label: 'All Tools' },
                                    { id: 'roadtrip', label: 'Trip Planner' },
                                    { id: 'social', label: 'Social Feed' },
                                    { id: 'alerts', label: 'Alerts' },
                                    { id: 'nearmenow', label: 'Near Me Now' },
                                    { id: 'tripcost', label: 'Trip Cost' },
                                ].map(sub => (
                                    <button
                                        key={sub.id}
                                        className={'sidebar-sub-tab' + (activeMoreTab === sub.id ? ' active' : '')}
                                        onClick={() => setActiveMoreTab(sub.id)}
                                    >
                                        {sub.label}
                                    </button>
                                ))}
                            </div>
                        )}

                        {/* ─── GPS LOCATION (first item) ─── */}
                        <div className="sidebar-filters">
                            {/* Show GPS button ONLY when not yet active; once active, show location */}
                            {!userLocation && (
                                <button className={'sidebar-gps-btn' + (gpsLoading ? ' loading' : '')} onClick={requestGpsLocation} disabled={gpsLoading}>
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <circle cx="12" cy="12" r="3" />
                                        <path d="M12 2v4M12 18v4M2 12h4M18 12h4" />
                                    </svg>
                                    {gpsLoading ? 'Locating...' : 'Enable GPS'}
                                </button>
                            )}

                            {/* GPS location confirmation — replaces the button once active */}
                            {userLocation && gpsLocationLabel && (
                                <div className="sidebar-gps-label">
                                    <div className="gps-pulse-dot" />
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', color: 'rgba(74,222,128,0.7)', marginBottom: 2 }}>Your Location</div>
                                        <strong style={{ fontSize: 13 }}>{gpsLocationLabel}</strong>
                                    </div>
                                    <button onClick={() => { setUserLocation(null); setGpsLocationLabel(null); setHasSearched(false); setVenues([]); setNearestDistance(null); }} className="sidebar-gps-clear" title="Clear Location">&times;</button>
                                </div>
                            )}

                            {/* ─── SEARCH ─── */}
                            <form className="sidebar-search-form" onSubmit={handleSearch}>
                                <svg className="sidebar-search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
                                </svg>
                                <input
                                    type="text"
                                    className="sidebar-search-input"
                                    placeholder="Search Venues..."
                                    value={searchQuery}
                                    onChange={handleSearchInputChange}
                                    autoComplete="off"
                                />
                            </form>

                            {activeTab === 'venues' && (
                                <>
                                    <div className="sidebar-section-title">Filters</div>

                                    <div className="sidebar-filter-group">
                                        <label>Radius</label>
                                        <select
                                            value={filters.radius}
                                            onChange={e => { setFilters({ ...filters, radius: e.target.value === 'Any' ? 'Any' : Number(e.target.value) }); }}
                                            className="sidebar-select"
                                        >
                                            <option value={25}>25 Mi</option>
                                            <option value={50}>50 Mi</option>
                                            <option value={100}>100 Mi</option>
                                            <option value={200}>200 Mi</option>
                                            <option value={250}>250 Mi</option>
                                            <option value={500}>500 Mi</option>
                                            <option value="Any">Any</option>
                                        </select>
                                    </div>

                                    <div className="sidebar-filter-group">
                                        <label>Venue Type</label>
                                        <select
                                            value={filters.venueType}
                                            onChange={e => setFilters({ ...filters, venueType: e.target.value })}
                                            className="sidebar-select"
                                        >
                                            <option value="all">All</option>
                                            <option value="casino">Casino</option>
                                            <option value="card_room">Card Room</option>
                                            <option value="poker_club">Poker Club</option>
                                            <option value="charity">Charity Room</option>
                                        </select>
                                    </div>

                                    <div className="sidebar-filter-group">
                                        <label>Games</label>
                                        <select
                                            value={filters.hasNLH ? 'NLH' : filters.hasPLO ? 'PLO' : filters.hasMixed ? 'Mixed' : 'all'}
                                            onChange={e => {
                                                const v = e.target.value;
                                                setFilters({ ...filters, hasNLH: v === 'NLH', hasPLO: v === 'PLO', hasMixed: v === 'Mixed' });
                                            }}
                                            className="sidebar-select"
                                        >
                                            <option value="all">All Games</option>
                                            <option value="NLH">NLH</option>
                                            <option value="PLO">PLO</option>
                                            <option value="Mixed">Mixed</option>
                                        </select>
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



                                    {/* ─── APPLY FILTERS BUTTON ─── */}
                                    <button
                                        className="sidebar-apply-filters-btn"
                                        onClick={() => {
                                            setHasSearched(true);
                                            setDisplayCount(prev => ({ ...prev, venues: PAGE_SIZE }));
                                            fetchVenues();
                                        }}
                                    >
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                            <polyline points="20 6 9 17 4 12" />
                                        </svg>
                                        Apply Filters
                                    </button>
                                </>
                            )}
                        </div>
                    </aside>

                    {/* ─── MAIN CONTENT AREA ─── */}
                    <div className="pnm-main">

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
