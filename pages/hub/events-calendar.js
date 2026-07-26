/**
 * EVENTS CALENDAR — Unified Tournament Search Engine
 * ===================================================
 * Aggregates ALL tournament data into one searchable page:
 *   - 9,697 daily venue tournaments (recurring + dated)
 *   - 208 poker series
 *   - 598+ tour stop events
 *
 * Features:
 *   - Always-visible horizontal filter dropdowns (matching Poker Near Me)
 *   - Date ranges up to 1 year out
 *   - List view (date-grouped) and Calendar view (monthly grid)
 *   - Map view
 *   - Smart aggregation for wide date ranges (recurring events show next occurrence)
 */

import SEOHead from '../../src/components/seo/SEOHead';
import Link from 'next/link';
import { useState, useEffect, useCallback, useRef, useMemo, memo, useDeferredValue } from 'react';
// 2026-05-07 — UI-UX-Pro-Max: Lucide icons replace 11 hand-rolled SVG components
import {
    Search, MapPin, Calendar as CalendarLuc, List as ListLuc, Map as MapLuc,
    ChevronLeft as ChevLeft, ChevronRight as ChevRight,
    X as XLuc, Crosshair, Clock, RefreshCw,
} from 'lucide-react';
import { useRouter } from 'next/router';
import useSWR from 'swr';
import UniversalHeader from '../../src/components/ui/UniversalHeader';
import HamburgerMenu from '../../src/components/ui/HamburgerMenu';
import { getMenuConfig } from '../../src/config/hamburgerMenus';
import useVenueRealtime from '../../src/hooks/useVenueRealtime';
import { resolveCityCoords } from '../../src/data/city-coordinates';
import dynamic from 'next/dynamic';
import { resolveEntityCoordinates, haversineDistance } from '../../src/lib/geoUtils';
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
  { key: 'today',    label: 'Today' },
  { key: 'tomorrow', label: 'Tomorrow' },
  { key: 'week',     label: 'This week' },
  { key: 'weekend',  label: 'This weekend' },
  { key: '14days',   label: 'Next 14 days' },
  { key: '30days',   label: 'Next 30 days' },
  { key: '60days',   label: 'Next 60 days' },
  { key: '90days',   label: 'Next 3 months' },
  { key: '180days',  label: 'Next 6 months' },
  { key: '365days',  label: 'Next 12 months' },
];

const BUY_IN_TIERS = [
  { key: 'all',       label: 'All buy-ins', min: null, max: null },
  { key: '0-100',     label: 'Under $100',  min: 0,    max: 100 },
  { key: '100-300',   label: '$100 - $300', min: 100,  max: 300 },
  { key: '300-1000',  label: '$300 - $1K',  min: 300,  max: 1000 },
  { key: '1000-5000', label: '$1K - $5K',   min: 1000, max: 5000 },
  { key: '5000+',     label: '$5K+',        min: 5000, max: null },
];

const GAME_TYPES = [
  { key: 'all',   label: 'All games' },
  { key: 'NLH',   label: 'NLH' },
  { key: 'PLO',   label: 'PLO' },
  { key: 'Mixed', label: 'Mixed' },
  { key: 'HORSE', label: 'HORSE' },
];

const EVENT_TYPES = [
  { key: 'all',    label: 'All events' },
  { key: 'daily',  label: 'Daily tournaments' },
  { key: 'series', label: 'Poker series' },
  { key: 'tour',   label: 'Tour events' },
];

const SORT_OPTIONS = [
  { key: 'date',       label: 'Soonest' },
  { key: 'buyin',      label: 'Cheapest' },
  { key: 'buyin_desc', label: 'Most expensive' },
  { key: 'distance',   label: 'Nearest' },
];

const DISTANCE_OPTIONS = [
  { key: '25',  label: '25 miles' },
  { key: '50',  label: '50 miles' },
  { key: '100', label: '100 miles' },
  { key: '200', label: '200 miles' },
  { key: '500', label: '500 miles' },
  { key: 'any', label: 'Any distance' },
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

const STATE_TZ = {
  'AL': 'CT', 'AK': 'AKT', 'AZ': 'MT', 'AR': 'CT', 'CA': 'PT', 'CO': 'MT', 
  'CT': 'ET', 'DE': 'ET', 'FL': 'ET', 'GA': 'ET', 'HI': 'HT', 'ID': 'MT', 
  'IL': 'CT', 'IN': 'ET', 'IA': 'CT', 'KS': 'CT', 'KY': 'ET', 'LA': 'CT', 
  'ME': 'ET', 'MD': 'ET', 'MA': 'ET', 'MI': 'ET', 'MN': 'CT', 'MS': 'CT', 
  'MO': 'CT', 'MT': 'MT', 'NE': 'CT', 'NV': 'PT', 'NH': 'ET', 'NJ': 'ET', 
  'NM': 'MT', 'NY': 'ET', 'NC': 'ET', 'ND': 'CT', 'OH': 'ET', 'OK': 'CT', 
  'OR': 'PT', 'PA': 'ET', 'RI': 'ET', 'SC': 'ET', 'SD': 'CT', 'TN': 'CT', 
  'TX': 'CT', 'UT': 'MT', 'VT': 'ET', 'VA': 'ET', 'WA': 'PT', 'WV': 'ET', 
  'WI': 'CT', 'WY': 'MT', 'DC': 'ET'
};

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
  const str = String(timeStr).trim().toUpperCase();
  
  if (str.includes('AM') || str.includes('PM')) {
    return str.replace(/([AP]M)$/, ' $1').replace(/\s+/g, ' ').trim();
  }

  const match24 = str.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
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
  daily:  { bg: 'rgba(0, 212, 255, 0.15)', border: 'rgba(0, 212, 255, 0.4)',  text: '#00D4FF', label: 'Daily' },
  series: { bg: 'rgba(168, 85, 247, 0.15)', border: 'rgba(168, 85, 247, 0.4)', text: '#A855F7', label: 'Series' },
  tour:   { bg: 'rgba(245, 158, 11, 0.15)', border: 'rgba(245, 158, 11, 0.4)', text: '#F59E0B', label: 'Tour' },
};

