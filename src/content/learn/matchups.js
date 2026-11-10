/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  POKER HAND VS HAND PREFLOP MATCHUP ENCYCLOPEDIA (src/content/learn/matchups.js)
 * ═══════════════════════════════════════════════════════════════════════════════
 * Authoritative source of truth for /learn/matchups and /learn/matchups/[slug].
 * Covers 25 canonical preflop hand-vs-hand matchups in No-Limit Texas Hold'em
 * with exact combinatoric win/tie/equity splits, flop texture shifts, and
 * 100BB / 200BB / 25BB / ICM stack-off guidance.
 *
 * House style: Title Case, zero em dashes.
 */

export const MATCHUPS_AS_OF = '2026-11-09';
export const MATCHUPS_BASE_PATH = '/learn/matchups';
export const MATCHUPS_URL = 'https://smarter.poker/learn/matchups';

export const MATCHUP_CATEGORIES = [
  'Overpair Vs Underpair',
  'Classic Race (Coinflip)',
  'Dominated Ace Or Broadway',
  'Pair Vs Suited Connectors',
];

export function matchupPath(slug) {
  return `/learn/matchups/${slug}`;
}

const MATCHUP_SLUG_ALIASES = {
  'ak-vs-qq': 'aks-vs-qq',
  'qq-vs-ak': 'qq-vs-aks',
  'ak-vs-jj': 'jj-vs-ako',
  'jj-vs-ak': 'jj-vs-ako',
  'jj-vs-aks': 'aqs-vs-jj',
  'ak-vs-tt': 'tt-vs-aks',
  'tt-vs-ak': 'tt-vs-aks',
  'ak-vs-aa': 'aa-vs-aks',
  'aa-vs-ak': 'aa-vs-aks',
  'ak-vs-kk': 'kk-vs-aks',
  'kk-vs-ak': 'kk-vs-aks',
  'kk-vs-aa': 'aa-vs-kk',
  'qq-vs-kk': 'kk-vs-qq',
  'jj-vs-qq': 'qq-vs-jj',
  'tt-vs-jj': 'jj-vs-tt',
  '72o-vs-aa': 'aa-vs-72o',
  'jts-vs-aa': 'aa-vs-jts',
  'jts-vs-aks': 'aks-vs-jts',
  'aq-vs-tt': 'tt-vs-aqo',
  'ak-vs-22': '22-vs-ako',
  'ako-vs-22': '22-vs-ako',
  '22-vs-ak': '22-vs-ako',
};

export function getMatchupBySlug(slug) {
  if (!slug) return null;
  const clean = String(slug).trim().toLowerCase();
  const target = MATCHUP_SLUG_ALIASES[clean] || clean;
  const exact = HAND_MATCHUPS.find((m) => m.slug === target);
  if (exact) return exact;
  const parts = clean.split('-vs-');
  if (parts.length === 2) {
    const reversed = `${parts[1]}-vs-${parts[0]}`;
    const revTarget = MATCHUP_SLUG_ALIASES[reversed] || reversed;
    const revMatch = HAND_MATCHUPS.find((m) => m.slug === revTarget);
    if (revMatch) return revMatch;
  }
  return null;
}
export const getHandMatchupBySlug = getMatchupBySlug;

