/**
 * EVENTS CALENDAR — Unified Tournament Search Engine
 * ===================================================
 * Aggregates ALL tournament data into one searchable page:
 *   - 9,697 daily venue tournaments (recurring + dated)
 *   - 208 poker series
 *   - 598+ tour stop events
 *
 * Features:
 *   - Search by text (venue, event name, series)
 *   - Filter by date range, buy-in, game type, event type
 *   - "Change Location" — search anywhere by city/state
 *   - GPS distance display when available
 *   - List view (date-grouped) and Calendar view (monthly grid)
 */

import SEOHead from '../../src/components/seo/SEOHead';
import Link from 'next/link';
import { useState, useEffect, useCallback, useRef, useMemo, memo } from 'react';
import { useRouter } from 'next/router';
import useSWR from 'swr';
import UniversalHeader from '../../src/components/ui/UniversalHeader';
import HamburgerMenu from '../../src/components/ui/HamburgerMenu';
import { getMenuConfig } from '../../src/config/hamburgerMenus';
import useVenueRealtime from '../../src/hooks/useVenueRealtime';
import { resolveCityCoords } from '../../src/data/city-coordinates';
import dynamic from 'next/dynamic';
const VenueMap = dynamic(() => import('../../src/components/poker-near-me/VenueMap').then(m => m.default || m), { ssr: false });

// -- COMPONENT DOM VIRTUALIZATION ENGINE --
function LazyRender({ children, height = '120px' }) {
  const [isVisible, setIsVisible] = useState(false);
  const domRef = useRef();

  useEffect(() => {
    let observer;
    if (domRef.current) {
      observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            setIsVisible(true);
            observer.unobserve(entry.target);
          }
        });
      }, { rootMargin: '400px 0px' });
      observer.observe(domRef.current);
    }
    return () => { if (observer) observer.disconnect(); };
  }, []);

  return (
    <div ref={domRef} style={{ minHeight: isVisible ? 'auto' : height }}>
      {isVisible ? children : null}
    </div>
  );
}
// ----------------------------------------

/* ───── Constants ───── */
const DAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const DATE_RANGES = [
  { key: 'today', label: 'Today' },
  { key: 'tomorrow', label: 'Tomorrow' },
  { key: 'week', label: 'This Week' },
  { key: 'weekend', label: 'This Weekend' },
  { key: '14days', label: 'Next 14 Days' },
  { key: '30days', label: 'Next 30 Days' },
];

const BUY_IN_TIERS = [
  { key: 'all', label: 'All Buy-Ins', min: null, max: null },
  { key: '0-100', label: 'Under $100', min: 0, max: 100 },
  { key: '100-300', label: '$100 - $300', min: 100, max: 300 },
  { key: '300-1000', label: '$300 - $1K', min: 300, max: 1000 },
  { key: '1000-5000', label: '$1K - $5K', min: 1000, max: 5000 },
  { key: '5000+', label: '$5K+', min: 5000, max: null },
];

const GAME_TYPES = [
  { key: 'all', label: 'All Games' },
  { key: 'NLH', label: 'NLH' },
  { key: 'PLO', label: 'PLO' },
  { key: 'Mixed', label: 'Mixed' },
  { key: 'HORSE', label: 'HORSE' },
];

const EVENT_TYPES = [
  { key: 'all', label: 'All Events' },
  { key: 'daily', label: 'Daily Tournaments' },
  { key: 'series', label: 'Poker Series' },
  { key: 'tour', label: 'Tour Events' },
];

const SORT_OPTIONS = [
  { key: 'date', label: 'Soonest' },
  { key: 'buyin', label: 'Cheapest' },
  { key: 'buyin_desc', label: 'Most Expensive' },
  { key: 'distance', label: 'Nearest' },
];

const DISTANCE_OPTIONS = [
  { key: '25', label: '25 Mi' },
  { key: '50', label: '50 Mi' },
  { key: '100', label: '100 Mi' },
  { key: '200', label: '200 Mi' },
  { key: '500', label: '500 Mi' },
  { key: 'any', label: 'Anywhere' },
];

const POPULAR_CITIES = [
  'Las Vegas, NV', 'Los Angeles, CA', 'Houston, TX', 'Miami, FL',
  'Chicago, IL', 'Phoenix, AZ', 'Dallas, TX', 'Atlanta, GA',
  'Denver, CO', 'New York, NY', 'Tampa, FL', 'Nashville, TN',
];

const US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA',
  'KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
  'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT',
  'VA','WA','WV','WI','WY','DC',
];

/* ───── Utility Functions ───── */
function formatMoney(amount) {
  if (!amount && amount !== 0) return '--';
  if (amount >= 1000000) return '$' + (amount / 1000000).toFixed(1) + 'M';
  if (amount >= 1000) return '$' + (amount / 1000).toFixed(amount % 1000 === 0 ? 0 : 1) + 'K';
  return '$' + amount.toLocaleString();
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function formatDateFull(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
}

function formatTime(timeStr) {
  if (!timeStr) return '';
  const match24 = timeStr.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (match24) {
    let h = parseInt(match24[1]);
    const m = match24[2];
    const ampm = h >= 12 ? 'PM' : 'AM';
    if (h === 0) h = 12;
    else if (h > 12) h -= 12;
    return `${h}:${m} ${ampm}`;
  }
  return timeStr;
}

function getTodayKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function getDateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function getDaysInMonth(year, month) { return new Date(year, month + 1, 0).getDate(); }
function getFirstDayOfMonth(year, month) { return new Date(year, month, 1).getDay(); }

/* ───── Source Badge Colors ───── */
const SOURCE_COLORS = {
  daily: { bg: 'rgba(0, 212, 255, 0.15)', border: 'rgba(0, 212, 255, 0.4)', text: '#00D4FF', label: 'Daily' },
  series: { bg: 'rgba(168, 85, 247, 0.15)', border: 'rgba(168, 85, 247, 0.4)', text: '#A855F7', label: 'Series' },
  tour: { bg: 'rgba(245, 158, 11, 0.15)', border: 'rgba(245, 158, 11, 0.4)', text: '#F59E0B', label: 'Tour' },
};

/* ───── SVG Icons (no emojis) ───── */
function SearchIcon() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" /></svg>;
}
function MapPinIcon({ size = 14 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></svg>;
}
function CalendarIcon({ size = 16 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>;
}
function ListIcon() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" /><circle cx="3" cy="6" r="1.5" fill="currentColor" /><circle cx="3" cy="12" r="1.5" fill="currentColor" /><circle cx="3" cy="18" r="1.5" fill="currentColor" /></svg>;
}
function FilterIcon() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="4" y1="21" x2="4" y2="14" /><line x1="4" y1="10" x2="4" y2="3" /><line x1="12" y1="21" x2="12" y2="12" /><line x1="12" y1="8" x2="12" y2="3" /><line x1="20" y1="21" x2="20" y2="16" /><line x1="20" y1="12" x2="20" y2="3" /></svg>;
}
function ClockIcon() {
  return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>;
}
function MapIcon() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21 3 6" /><line x1="9" y1="3" x2="9" y2="18" /><line x1="15" y1="6" x2="15" y2="21" /></svg>;
}
function ChevronLeft() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6" /></svg>;
}
function ChevronRight() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6" /></svg>;
}
function XIcon() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>;
}
function CrosshairIcon() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><line x1="22" y1="12" x2="18" y2="12" /><line x1="6" y1="12" x2="2" y2="12" /><line x1="12" y1="6" x2="12" y2="2" /><line x1="12" y1="22" x2="12" y2="18" /></svg>;
}

