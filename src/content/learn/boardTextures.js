/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  CANONICAL FLOP BOARD TEXTURE ENCYCLOPEDIA (src/content/learn/boardTextures.js)
 * ═══════════════════════════════════════════════════════════════════════════════
 * Authoritative source of truth for /learn/board-textures and /learn/board-textures/[slug].
 * Covers 12 canonical No-Limit Hold'em flop archetypes with IP vs OOP range
 * advantage, nut advantage, GTO continuation bet frequency %, optimal C-bet
 * sizing (33%, 50%, 75%, Check), check-raise frequency %, best turn barrel
 * cards, and 1-click links to /tools/board-texture-analyzer.
 *
 * House style: Title Case, zero em dashes.
 */

export const BOARD_TEXTURES_AS_OF = '2026-11-24';
export const BOARD_TEXTURES_BASE_PATH = '/learn/board-textures';
export const BOARD_TEXTURES_URL = 'https://smarter.poker/learn/board-textures';

export function boardTexturePath(slug) {
  return `/learn/board-textures/${slug}`;
}

export const BOARD_TEXTURE_CATEGORIES = [
  'Static Dry High',
  'Dynamic Connected',
  'Monotone & Flush-Heavy',
  'Paired & Trips Boards',
];

const BOARD_TEXTURE_ALIASES = {
  'ace-high-dry': 'ace-high-dry-rainbow',
  'a72r': 'ace-high-dry-rainbow',
  'king-high-dry': 'king-high-disconnected-dry',
  'k72r': 'king-high-disconnected-dry',
  'broadway-connected': 'broadway-heavy-connected',
  'qjt': 'broadway-heavy-connected',
  'middling-connected': 'middling-connected-two-tone',
  'jt9': 'middling-connected-two-tone',
  'low-connected': 'low-connected-dynamic',
  '876': 'low-connected-dynamic',
  'monotone': 'monotone-single-suit-flop',
  'monotone-flop': 'monotone-single-suit-flop',
  'high-paired': 'high-paired-dry-board',
  'kk4': 'high-paired-dry-board',
  'low-paired': 'low-paired-texture',
  '744': 'low-paired-texture',
  'double-broadway': 'double-broadway-two-tone',
  'kq5': 'double-broadway-two-tone',
  'wheel-ace': 'wheel-ace-low-connected',
  'a54': 'wheel-ace-low-connected',
  'disconnected-rags': 'disconnected-rainbow-rags',
  '952r': 'disconnected-rainbow-rags',
  'trips-flop': 'trips-on-board-flop',
  '888': 'trips-on-board-flop',
};

