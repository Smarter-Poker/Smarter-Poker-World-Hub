/**
 * PERSONAL ASSISTANT · Approved #SMARTERDESIGN Landing Hub
 * /hub/personal-assistant
 *
 * Approved landing hierarchy:
 * 1. Review My Play (first & primary selection, A♠ K♠ illustration -> /hub/personal-assistant/review)
 * 2. Virtual Sandbox (major illustrated selection, A♥ 4♠ 5♠ illustration -> /hub/personal-assistant/sandbox)
 * 3. My Leaks (third illustrated selection, K♥ Q♥ illustration -> /hub/personal-assistant/leaks)
 * 4. Quick access bar: Log A Hand (in-app modal) & My Coaching Plan (/hub/personal-assistant/leaks?tab=plan)
 *    plus Settings in the top bar (/hub/personal-assistant/leaks?settings=1).
 *
 * All landing-page body controls open functionality inside Personal Assistant.
 * Locked global header (UniversalHeader) and fixed global footer (HubPageShell + bottom-nav-routes) are preserved.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useRouter } from 'next/router';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  PlusSquare,
  RotateCw,
  Settings,
} from 'lucide-react';

import SEOHead from '../../../src/components/seo/SEOHead';
import HubPageSummary from '../../../src/components/seo/HubPageSummary';
import { useAvatar } from '../../../src/contexts/AvatarContext';
import PageTransition from '../../../src/components/transitions/PageTransition';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import HamburgerMenu from '../../../src/components/ui/HamburgerMenu';
import HubPageShell from '../../../src/components/ui/HubPageShell';
import PullToRefresh from '../../../src/components/ui/PullToRefresh';
import toast from '../../../src/stores/toastStore';
import { useLoadFailsafe } from '../../../src/hooks/useLoadFailsafe';
import { useOnlineStatus, OFFLINE_TOAST } from '../../../src/hooks/useOnlineStatus';
import { useHaptics } from '../../../src/hooks/useHaptics';
import { useModalHistory } from '../../../src/hooks/useModalHistory';
import { getMenuConfig } from '../../../src/config/hamburgerMenus';
import { getFreshAccessToken } from '../../../src/lib/authUtils';
import { useRecentSessions, useAssistantStats } from '../../../src/hooks/useAssistant';
import { useFeatureGate } from '../../../src/components/gates/FeatureGatePopup';
import styles from '../../../src/styles/worlds/PersonalAssistantHub.module.css';
import PersonalAssistantCopyPolicy from '../../../src/components/personal-assistant/PersonalAssistantCopyPolicy';

const LiveSpotQuickEntry = dynamic(
  () => import('../../../src/components/personal-assistant/LiveSpotQuickEntry'),
  { ssr: false },
);

export default function PersonalAssistantPage() {
  const router = useRouter();
  const { user, initializing: authInitializing } = useAvatar();
  const [mounted, setMounted] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);
  const [liveSpotOpen, setLiveSpotOpen] = useState(false);

  const haptic = useHaptics();
  const online = useOnlineStatus();

  const requireOnline = useCallback(() => {
    if (online) return true;
    toast.error(OFFLINE_TOAST);
    return false;
  }, [online]);

  const closeMenu = useCallback(() => setShowMenu(false), []);
  useModalHistory(showMenu, closeMenu);
  const closeLiveSpot = useCallback(() => setLiveSpotOpen(false), []);
  useModalHistory(liveSpotOpen, closeLiveSpot);

  const { guardAction, UpgradePopup } = useFeatureGate('personal_assistant');
  const menuConfig = getMenuConfig('personal-assistant', user, {}, {});

  const {
    sessions: recentSessions,
    isLoading: sessionsLoading,
    error: sessionsError,
    refetch: refetchSessions,
  } = useRecentSessions(5, { userId: user?.id, ready: !authInitializing });

  const {
    stats,
    isLoading: statsLoading,
    isDemo: statsDemo,
    error: statsError,
    refetch: refetchStats,
  } = useAssistantStats({ userId: user?.id, ready: !authInitializing });

  const [dataLoading, setDataLoading] = useState(true);
  useEffect(() => {
    setDataLoading(true);
  }, [user?.id]);
  useEffect(() => {
    if (!statsLoading && !sessionsLoading) setDataLoading(false);
  }, [statsLoading, sessionsLoading]);
  useLoadFailsafe(dataLoading, setDataLoading);
  const statsBusy = statsLoading && dataLoading;
  const sessionsBusy = sessionsLoading && dataLoading;

  useEffect(() => { setMounted(true); }, []);

  // Direct deep-link handoff: ?hand=<uuid>, ?leak=<id>, or ?tab=<tab> routes inside Personal Assistant.
  useEffect(() => {
    if (router?.isReady === false) return;
    const searchParams = typeof window !== 'undefined'
      ? new URLSearchParams(window.location.search)
      : null;
    const readParam = (key) => {
      const val = router?.query?.[key];
      const raw = Array.isArray(val) ? val[0] : (val ?? searchParams?.get(key));
      return typeof raw === 'string' ? raw.trim() : '';
    };
    const handId = readParam('hand') || readParam('handId');
    const leakId = readParam('leak') || readParam('leakId');
    const tabVal = readParam('tab');
    if (!handId && !leakId && !tabVal) return;

    const params = new URLSearchParams();
    if (handId) params.set('hand', handId);
    if (leakId) params.set('leak', leakId);
    if (tabVal) params.set('tab', tabVal);
    params.set('source', readParam('source') || 'personal-assistant');
    for (const extra of ['format', 'drill', 'status', 'view']) {
      const v = readParam(extra);
      if (v) params.set(extra, v);
    }
    const targetUrl = `/hub/personal-assistant/leaks?${params.toString()}`;
    if (typeof router?.replace === 'function') {
      router.replace(targetUrl);
    } else if (typeof router?.push === 'function') {
      router.push(targetUrl);
    }
  }, [
    router,
    router?.isReady,
    router?.query?.hand,
    router?.query?.handId,
    router?.query?.leak,
    router?.query?.leakId,
    router?.query?.tab,
    router?.query?.source,
    router?.query?.format,
    router?.query?.drill,
    router?.query?.status,
    router?.query?.view,
  ]);

  const [reloadKey, setReloadKey] = useState(0);
  const [savedHandsCount, setSavedHandsCount] = useState(null);
  const [savedHandsLoading, setSavedHandsLoading] = useState(false);
  const [coachingSnapshot, setCoachingSnapshot] = useState(null);
  const activeUserIdRef = useRef(user?.id || null);
  activeUserIdRef.current = user?.id || null;

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const handleAssistantUpdate = () => {
      try { refetchSessions?.(); } catch (_) {}
      try { refetchStats?.(); } catch (_) {}
      setReloadKey((n) => n + 1);
    };
    window.addEventListener('pa-sandbox-updated', handleAssistantUpdate);
    window.addEventListener('pa-leak-review-updated', handleAssistantUpdate);
    return () => {
      window.removeEventListener('pa-sandbox-updated', handleAssistantUpdate);
      window.removeEventListener('pa-leak-review-updated', handleAssistantUpdate);
    };
  }, [refetchSessions, refetchStats]);

  // Fetch owner's saved hands count + coaching focus when signed in.
  useEffect(() => {
    if (authInitializing || !user?.id) {
      setSavedHandsCount(null);
      setSavedHandsLoading(false);
      setCoachingSnapshot(null);
      return undefined;
    }

    const expectedUserId = user.id;
    let cancelled = false;
    const controller = new AbortController();
    setSavedHandsLoading(true);

    const loadPersonalOverview = async () => {
      try {
        const token = await getFreshAccessToken();
        if (cancelled || activeUserIdRef.current !== expectedUserId || !token) {
          if (!cancelled) setSavedHandsLoading(false);
          return;
        }
        const headers = { Authorization: `Bearer ${token}`, Accept: 'application/json' };
        const [savedRes, coachRes] = await Promise.allSettled([
          fetch('/api/poker/saved-hands?limit=50', { cache: 'no-store', headers, signal: controller.signal }),
          fetch('/api/assistant/coaching', { cache: 'no-store', headers, signal: controller.signal }),
        ]);

        if (cancelled || activeUserIdRef.current !== expectedUserId) return;

        if (savedRes.status === 'fulfilled' && savedRes.value.ok) {
          const payload = await savedRes.value.json().catch(() => null);
          if (!cancelled && payload?.success && Array.isArray(payload.hands)) {
            const unreviewed = payload.hands.filter((h) => (h?.review?.status || h?.hand_data?.review?.status) !== 'reviewed').length;
            setSavedHandsCount(unreviewed > 0 ? unreviewed : payload.hands.length);
          }
        }

        if (coachRes.status === 'fulfilled' && coachRes.value.ok) {
          const payload = await coachRes.value.json().catch(() => null);
          if (!cancelled && payload?.success && payload?.snapshot) {
            setCoachingSnapshot(payload.snapshot);
          }
        }
      } catch (err) {
        if (!cancelled && err?.name !== 'AbortError') {
          console.warn('[Personal Assistant] overview fetch skipped:', err?.message || err);
        }
      } finally {
        if (!cancelled) setSavedHandsLoading(false);
      }
    };

    loadPersonalOverview();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [authInitializing, user?.id, reloadKey]);

  const openInternalRoute = useCallback((route) => {
    haptic('light');
    router.push(route);
  }, [haptic, router]);

  const openLiveSpot = useCallback(() => {
    haptic('light');
    if (!guardAction()) return;
    setLiveSpotOpen(true);
  }, [haptic, guardAction]);

  const retryAssistantData = useCallback(async () => {
    if (isRetrying) return;
    if (!requireOnline()) return;
    haptic('light');
    setIsRetrying(true);
    setDataLoading(true);
    try {
      setReloadKey((n) => n + 1);
      await Promise.allSettled([
        Promise.resolve(refetchStats?.()),
        Promise.resolve(refetchSessions?.()),
      ]);
    } finally {
      setIsRetrying(false);
      setDataLoading(false);
    }
  }, [isRetrying, requireOnline, haptic, refetchStats, refetchSessions]);

  const dataSyncError = statsError || sessionsError;
  const isSignedOut = !user?.id;
  const isSampleStats = Boolean(statsDemo || stats?.isDemo);
  const statsUnavailable = isSignedOut || isSampleStats || Boolean(statsError) || statsBusy;
  const parseMetric = (val) => (
    !statsUnavailable && typeof val === 'number' && Number.isFinite(val) ? val : null
  );
  const activeLeakCount = parseMetric(stats?.leaksFound);
  const resolvedLeakCount = parseMetric(stats?.resolvedLeaks);
  const topFocusTitle = coachingSnapshot?.priorities?.[0]?.title
    || coachingSnapshot?.trainingPlan?.modules?.[0]?.title
    || null;

  const readyToReviewText = isSignedOut
    ? 'Sign In To Access Your Saved Hands'
    : savedHandsLoading
      ? 'Checking Your Saved Hands…'
      : savedHandsCount === null
        ? 'Open Your Saved Hands Queue'
        : savedHandsCount === 0
          ? 'No Saved Hands Yet'
          : `${savedHandsCount} ${savedHandsCount === 1 ? 'Hand' : 'Hands'} Ready To Review`;

  const leaksSummaryText = isSignedOut
    ? 'Sign In To Inspect Your Patterns'
    : statsBusy
      ? 'Syncing Leak Summary…'
      : resolvedLeakCount !== null && activeLeakCount !== null
        ? `${resolvedLeakCount.toLocaleString()} Leaks Fixed · ${activeLeakCount.toLocaleString()} Open`
        : 'Run A Club Arena Leak Audit';

  const skeleton = (
    <div className={styles.skel} aria-hidden="true">
      <div className={`${styles.skelBlock} ${styles.skelCard}`} />
      <div className={`${styles.skelBlock} ${styles.skelCard}`} />
      <div className={`${styles.skelBlock} ${styles.skelCard}`} />
    </div>
  );

  return (
    <PageTransition disableInitialAnimation>
      <SEOHead
        title="Personal Assistant - Smarter.Poker"
        description="Review Your Saved Hands, Explore Scenarios In Virtual Sandbox, And Fix Leaks Inside Personal Assistant On Smarter.Poker."
        canonical="/hub/personal-assistant"
      />

      <PersonalAssistantCopyPolicy />
      <HubPageShell
        className="pa"
        maxWidth={960}
        header={<UniversalHeader pageDepth={1} onMenuClick={() => setShowMenu(!showMenu)} />}
      >
        <div className={styles.page}>
          <HamburgerMenu
            isOpen={showMenu}
            onClose={closeMenu}
            direction="left"
            theme="pa"
            user={user}
            menuItems={menuConfig.menuItems}
            bottomLinks={menuConfig.bottomLinks}
          />

          <PullToRefresh onRefresh={retryAssistantData} disabled={showMenu}>
            <div className={styles.landingMain} id="overview">
              {/* First-frame server-rendered hero header (no data-dependent values) */}
              <section className={`${styles.frame} ${styles.hero}`} aria-labelledby="assistant-title" data-tutorial="nav">
                <div className={styles.landingHeader}>
                  <div className={styles.landingTitleBlock}>
                    <span className={styles.landingEyebrow}>Your Game. Your Next Step.</span>
                    <h1 id="assistant-title" className={styles.landingTitle}>Personal Assistant</h1>
                  </div>
                  <button
                    type="button"
                    className={styles.settingsButton}
                    aria-label="Practice And Audit Settings"
                    title="Review Settings"
                    onClick={() => openInternalRoute('/hub/personal-assistant/leaks?settings=1')}
                  >
                    <Settings size={18} strokeWidth={2} aria-hidden="true" />
                  </button>
                </div>
              </section>

              {!mounted ? skeleton : (
                <>
                  {dataSyncError && (
                    <div className={styles.syncAlert} role="alert">
                      <span className={styles.syncAlertIcon} aria-hidden="true">
                        <AlertTriangle size={18} />
                      </span>
                      <span className={styles.syncAlertCopy}>
                        <strong>Live Data Could Not Refresh</strong>
                        <small>Your Saved Poker Data Is Unchanged. Retry To Refresh Sessions And Stats.</small>
                      </span>
                      <button
                        type="button"
                        className={styles.secondaryButton}
                        onClick={retryAssistantData}
                        disabled={isRetrying}
                      >
                        <RotateCw size={14} aria-hidden="true" />
                        {isRetrying ? 'Retrying' : 'Retry Now'}
                      </button>
                    </div>
                  )}

                  {/* Three Approved Illustrated Primary Selections */}
                  <div className={styles.deck}>
                    {/* 1. Review My Play (First & Primary Selection) */}
                    <section
                      className={`${styles.featureCard} ${styles.featureCardPrimary}`}
                      aria-labelledby="card-review-title"
                      data-tutorial="mission"
                    >
                      <div className={styles.featureArtWrap}>
                        <img
                          src="/images/personal-assistant/review-my-play.webp"
                          alt="Review My Play Featuring Ace Of Spades And King Of Spades With Magnifying Glass"
                          className={styles.featureArt}
                          width={308}
                          height={230}
                        />
                      </div>
                      <div className={styles.featureBody}>
                        <span className={styles.featureEyebrow}>Recommended</span>
                        <h2 id="card-review-title" className={styles.featureTitle}>Review My Play</h2>
                        <p className={styles.featureSubtitle}>
                          Your Saved Hands. Your Decisions. Your Next Improvement.
                        </p>
                        {topFocusTitle && (
                          <p className={styles.featureFocus}>Focus: {topFocusTitle}</p>
                        )}
                        <p className={styles.featureMeta}>{readyToReviewText}</p>
                        <div className={styles.featureActions}>
                          <Link
                            href="/hub/personal-assistant/review"
                            className={styles.featureCtaPrimary}
                            onClick={(event) => {
                              event.preventDefault();
                              openInternalRoute('/hub/personal-assistant/review');
                            }}
                          >
                            Start Review
                            <ChevronRight size={16} aria-hidden="true" />
                          </Link>
                        </div>
                      </div>
                    </section>

                    {/* 2. Virtual Sandbox (Second Major Illustrated Selection: A♥ 4♠ 5♠) */}
                    <section
                      className={styles.featureCard}
                      aria-labelledby="card-sandbox-title"
                      data-tutorial="systems"
                    >
                      <div className={styles.featureArtWrap}>
                        <img
                          src="/images/personal-assistant/virtual-sandbox.webp"
                          alt="Virtual Sandbox Poker Table Displaying Ace Of Hearts, Four Of Spades, And Five Of Spades"
                          className={styles.featureArt}
                          width={308}
                          height={202}
                        />
                      </div>
                      <div className={styles.featureBody}>
                        <h2 id="card-sandbox-title" className={styles.featureTitle}>Virtual Sandbox</h2>
                        <p className={styles.featureSubtitle}>
                          Explore Poker Scenarios Inside Your Assistant.
                        </p>
                        <div className={styles.featureActions}>
                          <Link
                            href="/hub/personal-assistant/sandbox"
                            className={styles.featureCtaSecondary}
                            onClick={(event) => {
                              event.preventDefault();
                              openInternalRoute('/hub/personal-assistant/sandbox');
                            }}
                          >
                            Open Sandbox
                            <ChevronRight size={16} aria-hidden="true" />
                          </Link>
                        </div>
                      </div>
                    </section>

                    {/* 3. My Leaks (Third Illustrated Selection: K♥ Q♥) */}
                    <section
                      className={styles.featureCard}
                      aria-labelledby="card-leaks-title"
                      data-tutorial="stats"
                    >
                      <div className={styles.featureArtWrap}>
                        <img
                          src="/images/personal-assistant/my-leaks.webp"
                          alt="My Leaks Magnifying Glass Over King Of Hearts And Queen Of Hearts"
                          className={styles.featureArt}
                          width={720}
                          height={402}
                        />
                      </div>
                      <div className={styles.featureBody}>
                        <h2 id="card-leaks-title" className={styles.featureTitle}>My Leaks</h2>
                        <p className={styles.featureSubtitle}>
                          See The Patterns In Your Play That Need Work.
                        </p>
                        <p className={styles.featureStatusRow}>
                          <CheckCircle2 size={14} aria-hidden="true" />
                          <span>{leaksSummaryText}</span>
                        </p>
                        <div className={styles.featureActions}>
                          <Link
                            href="/hub/personal-assistant/leaks"
                            className={styles.featureCtaSecondary}
                            onClick={(event) => {
                              event.preventDefault();
                              openInternalRoute('/hub/personal-assistant/leaks');
                            }}
                          >
                            View My Leaks
                            <ChevronRight size={16} aria-hidden="true" />
                          </Link>
                        </div>
                      </div>
                    </section>
                  </div>

                  {/* Quick Access Utility Strip: Log A Hand & My Coaching Plan (All Inside Personal Assistant) */}
                  <section className={styles.utilityBar} aria-label="Quick Assistant Tools" data-tutorial="loop">
                    <button
                      type="button"
                      className={styles.utilityCard}
                      data-live-spot-card="home"
                      onClick={openLiveSpot}
                    >
                      <span className={styles.utilityIcon} aria-hidden="true">
                        <PlusSquare size={22} />
                      </span>
                      <span className={styles.utilityCopy}>
                        <strong>Log A Hand</strong>
                        <span>Enter Or Paste A Hand</span>
                      </span>
                    </button>

                    <Link
                      href="/hub/personal-assistant/leaks?tab=plan"
                      className={styles.utilityCard}
                      onClick={(event) => {
                        event.preventDefault();
                        openInternalRoute('/hub/personal-assistant/leaks?tab=plan');
                      }}
                    >
                      <span className={styles.utilityIcon} aria-hidden="true">
                        <ClipboardList size={22} />
                      </span>
                      <span className={styles.utilityCopy}>
                        <strong>My Coaching Plan</strong>
                        <span>
                          {sessionsBusy
                            ? 'Syncing Coaching Plan…'
                            : 'Goals And Weekly Focus'}
                        </span>
                      </span>
                    </Link>
                  </section>

                  <div className={styles.summaryWrap} data-tutorial="activity">
                    <HubPageSummary page="personal-assistant" />
                  </div>
                </>
              )}
            </div>
          </PullToRefresh>
        </div>
      </HubPageShell>

      {liveSpotOpen && (
        <LiveSpotQuickEntry
          open
          onClose={closeLiveSpot}
          onAnalyzed={() => setReloadKey((n) => n + 1)}
        />
      )}

      {UpgradePopup}
    </PageTransition>
  );
}
