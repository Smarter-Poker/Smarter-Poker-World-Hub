/**
 * EVENTS CALENDAR — Unified Tournament Search Engine
 * ===================================================
 * Aggregates ALL tournament data into one searchable page:
 *   - 9,697 daily venue tournaments (recurring + dated)
 *   - 208 poker series
 *   - 598+ tour stop events
 *   - Public Commander home-game tournaments
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
import { useState, useEffect, useRef, useMemo, memo, useDeferredValue } from 'react';
import { useRouter } from 'next/router';
import useSWR from 'swr';
import UniversalHeader from '../../src/components/ui/UniversalHeader';
import PokerNearMeFamilyNav from '../../src/components/poker-near-me/PokerNearMeFamilyNav';
import { PokerNearMeConsoleIcon, PokerNearMePanelShell } from '../../src/components/poker-near-me/PokerNearMeConsole';
import HamburgerMenu from '../../src/components/ui/HamburgerMenu';
import { getMenuConfig } from '../../src/config/hamburgerMenus';
import useVenueRealtime from '../../src/hooks/useVenueRealtime';
import { resolveCityCoords } from '../../src/data/city-coordinates';
import dynamic from 'next/dynamic';
import { resolveEntityCoordinates, haversineDistance } from '../../src/lib/geoUtils';
import { fetchJsonWithDeadline } from '../../src/lib/server/fetchJsonWithDeadline';
import { hubCollectionSchema } from '../../src/lib/seo/hubPageSchema';
import useAccessibleDialog from '../../src/hooks/useAccessibleDialog';

// AEO phase 3 (2026-09-17): this page had copy and no structured data.
const EVENTS_SCHEMA = hubCollectionSchema({
  path: '/hub/events-calendar',
  name: 'Poker Events Calendar | Smarter.Poker',
  description:
    'Live Poker Tournaments, Series, Tour Stops And Public Home Games By Date, Location, Buy In And Game Type, In One Calendar.',
  trail: [['Hub', '/hub'], ['Events Calendar', '/hub/events-calendar']],
});
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
  { key: 'week',     label: 'This Week' },
  { key: 'weekend',  label: 'This Weekend' },
  { key: '14days',   label: 'Next 14 Days' },
  { key: '30days',   label: 'Next 30 Days' },
  { key: '60days',   label: 'Next 60 Days' },
  { key: '90days',   label: 'Next 3 Months' },
  { key: '180days',  label: 'Next 6 Months' },
  { key: '365days',  label: 'Next 12 Months' },
];

const BUY_IN_TIERS = [
  { key: 'all',       label: 'All Buy-Ins', min: null, max: null },
  { key: '0-100',     label: 'Under $100',  min: 0,    max: 100 },
  { key: '100-300',   label: '$100 - $300', min: 100,  max: 300 },
  { key: '300-1000',  label: '$300 - $1K',  min: 300,  max: 1000 },
  { key: '1000-5000', label: '$1K - $5K',   min: 1000, max: 5000 },
  { key: '5000+',     label: '$5K+',        min: 5000, max: null },
];

const GAME_TYPES = [
  { key: 'all',   label: 'All Games' },
  { key: 'NLH',   label: 'NLH' },
  { key: 'PLO',   label: 'PLO' },
  { key: 'Mixed', label: 'Mixed' },
  { key: 'HORSE', label: 'HORSE' },
];

const EVENT_TYPES = [
  { key: 'all',    label: 'All Events' },
  { key: 'daily',  label: 'Daily Tournaments' },
  { key: 'series', label: 'Poker Series' },
  { key: 'tour',   label: 'Tour Events' },
  { key: 'home_game', label: 'Home-Game Tournaments' },
];

const SORT_OPTIONS = [
  { key: 'date',       label: 'Soonest' },
  { key: 'buyin',      label: 'Cheapest' },
  { key: 'buyin_desc', label: 'Most Expensive' },
  { key: 'distance',   label: 'Nearest' },
];

const DISTANCE_OPTIONS = [
  { key: '25',  label: '25 Miles' },
  { key: '50',  label: '50 Miles' },
  { key: '100', label: '100 Miles' },
  { key: '200', label: '200 Miles' },
  { key: '500', label: '500 Miles' },
  { key: 'any', label: 'Any Distance' },
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

/* ───── Source Labels ───── */
const SOURCE_LABELS = {
  daily: 'Daily',
  series: 'Series',
  tour: 'Tour',
  home_game: 'Home Game',
};

async function fetchCalendarData(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const data = await response.json();
  if (data?.success === false) throw new Error(data.error || 'Failed to fetch events');
  return data;
}

/* ───── Event Card Component ───── */
const EventCard = memo(function EventCard({ event, todayKey }) {
  const sourceLabel = SOURCE_LABELS[event.source] || SOURCE_LABELS.daily;
  const dateIsToday = event.event_date === todayKey;

  const href = useMemo(() => {
    if (event.venue_id && event.source === 'daily') return `/hub/venues/${event.venue_id}`;
    if (event.series_id) return `/hub/series/${event.series_id}`;
    if (event.tour_code && event.source === 'tour') return `/hub/poker-series?tour=${encodeURIComponent(event.tour_code)}`;
    if (event.source === 'home_game' && event.club_code) return `/home-game/${encodeURIComponent(event.club_code)}`;
    if (event.source === 'home_game' && event.home_game_id) return '/hub/home-games';
    return null;
  }, [event.venue_id, event.series_id, event.tour_code, event.source, event.club_code, event.home_game_id]);

  // Memoize favicon fallback URL — was rebuilt on every render of every card
  const officialLogoFallback = useMemo(() => {
    const guessedDomain = (event.venue_name || event.event_name || '').toLowerCase().replace(/[^a-z0-9]/g, '') + '.com';
    return `https://www.google.com/s2/favicons?domain=${guessedDomain}&sz=128`;
  }, [event.venue_name, event.event_name]);
  const [imgSrc, setImgSrc] = useState(event.logo_url || officialLogoFallback);

  return (
    <PokerNearMePanelShell as="article" className="ev-card" bodyClassName="ev-card__body" data-today={dateIsToday ? '1' : ''}>
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
          <div className="ev-data-heading">
            <span className="ev-source" data-source={event.source || 'daily'}>
              {sourceLabel}
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
              <PokerNearMeConsoleIcon name="location" className="ec-inline-icon" />
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
            <span className="ev-meta-item ev-start-time">
              <PokerNearMeConsoleIcon name="calendar" className="ec-inline-icon" />
              {formatTime(event.start_time)} {event.state && STATE_TZ[event.state] ? STATE_TZ[event.state] : ''}
            </span>
          )}
          {event.distance_mi != null && (
            <span className="ev-meta-item ev-distance">
              {event.distance_mi < 1 ? '<1' : Math.round(event.distance_mi)} Mi
            </span>
          )}
          {event.recurrence_label && (
            <span className="ev-meta-item ev-recurrence">
              <PokerNearMeConsoleIcon name="event-ticket" className="ec-inline-icon" />
              {event.recurrence_label}
            </span>
          )}
          {event.game_type && event.game_type !== 'Unknown' && (
            <span className="ev-game-type">{event.game_type}</span>
          )}
          {event.is_stale && (
            <span
              className="ev-meta-item ev-stale"
              title={event.last_verified ? `Last verified ${new Date(event.last_verified).toLocaleDateString()}` : 'Not recently verified'}
            >
              Unverified
            </span>
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
    </PokerNearMePanelShell>
  );
});

