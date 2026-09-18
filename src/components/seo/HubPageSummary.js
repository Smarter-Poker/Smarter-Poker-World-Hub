/* ═══════════════════════════════════════════════════════════════════════════
   HUB PAGE SUMMARY - the words a crawler reads on a hub product page
   ═══════════════════════════════════════════════════════════════════════════

   AEO PHASE 3 (2026-09-17). The World Hub publishes about thirty /hub routes
   in the sitemap at priority 0.7 to 0.9. Measured on production, with every
   script stripped, most of them were navigation chrome and nothing else:

       /hub                      31 words, NO heading at all
       /hub/bankroll-manager     51 words
       /hub/home-games           59 words
       /hub/poker-near-me/lobby  78 words

   Googlebot runs JavaScript and eventually sees the app. The crawlers that
   decide what ChatGPT, Claude, Perplexity and Meta AI may cite do not, and
   Bing does not at scale. To all of them these pages said nothing, which is
   the same hole scripts/prerender-public-routes.mjs closed for Club Arena.

   This is the same answer the landing page already uses
   (src/components/landing/LandingProductSummary.js): real page content,
   rendered on the server, that says what the page is and links the routes
   under it. It is NOT hidden text. Hidden text is a spam signal; this copy
   is meant to be read, sits at the end of the page in the normal flow, and
   uses the page's own type and colours.

   Copy follows the house rule: Title Case, no em dashes
   (scripts/ci/check-title-case.mjs, scripts/ci/check-ui-text.mjs). Keep the
   definitions in step with LandingProductSummary: an AI engine repeats the
   definition it sees most often, so the two must not drift.
   ═══════════════════════════════════════════════════════════════════════════ */

import Link from 'next/link';

/**
 * One entry per hub surface this component serves. `heading` is rendered as
 * an H2 unless the page has no heading of its own, in which case the page
 * asks for `as="h1"`.
 */
