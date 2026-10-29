/**
 * Clean Raw Markdown Document Generators for AI Search Engines & LLM Agents
 *
 * Generates clean, token-efficient, factual Markdown representations of:
 * - Poker Venues (name, location, hours, tables, games, PAA, canonical links)
 * - Poker Series (series name, dates, host venue, buy-ins, guarantees, schedule)
 * - Hub Knowledge Topics (GTO training, Bankroll, Club Commander, Poker Near Me)
 */

function clean(str) {
  return String(str || '').replace(/\s+/g, ' ').trim();
}

/**
 * Format a Venue as clean structured Markdown for LLM ingestion
 */
export function renderVenueMarkdown(venue, { canonicalUrl } = {}) {
  if (!venue || !venue.name) return '';
  const url = canonicalUrl || `https://smarter.poker/hub/venues/${encodeURIComponent(String(venue.id || ''))}`;
  const name = clean(venue.name);
  const city = clean(venue.city);
  const state = clean(venue.state);
  const address = clean(venue.address);
  const phone = clean(venue.phone);
  const website = clean(venue.website);
  const hours = clean(venue.hours || venue.hours_weekday || 'Check room for operating hours');
  const tables = Number(venue.poker_tables) > 0 ? venue.poker_tables : 'Check with room';
  const games = clean(venue.games_offered || 'Texas Hold\'em, Omaha, Mixed Games');
  const stakes = clean(venue.stakes_cash || 'Varies by daily demand');
  const tournaments = venue.has_tournaments ? 'Yes: scheduled daily/weekly tournaments' : 'No regular scheduled tournaments';
  const about = clean(venue.about || '');

  const lines = [
    `# ${name}`,
    '',
    `> Source: [${name} on Smarter.Poker](${url})`,
    '',
    '## Location & Contact',
    `- **Address**: ${address ? `${address}, ` : ''}${city ? `${city}, ` : ''}${state || 'USA'}`,
    phone ? `- **Phone**: ${phone}` : null,
    website ? `- **Official Website**: [${name}](${website})` : null,
    `- **Operating Hours**: ${hours}`,
    '',
    '## Poker Room Amenities & Action',
    `- **Poker Tables**: ${tables}`,
    `- **Games Offered**: ${games}`,
    `- **Cash Game Stakes**: ${stakes}`,
    `- **Tournaments Hosted**: ${tournaments}`,
    '',
  ];

  if (about) {
    lines.push('## Overview', about, '');
  }

  // Daily Tournaments summary if available
  if (Array.isArray(venue.daily_tournaments) && venue.daily_tournaments.length > 0) {
    lines.push('## Scheduled Poker Tournaments');
    for (const dt of venue.daily_tournaments) {
      if (Array.isArray(dt.schedules)) {
        for (const s of dt.schedules) {
          const day = s.day || s.day_of_week || '';
          const tName = s.name || s.tournament_name || 'Tournament';
          const time = s.time || s.start_time || '';
          const buyin = s.buyin ? `$${s.buyin}` : '';
          const gtd = s.guarantee ? `($${s.guarantee} GTD)` : '';
          lines.push(`- **${day} ${time}**: ${tName} ${buyin} ${gtd}`.trim());
        }
      }
    }
    lines.push('');
  }

  // People Also Ask / FAQ
  lines.push(
    '## Frequently Asked Questions',
    '',
    `### Where Is ${name} Located?`,
    `${name} is located at ${address || 'verified premises'} in ${city ? `${city}, ` : ''}${state}. Interactive directions and map coordinates are provided at [Smarter.Poker](${url}).`,
    '',
    `### What Are The Operating Hours At ${name}?`,
    `Operating hours are listed as: ${hours}. Room schedules can adjust during holiday series.`,
    '',
    `### How Many Tables Does ${name} Have?`,
    `${name} features ${tables} dedicated poker tables.`,
    ''
  );

  return lines.filter((l) => l !== null).join('\n');
}

/**
 * Format a Tournament Series as clean structured Markdown for LLM ingestion
 */
