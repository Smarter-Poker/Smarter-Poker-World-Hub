/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  POKER VARIANTS & MIXED GAMES ENCYCLOPEDIA (src/content/games/variants.js)
 * ═══════════════════════════════════════════════════════════════════════════════
 * Authoritative source of truth for /games and /games/[variant].
 * Covers 15 complete poker variants across Community Card, Stud, Draw & Lowball,
 * and Mixed Rotations.
 *
 * House style: Title Case, zero em dashes or en dashes.
 */

export const GAMES_AS_OF = '2026-11-09';
export const GAMES_BASE_PATH = '/games';
export const GAMES_URL = 'https://smarter.poker/games';

export const GAME_CATEGORIES = [
  'Community Card',
  'Stud Games',
  'Draw & Lowball',
  'Mixed Rotations',
];

export function gameVariantPath(slug) {
  return `/games/${slug}`;
}

export function getGameVariantBySlug(slug) {
  if (!slug) return null;
  return POKER_VARIANTS.find((v) => v.slug === slug) || null;
}

export const POKER_VARIANTS = [
  {
    slug: 'texas-holdem',
    name: 'Texas Hold\'em',
    title: 'No-Limit & Limit Texas Hold\'em Rules, Hand Rankings & Strategy',
    h1: 'Texas Hold\'Em Official Rules, Betting Structure, And Starting Hand Strategy',
    category: 'Community Card',
    holeCards: '2 Face-Down Hole Cards (0, 1, Or Both May Be Used)',
    boardCards: '5 Community Cards (3 Flop + 1 Turn + 1 River)',
    bettingStructure: 'No-Limit (NLHE), Fixed-Limit (LHE), Or Pot-Limit',
    handRankingSystem: 'Standard 52-Card High Hand Rankings (Royal Flush To High Card)',
    summary:
      'Texas Hold\'em Deals Each Player Two Private Hole Cards And Five Shared Community Cards Across Four Betting Streets (Preflop, Flop, Turn, And River), Where Any Combination Of Five Cards Forms The Best High Hand.',
    rulesOverview: [
      'Two Forced Blinds (Small Blind Left Of The Button And Big Blind Two Seats Left) Seed The Pot Before Any Cards Are Dealt.',
      'Each Player Receives Two Private Hole Cards Face Down, And Preflop Action Starts With The Under-The-Gun (UTG) Seat Left Of The Big Blind.',
      'After Preflop Betting Closes, The Dealer Burns One Card And Deals A 3-Card Flop, Followed By A Single Turn Card (Fourth Street) And A Single River Card (Fifth Street), With Postflop Betting Starting Left Of The Button.',
      'At Showdown, Players May Use Both Hole Cards With Three Board Cards, One Hole Card With Four Board Cards, Or Zero Hole Cards ("Playing The Board") To Construct Their Best 5-Card Poker Hand.',
    ],
    startingHandStrategy: [
      {
        tier: 'Tier 1: Ultra-Premium Power Hands (Top 2.6% Of 1,326 Combos)',
        hands: 'AA, KK, QQ, JJ, AKs, AKo (34 Total Combinations)',
        advice: 'Open-Raise From Every Seat And 3-Bet Or 4-Bet For Pure Value At 100BB Effective Stack Depth.',
      },
      {
        tier: 'Tier 2: Strong Suited Broadways & Medium Pairs',
        hands: 'TT, 99, 88, AQs, AJs, ATs, KQs, KJs, QJs, AQo',
        advice: 'Profitable Open-Raises Across All 6-Max Positions; Exercise Caution Facing 4-Bets Out Of Position.',
      },
      {
        tier: 'Tier 3: Speculative Suited Connectors & Wheel Aces',
        hands: '77-22, A5s-A2s, T9s, 98s, 87s, 76s',
        advice: 'High Implied-Odds Hands That Thrive In Late Position And Deep-Stacked Pots Or As Polarized 3-Bet Bluffs (A5s/A4s).',
      },
    ],
    keyDifferencesFromHoldem: [
      'Serves As The Baseline Benchmark Variant Against Which All Other Poker Formats Are Measured.',
      'Unlike Omaha Variants, Players Are Never Required To Use Exactly Two Hole Cards And Can Play One Hole Card Or The Entire Five-Card Board.',
      'Features 1,326 Total Starting Combinations Grouped Into 169 Canonical Starting Hands (13 Pocket Pairs, 78 Suited Hands, And 78 Offsuit Hands).',
    ],
    faqs: [
      {
        q: 'How Many Starting Hand Combinations Exist In Texas Hold\'em?',
        a: 'From A 52-Card Deck, There Are Exactly (52 x 51) / 2 = 1,326 Specific Two-Card Combinations, Which Condense Into 169 Strategic Starting Hands: 13 Pocket Pairs (6 Combos Each), 78 Suited Hands (4 Combos Each), And 78 Offsuit Hands (12 Combos Each).',
      },
      {
        q: 'Does A Single High Card In My Hand Break A Tie If The Board Has Four Of A Kind?',
        a: 'Only If Your Hole Card Is Higher Than Both The Fifth Board Card And Your Opponent\'s Hole Cards. Because Poker Hands Are Strictly Five Cards Long, Four Of A Kind On The Board Plus An Ace On The Board Cannot Be Improved By Any Pocket Pair.',
      },
    ],
  },
  {
    slug: 'pot-limit-omaha-plo4',
    name: 'Pot-Limit Omaha (PLO4)',
    title: '4-Card Pot-Limit Omaha (PLO4) Rules, Must-Use-Two Rule & Strategy',
    h1: '4-Card Pot-Limit Omaha (PLO4) Official Rules, Pot Calculation, And Nut-Draw Strategy',
    category: 'Community Card',
    holeCards: '4 Face-Down Hole Cards (MUST Use Exactly 2 Hole Cards)',
    boardCards: '5 Community Cards (MUST Use Exactly 3 Board Cards)',
    bettingStructure: 'Pot-Limit (Maximum Bet = 3x Facing Bet + Trail + Center Pot)',
    handRankingSystem: 'Standard 52-Card High Hand Rankings',
    summary:
      '4-Card Pot-Limit Omaha (PLO4) Deals Each Player Four Private Hole Cards And Five Community Cards, Requiring Every Player To Use Exactly Two Of Their Hole Cards And Exactly Three Board Cards To Make Their 5-Card Hand.',
    rulesOverview: [
      'Each Player Is Dealt Four Private Hole Cards Face Down, Creating 6 Distinct Two-Card Combinations Inside Every Hand (C(4,2) = 6).',
      'Mandatory Two-Card Rule: At Showdown, Every Player Must Use Exactly 2 Of Their 4 Hole Cards Combined With Exactly 3 Of The 5 Community Cards - Never 1 Hole Card And Never 3 Hole Cards.',
      'Betting Is Governed By Pot-Limit Rules: The Minimum Bet Is One Big Blind And The Maximum Raise Equals The Total Pot After Calling (3x The Facing Bet Plus Trail Bets Plus Center Pot).',
      'Because Every Hand Contains Six Two-Card Combos, Preflop Equities Run Close Together (Pocket Aces Are Only A 53% To 65% Favorite Against Connected Rundowns).',
    ],
    startingHandStrategy: [
      {
        tier: 'Tier 1: Double-Suited Aces & High Pairs',
        hands: 'A-A-K-K Double-Suited, A-A-J-T Double-Suited, A-A-Q-Q Double-Suited',
        advice: 'Play Aggressively With 3-Bets And 4-Bets To Lower The Postflop Stack-To-Pot Ratio (SPR) And Commit On The Flop.',
      },
      {
        tier: 'Tier 2: High-Card Broadway & Connected Rundowns',
        hands: 'K-Q-J-T Double-Suited, Q-J-T-9 Double-Suited, J-T-9-8 Double-Suited',
        advice: 'Elite Postflop Playability Capable Of Flopping 13-Out, 17-Out, And 20-Out Nut Straight Wrap Draws.',
      },
      {
        tier: 'Tier 3: Danglers, Rainbow Disconnected Hands & Quadruple Pocket Cards',
        hands: 'K-9-5-2 Rainbow, A-A-A-7 (Trips In Hand), Non-Nut Single-Suited Hands',
        advice: 'Fold Immediately Preflop; Drawing To Non-Nut Flushes Or Holding Three Of The Same Rank In Your Hand Cripples Your Outs.',
      },
    ],
    keyDifferencesFromHoldem: [
      'You Must Always Use Exactly Two Hole Cards And Three Board Cards (Holding A Single Spade On A Four-Spade Board Does NOT Make A Flush).',
      'Preflop Hand Equities Are Compressed Within A Narrow 60/40 Window, Shifting Strategy Toward Multi-Draw Nut Redraws And Wrap Equity.',
      'Contains C(52,4) = 270,725 Total Starting Hand Combinations Compared To Only 1,326 In Texas Hold\'em.',
    ],
    faqs: [
      {
        q: 'If The Board Has Four Hearts And I Hold Only The Ace Of Hearts, Do I Have A Flush In PLO?',
        a: 'No. Because PLO Requires You To Use Exactly Two Hole Cards And Three Board Cards, You Must Hold At Least Two Hearts In Your Hand To Make A Flush.',
      },
      {
        q: 'What Is A 20-Out Wrap Draw In Pot-Limit Omaha?',
        a: 'When You Hold Four Consecutive Cards Around Two Connected Flop Cards (Such As Q-J-8-7 On A T-9-2 Flop), Any Queen, Jack, Eight, Or Seven Completes A Straight, Giving You 16 To 20 Unseen Straight Outs.',
      },
    ],
  },
  {
    slug: 'five-card-omaha-plo5',
    name: '5-Card Pot-Limit Omaha (PLO5)',
    title: '5-Card Pot-Limit Omaha (PLO5) Rules, 10-Combo Math & Strategy',
    h1: '5-Card Pot-Limit Omaha (PLO5) Official Rules, Equity Compression, And Nut Advantage',
    category: 'Community Card',
    holeCards: '5 Face-Down Hole Cards (MUST Use Exactly 2 Hole Cards)',
    boardCards: '5 Community Cards (MUST Use Exactly 3 Board Cards)',
    bettingStructure: 'Pot-Limit (Standard 6-Max Maximum Table Capacity)',
    handRankingSystem: 'Standard 52-Card High Hand Rankings',
    summary:
      '5-Card Pot-Limit Omaha (PLO5) Deals Five Private Hole Cards To Each Player While Preserving The Strict Omaha Rule That Exactly Two Hole Cards And Three Community Cards Must Be Used At Showdown.',
    rulesOverview: [
      'Each Player Receives Five Private Hole Cards, Generating C(5,2) = 10 Distinct Two-Card Combinations Per Player (67% More Combos Than 4-Card PLO).',
      'Despite Holding Five Cards, Players Must Still Use Exactly 2 Hole Cards And 3 Board Cards At Showdown.',
      'By The Pidgeonhole Principle, Every 5-Card Hand Is Guaranteed To Contain At Least One Suited Combination Across The Four Suits, And Can Be At Most Double-Suited.',
      'Because 5 Cards Per Player Consume 30 Cards In A 6-Max Game Plus 5 Board Cards And 3 Burns (38 Cards), PLO5 Is Capped At 6 Or 7 Players Maximum.',
    ],
    startingHandStrategy: [
      {
        tier: 'Tier 1: Double-Suited Nut Ace + High Pair + Rundown Side Cards',
        hands: 'A-A-K-Q-J Double-Suited, A-K-Q-J-T Double-Suited With Nut Suit',
        advice: 'Prioritize Hands Featuring An Ace-High Flush Suit Paired With High Connected Side Cards That Dominate Multiway Pots.',
      },
      {
        tier: 'Tier 2: Five-Card Connected Rundowns With Nut Suit',
        hands: 'Q-J-T-9-8 Double-Suited, K-Q-J-T-8 With Ace Side Suit',
        advice: 'Frequently Flops Monster Straight Wraps Plus Flush Redraws That Are Mathematical Favorites Even Against Naked Overpairs.',
      },
      {
        tier: 'Tier 3: Naked Aces With Duplicate Ranks Or Non-Nut Suits',
        hands: 'A-A-8-8-8, K-K-Q-6-2 Single-Suited',
        advice: 'Avoid Overplaying Naked A-A Without Strong Side Connectivity; Bare Top Set Without Redraws Frequently Faces 55%+ Equity Wraps.',
      },
    ],
    keyDifferencesFromHoldem: [
      'Ten Internal Two-Card Combinations Per Hand Mean Naked Top Set Or Bare Non-Nut Flushes Are Frequently Drawing Thin Or Dead.',
      'Holdings With A-x Flush Blockers Gain Enormous Bluffing Leverage Because Five Cards Per Player Make Card Removal Twice As Pronounced.',
      'Contains C(52,5) = 2,598,960 Possible 5-Card Starting Hands.',
    ],
    faqs: [
      {
        q: 'Can A 5-Card Omaha Hand Be Triple-Suited?',
        a: 'No. Because A Suited Combination Requires At Least Two Cards Of The Same Suit, Five Hole Cards Can At Most Form Two Distinct Pairs Of Suits (2 + 2 + 1), Making Double-Suited The Maximum Possible.',
      },
      {
        q: 'Why Is Top Two Pair Or Bare Top Set Much Weaker In PLO5 Than In PLO4?',
        a: 'With 10 Two-Card Combinations Per Player Instead Of 6, Opponents Flop Straight Wraps Coupled With Nut Flush Draws Far More Often, Requiring You To Hold Backdoor Flush Or Higher Boat Redraws To Continue.',
      },
    ],
  },
  {
    slug: 'six-card-omaha-plo6',
    name: '6-Card Pot-Limit Omaha (PLO6)',
    title: '6-Card Pot-Limit Omaha (PLO6) Rules, 15-Combo Math & Max Table Cap',
    h1: '6-Card Pot-Limit Omaha (PLO6) Official Rules, 15-Combo Dynamics, And Triple-Suited Hands',
    category: 'Community Card',
    holeCards: '6 Face-Down Hole Cards (MUST Use Exactly 2 Hole Cards)',
    boardCards: '5 Community Cards (MUST Use Exactly 3 Board Cards)',
    bettingStructure: 'Pot-Limit (Capped At 6-Max Or 5-Max Due To 52-Card Deck Limit)',
    handRankingSystem: 'Standard 52-Card High Hand Rankings',
    summary:
      '6-Card Pot-Limit Omaha (PLO6) Deals Six Private Hole Cards To Each Player (15 Internal Two-Card Combinations) While Still Enforcing The Exact Two-Hole-Card And Three-Board-Card Rule.',
    rulesOverview: [
      'Every Player Receives Six Private Hole Cards, Giving Each Hand C(6,2) = 15 Internal Two-Card Combinations.',
      'At Showdown, Every Player Must Still Select Exactly 2 Of Their 6 Hole Cards And 3 Of The 5 Community Cards.',
      'Unlike PLO4 And PLO5, A 6-Card Hand Can Be Triple-Suited (Two Cards In Each Of Three Different Suits: 2 + 2 + 2).',
      'Deck Exhaustion Cap: 6 Players x 6 Hole Cards (36) + 5 Board Cards + 3 Burn Cards = 44 Cards Used Out Of 52, Strictly Limiting Tables To 6-Max Maximum.',
    ],
    startingHandStrategy: [
      {
        tier: 'Tier 1: Triple-Suited Aces With Broadway Rundown',
        hands: 'A-A-K-Q-J-T Triple-Suited, A-K-Q-J-T-9 With Two Nut Suits',
        advice: 'Maximum Preflop Equity And Nut Redraw Coverage Across Virtually Every Flop Texture.',
      },
      {
        tier: 'Tier 2: Nut-Suit Six-Card Rundowns',
        hands: 'K-Q-J-T-9-8 With Ace-High Flush Suit',
        advice: 'Dominates Multiway Flops By Flopping Both Ends Of Straight Wraps And Backdoor Nut Flushes.',
      },
      {
        tier: 'Tier 3: Paired-Out Or Low-Suit Cluttered Hands',
        hands: 'J-J-J-6-6-2, 9-8-7-4-3-2 Without Nut Suit',
        advice: 'Fold Immediately; In PLO6, Any Hand That Cannot Make The Absolute Nuts Plus A Redraw Is A Reverse-Implied-Odds Trap.',
      },
    ],
    keyDifferencesFromHoldem: [
      'With 15 Two-Card Combinations Per Player, Somebody Almost Always Holds The Exact Nuts On Every Street.',
      'Card Removal (Blockers) Is Massive: Seeing 6 Cards In Your Own Hand Plus 5 On The Board Accounts For 21% Of The Entire Deck.',
      'Contains C(52,6) = 20,358,520 Distinct 6-Card Starting Hands.',
    ],
    faqs: [
      {
        q: 'Why Can\'t 6-Card Omaha Be Played At A Full 8-Handed Or 9-Handed Table?',
        a: 'An 8-Handed Table Would Require 48 Hole Cards Plus 5 Board Cards And 3 Burn Cards = 56 Cards, Exceeding A Standard 52-Card Deck. Therefore, PLO6 Is Strictly Capped At 6 Players.',
      },
      {
        q: 'Can I Use Three Hole Cards In 6-Card Omaha Since I Have Six Cards?',
        a: 'Never. Whether You Play PLO4, PLO5, Or PLO6, Every Omaha Variant Strictly Requires Using Exactly 2 Hole Cards And 3 Community Cards.',
      },
    ],
  },
  {
    slug: 'omaha-hi-lo-o8',
    name: 'Omaha Hi-Lo 8-Or-Better (PLO8 / O8)',
    title: 'Omaha Hi-Lo 8-Or-Better (PLO8 & Limit O8) Rules, Qualifier & Strategy',
    h1: 'Omaha Hi-Lo 8-Or-Better (PLO8 / O8) Rules: Split-Pot Qualifier And Scoop Strategy',
    category: 'Community Card',
    holeCards: '4 Face-Down Hole Cards (Independent 2-Card Selection For High And Low)',
    boardCards: '5 Community Cards (3 Flop + 1 Turn + 1 River)',
    bettingStructure: 'Fixed-Limit (Limit O8) Or Pot-Limit (PLO8)',
    handRankingSystem: '50% High Hand / 50% Ace-To-Five 8-Or-Better Low Hand',
    summary:
      'Omaha Hi-Lo 8-Or-Better Splits The Pot 50/50 Between The Best High Hand And The Best Qualifying 8-Or-Better Low Hand (Five Unpaired Cards 8 Or Lower), Using Independent Two-Hole-Card Combinations For Each Half.',
    rulesOverview: [
      'Each Player Receives 4 Hole Cards And Must Use Exactly 2 Hole Cards + 3 Board Cards For High, And May Use The Same Or A Completely Different Pair Of Hole Cards + 3 Board Cards For Low.',
      '8-Or-Better Low Qualifier: To Qualify For The Low Half Of The Pot, The Board Must Contain At Least Three Unpaired Cards Ranked 8 Or Lower (Ace Counts As 1), And The Player Must Make Five Unpaired Cards 8 Or Lower.',
      'Straights And Flushes Do Not Count Against A Low Hand, Making A-2-3-4-5 ("The Wheel") The Best Possible Low Hand As Well As A 5-High Straight.',
      'If Fewer Than Three Unpaired Cards 8 Or Lower Appear On The Board, No Low Hand Is Possible And The Best High Hand Scoops 100% Of The Pot.',
    ],
    startingHandStrategy: [
      {
        tier: 'Tier 1: Nut Low + Nut High Two-Way Scoop Hands',
        hands: 'A-A-2-3 Double-Suited, A-A-2-K Double-Suited, A-2-3-K Double-Suited',
        advice: 'The Gold Standard Of O8: Capable Of Making The Nut A-2 Low With Counterfeit Protection (A-3) Plus Nut Flushes And Top Set For High.',
      },
      {
        tier: 'Tier 2: Protected Wheel Wraps With Suited Ace',
        hands: 'A-2-4-Q Suited Ace, A-2-3-5 Suited, A-3-4-5 Double-Suited',
        advice: 'Strong Multiway Playability Aiming To Free-Roll Or Three-Quarter Opponents Who Hold Naked A-2 Without Backup.',
      },
      {
        tier: 'Tier 3: Middle Cards & One-Way High-Only Hands',
        hands: '9-8-7-6, K-Q-J-9 Offsuit, A-5-8-9 (Weak Low)',
        advice: 'Fold Immediately; Middle Cards (6-7-8-9) Make The Worst Lows And The Lowest Straights, Guaranteeing You Get Quartered Or Scooped.',
      },
    ],
    keyDifferencesFromHoldem: [
      'Playing Only For Half The Pot With A Naked Low Draw Risks Getting "Quartered" (Tying The Low For 25% Of The Pot After Putting In 50% Of The Money).',
      'Counterfeiting Occurs When A Board Card Pairs One Of Your Critical Low Hole Cards (Such As Pairing Your Deuce When You Hold A-2-K-K).',
      'The Odd Chip In Any Split Pot Always Goes To The Winning High Hand.',
    ],
    faqs: [
      {
        q: 'What Does Getting "Quartered" Mean In Omaha Hi-Lo?',
        a: 'If You And An Opponent Both Hold Ace-Deuce For The Exact Same Nut Low While Your Opponent Also Wins The High Hand, Your Opponent Wins 75% Of The Pot (50% High + 25% Tied Low) And You Only Receive 25% ("One Quarter"), Resulting In A Net Chip Loss.',
      },
      {
        q: 'Does A Flush Or Straight Disqualify My Low Hand In Omaha 8-Or-Better?',
        a: 'No. Omaha Hi-Lo Uses Ace-To-Five (California) Lowball Rules Where Straights And Flushes Are Completely Ignored When Evaluating Low Hands.',
      },
    ],
  },
  {
    slug: 'short-deck-six-plus',
    name: 'Short Deck (6+ Hold\'em)',
    title: 'Short Deck (6+ Hold\'em) Rules, 36-Card Rankings & Equity Math',
    h1: 'Short Deck (6+ Hold\'Em) Official Rules: Why Flush Beats Full House & Button Blind Format',
    category: 'Community Card',
    holeCards: '2 Face-Down Hole Cards (36-Card Deck: 2s, 3s, 4s, And 5s Removed)',
    boardCards: '5 Community Cards (3 Flop + 1 Turn + 1 River)',
    bettingStructure: 'No-Limit Ante-Only Format With Double Button Blind',
    handRankingSystem: 'Short Deck Rankings: Flush Beats Full House; A-6-7-8-9 Is The Low Straight',
    summary:
      'Short Deck (6+ Hold\'em) Strips All 2s, 3s, 4s, And 5s From The Deck To Play With 36 Cards, Causing Flushes To Outrank Full Houses And Aces To Play As Both The High Card And The 5 In A-6-7-8-9 Straights.',
    rulesOverview: [
      'Deck Composition: All 16 Cards Ranked 2, 3, 4, And 5 Are Removed, Leaving 36 Total Cards (9 Ranks From 6 Through Ace Across 4 Suits).',
      'Adjusted Hand Rankings: Because Only 9 Cards Of Each Suit Exist, A Flush (Only 4,140 Combos) Is Rarer And Beats A Full House (12,960 Combos).',
      'Ace-Low Straight Rule: The Ace Plays High In A-K-Q-J-T And Also Substitutes For The Missing 5 To Form The Lowest Straight: A-6-7-8-9 (A 9-High Straight).',
      'Ante + Button Blind Structure: Every Player Posts 1 Ante Unit And The Dealer Button Posts An Additional "Button Blind"; Action Starts Left Of The Button On Every Street.',
    ],
    startingHandStrategy: [
      {
        tier: 'Tier 1: High Pocket Pairs & Suited Broadways',
        hands: 'AA, KK, QQ, AKs, AKo, KQs',
        advice: 'Strongest Preflop Holdings, Though Even Pocket Aces Have Narrower Equity Edges Against Connected Hands Than In 52-Card Hold\'em.',
      },
      {
        tier: 'Tier 2: Connected Mid-Rundowns & Suited Connectors',
        hands: 'JTs, T9s, 98s, 87s, 76s, QJs',
        advice: 'In A 36-Card Deck, Open-Ended Straight Draws (8 Outs) Have Roughly 48% To 50% Equity On The Flop Using The Rule Of 6 And 3.',
      },
      {
        tier: 'Tier 3: Offsuit Disconnected High-Low Gappers',
        hands: 'K6o, Q6o, J6o, A7o',
        advice: 'Dominated Hands That Frequently Make Second-Best Pairs Or Non-Nut Straights.',
      },
    ],
    keyDifferencesFromHoldem: [
      'A Flush Officially Beats A Full House Because Only 9 Cards Of Each Suit Exist In The 36-Card Deck.',
      'Use The "Rule Of 6 And 3" Instead Of The Rule Of 4 And 2: Each Out Is Worth ~3.2% Per Street (8-Out Straight Draw = ~48% Equity On The Flop).',
      'Contains Only C(36,2) = 630 Total Two-Card Combos Across 81 Canonical Starting Hands (9x9 Matrix).',
    ],
    faqs: [
      {
        q: 'Why Does A Flush Beat A Full House In Short Deck Poker?',
        a: 'Out Of C(36,5) = 376,992 Possible 5-Card Hands In A 36-Card Deck, There Are 12,960 Full Houses But Only 4,104 Flushes (Plus 36 Straight Flushes), Making A Flush More Than Three Times Rarer Than A Full House.',
      },
      {
        q: 'What Is The Lowest Straight In Short Deck 6+ Hold\'em?',
        a: 'A-6-7-8-9 Is The Lowest Straight (A 9-High Straight), Because The Ace Steps In Where The Removed 5 Would Normally Sit.',
      },
    ],
  },
  {
    slug: 'double-board-bomb-pot-plo',
    name: 'Double-Board PLO Bomb Pots',
    title: 'Double-Board PLO Bomb Pot Rules, Split-Pot Math & Scoop Strategy',
    h1: 'Double-Board Pot-Limit Omaha (PLO) Bomb Pot Rules And Two-Board Strategy',
    category: 'Community Card',
    holeCards: '4 Or 5 Face-Down Hole Cards (Must Use 2 Hole Cards Independently On Each Board)',
    boardCards: 'Two Separate 5-Card Boards Dealt Simultaneously (10 Community Cards Total)',
    bettingStructure: 'Pre-Flop Ante Only (No Preflop Betting), Then Pot-Limit Across Flop, Turn & River',
    handRankingSystem: '50% Top Board High Hand / 50% Bottom Board High Hand',
    summary:
      'In A Double-Board PLO Bomb Pot, Every Player Posts A Uniform Ante And Skips Preflop Betting To See Two Simultaneous 3-Card Flops, Playing One Central Pot Split 50/50 Between The Top Board And Bottom Board.',
    rulesOverview: [
      'All Participating Players Post An Agreed Bomb Pot Ante (Typically 2BB To 5BB) And Hole Cards Are Dealt With Zero Preflop Betting Round.',
      'The Dealer Immediately Burns One Card And Deals Two Parallel 3-Card Flops (Top Board And Bottom Board), Followed By Simultaneous Turn And River Cards.',
      'There Is Only One Central Pot And One Betting Action Per Street Starting Left Of The Dealer Button; Any Bet Applies To Both Boards At Once.',
      'At Showdown, Players Use Any Two Of Their Hole Cards With Three Top-Board Cards For Top Half (50%) And Any Two Of Their Hole Cards With Three Bottom-Board Cards For Bottom Half (50%).',
    ],
    startingHandStrategy: [
      {
        tier: 'Tier 1: Nut Lock On One Board + Strong Draw On Second Board',
        hands: 'Top Set Or Nut Flush/Straight On Board A + Nut Draw Or Two Pair On Board B',
        advice: 'This Is A "Freeroll" Position: Pot And Re-Pot Aggressively Because You Cannot Lose Money And Can Scoop 100% Of The Pot.',
      },
      {
        tier: 'Tier 2: Strong Draws On Both Boards Simultaneously',
        hands: 'Nut Flush Draw On Top Board + Open-Ended Wrap On Bottom Board',
        advice: 'Play Semi-Bluff Raises When Holding Shared Ace Or Broadway Blockers That Reduce Opponents\' Ability To Hold Lock Nuts.',
      },
      {
        tier: 'Tier 3: One-Board Non-Nut Hand With Zero Equity On The Other Board',
        hands: 'Middle Set Or Queen-High Flush On Board A + Complete Air On Board B',
        advice: 'Fold Facing Multi-Street Pot-Sized Bets; Paying Three Streets To At Best Chop 50% Of The Pot Is A Massive Long-Term EV Bleed.',
      },
    ],
    keyDifferencesFromHoldem: [
      'Skipping Preflop Action Means Every Single Player Reaches The Flop With 100% Random Unfiltered Ranges (7-2-4-9 Appears Just As Often As A-A-K-K).',
      'Winning Only One Board Merely Returns Your Own Postflop Bets Minus Rake; Real Profit Comes Strictly From Scooping Both Boards Or Three-Quartering.',
      'In 5-Card Double-Board PLO With 6 Players, 30 Hole Cards + 10 Board Cards + 3 Burns = 43 Of 52 Cards Are In Play.',
    ],
    faqs: [
      {
        q: 'Do I Have To Use The Same Two Hole Cards On Both The Top And Bottom Boards?',
        a: 'No. Each Board Is Evaluated Completely Independently: You Can Use Hole Cards 1 And 2 To Make A Full House On The Top Board, And Hole Cards 3 And 4 To Make A Flush On The Bottom Board.',
      },
      {
        q: 'Who Gets The Odd Chip In A Double-Board Bomb Pot?',
        a: 'When The Total Pot Cannot Be Divided Evenly Into Two Identical Halves, The Single Odd Chip Is Always Awarded To The Winner Of The Top (Upper) Board.',
      },
    ],
  },
  {
    slug: 'seven-card-stud',
    name: 'Seven-Card Stud High',
    title: 'Seven-Card Stud High Rules, Bring-In, Streets & Strategy',
    h1: 'Seven-Card Stud Official Rules: Third Through Seventh Street, Bring-In, And Dead Cards',
    category: 'Stud Games',
    holeCards: '3 Face-Down Cards (2 On Third Street + 1 On Seventh Street)',
    boardCards: '4 Face-Up Exposed Door/Upcards Per Player (No Shared Community Cards)',
    bettingStructure: 'Fixed-Limit With Antes And Forced Low-Card Bring-In On Third Street',
    handRankingSystem: 'Standard 52-Card High Hand Rankings',
    summary:
      'Seven-Card Stud Is A Non-Community-Card Fixed-Limit Game Where Each Player Receives Seven Individual Cards Across Five Betting Streets (Two Down, Four Up, One Down) And Makes Their Best 5-Card High Hand.',
    rulesOverview: [
      'Third Street Deal & Bring-In: All Players Post An Ante And Receive Two Face-Down Hole Cards Plus One Face-Up "Door Card". The Player With The Lowest Door Card (By Rank, Then Suit: Clubs Lowest, Diamonds, Hearts, Spades) Must Post The Forced Bring-In Or Complete To A Full Small Bet.',
      'Fourth, Fifth, And Sixth Streets: Each Active Player Receives One Additional Face-Up Card Per Street. Starting On Fourth Street, Action Always Begins With The Player Showing The Highest Exposed Poker Hand.',
      'Double Bet Transition: Third And Fourth Streets Use The Small Bet Limit (Except In Optional Pair-On-Fourth-Street Rules); Fifth, Sixth, And Seventh Streets Use The Big Bet Limit.',
      'Seventh Street (The River): Each Player Receives Their Seventh And Final Card Face Down ("Down And Dirty"), Followed By The Final Betting Round And Showdown.',
    ],
    startingHandStrategy: [
      {
        tier: 'Tier 1: Rolled-Up Trips & High Split/Wired Pairs With Live Kickers',
        hands: '(A-A)A, (K-K)K, (A-A)K, (K-Q)K With All Suits And Ranks Live',
        advice: 'Complete Or Raise Immediately On Third Street To Thin The Field And Extract Maximum Value.',
      },
      {
        tier: 'Tier 2: Three-Flushes & Three-Card Straight Connectors With Live Outs',
        hands: '(A-Q)T All Spades, (J-T)9 Rainbow With Zero Dead Tens Or Eights Seen',
        advice: 'Profitable Only When Most Of Your Suit And Rank Cards Remain Unseen Across Opponents\' Exposed Door Cards.',
      },
      {
        tier: 'Tier 3: Dead-Out Pairs & Dominated Low Pairs',
        hands: '(8-8)3 When Two Eights Are Already Folded Face Up Around The Table',
        advice: 'Fold Immediately; In Stud, Tracking Exposed Dead Upcards Is The Single Most Important Skill.',
      },
    ],
    keyDifferencesFromHoldem: [
      'There Is No Dealer Button And No Community Board: Action Order Changes On Every Street Based On Who Shows The Highest Exposed Upcards.',
      'Bridge Suit Order (Spades High > Hearts > Diamonds > Clubs Low) Determines Both The Mandatory Third-Street Bring-In And Who Acts First When Exposed Upcards Tie.',
      'If An 8-Player Hand Runs Out Of Cards Before Seventh Street, The Dealer Deals One Shared Community Card Face Up In The Center For All Remaining Players.',
    ],
    faqs: [
      {
        q: 'Which Suit Has To Post The Bring-In When Two Players Tie For The Lowest Door Card In Stud?',
        a: 'Alphabetical Bridge Suit Order Breaks All Door-Card Ties From Lowest To Highest: Clubs (Lowest), Diamonds, Hearts, And Spades (Highest). Therefore, A 2 Of Clubs Must Post The Bring-In Over A 2 Of Diamonds.',
      },
      {
        q: 'What Does "Rolled Up" Mean In Seven-Card Stud?',
        a: 'Being Dealt Three Of A Kind On Your Very First Three Cards On Third Street (Two Down And One Up) Is Called Being "Rolled Up", Which Occurs Once Every 425 Hands (0.24%).',
      },
    ],
  },
  {
    slug: 'seven-card-stud-hi-lo',
    name: 'Seven-Card Stud Hi-Lo 8-Or-Better',
    title: 'Seven-Card Stud Hi-Lo 8-Or-Better (Stud8) Rules & Strategy',
    h1: 'Seven-Card Stud Hi-Lo 8-Or-Better (Stud8) Official Rules And Two-Way Scoop Strategy',
    category: 'Stud Games',
    holeCards: '3 Face-Down Cards (2 On Third Street + 1 On Seventh Street)',
    boardCards: '4 Face-Up Exposed Upcards Per Player',
    bettingStructure: 'Fixed-Limit With Antes And Low-Card Bring-In',
    handRankingSystem: '50% High Hand / 50% Ace-To-Five 8-Or-Better Low Hand',
    summary:
      'Seven-Card Stud Hi-Lo 8-Or-Better (Stud8) Combines Five-Street Seven-Card Stud Mechanics With An 8-Or-Better Split Pot, Where The Best High Hand And Best Qualifying Low Hand Split The Pot 50/50.',
    rulesOverview: [
      'Uses The Same Seven-Card Deal As Stud High (2 Down + 1 Up On Third Street, Upcards On Fourth/Fifth/Sixth, And Final Card Down On Seventh).',
      'The Lowest Door Card By Rank And Bridge Suit Order Posts The Bring-In On Third Street (With Aces Counting As High For Door-Card Bring-In Purposes).',
      'From Fourth Street Through Seventh Street, The Player Showing The Highest Exposed High Poker Hand Always Acts First.',
      'At Showdown, Any Five Of A Player\'s Seven Cards Form Their High Hand And Any Five Cards Form Their 8-Or-Better Low Hand; If Nobody Makes Five Unpaired Cards 8 Or Lower, The High Hand Scoops.',
    ],
    startingHandStrategy: [
      {
        tier: 'Tier 1: Ace-Low Three-Flushes & Ace-Low Pairs With Low Door Card',
        hands: '(A-2)3 All Hearts, (A-A)2, (A-3)5 Suited With Live Low Cards',
        advice: 'Elite Two-Way Hands That Threaten Both A Wheel Low And A Flush Or Aces-Up High To Scoop The Entire Pot.',
      },
      {
        tier: 'Tier 2: Three Unpaired Wheel Cards Or Rolled-Up Trips',
        hands: '(2-4)5 Rainbow With Live Aces/Threes, (K-K)K Rolled Up',
        advice: 'Playable When Low Cards Around The Table Are Live Or When Your High Hand Can Prevent Opponents From Making A Low.',
      },
      {
        tier: 'Tier 3: High-Only One-Way Pairs & Rough 8-High Lows',
        hands: '(Q-Q)4, (8-7)6 Rainbow With Dead Low Cards',
        advice: 'Fold On Third Street Whenever Multiple Low Door Cards Are Out Against A High Pair.',
      },
    ],
    keyDifferencesFromHoldem: [
      'Unlike Omaha Hi-Lo Where Everyone Shares One Board, In Stud8 One Player Can Clearly Show Four Low Upcards While Another Shows High Pairs.',
      'There Is No Fourth-Street Double-Bet Option For An Exposed Pair In Stud Hi-Lo (Third And Fourth Streets Always Use The Small Bet).',
      'Scooping Both Halves Of The Pot By Holding A Low That Also Completes A Straight Or Flush Is The Core Path To Profit.',
    ],
    faqs: [
      {
        q: 'Does An Ace Door Card Count As High Or Low For The Third-Street Bring-In In Stud8?',
        a: 'Even Though Aces Play Both High And Low At Showdown, An Exposed Ace On Third Street Always Counts As The Highest Rank For Door-Card Purposes And Never Posts The Low Bring-In.',
      },
      {
        q: 'Can I Use Different Five-Card Subsets Of My Seven Cards For High And Low?',
        a: 'Yes. Out Of Your Seven Final Cards, You Choose Your Best 5-Card High Hand And Independently Choose Your Best 5-Card Low Hand.',
      },
    ],
  },
  {
    slug: 'razz-seven-card-lowball',
    name: 'Razz (Seven-Card Lowball)',
    title: 'Razz Poker Rules: Seven-Card Ace-To-Five Lowball Rankings & Strategy',
    h1: 'Razz Poker Official Rules: Seven-Card Ace-To-Five Lowball, High-Card Bring-In & Wheel Rankings',
    category: 'Stud Games',
    holeCards: '3 Face-Down Cards (2 On Third Street + 1 On Seventh Street)',
    boardCards: '4 Face-Up Exposed Upcards Per Player',
    bettingStructure: 'Fixed-Limit With Antes And HIGH-Card Bring-In On Third Street',
    handRankingSystem: '100% Ace-To-Five (California) Lowball (A-2-3-4-5 Is The Nuts)',
    summary:
      'Razz Is Seven-Card Stud Played Strictly For The Lowest 5-Card Ace-To-Five Hand (Where Aces Are Always Low, Straights And Flushes Do Not Count Against You, And A-2-3-4-5 Is The Unbeatable Wheel).',
    rulesOverview: [
      'Reverse Bring-In: On Third Street, The Player With The HIGHEST Exposed Door Card (King High, With Spades Highest For Ties, Because Aces Are Low) Must Post The Forced Bring-In.',
      'From Fourth Street Onward, The Player Showing The Best (LOWEST) Exposed Upcards Acts First On Every Betting Round.',
      'Ace-To-Five Lowball Ranking: Aces Are Always The Lowest Card (1), Straights And Flushes Do Not Hurt Your Low, And Low Hands Are Read Top-Down From Their Highest Card (For Example, 7-5-4-2-A Beats 7-6-3-2-A).',
      'The Entire Pot Is Awarded 100% To The Best 5-Card Low Hand Made From Each Player\'s 7 Cards, With No 8-Or-Better Qualifier Required.',
    ],
    startingHandStrategy: [
      {
        tier: 'Tier 1: Three Wheel Cards (5 Or Lower) With Low Door Card',
        hands: '(A-2)3, (A-3)4, (2-3)5 With Live Low Ranks Around The Table',
        advice: 'Complete And Raise Aggressively On Third Street To Isolate High-Door-Card Bring-Ins And Steal Antes.',
      },
      {
        tier: 'Tier 2: Smooth 6-Low Or 7-Low Starters In Steal Position',
        hands: '(A-2)6, (2-4)7, (A-4)7 When Folded To Late Action With High Cards Behind',
        advice: 'Strong Steal And Continuation Hands When Opponents Catch Bricks (9, T, J, Q, K) On Fourth Street.',
      },
      {
        tier: 'Tier 3: Rough 8-Highs Or Concealed Pairs',
        hands: '(3-8)2, (A-A)4, (4-7)8 With Dead Low Cards',
        advice: 'Fold Immediately On Third Street; Drawing To An 8-7 Low Against Smooth 6-Low Or 7-Low Upcards Is Heavily Dominated.',
      },
    ],
    keyDifferencesFromHoldem: [
      'Aces Are Strictly Low (1), Suits And Straights Never Matter For Hand Strength, And The Highest Door Card (King Of Spades Worst) Posts The Bring-In.',
      'Low Hands Are Evaluated By Their Highest Card Downward: A "Smooth Eight" (8-5-3-2-A) Crushes A "Rough Eight" (8-7-6-4-2).',
      'Seeing Your Opponents Brick Out With Paint Cards (J, Q, K) On Fourth Or Fifth Street Allows Automatic Value Bets Even When Your Own Hand Pairs.',
    ],
    faqs: [
      {
        q: 'Which Hand Wins Between 8-4-3-2-A And 7-6-5-4-3 In Razz?',
        a: '7-6-5-4-3 Wins! Even Though 7-6-5-4-3 Is A 7-High Straight In Hold\'em, Straights Do Not Count In Razz, And A 7-High Low Always Beats An 8-High Low.',
      },
      {
        q: 'Which Suit Posts The Bring-In When Two Players Show A King On Third Street In Razz?',
        a: 'Because The Worst (Highest) Card Posts The Bring-In In Razz, Standard Bridge Suit Order Applies: The King Of Spades Is Higher (Worse) Than The King Of Hearts, Diamonds, Or Clubs And Must Post The Bring-In.',
      },
    ],
  },
  {
    slug: 'deuce-to-seven-triple-draw',
    name: '2-7 Triple Draw Lowball',
    title: '2-7 Triple Draw Lowball (Kansas City Lowball) Rules & 7-5-4-3-2 Rankings',
    h1: '2-7 Triple Draw Lowball (Kansas City Lowball) Official Rules, Three Draws & Strategy',
    category: 'Draw & Lowball',
    holeCards: '5 Private Cards Per Player With 3 Sequential Draw Opportunities',
    boardCards: 'None (100% Closed Draw Game)',
    bettingStructure: 'Fixed-Limit Across 4 Betting Rounds (Before Draw 1, After Draw 1, After Draw 2, After Draw 3)',
    handRankingSystem: 'Deuce-To-Seven (Kansas City) Lowball: Aces Are HIGH, Straights & Flushes Hurt (7-5-4-3-2 Offsuit Is The Nuts)',
    summary:
      '2-7 Triple Draw (Kansas City Lowball) Is A Fixed-Limit Closed Draw Game With Three Card-Exchange Rounds Where Aces Always Count As High Cards And Straights And Flushes Count Against Your Low, Making 7-5-4-3-2 Unsuited ("The Wheel" / "Number One") The Best Possible Hand.',
    rulesOverview: [
      'Uses A Dealer Button, Small Blind, And Big Blind With Four Fixed-Limit Betting Rounds Interleaved With Three Draw Rounds (Small Bet Before And After Draw 1; Big Bet After Draw 2 And Draw 3).',
      'On Each Of The Three Draws, Active Players May Discard Anywhere From 1 To 5 Cards To Receive Replacements From The Deck, Or "Stand Pat" (Discard 0 Cards).',
      'Deuce-To-Seven Hand Rankings: Exact Opposite Of High Poker. Aces Are Always HIGH (So A-2-3-4-5 Is NOT A Low Straight - It Is Simply Ace-High, Which Loses To Every Unpaired King-High Or Better), And Straights And Flushes Count Against You.',
      'The Best Possible Hand Is 7-5-4-3-2 Not All Of The Same Suit ("Number One"), Followed By 7-6-4-3-2, 7-6-5-3-2, 7-6-5-4-2, And 8-5-4-3-2.',
    ],
    startingHandStrategy: [
      {
        tier: 'Tier 1: Pat 7-Lows, Pat Smooth 8-Lows & One-Card Draws To A 7',
        hands: '7-5-4-3-2, 8-5-4-3-2, 2-3-4-7-x, 2-3-5-7-x',
        advice: 'Raise And 3-Bet From Every Position; One-Card Draws Containing A Deuce Have Massive Equity Over Three Draws.',
      },
      {
        tier: 'Tier 2: Two-Card Wheel Draws Containing A Deuce',
        hands: '2-3-4-x-x, 2-3-5-x-x, 2-4-5-x-x, 2-3-7-x-x',
        advice: 'Strong Open-Raises From Middle And Late Position; Always Prioritize Keeping A Deuce To Avoid Making Accidental Straights.',
      },
      {
        tier: 'Tier 3: Three-Card Draws & Straight-Prone Non-Deuce Draws',
        hands: '3-4-5-6-x (Open-Ended Straight Trap), 4-5-6-x-x, Any Hand With Aces',
        advice: 'Fold Preflop; Holding 3-4-5-6 Means Every 2 Or 7 You Catch Makes A Straight Instead Of A Low.',
      },
    ],
    keyDifferencesFromHoldem: [
      'Aces Are Strictly High Cards And Straights/Flushes Destroy Your Low Hand (Making 7-5-4-3-2 Offsuit The Nuts Instead Of A-2-3-4-5).',
      'Because There Are Zero Exposed Cards, Information Comes Entirely From Position, Betting Action, And How Many Cards Each Opponent Draws (1, 2, 3, Or Standing Pat).',
      'In Multiway Hands, The Deck Can Run Out Of Cards On The Third Draw, Requiring Previously Mucked Discards And Burn Cards To Be Reshuffled.',
    ],
    faqs: [
      {
        q: 'Why Is 7-5-4-3-2 The Best Hand In 2-7 Lowball Instead Of 6-5-4-3-2?',
        a: 'Because 6-5-4-3-2 Is A Six-High Straight! In Deuce-To-Seven Lowball, Straights And Flushes Count Against You As High Hands, So 7-5-4-3-2 Unsuited Is The Lowest Possible 5-Card Combination Without A Straight.',
      },
      {
        q: 'Is A-2-3-4-5 A Straight In Deuce-To-Seven Lowball?',
        a: 'No. In 2-7 Rules, The Ace Plays Strictly High (Above A King) And Never Counts As A 1, So A-5-4-3-2 Unsuited Is Simply An Ace-High Unpaired Hand (Which Still Beats One Pair, Straights, And Flushes, But Loses To Any King-High Or Better).',
      },
    ],
  },
  {
    slug: 'no-limit-deuce-to-seven-single-draw',
    name: 'No-Limit 2-7 Single Draw Lowball',
    title: 'No-Limit 2-7 Single Draw Lowball ("Kansas City Lowball") Rules & Strategy',
    h1: 'No-Limit 2-7 Single Draw Lowball Official Rules: The Purest Bluffing Game In Poker',
    category: 'Draw & Lowball',
    holeCards: '5 Private Cards Per Player With Only ONE Single Draw Round',
    boardCards: 'None (100% Closed Single-Draw Format)',
    bettingStructure: 'No-Limit With Blinds + Big Blind Ante Across Two Betting Rounds (Pre-Draw & Post-Draw)',
    handRankingSystem: 'Deuce-To-Seven Lowball (7-5-4-3-2 Unsuited Is The Nuts; Aces Are High)',
    summary:
      'No-Limit 2-7 Single Draw Gives Each Player Five Private Cards, One Preflop No-Limit Betting Round, Exactly One Draw Opportunity (Or Stand Pat), And One Final Post-Draw No-Limit Betting Street.',
    rulesOverview: [
      'Uses The Same Deuce-To-Seven Hand Rankings As Triple Draw (7-5-4-3-2 Offsuit Is #1; Aces Are High; Straights And Flushes Hurt).',
      'Only Two Betting Streets Exist: Pre-Draw No-Limit Action And Post-Draw No-Limit Action, Separated By A Single Card Exchange.',
      'Because Players Only Get One Single Chance To Draw Cards, Pat Jacks, Pat Tens, And Rough Pat Nines Are Routine Value Hands Head-Up.',
      'Under Official TDA Draw Rules, A Player May Not Draw All 5 New Cards In A Single Unified Motion If Dealt 5 Cards Unless Permitted By Specific House Rules (In Standard WSOP 2-7 Single Draw, Drawing 1 To 5 Cards Is Permitted).',
    ],
    startingHandStrategy: [
      {
        tier: 'Tier 1: Pat 7s, 8s, 9s, Ts & Smooth One-Card Draws To 7 Or 8',
        hands: 'Pat 9-7-5-3-2, Pat T-8-6-4-2, 2-3-4-7-K (1-Card Draw)',
        advice: 'Open-Raise And Re-Raise Pre-Draw; Pat Tens And Nines Regularly Stand Pat And Apply Maximum No-Limit Pressure.',
      },
      {
        tier: 'Tier 2: Smooth 1-Card Draws To 9/T & Pat Jack Steals In Late Position',
        hands: '2-4-6-9-Q, Pat J-8-6-4-2 On Button Or Cutoff',
        advice: 'In Position Against A Single-Card Drawer, Standing Pat With A Jack Or Ten Forces Your Opponent To Hit Their Draw To Continue.',
      },
      {
        tier: 'Tier 3: Two-Card And Three-Card Draws',
        hands: '2-3-7-K-K, 3-5-8-Q-A',
        advice: 'Fold Almost All Two-Card Draws Facing A Raise; With Only A Single Draw, A Two-Card Draw Hits A Playable Hand Less Than 22% Of The Time.',
      },
    ],
    keyDifferencesFromHoldem: [
      'Widely Regarded By World Championship Pros As The Purest Psychological And Quantitative Bluffing Game In Poker ("Snowing" By Standing Pat With A Pair Or Aces To Bluff Post-Draw).',
      'With Only One Draw, A 1-Card Draw Against A Pat 9 Or Pat 10 Is Roughly A Coin Flip Depending On How Many Outs Are Live.',
      'Post-Draw Bet Sizing Spans From Small 30% Pot Block Bets Up To 2x Pot Polarized All-In Overbets.',
    ],
    faqs: [
      {
        q: 'What Does "Snowing" Mean In No-Limit 2-7 Single Draw?',
        a: 'Snowing Is Standing Pat (Drawing Zero Cards) With A Garbage Hand Like Two Pair Or Three Aces With The Intention Of Firing A Large Post-Draw Bluff If Your Drawing Opponent Bricks Their 1-Card Draw.',
      },
      {
        q: 'What Are My Odds Of Improving A 1-Card Draw To An 8-Low Or Better On A Single Draw?',
        a: 'Holding A Smooth 2-3-4-7-x Draw, Any 5, 6, Or 8 Makes An 8-Low Or 7-Low (12 Outs Out Of 47 Unseen Cards = 25.5%), Plus Any 9 Or T Makes A Playable 9-Low Or T-Low (Another 8 Outs = 42.5% Total Non-Pair/Non-Jack Hit Rate).',
      },
    ],
  },
  {
    slug: 'badugi-four-card-lowball',
    name: 'Badugi (Four-Card Lowball)',
    title: 'Badugi Poker Rules: Four-Card Rainbow Suit-Distinct Lowball & Strategy',
    h1: 'Badugi Official Rules: Four-Card Rainbow Lowball, Suit Elimination & A-2-3-4 Rankings',
    category: 'Draw & Lowball',
    holeCards: '4 Private Hole Cards Per Player With 3 Sequential Draws',
    boardCards: 'None (Closed 4-Card Triple-Draw Format)',
    bettingStructure: 'Fixed-Limit (Or Pot-Limit) Across 4 Betting Streets And 3 Draws',
    handRankingSystem: '4-Card Rainbow Unpaired Lowball (A-2-3-4 With One Of Each Suit Is The Nuts)',
    summary:
      'Badugi Is A Four-Card Triple-Draw Lowball Game Where Both Matching Suits And Matching Ranks Are Eliminated, So Every Four-Card Rainbow Unpaired Hand ("A Badugi") Beats Every Three-Card Hand.',
    rulesOverview: [
      'Each Player Receives 4 Private Hole Cards And Plays Four Fixed-Limit Betting Rounds Separated By Three Draw Rounds (Drawing 0 To 4 Cards Per Round).',
      'Suit And Rank Elimination Rule: When Evaluating A Badugi Hand, Any Duplicate Ranks (Pairs) AND Any Duplicate Suits Are Removed So Only The Lowest Unpaired, All-Different-Suit Subset Remains.',
      'Hierarchy Of Hand Sizes: Any 4-Card Badugi (All 4 Suits And 4 Unpaired Ranks, Even K-Q-J-T Rainbow) Beats Every 3-Card Hand; Every 3-Card Hand Beats Every 2-Card Hand; Every 2-Card Hand Beats Every 1-Card Hand.',
      'Aces Are Always Low (1) And Straights Do Not Matter, Making A-2-3-4 With One Spade, One Heart, One Diamond, And One Club The Unbeatable Nuts.',
    ],
    startingHandStrategy: [
      {
        tier: 'Tier 1: Pat Badugis (8-High Or Better) & Smooth Tri-Cards (A-2-3 Rainbow)',
        hands: 'A-2-3-4 Rainbow, 7-4-2-A Rainbow, A-2-3-x (3 Distinct Suits)',
        advice: '3-Bet And Cap Preflop; An A-2-3 Three-Card Rainbow Hand Has 10 Specific Outs Per Draw To Complete A Nut-Tier Badugi.',
      },
      {
        tier: 'Tier 2: Medium Tri-Cards (5-High To 7-High Rainbow) & Pat Rough Badugis',
        hands: 'A-3-6-x Rainbow, 2-4-7-x Rainbow, Pat J-9-6-3 Rainbow',
        advice: 'In Late Position, Pat Rough Badugis (J-High Or Q-High) Are Favorites Against Opponents Still Drawing Two Cards.',
      },
      {
        tier: 'Tier 3: Two-Card Hands Without Ace-Deuce Or Suited Clutter',
        hands: '5s-6s-5h-9h, 3d-7d-8c-8s',
        advice: 'Fold Immediately Preflop; Drawing Two Cards Across Three Draws Against A 1-Card Drawer Is Heavily Underdog.',
      },
    ],
    keyDifferencesFromHoldem: [
      'The Only Mainstream Poker Variant Played With Four Final Cards Where Suits Actively Conflict With Each Other Rather Than Helping Make A Flush.',
      'A 1-Card Badugi Draw Has At Most 10 Outs Out Of 48 Unseen Cards (13 Cards Of The Missing Suit Minus The 3 Ranks You Already Hold = 10 Outs, Or ~20.8% Per Draw).',
      'Breaking A Pat Rough Badugi (Like K-8-3-2 Rainbow) To Draw 1 Card Toward An 8-Low On The Second Draw Is A High-Level Tactical Play.',
    ],
    faqs: [
      {
        q: 'Which Hand Wins In Badugi: K-Q-J-T Of Four Different Suits Or As-2h-3d-4d?',
        a: 'K-Q-J-T Of Four Different Suits Wins! Because As-2h-3d-4d Has Two Diamonds, The Higher Diamond (4d) Is Disqualified, Leaving Only A 3-Card Hand (As-2h-3d). Every 4-Card Badugi Beats Every 3-Card Hand.',
      },
      {
        q: 'How Many Outs Does A Three-Card Hand Have To Make A Badugi On One Draw?',
        a: 'If You Hold Three Unpaired Cards Of Three Different Suits (Like As-2h-3d), Only The Fourth Suit (Clubs) Can Make A Badugi, And The Ace, 2, And 3 Of Clubs Would Pair Your Ranks, Leaving Exactly 13 - 3 = 10 Maximum Outs.',
      },
    ],
  },
  {
    slug: 'horse-and-eight-game-mix',
    name: 'H.O.R.S.E. & 8-Game Mixed Poker',
    title: 'H.O.R.S.E. & 8-Game Mixed Poker Rules, Rotation Order & Strategy',
    h1: 'H.O.R.S.E. And 8-Game Mixed Poker Official Rules, Rotation Order, And Multi-Variant Strategy',
    category: 'Mixed Rotations',
    holeCards: 'Rotates By Variant (2 Cards In Hold\'em, 4 In Omaha, 7 In Stud/Razz, 5 In 2-7)',
    boardCards: 'Rotates Between 5 Community Cards, 4 Exposed Stud Upcards, And Closed Draw',
    bettingStructure: 'Fixed-Limit For All 5 H.O.R.S.E. Games; 8-Game Adds NLHE, PLO & NL 2-7 Single Draw',
    handRankingSystem: 'Rotates Every Orbit Or Fixed Hand Count Between High, Hi-Lo 8-Or-Better & Lowball',
    summary:
      'H.O.R.S.E. Rotates Across Five Fixed-Limit Classics (Hold\'em, Omaha Hi-Lo, Razz, Seven-Card Stud High, And Seven-Card Stud Hi-Lo), While 8-Game Mix Adds 2-7 Triple Draw, No-Limit Hold\'em, And Pot-Limit Omaha.',
    rulesOverview: [
      'H.O.R.S.E. Acronym Order: (H) Fixed-Limit Texas Hold\'em -> (O) Fixed-Limit Omaha Hi-Lo 8-Or-Better -> (R) Razz -> (S) Seven-Card Stud High -> (E) Seven-Card Stud Hi-Lo 8-Or-Better (Eight-Or-Better).',
      '8-Game Rotation Order: Starts With Fixed-Limit 2-7 Triple Draw, Followed By All Five H.O.R.S.E. Games, Plus No-Limit Texas Hold\'em And Pot-Limit Omaha (PLO4).',
      'Game Switching Cadence: In Live Tournaments And Cash Games, The Variant Rotates Every 6 Or 8 Hands (One Full Orbit) Indicated By A Dealer Plaque On The Table.',
      'Button Retention During Stud Rounds: When Transitioning From Omaha Hi-Lo Into The Three Stud Games (Razz, Stud High, Stud8), The Physical Dealer Button Is Frozen In Place So Blinds Resume Fairly When Returning To Flop/Draw Games.',
    ],
    startingHandStrategy: [
      {
        tier: 'Tier 1: Split-Pot Scoop Discipline In O8 And Stud8',
        hands: 'A-2-3-x Suited In O8; (A-2)3 Or Three-Flushes With Low Cards In Stud8',
        advice: 'Never Chase One-Way Non-Nut Half-Pots; Mixed-Game Winrates Are Built On Scooping In The Two Hi-Lo Games.',
      },
      {
        tier: 'Tier 2: Dead-Card Tracking Across All Three Stud Variants',
        hands: 'Live High Pairs In Stud High; Smooth 5-Card Or 6-Card Starters With Live Outs In Razz',
        advice: 'Three Of The Five H.O.R.S.E. Games Are Seven-Card Stud Variants (60% Of The Rotation), Making Upcard Memory Mandatory.',
      },
      {
        tier: 'Tier 3: Stack Conservation During Big-Bet 8-Game Rounds (NLHE & PLO)',
        hands: 'Tight Positional Value Ranges When Big-Bet Rounds Follow Limit Rounds',
        advice: 'In 8-Game Tournaments, Avoid Blowing 15 Big Bets Of Limit Equity On Marginal Spot Bluffs During The NLHE And PLO Orbits.',
      },
    ],
    keyDifferencesFromHoldem: [
      'Tests Complete All-Around Poker Mastery Across Community Card, Stud, Draw, High-Only, Lowball, And Split-Pot Formats.',
      '60% Of H.O.R.S.E. Consists Of Fixed-Limit Stud Games (Razz, Stud High, Stud8), Rewarding Fold Equity And Upcard Tracking Over Solver Memorization.',
      'Forms The Backbone Of The WSOP $50,000 Poker Players Championship (PPC) Rotation.',
    ],
    faqs: [
      {
        q: 'What Does Each Letter In H.O.R.S.E. Stand For?',
        a: 'H = Limit Texas Hold\'em, O = Limit Omaha Hi-Lo 8-Or-Better, R = Razz (7-Card Stud Low), S = Seven-Card Stud High, And E = Seven-Card Stud Hi-Lo Eight-Or-Better.',
      },
      {
        q: 'What Are The Three Extra Games Added To H.O.R.S.E. In An 8-Game Mix?',
        a: '8-Game Mix Adds Limit 2-7 Triple Draw Lowball, No-Limit Texas Hold\'em (NLHE), And 4-Card Pot-Limit Omaha (PLO).',
      },
    ],
  },
  {
    slug: 'pineapple-and-crazy-pineapple',
    name: 'Pineapple & Crazy Pineapple',
    title: 'Pineapple & Crazy Pineapple Hold\'em Rules, Discard Timing & Strategy',
    h1: 'Pineapple And Crazy Pineapple Hold\'Em Official Rules: Pre-Flop Vs. Post-Flop Discard',
    category: 'Community Card',
    holeCards: '3 Face-Down Hole Cards Dealt (Must Discard 1 Card To Play With 2 Hole Cards)',
    boardCards: '5 Community Cards (3 Flop + 1 Turn + 1 River)',
    bettingStructure: 'No-Limit Or Pot-Limit (Standard Hold\'em Blinds)',
    handRankingSystem: 'Standard 52-Card High Hand Rankings (0, 1, Or Both Remaining Hole Cards Play)',
    summary:
      'Pineapple And Crazy Pineapple Deal Each Player Three Private Hole Cards Before Requiring Each Player To Discard One Card (Pre-Flop In Pineapple; After Flop Betting In Crazy Pineapple) And Finish The Hand Exactly Like Texas Hold\'em.',
    rulesOverview: [
      'Initial Deal: Every Player Receives 3 Private Hole Cards Face Down Instead Of 2, Giving Each Player C(3,2) = 3 Internal Two-Card Hold\'em Pairs To Choose From.',
      'Standard Pineapple Discard Rule: Players Must Discard 1 Of Their 3 Hole Cards BEFORE The 3-Card Flop Is Dealt.',
      'Crazy Pineapple Discard Rule: Players Keep All 3 Hole Cards Through The Flop Deal And Complete The Entire Flop Betting Round Before Every Active Player Discards 1 Hole Card Prior To Dealing The Turn.',
      'Once The Discard Occurs, Players Hold Exactly 2 Hole Cards And Play Out The Remainder Of The Hand Under Standard Texas Hold\'em Rules (Where 0, 1, Or Both Hole Cards Can Play At Showdown).',
    ],
    startingHandStrategy: [
      {
        tier: 'Tier 1: High Pocket Pairs With Coordinated Suited Side Card',
        hands: 'A-A-K Double-Suited, K-K-Q, A-K-Q With Two Suited Cards',
        advice: 'In Crazy Pineapple, Seeing The Flop With A-A-K Gives You Both Overpair Security And Nut Broadway/Flush Flexibility Before Choosing Your Discard.',
      },
      {
        tier: 'Tier 2: Three-Card Connected Double-Suited Runs',
        hands: 'Q-J-T Double-Suited, J-T-9 Double-Suited, A-5-4 With Suited Ace',
        advice: 'Keep All Three Cards To The Flop In Crazy Pineapple To Retain Whichever Pair Connects Best With The Board Texture.',
      },
      {
        tier: 'Tier 3: Trips In The Hole Or Three Uncoordinated Offsuit Ranks',
        hands: '8-8-8 (Rolled-Up Trips Must Discard One!), K-8-3 Rainbow',
        advice: 'Being Dealt Three Of A Kind In Pineapple Is Actually A Trap Because You Must Discard One Of Your Own Set Outs!',
      },
    ],
    keyDifferencesFromHoldem: [
      'In Crazy Pineapple, Reaching The Turn With Only 2 Hole Cards After Evaluating The Flop With 3 Cards Significantly Increases Average Hand Strength (Two Pair And Sets Are Common).',
      'Failing To Discard Your Third Card Before The Mandatory Deadline Kills Your Hand Dead Under Official Cardroom Rules.',
      'Lazy Pineapple ("Tahoe Pineapple") Is A Third Sub-Variant Where Players Keep All 3 Hole Cards Until The River Showdown And Still Use Up To 2.',
    ],
    faqs: [
      {
        q: 'What Happens If I Get Dealt Three Aces (A-A-A) In Pineapple Or Crazy Pineapple?',
        a: 'Because You Must Discard One Hole Card To Get Down To Two Hole Cards, You Are Forced To Throw Away One Of Your Aces, Leaving You With Pocket Aces And Only One Remaining Ace Left In The Deck.',
      },
      {
        q: 'When Exactly Do You Discard Your Third Card In Crazy Pineapple?',
        a: 'In Crazy Pineapple, You Discard One Hole Card After All Flop Betting Action Is Complete And Right Before The Dealer Burns And Deals The Turn Card.',
      },
    ],
  },
];
