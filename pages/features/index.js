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
    appHref: '/hub/messages',
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