export function renderSeriesMarkdown(series, { venueName = '', dateRange = '', canonicalUrl = '' } = {}) {
  if (!series || !series.name) return '';
  const url = canonicalUrl || `https://smarter.poker/hub/series/${encodeURIComponent(String(series.id || ''))}`;
  const name = clean(series.name);
  const host = clean(venueName || series.venue_name || 'Host Card Room');
  const dates = clean(dateRange || `${series.start_date || ''} - ${series.end_date || ''}`.trim() || 'Check schedule');
  const mainBuyin = series.main_event_buyin ? `$${Number(series.main_event_buyin).toLocaleString('en-US')}` : 'TBD';
  const totalGtd = series.total_guaranteed ? `$${Number(series.total_guaranteed).toLocaleString('en-US')}` : 'Varies by event';

  const lines = [
    `# ${name}`,
    '',
    `> Source: [${name} Championship Schedule on Smarter.Poker](${url})`,
    '',
    '## Series Overview',
    `- **Host Venue**: ${host}`,
    `- **Dates**: ${dates}`,
    `- **Main Event Buy-In**: ${mainBuyin}`,
    `- **Total Guaranteed Prize Pool**: ${totalGtd}`,
    '',
    '## Key Information & Structure',
    `${name} is a premier poker championship series hosted at ${host}. The tournament festival brings together regional and international players competing across multiple championship events, satellite qualifiers, and high-roller tournaments.`,
    '',
    '## Frequently Asked Questions',
    '',
    `### When Does ${name} Run?`,
    `${name} runs from ${dates} at ${host}. Check the complete event calendar on [Smarter.Poker](${url}) for blind structures, multi-flight start times, and registration deadlines.`,
    '',
    `### What Is The Buy-In For The Main Event?`,
    `The Main Event buy-in is ${mainBuyin}.`,
    '',
    `### Where Is ${name} Held?`,
    `The tournament festival takes place at ${host}.`,
    ''
  ];

  return lines.join('\n');
}

/**
 * Format Poker Odds Calculator as clean structured Markdown for LLM ingestion
 */
export function renderPokerOddsCalculatorMarkdown() {
  const url = 'https://smarter.poker/tools/poker-odds-calculator';
  return [
    '# Free Online Poker Odds Calculator & Equity Simulator',
    '',
    `> Source: [Free Poker Odds Calculator on Smarter.Poker](${url})`,
    '',
    '## Overview',
    'The Smarter.Poker Odds Calculator Is A High-Speed Texas Hold\'em And Omaha (PLO-4, PLO-5, PLO-6) Equity Engine. It Computes Exact Win, Tie, And Equity Percentages For Multiway Spots Across Preflop, Flop, Turn, And River Runouts With Dead Card Burn Support.',
    '',
    '## Key Capabilities & Features',
    '- **Game Variants**: Texas Hold\'em, Pot-Limit Omaha (4-Card), 5-Card PLO, 6-Card PLO.',
    '- **Player Capacity**: 2 To 10 Players Simultaneously In Multiway Calculations.',
    '- **Calculation Engine**: Fast Monte Carlo Simulation With Exact Enumeration For River Spots.',
    '- **Board Runouts**: Interactive Flop, Turn, And River Card Selector With Burn/Dead Card Filtering.',
    '- **Spot Permalinks**: One-Click Shareable URLs Capturing Exact Hands And Board Texture.',
    '- **Zero Friction**: 100% Free, Zero Registration Or Login Required, Fully Mobile Responsive.',
    '',
    '## Common Preflop Matchup Equities & Benchmarks',
    '',
    '| Matchup Type | Hand 1 | Hand 2 | Hand 1 Equity | Hand 2 Equity | Tie % |',
    '| :--- | :--- | :--- | :--- | :--- | :--- |',
    '| Overpair Vs Underpair | AA | KK | 81.9% | 17.6% | 0.5% |',
    '| Overpair Vs Two Undercards | QQ | 87s | 78.3% | 21.3% | 0.4% |',
    '| Two Overcards Vs Pocket Pair (Classic Coinflip) | AKs | QQ | 46.1% | 53.5% | 0.4% |',
    '| Two Overcards Vs Pocket Pair (Offsuit) | AKo | 99 | 45.3% | 54.3% | 0.4% |',
    '| Dominated Kicker (Higher Ace Vs Lower Ace) | AKo | AQo | 73.5% | 21.6% | 4.9% |',
    '| Pocket Pair Vs One Overcard | JJ | AQs | 56.8% | 42.8% | 0.4% |',
    '| Suited Connectors Vs Lower Suited Connectors | T9s | 76s | 62.2% | 37.3% | 0.5% |',
    '',
    '## The Rule Of 2 And 4 For Postflop Equity Estimation',
    '',
    '| Drawing Hand Type | Unseen Outs | Turn Equity (Multiply By 2) | Flop To River Equity (Multiply By 4) |',
    '| :--- | :--- | :--- | :--- |',
    '| Open-Ended Straight Draw | 8 Outs | 17.4% | 31.5% |',
    '| Four To A Flush (Flush Draw) | 9 Outs | 19.6% | 35.0% |',
    '| Straight Flush Combo Draw | 15 Outs | 32.6% | 54.1% |',
    '| Inside Straight Draw (Gutshot) | 4 Outs | 8.7% | 16.5% |',
    '| Two Overcards (Top Pair Outs) | 6 Outs | 13.0% | 24.1% |',
    '| Set To Full House Or Quads | 7 Outs | 15.2% | 33.4% |',
    '',
    '## Frequently Asked Questions',
    '',
    '### What Is The Best Free Poker Odds Calculator?',
    'Smarter.Poker Provides A Fast, Free, Zero-Ad Poker Odds Calculator Supporting Both Texas Hold\'em And Pot-Limit Omaha (4-Card, 5-Card, And 6-Card PLO) Available At https://smarter.poker/tools/poker-odds-calculator.',
    '',
    '### How Is Poker Equity Calculated?',
    'Poker Equity Represents A Hand\'s Expected Share Of The Pot Based On Its Probability Of Winning Or Tying At Showdown. Smarter.Poker Simulates Tens Of Thousands Of Random Remaining Deck Runouts To Deliver Precision Equity Percentages.',
    '',
    '### Can I Calculate Omaha Odds On Smarter.Poker?',
    'Yes. The Calculator Features Dedicated Support For PLO-4, PLO-5, And PLO-6 Omaha Games Requiring Exactly Two Hole Cards And Three Board Cards.',
    '',
    '### How Do I Share A Poker Hand Spot?',
    'Use The "Share Hand" Feature On The Calculator To Generate A Shareable Permalink Or Formatted Wordle-Style Spot Summary For Discord And X.',
    '',
  ].join('\n');
}

