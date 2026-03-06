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

// Dynamic imports — scene (client-only, no SSR)
// Uses .catch() pattern matching the working WorldHub import in pages/hub/index.js
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
  { ssr: false,
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

// ─── Constants ───
const SEARCH_DEBOUNCE_MS = 400;
const API_CACHE_TTL = 60000;
const LIVE_REFRESH_MS = 120000;
const PAGE_SIZE = 24;

// API cache
const apiCache = {};
function cachedFetch(url, ttl = API_CACHE_TTL) {
  const now = Date.now();
  if (apiCache[url] && (now - apiCache[url].time) < ttl) {
    return Promise.resolve(apiCache[url].data);
  }
  teturn fetch(url).then(r => r.json()).then(data => {
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

// ─── Pod ↑ Feature mapping ───
const POD_FEATURES = {
  search:    { title: 'Search Venues',   tab: 'venues' },
  nearme:    { title: 'Near Me',          tab: 'nearnow' },
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
};

export default function PokerNearMeLobby() {
  const router = useRouter();
  const { avatarUrl, userId } = useAvatar?.() || {};

  // ─── Core State ───
  const [activePod, setActivePod] = useState(null);
  const [showPanel, setShowPanel] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);

  // ─── Data State ───
  const [venues, setVenues] = useState([]);
  const [tours, setTours] = useState([]);
  const [series, setSeries] = useState([]);
  const [dailyTournaments, setDailyTournaments] = useState([]);
  const [liveGames, setLiveGames] = useState([]);
  const [favorites, setFavorites] = useState({});
  const [loading, setLoading] = useState(false);

  // ─── Location State ───
  const [userLocation, setUserLocation] = useState(null);
  const [gpsActive, setGpsActive] = useState(false);

  // ─── Menu config ───
  const menuConfig = useMemo(() => getMenuConfig('poker-near-me'), []);

  // ─── Fetch venues ───
  const fetchVenues = useCallback(async (query = '') => {
    setLoading(true);
    try {
      let url = `/api/poker/venues?limit=${PAGE_SIZE}`;
      if (query) url += `&search=${encodeURIComponent(query)}`;
      if (userLocation) {
        url += `&lat=${userLocation.lat}&lng=${userLocation.lng}&radius=100`;
      }
      const data = await cachedFetch(url);
      if (data?.venues) setVenues(data.venues);
      else if (Array.isArray(data)) setVenues(data);
    } catch (err) {
      console.error('Failed to fetch venues:', err);
    } finally {
      setLoading(false);
    }
  }, [userLocation]);

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

  // ─── Initial data load ───
  useEffect(() => {
    fetchVenues();
    fetchTours();
    fetchFavorites();
  }, [fetchVenues, fetchTours, fetchFavorites]);

  // ─── Live games refresh ───
  useEffect(() => {
    const interval = setInterval(() => {
      cachedFetch('/api/public/live-games/nearby', 30000)
        .then(data => { if (data?.games) setLiveGames(data.games); })
        .catch(() => {});
    }, LIVE_REFRESH_MS);
    return () => clearInterval(interval);
  }, []);

  // ─── Search handler ───
  const searchTimeoutRef = useRef(null);
  const handleSearchChange = useCallback((value) => {
    setSearchQuery(value);
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = setTimeout(() => {
      if (value.length >= 2) {
        fetchVenues(value);
        if (userId) addSearchHistoryToDb(userId, value).catch(() => {});
      }
    }, SEARCH_DEBOUNCE_MS);
  }, [fetchVenues, userId]);

  const handleSearch = useCallback((query) => {
    if (query) fetchVenues(query);
  }, [fetchVenues]);

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
      // Toggle off
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
            {loading && <div style={{ textAlign: 'center', padding: 20, color: 'rgba(200,214,229,0.5)' }}>Loading venues...</div>}
            <div style={{ display: 'grid', gap: 12 }}>
              {venues.map(v => (
                <VenueCard
                  key={v.id}
                  venue={v}
                  isFavorited={!!favorites[v.id]}
                  onToggleFavorite={() => handleToggleFavorite(v.id, v)}
                />
              ))}
            </div>
            {venues.length === 0 && !loading && (
              <div style={{ textAlign: 'center', padding: 40, color: 'rgba(200,214,229,0.4)' }}>
                <p style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>No venues found</p>
                <p style={{ fontSize: 13 }}>Try searching a city or use GPS to find nearby rooms.</p>
              </div>
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
            <p style={{ fontSize: 13 }}>Full map view with clustered venue markers. Coming soon to the lobby view.</p>
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
            <span style={{ fontSize: 48 }}>💎</span>
            <p style={{ fontSize: 16, fontWeight: 600, marginTop: 12, marginBottom: 8 }}>Rewards & Points</p>
            <p style={{ fontSize: 13 }}>Track loyalty points, comps, and promotions across venues.</p>
          </div>
        );
        break;

      case 'roadtrip':
        component = <RoadTripPlanner venues={venues} userLocation={userLocation} />;
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
  }, [activePod, venues, tours, series, dailyTournaments, liveGames, favorites, loading, userLocation, userId, router, handleToggleFavorite]);

  // ─── Live data for the 3D scene (drives visual behavior ───
  const liveData = useMemo(() => ({
    venueCount: venues.length,
    liveGameCount: liveGames.length,
    alertCount: 0, // TODO: wire to real alerts
    savedCount: Object.keys(favorites).filter(k => favorites[k]).length,
    friendsNearby: 0, // TODO: wire to real friends
  }), [venues.length, liveGames.length, favorites]);

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
          onPanelClose={handlePanelClose}
          panelContent={panelContent}
          searchQuery={searchQuery}
          onSearchChange={handleSearchChange}
          liveData={liveData}
          gpsActive={gpsActive}
          onGpsClick={handleGpsClick}
          showPanel={showPanel}
         />
      </div>
    </>
  );
}
