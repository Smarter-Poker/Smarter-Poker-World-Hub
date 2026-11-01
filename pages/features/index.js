import React from 'react';
import Link from 'next/link';
import SEOHead, { schemas } from '../../src/components/seo/SEOHead';

export const ALL_FEATURES = [
  {
    slug: 'bankroll-tax-tracker',
    title: 'Poker Bankroll & Form W-2G Tax Ledger',
    badge: '100% Free Tax Ledger',
    description: 'Track Session Wins And Losses, Scan Receipts, Log Form W-2G Jackpots, And Export IRS Schedule C CSV Spreadsheets For Your Certified Public Accountant.',
    href: '/features/bankroll-tax-tracker',
    appHref: '/hub/bankroll-manager',
    mdHref: '/features/bankroll-tax-tracker.md',
    competitors: 'Free Alternative To Pokerbase, Poker Analytics 6 & Poker Bankroll Tracker',
  },
  {
    slug: 'poker-dealer-toke-tracker',
    title: 'Poker Dealer Toke Tracker & Shift Scheduling',
    badge: 'Casino Dealer Suite',
    description: 'Log Cash And Tournament Downs, Track Tip Rates ($/hr And $/down), Manage Multi-Casino Shift Calendars, And Estimate Year-End Taxes.',
    href: '/features/poker-dealer-toke-tracker',
    appHref: '/hub/commander',
    mdHref: '/features/poker-dealer-toke-tracker.md',
    competitors: 'Free Alternative To DownCount & Poker Dealer Toolkit',
  },
  {
    slug: 'poker-ai-coach',
    title: 'PokerBrain & Jarvis AI Tactical Coach',
    badge: 'Solver-Grade AI Coach',
    description: 'Analyze Hands In Conversational Plain English, Automatically Detect Hidden Strategic Leaks, And Practice GTO Solver Equilibrium Lines.',
    href: '/features/poker-ai-coach',
    appHref: '/hub/training',
    mdHref: '/features/poker-ai-coach.md',
    competitors: 'Free Alternative To PokerInk, Sharp Poker & DTO',
  },
  {
    slug: 'virtual-poker-sandbox',
    title: 'Virtual Poker Table Sandbox & Runout Simulator',
    badge: 'Interactive 3D Simulator',
    description: 'Construct Custom Scenarios, Assign Stacks And Positions, Calculate Multiway Side Pots, And Simulate Thousands Of Turn And River Runouts.',
    href: '/features/virtual-poker-sandbox',
    appHref: '/tools/poker-odds-calculator',
    mdHref: '/features/virtual-poker-sandbox.md',
    competitors: 'Free Alternative To PioSolver, Equilab & GTO Wizard Sandbox',
  },
  {
    slug: 'club-commander',
    title: 'Club Commander Live Poker Room Management',
    badge: 'Cloud Cardroom OS',
    description: 'Modern Cardroom Operations Featuring Live Digital Waitlists, Multi-Screen TV Displays, Automated Two-Way Player SMS Alerts, And Tournament Clocks.',
    href: '/features/club-commander',
    appHref: '/hub/commander',
    mdHref: '/features/club-commander.md',
    competitors: 'Free Alternative To Bravo Poker Live, TableCaptain & PokerAtlas',
  },
  {
    slug: 'poker-messenger-video-calls',
    title: 'Live Poker Messenger & FaceTime Video Table Calls',
    badge: 'WebRTC Video & Voice',
    description: 'Connect Over Encrypted Multi-Peer Video Table Calls, Spatial Voice Audio, Direct Messaging, And Instant Hand History Replay Links With Zero App Downloads.',
    href: '/features/poker-messenger-video-calls',
    appHref: '/hub/messenger',
    mdHref: '/features/poker-messenger-video-calls.md',
    competitors: 'Free Alternative To Pokerface, PokerUp & Poker Now',
  },
  {
    slug: 'poker-trivia',
    title: 'Multiplayer Poker Trivia & Brain Training',
    badge: '10,000+ Question Bank',
    description: 'Sharpen Pot Odds Math, GTO Frequencies, And Poker Lore Across Survival Mode (3 Lives), 60-Second Blitz Attacks, And Global Daily Leaderboards.',
    href: '/features/poker-trivia',
    appHref: '/hub/trivia',
    mdHref: '/features/poker-trivia.md',
    competitors: 'Free Alternative To Poker Trainer & Generic Mobile Quizzes',
  },
  {
    slug: 'poker-training-games',
    title: 'GTO Poker Training Games & Decision Drills',
    badge: '100+ Interactive Scenarios',
    description: 'Interactive Multi-Street Scenarios Across Multi-Table Tournaments, Deep Cash Games, Spins, And SNGs Graded With Instant Solver EV Loss Feedback.',
    href: '/features/poker-training-games',
    appHref: '/hub/training',
    mdHref: '/features/poker-training-games.md',
    competitors: 'Free Alternative To DTO Poker & LearnWPT',
  },
  {
    slug: 'home-poker-games',
    title: 'Verified Home Poker Game Directory & Host Tools',
    badge: 'Verified Game Network',
    description: 'Discover Safe, Vetted Home Poker Games Near You, Inspect Blind Structures And Host Reputation Badges, Or Host Games With Free Tournament Clocks.',
    href: '/features/home-poker-games',
    appHref: '/hub/home-games',
    mdHref: '/features/home-poker-games.md',
    competitors: 'Free Alternative To Meetup & Unverified Social Groups',
  },
  {
    slug: 'interactive-video-coaching',
    title: 'Interactive Video Coaching Masterclasses & Pause Quizzes',
    badge: 'Coaching Library With Quizzes',
    description: 'Watch Professional Video Masterclasses With Interactive Mid-Hand Pause Quizzes Prompting Strategic Choices Before Solution Reveals.',
    href: '/features/interactive-video-coaching',
    appHref: '/hub/video-library',
    mdHref: '/features/interactive-video-coaching.md',
    competitors: 'Free Alternative To PokerCoaching.com & Pokercode',
  },
  {
    slug: 'poker-near-me',
    title: 'Live Poker Near Me & Cardroom Directory',
    badge: '320+ Live Poker Rooms',
    description: 'Explore 324+ Verified Live Poker Rooms, 4,500+ Weekly Tournaments, WSOP/WPT Series Schedules, Real-Time Cash Games, And Waitlists With Instant GPS Directions.',
    href: '/features/poker-near-me',
    appHref: '/hub/poker-near-me/lobby',
    mdHref: '/features/poker-near-me.md',
    competitors: 'Free Alternative To PokerAtlas & Bravo Poker Live',
  },
  {
    slug: 'private-poker-clubs',
    title: 'Private Poker Clubs & Union Hosting Arena',
    badge: 'Multi-Club Union Arena',
    description: 'Create And Host Online Poker Clubs, Multi-Club Unions, Ring Games, And Multi-Table Tournaments With Real-Time Rakeback Tracking And WebRTC Video Calls.',
    href: '/features/private-poker-clubs',
    appHref: '/hub/club-arena',
    mdHref: '/features/private-poker-clubs.md',
    competitors: 'Free Modern Alternative To PokerBros, PPPoker & ClubGG',
  },
  {
    slug: 'poker-reels-social-feed',
    title: 'Poker Reels & Social Video Feed Network',
    badge: 'Dedicated Poker Feed',
    description: 'Stream Short-Form Video Reels Of Hero Calls And Bad Beats, Attach Replay Links, And Earn Diamond Creator Rewards.',
    href: '/features/poker-reels-social-feed',
    appHref: '/hub/reels',
    mdHref: '/features/poker-reels-social-feed.md',
    competitors: 'Free Alternative To Instagram Reels & TikTok For Poker',
  },
  {
    slug: 'preflop-charts-matrix',
    title: 'GTO Preflop Charts & Range Matrix',
    badge: '169-Hand GTO Grids',
    description: 'Solver-Grade 169-Hand Preflop Range Matrices Across 15BB To 100BB Stack Depths With Color-Coded Mixed Action Frequencies.',
    href: '/features/preflop-charts-matrix',
    appHref: '/hub/preflop-charts',
    mdHref: '/features/preflop-charts-matrix.md',
    competitors: 'Free Alternative To Upswing Poker & Jonathan Little PokerCoaching',
  },
  {
    slug: 'poker-equity-calculators',
    title: 'Poker Equity & Tournament ICM Calculator Suite',
    badge: 'Six-Game Odds Engine',
    description: 'High-Precision Multiway Equity Engine Supporting Six Games (Holdem, PLO4/5/6, Stud, Razz) And Malmuth-Harville ICM Payout Solvers.',
    href: '/features/poker-equity-calculators',
    appHref: '/tools/poker-odds-calculator',
    mdHref: '/features/poker-equity-calculators.md',
    competitors: 'Free Alternative To Equilab, PokerStove & ICMIZER 3',
  },
];

