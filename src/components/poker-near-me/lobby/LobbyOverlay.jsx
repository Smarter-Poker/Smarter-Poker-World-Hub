/**
 * LobbyOverlay.jsx — The UI layer on top of the background.
 *
 * Renders:
 *   - "POKER NEAR ME" title
 *   - Search bar with autocomplete + voice + GPS
 *   - Pod icon grid (dynamic images in a scrollable grid below search)
 *   - Bottom dock (Trip Planner, Calculator, Saved, Friends, Alerts)
 *
 * NOTE: The feature panel drawer is rendered at the PAGE level
 * (poker-near-me-lobby.js) to avoid z-index stacking context issues.
 */

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

// ─── Pod grid items (main features shown below search) ───
const POD_GRID_ITEMS = [
  { id: 'nearme',    label: 'Near Me',    color: '#00d2ff', icon: '/images/lobby-pods/nearme.png' },
  { id: 'search',    label: 'Search',     color: '#6ee7ef', icon: '/images/lobby-pods/search.png' },
  { id: 'livegames', label: 'Live Games', color: '#ff4444', icon: '/images/lobby-pods/livegames.png' },
  { id: 'tours',     label: 'Tours',      color: '#c9a227', icon: '/images/lobby-pods/tours.png' },
  { id: 'mapview',   label: 'Map View',   color: '#3b82f6', icon: '/images/lobby-pods/mapview.png' },
  { id: 'calendar',  label: 'Calendar',   color: '#8b5cf6', icon: '/images/lobby-pods/calendar.png' },
  { id: 'series',    label: 'Series',     color: '#f59e0b', icon: '/images/lobby-pods/series.png' },
  { id: 'daily',     label: 'Daily',      color: '#22c55e', icon: '/images/lobby-pods/daily.png' },
  { id: 'wallet',    label: 'Rewards',    color: '#ffd700', icon: '/images/lobby-pods/wallet.png' },
];

// ─── Pod Grid Item ───
function PodGridItem({ pod, isActive, onSelect }) {
  const [hovered, setHovered] = useState(false);
  const [imgLoaded, setImgLoaded] = useState(false);
  const [imgError, setImgError] = useState(false);
  const active = isActive || hovered;

  return (
    <button
      onClick={() => onSelect(pod.id)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      aria-label={`Open ${pod.label}`}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 4,
        background: 'none',
        border: 'none',
        cursor: 'pointer',
        padding: 4,
        WebkitTapHighlightColor: 'transparent',
        transform: active ? 'scale(1.08)' : 'scale(1)',
        transition: 'transform 0.25s ease',
      }}
    >
      {/* Icon circle */}
      <div
        style={{
          width: 58,
          height: 58,
          borderRadius: '50%',
          background: `radial-gradient(circle at 30% 30%, rgba(255,255,255,0.08), rgba(0,0,0,0.4))`,
          border: `2px solid ${active ? pod.color : `${pod.color}50`}`,
          boxShadow: active
            ? `0 0 20px ${pod.color}60, 0 0 40px ${pod.color}25, inset 0 0 12px rgba(0,0,0,0.4)`
            : `0 0 10px ${pod.color}20, inset 0 0 12px rgba(0,0,0,0.5)`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)',
          transition: 'all 0.3s ease',
        }}
      >
        {!imgError ? (
          <img
            src={pod.icon}
            alt={pod.label}
            loading="lazy"
            onLoad={() => setImgLoaded(true)}
            onError={() => setImgError(true)}
            style={{
              width: 46,
              height: 46,
              objectFit: 'cover',
              borderRadius: '50%',
              opacity: imgLoaded ? 1 : 0,
              transition: 'opacity 0.4s ease-in',
            }}
          />
        ) : (
          <div style={{
            width: 36, height: 36, borderRadius: '50%',
            background: `radial-gradient(circle, ${pod.color}40, ${pod.color}10)`,
            border: `1px solid ${pod.color}60`,
          }} />
        )}
      </div>

      {/* Label */}
      <span
        style={{
          fontFamily: "'Orbitron', 'Rajdhani', sans-serif",
          fontSize: 11,
          fontWeight: 700,
          color: active ? '#ffffff' : 'rgba(200, 220, 240, 0.75)',
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          textAlign: 'center',
          textShadow: active
            ? `0 0 10px ${pod.color}80, 0 1px 3px rgba(0,0,0,0.9)`
            : '0 1px 3px rgba(0,0,0,0.8)',
          transition: 'color 0.25s',
          lineHeight: 1.2,
        }}
      >
        {pod.label}
      </span>
    </button>
  );
}

