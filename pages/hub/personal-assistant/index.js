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

import { useCallback, useEffect, useState } from 'react';
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
  History,
  Layers,
  Play,
  Route,
  RotateCw,
  ScanSearch,
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
import { getFreshAccessToken } from '../../../src/lib/authUtils';
import { useRecentSessions, useAssistantStats } from '../../../src/hooks/useAssistant';
import { useFeatureGate } from '../../../src/components/gates/FeatureGatePopup';
import styles from '../../../src/styles/worlds/PersonalAssistantHub.module.css';
import PersonalAssistantCopyPolicy from '../../../src/components/personal-assistant/PersonalAssistantCopyPolicy';
import { resolveDailyHeroHand } from '../../../src/lib/personal-assistant/dailyHandContract.mjs';
import {
  PA_ANALYSIS_DEFAULTS,
  resolveHomePrimaryState,
} from '../../../src/lib/personal-assistant/assistantDefaults.mjs';

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

  const haptic = useHaptics();
  const online = useOnlineStatus();

  const requireOnline = useCallback(() => {
    if (online) return true;
    toast.error(OFFLINE_TOAST);
    return false;
  }, [online]);

  const closeMenu = useCallback(() => setShowMenu(false), []);
  useModalHistory(showMenu, closeMenu);

  const { guardAction, UpgradePopup } = useFeatureGate('personal_assistant');
  const menuConfig = getMenuConfig('hub-home', user, {}, {});
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
    if (!statsLoading && !sessionsLoading) setDataLoading(false);
  }, [statsLoading, sessionsLoading]);
  useLoadFailsafe(dataLoading, setDataLoading);
  const statsBusy = statsLoading && dataLoading;
  const sessionsBusy = sessionsLoading && dataLoading;

  useEffect(() => { setMounted(true); }, []);

  const [trainingPlanReloadKey, setTrainingPlanReloadKey] = useState(0);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const handleAssistantUpdate = () => {
      try { refetchSessions?.(); } catch (error) { console.warn('[App] Handled exception:', error?.message || error); }
      try { refetchStats?.(); } catch (error) { console.warn('[App] Handled exception:', error?.message || error); }
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

  useEffect(() => {
    if (authInitializing || !user?.id) {
      setCoachingSnapshot(null);
      return undefined;
    }
    let cancelled = false;
    const controller = new AbortController();
    const loadPlan = async () => {
      try {
        const token = await getFreshAccessToken();
        if (!token || cancelled) return;
        const response = await fetch('/api/assistant/coaching', {
          cache: 'no-store',
          headers: { Authorization: `Bearer ${token}` },
          signal: controller.signal,
        });
        const payload = await response.json().catch(() => null);
        if (!cancelled && response.ok && payload?.success && payload?.snapshot) {
          setCoachingSnapshot(payload.snapshot);
        }
      } catch (_) {
        // Optional enrichment on hub overview; Leak Finder holds full retry UI.
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
    const hand = String(raw || '').replace(/[\s,]/g, '');
    return /^([2-9TJQKA][shdc]){2}$/i.test(hand) ? hand : null;
  };

  const normalizeBoardCards = (raw) => {
    const cards = String(raw || '').replace(/[\s,]/g, '').match(/[2-9TJQKA][shdc]/gi) || [];
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

  const activeLeakCount = Number(stats?.leaksFound) || 0;
  const handsAnalyzedCount = Number(stats?.handsAnalyzed) || 0;
  const sessionsReviewedCount = Number(stats?.sessionsReviewed) || 0;
  const dataSyncError = statsError || sessionsError;
  const trainingPlan = coachingSnapshot?.trainingPlan || null;
  const reviewDueCount = Number(coachingSnapshot?.summary?.reviewsDue || 0);
  const topPriority = coachingSnapshot?.priorities?.[0] || null;
  const activeAuditRunning = Boolean(coachingSnapshot?.activeAuditRunning);

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
    reviewDueCount,
    activeLeaksCount: activeLeakCount,
    topLeakTitle: topPriority?.title || trainingPlan?.modules?.[0]?.title || null,
    handsAnalyzed: handsAnalyzedCount,
    sessionsReviewed: sessionsReviewedCount,
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
    openGuardedRoute('/hub/training?source=personal-assistant-priority');
  };

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
      detail: `${activeLeakCount.toLocaleString()} Active Leak${activeLeakCount === 1 ? '' : 's'}`,
      Icon: ScanSearch,
      route: '/hub/personal-assistant/leaks',
    },
    {
      step: '03',
      title: 'Train',
      detail: `${handsAnalyzedCount.toLocaleString()} Analyzed`,
      Icon: BrainCircuit,
      route: '/hub/training?source=personal-assistant-loop',
    },
  ];

  const statCards = [
    { title: 'Active Leaks', value: stats?.leaksFound || 0, label: `${(stats?.resolvedLeaks || 0).toLocaleString()} Resolved`, Icon: Droplet, route: '/hub/personal-assistant/leaks' },
    { title: 'Hands Analyzed', value: stats?.handsAnalyzed || 0, label: 'Verified Audits', Icon: Layers, route: '/hub/personal-assistant/leaks' },
    { title: 'Sessions Reviewed', value: stats?.sessionsReviewed || 0, label: 'Records', Icon: History, route: '/hub/personal-assistant/sandbox' },
    { title: 'Archived Sessions', value: stats?.sandboxSessions || 0, label: 'Archive', Icon: FlaskConical, route: '/hub/personal-assistant/sandbox' },
  ];

  const activityCards = [
    {
      title: 'Recent Sessions',
      label: sessionsBusy
        ? 'Loading Session History…'
        : (recentSessions || []).length > 0
          ? `${(recentSessions || []).length} Session${recentSessions.length === 1 ? '' : 's'} Available`
          : 'No Sessions Yet',
      detail: (recentSessions || [])[0]
        ? `${recentSessions[0].title}${recentSessions[0].isDemo ? ' (Sample)' : ''} · ${formatEv(recentSessions[0].evLoss)}`
        : 'Open Verified Training',
      Icon: Clock3,
      onClick: () => openGuardedRoute('/hub/training?source=personal-assistant-activity'),
    },
    {
      title: 'Leak Finder',
      label: statsBusy ? 'Loading Leak Data…' : `${(stats?.leaksFound || 0).toLocaleString()} Active`,
      detail: statsBusy ? 'Checking Progress' : `${(stats?.resolvedLeaks || 0).toLocaleString()} Resolved`,
      Icon: ScanSearch,
      onClick: () => openGuardedRoute('/hub/personal-assistant/leaks'),
    },
    {
      title: 'Coaching & Settings',
      label: 'Plan, Goals, Export, Privacy',
      detail: 'Open Coaching Workspace',
      Icon: Activity,
      onClick: () => openGuardedRoute('/hub/personal-assistant/leaks?tab=coaching&view=coach'),
    },
    {
      title: 'Training Center',
      label: 'Signed Solver Practice',
      detail: 'Open Training',
      Icon: BrainCircuit,
      onClick: () => openGuardedRoute('/hub/training'),
    },
  ];

  const formatCard = (card) => {
    const match = String(card || '').match(/^([2-9TJQKA])([shdc])$/i);
    if (!match) return { rank: String(card || '?'), suit: '', red: false };
    const suitMap = { s: '♠', h: '♥', d: '♦', c: '♣' };
    return { rank: match[1].toUpperCase(), suit: suitMap[match[2].toLowerCase()], red: /[hd]/i.test(match[2]) };
  };

  const heroCards = (normalizeHeroHand(dailyHand?.heroHand)?.match(/.{2}/g) || []).map(formatCard);
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
        maxWidth={640}
        header={<UniversalHeader pageDepth={1} onMenuClick={() => setShowMenu(!showMenu)} />}
      >
      <div className={styles.page}>
        <HamburgerMenu
          isOpen={showMenu}
          onClose={closeMenu}
          direction="left"
          theme="dark"
          menuItems={menuConfig.menuItems}
          bottomLinks={menuConfig.bottomLinks}
        />

        {/* Compact single-row MTT lobby tab strip */}
        <nav className={styles.tabs} aria-label="Personal Assistant Sections" data-tutorial="nav">
          <a className={styles.activeTab} href="#overview" aria-current="page" onClick={() => haptic('light')}>Overview</a>
          <button type="button" onClick={() => openGuardedRoute('/hub/personal-assistant/leaks')}>Leak Finder</button>
          <button type="button" onClick={() => openGuardedRoute('/hub/training')}>Training Center</button>
        </nav>

        <PullToRefresh onRefresh={retryAssistantData} disabled={showMenu}>
        <main className={styles.main} id="overview">
          {/* Compact MTT lobby header plaque (zero data deps -> instant LCP) */}
          <section className={`${styles.frame} ${styles.hero}`} aria-labelledby="assistant-title">
            <div className={styles.heroInner}>
              <div className={styles.heroCopy}>
                <span className={styles.eyebrow}>Personal Poker Assistant</span>
                <h1 id="assistant-title">Personal Assistant</h1>
                <p>Find Leaks In Your Completed Club Arena Hands And Practice The Exact Spots Costing You Chips.</p>
                <div className={styles.heroMetaRow}>
                  <div className={`${styles.statusBadge} ${dataSyncError ? styles.statusWarning : ''}`} role="status">
                    <span className={styles.statusDot} aria-hidden="true" />
                    {dataSyncError ? 'Data Sync Needs Attention' : 'Training Pipeline Connected'}
                  </div>
                </div>
                <div className={styles.heroActions}>
                  <button
                    type="button"
                    className={styles.secondaryButton}
                    onClick={() => openGuardedRoute('/hub/training?source=personal-assistant-hero')}
                  >
                    <Play size={14} fill="currentColor" aria-hidden="true" />Open Verified Training
                  </button>
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

          {/* Primary State-Driven Next Action Card */}
          <section className={styles.section} aria-labelledby="mission-title" data-tutorial="mission">
            <SectionBar
              id="mission-title"
              title="Next Action"
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
                    Default Scope: {PA_ANALYSIS_DEFAULTS.scopeSummary}
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
              </div>

              <div className={styles.decisionLoop} aria-label="Improvement path" data-tutorial="loop">
                <span className={styles.loopLabel}><Route size={14} aria-hidden="true" />Decision Loop</span>
                {decisionLoop.map(({ step, title, detail, Icon, route }) => (
                  <button
                    type="button"
                    className={styles.loopStep}
                    key={step}
                    onClick={() => openGuardedRoute(route)}
                    aria-label={`${step}. ${title}. ${detail}.`}
                  >
                    <span className={styles.loopNumber}>{step}</span>
                    <span><strong>{title}</strong><small>{statsBusy ? 'Syncing' : detail}</small></span>
                  </button>
                ))}
              </div>

              {Array.isArray(trainingPlan?.modules) && trainingPlan.modules.length > 0 && (
                <div className={styles.missionPrimary} aria-label="Deterministic Training Plan Preview">
                  <div className={styles.missionCopy}>
                    <span className={styles.missionBadge}>
                      {trainingPlan.modules[0].formatScope} · {trainingPlan.modules[0].tableVerification?.label || 'Training In Progress'}
                    </span>
                    <h3>Next Drill: {trainingPlan.modules[0].title}</h3>
                    <p>{trainingPlan.modules[0].objective}</p>
                  </div>
                  <button
                    type="button"
                    className={styles.secondaryButton}
                    onClick={() => openGuardedRoute('/hub/personal-assistant/leaks?tab=coaching&view=coach')}
                  >
                    Open Training Plan<ChevronRight size={16} aria-hidden="true" />
                  </button>
                </div>
              )}
            </div>
          </section>

          {/* Compact 4-Metric Summary Strip */}
          <section className={styles.section} aria-labelledby="dashboard-title" data-tutorial="stats">
            <SectionBar id="dashboard-title" title="Summary" meta={(statsDemo || stats?.isDemo) ? 'Sample View' : 'Your Account'} />
            {(statsDemo || stats?.isDemo) && (
              <p className={styles.demoNote}>Sample View · Sign In To See Your Own Hands And Leaks.</p>
            )}
            <div className={styles.statGrid} aria-busy={statsBusy} aria-live="polite">
              {statCards.map(({ title, value, label, Icon, route }) => (
                <button
                  type="button"
                  className={styles.statCard}
                  key={title}
                  onClick={() => openGuardedRoute(route)}
                  aria-label={`${title}: ${Number(value).toLocaleString()}. ${label}.`}
                >
                  <span className={styles.statCardInner}>
                    <span className={styles.statTopline}><Icon size={14} aria-hidden="true" />{title}</span>
                    <strong>{statsBusy ? 'Not Available' : Number(value).toLocaleString()}</strong>
                    <span className={styles.statLabel}>{statsBusy ? 'Loading…' : label}</span>
                  </span>
                </button>
              ))}
            </div>
          </section>

          {/* Secondary Disclosures: More Tools & Evidence Archive */}
          <section className={styles.section} aria-labelledby="systems-title" data-tutorial="systems">
            <details className={styles.disclosure}>
              <summary id="systems-title">
                <span>Tools &amp; Evidence Boundary</span>
                <small>Leak Finder · Scenario Archive</small>
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
                        <span className={styles.systemCardInner}>
                          <div className={styles.systemCopy}>
                            <div>
                              <span className={styles.systemEyebrow}>{system.eyebrow}</span>
                              <h3>{system.title}</h3>
                              <p>{system.description}</p>
                              <ul>
                                {system.features.map((feature) => (
                                  <li key={feature}><CheckCircle2 size={13} aria-hidden="true" />{feature}</li>
                                ))}
                              </ul>
                            </div>
                            <span className={styles.secondaryButton}>
                              {system.action}<ChevronRight size={15} aria-hidden="true" />
                            </span>
                          </div>
                        </span>
                      </button>
                    </article>
                  ))}
                </div>
              </div>
            </details>
          </section>

          {/* Secondary Disclosure: Activity & Recent Sessions */}
          <section className={styles.section} id="activity" aria-labelledby="activity-title" data-tutorial="activity">
            <details className={styles.disclosure}>
              <summary id="activity-title">
                <span>Activity, Sessions &amp; Settings</span>
                <small>{(recentSessions || []).length} Recent</small>
              </summary>
              <div className={styles.disclosureBody}>
                <div className={styles.activityGrid}>
                  {activityCards.map(({ title, label, detail, Icon, onClick }) => (
                    <button type="button" className={styles.activityCard} key={title} onClick={onClick}>
                      <span className={styles.activityCardInner}>
                        <span className={styles.activityIcon}><Icon size={17} aria-hidden="true" /></span>
                        <span className={styles.activityContent}>
                          <strong>{title}</strong>
                          <span>{label}</span>
                          <small>{detail}</small>
                        </span>
                        <ChevronRight className={styles.activityChevron} size={15} aria-hidden="true" />
                      </span>
                    </button>
                  ))}
                </div>
                {!sessionsBusy && (recentSessions || []).length > 0 && (
                  <div className={styles.sessionRail} aria-label="Recent session history" data-tutorial="sessions">
                    <div className={styles.sessionRailHeader}>
                      <span>Continue A Session</span>
                      <small>Most Recent First</small>
                    </div>
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
                  </div>
                )}
              </div>
            </details>
          </section>

          {/* Secondary Disclosure: Hand Of The Day */}
          <section className={styles.section} aria-labelledby="daily-title" data-tutorial="daily">
            <details className={styles.disclosure}>
              <summary id="daily-title">
                <span>Hand Of The Day</span>
                <small>{dailyHand ? (dailyHand.position || 'Daily Spot') : 'Daily Drill'}</small>
              </summary>
              <div className={styles.disclosureBody}>
                <div className={styles.dailyFrame}>
                  {dailyHand ? (
                    <div className={styles.dailyInner}>
                      <div className={styles.holeCards} aria-label={`Hero hand ${dailyHand.heroHand || 'unknown'}`}>
                        {(heroCards.length ? heroCards : [formatCard('?'), formatCard('?')]).map((card, index) => (
                          <span className={`${styles.playingCard} ${card.red ? styles.redCard : ''}`} key={`${card.rank}${card.suit}-${index}`}>
                            {card.rank}<i>{card.suit}</i>
                          </span>
                        ))}
                      </div>
                      <div className={styles.dailyCopy}>
                        <span className={styles.dailyEyebrow}>
                          {dailyHand.position || 'BTN'} · {Number(dailyHand.pot) > 0 ? `Pot ${Number(dailyHand.pot)} BB` : 'Daily Scenario'}
                        </span>
                        <h3>{dailyHand.title || 'What Is The Best Line?'}</h3>
                        {boardCards.length > 0 && (
                          <div className={styles.boardCards} aria-label={`Board ${dailyHand.board}`}>
                            {boardCards.map((card, index) => (
                              <span className={`${styles.boardCard} ${card.red ? styles.redCard : ''}`} key={`${card.rank}${card.suit}-${index}`}>
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
              </div>
            </details>
          </section>
          </>
          )}
          <HubPageSummary page="personal-assistant" />
        </main>
        </PullToRefresh>
      </div>
      </HubPageShell>

      {UpgradePopup}
    </PageTransition>
  );
}
