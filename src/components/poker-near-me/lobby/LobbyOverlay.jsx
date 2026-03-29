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

// ─── GRID HOTSPOT MAPPING ───
// 12 clickable areas laid over the single dynamic image, in a 4×3 grid.
// Each entry defines the pod ID that gets opened when the hotspot is tapped.
const GRID_HOTSPOTS = [
  // Row 1
  { id: 'nearme', label: 'Poker Near Me' },
  { id: 'homegames', label: 'Home Games' },
  { id: 'livegames', label: 'Live Games' },
  { id: 'tours', label: 'Poker Tours' },
  // Row 2
  { id: 'mapview', label: 'Map View' },
  { id: 'calendar', label: 'Calendar' },
  { id: 'series', label: 'Poker Series' },
  { id: 'roadtrip', label: 'Trip Planner' },
  // Row 3
  { id: 'daily', label: 'Daily Grind' },
  { id: 'favorites', label: 'Saved Venues' },
  { id: 'social', label: 'Friends' },
  { id: 'alerts', label: 'Tournament Alerts' },
];

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
  gpsLoading,
  onGpsClick,
  citySuggestions = [],
  onCitySelect,
  onVoiceClick,
  gpsError,
  searchHistory = [],
  onHistorySelect,
  locationCity,
  locationState,
  onManualLocation,
  permissionState,
  onShowEnablePopup,
  savedLocation,
  savedLocationCity,
  savedLocationState,
  onUseSavedLocation,
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
                className={`lobby-gps-btn ${gpsActive ? 'active' : ''} ${gpsLoading ? 'loading' : ''}`}
                onClick={onGpsClick}
                disabled={gpsLoading}
                aria-label={gpsLoading ? 'Locating...' : 'Use GPS location'}
                style={gpsLoading ? { opacity: 0.6, cursor: 'wait' } : undefined}
              >
                {gpsLoading ? (
                  <svg width="16" height="16" viewBox="0 0 24 24" style={{ animation: 'spin 1s linear infinite' }}>
                    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" fill="none" strokeDasharray="31" strokeDashoffset="10" />
                  </svg>
                ) : (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polygon points="3 11 22 2 13 21 11 13 3 11" />
                  </svg>
                )}
              </button>
            )}
          </div>

          {/* GPS Location Status Indicator */}
          {gpsActive && (locationCity || locationState) && (
            <div
              onClick={onManualLocation}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                paddingTop: 6, paddingLeft: 4,
                cursor: 'pointer', pointerEvents: 'auto',
              }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#3fb950" strokeWidth="2.5">
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/>
              </svg>
              <span style={{ fontSize: 12, color: '#3fb950', fontWeight: 600 }}>
                {locationCity}{locationState ? `, ${locationState}` : ''}
              </span>
              <span style={{ fontSize: 10, color: 'rgba(200,214,229,0.35)', marginLeft: 4 }}>Change</span>
            </div>
          )}
          {!gpsActive && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
              {/* Use Saved Location — quick restore from previous session */}
              {savedLocation?.lat && savedLocation?.lng && savedLocationCity && onUseSavedLocation && (
                <div
                  onClick={onUseSavedLocation}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    cursor: 'pointer', pointerEvents: 'auto',
                    padding: '10px 16px',
                    background: 'linear-gradient(135deg, rgba(88,166,255,0.08), rgba(88,166,255,0.02))',
                    border: '1px solid rgba(88,166,255,0.2)',
                    borderRadius: 14,
                    transition: 'all 0.3s',
                  }}
                >
                  <div style={{
                    width: 32, height: 32, borderRadius: '50%',
                    background: 'linear-gradient(135deg, rgba(88,166,255,0.2), rgba(88,166,255,0.08))',
                    border: '1px solid rgba(88,166,255,0.35)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0,
                  }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#58a6ff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
                      <path d="M3 3v5h5"/>
                    </svg>
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#58a6ff', letterSpacing: '-0.2px' }}>
                      Use Saved Location
                    </div>
                    <div style={{ fontSize: 11, color: 'rgba(200,214,229,0.45)', marginTop: 1 }}>
                      {savedLocationCity}{savedLocationState ? `, ${savedLocationState}` : ''}
                    </div>
                  </div>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(88,166,255,0.5)" strokeWidth="2" style={{ flexShrink: 0 }}>
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                </div>
              )}
              {/* Enable Location — GPS fresh */}
              <div
                onClick={() => {
                  if (onShowEnablePopup) {
                    onShowEnablePopup();
                  } else if (onManualLocation) {
                    onManualLocation();
                  } else if (onGpsClick) {
                    onGpsClick();
                  }
                }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  cursor: 'pointer', pointerEvents: 'auto',
                  padding: '10px 16px',
                  background: 'linear-gradient(135deg, rgba(34,197,94,0.06), rgba(34,197,94,0.02))',
                  border: '1px solid rgba(34,197,94,0.2)',
                  borderRadius: 14,
                  transition: 'all 0.3s',
                }}
              >
                <div style={{
                  width: 32, height: 32, borderRadius: '50%',
                  background: 'linear-gradient(135deg, rgba(34,197,94,0.2), rgba(34,197,94,0.08))',
                  border: '1px solid rgba(34,197,94,0.35)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0,
                  animation: 'lobby-gpsPulse 2s ease-in-out infinite',
                }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="3"/><path d="M12 2v4m0 12v4m-10-10h4m12 0h4"/>
                  </svg>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#22c55e', letterSpacing: '-0.2px' }}>
                    Enable Location
                  </div>
                  <div style={{ fontSize: 11, color: 'rgba(200,214,229,0.45)', marginTop: 1 }}>
                    Find poker rooms, live games, and events near you
                  </div>
                </div>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(34,197,94,0.5)" strokeWidth="2" style={{ flexShrink: 0 }}>
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </div>
            </div>
          )}

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

      {/* ═══ SINGLE DYNAMIC IMAGE with clickable hotspot overlay ═══ */}
      <div className="lobby-card-scroll" style={{
        flex: 1,
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        pointerEvents: 'auto',
        padding: 'clamp(12px, 2vw, 24px) clamp(16px, 4vw, 48px)',
        overflowY: 'auto',
        overflowX: 'hidden',
        WebkitOverflowScrolling: 'touch',
        scrollbarWidth: 'none',
        msOverflowStyle: 'none',
      }}>
        <div style={{ position: 'relative', maxWidth: 900, width: '100%' }}>
          {/* The user's exact dynamic image */}
          <img
            src="/images/lobby-pods/poker-near-me-grid.png"
            alt="Poker Near Me Feature Grid"
            style={{
              width: '100%',
              height: 'auto',
              display: 'block',
              borderRadius: 12,
            }}
          />

          {/* Transparent clickable hotspot grid overlaid on top of the image */}
          <div style={{
            position: 'absolute',
            /* Inset calibrated from pixel analysis of 1024×1024 source:
               - Neon frame: top=1.8%, bottom=97.5%, left=0.8%, right=98.9%
               - Row 1 content: 4%–30%, Row 2: 34%–60%, Row 3: 64%–96%
               - Grid covers full icon+text cell area inside the frame
            */
            top: '2.5%',
            left: '2%',
            right: '2%',
            bottom: '2%',
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gridTemplateRows: 'repeat(3, 1fr)',
            gap: 0,
            overflow: 'visible',
          }}>
            {GRID_HOTSPOTS.map((hotspot) => {
              // Compute live badge for this hotspot — dynamic counts for every pod
              let badge = null;
              let badgeBg = 'linear-gradient(135deg, #d4a853, #c49a3c)';
              if (hotspot.id === 'nearme' && liveData.venueCount > 0) { badge = liveData.venueCount; badgeBg = 'linear-gradient(135deg, #3fb950, #238636)'; }
              else if (hotspot.id === 'search' && liveData.venueCount > 0) { badge = liveData.venueCount; badgeBg = 'linear-gradient(135deg, #58a6ff, #1f6feb)'; }
              else if (hotspot.id === 'homegames') { const hgCount = (liveData.homeGameCount || 0); if (hgCount > 0) badge = hgCount; }
              else if (hotspot.id === 'livegames' && liveData.liveGameCount > 0) { badge = liveData.liveGameCount; badgeBg = 'linear-gradient(135deg, #ef4444, #dc2626)'; }
              else if (hotspot.id === 'mapview' && liveData.mappableCount > 0) { badge = liveData.mappableCount; badgeBg = 'linear-gradient(135deg, #58a6ff, #1f6feb)'; }
              else if (hotspot.id === 'tours' && liveData.tourCount > 0) badge = liveData.tourCount;
              else if (hotspot.id === 'calendar' && liveData.dailyCount > 0) { badge = liveData.dailyCount; badgeBg = 'linear-gradient(135deg, #a78bfa, #8b5cf6)'; }
              else if (hotspot.id === 'series' && liveData.seriesCount > 0) badge = liveData.seriesCount;
              else if (hotspot.id === 'daily' && liveData.dailyCount > 0) badge = liveData.dailyCount;
              else if (hotspot.id === 'favorites' && savedCount > 0) { badge = savedCount; badgeBg = 'linear-gradient(135deg, #f87171, #ef4444)'; }
              else if (hotspot.id === 'social' && friendsNearby > 0) badge = friendsNearby;
              else if (hotspot.id === 'alerts' && alertCount > 0) { badge = alertCount; badgeBg = 'linear-gradient(135deg, #ef4444, #dc2626)'; }

              return (
              <button
                key={hotspot.id}
                onClick={() => {
                  try { navigator.vibrate?.([10, 30, 10]); } catch { }
                  onPodSelect?.(hotspot.id);
                }}
                aria-label={`Open ${hotspot.label}`}
                style={{
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  padding: 0,
                  margin: 0,
                  position: 'relative',
                  overflow: 'visible',
                  WebkitTapHighlightColor: 'transparent',
                  outline: 'none',
                }}
              >
                {badge != null && badge > 0 && (
                  <span style={{
                    position: 'absolute', top: '-4px', right: '-2px', zIndex: 5,
                    minWidth: 22, height: 22, padding: '0 6px',
                    borderRadius: 11, fontSize: 11, fontWeight: 800,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: badgeBg,
                    color: '#fff', fontFamily: 'Inter, system-ui, sans-serif',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.5), 0 0 12px rgba(212,168,83,0.3)',
                    animation: 'lobby-badgePulse 2s ease-in-out infinite',
                    lineHeight: 1,
                    border: '2px solid rgba(6,21,37,0.9)',
                    letterSpacing: '-0.2px',
                  }}>
                    {badge > 999 ? `${(badge/1000).toFixed(1)}k` : badge > 99 ? '99+' : badge}
                  </span>
                )}
              </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
