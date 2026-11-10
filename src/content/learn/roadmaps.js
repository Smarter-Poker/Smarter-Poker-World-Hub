/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  5 POKER PLAYER PROGRESSION ROADMAPS (src/content/learn/roadmaps.js)
 * ═══════════════════════════════════════════════════════════════════════════════
 * Authoritative source of truth for /learn/roadmaps and /learn/roadmaps/[track].
 * Structured 90-day and 6-month learning and execution blueprints taking
 * players from beginner to winning $1/$3, $2/$5-$5/$10 pro, tournament circuit
 * grinder, Pot-Limit Omaha specialist, and Club Arena / Commander director.
 *
 * House style: Title Case, zero em dashes.
 */

export const ROADMAPS_AS_OF = '2026-11-10';
export const ROADMAPS_BASE_PATH = '/learn/roadmaps';
export const ROADMAPS_URL = 'https://smarter.poker/learn/roadmaps';

export function roadmapPath(slug) {
  return `/learn/roadmaps/${slug}`;
}

const ROADMAP_SLUG_ALIASES = {
  'beginner': 'beginner-to-beating-1-3-live',
  'beginner-to-1-3': 'beginner-to-beating-1-3-live',
  '1-3-live': 'beginner-to-beating-1-3-live',
  '2-5-pro': '1-3-regular-to-2-5-and-5-10-pro',
  '5-10-pro': '1-3-regular-to-2-5-and-5-10-pro',
  'cash-pro': '1-3-regular-to-2-5-and-5-10-pro',
  'mtt-grinder': 'weekend-mtt-player-to-circuit-grinder',
  'circuit-grinder': 'weekend-mtt-player-to-circuit-grinder',
  'tournaments': 'weekend-mtt-player-to-circuit-grinder',
  'plo': 'nlh-player-to-pot-limit-omaha-specialist',
  'plo-specialist': 'nlh-player-to-pot-limit-omaha-specialist',
  'home-game': 'home-game-host-to-club-commander-director',
  'club-commander': 'home-game-host-to-club-commander-director',
};

export function getRoadmapBySlug(slug) {
  if (!slug) return null;
  const clean = String(slug).trim().toLowerCase();
  const target = ROADMAP_SLUG_ALIASES[clean] || clean;
  return POKER_ROADMAPS.find((r) => r.slug === target) || null;
}

