/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  9-SEAT POKER POSITION STRATEGY ENCYCLOPEDIA (src/content/learn/positions.js)
 * ═══════════════════════════════════════════════════════════════════════════════
 * Authoritative source of truth for /learn/positions and /learn/positions/[pos].
 * Covers all 9 canonical No-Limit Texas Hold'em table positions with exact
 * 100BB Raise-First-In (RFI) frequencies, 3-bet and cold-call percentages,
 * long-term BB/100 winrate benchmarks, postflop positional advantages,
 * common leaks, top playable starting hands, and FAQs.
 *
 * House style: Title Case, zero em dashes.
 */

export const POSITIONS_AS_OF = '2026-11-10';
export const POSITIONS_BASE_PATH = '/learn/positions';
export const POSITIONS_URL = 'https://smarter.poker/learn/positions';

export const POSITION_SEAT_TYPES = [
  'Early Position',
  'Middle Position',
  'Late Position',
  'Blinds',
];

export function positionPath(slug) {
  return `/learn/positions/${slug}`;
}

const POSITION_SLUG_ALIASES = {
  'under-the-gun': 'utg',
  'utg+1': 'utg-1',
  'utg1': 'utg-1',
  'utg-plus-1': 'utg-1',
  'utg-plus-one': 'utg-1',
  'middle-position': 'mp',
  'lojack': 'lj',
  'lo-jack': 'lj',
  'hijack': 'hj',
  'hi-jack': 'hj',
  'cutoff': 'co',
  'cut-off': 'co',
  'button': 'btn',
  'dealer': 'btn',
  'dealer-button': 'btn',
  'small-blind': 'sb',
  'big-blind': 'bb',
};

export function getPositionBySlug(slug) {
  if (!slug) return null;
  const clean = String(slug).trim().toLowerCase();
  const target = POSITION_SLUG_ALIASES[clean] || clean;
  return (
    POKER_POSITIONS.find(
      (p) => p.slug === target || p.code.toLowerCase() === target
    ) || null
  );
}