export const BOARD_TEXTURES = [
  {
    slug: 'ace-high-dry-rainbow',
    code: 'A-7-2r',
    exampleBoard: 'As 7d 2c',
    analyzerQuery: 'As7d2c',
    name: 'Ace-High Dry Rainbow Flop (A-7-2r)',
    title: 'Ace-High Dry Flop C-Bet Strategy Guide',
    h1: 'Ace-High Dry Rainbow Flop (A-7-2r) GTO C-Bet Strategy & Range Advantage',
    category: 'Static Dry High',
    rangeAdvantage: 'Heavy In-Position Preflop Raiser (+58% To 42% Equity)',
    nutAdvantage: 'In-Position Raiser (AA, 77, AK, AQ Uncapped)',
    gtoCbetFreq: '88% - 96% (Near-Range C-Bet)',
    optimalCbetSize: '33% Pot',
    checkRaiseFreq: '6% - 8% (Low Defender XR)',
    bestTurnBarrels: 'King, Queen, Jack, And Offsuit Paint Overcards (Ks, Qd, Jh)',
    summary:
      'Ace-High Dry Rainbow Flops (Such As As 7d 2c Or Ah 8c 3d) Represent The Strongest Static Range-Advantage Texture For The Preflop Raiser. Because The Opener Holds All Pocket Aces, AK, AQ, And Strong Ax While The Big Blind Defender Lacks Two-Pair Combinations And Straight Draws, Solvers Recommend An 88% To 96% Small 33% Pot Range Continuation Bet.',
    ipStrategy: [
      'Simplify To A Near-100% Range Continuation Bet Sized At 25% To 33% Pot In Single-Raised Pots (BTN Vs BB Or UTG Vs BB).',
      'Include Underpairs (88-KK), Broadway Overcards (KQs, QJs), And Backdoor Wheel Gutshots (65s, 54s) In Your Small 33% Bet Range To Deny The Big Blind\'s 6-Out Overcard Equity.',
      'Size Up To A Polarized 75% To 125% Turn Barrel When A Broadway Card (K, Q, J) Lands On The Turn, Or Check Back Medium Ax And Underpairs For Pot Control.',
    ],
    oopDefenseStrategy: [
      'Avoid Over-Check-Raising: Because The Preflop Raiser Holds All Top Set AA And Top-Kicker Ax Combinations, Check-Raise Only ~6% To 8% Centered Around 77, 22, A7s, A2s, And Backdoor Wheel Bluffs (54s, 65s).',
      'Float The Small 33% Flop C-Bet With Weak Ax, Pocket Pairs 33-99, And Suited Broadways Holding A Backdoor Flush Draw.',
      'Lead Or Probe-Bet Low Pairing Turn Cards (7x Or 2x) If The Preflop Raiser Checks Back The Flop.',
    ],
    turnBarrelRules:
      'Double-Barrel Aggressively (75% To 100% Pot) On Broadway Turn Cards (K, Q, J) That Improve Your Range\'s Secondary Equity, While Slowing Down On Low Turn Cards (3, 4, 5, 6) That Complete The Big Blind\'s Wheel Straight And Two-Pair Region.',
    faqs: [
      {
        q: 'Why Do Solvers Bet 33% Pot With Pocket Kings (KK) On An A-7-2 Rainbow Flop?',
        a: 'Although Pocket Kings Is Vulnerable To An Ace, The Preflop Raiser Holds So Many More Aces Than The Big Blind That KK Still Retains Over 68% Equity Against The Defender\'s Total Range. Betting 33% Pot Extracts Value From 7x, 88-QQ, And Folds Out Live Equity.',
      },
      {
        q: 'How Should My Strategy Change On A-7-2 In A Multiway 3-Way Or 4-Way Pot?',
        a: 'Never Range-C-Bet 100% In Multiway Pots. Once Two Or Three Opponents See An Ace-High Flop, Collective Defender Ax Density Doubles; Check Your Underpairs (99-KK) And Bet Only Top Pair Good Kicker+ And Nut Backdoor Draws.',
      },
      {
        q: 'What Hands Make The Best Flop Check-Raise Bluffs For The Big Blind On A-7-2 Rainbow?',
        a: 'Backdoor Wheel Connectors With A Backdoor Flush Draw (Such As 5s 4s, 6s 5s, And 4s 3s) Because They Can Turn Open-Ended Straight And Flush Equity To Barrel Overcards.',
      },
    ],
  },
  {
    slug: 'king-high-disconnected-dry',
    code: 'K-7-2r',
    exampleBoard: 'Ks 7h 2d',
    analyzerQuery: 'Ks7h2d',
    name: 'King-High Disconnected Dry Flop (K-7-2r)',
    title: 'King-High Dry Flop C-Bet Strategy Guide',
    h1: 'King-High Disconnected Dry Flop (K-7-2r) GTO C-Bet & Check-Raise Guide',
    category: 'Static Dry High',
    rangeAdvantage: 'Strong In-Position Preflop Raiser (+56% To 44% Equity)',
    nutAdvantage: 'In-Position Raiser (AA, KK, AK, KQ)',
    gtoCbetFreq: '85% - 94% (High-Frequency Small C-Bet)',
    optimalCbetSize: '33% Pot',
    checkRaiseFreq: '9% - 12% (Aggressive Backdoor Check-Raises)',
    bestTurnBarrels: 'Ace, Queen, Jack, And Non-Pairing Broadway Cards',
    summary:
      'King-High Disconnected Rainbow Flops (Such As Ks 7h 2d Or Kh 8c 3s) Are Classic Static Dry Textures Where Only Three Straight Combinations Exist And Equity Shifts Slowly Across Turn And River Cards. The Preflop Aggressor C-Bets 85% To 94% Of Hands For 33% Pot To Fold Out Unpaired Overcards And Extract Thin Value.',
    ipStrategy: [
      'Deploy A Unified 33% Pot Range C-Bet Across Nearly Your Entire Opening Range (AA, Kx, Pocket Pairs 33-QQ, Ace-High, And Backdoor Draws).',
      'When Facing A Flop Check-Raise From The Big Blind On K-7-2r, Defend Wide By Calling With All Kx, Pocket Pairs 77+, Backdoor Nut Flush Draws, And Ace-High With Backdoor Equity.',
      'Fire Polarized 75% Turn Barrels With AK, KQ, AA, Sets, And Turned Flush/Straight Draws While Checking Back Weak Kx And Medium Pairs (88-QQ).',
    ],
    oopDefenseStrategy: [
      'Check-Raise At 9% To 12% Frequency Because K-7-2r Contains Zero Obvious Front-Door Draws: Merge 77, 22, K7s, And Strong Kx With Backdoor Straight/Flush Bluffs (98s, 86s, 65s, A5s).',
      'Call The 33% C-Bet With Any Pair (2x, 7x, 33-JJ, Kx) Plus Strong Ace-High Hands (AQo, AJs, ATs).',
      'Attack Turn Check-Backs With A 75% River Probe Bet Whenever The Preflop Raiser Caps Their Range On The Turn.',
    ],
    turnBarrelRules:
      'An Ace On The Turn Is Still A High-Leverage Barrel Card For The Preflop Raiser (Who Retains All AA, AK, AQ, AJ), Allowing Continued Polarized Pressure Against The Big Blind\'s 7x And Medium Pocket Pairs.',
    faqs: [
      {
        q: 'Why Does The Big Blind Check-Raise K-7-2 Rainbow More Often Than A-7-2 Rainbow?',
        a: 'On K-7-2r, The Preflop Raiser\'s Range Contains Many Unimproved Ace-High Hands And Underpairs (88-QQ) That Hate Facing A Check-Raise And Multiple Barrels, Whereas On A-7-2r Top Pair Is Already An Ace.',
      },
      {
        q: 'Should I C-Bet Pocket Queens (QQ) Or Pocket Jacks (JJ) On K-7-2 Rainbow?',
        a: 'Yes, At 33% Pot Sizing In Heads-Up Single-Raised Pots. Betting Small Denies Equity To The Big Blind\'s Weak Ace-Rag Hands (A4o, A5o, A8o) That Hold A 13% Six-Out Or Three-Out Overcard Chance.',
      },
      {
        q: 'What Is The Optimal Sizing On K-7-2 In A 3-Bet Pot?',
        a: 'In A 3-Bet Pot, Stack-To-Pot Ratio Is Smaller And The 3-Bettor\'s Range Is Extremely Concentrated In AA, KK, AK, And KQs. A Tiny 20% To 25% Pot Range C-Bet Applies Maximum Indifference Pressure.',
      },
    ],
  },
  {
    slug: 'broadway-heavy-connected',
    code: 'Q-J-T',
    exampleBoard: 'Qs Jh Td',
    analyzerQuery: 'QsJhTd',
    name: 'Broadway-Heavy Connected Flop (Q-J-T)',
    title: 'Broadway Connected Flop Strategy Guide',
    h1: 'Broadway-Heavy Connected Flop (Q-J-T / K-Q-J) GTO C-Bet & Nut Advantage Guide',
    category: 'Dynamic Connected',
    rangeAdvantage: 'Heavily Favors Preflop Raiser (+61% To 39% Equity)',
    nutAdvantage: 'Massive Preflop Raiser Nut Advantage (AK, KK, QQ, JJ, TT, K9s)',
    gtoCbetFreq: '72% - 82%',
    optimalCbetSize: '75% Pot',
    checkRaiseFreq: '7% - 10%',
    bestTurnBarrels: 'Ace, King, Or Brick Deuce/Trey That Preserves Nut Straight Edge',
    summary:
      'High Broadway-Connected Flops (Such As Qs Jh Td, Ks Qd Jc, Or Js Th 9c) Smash The Preflop Raiser\'s Range Harder Than Almost Any Other Texture. Because The Big Blind 3-Bets Most AK, QQ, And JJ Preflop, The Big Blind Is Capped At Lower Straights And Two Pairs While The Opener Holds All Nut Straights (AK) And Top Sets, Driving Large 75% Polarized C-Bets.',
    ipStrategy: [
      'Shift Away From 33% Small Bets Toward Large 66% To 75% Pot Polarized C-Bets To Leverage Your Massive Nut Advantage (AK Nut Straight, QQ, JJ, TT, QJs).',
      'Use Hands With A Single King Or Ace Blocker (Such As ATo, KTo, AJs, KJs) As High-Equity Semi-Bluffs That Can Barrel Or Realize Nut Straight Outs.',
      'Check Back Vulnerable Underpairs (66-99) That Have Zero Straight Blockers And Minimal Improvement Equity.',
    ],
    oopDefenseStrategy: [
      'Play Defensively Out Of Position: Even When You Flop Two Pair (QTo, JTo) Or A Low Straight (98s), Recognize That The Preflop Raiser Holds All AK, QQ, And JJ Combinations.',
      'Fold One-Pair Hands Without A Straight Draw (Such As T7s Or J6s) Immediately Against A 75% Pot Continuation Bet.',
      'Check-Call Most Of Your Two Pairs And Straights Rather Than Bloating The Pot Out Of Position Against An Uncapped Range.',
    ],
    turnBarrelRules:
      'On A Brick Turn (2, 3, 4), The Preflop Raiser Can Fire A 100% To 125% Pot Turn Overbet With AK, Sets, And King-Blocker Combo Draws, Putting The Big Blind\'s Two-Pair Hands In A Vice.',
    faqs: [
      {
        q: 'Why Do Solvers Prefer 75% Pot C-Bets On Q-J-T Instead Of 33% Pot?',
        a: 'Large Bet Sizes Are Driven By Nut Advantage And Board Dynamism. On Q-J-T, The Preflop Raiser Holds All 16 Combinations Of AK (The Nuts) Plus Top Sets (QQ, JJ, TT), While Many Turn Cards Shift Equity Dramatically. Betting 75% Pot Maximizes Value And Denies Draw Equity.',
      },
      {
        q: 'Why Is The Big Blind At Such A Big Disadvantage On K-Q-J And Q-J-T?',
        a: 'Because The Big Blind 3-Bets Their Strongest Broadway Hands (AA, KK, QQ, JJ, AK) Preflop, Their Flat-Calling Range Is Capped And Dominated By The Opener\'s Uncapped Broadway Region.',
      },
      {
        q: 'Should I C-Bet Pocket Aces (AA) Large On Q-J-T?',
        a: 'Pocket Aces Holds A Single Pair Plus An Open-Ended Gutshot To The Nut Straight (Any King) And Blocks AK. Solvers Mix 75% C-Bets And Protective Checks With AA Depending On Suit Coverage.',
      },
    ],
  },
  {
    slug: 'middling-connected-two-tone',
    code: 'J-T-8ss',
    exampleBoard: 'Js Ts 8d',
    analyzerQuery: 'JsTs8d',
    name: 'Middling Connected Two-Tone Flop (J-T-8ss)',
    title: 'Middling Connected Flop Strategy Guide',
    h1: 'Middling Connected Two-Tone Flop (J-T-8 / T-9-7) GTO C-Bet & Check-Raise Guide',
    category: 'Dynamic Connected',
    rangeAdvantage: 'Neutral / Slight In-Position Edge (51% To 49% Equity)',
    nutAdvantage: 'Shared (Both Ranges Hold Q9s, 97s, 88, TT, JJ)',
    gtoCbetFreq: '38% - 48% (Selective Mixed Frequency)',
    optimalCbetSize: '75% Pot',
    checkRaiseFreq: '14% - 18% (High Polarized XR)',
    bestTurnBarrels: 'Ace, King, Offsuit Deuce/Trey Brick',
    summary:
      'Middling Connected Two-Tone Flops (Such As Js Ts 8d, Th 9h 7c, Or Jh 9h 8d) Are Highly Dynamic Wet Boards Where Both The Preflop Raiser And The Big Blind Defender Hold Nut Straights (Q9, 97), Two Pairs, And Monster Combo Draws. Consequently, C-Bet Frequency Drops To ~42% Using A Polarized 75% Sizing.',
    ipStrategy: [
      'Stop Range-Betting 33%: Check Back 50% To 60% Of Your Range (Including Weak Top Pairs, Medium Pocket Pairs 77-99, And Unimproved A-High Without Draws).',
      'When You Do Bet, Size Up To 66% To 75% Pot With A Polarized Mix Of Strong Made Hands (Q9s, Sets, Top Two Pair, Overpairs QQ+) And High-Equity Draws (Flush Draws, Open-Enders, Overcard + Gutshot).',
      'Protect Your Check-Back Range By Checking Some Overpairs (AA/KK With A Spade) And Top Pair Hands So The Big Blind Cannot Auto-Overbet Every Turn.',
    ],
    oopDefenseStrategy: [
      'Attack Any Opener Who Mistakenly Uses A Small 33% C-Bet On J-T-8 Two-Tone By Check-Raising 16% To 20% Of Your Range.',
      'Build Your Check-Raise Range Around Flopped Straights (Q9, 97), Sets (88), Two Pairs (JTs, J8s, T8s), And Combo Draws (Flush Draws With A Pair Or Gutshot).',
      'When The Preflop Raiser Checks Back The Flop, Lead Out 75% Pot On The Turn With Made Hands And Draws To Seize The Initiative.',
    ],
    turnBarrelRules:
      'Over Half The Deck Changes The Nuts On The Turn (Any Spade, Queen, Nine, Seven, Or Board-Pairing Card). Only Barrel Turn Cards That Improve Your Equity Or Brick Out The Defender\'s Obvious Draws.',
    faqs: [
      {
        q: 'Why Is Range C-Betting 33% Pot A Major Leak On J-T-8 Two-Tone?',
        a: 'The Big Blind Defends Every Combination Of Q9o, Q9s, 97s, JTs, J8s, T8s, And 88 Preflop. If You Bet 33% Pot With Your Entire Range, A Competent Defender Will Check-Raise You Relentlessly And Force You To Fold Massive Equity.',
      },
      {
        q: 'How Should I Play Pocket Aces (AA) Or Pocket Kings (KK) On J-T-8 Two-Tone?',
        a: 'Overpairs Are Vulnerable To 20+ Turn Scare Cards. Solvers Prefer Betting Large (75% Pot) With AA/KK For Immediate Value And Equity Denial While Checking Back Occasionally When Holding The Flush-Suit Blocker.',
      },
      {
        q: 'Which Turn Cards Favor The Preflop Raiser Versus The Big Blind On J-T-8?',
        a: 'Offsuit Aces And Kings Favor The Preflop Raiser (Giving AK/AQ Top Pair Or Broadway Straight Equity), While Cards Ranked 6 Through 9 Or Flush-Completing Spades Favor The Defender.',
      },
    ],
  },
  {
    slug: 'low-connected-dynamic',
    code: '8-7-6ss',
    exampleBoard: '8s 7s 6d',
    analyzerQuery: '8s7s6d',
    name: 'Low Connected Dynamic Flop (8-7-6 / 7-6-5)',
    title: 'Low Connected Wet Flop Strategy Guide',
    h1: 'Low Connected Dynamic Flop (8-7-6 / 7-6-5) GTO Checking & Check-Raise Strategy',
    category: 'Dynamic Connected',
    rangeAdvantage: 'Big Blind / Caller Advantage Against Early Opens (47% To 53%)',
    nutAdvantage: 'Big Blind Defender (Holds More T9, 95, 54, Two Pairs & Low Sets)',
    gtoCbetFreq: '22% - 35% (High-Frequency Check)',
    optimalCbetSize: 'Check (Or 50% - 75% Selective)',
    checkRaiseFreq: '18% - 24% (Aggressive Defender XR)',
    bestTurnBarrels: 'Offsuit Ace, King, Or Brick Deuce',
    summary:
      'Low Connected Coordinated Flops (Such As 8s 7s 6d, 7h 6h 5c, Or 6s 5s 4d) Are The Single Worst Board Texture For An Early- Or Middle-Position Preflop Raiser. Because The Opener Folded Hands Like 95s, 86s, 75s, And 54o Preflop While The Big Blind Called Them All, The Defender Holds Both The Range And Nut Advantage, Forcing The Raiser To Check 65% To 78% Of The Time.',
    ipStrategy: [
      'Check Back The Majority Of Your Range (65% To 78%), Especially When You Open From UTG, MP, Or Cutoff Where You Lack Low Two-Pair And Straight Combinations.',
      'Even With Overpairs (AA, KK, QQ), Mix In Frequent Protective Check-Backs And Medium 50% Bets: An Overpair Is Merely A Bluff-Catcher Against A Check-Raise On 8-7-6.',
      'Never C-Bet Unimproved Offsuit Broadways (AKo, AQo, KQo) Without A Flush Draw On 8-7-6: They Have Nearly Zero Fold Equity And Terrible Playability Against Check-Raises.',
    ],
    oopDefenseStrategy: [
      'In Big Blind Vs Early Position, You Can Introduce A Direct Flop Donk-Bet (Leading Out 33% To 50% Pot) Or Check-Raise At An Aggressive 18% To 24% Frequency.',
      'Put Maximum Pressure On The Opener\'s Capped Overpairs By Fast-Playing Straights (T9, 95, 54), Sets (88, 77, 66), Two Pairs (87s, 76s, 86s), And Pair-Plus-Draw Hands (98s, 75s, 65s).',
      'If The Preflop Raiser Checks Back The Flop, Attack The Turn With Polarized 75% To 100% Bets Across Non-Pairing Runouts.',
    ],
    turnBarrelRules:
      'Any 4, 5, 6, 7, 8, 9, Or Ten On The Turn Puts A Four-Liner Straight On The Board. Proceed With Extreme Caution With Naked Overpairs And Prioritize Flush Draws Plus Straight Blockers (Such As 99 Or TT).',
    faqs: [
      {
        q: 'Why Do Solvers Check Pocket Aces (AA) Over 50% Of The Time On 7-6-5 Two-Tone Against UTG?',
        a: 'When UTG Opens And The Big Blind Calls, The Big Blind Has 3x More Combinations Of Straights (98s, 84s, 43s), Sets (77, 66, 55), And Two Pairs (76s, 65s, 75s) Than UTG. Betting AA Bloats The Pot Against Hands That Crush You While Folding Out Only Hands Drawing Thin.',
      },
      {
        q: 'When Is Leading Out (Donk-Betting) From The Big Blind Solver-Approved?',
        a: 'Low Connected Boards Like 7-6-5, 6-5-4, And 8-7-6 Are The Primary Spots Where GTO Solvers Approve Big Blind Flop Leads (20% To 30% Frequency) Because The In-Position Raiser Checks Back So Often.',
      },
      {
        q: 'Why Is Pocket Tens (TT) Or Pocket Nines (99) Often Better To Bet Than Pocket Aces On 8-7-6?',
        a: 'Pocket Nines (99) And Pocket Tens (TT) Hold Critical Open-Ended Or Gutshot Straight Draw Equity Plus Heavily Block The Defender\'s Nut Straight Combinations (T9 And 95), Whereas Pocket Aces Blocks Zero Straights.',
      },
    ],
  },
  {
    slug: 'monotone-single-suit-flop',
    code: 'K-9-4sss',
    exampleBoard: 'Ks 9s 4s',
    analyzerQuery: 'Ks9s4s',
    name: 'Monotone Single-Suit Flop (Ks 9s 4s)',
    title: 'Monotone Flop GTO C-Bet Strategy Guide',
    h1: 'Monotone Single-Suit Flop (Ks 9s 4s) GTO Small C-Bet & Blocker Strategy',
    category: 'Monotone & Flush-Heavy',
    rangeAdvantage: 'In-Position Preflop Raiser (+54% To 46% Equity)',
    nutAdvantage: 'In-Position Raiser (Holds More Nut As And Qs Flush Draws)',
    gtoCbetFreq: '58% - 72%',
    optimalCbetSize: '33% Pot',
    checkRaiseFreq: '7% - 10%',
    bestTurnBarrels: 'Offsuit High Card (Non-Spade Ace, King, Queen, Or Brick)',
    summary:
      'Monotone Single-Suit Flops (Three Cards Of The Same Suit, Such As Ks 9s 4s Or Ah Jh 5h) Radically Compress Bet Sizings Across The Entire Game Tree. Because Any Single Card Of That Suit On The Turn Or River Completes A Four-Flush, Solvers Exclusively Use Small 25% To 33% Pot Bets To Protect Equity And Force Folds From Zero-Flush-Card Hands.',
    ipStrategy: [
      'Never Use Large 75% Or 100% C-Bets On Monotone Flops: A Small 25% To 33% Pot Bet Accomplishes Full Fold Equity Against Opponents With Zero Cards Of The Flush Suit While Risking Minimal Chips When Behind A Flopped Flush.',
      'C-Bet Flopped Flushes, Sets, Strong Top Pairs, And Single-Card High Flush Draws (As-X, Qs-X, Js-X) At 33% Pot.',
      'Check Back Some Vulnerable Medium Hands Holding A Mid-Ranked Flush Card (Such As 9d Ts Or Pocket Tens With The Ts) To Realize A Free Turn Card.',
    ],
    oopDefenseStrategy: [
      'Fold Any Unpaired Hand That Contains Zero Cards Of The Monotone Suit Immediately Against Even A 25% Pot Bet.',
      'Check-Call Most Of Your Flopped Medium Flushes (Such As 8s 7s Or Ts 6s) And Single-Spade Top Pairs Rather Than Check-Raising Into The Opener\'s Nut Flush And As-X Blocker Region.',
      'On A Fourth Flush Card On The Turn Or River, Use The Bare Ace Of That Suit (Nut Flush Blocker) As Your Primary Polarized Bluff.',
    ],
    turnBarrelRules:
      'When The Turn Is An Offsuit Brick, The Preflop Raiser Can Size Up To 66% To 75% Pot With Made Flushes, Sets, And As-X Nut Flush Draws. When A Fourth Card Of The Monotone Suit Lands, Shift To Small Block Bets And Nut-Flush-Blocker Overbets.',
    faqs: [
      {
        q: 'How Often Does A Player Actually Flop A Flush On A Monotone Board?',
        a: 'Even With Wide Ranges, A Player Who Sees A Monotone Flop Actually Holds Two Cards Of That Exact Suit Only 4.5% To 6.5% Of The Time. That Means Over 93% Of Your Opponent\'s Range Does Not Have A Flopped Flush.',
      },
      {
        q: 'Why Do Solvers Bet Only 25% To 33% Pot When They Flop The Nut Flush?',
        a: 'If You Bet 75% Or 100% Pot On A Monotone Flop, Opponents Fold Everything Except Other Flushes And The Nut Flush Blocker. Betting 25% To 33% Forces Opponents To Continue With One-Pair Hands And Mid-Tier Single-Suit Cards.',
      },
      {
        q: 'Should I Bluff The River With The Bare Ace Of The Flush Suit (Nut Flush Blocker)?',
        a: 'Yes. Holding The Ace Of The Monotone Suit Makes It Mathematically Impossible For Your Opponent To Hold The Nut Flush, Giving You Maximum Fold Equity On A Large River Barrel.',
      },
    ],
  },
  {
    slug: 'high-paired-dry-board',
    code: 'K-K-4r',
    exampleBoard: 'Ks Kh 4d',
    analyzerQuery: 'KsKh4d',
    name: 'High-Paired Dry Flop (K-K-4 / A-A-6)',
    title: 'High-Paired Flop C-Bet Strategy Guide',
    h1: 'High-Paired Dry Flop (K-K-4 / A-A-6 / Q-Q-5) GTO Range C-Bet Strategy',
    category: 'Paired & Trips Boards',
    rangeAdvantage: 'Extreme In-Position Preflop Raiser (+60% To 40% Equity)',
    nutAdvantage: 'In-Position Raiser (Holds AK, KQ, KJ, KTs, AA, 44)',
    gtoCbetFreq: '90% - 98% (Pure Range C-Bet)',
    optimalCbetSize: '33% Pot (Or 20% - 25% Micro C-Bet)',
    checkRaiseFreq: '5% - 8% (Low Defender XR)',
    bestTurnBarrels: 'Ace, Queen, Jack, Ten',
    summary:
      'High-Paired Dry Flops (Such As Ks Kh 4d, As Ad 6c, Or Qh Qd 5s) Heavily Favor The Preflop Raiser Because Two Of The Top Card Are Already On The Felt And The Opener Holds Far More Combinations Of The Paired Broadway Card (AK, KQ, KJ, KTs) Than The Big Blind Defender. Solvers Bet 90% To 98% Of Hands For 25% To 33% Pot.',
    ipStrategy: [
      'Execute A 95%+ Small 25% To 33% Pot Range C-Bet Across Your Entire Range, Including Complete Air And Underpairs.',
      'Always Slow-Play Full Houses (44, K4s) And Strong Trips (AK, KQ) By Betting The Exact Same 25% To 33% Size As Your Bluffs: Raising Or Sizing Up On K-K-4 Folds Out The Defender\'s Entire Unpaired Range.',
      'If The Big Blind Calls The Flop C-Bet, Check Back Medium Pocket Pairs (66-QQ) On The Turn For Pot Control And Delay-Value On The River.',
    ],
    oopDefenseStrategy: [
      'Because A 25% Pot C-Bet Offers 5-To-1 Direct Pot Odds, You Must Float Wide With All Pocket Pairs (22-QQ), Any 4x, Ace-High (AQ-A2), And Backdoor Broadway Cards (QJs, JTs) Having Backdoor Flush Equity.',
      'Check-Call Almost All Of Your Trips (Kx) On The Flop To Keep The Opener\'s Wide Range C-Bet Bluffs Active Heading To The Turn.',
      'Probe-Bet 50% To 66% Pot On The River Whenever The Preflop Raiser Bets The Flop And Checks Back The Turn.',
    ],
    turnBarrelRules:
      'Because Both Players Rarely Hold A King (Only Two Kings Remain In The Deck), Turn Play Revolves Around Pocket Pairs And Ace-High Showdown Value. Use Polarized 75% Turn Bets Exclusively With Trips+, Overpairs, And High-Equity Turn Draws.',
    faqs: [
      {
        q: 'How Often Does Someone Actually Have A King On A K-K-4 Flop?',
        a: 'With Two Kings Already On The Board, Only Two Kings Remain In The 47 Unseen Cards. Even A Preflop Raiser Holds A King Only ~14% To 17% Of The Time, And The Big Blind Holds A King Only ~9% To 11% Of The Time.',
      },
      {
        q: 'Why Should I Float Ace-High Or Pocket Sixes Against A Flop C-Bet On K-K-4?',
        a: 'Because The Preflop Raiser Is C-Betting 95% Of Their Range Including QJo, JTs, 98s, And A5s, Your Pocket Sixes Or Ace-Ten Actually Leads Over 70% Of Their Flop Betting Range.',
      },
      {
        q: 'Should I Ever Check-Raise Trip Kings On K-K-4 Rainbow?',
        a: 'Almost Never On The Flop. Check-Raising K-K-4 Immediately Announces Trips Or 44 Full House And Forces Your Opponent To Fold Every Bluff And Worse Pair That Would Have Fired A Second Barrel.',
      },
    ],
  },
  {
    slug: 'low-paired-texture',
    code: '7-4-4r',
    exampleBoard: '7s 4h 4d',
    analyzerQuery: '7s4h4d',
    name: 'Low-Paired Board Texture (7-4-4 / 8-5-5)',
    title: 'Low-Paired Flop C-Bet & Check-Raise Guide',
    h1: 'Low-Paired Flop (7-4-4 / 8-5-5 / 6-3-3) GTO C-Bet & Aggressive Check-Raise Strategy',
    category: 'Paired & Trips Boards',
    rangeAdvantage: 'Slight In-Position Edge (53% To 47% Overpair Equity)',
    nutAdvantage: 'Big Blind Defender (Holds Far More 4x Trips: A4o, K4s, 64s, 54s, 43s)',
    gtoCbetFreq: '62% - 75%',
    optimalCbetSize: '33% Pot',
    checkRaiseFreq: '19% - 26% (Highest Check-Raise Board In Hold\'em)',
    bestTurnBarrels: 'Ace, King, Queen (Overcards That Counterfeited Or Outkick Low Pairs)',
    summary:
      'Low-Paired Flops (Such As 7s 4h 4d, 8c 5h 5d, Or 6s 3c 3d) Create A Dramatic Clash Between Range Advantage And Nut Advantage. While The In-Position Raiser Holds More Overpairs (88-AA), The Big Blind Defender Holds 2.5x More Combinations Of Trips (A4, K4s, Q4s, 64s, 54s, 43s), Making Low-Paired Flops The Highest Check-Raise Frequency Texture In Hold\'em (19% To 26%).',
    ipStrategy: [
      'Use A Small 33% Pot C-Bet At Moderate-To-High Frequency (65% To 75%), But Prepare Yourself Mentally And Technically For Frequent Big Blind Check-Raises.',
      'Against The Big Blind\'s High-Frequency Check-Raise, Defend By Calling With All Overpairs (88-AA), Any 7x, Pocket Pairs 22-66, And Strong Ace-High Hands With Backdoor Flush/Straight Equity (AK, AQ, A5s, A3s).',
      'Check Back Vulnerable Unimproved Offsuit Broadways (KJo, QTo) That Cannot Call A Check-Raise.',
    ],
    oopDefenseStrategy: [
      'Punish 33% Range C-Bettors By Check-Raising 20% To 25% Of Your Range On 7-4-4 And 8-5-5.',
      'Construct Your Check-Raise Range Around 4x Trips, 77 Full House, Strong 7x Protection Raises, And A Wide Array Of Backdoor Straight/Flush Bluffs (65s, 86s, 53s, A5s, A3s, K8s).',
      'Barrel High-Card Turns Selectively After Check-Raising To Pressure The Opener\'s Floating Ace-High And Medium Pairs.',
    ],
    turnBarrelRules:
      'When An Overcard (A, K, Q) Lands On The Turn After The Big Blind Calls A Flop C-Bet, The Preflop Raiser Regains Equity And Can Barrel 66% To 75% Pot To Pressure 7x And Pocket Pairs 55-66.',
    faqs: [
      {
        q: 'Why Do Solvers Check-Raise 22%+ Of The Time On 7-4-4 And 8-5-5?',
        a: 'An Early Or Late Position Raiser Folds Hands Like K4o, Q4s, J4s, 64s, And 43s Preflop, Whereas The Big Blind Defends Them. Because The Raiser\'s Range Is Capped On 4x Trips And Loaded With Unpaired Overcards, High-Frequency Check-Raising Captures Massive Dead Equity.',
      },
      {
        q: 'How Do I Counter An Opponent Who Check-Raises Low-Paired Flops Too Often?',
        a: 'Refuse To Auto-Fold Your Overpairs, 7x, And Ace-High Backdoor Hands To The Flop Check-Raise, And Re-Raise (3-Bet The Flop) Or Float In Position To Take The Pot Away When They Give Up On The Turn.',
      },
      {
        q: 'What Happens When The Turn Pairs The Top Card (7-4-4-7)?',
        a: 'When The Top Card Pairs On The Turn (Making The Board 7-4-4-7), Every 4x Trips Hand Is Counterfeited Into Fours Full Of Sevens (Losing To Any 7x Or Overpair 88+ If A Higher Pair Hits). Wait: On 7-4-4-7, A 4x Hand Still Has Fours Full Of Sevens While 88 Has Only Two Pair! Only A 7x Hand Makes Sevens Full Of Fours.',
      },
    ],
  },
  {
    slug: 'double-broadway-two-tone',
    code: 'K-Q-5ss',
    exampleBoard: 'Ks Qs 5d',
    analyzerQuery: 'KsQs5d',
    name: 'Double-Broadway Two-Tone Flop (K-Q-5ss / A-J-4ss)',
    title: 'Double-Broadway Flop C-Bet Strategy Guide',
    h1: 'Double-Broadway Two-Tone Flop (K-Q-5 / A-J-4) GTO Polarized C-Bet Strategy',
    category: 'Static Dry High',
    rangeAdvantage: 'Strong In-Position Preflop Raiser (+57% To 43% Equity)',
    nutAdvantage: 'In-Position Raiser (AA, KK, QQ, KQ, AK)',
    gtoCbetFreq: '74% - 84%',
    optimalCbetSize: '50% - 75% Pot',
    checkRaiseFreq: '8% - 11%',
    bestTurnBarrels: 'Non-Spade Ace, Jack, Ten, Or Brick Low Card',
    summary:
      'Double-Broadway Two-Tone Flops (Such As Ks Qs 5d, Ah Jh 4c, Or Ks Js 6d) Give The Preflop Raiser A Commanding Top-Pair, Two-Pair, And Set Advantage While Providing Flush And Broadway Gutshot Equity For Semi-Bluffs. Solvers Favor Medium-To-Large 50% To 75% C-Bets Across 75%+ Of The Opener\'s Range.',
    ipStrategy: [
      'Size Up From 33% To 50% Or 75% Pot To Charge Flush Draws, Straight Gutshots (JTs, ATs, T9s), And Middle Pairs (Qx).',
      'Value-Bet AA, KK, QQ, KQ, AK, KJ, And KTs Strongly While Semi-Bluffing With Ace-High Flush Draws, Gutshots (AT, AJ, JT), And Backdoor Spades.',
      'Check Back Underpairs Below The Second Broadway Card (66-JJ On K-Q-5) To Avoid Bloating The Pot Against Six-Way Broadway Overcards.',
    ],
    oopDefenseStrategy: [
      'Fold Dominated Underpairs (22-44, 66-99 Without A Spade) Against A 66% To 75% C-Bet On K-Q-5.',
      'Defend Primarily With Kx, Strong Qx (QJs, QTs), Flush Draws, And Open-Ended / Gutshot Broadway Draws (JTs, ATs).',
      'Reserve Check-Raises For 55 (Bottom Set), KQs/K5s (Two Pair), And Combo Flush + Straight Draws (Js Ts, As Ts, As Js).',
    ],
    turnBarrelRules:
      'On Non-Flush Offsuit Brick Turns, The Preflop Raiser Can Fire A 75% To 125% Turn Barrel With AK, KQ, Sets, And Nut Flush/Straight Draws To Force Out Second-Pair Qx And Weak Kx.',
    faqs: [
      {
        q: 'Why Should I Check Back Pocket Jacks (JJ) Or Pocket Tens (TT) On A K-Q-5 Flop?',
        a: 'On K-Q-5, Both The King And Queen Sit Above JJ/TT. If You Bet And Get Called, You Are Almost Always Behind Kx Or Qx, While Folding Out Only Hands That Had 2 To 4 Outs Against You. Checking Back Protects Your Checking Range And Reaches Cheap Showdowns.',
      },
      {
        q: 'What Is The Optimal C-Bet Size On K-Q-5 Rainbow Versus K-Q-5 Two-Tone?',
        a: 'On K-Q-5 Rainbow (Zero Flush Draws), Solvers Shift Back Toward 33% To 50% Pot At 90% Frequency. On K-Q-5 Two-Tone, The Presence Of Flush Draws Pushes Sizing Up To 50% To 75% Pot To Deny Flush Equity.',
      },
      {
        q: 'Which Combo Draws Should The Big Blind Check-Raise On Ks Qs 5d?',
        a: 'Suited Spade Broadway Draws Like Js Ts (Open-Ended + Royal Flush Draw), As Ts, As Js, And 7s 6s Backdoor Equity Hands.',
      },
    ],
  },
  {
    slug: 'wheel-ace-low-connected',
    code: 'A-5-4ss',
    exampleBoard: 'As 5s 4d',
    analyzerQuery: 'As5s4d',
    name: 'Wheel-Ace Low Connected Flop (A-5-4 / A-4-3)',
    title: 'Wheel-Ace Flop GTO C-Bet Strategy Guide',
    h1: 'Wheel-Ace Low Connected Flop (A-5-4 / A-4-3) GTO C-Bet & Nut Advantage Guide',
    category: 'Dynamic Connected',
    rangeAdvantage: 'Neutral (51% To 49% Split Equity)',
    nutAdvantage: 'Big Blind Defender (Holds 32s Wheel Straight, 54s, A5o, A4o, 55, 44)',
    gtoCbetFreq: '38% - 52%',
    optimalCbetSize: '33% - 50% Pot',
    checkRaiseFreq: '14% - 19%',
    bestTurnBarrels: 'Offsuit King, Queen, Or Ace (Pairing Top Card)',
    summary:
      'Unlike Dry Ace-High Flops (A-7-2r), Wheel-Ace Low Connected Flops (Such As As 5s 4d, Ah 4h 3c, Or As 5d 2c) Strip The Preflop Raiser Of Their Nut Advantage. Because The Big Blind Defends All 32s, 63s, 76s, 54s, A5o, And A4o Combinations, Top Pair Top Kicker (AK) Can Already Be Drawing Thin Against Flopped Wheels And Two Pairs.',
    ipStrategy: [
      'Do Not Auto-Bet 90% Of Your Range Just Because An Ace Is On The Flop: Trim Your C-Bet Frequency Down To ~45% Using A Controlled 33% To 50% Pot Sizing.',
      'Check Back Some Strong Ax Hands (AJo, ATo) And Underpairs (88-KK) To Control Pot Size And Protect Your Checking Range.',
      'When Facing A Big Blind Check-Raise On A-5-4, Respect That Their Range Is Loaded With Wheel Straights (32, 76), Sets (55, 44), And Two Pairs (A5, A4, 54).',
    ],
    oopDefenseStrategy: [
      'Check-Raise Aggressively (15% To 19%) With Flopped Straights (32s, 76s), Sets (55, 44), Two Pairs (A5, A4, 54s), And High-Equity Wheel/Flush Combo Draws (6s 3s, 7s 6s, Ks 3s, Qs 3s).',
      'Lead Out On The Turn Whenever The Preflop Raiser Checks Back The Flop, Applying Pressure To Their Capped Pocket Pairs 88-KK.',
      'Avoid Slow-Playing Two Pair (54s) On Two-Tone Wheel Boards Where Any Ace, Higher Card, Or Flush Card Can Counterfeit Or Outdraw You.',
    ],
    turnBarrelRules:
      'An Ace Or High Broadway Card On The Turn Favors The Preflop Raiser (Counterfeiting 54 Two Pair Or Making AK Top Two Pair), Whereas Any 2, 3, 6, 7, Or Flush Card Massively Favors The Big Blind.',
    faqs: [
      {
        q: 'Why Is A-5-4 Played So Differently From A-8-2 Rainbow?',
        a: 'On A-8-2 Rainbow, Zero Straights Are Possible And The Big Blind Rarely Has Two Pair. On A-5-4, The Big Blind Holds Flopped Wheel Straights (32s, 76s) Plus Dozens Of Two-Pair Combinations (A5, A4, 54s), Eliminating The Raiser\'s Nut Advantage.',
      },
      {
        q: 'Can I Stack Off With Ace-King (AK) On An A-5-4 Flop At 100BB?',
        a: 'Against A Tight Or Balanced Big Blind Who Check-Raises And Fires Large Turn And River Barrels On A-5-4, AK One Pair Is A Pure Bluff-Catcher And Often Must Fold By The River Unless You Improve To Top Two Pair Or Trip Aces.',
      },
      {
        q: 'What Happens If The Turn Pairs The Ace (A-5-4-A)?',
        a: 'When A Second Ace Lands On The Turn, The Preflop Raiser Regains Massive Nut Advantage Because AK/AQ Now Make Trip Aces With Top Kicker While The Big Blind\'s 54 Two Pair Is Counterfeited.',
      },
    ],
  },
  {
    slug: 'disconnected-rainbow-rags',
    code: '9-5-2r',
    exampleBoard: '9s 5h 2d',
    analyzerQuery: '9s5h2d',
    name: 'Disconnected Rainbow Rags Flop (9-5-2r / T-6-2r)',
    title: 'Disconnected Low Rags Flop Strategy Guide',
    h1: 'Disconnected Rainbow Rags Flop (9-5-2r / T-6-2r) GTO Overpair & C-Bet Strategy',
    category: 'Static Dry High',
    rangeAdvantage: 'In-Position Preflop Raiser (+55% To 45% Equity)',
    nutAdvantage: 'In-Position Raiser (Holds All Overpairs TT-AA; Shared Sets 99/55/22)',
    gtoCbetFreq: '72% - 84%',
    optimalCbetSize: '33% - 50% Pot',
    checkRaiseFreq: '13% - 16%',
    bestTurnBarrels: 'Ace, King, Queen, Jack (Overcards Improving Raiser Unpaired Hands)',
    summary:
      'Disconnected Rainbow Rag Flops (Such As 9s 5h 2d, Tc 6d 2h, Or 8s 4h 2c) Offer Zero Front-Door Flush Draws And Virtually Zero Open-Ended Straight Draws. The Preflop Raiser Holds An Exclusive Monopoly On Overpairs (TT Through AA) Plus High-Card Overcard Equity, Driving High-Frequency 33% To 50% Continuation Bets.',
    ipStrategy: [
      'C-Bet 75% To 85% Of Your Range Using A 33% To 50% Pot Sizing: Because All Three Board Cards Are 9 Or Lower, Your Two Broadway Overcards (AK, AQ, KQ, QJ) Hold 25%+ Six-Out Equity And Deny The Big Blind\'s Equity.',
      'Size Up To 66% To 75% Pot With Overpairs (TT-AA) And Strong 9x Against Loose-Passive Callers Who Float Any Pair Or Gutshot.',
      'Fire Aggressive Second Barrels Whenever A Broadway Overcard (J, Q, K, A) Lands On The Turn.',
    ],
    oopDefenseStrategy: [
      'Because No Obvious Front-Door Draws Exist On 9-5-2 Rainbow, Build A 13% To 16% Check-Raise Range Merging Sets (55, 22), Two Pair (95s), And Backdoor Gutshot/Flush Bluffs (87s, 76s, 64s, 43s, A4s, A3s).',
      'Float 33% C-Bets With Any Pair (2x, 5x, 9x, 33-88) Plus Ace-High Hands Holding A Backdoor Straight Or Flush Card.',
      'Check-Raise Or Lead Out On Low Turn Cards (3, 4, 6) That Complete Backdoor Wheel And Mid-Range Straights.',
    ],
    turnBarrelRules:
      'Any Broadway Overcard (T, J, Q, K, A) On The Turn Massively Shifts Equity Further Toward The Preflop Raiser, Making It An Automatic High-Frequency Double-Barrel Spot.',
    faqs: [
      {
        q: 'Why Are Broadway Overcards (KQo, AJo) Good C-Bets On 9-5-2 Rainbow?',
        a: 'On 9-5-2 Rainbow, A Hand Like KQo Folds Out Better Ace-High Hands (A7o, A8o) While Retaining 6 Clean Overcard Outs (25% Equity To Make Top Pair By The River) Whenever Called By A 5x Or 9x Pair.',
      },
      {
        q: 'How Do I Construct Check-Raise Bluffs On A Completely Dry 9-5-2 Rainbow Board?',
        a: 'Select Hands With Backdoor Straight And Backdoor Flush Potential: 87s, 76s, 64s, 43s, And Suited Wheel Aces (A4s, A3s). Half The Deck On The Turn Gives These Hands An Open-Ender, Gutshot, Or Flush Draw To Keep Barrelling.',
      },
      {
        q: 'Should I Fast-Play Bottom Set (22) Or Middle Set (55) On 9-5-2 Rainbow?',
        a: 'Against A Preflop Raiser Holding Overpairs Or Overcards, Check-Raising 55 And 22 Immediately On The Flop Builds The Pot So You Can Comfortably Get 100BB All-In By The River.',
      },
    ],
  },
  {
    slug: 'trips-on-board-flop',
    code: '8-8-8',
    exampleBoard: '8s 8h 8d',
    analyzerQuery: '8s8h8d',
    name: 'Trips-On-Board Flop (8-8-8 / Q-Q-Q)',
    title: 'Trips-On-Board Flop GTO Strategy Guide',
    h1: 'Trips-On-Board Flop (8-8-8 / Q-Q-Q) GTO Full House & Small C-Bet Strategy',
    category: 'Paired & Trips Boards',
    rangeAdvantage: 'In-Position Preflop Raiser (+56% To 44% Overpair & High-Card Edge)',
    nutAdvantage: 'In-Position Raiser (Holds AA-99 Full Houses Plus Case Quads)',
    gtoCbetFreq: '88% - 96%',
    optimalCbetSize: '25% - 33% Pot',
    checkRaiseFreq: '6% - 9%',
    bestTurnBarrels: 'Ace, King, Queen (Pairing High Cards For Higher Full Houses)',
    summary:
      'Trips-On-Board Flops (Three Of A Kind Dealt Directly On The Flop, Occurring Only 0.24% Of The Time, Such As 8s 8h 8d) Transform Texas Hold\'em Into A Battle Of Pocket Pairs (Full Houses) And High-Card Kickers. Because The Preflop Raiser Holds Far More Overpairs (99-AA) And Ace-King High Cards, Solvers Range-Bet 25% To 33% Pot.',
    ipStrategy: [
      'Bet 25% To 33% Pot With Nearly Your Entire Range: Because Only One Eight Remains In The Deck, Any Pocket Pair Is Already A Full House (Eights Full), And Ace-High Is Playing Board Trips With An Ace Kicker.',
      'Never Bet Large On The Flop With Quads (A8s, 98s) Or Overfulls (AA, KK): Keep The Defender\'s Worse Pocket Pairs (22-77) And Ace-High Hands In The Pot.',
      'Be Careful With Under-Fulls (22-77 On 8-8-8) On High-Card Turns And Rivers: If The Turn And River Are K-Q And Your Opponent Has Kx Or Qx, Your 66 Full House Is Counterfeited Into Eights Full Of Sixes Vs Eights Full Of Kings!',
    ],
    oopDefenseStrategy: [
      'Call The Small Flop C-Bet With Every Pocket Pair (22+), Any Ace-High Hand, And Two-Broadway Hands (KQs, KJs) That Have Six Outs To Pair And Make A Higher Full House.',
      'Remember That Under-Fulls (22-77 On 8-8-8) Lose To Any Overpair (99-AA) And Also Lose Whenever An Opponent Pairs A Higher Turn Or River Card (9 Through Ace).',
      'Check-Call The Case Eight (Quads) On The Flop And Turn To Allow The Raiser To Barrel Off With Overpairs Or Ace-High.',
    ],
    turnBarrelRules:
      'When A High Card (Such As A King Or Ace) Lands On The Turn On 8-8-8, Any Player Holding An Ace Or King Now Makes Eights Full Of Aces/Kings, Instantly Crushing All Pocket Pairs Below That Card (22-QQ).',
    faqs: [
      {
        q: 'What Are The Exact Odds Of Flopping Trips On The Board (Like 8-8-8)?',
        a: 'There Are Exactly 52 Three-Of-A-Kind Flops Out Of 22,100 Possible Three-Card Flops, Meaning A Trips-On-Board Flop Occurs 0.235% Of The Time (1 In 425 Flops).',
      },
      {
        q: 'Why Is Pocket Fives (55) Dangerous To Stack Off With On An 8-8-8-K-4 Board?',
        a: 'On 8-8-8-K-4, Pocket Fives Makes Eights Full Of Fives (8-8-8-5-5). However, Any Opponent Holding A Single King (KJo, KTs, AK) Makes Eights Full Of Kings (8-8-8-K-K), And Any Pocket Pair 99-AA Also Beats 55.',
      },
      {
        q: 'Does Ace-King Beat Pocket Deuces On An 8-8-8-J-4 Unpaired Runout?',
        a: 'No! If Neither Of Ace-King\'s Hole Cards Pairs By The River On 8-8-8-J-4, Pocket Deuces Holds A Full House (Eights Full Of Deuces: 8-8-8-2-2), Which Beats Ace-King\'s Three Of A Kind (8-8-8-A-K).',
      },
    ],
  },
];

