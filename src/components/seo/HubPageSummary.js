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

import Head from 'next/head';
import Link from 'next/link';
import { summarySchema } from '../../lib/seo/summarySchema';
import SmarterConversionCta from './SmarterConversionCta';
import { VENUE_COUNT_LABEL } from '../../lib/venueCount.mjs';


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
      { name: 'Personal Poker Assistant', href: '/hub/personal-assistant', text: 'Jarvis AI Coaching, Leak Finder And Priority Study Queue.' },
      { name: 'Poker Near Me', href: '/hub/poker-near-me/lobby', text: 'Live Poker Rooms And Card Rooms By State And City.' },
      { name: 'Home Games', href: '/hub/home-games', text: 'Find And Host Home Poker Games Near You.' },
      { name: 'Bankroll Manager', href: '/hub/bankroll-manager', text: 'Track Sessions, Results And Bankroll With Exports.' },
      { name: 'Poker App Comparisons', href: '/compare', text: 'How These Products Compare With The Alternatives, With Sources.' },
      { name: 'Platform Features', href: '/features', text: 'All Fifteen Free Smarter.Poker Verticals And Plain-Text Markdown Specs.' },
      { name: 'Original Poker Research', href: '/research', text: 'First-Party Benchmark Studies On Live Rake, Solver EV And Field Sizes.' },
      { name: 'Poker Trivia', href: '/hub/trivia', text: 'Free Poker Quiz Games With Leaderboards And Daily Runs.' },
      { name: 'Install App Guide', href: '/hub/install', text: 'Add Smarter Poker To Your iPad, iPhone Or Android Home Screen.' },
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
      { name: 'Home Games By State', href: '/hub/home-games/in', text: 'Every State And City With A Published Home Game, One Page Each.' },
    ],
  },
  'poker-tours': {
    heading: 'About The Poker Tours Directory',
    lead:
      'Poker Tours Is The Smarter Poker Directory Of Travelling Tournament Circuits. Each Tour Has Its Own Page With The Stops It Is Playing, The Events At Each Stop, Buy Ins, Start Times And Results As They Land. House Series That Run At A Single Property Are Listed Separately Further Up This Page. Everything Here Is Free To Read And Nothing On Smarter Poker Is Real-Money Gambling.',
    links: [
      { name: 'Poker Series', href: '/hub/poker-series', text: 'Every Individual Tournament Series Running Now Or Coming Up, With Schedules.' },
      { name: 'Events Calendar', href: '/hub/events-calendar', text: 'Single Tournaments And Dailies Across Every Venue In The Directory.' },
      { name: 'Poker Venues', href: '/hub/poker-near-me/venues', text: 'The Rooms And Casinos These Tours Stop At, By State And City.' },
    ],
  },
  'poker-series': {
    heading: 'About The Poker Series Directory',
    lead:
      'Poker Series Is The Smarter Poker Directory Of Individual Tournament Series. Each Series Has Its Own Page Carrying The Venue, The Dates It Runs, The Events On Its Schedule And The Buy Ins, Whether It Belongs To A Travelling Tour Or Is Run By One Room. Series Pages Are Free To Read And Nothing On Smarter Poker Is Real-Money Gambling.',
    links: [
      { name: 'Poker Tours', href: '/hub/poker-tours', text: 'The Travelling Circuits These Series Belong To, Stop By Stop.' },
      { name: 'Events Calendar', href: '/hub/events-calendar', text: 'Single Tournaments And Dailies Across Every Venue In The Directory.' },
      { name: 'Poker Venues', href: '/hub/poker-near-me/venues', text: 'The Rooms And Casinos Running These Series, By State And City.' },
    ],
  },
  training: {
    heading: 'About GTO Training On Smarter Poker',
    lead:
      'GTO Training Is The Smarter Poker Practice Room. Play Scenario Games Against Solver-Grade Ranges, Read Back Where A Decision Left Value Behind, Work Through Daily Challenges And Tournaments Against Other Players, And Upload Real Hand Histories For Review. Training Is Free And Uses Play Credits Only: There Is No Real-Money Gambling Anywhere On Smarter Poker.',
    links: [
      { name: 'Jarvis Hand Review', href: '/hub/training/jarvis', text: 'Walk A Hand Back Street By Street With A Solver-Grade Second Opinion.' },
      { name: 'Hand History Upload', href: '/hub/training/hand-history-upload', text: 'Bring Real Sessions In And Have Them Read For Leaks.' },
      { name: 'Solutions Library', href: '/hub/training/solutions', text: 'Worked Spots And The Reasoning Behind Each Line.' },
      { name: 'Weak Spot Autopilot', href: '/hub/training/autopilot', text: 'Stream Continuous Drills Targeting Your Lowest-Accuracy Positions.' },
      { name: 'Guided Coach Mode', href: '/hub/training/coach-mode', text: 'Step-By-Step GTO Lessons Paired With Interactive Decision Quizzes.' },
      { name: 'Solver Spot Study', href: '/hub/training/spot-trainer', text: 'Inspect Answer-Revealed Solver Policies At Your Own Pace.' },
      { name: 'Tournament ICM Simulator', href: '/hub/training/icm-simulator', text: 'Calculate Malmuth-Harville Prize Pool Equity And Bubble Pressure.' },
      { name: 'Final Table Simulator', href: '/hub/training/final-table-sim', text: 'Model 9-Handed To Heads-Up Pay Jumps And ICM Chop Numbers.' },
      { name: 'Hand Lab Analyzer', href: '/hub/training/hand-lab', text: 'Run 10,000-Iteration Monte Carlo Board And Equity Breakdowns.' },
      { name: 'Position Mastery Heatmap', href: '/hub/training/position-mastery', text: 'Track Solver Accuracy Across All Six Table Positions.' },
      { name: 'Weakness Scanner', href: '/hub/training/weakness-scanner', text: 'Pinpoint Expected Value Leaks By Street And Scenario Category.' },
      { name: 'Custom Drill Builder', href: '/hub/training/drill-builder', text: 'Assemble Filtered Practice Sessions By Position, Street And Stack.' },
      { name: 'Spaced-Repetition Flashcards', href: '/hub/training/flashcards', text: 'Memorize GTO Frequencies With SuperMemo SM-2 Scheduling.' },
      { name: '6-Max Preflop Browser', href: '/hub/training/preflop-charts', text: 'Compare 100BB Opening, 3-Bet And Defense Matrices.' },
      { name: 'Multiway Preflop Ranges', href: '/hub/training/multiway-preflop', text: 'Explore 3-Way And 4-Way Cold-Calling And Squeeze Ranges.' },
      { name: 'Interactive Range Builder', href: '/hub/training/range-builder', text: 'Paint And Drill Custom 13x13 Preflop Hand Matrices.' },
      { name: 'Rake Cost Estimator', href: '/hub/training/custom-rake', text: 'Calculate Hourly And BB/100 Rake Impact Across Stakes.' },
      { name: 'Rake Sensitivity Explorer', href: '/hub/training/rake-solutions', text: 'See How Pot Drop Shifts Preflop Opening And Defense Curves.' },
      { name: 'Risk Of Ruin Analyzer', href: '/hub/training/risk-analyzer', text: 'Simulate Monte Carlo Bankroll Trajectories And Downswings.' },
      { name: 'Poker Skill Tree', href: '/hub/training/skill-tree', text: 'Follow The Competency Map From Preflop Foundations To ICM.' },
      { name: 'Training Tournaments', href: '/hub/training/tournaments', text: 'Scheduled Training Events With Standings And Prizes.' },
      { name: 'Preflop Charts', href: '/hub/preflop-charts', text: 'Opening And Defending Ranges By Position And Stack Depth.' },
      { name: 'Poker Glossary', href: '/glossary', text: 'Plain Definitions For The Terms Used Across The Site.' },
      { name: 'Poker Trivia', href: '/hub/trivia', text: 'Quiz Games On Rules, Odds And History, With Leaderboards.' },
      { name: 'Poker Strategy Lessons', href: '/learn', text: 'Forty Free Lessons That Answer The Question Before The Drill.' },
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
      { name: 'Poker Glossary', href: '/glossary', text: 'Every Term A Commentator Uses, Defined.' },
    ],
  },
  'preflop-charts': {
    heading: 'About The Preflop Range Lab',
    lead:
      'The Preflop Range Lab Is Free Local Practice Against Authored Preflop Reference Ranges. Drill Opening, Three-Betting And Defending From Every Position, See Which Combos You Misplace, And Repeat The Ones You Miss. Results Stay On The Page: This Is Practice, So It Does Not Change Account Progress, Rank Or Rewards, And There Is Nothing To Wager.',
    links: [
      { name: 'GTO Training', href: '/hub/training', text: 'Over 100 Scenario Games With Solver-Grade Analysis.' },
      { name: 'Poker Glossary', href: '/glossary', text: 'Three-Bet, Squeeze, Range Advantage And 71 More, Defined.' },
      { name: 'Bankroll Manager', href: '/hub/bankroll-manager', text: 'Track What The Practice Changes In Real Sessions.' },
    ],
  },
  'poker-tools': {
    heading: 'About The Smarter Poker Odds Calculator',
    lead:
      'The Smarter Poker Odds Calculator Computes Real-Time Hand Equity For Texas Holdem, Omaha, PLO5, PLO6, Seven Card Stud And Razz. Run Exact Multiway Monte Carlo Simulations Against Up To Six Opponents, Analyze Flop, Turn And River Textures, Factor Dead Cards, And Test Critical Tournament Scenarios With Zero Account Sign-Up Or Fees.',
    links: [
      { name: 'Preflop Charts', href: '/hub/preflop-charts', text: 'Master Position-Based Opening And Push-Fold Ranges.' },
      { name: 'GTO Training', href: '/hub/training', text: 'Over 100 Solver-Grade Training Scenarios With Live Feedback.' },
      { name: 'Bankroll Manager', href: '/hub/bankroll-manager', text: 'Track Real Sessions, Hourly Win Rates And Variance.' },
      { name: 'Poker Strategy Lessons', href: '/learn', text: 'Step-By-Step Guides On Pot Odds, Implied Odds And Expected Value.' },
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

  /*
   * THE POKER NEAR ME TABS (AEO phase 3, 2026-09-19).
   *
   * Measured on production as OAI-SearchBot with scripts stripped, all
   * eleven tabs of /hub/poker-near-me/[pnmTab] served the same document.
   * /hub/poker-near-me/tours and /hub/poker-near-me/series came to 351 words
   * each and differed in three of them: the title, the h1, and one label in
   * the nav. Every other tab measured 350 to 355 words of the same venue
   * lobby chrome.
   *
   * ROUTE_META already gave each tab its own title and description. What no
   * tab had was a body, so to a crawler they were one page under eleven
   * URLs, and the tab that the family nav points at outranked the standalone
   * directory that actually holds the content.
   *
   * Each tab now says what it is and links where it leads. The copy is the
   * differentiator and the links are the road: this is also what puts
   * /hub/poker-tours, /hub/poker-series, /hub/daily-tournaments and
   * /hub/events-calendar within one hop of every discovery page.
   */
  'pnm-venues': {
    heading: 'About The Poker Venue Directory',
    lead:
      'This Is The Live Poker Venue Directory: Casinos, Card Rooms And Poker Rooms Across The United States, With The Games They Spread, The Stakes They Run, Their Hours And Their Location. Each Venue Has Its Own Page Carrying Its Schedule And What The Room Was Last Verified To Offer, With The Date It Was Checked. Filter By State And City, By Game, Or By Distance From Where You Are.',
    links: [
      { name: 'Browse By Location', href: '/hub/poker-near-me/in', text: 'Every State And City With A Poker Room, One Page Each.' },
      { name: 'Live Cash Games', href: '/hub/poker-near-me/live-games', text: 'What Is Running Right Now, Room By Room.' },
      { name: 'Poker Room Map', href: '/hub/poker-near-me/map', text: 'The Same Directory As A Map You Can Pan.' },
      { name: 'Events Calendar Near You', href: '/hub/poker-near-me/events-calendar', text: 'What Is Scheduled At These Rooms, By Date.' },
    ],
  },
  'pnm-map': {
    heading: 'About The Poker Room Map',
    lead:
      'The Poker Room Map Plots Every Casino, Card Room And Poker Room In The Directory So You Can See What Is Near You Rather Than Reading A List. Pan Anywhere And The Map Searches That View. Each Pin Opens The Venue With Its Games, Stakes, Hours And Schedule. Tour Stops And Running Series Appear On The Same Map, So A Trip Can Be Planned Around Both.',
    links: [
      { name: 'Poker Venue Directory', href: '/hub/poker-near-me/venues', text: 'The Same Rooms As A Filterable List.' },
      { name: 'Road Trip Planner', href: '/hub/poker-near-me/roadtrip', text: 'Poker Rooms Along A Route You Are Driving.' },
      { name: 'Browse By Location', href: '/hub/poker-near-me/in', text: 'Every State And City With A Poker Room.' },
      { name: 'Discovery Tools', href: '/hub/poker-near-me/more', text: 'Compare Rooms, Read Game Trends And Set Alerts.' },
    ],
  },
  'pnm-live-games': {
    heading: 'About Live Cash Games Near You',
    lead:
      'Live Cash Games Shows What Is Actually Running: Which Rooms Have Tables Open, At What Stakes And In What Games. Observed Table Counts Come From The Room Or Its Feed And Are Labelled As Observed. Where No Feed Exists, A Modelled Estimate Is Shown And Labelled As Modelled, Because A Guess Presented As A Fact Is Worse Than No Number At All.',
    links: [
      { name: 'Poker Venue Directory', href: '/hub/poker-near-me/venues', text: 'Every Room In The Directory With Its Full Detail.' },
      { name: 'Daily Tournaments', href: '/hub/daily-tournaments', text: 'The Tournaments Running Today And Tomorrow.' },
      { name: 'Poker Room Map', href: '/hub/poker-near-me/map', text: 'See Which Of These Rooms Is Closest.' },
      { name: 'Daily Tournaments Near You', href: '/hub/poker-near-me/daily-tournaments', text: 'The Recurring Events These Rooms Run, Filtered By Distance.' },
    ],
  },
  'pnm-tours': {
    heading: 'About Poker Tours Near You',
    lead:
      'This Tab Shows Travelling Poker Tours Through The Lens Of Where You Are: Which Circuits Are Stopping Nearby, When, And At Which Room. A Tour Is A Series Of Stops Rather Than A Single Event, So The Stop Matters As Much As The Tour. The Full Tour Directory, With A Page Per Circuit And Every Stop It Is Playing, Is Linked Below.',
    links: [
      { name: 'Poker Tours Directory', href: '/hub/poker-tours', text: 'Every Travelling Circuit, With A Page Per Tour.' },
      { name: 'Poker Series Directory', href: '/hub/poker-series', text: 'The Individual Series These Tours Are Built From.' },
      { name: 'Events Calendar', href: '/hub/events-calendar', text: 'Single Tournaments Across Every Venue.' },
    ],
  },
  'pnm-series': {
    heading: 'About Poker Series Near You',
    lead:
      'This Tab Shows Tournament Series Through The Lens Of Where You Are: What Is Running Now Or Starting Soon Within Reach, At Which Venue, And Over Which Dates. A Series Is A Run Of Events At One Property Rather Than A Single Tournament. The Full Series Directory, With A Page Per Series Carrying Its Schedule And Buy Ins, Is Linked Below.',
    links: [
      { name: 'Poker Series Directory', href: '/hub/poker-series', text: 'Every Series, With A Page Per Series And Its Schedule.' },
      { name: 'Poker Tours Directory', href: '/hub/poker-tours', text: 'The Travelling Circuits Many Of These Series Belong To.' },
      { name: 'Events Calendar', href: '/hub/events-calendar', text: 'Single Tournaments Across Every Venue.' },
    ],
  },
  'pnm-daily-tournaments': {
    heading: 'About Daily Poker Tournaments Near You',
    lead:
      'Daily Tournaments Are The Recurring Events A Room Runs On A Schedule Rather Than As Part Of A Series: The Nightly Bounty, The Weekend Deepstack, The Morning Turbo. This Tab Filters Them By Day, Game, Buy In, Guarantee And Distance, So A Tournament You Can Actually Get To Is The One You See First.',
    links: [
      { name: 'Daily Tournaments', href: '/hub/daily-tournaments', text: 'The Full Daily Tournament Listing Across Every Room.' },
      { name: 'Events Calendar', href: '/hub/events-calendar', text: 'Everything Scheduled, Laid Out By Date.' },
      { name: 'Poker Venue Directory', href: '/hub/poker-near-me/venues', text: 'The Rooms Running These Tournaments.' },
    ],
  },
  'pnm-events-calendar': {
    heading: 'About The Poker Events Calendar Near You',
    lead:
      'The Events Calendar Lays Out Poker Tournaments And Live Events By Date Rather Than By Venue, So A Week Or A Month Can Be Read At A Glance. Series Events, Tour Stops And A Room Own Dailies All Appear On The Same Calendar, With The Venue, Buy In And Start Time On Each Entry.',
    links: [
      { name: 'Events Calendar', href: '/hub/events-calendar', text: 'The Full Calendar Across Every Venue In The Directory.' },
      { name: 'Poker Series Directory', href: '/hub/poker-series', text: 'The Series These Events Belong To.' },
      { name: 'Daily Tournaments', href: '/hub/daily-tournaments', text: 'The Recurring Events A Room Runs On A Schedule.' },
    ],
  },
  'pnm-more': {
    heading: 'About The Poker Discovery Tools',
    lead:
      'Discovery Tools Are The Parts Of Poker Near Me That Answer A Question Rather Than List A Place: Compare Two Venues Side By Side, Read Game Trends And Peak Hours For A Room, Estimate What A Trip Will Cost, And Set Alerts For Games And Tournaments You Want To Hear About. Every Tool Reads The Same Verified Venue Directory.',
    links: [
      { name: 'Road Trip Planner', href: '/hub/poker-near-me/roadtrip', text: 'Poker Rooms Along A Route You Are Driving.' },
      { name: 'Poker Room Map', href: '/hub/poker-near-me/map', text: 'See The Whole Directory Geographically.' },
      { name: 'Poker Venue Directory', href: '/hub/poker-near-me/venues', text: 'The Rooms Behind Every Tool On This Page.' },
    ],
  },
  'pnm-roadtrip': {
    heading: 'About The Poker Road Trip Planner',
    lead:
      'The Road Trip Planner Takes A Start And An End Point And Finds The Poker Rooms Along The Way Rather Than The Ones Nearest Your Home. Stops Are Shown With Their Games, Stakes And Hours, And With Whatever Tournaments Or Series Are Running While You Would Be Passing Through, So A Drive Can Be Built Around The Poker Instead Of The Other Way Round.',
    links: [
      { name: 'Poker Room Map', href: '/hub/poker-near-me/map', text: 'See The Route And The Rooms On One Map.' },
      { name: 'Poker Venue Directory', href: '/hub/poker-near-me/venues', text: 'Full Detail On Any Room On The Route.' },
      { name: 'Browse By Location', href: '/hub/poker-near-me/in', text: 'Every State And City The Route Passes Through.' },
    ],
  },
  'pnm-saved': {
    heading: 'About Saved Poker Places',
    lead:
      'Saved Places Is Your Own Shortlist Of Poker Rooms, Home Games, Tours And Series, Kept In One Workspace So You Do Not Have To Search For The Same Venue Twice. Save A Room You Plan To Visit, A Series You Are Watching The Schedule Of, Or A Home Game You Have Asked To Join, And They Stay Together With Their Current Details Rather Than A Snapshot. Saved Places Is Private To Your Account, So This Page Is Not Published Or Indexed.',
    links: [
      { name: 'Poker Venue Directory', href: '/hub/poker-near-me/venues', text: 'Find More Rooms To Save.' },
      { name: 'Browse By Location', href: '/hub/poker-near-me/in', text: 'Every State And City With A Poker Room.' },
      { name: 'Poker Near Me Lobby', href: '/hub/poker-near-me/lobby', text: 'The Command Deck For Live Poker Discovery.' },
    ],
  },
  'pnm-alerts': {
    heading: 'About Poker Tournament Alerts',
    lead:
      'Alerts Tell You When Something You Care About Is Happening Nearby: A Tournament At A Buy In You Play, A Cash Game Running At Your Stakes, Or A Series Starting Within A Distance You Set. Set The Radius, The Days And The Games Once, And The Alert Watches The Same Verified Directory The Rest Of Poker Near Me Reads. Alerts Are Configured Per Account And Are Private, So This Page Is Not Published Or Indexed.',
    links: [
      { name: 'Live Cash Games', href: '/hub/poker-near-me/live-games', text: 'What Is Running Right Now Without Waiting For An Alert.' },
      { name: 'Poker Venue Directory', href: '/hub/poker-near-me/venues', text: 'Pick The Rooms Worth Hearing About.' },
      { name: 'Poker Near Me Lobby', href: '/hub/poker-near-me/lobby', text: 'The Command Deck For Live Poker Discovery.' },
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

  // The community surfaces: nine routes returning between 0 and 127 words
  // on production, most of them chrome (AEO phase 3, 2026-09-17).
  'social-media': {
    heading: 'About The Poker Social Hub',
    lead:
      'The Social Hub Is Where Smarter Poker Players Post: Hands They Want An Opinion On, Results They Are Pleased With, Questions About A Rule Nobody At The Table Could Settle, And The Occasional Bad Beat. Follow The Players You Actually Play With, Join Discussions On Someone Else Post, And Build A Feed That Is Poker Rather Than Everything. Free To Read And Free To Post, And Nothing On It Is A Wager.',
    links: [
      { name: 'Reels', href: '/hub/reels', text: 'Short Poker Video From The Community And The Circuit.' },
      { name: 'Poker News', href: '/hub/news', text: 'Headlines And Results From Published Sources, Hourly.' },
      { name: 'Community Pages', href: '/hub/social-pages', text: 'Pages For Venues, Groups, Communities And Brands.' },
      { name: 'Leaderboards', href: '/hub/leaderboards', text: 'Who Is Ahead Across Every Game On The Platform.' },
    ],
  },
  reels: {
    heading: 'About Reels',
    lead:
      'Reels Is The Short-Video Feed For Poker Highlights And Strategy, Responsible Casino And Slots Entertainment, And Sports Clips From Approved Sources. Every Reel Must Pass The Same Public Playback, Attribution And Safety Checks Before It Reaches The Feed. Watching Is Free And Needs No Account, And Nothing In It Is A Wager.',
    links: [
      { name: 'Video Library', href: '/hub/video-library', text: 'Longer Strategy Content And Tournament Coverage.' },
      { name: 'Social Hub', href: '/hub/social-media', text: 'The Feed The Clips Get Discussed In.' },
      { name: 'Lives', href: '/hub/lives', text: 'What Is Streaming Right Now.' },
    ],
  },
  lives: {
    heading: 'About Lives',
    lead:
      'Lives Lists The Poker Streams Running Right Now And The Ones Scheduled Next, From Players Streaming Their Own Sessions To Tournament Coverage With Hole Cards On A Delay. Open One And It Plays Here, With The Chat Beside It. Watching Is Free And Needs No Account, And Nothing On The Page Is A Wager.',
    links: [
      { name: 'Reels', href: '/hub/reels', text: 'Short Clips When There Is Nothing Live.' },
      { name: 'Video Library', href: '/hub/video-library', text: 'Recorded Strategy Content And Coverage.' },
      { name: 'Events Calendar', href: '/hub/events-calendar', text: 'What Is Being Played, And Where, By Date.' },
    ],
  },
  'social-pages': {
    heading: 'About Community Pages',
    lead:
      'A Community Page Is A Public Home For A Venue, A Home Game, A Local Group Or A Poker Brand: Who You Are, What You Run, When It Runs And How To Join. Pages Are Free To Create And Free To Follow, Followers See Posts In Their Feed, And A Venue Page Can Carry The Same Games And Waitlists Club Commander Publishes. Nothing On A Page Is A Wager.',
    links: [
      { name: 'Home Games', href: '/hub/home-games', text: 'Find Or Host A Private Game Near You.' },
      { name: 'Club Commander', href: '/hub/commander', text: 'Run A Venue With Waitlists And Tournament Clocks.' },
      { name: 'Social Hub', href: '/hub/social-media', text: 'The Feed A Page Posts Into.' },
    ],
  },
  pages: {
    heading: 'About The Pages Directory',
    lead:
      'The Pages Directory Lists Every Public Community Page On Smarter Poker: Venues, Home Games, Local Groups And Brands, Searchable By Name And Browsable By Kind. It Is The Way To Find A Room Or A Group You Have Heard Of But Cannot Place, And The Way A New Page Gets Found At All. Free To Browse And Free To Appear In.',
    links: [
      { name: 'Community Pages', href: '/hub/social-pages', text: 'What A Page Is, And How To Create One.' },
      { name: 'Live Poker Rooms', href: '/hub/commander/venues', text: 'Venues Running Club Commander, With Live Games.' },
      { name: 'Home Games', href: '/hub/home-games', text: 'Private Games By State And City.' },
    ],
  },
  leaderboards: {
    heading: 'About The Leaderboards',
    lead:
      'The Leaderboards Collect Every Ranking On Smarter Poker In One Place: Training Accuracy, Trivia Runs, Preflop Practice, Arena Results And Season Leagues, Each On Daily, Weekly And All Time Windows. Every Board Shows The Sample It Was Measured Over, Because A Ranking With No Volume Behind It Is Not A Ranking. Free To Appear On, And Nothing On Any Board Is A Payout.',
    links: [
      { name: 'GTO Training', href: '/hub/training', text: 'The Drills The Accuracy Boards Come From.' },
      { name: 'Poker Trivia', href: '/hub/trivia', text: 'Six Modes, One Question Bank, One Board.' },
      { name: 'Poker Arena', href: '/hub/club-arena', text: 'Private Club Games, Results And Club Leaderboards.' },
    ],
  },
  promotions: {
    heading: 'About Promotions',
    lead:
      'Promotions Lists What Is Currently Being Given Away On Smarter Poker: Diamond Drops, Free Entry Windows, Seasonal Events And Venue Offers From Rooms Running Club Commander. Each Entry Carries Its Own Rules, Its Dates And Who Is Eligible, And Every Reward Is A Promotional Rewards Currency Or A Free Entry. Nothing Here Pays Cash, And Nothing Here Is A Wager.',
    links: [
      { name: 'Smarter Rewards', href: '/hub/smarter-rewards', text: 'What Playing Regularly Earns You.' },
      { name: 'Official Rules', href: '/legal/official-rules', text: 'The Rules Every Promotion Runs Under.' },
      { name: 'Diamond Store', href: '/hub/diamond-store', text: 'What Diamonds Are For.' },
    ],
  },
  help: {
    heading: 'About The Help Center',
    lead:
      'The Help Center Answers The Questions People Actually Ask: Getting Into An Account, Joining A Club Or A Waitlist, What Chips And Diamonds Are And Are Not, How Training Scores Work, What Happens To Your Data, And How To Set A Limit Or Exclude Yourself. Every Answer Is Written For Someone Who Has Not Used The Platform Before. Free To Read, And No Account Is Needed.',
    links: [
      { name: 'Commander FAQ', href: '/hub/commander/faq', text: 'Waitlists, Check In, Rewards And Venue Questions.' },
      { name: 'Responsible Gaming', href: '/hub/commander/responsible-gaming', text: 'Limits, Cooling Off Periods And Self Exclusion.' },
      { name: 'Terms Of Service', href: '/terms', text: 'The Agreement Every Account Is Held To.' },
      { name: 'Privacy Policy', href: '/privacy', text: 'What Is Collected, And What Is Done With It.' },
    ],
  },
  'news-sources': {
    heading: 'About The News Sources',
    lead:
      'This Page Lists Every Outlet The Smarter Poker News Feed Reads, How Often It Checks Each One, And When It Last Succeeded. Nothing Is Rewritten And Nothing Is Republished In Full: A Story In The Feed Is A Headline, A Summary And A Link Back To The Outlet That Wrote It. If A Source Stops Updating, This Page Is Where That Shows. Free To Read.',
    links: [
      { name: 'Poker News', href: '/hub/news', text: 'The Feed These Sources Fill.' },
      { name: 'Video Library', href: '/hub/video-library', text: 'Curated Strategy Video And Tournament Coverage.' },
      { name: 'Events Calendar', href: '/hub/events-calendar', text: 'Series And Festivals By Date.' },
    ],
  },
  // AEO phase 3 (2026-09-17). The trivia family: eight routes in the
  // sitemap, and measured on production as OAI-SearchBot they returned
  // between 0 and 67 words. Everything they render lives behind a data load
  // or a client-only wrapper, so a crawler saw the chrome and left.
  trivia: {
    heading: 'About Poker Trivia',
    lead:
      'Poker Trivia Presents A Gallery Of 12 Games With Server Scored Questions On Hand Rankings, Pot Odds, Tournament Strategy, History And Rules. Choose A Knowledge Room Or A Challenge, Sign In To Start Or Recover Your Run, And Review The Entry Cost, VIP Eligibility And Reward Limits Before Playing. Challenge Modes Include Three Miss, Progressive Survival And Time Attack. Results And Diamond Activity Are Confirmed By Server Receipts.',
    links: [
      // Head To Head and Trivia Tournaments ARE NOT LINKED from these
      // summaries while their release gates are closed
      // (TRIVIA_PVP_ENABLED, TRIVIA_TOURNAMENTS_ENABLED). Both pages
      // redirect to /hub/trivia until those are set, so the links sent a
      // reader, and a crawler, straight into a 307. Restore them in the
      // same change that opens the gate: the sitemap reads the gate
      // itself, and a-summary-only-links-to-a-page-that-exists fails
      // until the two agree (AEO phase 3, 2026-09-18).
      { name: 'Endless', href: '/hub/trivia/endless', text: 'One Hundred Questions, With A Three Miss Limit.' },
      { name: 'Survival', href: '/hub/trivia/survival-game', text: 'Ten Levels With Increasing Accuracy Requirements.' },
      { name: 'Time Attack', href: '/hub/trivia/time-attack', text: 'As Many As You Can Before The Clock Runs Out.' },
      { name: 'Leaderboard', href: '/hub/trivia/leaderboard', text: 'Who Is Ahead Today, This Week And All Time.' },
    ],
  },
  'trivia-endless': {
    heading: 'About Endless Mode',
    lead:
      'Endless Is The Three Miss Challenge: Work Through A Dealt Round Of One Hundred Questions Until You Finish Or Reach Three Misses. Sign In To Start Or Recover Your Run. Review Entry Cost, VIP Eligibility, Reward Limits And Paid Skip Terms Before Playing. Answers, Skips And Settlement Are Recorded By The Server, And A Pending Receipt Can Be Recovered Without Starting A Second Entry.',
    links: [
      { name: 'Poker Trivia', href: '/hub/trivia', text: 'Every Mode, And How The Question Bank Works.' },
      { name: 'Survival', href: '/hub/trivia/survival-game', text: 'Twenty Questions Per Level, With Increasing Accuracy Requirements.' },
      { name: 'Poker Glossary', href: '/glossary', text: 'Look Up Anything A Question Used And You Did Not Know.' },
    ],
  },
  'trivia-survival': {
    heading: 'About Survival Mode',
    lead:
      'Survival Advances Through Ten Levels Of Twenty Questions With Increasing Accuracy Requirements. Sign In To Start Or Recover Your Level, And Review Entry Cost, VIP Eligibility, Reward Limits And Paid Skip Terms Before Playing. The Server Records Each Answer And Settles Each Level; Advancement Depends On Meeting That Level\'s Required Score.',
    links: [
      { name: 'Poker Trivia', href: '/hub/trivia', text: 'Every Mode, And How The Question Bank Works.' },
      { name: 'Leaderboard', href: '/hub/trivia/leaderboard', text: 'The Deepest Runs Today, This Week And All Time.' },
      { name: 'Endless', href: '/hub/trivia/endless', text: 'One Hundred Questions, With A Three Miss Limit.' },
    ],
  },
  'trivia-time-attack': {
    heading: 'About Time Attack',
    lead:
      'Time Attack Gives You A Timed Round Of Poker Questions. Sign In To Start Or Recover Your Run, And Review Entry Cost, VIP Eligibility And Reward Limits Before Playing. The Server Records Your Answers And Confirms The Final Score And Diamond Result. Keep The Same Run When Recovering A Pending Answer Or Settlement.',
    links: [
      { name: 'Poker Trivia', href: '/hub/trivia', text: 'Every Mode, And How The Question Bank Works.' },
      { name: 'GTO Training', href: '/hub/training', text: 'Timed Decisions On Real Hands Rather Than Questions.' },
      { name: 'Leaderboard', href: '/hub/trivia/leaderboard', text: 'The Highest Counts Today, This Week And All Time.' },
    ],
  },
  'trivia-mixed': {
    heading: 'About Mixed Mode',
    lead:
      'Mixed Combines Poker Questions From Different Categories In One Dealt Round. Sign In To Start Or Recover Your Run, And Review Entry Cost, VIP Eligibility And Reward Limits Before Playing. The Server Records Each Answer And Confirms The Final Score And Diamond Result. Recovery Retains Your Original Run And Recorded Answers.',
    links: [
      { name: 'Poker Trivia', href: '/hub/trivia', text: 'Every Mode, And How The Question Bank Works.' },
      { name: 'Poker Glossary', href: '/glossary', text: 'Seventy Four Terms Defined, For The Category You Keep Missing.' },
      { name: 'Endless', href: '/hub/trivia/endless', text: 'A Dealt Round With A Three Miss Limit.' },
    ],
  },
  'trivia-pvp': {
    heading: 'About Head To Head',
    lead:
      'Head To Head Puts Two Players On The Same Twenty Questions With A Diamond Stake Selected Before Search. The Server Shows The Exact Stake, Rake And Possible Return Before Entry, Tries To Find A Human First, And May Seat A Disclosed Smarter Horse After The Stored Twenty To Forty Five Second Window. Ties And Cancelled Searches Return Diamonds Under The Published Rules.',
    links: [
      { name: 'Poker Trivia', href: '/hub/trivia', text: 'Every Mode, And How The Question Bank Works.' },
      { name: 'Leaderboard', href: '/hub/trivia/leaderboard', text: 'Who Is Winning Matches Today, This Week And All Time.' },
    ],
  },
  'trivia-tournaments': {
    heading: 'About Trivia Tournaments',
    lead:
      'Trivia Nightly Starts At Eight PM Central With Server Published Registration, Entry, Rake And Prize Pool Terms. Humans And Disclosed Smarter Horses Advance Through Server Timed Head To Head Rounds, With Correct Answers, Answer Time, Completion Time And Seed Resolving Ties In That Order. Results, Refunds And Diamond References Remain Available After The Event.',
    links: [
      { name: 'Poker Trivia', href: '/hub/trivia', text: 'Every Mode, And How The Question Bank Works.' },
      { name: 'Events Calendar', href: '/hub/events-calendar', text: 'Live Poker Series And Festivals By Date.' },
    ],
  },
  'trivia-leaderboard': {
    heading: 'About The Trivia Leaderboard',
    lead:
      'The Trivia Leaderboard Ranks Players On Daily, Weekly And All Time Windows, Across Every Mode: Deepest Survival Run, Highest Time Attack Count, Longest Streak And Best Mixed Category Score. Rankings Update As Runs Finish, So The Board Is What Happened Today Rather Than A Weekly Snapshot. Free To Appear On, And Nothing On It Is A Wager Or A Payout.',
    links: [
      { name: 'Poker Trivia', href: '/hub/trivia', text: 'Every Mode, And How The Question Bank Works.' },
      { name: 'Survival', href: '/hub/trivia/survival-game', text: 'Progress Through Levels With Increasing Accuracy Requirements.' },
      { name: 'Smarter Rewards', href: '/hub/smarter-rewards', text: 'What Playing Regularly Earns You.' },
    ],
  },

  // The training sub-pages: seven routes in the sitemap returning between
  // 10 and 77 words each, for the same reason (AEO phase 3, 2026-09-17).
  'training-challenges': {
    heading: 'About Daily Challenges',
    lead:
      'Daily Challenges Are A Short Set Of Hands Chosen For You Each Day, Drawn From The Spots You Have Been Getting Wrong Rather Than From A Fixed List. A Challenge Takes A Few Minutes, Scores Every Decision Against A Solver Baseline, And Explains The Ones You Missed. Streaks Count Consecutive Days Completed. Free To Play, And Nothing In It Is A Wager.',
    links: [
      { name: 'GTO Training', href: '/hub/training', text: 'Over 100 Scenario Games And The Full Drill Library.' },
      { name: 'Training Leaderboard', href: '/hub/training/leaderboard', text: 'How Today\u2019s Scores Compare.' },
      { name: 'Poker Glossary', href: '/glossary', text: 'Every Term A Solution Uses, Defined.' },
    ],
  },
  'training-leaderboard': {
    heading: 'About The Training Leaderboard',
    lead:
      'The Training Leaderboard Ranks Players On Decision Accuracy Against The Solver Baseline Rather Than On Volume, So Playing More Hands Does Not Move You Up On Its Own. Daily, Weekly And All Time Windows Are Kept Separately, And Each Entry Shows The Sample It Was Measured Over, Because An Accuracy Number With No Hand Count Behind It Is Not A Number. Free To Appear On.',
    links: [
      { name: 'GTO Training', href: '/hub/training', text: 'The Drills The Scores Come From.' },
      { name: 'Daily Challenges', href: '/hub/training/challenges', text: 'The Fastest Way Onto The Daily Board.' },
      { name: 'Training Tournaments', href: '/hub/training/tournaments', text: 'Scheduled Events With A Field And A Final Standing.' },
    ],
  },
  'training-tournaments': {
    heading: 'About Training Tournaments',
    lead:
      'Training Tournaments Put A Field Of Players Through The Same Hands In The Same Order And Rank Them On Decision Quality Against The Solver, Not On Chips Won. That Removes The Variance A Real Tournament Adds, So The Standing At The End Is A Measure Of How Well People Played Rather Than How The Cards Fell. Free To Enter, And Nothing In It Is A Wager.',
    links: [
      { name: 'GTO Training', href: '/hub/training', text: 'The Drill Library These Events Are Drawn From.' },
      { name: 'Training Leaderboard', href: '/hub/training/leaderboard', text: 'Standings Across Every Event And Drill.' },
      { name: 'Poker Arena', href: '/hub/club-arena', text: 'Play The Real Thing In A Private Club.' },
    ],
  },
  'training-jarvis': {
    heading: 'About Jarvis',
    lead:
      'Jarvis Is The Coaching Layer Over Smarter Poker Training: It Reads The Hand In Front Of You, Compares Your Line To The Solver Baseline, And Explains The Difference In Words Rather Than In A Frequency Table. Ask It Why A Fold Was Wrong, What Range It Assumed, Or What Changes If The Stack Is Shorter, And It Answers Against That Hand. Free To Use While Training.',
    links: [
      { name: 'GTO Training', href: '/hub/training', text: 'The Drills Jarvis Coaches You Through.' },
      { name: 'Hand History Upload', href: '/hub/training/hand-history-upload', text: 'Upload A Hand From Anywhere And Have It Graded.' },
      { name: 'Poker Glossary', href: '/glossary', text: 'Every Term Jarvis Uses, Defined.' },
    ],
  },
  'training-hand-history-upload': {
    heading: 'About Hand History Upload',
    lead:
      'Hand History Upload Takes A Hand You Already Played Somewhere Else And Scores It Here. Paste Or Drop A History From PokerStars, GGPoker, ACR Or 888, Replay It Street By Street With The Ranges Shown, And See Where Your Line Left Value. A Grade And An EV Figure Appear Only When The Server Can Match The Exact Node, So A Hand It Cannot Match Is Shown Without A Score Rather Than With A Guess. Free To Use.',
    links: [
      { name: 'GTO Training', href: '/hub/training', text: 'Drill The Spots Your Uploads Keep Exposing.' },
      { name: 'Jarvis', href: '/hub/training/jarvis', text: 'Ask Why A Line Was Wrong, In Words.' },
      { name: 'Poker Glossary', href: '/glossary', text: 'Every Term A Hand Review Uses, Defined.' },
    ],
  },
  'training-solutions': {
    heading: 'About Solutions',
    lead:
      'Solutions Is The Library Of Solver Baselines Every Drill Is Scored Against: Opening, Three Betting And Defending Ranges By Position And Stack Depth, With The Frequencies And The Reasoning Behind Them. Browse A Spot Directly Rather Than Waiting For A Drill To Show It To You, And Compare What The Solver Does With What You Have Been Doing. Free To Read.',
    links: [
      { name: 'GTO Training', href: '/hub/training', text: 'The Drills That Use These Baselines.' },
      { name: 'Preflop Range Lab', href: '/hub/preflop-charts', text: 'Practise The Preflop Ranges Directly.' },
      { name: 'Poker Glossary', href: '/glossary', text: 'Range Advantage, Squeeze, Polarised And 71 More.' },
    ],
  },
  // Wave 3 (2026-10-31): Personal Assistant Suite, PWA Install & 36 Public Training Tools
  'personal-assistant': {
    heading: 'About Personal Poker Assistant And Jarvis AI',
    lead:
      'Personal Poker Assistant Is The Central Command Center For Jarvis Coaching, Deterministic Leak Detection, And Evidence-Backed Training Reviews On Smarter Poker. Review Recent Session History, Inspect Active Statistical Leaks Across Preflop And Postflop Streets, And Launch Signed Training Drills That Target Your Highest-Cost Expected Value Mistakes Without Leaving The Browser. Free To Open And Explore.',
    links: [
      { name: 'Leak Finder', href: '/hub/personal-assistant/leaks', text: 'Run Deterministic Post-Session Audits To Find Repeated EV Leaks.' },
      { name: 'Virtual Sandbox', href: '/hub/personal-assistant/sandbox', text: 'Explore Poker Scenarios And Runout Equity Inside Your Assistant.' },
      { name: 'Review My Play', href: '/hub/personal-assistant/review', text: 'Inspect Saved Club Arena And Logged Hands With Private Notes.' },
      { name: 'AI Coach Feature Guide', href: '/features/poker-ai-coach', text: 'How Jarvis And Leak Finder Work Together Across Smarter Poker.' },
    ],
  },
  'personal-assistant-leaks': {
    heading: 'About Leak Finder Post-Session Audit',
    lead:
      'Leak Finder Audits Your Recorded Poker Hands And Training Decisions To Surface Repeated, Statistically Significant Expected Value Leaks By Position, Street, And Action Line. Instead Of Flagging Isolated Single-Hand Variance, The Engine Groups Recurring Situations, Ranks Each Leak By Big Blind Bleed Rate, And Schedules Spaced-Repetition Corrective Drills Until The Mistake Is Resolved. Post-Session Review Only.',
    links: [
      { name: 'Personal Assistant', href: '/hub/personal-assistant', text: 'Return To The Jarvis Strategy Hub And Priority Queue.' },
      { name: 'Weakness Scanner', href: '/hub/training/weakness-scanner', text: 'Inspect Position And Street Accuracy Across Training Drills.' },
      { name: 'Hand History Upload', href: '/hub/training/hand-history-upload', text: 'Upload Hands From Major Sites For Street-By-Street Grading.' },
    ],
  },
  'personal-assistant-sandbox': {
    heading: 'About Scenario Analysis Evidence Gate',
    lead:
      'The Scenario Analysis Evidence Gate Explains Why Smarter Poker Retired Approximate Heuristic Hand Grading In Favor Of Provably Verified Solver Baselines. Every Graded Decision On The Platform Requires An Exact Node Match From A Signed Training Attempt Or Audited Spot Archive, Ensuring No Player Receives A Guessed Frequency Or Approximate Expected Value Score. Free To Read.',
    links: [
      { name: 'GTO Training', href: '/hub/training', text: 'Start A Signed Training Attempt With Verified Solver Grading.' },
      { name: 'Solver Spot Study', href: '/hub/training/spot-trainer', text: 'Inspect Answer-Revealed Solver Nodes In An Ungraded Study Mode.' },
      { name: 'Verification Methodology', href: '/verification-methodology', text: 'How Smarter Poker Audits Solver Baselines And Venue Records.' },
    ],
  },
  install: {
    heading: 'About Installing Smarter Poker On iPad, iPhone And Android',
    lead:
      'Install Smarter Poker Directly To Your iPad, iPhone, Or Android Home Screen As A Full-Screen Progressive Web Application Without Visiting An App Store Or Paying Any Download Fee. The Installed App Launches Instantly Without Browser Toolbars, Enables Real-Time Push Notifications For Club Commander Waitlists And Tournament Clocks, And Caches Core Training Tools For Offline Access.',
    links: [
      { name: 'World Hub', href: '/hub', text: 'Open The Main Smarter Poker World Hub Dashboard.' },
      { name: 'Poker Near Me', href: '/hub/poker-near-me/lobby', text: 'Find Live Poker Rooms, Series And Waitlists Near Your Location.' },
      { name: 'Offline GTO Preloader', href: '/hub/training/gto-preloader', text: 'Cache GTO Training Scenarios For Airplane And Offline Study.' },
    ],
  },
  'training-autopilot': {
    heading: 'About Weak Spot Autopilot Trainer',
    lead:
      'Weak Spot Autopilot Automatically Selects Poker Training Hands From The Positions, Streets, And Scenario Categories Where Your Historical Accuracy Trails The Solver Baseline Most. Instead Of Picking Drills Manually, Toggle Autopilot To Stream Continuous Corrective Hands With Instant Expected Value Feedback And Adaptive Difficulty Scaling Until Your Weakest Spots Match Equilibrium Frequencies. Free To Practice.',
    links: [
      { name: 'Weakness Scanner', href: '/hub/training/weakness-scanner', text: 'See Which Positions And Streets Autopilot Prioritizes.' },
      { name: 'GTO Training', href: '/hub/training', text: 'Browse All 100+ Scenario Games In The Training Hub.' },
      { name: 'Leak Finder', href: '/hub/personal-assistant/leaks', text: 'Audit Multi-Session Hand Histories For Recurring EV Leaks.' },
    ],
  },
  'training-coach-mode': {
    heading: 'About Guided GTO Coach Mode',
    lead:
      'Guided GTO Coach Mode Combines Structured Poker Strategy Lessons With Interactive Check-For-Understanding Quizzes On C-Betting, Three-Bet Pots, River Bluff Catching, And Independent Chip Model Pressure. Each Module Walks Through The Strategic Principles Behind Solver Frequencies Before Testing Your Execution On Curated Table Spots With Immediate Coaching Explanations. Free To Study On Smarter Poker.',
    links: [
      { name: 'Strategy Concept Tutorial', href: '/hub/training/scenario-demo', text: 'Learn How Solver Baselines, Frequencies And EV Loss Work.' },
      { name: 'Poker Strategy Library', href: '/learn', text: 'Read Full Long-Form Guides On GTO And Exploitative Play.' },
      { name: 'Jarvis AI Coach', href: '/hub/training/jarvis', text: 'Ask Natural-Language Questions About Any Training Hand.' },
    ],
  },
  'training-community-leaderboard': {
    heading: 'About The GTO Training Community Leaderboard',
    lead:
      'The GTO Training Community Leaderboard Ranks Smarter Poker Players Across Daily, Weekly, Monthly, And All-Time Windows By Solver Decision Accuracy, Hands Completed, And Streak Consistency. Every Entry Displays The Underlying Hand Sample Alongside The Accuracy Rating So Volume Grinders And High-Precision Specialists Can Benchmark Their Progress Fairly. Free To Compete And Free To View.',
    links: [
      { name: 'Training Leaderboard', href: '/hub/training/leaderboard', text: 'Compare Pure Solver Decision Accuracy Across All Drills.' },
      { name: 'Community Training Feed', href: '/hub/training/training-feed', text: 'See Live Milestones, Streaks And High Scores From The Community.' },
      { name: 'Daily Challenge', href: '/hub/training/daily-challenge', text: 'Play Today Featured Spot To Climb The Daily Standings.' },
    ],
  },
  'training-custom-rake': {
    heading: 'About The Poker Rake Cost Estimator',
    lead:
      'The Poker Rake Cost Estimator Calculates How Pot Percentage Rake, Maximum Dollar Caps, And No-Flop-No-Drop Rules Impact Your Hourly Win Rate And Big-Blind-Per-Hundred-Hands Bottom Line Across Cash Game Stakes. Compare Live Card Room Structures Against Online Poker Formats To See Which Games Remain Beatable And How Tighter Preflop Selection Offsets High Drop. Free Calculator.',
    links: [
      { name: 'Rake Sensitivity Explorer', href: '/hub/training/rake-solutions', text: 'See How Preflop Opening And Defending Ranges Shift Under High Rake.' },
      { name: 'Bankroll Manager', href: '/hub/bankroll-manager', text: 'Track Real Session Results, Expenses And Hourly Win Rates.' },
      { name: 'Preflop Range Charts', href: '/hub/training/preflop-charts', text: 'Compare 6-Max Opening And Defense Matrices By Position.' },
    ],
  },
  'training-custom-solve': {
    heading: 'About Custom GTO Spot And Preflop Query',
    lead:
      'Custom GTO Spot And Preflop Query Lets You Configure Exact Table Parameters Including Game Format, Effective Stack Depth From Ten To Two Hundred Big Blinds, Hero Position, And Preflop Action Line To Inspect Matching Solver Reference Ranges. Instead Of Guessing How Stack Depth Alters Three-Bet Or Jamming Thresholds, Query The Audited Matrix Directly. Free Reference Tool.',
    links: [
      { name: 'Solutions Library', href: '/hub/training/solutions', text: 'Browse The Full Collection Of Audited Solver Baselines.' },
      { name: 'Hand Lab Analyzer', href: '/hub/training/hand-lab', text: 'Break Down Specific Hole Cards And Flop Textures Street By Street.' },
      { name: 'Preflop Charts Matrix', href: '/tools/preflop-ranges', text: 'Interactive Public 13x13 Preflop Range Viewer.' },
    ],
  },
  'training-daily-challenge': {
    heading: 'About The Daily Poker Hand Of The Day Challenge',
    lead:
      'The Daily Poker Hand Of The Day Challenge Presents One High-Leverage Cash Game Or Tournament Spot Every Twenty-Four Hours For The Entire Smarter Poker Community To Solve. Submit Your Action Before The Reveal To Earn Accuracy Points, Compare Your Choice Against The Exact Solver Frequency Distribution, And Extend Your Consecutive Daily Training Streak. Free Daily Entry.',
    links: [
      { name: 'Daily Challenges Hub', href: '/hub/training/challenges', text: 'Complete Personalized Multi-Hand Daily Challenge Sets.' },
      { name: 'Community Leaderboard', href: '/hub/training/community-leaderboard', text: 'See How Your Daily Streak Ranks Against Other Players.' },
      { name: 'GTO Training', href: '/hub/training', text: 'Continue Practicing In Over 100 Full Scenario Games.' },
    ],
  },
  'training-drill-builder': {
    heading: 'About The Custom Poker Drill Builder',
    lead:
      'The Custom Poker Drill Builder Lets You Assemble Targeted Practice Sessions By Filtering For Exact Hero Positions, Street Focus From Preflop Through River, Stack Depth Tiers, Pot Types, And Question Counts. Save Custom Drill Templates For Pre-Session Warmups Or Intense Leak Remediation So Every Practice Hand Matches The Exact Situations You Play Most. Free To Build.',
    links: [
      { name: 'Quiz Builder', href: '/hub/training/quiz-builder', text: 'Create Shareable Multi-Question GTO Strategy Quizzes.' },
      { name: 'Range Builder', href: '/hub/training/range-builder', text: 'Construct And Drill Your Own 13x13 Preflop Hand Matrices.' },
      { name: 'Weak Spot Autopilot', href: '/hub/training/autopilot', text: 'Let The Engine Automatically Queue Your Lowest-Accuracy Spots.' },
    ],
  },
  'training-famous-finals': {
    heading: 'About The Famous Finals Training Archive',
    lead:
      'The Famous Finals Training Archive Catalogs Historic Championship Final Table Concepts And High-Pressure Tournament Situations Alongside Their Modern Independent Chip Model And Game Theory Optimal Counterparts. Review How Pay Jumps, Chip Leader Leverage, And Short-Stack Survival Reshape Optimal Ranges At Major Final Tables, Then Practice The Equivalent Audited Training Scenarios Directly. Free Archive.',
    links: [
      { name: 'Final Table Simulator', href: '/hub/training/final-table-sim', text: 'Practice ICM Decisions Across 9-Handed To Heads-Up Final Tables.' },
      { name: 'ICM Simulator', href: '/hub/training/icm-simulator', text: 'Model Tournament Prize Pool Equity And Bubble Factors.' },
      { name: 'Poker Tours Directory', href: '/hub/poker-tours', text: 'Follow Current WSOP, WPT And Regional Championship Stops.' },
    ],
  },
  'training-final-table-sim': {
    heading: 'About The Final Table ICM And Deal Simulator',
    lead:
      'The Final Table ICM And Deal Simulator Models Multi-Way Tournament Prize Pool Equity, Bubble Factors, And Even-Chop Versus ICM-Chop Payout Numbers From Nine Players Down To Heads-Up. Adjust Payout Structures, Stack Distributions, And Risk Premiums To See How Pay Jumps Constrain Calling Ranges And When A Final Table Deal Increases Guaranteed Expected Value. Free Simulator.',
    links: [
      { name: 'ICM Calculator', href: '/tools/icm-calculator', text: 'Compute Instant Malmuth-Harville Tournament Equity Shares.' },
      { name: 'Tournament ICM Simulator', href: '/hub/training/icm-simulator', text: 'Run Interactive Push-Fold And Pay-Jump Training Scenarios.' },
      { name: 'Famous Finals Archive', href: '/hub/training/famous-finals', text: 'Study Historic Championship Final Table Situations.' },
    ],
  },
  'training-flashcards': {
    heading: 'About Spaced-Repetition GTO Poker Flashcards',
    lead:
      'Spaced-Repetition GTO Poker Flashcards Apply The SuperMemo SM-2 Memory Scheduling Algorithm To Preflop Opening Frequencies, Three-Bet Defense Thresholds, Pot Odds Math, And Postflop Heuristic Rules. Rate Your Recall Confidence On Each Card So Challenging Concepts Reappear Frequently While Mastered Ranges Schedule Further Out For Long-Term Retention At The Table. Free Study Tool.',
    links: [
      { name: 'Quick Warmup', href: '/hub/training/quick-warmup', text: 'Run A Five-Minute Speed Drill Before Sitting Down To Play.' },
      { name: 'Preflop Reference Charts', href: '/hub/training/preflop-charts', text: 'Review The 6-Max 100BB Ranges Behind The Flashcards.' },
      { name: 'Poker Glossary', href: '/glossary', text: 'Definitions For Every Mathematical And GTO Term On The Cards.' },
    ],
  },
  'training-focus-timer': {
    heading: 'About The Poker Session Pomodoro Focus Timer',
    lead:
      'The Poker Session Pomodoro Focus Timer Structures Your Study Blocks And Live Grinding Sessions Into Timed High-Concentration Intervals Paired With Scheduled Mental Reset Breaks. Track Completed Study Pomodoros, Prevent Decision Fatigue During Long Multi-Table Sessions, And Pair Timed Intervals With Pre-Session Warmups And Tilt Guard Check-Ins To Protect Your A-Game. Free Utility.',
    links: [
      { name: 'Session Warmup Protocol', href: '/hub/training/session-warmup', text: 'Complete A Six-Step Mental Readiness Check Before Playing.' },
      { name: 'Tilt Guard Coach', href: '/hub/training/tilt-guard', text: 'Monitor Emotional Baseline And Trigger Cooldown Protocols.' },
      { name: 'Quick Warmup Drill', href: '/hub/training/quick-warmup', text: 'Calibrate Decision Speed In Five Minutes Before Your Timer Starts.' },
    ],
  },
  'training-gto-news': {
    heading: 'About GTO Strategy Tips And Training Articles',
    lead:
      'GTO Strategy Tips And Training Articles Delivers Bite-Sized Analytical Breakdowns On Range Advantage, Minimum Defense Frequency, Blocker Selection, ICM Bubble Adjustments, And Multi-Street Barrel Sizing. Each Digest Connects Directly To Interactive Smarter Poker Drills And Calculators So You Can Immediately Test New Theoretical Concepts Against Audited Solver Baselines. Free To Read.',
    links: [
      { name: 'Poker Strategy Library', href: '/learn', text: 'Deep-Dive Syllabus Lessons On Preflop, Postflop And ICM.' },
      { name: 'Original Poker Research', href: '/research', text: 'First-Party Data Studies And Benchmark Reports From Smarter Poker.' },
      { name: 'Poker News Feed', href: '/hub/news', text: 'Hourly Live Tournament Headlines And Industry Coverage.' },
    ],
  },
  'training-gto-preloader': {
    heading: 'About The Offline GTO Training Pack Preloader',
    lead:
      'The Offline GTO Training Pack Preloader Lets You Download And Cache Solved Scenario Packs, Preflop Range Matrices, And Flashcard Decks Directly Into Browser Storage Before Travelling Or Entering A Casino With Poor Reception. Verify Cached Storage Footprints And Practice Uninterrupted In Airplane Mode With Full Instant Grading. Free Offline Utility.',
    links: [
      { name: 'Install Smarter Poker App', href: '/hub/install', text: 'Add Smarter Poker To Your Home Screen For Full Offline Support.' },
      { name: 'GTO Flashcards', href: '/hub/training/flashcards', text: 'Review Spaced-Repetition Strategy Decks Anywhere Offline.' },
      { name: 'GTO Training Hub', href: '/hub/training', text: 'Launch Cached Scenario Games And Drills.' },
    ],
  },
  'training-hand-comparison': {
    heading: 'About The A/B Poker Hand Equity Comparison Tool',
    lead:
      'The A/B Poker Hand Equity Comparison Tool Evaluates Two Starting Hands Or Postflop Combos Side By Side Across Specific Board Textures, Measuring Raw Showdown Equity, Nut Advantage, Playability, And Postflop Realization Factors. Use It To Understand Why Suited Connectors And Ace-Wheel Blockers Outperform Dominated Offsuit Broadways In Deep-Stacked Pots. Free Analytical Tool.',
    links: [
      { name: 'Poker Odds Calculator', href: '/tools/poker-odds-calculator', text: 'Run Exact Multi-Hand Monte Carlo And Enumerated Equity Checks.' },
      { name: 'Starting Hands Encyclopedia', href: '/learn/hands', text: 'Complete Strategic Profiles For All 169 Texas Holdem Starting Hands.' },
      { name: 'Hand Lab Analyzer', href: '/hub/training/hand-lab', text: 'Inspect Street-By-Street Board Texture And Range Interactions.' },
    ],
  },
  'training-hand-lab': {
    heading: 'About The Interactive Poker Hand Lab And Board Analyzer',
    lead:
      'The Interactive Poker Hand Lab And Board Analyzer Breaks Down How Preflop Ranges Interact With Specific Flop, Turn, And River Runouts. Inspect Texture Classifications, Draw Density, Range Equity Splits, And Positional Nut Advantage So You Can Construct Balanced Continuation-Betting, Check-Raising, And Barrel Plans Grounded In Combinatorics. Free Strategy Lab.',
    links: [
      { name: 'Hand Comparison Tool', href: '/hub/training/hand-comparison', text: 'Compare Two Exact Starting Hands Across Different Boards.' },
      { name: 'Custom Solve Query', href: '/hub/training/custom-solve', text: 'Look Up Audited Solver Reference Ranges By Position And Stack.' },
      { name: 'Hand History Upload', href: '/hub/training/hand-history-upload', text: 'Upload Played Hands For Automated Street-By-Street Review.' },
    ],
  },
  'training-icm-simulator': {
    heading: 'About The Tournament ICM Equity Simulator',
    lead:
      'The Tournament ICM Equity Simulator Computes Exact Malmuth-Harville Prize Pool Equity, Risk Premiums, And Push-Fold Thresholds Across Money Bubbles, Final Table Pay Jumps, And Satellite Qualifiers. Compare Chip Expected Value Against Dollar Expected Value To See Why Survival Pressure Forces Tighter Calling Ranges Against Covering Stacks. Free Tournament Tool.',
    links: [
      { name: 'Public ICM Calculator', href: '/tools/icm-calculator', text: 'Calculate Instant Multi-Stack Tournament Payout Equities.' },
      { name: 'Final Table Simulator', href: '/hub/training/final-table-sim', text: 'Model 9-Max Final Table Pay Jumps And Chop Negotiations.' },
      { name: 'Tournament Prep Planner', href: '/hub/training/tournament-prep', text: 'Plan Blind Level Pacing, M-Ratios And Stack Targets.' },
    ],
  },
  'training-multi-table': {
    heading: 'About The Multi-Table GTO Practice Simulator',
    lead:
      'The Multi-Table GTO Practice Simulator Trains Your Visual Scanning Speed And Decision Accuracy Across Two To Four Simultaneous Poker Tables Running On Independent Action Clocks. Build The Cognitive Stamina Required For Online Grinding Or Fast-Paced Live Events Without Sacrificing Solver Precision Under Time Bank Pressure. Free Multi-Table Trainer.',
    links: [
      { name: 'Quick Warmup', href: '/hub/training/quick-warmup', text: 'Start With Single-Table High-Speed Decision Calibration.' },
      { name: 'Focus Timer', href: '/hub/training/focus-timer', text: 'Structure Multi-Table Grinding Into Timed Pomodoro Blocks.' },
      { name: 'GTO Training Hub', href: '/hub/training', text: 'Return To Single-Table Scenario Games And Deep Study.' },
    ],
  },
  'training-multiway-preflop': {
    heading: 'About The Multiway 3+ Player Preflop Range Viewer',
    lead:
      'The Multiway 3+ Player Preflop Range Viewer Illustrates How Optimal Cold-Calling, Squeezing, And Over-Calling Ranges Contract When Multiple Players Enter The Pot Before The Flop. Compare Heads-Up Single-Raised Pot Baselines Against Three-Way And Four-Way Configurations To Avoid Dominated Offsuit Traps And Multiway Reverse Implied Odds Mistakes. Free Reference Viewer.',
    links: [
      { name: 'Preflop Reference Charts', href: '/hub/training/preflop-charts', text: 'Compare Standard 6-Max 100BB Opening And 3-Bet Ranges.' },
      { name: 'Public Preflop Range Matrix', href: '/tools/preflop-ranges', text: 'Explore 13x13 Positional Charts Across Stack Depths.' },
      { name: 'Rake Sensitivity Explorer', href: '/hub/training/rake-solutions', text: 'See How Pot Rake Further Tightens Cold-Calling Ranges.' },
    ],
  },
  'training-position-mastery': {
    heading: 'About The Poker Table Position Mastery Heatmap',
    lead:
      'The Poker Table Position Mastery Heatmap Tracks Your Cumulative Solver Accuracy, Expected Value Retention, And Hand Volume Across All Six Seats From Under The Gun Through The Big Blind. Identify Whether Your Biggest Win-Rate Leaks Originate In Blind Defense, Small Blind Three-Bet Pots, Or Late-Position Button Steals, And Launch Seat-Specific Drills Instantly. Free Diagnostic Tool.',
    links: [
      { name: 'Weakness Scanner', href: '/hub/training/weakness-scanner', text: 'Scan Street-By-Street And Action-Line Accuracy Breakdowns.' },
      { name: 'Preflop Reference Charts', href: '/hub/training/preflop-charts', text: 'Review Exact Opening Frequencies For Every Seat At The Table.' },
      { name: 'Weak Spot Autopilot', href: '/hub/training/autopilot', text: 'Automatically Drill Your Lowest-Scoring Table Positions.' },
    ],
  },
  'training-preflop-charts': {
    heading: 'About The 6-Max 100BB Preflop Range Browser',
    lead:
      'The 6-Max 100BB Preflop Range Browser Displays Interactive 13x13 Starting Hand Matrices For Raise-First-In, Facing Open, Three-Bet, And Four-Bet Scenarios Across All Six Table Positions. Use Side-By-Side Comparison Mode To Contrast Early-Position Tightness With Cutoff And Button Expansion, Complete With Exact Combo Counts And Percentage Summaries. Free Reference Tool.',
    links: [
      { name: 'Preflop Range Lab', href: '/hub/preflop-charts', text: 'Test Your Range Memory In Interactive Preflop Drills.' },
      { name: 'Multiway Preflop Viewer', href: '/hub/training/multiway-preflop', text: 'See How Ranges Adjust In Three-Way And Squeeze Pots.' },
      { name: 'Range Builder', href: '/hub/training/range-builder', text: 'Paint And Practice Your Own Custom 13x13 Hand Matrices.' },
    ],
  },
  'training-qre-explorer': {
    heading: 'About The Quantal Response Equilibrium Explorer',
    lead:
      'The Quantal Response Equilibrium Explorer Models How Bounded Rationality And Softmax Noise Parameter Lambda Transform Sharp Nash Equilibrium Mixed Strategies Into Smooth Probability Distributions. Adjust Decision Precision And Payoff Sensitivity To Understand Why Human Opponents Deviate On Close-EV Indifference Nodes And How Modern Solvers Model Imperfect Execution. Free Game Theory Tool.',
    links: [
      { name: 'Strategy Concept Tutorial', href: '/hub/training/scenario-demo', text: 'Foundational Guide To Nash Equilibrium And EV Loss.' },
      { name: 'Original Poker Research', href: '/research', text: 'Read First-Party Studies On Solver Benchmarks And Strategy.' },
      { name: 'Poker Glossary', href: '/glossary', text: 'Look Up Equilibrium, Indifference, Exploitability And More.' },
    ],
  },
  'training-quick-warmup': {
    heading: 'About The 5-Minute Pre-Session Poker Speed Warmup',
    lead:
      'The 5-Minute Pre-Session Poker Speed Warmup Runs A Fast Ten-Hand Calibration Sprint Covering Preflop Range Boundaries, Pot Odds Thresholds, And Standard Continuation-Betting Spots Before You Sit Down At A Real Table. Shake Off Rust, Measure Your Reaction Speed And Baseline Accuracy, And Catch Mental Fatigue Before Putting Your Bankroll In Play. Free Warmup Drill.',
    links: [
      { name: 'Session Warmup Protocol', href: '/hub/training/session-warmup', text: 'Pair Speed Drills With The Six-Step Mental Readiness Checklist.' },
      { name: 'GTO Flashcards', href: '/hub/training/flashcards', text: 'Review Key Frequencies With Spaced-Repetition Cards.' },
      { name: 'Daily Challenge', href: '/hub/training/daily-challenge', text: 'Solve Today Featured Community Hand After Warming Up.' },
    ],
  },
  'training-quiz-builder': {
    heading: 'About The Custom GTO Poker Quiz Builder',
    lead:
      'The Custom GTO Poker Quiz Builder Allows Coaches, Study Group Leaders, And Serious Players To Author Multi-Question Strategy Quizzes With Custom Board Textures, Stack Sizes, Action Options, And Detailed Solver Explanations. Share Quiz Packs With Study Partners Or Run Self-Graded Assessments To Verify Mastery Of Specific Tournament Or Cash Game Concepts. Free Authoring Tool.',
    links: [
      { name: 'Custom Drill Builder', href: '/hub/training/drill-builder', text: 'Assemble Filtered Practice Sets From Existing Solver Spots.' },
      { name: 'Study Group Finder', href: '/hub/training/study-group-finder', text: 'Connect With Poker Study Partners To Share Custom Quizzes.' },
      { name: 'Poker Trivia Hub', href: '/hub/trivia', text: 'Play Server-Scored Competitive Poker Knowledge Challenges.' },
    ],
  },
  'training-rake-solutions': {
    heading: 'About The Poker Rake Sensitivity Curve Explorer',
    lead:
      'The Poker Rake Sensitivity Curve Explorer Visualizes How Preflop Opening Frequencies, Cold-Calling Shares, And Three-Bet Ratios Shift Across Zero-Rake Tournament Environments, Low-Rake High Stakes, And High-Rake Micro Or Live Games. Inspect Why High Pot Drop Eliminates Marginal Flat Calls And Pushes Profitable Pre-Flop Strategy Toward Three-Bet-Or-Fold Constructions. Free Model Explorer.',
    links: [
      { name: 'Rake Cost Estimator', href: '/hub/training/custom-rake', text: 'Calculate Hourly And BB/100 Rake Costs For Your Exact Stake.' },
      { name: 'Preflop Reference Charts', href: '/hub/training/preflop-charts', text: 'Browse Baseline 6-Max 100BB Opening And Defense Charts.' },
      { name: 'Multiway Preflop Viewer', href: '/hub/training/multiway-preflop', text: 'See How Multiway Pots And Squeezes Interact With Rake.' },
    ],
  },
  'training-range-builder': {
    heading: 'About The Interactive 13x13 Preflop Range Builder',
    lead:
      'The Interactive 13x13 Preflop Range Builder Lets You Paint Raise, Call, Three-Bet, And Fold Frequencies Across Every Starting Hand Combination, Calculate Exact Combo Proportions, And Test Your Memory In Self-Graded Reconstruction Drills. Build Custom Exploitative Or Home-Game Ranges And Practice Reproducing Them From Blank Grids Until Recall Is Automatic. Free Range Tool.',
    links: [
      { name: 'Preflop Reference Charts', href: '/hub/training/preflop-charts', text: 'Compare Your Custom Grid Against Baseline 6-Max Charts.' },
      { name: 'Starting Hands Guide', href: '/learn/hands', text: 'Read Detailed Strategy Profiles For All 169 Starting Hands.' },
      { name: 'Custom Drill Builder', href: '/hub/training/drill-builder', text: 'Create Postflop Practice Sets Around Your Target Positions.' },
    ],
  },
  'training-risk-analyzer': {
    heading: 'About The Poker Risk Of Ruin And Variance Simulator',
    lead:
      'The Poker Risk Of Ruin And Variance Simulator Runs Thousands Of Monte Carlo Bankroll Trajectories Using Your True Win Rate In Big Blinds Per Hundred Hands, Format Standard Deviation, And Total Buy-In Cushion. Visualize Confidence Intervals, Downswing Probability Tables, And Required Bankroll Multipliers For Cash Games, Spin-And-Gos, And Large-Field Tournaments. Free Quantitative Calculator.',
    links: [
      { name: 'Bankroll Manager', href: '/hub/bankroll-manager', text: 'Track Real Session Ledger Results, Buy-Ins And Net Profit.' },
      { name: 'Rake Cost Estimator', href: '/hub/training/custom-rake', text: 'Measure How Rake Changes Your Net Win Rate Input.' },
      { name: 'Bankroll Tax Tracker Guide', href: '/features/bankroll-tax-tracker', text: 'Learn How Smarter Poker Tracks Bankroll Health And Sessions.' },
    ],
  },
  'training-scenario-demo': {
    heading: 'About The Interactive GTO Strategy And Solver Tutorial',
    lead:
      'The Interactive GTO Strategy And Solver Tutorial Teaches New And Intermediate Players How Game Theory Optimal Solvers Compute Mixed Frequencies, Expected Value Loss In Big Blinds, Range Advantage, And Minimum Defense Thresholds. Walk Through Guided Interactive Examples Before Entering Timed Drills So Every Chart And Feedback Metric Makes Immediate Strategic Sense. Free Onboarding Guide.',
    links: [
      { name: 'Guided Coach Mode', href: '/hub/training/coach-mode', text: 'Continue With Structured Lessons And Check-For-Understanding Quizzes.' },
      { name: 'Solver Spot Study', href: '/hub/training/spot-trainer', text: 'Explore Answer-Revealed Solver Nodes At Your Own Pace.' },
      { name: 'Poker Glossary', href: '/glossary', text: 'Look Up Every Solver And Strategy Term Defined In Plain English.' },
    ],
  },
  'training-session-warmup': {
    heading: 'About The 6-Step Pre-Session Poker Mental Readiness Protocol',
    lead:
      'The 6-Step Pre-Session Poker Mental Readiness Protocol Walks Players Through Physical Alertness Checks, Emotional Tilt Screening, Stop-Loss Commitment, Bankroll Verification, And Strategic Focus Goal-Setting Before Sitting Down At A Live Or Online Table. Completing The Protocol Generates A Readiness Score So You Never Start A Session Tired, Distracted, Or Chasing Losses. Free Mental Game Tool.',
    links: [
      { name: 'Tilt Guard Coach', href: '/hub/training/tilt-guard', text: 'Monitor Mid-Session Emotional Triggers And Cooldown Exercises.' },
      { name: '5-Minute Quick Warmup', href: '/hub/training/quick-warmup', text: 'Run A Ten-Hand Tactical Speed Drill After Your Mental Check.' },
      { name: 'Focus Timer', href: '/hub/training/focus-timer', text: 'Lock In Timed High-Concentration Grinding Intervals.' },
    ],
  },
  'training-short-deck-trainer': {
    heading: 'About The Short Deck 6+ Holdem Rules And Equity Trainer',
    lead:
      'The Short Deck 6+ Holdem Rules And Equity Trainer Covers The 36-Card Deck Format Where Twos Through Fives Are Removed, Flushes Outrank Full Houses, And Ace-Six-Seven-Eight-Nine Completes The Wheel Straight. Master The Shifted Draw Probabilities, Rule-Of-Three-And-Six Equity Multipliers, And Deep Ante-Only Preflop Jamming Ranges Unique To Six-Plus Holdem. Free Variant Trainer.',
    links: [
      { name: 'Poker Odds Calculator', href: '/tools/poker-odds-calculator', text: 'Compare Standard Holdem And Omaha Hand Equities.' },
      { name: 'Hand Comparison Tool', href: '/hub/training/hand-comparison', text: 'Evaluate Starting Hand Playability And Nut Potential.' },
      { name: 'GTO Training Hub', href: '/hub/training', text: 'Explore All Cash Game, Tournament And Variant Training Modes.' },
    ],
  },
  'training-skill-tree': {
    heading: 'About The Interactive Poker Skill Tree Progression Map',
    lead:
      'The Interactive Poker Skill Tree Progression Map Organizes Poker Mastery Into Connected Competency Branches Spanning Preflop Foundations, Continuation Betting, Three-Bet Pots, Turn Barrel Geometry, River Bluff Catching, And Tournament ICM. Track Which Nodes You Have Unlocked Through Verified Training Accuracy And Follow A Clear Prerequisite Roadmap From Beginner To Elite Solver Execution. Free Curriculum Map.',
    links: [
      { name: 'Guided Coach Mode', href: '/hub/training/coach-mode', text: 'Take Interactive Lessons Matched To Each Skill Tree Branch.' },
      { name: 'Poker Strategy Syllabus', href: '/learn', text: 'Read The Complete Written Curriculum Behind Every Node.' },
      { name: 'Position Mastery Heatmap', href: '/hub/training/position-mastery', text: 'Check Your Seat-By-Seat Accuracy Across The Table.' },
    ],
  },
  'training-spot-trainer': {
    heading: 'About The Answer-Revealed Solver Spot Study Utility',
    lead:
      'The Answer-Revealed Solver Spot Study Utility Lets You Inspect Audited Solver Scenarios With Full Action Frequencies, Expected Value Breakdowns, And Strategic Explanations Visible Up Front. Designed For Open-Book Study Rather Than Timed Grading, It Allows Players To Step Through Complex Preflop And Postflop Decision Trees Without Affecting Their Ranked Accuracy Score. Free Study Mode.',
    links: [
      { name: 'Solutions Library', href: '/hub/training/solutions', text: 'Browse The Master Index Of Solver Baselines And Ranges.' },
      { name: 'Scenario Evidence Gate', href: '/hub/personal-assistant/sandbox', text: 'Learn How Smarter Poker Separates Open Study From Graded Attempts.' },
      { name: 'GTO Training Hub', href: '/hub/training', text: 'Switch To Signed, Server-Graded Training Scenarios.' },
    ],
  },
  'training-study-group-finder': {
    heading: 'About The Poker Study Group Finder And Directory',
    lead:
      'The Poker Study Group Finder Connects Players Who Grind Similar Stakes, Formats, And Time Zones So They Can Review Hand Histories Together, Exchange Custom Quiz Packs, And Hold Weekly Accountability Sessions. Browse Public Study Groups For Cash Games, Multi-Table Tournaments, And Pot-Limit Omaha, Or Launch Your Own Focused Cohort On Smarter Poker. Free Community Directory.',
    links: [
      { name: 'Community Training Feed', href: '/hub/training/training-feed', text: 'See Active Players Completing Drills And Streaks Today.' },
      { name: 'Custom Quiz Builder', href: '/hub/training/quiz-builder', text: 'Build Strategy Quizzes To Test Your Study Group.' },
      { name: 'Poker Social Hub', href: '/hub/social-media', text: 'Discuss Hands And Strategy With The Wider Community.' },
    ],
  },
  'training-tilt-guard': {
    heading: 'About The Poker Tilt Guard And Emotional Intelligence Coach',
    lead:
      'The Poker Tilt Guard And Emotional Intelligence Coach Helps Players Recognize Early Behavioral Signals Of Revenge Tilt, Entitlement Tilt, And Winner Complacency Before They Destroy A Session Bankroll. Log Real-Time Emotional Check-Ins, Run Guided Breathing And Cognitive Reframing Resets, And Enforce Automatic Stop-Loss Cooldown Rules When Variance Runs Cold. Free Mental Game Coach.',
    links: [
      { name: 'Session Warmup Protocol', href: '/hub/training/session-warmup', text: 'Establish Stop-Loss Rules And Readiness Before You Play.' },
      { name: 'Focus Timer', href: '/hub/training/focus-timer', text: 'Schedule Mandatory Breaks During Long Grinding Sessions.' },
      { name: 'Responsible Gaming', href: '/hub/commander/responsible-gaming', text: 'Platform Tools For Limits, Cooling-Off Periods And Self-Exclusion.' },
    ],
  },
  'training-tournament-prep': {
    heading: 'About The Tournament Structure And M-Ratio Prep Planner',
    lead:
      'The Tournament Structure And M-Ratio Prep Planner Analyzes Blind Level Duration, Starting Stack Depth In Big Blinds, Ante Formats, And Late-Registration Cutoffs To Classify Any Event From Hyper-Turbo To Deep-Stack Championship. Calculate Harrington M-Ratio Zones And Plan Your Stack Accumulation Milestones Before Paying Your Tournament Buy-In. Free Tournament Planner.',
    links: [
      { name: 'Tournament ICM Simulator', href: '/hub/training/icm-simulator', text: 'Practice Bubble And Pay-Jump Decisions For Your Next Event.' },
      { name: 'Events Calendar', href: '/hub/events-calendar', text: 'Find Upcoming Live Poker Series And Daily Tournaments.' },
      { name: 'Final Table Simulator', href: '/hub/training/final-table-sim', text: 'Model Final Table Payouts And Deal-Making Math.' },
    ],
  },
  'training-training-feed': {
    heading: 'About The Community Training Activity Feed',
    lead:
      'The Community Training Activity Feed Streams Verified Milestones, Perfect Drill Runs, Streak Achievements, And High-Accuracy Completions From Players Training Across Smarter Poker. Follow Top Performers, Discover Which Scenario Games The Community Is Grinding Most Today, And Jump Directly Into The Same Drill To Benchmark Your Own Solver Execution. Free Live Feed.',
    links: [
      { name: 'Community Leaderboard', href: '/hub/training/community-leaderboard', text: 'View Daily, Weekly And All-Time Training Standings.' },
      { name: 'Daily Hand Challenge', href: '/hub/training/daily-challenge', text: 'Play Today Featured Community Spot.' },
      { name: 'Study Group Finder', href: '/hub/training/study-group-finder', text: 'Join A Study Cohort With Active Grinders From The Feed.' },
    ],
  },
  'training-weakness-scanner': {
    heading: 'About The Automated Position And Street Leak Scanner',
    lead:
      'The Automated Position And Street Leak Scanner Aggregates Your Graded Training History To Pinpoint Where Your Decisions Lose The Most Expected Value Across Preflop, Flop, Turn, And River Nodes. Filter By Table Seat, Action Type, And Scenario Category To Uncover Systematic Blindspots, Then Launch Targeted Remediation Drills With One Click. Free Diagnostic Scanner.',
    links: [
      { name: 'Weak Spot Autopilot', href: '/hub/training/autopilot', text: 'Stream Continuous Drills Targeting Your Lowest-Rated Spots.' },
      { name: 'Position Mastery Heatmap', href: '/hub/training/position-mastery', text: 'Compare Your Accuracy Across All Six Table Positions.' },
      { name: 'Personal Assistant Leak Finder', href: '/hub/personal-assistant/leaks', text: 'Run Full Post-Session Hand Audits With Jarvis.' },
    ],
  },
  'tools-plo-outs-calculator': {
    heading: 'About The PLO Straight Wrap And Flush Redraw Outs Calculator',
    lead:
      'The PLO Straight Wrap And Flush Redraw Outs Calculator Computes Exact Hypergeometric Turn And River Completion Equities For Four-Card And Five-Card Omaha Wraps (9, 13, 16, 17, And 20 Outs), Separating Nut Straight Outs From Dominated Dirty Outs And Accounting For Single Or Double Flush Redraws Across Multiway Pots, With Pot-Odds Break-Even Calling Thresholds. Free Omaha Tool.',
    links: [
      { name: 'PLO Max Bet Calculator', href: '/tools/plo-bet-calculator', text: 'Compute Exact Dealer 3x Plus Trail Plus Pot Raises.' },
      { name: 'Holdem And PLO Odds Calculator', href: '/tools/poker-odds-calculator', text: 'Run Full Multiway Card-Vs-Card Omaha Simulations.' },
      { name: 'Poker Outs Calculator', href: '/tools/outs-calculator', text: 'Review Standard 1-To-21 Out Rule Of 4 And 2 Tables.' },
    ],
  },
  'tools-late-reg-calculator': {
    heading: 'About The Tournament Late-Registration ICM Equity Calculator',
    lead:
      'The Tournament Late-Registration ICM Equity Calculator Uses Malmuth-Harville Prize Pool Math To Measure How Much Tournament Chips Appreciate When Early Entrants Bust Out. Compare Entering At Level 1 Versus Late-Registering At 15BB To 30BB And See The Exact Dollar Value Gained And Break-Even Post-Entry ROI Threshold Required To Justify Skipping Early Levels. Free Tournament Tool.',
    links: [
      { name: 'Tournament ICM Calculator', href: '/tools/icm-calculator', text: 'Solve Final Table And Bubble Stack Dollar Equities.' },
      { name: 'Harrington M-Ratio Calculator', href: '/tools/m-ratio-calculator', text: 'Check Your Orbit Survival And Push-Fold Zone On Entry.' },
      { name: 'MTT Grind Session Planner', href: '/tools/mtt-grind-planner', text: 'Plan Full Tournament Schedules And ABI Exposure.' },
    ],
  },
  'tools-winrate-confidence-calculator': {
    heading: 'About The Poker Winrate Confidence Interval And Sample Size Calculator',
    lead:
      'The Poker Winrate Confidence Interval Calculator Computes Standard Error, 70%, 95%, And 99% Normal Confidence Bands In BB/100 Or Dollars Per Hour, Probability Of True Loss Over Any Sample Size, And The Exact Hand Or Hour Volume Required To Prove A Winning Edge At 95% Statistical Confidence In Live Or Online Cash Games. Free Quantitative Tool.',
    links: [
      { name: 'Poker Variance Simulator', href: '/tools/variance-calculator', text: 'Visualize Multi-Path Brownian Downswings And Confidence Cones.' },
      { name: 'Bankroll Risk Of Ruin Calculator', href: '/tools/bankroll-calculator', text: 'Convert Your Winrate And StdDev Into Buy-In Cushions.' },
      { name: 'Winrate And Hourly Calculator', href: '/tools/poker-winrate-calculator', text: 'Convert BB/100 Into Live And Online Hourly Income.' },
    ],
  },
  'tools-poker-trip-planner': {
    heading: 'About The Poker Festival And Vegas Trip Expense Overhead Calculator',
    lead:
      'The Poker Festival Trip Expense Planner Totals Airfare, Hotel Nights, Resort Fees, Dining, And Ground Transport To Compute Your Effective Travel Expense Rake As A Percentage Of Planned Tournament Or Cash Buy-Ins, Along With Your Net Trip Expected Value, Recommended Travel Bankroll Cushion, And Break-Even Series Target Before You Fly. Free Travel Tool.',
    links: [
      { name: 'Poker Series Schedule', href: '/hub/poker-series', text: 'Browse Upcoming WSOP, WPT, MSPT And Wynn Series.' },
      { name: 'Tournament Staking Calculator', href: '/tools/staking-calculator', text: 'Model Markup Packages To Offset Travel Overhead.' },
      { name: 'Cash Session Planner', href: '/tools/session-planner', text: 'Project Live Cash Game Hourly Income And Comps.' },
    ],
  },
  'tools-shot-clock': {
    heading: 'About The Live Poker Tournament Shot Clock And Time-Bank Timer',
    lead:
      'The Live Poker Tournament Shot Clock Provides A High-Visibility 15-Second Preflop And 30-Second Postflop Action Countdown With 10-Second Audio Alerts, One-Tap Time-Bank Card Extensions, Per-Seat Time-Bank Tracking Across All Nine Seats, And Printable Physical Time-Bank Cards For High-Roller Events, Charity Tournaments, And Home Games. Free Table Utility.',
    links: [
      { name: 'Blind Structure Generator', href: '/tools/blind-structure-calculator', text: 'Build TDA-Compliant Tournament Blind Schedules.' },
      { name: 'Home Game Setup Kit', href: '/tools/home-game-kit', text: 'Calculate Starting Chip Denominations And Printable Rules.' },
      { name: 'Mixed Game Placards', href: '/tools/mixed-game-placards', text: 'Track 8-Game And HORSE Dealer Rotations At The Table.' },
    ],
  },
  'tools-geometric-bet-calculator': {
    heading: 'About The Multi-Street 2e And 3e Geometric Bet Sizing Calculator',
    lead:
      'The Multi-Street Geometric Bet Sizing Calculator Solves The Exact Equal Pot-Fraction Bet Size Needed Across One, Two (2e), Or Three (3e) Streets To Put The Remaining Effective Stack All-In Smoothly On The River, Complete With Street-By-Street Pot Progression, Defender Minimum Defense Frequency, And Polarized Bluff-To-Value Ratios. Free Solver Tool.',
    links: [
      { name: 'SPR Calculator', href: '/tools/spr-calculator', text: 'Check Stack-To-Pot Ratio Commitment Zones On The Flop.' },
      { name: 'Pot Odds And MDF Calculator', href: '/tools/pot-odds-calculator', text: 'Verify Defender Minimum Defense Frequency And Bluff Alpha.' },
      { name: 'Flop Board Texture Analyzer', href: '/tools/board-texture-analyzer', text: 'Match Geometric Overbets To Nut-Advantage Boards.' },
    ],
  },
  'tools-table-selection-calculator': {
    heading: 'About The Live Cash Game Table Selection And Profitability Scorer',
    lead:
      'The Live Cash Game Table Selection Scorer Grades Any Live Table From S-Tier To F-Tier On A 100-Point Quantitative Scale Using Recreational VPIP Whale Count, Average Table Stack Depth In Big Blinds, Casino Pot Rake Cap Or Timed Seat Charge, And Active Straddle Or Bomb-Pot Frequency Per Orbit. Free Live Cash Tool.',
    links: [
      { name: 'Live Rake Calculator', href: '/tools/rake-calculator', text: 'Compare Pot Rake Caps Against Timed Seat Rentals.' },
      { name: 'Straddle And Bomb Pot Calculator', href: '/tools/straddle-calculator', text: 'Measure Effective Stack Compression And Dead Money EV.' },
      { name: 'Player Archetype Exploit Hub', href: '/learn/player-types', text: 'Counter Calling Stations, Maniacs And OMCs At Your Table.' },
    ],
  },
  'tools-mtt-grind-planner': {
    heading: 'About The Multi-Table Tournament Session And ABI Bankroll Planner',
    lead:
      'The MTT Grind Session And ABI Bankroll Planner Computes Total Session Buy-In Exposure Including Re-Entries, Average Buy-In (ABI) Bankroll Multiples, Binomial Probability Of A Zero-Cash Brick Session, And Expected Net Session Profit Across Your Full Multi-Table Tournament Schedule For Online Or Live Series Grinders. Free MTT Planner.',
    links: [
      { name: 'Late-Reg ICM Calculator', href: '/tools/late-reg-calculator', text: 'Find +EV Late-Registration Entry Windows Across Your Schedule.' },
      { name: 'PKO And Mystery Bounty Calculator', href: '/tools/bounty-calculator', text: 'Convert Knockout Bounties Into Starting-Stack Chips.' },
      { name: 'Bankroll Risk Of Ruin Calculator', href: '/tools/bankroll-calculator', text: 'Audit Long-Term Tournament Downswing Survival.' },
    ],
  },
  'learn-player-types': {
    heading: 'About The Poker Player Archetypes And Exploitative Strategy Encyclopedia',
    lead:
      'The Poker Player Archetypes Encyclopedia Profiles The Eight Canonical Opponents In Live And Online Poker (OMC, Calling Station, Maniac, TAG, LAG, Short-Stack Capper, Passive Trapper, And GTO Grinder) With Exact VPIP, PFR, And Three-Bet Ranges, Core Postflop Leaks, And Solver-Backed Exploitative Counter-Strategies For Every Stake. Free Strategy Hub.',
    links: [
      { name: 'Live Table Selection Scorer', href: '/tools/table-selection-calculator', text: 'Grade Table Profitability From Recreational Player Counts.' },
      { name: 'Live Poker Tells Guide', href: '/learn/live-poker-tells', text: 'Combine HUD Archetypes With Physical Timing And Sizing Tells.' },
      { name: 'Position Strategy Hub', href: '/learn/positions', text: 'Compare Exploitative Deviations Against 9-Seat GTO Baselines.' },
    ],
  },
  'learn-board-textures': {
    heading: 'About The 12 Canonical Flop Board Textures And GTO C-Bet Encyclopedia',
    lead:
      'The Canonical Flop Board Textures Encyclopedia Deconstructs The Twelve Fundamental Flop Archetypes In Single-Raised And Three-Bet Pots, Detailing Pre-Flop Raiser Range Advantage, Nut Advantage, Continuation-Bet Frequencies, Optimal Bet Sizings, Big Blind Check-Raise Thresholds, And Turn Barrel Plans Across Wet And Dry Runouts. Free Postflop Hub.',
    links: [
      { name: 'Interactive Board Texture Analyzer', href: '/tools/board-texture-analyzer', text: 'Enter Any Custom 3-Card Flop For Instant C-Bet Sizing.' },
      { name: 'Geometric Bet Sizing Calculator', href: '/tools/geometric-bet-calculator', text: 'Plan 2e And 3e Multi-Street Overbet Jam Lines.' },
      { name: 'Starting Hands Encyclopedia', href: '/learn/hands', text: 'See How All 169 Starting Hands Connect With Flop Textures.' },
    ],
  },
  'learn-mental-game': {
    heading: 'About The Poker Mental Game, Tilt Control And Peak Performance Hub',
    lead:
      'The Poker Mental Game And Tilt Control Hub Covers The Seven Diagnostic Categories Of Poker Tilt, Pre-Session Warmup Protocols, Mid-Session Breathing And Logic-Injection Resets, A-Game To C-Game Inchworm Progression, Sleep And Nutrition Routines For Marathon Sessions, And Hard Stop-Loss Enforcement For Live And Online Grinders. Free Psychology Guide.',
    links: [
      { name: 'Tilt Guard Coach', href: '/hub/training/tilt-guard', text: 'Launch Interactive Mid-Session Emotional Check-Ins.' },
      { name: 'Pre-Session Warmup Protocol', href: '/hub/training/session-warmup', text: 'Complete The 6-Step Mental Readiness Checklist.' },
      { name: 'Winrate Confidence Calculator', href: '/tools/winrate-confidence-calculator', text: 'Separate Normal Statistical Variance From Tilt Leaks.' },
    ],
  },
  'learn-poker-as-a-business': {
    heading: 'About The Poker As A Business And Professional Operations Guide',
    lead:
      'The Poker As A Business Guide Provides A Complete Financial And Operational Blueprint For Serious And Professional Players: Segregating Risk Capital From Living Reserves, Qualifying For IRS Schedule C Filing Versus Schedule A Session Accounting, Navigating The 2026 OBBBA Loss Cap, Managing Staking Contracts, And Controlling Festival Travel Overhead. Free Pro Guide.',
    links: [
      { name: 'US Poker Tax Calculator', href: '/tools/poker-tax-calculator', text: 'Compare Schedule A Session Caps Against Schedule C Pro Filing.' },
      { name: 'Poker Trip Expense Planner', href: '/tools/poker-trip-planner', text: 'Calculate Travel Overhead Rake On Festival Buy-Ins.' },
      { name: 'Bankroll Manager', href: '/hub/bankroll-manager', text: 'Log Every Cash And Tournament Session With Receipt Exports.' },
    ],
  },
  'poker-rooms-international': {
    heading: 'About The International Live Poker Destinations And Global Tax Directory',
    lead:
      'The International Live Poker Destinations Directory Profiles The Ten Premier Global Poker Cities Outside The United States (London, Barcelona, Rozvadov, Monte Carlo, Prague, Manila, Macau, Melbourne, Montreal, And Nassau), Covering Flagship Cardrooms, Currencies, Typical Cash Game Stakes, Rake Caps, Major Festival Stops, And Local Visitor Tax Rules. Free Global Guide.',
    links: [
      { name: 'Live Poker Near Me Lobby', href: '/hub/poker-near-me/lobby', text: 'Browse Verified Cardrooms And Daily Tournament Schedules.' },
      { name: 'Poker Trip Expense Planner', href: '/tools/poker-trip-planner', text: 'Budget Flights, Hotels And Buy-Ins For International Stops.' },
      { name: 'Live Cash Rake Calculator', href: '/tools/rake-calculator', text: 'Compare International Rake Caps And Time Collections.' },
    ],
  },
  'learn-formulas': {
    heading: 'About The Poker Math Formulas And Equations Encyclopedia',
    lead:
      'The Poker Math Formulas Encyclopedia Documents The Fifteen Core Algebraic Invariants Behind Game Theory Optimal Poker: Pot Odds, Minimum Defense Frequency, Expected Value, Stack-To-Pot Ratio, Kelly Criterion, Risk Of Ruin, Malmuth-Harville ICM, Bubble Factor, Bounty Chip Equivalence, Fold Equity, Geometric Bet Sizing, Bluff-To-Value Ratio, Harrington M-Ratio, G-Bucks, And Bayes Range Updating. Free Reference.',
    links: [
      { name: 'Pot Odds And MDF Calculator', href: '/tools/pot-odds-calculator', text: 'Verify Breakeven Calling Equity And Minimum Defense Thresholds.' },
      { name: 'Tournament ICM Calculator', href: '/tools/icm-calculator', text: 'Solve Malmuth-Harville Prize Pool Equities And Bubble Factors.' },
      { name: 'Geometric Bet Sizing Solver', href: '/tools/geometric-bet-calculator', text: 'Compute 2e And 3e Multi-Street Overbet Fractions.' },
    ],
  },
  'learn-tournament-stages': {
    heading: 'About The MTT Tournament Stage Strategy Playbooks',
    lead:
      'The MTT Tournament Stage Strategy Playbooks Deconstruct Multi-Table Tournament Progression Across Eight Chronological Phases From Level 1 Deepstack Play Through Late Registration Entry, Pre-Bubble Stack Accumulation, Direct Money Bubble Pressure, In-The-Money Laddering, Final Two Tables Reshoving, 9-Handed Final Table ICM Combat, And Heads-Up For The Title. Free Tournament Blueprint.',
    links: [
      { name: 'Late-Reg ICM Calculator', href: '/tools/late-reg-calculator', text: 'Measure Instant Dollar Equity Gained By Entering At 15BB To 30BB.' },
      { name: 'Final Table ICM Simulator', href: '/hub/training/final-table-sim', text: 'Practice Pay-Jump And Deal Decisions Across 9-Max Final Tables.' },
      { name: 'Push-Fold Nash Calculator', href: '/tools/push-fold-calculator', text: 'Inspect Short-Stack All-In Jamming Ranges By Seat And Stack.' },
    ],
  },
  'learn-leaks': {
    heading: 'About The Poker Leak Diagnostic And Fix Encyclopedia',
    lead:
      'The Poker Leak Diagnostic And Fix Encyclopedia Profiles The Twelve Highest-Cost Expected Value Leaks In Cash Games And Tournaments, Detailing The Exact HUD Symptom Metric, Winrate Cost In Big Blinds Per Hundred Hands, Root Behavioral Cause, And Deterministic GTO Solver Cure Paired With Corrective Drills. Free Diagnostic Guide.',
    links: [
      { name: 'Automated Weakness Scanner', href: '/hub/training/weakness-scanner', text: 'Scan Your Graded Training History By Position And Street.' },
      { name: 'Jarvis Leak Finder', href: '/hub/personal-assistant/leaks', text: 'Run Post-Session Hand Audits For Recurring EV Bleeds.' },
      { name: 'Poker HUD Stats Hub', href: '/learn/hud-stats', text: 'Compare Your Database Metrics Against 15 GTO Solver Targets.' },
    ],
  },
  'learn-hud-stats': {
    heading: 'About The Poker HUD Stats And Population Tendencies Encyclopedia',
    lead:
      'The Poker HUD Stats Encyclopedia Covers All Fifteen Canonical Tracking Metrics (VPIP, PFR, 3-Bet, Fold-To-3-Bet, 4-Bet, Flop C-Bet, Fold-To-Flop-C-Bet, Turn C-Bet, WTSD, W$SD, WWSF, Aggression Factor, Steal, Fold-BB-To-Steal, And Flop Check-Raise) With Exact 6-Max And 9-Max GTO Targets, Population Averages, Sample Thresholds, And Exploits. Free Analytics Hub.',
    links: [
      { name: 'Player Archetype Exploits', href: '/learn/player-types', text: 'Map HUD Stat Profiles To The 8 Canonical Player Archetypes.' },
      { name: '100BB Preflop Range Matrix', href: '/tools/preflop-ranges', text: 'Inspect Exact 13x13 Opening And 3-Betting Matrices.' },
      { name: 'Poker Leak Encyclopedia', href: '/learn/leaks', text: 'Fix Your Own Out-Of-Bounds HUD Frequencies.' },
    ],
  },
  'learn-poker-myths-debunked': {
    heading: 'About Poker Myths Debunked By GTO Solvers',
    lead:
      'Poker Myths Debunked By GTO Solvers Fact-Checks Fifteen Widespread Table Folklore Claims Against Counterfactual Regret Minimization Equilibrium And Exact 52-Card Hypergeometric Combinatorics, Disproving Full-Pot Dry-Flop Protection Bets, UTG Small-Pair Limping, Passive Ace-King Flatting, Cold-Calling 3-Bets Out Of Position, And Risk-Averse Bubble Chip-Leader Play Across Live And Online Games. Free Fact-Check Hub.',
    links: [
      { name: 'Flop Board Texture Hub', href: '/learn/board-textures', text: 'See Why Dry High-Card Boards Favor Small 33% Range C-Bets.' },
      { name: '25 All-In Hand Matchups', href: '/learn/matchups', text: 'Verify Exact Combinatorial Equities For Classic Preflop Matchups.' },
      { name: 'Poker Math Formulas Hub', href: '/learn/formulas', text: 'Review The 15 Algebraic Equations Behind Solver Strategy.' },
    ],
  },
  'learn-format-migration-guide': {
    heading: 'About The Poker Format Transition And Migration Blueprint',
    lead:
      'The Poker Format Migration Blueprint Provides A Structured Mathematical Matrix For Players Transitioning Between Live Full-Ring Cash, Online 6-Max Cash, Multi-Table Tournaments, And Pot-Limit Omaha, Covering Adjustments For Rake Caps, Big Blind Antes, Stack-To-Pot Ratios, ICM Bubble Factors, And Two-Card Omaha Mandates. Free Transition Guide.',
    links: [
      { name: 'Best Poker Format Quiz', href: '/tools/format-quiz', text: 'Match Your Bankroll And Schedule To The Ideal Poker Format.' },
      { name: 'PLO Wrap Outs Calculator', href: '/tools/plo-outs-calculator', text: 'Count Nut Straight Wraps And Flush Redraws In 4-Card And 5-Card PLO.' },
      { name: 'Live Cash Rake Calculator', href: '/tools/rake-calculator', text: 'Measure How Casino Pot Drop And Time Charges Affect Ranges.' },
    ],
  },
  'authors-index': {
    heading: 'About The Smarter Poker Editorial And Solver Methodology Team',
    lead:
      'The Editorial And Solver Methodology Team Directory Profiles The Four Specialized Research And Verification Desks At Smarter Poker: The Quantitative Solver Desk, Live Venue Intelligence Team, Tournament And ICM Research Group, And AI And MCP Protocol Engineering Desk, Complete With Zenodo DOIs And Audit Protocols. Free Governance Hub.',
    links: [
      { name: 'Verification Methodology', href: '/verification-methodology', text: 'Read How Smarter Poker Audits Solver Baselines And Venue Records.' },
      { name: 'Original Poker Research', href: '/research', text: 'Explore First-Party Quantitative Studies And Open Datasets.' },
      { name: 'Decision Matrix', href: '/compare/decision-matrix', text: 'Review 20 Quantitative Best-X-For-Y Tool And Market Selections.' },
    ],
  },
  'compare-decision-matrix': {
    heading: 'About The Poker Decision And Recommendation Matrix',
    lead:
      'The Poker Decision And Recommendation Matrix Evaluates Twenty Specific Player Personas And Scenarios To Recommend The Optimal Calculator, GTO Trainer, Live Tax Jurisdiction, Bankroll Tracker, Venue Operating System, Or AI MCP Endpoint, Complete With Explicit Selection Criteria, Quantitative Justifications, And Runner-Up Comparisons. Free Decision Guide.',
    links: [
      { name: 'All 30 Comparison Reports', href: '/compare', text: 'Read Full Side-By-Side Feature And Pricing Comparisons.' },
      { name: '52 Free Poker Calculators', href: '/tools', text: 'Launch Every Browser-Native Solver And Table Utility Instantly.' },
      { name: 'Editorial Audit Desks', href: '/authors', text: 'Meet The 4 Quantitative And Venue Verification Teams.' },
    ],
  },
  'tools-multiway-all-in-calculator': {
    heading: 'About The 3-Way And 4-Way Multiway All-In Main And Side-Pot EV Calculator',
    lead:
      'The 3-Way And 4-Way Multiway All-In Pot And Side-Pot Expected Value Calculator Slices Unequal Player Chip Commitments Into A Main Pot And Sequential Side Pots With Dead-Money Allocation, Computing Exact Dollar And Chip Expected Value, Breakeven Equity Thresholds, And Uncalled Overbet Returns Across Complex Multiway Showdowns. Free Multiway Solver.',
    metrics: [
      { label: 'Supported All-In Way Count', value: '3-Way & 4-Way Showdowns' },
      { label: 'Pot Slicing Method', value: 'Main Pot + Sequential Side Pots' },
      { label: 'Core Equation', value: 'EV = P_main*Main + P_side*Side - Risk' },
    ],
    links: [
      { name: 'Multi-Way Side Pot Calculator', href: '/tools/side-pot-calculator', text: 'Split Main And Side Pots For Up To 9 All-In Players.' },
      { name: 'Multiway Poker Odds Calculator', href: '/tools/poker-odds-calculator', text: 'Simulate Exact 3-Way And 4-Way Holdem And PLO Equities.' },
      { name: 'Pot Odds And MDF Calculator', href: '/tools/pot-odds-calculator', text: 'Verify Heads-Up Calling Equity And Minimum Defense Thresholds.' },
    ],
  },
  'tools-mystery-bounty-tracker': {
    heading: 'About The Live Mystery Bounty Pool Tracker And Envelope EV Calculator',
    lead:
      'The Live Mystery Bounty Pool Tracker Dynamically Recalculates Remaining Unopened Envelope Expected Value As Prizes Are Pulled On Day 2, Converting Average Envelope Dollar Value Into Starting-Stack Chip Equivalence, Top-Chest Hit Probability, And Adjusted All-In Calling Equity Thresholds For Covering Stacks. Free Tournament Bounty Tool.',
    metrics: [
      { label: 'Core Valuation Model', value: 'Remaining Pool / Live Envelopes' },
      { label: 'Chip Conversion Basis', value: 'Avg Envelope EV To Starting Stack' },
      { label: 'Top-Prize Tracking', value: 'Live Hypergeometric Draw Odds' },
    ],
    links: [
      { name: 'PKO And Bounty Calculator', href: '/tools/bounty-calculator', text: 'Compute Progressive Knockout Bounty Power Factors And Chip Discounts.' },
      { name: 'Tournament ICM Calculator', href: '/tools/icm-calculator', text: 'Balance Final Table Survival Pressure Against Bounty Hunting.' },
      { name: 'MTT Tournament Stages Hub', href: '/learn/tournament-stages', text: 'Master In-The-Money And Mystery Bounty Phase Adjustments.' },
    ],
  },
  'tools-bubble-factor-calculator': {
    heading: 'About The Tournament ICM Bubble Factor And Risk Premium Matrix Calculator',
    lead:
      'The Tournament ICM Bubble Factor And Risk Premium Matrix Calculator Uses Recursive Malmuth-Harville Prize Pool Equities To Compute Pairwise Bubble Factors (Dollar Equity Lost Divided By Dollar Equity Gained), ICM Risk Premium Percentages, And Exact All-In Calling Equity Thresholds Across Every Seat Collision At A Final Table. Free ICM Tool.',
    metrics: [
      { label: 'Bubble Factor Formula', value: 'BF = DollarEV_Lost / DollarEV_Gained' },
      { label: 'Required All-In Equity', value: 'Eq_Req = BF / (BF + 1)' },
      { label: 'Typical Final Table Range', value: '1.25x Short To 3.80x+ Mid-Stack' },
    ],
    links: [
      { name: 'Tournament ICM Calculator', href: '/tools/icm-calculator', text: 'Convert Full Final Table Chip Counts Into Real Dollar Equities.' },
      { name: 'Satellite Seat-Bubble Calculator', href: '/tools/satellite-calculator', text: 'Solve Equal-Prize Satellite Survival And AA/KK Fold Thresholds.' },
      { name: 'Final Table Chop Calculator', href: '/tools/chop-calculator', text: 'Compare Malmuth-Harville ICM Chops Against Chip Chops.' },
    ],
  },
  'tools-bluff-catching-calculator': {
    heading: 'About The River Bluff-Catching, Minimum Defense Frequency And Blocker EV Calculator',
    lead:
      'The River Bluff-Catching And Blocker Expected Value Calculator Evaluates Polarized River Calling Decisions By Combining Pot-Odds Break-Even Bluff Frequency (Alpha), Defender Minimum Defense Frequency (MDF), And Card-Removal Blocker Multipliers That Discount Villain Nut Value Combinations Or Eliminate Missed Flush And Straight Draw Bluffs. Free Postflop Solver.',
    metrics: [
      { label: 'Break-Even Bluff Alpha', value: 'Alpha = Bet / (Pot + 2 * Bet)' },
      { label: 'Minimum Defense (MDF)', value: 'MDF = Pot / (Pot + Bet)' },
      { label: 'Blocker Card Removal', value: 'Value vs Bluff Combo Ratio Shift' },
    ],
    links: [
      { name: 'Pot Odds And MDF Calculator', href: '/tools/pot-odds-calculator', text: 'Review Standard Bet Sizing Pot Odds And MDF Reference Tables.' },
      { name: 'Multi-Street Barrel Calculator', href: '/tools/multi-street-ev-calculator', text: 'Analyze Flop-Turn-River Cumulative Fold Equity And Sizing.' },
      { name: 'Geometric Bet Sizing Solver', href: '/tools/geometric-bet-calculator', text: 'Compute 2e And 3e Polarized River Overbet Jam Lines.' },
    ],
  },
  'tools-multi-street-ev-calculator': {
    heading: 'About The Multi-Street Flop-Turn-River Barrel And Cumulative Fold Equity Calculator',
    lead:
      'The Multi-Street Barrel And Cumulative Fold Equity Calculator Models Street-By-Street Pot Growth, Remaining Stack-To-Pot Ratio Compression, Sequential Villain Call-Through Probability, And Cumulative Double-Barrel And Triple-Barrel Bluff Breakeven Thresholds Across Flop, Turn, And River Betting Lines In Single-Raised, Three-Bet, And Four-Bet Pots For Cash And Tournament Play. Free Postflop Planner.',
    metrics: [
      { label: 'Call-Through Formula', value: 'P_SD = (1 - f1)*(1 - f2)*(1 - f3)' },
      { label: 'Cumulative Fold Equity', value: 'FE_Total = 1 - P_Showdown' },
      { label: 'Streets Modeled', value: 'Flop, Turn & River Barrel Lines' },
    ],
    links: [
      { name: 'Geometric Bet Sizing Calculator', href: '/tools/geometric-bet-calculator', text: 'Solve Equal Pot-Fraction 2e And 3e All-In Barrel Sizings.' },
      { name: 'SPR Commitment Calculator', href: '/tools/spr-calculator', text: 'Verify Stack-To-Pot Ratio Zones Before Launching Triple Barrels.' },
      { name: 'River Bluff-Catching Calculator', href: '/tools/bluff-catching-calculator', text: 'Evaluate River MDF And Card-Removal Blocker Thresholds.' },
    ],
  },
  'tools-heads-up-push-fold-calculator': {
    heading: 'About The Heads-Up And 3-Max Short-Stack Nash Push/Fold/Limp Equilibrium Solver',
    lead:
      'The Heads-Up And 3-Max Short-Stack Nash Equilibrium Solver Computes Unexploitable 1BB-To-25BB Small Blind Open-Shove, Limp-Trap, Limp-Fold, Min-Raise, And Big Blind All-In Calling Ranges Across Zero-Ante Spin-And-Go, Hyper-Turbo Heads-Up Sit-And-Go, And Big-Blind-Ante Multi-Table Tournament Finale Structures With Interactive 13x13 Hand Matrix Charts For Every Stack Depth. Free Short-Stack Chart.',
    metrics: [
      { label: 'Solved Stack Depth Window', value: '1 BB To 25 BB Effective' },
      { label: 'Equilibrium Formats', value: 'Heads-Up (2-Max) & 3-Max Finale' },
      { label: 'SB Action Branches', value: 'Open-Shove, Limp-Trap & Min-Raise' },
    ],
    links: [
      { name: '6-Max Push/Fold Calculator', href: '/tools/push-fold-calculator', text: 'Compare Full-Table 6-Max And 9-Max Short-Stack Shove Charts.' },
      { name: 'Blind-Vs-Blind GTO Matrix', href: '/tools/blind-vs-blind-calculator', text: 'Transition To 20BB-100BB Deep SB Vs BB Limp And Raise Strategy.' },
      { name: '13x13 GTO Preflop Ranges', href: '/tools/preflop-ranges', text: 'Browse Full 100BB 6-Max Opening And 3-Betting Matrices.' },
    ],
  },
  'tools-blind-vs-blind-calculator': {
    heading: 'About The Blind-Vs-Blind (SB Vs BB) GTO Range And Limp-Raise Matrix Calculator',
    lead:
      'The Blind-Vs-Blind GTO Range And Limp-Raise Matrix Calculator Solves Small Blind Versus Big Blind Confrontations When Folded To The Small Blind From 20BB To 100BB Effective Stacks, Detailing SB Limp/Complete Frequencies, SB 3x Open-Raise Shares, BB Isolation-Raise Thresholds, And SB Limp-3-Bet Traps Across Live And Online Rake Regimes. Free BvB Solver.',
    metrics: [
      { label: '100BB Low-Rake SB VPIP', value: '54.0% (26.5% Limp / 27.5% Raise)' },
      { label: '40BB MTT Ante SB VPIP', value: '78.5% (52.0% Limp / 26.5% Raise)' },
      { label: 'BB Iso-Raise Target', value: '3.5x - 4.0x vs Capped SB Limps' },
    ],
    links: [
      { name: 'Small Blind 100BB GTO Chart', href: '/tools/preflop-ranges/sb', text: 'Inspect The Complete 13x13 Small Blind Opening Matrix.' },
      { name: 'Heads-Up Nash Push/Fold Solver', href: '/tools/heads-up-push-fold-calculator', text: 'Switch To 1BB-25BB Short-Stack SB Vs BB Nash Charts.' },
      { name: '9-Seat Position Strategy Hub', href: '/learn/positions', text: 'Compare Small Blind And Big Blind Winrate Benchmarks.' },
    ],
  },
  'tools-shot-taking-calculator': {
    heading: 'About The Bankroll Shot-Taking, Stake Move-Up And Stop-Loss Ladder Calculator',
    lead:
      'The Bankroll Shot-Taking And Stake Move-Up Ladder Calculator Designs A Mathematically Protected Two-Tier Move-Up Plan For Cash Game And Tournament Grinders, Specifying Exact Higher-Stake Shot Buy-In Budgets, Hard Drop-Down Bankroll Floors, Remaining Base-Stake Buy-In Cushions After A Failed Shot, And Combined Brownian Risk Of Ruin. Free Bankroll Tool.',
    metrics: [
      { label: 'Recommended Shot Budget', value: '3 To 5 Higher-Stake Buy-Ins' },
      { label: 'Base Cushion Preserved', value: '30+ Base Buy-Ins On Drop-Down' },
      { label: 'Target Combined RoR', value: '< 1.0% Brownian Risk Of Ruin' },
    ],
    links: [
      { name: 'Bankroll Risk Of Ruin Calculator', href: '/tools/bankroll-calculator', text: 'Compute Single-Stake Brownian Risk Of Ruin And Variance.' },
      { name: 'Stake Level Move-Up Hub', href: '/learn/stakes', text: 'Read Full Move-Up Readiness Checklists Across 7 Stake Tiers.' },
      { name: 'Cash Session Planner', href: '/tools/session-planner', text: 'Project Annual Net Income After Moving Up Stakes.' },
    ],
  },
  'tools-warmup-cooldown-routine': {
    heading: 'About The Pre-Session Mental Game Warm-Up And Post-Session Cooldown Builder',
    lead:
      'The Pre-Session Mental Game Warm-Up And Post-Session Cooldown Builder Evaluates Your Sleep Quality, Emotional Baseline, C-Game Tilt Triggers, And Hard Buy-In Stop-Loss Contract To Generate A 0-To-100 A-Game Readiness Score Before You Sit Down, Paired With A Structured Post-Session Decision Grading Journal. Free Mental Game Utility.',
    metrics: [
      { label: 'A-Game Readiness Scale', value: '0 To 100 Diagnostic Score' },
      { label: 'Pre-Session Duration', value: '3-Minute Checklist & Reset' },
      { label: 'Stop-Loss Contract', value: '1.5 To 3.0 Buy-Ins Hard Cap' },
    ],
    links: [
      { name: 'Poker Mental Game Guide', href: '/learn/mental-game', text: 'Master The 7 Types Of Tilt And Jared Tendler Logic Injection.' },
      { name: 'Tilt Guard Emotional Coach', href: '/hub/training/tilt-guard', text: 'Run Mid-Session Breathing And Cognitive Reframing Resets.' },
      { name: '5-Minute Speed Warmup Drill', href: '/hub/training/quick-warmup', text: 'Calibrate Tactical Decision Speed On 10 Solved Hands.' },
    ],
  },
  'tools-home-game-director': {
    heading: 'About The Home Game Host Director: Live Waitlist, Seat Draw And Payout Ledger',
    lead:
      'The Home Game Host Director Is An All-In-One Browser Console For Private Poker Hosts That Combines Fisher-Yates Cryptographic Table And Seat Randomization, Live Waitlist Management, Initial Buy-In And Rebuy Accounting, Cage Balance Verification (Total Buy-Ins Equal Total Cashouts), And Minimum-Transfer Net Settlement Pairing. Free Host Console.',
    metrics: [
      { label: 'Seat Draw Algorithm', value: 'Fisher-Yates Balanced Table Assignment' },
      { label: 'Ledger Integrity Rule', value: 'Total Buy-Ins == Total Cashouts' },
      { label: 'Settlement Optimization', value: 'Minimum Pairwise Transfer Graph' },
    ],
    links: [
      { name: 'Home Game Chip Set Calculator', href: '/tools/home-game-kit', text: 'Calculate Optimal 300/500/1000 Chip Denominations And Tubes.' },
      { name: 'Blind Structure Generator', href: '/tools/blind-structure-calculator', text: 'Generate TDA-Compliant Home Tournament Blind Schedules.' },
      { name: 'Club Commander Software', href: '/features/club-commander', text: 'Upgrade To Multi-Screen TV Clocks And Two-Way Player SMS.' },
    ],
  },
  'poker-rooms-corridors': {
    heading: 'About The 10 Major Airport, Interstate And Cross-Border Live Poker Travel Corridors',
    lead:
      'The Live Poker Travel Corridors Directory Maps The Ten Highest-Traffic North American Airport, Interstate, And Cross-Border Poker Routes, Connecting Non-Casino Metropolitan Areas To Their Closest Legal Commercial, Tribal, And Social-Membership Cardrooms With Exact Driving Times, Flagship Venues, Rake Caps, And State Tax Rules. Free Travel Hub.',
    metrics: [
      { label: 'Indexed Travel Corridors', value: '10 Major Airport & Border Routes' },
      { label: 'Connected Venue Database', value: `${VENUE_COUNT_LABEL} Verified North American Rooms` },
      { label: 'Routing Coverage', value: 'Drive Times, Airports, Rake & Tax' },
    ],
    links: [
      { name: 'US Regional Poker Market Guides', href: '/poker-rooms/guides', text: 'Deep-Dive Guides To The Top 12 US Live Poker Destinations.' },
      { name: 'US State Legality & Tax Hub', href: '/poker-rooms/states', text: 'Compare Rake Models And State W-2G Tax Withholding Rules.' },
      { name: 'Poker Trip Expense Planner', href: '/tools/poker-trip-planner', text: 'Calculate Travel Expense Rake On Planned Trip Buy-Ins.' },
    ],
  },
  'poker-rooms-by-game': {
    heading: 'About The Live Poker Rooms By Game Variant Directory (PLO, Big O, Mixed And High-Stakes)',
    lead:
      'The Live Poker Rooms By Game Variant Directory Groups North America Verified Cardrooms By The Specific Action They Spread Regularly: 4-Card And 5-Card Pot-Limit Omaha (PLO), 5-Card Omaha Hi-Lo (Big O), Fixed-Limit Mixed Games (HORSE / 8-Game / 2-7 Triple Draw), 7-Card Stud, Deepstack $5/$10+ NLH, And Daily Guaranteed MTTs. Free Variant Directory.',
    metrics: [
      { label: 'Variant Directories', value: '6 Specialized Game Categories' },
      { label: 'Verified Room Coverage', value: `${VENUE_COUNT_LABEL} North American Venues` },
      { label: 'Tracked Action Metrics', value: 'Typical Stakes, Caps & Peak Days' },
    ],
    links: [
      { name: '15 Poker Game Variant Rules', href: '/games', text: 'Review Official Dealing Rules And Starting Hands For Every Game.' },
      { name: 'Mixed Game Rotation Placards', href: '/tools/mixed-game-placards', text: 'Print Table Placards For HORSE, 8-Game And Dealer Choice.' },
      { name: 'PLO Max Bet & Bomb Pot Solver', href: '/tools/plo-bet-calculator', text: 'Calculate 3x Plus Trail Pot Raises And Double-Board Equity.' },
    ],
  },
  'poker-rooms-security-and-disputes-guide': {
    heading: 'About The Live Poker Room Security, Floor Dispute Escalation And Angle-Shot Protection Guide',
    lead:
      'The Live Poker Room Security And Floor Disputes Guide Details Official TDA And Robert Rules Of Poker Protocols For Protecting Your Hand At Showdown, Requesting Overhead Surveillance Camera Reviews Before The Next Deal, Defending Against Eight Classic Table Angle Shots, And Managing Casino Cage Boxes And FinCEN $10,000 CTR Filings. Free Protection Guide.',
    metrics: [
      { label: 'Official Rule Citations', value: '2024/2026 TDA & RROP Standards' },
      { label: 'Angle Shots Documented', value: '8 Common Live Table Traps & Defenses' },
      { label: 'Cash Compliance Threshold', value: '$10,000 FinCEN CTR & $5,000 W-2G' },
    ],
    links: [
      { name: '30 Official TDA Floor Rulings', href: '/rules', text: 'Look Up Exact Rulings For String Bets, One-Chip Calls And Showdowns.' },
      { name: 'Live Poker Tells & Etiquette', href: '/learn/live-poker-tells', text: 'Recognize Physical Timing Tells And Prevent Accidental Angles.' },
      { name: 'First-Time Live Poker Guide', href: '/poker-rooms/first-time-guide', text: 'Learn Check-In, Chip Colors, Buying In And Tipping Standards.' },
    ],
  },
  'poker-rooms-seasonal-calendar': {
    heading: 'About The 12-Month Live Poker Series, Circuit And Festival Seasonal Planning Calendar',
    lead:
      'The 12-Month Live Poker Seasonal Planning Calendar Maps The Annual Global Tournament And Cash-Game Migration Cycle From January Through December, Highlighting When Liquidity Peaks In South Florida, Los Angeles, Texas, Las Vegas (Summer WSOP And December WPT/WSOP Paradise), Atlantic City, Cherokee, And European EPT Stops. Free Circuit Planner.',
    metrics: [
      { label: 'Annual Planning Horizon', value: '12 Months (January - December)' },
      { label: 'Tracked Weekly Tournaments', value: '4,500+ Recurring & Festival Events' },
      { label: 'Major Tour Coverage', value: 'WSOP, WPT, MSPT, RGPS, PGT & EPT' },
    ],
    links: [
      { name: '10 Major Series Strategy Guides', href: '/poker-series/guides', text: 'Read Structure Ratings And Late-Reg Strategy For Flagship Tours.' },
      { name: 'Live Poker Events Calendar', href: '/hub/events-calendar', text: 'Search Dated Tournament Schedules Across North America.' },
      { name: 'Poker Festival Trip Planner', href: '/tools/poker-trip-planner', text: 'Budget Flights, Lodging And Buy-In Overhead For Any Stop.' },
    ],
  },
  'research-annual-state-of-poker-2026': {
    heading: 'About The 2026 Annual State Of Live And Online Poker Industry Whitepaper',
    lead:
      `The 2026 Annual State Of Live And Online Poker Whitepaper Synthesizes First-Party Quantitative Research Across ${VENUE_COUNT_LABEL} Verified North American Cardrooms, 4,500+ Weekly Recurring Tournaments, 15 State Tax And Rake Regimes, And 10 Million Simulated GTO Solver Hand Histories Under CC-BY 4.0 Attribution (Zenodo DOI 10.5281/zenodo.15129481). Free Industry Report.`,
    metrics: [
      { label: 'Verified Live Venue Sample', value: `${VENUE_COUNT_LABEL} North American Poker Rooms` },
      { label: 'Solver Benchmark Corpus', value: '10,000,000+ CFR Simulated Hands' },
      { label: 'Archival Citation DOI', value: '10.5281/zenodo.15129481 (CC-BY 4.0)' },
    ],
    links: [
      { name: '15 Empirical Research Studies', href: '/research', text: 'Browse All First-Party Rake, ICM And Solver Benchmark Studies.' },
      { name: '2026 Master Benchmark Tables', href: '/research/benchmarks', text: 'Inspect Consolidated Rake, Variance, RFI And ICM Data Tables.' },
      { name: 'Canonical Fact Ledger', href: '/facts', text: 'Verify Platform Entity Counts And Machine-Readable JSON Facts.' },
    ],
  },
  'research-benchmarks': {
    heading: 'About The 2026 Master Quantitative Poker Benchmark Tables (Rake, Variance, ICM And GTO)',
    lead:
      'The 2026 Master Quantitative Poker Benchmark Tables Consolidate Smarter Poker First-Party Reference Datasets Onto One Citable Page: 6-Max And 9-Max GTO Positional RFI And 3-Bet Frequencies, Format Standard Deviations (BB/100), US Regional Casino Rake Drag (BB/100), Tournament ICM Bubble Factors, And 15 HUD Population Baselines. Free Data Reference.',
    metrics: [
      { label: 'Consolidated Data Tables', value: '6 Master Quantitative Matrices' },
      { label: 'License & Reuse Policy', value: 'CC-BY 4.0 Open Attribution' },
      { label: 'Archival Citation DOI', value: '10.5281/zenodo.15129481' },
    ],
    links: [
      { name: '2026 State Of Poker Whitepaper', href: '/research/annual-state-of-poker-2026', text: 'Read The Flagship Annual Industry Report And Methodology.' },
      { name: '15 Empirical Research Reports', href: '/research', text: 'Explore Individual Deep-Dive Studies On Rake, Waitlists And GTO.' },
      { name: 'Canonical Fact Ledger', href: '/facts', text: 'Verify Platform Entity Counts And Machine-Readable JSON Facts.' },
    ],
  },
  'facts-ledger': {
    heading: 'About The Smarter Poker Canonical Fact Ledger, Provenance And AI Verification Hub',
    lead:
      'The Smarter Poker Canonical Fact Ledger Publishes Authoritative, Machine-Verifiable Platform Counts, Organizational Provenance, Free-To-Play Compliance Disclosures, Explicit Anti-Hallucination Disambiguation Rules, Archival Dataset DOIs (10.5281/zenodo.15129481), And Direct Discovery Endpoints For Generative Search Engines And Large Language Model Agents, Synchronized With /.well-known/ai-facts.json And /api/ai/facts In Real Time. Free Verification Hub.',
    metrics: [
      { label: 'Interactive Calculators', value: '52 Deterministic Browser Solvers' },
      { label: 'Zero-Auth MCP Server', value: '70 Tools / 14 Prompts / 24 Templates' },
      { label: 'Verified Venue Directory', value: `${VENUE_COUNT_LABEL} North American Poker Rooms` },
    ],
    links: [
      { name: 'Verification Methodology', href: '/verification-methodology', text: 'Review The 5-Stage Venue And Solver Verification Pipeline.' },
      { name: 'Editorial & Research Faculty', href: '/authors', text: 'Meet The 4 Specialized Quantitative And Cardroom Audit Desks.' },
      { name: 'Official Press & Media Kit', href: '/press', text: 'Access Brand Facts, Boilerplate And CC-BY 4.0 Industry Citations.' },
    ],
  },
};

const PATH_ALIAS_ENTRIES = [
  ['/tools/plo-outs-calculator', 'tools-plo-outs-calculator'],
  ['/tools/late-reg-calculator', 'tools-late-reg-calculator'],
  ['/tools/winrate-confidence-calculator', 'tools-winrate-confidence-calculator'],
  ['/tools/poker-trip-planner', 'tools-poker-trip-planner'],
  ['/tools/shot-clock', 'tools-shot-clock'],
  ['/tools/geometric-bet-calculator', 'tools-geometric-bet-calculator'],
  ['/tools/table-selection-calculator', 'tools-table-selection-calculator'],
  ['/tools/mtt-grind-planner', 'tools-mtt-grind-planner'],
  ['/tools/multiway-all-in-calculator', 'tools-multiway-all-in-calculator'],
  ['/tools/mystery-bounty-tracker', 'tools-mystery-bounty-tracker'],
  ['/tools/bubble-factor-calculator', 'tools-bubble-factor-calculator'],
  ['/tools/bluff-catching-calculator', 'tools-bluff-catching-calculator'],
  ['/tools/multi-street-ev-calculator', 'tools-multi-street-ev-calculator'],
  ['/tools/heads-up-push-fold-calculator', 'tools-heads-up-push-fold-calculator'],
  ['/tools/blind-vs-blind-calculator', 'tools-blind-vs-blind-calculator'],
  ['/tools/shot-taking-calculator', 'tools-shot-taking-calculator'],
  ['/tools/warmup-cooldown-routine', 'tools-warmup-cooldown-routine'],
  ['/tools/home-game-director', 'tools-home-game-director'],
  ['/learn/player-types', 'learn-player-types'],
  ['/learn/board-textures', 'learn-board-textures'],
  ['/learn/mental-game', 'learn-mental-game'],
  ['/learn/poker-as-a-business', 'learn-poker-as-a-business'],
  ['/poker-rooms/international', 'poker-rooms-international'],
  ['/learn/formulas', 'learn-formulas'],
  ['/learn/tournament-stages', 'learn-tournament-stages'],
  ['/learn/leaks', 'learn-leaks'],
  ['/learn/hud-stats', 'learn-hud-stats'],
  ['/learn/poker-myths-debunked', 'learn-poker-myths-debunked'],
  ['/learn/format-migration-guide', 'learn-format-migration-guide'],
  ['/authors', 'authors-index'],
  ['authors', 'authors-index'],
  ['/compare/decision-matrix', 'compare-decision-matrix'],
  ['/poker-rooms/corridors', 'poker-rooms-corridors'],
  ['/poker-rooms/by-game', 'poker-rooms-by-game'],
  ['/poker-rooms/security-and-disputes-guide', 'poker-rooms-security-and-disputes-guide'],
  ['/poker-rooms/seasonal-calendar', 'poker-rooms-seasonal-calendar'],
  ['/research/annual-state-of-poker-2026', 'research-annual-state-of-poker-2026'],
  ['/research/benchmarks', 'research-benchmarks'],
  ['/facts', 'facts-ledger'],
  ['facts', 'facts-ledger'],
];

const PATH_ALIAS_MAP = new Map(PATH_ALIAS_ENTRIES);

// The page keys printed on the #ClubArenaConsole chassis instead of the
// default rounded-card dress. Trivia joined on 2026-09-20. Poker Near Me
// joined on 2026-09-30: its lobby and its fifteen stacked discovery sections
// are painted console art, and this block was the last rounded card left on
// the route. This list is additive by design, so a route that is not named
// here keeps exactly the dress it had.
const CONSOLE_DRESS_PAGES = new Set(['trivia', 'poker-near-me']);
const CONSOLE_DRESS_PREFIXES = ['trivia-', 'pnm-'];

export function usesConsoleDress(page) {
  const key = String(page || '');
  return CONSOLE_DRESS_PAGES.has(key) || CONSOLE_DRESS_PREFIXES.some((prefix) => key.startsWith(prefix));
}

export function lookupHubSummaryEntry(page) {
  if (!page) return null;
  const raw = String(page).trim().replace(/\.md$/i, '');
  if (HUB_PAGE_SUMMARIES[raw]) return HUB_PAGE_SUMMARIES[raw];
  if (PATH_ALIAS_MAP.has(raw) && HUB_PAGE_SUMMARIES[PATH_ALIAS_MAP.get(raw)]) {
    return HUB_PAGE_SUMMARIES[PATH_ALIAS_MAP.get(raw)];
  }
  const withSlash = raw.startsWith('/') ? raw : `/${raw}`;
  if (HUB_PAGE_SUMMARIES[withSlash]) return HUB_PAGE_SUMMARIES[withSlash];
  if (PATH_ALIAS_MAP.has(withSlash) && HUB_PAGE_SUMMARIES[PATH_ALIAS_MAP.get(withSlash)]) {
    return HUB_PAGE_SUMMARIES[PATH_ALIAS_MAP.get(withSlash)];
  }
  const slugified = raw.replace(/^\/+/, '').replace(/\//g, '-');
  if (HUB_PAGE_SUMMARIES[slugified]) return HUB_PAGE_SUMMARIES[slugified];
  const parentPath = withSlash.replace(/\/[^/]+$/, '');
  if (parentPath && parentPath !== withSlash) {
    if (HUB_PAGE_SUMMARIES[parentPath]) return HUB_PAGE_SUMMARIES[parentPath];
    if (PATH_ALIAS_MAP.has(parentPath) && HUB_PAGE_SUMMARIES[PATH_ALIAS_MAP.get(parentPath)]) {
      return HUB_PAGE_SUMMARIES[PATH_ALIAS_MAP.get(parentPath)];
    }
    const parentSlugified = parentPath.replace(/^\/+/, '').replace(/\//g, '-');
    if (HUB_PAGE_SUMMARIES[parentSlugified]) return HUB_PAGE_SUMMARIES[parentSlugified];
  }
  return null;
}

export function HubPageSummarySchema({ page, path }) {
  const resolvedPage = page || path;
  const entry = lookupHubSummaryEntry(resolvedPage);
  if (!entry) return null;
  const schema = summarySchema(resolvedPage, entry);
  if (!schema) return null;
  return (
    <Head>
      <script
        key={`hub-summary-schema-${resolvedPage}`}
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(schema).replace(/</g, '\\u003c') }}
      />
    </Head>
  );
}

export default function HubPageSummary({ page, path, as = 'h2' }) {
  page = page || path;
  const entry = lookupHubSummaryEntry(page);
  if (!entry) return null;
  const Heading = as === 'h1' ? 'h1' : 'h2';
  // The console pages are printed on the #ClubArenaConsole chassis: black
  // glass, the master's inks and engraved rules, never rounded boxes.
  // The words, links and schema are identical; only the dress follows the page.
  const styles = usesConsoleDress(page) ? consoleStyles : defaultStyles;
  const headingId = `hub-summary-${page}`;
  const schema = summarySchema(page, entry);

  return (
    <section style={styles.section} aria-labelledby={headingId}>
      {/* Built from the heading and the lead just below, so the page cannot
          say one thing to a reader and another to an engine. Absent for the
          pages that already publish their own graph through SEOHead. */}
      {schema && (
        <Head>
          <script
            key={`hub-summary-schema-${page}`}
            type="application/ld+json"
            dangerouslySetInnerHTML={{ __html: JSON.stringify(schema).replace(/</g, '\\u003c') }}
          />
        </Head>
      )}
      <Heading id={headingId} style={styles.heading}>
        {entry.heading}
      </Heading>
      <p style={styles.lead}>{entry.lead}</p>
      <SmarterConversionCta
        compact
        eyebrow="Free Smarter.Poker Account"
        title="Save Progress, Track Sessions & Unlock 107 Free GTO Games"
        description="Create Your Free Account In Seconds To Save Custom Ranges, Bookmark Live Poker Rooms, Track Your Bankroll, And Earn Daily Rewards."
        primaryLabel="Create Free Account"
        primaryHref={`/auth/signup?redirect=${encodeURIComponent(String(page || '/hub').startsWith('/') ? String(page) : `/hub/${String(page || '')}`)}&src=hub-summary`}
        secondaryLabel="Sign In"
        secondaryHref="/auth/login"
      />
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
        {page === 'trivia' || String(page).startsWith('trivia-')
          ? '18+. Entry And Reward Terms Are Shown Before Play. Diamonds And Chips Have No Cash Value.'
          : 'Free To Play. 18+. Diamonds And Chips Have No Cash Value.'}{' '}
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

const defaultStyles = {
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
    background: 'linear-gradient(180deg, #0d1f33 0%, #071321 100%)',
    border: '1px solid #2b4663',
    borderRadius: 0,
    boxShadow: 'inset 0 1px 0 rgba(134, 218, 255, 0.16)',
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

// Console dress: the same content printed the way the console prints copy.
// Colours are the master's inks only (#ClubArenaConsole 3.4); every link is a
// 44px target; a row is separated by an engraved rule, never a drawn card.
const consoleStyles = {
  section: {
    maxWidth: 1000,
    margin: '0 auto',
    padding: '32px 16px 40px',
    color: '#e4e7ec',
    background: '#000',
    fontFamily: "Inter, -apple-system, BlinkMacSystemFont, sans-serif",
  },
  heading: {
    fontFamily: "'Roboto Condensed', Inter, system-ui, sans-serif",
    fontSize: 'clamp(20px, 3vw, 26px)',
    fontWeight: 800,
    lineHeight: 1.2,
    color: '#e4e7ec',
    margin: '0 0 12px',
    letterSpacing: '0.04em',
    textShadow: '0 -1px 0 rgb(255 255 255 / 55%), 0 1px 0 #6d747c, 0 2px 0 #050607',
  },
  lead: {
    fontSize: 15,
    lineHeight: 1.65,
    color: '#9aa5b3',
    margin: '0 0 20px',
    maxWidth: 860,
  },
  list: {
    listStyle: 'none',
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
    columnGap: 24,
    rowGap: 0,
    margin: 0,
    padding: 0,
  },
  item: {
    borderTop: '1px solid #000',
    boxShadow: 'inset 0 1px 0 rgb(255 255 255 / 8%)',
    padding: '6px 0 12px',
  },
  link: {
    display: 'inline-flex',
    alignItems: 'center',
    minHeight: 44,
    minWidth: 44,
    fontFamily: "'Roboto Condensed', Inter, system-ui, sans-serif",
    fontSize: 16,
    fontWeight: 800,
    color: '#45adff',
    textDecoration: 'none',
    letterSpacing: '0.06em',
  },
  itemText: {
    display: 'block',
    fontSize: 14,
    lineHeight: 1.55,
    color: '#9aa5b3',
  },
  compliance: {
    fontSize: 12,
    lineHeight: 1.6,
    color: '#9aa5b3',
    margin: '20px 0 0',
  },
  inlineLink: {
    display: 'inline-flex',
    alignItems: 'center',
    minHeight: 44,
    minWidth: 44,
    color: '#45adff',
    textDecoration: 'underline',
    marginRight: 10,
  },
};
