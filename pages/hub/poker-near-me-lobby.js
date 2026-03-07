/**
 * POKER NEAR ME — CINEMATIC 3D LOBBY
 *
 * This is the immersive, game-inspired lobby version of Poker Near Me.
 * It replaces the flat tab layout with a full 3D interactive command lobby
 * built on React Three Fiber, GSAP, and Framer Motion.
 *
 * Architecture:
 *   Layer 1 — 3D Scene (LobbyScene: radar, pods, particles, camera)
 *   Layer 2 — UI Overlay (LobbyOverlay: search, dock, panels)
 *   Layer 3 — Feature Modules (existing components loaded into panels)
 *
 * Data layer is identical to the original poker-near-me.js:
 *   - Same API endpoints (/api/poker/venues, etc.)
 *   - Same Supabase services (favorites, preferences, search history)
 *   - Same caching, retry, and analytics logic
 */

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useRouter } from 'next/router';
import dynamic from 'next/dynamic';
import SEOHead from '../../src/components/seo/SEOHead';
import { useAvatar } from '../../src/contexts/AvatarContext';
import UniversalHeader from '../../src/components/ui/UniversalHeader';
import HamburgerMenu from '../../src/components/ui/HamburgerMenu';
import { getMenuConfig } from '../../src/config/hamburgerMenus';
import { getPokerNearMePreferences } from '../../src/services/pokerNearMePreferences';
import { getVenueFavorites, addVenueFavorite, removeVenueFavorite } from '../../src/services/pokerNearMeFavorites';
import { addSearchHistory as addSearchHistoryToDb, getSearchHistory as getSearchHistoryFromDb } from '../../src/services/pokerNearMeSearchHistory';