export function findBoardTexture(slug) {
  if (!slug) return null;
  const clean = String(slug).trim().toLowerCase();
  const target = BOARD_TEXTURE_ALIASES[clean] || clean;
  return (
    BOARD_TEXTURES.find(
      (b) => b.slug === target || b.code.toLowerCase() === target
    ) || null
  );
}

export function renderBoardTexturesIndexMarkdown() {
  const lines = [
    '# Canonical Flop Board Texture Encyclopedia (12 Solver Flop Archetypes)',
    '',
    `Last Verified: ${BOARD_TEXTURES_AS_OF}`,
    `Canonical URL: ${BOARD_TEXTURES_URL}`,
    '',
    '## Flop Texture C-Bet Frequency & Sizing Matrix',
    '',
    '| Flop Archetype | Example | Range Advantage | GTO C-Bet % | Optimal Size | Check-Raise % |',
    '| :--- | :--- | :--- | :--- | :--- | :--- |',
    ...BOARD_TEXTURES.map(
      (b) =>
        `| [${b.name}](${BOARD_TEXTURES_URL}/${b.slug}) | ${b.exampleBoard} | ${b.rangeAdvantage} | ${b.gtoCbetFreq} | ${b.optimalCbetSize} | ${b.checkRaiseFreq} |`
    ),
    '',
  ];
  return lines.join('\n');
}