/* ───── Location Modal ───── */
function LocationModal({ isOpen, onClose, onSetLocation, currentLocation }) {
  const [cityInput, setCityInput] = useState('');
  const [stateInput, setStateInput] = useState('');
  const [gpsLoading, setGpsLoading] = useState(false);
  const [locError, setLocError] = useState('');
  const isMountedRef = useRef(true);
  const { dialogRef, initialFocusRef } = useAccessibleDialog({
    open: isOpen,
    onClose,
  });
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
        setLocError('GPS Not Available. Please Enter A City.');
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
      setLocError('City Not Found. Try Selecting From The List Or Enter A State.');
    }
  };

  return (
    <div className="loc-overlay" onClick={onClose}>
      <PokerNearMePanelShell
        as="section"
        className="loc-modal"
        bodyClassName="loc-modal__body"
        surfaceRef={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="loc-modal-title"
        tabIndex={-1}
        onClick={e => e.stopPropagation()}
      >
        <div className="loc-modal-header">
          <h2 id="loc-modal-title">Change Location</h2>
          <button ref={initialFocusRef} type="button" className="loc-close sp-icon-btn" onClick={onClose} aria-label="Close">
            <PokerNearMeConsoleIcon name="close" className="ec-control-icon" />
          </button>
        </div>

        {locError && (
          <p className="loc-error" role="alert">
            <PokerNearMeConsoleIcon name="alert" className="ec-inline-icon" />
            {locError}
          </p>
        )}

        <button type="button" className="loc-gps-btn" onClick={handleUseGps} disabled={gpsLoading}>
          <PokerNearMeConsoleIcon name="location" className="ec-control-icon" />
          {gpsLoading ? 'Getting Location...' : 'Use My GPS Location'}
        </button>

        <form className="loc-form" onSubmit={handleManualSubmit}>
          <div className="loc-inputs">
            <div className="loc-field">
              <label htmlFor="loc-city-input" className="loc-input-label">City</label>
              <input
                id="loc-city-input"
                type="text"
                placeholder="Example: Las Vegas"
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
          <button type="submit" className="loc-submit">Search This Area</button>
        </form>

        <div className="loc-popular">
          <span className="loc-popular-label">Popular Cities</span>
          <div className="loc-popular-grid">
            {POPULAR_CITIES.map(city => (
              <button type="button" key={city} className="loc-city-btn" onClick={() => handleCitySelect(city)}>
                {city}
              </button>
            ))}
          </div>
        </div>

        {currentLocation && (
          <button type="button" className="loc-clear" onClick={() => { onSetLocation(null); onClose(); }}>
            Clear Location Filter
          </button>
        )}
      </PokerNearMePanelShell>
    </div>
  );
}


export async function getServerSideProps(context) {
  // Render date-dependent controls from one server-owned calendar key. Vercel
  // renders in UTC while a visitor renders in their local timezone; calling
  // `new Date()` independently on both sides marked different day tabs around
  // midnight UTC and made React discard the server tree during hydration.
  const initialDateKey = new Date().toISOString().slice(0, 10);
  try {
    const protocol = process.env.NODE_ENV === 'production' ? 'https' : 'http';
    const host = context.req.headers.host || 'localhost:3000';
    // [B3 FIX] Match server-side default (week) to client useState default ('week') to prevent layout shift
    const url = `${protocol}://${host}/api/poker/events-calendar?dateRange=week&limit=200&sort=date`;
    const data = await fetchJsonWithDeadline(url, { timeoutMs: 5_000 });
    return { props: { fallbackData: data?.success ? data : null, initialDateKey } };
  } catch (err) {
    return { props: { fallbackData: null, initialDateKey } };
  }
}

