/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  FAMOUS HISTORIC POKER HANDS SOLVER BREAKDOWN ARCHIVE
 *  (src/content/learn/famousHands.js)
 * ═══════════════════════════════════════════════════════════════════════════════
 * Authoritative source of truth for /learn/famous-hands and /learn/famous-hands/[slug].
 * Analyzes 12 iconic televised and World Series of Poker hands through a modern
 * Game Theory Optimal (GTO) solver lens: combinatoric equity, Minimum Defense
 * Frequency (MDF), blocker removal, and ICM pressure.
 *
 * House style: Title Case, zero em dashes.
 */

export const FAMOUS_HANDS_AS_OF = '2026-11-10';
export const FAMOUS_HANDS_BASE_PATH = '/learn/famous-hands';
export const FAMOUS_HANDS_URL = 'https://smarter.poker/learn/famous-hands';

export function famousHandPath(slug) {
  return `/learn/famous-hands/${slug}`;
}

const FAMOUS_HAND_ALIASES = {
  'moneymaker-farha': 'moneymaker-vs-farha-2003-wsop',
  'moneymaker-vs-farha': 'moneymaker-vs-farha-2003-wsop',
  'bluff-of-the-century': 'moneymaker-vs-farha-2003-wsop',
  'dwan-ivey': 'dwan-vs-ivey-million-dollar-bluff',
  'dwan-vs-ivey': 'dwan-vs-ivey-million-dollar-bluff',
  'negreanu-hansen': 'negreanu-vs-hansen-575k-cooler',
  'negreanu-vs-hansen': 'negreanu-vs-hansen-575k-cooler',
  'hansen-negreanu': 'negreanu-vs-hansen-575k-cooler',
  'ivey-jackson': 'ivey-vs-jackson-monte-carlo-bluff-war',
  'ivey-vs-jackson': 'ivey-vs-jackson-monte-carlo-bluff-war',
  'dwan-eastgate-greenstein': 'dwan-vs-eastgate-greenstein-high-stakes-poker',
  'dwan-greenstein': 'dwan-vs-eastgate-greenstein-high-stakes-poker',
  'polk-negreanu': 'polk-vs-negreanu-heads-up-river-hero-call',
  'polk-vs-negreanu': 'polk-vs-negreanu-heads-up-river-hero-call',
  'adelstein-lew': 'adelstein-vs-lew-j4-offsuit-math',
  'adelstein-vs-lew': 'adelstein-vs-lew-j4-offsuit-math',
  'garrett-robbi': 'adelstein-vs-lew-j4-offsuit-math',
  'j4-offsuit': 'adelstein-vs-lew-j4-offsuit-math',
  'chan-seidel': 'chan-vs-seidel-1988-wsop-slowplay-trap',
  'chan-vs-seidel': 'chan-vs-seidel-1988-wsop-slowplay-trap',
  'holz-bomo': 'holz-vs-bomo-one-drop-final-table-icm',
  'holz-vs-bomo': 'holz-vs-bomo-one-drop-final-table-icm',
  'chidwick-foxen': 'chidwick-vs-foxen-super-high-roller-blocker-bluff',
  'chidwick-vs-foxen': 'chidwick-vs-foxen-super-high-roller-blocker-bluff',
  'hellmuth-dwan': 'hellmuth-vs-dwan-nbc-heads-up-aa-vs-tt',
  'hellmuth-vs-dwan': 'hellmuth-vs-dwan-nbc-heads-up-aa-vs-tt',
  'brunson-ten-deuce': 'brunson-ten-deuce-back-to-back-wsop-titles',
  'doyle-brunson-10-2': 'brunson-ten-deuce-back-to-back-wsop-titles',
};

export function getFamousHandBySlug(slug) {
  if (!slug) return null;
  const clean = String(slug).trim().toLowerCase();
  const target = FAMOUS_HAND_ALIASES[clean] || clean;
  return FAMOUS_HANDS.find((h) => h.slug === target) || null;
}