export function renderBoardTextureDetailMarkdown(slugOrObj) {
  const b =
    typeof slugOrObj === 'string' ? findBoardTexture(slugOrObj) : slugOrObj;
  if (!b) return '';
  return [
    `# ${b.h1}`,
    '',
    `- **Archetype Code:** ${b.code} (${b.exampleBoard})`,
    `- **Category:** ${b.category}`,
    `- **Range Advantage:** ${b.rangeAdvantage}`,
    `- **Nut Advantage:** ${b.nutAdvantage}`,
    `- **GTO C-Bet Frequency:** ${b.gtoCbetFreq}`,
    `- **Optimal C-Bet Sizing:** ${b.optimalCbetSize}`,
    `- **Defender Check-Raise %:** ${b.checkRaiseFreq}`,
    `- **Best Turn Barrel Cards:** ${b.bestTurnBarrels}`,
    '',
    '## Executive Summary',
    b.summary,
    '',
    '## In-Position Raiser Strategy',
    ...b.ipStrategy.map((s) => `- ${s}`),
    '',
    '## Out-Of-Position Defender Strategy',
    ...b.oopDefenseStrategy.map((s) => `- ${s}`),
    '',
    '## Turn Barrelling Rules',
    b.turnBarrelRules,
    '',
  ].join('\n');
}