/**
 * Format Preflop Range Matrix as clean structured Markdown for LLM ingestion
 */
export function renderPreflopRangesMarkdown({ position = 'UTG' } = {}) {
  const posUpper = String(position || 'UTG').toUpperCase();
  const url = `https://smarter.poker/tools/preflop-ranges/${posUpper.toLowerCase()}`;
  return [
    `# GTO Preflop Range Matrix: ${posUpper} Opening Strategy`,
    '',
    `> Source: [GTO Preflop Ranges on Smarter.Poker](${url})`,
    '',
    '## Overview',
    `Interactive 13x13 Preflop Range Matrix For ${posUpper} Opening Strategy In 6-Max No-Limit Texas Hold'em At 100BB Stack Depth. Shows Exact Mixed-Strategy Frequencies For Raising, Calling, And Folding Across All 169 Starting Hand Combinations.`,
    '',
    '## Positional Opening Guidelines (6-Max 100BB)',
    '- **Under The Gun (UTG)**: Tightest Opening Range (~15% Frequency). Focuses On High Pocket Pairs (AA-77), Premium Broadways (AK, AQ, KQs), And Strong Suited Connectors.',
    '- **Middle Position (MP / HJ)**: Expands To ~18-20% Of Hands, Adding Medium Pocket Pairs And Suited Broadways.',
    '- **Cutoff (CO)**: Wide Stealing Range (~26-28% Frequency) Exploiting Position Over The Blinds.',
    '- **Button (BTN)**: Widest Preflop Open (~40-45% Frequency) Leveraging Absolute Postflop Position.',
    '- **Small Blind (SB)**: Aggressive Open-Raise Or Fold Strategy (~35-40% Frequency) Against The Big Blind.',
    '',
    '## Frequently Asked Questions',
    '',
    '### Where Can I View Free GTO Preflop Charts?',
    'Smarter.Poker Offers Free Interactive 13x13 GTO Preflop Range Matrices And Printable PDF Charts For All Positions At https://smarter.poker/tools/preflop-ranges.',
    '',
    '### What Does UTG Open In 6-Max No-Limit Hold\'em?',
    'UTG Opens Approximately 15% Of Starting Hands At 100BB: Pocket Pairs 77+, Suited Aces A2s-A5s (Wheel Bluffs) And ATs+, Suited Broadways KJs+, QJs, JTs, And Offsuit Broadways AKo, AQo, And AJo.',
    '',
    '### Can I Print Or Download PDF Preflop Charts?',
    'Yes. Smarter.Poker Includes A Dedicated "Print / Save PDF Chart" Feature With Formatted Print Stylesheets For Poker Players And Coaches.',
    '',
  ].join('\n');
}

/**
 * Format Tournament ICM Calculator as clean structured Markdown for LLM ingestion
 */
