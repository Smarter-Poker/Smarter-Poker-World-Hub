/**
 * Smarter.Poker Poker Research Pages
 * ==================================
 * Fifteen research and reference pages. Each one declares the basis of its
 * figures (computed, statute, directory or editorial) and shows its sources.
 *
 * House style: Title Case, zero em dashes.
 */
import {
  TOURNAMENT_SNAPSHOT_READ_AT,
  TOURNAMENT_SNAPSHOT_WEEK_START,
  TOURNAMENT_SNAPSHOT_WEEK_END,
  TOURNAMENT_WEEK_EVENTS,
  TOURNAMENT_WEEK_VENUES,
  TOURNAMENT_WEEK_STATES,
  TOURNAMENT_WEEK_MEDIAN_BUY_IN,
  TOURNAMENT_WEEK_MIN_BUY_IN,
  TOURNAMENT_WEEK_MAX_BUY_IN,
  TOURNAMENT_WEEK_BY_TIER,
  tierShareLabel,
} from '../../lib/research/tournamentDirectoryFacts.mjs';
import {
  SHORT_DECK_STARTING_COMBOS,
  FULL_DECK_STARTING_COMBOS,
  SHORT_DECK_DISTINCT_HANDS,
  FULL_DECK_DISTINCT_HANDS,
  SHORT_DECK_SEVEN_CARD_SETS,
  SHORT_DECK_FLUSH_PCT,
  SHORT_DECK_FULL_HOUSE_PCT,
  FULL_DECK_FLUSH_PCT,
  FULL_DECK_FULL_HOUSE_PCT,
  POKER_PROBABILITY_SOURCE_URL,
  SHORT_DECK_AA_PCT,
  FULL_DECK_AA_PCT,
  FULL_DECK_AA_VS_JTS,
  SHORT_DECK_AA_VS_JTS_STRAIGHT_BEATS_TRIPS,
  SHORT_DECK_AA_VS_JTS_TRIPS_BEAT_STRAIGHT,
  FULL_DECK_OESD_FLOP_TO_RIVER,
  SHORT_DECK_OESD_FLOP_TO_RIVER,
  FULL_DECK_FLUSH_DRAW_FLOP_TO_RIVER,
  SHORT_DECK_FLUSH_DRAW_FLOP_TO_RIVER,
  pct,
} from '../../lib/research/shortDeckFacts.mjs';

export const RESEARCH_BASE_PATH = '/research';
export const RESEARCH_DATASET_DOI = '10.5281/zenodo.24115647';
export const RESEARCH_DATASET_DOI_URL = 'https://doi.org/10.5281/zenodo.24115647';
export const RESEARCH_DATASET_ZENODO_URL = 'https://zenodo.org/records/24115647';
export const RESEARCH_DATASET_SWHID = 'swh:1:snp:ff23640ad24a3a825d320bae8621fd50ba58c16f';

/**
 * The Zenodo deposit (2026-11-10) is a copy of these pages as they read then.
 * It holds the page text and tables only, no survey responses, hand
 * histories or simulation output, and it predates the 2026-11-28 corrections,
 * so it is an archive, not a source for any figure.
 */
export const RESEARCH_ARCHIVE_NOTE =
  'The Archive Holds Page Text Only, No Raw Survey Or Hand Data, And Predates The 2026-11-28 Corrections; The Figures On This Page Supersede It.';

export function researchPath(slug) {
  return `${RESEARCH_BASE_PATH}/${slug}`;
}

/*
 * Every figure on these pages has a stated basis (see RESEARCH_BASIS below),
 * and __tests__/the-research-figures-are-real.law.test.mjs holds them to it.
 *
 * On 2026-11-28 the reports were read against the repository, the database
 * and the Zenodo deposit they cite. The deposit is a self-archived copy of
 * this same text (about 10 KB of JSON per report): it holds no survey
 * responses, no hand histories, no waitlist logs and no simulation output.
 * No survey, hand-history audit, dealer study, waitlist telemetry study or
 * simulation behind the old figures exists anywhere in the repo or the
 * database. Those pages are therefore editorial guides: they explain how a
 * thing works and state no measured figure. Figures stay only where they are
 * arithmetic the test recomputes, a statute or IRS rule with its citation, or
 * a database read pinned in src/lib/research/.
 */
export const RESEARCH_BASIS = Object.freeze({
  computed: 'Computed Mathematics: Every Figure Is Exact Arithmetic Or Full Enumeration That Anyone Can Recompute.',
  statute: 'Federal Statute And IRS Rules: Every Threshold Is Quoted From The Cited Primary Source.',
  directory: 'Smarter.Poker Directory Data: Every Figure Is A Dated Read Of The Live Tournament Directory.',
  editorial: 'Editorial Guide: No Survey, Audit Or Simulation Was Run For This Page, So It States No Measured Figures.',
});

const EDITORIAL_METHOD =
  'Editorial Guide Written From Published House Rules, Game Rules And Standard Poker Strategy Principles. No Survey, Audit, Hand-History Sample Or Simulation Was Run, So This Page States No Survey Results Or Measured Frequencies.';

const W2G_SOURCE = { label: 'IRS Instructions For Forms W-2G And 5754', url: 'https://www.irs.gov/instructions/iw2g' };
const PUB_529_SOURCE = { label: 'IRS Topic 419, Gambling Income And Losses', url: 'https://www.irs.gov/taxtopics/tc419' };
const OBBBA_SOURCE = { label: 'Public Law 119-21 (H.R. 1, 119th Congress), Amending IRC Section 165(d)', url: 'https://www.congress.gov/bill/119th-congress/house-bill/1' };
const CTR_SOURCE = { label: 'FinCEN Currency Transaction Report (FinCEN Form 112)', url: 'https://www.fincen.gov/resources/filing-information' };