/* ───── SVG icons replaced by Lucide (see imports). Local components removed. ───── */
const SearchIcon    = (props) => <Search size={18} aria-hidden {...props} />;
const MapPinIcon    = ({ size = 14, ...rest }) => <MapPin size={size} aria-hidden {...rest} />;
const CalendarIcon  = ({ size = 16, ...rest }) => <CalendarLuc size={size} aria-hidden {...rest} />;
const ListIcon      = (props) => <ListLuc size={16} aria-hidden {...props} />;
const MapIcon       = (props) => <MapLuc size={16} aria-hidden {...props} />;
const ChevronLeft   = (props) => <ChevLeft size={18} aria-hidden {...props} />;
const ChevronRight  = (props) => <ChevRight size={18} aria-hidden {...props} />;
const XIcon         = (props) => <XLuc size={18} aria-hidden {...props} />;
const CrosshairIcon = (props) => <Crosshair size={16} aria-hidden {...props} />;
const ClockIcon     = (props) => <Clock size={13} aria-hidden {...props} />;
const RefreshIcon   = (props) => <RefreshCw size={13} aria-hidden {...props} />;

/* ───── Event Card Component ───── */
const EventCard = memo(function EventCard({ event, todayKey }) {
  const source = SOURCE_COLORS[event.source] || SOURCE_COLORS.daily;
  const dateIsToday = event.event_date === todayKey;

  const href = useMemo(() => {
    if (event.venue_id && event.source === 'daily') return `/hub/venues/${event.venue_id}`;
    if (event.series_id) return `/hub/series/${event.series_id}`;
    if (event.tour_code && event.source === 'tour') return `/hub/poker-series?tour=${encodeURIComponent(event.tour_code)}`;
    return null;
  }, [event.venue_id, event.series_id, event.tour_code, event.source]);

  // Memoize favicon fallback URL — was rebuilt on every render of every card
  const officialLogoFallback = useMemo(() => {
    const guessedDomain = (event.venue_name || event.event_name || '').toLowerCase().replace(/[^a-z0-9]/g, '') + '.com';
    return `https://www.google.com/s2/favicons?domain=${guessedDomain}&sz=128`;
  }, [event.venue_name, event.event_name]);
  const [imgSrc, setImgSrc] = useState(event.logo_url || officialLogoFallback);

  return (
    <div className="ev-card" data-today={dateIsToday ? '1' : ''}>
      {/* ── LEFT: Full-height logo (appears ONCE) ── */}
      <div className="ev-card-logo">
          <img
            src={imgSrc}
            alt={event.venue_name || ''}
            className="ev-logo-img"
            loading="lazy"
            onError={() => {
              // If the favicon fails (rare), fall back to Smarter.Poker chips
              if (imgSrc !== '/images/marketing/poker-chips.png') {
                 setImgSrc('/images/marketing/poker-chips.png');
              }
            }}
          />
      </div>

      {/* ── RIGHT: All tournament data ── */}
      <div className="ev-card-data">
        {/* Top row: source badge + buy-in/GTD */}
        <div className="ev-data-top">
          <div style={{ flex: 1, minWidth: 0 }}>
            <span className="ev-source" style={{ background: source.bg, borderColor: source.border, color: source.text }}>
              {source.label}
            </span>

            <h3 className="ev-name">
              {href ? (
                <Link href={href} className="ev-name-link">{event.event_name || 'Tournament'}</Link>
              ) : (
                event.event_name || 'Tournament'
              )}
            </h3>
          </div>

          <div className="ev-data-numbers">
            {event.buy_in != null && event.buy_in > 0 && (
              <div className="ev-buyin">{formatMoney(event.buy_in)}</div>
            )}
            {event.buy_in_range && event.source === 'series' && (
              <div className="ev-buyin-range">{event.buy_in_range}</div>
            )}
            {event.guaranteed != null && event.guaranteed > 0 && (
              <div className="ev-gtd">{formatMoney(event.guaranteed)} GTD</div>
            )}
          </div>
        </div>

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
            <span className="ev-meta-item" style={{ color: '#ec4899', fontWeight: 500 }}>
              <ClockIcon />
              {formatTime(event.start_time)} {event.state && STATE_TZ[event.state] ? STATE_TZ[event.state] : ''}
            </span>
          )}
          {event.distance_mi != null && (
            <span className="ev-meta-item ev-distance">
              {event.distance_mi < 1 ? '<1' : Math.round(event.distance_mi)} mi
            </span>
          )}
          {event.recurrence_label && (
            <span className="ev-meta-item ev-recurrence">
              <RefreshIcon />
              {event.recurrence_label}
            </span>
          )}
          {event.game_type && event.game_type !== 'Unknown' && (
            <span className="ev-game-type">{event.game_type}</span>
          )}
          {event.events_count && event.source === 'series' && (
            <span className="ev-event-count">{event.events_count} Events</span>
          )}
        </div>

        {/* Tour badge row */}
        {(event.tour_code || (event.stop_name && event.source === 'tour')) && (
          <div className="ev-badges">
            {event.tour_code && (
              <span className="ev-tour-code">{event.tour_code}</span>
            )}
            {event.stop_name && event.source === 'tour' && (
              <span className="ev-stop-name">{event.stop_name}</span>
            )}
          </div>
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
  const [locError, setLocError] = useState('');
  const isMountedRef = useRef(true);
  useEffect(() => { return () => { isMountedRef.current = false; }; }, []);

  if (!isOpen) return null;

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
      onSetLocation({ lat: null, lng: null, label: stateInput, source: 'state', state: stateInput });
      onClose();
    } else {
      setLocError('City not found. Try selecting from the list or enter a state.');
    }
  };

  return (
    <div className="loc-overlay" onClick={onClose}>
      <div className="loc-modal" role="dialog" aria-modal="true" aria-labelledby="loc-modal-title" onClick={e => e.stopPropagation()}>
        <div className="loc-modal-header">
          <h2 id="loc-modal-title">Change location</h2>
          <button className="loc-close" onClick={onClose} aria-label="Close location picker"><XIcon /></button>
        </div>

        {locError && (
          <p style={{ color: '#f87171', fontSize: 13, margin: '0 0 12px', padding: '8px 12px', background: 'rgba(248,113,113,0.1)', borderRadius: 6, border: '1px solid rgba(248,113,113,0.3)' }}>
            {locError}
          </p>
        )}

        <button className="loc-gps-btn" onClick={handleUseGps} disabled={gpsLoading}>
          <CrosshairIcon />
          {gpsLoading ? 'Getting location…' : 'Use my GPS location'}
        </button>

        <form className="loc-form" onSubmit={handleManualSubmit}>
          <div className="loc-inputs">
            <div className="loc-field">
              <label htmlFor="loc-city-input" className="loc-input-label">City</label>
              <input
                id="loc-city-input"
                type="text"
                placeholder="e.g. Las Vegas"
                value={cityInput}
                onChange={e => setCityInput(e.target.value)}
                className="loc-input"
              />
            </div>
            <div className="loc-field loc-field--state">
              <label htmlFor="loc-state-input" className="loc-input-label">State</label>
              <select id="loc-state-input" value={stateInput} onChange={e => setStateInput(e.target.value)} className="loc-select">
                <option value="">Any</option>
                {US_STATES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>
          <button type="submit" className="loc-submit">Search this area</button>
        </form>

        <div className="loc-popular">
          <span className="loc-popular-label">Popular cities</span>
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
            Clear location filter
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
    // [B3 FIX] Match server-side default (week) to client useState default ('week') to prevent layout shift
    const url = `${protocol}://${host}/api/poker/events-calendar?dateRange=week&limit=200&sort=date`;
    const res = await fetch(url);
    const data = await res.json();
    return { props: { fallbackData: data?.success ? data : null } };
  } catch (err) {
    return { props: { fallbackData: null } };
  }
}

/* ───── Main Page Component ───── */
export default function EventsCalendarPage({ fallbackData }) {
  const router = useRouter();
  const now = new Date();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuConfig = useMemo(() => getMenuConfig('events'), []);
  
  // View states: 'list' | 'calendar' | 'map'
  const [viewMode, setViewMode] = useState('list');
  const [calYear, setCalYear] = useState(now.getFullYear());
  const [calMonth, setCalMonth] = useState(now.getMonth());
  const [selectedCalDate, setSelectedCalDate] = useState(null);
  const [showLocationModal, setShowLocationModal] = useState(false);

  // Filters — always visible horizontally
  const [dateRange, setDateRange] = useState('week');
  const [buyInTier, setBuyInTier] = useState('all');
  const [gameType, setGameType] = useState('all');
  const [eventType, setEventType] = useState('all');
  const [sortBy, setSortBy] = useState('date');
  const [searchQuery, setSearchQuery] = useState('');
  const [distance, setDistance] = useState('50');
  const [dayOfWeek, setDayOfWeek] = useState('');

  // Location
  const [userLocation, setUserLocation] = useState(null);

  // Pagination
  const [visibleCount, setVisibleCount] = useState(50);
  const todayKey = useMemo(() => getTodayKey(), []);

  // Try GPS on mount and restore previous location from PNM
  useEffect(() => {
    let isMounted = true;
    
    // Attempt to restore location from localStorage (poker-near-me shared state)
    const saved = localStorage.getItem('pnm_last_location') || localStorage.getItem('sp-user-gps');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed && ((parsed.coordinates && parsed.coordinates.lat) || (parsed.lat && parsed.lng))) {
          const lat = parsed.coordinates ? parsed.coordinates.lat : parsed.lat;
          const lng = parsed.coordinates ? parsed.coordinates.lng : parsed.lng;
          setUserLocation({
            lat: lat,
            lng: lng,
            label: parsed.location || parsed.label || 'My Location'
          });
          setDistance(parsed.radius || parsed.distance || '50');
          return;
        }
      } catch (e) { console.warn('[EventsCalendar] Failed to parse saved location:', e); }
    }
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

  // Deferred search for 120hz unblocked input
  const deferredSearchQuery = useDeferredValue(searchQuery);

  // Build API URL from filters
  // When in calendar view, load events for the viewed calendar month
  const apiUrl = useMemo(() => {
    const params = new URLSearchParams();

    if (viewMode === 'calendar') {
      // Load data for the viewed calendar month
      const monthStr = `${calYear}-${String(calMonth + 1).padStart(2, '0')}`;
      params.set('calMonth', monthStr);
    } else {
      params.set('dateRange', dateRange);
    }

    params.set('limit', '1000');
    if (eventType !== 'all') params.set('eventType', eventType);
    if (gameType !== 'all') params.set('gameType', gameType);
    if (sortBy) params.set('sort', sortBy);
    if (deferredSearchQuery) params.set('search', deferredSearchQuery);

    const buyInConfig = BUY_IN_TIERS.find(t => t.key === buyInTier);
    if (buyInConfig?.min != null) params.set('minBuyin', buyInConfig.min);
    if (buyInConfig?.max != null) params.set('maxBuyin', buyInConfig.max);

    if (userLocation?.lat != null && userLocation?.lng != null) {
      params.set('lat', userLocation.lat);
      params.set('lng', userLocation.lng);
      if (distance && distance !== 'any') params.set('radius', distance);
    }
    if (userLocation?.state) {
      params.set('state', userLocation.state);
    }

    return `/api/poker/events-calendar?${params.toString()}`;
  }, [dateRange, buyInTier, gameType, eventType, sortBy, deferredSearchQuery, userLocation, distance, viewMode, calYear, calMonth]);

  const initSsrUrl = useMemo(
    () => `/api/poker/events-calendar?dateRange=week&limit=200&sort=date`,
    []
  );
  const swrFallback = useMemo(
    () => (fallbackData ? { [initSsrUrl]: fallbackData } : {}),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const { data: apiData, error, isLoading: loading, mutate } = useSWR(
    apiUrl,
    (url) => fetch(url).then(r => r.json()).then(data => {
      if (data && data.success === false) throw new Error(data.error || 'Failed to fetch API events');
      return data;
    }),
    { fallback: swrFallback, revalidateOnFocus: false, dedupingInterval: 30000 }
  );

  useVenueRealtime((payload) => {
    // Drop irrelevant payloads from other tables the master hook listens to
    if (payload && payload.table === 'poker_venues') return;
    
    // Instead of doing a custom fetch that destroys caching via timestamp busting,
    // we lean natively on SWR to dedup and jitter the reconnect requests. Using a minor variance stops herd stampedes.
    setTimeout(() => {
      mutate();
    }, 500 + Math.random() * 2000); 
  });

  const events = apiData?.events || [];
  const totalCount = apiData?.total || 0;
  const dateCounts = apiData?.dateCounts || {};
  const stats = apiData?.stats || {};
  const useSmartAgg = apiData?.useSmartAgg || false;

  // Reset visible count when filters change
  useEffect(() => { setVisibleCount(50); }, [apiUrl]);

  // Count active filters (excluding defaults)
  const activeFilterCount = [
    dateRange !== 'week',
    buyInTier !== 'all',
    gameType !== 'all',
    eventType !== 'all',
    distance !== '50',
    !!dayOfWeek,
    !!userLocation,
  ].filter(Boolean).length;

  // Group events by date for list view
  const dateGroups = useMemo(() => {
    const groups = {};
    const order = [];
    
    // Apply local day of week filter (empty string = show all)
    const filteredEvents = !dayOfWeek
      ? events 
      : events.filter(e => {
          if (!e.event_date) return false;
          const d = new Date(e.event_date + 'T12:00:00');
          const dayName = d.toLocaleDateString('en-US', { weekday: 'long' });
          return dayName.toLowerCase() === dayOfWeek.toLowerCase();
        });
        
    const visible = filteredEvents.slice(0, visibleCount);
    for (const evt of visible) {
      const dk = evt.event_date || 'undated';
      if (!groups[dk]) {
        groups[dk] = [];
        order.push(dk);
      }
      groups[dk].push(evt);
    }
    return { groups, order };
  }, [events, dayOfWeek, visibleCount]);

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
      if (!e.latitude || !e.longitude) return;
      const vKey = e.venue_name || e.event_name;
      if (!vKey) return;

      if (!venueMap[vKey]) {
        const stableId = e.venue_id || e.series_id || e.tour_event_id ||
          `loc-${e.latitude.toFixed(4)}-${e.longitude.toFixed(4)}`;
        venueMap[vKey] = {
          id: stableId,
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
    return Object.values(venueMap || {});
  }, [events]);

  const clearFilters = () => {
    setDateRange('week');
    setBuyInTier('all');
    setGameType('all');
    setEventType('all');
    setSortBy('date');
    setSearchQuery('');
    setSearchInput('');
    setDistance('50');
    setDayOfWeek('');
    setUserLocation(null);
  };

  const handleLocationChange = (loc) => {
    setUserLocation(loc);
    if (loc?.lat) setDistance('50');
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

  // Search debounce
  const searchTimeoutRef = useRef(null);
  const [searchInput, setSearchInput] = useState('');
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
        description="Search thousands of poker tournaments by date, location, buy-in, and game type. Daily tournaments, series events, and tour stops — all in one place."
        canonical="/hub/events-calendar"
      />
      <UniversalHeader pageDepth={1} onMenuClick={() => setMenuOpen(true)} onBackClick={() => {
        router.back();
      }} />
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

        {/* ── Location Active Strip — always at top, just below Global Header ── */}
        <div className="ec-location-strip">
          {userLocation ? (
            <div className="pnm-location-pill">
              <div className="pnm-location-dot" />
              <span className="pnm-location-label">Location active</span>
              {userLocation.label && userLocation.label !== 'My Location' && (
                <span className="pnm-location-city">{userLocation.label}</span>
              )}
              <button
                className="pnm-location-clear"
                onClick={() => { handleLocationChange(null); }}
                aria-label="Clear location"
              ><XLuc size={14} aria-hidden /></button>
            </div>
          ) : (
            <button
              className="ec-gps-btn"
              onClick={() => setShowLocationModal(true)}
              id="ec-location-btn"
            >
              <MapPinIcon size={14} />
              Set location
            </button>
          )}
        </div>

        {/* ── Page Header ── */}
        <div className="ec-hero" style={{ position: 'relative', textAlign: 'center' }}>
          {/* Centered title block */}
          <h1 className="ec-title"><span className="ec-white">EVENTS</span> <span className="ec-cyan">CALENDAR</span></h1>
          <p className="ec-subtitle" style={{ display: 'flex', flexDirection: 'row', gap: '8px', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'center' }}>
            {loading ? 'Loading…' : `${totalCount.toLocaleString()} tournaments found`}
            {stats.sources && !loading && (
              <span className="ec-source-counts" style={{ display: 'inline', marginLeft: '4px' }}>
                &middot; {[
                  stats.sources.daily > 0 && `${stats.sources.daily.toLocaleString()} Daily`,
                  stats.sources.series > 0 && `${stats.sources.series.toLocaleString()} Series`,
                  stats.sources.tour > 0 && `${stats.sources.tour.toLocaleString()} Tour`
                ].filter(Boolean).join(' · ')}
              </span>
            )}
            {useSmartAgg && !loading && (
              <span className="ec-smart-agg-note" style={{ display: 'inline', marginLeft: '4px' }}>&middot; Recurring events showing next occurrence</span>
            )}
          </p>
          {/* Search box — absolute right */}
          <div style={{ position: 'absolute', top: 0, right: 0 }}>
            <form className="ec-search-wrap" role="search" onSubmit={(e) => { e.preventDefault(); setSearchQuery(searchInput); }} style={{ width: '200px', background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '500px', padding: '8px 16px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <SearchIcon />
              <label htmlFor="ec-search-input" className="ec-sr-only">Search tournaments</label>
              <input
                type="text"
                placeholder="Search"
                value={searchInput}
                onChange={e => handleSearchInput(e.target.value)}
                className="ec-search-input"
                id="ec-search-input"
                style={{ background: 'transparent', border: 'none', color: '#fff', outline: 'none', width: '100%', fontSize: '13px' }}
              />
              {searchInput && (
                <button type="button" className="ec-search-clear" aria-label="Clear search" onClick={() => { setSearchInput(''); setSearchQuery(''); }} style={{ background: 'transparent', border: 'none', color: '#8b8d9b', cursor: 'pointer', padding: 4 }}>
                  <XIcon />
                </button>
              )}
            </form>
          </div>
        </div>
        
        {/* Day of Week Tabs — centered */}
        <div className="ec-day-selector">
          <div className="ec-day-tabs-row">
            <div className="ec-day-tabs">
              {(() => {
                // [B2 FIX] Compute today index once for all 7 tabs instead of 7× per render
                const DAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
                const todayIdx = new Date().getDay();
                return DAYS.map(day => {
                  const dayIdx = DAYS.indexOf(day);
                  let daysAhead = dayIdx - todayIdx;
                  if (daysAhead < 0) daysAhead += 7;
                  const isToday = daysAhead === 0;
                  const isActive = dayOfWeek === day;
                  return (
                    <button
                      key={day}
                      className={`ec-day-tab${isActive ? ' active' : ''}${isToday ? ' today' : ''}`}
                      onClick={() => setDayOfWeek(isActive ? '' : day)}
                      aria-pressed={isActive}
                    >
                      {isToday && <span className="ec-day-today-dot" />}
                      <span className="ec-day-short">{day.substring(0, 3).toUpperCase()}</span>
                      <span className="ec-day-full">{day}</span>
                    </button>
                  );
                });
              })()}
            </div>
          </div>
        </div>

        {/* ── Always-Visible Filter Bar (centered, Poker Near Me style) ── */}
        <div className="ec-filter-bar">

          {/* Event Type — Show All / Daily / Series / Tour */}
          <div className="ec-filter-group">
            <label className="ec-filter-label" htmlFor="ec-event-type">Event type</label>
            <select
              className="ec-filter-select"
              value={eventType}
              onChange={e => setEventType(e.target.value)}
              id="ec-event-type"
            >
              {EVENT_TYPES.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
            </select>
          </div>

          {/* Date Range */}
          <div className="ec-filter-group">
            <label className="ec-filter-label" htmlFor="ec-date-range">Date range</label>
            <select
              className="ec-filter-select"
              value={dateRange}
              onChange={e => setDateRange(e.target.value)}
              disabled={viewMode === 'calendar'}
              id="ec-date-range"
            >
              {DATE_RANGES.map(r => <option key={r.key} value={r.key}>{r.label}</option>)}
            </select>
          </div>

          {/* Buy-In */}
          <div className="ec-filter-group">
            <label className="ec-filter-label" htmlFor="ec-buyin">Buy-in</label>
            <select
              className="ec-filter-select"
              value={buyInTier}
              onChange={e => setBuyInTier(e.target.value)}
              id="ec-buyin"
            >
              {BUY_IN_TIERS.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
            </select>
          </div>

          {/* Game Type */}
          <div className="ec-filter-group">
            <label className="ec-filter-label" htmlFor="ec-game-type">Game</label>
            <select
              className="ec-filter-select"
              value={gameType}
              onChange={e => setGameType(e.target.value)}
              id="ec-game-type"
            >
              {GAME_TYPES.map(g => <option key={g.key} value={g.key}>{g.label}</option>)}
            </select>
          </div>

          {/* Distance (only when location is set) */}
          {userLocation && (
            <div className="ec-filter-group">
              <label className="ec-filter-label" htmlFor="ec-distance">Distance</label>
              <select
                className="ec-filter-select"
                value={distance}
                onChange={e => setDistance(e.target.value)}
                id="ec-distance"
              >
                {DISTANCE_OPTIONS.map(d => <option key={d.key} value={d.key}>{d.label}</option>)}
              </select>
            </div>
          )}

          {/* Sort By */}
          <div className="ec-filter-group">
            <label className="ec-filter-label" htmlFor="ec-sort-by">Sort by</label>
            <select
              className="ec-filter-select"
              value={sortBy}
              onChange={e => setSortBy(e.target.value)}
              id="ec-sort-by"
            >
              {SORT_OPTIONS.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
            </select>
          </div>

          {/* View Mode */}
          <div className="ec-filter-group">
            <label className="ec-filter-label" htmlFor="ec-view-mode">View mode</label>
            <select
              className="ec-filter-select"
              value={viewMode}
              onChange={e => setViewMode(e.target.value)}
              id="ec-view-mode"
            >
              <option value="list">List view</option>
              <option value="calendar">Calendar view</option>
              <option value="map">Map view</option>
            </select>
          </div>

          {/* Clear all (only if active filters) */}
          {activeFilterCount > 0 && (
            <div className="ec-filter-group ec-filter-group--clear">
              <label className="ec-filter-label">&nbsp;</label>
              <button className="ec-clear-btn" onClick={clearFilters}>
                Clear ({activeFilterCount})
              </button>
            </div>
          )}
        </div>

        {/* ── Content ── */}
        <div className="ec-content">
          {loading && (
            <div className="ec-loading" role="status" aria-live="polite" aria-busy="true">
              <div className="ec-spinner" />
              <p>Finding tournaments…</p>
            </div>
          )}

          {error && !loading && (
            <div className="ec-error">
              <p>Failed to load events</p>
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
                  <p className="ec-empty-title">No tournaments found</p>
                  <p className="ec-empty-sub">Try adjusting your filters or expanding your search area.</p>
                  <button className="ec-empty-btn" onClick={clearFilters}>Clear all filters</button>
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
                    <button className="ec-load-more" onClick={() => setVisibleCount(v => v + 100)}>
                      Show more ({events.length - visibleCount} remaining)
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
                <button className="ec-nav-btn" onClick={goToPrevMonth} aria-label="Previous month"><ChevronLeft /></button>
                <h2 className="ec-month-label">{MONTH_NAMES[calMonth]} {calYear}</h2>
                <button className="ec-nav-btn" onClick={goToNextMonth} aria-label="Next month"><ChevronRight /></button>
                <button className="ec-today-btn" onClick={goToToday} aria-label="Jump to today">Today</button>
              </div>

              <div className="ec-grid-header">
                {DAYS_SHORT.map(d => <div key={d} className="ec-day-hdr">{d}</div>)}
              </div>

              <div className="ec-grid">
                {calendarCells.map(cell => (
                  cell.day ? (
                    <button
                      key={cell.key}
                      type="button"
                      className={`ec-cell has-day ${cell.isToday ? 'today' : ''} ${cell.dateKey === selectedCalDate ? 'selected' : ''}`}
                      onClick={() => setSelectedCalDate(cell.dateKey === selectedCalDate ? null : cell.dateKey)}
                      aria-pressed={cell.dateKey === selectedCalDate}
                      aria-label={`${MONTH_NAMES[calMonth]} ${cell.day}, ${calYear}${cell.count > 0 ? ` — ${cell.count} event${cell.count !== 1 ? 's' : ''}` : ''}`}
                    >
                      <span className={`ec-day-num ${cell.isToday ? 'today' : ''}`}>{cell.day}</span>
                      {cell.count > 0 && (
                        <div className="ec-dot-row">
                          {Array.from({ length: Math.min(cell.count, 3) }).map((_, i) => (
                            <span key={i} className="ec-dot" aria-hidden />
                          ))}
                          {cell.count > 3 && <span className="ec-dot-more">+{cell.count - 3}</span>}
                        </div>
                      )}
                    </button>
                  ) : (
                    <div key={cell.key} className="ec-cell empty" role="presentation" />
                  )
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

      <style>{`
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

        /* ═══ LOCATION STRIP — top of page, just below global header ═══ */
        .ec-location-strip {
          display: flex; justify-content: center; align-items: center;
          padding: 8px 16px 4px;
          min-height: 44px;
        }

        /* ═══ HERO ═══ */
        .ec-hero { padding: 8px 20px 12px; max-width: 1100px; margin: 0 auto; }
        .ec-title {
          font-family: 'Orbitron', 'Rajdhani', sans-serif;
          font-size: 26px; font-weight: 700; margin: 0 auto;
          letter-spacing: 2px; text-transform: uppercase;
          text-shadow: 0 0 20px rgba(0,212,255,0.3);
          text-align: center;
        }
        .ec-subtitle { font-size: 14px; color: rgba(255,255,255,0.5); margin: 8px auto 0; text-align: center; }
        .ec-white { color: #fff; }
        .ec-cyan { color: #00D4FF; text-shadow: 0 0 15px rgba(0,212,255,0.6); }
        /* ═══ VENUE LOGO IN CARD ═══ */
        .ev-venue-logo {
          width: 44px; height: 44px; object-fit: contain;
          border-radius: 8px;
          background: rgba(255,255,255,0.05);
          border: 1px solid rgba(255,255,255,0.08);
          flex-shrink: 0;
        }
        .ec-source-counts {
          display: flex; gap: 12px; justify-content: center; margin-top: 4px;
          font-size: 12px; color: rgba(255,255,255,0.35);
        }
        .ec-source-counts span::before { content: ''; display: inline-block; width: 6px; height: 6px; border-radius: 50%; margin-right: 4px; vertical-align: middle; }
        .ec-source-counts span:nth-child(1)::before { background: #00D4FF; }
        .ec-source-counts span:nth-child(2)::before { background: #A855F7; }
        .ec-source-counts span:nth-child(3)::before { background: #F59E0B; }
        .ec-smart-agg-note {
          display: block; font-size: 11px; color: rgba(245,158,11,0.6);
          margin-top: 4px; font-style: italic;
        }

        /* ═══ FILTER BAR — centered, wraps on mobile ═══ */
        .ec-filter-bar {
          max-width: 1200px; margin: 0 auto;
          padding: 8px 16px 12px;
          display: flex; align-items: flex-end; gap: 8px;
          flex-wrap: wrap; justify-content: center;
          overflow-x: auto;
        }
        .ec-filter-bar::-webkit-scrollbar { display: none; }
        .ec-filter-group {
          display: flex; flex-direction: column; gap: 4px; min-width: 0;
        }
        .ec-filter-group--clear {
          align-self: flex-end;
        }
        .ec-filter-label {
          font-size: 10px; text-transform: uppercase; letter-spacing: 0.8px;
          color: rgba(255,255,255,0.4); font-weight: 600; white-space: nowrap;
          padding-left: 2px;
        }
        .ec-filter-select {
          padding: 8px 24px 8px 10px; min-width: 100px;
          background: rgba(0,0,0,0.35);
          border: 1px solid rgba(255,255,255,0.15); border-radius: 10px;
          color: #fff; font-size: 12px; font-weight: 500; outline: none;
          font-family: inherit; cursor: pointer; transition: all 0.2s;
          appearance: none;
          background-image: url("data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22292.4%22%20height%3D%22292.4%22%3E%3Cpath%20fill%3D%22%23aaaaaa%22%20d%3D%22M287%2069.4a17.6%2017.6%200%200%200-13-5.4H18.4c-5%200-9.3%201.8-12.9%205.4A17.6%2017.6%200%200%200%200%2082.2c0%205%201.8%209.3%205.4%2012.9l128%20127.9c3.6%203.6%207.8%205.4%2012.8%205.4s9.2-1.8%2012.8-5.4L287%2095c3.5-3.5%205.4-7.8%205.4-12.8%200-5-1.9-9.2-5.5-12.8z%22%2F%3E%3C%2Fsvg%3E");
          background-repeat: no-repeat; background-position: right 8px center; background-size: 8px auto;
        }
        .ec-filter-select:hover  { border-color: rgba(255,255,255,0.3); }
        .ec-filter-select:focus  { border-color: #00D4FF; outline: none !important; box-shadow: none !important; }
        .ec-filter-select option  { background: #0f172a; color: #fff; }
        .ec-filter-select:disabled { opacity: 0.4; cursor: not-allowed; }
        .ec-filter-bar *:focus, .ec-search-input:focus { outline: none !important; box-shadow: none !important; }

        /* Location GPS button (fallback when no location) */
        .ec-gps-btn {
          display: flex; align-items: center; gap: 7px;
          padding: 9px 14px;
          background: linear-gradient(135deg, rgba(255,255,255,0.1) 0%, rgba(200,214,229,0.06) 100%);
          border: 1.5px solid rgba(255,255,255,0.3);
          border-radius: 20px; color: #fff;
          font-size: 13px; font-weight: 700; cursor: pointer;
          transition: all 0.25s; font-family: inherit;
          white-space: nowrap; animation: gpsGlow 2.5s ease-in-out infinite;
        }
        @keyframes gpsGlow {
          0%,100% { box-shadow: 0 0 8px rgba(255,255,255,0.1); border-color: rgba(255,255,255,0.2); }
          50% { box-shadow: 0 0 18px rgba(255,255,255,0.25); border-color: rgba(255,255,255,0.45); }
        }
        .ec-gps-btn:hover { background: rgba(255,255,255,0.18); transform: translateY(-1px); }
        /* Location Active pill — same as PNM */
        .pnm-location-area { align-self: flex-end; flex-shrink: 0; }
        .pnm-location-pill {
          display: flex; align-items: center; gap: 8px;
          padding: 6px 12px;
          background: rgba(63,185,80,0.08); border: 1.5px solid rgba(63,185,80,0.3);
          border-radius: 20px; font-size: 12px; font-weight: 600;
          animation: locationActivePulse 3s ease-in-out infinite;
          white-space: nowrap;
        }
        @keyframes locationActivePulse {
          0%,100% { border-color: rgba(63,185,80,0.2); box-shadow: 0 0 0 rgba(63,185,80,0); }
          50% { border-color: rgba(63,185,80,0.45); box-shadow: 0 0 10px rgba(63,185,80,0.1); }
        }
        .pnm-location-dot {
          width: 8px; height: 8px; border-radius: 50%; background: #3fb950;
          flex-shrink: 0; box-shadow: 0 0 6px rgba(63,185,80,0.6);
          animation: locationDotPulse 2s ease-in-out infinite;
        }
        @keyframes locationDotPulse {
          0%,100% { opacity: 1; } 50% { opacity: 0.5; }
        }
        .pnm-location-label {
          color: #3fb950; font-weight: 700; font-size: 11px;
          text-transform: uppercase; letter-spacing: 0.8px;
        }
        .pnm-location-city {
          color: rgba(226,232,240,0.8); font-size: 12px;
          max-width: 140px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        }
        .pnm-location-clear {
          background: none; border: none; color: rgba(255,255,255,0.3);
          font-size: 16px; cursor: pointer; line-height: 1; padding: 0 2px;
          transition: color 0.2s;
        }
        .pnm-location-clear:hover { color: #ef4444; }

        /* Clear All button */
        .ec-clear-btn {
          padding: 9px 14px; background: none;
          border: 1px solid rgba(255,255,255,0.15); border-radius: 10px;
          color: rgba(255,255,255,0.5); font-size: 12px; font-weight: 600;
          cursor: pointer; transition: all 0.15s; font-family: inherit;
          white-space: nowrap;
        }
        .ec-clear-btn:hover { border-color: rgba(255,255,255,0.3); color: #fff; }

        /* ═══ DAY TABS — centered ═══ */
        .ec-day-selector { padding: 0 20px 16px; overflow-x: auto; }
        .ec-day-tabs-row { display: flex; align-items: center; justify-content: center; gap: 8px; min-width: 0; }
        .ec-day-tabs {
          display: flex; gap: 4px; flex-wrap: wrap;
          justify-content: center; overflow-x: auto;
        }
        .ec-day-tabs::-webkit-scrollbar { display: none; }
        .ec-day-tab {
          position: relative; padding: 10px 16px;
          background: linear-gradient(180deg, rgba(61,79,95,0.2) 0%, rgba(26,35,50,0.4) 100%);
          border: 1px solid #3d4f5f; border-radius: 8px;
          color: rgba(255,255,255,0.7); font-size: 14px; font-weight: 600;
          font-family: 'Rajdhani', sans-serif; cursor: pointer; transition: all 0.2s;
          white-space: nowrap; text-transform: uppercase; letter-spacing: 0.5px;
        }
        /* Today tab — CYAN/BLUE matching the EVENTS CALENDAR title */
        .ec-day-tab.today {
          border-color: #00D4FF;
          color: #00D4FF;
          background: linear-gradient(180deg, rgba(0,212,255,0.18) 0%, rgba(0,212,255,0.08) 100%);
          box-shadow: inset 0 0 8px rgba(0,212,255,0.1);
        }
        .ec-day-tab.today.active {
          background: linear-gradient(135deg, #00D4FF, #0099CC);
          border-color: #00D4FF; color: #000;
          box-shadow: 0 0 15px rgba(0,212,255,0.5), 0 0 30px rgba(0,212,255,0.2);
        }
        .ec-day-today-dot {
          position: absolute; top: 5px; right: 5px;
          width: 5px; height: 5px; border-radius: 50%; background: #00D4FF;
          box-shadow: 0 0 4px rgba(0,212,255,0.8);
        }
        .ec-day-tab:hover {
          background: linear-gradient(180deg, rgba(61,79,95,0.4) 0%, rgba(26,35,50,0.6) 100%);
          border-color: #00D4FF; box-shadow: 0 0 10px rgba(0,212,255,0.2);
        }
        .ec-day-tab.active {
          background: linear-gradient(135deg, #00D4FF, #0099CC);
          border-color: #00D4FF; color: #000;
          box-shadow: 0 0 15px rgba(0,212,255,0.5), 0 0 30px rgba(0,212,255,0.2);
        }
        .ec-day-short { display: inline; }
        .ec-day-full  { display: none; }
        @media (min-width: 768px) {
          .ec-day-short { display: none; }
          .ec-day-full  { display: inline; }
        }

        /* ═══ SEARCH BAR (inline inside hero) ═══ */
        .ec-search-wrap {
          position: relative; display: flex; align-items: center;
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

        /* ═══ CONTENT ═══ */
        .ec-content { max-width: 1100px; margin: 0 auto; padding: 0 16px; }

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
          display: flex; align-items: stretch; gap: 0;
          margin-bottom: 6px;
          background: rgba(15, 23, 42, 0.5); backdrop-filter: blur(8px);
          border: 1px solid rgba(255,255,255,0.08); border-radius: 12px;
          transition: all 0.15s; overflow: hidden;
        }
        .ev-card:hover { background: rgba(15, 23, 42, 0.7); border-color: rgba(255,255,255,0.15); }
        .ev-card[data-today="1"] { border-color: rgba(0,212,255,0.3); }

        /* ── Logo column: full height, fixed width ── */
        .ev-card-logo {
          width: 80px; min-height: 80px; flex-shrink: 0;
          display: flex; align-items: center; justify-content: center;
          background: rgba(0,0,0,0.25);
          border-right: 1px solid rgba(255,255,255,0.06);
        }
        .ev-logo-img {
          width: 56px; height: 56px; object-fit: contain; border-radius: 8px;
        }
        .ev-logo-fallback {
          width: 56px; height: 56px; border-radius: 8px;
          display: flex; align-items: center; justify-content: center;
          background: linear-gradient(135deg, rgba(0,212,255,0.15), rgba(168,85,247,0.15));
          border: 1px solid rgba(255,255,255,0.1);
          color: rgba(255,255,255,0.5); font-size: 18px; font-weight: 700;
          letter-spacing: 1px; font-family: 'Rajdhani', sans-serif;
        }

        /* ── Data column: all tournament info ── */
        .ev-card-data {
          flex: 1; min-width: 0; padding: 12px 14px;
          display: flex; flex-direction: column; justify-content: center; gap: 4px;
        }
        .ev-data-top {
          display: flex; justify-content: space-between; align-items: flex-start; gap: 12px;
        }
        .ev-data-numbers {
          flex-shrink: 0; text-align: right;
          display: flex; flex-direction: column; align-items: flex-end; gap: 2px;
        }
        .ev-badges { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; margin-top: 2px; }

        .ev-source {
          display: inline-block; font-size: 10px; font-weight: 700;
          padding: 2px 8px; border-radius: 4px; border: 1px solid;
          text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px;
        }
        .ev-name { margin: 0; font-size: 14px; font-weight: 600; color: #fff; line-height: 1.3; }
        .ev-name-link { color: #fff; text-decoration: none; }
        .ev-name-link:hover { color: #00D4FF; }
        .ev-meta { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 4px; align-items: center; }
        .ev-meta-item {
          display: flex; align-items: center; gap: 4px;
          font-size: 12px; color: rgba(255,255,255,0.5);
        }
        .ev-venue-link { color: rgba(0,212,255,0.8); text-decoration: none; font-weight: 500; }
        .ev-venue-link:hover { color: #00D4FF; text-decoration: underline; }
        .ev-location { color: rgba(255,255,255,0.35); }
        .ev-distance { color: rgba(0,212,255,0.7); font-weight: 600; }
        .ev-recurrence { color: rgba(245,158,11,0.6); font-style: italic; }
        .ev-tour-code {
          display: inline-block; font-size: 10px; font-weight: 700;
          color: rgba(245,158,11,0.8); background: rgba(245,158,11,0.1);
          padding: 1px 6px; border-radius: 3px;
        }
        .ev-stop-name { font-size: 11px; color: rgba(255,255,255,0.35); }
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
        @media (max-width: 768px) {
          .ec-filter-bar {
            padding: 8px 12px 10px;
            gap: 8px;
            overflow-x: auto;
            flex-wrap: wrap;
            justify-content: center;
            -webkit-overflow-scrolling: touch;
            scrollbar-width: none;
          }
          .ec-filter-bar::-webkit-scrollbar { display: none; }
          .ec-filter-group { flex-shrink: 0; }
          .ec-filter-select { min-width: 110px; font-size: 12px; }
          .ec-location-btn { min-width: 110px; font-size: 12px; }
          .ec-search-bar { padding: 0 12px 10px; }
          .ec-title { font-size: 20px; letter-spacing: 1px; }
          .ec-cell { min-height: 52px; padding: 4px 2px; }
          .ec-day-num { font-size: 12px; width: 24px; height: 24px; }
          .ec-month-label { font-size: 17px; min-width: 140px; }
          .ev-card { flex-direction: row; }
          .ev-card-logo { width: 64px; min-height: 64px; }
          .ev-logo-img { width: 44px; height: 44px; }
          .ev-logo-fallback { width: 44px; height: 44px; font-size: 15px; }
          .ev-data-top { flex-direction: column; gap: 4px; }
          .ev-data-numbers { flex-direction: row; flex-wrap: wrap; align-items: center; gap: 8px; }
        }
        @media (max-width: 480px) {
          .ec-filter-select { min-width: 95px; padding: 8px 22px 8px 10px; }
        }

        /* ═══ A11y: visually-hidden label for screen readers ═══ */
        .ec-sr-only {
          position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px;
          overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0;
        }

        /* ═══ Location modal: per-field labels ═══ */
        .loc-field { display: flex; flex-direction: column; gap: 4px; flex: 1; min-width: 0; }
        .loc-field--state { flex: 0 0 110px; }
        .loc-input-label {
          font-size: 11px; font-weight: 600; letter-spacing: 0.4px;
          text-transform: uppercase; color: rgba(255,255,255,0.5);
        }

        /* ═══ Touch-target compliance (UI-UX-Pro-Max priority 2 — 44pt minimum) ═══ */
        .ec-nav-btn { width: 44px; height: 44px; }
        .ec-today-btn { min-height: 36px; }
        .loc-close {
          min-width: 44px; min-height: 44px; display: inline-flex;
          align-items: center; justify-content: center; border-radius: 8px;
        }
        .pnm-location-clear {
          min-width: 44px; min-height: 44px; display: inline-flex;
          align-items: center; justify-content: center; border-radius: 50%;
          padding: 0; font-size: 0;
        }
        .ec-search-clear {
          min-width: 44px; min-height: 44px; display: inline-flex;
          align-items: center; justify-content: center; border-radius: 50%;
        }

        /* ═══ Motion guard (UI-UX-Pro-Max priority 7 — WCAG 2.3.3) ═══ */
        @media (prefers-reduced-motion: reduce) {
          .ec-gps-btn,
          .pnm-location-pill,
          .pnm-location-dot { animation: none !important; }
          .ec-spinner { animation: ec-spin 2s linear infinite; }
          .ev-card,
          .ec-cell,
          .ec-filter-select,
          .loc-gps-btn,
          .loc-city-btn,
          .loc-clear,
          .ec-clear-btn,
          .ec-day-tab,
          .ec-empty-btn,
          .ec-load-more { transition: none !important; }
        }

        /* ═══ Layout: hero search reflows on narrow screens (UI-UX-Pro-Max priority 5) ═══ */
        @media (max-width: 640px) {
          .ec-hero { display: flex; flex-direction: column; align-items: center; gap: 8px; }
          .ec-hero > div[style*="position: absolute"] {
            position: static !important; width: 100% !important;
            max-width: 320px; margin: 4px auto 0;
          }
          .ec-hero > div[style*="position: absolute"] .ec-search-wrap { width: 100% !important; }
        }
      `}</style>
    </>
  );
}
