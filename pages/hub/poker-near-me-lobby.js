/**
 * POKER NEAR ME — LOBBY
 *
 * Architecture:
 *   Layer 1 — Background (LobbyCanvas: cinematic background image, radar, sonar pulses)
 *   Layer 2 — UI Overlay (LobbyOverlay: search, dock, panels)
 *   Layer 3 — Feature Modules (existing components loaded into panels)
 *
 * Data layer:
 *   - API endpoints (/api/poker/venues, etc.)
 *   - Supabase services (favorites, preferences, search history)
 *   - Caching, retry, and analytics logic
 */

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useRouter } from 'next/router';
import dynamic from 'next/dynamic';
import SEOHead from '../../src/components/seo/SEOHead';
import { useAvatar } from '../../src/contexts/AvatarContext';
import UniversalHeader from '../../src/components/ui/UniversalHeader';
import HamburgerMenu from '../../src/components/ui/HamburgerMenu';
import { getMenuConfig } from '../../src/config/hamburgerMenus';
import { getVenueFavorites, addVenueFavorite, removeVenueFavorite } from '../../src/services/pokerNearMeFavorites';
import { haversineMiles } from '../../src/components/poker-near-me/pnm-utils';
import { addSearchHistory as addSearchHistoryToDb, getSearchHistory } from '../../src/services/pokerNearMeSearchHistory';
import { getPokerNearMePreferences, updatePokerNearMePreferences } from '../../src/services/pokerNearMePreferences';
import { supabase } from '../../src/lib/supabase';
import useTrainingBus from '../../src/hooks/useTrainingBus';
import { eventBus, EventType } from '../../src/engine/EventBus';
// BottomNavBar removed — Poker Near Me has its own navigation grid

// ─── Extracted Utilities (Bundle Splitting) ───
import { playClickSound, playPanelOpenSound, playPanelCloseSound } from '../../src/components/poker-near-me/lobby/PnmSoundUtils';
import { cachedFetch, fetchWithRetry, PAGE_SIZE, SEARCH_DEBOUNCE_MS, API_CACHE_TTL, LIVE_REFRESH_MS } from '../../src/components/poker-near-me/lobby/PnmApiCache';

// Dynamic import — 2D lobby background (client-only, no SSR)
const LobbyCanvas = dynamic(
  () => import('../../src/components/poker-near-me/lobby/LobbyCanvas').catch(err => {
    console.error('[PokerNearMeLobby] LobbyCanvas module failed to load:', err);
    return { default: () => null };
  }),
  { ssr: false }
);
const LobbyOverlay = dynamic(
  () => import('../../src/components/poker-near-me/lobby/LobbyOverlay').catch(err => {
    console.error('[PokerNearMeLobby] LobbyOverlay failed to load:', err);
    return { default: () => null };
  }),
  { ssr: false }
);

// Feature modules — loaded into the panel when a pod is clicked
const VenueCard = dynamic(() => import('../../src/components/poker-near-me/VenueCard'), { ssr: false });
const TourCard = dynamic(() => import('../../src/components/poker-near-me/TourCard'), { ssr: false });
const SeriesCard = dynamic(() => import('../../src/components/poker-near-me/NewSeriesVenueCard'), { ssr: false });
const LiveGamesFeed = dynamic(() => import('../../src/components/poker-near-me/LiveGamesFeed'), { ssr: false });
const NearMeNowFeed = dynamic(() => import('../../src/components/poker-near-me/NearMeNowFeed'), { ssr: false });
const VenueCompare = dynamic(() => import('../../src/components/poker-near-me/VenueCompare'), { ssr: false });
const RoadTripPlanner = dynamic(() => import('../../src/components/poker-near-me/RoadTripPlanner'), { ssr: false });
const SocialLayer = dynamic(() => import('../../src/components/poker-near-me/SocialLayer'), { ssr: false });
const TournamentAlerts = dynamic(() => import('../../src/components/poker-near-me/TournamentAlerts'), { ssr: false });
const SeasonalCalendar = dynamic(() => import('../../src/components/poker-near-me/SeasonalCalendar'), { ssr: false });
const TripCostCalculator = dynamic(() => import('../../src/components/poker-near-me/TripCostCalculator'), { ssr: false });
const FilterPanel = dynamic(() => import('../../src/components/poker-near-me/FilterPanel'), { ssr: false });
const VoiceSearch = dynamic(() => import('../../src/components/poker-near-me/VoiceSearch'), { ssr: false });
const VenueReviews = dynamic(() => import('../../src/components/poker-near-me/VenueReviews'), { ssr: false });
const VenueMapPanel = dynamic(() => import('../../src/components/poker-near-me/VenueMapPanel'), { ssr: false });
const ScraperHealthDashboard = dynamic(() => import('../../src/components/poker-near-me/ScraperHealthDashboard'), { ssr: false });
const PeakActivityHeatmap = dynamic(() => import('../../src/components/poker-near-me/PeakActivityHeatmap'), { ssr: false });
const GameTrendsDashboard = dynamic(() => import('../../src/components/poker-near-me/GameTrendsDashboard'), { ssr: false });
const DailyTournamentsPanel = dynamic(() => import('../../src/components/poker-near-me/DailyTournamentsPanel'), { ssr: false });
const VenueGameAlerts = dynamic(() => import('../../src/components/poker-near-me/VenueGameAlerts'), { ssr: false });
const CreateHomeGame = dynamic(() => import('../../src/components/poker-near-me/CreateHomeGame'), { ssr: false });
const GeofenceAlertBanner = dynamic(() => import('../../src/components/poker-near-me/GeofenceAlertBanner'), { ssr: false });
const GlobalSearchOverlay = dynamic(() => import('../../src/components/poker-near-me/GlobalSearchOverlay'), { ssr: false });

// ─── Error Boundary for Pod Content ───
class PodErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { hasError: false, error: null }; }
  static getDerivedStateFromError(error) { return { hasError: true, error }; }
  componentDidCatch(error, info) { console.error(`[PNM] Pod "${this.props.podName}" crashed:`, error, info); }
  render() {
    if (this.state.hasError) {
      return React.createElement('div', { style: { textAlign: 'center', padding: 40, color: 'rgba(200,214,229,0.5)' } },
        React.createElement('div', { style: { fontSize: 36, marginBottom: 12, opacity: 0.3 } }, '\u26A0'),
        React.createElement('p', { style: { fontSize: 15, fontWeight: 600, marginBottom: 8, color: '#f59e0b' } }, `"${this.props.podName}" encountered an error`),
        React.createElement('p', { style: { fontSize: 12, marginBottom: 16, color: 'rgba(200,214,229,0.35)' } }, String(this.state.error?.message || 'Unknown error')),
        React.createElement('button', {
          onClick: () => { this.setState({ hasError: false, error: null }); if (this.props.onReset) this.props.onReset(); },
          style: { padding: '8px 20px', borderRadius: 8, border: '1px solid rgba(212,168,83,0.25)', background: 'rgba(212,168,83,0.08)', color: '#d4a853', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }
        }, 'Reset Pod')
      );
    }
    return this.props.children;
  }
}

// ─── Constants (cache/retry/page-size imported from PnmApiCache) ───

// Popular cities for autocomplete
const POPULAR_CITIES = [
  'Las Vegas, NV', 'Los Angeles, CA', 'Phoenix, AZ', 'Houston, TX', 'Miami, FL',
  'New York, NY', 'Chicago, IL', 'Denver, CO', 'Atlanta, GA', 'Seattle, WA',
  'San Francisco, CA', 'Dallas, TX', 'Orlando, FL', 'San Diego, CA', 'Tampa, FL',
  'Portland, OR', 'Nashville, TN', 'Austin, TX', 'New Orleans, LA', 'Philadelphia, PA',
  'Detroit, MI', 'Minneapolis, MN', 'Boston, MA', 'Sacramento, CA', 'Reno, NV',
  'Atlantic City, NJ', 'Biloxi, MS', 'Tunica, MS', 'Cherokee, NC', 'Tulsa, OK',
];

// Sort options
const SORT_OPTIONS = [
  { value: 'trust', label: 'Trust Score' },
  { value: 'distance', label: 'Distance' },
  { value: 'name', label: 'Name (A-Z)' },
  { value: 'rating', label: 'Rating' },
  { value: 'games', label: 'Active Games' },
  { value: 'newest', label: 'Newest' },
];

// fetchWithRetry imported from PnmApiCache

const POD_FEATURES = {
  search: { title: 'Search Venues', tab: 'venues' },
  nearme: { title: 'Near Me', tab: 'nearnow' },
  homegames: { title: 'Home Games', tab: 'homegames' },
  livegames: { title: 'Live Games', tab: 'live' },
  mapview: { title: 'Map View', tab: 'map' },
  tours: { title: 'Tours', tab: 'tours' },
  calendar: { title: 'Calendar', tab: 'calendar' },
  daily: { title: 'Daily', tab: 'daily' },
  series: { title: 'Series', tab: 'series' },
  roadtrip: { title: 'Trip Planner', tab: 'roadtrip' },
  favorites: { title: 'Saved', tab: 'favorites' },
  social: { title: 'Friends', tab: 'social' },
  alerts: { title: 'Alerts', tab: 'alerts' },
  tripcost: { title: 'Trip Cost Calculator', tab: 'tripcost' },
  compare: { title: 'Compare Venues', tab: 'compare' },
  scraperhealth: { title: 'Scraper Health', tab: 'scraperhealth' },
  peakheatmap: { title: 'Peak Activity', tab: 'peakheatmap' },
  gametrends: { title: 'Game Trends', tab: 'gametrends' },
  gamealerts: { title: 'Game Alerts', tab: 'gamealerts' },
};

// DailyTournamentsPanel — loaded via dynamic import above (Bundle Splitting)