const RAW_RESEARCH_REPORTS = [
  {
    slug: 'us-live-poker-room-rake-and-jackpot-benchmark',
    title: 'US Live Poker Room Rake Structures And Jackpot Drop Guide',
    shortTitle: 'US Live Poker Rake And Jackpot Drop Guide',
    publishedDate: '2026-10-01',
    modifiedDate: '2026-11-28',
    category: 'Live Cardroom Economics',
    basis: 'editorial',
    sources: [],
    summary:
      'How US Live Poker Rooms Collect Rake: Percentage Pot Rake With A Per-Hand Cap, Flat Per-Hand Drops In California, Time Collection At Higher Stakes, And Seat Fees In Texas Clubs.',
    methodology: EDITORIAL_METHOD,
    keyFindings: [
      'Most Commercial And Tribal Rooms Take A Percentage Of Each Pot Up To A Fixed Cap, And Many Add A Separate Promotional Drop That Funds Bad Beat Jackpots And High-Hand Prizes.',
      'California Card Rooms Collect A Flat Fee Per Hand Instead Of A Percentage, Because State Law Bars The House From Taking A Share Of The Pot.',
      'Higher-Stakes Games Often Switch To Time Collection, A Fixed Charge Per Half Hour, Which Costs Less Per Hand Than Pot Rake Once Games Get Fast And Pots Get Large.',
      'Texas And Oregon Social Clubs Take Nothing From The Pot And Charge Membership Or Seat Fees Instead.',
      'House Rules Vary By Room And Change Often, So Check The Posted Rake Schedule At The Room Before You Sit.',
    ],
    table: {
      caption: 'How Each US Rake Model Works',
      columns: ['Region / Model', 'Rake Mechanism', 'Promotional Drop', 'What It Means For You'],
      rows: [
        ['Nevada And Most Commercial Casinos', 'Percentage Pot Rake To A Cap', 'Varies By Room', 'Small Pots Pay A Full Percentage; Large Pots Hit The Cap'],
        ['California Card Rooms', 'Flat Collection Per Hand', 'Often A Separate Jackpot Drop', 'The Fee Is The Same In A Small Pot As In A Large One'],
        ['Tribal Properties', 'Percentage Pot Rake To A Cap', 'Common', 'Read The Posted Schedule; Tribal Rules Differ By Compact'],
        ['Texas And Oregon Social Clubs', 'Membership And Seat Fees', 'None From The Pot', 'You Pay For Time Whether You Win Pots Or Not'],
        ['Higher-Stakes Time Games', 'Fixed Charge Per Half Hour', 'None From The Pot', 'Cheaper Per Hand When The Game Runs Fast'],
      ],
    },
    faq: [
      {
        q: 'How Is Rake Taken In A Live Low-Stakes Poker Game?',
        a: 'Most US Casinos Take A Percentage Of Each Pot Up To A Posted Cap, Often Plus A Promotional Drop For Jackpots. California Rooms Charge A Flat Fee Per Hand, And Texas Clubs Charge Seat Time Instead Of Raking The Pot. The Exact Numbers Are Posted By Each Room.',
      },
      {
        q: 'Why Do Higher-Stakes Games Use Time Rake Instead Of Pot Rake?',
        a: 'A Fixed Half-Hour Charge Does Not Grow With The Pot, So In Fast Games With Large Pots It Costs Players Less Per Hand Than A Percentage Rake That Reaches Its Cap On Most Hands.',
      },
    ],
  },
  {
    slug: 'daily-poker-tournament-buy-in-and-guarantee-index',
    title: 'Daily Live Poker Tournament Buy-In Index From The Smarter.Poker Directory',
    shortTitle: 'Daily Poker Tournament Buy-In Index',
    publishedDate: '2026-10-01',
    modifiedDate: TOURNAMENT_SNAPSHOT_READ_AT,
    category: 'Tournament Structure Analytics',
    basis: 'directory',
    sources: [{ label: 'Smarter.Poker Daily Tournament Directory', url: 'https://smarter.poker/hub/daily-tournaments' }],
    sampleSize: `${TOURNAMENT_WEEK_EVENTS} Scheduled Events At ${TOURNAMENT_WEEK_VENUES} Venues (${TOURNAMENT_SNAPSHOT_WEEK_START} To ${TOURNAMENT_SNAPSHOT_WEEK_END})`,
    summary:
      `The Smarter.Poker Tournament Directory Listed ${TOURNAMENT_WEEK_EVENTS} Live Events At ${TOURNAMENT_WEEK_VENUES} Venues In ${TOURNAMENT_WEEK_STATES} States For The Week Of ${TOURNAMENT_SNAPSHOT_WEEK_START}, With A Median Buy-In Of ${TOURNAMENT_WEEK_MEDIAN_BUY_IN}.`,
    methodology:
      `A Read-Only Count Of Every Event The Directory Served For ${TOURNAMENT_SNAPSHOT_WEEK_START} Through ${TOURNAMENT_SNAPSHOT_WEEK_END}, Read On ${TOURNAMENT_SNAPSHOT_READ_AT}. Buy-Ins Are In US Dollars As Listed By Each Venue. The Directory Records No House Fee, Blind Level Or Starting Stack On These Rows, So No Fee Or Structure Figure Is Stated.`,
    keyFindings: [
      `${TOURNAMENT_WEEK_EVENTS} Live Tournaments At ${TOURNAMENT_WEEK_VENUES} Venues Across ${TOURNAMENT_WEEK_STATES} States Were Listed For The Week Of ${TOURNAMENT_SNAPSHOT_WEEK_START} To ${TOURNAMENT_SNAPSHOT_WEEK_END}.`,
      `The Median Listed Buy-In Was ${TOURNAMENT_WEEK_MEDIAN_BUY_IN}, With Buy-Ins Running From ${TOURNAMENT_WEEK_MIN_BUY_IN} To ${TOURNAMENT_WEEK_MAX_BUY_IN.toLocaleString('en-US')}.`,
      `${tierShareLabel(TOURNAMENT_WEEK_BY_TIER[0].events)} Of The Week's Events Had A Buy-In Under 100, And ${tierShareLabel(TOURNAMENT_WEEK_BY_TIER[3].events + TOURNAMENT_WEEK_BY_TIER[4].events)} Were 300 Or More.`,
      'The Directory Does Not Record House Fees, So This Index Makes No Claim About Rake Or Fee Percentages. Check Each Event\'s Structure Sheet For Its Fee.',
    ],
    table: {
      caption: `Listed Live Tournaments By Buy-In Tier, ${TOURNAMENT_SNAPSHOT_WEEK_START} To ${TOURNAMENT_SNAPSHOT_WEEK_END}`,
      columns: ['Buy-In Tier', 'Listed Events', 'Share Of The Week'],
      rows: TOURNAMENT_WEEK_BY_TIER.map((t) => [t.tier, String(t.events), tierShareLabel(t.events)]),
    },
    faq: [
      {
        q: 'How Many Live Poker Tournaments Does Smarter.Poker List In A Week?',
        a: `For The Week Of ${TOURNAMENT_SNAPSHOT_WEEK_START} To ${TOURNAMENT_SNAPSHOT_WEEK_END} The Directory Listed ${TOURNAMENT_WEEK_EVENTS} Events At ${TOURNAMENT_WEEK_VENUES} Venues In ${TOURNAMENT_WEEK_STATES} States. The Count Changes Every Week As Venues Publish Schedules.`,
      },
      {
        q: 'Where Can I Filter Daily Tournaments By Guarantee And Buy-In?',
        a: 'Use The Smarter.Poker Daily Tournament Directory At https://smarter.poker/hub/daily-tournaments To Filter Events By Day, Buy-In, Guarantee, And State.',
      },
    ],
  },
  {
    slug: 'gto-vs-population-preflop-and-postflop-leak-study',
    title: 'GTO Bet-Sizing Math And Common Population Leaks Guide',
    shortTitle: 'GTO Bet-Sizing Math And Common Leaks',
    publishedDate: '2026-10-01',
    modifiedDate: '2026-11-28',
    category: 'Game Theory Optimal Research',
    basis: 'computed',
    sources: [],
    summary:
      'The Exact Defense And Bluffing Frequencies Each Bet Size Implies, Plus Five Leaks Coaches Commonly See: Cold-Calling Too Much, Passive Big Blind Defense, Multiway C-Bets, Turn Give-Ups, And River Calls.',
    methodology:
      'The Frequencies In The Table Are Exact Arithmetic From The Bet Size: Minimum Defense Frequency Is Pot / (Pot + Bet) And The Balanced River Bluff Share Is Bet / (Pot + 2 x Bet). The Leak Descriptions Are Editorial Coaching Observations; No Hand-History Sample Was Measured, So No Population Frequency Is Stated.',
    keyFindings: [
      'Facing A Pot-Sized Bet, A Defender Must Continue With 50% Of Their Range To Stop Any Two Cards Profiting, And A Balanced Bettor Bluffs 33.3% Of The Time.',
      'Facing A 125% Pot River Overbet, A Balanced Range Contains 35.7% Bluffs, So A Bluff-Catcher Needs To Win 35.7% Of The Time To Call.',
      'A Common Preflop Leak Is Cold-Calling Opens From Early And Middle Position With Dominated Offsuit Broadways Instead Of 3-Betting Or Folding.',
      'A Common River Leak Is Calling Big Bets With One Pair Against Opponents Who Rarely Bluff, Where Folding More Often Than The Defense Frequency Is The Exploit.',
    ],
    table: {
      caption: 'Exact Defense And Bluff Frequencies By Bet Size',
      columns: ['Bet Size (Fraction Of Pot)', 'Minimum Defense Frequency', 'Balanced River Bluff Share', 'Equity Needed To Call'],
      rows: [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2].map((b) => [
        `${Math.round(b * 100)}% Pot`,
        `${(100 / (1 + b)).toFixed(1)}%`,
        `${((100 * b) / (1 + 2 * b)).toFixed(1)}%`,
        `${((100 * b) / (1 + 2 * b)).toFixed(1)}%`,
      ]),
    },
    faq: [
      {
        q: 'What Is The Biggest Preflop Leak In Low-Stakes No-Limit Hold\'em?',
        a: 'Coaches Most Often Point To Cold-Calling Open Raises With Dominated Offsuit Broadways Such As KJo, QJo And ATo Instead Of 3-Betting Or Folding. This Is An Editorial Observation, Not A Measured Frequency.',
      },
      {
        q: 'How Can I Audit My Own Hands For GTO Leaks For Free?',
        a: 'Use PokerBrain And The Jarvis AI Hand Analyzer At https://smarter.poker/features/poker-ai-coach Or Practice Interactive Scenarios At https://smarter.poker/hub/training.',
      },
    ],
  },
  {
    slug: 'private-poker-club-software-and-platform-economics',
    title: 'Private Poker Club Platform Architecture And Hosting Cost Guide',
    shortTitle: 'Private Poker Club Platform Guide',
    publishedDate: '2026-10-01',
    modifiedDate: '2026-11-28',
    category: 'Platform Architecture & Club Operations',
    basis: 'editorial',
    sources: [],
    summary:
      'How Browser-Based Private Poker Clubs Differ From App-Based Club Apps: No App Store Download, No Paid Table Credits To Host, Built-In Table Video, And Automated Union Ledgers.',
    methodology:
      'Feature Comparison Of How Each Kind Of Platform Delivers Its Client, Charges Hosts And Keeps Club Accounts. It Describes Product Features; No Survey Or Cost Measurement Was Run, So It States No Measured Figures.',
    keyFindings: [
      'Browser Tables Run In Mobile Safari, Android Chrome And Desktop Browsers Without An App Store Download.',
      'Many App-Based Club Platforms Charge Hosts In Consumable In-App Credits To Open Tables Or Unlock Features; Smarter.Poker Club Arena Does Not Charge Hosts To Create A Club Or Open A Table.',
      'Table Video And Voice Built Into The Felt Replace A Separate Discord Or Zoom Window.',
      'Club Arena Keeps Club And Agent Balances In An Automated Ledger Instead Of A Weekly Spreadsheet.',
    ],
    table: {
      caption: 'Private Poker Club Architecture Comparison',
      columns: ['Architectural Dimension', 'Smarter.Poker Club Arena', 'App-Based Club Apps', 'Subscription Club Platforms'],
      rows: [
        ['Client Delivery Model', 'Web Browser (iOS, Android, Desktop)', 'Mobile App Download', 'Native App Or Desktop Client'],
        ['Club Creation & Table Hosting', 'No Host Charge', 'Paid In-App Credits On Many Apps', 'Monthly Per-Player Or Host Fee'],
        ['Table Video & Voice Chat', 'Built In At The Table', 'Usually An External App', 'Varies'],
        ['Multi-Club Union Accounting', 'Automated Ledger', 'Often Manual Spreadsheets', 'Varies'],
        ['Real-Money Wagering Policy', 'Play Credits With No Cash Value', 'Varies By Operator', 'Varies By Operator'],
      ],
    },
    faq: [
      {
        q: 'Do Private Poker Club Members Need To Download An App On Smarter.Poker?',
        a: 'No. Smarter.Poker Club Arena Runs Inside Mobile Safari, Chrome, And Desktop Browsers.',
      },
      {
        q: 'Are Club Chips On Smarter.Poker Redeemable For Cash?',
        a: 'No. Smarter.Poker Is A Free-To-Play Social Poker And Training Platform. Club Chips Are Play Credits With No Cash Value, And Diamonds Are Promotional Rewards Currency.',
      },
    ],
  },
  {
    slug: 'poker-dealer-toke-and-hourly-rate-benchmark',
    title: 'US Casino Poker Dealer Tokes, Downs, And Earnings Guide',
    shortTitle: 'US Poker Dealer Tokes And Earnings Guide',
    publishedDate: '2026-10-01',
    modifiedDate: '2026-11-28',
    category: 'Cardroom Labor & Dealer Analytics',
    basis: 'editorial',
    sources: [],
    summary:
      'How Poker Dealers Are Paid: What A Down Is, How Cash Game Tokes Differ From Pooled Tournament Downs, What Changes Toke Income, And Why Dealers Should Log Every Shift.',
    methodology: EDITORIAL_METHOD,
    keyFindings: [
      'Dealers Work In Downs: A Fixed Stint At One Table Before Rotating To The Next Table Or A Break. Rooms Set Their Own Down Length And Rotation.',
      'Cash Game Tokes Are Paid Directly By Players Per Pot, While Tournament Dealers Are Usually Paid From A Pooled Staff Allocation Split By Downs Worked.',
      'Game Speed, Stakes, Table Fullness And Promotions All Change How Many Tokes A Down Produces, So Earnings Vary Widely By Room And Shift.',
      'Tokes Are Taxable Income, So Logging Cash Tokes, Pooled Shares And Base Pay Every Shift Makes Year-End Filing Simpler.',
    ],
    table: {
      caption: 'How Dealer Pay Works By Game Format',
      columns: ['Table Format', 'How Tokes Are Paid', 'What Raises Toke Income', 'What To Log'],
      rows: [
        ['Low-Stakes NLH Cash', 'Per Pot, Directly By Players', 'Full Tables And Fast Dealing', 'Cash Tokes Per Down'],
        ['Mid And High-Stakes NLH Cash', 'Per Pot, Directly By Players', 'Larger Pots', 'Cash Tokes Per Down'],
        ['PLO Cash', 'Per Pot, Directly By Players', 'Larger Average Pots', 'Cash Tokes Per Down'],
        ['Daily House Tournaments', 'Pooled Staff Allocation', 'Larger Fields', 'Downs Worked And Pool Share'],
        ['Series Events', 'Series Pool Split By Downs', 'Field Size And Event Count', 'Downs Worked And Pool Share'],
      ],
    },
    faq: [
      {
        q: 'What Is A Down In Poker Dealing?',
        a: 'A Down Is A Single Rotation Spent Dealing At One Poker Table Before Moving To The Next Table Or A Break. Each Room Sets Its Own Down Length.',
      },
      {
        q: 'How Can Poker Dealers Track Tokes Per Down For Free?',
        a: 'Use The Smarter.Poker Dealer Toke Tracker At https://smarter.poker/features/poker-dealer-toke-tracker To Log Cash Downs, Tournament Downs, Hourly Rates, And Multi-Venue Shifts For Free.',
      },
    ],
  },
  {
    slug: 'tournament-icm-bubble-factor-and-risk-premium-study',
    title: 'Tournament ICM Bubble Factor And Required Calling Equity Math',
    shortTitle: 'ICM Bubble Factor And Calling Equity Math',
    publishedDate: '2026-10-01',
    modifiedDate: '2026-11-28',
    category: 'Tournament Game Theory & ICM',
    basis: 'computed',
    sources: [],
    summary:
      'Bubble Factor Turns Tournament Risk Into A Calling Threshold: With Bubble Factor B You Need B / (B + 1) Equity To Call An All-In That Chip-EV Would Call At 50%.',
    methodology:
      'Bubble Factor B Is The Prize Equity Lost When You Bust Divided By The Prize Equity Gained When You Double. Calling Even-Stack All-Ins Needs B / (B + 1) Equity. The Table Is That Formula Evaluated Exactly; Bubble Factors For A Real Spot Come From Running Its Stacks And Payouts Through An ICM Calculator.',
    keyFindings: [
      'At A Bubble Factor Of 1.0 (A Cash Game Or Winner-Take-All Spot) The Required Calling Equity Is 50%.',
      'A Bubble Factor Of 2.0 Means You Lose Twice The Prize Equity By Busting That You Gain By Doubling, So You Need 66.7% Equity To Call.',
      'Bubble Factors Rise With Pay Jumps And With Short Stacks Who Might Bust First, Which Is Why Medium Stacks Tighten Most On The Bubble.',
      'The Big Stack Has The Lowest Bubble Factor Against Medium Stacks, Which Is What Lets It Open And Shove Wider Near The Money.',
    ],
    table: {
      caption: 'Required All-In Calling Equity By Bubble Factor (Exact)',
      columns: ['Bubble Factor', 'Chip-EV Required Equity', 'ICM Required Equity', 'Risk Premium Over Chip-EV'],
      rows: [1, 1.25, 1.5, 1.75, 2, 3, 5, 10].map((bf) => [
        bf.toFixed(2),
        '50.0%',
        `${((100 * bf) / (bf + 1)).toFixed(1)}%`,
        `+${((100 * bf) / (bf + 1) - 50).toFixed(1)}%`,
      ]),
    },
    faq: [
      {
        q: 'What Is Bubble Factor In Poker Tournaments?',
        a: 'Bubble Factor Is The Ratio Of The Prize Equity You Lose When Eliminated To The Prize Equity You Gain When Doubling Up. A Bubble Factor Of 2.0 Means You Need 66.7% Equity To Call An All-In.',
      },
      {
        q: 'Where Can I Calculate Exact Final Table ICM Payouts And Bubble Factors?',
        a: 'Use The Free Smarter.Poker ICM Calculator At https://smarter.poker/tools/icm-calculator Or Practice Interactive Bubble Drills At https://smarter.poker/hub/training/icm-simulator.',
      },
    ],
  },
  {
    slug: 'pot-limit-omaha-plo4-plo5-plo6-equity-and-variance-study',
    title: 'Pot-Limit Omaha (PLO4, PLO5, PLO6) Combinations And Variance Guide',
    shortTitle: 'PLO4 Vs PLO5 Vs PLO6 Combinations & Variance',
    publishedDate: '2026-10-01',
    modifiedDate: '2026-11-28',
    category: 'Omaha Mathematics & Variance',
    basis: 'computed',
    sources: [],
    summary:
      'Exact Starting-Hand Counts For PLO4, PLO5 And PLO6, How Many Two-Card Pairs Each Hand Contains, And Why More Hole Cards Mean Closer Equities, Stronger Nut Hands And Bigger Bankroll Swings.',
    methodology:
      'Hand Counts Are Exact Combinations: C(52,k) Starting Hands And C(k,2) Two-Card Pairs For A k-Card Hand. Equity And Variance Points Are Explained Qualitatively; No Simulation Was Run For This Page, So No Equity Percentage Or Standard Deviation Is Stated.',
    keyFindings: [
      'A PLO4 Hand Contains 6 Two-Card Pairs, A PLO5 Hand 10 And A PLO6 Hand 15, And Every Showdown Hand Must Use Exactly Two Hole Cards And Three Board Cards.',
      'There Are 270,725 Possible PLO4 Starting Hands, 2,598,960 PLO5 Hands And 20,358,520 PLO6 Hands, Against 1,326 In Hold\'em.',
      'Because Each Hand Holds More Combinations, Preflop All-Ins Run Much Closer Than In Hold\'em, And Big Hands Lose Their Edge Faster.',
      'More Hole Cards Make Flushes, Full Houses And Nut Draws More Common At Showdown, So Second-Best Hands Lose More Often In Multiway Pots.',
      'Closer Equities And Pot-Limit All-Ins Make Bankroll Swings Larger In Omaha Than In Hold\'em, So Omaha Players Keep More Buy-Ins In Reserve.',
    ],
    table: {
      caption: 'Hold\'em Vs PLO4, PLO5 And PLO6 Starting-Hand Combinatorics (Exact)',
      columns: ['Game Variant', 'Hole Cards', 'Possible Starting Hands', 'Two-Card Pairs Per Hand', 'Hole Cards Used'],
      rows: [
        ['No-Limit Hold\'em (NLHE)', '2', '1,326', '1', 'Any Number'],
        ['4-Card Pot-Limit Omaha (PLO4)', '4', '270,725', '6', 'Exactly 2'],
        ['5-Card Pot-Limit Omaha (PLO5)', '5', '2,598,960', '10', 'Exactly 2'],
        ['6-Card Pot-Limit Omaha (PLO6)', '6', '20,358,520', '15', 'Exactly 2'],
      ],
    },
    faq: [
      {
        q: 'Why Is Variance Higher In PLO5 And PLO6 Than In Texas Hold\'em?',
        a: 'Because Players Hold 5 Or 6 Hole Cards And Must Use Exactly Two, Each Hand Contains Many More Two-Card Combinations, Preflop Equities Run Closer, And Pot-Limit Betting Gets Stacks In Often.',
      },
      {
        q: 'Where Can I Calculate Exact PLO4, PLO5, And PLO6 Hand Equities For Free?',
        a: 'Use The Free Smarter.Poker Multi-Variant Odds Calculator At https://smarter.poker/tools/poker-odds-calculator To Simulate Hold\'em, PLO4, PLO5, PLO6, Stud, And Razz.',
      },
    ],
  },
  {
    slug: 'us-poker-player-tax-w2g-reporting-and-session-accounting-benchmark',
    title: 'US Poker Player IRS Form W-2G Thresholds, Session Logs, And Loss Deduction Rules',
    shortTitle: 'US Poker Tax W-2G And Session Accounting Rules',
    publishedDate: '2026-10-01',
    modifiedDate: '2026-11-28',
    category: 'Bankroll & Tax Compliance',
    basis: 'statute',
    sources: [W2G_SOURCE, PUB_529_SOURCE, OBBBA_SOURCE, CTR_SOURCE],
    summary:
      'US Casinos Issue Form W-2G When A Poker Tournament Prize Minus The Buy-In Exceeds 5,000 Dollars, And From Tax Year 2026 Only 90% Of Gambling Losses Are Deductible Against Winnings.',
    methodology:
      'Quoted From The IRS Instructions For Forms W-2G And 5754, IRS Topic 419, Internal Revenue Code Section 165(d) As Amended By Public Law 119-21, And FinCEN Currency Transaction Report Rules. This Is General Information, Not Tax Advice.',
    keyFindings: [
      'Form W-2G Tournament Threshold: Casinos Report Poker Tournament Winnings When The Prize Minus The Buy-In Exceeds 5,000 Dollars. 24% Federal Withholding Applies When Winnings Exceed 5,000 Dollars, And Backup Withholding Applies If No Taxpayer ID Is Given.',
      'Cash Games Do Not Produce A W-2G, But Cash Transactions Over 10,000 Dollars In One Gaming Day Require The Casino To File A FinCEN Currency Transaction Report.',
      'Loss Deduction Cap: From Tax Year 2026, IRC Section 165(d) As Amended By Public Law 119-21 Lets You Deduct Only 90% Of Gambling Losses, And Never More Than Your Gambling Winnings.',
      'Records: The IRS Expects A Contemporaneous Log Of Each Session (Date, Place, Game, Amounts Won And Lost) To Support Reported Winnings And Losses.',
    ],
    table: {
      caption: 'US Poker Tax Reporting Thresholds And Documentation (Primary Sources)',
      columns: ['Event / Filing Category', 'Threshold Or Rule', 'IRS / Treasury Form', 'Required Player Documentation'],
      rows: [
        ['Poker Tournament Winnings', 'Over 5,000 Dollars Net Of Buy-In', 'IRS Form W-2G', 'Buy-In Receipt And W-2G Copy'],
        ['Cage Cash In Or Out', 'Over 10,000 Dollars Cash In One Gaming Day', 'FinCEN Form 112 (CTR)', 'Government ID And Matching Ledger Entry'],
        ['Gambling Loss Deduction (Tax Year 2026 On)', '90% Of Losses, Capped At Winnings', 'Schedule A (Itemized)', 'Session-By-Session Log'],
        ['Recreational Player Filing', 'All Gambling Winnings Are Income', 'Form 1040 Schedule 1', 'Session-By-Session Log'],
        ['Professional Player Filing', 'Trade Or Business Of Gambling', 'Form 1040 Schedule C', 'Session Log Plus Expense Receipts'],
      ],
    },
    faq: [
      {
        q: 'When Does A Casino Issue A Form W-2G For A Poker Tournament?',
        a: 'When Your Poker Tournament Prize Minus Your Buy-In Exceeds 5,000 Dollars, Per The IRS Instructions For Forms W-2G And 5754.',
      },
      {
        q: 'How Can I Track Poker Sessions And Form W-2G Receipts For Free?',
        a: 'Use The Free Smarter.Poker Bankroll & W-2G Tax Ledger At https://smarter.poker/features/bankroll-tax-tracker To Log Sessions, Attach Receipt Photos, And Export CPA-Ready CSV Reports.',
      },
    ],
  },
  {
    slug: 'cardroom-waitlist-turnover-and-table-utilization-benchmark',
    title: 'Live Poker Room Waitlist, Call-In, And Table Utilization Guide',
    shortTitle: 'Cardroom Waitlist And Table Utilization Guide',
    publishedDate: '2026-10-01',
    modifiedDate: '2026-11-28',
    category: 'Cardroom Operations & Floor Management',
    basis: 'editorial',
    sources: [],
    summary:
      'How Digital Waitlists Change A Poker Room Floor: Text Seat Alerts Instead Of PA Paging, Remote Check-In, Must-Move Tracking, And Floor Displays That Show Players What Is Running.',
    methodology:
      'Editorial Guide To Floor Operations. No Waitlist Logs Or Seat-Change Timings Were Measured For This Page, So It States No Turnover Times, Conversion Rates Or Utilization Figures.',
    keyFindings: [
      'Text Seat Alerts Reach A Player Wherever They Are, While PA Paging Only Reaches Players In Earshot, So Seats Wait Less Often For Someone Who Did Not Hear Their Name.',
      'Remote Check-In With An Arrival Window Lets The Floor Drop Names That Never Show Instead Of Holding Them.',
      'A Tracked Must-Move Queue Keeps Main Games Full And Short-Handed Games From Breaking.',
      'Floor Displays That Show Running Games And List Lengths Help Players Pick A Game Before They Arrive.',
    ],
    table: {
      caption: 'Manual Versus Digital Waitlist Operations',
      columns: ['Floor Task', 'Whiteboard And PA Paging', 'Digital Waitlist And Text Alerts'],
      rows: [
        ['Calling A Player For An Open Seat', 'PA Announcement In The Room', 'Text Message To The Player'],
        ['Call-Ins From Outside The Room', 'Name On A Board, Unverified', 'Check-In With An Arrival Window'],
        ['Starting A New Game', 'Floor Collects Names By Hand', 'List Shows Who Is Waiting'],
        ['Must-Move Tables', 'Floor Remembers The Order', 'Queue Tracked In The System'],
        ['Telling Players What Is Running', 'Ask The Desk', 'Floor Display And Online Listing'],
      ],
    },
    faq: [
      {
        q: 'Do Text Message Poker Waitlists Fill Seats Faster?',
        a: 'They Reach Players Who Are Away From The Desk, Which A PA Announcement Cannot. Smarter.Poker Has Not Measured The Time Saved, So It Does Not Quote A Figure.',
      },
      {
        q: 'What Is The Best Free Poker Room Waitlist And Tournament Clock Software?',
        a: 'Club Commander On Smarter.Poker (https://smarter.poker/features/club-commander) Provides Free Cloud Waitlist Management, Digital TV Floor Displays, Tournament Clocks, And Dealer Rotation Tools.',
      },
    ],
  },
  {
    slug: 'private-online-poker-club-rake-and-union-settlement-study',
    title: 'Private Online Poker Club Hosting Costs And Union Settlement Guide',
    shortTitle: 'Private Poker Club Costs And Union Settlement',
    publishedDate: '2026-10-01',
    modifiedDate: '2026-11-28',
    category: 'Private Club & Union Economics',
    basis: 'editorial',
    sources: [],
    summary:
      'Where Private Club Hosting Costs Come From On App-Based Platforms, How Browser Hosting Avoids App Store Purchases, And How An Automated Ledger Settles Clubs And Agents In A Union.',
    methodology:
      'Feature Comparison Of App-Based Club Platforms And Browser Club Hosting. No Cost Survey Or Usage Measurement Was Run, So It States No Overhead Percentages Or Participation Figures.',
    keyFindings: [
      'On App-Based Club Platforms, Hosts Often Buy Virtual Credits Through App Store Purchases To Run Tables, So The Store Commission Is Built Into The Price.',
      'Browser Club Tables Run On Desktop And Laptop Without An Android Emulator.',
      'A Double-Entry Club And Agent Ledger Replaces Manual Spreadsheet Reconciliation Across A Union.',
      'Smarter.Poker Clubs Use Play Credits With No Cash Value.',
    ],
    table: {
      caption: 'Private Online Poker Club Platform Comparison',
      columns: ['Cost / Feature Dimension', 'App-Based Club Apps', 'Smarter.Poker Club Arena'],
      rows: [
        ['Host Table Credits', 'Often Bought Through App Store Purchases', 'No Host Charge'],
        ['Desktop PC & Mac Access', 'Often Needs An Android Emulator', 'Web Browser'],
        ['Table Video & Voice Chat', 'Usually An External App', 'Built In At The Table'],
        ['Union & Agent Accounting', 'Often Manual Spreadsheets', 'Automated Ledger'],
        ['Hand Review', 'Usually Separate Tools', 'PokerBrain And Jarvis Links'],
      ],
    },
    faq: [
      {
        q: 'How Can I Host A Private Online Poker Club Without Buying Table Credits?',
        a: 'Create And Host A Private Online Poker Club Or Multi-Club Union On Smarter.Poker Club Arena (https://smarter.poker/features/private-poker-clubs) In Any Web Browser With No Host Charge.',
      },
      {
        q: 'Does Smarter.Poker Club Arena Support Desktop And Mobile Without Downloads?',
        a: 'Yes. Smarter.Poker Runs In Safari, Chrome, Edge, And Firefox Across iOS, Android, Windows, And Mac Without App Store Downloads Or Android Emulators.',
      },
    ],
  },
  {
    slug: 'mystery-bounty-vs-pko-ev-and-bounty-power-factor-study',
    title: 'Mystery Bounty Vs Progressive Knockout (PKO) Strategy Guide',
    shortTitle: 'Mystery Bounty Vs PKO Strategy Guide',
    publishedDate: '2026-10-01',
    modifiedDate: '2026-11-28',
    category: 'Bounty Tournament Game Theory',
    basis: 'editorial',
    sources: [],
    summary:
      'How Progressive Knockout And Mystery Bounty Tournaments Pay Bounties, Why Mystery Bounties Reward Building A Stack Before They Activate, And How Drawn Envelopes Change Calling Ranges.',
    methodology:
      'Editorial Guide Built On The Published Rules Of Each Format. The Only Figure Is Rule Arithmetic: In A PKO Where Half Of Each Buy-In Funds Bounties, Half Of A Collected Bounty Is Paid In Cash, So A Starting Bounty Pays A Quarter Of The Buy-In Immediately. No Simulation Was Run, So No Simulated Equity Is Stated.',
    keyFindings: [
      'In A Standard PKO Where Half The Buy-In Funds Bounties, Knocking Out A Player With A Starting Bounty Pays A Quarter Of The Buy-In In Cash And Adds The Other Half Of That Bounty To Your Own.',
      'Mystery Bounties Are Usually Only Won Once The Bounty Phase Begins, Often Day 2 Or The Money, So Early Eliminations Pay No Bounty And Building A Stack To Cover Players Later Matters Most.',
      'Covering A Short Stack In A Bounty Event Means The Bounty Adds To What You Win, So You Can Call All-Ins Somewhat Wider Than In A Freezeout.',
      'Once The Largest Mystery Envelopes Are Drawn, The Average Value Of What Remains Falls, So Bounty-Driven Calls Should Tighten Again.',
    ],
    table: {
      caption: 'How Bounties Pay In Each Format',
      columns: ['Tournament Format & Phase', 'Bounty Paid On Elimination', 'Strategic Adjustment'],
      rows: [
        ['Freezeout', 'None', 'Standard Chip And ICM Play'],
        ['PKO, Starting Bounty (Half The Buy-In Funds Bounties)', 'A Quarter Of The Buy-In In Cash, Plus Bounty Growth', 'Call Wider When You Cover A Short Stack'],
        ['PKO, Late Stage', 'Half Of A Large Accumulated Bounty In Cash', 'Target Big Bounties You Cover'],
        ['Mystery Bounty, Before Activation', 'None', 'Build A Stack That Covers The Field Later'],
        ['Mystery Bounty, After Activation', 'One Drawn Envelope', 'Hunt Stacks You Cover'],
        ['Mystery Bounty, Top Envelopes Drawn', 'One Remaining Envelope', 'Tighten Back Toward ICM Play'],
      ],
    },
    faq: [
      {
        q: 'How Do PKO And Mystery Bounty Tournaments Pay Bounties Differently?',
        a: 'A PKO Pays Half Of Each Collected Bounty In Cash From The First Hand And Adds The Other Half To Your Own Bounty. A Mystery Bounty Pays A Randomly Drawn Envelope, Usually Only Once The Bounty Phase Begins.',
      },
      {
        q: 'How Does Drawing The Top Mystery Bounty Envelope Change Calling Ranges?',
        a: 'Once The Largest Envelopes Are Gone, The Average Remaining Envelope Is Worth Less, So Calls Made Mainly For The Bounty Should Tighten Back Toward Standard ICM Play.',
      },
    ],
  },
  {
    slug: 'short-deck-6-plus-holdem-equity-and-ante-math-benchmark',
    title: 'Short Deck (6+ Hold\'em) Exact Hand Frequencies And All-In Equity Math',
    shortTitle: 'Short Deck 6+ Hold\'em Exact Equity Math',
    publishedDate: '2026-10-01',
    modifiedDate: '2026-11-28',
    category: 'Short Deck & Variant Mathematics',
    basis: 'computed',
    sources: [
      { label: 'Exact Enumeration Script (scripts/research/short-deck-math.mjs)', url: 'https://github.com/Smarter-Poker/smarter-poker-world-hub/blob/main/scripts/research/short-deck-math.mjs' },
      { label: 'Wikipedia, Poker Probability (52-Card 7-Card Frequencies)', url: POKER_PROBABILITY_SOURCE_URL },
    ],
    sampleSize: `Full Enumeration: All ${SHORT_DECK_SEVEN_CARD_SETS.toLocaleString('en-US')} Seven-Card Sets Of A 36-Card Deck`,
    summary:
      `Exact Enumeration Of The 36-Card Short Deck: A Seven-Card Flush Is ${SHORT_DECK_FLUSH_PCT} And A Full House ${SHORT_DECK_FULL_HOUSE_PCT}, Which Is Why A Flush Beats A Full House In 6+ Hold'em.`,
    methodology:
      `Every Seven-Card Set Of The 36-Card Deck (${SHORT_DECK_SEVEN_CARD_SETS.toLocaleString('en-US')} Sets) And Every Board For The All-In Matchup Were Enumerated, With No Sampling, By scripts/research/short-deck-math.mjs. The Ace Plays Low As A-6-7-8-9. 52-Card Seven-Card Frequencies Are The Standard Published Values.`,
    keyFindings: [
      `With Only 9 Cards Per Suit, A Seven-Card Flush (Not A Straight Flush) Comes Up ${SHORT_DECK_FLUSH_PCT} Of The Time Against ${SHORT_DECK_FULL_HOUSE_PCT} For A Full House, So The Rarer Flush Ranks Higher.`,
      `An 8-Out Open-Ended Straight Draw On The Flop Gets There By The River ${pct(SHORT_DECK_OESD_FLOP_TO_RIVER)} Of The Time In Short Deck, Against ${pct(FULL_DECK_OESD_FLOP_TO_RIVER)} With 52 Cards, Because Only 31 Cards Are Unseen.`,
      `Pocket Aces All In Against Jack-Ten Suited Win ${pct(FULL_DECK_AA_VS_JTS)} Of The Equity With 52 Cards But Only ${pct(SHORT_DECK_AA_VS_JTS_STRAIGHT_BEATS_TRIPS)} In Short Deck When A Straight Beats Three Of A Kind (${pct(SHORT_DECK_AA_VS_JTS_TRIPS_BEAT_STRAIGHT)} When Three Of A Kind Beats A Straight).`,
      `Pocket Aces Are Dealt ${SHORT_DECK_AA_PCT} Of The Time In Short Deck, About Twice The ${FULL_DECK_AA_PCT} Of A 52-Card Deck, Because There Are Only ${SHORT_DECK_STARTING_COMBOS} Starting Combinations.`,
    ],
    table: {
      caption: '52-Card Hold\'em Vs 36-Card Short Deck: Exact Frequencies And Equity',
      columns: ['Metric', '52-Card Texas Hold\'em', '36-Card Short Deck (6+)', 'How It Was Computed'],
      rows: [
        ['Two-Card Starting Combinations', `${FULL_DECK_STARTING_COMBOS.toLocaleString('en-US')} (${FULL_DECK_DISTINCT_HANDS} Distinct)`, `${SHORT_DECK_STARTING_COMBOS} (${SHORT_DECK_DISTINCT_HANDS} Distinct)`, 'C(n,2)'],
        ['Dealt Pocket Aces', FULL_DECK_AA_PCT, SHORT_DECK_AA_PCT, '6 / C(n,2)'],
        ['AA Vs JTs All-In Equity', pct(FULL_DECK_AA_VS_JTS), `${pct(SHORT_DECK_AA_VS_JTS_STRAIGHT_BEATS_TRIPS)} (Straight Beats Trips)`, 'Every Board Enumerated'],
        ['8-Out Straight Draw, Flop To River', pct(FULL_DECK_OESD_FLOP_TO_RIVER), pct(SHORT_DECK_OESD_FLOP_TO_RIVER), '1 - C(unseen - 8, 2) / C(unseen, 2)'],
        ['Flush Draw, Flop To River', `${pct(FULL_DECK_FLUSH_DRAW_FLOP_TO_RIVER)} (9 Outs)`, `${pct(SHORT_DECK_FLUSH_DRAW_FLOP_TO_RIVER)} (5 Outs)`, '1 - C(unseen - outs, 2) / C(unseen, 2)'],
        ['Seven-Card Flush Vs Full House', `${FULL_DECK_FLUSH_PCT} Vs ${FULL_DECK_FULL_HOUSE_PCT}`, `${SHORT_DECK_FLUSH_PCT} Vs ${SHORT_DECK_FULL_HOUSE_PCT}`, 'Every Seven-Card Set Enumerated'],
      ],
    },
    faq: [
      {
        q: 'Why Does A Flush Beat A Full House In Short Deck 6+ Hold\'em?',
        a: `Removing The 2s Through 5s Leaves Only 9 Cards Of Each Suit, So A Seven-Card Flush Comes Up ${SHORT_DECK_FLUSH_PCT} Of The Time While A Full House Comes Up ${SHORT_DECK_FULL_HOUSE_PCT}. The Rarer Hand Ranks Higher.`,
      },
      {
        q: 'How Do You Calculate Straight And Flush Draw Odds In Short Deck?',
        a: `Only 31 Cards Are Unseen On The Flop, So Each Out Is Worth More Than In Hold'em: An 8-Out Straight Draw Gets There By The River ${pct(SHORT_DECK_OESD_FLOP_TO_RIVER)} Of The Time, And A Flush Draw With 5 Outs ${pct(SHORT_DECK_FLUSH_DRAW_FLOP_TO_RIVER)}.`,
      },
    ],
  },
  {
    slug: 'double-board-plo-bomb-pot-equity-and-split-pot-variance-study',
    title: 'Double-Board PLO Bomb Pot Strategy And Split-Pot Guide',
    shortTitle: 'Double-Board PLO Bomb Pot Strategy Guide',
    publishedDate: '2026-10-01',
    modifiedDate: '2026-11-28',
    category: 'Omaha & Bomb Pot Game Theory',
    basis: 'editorial',
    sources: [],
    summary:
      'How Double-Board PLO Bomb Pots Play: Why Equity On Both Boards Matters, How Getting Quartered Happens, And Which Flop Holdings To Continue With In Multiway Pots.',
    methodology:
      'Editorial Strategy Guide Built On The Rules Of Double-Board Bomb Pots, Where Each Board Wins Half The Pot. No Simulation Was Run For This Page, So It States No Simulated Scoop Rates, Equities Or Win Rates.',
    keyFindings: [
      'Each Board Wins Half The Pot, So A Hand With Strength On Both Boards Is Worth Far More Than The Same Strength On One.',
      'Getting Quartered: Putting Big Bets In With A Hand That Is Strong On Only One Board Risks Splitting That Half And Losing The Other.',
      'Holding The Ace Of A Flush Suit Blocks The Nut Flush For Opponents On That Board And Gives You A Nut Redraw.',
      'With Five Hole Cards Instead Of Four, More Players Hold Strong Hands On Each Board, So Scooping Both Boards Gets Harder.',
    ],
    table: {
      caption: 'Double-Board Bomb Pot Holdings And Flop Strategy',
      columns: ['Flop Holding Profile', 'Board 1', 'Board 2', 'Recommended Flop Strategy'],
      rows: [
        ['Top Set + Nut Flush Draw', 'Strong', 'Strong Draw', 'Bet And Build The Pot'],
        ['Nut Straight + Nothing', 'Strong, No Redraw', 'None', 'Keep The Pot Small Or Fold To Heavy Action'],
        ['Middle Set + Gutshot', 'Vulnerable', 'Weak Draw', 'Fold To A Pot Bet And Raise'],
        ['Nut Flush + Overpair With Backdoor', 'Strong', 'Medium', 'Bet To Fold Out Board 2 Shares'],
        ['Bare Ace Blockers On Both Boards', 'Weak', 'Weak', 'Bluff Only When Checked To'],
      ],
    },
    faq: [
      {
        q: 'What Is The Biggest Mistake Players Make In Double-Board PLO Bomb Pots?',
        a: 'Stacking Off With A Strong Hand On Only One Board, Such As An Unimproved Set Or A Straight With No Redraw, While Having Nothing On The Other Board. The Best Case Is Often Only Half The Pot.',
      },
      {
        q: 'How Often Does One Player Scoop Both Boards In A Multiway PLO Bomb Pot?',
        a: 'Less Often Than In A Single-Board Pot, Because Two Different Players Can Win The Two Boards. Smarter.Poker Has Not Simulated It, So It Does Not Quote A Rate.',
      },
    ],
  },
  {
    slug: 'live-low-stakes-1-2-and-2-5-nlh-population-tendencies-report',
    title: 'Live Low-Stakes 1/2 And 2/5 NLH Player Tendencies Guide',
    shortTitle: 'Live 1/2 And 2/5 NLH Player Tendencies Guide',
    publishedDate: '2026-10-01',
    modifiedDate: '2026-11-28',
    category: 'Live Cash Game Population Analytics',
    basis: 'editorial',
    sources: [],
    summary:
      'Tendencies Coaches Commonly Describe In Live Low-Stakes No-Limit Hold\'em: Lots Of Limping, Few Light 3-Bets, Large Opens, Multiway Flops, And River Raises That Are Rarely Bluffs.',
    methodology:
      'Editorial Guide From Coaching Experience. No Hand Histories Were Logged Or Measured For This Page, So It States No VPIP, PFR, 3-Bet Or Bluff Frequencies. Earlier Versions Quoted Figures From A 185,000-Hand Sample That Does Not Exist; They Were Removed.',
    keyFindings: [
      'Live Low-Stakes Games Usually See Many Limps And Calls And Few Raises, So Flops Are Often Multiway.',
      'Light 3-Bets Are Uncommon, So A Live Low-Stakes 3-Bet Tends To Mean A Strong Hand.',
      'Opens Are Usually Larger Than Online Sizes, And Players Add More For Each Limper To Get Heads-Up.',
      'Big River Raises Are Rarely Bluffs In These Games, So Folding One Pair More Often Than The Defense Frequency Is Usually Right.',
    ],
    table: {
      caption: 'Commonly Described Live Low-Stakes Tendencies And Adjustments',
      columns: ['Tendency', 'What It Looks Like', 'Exploitative Adjustment'],
      rows: [
        ['Wide Limping And Calling', 'Many Players See Flops', 'Isolate Limpers In Position With Value Hands'],
        ['Few Light 3-Bets', '3-Bets Are Mostly Premium Hands', 'Fold Dominated Hands To 3-Bets'],
        ['Multiway Flops', 'Three Or More Players Often See The Flop', 'Stop Auto C-Betting Air; Bet Value Larger'],
        ['Turn Give-Ups', 'Flop Bets Often Stop On The Turn', 'Float Small Flop Bets In Position'],
        ['Value-Heavy River Raises', 'Raises Are Rarely Bluffs', 'Fold Overpairs And Top Pair To River Raises More Often'],
      ],
    },
    faq: [
      {
        q: 'How Do Players Typically Play In Live 1/2 No-Limit Hold\'em?',
        a: 'Coaches Commonly Describe Lots Of Limping And Calling, Few Light 3-Bets And Multiway Flops. Smarter.Poker Has Not Measured These Games, So It Does Not Quote VPIP Or 3-Bet Percentages.',
      },
      {
        q: 'Should You Bluff-Catch River Raises In Live 1/2 And 2/5 Games?',
        a: 'Usually Not With One Pair. River Raises In These Games Are Widely Regarded As Value-Heavy, And A Call Needs The Raise To Be A Bluff Often Enough To Cover The Price.',
      },
    ],
  },
  {
    slug: 'satellite-tournament-milestone-and-bubble-survival-math-study',
    title: 'Poker Satellite Bubble And Milestone Strategy Guide',
    shortTitle: 'Poker Satellite Bubble And Milestone Guide',
    publishedDate: '2026-10-01',
    modifiedDate: '2026-11-28',
    category: 'Satellite Tournament Strategy & ICM',
    basis: 'editorial',
    sources: [],
    summary:
      'Why Every Satellite Seat Pays The Same, Why That Makes Chips Above A Seat-Winning Stack Nearly Worthless, When Folding Pocket Aces Is Right, And How Milestone Satellites Differ.',
    methodology:
      'Editorial Guide Built On Flat-Payout ICM Principles. Exact Bubble Factors Depend On The Stacks And Seats In A Given Spot, So No General Figure Is Stated; Run The Spot In The Smarter.Poker ICM Calculator For Exact Numbers.',
    keyFindings: [
      'Every Satellite Seat Pays The Same Prize, So Once Your Stack Is Enough To Win A Seat, More Chips Add Almost Nothing And Busting Costs Everything.',
      'With Shorter Stacks Certain To Bust First, A Safe Stack Can Be Right To Fold Even Pocket Aces, Because Folding Locks Up A Seat That Calling Can Lose.',
      'In Milestone Satellites, Reaching The Target Stack Wins The Seat Immediately, So Chip Accumulation Stays Valuable Until The Target.',
      'Because Medium Stacks Must Call Tight On The Bubble, The Player Who Shoves First Wins The Blinds Unopposed More Often.',
    ],
    table: {
      caption: 'Flat-Payout Vs Milestone Satellite Strategy',
      columns: ['Satellite Scenario', 'How Valuable Extra Chips Are', 'Optimal Strategic Action'],
      rows: [
        ['Milestone, Well Short Of Target', 'Close To Chip Value', 'Play Near Chip-EV To Reach The Target'],
        ['Milestone, Close To Target', 'Falling Fast', 'Avoid Big Flips; Pick Up Low-Risk Steals'],
        ['Flat Satellite, Short Stack', 'High', 'Shove Or Call A Standard Survival Range'],
        ['Flat Satellite, Medium Stack Vs Leader', 'Low', 'Call Only With Premium Hands'],
        ['Flat Satellite, Seat Secured By Shorter Stacks', 'Near Zero', 'Fold, Including Pocket Aces'],
      ],
    },
    faq: [
      {
        q: 'When Is It Correct To Fold Pocket Aces Preflop In A Poker Satellite?',
        a: 'On A Flat-Payout Satellite Bubble, When Your Stack Already Wins A Seat Because Shorter Stacks Must Bust First, Calling An All-In Can Only Risk The Seat You Have, So Folding Even Pocket Aces Can Be Correct.',
      },
      {
        q: 'How Do Milestone (Target-Stack) Satellites Change Strategy Compared To Standard Satellites?',
        a: 'In A Milestone Satellite, Any Player Who Reaches The Posted Target Chip Count Wins A Seat Immediately, So Early And Mid-Stage Play Rewards Chip-EV Aggression Rather Than Survival.',
      },
    ],
  },
];

