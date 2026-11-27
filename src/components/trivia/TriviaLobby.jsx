/**
 * Approved mobile-first Trivia gallery. Presentation stays separate from the
 * canonical mode registry, entry pricing, availability and recovery contracts.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { authedFetch } from '../../lib/authUtils';
import CompetitiveLobbyBriefing from './competitive/CompetitiveLobbyBriefing';
import TriviaBodyIcon from './TriviaBodyIcon';
import TriviaConsoleDialog from './console/TriviaConsoleDialog';
import styles from './TriviaLobby.module.css';
import { getModeConfig } from '../../lib/trivia/triviaEngine';
import { readSoloRunRecovery } from '../../lib/trivia/soloRunRecovery.mjs';
import {
  TRIVIA_FEATURED_MODE,
  TRIVIA_MODE_BY_ID,
  TRIVIA_QUICK_STAKES_MODE,
  getTriviaModeRoute as getModeRoute,
  resolveTriviaModeAvailability,
} from '../../config/triviaModeRegistry.mjs';
import {
  TRIVIA_LOBBY_CARDS,
  filterTriviaLobbyCards,
} from '../../config/triviaLobbyPresentation.mjs';

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

/** Strictly FREE (cost === 0) modes eligible for safe 1-tap ?autostart=1 from the Lobby. */
const FREE_AUTOSTART_MODES = Object.freeze(new Set(['daily', 'history', 'rules', 'pro']));

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

