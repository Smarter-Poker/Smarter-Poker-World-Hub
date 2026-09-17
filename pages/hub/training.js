/**
 * pages/hub/training.js · REDESIGNED
 * ─────────────────────────────────────────────────────────────────────────────
 * Drop-in replacement for Smarter-Poker-World-Hub/pages/hub/training.js
 *
 * What changed (vs the existing 2,245-line page):
 *   - Re-framed the page from "100-game catalog" -> "AI-coached daily surface"
 *   - New IA: app bar -> hero plan -> leak banner -> stats strip -> library
 *   - All inline styles moved to a shared `tokens` object
 *   - GSAP + ScrollTrigger + canvas-confetti + framer-motion removed from the
 *     initial bundle. Arena celebrations still load `canvas-confetti` lazily.
 *   - Lucide icons (already a dependency in the codebase) replace emoji icons
 *   - Sentence case throughout, single primary accent (#00D4FF) reserved
 *     for the one-tap CTA per screen
 *   - Touch targets >=44pt, focus rings visible, prefers-reduced-motion honoured
 *
 * Existing imports preserved so the page slots into the codebase 1:1:
 *   - TRAINING_LIBRARY                      (src/data/TRAINING_LIBRARY)
 *   - useTrainingProgress                    (src/hooks/useTrainingProgress)
 *   - useTrainingStore                       (src/stores/trainingStore)
 *   - LeakService                            (src/services/LeakService)
 *   - GodModeArena (lazy)                    (src/components/training/GodModeArena)
 *   - UniversalHeader                        (src/components/ui)
 *   - SEOHead, PageTransition                (existing)
 *
 * Author: redesign generated 2026-05-06
 */

import { useRouter } from 'next/router';
import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import dynamic from 'next/dynamic';
import {
  Play, Shuffle, Target, Clock, Layers, Zap, AlertTriangle, Wrench,
  TrendingUp, Flame, Search, Trophy, DollarSign, Rocket, Brain, Atom,
  Grid2x2, Check, Sparkles, Lock, Gem, Home, Users, BarChart3, User,
  ArrowRight,
} from 'lucide-react';

import SEOHead from '../../src/components/seo/SEOHead';
import UniversalHeader from '../../src/components/ui/UniversalHeader';
import HubPageShell from '../../src/components/ui/HubPageShell';
import PullToRefresh from '../../src/components/ui/PullToRefresh';
import { useLoadFailsafe } from '../../src/hooks/useLoadFailsafe';
import { useHaptics } from '../../src/hooks/useHaptics';
import { useOnlineStatus, OFFLINE_TOAST } from '../../src/hooks/useOnlineStatus';
import { useModalHistory } from '../../src/hooks/useModalHistory';
import toast from '../../src/stores/toastStore';
import PageTransition from '../../src/components/transitions/PageTransition';
import { TRAINING_LIBRARY } from '../../src/data/TRAINING_LIBRARY';
import useTrainingProgress from '../../src/hooks/useTrainingProgress';
import { useTrainingStore } from '../../src/stores/trainingStore';
import { getAuthUser, authedFetch } from '../../src/lib/authUtils';
import { normalizeTrainingSessionConfig } from '../../src/lib/training/sessionConfigContract.mjs';
import SessionSetupModal from '../../src/components/training/SessionSetupModal';
import TrainingGameArt from '../../src/components/training/TrainingGameArt';
import { leakService } from '../../src/services/LeakService';
import { scrollLockCount, clearBodyScrollLockIfUnheld } from '../../src/lib/scrollLock';

const GodModeArena = dynamic(() => import('../../src/components/training/GodModeArena'), {
  ssr: false,
  loading: () => <ArenaSkeleton />,
});

const CATEGORY_META = {
  MTT:        { label: 'Tournaments',  Icon: Trophy,     color: '#FB923C', glow: 'rgba(251,146,60,0.25)' },
  CASH:       { label: 'Cash Games',   Icon: DollarSign, color: '#4ADE80', glow: 'rgba(74,222,128,0.22)' },
  SPINS:      { label: 'Spins & SNGs', Icon: Rocket,     color: '#FACC15', glow: 'rgba(250,204,21,0.22)' },
  PSYCHOLOGY: { label: 'Mental Game',  Icon: Brain,      color: '#C084FC', glow: 'rgba(192,132,252,0.22)' },
  ADVANCED:   { label: 'Advanced',     Icon: Atom,       color: '#60A5FA', glow: 'rgba(96,165,250,0.22)' },
};

const CATEGORY_ORDER = ['MTT', 'CASH', 'SPINS', 'PSYCHOLOGY', 'ADVANCED'];

const WEEKLY_STATS_NUMERIC_FIELDS = Object.freeze([
  'hands_this_week',
  'accuracy_this_week_pct',
  'ev_saved_this_week_bb',
  'hands_last_week',
  'accuracy_last_week_pct',
  'ev_saved_last_week_bb',
  'current_streak_days',
  'personal_best_streak_days',
  'rolling_accuracy_pct',
  'rolling_correct',
  'rolling_total',
]);

function normalizeAuthoritativeWeeklyStats(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  if (!WEEKLY_STATS_NUMERIC_FIELDS.every(field => (
    typeof value[field] === 'number' && Number.isFinite(value[field])
  ))) return null;
  return {
    ...value,
    ...Object.fromEntries(WEEKLY_STATS_NUMERIC_FIELDS.map(field => [field, Number(value[field])])),
  };
}

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function formatSignedValue(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return number >= 0 ? `+${number}` : number;
}