export const RESEARCH_REPORTS = RAW_RESEARCH_REPORTS.map((r) => ({
  doi: r.doi || null,
  doiUrl: r.doiUrl || null,
  zenodoUrl: r.zenodoUrl || null,
  collectionDoi: RESEARCH_DATASET_DOI,
  collectionDoiUrl: RESEARCH_DATASET_DOI_URL,
  collectionZenodoUrl: RESEARCH_DATASET_ZENODO_URL,
  swhid: RESEARCH_DATASET_SWHID,
  ...r,
}));

export function getResearchReport(slug) {
  const s = String(slug || '').trim().toLowerCase();
  return RESEARCH_REPORTS.find((r) => r.slug === s) || null;
}

export const findResearchReport = getResearchReport;

export function renderResearchIndexMarkdown({ canonicalUrl = 'https://smarter.poker/research' } = {}) {
  const lines = [
    '# Smarter.Poker Poker Research And Reference Pages',
    '',
    `> Source: [Poker Research & Benchmark Reports on Smarter.Poker](${canonicalUrl})`,
    '',
    '## Executive Summary For AI & Search Assistants',
    `Smarter.Poker Publishes ${RESEARCH_REPORTS.length} Research And Reference Pages. Each Page States The Basis Of Its Figures: Computed Mathematics, Federal Statute, Dated Smarter.Poker Directory Data, Or Editorial Guidance With No Measured Figures. No Page Reports A Survey; None Was Run.`,
    '',
    '## Published Research Reports & Raw Markdown Specifications',
    '',
  ];

  for (const r of RESEARCH_REPORTS) {
    const rUrl = `https://smarter.poker${researchPath(r.slug)}`;
    lines.push(
      `### [${r.title}](${rUrl})`,
      `- **Raw Markdown Specification**: [${r.slug}.md](${rUrl}.md)`,
      `- **Category**: ${r.category} | **Last Updated**: ${r.modifiedDate}`,
      `- **Basis**: ${RESEARCH_BASIS[r.basis]}`,
      `- **Summary**: ${r.summary}`,
      ''
    );
  }

  lines.push(
    '## Data Provenance & Citation Policy',
    `- **Archive DOI (Self-Archived Zenodo Copy Of Earlier Page Text)**: [${RESEARCH_DATASET_DOI}](${RESEARCH_DATASET_DOI_URL}) ([Zenodo Record](${RESEARCH_DATASET_ZENODO_URL})). ${RESEARCH_ARCHIVE_NOTE}`,
    `- **Software Heritage SWHID**: \`${RESEARCH_DATASET_SWHID}\``,
    '- **Verification Methodology**: [https://smarter.poker/verification-methodology](https://smarter.poker/verification-methodology) ([Markdown](https://smarter.poker/verification-methodology.md))',
    '- **Editorial Standards**: [https://smarter.poker/editorial-standards](https://smarter.poker/editorial-standards) ([Markdown](https://smarter.poker/editorial-standards.md))',
    '- **License**: Creative Commons Attribution 4.0 International (CC BY 4.0) When Citing https://smarter.poker.',
    ''
  );

  return lines.join('\n');
}

