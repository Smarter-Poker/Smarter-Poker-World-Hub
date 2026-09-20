/**
 * TRIVIA LOBBY - Mode discovery and entry routing.
 * Painted card chassis come from the shared Trivia console primitives.
 */

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/router';
import { acquireScrollLock } from '../../lib/scrollLock';
import TriviaFrameCard from './console/TriviaFrameCard';
// The lobby no longer bills, so supabase / EventBus / getAuthUser are gone with
// deductDiamonds. Entry price now comes from the engine config only.
import { getModeConfig } from '../../lib/trivia/triviaEngine';
import {
  TRIVIA_FEATURED_MODE,
  TRIVIA_MIDDLE_MODES as MODE_CARDS,
  TRIVIA_MODE_FILTER_COUNTS as MODE_FILTER_COUNTS,
  TRIVIA_MODE_FILTERS as MODE_FILTERS,
  TRIVIA_QUICK_STAKES_MODE,
  getTriviaModeRoute as getModeRoute,
  resolveTriviaModeAvailability,
} from '../../config/triviaModeRegistry.mjs';

const ACKNOWLEDGED_KEY = 'trivia_charge_acknowledged';

// Mixed Mode is the lobby's multi-category progression card; all other cards
// use their registry category directly. This keeps every frame family owned by
// the shared raster primitive rather than rebuilding frame geometry here.
function getModeFrameFamily(mode) {
  return mode.id === 'mixed' ? 'progress' : mode.category;
}

/**
 * ENTRY PRICING — display only.
 * ═══════════════════════════════════════════════════════════════════════════
 * The lobby no longer charges anything. It used to deduct a flat 10 diamonds
 * and then write sessionStorage('trivia_paid') for the destination page to
 * trust, which was broken two ways:
 *   1. The "receipt" was a client-side string. Anyone could set it in devtools
 *      and play every paid mode free.
 *   2. The lobby charged 10 for history/rules/pro even though those modes have
 *      diamondCost: 0, so the SAME game was free by direct URL and 10 diamonds
 *      from the lobby.
 * Every destination page already performs its own server-verified charge (a
 * DiamondEngine/RPC deduction with an idempotency key). That charge is now the
 * only entitlement, so lobby entry and direct-URL entry cost exactly the same.
 *
 * The price shown comes straight from TRIVIA_MODES.diamondCost — the local
 * PAGE_ENTRY_COSTS override table that used to live here is gone, because the
 * engine config now carries the real number for every paid mode (mtt/cash/
 * icm/gto/mixed/endless/survival/time-attack). One table, so the lobby price
 * and the direct-URL price cannot drift apart again.
 */

/** What the user will actually be charged when they enter this mode. */
function getEntryCost(modeId) {
  const configured = getModeConfig(modeId)?.diamondCost;
  return Number.isFinite(configured) && configured > 0 ? configured : 0;
}

/** Modes whose entry price is a stake / tournament fee rather than fixed. */
const VARIABLE_COST_MODES = new Set(['pvp', 'tournaments']);

/**
 * onDiamondsChange is still accepted (index.js passes it) but is intentionally
 * unused: this component no longer moves diamonds, so it has no delta to
 * report. The destination pages emit their own balance updates.
 */