export default function TrainingPage() {
  const router = useRouter();
  // Mobile phase 5 foundation (docs/mobile-standard/ROLLOUT-PLAN.md).
  const haptic = useHaptics();
  const online = useOnlineStatus();
  // Starting a drill opens a session on the server; offline it would spin
  // for the whole timeout and fail. The button explains instead.
  const requireOnline = useCallback(() => {
    if (online) return true;
    toast.error(OFFLINE_TOAST);
    return false;
  }, [online]);

  const showArena    = useTrainingStore(s => s.showArena);
  const activeGame   = useTrainingStore(s => s.activeGame);
  const setShowArena = useTrainingStore(s => s.setShowArena);
  const setActiveGame= useTrainingStore(s => s.setActiveGame);

  const { getGameProgress } = useTrainingProgress();

  const [authUser, setAuthUser] = useState(null);

  const [activeCat, setActiveCat] = useState('ALL');
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const libraryHeadingRef = useRef(null);
  const launchQueryHandledRef = useRef(null);

  useEffect(() => {
    const id = setTimeout(() => setDebouncedQuery(query), 120);
    return () => clearTimeout(id);
  }, [query]);

  useEffect(() => {
    const user = getAuthUser();
    setAuthUser(user);
  }, []);

  // Real data from RPC + Jarvis API · no hardcoded fallbacks
  const {
    stats,
    statsLoading,
    statsError,
    retryStats,
    recommendation,
    recommendationLoading,
  } = useTrainingDashboard(authUser);
  // Lifetime cross-session progress: real training_sessions rows +
  // training_answers position aggregates. Empty history renders an honest
  // "No sessions yet" · never invented numbers.
  const {
    lifetimeSessions,
    positionAccuracy,
    progressLoading,
    progressError,
    retryProgress,
  } = useLifetimeProgress(authUser);
  // The old hub called an optional getBiggest() method that does not exist on
  // LeakSignalAnalyzer, so this entire real-data panel was permanently dead.
  // Read the authenticated, persisted leak lifecycle instead and rank only
  // evidence-backed records returned by Supabase.
  const biggestLeak = useActiveTrainingLeak(authUser);
  // Use the real recommendation when available; null otherwise (UI handles empty state)
  const jarvisPick = recommendation;

  const filtered = useMemo(() => {
    const ql = debouncedQuery.trim().toLowerCase();
    return TRAINING_LIBRARY.filter(g => {
      if (activeCat !== 'ALL' && g.category !== activeCat) return false;
      if (!ql) return true;
      return (g.name || '').toLowerCase().includes(ql)
          || (CATEGORY_META[g.category]?.label || '').toLowerCase().includes(ql);
    });
  }, [activeCat, debouncedQuery]);

  // BUG FIX (TRAIN-SETUP-MODAL-1): originally startDrill mounted the arena
  // directly. The May 8 training-overhaul handoff (issue #288) called for a
  // Session Setup pop-up between the tile click and the arena so users can
  // see their 30-day stats and pick difficulty / timer / training mode
  // before committing. Setup state lives here in local component state;
  // existing showArena / activeGame Zustand state is unchanged so the
  // arena render path below still works identically.
  const [setupGame, setSetupGame] = useState(null);
  const [arenaConfig, setArenaConfig] = useState(null);
  const [arenaSessionId, setArenaSessionId] = useState(null);
  const startDrill = useCallback((game) => {
    if (!game) return;
    if (!requireOnline()) return;
    haptic('light');
    setActiveGame(game);
    setSetupGame(game);  // show modal; modal will call onStart to flip showArena
  }, [setActiveGame, requireOnline, haptic]);

  // Leak Finder And Sandbox Both Deep-Link Into The Training Center. These
  // Query Parameters Previously Had No Consumer, So The Promised Focused Game
  // Opened An Unfiltered Lobby. Resolve Only Real Library Identifiers, Open The
  // Existing Session Setup For An Exact Match, And Fall Back To A Visible
  // Library Search When A Historical Recommendation No Longer Exists.
  useEffect(() => {
    if (!router.isReady) return;
    const rawAutoLaunch = typeof router.query.autoLaunch === 'string' ? router.query.autoLaunch.trim().toLowerCase() : '';
    const rawFocus = typeof router.query.focus === 'string' ? router.query.focus.trim().toLowerCase() : '';
    const rawCategory = typeof router.query.category === 'string' ? router.query.category.trim().toUpperCase() : '';
    const requestKey = `${rawAutoLaunch}|${rawFocus}|${rawCategory}`;
    if (!rawAutoLaunch && !rawFocus && !rawCategory) return;
    if (launchQueryHandledRef.current === requestKey) return;
    launchQueryHandledRef.current = requestKey;

    const requestedGame = rawAutoLaunch || rawFocus;
    const aliases = requestedGame
      ? new Set([requestedGame, requestedGame.replace(/_/g, '-'), requestedGame.replace(/-/g, '_')])
      : new Set();
    const game = TRAINING_LIBRARY.find(item => {
      const id = String(item?.id || '').toLowerCase();
      return aliases.has(id) || aliases.has(id.replace(/_/g, '-')) || aliases.has(id.replace(/-/g, '_'));
    });

    if (game && rawAutoLaunch) {
      setActiveCat(game.category || 'ALL');
      setQuery('');
      setDebouncedQuery('');
      startDrill(game);
      return;
    }
    if (game) {
      setActiveCat(game.category || 'ALL');
      setQuery(game.name || game.id);
      setDebouncedQuery(game.name || game.id);
      return;
    }
    if (CATEGORY_ORDER.includes(rawCategory)) setActiveCat(rawCategory);
    if (requestedGame) {
      const readable = requestedGame.replace(/[-_]+/g, ' ');
      setQuery(readable);
      setDebouncedQuery(readable);
    }
  }, [router.isReady, router.query.autoLaunch, router.query.focus, router.query.category, startDrill]);

  const handleSetupClose = useCallback(() => {
    setSetupGame(null);
  }, []);
  useModalHistory(Boolean(setupGame), handleSetupClose);

  /* LOAD FAILSAFE (mobile phase 0a). The dashboard and progress hooks own
     their own loading flags; a request that never settles used to pin the
     stats and progress cards on their skeletons forever. This caps that at
     eight seconds and every "still loading" read below goes through the
     capped pair. The hooks are untouched, so a late answer still lands. */
  const [dataLoading, setDataLoading] = useState(true);
  useEffect(() => {
    if (!statsLoading && !progressLoading) setDataLoading(false);
  }, [statsLoading, progressLoading]);
  useLoadFailsafe(dataLoading, setDataLoading);
  const statsBusy = statsLoading && dataLoading;
  const progressBusy = progressLoading && dataLoading;
  const refreshDashboard = useCallback(async () => {
    if (!requireOnline()) return;
    setDataLoading(true);
    try {
      await Promise.allSettled([Promise.resolve(retryStats?.()), Promise.resolve(retryProgress?.())]);
    } finally {
      setDataLoading(false);
    }
  }, [requireOnline, retryStats, retryProgress]);

  const browseTrainingLibrary = useCallback(() => {
    setActiveCat('ALL');
    setQuery('');
    setDebouncedQuery('');
    if (typeof window === 'undefined') return;
    window.requestAnimationFrame(() => {
      const heading = libraryHeadingRef.current;
      if (!heading) return;
      heading.focus({ preventScroll: true });
      heading.closest('section')?.scrollIntoView({
        behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
        block: 'start',
      });
    });
  }, []);

  const resetBrowseFilters = useCallback(() => {
    setActiveCat('ALL');
    setQuery('');
    setDebouncedQuery('');
  }, []);

  // 2026-07-26 UX FIX: this discarded the prefs the user just picked, so the
  // arena fell back to its own defaults AND showed a second identical setup
  // screen (difficulty / timer / mode) before you could play.
  // roadmap #47 · defensive unlock. The library page is the reported symptom:
  // it will not scroll. GodModeArena locks body overflow while mounted, and any
  // path that leaves that lock behind (an unmount whose cleanup did not run, a
  // stale value restored by the pre-2026-07-26 capture-and-restore version, a
  // crashed arena) strands this page permanently with no way back short of a
  // reload. The arena's lock is now reference-counted, but this page is where
  // the damage shows, so it also refuses to render locked: if no arena is
  // mounted, no lock may be outstanding.
  useEffect(() => {
    if (showArena) return;              // the arena is entitled to hold the lock
    if (typeof window === 'undefined') return;
    if (scrollLockCount() > 0) return;  // a live locker owns it
    clearBodyScrollLockIfUnheld();
  }, [showArena]);

  const handleSetupStart = useCallback((prefs) => {
    if (!authUser?.id) {
      setSetupGame(null);
      router.push({
        pathname: '/auth/login',
        query: { redirect: '/hub/training' },
      });
      return;
    }
    const sessionConfig = normalizeTrainingSessionConfig(prefs);
    // GTOW parity #10. The setup modal offers up to 4 tables, and that choice
    // used to be handed to GodModeArena's wrapper, which rendered N copies of
    // the arena with IDENTICAL props · same drill, same userId, same sessionId.
    // Every copy independently fetched questions, emitted its own SESSION_END
    // and banked its own diamond reward, so a 4-table session paid out four
    // times for what the player experienced as one. It also stacked four
    // full-viewport confetti canvases and four global keydown listeners, so a
    // single "1" keypress answered all four tables at once.
    //
    // /hub/training/multi-table is the real implementation: distinct drills per
    // table, one combined session, one save. Route there instead of mounting
    // the broken inline copy. The chosen game leads so the player still gets
    // the drill they clicked.
    const tableCount = parseInt(sessionConfig.tables, 10);
    if (Number.isFinite(tableCount) && tableCount > 1 && setupGame?.id) {
      setSetupGame(null);
      router.push({
        pathname: '/hub/training/multi-table',
        query: {
          tables: String(tableCount),
          game: setupGame.id,
          difficulty: sessionConfig.difficulty,
          timer: sessionConfig.timer,
          scope: sessionConfig.scope,
          ...(sessionConfig.targetStreet ? { targetStreet: sessionConfig.targetStreet } : {}),
          autoAdvance: '0',
          handSelection: sessionConfig.handSelection,
          // GTOW parity #9 / #6: the arena derives its Auto New Hand delay from
          // `speed` and its pause behaviour from `feedbackRule`. The single-table
          // branch below forwards both; this branch dropped them, so every
          // multi-table session ran Normal speed and "On mistakes" no matter what
          // the player chose one screen earlier.
          speed: 'normal',
          feedbackRule: 'every',
        },
      });
      return;
    }

    setArenaConfig(sessionConfig);
    // Session identity must be stable for the entire run. Rendering Date.now()
    // directly as a prop regenerated it whenever the hub rerendered, which
    // could split one player's answers and completion event across identities.
    setArenaSessionId(`session-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`);
    setSetupGame(null);
    setShowArena(true);
  }, [setShowArena, setupGame, router, authUser?.id]);

  return (
    <PageTransition disableInitialAnimation>
      <SEOHead
        title="GTO Poker Training: Free Drills, A Daily Plan And Leak Detection"
        description="Free GTO Poker Training On Smarter.Poker: One-Tap Drills, A Personalised Daily Plan, Leak Detection And 100+ Scenario-Based Games Coached By Jarvis. No Real-Money Gambling."
        canonical="/hub/training"
      />

      <GlobalStyle />

      {/* BUG FIX (TRAIN-SETUP-MODAL-1): Session Setup modal · shown between
          tile click and arena mount. Reads training_dashboard_30day_stats
          and training_dashboard_last_session RPCs for the YOUR PERFORMANCE
          card. Persists difficulty / timer / mode in localStorage. */}
      <SessionSetupModal
        isOpen={Boolean(setupGame)}
        game={setupGame}
        userId={authUser?.id || null}
        onClose={handleSetupClose}
        onStart={handleSetupStart}
      />

      {showArena && activeGame && authUser?.id && (
        <GodModeArena
          userId={authUser.id}
          gameId={activeGame.id}
          gameName={activeGame.name}
          level={1}
          initialConfig={arenaConfig}
          sessionId={arenaSessionId}
          onComplete={() => {
            setShowArena(false);
            setArenaSessionId(null);
          }}
          onExit={() => {
            setShowArena(false);
            setArenaSessionId(null);
          }}
        />
      )}

      {!showArena && (
        <HubPageShell className="training" maxWidth={1180} header={<UniversalHeader />}>
          <a href="#main" className="sp-skip">Skip To Main Content</a>

          {/* Pull down at the top to re-read the dashboard. Off while the
              session setup sheet is open so a drag inside it cannot fire a
              reload underneath. */}
          <PullToRefresh onRefresh={refreshDashboard} disabled={Boolean(setupGame)}>
          <main id="main" className="sp-main">

            <section aria-labelledby="hero-h" className="sp-hero" data-tutorial="hero">
              <div className="sp-hero-copy">
                <p className="sp-hero-eyebrow">
                  <span className="sp-dot" aria-hidden />
                  {jarvisPick?.estMinutes ? `Training Orb Online · ${jarvisPick.estMinutes} Minute Plan` : 'Training Orb Online'}
                </p>
                <h1 id="hero-h" className="sp-hero-title">
                  {renderHeroHeadline({ authUser, stats, statsError, jarvisPick, statsLoading: statsBusy, recommendationLoading })}
                </h1>
                <p className="sp-hero-sub">
                  {recommendationLoading
                    ? 'Loading your daily plan…'
                    : jarvisPick
                      ? (jarvisPick.reason
                          ? `Jarvis: ${jarvisPick.reason}`
                          : `Jarvis picked one drill for you - ${jarvisPick.name}.`)
                      : 'Browse The Library Below To Start Your First Drill.'}
                </p>

                {jarvisPick && <DrillCard game={jarvisPick} />}

                <div className="sp-cta-row">
                  <button
                    className="sp-cta sp-cta-primary"
                    onClick={() => startDrill(jarvisPick || TRAINING_LIBRARY[0])}
                    disabled={recommendationLoading || !TRAINING_LIBRARY[0]}
                    aria-disabled={recommendationLoading || !TRAINING_LIBRARY[0]}
                  >
                    <Play size={18} aria-hidden /> {jarvisPick ? "Start Today's Drill" : 'Start First Drill'}
                  </button>
                  <button className="sp-cta sp-cta-secondary" onClick={browseTrainingLibrary}>
                    <Shuffle size={18} aria-hidden /> Pick A Different Drill
                  </button>
                </div>
              </div>

              <GradeCard
                stats={stats}
                loading={statsBusy}
                error={statsError}
                onRetry={retryStats}
                signedIn={Boolean(authUser?.id)}
              />
            </section>

            {biggestLeak && (
              <section aria-labelledby="leak-h" className="sp-leak" data-tutorial="leak">
                <div>
                  <span className="sp-leak-eyebrow"><AlertTriangle size={12} aria-hidden /> Priority Leak Detected</span>
                  <h2 id="leak-h" className="sp-leak-title">
                    {biggestLeak.name}
                  </h2>
                  <p className="sp-leak-body">
                    {biggestLeak.spotLabel ? <><b>{biggestLeak.spotLabel}.</b>{' '}</> : null}
                    {biggestLeak.explanation || 'Review this measured pattern and train the matching decisions.'}
                    {biggestLeak.sampleCount != null ? <> Evidence: <b>{biggestLeak.sampleCount} Observations</b>.</> : null}
                    {biggestLeak.errorRatePct != null ? <> Error Rate: <b>{biggestLeak.errorRatePct}%</b>.</> : null}
                  </p>
                </div>
                {biggestLeak.recommendedGame ? (
                  <button
                    className="sp-cta sp-cta-secondary sp-cta-warn"
                    onClick={() => startDrill(biggestLeak.recommendedGame)}
                  >
                    <Wrench size={18} aria-hidden /> Train This Spot
                  </button>
                ) : (
                  <a className="sp-cta sp-cta-secondary sp-cta-warn" href="/hub/training/weakness-scanner">
                    <Wrench size={18} aria-hidden /> Open Leak Scanner
                  </a>
                )}
              </section>
            )}

            <section aria-labelledby="stats-h" data-tutorial="stats">
              <div className="sp-section-head">
                <h2 id="stats-h" className="sp-section-title">This Week</h2>
                <a className="sp-section-link" href="/hub/session-history">See History <ArrowRight size={14} aria-hidden /></a>
              </div>
              {!authUser?.id ? (
                <DataUnavailable
                  title="Sign In To View Weekly Stats"
                  message="Weekly Hands, Accuracy, Measured EV, And Streaks Appear After An Authenticated Read."
                  alert={false}
                />
              ) : statsError ? (
                <DataUnavailable
                  title="Weekly Stats Are Temporarily Unavailable"
                  message="We Could Not Verify Your Current Training Statistics. No Placeholder Values Are Shown."
                  onRetry={retryStats}
                />
              ) : (
                <div className="sp-stats">
                  <Stat
                    icon={Layers}
                    label="Hands"
                    loading={statsBusy || !stats}
                    value={stats?.hands_this_week}
                    trend={fmtTrend(stats?.hands_this_week, stats?.hands_last_week)}
                  />
                  <Stat
                    icon={Target}
                    label="Accuracy"
                    loading={statsBusy || !stats}
                    value={stats?.accuracy_this_week_pct}
                    unit="%"
                    trend={fmtTrend(stats?.accuracy_this_week_pct, stats?.accuracy_last_week_pct, ' pts')}
                  />
                  <Stat
                    icon={TrendingUp}
                    label="EV Saved"
                    loading={statsBusy || !stats}
                    value={formatSignedValue(stats?.ev_saved_this_week_bb)}
                    unit="bb"
                    trend={fmtTrend(stats?.ev_saved_this_week_bb, stats?.ev_saved_last_week_bb, ' bb')}
                  />
                  <Stat
                    icon={Flame}
                    label="Streak"
                    loading={statsBusy || !stats}
                    value={stats?.current_streak_days}
                    unit="days"
                    sub={stats?.personal_best_streak_days
                      ? `Personal best: ${stats.personal_best_streak_days}`
                      : null}
                  />
                </div>
              )}
            </section>

            <section aria-labelledby="prog-h" data-tutorial="progress">
              <div className="sp-section-head">
                <h2 id="prog-h" className="sp-section-title">Progress</h2>
              </div>
              <ProgressBlock
                sessions={lifetimeSessions}
                positionAccuracy={positionAccuracy}
                loading={progressBusy}
                signedIn={Boolean(authUser?.id)}
                error={progressError}
                onRetry={retryProgress}
              />
            </section>

            <section id="training-library" aria-labelledby="lib-h" data-tutorial="library">
              <div className="sp-section-head">
                <h2 ref={libraryHeadingRef} id="lib-h" className="sp-section-title" tabIndex={-1}>Browse The Training Library</h2>
                <span className="sp-section-link" aria-live="polite">
                  {filtered.length === TRAINING_LIBRARY.length ? `${TRAINING_LIBRARY.length} games` : `${filtered.length} of ${TRAINING_LIBRARY.length}`}
                </span>
              </div>

              <div className="sp-toolbar" data-tutorial="search">
                <label className="sp-search">
                  <Search size={16} aria-hidden />
                  <input
                    type="search"
                    aria-label="Search Games"
                    placeholder="Search Drills, Spots, Formats…"
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                  />
                </label>
              </div>

              <div className="sp-cat-chips" role="group" aria-label="Game Categories" data-tutorial="categories">
                <CatChip cat="ALL" active={activeCat==='ALL'} onClick={() => setActiveCat('ALL')} count={TRAINING_LIBRARY.length}>
                  <Grid2x2 size={14} aria-hidden /> All
                </CatChip>
                {CATEGORY_ORDER.map(c => {
                  const meta = CATEGORY_META[c];
                  const count = TRAINING_LIBRARY.filter(g => g.category === c).length;
                  return (
                    <CatChip key={c} cat={c} active={activeCat===c} onClick={() => setActiveCat(c)} count={count}>
                      <meta.Icon size={14} aria-hidden style={{ color: meta.color }} /> {meta.label}
                    </CatChip>
                  );
                })}
              </div>

              {filtered.length > 0 ? (
                <div className="sp-grid" data-tutorial="games">
                  {filtered.map(g => (
                    <GameCardNew
                      key={g.id}
                      game={g}
                      progress={getGameProgress?.(g.id)?.completionPercent ?? 0}
                      isRecommended={g.id === jarvisPick?.id}
                      onStart={() => startDrill(g)}
                    />
                  ))}
                </div>
              ) : (
                <div className="sp-empty" role="status">
                  <p>No Drills Match - Try A Different Search.</p>
                  <button
                    type="button"
                    className="sp-cta sp-cta-secondary sp-empty-reset"
                    onClick={resetBrowseFilters}
                  >
                    Reset Browse Filters
                  </button>
                </div>
              )}
            </section>

          </main>
          </PullToRefresh>

        </HubPageShell>
      )}
    </PageTransition>
  );
}