export const HUB_PAGE_SUMMARIES = {
  hub: {
    heading: 'The Smarter Poker World Hub',
    lead:
      'The World Hub Is The Command Center For Smarter Poker, A Free Online Poker Platform From Smarter Software Inc. Every Product Below Opens From Here: GTO Training, Private Poker Clubs, A Live Poker Room Directory, Home Games, A Bankroll Manager And The Community Feed. There Is No Real-Money Gambling: Club Chips Are Play Credits With No Cash Value, And Diamonds Are A Promotional Rewards Currency.',
    links: [
      { name: 'Poker Arena', href: '/hub/club-arena', text: 'Private Online Poker Clubs With Chips, Tournaments And Hand Histories.' },
      { name: 'Club Commander', href: '/hub/commander', text: 'Live Poker Room Waitlists, Tournament Clocks And Seat Alerts.' },
      { name: 'GTO Training', href: '/hub/training', text: 'Over 100 Scenario Games With Solver-Grade Hand Analysis.' },
      { name: 'Poker Near Me', href: '/hub/poker-near-me/lobby', text: 'Live Poker Rooms And Card Rooms By State And City.' },
      { name: 'Home Games', href: '/hub/home-games', text: 'Find And Host Home Poker Games Near You.' },
      { name: 'Bankroll Manager', href: '/hub/bankroll-manager', text: 'Track Sessions, Results And Bankroll With Exports.' },
    ],
  },
  'home-games': {
    heading: 'About Home Games On Smarter Poker',
    lead:
      'Home Games Is The Smarter Poker Directory Of Private Home Poker Games. Find Games Near You By State And City, See The Stakes, Format And Schedule A Host Has Published, Ask To Join, And Host Your Own Game With A Public Page Players Can Find. Home Games Are Free To List And Free To Join: Smarter Poker Takes No Rake And Handles No Money.',
    links: [
      { name: 'Poker Near Me', href: '/hub/poker-near-me/lobby', text: 'Live Poker Rooms, Card Rooms And Casinos By State And City.' },
      { name: 'Poker Arena', href: '/hub/club-arena', text: 'Take The Game Online In A Private Club With Chips And Hand Histories.' },
      { name: 'Club Commander', href: '/hub/commander', text: 'Run A Venue Or A Recurring Game With Waitlists And Tournament Clocks.' },
    ],
  },
  'bankroll-manager': {
    heading: 'About The Bankroll Manager',
    lead:
      'The Bankroll Manager Is The Smarter Poker Session Tracker. Log Cash Game And Tournament Sessions With Stakes, Venue, Duration And Result; Group Them Into Trips And Series; And Read Your Win Rate, Hourly, Variance And Bankroll Over Time. Results Export To CSV, And Nothing Here Is Tied To Real-Money Play: It Is A Record Of Sessions You Enter Yourself.',
    links: [
      { name: 'GTO Training', href: '/hub/training', text: 'Work On The Leaks The Numbers Point At.' },
      { name: 'Poker Near Me', href: '/hub/poker-near-me/lobby', text: 'Find The Room Or Tournament For The Next Session.' },
      { name: 'Home Games', href: '/hub/home-games', text: 'Log A Home Game And Find The Next One.' },
    ],
  },
  // AEO phase 3 (2026-09-17). These three pages sat in the sitemap at
  // priority 0.9, 0.8 and 0.7 and served a crawler an empty body: everything
  // they render lives inside <PageTransition>, which is dynamic(ssr:false).
  news: {
    heading: 'About Poker News On Smarter Poker',
    lead:
      'Poker News Is The Smarter Poker Feed Of Headlines From The Poker World, Gathered Hourly From Published Sources And Read In One Place. Tournament Results, Industry Updates, Player Interviews And Strategy Articles Are Sorted By Recency Or By Source, And Every Story Links Back To The Outlet That Published It. Reading Is Free And Needs No Account.',
    links: [
      { name: 'News Sources', href: '/hub/news/sources', text: 'Every Outlet The Feed Reads, And How Often It Checks.' },
      { name: 'Video Library', href: '/hub/video-library', text: 'Strategy Videos And Tournament Coverage In One Place.' },
      { name: 'Events Calendar', href: '/hub/events-calendar', text: 'Tournaments And Series By Date.' },
      { name: 'GTO Training', href: '/hub/training', text: 'Turn What You Read Into Hands You Play Better.' },
    ],
  },
  'video-library': {
    heading: 'About The Video Library',
    lead:
      'The Video Library Is The Smarter Poker Collection Of Poker Video Content: Strategy Breakdowns, Tournament Coverage And Training Series, Curated Rather Than Scraped. Watch Progress Is Remembered So A Long Session Picks Up Where It Stopped, And Jarvis Adds Tactical Analysis To The Hands A Video Covers. Watching Is Free And Needs No Account.',
    links: [
      { name: 'GTO Training', href: '/hub/training', text: 'Drill The Spot A Video Just Explained.' },
      { name: 'Poker News', href: '/hub/news', text: 'Headlines And Results From The Poker World, Hourly.' },
      { name: 'Poker Glossary', href: '/hub/training/glossary', text: 'Every Term A Commentator Uses, Defined.' },
    ],
  },
  'preflop-charts': {
    heading: 'About The Preflop Range Lab',
    lead:
      'The Preflop Range Lab Is Free Local Practice Against Authored Preflop Reference Ranges. Drill Opening, Three-Betting And Defending From Every Position, See Which Combos You Misplace, And Repeat The Ones You Miss. Results Stay On The Page: This Is Practice, So It Does Not Change Account Progress, Rank Or Rewards, And There Is Nothing To Wager.',
    links: [
      { name: 'GTO Training', href: '/hub/training', text: 'Over 100 Scenario Games With Solver-Grade Analysis.' },
      { name: 'Poker Glossary', href: '/hub/training/glossary', text: 'Three-Bet, Squeeze, Range Advantage And 46 More, Defined.' },
      { name: 'Bankroll Manager', href: '/hub/bankroll-manager', text: 'Track What The Practice Changes In Real Sessions.' },
    ],
  },
  'poker-near-me': {
    heading: 'About Poker Near Me',
    lead:
      'Poker Near Me Is The Smarter Poker Directory Of Live Poker In The United States. Search Casinos, Card Rooms And Poker Rooms By State And City, See Cash Game Stakes And Tournament Schedules, Follow Poker Series And Tour Stops, And Open A Map Of What Is Running Nearby. Venue Details Are Verified Against The Room And Dated, So A Listing Says When It Was Last Checked.',
    links: [
      { name: 'Home Games', href: '/hub/home-games', text: 'Private Home Poker Games By State And City.' },
      { name: 'Club Commander', href: '/hub/commander', text: 'Join A Venue Waitlist Remotely And Register For Tournaments.' },
      { name: 'Poker Arena', href: '/hub/club-arena', text: 'Play Online In A Private Club Between Live Sessions.' },
    ],
  },

  // AEO phase 3 (2026-09-17). Measured on production as OAI-SearchBot with
  // scripts and styles stripped, the five Club Commander player pages
  // returned between 59 and 76 words, and every one of those words was a
  // navigation label. /hub/commander read: "LIVE POKER Find Games And Join
  // Waitlists My Card Check In Leagues Compete Hands Review Limits Settings
  // ..." - chrome, not a sentence. Club Commander is the product a venue
  // buys and a player searches for, and its own page said nothing about it.
  commander: {
    heading: 'About Club Commander',
    lead:
      'Club Commander Is The Smarter Poker Room Management System For Live Poker Venues, And The Player Side Of It Is Free. Join A Cash Game Waitlist From Anywhere And Get Called When Your Seat Is Ready, Register For Tournaments And Follow The Clock, Check In At The Desk From Your Phone, Track A Season League, And Collect The Comps A Room Already Offers. Rooms Running Club Commander Publish Their Live Games, Stakes And Schedules Here, So The List Is What The Floor Says, Not What A Directory Guessed Last Year.',
    links: [
      { name: 'Live Poker Rooms', href: '/hub/commander/venues', text: 'Every Venue Running Club Commander, With The Games Running Now.' },
      { name: 'Tournaments', href: '/hub/commander/tournaments', text: 'Register Remotely And Follow The Clock, Blinds And Payouts.' },
      { name: 'Home Games', href: '/hub/commander/home-games', text: 'Recurring Private Games A Venue Or Host Runs On The Same Rails.' },
      { name: 'Leagues', href: '/hub/commander/leagues', text: 'Season Standings, Points And Final Table Qualification.' },
      { name: 'Commander FAQ', href: '/hub/commander/faq', text: 'Waitlists, Check In, Rewards And Responsible Gaming, Answered.' },
      { name: 'Responsible Gaming', href: '/hub/commander/responsible-gaming', text: 'Spending Limits, Cooling Off Periods And Self Exclusion.' },
    ],
  },
  'commander-venues': {
    heading: 'About Live Poker Rooms On Club Commander',
    lead:
      'This Is The Directory Of Poker Rooms Running Club Commander, Which Means The Games, Stakes And Waitlists You See Are The Ones The Floor Is Actually Running. Open A Room To See Its Live Cash Games, Its Tournament Schedule And How Long The List Is Right Now, Then Join The Waitlist From Wherever You Are And Get A Notification When Your Seat Comes Up. Listings Are Free For Players, And Venues Update Them From The Desk Rather Than By Email.',
    links: [
      { name: 'Poker Near Me', href: '/hub/poker-near-me/lobby', text: 'Every Card Room And Casino By State And City, Not Only Ours.' },
      { name: 'Tournaments', href: '/hub/commander/tournaments', text: 'What Is Running Tonight, And What You Can Register For Now.' },
      { name: 'Home Games', href: '/hub/home-games', text: 'Private Games Near You When The Room Is Too Far.' },
    ],
  },
  'commander-tournaments': {
    heading: 'About Tournaments On Club Commander',
    lead:
      'Every Tournament A Club Commander Venue Is Running, With Its Buy In, Starting Stack, Blind Structure, Late Registration Window And Live Clock. Register From Your Phone Before You Leave, Watch The Level And The Field Size Change In Real Time, And See The Payout Table As It Updates. Nothing Here Is A Real-Money Wager Placed On Smarter.Poker: The Buy In Is Paid At The Venue, And This Is The Board That Tells You Where To Be And When.',
    links: [
      { name: 'Live Poker Rooms', href: '/hub/commander/venues', text: 'The Venues Running These Tournaments, And Their Cash Games.' },
      { name: 'Leagues', href: '/hub/commander/leagues', text: 'How A Season Of These Results Adds Up To Standings.' },
      { name: 'Events Calendar', href: '/hub/events-calendar', text: 'Series And Festivals By Date, Across Every Room We Track.' },
    ],
  },
  'commander-home-games': {
    heading: 'About Home Games On Club Commander',
    lead:
      'Recurring Private Games Run On The Same Rails As A Card Room: An Invite List, A Seating Chart, A Waitlist When The Table Is Full, A Tournament Clock If The Game Is A Tournament, And Results That Carry Into A Season League. A Host Publishes The Stakes, Format And Schedule Once, And Players Join From Their Phones Instead Of A Group Chat. Hosting Is Free, And Smarter Poker Takes No Rake And Handles No Money.',
    links: [
      { name: 'Home Games Directory', href: '/hub/home-games', text: 'Find A Public Home Game Near You By State And City.' },
      { name: 'Live Poker Rooms', href: '/hub/commander/venues', text: 'Venues Running The Same Software For Their Public Games.' },
      { name: 'Leagues', href: '/hub/commander/leagues', text: 'Turn A Recurring Game Into A Season With Standings.' },
    ],
  },
  'commander-leagues': {
    heading: 'About Leagues On Club Commander',
    lead:
      'A League Turns A Season Of Games At One Venue Or One Home Game Into Standings: Points Per Finish, A Running Leaderboard, Qualification Rules For A Final, And A History Every Player Can Check. The Venue Or The Host Sets The Scoring Once And Club Commander Applies It To Every Result, So Nobody Keeps A Spreadsheet And Nobody Argues About Points In The Car Park.',
    links: [
      { name: 'Tournaments', href: '/hub/commander/tournaments', text: 'The Events A Season Is Made Of, With Clocks And Payouts.' },
      { name: 'Live Poker Rooms', href: '/hub/commander/venues', text: 'Venues Running Leagues, And What Is On Tonight.' },
      { name: 'Home Games', href: '/hub/commander/home-games', text: 'Run A Season On A Recurring Private Game.' },
    ],
  },
};

