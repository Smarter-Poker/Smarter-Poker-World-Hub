/**
 * LobbyOverlay.jsx — The 2D UI layer that sits ON TOP of the 3D scene.
 *
 * This renders:
 *   - Title bar with "POKER NEAR ME" branding
 *   - Search bar (wired to venue search)
 *   - Bottom dock (Trip Planner, Saved, Friends, Alerts)
 *   - Feature panel drawer (slides up when a pod/dock item is selected)
 *   - Scan line + ambient UI effects
 *
 * The overlay is transparent except for its UI elements, so the 3D scene
 * shows through. Pointer events are set to 'none' on the wrapper and
 * 'auto' on interactive elements, so clicks pass through to the 3D pods.
 */

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

// Dock items (bottom bar)
const DOCK_ITEMS = [
  { id: 'roadtrip',  label: 'Trip Planner', icon: '🗺️' },
  { id: 'favorites', label: 'Saved',        icon: '🔖' },
  { id: 'social',    label: 'Friends',      icon: '👥' },
  { id: 'alerts',    label: 'Alerts',       icon: '🔔' },
];

/**
 * LobbyOverlay — the full 2D UI layer.
 *
 * @param {string}   activePod        - Currently selected pod/feature id
 * @param {function} onPodSelect      - Called when a dock item is clicked
 * @param {function} onSearch         - Called with search query
 * @param {function} onPanelClose     - Called when the panel is dismissed
 * @param {object}   panelContent     - { title, component } for the active panel
 * @param {string}   searchQuery      - Current search input value
 * @param {function} onSearchChange   - Input change handler
 * @param {object}   liveData         - { liveGameCount, alertCount, savedCount, friendsNearby }
 * @param {boolean}  gpsActive        - Whether GPS is active
 * @param {function} onGpsClick       - GPS button click handler
 * @param {boolean}  showPanel        - Whether the panel drawer is open
 */
export default function LobbyOverlay({
  activePod,
  onPodSelect,
  onSearch,
  onPanelClose,
  panelContent,
  searchQuery,
  onSearchChange,
  liveData = {},
  gpsActive,
  onGpsClick,
  showPanel,
}) {
  const searchRef = useRef(null);
  const [searchFocused, setSearchFocused] = useState(false);

  const handleSearchSubmit = useCallback((e) => {
    e.preventDefault();
    onSearch?.(searchQuery);
    searchRef.current?.blur();
  }, [searchQuery, onSearch]);

  // Badge counts
  const alertCount = liveData.alertCount || 0;
  const savedCount = liveData.savedCount || 0;
  const friendsNearby = liveData.friendsNearby || 0;

  return (
    <div className="lobby-overlay" style={{ position: 'absolute', inset: 0, zIndex: 10, pointerEvents: 'none' }}>

      {/* ═══ SCAN LINE ═══ */}
      <div className="lobby-scanline" />

      {/* ═══ TOP BAR — Title + Search ═══ */}
      <header className="lobby-topbar" style={{ pointerEvents: 'auto' }}>
        <h1 className="lobby-title">Poker Near Me</h1>

        <form className="lobby-search-form" onSubmit={handleSearchSubmit}>
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
              onBlur={() => setSearchFocused(false)}
              autoComplete="off"
            />
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
        </form>
      </header>

      {/* ═══ BOTTOM DOCK ═══ */}
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

      {/* ═══ FEATURE PANEL DRAWER ═══ */}
      <AnimatePresence>
        {showPanel && panelContent && (
          <>
            {/* Backdrop */}
            <motion.div
              className="lobby-panel-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
              onClick={onPanelClose}
              style={{ pointerEvents: 'auto' }}
            />

            {/* Panel */}
            <motion.div
              className="lobby-panel"
              initial={{ y: '100%', opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: '100%', opacity: 0 }}
              transition={{ type: 'spring', damping: 30, stiffness: 300 }}
              style={{ pointerEvents: 'auto' }}
            >
              {/* Drag handle */}
              <div className="lobby-panel-handle">
                <div className="lobby-panel-handle-bar" />
              </div>

              {/* Header */}
              <div className="lobby-panel-header">
                <h2 className="lobby-panel-title">{panelContent.title}</h2>
                <button className="lobby-panel-close" onClick={onPanelClose} aria-label="Close panel">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>

              {/* Content — renders the actual feature component */}
              <div className="lobby-panel-content">
                {panelContent.component}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
