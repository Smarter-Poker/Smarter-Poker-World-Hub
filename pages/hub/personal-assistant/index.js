/**
 * PERSONAL ASSISTANT · Simplified MTT-Lobby Command Center
 * /hub/personal-assistant
 *
 * Default journey: Open Personal Assistant -> Understand Next Action -> Start.
 * Uses the approved MTT lobby visual language (600px centered interior, top-lit
 * metallic steel borders, royal-blue primary CTA, native <details> disclosures
 * for secondary tools/activity) while preserving every data, security, mobile,
 * and first-paint contract.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useRouter } from 'next/router';
import {
  Activity,
  AlertTriangle,
  BrainCircuit,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Droplet,
  FlaskConical,
  Play,
  Route,
  RotateCw,
  ScanSearch,
  Settings,
  Sparkles,
  Target,
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
import { TUTORIAL_WILL_OPEN_EVENT } from '../../../src/tutorials';
import { getFreshAccessToken } from '../../../src/lib/authUtils';
import { useRecentSessions, useAssistantStats } from '../../../src/hooks/useAssistant';
import { useFeatureGate } from '../../../src/components/gates/FeatureGatePopup';
import styles from '../../../src/styles/worlds/PersonalAssistantHub.module.css';
import PersonalAssistantCopyPolicy from '../../../src/components/personal-assistant/PersonalAssistantCopyPolicy';
import { resolveDailyHeroHand } from '../../../src/lib/personal-assistant/dailyHandContract.mjs';
import {
  PA_ANALYSIS_DEFAULTS,
  describePracticePreset,
  getSafeLocalStorage,
  loadAssistantPreferences,
  resolveHomePrimaryState,
} from '../../../src/lib/personal-assistant/assistantDefaults.mjs';

// The live spot logger pulls in the shared bottom sheet, so it loads only after a tap.
const LiveSpotQuickEntry = dynamic(
  () => import('../../../src/components/personal-assistant/LiveSpotQuickEntry'),
  { ssr: false },
);

const SYSTEMS = [
  {
    id: 'leaks',
    eyebrow: 'Track And Improve Your Game',
    title: 'Leak Finder',
    description: 'Analyze your Club Arena Cash and Tournament NLH hands with sensible defaults.',
    features: ['Detect Statistical Leaks', 'Track Progress Over Time', 'Open Targeted Training'],
    action: 'View Leaks',
    route: '/hub/personal-assistant/leaks',
  },
  {
    id: 'sandbox',
    eyebrow: 'Verified Evidence Boundary',
    title: 'Scenario Analysis Archive',
    description: 'Review why approximate scenario grading is retired, then continue in evidence-backed Training.',
    features: ['No Approximate Grades', 'No Substituted Spots', 'Open Verified Training'],
    action: 'Review Evidence Gate',
    route: '/hub/personal-assistant/sandbox',
  },
];

// Secondary entry inside the Tools disclosure: opens the live spot logger instead of a route.
const LIVE_SPOT_ENTRY = {
  id: 'live-spot',
  eyebrow: 'Live Play And Other Sites',
  title: 'Live Spot Or Hand Import',
  description: 'Log A Live Poker Spot In About 15 Seconds, Or Paste PokerStars, GGPoker, ACR Or ClubGG Hands For A Solver Check.',
  features: ['15-Second Quick Spot', 'Paste External Hands', 'Unverified Spots Stay Unpriced'],
  action: 'Log A Live Spot',
};

const DAILY_HAND_MAX_ATTEMPTS = 2;
const DAILY_HAND_TIMEOUT_MS = 6000;
const DAILY_HAND_RETRY_DELAY_MS = 350;

function normalizeDailyHandPayload(payload) {
  const raw = payload?.hand || payload?.question;
  if (!raw || typeof raw !== 'object') return null;
  const scenario = raw.scenario && typeof raw.scenario === 'object' ? raw.scenario : {};
  const board = raw.board || raw.board_cards || raw.boardCards || scenario.board || null;
  const heroHand = resolveDailyHeroHand(raw, scenario);
  if (!heroHand) return null;
  return {
    ...raw,
    id: raw.id || payload?.dailyId || null,
    heroHand,
    position: raw.position || raw.hero_position || scenario.heroPosition || null,
    board,
    pot: raw.pot ?? raw.pot_size ?? scenario.potSize ?? scenario.pot ?? null,
    title: raw.title || raw.scenario_text || raw.question || scenario.context || 'What Is The Best Line?',
  };
}

const toTitleWords = (value) => String(value || '')
  .replace(/_/g, ' ')
  .replace(/\b[a-z]/g, (letter) => letter.toUpperCase());

function SystemCardBody({ system }) {
  return (
    <span className={styles.systemCardInner}>
      <span className={styles.systemCopy}>
        <span style={{ display: 'block' }}>
          <span className={styles.systemEyebrow}>{system.eyebrow}</span>
          <strong className={styles.systemTitle}>{system.title}</strong>
          <span className={styles.systemDescription}>{system.description}</span>
          <span className={styles.systemFeatureList}>
            {system.features.map((feature) => (
              <span key={feature} className={styles.systemFeatureItem}>
                <CheckCircle2 size={13} aria-hidden="true" />{feature}
              </span>
            ))}
          </span>
        </span>
        <span className={styles.secondaryButton}>
          {system.action}<ChevronRight size={15} aria-hidden="true" />
        </span>
      </span>
    </span>
  );
}

const SectionBar = ({ title, meta, id }) => (
  <div className={styles.sectionBar} id={id}>
    <h2>{title}</h2>
    <span>{meta}</span>
  </div>
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
  const systemsSectionRef = useRef(null);
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

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const handleTutorialWillOpen = () => {
      const detailsEl = systemsSectionRef.current?.querySelector('details');
      if (detailsEl && !detailsEl.open) {
        detailsEl.open = true;
      }
    };
    window.addEventListener(TUTORIAL_WILL_OPEN_EVENT, handleTutorialWillOpen);
    return () => window.removeEventListener(TUTORIAL_WILL_OPEN_EVENT, handleTutorialWillOpen);
  }, []);

  const [assistantPrefs, setAssistantPrefs] = useState(() => loadAssistantPreferences(null, null));
  useEffect(() => {
    setAssistantPrefs(loadAssistantPreferences(getSafeLocalStorage(), user?.id));
  }, [user?.id]);

  // Direct hand/leak/tab deep-link handoff: ?hand=<uuid>, ?handId=<uuid>, ?leak=<id>, or ?tab=<tab> routes straight to Leak Finder.
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
    const rawHand = Array.isArray(router?.query?.hand)
      ? router.query.hand[0]
      : (router?.query?.hand ?? router?.query?.handId ?? searchParams?.get('hand') ?? searchParams?.get('handId'));
    const handId = typeof rawHand === 'string' ? rawHand.trim() : '';
    const leakId = readParam('leak') || readParam('leakId');
    const tabVal = readParam('tab');
    if (!handId && !leakId && !tabVal) return;

    const rawSource = readParam('source');
    const rawFormat = readParam('format');
    const rawDrill = readParam('drill');
    const rawStatus = readParam('status');
    const rawView = readParam('view');
    const params = new URLSearchParams();
    if (handId) params.set('hand', handId);
    if (leakId) params.set('leak', leakId);
    if (tabVal) params.set('tab', tabVal);
    params.set('source', rawSource || 'personal-assistant');
    if (rawFormat) params.set('format', rawFormat);
    if (rawDrill) params.set('drill', rawDrill);
    if (rawStatus) params.set('status', rawStatus);
    if (rawView) params.set('view', rawView);
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

  const [trainingPlanReloadKey, setTrainingPlanReloadKey] = useState(0);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const handleAssistantUpdate = () => {
      try { refetchSessions?.(); } catch (error) { console.warn('[Personal Assistant] Session refresh error:', error?.message || error); }
      try { refetchStats?.(); } catch (error) { console.warn('[Personal Assistant] Stats refresh error:', error?.message || error); }
      setTrainingPlanReloadKey((n) => n + 1);
    };
    window.addEventListener('pa-sandbox-updated', handleAssistantUpdate);
    window.addEventListener('pa-leak-review-updated', handleAssistantUpdate);
    return () => {
      window.removeEventListener('pa-sandbox-updated', handleAssistantUpdate);
      window.removeEventListener('pa-leak-review-updated', handleAssistantUpdate);
    };
  }, [refetchSessions, refetchStats]);

  const [dailyHand, setDailyHand] = useState(null);
  const [dailyHandStatus, setDailyHandStatus] = useState('loading');
  const [dailyHandReloadKey, setDailyHandReloadKey] = useState(0);
  const [coachingSnapshot, setCoachingSnapshot] = useState(null);
  const [coachingStatus, setCoachingStatus] = useState('loading');

  useEffect(() => {
    setCoachingSnapshot(null);
    setCoachingStatus(user?.id ? 'loading' : 'ready');
  }, [user?.id]);

  useEffect(() => {
    if (authInitializing || !user?.id) {
      setCoachingSnapshot(null);
      setCoachingStatus(authInitializing ? 'loading' : 'ready');
      return undefined;
    }
    let cancelled = false;
    const controller = new AbortController();
    const loadPlan = async () => {
      setCoachingStatus((prev) => (prev === 'ready' ? 'ready' : 'loading'));
      try {
        const token = await getFreshAccessToken();
        if (!token) {
          if (!cancelled) {
            setCoachingSnapshot(null);
            setCoachingStatus('error');
          }
          return;
        }
        if (cancelled) return;
        const response = await fetch('/api/assistant/coaching', {
          cache: 'no-store',
          headers: { Authorization: `Bearer ${token}` },
          signal: controller.signal,
        });
        const payload = await response.json().catch(() => null);
        if (!cancelled) {
          if (response.ok && payload?.success && payload?.snapshot) {
            setCoachingSnapshot(payload.snapshot);
            setCoachingStatus('ready');
          } else {
            setCoachingSnapshot(null);
            setCoachingStatus('error');
          }
        }
      } catch (err) {
        if (!cancelled && err?.name !== 'AbortError') {
          setCoachingSnapshot(null);
          setCoachingStatus('error');
        }
      }
    };
    loadPlan();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [authInitializing, user?.id, trainingPlanReloadKey, stats?.leaksFound, stats?.handsAnalyzed]);

  useEffect(() => {
    let cancelled = false;

    const loadDailyHand = async () => {
      setDailyHandStatus('loading');
      let lastError = null;

      for (let attempt = 0; attempt < DAILY_HAND_MAX_ATTEMPTS && !cancelled; attempt += 1) {
        const controller = new AbortController();
        const timeout = window.setTimeout(() => controller.abort(), DAILY_HAND_TIMEOUT_MS);

        try {
          const response = await fetch('/api/training/hand-of-the-day', {
            cache: 'no-store',
            headers: { Accept: 'application/json' },
            signal: controller.signal,
          });
          if (!response.ok) throw new Error(`Daily hand request failed with status ${response.status}`);

          const normalized = normalizeDailyHandPayload(await response.json());
          if (!normalized) throw new Error('Daily hand response did not include a playable hand');

          if (!cancelled) {
            setDailyHand(normalized);
            setDailyHandStatus('ready');
          }
          return;
        } catch (error) {
          lastError = error;
        } finally {
          window.clearTimeout(timeout);
        }

        if (attempt < DAILY_HAND_MAX_ATTEMPTS - 1 && !cancelled) {
          await new Promise((resolve) => window.setTimeout(resolve, DAILY_HAND_RETRY_DELAY_MS));
        }
      }

      if (!cancelled) {
        setDailyHandStatus('error');
        console.warn('[Personal Assistant] Daily hand unavailable:', lastError?.message || lastError);
      }
    };

    loadDailyHand();
    return () => { cancelled = true; };
  }, [dailyHandReloadKey]);

  const normalizeHeroHand = (raw) => {
    const cleaned = String(raw || '').replace(/[\s,]/g, '');
    const cards = cleaned.match(/(?:10|[2-9TJQKA])[shdc]/gi) || [];
    return cards.length === 2 && cards.join('').length === cleaned.length ? cards : null;
  };

  const normalizeBoardCards = (raw) => {
    const cards = String(raw || '').replace(/[\s,]/g, '').match(/(?:10|[2-9TJQKA])[shdc]/gi) || [];
    return cards.length >= 3 ? cards.slice(0, 5) : null;
  };

  const openGuardedRoute = (route) => {
    haptic('light');
    if (!guardAction()) return;
    if (String(route || '').startsWith('/hub/club-arena') && typeof window !== 'undefined') {
      window.location.assign(route);
      return;
    }
    router.push(route);
  };

  const openLiveSpot = () => {
    haptic('light');
    if (!guardAction()) return;
    setLiveSpotOpen(true);
  };

  const openDailyTraining = () => {
    haptic('light');
    if (!guardAction()) return;
    router.push('/hub/training?source=personal-assistant-hand-of-day');
  };

  const openSession = (session) => {
    haptic('light');
    if (!guardAction()) return;
    if (session.type !== 'sandbox') {
      router.push('/hub/personal-assistant/leaks');
      return;
    }
    router.push('/hub/personal-assistant/sandbox?source=archived-session');
  };

  const formatSessionDate = (value) => {
    if (!value) return '';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleDateString();
  };

  const formatEv = (value) => (
    typeof value === 'number' && Number.isFinite(value) ? `${value.toFixed(2)} BB` : 'Unpriced'
  );

  const sessionTypeLabel = (session) => (
    session?.type === 'leak' ? 'Leak Review' : 'Sandbox Session'
  );

  const lastRealSession = (recentSessions || []).find(
    (session) => session && !session.isDemo && session.type === 'sandbox',
  ) || null;

  const dataSyncError = statsError || sessionsError;
  const isSignedOut = !user?.id;
  const isSampleStats = Boolean(statsDemo || stats?.isDemo);
  const statsUnavailable = isSignedOut || isSampleStats || Boolean(statsError) || statsLoading;
  const parseMetric = (val) => (
    !statsUnavailable && typeof val === 'number' && Number.isFinite(val) ? val : null
  );
  const activeLeakCount = parseMetric(stats?.leaksFound);
  const resolvedLeakCount = parseMetric(stats?.resolvedLeaks);
  const handsAnalyzedCount = parseMetric(stats?.handsAnalyzed);
  const availableClubArenaHands = parseMetric(stats?.availableClubArenaHands);
  const sessionsReviewedCount = parseMetric(stats?.sessionsReviewed);
  const trainingPlan = coachingSnapshot?.trainingPlan || null;
  const reviewDueCount = Number(
    coachingSnapshot?.summary?.due ?? coachingSnapshot?.trainingPlan?.dueNowCount ?? 0,
  );
  const dueCount = reviewDueCount > 0 ? Math.floor(reviewDueCount) : 0;
  const dueSuffix = dueCount > 0 ? ` (${dueCount})` : '';
  const sessionDebrief = coachingSnapshot?.sessionDebrief || null;
  const showSessionRecap = sessionDebrief?.recapEligible === true
    && !sessionDebrief?.liveTableActive
    && !sessionDebrief?.cooldownActive
    && !coachingSnapshot?.liveTableActive;
  const recapHands = showSessionRecap && Array.isArray(sessionDebrief?.topLeakedHands)
    ? sessionDebrief.topLeakedHands.filter(Boolean).slice(0, 2)
    : [];
  const recapDrillHandId = recapHands.find((hand) => hand?.handId)?.handId || null;
  const topPriority = coachingSnapshot?.priorities?.[0] || null;
  const activeAuditRunning = Boolean(coachingSnapshot?.activeAuditRunning);
  const activeAuditProgressText = coachingSnapshot?.activeAuditProgressText || null;

  const retryAssistantData = useCallback(async () => {
    if (isRetrying) return;
    if (!requireOnline()) return;
    haptic('light');
    setIsRetrying(true);
    setDataLoading(true);
    try {
      setTrainingPlanReloadKey((n) => n + 1);
      await Promise.allSettled([
        Promise.resolve(refetchStats?.()),
        Promise.resolve(refetchSessions?.()),
      ]);
    } finally {
      setIsRetrying(false);
      setDataLoading(false);
    }
  }, [isRetrying, requireOnline, haptic, refetchStats, refetchSessions]);

  const primaryState = resolveHomePrimaryState({
    loading: statsBusy || sessionsBusy,
    syncError: dataSyncError,
    isSignedIn: Boolean(user?.id),
    isDemo: Boolean(statsDemo || stats?.isDemo),
    auditRunning: activeAuditRunning,
    auditProgressText: activeAuditProgressText,
    reviewDueCount,
    activeLeaksCount: activeLeakCount ?? 0,
    topLeakTitle: topPriority?.title || trainingPlan?.modules?.[0]?.title || null,
    handsAnalyzed: handsAnalyzedCount ?? 0,
    availableClubArenaHands: availableClubArenaHands ?? 0,
    sessionsReviewed: sessionsReviewedCount ?? 0,
    hasPracticeInProgress: Boolean(Array.isArray(trainingPlan?.modules) && trainingPlan.modules.length > 0),
    trainingPlanTitle: trainingPlan?.modules?.[0]?.title || null,
    lastSessionTitle: lastRealSession?.title || null,
  });

  const runPrimaryAction = () => {
    if (primaryState.disabled) return;
    if (primaryState.ctaAction === 'retry') {
      retryAssistantData();
      return;
    }
    if (primaryState.ctaAction === 'open_review') {
      openGuardedRoute('/hub/personal-assistant/leaks?tab=leaks');
      return;
    }
    if (primaryState.ctaAction === 'open_leaks') {
      openGuardedRoute('/hub/personal-assistant/leaks');
      return;
    }
    if (primaryState.ctaAction === 'continue_practice') {
      openGuardedRoute('/hub/personal-assistant/leaks?tab=coaching&view=coach');
      return;
    }
    if (primaryState.ctaAction === 'analyze_now') {
      openGuardedRoute('/hub/personal-assistant/leaks?autorun=1');
      return;
    }
    openGuardedRoute('/hub/training?source=personal-assistant-hero');
  };

  const unavailableLabel = isSignedOut
    ? 'Sign In To View'
    : statsError
      ? 'Retry To Load'
      : isSampleStats
        ? 'Sample View'
        : 'Not Audited Yet';

  const decisionLoop = [
    {
      step: '01',
      title: 'Play',
      detail: 'Club Arena Hands',
      Icon: FlaskConical,
      route: '/hub/club-arena/hand-history?source=personal-assistant-loop',
    },
    {
      step: '02',
      title: 'Diagnose',
      detail: activeLeakCount === null
        ? (isSignedOut ? 'Sign In To Audit' : statsError ? 'Retry Live Data' : 'Run Leak Audit')
        : `${activeLeakCount.toLocaleString()} Active Leak${activeLeakCount === 1 ? '' : 's'}`,
      Icon: ScanSearch,
      route: '/hub/personal-assistant/leaks',
    },
    {
      step: '03',
      title: 'Train',
      detail: handsAnalyzedCount === null
        ? 'Verified Practice'
        : `${handsAnalyzedCount.toLocaleString()} Analyzed`,
      Icon: BrainCircuit,
      route: '/hub/training?source=personal-assistant-loop',
    },
  ];

  const drillsDueLoading = !isSignedOut && coachingStatus === 'loading';
  const drillsDueCount = (statsUnavailable || coachingStatus !== 'ready' || !coachingSnapshot)
    ? null
    : dueCount;
  const statCards = [
    {
      title: 'Active Leaks',
      value: activeLeakCount,
      busy: false,
      label: activeLeakCount === null
        ? unavailableLabel
        : `${activeLeakCount.toLocaleString()} Open`,
      Icon: Droplet,
      route: '/hub/personal-assistant/leaks',
    },
    {
      title: 'Drills Due',
      value: drillsDueCount,
      busy: drillsDueLoading,
      label: drillsDueLoading
        ? 'Loading…'
        : drillsDueCount === null
          ? (coachingStatus === 'error' ? 'Retry To Load' : unavailableLabel)
          : `${dueCount} Due`,
      Icon: Clock3,
      route: '/hub/personal-assistant/leaks?tab=plan',
    },
    {
      title: 'Verified Fixed',
      value: resolvedLeakCount,
      busy: false,
      label: resolvedLeakCount === null
        ? unavailableLabel
        : 'Confirmed Live',
      Icon: CheckCircle2,
      route: '/hub/personal-assistant/leaks?status=fixed',
    },
  ];

  const suitClassMap = {
    c: styles.suitClubs,
    d: styles.suitDiamonds,
    h: styles.suitHearts,
    s: styles.suitSpades,
  };

  const formatCard = (card) => {
    const match = String(card || '').match(/^(10|[2-9TJQKA])([shdc])$/i);
    if (!match) return { rank: String(card || '?'), suit: '', suitCode: 's', suitClass: styles.suitSpades };
    const suitMap = { s: '♠', h: '♥', d: '♦', c: '♣' };
    const rawRank = match[1].toUpperCase();
    const rank = rawRank === 'T' ? '10' : rawRank;
    const suitCode = match[2].toLowerCase();
    return {
      rank,
      suit: suitMap[suitCode],
      suitCode,
      suitClass: suitClassMap[suitCode] || styles.suitSpades,
    };
  };

  const heroCards = (normalizeHeroHand(dailyHand?.heroHand) || []).map(formatCard);
  const boardCards = (normalizeBoardCards(dailyHand?.board) || []).map(formatCard);

  const skeleton = (
    <div className={styles.skel} aria-hidden="true">
      <div className={`${styles.skelBlock} ${styles.skelBar}`} />
      <div className={`${styles.skelBlock} ${styles.skelCard}`} />
      <div className={styles.skelRow}>
        <div className={`${styles.skelBlock} ${styles.skelCard}`} />
        <div className={`${styles.skelBlock} ${styles.skelCard}`} />
      </div>
    </div>
  );

  return (
    <PageTransition disableInitialAnimation>
      <SEOHead
        title="Personal Poker Assistant - Jarvis AI"
        description="Get Personalized Poker Coaching, Deterministic Leak Detection, And Evidence-Backed Training Reviews On Smarter.Poker."
        canonical="/hub/personal-assistant"
      />

      <PersonalAssistantCopyPolicy />
      <HubPageShell
        className="pa"
        maxWidth={820}
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

        {/* Compact single-row MTT lobby tab strip */}
        <nav className={styles.tabs} aria-label="Personal Assistant Sections" data-tutorial="nav">
          <a className={styles.activeTab} href="#overview" aria-current="page" onClick={() => haptic('light')}>Overview</a>
          <Link
            href={dueCount > 0 ? '/hub/personal-assistant/leaks?tab=leaks' : '/hub/personal-assistant/leaks'}
            onClick={(event) => {
              event.preventDefault();
              openGuardedRoute(dueCount > 0 ? '/hub/personal-assistant/leaks?tab=leaks' : '/hub/personal-assistant/leaks');
            }}
            aria-label={dueCount > 0 ? `Leak Finder, ${dueCount} Review${dueCount === 1 ? '' : 's'} Due` : undefined}
          >
            Leak Finder{dueSuffix}
          </Link>
          <Link
            href="/hub/training"
            onClick={(event) => {
              event.preventDefault();
              openGuardedRoute('/hub/training');
            }}
          >
            Training Games
          </Link>
        </nav>

        <PullToRefresh onRefresh={retryAssistantData} disabled={showMenu}>
        <div className={styles.main} id="overview">
          {/* Compact MTT lobby header plaque (zero data deps -> instant LCP) */}
          <section className={`${styles.frame} ${styles.hero}`} aria-labelledby="assistant-title">
            <div className={styles.heroInner}>
              <div className={styles.heroCopy}>
                <div className={styles.heroTopRow}>
                  <div>
                    <span className={styles.eyebrow}>Personal Poker Assistant</span>
                    <h1 id="assistant-title">Personal Assistant</h1>
                  </div>
                  <div className={styles.heroControls}>
                    <div className={`${styles.statusBadge} ${dataSyncError ? styles.statusWarning : ''}`} role="status">
                      <span className={styles.statusDot} aria-hidden="true" />
                      {dataSyncError ? 'Data Sync Needs Attention' : 'Training Pipeline Connected'}
                    </div>
                    <button
                      type="button"
                      className={styles.settingsButton}
                      aria-label="Practice And Audit Settings"
                      onClick={() => openGuardedRoute('/hub/personal-assistant/leaks?settings=1')}
                    >
                      <Settings size={18} strokeWidth={2} aria-hidden="true" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {!mounted ? skeleton : (
          <>
          {dataSyncError && (
            <div className={styles.syncAlert} role="alert">
              <span className={styles.syncAlertIcon} aria-hidden="true"><AlertTriangle size={18} /></span>
              <span className={styles.syncAlertCopy}>
                <strong>Live Data Could Not Refresh</strong>
                <small>Your Saved Poker Data Is Unchanged. Retry To Refresh Sessions And Stats.</small>
              </span>
              <button type="button" className={styles.secondaryButton} onClick={retryAssistantData} disabled={isRetrying}>
                <RotateCw size={14} aria-hidden="true" />{isRetrying ? 'Retrying' : 'Retry Now'}
              </button>
            </div>
          )}

          {/* Above The Fold: Single Dynamic Your Next Step Hero Card */}
          <section className={styles.section} aria-labelledby="mission-title" data-tutorial="mission">
            <SectionBar
              id="mission-title"
              title="Your Next Step"
              meta={(statsDemo || stats?.isDemo) ? 'Preview Mode' : primaryState.badge}
            />
            <div className={styles.missionFrame} aria-live="polite" aria-busy={primaryState.state === 'loading'}>
              <div className={styles.missionPrimary}>
                <div className={styles.missionHeader}>
                  <span className={styles.missionTarget} aria-hidden="true"><Target size={20} /></span>
                  <div className={styles.missionCopy}>
                    <span className={styles.missionBadge}>{primaryState.badge}</span>
                    <h3>{primaryState.title}</h3>
                  </div>
                </div>
                <div className={styles.missionCopy}>
                  <p>{primaryState.summary}</p>
                  <span className={styles.missionSignal}>
                    <Activity size={13} aria-hidden="true" />
                    Default Scope: {PA_ANALYSIS_DEFAULTS.scopeSummary} · {describePracticePreset(assistantPrefs)}
                  </span>
                </div>
                <button
                  type="button"
                  className={styles.primaryButton}
                  onClick={runPrimaryAction}
                  disabled={primaryState.disabled || isRetrying}
                >
                  {isRetrying ? 'Retrying Data' : primaryState.ctaLabel}
                  <ChevronRight size={16} aria-hidden="true" />
                </button>
                {Array.isArray(trainingPlan?.modules) && trainingPlan.modules.length > 0 && (
                  <Link
                    href="/hub/personal-assistant/leaks?tab=plan"
                    className={styles.quietSecondaryLink}
                    onClick={(event) => {
                      event.preventDefault();
                      openGuardedRoute('/hub/personal-assistant/leaks?tab=plan');
                    }}
                  >
                    Open Training Plan · {trainingPlan.modules[0].title}
                  </Link>
                )}
              </div>

              {/* Last Session Recap: only after a finished session, never while seated at a live table */}
              {showSessionRecap && recapHands.length > 0 && (
                <div className={styles.recapStrip} role="region" aria-label="Last Session Recap" data-session-recap="true">
                  <div className={styles.missionCopy}>
                    <span className={styles.missionBadge}>Last Session Recap</span>
                    <h3>{sessionDebrief?.headline || 'Your Most Expensive Spots From Last Session'}</h3>
                    <ul className={styles.recapList}>
                      {recapHands.map((hand, index) => (
                        <li key={`${hand.handId || 'hand'}-${index}`}>
                          <strong>{[toTitleWords(hand.street), hand.position].filter(Boolean).join(' · ') || 'Hand'}</strong>
                          {hand.heroHand ? ` · ${hand.heroHand}` : ''}
                          {hand.playerAction ? ` · You: ${toTitleWords(hand.playerAction)}` : ''}
                          {hand.solverAction ? ` · Solver: ${toTitleWords(hand.solverAction)}` : ''}
                          {typeof hand.evLossBB === 'number' && Number.isFinite(hand.evLossBB) ? ` · ${Math.abs(hand.evLossBB).toFixed(2)} BB Lost` : ''}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <Link
                    href={
                      recapDrillHandId
                        ? `/hub/personal-assistant/leaks?hand=${encodeURIComponent(recapDrillHandId)}&drill=1`
                        : '/hub/personal-assistant/leaks?tab=plan'
                    }
                    className={styles.quietSecondaryLink}
                    onClick={(event) => {
                      event.preventDefault();
                      openGuardedRoute(
                        recapDrillHandId
                          ? `/hub/personal-assistant/leaks?hand=${encodeURIComponent(recapDrillHandId)}&drill=1`
                          : '/hub/personal-assistant/leaks?tab=plan',
                      );
                    }}
                  >
                    Drill Session Spots<ChevronRight size={15} aria-hidden="true" />
                  </Link>
                </div>
              )}
            </div>
          </section>

          {/* Compact 4-Metric Summary Strip -> 3-Tile Stat Strip */}
          <section className={styles.section} aria-labelledby="dashboard-title" data-tutorial="stats">
            <SectionBar id="dashboard-title" title="Summary" meta={(statsDemo || stats?.isDemo) ? 'Sample View' : 'Your Account'} />
            {(statsDemo || stats?.isDemo) && (
              <p className={styles.demoNote}>Sample View · Sign In To See Your Own Hands And Leaks.</p>
            )}
            <div className={styles.statGrid} aria-busy={statsBusy} aria-live="polite">
              {statCards.map(({ title, value, busy, label, Icon, route }) => {
                const tileBusy = statsBusy || Boolean(busy);
                const displayValue = tileBusy
                  ? 'Loading…'
                  : value === null
                    ? 'Not Available'
                    : value.toLocaleString();
                return (
                <button
                  type="button"
                  className={styles.statCard}
                  key={title}
                  onClick={() => openGuardedRoute(route)}
                  aria-label={`${title}: ${displayValue}. ${label}.`}
                >
                  <span className={styles.statCardInner}>
                    <span className={styles.statTopline}><Icon size={13} aria-hidden="true" />{title}</span>
                    <strong>{displayValue}</strong>
                    <span className={styles.statLabel}>{tileBusy ? 'Loading…' : label}</span>
                  </span>
                </button>
                );
              })}
            </div>
          </section>

          {/* Directly Below 3-Tile Stat Strip: Daily Hand Compact Interactive Card */}
          <section className={styles.section} aria-labelledby="daily-title" data-tutorial="daily">
            <SectionBar
              id="daily-title"
              title="Daily Hand"
              meta={dailyHand ? (dailyHand.position || 'Daily Spot') : 'Daily Drill'}
            />
            <div className={styles.dailyFrame}>
              {dailyHand ? (
                <div className={styles.dailyInner}>
                  <div className={styles.holeCards} aria-label={`Hero Hand ${dailyHand.heroHand || 'Unknown'}`} data-pa-verbatim="true">
                    {(heroCards.length ? heroCards : [formatCard('?'), formatCard('?')]).map((card, index) => (
                      <span
                        className={`${styles.playingCard} ${card.suitClass}`}
                        data-suit={card.suitCode}
                        data-pa-verbatim="true"
                        key={`${card.rank}${card.suit}-${index}`}
                      >
                        {card.rank}<i>{card.suit}</i>
                      </span>
                    ))}
                  </div>
                  <div className={styles.dailyCopy}>
                    <span className={styles.dailyEyebrow}>
                      {dailyHand.position || 'Daily Spot'} · {Number(dailyHand.pot) > 0 ? `Pot ${Number(dailyHand.pot)} BB` : 'Daily Scenario'}
                    </span>
                    <h3>{dailyHand.title || 'What Is The Best Line?'}</h3>
                    {boardCards.length > 0 && (
                      <div className={styles.boardCards} aria-label={`Board ${dailyHand.board}`} data-pa-verbatim="true">
                        {boardCards.map((card, index) => (
                          <span
                            className={`${styles.boardCard} ${card.suitClass}`}
                            data-suit={card.suitCode}
                            data-pa-verbatim="true"
                            key={`${card.rank}${card.suit}-${index}`}
                          >
                            {card.rank}<i>{card.suit}</i>
                          </span>
                        ))}
                      </div>
                    )}
                    <span className={styles.dailyPrompt}><Sparkles size={13} aria-hidden="true" />Continue In The Signed Training Pipeline</span>
                  </div>
                  <button type="button" className={styles.primaryButton} onClick={openDailyTraining}>
                    <Play size={14} fill="currentColor" aria-hidden="true" />Open Verified Training
                  </button>
                </div>
              ) : (
                <div
                  className={styles.dailyState}
                  role={dailyHandStatus === 'error' ? 'alert' : 'status'}
                  aria-live="polite"
                >
                  <span className={`${styles.dailyStateIcon} ${dailyHandStatus === 'loading' ? styles.dailyStateIconLoading : ''}`} aria-hidden="true">
                    <RotateCw size={20} />
                  </span>
                  <div className={styles.dailyStateCopy}>
                    <span className={styles.dailyEyebrow}>
                      {dailyHandStatus === 'loading' ? 'Syncing Training Question' : 'Training Feed Interrupted'}
                    </span>
                    <h3>{dailyHandStatus === 'loading' ? 'Loading Today’s Decision' : 'Daily Hand Temporarily Unavailable'}</h3>
                    <p>
                      {dailyHandStatus === 'loading'
                        ? 'Retrieving Today’s Hand, Board, Position, And Pot.'
                        : 'Your Other Tools Remain Available. Retry To Restore Today’s Spot.'}
                    </p>
                  </div>
                  {dailyHandStatus === 'error' && (
                    <button
                      type="button"
                      className={styles.secondaryButton}
                      onClick={() => {
                        if (!requireOnline()) return;
                        haptic('light');
                        setDailyHandReloadKey((key) => key + 1);
                      }}
                    >
                      <RotateCw size={14} aria-hidden="true" />Retry Daily Hand
                    </button>
                  )}
                </div>
              )}
            </div>
          </section>

          {/* Concise 3-Destination Quick Navigation Strip (Links, zero button clutter) */}
          <section className={styles.section} aria-label="Improvement path">
            <div className={styles.decisionLoop} data-tutorial="loop">
              <span className={styles.loopLabel}><Route size={14} aria-hidden="true" />Decision Loop</span>
              {decisionLoop.map(({ step, title, detail, route }) => (
                <Link
                  href={route}
                  className={styles.loopStep}
                  key={step}
                  onClick={(event) => {
                    event.preventDefault();
                    openGuardedRoute(route);
                  }}
                  aria-label={`${step}. ${title}. ${detail}.`}
                >
                  <span className={styles.loopNumber}>{step}</span>
                  <span><strong>{title}</strong><small>{statsBusy ? 'Syncing' : detail}</small></span>
                </Link>
              ))}
            </div>
          </section>

          {/* Single Collapsed Secondary Disclosure: Tools, Evidence Boundary & Recent Sessions */}
          <section ref={systemsSectionRef} className={styles.section} aria-labelledby="systems-title" data-tutorial="systems">
            <details className={styles.disclosure}>
              <summary id="systems-title">
                <span>Tools &amp; Evidence Boundary</span>
                <small>Live Spot Import · Scenario Archive · Sessions</small>
              </summary>
              <div className={styles.disclosureBody}>
                <div className={styles.systemGrid}>
                  {SYSTEMS.map((system) => (
                    <article className={styles.systemCard} key={system.id}>
                      <button
                        type="button"
                        className={styles.systemCardTrigger}
                        onClick={() => openGuardedRoute(system.route)}
                        aria-label={`${system.action}. ${system.description}`}
                      >
                        <SystemCardBody system={system} />
                      </button>
                    </article>
                  ))}
                  <article className={styles.systemCard} data-live-spot-card="home">
                    <button
                      type="button"
                      className={styles.liveSpotTrigger}
                      onClick={openLiveSpot}
                      aria-label={`${LIVE_SPOT_ENTRY.action}. ${LIVE_SPOT_ENTRY.description}`}
                    >
                      <SystemCardBody system={LIVE_SPOT_ENTRY} />
                    </button>
                  </article>
                </div>

                {/* Secondary Disclosure: Activity */}
                <div id="activity" data-tutorial="activity">
                  <div className={styles.sessionRail} aria-label="Recent session history" data-tutorial="sessions">
                    <div className={styles.sessionRailHeader}>
                      <span>Continue A Session</span>
                      <small>{sessionsBusy ? 'Syncing' : `${(recentSessions || []).length} Recent`}</small>
                    </div>
                    {!sessionsBusy && (recentSessions || []).length > 0 && (
                      <div className={styles.sessionList}>
                        {recentSessions.slice(0, 3).map((session) => (
                          <button
                            type="button"
                            className={styles.sessionRow}
                            key={`${session.type}-${session.id}`}
                            onClick={() => openSession(session)}
                            aria-label={`Open ${session.title}. ${sessionTypeLabel(session)}. ${formatEv(session.evLoss)}.`}
                          >
                            <span className={styles.sessionMarker} aria-hidden="true">
                              {session.type === 'leak' ? <ScanSearch size={15} /> : <FlaskConical size={15} />}
                            </span>
                            <span className={styles.sessionIdentity}>
                              <strong>{session.title}</strong>
                              <small>{sessionTypeLabel(session)}{session.isDemo ? ' · Sample' : ''}</small>
                            </span>
                            <span className={styles.sessionDate}>{formatSessionDate(session.date) || 'Recent'}</span>
                            <span className={`${styles.sessionEv} ${typeof session.evLoss === 'number' && session.evLoss < 0 ? styles.negativeEv : ''}`}>
                              {formatEv(session.evLoss)}
                            </span>
                            <ChevronRight size={15} aria-hidden="true" />
                          </button>
                        ))}
                      </div>
                    )}
                    {!sessionsBusy && (recentSessions || []).length === 0 && (
                      <p className={styles.sessionEmpty}>
                        {isSignedOut
                          ? 'Sign In To Resume Recent Leak Reviews And Study Sessions.'
                          : 'No Recent Sessions Yet. Run A Leak Audit Or Start A Verified Drill To Build History.'}
                      </p>
                    )}
                    {sessionsBusy && (
                      <p className={styles.sessionEmpty}>Syncing Recent Sessions…</p>
                    )}
                  </div>
                </div>

                <HubPageSummary page="personal-assistant" />
              </div>
            </details>
          </section>
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
          onAnalyzed={() => setTrainingPlanReloadKey((n) => n + 1)}
        />
      )}

      {UpgradePopup}
    </PageTransition>
  );
}
