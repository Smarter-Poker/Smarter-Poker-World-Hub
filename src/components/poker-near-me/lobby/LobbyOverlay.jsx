/**
 * LobbyOverlay.jsx — The UI layer on top of the background.
 *
 * Renders:
 *   - "POKER NEAR ME" title
 *   - Search bar with autocomplete + voice + GPS
 *   - Unified playing-card grid (12 cards: 8 pods + 4 dock, all same size)
 *
 * Mobile phase 3: the grid and the stats bar flow in the document (no inner
 * scroller, no hidden scrollbar) and the page tutorial is the shared one in
 * src/tutorials/poker-near-me.js; the hotspots carry its spotlight targets.
 *
 * NOTE: The feature panel drawer is rendered at the PAGE level
 * (poker-near-me-lobby.js) to avoid z-index stacking context issues.
 * "More Tools" are accessible via the hamburger menu.
 */

import React, { useMemo, useState } from 'react';
import {
  PokerNearMeConsoleIcon,
  PokerNearMePanelShell,
} from '../PokerNearMeConsole';

// Spotlight targets for src/tutorials/poker-near-me.js, keyed by hotspot id.
const TUTORIAL_TARGETS = {
  nearme: 'venues',
  livegames: 'live',
  mapview: 'map',
  daily: 'events',
  favorites: 'saved',
  social: 'social',
};

// 12 clickable areas laid over the single dynamic image, in a 4x3 grid.
// Each entry defines the pod ID that gets opened when the hotspot is tapped.
//
// `href` mirrors POD_ROUTES in pages/hub/poker-near-me/lobby.js. Rendering the
// hotspots as real anchors (instead of bare <button>s) gives crawlers twelve
// followable internal links out of the lobby and gives keyboard/screen-reader
// users a real link target, without changing the visuals: the click handler
// still preventDefaults and routes through the SPA router.
const GRID_HOTSPOTS = [
  // Row 1
  { id: 'nearme', label: 'Poker Near Me', href: '/hub/poker-near-me/venues' },
  { id: 'homegames', label: 'Home Games', href: '/hub/home-games' },
  { id: 'livegames', label: 'Live Games', href: '/hub/poker-near-me/live-games' },
  { id: 'tours', label: 'Poker Tours', href: '/hub/poker-tours' },
  // Row 2
  { id: 'mapview', label: 'Map View', href: '/hub/poker-near-me/map' },
  { id: 'calendar', label: 'Calendar', href: '/hub/events-calendar' },
  { id: 'series', label: 'Poker Series', href: '/hub/poker-near-me/series' },
  { id: 'roadtrip', label: 'Trip Planner', href: '/hub/poker-near-me/roadtrip' },
  // Row 3
  { id: 'daily', label: 'Daily Grind', href: '/hub/daily-tournaments' },
  { id: 'favorites', label: 'Saved Venues', href: '/hub/poker-near-me/saved' },
  { id: 'social', label: 'Friends', href: '/hub/friends' },
  { id: 'alerts', label: 'Tournament Alerts', href: '/hub/poker-near-me/alerts' },
];


/**
 * LobbyOverlay — the full UI layer.
 */
