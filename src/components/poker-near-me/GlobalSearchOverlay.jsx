/**
 * GlobalSearchOverlay.jsx
 *
 * Google-style full-screen search overlay for Poker Near Me.
 * Activated when user clicks/taps the search bar on the lobby page.
 *
 * Features:
 *  - Completely decoupled from GPS / user location (location = null)
 *  - Universal fuzzy search: city, state, venue name, tournament, series, tour
 *  - Two phases: INPUT (suggestions + history) → RESULTS (sectioned grid)
 *  - Dismisses cleanly without touching lobby state
 */

import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';

// ─── Popular city suggestions for typeahead ───
const POPULAR_CITIES = [
  'Las Vegas, NV', 'Los Angeles, CA', 'Phoenix, AZ', 'Houston, TX', 'Miami, FL',
  'New York, NY', 'Chicago, IL', 'Denver, CO', 'Atlanta, GA', 'Seattle, WA',
  'San Francisco, CA', 'Dallas, TX', 'Orlando, FL', 'San Diego, CA', 'Tampa, FL',
  'Portland, OR', 'Nashville, TN', 'Austin, TX', 'New Orleans, LA', 'Philadelphia, PA',
  'Detroit, MI', 'Minneapolis, MN', 'Boston, MA', 'Sacramento, CA', 'Reno, NV',
  'Atlantic City, NJ', 'Biloxi, MS', 'Tunica, MS', 'Cherokee, NC', 'Tulsa, OK',
  'Oklahoma City, OK', 'Kansas City, MO', 'Salt Lake City, UT', 'Memphis, TN',
  'Charlotte, NC', 'Pittsburgh, PA', 'Cincinnati, OH', 'Cleveland, OH', 'Columbus, OH',
  'Shreveport, LA', 'Bossier City, LA', 'Biloxi, MS', 'Laughlin, NV', 'Henderson, NV',
];

// ─── Venue type badge colors ───
const VENUE_TYPE_STYLES = {
  casino: { bg: 'rgba(212, 168, 83, 0.15)', color: '#d4a853', label: 'Casino' },
  card_room: { bg: 'rgba(110, 231, 239, 0.12)', color: '#6ee7ef', label: 'Poker Club' },
  poker_club: { bg: 'rgba(110, 231, 239, 0.12)', color: '#6ee7ef', label: 'Poker Club' },
  charity: { bg: 'rgba(167, 139, 250, 0.12)', color: '#a78bfa', label: 'Charity' },
  tour_stop: { bg: 'rgba(251, 113, 133, 0.12)', color: '#fb7185', label: 'Tour Stop' },
  series: { bg: 'rgba(52, 211, 153, 0.12)', color: '#34d399', label: 'Series' },
};

// ─── Inline VenueResultCard ───
function VenueResultCard({ venue, onClick }) {
  const typeStyle = VENUE_TYPE_STYLES[venue.venue_type] || VENUE_TYPE_STYLES.card_room;
  const city = [venue.city, venue.state].filter(Boolean).join(', ');

  return (
    <button
      onClick={() => onClick?.(venue)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        width: '100%',
        padding: '12px 16px',
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(110,231,239,0.08)',
        borderRadius: 12,
        cursor: 'pointer',
        textAlign: 'left',
        transition: 'all 0.18s',
        fontFamily: 'Inter, system-ui, sans-serif',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.background = 'rgba(110,231,239,0.07)';
        e.currentTarget.style.borderColor = 'rgba(110,231,239,0.2)';
      }}
      onMouseLeave={e => {
        e.currentTarget.style.background = 'rgba(255,255,255,0.03)';
        e.currentTarget.style.borderColor = 'rgba(110,231,239,0.08)';
      }}
    >
      {/* Venue logo or fallback icon */}
      <div style={{
        width: 44, height: 44, borderRadius: 10, flexShrink: 0,
        background: 'rgba(255,255,255,0.06)',
        border: '1px solid rgba(255,255,255,0.1)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        overflow: 'hidden',
      }}>
        {venue.logo_url || venue.profile_photo_url ? (
          <img
            src={venue.logo_url || venue.profile_photo_url}
            alt={venue.name}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            onError={e => { e.target.style.display = 'none'; }}
          />
        ) : (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="rgba(200,214,229,0.3)" strokeWidth="1.5">
            <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
            <polyline points="9 22 9 12 15 12 15 22" />
          </svg>
        )}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 14, fontWeight: 700, color: '#e0e8f0',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          letterSpacing: '-0.2px',
        }}>
          {venue.name}
        </div>
        {city && (
          <div style={{ fontSize: 12, color: 'rgba(200,214,229,0.5)', marginTop: 2 }}>
            {city}
          </div>
        )}
      </div>

      <div style={{
        flexShrink: 0,
        padding: '3px 8px',
        borderRadius: 6,
        background: typeStyle.bg,
        fontSize: 10,
        fontWeight: 700,
        color: typeStyle.color,
        textTransform: 'uppercase',
        letterSpacing: '0.06em',
      }}>
        {typeStyle.label}
      </div>
    </button>
  );
}

