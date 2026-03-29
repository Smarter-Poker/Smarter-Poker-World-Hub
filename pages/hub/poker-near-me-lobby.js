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
const ScraperHealthDashboard = dynamic(() => import('../../src/components/poker-near-me/ScraperHealthDashboard'), { ssr: false });

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
  tripcost: { title: 'Trip Cost Calculator', tab: 'tripcost' },
  scraperhealth: { title: 'Scraper Health', tab: 'scraperhealth' },
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

  // Buy-in color coding: green <$100, gold $100-500, red $500+
  const getBuyinColor = (buyIn) => {
    if (!buyIn) return { color: 'rgba(200,214,229,0.5)', bg: 'rgba(200,214,229,0.06)', border: 'rgba(200,214,229,0.12)' };
    if (buyIn < 100) return { color: '#22c55e', bg: 'rgba(34,197,94,0.1)', border: 'rgba(34,197,94,0.25)' };
    if (buyIn <= 500) return { color: '#d4a853', bg: 'rgba(212,168,83,0.1)', border: 'rgba(212,168,83,0.25)' };
    return { color: '#ef4444', bg: 'rgba(239,68,68,0.1)', border: 'rgba(239,68,68,0.25)' };
  };

  const renderTournamentCard = (t, i) => {
    const buyinStyle = getBuyinColor(t.buy_in);
    return (
    <div key={t.id || i} onClick={() => t.venue_id ? window.location.href = `/hub/venues/${t.venue_id}` : null} style={{
      background: 'rgba(13,17,23,0.7)', border: '1px solid rgba(88,166,255,0.2)',
      borderRadius: 12, padding: '12px 16px', transition: 'all 0.2s', boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.2)',
      cursor: t.venue_id ? 'pointer' : 'default',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#e0e8f0', marginBottom: 2 }}>
            {t.tournament_name || t.name || `${t.game_type || 'NLH'} Tournament`}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'rgba(200,214,229,0.55)' }}>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0, opacity: 0.5 }}>
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/>
            </svg>
            {t.venue_name || 'Unknown Venue'}
            {(t.venue_city || t.city) && <span style={{ color: 'rgba(200,214,229,0.35)' }}>{t.venue_city || t.city}{(t.venue_state || t.state) ? `, ${t.venue_state || t.state}` : ''}</span>}
          </div>
        </div>
        <div style={{ fontSize: 13, fontWeight: 700, color: buyinStyle.color, background: buyinStyle.bg, border: `1px solid ${buyinStyle.border}`, padding: '3px 10px', borderRadius: 6, whiteSpace: 'nowrap', flexShrink: 0, marginLeft: 8 }}>
          {t.buy_in ? `$${t.buy_in}` : 'TBD'}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', fontSize: 11, color: 'rgba(200,214,229,0.45)' }}>
        {t.start_time && <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="rgba(200,214,229,0.4)" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>{t.start_time}</span>}
        {t.game_type && <span style={{ color: '#58a6ff', background: 'rgba(88,166,255,0.08)', padding: '1px 6px', borderRadius: 4 }}>{t.game_type}</span>}
        {t.guaranteed && <span style={{ color: '#f59e0b' }}>GTD: ${typeof t.guaranteed === 'number' ? t.guaranteed.toLocaleString() : t.guaranteed}</span>}
        {t.starting_stack && <span>Stack: {t.starting_stack.toLocaleString?.() || t.starting_stack}</span>}
        {t.blind_levels && <span>Blinds: {t.blind_levels}</span>}
        {t.rebuy_addon && <span>{t.rebuy_addon}</span>}
      </div>
    </div>
    );
  };

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
  const [prefsLoaded, setPrefsLoaded] = useState(false);
  // ─── Location Prompt Dismissal (ONE-TIME-AND-DONE) ───
  // Once the user dismisses the Enable Location prompt, we never auto-show it again.
  // Persisted via localStorage (instant, no-auth) + Supabase prefs (cross-device).
  const [locationPromptDismissed, setLocationPromptDismissed] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('pnm_location_prompt_dismissed') === '1';
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
      const deepUrl = `/api/poker/venues?limit=10000&offset=0&search=${encodeURIComponent(q)}&sort=trust`;
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
      let url = `/api/poker/venues?limit=10000&offset=${pageNum * PAGE_SIZE}`;
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

  // ─── Fetch tours (venue_type = 'tour' from poker_venues table) ───
  const fetchTours = useCallback(async () => {
    try {
      const data = await cachedFetch('/api/poker/venues?venue_type=tour&limit=10000');
      const tourData = data?.data || data?.venues || (Array.isArray(data) ? data : []);
      setTours(tourData);
    } catch (err) {
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

  // ─── Fetch series (venue_type = 'series' from poker_venues table) ───
  const fetchSeries = useCallback(async () => {
    try {
      const data = await cachedFetch('/api/poker/venues?venue_type=series&limit=10000');
      const seriesData = data?.data || data?.venues || (Array.isArray(data) ? data : []);
      setSeries(seriesData);
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
    const ids = venues.map(v => v.id).filter(Boolean).join(',');
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

  // ─── Cleanup timeouts on unmount (prevent setState on unmounted component) ───
  useEffect(() => {
    return () => {
      if (locationToastTimeoutRef.current) clearTimeout(locationToastTimeoutRef.current);
      if (gpsErrorTimeoutRef.current) clearTimeout(gpsErrorTimeoutRef.current);
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
    const geo = await reverseGeocode(loc.lat, loc.lng);
    if (geo?.city) {
      showLocationSuccessToast(geo);
    }
    // Persist enabled state + coordinates to Supabase
    if (userId) {
      updatePokerNearMePreferences(userId, {
        locationEnabled: true,
        lastLocation: loc,
        lastLocationCity: geo?.city || '',
        lastLocationState: geo?.state || '',
        locationEnabledAt: new Date().toISOString(),
      }).catch(() => {});
    }
    // Fetch ALL venues with GPS coordinates for distance sorting
    const gpsUrl = `/api/poker/venues?limit=10000&offset=0&lat=${loc.lat}&lng=${loc.lng}&radius=250&sort=distance`;
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

    // CASE 1: User PREVIOUSLY DECLINED → do NOT auto-prompt (respect their choice)
    if (locationPref === false) return;

    // CASE 2: User PREVIOUSLY ACCEPTED → silently re-enable GPS
    // If we have saved coordinates, use them immediately (instant, no permission prompt)
    // Then silently try to refresh GPS in background for accuracy
    if (locationPref === true && savedLoc?.lat && savedLoc?.lng) {
      setUserLocation(savedLoc);
      setGpsActive(true);
      setSortBy('distance'); // BUG-05 fix: auto-distance sort for returning users
      showLocationSuccessToast({
        city: preferences?.lastLocationCity || '',
        state: preferences?.lastLocationState || '',
      });
      // Fetch venues with saved location immediately
      const gpsUrl = `/api/poker/venues?limit=10000&offset=0&lat=${savedLoc.lat}&lng=${savedLoc.lng}&radius=250&sort=distance`;
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
            const movedSignificantly = Math.abs(loc.lat - savedLoc.lat) > 0.01 || Math.abs(loc.lng - savedLoc.lng) > 0.01;
            if (movedSignificantly) {
              const freshUrl = `/api/poker/venues?limit=10000&offset=0&lat=${loc.lat}&lng=${loc.lng}&radius=250&sort=distance`;
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
                const movedSignificantly = Math.abs(loc.lat - savedLoc.lat) > 0.01 || Math.abs(loc.lng - savedLoc.lng) > 0.01;
                if (movedSignificantly) {
                  const freshUrl = `/api/poker/venues?limit=10000&offset=0&lat=${loc.lat}&lng=${loc.lng}&radius=250&sort=distance`;
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
        // Persist
        if (userId) {
          updatePokerNearMePreferences(userId, {
            locationEnabled: true,
            lastLocation: loc,
            lastLocationCity: manualCity.trim(),
            lastLocationState: manualState || '',
            locationEnabledAt: new Date().toISOString(),
            manualLocation: true,
          }).catch(() => {});
        }
        // Fetch venues near this location
        const gpsUrl = `/api/poker/venues?limit=10000&offset=0&lat=${loc.lat}&lng=${loc.lng}&radius=250&sort=distance`;
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

  // ─── Pod click → open panel with feature ───
  const handlePodClick = useCallback((podId) => {
    playClickSound();
    if (activePod === podId) {
      setActivePod(null);
      setShowPanel(false);
      playPanelCloseSound();
      return;
    }
    // GPS-dependent pods: always let the user through to the panel.
    // If GPS is not active, the panel will show a gentle inline location CTA
    // instead of blocking the entire UI with a modal.
    // ONE-TIME-AND-DONE: never block navigation with popups.
    setActivePod(podId);
    setShowPanel(true);
    playPanelOpenSound();
    // Emit TrainingBus event for pod interaction tracking
    try { bus?.emitHandComplete?.({ action: 'pod_click', pod: podId }); } catch { }
  }, [activePod, bus]);

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
          const apiUrl = `/api/poker/venues?limit=10000&offset=0${apiLoc}${apiRadius}${apiState}${apiVenueType}${apiSort}`;
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
                  style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 10, border: userLocation ? '1px solid #3fb950' : gpsLoading ? '1px solid rgba(255,213,0,0.4)' : '1px solid rgba(88,166,255,0.4)', background: userLocation ? 'rgba(63,185,80,0.15)' : gpsLoading ? 'rgba(255,213,0,0.1)' : 'rgba(88,166,255,0.08)', color: userLocation ? '#3fb950' : gpsLoading ? '#ffd500' : '#58a6ff', fontSize: 13, fontWeight: 700, cursor: gpsLoading ? 'wait' : 'pointer', fontFamily: 'inherit', transition: 'all 0.2s' }}>
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
                  {[{k:'all',l:'All'},{k:'casino',l:'Casino'},{k:'card_room',l:'Card Room'},{k:'poker_club',l:'Poker Club'},{k:'home_game',l:'Home Game'},{k:'charity',l:'Charity'},{k:'series',l:'Series'},{k:'tour',l:'Tour'}].map(t => (
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
                const hgUrl = `/api/poker/venues?limit=10000&offset=0&venue_type=home_game${hgApiState}${hgApiSearch}${hgApiLoc}`;
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
          const apiUrl = `/api/poker/venues?limit=10000&offset=0${apiLoc}${apiRadius}${apiState}${apiVenueType}${apiSort}`;
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
                  style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 10, border: userLocation ? '1px solid #3fb950' : gpsLoading ? '1px solid rgba(255,213,0,0.4)' : '1px solid rgba(88,166,255,0.4)', background: userLocation ? 'rgba(63,185,80,0.15)' : gpsLoading ? 'rgba(255,213,0,0.1)' : 'rgba(88,166,255,0.08)', color: userLocation ? '#3fb950' : gpsLoading ? '#ffd500' : '#58a6ff', fontSize: 13, fontWeight: 700, cursor: gpsLoading ? 'wait' : 'pointer', fontFamily: 'inherit', transition: 'all 0.2s' }}>
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
                  {[{k:'all',l:'All'},{k:'casino',l:'Casino'},{k:'card_room',l:'Card Room'},{k:'poker_club',l:'Poker Club'},{k:'home_game',l:'Home Game'},{k:'charity',l:'Charity'},{k:'series',l:'Series'},{k:'tour',l:'Tour'}].map(t => (
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
          user={user}
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
        component = (
          <div>
            <RoadTripPlanner venues={venues} userLocation={userLocation} locationCity={locationCity} locationState={locationState} />
            {/* Trip Cost Calculator — accessible from Trip Planner */}
            <div style={{ marginTop: 20, padding: '16px 0', borderTop: '1px solid rgba(110,231,239,0.1)' }}>
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

      case 'tripcost':
        component = (
          <div>
            <TripCostCalculator venues={venues} userLocation={userLocation} />
            <div style={{ marginTop: 16, textAlign: 'center' }}>
              <button
                onClick={() => { setActivePod('roadtrip'); }}
                style={{
                  background: 'none', border: '1px solid rgba(110,231,239,0.2)',
                  borderRadius: 8, padding: '8px 20px', color: '#6ee7ef',
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

      case 'scraperhealth':
        component = <ScraperHealthDashboard />;
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
              const gpsUrl = `/api/poker/venues?limit=10000&offset=0&lat=${saved.lat}&lng=${saved.lng}&radius=250&sort=distance`;
              cachedFetch(gpsUrl).then(data => {
                const newVenues = data?.data || data?.venues || (Array.isArray(data) ? data : []);
                setVenues(newVenues);
                setHasMore(newVenues.length >= PAGE_SIZE);
                setPage(0);
              }).catch(() => {});
            }
          }}
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
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            animation: 'lobby-fadeIn 0.25s ease-out',
          }}>
            <div style={{
              width: 'min(460px, 94vw)',
              background: 'linear-gradient(160deg, rgba(18,24,40,0.98), rgba(10,16,28,0.98))',
              borderRadius: 22,
              border: '1px solid rgba(88,166,255,0.25)',
              boxShadow: '0 24px 72px rgba(0,0,0,0.65), 0 0 40px rgba(88,166,255,0.06)',
              overflow: 'hidden',
              backdropFilter: 'blur(16px)',
              WebkitBackdropFilter: 'blur(16px)',
            }}>
              {/* Header */}
              <div style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '20px 24px', borderBottom: '1px solid rgba(88,166,255,0.12)',
                background: 'linear-gradient(180deg, rgba(88,166,255,0.06), transparent)',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{
                    width: 42, height: 42, borderRadius: '50%',
                    background: 'linear-gradient(135deg, rgba(34,197,94,0.2), rgba(34,197,94,0.08))',
                    border: '1px solid rgba(34,197,94,0.35)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    animation: 'lobby-gpsPulse 2s ease-in-out infinite',
                  }}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="3"/><path d="M12 2v4m0 12v4m-10-10h4m12 0h4"/>
                    </svg>
                  </div>
                  <div>
                    <div style={{ fontSize: 18, fontWeight: 800, color: '#e6edf5', letterSpacing: '-0.3px' }}>Enable Location</div>
                    <div style={{ fontSize: 12, color: 'rgba(200,214,229,0.5)', marginTop: 1 }}>Find poker rooms near you instantly</div>
                  </div>
                </div>
                <button
                  onClick={() => { setShowEnablePopup(false); dismissLocationPrompt(); }}
                  style={{ background: 'none', border: 'none', color: 'rgba(200,214,229,0.45)', cursor: 'pointer', fontSize: 24, padding: 4, lineHeight: 1 }}
                >&times;</button>
              </div>

              {/* Body */}
              <div style={{ padding: '24px' }}>
                {/* Primary CTA — triggers browser permission prompt */}
                <button
                  onClick={() => {
                    // This re-triggers the native browser permission dialog
                    // On 'prompt' state: shows the allow/deny dialog
                    // On 'denied' state: browser won't show dialog, so we show instructions
                    if (permissionState !== 'denied') {
                      setShowEnablePopup(false);
                      handleGpsClick({ fromModal: true });
                    } else {
                      // Permission is hard-denied — trigger getCurrentPosition anyway
                      // which will immediately fail, but on some browsers it may
                      // open settings. Otherwise the user sees the manual instructions below.
                      navigator.geolocation.getCurrentPosition(
                        (pos) => {
                          setShowEnablePopup(false);
                          onGpsSuccess(pos);
                        },
                        () => {
                          // Expected failure — instructions below handle it
                        },
                        { timeout: 3000 }
                      );
                    }
                  }}
                  style={{
                    width: '100%', padding: '14px 0', borderRadius: 14,
                    border: '1px solid rgba(34,197,94,0.45)',
                    background: 'linear-gradient(135deg, #238636, #196c2e)',
                    color: '#ffffff', fontSize: 15, fontWeight: 800,
                    cursor: 'pointer', fontFamily: 'inherit',
                    boxShadow: '0 6px 20px rgba(34,197,94,0.25), inset 0 1px 0 rgba(255,255,255,0.1)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                    transition: 'all 0.2s',
                    marginBottom: 20,
                  }}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="3"/><path d="M12 2v4m0 12v4m-10-10h4m12 0h4"/>
                  </svg>
                  {permissionState === 'denied' ? 'Try Enabling Location' : 'Enable Location Now'}
                </button>

                {/* Device-specific instructions panel */}
                {permissionState === 'denied' && (
                  <div style={{
                    background: 'rgba(88,166,255,0.05)',
                    border: '1px solid rgba(88,166,255,0.15)',
                    borderRadius: 14, padding: '16px 18px',
                    marginBottom: 20,
                  }}>
                    <div style={{
                      fontSize: 12, fontWeight: 700, color: '#58a6ff', textTransform: 'uppercase',
                      letterSpacing: '0.8px', marginBottom: 12,
                    }}>
                      {deviceType === 'ios' ? 'iPhone / iPad' : deviceType === 'android' ? 'Android' : 'Browser'} — How to Enable
                    </div>

                    {deviceType === 'ios' && (
                      <div style={{ display: 'grid', gap: 10 }}>
                        {[
                          { step: '1', text: 'Open Settings on your iPhone' },
                          { step: '2', text: 'Scroll down and tap Safari (or your browser)' },
                          { step: '3', text: 'Tap Location, then select "Allow"' },
                          { step: '4', text: 'Return here and tap the button above' },
                        ].map(s => (
                          <div key={s.step} style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                            <div style={{
                              minWidth: 26, height: 26, borderRadius: '50%',
                              background: 'linear-gradient(135deg, rgba(88,166,255,0.2), rgba(88,166,255,0.08))',
                              border: '1px solid rgba(88,166,255,0.3)',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              fontSize: 12, fontWeight: 800, color: '#58a6ff',
                            }}>{s.step}</div>
                            <div style={{ fontSize: 13, color: 'rgba(200,214,229,0.75)', lineHeight: 1.5, paddingTop: 3 }}>
                              {s.text}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {deviceType === 'android' && (
                      <div style={{ display: 'grid', gap: 10 }}>
                        {[
                          { step: '1', text: 'Open Settings on your phone' },
                          { step: '2', text: 'Tap Apps & notifications, then your browser' },
                          { step: '3', text: 'Tap Permissions, then Location' },
                          { step: '4', text: 'Select "Allow" and return here' },
                        ].map(s => (
                          <div key={s.step} style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                            <div style={{
                              minWidth: 26, height: 26, borderRadius: '50%',
                              background: 'linear-gradient(135deg, rgba(88,166,255,0.2), rgba(88,166,255,0.08))',
                              border: '1px solid rgba(88,166,255,0.3)',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              fontSize: 12, fontWeight: 800, color: '#58a6ff',
                            }}>{s.step}</div>
                            <div style={{ fontSize: 13, color: 'rgba(200,214,229,0.75)', lineHeight: 1.5, paddingTop: 3 }}>
                              {s.text}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {deviceType === 'desktop' && (
                      <div style={{ display: 'grid', gap: 10 }}>
                        {[
                          { step: '1', text: 'Click the lock icon in your browser address bar' },
                          { step: '2', text: 'Find "Location" and change it to "Allow"' },
                          { step: '3', text: 'Reload this page — location will be enabled' },
                        ].map(s => (
                          <div key={s.step} style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                            <div style={{
                              minWidth: 26, height: 26, borderRadius: '50%',
                              background: 'linear-gradient(135deg, rgba(88,166,255,0.2), rgba(88,166,255,0.08))',
                              border: '1px solid rgba(88,166,255,0.3)',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              fontSize: 12, fontWeight: 800, color: '#58a6ff',
                            }}>{s.step}</div>
                            <div style={{ fontSize: 13, color: 'rgba(200,214,229,0.75)', lineHeight: 1.5, paddingTop: 3 }}>
                              {s.text}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Quick-open browser settings CTA (works on Chrome/Edge) */}
                    {deviceType === 'desktop' && (
                      <button
                        onClick={() => {
                          // Chrome: chrome://settings/content/location
                          // This won't work as a navigation but we can open site settings
                          // Open the page in a new window with a location prompt
                          window.location.reload();
                        }}
                        style={{
                          width: '100%', padding: '10px 0', borderRadius: 10, marginTop: 14,
                          border: '1px solid rgba(88,166,255,0.25)',
                          background: 'rgba(88,166,255,0.08)',
                          color: '#58a6ff', fontSize: 13, fontWeight: 700,
                          cursor: 'pointer', fontFamily: 'inherit',
                          transition: 'all 0.2s',
                        }}
                      >
                        Reload Page After Enabling
                      </button>
                    )}
                  </div>
                )}

                {/* Divider */}
                <div style={{
                  textAlign: 'center', fontSize: 11, color: 'rgba(200,214,229,0.3)',
                  marginBottom: 16, textTransform: 'uppercase', letterSpacing: '1.5px',
                  display: 'flex', alignItems: 'center', gap: 12,
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
                    width: '100%', padding: '12px 0', borderRadius: 12,
                    border: '1px solid rgba(88,166,255,0.2)',
                    background: 'rgba(88,166,255,0.06)',
                    color: 'rgba(200,214,229,0.7)', fontSize: 14, fontWeight: 600,
                    cursor: 'pointer', fontFamily: 'inherit',
                    transition: 'all 0.2s',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
              border: '1px solid rgba(88,166,255,0.2)',
              boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
              overflow: 'hidden',
            }}>
              {/* Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '18px 24px', borderBottom: '1px solid rgba(88,166,255,0.1)' }}>
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
                    border: gpsLoading ? '1px solid rgba(88,166,255,0.4)' : '1px solid rgba(63,185,80,0.4)',
                    background: gpsLoading ? 'rgba(88,166,255,0.12)' : 'linear-gradient(135deg, #238636, #196c2e)',
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
                    border: '1px solid rgba(88,166,255,0.4)',
                    background: manualCity.trim() ? 'linear-gradient(135deg, #1f6feb, #1a5cc7)' : 'rgba(88,166,255,0.08)',
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
        background: rgba(88,166,255,0.08);
        color: rgba(255,255,255,0.75);
        border: 1px solid rgba(88,166,255,0.12);
      }
      .tag.game {
        background: rgba(88,166,255,0.08);
        border: 1px solid rgba(88,166,255,0.12);
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