function TriviaModeArt({ mode, priority }) {
  const [shouldLoad, setShouldLoad] = useState(Boolean(priority));
  const [fallback, setFallback] = useState(false);
  const [failed, setFailed] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    if (shouldLoad) return undefined;
    if (typeof window === 'undefined' || typeof IntersectionObserver === 'undefined') {
      setShouldLoad(true);
      return undefined;
    }
    const node = containerRef.current;
    if (!node) {
      setShouldLoad(true);
      return undefined;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setShouldLoad(true);
          observer.disconnect();
        }
      },
      { rootMargin: '0px' },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [shouldLoad]);

  return (
    <div ref={containerRef} className={styles.art} aria-hidden="true">
      {!failed ? (
        shouldLoad ? (
          <img
            src={fallback ? mode.fallbackImage : mode.image}
            srcSet={fallback ? undefined : `${mode.imageSmall} 576w, ${mode.image} ${mode.imageWidth}w`}
            sizes="(max-width: 599px) calc((100vw - 42px) / 2), (max-width: 940px) calc((100vw - 62px) / 2), 439px"
            alt=""
            width={mode.imageWidth}
            height={mode.imageHeight}
            loading={priority ? 'eager' : 'lazy'}
            fetchPriority={priority ? 'high' : undefined}
            decoding="async"
            onError={() => {
              if (!fallback && mode.fallbackImage) setFallback(true);
              else setFailed(true);
            }}
          />
        ) : (
          <noscript>
            <img
              src={mode.image}
              srcSet={`${mode.imageSmall} 576w, ${mode.image} ${mode.imageWidth}w`}
              sizes="(max-width: 599px) calc((100vw - 42px) / 2), (max-width: 940px) calc((100vw - 62px) / 2), 439px"
              alt=""
              width={mode.imageWidth}
              height={mode.imageHeight}
              loading="lazy"
              decoding="async"
            />
          </noscript>
        )
      ) : (
        <TriviaBodyIcon name="duel" className={styles.artFallback} />
      )}
    </div>
  );
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
  helpSummary = null,
}) {
  const router = useRouter();
  const [activeFilter, setActiveFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [helpOpen, setHelpOpen] = useState(false);
  const searchInputRef = useRef(null);
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

  const filteredModes = filterTriviaLobbyCards(searchQuery, activeFilter);
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

  // Honor both ?tab= and ?filter= deep-link query params.
  useEffect(() => {
    if (!router.isReady) return;
    const rawRequested = typeof router.query.tab === 'string'
      ? router.query.tab
      : (typeof router.query.filter === 'string' ? router.query.filter : '');
    setActiveFilter(rawRequested.trim().toLowerCase() || 'all');
  }, [router.isReady, router.query.tab, router.query.filter]);

  const prefetchMode = (modeId) => {
    if (!availabilityFor(modeId).enabled) return;
    const route = getModeRoute(modeId);
    if (prefetchedRoutesRef.current.has(route)) return;
    prefetchedRoutesRef.current.add(route);
    router.prefetch(route).catch(() => prefetchedRoutesRef.current.delete(route));
  };

  const routeToMode = async (modeId, { autostart = false } = {}) => {
    if (routingRef.current) return;
    routingRef.current = true;
    setRouteError('');
    setIsRouting(true);
    try {
      // ZERO SILENT SPENDING: ?autostart=1 is strictly restricted to FREE (cost === 0) modes
      // with no active solo recovery session blocking it.
      const allowAutostart = Boolean(
        autostart
        && FREE_AUTOSTART_MODES.has(modeId)
        && getEntryCost(modeId) === 0
        && activeSoloRecovery?.mode !== modeId
      );
      const didNavigate = allowAutostart
        ? await router.push(`${getModeRoute(modeId)}?autostart=1`)
        : await router.push(getModeRoute(modeId));
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
      const shouldAutostart = FREE_AUTOSTART_MODES.has(modeId)
        && getEntryCost(modeId) === 0
        && activeSoloRecovery?.mode !== modeId;
      void routeToMode(modeId, { autostart: shouldAutostart });
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
    return `${cost} ${cost === 1 ? 'Diamond' : 'Diamonds'}`;
  };

  const quickStakesCostText = formatEntryCost(TRIVIA_QUICK_STAKES_MODE.id, !quickStakesAvailability.enabled);
  const recoveryModeDef = activeSoloRecovery ? TRIVIA_MODE_BY_ID[activeSoloRecovery.mode] : null;

  const clearSearch = () => {
    setSearchQuery('');
    setActiveFilter('all');
    searchInputRef.current?.focus();
  };
  const hasSearch = searchQuery.trim().length > 0 || activeFilter !== 'all';

  return (
    <div className={`trivia-lobby smarterdesign ${styles.lobby}`}>
      <header className={`lobby-masthead ${styles.hero}`}>
        <div className={styles.heroCopy}>
          <h1 className={`lobby-masthead__title ${styles.title}`}>Poker Trivia</h1>
          <p className={styles.heroCount}>{TRIVIA_LOBBY_CARDS.length} Games</p>
        </div>
        <button
          type="button"
          className={styles.helpButton}
          aria-label="Poker Trivia Help"
          aria-haspopup="dialog"
          aria-expanded={helpOpen}
          onClick={() => setHelpOpen(true)}
        >
          <TriviaBodyIcon name="help" className={styles.helpIcon} />
        </button>
      </header>

      <button
        type="button"
        className={`lobby-daily-cta ${styles.button} ${styles.primaryButton} ${styles.dailyButton}`}
        onClick={() => {
          if (!dailyCompleted && dailyAvailability.enabled) startMode(TRIVIA_FEATURED_MODE.id);
        }}
        onPointerDown={() => dailyAvailability.enabled && !dailyCompleted && prefetchMode(TRIVIA_FEATURED_MODE.id)}
        onFocus={() => dailyAvailability.enabled && !dailyCompleted && prefetchMode(TRIVIA_FEATURED_MODE.id)}
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
        <TriviaBodyIcon name="play" className={styles.dailyPlayIcon} />
        <span>
          {playerDataLoading
            ? 'Checking Daily...'
            : dailyDataUnavailable
              ? 'Daily Status Unavailable'
              : dailyCompleted
                ? 'Daily Trivia Completed'
                : !dailyAvailability.enabled
                  ? 'Daily Maintenance'
                  : 'Play Daily Trivia'}
        </span>
      </button>

      <dl className={`lobby-metrics ${styles.metrics}`} aria-label="Player Trivia Summary">
        <div className={styles.metric}>
          <dt className={styles.srOnly}>Diamonds</dt>
          <dd className={styles.metricValue}>
            <TriviaBodyIcon name="diamonds" className={styles.metricIcon} />
            <div className={styles.metricCopy}>
              <strong>
                {playerDataLoading
                  ? 'Checking'
                  : authState === 'signed-out'
                    ? 'Sign In'
                    : profileDataReady
                      ? Number(userDiamonds || 0).toLocaleString('en-US')
                      : 'Server Verified'}
              </strong>
              <span aria-hidden="true">Diamonds</span>
            </div>
          </dd>
        </div>
        <div className={styles.metric}>
          <dt className={styles.srOnly}>Day Streak</dt>
          <dd className={styles.metricValue}>
            <TriviaBodyIcon name="streak" className={styles.metricIcon} />
            <div className={styles.metricCopy}>
              <strong>
                {playerDataLoading
                  ? 'Checking'
                  : playerDataStatus.streak === 'error'
                    ? 'Unavailable'
                    : Number(currentStreak || 0).toLocaleString('en-US')}
              </strong>
              <span aria-hidden="true">Day Streak</span>
            </div>
          </dd>
        </div>
      </dl>

      {activeSoloRecovery && recoveryModeDef ? (
        <section
          className={`lobby-continue-card ${styles.notice} ${styles.continueCard}`}
          aria-labelledby="lobby-continue-title"
          data-solo-recovery-mode={activeSoloRecovery.mode}
        >
          <div>
            <span className={styles.eyebrow}>Active Solo Session</span>
            <h2 id="lobby-continue-title" className={styles.continueTitle}>{recoveryModeDef.name}</h2>
            <p>{formatRecoveryProgress(activeSoloRecovery)}</p>
          </div>
          <button
            type="button"
            className={`lobby-continue-card__action ${styles.button} ${styles.primaryButton}`}
            disabled={isRouting}
            onClick={() => void routeToMode(activeSoloRecovery.mode)}
          >
            <TriviaBodyIcon name="play" className={styles.playIcon} />
            Continue Game
          </button>
        </section>
      ) : null}

      {playerDataPartial ? (
        <div className={`player-data-notice ${styles.notice}`} role="status" aria-live="polite">
          <p>
            {allPlayerReadsFailed
              ? 'Player Details Are Unavailable. Game Charges Stay Server Verified.'
              : 'Some Player Details Are Unavailable. Successful Reads Were Kept And Game Charges Stay Server Verified.'}
          </p>
          {typeof onRetryPlayerData === 'function' ? (
            <button type="button" className={styles.button} onClick={onRetryPlayerData}>
              Refresh Player Status
            </button>
          ) : null}
        </div>
      ) : null}

      <div className={styles.discoveryRow}>
        <Link href="/hub/trivia/study" className={`${styles.button} ${styles.studyButton}`}>
          <TriviaBodyIcon name="study" className={styles.discoveryIcon} />
          <span>Study My Misses</span>
        </Link>
        <label className={styles.searchField}>
          <TriviaBodyIcon name="search" className={styles.discoveryIcon} />
          <span className={styles.srOnly}>Search Trivia Games</span>
          <input
            ref={searchInputRef}
            type="search"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder={`Search ${TRIVIA_LOBBY_CARDS.length} Games`}
            aria-controls="trivia-game-grid"
            autoComplete="off"
          />
        </label>
      </div>

      <nav className={`lobby-utility-bar ${styles.utilityBar}`} aria-label="Trivia Quick Access">
        <Link href="/hub/trivia/leaderboard" className={styles.utilityLink}>
          <TriviaBodyIcon name="leaderboards" className={styles.utilityIcon} />
          <span>Leaderboards</span>
        </Link>
        <Link href="/hub/trivia/stats" className={styles.utilityLink}>
          <TriviaBodyIcon name="stats" className={styles.utilityIcon} />
          <span>Stats</span>
        </Link>
        <Link href="/hub/trivia/achievements" className={styles.utilityLink}>
          <TriviaBodyIcon name="achievements" className={styles.utilityIcon} />
          <span>Achievements</span>
        </Link>
        <Link href="/hub/trivia/settings" className={styles.utilityLink}>
          <TriviaBodyIcon name="settings" className={styles.utilityIcon} />
          <span>Settings</span>
        </Link>
      </nav>

      <section className={`modes-section ${styles.modesSection}`} aria-labelledby="trivia-modes-title">
        <div className={styles.sectionBar}>
          <div className={styles.sectionHeading}>
            <TriviaBodyIcon name="duel" className={styles.sectionIcon} />
            <h2 id="trivia-modes-title">Choose Your Game</h2>
          </div>
          <span className={styles.gameCount} role="status" aria-live="polite" aria-atomic="true">
            {filteredModes.length} {filteredModes.length === 1 ? 'Game' : 'Games'}
            <span className={styles.srOnly}>. {liveModeCount} Live. {maintenanceModeCount} In Maintenance.</span>
          </span>
        </div>
        {hasSearch ? (
          <div className={styles.searchSummary}>
            <p>{searchQuery.trim() ? `Results For “${searchQuery.trim()}”` : `${printTitle(activeFilter)} Games`}</p>
            <button type="button" className={styles.button} onClick={clearSearch}>Show All Games</button>
          </div>
        ) : null}

        <div id="trivia-game-grid" className={`modes-grid ${styles.gameGrid}`}>
          {filteredModes.map((mode, index) => {
            const availability = availabilityFor(mode.id);
            const unavailable = !availability.enabled;
            const modeName = printTitle(mode.displayName);
            const modeDescription = printTitle(mode.description);
            const costText = formatEntryCost(mode.id, unavailable);
            const rewardText = typeof mode.diamondReward === 'number'
              ? `+${mode.diamondReward}${mode.perfectBonus ? ` / +${mode.perfectBonus} Perfect` : ''}`
              : printTitle(mode.diamondReward);
            const canOpenCard = !isRouting && !playerDataLoading && !unavailable;
            return (
              <article
                key={mode.id}
                className={`mode-card ${styles.gameCard}${canOpenCard ? ` ${styles.gameCardInteractive}` : ''}`}
                data-mode-id={mode.id}
                data-mode-availability={availability.state}
                aria-labelledby={`trivia-card-${mode.id}`}
                onClick={() => {
                  if (canOpenCard) startMode(mode.id);
                }}
                onPointerDown={() => {
                  if (availability.enabled) prefetchMode(mode.id);
                }}
              >
                <TriviaModeArt mode={mode} priority={index < 2} />
                {unavailable ? (
                  <span className={styles.maintenanceBadge}>Maintenance</span>
                ) : null}
                <div className={styles.cardContent}>
                  <h3 id={`trivia-card-${mode.id}`} className={styles.cardTitle}>{modeName}</h3>
                  <p className={styles.cardCaption}>{mode.caption}</p>
                  <button
                    type="button"
                    className={`mode-card__action ${styles.button} ${styles.cardButton}${unavailable ? '' : ` ${styles.primaryButton}`}`}
                    data-mode-availability={availability.state}
                    onClick={(event) => {
                      event.stopPropagation();
                      startMode(mode.id);
                    }}
                    onPointerDown={() => availability.enabled && prefetchMode(mode.id)}
                    onFocus={() => availability.enabled && prefetchMode(mode.id)}
                    disabled={isRouting || playerDataLoading || unavailable}
                    aria-disabled={playerDataLoading || unavailable}
                    title={unavailable ? availability.message : `Entry: ${costText}`}
                    aria-label={
                      unavailable
                        ? `${modeName}. ${availability.message}`
                        : `Play ${modeName}. ${modeDescription}. Entry ${costText}. Reward ${rewardText}${typeof mode.diamondReward === 'number' ? ' Diamonds' : ''}.`
                    }
                  >
                    {!unavailable ? <TriviaBodyIcon name="play" className={styles.playIcon} /> : null}
                    <span>{unavailable ? 'Maintenance' : 'Play'}</span>
                  </button>
                </div>
              </article>
            );
          })}
        </div>
        {filteredModes.length === 0 ? (
          <div className={styles.emptyState}>
            <h3>No Games Found</h3>
            <p>Try A Game Name, Poker Topic, Or Category.</p>
          </div>
        ) : null}
      </section>

      <TriviaConsoleDialog
        open={helpOpen}
        onClose={() => setHelpOpen(false)}
        eyebrow="Poker Trivia"
        title="How To Play"
        subtitle="Choose Your Challenge And Build Your Poker Knowledge"
        primaryAction={{ label: 'Close Help', onClick: () => setHelpOpen(false) }}
      >
        <div className={styles.helpContent}>
          <section>
            <h2>Daily Trivia</h2>
            <p>Play 10 Free Questions Each Day. Review Missed Answers In Study My Misses And Track Your Progress In Stats.</p>
            <dl className={styles.helpFacts}>
              <div>
                <dt>Daily Status</dt>
                <dd>{playerDataLoading ? 'Checking' : dailyDataUnavailable ? 'Unavailable' : dailyCompleted ? 'Completed' : dailyAvailability.enabled ? 'Ready (10 Questions)' : 'Maintenance'}</dd>
              </div>
              <div>
                <dt>Player Access</dt>
                <dd>{playerDataLoading ? 'Checking' : !profileDataReady ? 'Verified At Entry' : isVip ? 'VIP Member' : arcadeTicketCount > 0 ? `${arcadeTicketCount} Free ${arcadeTicketCount === 1 ? 'Ticket' : 'Tickets'}` : 'Standard'}</dd>
              </div>
            </dl>
          </section>
          <section>
            <h2>Game Entry And Rewards</h2>
            <p>Entry Details Are Verified Before A Paid Game Starts. Maintenance Games Will Return When Available.</p>
            <dl className={styles.helpFacts}>
              {TRIVIA_LOBBY_CARDS.map((mode) => (
                <div key={mode.id}>
                  <dt>{mode.displayName}</dt>
                  <dd>{formatEntryCost(mode.id, !availabilityFor(mode.id).enabled)}</dd>
                </div>
              ))}
            </dl>
          </section>
          {pvpEloBadge ? (
            availabilityFor('pvp').enabled ? (
              <Link href="/hub/trivia/pvp" className={`lobby-elo-pill ${styles.eloPill}`}>
                PvP Elo {pvpEloBadge.elo.toLocaleString('en-US')} / {printTitle(pvpEloBadge.tier)}
              </Link>
            ) : (
              <p className={`lobby-elo-pill ${styles.eloPill}`}>
                PvP Elo {pvpEloBadge.elo.toLocaleString('en-US')} / {printTitle(pvpEloBadge.tier)}
              </p>
            )
          ) : null}
          <section className={`quick-stakes-card ${styles.quickStakes}`} aria-labelledby="quick-stakes-title">
            <h2 id="quick-stakes-title">{TRIVIA_QUICK_STAKES_MODE.name}</h2>
            <p>{TRIVIA_QUICK_STAKES_MODE.description}. 20 Questions In 3 Minutes, Cash Out After 6 Correct.</p>
            <p>Entry: <strong>{quickStakesCostText}</strong></p>
            <button
              type="button"
              className={`quick-stakes-card__action ${styles.button} ${styles.primaryButton}`}
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
              <TriviaBodyIcon name="play" className={styles.playIcon} />
              {quickStakesAvailability.enabled ? 'Play Quick Stakes' : 'Maintenance'}
            </button>
          </section>
          <CompetitiveLobbyBriefing
            key={`competitive-lobby:${accountKey || 'no-account'}`}
            authState={authState}
            accountKey={accountKey}
            modeAvailability={modeAvailability}
          />
          {helpSummary ? (
            <div className={styles.helpSummary}>{helpSummary}</div>
          ) : null}
        </div>
      </TriviaConsoleDialog>

      {routeError && (
        <p className={styles.routeError} role="alert">{printTitle(routeError)}</p>
      )}
      {isRouting && (
        <div className={styles.routingOverlay} role="status" aria-live="polite" aria-label="Opening Game">
          <span>Opening Game</span>
        </div>
      )}
    </div>
  );
}
