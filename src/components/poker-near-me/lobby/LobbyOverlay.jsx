/**
 * LobbyOverlay.jsx — The UI layer on top of the background.
 *
 * Renders:
 *   - "POKER NEAR ME" title
 *   - Search bar with autocomplete + voice + GPS
 *   - Unified playing-card grid (12 cards: 8 pods + 4 dock, all same size)
 *   - First-time tutorial overlay
 *
 * NOTE: The feature panel drawer is rendered at the PAGE level
 * (poker-near-me-lobby.js) to avoid z-index stacking context issues.
 * "More Tools" are accessible via the hamburger menu.
 */

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import InteractiveTutorial, { LOBBY_TUTORIAL_STEPS } from '../InteractiveTutorial';

// ─── GRID HOTSPOT MAPPING ───
// 12 clickable areas laid over the single dynamic image, in a 4×3 grid.
// Each entry defines the pod ID that gets opened when the hotspot is tapped.
// badgeKey maps to a key in liveData for live count badges.
const GRID_HOTSPOTS = [
  // Row 1
  { id: 'nearme', label: 'Poker Near Me', badgeKey: 'venueCount' },
  { id: 'homegames', label: 'Home Games', badgeKey: 'homeGameCount' },
  { id: 'livegames', label: 'Live Games', badgeKey: 'liveGameCount' },
  { id: 'tours', label: 'Poker Tours', badgeKey: 'tourCount' },
  // Row 2
  { id: 'mapview', label: 'Map View', badgeKey: 'mappableCount' },
  { id: 'calendar', label: 'Calendar', badgeKey: 'calendarCount' },
  { id: 'series', label: 'Poker Series', badgeKey: 'seriesCount' },
  { id: 'roadtrip', label: 'Trip Planner' },
  // Row 3
  { id: 'daily', label: 'Daily Grind', badgeKey: 'dailyCount' },
  { id: 'favorites', label: 'Saved Venues', badgeKey: 'savedCount' },
  { id: 'social', label: 'Friends', badgeKey: 'friendsNearby' },
  { id: 'alerts', label: 'Tournament Alerts', badgeKey: 'alertCount' },
];