export default function LobbyOverlay({
  onPodSelect,
  searchQuery,
  liveData = {},
  gpsActive,
  gpsLoading,
  onGpsClick,
  onVoiceClick,
  gpsError,
  locationCity,
  locationState,
  onManualLocation,
  onShowEnablePopup,
  savedLocation,
  savedLocationCity,
  savedLocationState,
  onUseSavedLocation,
  venueCount = 0,
  // ─── Global Search Overlay trigger ───
  onSearchBarClick,
}) {
  // Format venue count
  const formattedVenueCount = useMemo(() => {
    if (venueCount <= 0) return '0';
    return venueCount.toLocaleString();
  }, [venueCount]);

  // If the grid bitmap 404s or is blocked, the twelve hotspots would otherwise
  // sit over empty space with nothing visible to click.
  const [gridImageFailed, setGridImageFailed] = useState(false);



  return (
    <>
      <div className="lobby-overlay">

      {/* TOP BAR — Title + Search */}
      <header className="lobby-topbar">
        {/* POKER NEAR ME Title removed per user optimization for icon-only layout */}

        {/* Search bar + Location row: flex row so location sits to the right of the search bar.
            [MOBILE FIX] flexWrap is required: at <=600px `.lobby-search-form` is
            `width: calc(100vw - 24px)`, which consumes the whole row, so a
            non-wrapping row pushed the location pill past the viewport edge —
            and `.pnm-lobby-page` is `overflow:hidden`, so it was clipped away
            entirely. With wrapping the pill drops onto its own line instead. */}
        <div className="lobby-command-row">
          <div className="lobby-search-form">
            <div className="lobby-search-wrap">
              <PokerNearMeConsoleIcon name="search" className="lobby-search-icon" data-tutorial-id="lobby-search" />
              {/* Fake search input — div instead of input eliminates ALL browser autocomplete/autofill popups */}
              <div
                role="button"
                tabIndex={0}
                className="lobby-search-input"
                onClick={() => onSearchBarClick?.()}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onSearchBarClick?.();
                  }
                }}
                aria-label="Search for poker venues, tours, and series"
              >
                <span className={searchQuery ? 'lobby-search-copy has-query' : 'lobby-search-copy'}>
                  {searchQuery || 'Search City, Venue, Tour, Series...'}
                </span>
              </div>

              {/* Voice Search Button */}
              {onVoiceClick && (
                <button
                  type="button"
                  className="lobby-voice-btn"
                  onClick={onVoiceClick}
                  aria-label="Voice search"
                >
                  <span>Voice</span>
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
                >
                  <PokerNearMeConsoleIcon name="location" />
                </button>
              )}
            </div>
          </div>

          {/* GPS Location Status Indicator — shown INLINE to the RIGHT of the search bar */}
          {gpsActive && (locationCity || locationState) && (
            <button
              type="button"
              onClick={onManualLocation}
              className="lobby-location-status"
              aria-label={`Change location. Current location ${locationCity}${locationState ? `, ${locationState}` : ''}`}
            >
              <PokerNearMeConsoleIcon name="location" />
              <span className="lobby-location-status__place">
                {locationCity}{locationState ? `, ${locationState}` : ''}
              </span>
              <span className="lobby-location-status__action">Change</span>
            </button>
          )}
        </div>

        {/* Non-GPS state: show location prompts below, full-width */}
        {!gpsActive && (
          <div className="lobby-location-prompts">
              {/* Use Saved Location — quick restore from previous session */}
              {savedLocation?.lat && savedLocation?.lng && savedLocationCity && onUseSavedLocation && (
                <button
                  type="button"
                  className="lobby-location-prompt"
                  onClick={onUseSavedLocation}
                  aria-label={`Use saved location ${savedLocationCity}${savedLocationState ? `, ${savedLocationState}` : ''}`}
                >
                  <PokerNearMeConsoleIcon name="location" />
                  <div className="lobby-location-prompt__copy">
                    <div className="lobby-location-prompt__title">
                      Use Saved Location
                    </div>
                    <div className="lobby-location-prompt__detail">
                      {savedLocationCity}{savedLocationState ? `, ${savedLocationState}` : ''}
                    </div>
                  </div>
                  <PokerNearMeConsoleIcon name="directions" />
                </button>
              )}
              {/* Enable Location — GPS fresh */}
              <button
                type="button"
                onClick={() => {
                  if (onShowEnablePopup) {
                    onShowEnablePopup();
                  } else if (onManualLocation) {
                    onManualLocation();
                  } else if (onGpsClick) {
                    onGpsClick();
                  }
                }}
                className="lobby-location-prompt lobby-location-prompt--enable"
                aria-label="Enable location to find poker rooms, live games and events near you"
              >
                <PokerNearMeConsoleIcon name="location" />
                <div className="lobby-location-prompt__copy">
                  <div className="lobby-location-prompt__title">
                    Enable Location
                  </div>
                  <div className="lobby-location-prompt__detail">
                    Find Poker Rooms, Live Games, And Events Near You
                  </div>
                </div>
                <PokerNearMeConsoleIcon name="directions" />
              </button>
            </div>
        )}

      </header>


      {/* GPS Error Toast */}
      {gpsError && (
        <div className="lobby-gps-error" role="alert">
          {gpsError}
        </div>
      )}

      {/* ═══ SINGLE DYNAMIC IMAGE with clickable hotspot overlay ═══
          Mobile phase 3: plain flow, no inner scroller. The page scrolls. */}
      <div className="lobby-card-scroll">
        <div className="lobby-grid-stage">
          {/* Grid image — WebP with PNG fallback for broad compatibility */}
          <picture>
            <source srcSet="/images/lobby-pods/poker-near-me-grid.webp" type="image/webp" />
            <img
              src="/images/lobby-pods/poker-near-me-grid.webp"
              alt="Poker Near Me Feature Grid"
              loading="eager"
              fetchPriority="high"
              onError={() => setGridImageFailed(true)}
              className={gridImageFailed ? 'lobby-grid-image is-hidden' : 'lobby-grid-image'}
            />
          </picture>

          {/* Transparent clickable hotspot grid overlaid on top of the image */}
          <div style={{
            // Inset only applies while the grid is absolutely positioned over the
            // bitmap. In the image-failure fallback the grid becomes the flow
            // content itself, where `left`/`top` would just nudge it off-centre
            // (and `right`/`bottom` are ignored for a relatively positioned box).
            top: gridImageFailed ? undefined : '2.5%',
            left: gridImageFailed ? undefined : '2%',
            right: gridImageFailed ? undefined : '2%',
            bottom: gridImageFailed ? undefined : '2%',
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gridTemplateRows: 'repeat(3, 1fr)',
            gap: gridImageFailed ? 8 : 0,
            overflow: 'visible',
            pointerEvents: 'auto',
            minHeight: gridImageFailed ? 260 : undefined,
            position: gridImageFailed ? 'relative' : 'absolute',
          }}
          className={gridImageFailed ? 'lobby-hotspots lobby-hotspots-fallback' : 'lobby-hotspots'}
          data-tutorial="nav"
          >
            {GRID_HOTSPOTS.map((hotspot) => (
              <a
                key={hotspot.id}
                href={hotspot.href}
                data-tutorial-id={`pod-${hotspot.id}`}
                data-tutorial={TUTORIAL_TARGETS[hotspot.id] || undefined}
                className="lobby-hotspot"
                onClick={(e) => {
                  // Let modified clicks (new tab / new window) behave natively.
                  if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
                  e.preventDefault();
                  try { navigator.vibrate?.([10, 30, 10]); } catch (err) { console.warn('[App] Handled exception:', err); }
                  onPodSelect?.(hotspot.id);
                }}
                aria-label={`Open ${hotspot.label}`}
              >
                {/* Text label. Icon names live only inside the bitmap, so they
                    are not translatable, selectable or zoomable and there is no
                    fallback when the image 404s. This label is always in the DOM
                    (readable by assistive tech and crawlers) and fades in on
                    hover/focus so the visual design is unchanged at rest. */}
                <span className="lobby-hotspot-label">{hotspot.label}</span>
              </a>
            ))}
          </div>
        </div>

        {/* ═══ LIVE STATS BAR — below the grid ═══ */}
        <PokerNearMePanelShell as="section" className="lobby-stats-panel" aria-label="Poker Near Me directory status">
          {[
            { value: formattedVenueCount, label: 'Public Venues', color: '#6ee7ef' },
            // Label comes from /api/poker/live-tables metadata.data_mode via the
            // page: 'Est. Tables' when the published number is modelled rather
            // than observed. Never present an estimate as live data.
            { value: liveData?.liveGameCount || 0, label: liveData?.liveGameLabel || 'Cash Tables', color: '#3fb950' },
            { value: liveData?.dailyCount || 0, label: "Today's Tournaments", color: '#ffffff' },
          ].map((stat, i) => (
            <div key={i} className="lobby-stat">
              <div className="lobby-stat__value" style={{ color: stat.color }}>
                <span>{typeof stat.value === 'number' ? stat.value.toLocaleString() : stat.value}</span>
              </div>
              <div className="lobby-stat__label">{stat.label}</div>
            </div>
          ))}
        </PokerNearMePanelShell>


      </div>
    </div>

    <style>{`
      /* Bitmap labels are static painted art; this DOM copy remains available
         to assistive technology and becomes visible only in the image fallback. */
      .lobby-hotspot-label {
        position: absolute;
        width: 1px;
        height: 1px;
        overflow: hidden;
        clip-path: inset(50%);
      }
      /* [AUDIT] outline:none used to be set inline on every hotspot, so keyboard
         users tabbing through twelve transparent buttons got no indication of
         where they were. */
      .lobby-hotspot:focus-visible {
        outline: 2px solid #6ee7ef;
        outline-offset: -2px;
      }
      /* Image-failure fallback: show real tiles instead of invisible buttons. */
      .lobby-hotspots-fallback .lobby-hotspot {
        border: 0 !important;
        background: transparent url('/images/pnm-console/painted-controls-v1/button-secondary.png') center / contain no-repeat !important;
        min-height: 64px;
      }
      .lobby-hotspots-fallback .lobby-hotspot-label {
        opacity: 1;
        inset: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        width: auto;
        height: auto;
        overflow: visible;
        clip-path: none;
        color: #eef5fb;
        font: 700 12px/1.1 var(--font-rajdhani), Rajdhani, Inter, sans-serif;
        text-align: center;
        text-transform: uppercase;
      }
    `}</style>
    </>
  );
}