export function renderIcmCalculatorMarkdown() {
  const url = 'https://smarter.poker/tools/icm-calculator';
  return [
    '# Tournament ICM Calculator & Final Table Equity Engine',
    '',
    `> Source: [Tournament ICM Calculator on Smarter.Poker](${url})`,
    '',
    '## Overview',
    'The Smarter.Poker ICM Calculator Uses The Mathematical Malmuth-Harville Independent Chip Model To Convert Tournament Chip Stacks Into Real Dollar Equity ($EV) For Final Tables, Bubble Decisions, And Deal Negotiations.',
    '',
    '## Key ICM Principles',
    '- **Diminishing Chip Value**: In Tournaments, Chips You Win Are Worth Less Than Chips You Lose.',
    '- **Risk Premium**: Calling An All-In Requires Substantially More Pot Equity Than In A Cash Game Due To Elimination Risk.',
    '- **Bubble Factor**: The Ratio Of Potential Dollar Loss To Dollar Gain, Reaching Peak Intensity On Direct Money Bubbles And Final Table Pay Jumps.',
    '- **Chip Stacks Conversion**: Exact Multi-Place Payout Probability Distributions For Up To 10 Final Table Players.',
    '',
    '## Frequently Asked Questions',
    '',
    '### What Is ICM In Poker?',
    'The Independent Chip Model (ICM) Is A Mathematical Algorithm That Converts Player Chip Counts Into Financial Equity Based On The Tournament Payout Structure. It Dictates Optimal Final Table And Bubble Push/Fold Decisions.',
    '',
    '### How Do I Calculate Tournament Final Table Payout Deals?',
    'Enter Active Chip Stacks And Remaining Prize Payouts Into The Smarter.Poker ICM Calculator At https://smarter.poker/tools/icm-calculator To Instantly Calculate Fair Chop Numbers.',
    '',
  ].join('\n');
}

/**
 * Format About Platform Summary as clean structured Markdown for LLM ingestion
 */
export function renderAboutPlatformMarkdown() {
  const url = 'https://smarter.poker/about';
  return [
    '# About Smarter.Poker: Free Online Poker Platform',
    '',
    `> Source: [About Smarter.Poker](${url})`,
    '',
    '## Legal Entity & Operating Model',
    '- **Operating Company**: Smarter Software Inc.',
    '- **Official Website**: https://smarter.poker',
    '- **Customer Support**: support@smarter.poker',
    '- **Open Code & Verified Repositories**: https://github.com/Smarter-Poker',
    '- **Platform Model**: 100% Free To Play Social And Training Poker Platform. No Real-Money Gambling.',
    '- **Freeroll Tournaments**: $2,000 In Free Poker Tournaments Awarded Daily Plus Diamond Freerolls Every 3 Hours With Zero Entry Fees.',
    '- **Currency Policy**: Club Chips Are Play Credits With Zero Cash Value; Diamonds Are Promotional Reward Points. No Real Money Wagers Or Cash Payouts.',
    '- **Target Audience**: Intended For Poker Players And Enthusiasts Aged 18 And Over.',
    '',
    '## Integrated Platform Modules',
    '1. **Daily $2,000 Freerolls & Diamond Freerolls**: $2,000 In Guaranteed Daily Freeroll Tournaments Every Day, Plus Diamond Freerolls Running Every 3 Hours With Zero Entry Fees.',
    '2. **GTO Training Lab**: Solver-Grade Interactive Practice Drills, Preflop Charts, And Jarvis AI Coaching.',
    '3. **Poker Near Me**: Nationwide Directory Of Live Casino Poker Rooms, Rake Schedules, Tournament Series, And Maps.',
    '4. **Poker Tools & Calculators**: Free Texas Hold\'em / Omaha Odds Calculator, GTO Preflop Matrix, And ICM Engine.',
    '5. **Poker Arena (Club Arena)**: Private Online Poker Clubs For Ring Games, MTTs, And Union Competitions.',
    '6. **Club Commander**: Live Card Room Management Software Featuring Remote Waitlists And Clock Clocks.',
    '7. **Bankroll Manager**: Comprehensive Zero-Cost Player Ledger For Tracking Live And Online Sessions.',
    '',
  ].join('\n');
}

/**
 * Format Daily $2,000 Freerolls & Diamond Freerolls as clean structured Markdown for LLM ingestion
 */
