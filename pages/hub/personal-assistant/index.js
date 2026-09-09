/**
 * PERSONAL ASSISTANT · Jarvis Strategy Hub
 * /hub/personal-assistant
 *
 * The page keeps the existing data, routes, access gates, and recovery flows,
 * while using the same machined black/chrome/cyan system as the Club Shop.
 *
 * MOBILE PHASE 4 (docs/mobile-standard/ROLLOUT-PLAN.md). Everything is always
 * displayed: the five section anchors are a wrapping grid rather than a snap
 * carousel, the Decision Loop keeps its label and each session keeps its date.
 * The page carries the phase 0a foundation: HubPageShell (100dvh, no second
 * bottom pad), useLoadFailsafe so a stalled hook cannot pin "Calibrating"
 * forever, useOnlineStatus + OfflineBar on the one network action, useHaptics
 * on every navigation tap, PullToRefresh over the content, and useModalHistory
 * so Back closes the menu instead of leaving the route.
 */

import { useCallback, useEffect, useState } from 'react';
import Head from 'next/head';
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
import { useRecentSessions, useAssistantStats } from '../../../src/hooks/useAssistant';
import { useFeatureGate } from '../../../src/components/gates/FeatureGatePopup';
import styles from '../../../src/styles/worlds/PersonalAssistantHub.module.css';
import PersonalAssistantCopyPolicy from '../../../src/components/personal-assistant/PersonalAssistantCopyPolicy';
import { resolveDailyHeroHand } from '../../../src/lib/personal-assistant/dailyHandContract.mjs';