export const POKER_POSITIONS = [
  {
    slug: 'utg',
    code: 'UTG',
    name: 'Under The Gun',
    title: 'Under The Gun (UTG) Poker Position Strategy And RFI Ranges',
    h1: 'Under The Gun (UTG) Position Strategy: 9-Max & 6-Max Opening Ranges',
    seatType: 'Early Position',
    rfiPct: '10.5%',
    threeBetPct: '3.2%',
    coldCallPct: '0.0%',
    expectedWinrateBb100: '+9.5 BB/100',
    summary:
      'Under The Gun (UTG) Is The First Seat To Act Preflop To The Left Of The Big Blind. With Eight Players Still Left To Act In 9-Max Cash Games, UTG Requires The Tightest Raise-First-In Range (10.5% Of Hands) Anchored By Premium Pocket Pairs, Suited Broadways, And Wheel Suited Ace Blockers.',
    coreStrategy:
      'Open Raise 2.2x To 2.5x Online Or 3x To 4x In Live Cash Games With A Strictly Linear Value-Heavy Range Plus Select Suited Wheel Aces (A5s And A4s) For Board Coverage And 4-Bet Bluffs. Eliminate All Open-Limping And Avoid Offsuit Broadways Below AQo That Suffer Reverse Implied Odds Out Of Position.',
    postflopAdvantage:
      'Although UTG Frequently Acts Out Of Position Against Late-Position Callers, It Carries The Strongest Uncapped Range Advantage On Ace-High, King-High, And Queen-High Boards, Enabling High-Frequency Small Range Continuation Bets (25% To 33% Pot).',
    commonLeaks: [
      'Opening Offsuit Trouble Hands Like KJo, QJo, And ATo From UTG And Getting Dominated By 3-Bets Or Multiway Callers.',
      'Open-Limping Small Pocket Pairs (22 To 55) In Tough Games Instead Of Mixing Low-Frequency Open Raises Or Pure Folds.',
      'Over-C-Betting Low Connected Wet Boards (7-6-5 Two-Tone) Multiway Out Of Position Against Big Blind And Button Callers.',
    ],
    topPlayableHands: [
      { slug: 'pocket-aces', code: 'AA', name: 'Pocket Aces' },
      { slug: 'pocket-kings', code: 'KK', name: 'Pocket Kings' },
      { slug: 'pocket-queens', code: 'QQ', name: 'Pocket Queens' },
      { slug: 'ace-king-suited', code: 'AKs', name: 'Ace-King Suited' },
      { slug: 'ace-queen-suited', code: 'AQs', name: 'Ace-Queen Suited' },
      { slug: 'ace-five-suited', code: 'A5s', name: 'Ace-Five Suited' },
    ],
    faqs: [
      {
        q: 'What Percentage Of Hands Should I Open From Under The Gun (UTG)?',
        a: 'In A 9-Max Full-Ring Cash Game At 100BB Depth, The Optimal UTG Raise-First-In (RFI) Frequency Is 10.5% (Roughly 140 Combinations Out Of 1,326). In 6-Max Games Where UTG Is Equivalent To The Lojack, The Opening Range Widens To 15.5% To 17.0%.',
      },
      {
        q: 'Should I Open All Pocket Pairs From UTG In Live $1/$3 Cash Games?',
        a: 'Against Passive Live Opponents Who Rarely 3-Bet Light And Pay Off Sets With Top Pair, Opening 22 Through 55 From UTG Is Profitable For Set-Mining Value. Against Aggressive 3-Bettors Online, Low Pocket Pairs Below 66 Are Mixed Or Folded From 9-Max UTG.',
      },
      {
        q: 'How Do I Respond To A 3-Bet After Opening From UTG?',
        a: 'Because Your Initial UTG Range Is Already Narrow And Strong, Defend Primarily With 4-Bet Value Hands (AA, KK, QQ, AKs), 4-Bet Bluffs With Blocker Equity (A5s, A4s), And Tight Suited Connectors Or Pocket Pairs (JJ, TT, AQs, KQs) When Getting Favorable Implied Odds.',
      },
    ],
  },
  {
    slug: 'utg-1',
    code: 'UTG+1',
    name: 'UTG+1 (Early Position Two)',
    title: 'UTG+1 Poker Position Strategy: Early Position Ranges & 3-Bet Defense',
    h1: 'UTG+1 Poker Position Guide: Early Position Opening & 3-Bet Strategy',
    seatType: 'Early Position',
    rfiPct: '12.2%',
    threeBetPct: '4.1%',
    coldCallPct: '0.0%',
    expectedWinrateBb100: '+11.2 BB/100',
    summary:
      'UTG+1 Sits Immediately To The Left Of Under The Gun In 9-Max Full-Ring Games, Acting With Seven Players Remaining Behind. Removing One Early Player Allows UTG+1 To Expand Its Opening Range To 12.2% While Maintaining Strict Discipline Against UTG Opens.',
    coreStrategy:
      'When UTG Folds, Open 12.2% Of Hands By Adding Mid-Tier Suited Connectors (98s, 87s), Additional Suited Aces (A3s, A2s), And Pocket Sixes/Fives at Higher Frequency. When Facing A UTG Open, Play A Pure 3-Bet Or Fold Strategy At 100BB To Avoid Getting Squeezed By Seven Remaining Players.',
    postflopAdvantage:
      'Like UTG, UTG+1 Retains A Substantial Nut Advantage On Broadway-Heavy Textures And Can Leverage Polarized Turn Overbets When Flop Continuation Bets Are Called By Late-Position Defenders.',
    commonLeaks: [
      'Cold-Calling A UTG Open Raise From UTG+1 With Hands Like AQo Or KJs And Getting Squeezed Out Of The Pot By Late Position.',
      'Treating UTG+1 As A Late Position Seat And Opening Offsuit Ace-Rag Or Weak Suited Gappers.',
      'Failing To Fold Overpairs On Four-Flush Or Connected Coordinated Turns In Multiway Early-Position Pots.',
    ],
    topPlayableHands: [
      { slug: 'pocket-aces', code: 'AA', name: 'Pocket Aces' },
      { slug: 'pocket-jacks', code: 'JJ', name: 'Pocket Jacks' },
      { slug: 'ace-king-suited', code: 'AKs', name: 'Ace-King Suited' },
      { slug: 'king-queen-suited', code: 'KQs', name: 'King-Queen Suited' },
      { slug: 'jack-ten-suited', code: 'JTs', name: 'Jack-Ten Suited' },
      { slug: 'ace-four-suited', code: 'A4s', name: 'Ace-Four Suited' },
    ],
    faqs: [
      {
        q: 'Why Should UTG+1 Never Cold-Call A UTG Open Raise In Rake Environments?',
        a: 'When You Cold-Call In UTG+1, Six Players Behind You Still Have The Opportunity To 3-Bet Squeeze, And High Casino Rake Eats Into Flat-Call Equity. Using A Tight 3-Bet Or Fold Strategy Captures Dead Money And Protects Your Range.',
      },
      {
        q: 'Which Hands Are Added To The Opening Range In UTG+1 Compared To UTG?',
        a: 'UTG+1 Adds Full-Frequency Opens With Pocket Fives (55), Suited Connectors Like 87s, Higher Frequency A9s And KTs, And Additional Wheel Suited Aces (A3s And A2s), Increasing RFI From 10.5% To 12.2%.',
      },
      {
        q: 'What Is The Expected Long-Term Winrate From UTG+1?',
        a: 'Winning Regulars Average Approximately +11.2 BB/100 From UTG+1, Roughly 1.7 BB/100 Higher Than UTG Because One Fewer Opponent Remains To Wake Up With A Premium Hand.',
      },
    ],
  },
  {
    slug: 'mp',
    code: 'MP',
    name: 'Middle Position',
    title: 'Middle Position (MP) Poker Strategy: RFI Ranges & Squeeze Defense',
    h1: 'Middle Position (MP) Poker Strategy Guide: Ranges, 3-Bets & Postflop Play',
    seatType: 'Middle Position',
    rfiPct: '14.5%',
    threeBetPct: '5.0%',
    coldCallPct: '1.5%',
    expectedWinrateBb100: '+13.8 BB/100',
    summary:
      'Middle Position (MP) Bridges The Gap Between Tight Early-Position Play And Aggressive Late-Position Stealing. Acting With Six Players Left Behind In 9-Max Play, MP Opens 14.5% Of Starting Hands And Begins Pressuring Early Openers With Polarized And Linear 3-Bets.',
    coreStrategy:
      'Open Raise 14.5% Of Hands When Folded To You, Including All Pocket Pairs Down To 44, All Suited Aces (A2s Through AKs), Suited Broadways, And Suited Connectors Down To 76s. Against Early Position Opens, Prioritize 3-Betting Linearly With QQ+, AK, AQs, And KQs.',
    postflopAdvantage:
      'MP Enjoys Positional Superiority Over The Blinds And Early Position While Retaining Strong Broadway And Mid-Pair Board Coverage, Allowing Balanced Check-Range And Bet-Range Splits.',
    commonLeaks: [
      'Calling 3-Bets Out Of Position Against Hijack, Cutoff, Or Button Aggressors With Dominated Offsuit Broadways Like AJo Or KQo.',
      'Opening Too Many Offsuit Hands (ATo, KJo) When Aggressive 3-Bettors Sit On The Button And Blinds.',
      'Auto-C-Betting 100% Of Flops Multiway When Both The Button And Big Blind Call Your MP Open.',
    ],
    topPlayableHands: [
      { slug: 'pocket-queens', code: 'QQ', name: 'Pocket Queens' },
      { slug: 'pocket-tens', code: 'TT', name: 'Pocket Tens' },
      { slug: 'ace-queen-suited', code: 'AQs', name: 'Ace-Queen Suited' },
      { slug: 'ace-jack-suited', code: 'AJs', name: 'Ace-Jack Suited' },
      { slug: 'queen-jack-suited', code: 'QJs', name: 'Queen-Jack Suited' },
      { slug: 'ten-nine-suited', code: 'T9s', name: 'Ten-Nine Suited' },
    ],
    faqs: [
      {
        q: 'How Wide Is A GTO Middle Position (MP) Opening Range?',
        a: 'A Standard 100BB Middle Position Raise-First-In Range Covers 14.5% Of All Starting Hands, Encompassing 55+, A2s+, K9s+, Q9s+, J9s+, T8s+, 98s, 87s, 76s, And Offsuit Broadways AJo+ And KQo.',
      },
      {
        q: 'How Should Middle Position Adjust When Late Position Players Are Passive?',
        a: 'If The Cutoff And Button Rarely 3-Bet And Frequently Cold-Call, Expand Your MP Opening Range To Include All Small Pocket Pairs (22 And 33) And Additional Suited Connectors To Realize Postflop Implied Odds.',
      },
      {
        q: 'What Is The Optimal 3-Bet Sizing From Middle Position Against An Early Open?',
        a: 'Because You Are In Position Relative To UTG Or UTG+1, A 3.0x To 3.2x 3-Bet Size (For Example, Raising A 2.5BB Open To 7.5BB Or 8BB) Applies Maximum Leverage Without Over-Committing Your Bluffing Combinations.',
      },
    ],
  },
  {
    slug: 'lj',
    code: 'LJ',
    name: 'Lojack (6-Max UTG)',
    title: 'Lojack (LJ) Poker Position Strategy: 6-Max First-In Ranges & Playbook',
    h1: 'Lojack (LJ) Position Strategy: 6-Max UTG & 9-Max Middle Seat Guide',
    seatType: 'Middle Position',
    rfiPct: '17.5%',
    threeBetPct: '5.8%',
    coldCallPct: '2.0%',
    expectedWinrateBb100: '+16.4 BB/100',
    summary:
      'The Lojack (LJ) Is The First Seat To Act In 6-Max Cash Games (Often Called 6-Max UTG) And The Fourth Seat In 9-Max Full Ring. With Only Five Players Left To Act, The Lojack Opens 17.5% Of Hands And Sets The Baseline For Modern Short-Handed GTO Strategy.',
    coreStrategy:
      'Open 2.2x To 2.5x With 17.5% Of Hands: All Pocket Pairs (22 Through AA), All Suited Aces (A2s+), Suited Kings Down To K8s, Suited Queens Down To Q9s, Suited Connectors Down To 65s, And Offsuit Broadways ATo+ And KQo. Defend Carefully Against Hijack, Cutoff, And Button 3-Bets.',
    postflopAdvantage:
      'The Lojack Commands Strong Top-Of-Range Equity Against Big Blind Defenders On High-Card Flops While Maintaining Better Mid-Board Coverage (6-5-4 And 8-7-6) Than Early Full-Ring Seats.',
    commonLeaks: [
      'Using 9-Max UTG Ranges (10.5%) In A 6-Max Lojack Seat And Leaving +EV Steal Equity Unclaimed.',
      'Defending Too Wide Out Of Position Against Polarized Button 3-Bets With Hands Like KJo Or ATo.',
      'Failing To Protect Your Checking Range On Ace-High And King-High Boards Against In-Position Floaters.',
    ],
    topPlayableHands: [
      { slug: 'pocket-kings', code: 'KK', name: 'Pocket Kings' },
      { slug: 'pocket-nines', code: '99', name: 'Pocket Nines' },
      { slug: 'ace-ten-suited', code: 'ATs', name: 'Ace-Ten Suited' },
      { slug: 'king-jack-suited', code: 'KJs', name: 'King-Jack Suited' },
      { slug: 'jack-ten-suited', code: 'JTs', name: 'Jack-Ten Suited' },
      { slug: 'eight-seven-suited', code: '87s', name: 'Eight-Seven Suited' },
    ],
    faqs: [
      {
        q: 'Is The Lojack The Same Position As UTG In 6-Max Poker?',
        a: 'Yes. In A 6-Max Game, The First Seat To Act Preflop Sits Five Seats Off The Button, Which Mathematically Matches The Lojack Seat In A 9-Max Game. Its 100BB GTO Opening Frequency Is 17.5%.',
      },
      {
        q: 'Should I Open All Pocket Pairs (22-AA) From The Lojack?',
        a: 'At 100BB Depth With Standard Rake, Solvers Open 66+ At 100% Frequency And Mix 22 Through 55 At 50% To 75% Frequency. In Live Or Soft Online Pools, Opening All Pocket Pairs 22+ At 100% Frequency Is Standard.',
      },
      {
        q: 'How Does The Lojack Play Against A Big Blind Cold-Call?',
        a: 'When The Big Blind Calls Your Lojack Open Heads-Up, You Hold A Significant Range Advantage On All A-High, K-High, And Q-High Boards, Allowing High-Frequency 33% Pot Continuation Bets.',
      },
    ],
  },
  {
    slug: 'hj',
    code: 'HJ',
    name: 'Hijack',
    title: 'Hijack (HJ) Poker Position Strategy: Stealing, 3-Betting & Ranges',
    h1: 'Hijack (HJ) Poker Position Strategy: Opening Ranges & Isolation Playbook',
    seatType: 'Middle Position',
    rfiPct: '21.5%',
    threeBetPct: '7.2%',
    coldCallPct: '3.0%',
    expectedWinrateBb100: '+20.5 BB/100',
    summary:
      'The Hijack (HJ) Sits Two Seats To The Right Of The Dealer Button With Only Four Players Remaining (Cutoff, Button, Small Blind, And Big Blind). Opening 21.5% Of Starting Hands, The Hijack Marks The Transition Into Aggressive Blind-Stealing And Isolation Play.',
    coreStrategy:
      'Open Raise 21.5% Of Hands When Folded To You, Expanding Into Suited Kings (K6s+), Suited Queens (Q8s+), Suited Gappers (T8s, 97s, 86s), And Offsuit Broadways (KJo, QJo, ATo). Actively 3-Bet Isolate Lojack And Middle Position Opens With A Linear-Plus-Suited-Blocker Range.',
    postflopAdvantage:
      'The Hijack Acts In Position Against The Blinds And Early Openers In 80%+ Of Postflop Spots, Allowing Aggressive Turn Barreling And Delayed Continuation Betting When Checked To.',
    commonLeaks: [
      'Failing To 3-Bet Isolate Loose Middle-Position Openers And Allowing The Cutoff Or Button To Squeeze.',
      'Calling 3-Bets From The Cutoff Or Button Out Of Position With Easily Dominated Offsuit Hands.',
      'Giving Up Too Quickly On Turn Cards After Flop Check-Backs Against Big Blind Defenders.',
    ],
    topPlayableHands: [
      { slug: 'pocket-jacks', code: 'JJ', name: 'Pocket Jacks' },
      { slug: 'pocket-eights', code: '88', name: 'Pocket Eights' },
      { slug: 'ace-queen-offsuit', code: 'AQo', name: 'Ace-Queen Offsuit' },
      { slug: 'king-queen-suited', code: 'KQs', name: 'King-Queen Suited' },
      { slug: 'queen-jack-suited', code: 'QJs', name: 'Queen-Jack Suited' },
      { slug: 'ten-nine-suited', code: 'T9s', name: 'Ten-Nine Suited' },
    ],
    faqs: [
      {
        q: 'Why Is The Position Called The Hijack (HJ) In Poker?',
        a: 'The Hijack Earned Its Name Because Players In This Seat "Hijack" The Late-Position Blind-Stealing Opportunity Before The Cutoff And Dealer Button Have A Chance To Open The Pot.',
      },
      {
        q: 'What Percentage Of Hands Does A GTO Solver Open From The Hijack?',
        a: 'At 100BB Stack Depth, A GTO Hijack Range Opens 21.5% Of All Starting Hands (Roughly 285 Combinations), Including All Pocket Pairs, All Suited Aces, K6s+, Q8s+, J8s+, Suited Connectors Down To 54s, And ATo+/KJo+.',
      },
      {
        q: 'How Should The Hijack React Facing A Button 3-Bet?',
        a: 'Because You Will Play The Entire Postflop Hand Out Of Position Against The Button, Fold Offsuit Broadways Below AKo, 4-Bet Your Polarized Top Value And Suited Wheel Aces, And Flat-Call Primarily With Suited Broadways And Pocket Pairs.',
      },
    ],
  },
  {
    slug: 'co',
    code: 'CO',
    name: 'Cutoff',
    title: 'Cutoff (CO) Poker Position Strategy: Late Position Steals & 3-Bets',
    h1: 'Cutoff (CO) Poker Position Strategy: 28% RFI Ranges & Postflop Mastery',
    seatType: 'Late Position',
    rfiPct: '28.0%',
    threeBetPct: '9.4%',
    coldCallPct: '4.2%',
    expectedWinrateBb100: '+27.8 BB/100',
    summary:
      'The Cutoff (CO) Sits Directly To The Right Of The Dealer Button And Is The Second-Most Profitable Seat At The Poker Table (+27.8 BB/100). With Only The Button And Two Blinds Left To Act, The Cutoff Opens 28.0% Of Hands And Buying The Button Via 3-Bets Is A Core Weapon.',
    coreStrategy:
      'Open Raise 28.0% Of Hands When Folded To You, Adding All Suited Kings (K2s+), Suited Queens (Q5s+), Suited Jacks (J7s+), Offsuit Aces (A8o+), And Suited Gappers. When An Early Or Hijack Player Opens, Frequently 3-Bet To Force The Button To Fold And "Buy The Button" For Postflop Play.',
    postflopAdvantage:
      'Whenever The Button Folds, The Cutoff Becomes The Effective Dealer For The Rest Of The Hand, Acting Last On Flop, Turn, And River Against Both Blinds.',
    commonLeaks: [
      'Opening Too Tightly From The Cutoff And Failing To Steal The Blinds When The Button Player Is Passive.',
      'Cold-Calling Too Frequently In The Cutoff Instead Of 3-Betting To Force The Button Out Of The Hand.',
      'Over-Folding To Button 3-Bets When The Button Is Exploiting Late-Position Dynamics With A 12%+ 3-Bet Frequency.',
    ],
    topPlayableHands: [
      { slug: 'pocket-queens', code: 'QQ', name: 'Pocket Queens' },
      { slug: 'pocket-sevens', code: '77', name: 'Pocket Sevens' },
      { slug: 'ace-king-offsuit', code: 'AKo', name: 'Ace-King Offsuit' },
      { slug: 'ace-nine-suited', code: 'A9s', name: 'Ace-Nine Suited' },
      { slug: 'king-jack-suited', code: 'KJs', name: 'King-Jack Suited' },
      { slug: 'eight-seven-suited', code: '87s', name: 'Eight-Seven Suited' },
    ],
    faqs: [
      {
        q: 'What Does "Buying The Button" Mean From The Cutoff?',
        a: 'When An Early Or Middle Position Player Opens And You 3-Bet From The Cutoff, You Force The Actual Dealer Button To Fold All Except Their Top 3% Of Hands. That Guarantees You Act Last On Every Postflop Street.',
      },
      {
        q: 'What Is The Cutoff Raise-First-In (RFI) Percentage At 100BB?',
        a: 'The Standard 100BB Cutoff RFI Frequency Is 28.0% (Roughly 370 Hand Combinations), Including 22+, A2s+, K2s+, Q5s+, J7s+, T7s+, Suited Connectors Down To 43s, A8o+, KTo+, QTo+, And JTo.',
      },
      {
        q: 'How Do I Defend My Cutoff Open Against An Aggressive Button 3-Bettor?',
        a: 'Because Cutoff Vs Button Ranges Are Both Wide, Defend Around 45% To 50% Of Your Opening Range By 4-Betting 11% To 13% (QQ+, AK, AQs, Plus Suited Blocker Bluffs Like A5s, A4s, K9s) And Flatting Suited Broadways And Pocket Pairs.',
      },
    ],
  },
  {
    slug: 'btn',
    code: 'BTN',
    name: 'Button (Dealer)',
    title: 'Button (BTN) Poker Position Strategy: 45% Steal Ranges & Max Winrate',
    h1: 'Button (BTN) Poker Position Strategy: The Most Profitable Seat In Poker',
    seatType: 'Late Position',
    rfiPct: '44.5%',
    threeBetPct: '11.8%',
    coldCallPct: '7.5%',
    expectedWinrateBb100: '+38.5 BB/100',
    summary:
      'The Dealer Button (BTN) Is Undisputedly The Most Profitable Position In No-Limit Hold\'em, Generating +38.5 BB/100 For Winning Players. Guaranteed To Act Last On The Flop, Turn, And River, The Button Opens 44.5% Of Starting Hands And Applies Relentless 3-Bet And Postflop Float Pressure.',
    coreStrategy:
      'Open Raise 2.0x To 2.5x With 44.5% Of Hands When Folded To You, Attacking The Small And Big Blinds With All Pocket Pairs, All Suited Aces, All Suited Kings, Suited Queens (Q2s+), Suited Jacks (J4s+), Offsuit Aces (A2o+), And Wide Suited Connectors. 3-Bet Cutoff And Hijack Opens At 11.8% Frequency.',
    postflopAdvantage:
      'Acting Last On Every Postflop Street Gives The Button Maximum Information, Superior Equity Realization (Often 110%+ Of Raw Equity), Effective Float Opportunities, And Complete Control Over Pot Size.',
    commonLeaks: [
      'Opening Too Large (3.5x+) On The Button In Tournament Or Online Play, Which Risks Too Much To Steal The Blinds And Prevents Opening A Full 45% Range.',
      'Playing Passively On The Button By Passing Up +EV Steals When Tight Blinds Over-Fold.',
      'Auto-Betting Three Streets With Medium-Strength Showdown Hands Instead Of Checking Back Turns For Pot Control.',
    ],
    topPlayableHands: [
      { slug: 'pocket-aces', code: 'AA', name: 'Pocket Aces' },
      { slug: 'ace-king-suited', code: 'AKs', name: 'Ace-King Suited' },
      { slug: 'ace-five-suited', code: 'A5s', name: 'Ace-Five Suited' },
      { slug: 'queen-jack-suited', code: 'QJs', name: 'Queen-Jack Suited' },
      { slug: 'jack-ten-suited', code: 'JTs', name: 'Jack-Ten Suited' },
      { slug: 'pocket-deuces', code: '22', name: 'Pocket Deuces' },
    ],
    faqs: [
      {
        q: 'Why Is The Dealer Button The Most Profitable Position In Poker?',
        a: 'The Button Acts Last On The Flop, Turn, And River In Every Single Hand. Seeing Every Opponent Check Or Bet Before You Decide Allows You To Bluff More Effectively, Value Bet Thinner, Lose Less When Behind, And Realize Over 100% Of Your Raw Hand Equity.',
      },
      {
        q: 'How Many Hands Should I Open On The Button When Folded To Me?',
        a: 'In 100BB Cash Games, The Optimal Button Raise-First-In Range Is 44.5% To 48.0% Of Hands (Nearly Half The Deck), Using A 2.2x To 2.5x Open Size To Force The Blinds To Defend Out Of Position.',
      },
      {
        q: 'When Should The Button Cold-Call Instead Of 3-Betting?',
        a: 'Because Nobody Left Behind Is Positioned In Front Of You Postflop, The Button Can Profitably Cold-Call Speculative Pocket Pairs (22-88) And Suited Connectors (98s-65s) Alongside Its 11.8% 3-Bet Range, Especially When Deep-Stacked Or When The Blinds Rarely Squeeze.',
      },
    ],
  },
  {
    slug: 'sb',
    code: 'SB',
    name: 'Small Blind',
    title: 'Small Blind (SB) Poker Strategy: 3-Bet Or Fold Playbook & BvB Ranges',
    h1: 'Small Blind (SB) Poker Position Strategy: 3-Bet Or Fold & Blind Vs Blind',
    seatType: 'Blinds',
    rfiPct: '41.0%',
    threeBetPct: '13.5%',
    coldCallPct: '0.8%',
    expectedWinrateBb100: '-14.5 BB/100',
    summary:
      'The Small Blind (SB) Posts 0.5 Big Blinds Before The Cards Are Dealt And Must Act First On Every Postflop Street. Because Playing Out Of Position Without The Initiative Is Expensive, Modern GTO Strategy Uses A Strict "3-Bet Or Fold" Approach From The Small Blind Against Open Raises.',
    coreStrategy:
      'Against Any Open Raise From UTG Through The Button, Eliminate Flat-Calling Almost Entirely In Raked Cash Games And Play A Linear 13.5% 3-Bet Range Sized At 3.5x To 4.0x The Open. When Folded To You In Blind-Vs-Blind (BvB), Raise 3.0x Or Mix Limps And Raises Across 41.0% Of Hands.',
    postflopAdvantage:
      'While The Small Blind Suffers A Positional Disadvantage Postflop, Its 3-Bet Range Is Highly Concentrated With Broadway Cards And Overpairs, Allowing Aggressive Flop C-Betting And Turn Barreling In 3-Bet Pots.',
    commonLeaks: [
      'Flat-Calling Open Raises From The Small Blind And Playing Multiway Pots Out Of Position After The Big Blind Squeezes Or Calls.',
      'Using Small 3x 3-Bet Sizings Out Of Position Instead Of Sizing Up To 3.5x To 4.0x To Deny In-Position Equity.',
      'Open-Limping Weak Uncoordinated Hands In Blind-Vs-Blind And Check-Folding To Every Big Blind Isolation Raise.',
    ],
    topPlayableHands: [
      { slug: 'pocket-kings', code: 'KK', name: 'Pocket Kings' },
      { slug: 'pocket-tens', code: 'TT', name: 'Pocket Tens' },
      { slug: 'ace-king-suited', code: 'AKs', name: 'Ace-King Suited' },
      { slug: 'ace-queen-suited', code: 'AQs', name: 'Ace-Queen Suited' },
      { slug: 'ace-five-suited', code: 'A5s', name: 'Ace-Five Suited' },
      { slug: 'king-queen-suited', code: 'KQs', name: 'King-Queen Suited' },
    ],
    faqs: [
      {
        q: 'Why Do Solvers Recommend "3-Bet Or Fold" From The Small Blind?',
        a: 'When You Flat-Call In The Small Blind, You Guarantee You Will Act First On Every Postflop Street, Give The Big Blind Great Pot Odds To Squeeze Or Overcall, And Pay Full Casino Rake Whenever A Flop Is Dealt. 3-Betting Wins The Pot Immediately Preflop Without Rake Or Gives You The Initiative.',
      },
      {
        q: 'What Is A Good Winrate From The Small Blind In Cash Games?',
        a: 'Because You Forced-Post -50 BB/100 Before Seeing Your Cards, Every Player Loses Money Overall From The Small Blind. Losing Only -12 To -16 BB/100 From The Small Blind (Recovering 34+ BB/100 Of The Forced Blind) Marks Elite Small Blind Play.',
      },
      {
        q: 'What Sizing Should I Use When Opening From The Small Blind Into The Big Blind?',
        a: 'When Action Folds To You In The Small Blind, Use A Larger 3.0x Open Raise Size (3BB Total) Rather Than 2.2x To Reduce The Big Blind\'s Pot Odds And Compensate For Being Out Of Position Postflop.',
      },
    ],
  },
  {
    slug: 'bb',
    code: 'BB',
    name: 'Big Blind',
    title: 'Big Blind (BB) Poker Defense Strategy: MDF, Pot Odds & 3-Bet Ranges',
    h1: 'Big Blind (BB) Poker Position Strategy: Defense Ranges, Pot Odds & Check-Raising',
    seatType: 'Blinds',
    rfiPct: 'N/A (Closes Action)',
    threeBetPct: '11.2%',
    coldCallPct: '32.5%',
    expectedWinrateBb100: '-28.0 BB/100',
    summary:
      'The Big Blind (BB) Posts 1.0 Full Big Blind Preflop (-100 BB/100 Baseline) And Closes The Preflop Action Against Single Raises. Armed With Direct Pot Odds Discounts, The Big Blind Defends 35% To 58% Of Hands Depending On Open Position And Sizing, Utilizing Check-Raises Postflop To Realize Equity.',
    coreStrategy:
      'Leverage Your 1BB Discount And Closing Preflop Action To Defend Wide Against Small 2.0x To 2.5x Opens (Up To 55% Total Defense Against A Button 2.2x Open, Split Between 12% Polarized 3-Bets And 43% Calls). Tighten Dramatically Against 3x To 5x Live Opens And Multiway Pots.',
    postflopAdvantage:
      'On Low Connected, Paired, And Two-Tone Boards (Such As 8-6-5, 7-4-4, And 9-7-6), The Big Blind Holds The Nut Advantage (More Straight And Two-Pair Combinations Than An Early Opener), Fueling High-Frequency Flop Check-Raises And Turn Leads.',
    commonLeaks: [
      'Over-Defending The Big Blind Against Large 4x To 5x Live Open Raises Using Online 2.2x Defense Charts.',
      'Playing Purely Fit-Or-Fold Postflop Without Check-Raising Low Boards Or Floating With Backdoor Equity.',
      '3-Betting Linearly With Medium Suited Hands (Like QJs Or T9s) That Realize Equity Far Better As Calls.',
    ],
    topPlayableHands: [
      { slug: 'pocket-aces', code: 'AA', name: 'Pocket Aces' },
      { slug: 'ace-king-offsuit', code: 'AKo', name: 'Ace-King Offsuit' },
      { slug: 'jack-ten-suited', code: 'JTs', name: 'Jack-Ten Suited' },
      { slug: 'ten-nine-suited', code: 'T9s', name: 'Ten-Nine Suited' },
      { slug: 'eight-seven-suited', code: '87s', name: 'Eight-Seven Suited' },
      { slug: 'ace-three-suited', code: 'A3s', name: 'Ace-Three Suited' },
    ],
    faqs: [
      {
        q: 'Why Is A -28 BB/100 Winrate In The Big Blind Considered Strong?',
        a: 'Folding Every Single Hand In The Big Blind Guarantees A -100 BB/100 Loss Rate. A Player Who Finishes At -28 BB/100 In The Big Blind Is Winning Back +72 BB/100 Compared To Folding, Which Directly Powers Overall Table Profitability.',
      },
      {
        q: 'How Does Open Raise Sizing Change My Big Blind Defense Frequency?',
        a: 'Against A 2.0x Min-Raise From The Button, You Need Only 28% Equity Realization And Defend ~60% Of Hands. Against A 3.0x Open You Defend ~38%, And Against A Live 5.0x Open You Defend Only ~20% To 24% Of Hands.',
      },
      {
        q: 'Why Should My Big Blind 3-Bet Range Be Polarized Against The Button?',
        a: 'Because You Close The Preflop Action And Get Direct Pot Odds, Medium-Strength Hands Like KQs, QJs, JTs, And 88 Play Profitably As Calls. Your Big Blind 3-Bet Range Combines Top Value (JJ+, AK, AQs) With High-Equity Bluffs (A5s-A2s, K9s, Q9s, Suited Connectors, And Offsuit Ace Blockers).',
      },
    ],
  },
];