// ─── Inline TourResultCard ───
function TourResultCard({ tour, onClick }) {
  const TOUR_COLORS = {
    'WSOP': '#c9a227', 'WPT': '#dc2626', 'WSOPC': '#c9a227',
    'MSPT': '#3b82f6', 'RGPS': '#10b981', 'PGT': '#8b5cf6',
  };
  const color = TOUR_COLORS[tour.tour_code] || '#6ee7ef';

  return (
    <button
      onClick={() => onClick?.(tour)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        width: '100%',
        padding: '12px 16px',
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(110,231,239,0.08)',
        borderRadius: 12,
        cursor: 'pointer',
        textAlign: 'left',
        transition: 'all 0.18s',
        fontFamily: 'Inter, system-ui, sans-serif',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.background = 'rgba(110,231,239,0.07)';
        e.currentTarget.style.borderColor = 'rgba(110,231,239,0.2)';
      }}
      onMouseLeave={e => {
        e.currentTarget.style.background = 'rgba(255,255,255,0.03)';
        e.currentTarget.style.borderColor = 'rgba(110,231,239,0.08)';
      }}
    >
      <div style={{
        width: 44, height: 44, borderRadius: 10, flexShrink: 0,
        background: `${color}18`,
        border: `1.5px solid ${color}40`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        overflow: 'hidden',
      }}>
        {tour.logo_url ? (
          <img src={tour.logo_url} alt={tour.tour_name} style={{ width: '100%', height: '100%', objectFit: 'contain', padding: 4 }} onError={e => { e.target.style.display = 'none'; }} />
        ) : (
          <span style={{ fontSize: 11, fontWeight: 900, color, letterSpacing: '-0.5px' }}>{tour.tour_code || '?'}</span>
        )}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: '#e0e8f0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {tour.tour_name || tour.tour_code}
        </div>
        <div style={{ fontSize: 12, color: 'rgba(200,214,229,0.5)', marginTop: 2 }}>
          {tour.regions?.slice(0, 2).join(' • ') || 'Traveling Tour'}
        </div>
      </div>

      <div style={{
        flexShrink: 0, padding: '3px 8px', borderRadius: 6,
        background: `${color}20`, fontSize: 10, fontWeight: 700,
        color, textTransform: 'uppercase', letterSpacing: '0.06em',
      }}>
        Tour
      </div>
    </button>
  );
}