// ─── Dock icons ───
const DOCK_ICON_IMAGES = {
  roadtrip:   '/images/lobby-dock/trip-planner.png',
  calculator: '/images/lobby-dock/calculator.png',
  favorites:  '/images/lobby-dock/saved.png',
  social:     '/images/lobby-dock/friends.png',
  alerts:     '/images/lobby-dock/alerts.png',
};

const DockIconSVG = ({ id }) => {
  const imageSrc = DOCK_ICON_IMAGES[id];
  if (imageSrc) {
    return (
      <img
        src={imageSrc}
        alt={id}
        style={{
          width: 72,
          height: 72,
          objectFit: 'contain',
          filter: 'drop-shadow(0 4px 16px rgba(110, 231, 239, 0.6)) drop-shadow(0 0 8px rgba(110, 231, 239, 0.3))',
          transition: 'transform 0.25s ease, filter 0.25s ease',
          borderRadius: '50%',
        }}
        draggable={false}
      />
    );
  }
  // Fallback SVG
  const props = { width: 22, height: 22, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' };
  switch (id) {
    case 'roadtrip': return (
      <svg {...props}>
        <path d="M3 12h4l3-9 4 18 3-9h4" />
        <circle cx="5" cy="19" r="2" /><circle cx="19" cy="19" r="2" />
        <path d="M7 19h10" />
      </svg>
    );
    case 'calculator': return (
      <svg {...props}>
        <rect x="4" y="2" width="16" height="20" rx="2" />
        <line x1="8" y1="6" x2="16" y2="6" />
      </svg>
    );
    case 'favorites': return (
      <svg {...props}>
        <path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z" />
      </svg>
    );
    case 'social': return (
      <svg {...props}>
        <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
        <circle cx="9" cy="7" r="4" />
      </svg>
    );
    case 'alerts': return (
      <svg {...props}>
        <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" />
        <path d="M13.73 21a2 2 0 01-3.46 0" />
      </svg>
    );
    default: return null;
  }
};

// Dock items (bottom bar)
const DOCK_ITEMS = [
  { id: 'roadtrip',   label: 'Trip Planner' },
  { id: 'calculator',  label: 'Calculator' },
  { id: 'favorites',  label: 'Saved' },
  { id: 'social',     label: 'Friends' },
  { id: 'alerts',     label: 'Alerts' },
];

/**
 * LobbyOverlay — the full UI layer.
 */
export default function LobbyOverlay({
  activePod,
  onPodSelect,
  onSearch,
  searchQuery,
  onSearchChange,
  liveData = {},
  gpsActive,
  onGpsClick,
  citySuggestions = [],
  onCitySelect,
  onVoiceClick,
  gpsError,
  searchHistory = [],
  onHistorySelect,
}) {
  const searchRef = useRef(null);
  const [searchFocused, setSearchFocused] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);

  const handleSearchSubmit = useCallback((e) => {
    e.preventDefault();
    onSearch?.(searchQuery);
    searchRef.current?.blur();
    setShowSuggestions(false);
  }, [searchQuery, onSearch]);

  // Show/hide city suggestions
  useEffect(() => {
    setShowSuggestions(searchFocused && citySuggestions.length > 0);
  }, [searchFocused, citySuggestions]);

  // Badge counts
  const alertCount = liveData.alertCount || 0;
  const savedCount = liveData.savedCount || 0;
  const friendsNearby = liveData.friendsNearby || 0;

  return (
    <div className="lobby-overlay" style={{
      position: 'absolute', inset: 0, zIndex: 10, pointerEvents: 'none',
      display: 'flex', flexDirection: 'column',
    }}>

      {/* NO SCAN LINE — removed per user request */}

      {/* TOP BAR — Title + Search */}
      <header className="lobby-topbar" style={{ pointerEvents: 'none' }}>
        {/* POKER NEAR ME Title */}
        <h1 className="lobby-title" style={{ textShadow: '0 0 40px rgba(110, 231, 239, 0.5), 0 0 80px rgba(110, 231, 239, 0.2)' }}>POKER NEAR ME</h1>

        <form className="lobby-search-form" onSubmit={handleSearchSubmit} style={{ position: 'relative', pointerEvents: 'auto' }}>
          <div className={`lobby-search-wrap ${searchFocused ? 'focused' : ''}`} style={{
            backdropFilter: 'blur(16px)',
            background: 'rgba(6, 21, 37, 0.7)',
            border: searchFocused ? '1px solid rgba(110, 231, 239, 0.5)' : '1px solid rgba(110, 231, 239, 0.2)',
            boxShadow: searchFocused ? '0 0 24px rgba(110, 231, 239, 0.15)' : 'none',
            transition: 'all 0.25s',
          }}>
            <svg className="lobby-search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              ref={searchRef}
              type="text"
              className="lobby-search-input"
              placeholder="Search city, venue, or zip..."
              value={searchQuery}
              onChange={(e) => onSearchChange?.(e.target.value)}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => setTimeout(() => setSearchFocused(false), 200)}
              autoComplete="off"
              aria-label="Search for poker venues by city, venue name, or zip code"
            />

            {/* Voice Search Button */}
            {onVoiceClick && (
              <button
                type="button"
                className="lobby-voice-btn"
                onClick={onVoiceClick}
                aria-label="Voice search"
                style={{
                  flexShrink: 0, width: 36, height: 36, borderRadius: '50%',
                  border: '1px solid rgba(110, 231, 239, 0.15)',
                  background: 'rgba(110, 231, 239, 0.06)',
                  color: 'rgba(200, 214, 229, 0.5)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: 'pointer', transition: 'all 0.25s',
                  marginRight: 4,
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                  <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                  <line x1="12" y1="19" x2="12" y2="23" />
                  <line x1="8" y1="23" x2="16" y2="23" />
                </svg>
              </button>
            )}

            {/* GPS Button */}
            {gpsActive !== undefined && (
              <button
                type="button"
                className={`lobby-gps-btn ${gpsActive ? 'active' : ''}`}
                onClick={onGpsClick}
                aria-label="Use GPS location"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polygon points="3 11 22 2 13 21 11 13 3 11" />
                </svg>
              </button>
            )}
          </div>

          {/* City Autocomplete Dropdown */}
          <AnimatePresence>
            {showSuggestions && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.2 }}
                style={{
                  position: 'absolute', top: '100%', left: 0, right: 0,
                  marginTop: 4, background: 'rgba(12,18,28,0.97)',
                  backdropFilter: 'blur(16px)',
                  border: '1px solid rgba(110,231,239,0.2)',
                  borderRadius: 12, overflow: 'hidden', zIndex: 60,
                  boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
                }}
              >
                {citySuggestions.map((city, i) => (
                  <button
                    key={city}
                    onClick={() => onCitySelect?.(city)}
                    style={{
                      display: 'block', width: '100%', padding: '10px 16px',
                      background: 'transparent', border: 'none',
                      borderBottom: i < citySuggestions.length - 1 ? '1px solid rgba(110,231,239,0.06)' : 'none',
                      color: '#e0e8f0', fontSize: 13, textAlign: 'left',
                      cursor: 'pointer', fontFamily: 'inherit',
                      transition: 'background 0.15s',
                    }}
                    onMouseEnter={(e) => e.target.style.background = 'rgba(110,231,239,0.08)'}
                    onMouseLeave={(e) => e.target.style.background = 'transparent'}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="rgba(110,231,239,0.5)" strokeWidth="2" style={{ marginRight: 8, verticalAlign: 'middle' }}>
                      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" />
                      <circle cx="12" cy="10" r="3" />
                    </svg>
                    {city}
                  </button>
                ))}
              </motion.div>
            )}

            {/* Search History — shown when focused + empty query */}
            {searchFocused && !searchQuery && searchHistory.length > 0 && !showSuggestions && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.2 }}
                style={{
                  position: 'absolute', top: '100%', left: 0, right: 0,
                  marginTop: 4, background: 'rgba(12,18,28,0.97)',
                  backdropFilter: 'blur(16px)',
                  border: '1px solid rgba(110,231,239,0.15)',
                  borderRadius: 12, overflow: 'hidden', zIndex: 60,
                  boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
                }}
              >
                <div style={{
                  padding: '8px 16px 4px', fontSize: 10, color: 'rgba(200,214,229,0.35)',
                  textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 600,
                }}>
                  Recent Searches
                </div>
                {searchHistory.slice(0, 6).map((item, i) => (
                  <button
                    key={item.id || i}
                    onClick={() => onHistorySelect?.(item.search_query)}
                    style={{
                      display: 'block', width: '100%', padding: '8px 16px',
                      background: 'transparent', border: 'none',
                      borderBottom: i < Math.min(searchHistory.length, 6) - 1 ? '1px solid rgba(110,231,239,0.04)' : 'none',
                      color: 'rgba(200,214,229,0.7)', fontSize: 13, textAlign: 'left',
                      cursor: 'pointer', fontFamily: 'inherit',
                      transition: 'background 0.15s',
                    }}
                    onMouseEnter={(e) => e.target.style.background = 'rgba(110,231,239,0.06)'}
                    onMouseLeave={(e) => e.target.style.background = 'transparent'}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="rgba(200,214,229,0.3)" strokeWidth="2" style={{ marginRight: 8, verticalAlign: 'middle' }}>
                      <circle cx="12" cy="12" r="10" />
                      <polyline points="12 6 12 12 16 14" />
                    </svg>
                    {item.search_query}
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </form>
      </header>

      {/* GPS Error Toast */}
      {gpsError && (
        <div style={{
          textAlign: 'center', padding: '6px 16px',
          fontSize: 12, color: '#ff6b6b', fontFamily: 'Inter, sans-serif',
          letterSpacing: 0.5, pointerEvents: 'none',
        }} role="alert">
          {gpsError}
        </div>
      )}

      {/* ═══ POD GRID — Dynamic images below search ═══ */}
      <div style={{
        flex: 1,
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        pointerEvents: 'auto',
        padding: '4px 16px',
        overflowY: 'auto',
        overflowX: 'hidden',
        WebkitOverflowScrolling: 'touch',
        /* Hide scrollbar but still scrollable */
        scrollbarWidth: 'none',
        msOverflowStyle: 'none',
      }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 'clamp(4px, 1.5vw, 12px)',
          maxWidth: 340,
          width: '100%',
          paddingTop: 4,
          paddingBottom: 100,
        }}>
          {POD_GRID_ITEMS.map((pod) => (
            <PodGridItem
              key={pod.id}
              pod={pod}
              isActive={activePod === pod.id}
              onSelect={onPodSelect}
            />
          ))}
        </div>
      </div>

      {/* BOTTOM DOCK */}
      <nav className="lobby-dock" style={{ pointerEvents: 'none' }}>
        {DOCK_ITEMS.map((item) => {
          const isActive = activePod === item.id;
          const badge = item.id === 'alerts' ? alertCount :
                       item.id === 'favorites' ? savedCount :
                       item.id === 'social' ? friendsNearby : 0;
          const [isHovered, setIsHovered] = React.useState(false);
          return (
            <button
              key={item.id}
              className={`lobby-dock-btn ${isActive ? 'active' : ''}`}
              style={{
                pointerEvents: 'auto',
                backdropFilter: 'blur(12px)',
                background: isActive ? 'rgba(110, 231, 239, 0.12)' : (isHovered ? 'rgba(110, 231, 239, 0.08)' : 'rgba(6, 21, 37, 0.6)'),
                border: isActive ? '1px solid rgba(110, 231, 239, 0.5)' : (isHovered ? '1px solid rgba(110, 231, 239, 0.4)' : '1px solid rgba(110, 231, 239, 0.15)'),
                borderRadius: 16,
                boxShadow: isActive ? '0 0 20px rgba(110, 231, 239, 0.3)' : 'none',
                transform: isHovered ? 'scale(1.08)' : 'scale(1)',
                transition: 'all 0.25s ease',
              }}
              onClick={() => onPodSelect?.(item.id)}
              onMouseEnter={() => setIsHovered(true)}
              onMouseLeave={() => setIsHovered(false)}
              aria-label={`Open ${item.label}`}
            >
              <span className="lobby-dock-icon"><DockIconSVG id={item.id} /></span>
              <span className="lobby-dock-label" style={{
                fontSize: 11,
                letterSpacing: '0.05em',
                textTransform: 'uppercase',
                fontWeight: 600,
              }}>{item.label}</span>
              {badge > 0 && <span className="lobby-dock-badge" style={{ boxShadow: '0 0 8px rgba(110, 231, 239, 0.5)' }}>{badge}</span>}
            </button>
          );
        })}
      </nav>
    </div>
  );
}