/* ───── Event Card Component ───── */
const EventCard = memo(function EventCard({ event, isToday, todayKey }) {
  const source = SOURCE_COLORS[event.source] || SOURCE_COLORS.daily;
  const hasDate = !!event.event_date;
  const dateIsToday = event.event_date === todayKey;

  // Link target
  let href = null;
  if (event.venue_id && event.source === 'daily') href = `/hub/venues/${event.venue_id}`;
  else if (event.series_id) href = `/hub/series/${event.series_id}`;
  else if (event.tour_code && event.source === 'tour') href = `/hub/poker-series?tour=${encodeURIComponent(event.tour_code)}`;

  return (
    <div className="ev-card" data-today={dateIsToday ? '1' : ''}>
      <div className="ev-card-left">
        {/* Source badge */}
        <span className="ev-source" style={{ background: source.bg, borderColor: source.border, color: source.text }}>
          {source.label}
        </span>

        {/* Event name */}
        <h3 className="ev-name" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {event.logo_url && (
            <img 
              src={event.logo_url} 
              alt="" 
              style={{ height: '24px', width: '24px', objectFit: 'contain', borderRadius: '4px', flexShrink: 0 }} 
              loading="lazy" 
            />
          )}
          {href ? (
            <Link href={href} className="ev-name-link">{event.event_name || 'Tournament'}</Link>
          ) : (
            event.event_name || 'Tournament'
          )}
        </h3>

        {/* Meta row */}
        <div className="ev-meta">
          {event.venue_name && (
            <span className="ev-meta-item">
              <MapPinIcon />
              {event.venue_id ? (
                <Link href={`/hub/venues/${event.venue_id}`} className="ev-venue-link">{event.venue_name}</Link>
              ) : event.venue_name}
            </span>
          )}
          {(event.city || event.state) && (
            <span className="ev-meta-item ev-location">
              &middot; {[event.city, event.state].filter(Boolean).join(', ')}
            </span>
          )}
          {event.start_time && (
            <span className="ev-meta-item">
              <ClockIcon />
              {formatTime(event.start_time)}
            </span>
          )}
          {event.distance_mi != null && (
            <span className="ev-meta-item ev-distance">
              {event.distance_mi < 1 ? '<1' : Math.round(event.distance_mi)} mi
            </span>
          )}
        </div>

        {/* Tour/Series info */}
        {event.tour_code && (
          <span className="ev-tour-code">{event.tour_code}</span>
        )}
        {event.stop_name && event.source === 'tour' && (
          <span className="ev-stop-name">{event.stop_name}</span>
        )}
      </div>

      <div className="ev-card-right">
        {event.buy_in != null && event.buy_in > 0 && (
          <div className="ev-buyin">{formatMoney(event.buy_in)}</div>
        )}
        {event.buy_in_range && event.source === 'series' && (
          <div className="ev-buyin-range">{event.buy_in_range}</div>
        )}
        {event.guaranteed != null && event.guaranteed > 0 && (
          <div className="ev-gtd">{formatMoney(event.guaranteed)} GTD</div>
        )}
        {event.game_type && event.game_type !== 'Unknown' && (
          <span className="ev-game-type">{event.game_type}</span>
        )}
        {event.events_count && event.source === 'series' && (
          <span className="ev-event-count">{event.events_count} Events</span>
        )}
      </div>
    </div>
  );
});

/* ───── Location Modal ───── */
function LocationModal({ isOpen, onClose, onSetLocation, currentLocation }) {
  const [cityInput, setCityInput] = useState('');
  const [stateInput, setStateInput] = useState('');
  const [gpsLoading, setGpsLoading] = useState(false);
  const [locError, setLocError] = useState(''); // BUG FIX: replace alert() with inline error

  if (!isOpen) return null;

  const isMountedRef = useRef(true);
  useEffect(() => {
    return () => { isMountedRef.current = false; };
  }, []);

  const handleUseGps = () => {
    setLocError('');
    setGpsLoading(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (!isMountedRef.current) return;
        onSetLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude, label: 'My Location (GPS)', source: 'gps' });
        setGpsLoading(false);
        onClose();
      },
      () => {
        if (!isMountedRef.current) return;
        setGpsLoading(false);
        setLocError('GPS not available. Please enter a city.');
      },
      { timeout: 8000 }
    );
  };

  const handleCitySelect = (cityStr) => {
    setLocError('');
    const coords = resolveCityCoords(cityStr);
    if (coords) {
      onSetLocation({ lat: coords.lat, lng: coords.lng, label: cityStr, source: 'city' });
      onClose();
    }
  };

  const handleManualSubmit = (e) => {
    e.preventDefault();
    setLocError('');
    const locationStr = stateInput ? `${cityInput}, ${stateInput}` : cityInput;
    const coords = resolveCityCoords(locationStr);
    if (coords) {
      onSetLocation({ lat: coords.lat, lng: coords.lng, label: locationStr, source: 'manual' });
      onClose();
    } else if (stateInput) {
      // No coords but state selected — use state filter only
      onSetLocation({ lat: null, lng: null, label: stateInput, source: 'state', state: stateInput });
      onClose();
    } else {
      setLocError('City not found. Try selecting from the list or enter a state.');
    }
  };

  return (
    <div className="loc-overlay" onClick={onClose}>
      <div className="loc-modal" onClick={e => e.stopPropagation()}>
        <div className="loc-modal-header">
          <h2>Change Location</h2>
          <button className="loc-close" onClick={onClose}><XIcon /></button>
        </div>

        {/* Inline error — no blocking alert() */}
        {locError && (
          <p style={{ color: '#f87171', fontSize: 13, margin: '0 0 12px', padding: '8px 12px', background: 'rgba(248,113,113,0.1)', borderRadius: 6, border: '1px solid rgba(248,113,113,0.3)' }}>
            {locError}
          </p>
        )}

        {/* GPS Button */}
        <button className="loc-gps-btn" onClick={handleUseGps} disabled={gpsLoading}>
          <CrosshairIcon />
          {gpsLoading ? 'Getting Location...' : 'Use My GPS Location'}
        </button>

        {/* Manual Input */}
        <form className="loc-form" onSubmit={handleManualSubmit}>
          <div className="loc-inputs">
            <input
              type="text"
              placeholder="City Name"
              value={cityInput}
              onChange={e => setCityInput(e.target.value)}
              className="loc-input"
            />
            <select value={stateInput} onChange={e => setStateInput(e.target.value)} className="loc-select">
              <option value="">State</option>
              {US_STATES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <button type="submit" className="loc-submit">Search This Area</button>
        </form>

        {/* Popular Cities */}
        <div className="loc-popular">
          <span className="loc-popular-label">Popular Cities</span>
          <div className="loc-popular-grid">
            {POPULAR_CITIES.map(city => (
              <button key={city} className="loc-city-btn" onClick={() => handleCitySelect(city)}>
                {city}
              </button>
            ))}
          </div>
        </div>

        {currentLocation && (
          <button className="loc-clear" onClick={() => { onSetLocation(null); onClose(); }}>
            Clear Location Filter
          </button>
        )}
      </div>
    </div>
  );
}