// ─── Inline SeriesResultCard ───
function SeriesResultCard({ series, onClick }) {
  const city = [series.city, series.state].filter(Boolean).join(', ');
  return (
    <button
      onClick={() => onClick?.(series)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        width: '100%',
        padding: '12px 16px',
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(110,231,239,0.08)',
        borderRadius: 12,
        cursor: 'pointer',
        textAlign: 'left',
        transition: 'all 0.18s',
        fontFamily: 'Inter, system-ui, sans-serif',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.background = 'rgba(52,211,153,0.06)';
        e.currentTarget.style.borderColor = 'rgba(52,211,153,0.2)';
      }}
      onMouseLeave={e => {
        e.currentTarget.style.background = 'rgba(255,255,255,0.03)';
        e.currentTarget.style.borderColor = 'rgba(110,231,239,0.08)';
      }}
    >
      <div style={{
        width: 44, height: 44, borderRadius: 10, flexShrink: 0,
        background: 'rgba(52,211,153,0.1)',
        border: '1.5px solid rgba(52,211,153,0.25)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#34d399" strokeWidth="2">
          <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
        </svg>
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: '#e0e8f0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {series.name || series.series_name}
        </div>
        {city && <div style={{ fontSize: 12, color: 'rgba(200,214,229,0.5)', marginTop: 2 }}>{city}</div>}
      </div>

      <div style={{
        flexShrink: 0, padding: '3px 8px', borderRadius: 6,
        background: 'rgba(52,211,153,0.12)', fontSize: 10, fontWeight: 700,
        color: '#34d399', textTransform: 'uppercase', letterSpacing: '0.06em',
      }}>
        Series
      </div>
    </button>
  );
}

// ─── Section Header ───
function SectionHeader({ icon, label, count }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8,
      padding: '0 4px 8px',
      borderBottom: '1px solid rgba(110,231,239,0.08)',
      marginBottom: 10,
    }}>
      {icon}
      <span style={{ fontSize: 11, fontWeight: 800, color: 'rgba(200,214,229,0.5)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
        {label}
      </span>
      {count > 0 && (
        <span style={{
          marginLeft: 'auto', fontSize: 11, fontWeight: 700,
          color: 'rgba(110,231,239,0.6)',
          background: 'rgba(110,231,239,0.08)',
          padding: '1px 7px', borderRadius: 10,
        }}>
          {count}
        </span>
      )}
    </div>
  );
}

