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
      'Reels Is Short Poker Video: Hands Worth Watching Twice, Reads That Paid Off, Tournament Moments From The Circuit And Clips Players Record At The Table. Everything Is Vertical, Short And Poker, Which Is The Point: A Feed That Does Not Wander Off Into Everything Else. Watching Is Free And Needs No Account, And Nothing In It Is A Wager.',
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
      'Poker Trivia Is The Smarter Poker Quiz Game: Questions On Hand Rankings, Pot Odds, Tournament History, Rules Disputes And The People Who Made The Game. Six Modes Run On The Same Question Bank, From An Endless Run To A Timed Sprint To A Head To Head Match Against Another Player, With Streaks, Achievements And A Public Leaderboard On Top. It Is Free To Play, Needs No Account To Start, And Nothing In It Is A Wager.',
    links: [
      { name: 'Endless', href: '/hub/trivia/endless', text: 'Keep Answering Until You Decide To Stop.' },
      { name: 'Survival', href: '/hub/trivia/survival', text: 'One Run, And A Wrong Answer Ends It.' },
      { name: 'Time Attack', href: '/hub/trivia/time-attack', text: 'As Many As You Can Before The Clock Runs Out.' },
      { name: 'Mixed', href: '/hub/trivia/mixed', text: 'Every Category At Once, In Random Order.' },
      { name: 'Head To Head', href: '/hub/trivia/pvp', text: 'The Same Questions, Against Another Player, Live.' },
      { name: 'Trivia Tournaments', href: '/hub/trivia/tournaments', text: 'Scheduled Events With A Field And A Final Standing.' },
      { name: 'Leaderboard', href: '/hub/trivia/leaderboard', text: 'Who Is Ahead Today, This Week And All Time.' },
    ],
  },
  'trivia-endless': {
    heading: 'About Endless Mode',
    lead:
      'Endless Is Poker Trivia With No Stop Condition: Questions Keep Coming Until You Decide To Leave, And Your Run Is Scored On How Far You Got And How Often You Were Right. It Is The Mode For Learning Rather Than Competing, Because A Wrong Answer Costs You Nothing But The Explanation That Follows It. Free To Play, And No Account Is Needed To Start A Run.',
    links: [
      { name: 'Poker Trivia', href: '/hub/trivia', text: 'Every Mode, And How The Question Bank Works.' },
      { name: 'Survival', href: '/hub/trivia/survival', text: 'The Same Questions, With One Life.' },
      { name: 'Poker Glossary', href: '/hub/training/glossary', text: 'Look Up Anything A Question Used And You Did Not Know.' },
    ],
  },
  'trivia-survival': {
    heading: 'About Survival Mode',
    lead:
      'Survival Is One Run With One Life: Answer Correctly And The Next Question Comes, Answer Wrong And The Run Is Over. The Score Is How Deep You Got, Which Makes It The Mode Where Knowing You Do Not Know Is Worth As Much As Knowing. Streaks Carry Across Sessions And The Best Runs Reach The Leaderboard. Free To Play, And Nothing In It Is A Wager.',
    links: [
      { name: 'Poker Trivia', href: '/hub/trivia', text: 'Every Mode, And How The Question Bank Works.' },
      { name: 'Leaderboard', href: '/hub/trivia/leaderboard', text: 'The Deepest Runs Today, This Week And All Time.' },
      { name: 'Endless', href: '/hub/trivia/endless', text: 'The Same Questions, With No Way To Lose.' },
    ],
  },
  'trivia-time-attack': {
    heading: 'About Time Attack',
    lead:
      'Time Attack Gives You A Fixed Clock And Counts How Many Questions You Answer Correctly Before It Runs Out. Skipping Is Free And Guessing Is Not, So The Mode Rewards Reading Fast And Knowing When To Move On, Which Is A Closer Match To A Real Decision At The Table Than Any Amount Of Thinking Time Would Be. Free To Play, And No Account Is Needed To Start.',
    links: [
      { name: 'Poker Trivia', href: '/hub/trivia', text: 'Every Mode, And How The Question Bank Works.' },
      { name: 'GTO Training', href: '/hub/training', text: 'Timed Decisions On Real Hands Rather Than Questions.' },
      { name: 'Leaderboard', href: '/hub/trivia/leaderboard', text: 'The Highest Counts Today, This Week And All Time.' },
    ],
  },
  'trivia-mixed': {
    heading: 'About Mixed Mode',
    lead:
      'Mixed Draws From Every Category At Once And In Random Order: Hand Rankings Next To Tournament History Next To A Rules Dispute Next To Pot Odds. It Is The Mode That Finds The Category You Have Been Avoiding, Because You Cannot See What Is Coming And Cannot Prepare For It. Free To Play, And Nothing In It Is A Wager.',
    links: [
      { name: 'Poker Trivia', href: '/hub/trivia', text: 'Every Mode, And How The Question Bank Works.' },
      { name: 'Poker Glossary', href: '/hub/training/glossary', text: 'Forty Nine Terms Defined, For The Category You Keep Missing.' },
      { name: 'Endless', href: '/hub/trivia/endless', text: 'The Same Breadth, With No Stop Condition.' },
    ],
  },
  'trivia-pvp': {
    heading: 'About Head To Head',
    lead:
      'Head To Head Puts Two Players On The Same Questions At The Same Time, And The Faster Correct Answer Takes The Point. Matches Are Short, Results Are Immediate, And Both Players See Every Answer Afterwards, So A Match Doubles As A Way To Find Out What The Other Person Knew That You Did Not. Free To Play, And Nothing In It Is A Wager.',
    links: [
      { name: 'Poker Trivia', href: '/hub/trivia', text: 'Every Mode, And How The Question Bank Works.' },
      { name: 'Trivia Tournaments', href: '/hub/trivia/tournaments', text: 'The Same Format With A Full Field And A Final Standing.' },
      { name: 'Leaderboard', href: '/hub/trivia/leaderboard', text: 'Who Is Winning Matches Today, This Week And All Time.' },
    ],
  },
  'trivia-tournaments': {
    heading: 'About Trivia Tournaments',
    lead:
      'Trivia Tournaments Are Scheduled Events: Everyone Answers The Same Questions In The Same Order At The Same Time, And The Field Is Ranked On Correct Answers And Speed. Registration Opens Before The Start, The Standings Move Live While It Runs, And The Final Table Of Results Stays Readable Afterwards. Free To Enter, And Nothing In It Is A Wager.',
    links: [
      { name: 'Poker Trivia', href: '/hub/trivia', text: 'Every Mode, And How The Question Bank Works.' },
      { name: 'Head To Head', href: '/hub/trivia/pvp', text: 'The Same Idea With One Opponent Instead Of A Field.' },
      { name: 'Events Calendar', href: '/hub/events-calendar', text: 'Live Poker Series And Festivals By Date.' },
    ],
  },
  'trivia-leaderboard': {
    heading: 'About The Trivia Leaderboard',
    lead:
      'The Trivia Leaderboard Ranks Players On Daily, Weekly And All Time Windows, Across Every Mode: Deepest Survival Run, Highest Time Attack Count, Longest Streak And Most Head To Head Wins. Rankings Update As Runs Finish, So The Board Is What Happened Today Rather Than A Weekly Snapshot. Free To Appear On, And Nothing On It Is A Wager Or A Payout.',
    links: [
      { name: 'Poker Trivia', href: '/hub/trivia', text: 'Every Mode, And How The Question Bank Works.' },
      { name: 'Survival', href: '/hub/trivia/survival', text: 'The Mode Most Of The Top Runs Come From.' },
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
      { name: 'Poker Glossary', href: '/hub/training/glossary', text: 'Every Term A Solution Uses, Defined.' },
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
      { name: 'Poker Glossary', href: '/hub/training/glossary', text: 'Every Term Jarvis Uses, Defined.' },
    ],
  },
  'training-solutions': {
    heading: 'About Solutions',
    lead:
      'Solutions Is The Library Of Solver Baselines Every Drill Is Scored Against: Opening, Three Betting And Defending Ranges By Position And Stack Depth, With The Frequencies And The Reasoning Behind Them. Browse A Spot Directly Rather Than Waiting For A Drill To Show It To You, And Compare What The Solver Does With What You Have Been Doing. Free To Read.',
    links: [
      { name: 'GTO Training', href: '/hub/training', text: 'The Drills That Use These Baselines.' },
      { name: 'Preflop Range Lab', href: '/hub/preflop-charts', text: 'Practise The Preflop Ranges Directly.' },
      { name: 'Poker Glossary', href: '/hub/training/glossary', text: 'Range Advantage, Squeeze, Polarised And 46 More.' },
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
