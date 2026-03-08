/**
 * LobbyOverlay.jsx — The UI layer on top of the background.
 *
 * Renders:
 *   - "POKER NEAR ME" title
 *   - Search bar with autocomplete + voice + GPS
 *   - Unified playing-card grid (12 cards: 8 pods + 4 dock, all same size)
 *
 * NOTE: The feature panel drawer is rendered at the PAGE level
 * (poker-near-me-lobby.js) to avoid z-index stacking context issues.
 */

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

// ─── ALL lobby items — unified playing-card frames ───
// 12 cards total (removed Rewards & Calculator), all same size, evenly spaced
const ALL_CARD_ITEMS = [
  // Row 1: Main navigation
  { id: 'nearme',    label: 'Near Me',       color: '#00d2ff', icon: '/images/lobby-pods/nearme.jpg' },
  { id: 'search',    label: 'Search',        color: '#6ee7ef', icon: '/images/lobby-pods/search.jpg' },
  { id: 'livegames', label: 'Live Games',    color: '#ff4444', icon: '/images/lobby-pods/livegames.jpg' },
  { id: 'tours',     label: 'Tours',         color: '#c9a227', icon: '/images/lobby-pods/tours.jpg' },
  // Row 2: Discovery
  { id: 'mapview',   label: 'Map View',      color: '#3b82f6', icon: '/images/lobby-pods/mapview.jpg' },
  { id: 'calendar',  label: 'Calendar',      color: '#8b5cf6', icon: '/images/lobby-pods/calendar.jpg' },
  { id: 'series',    label: 'Series',        color: '#f59e0b', icon: '/images/lobby-pods/series.jpg' },
  { id: 'daily',     label: 'Daily',         color: '#22c55e', icon: '/images/lobby-pods/daily.jpg' },
  // Row 3: Tools & social
  { id: 'roadtrip',   label: 'Trip Planner', color: '#6ee7ef', icon: '/images/lobby-dock/trip-planner.jpg' },
  { id: 'favorites',  label: 'Saved',        color: '#6ee7ef', icon: '/images/lobby-dock/saved.jpg' },
  { id: 'social',     label: 'Friends',      color: '#6ee7ef', icon: '/images/lobby-dock/friends.png' },
  { id: 'alerts',     label: 'Alerts',       color: '#ff6b6b', icon: '/images/lobby-dock/alerts.jpg' },
];

// ─── Card Item — Playing card shaped frame (portrait 3:4 ratio) ───
function CardItem({ card, isActive, badge, onSelect }) {
  const [hovered, setHovered] = useState(false);
  const [imgLoaded, setImgLoaded] = useState(false);
  const [imgError, setImgError] = useState(false);
  const active = isActive || hovered;

  return (
    <button
      className="lobby-card-btn"
      onClick={() => onSelect(card.id)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      aria-label={`Open ${card.label}`}
      style={{
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        background: 'none',
        border: 'none',
        cursor: 'pointer',
        padding: 0,
        WebkitTapHighlightColor: 'transparent',
        transform: active ? 'scale(1.05)' : 'scale(1)',
        transition: 'transform 0.25s ease',
      }}
    >
      {/* Playing card frame — 3:4 aspect ratio */}
      <div
        className="lobby-card-frame"
        style={{
          width: '100%',
          aspectRatio: '3 / 4',
          borderRadius: 10,
          background: '#0a0e16',
          border: `1.5px solid ${active ? card.color : `${card.color}40`}`,
          boxShadow: active
            ? `0 0 16px ${card.color}50, 0 4px 20px rgba(0,0,0,0.6)`
            : `0 2px 12px rgba(0,0,0,0.5), 0 0 6px ${card.color}15`,
          overflow: 'hidden',
          transition: 'all 0.3s ease',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {!imgError ? (
          <img
            src={card.icon}
            alt={card.label}
            loading="lazy"
            onLoad={() => setImgLoaded(true)}
            onError={() => setImgError(true)}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              backgroundColor: '#0a0e16',
              opacity: imgLoaded ? 1 : 0,
              transition: 'opacity 0.4s ease-in',
            }}
          />
        ) : (
          <div style={{
            width: '100%', height: '100%',
            background: 'linear-gradient(135deg, #0a0e16, #111827)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <span style={{ color: `${card.color}60`, fontSize: 24 }}>?</span>
          </div>
        )}
      </div>

      {/* Label below card */}
      <span
        className="lobby-card-label"
        style={{
          fontFamily: "'Orbitron', 'Rajdhani', sans-serif",
          fontSize: 9,
          fontWeight: 700,
          color: active ? '#ffffff' : 'rgba(200, 220, 240, 0.7)',
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          textAlign: 'center',
          textShadow: active
            ? `0 0 8px ${card.color}80, 0 1px 3px rgba(0,0,0,0.9)`
            : '0 1px 3px rgba(0,0,0,0.8)',
          transition: 'color 0.25s',
          lineHeight: 1.2,
          marginTop: 3,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          maxWidth: '100%',
        }}
      >
        {card.label}
      </span>

      {/* Badge (for alerts, saved, friends) */}
      {badge > 0 && (
        <span className="lobby-card-badge" style={{
          position: 'absolute', top: -4, right: -4,
          minWidth: 18, height: 18, borderRadius: 9,
          background: 'linear-gradient(135deg, #ff6b6b, #ee5a24)',
          color: '#fff', fontSize: 10, fontWeight: 700,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '0 4px',
          boxShadow: '0 2px 8px rgba(238, 90, 36, 0.5)',
          zIndex: 2,
        }}>
          {badge}
        </span>
      )}
    </button>
  );
}

// (DockItem, DockIconSVG, DOCK_ITEMS removed — unified into card grid above)

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
                    className="lobby-suggestion-btn"
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
                    className="lobby-history-btn"
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

      {/* ═══ CARD GRID — Unified playing-card icons below search ═══ */}
      <div className="lobby-card-scroll" style={{
        flex: 1,
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        pointerEvents: 'auto',
        padding: '4px 16px',
        overflowY: 'auto',
        overflowX: 'hidden',
        WebkitOverflowScrolling: 'touch',
        scrollbarWidth: 'none',
        msOverflowStyle: 'none',
      }}>
        <div className="lobby-card-grid" style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: 'clamp(8px, 2vw, 14px)',
          maxWidth: 400,
          width: '100%',
          paddingTop: 4,
          paddingBottom: 24,
        }}>
          {ALL_CARD_ITEMS.map((card) => (
            <CardItem
              key={card.id}
              card={card}
              isActive={activePod === card.id}
              badge={card.id === 'alerts' ? alertCount :
                     card.id === 'favorites' ? savedCount :
                     card.id === 'social' ? friendsNearby : 0}
              onSelect={onPodSelect}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