// Dynamic imports — 3D scene (client-only, no SSR)
const LobbyScene = dynamic(
  () => import('../../src/components/poker-near-me/lobby/LobbyScene').catch(err => {
    console.error('[PokerNearMeLobby] LobbyScene module failed to load:', err);
    return {
      default: () => (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0a0a0f', color: '#00d4ff', fontFamily: 'Orbitron, sans-serif', fontSize: 16, flexDirection: 'column', gap: 12 }}>
          <div>3D Scene — Reloading...</div>
          <button onClick={() => window.location.reload()} style={{ background: '#1877f2', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 24px', cursor: 'pointer' }}>Refresh</button>
        </div>
      )
    };
  }),
  {
    ssr: false,
    loading: () => (
      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0a0a0f', color: '#6ee7ef', fontFamily: 'Orbitron, sans-serif', fontSize: 16 }}>
        Initializing 3D Lobby...
      </div>
    ),
  }
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
const SeriesCard = dynamic(() => import('../../src/components/poker-near-me/SeriesCard'), { ssr: false });
const LiveGamesFeed = dynamic(() => import('../../src/components/poker-near-me/LiveGamesFeed'), { ssr: false });
const NearMeNowFeed = dynamic(() => import('../../src/components/poker-near-me/NearMeNowFeed'), { ssr: false });
const RoadTripPlanner = dynamic(() => import('../../src/components/poker-near-me/RoadTripPlanner'), { ssr: false });
const SocialLayer = dynamic(() => import('../../src/components/poker-near-me/SocialLayer'), { ssr: false });
const TournamentAlerts = dynamic(() => import('../../src/components/poker-near-me/TournamentAlerts'), { ssr: false });
const SeasonalCalendar = dynamic(() => import('../../src/components/poker-near-me/SeasonalCalendar'), { ssr: false });
const TripCostCalculator = dynamic(() => import('../../src/components/poker-near-me/TripCostCalculator'), { ssr: false });
const FilterPanel = dynamic(() => import('../../src/components/poker-near-me/FilterPanel'), { ssr: false });
const VoiceSearch = dynamic(() => import('../../src/components/poker-near-me/VoiceSearch'), { ssr: false });
const VenueReviews = dynamic(() => import('../../src/components/poker-near-me/VenueReviews'), { ssr: false });

// ─── Constants ───
const SEARCH_DEBOUNCE_MS = 400;
const API_CACHE_TTL = 60000;
const LIVE_REFRESH_MS = 120000;
const PAGE_SIZE = 24;

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

// API cache
const apiCache = {};
function cachedFetch(url, ttl = API_CACHE_TTL) {
  const now = Date.now();
  if (apiCache[url] && (now - apiCache[url].time) < ttl) {
    return Promise.resolve(apiCache[url].data);
  }
  return fetch(url).then(r => r.json()).then(data => {
    apiCache[url] = { data, time: now };
    return data;
  });
}

// Retry wrapper
async function fetchWithRetry(url, options = {}, maxRetries = 3) {
  let lastError;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const res = await fetch(url, options);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      lastError = err;
      if (attempt < maxRetries - 1) {
        await new Promise(r => setTimeout(r, Math.pow(2, attempt) * 500));
      }
    }
  }
  throw lastError;
}

// ─── Pod → Feature mapping ───
const POD_FEATURES = {
  search:    { title: 'Search Venues',   tab: 'venues' },
  nearme:    { title: 'Near Me',         tab: 'nearnow' },
  livegames: { title: 'Live Games',      tab: 'live' },
  mapview:   { title: 'Map View',        tab: 'map' },
  tours:     { title: 'Tours',           tab: 'tours' },
  calendar:  { title: 'Calendar',        tab: 'calendar' },
  daily:     { title: 'Daily',           tab: 'daily' },
  series:    { title: 'Series',          tab: 'series' },
  wallet:    { title: 'Rewards',         tab: 'rewards' },
  roadtrip:  { title: 'Trip Planner',    tab: 'roadtrip' },
  favorites: { title: 'Saved',           tab: 'favorites' },
  social:    { title: 'Friends',         tab: 'social' },
  alerts:    { title: 'Alerts',          tab: 'alerts' },
  calculator:{ title: 'Trip Calculator', tab: 'calculator' },
};

export default function PokerNearMeLobby() {
  const router = useRouter();
  const { avatarUrl, userId } = useAvatar?.() || {};

  // ─── Core State ───
  const [activePod, setActivePod] = useState(null);
  const [showPanel, setShowPanel] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [sortBy, setSortBy] = useState('trust');
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState({});
  const [citySuggestions, setCitySuggestions] = useState([]);
  const [showVoiceSearch, setShowVoiceSearch] = useState(false);
  const [selectedVenueForReview, setSelectedVenueForReview] = useState(null);

  // ─── Data State ───
  const [venues, setVenues] = useState([]);
  const [tours, setTours] = useState([]);
  const [series, setSeries] = useState([]);
  const [dailyTournaments, setDailyTournaments] = useState([]);
  const [liveGames, setLiveGames] = useState([]);
  const [favorites, setFavorites] = useState({});
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [page, setPage] = useState(0);

  // ─── Location State ───
  const [userLocation, setUserLocation] = useState(null);
  const [gpsActive, setGpsActive] = useState(false);

  // ─── Menu config ───
  const menuConfig = useMemo(() => getMenuConfig('poker-near-me'), []);

  // ─── Deep Link: read URL params on mount ───
  // Uses URLSearchParams directly instead of router.query (which can be empty on first render)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const pod = params.get('pod');
    const q = params.get('q');
    if (pod && POD_FEATURES[pod]) {
      setActivePod(pod);
      setShowPanel(true);
    }
    if (q) setSearchQuery(q);
  }, []);

  // ─── Deep Link: write URL params on state change ───
  // IMPORTANT: Use window.history.replaceState — NOT router.replace.
  // router.replace causes a re-render cycle that resets component state,
  // killing the panel and 3D scene. replaceState updates the URL silently.
  useEffect(() => {
    const params = new URLSearchParams();
    if (activePod) params.set('pod', activePod);
    if (searchQuery) params.set('q', searchQuery);
    const qs = params.toString();
    const newUrl = qs ? `/hub/poker-near-me-lobby?${qs}` : '/hub/poker-near-me-lobby';
    const currentUrl = window.location.pathname + window.location.search;
    if (currentUrl !== newUrl) {
      window.history.replaceState(null, '', newUrl);
    }
  }, [activePod, searchQuery]);

  // ─── Fetch venues ───
  const fetchVenues = useCallback(async (query = '', pageNum = 0, append = false) => {
    setLoading(true);
    try {
      let url = `/api/poker/venues?limit=${PAGE_SIZE}&offset=${pageNum * PAGE_SIZE}`;
      if (query) url += `&search=${encodeURIComponent(query)}`;
      if (userLocation) {
        url += `&lat=${userLocation.lat}&lng=${userLocation.lng}&radius=100`;
      }
      if (sortBy) url += `&sort=${sortBy}`;
      // Apply filters
      if (filters.gameType) url += `&game_type=${filters.gameType}`;
      if (filters.stakes) url += `&stakes=${filters.stakes}`;
      if (filters.radius) url += `&radius=${filters.radius}`;
      if (filters.venueType) url += `&venue_type=${filters.venueType}`;

      const data = await cachedFetch(url);
      const newVenues = data?.venues || (Array.isArray(data) ? data : []);
      if (append) {
        setVenues(prev => [...prev, ...newVenues]);
      } else {
        setVenues(newVenues);
      }
      setHasMore(newVenues.length >= PAGE_SIZE);
      setPage(pageNum);
    } catch (err) {
      console.error('Failed to fetch venues:', err);
    } finally {
      setLoading(false);
    }
  }, [userLocation, sortBy, filters]);

  // ─── Load more ───
  const loadMore = useCallback(() => {
    fetchVenues(searchQuery, page + 1, true);
  }, [fetchVenues, searchQuery, page]);

  // ─── Fetch tours ───
  const fetchTours = useCallback(async () => {
    try {
      const data = await cachedFetch('/api/poker/venues?type=tours');
      if (data?.tours) setTours(data.tours);
    } catch (err) {
      console.error('Failed to fetch tours:', err);
    }
  }, []);

  // ─── Fetch favorites ───
  const fetchFavorites = useCallback(async () => {
    if (!userId) return;
    try {
      const favs = await getVenueFavorites(userId);
      const favMap = {};
      (favs || []).forEach(f => { favMap[f.venue_id] = true; });
      setFavorites(favMap);
    } catch (err) {
      console.error('Failed to fetch favorites:', err);
    }
  }, [userId]);

  // ─── Fetch series ───
  const fetchSeries = useCallback(async () => {
    try {
      const data = await cachedFetch('/api/poker/venues?type=series');
      if (data?.series) setSeries(data.series);
      else if (Array.isArray(data)) setSeries(data);
    } catch (err) {
      console.error('Failed to fetch series:', err);
    }
  }, []);

  // ─── Fetch daily tournaments ───
  const fetchDaily = useCallback(async () => {
    try {
      let url = '/api/poker/venues?type=daily';
      if (userLocation) url += `&lat=${userLocation.lat}&lng=${userLocation.lng}&radius=100`;
      const data = await cachedFetch(url);
      if (data?.tournaments) setDailyTournaments(data.tournaments);
      else if (Array.isArray(data)) setDailyTournaments(data);
    } catch (err) {
      console.error('Failed to fetch daily tournaments:', err);
    }
  }, [userLocation]);

  // ─── Fetch live games ───
  const fetchLiveGames = useCallback(async () => {
    try {
      const data = await cachedFetch('/api/public/live-games/nearby', 30000);
      if (data?.games) setLiveGames(data.games);
    } catch (err) {
      console.error('Failed to fetch live games:', err);
    }
  }, []);

  // ─── Initial data load ───
  useEffect(() => {
    fetchVenues();
    fetchTours();
    fetchSeries();
    fetchDaily();
    fetchLiveGames();
    fetchFavorites();
  }, [fetchVenues, fetchTours, fetchSeries, fetchDaily, fetchLiveGames, fetchFavorites]);

  // ─── Live games refresh ───
  useEffect(() => {
    const interval = setInterval(() => {
      fetchLiveGames();
    }, LIVE_REFRESH_MS);
    return () => clearInterval(interval);
  }, [fetchLiveGames]);

  // ─── Search handler ───
  const searchTimeoutRef = useRef(null);
  const handleSearchChange = useCallback((value) => {
    setSearchQuery(value);

    // City autocomplete
    if (value.length >= 2) {
      const lower = value.toLowerCase();
      const matches = POPULAR_CITIES.filter(c => c.toLowerCase().includes(lower)).slice(0, 5);
      setCitySuggestions(matches);
    } else {
      setCitySuggestions([]);
    }

    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = setTimeout(() => {
      if (value.length >= 2) {
        fetchVenues(value);
        if (userId) addSearchHistoryToDb(userId, value).catch(() => {});
      }
    }, SEARCH_DEBOUNCE_MS);
  }, [fetchVenues, userId]);

  const handleSearch = useCallback((query) => {
    setCitySuggestions([]);
    if (query) fetchVenues(query);
  }, [fetchVenues]);

  const handleCitySelect = useCallback((city) => {
    setSearchQuery(city);
    setCitySuggestions([]);
    fetchVenues(city);
    if (userId) addSearchHistoryToDb(userId, city).catch(() => {});
  }, [fetchVenues, userId]);

  // ─── Voice search result handler ───
  const handleVoiceResult = useCallback((result) => {
    setShowVoiceSearch(false);
    if (result?.searchQuery) {
      setSearchQuery(result.searchQuery);
      fetchVenues(result.searchQuery);
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
  useEffect(() => {
    fetchVenues(searchQuery);
  }, [sortBy, filters]);

  // ─── GPS ───
  const handleGpsClick = useCallback(() => {
    if (gpsActive) {
      setGpsActive(false);
      setUserLocation(null);
      return;
    }
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setUserLocation(loc);
        setGpsActive(true);
        fetchVenues();
      },
      (err) => {
        console.warn('GPS error:', err);
        setGpsActive(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }, [gpsActive, fetchVenues]);

  // ─── Pod click → open panel with feature ───
  const handlePodClick = useCallback((podId) => {
    if (activePod === podId) {
      setActivePod(null);
      setShowPanel(false);
      return;
    }
    setActivePod(podId);
    setShowPanel(true);
  }, [activePod]);

  const handlePanelClose = useCallback(() => {
    setShowPanel(false);
    setActivePod(null);
  }, []);

  // ─── Favorite toggle ───
  const handleToggleFavorite = useCallback(async (venueId, venueData) => {
    if (!userId) return;
    if (favorites[venueId]) {
      await removeVenueFavorite(userId, venueId);
      setFavorites(prev => ({ ...prev, [venueId]: false }));
    } else {
      await addVenueFavorite(userId, venueId, venueData);
      setFavorites(prev => ({ ...prev, [venueId]: true }));
    }
  }, [userId, favorites]);

  // ─── Build panel content based on active pod ───
  const panelContent = useMemo(() => {
    if (!activePod) return null;
    const feature = POD_FEATURES[activePod];
    if (!feature) return null;

    let component = null;

    switch (activePod) {
      case 'search':
        component = (
          <div>
            {/* Sort + Filter Bar */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
              <select
                value={sortBy}
                onChange={(e) => handleSortChange(e.target.value)}
                style={{
                  background: 'rgba(110, 231, 239, 0.08)', border: '1px solid rgba(110, 231, 239, 0.2)',
                  borderRadius: 8, padding: '6px 12px', color: '#e0e8f0', fontSize: 12,
                  fontFamily: 'inherit', cursor: 'pointer', outline: 'none',
                }}
              >
                {SORT_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value} style={{ background: '#0d1a2a' }}>{opt.label}</option>
                ))}
              </select>
              <button
                onClick={() => setShowFilters(!showFilters)}
                style={{
                  background: showFilters ? 'rgba(110, 231, 239, 0.15)' : 'rgba(110, 231, 239, 0.06)',
                  border: '1px solid rgba(110, 231, 239, 0.2)', borderRadius: 8,
                  padding: '6px 14px', color: '#6ee7ef', fontSize: 12, cursor: 'pointer',
                  fontFamily: 'inherit', fontWeight: 600,
                }}
              >
                Filters {Object.keys(filters).length > 0 ? `(${Object.keys(filters).length})` : ''}
              </button>
              <span style={{ color: 'rgba(200,214,229,0.4)', fontSize: 12, marginLeft: 'auto' }}>
                {venues.length} venue{venues.length !== 1 ? 's' : ''}
              </span>
            </div>

            {/* Inline Filter Panel */}
            {showFilters && (
              <div style={{ marginBottom: 16 }}>
                <FilterPanel
                  filters={filters}
                  onFilterChange={handleFilterChange}
                  userLocation={userLocation}
                />
              </div>
            )}

            {loading && <div style={{ textAlign: 'center', padding: 20, color: 'rgba(200,214,229,0.5)' }}>Loading venues...</div>}
            <div style={{ display: 'grid', gap: 12 }}>
              {venues.map(v => (
                <VenueCard
                  key={v.id}
                  venue={v}
                  isFavorited={!!favorites[v.id]}
                  onToggleFavorite={() => handleToggleFavorite(v.id, v)}
                  userLocation={userLocation}
                />
              ))}
            </div>
            {venues.length === 0 && !loading && (
              <div style={{ textAlign: 'center', padding: 40, color: 'rgba(200,214,229,0.4)' }}>
                <p style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>No venues found</p>
                <p style={{ fontSize: 13 }}>Try searching a city or use GPS to find nearby rooms.</p>
              </div>
            )}
            {/* Load More */}
            {hasMore && venues.length > 0 && (
              <button
                onClick={loadMore}
                disabled={loading}
                style={{
                  display: 'block', width: '100%', marginTop: 16, padding: '12px 24px',
                  background: 'rgba(110, 231, 239, 0.08)', border: '1px solid rgba(110, 231, 239, 0.2)',
                  borderRadius: 12, color: '#6ee7ef', fontSize: 14, fontWeight: 600,
                  cursor: loading ? 'wait' : 'pointer', fontFamily: 'inherit',
                  transition: 'all 0.2s',
                }}
              >
                {loading ? 'Loading...' : 'Load More Venues'}
              </button>
            )}
          </div>
        );
        break;

      case 'nearme':
        component = <NearMeNowFeed userLocation={userLocation} />;
        break;

      case 'livegames':
        component = <LiveGamesFeed games={liveGames} />;
        break;

      case 'mapview':
        component = (
          <div style={{ textAlign: 'center', padding: 40, color: 'rgba(200,214,229,0.5)' }}>
            <p style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>Interactive Map</p>
            <p style={{ fontSize: 13 }}>Full map view with clustered venue markers.</p>
            <button
              onClick={() => router.push('/hub/poker-near-me?tab=map')}
              style={{
                marginTop: 16, padding: '10px 24px',
                background: 'linear-gradient(135deg, #6ee7ef, #3b82f6)',
                border: 'none', borderRadius: 10, color: '#000',
                fontSize: 14, fontWeight: 600, cursor: 'pointer'
              }}
            >
              Open Full Map
            </button>
          </div>
        );
        break;

      case 'tours':
        component = (
          <div style={{ display: 'grid', gap: 12 }}>
            {tours.map((t, i) => <TourCard key={t.tour_code || i} tour={t} />)}
            {tours.length === 0 && (
              <div style={{ textAlign: 'center', padding: 40, color: 'rgba(200,214,229,0.4)' }}>
                Loading tours...
              </div>
            )}
          </div>
        );
        break;

      case 'series':
        component = (
          <div style={{ display: 'grid', gap: 12 }}>
            {series.map((s, i) => <SeriesCard key={s.series_code || i} series={s} />)}
            {series.length === 0 && (
              <div style={{ textAlign: 'center', padding: 40, color: 'rgba(200,214,229,0.4)' }}>
                Loading series...
              </div>
            )}
          </div>
        );
        break;

      case 'daily':
        component = (
          <div style={{ display: 'grid', gap: 12 }}>
            {dailyTournaments.length === 0 && (
              <div style={{ textAlign: 'center', padding: 40, color: 'rgba(200,214,229,0.4)' }}>
                <p style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>Daily Tournaments</p>
                <p style={{ fontSize: 13 }}>Search a city or enable GPS to see today's tournaments.</p>
              </div>
            )}
          </div>
        );
        break;

      case 'calendar':
        component = <SeasonalCalendar />;
        break;

      case 'wallet':
        component = (
          <div style={{ textAlign: 'center', padding: 40, color: 'rgba(200,214,229,0.5)' }}>
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#6ee7ef" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ filter: 'drop-shadow(0 0 8px rgba(110,231,239,0.5))', }} ><polygon points="12 2 22 8.5 12 22 2 8.5" /><line x1="2" y1="8.5" x2="22" y2="8.5" /><line x1="12" y1="2" x2="8" y2="8.5" /><line x1="12" y1="2" x2="16" y2="8.5" /><line x1="8" y1="8.5" x2="12" y2="22" /><line x1="16" y1="8.5" x2="12" y2="22" /></svg>
            <p style={{ fontSize: 16, fontWeight: 600, marginTop: 12, marginBottom: 8 }}>Rewards & Points</p>
            <p style={{ fontSize: 13 }}>Track loyalty points, comps, and promotions across venues.</p>
          </div>
        );
        break;

      case 'roadtrip':
        component = <RoadTripPlanner venues={venues} userLocation={userLocation} />;
        break;

      case 'calculator':
        component = <TripCostCalculator venues={venues} userLocation={userLocation} />;
        break;

      case 'favorites':
        component = (
          <div style={{ display: 'grid', gap: 12 }}>
            {venues.filter(v => favorites[v.id]).map(v => (
              <VenueCard
                key={v.id}
                venue={v}
                isFavorited={true}
                onToggleFavorite={() => handleToggleFavorite(v.id, v)}
                userLocation={userLocation}
              />
            ))}
            {venues.filter(v => favorites[v.id]).length === 0 && (
              <div style={{ textAlign: 'center', padding: 40, color: 'rgba(200,214,229,0.4)' }}>
                <p style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>No saved venues yet</p>
                <p style={{ fontSize: 13 }}>Tap the heart on any venue to save it here.</p>
              </div>
            )}
          </div>
        );
        break;

      case 'social':
        component = <SocialLayer userId={userId} />;
        break;

      case 'alerts':
        component = <TournamentAlerts userId={userId} userLocation={userLocation} />;
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
  }, [activePod, venues, tours, series, dailyTournaments, liveGames, favorites, loading, userLocation, userId, router, handleToggleFavorite, sortBy, showFilters, filters, hasMore, page]);

  // ─── Live data for the 3D scene (drives visual behavior) ───
  const liveData = useMemo(() => ({
    venueCount: venues.length,
    liveGameCount: liveGames.length,
    tourCount: tours.length,
    seriesCount: series.length,
    dailyCount: dailyTournaments.length,
    alertCount: dailyTournaments.length + tours.length,
    savedCount: Object.keys(favorites).filter(k => favorites[k]).length,
    friendsNearby: 0,
  }), [venues.length, liveGames.length, tours.length, series.length, dailyTournaments.length, favorites]);

  return (
    <>
      <SEOHead
        title="Poker Near Me — Find Live Poker Rooms & Casinos"
        description="Discover Live Poker Rooms, Casinos, And Card Rooms Near You. Real-time Game Info, Tournament Schedules, And Interactive Maps."
        canonical="/hub/poker-near-me-lobby"
      />

      <div className="pnm-lobby-page">
        {/* Universal header */}
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 30 }}>
          <UniversalHeader pageDepth={1} onMenuClick={() => setMenuOpen(true)} />
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

        {/* Layer 1 — 3D Scene */}
        <LobbyScene
          onPodClick={handlePodClick}
          activePod={activePod}
          liveData={liveData}
        />

        {/* Layer 2 — UI Overlay */}
        <LobbyOverlay
          activePod={activePod}
          onPodSelect={handlePodClick}
          onSearch={handleSearch}
          searchQuery={searchQuery}
          onSearchChange={handleSearchChange}
          liveData={liveData}
          gpsActive={gpsActive}
          onGpsClick={handleGpsClick}
          citySuggestions={citySuggestions}
          onCitySelect={handleCitySelect}
          onVoiceClick={() => setShowVoiceSearch(true)}
        />


        {/* Layer 3 — Feature Panel (page level to escape overlay z-index stacking context) */}
        {showPanel && panelContent && (
          <>
            {/* Backdrop */}
            <div
              onClick={handlePanelClose}
              style={{
                position: 'fixed', inset: 0, zIndex: 50,
                background: 'rgba(3, 4, 8, 0.6)',
                backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)',
              }}
            />
            {/* Panel */}
            <div
              className="lobby-panel-page"
              style={{
                position: 'fixed', bottom: 0, left: 0, right: 0,
                maxHeight: '82vh', zIndex: 51,
                background: 'linear-gradient(160deg, rgba(18, 24, 40, 0.97), rgba(8, 12, 22, 0.98))',
                borderTop: '1px solid rgba(110, 231, 239, 0.15)',
                borderRadius: '20px 20px 0 0',
                boxShadow: '0 -8px 60px rgba(0, 0, 0, 0.5), 0 0 30px rgba(110, 231, 239, 0.04)',
                display: 'flex', flexDirection: 'column', overflow: 'hidden',
                animation: 'lobby-panelSlideUp 0.35s cubic-bezier(0.25, 0.46, 0.45, 0.94) forwards',
              }}
            >
              {/* Drag handle */}
              <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0 4px' }}>
                <div style={{ width: 40, height: 4, borderRadius: 2, background: 'rgba(200, 214, 229, 0.2)' }} />
              </div>
              {/* Header */}
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '8px 20px 12px',
                borderBottom: '1px solid rgba(110, 231, 239, 0.08)',
              }}>
                <h2 style={{
                  fontFamily: 'var(--font-premium-display)',
                  fontSize: 20, fontWeight: 700, margin: 0,
                  background: 'linear-gradient(90deg, #e0e8f0, #6ee7ef)',
                  WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                  backgroundClip: 'text',
                }}>{panelContent.title}</h2>
                <button
                  onClick={handlePanelClose}
                  aria-label="Close panel"
                  style={{
                    background: 'none', border: 'none',
                    color: 'rgba(200, 214, 229, 0.5)',
                    cursor: 'pointer', padding: 4, borderRadius: 8,
                  }}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
              {/* Content */}
              <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px 24px', WebkitOverflowScrolling: 'touch' }}>
                {panelContent.component}
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
              border: '1px solid rgba(110,231,239,0.15)',
              boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid rgba(110,231,239,0.08)' }}>
                <span style={{ color: '#6ee7ef', fontSize: 16, fontWeight: 600 }}>Voice Search</span>
                <button onClick={() => setShowVoiceSearch(false)} style={{ background: 'none', border: 'none', color: 'rgba(200,214,229,0.5)', cursor: 'pointer', fontSize: 20 }}>&times;</button>
              </div>
              <div style={{ padding: 20 }}>
                <VoiceSearch onResult={handleVoiceResult} />
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
              border: '1px solid rgba(110,231,239,0.15)',
              boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid rgba(110,231,239,0.08)' }}>
                <span style={{ color: '#6ee7ef', fontSize: 16, fontWeight: 600 }}>Reviews — {selectedVenueForReview.name}</span>
                <button onClick={() => setSelectedVenueForReview(null)} style={{ background: 'none', border: 'none', color: 'rgba(200,214,229,0.5)', cursor: 'pointer', fontSize: 20 }}>&times;</button>
              </div>
              <div style={{ padding: 20 }}>
                <VenueReviews venueId={selectedVenueForReview.id} userId={userId} />
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