export const HAND_MATCHUPS = [
  {
    slug: 'aa-vs-kk',
    title: 'AA Vs KK Preflop Equity And 4-Bet All-In Guide',
    handA: 'AA',
    handB: 'KK',
    category: 'Overpair Vs Underpair',
    handAWinPct: 81.95,
    handBWinPct: 17.59,
    tiePct: 0.46,
    handAEquity: 82.18,
    handBEquity: 17.82,
    combosA: 6,
    combosB: 6,
    summary:
      'Pocket Aces Dominates Pocket Kings With 82.18% Preflop Equity Across 36 Suit-Independent Combinatoric Pairings, Making AA Vs KK An Automatic Stack-Off At 100BB And 200BB Effective Depth.',
    flopShifts: [
      {
        texture: 'King-High Dry Board (K-8-3 Rainbow)',
        handAAction: 'Check-Call Flop And Evaluate Turn Sizing Carefully When KK Flops Top Set (11.8% Frequency).',
        equityShift: 'AA Drops To 8.4% Equity Vs Top Set KK; AA Must Rely On Two Remaining Aces Or Running Broadway.',
      },
      {
        texture: 'Ace-High Rainbow Board (A-9-4 Rainbow)',
        handAAction: 'Bet Small 25% To 33% Pot Across All Three Streets To Extract Maximum Value From Underpair Kings.',
        equityShift: 'AA Locks Up 98.9% Equity With Top Set While KK Needs Running Kings For Quads (1.1% Equity).',
      },
      {
        texture: 'Low Connected Board (8-7-6 Two-Tone)',
        handAAction: 'Bet 50% To 66% Pot For Value And Denial; Stack Off Unexploitably At Low Stack-To-Pot Ratios.',
        equityShift: 'AA Holds 80.5% Equity While KK Retains 19.5% Via Two King Outs And Backdoor Flush Draws.',
      },
    ],
    evAnalysis: {
      cash100bb:
        'Pure 100% 4-Bet And 5-Bet All-In Value For Both AA And KK In 6-Max Cash Games. Folding KK Preflop At 100BB Against Any Balanced Range Is A Massive Mathematical Blunder.',
      cash200bb:
        'AA Remains A 100% 5-Bet All-In Value Hand. KK Still 4-Bets For Value, Though Against Ultra-Tight UTG 5-Bet Shoves At 200BB+ Some Solvers Mix Flat-Calling KK In Position.',
      mtt25bb:
        'Unconditional 100% Preflop Jam Or Call For Both Hands. At 25BB Effective, Neither AA Nor KK Ever Folds Preflop.',
      icmFinalTable:
        'AA Never Folds Under Any Final Table ICM Pressure. KK Only Considers Folding In Extreme Satellite Bubble Scenarios Where Multiple Short Stacks Are Already All-In.',
    },
    faqs: [
      {
        q: 'How Often Does Pocket Kings Beat Pocket Aces Preflop?',
        a: 'Across All 1,712,304 Possible Five-Card Board Runouts, Pocket Kings Wins Outright 17.59% Of The Time And Ties 0.46% Of The Time, Giving KK 17.82% Total Equity Against AA.',
      },
      {
        q: 'Should You Ever Fold KK Preflop In A 100BB Cash Game?',
        a: 'No. In 100BB 6-Max And 9-Max Cash Games, Balanced 4-Bet And 5-Bet Ranges Contain AKs, AKo, QQ, And Bluffs Like A5s, Giving KK Well Over 55% Equity Against An Opponent Stack-Off Range.',
      },
      {
        q: 'How Do Shared Suits Affect AA Vs KK Equity?',
        a: 'When AA And KK Share The Exact Same Two Suits, AA Equity Rises To 82.65% Because AA Blocks Both Of KK Backdoor Flush Draws.',
      },
    ],
  },
  {
    slug: 'aks-vs-qq',
    title: 'AKs Vs QQ Preflop Coinflip Equity And 4-Bet Guide',
    handA: 'AKs',
    handB: 'QQ',
    category: 'Classic Race (Coinflip)',
    handAWinPct: 45.88,
    handBWinPct: 53.72,
    tiePct: 0.40,
    handAEquity: 46.08,
    handBEquity: 53.92,
    combosA: 4,
    combosB: 6,
    summary:
      'Ace-King Suited Trails Pocket Queens Narrowly At 46.08% To 53.92% Preflop Equity, Creating The Classic 4-Bet And 5-Bet All-In Race Where Dead Pot Money Makes Both Hands Profitable Stack-Offs At 100BB.',
    flopShifts: [
      {
        texture: 'Ace-High Or King-High Flop (A-T-4 Or K-7-2)',
        handAAction: 'C-Bet 33% Pot Across The Entire Range And Value Bet Turn Aggressively With Top Pair Top Kicker.',
        equityShift: 'AKs Surges To 89.2% Equity When Hitting An Ace Or King Without A Queen On The Flop.',
      },
      {
        texture: 'Two-Tone Flush Draw Flop (J-8-3 With Two Of AKs Suit)',
        handAAction: 'Semi-Bluff Aggressively Or Check-Raise All-In With 9 Flush Outs Plus 6 Overcard Outs (15 Total Outs).',
        equityShift: 'AKs Jumps To 54.6% Favorite Over Unimproved QQ Thanks To Nut Flush Plus Overcard Equity.',
      },
      {
        texture: 'Low Rainbow Brick Flop (8-5-2 Rainbow)',
        handAAction: 'Check Or Use Small Range C-Bet; Realize Overcard Equity Cheaply Without Bloating The Pot.',
        equityShift: 'AKs Drops To 26.8% Equity With Six Overcard Outs Across Turn And River.',
      },
    ],
    evAnalysis: {
      cash100bb:
        'Standard 4-Bet And 5-Bet All-In Coinflip. Because Preflop 3-Bet And 4-Bet Pots Already Contain 22BB To 35BB Of Dead Money, AKs Only Needs 42% Equity To Profitably Call Or Shove.',
      cash200bb:
        'At 200BB Deep, AKs Prefers Flatting 4-Bets In Position Or Using Non-All-In 4-Bet Sizes To Realize Postflop Nut Advantage Without Risking 200BB As A 46% Underdog.',
      mtt25bb:
        '100% Re-Steal 3-Bet Jam Or 4-Bet Jam With Both AKs And QQ. AKs Blocks AA And KK While Retaining 46.08% Equity When Called By QQ.',
      icmFinalTable:
        'Under Heavy Final Table ICM Pressure, AKs Prefers Being The Aggressor (Shoving First For Fold Equity) Rather Than Calling Off A Covered Stack Against A Tight Shove.',
    },
    faqs: [
      {
        q: 'How Much Extra Equity Does AK Suited Have Vs QQ Compared To AK Offsuit?',
        a: 'AK Suited Has 46.08% Equity Against Pocket Queens Compared To 43.36% For AK Offsuit, A +2.72% Equity Boost Driven By Four-Card And Five-Card Flush Runouts.',
      },
      {
        q: 'Why Is AKs Vs QQ Called A Coinflip If QQ Wins 53.9% Of The Time?',
        a: 'Because Both Hands Are Within 4% Of 50/50 Equity And Dead Blinds Plus 3-Bet Chips In The Center Make Both Sides +EV To Commit All-In At 100BB.',
      },
      {
        q: 'How Often Does AKs Hit An Ace Or King By The River?',
        a: 'With Six Unblocked Outs, AKs Pairs Either Its Ace Or Its King On The Board Approximately 48.7% Of The Time By The River.',
      },
    ],
  },
  {
    slug: 'jj-vs-ako',
    title: 'JJ Vs AKo Preflop Race Equity And 3-Bet Pot Guide',
    handA: 'JJ',
    handB: 'AKo',
    category: 'Classic Race (Coinflip)',
    handAWinPct: 56.65,
    handBWinPct: 42.95,
    tiePct: 0.40,
    handAEquity: 56.85,
    handBEquity: 43.15,
    combosA: 6,
    combosB: 12,
    summary:
      'Pocket Jacks Holds A 56.85% To 43.15% Equity Advantage Over Ace-King Offsuit Across 72 Possible Combo Pairings, Making JJ A Clear Statistical Favorite In 100BB 3-Bet And 4-Bet Confrontations.',
    flopShifts: [
      {
        texture: 'Under-Card Ten-High Board (T-7-3 Rainbow)',
        handAAction: 'Bet 50% To 66% Pot Immediately To Charge AKo Overcards And Deny Free Turn Equity.',
        equityShift: 'JJ Commands 74.1% Equity As An Overpair While AKo Holds 25.9% With Six Overcard Outs.',
      },
      {
        texture: 'Ace-High Or King-High Board (A-8-4 Or K-9-2)',
        handAAction: 'Check Back In Position Or Check-Call One Small Bet Out Of Position; Fold To Multi-Street Pressure.',
        equityShift: 'JJ Plummets To 9.2% Equity When AKo Pairs Top Pair And JJ Must Catch One Of Two Remaining Jacks.',
      },
      {
        texture: 'Queen-High Board (Q-6-2 Rainbow)',
        handAAction: 'Check Or Bet Small 25% Pot; Both Hands Face Awkward Overcard Interaction.',
        equityShift: 'JJ Retains 69.8% Equity Because AKo Still Missed The Queen-High Flop.',
      },
    ],
    evAnalysis: {
      cash100bb:
        'JJ Mixes Between Calling 3-Bets In Position And 4-Betting Out Of Position. Against Early Position 4-Bets, JJ Commonly Flats While AKo Uses All-In 5-Bet Bluffs With Blocker Removal.',
      cash200bb:
        'At 200BB Deep, Stacking Off Preflop With JJ Or AKo Is Avoided; JJ Calls 3-Bets And 4-Bets To Play Postflop Where Overcards Create Reverse Implied Odds.',
      mtt25bb:
        'Pure 100% 3-Bet Jam Or Call Off With Both JJ And AKo At 25BB Effective Stack Depth.',
      icmFinalTable:
        'At Final Tables, JJ Is Strongly Preferred Over AKo When Calling All-In Because A Made Pair Realizes 56.85% Raw Equity Even Without Fold Equity.',
    },
    faqs: [
      {
        q: 'Why Do Players Hate Playing Pocket Jacks Against AK?',
        a: 'Although JJ Is A 56.85% Preflop Favorite Against AKo, An Ace, King, Or Queen Lands On The Flop 51.8% Of The Time, Making Postflop Navigation Difficult When Not All-In Preflop.',
      },
      {
        q: 'How Many Combinations Of AKo Exist Compared To JJ?',
        a: 'There Are 12 Combinations Of AKo And Only 6 Combinations Of JJ, Meaning You Encounter AKo Twice As Frequently As Pocket Jacks.',
      },
      {
        q: 'Does JJ Gain Equity If It Shares A Suit With AKo?',
        a: 'Yes. When One Of Your Jacks Shares A Suit With The Ace Or King In AKo, JJ Blocks Backdoor Flush Runouts And Holds 57.1% Equity.',
      },
    ],
  },
  {
    slug: 'qq-vs-aks',
    title: 'QQ Vs AKs Preflop Equity And 100BB Stack-Off Guide',
    handA: 'QQ',
    handB: 'AKs',
    category: 'Classic Race (Coinflip)',
    handAWinPct: 53.72,
    handBWinPct: 45.88,
    tiePct: 0.40,
    handAEquity: 53.92,
    handBEquity: 46.08,
    combosA: 6,
    combosB: 4,
    summary:
      'Pocket Queens Enters Preflop All-In Confrontations As A 53.92% To 46.08% Favorite Over Ace-King Suited, Representing The Highest-Frequency 100BB 4-Bet And 5-Bet Race In Modern No-Limit Hold\'em.',
    flopShifts: [
      {
        texture: 'Jack-High Disconnected Board (J-6-2 Rainbow)',
        handAAction: 'Bet 50% To 75% Pot For Protection And Value While Denied Flush Draws Keep QQ Ahead.',
        equityShift: 'QQ Climbs To 73.8% Equity When Avoiding An Ace, King, Or Two-Tone Flush Draw.',
      },
      {
        texture: 'Queen-High Board With Flush Draw (Q-9-4 Two-Tone)',
        handAAction: 'Bet Large Or Check-Raise All-In With Top Set To Charge Flush And Inside Straight Draws.',
        equityShift: 'QQ Holds 68.5% Equity With Top Set Even If AKs Flops A Four-Flush Draw.',
      },
      {
        texture: 'Ace-King Two-Pair Or Broadway Board (A-8-3 Rainbow)',
        handAAction: 'Switch Immediately To Defensive Check-Folding Against Heavy Multi-Street Sizing.',
        equityShift: 'QQ Falls To 8.9% Equity Facing Top Pair Top Kicker From AKs.',
      },
    ],
    evAnalysis: {
      cash100bb:
        'QQ Is A Mandatory 4-Bet And Call-5-Bet Value Hand In 6-Max Cash Games Outside Of Ultra-Tight UTG Vs UTG+1 Configurations.',
      cash200bb:
        'At 200BB Deep, QQ Prefers Calling 4-Bets In Position Rather Than 5-Bet Shoving Because Only AA And KK Call Worse Than A Coinflip.',
      mtt25bb:
        'Automatic 100% 3-Bet Shove Or 4-Bet Call Across Every Tournament Position.',
      icmFinalTable:
        'QQ Remains One Of The Strongest Calling Hands At Final Tables, Outperforming AKs By Nearly 8% Raw Equity.',
    },
    faqs: [
      {
        q: 'Is QQ A Favorite Over AK Suited Preflop?',
        a: 'Yes. Pocket Queens Holds 53.92% Total Equity (53.72% Win, 0.40% Tie) Against Ace-King Suited Before The Flop.',
      },
      {
        q: 'How Often Does An Ace Or King Hit The Flop Against Pocket Queens?',
        a: 'When Villain Holds AKs, Six Aces And Kings Remain In The 48 Unseen Cards, Meaning An Ace Or King Appears On The Flop 33.9% Of The Time.',
      },
      {
        q: 'Should QQ 5-Bet Shove At 100BB Effective?',
        a: 'Yes, Against Button, Cutoff, And Blind 4-Bets, QQ Profitably 5-Bet Jams At 100BB Because AKs And AKo Make Up Over Half Of Villain Value-Plus-Bluff 4-Bet Combos.',
      },
    ],
  },
  {
    slug: 'aa-vs-aks',
    title: 'AA Vs AKs Preflop Blocker And Domination Guide',
    handA: 'AA',
    handB: 'AKs',
    category: 'Dominated Ace Or Broadway',
    handAWinPct: 87.23,
    handBWinPct: 12.14,
    tiePct: 0.63,
    handAEquity: 87.55,
    handBEquity: 12.45,
    combosA: 6,
    combosB: 4,
    summary:
      'Pocket Aces Crushes Ace-King Suited With 87.55% To 12.45% Preflop Equity And Reduces AKs From 4 Combinations Down To Just 2 Combinations Via Card Removal Blockers.',
    flopShifts: [
      {
        texture: 'King-High Flop (K-9-4 Rainbow)',
        handAAction: 'Bet Across All Three Streets For Maximum Value Because AKs Made Top Pair Top Kicker And Cannot Fold.',
        equityShift: 'AA Holds 91.6% Equity While AKs Is Drawing To Running Kings Or A King-Plus-Ace Full House.',
      },
      {
        texture: 'Ace-High Flop (A-7-2 Rainbow)',
        handAAction: 'Slowplay Or Bet Small 25% Pot With Top Set So AKs Commits Its Entire Stack With Top Two Kicker.',
        equityShift: 'AA Commands 99.1% Equity With Top Set Aces Over Top Pair.',
      },
      {
        texture: 'Monotone Or Two-Tone Flush Draw Flop (J-8-3 Two-Tone)',
        handAAction: 'Size Up To 66% Pot When AA Does Not Block Villain Flush Suit.',
        equityShift: 'AKs Climbs To 36.2% Equity When Flopping A Four-Flush Draw Against Unsuited Aces.',
      },
    ],
    evAnalysis: {
      cash100bb:
        'AA Extracts Massive EV From AKs In 4-Bet And 5-Bet Pots. When Holding An Ace Of The Same Suit As Villain Possible AKs, Flat-Calling 4-Bets In Position Traps AKs Postflop.',
      cash200bb:
        'Even At 200BB Deep, AKs Frequently Stacks Off On King-High And Ace-High Boards Against AA.',
      mtt25bb:
        'Dream Scenario For AA: AKs Almost Always 3-Bet Or 4-Bet Shoves Right Into Pocket Aces At 25BB.',
      icmFinalTable:
        'AA Wins Near-Maximum Tournament Chip EV Against AKs With Only A 12.14% Risk Of Elimination.',
    },
    faqs: [
      {
        q: 'Why Is AA Better Against AKs Than Against KK?',
        a: 'Because AA Holds Two Of The Four Aces In The Deck, Leaving AKs With Zero Clean Single-Card Ace Outs And Requiring Either Running Kings, A Flush, Or A Four-Card Straight To Win.',
      },
      {
        q: 'How Many Combinations Of AKs Remain When You Hold AA?',
        a: 'Holding Two Aces Cuts Available AKs Combinations From 4 Down To Exactly 2 (Matching The Two Suits Not Held In Your AA).',
      },
      {
        q: 'How Does AKs Beat AA Most Frequently?',
        a: 'A Five-Card Flush Accounts For Over 60% Of AKs Wins Against AA, Followed By Broadway Straights And Running Trip Kings.',
      },
    ],
  },
  {
    slug: 'kk-vs-aks',
    title: 'KK Vs AKs Preflop Blocker Equity And 4-Bet Guide',
    handA: 'KK',
    handB: 'AKs',
    category: 'Dominated Ace Or Broadway',
    handAWinPct: 65.41,
    handBWinPct: 34.03,
    tiePct: 0.56,
    handAEquity: 65.69,
    handBEquity: 34.31,
    combosA: 6,
    combosB: 4,
    summary:
      'Pocket Kings Holds A 65.69% To 34.31% Preflop Equity Lead Over Ace-King Suited Because KK Blocks Two Of The Three Kings Needed By AKs, Leaving Villain Primarily Drawing To Three Aces Or A Flush.',
    flopShifts: [
      {
        texture: 'King-High Board (K-8-2 Rainbow)',
        handAAction: 'Bet Small 25% Pot On The Flop And Ramp Up Turn And River Sizing Against Trapped Top Pair.',
        equityShift: 'KK Locks Up 95.8% Equity With Top Set While AKs Draws Nearly Dead To Running Aces.',
      },
      {
        texture: 'Ace-High Board (A-T-4 Rainbow)',
        handAAction: 'Check-Call One Small Flop Bet And Fold To Heavy Turn And River Barrels.',
        equityShift: 'AKs Takes Command With 91.4% Equity While KK Has Only One Remaining King Out In The Deck.',
      },
      {
        texture: 'Under-Card Board (9-6-3 Rainbow)',
        handAAction: 'Bet 50% Pot To Deny Free Overcard Ace Equity.',
        equityShift: 'KK Maintains 78.9% Equity Because AKs Has Only Three Ace Outs.',
      },
    ],
    evAnalysis: {
      cash100bb:
        'KK Always 4-Bets And Calls 5-Bet Shoves Against AKs. Blocking Two Kings Reduces AKs Combos From 4 Down To 2 And Boosts KK Equity From 54% (Vs Underpair) To 65.69%.',
      cash200bb:
        'KK Still 4-Bets For Value, Navigating Ace-High Flops Cautiously When Postflop Stacks Remain Deep.',
      mtt25bb:
        'Unconditional All-In Value For KK; AKs Frequently Calls Or Shoves As A Nearly 2-To-1 Underdog.',
      icmFinalTable:
        'Strong +$EV Call Or Shove For KK At Final Tables Except On Extreme Satellite Bubbles.',
    },
    faqs: [
      {
        q: 'How Much Equity Does AKs Lose Against KK Compared To QQ?',
        a: 'AKs Drops From 46.08% Equity Against QQ Down To 34.31% Equity Against KK, A -11.77% Drop Caused By KK Blocking Two King Outs.',
      },
      {
        q: 'How Often Does An Ace Hit By The River In KK Vs AKs?',
        a: 'With Three Aces Remaining In 48 Unseen Cards, At Least One Ace Lands Across The Five Community Cards Approximately 28.4% Of The Time.',
      },
      {
        q: 'How Many Combinations Of AKs Exist When You Hold KK?',
        a: 'Holding Two Kings Leaves Only 2 Combinations Of AKs And 6 Combinations Of AKo In Villain Range.',
      },
    ],
  },
  {
    slug: 'tt-vs-aqo',
    title: 'TT Vs AQo Preflop Equity And Medium Pair Guide',
    handA: 'TT',
    handB: 'AQo',
    category: 'Classic Race (Coinflip)',
    handAWinPct: 56.72,
    handBWinPct: 42.84,
    tiePct: 0.44,
    handAEquity: 56.94,
    handBEquity: 43.06,
    combosA: 6,
    combosB: 12,
    summary:
      'Pocket Tens Holds A 56.94% To 43.06% Preflop Equity Edge Over Ace-Queen Offsuit, Making TT A Clear Favorite In Late-Position 3-Bet And Short-Stack All-In Confrontations.',
    flopShifts: [
      {
        texture: 'Nine-High Low Board (9-6-2 Rainbow)',
        handAAction: 'Bet 50% To 66% Pot For Immediate Value And Overcard Equity Denial.',
        equityShift: 'TT Commands 74.4% Equity As An Overpair Facing Six Unimproved Overcards.',
      },
      {
        texture: 'Ace-High Or Queen-High Board (A-7-3 Or Q-8-4)',
        handAAction: 'Check Back Or Check-Fold Against Large Sizing Unless TT Flops A Backdoor Straight Draw.',
        equityShift: 'TT Drops To 9.1% Equity When AQo Connects With Top Pair.',
      },
      {
        texture: 'King-Jack-X Board (K-J-4 Rainbow)',
        handAAction: 'Check And Proceed With Caution Because AQo Holds A Broadway Gutshot Plus Overcards.',
        equityShift: 'TT Holds 60.2% Equity While AQo Has Four Ten Outs Blocked By Hero Pocket Tens.',
      },
    ],
    evAnalysis: {
      cash100bb:
        'TT Calls 3-Bets In Position And 4-Bets selectively In Blind-Vs-Button Wars Where AQo Appears In Villain 3-Bet Range.',
      cash200bb:
        'Both Hands Prefer Seeing A Flop Rather Than Stacking Off 200BB Preflop.',
      mtt25bb:
        'Standard 25BB Re-Steal Jam And Call Spot From Cutoff, Button, And Blinds.',
      icmFinalTable:
        'TT Performs Strongly As A Shove Hand Because It Forces Folds From Better Pairs Occasionally And Holds 56.9% Equity When Called By AQo.',
    },
    faqs: [
      {
        q: 'Does Pocket Tens Block Broadway Straights For AQo?',
        a: 'Yes. Holding Two Tens Removes Half Of The Ten Outs AQo Needs To Complete An Ace-High Broadway Straight (A-K-Q-J-T).',
      },
      {
        q: 'What Is The Exact Equity Of TT Vs AQs Suited?',
        a: 'Against Ace-Queen Suited (AQs), Pocket Tens Holds 54.05% Equity Compared To 56.94% Against AQo Offsuit.',
      },
      {
        q: 'Should TT Call A 25BB 3-Bet Shove From The Small Blind?',
        a: 'Yes. Against A Balanced Small Blind Or Button 25BB 3-Bet Shove Containing AQo, AJo, KQs, And Lower Pocket Pairs, TT Has Over 58% Total Equity.',
      },
    ],
  },
  {
    slug: '99-vs-aks',
    title: '99 Vs AKs Preflop Coinflip Equity And MTT Jam Guide',
    handA: '99',
    handB: 'AKs',
    category: 'Classic Race (Coinflip)',
    handAWinPct: 52.34,
    handBWinPct: 47.27,
    tiePct: 0.39,
    handAEquity: 52.53,
    handBEquity: 47.47,
    combosA: 6,
    combosB: 4,
    summary:
      'Pocket Nines Clings To A 52.53% To 47.47% Edge Over Ace-King Suited Because 99 Blocks None Of AKs Broadway Straight Cards, Producing One Of The Tightest True 50/50 Coinflips In Hold\'em.',
    flopShifts: [
      {
        texture: 'Low Eight-High Board (8-5-2 Rainbow)',
        handAAction: 'Bet 66% Pot Immediately To Protect Vulnerable Overpair Equity.',
        equityShift: '99 Rises To 72.9% Equity On A Clean Under-Card Flop.',
      },
      {
        texture: 'Broadway Overcard Flop (Q-J-T Rainbow)',
        handAAction: 'Check-Fold Immediately Because Both Hands Face Heavy Broadway Interaction.',
        equityShift: 'AKs Flops The Nut Broadway Straight And Locks Up 97.5% Equity.',
      },
      {
        texture: 'Nine-High Set Flop (9-7-3 Two-Tone)',
        handAAction: 'Bet Large Or Check-Raise All-In With Top Set Nines.',
        equityShift: '99 Surges To 93.4% Equity Unless AKs Holds The Matching Two-Tone Flush Draw (69.1%).',
      },
    ],
    evAnalysis: {
      cash100bb:
        '99 Primarily Set-Mines Or Calls 3-Bets In Position At 100BB Rather Than 4-Betting Into Uncapped Ranges.',
      cash200bb:
        'Pure Flat-Call Preflop With 99 To Flop Sets And Win Big Deep-Stacked Pots.',
      mtt25bb:
        'High-Frequency 3-Bet Jam From Late Position And Blinds At 20BB To 25BB.',
      icmFinalTable:
        '99 Prefers Shoving First Over Calling All-In Because Calling Runs Into TT-AA Far Too Often.',
    },
    faqs: [
      {
        q: 'Why Does 99 Have Almost 1.4% Less Equity Vs AKs Than QQ Does?',
        a: 'Because QQ, JJ, And TT All Block AKs From Making An Ace-High Broadway Straight (A-K-Q-J-T), Whereas 99 Does Not Block Any Card In Broadway.',
      },
      {
        q: 'Who Is The Favorite Between 99 And AKs?',
        a: 'Pocket Nines Is Still A Slight Favorite At 52.53% Equity To 47.47% For AKs.',
      },
      {
        q: 'How Often Does 99 Flop A Set?',
        a: 'Like Every Pocket Pair, 99 Flops A Set Or Quads Approximately 11.76% Of The Time (Roughly 1 In 8.5 Flops).',
      },
    ],
  },
  {
    slug: '88-vs-ako',
    title: '88 Vs AKo Preflop Race Equity And Set-Mining Guide',
    handA: '88',
    handB: 'AKo',
    category: 'Classic Race (Coinflip)',
    handAWinPct: 55.12,
    handBWinPct: 44.47,
    tiePct: 0.41,
    handAEquity: 55.33,
    handBEquity: 44.67,
    combosA: 6,
    combosB: 12,
    summary:
      'Pocket Eights Leads Ace-King Offsuit 55.33% To 44.67% Preflop, Giving 88 Solid Coinflip Equity In Tournament All-Ins While Requiring Disciplined Postflop Play When Deep-Stacked.',
    flopShifts: [
      {
        texture: 'Seven-High Low Board (7-4-2 Rainbow)',
        handAAction: 'Bet 50% To 66% Pot While 88 Remains An Uncontested Overpair.',
        equityShift: '88 Holds 73.5% Equity Against Six Unimproved Overcards.',
      },
      {
        texture: 'Two-Overcard Board (Q-T-3 Rainbow)',
        handAAction: 'Check And Evaluate; 88 Still Leads Unpaired AKo Despite Two Overcards On Board.',
        equityShift: '88 Retains 67.4% Equity Because AKo Still Missed Both The Queen And Ten.',
      },
      {
        texture: 'Eight-High Set Board (8-6-2 Rainbow)',
        handAAction: 'Slowplay Or Bet Small To Keep AKo Bluffing Or Catching Top Pair On Turn.',
        equityShift: '88 Commands 98.6% Equity With Top Set.',
      },
    ],
    evAnalysis: {
      cash100bb:
        'Call Open-Raises And Small In-Position 3-Bets following The 15-To-1 Implied Odds Set-Mining Rule.',
      cash200bb:
        'Prime Set-Mining Hand At 200BB Deep Where Hitting An Eight Wins Huge Stacks Against AK Top Pair Or Overpairs.',
      mtt25bb:
        'Profitable Open-Shove At 15BB To 20BB Or Re-Steal Jam Against Late-Position Opens.',
      icmFinalTable:
        'Fold 88 Facing Early-Position Final Table Shoves; Jam 88 First When Folded To In Late Position.',
    },
    faqs: [
      {
        q: 'Why Does 88 Have Higher Equity Vs AKo Than 99 Has Vs AKs?',
        a: 'Because Offsuit AKo Lacks Single-Suit Flush Runouts, Costing AKo Roughly 2.8% Equity Compared To Suited AKs.',
      },
      {
        q: 'How Many Overcards Exist In The Deck Against 88?',
        a: 'Six Ranks (9, T, J, Q, K, A) Are Higher Than Eights, Meaning At Least One Card Higher Than 8 Appears On Nearly 81% Of Flops.',
      },
      {
        q: 'What Is The Implied Odds Rule For Set-Mining With 88?',
        a: 'Aim For Effective Stacks Of At Least 12 To 15 Times The Call Amount So That Flopping A Set (11.8%) Pays Off Profitably.',
      },
    ],
  },
  {
    slug: '77-vs-aks',
    title: '77 Vs AKs Preflop Equity And Short-Stack Shove Guide',
    handA: '77',
    handB: 'AKs',
    category: 'Classic Race (Coinflip)',
    handAWinPct: 52.01,
    handBWinPct: 47.59,
    tiePct: 0.40,
    handAEquity: 52.21,
    handBEquity: 47.79,
    combosA: 6,
    combosB: 4,
    summary:
      'Pocket Sevens Holds A 52.21% To 47.79% Preflop Lead Over Ace-King Suited, Demonstrating That Even A Low-Medium Pocket Pair Enters All-In Before The Flop Ahead Of Unpaired Suited Big Slick.',
    flopShifts: [
      {
        texture: 'Low Connected Flop (7-6-5 Rainbow)',
        handAAction: 'Bet Large With Top Set On A Coordinated Low Board.',
        equityShift: '77 Surges To 96.4% Equity With Top Set Sevens.',
      },
      {
        texture: 'Paired Broadway Flop (Q-Q-4 Rainbow)',
        handAAction: 'Bet Small Or Check-Call cautiously; Avoid Getting Counterfeited On Turn And River.',
        equityShift: '77 Leads 64.8% To 35.2%, Though Any Jack, Ten, Or Nine On Turn Plus River Counterfeits Sevens.',
      },
      {
        texture: 'Ace-High Two-Tone Flop (A-9-3 Two-Tone)',
        handAAction: 'Check-Fold Immediately Facing Any C-Bet Without A Seven On The Flop.',
        equityShift: 'AKs Commands 91.5% Equity With Top Pair Top Kicker.',
      },
    ],
    evAnalysis: {
      cash100bb:
        'Flat-Call Single Raised Pots To Set-Mine; Fold To Heavy 3-Bets Out Of Position.',
      cash200bb:
        'Pure Deep-Stack Set-Mining Candidate Against Early And Middle Position Openers.',
      mtt25bb:
        'Profitable 20BB To 25BB Re-Steal Jam Against Cutoff And Button Opens.',
      icmFinalTable:
        'Great Open-Jam Hand From Cutoff, Button, Or Small Blind When Covering Shorter Stacks.',
    },
    faqs: [
      {
        q: 'How Can Pocket Sevens Get Counterfeited Against AK?',
        a: 'If The Board Pairs Twice Above Sevens (For Example Q-Q-J-J-2), AK Plays Two Pair Queens And Jacks With An Ace Kicker, Counterfeiting Pocket Sevens.',
      },
      {
        q: 'Is 77 Still A Favorite Against AKs?',
        a: 'Yes, 77 Wins 52.01% Of Runouts And Ties 0.40% For 52.21% Total Equity.',
      },
      {
        q: 'Should 77 Call A 25BB All-In In A Tournament?',
        a: 'Usually No Unless Villain Is Extremely Short Or Wide, Because Calling Ranges Face Overpairs (88-AA) Which Crush 77 At 80% Equity.',
      },
    ],
  },
  {
    slug: '22-vs-ako',
    title: '22 Vs AKo Deuces Vs Big Slick Counterfeit Math Guide',
    handA: '22',
    handB: 'AKo',
    category: 'Classic Race (Coinflip)',
    handAWinPct: 50.11,
    handBWinPct: 49.23,
    tiePct: 0.66,
    handAEquity: 50.44,
    handBEquity: 49.56,
    combosA: 6,
    combosB: 12,
    summary:
      'Pocket Deuces Holds A Razor-Thin 50.44% To 49.56% Preflop Edge Over Ace-King Offsuit Because Double-Paired Boards Above Deuces Counterfeit 22 Into Playing The Board With A Seven-Low Kicker.',
    flopShifts: [
      {
        texture: 'Deuce On The Flop (K-8-2 Rainbow)',
        handAAction: 'Check-Raise Or Fast-Play Bottom Set Against AKo Top Pair Top Kicker.',
        equityShift: '22 Jumps To 91.2% Equity When Hitting Bottom Set Against Top Pair.',
      },
      {
        texture: 'Paired High Board (J-J-8 Rainbow)',
        handAAction: 'Proceed With Extreme Caution Because Any Turn Or River 8, 9, T, Or Q Counterfeits Deuces.',
        equityShift: '22 Drops To 53.1% Because AKo Now Wins On Any Ace, King, Eight, Or Board Double-Pair.',
      },
      {
        texture: 'Unpaired Three-Overcard Board (Q-9-5 Rainbow)',
        handAAction: 'Check-Fold To Multi-Barrel Pressure Unless All-In Preflop.',
        equityShift: '22 Holds 66.2% Equity At The Flop But Cannot Realize It Across Turn And River Bets.',
      },
    ],
    evAnalysis: {
      cash100bb:
        'Open-Raise On Button And Cutoff Or Call In Position With Deep Implied Odds To Flop Bottom Set.',
      cash200bb:
        'Profitable Set-Mine In Position When Stacks Exceed 15x The Preflop Call.',
      mtt25bb:
        'Open-Shove At 10BB To 15BB From Late Position; Avoid Calling All-Ins With 22.',
      icmFinalTable:
        'Never Call Off A Stack With 22 At A Final Table Due To Zero Blocker Value And Worst Post-Call Equity.',
    },
    faqs: [
      {
        q: 'Why Does 22 Have 6.4% Less Equity Vs AKo Than JJ Does?',
        a: 'Because Every Single Board Card From 3 Through Q Is Higher Than A Deuce, Any Time The Board Double-Pairs (Like T-T-6-6-4), AKo Wins With Tens And Sixes Ace Kicker.',
      },
      {
        q: 'Is 22 Ever An Underdog To AK?',
        a: 'Against AK Suited (AKs), Pocket Deuces Is Actually A Slight Underdog At 47.62% To 52.38%, Whereas Against AK Offsuit (AKo) 22 Holds A 50.44% Edge.',
      },
      {
        q: 'Can Pocket Deuces Make A Wheel Straight Against AK?',
        a: 'Yes, A-2-3-4-5 Gives Deuces A Straight Unless AK Holds The Ace Needed On A 3-4-5-6 Board.',
      },
    ],
  },
  {
    slug: 'aks-vs-aqo',
    title: 'AKs Vs AQo Dominated Ace Kicker Equity Guide',
    handA: 'AKs',
    handB: 'AQo',
    category: 'Dominated Ace Or Broadway',
    handAWinPct: 71.52,
    handBWinPct: 23.68,
    tiePct: 4.80,
    handAEquity: 73.92,
    handBEquity: 26.08,
    combosA: 4,
    combosB: 12,
    summary:
      'Ace-King Suited Dominates Ace-Queen Offsuit With 73.92% To 26.08% Preflop Equity, Turning Shared Ace-High Flops Into Massive Three-Street Value Traps Against Out-Kicked Top Pair.',
    flopShifts: [
      {
        texture: 'Shared Ace-High Flop (A-8-3 Rainbow)',
        handAAction: 'Bet All Three Streets For Value Targeting Top Pair Queen Kicker.',
        equityShift: 'AKs Commands 86.4% Equity (With Chop Outs On Double-Paired Boards) While AQo Has Only Three Queen Outs.',
      },
      {
        texture: 'Queen-High Flop (Q-7-2 Rainbow)',
        handAAction: 'Check Back Or C-Bet Small With Overcard King And Backdoor Nut Flush Equity.',
        equityShift: 'AQo Takes A 78.2% Lead With Top Pair Aces Kicker While AKs Draws To Three Kings Or Backdoor Flush.',
      },
      {
        texture: 'Broadway Draw Flop (K-J-4 Rainbow)',
        handAAction: 'Bet Large For Value With Top Pair Ace Kicker While Blocking Villain Broadway Outs.',
        equityShift: 'AKs Holds 82.9% Equity While AQo Needs One Of Four Unseen Tens Or Three Queens.',
      },
    ],
    evAnalysis: {
      cash100bb:
        'AKs 3-Bets And 4-Bets Relentlessly For Value Because Getting Called By AQo Generates Massive Kicker Domination.',
      cash200bb:
        'Kicker Domination Becomes Even More Punishing At 200BB When AQo Calls Down Three Barrels On Ace-High Boards.',
      mtt25bb:
        'Getting All-In With AKs Against AQo At 25BB Is One Of The Highest-EV Non-Pair Scenarios In Tournament Poker.',
      icmFinalTable:
        'Dominating Villain Ace Kicker Protects Your Tournament Life With A 73.92% Equity Cushion.',
    },
    faqs: [
      {
        q: 'Why Do AKs And AQo Tie 4.80% Of The Time?',
        a: 'Because Both Hands Hold An Ace, Any Board With A Straight, Flush, Paired Top Cards, Or Three Higher Kickers Results In A Split Pot.',
      },
      {
        q: 'How Often Does AQo Hit A Queen Without An Ace Or King Appearing?',
        a: 'With Three Queens Remaining, AQo Wins Outright Only 23.68% Of The Time.',
      },
      {
        q: 'Should AQo Fold To A Tight 4-Bet At 100BB?',
        a: 'Yes. Against Early And Middle Position 4-Bets Weighted Toward AA, KK, QQ, And AK, AQo Suffers Severe Reverse Implied Odds And Domination.',
      },
    ],
  },
  {
    slug: 'ako-vs-aqs',
    title: 'AKo Vs AQs Offsuit Big Slick Vs Suited Ace-Queen Guide',
    handA: 'AKo',
    handB: 'AQs',
    category: 'Dominated Ace Or Broadway',
    handAWinPct: 66.85,
    handBWinPct: 28.19,
    tiePct: 4.96,
    handAEquity: 69.33,
    handBEquity: 30.67,
    combosA: 12,
    combosB: 4,
    summary:
      'Ace-King Offsuit Maintains A Strong 69.33% To 30.67% Equity Lead Over Ace-Queen Suited, Proving That Kicker Domination Far Outweighs The ~4.6% Equity Gained From Being Suited.',
    flopShifts: [
      {
        texture: 'Ace-High Rainbow Flop (A-9-4 Rainbow)',
        handAAction: 'Value Bet 66% Pot Across Flop, Turn, And River Against Dominated Top Pair.',
        equityShift: 'AKo Holds 84.8% Equity When AQs Does Not Flop A Flush Draw.',
      },
      {
        texture: 'Two-Tone Flop In AQs Suit (J-7-2 Two-Tone)',
        handAAction: 'Check Back Or Bet Small Unless Holding The King Blocker Of Villain Flush Suit.',
        equityShift: 'AQs Surges To 56.4% Equity With Nut Flush Draw Plus Three Queen Outs.',
      },
      {
        texture: 'King-Queen Two-Pair Flop (K-Q-5 Rainbow)',
        handAAction: 'Bet Large With Top Pair Ace Kicker Against Second Pair.',
        equityShift: 'AKo Commands 89.2% Equity While AQs Draws To Only Two Remaining Queens.',
      },
    ],
    evAnalysis: {
      cash100bb:
        'AKo 4-Bets For Value And Blocker Removal; AQs Prefers Calling 3-Bets In Position Rather Than 4-Betting Into AKo.',
      cash200bb:
        'AQs Plays Well Postflop In Single-Raised And 3-Bet Pots Thanks To Nut Flush Potential.',
      mtt25bb:
        'AKo Profits Handsomely Whenever AQs Calls A 25BB 3-Bet Or 4-Bet Shove.',
      icmFinalTable:
        'AKo Remains Substantially Stronger Than AQs In All-In Final Table Confrontations.',
    },
    faqs: [
      {
        q: 'Does Being Suited Make AQs A Favorite Over AKo?',
        a: 'No. Kicker Domination Keeps AKo Ahead 69.33% To 30.67%; Suitedness Only Improves AQs From 26.08% (AQo) To 30.67% (AQs).',
      },
      {
        q: 'What If AKo Holds The King Of AQs Suit?',
        a: 'When AKo Holds The King Matching AQs Suit, AKo Takes Away One Of AQs Flush Outs And Increases Its Equity To 70.4%.',
      },
      {
        q: 'When Is AQs Better To Flat-Call Than AKo?',
        a: 'In Multiway Deep-Stacked Pots Where AQs Can Make Nut Flushes That Win Multiway Showdowns.',
      },
    ],
  },
  {
    slug: 'kk-vs-qq',
    title: 'KK Vs QQ Overpair Cooler Equity And 4-Bet Guide',
    handA: 'KK',
    handB: 'QQ',
    category: 'Overpair Vs Underpair',
    handAWinPct: 81.48,
    handBWinPct: 18.04,
    tiePct: 0.48,
    handAEquity: 81.72,
    handBEquity: 18.28,
    combosA: 6,
    combosB: 6,
    summary:
      'Pocket Kings Crushes Pocket Queens With 81.72% To 18.28% Preflop Equity In One Of Hold\'em\'s Most Unavoidable 100BB 4-Bet And 5-Bet Overpair Coolers.',
    flopShifts: [
      {
        texture: 'Jack-High Under-Card Board (J-7-3 Rainbow)',
        handAAction: 'Bet 50% Flop, 66% Turn, And Jam River As Both Overpairs Commit Stacks.',
        equityShift: 'KK Holds 90.8% Equity While QQ Draws To Just Two Remaining Queens.',
      },
      {
        texture: 'Ace-High Board (A-8-2 Rainbow)',
        handAAction: 'Check Or Bet Small 25% Pot; Both Overpairs Slow Down Facing The Scary Ace.',
        equityShift: 'KK Still Commands 91.2% Equity Over QQ Even Though Both Fear An Ace.',
      },
      {
        texture: 'Queen-High Set Board (Q-9-4 Rainbow)',
        handAAction: 'Proceed Cautiously On Turn And River When Facing Check-Raises From Set Territory.',
        equityShift: 'QQ Flips The Matchup To 90.9% Equity With Top Set Queens.',
      },
    ],
    evAnalysis: {
      cash100bb:
        'Unavoidable 100BB Cooler In 6-Max Games. Both KK And QQ Are Mandatory 4-Bet And Stack-Off Hands From Cutoff, Button, And Blinds.',
      cash200bb:
        'At 200BB, QQ Calls 4-Bets Rather Than 5-Betting All-In, Potentially Saving Part Of Its Stack If An Ace Or King Appears Postflop.',
      mtt25bb:
        '100% Automatic Preflop All-In Cooler At 25BB.',
      icmFinalTable:
        'Even With ICM Pressure, Folding QQ Preflop At 25BB To 40BB Against Anyone Outside An Ultra-Nit Is Extremely Rare.',
    },
    faqs: [
      {
        q: 'Why Does QQ Have Slightly Higher Equity Vs KK (18.28%) Than KK Has Vs AA (17.82%)?',
        a: 'Because Queens Can Complete More Unblocked Low-End Straights (Such As Q-J-T-9-8) Without Helping Kings.',
      },
      {
        q: 'Can You Escape KK Vs QQ On A Low Flop At 100BB?',
        a: 'Virtually Never. In A 4-Bet Pot Where The Stack-To-Pot Ratio (SPR) Is Under 2.0, Both Overpairs Are Mathematically Committed On Any Jack-Or-Lower Flop.',
      },
      {
        q: 'What Happens When An Ace Flops In KK Vs QQ?',
        a: 'Ironically, An Ace On The Flop Often Saves QQ Money Because Both Players Check Down Fearing The Ace.',
      },
    ],
  },
  {
    slug: 'qq-vs-jj',
    title: 'QQ Vs JJ Overpair Vs Underpair Equity And 4-Bet Guide',
    handA: 'QQ',
    handB: 'JJ',
    category: 'Overpair Vs Underpair',
    handAWinPct: 81.24,
    handBWinPct: 18.26,
    tiePct: 0.50,
    handAEquity: 81.49,
    handBEquity: 18.51,
    combosA: 6,
    combosB: 6,
    summary:
      'Pocket Queens Dominates Pocket Jacks 81.49% To 18.51% Preflop, Punishing Over-Aggressive 4-Betting With Jacks While Rewarding QQ Across Low And Ten-High Flop Textures.',
    flopShifts: [
      {
        texture: 'Ten-High Connected Board (T-8-4 Rainbow)',
        handAAction: 'Value Bet 66% Pot Across Flop And Turn To Stack Overpair Jacks.',
        equityShift: 'QQ Holds 88.4% Equity While JJ Has Two Jack Outs Plus Backdoor Straight Chances.',
      },
      {
        texture: 'King-High Or Ace-High Board (K-7-2 Rainbow)',
        handAAction: 'Check Back Or Bet Small 25% Pot To Extract Thin Value From Pocket Jacks.',
        equityShift: 'QQ Retains 91.1% Equity Over JJ.',
      },
      {
        texture: 'Jack-High Board (J-6-3 Rainbow)',
        handAAction: 'Bet Flop And Evaluate Turn Raises Carefully When JJ Flops Top Set.',
        equityShift: 'JJ Takes A 90.8% Lead When Spiking One Of The Two Remaining Jacks.',
      },
    ],
    evAnalysis: {
      cash100bb:
        'QQ Always 4-Bets For Value; JJ Mixes Flat-Calling 3-Bets In Position To Avoid Isolating Itself Against QQ, KK, And AA.',
      cash200bb:
        'JJ Almost Always Flats 3-Bets And 4-Bets At 200BB Deep.',
      mtt25bb:
        'Standard 25BB All-In Cooler Where QQ Collects Full Double-Ups From JJ.',
      icmFinalTable:
        'QQ Presses Heavy Final Table Chip-Leader Pressure While JJ Must Weigh ICM Risk Against Covering Stacks.',
    },
    faqs: [
      {
        q: 'What Is The Exact Win Percentage Of QQ Against JJ?',
        a: 'Pocket Queens Wins 81.24% Of Boards, Pocket Jacks Wins 18.26%, And 0.50% End In A Tie For 81.49% Total QQ Equity.',
      },
      {
        q: 'Should JJ Call A 4-Bet Or 5-Bet Shove At 100BB?',
        a: 'Against Early Or Middle Position 4-Bets, JJ Prefers Flatting In Position Or Folding To 5-Bet Shoves Because QQ+ Heavily Outweighs Bluffs.',
      },
      {
        q: 'Does JJ Block Straight Outs For QQ?',
        a: 'Yes, JJ Blocks Queen-High Straights, While QQ Simultaneously Blocks Jack-High Broadway Straights.',
      },
    ],
  },
  {
    slug: 'jj-vs-tt',
    title: 'JJ Vs TT Overpair Equity And 3-Bet Pot Strategy Guide',
    handA: 'JJ',
    handB: 'TT',
    category: 'Overpair Vs Underpair',
    handAWinPct: 81.09,
    handBWinPct: 18.39,
    tiePct: 0.52,
    handAEquity: 81.35,
    handBEquity: 18.65,
    combosA: 6,
    combosB: 6,
    summary:
      'Pocket Jacks Holds An 81.35% To 18.65% Preflop Equity Lead Over Pocket Tens, Generating Major Value In Late-Position 3-Bet Pots And 25BB Tournament Shoves.',
    flopShifts: [
      {
        texture: 'Nine-High Board (9-6-2 Rainbow)',
        handAAction: 'Value Bet 66% Pot Across All Three Streets Against Second Overpair TT.',
        equityShift: 'JJ Commands 88.1% Equity When All Board Cards Land Below A Ten.',
      },
      {
        texture: 'Queen-Eight-Four Board (Q-8-4 Rainbow)',
        handAAction: 'Bet Small 33% Pot Or Check-Call To Get Thin Value From TT.',
        equityShift: 'JJ Holds 90.9% Equity Because Both Pairs Trail A Queen.',
      },
      {
        texture: 'Ten-High Board (T-7-3 Rainbow)',
        handAAction: 'Respect Check-Raises And Turn Overbets When TT Flops Top Set.',
        equityShift: 'TT Surges To 90.7% Equity Upon Flopping Top Set Tens.',
      },
    ],
    evAnalysis: {
      cash100bb:
        'In Button Vs Cutoff And Blind Vs Button 3-Bet Pots, JJ Extracts 100BB Stacks From TT On Low Runouts.',
      cash200bb:
        'Both Hands Play Single-Raised Or Flat-Called 3-Bet Pots With Focus On Set-Mining And Pot Control.',
      mtt25bb:
        'Unavoidable 25BB Tournament Cooler Where Both JJ And TT Profitably Jam Or Call.',
      icmFinalTable:
        'JJ Dominates Medium-Pair Shove Ranges At Final Tables.',
    },
    faqs: [
      {
        q: 'Why Does TT Have 18.65% Equity Vs JJ?',
        a: 'In Addition To Two Set Outs (11.8% On The Flop), TT Picks Up Low-End Straight Outs Like T-9-8-7-6 That Do Not Include A Jack.',
      },
      {
        q: 'On What Boards Do JJ And TT Split The Pot?',
        a: 'They Tie 0.52% Of The Time When A Five-Card Straight, Flush, Or Higher Two-Pair Plays On The Board.',
      },
      {
        q: 'How Should TT Play Facing A 3-Bet From A Tight Player?',
        a: 'Call In Position To Set-Mine And Realize Equity On Low Flops Without Bloating The Pot Preflop.',
      },
    ],
  },
  {
    slug: 'aks-vs-jts',
    title: 'AKs Vs JTs Suited Broadway Vs Suited Connector Guide',
    handA: 'AKs',
    handB: 'JTs',
    category: 'Dominated Ace Or Broadway',
    handAWinPct: 60.21,
    handBWinPct: 39.26,
    tiePct: 0.53,
    handAEquity: 60.48,
    handBEquity: 39.52,
    combosA: 4,
    combosB: 4,
    summary:
      'Ace-King Suited Leads Jack-Ten Suited 60.48% To 39.52% Preflop, Though JTs Retains Nearly 40% Equity Thanks To Four Unblocked Live Cards And Maximum Straight-And-Flush Connectivity.',
    flopShifts: [
      {
        texture: 'Queen-Nine-Two Flop (Q-9-2 Rainbow)',
        handAAction: 'Check-Call Small Bets Or Fold To Heavy Action Against Open-Ended JTs.',
        equityShift: 'JTs Jumps To 51.8% Equity With An Eight-Out Open-Ended Straight Draw Plus Two Live Pair Cards.',
      },
      {
        texture: 'Ace-King-Queen Broadway Flop (A-K-Q Rainbow)',
        handAAction: 'Proceed Carefully With Top Two Pair Because JTs Flops The Nut Broadway Straight.',
        equityShift: 'JTs Commands 83.4% Equity With Flopped Broadway While AKs Draws To Four Aces Or Kings For A Full House.',
      },
      {
        texture: 'King-Seven-Three Flop (K-7-3 Rainbow)',
        handAAction: 'Bet 66% Pot For Value And Equity Denial.',
        equityShift: 'AKs Surges To 86.2% Equity With Top Pair Top Kicker.',
      },
    ],
    evAnalysis: {
      cash100bb:
        'AKs 3-Bets And 4-Bets For Value; JTs Is One Of The Best Hands In Poker To Call 3-Bets In Position Due To High Equity Realization.',
      cash200bb:
        'At 200BB Deep, JTs Thrives In Position Against AKs Because Flushes And Straights Disguise Well Against Top Pair.',
      mtt25bb:
        'AKs Dominates All-In Spots At 60.5% Equity While JTs Prefers Opening Or Calling With Postflop Playability.',
      icmFinalTable:
        'AKs Presses Big Stack Pressure; JTs Avoids Calling Off Stacks Under ICM.',
    },
    faqs: [
      {
        q: 'Why Does JTs Have Almost 40% Equity Against AKs?',
        a: 'Because JTs Has Two Live Cards (Jack And Ten) That Are Not Dominated By Ace Or King, Plus Full Suited And Connected Straight Potential.',
      },
      {
        q: 'What Happens If AKs And JTs Have The Same Suit?',
        a: 'When AKs And JTs Share The Same Suit, AKs Equity Rises To 63.8% Because AKs Dominates All Five-Card Flush Runouts.',
      },
      {
        q: 'Why Is JTs Called The Best Hand Against Aces And Big Slick?',
        a: 'JTs Makes More Straights Than Any Other Starting Hand In Hold\'em And Never Suffers From Single-Card Kicker Domination Against AA Or AK.',
      },
    ],
  },
  {
    slug: 'aa-vs-72o',
    title: 'AA Vs 72o Best Hand Vs Worst Hand Preflop Odds Guide',
    handA: 'AA',
    handB: '72o',
    category: 'Dominated Ace Or Broadway',
    handAWinPct: 87.59,
    handBWinPct: 11.96,
    tiePct: 0.45,
    handAEquity: 87.82,
    handBEquity: 12.18,
    combosA: 6,
    combosB: 12,
    summary:
      'Pocket Aces Beats Seven-Deuce Offsuit 87.82% To 12.18% Preflop, Illustrating The Fundamental Law Of Hold\'em Equity: Even The Worst Starting Hand Wins Roughly 1 In 8 All-In Confrontations Against Pocket Rockets.',
    flopShifts: [
      {
        texture: 'Seven-Deuce Two-Pair Flop (7-2-J Rainbow)',
        handAAction: 'Bet Flop And Re-Evaluate If Villain Check-Raises All-In In A 7-2 Prop Bet Game.',
        equityShift: '72o Jumps To 73.6% Equity With Flopped Two Pair, While AA Still Has 26.4% Equity To Counterfeit The Board.',
      },
      {
        texture: 'Ace-High Board (A-9-4 Rainbow)',
        handAAction: 'Bet Small To Induce Bluffs Or Extracts Value.',
        equityShift: 'AA Locks Up 99.8% Equity With Top Set.',
      },
      {
        texture: 'Paired Board Counterfeit (T-T-8 Rainbow)',
        handAAction: 'Bet Unrelentingly Because Any Single Seven Or Deuce Pair For 72o Gets Counterfeited By Higher Board Pairs.',
        equityShift: 'AA Holds 94.1% Equity.',
      },
    ],
    evAnalysis: {
      cash100bb:
        'Only Encountered When Playing The Live Cash Game 7-2 Bounty Prop Game. Adjust By 3-Betting AA Larger To Charge 72o Bounty Hunters.',
      cash200bb:
        'In 7-2 Bounty Games At 200BB, Never Slowplay AA Preflop; Make 72o Pay Maximum BB Before Seeing A Flop.',
      mtt25bb:
        'Occurs When Big Blind Is Forced All-In Or Defends Ultrawide Against A Min-Raise.',
      icmFinalTable:
        'Shows Why Even A 88% Favorite Still Loses 12% Of The Time When Calling All-In.',
    },
    faqs: [
      {
        q: 'Does AA Have Higher Equity Against 72o Or Against AKo?',
        a: 'Surprisingly, AA Has HIGHER Equity Against AKo (87.9%) And A7o (90.4%) Than Against 72o (87.82%) Because 72o Has Two Live Unblocked Ranks To Make Two Pair Or Trips.',
      },
      {
        q: 'Which Starting Hand Actually Has The Lowest Equity Against Pocket Aces?',
        a: 'Ace-Six Offsuit (A6o) And Ace-Seven Offsuit Sharing A Suit With AA Have The Lowest Equity Against AA (~8.8% Equity) Because The Ace Is Dead And They Cannot Make A Wheel Straight.',
      },
      {
        q: 'How Does 72o Beat Pocket Aces?',
        a: '72o Wins By Making Two Pair (Sevens And Deuces), Trips, Full Houses, Or A Four-Card Runout Straight Or Flush.',
      },
    ],
  },
  {
    slug: 'aa-vs-jts',
    title: 'AA Vs JTs Pocket Aces Vs Jack-Ten Suited Equity Guide',
    handA: 'AA',
    handB: 'JTs',
    category: 'Pair Vs Suited Connectors',
    handAWinPct: 79.16,
    handBWinPct: 20.44,
    tiePct: 0.40,
    handAEquity: 79.36,
    handBEquity: 20.64,
    combosA: 6,
    combosB: 4,
    summary:
      'Jack-Ten Suited Achieves 20.64% Preflop Equity Against Pocket Aces (79.36%), Making Suited Connectors The Single Highest-Equity Non-Pair Hands Against AA.',
    flopShifts: [
      {
        texture: 'Queen-Nine-Two Two-Tone Flop (Q-9-2 With JTs Suit)',
        handAAction: 'Call Or Jam Carefully Because JTs Holds A 15-Out Open-Ended Straight And Flush Combo Draw.',
        equityShift: 'JTs Surges To A 55.8% Statistical Favorite Over Unimproved Pocket Aces.',
      },
      {
        texture: 'Jack-Ten Two-Pair Flop (J-T-4 Rainbow)',
        handAAction: 'Call Flop And Look To Pair The Board On Turn Or River To Counterfeit JTs Two Pair.',
        equityShift: 'JTs Leads 71.9% To 28.1%, Though AA Has Two Aces Plus Six Board-Pairing Outs.',
      },
      {
        texture: 'Ace-High Dry Flop (A-8-3 Rainbow)',
        handAAction: 'Bet Small 25% Pot With Top Set Aces.',
        equityShift: 'AA Commands 98.4% Equity.',
      },
    ],
    evAnalysis: {
      cash100bb:
        'AA 3-Bets And 4-Bets Large Out Of Position So JTs Cannot Profitably Realize Its 20.6% Equity At Low Cost.',
      cash200bb:
        'At 200BB Deep, JTs Can Profitably Call 3-Bets In Position Against AA Because Implied Odds On Straight And Flush Boards Pay Off.',
      mtt25bb:
        'At 25BB, Stack-To-Pot Ratios Are Too Shallow For JTs To Call 3-Bets Against AA.',
      icmFinalTable:
        'AA Dominates 4-To-1 In All-In Final Table Situations.',
    },
    faqs: [
      {
        q: 'Which Hand Has The Best Odds Of Cracking Pocket Aces?',
        a: 'Suited Connectors Like JTs, T9s, 98s, 87s, And 76s (When Not Sharing A Suit With AA) Hold The Highest Preflop Equity Against Pocket Aces At 20.6% To 22.8%.',
      },
      {
        q: 'How Much Equity Does JTs Lose If AA Holds Its Suit?',
        a: 'If One Of The Aces Matches JTs Suit, JTs Drops From 21.8% (Unblocked Suit) To 18.3% Because AA Holds The Nut Flush Blocker.',
      },
      {
        q: 'Why Can JTs Become A Favorite Over AA On The Flop?',
        a: 'Any Open-Ended Straight And Flush Combo Draw Gives JTs 15 Clean Outs Twice (54% To 56% Equity), Outdrawing Unimproved AA More Than Half The Time.',
      },
    ],
  },
  {
    slug: 'qq-vs-ako',
    title: 'QQ Vs AKo Classic Coinflip Equity And 4-Bet Pot Guide',
    handA: 'QQ',
    handB: 'AKo',
    category: 'Classic Race (Coinflip)',
    handAWinPct: 56.55,
    handBWinPct: 43.06,
    tiePct: 0.39,
    handAEquity: 56.75,
    handBEquity: 43.25,
    combosA: 6,
    combosB: 12,
    summary:
      'Pocket Queens Holds A Strong 56.75% To 43.25% Preflop Equity Lead Over Ace-King Offsuit Across 72 Combo Pairings, Making QQ A Substantial 13.5% Favorite In Standard 100BB All-In Races.',
    flopShifts: [
      {
        texture: 'Ten-Six-Deuce Rainbow Flop (T-6-2)',
        handAAction: 'Bet 50% To 66% Pot For Value And Protection.',
        equityShift: 'QQ Holds 75.2% Equity Against Six Unimproved Overcard Outs.',
      },
      {
        texture: 'Ace-Seven-Three Flop (A-7-3 Rainbow)',
        handAAction: 'Check Back Or Check-Fold Against Uncapped Aggression.',
        equityShift: 'AKo Takes A 91.1% Lead With Top Pair Top Kicker.',
      },
      {
        texture: 'Jack-Ten-Four Flop (J-T-4 Rainbow)',
        handAAction: 'Bet 66% Pot To Charge AKo Four Queen Broadway Gutshot Outs And Six Overcard Outs.',
        equityShift: 'QQ Holds 65.4% Equity Because QQ Blocks Two Of AKo Queen Outs.',
      },
    ],
    evAnalysis: {
      cash100bb:
        'QQ Always Stacks Off Profitably Against AKo At 100BB. Because There Are 12 Combos Of AKo vs Only 4 Of AKs, Three-Quarters Of All AK Hands QQ Faces Are Offsuit.',
      cash200bb:
        'Flat 4-Bets In Position At 200BB And Press Heavy Value When The Flop Avoids An Ace Or King.',
      mtt25bb:
        'Mandatory 100% All-In Commit For Both QQ And AKo At 25BB.',
      icmFinalTable:
        'QQ Is A Premier Final Table Reshove And Call Hand With A 56.75% Edge Over AKo.',
    },
    faqs: [
      {
        q: 'Why Is QQ A 56.75% Favorite Over AKo Instead Of 50/50?',
        a: 'Because QQ Already Has A Made Pair, AKo Lacks Flush Draws Unless Four Board Cards Share A Suit, And QQ Blocks Ace-King-Queen-Jack-Ten Straights.',
      },
      {
        q: 'What Percentage Of All AK Combinations Are Offsuit (AKo)?',
        a: 'Out Of 16 Total AK Combinations, 12 Are AKo (75%) And Only 4 Are AKs (25%).',
      },
      {
        q: 'How Often Does QQ Hold Up Against AKo All-In Preflop?',
        a: 'QQ Wins Or Ties 56.94% Of The Time (Winning 56.55% Outright And Splitting 0.39%).',
      },
    ],
  },
  {
    slug: 'tt-vs-aks',
    title: 'TT Vs AKs Preflop Race Equity And Broadway Blocker Guide',
    handA: 'TT',
    handB: 'AKs',
    category: 'Classic Race (Coinflip)',
    handAWinPct: 53.86,
    handBWinPct: 45.73,
    tiePct: 0.41,
    handAEquity: 54.07,
    handBEquity: 45.93,
    combosA: 6,
    combosB: 4,
    summary:
      'Pocket Tens Leads Ace-King Suited 54.07% To 45.93% Preflop Because TT Blocks Half Of The Tens Needed For AKs To Complete A Broadway Straight, Making TT Nearly Identical To QQ And JJ In Equity Vs AKs.',
    flopShifts: [
      {
        texture: 'Eight-Five-Deuce Flop (8-5-2 Rainbow)',
        handAAction: 'Bet 66% Pot Immediately To Deny Overcard Realization.',
        equityShift: 'TT Commands 73.6% Equity On A Clean Low Flop.',
      },
      {
        texture: 'Queen-Jack-Four Flop (Q-J-4 Two-Tone)',
        handAAction: 'Check-Fold Facing Heavy Action Despite Blocking Two Ten Outs.',
        equityShift: 'AKs Holds 56.9% Equity With Overcards, Gutshot, And Flush Equity.',
      },
      {
        texture: 'Ten-Seven-Three Flop (T-7-3 Rainbow)',
        handAAction: 'Bet For Value And Stack Off With Top Set Tens.',
        equityShift: 'TT Locks Up 96.2% Equity With Top Set.',
      },
    ],
    evAnalysis: {
      cash100bb:
        'TT Calls 3-Bets And Selectively 4-Bets In Late-Position Battles Where AKs Is A High-Frequency Opponent Hand.',
      cash200bb:
        'Flat 3-Bets In Position And Play For Sets And Low-Board Overpair Value.',
      mtt25bb:
        'Unconditional 25BB 3-Bet Jam From Late Position And Blinds.',
      icmFinalTable:
        'TT Holds Strong 54.1% Equity When Called By AKs At Final Tables.',
    },
    faqs: [
      {
        q: 'Why Do QQ, JJ, And TT All Have Almost Identical Equity (~54%) Against AKs?',
        a: 'Because Every One Of Those Three Pairs (QQ, JJ, And TT) Blocks Exactly Two Cards That AKs Needs To Make An A-K-Q-J-T Broadway Straight.',
      },
      {
        q: 'Is TT Better Against AKs Than 99 Is?',
        a: 'Yes. TT Has 54.07% Equity Against AKs Compared To 52.53% For 99, A +1.54% Edge Purely From Blocking Broadway.',
      },
      {
        q: 'Does Sharing A Suit With AKs Help Pocket Tens?',
        a: 'Yes. When One Of Your Tens Matches AKs Suit, TT Blocks One Flush Out And Rises To 54.8% Equity.',
      },
    ],
  },
  {
    slug: 'aqs-vs-jj',
    title: 'AQs Vs JJ Suited Ace-Queen Vs Pocket Jacks Guide',
    handA: 'AQs',
    handB: 'JJ',
    category: 'Classic Race (Coinflip)',
    handAWinPct: 45.92,
    handBWinPct: 53.66,
    tiePct: 0.42,
    handAEquity: 46.13,
    handBEquity: 53.87,
    combosA: 4,
    combosB: 6,
    summary:
      'Ace-Queen Suited Holds 46.13% Preflop Equity Against Pocket Jacks (53.87%), Mirroring The Exact Mathematical Structure Of AKs Vs QQ With Two Overcards Plus Suited Flush Potential.',
    flopShifts: [
      {
        texture: 'Ace-High Or Queen-High Flop (A-8-3 Or Q-7-2)',
        handAAction: 'Bet For Three Streets Of Value With Top Pair Over Pocket Jacks.',
        equityShift: 'AQs Surges To 89.4% Equity When Pairing Its Ace Or Queen.',
      },
      {
        texture: 'King-Ten-Four Two-Tone Flop (K-T-4 With AQs Suit)',
        handAAction: 'Semi-Bluff All-In With Royal Flush Draw, Nut Flush Draw, Gutshot, And Ace Overcard.',
        equityShift: 'AQs Becomes A 61.2% Favorite Over Pocket Jacks.',
      },
      {
        texture: 'Nine-Six-Deuce Rainbow Flop (9-6-2)',
        handAAction: 'Check Back And Take A Free Card To Realize Six Overcard Outs.',
        equityShift: 'AQs Drops To 26.7% Equity On A Dry Low Flop.',
      },
    ],
    evAnalysis: {
      cash100bb:
        'AQs 3-Bets For Value And Calls 4-Bets In Position At 100BB In Late-Position Wars.',
      cash200bb:
        'Flat 3-Bets Or 4-Bets In Position To Leverage Suited Nut Advantage Postflop.',
      mtt25bb:
        'High-EV 25BB Re-Steal 3-Bet Shove From Cutoff, Button, And Small Blind.',
      icmFinalTable:
        'Prefer Shoving AQs First Rather Than Calling Off Against Early-Position Ranges.',
    },
    faqs: [
      {
        q: 'Why Does AQs Vs JJ Have The Exact Same Equity As AKs Vs QQ?',
        a: 'Because In Both Matchups The Suited Hand Holds Two Overcards To The Pair And Both Hands Compete For The Same A-K-Q-J-T Broadway Straight.',
      },
      {
        q: 'What Is The Equity Of Offsuit AQo Against JJ?',
        a: 'Offsuit AQo Drops To 43.2% Equity Against JJ Compared To 46.13% For Suited AQs.',
      },
      {
        q: 'How Often Does AQs Flop A Pair Or Flush Draw?',
        a: 'AQs Flops Either A Pair Of Aces/Queens Or A Four-Flush Draw Roughly 41.2% Of The Time.',
      },
    ],
  },
  {
    slug: 'kqs-vs-ajo',
    title: 'KQs Vs AJo Live Suited Broadway Vs Ace-Jack Guide',
    handA: 'KQs',
    handB: 'AJo',
    category: 'Dominated Ace Or Broadway',
    handAWinPct: 41.48,
    handBWinPct: 57.96,
    tiePct: 0.56,
    handAEquity: 41.76,
    handBEquity: 58.24,
    combosA: 4,
    combosB: 12,
    summary:
      'King-Queen Suited Holds 41.76% Preflop Equity Against Ace-Jack Offsuit (58.24%), Making KQs One Of The Highest-Realizing Underdog Hands In Hold\'em Thanks To Six Live Overcard Outs To Villain Jack Plus Flush And Straight Connectivity.',
    flopShifts: [
      {
        texture: 'King-High Or Queen-High Flop (K-8-4 Or Q-9-3)',
        handAAction: 'Bet 50% To 66% Pot For Value With Top Pair While AJo Is Left With Only Three Ace Outs.',
        equityShift: 'KQs Surges To 84.6% Equity Over Unimproved AJo.',
      },
      {
        texture: 'Jack-Ten-Three Flop (J-T-3 Rainbow)',
        handAAction: 'Bet Or Raise With An Open-Ended Straight Draw Plus Two Overcards (14 Outs).',
        equityShift: 'KQs Takes A 52.4% Equity Lead Even Though AJo Flopped Top Pair Jacks.',
      },
      {
        texture: 'Ace-Seven-Deuce Flop (A-7-2 Rainbow)',
        handAAction: 'Check-Fold Unless Holding A Backdoor Flush And Straight Draw.',
        equityShift: 'AJo Commands 88.9% Equity With Top Pair Aces.',
      },
    ],
    evAnalysis: {
      cash100bb:
        'KQs Outperforms AJo In Multiway And 3-Bet Cash Game Pots Because KQs Realizes Equity Cleanly While AJo Suffers Reverse Implied Odds Against AK And AQ.',
      cash200bb:
        'At 200BB Deep, KQs Is Significantly Higher EV Than AJo Due To King-High Flush And Broadway Straight Potential.',
      mtt25bb:
        'At 25BB All-In, AJo Wins More Raw Showdowns (58.24%) Because Ace-High Holds Up When Both Hands Miss.',
      icmFinalTable:
        'AJo Has Better Raw All-In High-Card Value, While KQs Plays Better As A Postflop Open Or Flat.',
    },
    faqs: [
      {
        q: 'Why Is AJo A 58.2% Favorite Over KQs All-In Preflop?',
        a: 'When Neither Player Pairs The Board (Roughly 38% Of Runouts), AJo Wins Automatically With Ace-High.',
      },
      {
        q: 'Why Do Solvers Prefer KQs Over AJo In 3-Bet Pots?',
        a: 'Because Against A 3-Bet Or Call Range, AJo Is Frequently Dominated By AK And AQ, Whereas KQs Has Live Cards, Flush Draws, And Superior Postflop Playability.',
      },
      {
        q: 'What Is KQo Offsuit Equity Against AJo?',
        a: 'Without Suited Flush Runouts, Offsuit KQo Drops To 38.4% Equity Against AJo.',
      },
    ],
  },
  {
    slug: '66-vs-ako',
    title: '66 Vs AKo Small Pair Vs Big Slick Equity Guide',
    handA: '66',
    handB: 'AKo',
    category: 'Classic Race (Coinflip)',
    handAWinPct: 54.48,
    handBWinPct: 45.06,
    tiePct: 0.46,
    handAEquity: 54.71,
    handBEquity: 45.29,
    combosA: 6,
    combosB: 12,
    summary:
      'Pocket Sixes Maintains A 54.71% To 45.29% Preflop Lead Over Ace-King Offsuit, Proving That Small Pocket Pairs Remain Clear Statistical Favorites Against Unpaired Offsuit Broadway Hands.',
    flopShifts: [
      {
        texture: 'Six-High Set Flop (6-4-2 Or K-6-3)',
        handAAction: 'Fast-Play Or Check-Raise All-In When Flopping A Set Against AKo.',
        equityShift: '66 Commands 92.8% To 98.4% Equity With A Flopped Set.',
      },
      {
        texture: 'Unpaired Overcard Flop (J-9-3 Rainbow)',
        handAAction: 'Check-Call One Small Bet Or Bet Small To Deny Free Turn Cards.',
        equityShift: '66 Still Leads 66.8% To 33.2% Because AKo Remains Unpaired.',
      },
      {
        texture: 'Double-Paired High Board (Q-Q-T-T)',
        handAAction: 'Check-Fold On The River Because Sixes Have Been Counterfeited.',
        equityShift: 'AKo Wins 100% Of The Pot With Queens And Tens Ace Kicker.',
      },
    ],
    evAnalysis: {
      cash100bb:
        'Open-Raise From All 6-Max Positions And Call Raises In Position To Set-Mine.',
      cash200bb:
        'High-Profit Deep-Stack Set-Mining Hand.',
      mtt25bb:
        'Profitable 20BB Open-Jam Or Late-Position Re-Steal Shove.',
      icmFinalTable:
        'Shove First From Late Position; Avoid Calling Covered Stacks With 66.',
    },
    faqs: [
      {
        q: 'Why Does 66 Have 4.3% More Equity Vs AKo Than 22 Does?',
        a: 'Because Cards Ranked 3, 4, And 5 Are Below Sixes, Meaning Paired 3s, 4s, Or 5s On The Board Do Not Counterfeit Pocket Sixes The Way They Counterfeit Pocket Deuces.',
      },
      {
        q: 'Does 66 Block Any Straight Outs For AKo?',
        a: 'No, 66 Does Not Block Broadway (A-K-Q-J-T), Though It Blocks Wheel-Adjacent Low Straights.',
      },
      {
        q: 'What Is 66 Equity Against Suited AKs?',
        a: 'Against Suited AKs, Pocket Sixes Holds 51.92% Equity To 48.08%.',
      },
    ],
  },
  {
    slug: '55-vs-kts',
    title: '55 Vs KTs Small Pair Vs Suited Broadway Equity Guide',
    handA: '55',
    handB: 'KTs',
    category: 'Pair Vs Suited Connectors',
    handAWinPct: 50.84,
    handBWinPct: 48.68,
    tiePct: 0.48,
    handAEquity: 51.08,
    handBEquity: 48.92,
    combosA: 6,
    combosB: 4,
    summary:
      'Pocket Fives Holds A Narrow 51.08% To 48.92% Preflop Edge Over King-Ten Suited, Demonstrating A Textbook Blind-Vs-Button Race Between A Small Pair And Two Suited Overcards.',
    flopShifts: [
      {
        texture: 'Wheel Draw Low Flop (4-3-2 Rainbow)',
        handAAction: 'Bet Large With Overpair Plus Open-Ended Straight Draw.',
        equityShift: '55 Commands 81.4% Equity.',
      },
      {
        texture: 'Queen-Jack-Three Two-Tone Flop (Q-J-3)',
        handAAction: 'Check-Fold Immediately Facing KTs Open-Ended Straight And Overcard Draw.',
        equityShift: 'KTs Surges To 56.2% Equity Even Without A Flush Draw (And 68.4% With A Flush Draw).',
      },
      {
        texture: 'Five-High Set Flop (K-5-2 Rainbow)',
        handAAction: 'Check-Raise Or Value Bet Three Streets Against Top Pair Kings.',
        equityShift: '55 Locks Up 91.5% Equity With Middle Set Over Top Pair.',
      },
    ],
    evAnalysis: {
      cash100bb:
        '55 Calls In Position For Set Value While KTs Opens And 3-Bets Frequently From Late Position.',
      cash200bb:
        'Both Hands Play Deep-Stacked Postflop Pots Focusing On Sets, Straights, And Flushes.',
      mtt25bb:
        'Common Blind-Vs-Button 20BB To 25BB All-In Confrontation.',
      icmFinalTable:
        '55 Prefers Open-Jamming Over Calling; KTs Can Profitably Shove First With Blocker Removal.',
    },
    faqs: [
      {
        q: 'Why Is 55 Vs KTs Closer To 50/50 Than 55 Vs AKo?',
        a: 'Because KTs Is Both Suited (+2.8% Equity) And Connected Enough To Make Queen-High And King-High Straights That 55 Cannot Block.',
      },
      {
        q: 'Can Pocket Fives Make A Wheel Straight?',
        a: 'Yes, Pocket Fives Is A Key Card In Every A-2-3-4-5 And 5-6-7-8-9 Straight.',
      },
      {
        q: 'What Happens When 55 Shares A Suit With KTs?',
        a: 'When One Of The Fives Matches KTs Suit, 55 Blocks One Flush Out And Rises To 52.1% Equity.',
      },
    ],
  },
];