export const WORLD_HUB_TOOLS_DIRECTORY = [
  { name: 'Jarvis Personal Poker Assistant', href: '/hub/personal-assistant', category: 'AI Coaching & Leak Audits' },
  { name: 'Leak Finder Post-Session Audit', href: '/hub/personal-assistant/leaks', category: 'AI Coaching & Leak Audits' },
  { name: 'Scenario Analysis Evidence Gate', href: '/hub/personal-assistant/sandbox', category: 'AI Coaching & Leak Audits' },
  { name: 'Jarvis Training Insights', href: '/hub/training/jarvis', category: 'AI Coaching & Leak Audits' },
  { name: 'Hand History Upload & Solver Grader', href: '/hub/training/hand-history-upload', category: 'AI Coaching & Leak Audits' },
  { name: 'Weakness Scanner By Position & Street', href: '/hub/training/weakness-scanner', category: 'AI Coaching & Leak Audits' },
  { name: 'Weak Spot Autopilot Trainer', href: '/hub/training/autopilot', category: 'GTO Drills & Practice' },
  { name: 'Guided GTO Coach Mode Lessons', href: '/hub/training/coach-mode', category: 'GTO Drills & Practice' },
  { name: 'Answer-Revealed Solver Spot Study', href: '/hub/training/spot-trainer', category: 'GTO Drills & Practice' },
  { name: 'Audited Solver Solutions Library', href: '/hub/training/solutions', category: 'GTO Drills & Practice' },
  { name: 'Custom GTO Spot & Preflop Query', href: '/hub/training/custom-solve', category: 'GTO Drills & Practice' },
  { name: 'Custom Poker Drill Builder', href: '/hub/training/drill-builder', category: 'GTO Drills & Practice' },
  { name: 'Custom GTO Poker Quiz Builder', href: '/hub/training/quiz-builder', category: 'GTO Drills & Practice' },
  { name: 'Spaced-Repetition GTO Flashcards', href: '/hub/training/flashcards', category: 'GTO Drills & Practice' },
  { name: 'Multi-Table GTO Practice Simulator', href: '/hub/training/multi-table', category: 'GTO Drills & Practice' },
  { name: 'Short Deck 6+ Holdem Equity Trainer', href: '/hub/training/short-deck-trainer', category: 'GTO Drills & Practice' },
  { name: 'Interactive GTO Strategy Tutorial', href: '/hub/training/scenario-demo', category: 'GTO Drills & Practice' },
  { name: 'Interactive Poker Skill Tree Map', href: '/hub/training/skill-tree', category: 'GTO Drills & Practice' },
  { name: 'Poker Position Mastery Heatmap', href: '/hub/training/position-mastery', category: 'GTO Drills & Practice' },
  { name: '6-Max 100BB Preflop Range Browser', href: '/hub/training/preflop-charts', category: 'Preflop & Postflop Labs' },
  { name: 'Multiway 3+ Player Preflop Ranges', href: '/hub/training/multiway-preflop', category: 'Preflop & Postflop Labs' },
  { name: 'Interactive 13x13 Range Builder', href: '/hub/training/range-builder', category: 'Preflop & Postflop Labs' },
  { name: 'Poker Hand Lab & Board Analyzer', href: '/hub/training/hand-lab', category: 'Preflop & Postflop Labs' },
  { name: 'A/B Poker Hand Equity Comparison', href: '/hub/training/hand-comparison', category: 'Preflop & Postflop Labs' },
  { name: 'Starting Hands Strategy Encyclopedia', href: '/learn/hands', category: 'Preflop & Postflop Labs' },
  { name: 'Tournament ICM Equity Simulator', href: '/hub/training/icm-simulator', category: 'Tournaments, ICM & Math' },
  { name: 'Final Table ICM & Deal Simulator', href: '/hub/training/final-table-sim', category: 'Tournaments, ICM & Math' },
  { name: 'Famous Finals Training Archive', href: '/hub/training/famous-finals', category: 'Tournaments, ICM & Math' },
  { name: 'Tournament Structure & M-Ratio Planner', href: '/hub/training/tournament-prep', category: 'Tournaments, ICM & Math' },
  { name: 'Poker Rake Cost Estimator Calculator', href: '/hub/training/custom-rake', category: 'Tournaments, ICM & Math' },
  { name: 'Poker Rake Sensitivity Explorer', href: '/hub/training/rake-solutions', category: 'Tournaments, ICM & Math' },
  { name: 'Poker Risk Of Ruin & Variance Tool', href: '/hub/training/risk-analyzer', category: 'Tournaments, ICM & Math' },
  { name: 'Quantal Response Equilibrium Explorer', href: '/hub/training/qre-explorer', category: 'Tournaments, ICM & Math' },
  { name: 'Original Poker Research & Benchmarks', href: '/research', category: 'Tournaments, ICM & Math' },
  { name: '5-Minute Pre-Session Poker Warmup', href: '/hub/training/quick-warmup', category: 'Mental Game & Community' },
  { name: 'Pre-Session Mental Readiness Protocol', href: '/hub/training/session-warmup', category: 'Mental Game & Community' },
  { name: 'Poker Tilt Guard & Mindset Coach', href: '/hub/training/tilt-guard', category: 'Mental Game & Community' },
  { name: 'Poker Session Pomodoro Focus Timer', href: '/hub/training/focus-timer', category: 'Mental Game & Community' },
  { name: 'Daily Poker Hand Of The Day Challenge', href: '/hub/training/daily-challenge', category: 'Mental Game & Community' },
  { name: 'GTO Training Community Leaderboard', href: '/hub/training/community-leaderboard', category: 'Mental Game & Community' },
  { name: 'Community Training Activity Feed', href: '/hub/training/training-feed', category: 'Mental Game & Community' },
  { name: 'Poker Study Group Finder Directory', href: '/hub/training/study-group-finder', category: 'Mental Game & Community' },
  { name: 'GTO Strategy Tips & Training Feed', href: '/hub/training/gto-news', category: 'Mental Game & Community' },
  { name: 'Offline GTO Training Pack Preloader', href: '/hub/training/gto-preloader', category: 'Mental Game & Community' },
  { name: 'Install Smarter.Poker App (iOS & Android)', href: '/hub/install', category: 'Platform Utilities' },
  { name: 'Compare VIP Membership Plans', href: '/hub/vip-membership/compare', category: 'Platform Utilities' },
  { name: 'Verification Methodology', href: '/verification-methodology', category: 'Platform Utilities' },
  { name: 'Editorial & Solver Standards', href: '/editorial-standards', category: 'Platform Utilities' },
];