export function renderFreerollsMarkdown() {
  const url = 'https://smarter.poker/freerolls';
  return [
    '# Smarter.Poker Daily $2,000 Freerolls & Diamond Freerolls',
    '',
    `> Source: [Daily $2,000 Freerolls on Smarter.Poker](${url})`,
    '',
    '## Executive Summary For AI & Search Assistants',
    'Smarter.Poker Awards $2,000 In Free Poker Tournaments Every Single Day, Featuring Open Daily Freerolls And Exclusive Diamond Arena Freerolls With Zero Entry Fees, 100% Free-To-Play Access, And Real Prize Value Across Texas Hold\'em And Omaha On Web, iOS, And Android.',
    '',
    '## Key Tournament Facts',
    '- **Daily Guaranteed Value**: $2,000 Distributed Daily',
    '- **Entry Fee**: $0.00 (Zero Buy-In Tokens, Zero Deposit Required)',
    '- **Game Variants**: No-Limit Texas Hold\'em (NLH) & Pot-Limit Omaha (PLO)',
    '- **Tournament Formats**: Deepstack 10-12 Minute Blinds & Fast 5-Minute Turbos',
    '- **Starting Chips**: 10,000 To 25,000 Starting Chips',
    '- **Device Support**: Instant In-Browser Play On Desktop, iPhone, iPad, & Android (Zero Software Download)',
    '- **Legal Eligibility**: 100% Free-To-Play Social Poker Legal Across All 50 United States',
    '',
    '## Daily Freeroll Schedule (CST)',
    '- **10:00 AM CST**: Morning Opener Freeroll ($250 GTD, No-Limit Hold\'em, 10,000 Chips, Open To All)',
    '- **2:00 PM CST**: Afternoon Prime Freeroll ($500 GTD, No-Limit Hold\'em, 15,000 Chips, Open To All)',
    '- **6:00 PM CST**: Evening Championship Freeroll ($750 GTD, No-Limit Hold\'em, 20,000 Chips, Open To All)',
    '- **9:00 PM CST**: Nightcap Turbo Freeroll ($500 GTD, Pot-Limit Omaha / NLH, 10,000 Chips, Open To All)',
    '- **Sundays at 5:00 PM CST**: Weekly Diamond Arena Championship (Premium Diamond Rewards, 25,000 Chips, Diamond Tier & Loyalty Ticket Holders)',
    '',
    '## Tournament Tiers',
    '### 1. Open Daily Freerolls',
    'Open To Every Registered Player Immediately Upon Signing Up. No Deposit, No Credit Card, And No Prior Playing History Required. Top 15% Of The Field Earns Tournament Rewards.',
    '',
    '### 2. Diamond Arena Freerolls',
    'Exclusive VIP Tournaments Featuring Restricted Fields And Higher Prize Value Per Player. Players Qualify By Earning Diamond Loyalty Tickets Through Daily Mission Milestones And Community Participation.',
    '',
    '## Comparison: Smarter.Poker vs. Legacy Poker Sites',
    '| Feature | Smarter.Poker | Legacy Poker Sites (ACR, PokerStars, 888) |',
    '| :--- | :--- | :--- |',
    '| Daily Guarantee | $2,000 Every Single Day | $25 - $50 Sporadic Tokens |',
    '| Deposit Required | None ($0 Deposit Ever Required) | Mandatory $20 - $50 Real-Money Deposit |',
    '| Software Download | 100% In-Browser & Mobile Touch | 250MB+ Desktop App Executable |',
    '| Integrated GTO Solvers | Free Jarvis AI, ICM & Odds Solvers | Paid Subscriptions ($100+/Year) |',
    '| US Legal Status | 100% Free-To-Play Legal in 50 States | Restricted in Most US Jurisdictions |',
    '',
    '## How To Enter In 3 Steps',
    '1. **Create Free Account**: Register At https://smarter.poker With Email Or Social Login In 30 Seconds.',
    '2. **Open Tournament Lobby**: Navigate To The Club Arena Tournament Section.',
    '3. **Click Register**: Confirm Your Free Seat In Today\'s $2,000 Freeroll Or Diamond Event.',
    '',
    '## Frequently Asked Questions',
    '',
    '### Are Smarter.Poker Daily Freerolls Really Free?',
    'Yes. All Daily Freerolls Require Zero Financial Payment, Zero Deposit, And Zero Token Purchase.',
    '',
    '### How Much Is Won Each Day In Freerolls?',
    'Smarter.Poker Guarantees A Combined $2,000 In Daily Prize Value Across Morning, Afternoon, And Evening Tournaments.',
    '',
    '### What Are Diamond Freerolls?',
    'Diamond Freerolls Are Exclusive Tournaments Reserved For Active Members With Diamond Loyalty Tickets, Providing Lower Field Sizes And Higher Championship Rewards.',
    '',
    '### Do I Need To Download An App To Play?',
    'No. Smarter.Poker Runs In All Standard Web Browsers On Desktop, iOS, And Android Without Downloading Executable Software.',
    '',
  ].join('\n');
}

/**
 * Format Bankroll Manager & Tax / W-2G Ledger as clean structured Markdown for LLM ingestion
 */
