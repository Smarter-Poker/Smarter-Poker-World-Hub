/**
 * TRIVIA LOBBY - Mode discovery and entry routing on canonical #SMARTERDESIGN.
 * Zero broken raster mode-card images, zero double-modal friction, visible
 * #SMARTERDESIGN masthead, active solo Continue Game CTA, accurate entry pricing.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { authedFetch } from '../../lib/authUtils';
import CompetitiveLobbyBriefing from './competitive/CompetitiveLobbyBriefing';
import { getModeConfig } from '../../lib/trivia/triviaEngine';
import { readSoloRunRecovery } from '../../lib/trivia/soloRunRecovery.mjs';
import {
  TRIVIA_FEATURED_MODE,
  TRIVIA_MIDDLE_MODES as MODE_CARDS,
  TRIVIA_MODE_BY_ID,
  TRIVIA_MODE_FILTER_COUNTS as MODE_FILTER_COUNTS,
  TRIVIA_MODE_FILTERS as MODE_FILTERS,
  TRIVIA_QUICK_STAKES_MODE,
  getTriviaModeRoute as getModeRoute,
  resolveTriviaModeAvailability,
} from '../../config/triviaModeRegistry.mjs';

function printTitle(text) {
  return String(text ?? '')
    .replace(/(\d)\s?(am|pm)\b/gi, (match, digit, meridiem) => `${digit} ${meridiem.toUpperCase()}`)
    .replace(/(^|[\s_\-/(])(\p{Ll})/gu, (match, lead, letter) => lead + letter.toUpperCase());
}

/** What the user will actually be charged when they enter this mode. */
function getEntryCost(modeId) {
  const configured = getModeConfig(modeId)?.diamondCost;
  return Number.isFinite(configured) && configured > 0 ? configured : 0;
}

/** Modes whose entry price is a stake / tournament fee rather than fixed. */
const VARIABLE_COST_MODES = new Set(['pvp', 'tournaments']);

/** Solo modes scanned for active, non-expired recoverable runs. */
const SOLO_RECOVERY_MODES = Object.freeze([
  'daily',
  'arcade',
  'mtt',
  'cash',
  'icm',
  'gto',
  'mixed',
  'endless',
  'survival',
  'time-attack',
  'history',
  'rules',
  'pro',
]);

function findActiveSoloRecovery(accountKey, now = Date.now()) {
  if (typeof window === 'undefined' || !accountKey) return null;
  let best = null;
  for (const modeId of SOLO_RECOVERY_MODES) {
    const record = readSoloRunRecovery(window.localStorage, modeId, accountKey, now);
    if (!record) continue;
    // Strictly respect exact expiresAt so expired sessions are never offered.
    if (record.expiresAt && Date.parse(record.expiresAt) <= now) continue;
    if (!best || record.createdAt > best.createdAt) {
      best = record;
    }
  }
  return best;
}

function formatRecoveryProgress(record) {
  if (!record) return '';
  if (Number.isInteger(record.answeredCount) && Number.isInteger(record.totalQuestions) && record.totalQuestions > 0) {
    const nextQ = Math.min(record.answeredCount + 1, record.totalQuestions);
    return `Question ${nextQ} Of ${record.totalQuestions}`;
  }
  if (record.mode === 'survival' && Number.isInteger(record.survivalLevel)) {
    return `Level ${record.survivalLevel} In Progress`;
  }
  if (record.phase === 'settling') return 'Settlement Pending';
  return 'Active Session Ready To Resume';
}

const PVP_RATINGS_CACHE_TTL_MS = 15_000;
const pvpRatingsFetchCache = new Map();

function readDeduplicatedPvpRatings(accountKey) {
  const cacheKey = String(accountKey || '');
  const now = Date.now();
  const cached = pvpRatingsFetchCache.get(cacheKey);
  if (cached && cached.promise) return cached.promise;
  if (cached && cached.receivedAt && (now - cached.receivedAt) < PVP_RATINGS_CACHE_TTL_MS) {
    return Promise.resolve(cached.badge);
  }
  const promise = authedFetch('/api/trivia/pvp/ratings?limit=1', {
    method: 'GET',
    cache: 'no-store',
  })
    .then(async (response) => {
      if (!response.ok) return null;
      const payload = await response.json().catch(() => null);
      if (payload?.success !== true) return null;
      const viewer = payload?.viewer;
      const badge = viewer && Number.isFinite(Number(viewer.elo))
        ? {
            elo: Math.round(Number(viewer.elo)),
            tier: typeof viewer.tier === 'string' && viewer.tier ? viewer.tier : 'Bronze',
            unrated: viewer.unrated === true,
          }
        : null;
      pvpRatingsFetchCache.set(cacheKey, { badge, receivedAt: Date.now(), promise: null });
      return badge;
    })
    .catch(() => {
      pvpRatingsFetchCache.delete(cacheKey);
      return null;
    });
  pvpRatingsFetchCache.set(cacheKey, { badge: null, receivedAt: 0, promise });
  return promise;
}