export default function TriviaLobby({
  userDiamonds = 0,
  isVip = false,
  dailyCompleted = false,
  currentStreak = 0,
  onDiamondsChange,
  modeAvailability,
}) {
  const router = useRouter();
  const [activeFilter, setActiveFilter] = useState('all');
  const filterRailRef = useRef(null);
  const filterButtonRefs = useRef([]);
  const modalRef = useRef(null);
  const modalCloseRef = useRef(null);
  const previousFocusRef = useRef(null);
  const routingRef = useRef(false);
  const prefetchedRoutesRef = useRef(new Set());

  useEffect(() => {
    // Clear any legacy 'already paid' flags left in this session by an
    // older build. Nothing writes them any more, and a stale one would
    // hand out one free paid entry on the destination page.
    try {
      sessionStorage.removeItem('trivia_paid');
      sessionStorage.removeItem('trivia_mode');
    } catch (e) {
      console.warn('[App] Handled exception:', e?.message || e);
    }
  }, []);

  // Cost-disclosure state. NOTE: no diamonds move in this component any
  // more — the popup only tells the player what the destination page will
  // charge, and Accept routes them there.
  const [showChargePopup, setShowChargePopup] = useState(false);
  const [pendingMode, setPendingMode] = useState(null);
  const [isRouting, setIsRouting] = useState(false);
  const [routeError, setRouteError] = useState('');

  const pendingCost = pendingMode ? getEntryCost(pendingMode) : 0;
  const filteredModes =
    activeFilter === 'all'
      ? MODE_CARDS
      : MODE_CARDS.filter((mode) => mode.category === activeFilter);
  const availabilityFor = (modeId) => resolveTriviaModeAvailability(modeId, modeAvailability);
  const liveModeCount = filteredModes.filter((mode) => availabilityFor(mode.id).enabled).length;
  const maintenanceModeCount = filteredModes.length - liveModeCount;
  const dailyAvailability = availabilityFor(TRIVIA_FEATURED_MODE.id);
  const quickStakesAvailability = availabilityFor(TRIVIA_QUICK_STAKES_MODE.id);

  const revealFilter = (filterIndex, { focus = false } = {}) => {
    // Wait for React to apply the active state before measuring. Scrolling
    // the rail directly keeps the page's vertical position untouched.
    requestAnimationFrame(() => {
      const rail = filterRailRef.current;
      const button = filterButtonRefs.current[filterIndex];
      if (!rail || !button) return;

      if (focus) button.focus();

      const maxLeft = Math.max(0, rail.scrollWidth - rail.clientWidth);
      if (maxLeft === 0) return;

      const targetLeft = button.offsetLeft - (rail.clientWidth - button.offsetWidth) / 2;
      const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      rail.scrollTo({
        left: Math.min(maxLeft, Math.max(0, targetLeft)),
        behavior: reduceMotion ? 'auto' : 'smooth',
      });
    });
  };

  const selectFilter = (filterId, filterIndex, options) => {
    setActiveFilter(filterId);
    revealFilter(filterIndex, options);
  };

  useEffect(() => {
    if (!router.isReady) return;
    const requested = typeof router.query.filter === 'string' ? router.query.filter : '';
    const filterIndex = MODE_FILTERS.findIndex((filter) => filter.id === requested);
    if (filterIndex >= 0) selectFilter(requested, filterIndex);
    // The query string is the external navigation contract. selectFilter is
    // deliberately omitted because it is recreated during render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router.isReady, router.query.filter]);

  useEffect(() => {
    if (!showChargePopup) return undefined;
    previousFocusRef.current = document.activeElement;
    const releaseScrollLock = acquireScrollLock('trivia-entry-disclosure');
    const focusTimer = window.setTimeout(() => modalCloseRef.current?.focus(), 0);

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setShowChargePopup(false);
        setPendingMode(null);
        return;
      }
      if (event.key !== 'Tab' || !modalRef.current) return;
      const focusable = Array.from(
        modalRef.current.querySelectorAll(
          'button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'
        )
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener('keydown', handleKeyDown);
      releaseScrollLock();
      if (!routingRef.current && previousFocusRef.current instanceof HTMLElement) {
        previousFocusRef.current.focus();
      }
    };
  }, [showChargePopup]);

  const handleFilterKeyDown = (event, currentIndex) => {
    let nextIndex;

    switch (event.key) {
      case 'ArrowRight':
        nextIndex = (currentIndex + 1) % MODE_FILTERS.length;
        break;
      case 'ArrowLeft':
        nextIndex = (currentIndex - 1 + MODE_FILTERS.length) % MODE_FILTERS.length;
        break;
      case 'Home':
        nextIndex = 0;
        break;
      case 'End':
        nextIndex = MODE_FILTERS.length - 1;
        break;
      default:
        return;
    }

    event.preventDefault();
    selectFilter(MODE_FILTERS[nextIndex].id, nextIndex, { focus: true });
  };

  const prefetchMode = (modeId) => {
    if (!availabilityFor(modeId).enabled) return;
    const route = getModeRoute(modeId);
    if (prefetchedRoutesRef.current.has(route)) return;
    prefetchedRoutesRef.current.add(route);
    router.prefetch(route).catch(() => prefetchedRoutesRef.current.delete(route));
  };

  // Route to the correct page for a mode, and recover if Next cancels or
  // rejects the transition. The old fire-and-forget push stranded the full
  // screen spinner forever after a route error.
  const routeToMode = async (modeId) => {
    if (routingRef.current) return;
    routingRef.current = true;
    setRouteError('');
    setIsRouting(true);
    try {
      const didNavigate = await router.push(getModeRoute(modeId));
      if (didNavigate === false) throw new Error('Navigation was cancelled');
    } catch (error) {
      console.warn('[TriviaLobby] Could not open mode:', error?.message || error);
      routingRef.current = false;
      setIsRouting(false);
      setRouteError('That game could not be opened. Please try again.');
    }
  };

  const handleChargeAccept = () => {
    const modeId = pendingMode;
    if (!modeId) return;
    // Remember the disclosure so it is shown once, not once per mode.
    try {
      localStorage.setItem(ACKNOWLEDGED_KEY, 'true');
    } catch (e) {
      console.warn('[App] Handled exception:', e?.message || e);
    }
    setShowChargePopup(false);
    setPendingMode(null);
    void routeToMode(modeId);
  };

  // Synchronous re-entry guard: two fast taps on a card used to run two
  // start flows (and, when this component still billed, two charges).
  const _startModeInFlightRef = useRef(false);
  const startMode = (modeId) => {
    if (_startModeInFlightRef.current) return;
    _startModeInFlightRef.current = true;
    try {
      _startModeInner(modeId);
    } finally {
      // Released on the next tick — the guard only exists to swallow the
      // duplicate click in the same burst.
      setTimeout(() => {
        _startModeInFlightRef.current = false;
      }, 400);
    }
  };

  const _startModeInner = (modeId) => {
    const availability = availabilityFor(modeId);
    if (!availability.enabled) {
      setRouteError(availability.message);
      return;
    }

    // Block daily if already completed
    if (modeId === 'daily' && dailyCompleted) return;

    const cost = getEntryCost(modeId);

    // VIPs and free modes go straight through.
    if (isVip || cost === 0 || VARIABLE_COST_MODES.has(modeId)) {
      void routeToMode(modeId);
      return;
    }

    let acknowledged = false;
    try {
      acknowledged = localStorage.getItem(ACKNOWLEDGED_KEY) === 'true';
    } catch (e) {
      console.warn('[App] Handled exception:', e?.message || e);
    }

    if (!acknowledged) {
      setPendingMode(modeId);
      setShowChargePopup(true);
      return;
    }

    void routeToMode(modeId);
  };

  return (
    <div className="trivia-lobby">
      {/* Approved Daily Trivia artwork remains the full visual authority. */}
      <div className="daily-trivia-banner">
        <img
          src={TRIVIA_FEATURED_MODE.image}
          alt={TRIVIA_FEATURED_MODE.imageAlt}
          className="daily-trivia-banner__image"
          width={TRIVIA_FEATURED_MODE.imageWidth}
          height={TRIVIA_FEATURED_MODE.imageHeight}
          fetchpriority="high"
          decoding="async"
        />
        {/* One full-card target keeps pointer and keyboard behavior identical. */}
        <button
          type="button"
          className="daily-trivia-banner__button"
          onClick={() => {
            if (!dailyCompleted && dailyAvailability.enabled) startMode(TRIVIA_FEATURED_MODE.id);
          }}
          disabled={dailyCompleted || !dailyAvailability.enabled}
          aria-label={
            dailyCompleted
              ? 'Daily Trivia Completed'
              : dailyAvailability.enabled
                ? 'Start Daily Trivia - free, once per day'
                : dailyAvailability.message
          }
        />
        {currentStreak > 0 && !dailyCompleted && (
          <span className="daily-streak-chip" title={`${currentStreak} day streak`}>
            Day {currentStreak} - Keep It Alive!
          </span>
        )}
        {dailyCompleted && (
          <div className="daily-trivia-banner__completed">
            <span>
              COMPLETED
              {currentStreak > 0 ? ` - ${currentStreak} DAY STREAK` : ''}
            </span>
          </div>
        )}
      </div>

      {/* Mode Cards Section */}
      <div className="modes-section">
        <div className="modes-toolbar">
          <div>
            <span className="modes-toolbar__eyebrow">GAME SELECT // TRIVIA NETWORK</span>
            <h2>Choose Your Game</h2>
          </div>
          <span
            className="modes-toolbar__count"
            role="status"
            aria-live="polite"
            aria-atomic="true"
          >
            {liveModeCount} LIVE
            {maintenanceModeCount > 0 ? ` / ${maintenanceModeCount} MAINTENANCE` : ''}
          </span>
        </div>

        <div
          ref={filterRailRef}
          className="mode-filters"
          role="toolbar"
          aria-label="Filter trivia modes"
        >
          {MODE_FILTERS.map((filter, filterIndex) => (
            <button
              key={filter.id}
              ref={(node) => {
                filterButtonRefs.current[filterIndex] = node;
              }}
              type="button"
              className={`mode-filter${activeFilter === filter.id ? ' mode-filter--active' : ''}`}
              onClick={() => selectFilter(filter.id, filterIndex)}
              onKeyDown={(event) => handleFilterKeyDown(event, filterIndex)}
              tabIndex={activeFilter === filter.id ? 0 : -1}
              aria-pressed={activeFilter === filter.id}
              aria-controls="trivia-mode-grid"
              aria-label={`${filter.label}, ${MODE_FILTER_COUNTS[filter.id]} modes`}
            >
              <span>{filter.label}</span>
              <span className="mode-filter__count" aria-hidden>
                {MODE_FILTER_COUNTS[filter.id]}
              </span>
            </button>
          ))}
        </div>

        <div className="modes-grid" id="trivia-mode-grid">
          {filteredModes.map((mode) => {
            const availability = availabilityFor(mode.id);
            const unavailable = !availability.enabled;
            const cost = getEntryCost(mode.id);
            const variableCost = VARIABLE_COST_MODES.has(mode.id);
            const costText = unavailable
              ? 'UNAVAILABLE'
              : isVip
                ? 'VIP FREE'
                : variableCost
                  ? 'VARIABLE'
                  : cost > 0
                    ? `${cost} DIAMONDS`
                    : 'FREE';
            const rewardText =
              typeof mode.diamondReward === 'number'
                ? `+${mode.diamondReward}${mode.perfectBonus ? ` / +${mode.perfectBonus} PERFECT` : ''}`
                : mode.diamondReward
                  ? String(mode.diamondReward).toUpperCase()
                  : '-';

            return (
              <TriviaFrameCard
                key={mode.id}
                className={`mode-image-card${unavailable ? ' mode-image-card--maintenance' : ''}`}
                family={getModeFrameFamily(mode)}
                image={mode.image}
                imageAlt=""
                frameLabel={mode.name}
                data-mode-availability={availability.state}
                onClick={() => startMode(mode.id)}
                onPointerDown={() => availability.enabled && prefetchMode(mode.id)}
                onFocus={() => availability.enabled && prefetchMode(mode.id)}
                disabled={isRouting || unavailable}
                title={unavailable ? availability.message : undefined}
                aria-label={
                  unavailable
                    ? `${mode.name}. ${availability.message}`
                    : `${mode.name}. ${mode.description}. ${costText}${rewardText ? `. Reward ${rewardText}${typeof mode.diamondReward === 'number' ? ' diamonds' : ''}` : ''}.`
                }
              >
                <span className="mode-image-card__body">
                  <span className="mode-image-card__kicker">
                    {mode.code} / {mode.category} {'//'} {mode.id} /{' '}
                    {availability.label.toUpperCase()}
                  </span>
                  <span className="mode-image-card__description">
                    {unavailable ? availability.message : mode.description}
                  </span>

                  <span className="mode-image-card__telemetry" aria-hidden>
                    <span>
                      <small>ENTRY</small>
                      <strong>{costText}</strong>
                    </span>
                    <span>
                      <small>REWARD</small>
                      <strong>{rewardText}</strong>
                    </span>
                  </span>

                  <span className="mode-image-card__launch" aria-hidden>
                    {unavailable ? 'Temporarily Unavailable' : 'Launch Mode'}
                  </span>
                </span>
              </TriviaFrameCard>
            );
          })}
        </div>
      </div>

      {/* Quick Stakes Section - Landscape Banner */}
      <div className="quick-stakes-section">
        <button
          type="button"
          className="quick-stakes-banner"
          onClick={() => startMode(TRIVIA_QUICK_STAKES_MODE.id)}
          onPointerDown={() => prefetchMode(TRIVIA_QUICK_STAKES_MODE.id)}
          onFocus={() => prefetchMode(TRIVIA_QUICK_STAKES_MODE.id)}
          disabled={isRouting || !quickStakesAvailability.enabled}
          aria-label={
            quickStakesAvailability.enabled
              ? `${TRIVIA_QUICK_STAKES_MODE.name} - ${TRIVIA_QUICK_STAKES_MODE.description}. ${isVip ? 'Free for VIP' : `Entry ${getEntryCost(TRIVIA_QUICK_STAKES_MODE.id)} diamonds`}.`
              : quickStakesAvailability.message
          }
        >
          <img
            src={TRIVIA_QUICK_STAKES_MODE.image}
            alt=""
            aria-hidden
            className="quick-stakes-banner__img"
            width={TRIVIA_QUICK_STAKES_MODE.imageWidth}
            height={TRIVIA_QUICK_STAKES_MODE.imageHeight}
            loading="lazy"
            decoding="async"
          />
          <span className="quick-stakes-banner__entry" aria-hidden>
            {isVip ? 'VIP: free' : `${getEntryCost(TRIVIA_QUICK_STAKES_MODE.id)} Diamonds To Play`}
          </span>
        </button>
      </div>

      <style>{`
                .trivia-lobby,
                .trivia-lobby * {
                    box-sizing: border-box;
                }

                .trivia-lobby {
                    width: 100%;
                    max-width: 1220px;
                    margin: 0 auto;
                    padding: 0 18px 24px;
                    overflow: visible;
                    color: #e7edf5;
                    font-family: 'Roboto Condensed', 'Arial Narrow', system-ui, sans-serif;
                    font-variant-numeric: tabular-nums lining-nums;
                }

                .daily-trivia-banner {
                    position: relative;
                    width: 100%;
                    margin: 0 0 18px;
                }

                .daily-trivia-banner__image {
                    display: block;
                    width: 100%;
                    height: auto;
                }

                .daily-trivia-banner__button {
                    appearance: none;
                    position: absolute;
                    z-index: 2;
                    inset: 0;
                    width: 100%;
                    min-height: 44px;
                    margin: 0;
                    padding: 0;
                    border: 0;
                    background: transparent;
                    cursor: pointer;
                    touch-action: manipulation;
                    -webkit-tap-highlight-color: transparent;
                }

                .daily-trivia-banner__button:disabled {
                    cursor: default;
                }

                .daily-trivia-banner__button:focus-visible,
                .quick-stakes-banner:focus-visible,
                .mode-filter:focus-visible {
                    outline: 3px solid #8fd4ff;
                    outline-offset: -3px;
                }

                .daily-streak-chip {
                    position: absolute;
                    z-index: 3;
                    left: 4%;
                    bottom: 9%;
                    color: #fff0c9;
                    font-size: 12px;
                    font-weight: 800;
                    letter-spacing: 0.04em;
                    pointer-events: none;
                }

                .daily-trivia-banner__completed {
                    position: absolute;
                    z-index: 3;
                    inset: 0;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    padding: 12px;
                    background: rgb(0 0 0 / 72%);
                    pointer-events: none;
                }

                .daily-trivia-banner__completed span {
                    color: #8df0ad;
                    font-size: clamp(20px, 4vw, 32px);
                    font-weight: 800;
                    letter-spacing: 0.08em;
                    text-align: center;
                }

                .modes-section {
                    position: relative;
                    margin: 0;
                }

                .modes-toolbar {
                    display: flex;
                    align-items: end;
                    justify-content: space-between;
                    gap: 20px;
                    min-height: 72px;
                    padding: 10px 2px 12px;
                }

                .modes-toolbar__eyebrow {
                    display: block;
                    color: #6dbdff;
                    font-size: 12px;
                    font-weight: 700;
                    letter-spacing: 0.12em;
                }

                .modes-toolbar h2 {
                    margin: 5px 0 0;
                    color: #f4f7fb;
                    font-size: clamp(26px, 3vw, 36px);
                    font-weight: 800;
                    line-height: 1;
                    letter-spacing: 0.02em;
                }

                .modes-toolbar__count {
                    flex: 0 0 auto;
                    padding-bottom: 2px;
                    color: #b5c9d9;
                    font-size: 12px;
                    font-weight: 700;
                    letter-spacing: 0.05em;
                    white-space: nowrap;
                }

                .mode-filters {
                    position: relative;
                    display: flex;
                    align-items: stretch;
                    gap: 2px;
                    overflow-x: auto;
                    overscroll-behavior-x: contain;
                    scroll-padding-inline: 4px;
                    scroll-snap-type: x proximity;
                    -webkit-overflow-scrolling: touch;
                    scrollbar-width: none;
                }

                .mode-filters::-webkit-scrollbar {
                    display: none;
                }

                .mode-filter {
                    appearance: none;
                    flex: 0 0 auto;
                    min-width: max-content;
                    min-height: 44px;
                    margin: 0;
                    padding: 0 16px;
                    border: 0;
                    color: #9eabb8;
                    background: transparent;
                    font: inherit;
                    font-size: 12px;
                    font-weight: 800;
                    letter-spacing: 0.06em;
                    cursor: pointer;
                    scroll-snap-align: start;
                    text-decoration: none;
                    text-underline-offset: 7px;
                    touch-action: manipulation;
                }

                .mode-filter--active {
                    color: #8fd4ff;
                    text-decoration: underline;
                    text-decoration-thickness: 2px;
                }

                .mode-filter__count {
                    margin-left: 7px;
                    color: currentColor;
                    font-size: 12px;
                }

                .modes-grid {
                    display: grid;
                    grid-template-columns: repeat(3, minmax(0, 1fr));
                    align-items: start;
                    gap: 18px 14px;
                    padding: 16px 0 0;
                }

                .mode-image-card {
                    flex-direction: column;
                    min-width: 0;
                }

                .mode-image-card__body {
                    display: flex;
                    flex-direction: column;
                    min-width: 0;
                    min-height: 176px;
                }

                .mode-image-card__kicker {
                    display: block;
                    overflow: hidden;
                    color: #66bfff;
                    font-size: 12px;
                    font-weight: 800;
                    line-height: 1.25;
                    letter-spacing: 0.08em;
                    text-transform: capitalize;
                    text-overflow: ellipsis;
                    white-space: nowrap;
                }

                .mode-image-card__description {
                    display: block;
                    min-height: 42px;
                    margin-top: 7px;
                    color: #c0cad5;
                    font-family: Inter, system-ui, sans-serif;
                    font-size: 14px;
                    line-height: 1.45;
                }

                .mode-image-card__telemetry {
                    display: grid;
                    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
                    gap: 12px;
                    margin-top: 12px;
                }

                .mode-image-card__telemetry > span {
                    display: flex;
                    min-width: 0;
                    flex-direction: column;
                }

                .mode-image-card__telemetry small,
                .mode-image-card__telemetry strong {
                    display: block;
                    overflow: hidden;
                    font-size: 12px;
                    line-height: 1.3;
                    text-overflow: ellipsis;
                    white-space: nowrap;
                }

                .mode-image-card__telemetry small {
                    color: #8ca0b2;
                    font-weight: 700;
                }

                .mode-image-card__telemetry strong {
                    margin-top: 2px;
                    color: #e2e8ef;
                    font-weight: 800;
                }

                .mode-image-card__launch {
                    display: flex;
                    align-items: center;
                    min-height: 44px;
                    margin-top: auto;
                    color: #8fd4ff;
                    font-size: 12px;
                    font-weight: 800;
                    letter-spacing: 0.06em;
                }

                .mode-image-card--maintenance .mode-image-card__body {
                    opacity: 0.72;
                }

                .quick-stakes-section {
                    margin-top: 18px;
                }

                .quick-stakes-banner {
                    appearance: none;
                    position: relative;
                    display: block;
                    width: 100%;
                    min-height: 44px;
                    aspect-ratio: 1600 / 763;
                    margin: 0;
                    padding: 0;
                    overflow: hidden;
                    border: 0;
                    background: transparent;
                    cursor: pointer;
                    touch-action: manipulation;
                    -webkit-tap-highlight-color: transparent;
                }

                .quick-stakes-banner:disabled {
                    cursor: not-allowed;
                    opacity: 0.62;
                }

                .quick-stakes-banner__img {
                    display: block;
                    width: 100%;
                    height: 100%;
                    object-fit: contain;
                    pointer-events: none;
                }

                .quick-stakes-banner__entry {
                    position: absolute;
                    top: 8%;
                    right: 4%;
                    color: #dceeff;
                    font-size: 12px;
                    font-weight: 800;
                    letter-spacing: 0.04em;
                    pointer-events: none;
                }

                .gate-overlay {
                    position: fixed;
                    z-index: 9999;
                    inset: 0;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    box-sizing: border-box;
                    padding: max(env(safe-area-inset-top, 0px), 12px) 0 env(safe-area-inset-bottom, 0px);
                    background: rgb(0 0 0 / 78%);
                    backdrop-filter: blur(6px);
                }

                .diamond-modal {
                    position: relative;
                    width: min(90%, 440px);
                    margin: 0 auto;
                }

                .diamond-modal__bg {
                    display: block;
                    width: 100%;
                    height: auto;
                    user-select: none;
                    -webkit-user-drag: none;
                }

                .dm-hitbox {
                    appearance: none;
                    position: absolute;
                    min-width: 44px;
                    min-height: 44px;
                    margin: 0;
                    padding: 0;
                    border: 0;
                    outline: 0;
                    background: transparent;
                    cursor: pointer;
                    touch-action: manipulation;
                    -webkit-tap-highlight-color: transparent;
                }

                .dm-hitbox:focus-visible {
                    outline: 3px solid #8fd4ff;
                    outline-offset: 2px;
                }

                .dm-close {
                    top: 15.5%;
                    right: 20%;
                    width: 9%;
                    height: 8.5%;
                }

                .dm-vip {
                    top: 71%;
                    left: 20%;
                    width: 29%;
                    height: 8%;
                }

                .dm-accept {
                    top: 71%;
                    right: 18%;
                    width: 31%;
                    height: 8%;
                }

                .dm-balance {
                    position: absolute;
                    bottom: 11.5%;
                    left: 50%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    width: 45%;
                    height: 7%;
                    transform: translateX(-50%);
                    color: #4df8ff;
                    font-size: 16px;
                    font-weight: 800;
                    pointer-events: none;
                }

                .dm-dialog-copy {
                    position: absolute;
                    width: 1px;
                    height: 1px;
                    overflow: hidden;
                    clip: rect(0 0 0 0);
                    white-space: nowrap;
                }

                .deducting-overlay,
                .dm-spinner-overlay {
                    position: fixed;
                    z-index: 9998;
                    inset: 0;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    background: rgb(0 0 0 / 58%);
                    backdrop-filter: blur(3px);
                }

                .dm-spinner-overlay {
                    position: absolute;
                    z-index: 4;
                }

                .deducting-spinner {
                    width: 52px;
                    height: 5px;
                    background: #4dbdff;
                    animation: routePulse 800ms ease-in-out infinite alternate;
                }

                @keyframes routePulse {
                    from { opacity: 0.35; transform: scaleX(0.55); }
                    to { opacity: 1; transform: scaleX(1); }
                }

                .route-error {
                    margin: 12px 0 0;
                    color: #ffd2cf;
                    font-size: 14px;
                    font-weight: 700;
                    line-height: 1.4;
                    text-align: center;
                }

                @media (max-width: 899px) and (min-width: 701px) {
                    .modes-grid {
                        grid-template-columns: repeat(2, minmax(0, 1fr));
                    }
                }

                @media (max-width: 700px) {
                    .trivia-lobby {
                        padding: 0 8px 18px;
                    }

                    .daily-trivia-banner {
                        margin-bottom: 12px;
                    }

                    .modes-toolbar {
                        align-items: start;
                        min-height: 64px;
                        padding: 8px 2px 10px;
                    }

                    .modes-toolbar h2 {
                        font-size: 24px;
                    }

                    .modes-toolbar__count {
                        max-width: 130px;
                        white-space: normal;
                        text-align: right;
                    }

                    .mode-filters {
                        position: sticky;
                        z-index: 8;
                        top: calc(59px + env(safe-area-inset-top, 0px));
                        margin-inline: -8px;
                        padding-inline: 8px;
                        background: #020609;
                    }

                    .mode-filter {
                        padding-inline: 14px;
                    }

                    .modes-grid {
                        grid-template-columns: 1fr;
                        gap: 18px;
                        padding-top: 12px;
                    }

                    .mode-image-card {
                        display: flex;
                        flex-direction: column;
                    }

                    .mode-image-card__body {
                        min-height: 164px;
                    }

                    .mode-image-card__description {
                        min-height: 0;
                        font-size: 14px;
                    }

                    .quick-stakes-section {
                        margin-top: 14px;
                    }
                }

                @media (max-width: 390px) {
                    .trivia-lobby {
                        padding-inline: 6px;
                    }

                    .modes-toolbar__eyebrow,
                    .modes-toolbar__count {
                        font-size: 12px;
                    }

                    .mode-image-card__body {
                        min-height: 158px;
                    }
                }

                @media (prefers-contrast: more) {
                    .modes-toolbar__eyebrow,
                    .modes-toolbar__count,
                    .mode-image-card__kicker,
                    .mode-image-card__description,
                    .mode-image-card__telemetry small,
                    .mode-image-card__telemetry strong,
                    .mode-image-card__launch,
                    .mode-filter {
                        color: #fff;
                    }
                }

                @media (forced-colors: active) {
                    .diamond-modal__bg {
                        display: none;
                    }

                    .diamond-modal {
                        width: min(92vw, 440px);
                        padding: 24px;
                        border: 2px solid ButtonText;
                        color: CanvasText;
                        background: Canvas;
                    }

                    .dm-dialog-copy {
                        position: static;
                        width: auto;
                        height: auto;
                        overflow: visible;
                        clip: auto;
                        white-space: normal;
                    }

                    .dm-hitbox {
                        position: static;
                        width: 100%;
                        min-height: 44px;
                        margin-top: 12px;
                        border: 1px solid ButtonText;
                        color: ButtonText;
                    }

                    .dm-close::after { content: 'Close'; }
                    .dm-vip::after { content: 'Upgrade To VIP'; }
                    .dm-accept::after { content: 'Accept And Play'; }

                    .dm-balance {
                        position: static;
                        width: auto;
                        height: auto;
                        margin-top: 12px;
                        transform: none;
                    }
                }

                @media (prefers-reduced-motion: reduce) {
                    .deducting-spinner {
                        animation: none;
                    }

                    .mode-filter {
                        scroll-behavior: auto;
                    }
                }
            `}</style>

      {/* ═══════ DIAMOND CHARGE POPUP (first-time only) ═══════ */}
      {showChargePopup && (
        <div
          className="gate-overlay"
          onClick={() => {
            setShowChargePopup(false);
            setPendingMode(null);
          }}
        >
          <div
            ref={modalRef}
            className="diamond-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="trivia-entry-title"
            aria-describedby="trivia-entry-description"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="dm-dialog-copy">
              <h2 id="trivia-entry-title">Diamond Entry</h2>
              <p id="trivia-entry-description">
                This Game Costs {pendingCost} Diamonds. Your Current Balance Is {userDiamonds}{' '}
                Diamonds. The Game Page Verifies And Charges The Entry When It Starts.
              </p>
            </div>
            <img
              src="/images/trivia/diamond-entry-modal.webp?v=v6"
              alt=""
              aria-hidden="true"
              className="diamond-modal__bg"
              width={946}
              height={1024}
              decoding="async"
            />

            {/* Close Button hit area */}
            <button
              ref={modalCloseRef}
              type="button"
              className="dm-hitbox dm-close"
              onClick={() => {
                navigator.vibrate?.(50);
                setShowChargePopup(false);
                setPendingMode(null);
              }}
              aria-label="Close"
            />

            {/* Upgrade to VIP hit area */}
            <button
              type="button"
              className="dm-hitbox dm-vip"
              onClick={() => {
                navigator.vibrate?.(50);
                void router.push('/hub/vip-membership');
              }}
              aria-label="Upgrade to VIP"
            />

            {/* Accept & Play hit area. This no longer charges:
                                it acknowledges the price and routes to the mode,
                                which performs the real server-side deduction. */}
            <button
              type="button"
              className="dm-hitbox dm-accept"
              onClick={() => {
                navigator.vibrate?.(50);
                handleChargeAccept();
              }}
              disabled={isRouting}
              aria-label={`Accept the ${pendingCost} diamond entry and play`}
            />

            {/* Dynamic Diamond Balance */}
            <div className="dm-balance">{userDiamonds} Diamonds</div>

            {isRouting && (
              <div
                className="dm-spinner-overlay"
                role="status"
                aria-live="polite"
                aria-label="Opening game"
              >
                <div className="deducting-spinner" />
              </div>
            )}
          </div>
        </div>
      )}

      {routeError && (
        <p className="route-error" role="alert">
          {routeError}
        </p>
      )}

      {/* Routing spinner overlay */}
      {isRouting && !showChargePopup && (
        <div
          className="deducting-overlay"
          role="status"
          aria-live="polite"
          aria-label="Opening game"
        >
          <div className="deducting-spinner" />
        </div>
      )}
    </div>
  );
}