const SYSTEMS = [
  {
    id: 'sandbox',
    eyebrow: 'Verified Evidence Boundary',
    title: 'Scenario Analysis Archive',
    description: 'Review why approximate scenario grading is retired, then continue in evidence-backed Training.',
    features: ['No Approximate Grades', 'No Substituted Spots', 'Open Verified Training'],
    action: 'Review Evidence Gate',
    image: '/images/personal-assistant-v2/sandbox-system.webp',
    route: '/hub/personal-assistant/sandbox',
  },
  {
    id: 'leaks',
    eyebrow: 'Track And Improve Your Game',
    title: 'Leak Finder',
    description: 'Turn your session history into focused training with leak detection, progress signals, and next actions.',
    features: ['Detect Statistical Leaks', 'Track Progress Over Time', 'Open Targeted Training'],
    action: 'View Leaks',
    image: '/images/personal-assistant-v2/leak-finder-system.webp',
    route: '/hub/personal-assistant/leaks',
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

  // Offline: the network action explains instead of firing. OfflineBar in
  // pages/_app.js is the global banner; this is the per-action guard.
  const requireOnline = useCallback(() => {
    if (online) return true;
    toast.error(OFFLINE_TOAST);
    return false;
  }, [online]);

  // Back closes the menu instead of leaving the route (mobile phase 0a).
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

  /* LOAD FAILSAFE (mobile phase 0a). `useRecentSessions` / `useAssistantStats`
     own their own `isLoading`, and a request that never settles used to pin
     the Priority Queue on "Calibrating - Reading Your Latest Poker Data" with
     no way out. This mirrors both flags into one the page owns, caps it at
     eight seconds, and every "is it still loading" read below goes through the
     capped pair. The underlying hooks are untouched, so a late answer still
     lands. */
  const [dataLoading, setDataLoading] = useState(true);
  useEffect(() => {
    if (!statsLoading && !sessionsLoading) setDataLoading(false);
  }, [statsLoading, sessionsLoading]);
  useLoadFailsafe(dataLoading, setDataLoading);
  const statsBusy = statsLoading && dataLoading;
  const sessionsBusy = sessionsLoading && dataLoading;

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const handleSandboxUpdate = () => {
      try { refetchSessions?.(); } catch (error) { console.warn('[App] Handled exception:', error?.message || error); }
    };
    window.addEventListener('pa-sandbox-updated', handleSandboxUpdate);
    return () => {
      window.removeEventListener('pa-sandbox-updated', handleSandboxUpdate);
    };
  }, [refetchSessions]);

  const [dailyHand, setDailyHand] = useState(null);
  const [dailyHandStatus, setDailyHandStatus] = useState('loading');
  const [dailyHandReloadKey, setDailyHandReloadKey] = useState(0);
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
    if (guardAction()) router.push(route);
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
    typeof value === 'number' && Number.isFinite(value) ? `${value.toFixed(2)} BB` : 'EV ·'
  );

  const sessionTypeLabel = (session) => (
    session?.type === 'leak' ? 'Leak Review' : 'Sandbox Session'
  );

  const lastRealSession = (recentSessions || []).find(
    (session) => session && !session.isDemo && session.type === 'sandbox',
  ) || null;

  const activeLeakCount = Number(stats?.leaksFound) || 0;
  const handsAnalyzedCount = Number(stats?.handsAnalyzed) || 0;
  const dataSyncError = statsError || sessionsError;

  const retryAssistantData = useCallback(async () => {
    if (isRetrying) return;
    if (!requireOnline()) return;
    haptic('light');
    setIsRetrying(true);
    setDataLoading(true);
    try {
      await Promise.allSettled([
        Promise.resolve(refetchStats?.()),
        Promise.resolve(refetchSessions?.()),
      ]);
    } finally {
      setIsRetrying(false);
      setDataLoading(false);
    }
  }, [isRetrying, requireOnline, haptic, refetchStats, refetchSessions]);

  const nextMission = (() => {
    if (statsBusy || sessionsBusy) {
      return {
        mode: 'loading',
        badge: 'Calibrating',
        title: 'Reading Your Latest Poker Data',
        description: 'Jarvis Is Checking Your Sessions, Analysis History, And Active Leaks.',
        action: 'Syncing Data',
        signal: 'Live Data Link',
      };
    }

    if (dataSyncError) {
      return {
        mode: 'reconnect',
        badge: 'Data Link Interrupted',
        title: 'Reconnect Your Live Poker Data',
        description: 'Jarvis Could Not Confirm Your Latest Sessions And Stats. Retry Before Acting On The Priority Queue.',
        action: isRetrying ? 'Retrying Data' : 'Retry Live Data',
        signal: 'Your Saved Data Is Unchanged',
      };
    }

    if (activeLeakCount > 0) {
      return {
        mode: 'leaks',
        badge: 'Highest Priority',
        title: `Review ${activeLeakCount} Active Leak${activeLeakCount === 1 ? '' : 's'}`,
        description: 'Resolve The Repeated Decisions Costing You EV Before Adding More Volume.',
        action: 'Open Leak Finder',
        signal: `${Number(stats?.resolvedLeaks || 0).toLocaleString()} Already Resolved`,
      };
    }

    if (lastRealSession) {
      return {
        mode: 'resume',
        badge: 'Historical Record',
        title: lastRealSession.title,
        description: 'Review The Evidence Boundary For Historical Sandbox Records. Approximate Sessions Cannot Resume As Scored Analysis.',
        action: 'Review Archive',
        signal: formatSessionDate(lastRealSession.date) || 'Most Recent Session',
      };
    }

    if (dailyHand) {
      return {
        mode: 'daily',
        badge: 'Daily Decision',
        title: dailyHand.title || 'Solve Today’s Featured Spot',
        description: 'Continue In The Signed Training Pipeline For Server-Delivered Questions And Grading.',
        action: 'Open Verified Training',
        signal: dailyHand.position || 'Daily Scenario',
      };
    }

    return {
      mode: 'start',
      badge: 'Recommended Start',
      title: 'Start Evidence-Backed Training',
      description: 'Open The Signed Training Pipeline For Verified Question Delivery, Grading, And Feedback.',
      action: 'Open Verified Training',
      signal: 'Signed Attempt Required',
    };
  })();

  const runNextMission = () => {
    if (nextMission.mode === 'loading') return;
    if (nextMission.mode === 'reconnect') {
      retryAssistantData();
      return;
    }
    if (nextMission.mode === 'leaks') {
      openGuardedRoute('/hub/personal-assistant/leaks');
      return;
    }
    if (nextMission.mode === 'resume') {
      openSession(lastRealSession);
      return;
    }
    if (nextMission.mode === 'daily') {
      openDailyTraining();
      return;
    }
    openGuardedRoute('/hub/training?source=personal-assistant-priority');
  };

  const decisionLoop = [
    {
      step: '01',
      title: 'Train',
      detail: 'Signed Question And Grading Pipeline',
      Icon: FlaskConical,
      route: '/hub/training?source=personal-assistant-loop',
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
      detail: `${handsAnalyzedCount.toLocaleString()} Hand${handsAnalyzedCount === 1 ? '' : 's'} Analyzed`,
      Icon: BrainCircuit,
      route: '/hub/training',
    },
  ];

  const statCards = [
    { title: 'Sessions Reviewed', value: stats?.sessionsReviewed || 0, label: 'Historical Records', Icon: History, route: '/hub/personal-assistant/sandbox' },
    { title: 'Hands Analyzed', value: stats?.handsAnalyzed || 0, label: 'Recorded Reviews', Icon: Layers, route: '/hub/personal-assistant/leaks' },
    { title: 'Active Leaks', value: stats?.leaksFound || 0, label: `${(stats?.resolvedLeaks || 0).toLocaleString()} Resolved`, Icon: Droplet, route: '/hub/personal-assistant/leaks' },
    { title: 'Archived Sessions', value: stats?.sandboxSessions || 0, label: 'Historical Sandbox Records', Icon: FlaskConical, route: '/hub/personal-assistant/sandbox' },
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
      title: 'New Leaks',
      label: statsBusy ? 'Loading Leak Data…' : `${(stats?.leaksFound || 0).toLocaleString()} Active`,
      detail: statsBusy ? 'Checking Progress' : `${(stats?.resolvedLeaks || 0).toLocaleString()} Resolved`,
      Icon: ScanSearch,
      onClick: () => openGuardedRoute('/hub/personal-assistant/leaks'),
    },
    {
      title: 'Last Session',
      label: sessionsBusy ? 'Loading Last Session…' : (lastRealSession?.title || 'Nothing To Restore Yet'),
      detail: lastRealSession ? formatSessionDate(lastRealSession.date) : 'No Historical Record Yet',
      Icon: Activity,
      onClick: () => (lastRealSession ? openSession(lastRealSession) : openGuardedRoute('/hub/personal-assistant/sandbox')),
    },
    {
      title: 'Training Center',
      label: 'Build Your Decision-Making',
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

  /* The first paint used to be a black page with one centred 12px line until
     `mounted` flipped, so the largest contentful paint was that string and
     nothing about the page was on screen. The shell, header and the five
     section anchors now paint on the server; only the data blocks below are
     placeholders, and they carry the same heights as the real content so
     nothing jumps when it arrives. */
  const skeleton = (
    <div className={styles.skel} aria-hidden="true">
      <div className={`${styles.skelBlock} ${styles.skelHero}`} />
      <div className={`${styles.skelBlock} ${styles.skelBar}`} />
      <div className={`${styles.skelBlock} ${styles.skelCard}`} />
      <div className={styles.skelRow}>
        <div className={`${styles.skelBlock} ${styles.skelCard}`} />
        <div className={`${styles.skelBlock} ${styles.skelCard}`} />
        <div className={`${styles.skelBlock} ${styles.skelCard}`} />
        <div className={`${styles.skelBlock} ${styles.skelCard}`} />
      </div>
    </div>
  );

  return (
    <PageTransition>
      <SEOHead
        title="Personal Poker Assistant - Jarvis AI"
        description="Get Personalized Poker Coaching, Hand Analysis, And Strategy Advice From Jarvis, Your AI Poker Assistant."
        canonical="/hub/personal-assistant"
      />
      <Head>
        <link
          rel="preload"
          as="image"
          href="/images/personal-assistant-v2/jarvis-hero.webp"
          type="image/webp"
        />
      </Head>

      <PersonalAssistantCopyPolicy />
      <HubPageShell
        className="pa"
        maxWidth={1240}
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

        {/* Five anchors, every one on screen at 375. This was a hidden-scrollbar
            snap carousel of 126px cards below 640 (the "slide to see" ban). */}
        <nav className={styles.tabs} aria-label="Personal Assistant Sections" data-tutorial="nav">
          <a className={styles.activeTab} href="#overview" aria-current="page" onClick={() => haptic('light')}>Overview</a>
          <button type="button" onClick={() => openGuardedRoute('/hub/personal-assistant/sandbox')}>Scenario Archive</button>
          <button type="button" onClick={() => openGuardedRoute('/hub/personal-assistant/leaks')}>Leak Finder</button>
          <button type="button" onClick={() => openGuardedRoute('/hub/training')}>Training Center</button>
          <a href="#activity" onClick={() => haptic('light')}>Activity</a>
        </nav>

        {/* Pull down at the top to re-read sessions and stats. Off while the
            menu is open so a drag inside it cannot fire a reload underneath. */}
        <PullToRefresh onRefresh={retryAssistantData} disabled={showMenu}>
        <main className={styles.main} id="overview">
          {!mounted ? skeleton : (
          <>
          <section className={`${styles.frame} ${styles.hero}`} aria-labelledby="assistant-title">
            <div className={styles.heroInner}>
              <div className={styles.heroCopy}>
                <span className={styles.eyebrow}>Personal Poker Assistant</span>
                <h1 id="assistant-title">Meet Jarvis.<br />Your Edge At The Table.</h1>
                <p>Open Verified Training, Find Leaks, And Turn Evidence-Backed Reviews Into Better Decisions From One Command Center.</p>
                <div className={`${styles.statusBadge} ${dataSyncError ? styles.statusWarning : ''}`} role="status">
                  <span className={styles.statusDot} aria-hidden="true" />
                  {dataSyncError ? 'Jarvis Online · Data Sync Needs Attention' : 'Jarvis Online · Training Pipeline Connected'}
                </div>
                <div className={styles.heroActions}>
                  <button
                    type="button"
                    className={styles.primaryButton}
                    onClick={() => openGuardedRoute('/hub/training?source=personal-assistant-hero')}
                  >
                    <Play size={15} fill="currentColor" aria-hidden="true" />Open Verified Training
                  </button>
                  {lastRealSession && (
                    <button
                      type="button"
                      className={styles.secondaryButton}
                      onClick={() => openSession(lastRealSession)}
                    >
                      <History size={15} aria-hidden="true" />Continue Last Session
                    </button>
                  )}
                </div>
              </div>
            </div>
          </section>

          {dataSyncError && (
            <div className={styles.syncAlert} role="alert">
              <span className={styles.syncAlertIcon} aria-hidden="true"><AlertTriangle size={18} /></span>
              <span className={styles.syncAlertCopy}>
                <strong>Live Data Could Not Refresh</strong>
                <small>Your Saved Poker Data Is Unchanged. Retry The Connection To Refresh Sessions And Statistics.</small>
              </span>
              <button type="button" className={styles.secondaryButton} onClick={retryAssistantData} disabled={isRetrying}>
                <RotateCw size={14} aria-hidden="true" />{isRetrying ? 'Retrying' : 'Retry Now'}
              </button>
            </div>
          )}

          <section className={`${styles.section} ${styles.missionSection}`} aria-labelledby="mission-title" data-tutorial="mission">
            <SectionBar
              id="mission-title"
              title="Jarvis Priority Queue"
              meta={(statsDemo || stats?.isDemo) ? 'Sample Recommendation' : 'Personalized Next Move'}
            />
            <div className={styles.missionFrame} aria-live="polite" aria-busy={nextMission.mode === 'loading'}>
              <div className={styles.missionPrimary}>
                <span className={styles.missionTarget} aria-hidden="true"><Target size={25} /></span>
                <div className={styles.missionCopy}>
                  <span className={styles.missionBadge}>{nextMission.badge}</span>
                  <h3>{nextMission.title}</h3>
                  <p>{nextMission.description}</p>
                  <span className={styles.missionSignal}><Activity size={13} aria-hidden="true" />{nextMission.signal}</span>
                </div>
                <button
                  type="button"
                  className={styles.primaryButton}
                  onClick={runNextMission}
                  disabled={nextMission.mode === 'loading' || isRetrying}
                >
                  {nextMission.action}<ChevronRight size={16} aria-hidden="true" />
                </button>
              </div>
              {/* The label used to be `display: none` below 960, leaving three
                  numbered steps with nothing saying what the row is. */}
              <div className={styles.decisionLoop} aria-label="Jarvis improvement path" data-tutorial="loop">
                <span className={styles.loopLabel}><Route size={15} aria-hidden="true" />Decision Loop</span>
                {decisionLoop.map(({ step, title, detail, Icon, route }) => (
                  <button
                    type="button"
                    className={styles.loopStep}
                    key={step}
                    onClick={() => openGuardedRoute(route)}
                    aria-label={`${step}. ${title}. ${detail}.`}
                  >
                    <span className={styles.loopNumber}>{step}</span>
                    <Icon size={17} aria-hidden="true" />
                    <span><strong>{title}</strong><small>{statsBusy ? 'Syncing Live Data' : detail}</small></span>
                    <ChevronRight size={14} aria-hidden="true" />
                  </button>
                ))}
              </div>
            </div>
          </section>

          <section className={styles.section} aria-labelledby="systems-title" data-tutorial="systems">
            <SectionBar id="systems-title" title="Choose Your Tool" meta="2 Systems Available" />
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
                    <div
                      className={styles.systemArt}
                      style={{ backgroundImage: `url(${system.image})` }}
                      role="img"
                      aria-label={`${system.title} holographic system artwork`}
                    />
                    <div className={styles.systemCopy}>
                      <div>
                        <span className={styles.systemEyebrow}>{system.eyebrow}</span>
                        <h3>{system.title}</h3>
                        <p>{system.description}</p>
                        <ul>
                          {system.features.map((feature) => (
                            <li key={feature}><CheckCircle2 size={14} aria-hidden="true" />{feature}</li>
                          ))}
                        </ul>
                      </div>
                      <span className={system.id === 'sandbox' ? styles.primaryButton : styles.secondaryButton}>
                        {system.action}<ChevronRight size={16} aria-hidden="true" />
                      </span>
                    </div>
                  </span>
                  </button>
                </article>
              ))}
            </div>
          </section>

          <section className={styles.section} aria-labelledby="dashboard-title" data-tutorial="stats">
            <SectionBar id="dashboard-title" title="Dashboard Overview" meta="Live Performance" />
            {(statsDemo || stats?.isDemo) && (
              <p className={styles.demoNote}>Sample View · Sign In To See Your Own Sessions, Hands, And Leaks.</p>
            )}
            <div className={styles.statGrid} aria-busy={statsBusy} aria-live="polite">
              {statCards.map(({ title, value, label, Icon, route }) => (
                <button
                  type="button"
                  className={styles.statCard}
                  key={title}
                  onClick={() => openGuardedRoute(route)}
                  aria-label={`${title}: ${Number(value).toLocaleString()}. ${label}. View Details.`}
                >
                  <span className={styles.statCardInner}>
                    <span className={styles.statTopline}><Icon size={17} aria-hidden="true" />{title}</span>
                    <strong>{statsBusy ? 'Not Available' : Number(value).toLocaleString()}</strong>
                    <span className={styles.statLabel}>{statsBusy ? 'Loading Live Data…' : label}</span>
                    <span className={styles.statAction}>View Details<ChevronRight size={13} aria-hidden="true" /></span>
                  </span>
                </button>
              ))}
            </div>
          </section>

          <section className={styles.section} id="activity" aria-labelledby="activity-title" data-tutorial="activity">
            <SectionBar id="activity-title" title="Your Activity" meta="Recent Data" />
            <div className={styles.activityGrid}>
              {activityCards.map(({ title, label, detail, Icon, onClick }) => (
                <button type="button" className={styles.activityCard} key={title} onClick={onClick}>
                  <span className={styles.activityCardInner}>
                    <span className={styles.activityIcon}><Icon size={21} aria-hidden="true" /></span>
                    <span className={styles.activityContent}>
                      <strong>{title}</strong>
                      <span>{label}</span>
                      <small>{detail}</small>
                    </span>
                    <ChevronRight className={styles.activityChevron} size={17} aria-hidden="true" />
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
                        {session.type === 'leak' ? <ScanSearch size={17} /> : <FlaskConical size={17} />}
                      </span>
                      <span className={styles.sessionIdentity}>
                        <strong>{session.title}</strong>
                        <small>{sessionTypeLabel(session)}{session.isDemo ? ' · Sample' : ''}</small>
                      </span>
                      <span className={styles.sessionDate}>{formatSessionDate(session.date) || 'Recent'}</span>
                      <span className={`${styles.sessionEv} ${typeof session.evLoss === 'number' && session.evLoss < 0 ? styles.negativeEv : ''}`}>
                        {formatEv(session.evLoss)}
                      </span>
                      <ChevronRight size={17} aria-hidden="true" />
                    </button>
                  ))}
                </div>
              </div>
            )}
          </section>

          <section className={styles.section} aria-labelledby="daily-title" data-tutorial="daily">
            <SectionBar id="daily-title" title="Hand Of The Day" meta="Daily Decision Drill" />
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
                    <span className={styles.dailyPrompt}><Sparkles size={14} aria-hidden="true" />Continue In The Signed Training Pipeline</span>
                  </div>
                  <button type="button" className={styles.primaryButton} onClick={openDailyTraining}>
                    <Play size={15} fill="currentColor" aria-hidden="true" />Open Verified Training
                  </button>
                </div>
              ) : (
                <div
                  className={styles.dailyState}
                  role={dailyHandStatus === 'error' ? 'alert' : 'status'}
                  aria-live="polite"
                >
                  <span className={`${styles.dailyStateIcon} ${dailyHandStatus === 'loading' ? styles.dailyStateIconLoading : ''}`} aria-hidden="true">
                    <RotateCw size={23} />
                  </span>
                  <div className={styles.dailyStateCopy}>
                    <span className={styles.dailyEyebrow}>
                      {dailyHandStatus === 'loading' ? 'Syncing Training Question' : 'Training Feed Interrupted'}
                    </span>
                    <h3>{dailyHandStatus === 'loading' ? 'Loading Today’s Decision' : 'Daily Hand Temporarily Unavailable'}</h3>
                    <p>
                      {dailyHandStatus === 'loading'
                        ? 'Jarvis Is Retrieving The Exact Hand, Board, Position, And Pot.'
                        : 'Your Other Tools Remain Available. Retry The Training Feed To Restore Today’s Spot.'}
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
                      <RotateCw size={15} aria-hidden="true" />Retry Daily Hand
                    </button>
                  )}
                </div>
              )}
            </div>
          </section>
          </>
          )}
        </main>
        </PullToRefresh>
      </div>
      </HubPageShell>

      {UpgradePopup}
    </PageTransition>
  );
}