export async function getServerSideProps(context) {
  try {
    const protocol = process.env.NODE_ENV === 'production' ? 'https' : 'http';
    const host = context.req.headers.host || 'localhost:3000';
    const url = `${protocol}://${host}/api/poker/events-calendar?dateRange=14days&limit=500`;
    const res = await fetch(url);
    const data = await res.json();
    return { props: { fallbackData: data?.success ? data : null } };
  } catch (err) {
    return { props: { fallbackData: null } };
  }
}

/* ───── Main Page Component ───── */
export default function EventsCalendarPage({ fallbackData }) {
  const router = useRouter(); // BUG FIX: use router.push instead of window.location.href
  const now = new Date();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuConfig = useMemo(() => getMenuConfig(), []);
  
  // View states: 'list' | 'calendar' | 'map'
  const [viewMode, setViewMode] = useState('list');
  const [calYear, setCalYear] = useState(now.getFullYear());
  const [calMonth, setCalMonth] = useState(now.getMonth());
  const [selectedCalDate, setSelectedCalDate] = useState(null);
  const [showFilters, setShowFilters] = useState(false);
  const [showLocationModal, setShowLocationModal] = useState(false);

  // Filters
  const [dateRange, setDateRange] = useState('14days');
  const [buyInTier, setBuyInTier] = useState('all');
  const [gameType, setGameType] = useState('all');
  const [eventType, setEventType] = useState('all');
  const [sortBy, setSortBy] = useState('date');
  const [searchQuery, setSearchQuery] = useState('');
  const [distance, setDistance] = useState('any');

  // Location
  const [userLocation, setUserLocation] = useState(null);

  // Pagination
  const [visibleCount, setVisibleCount] = useState(50);
  const loadMoreRef = useRef(null);

  const todayKey = getTodayKey();

  // Try GPS on mount
  useEffect(() => {
    let isMounted = true;
    if (typeof navigator !== 'undefined' && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          if (!isMounted) return;
          setUserLocation({
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            label: 'My Location',
            source: 'gps',
          });
        },
        () => { /* GPS not available, no problem */ },
        { timeout: 5000 }
      );
    }
    return () => { isMounted = false; };
  }, []);

  // Build API URL from filters
  const apiUrl = useMemo(() => {
    const params = new URLSearchParams();
    params.set('dateRange', dateRange);
    params.set('limit', '500');
    if (eventType !== 'all') params.set('eventType', eventType);
    if (gameType !== 'all') params.set('gameType', gameType);
    if (sortBy) params.set('sort', sortBy);
    if (searchQuery) params.set('search', searchQuery);

    const buyInConfig = BUY_IN_TIERS.find(t => t.key === buyInTier);
    if (buyInConfig?.min != null) params.set('minBuyin', buyInConfig.min);
    if (buyInConfig?.max != null) params.set('maxBuyin', buyInConfig.max);

    if (userLocation?.lat && userLocation?.lng) {
      params.set('lat', userLocation.lat);
      params.set('lng', userLocation.lng);
      if (distance !== 'any') params.set('radius', distance);
    }
    if (userLocation?.state) {
      params.set('state', userLocation.state);
    }

    return `/api/poker/events-calendar?${params.toString()}`;
  }, [dateRange, buyInTier, gameType, eventType, sortBy, searchQuery, userLocation, distance]);

  // SWR-backed data fetch (with SSR fallback)
  const { data: apiData, error, isLoading: loading, mutate } = useSWR(
    apiUrl,
    (url) => fetch(url).then(r => r.json()).then(data => {
      if (data && data.success === false) throw new Error(data.error || 'Failed to fetch API events');
      return data;
    }),
    { fallbackData, revalidateOnFocus: false, dedupingInterval: 30000 }
  );

  // Bind realtime venue and tournament updates to cache invalidation
  // Punches through the 60s S-Maxage Edge Cache securely using a monotonic _rt query parameter
  // and injects the bypassed result directly into SWR.
  useVenueRealtime(() => {
    const rtUrl = `${apiUrl}${apiUrl.includes('?') ? '&' : '?'}_rt=${Date.now()}`;
    fetch(rtUrl)
      .then(r => r.json())
      .then(d => {
        if (d && d.success !== false) mutate(d, false);
      })
      .catch(console.error);
  });

  const events = apiData?.events || [];
  const totalCount = apiData?.total || 0;
  const dateCounts = apiData?.dateCounts || {};
  const stats = apiData?.stats || {};

  // Reset visible count when filters change
  useEffect(() => { setVisibleCount(50); }, [apiUrl]);

  // Count active filters
  const activeFilterCount = [
    dateRange !== '14days',
    buyInTier !== 'all',
    gameType !== 'all',
    eventType !== 'all',
    distance !== 'any',
  ].filter(Boolean).length;

  // Group events by date for list view
  const dateGroups = useMemo(() => {
    const groups = {};
    const order = [];
    const visible = events.slice(0, visibleCount);
    for (const evt of visible) {
      const dk = evt.event_date || 'undated';
      if (!groups[dk]) {
        groups[dk] = [];
        order.push(dk);
      }
      groups[dk].push(evt);
    }
    return { groups, order };
  }, [events, visibleCount]);

  // Calendar grid data
  const calendarCells = useMemo(() => {
    const daysInMonth = getDaysInMonth(calYear, calMonth);
    const firstDay = getFirstDayOfMonth(calYear, calMonth);
    const cells = [];
    for (let i = 0; i < firstDay; i++) cells.push({ day: null, key: `empty-${i}` });
    for (let d = 1; d <= daysInMonth; d++) {
      const dateKey = `${calYear}-${String(calMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      cells.push({ day: d, dateKey, count: dateCounts[dateKey] || 0, isToday: dateKey === todayKey, key: dateKey });
    }
    return cells;
  }, [calYear, calMonth, dateCounts, todayKey]);

  const selectedCalEvents = useMemo(() => {
    if (!selectedCalDate) return [];
    return events.filter(e => e.event_date === selectedCalDate);
  }, [events, selectedCalDate]);

  // Aggregate events by venue for Map View
  const mapEvents = useMemo(() => {
    const venueMap = {};
    events.forEach(e => {
      // Must have location
      if (!e.latitude || !e.longitude) return;
      const vKey = e.venue_name || e.event_name;
      if (!vKey) return;

      if (!venueMap[vKey]) {
        // Create pseudo-venue object for VenueMap
        venueMap[vKey] = {
          id: e.venue_id || e.series_id || e.tour_event_id || Math.random().toString(),
          name: vKey,
          venue_type: (e.source === 'series' || e.source === 'tour') ? 'poker_tour' : 'card_room',
          tour_code: e.tour_code,
          logo_url: e.logo_url,
          latitude: e.latitude,
          longitude: e.longitude,
          city: e.city,
          state: e.state,
          trust_score: 5,
        };
      }
    });
    return Object.values(venueMap);
  }, [events]);

  // Clear all filters
  const clearFilters = () => {
    setDateRange('14days');
    setBuyInTier('all');
    setGameType('all');
    setEventType('all');
    setSortBy('date');
    setSearchQuery('');
    setDistance('any');
  };

  const handleLocationChange = (loc) => {
    setUserLocation(loc);
    if (loc?.lat && distance === 'any') setDistance('100');
  };

  // Month navigation
  const goToPrevMonth = () => {
    setSelectedCalDate(null);
    if (calMonth === 0) { setCalMonth(11); setCalYear(calYear - 1); } else setCalMonth(calMonth - 1);
  };
  const goToNextMonth = () => {
    setSelectedCalDate(null);
    if (calMonth === 11) { setCalMonth(0); setCalYear(calYear + 1); } else setCalMonth(calMonth + 1);
  };
  const goToToday = () => {
    const t = new Date();
    setCalYear(t.getFullYear());
    setCalMonth(t.getMonth());
    setSelectedCalDate(todayKey);
  };

  // Search debounce with unmount cleanup
  const searchTimeoutRef = useRef(null);
  const [searchInput, setSearchInput] = useState('');
  // BUG FIX: clear timeout on unmount to prevent setState on unmounted component
  useEffect(() => { return () => { if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current); }; }, []);
  const handleSearchInput = (val) => {
    setSearchInput(val);
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = setTimeout(() => setSearchQuery(val), 400);
  };

  return (
    <>
      <SEOHead
        title="Poker Events Calendar — Find Any Tournament"
        description="Search Thousands Of Poker Tournaments By Date, Location, Buy-In, And Game Type. Daily Tournaments, Series Events, And Tour Stops — All In One Place."
        canonical="/hub/events-calendar"
      />
      <UniversalHeader pageDepth={2} onMenuClick={() => setMenuOpen(true)} onBackClick={() => router.push('/hub/poker-near-me-lobby')} />
      <HamburgerMenu
        isOpen={menuOpen}
        onClose={() => setMenuOpen(false)}
        direction="right"
        theme="dark"
        menuItems={menuConfig.menuItems}
        bottomLinks={menuConfig.bottomLinks}
      />

      <div className="ec-page">
        <div className="ec-space-bg" />
        <div className="ec-space-overlay" />

        {/* ── Page Header ── */}
        <div className="ec-hero">
          <h1 className="ec-title"><span className="ec-white">EVENTS</span> <span className="ec-cyan">CALENDAR</span></h1>
          <p className="ec-subtitle">
            {loading ? 'Loading...' : `${totalCount.toLocaleString()} Tournaments Found`}
            {stats.sources && !loading && (
              <span className="ec-source-counts">
                {stats.sources.daily > 0 && <span>{stats.sources.daily.toLocaleString()} Daily</span>}
                {stats.sources.series > 0 && <span>{stats.sources.series.toLocaleString()} Series</span>}
                {stats.sources.tour > 0 && <span>{stats.sources.tour.toLocaleString()} Tour</span>}
              </span>
            )}
          </p>
        </div>

        {/* ── Location Bar ── */}
        <div className="ec-location-bar">
          <button className="ec-location-btn" onClick={() => setShowLocationModal(true)}>
            <MapPinIcon size={16} />
            <span>{userLocation?.label || 'Set Location'}</span>
          </button>
          {userLocation && (
            <div className="ec-distance-pills">
              {DISTANCE_OPTIONS.map(d => (
                <button
                  key={d.key}
                  className={`ec-pill ${distance === d.key ? 'active' : ''}`}
                  onClick={() => setDistance(d.key)}
                >
                  {d.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* ── Search + View Toggle ── */}
        <div className="ec-search-bar">
          <div className="ec-search-wrap">
            <SearchIcon />
            <input
              type="text"
              placeholder="Search Venue, Event, Or Series Name"
              value={searchInput}
              onChange={e => handleSearchInput(e.target.value)}
              className="ec-search-input"
            />
            {searchInput && (
              <button className="ec-search-clear" onClick={() => { setSearchInput(''); setSearchQuery(''); }}>
                <XIcon />
              </button>
            )}
          </div>
          <div className="ec-toolbar">
            <button className={`ec-filter-btn ${showFilters ? 'active' : ''}`} onClick={() => setShowFilters(!showFilters)}>
              <FilterIcon />
              <span>Filters</span>
              {activeFilterCount > 0 && <span className="ec-filter-badge">{activeFilterCount}</span>}
            </button>
            <div className="ec-view-toggle">
              <button className={`ec-vt-btn ${viewMode === 'list' ? 'active' : ''}`} onClick={() => setViewMode('list')} title="List View">
                <ListIcon />
              </button>
              <button className={`ec-vt-btn ${viewMode === 'calendar' ? 'active' : ''}`} onClick={() => setViewMode('calendar')} title="Calendar View">
                <CalendarIcon size={16} />
              </button>
              <button className={`ec-vt-btn ${viewMode === 'map' ? 'active' : ''}`} onClick={() => setViewMode('map')} title="Map View">
                <MapIcon />
              </button>
            </div>
          </div>
        </div>

        {/* ── Filters Panel ── */}
        {showFilters && (
          <div className="ec-filters">
            <div className="ec-filter-group">
              <label>Date Range</label>
              <select className="ec-dropdown" value={dateRange} onChange={e => setDateRange(e.target.value)}>
                {DATE_RANGES.map(r => (
                  <option key={r.key} value={r.key}>{r.label}</option>
                ))}
              </select>
            </div>
            <div className="ec-filter-group">
              <label>Event Type</label>
              <select className="ec-dropdown" value={eventType} onChange={e => setEventType(e.target.value)}>
                {EVENT_TYPES.map(t => (
                  <option key={t.key} value={t.key}>{t.label}</option>
                ))}
              </select>
            </div>
            <div className="ec-filter-group">
              <label>Buy-In</label>
              <select className="ec-dropdown" value={buyInTier} onChange={e => setBuyInTier(e.target.value)}>
                {BUY_IN_TIERS.map(t => (
                  <option key={t.key} value={t.key}>{t.label}</option>
                ))}
              </select>
            </div>
            <div className="ec-filter-group">
              <label>Game Type</label>
              <select className="ec-dropdown" value={gameType} onChange={e => setGameType(e.target.value)}>
                {GAME_TYPES.map(g => (
                  <option key={g.key} value={g.key}>{g.label}</option>
                ))}
              </select>
            </div>
            <div className="ec-filter-group">
              <label>Sort By</label>
              <select className="ec-dropdown" value={sortBy} onChange={e => setSortBy(e.target.value)}>
                {SORT_OPTIONS.map(s => (
                  <option key={s.key} value={s.key}>{s.label}</option>
                ))}
              </select>
            </div>
            <div className="ec-filter-actions">
              <button className="ec-clear-btn" onClick={clearFilters}>Clear All Filters</button>
            </div>
          </div>
        )}

        {/* ── Content ── */}
        <div className="ec-content">
          {loading && (
            <div className="ec-loading">
              <div className="ec-spinner" />
              <p>Finding Tournaments...</p>
            </div>
          )}

          {error && !loading && (
            <div className="ec-error">
              <p>Failed To Load Events</p>
              <p className="ec-error-detail">{error?.message || 'Unknown error'}</p>
            </div>
          )}

          {/* ── MAP VIEW ── */}
          {!loading && !error && viewMode === 'map' && (
            <div className="ec-map-view" style={{ marginTop: '16px', borderRadius: '16px', overflow: 'hidden', height: 'calc(100vh - 280px)', minHeight: '600px', border: '1px solid rgba(255,255,255,0.1)' }}>
              <VenueMap 
                venues={mapEvents}
                userLocation={userLocation}
                fullHeight={true}
                hideLegend={false}
                uniformColor={true}
              />
            </div>
          )}

          {/* ── LIST VIEW ── */}
          {!loading && !error && viewMode === 'list' && (
            <div className="ec-list">
              {events.length === 0 ? (
                <div className="ec-empty">
                  <CalendarIcon size={40} />
                  <p className="ec-empty-title">No Tournaments Found</p>
                  <p className="ec-empty-sub">Try Adjusting Your Filters Or Expanding Your Search Area.</p>
                  <button className="ec-empty-btn" onClick={clearFilters}>Clear All Filters</button>
                </div>
              ) : (
                <>
                  {dateGroups.order.map(dk => (
                    <div key={dk} className="ec-date-group">
                      <div className={`ec-date-header ${dk === todayKey ? 'today' : ''}`}>
                        <span className="ec-date-label">
                          {dk === todayKey ? 'Today' : dk === 'undated' ? 'Date TBD' : formatDate(dk)}
                        </span>
                        <span className="ec-date-count">{dateGroups.groups[dk].length}</span>
                      </div>
                      {dateGroups.groups[dk].map((evt, idx) => {
                        const uniqueKey = `${dk}-${evt.source}-${evt.venue_id || evt.series_id || evt.tour_event_id || 'base'}-${idx}`;
                        return (
                          <LazyRender key={uniqueKey}>
                            <EventCard event={evt} todayKey={todayKey} />
                          </LazyRender>
                        );
                      })}
                    </div>
                  ))}

                  {visibleCount < events.length && (
                    <button className="ec-load-more" onClick={() => setVisibleCount(v => v + 50)}>
                      Show More ({events.length - visibleCount} Remaining)
                    </button>
                  )}
                </>
              )}
            </div>
          )}

          {/* ── CALENDAR VIEW ── */}
          {!loading && !error && viewMode === 'calendar' && (
            <div className="ec-calendar">
              <div className="ec-month-nav">
                <button className="ec-nav-btn" onClick={goToPrevMonth}><ChevronLeft /></button>
                <h2 className="ec-month-label">{MONTH_NAMES[calMonth]} {calYear}</h2>
                <button className="ec-nav-btn" onClick={goToNextMonth}><ChevronRight /></button>
                <button className="ec-today-btn" onClick={goToToday}>Today</button>
              </div>

              <div className="ec-grid-header">
                {DAYS_SHORT.map(d => <div key={d} className="ec-day-hdr">{d}</div>)}
              </div>

              <div className="ec-grid">
                {calendarCells.map(cell => (
                  <div
                    key={cell.key}
                    className={`ec-cell ${cell.day ? 'has-day' : 'empty'} ${cell.isToday ? 'today' : ''} ${cell.dateKey === selectedCalDate ? 'selected' : ''}`}
                    onClick={() => { if (cell.day) setSelectedCalDate(cell.dateKey === selectedCalDate ? null : cell.dateKey); }}
                  >
                    {cell.day && (
                      <>
                        <span className={`ec-day-num ${cell.isToday ? 'today' : ''}`}>{cell.day}</span>
                        {cell.count > 0 && (
                          <div className="ec-dot-row">
                            {Array.from({ length: Math.min(cell.count, 3) }).map((_, i) => (
                              <span key={i} className="ec-dot" />
                            ))}
                            {cell.count > 3 && <span className="ec-dot-more">+{cell.count - 3}</span>}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                ))}
              </div>

              {selectedCalDate && (
                <div className="ec-cal-events">
                  <h3 className="ec-cal-events-title">
                    {formatDateFull(selectedCalDate)}
                    <span className="ec-cal-events-count">{selectedCalEvents.length} event{selectedCalEvents.length !== 1 ? 's' : ''}</span>
                  </h3>
                  {selectedCalEvents.length === 0 ? (
                    <p className="ec-cal-no-events">No events scheduled for this date.</p>
                  ) : (
                    selectedCalEvents.map((evt, idx) => (
                      <LazyRender key={idx}>
                        <EventCard event={evt} todayKey={todayKey} />
                      </LazyRender>
                    ))
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Location Modal */}
      <LocationModal
        isOpen={showLocationModal}
        onClose={() => setShowLocationModal(false)}
        onSetLocation={handleLocationChange}
        currentLocation={userLocation}
      />

      <style jsx global>{`
        /* ═══ BASE ═══ */
        .ec-page {
          min-height: 100vh; padding-bottom: 70px;
          position: relative;
          color: #fff;
          font-family: 'Rajdhani', 'Inter', -apple-system, sans-serif;
          overflow-x: hidden;
        }
        .ec-space-bg {
          position: fixed; inset: 0; z-index: -2;
          background:
            radial-gradient(ellipse at 20% 20%, rgba(59, 130, 246, 0.15) 0%, transparent 50%),
            radial-gradient(ellipse at 80% 80%, rgba(139, 92, 246, 0.1) 0%, transparent 50%),
            radial-gradient(ellipse at 50% 50%, rgba(6, 182, 212, 0.08) 0%, transparent 60%),
            linear-gradient(180deg, #030712 0%, #0a1628 30%, #0f172a 50%, #0a1628 70%, #030712 100%);
        }
        .ec-space-overlay {
          position: fixed; inset: 0; z-index: -1;
          background: linear-gradient(180deg, rgba(3,7,18,0.3) 0%, transparent 20%, transparent 80%, rgba(3,7,18,0.5) 100%);
        }

        /* ═══ HERO ═══ */
        .ec-hero { padding: 24px 20px 12px; text-align: center; }
        .ec-title {
          font-family: 'Orbitron', 'Rajdhani', sans-serif;
          font-size: 26px; font-weight: 700; margin: 0;
          letter-spacing: 2px; text-transform: uppercase;
          text-shadow: 0 0 20px rgba(0,212,255,0.3);
        }
        .ec-white { color: #fff; }
        .ec-cyan { color: #00D4FF; text-shadow: 0 0 15px rgba(0,212,255,0.6); }
        .ec-subtitle { font-size: 14px; color: rgba(255,255,255,0.5); margin: 8px 0 0; }
        .ec-source-counts {
          display: flex; gap: 12px; justify-content: center; margin-top: 4px;
          font-size: 12px; color: rgba(255,255,255,0.35);
        }
        .ec-source-counts span::before { content: ''; display: inline-block; width: 6px; height: 6px; border-radius: 50%; margin-right: 4px; vertical-align: middle; }
        .ec-source-counts span:nth-child(1)::before { background: #00D4FF; }
        .ec-source-counts span:nth-child(2)::before { background: #A855F7; }
        .ec-source-counts span:nth-child(3)::before { background: #F59E0B; }

        /* ═══ LOCATION BAR ═══ */
        .ec-location-bar {
          max-width: 900px; margin: 0 auto; padding: 0 20px 12px;
          display: flex; align-items: center; gap: 12px; flex-wrap: wrap;
        }
        .ec-location-btn {
          display: flex; align-items: center; gap: 8px;
          padding: 10px 16px;
          background: rgba(0, 212, 255, 0.1); border: 1px solid rgba(0, 212, 255, 0.3);
          border-radius: 10px; color: #00D4FF; font-size: 14px; font-weight: 600;
          cursor: pointer; transition: all 0.2s; font-family: inherit;
        }
        .ec-location-btn:hover { background: rgba(0, 212, 255, 0.2); border-color: rgba(0, 212, 255, 0.5); }
        .ec-distance-pills { display: flex; gap: 4px; flex-wrap: wrap; }
        .ec-pill {
          padding: 6px 12px; border-radius: 16px; font-size: 12px; font-weight: 600;
          background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.12);
          color: rgba(255,255,255,0.6); cursor: pointer; transition: all 0.15s; font-family: inherit;
        }
        .ec-pill:hover { background: rgba(255,255,255,0.1); }
        .ec-pill.active { background: rgba(0,212,255,0.15); border-color: rgba(0,212,255,0.4); color: #00D4FF; }

        /* ═══ SEARCH BAR ═══ */
        .ec-search-bar {
          max-width: 900px; margin: 0 auto; padding: 0 20px 12px;
          display: flex; gap: 10px; align-items: stretch; flex-wrap: wrap;
        }
        .ec-search-wrap {
          flex: 1; min-width: 200px; position: relative; display: flex; align-items: center;
          background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.15);
          border-radius: 12px; padding: 0 14px; transition: all 0.2s;
        }
        .ec-search-wrap:focus-within { border-color: rgba(0,212,255,0.5); box-shadow: 0 0 0 3px rgba(0,212,255,0.1); }
        .ec-search-wrap svg { color: rgba(255,255,255,0.4); flex-shrink: 0; }
        .ec-search-input {
          flex: 1; padding: 12px 10px; background: none; border: none; color: #fff;
          font-size: 14px; outline: none; font-family: inherit;
        }
        .ec-search-input::placeholder { color: rgba(255,255,255,0.35); }
        .ec-search-clear {
          background: none; border: none; color: rgba(255,255,255,0.4); cursor: pointer; padding: 4px;
          display: flex; align-items: center;
        }
        .ec-toolbar { display: flex; gap: 8px; align-items: center; }
        .ec-filter-btn {
          display: flex; align-items: center; gap: 6px;
          padding: 10px 14px; background: rgba(0,0,0,0.3);
          border: 1px solid rgba(255,255,255,0.15); border-radius: 10px;
          color: rgba(255,255,255,0.7); font-size: 13px; font-weight: 600;
          cursor: pointer; transition: all 0.2s; font-family: inherit;
        }
        .ec-filter-btn:hover { background: rgba(255,255,255,0.1); }
        .ec-filter-btn.active { background: rgba(0,212,255,0.15); border-color: rgba(0,212,255,0.4); color: #00D4FF; }
        .ec-filter-badge {
          background: #00D4FF; color: #000; font-size: 11px; font-weight: 700;
          min-width: 18px; height: 18px; border-radius: 9px;
          display: inline-flex; align-items: center; justify-content: center; padding: 0 4px;
        }
        .ec-view-toggle {
          display: flex; gap: 2px; background: rgba(0,0,0,0.3);
          border: 1px solid rgba(255,255,255,0.12); border-radius: 10px; padding: 3px;
        }
        .ec-vt-btn {
          padding: 8px 10px; border: none; border-radius: 7px;
          background: transparent; color: rgba(255,255,255,0.5);
          cursor: pointer; transition: all 0.15s; display: flex; align-items: center;
        }
        .ec-vt-btn.active { background: rgba(0,212,255,0.2); color: #00D4FF; }

        /* ═══ FILTERS ═══ */
        .ec-filters {
          max-width: 900px; margin: 0 auto 12px; padding: 16px 20px;
          background: rgba(15, 23, 42, 0.8); backdrop-filter: blur(12px);
          border: 1px solid rgba(255,255,255,0.1); border-radius: 14px;
          margin-left: 20px; margin-right: 20px;
        }
        .ec-filter-group { margin-bottom: 14px; }
        .ec-filter-group:last-of-type { margin-bottom: 8px; }
        .ec-filter-group label {
          display: block; font-size: 11px; color: rgba(255,255,255,0.45);
          text-transform: uppercase; letter-spacing: 1px; margin-bottom: 8px; font-weight: 600;
        }
        .ec-dropdown {
          width: 100%; padding: 10px 14px; background: rgba(0,0,0,0.3);
          border: 1px solid rgba(255,255,255,0.15); border-radius: 8px;
          color: #fff; font-size: 14px; outline: none; font-family: inherit;
          appearance: none; cursor: pointer; transition: all 0.2s;
          background-image: url("data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22292.4%22%20height%3D%22292.4%22%3E%3Cpath%20fill%3D%22%23ffffff%22%20d%3D%22M287%2069.4a17.6%2017.6%200%200%200-13-5.4H18.4c-5%200-9.3%201.8-12.9%205.4A17.6%2017.6%200%200%200%200%2082.2c0%205%201.8%209.3%205.4%2012.9l128%20127.9c3.6%203.6%207.8%205.4%2012.8%205.4s9.2-1.8%2012.8-5.4L287%2095c3.5-3.5%205.4-7.8%205.4-12.8%200-5-1.9-9.2-5.5-12.8z%22%2F%3E%3C%2Fsvg%3E");
          background-repeat: no-repeat; background-position: right 14px center; background-size: 10px auto;
        }
        .ec-dropdown:hover { border-color: rgba(255,255,255,0.3); }
        .ec-dropdown:focus { border-color: #00D4FF; box-shadow: 0 0 0 1px rgba(0,212,255,0.5); }
        .ec-dropdown option { background: #0f172a; color: #fff; }
        .ec-filter-actions { display: flex; justify-content: flex-end; margin-top: 20px; }
        .ec-clear-btn {
          padding: 8px 16px; background: none; border: 1px solid rgba(255,255,255,0.15);
          border-radius: 8px; color: rgba(255,255,255,0.6); font-size: 12px; font-weight: 600;
          cursor: pointer; transition: all 0.15s; font-family: inherit;
        }
        .ec-clear-btn:hover { border-color: rgba(255,255,255,0.3); color: #fff; }

        /* ═══ CONTENT ═══ */
        .ec-content { max-width: 900px; margin: 0 auto; padding: 0 20px; }

        /* Loading / Error / Empty */
        .ec-loading {
          display: flex; flex-direction: column; align-items: center; padding: 80px 20px;
          color: rgba(255,255,255,0.5);
        }
        .ec-spinner {
          width: 40px; height: 40px; border: 3px solid rgba(255,255,255,0.1);
          border-top-color: #00D4FF; border-radius: 50%;
          animation: ec-spin 0.8s linear infinite;
        }
        @keyframes ec-spin { to { transform: rotate(360deg); } }
        .ec-loading p { margin-top: 12px; font-size: 14px; }
        .ec-error { text-align: center; padding: 60px 20px; color: #f87171; }
        .ec-error-detail { color: rgba(255,255,255,0.4); font-size: 13px; margin-top: 4px; }
        .ec-empty {
          text-align: center; padding: 60px 20px;
          display: flex; flex-direction: column; align-items: center; color: rgba(255,255,255,0.4);
        }
        .ec-empty-title { font-size: 18px; font-weight: 600; color: rgba(255,255,255,0.6); margin: 16px 0 6px; }
        .ec-empty-sub { font-size: 13px; margin: 0 0 16px; }
        .ec-empty-btn {
          padding: 10px 24px; background: rgba(0,212,255,0.15); border: 1px solid rgba(0,212,255,0.3);
          border-radius: 10px; color: #00D4FF; font-size: 13px; font-weight: 600;
          cursor: pointer; font-family: inherit;
        }

        /* ═══ LIST VIEW ═══ */
        .ec-date-group { margin-bottom: 20px; }
        .ec-date-header {
          display: flex; align-items: center; justify-content: space-between;
          padding: 8px 0; margin-bottom: 8px;
          border-bottom: 1px solid rgba(255,255,255,0.1);
        }
        .ec-date-header.today { border-bottom-color: rgba(0,212,255,0.4); }
        .ec-date-label {
          font-size: 15px; font-weight: 700; color: rgba(255,255,255,0.8);
          text-transform: uppercase; letter-spacing: 0.5px;
        }
        .ec-date-header.today .ec-date-label { color: #00D4FF; }
        .ec-date-count {
          font-size: 12px; color: rgba(255,255,255,0.4); font-weight: 600;
          background: rgba(255,255,255,0.06); padding: 2px 10px; border-radius: 10px;
        }
        .ec-load-more {
          display: block; width: 100%; padding: 14px; margin: 12px 0;
          background: rgba(0,212,255,0.08); border: 1px solid rgba(0,212,255,0.2);
          border-radius: 10px; color: #00D4FF; font-size: 14px; font-weight: 600;
          cursor: pointer; font-family: inherit; transition: all 0.2s;
        }
        .ec-load-more:hover { background: rgba(0,212,255,0.15); }

        /* ═══ EVENT CARD ═══ */
        .ev-card {
          display: flex; justify-content: space-between; gap: 12px;
          padding: 14px 16px; margin-bottom: 6px;
          background: rgba(15, 23, 42, 0.5); backdrop-filter: blur(8px);
          border: 1px solid rgba(255,255,255,0.08); border-radius: 12px;
          transition: all 0.15s;
        }
        .ev-card:hover { background: rgba(15, 23, 42, 0.7); border-color: rgba(255,255,255,0.15); }
        .ev-card[data-today="1"] { border-color: rgba(0,212,255,0.3); }
        .ev-card-left { flex: 1; min-width: 0; }
        .ev-card-right { flex-shrink: 0; text-align: right; display: flex; flex-direction: column; align-items: flex-end; gap: 4px; }
        .ev-source {
          display: inline-block; font-size: 10px; font-weight: 700;
          padding: 2px 8px; border-radius: 4px; border: 1px solid;
          text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px;
        }
        .ev-name { margin: 0; font-size: 14px; font-weight: 600; color: #fff; line-height: 1.3; }
        .ev-name-link { color: #fff; text-decoration: none; }
        .ev-name-link:hover { color: #00D4FF; }
        .ev-meta { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 6px; }
        .ev-meta-item {
          display: flex; align-items: center; gap: 4px;
          font-size: 12px; color: rgba(255,255,255,0.5);
        }
        .ev-venue-link { color: rgba(0,212,255,0.8); text-decoration: none; font-weight: 500; }
        .ev-venue-link:hover { color: #00D4FF; text-decoration: underline; }
        .ev-location { color: rgba(255,255,255,0.35); }
        .ev-distance { color: rgba(0,212,255,0.7); font-weight: 600; }
        .ev-tour-code {
          display: inline-block; margin-top: 4px; font-size: 10px; font-weight: 700;
          color: rgba(245,158,11,0.8); background: rgba(245,158,11,0.1);
          padding: 1px 6px; border-radius: 3px;
        }
        .ev-stop-name { font-size: 11px; color: rgba(255,255,255,0.35); margin-top: 2px; display: block; }
        .ev-buyin { font-size: 16px; font-weight: 700; color: #fff; }
        .ev-buyin-range { font-size: 12px; color: rgba(168,85,247,0.8); font-weight: 600; }
        .ev-gtd { font-size: 12px; font-weight: 600; color: #22c55e; }
        .ev-game-type {
          font-size: 11px; font-weight: 700; color: rgba(255,255,255,0.5);
          background: rgba(255,255,255,0.06); padding: 2px 8px; border-radius: 4px;
        }
        .ev-event-count { font-size: 11px; color: rgba(168,85,247,0.6); }

        /* ═══ CALENDAR VIEW ═══ */
        .ec-calendar { }
        .ec-month-nav {
          display: flex; align-items: center; justify-content: center; gap: 14px; margin-bottom: 16px;
        }
        .ec-nav-btn {
          display: flex; align-items: center; justify-content: center;
          width: 36px; height: 36px; border: 1px solid rgba(255,255,255,0.15);
          border-radius: 8px; background: rgba(0,0,0,0.3); color: rgba(255,255,255,0.7);
          cursor: pointer; transition: all 0.15s;
        }
        .ec-nav-btn:hover { border-color: rgba(0,212,255,0.4); color: #00D4FF; }
        .ec-month-label {
          font-size: 20px; font-weight: 700; color: #fff; margin: 0;
          min-width: 200px; text-align: center;
        }
        .ec-today-btn {
          padding: 6px 14px; border: 1px solid rgba(0,212,255,0.3);
          border-radius: 6px; background: rgba(0,212,255,0.1); color: #00D4FF;
          font-size: 12px; font-weight: 600; cursor: pointer; font-family: inherit;
        }
        .ec-grid-header { display: grid; grid-template-columns: repeat(7, 1fr); gap: 1px; margin-bottom: 4px; }
        .ec-day-hdr {
          text-align: center; font-size: 12px; font-weight: 600;
          color: rgba(255,255,255,0.4); padding: 8px 0;
          text-transform: uppercase; letter-spacing: 0.04em;
        }
        .ec-grid {
          display: grid; grid-template-columns: repeat(7, 1fr); gap: 2px;
          background: rgba(0,0,0,0.2); border: 1px solid rgba(255,255,255,0.08);
          border-radius: 12px; overflow: hidden;
        }
        .ec-cell {
          min-height: 72px; padding: 6px;
          background: rgba(15,23,42,0.4); border: 1px solid transparent;
          display: flex; flex-direction: column; align-items: center;
          cursor: default; transition: background 0.12s;
        }
        .ec-cell.has-day { cursor: pointer; }
        .ec-cell.has-day:hover { background: rgba(255,255,255,0.06); }
        .ec-cell.today { background: rgba(0,212,255,0.06); }
        .ec-cell.selected { background: rgba(0,212,255,0.1); border-color: rgba(0,212,255,0.3); }
        .ec-cell.empty { background: rgba(0,0,0,0.15); }
        .ec-day-num {
          font-size: 13px; font-weight: 500; color: rgba(255,255,255,0.7);
          width: 28px; height: 28px; display: flex; align-items: center; justify-content: center;
          border-radius: 50%;
        }
        .ec-day-num.today { background: #00D4FF; color: #000; font-weight: 700; }
        .ec-dot-row { display: flex; align-items: center; gap: 3px; margin-top: 4px; flex-wrap: wrap; justify-content: center; }
        .ec-dot { width: 5px; height: 5px; border-radius: 50%; background: #00D4FF; }
        .ec-dot-more { font-size: 9px; font-weight: 600; color: rgba(255,255,255,0.4); }
        .ec-cal-events {
          margin-top: 20px; padding: 16px;
          background: rgba(15,23,42,0.5); border: 1px solid rgba(255,255,255,0.1);
          border-radius: 12px;
        }
        .ec-cal-events-title {
          font-size: 16px; font-weight: 700; color: #fff; margin: 0 0 12px;
          display: flex; align-items: center; gap: 10px;
        }
        .ec-cal-events-count { font-size: 13px; font-weight: 500; color: rgba(255,255,255,0.4); }
        .ec-cal-no-events { color: rgba(255,255,255,0.4); font-size: 13px; padding: 12px 0; }

        /* ═══ LOCATION MODAL ═══ */
        .loc-overlay {
          position: fixed; inset: 0; z-index: 1000;
          background: rgba(0,0,0,0.7); backdrop-filter: blur(4px);
          display: flex; align-items: center; justify-content: center; padding: 20px;
        }
        .loc-modal {
          background: #0f172a; border: 1px solid rgba(255,255,255,0.15);
          border-radius: 16px; padding: 24px; width: 100%; max-width: 480px;
          max-height: 90vh; overflow-y: auto;
        }
        .loc-modal-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
        .loc-modal-header h2 { margin: 0; font-size: 20px; font-weight: 700; color: #fff; }
        .loc-close { background: none; border: none; color: rgba(255,255,255,0.5); cursor: pointer; padding: 4px; }
        .loc-gps-btn {
          width: 100%; padding: 14px; display: flex; align-items: center; justify-content: center; gap: 8px;
          background: rgba(0,212,255,0.1); border: 1px solid rgba(0,212,255,0.3);
          border-radius: 10px; color: #00D4FF; font-size: 14px; font-weight: 600;
          cursor: pointer; font-family: inherit; margin-bottom: 16px; transition: all 0.2s;
        }
        .loc-gps-btn:hover { background: rgba(0,212,255,0.2); }
        .loc-gps-btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .loc-form { margin-bottom: 20px; }
        .loc-inputs { display: flex; gap: 8px; margin-bottom: 10px; }
        .loc-input {
          flex: 1; padding: 12px 14px; background: rgba(0,0,0,0.3);
          border: 1px solid rgba(255,255,255,0.15); border-radius: 8px;
          color: #fff; font-size: 14px; outline: none; font-family: inherit;
        }
        .loc-input:focus { border-color: rgba(0,212,255,0.4); }
        .loc-input::placeholder { color: rgba(255,255,255,0.35); }
        .loc-select {
          width: 90px; padding: 12px 8px; background: rgba(0,0,0,0.3);
          border: 1px solid rgba(255,255,255,0.15); border-radius: 8px;
          color: #fff; font-size: 14px; outline: none; font-family: inherit;
        }
        .loc-submit {
          width: 100%; padding: 12px; background: linear-gradient(135deg, #00D4FF, #0099CC);
          border: none; border-radius: 8px; color: #000; font-size: 14px; font-weight: 600;
          cursor: pointer; font-family: inherit;
        }
        .loc-popular { }
        .loc-popular-label {
          display: block; font-size: 11px; color: rgba(255,255,255,0.4);
          text-transform: uppercase; letter-spacing: 1px; margin-bottom: 10px; font-weight: 600;
        }
        .loc-popular-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
        .loc-city-btn {
          padding: 10px 12px; background: rgba(255,255,255,0.04);
          border: 1px solid rgba(255,255,255,0.08); border-radius: 8px;
          color: rgba(255,255,255,0.7); font-size: 13px; text-align: left;
          cursor: pointer; transition: all 0.15s; font-family: inherit;
        }
        .loc-city-btn:hover { background: rgba(0,212,255,0.1); border-color: rgba(0,212,255,0.3); color: #00D4FF; }
        .loc-clear {
          width: 100%; margin-top: 16px; padding: 10px;
          background: none; border: 1px solid rgba(255,255,255,0.15);
          border-radius: 8px; color: rgba(255,255,255,0.5); font-size: 13px;
          cursor: pointer; font-family: inherit;
        }
        .loc-clear:hover { border-color: rgba(255,255,255,0.3); color: #fff; }

        /* ═══ RESPONSIVE ═══ */
        @media (max-width: 640px) {
          .ec-title { font-size: 20px; letter-spacing: 1px; }
          .ec-search-bar { flex-direction: column; }
          .ec-toolbar { width: 100%; justify-content: space-between; }
          .ec-cell { min-height: 52px; padding: 4px 2px; }
          .ec-day-num { font-size: 12px; width: 24px; height: 24px; }
          .ec-month-label { font-size: 17px; min-width: 140px; }
          .ec-location-bar { flex-direction: column; align-items: flex-start; }
          .ec-distance-pills { width: 100%; overflow-x: auto; }
          .ev-card { flex-direction: column; gap: 8px; }
          .ev-card-right { flex-direction: row; flex-wrap: wrap; align-items: center; gap: 8px; }
        }
      `}</style>
    </>
  );
}
