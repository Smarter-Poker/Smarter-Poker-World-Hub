/**
 * PROGRAMMATIC HAND-VS-HAND POKER ODDS & EQUITY REGISTRY
 * ======================================================
 * Authoritative verified equity dataset powering the 30 static programmatic
 * /tools/odds/[matchup] pages and /sitemap-tools.xml.
 *
 * Math verified via Smarter.Poker PokerOddsEngine and exact combinatoric tables:
 *   winA + winB + tie = 100.00%
 *   equityA = winA + tie / 2
 *   equityB = winB + tie / 2
 *
 * House style: Title Case, zero em dashes, zero en dashes.
 */

export const TOOL_MATCHUPS_AS_OF = '2026-11-27';
export const TOOL_MATCHUPS_BASE_PATH = '/tools/odds';

export function toolMatchupPath(slug) {
  return `${TOOL_MATCHUPS_BASE_PATH}/${slug}`;
}

export function buildOddsCalculatorHref({ game = 'nlhe', handACards = '', handBCards = '' }) {
  const params = new URLSearchParams({ game });
  if (handACards) params.set('h0', handACards);
  if (handBCards) params.set('h1', handBCards);
  return `/tools/poker-odds-calculator?${params.toString()}`;
}

const RAW_MATCHUPS = [
  {
    slug: 'aa-vs-kk',
    game: 'nlhe',
    gameLabel: "No-Limit Hold'em",
    category: 'Overpair Vs Underpair',
    handA: 'AA',
    handAName: 'Pocket Aces',
    handACards: 'As,Ah',
    handB: 'KK',
    handBName: 'Pocket Kings',
    handBCards: 'Ks,Kh',
    winA: 81.95,
    winB: 17.59,
    tie: 0.46,
    equityA: 82.18,
    equityB: 17.82,
    title: 'AA Vs KK Poker Odds And Equity',
    h1: 'AA Vs KK Poker Odds And Preflop Equity',
    description:
      'Exact AA Vs KK Preflop Odds: Pocket Aces Holds 82.18% Equity (81.95% Win, 0.46% Tie) Over Pocket Kings (17.82%), With Flop Hit Rates And 4-Bet Strategy.',
    flopHitNotes: [
      'Pocket Kings Flops Top Set On 11.76% Of Boards, Instantly Flipping AA To 8.4% Equity.',
      'When Both Hands Miss A Set, Pocket Aces Holds 91.5% Equity Heading Into The Turn And River.',
      'A Four-Card Straight Or Flush Board Creates The 0.46% Chop Frequency Across 1,712,304 Runouts.',
    ],
    strategicTakeaways: [
      'Never Fold Pocket Kings Preflop At 100BB Effective Depth Against Any Balanced 4-Bet Or 5-Bet Range.',
      'Pocket Aces Should Always Continue For Value Preflop, Mixing Occasional Traps Only Against Hyper-Aggressive 3-Bettors.',
      'On King-High Flops In 4-Bet Pots, Pocket Aces Transitions Into A Pot-Control Check-Call Line Rather Than Stacking Off Blindly.',
    ],
    relatedSlugs: ['aa-vs-qq', 'kk-vs-qq', 'aa-vs-aks', 'kk-vs-aks'],
    faqs: [
      {
        question: 'What Are The Exact Odds Of AA Vs KK Preflop?',
        answer:
          'Pocket Aces Wins 81.95% Of All 1,712,304 Possible Five-Card Runouts, Pocket Kings Wins 17.59%, And 0.46% Result In A Split Pot, Giving AA 82.18% Total Equity Against 17.82% For KK.',
      },
      {
        question: 'How Often Does Pocket Kings Crack Pocket Aces?',
        answer:
          'Pocket Kings Wins Outright 17.59% Of The Time, Roughly 1 In Every 5.7 All-In Preflop Showdowns, Primarily By Turning Or Flopping A Set Of Kings Or Making A Four-Card Flush.',
      },
      {
        question: 'Can I Simulate AA Vs KK With Specific Suits Or Dead Cards?',
        answer:
          'Yes. Click Launch In Odds Calculator To Preload AA Vs KK In The Free Smarter.Poker Multi-Variant Poker Odds Calculator And Add Board Texture Or Dead Cards.',
      },
    ],
  },
  {
    slug: 'aa-vs-aks',
    game: 'nlhe',
    gameLabel: "No-Limit Hold'em",
    category: 'Dominated Matchup',
    handA: 'AA',
    handAName: 'Pocket Aces',
    handACards: 'As,Ah',
    handB: 'AKs',
    handBName: 'Ace-King Suited',
    handBCards: 'Ad,Kd',
    winA: 87.23,
    winB: 12.14,
    tie: 0.63,
    equityA: 87.55,
    equityB: 12.45,
    title: 'AA Vs AKs Poker Odds And Equity',
    h1: 'AA Vs AKs Poker Odds And Preflop Equity',
    description:
      'Exact AA Vs AKs Preflop Odds: Pocket Aces Dominates Ace-King Suited With 87.55% Equity (87.23% Win, 0.63% Tie) Against 12.45%, Plus Flop Equity Notes.',
    flopHitNotes: [
      'Because AA Holds Two Aces, AKs Has Only One Remaining Ace Out And Must Rely On Flushes, Broadways, Or Running Kings.',
      'Suited Ace-King Picks Up Roughly 4.4% Additional Equity Over AKo Thanks To Backdoor And Flopped Flush Potential.',
      'When AKs Shares One Suit With Pocket Aces, AKs Equity Drops From 12.45% Down To Approximately 11.4%.',
    ],
    strategicTakeaways: [
      'AKs Acts As A Premium Preflop Blocker Because Holding An Ace Cuts Pocket Aces Combinations In Half From 6 Down To 3.',
      'At 100BB Cash Depth, AKs Remains A Profitable 4-Bet Or 5-Bet All-In Hand Because Villain Ranges Include QQ, JJ, And Bluffs.',
      'On King-High Flops, Pocket Aces Still Holds Over 76% Equity Against Top Pair AKs Because AKs Is Drawing To Only Two Kings Or Running Straight Cards.',
    ],
    relatedSlugs: ['aa-vs-kk', 'kk-vs-aks', 'qq-vs-aks', 'aks-vs-aqo'],
    faqs: [
      {
        question: 'How Much Equity Does AKs Have Against Pocket Aces?',
        answer:
          'Ace-King Suited Holds 12.45% Preflop Equity Against Pocket Aces, Winning 12.14% Outright And Splitting 0.63% Of Runouts Across Suit-Averaged Configurations.',
      },
      {
        question: 'Why Does AKs Still 4-Bet Preflop If It Loses Badly To AA?',
        answer:
          'Holding An Ace Blocks 50% Of Possible AA Combos And Holding A King Blocks 50% Of KK Combos, Making AKs Mathematically Profitable Against Full 3-Bet And 4-Bet Ranges.',
      },
      {
        question: 'How Does Suit Overlap Change AA Vs AKs Odds?',
        answer:
          'When Pocket Aces Blocks The Flush Suit Of AKs, AKs Loses About 1% To 1.5% Equity Compared To Holding Two Live Flush Suits.',
      },
    ],
  },
  {
    slug: 'aa-vs-qq',
    game: 'nlhe',
    gameLabel: "No-Limit Hold'em",
    category: 'Overpair Vs Underpair',
    handA: 'AA',
    handAName: 'Pocket Aces',
    handACards: 'As,Ah',
    handB: 'QQ',
    handBName: 'Pocket Queens',
    handBCards: 'Qd,Qc',
    winA: 80.52,
    winB: 19.16,
    tie: 0.32,
    equityA: 80.68,
    equityB: 19.32,
    title: 'AA Vs QQ Poker Odds And Equity',
    h1: 'AA Vs QQ Poker Odds And Preflop Equity',
    description:
      'Exact AA Vs QQ Preflop Odds: Pocket Aces Leads Pocket Queens With 80.68% Equity (80.52% Win, 0.32% Tie) Against 19.32%, With Flop And 4-Bet Strategy.',
    flopHitNotes: [
      'Pocket Queens Holds Roughly 1.5% More Equity Against AA Than KK Does Because Queens Can Complete Four-Card Straights Like K-J-T-9 Without Helping Aces.',
      'QQ Flops A Set 11.76% Of The Time And Wins Over 91% Of Those Flops Against Unimproved Aces.',
      'A Queen-Free High Board Keeps AA Ahead At Roughly 90.5% Equity Going To The Turn.',
    ],
    strategicTakeaways: [
      'In Deep 150BB+ Cash Games, Pocket Queens Frequently Flat-Calls Early Position 4-Bets In Position Rather Than 5-Bet Jamming Into AA And KK.',
      'At 30BB To 50BB Tournament Stacks, QQ Is A Standard Preflop Stack-Off Against Wide Button And Cutoff 3-Bets.',
      'Pocket Aces Should Size Bets Smaller On Dry Low Boards To Keep QQ Calling Three Streets.',
    ],
    relatedSlugs: ['aa-vs-kk', 'kk-vs-qq', 'qq-vs-aks', 'ako-vs-qq'],
    faqs: [
      {
        question: 'Why Does QQ Have Slightly Higher Equity Against AA Than KK Does?',
        answer:
          'Pocket Queens Can Make Standalone Straights On K-J-T-9 And J-T-9-8 Boards That Do Not Give Pocket Aces A Better Straight, Lifting QQ To 19.32% Equity Vs 17.82% For KK.',
      },
      {
        question: 'What Is The Exact Win Rate Of AA Vs QQ?',
        answer:
          'Pocket Aces Wins 80.52% Of Runouts, Pocket Queens Wins 19.16%, And Both Hands Tie 0.32% Of The Time.',
      },
      {
        question: 'Should You Fold Pocket Queens To A 4-Bet At 100BB?',
        answer:
          'Usually No. Against Most Positional 4-Bets At 100BB, Calling In Position Preserves QQ Equity Against Bluffs And AK While Controlling Pot Size Against AA And KK.',
      },
    ],
  },
  {
    slug: 'aa-vs-jts',
    game: 'nlhe',
    gameLabel: "No-Limit Hold'em",
    category: 'Suited Connector Vs Big Hand',
    handA: 'AA',
    handAName: 'Pocket Aces',
    handACards: 'As,Ah',
    handB: 'JTs',
    handBName: 'Jack-Ten Suited',
    handBCards: 'Jd,10d',
    winA: 79.16,
    winB: 20.44,
    tie: 0.4,
    equityA: 79.36,
    equityB: 20.64,
    title: 'AA Vs JTs Poker Odds And Equity',
    h1: 'AA Vs JTs Poker Odds And Preflop Equity',
    description:
      'Exact AA Vs JTs Preflop Odds: Pocket Aces Leads Jack-Ten Suited 79.36% To 20.64%, Making JTs One Of The Strongest Non-Pair Hands Against Pocket Aces.',
    flopHitNotes: [
      'Jack-Ten Suited Is The Best Non-Pair Hand Against Pocket Aces Because It Has Zero Overlap With Aces And Maximum Straight Plus Flush Connectivity.',
      'On Coordinated 9-8-X Or Q-9-X Two-Tone Flops, JTs Frequently Surges Above 45% To 55% Equity Against An Overpair.',
      'JTs Flops Two Pair Or Better Roughly 5.6% Of The Time And A Flush Or Open-Ended Straight Draw Over 20% Of The Time.',
    ],
    strategicTakeaways: [
      'JTs Plays Exceptionally Well In Position In Deep-Stacked 3-Bet Pots Because Its Implied Odds Spike When Cracking Single-Pair Overpairs.',
      'Pocket Aces Should Use Protective Medium-To-Large Flop C-Bets On Wet Middle-Card Boards To Deny Equity From Combo Draws.',
      'When JTs Shares A Suit With One Of The Aces, Its Preflop Equity Drops Roughly 2% Due To Flush-Card Removal.',
    ],
    relatedSlugs: ['aa-vs-72o', 'aks-vs-jts', 'aa-vs-qq', 'aakk-vs-jt98-plo4'],
    faqs: [
      {
        question: 'Is JTs Really The Best Hand Against Pocket Aces Besides Pocket Pairs?',
        answer:
          'Yes. Across Unblocked Suits, Suited Connectors Like 65s, 76s, 87s, And JTs Hold Roughly 20.6% To 22.9% Equity Against AA Because They Make Independent Straights And Flushes.',
      },
      {
        question: 'What Are The Exact AA Vs JTs Win And Tie Percentages?',
        answer:
          'Pocket Aces Wins 79.16% Of All Boards, Jack-Ten Suited Wins 20.44%, And The Hands Split 0.40% Of The Time.',
      },
      {
        question: 'How Should Pocket Aces Play Against JTs On A 9-8-2 Two-Tone Flop?',
        answer:
          'Bet Around 66% To 75% Pot To Charge Straight And Flush Draws While Building The Pot Before Scare Turn Cards Arrive.',
      },
    ],
  },
  {
    slug: 'kk-vs-qq',
    game: 'nlhe',
    gameLabel: "No-Limit Hold'em",
    category: 'Overpair Vs Underpair',
    handA: 'KK',
    handAName: 'Pocket Kings',
    handACards: 'Ks,Kh',
    handB: 'QQ',
    handBName: 'Pocket Queens',
    handBCards: 'Qd,Qc',
    winA: 81.48,
    winB: 18.04,
    tie: 0.48,
    equityA: 81.72,
    equityB: 18.28,
    title: 'KK Vs QQ Poker Odds And Equity',
    h1: 'KK Vs QQ Poker Odds And Preflop Equity',
    description:
      'Exact KK Vs QQ Preflop Odds: Pocket Kings Dominates Pocket Queens With 81.72% Equity (81.48% Win, 0.48% Tie) Against 18.28%, Plus Postflop Notes.',
    flopHitNotes: [
      'On Ace-High Flops, Both Hands Drop To Bluff-Catcher Status, Though KK Still Leads QQ By Over 85% Equity.',
      'Pocket Queens Needs A Queen On The Flop (11.76%), Turn, Or River, Or A Running Four-Card Flush To Overtake Kings.',
      'When A King Hits The Flop, QQ Drops Below 1.5% Equity Needing Runner-Runner Quads Or A Backdoor Straight.',
    ],
    strategicTakeaways: [
      'Both Hands Are Core Value Opens And 3-Bets From Every Seat At 6-Max And 9-Max Tables.',
      'Facing A Cold 4-Bet From Under The Gun, KK Continues 100% While QQ Frequently Flats In Position At 100BB+ Depth.',
      'On Dry Low Flops In 3-Bet Pots, Pocket Kings Extracts Full Three-Street Value Against Underpairs Like QQ And JJ.',
    ],
    relatedSlugs: ['aa-vs-kk', 'aa-vs-qq', 'jj-vs-tt', 'kk-vs-aks'],
    faqs: [
      {
        question: 'What Are The Odds Of Pocket Kings Beating Pocket Queens?',
        answer:
          'Pocket Kings Wins 81.48% Of Five-Card Runouts, Pocket Queens Wins 18.04%, And 0.48% Tie, Producing An 81.72% To 18.28% Equity Split.',
      },
      {
        question: 'How Does KK Vs QQ Play When An Ace Falls On The Flop?',
        answer:
          'An Ace-High Flop Slows Down Aggression From Both Players Because Both Ranges Contain AK And AQ, Turning KK Into A Medium-Strength Check-Call Hand.',
      },
      {
        question: 'How Often Does QQ Hit A Set Against KK?',
        answer:
          'Pocket Queens Flops A Set 11.76% Of The Time And Completes At Least One Queen By The River Roughly 19.2% Of The Time When Unblocked.',
      },
    ],
  },
  {
    slug: 'kk-vs-aks',
    game: 'nlhe',
    gameLabel: "No-Limit Hold'em",
    category: 'Dominated Matchup',
    handA: 'KK',
    handAName: 'Pocket Kings',
    handACards: 'Ks,Kh',
    handB: 'AKs',
    handBName: 'Ace-King Suited',
    handBCards: 'Ad,Kd',
    winA: 65.41,
    winB: 34.03,
    tie: 0.56,
    equityA: 65.69,
    equityB: 34.31,
    title: 'KK Vs AKs Poker Odds And Equity',
    h1: 'KK Vs AKs Poker Odds And Preflop Equity',
    description:
      'Exact KK Vs AKs Preflop Odds: Pocket Kings Leads Ace-King Suited 65.69% To 34.31% (65.41% Win, 0.56% Tie), With Ace-Flop Frequency And 5-Bet Strategy.',
    flopHitNotes: [
      'An Ace Falls On The Flop 22.55% Of The Time When Three Aces Remain Live In The Deck.',
      'Even Without Pairing The Ace, AKs Gains Extra Equity From Flushes And Broadway Straight Draws (Q-J-T).',
      'KK Blocks One King Out That AKs Would Otherwise Need For Trips, Keeping Kings Around A 2-To-1 Favorite.',
    ],
    strategicTakeaways: [
      'Pocket Kings Is A Clear 2-To-1 Favorite Over AKs And Should Happily Get All-In Preflop At 100BB Effective.',
      'AKs Still Generates Strong EV By 4-Betting Or 5-Betting Because Its Fold Equity Plus 34.3% Realized Equity Against KK Beats Calling Out Of Position.',
      'When AKs Shares A Suit With One Of The Kings, KK Equity Rises Slightly From 65.69% Toward 67.1%.',
    ],
    relatedSlugs: ['kk-vs-ako', 'aa-vs-aks', 'qq-vs-aks', 'aa-vs-kk'],
    faqs: [
      {
        question: 'What Are The Exact Preflop Odds For KK Vs AKs?',
        answer:
          'Pocket Kings Holds 65.69% Total Equity (65.41% Win, 0.56% Tie) Against 34.31% Total Equity (34.03% Win) For Ace-King Suited.',
      },
      {
        question: 'How Much Better Is AKs Than AKo Against Pocket Kings?',
        answer:
          'Being Suited Adds Nearly 5% Equity Against Pocket Kings, Lifting Ace-King From 29.34% (AKo) Up To 34.31% (AKs).',
      },
      {
        question: 'How Often Does An Ace Hit The Board Against Pocket Kings?',
        answer:
          'With Three Unseen Aces Remaining Against AK, At Least One Ace Appears By The River Roughly 29.7% Of The Time.',
      },
    ],
  },
  {
    slug: 'kk-vs-ako',
    game: 'nlhe',
    gameLabel: "No-Limit Hold'em",
    category: 'Dominated Matchup',
    handA: 'KK',
    handAName: 'Pocket Kings',
    handACards: 'Ks,Kh',
    handB: 'AKo',
    handBName: 'Ace-King Offsuit',
    handBCards: 'Ad,Kc',
    winA: 70.29,
    winB: 28.98,
    tie: 0.73,
    equityA: 70.66,
    equityB: 29.34,
    title: 'KK Vs AKo Poker Odds And Equity',
    h1: 'KK Vs AKo Poker Odds And Preflop Equity',
    description:
      'Exact KK Vs AKo Preflop Odds: Pocket Kings Holds 70.66% Equity (70.29% Win, 0.73% Tie) Against Ace-King Offsuit (29.34%), With Flop And Stack-Off Guide.',
    flopHitNotes: [
      'Without A Suited Flush Draw, AKo Must Almost Exclusively Spike One Of Three Live Aces Or Complete A Q-J-T Broadway Straight.',
      'An Ace Appears On The Flop 22.55% Of The Time; If The Flop Misses Both Hands, KK Jumps To Over 86% Equity.',
      'A Four-Card Flush Or Broadway Board Produces The 0.73% Tie Frequency.',
    ],
    strategicTakeaways: [
      'Pocket Kings Is A Massive 70.66% Favorite Against AKo, Confirming Why Getting KK All-In Preflop Prints Long-Term Value.',
      'AKo Still 4-Bets For Value And Blocker Coverage Because There Are 12 Offsuit Combos That Heavily Block AA And KK.',
      'At Deep 200BB Cash Stacks, Flatting A 4-Bet In Position With AKo Avoids Running Directly Into KK And AA For 200 Big Blinds.',
    ],
    relatedSlugs: ['kk-vs-aks', 'qq-vs-ako', 'jj-vs-ako', 'aa-vs-kk'],
    faqs: [
      {
        question: 'What Are The Odds Of KK Vs AKo Preflop?',
        answer:
          'Pocket Kings Wins 70.29% Of Runouts, Ace-King Offsuit Wins 28.98%, And 0.73% End In A Split Pot, Giving KK 70.66% Equity Against 29.34% For AKo.',
      },
      {
        question: 'Why Does KK Dominate AKo So Much More Than QQ Dominates AKo?',
        answer:
          'Pocket Kings Takes Away Two Of AKo Six Overcard Outs, Leaving AKo With Only Three Aces Instead Of Six Clean Overcards.',
      },
      {
        question: 'Should AKo Call A 5-Bet Shove At 100BB?',
        answer:
          'Against Tight Early-Position Ranges Consisting Almost Exclusively Of AA And KK, AKo Only Has About 20% Overall Equity And Can Find Disciplined Folds; Against Button Or Blind Battles, AKo Usually Calls.',
      },
    ],
  },
  {
    slug: 'qq-vs-aks',
    game: 'nlhe',
    gameLabel: "No-Limit Hold'em",
    category: 'Classic Coinflip',
    handA: 'QQ',
    handAName: 'Pocket Queens',
    handACards: 'Qs,Qh',
    handB: 'AKs',
    handBName: 'Ace-King Suited',
    handBCards: 'Ad,Kd',
    winA: 53.72,
    winB: 45.88,
    tie: 0.4,
    equityA: 53.92,
    equityB: 46.08,
    title: 'QQ Vs AKs Poker Odds And Equity',
    h1: 'QQ Vs AKs Poker Odds And Preflop Equity',
    description:
      'Exact QQ Vs AKs Preflop Odds: Pocket Queens Leads Ace-King Suited 53.92% To 46.08% (53.72% Win, 0.40% Tie) In Poker Most Iconic High-Stakes Coinflip.',
    flopHitNotes: [
      'An Ace Or King Appears On The Flop 32.4% Of The Time, Leaving Pocket Queens Ahead On Roughly Two-Thirds Of Flops.',
      'Even When AKs Misses Top Pair, It Flops A Flush Draw 10.9% Of The Time And Maintains Six Clean Overcard Outs.',
      'QQ Flops A Set 11.76% Of The Time, Locking AKs Down To Backdoor Flushes Or Broadway Gutshots.',
    ],
    strategicTakeaways: [
      'QQ Vs AKs Is A True 54/46 Coinflip Where Dead Money From Blinds And Antes Decides Whether Calling A Jam Is Profitable.',
      'In Tournaments With ICM Pressure Near Final Tables, Calling Off A Full Stack With QQ Or AKs Requires Tighter Equity Thresholds Than Chip-EV Cash Games.',
      'Blocking One Of AKs Flush Suits Nudges Pocket Queens From 53.92% Up Toward 56.1% Equity.',
    ],
    relatedSlugs: ['qq-vs-ako', 'ako-vs-qq', 'jj-vs-aks', 'kk-vs-aks'],
    faqs: [
      {
        question: 'Who Is The Favorite In QQ Vs AKs?',
        answer:
          'Pocket Queens Is A Slight Favorite With 53.92% Equity (53.72% Win, 0.40% Tie) Compared To 46.08% Equity (45.88% Win) For Ace-King Suited.',
      },
      {
        question: 'How Often Does AKs Hit An Ace Or King On The Flop Against QQ?',
        answer:
          'With Six Live Overcards In A 48-Card Remaining Deck, AKs Pairs An Ace Or King On The Flop Approximately 32.4% Of The Time.',
      },
      {
        question: 'Is QQ Vs AKs Worth Jamming For 100BB?',
        answer:
          'In Late-Position Cash Game Battles (Cutoff, Button, Blinds), Both QQ And AKs Frequently Stack Off Preflop Because Dead Money And Blocker Removal Make Jamming Positive EV.',
      },
    ],
  },
  {
    slug: 'qq-vs-ako',
    game: 'nlhe',
    gameLabel: "No-Limit Hold'em",
    category: 'Classic Coinflip',
    handA: 'QQ',
    handAName: 'Pocket Queens',
    handACards: 'Qs,Qh',
    handB: 'AKo',
    handBName: 'Ace-King Offsuit',
    handBCards: 'Ad,Kc',
    winA: 56.55,
    winB: 43.06,
    tie: 0.39,
    equityA: 56.75,
    equityB: 43.25,
    title: 'QQ Vs AKo Poker Odds And Equity',
    h1: 'QQ Vs AKo Poker Odds And Preflop Equity',
    description:
      'Exact QQ Vs AKo Preflop Odds: Pocket Queens Leads Ace-King Offsuit 56.75% To 43.25% (56.55% Win, 0.39% Tie), With Flop Odds And Tournament Strategy.',
    flopHitNotes: [
      'Without Flush Outs, AKo Relies Almost Entirely On Its Six Live Ace And King Overcards To Overtake Pocket Queens.',
      'If The Flop Comes Ace-Free And King-Free (67.6% Of Flops), Pocket Queens Equity Surges Past 73%.',
      'Queens Blocks Part Of AKo Broadway Straight Outs (A-K-Q-J-T), Giving QQ A Clear 13.5% Edge Over AKo.',
    ],
    strategicTakeaways: [
      'Pocket Queens Enjoys A Comfortable 56.75% Edge Over AKo, Making QQ A Strong Preflop 4-Bet Value Hand Against Aggressive 3-Bettors.',
      'When Holding AKo Against A Tight 4-Bet Range, Calling In Position Can Outperform Jamming If Villain Only Calls Jams With QQ+, AK.',
      'In Short-Stack 20BB MTT Spots, Both Hands Are Unconditional Preflop Shoves And Calls.',
    ],
    relatedSlugs: ['qq-vs-aks', 'ako-vs-qq', 'jj-vs-ako', 'kk-vs-ako'],
    faqs: [
      {
        question: 'What Are The Odds Of Pocket Queens Against Ace-King Offsuit?',
        answer:
          'Pocket Queens Wins 56.55% Of Boards, Ace-King Offsuit Wins 43.06%, And 0.39% Split, Giving QQ 56.75% Equity Against 43.25% For AKo.',
      },
      {
        question: 'How Much Equity Does AK Lose By Being Offsuit Against QQ?',
        answer:
          'Ace-King Drops Roughly 2.83% Equity Going From Suited (46.08%) To Offsuit (43.25%) Against Pocket Queens.',
      },
      {
        question: 'Does Pocket Queens Block AKo Straight Outs?',
        answer:
          'Yes. Holding Two Queens Reduces AKo Broadway Straight Combinations By Half, Helping QQ Retain Nearly 57% Equity.',
      },
    ],
  },
  {
    slug: 'jj-vs-aks',
    game: 'nlhe',
    gameLabel: "No-Limit Hold'em",
    category: 'Classic Coinflip',
    handA: 'JJ',
    handAName: 'Pocket Jacks',
    handACards: 'Js,Jh',
    handB: 'AKs',
    handBName: 'Ace-King Suited',
    handBCards: 'Ad,Kd',
    winA: 53.69,
    winB: 46.03,
    tie: 0.28,
    equityA: 53.83,
    equityB: 46.17,
    title: 'JJ Vs AKs Poker Odds And Equity',
    h1: 'JJ Vs AKs Poker Odds And Preflop Equity',
    description:
      'Exact JJ Vs AKs Preflop Odds: Pocket Jacks Leads Ace-King Suited 53.83% To 46.17% (53.69% Win, 0.28% Tie), With Postflop Overcard And ICM Guidance.',
    flopHitNotes: [
      'Pocket Jacks Faces Overcards (A, K, Or Q) On More Than 52% Of All Flops, Making Postflop Equity Realization Harder Than All-In Preflop Equity.',
      'Against AKs Specifically, Only Aces And Kings Beat JJ Directly (32.4% Of Flops), Though Queen-High Flops Create Tricky Turn Spots.',
      'When JJ Shares One Suit With AKs, Pocket Jacks Equity Climbs Slightly Above 56%.',
    ],
    strategicTakeaways: [
      'Realizing Pocket Jacks 53.83% Equity Is Often Easier By Getting All-In Preflop At Short-To-Medium Stacks Than Playing Out Of Position Deep.',
      'At 100BB Cash Games, Pocket Jacks Prefers 3-Betting For Value And Flatting Most 4-Bets In Position.',
      'On Low Rainbow Flops (8-5-2), JJ Holds Over 71% Equity Against AKs And Should Bet For Thin Value And Protection.',
    ],
    relatedSlugs: ['jj-vs-ako', 'qq-vs-aks', 'tt-vs-aks', 'jj-vs-tt'],
    faqs: [
      {
        question: 'What Are The Odds Of JJ Vs AKs All-In Preflop?',
        answer:
          'Pocket Jacks Holds 53.83% Equity (53.69% Win, 0.28% Tie) Against 46.17% Equity (46.03% Win) For Ace-King Suited When Suits Do Not Overlap.',
      },
      {
        question: 'Why Do Players Struggle Playing Pocket Jacks Against AKs Postflop?',
        answer:
          'Even Though JJ Leads Preflop, Aces, Kings, And Queens Fall On Over Half Of Flops, Forcing JJ To Navigate Difficult Check-Call Decisions Without Realizing Full Equity.',
      },
      {
        question: 'Is JJ Almost Identical To QQ Against AKs?',
        answer:
          'Yes. Both QQ (53.92%) And JJ (53.83%) Are Virtually Identical 54/46 Favorites Against AKs Because Neither Pair Dominates AKs Six Live Overcards.',
      },
    ],
  },
  {
    slug: 'jj-vs-ako',
    game: 'nlhe',
    gameLabel: "No-Limit Hold'em",
    category: 'Classic Coinflip',
    handA: 'JJ',
    handAName: 'Pocket Jacks',
    handACards: 'Js,Jh',
    handB: 'AKo',
    handBName: 'Ace-King Offsuit',
    handBCards: 'Ad,Kc',
    winA: 56.65,
    winB: 42.95,
    tie: 0.4,
    equityA: 56.85,
    equityB: 43.15,
    title: 'JJ Vs AKo Poker Odds And Equity',
    h1: 'JJ Vs AKo Poker Odds And Preflop Equity',
    description:
      'Exact JJ Vs AKo Preflop Odds: Pocket Jacks Beats Ace-King Offsuit 56.85% To 43.15% (56.65% Win, 0.40% Tie), With Flop Overcard Rates And MTT Tips.',
    flopHitNotes: [
      'Without Suited Flush Equity, AKo Drops Below 43.2% Equity Against Pocket Jacks Across All Suit Pairings.',
      'An Ace Or King Hits The Flop 32.4% Of The Time; On Every Other Flop, JJ Takes A Commanding 73%+ Lead.',
      'JJ Blocks Two Jacks Needed For AKo Broadway Straight, Keeping Jacks Safely Ahead In The Race.',
    ],
    strategicTakeaways: [
      'In Multi-Table Tournaments Under 40BB, Calling A Shove With JJ Against A Range Heavily Weighted Toward AKo Is Strongly Profitable.',
      'In Deep Cash Games, Beware Turning JJ Into A Bluff-Catcher On Ace-King-X Runouts Where AKo Hits Two Pair Or Top Pair.',
      'Sizing 3-Bets Larger Out Of Position With JJ Helps Deny Realization To Offsuit Broadways Like AKo And AQo.',
    ],
    relatedSlugs: ['jj-vs-aks', 'qq-vs-ako', '99-vs-ako', 'jj-vs-tt'],
    faqs: [
      {
        question: 'Who Wins More Often Between JJ And AKo?',
        answer:
          'Pocket Jacks Wins 56.65% Of Runouts, Ace-King Offsuit Wins 42.95%, And 0.40% Split, Giving JJ A 56.85% To 43.15% Advantage.',
      },
      {
        question: 'Why Does JJ Have Nearly The Same Equity Against AKo As QQ?',
        answer:
          'Both QQ And JJ Block Exactly One Card Of AKo Broadway Straight And Face Six Live Overcards, Leaving Both Pairs Near 56.8% Equity.',
      },
      {
        question: 'Should I Jam JJ Preflop For 30BB In A Tournament?',
        answer:
          'Yes. At 30BB Effective Depth, Pocket Jacks Is Well Ahead Of Standard Open-Call And 3-Bet-Jam Ranges Including AKo, AQs, And Smaller Pairs.',
      },
    ],
  },
  {
    slug: 'tt-vs-aks',
    game: 'nlhe',
    gameLabel: "No-Limit Hold'em",
    category: 'Classic Coinflip',
    handA: 'TT',
    handAName: 'Pocket Tens',
    handACards: '10s,10h',
    handB: 'AKs',
    handBName: 'Ace-King Suited',
    handBCards: 'Ad,Kd',
    winA: 53.86,
    winB: 45.73,
    tie: 0.41,
    equityA: 54.07,
    equityB: 45.93,
    title: 'TT Vs AKs Poker Odds And Equity',
    h1: 'TT Vs AKs Poker Odds And Preflop Equity',
    description:
      'Exact TT Vs AKs Preflop Odds: Pocket Tens Leads Ace-King Suited 54.07% To 45.93% (53.86% Win, 0.41% Tie), Explaining Why Tens Edges Out Suited Big Slick.',
    flopHitNotes: [
      'Pocket Tens Blocks Two Tens Crucial To AKs Broadway Straight (A-K-Q-J-T), Keeping TT At 54.07% Equity.',
      'TT Flops A Set 11.76% Of The Time While AKs Hits An Ace, King, Or Flush Draw On Roughly 41% Of Flops.',
      'A Low Paired Board Like 6-6-2 Virtually Locks Up The Pot For Tens Unless AKs Turns Or Rivers A High Card Or Flush.',
    ],
    strategicTakeaways: [
      'At 25BB To 35BB Tournament Stacks, Pocket Tens Is A Standard 3-Bet Jam Against Late-Position Opens Because It Flips Ahead Of AKs And Dominates Smaller Pairs.',
      'At 100BB Cash Depth, Calling 3-Bets In Position With TT Realizes Equity Cleanly Without Getting Crushed By JJ+.',
      'Never Assume AKs Is A Favorite Over Medium Pairs: Even Suited AK Trails Every Pair From 66 Through QQ.',
    ],
    relatedSlugs: ['jj-vs-aks', '99-vs-ako', 'jj-vs-tt', 'ako-vs-22'],
    faqs: [
      {
        question: 'What Are The Odds Of TT Vs AKs Preflop?',
        answer:
          'Pocket Tens Wins 53.86% Of Runouts, Ace-King Suited Wins 45.73%, And 0.41% Split, Giving TT 54.07% Total Equity Against 45.93% For AKs.',
      },
      {
        question: 'Why Does TT Perform Slightly Better Against AKs Than 99 Does?',
        answer:
          'Pocket Tens Removes Two Tens From The Deck, Directly Blocking AKs Broadway Straight Outs And Preserving An Extra 1.5% Equity Over Pocket Nines.',
      },
      {
        question: 'Is Pocket Tens A Coin Flip Against AKs?',
        answer:
          'Yes. At 54.07% Vs 45.93%, TT Vs AKs Is One Of Poker Classic Preflop Races Where Pot Odds And Stack Depth Drive The Decision.',
      },
    ],
  },
  {
    slug: 'aks-vs-aqo',
    game: 'nlhe',
    gameLabel: "No-Limit Hold'em",
    category: 'Dominated Matchup',
    handA: 'AKs',
    handAName: 'Ace-King Suited',
    handACards: 'As,Ks',
    handB: 'AQo',
    handBName: 'Ace-Queen Offsuit',
    handBCards: 'Ah,Qd',
    winA: 71.52,
    winB: 23.68,
    tie: 4.8,
    equityA: 73.92,
    equityB: 26.08,
    title: 'AKs Vs AQo Poker Odds And Equity',
    h1: 'AKs Vs AQo Poker Odds And Preflop Equity',
    description:
      'Exact AKs Vs AQo Preflop Odds: Ace-King Suited Dominates Ace-Queen Offsuit 73.92% To 26.08% (71.52% Win, 4.80% Tie), With Reverse Implied Odds Analysis.',
    flopHitNotes: [
      'On Ace-High Flops, AQo Has Only Three Clean Queen Outs To Beat AKs Top Pair Top Kicker, Creating Severe Reverse Implied Odds.',
      'Nearly 5% Of All Runouts (4.80%) Result In A Chop Because The Board Plays A Higher Pair, Straight, Or Flush.',
      'Suited AKs Adds Roughly 4% Extra Equity Over Offsuit AKo In This Dominated Ace Battle.',
    ],
    strategicTakeaways: [
      'Ace-Queen Offsuit Should Avoid Stacking Off Preflop At 100BB Against Tight Early-Position 4-Bets Where AK Dominates Its Range.',
      'When Both Hands Flop Top Pair On An Ace-High Dry Board, AKs Can Value-Bet Three Streets Confidently While AQo Should Control The Pot.',
      'In Button Vs Big Blind 3-Bet Pots, AQo Still Defends Profitably Because Villain 3-Bet Range Is Much Wider Than AK.',
    ],
    relatedSlugs: ['aks-vs-kqs', 'aa-vs-aks', '88-vs-aqs', 'qq-vs-aks'],
    faqs: [
      {
        question: 'What Are The Odds Of AKs Against AQo Preflop?',
        answer:
          'Ace-King Suited Wins 71.52% Of Runouts, Ace-Queen Offsuit Wins 23.68%, And 4.80% End In A Split Pot, Giving AKs 73.92% Equity Against 26.08% For AQo.',
      },
      {
        question: 'Why Is The Tie Rate So High In AKs Vs AQo?',
        answer:
          'Because Both Hands Share An Ace, Any Double-Paired Board, High Straight Board, Or Ace-High Board With Higher Kicker Cards Produces A 4.80% Chop Frequency.',
      },
      {
        question: 'How Should AQo Play On An A-8-3 Rainbow Flop Facing A 3-Bet?',
        answer:
          'Call Flop And Evaluate Turn Sizing Carefully. Avoid Raising For Value On Ace-High Boards Where Worse Hands Fold And AK Or Sets Continue.',
      },
    ],
  },
  {
    slug: 'aks-vs-kqs',
    game: 'nlhe',
    gameLabel: "No-Limit Hold'em",
    category: 'Dominated Matchup',
    handA: 'AKs',
    handAName: 'Ace-King Suited',
    handACards: 'As,Ks',
    handB: 'KQs',
    handBName: 'King-Queen Suited',
    handBCards: 'Kh,Qh',
    winA: 70.99,
    winB: 27.88,
    tie: 1.13,
    equityA: 71.55,
    equityB: 28.45,
    title: 'AKs Vs KQs Poker Odds And Equity',
    h1: 'AKs Vs KQs Poker Odds And Preflop Equity',
    description:
      'Exact AKs Vs KQs Preflop Odds: Ace-King Suited Dominates King-Queen Suited 71.55% To 28.45% (70.99% Win, 1.13% Tie), With King-High Flop Strategy.',
    flopHitNotes: [
      'AKs Holds Ace-High Domination Over KQs While Both Hands Share A King, Limiting KQs To Three Live Queens Plus Flush And Straight Outs.',
      'On King-High Flops, KQs Suffers Steep Reverse Implied Odds Because Top Pair Good Kicker Pays Off AKs Across Multiple Streets.',
      'Unlike AKs Vs AQo, KQs Keeps Live Suited Flush Equity Of Its Own When Suits Do Not Match, Reaching 28.45% Total Equity.',
    ],
    strategicTakeaways: [
      'KQs Is A Strong 3-Bet Call In Position At 100BB, But Should Rarely 4-Bet/Call Off Against Tight Ranges Packed With AK And KK.',
      'On King-High Wet Boards, KQs Should Mix Check-Calls Rather Than Raising For Thin Value Into AKs.',
      'AKs Should Continue Value Betting King-High Runouts Because KQs, KJs, And KTs Frequently Call Down.',
    ],
    relatedSlugs: ['aks-vs-aqo', 'aks-vs-jts', 'kk-vs-aks', 'aa-vs-aks'],
    faqs: [
      {
        question: 'What Is The Exact Equity Of AKs Vs KQs?',
        answer:
          'Ace-King Suited Holds 71.55% Equity (70.99% Win, 1.13% Tie) Against 28.45% Equity (27.88% Win) For King-Queen Suited With Unblocked Suits.',
      },
      {
        question: 'Why Does KQs Have Higher Equity Against AKs Than AQo Does?',
        answer:
          'King-Queen Suited Has Live Flush Possibilities And More Straight Combinations (Q-J-T-9), Lifting It To 28.45% Compared To 26.08% For Offsuit AQo.',
      },
      {
        question: 'Should You Fold KQs To A 3-Bet?',
        answer:
          'Almost Never In Position At 100BB. Even Though AKs Dominates KQs, Standard 3-Bet Ranges Include Many Suited Wheel Aces, Pocket Pairs, And Connectors That KQs Plays Well Against.',
      },
    ],
  },
  {
    slug: 'aks-vs-jts',
    game: 'nlhe',
    gameLabel: "No-Limit Hold'em",
    category: 'Suited Connector Vs Big Hand',
    handA: 'AKs',
    handAName: 'Ace-King Suited',
    handACards: 'As,Ks',
    handB: 'JTs',
    handBName: 'Jack-Ten Suited',
    handBCards: 'Jh,10h',
    winA: 60.21,
    winB: 39.26,
    tie: 0.53,
    equityA: 60.48,
    equityB: 39.52,
    title: 'AKs Vs JTs Poker Odds And Equity',
    h1: 'AKs Vs JTs Poker Odds And Preflop Equity',
    description:
      'Exact AKs Vs JTs Preflop Odds: Ace-King Suited Holds 60.48% Equity (60.21% Win, 0.53% Tie) Against Jack-Ten Suited (39.52%), Plus Flop Playability Tips.',
    flopHitNotes: [
      'JTs Holds Two Live Cards And Strong Straight Plus Flush Connectivity, Keeping Its Preflop Equity Right Near 40% Against AKs.',
      'If Both Hands Share The Same Suit, AKs Dominates The Flush And Jumps From 60.48% Up To Nearly 66.5% Equity.',
      'JTs Flops A Pair, Two Pair, Straight, Or Strong Draw On Over 48% Of Flops, Realizing Equity Smoothly In Position.',
    ],
    strategicTakeaways: [
      'This 60/40 Split Explains Why Suited Connectors Like JTs Are Profitable In-Position Defenses Against Wide 3-Bets.',
      'AKs Should Apply Pressure On Ace-High, King-High, And Queen-High Boards Where It Retains Significant Range And Nut Advantage.',
      'On Middle Connected Flops (9-8-7 Or J-9-4), AKs Must Exercise Caution Against JTs Check-Raises.',
    ],
    relatedSlugs: ['aks-vs-76s', 'aa-vs-jts', 'aks-vs-kqs', 'aks-vs-aqo'],
    faqs: [
      {
        question: 'What Are The Exact Odds Of AKs Vs JTs Preflop?',
        answer:
          'With Different Suits, Ace-King Suited Wins 60.21% Of Boards, Jack-Ten Suited Wins 39.26%, And 0.53% Tie, Yielding A 60.48% To 39.52% Equity Split.',
      },
      {
        question: 'Why Does JTs Do So Well Against AKs?',
        answer:
          'Because JTs Is Completely Undominated By AKs, Any Jack, Ten, Flush, Or Non-Broadway Straight Can Beat Unpaired Ace-King.',
      },
      {
        question: 'What Happens When AKs And JTs Are The Same Suit?',
        answer:
          'When Both Hands Share A Suit, AKs Holds The Nut Flush Blocker And Dominates Flush-Over-Flush Runouts, Boosting AKs Equity To Around 66.5%.',
      },
    ],
  },
  {
    slug: 'aks-vs-76s',
    game: 'nlhe',
    gameLabel: "No-Limit Hold'em",
    category: 'Suited Connector Vs Big Hand',
    handA: 'AKs',
    handAName: 'Ace-King Suited',
    handACards: 'As,Ks',
    handB: '76s',
    handBName: 'Seven-Six Suited',
    handBCards: '7h,6h',
    winA: 60.36,
    winB: 39.21,
    tie: 0.43,
    equityA: 60.58,
    equityB: 39.42,
    title: 'AKs Vs 76s Poker Odds And Equity',
    h1: 'AKs Vs 76s Poker Odds And Preflop Equity',
    description:
      'Exact AKs Vs 76s Preflop Odds: Ace-King Suited Leads Seven-Six Suited 60.58% To 39.42% (60.36% Win, 0.43% Tie), With Live-Card And Flop Texture Notes.',
    flopHitNotes: [
      'Like JTs, Seven-Six Suited Has Zero Rank Domination Against AKs And Retains 39.42% Equity Across Non-Overlapping Suits.',
      'Unlike JTs, 76s Makes Straight Runouts Completely Independent Of AKs Broadway Cards, Avoiding Cooler Straight-Over-Straight Spots.',
      'When AKs Misses The Flop Completely (67% Of Flops), Any Pair Of Sevens Or Sixes Turns 76s Into A Heavy Favorite.',
    ],
    strategicTakeaways: [
      '76s Is A Staple Deep-Stack 3-Bet Call And Occasional 3-Bet Bluff Because It Performs Surprisingly Well Against Unpaired Big Slick.',
      'AKs Must Respect Raises On Low Connected Boards (8-5-4, 7-6-2) Where Suited Connectors Hold The Nut Advantage.',
      'At Short 15BB Stacks, AKs Dominates Because 76s Cannot Rely On Deep Postflop Implied Odds.',
    ],
    relatedSlugs: ['aks-vs-jts', 'aa-vs-jts', 'ako-vs-22', 'aks-vs-kqs'],
    faqs: [
      {
        question: 'How Much Equity Does 76s Have Against AKs?',
        answer:
          'Seven-Six Suited Holds 39.42% Equity (39.21% Win, 0.43% Tie) Against Ace-King Suited (60.58% Equity) When Both Hands Have Different Suits.',
      },
      {
        question: 'Does 76s Have Better Equity Against AKs Than AQo Does?',
        answer:
          'Yes! Because 76s Is Completely Undominated (39.42%), It Holds Over 13% More Preflop Equity Against AKs Than Dominated AQo (26.08%).',
      },
      {
        question: 'Why Do Pros 3-Bet 76s Sometimes In Cash Games?',
        answer:
          '76s Provides Board Coverage On Low Flops And Retains Nearly 40% Equity Even When Called By Premium Hands Like AKs.',
      },
    ],
  },
  {
    slug: 'ako-vs-22',
    game: 'nlhe',
    gameLabel: "No-Limit Hold'em",
    category: 'Classic Coinflip',
    handA: 'AKo',
    handAName: 'Ace-King Offsuit',
    handACards: 'As,Kh',
    handB: '22',
    handBName: 'Pocket Deuces',
    handBCards: '2d,2c',
    winA: 49.23,
    winB: 50.11,
    tie: 0.66,
    equityA: 49.56,
    equityB: 50.44,
    title: 'AKo Vs 22 Poker Odds And Equity',
    h1: 'AKo Vs 22 Poker Odds And Preflop Equity',
    description:
      'Exact AKo Vs 22 Preflop Odds: Pocket Deuces Edges Out Ace-King Offsuit 50.44% To 49.56% (50.11% Win, 0.66% Tie) In Poker Purest 50/50 Coinflip.',
    flopHitNotes: [
      'AKo Vs 22 Is Poker Closest True Coinflip: Pocket Deuces Leads By Less Than 1% (50.44% Vs 49.56%).',
      'Even Without Pairing An Ace Or King, AKo Can Counterfeit Pocket Deuces Whenever The Board Double-Pairs Above Twos.',
      'A Paired Flop Like 9-9-4 Gives AKo Additional Counterfeit Outs On Turn And River Beyond Its Six Overcards.',
    ],
    strategicTakeaways: [
      'Although 22 Leads Heads-Up All-In By 0.88%, AKo Is A Far Superior Overall Hand Because It Realizes Equity Postflop And Dominates Smaller Aces.',
      'Pocket Deuces Should Rarely Call Deep 3-Bets Purely To Flip; Its Main Value Comes From Set-Mining At High Stack-To-Pot Ratios Or Shoving Short Stacks.',
      'At 12BB To 18BB Tournament Stacks, Pocket Deuces Becomes A High-Frequency Open-Shove Because Fold Equity Plus 50%+ Flip Equity Prints Chips.',
    ],
    relatedSlugs: ['99-vs-ako', 'jj-vs-ako', 'qq-vs-ako', 'tt-vs-aks'],
    faqs: [
      {
        question: 'Is 22 Actually A Favorite Over AKo?',
        answer:
          'Yes, By A Razor-Thin Margin. Pocket Deuces Holds 50.44% Equity (50.11% Win, 0.66% Tie) Against 49.56% Equity (49.23% Win) For Ace-King Offsuit.',
      },
      {
        question: 'How Can AKo Beat 22 Without Hitting An Ace Or King?',
        answer:
          'If The Board Runs Out Two Higher Pairs (Such As 9-9-7-7-4), Pocket Deuces Is Counterfeited And AKo Ace Kicker Wins The Pot.',
      },
      {
        question: 'Does AKs Beat Pocket Deuces Preflop?',
        answer:
          'Yes. Being Suited Shifts Ace-King Ahead Of Pocket Deuces To Roughly 52.3% Equity Thanks To Flush Potential Plus Counterfeit Outs.',
      },
    ],
  },
  {
    slug: 'ako-vs-qq',
    game: 'nlhe',
    gameLabel: "No-Limit Hold'em",
    category: 'Classic Coinflip',
    handA: 'AKo',
    handAName: 'Ace-King Offsuit',
    handACards: 'As,Kh',
    handB: 'QQ',
    handBName: 'Pocket Queens',
    handBCards: 'Qd,Qc',
    winA: 43.06,
    winB: 56.55,
    tie: 0.39,
    equityA: 43.25,
    equityB: 56.75,
    title: 'AKo Vs QQ Poker Odds And Equity',
    h1: 'AKo Vs QQ Poker Odds And Preflop Equity',
    description:
      'Exact AKo Vs QQ Preflop Odds: Ace-King Offsuit Holds 43.25% Equity (43.06% Win, 0.39% Tie) Against Pocket Queens (56.75%), Plus 4-Bet All-In Math.',
    flopHitNotes: [
      'AKo Pairs An Ace Or King On 32.4% Of Flops And Wins Roughly 43.06% By The River When Both Players Run Five Cards.',
      'If The Flop Misses AKo Completely, AKo Drops To Approximately 25% Equity With Two Cards To Come.',
      'AKo Needs Roughly 1.32-To-1 Pot Odds To Call A Preflop All-In Directly Against A Known Pocket Queens.',
    ],
    strategicTakeaways: [
      'AKo Gains Substantial Preflop Value From Blocking Half Of All AA And KK Combos Even Though It Trails QQ 43/57.',
      'With Dead Money From Blinds, Antes, And An Initial Raise, 4-Betting Or Calling A Shove With AKo Often Easily Clears The 43.25% Equity Bar.',
      'Postflop, AKo Plays Aggressively On Ace-High And King-High Textures While Checking Back Many Low Connected Boards.',
    ],
    relatedSlugs: ['qq-vs-ako', 'qq-vs-aks', 'kk-vs-ako', 'jj-vs-ako'],
    faqs: [
      {
        question: 'What Are The Odds Of AKo Beating QQ?',
        answer:
          'Ace-King Offsuit Wins 43.06% Of All-In Runouts, Loses 56.55% To Pocket Queens, And Ties 0.39%, Giving AKo 43.25% Total Equity.',
      },
      {
        question: 'Is Calling An All-In With AKo Profitable If You Suspect QQ?',
        answer:
          'If The Pot Offers Better Than 43.3% Break-Even Odds (Roughly 1.32 To 1) Or Villain Range Includes AK And Bluffs, Calling Is Mathematically Profitable.',
      },
      {
        question: 'How Often Does AKo Hit A Pair By The Turn Against QQ?',
        answer:
          'Holding Six Live Overcards, AKo Pairs An Ace Or King By The Turn Roughly 41.3% Of The Time.',
      },
    ],
  },
  {
    slug: 'aa-vs-72o',
    game: 'nlhe',
    gameLabel: "No-Limit Hold'em",
    category: 'Dominated Matchup',
    handA: 'AA',
    handAName: 'Pocket Aces',
    handACards: 'As,Ah',
    handB: '72o',
    handBName: 'Seven-Two Offsuit',
    handBCards: '7d,2c',
    winA: 87.59,
    winB: 11.96,
    tie: 0.45,
    equityA: 87.82,
    equityB: 12.18,
    title: 'AA Vs 72o Poker Odds And Equity',
    h1: 'AA Vs 72o Poker Odds And Preflop Equity',
    description:
      'Exact AA Vs 72o Preflop Odds: Pocket Aces Leads Seven-Two Offsuit 87.82% To 12.18% (87.59% Win, 0.45% Tie), Breaking Down The Best Vs Worst Holdem Hand.',
    flopHitNotes: [
      'Seven-Two Offsuit Cannot Make A Five-Card Straight Using Both Hole Cards And Has No Suited Flush Potential, Leaving It At Just 12.18% Equity.',
      '72o Flops Two Pair Or Trips Roughly 3.3% Of The Time, Its Primary Path To Cracking Pocket Aces.',
      'Even Against The Worst Starting Hand In Poker, Pocket Aces Still Loses Roughly 1 In Every 8.4 All-In Showdowns.',
    ],
    strategicTakeaways: [
      'The 7-2 Bounty Side Game Incentivizes Loose Bluffs, So Pocket Aces Should Induce Action Rather Than Over-Betting Too Early Against Wild Opponents.',
      'Notice That 72o (12.18%) Actually Holds Slightly Less Equity Against AA Than Suited Connectors Like JTs (20.64%) By Over 8 Full Percentage Points.',
      'Understanding Why AA Loses 12% Even To 72o Builds Mental Game Resilience Against Short-Term Variance.',
    ],
    relatedSlugs: ['aa-vs-jts', 'aa-vs-kk', 'aa-vs-aks', 'q8o-vs-random'],
    faqs: [
      {
        question: 'How Often Does 72o Beat Pocket Aces?',
        answer:
          'Seven-Two Offsuit Beats Pocket Aces 11.96% Of The Time And Splits 0.45% Of The Time, Giving 72o 12.18% Total Preflop Equity Against 87.82% For AA.',
      },
      {
        question: 'Is 72o The Worst Possible Hand Against Pocket Aces?',
        answer:
          'No. Dominated Offsuit Aces Like A2o Or A3o Actually Have Even Less Equity Against AA (Around 6.5% To 7.5%) Because AA Dominates Their Ace And Leaves Almost No Pair Outs.',
      },
      {
        question: 'Why Do Cash Games Run The 7-2 Game?',
        answer:
          'The 7-2 Side Game Pays A Bounty From Every Player Whenever Someone Wins A Pot With 7-2, Creating Action While Still Punishing Players Who Run Into Pocket Aces.',
      },
    ],
  },
  {
    slug: 'q8o-vs-random',
    game: 'nlhe',
    gameLabel: "No-Limit Hold'em",
    category: 'Hand Vs Random Range',
    handA: 'Q8o',
    handAName: 'Queen-Eight Offsuit',
    handACards: 'Qs,8h',
    handB: 'Random',
    handBName: 'Random Holdem Hand',
    handBCards: '',
    winA: 51.92,
    winB: 44.52,
    tie: 3.56,
    equityA: 53.7,
    equityB: 46.3,
    title: 'Q8o Vs Random Hand Poker Odds',
    h1: 'Q8o Vs Random Hand Poker Odds And Equity',
    description:
      'Exact Q8o Vs Random Hand Odds: Queen-Eight Offsuit Holds 53.70% Preflop Equity (51.92% Win, 3.56% Tie) Heads-Up, With Position And Fold Guidance.',
    flopHitNotes: [
      'Q8o Pairs A Queen Or Eight On 32.4% Of Flops, Yet Frequently Suffers From Kicker Domination Against Better Queens (AQ, KQ, QJ, QT).',
      'Because It Is Offsuit With A Three-Card Gap, Q8o Flops A Straight Draw Under 3% Of The Time And Cannot Flop A Flush Draw.',
      'Its 53.70% Raw Heads-Up Equity Shrinks Rapidly In Multiway Pots Where Better High Cards Enter.',
    ],
    strategicTakeaways: [
      'Fold Q8o From Early, Middle, And Cutoff Seats In 6-Max And 9-Max Cash Games.',
      'Q8o Becomes Playable Primarily In Button Opens Against Tight Blinds, Small Blind Vs Big Blind Battles, Or Heads-Up Play.',
      'In Big Blind Defense Against A Min-Raise At 100BB, Q8o Usually Calls Against Button Opens And Folds Against Early-Position Opens.',
    ],
    relatedSlugs: ['q9o-vs-random', 'k5s-vs-random', 'k7s-vs-random', 'aa-vs-72o'],
    faqs: [
      {
        question: 'What Is Queen-Eight Offsuit Equity Against A Random Hand?',
        answer:
          'Queen-Eight Offsuit Holds 53.70% Equity Heads-Up Against A Random Holdem Hand, Winning 51.92% Outright, Losing 44.52%, And Splitting 3.56% Of Pots.',
      },
      {
        question: 'Should I Open Q8o From Early Or Middle Position?',
        answer:
          'No. Although Q8o Is Slightly Above 50% Against One Random Hand, Facing Five To Eight Players Behind Guarantees Domination By Stronger Queens, Kings, And Aces.',
      },
      {
        question: 'When Is Q8o Profitable To Play?',
        answer:
          'Q8o Is Profitable In Heads-Up Pots, Blind-Vs-Blind Steals, And Late-Stage Short-Stack Button Shoves Where Fold Equity Complements Its 53.7% Raw Equity.',
      },
    ],
  },
  {
    slug: 'k5s-vs-random',
    game: 'nlhe',
    gameLabel: "No-Limit Hold'em",
    category: 'Hand Vs Random Range',
    handA: 'K5s',
    handAName: 'King-Five Suited',
    handACards: 'Ks,5s',
    handB: 'Random',
    handBName: 'Random Holdem Hand',
    handBCards: '',
    winA: 54.34,
    winB: 41.74,
    tie: 3.92,
    equityA: 56.3,
    equityB: 43.7,
    title: 'K5s Vs Random Hand Poker Odds',
    h1: 'K5s Vs Random Hand Poker Odds And Equity',
    description:
      'Exact K5s Vs Random Hand Odds: King-Five Suited Holds 56.30% Equity (54.34% Win, 3.92% Tie) Heads-Up, With King-High Flush And Late-Position Strategy.',
    flopHitNotes: [
      'K5s Flops A Flush Draw 10.94% Of The Time And A Made Second-Nut Flush 0.84% Of The Time.',
      'Pairing A King Gives Top Pair With A Weak Kicker, So Pot Control Matters Against Larger 3-Bet Ranges Containing AK, KQ, And KJ.',
      'The Suited Property Adds Roughly 3% Raw Equity And Much Stronger Postflop Playability Over K5o.',
    ],
    strategicTakeaways: [
      'Open-Raise K5s Consistently From The Cutoff, Button, And Small Blind In 6-Max Cash Games And Tournaments.',
      'K5s Makes An Effective Light 3-Bet Bluff From The Button Or Small Blind Because The King Blocks KK And AK While Retaining Flush Equity When Called.',
      'Fold K5s From Under The Gun In Full-Ring 9-Max Cash Games To Avoid Multiway Kicker Traps.',
    ],
    relatedSlugs: ['k7s-vs-random', 'a3s-vs-random', 'a9s-vs-random', 'q9o-vs-random'],
    faqs: [
      {
        question: 'What Is K5s Equity Against A Random Starting Hand?',
        answer:
          'King-Five Suited Holds 56.30% Total Equity Against One Random Hand, Winning 54.34% Outright, Losing 41.74%, And Tying 3.92% Of Runouts.',
      },
      {
        question: 'Why Do Solvers Prefer K5s Over K7o?',
        answer:
          'Even Though K7o Has A Slightly Higher Kicker, K5s Can Make King-High Flushes And Realizes Far More Postflop Equity In Single-Raised And 3-Bet Pots.',
      },
      {
        question: 'Is K5s A Good Hand To 3-Bet Bluff Preflop?',
        answer:
          'Yes. Holding A King Blocks Premium Continuing Hands (KK, AK, KQ) And Having A Suited Hand Gives Playable Flush Draws When Villain Calls.',
      },
    ],
  },
  {
    slug: 'a9s-vs-random',
    game: 'nlhe',
    gameLabel: "No-Limit Hold'em",
    category: 'Hand Vs Random Range',
    handA: 'A9s',
    handAName: 'Ace-Nine Suited',
    handACards: 'As,9s',
    handB: 'Random',
    handBName: 'Random Holdem Hand',
    handBCards: '',
    winA: 60.83,
    winB: 35.23,
    tie: 3.94,
    equityA: 62.8,
    equityB: 37.2,
    title: 'A9s Vs Random Hand Poker Odds',
    h1: 'A9s Vs Random Hand Poker Odds And Equity',
    description:
      'Exact A9s Vs Random Hand Odds: Ace-Nine Suited Holds 62.80% Equity (60.83% Win, 3.94% Tie) Heads-Up, With Nut Flush Value And 6-Max Opening Strategy.',
    flopHitNotes: [
      'A9s Holds Nut-Flush Potential On Every Two-Tone Flop Matching Its Suit (10.94% Flop Flush Draw Rate).',
      'On Ace-High Boards, A9s Beats All Smaller Aces (A8 Through A2) While Retaining Strong Turn Barrel Equity.',
      'With 62.80% Raw Heads-Up Equity, A9s Ranks Comfortably Inside The Top 15% Of All Holdem Starting Hands.',
    ],
    strategicTakeaways: [
      'Open-Raise A9s From Every Seat In 6-Max Cash Games And From Middle Position Onward In Full-Ring Games.',
      'Defend A9s Against 3-Bets In Position Because Nut Flush Draws And Top Pair Realize Equity Reliably At 100BB.',
      'In Tournaments Under 20BB, A9s Is A High-Value Push-Or-Call Hand Against Cutoff, Button, And Small Blind Shoves.',
    ],
    relatedSlugs: ['a3s-vs-random', 'k7s-vs-random', 'aks-vs-aqo', '88-vs-aqs'],
    faqs: [
      {
        question: 'What Are The Odds Of A9s Against A Random Hand?',
        answer:
          'Ace-Nine Suited Holds 62.80% Equity Against A Random Starting Hand, Winning 60.83% Outright, Losing 35.23%, And Splitting 3.94% Of Runouts.',
      },
      {
        question: 'Should You Open A9s Under The Gun In 6-Max?',
        answer:
          'Yes. Standard 100BB 6-Max GTO Ranges Open A9s At 100% Frequency From Under The Gun Thanks To Its Nut Flush Potential And Strong Ace Blocker.',
      },
      {
        question: 'How Does A9s Compare To ATo?',
        answer:
          'While ATo Holds Slightly More Raw Pair Kicker Strength, A9s Often Outperforms ATo Postflop Because Suited Nut Flush Draws Generate High-EV Semi-Bluffs And Implied Odds.',
      },
    ],
  },
  {
    slug: 'a3s-vs-random',
    game: 'nlhe',
    gameLabel: "No-Limit Hold'em",
    category: 'Hand Vs Random Range',
    handA: 'A3s',
    handAName: 'Ace-Three Suited',
    handACards: 'As,3s',
    handB: 'Random',
    handBName: 'Random Holdem Hand',
    handBCards: '',
    winA: 56.82,
    winB: 38.22,
    tie: 4.96,
    equityA: 59.3,
    equityB: 40.7,
    title: 'A3s Vs Random Hand Poker Odds',
    h1: 'A3s Vs Random Hand Poker Odds And Equity',
    description:
      'Exact A3s Vs Random Hand Odds: Ace-Three Suited Holds 59.30% Equity (56.82% Win, 4.96% Tie) Heads-Up, Covering Wheel Straight And 3-Bet Bluff Strategy.',
    flopHitNotes: [
      'A3s Combines Nut Flush Potential (10.94% Flop Draw) With Hidden Wheel Straight Outs (A-2-3-4-5).',
      'Its High 4.96% Tie Frequency Comes From Ace-High Boards Where The Board Plays Three Kickers Higher Than A Three.',
      'Even On Low Flops Like 5-4-2 Or 6-4-2, A3s Flops A Straight Or Open-Ended Draw Plus Overcard Equity.',
    ],
    strategicTakeaways: [
      'Suited Wheel Aces (A5s, A4s, A3s, A2s) Are Solver Favorites For Polarized 3-Bet And 4-Bet Bluffs Because The Ace Blocks AA And AK.',
      'Open-Raise A3s From Hijack, Cutoff, Button, And Small Blind At 100BB 6-Max Tables.',
      'Exercise Discipline On Ace-High Flops Multiway: Top Pair Weak Kicker Should Check-Call Rather Than Over-Bet Into Stronger Aces.',
    ],
    relatedSlugs: ['a9s-vs-random', 'k5s-vs-random', 'k7s-vs-random', 'aks-vs-76s'],
    faqs: [
      {
        question: 'What Is Ace-Three Suited Equity Against A Random Hand?',
        answer:
          'Ace-Three Suited Holds 59.30% Preflop Equity Against A Random Hand, Winning 56.82% Outright, Losing 38.22%, And Splitting 4.96% Of Pots.',
      },
      {
        question: 'Why Do GTO Solvers 3-Bet A3s So Frequently?',
        answer:
          'A3s Blocks Opponent Pocket Aces And Ace-King, Has Clean Nut Flush And Wheel Straight Playability When Called, And Easily Folds To A 4-Bet Without Wasting High-Value Equity.',
      },
      {
        question: 'Is A3s Better To Play Than A8o?',
        answer:
          'In Deep 100BB Cash Games, Yes. A3s Makes Nut Flushes And Hidden Wheel Straights While A8o Frequently Gets Trapped By Dominated Ace Kickers.',
      },
    ],
  },
  {
    slug: 'q9o-vs-random',
    game: 'nlhe',
    gameLabel: "No-Limit Hold'em",
    category: 'Hand Vs Random Range',
    handA: 'Q9o',
    handAName: 'Queen-Nine Offsuit',
    handACards: 'Qs,9h',
    handB: 'Random',
    handBName: 'Random Holdem Hand',
    handBCards: '',
    winA: 53.86,
    winB: 42.66,
    tie: 3.48,
    equityA: 55.6,
    equityB: 44.4,
    title: 'Q9o Vs Random Hand Poker Odds',
    h1: 'Q9o Vs Random Hand Poker Odds And Equity',
    description:
      'Exact Q9o Vs Random Hand Odds: Queen-Nine Offsuit Holds 55.60% Equity (53.86% Win, 3.48% Tie) Heads-Up, With Button Open And Big Blind Defense Rules.',
    flopHitNotes: [
      'Q9o Holds Slightly Better Straight Connectivity (K-J-T-9 And Q-J-T-9) Than Q8o, Adding Nearly 2% Raw Equity.',
      'Because It Is Offsuit, Q9o Relies Heavily On Flopping Top Pair Or Second Pair And Struggles Against Multi-Street Barrels.',
      'On Queen-High Flops In Late-Position Pots, Q9o Beats Q8 Through Q2 And Serves As A Solid Medium-Strength Bluff Catcher.',
    ],
    strategicTakeaways: [
      'Open Q9o From The Button And Small Blind In 6-Max Cash Games, While Folding From Early And Middle Position.',
      'Defend Q9o In The Big Blind Against Cutoff And Button Opens At Standard 2x To 2.5x Sizing.',
      'Avoid Calling 3-Bets With Q9o Out Of Position Because Offsuit Reverse Implied Odds Bleed Chips Against AQ And KQ.',
    ],
    relatedSlugs: ['q8o-vs-random', 'k7s-vs-random', 'k5s-vs-random', 'a3s-vs-random'],
    faqs: [
      {
        question: 'What Is Q9o Equity Against A Random Holdem Hand?',
        answer:
          'Queen-Nine Offsuit Holds 55.60% Preflop Equity Against One Random Hand, Winning 53.86%, Losing 42.66%, And Tying 3.48% Of Runouts.',
      },
      {
        question: 'Should You Open Q9o From The Cutoff?',
        answer:
          'At Tight 100BB 6-Max Tables, Q9o Is A Marginal Fold Or Low-Frequency Mix From The Cutoff, Becoming A Clear Standard Open On The Button.',
      },
      {
        question: 'How Much Better Is Q9s Than Q9o?',
        answer:
          'Queen-Nine Suited Adds Roughly 2.6% Raw Equity Plus Flush Draw Playability, Making Q9s A Clear Open From The Hijack And Cutoff Where Q9o Folds.',
      },
    ],
  },
  {
    slug: 'k7s-vs-random',
    game: 'nlhe',
    gameLabel: "No-Limit Hold'em",
    category: 'Hand Vs Random Range',
    handA: 'K7s',
    handAName: 'King-Seven Suited',
    handACards: 'Ks,7s',
    handB: 'Random',
    handBName: 'Random Holdem Hand',
    handBCards: '',
    winA: 55.98,
    winB: 40.38,
    tie: 3.64,
    equityA: 57.8,
    equityB: 42.2,
    title: 'K7s Vs Random Hand Poker Odds',
    h1: 'K7s Vs Random Hand Poker Odds And Equity',
    description:
      'Exact K7s Vs Random Hand Odds: King-Seven Suited Holds 57.80% Equity (55.98% Win, 3.64% Tie) Heads-Up, With Cutoff Open And Flush Playability Notes.',
    flopHitNotes: [
      'K7s Flops A King-High Flush Draw 10.94% Of The Time And Pairs A King Or Seven On 32.4% Of Flops.',
      'Its 57.80% Raw Equity Makes It Stronger Than Every Offsuit Queen Below QJo And Every Offsuit Jack Below JTo.',
      'On Seven-High Flops, K7s Holds Top Pair With A King Kicker, A Strong Hand In Late-Position Single-Raised Pots.',
    ],
    strategicTakeaways: [
      'Open-Raise K7s Consistently From The Cutoff, Button, And Small Blind In 6-Max Cash Games And MTTs.',
      'K7s Defends Profitably In The Big Blind Against Virtually Every Single-Raise Sizing Because It Realizes Equity Well Via Flushes.',
      'Against Early-Position 3-Bets, Fold K7s Out Of Position To Avoid Playing Dominated King-High Pots.',
    ],
    relatedSlugs: ['k5s-vs-random', 'a9s-vs-random', 'q9o-vs-random', 'a3s-vs-random'],
    faqs: [
      {
        question: 'What Are The Odds Of K7s Against A Random Hand?',
        answer:
          'King-Seven Suited Holds 57.80% Preflop Equity Against A Random Starting Hand, Winning 55.98% Outright, Losing 40.38%, And Tying 3.64% Of Pots.',
      },
      {
        question: 'Can You Open K7s From The Hijack In 6-Max?',
        answer:
          'K7s Is Borderline From The Hijack At High-Rake Cash Tables (Often Mixed Or Folded), And Becomes A Pure 100% Open From The Cutoff And Button.',
      },
      {
        question: 'How Does K7s Perform In Short-Stack Tournaments?',
        answer:
          'Under 15BB Effective Stacks, K7s Is A Strong Late-Position Jam Thanks To Its King High Card Value, Flush Potential, And Blocker Against Calling Ranges.',
      },
    ],
  },
  {
    slug: 'jj-vs-tt',
    game: 'nlhe',
    gameLabel: "No-Limit Hold'em",
    category: 'Overpair Vs Underpair',
    handA: 'JJ',
    handAName: 'Pocket Jacks',
    handACards: 'Js,Jh',
    handB: 'TT',
    handBName: 'Pocket Tens',
    handBCards: '10d,10c',
    winA: 81.09,
    winB: 18.39,
    tie: 0.52,
    equityA: 81.35,
    equityB: 18.65,
    title: 'JJ Vs TT Poker Odds And Equity',
    h1: 'JJ Vs TT Poker Odds And Preflop Equity',
    description:
      'Exact JJ Vs TT Preflop Odds: Pocket Jacks Dominates Pocket Tens 81.35% To 18.65% (81.09% Win, 0.52% Tie), With Set-Over-Set And Overcard Strategy.',
    flopHitNotes: [
      'Pocket Jacks Is Over A 4-To-1 Favorite Over Pocket Tens, Matching The Classic 81/19 Overpair Domination Ratio.',
      'Because Tens Connects To Slightly Lower Straights (9-8-7-6), TT Retains 18.65% Equity Against JJ.',
      'A Set-Over-Set Cooler Occurs On Roughly 1.4% Of Flops Where Both A Jack And A Ten Appear Together.',
    ],
    strategicTakeaways: [
      'Both Hands Are Strong Opens And 3-Bets, Making JJ Vs TT A Frequent Late-Position Clash In 6-Max Cash And Tournaments.',
      'On Low Dry Boards (8-5-2), Both Hands Hold Strong Overpairs, Allowing Pocket Jacks To Extract Heavy Multi-Street Value.',
      'At 20BB To 30BB Tournament Depth, Pocket Tens Frequently Stacks Off Against Button 3-Bets And Must Accept Occasional Coolers Against JJ+.',
    ],
    relatedSlugs: ['kk-vs-qq', 'aa-vs-kk', 'jj-vs-aks', 'tt-vs-aks'],
    faqs: [
      {
        question: 'What Are The Odds Of JJ Vs TT Preflop?',
        answer:
          'Pocket Jacks Wins 81.09% Of All Five-Card Runouts, Pocket Tens Wins 18.39%, And 0.52% Tie, Giving JJ 81.35% Total Equity Against 18.65% For TT.',
      },
      {
        question: 'How Often Does Pocket Tens Beat Pocket Jacks?',
        answer:
          'Pocket Tens Wins Outright 18.39% Of The Time, Or Roughly 1 In Every 5.4 Preflop All-In Showdowns.',
      },
      {
        question: 'Should Pocket Tens Fold To A 4-Bet At 100BB?',
        answer:
          'Against Tight Early-Position 4-Bets Out Of Position, TT Can Fold; In Position Against Cutoff Or Button 4-Bets, TT Frequently Calls To Set-Mine And Catch Bluffs.',
      },
    ],
  },
  {
    slug: '99-vs-ako',
    game: 'nlhe',
    gameLabel: "No-Limit Hold'em",
    category: 'Classic Coinflip',
    handA: '99',
    handAName: 'Pocket Nines',
    handACards: '9s,9h',
    handB: 'AKo',
    handBName: 'Ace-King Offsuit',
    handBCards: 'Ad,Kc',
    winA: 55.57,
    winB: 44.13,
    tie: 0.3,
    equityA: 55.72,
    equityB: 44.28,
    title: '99 Vs AKo Poker Odds And Equity',
    h1: '99 Vs AKo Poker Odds And Preflop Equity',
    description:
      'Exact 99 Vs AKo Preflop Odds: Pocket Nines Leads Ace-King Offsuit 55.72% To 44.28% (55.57% Win, 0.30% Tie), With Tournament Flip And Flop Analysis.',
    flopHitNotes: [
      'Unlike QQ Through TT, Pocket Nines Does Not Block AKo Broadway Straight Outs, Dropping 99 Roughly 1.1% Below JJ Against AKo.',
      'Even So, Pocket Nines Remains A Clear 55.72% Favorite Over Offsuit Ace-King When Run Out Preflop.',
      'An Ace Or King Appears On 32.4% Of Flops, While Pocket Nines Flops Top Or Middle Set 11.76% Of The Time.',
    ],
    strategicTakeaways: [
      'At 20BB To 35BB Tournament Stacks, Pocket Nines Is A Prime 3-Bet Shove Or Call Because It Leads Offsuit Big Slick And Crushes Smaller Pairs.',
      'In 100BB Cash Games, Flat-Calling A 3-Bet With 99 In Position Outperforms 4-Betting Into Overpairs.',
      'On Boards With Multiple Broadway Overcards (Q-J-4), 99 Transitions Quickly Into Check-Fold Or One-Street Bluff-Catching Mode.',
    ],
    relatedSlugs: ['jj-vs-ako', 'ako-vs-22', '88-vs-aqs', 'tt-vs-aks'],
    faqs: [
      {
        question: 'Who Is The Favorite In 99 Vs AKo?',
        answer:
          'Pocket Nines Is The Favorite With 55.72% Equity (55.57% Win, 0.30% Tie) Compared To 44.28% Equity (44.13% Win) For Ace-King Offsuit.',
      },
      {
        question: 'Why Does 99 Have Slightly Less Equity Against AKo Than JJ Does?',
        answer:
          'Pocket Jacks Blocks AKo Straight Outs On Q-T-X Boards, Whereas Pocket Nines Leaves All Four Queens, Jacks, And Tens Live For AKo Broadway Straights.',
      },
      {
        question: 'Should I Call An All-In With 99 In A Tournament?',
        answer:
          'Against Late-Position Or Short-Stack Shoves Containing AKo, AQo, KQs, And Smaller Pairs, Calling With 99 Is Typically Strongly Positive EV Unless Extreme ICM Bubble Pressure Applies.',
      },
    ],
  },
  {
    slug: '88-vs-aqs',
    game: 'nlhe',
    gameLabel: "No-Limit Hold'em",
    category: 'Classic Coinflip',
    handA: '88',
    handAName: 'Pocket Eights',
    handACards: '8s,8h',
    handB: 'AQs',
    handBName: 'Ace-Queen Suited',
    handBCards: 'Ad,Qd',
    winA: 52.7,
    winB: 46.94,
    tie: 0.36,
    equityA: 52.88,
    equityB: 47.12,
    title: '88 Vs AQs Poker Odds And Equity',
    h1: '88 Vs AQs Poker Odds And Preflop Equity',
    description:
      'Exact 88 Vs AQs Preflop Odds: Pocket Eights Leads Ace-Queen Suited 52.88% To 47.12% (52.70% Win, 0.36% Tie) In A Classic Medium-Pair Coinflip.',
    flopHitNotes: [
      'AQs Holds Six Live Overcards Plus Full Suited Flush Potential And Unblocked Broadway Straight Outs, Closing The Gap To 52.88% Vs 47.12%.',
      'On Nine-High Through King-High Flops Without An Ace Or Queen, 88 Still Leads Yet Faces Intense Turn Barrel Pressure From AQs Overcards And Backdoor Draws.',
      'If 88 Shares One Suit With AQs, Pocket Eights Equity Increases Roughly 2.2% Due To Flush Removal.',
    ],
    strategicTakeaways: [
      'AQs Realizes Its 47.12% Equity Much More Smoothly Postflop Than 88 Does, Especially In Deep-Stacked 3-Bet Pots.',
      'Pocket Eights Should Prioritize Set-Mining In Position At 100BB And Open-Shoving Or Re-Jamming At 15BB To 25BB MTT Stacks.',
      'On Low Rainbow Flops (7-4-2), 88 Jumps Above 72% Equity And Should Bet For Protection Against AQs Six Overcards.',
    ],
    relatedSlugs: ['99-vs-ako', 'tt-vs-aks', 'aks-vs-aqo', 'ako-vs-22'],
    faqs: [
      {
        question: 'What Are The Odds Of 88 Vs AQs Preflop?',
        answer:
          'With Non-Overlapping Suits, Pocket Eights Wins 52.70% Of Runouts, Ace-Queen Suited Wins 46.94%, And 0.36% Tie, Creating A 52.88% To 47.12% Split.',
      },
      {
        question: 'Why Is 88 Vs AQs Closer Than 99 Vs AKo?',
        answer:
          'Being Suited Adds Nearly 3% Equity For AQs Compared To Offsuit AKo, Compressing The Matchup From 56/44 Down To 53/47.',
      },
      {
        question: 'How Should 88 Play Postflop Against AQs On A J-6-3 Two-Tone Flop?',
        answer:
          'Check-Call Or Bet Small Depending On Position. 88 Still Leads Unimproved AQs, So Avoiding Bloating The Pot Preserves Showdown Value.',
      },
    ],
  },
  {
    slug: 'aakk-vs-jt98-plo4',
    game: 'plo4',
    gameLabel: '4-Card Pot-Limit Omaha (PLO4)',
    category: 'Pot-Limit Omaha (PLO4)',
    handA: 'AAKKds',
    handAName: 'AAKK Double-Suited',
    handACards: 'As,Ah,Ks,Kh',
    handB: 'JT98ds',
    handBName: 'JT98 Double-Suited',
    handBCards: 'Jd,10c,9d,8c',
    winA: 61.48,
    winB: 38.51,
    tie: 0.01,
    equityA: 61.49,
    equityB: 38.51,
    title: 'AAKK Vs JT98 PLO4 Odds And Equity',
    h1: 'AAKK Vs JT98 PLO4 Odds And Preflop Equity',
    description:
      'Exact PLO4 AAKKds Vs JT98ds Odds: Double-Suited Aces-Kings Holds 61.49% Equity Against Unblocked JT98ds (38.51%), Showing PLO4 Equity Compression.',
    flopHitNotes: [
      'Even The Absolute Best PLO4 Starting Hand (AAKK Double-Suited) Holds Only 61.49% Equity Against An Unblocked Prime Rundown JT98ds (And Drops To 56.0% If AAKK Is Rainbow).',
      'By Contrast, Pocket Aces Holds 79.36% Against JTs In Holdem, Demonstrating Severe PLO4 Preflop Equity Compression.',
      'When AAKKds Dominates Both Suits Of JT98ds, AAKKds Equity Climbs To Roughly 66.5%; Against Generic AAxx Rainbow, JT98ds Reaches 46.4% To 50.2%.',
    ],
    strategicTakeaways: [
      'Always 3-Bet And 4-Bet AAKK Double-Suited Preflop In PLO4 To Lower The Stack-To-Pot Ratio (SPR) And Realize Its 61.5% Advantage Cleanly.',
      'JT98 Double-Suited Thrives At Deep 100BB+ SPRs Because It Flops 13-Out To 20-Out Wrap Draws Plus Two-Pair Combos That Crush Bare Overpairs.',
      'Compare PLO4 And PLO5 Equity Compression In Our Dedicated PLO4 Vs PLO5 Benchmark Guide.',
    ],
    relatedSlugs: ['aakk-vs-random-plo4', 'aa-vs-jts', 'aa-vs-kk', 'aks-vs-jts'],
    faqs: [
      {
        question: 'What Are The Odds Of AAKK Double-Suited Vs JT98 Double-Suited In PLO4?',
        answer:
          'When Suits Do Not Overlap (As Ah Ks Kh Vs Jd Tc 9d 8c), AAKK Double-Suited Holds 61.49% Equity Against 38.51% For JT98 Double-Suited, With Virtually Zero Ties (0.01%).',
      },
      {
        question: 'How Does Rainbow AAKK Or Generic AAxx Perform Against JT98ds In PLO4?',
        answer:
          'Rainbow AAKK Drops To Roughly 56.0% Equity Against JT98ds, And Unconnected Rainbow Aces Like AA72r Actually Fall Slightly Behind JT98ds At 49.8% Vs 50.2%.',
      },
      {
        question: 'Why Are Preflop Equities So Much Closer In PLO4 Than Holdem?',
        answer:
          'Every PLO4 Hand Contains 6 Two-Card Combinations That Must Pair With Exactly Three Board Cards, Allowing Connected Rundowns Like JT98ds To Hit Massive Wraps, Flushes, And Two-Pair Combinations.',
      },
    ],
  },
  {
    slug: 'aakk-vs-random-plo4',
    game: 'plo4',
    gameLabel: '4-Card Pot-Limit Omaha (PLO4)',
    category: 'Pot-Limit Omaha (PLO4)',
    handA: 'AAKKds',
    handAName: 'AAKK Double-Suited',
    handACards: 'As,Ah,Ks,Kh',
    handB: 'Random PLO4',
    handBName: 'Random 4-Card PLO Hand',
    handBCards: '',
    winA: 68.6,
    winB: 31.0,
    tie: 0.4,
    equityA: 68.8,
    equityB: 31.2,
    title: 'AAKK Vs Random PLO4 Odds And Equity',
    h1: 'AAKK Vs Random Hand PLO4 Odds And Equity',
    description:
      'Exact PLO4 AAKKds Vs Random Hand Odds: The Best Starting Hand In 4-Card PLO Holds 68.80% Equity (68.60% Win, 0.40% Tie), Compared To 85.2% For Holdem AA.',
    flopHitNotes: [
      'AAKK Double-Suited Is The #1 Ranked Hand Out Of All 270,725 PLO4 Starting Hands, Yet Holds Only 68.80% Equity Against A Single Random Opponent.',
      'By Comparison, Pocket Aces In No-Limit Holdem Holds 85.2% Against A Random Hand, A Massive 16.4-Point Equity Compression Gap.',
      'Dual Ace-High Nut Flush Draws Plus Top-Set Potential Give AAKKds Exceptional Multi-Street Playability Even When Overpairs Get Cracked.',
    ],
    strategicTakeaways: [
      'Build Pots Preflop With AAKKds To Push Stack-To-Pot Ratios Below 2.5 Where Single-Pair Overpairs Plus Nut Flush Draws Stack Off Profitably.',
      'Never Overplay Unimproved Single-Pair Aces On Coordinated Low Boards At Deep 100BB+ SPRs Against Multiway Action.',
      'Maintain A 65 To 85 Buy-In Bankroll For PLO4 (And 100 To 130 Buy-Ins For PLO5) To Absorb 120 To 145 BB/100 Variance.',
    ],
    relatedSlugs: ['aakk-vs-jt98-plo4', 'aa-vs-kk', 'aa-vs-72o', 'a9s-vs-random'],
    faqs: [
      {
        question: 'What Is The Best Starting Hand In 4-Card PLO And Its Equity Vs Random?',
        answer:
          'AAKK Double-Suited Is The Strongest Starting Hand In 4-Card Pot-Limit Omaha, Holding 68.80% Equity (68.60% Win, 0.40% Tie) Against A Random 4-Card Hand.',
      },
      {
        question: 'How Does AAKKds In PLO4 Compare To AAKKQds In PLO5?',
        answer:
          'Adding A Fifth Hole Card In PLO5 Compresses Even The Best Hand Further: AAKKQ Double-Suited Drops From 68.8% In PLO4 Down To 64.2% Against A Random PLO5 Hand.',
      },
      {
        question: 'Can I Calculate Custom PLO4 And PLO5 Matchups Free?',
        answer:
          'Yes. Click Launch In Odds Calculator To Open AAKK Double-Suited Directly In The Free Smarter.Poker Multi-Variant Odds Engine Supporting PLO4, PLO5, And PLO6.',
      },
    ],
  },
];

export const TOOL_HAND_MATCHUPS = Object.freeze(
  RAW_MATCHUPS.map((item) =>
    Object.freeze({
      ...item,
      path: toolMatchupPath(item.slug),
      calculatorUrl: buildOddsCalculatorHref({
        game: item.game,
        handACards: item.handACards,
        handBCards: item.handBCards,
      }),
    }),
  ),
);

const MATCHUPS_BY_SLUG = new Map(TOOL_HAND_MATCHUPS.map((m) => [m.slug, m]));

export function getToolHandMatchup(slug) {
  if (!slug || typeof slug !== 'string') return null;
  return MATCHUPS_BY_SLUG.get(slug.trim().toLowerCase()) || null;
}