export default function HubPageSummary({ page, as = 'h2' }) {
  const entry = HUB_PAGE_SUMMARIES[page];
  if (!entry) return null;
  const Heading = as === 'h1' ? 'h1' : 'h2';
  const headingId = `hub-summary-${page}`;

  return (
    <section style={styles.section} aria-labelledby={headingId}>
      <Heading id={headingId} style={styles.heading}>
        {entry.heading}
      </Heading>
      <p style={styles.lead}>{entry.lead}</p>
      <ul style={styles.list}>
        {entry.links.map((link) => (
          <li key={link.href} style={styles.item}>
            <Link href={link.href} style={styles.link}>
              {link.name}
            </Link>
            <span style={styles.itemText}>{link.text}</span>
          </li>
        ))}
      </ul>
      <p style={styles.compliance}>
        Free To Play. 18+. Diamonds And Chips Have No Cash Value.{' '}
        <Link href="/terms" style={styles.inlineLink}>
          Terms
        </Link>
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
    padding: '40px 20px 48px',
    color: '#e6ecf5',
    fontFamily: "var(--font-inter), -apple-system, BlinkMacSystemFont, sans-serif",
  },
  heading: {
    fontFamily: "var(--font-orbitron), sans-serif",
    fontSize: 'clamp(18px, 2.4vw, 24px)',
    fontWeight: 700,
    lineHeight: 1.3,
    color: '#ffffff',
    margin: '0 0 14px',
    letterSpacing: '0.5px',
  },
  lead: {
    fontSize: 15,
    lineHeight: 1.65,
    color: '#b8c4d6',
    margin: '0 0 24px',
    maxWidth: 860,
  },
  list: {
    listStyle: 'none',
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
    gap: 14,
    margin: 0,
    padding: 0,
  },
  item: {
    background: 'rgba(255, 255, 255, 0.04)',
    border: '1px solid rgba(0, 198, 255, 0.18)',
    borderRadius: 12,
    padding: '16px 16px 14px',
  },
  link: {
    display: 'block',
    fontFamily: "var(--font-orbitron), sans-serif",
    fontSize: 15,
    fontWeight: 600,
    color: '#00c6ff',
    textDecoration: 'none',
    marginBottom: 6,
    letterSpacing: '0.5px',
  },
  itemText: {
    fontSize: 14,
    lineHeight: 1.55,
    color: '#b8c4d6',
  },
  compliance: {
    fontSize: 12,
    lineHeight: 1.6,
    color: '#7f8ca3',
    margin: '26px 0 0',
  },
  inlineLink: {
    color: '#9fd8ff',
    textDecoration: 'underline',
    marginRight: 10,
  },
};