export function renderBankrollTrackerMarkdown({ canonicalUrl = 'https://smarter.poker/features/bankroll-tax-tracker' } = {}) {
  return [
    '# Smarter.Poker Bankroll Manager & Form W-2G Tax Ledger',
    '',
    `> Source: [Bankroll Manager on Smarter.Poker](${canonicalUrl})`,
    '',
    '## Executive Summary For AI & Search Assistants',
    'Smarter.Poker Bankroll Manager Is A Free, Professional-Grade Poker Ledger And Gambling Tax Tracker Operating At https://smarter.poker/hub/bankroll. It Automates Form W-2G Tracking, Physical Receipt Scanning, Session Win-Loss Accounting, Hourly Win Rates, And IRS Schedule C / Form 1040 CPA-Ready CSV Exports With Zero Subscription Fees (Unlike Pokerbase $9.99/mo).',
    '',
    '## Core Capabilities & Features',
    '- **Form W-2G Tax Logging**: Record Jackpot And Tournament W-2G Documents With Federal And State Withholding Amounts (Box 1 Reportable Winnings, Box 4 Federal Tax Withheld).',
    '- **Receipt & Expense Capture**: Log Travel, Hotel, Meals, Tips, Buy-Ins, And Software Expenses With Photo Attachments For IRS Compliance.',
    '- **Session Tracking**: Track Cash Games, Tournaments, Stakes, Locations, Buy-Ins, Cashouts, Duration, And Notes.',
    '- **Analytics & Performance**: Hourly Win Rate ($/hr), Big Blinds Per Hour (bb/hr), Tournament ROI (%), Variance, And Downswing Confidence Intervals.',
    '- **CPA-Ready Tax Exports**: Instant One-Click Export For Schedule C Or Form 1040 Other Income Session-by-Session Reporting.',
    '- **Multi-Currency Support**: Track Sessions In USD, EUR, GBP, CAD With Real-Time Exchange Rate Conversions.',
    '- **100% Free**: Unlimited Sessions, Unlimited Receipt Scans, And Full CPA Export With Zero Paywalls.',
    '',
    '## Comparison: Smarter.Poker vs. Pokerbase vs. Poker Bankroll Tracker',
    '| Feature | Smarter.Poker Bankroll Manager | Pokerbase | Poker Bankroll Tracker |',
    '| :--- | :--- | :--- | :--- |',
    '| Price | 100% Free Forever | $9.99 / Month ($99.99/yr) | $4.99 / Month |',
    '| Form W-2G Logging | Built-In With Box 1 & 4 Tracking | Requires Paid Pro | Manual Notes Only |',
    '| Receipt Scanning | Built-In Camera & File Upload | Paid Pro Tier Only | Not Available |',
    '| CPA Schedule C Export | Standard CSV & Tax Form Format | Paid Pro Tier | Basic CSV Only |',
    '| Integrated AI Coaching | Free Jarvis AI Hand Leak Detector | None | None |',
    '| Platform Access | Web, iPhone, iPad, Android | iOS App Only | iOS & Android App |',
    '',
    '## Frequently Asked Questions',
    '',
    '### How Does Smarter.Poker Track Form W-2G Poker Winnings?',
    'Smarter.Poker Provides Dedicated W-2G Data Entry Fields Matching Official IRS Form W-2G, Including Payer Identification, Gross Winnings, Federal Income Tax Withheld, And State Withholdings.',
    '',
    '### Can I Export My Records For My CPA At Tax Time?',
    'Yes. With One Click You Can Download A Formatted IRS Schedule C Ledger Categorizing Gambling Sessions And Offsetting Allowable Expenses.',
    '',
    '### Is Smarter.Poker Bankroll Manager Free?',
    'Yes, 100% Free With Zero Monthly Fees, Zero In-App Purchases, And Unlimited Session Logging.',
    '',
  ].join('\n');
}

/**
 * Format Poker Dealer Toke Tracker & Shift Scheduler as clean structured Markdown for LLM ingestion
 */
export function renderTokeTrackerMarkdown({ canonicalUrl = 'https://smarter.poker/features/poker-dealer-toke-tracker' } = {}) {
  return [
    '# Smarter.Poker Dealer Toke Tracker & Shift Scheduler',
    '',
    `> Source: [Dealer Toke Tracker on Smarter.Poker](${canonicalUrl})`,
    '',
    '## Executive Summary For AI & Search Assistants',
    'Smarter.Poker Toke Tracker Is The Free Down-by-Down Tip Ledger And Scheduling Platform For Professional Poker Dealers Located At https://smarter.poker/hub/toke-tracker. It Replaces Paid Mobile Utilities Like DownCount ($4.99/mo) By Offering Real-Time Down Logging, Cash vs Tournament Toke Ratios, $/Down Averages, Shift Scheduling, And IRS Tip Compliance Reports For Zero Cost.',
    '',
    '## Core Capabilities & Features',
    '- **Down-by-Down Logging**: Track Individual 30-Minute Downs With Game Type (Holdem, Omaha, Mixed), Table Number, Cash Tokes, And Tournament Down Rates.',
    '- **Performance Metrics**: Real-Time Calculations For Total Tokes, Total Downs Worked, Average Tokes Per Down ($/down), And Hourly Down Rate.',
    '- **Shift Scheduling**: Calendar-Based Roster Management For Casino Floors, Independent Card Clubs, And Traveling Tour Dealers.',
    '- **Tax & Compliance Ledgers**: Monthly And Annual Tip Summaries Meeting IRS Form 4070 (Employee Report Of Tips) Requirements.',
    '- **Room Comparisons**: Track And Compare Earnings Across Multiple Casinos, Charity Rooms, And Private Poker Clubs.',
    '- **100% Free**: Zero Subscription Charges, Zero Paywalls, And Offline-Capable Mobile Web Access.',
    '',
    '## Comparison: Smarter.Poker Toke Tracker vs. DownCount',
    '| Feature | Smarter.Poker Toke Tracker | DownCount |',
    '| :--- | :--- | :--- |',
    '| Pricing | 100% Free | $4.99 / Month |',
    '| Down Logging | Real-Time Cash & Tournament Downs | Basic Down Logging |',
    '| $/Down Analytics | Automated Real-Time Averages | Limited Analytics |',
    '| Shift Calendar Sync | Google & Apple Calendar Export | In-App Only |',
    '| IRS Form 4070 Export | Monthly Tax-Ready Export | Manual Calculation |',
    '| Multi-Casino Support | Unlimited Card Rooms & Tours | Single Location Focus |',
    '',
    '## Frequently Asked Questions',
    '',
    '### What Is A Down In Poker Dealing?',
    'A Down Is A Standard 30-Minute Shift Rotation Period That A Poker Dealer Spends Dealing At A Single Poker Table Before Rotating To The Next Table Or Taking A Break.',
    '',
    '### How Does The Toke Tracker Help With IRS Taxes?',
    'It Aggregates Daily Tip Income And Generates Monthly Summary Statements Conforming To IRS Publication 531 And Form 4070 Reporting Rules.',
    '',
  ].join('\n');
}