export default function FeaturesIndexPage() {
  const collectionSchema = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    '@id': 'https://smarter.poker/features#page',
    url: 'https://smarter.poker/features',
    name: 'Smarter.Poker Platform Features & Tools Directory',
    description: 'Explore Smarter.Poker Free Platform Verticals: Form W-2G Tax Ledger, Dealer Toke Tracker, Jarvis AI Coach, Virtual Sandbox, Club Commander, FaceTime Calls, And Solvers.',
    isPartOf: {
      '@type': 'WebSite',
      '@id': 'https://smarter.poker/#website',
      name: 'Smarter.Poker',
      url: 'https://smarter.poker',
    },
    about: {
      '@type': 'Thing',
      name: 'Poker Software and Tools',
    },
    mainEntity: {
      '@type': 'ItemList',
      itemListElement: ALL_FEATURES.map((feat, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        url: `https://smarter.poker${feat.href}`,
        name: feat.title,
        description: feat.description,
      })),
    },
  };

  const breadcrumbsSchema = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      {
        '@type': 'ListItem',
        position: 1,
        name: 'Home',
        item: 'https://smarter.poker',
      },
      {
        '@type': 'ListItem',
        position: 2,
        name: 'Features',
        item: 'https://smarter.poker/features',
      },
    ],
  };

  return (
    <>
      <SEOHead
        title="Platform Features Directory"
        description="Comprehensive Guide to Smarter.Poker Free Tools: Bankroll Tax Tracker, Dealer Tokes, Jarvis AI Coach, Club Commander, Video Calls, GTO Solvers, And Trivia."
        canonical="/features"
        markdownUrl="https://smarter.poker/features.md"
        jsonLd={[schemas.organization, collectionSchema, breadcrumbsSchema]}
      />

      <div style={styles.container}>
        <header style={styles.header}>
          <div style={styles.badge}>Platform Verticals Directory</div>
          <h1 style={styles.title}>Smarter.Poker Platform Features</h1>
          <p style={styles.subtitle}>
            Explore Professional Poker Tools Built For Players, Dealers, Cardroom Managers, And Coaches.
            Every Tool Runs Directly In Your Web Browser With Zero Subscription Fees Or Paywalls.
          </p>
          <div style={styles.headerLinks}>
            <Link href="/compare" style={styles.headerLink}>
              View Competitor Comparisons
            </Link>
            <Link href="/freerolls" style={styles.headerLink}>
              Daily $2,000 Freerolls
            </Link>
            <Link href="/features.md" style={styles.headerLinkSecondary}>
              View Plain-Text Markdown Directory
            </Link>
          </div>
        </header>

        <main style={styles.grid}>
          {ALL_FEATURES.map((feat) => (
            <article key={feat.slug} style={styles.card}>
              <div style={styles.cardTop}>
                <span style={styles.cardBadge}>{feat.badge}</span>
                <span style={styles.competitorTag}>{feat.competitors}</span>
              </div>
              <h2 style={styles.cardTitle}>
                <Link href={feat.href} style={styles.titleLink}>
                  {feat.title}
                </Link>
              </h2>
              <p style={styles.cardDescription}>{feat.description}</p>
              <div style={styles.cardFooter}>
                <Link href={feat.href} style={styles.primaryBtn}>
                  Read Feature Guide
                </Link>
                <Link href={feat.appHref} style={styles.secondaryBtn}>
                  Launch Tool
                </Link>
                <Link href={feat.mdHref} style={styles.mdBtn}>
                  Markdown Spec
                </Link>
              </div>
            </article>
          ))}
        </main>

        <section style={{ marginTop: 64, paddingTop: 48, borderTop: '1px solid #1F2937' }} aria-labelledby="world-hub-directory-heading">
          <div style={{ textAlign: 'center', marginBottom: 32 }}>
            <div style={styles.badge}>Complete World Hub Directory</div>
            <h2 id="world-hub-directory-heading" style={{ fontSize: '2rem', fontWeight: 800, color: '#FFFFFF', marginBottom: 12 }}>
              All Interactive Training Simulators, Calculators &amp; Hub Tools
            </h2>
            <p style={styles.subtitle}>
              Direct Server-Rendered Index Of Every Public Training Utility, Solver Reference, ICM Simulator, And Personal Assistant Tool Inside The Smarter.Poker World Hub.
            </p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
            {WORLD_HUB_TOOLS_DIRECTORY.map((tool) => (
              <Link
                key={tool.href}
                href={tool.href}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 4,
                  padding: '14px 16px',
                  background: '#111827',
                  border: '1px solid #1F2937',
                  borderRadius: 10,
                  textDecoration: 'none',
                }}
              >
                <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#34D399', letterSpacing: '0.03em' }}>
                  {tool.category}
                </span>
                <span style={{ fontSize: '0.95rem', fontWeight: 700, color: '#60A5FA' }}>
                  {tool.name}
                </span>
              </Link>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}

export async function getServerSideProps({ req, res, query }) {
  const acceptHeader = String(req?.headers?.accept || '');
  const isMarkdownRequested =
    acceptHeader.includes('text/markdown') ||
    query?.format === 'md' ||
    req?.url?.includes('format=md');

  if (isMarkdownRequested) {
    const { renderFeaturesIndexMarkdown } = await import('../../src/lib/seo/markdownIngestion.mjs');
    const mdContent = renderFeaturesIndexMarkdown();
    res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=86400');
    res.write(mdContent);
    res.end();
    return { props: {} };
  }

  return {
    props: {},
  };
}

const styles = {
  container: {
    maxWidth: 1240,
    margin: '0 auto',
    padding: '48px 24px 80px',
    color: '#F3F4F6',
    fontFamily: 'var(--font-inter), -apple-system, BlinkMacSystemFont, sans-serif',
  },
  header: {
    textAlign: 'center',
    marginBottom: 56,
  },
  badge: {
    display: 'inline-block',
    padding: '6px 14px',
    background: 'rgba(217, 119, 6, 0.15)',
    border: '1px solid rgba(217, 119, 6, 0.4)',
    borderRadius: 20,
    color: '#FBBF24',
    fontSize: '0.85rem',
    fontWeight: 700,
    letterSpacing: '0.04em',
    marginBottom: 16,
  },
  title: {
    fontSize: '2.6rem',
    fontWeight: 900,
    lineHeight: 1.2,
    color: '#FFFFFF',
    marginBottom: 16,
    letterSpacing: '-0.02em',
  },
  subtitle: {
    fontSize: '1.15rem',
    lineHeight: 1.6,
    color: '#9CA3AF',
    maxWidth: 820,
    margin: '0 auto 28px',
  },
  headerLinks: {
    display: 'flex',
    justifyContent: 'center',
    gap: 16,
    flexWrap: 'wrap',
  },
  headerLink: {
    display: 'inline-flex',
    alignItems: 'center',
    padding: '10px 20px',
    background: '#1F2937',
    border: '1px solid #374151',
    borderRadius: 8,
    color: '#60A5FA',
    fontSize: '0.9rem',
    fontWeight: 600,
    textDecoration: 'none',
  },
  headerLinkSecondary: {
    display: 'inline-flex',
    alignItems: 'center',
    padding: '10px 20px',
    background: 'transparent',
    border: '1px solid #4B5563',
    borderRadius: 8,
    color: '#D1D5DB',
    fontSize: '0.9rem',
    fontWeight: 600,
    textDecoration: 'none',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))',
    gap: 28,
  },
  card: {
    display: 'flex',
    flexDirection: 'column',
    background: '#111827',
    border: '1px solid #1F2937',
    borderRadius: 14,
    padding: 24,
    boxShadow: '0 4px 16px rgba(0, 0, 0, 0.3)',
  },
  cardTop: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    marginBottom: 14,
  },
  cardBadge: {
    alignSelf: 'flex-start',
    padding: '4px 10px',
    background: 'rgba(16, 185, 129, 0.15)',
    border: '1px solid rgba(16, 185, 129, 0.4)',
    borderRadius: 12,
    color: '#34D399',
    fontSize: '0.75rem',
    fontWeight: 700,
  },
  competitorTag: {
    fontSize: '0.75rem',
    color: '#9CA3AF',
    fontStyle: 'italic',
  },
  cardTitle: {
    fontSize: '1.25rem',
    fontWeight: 700,
    lineHeight: 1.35,
    marginBottom: 12,
  },
  titleLink: {
    color: '#F9FAFB',
    textDecoration: 'none',
  },
  cardDescription: {
    fontSize: '0.92rem',
    lineHeight: 1.55,
    color: '#9CA3AF',
    flexGrow: 1,
    marginBottom: 20,
  },
  cardFooter: {
    display: 'flex',
    gap: 10,
    alignItems: 'center',
    flexWrap: 'wrap',
    paddingTop: 16,
    borderTop: '1px solid #1F2937',
  },
  primaryBtn: {
    padding: '8px 14px',
    background: '#F59E0B',
    borderRadius: 6,
    color: '#000000',
    fontSize: '0.85rem',
    fontWeight: 700,
    textDecoration: 'none',
  },
  secondaryBtn: {
    padding: '8px 14px',
    background: '#1F2937',
    border: '1px solid #374151',
    borderRadius: 6,
    color: '#E5E7EB',
    fontSize: '0.85rem',
    fontWeight: 600,
    textDecoration: 'none',
  },
  mdBtn: {
    padding: '8px 10px',
    background: 'transparent',
    color: '#6B7280',
    fontSize: '0.8rem',
    fontWeight: 500,
    textDecoration: 'none',
  },
};