function DrillCard({ game }) {
  if (!game) return null;
  // Render tags only for fields the recommendation/library actually provides.
  const formatTag = [game.format, game.stack].filter(Boolean).join(' · ');
  return (
    <div className="sp-drill-card" role="group" aria-label="Today's recommended drill">
      <div className="sp-drill-cover" aria-hidden>
        <TrainingGameArt
          gameId={game.id}
          loading="eager"
          sizes="(max-width: 720px) 92vw, 128px"
          className="sp-drill-cover-img"
        />
        <Target size={22} className="sp-drill-cover-icon" />
      </div>
      <div className="sp-drill-meta">
        <h2 className="sp-drill-title">{game.name}</h2>
        <div className="sp-drill-tags">
          {formatTag && (
            <span className="sp-tag"><Layers size={12} aria-hidden /> {formatTag}</span>
          )}
          {game.estMinutes != null && (
            <span className="sp-tag"><Clock size={12} aria-hidden /> ~{game.estMinutes} Min</span>
          )}
          {game.handsTarget != null && (
            <span className="sp-tag"><Zap size={12} aria-hidden /> {game.handsTarget} Hands</span>
          )}
        </div>
      </div>
    </div>
  );
}

function DataUnavailable({ title, message, onRetry, alert = true, compact = false }) {
  return (
    <div className={`sp-data-unavailable${compact ? ' sp-data-unavailable-compact' : ''}`} role={alert ? 'alert' : 'status'}>
      <AlertTriangle size={18} aria-hidden />
      <div className="sp-data-unavailable-copy">
        <strong>{title}</strong>
        <span>{message}</span>
      </div>
      {onRetry && (
        <button type="button" className="sp-data-retry" onClick={onRetry}>
          Retry
        </button>
      )}
    </div>
  );
}