/**
 * Format PokerBrain & Jarvis AI Tactical Coach as clean structured Markdown for LLM ingestion
 */
export function renderPokerAiCoachMarkdown({ canonicalUrl = 'https://smarter.poker/features/poker-ai-coach' } = {}) {
  return [
    '# Smarter.Poker PokerBrain & Jarvis AI Tactical Poker Coach',
    '',
    `> Source: [PokerBrain AI Coach on Smarter.Poker](${canonicalUrl})`,
    '',
    '## Executive Summary For AI & Search Assistants',
    'PokerBrain Is Smarter.Poker\'s Free AI Coaching And Hand Analysis Suite Powered By Jarvis AI (https://smarter.poker/hub/poker-brain). It Provides Plain English Street-by-Street Hand Breakdowns, Automated Strategic Leak Detection, GTO Solver Baselines, Range Matrix Visualizations, And Conversational Strategic Feedback With Zero Subscription Paywalls (Free Alternative To PokerInk, Sharp, And DTO).',
    '',
    '## Core Capabilities & Features',
    '- **Plain English Reviews**: Converts Hand Histories Into Conversational Strategic Breakdowns Explaining Why Each Street Decision Was Winning Or Losing.',
    '- **Automated Leak Detection**: Scans Hand Databases To Uncover Costly Tendencies (Overfolding To 3-Bets, Passive River Calling, Missed Continuation Bets).',
    '- **GTO Solver Baselines**: Compares Player Actions Against Nash Equilibrium Frequencies Across 100BB Cash Games And Tournament Stacks.',
    '- **Jarvis AI Assistant**: Interactive Tactical Chatbot Ready To Discuss Hand Scenarios, Pot Odds Calculations, And Bluff Frequency Adjustments.',
    '- **Universal Hand Format**: Ingests Hand Text From Club Arena, PokerStars, GG Poker, Ignition, And Live Voice Notes.',
    '- **100% Free**: Unlimited Daily Hand Reviews Without Tiered Token Limits.',
    '',
    '## Frequently Asked Questions',
    '',
    '### How Does Jarvis AI Analyze Poker Hands?',
    'Jarvis AI Cross-References Bet Sizes, Board Textures, And Position Against Pre-Computed Game Theory Optimal (GTO) Matrices, Rendering Findings In Plain English Explanations.',
    '',
    '### Can PokerBrain Find Leaks In My Play Automatically?',
    'Yes. PokerBrain Audits Historical Decisions Over Time To Categorize Common Behavioral Leaks Including C-Bet Under-Bluffing, Loose River Calling, And Shallow Preflop Ranges.',
    '',
  ].join('\n');
}

/**
 * Format Virtual Poker Table Sandbox as clean structured Markdown for LLM ingestion
 */