export default function PokerNearMeLobby() {
  const router = useRouter();
  const { user } = useAvatar();
  const userId = user?.id;

  // 🚌 Bus — emit SESSION_START on mount, SESSION_END on unmount
  const bus = useTrainingBus('poker-near-me-lobby');

  // ─── Global EventBus for cross-component communication ───
  // Listen for venue:favorite / venue:unfavorite events on the GLOBAL eventBus
  // NOTE: useTrainingBus returns emit-only helpers — it does NOT support .on() subscriptions.
  //       All listeners MUST use eventBus.on() directly.
  useEffect(() => {
    // --- Semantic Entry Reset ---
    // When hitting the lobby natively, enforce default 50-mile radius
    try {
        if (!sessionStorage.getItem('pnm-radius-set-this-session')) {
            const savedStr = localStorage.getItem('poker-near-me-search-filters');
            let parsed = savedStr ? JSON.parse(savedStr) : {};
            parsed.radius = 50;
            localStorage.setItem('poker-near-me-search-filters', JSON.stringify(parsed));
            // Force Lobby's default pod memory to 50mi immediately
            setFilters(prev => ({ ...prev, nmRadius: '50' }));
            sessionStorage.setItem('pnm-radius-set-this-session', 'true');
        }
    } catch (e) {
        console.warn('Failed to reset radius on entry');
    }

    const unsubFav = eventBus.on('venue:favorite', (event) => {
      const venueId = event?.payload?.venueId || event?.venueId;
      if (venueId) setFavorites(prev => ({ ...prev, [venueId]: true }));
    });
    
    const unsubFilters = eventBus.on('PNM_FILTERS_UPDATED', (event) => {
      const activeFilters = event?.payload || event;
      if (activeFilters && activeFilters.radius) {
         setFilters(prev => ({ 
             ...prev, 
             nmRadius: String(activeFilters.radius) === 'any' ? 'any' : String(activeFilters.radius)
         }));
      }
    });

    const unsubUnfav = eventBus.on('venue:unfavorite', (event) => {
      const venueId = event?.payload?.venueId || event?.venueId;
      if (venueId) {
        setFavorites(prev => {
          const newState = { ...prev };
          delete newState[venueId];
          return newState;
        });
      }
    });
    return () => {
      if (typeof unsubFav === 'function') unsubFav();
      if (typeof unsubUnfav === 'function') unsubUnfav();
      if (typeof unsubFilters === 'function') unsubFilters();
    };
  }, []);

  // ─── Listen for VENUE_CHECKIN_CREATED events to update badge counts in real-time ───
  useEffect(() => {
    const unsub = eventBus.on(EventType.VENUE_CHECKIN_CREATED, (event) => {
      // EventBus wraps data in { type, payload, timestamp, source }
      const venueId = event?.payload?.venueId || event?.venueId;
      if (venueId) {
        setCheckinCounts(prev => ({ ...prev, [String(venueId)]: (prev[String(venueId)] || 0) + 1 }));
      }
    });
    return () => { if (typeof unsub === 'function') unsub(); };
  }, []);

  // ─── Listen for review submissions to refresh review stats for that venue ───
  useEffect(() => {
    const handleReviewSubmitted = (e) => {
      const venueId = e?.detail?.venueId;
      if (!venueId) return;
      // Re-fetch stats for this specific venue to show updated rating
      fetch('/api/poker/reviews?stats_only=true&venue_ids=' + venueId)
        .then(r => r.json())
        .then(j => {
          if (j.success && j.stats) {
            setReviewStatsMap(prev => ({ ...prev, ...j.stats }));
          }
        })
        .catch(() => { /* silent */ });
    };
    window.addEventListener('pnm:review-submitted', handleReviewSubmitted);
    return () => window.removeEventListener('pnm:review-submitted', handleReviewSubmitted);
  }, []);

  // ─── Core State ───
  const [activePod, setActivePod] = useState(null);
  const [showPanel, setShowPanel] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  // ═══ GLOBAL SEARCH OVERLAY ═══
  const [showGlobalSearch, setShowGlobalSearch] = useState(false);
  const [sortBy, setSortBy] = useState('distance');
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState({});
  const [citySuggestions, setCitySuggestions] = useState([]);
  const [showVoiceSearch, setShowVoiceSearch] = useState(false);
  const [selectedVenueForReview, setSelectedVenueForReview] = useState(null);
  const [gpsError, setGpsError] = useState(null);
  const [fetchError, setFetchError] = useState(null);
  const [showLoginPrompt, setShowLoginPrompt] = useState(false);
  const [searchHistory, setSearchHistory] = useState([]);
  const [preferences, setPreferences] = useState({ geofenceAlerts: true, locationEnabled: true, showNewcomerFriendly: true });
  const [prefsLoaded, setPrefsLoaded] = useState(false);
  const [geofenceAlert, setGeofenceAlert] = useState(null);
  const [geofenceStatus, setGeofenceStatus] = useState(null); // 'active' | 'denied' | 'error'
  const geofenceRef = useRef(null);
  // ─── Location Prompt Dismissal (ONE-TIME-AND-DONE) ───
  // Once the user enables location OR dismisses the prompt, we never auto-show it again.
  // Persisted via localStorage (instant, no-auth) + Supabase prefs (cross-device).
  // Also restored from pnm_location_enabled flag (set on GPS success).
  const [locationPromptDismissed, setLocationPromptDismissed] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('pnm_location_prompt_dismissed') === '1'
        || localStorage.getItem('pnm_location_enabled') === '1';
    }
    return false;
  });
  const [globalLeaders, setGlobalLeaders] = useState([]);

  // ─── Data State ───
  const [venues, setVenues] = useState([]);
  const [tours, setTours] = useState([]);
  const [toursLoaded, setToursLoaded] = useState(false);
  const [series, setSeries] = useState([]);
  const [seriesLoaded, setSeriesLoaded] = useState(false);
  const [dailyTournaments, setDailyTournaments] = useState([]);
  // liveGames state removed — LiveGamesFeed manages its own live data via WebSocket
  const [favorites, setFavorites] = useState({});
  const [favoritedVenues, setFavoritedVenues] = useState([]);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [page, setPage] = useState(0);
  const [checkinCounts, setCheckinCounts] = useState({});
  const [liveGameCount, setLiveGameCount] = useState(0);
  const [totalVenueCount, setTotalVenueCount] = useState(0);
  const [todaysTournamentCount, setTodaysTournamentCount] = useState(0);
  const [lastFetchTime, setLastFetchTime] = useState(null);
  const [showTutorial, setShowTutorial] = useState(false);

  // ─── Location State ───
  const [userLocation, setUserLocation] = useState(null);
  const [gpsActive, setGpsActive] = useState(false);
  const [locationToast, setLocationToast] = useState(null); // { city, state } for success toast
  const [showManualLocation, setShowManualLocation] = useState(false);
  const [gpsLoading, setGpsLoading] = useState(false);
  // ─── Smart Permission State ───
  const [permissionState, setPermissionState] = useState('prompt'); // 'prompt' | 'denied' | 'granted'
  const [showEnablePopup, setShowEnablePopup] = useState(false);
  const [deviceType, setDeviceType] = useState('desktop'); // 'ios' | 'android' | 'desktop'
  const [manualCity, setManualCity] = useState('');
  const [manualState, setManualState] = useState('');
  const [locationCity, setLocationCity] = useState('');
  const [locationState, setLocationState] = useState('');
  const locationToastTimeoutRef = useRef(null);

  // ─── Menu config ───
  const menuConfig = useMemo(() => getMenuConfig('poker-near-me', null, {}, {
    replayTutorial: () => { setShowTutorial(true); setMenuOpen(false); },
  }), []);

  // ─── Deep Link: hydration guard ───
  // Prevents the write-back effect from clearing URL params before mount reads them
  const hasHydratedRef = useRef(false);

  // ─── Deep Link: read URL params on mount ───
  // Uses URLSearchParams directly instead of router.query (which can be empty on first render)
  // Panel opening is delayed via double-rAF to survive React #418 hydration mismatches
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const pod = params.get('pod');
    const q = params.get('q');
    if (q) {
      setSearchQuery(q);
      // Deep-link search: fetch venues matching the URL query
      const deepUrl = `/api/poker/venues?limit=200&offset=0&search=${encodeURIComponent(q)}&sort=trust`;
      cachedFetch(deepUrl).then(data => {
        const newVenues = data?.data || data?.venues || (Array.isArray(data) ? data : []);
        setVenues(newVenues);
        setHasMore(newVenues.length >= PAGE_SIZE);
        setPage(0);
      }).catch(err => console.error('Deep-link venue fetch failed:', err));
    }

    if (pod && POD_FEATURES[pod]) {
      // Read filter params from URL for deep-link restoration
      const state = params.get('state');
      const game = params.get('game');
      const sort = params.get('sort');
      const radius = params.get('radius');
      if (state || game || sort || radius) {
        setFilters(prev => ({
          ...prev,
          ...(state ? { selectedState: state, nmState: state } : {}),
          ...(game ? { gameType: game, nmGameType: game } : {}),
          ...(radius ? { radius, nmRadius: radius } : {}),
        }));
        if (sort) setSortBy(sort);
      }
      // Double requestAnimationFrame ensures React has fully committed hydration
      // before we trigger a state update that adds new DOM nodes (the panel).
      // Single rAF isn't enough because React may still be reconciling.
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setActivePod(pod);
          setShowPanel(true);
          hasHydratedRef.current = true;
        });
      });
    } else {
      hasHydratedRef.current = true;
    }
  }, []);

  // ─── Deep Link: write URL params on state change ───
  // IMPORTANT: Use window.history.replaceState — NOT router.replace.
  // router.replace causes a re-render cycle that resets component state,
  // killing the panel and 3D scene. replaceState updates the URL silently.
  useEffect(() => {
    // Skip write-back until mount effect has read the URL params
    if (!hasHydratedRef.current) return;

    const params = new URLSearchParams();
    if (activePod) params.set('pod', activePod);
    if (searchQuery) params.set('q', searchQuery);
    // Persist filter state for shareable URLs
    if (filters.selectedState && filters.selectedState !== 'all') params.set('state', filters.selectedState);
    if (filters.gameType) params.set('game', filters.gameType);
    if (sortBy && sortBy !== 'trust') params.set('sort', sortBy);
    if (filters.radius && filters.radius !== '100') params.set('radius', filters.radius);
    const qs = params.toString();
    const newUrl = qs ? `/hub/poker-near-me-lobby?${qs}` : '/hub/poker-near-me-lobby';
    const currentUrl = window.location.pathname + window.location.search;
    if (currentUrl !== newUrl) {
      window.history.replaceState(null, '', newUrl);
    }
  }, [activePod, searchQuery, filters.selectedState, filters.gameType, sortBy, filters.radius]);

  // ─── Fetch venues ───
  const fetchVenues = useCallback(async (query = '', pageNum = 0, append = false) => {
    setLoading(true);
    setFetchError(null);
    try {
      let url = `/api/poker/venues?limit=${PAGE_SIZE}&offset=${pageNum * PAGE_SIZE}`;
      if (query) url += `&search=${encodeURIComponent(query)}`;
      if (userLocation) {
        url += `&lat=${userLocation.lat}&lng=${userLocation.lng}&radius=50`;
      }
      if (sortBy) url += `&sort=${sortBy}`;
      // Apply filters
      if (filters.gameType) url += `&game_type=${filters.gameType}`;
      if (filters.stakes) url += `&stakes=${filters.stakes}`;
      if (filters.radius) url += `&radius=${filters.radius}`;
      if (filters.venueType) url += `&venue_type=${filters.venueType}`;
      if (filters.selectedState && filters.selectedState !== 'all') url += `&state=${filters.selectedState}`;

      const data = await cachedFetch(url);
      const newVenues = data?.data || data?.venues || (Array.isArray(data) ? data : []);
      if (append) {
        setVenues(prev => [...prev, ...newVenues]);
      } else {
        setVenues(newVenues);
      }
      setHasMore(newVenues.length >= PAGE_SIZE);
      setPage(pageNum);
    } catch (err) {
      console.error('Failed to fetch venues:', err);
      setFetchError('Unable to load venues. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [userLocation, sortBy, filters]);

  // ─── Load more ───
  const loadMore = useCallback(() => {
    fetchVenues(searchQuery, page + 1, true);
  }, [fetchVenues, searchQuery, page]);

  // ─── Fetch tours (traveling tours from poker_tours API) ───
  const fetchTours = useCallback(async () => {
    try {
      let url = '/api/poker/tours?include_series=true';
      // We don't apply userLocation radius here because tours are traveling; we filter them locally based on upcoming stops.
      const data = await cachedFetch(url);
      const tourData = data?.data || data?.tours || (Array.isArray(data) ? data : []);
      setTours(tourData);
    } catch (err) {
      console.error('Failed to fetch tours:', err);
    } finally {
      setToursLoaded(true);
    }
  }, []);

  // ─── Fallback city coordinates for common poker tour locations ───
  const CITY_COORDS = useMemo(() => ({
      'las vegas, nv': { lat: 36.1699, lng: -115.1398 },
      'hollywood, fl': { lat: 26.0112, lng: -80.1495 },
      'atlantic city, nj': { lat: 39.3643, lng: -74.4229 },
      'lincoln, ca': { lat: 38.8916, lng: -121.2930 },
      'durant, ok': { lat: 33.9943, lng: -96.3709 },
      'tampa, fl': { lat: 27.9506, lng: -82.4572 },
      'bell gardens, ca': { lat: 33.9653, lng: -118.1514 },
      'elgin, il': { lat: 42.0354, lng: -88.2826 },
      'lake tahoe, nv': { lat: 39.0968, lng: -120.0324 },
      'tunica, ms': { lat: 34.6846, lng: -90.3829 },
      'biloxi, ms': { lat: 30.3960, lng: -88.8853 },
      'cherokee, nc': { lat: 35.4743, lng: -83.3146 },
      'san diego, ca': { lat: 32.7157, lng: -117.1611 },
      'portland, or': { lat: 45.5155, lng: -122.6789 },
      'council bluffs, ia': { lat: 41.2619, lng: -95.8608 },
      'black hawk, co': { lat: 39.7969, lng: -105.4903 },
      'choctaw, ok': { lat: 35.4976, lng: -97.2687 },
      'shreveport, la': { lat: 32.5252, lng: -93.7502 },
      'new orleans, la': { lat: 29.9511, lng: -90.0715 },
      'kinder, la': { lat: 30.4855, lng: -92.8510 },
      'gulfport, ms': { lat: 30.3674, lng: -89.0928 },
      'marksville, la': { lat: 31.1268, lng: -92.0632 },
      'oklahoma city, ok': { lat: 35.4676, lng: -97.5164 },
      'minneapolis, mn': { lat: 44.9778, lng: -93.2650 },
      'kansas city, mo': { lat: 39.0997, lng: -94.5786 },
      'st. louis, mo': { lat: 38.6270, lng: -90.1994 },
      'los angeles, ca': { lat: 34.0522, lng: -118.2437 },
      'phoenix, az': { lat: 33.4484, lng: -112.0740 },
      'chicago, il': { lat: 41.8781, lng: -87.6298 },
      'detroit, mi': { lat: 42.3314, lng: -83.0458 },
      'bismarck, nd': { lat: 46.8083, lng: -100.7837 },
      'fargo, nd': { lat: 46.8772, lng: -96.7898 },
      'deadwood, sd': { lat: 44.3767, lng: -103.7296 },
      'thackerville, ok': { lat: 33.7918, lng: -97.1303 },
      'gary, in': { lat: 41.5934, lng: -87.3464 },
      'mount pleasant, mi': { lat: 43.5978, lng: -84.7753 },
      'prior lake, mn': { lat: 44.7133, lng: -93.4227 },
      'welch, mn': { lat: 44.5669, lng: -92.7233 },
      'charleston, wv': { lat: 38.3498, lng: -81.6326 },
      'temecula, ca': { lat: 33.4936, lng: -117.1484 },
      'west palm beach, fl': { lat: 26.7153, lng: -80.0534 },
      'jacksonville, fl': { lat: 30.3322, lng: -81.6557 },
      'austin, tx': { lat: 30.2672, lng: -97.7431 },
      'round rock, tx': { lat: 30.5083, lng: -97.6789 },
      'houston, tx': { lat: 29.7604, lng: -95.3698 },
      'san jose, ca': { lat: 37.3382, lng: -121.8863 },
      'commerce, ca': { lat: 33.9975, lng: -118.1597 },
      'bossier city, la': { lat: 32.5160, lng: -93.7321 },
      'fort yates, nd': { lat: 46.0886, lng: -100.6301 },
      'mandan, nd': { lat: 46.8267, lng: -100.8891 },
      'dickinson, nd': { lat: 46.8792, lng: -102.7896 },
      'belcourt, nd': { lat: 48.8411, lng: -99.7457 },
      'philadelphia, pa': { lat: 39.9526, lng: -75.1652 },
      'choctaw, ms': { lat: 32.7693, lng: -89.1170 },
      'robinsonville, ms': { lat: 34.8213, lng: -90.3155 },
      'verona, ny': { lat: 43.1311, lng: -75.5721 },
      'dallas, tx': { lat: 32.7767, lng: -96.7970 },
      'stateline, nv': { lat: 38.9669, lng: -119.9405 },
      'rohnert park, ca': { lat: 38.3396, lng: -122.7011 },
  }), []);

  const getNearestTourDistance = useCallback((tour, userLoc) => {
      if (!userLoc) return null;
      let minDistance = 99999;
      // 1. If tour inherently has coordinates
      if (tour.latitude && tour.longitude) {
          minDistance = haversineMiles(userLoc.lat, userLoc.lng, tour.latitude, tour.longitude);
      }
      
      // 2. Check all upcoming series locations
      const allStops = [
          ...(tour.upcoming_series || []),
          ...(tour.stops_2026 || []),
          ...(tour.series_2026 || [])
      ];
      
      for (const stop of allStops) {
          const locStr = (stop.location || stop.city || '').toLowerCase();
          const cityParts = locStr.includes(',') ? locStr.split(',') : [locStr];
          const cityKey = locStr.trim();
          
          let coords = CITY_COORDS[cityKey];
          if (!coords && cityParts[0]) {
              const justCity = cityParts[0].trim();
              coords = Object.entries(CITY_COORDS).find(([k]) => k.startsWith(justCity + ','))?.[1];
          }
          
          if (coords) {
              const d = haversineMiles(userLoc.lat, userLoc.lng, coords.lat, coords.lng);
              if (d < minDistance) minDistance = d;
          }
      }
      return minDistance === 99999 ? null : minDistance;
  }, [CITY_COORDS]);

  // ─── Fetch favorites ───
  const fetchFavorites = useCallback(async () => {
    if (!userId) return;
    try {
      const favs = await getVenueFavorites(userId);
      const favMap = {};
      const favVenueList = [];
      (favs || []).forEach(f => {
        if (!f || !f.venue_id) return; // skip malformed entries
        favMap[f.venue_id] = true;
        favVenueList.push({
          id: f.venue_id,
          name: f.venue_name || 'Unknown Venue',
          address: f.venue_address || '',
          city: f.venue_city || '',
          state: f.venue_state || '',
          _fromFavorites: true,
        });
      });
      setFavorites(favMap);
      setFavoritedVenues(favVenueList);
    } catch (err) {
      console.error('Failed to fetch favorites:', err);
    }
  }, [userId]);

  // ─── Fetch series (from actual tournament_series table via /api/poker/series) ───
  const fetchSeries = useCallback(async () => {
    try {
      let url = '/api/poker/series?upcoming=true&limit=200';
      if (userLocation) url += `&lat=${userLocation.lat}&lng=${userLocation.lng}&radius=500`;
      const data = await cachedFetch(url);
      const seriesData = data?.data || data?.series || (Array.isArray(data) ? data : []);
      setSeries(seriesData);
    } catch (err) {
      console.error('Failed to fetch series:', err);
    } finally {
      setSeriesLoaded(true);
    }
  }, [userLocation]);

  // ─── Fetch daily tournaments ───
  const fetchDaily = useCallback(async (dayFilter = '') => {
    try {
      let url = '/api/poker/daily-tournaments';
      const params = [];
      if (dayFilter) params.push(`day=${encodeURIComponent(dayFilter)}`);
      if (userLocation) params.push(`lat=${userLocation.lat}&lng=${userLocation.lng}&radius=100`);
      if (params.length > 0) url += '?' + params.join('&');
      const data = await cachedFetch(url);
      if (data?.data) setDailyTournaments(data.data);
      else if (data?.tournaments) setDailyTournaments(data.tournaments);
      else if (Array.isArray(data)) setDailyTournaments(data);
      // Use authoritative count from API (includes venue daily + charity + tour series events)
      if (data?.stats?.total != null) {
        setTodaysTournamentCount(data.stats.total);
      }
    } catch (err) {
      console.error('Failed to fetch daily tournaments:', err);
    }
  }, [userLocation]);

  // ─── Live games are fetched by <LiveGamesFeed> component directly ───

  // ─── Fetch search history ───
  const fetchSearchHistory = useCallback(async () => {
    if (!userId) return;
    try {
      const history = await getSearchHistory(userId, 10);
      setSearchHistory(history || []);
    } catch (err) {
      console.error('Failed to fetch search history:', err);
    }
  }, [userId]);

  // ─── Fetch user preferences ───
  const fetchPreferences = useCallback(async () => {
    if (!userId) {
      setPrefsLoaded(true); // No user — use defaults, allow auto-prompt
      return;
    }
    try {
      const prefs = await getPokerNearMePreferences(userId);
      setPreferences(prefs);
    } catch (err) {
      console.error('Failed to fetch preferences:', err);
    } finally {
      setPrefsLoaded(true);
    }
  }, [userId]);

  // ─── Initial data load — mount only ───
  const didMountRef = useRef(false);
  useEffect(() => {
    if (didMountRef.current) return; // Already loaded
    didMountRef.current = true;
    // Skip default venue fetch if a deep-link search query is present
    // (the deep-link effect already fetched the correct filtered results)
    const deepQ = new URLSearchParams(window.location.search).get('q');
    if (!deepQ) fetchVenues();
    fetchTours();
    fetchSeries();
    fetchDaily();
    fetchFavorites();
    fetchSearchHistory();
    fetchPreferences();
    setLastFetchTime(Date.now());
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Real-time Supabase Data Hydration ───
  useEffect(() => {
    const venueChannel = supabase.channel('public:venues_lobby')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'poker_venues' }, (payload) => {
        setVenues(prev => prev.map(v => v.id === payload.new.id ? { ...v, ...payload.new } : v));
      }).subscribe();
      
    const tourChannel = supabase.channel('public:tours_lobby')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'tour_source_registry' }, (payload) => {
        setTours(prev => prev.map(t => t.id === payload.new.id ? { ...t, ...payload.new } : t));
      }).subscribe();

    const seriesChannel = supabase.channel('public:series_lobby')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'tournament_series' }, (payload) => {
        setSeries(prev => prev.map(s => s.id === payload.new.id ? { ...s, ...payload.new } : s));
      }).subscribe();

    return () => {
      supabase.removeChannel(venueChannel);
      supabase.removeChannel(tourChannel);
      supabase.removeChannel(seriesChannel);
    };
  }, []);

  // ─── Batch fetch check-in counts when venues change ───
  useEffect(() => {
    if (venues.length === 0) return;
    const ids = venues.map(v => v.id).filter(Boolean).join(',');
    if (!ids) return;
    fetch('/api/poker/checkins/batch-counts?venue_ids=' + ids)
      .then(r => r.json())
      .then(j => { if (j.success && j.counts) setCheckinCounts(prev => ({ ...prev, ...j.counts })); })
      .catch(() => { /* silent */ });
  }, [venues]);

  // ─── Batch fetch review stats for venue cards (star ratings) ───
  const [reviewStatsMap, setReviewStatsMap] = useState({});
  const reviewStatsMapRef = useRef(reviewStatsMap);
  reviewStatsMapRef.current = reviewStatsMap;
  useEffect(() => {
    if (venues.length === 0) return;
    // Only fetch stats for IDs we haven't already fetched
    const newIds = venues
      .map(v => v.id)
      .filter(id => id && !reviewStatsMapRef.current[String(id)])
      .slice(0, 50);
    if (newIds.length === 0) return;
    const idStr = newIds.join(',');
    fetch('/api/poker/reviews?stats_only=true&venue_ids=' + idStr)
      .then(r => r.json())
      .then(j => { if (j.success && j.stats) setReviewStatsMap(prev => ({ ...prev, ...j.stats })); })
      .catch(() => { /* silent — review stats are non-critical */ });
  }, [venues]);

  // ─── Fetch global check-in leaderboard (cross-venue top users) ───
  useEffect(() => {
    fetch('/api/poker/checkins/global-leaderboard?period=month')
      .then(r => r.json())
      .then(j => { if (j.success && j.leaders) setGlobalLeaders(j.leaders.slice(0, 5)); })
      .catch(() => {});
  }, []);

  // ─── Fetch live game count + build live data map for VenueCards ───
  const [liveDataMap, setLiveDataMap] = useState({});
  useEffect(() => {
    fetch('/api/poker/live-tables')
      .then(r => r.json())
      .then(j => {
        if (j.metadata?.total_tables_running != null) {
          setLiveGameCount(j.metadata.total_tables_running);
        } else if (j.venues) {
          const total = j.venues.reduce((sum, v) => sum + v.games.reduce((s, g) => s + (g.tables_running || 0), 0), 0);
          setLiveGameCount(total);
        }
        // Build name-keyed map for card injection
        if (Array.isArray(j.venues)) {
          const map = {};
          j.venues.forEach(v => {
            const normName = (v.venue_name || '').toLowerCase()
              .replace(/&/g, 'and').replace(/'/g, '').replace(/-/g, ' ')
              .replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
            const totalTables = v.games.reduce((s, g) => s + (g.tables_running || 0), 0);
            const totalWaiting = v.games.reduce((s, g) => s + (g.players_waiting || 0), 0);
            const liveEntry = { tables_running: totalTables, players_waiting: totalWaiting, games: v.games || [], last_updated: v.last_updated, bravo_slug: v.bravo_slug };
            if (v.bravo_slug) map[v.bravo_slug] = liveEntry;
            if (normName) map[normName] = liveEntry;
          });
          setLiveDataMap(map);
        }
      })
      .catch(() => { /* live game count unavailable */ });
  }, []);

  // Merge live_data into venue objects whenever venues or liveDataMap changes
  useEffect(() => {
    if (venues.length === 0 || Object.keys(liveDataMap).length === 0) return;
    const hasNew = venues.some(v => !v._liveMerged);
    if (!hasNew) return; // all venues already processed, stop
    setVenues(prev => prev.map(venue => {
      if (venue._liveMerged) return venue; // already processed
      const normName = (venue.name || '').toLowerCase()
        .replace(/&/g, 'and').replace(/'/g, '').replace(/-/g, ' ')
        .replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
      const liveEntry = (venue.bravo_slug && liveDataMap[venue.bravo_slug]) || liveDataMap[normName] || null;
      // Always mark as merged — only inject live_data if tables are actually running
      if (liveEntry && liveEntry.tables_running > 0) {
        return { ...venue, _liveMerged: true, live_data: liveEntry };
      }
      return { ...venue, _liveMerged: true };
    }));
  }, [venues, liveDataMap]); // eslint-disable-line react-hooks/exhaustive-deps



  // ─── Fetch total venue count (platform-wide) ───
  useEffect(() => {
    fetch('/data/all-venues.json?v=' + Date.now())
      .then(r => r.json())
      .then(json => {
        const v = json.venues || json.data || json || [];
        const filteredVenues = Array.isArray(v) ? v.filter(venue => venue.venue_type !== 'series' && venue.is_active !== false) : [];
        const count = filteredVenues.length;
        if (count > 0) setTotalVenueCount(count);
      })
      .catch(() => { /* silent */ });
  }, []);

  // ─── Refresh all data callback ───
  const handleRefreshAll = useCallback(() => {
    setLastFetchTime(Date.now());
    fetchVenues(searchQuery);
    fetchTours();
    fetchSeries();
    fetchDaily();
    if (userId) {
      fetchFavorites();
      fetchSearchHistory();
    }
    // Re-fetch live game count
    fetch('/api/poker/live-tables')
      .then(r => r.json())
      .then(j => {
        if (j.metadata?.total_tables_running != null) setLiveGameCount(j.metadata.total_tables_running);
      })
      .catch(() => {});
  }, [fetchVenues, searchQuery, fetchTours, fetchSeries, fetchDaily, fetchFavorites, fetchSearchHistory, userId]);

  // ─── Live games refresh handled by <LiveGamesFeed> component ───

  // ─── Search handler ───
  const searchTimeoutRef = useRef(null);
  useEffect(() => {
    return () => {
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    };
  }, []);

  const handleSearchChange = useCallback((value) => {
    setSearchQuery(value);

    // Dynamic autocomplete — search venues data + popular cities
    if (value.length >= 2) {
      const lower = value.toLowerCase();
      // Search venue names and cities from loaded venues data
      const venueMatches = venues
        .filter(v => (v.name && v.name.toLowerCase().includes(lower)) || (v.city && v.city.toLowerCase().includes(lower)))
        .slice(0, 3)
        .map(v => v.city && v.state ? `${v.city}, ${v.state}` : v.name);
      // Also include popular cities that match
      const cityMatches = POPULAR_CITIES.filter(c => c.toLowerCase().includes(lower)).slice(0, 3);
      // Deduplicate and limit to 6
      const allMatches = [...new Set([...venueMatches, ...cityMatches])].slice(0, 6);
      setCitySuggestions(allMatches);
    } else {
      setCitySuggestions([]);
    }

    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = setTimeout(() => {
      if (value.length >= 2) {
        fetchVenues(value);
        if (userId) {
          addSearchHistoryToDb(userId, value).catch(() => { });
          setSearchHistory(prev => {
            const filtered = prev.filter(h => h.search_query !== value);
            return [{ id: `local-${Date.now()}`, search_query: value, searched_at: new Date().toISOString() }, ...filtered].slice(0, 10);
          });
        }
      }
    }, SEARCH_DEBOUNCE_MS);
  }, [fetchVenues, userId, venues]);

  const handleSearch = useCallback((query) => {
    setCitySuggestions([]);
    if (query) {
      fetchVenues(query);
      // Auto-open the Search panel to show results
      setActivePod('search');
      setShowPanel(true);
    }
  }, [fetchVenues]);

  const handleCitySelect = useCallback((city) => {
    setSearchQuery(city);
    setCitySuggestions([]);
    fetchVenues(city);
    // Auto-open the Search panel to show results for this city
    setActivePod('search');
    setShowPanel(true);
    if (userId) {
      addSearchHistoryToDb(userId, city).catch(() => { });
      // Optimistically update local search history
      setSearchHistory(prev => {
        const filtered = prev.filter(h => h.search_query !== city);
        return [{ id: `local-${Date.now()}`, search_query: city, searched_at: new Date().toISOString() }, ...filtered].slice(0, 10);
      });
    }
  }, [fetchVenues, userId]);

  // ─── Voice search result handler ───
  const handleVoiceResult = useCallback((result) => {
    setShowVoiceSearch(false);
    if (result?.searchQuery) {
      setSearchQuery(result.searchQuery);
      fetchVenues(result.searchQuery);
      // Auto-open the Search panel to show voice search results
      setActivePod('search');
      setShowPanel(true);
    }
    if (result?.filters) {
      setFilters(prev => ({ ...prev, ...result.filters }));
    }
  }, [fetchVenues]);

  // ─── Sort change ───
  const handleSortChange = useCallback((newSort) => {
    setSortBy(newSort);
  }, []);

  // ─── Filter change ───
  const handleFilterChange = useCallback((newFilters) => {
    setFilters(newFilters);
    setShowFilters(false);
  }, []);

  // ─── Re-fetch when sort or filters change ───
  const sortFilterMountRef = useRef(true);
  useEffect(() => {
    // Skip the initial mount — the initial data load effect or deep-link effect
    // already handles the first fetch. This should only re-fetch on CHANGES.
    if (sortFilterMountRef.current) {
      sortFilterMountRef.current = false;
      return;
    }
    // Skip re-fetch when GOAT pod filters change — they do their own API calls
    // This prevents double-fetch race conditions where the stale fetchVenues
    // overwrites the properly-filtered results from triggerNmSearch/doVenueSearch
    if (filters.nmSearched || filters.svHasSearched || filters.hgHasSearched) return;
    fetchVenues(searchQuery);
  }, [sortBy]); // Only re-fetch on sortBy changes, not on every filter change // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Cross-page favorites sync (Native Storage Event) ───
  useEffect(() => {
    const handleStorageSync = (e) => {
      // Listen to cross-tab updates from localStorage 'sp-favorites'
      if (e.key === 'sp-favorites' && e.newValue) {
        try {
          const rawFavs = JSON.parse(e.newValue);
          setFavorites(prev => {
            const next = { ...prev };
            let changed = false;
            // Map venue-* back to lobby venueIds
            const newFavIds = Object.keys(rawFavs)
              .filter(k => k.startsWith('venue-'))
              .map(k => k.replace('venue-', ''));

            // Check for additions
            newFavIds.forEach(vid => {
              if (!next[vid]) {
                next[vid] = true;
                changed = true;
              }
            });
            // Check for removals
            Object.keys(next).forEach(vid => {
              if (!newFavIds.includes(String(vid))) {
                delete next[vid];
                changed = true;
              }
            });
            return changed ? next : prev;
          });
        } catch { }
      }
    };
    window.addEventListener('storage', handleStorageSync);

    return () => {
      window.removeEventListener('storage', handleStorageSync);
    };
  }, []);

  // ─── Cleanup timeouts on unmount (prevent setState on unmounted component) ───
  useEffect(() => {
    return () => {
      if (locationToastTimeoutRef.current) clearTimeout(locationToastTimeoutRef.current);
      if (gpsErrorTimeoutRef.current) clearTimeout(gpsErrorTimeoutRef.current);
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    };
  }, []);

  // ─── Smart Permission & Device Detection ───
  useEffect(() => {
    // Detect device type for platform-specific instructions
    if (typeof navigator !== 'undefined') {
      const ua = navigator.userAgent || '';
      if (/iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) {
        setDeviceType('ios');
      } else if (/android/i.test(ua)) {
        setDeviceType('android');
      } else {
        setDeviceType('desktop');
      }
    }
    // Monitor geolocation permission state (Permissions API)
    if (typeof navigator !== 'undefined' && navigator.permissions) {
      navigator.permissions.query({ name: 'geolocation' }).then(status => {
        setPermissionState(status.state); // 'granted' | 'denied' | 'prompt'
        // Listen for real-time changes (user toggles permission in browser settings)
        status.onchange = () => {
          setPermissionState(status.state);
          if (status.state === 'granted') {
            // Permission just got enabled — auto-trigger GPS
            setShowEnablePopup(false);
            setShowManualLocation(false);
            handleGpsClick({ fromModal: true });
          }
        };
      }).catch(() => {
        // Permissions API not supported — fall back to 'prompt'
        setPermissionState('prompt');
      });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Geofence Proximity Alerts ───
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!userLocation || !preferences.geofenceAlerts) return;
    if (!venues || venues.length === 0) return;

    let gfService = null;

    import('../../src/lib/geofence').then(function (mod) {
      const GeofenceService = mod.default;
      gfService = new GeofenceService();

      import('../../src/lib/pushAlerts').then(function (pushMod) {
        pushMod.requestPermission().then(function (permission) {
          if (permission === 'denied') setGeofenceStatus('denied');
        }).catch(function () {});

        gfService.start(venues, function (venue) {
          pushMod.showVenueAlert(venue, 'checkin');
          setGeofenceAlert(venue);
        });

        setGeofenceStatus('active');
      }).catch(function () {
        gfService.start(venues, function (venue) {
          setGeofenceAlert(venue);
        });
        setGeofenceStatus('active');
      });

      geofenceRef.current = gfService;
    }).catch(function () {
      setGeofenceStatus('error');
    });

    return function () {
      if (geofenceRef.current) {
        geofenceRef.current.stop();
        geofenceRef.current = null;
      }
    };
  }, [userLocation, venues, preferences.geofenceAlerts]);

  // ─── Reverse Geocode: lat/lng → city, state ───
  const reverseGeocode = useCallback(async (lat, lng) => {
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&zoom=10&addressdetails=1`, {
        headers: { 'Accept-Language': 'en' }
      });
      if (!res.ok) return null;
      const data = await res.json();
      const addr = data?.address || {};
      const city = addr.city || addr.town || addr.village || addr.suburb || addr.county || '';
      const state = addr.state || '';
      return { city, state };
    } catch {
      return null;
    }
  }, []);

  // ─── Show location success toast (auto-dismiss after 2s) ───
  const showLocationSuccessToast = useCallback((cityState) => {
    if (locationToastTimeoutRef.current) clearTimeout(locationToastTimeoutRef.current);
    setLocationToast(cityState);
    if (cityState?.city) setLocationCity(cityState.city);
    if (cityState?.state) setLocationState(cityState.state);
    locationToastTimeoutRef.current = setTimeout(() => setLocationToast(null), 2500);
  }, []);

  // ─── GPS Success handler (shared between auto + manual click) ───
  const onGpsSuccess = useCallback(async (pos, options = {}) => {
    const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
    setUserLocation(loc);
    setGpsActive(true);
    setSortBy('distance'); // Auto-switch to distance sort when GPS enables
    // ── ONE-AND-DONE: Mark prompt dismissed permanently on GPS success ──
    // User enabled location — never ask again unless they explicitly turn it off.
    setLocationPromptDismissed(true);
    setShowEnablePopup(false);
    try { localStorage.setItem('pnm_location_prompt_dismissed', '1'); } catch { /* private browsing */ }
    try { localStorage.setItem('pnm_location_enabled', '1'); } catch { /* */ }
    try { localStorage.setItem('pnm_last_location', JSON.stringify(loc)); } catch { /* */ }
    const geo = await reverseGeocode(loc.lat, loc.lng);
    if (geo?.city) {
      showLocationSuccessToast(geo);
      try { localStorage.setItem('pnm_last_city', geo.city); } catch { /* */ }
      try { localStorage.setItem('pnm_last_state', geo.state || ''); } catch { /* */ }
    }
    // Persist enabled state + coordinates to Supabase
    if (userId) {
      updatePokerNearMePreferences(userId, {
        locationEnabled: true,
        lastLocation: loc,
        lastLocationCity: geo?.city || '',
        lastLocationState: geo?.state || '',
        locationEnabledAt: new Date().toISOString(),
        locationPromptDismissed: true,
      }).catch(() => {});
    }
    // Fetch ALL venues with GPS coordinates for distance sorting
    const gpsUrl = `/api/poker/venues?limit=200&offset=0&lat=${loc.lat}&lng=${loc.lng}&radius=250&sort=distance`;
    cachedFetch(gpsUrl).then(data => {
      const newVenues = data?.data || data?.venues || (Array.isArray(data) ? data : []);
      setVenues(newVenues);
      setHasMore(newVenues.length >= PAGE_SIZE);
      setPage(0);
    }).catch(err => console.error('GPS venue fetch failed:', err));
    // GPS updates location + venues silently — user must click search to see results
  }, [reverseGeocode, showLocationSuccessToast, userId]);

  // ─── GPS Click handler (2-tier: high accuracy → low accuracy fallback) ───
  const gpsErrorTimeoutRef = useRef(null);
  const gpsRequestIdRef = useRef(0); // Generation counter to cancel stale GPS callbacks
  const handleGpsClick = useCallback((options = {}) => {
    const { fromModal = false } = options;
    if (gpsErrorTimeoutRef.current) clearTimeout(gpsErrorTimeoutRef.current);

    // Prevent concurrent GPS requests (race condition on rapid clicks)
    if (gpsLoading) return;

    if (gpsActive && !fromModal) {
      setGpsActive(false);
      setGpsLoading(false);
      setUserLocation(null);
      setLocationToast(null);
      setLocationCity('');
      setLocationState('');
      setSortBy('trust'); // Revert to trust sort when GPS disabled
      // Clear persistence — user explicitly turned it off
      try { localStorage.removeItem('pnm_location_enabled'); } catch { /* */ }
      try { localStorage.removeItem('pnm_last_location'); } catch { /* */ }
      try { localStorage.removeItem('pnm_last_city'); } catch { /* */ }
      try { localStorage.removeItem('pnm_last_state'); } catch { /* */ }
      // Keep pnm_location_prompt_dismissed so we don't re-prompt
      if (userId) {
        updatePokerNearMePreferences(userId, { locationEnabled: false }).catch(() => {});
      }
      return;
    }
    if (!navigator.geolocation) {
      setGpsError('GPS not supported on this device');
      setGpsLoading(false);
      gpsErrorTimeoutRef.current = setTimeout(() => setGpsError(null), 3500);
      if (!fromModal) setShowManualLocation(true);
      return;
    }

    setGpsLoading(true);
    setGpsError(null);
    const requestId = ++gpsRequestIdRef.current;

    // ── Tier 1: Try high accuracy (GPS/cellular) — 15s timeout ──
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (gpsRequestIdRef.current !== requestId) return; // Stale callback
        setGpsLoading(false);
        setShowManualLocation(false);
        onGpsSuccess(pos);
      },
      (highAccErr) => {
        // ── PERMISSION DENIED (code 1) — show smart Enable Location popup ──
        if (highAccErr.code === 1) {
          if (gpsRequestIdRef.current !== requestId) return; // Stale callback
          setGpsActive(false);
          setGpsLoading(false);
          setPermissionState('denied');
          setShowEnablePopup(true);
          setShowManualLocation(false); // Don't show manual — show smart popup instead
          if (userId) {
            updatePokerNearMePreferences(userId, { locationEnabled: false }).catch(() => {});
          }
          return;
        }

        // ── Tier 2: Fallback to low accuracy (WiFi/IP-based) — works on desktops ──
        // High accuracy failed (POSITION_UNAVAILABLE or TIMEOUT) — try without GPS
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            if (gpsRequestIdRef.current !== requestId) return; // Stale callback
            setGpsLoading(false);
            setShowManualLocation(false);
            onGpsSuccess(pos);
          },
          (lowAccErr) => {
            if (gpsRequestIdRef.current !== requestId) return; // Stale callback
            setGpsActive(false);
            setGpsLoading(false);
            if (lowAccErr.code === 1) {
              setPermissionState('denied');
              setShowEnablePopup(true);
              setShowManualLocation(false);
            } else {
              setGpsError('Could not determine location — set your location manually below');
              gpsErrorTimeoutRef.current = setTimeout(() => setGpsError(null), 5000);
              setShowManualLocation(true);
            }
            if (userId) {
              updatePokerNearMePreferences(userId, { locationEnabled: false }).catch(() => {});
            }
          },
          { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 }
        );
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 }
    );
  }, [gpsActive, gpsLoading, userId, onGpsSuccess]);

  // ─── Persist dismissal helper (localStorage + Supabase) ───
  const dismissLocationPrompt = useCallback(() => {
    setLocationPromptDismissed(true);
    try { localStorage.setItem('pnm_location_prompt_dismissed', '1'); } catch { /* private browsing */ }
    if (userId) {
      updatePokerNearMePreferences(userId, {
        locationEnabled: false,
        locationPromptDismissed: true,
      }).catch(() => {});
    }
  }, [userId]);

  // ─── Sync Supabase dismissal flag into state (for cross-device persistence) ───
  useEffect(() => {
    if (prefsLoaded && preferences?.locationPromptDismissed && !locationPromptDismissed) {
      setLocationPromptDismissed(true);
      try { localStorage.setItem('pnm_location_prompt_dismissed', '1'); } catch { /* */ }
    }
  }, [prefsLoaded, preferences?.locationPromptDismissed, locationPromptDismissed]);

  // ─── Auto-prompt GPS on first visit / silently re-enable if previously accepted ───
  const gpsAutoRef = useRef(false);
  useEffect(() => {
    if (!prefsLoaded) return; // Wait for real preferences from Supabase before deciding
    if (gpsAutoRef.current || gpsActive) return;
    gpsAutoRef.current = true;

    // Check persisted preferences from Supabase
    const locationPref = preferences?.locationEnabled;
    const savedLoc = preferences?.lastLocation;

    // ── FAST PATH: Restore from localStorage if Supabase hasn't loaded yet ──
    // This provides instant location on page load without waiting for DB.
    let fastLoc = null;
    let fastCity = '';
    let fastState = '';
    if (!savedLoc?.lat && typeof window !== 'undefined') {
      try {
        const lsLoc = localStorage.getItem('pnm_last_location');
        if (lsLoc) {
          fastLoc = JSON.parse(lsLoc);
          fastCity = localStorage.getItem('pnm_last_city') || '';
          fastState = localStorage.getItem('pnm_last_state') || '';
        }
      } catch { /* */ }
    }

    // CASE 1: User PREVIOUSLY DECLINED → do NOT auto-prompt (respect their choice)
    if (locationPref === false && !fastLoc) return;

    // CASE 2: User PREVIOUSLY ACCEPTED → silently re-enable GPS
    // If we have saved coordinates (Supabase or localStorage), use them immediately
    // (instant, no permission prompt). Then silently refresh in background.
    const restoreLoc = (savedLoc?.lat && savedLoc?.lng) ? savedLoc : (fastLoc?.lat && fastLoc?.lng) ? fastLoc : null;
    const restoreCity = (savedLoc?.lat ? preferences?.lastLocationCity : fastCity) || '';
    const restoreState = (savedLoc?.lat ? preferences?.lastLocationState : fastState) || '';

    if ((locationPref === true || fastLoc) && restoreLoc) {
      setUserLocation(restoreLoc);
      setGpsActive(true);
      setSortBy('distance'); // BUG-05 fix: auto-distance sort for returning users
      // ── ONE-AND-DONE: mark prompt dismissed since user previously enabled location ──
      setLocationPromptDismissed(true);
      try { localStorage.setItem('pnm_location_prompt_dismissed', '1'); } catch { /* */ }
      showLocationSuccessToast({
        city: restoreCity,
        state: restoreState,
      });
      // Fetch venues with saved location immediately
      const gpsUrl = `/api/poker/venues?limit=200&offset=0&lat=${restoreLoc.lat}&lng=${restoreLoc.lng}&radius=250&sort=distance`;
      cachedFetch(gpsUrl).then(data => {
        const newVenues = data?.data || data?.venues || (Array.isArray(data) ? data : []);
        setVenues(newVenues);
        setHasMore(newVenues.length >= PAGE_SIZE);
        setPage(0);
      }).catch(() => {});
      // Silently refresh GPS in background for accuracy (no error if it fails)
      if (typeof navigator !== 'undefined' && navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
            setUserLocation(loc);
            const movedSignificantly = Math.abs(loc.lat - restoreLoc.lat) > 0.01 || Math.abs(loc.lng - restoreLoc.lng) > 0.01;
            if (movedSignificantly) {
              const freshUrl = `/api/poker/venues?limit=200&offset=0&lat=${loc.lat}&lng=${loc.lng}&radius=250&sort=distance`;
              cachedFetch(freshUrl).then(data => {
                const newVenues = data?.data || data?.venues || (Array.isArray(data) ? data : []);
                setVenues(newVenues);
                setHasMore(newVenues.length >= PAGE_SIZE);
                setPage(0);
              }).catch(() => {});
              if (userId) {
                reverseGeocode(loc.lat, loc.lng).then(geo => {
                  if (geo?.city) {
                    showLocationSuccessToast(geo);
                    updatePokerNearMePreferences(userId, {
                      locationEnabled: true,
                      lastLocation: loc,
                      lastLocationCity: geo.city,
                      lastLocationState: geo.state || '',
                    }).catch(() => {});
                  }
                }).catch(() => {});
              }
            }
          },
          (highAccErr) => {
            if (highAccErr.code === 1) return;
            navigator.geolocation.getCurrentPosition(
              (pos) => {
                const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
                setUserLocation(loc);
                const movedSignificantly = Math.abs(loc.lat - restoreLoc.lat) > 0.01 || Math.abs(loc.lng - restoreLoc.lng) > 0.01;
                if (movedSignificantly) {
                  const freshUrl = `/api/poker/venues?limit=200&offset=0&lat=${loc.lat}&lng=${loc.lng}&radius=250&sort=distance`;
                  cachedFetch(freshUrl).then(data => {
                    const newVenues = data?.data || data?.venues || (Array.isArray(data) ? data : []);
                    setVenues(newVenues);
                    setHasMore(newVenues.length >= PAGE_SIZE);
                    setPage(0);
                  }).catch(() => {});
                  if (userId) {
                    reverseGeocode(loc.lat, loc.lng).then(geo => {
                      if (geo?.city) {
                        showLocationSuccessToast(geo);
                        updatePokerNearMePreferences(userId, {
                          locationEnabled: true,
                          lastLocation: loc,
                          lastLocationCity: geo.city,
                          lastLocationState: geo.state || '',
                        }).catch(() => {});
                      }
                    }).catch(() => {});
                  }
                }
              },
              () => { /* Both tiers failed — saved location is still good */ },
              { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 }
            );
          },
          { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 }
        );
      };
      return;
    }

    // CASE 3: FIRST VISIT (no saved preference)
    // ── ONE-TIME-AND-DONE: If user already dismissed the prompt, never show it again ──
    if (locationPromptDismissed) return;

    if (typeof navigator !== 'undefined' && navigator.geolocation) {
      if (permissionState === 'granted') {
        // Permission already granted — just acquire GPS silently
        navigator.geolocation.getCurrentPosition(
          (pos) => onGpsSuccess(pos, { silent: false }),
          (firstErr) => {
            if (firstErr.code === 1) {
              setPermissionState('denied');
              setShowEnablePopup(true);
              return;
            }
            navigator.geolocation.getCurrentPosition(
              (pos) => onGpsSuccess(pos, { silent: false }),
              () => { /* Silent fail — don't show manual modal automatically */ },
              { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 }
            );
          },
          { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 }
        );
      } else {
        // Permission state is 'prompt' or 'denied' — show our branded popup (one time only)
        setShowEnablePopup(true);
      }
    }
  }, [prefsLoaded, preferences?.locationEnabled, locationPromptDismissed]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Manual Location Set ───
  const handleManualLocationSet = useCallback(async () => {
    if (!manualCity.trim()) return;
    // Cancel any pending GPS request to prevent overwriting this manual location
    setGpsLoading(false);
    gpsRequestIdRef.current++; // Invalidate any in-flight GPS callbacks
    // Geocode the manual city/state input using Nominatim
    try {
      const query = manualState ? `${manualCity.trim()}, ${manualState}` : manualCity.trim();
      const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1&countrycodes=us`, {
        headers: { 'Accept-Language': 'en' }
      });
      const data = await res.json();
      if (data && data.length > 0) {
        const loc = { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
        setUserLocation(loc);
        setGpsActive(true);
        setSortBy('distance'); // BUG-02 fix: auto-distance sort on manual set
        setShowManualLocation(false);
        showLocationSuccessToast({ city: manualCity.trim(), state: manualState || '' });
        // ── ONE-AND-DONE: Persist to localStorage so user is never re-prompted ──
        setLocationPromptDismissed(true);
        try { localStorage.setItem('pnm_location_prompt_dismissed', '1'); } catch { /* */ }
        try { localStorage.setItem('pnm_location_enabled', '1'); } catch { /* */ }
        try { localStorage.setItem('pnm_last_location', JSON.stringify(loc)); } catch { /* */ }
        try { localStorage.setItem('pnm_last_city', manualCity.trim()); } catch { /* */ }
        try { localStorage.setItem('pnm_last_state', manualState || ''); } catch { /* */ }
        // Persist to Supabase (cross-device)
        if (userId) {
          updatePokerNearMePreferences(userId, {
            locationEnabled: true,
            lastLocation: loc,
            lastLocationCity: manualCity.trim(),
            lastLocationState: manualState || '',
            locationEnabledAt: new Date().toISOString(),
            manualLocation: true,
            locationPromptDismissed: true,
          }).catch(() => {});
        }
        // Fetch venues near this location
        const gpsUrl = `/api/poker/venues?limit=200&offset=0&lat=${loc.lat}&lng=${loc.lng}&radius=250&sort=distance`;
        cachedFetch(gpsUrl).then(result => {
          const newVenues = result?.data || result?.venues || (Array.isArray(result) ? result : []);
          setVenues(newVenues);
          setHasMore(newVenues.length >= PAGE_SIZE);
          setPage(0);
        }).catch(err => console.error('Manual location venue fetch failed:', err));
        // Manual location set — user must click search to see results
      } else {
        setGpsError('Could not find that location — try a different city');
        if (gpsErrorTimeoutRef.current) clearTimeout(gpsErrorTimeoutRef.current);
        gpsErrorTimeoutRef.current = setTimeout(() => setGpsError(null), 3500);
      }
    } catch (err) {
      console.error('Manual geocode failed:', err);
      setGpsError('Geocoding failed — check your connection');
      if (gpsErrorTimeoutRef.current) clearTimeout(gpsErrorTimeoutRef.current);
      gpsErrorTimeoutRef.current = setTimeout(() => setGpsError(null), 3500);
    }
  }, [manualCity, manualState, userId, showLocationSuccessToast]);

  // ─── Pods that require GPS to show meaningful results ───
  const GPS_REQUIRED_PODS = new Set(['nearme', 'mapview', 'livegames']);

  // ─── Pod click → navigate directly to standalone pages ───
  // All 12 lobby grid icons route to their full standalone pages.
  // No more inline panel overlays — every feature gets its own page.
  const POD_ROUTES = {
    nearme:    '/hub/poker-near-me?tab=venues',
    homegames: '/hub/home-games',
    livegames: '/hub/poker-near-me?tab=live',
    tours:     '/hub/poker-tours',
    mapview:   '/hub/poker-near-me?tab=map',
    calendar:  '/hub/events-calendar',
    series:    '/hub/poker-near-me?tab=events&sub=series',
    roadtrip:  '/hub/poker-near-me?tab=more',
    daily:     '/hub/daily-tournaments',
    favorites: '/hub/poker-near-me?tab=saved',
    social:    '/hub/friends',
    alerts:    '/hub/poker-near-me?tab=more',
  };

  const handlePodClick = useCallback((podId) => {
    playClickSound();
    const route = POD_ROUTES[podId];
    if (route) {
      router.push(route);
    }
    // Emit TrainingBus event for pod interaction tracking
    try { bus?.emitHandComplete?.({ action: 'pod_click', pod: podId }); } catch { }
  }, [bus, router]);

  // ─── Auto-open panel for GPS-gated pods after GPS is enabled ───
  // When a user clicks a GPS-required pod without GPS, we set activePod but
  // don't open the panel (show Enable popup instead). This effect watches for
  // GPS activation and auto-opens the panel for the pending pod.
  const prevGpsActiveRef = useRef(gpsActive);
  useEffect(() => {
    if (gpsActive && !prevGpsActiveRef.current && activePod && GPS_REQUIRED_PODS.has(activePod) && !showPanel) {
      setShowPanel(true);
      playPanelOpenSound();
    }
    prevGpsActiveRef.current = gpsActive;
  }, [gpsActive, activePod, showPanel]); // eslint-disable-line react-hooks/exhaustive-deps

  const handlePanelClose = useCallback(() => {
    playPanelCloseSound();
    setShowPanel(false);
    setActivePod(null);
  }, []);

  // ─── Keyboard: Escape to close panel ───
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && showPanel) {
        handlePanelClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showPanel, handlePanelClose]);

  // ─── Favorite toggle ───
  const handleToggleFavorite = useCallback(async (id, dataObj, type = 'venue') => {
    if (!userId && type === 'venue') return; // Venues currently require userId for PG tables
    const token = typeof window !== 'undefined' && window.__supabaseToken;
    if (!token && type !== 'venue') return; // Series/Tours follow API requires JWT
    
    // For venues we use favorites map, for series/tours we will use the same local map for now 
    // to keep UI synchronous, though technically they store in page_followers on backend.
    const wasFavorited = !!favorites[id];
    setFavorites(prev => ({ ...prev, [id]: !wasFavorited }));
    
    const entry = { id, name: dataObj?.name || 'Unknown', address: dataObj?.address || '', city: dataObj?.city || '', state: dataObj?.state || '', _fromFavorites: true, _type: type };
    if (wasFavorited) {
      setFavoritedVenues(prev => prev.filter(f => f.id !== id));
    } else {
      setFavoritedVenues(prev => [...prev, entry]);
    }
    
    try {
      if (type === 'venue') {
        if (wasFavorited) {
          await removeVenueFavorite(userId, id);
          try { eventBus.emit('venue:unfavorite', { venueId: id }, 'PokerNearMe'); } catch { }
        } else {
          await addVenueFavorite(userId, id, dataObj);
          try { eventBus.emit('venue:favorite', { venueId: id, name: dataObj?.name }, 'PokerNearMe'); } catch { }
        }
      } else {
        // Series & Tours routing via Unified Follow API
        const res = await fetch('/api/poker/follow', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
          body: JSON.stringify({
            page_type: type,
            page_id: id,
            action: wasFavorited ? 'unfollow' : 'follow',
          })
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.error || 'Failed to sync follow');
      }
      
      // Write to localStorage to trigger cross-tab state syncing via native 'storage' event
      if (typeof window !== 'undefined') {
        if (type === 'venue') {
          const rawFavs = localStorage.getItem('sp-favorites');
          try {
            const spFavs = rawFavs ? JSON.parse(rawFavs) : {};
            if (wasFavorited) delete spFavs[`venue-${id}`];
            else spFavs[`venue-${id}`] = Date.now();
            localStorage.setItem('sp-favorites', JSON.stringify(spFavs));
          } catch { }
        } else if (type === 'series') {
          // Sync with the Series Detail Page persistence
          try {
            const followed = JSON.parse(localStorage.getItem('followed-series') || '[]');
            const updated = wasFavorited ? followed.filter(x => x !== String(id)) : (followed.includes(String(id)) ? followed : [...followed, String(id)]);
            localStorage.setItem('followed-series', JSON.stringify(updated));
          } catch { }
        }
      }
    } catch (err) {
      console.error(`Failed to toggle favorite for ${type} ${id}:`, err);
      // Full rollback on error — both state maps
      setFavorites(prev => ({ ...prev, [id]: wasFavorited }));
      if (wasFavorited) {
        setFavoritedVenues(prev => [...prev, entry]);
      } else {
        setFavoritedVenues(prev => prev.filter(f => f.id !== id));
      }
    }
  }, [userId, favorites]);

  // ─── Auth-gated venue navigation ───
  const handleVenueNavigate = useCallback((url, venue) => {
    const needsAuth = url.includes('action=checkin') || url.includes('action=review');
    if (needsAuth && !userId) {
      setShowLoginPrompt(true);
      return;
    }
    if (url.includes('action=review') && venue) {
      setSelectedVenueForReview({ id: venue.id, name: venue.name });
    } else {
      router.push(url);
    }
  }, [userId, router]);

  // ─── Build panel content based on active pod ───
  const panelContent = useMemo(() => {
    if (!activePod) return null;
    const feature = POD_FEATURES[activePod];
    if (!feature) return null;

    let component = null;

    switch (activePod) {
      case 'search': {
        // ─── SEARCH VENUES — Search-first (no display-all) ───
        const svState = filters.svState || 'all';
        const svVenueType = filters.svVenueType || 'all';
        const svGameType = filters.svGameType || 'all';
        const svRadius = filters.svRadius || '100';
        const svSort = filters.svSort || (userLocation ? 'distance' : 'trust');
        const svHasSearched = filters.svHasSearched || false;

        // Apply filters
        let svResults = venues;
        if (svState !== 'all') svResults = svResults.filter(v => v.state === svState);
        if (svVenueType !== 'all') svResults = svResults.filter(v => {
          if (svVenueType === 'poker_club') return v.venue_type === 'poker_club' || v.venue_type === 'card_room';
          if (svVenueType === 'poker_tour') return v.venue_type === 'poker_tour' || v.venue_type === 'tour_stop' || v.venue_type === 'tour';
          return v.venue_type === svVenueType;
        });
        if (svGameType !== 'all') {
          svResults = svResults.filter(v => {
            const games = (v.games_offered || []).join(' ').toLowerCase();
            if (svGameType === 'nlh') return games.includes('nlh') || games.includes('hold');
            if (svGameType === 'plo') return games.includes('plo') || games.includes('omaha');
            if (svGameType === 'mixed') return games.includes('mix') || games.includes('horse');
            return true;
          });
        }
        // Distance
        const svCalcDist = (v) => {
          if (!userLocation || !v.latitude || !v.longitude) return 99999;
          const R = 3959;
          const dLat = (v.latitude - userLocation.lat) * Math.PI / 180;
          const dLon = (v.longitude - userLocation.lng) * Math.PI / 180;
          const a = Math.sin(dLat/2)*Math.sin(dLat/2) + Math.cos(userLocation.lat*Math.PI/180)*Math.cos(v.latitude*Math.PI/180)*Math.sin(dLon/2)*Math.sin(dLon/2);
          return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        };
        if (userLocation && svRadius !== 'any') svResults = svResults.filter(v => svCalcDist(v) <= Number(svRadius));
        if (svSort === 'distance' && userLocation) svResults = [...svResults].sort((a, b) => svCalcDist(a) - svCalcDist(b));
        else if (svSort === 'trust') svResults = [...svResults].sort((a, b) => (b.trust_score || 0) - (a.trust_score || 0));
        else if (svSort === 'name') svResults = [...svResults].sort((a, b) => (a.name || '').localeCompare(b.name || ''));

        const doVenueSearch = () => {
          setFilters(prev => ({
            ...prev,
            svHasSearched: true,
            selectedState: prev.svState || 'all',
            venueType: prev.svVenueType === 'all' ? undefined : prev.svVenueType,
            gameType: prev.svGameType === 'all' ? undefined : prev.svGameType,
            radius: prev.svRadius === 'any' ? undefined : prev.svRadius,
          }));
          const apiState = svState !== 'all' ? `&state=${svState}` : '';
          const apiVenueType = svVenueType !== 'all' ? `&venue_type=${svVenueType}` : '';
          const apiRadius = userLocation && svRadius !== 'any' ? `&radius=${svRadius}` : '';
          const apiLoc = userLocation ? `&lat=${userLocation.lat}&lng=${userLocation.lng}` : '';
          const apiSort = svSort ? `&sort=${svSort}` : '';
          const apiUrl = `/api/poker/venues?limit=200&offset=0${apiLoc}${apiRadius}${apiState}${apiVenueType}${apiSort}`;
          setLoading(true);
          cachedFetch(apiUrl).then(data => {
            const newVenues = data?.data || data?.venues || (Array.isArray(data) ? data : []);
            setVenues(newVenues);
            setHasMore(newVenues.length >= PAGE_SIZE);
            setPage(0);
          }).catch(err => console.error('Search fetch failed:', err))
          .finally(() => setLoading(false));
        };

        component = (
          <div>
            {/* ─── SEARCH PARAMETERS ─── */}
            <div style={{ background: 'rgba(13,17,23,0.95)', border: '1px solid rgba(48,54,61,0.8)', borderRadius: 14, padding: 16, marginBottom: 16 }}>
              {/* GPS + Distance */}
              <div style={{ display: 'flex', gap: 8, marginBottom: 12, alignItems: 'center' }}>
                <button onClick={handleGpsClick} disabled={gpsLoading}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 10, border: userLocation ? '1px solid #3fb950' : gpsLoading ? '1px solid rgba(255,255,255,0.4)' : '1.5px solid rgba(212,168,83,0.4)', background: userLocation ? 'rgba(63,185,80,0.15)' : gpsLoading ? 'rgba(255,255,255,0.1)' : 'rgba(212,168,83,0.08)', color: userLocation ? '#3fb950' : gpsLoading ? '#ffffff' : '#d4a853', fontSize: 13, fontWeight: 700, cursor: gpsLoading ? 'wait' : 'pointer', fontFamily: 'inherit', transition: 'all 0.2s' }}>
                  {gpsLoading ? (
                    <svg width="16" height="16" viewBox="0 0 24 24" style={{ animation: 'spin 1s linear infinite' }}><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" fill="none" strokeDasharray="31" strokeDashoffset="10" /></svg>
                  ) : (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>
                  )}
                  {userLocation ? 'GPS Active' : gpsLoading ? 'Locating...' : 'Enable GPS'}
                </button>
                <select value={svRadius} onChange={(e) => setFilters(prev => ({ ...prev, svRadius: e.target.value }))}
                  style={{ background: 'rgba(13,17,23,0.9)', border: '1px solid rgba(48,54,61,0.6)', borderRadius: 8, padding: '8px 10px', color: '#c9d1d9', fontSize: 12, fontFamily: 'inherit', cursor: 'pointer' }}>
                  <option value="10">10 miles</option><option value="25">25 miles</option><option value="50">50 miles</option><option value="100">100 miles</option><option value="250">250 miles</option><option value="any">Any distance</option>
                </select>
              </div>
              {/* Venue Type */}
              <div style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 10, color: '#8b949e', fontWeight: 600, letterSpacing: '0.5px', textTransform: 'uppercase', marginBottom: 5 }}>Venue Type</div>
                <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                  {[{k:'all',l:'All'},{k:'casino',l:'Casino'},{k:'poker_club',l:'Poker Club'},{k:'home_game',l:'Home Game'},{k:'charity',l:'Charity'},{k:'poker_tour',l:'Poker Tour'},{k:'series',l:'Series'}].map(t => (
                    <button key={t.k} onClick={() => setFilters(prev => ({ ...prev, svVenueType: t.k }))}
                      style={{ padding: '4px 12px', borderRadius: 16, fontSize: 11, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer', border: svVenueType === t.k ? '1.5px solid #d4a853' : '1px solid rgba(48,54,61,0.6)', background: svVenueType === t.k ? 'rgba(212,168,83,0.12)' : 'rgba(22,27,34,0.6)', color: svVenueType === t.k ? '#d4a853' : '#8b949e' }}>{t.l}</button>
                  ))}
                </div>
              </div>
              {/* Game Type */}
              <div style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 10, color: '#8b949e', fontWeight: 600, letterSpacing: '0.5px', textTransform: 'uppercase', marginBottom: 5 }}>Game Type</div>
                <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                  {[{k:'all',l:'All Games'},{k:'nlh',l:'NLH'},{k:'plo',l:'PLO'},{k:'mixed',l:'Mixed'}].map(g => (
                    <button key={g.k} onClick={() => setFilters(prev => ({ ...prev, svGameType: g.k }))}
                      style={{ padding: '4px 12px', borderRadius: 16, fontSize: 11, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer', border: svGameType === g.k ? '1px solid #3fb950' : '1px solid rgba(48,54,61,0.6)', background: svGameType === g.k ? 'rgba(63,185,80,0.15)' : 'rgba(22,27,34,0.6)', color: svGameType === g.k ? '#3fb950' : '#8b949e' }}>{g.l}</button>
                  ))}
                </div>
              </div>
              {/* State + Sort */}
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12, alignItems: 'center' }}>
                <select value={svState} onChange={(e) => setFilters(prev => ({ ...prev, svState: e.target.value }))}
                  style={{ background: '#161b22', border: '1px solid rgba(48,54,61,0.6)', borderRadius: 8, padding: '6px 10px', color: '#c9d1d9', fontSize: 11, fontFamily: 'inherit', cursor: 'pointer', minWidth: 85 }}>
                  <option value="all">All States</option>
                  {['AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY','DC'].map(st => (
                    <option key={st} value={st}>{st}</option>
                  ))}
                </select>
                <select value={svSort} onChange={(e) => setFilters(prev => ({ ...prev, svSort: e.target.value }))}
                  style={{ background: '#161b22', border: '1px solid rgba(48,54,61,0.6)', borderRadius: 8, padding: '6px 10px', color: '#c9d1d9', fontSize: 11, fontFamily: 'inherit', cursor: 'pointer' }}>
                  {userLocation && <option value="distance">Nearest First</option>}
                  <option value="trust">Trust Score</option>
                  <option value="name">Name A-Z</option>
                </select>
              </div>
              {/* SEARCH BUTTON */}
              <button onClick={doVenueSearch}
                style={{ width: '100%', padding: '12px 0', borderRadius: 12, border: '1px solid rgba(63,185,80,0.4)', background: 'linear-gradient(135deg, #238636, #196c2e)', color: '#ffffff', fontSize: 15, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit', letterSpacing: '0.5px', boxShadow: '0 4px 16px rgba(35,134,54,0.3)' }}>
                Search Venues
              </button>
            </div>

            {/* ─── RESULTS (only after search) ─── */}
            {(() => {
              // Filter tours & series by distance for Search results
              const svNearbyTours = userLocation ? tours.filter(t => {
                const d = getNearestTourDistance(t, userLocation);
                if (d === null) return false;
                return svRadius === 'any' || d <= Number(svRadius);
              }).sort((a, b) => getNearestTourDistance(a, userLocation) - getNearestTourDistance(b, userLocation)) : [];
              const svNearbySeries = userLocation ? series.filter(s => {
                if (!s.latitude || !s.longitude) return false;
                const d = haversineMiles(userLocation.lat, userLocation.lng, s.latitude, s.longitude);
                return svRadius === 'any' || d <= Number(svRadius);
              }).sort((a, b) => haversineMiles(userLocation.lat, userLocation.lng, a.latitude, a.longitude) - haversineMiles(userLocation.lat, userLocation.lng, b.latitude, b.longitude)) : [];
              const svNearbyCount = svNearbyTours.length + svNearbySeries.length;
              return svHasSearched ? (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, padding: '8px 12px', background: 'rgba(22,27,34,0.8)', borderRadius: 10, border: '1px solid rgba(48,54,61,0.6)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 13, color: '#c9d1d9' }}>
                      <span style={{ color: '#d4a853', fontWeight: 800 }}>{svResults.length}</span> venue{svResults.length !== 1 ? 's' : ''}
                      {svNearbyCount > 0 && <span> · <span style={{ color: '#f59e0b', fontWeight: 700 }}>{svNearbyCount}</span> tour{svNearbyCount !== 1 ? 's/series' : ''}</span>}
                      {userLocation && svRadius !== 'any' && <span> within <span style={{ color: '#3fb950' }}>{svRadius} mi</span></span>}
                    </span>
                    {/* Active filter chips */}
                    {svState !== 'all' && <span style={{ fontSize: 9, padding: '2px 6px', borderRadius: 4, background: 'rgba(212,168,83,0.12)', border: '1px solid rgba(212,168,83,0.25)', color: '#d4a853', fontWeight: 700 }}>{svState}</span>}
                    {svVenueType !== 'all' && <span style={{ fontSize: 9, padding: '2px 6px', borderRadius: 4, background: 'rgba(212,168,83,0.1)', border: '1.5px solid rgba(148,163,184,0.15)', color: '#d4a853', fontWeight: 700 }}>{svVenueType.replace(/_/g, ' ')}</span>}
                    {svGameType !== 'all' && <span style={{ fontSize: 9, padding: '2px 6px', borderRadius: 4, background: 'rgba(63,185,80,0.1)', border: '1px solid rgba(63,185,80,0.2)', color: '#3fb950', fontWeight: 700 }}>{svGameType.toUpperCase()}</span>}
                  </div>
                  <button onClick={() => setFilters(prev => ({ ...prev, svState: 'all', svVenueType: 'all', svGameType: 'all', svRadius: '100', svHasSearched: false }))}
                    style={{ background: 'none', border: 'none', color: '#8b949e', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit', textDecoration: 'underline' }}>Clear</button>
                </div>
                {svResults.length > 0 ? (
                  <>
                    <div style={{ display: 'grid', gap: 12, marginBottom: 24 }}>
                      {svResults.slice(0, 50).map(v => {
                        const dist = userLocation ? svCalcDist(v) : null;
                        return (
                          <div key={v.id} style={{ position: 'relative' }}>
                            {dist !== null && dist < 99999 && (
                              <div style={{ position: 'absolute', top: 8, right: 8, zIndex: 2, padding: '3px 8px', borderRadius: 6, background: 'rgba(63,185,80,0.15)', border: '1px solid rgba(63,185,80,0.3)', fontSize: 11, fontWeight: 700, color: '#3fb950' }}>
                                {dist < 1 ? `${(dist * 5280).toFixed(0)} ft` : `${dist.toFixed(1)} mi`}
                              </div>
                            )}
                            <VenueCard venue={v} isFavorited={!!favorites[v.id]}
                              onFavorite={(e) => { e?.stopPropagation(); handleToggleFavorite(v.id, v); }}
                              onNavigate={(url) => handleVenueNavigate(url, v)}
                              userLocation={userLocation} checkinCount={checkinCounts[String(v.id)] || 0} reviewStats={reviewStatsMap[String(v.id)]} />
                          </div>
                        );
                      })}
                    </div>
                    {svResults.length > 50 && (
                      <button onClick={loadMore} disabled={loading}
                        style={{ display: 'block', width: '100%', marginBottom: 24, padding: '12px 24px', background: 'rgba(212,168,83,0.08)', border: '1.5px solid rgba(148,163,184,0.15)', borderRadius: 12, color: '#d4a853', fontSize: 14, fontWeight: 600, cursor: loading ? 'wait' : 'pointer', fontFamily: 'inherit' }}>
                        {loading ? 'Loading...' : `Load More (${svResults.length - 50} remaining)`}
                      </button>
                    )}
                  </>
                ) : (
                  <div style={{ textAlign: 'center', padding: 40, color: '#8b949e' }}>
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ marginBottom: 12, opacity: 0.3 }}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                    <p style={{ fontSize: 15, fontWeight: 600, marginBottom: 6, color: '#c9d1d9' }}>No Results Found</p>
                    <p style={{ fontSize: 13 }}>Try Expanding Distance, Changing Venue Type, or Selecting a Different State.</p>
                  </div>
                )}
                {/* ═══ NEARBY TOURS & SERIES ═══ */}
                {svNearbyCount > 0 && (
                  <div style={{ marginTop: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, padding: '10px 14px', background: 'linear-gradient(135deg, rgba(245,158,11,0.08), rgba(212,168,83,0.06))', borderRadius: 12, border: '1px solid rgba(245,158,11,0.2)' }}>
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 800, color: '#f59e0b', letterSpacing: '0.3px' }}>Poker Tours & Series Nearby</div>
                        <div style={{ fontSize: 11, color: '#8b949e', marginTop: 2 }}>{svNearbyTours.length} tour{svNearbyTours.length !== 1 ? 's' : ''} · {svNearbySeries.length} series within {svRadius === 'any' ? 'range' : svRadius + ' mi'}</div>
                      </div>
                    </div>
                    <div style={{ display: 'grid', gap: 12 }}>
                      {svNearbyTours.map((t, i) => {
                        const td = userLocation ? getNearestTourDistance(t, userLocation) : null;
                        return (
                          <div key={`sv-tour-${t.id || t.tour_code || i}`} style={{ position: 'relative' }}>
                            {td !== null && td < 99999 && (
                              <div style={{ position: 'absolute', top: 8, right: 8, zIndex: 2, padding: '3px 8px', borderRadius: 6, background: 'rgba(245,158,11,0.15)', border: '1px solid rgba(245,158,11,0.3)', fontSize: 11, fontWeight: 700, color: '#f59e0b' }}>
                                {td < 1 ? `${(td * 5280).toFixed(0)} ft` : `${td.toFixed(1)} mi`}
                              </div>
                            )}
                            <TourCard tour={t} isFavorited={!!favorites[t.id || t.tour_code]} onFavorite={(e) => { e?.stopPropagation(); handleToggleFavorite(t.id || t.tour_code, t, 'tour'); }} onNavigate={(path) => router.push(path)} />
                          </div>
                        );
                      })}
                      {svNearbySeries.map((s, i) => {
                        const sd = userLocation ? haversineMiles(userLocation.lat, userLocation.lng, s.latitude, s.longitude) : null;
                        return (
                          <div key={`sv-series-${s.id || i}`} style={{ position: 'relative' }}>
                            {sd !== null && sd < 99999 && (
                              <div style={{ position: 'absolute', top: 8, right: 8, zIndex: 2, padding: '3px 8px', borderRadius: 6, background: 'rgba(210,168,255,0.15)', border: '1px solid rgba(210,168,255,0.3)', fontSize: 11, fontWeight: 700, color: '#d2a8ff' }}>
                                {sd < 1 ? `${(sd * 5280).toFixed(0)} ft` : `${sd.toFixed(1)} mi`}
                              </div>
                            )}
                            <SeriesCard series={s} index={i} isFavorited={!!favorites[s.id]} onFavorite={(e) => { e?.stopPropagation(); handleToggleFavorite(s.id, s, 'series'); }} onNavigate={(path) => router.push(path)} />
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: '30px 16px' }}>
                <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="rgba(148,163,184,0.2)" strokeWidth="1" style={{ marginBottom: 16 }}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                <p style={{ fontSize: 16, fontWeight: 700, color: '#c9d1d9', marginBottom: 8 }}>Search All Venues</p>
                <p style={{ fontSize: 13, color: '#8b949e', lineHeight: 1.5, maxWidth: 320, margin: '0 auto' }}>
                  Set Your Filters Above and Tap Search. Enable GPS for Distance-Based Results.
                </p>
                <div style={{ display: 'flex', justifyContent: 'center', gap: 24, marginTop: 20 }}>
                  <div style={{ textAlign: 'center' }}><div style={{ fontSize: 24, fontWeight: 800, color: '#d4a853' }}>{venues.length || '700+'}</div><div style={{ fontSize: 11, color: '#8b949e' }}>Venues</div></div>
                  <div style={{ textAlign: 'center' }}><div style={{ fontSize: 24, fontWeight: 800, color: '#3fb950' }}>{new Set(venues.map(v => v.state).filter(Boolean)).size || '41'}</div><div style={{ fontSize: 11, color: '#8b949e' }}>States</div></div>
                </div>
              </div>
            )}
            )()}
          </div>
        );
        break;
      }

      case 'homegames': {
        const hgSearch = filters.hgSearch || '';
        const hgState = filters.hgState || 'all';
        const hgHasSearched = filters.hgHasSearched || false;
        let homeGames = venues.filter(v => v.venue_type === 'home_game');
        if (hgSearch) {
          const lower = hgSearch.toLowerCase();
          homeGames = homeGames.filter(v => (v.name || '').toLowerCase().includes(lower) || (v.city || '').toLowerCase().includes(lower) || (v.state || '').toLowerCase().includes(lower));
        }
        if (hgState !== 'all') homeGames = homeGames.filter(v => v.state === hgState);

        component = (
          <div>
            {/* Search parameters */}
            <div style={{ background: 'rgba(13,17,23,0.95)', border: '1px solid rgba(48,54,61,0.8)', borderRadius: 14, padding: 14, marginBottom: 14 }}>
              <div style={{ display: 'flex', gap: 8, marginBottom: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                <input type="text" placeholder="Search Home Games..." value={hgSearch} autoComplete="off"
                  onChange={(e) => setFilters(prev => ({ ...prev, hgSearch: e.target.value }))}
                  style={{ flex: 1, minWidth: 120, padding: '8px 12px', borderRadius: 8, border: '1px solid rgba(48,54,61,0.6)', background: '#161b22', color: '#c9d1d9', fontSize: 13, fontFamily: 'inherit' }} />
                <select value={hgState}
                  onChange={(e) => setFilters(prev => ({ ...prev, hgState: e.target.value }))}
                  style={{ background: '#161b22', border: '1px solid rgba(48,54,61,0.6)', borderRadius: 8, padding: '8px 10px', color: '#c9d1d9', fontSize: 12, fontFamily: 'inherit', cursor: 'pointer', minWidth: 90 }}>
                  <option value="all">All States</option>
                  {['AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY','DC'].map(st => (
                    <option key={st} value={st}>{st}</option>
                  ))}
                </select>
              </div>
              <button onClick={() => {
                setFilters(prev => ({ ...prev, hgHasSearched: true }));
                // Fetch home games from API with venue_type filter
                const hgApiState = hgState !== 'all' ? `&state=${hgState}` : '';
                const hgApiSearch = hgSearch ? `&search=${encodeURIComponent(hgSearch)}` : '';
                const hgApiLoc = userLocation ? `&lat=${userLocation.lat}&lng=${userLocation.lng}` : '';
                const hgUrl = `/api/poker/venues?limit=200&offset=0&venue_type=home_game${hgApiState}${hgApiSearch}${hgApiLoc}`;
                setLoading(true);
                cachedFetch(hgUrl).then(data => {
                  const newVenues = data?.data || data?.venues || (Array.isArray(data) ? data : []);
                  setVenues(prev => {
                    const homeIds = new Set(newVenues.map(v => v.id));
                    const nonHome = prev.filter(v => !homeIds.has(v.id) && v.venue_type !== 'home_game');
                    return [...nonHome, ...newVenues];
                  });
                }).catch(err => console.error('Home games fetch failed:', err))
                .finally(() => setLoading(false));
              }}
                style={{ width: '100%', padding: '10px 0', borderRadius: 10, border: '1px solid rgba(63,185,80,0.4)', background: 'linear-gradient(135deg, #238636, #196c2e)', color: '#ffffff', fontSize: 14, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit', boxShadow: '0 4px 16px rgba(35,134,54,0.3)' }}>
                Find Home Games
              </button>
            </div>

            {hgHasSearched ? (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, padding: '6px 10px', background: 'rgba(22,27,34,0.8)', borderRadius: 8, border: '1px solid rgba(48,54,61,0.6)' }}>
                  <span style={{ fontSize: 12, color: '#c9d1d9' }}>
                    <span style={{ color: '#d4a853', fontWeight: 800 }}>{homeGames.length}</span> home game{homeGames.length !== 1 ? 's' : ''}
                  </span>
                  <button onClick={() => setFilters(prev => ({ ...prev, hgSearch: '', hgState: 'all', hgHasSearched: false }))}
                    style={{ background: 'none', border: 'none', color: '#8b949e', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit', textDecoration: 'underline' }}>Clear</button>
                </div>
                {loading && <div style={{ display: 'grid', gap: 12 }}>
                  {[1,2,3].map(n => <div key={n} style={{ height: 80, borderRadius: 12, background: 'linear-gradient(90deg, rgba(30,40,55,0.5) 25%, rgba(50,60,80,0.5) 50%, rgba(30,40,55,0.5) 75%)', backgroundSize: '200% 100%', animation: 'pnm-shimmer 1.5s ease-in-out infinite', border: '1px solid rgba(148,163,184,0.08)' }} />)}
                </div>}
                <div style={{ display: 'grid', gap: 12 }}>
                  {homeGames.map(v => (
                    <VenueCard
                      key={v.id}
                      venue={v}
                      isFavorited={!!favorites[v.id]}
                      onFavorite={(e) => { e?.stopPropagation(); handleToggleFavorite(v.id, v); }}
                      onNavigate={(url) => handleVenueNavigate(url, v)}
                      userLocation={userLocation}
                      checkinCount={checkinCounts[String(v.id)] || 0}
                      reviewStats={reviewStatsMap[String(v.id)]}
                    />
                  ))}
                </div>
                {homeGames.length === 0 && !loading && (
                  <div style={{ textAlign: 'center', padding: 40, color: '#8b949e' }}>
                    <p style={{ fontSize: 15, fontWeight: 600, marginBottom: 6, color: '#c9d1d9' }}>No Home Games Found</p>
                    <p style={{ fontSize: 13 }}>Try a Different Search or State Filter.</p>
                  </div>
                )}
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: '30px 16px' }}>
                <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="rgba(148,163,184,0.2)" strokeWidth="1" style={{ marginBottom: 14 }}>
                  <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" /><polyline points="9 22 9 12 15 12 15 22" />
                </svg>
                <p style={{ fontSize: 15, fontWeight: 700, color: '#c9d1d9', marginBottom: 6 }}>Find or List Home Games</p>
                <p style={{ fontSize: 13, color: '#8b949e', lineHeight: 1.5 }}>Search for Home Games Near You or Filter by State. Use the Search Bar Above to Get Started.</p>
              </div>
            )}

            {/* List Your Home Game section */}
            <div style={{ marginTop: 16 }}>
              <button
                onClick={() => setFilters(prev => ({ ...prev, showCreateHomeGame: !prev.showCreateHomeGame }))}
                style={{
                  width: '100%', padding: '12px 0',
                  borderRadius: 12,
                  border: filters.showCreateHomeGame ? '1px solid rgba(34,197,94,0.4)' : '1px solid rgba(148,163,184,0.12)',
                  background: filters.showCreateHomeGame ? 'rgba(34,197,94,0.08)' : 'rgba(212,168,83,0.04)',
                  color: filters.showCreateHomeGame ? '#22c55e' : 'rgba(200,214,229,0.6)',
                  fontSize: 14, fontWeight: 700,
                  cursor: 'pointer', fontFamily: 'Inter, system-ui, sans-serif',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  transition: 'all 0.2s',
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 5v14M5 12h14" />
                </svg>
                {filters.showCreateHomeGame ? 'Cancel Listing' : 'List Your Home Game'}
              </button>
              {filters.showCreateHomeGame && (
                <div style={{
                  marginTop: 12,
                  background: 'rgba(13,17,23,0.95)',
                  border: '1px solid rgba(34,197,94,0.2)',
                  borderRadius: 14,
                  overflow: 'hidden',
                }}>
                  <CreateHomeGame
                    userId={userId}
                    onSuccess={(newVenue) => {
                      if (newVenue) {
                        setVenues(prev => [...prev, newVenue]);
                      }
                      setFilters(prev => ({ ...prev, showCreateHomeGame: false, hgHasSearched: true }));
                    }}
                    onCancel={() => setFilters(prev => ({ ...prev, showCreateHomeGame: false }))}
                  />
                </div>
              )}
            </div>
          </div>
        );
        break;
      }

      case 'nearme': {
        // ─── GOAT SEARCH ENGINE — Pod 1 — Search-first (no auto-display) ───
        const nmState = filters.nmState || 'all';
        const nmVenueType = filters.nmVenueType || 'all';
        const nmGameType = filters.nmGameType || 'all';
        const nmRadius = filters.nmRadius || '50';
        const nmMinBuyin = filters.nmMinBuyin || '';
        const nmMaxBuyin = filters.nmMaxBuyin || '';
        const nmSort = filters.nmSort || (userLocation ? 'distance' : 'trust');
        const nmSearched = filters.nmSearched || false;

        // Filter venues
        let nmResults = venues;
        if (nmState !== 'all') nmResults = nmResults.filter(v => v.state === nmState);
        if (nmVenueType !== 'all') nmResults = nmResults.filter(v => {
          if (nmVenueType === 'poker_club') return v.venue_type === 'poker_club' || v.venue_type === 'card_room';
          if (nmVenueType === 'poker_tour') return v.venue_type === 'poker_tour' || v.venue_type === 'tour_stop' || v.venue_type === 'tour';
          return v.venue_type === nmVenueType;
        });
        if (nmGameType !== 'all') {
          nmResults = nmResults.filter(v => {
            const g = (v.games_offered || []).join(' ').toLowerCase();
            if (nmGameType === 'nlh') return g.includes('nlh') || g.includes('hold');
            if (nmGameType === 'plo') return g.includes('plo') || g.includes('omaha');
            if (nmGameType === 'mixed') return g.includes('mix') || g.includes('horse');
            return true;
          });
        }
        // Haversine distance — uses shared utility from pnm-utils.js
        const nmDist = (v) => {
          if (!userLocation || !v.latitude || !v.longitude) return 99999;
          return haversineMiles(userLocation.lat, userLocation.lng, v.latitude, v.longitude);
        };
        if (userLocation && nmRadius !== 'any') nmResults = nmResults.filter(v => nmDist(v) <= Number(nmRadius));
        // Sort
        if (nmSort === 'distance' && userLocation) nmResults = [...nmResults].sort((a, b) => nmDist(a) - nmDist(b));
        else if (nmSort === 'trust') nmResults = [...nmResults].sort((a, b) => (b.trust_score || 0) - (a.trust_score || 0));
        else if (nmSort === 'name') nmResults = [...nmResults].sort((a, b) => (a.name || '').localeCompare(b.name || ''));

        // Tournament count
        const nmTournaments = dailyTournaments.filter(t => {
          if (nmMinBuyin && (t.buy_in || 0) < Number(nmMinBuyin)) return false;
          if (nmMaxBuyin && (t.buy_in || 0) > Number(nmMaxBuyin)) return false;
          return true;
        });

        const triggerNmSearch = () => {
          // Map Pod1 filter keys → API-compatible filter keys and fetch
          setFilters(prev => ({
            ...prev,
            nmSearched: true,
            selectedState: prev.nmState || 'all',
            venueType: prev.nmVenueType === 'all' ? undefined : prev.nmVenueType,
            gameType: prev.nmGameType === 'all' ? undefined : prev.nmGameType,
            radius: prev.nmRadius === 'any' ? undefined : prev.nmRadius,
          }));
          // Build search-specific API URL with all filters
          const apiState = nmState !== 'all' ? `&state=${nmState}` : '';
          const apiVenueType = nmVenueType !== 'all' ? `&venue_type=${nmVenueType}` : '';
          const apiRadius = userLocation && nmRadius !== 'any' ? `&radius=${nmRadius}` : '';
          const apiLoc = userLocation ? `&lat=${userLocation.lat}&lng=${userLocation.lng}` : '';
          const apiSort = nmSort ? `&sort=${nmSort}` : '';
          const apiUrl = `/api/poker/venues?limit=200&offset=0${apiLoc}${apiRadius}${apiState}${apiVenueType}${apiSort}`;
          setLoading(true);
          cachedFetch(apiUrl).then(data => {
            const newVenues = data?.data || data?.venues || (Array.isArray(data) ? data : []);
            setVenues(newVenues);
            setHasMore(newVenues.length >= PAGE_SIZE);
            setPage(0);
          }).catch(err => console.error('Search fetch failed:', err))
          .finally(() => setLoading(false));
        };

        component = (
          <div>
            {/* ═══ SEARCH PARAMETERS PANEL ═══ */}
            <div style={{ background: 'rgba(13,17,23,0.95)', border: '1px solid rgba(48,54,61,0.8)', borderRadius: 14, padding: 16, marginBottom: 16 }}>
              {/* Row 1: GPS + Distance */}
              <div style={{ display: 'flex', gap: 8, marginBottom: 12, alignItems: 'center' }}>
                <button onClick={handleGpsClick} disabled={gpsLoading}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 10, border: userLocation ? '1px solid #3fb950' : gpsLoading ? '1px solid rgba(255,255,255,0.4)' : '1.5px solid rgba(212,168,83,0.4)', background: userLocation ? 'rgba(63,185,80,0.15)' : gpsLoading ? 'rgba(255,255,255,0.1)' : 'rgba(212,168,83,0.08)', color: userLocation ? '#3fb950' : gpsLoading ? '#ffffff' : '#d4a853', fontSize: 13, fontWeight: 700, cursor: gpsLoading ? 'wait' : 'pointer', fontFamily: 'inherit', transition: 'all 0.2s' }}>
                  {gpsLoading ? (
                    <svg width="16" height="16" viewBox="0 0 24 24" style={{ animation: 'spin 1s linear infinite' }}><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" fill="none" strokeDasharray="31" strokeDashoffset="10" /></svg>
                  ) : (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>
                  )}
                  {userLocation ? 'GPS Active' : gpsLoading ? 'Locating...' : 'Enable GPS'}
                </button>
                <select value={nmRadius} onChange={(e) => setFilters(prev => ({ ...prev, nmRadius: e.target.value }))}
                  style={{ background: 'rgba(13,17,23,0.9)', border: '1px solid rgba(48,54,61,0.6)', borderRadius: 8, padding: '8px 10px', color: '#c9d1d9', fontSize: 12, fontFamily: 'inherit', cursor: 'pointer' }}>
                  <option value="5">5 miles</option><option value="10">10 miles</option><option value="25">25 miles</option>
                  <option value="50">50 miles</option><option value="100">100 miles</option><option value="250">250 miles</option><option value="any">Any distance</option>
                </select>
              </div>

              {/* Row 2: Venue Type Chips */}
              <div style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 10, color: '#8b949e', fontWeight: 600, letterSpacing: '0.5px', textTransform: 'uppercase', marginBottom: 5 }}>Venue Type</div>
                <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                  {[{k:'all',l:'All'},{k:'casino',l:'Casino'},{k:'poker_club',l:'Poker Club'},{k:'home_game',l:'Home Game'},{k:'charity',l:'Charity'},{k:'poker_tour',l:'Poker Tour'},{k:'series',l:'Series'}].map(t => (
                    <button key={t.k} onClick={() => setFilters(prev => ({ ...prev, nmVenueType: t.k }))}
                      style={{ padding: '4px 12px', borderRadius: 16, fontSize: 11, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer', border: nmVenueType === t.k ? '1.5px solid #d4a853' : '1px solid rgba(48,54,61,0.6)', background: nmVenueType === t.k ? 'rgba(212,168,83,0.12)' : 'rgba(22,27,34,0.6)', color: nmVenueType === t.k ? '#d4a853' : '#8b949e', transition: 'all 0.15s' }}>{t.l}</button>
                  ))}
                </div>
              </div>

              {/* Row 3: Game Type Chips */}
              <div style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 10, color: '#8b949e', fontWeight: 600, letterSpacing: '0.5px', textTransform: 'uppercase', marginBottom: 5 }}>Game Type</div>
                <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                  {[{k:'all',l:'All Games'},{k:'nlh',l:'NLH'},{k:'plo',l:'PLO'},{k:'mixed',l:'Mixed'}].map(g => (
                    <button key={g.k} onClick={() => setFilters(prev => ({ ...prev, nmGameType: g.k }))}
                      style={{ padding: '4px 12px', borderRadius: 16, fontSize: 11, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer', border: nmGameType === g.k ? '1px solid #3fb950' : '1px solid rgba(48,54,61,0.6)', background: nmGameType === g.k ? 'rgba(63,185,80,0.15)' : 'rgba(22,27,34,0.6)', color: nmGameType === g.k ? '#3fb950' : '#8b949e', transition: 'all 0.15s' }}>{g.l}</button>
                  ))}
                </div>
              </div>

              {/* Row 4: State + Buy-in + Sort */}
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12, alignItems: 'center' }}>
                <select value={nmState} onChange={(e) => setFilters(prev => ({ ...prev, nmState: e.target.value }))}
                  style={{ background: '#161b22', border: '1px solid rgba(48,54,61,0.6)', borderRadius: 8, padding: '6px 10px', color: '#c9d1d9', fontSize: 11, fontFamily: 'inherit', cursor: 'pointer', minWidth: 85 }}>
                  <option value="all">All States</option>
                  {['AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY','DC'].map(st => (
                    <option key={st} value={st}>{st}</option>
                  ))}
                </select>
                <input type="number" placeholder="Min $" value={nmMinBuyin}
                  onChange={(e) => setFilters(prev => ({ ...prev, nmMinBuyin: e.target.value }))}
                  style={{ width: 60, padding: '6px 8px', borderRadius: 6, border: '1px solid rgba(48,54,61,0.6)', background: '#161b22', color: '#c9d1d9', fontSize: 11, fontFamily: 'inherit' }} />
                <input type="number" placeholder="Max $" value={nmMaxBuyin}
                  onChange={(e) => setFilters(prev => ({ ...prev, nmMaxBuyin: e.target.value }))}
                  style={{ width: 60, padding: '6px 8px', borderRadius: 6, border: '1px solid rgba(48,54,61,0.6)', background: '#161b22', color: '#c9d1d9', fontSize: 11, fontFamily: 'inherit' }} />
                <select value={nmSort} onChange={(e) => setFilters(prev => ({ ...prev, nmSort: e.target.value }))}
                  style={{ background: '#161b22', border: '1px solid rgba(48,54,61,0.6)', borderRadius: 8, padding: '6px 10px', color: '#c9d1d9', fontSize: 11, fontFamily: 'inherit', cursor: 'pointer' }}>
                  {userLocation && <option value="distance">Nearest First</option>}
                  <option value="trust">Trust Score</option>
                  <option value="name">Name A-Z</option>
                </select>
              </div>

              {/* SEARCH BUTTON */}
              <button onClick={triggerNmSearch}
                style={{ width: '100%', padding: '12px 0', borderRadius: 12, border: '1px solid rgba(63,185,80,0.4)', background: 'linear-gradient(135deg, #238636, #196c2e)', color: '#ffffff', fontSize: 15, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit', letterSpacing: '0.5px', transition: 'all 0.15s', boxShadow: '0 4px 16px rgba(35,134,54,0.3)' }}>
                Search Poker Near Me
              </button>
            </div>

            {/* ═══ RESULTS — only after Search clicked ═══ */}
            {(() => {
              // Filter tours & series by distance for Near Me results
              const nearbyTours = userLocation ? tours.filter(t => {
                const d = getNearestTourDistance(t, userLocation);
                if (d === null) return false;
                return nmRadius === 'any' || d <= Number(nmRadius);
              }).sort((a, b) => getNearestTourDistance(a, userLocation) - getNearestTourDistance(b, userLocation)) : [];
              const nearbySeries = userLocation ? series.filter(s => {
                if (!s.latitude || !s.longitude) return false;
                const d = haversineMiles(userLocation.lat, userLocation.lng, s.latitude, s.longitude);
                return nmRadius === 'any' || d <= Number(nmRadius);
              }).sort((a, b) => haversineMiles(userLocation.lat, userLocation.lng, a.latitude, a.longitude) - haversineMiles(userLocation.lat, userLocation.lng, b.latitude, b.longitude)) : [];
              const nearbyTourSeriesCount = nearbyTours.length + nearbySeries.length;
              return nmSearched ? (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, padding: '8px 12px', background: 'rgba(22,27,34,0.8)', borderRadius: 10, border: '1px solid rgba(48,54,61,0.6)' }}>
                  <span style={{ fontSize: 13, color: '#c9d1d9' }}>
                    <span style={{ color: '#d4a853', fontWeight: 800 }}>{nmResults.length}</span> venue{nmResults.length !== 1 ? 's' : ''}
                    {nearbyTourSeriesCount > 0 && <span> · <span style={{ color: '#f59e0b', fontWeight: 700 }}>{nearbyTourSeriesCount}</span> tour{nearbyTourSeriesCount !== 1 ? 's/series' : ''}</span>}
                    {userLocation && nmRadius !== 'any' && <span> within <span style={{ color: '#3fb950' }}>{nmRadius} mi</span></span>}
                    {nmTournaments.length > 0 && <span> · <span style={{ color: '#d2a8ff', fontWeight: 700 }}>{nmTournaments.length}</span> tournaments</span>}
                  </span>
                  <button onClick={() => setFilters(prev => ({ ...prev, nmState: 'all', nmVenueType: 'all', nmGameType: 'all', nmRadius: '50', nmMinBuyin: '', nmMaxBuyin: '', nmSearched: false }))}
                    style={{ background: 'none', border: 'none', color: '#8b949e', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit', textDecoration: 'underline' }}>Clear</button>
                </div>
                {nmResults.length > 0 ? (
                  <>
                    <div style={{ display: 'grid', gap: 12, marginBottom: 24 }}>
                      {nmResults.slice(0, 50).map(v => {
                        const d = userLocation ? nmDist(v) : null;
                        return (
                          <div key={v.id} style={{ position: 'relative' }}>
                            {d !== null && d < 99999 && (
                              <div style={{ position: 'absolute', top: 8, right: 8, zIndex: 2, padding: '3px 8px', borderRadius: 6, background: 'rgba(63,185,80,0.15)', border: '1px solid rgba(63,185,80,0.3)', fontSize: 11, fontWeight: 700, color: '#3fb950' }}>
                                {d < 1 ? `${(d * 5280).toFixed(0)} ft` : `${d.toFixed(1)} mi`}
                              </div>
                            )}
                            <VenueCard venue={v} isFavorited={!!favorites[v.id]}
                              onFavorite={(e) => { e?.stopPropagation(); handleToggleFavorite(v.id, v); }}
                              onNavigate={(url) => handleVenueNavigate(url, v)}
                              userLocation={userLocation} checkinCount={checkinCounts[String(v.id)] || 0} reviewStats={reviewStatsMap[String(v.id)]} />
                          </div>
                        );
                      })}
                    </div>
                    {nmResults.length > 50 && (
                      <button onClick={loadMore} disabled={loading}
                        style={{ display: 'block', width: '100%', marginBottom: 24, padding: '12px 24px', background: 'rgba(212,168,83,0.08)', border: '1.5px solid rgba(148,163,184,0.15)', borderRadius: 12, color: '#d4a853', fontSize: 14, fontWeight: 600, cursor: loading ? 'wait' : 'pointer', fontFamily: 'inherit' }}>
                        {loading ? 'Loading...' : `Load More (${nmResults.length - 50} remaining)`}
                      </button>
                    )}
                  </>
                ) : (
                  <div style={{ textAlign: 'center', padding: 40, color: 'rgba(200,214,229,0.4)' }}>
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ marginBottom: 12, opacity: 0.3 }}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                    <p style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>No Results Found</p>
                    <p style={{ fontSize: 13 }}>Try Expanding Distance, Changing Venue Type, or Selecting a Different State.</p>
                  </div>
                )}
                {/* ═══ NEARBY TOURS & SERIES ═══ */}
                {nearbyTourSeriesCount > 0 && (
                  <div style={{ marginTop: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, padding: '10px 14px', background: 'linear-gradient(135deg, rgba(245,158,11,0.08), rgba(212,168,83,0.06))', borderRadius: 12, border: '1px solid rgba(245,158,11,0.2)' }}>
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 800, color: '#f59e0b', letterSpacing: '0.3px' }}>Poker Tours & Series Nearby</div>
                        <div style={{ fontSize: 11, color: '#8b949e', marginTop: 2 }}>{nearbyTours.length} tour{nearbyTours.length !== 1 ? 's' : ''} · {nearbySeries.length} series within {nmRadius === 'any' ? 'range' : nmRadius + ' mi'}</div>
                      </div>
                    </div>
                    <div style={{ display: 'grid', gap: 12 }}>
                      {nearbyTours.map((t, i) => {
                        const td = userLocation ? getNearestTourDistance(t, userLocation) : null;
                        return (
                          <div key={`tour-${t.id || t.tour_code || i}`} style={{ position: 'relative' }}>
                            {td !== null && td < 99999 && (
                              <div style={{ position: 'absolute', top: 8, right: 8, zIndex: 2, padding: '3px 8px', borderRadius: 6, background: 'rgba(245,158,11,0.15)', border: '1px solid rgba(245,158,11,0.3)', fontSize: 11, fontWeight: 700, color: '#f59e0b' }}>
                                {td < 1 ? `${(td * 5280).toFixed(0)} ft` : `${td.toFixed(1)} mi`}
                              </div>
                            )}
                            <TourCard tour={t} isFavorited={!!favorites[t.id || t.tour_code]} onFavorite={(e) => { e?.stopPropagation(); handleToggleFavorite(t.id || t.tour_code, t, 'tour'); }} onNavigate={(path) => router.push(path)} />
                          </div>
                        );
                      })}
                      {nearbySeries.map((s, i) => {
                        const sd = userLocation ? haversineMiles(userLocation.lat, userLocation.lng, s.latitude, s.longitude) : null;
                        return (
                          <div key={`series-${s.id || i}`} style={{ position: 'relative' }}>
                            {sd !== null && sd < 99999 && (
                              <div style={{ position: 'absolute', top: 8, right: 8, zIndex: 2, padding: '3px 8px', borderRadius: 6, background: 'rgba(210,168,255,0.15)', border: '1px solid rgba(210,168,255,0.3)', fontSize: 11, fontWeight: 700, color: '#d2a8ff' }}>
                                {sd < 1 ? `${(sd * 5280).toFixed(0)} ft` : `${sd.toFixed(1)} mi`}
                              </div>
                            )}
                            <SeriesCard series={s} index={i} isFavorited={!!favorites[s.id]} onFavorite={(e) => { e?.stopPropagation(); handleToggleFavorite(s.id, s, 'series'); }} onNavigate={(path) => router.push(path)} />
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              /* ═══ LANDING STATE — before search ═══ */
              <div style={{ textAlign: 'center', padding: '30px 16px' }}>
                <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="rgba(148,163,184,0.2)" strokeWidth="1" style={{ marginBottom: 16 }}>
                  <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                </svg>
                <p style={{ fontSize: 16, fontWeight: 700, color: '#c9d1d9', marginBottom: 8 }}>Find Poker Anywhere</p>
                <p style={{ fontSize: 13, color: '#8b949e', lineHeight: 1.5, maxWidth: 320, margin: '0 auto' }}>
                  Enable GPS to Find Games Near You, or Set Your Search Parameters Above and Tap Search. Filter by Venue Type, Game Type, Distance, and Buy-In Range.
                </p>
                <div style={{ display: 'flex', justifyContent: 'center', gap: 24, marginTop: 20, flexWrap: 'wrap' }}>
                  <div style={{ textAlign: 'center' }}><div style={{ fontSize: 24, fontWeight: 800, color: '#d4a853' }}>{venues.length || '700+'}</div><div style={{ fontSize: 11, color: '#8b949e' }}>Venues</div></div>
                  <div style={{ textAlign: 'center' }}><div style={{ fontSize: 24, fontWeight: 800, color: '#d2a8ff' }}>{dailyTournaments.length > 0 ? dailyTournaments.length.toLocaleString() : '—'}</div><div style={{ fontSize: 11, color: '#8b949e' }}>Tournaments</div></div>
                  <div style={{ textAlign: 'center' }}><div style={{ fontSize: 24, fontWeight: 800, color: '#3fb950' }}>{new Set(venues.map(v => v.state).filter(Boolean)).size || '41'}</div><div style={{ fontSize: 11, color: '#8b949e' }}>States</div></div>
                </div>
              </div>
            )}
            )()}
          </div>
        );
        break;
      }

      case 'livegames':
        component = <LiveGamesFeed 
          venues={venues} 
          userLocation={userLocation} 
          favorites={favorites} 
          handleToggleFavorite={handleToggleFavorite} 
          checkinCounts={checkinCounts} 
          router={router} 
          setSelectedVenueForReview={setSelectedVenueForReview}
          user={user}
        />;
        break;

      case 'mapview': {
        const mapStateFilter = filters.mapState || 'all';
        // ═══ MERGE TOUR STOPS INTO MAP — Convert tours to venue-like objects ═══
        const tourMapPins = (tours || []).reduce((acc, tour) => {
          // Direct tour coordinates
          if (tour.latitude && tour.longitude) {
            acc.push({
              id: 'tour-' + (tour.id || tour.tour_code),
              name: tour.name || tour.tour_name || tour.tour_code,
              venue_type: 'tour_stop',
              tour_code: tour.tour_code,
              tour_name: tour.name || tour.tour_name,
              logo_url: tour.logo_url,
              latitude: tour.latitude,
              longitude: tour.longitude,
              city: tour.city || '',
              state: tour.state || '',
              is_running: tour.is_running,
            });
          }
          // Upcoming series/stops with city coords
          const allStops = [
            ...(tour.upcoming_series || []),
            ...(tour.stops_2026 || []),
            ...(tour.series_2026 || []),
          ];
          allStops.forEach((stop, idx) => {
            if (stop.latitude && stop.longitude) {
              acc.push({
                id: 'tour-stop-' + (tour.id || tour.tour_code) + '-' + idx,
                name: stop.name || stop.venue || tour.name || tour.tour_code,
                venue_type: 'tour_stop',
                tour_code: tour.tour_code,
                tour_name: tour.name || tour.tour_name,
                logo_url: tour.logo_url,
                latitude: stop.latitude,
                longitude: stop.longitude,
                city: stop.city || '',
                state: stop.state || '',
                stop_name: stop.name || stop.venue,
                dates: stop.dates || '',
                is_running: stop.is_running,
              });
            }
          });
          return acc;
        }, []);
        const allMapItems = [...venues, ...tourMapPins];
        const mapVenues = mapStateFilter !== 'all'
          ? allMapItems.filter(v => v.state === mapStateFilter)
          : allMapItems;
        component = (
          <div>
            <div style={{ display: 'flex', gap: 10, marginBottom: 12, alignItems: 'center', flexWrap: 'wrap' }}>
              <select
                value={mapStateFilter}
                onChange={(e) => setFilters(prev => ({ ...prev, mapState: e.target.value }))}
                style={{ background: 'rgba(212,168,83,0.08)', border: '1px solid rgba(148,163,184,0.15)', borderRadius: 8, padding: '6px 12px', color: '#e0e8f0', fontSize: 12, fontFamily: 'inherit', cursor: 'pointer', outline: 'none', minWidth: 100 }}>
                <option value="all" style={{ background: '#0d1a2a' }}>All States</option>
                {['AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY','DC'].map(st => (
                  <option key={st} value={st} style={{ background: '#0d1a2a' }}>{st}</option>
                ))}
              </select>
              <span style={{ fontSize: 12, color: 'rgba(200,214,229,0.4)', marginLeft: 'auto' }}>
                <span style={{ color: '#d4a853', fontWeight: 700 }}>{mapVenues.filter(v => v.latitude && v.longitude).length}</span> venues on map
              </span>
            </div>
            <VenueMapPanel venues={mapVenues} userLocation={userLocation} radiusMiles={filters.nmRadius} onVenueSelect={(v) => { setSelectedVenueForReview(null); router.push(`/hub/venues/${v.id}`); }} />
          </div>
        );
        break;
      }

      case 'tours': {
        const tourSearch = filters.tourSearch || '';
        const tourState = filters.tourState || 'all';
        let filteredTours = tours;
        if (tourSearch) {
          const lower = tourSearch.toLowerCase();
          filteredTours = filteredTours.filter(t => {
            if ((t.tour_name || t.name || '').toLowerCase().includes(lower) || (t.tour_code || '').toLowerCase().includes(lower) || (t.headquarters || '').toLowerCase().includes(lower)) return true;
            const allStops = [...(t.upcoming_series || []), ...(t.stops_2026 || []), ...(t.series_2026 || [])];
            return allStops.some(s => (s.name || s.venue || s.location || s.city || '').toLowerCase().includes(lower));
          });
        }
        if (tourState !== 'all') {
          filteredTours = filteredTours.filter(t => {
            if ((t.headquarters || '').includes(tourState) || (t.state === tourState)) return true;
            const allStops = [...(t.upcoming_series || []), ...(t.stops_2026 || []), ...(t.series_2026 || [])];
            return allStops.some(s => (s.location || s.state || '').includes(tourState));
          });
        }
        component = (
          <div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12, alignItems: 'center', flexWrap: 'wrap' }}>
              <input type="text" placeholder="Search Tours..." value={tourSearch} autoComplete="off"
                onChange={(e) => setFilters(prev => ({ ...prev, tourSearch: e.target.value }))}
                style={{ flex: 1, minWidth: 120, padding: '8px 14px', borderRadius: 8, border: '1.5px solid rgba(148,163,184,0.15)', background: 'rgba(13,17,23,0.7)', color: '#e0e8f0', fontSize: 13, fontFamily: 'inherit', outline: 'none', transition: 'border-color 0.2s', boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.2)' }} />
              <select value={tourState}
                onChange={(e) => setFilters(prev => ({ ...prev, tourState: e.target.value }))}
                style={{ background: 'rgba(13,17,23,0.7)', border: '1.5px solid rgba(148,163,184,0.15)', borderRadius: 8, padding: '8px 14px', color: '#e0e8f0', fontSize: 13, fontFamily: 'inherit', cursor: 'pointer', outline: 'none', minWidth: 110, boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.2)' }}>
                <option value="all" style={{ background: '#0d1117' }}>All States</option>
                {['AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY','DC'].map(st => (
                  <option key={st} value={st} style={{ background: '#0d1117' }}>{st}</option>
                ))}
              </select>
              <span style={{ fontSize: 12, color: 'rgba(200,214,229,0.4)' }}>
                <span style={{ color: '#d4a853', fontWeight: 700 }}>{filteredTours.length}</span> tour{filteredTours.length !== 1 ? 's' : ''}
              </span>
            </div>
            <div style={{ display: 'grid', gap: 12 }}>
              {filteredTours.map((t, i) => <TourCard key={t.tour_code || t.id || `tour-${i}`} tour={t} isFavorited={!!favorites[t.id || t.tour_code]} onFavorite={(e) => { e?.stopPropagation(); handleToggleFavorite(t.id || t.tour_code, t, 'tour'); }} onNavigate={(path) => router.push(path)} />)}
            </div>
            {!toursLoaded && tours.length === 0 && (
              <div style={{ display: 'grid', gap: 12 }}>
                {[1,2,3,4].map(n => <div key={n} style={{ height: 90, borderRadius: 12, background: 'linear-gradient(90deg, rgba(30,40,55,0.5) 25%, rgba(50,60,80,0.5) 50%, rgba(30,40,55,0.5) 75%)', backgroundSize: '200% 100%', animation: 'pnm-shimmer 1.5s ease-in-out infinite', border: '1px solid rgba(148,163,184,0.08)' }} />)}
              </div>
            )}
            {toursLoaded && filteredTours.length === 0 && (
              <div style={{ textAlign: 'center', padding: 40, color: 'rgba(200,214,229,0.5)' }}>
                <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>No Matching Tours</div>
                <div style={{ fontSize: 13, color: 'rgba(200,214,229,0.4)' }}>{tourSearch || tourState !== 'all' ? 'Try adjusting your filters.' : 'Check back soon for poker tour schedules.'}</div>
              </div>
            )}
          </div>
        );
        break;
      }

      case 'series': {
        const seriesSearch = filters.seriesSearch || '';
        const seriesState = filters.seriesState || 'all';
        let filteredSeries = series;
        if (seriesSearch) {
          const lower = seriesSearch.toLowerCase();
          filteredSeries = filteredSeries.filter(s => (s.name || '').toLowerCase().includes(lower) || (s.city || '').toLowerCase().includes(lower) || (s.state || '').toLowerCase().includes(lower));
        }
        if (seriesState !== 'all') {
          filteredSeries = filteredSeries.filter(s => s.state === seriesState);
        }
        component = (
          <div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12, alignItems: 'center', flexWrap: 'wrap' }}>
              <input type="text" placeholder="Search Series..." value={seriesSearch} autoComplete="off"
                onChange={(e) => setFilters(prev => ({ ...prev, seriesSearch: e.target.value }))}
                style={{ flex: 1, minWidth: 120, padding: '8px 14px', borderRadius: 8, border: '1.5px solid rgba(148,163,184,0.15)', background: 'rgba(13,17,23,0.7)', color: '#e0e8f0', fontSize: 13, fontFamily: 'inherit', outline: 'none', transition: 'border-color 0.2s', boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.2)' }} />
              <select value={seriesState}
                onChange={(e) => setFilters(prev => ({ ...prev, seriesState: e.target.value }))}
                style={{ background: 'rgba(13,17,23,0.7)', border: '1.5px solid rgba(148,163,184,0.15)', borderRadius: 8, padding: '8px 14px', color: '#e0e8f0', fontSize: 13, fontFamily: 'inherit', cursor: 'pointer', outline: 'none', minWidth: 110, boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.2)' }}>
                <option value="all" style={{ background: '#0d1117' }}>All States</option>
                {['AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY','DC'].map(st => (
                  <option key={st} value={st} style={{ background: '#0d1117' }}>{st}</option>
                ))}
              </select>
              <span style={{ fontSize: 12, color: 'rgba(200,214,229,0.4)' }}>
                <span style={{ color: '#d4a853', fontWeight: 700 }}>{filteredSeries.length}</span> series
              </span>
            </div>
            <div style={{ display: 'grid', gap: 12 }}>
              {filteredSeries.map((s, i) => <SeriesCard key={s.series_code || s.id || `series-${i}`} series={s} isFavorited={!!favorites[s.id]} onFavorite={(e) => { e?.stopPropagation(); handleToggleFavorite(s.id, s, 'series'); }} onNavigate={(path) => router.push(path)} />)}
            </div>
            {!seriesLoaded && series.length === 0 && (
              <div style={{ display: 'grid', gap: 12 }}>
                {[1,2,3,4].map(n => <div key={n} style={{ height: 90, borderRadius: 12, background: 'linear-gradient(90deg, rgba(30,40,55,0.5) 25%, rgba(50,60,80,0.5) 50%, rgba(30,40,55,0.5) 75%)', backgroundSize: '200% 100%', animation: 'pnm-shimmer 1.5s ease-in-out infinite', border: '1px solid rgba(148,163,184,0.08)' }} />)}
              </div>
            )}
            {seriesLoaded && filteredSeries.length === 0 && (
              <div style={{ textAlign: 'center', padding: 40, color: 'rgba(200,214,229,0.5)' }}>
                <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>No Matching Series</div>
                <div style={{ fontSize: 13, color: 'rgba(200,214,229,0.4)' }}>{seriesSearch || seriesState !== 'all' ? 'Try adjusting your filters.' : 'Check back soon for poker series schedules.'}</div>
              </div>
            )}
          </div>
        );
        break;
      }

      case 'daily':
        if (dailyTournaments.length === 0 && !loading) {
          component = (
            <div style={{ display: 'grid', gap: 10 }}>
              {[1,2,3,4,5].map(n => (
                <div key={n} style={{
                  height: 80, borderRadius: 12,
                  background: 'linear-gradient(90deg, rgba(30,40,55,0.5) 25%, rgba(50,60,80,0.5) 50%, rgba(30,40,55,0.5) 75%)',
                  backgroundSize: '200% 100%', animation: 'pnm-shimmer 1.5s ease-in-out infinite',
                  border: '1px solid rgba(148,163,184,0.08)',
                }} />
              ))}
              <div style={{ textAlign: 'center', padding: 12, color: 'rgba(200,214,229,0.4)', fontSize: 13 }}>
                Loading daily tournaments...
              </div>
            </div>
          );
        } else {
          component = <DailyTournamentsPanel tournaments={dailyTournaments} onDayChange={fetchDaily} />;
        }
        break;

      case 'calendar':
        component = <SeasonalCalendar series={series} tours={tours} dailyTournaments={dailyTournaments} />;
        break;

      case 'roadtrip':
        component = (
          <div>
            <RoadTripPlanner venues={venues} userLocation={userLocation} locationCity={locationCity} locationState={locationState} />
            {/* Trip Cost Calculator — accessible from Trip Planner */}
            <div style={{ marginTop: 20, padding: '16px 0', borderTop: '1px solid rgba(212,168,83,0.1)' }}>
              <button
                onClick={() => { setActivePod('tripcost'); playPanelOpenSound(); }}
                style={{
                  width: '100%', padding: '12px 20px', borderRadius: 12,
                  border: '1px solid rgba(212,168,83,0.3)',
                  background: 'linear-gradient(135deg, rgba(212,168,83,0.08), rgba(212,168,83,0.03))',
                  color: '#d4a853', fontSize: 14, fontWeight: 700,
                  cursor: 'pointer', fontFamily: 'inherit',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  transition: 'all 0.2s',
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/>
                </svg>
                Estimate Trip Costs
              </button>
            </div>
          </div>
        );
        break;

      case 'favorites': {
        // Merge: show full venue data if in current search, fallback to favorites data
        const favVenues = Object.keys(favorites).filter(k => favorites[k]).map(venueId => {
          const fromSearch = venues.find(v => String(v.id) === String(venueId));
          if (fromSearch) return fromSearch;
          return favoritedVenues.find(f => String(f.id) === String(venueId));
        }).filter(Boolean);

        component = (
          <div style={{ display: 'grid', gap: 12 }}>
            {favVenues.map(v => (
              <VenueCard
                key={v.id}
                venue={v}
                isFavorited={true}
                onFavorite={(e) => { e?.stopPropagation(); handleToggleFavorite(v.id, v); }}
                onNavigate={(url) => handleVenueNavigate(url, v)}
                userLocation={userLocation}
                checkinCount={checkinCounts[String(v.id)] || 0}
                reviewStats={reviewStatsMap[String(v.id)]}
              />
            ))}
            {favVenues.length === 0 && (
              <div style={{ textAlign: 'center', padding: 40, color: 'rgba(200,214,229,0.4)' }}>
                <p style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>No Saved Venues Yet</p>
                <p style={{ fontSize: 13 }}>Tap the Heart on Any Venue to Save It Here.</p>
              </div>
            )}
            {favVenues.length >= 2 && (
              <button
                onClick={() => { setActivePod('compare'); }}
                style={{
                  width: '100%', padding: '10px 16px', borderRadius: 10, marginTop: 12,
                  border: '1px solid rgba(212,168,83,0.25)',
                  background: 'linear-gradient(135deg, rgba(212,168,83,0.06), rgba(212,168,83,0.02))',
                  color: '#d4a853', fontSize: 13, fontWeight: 700,
                  cursor: 'pointer', fontFamily: 'inherit',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  transition: 'all 0.2s',
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>
                </svg>
                Compare Venues
              </button>
            )}
          </div>
        );
        break;
      }

      case 'social':
        component = <SocialLayer userId={userId} venues={venues} userLocation={userLocation} />;
        break;

      case 'alerts':
        component = <TournamentAlerts dailyTournaments={dailyTournaments} userId={userId} userLocation={userLocation} />;
        break;

      case 'tripcost':
        component = (
          <div>
            <TripCostCalculator venues={venues} userLocation={userLocation} />
            <div style={{ marginTop: 16, textAlign: 'center' }}>
              <button
                onClick={() => { setActivePod('roadtrip'); }}
                style={{
                  background: 'none', border: '1px solid rgba(148,163,184,0.15)',
                  borderRadius: 8, padding: '8px 20px', color: '#d4a853',
                  fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                  transition: 'all 0.2s',
                }}
              >
                Back to Trip Planner
              </button>
            </div>
          </div>
        );
        break;

      case 'compare':
        component = <VenueCompare venues={venues} userLocation={userLocation} />;
        break;

      case 'scraperhealth':
        component = <ScraperHealthDashboard />;
        break;

      case 'peakheatmap':
        component = <PeakActivityHeatmap />;
        break;

      case 'gametrends':
        component = <GameTrendsDashboard />;
        break;

      case 'gamealerts':
        component = <VenueGameAlerts userId={userId} venues={venues} />;
        break;

      default:
        component = (
          <div style={{ textAlign: 'center', padding: 40, color: 'rgba(200,214,229,0.4)' }}>
            <p style={{ fontSize: 16, fontWeight: 600 }}>{feature.title}</p>
            <p style={{ fontSize: 13, marginTop: 8 }}>This module is being wired up.</p>
          </div>
        );
    }

    return { title: feature.title, component };
  }, [activePod, venues, tours, series, dailyTournaments, favorites, loading, userLocation, userId, router, handleToggleFavorite, sortBy, showFilters, filters, hasMore, page, fetchDaily, loadMore, handleSortChange, handleFilterChange, favoritedVenues, fetchError, fetchVenues, searchQuery, toursLoaded, seriesLoaded, checkinCounts]);

  // ─── Live data for the 3D scene (drives visual behavior) ───
  // ─── Contextual badge counts (not raw data totals) ───
  // Badge semantics: show actionable/relevant counts, not misleading "99+" totals
  const liveData = useMemo(() => {
    const today = new Date();
    const todayDay = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][today.getDay()];
    const thirtyDaysFromNow = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000);

    // Tours with upcoming dates (next 30 days)
    const upcomingTours = tours.filter(t => {
      if (!t.start_date && !t.next_event_date) return false;
      const d = new Date(t.next_event_date || t.start_date);
      return d >= today && d <= thirtyDaysFromNow;
    });

    // Active/upcoming series
    const activeSeries = series.filter(s => {
      if (!s.end_date && !s.start_date) return true; // no dates = include
      const end = s.end_date ? new Date(s.end_date) : new Date(s.start_date);
      return end >= today;
    });

    // Today's tournaments — match by day_of_week OR by actual event date
    // Use local date (not UTC) — matches todayDay which uses local getDay()
    const todayDateStr = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0') + '-' + String(today.getDate()).padStart(2, '0');
    const todaysTournaments = dailyTournaments.filter(t => {
      // Match by day_of_week name (e.g., "Monday") or "Daily"
      const day = t.day_of_week || t.day;
      if (day && day.toLowerCase() === todayDay.toLowerCase()) return true;
      if (day && day.toLowerCase() === 'daily') return true;
      // Tour/charity events store date strings in day_of_week (e.g., "2026-04-03")
      if (day && day.startsWith(todayDateStr)) return true;
      // Fallback: check dedicated event_date or date field (NOT start_time — that's a time string)
      const eventDate = t.event_date || t.date;
      if (eventDate && String(eventDate).startsWith(todayDateStr)) return true;
      return false;
    });

    // Nearby venues (with GPS) vs total venues (without GPS)
    const nearbyVenues = userLocation
      ? venues.filter(v => v.distance_mi != null && v.distance_mi <= 100)
      : [];

    return {
      // Venue count badge: only show on "Poker Near Me" pod when GPS is active
      // Without GPS, badge is suppressed — no location = no "near me" context
      venueCount: userLocation ? nearbyVenues.length : 0,
      // Total loaded venues (for stats bar — always available regardless of GPS)
      totalVenueCount: venues.length,
      liveGameCount: liveGameCount,
      tourCount: upcomingTours.length > 0 ? upcomingTours.length : (toursLoaded ? 0 : null),
      seriesCount: activeSeries.length,
      // Daily Grind: today's tournaments — authoritative count from API
      // (includes venue daily tournaments + charity events + tour series events)
      dailyCount: todaysTournamentCount || todaysTournaments.length,
      // Calendar: total upcoming events across all days (distinct from dailyCount)
      calendarCount: dailyTournaments.length,
      alertCount: upcomingTours.length, // alerts = upcoming tour events only
      savedCount: Object.keys(favorites).filter(k => favorites[k]).length,
      homeGameCount: venues.filter(v => v.venue_type === 'home_game').length,
      // Map badge: only show when GPS is active (contextual: "X venues on your map")
      // Without GPS, map is still usable but badge count is misleading
      mappableCount: userLocation ? nearbyVenues.filter(v => v.latitude && v.longitude).length : 0,
      lastFetchTime: lastFetchTime,
    };
  }, [venues, tours, series, dailyTournaments, favorites, liveGameCount, userLocation, lastFetchTime, toursLoaded, todaysTournamentCount]);

  return (
    <>
      <SEOHead
        title="Poker Near Me — Find Live Poker Rooms & Casinos"
        description="Discover Live Poker Rooms, Casinos, And Card Rooms Near You. Real-Time Game Info, Tournament Schedules, And Interactive Maps."
        canonical="/hub/poker-near-me-lobby"
      />

      <div className="pnm-lobby-page">
        {/* Universal header and Back button layer */}
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 30, pointerEvents: 'none' }}>
          <div style={{ pointerEvents: 'auto' }}>
            <UniversalHeader pageDepth={1} hideLeftIcon={true} onMenuClick={() => setMenuOpen(true)} />
          </div>
          
          {/* In-page back button — brushed metal style */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            padding: '8px 16px',
            pointerEvents: 'auto'
          }}>
            <img
              src="/images/btn-back.png"
              alt="Back To Hub"
              onClick={() => window.location.href = '/hub'}
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
        </div>

        {/* Hamburger menu */}
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

        {/* Layer 1 — Background */}
        <LobbyCanvas />

        {/* Layer 2 — UI Overlay */}
        <LobbyOverlay
          activePod={activePod}
          onPodSelect={handlePodClick}
          onSearch={handleSearch}
          searchQuery={searchQuery}
          onSearchChange={handleSearchChange}
          liveData={liveData}
          onRefresh={handleRefreshAll}
          showTutorial={showTutorial}
          onTutorialDismiss={() => { setShowTutorial(false); try { localStorage.setItem('pnm_lobby_tutorial_seen', '1'); } catch {} }}
          gpsActive={gpsActive}
          gpsLoading={gpsLoading}
          onGpsClick={handleGpsClick}
          citySuggestions={citySuggestions}
          onCitySelect={handleCitySelect}
          onVoiceClick={() => setShowVoiceSearch(true)}
          gpsError={gpsError}
          searchHistory={searchHistory}
          onHistorySelect={handleCitySelect}
          locationCity={locationCity}
          locationState={locationState}
          onManualLocation={() => setShowManualLocation(true)}
          permissionState={permissionState}
          onShowEnablePopup={() => setShowEnablePopup(true)}
          savedLocation={preferences?.lastLocation}
          savedLocationCity={preferences?.lastLocationCity}
          savedLocationState={preferences?.lastLocationState}
          onUseSavedLocation={() => {
            const saved = preferences?.lastLocation;
            if (saved?.lat && saved?.lng) {
              setUserLocation(saved);
              setGpsActive(true);
              setSortBy('distance');
              showLocationSuccessToast({
                city: preferences?.lastLocationCity || '',
                state: preferences?.lastLocationState || '',
              });
              const gpsUrl = `/api/poker/venues?limit=200&offset=0&lat=${saved.lat}&lng=${saved.lng}&radius=250&sort=distance`;
              cachedFetch(gpsUrl).then(data => {
                const newVenues = data?.data || data?.venues || (Array.isArray(data) ? data : []);
                setVenues(newVenues);
                setHasMore(newVenues.length >= PAGE_SIZE);
                setPage(0);
              }).catch(() => {});
            }
          }}
          venueCount={totalVenueCount}
          onSearchBarClick={() => setShowGlobalSearch(true)}
        />


        {/* Layer 3 — Feature Panel (page level to escape overlay z-index stacking context) */}
        {showPanel && panelContent && (
          <>
            {/* Full-screen panel overlay */}
            <div
              className="lobby-panel-page"
              style={{
                position: 'fixed', inset: 0, zIndex: 51,
                background: 'linear-gradient(160deg, #0c1828, #060a14)',
                display: 'flex', flexDirection: 'column', overflow: 'hidden',
                animation: 'lobby-panelSlideUp 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94) forwards',
              }}
            >
              {/* Header */}
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '16px 20px 14px',
                borderBottom: '1px solid rgba(110, 231, 239, 0.12)',
                background: 'rgba(6, 15, 28, 0.95)',
                flexShrink: 0,
              }}>
                <button
                  onClick={handlePanelClose}
                  aria-label="Back to grid"
                  style={{
                    background: 'rgba(110, 231, 239, 0.08)', border: '1px solid rgba(110, 231, 239, 0.15)',
                    color: '#d4a853',
                    cursor: 'pointer', padding: '6px 14px', borderRadius: 8,
                    fontSize: 13, fontWeight: 600, fontFamily: 'inherit',
                    display: 'flex', alignItems: 'center', gap: 6,
                  }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="15 18 9 12 15 6" />
                  </svg>
                  Back
                </button>
                <h2 style={{
                  fontFamily: 'var(--font-premium-display)',
                  fontSize: 20, fontWeight: 700, margin: 0,
                  background: 'linear-gradient(90deg, #e0e8f0, #d4a853)',
                  WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                  backgroundClip: 'text',
                }}>{panelContent.title}</h2>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  {/* Share deep link button */}
                  <button
                    onClick={() => {
                      const shareUrl = window.location.href;
                      if (navigator.share) {
                        navigator.share({ title: `Smarter.Poker — ${panelContent.title}`, url: shareUrl }).catch(() => {});
                      } else {
                        navigator.clipboard?.writeText(shareUrl);
                        const btn = document.getElementById('pnm-share-btn');
                        if (btn) { btn.textContent = 'Copied!'; setTimeout(() => { btn.textContent = ''; }, 1500); }
                      }
                    }}
                    id="pnm-share-btn"
                    aria-label="Share link"
                    title="Copy shareable link"
                    style={{
                      background: 'none', border: 'none',
                      color: 'rgba(200, 214, 229, 0.4)',
                      cursor: 'pointer', padding: 6, borderRadius: 8,
                      transition: 'color 0.2s', fontSize: 10,
                    }}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
                      <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
                    </svg>
                  </button>
                  <button
                    onClick={handlePanelClose}
                    aria-label="Close panel"
                    style={{
                      background: 'none', border: 'none',
                      color: 'rgba(200, 214, 229, 0.5)',
                      cursor: 'pointer', padding: 6, borderRadius: 8,
                    }}
                  >
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                </div>
              </div>
              {/* Quick Pod Navigation — switch between pods without closing */}
              <div style={{
                display: 'flex', gap: 2, padding: '6px 12px', flexShrink: 0,
                overflowX: 'auto', scrollbarWidth: 'none',
                borderBottom: '1px solid rgba(148,163,184,0.06)',
                background: 'rgba(6,15,28,0.6)',
              }}>
                {[
                  { id: 'nearme', icon: 'M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z', label: 'Near Me' },
                  { id: 'search', icon: 'M10.5 18a7.5 7.5 0 100-15 7.5 7.5 0 000 15zM21 21l-5.2-5.2', label: 'Search' },
                  { id: 'homegames', icon: 'M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z', label: 'Home' },
                  { id: 'daily', icon: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z', label: 'Daily' },
                  { id: 'livegames', icon: 'M13 10V3L4 14h7v7l9-11h-7z', label: 'Live' },
                  { id: 'mapview', icon: 'M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7', label: 'Map' },
                  { id: 'tours', icon: 'M3 21l1.65-3.8a9 9 0 1112.7 0L21 21', label: 'Tours' },
                  { id: 'calendar', icon: 'M8 2v4m8-4v4M3 10h18M5 4h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V6a2 2 0 012-2z', label: 'Calendar' },
                  { id: 'series', icon: 'M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z', label: 'Series' },
                  { id: 'favorites', icon: 'M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z', label: 'Saved' },
                  { id: 'alerts', icon: 'M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0', label: 'Alerts' },
                ].map(p => (
                  <button key={p.id} onClick={() => { setActivePod(p.id); playClickSound(); }}
                    style={{
                      flexShrink: 0, display: 'flex', alignItems: 'center', gap: 4,
                      padding: '4px 10px', borderRadius: 6, fontSize: 10, fontWeight: 700,
                      border: activePod === p.id ? '1px solid rgba(212,168,83,0.4)' : '1px solid transparent',
                      background: activePod === p.id ? 'rgba(212,168,83,0.1)' : 'transparent',
                      color: activePod === p.id ? '#d4a853' : 'rgba(200,214,229,0.35)',
                      cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s',
                      letterSpacing: '0.02em',
                    }}>
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d={p.icon}/></svg>
                    {p.label}
                  </button>
                ))}
              </div>
              {/* GPS Intel Banner — contextual stats when GPS active */}
              {userLocation && (activePod === 'nearme' || activePod === 'search' || activePod === 'livegames' || activePod === 'daily') && (
                <div style={{
                  display: 'flex', gap: 16, justifyContent: 'center', alignItems: 'center',
                  padding: '8px 20px', flexShrink: 0,
                  background: 'linear-gradient(90deg, rgba(63,185,80,0.06), rgba(63,185,80,0.02), rgba(63,185,80,0.06))',
                  borderBottom: '1px solid rgba(63,185,80,0.1)',
                  fontSize: 11, color: 'rgba(200,214,229,0.55)', fontWeight: 600,
                }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#3fb950" strokeWidth="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>
                    <span style={{ color: '#3fb950' }}>{venues.filter(v => v.distance_miles && v.distance_miles <= 50).length || venues.length}</span> venues nearby
                  </span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#d4a853" strokeWidth="2"><path d="M6 9H4.5a2.5 2.5 0 010-5C7 4 7 7 7 7"/><path d="M18 9h1.5a2.5 2.5 0 000-5C17 4 17 7 17 7"/></svg>
                    <span style={{ color: '#d4a853' }}>{dailyTournaments.length.toLocaleString()}</span> tournaments
                  </span>
                  {locationCity && (
                    <span style={{ color: 'rgba(200,214,229,0.35)', fontSize: 10 }}>
                      {locationCity}{locationState ? `, ${locationState}` : ''}
                    </span>
                  )}
                </div>
              )}
              {/* Content — full remaining height with error recovery */}
              <div id="pnm-panel-scroll" style={{ flex: 1, overflowY: 'auto', padding: '16px 20px 90px', WebkitOverflowScrolling: 'touch', position: 'relative' }}>
                <PodErrorBoundary podName={panelContent?.title || activePod} onReset={() => setActivePod(null)}>
                  {panelContent.component}
                </PodErrorBoundary>
                {/* Scroll-to-Top FAB */}
                <button
                  id="pnm-scroll-top"
                  onClick={() => { document.getElementById('pnm-panel-scroll')?.scrollTo({ top: 0, behavior: 'smooth' }); }}
                  style={{
                    position: 'sticky', bottom: 20, left: '50%', transform: 'translateX(-50%)',
                    width: 40, height: 40, borderRadius: '50%', cursor: 'pointer',
                    background: 'linear-gradient(135deg, rgba(148,163,184,0.12), rgba(212,168,83,0.05))',
                    border: '1px solid rgba(212,168,83,0.3)',
                    color: '#d4a853', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
                    transition: 'all 0.2s', zIndex: 5,
                  }}
                  aria-label="Scroll to top"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <polyline points="18 15 12 9 6 15"/>
                  </svg>
                </button>
              </div>
            </div>
          </>
        )}

        {/* Voice Search Modal */}
        {showVoiceSearch && (
          <div style={{
            position: 'fixed', inset: 0, zIndex: 100,
            background: 'rgba(3,4,8,0.85)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <div style={{
              width: 'min(500px, 90vw)', maxHeight: '80vh', overflow: 'auto',
              background: 'rgba(18,24,40,0.97)', borderRadius: 20,
              border: '1px solid rgba(148,163,184,0.12)',
              boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid rgba(212,168,83,0.08)' }}>
                <span style={{ color: '#d4a853', fontSize: 16, fontWeight: 600 }}>Voice Search</span>
                <button onClick={() => setShowVoiceSearch(false)} style={{ background: 'none', border: 'none', color: 'rgba(200,214,229,0.5)', cursor: 'pointer', fontSize: 20 }}>&times;</button>
              </div>
              <div style={{ padding: 20 }}>
                <VoiceSearch onResult={handleVoiceResult} />
              </div>
            </div>
          </div>
        )}
        {/* Login Prompt Modal — auth gate for Check In / Review */}
        {showLoginPrompt && (
          <div style={{
            position: 'fixed', inset: 0, zIndex: 100,
            background: 'rgba(3,4,8,0.85)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }} onClick={() => setShowLoginPrompt(false)}>
            <div onClick={e => e.stopPropagation()} style={{
              width: 'min(380px, 85vw)', padding: '32px 28px', textAlign: 'center',
              background: 'rgba(18,24,40,0.97)', borderRadius: 20,
              border: '1px solid rgba(148,163,184,0.12)',
              boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
            }}>
              <div style={{ marginBottom: 12, opacity: 0.6 }}>
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="rgba(200,214,229,0.5)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0110 0v4" />
                </svg>
              </div>
              <h3 style={{ color: '#e2e8f0', fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Sign In Required</h3>
              <p style={{ color: 'rgba(200,214,229,0.5)', fontSize: 13, lineHeight: 1.5, marginBottom: 24 }}>
                You need to be signed in to check in at venues and leave reviews. Create a free account to unlock all features.
              </p>
              <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
                <button onClick={() => setShowLoginPrompt(false)} style={{
                  padding: '10px 24px', borderRadius: 10, border: '1px solid rgba(148,163,184,0.12)',
                  background: 'transparent', color: 'rgba(200,214,229,0.6)', fontSize: 14, fontWeight: 600,
                  cursor: 'pointer', fontFamily: 'inherit',
                }}>Cancel</button>
                <button onClick={() => { setShowLoginPrompt(false); router.push('/auth/login?redirect=' + encodeURIComponent('/hub/poker-near-me-lobby')); }} style={{
                  padding: '10px 28px', borderRadius: 10, border: 'none',
                  background: 'linear-gradient(135deg, #d4a853, #b8860b)', color: '#0a1628', fontSize: 14, fontWeight: 700,
                  cursor: 'pointer', fontFamily: 'inherit', boxShadow: '0 4px 16px rgba(0,212,255,0.25)',
                }}>Sign In</button>
              </div>
            </div>
          </div>
        )}

        {/* Venue Reviews Modal */}
        {selectedVenueForReview && (
          <div style={{
            position: 'fixed', inset: 0, zIndex: 100,
            background: 'rgba(3,4,8,0.85)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <div style={{
              width: 'min(600px, 95vw)', maxHeight: '85vh', overflow: 'auto',
              background: 'rgba(18,24,40,0.97)', borderRadius: 20,
              border: '1px solid rgba(148,163,184,0.12)',
              boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid rgba(212,168,83,0.08)' }}>
                <span style={{ color: '#d4a853', fontSize: 16, fontWeight: 600 }}>Reviews — {selectedVenueForReview.name}</span>
                <button onClick={() => setSelectedVenueForReview(null)} style={{ background: 'none', border: 'none', color: 'rgba(200,214,229,0.5)', cursor: 'pointer', fontSize: 20 }}>&times;</button>
              </div>
              <div style={{ padding: 20 }}>
                <VenueReviews venueId={selectedVenueForReview.id} userId={userId} />
              </div>
            </div>
          </div>
        )}

      </div>

        {/* ═══ GPS LOCATION SUCCESS TOAST ═══ */}
        {locationToast && (
          <div style={{
            position: 'fixed', top: 80, left: '50%', transform: 'translateX(-50%)', zIndex: 200,
            background: 'linear-gradient(135deg, rgba(16,25,40,0.97), rgba(10,18,32,0.97))',
            border: '1px solid rgba(63,185,80,0.5)', borderRadius: 16,
            padding: '16px 28px', boxShadow: '0 12px 40px rgba(0,0,0,0.5), 0 0 20px rgba(63,185,80,0.15)',
            display: 'flex', alignItems: 'center', gap: 14,
            animation: 'lobby-toastSlideIn 0.3s ease-out',
            backdropFilter: 'blur(16px)',
            minWidth: 260, maxWidth: '90vw',
          }}>
            <div style={{
              width: 42, height: 42, borderRadius: '50%',
              background: 'rgba(63,185,80,0.15)', border: '2px solid rgba(63,185,80,0.4)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#3fb950" strokeWidth="2.5">
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/>
              </svg>
            </div>
            <div>
              <div style={{ fontSize: 13, color: '#3fb950', fontWeight: 800, letterSpacing: '0.5px', textTransform: 'uppercase', marginBottom: 2 }}>Location Found</div>
              <div style={{ fontSize: 17, color: '#e0e8f0', fontWeight: 700 }}>
                {locationToast.city}{locationToast.state ? `, ${locationToast.state}` : ''}
              </div>
            </div>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#3fb950" strokeWidth="2" style={{ marginLeft: 'auto', opacity: 0.6 }}>
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
        )}

        {/* ═══ SMART ENABLE LOCATION POPUP ═══ */}
        {showEnablePopup && (
          <div style={{
            position: 'fixed', inset: 0, zIndex: 155,
            background: 'rgba(3,4,8,0.88)',
            display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
            animation: 'lobby-fadeIn 0.25s ease-out',
            padding: '16px 8px env(safe-area-inset-bottom, 8px)',
          }}>
            <div style={{
              width: 'min(420px, 96vw)',
              maxHeight: '70vh',
              overflowY: 'auto',
              WebkitOverflowScrolling: 'touch',
              background: 'linear-gradient(160deg, rgba(18,24,40,0.98), rgba(10,16,28,0.98))',
              borderRadius: 18,
              border: '1.5px solid rgba(148,163,184,0.18)',
              boxShadow: '0 -8px 40px rgba(0,0,0,0.65), 0 0 30px rgba(212,168,83,0.08)',
              overflow: 'hidden',
              backdropFilter: 'blur(16px)',
              WebkitBackdropFilter: 'blur(16px)',
            }}>
              {/* Header */}
              <div style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '14px 16px', borderBottom: '1px solid rgba(148,163,184,0.1)',
                background: 'linear-gradient(180deg, rgba(212,168,83,0.06), transparent)',
                position: 'sticky', top: 0, zIndex: 1,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: '50%',
                    background: 'linear-gradient(135deg, rgba(34,197,94,0.2), rgba(34,197,94,0.08))',
                    border: '1px solid rgba(34,197,94,0.35)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    animation: 'lobby-gpsPulse 2s ease-in-out infinite',
                  }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="3"/><path d="M12 2v4m0 12v4m-10-10h4m12 0h4"/>
                    </svg>
                  </div>
                  <div>
                    <div style={{ fontSize: 16, fontWeight: 800, color: '#e6edf5', letterSpacing: '-0.3px' }}>Enable Location</div>
                    <div style={{ fontSize: 11, color: 'rgba(200,214,229,0.5)', marginTop: 1 }}>Find poker rooms near you</div>
                  </div>
                </div>
                <button
                  onClick={() => { setShowEnablePopup(false); dismissLocationPrompt(); }}
                  style={{ background: 'none', border: 'none', color: 'rgba(200,214,229,0.45)', cursor: 'pointer', fontSize: 22, padding: 4, lineHeight: 1 }}
                >&times;</button>
              </div>

              {/* Body */}
              <div style={{ padding: '14px 16px' }}>
                {/* Primary CTA — triggers browser permission prompt */}
                <button
                  onClick={() => {
                    // Close popup and attempt GPS — this triggers the native browser prompt
                    // On iOS Safari, permissionState may report 'prompt' even when denied,
                    // so always attempt GPS and handleGpsClick handles the error cases
                    setShowEnablePopup(false);
                    handleGpsClick({ fromModal: true });
                  }}
                  style={{
                    width: '100%', padding: '12px 0', borderRadius: 12,
                    border: '1px solid rgba(34,197,94,0.45)',
                    background: 'linear-gradient(135deg, #238636, #196c2e)',
                    color: '#ffffff', fontSize: 14, fontWeight: 800,
                    cursor: 'pointer', fontFamily: 'inherit',
                    boxShadow: '0 4px 16px rgba(34,197,94,0.25), inset 0 1px 0 rgba(255,255,255,0.1)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                    transition: 'all 0.2s',
                    marginBottom: 14,
                  }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="3"/><path d="M12 2v4m0 12v4m-10-10h4m12 0h4"/>
                  </svg>
                  Try Enabling Location
                </button>

                {/* Device-specific instructions — ALWAYS show (Safari doesn't support Permissions API for geolocation, so permissionState may never read 'denied') */}
                <div style={{
                  background: 'rgba(212,168,83,0.05)',
                  border: '1.5px solid rgba(148,163,184,0.12)',
                  borderRadius: 12, padding: '12px 14px',
                  marginBottom: 14,
                }}>
                  <div style={{
                    fontSize: 11, fontWeight: 700, color: '#d4a853', textTransform: 'uppercase',
                    letterSpacing: '0.8px', marginBottom: 10,
                  }}>
                    {deviceType === 'ios' ? 'iPhone / iPad' : deviceType === 'android' ? 'Android' : 'Browser'} — How To Enable
                  </div>

                  {deviceType === 'ios' && (
                    <div style={{ display: 'grid', gap: 8 }}>
                      {[
                        { step: '1', text: 'Open Settings on your iPhone' },
                        { step: '2', text: 'Tap Privacy & Security → Location Services' },
                        { step: '3', text: 'Make sure Location Services is ON' },
                        { step: '4', text: 'Scroll down, tap Safari (or your browser)' },
                        { step: '5', text: 'Select "While Using The App" or "Ask"' },
                        { step: '6', text: 'Return here and tap the button above' },
                      ].map(s => (
                        <div key={s.step} style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                          <div style={{
                            minWidth: 22, height: 22, borderRadius: '50%',
                            background: 'linear-gradient(135deg, rgba(212,168,83,0.2), rgba(212,168,83,0.08))',
                            border: '1.5px solid rgba(212,168,83,0.3)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 11, fontWeight: 800, color: '#d4a853',
                            flexShrink: 0,
                          }}>{s.step}</div>
                          <div style={{ fontSize: 12, color: 'rgba(200,214,229,0.75)', lineHeight: 1.45, paddingTop: 2 }}>
                            {s.text}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {deviceType === 'android' && (
                    <div style={{ display: 'grid', gap: 8 }}>
                      {[
                        { step: '1', text: 'Open Settings on your phone' },
                        { step: '2', text: 'Tap Location and make sure it\'s ON' },
                        { step: '3', text: 'Tap App Permissions → your browser' },
                        { step: '4', text: 'Select "Allow" and return here' },
                      ].map(s => (
                        <div key={s.step} style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                          <div style={{
                            minWidth: 22, height: 22, borderRadius: '50%',
                            background: 'linear-gradient(135deg, rgba(212,168,83,0.2), rgba(212,168,83,0.08))',
                            border: '1.5px solid rgba(212,168,83,0.3)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 11, fontWeight: 800, color: '#d4a853',
                            flexShrink: 0,
                          }}>{s.step}</div>
                          <div style={{ fontSize: 12, color: 'rgba(200,214,229,0.75)', lineHeight: 1.45, paddingTop: 2 }}>
                            {s.text}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {deviceType === 'desktop' && (
                    <div style={{ display: 'grid', gap: 8 }}>
                      {[
                        { step: '1', text: 'Click the lock icon in your address bar' },
                        { step: '2', text: 'Find "Location" → change to "Allow"' },
                        { step: '3', text: 'Reload the page' },
                      ].map(s => (
                        <div key={s.step} style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                          <div style={{
                            minWidth: 22, height: 22, borderRadius: '50%',
                            background: 'linear-gradient(135deg, rgba(212,168,83,0.2), rgba(212,168,83,0.08))',
                            border: '1.5px solid rgba(212,168,83,0.3)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 11, fontWeight: 800, color: '#d4a853',
                            flexShrink: 0,
                          }}>{s.step}</div>
                          <div style={{ fontSize: 12, color: 'rgba(200,214,229,0.75)', lineHeight: 1.45, paddingTop: 2 }}>
                            {s.text}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Divider */}
                <div style={{
                  textAlign: 'center', fontSize: 10, color: 'rgba(200,214,229,0.3)',
                  marginBottom: 10, textTransform: 'uppercase', letterSpacing: '1.5px',
                  display: 'flex', alignItems: 'center', gap: 10,
                }}>
                  <div style={{ flex: 1, height: 1, background: 'rgba(200,214,229,0.1)' }} />
                  or
                  <div style={{ flex: 1, height: 1, background: 'rgba(200,214,229,0.1)' }} />
                </div>

                {/* Manual Entry CTA */}
                <button
                  onClick={() => {
                    setShowEnablePopup(false);
                    setShowManualLocation(true);
                  }}
                  style={{
                    width: '100%', padding: '10px 0', borderRadius: 10,
                    border: '1.5px solid rgba(148,163,184,0.15)',
                    background: 'rgba(212,168,83,0.06)',
                    color: 'rgba(200,214,229,0.7)', fontSize: 13, fontWeight: 600,
                    cursor: 'pointer', fontFamily: 'inherit',
                    transition: 'all 0.2s',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>
                  </svg>
                  Enter Location Manually Instead
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ═══ MANUAL LOCATION SETTER MODAL ═══ */}
        {showManualLocation && (
          <div style={{
            position: 'fixed', inset: 0, zIndex: 150,
            background: 'rgba(3,4,8,0.85)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <div style={{
              width: 'min(440px, 92vw)',
              background: 'linear-gradient(160deg, rgba(18,24,40,0.98), rgba(10,16,28,0.98))',
              borderRadius: 20,
              border: '1.5px solid rgba(148,163,184,0.15)',
              boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
              overflow: 'hidden',
            }}>
              {/* Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '18px 24px', borderBottom: '1px solid rgba(148,163,184,0.08)' }}>
                <div>
                  <div style={{ fontSize: 17, fontWeight: 700, color: '#e0e8f0' }}>Set Your Location</div>
                  <div style={{ fontSize: 12, color: 'rgba(200,214,229,0.5)', marginTop: 2 }}>Enter your city to find poker near you</div>
                </div>
                <button onClick={() => { setShowManualLocation(false); dismissLocationPrompt(); }} style={{ background: 'none', border: 'none', color: 'rgba(200,214,229,0.5)', cursor: 'pointer', fontSize: 22, padding: 4 }}>&times;</button>
              </div>
              {/* Body */}
              <div style={{ padding: '20px 24px' }}>
                {/* Try GPS Again button */}
                <button onClick={() => handleGpsClick({ fromModal: true })}
                  disabled={gpsLoading}
                  style={{
                    width: '100%', padding: '12px 0', borderRadius: 12,
                    border: gpsLoading ? '1.5px solid rgba(212,168,83,0.4)' : '1px solid rgba(63,185,80,0.4)',
                    background: gpsLoading ? 'rgba(212,168,83,0.12)' : 'linear-gradient(135deg, #238636, #196c2e)',
                    color: '#ffffff', fontSize: 14, fontWeight: 700,
                    cursor: gpsLoading ? 'wait' : 'pointer', fontFamily: 'inherit',
                    boxShadow: gpsLoading ? 'none' : '0 4px 16px rgba(35,134,54,0.3)', marginBottom: 16,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                    transition: 'all 0.2s',
                  }}>
                  {gpsLoading ? (
                    <>
                      <svg width="16" height="16" viewBox="0 0 24 24" style={{ animation: 'spin 1s linear infinite' }}>
                        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" fill="none" strokeDasharray="31" strokeDashoffset="10" />
                      </svg>
                      Locating...
                    </>
                  ) : (
                    <>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/>
                      </svg>
                      Try GPS Again
                    </>
                  )}
                </button>
                {gpsError && (
                  <div style={{ padding: '8px 12px', marginBottom: 12, borderRadius: 8, background: 'rgba(248,81,73,0.1)', border: '1px solid rgba(248,81,73,0.3)', color: '#f85149', fontSize: 12, fontWeight: 600, textAlign: 'center' }}>
                    {gpsError}
                  </div>
                )}

                <div style={{ textAlign: 'center', fontSize: 12, color: 'rgba(200,214,229,0.35)', marginBottom: 16, textTransform: 'uppercase', letterSpacing: '1px' }}>or enter manually</div>

                {/* City Input */}
                <div style={{ marginBottom: 12 }}>
                  <label style={{ fontSize: 11, color: '#8b949e', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: 4 }}>City</label>
                  <input
                    type="text" placeholder="e.g. Chicago" value={manualCity}
                    onChange={(e) => setManualCity(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleManualLocationSet(); }}
                    autoFocus
                    autoComplete="off"
                    style={{
                      width: '100%', padding: '10px 14px', borderRadius: 10,
                      border: '1px solid rgba(48,54,61,0.6)', background: '#0d1117',
                      color: '#e0e8f0', fontSize: 15, fontFamily: 'inherit', outline: 'none',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>

                {/* State Select */}
                <div style={{ marginBottom: 20 }}>
                  <label style={{ fontSize: 11, color: '#8b949e', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: 4 }}>State</label>
                  <select value={manualState} onChange={(e) => setManualState(e.target.value)}
                    style={{
                      width: '100%', padding: '10px 14px', borderRadius: 10,
                      border: '1px solid rgba(48,54,61,0.6)', background: '#0d1117',
                      color: '#c9d1d9', fontSize: 14, fontFamily: 'inherit', cursor: 'pointer', outline: 'none',
                      boxSizing: 'border-box',
                    }}>
                    <option value="">Select State (optional)</option>
                    {['AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY','DC'].map(st => (
                      <option key={st} value={st}>{st}</option>
                    ))}
                  </select>
                </div>

                {/* Set Location Button */}
                <button onClick={handleManualLocationSet}
                  disabled={!manualCity.trim()}
                  style={{
                    width: '100%', padding: '13px 0', borderRadius: 12,
                    border: '1.5px solid rgba(212,168,83,0.4)',
                    background: manualCity.trim() ? 'linear-gradient(135deg, #1f6feb, #1a5cc7)' : 'rgba(212,168,83,0.08)',
                    color: manualCity.trim() ? '#ffffff' : 'rgba(200,214,229,0.4)',
                    fontSize: 15, fontWeight: 800, cursor: manualCity.trim() ? 'pointer' : 'not-allowed',
                    fontFamily: 'inherit', boxShadow: manualCity.trim() ? '0 4px 16px rgba(31,111,235,0.3)' : 'none',
                    transition: 'all 0.2s',
                  }}>
                  Set Location
                </button>
              </div>
            </div>
          </div>
        )}

      {/* ═══ GLOBAL SEARCH OVERLAY ═══
           Full-screen Google-style search: city, state, venue, tour, series, tournament.
           Location = null. Fuzzy match across all content types. */}
      <GlobalSearchOverlay
        isOpen={showGlobalSearch}
        onClose={() => setShowGlobalSearch(false)}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        allTours={tours}
        allSeries={series}
        searchHistory={searchHistory}
        onHistorySelect={(q) => {
          setSearchQuery(q);
          if (typeof addSearchHistoryToDb === 'function' && userId) {
            addSearchHistoryToDb(userId, q).catch(() => {});
          }
        }}
        cachedFetch={cachedFetch}
        onVenueClick={(venue) => {
          setShowGlobalSearch(false);
          // Open the venue detail panel/page
          const url = '/hub/venues/' + venue.id;
          router.push(url);
        }}
        onTourClick={(tour) => {
          setShowGlobalSearch(false);
          router.push('/hub/poker-near-me?tab=events&sub=tours');
        }}
        onSeriesClick={(s) => {
          setShowGlobalSearch(false);
          router.push('/hub/poker-near-me?tab=events&sub=series');
        }}
      />

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

      {/* Global keyframes + VenueCard CSS (required for VenueCard component styling) */}
      <style jsx global>{`
      @keyframes spin { to { transform: rotate(360deg); } }
      @keyframes lobby-panelSlideUp {
        from { transform: translateY(100%); opacity: 0.5; }
        to { transform: translateY(0); opacity: 1; }
      }
      @keyframes lobby-toastSlideIn {
        from { transform: translateX(-50%) translateY(-20px); opacity: 0; }
        to { transform: translateX(-50%) translateY(0); opacity: 1; }
      }
      @keyframes lobby-fadeIn {
        from { opacity: 0; }
        to { opacity: 1; }
      }
      @keyframes lobby-gpsPulse {
        0%, 100% { box-shadow: 0 0 0 0 rgba(34,197,94,0.3); }
        50% { box-shadow: 0 0 0 10px rgba(34,197,94,0); }
      }
      @keyframes lobby-badgePulse {
        0%, 100% { transform: scale(1); }
        50% { transform: scale(1.1); }
      }
      @keyframes pnm-shimmer {
        0% { background-position: -200% 0; }
        100% { background-position: 200% 0; }
      }

      /* ═══ ENTITY CARD BASE — v2.1 ═══ */
      .entity-card {
        background: linear-gradient(145deg, rgba(15, 23, 42, 0.75), rgba(10, 18, 32, 0.9));
        border: 1px solid rgba(255,255,255,0.14);
        border-radius: 16px;
        padding: 16px 18px;
        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        backdrop-filter: blur(10px);
        -webkit-backdrop-filter: blur(10px);
        box-shadow: 0 2px 16px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.04);
        position: relative;
      }
      .entity-card:hover {
        border-color: rgba(212,168,83,0.3);
        background: linear-gradient(145deg, rgba(15, 23, 42, 0.88), rgba(10, 18, 32, 0.96));
        box-shadow: 0 6px 28px rgba(212,168,83,0.1), 0 2px 12px rgba(0,0,0,0.35);
        transform: translateY(-2px);
      }
      .entity-card h4 {
        font-size: 16px;
        font-weight: 600;
        margin: 0 0 4px;
        color: #fff;
      }

      /* ═══ PREMIUM VENUE CARD v2.1 ═══ */
      .venue-card {
        position: relative;
        overflow: hidden;
      }

      /* Accent Line — always visible, uses venue type color */
      .venue-accent-line {
        position: absolute;
        top: 0; left: 0; right: 0;
        height: 3px;
        border-radius: 16px 16px 0 0;
        opacity: 0.7;
        transition: opacity 0.3s;
      }
      .venue-card:hover .venue-accent-line {
        opacity: 1;
      }

      /* Distance Pill */
      .venue-distance-pill {
        position: absolute;
        top: 14px; right: 50px;
        display: inline-flex;
        align-items: center;
        gap: 4px;
        padding: 4px 10px;
        background: rgba(34,197,94,0.14);
        border: 1px solid rgba(34,197,94,0.3);
        border-radius: 20px;
        font-size: 11px;
        font-weight: 600;
        color: #4ade80;
        z-index: 1;
      }

      /* Favorite Button */
      .fav-btn {
        position: absolute;
        top: 10px; right: 10px;
        background: rgba(0,0,0,0.5);
        border: 1px solid rgba(255,255,255,0.08);
        border-radius: 50%;
        width: 34px; height: 34px;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        z-index: 2;
        transition: all 0.2s;
      }
      .fav-btn:hover {
        background: rgba(239,68,68,0.35);
        transform: scale(1.12);
        border-color: rgba(239,68,68,0.3);
      }
      .fav-btn.active {
        background: rgba(239,68,68,0.2);
        border-color: rgba(239,68,68,0.4);
      }

      /* Venue Type Badge */
      .venue-type-badge {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        padding: 4px 10px;
        border-radius: 6px;
        font-size: 11px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.4px;
        margin-bottom: 8px;
      }

      /* Venue Name — enhanced typography */
      .venue-name {
        font-size: 18px !important;
        font-weight: 800 !important;
        margin: 0 0 6px !important;
        color: #f0f4f8;
        padding-right: 80px;
        line-height: 1.3;
        letter-spacing: -0.2px;
      }

      /* Venue Address — improved contrast */
      .venue-address {
        display: flex;
        align-items: center;
        gap: 5px;
        font-size: 13px;
        color: rgba(255,255,255,0.58);
        margin: 0 0 10px;
        line-height: 1.4;
      }

      /* Venue Host Row */
      .venue-host-row {
        display: flex;
        align-items: center;
        gap: 6px;
        margin-top: 4px;
        margin-bottom: 6px;
      }

      /* Venue Stakes */
      .venue-stakes {
        font-size: 13px;
        color: rgba(212,168,83,0.9);
        margin: 0 0 8px;
        font-weight: 600;
      }

      /* Trust Score Row — upgraded bar height + animation */
      .trust-score-row {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 10px 0 8px;
        border-top: 1px solid rgba(255,255,255,0.07);
        margin-top: 4px;
      }
      .trust-score-label {
        font-size: 11.5px;
        font-weight: 700;
        white-space: nowrap;
      }
      .trust-score-bar {
        flex: 1;
        height: 6px;
        background: rgba(255,255,255,0.08);
        border-radius: 3px;
        overflow: hidden;
      }
      .trust-score-fill {
        height: 100%;
        border-radius: 3px;
        transition: width 0.8s cubic-bezier(0.4, 0, 0.2, 1);
      }
      .trust-score-val {
        font-size: 11.5px;
        font-weight: 800;
        white-space: nowrap;
      }

      /* ═══ UNIFIED ACTION BAR v2.1 ═══ */
      .venue-action-bar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        padding-top: 10px;
        border-top: 1px solid rgba(255,255,255,0.07);
        margin-top: 6px;
      }

      /* Secondary icon-only buttons (Web/Call/Map) */
      .venue-secondary-actions {
        display: flex;
        gap: 6px;
      }
      .venue-icon-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 36px; height: 36px;
        border-radius: 10px;
        border: 1px solid rgba(255,255,255,0.12);
        background: rgba(255,255,255,0.05);
        color: rgba(255,255,255,0.6);
        text-decoration: none;
        cursor: pointer;
        transition: all 0.2s;
      }
      .venue-icon-btn:hover {
        background: rgba(255,255,255,0.1);
        border-color: rgba(255,255,255,0.25);
        color: #fff;
        transform: translateY(-1px);
        box-shadow: 0 2px 8px rgba(0,0,0,0.2);
      }

      /* Primary action pills (Check In/Review/Details) */
      .venue-primary-actions {
        display: flex;
        gap: 6px;
        flex: 1;
        justify-content: flex-end;
      }
      .venue-action-pill {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        padding: 7px 12px;
        border-radius: 10px;
        font-size: 12px;
        font-weight: 700;
        cursor: pointer;
        border: 1px solid transparent;
        transition: all 0.2s;
        font-family: inherit;
        white-space: nowrap;
      }
      .venue-action-pill span {
        font-size: 11.5px;
      }
      .venue-action-pill.checkin {
        background: rgba(34,197,94,0.12);
        color: #4ade80;
        border-color: rgba(34,197,94,0.25);
      }
      .venue-action-pill.checkin:hover {
        background: rgba(34,197,94,0.22);
        box-shadow: 0 0 12px rgba(34,197,94,0.15);
      }
      .venue-action-pill.review {
        background: rgba(59,130,246,0.12);
        color: #60a5fa;
        border-color: rgba(59,130,246,0.25);
      }
      .venue-action-pill.review:hover {
        background: rgba(59,130,246,0.22);
        box-shadow: 0 0 12px rgba(59,130,246,0.15);
      }
      .venue-action-pill.details {
        background: rgba(212,168,83,0.12);
        color: #d4a853;
        border-color: rgba(212,168,83,0.25);
      }
      .venue-action-pill.details:hover {
        background: rgba(212,168,83,0.22);
        box-shadow: 0 0 12px rgba(212,168,83,0.15);
      }

      /* Legacy action classes preserved for compatibility */
      .venue-action-row { display: none; }
      .venue-quick-actions { display: none; }

      /* ═══════════════════════════════════════════════
         VC3 DESIGN SYSTEM — VenueCard v4.0
         Complete CSS for the vc3-* component library
         ═══════════════════════════════════════════════ */

      /* Card Container */
      .vc3-card {
        background: linear-gradient(145deg, rgba(15, 23, 42, 0.75), rgba(10, 18, 32, 0.9));
        border: 1px solid rgba(255,255,255,0.14);
        border-radius: 16px;
        padding: 16px 18px;
        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        backdrop-filter: blur(10px);
        -webkit-backdrop-filter: blur(10px);
        box-shadow: 0 2px 16px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.04);
        position: relative;
        overflow: hidden;
        cursor: pointer;
      }
      .vc3-card:hover {
        filter: brightness(1.08);
        background: linear-gradient(145deg, rgba(15, 23, 42, 0.88), rgba(10, 18, 32, 0.96));
        box-shadow: 0 6px 28px rgba(212,168,83,0.1), 0 2px 12px rgba(0,0,0,0.35);
        transform: translateY(-2px);
      }

      /* Header Zone */
      .vc3-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 10px;
      }

      /* Status Group (right side) */
      .vc3-status-group {
        display: flex;
        align-items: center;
        gap: 8px;
      }

      /* Open/Closed Pill */
      .vc3-open-pill {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        padding: 3px 10px;
        border-radius: 20px;
        font-size: 11px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.3px;
        background: rgba(34,197,94,0.12);
        border: 1px solid rgba(34,197,94,0.3);
        color: #4ade80;
      }
      .vc3-open-dot {
        width: 6px; height: 6px;
        border-radius: 50%;
        background: #4ade80;
        box-shadow: 0 0 6px rgba(74,222,128,0.5);
        animation: vc3-pulse 2s ease-in-out infinite;
      }
      @keyframes vc3-pulse {
        0%, 100% { box-shadow: 0 0 3px rgba(74,222,128,0.3); }
        50% { box-shadow: 0 0 8px rgba(74,222,128,0.6); }
      }

      /* Distance pill */
      .vc3-distance {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        padding: 3px 10px;
        background: rgba(34,197,94,0.1);
        border: 1px solid rgba(34,197,94,0.25);
        border-radius: 20px;
        font-size: 11px;
        font-weight: 600;
        color: #4ade80;
      }

      /* Type Badge */
      .vc3-type-badge {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        padding: 4px 10px;
        border-radius: 6px;
        font-size: 11px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.4px;
        border: 1px solid;
      }

      /* Favorite Button */
      .vc3-fav {
        position: absolute;
        top: 10px; right: 10px;
        background: rgba(0,0,0,0.5);
        border: 1px solid rgba(255,255,255,0.08);
        border-radius: 50%;
        width: 34px; height: 34px;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        z-index: 2;
        transition: all 0.2s;
      }
      .vc3-fav:hover { background: rgba(239,68,68,0.35); transform: scale(1.12); border-color: rgba(239,68,68,0.3); }
      .vc3-fav.active { background: rgba(239,68,68,0.2); border-color: rgba(239,68,68,0.4); }

      /* Name */
      .vc3-name {
        font-size: 18px;
        font-weight: 800;
        margin: 0 0 6px;
        color: #f0f4f8;
        padding-right: 80px;
        line-height: 1.3;
        letter-spacing: -0.2px;
      }

      /* Address */
      .vc3-address {
        display: flex;
        align-items: center;
        gap: 5px;
        font-size: 13px;
        color: rgba(255,255,255,0.58);
        margin: 0 0 10px;
        line-height: 1.4;
      }

      /* Host for Home Games */
      .vc3-host {
        display: flex;
        align-items: center;
        gap: 6px;
        margin: 4px 0 6px;
      }
      .vc3-host-name { font-size: 13px; color: #d4a853; font-weight: 600; }
      .vc3-host-link { font-size: 11px; color: #d4a853; text-decoration: none; margin-left: auto; padding: 2px 8px; border: 1px solid rgba(212,168,83,0.3); border-radius: 4px; }
      .vc3-host-link:hover { background: rgba(212,168,83,0.15); }
      .vc3-description { font-size: 13px; color: rgba(255,255,255,0.5); margin: 0 0 8px; font-style: italic; }

      /* Badge Row */
      .vc3-badges {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        margin-bottom: 8px;
      }
      .vc3-badge {
        padding: 3px 9px;
        border-radius: 5px;
        font-size: 11px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.4px;
      }
      .vc3-badge-featured { background: rgba(212,168,83,0.2); color: #d4a853; border: 1px solid rgba(212,168,83,0.35); }
      .vc3-badge-newcomer { background: rgba(34,197,94,0.15); color: #4ade80; border: 1px solid rgba(34,197,94,0.3); }
      .vc3-badge-promo { background: rgba(139,92,246,0.15); color: #a78bfa; border: 1px solid rgba(139,92,246,0.3); }
      .vc3-badge-tourney { background: rgba(239,68,68,0.12); color: #f87171; border: 1px solid rgba(239,68,68,0.25); }
      .vc3-badge-live {
        background: rgba(239,68,68,0.18); color: #ef4444; border: 1px solid rgba(239,68,68,0.4);
        box-shadow: 0 0 8px rgba(239,68,68,0.2); animation: livePulse 2s ease-in-out infinite;
        display: inline-flex; align-items: center; gap: 5px;
      }
      .vc3-live-dot {
        width: 6px; height: 6px; border-radius: 50%; background: #ef4444;
        box-shadow: 0 0 6px rgba(239,68,68,0.5); animation: livePulse 2s ease-in-out infinite;
      }
      .vc3-badge-checkin { background: rgba(230,81,0,0.15); color: #E65100; border: 1px solid rgba(230,81,0,0.3); cursor: pointer; }
      .vc3-badge-checkin:hover { background: rgba(230,81,0,0.25); }

      /* Data Zone */
      .vc3-data-zone { margin-top: 4px; }

      /* Live Info Row */
      .vc3-live-info {
        display: flex;
        gap: 16px;
        margin-bottom: 8px;
        padding: 8px 10px;
        background: rgba(0,0,0,0.15);
        border-radius: 8px;
        border: 1px solid rgba(255,255,255,0.04);
      }
      .vc3-live-stat { display: flex; align-items: center; gap: 6px; }
      .vc3-live-stat-val { font-size: 16px; font-weight: 800; color: #fff; }
      .vc3-live-stat-label { font-size: 11px; color: rgba(255,255,255,0.5); text-transform: uppercase; letter-spacing: 0.3px; }

      /* Hours */
      .vc3-hours {
        display: flex;
        align-items: center;
        gap: 5px;
        font-size: 12.5px;
        color: rgba(255,255,255,0.55);
        margin: 0 0 6px;
        font-style: italic;
      }

      /* Game Chips */
      .vc3-games {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        margin-bottom: 8px;
      }
      .vc3-game-chip {
        padding: 4px 10px;
        border-radius: 5px;
        font-size: 11.5px;
        font-weight: 600;
        border: 1px solid;
      }

      /* Stakes */
      .vc3-stakes {
        display: flex;
        align-items: center;
        gap: 5px;
        font-size: 13px;
        color: rgba(212,168,83,0.9);
        margin: 0 0 8px;
        font-weight: 600;
      }

      /* Trust Score */
      .vc3-trust {
        padding: 10px 0 8px;
        border-top: 1px solid rgba(255,255,255,0.07);
        margin-top: 4px;
      }
      .vc3-trust-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 4px;
      }
      .vc3-trust-label { font-size: 11.5px; font-weight: 700; }
      .vc3-trust-val { font-size: 11.5px; font-weight: 800; }
      .vc3-trust-track {
        height: 6px;
        background: rgba(255,255,255,0.08);
        border-radius: 3px;
        overflow: hidden;
      }
      .vc3-trust-fill {
        height: 100%;
        border-radius: 3px;
        transition: width 0.8s cubic-bezier(0.4, 0, 0.2, 1);
      }

      /* Action Bar */
      .vc3-actions {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        padding-top: 10px;
        border-top: 1px solid rgba(255,255,255,0.07);
        margin-top: 6px;
      }
      .vc3-actions-secondary { display: flex; gap: 6px; }
      .vc3-icon-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 36px; height: 36px;
        border-radius: 10px;
        border: 1px solid rgba(255,255,255,0.12);
        background: rgba(255,255,255,0.05);
        color: rgba(255,255,255,0.6);
        text-decoration: none;
        cursor: pointer;
        transition: all 0.2s;
      }
      .vc3-icon-btn:hover {
        background: rgba(255,255,255,0.1);
        border-color: rgba(255,255,255,0.25);
        color: #fff;
        transform: translateY(-1px);
        box-shadow: 0 2px 8px rgba(0,0,0,0.2);
      }
      .vc3-actions-primary {
        display: flex;
        gap: 6px;
        flex: 1;
        justify-content: flex-end;
      }
      .vc3-pill {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        padding: 7px 12px;
        border-radius: 10px;
        font-size: 12px;
        font-weight: 700;
        cursor: pointer;
        border: 1px solid transparent;
        transition: all 0.2s;
        font-family: inherit;
        white-space: nowrap;
        background: none;
      }
      .vc3-pill span { font-size: 11.5px; }
      .vc3-pill-checkin { background: rgba(34,197,94,0.12); color: #4ade80; border-color: rgba(34,197,94,0.25); }
      .vc3-pill-checkin:hover { background: rgba(34,197,94,0.22); box-shadow: 0 0 12px rgba(34,197,94,0.15); }
      .vc3-pill-review { background: rgba(59,130,246,0.12); color: #60a5fa; border-color: rgba(59,130,246,0.25); }
      .vc3-pill-review:hover { background: rgba(59,130,246,0.22); box-shadow: 0 0 12px rgba(59,130,246,0.15); }
      .vc3-pill-details { background: rgba(212,168,83,0.12); color: #d4a853; border-color: rgba(212,168,83,0.25); }
      .vc3-pill-details:hover { background: rgba(212,168,83,0.22); box-shadow: 0 0 12px rgba(212,168,83,0.15); }

      /* ═══ VC3 MOBILE RESPONSIVE ═══ */
      @media (max-width: 480px) {
        .vc3-actions { flex-direction: column; gap: 8px; }
        .vc3-actions-secondary { width: 100%; justify-content: flex-start; }
        .vc3-actions-primary { width: 100%; justify-content: stretch; }
        .vc3-pill { flex: 1; justify-content: center; }
        .vc3-name { font-size: 16px; padding-right: 70px; }
        .vc3-header { flex-wrap: wrap; gap: 8px; }
        .vc3-status-group { flex-wrap: wrap; gap: 4px; }
      }

      /* Badge Row — improved sizing */
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
      .featured-badge {
        background: rgba(212,168,83,0.2);
        color: #d4a853;
        border: 1px solid rgba(212,168,83,0.35);
      }
      .newcomer-badge {
        background: rgba(34,197,94,0.15);
        color: #4ade80;
        border: 1px solid rgba(34,197,94,0.3);
      }
      .promo-badge {
        background: rgba(139,92,246,0.15);
        color: #a78bfa;
        border: 1px solid rgba(139,92,246,0.3);
      }
      .tourney-badge {
        background: rgba(239,68,68,0.12);
        color: #f87171;
        border: 1px solid rgba(239,68,68,0.25);
      }
      .live-badge {
        background: rgba(239,68,68,0.18);
        color: #ef4444;
        border: 1px solid rgba(239,68,68,0.4);
        box-shadow: 0 0 8px rgba(239,68,68,0.2);
        animation: livePulse 2s ease-in-out infinite;
      }
      .checkin-badge {
        background: rgba(230,81,0,0.15);
        color: #E65100;
        border: 1px solid rgba(230,81,0,0.3);
        cursor: pointer;
      }
      .checkin-badge:hover {
        background: rgba(230,81,0,0.25);
      }
      @keyframes livePulse {
        0%, 100% { box-shadow: 0 0 8px rgba(239,68,68,0.2); }
        50% { box-shadow: 0 0 14px rgba(239,68,68,0.35); }
      }

      /* Card Tags — improved contrast */
      .card-tags {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        margin-bottom: 8px;
      }
      .tag {
        padding: 4px 10px;
        border-radius: 5px;
        font-size: 11.5px;
        font-weight: 500;
        background: rgba(212,168,83,0.08);
        color: rgba(255,255,255,0.75);
        border: 1.5px solid rgba(148,163,184,0.1);
      }
      .tag.game {
        background: rgba(212,168,83,0.08);
        border: 1.5px solid rgba(148,163,184,0.1);
      }
      .tag.distance { background: rgba(34,197,94,0.15); color: #4ade80; border: 1px solid rgba(34,197,94,0.2); }

      /* Card Hours */
      .card-hours {
        font-size: 12.5px;
        color: rgba(255,255,255,0.55);
        margin: 0 0 6px;
        font-style: italic;
      }

      /* ═══ MOBILE RESPONSIVE ═══ */
      @media (max-width: 480px) {
        .venue-action-bar {
          flex-direction: column;
          gap: 8px;
        }
        .venue-secondary-actions {
          width: 100%;
          justify-content: flex-start;
        }
        .venue-primary-actions {
          width: 100%;
          justify-content: stretch;
        }
        .venue-action-pill {
          flex: 1;
          justify-content: center;
        }
        .venue-name {
          font-size: 16px !important;
          padding-right: 70px;
        }
      }
    `}</style>
    </>
  );
}
/* audit-trigger: 1774471099 */
// GOAT Search Engine rebuild trigger 1774534082
