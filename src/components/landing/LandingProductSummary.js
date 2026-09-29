/* ═══════════════════════════════════════════════════════════════════════════
   LANDING PRODUCT SUMMARY - the words under the hero image
   ═══════════════════════════════════════════════════════════════════════════

   AEO PHASE 1 (2026-09-17). The landing page was one image with click
   hotspots. Its server-rendered text was "SMARTER.POKER", "Sign Up",
   "Sign In" and a copyright line: no H1, no sentence that says what the
   product is. A crawler that does not run JavaScript (OAI-SearchBot,
   Claude-SearchBot, PerplexityBot, meta-webindexer all do not) had nothing
   to read, and a crawler that does run it read the same nothing.

   This section is real page content, rendered on the server by Next.js,
   visible to every visitor below the hero: one H1 that names the product,
   one paragraph that defines it, and one H2 per product surface with a
   link to it. It is not hidden text: hidden text is a spam signal and this
   copy is meant to be read. Copy follows the house rule: Title Case, no em
   dashes (scripts/ci/check-title-case.mjs, scripts/ci/check-ui-text.mjs).

   Keep the definitions in step with public/llms.txt and the store listing;
   an AI engine repeats the definition it sees most often.
   ═══════════════════════════════════════════════════════════════════════════ */

import Link from 'next/link';

export const LANDING_PRODUCTS = [
  {
    id: 'poker-arena',
    name: 'Poker Arena',
    href: '/hub/club-arena',
    summary:
      'Private Online Poker Clubs With Chips, Tournaments, Hand Histories, Player Stats, Leaderboards And Club Management. The Club Arena App Runs On Web, iOS And Android.',
  },
  {
    id: 'club-commander',
    name: 'Club Commander',
    href: '/hub/commander',
    summary:
      'Free Poker Room Management For Live Venues: Digital Waitlists, Table Tracking, Tournament Clocks, SMS And Push Seat Alerts, Promotions And Analytics.',
  },
  {
    id: 'training',
    name: 'GTO Training',
    href: '/hub/training',
    summary:
      'Over 100 Scenario Games Across Tournaments, Cash Games, Spins And SNGs, Mental Game And Advanced Theory, With Jarvis Solver-Grade Hand Analysis.',
  },
  {
    id: 'poker-near-me',
    name: 'Poker Near Me',
    href: '/hub/poker-near-me/lobby',
    summary:
      'A Directory Of Live Poker Rooms Across The United States, By State And City, With Tournament Schedules, Series And Tour Stops.',
  },
  {
    id: 'home-games',
    name: 'Home Games',
    href: '/hub/home-games',
    summary: 'Find And Host Home Poker Games Near You, With Public Game Pages By State And City.',
  },
  {
    id: 'bankroll-manager',
    name: 'Bankroll Manager',
    href: '/hub/bankroll-manager',
    summary: 'Track Sessions, Results And Bankroll Across Cash Games And Tournaments, With Exports.',
  },
];

/**
 * THE FREE GUIDES, ONE HOP FROM THE FRONT DOOR (AEO phase 3, 2026-09-22).
 *
 * /learn, /glossary and /compare shipped with 128 pages between them. Crawled
 * from / as a non-JavaScript crawler the day they went live, the glossary was
 * reachable through the training summaries, and the 41 lessons and 12
 * comparisons were reachable from nowhere: listed in the sitemap, linked by no
 * page. That is the defect this programme fixed for the tour and series
 * directories a week earlier, arriving again with the next thing built.
 *
 * Linking each index here puts it one hop from the front page and every page
 * under it two. __tests__/a-directory-lists-what-it-contains.law.test.mjs
 * holds this list to the content indexes the sitemap offers.
 */
export const LANDING_GUIDES = [
  {
    id: 'learn',
    name: 'Poker Strategy Lessons',
    href: '/learn',
    summary: 'Forty Free Lessons On Ranges, Pot Odds, ICM, Bankrolls And Tilt, With The Charts Inline.',
  },
  {
    id: 'glossary',
    name: 'Poker Glossary',
    href: '/glossary',
    summary: 'Plain Definitions For Club, Live Room And GTO Terms, One Page Per Term.',
  },
  {
    id: 'compare',
    name: 'Poker App Comparisons',
    href: '/compare',
    summary: 'Club Apps, Room Software, GTO Trainers And Bankroll Trackers Compared, With Sources.',
  },
];