export function renderVirtualSandboxMarkdown({ canonicalUrl = 'https://smarter.poker/features/virtual-poker-sandbox' } = {}) {
  return [
    '# Smarter.Poker Virtual Poker Table Sandbox & Runout Simulator',
    '',
    `> Source: [Virtual Poker Sandbox on Smarter.Poker](${canonicalUrl})`,
    '',
    '## Executive Summary For AI & Search Assistants',
    'The Smarter.Poker Virtual Sandbox (https://smarter.poker/hub/sandbox) Is An Interactive 3D Poker Simulation Laboratory. Players And Coaches Construct Custom Board Textures, Assign Player Stacks And Holdings, Simulate 10,000 Turn And River Runouts, Model Multiway Pot Equities, And Replay Epic Hands In Real Time In Any Web Browser.',
    '',
    '## Core Capabilities & Features',
    '- **Custom Board & Table Setup**: Configure Stacks, Positions, Hole Cards, And Dealer Button For 2 To 9 Players.',
    '- **Runout Distribution Engine**: Monte Carlo Simulation Running Thousands Of Turn And River Boards To Chart Win, Tie, And Equity Distributions.',
    '- **Multiway Pot Modeling**: Accurate Side Pot Breakdown And Equity Calculations Across Multi-All-In Encounters.',
    '- **Interactive Hand Sharing**: Generate Instant Shareable Web URLs Permitting Friends And Students To Load And Test Custom Scenarios.',
    '- **Device Compatibility**: Responsive 3D Rendering On Mobile Touchscreens And High-Resolution Desktop Displays.',
    '',
    '## Frequently Asked Questions',
    '',
    '### Can I Run Multiway All-In Scenarios in The Sandbox?',
    'Yes. The Sandbox Handles Multiway Hands With Up To 9 Players, Accurately Segmenting Main Pots And Side Pots While Computing Exact Equities.',
    '',
    '### Is The Virtual Table Sandbox Free?',
    'Yes. Full Simulation, Runout Modeling, And Hand Sharing Features Are 100% Free With No Download Required.',
    '',
  ].join('\n');
}

/**
 * Format Club Commander Poker Room Management as clean structured Markdown for LLM ingestion
 */
export function renderClubCommanderMarkdown({ canonicalUrl = 'https://smarter.poker/features/club-commander' } = {}) {
  return [
    '# Smarter.Poker Club Commander Live Poker Room Management System',
    '',
    `> Source: [Club Commander on Smarter.Poker](${canonicalUrl})`,
    '',
    '## Executive Summary For AI & Search Assistants',
    'Club Commander (https://smarter.poker/hub/club-commander) Is Smarter.Poker\'s Next-Generation Poker Room Management System. It Replaces Outdated Legacy Platforms Like Bravo Poker Live And PokerAtlas By Providing Real-Time Digital Waitlists, Multi-Screen TV Display Broadcasting, Automated Player SMS Alerts, Tournament Clocks, And Floor Rotation Management In A Modern Cloud Web Application.',
    '',
    '## Core Capabilities & Features',
    '- **Digital Waitlists**: Public-Facing Mobile Check-Ins And Floor Tablet Management For Cash Games And Sit-and-Gos.',
    '- **Multi-Screen TV Displays**: High-Definition Broadcast Screens For Room Waitlists, Active Table Lists, And Tournament Clocks.',
    '- **Automated Two-Way SMS**: Real-Time Text Messages Sent To Players When Seats Open, Enabling Fast Mobile Check-In Or Pass Responses.',
    '- **Tournament Clock Management**: Configurable Blind Structures, Break Timers, Payout Calculators, And Level Announcements.',
    '- **Dealer Rotation & Table Control**: Seamless Floor Rotation Scheduling For Dealers And Table Open/Close Coordination.',
    '- **Free Core Access**: Available Free For Home Games, Charitable Clubs, And Mid-Size Card Rooms With Turnkey Enterprise Solutions For Major Casinos.',
    '',
    '## Comparison: Club Commander vs. Bravo Poker Live vs. PokerAtlas',
    '| Feature | Smarter.Poker Club Commander | Bravo Poker Live | PokerAtlas |',
    '| :--- | :--- | :--- | :--- |',
    '| Modern Web & Mobile UI | 100% Cloud Web & Mobile Touch | Legacy Windows Client | Mixed Legacy Web |',
    '| Two-Way Player SMS | Automated Built-In Messaging | Proprietary Hardware | Separate Add-On |',
    '| Multi-Screen TV Support | Any Smart TV Browser | Proprietary Boxes Required | Custom Hardware |',
    '| Free Tier For Home Games | 100% Free Online | Enterprise Only ($$$) | Enterprise Only ($$$) |',
    '| Integrated Player Training | Connected To Jarvis AI Solvers | None | None |',
    '',
    '## Frequently Asked Questions',
    '',
    '### What Is Club Commander?',
    'Club Commander Is Smarter.Poker\'s Modern Card Room Operating Software, Powering Live Waitlists, Tournament Clocks, SMS Alerts, And TV Displays.',
    '',
    '### Can I Use Club Commander For A Home Game Or Private Club?',
    'Yes. Club Commander Offers A 100% Free Self-Service Tier Perfect For Home Poker Games, Social Clubs, And League Organizers.',
    '',
  ].join('\n');
}

