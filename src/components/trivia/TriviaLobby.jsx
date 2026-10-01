/**
 * TRIVIA LOBBY - Mode discovery and entry routing.
 * Painted card chassis come from the shared Trivia console primitives.
 */

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/router';
import { acquireScrollLock } from '../../lib/scrollLock';
import TriviaFrameCard from './console/TriviaFrameCard';
import TriviaConsole from './console/TriviaConsole';
import ResponsiveModeArt from './console/ResponsiveModeArt';
import { TRIVIA_INTRO_ART_LOBBY } from '../../config/triviaIntroArt.mjs';
import { TRIVIA_THUMBNAIL_PREVIEWS } from '../../config/triviaThumbnailPreviews.mjs';
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

/**
 * Title Case for strings that reach the screen from data (the copy gates only
 * read literals). Raises the first letter of every word and never lowers the
 * rest, so acronyms and names survive ('8 PM', 'MTT', '1v1', 'GTO'), and
 * writes clock times as '2 AM'. The shared toTitleCase lowers everything
 * after the first letter ('PM' -> 'Pm', '2am' -> '2Am'), so it is not used
 * for these strings.
 */
function printTitle(text) {
  return String(text ?? '')
    .replace(/(\d)\s?(am|pm)\b/gi, (match, digit, meridiem) => `${digit} ${meridiem.toUpperCase()}`)
    .replace(/(^|[\s_\-/(])(\p{Ll})/gu, (match, lead, letter) => lead + letter.toUpperCase());
}

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
    const focusTimer = window.setTimeout(
      () => modalRef.current?.querySelector('[data-entry-action="close"]')?.focus(),
      0
    );

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

  const pendingModeDefinition = pendingMode
    ? MODE_CARDS.find((mode) => mode.id === pendingMode) || null
    : null;
  const pendingShortfall = pendingCost > 0 && Number(userDiamonds) < pendingCost;
  const closeChargePopup = () => {
    setShowChargePopup(false);
    setPendingMode(null);
  };

  return (
    <div className="trivia-lobby">
      {/* Approved Daily Trivia artwork remains the full visual authority:
          native ratio, no crop, nothing printed or framed over it. */}
      <div className="daily-trivia-banner" data-completed={dailyCompleted ? 'true' : 'false'}>
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
                ? 'Start Daily Trivia - Free, Once Per Day'
                : dailyAvailability.message
          }
        />
      </div>
      {dailyCompleted ? (
        <p className="daily-trivia-status tc-ink--green">
          Completed Today
          {currentStreak > 0 ? ` / ${currentStreak} Day Streak` : ''}
        </p>
      ) : !dailyAvailability.enabled ? (
        <p className="daily-trivia-status tc-ink--gold">{dailyAvailability.message}</p>
      ) : currentStreak > 0 ? (
        <p className="daily-trivia-status tc-ink--gold" title={`${currentStreak} Day Streak`}>
          Day {currentStreak} Streak / Keep It Alive
        </p>
      ) : null}

      {/* Mode Cards Section */}
      <section className="modes-section" aria-labelledby="trivia-modes-title">
        {/* The lobby's own destination art (intro-v1): the Game Select room,
            a text-free picture that dissolves into the black canvas. The
            Daily header above and the Quick Stakes footer keep their art. */}
        <ResponsiveModeArt
          art={TRIVIA_INTRO_ART_LOBBY}
          className="modes-intro-art"
          sizes="(min-width: 1000px) 968px, 100vw"
        />
        <div className="modes-toolbar">
          <div className="modes-toolbar__heading">
            <span className="modes-toolbar__eyebrow tc-label">Game Select</span>
            <h2 id="trivia-modes-title" className="modes-toolbar__title">Choose Your Game</h2>
          </div>
          <span
            className="modes-toolbar__count"
            role="status"
            aria-live="polite"
            aria-atomic="true"
          >
            <span className="tc-ink--green">{liveModeCount} Live</span>
            {maintenanceModeCount > 0 ? (
              <span className="tc-ink--gold">{maintenanceModeCount} Maintenance</span>
            ) : null}
          </span>
        </div>

        <div
          ref={filterRailRef}
          className="mode-filters"
          role="toolbar"
          aria-label="Filter Trivia Modes"
        >
          {MODE_FILTERS.map((filter, filterIndex) => (
            <button
              key={filter.id}
              ref={(node) => {
                filterButtonRefs.current[filterIndex] = node;
              }}
              type="button"
              className={`tc-word mode-filter${activeFilter === filter.id ? ' mode-filter--active' : ''}`}
              onClick={() => selectFilter(filter.id, filterIndex)}
              onKeyDown={(event) => handleFilterKeyDown(event, filterIndex)}
              tabIndex={activeFilter === filter.id ? 0 : -1}
              aria-pressed={activeFilter === filter.id}
              aria-controls="trivia-mode-grid"
              aria-label={`${printTitle(filter.label)}, ${MODE_FILTER_COUNTS[filter.id]} Modes`}
            >
              <span>{printTitle(filter.label)}</span>
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
            const modeName = mode.name;
            const modeDescription = printTitle(mode.description);
            const costText = unavailable
              ? 'Unavailable'
              : isVip
                ? 'VIP Free'
                : variableCost
                  ? 'Variable'
                  : cost > 0
                    ? `${cost} Diamonds`
                    : 'Free';
            const rewardText =
              typeof mode.diamondReward === 'number'
                ? `+${mode.diamondReward}${mode.perfectBonus ? ` / +${mode.perfectBonus} Perfect` : ''}`
                : mode.diamondReward
                  ? printTitle(String(mode.diamondReward))
                  : '-';

            return (
              <TriviaFrameCard
                key={mode.id}
                className={`mode-image-card${unavailable ? ' mode-image-card--maintenance' : ''}`}
                family={getModeFrameFamily(mode)}
                image={mode.image}
                imagePreview={TRIVIA_THUMBNAIL_PREVIEWS[mode.id]}
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
                    ? `${modeName}. ${availability.message}`
                    : `${modeName}. ${modeDescription}. Entry ${costText}. Reward ${rewardText}${typeof mode.diamondReward === 'number' ? ' Diamonds' : ''}.`
                }
              >
                <span className="mode-image-card__body">
                  <span className="mode-image-card__kicker">
                    <span>{mode.code}</span>
                    <span aria-hidden> / </span>
                    <span>{printTitle(mode.category)}</span>
                    <span aria-hidden> / </span>
                    <span className={unavailable ? 'tc-ink--gold' : 'tc-ink--green'}>
                      {printTitle(availability.label)}
                    </span>
                  </span>
                  <span className="mode-image-card__description">
                    {unavailable ? availability.message : modeDescription}
                  </span>

                  <span className="mode-image-card__telemetry" aria-hidden>
                    <span className="mode-image-card__row">
                      <span className="mode-image-card__label">Entry</span>
                      <span className="mode-image-card__value">{costText}</span>
                    </span>
                    <span className="mode-image-card__row">
                      <span className="mode-image-card__label">Reward</span>
                      <span className="mode-image-card__value">{rewardText}</span>
                    </span>
                  </span>

                  <span
                    className={`mode-image-card__launch ${unavailable ? 'tc-ink--gold' : 'tc-ink--white'}`}
                    aria-hidden
                  >
                    {unavailable ? 'Maintenance' : 'Launch Mode'}
                  </span>
                </span>
              </TriviaFrameCard>
            );
          })}
        </div>
      </section>

      {/* Quick Stakes Section - approved landscape art at native ratio,
          nothing printed over it; the entry line prints beneath. */}
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
              ? `${TRIVIA_QUICK_STAKES_MODE.name} - ${TRIVIA_QUICK_STAKES_MODE.description}. ${isVip ? 'Free For VIP' : `Entry ${getEntryCost(TRIVIA_QUICK_STAKES_MODE.id)} Diamonds`}.`
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
        </button>
        {/* The approved art already prints the standard entry; a line is
            printed beneath it only when that entry does not apply. */}
        {!quickStakesAvailability.enabled ? (
          <p className="quick-stakes-entry tc-ink--gold" aria-hidden>
            {quickStakesAvailability.message}
          </p>
        ) : isVip ? (
          <p className="quick-stakes-entry tc-ink--gold" aria-hidden>
            VIP Entry Free
          </p>
        ) : null}
      </div>

      {routeError && (
        <p className="route-error tc-ink--red" role="alert">
          {printTitle(routeError)}
        </p>
      )}

      <style dangerouslySetInnerHTML={{ __html: `
                .trivia-lobby,
                .trivia-lobby * {
                    box-sizing: border-box;
                }

                .trivia-lobby {
                    width: 100%;
                    max-width: 1000px;
                    margin: 0 auto;
                    padding: 0 16px 24px;
                    overflow: visible;
                    color: var(--tc-ink-silver);
                    background: var(--tc-black);
                    font-family: 'Roboto Condensed', Inter, system-ui, sans-serif;
                    font-variant-numeric: tabular-nums lining-nums;
                }

                .daily-trivia-banner {
                    position: relative;
                    width: 100%;
                    margin: 0;
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
                .quick-stakes-banner:focus-visible {
                    outline: 3px solid var(--tc-ink-blue);
                    outline-offset: -3px;
                }

                .daily-trivia-status,
                .quick-stakes-entry {
                    margin: 10px 0 0;
                    font-size: 14px;
                    font-weight: 800;
                    letter-spacing: 0.1em;
                    line-height: 1.35;
                    text-align: center;
                    text-transform: uppercase;
                }


                .modes-section {
                    position: relative;
                    margin: 18px 0 0;
                }

                .modes-intro-art {
                    margin: 0 0 6px;
                }

                .modes-toolbar {
                    display: flex;
                    align-items: end;
                    justify-content: space-between;
                    gap: 16px;
                    padding: 10px 0 8px;
                    border-bottom: var(--tc-rule);
                    box-shadow: var(--tc-rule-lit);
                }

                .modes-toolbar__heading {
                    min-width: 0;
                }

                .modes-toolbar__eyebrow {
                    display: block;
                    font-size: 13px;
                }

                .modes-toolbar__title {
                    margin: 6px 0 0;
                    color: var(--tc-ink-silver);
                    font-size: clamp(26px, 3.6vw, 36px);
                    font-weight: 800;
                    line-height: 1;
                    letter-spacing: 0.04em;
                    text-transform: uppercase;
                    text-shadow: 0 -1px 0 rgb(255 255 255 / 55%), 0 1px 0 var(--tc-bevel), 0 2px 0 var(--tc-chassis-black), 0 3px 4px rgb(0 0 0 / 90%);
                }

                .modes-toolbar__count {
                    display: flex;
                    flex-wrap: wrap;
                    justify-content: flex-end;
                    gap: 2px 14px;
                    flex: 0 0 auto;
                    padding-bottom: 2px;
                    font-size: 13px;
                    font-weight: 800;
                    letter-spacing: 0.1em;
                    text-transform: uppercase;
                    white-space: nowrap;
                }

                .mode-filters {
                    position: relative;
                    display: flex;
                    align-items: stretch;
                    justify-content: center;
                    gap: 0;
                    padding: 4px 0;
                    overflow-x: auto;
                    overscroll-behavior-x: contain;
                    scroll-padding-inline: 4px;
                    scroll-snap-type: x proximity;
                    -webkit-overflow-scrolling: touch;
                    scrollbar-width: none;
                    background: var(--tc-black);
                }

                .mode-filters::-webkit-scrollbar {
                    display: none;
                }

                .mode-filter.tc-word {
                    flex: 0 0 auto;
                    min-width: max-content;
                    min-height: 44px;
                    padding: 0 14px;
                    color: var(--tc-ink-muted);
                    font-size: 13px;
                    text-shadow: 0 1px 2px rgb(0 0 0 / 80%);
                    scroll-snap-align: start;
                    touch-action: manipulation;
                }

                .mode-filter.tc-word[aria-pressed='true'] {
                    color: var(--tc-ink-blue);
                    text-underline-offset: 7px;
                    text-shadow: 0 0 6px rgb(69 173 255 / 70%), 0 1px 2px rgb(0 0 0 / 85%);
                }

                .mode-filter__count {
                    margin-left: 7px;
                    color: currentColor;
                }

                .modes-grid {
                    display: grid;
                    grid-template-columns: repeat(3, minmax(0, 1fr));
                    align-items: start;
                    gap: 22px 14px;
                    padding: 14px 0 0;
                }

                .mode-image-card {
                    flex-direction: column;
                    min-width: 0;
                }

                .mode-image-card__body {
                    display: flex;
                    flex-direction: column;
                    min-width: 0;
                }

                .mode-image-card__kicker {
                    display: block;
                    color: var(--tc-ink-blue);
                    font-size: 12px;
                    font-weight: 800;
                    line-height: 1.3;
                    letter-spacing: 0.12em;
                    text-align: center;
                    text-transform: uppercase;
                }

                .mode-image-card__description {
                    display: block;
                    min-height: 42px;
                    margin-top: 8px;
                    color: var(--tc-ink-silver);
                    font-family: Inter, system-ui, sans-serif;
                    font-size: 14px;
                    line-height: 1.45;
                    text-align: center;
                }

                .mode-image-card__telemetry {
                    display: grid;
                    margin-top: 10px;
                }

                .mode-image-card__row {
                    display: flex;
                    align-items: baseline;
                    justify-content: space-between;
                    gap: 12px;
                    min-width: 0;
                    padding: 7px 0;
                    border-top: var(--tc-rule);
                    box-shadow: var(--tc-rule-lit);
                }

                .mode-image-card__label {
                    flex: 0 0 auto;
                    color: var(--tc-ink-blue);
                    font-size: 12px;
                    font-weight: 700;
                    letter-spacing: 0.14em;
                    text-transform: uppercase;
                }

                .mode-image-card__value {
                    min-width: 0;
                    color: var(--tc-ink-silver);
                    font-size: 14px;
                    font-weight: 800;
                    letter-spacing: 0.04em;
                    text-align: right;
                    overflow-wrap: anywhere;
                }

                .mode-image-card__launch {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    min-height: 44px;
                    border-top: var(--tc-rule);
                    box-shadow: var(--tc-rule-lit);
                    font-size: 14px;
                    font-weight: 800;
                    letter-spacing: 0.14em;
                    text-transform: uppercase;
                }

                .mode-image-card--maintenance .mode-image-card__description {
                    color: var(--tc-ink-muted);
                }

                .quick-stakes-section {
                    margin-top: 22px;
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
                }

                .quick-stakes-banner__img {
                    display: block;
                    width: 100%;
                    height: 100%;
                    object-fit: contain;
                    pointer-events: none;
                }

                .gate-overlay {
                    position: fixed;
                    z-index: 12000;
                    inset: 0;
                    display: grid;
                    place-items: center;
                    padding: max(12px, env(safe-area-inset-top, 0px)) 12px max(12px, env(safe-area-inset-bottom, 0px));
                    overflow-y: auto;
                    background: rgb(0 0 0 / 94%);
                }

                /* The console's glass is transparent art; black behind it keeps
                   the page from showing through the well (one tone inside and
                   outside the frame). */
                .diamond-modal {
                    width: min(100%, 620px);
                    margin: 0 auto;
                    outline: none;
                    background: var(--tc-black);
                }

                .dm-rows {
                    width: 100%;
                }

                .dm-shortfall {
                    margin: 0;
                    font-size: clamp(14px, 3.4cqw, 18px);
                    font-weight: 800;
                    letter-spacing: 0.06em;
                    text-align: center;
                    text-transform: uppercase;
                }

                .dm-actions {
                    display: flex;
                    justify-content: center;
                }

                .dm-hitbox {
                    min-width: 44px;
                    min-height: 44px;
                    touch-action: manipulation;
                    -webkit-tap-highlight-color: transparent;
                }

                .dm-hitbox:focus-visible {
                    outline: 3px solid var(--tc-ink-blue);
                    outline-offset: 2px;
                }

                .dm-opening,
                .route-opening {
                    margin: 0;
                    text-align: center;
                    animation: routePulse 800ms ease-in-out infinite alternate;
                }

                .deducting-overlay {
                    position: fixed;
                    z-index: 9998;
                    inset: 0;
                    display: grid;
                    place-items: center;
                    background: rgb(0 0 0 / 72%);
                }

                .route-opening {
                    font-size: 16px;
                }

                @keyframes routePulse {
                    from { opacity: 0.45; }
                    to { opacity: 1; }
                }

                .route-error {
                    margin: 14px 0 0;
                    font-size: 15px;
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

                    .modes-section {
                        margin-top: 14px;
                    }

                    .modes-toolbar {
                        align-items: end;
                        padding: 8px 2px 8px;
                    }

                    .modes-toolbar__title {
                        font-size: 24px;
                    }

                    .modes-toolbar__count {
                        flex-direction: column;
                        align-items: flex-end;
                        text-align: right;
                    }

                    .mode-filters {
                        position: sticky;
                        z-index: 8;
                        top: calc(59px + env(safe-area-inset-top, 0px));
                        justify-content: flex-start;
                        margin-inline: -8px;
                        padding-inline: 8px;
                        background: var(--tc-black);
                    }

                    .mode-filter.tc-word {
                        padding-inline: 12px;
                    }

                    .modes-grid {
                        grid-template-columns: 1fr;
                        gap: 22px;
                        padding-top: 12px;
                    }

                    .mode-image-card {
                        display: flex;
                        flex-direction: column;
                    }

                    .mode-image-card__description {
                        min-height: 0;
                    }

                    .quick-stakes-section {
                        margin-top: 18px;
                    }
                }

                /* In forced colours the two approved banners keep their art;
                   their full-card buttons get a system-colour edge. */
                @media (forced-colors: active) {
                    .daily-trivia-banner__button,
                    .quick-stakes-banner {
                        outline: 1px solid ButtonText;
                        outline-offset: -1px;
                    }
                }

                /* At 400% zoom and on short landscape phones a rail pinned
                   under the fixed header would cover the cards it filters. */
                @media (max-height: 479px) {
                    .mode-filters {
                        position: static;
                    }
                }

                @media (max-width: 390px) {
                    .trivia-lobby {
                        padding-inline: 6px;
                    }

                    .modes-toolbar__count {
                        font-size: 12px;
                    }
                }

                @media (prefers-contrast: more) {
                    .modes-toolbar__count,
                    .mode-image-card__kicker,
                    .mode-image-card__description,
                    .mode-image-card__label,
                    .mode-image-card__value,
                    .mode-filter.tc-word {
                        color: var(--tc-ink-white);
                    }
                }

                @media (forced-colors: active) {
                    .mode-filter.tc-word[aria-pressed='true'],
                    .dm-hitbox:focus-visible {
                        outline: 2px solid Highlight;
                    }

                    .mode-image-card__row,
                    .mode-image-card__launch {
                        border-top-color: CanvasText;
                    }
                }

                @media (prefers-reduced-motion: reduce) {
                    .dm-opening,
                    .route-opening {
                        animation: none;
                    }

                    .mode-filters {
                        scroll-behavior: auto;
                    }
                }
            ` }} />

      {/* Diamond entry disclosure (first time only). It moves no diamonds:
          it states the price the destination page will verify and charge,
          on the painted console master, and Accept routes there. */}
      {showChargePopup && (
        <div className="gate-overlay" onClick={closeChargePopup}>
          <div
            ref={modalRef}
            className="diamond-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="trivia-entry-title"
            aria-describedby="trivia-entry-description"
            tabIndex={-1}
            onClick={(e) => e.stopPropagation()}
          >
            <TriviaConsole
              eyebrow={pendingModeDefinition ? pendingModeDefinition.name : 'Trivia Entry'}
              title="Diamond Entry"
              titleId="trivia-entry-title"
              pill="Entry Fee"
              pillInk="gold"
              secondaryAction={{
                label: 'Close',
                className: 'dm-hitbox dm-close',
                'data-entry-action': 'close',
                'aria-label': 'Close',
                onClick: () => {
                  navigator.vibrate?.(50);
                  closeChargePopup();
                },
              }}
              primaryAction={{
                // Short enough to fit the painted plate face at phone width;
                // the accessible name carries the full statement.
                label: 'Accept',
                className: 'dm-hitbox dm-accept',
                disabled: isRouting,
                'aria-label': `Accept The ${pendingCost} Diamond Entry And Play`,
                onClick: () => {
                  navigator.vibrate?.(50);
                  handleChargeAccept();
                },
              }}
            >
              <p id="trivia-entry-description" className="trivia-console-copy">
                This Game Costs {pendingCost} Diamonds. The Game Page Verifies And Charges The
                Entry When It Starts, So Nothing Is Taken Here.
              </p>
              <ul className="tc-rows dm-rows">
                <li className="tc-row">
                  <span className="tc-row__label">Entry</span>
                  <span className="tc-row__value tc-ink--gold">{pendingCost} Diamonds</span>
                </li>
                <li className="tc-row">
                  <span className="tc-row__label">Your Balance</span>
                  <span className={`tc-row__value ${pendingShortfall ? 'tc-ink--red' : 'tc-ink--silver'}`}>
                    {Number(userDiamonds || 0).toLocaleString('en-US')} Diamonds
                  </span>
                </li>
              </ul>
              {pendingShortfall && (
                <p className="dm-shortfall tc-ink--red">
                  Not Enough Diamonds For This Entry
                </p>
              )}
              <div className="dm-actions">
                <button
                  type="button"
                  className="tc-word dm-hitbox dm-vip"
                  onClick={() => {
                    navigator.vibrate?.(50);
                    void router.push('/hub/vip-membership');
                  }}
                  aria-label="Upgrade To VIP"
                >
                  Upgrade To VIP
                </button>
              </div>
              {isRouting && (
                <p className="dm-opening tc-label" role="status" aria-live="polite">
                  Opening Game
                </p>
              )}
            </TriviaConsole>
          </div>
        </div>
      )}

      {/* Routing status while the destination page loads. */}
      {isRouting && !showChargePopup && (
        <div
          className="deducting-overlay"
          role="status"
          aria-live="polite"
          aria-label="Opening Game"
        >
          <span className="route-opening tc-label">Opening Game</span>
        </div>
      )}
    </div>
  );
}