/* ───── Main Page Component ───── */
export default function EventsCalendarPage({ fallbackData, initialDateKey }) {
  const router = useRouter();
  const initialDate = useMemo(() => {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(initialDateKey || '');
    if (!match) return { year: 1970, month: 0, dayIndex: 4, key: '1970-01-01' };
    const year = Number(match[1]);
    const month = Number(match[2]) - 1;
    const day = Number(match[3]);
    return {
      year,
      month,
      dayIndex: new Date(Date.UTC(year, month, day)).getUTCDay(),
      key: initialDateKey,
    };
  }, [initialDateKey]);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuConfig = useMemo(() => getMenuConfig('events'), []);
  
  // View states: 'list' | 'calendar' | 'map'
  const [viewMode, setViewMode] = useState('list');
  const [calYear, setCalYear] = useState(initialDate.year);
  const [calMonth, setCalMonth] = useState(initialDate.month);
  const [todayKey, setTodayKey] = useState(initialDate.key);
  const [todayDayIndex, setTodayDayIndex] = useState(initialDate.dayIndex);
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
  // After hydration, move the marker to the visitor's local calendar day. The
  // first client render remains byte-for-byte aligned with SSR.
  useEffect(() => {
    const localDateKey = getTodayKey();
    const localNow = new Date();
    setTodayKey(localDateKey);
    setTodayDayIndex(localNow.getDay());
    if (localDateKey.slice(0, 7) !== initialDate.key.slice(0, 7)) {
      setCalYear(localNow.getFullYear());
      setCalMonth(localNow.getMonth());
    }
  }, [initialDate.key]);

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
      } catch (error) {
        const storageError = error instanceof Error ? error.message : String(error);
        console.warn('[EventsCalendar] Failed to parse saved location:', storageError);
      }
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
    [fallbackData, initSsrUrl]
  );

  const { data: apiData, error, isLoading: loading, mutate } = useSWR(
    apiUrl,
    fetchCalendarData,
    { fallback: swrFallback, revalidateOnFocus: false, dedupingInterval: 30000 }
  );

  const selectedDateUrl = useMemo(() => {
    if (viewMode !== 'calendar' || !selectedCalDate) return null;
    const url = new URL(apiUrl, 'https://smarter.poker');
    url.searchParams.delete('calMonth');
    url.searchParams.set('date', selectedCalDate);
    url.searchParams.set('limit', '10000');
    return `${url.pathname}?${url.searchParams.toString()}`;
  }, [apiUrl, selectedCalDate, viewMode]);

  const {
    data: selectedDateData,
    error: selectedDateError,
    isLoading: selectedDateLoading,
  } = useSWR(selectedDateUrl, fetchCalendarData, {
    revalidateOnFocus: false,
    dedupingInterval: 30000,
  });

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
    return (selectedDateData?.events || []).filter(e => e.event_date === selectedCalDate);
  }, [selectedDateData, selectedCalDate]);
  const selectedCalTotal = selectedDateData?.total ?? selectedCalEvents.length;

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
        title="Poker Events Calendar - Find Any Tournament"
        description="Search Live Poker Tournaments By Date, Location, Buy In And Game Type On Smarter.Poker. Daily Tournaments, Series, Tour Stops And Public Home Games In One Calendar. Free To Browse."
        canonical="/hub/events-calendar"
        jsonLd={EVENTS_SCHEMA}
      />
      <UniversalHeader pageDepth={1} onMenuClick={() => setMenuOpen(true)} onBackClick={() => {
        router.back();
      }} />
      <PokerNearMeFamilyNav />
      <HamburgerMenu
        isOpen={menuOpen}
        onClose={() => setMenuOpen(false)}
        direction="right"
        theme="dark"
        menuItems={menuConfig.menuItems}
        bottomLinks={menuConfig.bottomLinks}
      />

      <main className="ec-page" data-pnm-secondary-foundation="interaction-v1">
        <div className="ec-space-bg" />
        <div className="ec-space-overlay" />

        {/* ── Location Active Strip — always at top, just below Global Header ── */}
        <PokerNearMePanelShell as="section" className="ec-location-strip" bodyClassName="ec-location-strip__body" aria-label="Location Filter">
          {userLocation ? (
            <div className="pnm-location-pill">
              <PokerNearMeConsoleIcon name="location" className="ec-control-icon" />
              <span className="pnm-location-label">Location Active</span>
              {userLocation.label && userLocation.label !== 'My Location' && (
                <span className="pnm-location-city">{userLocation.label}</span>
              )}
              <button
                type="button"
                className="pnm-location-clear"
                onClick={() => { handleLocationChange(null); }}
                aria-label="Clear Location"
              ><PokerNearMeConsoleIcon name="close" className="ec-control-icon" /></button>
            </div>
          ) : (
            <button
              type="button"
              className="ec-gps-btn"
              onClick={() => setShowLocationModal(true)}
              id="ec-location-btn"
            >
              <PokerNearMeConsoleIcon name="location" className="ec-control-icon" />
              Set Location
            </button>
          )}
        </PokerNearMePanelShell>

        {/* ── Page Header ── */}
        <PokerNearMePanelShell as="section" className="ec-hero" bodyClassName="ec-hero__body">
          <div className="ec-hero-copy">
          <p className="ec-eyebrow">Live Poker Discovery Network</p>
          <h1 className="ec-title"><span className="ec-white">Events</span> <span className="ec-cyan">Calendar</span></h1>
          <p className="ec-subtitle">
            {loading ? 'Loading...' : `${totalCount.toLocaleString()} Tournaments Found`}
            {stats.sources && !loading && (
              <span className="ec-source-counts">
                &middot; {[
                  stats.sources.daily > 0 && `${stats.sources.daily.toLocaleString()} Daily`,
                  stats.sources.series > 0 && `${stats.sources.series.toLocaleString()} Series`,
                  stats.sources.tour > 0 && `${stats.sources.tour.toLocaleString()} Tour`,
                  stats.sources.home_game > 0 && `${stats.sources.home_game.toLocaleString()} Home Game`
                ].filter(Boolean).join(' · ')}
              </span>
            )}
            {useSmartAgg && !loading && (
              <span className="ec-smart-agg-note">&middot; Recurring Events Showing Next Occurrence</span>
            )}
          </p>
          </div>
          <div className="ec-hero-search">
            <form className="ec-search-wrap" role="search" onSubmit={(e) => { e.preventDefault(); setSearchQuery(searchInput); }}>
              <PokerNearMeConsoleIcon name="search" className="ec-search-icon" />
              <label htmlFor="ec-search-input" className="ec-sr-only">Search Tournaments</label>
              <input
                type="text"
                placeholder="Search"
                value={searchInput}
                onChange={e => handleSearchInput(e.target.value)}
                className="ec-search-input"
                id="ec-search-input"
              />
              {searchInput && (
                <button type="button" className="ec-search-clear" aria-label="Clear Search" onClick={() => { setSearchInput(''); setSearchQuery(''); }}>
                  <PokerNearMeConsoleIcon name="close" className="ec-control-icon" />
                </button>
              )}
            </form>
          </div>
        </PokerNearMePanelShell>
        
        {/* Day of Week Tabs — centered */}
        <PokerNearMePanelShell as="section" className="ec-day-selector" bodyClassName="ec-day-selector__body" aria-label="Day Of Week">
          <div className="ec-day-tabs-row">
            <div className="ec-day-tabs">
              {(() => {
                // [B2 FIX] Compute today index once for all 7 tabs instead of 7× per render
                const DAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
                const todayIdx = todayDayIndex;
                return DAYS.map(day => {
                  const dayIdx = DAYS.indexOf(day);
                  let daysAhead = dayIdx - todayIdx;
                  if (daysAhead < 0) daysAhead += 7;
                  const isToday = daysAhead === 0;
                  const isActive = dayOfWeek === day;
                  return (
                    <button
                      type="button"
                      key={day}
                      className={`ec-day-tab${isActive ? ' active' : ''}${isToday ? ' today' : ''}`}
                      onClick={() => setDayOfWeek(isActive ? '' : day)}
                      aria-pressed={isActive}
                    >
                      {isToday && <PokerNearMeConsoleIcon name="live-games" className="ec-day-today-icon" />}
                      <span className="ec-day-short">{day.substring(0, 3)}</span>
                      <span className="ec-day-full">{day}</span>
                    </button>
                  );
                });
              })()}
            </div>
          </div>
        </PokerNearMePanelShell>

        {/* ── Always-Visible Filter Bar (centered, Poker Near Me style) ── */}
        <PokerNearMePanelShell as="section" className="ec-filter-bar" bodyClassName="ec-filter-bar__body" aria-label="Tournament Filters">

          {/* Event Type — Show All / Daily / Series / Tour */}
          <div className="ec-filter-group">
            <label className="ec-filter-label" htmlFor="ec-event-type">Event Type</label>
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
            <label className="ec-filter-label" htmlFor="ec-date-range">Date Range</label>
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
            <label className="ec-filter-label" htmlFor="ec-buyin">Buy-In</label>
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
            <label className="ec-filter-label" htmlFor="ec-sort-by">Sort By</label>
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
            <label className="ec-filter-label" htmlFor="ec-view-mode">View Mode</label>
            <select
              className="ec-filter-select"
              value={viewMode}
              onChange={e => setViewMode(e.target.value)}
              id="ec-view-mode"
            >
              <option value="list">List View</option>
              <option value="calendar">Calendar View</option>
              <option value="map">Map View</option>
            </select>
          </div>

          {/* Clear all (only if active filters) */}
          {activeFilterCount > 0 && (
            <div className="ec-filter-group ec-filter-group--clear">
              <label className="ec-filter-label">&nbsp;</label>
              <button type="button" className="ec-clear-btn" onClick={clearFilters}>
                Clear ({activeFilterCount})
              </button>
            </div>
          )}
        </PokerNearMePanelShell>

        {/* ── Content ── */}
        <div className="ec-content">
          {loading && (
            <PokerNearMePanelShell as="section" className="ec-loading" bodyClassName="ec-state__body" role="status" aria-live="polite" aria-busy="true">
              <PokerNearMeConsoleIcon name="calendar" className="ec-state-icon" />
              <p>Finding Tournaments...</p>
            </PokerNearMePanelShell>
          )}

          {error && !loading && (
            <PokerNearMePanelShell as="section" className="ec-error" bodyClassName="ec-state__body" role="alert">
              <PokerNearMeConsoleIcon name="alert" className="ec-state-icon" />
              <p>Failed To Load Events</p>
              <p className="ec-error-detail">{error?.message || 'Unknown Error'}</p>
            </PokerNearMePanelShell>
          )}

          {/* ── MAP VIEW ── */}
          {!loading && !error && viewMode === 'map' && (
            <div className="ec-map-view">
              <VenueMap 
                venues={mapEvents}
                userLocation={userLocation}
                fullHeight={true}
                hideLegend={false}
                uniformColor="#ffffff"
                mapEyebrow="Tournament Calendar Map"
                mapTitle="Events Across The Country"
                mapDetail={`${mapEvents.length} Scheduled Locations · Select A Marker For Event Details`}
              />
            </div>
          )}

          {/* ── LIST VIEW ── */}
          {!loading && !error && viewMode === 'list' && (
            <div className="ec-list">
              {events.length === 0 ? (
                <PokerNearMePanelShell as="section" className="ec-empty" bodyClassName="ec-state__body">
                  <PokerNearMeConsoleIcon name="calendar" className="ec-state-icon" />
                  <p className="ec-empty-title">No Tournaments Found</p>
                  <p className="ec-empty-sub">Try Adjusting Your Filters Or Expanding Your Search Area.</p>
                  <button type="button" className="ec-empty-btn" onClick={clearFilters}>Clear All Filters</button>
                </PokerNearMePanelShell>
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
                    <button type="button" className="ec-load-more" onClick={() => setVisibleCount(v => v + 100)}>
                      Show More ({events.length - visibleCount} Remaining)
                    </button>
                  )}
                </>
              )}
            </div>
          )}

          {/* ── CALENDAR VIEW ── */}
          {!loading && !error && viewMode === 'calendar' && (
            <PokerNearMePanelShell as="section" className="ec-calendar" bodyClassName="ec-calendar__body">
              <div className="ec-month-nav">
                <button type="button" className="ec-nav-btn" onClick={goToPrevMonth} aria-label="Previous Month"><PokerNearMeConsoleIcon name="back" className="ec-control-icon" /><span>Previous</span></button>
                <h2 className="ec-month-label">{MONTH_NAMES[calMonth]} {calYear}</h2>
                <button type="button" className="ec-nav-btn" onClick={goToNextMonth} aria-label="Next Month"><span>Next</span><PokerNearMeConsoleIcon name="directions" className="ec-control-icon" /></button>
                <button type="button" className="ec-today-btn" onClick={goToToday} aria-label="Jump To Today">Today</button>
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
                      aria-label={`${MONTH_NAMES[calMonth]} ${cell.day}, ${calYear}${cell.count > 0 ? ` - ${cell.count} event${cell.count !== 1 ? 's' : ''}` : ''}`}
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
                <PokerNearMePanelShell as="section" className="ec-cal-events" bodyClassName="ec-cal-events__body">
                  <h3 className="ec-cal-events-title">
                    {formatDateFull(selectedCalDate)}
                    <span className="ec-cal-events-count">{selectedCalTotal} {selectedCalTotal === 1 ? 'Event' : 'Events'}</span>
                  </h3>
                  {selectedDateLoading ? (
                    <p className="ec-cal-no-events" role="status">Loading Every Event For This Date...</p>
                  ) : selectedDateError ? (
                    <p className="ec-cal-no-events" role="alert">Events For This Date Could Not Be Loaded.</p>
                  ) : selectedCalEvents.length === 0 ? (
                    <p className="ec-cal-no-events">No Events Scheduled For This Date.</p>
                  ) : (
                    selectedCalEvents.map((evt, idx) => (
                      <LazyRender key={idx}>
                        <EventCard event={evt} todayKey={todayKey} />
                      </LazyRender>
                    ))
                  )}
                </PokerNearMePanelShell>
              )}
            </PokerNearMePanelShell>
          )}
        </div>
      </main>

      {/* Location Modal */}
      <LocationModal
        isOpen={showLocationModal}
        onClose={() => setShowLocationModal(false)}
        onSetLocation={handleLocationChange}
        currentLocation={userLocation}
      />

      <style suppressHydrationWarning dangerouslySetInnerHTML={{ __html: styles }} />
    </>
  );
}