function GradeCard({ stats, loading, error, onRetry, signedIn }) {
  if (!signedIn) {
    return (
      <div className="sp-grade-card" aria-label="Training grade requires sign in">
        <div className="sp-grade-text">
          <p className="sp-grade-label">Training Grade Requires Sign In</p>
          <p className="sp-grade-value">Sign In And Finish A Verified Drill To Build Your Grade.</p>
        </div>
      </div>
    );
  }

  if (loading || (!stats && !error)) {
    return (
      <div className="sp-grade-card" aria-label="Loading current GTO grade" aria-busy="true">
        <div className="sp-grade-row">
          <div className="sp-grade-letter sp-num sp-skel-text">·</div>
          <div className="sp-grade-text">
            <p className="sp-grade-label">Current GTO Grade</p>
            <p className="sp-grade-value sp-skel-line" />
            <div className="sp-progress sp-skel-block" />
          </div>
        </div>
      </div>
    );
  }

  if (error || !stats) {
    return (
      <div className="sp-grade-card" aria-label="Training grade temporarily unavailable">
        <DataUnavailable
          title="Training Grade Is Temporarily Unavailable"
          message="Your Verified Grade Could Not Be Loaded."
          onRetry={onRetry}
          compact
        />
      </div>
    );
  }

  const grade    = stats.current_grade || '-';
  const next     = stats.next_grade;
  const accuracy = stats.rolling_accuracy_pct;
  const hands    = stats.rolling_total;
  const delta    = stats.delta_correct_to_next;
  const pct      = Math.max(0, Math.min(100, accuracy));
  const hasData  = hands > 0;

  return (
    <div className="sp-grade-card" aria-label="Current GTO grade">
      <div className="sp-grade-row">
        <div className="sp-grade-letter sp-num">{grade}</div>
        <div className="sp-grade-text">
          <p className="sp-grade-label">{hasData ? 'Current GTO grade' : 'No graded sessions yet'}</p>
          <p className="sp-grade-value">
            {hasData
              ? `${accuracy}% accuracy · ${hands.toLocaleString()} hands (30d)`
              : 'Finish a drill to start your grade.'}
          </p>
          <div className="sp-progress" role="progressbar" aria-label="Thirty Day GTO Accuracy" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
            <div className="sp-progress-fill" style={{ width: `${pct}%` }} />
          </div>
          {hasData && next && delta && (
            <div className="sp-grade-meta">
              <span>{grade}</span>
              <span>{delta} {delta === 1 ? 'correct hand' : 'correct hands'} To {next}</span>
              <span>{next}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Stat({ icon: Icon, label, value, unit, trend, sub, loading }) {
  if (loading) {
    return (
      <div className="sp-stat" aria-busy="true">
        <div className="sp-stat-label"><Icon size={13} aria-hidden /> {label}</div>
        <div className="sp-stat-value sp-num sp-skel-text">·</div>
      </div>
    );
  }
  const isUp = typeof trend === 'string' && trend.startsWith('+');
  const hasValue = value !== null && value !== undefined && value !== '';
  return (
    <div className="sp-stat">
      <div className="sp-stat-label"><Icon size={13} aria-hidden /> {label}</div>
      <div className="sp-stat-value sp-num">
        {hasValue ? value : '-'}
        {hasValue && unit && <span className="sp-stat-unit">{unit}</span>}
      </div>
      {trend && (
        <div className={`sp-stat-trend ${isUp ? 'sp-up' : 'sp-down'}`}>
          <TrendingUp size={12} aria-hidden /> {trend}
        </div>
      )}
      {sub && <div className="sp-stat-sub">{sub}</div>}
    </div>
  );
}

/**
 * Real-data hero headline · never fabricates progression.
 * Shape:
 *   1) recommendation loaded + grade data exists → "<delta> correct hands away from <next>."
 *   2) recommendation loaded + no graded data    → "Ready to start training? Run your first drill."
 *   3) loading                                    → "Loading your daily plan…"
 *   4) no recommendation                          → "Browse the library to pick your first drill."
 */
function renderHeroHeadline({ authUser, stats, statsError, jarvisPick, statsLoading, recommendationLoading }) {
  const greet = authUser
    ? `Welcome Back${authUser?.name ? `, ${authUser.name}` : ''}.`
    : 'Build Better Decisions, One Hand At A Time.';
  if (statsLoading || recommendationLoading || (authUser && !stats && !statsError)) {
    return <>{greet} Loading Your Daily Plan…</>;
  }
  if (authUser && (statsError || !stats)) {
    return <>{greet} Your Training Summary Is Temporarily Unavailable.</>;
  }
  const hasGradeData = Number(stats?.rolling_total) > 0;
  const delta = stats?.delta_correct_to_next;
  const nextGrade = stats?.next_grade;
  if (jarvisPick && hasGradeData && delta != null && nextGrade) {
    const noun = delta === 1 ? 'correct hand' : 'correct hands';
    return <>{greet} <em>{delta} {noun}</em> Away From Grade {nextGrade}.</>;
  }
  if (jarvisPick && !hasGradeData) {
    return <>{greet} Ready To Start Training?</>;
  }
  if (!jarvisPick) {
    return <>{greet} Browse The Library To Start Your First Drill.</>;
  }
  return <>{greet}</>;
}

function CatChip({ children, active, onClick, count }) {
  return (
    <button className="sp-cat-chip" aria-pressed={active} onClick={onClick}>
      {children} <span className="sp-cat-count">{count}</span>
    </button>
  );
}

function Sparkline({ data }) {
  if (!data?.length) return null;
  return (
    <div className="sp-spark" aria-hidden>
      {data.map((d, i) => (
        <span key={i} className={d.miss ? 'sp-spark-miss' : ''} style={{ height: `${Math.max(15, d.value * 100)}%` }} />
      ))}
    </div>
  );
}

function GameCardNew({ game, progress, isRecommended, onStart }) {
  const meta = CATEGORY_META[game.category] || CATEGORY_META.MTT;
  const Icon = meta.Icon;
  const tag  = isRecommended ? 'recommended'
              : progress >= 100 ? 'mastered'
              : progress === 0  ? 'new'
              : null;
  return (
    <button
      className="sp-card"
      data-category={game.category.toLowerCase()}
      style={{ '--cat-color': meta.color, '--cover-glow': meta.glow }}
      onClick={onStart}
      aria-label={`${game.name}, ${meta.label}, ${game.estMinutes || 10} minutes, ${progress}% complete`}
    >
      <div className="sp-card-cover">
        <TrainingGameArt
          gameId={game.id}
          loading="lazy"
          sizes="(max-width: 540px) calc(100vw - 24px), (max-width: 1000px) 46vw, 420px"
          className="sp-card-cover-img"
        />
        {/* Shared Smarter.Poker art direction turns every unique game image into
            one coherent dimensional training-console surface. */}
        <div className="sp-card-cover-shade" aria-hidden />
        <picture>
          <source type="image/avif" srcSet="/images/training/training-card-hud-overlay.avif" />
          <source type="image/webp" srcSet="/images/training/training-card-hud-overlay.webp" />
          <img
            src="/images/training/training-card-hud-overlay.png"
            alt=""
            loading="lazy"
            decoding="async"
            className="sp-card-hud"
          />
        </picture>
        <div className="sp-card-badges">
          {tag === 'recommended' && <span className="sp-badge sp-badge-rec"><Sparkles size={11} aria-hidden /> For You</span>}
          {tag === 'mastered'    && <span className="sp-badge sp-badge-mastered"><Check size={11} aria-hidden /> Mastered</span>}
          {tag === 'new'         && <span className="sp-badge sp-badge-new"><Sparkles size={11} aria-hidden /> New</span>}
          {game.locked           && <span className="sp-badge sp-badge-locked"><Lock size={11} aria-hidden /> Locked</span>}
          <span className="sp-cat-pill" aria-hidden><Icon size={12} /></span>
        </div>
        <div className="sp-card-art-code" aria-hidden="true">
          <span>{game.id.toUpperCase()}</span>
          <span>Training Module</span>
        </div>
      </div>
      <div className="sp-card-body">
        <div className="sp-card-cat"><span className="sp-swatch" /> {meta.label}</div>
        <h3 className="sp-card-title">{game.name}</h3>
        <p className="sp-card-focus">{game.focus}</p>
        <div className="sp-card-meta">
          <span><Clock size={12} aria-hidden /> {game.estMinutes || 10} Min</span>
          {game.handsTarget && <><span className="sp-card-sep" aria-hidden /><span><Layers size={12} aria-hidden /> {game.handsTarget} Hands</span></>}
        </div>
        <div className="sp-card-progress">
          <div className="sp-card-progress-head"><span>Training Calibration</span><span>{progress}%</span></div>
          <div className="sp-progress" role="progressbar" aria-label={`${game.name} Training Calibration`} aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
            <div className="sp-progress-fill" style={{ width: `${progress}%` }} />
          </div>
        </div>
        <div className="sp-card-launch"><span>Enter Training Arena</span><ArrowRight size={14} aria-hidden /></div>
      </div>
    </button>
  );
}

function ArenaSkeleton() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', color: 'var(--sp-ink-2, #94a3b8)' }}>
      <div style={{ textAlign: 'center' }}>
        <div className="sp-spin" />
        <div style={{ marginTop: 12 }}>Loading Arena…</div>
      </div>
    </div>
  );
}

/**
 * ProgressBlock · compact lifetime progress: signed GTOW score sparkline
 * across recent sessions, lifetime accuracy by position, and a sessions
 * list (date · game · score · accuracy · EV loss). All values come from
 * /api/training/get-sessions and /api/training/analytics; scores are
 * score_scale-normalized server-side (gtow_score_signed, -100..+100).
 */
function ProgressBlock({ sessions, positionAccuracy, loading, signedIn, error, onRetry }) {
  if (!signedIn) {
    return (
      <div className="sp-progress sp-progress-blank">
        <span className="sp-progress-note">Sign In And Finish A Drill To Start Building Your Progress History.</span>
      </div>
    );
  }
  if (loading || (!error && (sessions === null || positionAccuracy === null))) {
    return <div className="sp-progress" aria-busy="true"><span className="sp-progress-note">Loading Progress…</span></div>;
  }
  if (error || !Array.isArray(sessions) || !isRecord(positionAccuracy)) {
    return (
      <DataUnavailable
        title="Progress History Is Temporarily Unavailable"
        message="We Could Not Verify Your Sessions And Position Analytics. No Empty-History Result Is Assumed."
        onRetry={onRetry}
      />
    );
  }
  const rows = sessions;
  if (rows.length === 0) {
    return (
      <div className="sp-progress sp-progress-blank">
        <span className="sp-progress-note">No Sessions Yet - Finish A Drill And Your Score Trend, Position Accuracy And History Will Build Here.</span>
      </div>
    );
  }

  const signedScore = (r) => {
    const raw = r?.gtow_score_signed;
    if (raw === null || raw === undefined || raw === '') return null;
    const value = Number(raw);
    return Number.isFinite(value) ? value : null;
  };

  // rows arrive newest-first; sparkline reads left → right chronologically
  const scoreRows = rows.filter((row) => signedScore(row) !== null);
  const chrono = [...scoreRows].reverse();
  const sparkData = chrono.map(r => ({
    value: Math.max(0, Math.min(1, (signedScore(r) + 100) / 200)),
    miss: r.level_passed === false,
  }));

  const POS_ORDER = ['UTG', 'MP', 'CO', 'BTN', 'SB', 'BB'];
  const posRows = POS_ORDER
    .map(pos => ({ pos, ...(positionAccuracy?.[pos] || {}) }))
    .filter(r => (r.total || 0) > 0);

  const barColor = (acc) => acc >= 75 ? 'var(--sp-good)' : acc >= 55 ? 'var(--sp-warn)' : 'var(--sp-bad)';
  const fmtScore = (v) => {
    if (v === null) return '-';
    const n = Math.round(v);
    return n > 0 ? `+${n}` : `${n}`;
  };

  return (
    <div className="sp-progress">
      <div className="sp-progress-grid">
        <div>
          <div className="sp-progress-label">Verified Signed Score · Last {chrono.length} Sessions</div>
          {sparkData.length > 0 ? <Sparkline data={sparkData} /> : <div className="sp-progress-note">No Verified Signed Scores Recorded Yet.</div>}
          <div className="sp-progress-meta">
            Latest <b className="sp-num">{scoreRows.length > 0 ? fmtScore(signedScore(scoreRows[0])) : '-'}</b>
            {scoreRows[0]?.created_at ? ` · ${new Date(scoreRows[0].created_at).toLocaleDateString()}` : ''}
          </div>
        </div>
        <div>
          <div className="sp-progress-label">Accuracy By Position · Lifetime</div>
          {posRows.length === 0 ? (
            <div className="sp-progress-note">No Per-Position Data Recorded Yet.</div>
          ) : posRows.map(r => {
            const acc = r.total > 0 ? Math.round((r.correct / r.total) * 100) : 0;
            return (
              <div key={r.pos} className="sp-prow">
                <span className="sp-prow-pos">{r.pos}</span>
                <span className="sp-prow-track"><span className="sp-prow-fill" style={{ width: `${acc}%`, background: barColor(acc) }} /></span>
                <span className="sp-prow-val sp-num">{acc}%</span>
                <span className="sp-prow-n">{r.total}</span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="sp-progress-label" style={{ marginTop: 14 }}>Recent Sessions</div>
      <ul className="sp-plist">
        {rows.slice(0, 6).map((r, i) => {
          const score = signedScore(r);
          const measuredEv = (Number(r.measured_ev_decisions) || 0) > 0
            && r.total_ev_loss !== null
            && r.total_ev_loss !== undefined
            && Number.isFinite(Number(r.total_ev_loss))
            ? Number(r.total_ev_loss)
            : null;
          return (
          <li key={r.id || i} className="sp-plist-row">
            <span className="sp-plist-date">{r.created_at ? new Date(r.created_at).toLocaleDateString() : '-'}</span>
            <span className="sp-plist-game">{r.game_name || r.game_id || 'Training'}</span>
            <span className="sp-plist-score sp-num" style={{ color: score === null ? 'var(--sp-fg-faint)' : score >= 50 ? 'var(--sp-good)' : score >= 0 ? 'var(--sp-warn)' : 'var(--sp-bad)' }}>
              {fmtScore(score)}
            </span>
            <span className="sp-plist-acc sp-num">{r.accuracy != null ? `${Math.round(r.accuracy)}%` : '-'}</span>
            <span className="sp-plist-ev sp-num">{measuredEv === null ? 'EV -' : `${measuredEv.toFixed(3)} BB EV`}</span>
          </li>
          );
        })}
      </ul>
    </div>
  );
}

function leakPriority(leak) {
  const occurrenceCount = Number(leak?.occurrence_count ?? leak?.total_samples ?? 0) || 0;
  const evLoss = leak?.ev_loss_measured ? Math.abs(Number(leak?.avg_ev_loss_bb) || 0) : 0;
  const errorRateRaw = Number(leak?.error_rate);
  const errorRate = Number.isFinite(errorRateRaw)
    ? (errorRateRaw <= 1 ? errorRateRaw : errorRateRaw / 100)
    : 0;
  return evLoss > 0 ? evLoss * Math.max(occurrenceCount, 1) : errorRate * Math.max(occurrenceCount, 1);
}

function normalizeActiveLeak(leak) {
  if (!leak || typeof leak !== 'object') return null;
  const drillId = String(leak.recommended_drill || '').trim().toLowerCase();
  const recommendedGame = TRAINING_LIBRARY.find(game => game.id.toLowerCase() === drillId) || null;
  const sampleRaw = Number(leak.total_samples ?? leak.occurrence_count);
  const errorRateRaw = Number(leak.error_rate);
  const errorRatePct = Number.isFinite(errorRateRaw)
    ? Math.round((errorRateRaw <= 1 ? errorRateRaw * 100 : errorRateRaw) * 10) / 10
    : null;
  return {
    id: leak.id || leak.leak_type || leak.leak_name,
    name: leak.leak_name || leak.leak_type || 'Training Pattern',
    spotLabel: leak.situation_class || leak.leak_category || null,
    explanation: leak.why_leaking_ev || leak.explanation || null,
    sampleCount: Number.isFinite(sampleRaw) && sampleRaw > 0 ? Math.round(sampleRaw) : null,
    errorRatePct: Number.isFinite(errorRatePct) ? Math.max(0, Math.min(100, errorRatePct)) : null,
    recommendedGame,
  };
}

/**
 * useActiveTrainingLeak · authenticated leak lifecycle from Supabase.
 * The hub previously called leakAnalyzer.getBiggest?.(), but that method never
 * existed, making the entire feature unreachable. This hook only displays
 * persisted evidence and never invents an EV rate, sample, grade, or drill.
 */
function useActiveTrainingLeak(authUser) {
  const [biggestLeak, setBiggestLeak] = useState(null);

  useEffect(() => {
    let cancelled = false;
    if (!authUser?.id) {
      setBiggestLeak(null);
      return () => { cancelled = true; };
    }

    leakService.getActiveLeaks(authUser.id)
      .then((rows) => {
        if (cancelled) return;
        const activeRows = (Array.isArray(rows) ? rows : [])
          .filter(row => row && row.is_active !== false && !row.resolved_at)
          .sort((a, b) => leakPriority(b) - leakPriority(a));
        setBiggestLeak(normalizeActiveLeak(activeRows[0]));
      })
      .catch((error) => {
        if (!cancelled) {
          setBiggestLeak(null);
          console.warn('[Training] active leaks fetch failed:', error?.message || error);
        }
      });

    return () => { cancelled = true; };
  }, [authUser?.id]);

  return biggestLeak;
}

/**
 * useLifetimeProgress · recent training_sessions rows (score_scale
 * normalized server-side) + lifetime position accuracy from
 * training_answers via /api/training/analytics.
 */
function useLifetimeProgress(authUser) {
  const [lifetimeSessions, setLifetimeSessions] = useState(null);
  const [positionAccuracy, setPositionAccuracy] = useState(null);
  const [progressLoading, setProgressLoading] = useState(true);
  const [progressError, setProgressError] = useState(null);
  const [progressRetryToken, setProgressRetryToken] = useState(0);
  const retryProgress = useCallback(() => setProgressRetryToken(token => token + 1), []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!authUser?.id) {
        setLifetimeSessions(null);
        setPositionAccuracy(null);
        setProgressError(null);
        setProgressLoading(false);
        return;
      }
      setProgressLoading(true);
      setProgressError(null);
      setLifetimeSessions(null);
      setPositionAccuracy(null);
      try {
        const [sessionsResponse, analyticsResponse] = await Promise.all([
          authedFetch('/api/training/get-sessions?limit=10'),
          authedFetch('/api/training/analytics?days=365&type=breakdown'),
        ]);
        if (!sessionsResponse.ok) throw new Error(`get-sessions ${sessionsResponse.status}`);
        if (!analyticsResponse.ok) throw new Error(`analytics ${analyticsResponse.status}`);

        const [sessionsJson, analyticsJson] = await Promise.all([
          sessionsResponse.json(),
          analyticsResponse.json(),
        ]);
        if (sessionsJson?.success !== true || !Array.isArray(sessionsJson.sessions)) {
          throw new Error('get-sessions returned an invalid authority response');
        }
        if (analyticsJson?.success !== true || !isRecord(analyticsJson.positionAccuracy)) {
          throw new Error('analytics returned an invalid authority response');
        }
        if (!cancelled) {
          setLifetimeSessions(sessionsJson.sessions);
          setPositionAccuracy(analyticsJson.positionAccuracy);
        }
      } catch (e) {
        if (!cancelled) {
          setLifetimeSessions(null);
          setPositionAccuracy(null);
          setProgressError('Training progress is temporarily unavailable.');
          console.warn('[Training] progress fetch failed:', e?.message || e);
        }
      } finally {
        if (!cancelled) setProgressLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [authUser?.id, progressRetryToken]);

  return { lifetimeSessions, positionAccuracy, progressLoading, progressError, retryProgress };
}

/**
 * useTrainingDashboard · single source of truth for the dashboard surface.
 * Pulls aggregated weekly stats from /api/training/weekly-stats (RPC-backed)
 * and the recommended drill from /api/training/recommendations (Jarvis).
 *
 * Returns { stats, statsLoading, recommendation, recommendationLoading }.
 * No fallback values. When the user has no session history, fields render as
 * empty-state ("·") in the UI so we never show invented numbers.
 */
function useTrainingDashboard(authUser) {
  const [stats, setStats] = useState(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [statsError, setStatsError] = useState(null);
  const [statsRetryToken, setStatsRetryToken] = useState(0);
  const [recommendation, setRecommendation] = useState(null);
  const [recommendationLoading, setRecommendationLoading] = useState(true);
  const retryStats = useCallback(() => setStatsRetryToken(token => token + 1), []);

  useEffect(() => {
    let cancelled = false;
    async function loadStats() {
      if (!authUser?.id) {
        setStats(null);
        setStatsError(null);
        setStatsLoading(false);
        return;
      }
      setStats(null);
      setStatsError(null);
      setStatsLoading(true);
      try {
        const r = await authedFetch('/api/training/weekly-stats');
        if (!r.ok) throw new Error(`weekly-stats ${r.status}`);
        const json = await r.json();
        const authoritativeStats = json?.success === true
          ? normalizeAuthoritativeWeeklyStats(json.stats)
          : null;
        if (!authoritativeStats) throw new Error('weekly-stats returned an invalid authority response');
        if (!cancelled) setStats(authoritativeStats);
      } catch (e) {
        if (!cancelled) {
          setStats(null);
          setStatsError('Weekly training statistics are temporarily unavailable.');
          console.warn('[Training] weekly-stats fetch failed:', e?.message || e);
        }
      } finally {
        if (!cancelled) setStatsLoading(false);
      }
    }
    loadStats();
    return () => { cancelled = true; };
  }, [authUser?.id, statsRetryToken]);

  useEffect(() => {
    let cancelled = false;
    async function loadRecommendation() {
      if (!authUser?.id) {
        setRecommendation(null);
        setRecommendationLoading(false);
        return;
      }
      setRecommendation(null);
      setRecommendationLoading(true);
      try {
        const r = await authedFetch('/api/training/recommendations');
        if (!r.ok) throw new Error(`recommendations ${r.status}`);
        const json = await r.json();
        const recs = json?.recommendations || json?.games || json?.data || [];
        if (!cancelled && recs.length) {
          // Hydrate the API result with the matching catalog entry so we get
          // canonical name, category, image, and minutes/hands targets.
          const top = recs[0];
          const recId = top.game_id || top.id;
          const fromLib = TRAINING_LIBRARY.find(g => g.id === recId) || null;
          setRecommendation({
            id: recId,
            name: fromLib?.name || top.name || top.game_name || 'Recommended drill',
            category: fromLib?.category || top.category || 'MTT',
            estMinutes: fromLib?.estMinutes || top.estMinutes || 10,
            handsTarget: fromLib?.handsTarget || top.handsTarget || 20,
            format: fromLib?.format || top.format,
            stack: fromLib?.stack || top.stack,
            reason: top.reason || top.why,
          });
        }
      } catch (e) {
        if (!cancelled) console.warn('[Training] recommendations fetch failed:', e?.message || e);
      } finally {
        if (!cancelled) setRecommendationLoading(false);
      }
    }
    loadRecommendation();
    return () => { cancelled = true; };
  }, [authUser?.id]);

  return { stats, statsLoading, statsError, retryStats, recommendation, recommendationLoading };
}

/** Format a week-over-week trend string from raw values. */
function fmtTrend(curr, prev, unit = '') {
  if (curr == null || prev == null) return null;
  if (prev === 0 && curr === 0) return null;
  if (prev === 0) return `+${curr}${unit} (new)`;
  const delta = curr - prev;
  const sign = delta >= 0 ? '+' : '';
  return `${sign}${Math.round(delta * 10) / 10}${unit} vs last`;
}

function GlobalStyle() {
  return (
    <style jsx global>{`
      .sp-skip { position: absolute; left: -9999px; }
      .sp-skip:focus { left: 16px; top: 16px; padding: 10px 14px; background: var(--sp-primary); color: var(--sp-primary-ink); border-radius: var(--sp-r-md); z-index: 1000; }
      .sp-num { font-family: var(--font-orbitron), 'Orbitron', ui-monospace, monospace; font-feature-settings: 'tnum'; letter-spacing: 0.5px; }
      /* 2026-07-26 · VERIFIED ON SCREEN. Orbitron's zero is a squared glyph with
         a diagonal slash. At the 22px stat size it reads as a missing-glyph box,
         so a dashboard of zeroes looked like four broken tiles -- this was the
         "boxes" defect reported against the training dashboard. It was never a
         font-loading failure: Orbitron loads fine and document.fonts.check()
         passes for digits. Data numerals therefore use Inter with tabular
         figures
      /* 2026-07-26 · VERIFIED ON SCREEN. Orbitron's zero is a squared glyph with
         a diagonal slash. At the 22px stat size it reads as a missing-glyph box,
         so a dashboard of zeroes looked like four broken tiles -- this was the
         "boxes" defect reported against the training dashboard. It was never a
         font-loading failure: Orbitron loads fine and document.fonts.check()
         passes for digits. Data numerals therefore use Inter with tabular
         figures; Orbitron stays on the display numerals (.sp-grade-letter),
         where it is large enough to read as deliberate. */
      .sp-stat-value.sp-num { font-family: var(--font-inter), 'Inter', system-ui, sans-serif; font-variant-numeric: tabular-nums; letter-spacing: 0; }
      .sp-stat-unit { margin-left: 4px; }

      .sp-main {
        max-width: 1280px; margin: 0 auto; padding: 24px 20px 120px;
        background:
          radial-gradient(60% 60% at 80% -10%, rgba(0,212,255,0.10), transparent 60%),
          radial-gradient(50% 50% at 0% 30%, rgba(192,132,252,0.08), transparent 60%);
      }
      @media (max-width: 768px) { .sp-main { padding: 16px 16px 110px; } }
      .sp-main > section + section { margin-top: 32px; }

      .sp-section-head { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; margin-bottom: 14px; }
      .sp-section-title { font-size: 18px; font-weight: 600; letter-spacing: -0.2px; margin: 0; color: var(--sp-ink-0); }
      .sp-section-link { display: inline-flex; align-items: center; gap: 4px; font-size: 13px; color: var(--sp-ink-2); padding: 6px 8px; border-radius: 8px; min-height: 32px; }
      .sp-section-link:hover { color: var(--sp-ink-0); background: rgba(255,255,255,0.04); }

      .sp-hero {
        border-radius: var(--sp-r-lg);
        background:
          radial-gradient(80% 100% at 100% 0%, rgba(0,212,255,0.10), transparent 60%),
          linear-gradient(180deg, rgba(255,255,255,0.05), rgba(255,255,255,0.02));
        border: 1px solid var(--sp-line);
        padding: 24px;
        display: grid; gap: 24px; grid-template-columns: 1.2fr 1fr; align-items: center;
      }
      @media (max-width: 900px) { .sp-hero { grid-template-columns: 1fr; padding: 20px; } }
      .sp-hero-eyebrow { font-size: 12px; color: var(--sp-ink-2); margin: 0 0 8px; display: flex; align-items: center; gap: 6px; }
      .sp-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--sp-good); box-shadow: 0 0 0 4px rgba(34,197,94,0.18); }
      .sp-hero-title { font-size: 26px; font-weight: 600; line-height: 1.25; letter-spacing: -0.4px; margin: 0 0 6px; color: var(--sp-ink-0); }
      .sp-hero-title em { font-style: normal; color: var(--sp-primary); }
      .sp-hero-sub { color: var(--sp-ink-2); font-size: 14px; margin: 0 0 18px; line-height: 1.55; max-width: 46ch; }

      .sp-drill-card { display: flex; align-items: center; gap: 16px; padding: 14px; border-radius: var(--sp-r-md); background: rgba(255,255,255,0.03); border: 1px solid var(--sp-line); margin-bottom: 16px; }
      .sp-drill-cover { flex: 0 0 64px; height: 64px; border-radius: 10px; background: linear-gradient(135deg, #1e293b, #0f172a); border: 1px solid var(--sp-line-2); display: grid; place-items: center; position: relative; overflow: hidden; color: var(--sp-primary); }
      .sp-drill-cover-img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
      .sp-drill-cover-icon { position: relative; z-index: 1; color: #fff; opacity: 0.92; filter: drop-shadow(0 1px 2px rgba(0,0,0,0.6)); }
      .sp-drill-cover::after { content: ''; position: absolute; inset: 0; background: radial-gradient(circle at 30% 20%, rgba(0,212,255,0.25), transparent 60%), linear-gradient(180deg, rgba(0,0,0,0) 30%, rgba(0,0,0,0.45) 100%); pointer-events: none; z-index: 1; }
      .sp-drill-meta { min-width: 0; flex: 1; }
      .sp-drill-title { font-size: 15px; font-weight: 500; margin: 0 0 4px; color: var(--sp-ink-0); }
      .sp-drill-tags { display: flex; gap: 6px; flex-wrap: wrap; font-size: 12px; color: var(--sp-ink-2); }
      .sp-tag { display: inline-flex; align-items: center; gap: 4px; padding: 3px 8px; border-radius: 9999px; background: rgba(255,255,255,0.04); border: 1px solid var(--sp-line); color: var(--sp-ink-1); }

      .sp-cta-row { display: flex; gap: 10px; flex-wrap: wrap; }
      .sp-cta { display: inline-flex; align-items: center; justify-content: center; gap: 8px; padding: 0 22px; min-height: 48px; border-radius: 9999px; font-size: 15px; font-weight: 500; cursor: pointer; border: 0; transition: transform .12s ease, background .15s ease, box-shadow .15s ease; -webkit-tap-highlight-color: transparent; }
      .sp-cta-primary { background: var(--sp-primary); color: var(--sp-primary-ink); box-shadow: 0 1px 0 rgba(255,255,255,0.25) inset, 0 6px 20px -8px rgba(0,212,255,0.6); }
      .sp-cta-primary:hover { transform: translateY(-1px); }
      .sp-cta-secondary { background: rgba(255,255,255,0.04); color: var(--sp-ink-0); border: 1px solid var(--sp-line-2); }
      .sp-cta-secondary:hover { background: rgba(255,255,255,0.08); }
      .sp-cta-warn { border-color: rgba(245,158,11,0.4); color: var(--sp-warn); }
      .sp-cta:focus-visible { outline: 2px solid var(--sp-primary); outline-offset: 2px; }

      .sp-grade-card { background: rgba(255,255,255,0.03); border: 1px solid var(--sp-line); border-radius: var(--sp-r-md); padding: 18px; }
      .sp-grade-row { display: flex; align-items: center; gap: 18px; }
      .sp-grade-letter { font-family: var(--font-orbitron), 'Orbitron', ui-monospace, monospace; font-weight: 800; font-size: 56px; line-height: 1; color: var(--sp-good); width: 72px; text-align: center; }
      .sp-grade-text { flex: 1; min-width: 0; }
      .sp-grade-label { font-size: 12px; color: var(--sp-ink-2); margin: 0 0 2px; }
      .sp-grade-value { font-size: 14px; color: var(--sp-ink-1); margin: 0 0 10px; }
      .sp-progress { height: 6px; border-radius: 999px; background: rgba(255,255,255,0.06); overflow: hidden; }
      .sp-progress-fill { height: 100%; background: linear-gradient(90deg, var(--sp-good), var(--sp-primary)); border-radius: 999px; }
      .sp-grade-meta { display: flex; justify-content: space-between; gap: 8px; font-size: 12px; color: var(--sp-ink-3); margin-top: 6px; }

      /* Loading skeletons · avoid layout shift while real data loads */
      .sp-skel-text { color: transparent; background: linear-gradient(90deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.10) 50%, rgba(255,255,255,0.04) 100%); background-size: 200% 100%; animation: sp-shimmer 1.4s ease-in-out infinite; border-radius: 6px; }
      .sp-skel-line { height: 14px; margin: 2px 0 10px; background: linear-gradient(90deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.10) 50%, rgba(255,255,255,0.04) 100%); background-size: 200% 100%; animation: sp-shimmer 1.4s ease-in-out infinite; border-radius: 6px; width: 70%; }
      .sp-skel-block { height: 6px; background: linear-gradient(90deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.10) 50%, rgba(255,255,255,0.04) 100%); background-size: 200% 100%; animation: sp-shimmer 1.4s ease-in-out infinite; border-radius: 999px; }
      @keyframes sp-shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }

      .sp-leak { border-radius: var(--sp-r-lg); border: 1px solid rgba(245,158,11,0.30); background: linear-gradient(180deg, rgba(245,158,11,0.06), rgba(245,158,11,0.02)); padding: 18px 20px; display: grid; grid-template-columns: 1fr auto; gap: 16px; align-items: center; }
      @media (max-width: 768px) { .sp-leak { grid-template-columns: 1fr; } }
      .sp-leak-eyebrow { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 600; color: var(--sp-warn); padding: 4px 10px; border-radius: 9999px; background: rgba(245,158,11,0.10); border: 1px solid rgba(245,158,11,0.25); }
      .sp-leak-title { font-size: 17px; font-weight: 600; margin: 8px 0 6px; letter-spacing: -0.2px; color: var(--sp-ink-0); }
      .sp-leak-body { font-size: 14px; color: var(--sp-ink-1); margin: 0; line-height: 1.5; }
      .sp-leak-body b { color: var(--sp-warn); font-weight: 500; }
      .sp-spark { display: flex; align-items: flex-end; gap: 3px; height: 32px; margin-top: 8px; }
      .sp-spark span { display: block; width: 10px; border-radius: 2px; background: rgba(245,158,11,0.4); }
      .sp-spark span.sp-spark-miss { background: var(--sp-bad); }

      .sp-progress { background: rgba(255,255,255,0.03); border: 1px solid var(--sp-line); border-radius: var(--sp-r-md); padding: 16px; }
      .sp-progress-blank { border-style: dashed; text-align: center; padding: 32px 16px; }
      .sp-progress-note { color: var(--sp-ink-2); font-size: 13px; }
      .sp-progress-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
      @media (max-width: 768px) { .sp-progress-grid { grid-template-columns: 1fr; } }
      .sp-progress-label { font-size: 12px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: var(--sp-ink-3); margin-bottom: 8px; }
      .sp-progress-meta { margin-top: 6px; font-size: 12px; color: var(--sp-ink-2); }
      .sp-progress-meta b { color: var(--sp-ink-0); }
      .sp-prow { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
      .sp-prow-pos { width: 32px; flex-shrink: 0; font-size: 12px; font-weight: 700; color: var(--sp-ink-1); }
      .sp-prow-track { flex: 1; height: 6px; border-radius: 3px; background: rgba(255,255,255,0.05); overflow: hidden; }
      .sp-prow-fill { display: block; height: 100%; border-radius: 3px; }
      .sp-prow-val { width: 38px; text-align: right; font-size: 12px; font-weight: 700; color: var(--sp-ink-0); }
      .sp-prow-n { width: 34px; text-align: right; font-size: 12px; color: var(--sp-ink-3); }
      .sp-plist { list-style: none; margin: 0; padding: 0; }
      .sp-plist-row { display: flex; align-items: center; gap: 10px; padding: 7px 2px; border-bottom: 1px solid var(--sp-line); font-size: 12px; }
      .sp-plist-row:last-child { border-bottom: none; }
      .sp-plist-date { width: 78px; flex-shrink: 0; color: var(--sp-ink-3); font-size: 12px; }
      .sp-plist-game { flex: 1; color: var(--sp-ink-1); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .sp-plist-score { width: 42px; text-align: right; font-weight: 700; }
      .sp-plist-acc { width: 40px; text-align: right; color: var(--sp-ink-0); }
      .sp-plist-ev { width: 48px; text-align: right; color: var(--sp-bad); }

      .sp-stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }
      @media (max-width: 768px) { .sp-stats { grid-template-columns: repeat(2, 1fr); } }
      .sp-stat { background: rgba(255,255,255,0.03); border: 1px solid var(--sp-line); border-radius: var(--sp-r-md); padding: 14px 16px; }
      .sp-stat-label { display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--sp-ink-2); margin-bottom: 6px; }
      .sp-stat-value { font-size: 22px; font-weight: 600; letter-spacing: -0.5px; line-height: 1.1; color: var(--sp-ink-0); }
      .sp-stat-unit { font-size: 12px; color: var(--sp-ink-2); margin-left: 4px; font-weight: 400; }
      .sp-stat-trend { display: inline-flex; align-items: center; gap: 3px; font-size: 12px; margin-top: 4px; }
      .sp-stat-trend.sp-up { color: var(--sp-good); }
      .sp-stat-trend.sp-down { color: var(--sp-bad); }
      .sp-stat-sub { font-size: 12px; color: var(--sp-ink-3); margin-top: 4px; }

      .sp-data-unavailable {
        display: flex; align-items: center; gap: 12px; min-height: 88px; padding: 16px;
        border: 1px solid rgba(245,158,11,0.34); border-radius: var(--sp-r-md);
        background: linear-gradient(180deg, rgba(245,158,11,0.08), rgba(245,158,11,0.025));
        color: var(--sp-warn);
      }
      .sp-data-unavailable-copy { display: flex; flex: 1; min-width: 0; flex-direction: column; gap: 4px; }
      .sp-data-unavailable-copy strong { color: var(--sp-ink-0); font-size: 13px; }
      .sp-data-unavailable-copy span { color: var(--sp-ink-2); font-size: 12px; line-height: 1.45; }
      .sp-data-unavailable-compact { min-height: 0; padding: 0; border: 0; background: transparent; }
      .sp-data-retry {
        flex: 0 0 auto; min-height: 44px; padding: 0 16px; border: 1px solid rgba(0,212,255,0.45);
        border-radius: var(--sp-r-md); background: rgba(0,212,255,0.1); color: var(--sp-ink-0);
        font: inherit; font-size: 12px; font-weight: 700; cursor: pointer;
      }
      .sp-data-retry:hover { background: rgba(0,212,255,0.18); border-color: var(--sp-primary); }
      .sp-data-retry:focus-visible { outline: 2px solid var(--sp-primary); outline-offset: 2px; }
      @media (max-width: 600px) {
        .sp-data-unavailable { align-items: flex-start; flex-wrap: wrap; }
        .sp-data-retry { width: 100%; }
      }

      .sp-toolbar { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; margin-bottom: 12px; }
      .sp-search { position: relative; flex: 1; min-width: 220px; }
      .sp-search > svg { position: absolute; top: 50%; left: 14px; transform: translateY(-50%); color: var(--sp-ink-2); }
      .sp-search input { width: 100%; min-height: 44px; background: rgba(255,255,255,0.04); border: 1px solid var(--sp-line); border-radius: var(--sp-r-md); padding: 10px 14px 10px 40px; color: var(--sp-ink-0); font-size: 14px; outline: none; transition: border-color .15s, background .15s; }
      .sp-search input::placeholder { color: var(--sp-ink-3); }
      .sp-search input:focus { border-color: var(--sp-primary); background: rgba(0,212,255,0.04); }

      /* MOBILE PHASE 5. Every category is on screen. This row used to scroll
         sideways with its scrollbar suppressed, so half the categories sat
         off the right edge with nothing saying they were there. A wrapping
         row keeps them all visible and costs one extra line.
         (No backticks in this block: it is inside a styled-jsx template
         literal, and one would end the string mid-stylesheet.) */
      .sp-cat-chips { display: flex; flex-wrap: wrap; gap: 8px; padding: 2px 0 14px; }
      .sp-cat-chip { display: inline-flex; align-items: center; gap: 6px; padding: 0 14px; min-height: 44px; flex: 0 1 auto; border-radius: 9999px; background: rgba(255,255,255,0.04); border: 1px solid var(--sp-line); color: var(--sp-ink-1); font-size: 13px; font-weight: 500; cursor: pointer; transition: background .15s, border-color .15s, color .15s; }
      .sp-cat-chip:hover { background: rgba(255,255,255,0.07); }
      .sp-cat-chip[aria-pressed="true"] { background: var(--sp-primary); color: var(--sp-primary-ink); border-color: var(--sp-primary); }
      .sp-cat-chip:focus-visible { outline: 2px solid var(--sp-primary); outline-offset: 2px; }
      .sp-cat-count { color: var(--sp-ink-3); font-size: 12px; margin-left: 2px; }
      .sp-cat-chip[aria-pressed="true"] .sp-cat-count { color: rgba(0,26,34,0.55); }

      .sp-grid { display: grid; gap: 14px; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); }
      @media (max-width: 600px) { .sp-grid { grid-template-columns: 1fr; } }

      .sp-card { position: relative; background: rgba(255,255,255,0.03); border: 1px solid var(--sp-line); border-radius: var(--sp-r-md); overflow: hidden; transition: transform .15s, border-color .15s, background .15s; text-align: left; width: 100%; cursor: pointer; padding: 0; color: inherit; }
      .sp-card:hover { transform: translateY(-2px); border-color: var(--sp-line-2); background: rgba(255,255,255,0.05); }
      .sp-card:focus-visible { outline: 2px solid var(--sp-primary); outline-offset: 2px; }
      .sp-card-cover { aspect-ratio: 16/9; position: relative; overflow: hidden; background: linear-gradient(135deg, #0f172a, #020617); display: block; }
      .sp-card-cover-img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; transition: transform .3s ease, opacity .3s ease; }
      .sp-card:hover .sp-card-cover-img { transform: scale(1.04); }
      .sp-card-cover-shade { position: absolute; inset: 0; background: radial-gradient(70% 90% at 30% 20%, var(--cover-glow, rgba(0,212,255,0.18)), transparent 60%), linear-gradient(180deg, rgba(0,0,0,0.40) 0%, rgba(0,0,0,0) 35%, rgba(0,0,0,0.55) 100%); pointer-events: none; z-index: 1; }
      .sp-card-badges { position: absolute; top: 10px; left: 10px; right: 10px; display: flex; justify-content: space-between; gap: 8px; z-index: 2; align-items: flex-start; }
      .sp-cat-pill { display: inline-flex; align-items: center; justify-content: center; width: 24px; height: 24px; border-radius: 9999px; background: rgba(0,0,0,0.55); backdrop-filter: blur(6px); border: 1px solid var(--sp-line-2); color: var(--cat-color, var(--sp-primary)); flex: 0 0 auto; }
      .sp-badge { display: inline-flex; align-items: center; gap: 4px; padding: 4px 8px; min-height: 22px; border-radius: 9999px; font-size: 12px; font-weight: 500; background: rgba(0,0,0,0.55); backdrop-filter: blur(6px); border: 1px solid var(--sp-line); color: var(--sp-ink-0); }
      .sp-badge-mastered { background: rgba(34,197,94,0.18); border-color: rgba(34,197,94,0.4); color: #BBF7D0; }
      .sp-badge-new      { background: rgba(0,212,255,0.18); border-color: rgba(0,212,255,0.4); color: #BAE6FD; }
      .sp-badge-locked   { background: rgba(100,116,139,0.18); border-color: rgba(100,116,139,0.4); color: var(--sp-ink-2); }
      .sp-badge-rec      { background: rgba(0,212,255,0.18); border-color: rgba(0,212,255,0.4); color: #BAE6FD; }
      .sp-card-body { padding: 14px; }
      .sp-card-cat { display: inline-flex; align-items: center; gap: 5px; font-size: 12px; color: var(--sp-ink-2); margin-bottom: 6px; }
      .sp-swatch { width: 8px; height: 8px; border-radius: 2px; background: var(--cat-color, var(--sp-primary)); }
      .sp-card-title { font-size: 15px; font-weight: 500; margin: 0 0 6px; line-height: 1.35; letter-spacing: -0.1px; color: var(--sp-ink-0); }
      .sp-card-meta { display: flex; align-items: center; gap: 8px; font-size: 12px; color: var(--sp-ink-2); }
      .sp-card-sep { width: 3px; height: 3px; border-radius: 50%; background: var(--sp-ink-3); display: inline-block; }
      .sp-card-progress { margin-top: 10px; }
      .sp-card-progress .sp-progress { height: 4px; }

      .sp-empty { text-align: center; padding: 48px 16px; color: var(--sp-ink-2); font-size: 14px; border: 1px dashed var(--sp-line); border-radius: var(--sp-r-md); }
      .sp-empty p { margin: 0; }
      .sp-empty-reset { min-height: 44px; margin-top: 16px; }

      .sp-spin { width: 32px; height: 32px; border: 3px solid rgba(255,255,255,0.1); border-top-color: var(--sp-primary); border-radius: 50%; animation: sp-spin 1s linear infinite; margin: 0 auto; }
      @keyframes sp-spin { to { transform: rotate(360deg); } }

      /* 2026-08-26 · Smarter.Poker Training Orb visual system.
         Every frame is a complete rectangle. There are deliberately no
         clip-path corners, corner caps, screw boxes, or ornamental pseudo
         elements: depth comes from full-width metallic highlights and shadows. */
      .sp-main {
        max-width: 1360px;
        padding: 20px 28px 128px;
        color: #eef9ff;
        background:
          linear-gradient(rgba(3, 10, 19, .82), rgba(3, 10, 19, .94)),
          url('/circuit-brain-bg.png') center top / cover fixed,
          #030811;
        border-left: 1px solid rgba(103, 220, 255, .24);
        border-right: 1px solid rgba(103, 220, 255, .24);
        box-shadow: 0 0 48px rgba(0, 168, 255, .08) inset;
      }
      .sp-main, .sp-main button, .sp-main input { font-family: var(--font-rajdhani), 'Rajdhani', sans-serif; }
      .sp-main :is(h1, h2, h3, p, span, a, button, input) { text-transform: capitalize; }
      .sp-main > section + section { margin-top: 38px; }

      .sp-section-head {
        min-height: 58px;
        align-items: center;
        margin-bottom: 14px;
        padding: 0 20px;
        border: 1px solid rgba(126, 220, 255, .32);
        border-radius: 0;
        background:
          linear-gradient(180deg, rgba(213, 246, 255, .14) 0, rgba(35, 72, 91, .10) 11%, rgba(3, 11, 19, .92) 46%, rgba(9, 24, 37, .94) 100%);
        box-shadow: inset 0 1px 0 rgba(255,255,255,.34), inset 0 -1px 0 rgba(29,189,255,.22), 0 10px 28px rgba(0,0,0,.28);
      }
      .sp-section-title {
        font-family: var(--font-orbitron), 'Orbitron', sans-serif;
        font-size: 19px;
        font-weight: 600;
        letter-spacing: .02em;
        color: #f4fbff;
        text-shadow: 0 1px 0 #000, 0 0 14px rgba(71, 206, 255, .18);
      }
      .sp-section-link { color: #a8c9dc; letter-spacing: .06em; font-weight: 700; }
      .sp-section-link:hover { color: #fff; background: rgba(66, 203, 255, .08); }

      .sp-hero {
        position: relative;
        isolation: isolate;
        min-height: 610px;
        grid-template-columns: minmax(0, .92fr) minmax(320px, .48fr);
        align-items: end;
        overflow: hidden;
        padding: 54px 50px 44px;
        border: 1px solid rgba(145, 229, 255, .62);
        border-radius: 0;
        background:
          linear-gradient(90deg, rgba(0,5,13,.98) 0%, rgba(0,7,18,.92) 31%, rgba(0,8,23,.28) 58%, rgba(0,7,18,.10) 100%),
          linear-gradient(0deg, rgba(0,7,16,.78), transparent 42%),
          image-set(
            url('/images/training/training-orb-hero.avif') type('image/avif'),
            url('/images/training/training-orb-hero.webp') type('image/webp'),
            url('/images/training/training-orb-hero.png') type('image/png')
          ) 62% center / cover no-repeat;
        box-shadow:
          inset 0 1px 0 rgba(255,255,255,.48),
          inset 0 -2px 0 rgba(27,183,255,.65),
          0 18px 50px rgba(0,0,0,.52),
          0 0 34px rgba(0,146,255,.16);
      }
      .sp-hero-copy { position: relative; z-index: 2; max-width: 620px; align-self: center; }
      .sp-hero-eyebrow {
        width: fit-content;
        margin-bottom: 22px;
        color: #bcecff;
        font-family: var(--font-orbitron), 'Orbitron', sans-serif;
        font-size: 12px;
        font-weight: 700;
        letter-spacing: .18em;
        text-shadow: 0 0 12px rgba(37, 210, 255, .55);
      }
      .sp-dot { width: 7px; height: 7px; background: #5ee8ff; box-shadow: 0 0 13px #16cfff; }
      .sp-hero-title {
        max-width: 720px;
        margin-bottom: 16px;
        font-family: var(--font-orbitron), 'Orbitron', sans-serif;
        font-size: clamp(35px, 4.5vw, 66px);
        font-weight: 500;
        line-height: 1.08;
        letter-spacing: -.035em;
        color: #eff8fc;
        text-shadow: 0 3px 1px #000, 0 0 22px rgba(122,222,255,.22);
      }
      .sp-hero-title em {
        color: #8de9ff;
        background: linear-gradient(180deg, #f6feff 0%, #83e9ff 45%, #167eb4 100%);
        -webkit-background-clip: text;
        background-clip: text;
        -webkit-text-fill-color: transparent;
        filter: drop-shadow(0 0 12px rgba(0,188,255,.38));
      }
      .sp-hero-sub { max-width: 56ch; color: #d6e8f3; font-size: 18px; line-height: 1.48; text-shadow: 0 2px 4px #000; }
      .sp-drill-card {
        max-width: 570px;
        border-radius: 0;
        border-color: rgba(114, 216, 255, .36);
        background: linear-gradient(180deg, rgba(21,51,70,.72), rgba(3,13,23,.88));
        box-shadow: inset 0 1px 0 rgba(255,255,255,.18), 0 12px 24px rgba(0,0,0,.28);
      }
      .sp-drill-cover { border-radius: 0; border-color: rgba(121,222,255,.38); }
      .sp-drill-title { color: #fff; font-size: 17px; font-weight: 700; }
      .sp-tag { border-radius: 0; color: #cfe7f4; background: rgba(3,14,24,.72); border-color: rgba(100,203,245,.22); }
      .sp-cta { border-radius: 0; font-family: var(--font-orbitron), 'Orbitron', sans-serif; font-size: 12px; font-weight: 700; letter-spacing: .025em; }
      .sp-cta-primary {
        color: #021018;
        border: 1px solid #b9f4ff;
        background: linear-gradient(180deg, #dcfbff 0%, #6ce7ff 11%, #0fb8e7 58%, #08729b 100%);
        box-shadow: inset 0 1px 0 #fff, inset 0 -2px 0 #03445f, 0 0 22px rgba(0,195,255,.32), 0 8px 18px rgba(0,0,0,.35);
        text-shadow: 0 1px 0 rgba(255,255,255,.55);
      }
      .sp-cta-secondary {
        color: #e9f8ff;
        border-color: rgba(174, 231, 255, .48);
        background: linear-gradient(180deg, rgba(216,246,255,.22) 0%, rgba(31,63,82,.38) 16%, rgba(4,15,25,.92) 74%, rgba(15,40,56,.92) 100%);
        box-shadow: inset 0 1px 0 rgba(255,255,255,.38), inset 0 -1px 0 rgba(75,193,239,.26), 0 7px 16px rgba(0,0,0,.34);
      }

      .sp-grade-card {
        position: relative;
        z-index: 2;
        border-radius: 0;
        border-color: rgba(134, 225, 255, .5);
        background: linear-gradient(180deg, rgba(202,242,255,.16), rgba(7,20,31,.93) 16%, rgba(2,10,18,.96));
        box-shadow: inset 0 1px 0 rgba(255,255,255,.4), inset 0 -1px 0 rgba(0,173,242,.4), 0 18px 42px rgba(0,0,0,.5);
        backdrop-filter: blur(12px);
      }
      .sp-grade-letter { color: #92ebff; text-shadow: 0 0 20px rgba(0,204,255,.55); }
      .sp-grade-label, .sp-grade-value { color: #d9edf7; }

      .sp-leak, .sp-progress, .sp-stat, .sp-search input, .sp-empty {
        border-radius: 0;
        background: linear-gradient(180deg, rgba(183,232,255,.09), rgba(5,17,28,.94) 18%, rgba(2,10,18,.97));
        border-color: rgba(112,207,245,.28);
        box-shadow: inset 0 1px 0 rgba(255,255,255,.18), inset 0 -1px 0 rgba(26,153,210,.22), 0 12px 24px rgba(0,0,0,.24);
      }
      .sp-stat { min-height: 118px; padding: 20px; }
      .sp-stat-label { color: #9ec6da; font-weight: 700; letter-spacing: .08em; }
      .sp-stat-value { color: #f6fcff; font-size: 28px; text-shadow: 0 0 14px rgba(65,208,255,.2); }
      .sp-progress { height: auto; }
      .sp-grade-card .sp-progress, .sp-card-progress .sp-progress { height: 6px; padding: 0; border: 0; box-shadow: none; background: rgba(97,185,222,.14); }

      .sp-toolbar { margin: 0 0 12px; }
      .sp-search input { min-height: 52px; color: #f3fbff; font-size: 15px; }
      .sp-cat-chips { gap: 7px; padding: 0 0 18px; }
      .sp-cat-chip {
        /* 44px, the global touch floor. This later theme block was 42 and
           won the cascade over both earlier 44s. */
        min-height: 44px;
        border-radius: 0;
        color: #c7e0ec;
        background: linear-gradient(180deg, rgba(201,241,255,.11), rgba(5,16,27,.92));
        border-color: rgba(106,201,241,.26);
        box-shadow: inset 0 1px 0 rgba(255,255,255,.14);
      }
      .sp-cat-chip[aria-pressed="true"] {
        color: #00141d;
        background: linear-gradient(180deg, #d8faff, #35d3f8 48%, #087aa4);
        border-color: #bdf5ff;
        box-shadow: inset 0 1px 0 #fff, 0 0 18px rgba(0,196,255,.26);
      }

      .sp-grid { gap: 20px; grid-template-columns: repeat(3, minmax(0, 1fr)); }
      body.world-training .sp-main .sp-card[data-category] {
        min-height: 454px;
        display: flex;
        flex-direction: column;
        overflow: hidden;
        padding: 0;
        border-radius: 0;
        border: 1px solid rgba(168, 226, 250, .55);
        color: #eef9ff;
        background:
          linear-gradient(90deg, transparent 0, rgba(91,210,255,.16) 18%, transparent 52%) top / 100% 2px no-repeat,
          linear-gradient(180deg, #254253 0, #0b2130 2.5%, #071621 54%, #020a11 100%);
        box-shadow:
          inset 0 1px 0 rgba(255,255,255,.72),
          inset 1px 0 0 rgba(114,215,255,.18),
          inset -1px 0 0 rgba(114,215,255,.12),
          inset 0 -2px 0 rgba(30,172,230,.38),
          0 20px 38px rgba(0,0,0,.54),
          0 0 28px rgba(0,142,220,.1);
      }
      body.world-training .sp-main .sp-card[data-category]:hover {
        transform: translateY(-5px);
        border-color: rgba(195, 242, 255, .9);
        background:
          linear-gradient(90deg, transparent 0, rgba(125,225,255,.34) 32%, transparent 68%) top / 100% 2px no-repeat,
          linear-gradient(180deg, #315367 0, #0d283a 2.5%, #081824 54%, #020a11 100%);
        box-shadow: inset 0 1px 0 #fff, inset 0 -2px 0 rgba(30,192,255,.64), 0 26px 48px rgba(0,0,0,.58), 0 0 38px rgba(0,184,255,.22);
      }
      .sp-card[data-category="mtt"] { --sector-accent: #fb923c; }
      .sp-card[data-category="cash"] { --sector-accent: #4ade80; }
      .sp-card[data-category="spins"] { --sector-accent: #facc15; }
      .sp-card[data-category="psychology"] { --sector-accent: #c084fc; }
      .sp-card[data-category="advanced"] { --sector-accent: #60a5fa; }
      .sp-card-cover {
        aspect-ratio: 16 / 10;
        isolation: isolate;
        border-bottom: 1px solid rgba(154,229,255,.66);
        background: #06101a;
        box-shadow: inset 0 -1px 0 rgba(255,255,255,.28), inset 0 -16px 30px rgba(0,0,0,.6);
      }
      .sp-card-cover-img {
        z-index: 0;
        transform: scale(1.015);
        filter: saturate(.9) contrast(1.16) brightness(.82);
      }
      .sp-card:hover .sp-card-cover-img { transform: scale(1.065); filter: saturate(1.06) contrast(1.18) brightness(.93); }
      .sp-card-cover-shade {
        z-index: 1;
        background:
          radial-gradient(66% 90% at 50% 52%, transparent 34%, rgba(0,8,16,.46) 100%),
          linear-gradient(180deg, rgba(0,4,10,.28), transparent 36%, rgba(0,7,15,.78) 100%),
          linear-gradient(115deg, var(--cover-glow), transparent 45%);
      }
      .sp-card-hud {
        position: absolute;
        z-index: 2;
        inset: -2.6%;
        width: 105.2%;
        height: 105.2%;
        object-fit: fill;
        mix-blend-mode: screen;
        opacity: .88;
        pointer-events: none;
        transform: scale(1.025);
        transform-origin: center;
        filter: saturate(1.18) contrast(1.12) drop-shadow(0 0 7px rgba(26,186,255,.32));
      }
      .sp-card-badges { top: 15px; left: 16px; right: 16px; z-index: 4; }
      .sp-badge, .sp-cat-pill {
        border-radius: 0;
        color: #f1fbff;
        background: linear-gradient(180deg, rgba(43,74,91,.94), rgba(3,14,23,.96));
        border-color: rgba(180,235,255,.62);
        box-shadow: inset 0 1px 0 rgba(255,255,255,.42), 0 5px 12px rgba(0,0,0,.42);
      }
      .sp-card-art-code {
        position: absolute;
        z-index: 4;
        left: 17px;
        right: 17px;
        bottom: 15px;
        display: flex;
        justify-content: space-between;
        gap: 10px;
        color: #d9f7ff;
        font-family: var(--font-orbitron), 'Orbitron', sans-serif;
        font-size: 12px;
        font-weight: 700;
        letter-spacing: .13em;
        text-shadow: 0 1px 2px #000, 0 0 8px rgba(0,184,255,.8);
      }
      .sp-card-art-code span:first-child { color: var(--sector-accent, #6ee7ff); }
      .sp-card-body {
        position: relative;
        flex: 1;
        display: flex;
        flex-direction: column;
        padding: 20px 18px 18px;
        background:
          linear-gradient(90deg, var(--sector-accent, #32d6ff), transparent 52%) top / 100% 2px no-repeat,
          linear-gradient(180deg, rgba(27,61,80,.64), rgba(4,15,24,.98) 22%, #020910 100%);
        box-shadow: inset 0 1px 0 rgba(255,255,255,.16);
      }
      .sp-card-cat { color: #8bdfff; font-family: var(--font-orbitron), 'Orbitron', sans-serif; font-weight: 700; letter-spacing: .12em; }
      .sp-swatch { border-radius: 0; box-shadow: 0 0 10px var(--sector-accent, #32d6ff); }
      .sp-card-title { color: #fff; font-family: var(--font-orbitron), 'Orbitron', sans-serif; font-size: 18px; line-height: 1.3; font-weight: 600; text-shadow: 0 2px 1px #000, 0 0 14px rgba(70,205,255,.12); }
      .sp-card-focus {
        display: -webkit-box;
        min-height: 40px;
        margin: 0 0 10px;
        overflow: hidden;
        color: #bed5e1;
        font-size: 12px;
        line-height: 1.55;
        -webkit-box-orient: vertical;
        -webkit-line-clamp: 2;
      }
      .sp-card-meta { color: #b4cfdd; font-size: 13px; }
      .sp-card-progress { margin-top: auto; padding-top: 18px; }
      .sp-card-progress-head {
        display: flex;
        justify-content: space-between;
        gap: 10px;
        margin-bottom: 6px;
        color: #93b8ca;
        font-family: var(--font-orbitron), 'Orbitron', sans-serif;
        font-size: 12px;
        font-weight: 700;
        letter-spacing: .09em;
      }
      .sp-card-progress-head span:last-child { color: #d9f8ff; }
      .sp-card-progress .sp-progress-fill { background: linear-gradient(90deg, var(--sector-accent, #31d8ff), #d9faff); box-shadow: 0 0 10px var(--sector-accent, #31d8ff); }
      .sp-card-launch {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-top: 14px;
        padding-top: 12px;
        border-top: 1px solid rgba(99,196,235,.2);
        color: #d7f5ff;
        font-family: var(--font-orbitron), 'Orbitron', sans-serif;
        font-size: 12px;
        font-weight: 700;
        letter-spacing: .08em;
      }

      [role="dialog"] .sp-card-lg {
        border-radius: 0;
        border: 1px solid rgba(143,225,255,.52);
        background: linear-gradient(180deg, #173142 0, #07141f 4%, #020912 100%);
        box-shadow: inset 0 1px 0 rgba(255,255,255,.48), inset 0 -1px 0 rgba(28,181,240,.38), 0 24px 80px rgba(0,0,0,.72), 0 0 34px rgba(0,180,255,.15);
      }
      [role="dialog"] .sp-card { min-height: 0; border-radius: 0; }
      [role="dialog"] :is(h2, legend, div, span, button) { text-transform: capitalize; }

      @media (max-width: 900px) {
        .sp-hero { min-height: 570px; grid-template-columns: 1fr; background-position: 58% center; }
        .sp-grade-card { max-width: 520px; }
        .sp-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      }
      @media (max-width: 768px) {
        .sp-main { padding: 12px 12px 110px; }
        .sp-hero { min-height: 640px; padding: 34px 22px 24px; background-position: 64% center; }
        .sp-hero-title { font-size: 38px; }
        .sp-hero-sub { font-size: 16px; }
        .sp-grid { grid-template-columns: 1fr; }
        .sp-section-head { min-height: 54px; padding: 0 14px; }
        .sp-section-title { font-size: 15px; }
      }

      /* Binding frame rule: no clipped, chamfered, rounded, or inset-box
         corners anywhere in the Training Hub surface. */
      .sp-main :is(.sp-hero, .sp-section-head, .sp-drill-card, .sp-drill-cover,
        .sp-grade-card, .sp-leak, .sp-progress, .sp-stat, .sp-search input,
        .sp-cat-chip, .sp-card, .sp-card-cover, .sp-badge, .sp-cat-pill,
        .sp-empty, .sp-cta, .sp-tag) {
        border-radius: 0 !important;
        clip-path: none !important;
      }
      .sp-main .sp-card::before, .sp-main .sp-card::after,
      .sp-main .sp-section-head::before, .sp-main .sp-section-head::after {
        content: none !important;
        display: none !important;
      }

      /* Mobile Training Orb composition · designed as a phone-native poker
         cockpit, not a reduced desktop canvas. The global header is outside
         every selector in this block and remains completely unchanged. */
      @media (max-width: 768px) {
        .sp-main {
          width: 100%;
          padding: 10px 10px calc(104px + env(safe-area-inset-bottom, 0px));
          border-left: 0;
          border-right: 0;
          background:
            linear-gradient(rgba(3, 10, 19, .86), rgba(3, 10, 19, .96)),
            url('/circuit-brain-bg.png') 44% top / auto 900px repeat-y,
            #030811;
        }
        .sp-main > section + section { margin-top: 24px; }

        .sp-hero {
          min-height: 0;
          display: flex;
          flex-direction: column;
          gap: 16px;
          padding: 252px 16px 18px;
          background:
            linear-gradient(180deg, rgba(0, 5, 13, .04) 0, rgba(0, 7, 17, .08) 29%, rgba(0, 8, 18, .82) 42%, rgba(2, 10, 18, .98) 54%, #020a12 100%),
            image-set(
              url('/images/training/training-orb-hero.avif') type('image/avif'),
              url('/images/training/training-orb-hero.webp') type('image/webp'),
              url('/images/training/training-orb-hero.png') type('image/png')
            ) 67% top / auto 360px no-repeat,
            #020a12;
          box-shadow:
            inset 0 1px 0 rgba(255,255,255,.4),
            inset 0 -2px 0 rgba(27,183,255,.55),
            0 12px 32px rgba(0,0,0,.5);
        }
        .sp-hero-copy { width: 100%; max-width: none; align-self: stretch; }
        .sp-hero-eyebrow {
          margin: 0 0 11px;
          font-size: 12px;
          line-height: 1.4;
          letter-spacing: .14em;
        }
        .sp-hero-title {
          margin: 0 0 10px;
          font-size: clamp(28px, 8.25vw, 34px);
          line-height: 1.08;
          letter-spacing: -.04em;
          text-wrap: balance;
        }
        .sp-hero-sub {
          margin: 0 0 16px;
          max-width: none;
          font-size: 15px;
          line-height: 1.45;
          color: #cce3ee;
        }
        .sp-drill-card {
          width: 100%;
          gap: 11px;
          padding: 10px;
          margin-bottom: 12px;
        }
        .sp-drill-cover { flex-basis: 54px; height: 54px; }
        .sp-drill-title { font-size: 15px; }
        .sp-drill-tags { gap: 4px; }
        .sp-tag { padding: 3px 6px; font-size: 12px; }
        .sp-cta-row {
          display: grid;
          grid-template-columns: 1fr;
          gap: 9px;
          width: 100%;
        }
        .sp-cta {
          width: 100%;
          min-height: 50px;
          padding: 0 14px;
          font-size: 12px;
        }
        .sp-grade-card {
          width: 100%;
          padding: 14px;
          margin-top: 0;
          backdrop-filter: none;
        }
        .sp-grade-row { gap: 12px; }
        .sp-grade-letter { width: 52px; font-size: 42px; }
        .sp-grade-label { font-size: 12px; }
        .sp-grade-value { font-size: 12px; line-height: 1.35; }

        .sp-section-head {
          min-height: 50px;
          padding: 0 12px;
          margin-bottom: 10px;
          gap: 8px;
        }
        .sp-section-title {
          min-width: 0;
          overflow: hidden;
          font-size: 14px;
          line-height: 1.2;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .sp-section-link {
          flex: 0 0 auto;
          min-height: 40px;
          padding: 5px 2px 5px 8px;
          font-size: 12px;
          letter-spacing: .04em;
        }
        #training-library .sp-section-head { align-items: center; }
        #training-library .sp-section-title {
          flex: 1 1 auto;
          overflow: visible;
          font-size: 13px;
          line-height: 1.25;
          text-overflow: clip;
          white-space: normal;
        }

        .sp-stats { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
        .sp-stat { min-height: 102px; padding: 13px; }
        .sp-stat-label { margin-bottom: 7px; font-size: 12px; letter-spacing: .05em; }
        .sp-stat-value { font-size: 23px; }
        .sp-stat-trend, .sp-stat-sub { font-size: 12px; line-height: 1.3; }

        .sp-progress { padding: 12px; }
        .sp-progress-grid { gap: 16px; }
        .sp-progress-label { font-size: 12px; line-height: 1.35; }
        .sp-plist-row {
          display: grid;
          grid-template-columns: minmax(0, 1fr) 38px 36px;
          gap: 8px;
          padding: 9px 1px;
        }
        .sp-plist-date, .sp-plist-ev { display: none; }
        .sp-plist-game, .sp-plist-score, .sp-plist-acc { width: auto; }

        .sp-toolbar { margin-bottom: 8px; }
        .sp-search { min-width: 0; }
        .sp-search input {
          min-height: 50px;
          padding-left: 42px;
          font-size: 14px;
        }
        .sp-cat-chips {
          gap: 7px;
          padding: 2px 0 14px;
        }
        .sp-cat-chip {
          min-height: 44px;
          padding: 0 13px;
          font-size: 12px;
        }

        .sp-grid { gap: 14px; }
        body.world-training .sp-main .sp-card[data-category] { min-height: 0; }
        .sp-card-cover { aspect-ratio: 16 / 9; }
        .sp-card-body { min-height: 180px; padding: 15px; }
        .sp-card-title { font-size: 17px; }
        .sp-card-meta { font-size: 12px; }
        .sp-card-launch { min-height: 42px; margin-top: 10px; padding-top: 10px; }

        [role="dialog"] {
          align-items: flex-end !important;
          padding: 0 !important;
        }
        [role="dialog"] .sp-card-lg {
          width: 100% !important;
          max-width: none !important;
          max-height: calc(100dvh - env(safe-area-inset-top, 0px)) !important;
          padding: 18px 14px calc(18px + env(safe-area-inset-bottom, 0px)) !important;
          overscroll-behavior: contain;
        }
        [role="dialog"] .sp-card { padding: 12px !important; }
        [role="dialog"] .sp-cluster { flex-wrap: wrap; }
        [role="dialog"] .sp-cta { min-width: 96px !important; }

        /* On training screens, keep the global install invitation away from
           drill controls and the bottom navigation. It docks beneath the
           unchanged global header, over the non-interactive hero artwork. */
        body:has(.sp-main) .sp-pwa-install-bar {
          top: calc(58px + env(safe-area-inset-top, 0px)) !important;
          bottom: auto !important;
        }
      }

      /* Narrow-phone trim. Authored at 360px and raised to the sanctioned
         600px band by MOBILE PHASE 5: the standard allows 900, 768 and 600
         only. Every declaration here is a smaller pad, a shorter hero art
         band or a smaller display size, all above the 12px floor, so the
         wider band compacts the 361-600 range and hides nothing. */
      @media (max-width: 600px) {
        .sp-main { padding-inline: 8px; }
        .sp-hero { padding: 224px 13px 15px; background-size: auto 322px; }
        .sp-hero-title { font-size: 27px; }
        .sp-hero-sub { font-size: 14px; }
        .sp-section-head { padding-inline: 10px; }
        .sp-stat { min-height: 96px; padding: 11px; }
        .sp-card-body { min-height: 170px; padding: 13px; }
      }

      @media (prefers-reduced-motion: reduce) {
        *, *::before, *::after { animation-duration: 0.001ms !important; transition-duration: 0.001ms !important; }
      }
    `}</style>
  );
}
