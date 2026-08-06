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

import React, { useMemo, useState } from 'react';
import InteractiveTutorial, { LOBBY_TUTORIAL_STEPS } from '../InteractiveTutorial';

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





/* FirstTimeTutorial removed — replaced by InteractiveTutorial component */

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
  showTutorial = false,
  onTutorialDismiss,
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

        {/* Search bar + Location row: flex row so location sits to the right of the search bar.
            [MOBILE FIX] flexWrap is required: at <=600px `.lobby-search-form` is
            `width: calc(100vw - 24px)`, which consumes the whole row, so a
            non-wrapping row pushed the location pill past the viewport edge —
            and `.pnm-lobby-page` is `overflow:hidden`, so it was clipped away
            entirely. With wrapping the pill drops onto its own line instead. */}
        <div style={{
          display: 'flex', flexDirection: 'row', alignItems: 'center',
          flexWrap: 'wrap',
          gap: 12,
          width: 'min(700px, calc(100vw - 32px))',
          pointerEvents: 'auto',
          position: 'relative',
        }}>
          <div className="lobby-search-form" style={{ position: 'relative', flex: '0 0 auto', pointerEvents: 'auto' }}>
            <div className="lobby-search-wrap" style={{
              backdropFilter: 'blur(16px)',
              background: 'rgba(6, 21, 37, 0.7)',
              border: '1px solid rgba(110, 231, 239, 0.2)',
              transition: 'all 0.25s',
            }}>
              <svg className="lobby-search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" data-tutorial-id="lobby-search">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
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
                style={{ cursor: 'text', userSelect: 'none', display: 'flex', alignItems: 'center' }}
              >
                <span style={{ color: searchQuery ? 'inherit' : 'rgba(200,214,229,0.35)', fontWeight: searchQuery ? 500 : 400 }}>
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
                  style={{
                    flexShrink: 0, width: 44, height: 44, borderRadius: '50%',
                    border: '1px solid rgba(110, 231, 239, 0.15)',
                    background: 'rgba(110, 231, 239, 0.06)',
                    color: 'rgba(200, 214, 229, 0.5)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    cursor: 'pointer', transition: 'all 0.25s',
                    marginRight: 4, padding: 0,
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
                  style={{
                    flexShrink: 0, width: 44, height: 44, borderRadius: '50%',
                    border: gpsActive ? '1.5px solid rgba(34,197,94,0.5)' : '1px solid rgba(110, 231, 239, 0.15)',
                    background: gpsActive ? 'rgba(34,197,94,0.12)' : 'rgba(110, 231, 239, 0.06)',
                    color: gpsActive ? '#22c55e' : 'rgba(200, 214, 229, 0.5)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    cursor: gpsLoading ? 'wait' : 'pointer',
                    transition: 'all 0.25s',
                    opacity: gpsLoading ? 0.6 : 1,
                    padding: 0,
                  }}
                >
                  {gpsLoading ? (
                    <svg width="18" height="18" viewBox="0 0 24 24" style={{ animation: 'spin 1s linear infinite' }}>
                      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" fill="none" strokeDasharray="31" strokeDashoffset="10" />
                    </svg>
                  ) : (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polygon points="3 11 22 2 13 21 11 13 3 11" />
                    </svg>
                  )}
                </button>
              )}
            </div>
          </div>

          {/* GPS Location Status Indicator — shown INLINE to the RIGHT of the search bar */}
          {gpsActive && (locationCity || locationState) && (
            <button
              type="button"
              onClick={onManualLocation}
              aria-label={`Change location. Current location ${locationCity}${locationState ? `, ${locationState}` : ''}`}
              style={{
                display: 'flex', alignItems: 'center', gap: 7,
                cursor: 'pointer', pointerEvents: 'auto',
                // Shrinkable + minWidth:0 so the pill can compress on narrow
                // screens instead of overflowing the (clipped) page container.
                flexShrink: 1, minWidth: 0, maxWidth: '100%',
                background: 'rgba(6, 21, 37, 0.6)',
                backdropFilter: 'blur(12px)',
                border: '1px solid rgba(63,185,80,0.3)',
                borderRadius: 22,
                padding: '7px 16px 7px 12px',
                transition: 'all 0.2s',
                whiteSpace: 'nowrap',
                fontFamily: 'inherit',
                textAlign: 'left',
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#3fb950" strokeWidth="2.5" style={{ flexShrink: 0 }}>
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/>
              </svg>
              <span style={{
                fontSize: 18, color: '#3fb950', fontWeight: 700, letterSpacing: '-0.2px',
                minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {locationCity}{locationState ? `, ${locationState}` : ''}
              </span>
              <span style={{ fontSize: 15, color: 'rgba(200,214,229,0.45)', marginLeft: 4, fontWeight: 500, flexShrink: 0 }}>Change</span>
            </button>
          )}
        </div>

        {/* Non-GPS state: show location prompts below, full-width */}
        {!gpsActive && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8, width: 'min(440px, calc(100vw - 32px))', pointerEvents: 'auto' }}>
              {/* Use Saved Location — quick restore from previous session */}
              {savedLocation?.lat && savedLocation?.lng && savedLocationCity && onUseSavedLocation && (
                <button
                  type="button"
                  onClick={onUseSavedLocation}
                  aria-label={`Use saved location ${savedLocationCity}${savedLocationState ? `, ${savedLocationState}` : ''}`}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    cursor: 'pointer', pointerEvents: 'auto',
                    padding: '10px 16px',
                    background: 'linear-gradient(135deg, rgba(255,255,255,0.08), rgba(255,255,255,0.02))',
                    border: '1.5px solid rgba(255,255,255,0.2)',
                    borderRadius: 14,
                    transition: 'all 0.3s',
                    width: '100%', textAlign: 'left', fontFamily: 'inherit',
                  }}
                >
                  <div style={{
                    width: 32, height: 32, borderRadius: '50%',
                    background: 'linear-gradient(135deg, rgba(255,255,255,0.2), rgba(255,255,255,0.08))',
                    border: '1px solid rgba(255,255,255,0.35)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0,
                  }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
                      <path d="M3 3v5h5"/>
                    </svg>
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#ffffff', letterSpacing: '-0.2px' }}>
                      Use Saved Location
                    </div>
                    <div style={{ fontSize: 11, color: 'rgba(200,214,229,0.45)', marginTop: 1 }}>
                      {savedLocationCity}{savedLocationState ? `, ${savedLocationState}` : ''}
                    </div>
                  </div>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="2" style={{ flexShrink: 0 }}>
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
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
                aria-label="Enable location to find poker rooms, live games and events near you"
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  cursor: 'pointer', pointerEvents: 'auto',
                  padding: '10px 16px',
                  background: 'linear-gradient(135deg, rgba(34,197,94,0.06), rgba(34,197,94,0.02))',
                  border: '1px solid rgba(34,197,94,0.2)',
                  borderRadius: 14,
                  transition: 'all 0.3s',
                  width: '100%', textAlign: 'left', fontFamily: 'inherit',
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
              </button>
            </div>
        )}

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
          {/* Grid image — WebP with PNG fallback for broad compatibility */}
          <picture>
            <source srcSet="/images/lobby-pods/poker-near-me-grid.webp" type="image/webp" />
            <img
              src="/images/lobby-pods/poker-near-me-grid.png"
              alt="Poker Near Me Feature Grid"
              loading="eager"
              fetchPriority="high"
              onError={() => setGridImageFailed(true)}
              style={{
                width: '100%',
                height: 'auto',
                display: gridImageFailed ? 'none' : 'block',
                borderRadius: 12,
              }}
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
            pointerEvents: showTutorial ? 'none' : 'auto',
            minHeight: gridImageFailed ? 260 : undefined,
            position: gridImageFailed ? 'relative' : 'absolute',
          }}
          className={gridImageFailed ? 'lobby-hotspots lobby-hotspots-fallback' : 'lobby-hotspots'}
          >
            {GRID_HOTSPOTS.map((hotspot) => (
              <a
                key={hotspot.id}
                href={hotspot.href}
                data-tutorial-id={`pod-${hotspot.id}`}
                className="lobby-hotspot"
                onClick={(e) => {
                  // Let modified clicks (new tab / new window) behave natively.
                  if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
                  e.preventDefault();
                  try { navigator.vibrate?.([10, 30, 10]); } catch (err) { console.warn('[App] Handled exception:', err); }
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
                  display: 'block',
                  textDecoration: 'none',
                }}
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
        <div style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'stretch',
          padding: '14px 16px',
          marginTop: 12,
          maxWidth: 900,
          width: 'calc(100% - 8px)',
          background: 'linear-gradient(135deg, rgba(10,18,32,0.85), rgba(6,12,24,0.85))',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          borderRadius: 14,
          border: '1px solid rgba(110,231,239,0.1)',
          fontFamily: 'Inter, system-ui, sans-serif',
          pointerEvents: 'none',
          gap: 0,
        }}>
          {[
            { value: formattedVenueCount, label: 'Venues', color: '#6ee7ef' },
            // Label comes from /api/poker/live-tables metadata.data_mode via the
            // page: 'Est. Tables' when the published number is modelled rather
            // than observed. Never present an estimate as live data.
            { value: liveData?.liveGameCount || 0, label: liveData?.liveGameLabel || 'Live Tables', color: '#3fb950' },
            { value: liveData?.dailyCount || 0, label: "Today's Tournaments", color: '#ffffff' },
          ].map((stat, i) => (
            <div key={i} style={{
              flex: '1 1 0',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              textAlign: 'center',
              minWidth: 0,
            }}>
              <div style={{
                fontSize: 'clamp(20px, 3.5vw, 28px)',
                fontWeight: 800,
                color: stat.color,
                lineHeight: 1.1,
                letterSpacing: '-0.02em',
              }}>
                <span>{typeof stat.value === 'number' ? stat.value.toLocaleString() : stat.value}</span>
              </div>
              <div style={{
                fontSize: 'clamp(8px, 1.4vw, 11px)',
                color: 'rgba(200,214,229,0.45)',
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                marginTop: 4,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                maxWidth: '100%',
              }}>{stat.label}</div>
            </div>
          ))}
        </div>


      </div>
    </div>

    <style>{`
      /* Hotspot labels: always present in the DOM (assistive tech + crawlers),
         visually revealed on hover/focus so the artwork reads unchanged at rest. */
      .lobby-hotspot-label {
        position: absolute;
        inset: auto 4px 6px 4px;
        display: block;
        padding: 2px 4px;
        border-radius: 6px;
        font-family: Inter, system-ui, sans-serif;
        font-size: clamp(8px, 1.2vw, 11px);
        font-weight: 700;
        letter-spacing: 0.02em;
        text-align: center;
        color: #e0e8f0;
        background: rgba(6, 15, 28, 0.82);
        opacity: 0;
        transition: opacity 0.18s ease;
        pointer-events: none;
      }
      .lobby-hotspot:hover .lobby-hotspot-label,
      .lobby-hotspot:focus-visible .lobby-hotspot-label {
        opacity: 1;
      }
      /* [AUDIT] outline:none used to be set inline on every hotspot, so keyboard
         users tabbing through twelve transparent buttons got no indication of
         where they were. */
      .lobby-hotspot:focus-visible {
        outline: 2px solid #6ee7ef;
        outline-offset: -2px;
        border-radius: 8px;
      }
      /* Image-failure fallback: show real tiles instead of invisible buttons. */
      .lobby-hotspots-fallback .lobby-hotspot {
        border: 1px solid rgba(110,231,239,0.25) !important;
        border-radius: 10px;
        background: rgba(10,18,32,0.85) !important;
        min-height: 64px;
      }
      .lobby-hotspots-fallback .lobby-hotspot-label {
        opacity: 1;
        inset: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        background: transparent;
      }
      @media (prefers-reduced-motion: reduce) {
        .lobby-hotspot-label { transition: none; }
      }
    `}</style>
    </>
  );
}