const styles = `
  :root {
    --ec-black: #020407;
    --ec-raised: #071018;
    --ec-silver: #c6d0db;
    --ec-muted: #8f9aa8;
    --ec-dim: #65717f;
    --ec-blue: #31a8ff;
    --ec-blue-soft: #8fd4ff;
    --ec-gold: #d6b76a;
    --ec-alert: #ff7078;
  }

  .ec-page {
    min-height: 100vh;
    box-sizing: border-box;
    overflow-x: clip;
    padding: 14px 0 92px;
    background: var(--ec-black);
    color: var(--ec-silver);
    font-family: var(--font-rajdhani), Rajdhani, var(--font-inter), Inter, sans-serif;
  }

  .ec-page *,
  .ec-page *::before,
  .ec-page *::after,
  .loc-overlay *,
  .loc-overlay *::before,
  .loc-overlay *::after {
    box-sizing: border-box;
  }

  body.world-poker-near-me .ec-page {
    background: var(--ec-black) !important;
  }

  .ec-space-bg,
  .ec-space-overlay {
    display: none;
  }

  body.world-poker-near-me .ec-page > .pnc-panel.ec-location-strip,
  body.world-poker-near-me .ec-page > .pnc-panel.ec-hero,
  body.world-poker-near-me .ec-page > .pnc-panel.ec-day-selector,
  body.world-poker-near-me .ec-page > .pnc-panel.ec-filter-bar,
  body.world-poker-near-me .ec-page .pnc-panel.ec-calendar,
  body.world-poker-near-me .ec-page .pnc-panel.ec-loading,
  body.world-poker-near-me .ec-page .pnc-panel.ec-error,
  body.world-poker-near-me .ec-page .pnc-panel.ec-empty,
  body.world-poker-near-me .ec-page .pnc-panel.ev-card,
  body.world-poker-near-me .ec-page .pnc-panel.ec-cal-events,
  body.world-poker-near-me .pnc-panel.loc-modal {
    padding: 0 !important;
    border: 0 !important;
    border-radius: 0 !important;
    background: none !important;
    box-shadow: none !important;
    transform: none !important;
  }

  body.world-poker-near-me .ec-page > .pnc-panel.ec-hero,
  body.world-poker-near-me .ec-page > .pnc-panel.ec-filter-bar {
    display: block !important;
    grid-template-columns: none !important;
  }

  body.world-poker-near-me :is(
    .ec-page > .pnc-panel.ec-location-strip,
    .ec-page > .pnc-panel.ec-hero,
    .ec-page > .pnc-panel.ec-day-selector,
    .ec-page > .pnc-panel.ec-filter-bar,
    .ec-page .pnc-panel.ec-calendar,
    .ec-page .pnc-panel.ec-loading,
    .ec-page .pnc-panel.ec-error,
    .ec-page .pnc-panel.ec-empty,
    .ec-page .pnc-panel.ev-card,
    .ec-page .pnc-panel.ec-cal-events,
    .pnc-panel.loc-modal
  )::before,
  body.world-poker-near-me :is(
    .ec-page > .pnc-panel.ec-location-strip,
    .ec-page > .pnc-panel.ec-hero,
    .ec-page > .pnc-panel.ec-day-selector,
    .ec-page > .pnc-panel.ec-filter-bar,
    .ec-page .pnc-panel.ec-calendar,
    .ec-page .pnc-panel.ec-loading,
    .ec-page .pnc-panel.ec-error,
    .ec-page .pnc-panel.ec-empty,
    .ec-page .pnc-panel.ev-card,
    .ec-page .pnc-panel.ec-cal-events,
    .pnc-panel.loc-modal
  )::after {
    content: none !important;
  }

  body.world-poker-near-me .ec-page .pnc-panel.ev-card:hover,
  body.world-poker-near-me .ec-page .pnc-panel.ev-card:active {
    border: 0 !important;
    background: none !important;
    box-shadow: none !important;
    transform: none !important;
  }

  .ec-location-strip,
  .ec-hero,
  .ec-day-selector,
  .ec-filter-bar {
    width: min(calc(100% - 24px), 1100px) !important;
    margin: 0 auto 14px !important;
  }

  .ec-location-strip__body {
    display: flex;
    min-height: 58px;
    align-items: center;
    justify-content: center;
    padding: 8px clamp(14px, 3vw, 28px);
  }

  .ec-control-icon,
  .ec-inline-icon {
    width: 18px;
    height: 18px;
    flex: 0 0 18px;
  }

  .ec-gps-btn,
  .ec-clear-btn,
  .ec-empty-btn,
  .ec-load-more,
  .ec-nav-btn,
  .ec-today-btn,
  .loc-gps-btn,
  .loc-submit,
  .loc-city-btn,
  .loc-clear {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 7px;
    min-height: 44px;
    aspect-ratio: 348 / 114;
    padding: 0 16px;
    overflow: hidden;
    border: 0;
    border-radius: 0;
    background: transparent url('/images/pnm-console/painted-controls-v1/button-secondary.png') center / contain no-repeat;
    box-shadow: none;
    color: var(--ec-silver);
    cursor: pointer;
    font: 800 12px/1 var(--font-rajdhani), Rajdhani, sans-serif;
    letter-spacing: 0.07em;
    text-align: center;
    text-transform: uppercase;
    white-space: nowrap;
    touch-action: manipulation;
  }

  .ec-empty-btn,
  .ec-today-btn,
  .loc-gps-btn,
  .loc-submit {
    background-image: url('/images/pnm-console/painted-controls-v1/button-primary.png');
    color: #f4f7fb;
  }

  body.world-poker-near-me :is(
    .ec-page .ec-gps-btn,
    .ec-page .ec-clear-btn,
    .ec-page .ec-load-more,
    .ec-page .ec-today-btn
  ) {
    border: 0 !important;
    border-radius: 0 !important;
    background-color: transparent !important;
    background-position: center !important;
    background-repeat: no-repeat !important;
    background-size: contain !important;
    box-shadow: none !important;
  }

  .ec-gps-btn {
    width: 170px;
    max-width: 100%;
  }

  .pnm-location-pill {
    display: flex;
    width: min(100%, 390px);
    min-height: 48px;
    aspect-ratio: 1829 / 313;
    align-items: center;
    gap: 8px;
    padding: 0 clamp(28px, 8%, 52px);
    border: 0;
    border-radius: 0;
    background: transparent url('/images/pnm-console/painted-controls-v1/search-well.webp') center / contain no-repeat;
    box-shadow: none;
    color: var(--ec-silver);
  }

  body.world-poker-near-me .ec-page .pnm-location-pill {
    border: 0 !important;
    border-radius: 0 !important;
    background: transparent url('/images/pnm-console/painted-controls-v1/search-well.webp') center / contain no-repeat !important;
    box-shadow: none !important;
  }

  .pnm-location-label {
    color: var(--ec-blue-soft);
    font: 800 12px/1 var(--font-inter), Inter, sans-serif;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .pnm-location-city {
    min-width: 0;
    overflow: hidden;
    color: var(--ec-muted);
    font: 700 12px/1.2 var(--font-inter), Inter, sans-serif;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .pnm-location-clear,
  .ec-search-clear,
  .loc-close {
    display: inline-grid;
    width: 44px;
    min-width: 44px;
    height: 44px;
    min-height: 44px;
    padding: 0;
    place-items: center;
    border: 0;
    border-radius: 0;
    background: transparent;
    box-shadow: none;
    color: var(--ec-muted);
    cursor: pointer;
    touch-action: manipulation;
  }

  .ec-hero__body {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(280px, 0.58fr);
    align-items: center;
    gap: 20px clamp(22px, 5vw, 64px);
    padding: 26px clamp(20px, 5vw, 52px) 30px;
  }

  .ec-hero-copy {
    display: grid;
    gap: 10px;
    min-width: 0;
  }

  .ec-eyebrow {
    margin: 0;
    color: var(--ec-blue);
    font: 800 12px/1 var(--font-inter), Inter, sans-serif;
    letter-spacing: 0.2em;
    text-transform: uppercase;
  }

  body.world-poker-near-me .ec-page .ec-title {
    margin: 0 !important;
    color: #f4f7fb !important;
    font-size: clamp(34px, 5vw, 58px) !important;
    font-weight: 500 !important;
    line-height: 0.98 !important;
    letter-spacing: -0.025em !important;
    text-shadow: none !important;
    text-transform: uppercase;
  }

  .ec-cyan {
    color: var(--ec-blue-soft);
  }

  body.world-poker-near-me .ec-page .ec-subtitle {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 7px;
    max-width: 720px;
    margin: 0 !important;
    color: var(--ec-muted) !important;
    font: 700 12px/1.5 var(--font-inter), Inter, sans-serif !important;
    letter-spacing: 0.06em !important;
    text-align: left !important;
    text-transform: uppercase;
  }

  .ec-source-counts,
  .ec-smart-agg-note {
    color: var(--ec-dim);
  }

  .ec-smart-agg-note {
    color: #d9b35c;
  }

  .ec-hero-search {
    min-width: 0;
  }

  body.world-poker-near-me .ec-page .ec-search-wrap.ec-search-wrap {
    width: 100% !important;
    min-height: 48px;
    aspect-ratio: 1829 / 313;
    padding: 0 clamp(24px, 8%, 48px) !important;
    border: 0 !important;
    border-radius: 0 !important;
    background: transparent url('/images/pnm-console/painted-controls-v1/search-well.webp') center / contain no-repeat !important;
    box-shadow: none !important;
  }

  body.world-poker-near-me .ec-page .ec-search-input.ec-search-input {
    min-width: 0;
    min-height: 44px;
    padding: 0 8px !important;
    border: 0 !important;
    border-radius: 0 !important;
    background: transparent !important;
    box-shadow: none !important;
    color: #f4f7fb !important;
    font-size: 16px !important;
    outline: 0 !important;
  }

  .ec-search-input::placeholder {
    color: #9aa8b5;
  }

  .ec-day-selector__body {
    padding: 14px clamp(14px, 3vw, 28px);
  }

  .ec-day-tabs-row {
    min-width: 0;
  }

  body.world-poker-near-me .ec-page .ec-day-tabs {
    display: flex !important;
    grid-template-columns: none !important;
    flex-wrap: wrap !important;
    justify-content: center;
    gap: 7px !important;
    padding: 0 !important;
    border: 0 !important;
    border-radius: 0 !important;
    background: none !important;
    box-shadow: none !important;
  }

  body.world-poker-near-me .ec-page .ec-day-tab.ec-day-tab {
    position: relative;
    flex: 0 0 138px;
    min-width: 138px !important;
    min-height: 44px !important;
    aspect-ratio: 348 / 114;
    padding: 0 12px !important;
    border: 0 !important;
    border-radius: 0 !important;
    background: transparent url('/images/pnm-console/painted-controls-v1/button-secondary.png') center / contain no-repeat !important;
    box-shadow: none !important;
    color: var(--ec-silver) !important;
  }

  body.world-poker-near-me .ec-page .ec-day-tab.ec-day-tab.active,
  body.world-poker-near-me .ec-page .ec-day-tab.ec-day-tab[aria-pressed='true'] {
    background-image: url('/images/pnm-console/painted-controls-v1/button-primary.png') !important;
    color: #f4f7fb !important;
  }

  body.world-poker-near-me .ec-page .ec-day-tab.ec-day-tab.today:not(.active) {
    color: var(--ec-blue-soft) !important;
  }

  .ec-day-today-icon {
    width: 18px;
    height: 18px;
    flex: 0 0 18px;
  }

  .ec-day-short {
    display: inline;
  }

  .ec-day-full {
    display: none;
  }

  .ec-filter-bar__body {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
    align-items: end;
    gap: 12px 10px;
    padding: 18px clamp(16px, 4vw, 38px) 22px;
  }

  .ec-filter-group {
    display: grid;
    gap: 6px;
    min-width: 0;
  }

  .ec-filter-label {
    padding-left: 5%;
    color: #aeb9c8;
    font: 800 12px/1.2 var(--font-inter), Inter, sans-serif;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  body.world-poker-near-me .ec-page .ec-filter-select.ec-filter-select {
    width: 100% !important;
    min-width: 0 !important;
    height: auto !important;
    min-height: 44px !important;
    aspect-ratio: 348 / 114;
    padding: 0 12% !important;
    border: 0 !important;
    border-radius: 0 !important;
    background-color: transparent !important;
    background-image: url('/images/pnm-console/painted-controls-v1/button-secondary.png') !important;
    background-position: center !important;
    background-repeat: no-repeat !important;
    background-size: contain !important;
    box-shadow: none !important;
    color: #eef5fb !important;
    font-size: 16px !important;
  }

  .ec-filter-select option,
  .loc-select option {
    background: var(--ec-raised);
    color: #f4f7fb;
  }

  .ec-clear-btn {
    width: 100%;
  }

  .ec-content {
    width: min(calc(100% - 24px), 1100px) !important;
    margin: 0 auto;
    padding: 0 !important;
  }

  .ec-loading,
  .ec-error,
  .ec-empty {
    width: 100%;
    margin: 0;
  }

  .ec-state__body {
    display: grid;
    justify-items: center;
    gap: 10px;
    min-height: 250px;
    align-content: center;
    padding: 28px clamp(18px, 5vw, 48px);
    color: var(--ec-muted);
    text-align: center;
  }

  .ec-state__body p {
    margin: 0;
    color: inherit;
    font: 700 14px/1.5 var(--font-inter), Inter, sans-serif;
  }

  .ec-state-icon {
    width: 48px;
    height: 48px;
    flex: 0 0 48px;
    opacity: 0.85;
  }

  .ec-error .ec-state__body {
    color: var(--ec-alert);
  }

  .ec-error-detail {
    color: #aeb9c8 !important;
    font-size: 12px !important;
  }

  .ec-empty-title {
    color: #f4f7fb !important;
    font-size: 18px !important;
    text-transform: uppercase;
  }

  .ec-empty-btn {
    width: 190px;
    max-width: 100%;
    margin-top: 5px;
  }

  .ec-map-view {
    height: max(600px, calc(100vh - 250px));
    min-height: 600px;
    margin-top: 6px;
    overflow: visible;
    border: 0;
    border-radius: 0;
    box-shadow: none;
  }

  body.world-poker-near-me .ec-page .ec-map-view {
    overflow: visible !important;
    border: 0 !important;
    border-radius: 0 !important;
    box-shadow: none !important;
  }

  .ec-date-group {
    margin-bottom: 18px;
  }

  .ec-date-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    min-height: 44px;
    margin-bottom: 7px;
    padding: 0 8px 7px;
    border-bottom: 1px solid #35414c;
  }

  .ec-date-header.today {
    border-bottom-color: var(--ec-blue);
  }

  .ec-date-label {
    color: var(--ec-silver);
    font-size: 15px;
    font-weight: 800;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }

  .ec-date-header.today .ec-date-label {
    color: var(--ec-blue-soft);
  }

  .ec-date-count {
    padding-left: 9px;
    border-left: 1px solid #526170;
    color: #aeb9c8;
    font: 800 12px/1.2 var(--font-inter), Inter, sans-serif;
  }

  .ec-load-more {
    width: min(100%, 280px);
    margin: 16px auto 0;
  }

  .ev-card {
    width: 100%;
    margin: 0 0 8px;
  }

  .ev-card__body {
    display: flex;
    align-items: stretch;
    min-width: 0;
    padding: 0;
  }

  .ev-card-logo {
    display: grid;
    width: 92px;
    min-height: 112px;
    flex: 0 0 92px;
    place-items: center;
    border-right: 1px solid #27333e;
  }

  .ev-logo-img {
    width: 64px;
    height: 64px;
    object-fit: contain;
  }

  .ev-card-data {
    display: grid;
    flex: 1 1 auto;
    gap: 8px;
    min-width: 0;
    align-content: center;
    padding: 16px clamp(14px, 3vw, 26px);
  }

  .ev-data-top {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 14px;
    min-width: 0;
  }

  .ev-data-heading {
    flex: 1 1 auto;
    min-width: 0;
  }

  .ev-data-numbers {
    display: grid;
    flex: 0 0 auto;
    gap: 3px;
    text-align: right;
  }

  .ev-source,
  .ev-game-type,
  .ev-stale,
  .ev-tour-code,
  .ev-event-count {
    display: inline-flex;
    align-items: center;
    min-height: 20px;
    padding-left: 8px;
    border-left: 1px solid #526170;
    color: var(--ec-blue-soft);
    font: 800 12px/1.2 var(--font-inter), Inter, sans-serif;
    letter-spacing: 0.05em;
    text-transform: uppercase;
  }

  .ev-source[data-source='tour'],
  .ev-source[data-source='home_game'],
  .ev-tour-code,
  .ev-gtd {
    color: var(--ec-gold);
  }

  .ev-source[data-source='series'],
  .ev-event-count {
    color: var(--ec-silver);
  }

  .ev-name {
    margin: 5px 0 0;
    color: #f4f7fb;
    font: 800 16px/1.3 var(--font-inter), Inter, sans-serif;
  }

  .ev-name-link {
    color: inherit;
    text-decoration: none;
  }

  .ev-name-link:focus-visible,
  .ev-venue-link:focus-visible {
    outline: 2px solid var(--ec-blue-soft);
    outline-offset: 3px;
  }

  .ev-meta,
  .ev-badges {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 7px 12px;
  }

  .ev-meta-item,
  .ev-stop-name {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    color: var(--ec-muted);
    font: 600 12px/1.35 var(--font-inter), Inter, sans-serif;
  }

  .ev-stop-name {
    color: #9aa8b5;
  }

  .ev-start-time,
  .ev-distance,
  .ev-venue-link {
    color: var(--ec-blue-soft);
  }

  .ev-venue-link {
    font-weight: 700;
    text-decoration: none;
  }

  .ev-recurrence {
    color: #d9b35c;
  }

  .ev-stale {
    color: var(--ec-alert);
  }

  .ev-buyin {
    color: #f4f7fb;
    font-size: 18px;
    font-weight: 800;
  }

  .ev-buyin-range {
    color: #9aa8b5;
    font: 700 12px/1.3 var(--font-inter), Inter, sans-serif;
  }

  .ev-gtd {
    font: 800 12px/1.3 var(--font-inter), Inter, sans-serif;
  }

  .ec-calendar {
    width: 100%;
    margin: 0;
  }

  .ec-calendar__body {
    display: grid;
    gap: 16px;
    padding: 22px clamp(14px, 4vw, 38px) 28px;
  }

  .ec-month-nav {
    display: grid;
    grid-template-columns: 144px minmax(180px, 1fr) 144px 132px;
    align-items: center;
    gap: 8px;
  }

  .ec-nav-btn,
  .ec-today-btn {
    width: 100%;
  }

  .ec-month-label {
    min-width: 0;
    margin: 0;
    color: #f4f7fb;
    font-size: 22px;
    font-weight: 700;
    letter-spacing: 0.03em;
    text-align: center;
  }

  .ec-grid-header,
  .ec-grid {
    display: grid;
    grid-template-columns: repeat(7, minmax(0, 1fr));
  }

  .ec-grid-header {
    border-bottom: 1px solid #35414c;
  }

  .ec-day-hdr {
    min-width: 0;
    padding: 8px 2px;
    color: var(--ec-muted);
    font: 800 12px/1.2 var(--font-inter), Inter, sans-serif;
    letter-spacing: 0.06em;
    text-align: center;
    text-transform: uppercase;
  }

  .ec-grid {
    overflow: hidden;
    border-bottom: 1px solid #27333e;
  }

  .ec-cell {
    display: flex;
    min-width: 0;
    min-height: 76px;
    align-items: center;
    flex-direction: column;
    padding: 8px 3px;
    border: 0;
    border-right: 1px solid #202a33;
    border-bottom: 1px solid #202a33;
    border-radius: 0;
    background: #050a0f;
    box-shadow: none;
    color: var(--ec-silver);
    cursor: default;
  }

  .ec-cell:nth-child(7n) {
    border-right: 0;
  }

  .ec-cell.has-day {
    cursor: pointer;
  }

  .ec-cell.today {
    color: var(--ec-blue-soft);
  }

  .ec-cell.selected {
    background: #081724;
    color: #f4f7fb;
  }

  .ec-cell.empty {
    background: #03070a;
  }

  .ec-day-num {
    display: grid;
    min-width: 28px;
    min-height: 28px;
    place-items: center;
    color: inherit;
    font: 800 13px/1 var(--font-inter), Inter, sans-serif;
  }

  .ec-day-num.today {
    border-bottom: 2px solid var(--ec-blue);
    color: var(--ec-blue-soft);
  }

  .ec-dot-row {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    justify-content: center;
    gap: 4px;
    margin-top: 7px;
  }

  .ec-dot {
    width: 12px;
    height: 2px;
    background: var(--ec-blue);
  }

  .ec-dot-more {
    color: #aeb9c8;
    font: 800 12px/1 var(--font-inter), Inter, sans-serif;
  }

  .ec-cal-events {
    width: 100%;
    margin: 2px 0 0;
  }

  .ec-cal-events__body {
    display: grid;
    gap: 10px;
    padding: 18px clamp(14px, 3vw, 28px);
  }

  .ec-cal-events-title {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 9px;
    margin: 0;
    color: #f4f7fb;
    font-size: 17px;
    font-weight: 800;
  }

  .ec-cal-events-count {
    padding-left: 9px;
    border-left: 1px solid #526170;
    color: var(--ec-muted);
    font-size: 12px;
  }

  .ec-cal-no-events {
    margin: 0;
    padding: 12px 0;
    color: var(--ec-muted);
    font: 700 13px/1.4 var(--font-inter), Inter, sans-serif;
  }

  .loc-overlay {
    position: fixed;
    inset: 0;
    z-index: 1000;
    display: grid;
    overflow-y: auto;
    place-items: center;
    padding: max(env(safe-area-inset-top, 0px), 20px) 18px max(env(safe-area-inset-bottom, 0px), 20px);
    background: rgba(0, 0, 0, 0.84);
  }

  .loc-modal {
    width: min(100%, 540px);
    max-height: 90vh;
    margin: auto;
    overflow-y: auto;
  }

  .loc-modal__body {
    display: grid;
    gap: 16px;
    padding: 22px clamp(18px, 4vw, 34px) 28px;
  }

  .loc-modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
  }

  .loc-modal-header h2 {
    margin: 0;
    color: #f4f7fb;
    font-size: 22px;
    font-weight: 800;
    letter-spacing: 0.05em;
    text-transform: uppercase;
  }

  .loc-error {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 0;
    padding-left: 10px;
    border-left: 2px solid var(--ec-alert);
    color: var(--ec-alert);
    font: 700 13px/1.4 var(--font-inter), Inter, sans-serif;
  }

  .loc-gps-btn,
  .loc-submit,
  .loc-clear {
    width: min(100%, 230px);
    justify-self: center;
  }

  .loc-form {
    display: grid;
    gap: 12px;
    margin: 0;
  }

  .loc-inputs {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 140px;
    gap: 10px;
  }

  .loc-field {
    display: grid;
    gap: 5px;
    min-width: 0;
  }

  .loc-input-label,
  .loc-popular-label {
    padding-left: 5%;
    color: #aeb9c8;
    font: 800 12px/1.2 var(--font-inter), Inter, sans-serif;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  body.world-poker-near-me .loc-modal .loc-input,
  body.world-poker-near-me .loc-modal .loc-select {
    width: 100%;
    min-width: 0;
    min-height: 44px;
    border: 0 !important;
    border-radius: 0 !important;
    background-color: transparent !important;
    background-position: center !important;
    background-repeat: no-repeat !important;
    background-size: contain !important;
    box-shadow: none !important;
    color: #f4f7fb !important;
    font-size: 16px !important;
    outline: 0 !important;
  }

  body.world-poker-near-me .loc-modal .loc-input {
    aspect-ratio: 1829 / 313;
    padding: 0 10% !important;
    background-image: url('/images/pnm-console/painted-controls-v1/search-well.webp') !important;
  }

  .loc-input::placeholder {
    color: #9aa8b5;
  }

  body.world-poker-near-me .loc-modal .loc-select {
    aspect-ratio: 348 / 114;
    padding: 0 14% !important;
    background-image: url('/images/pnm-console/painted-controls-v1/button-secondary.png') !important;
  }

  .loc-popular {
    display: grid;
    gap: 10px;
  }

  .loc-popular-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 7px;
  }

  .loc-city-btn {
    width: 100%;
    min-width: 0;
    padding: 0 10px;
    font-size: 12px;
  }

  :is(
    .ec-gps-btn,
    .ec-clear-btn,
    .ec-empty-btn,
    .ec-load-more,
    .ec-nav-btn,
    .ec-today-btn,
    .loc-gps-btn,
    .loc-submit,
    .loc-city-btn,
    .loc-clear,
    .pnm-location-clear,
    .ec-search-clear,
    .loc-close,
    .ec-day-tab,
    .ec-cell
  ):focus-visible,
  .ec-filter-select:focus-visible,
  .ec-search-input:focus-visible,
  .loc-input:focus-visible,
  .loc-select:focus-visible {
    outline: 2px solid var(--ec-blue-soft) !important;
    outline-offset: -5px !important;
  }

  :is(
    .ec-gps-btn,
    .ec-clear-btn,
    .ec-empty-btn,
    .ec-load-more,
    .ec-nav-btn,
    .ec-today-btn,
    .loc-gps-btn,
    .loc-submit,
    .loc-city-btn,
    .loc-clear,
    .pnm-location-clear,
    .ec-search-clear,
    .loc-close,
    .ec-day-tab,
    .ec-cell
  ):active {
    filter: brightness(1.15);
  }

  .ec-sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    clip-path: inset(50%);
    white-space: nowrap;
  }

  @media (min-width: 768px) {
    .ec-day-short {
      display: none;
    }

    .ec-day-full {
      display: inline;
    }
  }

  @media (max-width: 760px) {
    .ec-location-strip,
    .ec-hero,
    .ec-day-selector,
    .ec-filter-bar,
    .ec-content {
      width: min(calc(100% - 16px), 1100px) !important;
    }

    .ec-hero__body {
      grid-template-columns: 1fr;
      gap: 16px;
      padding: 22px 16px 24px;
    }

    .ec-hero-search {
      width: min(100%, 440px);
    }

    .ec-filter-bar__body {
      grid-template-columns: repeat(2, minmax(0, 1fr));
      padding: 16px 14px 20px;
    }

    .ec-map-view {
      height: max(520px, calc(100vh - 190px));
      min-height: 520px;
    }

    .ev-card__body {
      display: grid;
      grid-template-columns: 72px minmax(0, 1fr);
    }

    .ev-card-logo {
      width: 72px;
      min-height: 100%;
      flex-basis: 72px;
    }

    .ev-logo-img {
      width: 48px;
      height: 48px;
    }

    .ev-data-top {
      display: grid;
    }

    .ev-data-numbers {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 6px 12px;
      text-align: left;
    }

    .ec-month-nav {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .ec-month-label {
      grid-column: 1 / -1;
      grid-row: 1;
    }

    .ec-nav-btn {
      grid-row: 2;
    }

    .ec-today-btn {
      grid-column: 1 / -1;
      width: min(100%, 170px);
      justify-self: center;
    }

    .ec-cell {
      min-height: 58px;
    }
  }

  @media (max-width: 480px) {
    .ec-filter-bar__body {
      grid-template-columns: 1fr;
    }

    .ec-filter-label {
      padding-left: 7%;
    }

    .loc-inputs,
    .loc-popular-grid {
      grid-template-columns: 1fr;
    }

    .loc-city-btn {
      width: min(100%, 240px);
      justify-self: center;
    }

    .ec-grid {
      font-size: 12px;
    }

    .ec-cell {
      min-height: 52px;
      padding-inline: 1px;
    }

    .ec-dot {
      width: 8px;
    }

    .ec-day-hdr {
      letter-spacing: 0;
    }
  }
`;
