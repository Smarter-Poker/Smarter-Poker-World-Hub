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
  BrainCircuit,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Droplet,
  FlaskConical,
  History,
  Layers,
  Play,
  ScanSearch,
  Sparkles,
} from 'lucide-react';

import SEOHead from '../../../src/components/seo/SEOHead';
import { useAvatar } from '../../../src/contexts/AvatarContext';
import PageTransition from '../../../src/components/transitions/PageTransition';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import HamburgerMenu from '../../../src/components/ui/HamburgerMenu';
import { getMenuConfig } from '../../../src/config/hamburgerMenus';
import { useRecentSessions, useAssistantStats } from '../../../src/hooks/useAssistant';
import { useFeatureGate } from '../../../src/components/gates/FeatureGatePopup';
import BottomNavBar from '../../../src/components/ui/BottomNavBar';
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

const SectionBar = ({ title, meta, id }) => (
  <div className={styles.sectionBar} id={id}>
    <h2>{title}</h2>
    <span>{meta}</span>
  </div>
);

export default function PersonalAssistantPage() {
  const router = useRouter();
  const { user } = useAvatar();
  const [mounted, setMounted] = useState(false);
  const [showMenu, setShowMenu] = useState(false);

  const { guardAction, UpgradePopup } = useFeatureGate('personal_assistant');
  const menuConfig = getMenuConfig('hub-home', user, {}, {});
  const { sessions: recentSessions, isLoading: sessionsLoading, refetch: refetchSessions } = useRecentSessions(5);
  const { stats, isLoading: statsLoading, isDemo: statsDemo } = useAssistantStats();

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const handleSandboxUpdate = () => {
      try { refetchSessions?.(); } catch (error) { console.warn('[App] Handled exception:', error?.message || error); }
    };
    window.addEventListener('pa-sandbox-updated', handleSandboxUpdate);
    window.addEventListener('pa-data-updated', handleSandboxUpdate);
    return () => {
      window.removeEventListener('pa-sandbox-updated', handleSandboxUpdate);
      window.removeEventListener('pa-data-updated', handleSandboxUpdate);
    };
  }, [refetchSessions]);

  const [dailyHand, setDailyHand] = useState(null);
  useEffect(() => {
    let cancelled = false;
    fetch('/api/training/hand-of-the-day')
      .then((response) => (response.ok ? response.json() : null))
      .then((json) => {
        if (!cancelled && json?.hand) setDailyHand(json.hand);
      })
      .catch((error) => console.warn('[App] Handled promise rejection:', error?.message || error));
    return () => { cancelled = true; };
  }, []);

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
    router.push(`/hub/personal-assistant/sandbox?${params.toString()}`);
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
    typeof value === 'number' && Number.isFinite(value) ? `${value.toFixed(2)} BB` : 'EV —'
  );

  const sessionTypeLabel = (session) => (
    session?.type === 'leak' ? 'Leak Review' : 'Sandbox Session'
  );

  const lastRealSession = (recentSessions || []).find(
    (session) => session && !session.isDemo && session.type === 'sandbox',
  ) || null;

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
                <div className={styles.statusBadge}>
                  <span className={styles.statusDot} aria-hidden="true" />
                  Jarvis Online · Solver Connected
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

          <section aria-labelledby="systems-title">
            <SectionBar id="systems-title" title="Choose Your Tool" meta="2 Systems Available" />
            <div className={styles.systemGrid}>
              {SYSTEMS.map((system) => (
                <article className={styles.systemCard} key={system.id}>
                  <div className={styles.systemCardInner}>
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
                      <button
                        type="button"
                        className={system.id === 'sandbox' ? styles.primaryButton : styles.secondaryButton}
                        onClick={() => openGuardedRoute(system.route)}
                      >
                        {system.action}<ChevronRight size={16} aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </section>

          <section className={styles.section} aria-labelledby="dashboard-title">
            <SectionBar id="dashboard-title" title="Dashboard Overview" meta="Live Performance" />
            {(statsDemo || stats?.isDemo) && (
              <p className={styles.demoNote}>Sample View — Sign In To See Your Own Sessions, Hands, And Leaks.</p>
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
                    <strong>{statsLoading ? '—' : Number(value).toLocaleString()}</strong>
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

          {dailyHand && (
            <section className={styles.section} aria-labelledby="daily-title">
              <SectionBar id="daily-title" title="Hand Of The Day" meta="Daily Decision Drill" />
              <div className={styles.dailyFrame}>
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
              </div>
            </section>
          )}
        </main>
      </div>

      {UpgradePopup}
      <BottomNavBar />
    </PageTransition>
  );
}
