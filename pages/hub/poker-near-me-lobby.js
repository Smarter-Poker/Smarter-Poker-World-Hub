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
import { addSearchHistory as addSearchHistoryToDb, getSearchHistory } from '../../src/services/pokerNearMeSearchHistory';
import { getPokerNearMePreferences, updatePokerNearMePreferences } from '../../src/services/pokerNearMePreferences';
import { supabase } from '../../src/lib/supabase';
import useTrainingBus from '../../src/hooks/useTrainingBus';
import { eventBus, EventType } from '../../src/engine/EventBus';
// BottomNavBar removed — Poker Near Me has its own navigation grid

// ─── Sound Utilities (Web Audio API — zero-latency, no external assets) ───
let _audioCtx = null;
function getAudioCtx() {
  if (!_audioCtx && typeof AudioContext !== 'undefined') {
    _audioCtx = new AudioContext();
  }
  return _audioCtx;
}
function playClickSound() {
  try {
    const ctx = getAudioCtx();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(800, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(600, ctx.currentTime + 0.05);
    gain.gain.setValueAtTime(0.12, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.06);
    osc.connect(gain).connect(ctx.destination);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.06);
  } catch { /* silent */ }
}
function playPanelOpenSound() {
  try {
    const ctx = getAudioCtx();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(400, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(900, ctx.currentTime + 0.12);
    gain.gain.setValueAtTime(0.08, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
    osc.connect(gain).connect(ctx.destination);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.15);
  } catch { /* silent */ }
}
function playPanelCloseSound() {
  try {
    const ctx = getAudioCtx();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(700, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(300, ctx.currentTime + 0.1);
    gain.gain.setValueAtTime(0.08, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
    osc.connect(gain).connect(ctx.destination);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.12);
  } catch { /* silent */ }
}

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
const VenueMapPanel = dynamic(() => import('../../src/components/poker-near-me/VenueMapPanel'), { ssr: false });

// ─── Constants ───
const SEARCH_DEBOUNCE_MS = 400;
const API_CACHE_TTL = 60000;
const LIVE_REFRESH_MS = 120000;
const PAGE_SIZE = 50;

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

// API cache with TTL expiry to prevent memory leaks
const apiCache = {};
const API_CACHE_MAX_ENTRIES = 50;
function cachedFetch(url, ttl = API_CACHE_TTL) {
  const now = Date.now();
  if (apiCache[url] && (now - apiCache[url].time) < ttl) {
    return Promise.resolve(apiCache[url].data);
  }
  // Evict stale entries to prevent unbounded growth
  const keys = Object.keys(apiCache);
  if (keys.length > API_CACHE_MAX_ENTRIES) {
    keys.sort((a, b) => apiCache[a].time - apiCache[b].time);
    keys.slice(0, keys.length - API_CACHE_MAX_ENTRIES + 10).forEach(k => delete apiCache[k]);
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
};

// ─── Daily Tournaments Panel with day-of-week tabs ───
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const TODAY_INDEX = new Date().getDay();

function DailyTournamentsPanel({ tournaments = [], onDayChange, onFiltersChange }) {
  const [selectedDay, setSelectedDay] = useState(DAYS[TODAY_INDEX]);
  const [gameType, setGameType] = useState('all');
  const [sortBy, setSortBy] = useState('time');
  const [minBuyin, setMinBuyin] = useState('');
  const [maxBuyin, setMaxBuyin] = useState('');
  const [minGuaranteed, setMinGuaranteed] = useState('');
  const [groupByState, setGroupByState] = useState(false);

  const handleDayChange = (day) => {
    setSelectedDay(day);
    onDayChange?.(day);
  };

  // Client-side filters
  let filtered = tournaments.filter(t => {
    if (!t.day_of_week) return false;
    if (t.day_of_week.toLowerCase() !== selectedDay.toLowerCase() && t.day_of_week !== 'Daily') return false;
    if (gameType !== 'all' && t.game_type && !t.game_type.toLowerCase().includes(gameType.toLowerCase())) return false;
    if (minBuyin && t.buy_in < parseInt(minBuyin, 10)) return false;
    if (maxBuyin && t.buy_in > parseInt(maxBuyin, 10)) return false;
    if (minGuaranteed && (t.guaranteed || 0) < parseInt(minGuaranteed, 10)) return false;
    return true;
  });

  // Sort
  if (sortBy === 'buyin') filtered.sort((a, b) => (a.buy_in || 0) - (b.buy_in || 0));
  else if (sortBy === 'guaranteed') filtered.sort((a, b) => (b.guaranteed || 0) - (a.guaranteed || 0));
  else {
    // Sort by time (parse HH:MM am/pm)
    const parseT = (s) => { if (!s) return 9999; const m = s.match(/(\d+):(\d+)\s*(am|pm)/i); if (!m) return 9999; let h = parseInt(m[1]); if (m[3].toLowerCase() === 'pm' && h !== 12) h += 12; if (m[3].toLowerCase() === 'am' && h === 12) h = 0; return h * 60 + parseInt(m[2]); };
    filtered.sort((a, b) => parseT(a.start_time) - parseT(b.start_time));
  }

  // State grouping
  const groupedByState = groupByState ? filtered.reduce((acc, t) => {
    const st = t.venue_state || t.state || 'Unknown';
    if (!acc[st]) acc[st] = [];
    acc[st].push(t);
    return acc;
  }, {}) : null;

  const GAME_TYPES = ['all', 'NLH', 'PLO', 'Mixed', 'Omaha'];
  const SORT_OPTS = [{ v: 'time', l: 'Start Time' }, { v: 'buyin', l: 'Buy-In' }, { v: 'guaranteed', l: 'Guaranteed' }];

  const renderTournamentCard = (t, i) => (
    <div key={t.id || i} style={{
      background: 'rgba(13,17,23,0.7)', border: '1px solid rgba(88,166,255,0.2)',
      borderRadius: 12, padding: '12px 16px', transition: 'border-color 0.2s', boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.2)'
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#e0e8f0', marginBottom: 2 }}>
            {t.tournament_name || t.name || `${t.game_type || 'NLH'} Tournament`}
          </div>
          <div style={{ fontSize: 12, color: 'rgba(200,214,229,0.55)' }}>
            {t.venue_name || 'Unknown Venue'}{t.venue_state ? `, ${t.venue_state}` : ''}
          </div>
        </div>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#22c55e', background: 'rgba(34,197,94,0.1)', padding: '3px 10px', borderRadius: 6, whiteSpace: 'nowrap' }}>
          {t.buy_in ? `$${t.buy_in}` : 'TBD'}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', fontSize: 11, color: 'rgba(200,214,229,0.45)' }}>
        {t.start_time && <span>{t.start_time}</span>}
        {t.game_type && <span style={{ color: '#58a6ff' }}>{t.game_type}</span>}
        {t.guaranteed && <span style={{ color: '#f59e0b' }}>GTD: ${typeof t.guaranteed === 'number' ? t.guaranteed.toLocaleString() : t.guaranteed}</span>}
        {t.starting_stack && <span>Stack: {t.starting_stack.toLocaleString?.() || t.starting_stack}</span>}
        {t.blind_levels && <span>Blinds: {t.blind_levels}</span>}
        {t.rebuy_addon && <span>{t.rebuy_addon}</span>}
      </div>
    </div>
  );

  return (
    <div>
      {/* Day-of-week tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 12, overflowX: 'auto', paddingBottom: 4, scrollbarWidth: 'none' }}>
        {DAYS.map((day) => (
          <button key={day} onClick={() => handleDayChange(day)}
            style={{
              flexShrink: 0, padding: '6px 12px', borderRadius: 8,
              border: selectedDay === day ? '1px solid rgba(88,166,255,0.6)' : '1px solid rgba(88,166,255,0.2)',
              background: selectedDay === day ? 'rgba(88,166,255,0.15)' : 'rgba(13,17,23,0.7)',
              color: selectedDay === day ? '#58a6ff' : 'rgba(200,214,229,0.6)',
              fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
              textTransform: 'uppercase', letterSpacing: '0.05em', transition: 'all 0.2s', boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.2)'
            }}
          >
            {day === DAYS[TODAY_INDEX] ? 'Today' : day.slice(0, 3)}
          </button>
        ))}
      </div>

      {/* Filter Row: Game Type + Sort + Buy-In + Guaranteed */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        {/* Game Type chips */}
        {GAME_TYPES.map(gt => (
          <button key={gt} onClick={() => setGameType(gt)}
            style={{
              padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer',
              border: gameType === gt ? '1px solid rgba(88,166,255,0.5)' : '1px solid rgba(88,166,255,0.2)',
              background: gameType === gt ? 'rgba(88,166,255,0.15)' : 'rgba(13,17,23,0.7)',
              color: gameType === gt ? '#58a6ff' : 'rgba(200,214,229,0.5)', fontFamily: 'inherit',
              transition: 'all 0.2s', boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.2)'
            }}
          >{gt === 'all' ? 'All Games' : gt}</button>
        ))}
      </div>

      {/* Advanced Filters Row */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <input type="number" placeholder="Min $" value={minBuyin} onChange={e => setMinBuyin(e.target.value)}
          style={{ width: 70, padding: '5px 8px', borderRadius: 6, border: '1px solid rgba(88,166,255,0.2)', background: 'rgba(13,17,23,0.7)', color: '#e0e8f0', fontSize: 12, fontFamily: 'inherit', outline: 'none', boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.2)' }} />
        <span style={{ color: 'rgba(200,214,229,0.3)', fontSize: 11 }}>to</span>
        <input type="number" placeholder="Max $" value={maxBuyin} onChange={e => setMaxBuyin(e.target.value)}
          style={{ width: 70, padding: '5px 8px', borderRadius: 6, border: '1px solid rgba(88,166,255,0.2)', background: 'rgba(13,17,23,0.7)', color: '#e0e8f0', fontSize: 12, fontFamily: 'inherit', outline: 'none', boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.2)' }} />
        <input type="number" placeholder="Min GTD" value={minGuaranteed} onChange={e => setMinGuaranteed(e.target.value)}
          style={{ width: 85, padding: '5px 8px', borderRadius: 6, border: '1px solid rgba(88,166,255,0.2)', background: 'rgba(13,17,23,0.7)', color: '#e0e8f0', fontSize: 12, fontFamily: 'inherit', outline: 'none', boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.2)' }} />
        <select value={sortBy} onChange={e => setSortBy(e.target.value)}
          style={{ padding: '5px 8px', borderRadius: 6, border: '1px solid rgba(88,166,255,0.2)', background: 'rgba(13,17,23,0.7)', color: '#e0e8f0', fontSize: 12, fontFamily: 'inherit', cursor: 'pointer', outline: 'none', boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.2)' }}>
          {SORT_OPTS.map(o => <option key={o.v} value={o.v} style={{ background: '#0d1117' }}>{o.l}</option>)}
        </select>
        <button onClick={() => setGroupByState(!groupByState)}
          style={{
            padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer',
            border: groupByState ? '1px solid rgba(212,168,83,0.5)' : '1px solid rgba(88,166,255,0.2)',
            background: groupByState ? 'rgba(212,168,83,0.12)' : 'rgba(13,17,23,0.7)',
            color: groupByState ? '#d4a853' : 'rgba(200,214,229,0.5)', fontFamily: 'inherit', boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.2)'
          }}
        >By State</button>
      </div>

      {/* Results count */}
      <div style={{ fontSize: 12, color: 'rgba(200,214,229,0.4)', marginBottom: 10 }}>
        <span style={{ color: '#d4a853', fontWeight: 700 }}>{filtered.length}</span> tournament{filtered.length !== 1 ? 's' : ''}
        {gameType !== 'all' && <span> ({gameType})</span>}
      </div>

      {/* Tournament cards — grouped or flat */}
      {groupByState && groupedByState ? (
        Object.keys(groupedByState).sort().map(st => (
          <div key={st} style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#d4a853', marginBottom: 8, borderBottom: '1px solid rgba(212,168,83,0.15)', paddingBottom: 4 }}>
              {st} ({groupedByState[st].length})
            </div>
            <div style={{ display: 'grid', gap: 10 }}>
              {groupedByState[st].map((t, i) => renderTournamentCard(t, `${st}-${i}`))}
            </div>
          </div>
        ))
      ) : (
        <div style={{ display: 'grid', gap: 10 }}>
          {filtered.map((t, i) => renderTournamentCard(t, i))}
        </div>
      )}

      {filtered.length === 0 && (
        <div style={{ textAlign: 'center', padding: 40, color: 'rgba(200,214,229,0.4)' }}>
          <p style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>No tournaments found for {selectedDay}</p>
          <p style={{ fontSize: 13 }}>Try another day, adjust filters, or enable GPS to see tournaments near you.</p>
        </div>
      )}
    </div>
  );
}

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
    const unsubFav = eventBus.on('venue:favorite', (event) => {
      const venueId = event?.payload?.venueId || event?.venueId;
      if (venueId) setFavorites(prev => ({ ...prev, [venueId]: true }));
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
  const [fetchError, setFetchError] = useState(null);
  const [searchHistory, setSearchHistory] = useState([]);
  const [preferences, setPreferences] = useState({ geofenceAlerts: true, locationEnabled: true, showNewcomerFriendly: true });
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
    setFetchError(null);
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

  // ─── Fetch tours ───
  const fetchTours = useCallback(async () => {
    try {
      const data = await cachedFetch('/api/poker/venues?tournaments=true&limit=50');
      if (data?.data) setTours(data.data.filter(v => v.has_tournaments));
      else if (data?.tours) setTours(data.tours);
    } catch (err) {
      setLoading(false);
      console.error('Failed to fetch tours:', err);
    } finally {
      setToursLoaded(true);
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
      const data = await cachedFetch('/api/poker/venues?tournaments=true&limit=50');
      if (data?.data) setSeries(data.data.filter(v => v.has_tournaments));
      else if (data?.series) setSeries(data.series);
      else if (Array.isArray(data)) setSeries(data);
    } catch (err) {
      console.error('Failed to fetch series:', err);
    } finally {
      setSeriesLoaded(true);
    }
  }, []);

  // ─── Fetch daily tournaments ───
  const fetchDaily = useCallback(async (dayFilter = '') => {
    try {
      let url = '/api/poker/daily-tournaments?limit=999';
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
    fetchFavorites();
    fetchSearchHistory();
    fetchPreferences();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Real-time Supabase Data Hydration ───
  useEffect(() => {
    const venueChannel = supabase.channel('public:venues_lobby')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'venues' }, (payload) => {
        setVenues(prev => prev.map(v => v.id === payload.new.id ? { ...v, ...payload.new } : v));
      }).subscribe();
      
    const tourChannel = supabase.channel('public:tours_lobby')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'poker_tours' }, (payload) => {
        setTours(prev => prev.map(t => t.id === payload.new.id ? { ...t, ...payload.new } : t));
      }).subscribe();
      
    const seriesChannel = supabase.channel('public:series_lobby')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'poker_series' }, (payload) => {
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
    const ids = venues.map(v => v.id).filter(Boolean).slice(0, 50).join(',');
    if (!ids) return;
    fetch('/api/poker/checkins/batch-counts?venue_ids=' + ids)
      .then(r => r.json())
      .then(j => { if (j.success && j.counts) setCheckinCounts(j.counts); })
      .catch(() => { /* silent */ });
  }, [venues]);

  // ─── Fetch global check-in leaderboard (cross-venue top users) ───
  useEffect(() => {
    fetch('/api/poker/checkins/global-leaderboard?period=month')
      .then(r => r.json())
      .then(j => { if (j.success && j.leaders) setGlobalLeaders(j.leaders.slice(0, 5)); })
      .catch(() => {});
  }, []);

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

  // ─── Cross-page favorites sync ───
  useEffect(() => {
    const handleFavoritesChanged = (e) => {
      const { venueId, favorited } = e.detail || {};
      if (venueId) {
        setFavorites(prev => ({ ...prev, [venueId]: favorited }));
      }
    };
    window.addEventListener('pnm:favorites-changed', handleFavoritesChanged);

    // NOTE: Global EventBus sync for venue:favorite/unfavorite is handled by the
    // dedicated useEffect at the top of the component (lines ~382-401).
    // Do NOT duplicate listeners here — it causes double state updates.

    return () => {
      window.removeEventListener('pnm:favorites-changed', handleFavoritesChanged);
    };
  }, []);

  // ─── GPS (persists to Supabase) ───
  const gpsErrorTimeoutRef = useRef(null);
  const handleGpsClick = useCallback(() => {
    // Clear any pending error timeout from a previous click
    if (gpsErrorTimeoutRef.current) clearTimeout(gpsErrorTimeoutRef.current);

    if (gpsActive) {
      setGpsActive(false);
      setUserLocation(null);
      // Persist disabled state to Supabase
      if (userId) {
        updatePokerNearMePreferences(userId, { locationEnabled: false }).catch(() => {});
      }
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
        // Persist enabled state + coordinates to Supabase
        if (userId) {
          updatePokerNearMePreferences(userId, {
            locationEnabled: true,
            lastLocation: loc,
            locationEnabledAt: new Date().toISOString(),
          }).catch(() => {});
        }
        // Fetch ALL venues with GPS coordinates for distance sorting
        const gpsUrl = `/api/poker/venues?limit=500&offset=0&lat=${loc.lat}&lng=${loc.lng}&radius=250&sort=distance`;
        cachedFetch(gpsUrl).then(data => {
          const newVenues = data?.data || data?.venues || (Array.isArray(data) ? data : []);
          setVenues(newVenues);
          setHasMore(newVenues.length >= PAGE_SIZE);
          setPage(0);
        }).catch(err => console.error('GPS venue fetch failed:', err));
        // Stay in current pod — auto-trigger search with distance sort
        if (!activePod || activePod === 'search') {
          setActivePod('nearme');
        }
        setShowPanel(true);
        // Auto-trigger the search results display
        setFilters(prev => ({ ...prev, nmSearched: true, nmSort: 'distance', svHasSearched: true, svSort: 'distance' }));
      },
      (err) => {
        setGpsActive(false);
        setGpsError(err.code === 1 ? 'Location access denied' : 'Could not get location');
        gpsErrorTimeoutRef.current = setTimeout(() => setGpsError(null), 3500);
        // Persist error state
        if (userId) {
          updatePokerNearMePreferences(userId, { locationEnabled: false }).catch(() => {});
        }
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }, [gpsActive, fetchVenues, userId, activePod]);

  // ─── Auto-enable GPS if previously enabled ───
  const gpsAutoRef = useRef(false);
  useEffect(() => {
    if (gpsAutoRef.current || !preferences?.locationEnabled || gpsActive) return;
    gpsAutoRef.current = true;
    // Silently re-request GPS on mount if user previously enabled
    if (typeof navigator !== 'undefined' && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          setUserLocation(loc);
          setGpsActive(true);
        },
        () => { /* silent — don't show error for auto-enable */ },
        { enableHighAccuracy: true, timeout: 8000 }
      );
    }
  }, [preferences?.locationEnabled]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Pod click → open panel with feature ───
  const handlePodClick = useCallback((podId) => {
    playClickSound();
    if (activePod === podId) {
      setActivePod(null);
      setShowPanel(false);
      playPanelCloseSound();
      return;
    }
    setActivePod(podId);
    setShowPanel(true);
    playPanelOpenSound();
    // Emit TrainingBus event for pod interaction tracking
    try { bus?.emitHandComplete?.({ action: 'pod_click', pod: podId }); } catch { }
  }, [activePod, bus]);

  const handlePanelClose = useCallback(() => {
    playPanelCloseSound();
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
        try { eventBus.emit('venue:unfavorite', { venueId }, 'PokerNearMe'); } catch { }
      } else {
        await addVenueFavorite(userId, venueId, venueData);
        try { eventBus.emit('venue:favorite', { venueId, name: venueData?.name }, 'PokerNearMe'); } catch { }
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
        if (svVenueType !== 'all') svResults = svResults.filter(v => v.venue_type === svVenueType);
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
          const apiUrl = `/api/poker/venues?limit=500&offset=0${apiLoc}${apiRadius}${apiState}${apiVenueType}${apiSort}`;
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
                <button onClick={handleGpsClick}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 10, border: userLocation ? '1px solid #3fb950' : '1px solid rgba(88,166,255,0.4)', background: userLocation ? 'rgba(63,185,80,0.15)' : 'rgba(88,166,255,0.08)', color: userLocation ? '#3fb950' : '#58a6ff', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>
                  {userLocation ? 'GPS Active' : 'Enable GPS'}
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
                  {[{k:'all',l:'All'},{k:'casino',l:'Casino'},{k:'card_room',l:'Card Room'},{k:'poker_club',l:'Poker Club'}].map(t => (
                    <button key={t.k} onClick={() => setFilters(prev => ({ ...prev, svVenueType: t.k }))}
                      style={{ padding: '4px 12px', borderRadius: 16, fontSize: 11, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer', border: svVenueType === t.k ? '1px solid #58a6ff' : '1px solid rgba(48,54,61,0.6)', background: svVenueType === t.k ? 'rgba(88,166,255,0.15)' : 'rgba(22,27,34,0.6)', color: svVenueType === t.k ? '#58a6ff' : '#8b949e' }}>{t.l}</button>
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
            {svHasSearched ? (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, padding: '8px 12px', background: 'rgba(22,27,34,0.8)', borderRadius: 10, border: '1px solid rgba(48,54,61,0.6)' }}>
                  <span style={{ fontSize: 13, color: '#c9d1d9' }}>
                    <span style={{ color: '#58a6ff', fontWeight: 800 }}>{svResults.length}</span> venue{svResults.length !== 1 ? 's' : ''}
                    {userLocation && svRadius !== 'any' && <span> within <span style={{ color: '#3fb950' }}>{svRadius} mi</span></span>}
                  </span>
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
                              onNavigate={(url) => { if (url.includes('action=review')) { setSelectedVenueForReview({ id: v.id, name: v.name }); } else { router.push(url); } }}
                              userLocation={userLocation} checkinCount={checkinCounts[String(v.id)] || 0} />
                          </div>
                        );
                      })}
                    </div>
                    {svResults.length > 50 && (
                      <button onClick={loadMore} disabled={loading}
                        style={{ display: 'block', width: '100%', marginBottom: 24, padding: '12px 24px', background: 'rgba(88,166,255,0.08)', border: '1px solid rgba(88,166,255,0.2)', borderRadius: 12, color: '#58a6ff', fontSize: 14, fontWeight: 600, cursor: loading ? 'wait' : 'pointer', fontFamily: 'inherit' }}>
                        {loading ? 'Loading...' : `Load More (${svResults.length - 50} remaining)`}
                      </button>
                    )}
                  </>
                ) : (
                  <div style={{ textAlign: 'center', padding: 40, color: '#8b949e' }}>
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ marginBottom: 12, opacity: 0.3 }}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                    <p style={{ fontSize: 15, fontWeight: 600, marginBottom: 6, color: '#c9d1d9' }}>No Results Found</p>
                    <p style={{ fontSize: 13 }}>Try expanding distance, changing venue type, or selecting a different state.</p>
                  </div>
                )}
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: '30px 16px' }}>
                <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="rgba(88,166,255,0.25)" strokeWidth="1" style={{ marginBottom: 16 }}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                <p style={{ fontSize: 16, fontWeight: 700, color: '#c9d1d9', marginBottom: 8 }}>Search All Venues</p>
                <p style={{ fontSize: 13, color: '#8b949e', lineHeight: 1.5, maxWidth: 320, margin: '0 auto' }}>
                  Set your filters above and tap Search. Enable GPS for distance-based results.
                </p>
                <div style={{ display: 'flex', justifyContent: 'center', gap: 24, marginTop: 20 }}>
                  <div style={{ textAlign: 'center' }}><div style={{ fontSize: 24, fontWeight: 800, color: '#58a6ff' }}>{venues.length || '500+'}</div><div style={{ fontSize: 11, color: '#8b949e' }}>Venues</div></div>
                  <div style={{ textAlign: 'center' }}><div style={{ fontSize: 24, fontWeight: 800, color: '#3fb950' }}>{new Set(venues.map(v => v.state).filter(Boolean)).size || '41'}</div><div style={{ fontSize: 11, color: '#8b949e' }}>States</div></div>
                </div>
              </div>
            )}
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
                <input type="text" placeholder="Search home games..." value={hgSearch}
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
                const hgUrl = `/api/poker/venues?limit=500&offset=0&venue_type=home_game${hgApiState}${hgApiSearch}${hgApiLoc}`;
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
                    <span style={{ color: '#58a6ff', fontWeight: 800 }}>{homeGames.length}</span> home game{homeGames.length !== 1 ? 's' : ''}
                  </span>
                  <button onClick={() => setFilters(prev => ({ ...prev, hgSearch: '', hgState: 'all', hgHasSearched: false }))}
                    style={{ background: 'none', border: 'none', color: '#8b949e', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit', textDecoration: 'underline' }}>Clear</button>
                </div>
                {loading && <div style={{ textAlign: 'center', padding: 20, color: '#8b949e' }}>
                  <div style={{ width: 32, height: 32, border: '3px solid rgba(48,54,61,0.6)', borderTopColor: '#58a6ff', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 12px' }} />
                  Loading home games...
                </div>}
                <div style={{ display: 'grid', gap: 12 }}>
                  {homeGames.map(v => (
                    <VenueCard
                      key={v.id}
                      venue={v}
                      isFavorited={!!favorites[v.id]}
                      onFavorite={(e) => { e?.stopPropagation(); handleToggleFavorite(v.id, v); }}
                      onNavigate={(url) => {
                        if (url.includes('action=review')) { setSelectedVenueForReview({ id: v.id, name: v.name }); }
                        else { router.push(url); }
                      }}
                      userLocation={userLocation}
                      checkinCount={checkinCounts[String(v.id)] || 0}
                    />
                  ))}
                </div>
                {homeGames.length === 0 && !loading && (
                  <div style={{ textAlign: 'center', padding: 40, color: '#8b949e' }}>
                    <p style={{ fontSize: 15, fontWeight: 600, marginBottom: 6, color: '#c9d1d9' }}>No Home Games Found</p>
                    <p style={{ fontSize: 13 }}>Try a different search or state filter.</p>
                  </div>
                )}
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: '30px 16px' }}>
                <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="rgba(88,166,255,0.25)" strokeWidth="1" style={{ marginBottom: 14 }}>
                  <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" /><polyline points="9 22 9 12 15 12 15 22" />
                </svg>
                <p style={{ fontSize: 15, fontWeight: 700, color: '#c9d1d9', marginBottom: 6 }}>Find or List Home Games</p>
                <p style={{ fontSize: 13, color: '#8b949e', lineHeight: 1.5 }}>Search for home games near you or filter by state. Use the search bar above to get started.</p>
              </div>
            )}
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
        if (nmVenueType !== 'all') nmResults = nmResults.filter(v => v.venue_type === nmVenueType);
        if (nmGameType !== 'all') {
          nmResults = nmResults.filter(v => {
            const g = (v.games_offered || []).join(' ').toLowerCase();
            if (nmGameType === 'nlh') return g.includes('nlh') || g.includes('hold');
            if (nmGameType === 'plo') return g.includes('plo') || g.includes('omaha');
            if (nmGameType === 'mixed') return g.includes('mix') || g.includes('horse');
            return true;
          });
        }
        // Haversine distance
        const nmDist = (v) => {
          if (!userLocation || !v.latitude || !v.longitude) return 99999;
          const R = 3959;
          const dLat = (v.latitude - userLocation.lat) * Math.PI / 180;
          const dLon = (v.longitude - userLocation.lng) * Math.PI / 180;
          const a = Math.sin(dLat/2)*Math.sin(dLat/2) + Math.cos(userLocation.lat*Math.PI/180)*Math.cos(v.latitude*Math.PI/180)*Math.sin(dLon/2)*Math.sin(dLon/2);
          return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
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
          const apiUrl = `/api/poker/venues?limit=500&offset=0${apiLoc}${apiRadius}${apiState}${apiVenueType}${apiSort}`;
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
                <button onClick={handleGpsClick}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 10, border: userLocation ? '1px solid #3fb950' : '1px solid rgba(88,166,255,0.4)', background: userLocation ? 'rgba(63,185,80,0.15)' : 'rgba(88,166,255,0.08)', color: userLocation ? '#3fb950' : '#58a6ff', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.2s' }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>
                  {userLocation ? 'GPS Active' : 'Enable GPS'}
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
                  {[{k:'all',l:'All'},{k:'casino',l:'Casino'},{k:'card_room',l:'Card Room'},{k:'poker_club',l:'Poker Club'},{k:'home_game',l:'Home Game'},{k:'charity',l:'Charity'}].map(t => (
                    <button key={t.k} onClick={() => setFilters(prev => ({ ...prev, nmVenueType: t.k }))}
                      style={{ padding: '4px 12px', borderRadius: 16, fontSize: 11, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer', border: nmVenueType === t.k ? '1px solid #58a6ff' : '1px solid rgba(48,54,61,0.6)', background: nmVenueType === t.k ? 'rgba(88,166,255,0.15)' : 'rgba(22,27,34,0.6)', color: nmVenueType === t.k ? '#58a6ff' : '#8b949e', transition: 'all 0.15s' }}>{t.l}</button>
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
            {nmSearched ? (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, padding: '8px 12px', background: 'rgba(22,27,34,0.8)', borderRadius: 10, border: '1px solid rgba(48,54,61,0.6)' }}>
                  <span style={{ fontSize: 13, color: '#c9d1d9' }}>
                    <span style={{ color: '#58a6ff', fontWeight: 800 }}>{nmResults.length}</span> venue{nmResults.length !== 1 ? 's' : ''}
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
                              onNavigate={(url) => { if (url.includes('action=review')) { setSelectedVenueForReview({ id: v.id, name: v.name }); } else { router.push(url); } }}
                              userLocation={userLocation} checkinCount={checkinCounts[String(v.id)] || 0} />
                          </div>
                        );
                      })}
                    </div>
                    {nmResults.length > 50 && (
                      <button onClick={loadMore} disabled={loading}
                        style={{ display: 'block', width: '100%', marginBottom: 24, padding: '12px 24px', background: 'rgba(88,166,255,0.08)', border: '1px solid rgba(88,166,255,0.2)', borderRadius: 12, color: '#58a6ff', fontSize: 14, fontWeight: 600, cursor: loading ? 'wait' : 'pointer', fontFamily: 'inherit' }}>
                        {loading ? 'Loading...' : `Load More (${nmResults.length - 50} remaining)`}
                      </button>
                    )}
                  </>
                ) : (
                  <div style={{ textAlign: 'center', padding: 40, color: 'rgba(200,214,229,0.4)' }}>
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ marginBottom: 12, opacity: 0.3 }}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                    <p style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>No Results Found</p>
                    <p style={{ fontSize: 13 }}>Try expanding distance, changing venue type, or selecting a different state.</p>
                  </div>
                )}
              </div>
            ) : (
              /* ═══ LANDING STATE — before search ═══ */
              <div style={{ textAlign: 'center', padding: '30px 16px' }}>
                <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="rgba(88,166,255,0.25)" strokeWidth="1" style={{ marginBottom: 16 }}>
                  <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                </svg>
                <p style={{ fontSize: 16, fontWeight: 700, color: '#c9d1d9', marginBottom: 8 }}>Find Poker Anywhere</p>
                <p style={{ fontSize: 13, color: '#8b949e', lineHeight: 1.5, maxWidth: 320, margin: '0 auto' }}>
                  Enable GPS to find games near you, or set your search parameters above and tap Search. Filter by venue type, game type, distance, and buy-in range.
                </p>
                <div style={{ display: 'flex', justifyContent: 'center', gap: 24, marginTop: 20, flexWrap: 'wrap' }}>
                  <div style={{ textAlign: 'center' }}><div style={{ fontSize: 24, fontWeight: 800, color: '#58a6ff' }}>{venues.length || '500+'}</div><div style={{ fontSize: 11, color: '#8b949e' }}>Venues</div></div>
                  <div style={{ textAlign: 'center' }}><div style={{ fontSize: 24, fontWeight: 800, color: '#d2a8ff' }}>{dailyTournaments.length > 0 ? dailyTournaments.length.toLocaleString() : '3,270'}</div><div style={{ fontSize: 11, color: '#8b949e' }}>Tournaments</div></div>
                  <div style={{ textAlign: 'center' }}><div style={{ fontSize: 24, fontWeight: 800, color: '#3fb950' }}>{new Set(venues.map(v => v.state).filter(Boolean)).size || '41'}</div><div style={{ fontSize: 11, color: '#8b949e' }}>States</div></div>
                </div>
              </div>
            )}
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
        />;
        break;

      case 'mapview': {
        const mapStateFilter = filters.mapState || 'all';
        const mapVenues = mapStateFilter !== 'all'
          ? venues.filter(v => v.state === mapStateFilter)
          : venues;
        component = (
          <div>
            <div style={{ display: 'flex', gap: 10, marginBottom: 12, alignItems: 'center', flexWrap: 'wrap' }}>
              <select
                value={mapStateFilter}
                onChange={(e) => setFilters(prev => ({ ...prev, mapState: e.target.value }))}
                style={{ background: 'rgba(110,231,239,0.08)', border: '1px solid rgba(110,231,239,0.2)', borderRadius: 8, padding: '6px 12px', color: '#e0e8f0', fontSize: 12, fontFamily: 'inherit', cursor: 'pointer', outline: 'none', minWidth: 100 }}>
                <option value="all" style={{ background: '#0d1a2a' }}>All States</option>
                {['AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY','DC'].map(st => (
                  <option key={st} value={st} style={{ background: '#0d1a2a' }}>{st}</option>
                ))}
              </select>
              <span style={{ fontSize: 12, color: 'rgba(200,214,229,0.4)', marginLeft: 'auto' }}>
                <span style={{ color: '#d4a853', fontWeight: 700 }}>{mapVenues.filter(v => v.latitude && v.longitude).length}</span> venues on map
              </span>
            </div>
            <VenueMapPanel venues={mapVenues} userLocation={userLocation} onVenueSelect={(v) => { setSelectedVenueForReview(null); router.push(`/hub/venues/${v.id}`); }} />
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
          filteredTours = filteredTours.filter(t => (t.name || '').toLowerCase().includes(lower) || (t.city || '').toLowerCase().includes(lower) || (t.state || '').toLowerCase().includes(lower));
        }
        if (tourState !== 'all') {
          filteredTours = filteredTours.filter(t => t.state === tourState);
        }
        component = (
          <div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12, alignItems: 'center', flexWrap: 'wrap' }}>
              <input type="text" placeholder="Search tours..." value={tourSearch}
                onChange={(e) => setFilters(prev => ({ ...prev, tourSearch: e.target.value }))}
                style={{ flex: 1, minWidth: 120, padding: '8px 14px', borderRadius: 8, border: '1px solid rgba(88,166,255,0.2)', background: 'rgba(13,17,23,0.7)', color: '#e0e8f0', fontSize: 13, fontFamily: 'inherit', outline: 'none', transition: 'border-color 0.2s', boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.2)' }} />
              <select value={tourState}
                onChange={(e) => setFilters(prev => ({ ...prev, tourState: e.target.value }))}
                style={{ background: 'rgba(13,17,23,0.7)', border: '1px solid rgba(88,166,255,0.2)', borderRadius: 8, padding: '8px 14px', color: '#e0e8f0', fontSize: 13, fontFamily: 'inherit', cursor: 'pointer', outline: 'none', minWidth: 110, boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.2)' }}>
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
              {filteredTours.map((t, i) => <TourCard key={t.tour_code || t.id || `tour-${i}`} tour={t} />)}
            </div>
            {!toursLoaded && tours.length === 0 && (
              <div style={{ textAlign: 'center', padding: 40, color: 'rgba(200,214,229,0.4)' }}>
                <div style={{ width: 40, height: 40, border: '3px solid rgba(255,255,255,0.1)', borderTopColor: '#00D4FF', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 16px' }} />
                Loading tours...
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
              <input type="text" placeholder="Search series..." value={seriesSearch}
                onChange={(e) => setFilters(prev => ({ ...prev, seriesSearch: e.target.value }))}
                style={{ flex: 1, minWidth: 120, padding: '8px 14px', borderRadius: 8, border: '1px solid rgba(88,166,255,0.2)', background: 'rgba(13,17,23,0.7)', color: '#e0e8f0', fontSize: 13, fontFamily: 'inherit', outline: 'none', transition: 'border-color 0.2s', boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.2)' }} />
              <select value={seriesState}
                onChange={(e) => setFilters(prev => ({ ...prev, seriesState: e.target.value }))}
                style={{ background: 'rgba(13,17,23,0.7)', border: '1px solid rgba(88,166,255,0.2)', borderRadius: 8, padding: '8px 14px', color: '#e0e8f0', fontSize: 13, fontFamily: 'inherit', cursor: 'pointer', outline: 'none', minWidth: 110, boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.2)' }}>
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
              {filteredSeries.map((s, i) => <SeriesCard key={s.series_code || s.id || `series-${i}`} series={s} />)}
            </div>
            {!seriesLoaded && series.length === 0 && (
              <div style={{ textAlign: 'center', padding: 40, color: 'rgba(200,214,229,0.4)' }}>
                <div style={{ width: 40, height: 40, border: '3px solid rgba(255,255,255,0.1)', borderTopColor: '#00D4FF', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 16px' }} />
                Loading series...
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
                onNavigate={(url) => {
                  if (url.includes('action=review')) {
                    setSelectedVenueForReview({ id: v.id, name: v.name });
                  } else {
                    router.push(url);
                  }
                }}
                userLocation={userLocation}
                checkinCount={checkinCounts[String(v.id)] || 0}
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
        component = <SocialLayer userId={userId} venues={venues} userLocation={userLocation} />;
        break;

      case 'alerts':
        component = <TournamentAlerts dailyTournaments={dailyTournaments} userId={userId} userLocation={userLocation} />;
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
  }, [activePod, venues, tours, series, dailyTournaments, liveGames, favorites, loading, userLocation, userId, router, handleToggleFavorite, sortBy, showFilters, filters, hasMore, page, fetchDaily, loadMore, handleSortChange, handleFilterChange, favoritedVenues, fetchError, fetchVenues, searchQuery, toursLoaded, seriesLoaded, checkinCounts]);

  // ─── Live data for the 3D scene (drives visual behavior) ───
  const liveData = useMemo(() => ({
    venueCount: venues.length,
    liveGameCount: 0, // Live game count managed by LiveGamesFeed component internally
    tourCount: tours.length,
    seriesCount: series.length,
    dailyCount: dailyTournaments.length,
    alertCount: dailyTournaments.length + tours.length,
    savedCount: Object.keys(favorites).filter(k => favorites[k]).length,
    friendsNearby: 0,
  }), [venues.length, tours.length, series.length, dailyTournaments.length, favorites]);

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
                    color: '#6ee7ef',
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
                    cursor: 'pointer', padding: 6, borderRadius: 8,
                  }}
                >
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
              {/* Content — full remaining height */}
              <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px 90px', WebkitOverflowScrolling: 'touch' }}>
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

      {/* Global keyframes for inline spinners used in panel loading states */}
      <style jsx global>{`
      @keyframes spin { to { transform: rotate(360deg); } }
      @keyframes lobby-panelSlideUp {
        from { transform: translateY(100%); opacity: 0.5; }
        to { transform: translateY(0); opacity: 1; }
      }
    `}</style>
    </>
  );
}
/* audit-trigger: 1774471099 */
// GOAT Search Engine rebuild trigger 1774534082
