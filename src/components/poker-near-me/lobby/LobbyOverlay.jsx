/**
 * LobbyOverlay.jsx — The 2D UI layer that sits ON TOP of the 3D scene.
 *
 * This renders:
 *   - "POKER NEAR ME" cinematic title
 *   - Search bar with city autocomplete + voice search button
 *   - Bottom dock (Trip Planner, Calculator, Saved, Friends, Alerts)
 *   - Scan line + ambient UI effects
 *
 * NOTE: The feature panel drawer is rendered at the PAGE level
 * (poker-near-me-lobby.js) to avoid z-index stacking context issues.
 * This overlay only handles search + dock + title.
 */

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

// Photorealistic 3D dock icons — AI-generated images for premium quality
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
          width: 56,
          height: 56,
          objectFit: 'contain',
          filter: 'drop-shadow(0 3px 12px rgba(110, 231, 239, 0.4))',
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
 * LobbyOverlay — the full 2D UI layer.
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
    <div className="lobby-overlay" style={{ position: 'absolute', inset: 0, zIndex: 10, pointerEvents: 'none' }}>

      {/* SCAN LINE */}
      <div className="lobby-scanline" />

      {/* TOP BAR — Title + Search */}
      <header className="lobby-topbar" style={{ pointerEvents: 'none' }}>

        {/* POKER NEAR ME Title */}
        <h1 className="lobby-title">POKER NEAR ME</h1>

        <form className="lobby-search-form" onSubmit={handleSearchSubmit} style={{ position: 'relative', pointerEvents: 'auto' }}>
          <div className={`lobby-search-wrap ${searchFocused ? 'focused' : ''}`}>
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
          </AnimatePresence>
        </form>
      </header>

      {/* BOTTOM DOCK */}
      <nav className="lobby-dock" style={{ pointerEvents: 'none' }}>
        {DOCK_ITEMS.map((item) => {
          const isActive = activePod === item.id;
          const badge = item.id === 'alerts' ? alertCount :
                       item.id === 'favorites' ? savedCount :
                       item.id === 'social' ? friendsNearby : 0;
          return (
            <button
              key={item.id}
              className={`lobby-dock-btn ${isActive ? 'active' : ''}`}
              style={{ pointerEvents: 'auto' }}
              onClick={() => onPodSelect?.(item.id)}
            >
              <span className="lobby-dock-icon"><DockIconSVG id={item.id} /></span>
              <span className="lobby-dock-label">{item.label}</span>
              {badge > 0 && <span className="lobby-dock-badge">{badge}</span>}
            </button>
          );
        })}
      </nav>
    </div>
  );
}
