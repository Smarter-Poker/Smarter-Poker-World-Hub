/**
 * PERSONAL ASSISTANT — Jarvis Strategy Hub
 * /hub/personal-assistant
 *
 * The page keeps the existing data, routes, access gates, and recovery flows,
 * while using the same machined black/chrome/cyan system as the Club Shop.
 */

import { useEffect, useState } from 'react';
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
import { getMenuConfig } from '../../../src/config/hamburgerMenus';
import { useRecentSessions, useAssistantStats } from '../../../src/hooks/useAssistant';
import { useFeatureGate } from '../../../src/components/gates/FeatureGatePopup';
import styles from '../../../src/styles/worlds/PersonalAssistantHub.module.css';

const SYSTEMS = [
  {
    id: 'sandbox',
    eyebrow: 'Explore Poker Theoretical Hands',
    title: 'Virtual Sandbox',
    description: 'Build any spot, pressure-test every line, and compare your decisions with solver-verified strategy.',
    features: ['Run Any Poker Scenario', 'Test Lines Versus Villain Types', 'Review Solver-Verified Results'],
    action: 'Enter Sandbox',
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
  const exactHeroCards = Array.isArray(raw.heroCards) && raw.heroCards.length >= 2
    ? raw.heroCards.slice(0, 2).join('')
    : null;
  const heroHand = exactHeroCards || raw.heroHand || raw.hero_hand || scenario.heroHand || null;
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
    if (guardAction()) router.push(route);
  };

  const loadHandInSandbox = (hand) => {
    if (!guardAction()) return;
    const params = new URLSearchParams();
    const hero = normalizeHeroHand(hand.heroHand);
    if (hero) params.set('h', hero);
    if (hand.position) params.set('p', hand.position);
    const board = normalizeBoardCards(hand.board);
    if (board) params.set('b', board.join(','));
    const pot = Number(hand.pot);
    if (Number.isFinite(pot) && pot > 0) params.set('pot', String(pot));
    const query = params.toString();
    router.push(`/hub/personal-assistant/sandbox${query ? `?${query}` : ''}`);
  };

  const openSession = (session) => {
    if (!guardAction()) return;
    if (session.type !== 'sandbox') {
      router.push('/hub/personal-assistant/leaks');
      return;
    }
    const params = new URLSearchParams();
    const hero = normalizeHeroHand(session.hero_hand);
    if (hero) params.set('h', hero);
    if (session.hero_position) params.set('p', session.hero_position);
    const board = normalizeBoardCards(`${session.board_flop || ''}${session.board_turn || ''}${session.board_river || ''}`);
    if (board) params.set('b', board.join(','));
    const pot = Number(session.pot_size_bb);
    if (Number.isFinite(pot) && pot > 0) params.set('pot', String(pot));
    const stack = Number(session.hero_stack);
    if (Number.isFinite(stack) && stack > 0) params.set('s', String(stack));
    const query = params.toString();
    router.push(`/hub/personal-assistant/sandbox${query ? `?${query}` : ''}`);
  };

  const formatSessionDate = (value) => {
    if (!value) return '';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleDateString();
  };

  const formatEv = (value) => (
    typeof value === 'number' && Number.isFinite(value) ? `${value.toFixed(2)} BB` : 'EV -'
  );

  const sessionTypeLabel = (session) => (
    session?.type === 'leak' ? 'Leak Review' : 'Sandbox Session'
  );

  const lastRealSession = (recentSessions || []).find(
    (session) => session && !session.isDemo && session.type === 'sandbox',
  ) || null;

  const activeLeakCount = Number(stats?.leaksFound) || 0;
  const sandboxSessionCount = Number(stats?.sandboxSessions) || 0;
  const handsAnalyzedCount = Number(stats?.handsAnalyzed) || 0;
  const dataSyncError = statsError || sessionsError;

  const retryAssistantData = async () => {
    if (isRetrying) return;
    setIsRetrying(true);
    try {
      await Promise.allSettled([
        Promise.resolve(refetchStats?.()),
        Promise.resolve(refetchSessions?.()),
      ]);
    } finally {
      setIsRetrying(false);
    }
  };

  const nextMission = (() => {
    if (statsLoading || sessionsLoading) {
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
        badge: 'Continue Analysis',
        title: lastRealSession.title,
        description: 'Return To Your Latest Sandbox Spot With The Hand, Position, Board, Pot, And Stack Restored.',
        action: 'Resume Session',
        signal: formatSessionDate(lastRealSession.date) || 'Most Recent Session',
      };
    }

    if (dailyHand) {
      return {
        mode: 'daily',
        badge: 'Daily Decision',
        title: dailyHand.title || 'Solve Today’s Featured Spot',
        description: 'Load Today’s Hand Into The Sandbox And Compare Your Decision With The Recommended Line.',
        action: 'Run Daily Hand',
        signal: dailyHand.position || 'Daily Scenario',
      };
    }

    return {
      mode: 'start',
      badge: 'Recommended Start',
      title: 'Build Your First Decision Spot',
      description: 'Choose A Hand, Position, Board, And Opponent Type To Start Your Personal Strategy Record.',
      action: 'Start In Sandbox',
      signal: 'No Session Required',
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
      loadHandInSandbox(dailyHand);
      return;
    }
    openGuardedRoute('/hub/personal-assistant/sandbox');
  };

  const decisionLoop = [
    {
      step: '01',
      title: 'Analyze',
      detail: `${sandboxSessionCount.toLocaleString()} Sandbox Session${sandboxSessionCount === 1 ? '' : 's'}`,
      Icon: FlaskConical,
      route: '/hub/personal-assistant/sandbox',
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
    { title: 'Sessions Reviewed', value: stats?.sessionsReviewed || 0, label: 'Total Reviewed', Icon: History, route: '/hub/personal-assistant/sandbox' },
    { title: 'Hands Analyzed', value: stats?.handsAnalyzed || 0, label: 'GTO Checked', Icon: Layers, route: '/hub/personal-assistant/leaks' },
    { title: 'Active Leaks', value: stats?.leaksFound || 0, label: `${(stats?.resolvedLeaks || 0).toLocaleString()} Resolved`, Icon: Droplet, route: '/hub/personal-assistant/leaks' },
    { title: 'Sandbox Sessions', value: stats?.sandboxSessions || 0, label: 'Scenarios Explored', Icon: FlaskConical, route: '/hub/personal-assistant/sandbox' },
  ];

  const activityCards = [
    {
      title: 'Recent Sessions',
      label: sessionsLoading
        ? 'Loading Session History…'
        : (recentSessions || []).length > 0
          ? `${(recentSessions || []).length} Session${recentSessions.length === 1 ? '' : 's'} Available`
          : 'No Sessions Yet',
      detail: (recentSessions || [])[0]
        ? `${recentSessions[0].title}${recentSessions[0].isDemo ? ' (Sample)' : ''} · ${formatEv(recentSessions[0].evLoss)}`
        : 'Start A Sandbox Session',
      Icon: Clock3,
      onClick: () => openGuardedRoute('/hub/personal-assistant/sandbox'),
    },
    {
      title: 'New Leaks',
      label: statsLoading ? 'Loading Leak Data…' : `${(stats?.leaksFound || 0).toLocaleString()} Active`,
      detail: statsLoading ? 'Checking Progress' : `${(stats?.resolvedLeaks || 0).toLocaleString()} Resolved`,
      Icon: ScanSearch,
      onClick: () => openGuardedRoute('/hub/personal-assistant/leaks'),
    },
    {
      title: 'Last Session',
      label: sessionsLoading ? 'Loading Last Session…' : (lastRealSession?.title || 'Nothing To Restore Yet'),
      detail: lastRealSession ? formatSessionDate(lastRealSession.date) : 'Open The Sandbox To Begin',
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

  if (!mounted) {
    return (
      <div className={styles.loadingWrap}>
        <div className={styles.loadingText}>Initializing Jarvis…</div>
      </div>
    );
  }

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

      <div className={styles.page}>
        <UniversalHeader pageDepth={1} onMenuClick={() => setShowMenu(!showMenu)} />
        <HamburgerMenu
          isOpen={showMenu}
          onClose={() => setShowMenu(false)}
          direction="left"
          theme="dark"
          menuItems={menuConfig.menuItems}
          bottomLinks={menuConfig.bottomLinks}
        />

        <nav className={styles.tabs} aria-label="Personal Assistant Sections">
          <a className={styles.activeTab} href="#overview" aria-current="page">Overview</a>
          <button type="button" onClick={() => openGuardedRoute('/hub/personal-assistant/sandbox')}>Virtual Sandbox</button>
          <button type="button" onClick={() => openGuardedRoute('/hub/personal-assistant/leaks')}>Leak Finder</button>
          <button type="button" onClick={() => openGuardedRoute('/hub/training')}>Training Center</button>
          <a href="#activity">Activity</a>
        </nav>

        <main className={styles.main} id="overview">
          <section className={`${styles.frame} ${styles.hero}`} aria-labelledby="assistant-title">
            <div className={styles.heroInner}>
              <div className={styles.heroCopy}>
                <span className={styles.eyebrow}>Personal Poker Assistant</span>
                <h1 id="assistant-title">Meet Jarvis.<br />Your Edge At The Table.</h1>
                <p>Explore Theoretical Hands, Find Leaks, And Turn Solver Data Into Better Decisions From One Command Center.</p>
                <div className={`${styles.statusBadge} ${dataSyncError ? styles.statusWarning : ''}`} role="status">
                  <span className={styles.statusDot} aria-hidden="true" />
                  {dataSyncError ? 'Jarvis Online · Data Sync Needs Attention' : 'Jarvis Online · Solver Connected'}
                </div>
                <div className={styles.heroActions}>
                  <button
                    type="button"
                    className={styles.primaryButton}
                    onClick={() => openGuardedRoute('/hub/personal-assistant/sandbox')}
                  >
                    <Play size={15} fill="currentColor" aria-hidden="true" />Start New Scenario
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
                <small>Your saved poker data is unchanged. Retry the connection to refresh sessions and statistics.</small>
              </span>
              <button type="button" className={styles.secondaryButton} onClick={retryAssistantData} disabled={isRetrying}>
                <RotateCw size={14} aria-hidden="true" />{isRetrying ? 'Retrying' : 'Retry Now'}
              </button>
            </div>
          )}

          <section className={`${styles.section} ${styles.missionSection}`} aria-labelledby="mission-title">
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
              <div className={styles.decisionLoop} aria-label="Jarvis improvement path">
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
                    <span><strong>{title}</strong><small>{statsLoading ? 'Syncing Live Data' : detail}</small></span>
                    <ChevronRight size={14} aria-hidden="true" />
                  </button>
                ))}
              </div>
            </div>
          </section>

          <section className={styles.section} aria-labelledby="systems-title">
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

          <section className={styles.section} aria-labelledby="dashboard-title">
            <SectionBar id="dashboard-title" title="Dashboard Overview" meta="Live Performance" />
            {(statsDemo || stats?.isDemo) && (
              <p className={styles.demoNote}>Sample View - Sign In To See Your Own Sessions, Hands, And Leaks.</p>
            )}
            <div className={styles.statGrid} aria-busy={statsLoading} aria-live="polite">
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
                    <strong>{statsLoading ? '-' : Number(value).toLocaleString()}</strong>
                    <span className={styles.statLabel}>{statsLoading ? 'Loading Live Data…' : label}</span>
                    <span className={styles.statAction}>View Details<ChevronRight size={13} aria-hidden="true" /></span>
                  </span>
                </button>
              ))}
            </div>
          </section>

          <section className={styles.section} id="activity" aria-labelledby="activity-title">
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
            {!sessionsLoading && (recentSessions || []).length > 0 && (
              <div className={styles.sessionRail} aria-label="Recent session history">
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

          <section className={styles.section} aria-labelledby="daily-title">
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
                    <span className={styles.dailyPrompt}><Sparkles size={14} aria-hidden="true" />Load The Spot And Compare Your Decision</span>
                  </div>
                  <button type="button" className={styles.primaryButton} onClick={() => loadHandInSandbox(dailyHand)}>
                    <Play size={15} fill="currentColor" aria-hidden="true" />Load In Sandbox
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
                      {dailyHandStatus === 'loading' ? 'Syncing Solver Scenario' : 'Training Feed Interrupted'}
                    </span>
                    <h3>{dailyHandStatus === 'loading' ? 'Loading Today’s Decision' : 'Daily Hand Temporarily Unavailable'}</h3>
                    <p>
                      {dailyHandStatus === 'loading'
                        ? 'Jarvis Is Retrieving The Exact Hand, Board, Position, And Pot.'
                        : 'Your Other Tools Remain Available. Retry The Training Feed To Restore Today’s Spot.'}
                    </p>
                  </div>
                  {dailyHandStatus === 'error' && (
                    <button type="button" className={styles.secondaryButton} onClick={() => setDailyHandReloadKey((key) => key + 1)}>
                      <RotateCw size={15} aria-hidden="true" />Retry Daily Hand
                    </button>
                  )}
                </div>
              )}
            </div>
          </section>
        </main>
      </div>

      {UpgradePopup}
    </PageTransition>
  );
}
