/**
 * LobbyOverlay.jsx — The UI layer on top of the background.
 *
 * Renders:
 *   - "POKER NEAR ME" title
 *   - Search bar with autocomplete + GPS
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

import React, { useMemo } from 'react';
import { PokerNearMeConsoleIcon } from '../PokerNearMeConsole';

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


// A feed that cannot report a figure says so plainly. "Unknown" read like a
// fault on the lobby; the value is still a word in muted ink, never a zero.
function displayWord(word) {
  return word === 'Unknown' ? 'Not Reported' : word;
}

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
  // Public venue count. Null while the page is still asking, a word
  // ('Unknown') when it could not find out: a missing count never prints as 0.
  const venueStatValue = useMemo(() => {
    if (typeof venueCount === 'number') return venueCount > 0 ? venueCount : null;
    return venueCount ?? null;
  }, [venueCount]);

  // If the grid bitmap 404s or is blocked, the twelve hotspots would otherwise
  // sit over empty space with nothing visible to click.



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
                  {/* Short enough for one 12px line on the well's face at 390px;
                      the aria-label carries the full sentence. */}
                  <div className="lobby-location-prompt__detail">
                    Rooms, Games And Events Near You
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

      {/* ═══ DESTINATION GRID (#SMARTERDESIGN, Dan 2026-11-27) ═══
          Twelve real tiles. Each one is a single link: its painted icon, sized
          from public/images/smarterdesign/pnm/tile-<id>.webp (256x256, cut
          from the approved grid art without the old bulky outer frame), and
          its live Title Case label. The whole tile is the click target. It
          used to be one 1024px bitmap with the labels painted in, under
          transparent hotspots, which printed "TOURNAMENT ALERTS" in capitals,
          could not wrap a label, and put a second heavy frame round the grid. */}
      <div className="lobby-card-scroll">
        <nav className="lobby-grid-stage pnm-sd-grid" aria-label="Poker Near Me Destinations">
          <div className="lobby-hotspots pnm-sd-grid__tiles" data-tutorial="nav">
            {GRID_HOTSPOTS.map((hotspot, index) => (
              <a
                key={hotspot.id}
                href={hotspot.href}
                data-tutorial-id={`pod-${hotspot.id}`}
                data-tutorial={TUTORIAL_TARGETS[hotspot.id] || undefined}
                className="lobby-hotspot pnm-sd-tile"
                onClick={(e) => {
                  if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
                  e.preventDefault();
                  try { navigator.vibrate?.([10, 30, 10]); } catch (err) { console.warn('[App] Handled exception:', err); }
                  onPodSelect?.(hotspot.id);
                }}
              >
                <img
                  className="pnm-sd-tile__icon"
                  src={`/images/smarterdesign/pnm/tile-${hotspot.id}.webp`}
                  alt=""
                  width={256}
                  height={256}
                  loading={index < 8 ? 'eager' : 'lazy'}
                  decoding="async"
                  draggable={false}
                />
                <span className="lobby-hotspot-label pnm-sd-tile__label">{hotspot.label}</span>
              </a>
            ))}
          </div>
        </nav>

        {/* ═══ LIVE STATS BAR — below the grid ═══
            A value the page has not received yet prints Loading and one it could
            not get prints Unknown, both in muted ink. Neither is ever a zero. */}
        <section className="lobby-stats-panel pnm-sd-stats" aria-label="Poker Near Me Directory Status">
          {[
            { key: 'venues', value: venueStatValue, label: 'Public Venues', ink: 'blue' },
            // Label comes from /api/poker/live-tables metadata.data_mode via the
            // page: 'Estimated Tables' when the published number is modelled
            // rather than observed. Never present an estimate as live data, and
            // only an observed count takes the green live ink.
            { key: 'tables', value: liveData?.liveGameCount, label: liveData?.liveGameLabel || 'Live Count', ink: liveData?.liveGameObserved ? 'green' : 'silver' },
            { key: 'daily', value: liveData?.dailyCount, label: "Today's Tournaments", ink: 'silver' },
          ].map((stat) => {
            const isCount = typeof stat.value === 'number' && Number.isFinite(stat.value);
            return (
              <div key={stat.key} className="lobby-stat sd-metric" aria-busy={stat.value == null ? 'true' : undefined}>
                <div className={`lobby-stat__value pnc-ink--${isCount ? stat.ink : 'muted'}`}>
                  <span>{isCount ? stat.value.toLocaleString() : displayWord(stat.value == null ? 'Loading' : String(stat.value))}</span>
                </div>
                <div className="lobby-stat__label">{stat.label}</div>
              </div>
            );
          })}
        </section>


      </div>
    </div>
    </>
  );
}