export const POKER_ROADMAPS = [
  {
    slug: 'beginner-to-beating-1-3-live',
    code: 'Track 01: Beginner To $1/$3 Winner',
    name: '90-Day Beginner To Winning $1/$3 Live Cash Roadmap',
    title: '90-Day Beginner To Winning $1/$3 Live Cash Poker Roadmap',
    h1: '90-Day Beginner To Winning $1/$3 Live Cash Game Player Roadmap',
    duration: '90 Days (12 Weeks)',
    startingPoint: 'New Or Recreational Player Learning Hand Rankings & Table Rules',
    graduationGoal: 'Consistent +10 BB/Hr ($30/Hr) Winner At $1/$2 & $1/$3 Live NLH',
    summary:
      'A Structured 90-Day Curriculum Taking Any Motivated Beginner From Basic Hand Rankings And Pot Odds To Beating Live $1/$2 And $1/$3 Casino Cash Games For $25 To $40 Per Hour Without Fancy Slow-Plays Or High-Variance Hero Calls.',
    milestones: [
      {
        phase: 'Days 1 - 30: Foundations, Hand Rankings, Position & Pot Odds',
        objective: 'Eliminate Fundamental Preflop And Math Errors Before Stepping Into A Live Room.',
        actionItems: [
          'Memorize The 10 Official Poker Hand Rankings, Kicker Rules, And The Rule Of 4 And 2 For Flush/Straight Draws.',
          'Learn The 9 Table Positions (UTG Through Button And Blinds) And Memorize 100BB Raise-First-In (RFI) Charts.',
          'Stop Open-Limping Completely: Enter Every Unopened Pot With A 3x To 4x Raise Or Fold.',
        ],
        recommendedLinks: [
          { label: 'Poker Hand Rankings Guide', href: '/learn/poker-hand-rankings' },
          { label: '9-Seat Position Encyclopedia', href: '/learn/positions' },
          { label: 'Pot Odds & MDF Calculator', href: '/tools/pot-odds-calculator' },
        ],
      },
      {
        phase: 'Days 31 - 60: Live Cardroom Etiquette, Value Betting & Multiway Pots',
        objective: 'Master The Physical Cardroom Environment And Punish Loose-Passive Callers.',
        actionItems: [
          'Complete The 6-Step Casino Cage & Brush Check-In Routine With A Dedicated 20-Buy-In ($6,000) Bankroll.',
          'Adopt Linear Isolation Raising (4x + 1BB Per Limper) To Punish Limp-Callers From Late Position.',
          'Size Up Value Bets To 66% To 85% Pot With Top Pair Top Kicker Or Better Against Inelastic Recreational Callers.',
        ],
        recommendedLinks: [
          { label: 'First-Time Live Poker Room Guide', href: '/poker-rooms/first-time-guide' },
          { label: '$1/$2 & $1/$3 Live Stake Guide', href: '/learn/stakes/1-2-and-1-3-live-nlh' },
          { label: 'All 169 Starting Hands Matrix', href: '/learn/hands' },
        ],
      },
      {
        phase: 'Days 61 - 90: River Discipline, Session Tracking & Leak Plugging',
        objective: 'Lock In A Verified +10 BB/Hr Winrate Across Your First 150 Live Hours.',
        actionItems: [
          'Apply The Golden Rule Of $1/$3 Rivers: Over-Fold One-Pair Hands To River Raises Unless You Beat Value.',
          'Track Every Session Hour, Buy-In, Rake Environment, And Tip Overhead To Verify Your Real Hourly Winrate.',
          'Review Your Three Biggest Pots After Every Session Using The Smarter.Poker Odds And EV Calculators.',
        ],
        recommendedLinks: [
          { label: 'Interactive Poker Odds Calculator', href: '/tools/poker-odds-calculator' },
          { label: 'Bankroll & Risk Of Ruin Calculator', href: '/tools/bankroll-calculator' },
          { label: 'Printable Poker Cheat Sheets', href: '/learn/cheat-sheets' },
        ],
      },
    ],
    faqs: [
      {
        q: 'Can A Complete Beginner Really Beat $1/$2 Or $1/$3 Live Within 90 Days?',
        a: 'Yes. Because Live $1/$2 And $1/$3 Players Routinely Limp-Call 40% To 60% Of Hands And Pay Off Three Streets With Dominated Top Pairs, A Disciplined Player Who Studies Position, Eliminates Open-Limping, And Value Bets Relentlessly Can Become A Immediate Winner.',
      },
      {
        q: 'How Many Hours Per Week Should I Dedicate To Study Vs Play On This Roadmap?',
        a: 'Follow A 25% Study / 75% Play Split: Spend 3 To 4 Hours Studying Positional Ranges And Hand Matchups For Every 10 To 12 Hours On The Live Felt.',
      },
    ],
  },
  {
    slug: '1-3-regular-to-2-5-and-5-10-pro',
    code: 'Track 02: $1/$3 Reg To $2/$5 & $5/$10 Pro',
    name: '$1/$3 Regular To $2/$5 & $5/$10 Professional Roadmap',
    title: '$1/$3 Regular To $2/$5 And $5/$10 Live Poker Pro Roadmap',
    h1: '$1/$3 Regular To $2/$5 & $5/$10 Professional Cash Game Roadmap',
    duration: '6 Months (500+ Tracked Hours)',
    startingPoint: 'Winning $1/$3 Live Regular (+8 To +12 BB/Hr Over 400+ Hours)',
    graduationGoal: 'Full-Time $2/$5 & $5/$10 Professional Averaging $65 - $130+ / Hr',
    summary:
      'Transitioning From $1/$3 To $2/$5 And Time-Raked $5/$10+ Requires Shifting From Purely ABC Value Play To Aggressive 3-Bet/4-Bet Range Construction, 200BB+ Deep-Stack Navigation, Capped-Range Exploitation, And Professional Bankroll And Tax Management.',
    milestones: [
      {
        phase: 'Months 1 - 2: 3-Bet / 4-Bet Architecture & Small Blind Discipline',
        objective: 'Replace Passive Flat-Calling With Solver-Calibrated 3-Bet And Squeeze Ranges.',
        actionItems: [
          'Implement A Pure 3-Bet Or Fold Strategy From The Small Blind And Early/Middle Positions.',
          'Construct Balanced Linear And Polarized 3-Bet Ranges From The Hijack, Cutoff, And Button To Isolate Openers.',
          'Calibrate 4-Bet Value And Suited Wheel Ace (A5s/A4s) 4-Bet Bluff Frequencies For 100BB And 200BB Stacks.',
        ],
        recommendedLinks: [
          { label: '13x13 GTO Preflop Range Matrix', href: '/tools/preflop-ranges' },
          { label: '$2/$5 Live Strategy Guide', href: '/learn/stakes/2-5-live-nlh' },
          { label: '25 All-In Hand Matchups', href: '/learn/matchups' },
        ],
      },
      {
        phase: 'Months 3 - 4: 200BB+ Deep-Stack Polarity, Check-Raising & Turn Overbets',
        objective: 'Out-Navigate Competent $2/$5 And $5/$10 Regulars Across Multi-Street Trees.',
        actionItems: [
          'Master Flop Check-Raise Frequencies From The Big Blind On Low Connected And Paired Textures.',
          'Utilize Turn Overbets (125% To 150% Pot) When In-Position Or Out-Of-Position Callers Cap Their Ranges.',
          'Adjust To 3-Blind Straddle Games ($5/$10/$20) And Timed Seat-Fee Economics.',
        ],
        recommendedLinks: [
          { label: '$5/$10+ High-Stakes Cash Guide', href: '/learn/stakes/5-10-high-stakes-live-nlh' },
          { label: 'Complete Poker Math Reference', href: '/learn/poker-math' },
          { label: 'Live Cash Rake Impact Calculator', href: '/tools/rake-calculator' },
        ],
      },
      {
        phase: 'Months 5 - 6: Controlled Shot-Taking, Game Selection & Pro Operations',
        objective: 'Establish Permanent Residency At $2/$5 And $5/$10 With Zero Risk Of Ruin.',
        actionItems: [
          'Execute Peak-Traffic Weekend Shot-Taking At $5/$10 With A Strict 4-Buy-In Stop-Loss Rule.',
          'Optimize Regional Venue Selection Across Las Vegas, Los Angeles, Texas, Or Florida Cardrooms.',
          'Maintain Detailed Session Logs, Comps Maximization, And State/Federal Tax Documentation.',
        ],
        recommendedLinks: [
          { label: 'US State Poker Legality & Tax Hub', href: '/poker-rooms/states' },
          { label: 'Casino Comps & Tipping Guide', href: '/poker-rooms/comps-and-tipping-guide' },
          { label: '12 US Regional Poker Market Guides', href: '/poker-rooms/guides' },
        ],
      },
    ],
    faqs: [
      {
        q: 'What Is The Biggest Strategic Jump Between $1/$3 And $2/$5 / $5/$10 Live?',
        a: 'At $1/$3, Opponents Rarely Punish Capped Ranges Or 3-Bet Light. At $2/$5 And $5/$10, Competent Regulars Will 3-Bet Your Opens At 9% To 12% Frequency And Barrel Turn And River Scare Cards Whenever You Check-Call And Cap Your Range.',
      },
      {
        q: 'How Big Should My Bankroll Be Before Going Full-Time At $2/$5?',
        a: 'Hold At Least 30 To 40 Buy-Ins ($25,000 To $40,000) Plus A Separate 6-Month Personal Living Expense Reserve Outside Your Poker Bankroll.',
      },
    ],
  },
  {
    slug: 'weekend-mtt-player-to-circuit-grinder',
    code: 'Track 03: Weekend MTT To Circuit Grinder',
    name: 'Weekend Tournament Player To WSOP & WPT Circuit Grinder',
    title: 'Weekend Tournament Player To WSOP & WPT Circuit Grinder Roadmap',
    h1: 'Weekend MTT Player To WSOP & WPT Circuit Grinder Progression Roadmap',
    duration: '120 Days (Tournament Series Cycle)',
    startingPoint: 'Local Daily / Weekend Tournament Player Looking To Stop Bubbling Deep Runs',
    graduationGoal: '40% - 75% ROI Circuit Grinder Mastering Short-Stack BBA & Final Table ICM',
    summary:
      'Turn Occasional Deep Tournament Runs Into Consistent Final Table Trophies And WSOP/WPT Circuit Rings By Mastering Stack-Depth Inflection Points (100BB Early Play, 25BB Re-Steals, 12BB Push-Fold, And Final Table ICM Bubble Leverage).',
    milestones: [
      {
        phase: 'Phase 1: Big Blind Ante (BBA) Math & Stack-Depth Zones (60BB To 25BB)',
        objective: 'Accumulate Chips Without Spewing During Early And Middle Blind Levels.',
        actionItems: [
          'Adjust Opening And Big Blind Defense Ranges For The Extra 1BB Dead Ante In Big Blind Ante Formats.',
          'Master The 22BB To 30BB 3-Bet Re-Steal All-In Zone Using Suited Aces And Pocket Pairs.',
          'Select Low-Rake Deepstack Weekend Events And Circuit Flights Over High-Rake Turbo Dailies.',
        ],
        recommendedLinks: [
          { label: 'Live MTT Grinder Tier Guide', href: '/learn/stakes/daily-and-circuit-mtts' },
          { label: '10 Major Poker Series Guides', href: '/poker-series/guides' },
          { label: 'M Ratio & Tournament Survival Tool', href: '/tools/m-ratio-calculator' },
        ],
      },
      {
        phase: 'Phase 2: 8BB To 18BB Push-Fold Charts & Bounty (PKO / Mystery) Math',
        objective: 'Make Unexploitable Short-Stack Shoves And Calibrate Bounty Call Discounts.',
        actionItems: [
          'Memorize 10BB And 15BB Nash Push-Fold Equilibrium Ranges From Every Table Position.',
          'Calculate Exact Chip-Value Conversions For Progressive Knockout (PKO) And Mystery Bounty Tokens.',
          'Punish Passive Live Bubble Play By Stealing Relentlessly Against Medium Stacks.',
        ],
        recommendedLinks: [
          { label: 'Push-Fold Short-Stack Chart Tool', href: '/tools/push-fold-chart' },
          { label: 'PKO & Bounty Equity Calculator', href: '/tools/bounty-calculator' },
          { label: 'Printable Push-Fold Cheat Sheets', href: '/learn/cheat-sheets' },
        ],
      },
      {
        phase: 'Phase 3: Final Table ICM Risk Premiums & Chop Negotiation',
        objective: 'Convert Final Table Appearances Into Top-Three Payouts And Trophies.',
        actionItems: [
          'Compute ICM Risk Premiums At 9-Max Through 3-Handed Final Tables Before Calling All-Ins.',
          'Use Covering-Stack Leverage To Apply Maximum Pay-Jump Pressure On Middling Stacks.',
          'Run Exact ICM And Chip-Chop Deal Numbers On Your Phone Before Accepting Any Final Table Chop.',
        ],
        recommendedLinks: [
          { label: 'ICM Final Table Payout Calculator', href: '/tools/icm-calculator' },
          { label: 'Tournament Chop Deal Calculator', href: '/tools/tournament-chop-calculator' },
          { label: 'Fedor Holz ICM Masterclass Breakdown', href: '/learn/famous-hands/holz-vs-bomo-one-drop-final-table-icm' },
        ],
      },
    ],
    faqs: [
      {
        q: 'Why Do So Many Players Min-Cash Tournaments But Rarely Make Top Three?',
        a: 'Most Recreational Tournament Players Tighten Up Around 15BB To 25BB Just To Survive The Money Bubble, Entering The In-The-Money Phase With 8BB Instead Of Using 20BB Re-Steal Shoves And Bubble Pressure To Build A Top-Three Stack.',
      },
      {
        q: 'How Many Buy-Ins Do I Need To Grind A Regional Circuit Series?',
        a: 'Maintain 100 To 150 Average Tournament Buy-Ins Across Your Schedule, And Sell Or Swap 20% To 40% Action On High-Roller Or Main Event Shots That Exceed 2% Of Your Total Roll.',
      },
    ],
  },
  {
    slug: 'nlh-player-to-pot-limit-omaha-specialist',
    code: 'Track 04: Hold\'em To PLO4 & PLO5 Specialist',
    name: 'Hold\'em Player To Winning PLO4 & PLO5 Specialist',
    title: 'No-Limit Hold\'em Player To Winning Pot-Limit Omaha (PLO) Roadmap',
    h1: 'Hold\'em Player To Winning 4-Card & 5-Card Pot-Limit Omaha (PLO) Roadmap',
    duration: '60 Days',
    startingPoint: 'Experienced No-Limit Hold\'em Player Transitioning To 4-Card & 5-Card PLO',
    graduationGoal: 'Winning Live & Club PLO Specialist (+15 To +25 BB/Hr) With 50-Buy-In Roll',
    summary:
      'Break The Dangerous Hold\'em Habits That Destroy New Omaha Players (Over-Playing Bare AAxx, Calling With Non-Nut Flushes, And Ignoring Wrap Combinatorics) To Unlock The Highest Hourly Winrates In Modern Poker.',
    milestones: [
      {
        phase: 'Phase 1: Pot-Limit Betting Mechanics, Double-Suitedness & Connectedness',
        objective: 'Master The Exact 3x-Plus-Trail Pot-Size Raise Formula And 4-Card Hand Selection.',
        actionItems: [
          'Master Instant Pot-Size Bet Calculation (3x The Last Bet Plus All Trailing Money In The Pot).',
          'Prioritize 4-Card Synergy: Double-Suited Rundowns (J-T-9-8ss), High Pairs With Suited Sidecards (A-A-J-Tss), And Zero Danglers.',
          'Fold Single-Suited Or Rainbow Trash Aces (A-A-8-3 Rainbow) Facing Heavy Multiway Action.',
        ],
        recommendedLinks: [
          { label: 'Pot-Limit Omaha Game Rules & Guide', href: '/games/pot-limit-omaha' },
          { label: 'Live PLO Cash Stake Strategy', href: '/learn/stakes/live-pot-limit-omaha' },
          { label: '5-Card PLO Strategy Guide', href: '/games/5-card-plo' },
        ],
      },
      {
        phase: 'Phase 2: 13-Out, 17-Out & 20-Out Wrap Combinatorics & Redraw Equity',
        objective: 'Never Draw Dead Or Dominated In Multiway Omaha Pots.',
        actionItems: [
          'Distinguish Between A 9-Out Inside Wrap, 13-Out Standard Wrap, 17-Out Around-The-Post Wrap, And 20-Out Monster Wrap.',
          'Draw Exclusively To The Nut Flush Multiway: Fold King-High Or Queen-High Flush Draws When Multiple Opponents Contest The Pot.',
          'Value Freeroll And Redraw Equity: Never Stack Off On The Flop With A Bare Straight When Your Opponent Has The Same Straight Plus A Flush Redraw.',
        ],
        recommendedLinks: [
          { label: 'Out-To-Equity & Draw Calculator', href: '/tools/out-to-equity-calculator' },
          { label: 'SPR Stack-To-Pot Ratio Calculator', href: '/tools/spr-calculator' },
          { label: 'Complete Poker Math Formulas', href: '/learn/poker-math' },
        ],
      },
      {
        phase: 'Phase 3: Nut-Blocker River Bluffs, PLO5 Adjustments & 50-BI Variance Control',
        objective: 'Dominate Deep-Stack Live $1/$2/$5 And $5/$5 PLO Games.',
        actionItems: [
          'Use The Bare Nut-Flush Blocker (Ace Of The Flush Suit Without A Second Suited Card) To Execute High-Leverage River Pot Bluffs.',
          'Tighten Preflop Requirements Even Further In 5-Card PLO Where 10 Combinations Of Two-Card Hands Exist Per Player.',
          'Enforce A Strict 45-To-50 Buy-In Bankroll Rule To Weather Inevitable 60/40 All-In Swings.',
        ],
        recommendedLinks: [
          { label: 'Bankroll & Risk Of Ruin Calculator', href: '/tools/bankroll-calculator' },
          { label: 'Variance Simulator Tool', href: '/tools/variance-simulator' },
          { label: 'Big O (5-Card Hi-Lo) Rules', href: '/games/big-o' },
        ],
      },
    ],
    faqs: [
      {
        q: 'Why Are Winrates So Much Higher In Live PLO Than In Live No-Limit Hold\'em?',
        a: 'Recreational Players Bring Hold\'em Intuition To PLO, Routinely Stacking Off With Non-Nut Flushes, Bottom Sets, And Unimproved AAxx Hands Drawing To 15% Equity Against Nut Wraps And Redraws.',
      },
      {
        q: 'How Does 5-Card PLO (PLO5) Change Starting Hand Values Compared To 4-Card PLO?',
        a: 'Adding A Fifth Hole Card Increases Every Player\'s Two-Card Combinations From 6 To 10 (A 67% Jump), Making Nut Suits And Full-House Redraws Mandatory On Nearly Every Board.',
      },
    ],
  },
  {
    slug: 'home-game-host-to-club-commander-director',
    code: 'Track 05: Home Game Host To Club Director',
    name: 'Home Game Host To Thriving Club Arena & Commander Director',
    title: 'Home Game Host To Club Arena & Club Commander Director Roadmap',
    h1: 'Home Game Host To Thriving Club Arena & Poker Room Director Roadmap',
    duration: '30 Days',
    startingPoint: 'Weekly Home Game Organizer Or Aspiring Card Club Operator',
    graduationGoal: 'Automated Multi-Table Club Using Club Arena & Club Commander Floor Tools',
    summary:
      'Scale A Casual Kitchen-Table Home Game Into A Professional, Dispute-Free Poker Community With Standardized TDA Rules, Optimal Chip Denominations, Automated Blind Clocks, Waitlist SMS Notifications, And Digital Club Arena Tables.',
    milestones: [
      {
        phase: 'Week 1: Chip Denominations, Blind Structures & House Rulebook',
        objective: 'Eliminate Slowdowns, Chip-Change Delays, And Floor Disputes Before Card One Is Dealt.',
        actionItems: [
          'Configure A Clean 4-Denomination Chip Set (35% Lowest Chip, 35% Workhorse Chip, 20% Medium Chip, 10% High Chip) With 35 To 45 Physical Chips Per Player.',
          'Publish Clear House Rules Covering The Single Oversized Chip Rule, Binding Verbal Declarations, And Show-One-Show-All.',
          'Design Smooth 15-To-20 Minute Blind Levels With A Big Blind Ante To Keep Tournament Pace Brisk.',
        ],
        recommendedLinks: [
          { label: 'Official TDA & House Rules Encyclopedia', href: '/rules' },
          { label: 'Printable Chip Breakdown Cheat Sheet', href: '/learn/cheat-sheets' },
          { label: 'Tournament Blind Structure Calculator', href: '/tools/blind-structure-calculator' },
        ],
      },
      {
        phase: 'Week 2: Digital Tournament Clocks, Seating Randomization & Chop Tools',
        objective: 'Run Every Cash And Tournament Session Like A Las Vegas Strip Cardroom.',
        actionItems: [
          'Project A Live Tournament Clock Display With Audible Blind Alerts And Color-Up Break Timers.',
          'Automate Table Balancing, Seat Draws, And Final Table ICM / Chip-Chop Calculations.',
          'Introduce Exciting Action Formats Like Bomb Pots, Double-Board PLO Bomb Pots, And The 7-2 Game.',
        ],
        recommendedLinks: [
          { label: 'Double-Board Bomb Pot Guide', href: '/games/double-board-bomb-pot' },
          { label: '7-2 Bounty Side Game Rules', href: '/games/7-2-game' },
          { label: 'Tournament Chop Calculator', href: '/tools/tournament-chop-calculator' },
        ],
      },
      {
        phase: 'Weeks 3 - 4: Launching Your Private Club Arena & Club Commander Ecosystem',
        objective: 'Keep Your Player Pool Connected 24/7 Across Live Nights And Online Club Tables.',
        actionItems: [
          'Launch Your Private Smarter.Poker Club Arena Hub So Members Can Play NLH, PLO4, PLO5, And Tournaments Between Live Sessions.',
          'Deploy Club Commander For Live Waitlist Management, Table Tracking, And Member Announcements.',
          'Run Seasonal Leaderboards And Championship Series To Retain Players Year-Round.',
        ],
        recommendedLinks: [
          { label: 'Explore Club Arena', href: '/hub/club-arena' },
          { label: 'Club Commander Management Suite', href: '/commander' },
          { label: 'All 25 Poker Game Variants', href: '/games' },
        ],
      },
    ],
    faqs: [
      {
        q: 'How Many Physical Poker Chips Do I Need For A 9-Handed Home Game?',
        a: 'A 500-Chip Set Easily Supports A 9-To-10 Player Cash Game Or Tournament, Providing 40 To 50 Physical Chips Per Player Across Four Denominations Without Cluttering The Felt.',
      },
      {
        q: 'Why Should Home Game Tournaments Use A Big Blind Ante Instead Of Traditional Antes?',
        a: 'Collecting Individual Antes From Every Player Slows Down A Self-Dealt Or Single-Dealer Home Game By 25%+. Having The Big Blind Post One Single Ante For The Entire Table Doubles Hands Dealt Per Level.',
      },
    ],
  },
];
