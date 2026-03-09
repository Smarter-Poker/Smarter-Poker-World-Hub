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
import { getVenueFavorites, addVenueFavorite, removeVenueFavorite } from '../../src/services/pokerNearMeFavorites';
import { addSearchHistory as addSearchHistoryToDb, getSearchHistory } from '../../src/services/pokerNearMeSearchHistory';
import { getPokerNearMePreferences } from '../../src/services/pokerNearMePreferences';
import useTrainingBus from '../../src/hooks/useTrainingBus';

// Dynamic imports — Canvas lobby (client-only, no SSR)
const LobbyCanvas = dynamic(
  () => import('../../src/components/poker-near-me/lobby/LobbyCanvas').catch(err => {
    console.error('[PokerNearMeLobby] LobbyCanvas module failed to load:', err);
    return {
      default: () => (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0a0a0f', color: '#00d4ff', fontFamily: 'Orbitron, sans-serif', fontSize: 16, flexDirection: 'column', gap: 12 }}>
          <div>Lobby — Reloading...</div>
          <button onClick={() => window.location.reload()} style={{ background: '#1877f2', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 24px', cursor: 'pointer' }}>Refresh</button>
        </div>
      )
    };
  }),
  {
    ssr: false,
    loading: () => (
      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0a0a0f', color: '#6ee7ef', fontFamily: 'Orbitron, sans-serif', fontSize: 16 }}>
        Loading Lobby...
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
  return fetch(url).then(r => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  }).then(data => {
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
  search: { title: 'Search Venues', tab: 'venues' },
  nearme: { title: 'Near Me', tab: 'nearnow' },
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
};

// ─── Daily Tournaments Panel with day-of-week tabs ───
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const TODAY_INDEX = new Date().getDay();

function DailyTournamentsPanel({ tournaments = [], onDayChange }) {
  const [selectedDay, setSelectedDay] = useState(DAYS[TODAY_INDEX]);

  const handleDayChange = (day) => {
    setSelectedDay(day);
    onDayChange?.(day);
  };

  // Filter tournaments by selected day (client-side fallback)
  const filtered = tournaments.filter(t => {
    if (!t.day_of_week) return false; // exclude tournaments with no day assigned
    return t.day_of_week.toLowerCase() === selectedDay.toLowerCase();
  });

  return (
    <div>
      {/* Day-of-week tabs */}
      <div style={{
        display: 'flex', gap: 4, marginBottom: 16, overflowX: 'auto',
        paddingBottom: 4, scrollbarWidth: 'none', msOverflowStyle: 'none',
      }}>
        {DAYS.map((day) => (
          <button
            key={day}
            onClick={() => handleDayChange(day)}
            style={{
              flexShrink: 0, padding: '6px 12px', borderRadius: 8,
              border: selectedDay === day ? '1px solid rgba(34,197,94,0.6)' : '1px solid rgba(110,231,239,0.15)',
              background: selectedDay === day ? 'rgba(34,197,94,0.15)' : 'rgba(110,231,239,0.04)',
              color: selectedDay === day ? '#22c55e' : 'rgba(200,214,229,0.6)',
              fontSize: 11, fontWeight: 600, cursor: 'pointer',
              fontFamily: 'inherit', textTransform: 'uppercase', letterSpacing: '0.05em',
              transition: 'all 0.2s',
            }}
          >
            {day === DAYS[TODAY_INDEX] ? 'Today' : day.slice(0, 3)}
          </button>
        ))}
      </div>

      {/* Tournament cards */}
      <div style={{ display: 'grid', gap: 10 }}>
        {filtered.map((t, i) => (
          <div key={t.id || i} style={{
            background: 'rgba(110,231,239,0.04)', border: '1px solid rgba(110,231,239,0.1)',
            borderRadius: 12, padding: '12px 16px',
            transition: 'border-color 0.2s',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#e0e8f0', marginBottom: 2 }}>
                  {t.tournament_name || t.name || `${t.game_type || 'NLH'} Tournament`}
                </div>
                <div style={{ fontSize: 12, color: 'rgba(200,214,229,0.55)' }}>
                  {t.venue_name || 'Unknown Venue'}
                </div>
              </div>
              <div style={{
                fontSize: 13, fontWeight: 700, color: '#22c55e',
                background: 'rgba(34,197,94,0.1)', padding: '3px 10px', borderRadius: 6,
                whiteSpace: 'nowrap',
              }}>
                {t.buy_in ? `$${t.buy_in}` : 'TBD'}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', fontSize: 11, color: 'rgba(200,214,229,0.45)' }}>
              {t.start_time && <span>{t.start_time}</span>}
              {t.game_type && <span style={{ color: '#6ee7ef' }}>{t.game_type}</span>}
              {t.guaranteed && <span style={{ color: '#f59e0b' }}>GTD: ${typeof t.guaranteed === 'number' ? t.guaranteed.toLocaleString() : t.guaranteed}</span>}
              {t.starting_stack && <span>Stack: {t.starting_stack.toLocaleString?.() || t.starting_stack}</span>}
              {t.blind_levels && <span>Blinds: {t.blind_levels}</span>}
              {t.rebuy_addon && <span>{t.rebuy_addon}</span>}
            </div>
          </div>
        ))}
      </div>

      {filtered.length === 0 && (
        <div style={{ textAlign: 'center', padding: 40, color: 'rgba(200,214,229,0.4)' }}>
          <p style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>No tournaments found for {selectedDay}</p>
          <p style={{ fontSize: 13 }}>Try another day or enable GPS to see tournaments near you.</p>
        </div>
      )}
    </div>
  );
}

// ─── Venue Map Panel (inline Leaflet map) ───
function VenueMapPanel({ venues = [], userLocation, onVenueSelect }) {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const mountedRef = useRef(true);
  const [mapReady, setMapReady] = useState(false);

  useEffect(() => {
    mountedRef.current = true;

    if (mapInstanceRef.current) return; // Already initialized
    if (!mapRef.current) return;

    // Dynamically load Leaflet CSS + JS
    const loadLeaflet = async () => {
      // Add CSS if not already loaded
      if (!document.querySelector('link[href*="leaflet"]')) {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
        document.head.appendChild(link);
      }

      // Import Leaflet
      const L = (await import('leaflet')).default;

      // Guard: component may have unmounted during async import
      if (!mountedRef.current || !mapRef.current) return;

      const center = userLocation
        ? [userLocation.lat, userLocation.lng]
        : [36.1699, -115.1398]; // Default: Las Vegas

      const map = L.map(mapRef.current, {
        center,
        zoom: userLocation ? 10 : 5,
        zoomControl: true,
        attributionControl: false,
      });

      // Dark tile layer
      L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        maxZoom: 19,
      }).addTo(map);

      mapInstanceRef.current = map;

      // Add venue markers — popup only (no auto-navigate on click)
      const validVenues = venues.filter(v => v.latitude && v.longitude);
      validVenues.forEach(v => {
        const safeName = (v.name || '').replace(/'/g, '&#39;').replace(/"/g, '&quot;');
        const marker = L.circleMarker([v.latitude, v.longitude], {
          radius: 7,
          fillColor: v.is_featured ? '#ffd700' : '#6ee7ef',
          fillOpacity: 0.85,
          color: 'rgba(110,231,239,0.4)',
          weight: 1,
        }).addTo(map);

        marker.bindPopup(
          `<div style="font-family:sans-serif;font-size:13px;min-width:160px;">
            <strong>${safeName}</strong><br/>
            <span style="color:#666;">${v.city || ''}, ${v.state || ''}</span>
            ${Array.isArray(v.games_offered) && v.games_offered.length ? `<br/><span style="color:#3b82f6;">${v.games_offered.slice(0, 3).join(', ')}</span>` : ''}
            <br/><a href="/hub/venues/${v.id}" style="color:#6ee7ef;font-size:12px;text-decoration:underline;margin-top:4px;display:inline-block;">View Details</a>
          </div>`,
          { className: 'pnm-popup' }
        );
      });

      // Add user location marker
      if (userLocation) {
        L.circleMarker([userLocation.lat, userLocation.lng], {
          radius: 10, fillColor: '#22c55e', fillOpacity: 0.9,
          color: '#fff', weight: 2,
        }).addTo(map).bindPopup('You are here');
      }

      // Fit bounds to show all markers
      if (validVenues.length > 1) {
        const bounds = L.latLngBounds(validVenues.map(v => [v.latitude, v.longitude]));
        if (userLocation) bounds.extend([userLocation.lat, userLocation.lng]);
        map.fitBounds(bounds, { padding: [30, 30], maxZoom: 12 });
      }

      setMapReady(true);
    };

    loadLeaflet().catch(err => console.error('Failed to load map:', err));

    return () => {
      mountedRef.current = false;
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div style={{ position: 'relative' }}>
      <div
        ref={mapRef}
        style={{
          width: '100%', height: 400, borderRadius: 12, overflow: 'hidden',
          border: '1px solid rgba(110,231,239,0.15)',
          background: '#0a1628',
        }}
      />
      {!mapReady && (
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', alignItems: 'center',
          justifyContent: 'center', color: 'rgba(200,214,229,0.5)',
          fontSize: 14, borderRadius: 12,
        }}>
          Loading map...
        </div>
      )}
      <div style={{
        marginTop: 8, fontSize: 12, color: 'rgba(200,214,229,0.4)',
        textAlign: 'center',
      }}>
        {venues.filter(v => v.latitude && v.longitude).length} venues on map
        {userLocation && ' • GPS active'}
      </div>
    </div>
  );
}

export default function PokerNearMeLobby() {
  const router = useRouter();
  const { user } = useAvatar();
  const userId = user?.id;

  // 🚌 Bus — emit SESSION_START on mount, SESSION_END on unmount
  useTrainingBus('poker-near-me-lobby');

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
  const [gpsError, setGpsError] = useState(null);
  const [searchHistory, setSearchHistory] = useState([]);
  const [preferences, setPreferences] = useState({ geofenceAlerts: true, locationEnabled: true, showNewcomerFriendly: true });

  // ─── Data State ───
  const [venues, setVenues] = useState([]);
  const [tours, setTours] = useState([]);
  const [series, setSeries] = useState([]);
  const [dailyTournaments, setDailyTournaments] = useState([]);
  const [liveGames, setLiveGames] = useState([]);
  const [favorites, setFavorites] = useState({});
  const [favoritedVenues, setFavoritedVenues] = useState([]);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [page, setPage] = useState(0);

  // ─── Location State ───
  const [userLocation, setUserLocation] = useState(null);
  const [gpsActive, setGpsActive] = useState(false);

  // ─── Menu config ───
  const menuConfig = useMemo(() => getMenuConfig('poker-near-me'), []);

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
      const deepUrl = `/api/poker/venues?limit=${PAGE_SIZE}&offset=0&search=${encodeURIComponent(q)}&sort=trust`;
      cachedFetch(deepUrl).then(data => {
        const newVenues = data?.data || data?.venues || (Array.isArray(data) ? data : []);
        setVenues(newVenues);
        setHasMore(newVenues.length >= PAGE_SIZE);
        setPage(0);
      }).catch(err => console.error('Deep-link venue fetch failed:', err));
    }

    if (pod && POD_FEATURES[pod]) {
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
      if (data?.data) setTours(data.data);
      else if (data?.tours) setTours(data.tours);
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

  // ─── Fetch series ───
  const fetchSeries = useCallback(async () => {
    try {
      const data = await cachedFetch('/api/poker/venues?type=series');
      if (data?.data) setSeries(data.data);
      else if (data?.series) setSeries(data.series);
      else if (Array.isArray(data)) setSeries(data);
    } catch (err) {
      console.error('Failed to fetch series:', err);
    }
  }, []);

  // ─── Fetch daily tournaments ───
  const fetchDaily = useCallback(async (dayFilter = '') => {
    try {
      let url = '/api/poker/daily-tournaments?limit=200';
      if (dayFilter) url += `&day=${encodeURIComponent(dayFilter)}`;
      if (userLocation) url += `&lat=${userLocation.lat}&lng=${userLocation.lng}&radius=100`;
      const data = await cachedFetch(url);
      if (data?.data) setDailyTournaments(data.data);
      else if (data?.tournaments) setDailyTournaments(data.tournaments);
      else if (Array.isArray(data)) setDailyTournaments(data);
    } catch (err) {
      console.error('Failed to fetch daily tournaments:', err);
    }
  }, [userLocation]);

  // ─── Fetch live games ───
  const fetchLiveGames = useCallback(async () => {
    try {
      const data = await cachedFetch('/api/public/live-games/nearby', 30000);
      if (data?.data) setLiveGames(data.data);
      else if (data?.games) setLiveGames(data.games);
    } catch (err) {
      console.error('Failed to fetch live games:', err);
    }
  }, []);

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
    if (!userId) return;
    try {
      const prefs = await getPokerNearMePreferences(userId);
      setPreferences(prefs);
    } catch (err) {
      console.error('Failed to fetch preferences:', err);
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
    fetchLiveGames();
    fetchFavorites();
    fetchSearchHistory();
    fetchPreferences();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Live games refresh ───
  const fetchLiveGamesRef = useRef(fetchLiveGames);
  fetchLiveGamesRef.current = fetchLiveGames;
  useEffect(() => {
    const interval = setInterval(() => {
      fetchLiveGamesRef.current();
    }, LIVE_REFRESH_MS);
    return () => clearInterval(interval);
  }, []);

  // ─── Search handler ───
  const searchTimeoutRef = useRef(null);
  useEffect(() => {
    return () => {
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    };
  }, []);

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
        if (userId) {
          addSearchHistoryToDb(userId, value).catch(() => { });
          // Optimistically update local search history
          setSearchHistory(prev => {
            const filtered = prev.filter(h => h.search_query !== value);
            return [{ id: `local-${Date.now()}`, search_query: value, searched_at: new Date().toISOString() }, ...filtered].slice(0, 10);
          });
        }
      }
    }, SEARCH_DEBOUNCE_MS);
  }, [fetchVenues, userId]);

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
    fetchVenues(searchQuery);
  }, [sortBy, filters, fetchVenues, searchQuery]);

  // ─── Cross-page favorites sync ───
  useEffect(() => {
    const handleFavoritesChanged = (e) => {
      const { venueId, favorited } = e.detail || {};
      if (venueId) {
        setFavorites(prev => ({ ...prev, [venueId]: favorited }));
      }
    };
    window.addEventListener('pnm:favorites-changed', handleFavoritesChanged);
    return () => window.removeEventListener('pnm:favorites-changed', handleFavoritesChanged);
  }, []);

  // ─── GPS ───
  const gpsErrorTimeoutRef = useRef(null);
  const handleGpsClick = useCallback(() => {
    // Clear any pending error timeout from a previous click
    if (gpsErrorTimeoutRef.current) clearTimeout(gpsErrorTimeoutRef.current);

    if (gpsActive) {
      setGpsActive(false);
      setUserLocation(null);
      return;
    }
    if (!navigator.geolocation) {
      setGpsError('GPS not supported on this device');
      gpsErrorTimeoutRef.current = setTimeout(() => setGpsError(null), 3500);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setUserLocation(loc);
        setGpsActive(true);
        // Fetch venues with explicit lat/lng to avoid stale closure on userLocation
        const gpsUrl = `/api/poker/venues?limit=${PAGE_SIZE}&offset=0&lat=${loc.lat}&lng=${loc.lng}&radius=100${sortBy ? `&sort=${sortBy}` : ''}`;
        cachedFetch(gpsUrl).then(data => {
          const newVenues = data?.data || data?.venues || (Array.isArray(data) ? data : []);
          setVenues(newVenues);
          setHasMore(newVenues.length >= PAGE_SIZE);
          setPage(0);
        }).catch(err => console.error('GPS venue fetch failed:', err));
        // Auto-open the Near Me panel to show nearby venues
        setActivePod('nearme');
        setShowPanel(true);
      },
      (err) => {
        setGpsActive(false);
        setGpsError(err.code === 1 ? 'Location access denied' : 'Could not get location');
        gpsErrorTimeoutRef.current = setTimeout(() => setGpsError(null), 3500);
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
    const wasFavorited = !!favorites[venueId];
    // Optimistic update — both maps
    setFavorites(prev => ({ ...prev, [venueId]: !wasFavorited }));
    const venueEntry = { id: venueId, name: venueData?.name || 'Unknown', address: venueData?.address || '', city: venueData?.city || '', state: venueData?.state || '', _fromFavorites: true };
    if (wasFavorited) {
      setFavoritedVenues(prev => prev.filter(f => f.id !== venueId));
    } else {
      setFavoritedVenues(prev => [...prev, venueEntry]);
    }
    try {
      if (wasFavorited) {
        await removeVenueFavorite(userId, venueId);
      } else {
        await addVenueFavorite(userId, venueId, venueData);
      }
      // Emit event for cross-page sync after successful DB write
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('pnm:favorites-changed', { detail: { venueId, favorited: !wasFavorited } }));
      }
    } catch (err) {
      console.error('Failed to toggle favorite:', err);
      // Full rollback on error — both state maps
      setFavorites(prev => ({ ...prev, [venueId]: wasFavorited }));
      if (wasFavorited) {
        setFavoritedVenues(prev => [...prev, venueEntry]);
      } else {
        setFavoritedVenues(prev => prev.filter(f => f.id !== venueId));
      }
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
                  onFavorite={(e) => { e?.stopPropagation(); handleToggleFavorite(v.id, v); }}
                  onNavigate={(url) => {
                    if (url.includes('action=review')) {
                      setSelectedVenueForReview({ id: v.id, name: v.name });
                    } else {
                      router.push(url);
                    }
                  }}
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
        component = <NearMeNowFeed userLocation={userLocation} venues={venues} />;
        break;

      case 'livegames':
        component = <LiveGamesFeed games={liveGames} />;
        break;

      case 'mapview':
        component = <VenueMapPanel venues={venues} userLocation={userLocation} onVenueSelect={(v) => { setSelectedVenueForReview(null); router.push(`/hub/venues/${v.id}`); }} />;
        break;

      case 'tours':
        component = (
          <div style={{ display: 'grid', gap: 12 }}>
            {tours.map((t, i) => <TourCard key={t.tour_code || t.id || `tour-${i}`} tour={t} />)}
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
            {series.map((s, i) => <SeriesCard key={s.series_code || s.id || `series-${i}`} series={s} />)}
            {series.length === 0 && (
              <div style={{ textAlign: 'center', padding: 40, color: 'rgba(200,214,229,0.4)' }}>
                Loading series...
              </div>
            )}
          </div>
        );
        break;

      case 'daily':
        component = <DailyTournamentsPanel tournaments={dailyTournaments} onDayChange={fetchDaily} />;
        break;

      case 'calendar':
        component = <SeasonalCalendar />;
        break;

      case 'roadtrip':
        component = <RoadTripPlanner venues={venues} userLocation={userLocation} />;
        break;

      case 'favorites': {
        // Merge: show full venue data if in current search, fallback to favorites data
        const favVenues = Object.keys(favorites).filter(k => favorites[k]).map(venueId => {
          const fromSearch = venues.find(v => v.id === venueId);
          if (fromSearch) return fromSearch;
          return favoritedVenues.find(f => f.id === venueId);
        }).filter(Boolean);

        component = (
          <div style={{ display: 'grid', gap: 12 }}>
            {favVenues.map(v => (
              <VenueCard
                key={v.id}
                venue={v}
                isFavorited={true}
                onFavorite={(e) => { e?.stopPropagation(); handleToggleFavorite(v.id, v); }}
                onNavigate={(url) => {
                  if (url.includes('action=review')) {
                    setSelectedVenueForReview({ id: v.id, name: v.name });
                  } else {
                    router.push(url);
                  }
                }}
                userLocation={userLocation}
              />
            ))}
            {favVenues.length === 0 && (
              <div style={{ textAlign: 'center', padding: 40, color: 'rgba(200,214,229,0.4)' }}>
                <p style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>No saved venues yet</p>
                <p style={{ fontSize: 13 }}>Tap the heart on any venue to save it here.</p>
              </div>
            )}
          </div>
        );
        break;
      }

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
  }, [activePod, venues, tours, series, dailyTournaments, liveGames, favorites, loading, userLocation, userId, router, handleToggleFavorite, sortBy, showFilters, filters, hasMore, page, fetchDaily, loadMore, handleSortChange, handleFilterChange, favoritedVenues]);

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

        {/* Layer 1 — Canvas Background (galaxy + radar effects) */}
        <LobbyCanvas />

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
          gpsError={gpsError}
          searchHistory={searchHistory}
          onHistorySelect={handleCitySelect}
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