export default function LandingProductSummary() {
  return (
    <section style={styles.section} aria-labelledby="landing-summary-heading">
      <h1 id="landing-summary-heading" style={styles.h1}>
        Smarter Poker: The Free Online Poker Platform For Training, Private Clubs And Live Games
      </h1>
      <p style={styles.lead}>
        Smarter Poker Is A Free Online Poker Platform From Smarter Software Inc. That Combines GTO Training,
        Private Poker Clubs, A Live Poker Room Directory, Bankroll Tracking And Community Features In One
        World Hub. There Is No Real-Money Gambling: Club Chips Are Play Credits With No Cash Value, And
        Diamonds Are A Promotional Rewards Currency.
      </p>
      <div style={styles.grid}>
        {LANDING_PRODUCTS.map((product) => (
          <article key={product.id} style={styles.card}>
            <h2 style={styles.h2}>
              <Link href={product.href} style={styles.cardLink}>
                {product.name}
              </Link>
            </h2>
            <p style={styles.summary}>{product.summary}</p>
          </article>
        ))}
      </div>
      <h2 style={styles.guidesHeading}>Free Poker Guides</h2>
      <div style={styles.grid}>
        {LANDING_GUIDES.map((guide) => (
          <article key={guide.id} style={styles.card}>
            <h3 style={styles.h2}>
              <Link href={guide.href} style={styles.cardLink}>
                {guide.name}
              </Link>
            </h3>
            <p style={styles.summary}>{guide.summary}</p>
          </article>
        ))}
      </div>
      <p style={styles.compliance}>
        Free To Play. 18+. Diamonds And Chips Have No Cash Value.{' '}
        <Link href="/about" style={styles.inlineLink}>
          About
        </Link>
        {' '}
        <Link href="/legal/official-rules" style={styles.inlineLink}>
          Official Rules
        </Link>
        {' '}
        <Link href="/terms" style={styles.inlineLink}>
          Terms
        </Link>
        {' '}
        <Link href="/privacy" style={styles.inlineLink}>
          Privacy
        </Link>
      </p>
    </section>
  );
}

const styles = {
  section: {
    maxWidth: 1100,
    margin: '0 auto',
    padding: '48px 20px 32px',
    color: '#e6ecf5',
    fontFamily: "var(--font-inter), -apple-system, BlinkMacSystemFont, sans-serif",
  },
  h1: {
    fontFamily: "var(--font-orbitron), sans-serif",
    fontSize: 'clamp(20px, 3vw, 30px)',
    fontWeight: 700,
    lineHeight: 1.25,
    color: '#ffffff',
    margin: '0 0 16px',
    letterSpacing: '0.5px',
  },
  lead: {
    fontSize: 16,
    lineHeight: 1.6,
    color: '#b8c4d6',
    margin: '0 0 32px',
    maxWidth: 860,
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
    gap: 16,
  },
  card: {
    background: 'rgba(255, 255, 255, 0.04)',
    border: '1px solid rgba(0, 198, 255, 0.18)',
    borderRadius: 12,
    padding: '18px 18px 16px',
  },
  h2: {
    fontFamily: "var(--font-orbitron), sans-serif",
    fontSize: 16,
    fontWeight: 600,
    margin: '0 0 8px',
    letterSpacing: '0.5px',
  },
  cardLink: {
    color: '#00c6ff',
    textDecoration: 'none',
  },
  summary: {
    fontSize: 14,
    lineHeight: 1.55,
    color: '#b8c4d6',
    margin: 0,
  },
  guidesHeading: {
    fontFamily: "var(--font-orbitron), sans-serif",
    fontSize: 18,
    fontWeight: 700,
    color: '#ffffff',
    margin: '36px 0 14px',
    letterSpacing: '0.5px',
  },
  compliance: {
    fontSize: 12,
    lineHeight: 1.6,
    color: '#7f8ca3',
    margin: '28px 0 0',
  },
  inlineLink: {
    color: '#9fd8ff',
    textDecoration: 'underline',
    marginRight: 10,
  },
};
