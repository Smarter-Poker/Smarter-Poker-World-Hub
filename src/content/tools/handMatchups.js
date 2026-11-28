/**
 * PROGRAMMATIC HAND-VS-HAND POKER ODDS & EQUITY REGISTRY
 * ======================================================
 * Authoritative verified equity dataset powering the 60 static programmatic
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
  {
    slug: 'aa-vs-jj',
    game: 'nlhe',
    gameLabel: "No-Limit Hold'em",
    category: 'Overpair Vs Underpair',
    handA: 'AA',
    handAName: 'Pocket Aces',
    handACards: 'As,Ah',
    handB: 'JJ',
    handBName: 'Pocket Jacks',
    handBCards: 'Jd,Jc',
    winA: 80.3,
    winB: 19.38,
    tie: 0.32,
    equityA: 80.46,
    equityB: 19.54,
    title: 'AA Vs JJ Poker Odds And Equity',
    h1: 'AA Vs JJ Poker Odds And Preflop Equity',
    description:
      'Exact AA Vs JJ Preflop Odds: Pocket Aces Leads Pocket Jacks 80.46% To 19.54% (80.30% Win, 0.32% Tie), With Set-Mining And 4-Bet Strategy.',
    flopHitNotes: [
      'Pocket Jacks Flops A Set 11.76% Of The Time, Flipping Pocket Aces Into A Deep Underdog Requiring One Of Two Remaining Aces.',
      'Pocket Jacks Holds Roughly 1.7% More Equity Against AA Than KK Does Because Jacks Can Make Independent Middle Straights Like Q-T-9-8.',
      'On Jack-Free High Flops, Pocket Aces Maintains Over 90% Equity Heading Into The Turn And River.',
    ],
    strategicTakeaways: [
      'At 100BB Cash Depth, Pocket Jacks Prefers Flatting In Position Against Tight Early-Position 4-Bets Rather Than Jamming Directly Into AA And KK.',
      'Pocket Aces Should Use Balanced Small-To-Medium Flop C-Bets On Dry Low Textures To Extract Three Streets From Pocket Jacks.',
      'In Short-Stack 25BB To 35BB Tournament Battles, Pocket Jacks Is Frequently Forced To Stack Off Preflop Against Aggressive Late-Position Ranges.',
    ],
    relatedSlugs: ['aa-vs-kk', 'aa-vs-qq', 'kk-vs-jj', 'qq-vs-jj'],
    faqs: [
      {
        question: 'What Are The Odds Of AA Vs JJ Preflop?',
        answer:
          'Pocket Aces Wins 80.30% Of Runouts, Pocket Jacks Wins 19.38%, And 0.32% Split, Giving AA 80.46% Total Equity Against 19.54% For JJ.',
      },
      {
        question: 'How Often Does Pocket Jacks Crack Pocket Aces?',
        answer:
          'Pocket Jacks Wins Outright 19.38% Of All-In Preflop Showdowns, Nearly 1 In Every 5 Times, Mainly By Making A Set Or Four-Card Straight Or Flush.',
      },
      {
        question: 'Should Pocket Jacks Fold To A 4-Bet At 100BB?',
        answer:
          'Against Very Tight Under-The-Gun 4-Bet Ranges, Folding Or Calling In Position To Set-Mine Beats 5-Bet Jamming Into Pocket Aces And Pocket Kings.',
      },
    ],
  },
  {
    slug: 'kk-vs-jj',
    game: 'nlhe',
    gameLabel: "No-Limit Hold'em",
    category: 'Overpair Vs Underpair',
    handA: 'KK',
    handAName: 'Pocket Kings',
    handACards: 'Ks,Kh',
    handB: 'JJ',
    handBName: 'Pocket Jacks',
    handBCards: 'Jd,Jc',
    winA: 80.76,
    winB: 18.86,
    tie: 0.38,
    equityA: 80.95,
    equityB: 19.05,
    title: 'KK Vs JJ Poker Odds And Equity',
    h1: 'KK Vs JJ Poker Odds And Preflop Equity',
    description:
      'Exact KK Vs JJ Preflop Odds: Pocket Kings Leads Pocket Jacks 80.95% To 19.05% (80.76% Win, 0.38% Tie), With Flop Set Odds And 3-Bet Strategy.',
    flopHitNotes: [
      'Pocket Kings Holds A Classic 4-To-1 Overpair Advantage Over Pocket Jacks Across Unblocked Suits.',
      'An Ace On The Flop (22.5% Frequency) Forces Both Hands Into Cautious Bluff-Catching Lines, Yet KK Still Dominates JJ By Over 84%.',
      'When Pocket Jacks Flops Top Or Middle Set (11.76%), KK Needs One Of Two Remaining Kings Or Running Straight Cards.',
    ],
    strategicTakeaways: [
      'Pocket Kings Extracts High Expected Value By 3-Betting And 4-Betting Aggressively Against Wide Cutoff And Button Ranges Packed With JJ.',
      'On Low Rainbow Boards In 3-Bet Pots, Pocket Kings Can Comfortably Bet Three Streets For Value Against Underpairs Like JJ And TT.',
      'Pocket Jacks Should Control Pot Size On Queen-High And Ace-High Runouts Where Stronger Pairs And Top Pairs Dominate.',
    ],
    relatedSlugs: ['kk-vs-qq', 'aa-vs-jj', 'qq-vs-jj', 'jj-vs-tt'],
    faqs: [
      {
        question: 'What Are The Exact Preflop Odds For KK Vs JJ?',
        answer:
          'Pocket Kings Wins 80.76% Of Runouts, Pocket Jacks Wins 18.86%, And 0.38% Tie, Producing An 80.95% To 19.05% Equity Split.',
      },
      {
        question: 'Does JJ Have Better Odds Against KK Than QQ Does?',
        answer:
          'Slightly. Pocket Jacks Holds 19.05% Equity Against KK Compared To 18.28% For QQ Because Jacks Makes More Unblocked Middle Straights.',
      },
      {
        question: 'How Should KK Play Against JJ On An Ace-High Flop?',
        answer:
          'Use Small Continuation Bets Or Check Back For Pot Control Because Both Ranges Contain Ace-X Hands While KK Still Easily Beats JJ And QQ.',
      },
    ],
  },
  {
    slug: 'qq-vs-jj',
    game: 'nlhe',
    gameLabel: "No-Limit Hold'em",
    category: 'Overpair Vs Underpair',
    handA: 'QQ',
    handAName: 'Pocket Queens',
    handACards: 'Qs,Qh',
    handB: 'JJ',
    handBName: 'Pocket Jacks',
    handBCards: 'Jd,Jc',
    winA: 81.1,
    winB: 18.53,
    tie: 0.37,
    equityA: 81.28,
    equityB: 18.72,
    title: 'QQ Vs JJ Poker Odds And Equity',
    h1: 'QQ Vs JJ Poker Odds And Preflop Equity',
    description:
      'Exact QQ Vs JJ Preflop Odds: Pocket Queens Dominates Pocket Jacks 81.28% To 18.72% (81.10% Win, 0.37% Tie), With Overcard And 4-Bet Guidance.',
    flopHitNotes: [
      'Pocket Queens Enjoys An 81.28% To 18.72% Edge Over Pocket Jacks, Matching The Standard 81/19 Adjacent Overpair Ratio.',
      'An Ace Or King Falls On Roughly 32.4% Of Flops, Reducing Both Hands To Medium-Strength Showdown Catchers While Keeping QQ Ahead.',
      'A Set-Over-Set Cooler Where Both A Queen And A Jack Hit The Flop Occurs On Roughly 1.4% Of Boards.',
    ],
    strategicTakeaways: [
      'QQ Vs JJ Is One Of The Most Common 3-Bet And 4-Bet Clashes In Late-Position 6-Max Cash And Tournament Play.',
      'At 25BB To 40BB Tournament Stacks, Pocket Queens Happily Calls Or Re-Jams Over Button And Blind Shoves Containing Pocket Jacks.',
      'On Low Dry Flops (9-6-2), Pocket Queens Should Bet Steadily For Value Because Pocket Jacks Rarely Folds An Overpair In 3-Bet Pots.',
    ],
    relatedSlugs: ['kk-vs-qq', 'aa-vs-qq', 'kk-vs-jj', 'jj-vs-tt'],
    faqs: [
      {
        question: 'What Are The Odds Of Pocket Queens Beating Pocket Jacks?',
        answer:
          'Pocket Queens Wins 81.10% Of All Five-Card Runouts, Pocket Jacks Wins 18.53%, And 0.37% End In A Split Pot, Giving QQ 81.28% Total Equity.',
      },
      {
        question: 'How Often Does JJ Beat QQ All-In Preflop?',
        answer:
          'Pocket Jacks Wins Outright 18.53% Of The Time, Or Roughly Once Every 5.4 All-In Preflop Showdowns.',
      },
      {
        question: 'Why Do Both QQ And JJ Slow Down On Ace-King Flops?',
        answer:
          'Because Both Preflop 3-Bet And 4-Bet Ranges Are Heavily Weighted Toward AK, AQ, And AA, Forcing Queens And Jacks Into Defensive Check-Call Modes.',
      },
    ],
  },
  {
    slug: 'tt-vs-99',
    game: 'nlhe',
    gameLabel: "No-Limit Hold'em",
    category: 'Overpair Vs Underpair',
    handA: 'TT',
    handAName: 'Pocket Tens',
    handACards: '10s,10h',
    handB: '99',
    handBName: 'Pocket Nines',
    handBCards: '9d,9c',
    winA: 81.19,
    winB: 18.35,
    tie: 0.46,
    equityA: 81.42,
    equityB: 18.58,
    title: 'TT Vs 99 Poker Odds And Equity',
    h1: 'TT Vs 99 Poker Odds And Preflop Equity',
    description:
      'Exact TT Vs 99 Preflop Odds: Pocket Tens Dominates Pocket Nines 81.42% To 18.58% (81.19% Win, 0.46% Tie), With Middle-Pair Cooler Strategy.',
    flopHitNotes: [
      'Pocket Tens Maintains A Strong 81.42% To 18.58% Advantage Over Pocket Nines Across Non-Overlapping Suits.',
      'Because Four Overcards (A, K, Q, J) Can Hit The Flop Over 60% Of The Time, Both Medium Pairs Frequently Play Small Pots Postflop.',
      'On Low Rainbow Flops Like 8-5-2, Both Hands Hold Overpairs, Creating Prime Three-Street Value Spots For Pocket Tens.',
    ],
    strategicTakeaways: [
      'In 20BB To 30BB Tournament Play, Pocket Tens Is A High-EV Re-Jam Over Late-Position Opens Because It Crushes 99 Through 22.',
      'At 100BB Cash Depth, Pocket Nines Should Generally Call 3-Bets In Position Rather Than 4-Betting Into Dominated Pair Ranges Like TT+.',
      'Keep Bet Sizes Measured On Single-Overcard Flops Where Pocket Nines Will Still Call One Or Two Streets As A Bluff-Catcher.',
    ],
    relatedSlugs: ['jj-vs-tt', '99-vs-ako', 'tt-vs-aks', 'tt-vs-ako'],
    faqs: [
      {
        question: 'What Are The Exact Odds Of TT Vs 99 Preflop?',
        answer:
          'Pocket Tens Wins 81.19% Of Runouts, Pocket Nines Wins 18.35%, And 0.46% Tie, Giving TT 81.42% Total Equity Against 18.58% For 99.',
      },
      {
        question: 'How Often Does Pocket Nines Flop A Set Against Pocket Tens?',
        answer:
          'Like Any Pocket Pair, Pocket Nines Flops A Set Or Quads 11.76% Of The Time, Roughly Once Every 8.5 Flops.',
      },
      {
        question: 'Is TT Vs 99 An Automatic Stack-Off At 100BB?',
        answer:
          'No. At 100BB Cash Stacks, Both Hands Usually Navigate Single-Raised Or 3-Bet Pots Postflop Unless Board Textures Pair Low Cards.',
      },
    ],
  },
  {
    slug: 'aa-vs-ako',
    game: 'nlhe',
    gameLabel: "No-Limit Hold'em",
    category: 'Dominated Matchup',
    handA: 'AA',
    handAName: 'Pocket Aces',
    handACards: 'As,Ah',
    handB: 'AKo',
    handBName: 'Ace-King Offsuit',
    handBCards: 'Ad,Kc',
    winA: 91.93,
    winB: 6.81,
    tie: 1.26,
    equityA: 92.56,
    equityB: 7.44,
    title: 'AA Vs AKo Poker Odds And Equity',
    h1: 'AA Vs AKo Poker Odds And Preflop Equity',
    description:
      'Exact AA Vs AKo Preflop Odds: Pocket Aces Crushes Ace-King Offsuit 92.56% To 7.44% (91.93% Win, 1.26% Tie), Showing Why Offsuit AK Fears AA.',
    flopHitNotes: [
      'Without Suited Flush Equity, Ace-King Offsuit Plummets To Just 7.44% Total Equity Against Pocket Aces, Winning Only 6.81% Outright.',
      'Even When A King Hits The Flop, AKo Still Trails AA And Must Catch Running Kings Or Two-Pair-Over-Aces To Survive.',
      'Nearly 1.26% Of Runouts End In A Split Pot Via Four-Card Flushes Or Broadway Straight Boards.',
    ],
    strategicTakeaways: [
      'Being Offsuit Costs Ace-King Five Full Percentage Points Against Pocket Aces Compared To AKs (12.45% Down To 7.44%).',
      'At Deep 200BB Cash Stacks, Flatting Early-Position 4-Bets In Position With AKo Protects Your Stack From Running Headfirst Into AA.',
      'When Holding AA On An Ace-High Flop In A 4-Bet Pot, Trap Frequently To Let AKo Value-Bet Top Pair Top Kicker.',
    ],
    relatedSlugs: ['aa-vs-aks', 'kk-vs-ako', 'aa-vs-kk', 'aa-vs-aqs'],
    faqs: [
      {
        question: 'What Are The Odds Of AA Vs AKo Preflop?',
        answer:
          'Pocket Aces Wins 91.93% Of Boards, Ace-King Offsuit Wins 6.81%, And 1.26% Split, Giving AA 92.56% Total Equity Against 7.44% For AKo.',
      },
      {
        question: 'How Can AKo Beat Pocket Aces?',
        answer:
          'AKo Must Catch Two Kings For Trips Or A Full House, Complete A Q-J-T Broadway Straight, Or Make A Four-Card Running Flush On The Board.',
      },
      {
        question: 'Why Does AKo Have So Much Less Equity Than AKs Against AA?',
        answer:
          'Without Two Suited Cards, AKo Loses Virtually All Flush Outs Against AA, Dropping From 12.45% (AKs) Down To 7.44% (AKo).',
      },
    ],
  },
  {
    slug: 'aa-vs-aqs',
    game: 'nlhe',
    gameLabel: "No-Limit Hold'em",
    category: 'Dominated Matchup',
    handA: 'AA',
    handAName: 'Pocket Aces',
    handACards: 'As,Ah',
    handB: 'AQs',
    handBName: 'Ace-Queen Suited',
    handBCards: 'Ad,Qd',
    winA: 86.78,
    winB: 11.97,
    tie: 1.25,
    equityA: 87.41,
    equityB: 12.59,
    title: 'AA Vs AQs Poker Odds And Equity',
    h1: 'AA Vs AQs Poker Odds And Preflop Equity',
    description:
      'Exact AA Vs AQs Preflop Odds: Pocket Aces Leads Ace-Queen Suited 87.41% To 12.59% (86.78% Win, 1.25% Tie), With Flush And Trap Strategy.',
    flopHitNotes: [
      'AQs Retains 12.59% Equity Against Unblocked Pocket Aces Thanks Primarily To Live Flush Draws (10.94% Flop Rate) And Occasional Running Queens.',
      'On Queen-High Flops, Pocket Aces Still Leads Top Pair AQs By Nearly 80% Equity Because AQs Has Only Two Live Queens And One Ace Left.',
      'A Four-Card Straight Or Flush Board Produces The 1.25% Tie Frequency.',
    ],
    strategicTakeaways: [
      'AQs Is A Prime 3-Bet Call In Position At 100BB, Rarely Wanting To 5-Bet Stack Off Against Tight Ranges Weighted Toward AA And KK.',
      'Pocket Aces Should Value-Bet Cleanly On Queen-High And Low Boards While Mixing Slow-Plays On Ace-High Dry Textures.',
      'If One Of The Aces Blocks AQs Flush Suit, AQs Equity Drops Roughly 1.2% Closer To 11.4%.',
    ],
    relatedSlugs: ['aa-vs-aks', 'aa-vs-ako', 'kk-vs-aqs', 'qq-vs-aqs'],
    faqs: [
      {
        question: 'How Much Equity Does AQs Have Against Pocket Aces?',
        answer:
          'With Unblocked Suits, Ace-Queen Suited Holds 12.59% Equity (11.97% Win, 1.25% Tie) Against 87.41% Equity For Pocket Aces.',
      },
      {
        question: 'Does AQs Have Slightly Better Odds Against AA Than AKs?',
        answer:
          'They Are Virtually Identical (12.59% For AQs Vs 12.45% For AKs) Because Both Rely Primarily On Live Flushes And Running Kicker Trips.',
      },
      {
        question: 'How Should AQs Play Facing A Cold 4-Bet?',
        answer:
          'At 100BB Cash Games, Calling In Position Or Folding Out Of Position Against Early-Position 4-Bets Avoids Severe Domination By AA And AK.',
      },
    ],
  },
  {
    slug: 'kk-vs-aqs',
    game: 'nlhe',
    gameLabel: "No-Limit Hold'em",
    category: 'Overpair Vs Overcard',
    handA: 'KK',
    handAName: 'Pocket Kings',
    handACards: 'Ks,Kh',
    handB: 'AQs',
    handBName: 'Ace-Queen Suited',
    handBCards: 'Ad,Qd',
    winA: 67.63,
    winB: 32.0,
    tie: 0.37,
    equityA: 67.81,
    equityB: 32.19,
    title: 'KK Vs AQs Poker Odds And Equity',
    h1: 'KK Vs AQs Poker Odds And Preflop Equity',
    description:
      'Exact KK Vs AQs Preflop Odds: Pocket Kings Leads Ace-Queen Suited 67.81% To 32.19% (67.63% Win, 0.37% Tie), With Ace-Flop And 4-Bet Math.',
    flopHitNotes: [
      'AQs Holds Three Clean Ace Outs Plus Full Flush Potential, Giving It 32.19% Equity Against Unblocked Pocket Kings.',
      'An Ace Appears On 22.55% Of Flops; Whenever The Flop Misses An Ace And Flush Draw, Pocket Kings Jumps Above 83% Equity.',
      'Unlike AKs Against KK, AQs Does Not Share A King With KK, Keeping Three Live Queens That Still Trail Kings Unless Two Queens Fall.',
    ],
    strategicTakeaways: [
      'Pocket Kings Is Over A 2-To-1 Favorite Against AQs, Reinforcing Why KK Always Wants To Build Big Pots Preflop.',
      'AQs Plays Much Better As A Flat Call Against 3-Bets Or 4-Bets In Position Than As A 5-Bet All-In Into KK And AA.',
      'On Queen-High Flops, Pocket Kings Extracts Maximum Value Because AQs Top Pair Top Kicker Calls Multiple Barrels.',
    ],
    relatedSlugs: ['kk-vs-aks', 'kk-vs-ako', 'qq-vs-aqs', 'aa-vs-aqs'],
    faqs: [
      {
        question: 'What Are The Odds Of KK Vs AQs Preflop?',
        answer:
          'Pocket Kings Wins 67.63% Of Runouts, Ace-Queen Suited Wins 32.00%, And 0.37% Tie, Giving KK 67.81% Equity Against 32.19% For AQs.',
      },
      {
        question: 'Why Does KK Lead AQs By More Than It Leads AKs?',
        answer:
          'Because AKs Removes Two Kings From The Deck And Has Slightly Better Broadway Connectivity, Holding 34.31% Against KK Versus 32.19% For AQs.',
      },
      {
        question: 'How Often Does AQs Hit An Ace Against Pocket Kings?',
        answer:
          'With Three Unseen Aces In The Deck, At Least One Ace Appears By The River Roughly 29.7% Of The Time.',
      },
    ],
  },
  {
    slug: 'qq-vs-aqs',
    game: 'nlhe',
    gameLabel: "No-Limit Hold'em",
    category: 'Dominated Matchup',
    handA: 'QQ',
    handAName: 'Pocket Queens',
    handACards: 'Qs,Qh',
    handB: 'AQs',
    handBName: 'Ace-Queen Suited',
    handBCards: 'Ad,Qd',
    winA: 65.19,
    winB: 33.63,
    tie: 1.18,
    equityA: 65.78,
    equityB: 34.22,
    title: 'QQ Vs AQs Poker Odds And Equity',
    h1: 'QQ Vs AQs Poker Odds And Preflop Equity',
    description:
      'Exact QQ Vs AQs Preflop Odds: Pocket Queens Leads Ace-Queen Suited 65.78% To 34.22% (65.19% Win, 1.18% Tie), Mirroring The Classic KK Vs AKs Split.',
    flopHitNotes: [
      'Pocket Queens Dominates The Queen In AQs, Reducing AQs To Three Live Aces Plus Flush Draws And Producing A 65.78% To 34.22% Split.',
      'This Matchup Closely Mirrors KK Vs AKs (65.69% Vs 34.31%) Because Both Pairs Block One Of The Opponent Two Cards.',
      'On Queen-High Flops, Pocket Queens Flops Top Set While AQs Hits Top Pair Top Kicker, Creating A Massive Cooler.',
    ],
    strategicTakeaways: [
      'Pocket Queens Is Nearly A 2-To-1 Favorite Over AQs, Making QQ A Strong Value 4-Bet Against Late-Position 3-Bettors.',
      'In Tournaments Under 30BB, AQs Still Shoves Profitably Over Wide Opens Because Fold Equity Combines With 34.2% Equity Even When Dominated By QQ.',
      'If Pocket Queens Shares One Suit With AQs, QQ Equity Climbs Roughly 1.5% Closer To 67.3%.',
    ],
    relatedSlugs: ['kk-vs-aks', 'qq-vs-aks', 'jj-vs-aqs', 'kk-vs-aqs'],
    faqs: [
      {
        question: 'What Are The Odds Of QQ Vs AQs All-In Preflop?',
        answer:
          'Pocket Queens Wins 65.19% Of Runouts, Ace-Queen Suited Wins 33.63%, And 1.18% Tie, Yielding 65.78% Equity For QQ Against 34.22% For AQs.',
      },
      {
        question: 'Why Is QQ Vs AQs So Similar To KK Vs AKs?',
        answer:
          'In Both Matchups The Pocket Pair Blocks One Card Of The Suited Broadway Hand, Leaving Only Three Live Ace Outs Plus Flush Equity.',
      },
      {
        question: 'Should AQs Call A 4-Bet Jam Against A Range Containing QQ?',
        answer:
          'Against Tight Early-Position Ranges (QQ+, AK), AQs Is Heavily Dominated And Usually Folds; Against Loose Late-Position Short-Stack Jams, AQs Calls.',
      },
    ],
  },
  {
    slug: 'jj-vs-aqs',
    game: 'nlhe',
    gameLabel: "No-Limit Hold'em",
    category: 'Classic Coinflip',
    handA: 'JJ',
    handAName: 'Pocket Jacks',
    handACards: 'Js,Jh',
    handB: 'AQs',
    handBName: 'Ace-Queen Suited',
    handBCards: 'Ad,Qd',
    winA: 53.72,
    winB: 45.89,
    tie: 0.39,
    equityA: 53.91,
    equityB: 46.09,
    title: 'JJ Vs AQs Poker Odds And Equity',
    h1: 'JJ Vs AQs Poker Odds And Preflop Equity',
    description:
      'Exact JJ Vs AQs Preflop Odds: Pocket Jacks Leads Ace-Queen Suited 53.91% To 46.09% (53.72% Win, 0.39% Tie) In A Classic Tournament Race.',
    flopHitNotes: [
      'AQs Brings Six Live Overcards (Three Aces, Three Queens) Plus Suited Flush Potential, Creating A Tight 54/46 Coinflip.',
      'An Ace Or Queen Appears On 32.4% Of Flops, While Pocket Jacks Flops A Set 11.76% Of The Time.',
      'Pocket Jacks Blocks Two Jacks Needed For AQs Broadway Straight, Preserving Nearly 54% Equity For Jacks.',
    ],
    strategicTakeaways: [
      'At 20BB To 35BB MTT Stacks, Both JJ And AQs Are Standard Preflop Stack-Off Hands Where Blinds And Antes Tip The Math.',
      'At 100BB Cash Depth, AQs Realizes Equity Smoothly In Position Because Flush Draws And Overcards Apply Turn Pressure.',
      'On Low Dry Flops (8-5-2), Pocket Jacks Surges Past 71% Equity And Should Bet For Protection Against Six Overcards.',
    ],
    relatedSlugs: ['jj-vs-aqo', 'jj-vs-aks', 'qq-vs-aqs', '88-vs-aqs'],
    faqs: [
      {
        question: 'Who Is The Favorite In JJ Vs AQs?',
        answer:
          'Pocket Jacks Is A Slight Favorite With 53.91% Total Equity (53.72% Win, 0.39% Tie) Against 46.09% Total Equity For Ace-Queen Suited.',
      },
      {
        question: 'How Does JJ Vs AQs Compare To JJ Vs AKs?',
        answer:
          'They Are Practically Identical Races: JJ Holds 53.91% Against AQs And 53.83% Against AKs Because Both Suited Hands Have Six Live Overcards.',
      },
      {
        question: 'How Does Suit Overlap Affect JJ Vs AQs?',
        answer:
          'When One Jack Shares A Suit With AQs, Pocket Jacks Removes A Key Flush Card And Rises To Roughly 56% Equity.',
      },
    ],
  },
  {
    slug: 'jj-vs-aqo',
    game: 'nlhe',
    gameLabel: "No-Limit Hold'em",
    category: 'Classic Coinflip',
    handA: 'JJ',
    handAName: 'Pocket Jacks',
    handACards: 'Js,Jh',
    handB: 'AQo',
    handBName: 'Ace-Queen Offsuit',
    handBCards: 'Ad,Qc',
    winA: 57.23,
    winB: 42.46,
    tie: 0.31,
    equityA: 57.38,
    equityB: 42.62,
    title: 'JJ Vs AQo Poker Odds And Equity',
    h1: 'JJ Vs AQo Poker Odds And Preflop Equity',
    description:
      'Exact JJ Vs AQo Preflop Odds: Pocket Jacks Leads Ace-Queen Offsuit 57.38% To 42.62% (57.23% Win, 0.31% Tie), With Overcard And MTT Shove Math.',
    flopHitNotes: [
      'Without Flush Outs, Ace-Queen Offsuit Drops Nearly 3.5% Below AQs, Giving Pocket Jacks A Commanding 57.38% Lead.',
      'An Ace Or Queen Hits The Flop 32.4% Of The Time; On All Other Flops, Pocket Jacks Jumps Above 74% Equity.',
      'Pocket Jacks Directly Blocks Two Jacks From AQo Broadway Straight Combinations.',
    ],
    strategicTakeaways: [
      'Pocket Jacks Enjoys Almost A 15-Point Equity Lead Over AQo, Making JJ A Clear Value 3-Bet And Call Against Aggressive Shoves.',
      'AQo Should Avoid 4-Betting Into Tight Early-Position Ranges At 100BB Where It Trails JJ+ And AK.',
      'Use Larger 3-Bet Sizes Out Of Position With JJ To Charge Offsuit Broadways Like AQo And KQo Maximum Price To See Flops.',
    ],
    relatedSlugs: ['jj-vs-aqs', 'jj-vs-ako', 'tt-vs-ako', 'tt-vs-ajo'],
    faqs: [
      {
        question: 'What Are The Odds Of Pocket Jacks Against Ace-Queen Offsuit?',
        answer:
          'Pocket Jacks Wins 57.23% Of Five-Card Runouts, Ace-Queen Offsuit Wins 42.46%, And 0.31% Split, Giving JJ 57.38% Equity.',
      },
      {
        question: 'How Much Equity Does AQ Lose Being Offsuit Against JJ?',
        answer:
          'Going From Suited AQs (46.09%) To Offsuit AQo (42.62%) Costs Ace-Queen Nearly 3.5% Preflop Equity Against Pocket Jacks.',
      },
      {
        question: 'Should I Call A 25BB Tournament Jam With JJ If Villain Often Has AQo?',
        answer:
          'Yes. Leading AQo 57.4% To 42.6% Plus Crushing Smaller Pairs Makes Pocket Jacks A High-EV Call At 25BB.',
      },
    ],
  },
  {
    slug: 'tt-vs-ako',
    game: 'nlhe',
    gameLabel: "No-Limit Hold'em",
    category: 'Classic Coinflip',
    handA: 'TT',
    handAName: 'Pocket Tens',
    handACards: '10s,10h',
    handB: 'AKo',
    handBName: 'Ace-King Offsuit',
    handBCards: 'Ad,Kc',
    winA: 57.12,
    winB: 42.59,
    tie: 0.29,
    equityA: 57.27,
    equityB: 42.73,
    title: 'TT Vs AKo Poker Odds And Equity',
    h1: 'TT Vs AKo Poker Odds And Preflop Equity',
    description:
      'Exact TT Vs AKo Preflop Odds: Pocket Tens Beats Ace-King Offsuit 57.27% To 42.73% (57.12% Win, 0.29% Tie), With Broadway Blocker Analysis.',
    flopHitNotes: [
      'Pocket Tens Blocks Two Critical Tens From AKo Broadway Straight, Boosting Tens To 57.27% Equity Over Offsuit Ace-King.',
      'Notice That Pocket Tens Actually Performs Roughly 1.5% Better Against AKo Than Pocket Nines Does (57.27% Vs 55.72%) Because Of Ten Removal.',
      'An Ace Or King Falls On 32.4% Of Flops, Leaving Pocket Tens Ahead Roughly Two-Thirds Of The Time On The Flop.',
    ],
    strategicTakeaways: [
      'At 20BB To 35BB Tournament Stacks, Pocket Tens Is A Profitable 3-Bet Jam Or Call Against Aggressive Openers Holding AKo And AQo.',
      'In Deep 100BB Cash Games, Pocket Tens Prefers Flatting 3-Bets In Position Rather Than Turning Into A Bluff Against JJ+.',
      'On Low Rainbow Boards (7-4-2), Bet Confidently With TT To Deny AKo Free Turn Cards.',
    ],
    relatedSlugs: ['tt-vs-aks', 'jj-vs-ako', '99-vs-ako', 'tt-vs-kqs'],
    faqs: [
      {
        question: 'What Are The Odds Of TT Vs AKo Preflop?',
        answer:
          'Pocket Tens Wins 57.12% Of Runouts, Ace-King Offsuit Wins 42.59%, And 0.29% Split, Giving TT 57.27% Equity Against 42.73% For AKo.',
      },
      {
        question: 'Why Does TT Have Higher Equity Against AKo Than 99 Does?',
        answer:
          'Pocket Tens Removes Two Tens From The Deck, Cutting AKo Broadway Straight Combinations (A-K-Q-J-T) And Lifting TT By Roughly 1.5% Over 99.',
      },
      {
        question: 'Is TT A Bigger Favorite Against AKo Than Against AKs?',
        answer:
          'Yes. Pocket Tens Leads AKo 57.27% To 42.73%, Compared To 54.07% To 45.93% Against Suited AKs.',
      },
    ],
  },
  {
    slug: 'tt-vs-kqs',
    game: 'nlhe',
    gameLabel: "No-Limit Hold'em",
    category: 'Classic Coinflip',
    handA: 'TT',
    handAName: 'Pocket Tens',
    handACards: '10s,10h',
    handB: 'KQs',
    handBName: 'King-Queen Suited',
    handBCards: 'Kd,Qd',
    winA: 53.22,
    winB: 46.44,
    tie: 0.34,
    equityA: 53.39,
    equityB: 46.61,
    title: 'TT Vs KQs Poker Odds And Equity',
    h1: 'TT Vs KQs Poker Odds And Preflop Equity',
    description:
      'Exact TT Vs KQs Preflop Odds: Pocket Tens Leads King-Queen Suited 53.39% To 46.61% (53.22% Win, 0.34% Tie), With Coinflip And Postflop Notes.',
    flopHitNotes: [
      'KQs Holds Six Live Overcards (Three Kings, Three Queens) Plus Full Flush And Connected Straight Potential, Tightening The Race To 53.39% Vs 46.61%.',
      'On Ace-High Flops, Pocket Tens Remains Ahead Of Unpaired KQs Yet Faces Heavy Pressure Because KQs Represents Ace-X Credibly.',
      'A King Or Queen Appears On 32.4% Of Flops, While KQs Also Flops A Flush Draw 10.94% Of The Time.',
    ],
    strategicTakeaways: [
      'KQs Plays Exceptionally Well In 3-Bet Pots In Position Because Its 46.6% Equity Realizes Cleanly Across Connected Broadway Boards.',
      'Pocket Tens Should Bet For Protection On Low-To-Medium Boards (8-6-3) To Charge KQs Six Overcards And Backdoor Draws.',
      'At Short 18BB MTT Stacks, Both Hands Are Standard Late-Position Shoves And Calls.',
    ],
    relatedSlugs: ['kqs-vs-jj', 'tt-vs-aks', 'tt-vs-ako', 'qjs-vs-tt'],
    faqs: [
      {
        question: 'What Are The Odds Of TT Vs KQs Preflop?',
        answer:
          'With Non-Overlapping Suits, Pocket Tens Wins 53.22% Of Boards, King-Queen Suited Wins 46.44%, And 0.34% Tie, Yielding 53.39% Vs 46.61%.',
      },
      {
        question: 'Why Does KQs Have Slightly Higher Equity Against TT Than AKs Does?',
        answer:
          'King-Queen Suited Makes Additional Middle-High Straights Like Q-J-T-9 And K-Q-J-9 That AKs Cannot, Giving KQs 46.61% Vs 45.93% For AKs.',
      },
      {
        question: 'How Should Pocket Tens Play On A J-9-4 Two-Tone Flop Against KQs?',
        answer:
          'Proceed Carefully With Medium Bets Or Check-Calls Because KQs Frequently Flops Open-Ended Straight Draws, Flush Draws, And Overcards.',
      },
    ],
  },
  {
    slug: 'tt-vs-ajo',
    game: 'nlhe',
    gameLabel: "No-Limit Hold'em",
    category: 'Classic Coinflip',
    handA: 'TT',
    handAName: 'Pocket Tens',
    handACards: '10s,10h',
    handB: 'AJo',
    handBName: 'Ace-Jack Offsuit',
    handBCards: 'Ad,Jc',
    winA: 57.29,
    winB: 42.4,
    tie: 0.31,
    equityA: 57.45,
    equityB: 42.55,
    title: 'TT Vs AJo Poker Odds And Equity',
    h1: 'TT Vs AJo Poker Odds And Preflop Equity',
    description:
      'Exact TT Vs AJo Preflop Odds: Pocket Tens Leads Ace-Jack Offsuit 57.45% To 42.55% (57.29% Win, 0.31% Tie), With Tournament Bubble Strategy.',
    flopHitNotes: [
      'Without Flush Outs And With Two Tens Blocked By TT, Ace-Jack Offsuit Trails Pocket Tens 42.55% To 57.45%.',
      'An Ace Or Jack Falls On 32.4% Of Flops; On Any Low Or King-Queen-Free Board, Pocket Tens Takes Command Above 74%.',
      'AJo Rarely Wins Without Pairing Its Ace Or Jack Unless The Board Double-Pairs Above Tens.',
    ],
    strategicTakeaways: [
      'In 15BB To 25BB MTT Spots, Pocket Tens Crushes Loose Button And Small Blind Shoves Containing AJo, ATo, And KJo.',
      'AJo Should Generally Fold To Early-Position 3-Bets At 100BB Cash Depth To Avoid Playing Dominated Offsuit Pots.',
      'On Jack-High Flops, Pocket Tens Must Slow Down Quickly Because AJo Hits Top Pair Top Kicker.',
    ],
    relatedSlugs: ['tt-vs-ako', 'jj-vs-aqo', '77-vs-ajs', 'tt-vs-99'],
    faqs: [
      {
        question: 'What Are The Odds Of Pocket Tens Against Ace-Jack Offsuit?',
        answer:
          'Pocket Tens Wins 57.29% Of Runouts, Ace-Jack Offsuit Wins 42.40%, And 0.31% Tie, Giving TT 57.45% Total Equity.',
      },
      {
        question: 'Is AJo A Good Call Against A Tight Shove Range Including TT?',
        answer:
          'Usually No At Deep Or ICM-Pressured Stacks: AJo Trails TT 42.55% To 57.45% And Gets Heavily Dominated By AQ, AK, And JJ+.',
      },
      {
        question: 'How Often Does AJo Pair An Ace Or Jack On The Flop?',
        answer:
          'Holding Six Live Overcards In A 48-Card Deck, AJo Flops Top Pair Roughly 32.4% Of The Time.',
      },
    ],
  },
  {
    slug: '99-vs-aks',
    game: 'nlhe',
    gameLabel: "No-Limit Hold'em",
    category: 'Classic Coinflip',
    handA: '99',
    handAName: 'Pocket Nines',
    handACards: '9s,9h',
    handB: 'AKs',
    handBName: 'Ace-King Suited',
    handBCards: 'Ad,Kd',
    winA: 52.13,
    winB: 47.5,
    tie: 0.37,
    equityA: 52.32,
    equityB: 47.68,
    title: '99 Vs AKs Poker Odds And Equity',
    h1: '99 Vs AKs Poker Odds And Preflop Equity',
    description:
      'Exact 99 Vs AKs Preflop Odds: Pocket Nines Edges Out Ace-King Suited 52.32% To 47.68% (52.13% Win, 0.37% Tie) In A Razor-Thin Coinflip.',
    flopHitNotes: [
      'Because Pocket Nines Does Not Block Any Card Of AKs Broadway Straight (A-K-Q-J-T), AKs Reaches 47.68% Equity Against Unblocked 99.',
      'That Makes 99 Vs AKs Nearly A 52/48 Coinflip, Closer Than QQ, JJ, Or TT Against AKs.',
      'If Pocket Nines Shares One Suit With AKs, 99 Equity Moves Up Roughly 2.2% Toward 54.5%.',
    ],
    strategicTakeaways: [
      'With Dead Money From Blinds And Antes In Tournaments, Getting All-In With Either 99 Or AKs Around 20BB To 30BB Is Standard.',
      'At 100BB Cash Games, AKs Realizes Much Higher Postflop EV Than 99 Because Six Overcards And Flush Draws Dominate High Boards.',
      'Pocket Nines Should Prioritize Set-Mining In Position Deep-Stacked Rather Than 4-Betting Into Overpairs.',
    ],
    relatedSlugs: ['99-vs-ako', 'tt-vs-aks', '88-vs-aqs', '88-vs-ako'],
    faqs: [
      {
        question: 'Who Is The Favorite In 99 Vs AKs?',
        answer:
          'Pocket Nines Is A Slim 52.32% To 47.68% Favorite (52.13% Win, 0.37% Tie) When Suits Do Not Overlap.',
      },
      {
        question: 'Why Is 99 Vs AKs Closer Than TT Vs AKs?',
        answer:
          'Pocket Tens Blocks AKs Broadway Straight Outs, Whereas Pocket Nines Leaves All Four Queens, Jacks, And Tens Live For AKs.',
      },
      {
        question: 'How Often Does AKs Hit A Pair Or Flush Draw On The Flop Against 99?',
        answer:
          'AKs Flops An Ace, A King, Or A Flush Draw On Roughly 41% Of All Flops.',
      },
    ],
  },
  {
    slug: '88-vs-ako',
    game: 'nlhe',
    gameLabel: "No-Limit Hold'em",
    category: 'Classic Coinflip',
    handA: '88',
    handAName: 'Pocket Eights',
    handACards: '8s,8h',
    handB: 'AKo',
    handBName: 'Ace-King Offsuit',
    handBCards: 'Ad,Kc',
    winA: 55.35,
    winB: 44.34,
    tie: 0.31,
    equityA: 55.51,
    equityB: 44.49,
    title: '88 Vs AKo Poker Odds And Equity',
    h1: '88 Vs AKo Poker Odds And Preflop Equity',
    description:
      'Exact 88 Vs AKo Preflop Odds: Pocket Eights Leads Ace-King Offsuit 55.51% To 44.49% (55.35% Win, 0.31% Tie), With Set-Mine And MTT Flip Guide.',
    flopHitNotes: [
      'Pocket Eights Holds A Solid 55.51% To 44.49% Advantage Over Offsuit Ace-King Because AKo Lacks Suited Flush Equity.',
      'At Least One Overcard To Eights (9 Through A) Falls On Over 80% Of Flops, Making Deep Postflop Play Tricky For 88.',
      'Counterfeit Double-Paired Boards Above Eights Occasionally Hand AKo The Pot Without Pairing An Ace Or King.',
    ],
    strategicTakeaways: [
      'At 15BB To 25BB Tournament Depth, Jamming Pocket Eights Realizes Its Full 55.5% Equity Against AKo Without Facing Tough Flop Decisions.',
      'At 100BB Cash Stacks, Flat-Calling A 3-Bet In Position With 88 Captures High Implied Odds When Flopping A Set.',
      'AKo Still 3-Bets And 4-Bets Relentlessly Because Blocker Removal Plus Fold Equity Generates Massive Preflop Profit.',
    ],
    relatedSlugs: ['88-vs-aqs', '99-vs-ako', '66-vs-ako', 'ako-vs-22'],
    faqs: [
      {
        question: 'What Are The Odds Of 88 Vs AKo Preflop?',
        answer:
          'Pocket Eights Wins 55.35% Of Runouts, Ace-King Offsuit Wins 44.34%, And 0.31% Split, Giving 88 55.51% Equity Against 44.49% For AKo.',
      },
      {
        question: 'Why Does 88 Perform Better Against AKo Than Against AQs?',
        answer:
          'Offsuit AKo Has No Suited Flush Potential, Giving 88 55.51% Equity Versus Only 52.88% Against Suited AQs.',
      },
      {
        question: 'How Often Does Pocket Eights Flop A Set?',
        answer:
          'Pocket Eights Flops Three Of A Kind Or Quads 11.76% Of The Time.',
      },
    ],
  },
  {
    slug: '77-vs-ajs',
    game: 'nlhe',
    gameLabel: "No-Limit Hold'em",
    category: 'Classic Coinflip',
    handA: '77',
    handAName: 'Pocket Sevens',
    handACards: '7s,7h',
    handB: 'AJs',
    handBName: 'Ace-Jack Suited',
    handBCards: 'Ad,Jd',
    winA: 51.56,
    winB: 48.11,
    tie: 0.33,
    equityA: 51.73,
    equityB: 48.27,
    title: '77 Vs AJs Poker Odds And Equity',
    h1: '77 Vs AJs Poker Odds And Preflop Equity',
    description:
      'Exact 77 Vs AJs Preflop Odds: Pocket Sevens Narrowly Leads Ace-Jack Suited 51.73% To 48.27% (51.56% Win, 0.33% Tie) In A True 52/48 Flip.',
    flopHitNotes: [
      'AJs Brings Six Live Overcards, Unblocked Straight Connectivity, And Full Flush Potential, Compressing Pocket Sevens Down To 51.73%.',
      'Because Every Card From 8 Through Ace Is An Overcard To Sevens, 77 Faces Overcards On Nearly 88% Of Flops.',
      'Double-Paired Boards Above Sevens Also Give AJs Extra Counterfeit Outs Even When Unpaired.',
    ],
    strategicTakeaways: [
      'At 15BB To 20BB Tournament Stacks, Both 77 And AJs Are Profitable Late-Position Shoves Where Dead Money Makes A 52/48 Flip Worth Taking.',
      'At 100BB Cash Games, AJs Strongly Outperforms 77 Postflop Because It Realizes Equity Via Top Pairs And Nut Flush Draws.',
      'Pocket Sevens Should Check-Call Selectively On Low-To-Medium Boards And Fold Cleanly To Multi-Street Barrels On High Textures.',
    ],
    relatedSlugs: ['88-vs-aqs', '99-vs-aks', '66-vs-ako', 'tt-vs-ajo'],
    faqs: [
      {
        question: 'Who Is The Favorite Between 77 And AJs?',
        answer:
          'Pocket Sevens Is A Razor-Thin Favorite At 51.73% Equity (51.56% Win, 0.33% Tie) Against 48.27% Equity For Ace-Jack Suited.',
      },
      {
        question: 'Why Is 77 Vs AJs Closer Than JJ Vs AQs?',
        answer:
          'Pocket Sevens Is Vulnerable To Higher Double-Paired Boards Counterfeiting Sevens And Does Not Block Any Of AJs Straight Outs.',
      },
      {
        question: 'Can AJs Actually Lead 77 With Certain Suits?',
        answer:
          'No, Unblocked AJs Peaks Around 48.3%, Though In Deep-Stacked Postflop Play AJs Often Realizes More Than 50% Of The Pot.',
      },
    ],
  },
  {
    slug: 'aks-vs-aqs',
    game: 'nlhe',
    gameLabel: "No-Limit Hold'em",
    category: 'Dominated Matchup',
    handA: 'AKs',
    handAName: 'Ace-King Suited',
    handACards: 'As,Ks',
    handB: 'AQs',
    handBName: 'Ace-Queen Suited',
    handBCards: 'Ah,Qh',
    winA: 69.12,
    winB: 26.72,
    tie: 4.16,
    equityA: 71.2,
    equityB: 28.8,
    title: 'AKs Vs AQs Poker Odds And Equity',
    h1: 'AKs Vs AQs Poker Odds And Preflop Equity',
    description:
      'Exact AKs Vs AQs Preflop Odds: Ace-King Suited Dominates Ace-Queen Suited 71.20% To 28.80% (69.12% Win, 4.16% Tie), With Ace-High Flop Strategy.',
    flopHitNotes: [
      'When Both Hands Hold Different Suits, AQs Keeps Live Flush Potential Yet Still Trails AKs 28.80% To 71.20% Due To Ace Domination.',
      'Over 4.16% Of All Five-Card Boards Result In A Chop Because The Board Plays A Higher Pair Or Straight.',
      'On Ace-High Rainbow Flops, AQs Drops Below 14% Equity Needing One Of Three Live Queens Or Running Cards.',
    ],
    strategicTakeaways: [
      'AKs Extracts Massive Multi-Street Value On Ace-High Boards Where AQs Rarely Folds Top Pair Strong Kicker.',
      'AQs Should Avoid 5-Bet Jamming At 100BB Against Tight Ranges Where AKs, AA, And KK Crush Its Equity.',
      'When AQs Flops A Flush Draw Alongside An Ace Or Queen, Its Equity Jumps Dramatically Even Against Dominated Kickers.',
    ],
    relatedSlugs: ['aks-vs-aqo', 'ako-vs-aqo', 'aks-vs-kqs', 'aa-vs-aks'],
    faqs: [
      {
        question: 'What Are The Odds Of AKs Vs AQs Preflop?',
        answer:
          'With Non-Overlapping Suits, Ace-King Suited Wins 69.12% Of Runouts, Ace-Queen Suited Wins 26.72%, And 4.16% Tie, Giving AKs 71.20% Equity.',
      },
      {
        question: 'How Much Does Being Suited Help AQs Against AKs?',
        answer:
          'Being Suited Lifts Ace-Queen From 26.08% (AQo) Up To 28.80% (AQs) Against Unblocked AKs, Adding Roughly 2.7% Equity.',
      },
      {
        question: 'Why Is The Split Pot Frequency Over 4% In AKs Vs AQs?',
        answer:
          'Because Both Hands Share An Ace, Any Board With Two Higher Pairs Or High Straight Cards Eliminates The King-Vs-Queen Kicker Difference.',
      },
    ],
  },
  {
    slug: 'ako-vs-aqo',
    game: 'nlhe',
    gameLabel: "No-Limit Hold'em",
    category: 'Dominated Matchup',
    handA: 'AKo',
    handAName: 'Ace-King Offsuit',
    handACards: 'As,Kh',
    handB: 'AQo',
    handBName: 'Ace-Queen Offsuit',
    handBCards: 'Ad,Qc',
    winA: 71.77,
    winB: 23.61,
    tie: 4.62,
    equityA: 74.08,
    equityB: 25.92,
    title: 'AKo Vs AQo Poker Odds And Equity',
    h1: 'AKo Vs AQo Poker Odds And Preflop Equity',
    description:
      'Exact AKo Vs AQo Preflop Odds: Ace-King Offsuit Dominates Ace-Queen Offsuit 74.08% To 25.92% (71.77% Win, 4.62% Tie), With 3-Bet Pot Advice.',
    flopHitNotes: [
      'AKo Vs AQo Is The Classic 3-To-1 Dominated Big-Ace Battle: AKo Holds 74.08% Equity While AQo Relies On Three Live Queens.',
      'Nearly 1 In Every 22 Runouts (4.62%) Ends In A Split Pot On Double-Paired Or High Straight Boards.',
      'When An Ace Lands On The Flop, AQo Suffers Heavy Reverse Implied Odds Against AKo Top Pair Top Kicker.',
    ],
    strategicTakeaways: [
      'In Multi-Table Tournaments Around 20BB To 30BB, Calling A Tight Re-Jam With AQo Frequently Walks Straight Into Dominated AKo.',
      'On Dry Ace-High Flops In 3-Bet Pots, AKo Can Comfortably Bet Three Streets For Value While AQo Should Control Pot Size.',
      'In Button Vs Blind Battles, AQo Still Plays Aggressively Because Villain Ranges Include Many Weaker Aces Like AJ, AT, And A9.',
    ],
    relatedSlugs: ['aks-vs-aqo', 'aks-vs-aqs', 'ako-vs-kqo', 'kk-vs-ako'],
    faqs: [
      {
        question: 'What Are The Odds Of AKo Beating AQo?',
        answer:
          'Ace-King Offsuit Wins 71.77% Of Boards, Ace-Queen Offsuit Wins 23.61%, And 4.62% Split, Giving AKo 74.08% Equity Against 25.92% For AQo.',
      },
      {
        question: 'How Often Does AQo Outdraw AKo All-In Preflop?',
        answer:
          'Ace-Queen Offsuit Wins Outright 23.61% Of All-In Runouts, Roughly Once Every 4.2 Showdowns.',
      },
      {
        question: 'Should You Ever Fold AQo Preflop Against A 4-Bet?',
        answer:
          'Yes. At 100BB Against Tight Early-Position 4-Bets, AQo Is Heavily Dominated By AA, KK, QQ, And AK, Making A Disciplined Fold Standard.',
      },
    ],
  },
  {
    slug: 'ako-vs-kqo',
    game: 'nlhe',
    gameLabel: "No-Limit Hold'em",
    category: 'Dominated Matchup',
    handA: 'AKo',
    handAName: 'Ace-King Offsuit',
    handACards: 'As,Kh',
    handB: 'KQo',
    handBName: 'King-Queen Offsuit',
    handBCards: 'Kd,Qc',
    winA: 73.56,
    winB: 25.39,
    tie: 1.05,
    equityA: 74.09,
    equityB: 25.91,
    title: 'AKo Vs KQo Poker Odds And Equity',
    h1: 'AKo Vs KQo Poker Odds And Preflop Equity',
    description:
      'Exact AKo Vs KQo Preflop Odds: Ace-King Offsuit Dominates King-Queen Offsuit 74.09% To 25.91% (73.56% Win, 1.05% Tie), With King-Flop Tips.',
    flopHitNotes: [
      'AKo Dominates Both The Shared King And High-Card Showdown Value, Holding 74.09% Equity Over KQo.',
      'Unlike AKo Vs AQo (4.62% Tie), The Tie Rate Drops To 1.05% Because Whenever Neither Hand Pairs, AKo Ace-High Wins Outright.',
      'On King-High Flops, KQo Top Pair Good Kicker Is Trapped With Only Three Live Queen Outs.',
    ],
    strategicTakeaways: [
      'KQo Should Fold Against Tight Early-Position 3-Bets Out Of Position At 100BB Because Domination By AK And KK Destroys Realized EV.',
      'AKo Extracts Maximum Value On King-High Dry Flops Because Opponents Rarely Fold Top Pair Queen Kicker.',
      'In Late-Position Steal Battles, KQo Remains A Profitable Open And Light 3-Bet Bluff Thanks To Its King And Queen Blockers.',
    ],
    relatedSlugs: ['aks-vs-kqs', 'ako-vs-aqo', 'kk-vs-ako', 'kqs-vs-jj'],
    faqs: [
      {
        question: 'What Are The Odds Of AKo Vs KQo Preflop?',
        answer:
          'Ace-King Offsuit Wins 73.56% Of Runouts, King-Queen Offsuit Wins 25.39%, And 1.05% Tie, Yielding A 74.09% To 25.91% Equity Split.',
      },
      {
        question: 'Why Is The Tie Rate Lower In AKo Vs KQo Than In AKo Vs AQo?',
        answer:
          'When The Board Runs Out Without Helping Either Hand, AKo Ace-High Beats KQo Outright, Cutting Split Pots From 4.62% Down To 1.05%.',
      },
      {
        question: 'How Much Equity Does KQs Gain Over KQo Against AKo?',
        answer:
          'Being Suited Adds Nearly 3% Flush Equity, Lifting King-Queen From 25.91% (KQo) Closer To 28.8% (KQs).',
      },
    ],
  },
  {
    slug: 'a5s-vs-kk',
    game: 'nlhe',
    gameLabel: "No-Limit Hold'em",
    category: 'Overpair Vs Overcard',
    handA: 'A5s',
    handAName: 'Ace-Five Suited',
    handACards: 'Ad,5d',
    handB: 'KK',
    handBName: 'Pocket Kings',
    handBCards: 'Ks,Kh',
    winA: 33.31,
    winB: 66.3,
    tie: 0.39,
    equityA: 33.51,
    equityB: 66.49,
    title: 'A5s Vs KK Poker Odds And Equity',
    h1: 'A5s Vs KK Poker Odds And Preflop Equity',
    description:
      'Exact A5s Vs KK Preflop Odds: Ace-Five Suited Holds 33.51% Equity Against Pocket Kings (66.49%), Explaining Why Solvers 4-Bet Bluff A5s.',
    flopHitNotes: [
      'A5s Retains A Surprising 33.51% Equity Against Pocket Kings Thanks To Three Live Aces, Nut Flush Draws, And Wheel Straight Outs (A-2-3-4-5).',
      'Notice That A5s (33.51%) Holds Almost As Much Equity Against KK As AKs Does (34.31%) Because A5s Adds Clean Wheel Straight Combinations.',
      'An Ace Hits The Flop 22.55% Of The Time, Instantly Turning The Tables On Pocket Kings.',
    ],
    strategicTakeaways: [
      'A5s Is The Flagship GTO 4-Bet Bluff In 100BB Cash Games Because Holding An Ace Blocks 50% Of AA And AK While Retaining 33.5% Equity Even When Called By KK.',
      'When Called By Pocket Kings, A5s Plays Aggressively On Ace-High Boards And Two-Tone Wheel Textures.',
      'Pocket Kings Still Holds A 2-To-1 Edge Overall And Should Never Fold Preflop To Polarized 4-Bet Ranges.',
    ],
    relatedSlugs: ['kk-vs-aks', 'kk-vs-aqs', 'a3s-vs-random', 'aa-vs-kk'],
    faqs: [
      {
        question: 'Why Do GTO Solvers Love 4-Bet Bluffing A5s Against Ranges With KK?',
        answer:
          'A5s Blocks Opponent Pocket Aces And Ace-King, Folds Easily To 5-Bets, And Still Retains 33.51% Equity Via Three Aces, Nut Flushes, And Wheel Straights When Called By KK.',
      },
      {
        question: 'What Are The Exact Odds Of A5s Vs KK?',
        answer:
          'Ace-Five Suited Wins 33.31% Of Runouts, Pocket Kings Wins 66.30%, And 0.39% Tie, Giving A5s 33.51% Equity Against 66.49% For KK.',
      },
      {
        question: 'Does A5s Have Better Equity Against KK Than AQo Does?',
        answer:
          'Yes. Being Suited With Wheel Connectivity Gives A5s 33.51% Against KK, Ahead Of Offsuit AQo (Roughly 28.5%).',
      },
    ],
  },
  {
    slug: 'kqs-vs-jj',
    game: 'nlhe',
    gameLabel: "No-Limit Hold'em",
    category: 'Classic Coinflip',
    handA: 'KQs',
    handAName: 'King-Queen Suited',
    handACards: 'Kd,Qd',
    handB: 'JJ',
    handBName: 'Pocket Jacks',
    handBCards: 'Js,Jh',
    winA: 46.37,
    winB: 53.25,
    tie: 0.38,
    equityA: 46.56,
    equityB: 53.44,
    title: 'KQs Vs JJ Poker Odds And Equity',
    h1: 'KQs Vs JJ Poker Odds And Preflop Equity',
    description:
      'Exact KQs Vs JJ Preflop Odds: King-Queen Suited Holds 46.56% Equity Against Pocket Jacks (53.44%), With Coinflip And 3-Bet Pot Strategy.',
    flopHitNotes: [
      'KQs Brings Six Live Overcards (Three Kings, Three Queens) Plus Full Flush Equity, Creating A Tight 46.56% Vs 53.44% Race.',
      'A King Or Queen Appears On 32.4% Of Flops, While KQs Also Flops A Flush Draw 10.94% Of The Time.',
      'Pocket Jacks Blocks Two Jacks From KQs Broadway And Q-J-T-9 Straight Outs, Preserving Its 53.44% Advantage.',
    ],
    strategicTakeaways: [
      'KQs Is One Of The Highest-Playability Hands In Holdem, Realizing Its 46.6% Equity Smoothly In Position Against Pocket Jacks.',
      'At 20BB To 30BB Tournament Stacks, Both KQs And JJ Frequently Stack Off In Cutoff Vs Button Or Blind Battles.',
      'Pocket Jacks Should Bet For Value And Protection On Low-To-Medium Boards Before Scare King Or Queen Turns Arrive.',
    ],
    relatedSlugs: ['tt-vs-kqs', 'jj-vs-aqs', 'aks-vs-kqs', 'qjs-vs-tt'],
    faqs: [
      {
        question: 'What Are The Odds Of KQs Vs JJ Preflop?',
        answer:
          'With Non-Overlapping Suits, King-Queen Suited Wins 46.37% Of Boards, Pocket Jacks Wins 53.25%, And 0.38% Split, Yielding 46.56% Vs 53.44%.',
      },
      {
        question: 'Is KQs Almost Identical To AKs Against Pocket Jacks?',
        answer:
          'Yes. Both KQs (46.56%) And AKs (46.17%) Are Classic 46/54 Underdogs Against Unblocked Pocket Jacks.',
      },
      {
        question: 'How Should KQs Play Against JJ On An Ace-High Flop?',
        answer:
          'KQs Holds A Gutshot Straight Draw To A Ten Plus Strong Range Advantage As The Preflop Aggressor, Making Small Flop C-Bets Effective.',
      },
    ],
  },
  {
    slug: 'qjs-vs-tt',
    game: 'nlhe',
    gameLabel: "No-Limit Hold'em",
    category: 'Classic Coinflip',
    handA: 'QJs',
    handAName: 'Queen-Jack Suited',
    handACards: 'Qd,Jd',
    handB: 'TT',
    handBName: 'Pocket Tens',
    handBCards: '10s,10h',
    winA: 47.01,
    winB: 52.61,
    tie: 0.38,
    equityA: 47.2,
    equityB: 52.8,
    title: 'QJs Vs TT Poker Odds And Equity',
    h1: 'QJs Vs TT Poker Odds And Preflop Equity',
    description:
      'Exact QJs Vs TT Preflop Odds: Queen-Jack Suited Holds 47.20% Equity Against Pocket Tens (52.80%) In A Connected High-Card Coinflip.',
    flopHitNotes: [
      'QJs Combines Six Live Overcards (Three Queens, Three Jacks) With Elite Suited Connector Straight And Flush Draws, Reaching 47.20% Equity.',
      'Even Though Pocket Tens Removes Two Tens From QJs Straight Outs, QJs Still Outperforms AKs (45.93%) Against Unblocked TT.',
      'A Queen Or Jack Hits The Flop 32.4% Of The Time, Immediately Putting QJs Far Ahead.',
    ],
    strategicTakeaways: [
      'QJs Thrives In 100BB Single-Raised And 3-Bet Pots In Position Because It Flops Combo Draws And Top Pairs At High Frequency.',
      'Pocket Tens Should Bet For Protection On Dry Low Flops (7-5-2) Rather Than Giving QJs Free Turn Cards.',
      'At 15BB To 20BB MTT Stacks, QJs Is A Strong Late-Position Steal Jam That Retains Nearly 47% Equity Even When Called By TT.',
    ],
    relatedSlugs: ['tt-vs-kqs', 'kqs-vs-jj', 'jts-vs-qq', 'tt-vs-aks'],
    faqs: [
      {
        question: 'What Are The Odds Of QJs Vs TT Preflop?',
        answer:
          'Queen-Jack Suited Wins 47.01% Of Runouts, Pocket Tens Wins 52.61%, And 0.38% Split, Giving QJs 47.20% Equity Against 52.80% For TT.',
      },
      {
        question: 'Why Does QJs Do Slightly Better Against TT Than AKs Does?',
        answer:
          'Queen-Jack Suited Connects To Both Upper And Middle Straights (K-T-9, T-9-8, 9-8-7), Reaching 47.20% Compared To 45.93% For AKs.',
      },
      {
        question: 'Should Pocket Tens Fold On A Q-9-4 Flop Against QJs?',
        answer:
          'Not Immediately: Tens Holds Backdoor Straight Potential And Showdown Value Against Bluffs, Typically Check-Calling One Street On Medium Sizing.',
      },
    ],
  },
  {
    slug: 'jts-vs-qq',
    game: 'nlhe',
    gameLabel: "No-Limit Hold'em",
    category: 'Suited Connector Vs Big Hand',
    handA: 'JTs',
    handAName: 'Jack-Ten Suited',
    handACards: 'Jd,10d',
    handB: 'QQ',
    handBName: 'Pocket Queens',
    handBCards: 'Qs,Qh',
    winA: 18.68,
    winB: 80.96,
    tie: 0.36,
    equityA: 18.86,
    equityB: 81.14,
    title: 'JTs Vs QQ Poker Odds And Equity',
    h1: 'JTs Vs QQ Poker Odds And Preflop Equity',
    description:
      'Exact JTs Vs QQ Preflop Odds: Jack-Ten Suited Holds 18.86% Equity Against Pocket Queens (81.14%), Showing How Queen Removal Affects JTs.',
    flopHitNotes: [
      'Unlike JTs Against AA (20.64%), Pocket Queens Directly Blocks Two Queens Crucial To JTs Upper Straights (K-Q-J-T-9 And A-K-Q-J-T), Dropping JTs To 18.86%.',
      'JTs Still Flops Flush Draws, Open-Ended Straight Draws, Or Two Pair On Roughly 26% Of Flops, Generating Strong Deep-Stack Implied Odds.',
      'On Low-To-Middle Connected Flops Like 9-8-3 Two-Tone, JTs Frequently Flips Ahead Of Pocket Queens.',
    ],
    strategicTakeaways: [
      'JTs Should Never Stack Off Preflop Against Tight 4-Bet Ranges, Instead Realizing Its Equity By Calling 3-Bets In Position Deep-Stacked.',
      'Pocket Queens Enjoys An 81.14% Lead Preflop And Should Size Up Flop C-Bets On Wet Middle Textures To Deny Combo Draw Equity.',
      'Notice That Holding Two Queens Cuts JTs Straight Power By Nearly 2 Full Percentage Points Compared To Facing Pocket Aces.',
    ],
    relatedSlugs: ['aa-vs-jts', '98s-vs-aa', '76s-vs-kk', 'qjs-vs-tt'],
    faqs: [
      {
        question: 'Why Does JTs Have Less Equity Against QQ Than Against AA?',
        answer:
          'Pocket Queens Blocks Two Queens That JTs Needs For High Straights (K-Q-J-T-9 And Q-J-T-9-8), Dropping JTs From 20.64% Against AA Down To 18.86% Against QQ.',
      },
      {
        question: 'What Are The Exact Win And Tie Odds Of JTs Vs QQ?',
        answer:
          'Jack-Ten Suited Wins 18.68% Of Boards, Pocket Queens Wins 80.96%, And 0.36% Tie, Giving QQ 81.14% Total Equity.',
      },
      {
        question: 'Is JTs Still A Profitable Call Against A 3-Bet From QQ?',
        answer:
          'At 100BB+ In Position Against A Full 3-Bet Range (Not Just QQ), Yes, Because JTs High Implied Odds And Playability Realize Strongly Postflop.',
      },
    ],
  },
  {
    slug: '98s-vs-aa',
    game: 'nlhe',
    gameLabel: "No-Limit Hold'em",
    category: 'Suited Connector Vs Big Hand',
    handA: '98s',
    handAName: 'Nine-Eight Suited',
    handACards: '9d,8d',
    handB: 'AA',
    handBName: 'Pocket Aces',
    handBCards: 'As,Ah',
    winA: 22.42,
    winB: 77.26,
    tie: 0.32,
    equityA: 22.58,
    equityB: 77.42,
    title: '98s Vs AA Poker Odds And Equity',
    h1: '98s Vs AA Poker Odds And Preflop Equity',
    description:
      'Exact 98s Vs AA Preflop Odds: Nine-Eight Suited Holds 22.58% Equity Against Pocket Aces (77.42%), Making 98s A Top Non-Pair Hand Vs Aces.',
    flopHitNotes: [
      'Nine-Eight Suited Holds 22.58% Equity Against Unblocked Pocket Aces, Beating Even JTs (20.64%) Because Every Straight Made By 98s Is Completely Unblocked By Aces.',
      '98s Can Complete Four Distinct Five-Card Straights (Q-J-T-9-8, J-T-9-8-7, T-9-8-7-6, And 9-8-7-6-5) Without Ever Helping AA Make A Straight.',
      'On Coordinated 7-6-X Or T-7-X Two-Tone Flops, 98s Frequently Surges Past 50% Equity Against Pocket Aces.',
    ],
    strategicTakeaways: [
      'Suited Connectors Like 98s, 87s, And 76s Are The Premier Deep-Stack Crack-Aces Hands Because Of Maximum Independent Straight Plus Flush Coverage.',
      'At 150BB To 200BB Cash Depth, Calling Position 3-Bets With 98s Prints Implied Odds Whenever Pocket Aces Overplays A Single Overpair.',
      'Pocket Aces Should Use Defensive Medium-To-Large Bets On Wet Middle Flops And Avoid Stacking Off Blindly On Four-Straight Runouts.',
    ],
    relatedSlugs: ['aa-vs-jts', '76s-vs-kk', 'jts-vs-qq', 'aa-vs-72o'],
    faqs: [
      {
        question: 'Why Does 98s Have Better Odds Against AA Than JTs Does?',
        answer:
          'All Four Of 98s Straight Combinations (5-9 Through 8-Q) Are Completely Independent Of Aces, Lifting 98s To 22.58% Compared To 20.64% For JTs.',
      },
      {
        question: 'What Are The Exact Odds Of 98s Vs AA Preflop?',
        answer:
          'Nine-Eight Suited Wins 22.42% Of Runouts, Pocket Aces Wins 77.26%, And 0.32% Split, Producing A 22.58% To 77.42% Equity Split.',
      },
      {
        question: 'How Does Suit Overlap Change 98s Vs AA?',
        answer:
          'If One Ace Shares 98s Suit, 98s Loses Roughly 2% Equity Due To Flush Card Removal, Dropping Near 20.5%.',
      },
    ],
  },
  {
    slug: '76s-vs-kk',
    game: 'nlhe',
    gameLabel: "No-Limit Hold'em",
    category: 'Suited Connector Vs Big Hand',
    handA: '76s',
    handAName: 'Seven-Six Suited',
    handACards: '7d,6d',
    handB: 'KK',
    handBName: 'Pocket Kings',
    handBCards: 'Ks,Kh',
    winA: 22.74,
    winB: 76.98,
    tie: 0.28,
    equityA: 22.88,
    equityB: 77.12,
    title: '76s Vs KK Poker Odds And Equity',
    h1: '76s Vs KK Poker Odds And Preflop Equity',
    description:
      'Exact 76s Vs KK Preflop Odds: Seven-Six Suited Holds 22.88% Equity Against Pocket Kings (77.12%), Explaining Deep-Stack Connector Play.',
    flopHitNotes: [
      'Seven-Six Suited Holds 22.88% Equity Against Unblocked Pocket Kings Because All Four Of Its Straights (3-7 Through 6-T) Are Completely Unblocked By Kings.',
      '76s Flops Two Pair, Trips, A Straight, Or A Strong Flush Or Open-Ended Draw On Over 27% Of Flops.',
      'Even When Pocket Kings Leads 77.12% Preflop, Low Connected Boards (8-5-4 Or 9-6-5) Give 76s Huge Turn And River Equity.',
    ],
    strategicTakeaways: [
      '76s Is A Staple Deep-Stack Call And Occasional 3-Bet Bluff Because It Retains Nearly 23% Equity Even Against The Second-Best Hand In Holdem.',
      'Pocket Kings Should Size Bets Carefully On Low Connected Flops Where Caller Ranges Hold Sets, Two Pairs, And Made Straights.',
      'Never Confuse 22.88% Preflop Equity With A Reason To Call All-In Preflop: 76s Value Comes Strictly From Deep Stack-To-Pot Ratios.',
    ],
    relatedSlugs: ['98s-vs-aa', 'aks-vs-76s', 'aa-vs-jts', 'kk-vs-qq'],
    faqs: [
      {
        question: 'What Are The Odds Of 76s Vs KK Preflop?',
        answer:
          'With Different Suits, Seven-Six Suited Wins 22.74% Of Boards, Pocket Kings Wins 76.98%, And 0.28% Tie, Giving 76s 22.88% Total Equity.',
      },
      {
        question: 'Why Do Low Suited Connectors Perform Better Against KK Than High Broadways?',
        answer:
          'Hands Like 76s Are Completely Undominated By KK And Make Four Independent Straights Plus Live Flushes, Beating Dominated Hands Like KQs Or KJs.',
      },
      {
        question: 'How Often Does 76s Crack Pocket Kings All-In Preflop?',
        answer:
          'Seven-Six Suited Wins Outright 22.74% Of The Time, Almost 1 In Every 4.4 All-In Preflop Showdowns.',
      },
    ],
  },
  {
    slug: '66-vs-ako',
    game: 'nlhe',
    gameLabel: "No-Limit Hold'em",
    category: 'Classic Coinflip',
    handA: '66',
    handAName: 'Pocket Sixes',
    handACards: '6s,6h',
    handB: 'AKo',
    handBName: 'Ace-King Offsuit',
    handBCards: 'Ad,Kc',
    winA: 55.14,
    winB: 44.54,
    tie: 0.32,
    equityA: 55.3,
    equityB: 44.7,
    title: '66 Vs AKo Poker Odds And Equity',
    h1: '66 Vs AKo Poker Odds And Preflop Equity',
    description:
      'Exact 66 Vs AKo Preflop Odds: Pocket Sixes Leads Ace-King Offsuit 55.30% To 44.70% (55.14% Win, 0.32% Tie) In A Classic Small-Pair Flip.',
    flopHitNotes: [
      'Pocket Sixes Holds A Clear 55.30% To 44.70% Edge Over Offsuit Ace-King, Virtually Matching Pocket Eights (55.51%).',
      'Because Every Card From 7 Through Ace Outranks Sixes, Double-Paired Boards Above Sixes Provide Extra Counterfeit Outs For AKo.',
      'An Ace Or King Hits The Flop 32.4% Of The Time; On Low Rainbow Flops Without An Ace Or King, 66 Jumps Above 72% Equity.',
    ],
    strategicTakeaways: [
      'At 15BB To 25BB MTT Stacks, Open-Shoving Or Re-Jamming Pocket Sixes Maximizes Fold Equity While Still Leading Offsuit Big Slick 55/45.',
      'In 100BB Cash Games, Pocket Sixes Plays Primarily For Set-Mining Implied Odds In Single-Raised And Multiway Pots.',
      'AKo Still Profitably Calls Short-Stack Jams With Blinds And Antes In The Middle Because Dead Money Bridges The 44.7% Equity Gap.',
    ],
    relatedSlugs: ['88-vs-ako', 'ako-vs-22', '99-vs-ako', '77-vs-ajs'],
    faqs: [
      {
        question: 'What Are The Odds Of Pocket Sixes Against AKo?',
        answer:
          'Pocket Sixes Wins 55.14% Of Runouts, Ace-King Offsuit Wins 44.54%, And 0.32% Tie, Yielding 55.30% Equity For 66 Against 44.70% For AKo.',
      },
      {
        question: 'Why Does 66 Perform Better Against AKo Than 22 Does?',
        answer:
          'Pocket Sixes Is Counterfeited By Fewer Double-Paired Boards Than Pocket Deuces And Makes Slightly More Unblocked Middle Straights, Holding 55.30% Vs 50.44% For 22.',
      },
      {
        question: 'Should I Call A 3-Bet With 66 Out Of Position At 100BB?',
        answer:
          'Usually Only Against Small 3-Bet Sizes With Deep Effective Stacks; Otherwise Fold Out Of Position Because 66 Struggles To Realize Equity Unimproved.',
      },
    ],
  },
  {
    slug: 'aakq-vs-jt98-plo4',
    game: 'plo4',
    gameLabel: '4-Card Pot-Limit Omaha (PLO4)',
    category: 'Pot-Limit Omaha (PLO4)',
    handA: 'AAKQds',
    handAName: 'AAKQ Double-Suited',
    handACards: 'As,Ah,Ks,Qh',
    handB: 'JT98ds',
    handBName: 'JT98 Double-Suited',
    handBCards: 'Jd,10c,9d,8c',
    winA: 58.66,
    winB: 41.33,
    tie: 0.01,
    equityA: 58.66,
    equityB: 41.34,
    title: 'AAKQ Vs JT98 PLO4 Odds And Equity',
    h1: 'AAKQ Vs JT98 PLO4 Odds And Preflop Equity',
    description:
      'Exact PLO4 AAKQds Vs JT98ds Odds: Double-Suited AAKQ Leads Unblocked JT98ds 58.66% To 41.34%, Showing Why Rundowns Thrive In 4-Card Omaha.',
    flopHitNotes: [
      'AAKQ Double-Suited Is A Top-5 PLO4 Starting Hand Combining Pocket Aces, Broadway Wrap Support, And Dual Nut Flush Draws, Holding 58.66% Against Unblocked JT98ds.',
      'Compared To AAKKds (61.49% Vs JT98ds), Swapping The Second King For A Queen Trades Set-Backup Equity For Extra Broadway Straight Connectivity, Dropping Slightly Against JT98ds.',
      'JT98ds Still Retains Over 41.3% Equity Because Connected Middle Cards Flop Massive 13-Out To 20-Out Wraps And Two-Pair Combinations.',
    ],
    strategicTakeaways: [
      'Always 3-Bet And 4-Bet AAKQ Double-Suited Preflop In PLO4 To Compress Stack-To-Pot Ratios Below 2.5 Where Overpairs Plus Nut Flush Draws Print EV.',
      'JT98 Double-Suited Should Prefer Deep 100BB+ Single-Raised Or 3-Bet Pots In Position Rather Than Getting Stacked Preflop At Short SPR.',
      'When AAKQds Shares Both Suits With JT98ds, Flush Domination Pushes AAKQds Equity Past 64%.',
    ],
    relatedSlugs: ['aakk-vs-jt98-plo4', 'kkqq-vs-jt98-plo4', 'aa-double-suited-vs-kk-double-suited-plo4', 'aakkj-vs-jt987-plo5'],
    faqs: [
      {
        question: 'What Are The Odds Of AAKQds Vs JT98ds In PLO4?',
        answer:
          'When Suits Do Not Overlap (As Ah Ks Qh Vs Jd Tc 9d 8c), AAKQ Double-Suited Wins 58.66% Of Boards And JT98 Double-Suited Wins 41.33%, With 0.01% Ties.',
      },
      {
        question: 'Why Does AAKQds Have Slightly Lower Equity Against JT98ds Than AAKKds?',
        answer:
          'AAKKds Holds Two Pocket Pairs (Aces And Kings) Giving Double Set Protection Against Rundown Two Pairs, Whereas AAKQds Has Only One Pocket Pair.',
      },
      {
        question: 'How Does AAKQds Perform When It Dominates JT98ds Flush Suits?',
        answer:
          'Dominating Both Suits Removes JT98ds Clean Flush Outs And Turns Flush-Over-Flush Runouts Into Coolers For AAKQds, Lifting Its Equity Above 64%.',
      },
    ],
  },
  {
    slug: 'aa-double-suited-vs-kk-double-suited-plo4',
    game: 'plo4',
    gameLabel: '4-Card Pot-Limit Omaha (PLO4)',
    category: 'Pot-Limit Omaha (PLO4)',
    handA: 'AAJTds',
    handAName: 'AA Double-Suited (AAJTds)',
    handACards: 'As,Ah,Js,10h',
    handB: 'KKQJds',
    handBName: 'KK Double-Suited (KKQJds)',
    handBCards: 'Kd,Kc,Qd,Jc',
    winA: 65.36,
    winB: 34.55,
    tie: 0.09,
    equityA: 65.41,
    equityB: 34.59,
    title: 'AAds Vs KKds PLO4 Odds And Equity',
    h1: 'AA Double-Suited Vs KK Double-Suited PLO4 Odds',
    description:
      'Exact PLO4 AA Double-Suited Vs KK Double-Suited Odds: AAJTds Leads KKQJds 65.41% To 34.59% (65.36% Win, 0.09% Tie) In A Premier Omaha Clash.',
    flopHitNotes: [
      'In Holdem, AA Crushes KK 82.18% To 17.82%. In 4-Card PLO, Strong Double-Suited Kings (KKQJds) Nearly Double Their Equity To 34.59% Against Unblocked AAJTds.',
      'Dual Flush Draws Plus Broadway Straight Connectivity Give KKQJds Multiple Non-Set Paths To Crack Pocket Aces.',
      'Whenever Both Hands Share Suits, AA Double-Suited Dominates The Nut Flush Draw And Surges Past 71% Equity.',
    ],
    strategicTakeaways: [
      'Double-Suited Connected Kings (KKQJds, KKJTds) Can Profitably Get All-In Preflop In PLO4 With Dead Money Because 34.6% Equity Against AA Plus Domination Over Rundowns Prints Chips.',
      'Unconnected Rainbow Kings (KK72r) Should Play Much More Cautiously Against 4-Bets Because They Drop Below 26% Against Premium Aces.',
      'Always Evaluate Suit Domination In PLO4: Ace-High Flush Draws Are Dramatically Stronger Than King-High Flush Draws Multiway.',
    ],
    relatedSlugs: ['aakk-vs-jt98-plo4', 'aakq-vs-jt98-plo4', 'kkqq-vs-jt98-plo4', 'aa-vs-kk'],
    faqs: [
      {
        question: 'What Are The Odds Of AA Double-Suited Vs KK Double-Suited In PLO4?',
        answer:
          'With Unblocked Suits (As Ah Js Th Vs Kd Kc Qd Jc), AA Double-Suited Holds 65.41% Equity (65.36% Win, 0.09% Tie) Against 34.59% For KK Double-Suited.',
      },
      {
        question: 'Why Does KK Perform So Much Better Against AA In PLO4 Than In Holdem?',
        answer:
          'Each PLO4 Hand Forms 6 Two-Card Combos, Allowing Double-Suited Connected Kings To Make Flushes, Straights, And Two Pairs Rather Than Relying Solely On Flopping A Set.',
      },
      {
        question: 'Should You Fold KK Double-Suited To A 4-Bet In PLO4?',
        answer:
          'Rarely At 100BB Or Less. Premium Double-Suited Kings Retain Roughly 34% To 38% Against Aces And Perform Strongly Against Non-AA 4-Bet Ranges.',
      },
    ],
  },
  {
    slug: 'kkqq-vs-jt98-plo4',
    game: 'plo4',
    gameLabel: '4-Card Pot-Limit Omaha (PLO4)',
    category: 'Pot-Limit Omaha (PLO4)',
    handA: 'KKQQds',
    handAName: 'KKQQ Double-Suited',
    handACards: 'Ks,Kh,Qs,Qh',
    handB: 'JT98ds',
    handBName: 'JT98 Double-Suited',
    handBCards: 'Jd,10c,9d,8c',
    winA: 62.11,
    winB: 37.87,
    tie: 0.02,
    equityA: 62.12,
    equityB: 37.88,
    title: 'KKQQ Vs JT98 PLO4 Odds And Equity',
    h1: 'KKQQ Vs JT98 PLO4 Odds And Preflop Equity',
    description:
      'Exact PLO4 KKQQds Vs JT98ds Odds: Double-Suited Kings-Queens Leads JT98ds 62.12% To 37.88% (62.11% Win, 0.02% Tie) Thanks To Double-Set Power.',
    flopHitNotes: [
      'KKQQ Double-Suited Blocks Two Kings And Two Queens Crucial To JT98ds Upper Straights While Holding Dual High-Set And Double-Flush Equity, Reaching 62.12%.',
      'Interestingly, KKQQds (62.12%) Actually Edges Out AAKKds (61.49%) Against Unblocked JT98ds Because Queen Removal Heavily Cuts JT98ds High Straight Outs.',
      'Even Against A Double-Paired Monster, JT98ds Retains Nearly 38% Equity Via Lower Straights, Flushes, And Two Pairs.',
    ],
    strategicTakeaways: [
      'KKQQ Double-Suited Is A Premium PLO4 3-Bet Hand That Dominates Connected Rundowns And Flops Top Set At Nearly Double Normal Frequency.',
      'Postflop On Ace-High Boards Without A Flush Draw, KKQQds Must Respect Opponent Ace-X Ranges And Shift To Pot Control.',
      'JT98ds Needs Deep Stacks And Position To Outmaneuver High Double Pairs When Low Connected Flops Arrive.',
    ],
    relatedSlugs: ['aakk-vs-jt98-plo4', 'aakq-vs-jt98-plo4', 'aa-double-suited-vs-kk-double-suited-plo4', 'aakk-vs-random-plo4'],
    faqs: [
      {
        question: 'What Are The Odds Of KKQQds Vs JT98ds In PLO4?',
        answer:
          'When Suits Do Not Overlap (Ks Kh Qs Qh Vs Jd Tc 9d 8c), KKQQ Double-Suited Wins 62.11% Of Boards And JT98 Double-Suited Wins 37.87%, With 0.02% Ties.',
      },
      {
        question: 'Why Does KKQQds Slightly Outperform AAKKds Specifically Against JT98ds?',
        answer:
          'Holding Two Queens Directly Blocks JT98ds Top Straight Outs (Q-J-T-9-8 And K-Q-J-T-9), Nudging KKQQds To 62.12% Versus 61.49% For AAKKds.',
      },
      {
        question: 'How Often Does KKQQ Flop At Least One Set In PLO4?',
        answer:
          'With Two Live Pocket Pairs (Four Outs Total), KKQQ Flops A Set Or Better Roughly 22.5% Of The Time.',
      },
    ],
  },
  {
    slug: 'aakkj-vs-jt987-plo5',
    game: 'plo5',
    gameLabel: '5-Card Pot-Limit Omaha (PLO5)',
    category: 'Pot-Limit Omaha (PLO5)',
    handA: 'AAKKJds',
    handAName: 'AAKKJ Double-Suited',
    handACards: 'As,Ah,Ks,Kh,Jc',
    handB: 'JT987ds',
    handBName: 'JT987 Double-Suited',
    handBCards: 'Jd,10c,9d,8c,7d',
    winA: 59.67,
    winB: 40.22,
    tie: 0.11,
    equityA: 59.73,
    equityB: 40.27,
    title: 'AAKKJ Vs JT987 PLO5 Odds And Equity',
    h1: 'AAKKJ Vs JT987 PLO5 Odds And Preflop Equity',
    description:
      'Exact PLO5 AAKKJds Vs JT987ds Odds: Double-Suited AAKKJ Leads Five-Card Rundown JT987ds 59.73% To 40.27%, Highlighting 5-Card PLO Compression.',
    flopHitNotes: [
      'In 5-Card Pot-Limit Omaha (PLO5), Each Hand Forms 10 Two-Card Combinations Out Of 2,598,960 Starting Hands, Compressing Even Elite Double-Suited Aces-Kings-Jack To 59.73% Against JT987ds.',
      'Even Sharing One Jack Blocker With JT987ds, The Five-Card Rundown Still Retains Over 40.2% Equity Via 20-Out Wraps, Flushes, And Multi-Pair Boards.',
      'Compare This Directly With PLO4 And Holdem To See Why PLO5 Demands A 100 To 130 Buy-In Bankroll Cushion.',
    ],
    strategicTakeaways: [
      'Push Aggressive Preflop 3-Bets And 4-Bets With AAKKJ Double-Suited In PLO5 To Drive SPR Low Before Multiway Rundowns Flop Nut Wraps.',
      'In PLO5 Multiway Pots, Unimproved Single-Pair Aces And Second-Nut Flushes Lose Value Rapidly Because Postflop Nut Density Rises By 42% Over PLO4.',
      'Use The Free Smarter.Poker Multi-Variant Odds Calculator To Test Custom 5-Card PLO Hands And Dead-Card Scenarios.',
    ],
    relatedSlugs: ['aakk-vs-jt98-plo4', 'aakq-vs-jt98-plo4', 'aakk-vs-random-plo4', 'aa-double-suited-vs-kk-double-suited-plo4'],
    faqs: [
      {
        question: 'What Are The Odds Of AAKKJds Vs JT987ds In 5-Card PLO?',
        answer:
          'With Unblocked Suits (As Ah Ks Kh Jc Vs Jd Tc 9d 8c 7d), AAKKJ Double-Suited Holds 59.73% Equity (59.67% Win, 0.11% Tie) Against 40.27% For JT987 Double-Suited.',
      },
      {
        question: 'Why Are Preflop Equities Even Closer In PLO5 Than In PLO4?',
        answer:
          'Adding A Fifth Hole Card Raises Two-Card Combinations Per Hand From 6 To 10 (+67%), Giving Connected Five-Card Rundowns Far More Wrap, Flush, And Two-Pair Outs.',
      },
      {
        question: 'How Many Buy-Ins Do Players Need For PLO5 Variance?',
        answer:
          'Smarter.Poker Omaha Variance Benchmarks Recommend 100 To 130 Buy-Ins For PLO5 (155 To 185 BB/100 Standard Deviation) Versus 65 To 85 Buy-Ins For PLO4.',
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