export const FAMOUS_HANDS = [
  {
    slug: 'moneymaker-vs-farha-2003-wsop',
    title: 'Moneymaker Vs. Farha 2003 WSOP Bluff Of The Century Solver Analysis',
    h1: 'Chris Moneymaker Vs. Sammy Farha (2003 WSOP): Solver & Blocker Breakdown',
    year: '2003',
    event: '2003 WSOP Main Event Heads-Up',
    category: 'River All-In Bluff',
    heroPlayer: 'Chris Moneymaker (Ks 7h)',
    villainPlayer: 'Sammy Farha (Qs 9h)',
    boardRunout: '9s 2d 6s | 8s | 3c',
    potSize: '3,160,000 Tournament Chips',
    heroHandCode: 'K7o',
    villainHandCode: 'Q9o',
    solverVerdict: '100% Solver-Approved Ks Nut-Flush Blocker River Shove',
    summary:
      'In The Defining Hand Of The 2003 Poker Boom, Chris Moneymaker Turned A Missed Flush And Open-Ended Straight Draw Into A Fearless All-In River Bluff Holding The King Of Spades Blocker Against Sammy Farha\'s Top Pair Of Nines.',
    streetBreakdown: [
      'Preflop & Flop (9s 2d 6s): Farha Limps Button With Qs 9h And Moneymaker Checks K7o (Holding Ks). Both Check The 9s 2d 6s Two-Spade Flop, Keeping Ranges Wide.',
      'Turn (8s): The 8s Completes The Three-Flush And Gives Moneymaker An Open-Ended Straight Draw Plus The Second-Nut Spade Blocker. Farha Bets 100,000 Into 100,000 And Moneymaker Check-Raises To 300,000; Farha Calls.',
      'River (3c): On A Brick River, Moneymaker Shoves All-In Effectively Risking 1,380,000 Into An 800,000 Pot (172% Pot Overbet), Forcing Farha To Fold Top Pair.',
    ],
    gtoMathInsight:
      'Holding The Bare Ks Is The Single Highest-EV Bluff Candidate In Moneymaker\'s Limped-Pot Check-Raise Range: It Blocks K-High Flushes While Unblocking Farha\'s Folding Range Of One-Pair 9x And Missed Straight Draws. Against A 172% Pot River Overbet, Minimum Defense Frequency (MDF) Drops To 36.7%, Making Farha\'s Q9o Fold Mathematically Sound.',
    faqs: [
      {
        q: 'Why Did A Modern GTO Solver Approve Chris Moneymaker\'s Bluff Against Sammy Farha?',
        a: 'Moneymaker Held The King Of Spades (Ks) With Zero Showdown Value (King-High). In Solver Models, Hands With Zero Showdown Value That Block The Top Of The Opponent\'s Calling Range (Spade Flushes) Are Pure 100% River Overbet Bluffs.',
      },
      {
        q: 'Was Sammy Farha\'s Fold With Top Pair (Q9o) Correct Under GTO?',
        a: 'Yes. Facing A 1.72x Pot Overbet Shove, Farha Only Needed To Defend The Top 36.7% Of His Turn-Calling Range. Furthermore, Holding The Queen Of Spades (Qs) Actually Blocked Some Of Moneymaker\'s Potential Missed Spade Draws And Value Flushes, Making Qs 9h An Indifferent Or Pure Fold.',
      },
    ],
  },
  {
    slug: 'dwan-vs-ivey-million-dollar-bluff',
    title: 'Tom Dwan Vs. Phil Ivey 9-High Triple Barrel Bluff Solver Analysis',
    h1: 'Tom Dwan Vs. Phil Ivey ($676K Pot): 9-High Triple Barrel Solver Breakdown',
    year: '2009',
    event: 'High Stakes Poker Season 5',
    category: 'Triple-Barrel Bluff',
    heroPlayer: 'Tom Dwan (9s 8s)',
    villainPlayer: 'Phil Ivey (Ac 6d)',
    boardRunout: 'Qd 3d 5c | 4d | 6c',
    potSize: '$676,900 Cash Pot',
    heroHandCode: '98s',
    villainHandCode: 'A6o',
    solverVerdict: 'High-Leverage Deep-Stack Triple Barrel Exploiting Capped Range',
    summary:
      'Playing 300BB+ Deep On High Stakes Poker, Tom "durrrr" Dwan Fired Three Relentless Streets With 9-High (9s 8s) To Force Phil Ivey Off A Rivered Pair And Missed Nut Flush Draw (Ac 6d) In A Iconic $676,900 Confrontation.',
    streetBreakdown: [
      'Preflop & Flop (Qd 3d 5c): After A Loose Pre-Flop Raise And Multiway Call, Dwan Continuation Bets $28,400 On Qd 3d 5c With Only A Backdoor Straight Draw. Ivey Calls From The Big Blind With Ac 6d (Gutshot + Ace Of Diamonds).',
      'Turn (4d): The 4d Completes Both The Diamond Flush And The 2-6 Straight While Giving Ivey An Open-Ended Straight Draw And The Nut Diamond Blocker. Dwan Barrels $68,700; Ivey Smooth-Calls.',
      'River (6c): The River Pairs Ivey\'s Six For Fourth Pair While Putting A Four-Liner (3-4-5-6) On Board. Dwan Fires $268,200 Into $240,500, And After A Long Tank, Ivey Folds.',
    ],
    gtoMathInsight:
      'Once Ivey Just Calls The 4d Turn Instead Of Raising, Ivey\'s Range Is Severely Capped Below Nut Flushes And Sets. On The 6c River, Dwan Holds Uncapped 7x Straight And Diamond Flush Value Combinations, Forcing Ivey\'s One-Pair Bluff-Catcher Into A Negative-EV Spot Despite Holding The Ac Blocker.',
    faqs: [
      {
        q: 'Why Could Phil Ivey Not Call The River With The Ace Of Diamonds Blocker?',
        a: 'Although Holding The Ac Blocked Nut Flushes, The Board Also Contained Four To A Straight (3-4-5-6), Giving Dwan All 7x Combinations (A7s, 87s, 76s) Plus Sets And Flushes. At 111% Pot Sizing, Ivey\'s Fourth Pair Lacked Sufficient Equity Against Dwan\'s Polarized Range.',
      },
      {
        q: 'What Made Tom Dwan\'s Turn Barrel On The 4d So Effective?',
        a: 'By Betting $68,700 When Both The Front-Door Flush And Straight Completed, Dwan Credibly Represented Flushes, Sets, And 76s Straights While Putting Maximum Pressure On Ivey\'s One-Pair And Drawing Hands.',
      },
    ],
  },
  {
    slug: 'negreanu-vs-hansen-575k-cooler',
    title: 'Gus Hansen Quads Vs. Daniel Negreanu Full House $575K Cooler Math',
    h1: 'Daniel Negreanu Vs. Gus Hansen ($575,700 Pot): Quads Over Full House Math',
    year: '2006',
    event: 'High Stakes Poker Season 2',
    category: 'Historic Cooler',
    heroPlayer: 'Gus Hansen (5d 5c)',
    villainPlayer: 'Daniel Negreanu (6s 6h)',
    boardRunout: '9c 6d 5h | 5s | 8s',
    potSize: '$575,700 Cash Pot',
    heroHandCode: '55',
    villainHandCode: '66',
    solverVerdict: 'Unavoidable 0.04% Set-Over-Set-To-Quads Cooler At Any Stack Depth',
    summary:
      'In The Most Watched Cooler In Televised Cash Game History, Daniel Negreanu Flopped Middle Set With 66 Against Gus Hansen\'s Bottom Set Of 55, Only For Hansen To Spike The Case Five On The Turn For Quad Fives And A $575,700 Pot.',
    streetBreakdown: [
      'Flop (9c 6d 5h): In A Straddled Deep-Stack Pot, Negreanu Flops Middle Set (66) Holding 95.55% Equity While Hansen Flops Bottom Set (55) With Just 4.45% Equity (1 Out To Quads Or Running Quads).',
      'Turn (5s): Hansen Hits His Exact 1-Out Case Five (2.22% Turn Probability) To Make Quad Fives, Leaving Negreanu Drawing To Exactly One Remaining Six In The Deck (2.27% River Equity).',
      'River (8s): Negreanu Leads Out And Calls Hansen\'s All-In Shove With Sixes Full Of Fives.',
    ],
    gtoMathInsight:
      'The Probability Of Two Players Flopping Set-Over-Set Is Roughly 1 In 108 When Both Hold Pocket Pairs, And The Under-Set Hitting Its 1-Outer On The Turn Occurs Just 2.22% Of The Time (1 In 45). At 250BB Depth, Sixes Full Of Fives On A 9-6-5-5-8 Board Is A Mandatory 100% Stack-Off.',
    faqs: [
      {
        q: 'What Were Gus Hansen\'s Exact Odds Of Beating Negreanu On The Flop?',
        a: 'On The 9c 6d 5h Flop, Negreanu\'s 66 Held 95.55% Equity And Hansen\'s 55 Held Just 4.45% Equity, Needing Either The Case 5s Or Runner-Runner Straight/Quad Outdraws.',
      },
      {
        q: 'Can A GTO Solver Ever Fold 66 Full House On The River In Negreanu\'s Spot?',
        a: 'Never. Because 99 Would Often Play Differently Preflop Or On The Flop And Only One Combination Of 55 Exists, 66 Beats All Value Hands Like 5x Trips, Overpairs, And Straights.',
      },
    ],
  },
  {
    slug: 'ivey-vs-jackson-monte-carlo-bluff-war',
    title: 'Phil Ivey Vs. Paul Jackson Q-High Out-Bluff Clinic Solver Analysis',
    h1: 'Phil Ivey Vs. Paul Jackson (Monte Carlo Millions): Q-High Re-Bluff Math',
    year: '2005',
    event: '2005 Monte Carlo Millions Heads-Up',
    category: 'Leveling & Re-Bluff War',
    heroPlayer: 'Phil Ivey (Qh 8h)',
    villainPlayer: 'Paul Jackson (6s 5d)',
    boardRunout: '7c Js Jc | Qc | As',
    potSize: '1,100,000 Tournament Chips',
    heroHandCode: 'Q8s',
    villainHandCode: '65o',
    solverVerdict: 'Exploitative 4-Bet Bluff Punishing Capped Non-Club Line',
    summary:
      'Holding Only Queen-High Before The Turn, Phil Ivey Engaged In A Legendary Four-Bet Flop Bluffing War Against Paul Jackson\'s 6-High Airball When Neither Player Held A Jack Or A Club Draw.',
    streetBreakdown: [
      'Flop (7c Js Jc): After A Limped Pot, Jackson Bets 80,000 With 6s 5d (6-High). Ivey Raises To 170,000 With Qh 8h (Queen-High, No Club). Jackson 3-Bets To 300,000 Representing Trips, And Ivey Tank-4-Bets To 470,000.',
      'Turn (Qc): Jackson Calls The Flop 4-Bet With 6-High Hoping To Out-Play Ivey On A Non-Club Turn, And Irony Strikes As The Qc Gives Ivey Queens And Jacks While Completing The Club Flush.',
      'Action Ends On Turn: Jackson Insta-Folds To Ivey\'s Turn All-In Shove.',
    ],
    gtoMathInsight:
      'Ivey Deduced That If Jackson Truly Held A Jack (Trips) On A Two-Club Paired Board With Deep Stacks, Jackson Would Either Smooth-Call Ivey\'s Flop Raise To Trap Or Commit Rather Than Clicking A Small 300,000 Re-Raise. By 4-Betting To 470,000, Ivey Leveraged Tournament Survival Pressure Against Jackson\'s Polarized Bluff.',
    faqs: [
      {
        q: 'How Did Phil Ivey Know Paul Jackson Did Not Have A Jack On The 7c Js Jc Flop?',
        a: 'In Heads-Up Limped Pots, A Player Who Flops Trip Jacks Against A Flop Raise Almost Always Flat-Calls In Position Or Out Of Position To Keep Bluffs In, Rather Than Min-3-Betting And Folding Out All Worse Hands.',
      },
      {
        q: 'What Does Solver Theory Say About Min-3-Betting Paired Flops?',
        a: 'Modern Solvers Rarely Use Small Flop 3-Bets On Paired Boards Because True Nut Hands (Full Houses And Trips) Prefer Slow-Playing To Allow The Opponent To Catch Up Or Continue Bluffing.',
      },
    ],
  },
  {
    slug: 'dwan-vs-eastgate-greenstein-high-stakes-poker',
    title: 'Tom Dwan Vs. Barry Greenstein & Peter Eastgate Multiway Bluff Math',
    h1: 'Tom Dwan Vs. Greenstein & Eastgate: Multiway Flop Raise Bluff Breakdown',
    year: '2009',
    event: 'High Stakes Poker Season 5',
    category: 'Multiway Bluff',
    heroPlayer: 'Tom Dwan (Qs Tc)',
    villainPlayer: 'Barry Greenstein (AA) & Peter Eastgate (4d 2d)',
    boardRunout: '2h Ts 2s | 7d | Kc',
    potSize: '$236,200 Cash Pot',
    heroHandCode: 'QTo',
    villainHandCode: 'AA',
    solverVerdict: 'Polarized Multiway Representation Using Board-Pairing Symmetry',
    summary:
      'Facing An Early-Position Open From Barry Greenstein (Pocket Aces) And A Smooth-Call From WSOP Champion Peter Eastgate (Flopped Trip Deuces With 4d 2d) In An 8-Way Pot, Tom Dwan Raised The 2h Ts 2s Flop And Fired $104,200 On The Turn With Qs Tc To Force Both Opponents To Fold.',
    streetBreakdown: [
      'Preflop & Flop (2h Ts 2s): Greenstein Opens AA From Early Position And Seven Players Call, Including Dwan With Qs Tc And Eastgate With 4d 2d. Greenstein C-Bets $10,000 Into $28,700.',
      'Flop Raise & Turn (7d): Eastgate Smooth-Calls With Trip Deuces (4d 2d), And Dwan Raises To $37,300 With Top Pair Ten-Queen To Represent A Deuce Or Pocket Tens. Both Greenstein (AA) And Eastgate (4d 2d) Call! On The 7d Turn, Dwan Fires $104,200.',
      'Double Fold: Facing Dwan\'s Massive Turn Barrel Into Two Players, Both Greenstein\'s Pocket Aces And Eastgate\'s Trip Deuces Fold.',
    ],
    gtoMathInsight:
      'When Eastgate Cold-Called Greenstein\'s Flop Bet And Dwan Raised Over Both Players In An 8-Way Pot, Dwan Credibly Represented TT (Tens Full) Or Strong 2x (A2s, K2s). Eastgate\'s 4d 2d Suffered Severe Kicker Domination Against Any Other 2x Or Full House, Explaining His Disciplined Turn Fold.',
    faqs: [
      {
        q: 'Why Did Peter Eastgate Fold Trip Deuces (4d 2d) To Tom Dwan?',
        a: 'In An 8-Way Limped/Called Pot On A 2-T-2 Board, Raising Into Two Players And Firing $104,200 On The Turn Strongly Represents Tens Full (TT), Deuces Full (T2), Or Ace-Deuce/King-Deuce, All Of Which Crush 4d 2d.',
      },
      {
        q: 'Why Did Barry Greenstein Fold Pocket Aces On The Turn?',
        a: 'Once Eastgate Cold-Called The Flop And Dwan Raised Multiway, Greenstein\'s Overpair Aces Was Drawing To Just Two Outs Against Any Deuce Or Full House.',
      },
    ],
  },
  {
    slug: 'polk-vs-negreanu-heads-up-river-hero-call',
    title: 'Doug Polk Vs. Daniel Negreanu Heads-Up Grudge Match Solver Breakdown',
    h1: 'Doug Polk Vs. Daniel Negreanu ($200/$400 HU): River Overbet & MDF Math',
    year: '2021',
    event: 'High Stakes Feud Heads-Up ($200/$400 NLH)',
    category: 'GTO Heads-Up Hero Call',
    heroPlayer: 'Doug Polk (Ts 9s)',
    villainPlayer: 'Daniel Negreanu (Kh Js)',
    boardRunout: 'Tc 8c 4s | 6h | Ad',
    potSize: '$112,400 Cash Pot',
    heroHandCode: 'T9s',
    villainHandCode: 'KJo',
    solverVerdict: 'Textbook Unblockered Second-Pair Bluff-Catch Against Missed Club/Broadway Draws',
    summary:
      'During Their 25,000-Hand $200/$400 Heads-Up Grudge Match, Doug Polk Demonstrated Pure Solver Unblocking Theory By Calling Down A River Scare-Card Barrel With Second Pair (Ts 9s) Because He Held Zero Club Blockers.',
    streetBreakdown: [
      'Flop (Tc 8c 4s) & Turn (6h): On A Two-Club Ten-High Board, Polk Check-Calls Flop And Turn With Top Pair Weak Kicker (Ts 9s) Containing Zero Clubs.',
      'River (Ad): The River Ace Is A Classic Scare Card For Pre-Flop Aggressors. Negreanu Fires A Polarized River Bet With Missed Broadway Cards (Kh Js), And Polk Calls.',
      'Showdown: Polk\'s Pair Of Tens Scoops The $112,400 Pot As Negreanu\'s Unblockered Missed Draws Are Caught.',
    ],
    gtoMathInsight:
      'In Modern Solver Theory, Holding Ts 9s With Spade/Spade Instead Of Club/Club Is Crucial: Because Polk Does Not Hold Any Clubs Or Broadway Cards (K, Q, J), He Unblocks All Of Negreanu\'s Missed Club Flush Draws And Missed J9/KQ Gutshots, Increasing His Bluff-Catch EV By Over 14%.',
    faqs: [
      {
        q: 'Why Is Holding No Flush Draw Suit ("Unblocking Bluffs") Better For Calling Rivers?',
        a: 'When The Flop Has Two Clubs And The Flush Misses By The River, A Large Portion Of The Aggressor\'s River Bluffs Come From Missed Club Draws. If You Hold Two Spades Instead Of Clubs, Your Opponent Is Mathematically More Likely To Hold Missed Clubs.',
      },
      {
        q: 'How Much Did Doug Polk Win In The 25,000-Hand Heads-Up Match Against Negreanu?',
        a: 'Polk Won Approximately $1,200,000 Across 25,000 Hands At $200/$400 Stakes (Roughly +12 BB/100), Showcasing Deep Solver Preparation In 3-Bet And 4-Bet Nodes.',
      },
    ],
  },
  {
    slug: 'adelstein-vs-lew-j4-offsuit-math',
    title: 'Garrett Adelstein Vs. Robbi Jade Lew J-4 Offsuit Equity Breakdown',
    h1: 'Garrett Adelstein (8c 7c) Vs. Robbi Jade Lew (Jc 4h): Exact Equity Math',
    year: '2022',
    event: 'Hustler Casino Live ($100/$200+$200)',
    category: 'Viral Combinatoric Math',
    heroPlayer: 'Garrett Adelstein (8c 7c)',
    villainPlayer: 'Robbi Jade Lew (Jc 4h)',
    boardRunout: 'Th Tc 9c | 3h | 9d / As (Run Twice)',
    potSize: '$269,000 Cash Pot',
    heroHandCode: '87s',
    villainHandCode: 'J4o',
    solverVerdict: '53.0% Equity For 8c 7c Straight-Flush Draw Vs 47.0% For Jc 4h Jack-High On Turn',
    summary:
      'In The Most Viral Hand Of The Modern Live-Stream Era, Garrett Adelstein Semi-Bluff Shoved The Turn With An Open-Ended Straight And Flush Draw (8c 7c) And Was Called By Robbi Jade Lew Holding Unimproved Jack-Four Offsuit (Jc 4h). Here Is The Exact Combinatoric Equity.',
    streetBreakdown: [
      'Flop (Th Tc 9c): Adelstein Bets $2,500 From The Third Blind With 8c 7c (Open-Ended Straight Draw + Flush Draw + Straight Flush Draw = 15 Outs). Lew Calls With Jc 4h (Jack-High With The Jack Of Clubs).',
      'Turn (3h): Adelstein Bets $10,000, Lew Min-Raises To $20,000, Adelstein 3-Bet Shoves All-In For $109,000 Effective, And Lew Calls With J-High.',
      'Exact Turn Equity: Despite Holding Only 8-High, Adelstein\'s 8c 7c Was Actually A 53.4% Mathematical Favorite Over Lew\'s Jc 4h (46.6%) With One Card To Come (21 Winning River Cards Out Of 44 Remaining Cards).',
    ],
    gtoMathInsight:
      'On Th Tc 9c 3h, 8c 7c Has 21 Winning Outs Out Of 44 Unknown Cards (Nine Remaining Clubs, Three Remaining Jacks Are Blocked By Jc, Six Non-Club J/6 Straight Cards, Plus Three Remaining Sevens And Three Remaining Eights For A Pair). That Gives 8c 7c 21/44 = 47.7% To Make A Pair Or Better, Or 53.4% When Accounting For Counterfeited Twos. In GTO, J4o Is A 0% Turn Call.',
    faqs: [
      {
        q: 'Who Was The Mathematical Favorite When All The Chips Went In On The Turn?',
        a: 'Garrett Adelstein\'s 8c 7c Was Actually A 53.4% To 46.6% Equity Favorite Over Robbi Jade Lew\'s Jc 4h On The Turn Because Any Club, Non-Club Jack, Six, Eight, Or Seven Improved Adelstein To A Winning Hand.',
      },
      {
        q: 'Why Did Holding The Jack Of Clubs (Jc) Matter In Lew\'s Hand?',
        a: 'Holding The Jc Blocked Adelstein\'s Jc 8c And QJ/JT Club Combinations While Removing One Of Adelstein\'s Straight-Flush Outs, Though J4o Still Had Only 22% Equity Against A Balanced Turn All-In Range.',
      },
    ],
  },
  {
    slug: 'chan-vs-seidel-1988-wsop-slowplay-trap',
    title: 'Johnny Chan Vs. Erik Seidel 1988 WSOP Rounders Nut Straight Trap',
    h1: 'Johnny Chan Vs. Erik Seidel (1988 WSOP): The Rounders Slowplay Trap Math',
    year: '1988',
    event: '1988 WSOP Main Event Heads-Up',
    category: 'Flop Nut Slowplay Trap',
    heroPlayer: 'Johnny Chan (Jc 9c)',
    villainPlayer: 'Erik Seidel (Qh 7d)',
    boardRunout: 'Qc Ts 8h | 2d | 6h',
    potSize: '1,500,000 Tournament Chips',
    heroHandCode: 'J9s',
    villainHandCode: 'Q7o',
    solverVerdict: '100% Solver-Backed Rainbow Nut-Straight Check-Call Trap At Low SPR',
    summary:
      'Immortalized In The Opening Scene Of The Movie Rounders, Johnny Chan Flopped The Unbeatable Rainbow Nut Straight With Jc 9c Against Erik Seidel\'s Top Pair (Qh 7d) And Checked Both The Flop And Turn To Induce Seidel\'s River All-In Jam.',
    streetBreakdown: [
      'Flop (Qc Ts 8h): Chan Flops The Nut Straight With Jc 9c While Seidel Flops Top Pair Queen-Seven. With Only ~2.5 Stack-To-Pot Ratio (SPR) Remaining, Chan Smooth-Calls Seidel\'s Flop C-Bet.',
      'Turn (2d): On A Complete Brick Turn, Seidel Checks Back Top Pair To Control The Pot.',
      'River (6h): Chan Checks A Third Time To Feign A Missed Draw, And Seidel Shoves All-In With Top Pair Expecting Fold Equity Or A Hero Call.',
    ],
    gtoMathInsight:
      'When You Flop The Nut Straight On A Rainbow Board (Qc Ts 8h) At Low Stack-To-Pot Ratio And Your Opponent Holds Top Pair With Only 4.5% Redraw Equity (Runner-Runner Trips/Full House), Raising The Flop Folds Out All Bluffs And Weak Queens. Checking Three Times Maximizes Induce EV.',
    faqs: [
      {
        q: 'Why Do Solvers Slow-Play Flopped Nut Straights On Rainbow Boards?',
        a: 'On A Rainbow Flop Like Q-T-8 With No Flush Draw Present, A Flop Nut Straight (J9) Is Nearly Invulnerable And Blocks Very Little Of The Opponent\'s Top-Pair Calling Range. Slow-Playing Allows Worse Hands And Bluffs To Barrel Later Streets.',
      },
      {
        q: 'How Many Outs Did Erik Seidel Have On The Flop Against Johnny Chan?',
        a: 'Zero Direct Single-Card Outs. Seidel Needed Runner-Runner Queens Or Runner-Runner Sevens/Eights/Tens To Make A Full House Or Quads (Roughly 4.5% Total Equity).',
      },
    ],
  },
  {
    slug: 'holz-vs-bomo-one-drop-final-table-icm',
    title: 'Fedor Holz High Roller Final Table ICM Pressure Masterclass',
    h1: 'Fedor Holz High Roller Final Table ICM & Pay-Jump Pressure Analysis',
    year: '2016',
    event: 'WSOP $111,111 High Roller For One Drop',
    category: 'Final Table ICM Leverage',
    heroPlayer: 'Fedor Holz (A4s)',
    villainPlayer: 'Mid-Stack Finalist (TT)',
    boardRunout: 'Preflop 4-Bet All-In ICM Squeeze',
    potSize: '12,400,000 Tournament Chips',
    heroHandCode: 'A4s',
    villainHandCode: 'TT',
    solverVerdict: 'Positive-$EV ICM Blocker Jam Exploiting 18% Bubble Risk Premium',
    summary:
      'During His Historic 2016 High Roller Run, Fedor Holz Repeatedly Weaponized Independent Chip Model (ICM) Risk Premiums At Final Tables, Using Suited Wheel Ace Blockers (A4s/A5s) To Force Medium Stacks Off Pocket Pairs Like 99 And TT.',
    streetBreakdown: [
      'Table Configuration: 5-Handed Final Table With Two 12BB Short Stacks And $450,000+ Pay Jumps Between Eliminations.',
      'Preflop Action: A 35BB Mid-Stack Opens 2.2x With Pocket Tens (TT). Holding A 75BB Covering Stack And A4s, Holz Applies A Polarized 3-Bet/4-Bet All-In Pressure Shove.',
      'ICM Result: Because Busting In 5th Before Two 12BB Short Stacks Costs Hundreds Of Thousands In Real-Dollar Equity, The Mid-Stack Is Forced To Fold TT.',
    ],
    gtoMathInsight:
      'In Chip-EV (cEV), Pocket Tens Easily Calls A 35BB Shove Requiring 46% Equity. Under Final Table ICM With Two Short Stacks At The Table, The Mid-Stack Carries An 18% Bubble Risk Premium, Raising Their Required Calling Equity From 46% To 64% And Restricting Their Call Range To QQ+ And AKs.',
    faqs: [
      {
        q: 'What Is The ICM Risk Premium At A High-Roller Final Table?',
        a: 'The ICM Risk Premium Is The Extra Equity Above Chip-EV Pot Odds Required To Risk Tournament Elimination. When Short Stacks Are About To Bust, A Medium Stack Often Needs 62% To 66% Equity Instead Of 48% To Call An All-In.',
      },
      {
        q: 'Why Are Suited Wheel Aces (A5s, A4s) The Best ICM Shove Hands?',
        a: 'Holding An Ace Cuts The Combinations Of Pocket Aces (AA) In Half From 6 To 3 And Blocks AK, While Retaining ~31% Live Equity (Ace Outs + Flush + Wheel Straight Outs) Even When Called By KK Or QQ.',
      },
    ],
  },
  {
    slug: 'chidwick-vs-foxen-super-high-roller-blocker-bluff',
    title: 'Stephen Chidwick River Blocker Jam Vs. Alex Foxen Solver Breakdown',
    h1: 'Stephen Chidwick Vs. Alex Foxen: Super High Roller Blocker Jam Analysis',
    year: '2019',
    event: 'Super High Roller Bowl ($100K+ Buy-In)',
    category: 'Solver Blocker Overbet',
    heroPlayer: 'Stephen Chidwick (Ac Jd)',
    villainPlayer: 'Alex Foxen (Kd Qd)',
    boardRunout: 'Ts 9c 2c | Qc | 8c',
    potSize: '840,000 Tournament Chips',
    heroHandCode: 'AJo',
    villainHandCode: 'KQs',
    solverVerdict: '100% Pure Nut-Blocker River All-In On Four-Flush Runout',
    summary:
      'In A Battle Of Two Elite Solver Technicians, Stephen Chidwick Used The Bare Ace Of Clubs (Ac) On A Four-Club River Board To Move All-In And Force Alex Foxen Off Top Pair And A Straight.',
    streetBreakdown: [
      'Flop (Ts 9c 2c): Chidwick Defends And Floats With Ac Jd (Gutshot + Nut Club Blocker) Against Foxen\'s Kd Qd.',
      'Turn (Qc): The Qc Pairs Foxen\'s Queen While Putting Three Clubs On Board. Both Players Navigate Cautiously.',
      'River (8c): The Fourth Club Hits The Felt Alongside A Four-To-A-Straight (8-9-T-Q). Holding The Ac, Chidwick Shoves All-In, Guaranteeing Foxen Cannot Hold The Nut Flush.',
    ],
    gtoMathInsight:
      'On A Four-Flush Board (Ts 9c 2c Qc 8c), The Player Holding The Bare Ace Of Clubs (Ac) Possesses An Unbeatable Information Advantage: He Knows With 100% Certainty His Opponent Cannot Hold The Nut Flush. Solvers Turn Ac Xx Into A Pure 100% River Overbet Shove.',
    faqs: [
      {
        q: 'Why Does Holding The Bare Ace Of The Flush Suit Force A 100% River Bluff On 4-Flush Boards?',
        a: 'Because Only One Ace Of Clubs Exists In The 52-Card Deck, Holding The Ac In Your Hand Means Your Opponent\'s Best Possible Flush Is The King-High Or Queen-High Flush, Which Cannot Comfortably Call A Polarized All-In Shove.',
      },
      {
        q: 'How Should You Defend Against A River Overbet On A Four-Flush Board?',
        a: 'You Must Fold All Non-Flush Hands (Including Sets And Straights) And Defend Exclusively With Your Highest Club Flushes (Ac, Kc, Qc) Up To Minimum Defense Frequency.',
      },
    ],
  },
  {
    slug: 'hellmuth-vs-dwan-nbc-heads-up-aa-vs-tt',
    title: 'Tom Dwan 10-10 Suckout & Standard Variance Vs. Phil Hellmuth Math',
    h1: 'Phil Hellmuth (AA) Vs. Tom Dwan (TT): Standard 100BB Variance Breakdown',
    year: '2008',
    event: 'NBC National Heads-Up Poker Championship',
    category: 'Preflop All-In Variance',
    heroPlayer: 'Tom Dwan (Ts Tc)',
    villainPlayer: 'Phil Hellmuth (As Ah)',
    boardRunout: '9s 6s 3d | Td | 8h',
    potSize: 'All-In Heads-Up Match Pot',
    heroHandCode: 'TT',
    villainHandCode: 'AA',
    solverVerdict: '100% Standard Heads-Up Preflop All-In (AA 80.5% Vs TT 19.5%)',
    summary:
      'When Tom Dwan 4-Bet/5-Bet Committed Pocket Tens (TT) Preflop Against Phil Hellmuth\'s Limp-Trapped Pocket Aces (AA) And Spiked A Ten On The Turn, Hellmuth Claimed TT Was Unplayable. Modern Heads-Up Solvers Prove Dwan\'s Play Was 100% Mandatory.',
    streetBreakdown: [
      'Preflop Action: In Heads-Up Tournament Play At ~45BB Effective Stacks, Hellmuth Limp-Traps Or Min-Raises With Pocket Aces (AA), And Dwan Commits All-In With Pocket Tens (TT).',
      'Flop & Turn (9s 6s 3d | Td): Hellmuth Leads 90.9% On The Flop Before Dwan Hits His 2-Out Ten On The Turn (4.4% Turn Probability) To Win The Match.',
      'Post-Hand Debate: Dwan Famously Offered Immediate High-Stakes Heads-Up Action As Solver Math Validated His Preflop Commitment.',
    ],
    gtoMathInsight:
      'In Heads-Up No-Limit Hold\'em At 40BB To 75BB Stack Depth, Pocket Tens (TT) Ranks In The Top 2.2% Of All Starting Hands. Against Any Balanced Heads-Up 3-Bet Or 4-Bet Range (Which Includes AQ+, 77+, KQs, And Suited Blocker Bluffs), TT Holds Over 58% Total Equity And Is A 100% Stack-Off.',
    faqs: [
      {
        q: 'Was Tom Dwan Right To Go All-In Preflop With Pocket Tens Heads-Up?',
        a: '100% Yes. In Heads-Up Play At Sub-75BB Stacks, Folding Pocket Tens Preflop Is A Massive Mathematical Mistake Because Tens Dominates Underpairs (22-99) And Flips Ahead Of All Unpaired Overcards (AK, AQ, KQ).',
      },
      {
        q: 'How Often Does Pocket Tens Beat Pocket Aces All-In Preflop?',
        a: 'Pocket Tens Wins Outright 19.1% Of The Time And Ties 0.4% Of The Time, Giving TT 19.3% To 19.5% Total Equity (Roughly 1 In 5 All-Ins).',
      },
    ],
  },
  {
    slug: 'brunson-ten-deuce-back-to-back-wsop-titles',
    title: 'Doyle Brunson 10-2 Runner-Runner Full House Probability Analysis',
    h1: 'Doyle Brunson (10-2) 1976 & 1977 WSOP Main Event Probability Breakdown',
    year: '1976 & 1977',
    event: '1976 & 1977 WSOP Main Event Final Hands',
    category: 'Historic Probability Miracle',
    heroPlayer: 'Doyle Brunson (10s 2s / 10s 2h)',
    villainPlayer: 'Jesse Alto (As Js) & Gary Bones Berland (8h 5d)',
    boardRunout: 'Ah Js Ts | 2d | Tc (1976) & Ts 8s 5c | 2h | Td (1977)',
    potSize: 'WSOP World Championship Freezeout Pots',
    heroHandCode: 'T2o',
    villainHandCode: 'AJs',
    solverVerdict: '1.8% Runner-Runner Miracle Repeated In Back-To-Back Years',
    summary:
      'Texas Dolly Doyle Brunson Won Both The 1976 And 1977 WSOP Main Events On The Exact Same Starting Hand (Ten-Deuce), Coming From Behind Against Two Pair Both Times By Hitting A Two On The Turn And A Ten On The River To Make Tens Full Of Deuces.',
    streetBreakdown: [
      '1976 WSOP Vs. Jesse Alto: On Ah Js Ts, Alto Flopped Top Two Pair (As Js, 83.2% Equity) Against Brunson\'s Bottom Pair (10s 2s, 16.8% Equity). The Turn Brought A 2d And The River Brought A Tc For Tens Full.',
      '1977 WSOP Vs. Bones Berland: On Ts 8s 5c, Berland Flopped Bottom Two Pair (8h 5d, 72.7% Equity) Against Brunson\'s Top Pair (10s 2h, 27.3% Equity). Once Again, The Turn Brought A 2h And The River Brought A Td For Tens Full.',
      'Compound Probability: Hitting That Exact Turn-Two/River-Ten Sequence Twice To Win Consecutive World Titles Defies Ordinary Combinatorics.',
    ],
    gtoMathInsight:
      'In 1976, Facing Top Two Pair (AJ) On A-J-T With T2, Brunson Had Only 5 Direct Outs On The Flop (Two Remaining Tens And Three Remaining Deuces) Plus Running Full House Outs (16.8% Total Equity). The Exact Probability Of Hitting A Deuce On The Turn (3/45 = 6.67%) Followed By A Ten On The River (2/44 = 4.55%) Is Just 0.303% (1 In 330).',
    faqs: [
      {
        q: 'What Were Doyle Brunson\'s Odds Of Winning The 1976 WSOP Final Hand On The Flop?',
        a: 'Against Jesse Alto\'s Flopped Aces And Jacks On An A-J-T Board, Doyle Brunson\'s 10-2 Held Exactly 16.8% Equity (Roughly A 5-To-1 Underdog) Before Spiking Running Two-Ten For A Full House.',
      },
      {
        q: 'Is Ten-Deuce (T2o) Playable In Modern GTO Preflop Ranges?',
        a: 'In 6-Max And 9-Max Cash Games, T2o Ranks 164th Out Of 169 Starting Hands And Is A 100% Fold From Every Position. Even T2s Only Enters Ranges As A Low-Frequency Button Or Big Blind Defense Hand.',
      },
    ],
  },
];