// ─── Loading Skeleton ───
function SearchSkeletons() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {[1, 2, 3, 4, 5].map(i => (
        <div key={i} style={{
          height: 68, borderRadius: 12,
          background: 'linear-gradient(90deg, rgba(255,255,255,0.04) 25%, rgba(255,255,255,0.07) 50%, rgba(255,255,255,0.04) 75%)',
          backgroundSize: '200% 100%',
          animation: 'gsearch-shimmer 1.5s ease-in-out infinite',
          animationDelay: `${i * 0.1}s`,
        }} />
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════
export default function GlobalSearchOverlay({
  isOpen,
  onClose,
  // Search state (controlled from parent)
  searchQuery,
  onSearchChange,
  // Data for in-memory fuzzy matching
  allTours = [],
  allSeries = [],
  // Search history
  searchHistory = [],
  onHistorySelect,
  // Callback when user picks a venue to open
  onVenueClick,
  onTourClick,
  onSeriesClick,
  // Fetch helper from parent (for venues API)
  cachedFetch,
}) {
  const inputRef = useRef(null);
  const [phase, setPhase] = useState('input'); // 'input' | 'results'
  const [localQuery, setLocalQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [venueResults, setVenueResults] = useState([]);
  const [tourResults, setTourResults] = useState([]);
  const [seriesResults, setSeriesResults] = useState([]);
  const [citySuggestions, setCitySuggestions] = useState([]);
  const debounceRef = useRef(null);

  // Auto-focus input when opened
  useEffect(() => {
    if (isOpen) {
      setPhase('input');
      setLocalQuery(searchQuery || '');
      setVenueResults([]);
      setTourResults([]);
      setSeriesResults([]);
      setCitySuggestions([]);
      // Delay focus slightly so animation completes
      setTimeout(() => inputRef.current?.focus(), 120);
    }
  }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  // ESC to close
  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === 'Escape') onClose?.();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  // Lock body scroll when open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  // Fuzzy match tours in memory
  const matchTours = useCallback((q) => {
    const lower = q.toLowerCase();
    return allTours.filter(t => {
      if (!t) return false;
      return (
        t.tour_name?.toLowerCase().includes(lower) ||
        t.tour_code?.toLowerCase().includes(lower) ||
        (Array.isArray(t.regions) && t.regions.some(r => r?.toLowerCase().includes(lower))) ||
        (Array.isArray(t.stops_2026) && t.stops_2026.some(s =>
          s?.location?.toLowerCase().includes(lower) || s?.name?.toLowerCase().includes(lower)
        )) ||
        (Array.isArray(t.series_2026) && t.series_2026.some(s =>
          s?.location?.toLowerCase().includes(lower) || s?.name?.toLowerCase().includes(lower)
        ))
      );
    }).slice(0, 8);
  }, [allTours]);

  // Fuzzy match series in memory
  const matchSeries = useCallback((q) => {
    const lower = q.toLowerCase();
    return allSeries.filter(s => {
      if (!s) return false;
      return (
        s.name?.toLowerCase().includes(lower) ||
        s.series_name?.toLowerCase().includes(lower) ||
        s.city?.toLowerCase().includes(lower) ||
        s.state?.toLowerCase().includes(lower) ||
        s.venue_name?.toLowerCase().includes(lower)
      );
    }).slice(0, 8);
  }, [allSeries]);

  // Live city suggestions as user types
  const updateCitySuggestions = useCallback((q) => {
    if (q.trim().length < 2) { setCitySuggestions([]); return; }
    const lower = q.toLowerCase();
    const matches = POPULAR_CITIES.filter(c => c.toLowerCase().includes(lower)).slice(0, 5);
    setCitySuggestions(matches);
  }, []);

  // Handle input changes
  const handleInputChange = useCallback((e) => {
    const val = e.target.value;
    setLocalQuery(val);
    onSearchChange?.(val);

    // Update city typeahead immediately
    updateCitySuggestions(val);

    // Switch back to input phase if user clears query
    if (!val.trim()) {
      setPhase('input');
      setVenueResults([]);
      setTourResults([]);
      setSeriesResults([]);
    }
    // Debounce live in-memory matching for tours/series
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (val.trim().length >= 2) {
      debounceRef.current = setTimeout(() => {
        setTourResults(matchTours(val.trim()));
        setSeriesResults(matchSeries(val.trim()));
      }, 200);
    }
  }, [onSearchChange, updateCitySuggestions, matchTours, matchSeries]);

  // Execute full search (on Enter or button click)
  const handleSubmit = useCallback(async (e, overrideQuery) => {
    e?.preventDefault?.();
    const query = (overrideQuery || localQuery).trim();
    if (!query) return;

    inputRef.current?.blur();
    setPhase('results');
    setIsLoading(true);
    setCitySuggestions([]);

    // Parallel: venues API + in-memory tours/series
    const venueUrl = `/api/poker/venues?limit=200&offset=0&search=${encodeURIComponent(query)}&sort=trust`;

    try {
      const [venueData] = await Promise.all([
        cachedFetch ? cachedFetch(venueUrl) : fetch(venueUrl).then(r => r.json()),
      ]);
      const venues = venueData?.data || venueData?.venues || (Array.isArray(venueData) ? venueData : []);
      setVenueResults(venues);
    } catch (err) {
      console.error('[GlobalSearch] Venue fetch failed:', err);
      setVenueResults([]);
    }

    // Tours + series are already in memory — match immediately
    setTourResults(matchTours(query));
    setSeriesResults(matchSeries(query));
    setIsLoading(false);
  }, [localQuery, cachedFetch, matchTours, matchSeries]);

  // Handle suggestion / city click
  const handleSuggestionClick = useCallback((suggestion) => {
    setLocalQuery(suggestion);
    onSearchChange?.(suggestion);
    handleSubmit(null, suggestion);
  }, [onSearchChange, handleSubmit]);

  // Handle history click
  const handleHistoryClick = useCallback((query) => {
    setLocalQuery(query);
    onSearchChange?.(query);
    handleSubmit(null, query);
    onHistorySelect?.(query);
  }, [onSearchChange, handleSubmit, onHistorySelect]);

  const totalResults = venueResults.length + tourResults.length + seriesResults.length;
  const hasResults = totalResults > 0;

  if (!isOpen) return null;

  return (
    <>
      {/* ── Inject keyframe animations ── */}
      <style>{`
        @keyframes gsearch-in {
          from { opacity: 0; transform: translateY(-12px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes gsearch-shimmer {
          0%   { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
        @keyframes gsearch-underline {
          from { width: 0; }
          to   { width: 100%; }
        }
        .gso-close-btn:hover { background: rgba(255,255,255,0.08) !important; }
        .gso-suggestion:hover { background: rgba(110,231,239,0.07) !important; }
        .gso-history-item:hover { background: rgba(255,255,255,0.05) !important; }
      `}</style>

      {/* ── Full-screen overlay ── */}
      <div
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 9999,
          background: 'rgba(4, 10, 20, 0.98)',
          backdropFilter: 'blur(24px)',
          WebkitBackdropFilter: 'blur(24px)',
          display: 'flex',
          flexDirection: 'column',
          fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
          animation: 'gsearch-in 0.22s ease',
          overflowY: 'hidden',
        }}
        role="dialog"
        aria-modal="true"
        aria-label="Search Poker Venues, Tours, and Series"
      >

        {/* ── HEADER: back button + search input + close ── */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '12px 16px',
          borderBottom: '1px solid rgba(110,231,239,0.08)',
          flexShrink: 0,
        }}>
          {/* Back / Close button */}
          <button
            className="gso-close-btn"
            onClick={onClose}
            aria-label="Close search"
            style={{
              flexShrink: 0,
              width: 40, height: 40,
              borderRadius: '50%',
              border: 'none',
              background: 'rgba(255,255,255,0.04)',
              color: 'rgba(200,214,229,0.7)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer',
              transition: 'background 0.15s',
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M19 12H5M12 5l-7 7 7 7" />
            </svg>
          </button>

          {/* Search form */}
          <form
            onSubmit={handleSubmit}
            style={{ flex: 1, position: 'relative' }}
          >
            <div style={{ position: 'relative' }}>
              {/* Search icon */}
              <svg
                width="18" height="18"
                viewBox="0 0 24 24" fill="none"
                stroke="rgba(110,231,239,0.5)" strokeWidth="2"
                style={{ position: 'absolute', left: 0, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}
              >
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>

              <input
                ref={inputRef}
                type="text"
                value={localQuery}
                onChange={handleInputChange}
                placeholder="Search City, Venue, Tour, Series, Tournament..."
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
                style={{
                  width: '100%',
                  paddingLeft: 30,
                  paddingRight: localQuery ? 36 : 0,
                  paddingTop: 8,
                  paddingBottom: 8,
                  background: 'transparent',
                  border: 'none',
                  outline: 'none',
                  fontSize: 18,
                  fontWeight: 500,
                  color: '#e0e8f0',
                  letterSpacing: '-0.3px',
                  fontFamily: 'inherit',
                  caretColor: '#6ee7ef',
                }}
              />

              {/* Animated underline */}
              <div style={{
                position: 'absolute',
                bottom: -2,
                left: 30,
                right: 0,
                height: 2,
                background: 'linear-gradient(90deg, #6ee7ef, #a78bfa)',
                borderRadius: 2,
                animation: 'gsearch-underline 0.3s ease',
              }} />

              {/* Clear button */}
              {localQuery && (
                <button
                  type="button"
                  onClick={() => {
                    setLocalQuery('');
                    onSearchChange?.('');
                    setPhase('input');
                    setVenueResults([]);
                    setTourResults([]);
                    setSeriesResults([]);
                    setCitySuggestions([]);
                    inputRef.current?.focus();
                  }}
                  style={{
                    position: 'absolute',
                    right: 0,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    width: 28, height: 28,
                    borderRadius: '50%',
                    border: 'none',
                    background: 'rgba(255,255,255,0.06)',
                    color: 'rgba(200,214,229,0.5)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    cursor: 'pointer',
                    fontSize: 16,
                    lineHeight: 1,
                  }}
                  aria-label="Clear search"
                >
                  ×
                </button>
              )}
            </div>
          </form>

          {/* Search button (mobile) */}
          {localQuery.trim() && (
            <button
              onClick={handleSubmit}
              style={{
                flexShrink: 0,
                padding: '8px 16px',
                borderRadius: 8,
                border: 'none',
                background: 'linear-gradient(135deg, rgba(110,231,239,0.2), rgba(167,139,250,0.15))',
                color: '#6ee7ef',
                fontSize: 13,
                fontWeight: 700,
                cursor: 'pointer',
                transition: 'all 0.15s',
                fontFamily: 'inherit',
              }}
              aria-label="Search"
            >
              Search
            </button>
          )}
        </div>

        {/* ── BODY ── */}
        <div style={{
          flex: 1,
          overflowY: 'auto',
          overflowX: 'hidden',
          WebkitOverflowScrolling: 'touch',
          scrollbarWidth: 'none',
        }}>

          {/* ── PHASE: INPUT — suggestions + history ── */}
          {phase === 'input' && (
            <div style={{ maxWidth: 720, margin: '0 auto', padding: '16px 16px 80px' }}>

              {/* City suggestions (live typeahead) */}
              {citySuggestions.length > 0 && (
                <div style={{ marginBottom: 20 }}>
                  <SectionHeader
                    icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(200,214,229,0.4)" strokeWidth="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>}
                    label="Cities"
                    count={citySuggestions.length}
                  />
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {citySuggestions.map((city) => (
                      <button
                        key={city}
                        className="gso-suggestion"
                        onClick={() => handleSuggestionClick(city)}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 10,
                          padding: '10px 14px',
                          background: 'transparent',
                          border: '1px solid rgba(110,231,239,0.06)',
                          borderRadius: 10,
                          color: '#c8d6e5',
                          fontSize: 14,
                          cursor: 'pointer',
                          textAlign: 'left',
                          fontFamily: 'inherit',
                          transition: 'background 0.15s',
                        }}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(110,231,239,0.4)" strokeWidth="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>
                        {city}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Live tour/series matches while typing */}
              {localQuery.trim().length >= 2 && tourResults.length > 0 && (
                <div style={{ marginBottom: 20 }}>
                  <SectionHeader
                    icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(200,214,229,0.4)" strokeWidth="2"><circle cx="12" cy="8" r="6"/><path d="M15.477 12.89L17 22l-5-3-5 3 1.523-9.11"/></svg>}
                    label="Tours"
                    count={tourResults.length}
                  />
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {tourResults.map(t => <TourResultCard key={t.id || t.tour_code} tour={t} onClick={onTourClick} />)}
                  </div>
                </div>
              )}

              {localQuery.trim().length >= 2 && seriesResults.length > 0 && (
                <div style={{ marginBottom: 20 }}>
                  <SectionHeader
                    icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(200,214,229,0.4)" strokeWidth="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>}
                    label="Series"
                    count={seriesResults.length}
                  />
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {seriesResults.map(s => <SeriesResultCard key={s.id || s.name} series={s} onClick={onSeriesClick} />)}
                  </div>
                </div>
              )}

              {/* Recent Search History */}
              {searchHistory.length > 0 && !localQuery && (
                <div style={{ marginBottom: 20 }}>
                  <SectionHeader
                    icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(200,214,229,0.4)" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>}
                    label="Recent Searches"
                  />
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {searchHistory.slice(0, 8).map((item, i) => (
                      <button
                        key={item.id || i}
                        className="gso-history-item"
                        onClick={() => handleHistoryClick(item.search_query || item)}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 10,
                          padding: '10px 14px',
                          background: 'transparent',
                          border: 'none',
                          borderRadius: 8,
                          color: 'rgba(200,214,229,0.65)',
                          fontSize: 14,
                          cursor: 'pointer',
                          textAlign: 'left',
                          fontFamily: 'inherit',
                          transition: 'background 0.15s',
                        }}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(200,214,229,0.25)" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                        {item.search_query || item}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Empty state prompt */}
              {!localQuery && searchHistory.length === 0 && (
                <div style={{ textAlign: 'center', paddingTop: 60, color: 'rgba(200,214,229,0.25)' }}>
                  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" style={{ marginBottom: 16, opacity: 0.4 }}>
                    <circle cx="11" cy="11" r="8"/>
                    <line x1="21" y1="21" x2="16.65" y2="16.65"/>
                  </svg>
                  <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>Search Anything</div>
                  <div style={{ fontSize: 13, lineHeight: 1.6 }}>
                    City, State, Venue, Casino,<br />
                    Tournament, Series, or Tour Name
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── PHASE: RESULTS ── */}
          {phase === 'results' && (
            <div style={{ maxWidth: 720, margin: '0 auto', padding: '16px 16px 80px' }}>

              {/* Loading state */}
              {isLoading && <SearchSkeletons />}

              {/* No results */}
              {!isLoading && !hasResults && (
                <div style={{ textAlign: 'center', paddingTop: 60, color: 'rgba(200,214,229,0.35)' }}>
                  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" style={{ marginBottom: 16, opacity: 0.4 }}>
                    <circle cx="11" cy="11" r="8"/>
                    <line x1="21" y1="21" x2="16.65" y2="16.65"/>
                  </svg>
                  <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>No Results Found</div>
                  <div style={{ fontSize: 13 }}>Try a different city, venue name, or tour</div>
                </div>
              )}

              {/* Results header badge */}
              {!isLoading && hasResults && (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  marginBottom: 20, padding: '10px 14px',
                  background: 'rgba(110,231,239,0.05)',
                  border: '1px solid rgba(110,231,239,0.1)',
                  borderRadius: 10,
                }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#6ee7ef" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                  <span style={{ fontSize: 13, color: '#6ee7ef', fontWeight: 600 }}>
                    {totalResults} result{totalResults !== 1 ? 's' : ''} for &ldquo;{localQuery}&rdquo;
                  </span>
                  <span style={{ fontSize: 12, color: 'rgba(200,214,229,0.35)', marginLeft: 4 }}>
                    — No location filter applied
                  </span>
                </div>
              )}

              {/* Venues section */}
              {!isLoading && venueResults.length > 0 && (
                <div style={{ marginBottom: 28 }}>
                  <SectionHeader
                    icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(200,214,229,0.4)" strokeWidth="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>}
                    label="Venues"
                    count={venueResults.length}
                  />
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {venueResults.map(v => (
                      <VenueResultCard key={v.id} venue={v} onClick={onVenueClick} />
                    ))}
                  </div>
                </div>
              )}

              {/* Tours section */}
              {!isLoading && tourResults.length > 0 && (
                <div style={{ marginBottom: 28 }}>
                  <SectionHeader
                    icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(200,214,229,0.4)" strokeWidth="2"><circle cx="12" cy="8" r="6"/><path d="M15.477 12.89L17 22l-5-3-5 3 1.523-9.11"/></svg>}
                    label="Poker Tours"
                    count={tourResults.length}
                  />
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {tourResults.map(t => (
                      <TourResultCard key={t.id || t.tour_code} tour={t} onClick={onTourClick} />
                    ))}
                  </div>
                </div>
              )}

              {/* Series section */}
              {!isLoading && seriesResults.length > 0 && (
                <div style={{ marginBottom: 28 }}>
                  <SectionHeader
                    icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(200,214,229,0.4)" strokeWidth="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>}
                    label="Poker Series"
                    count={seriesResults.length}
                  />
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {seriesResults.map(s => (
                      <SeriesResultCard key={s.id || s.name} series={s} onClick={onSeriesClick} />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
