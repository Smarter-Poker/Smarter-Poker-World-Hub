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

// Dock items (bottom bar)
const DOCK_ITEMS = [
  { id: 'roadtrip',   label: 'Trip Planner', icon: '\u{1F5FA}\uFE0F' },
  { id: 'calculator',  label: 'Calculator',   icon: '\u{1F4B0}' },
  { id: 'favorites',  label: 'Saved',        icon: '\u{1F516}' },
  { id: 'social',     label: 'Friends',      icon: '\u{1F465}' },
  { id: 'alerts',     label: 'Alerts',       icon: '\u{1F514}' },
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
      <header className="lobby-topbar" style={{ pointerEvents: 'auto' }}>

        {/* POKER NEAR ME Title */}
        <h1 className="lobby-title">POKER NEAR ME</h1>

        <form className="lobby-search-form" onSubmit={handleSearchSubmit} style={{ position: 'relative' }}>
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
      <nav className="lobby-dock" style={{ pointerEvents: 'auto' }}>
        {DOCK_ITEMS.map((item) => {
          const isActive = activePod === item.id;
          const badge = item.id === 'alerts' ? alertCount :
                       item.id === 'favorites' ? savedCount :
                       item.id === 'social' ? friendsNearby : 0;
          return (
            <button
              key={item.id}
              className={`lobby-dock-btn ${isActive ? 'active' : ''}`}
              onClick={() => onPodSelect?.(item.id)}
            >
              <span className="lobby-dock-icon">{item.icon}</span>
              <span className="lobby-dock-label">{item.label}</span>
              {badge > 0 && <span className="lobby-dock-badge">{badge}</span>}
            </button>
          );
        })}
      </nav>
    </div>
  );
}