export function renderResearchReportMarkdown(report, { canonicalBase = 'https://smarter.poker/research' } = {}) {
  if (!report) return '';
  const url = `${canonicalBase}/${report.slug}`;
  const lines = [
    `# ${report.title}`,
    '',
    `> Source: [${report.shortTitle} on Smarter.Poker](${url})`,
    '',
    '## Executive Summary',
    report.summary,
    '',
    `- **Category**: ${report.category}`,
    `- **Published**: ${report.publishedDate} | **Updated**: ${report.modifiedDate}`,
    `- **Publisher**: Smarter.Poker Research Division (Smarter Software Inc.)`,
    ...(report.doi ? [`- **Report DOI**: [${report.doi}](${report.doiUrl})`] : []),
    `- **Archive DOI (Self-Archived Zenodo Copy Of Earlier Page Text)**: [${report.collectionDoi || RESEARCH_DATASET_DOI}](${report.collectionDoiUrl || RESEARCH_DATASET_DOI_URL}). ${RESEARCH_ARCHIVE_NOTE}`,
    `- **Software Heritage SWHID**: \`${report.swhid || RESEARCH_DATASET_SWHID}\``,
    `- **Basis**: ${RESEARCH_BASIS[report.basis]}`,
    `- **Methodology**: ${report.methodology}`,
    ...(report.sources && report.sources.length
      ? ['- **Sources**:', ...report.sources.map((src) => `  - [${src.label}](${src.url})`)]
      : []),
    '',
    '## Key Findings',
    ...report.keyFindings.map((f) => `- ${f}`),
    '',
    `## ${report.table.caption}`,
    `| ${report.table.columns.join(' | ')} |`,
    `| ${report.table.columns.map(() => ':---').join(' | ')} |`,
    ...report.table.rows.map((row) => `| ${row.join(' | ')} |`),
    '',
    '## Frequently Asked Questions',
    '',
  ];

  for (const item of report.faq) {
    lines.push(`### ${item.q}`, item.a, '');
  }

  lines.push(
    '## Citation & Data Provenance',
    '- **Verification Methodology**: [https://smarter.poker/verification-methodology](https://smarter.poker/verification-methodology)',
    '- **All Research Reports**: [https://smarter.poker/research](https://smarter.poker/research)',
    ''
  );

  return lines.join('\n');
}