/* FirstTimeTutorial removed — replaced by InteractiveTutorial component */

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
  onRefresh,
  showTutorial = false,
  onTutorialDismiss,
}) {
  const searchRef = useRef(null);
  const [searchFocused, setSearchFocused] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  // tutorialStep state removed — managed by InteractiveTutorial

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



  return (
    <>
      {/* Interactive Tutorial Overlay — spotlight-based with real-time element targeting */}
      <InteractiveTutorial
        steps={LOBBY_TUTORIAL_STEPS}
        storageKey="pnm_lobby_tutorial_seen"
        visible={showTutorial}
        onDismiss={() => onTutorialDismiss?.()}
        onDontShowAgain={() => onTutorialDismiss?.()}
      />

      <div className="lobby-overlay" style={{
        position: 'absolute', inset: 0, zIndex: 10, pointerEvents: 'none',
        display: 'flex', flexDirection: 'column',
      }}>

      {/* TOP BAR — Title + Search */}
      <header className="lobby-topbar" style={{ pointerEvents: 'none' }}>
        {/* POKER NEAR ME Title removed per user optimization for icon-only layout */}
        <form className="lobby-search-form" onSubmit={handleSearchSubmit} style={{ position: 'relative', pointerEvents: 'auto' }}>
          <div className={`lobby-search-wrap ${searchFocused ? 'focused' : ''}`} style={{
            backdropFilter: 'blur(16px)',
            background: 'rgba(6, 21, 37, 0.7)',
            border: searchFocused ? '1px solid rgba(110, 231, 239, 0.5)' : '1px solid rgba(110, 231, 239, 0.2)',
            boxShadow: searchFocused ? '0 0 24px rgba(110, 231, 239, 0.15)' : 'none',
            transition: 'all 0.25s',
          }}>
            <svg className="lobby-search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" data-tutorial-id="lobby-search">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              ref={searchRef}
              type="text"
              className="lobby-search-input"
              placeholder="Search City, Venue, or Zip..."
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
                    background: 'linear-gradient(135deg, rgba(212,168,83,0.08), rgba(212,168,83,0.02))',
                    border: '1.5px solid rgba(212,168,83,0.2)',
                    borderRadius: 14,
                    transition: 'all 0.3s',
                  }}
                >
                  <div style={{
                    width: 32, height: 32, borderRadius: '50%',
                    background: 'linear-gradient(135deg, rgba(212,168,83,0.2), rgba(212,168,83,0.08))',
                    border: '1px solid rgba(212,168,83,0.35)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0,
                  }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#d4a853" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
                      <path d="M3 3v5h5"/>
                    </svg>
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#d4a853', letterSpacing: '-0.2px' }}>
                      Use Saved Location
                    </div>
                    <div style={{ fontSize: 11, color: 'rgba(200,214,229,0.45)', marginTop: 1 }}>
                      {savedLocationCity}{savedLocationState ? `, ${savedLocationState}` : ''}
                    </div>
                  </div>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(212,168,83,0.5)" strokeWidth="2" style={{ flexShrink: 0 }}>
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
                    Find Poker Rooms, Live Games, and Events Near You
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
        flexDirection: 'column',
        alignItems: 'center',
        pointerEvents: 'auto',
        padding: 'clamp(12px, 2vw, 24px) clamp(16px, 4vw, 48px)',
        overflowY: 'auto',
        overflowX: 'hidden',
        WebkitOverflowScrolling: 'touch',
        scrollbarWidth: 'none',
        msOverflowStyle: 'none',
      }}>
        <div style={{ position: 'relative', maxWidth: 900, width: '100%' }}>
          {/* Grid image — PNG to preserve "Home Games" update */}
          <img
            src="/images/lobby-pods/poker-near-me-grid.png"
            alt="Poker Near Me Feature Grid"
            loading="eager"
            fetchpriority="high"
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
            top: '2.5%',
            left: '2%',
            right: '2%',
            bottom: '2%',
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gridTemplateRows: 'repeat(3, 1fr)',
            gap: 0,
            overflow: 'visible',
            pointerEvents: showTutorial ? 'none' : 'auto',
          }}>
            {GRID_HOTSPOTS.map((hotspot) => {
              // Resolve live badge count from liveData
              const badgeVal = hotspot.badgeKey ? (liveData?.[hotspot.badgeKey] ?? 0) : 0;
              // Badge display logic:
              //   -1 = "Coming Soon" sentinel (friends)
              //    0 = no badge
              //   >0 = show count
              const showBadge = badgeVal > 0;
              const badgeText = badgeVal > 99 ? '99+' : String(badgeVal);
              // Color coding per category
              const badgeColor = hotspot.id === 'livegames' ? '#3fb950'
                : hotspot.id === 'favorites' ? '#f59e0b'
                : hotspot.id === 'alerts' ? '#ef4444'
                : '#6ee7ef';

              return (
                <button
                  key={hotspot.id}
                  data-tutorial-id={`pod-${hotspot.id}`}
                  onClick={() => {
                    try { navigator.vibrate?.([10, 30, 10]); } catch { }
                    onPodSelect?.(hotspot.id);
                  }}
                  aria-label={`Open ${hotspot.label}${showBadge ? ` (${badgeText})` : ''}`}
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
                  {/* Live data badge */}
                  {showBadge && (
                    <span style={{
                      position: 'absolute',
                      top: '6%',
                      right: '6%',
                      zIndex: 5,
                      minWidth: 22,
                      height: 22,
                      padding: '0 6px',
                      borderRadius: 11,
                      background: badgeColor,
                      color: '#000',
                      fontSize: 11,
                      fontWeight: 800,
                      fontFamily: 'Inter, system-ui, sans-serif',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      boxShadow: `0 0 8px ${badgeColor}66, 0 2px 6px rgba(0,0,0,0.4)`,
                      pointerEvents: 'none',
                      lineHeight: 1,
                      letterSpacing: '-0.02em',
                    }}>
                      {badgeText}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* ═══ LIVE STATS BAR — below the grid ═══ */}
        <div style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          gap: 'clamp(16px, 3vw, 32px)',
          padding: '14px 20px',
          marginTop: 12,
          maxWidth: 900,
          width: '100%',
          background: 'linear-gradient(135deg, rgba(10,18,32,0.85), rgba(6,12,24,0.85))',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          borderRadius: 14,
          border: '1px solid rgba(110,231,239,0.1)',
          fontFamily: 'Inter, system-ui, sans-serif',
          pointerEvents: 'none',
        }}>
          {[
            { value: liveData?.venueCount || liveData?.liveGameCount || '—', label: 'Venues', color: '#6ee7ef', show: true },
            { value: liveData?.liveGameCount || '—', label: 'Live Tables', color: '#3fb950', show: (liveData?.liveGameCount || 0) > 0 },
            { value: liveData?.dailyCount || '—', label: 'Today\'s Events', color: '#d4a853', show: true },
            { value: liveData?.savedCount || 0, label: 'Saved', color: '#f59e0b', show: (liveData?.savedCount || 0) > 0 },
          ].filter(s => s.show).map((stat, i) => (
            <div key={i} style={{ textAlign: 'center', minWidth: 50 }}>
              <div style={{
                fontSize: 'clamp(18px, 2.5vw, 26px)',
                fontWeight: 800,
                color: stat.color,
                lineHeight: 1.1,
                letterSpacing: '-0.02em',
              }}>{typeof stat.value === 'number' ? stat.value.toLocaleString() : stat.value}</div>
              <div style={{
                fontSize: 'clamp(9px, 1.2vw, 11px)',
                color: 'rgba(200,214,229,0.4)',
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                marginTop: 2,
              }}>{stat.label}</div>
            </div>
          ))}
        </div>


      </div>
    </div>
    </>
  );
}