export default function TriviaLobby({
  userDiamonds = 0,
  isVip = false,
  arcadeTicketCount = 0,
  dailyCompleted = false,
  currentStreak = 0,
  onDiamondsChange,
  modeAvailability,
  authState = 'loading',
  accountKey = null,
  playerDataLoading = false,
  playerDataStatus = { profile: 'loading', daily: 'loading', streak: 'loading' },
  onRetryPlayerData,
}) {
  const router = useRouter();
  const [activeFilter, setActiveFilter] = useState('all');
  const filterRailRef = useRef(null);
  const filterButtonRefs = useRef([]);
  const routingRef = useRef(false);
  const prefetchedRoutesRef = useRef(new Set());
  const [isRouting, setIsRouting] = useState(false);
  const [routeError, setRouteError] = useState('');
  const [pvpEloBadge, setPvpEloBadge] = useState(null);
  const [activeSoloRecovery, setActiveSoloRecovery] = useState(null);

  useEffect(() => {
    try {
      sessionStorage.removeItem('trivia_paid');
      sessionStorage.removeItem('trivia_mode');
    } catch (e) {
      console.warn('[App] Handled exception:', e?.message || e);
    }
  }, []);

  // Scan local solo run recovery pointers for the current account and expire them on time.
  const refreshSoloRecovery = useCallback(() => {
    if (authState !== 'authenticated' || !accountKey) {
      setActiveSoloRecovery(null);
      return;
    }
    setActiveSoloRecovery(findActiveSoloRecovery(accountKey, Date.now()));
  }, [accountKey, authState]);

  useEffect(() => {
    refreshSoloRecovery();
    if (typeof window === 'undefined') return undefined;
    const onVisibility = () => {
      if (document.visibilityState === 'visible') refreshSoloRecovery();
    };
    window.addEventListener('storage', refreshSoloRecovery);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('storage', refreshSoloRecovery);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [refreshSoloRecovery]);

  useEffect(() => {
    if (!activeSoloRecovery?.expiresAt) return undefined;
    const msUntilExpiry = Date.parse(activeSoloRecovery.expiresAt) - Date.now();
    if (msUntilExpiry <= 0) {
      setActiveSoloRecovery(null);
      return undefined;
    }
    const timer = window.setTimeout(() => {
      refreshSoloRecovery();
    }, Math.min(msUntilExpiry + 50, 2_147_483_647));
    return () => window.clearTimeout(timer);
  }, [activeSoloRecovery?.expiresAt, refreshSoloRecovery]);

  useEffect(() => {
    setPvpEloBadge(null);
    if (authState !== 'authenticated' || !accountKey) return undefined;
    const controller = new AbortController();
    let active = true;
    void readDeduplicatedPvpRatings(accountKey).then((badge) => {
      if (active && !controller.signal.aborted && badge) {
        setPvpEloBadge(badge);
      }
    });
    return () => {
      active = false;
      controller.abort();
    };
  }, [accountKey, authState]);

  const filteredModes =
    activeFilter === 'all'
      ? MODE_CARDS
      : MODE_CARDS.filter((mode) => mode.category === activeFilter);
  const availabilityFor = (modeId) => resolveTriviaModeAvailability(modeId, modeAvailability);
  const liveModeCount = filteredModes.filter((mode) => availabilityFor(mode.id).enabled).length;
  const maintenanceModeCount = filteredModes.length - liveModeCount;
  const dailyAvailability = availabilityFor(TRIVIA_FEATURED_MODE.id);
  const quickStakesAvailability = availabilityFor(TRIVIA_QUICK_STAKES_MODE.id);
  const failedPlayerReads = Object.entries(playerDataStatus)
    .filter(([, state]) => state === 'error')
    .map(([name]) => name);
  const playerDataPartial = failedPlayerReads.length > 0;
  const allPlayerReadsFailed = failedPlayerReads.length === 3;
  const profileDataReady = playerDataStatus.profile === 'ready' || playerDataStatus.profile === 'signed-out';
  const dailyDataUnavailable = playerDataStatus.daily === 'error';

  const revealFilter = (filterIndex, { focus = false } = {}) => {
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

  // Honor both ?tab= and ?filter= deep-link query params.
  useEffect(() => {
    if (!router.isReady) return;
    const rawRequested = typeof router.query.tab === 'string'
      ? router.query.tab
      : (typeof router.query.filter === 'string' ? router.query.filter : '');
    const requested = rawRequested.trim().toLowerCase();
    const filterIndex = MODE_FILTERS.findIndex((filter) => filter.id === requested);
    if (filterIndex >= 0) selectFilter(requested, filterIndex);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router.isReady, router.query.tab, router.query.filter]);

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
      setRouteError('That Game Could Not Be Opened. Please Try Again.');
    }
  };

  // Synchronous re-entry guard. Navigates directly to mode pregame (zero lobby double-modal).
  const _startModeInFlightRef = useRef(false);
  const startMode = (modeId) => {
    if (_startModeInFlightRef.current) return;
    _startModeInFlightRef.current = true;
    try {
      if (playerDataLoading) {
        setRouteError('Player Access Is Still Loading.');
        return;
      }
      const availability = availabilityFor(modeId);
      if (!availability.enabled) {
        setRouteError(availability.message);
        return;
      }
      if (modeId === 'daily' && dailyCompleted) return;
      void routeToMode(modeId);
    } finally {
      setTimeout(() => {
        _startModeInFlightRef.current = false;
      }, 400);
    }
  };

  const formatEntryCost = (modeId, unavailable) => {
    if (playerDataLoading) return 'Checking Access';
    if (unavailable) return 'Unavailable';
    const cost = getEntryCost(modeId);
    const variableCost = VARIABLE_COST_MODES.has(modeId);
    // Check Free (cost === 0) FIRST so VIP users never see false "VIP Free" on free modes.
    if (!variableCost && cost === 0) return 'Free';
    if (!profileDataReady) return 'Verified At Entry';
    if (variableCost) return 'Variable';
    if (arcadeTicketCount > 0 && modeId === 'arcade') return '1 Free Entry Ticket';
    if (isVip) return 'VIP Free';
    return `${cost} Diamonds`;
  };

  const quickStakesCostText = formatEntryCost(TRIVIA_QUICK_STAKES_MODE.id, !quickStakesAvailability.enabled);
  const recoveryModeDef = activeSoloRecovery ? TRIVIA_MODE_BY_ID[activeSoloRecovery.mode] : null;

  return (
    <div className="trivia-lobby smarterdesign">
      {/* Visible #SMARTERDESIGN Masthead with Primary Daily Trivia Action */}
      <header className="sd-masthead lobby-masthead">
        <div className="lobby-masthead__top">
          <div className="lobby-masthead__copy">
            <span className="lobby-masthead__eyebrow">Smarter.Poker</span>
            <h1 className="lobby-masthead__title">Poker Trivia</h1>
            <p className="lobby-masthead__subtitle">
              Daily Trivia, Solver Strategy Drills, And Competitive Poker Modes
            </p>
          </div>
          <div className="lobby-masthead__cta">
            <button
              type="button"
              className="sd-button sd-primary lobby-daily-cta"
              onClick={() => {
                if (!dailyCompleted && dailyAvailability.enabled) startMode(TRIVIA_FEATURED_MODE.id);
              }}
              onPointerDown={() => dailyAvailability.enabled && !dailyCompleted && prefetchMode(TRIVIA_FEATURED_MODE.id)}
              disabled={playerDataLoading || dailyDataUnavailable || dailyCompleted || !dailyAvailability.enabled || isRouting}
              aria-label={
                playerDataLoading
                  ? 'Checking Daily Trivia Status'
                  : dailyDataUnavailable
                    ? 'Daily Trivia Status Unavailable'
                    : dailyCompleted
                      ? 'Daily Trivia Completed'
                      : dailyAvailability.enabled
                        ? 'Play Daily Trivia - Free, 10 Questions Fresh Every Day'
                        : dailyAvailability.message
              }
            >
              {playerDataLoading
                ? 'Checking Daily...'
                : dailyCompleted
                  ? 'Daily Trivia Completed'
                  : !dailyAvailability.enabled
                    ? 'Daily Maintenance'
                    : 'Play Daily Trivia (Free)'}
            </button>
          </div>
        </div>

        <dl className="lobby-metrics" aria-label="Player Trivia Summary">
          <div className="sd-metric lobby-metric">
            <dt>Diamonds</dt>
            <dd>
              {playerDataLoading
                ? 'Checking'
                : authState === 'signed-out'
                  ? 'Sign In'
                  : profileDataReady
                    ? Number(userDiamonds || 0).toLocaleString('en-US')
                    : 'Server Verified'}
            </dd>
          </div>
          <div className="sd-metric lobby-metric">
            <dt>Daily Streak</dt>
            <dd className={currentStreak > 0 ? 'tc-ink--blue' : undefined}>
              {playerDataLoading
                ? 'Checking'
                : `${Number(currentStreak || 0).toLocaleString('en-US')} ${currentStreak === 1 ? 'Day' : 'Days'}`}
            </dd>
          </div>
          <div className="sd-metric lobby-metric">
            <dt>Daily Trivia</dt>
            <dd className={dailyCompleted ? 'tc-ink--green' : dailyDataUnavailable ? 'tc-ink--red' : 'tc-ink--blue'}>
              {playerDataLoading
                ? 'Checking'
                : dailyDataUnavailable
                  ? 'Unavailable'
                  : dailyCompleted
                    ? 'Completed Today'
                    : 'Ready (10 Qs)'}
            </dd>
          </div>
          <div className="sd-metric lobby-metric">
            <dt>Access</dt>
            <dd className="tc-ink--blue">
              {isVip
                ? 'VIP Member'
                : arcadeTicketCount > 0
                  ? `${arcadeTicketCount} Free ${arcadeTicketCount === 1 ? 'Ticket' : 'Tickets'}`
                  : 'Standard'}
            </dd>
          </div>
        </dl>
      </header>

      {/* Active Solo Session Continue Game Card */}
      {activeSoloRecovery && recoveryModeDef ? (
        <section
          className="sd-panel lobby-continue-card"
          aria-labelledby="lobby-continue-title"
          data-solo-recovery-mode={activeSoloRecovery.mode}
        >
          <div className="lobby-continue-card__copy">
            <span className="tc-label">Active Solo Session</span>
            <h2 id="lobby-continue-title" className="lobby-continue-card__title">
              {recoveryModeDef.name}
            </h2>
            <p className="lobby-continue-card__detail">
              {formatRecoveryProgress(activeSoloRecovery)}
            </p>
          </div>
          <button
            type="button"
            className="sd-button sd-primary lobby-continue-card__action"
            disabled={isRouting}
            onClick={() => void routeToMode(activeSoloRecovery.mode)}
          >
            Continue Game
          </button>
        </section>
      ) : null}

      {playerDataPartial ? (
        <div className="sd-panel player-data-notice" role="status" aria-live="polite">
          <p>
            {allPlayerReadsFailed
              ? 'Player Details Are Unavailable. Game Charges Stay Server Verified.'
              : 'Some Player Details Are Unavailable. Successful Reads Were Kept And Game Charges Stay Server Verified.'}
          </p>
          {typeof onRetryPlayerData === 'function' ? (
            <button type="button" className="sd-button player-data-notice__retry" onClick={onRetryPlayerData}>
              Refresh Player Status
            </button>
          ) : null}
        </div>
      ) : null}

      {/* Quick Access Utility Bar */}
      <nav className="lobby-utility-bar" aria-label="Trivia Quick Access">
        <div className="lobby-utility-links">
          <Link href="/hub/trivia/study" className="sd-button lobby-utility-link">
            Study Your Misses
          </Link>
          <Link href="/hub/trivia/leaderboard" className="sd-button lobby-utility-link">
            Leaderboards
          </Link>
          <Link href="/hub/trivia/stats" className="sd-button lobby-utility-link">
            Stats
          </Link>
          <Link href="/hub/trivia/achievements" className="sd-button lobby-utility-link">
            Achievements
          </Link>
          <Link href="/hub/trivia/settings" className="sd-button lobby-utility-link">
            Settings
          </Link>
        </div>
        {pvpEloBadge ? (
          availabilityFor('pvp').enabled ? (
            <Link href="/hub/trivia/pvp" className="sd-metric lobby-elo-pill tc-ink--blue">
              PvP Elo {pvpEloBadge.elo.toLocaleString('en-US')} / {printTitle(pvpEloBadge.tier)}
            </Link>
          ) : (
            <span className="sd-metric lobby-elo-pill tc-ink--blue">
              PvP Elo {pvpEloBadge.elo.toLocaleString('en-US')} / {printTitle(pvpEloBadge.tier)}
            </span>
          )
        ) : null}
      </nav>

      {/* Mode Cards Section */}
      <section className="modes-section" aria-labelledby="trivia-modes-title">
        <div className="modes-toolbar">
          <div className="modes-toolbar__heading">
            <span className="tc-label">Game Select</span>
            <h2 id="trivia-modes-title" className="sd-section-title modes-toolbar__title">
              Choose Your Game
            </h2>
          </div>
          <span
            className="modes-toolbar__count"
            role="status"
            aria-live="polite"
            aria-atomic="true"
          >
            <span className="tc-ink--green">{liveModeCount} Live</span>
            {maintenanceModeCount > 0 ? (
              <span className="tc-ink--muted">{maintenanceModeCount} Maintenance</span>
            ) : null}
          </span>
        </div>

        <div
          ref={filterRailRef}
          className="sd-tabs mode-filters"
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
              className={`sd-button mode-filter${activeFilter === filter.id ? ' active' : ''}`}
              onClick={() => selectFilter(filter.id, filterIndex)}
              onKeyDown={(event) => handleFilterKeyDown(event, filterIndex)}
              tabIndex={activeFilter === filter.id ? 0 : -1}
              aria-pressed={activeFilter === filter.id}
              aria-controls="trivia-mode-grid"
              aria-label={`${printTitle(filter.label)}, ${MODE_FILTER_COUNTS[filter.id]} Modes`}
            >
              <span>{printTitle(filter.label)}</span>
              <span className="mode-filter__count" aria-hidden="true">
                {MODE_FILTER_COUNTS[filter.id]}
              </span>
            </button>
          ))}
        </div>

        <div className="modes-grid" id="trivia-mode-grid">
          {filteredModes.map((mode) => {
            const availability = availabilityFor(mode.id);
            const unavailable = !availability.enabled;
            const modeName = mode.name;
            const modeDescription = printTitle(mode.description);
            const costText = formatEntryCost(mode.id, unavailable);
            const rewardText =
              typeof mode.diamondReward === 'number'
                ? `+${mode.diamondReward}${mode.perfectBonus ? ` / +${mode.perfectBonus} Perfect` : ''}`
                : mode.diamondReward
                  ? printTitle(String(mode.diamondReward))
                  : '-';

            return (
              <article
                key={mode.id}
                className={`sd-panel mode-card${unavailable ? ' mode-card--maintenance' : ''}`}
                data-mode-id={mode.id}
                data-mode-availability={availability.state}
              >
                <div className="mode-card__head">
                  <span className="mode-card__kicker">
                    {mode.code} / {printTitle(mode.category)}
                  </span>
                  <span className={`mode-card__status ${unavailable ? 'tc-ink--muted' : 'tc-ink--green'}`}>
                    {printTitle(availability.label)}
                  </span>
                </div>

                <h3 className="mode-card__title">{modeName}</h3>
                <p className="mode-card__description">
                  {unavailable ? availability.message : modeDescription}
                </p>

                <dl className="mode-card__meta">
                  <div className="mode-card__row">
                    <dt>Entry</dt>
                    <dd className={costText === 'Free' || costText === 'VIP Free' || costText === '1 Free Entry Ticket' ? 'tc-ink--green' : 'tc-ink--blue'}>
                      {costText}
                    </dd>
                  </div>
                  <div className="mode-card__row">
                    <dt>Reward</dt>
                    <dd>{rewardText}</dd>
                  </div>
                </dl>

                <button
                  type="button"
                  className={`sd-button${unavailable ? '' : ' sd-primary'} mode-card__action`}
                  data-mode-availability={availability.state}
                  onClick={() => startMode(mode.id)}
                  onPointerDown={() => availability.enabled && prefetchMode(mode.id)}
                  onFocus={() => availability.enabled && prefetchMode(mode.id)}
                  disabled={isRouting || unavailable}
                  aria-disabled={playerDataLoading || unavailable}
                  title={unavailable ? availability.message : undefined}
                  aria-label={
                    unavailable
                      ? `${modeName}. ${availability.message}`
                      : `Play ${modeName}. ${modeDescription}. Entry ${costText}. Reward ${rewardText}${typeof mode.diamondReward === 'number' ? ' Diamonds' : ''}.`
                  }
                >
                  <span className="mode-card__action-full">
                    {unavailable ? 'Maintenance' : `Play ${modeName}`}
                  </span>
                  <span className="mode-card__action-compact" aria-hidden="true">
                    {unavailable ? 'Closed' : 'Play'}
                  </span>
                </button>
              </article>
            );
          })}
        </div>
      </section>

      {/* Quick Stakes Featured Panel */}
      <section className="sd-panel quick-stakes-card" aria-labelledby="quick-stakes-title">
        <div className="quick-stakes-card__copy">
          <span className="tc-label">Featured Timed Mode</span>
          <h2 id="quick-stakes-title" className="quick-stakes-card__title">
            {TRIVIA_QUICK_STAKES_MODE.name}
          </h2>
          <p className="quick-stakes-card__desc">
            {TRIVIA_QUICK_STAKES_MODE.description}. 20 Questions In 3 Minutes, Cash Out After 6 Correct.
          </p>
          <p className="quick-stakes-card__entry">
            Entry: <strong className={quickStakesCostText === 'VIP Free' || quickStakesCostText === '1 Free Entry Ticket' ? 'tc-ink--green' : 'tc-ink--blue'}>{quickStakesCostText}</strong>
          </p>
        </div>
        <button
          type="button"
          className="sd-button sd-primary quick-stakes-card__action"
          onClick={() => startMode(TRIVIA_QUICK_STAKES_MODE.id)}
          onPointerDown={() => prefetchMode(TRIVIA_QUICK_STAKES_MODE.id)}
          onFocus={() => prefetchMode(TRIVIA_QUICK_STAKES_MODE.id)}
          disabled={isRouting || playerDataLoading || !quickStakesAvailability.enabled}
          aria-label={
            playerDataLoading
              ? 'Checking Quick Stakes Access'
              : quickStakesAvailability.enabled
                ? `Play ${TRIVIA_QUICK_STAKES_MODE.name}. Entry ${quickStakesCostText}.`
                : quickStakesAvailability.message
          }
        >
          {quickStakesAvailability.enabled ? 'Play Quick Stakes' : 'Maintenance'}
        </button>
      </section>

      {/* Competitive Briefing (Nightly Tournament & 1v1 Head To Head) */}
      <CompetitiveLobbyBriefing
        key={`competitive-lobby:${accountKey || 'no-account'}`}
        authState={authState}
        accountKey={accountKey}
        modeAvailability={modeAvailability}
      />

      {routeError && (
        <p className="route-error tc-ink--red" role="alert">
          {printTitle(routeError)}
        </p>
      )}

      {isRouting && (
        <div
          className="deducting-overlay"
          role="status"
          aria-live="polite"
          aria-label="Opening Game"
        >
          <span className="route-opening tc-label">Opening Game</span>
        </div>
      )}

      <style dangerouslySetInnerHTML={{ __html: `
        .trivia-lobby,
        .trivia-lobby * {
          box-sizing: border-box;
        }

        .trivia-lobby {
          display: flex;
          flex-direction: column;
          gap: 16px;
          width: 100%;
          max-width: 1000px;
          margin: 0 auto;
          padding: 12px 16px 28px;
          color: var(--sd-text, #f2f7ff);
          background: var(--sd-ink, #040d18);
          font-variant-numeric: tabular-nums lining-nums;
        }

        .lobby-masthead {
          display: flex;
          flex-direction: column;
          gap: 14px;
        }

        .lobby-masthead__top {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          justify-content: space-between;
          gap: 12px 18px;
        }

        .lobby-masthead__copy {
          min-width: 0;
          flex: 1 1 260px;
        }

        .lobby-masthead__eyebrow {
          display: block;
          color: var(--sd-ice, #86daff);
          font-family: var(--sd-type, 'Arial Narrow', sans-serif);
          font-size: 13px;
          font-weight: 700;
          letter-spacing: 0.04em;
        }

        .lobby-masthead__title {
          margin: 2px 0 4px;
        }

        .lobby-masthead__subtitle {
          margin: 0;
          color: var(--sd-silver, #bdd0e2);
          font-size: 14px;
          line-height: 1.4;
        }

        .lobby-masthead__cta {
          flex: 0 0 auto;
        }

        .lobby-daily-cta {
          min-height: 48px;
          padding: 10px 20px;
          font-size: 16px;
        }

        .lobby-metrics {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 10px;
          margin: 0;
        }

        .lobby-metric {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        .lobby-metric dt {
          color: var(--sd-silver, #bdd0e2);
          font-size: 12px;
          font-weight: 600;
        }

        .lobby-metric dd {
          margin: 0;
          color: var(--sd-text, #f2f7ff);
          font-family: var(--sd-type, 'Arial Narrow', sans-serif);
          font-size: 18px;
          font-weight: 700;
        }

        .lobby-continue-card {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          justify-content: space-between;
          gap: 12px 18px;
        }

        .lobby-continue-card__copy {
          display: flex;
          flex-direction: column;
          gap: 2px;
          min-width: 0;
          flex: 1 1 220px;
        }

        .lobby-continue-card__title {
          margin: 0;
          color: var(--sd-text, #f2f7ff);
          font-family: var(--sd-type, 'Arial Narrow', sans-serif);
          font-size: 20px;
          font-weight: 700;
        }

        .lobby-continue-card__detail {
          margin: 0;
          color: var(--sd-silver, #bdd0e2);
          font-size: 14px;
        }

        .lobby-continue-card__action {
          min-height: 44px;
          padding: 8px 20px;
          font-size: 15px;
        }

        .player-data-notice {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          color: var(--sd-ice, #86daff);
        }

        .player-data-notice p {
          margin: 0;
          font-size: 13px;
          line-height: 1.4;
        }

        .player-data-notice__retry {
          flex: 0 0 auto;
          min-height: 44px;
        }

        .lobby-utility-bar {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          justify-content: space-between;
          gap: 8px 12px;
        }

        .lobby-utility-links {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }

        .lobby-utility-link {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-height: 44px;
          padding: 6px 14px;
          font-size: 14px;
        }

        .lobby-elo-pill {
          display: inline-flex;
          align-items: center;
          min-height: 44px;
          padding: 6px 12px;
          font-size: 13px;
          font-weight: 700;
          text-decoration: none;
          white-space: nowrap;
        }

        .modes-section {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .modes-toolbar {
          display: flex;
          flex-wrap: wrap;
          align-items: baseline;
          justify-content: space-between;
          gap: 8px 16px;
        }

        .modes-toolbar__heading {
          min-width: 0;
        }

        .modes-toolbar__title {
          margin: 2px 0 0;
        }

        .modes-toolbar__count {
          display: flex;
          gap: 12px;
          font-size: 13px;
          font-weight: 700;
          white-space: nowrap;
        }

        .mode-filters {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }

        .mode-filter {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          min-height: 44px;
          padding: 6px 14px;
          font-size: 14px;
        }

        .mode-filter__count {
          opacity: 0.85;
          font-size: 12px;
        }

        .modes-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 12px;
        }

        .mode-card {
          display: flex;
          flex-direction: column;
          gap: 8px;
          padding: 14px;
          min-width: 0;
        }

        .mode-card--maintenance {
          opacity: 0.78;
        }

        .mode-card__head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          font-size: 12px;
          font-weight: 700;
        }

        .mode-card__kicker {
          color: var(--sd-ice, #86daff);
        }

        .mode-card__title {
          margin: 0;
          color: var(--sd-text, #f2f7ff);
          font-family: var(--sd-type, 'Arial Narrow', sans-serif);
          font-size: 20px;
          font-weight: 700;
          line-height: 1.15;
        }

        .mode-card__description {
          margin: 0;
          color: var(--sd-silver, #bdd0e2);
          font-size: 13px;
          line-height: 1.4;
          flex: 1 1 auto;
        }

        .mode-card__meta {
          display: grid;
          gap: 4px;
          margin: 4px 0 6px;
          padding-top: 8px;
          border-top: 1px solid var(--sd-line, #445e77);
        }

        .mode-card__row {
          display: flex;
          align-items: baseline;
          justify-content: space-between;
          gap: 8px;
          font-size: 13px;
        }

        .mode-card__row dt {
          color: var(--sd-silver, #bdd0e2);
          font-weight: 600;
        }

        .mode-card__row dd {
          margin: 0;
          font-weight: 700;
          text-align: right;
        }

        .mode-card__action {
          width: 100%;
          min-height: 44px;
          font-size: 15px;
          touch-action: manipulation;
        }

        .mode-card__action-compact {
          display: none;
        }

        .mode-card__action:focus-visible,
        .lobby-daily-cta:focus-visible,
        .lobby-continue-card__action:focus-visible,
        .quick-stakes-card__action:focus-visible {
          outline: 2px solid #9ee3ff;
          outline-offset: 2px;
        }

        .quick-stakes-card {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          justify-content: space-between;
          gap: 12px 18px;
        }

        .quick-stakes-card__copy {
          display: flex;
          flex-direction: column;
          gap: 4px;
          min-width: 0;
          flex: 1 1 260px;
        }

        .quick-stakes-card__title {
          margin: 0;
          color: var(--sd-text, #f2f7ff);
          font-family: var(--sd-type, 'Arial Narrow', sans-serif);
          font-size: 22px;
          font-weight: 700;
        }

        .quick-stakes-card__desc,
        .quick-stakes-card__entry {
          margin: 0;
          color: var(--sd-silver, #bdd0e2);
          font-size: 14px;
          line-height: 1.4;
        }

        .quick-stakes-card__action {
          min-height: 44px;
          padding: 8px 20px;
          font-size: 15px;
        }

        .deducting-overlay {
          position: fixed;
          z-index: 9998;
          inset: 0;
          display: grid;
          place-items: center;
          background: rgb(4 13 24 / 78%);
        }

        .route-opening {
          font-size: 16px;
        }

        .route-error {
          margin: 4px 0 0;
          font-size: 14px;
          font-weight: 700;
          text-align: center;
        }

        @media (max-width: 899px) and (min-width: 641px) {
          .modes-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }

          .lobby-metrics {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
        }

        @media (max-width: 640px) {
          .trivia-lobby {
            gap: 10px;
            padding: 8px 10px 24px;
          }

          .lobby-metrics {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }

          .lobby-utility-bar {
            flex-wrap: nowrap;
            overflow-x: auto;
            -webkit-overflow-scrolling: touch;
            scrollbar-width: none;
            gap: 8px;
          }

          .lobby-utility-bar::-webkit-scrollbar,
          .lobby-utility-links::-webkit-scrollbar,
          .mode-filters::-webkit-scrollbar {
            display: none;
          }

          .lobby-utility-links {
            flex-wrap: nowrap;
            flex: 0 0 auto;
            gap: 6px;
          }

          .lobby-utility-link,
          .lobby-elo-pill {
            flex: 0 0 auto;
            white-space: nowrap;
            padding: 6px 12px;
            font-size: 13px;
          }

          .mode-filters {
            flex-wrap: nowrap;
            overflow-x: auto;
            -webkit-overflow-scrolling: touch;
            scrollbar-width: none;
            gap: 6px;
            padding-bottom: 2px;
          }

          .mode-filter {
            flex: 0 0 auto;
            white-space: nowrap;
            padding: 6px 12px;
            font-size: 13px;
          }

          .lobby-masthead__cta,
          .lobby-daily-cta,
          .lobby-continue-card__action,
          .quick-stakes-card__action {
            width: 100%;
          }

          .modes-grid {
            grid-template-columns: 1fr;
            gap: 8px;
          }

          .mode-card {
            display: grid;
            grid-template-columns: minmax(0, 1fr) auto;
            grid-template-areas:
              'head action'
              'title action'
              'desc action'
              'meta action';
            align-items: center;
            gap: 2px 10px;
            padding: 10px 12px;
          }

          .mode-card__head {
            grid-area: head;
            justify-content: flex-start;
            gap: 8px;
            font-size: 11px;
          }

          .mode-card__title {
            grid-area: title;
            font-size: 17px;
            line-height: 1.15;
          }

          .mode-card__description {
            grid-area: desc;
            font-size: 12px;
            line-height: 1.3;
            display: -webkit-box;
            -webkit-line-clamp: 1;
            -webkit-box-orient: vertical;
            overflow: hidden;
          }

          .mode-card__meta {
            grid-area: meta;
            display: flex;
            flex-wrap: wrap;
            align-items: center;
            gap: 4px 8px;
            margin: 2px 0 0;
            padding-top: 0;
            border-top: 0;
          }

          .mode-card__row {
            gap: 4px;
            font-size: 12px;
          }

          .mode-card__row dt {
            display: none;
          }

          .mode-card__row + .mode-card__row::before {
            content: '·';
            color: var(--sd-silver, #bdd0e2);
            margin-right: 4px;
          }

          .mode-card__action {
            grid-area: action;
            width: auto;
            min-width: 72px;
            min-height: 44px;
            padding: 8px 14px;
            font-size: 14px;
            align-self: center;
          }

          .mode-card__action-full {
            display: none;
          }

          .mode-card__action-compact {
            display: inline;
          }
        }

        @media (prefers-contrast: more) {
          .mode-card__description,
          .mode-card__row dt,
          .lobby-masthead__subtitle {
            color: var(--sd-text, #f2f7ff);
          }
        }

        @media (forced-colors: active) {
          .mode-card,
          .lobby-masthead,
          .lobby-continue-card,
          .quick-stakes-card {
            border-color: CanvasText;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .mode-filters {
            scroll-behavior: auto;
          }
        }
      ` }} />
    </div>
  );
}
