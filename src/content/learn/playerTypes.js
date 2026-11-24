/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  POKER PLAYER ARCHETYPES & EXPLOITATIVE STRATEGY ENCYCLOPEDIA
 *  (src/content/learn/playerTypes.js)
 * ═══════════════════════════════════════════════════════════════════════════════
 * Authoritative source of truth for /learn/player-types and /learn/player-types/[type].
 * Covers 8 canonical live and online poker player archetypes with HUD VPIP / PFR /
 * 3-Bet benchmarks, core behavioral leaks, preflop and postflop exploitative
 * counter-adjustments, bet-sizing exploits, and FAQs.
 *
 * House style: Title Case, zero em dashes.
 */

export const PLAYER_TYPES_AS_OF = '2026-11-24';
export const PLAYER_TYPES_BASE_PATH = '/learn/player-types';
export const PLAYER_TYPES_URL = 'https://smarter.poker/learn/player-types';

export function playerTypePath(slug) {
  return `/learn/player-types/${slug}`;
}

export const PLAYER_ARCHETYPE_CATEGORIES = [
  'Tight-Passive',
  'Loose-Passive',
  'Loose-Aggressive',
  'Tight-Aggressive',
];

const PLAYER_TYPE_ALIASES = {
  'omc': 'omc-old-man-coffee',
  'old-man-coffee': 'omc-old-man-coffee',
  'nit': 'omc-old-man-coffee',
  'calling-station': 'calling-station-loose-passive',
  'station': 'calling-station-loose-passive',
  'loose-passive': 'calling-station-loose-passive',
  'maniac': 'maniac-hyper-aggressive',
  'whale': 'maniac-hyper-aggressive',
  'hyper-aggressive': 'maniac-hyper-aggressive',
  'tag': 'tag-tight-aggressive-reg',
  'tight-aggressive': 'tag-tight-aggressive-reg',
  'lag': 'lag-loose-aggressive-pro',
  'loose-aggressive': 'lag-loose-aggressive-pro',
  'short-stack': 'short-stack-nit',
  'short-stacker': 'short-stack-nit',
  'trapper': 'tricky-trapper',
  'slow-player': 'tricky-trapper',
  'gto': 'gto-solver-grinder',
  'solver-grinder': 'gto-solver-grinder',
  'gto-wizard': 'gto-solver-grinder',
};

export const PLAYER_ARCHETYPES = [
  {
    slug: 'omc-old-man-coffee',
    code: 'OMC',
    name: 'Old Man Coffee (Ultra-Tight Live Nit)',
    shortTitle: 'Old Man Coffee (OMC) Exploit Guide',
    title: 'Old Man Coffee (OMC) Poker Exploit Guide',
    h1: 'How To Exploit Old Man Coffee (OMC) & Ultra-Tight Live Nits In Cash Games',
    category: 'Tight-Passive',
    vpipRange: '8% - 13%',
    pfrRange: '3% - 6%',
    threeBetRange: '0.8% - 1.5% (Strictly KK+ / AA)',
    wtsdRange: '22% - 26%',
    dangerLevel: 'Low Uncontested, Fatal When Raising Postflop',
    summary:
      'Old Man Coffee (OMC) Is The Classic Ultra-Tight, Risk-Averse Live Cash Game Archetype Who Limps Pocket Jacks To Avoid Losing A Big Pot And Only 3-Bets Preflop With Pocket Aces Or Pocket Kings. Crushing This Profile Requires Relentless Small-Pot Theft And Instant Disbelief Folds Whenever They Wake Up With Large Raises.',
    coreLeaks: [
      'Limp-Calling Strong Hands Like JJ, TT, AQs, And AKo Preflop Out Of Fear Of Facing A 4-Bet.',
      'Revealing Exact Hand Strength Through Bet Sizing: Small Bets Indicate Marginal Top Pair, While Sudden Large Bets Or Check-Raises Signal Sets Or Better.',
      'Over-Folding To Flop And Turn Continuation Bets Whenever They Miss Set-Mining Or Overcard Boards.',
      'Zero Balanced Bluffs On The Turn Or River: A River Raise From An OMC Is The Nuts Over 95% Of The Time.',
    ],
    preflopAdjustments: [
      'Attack Their Blinds Relentlessly From The Cutoff, Button, And Small Blind With 100% Of Playable Hands Using A Minimum 2.2x To 2.5x Open Size.',
      'When An OMC Limps In Early Position And Calls Your Isolation Raise, Cap Their Range At Pocket Pairs 22-JJ And Suited Aces (Still Excluding AA/KK Unless They Limp-Reraise).',
      'If An OMC Limp-3-Bets Or Cold 4-Bets Preflop, Fold Everything Except Pocket Aces Immediately: Even Pocket Queens And Ace-King Offsuit Are Drawing Nearly Dead Against A 1% KK+/AA Range.',
    ],
    postflopAdjustments: [
      'Range C-Bet 25% To 33% Pot On Ace-High And King-High Flops When The OMC Limp-Calls: They Will Check-Fold Unimproved Pocket Pairs 22-99 At High Frequency.',
      'Fire Delayed Turn Barrels Whenever An OMC Checks Twice On Disconnected Boards, As They Almost Never Slow-Play Two Streets Without Putting Money In.',
      'Over-Fold Overpairs (Including AA And KK) Immediately When An OMC Check-Raises The Turn Or Leads Big On The River.',
    ],
    betSizingExploits:
      'Use Minimum 25% To 33% Pot Bet Sizes When Bluffing An OMC (Since Their Folding Threshold Is Inelastic To Size Once Missed) And Size Down To 40% To 50% Pot When Value-Betting Thin On The River So Their Capped One-Pair Hands Can Find A Crying Call.',
    faqs: [
      {
        q: 'What Does An Old Man Coffee (OMC) 3-Bet Range Look Like In Live $1/$3 Or $2/$5?',
        a: 'In Live Low-Stakes Cash Games, A True OMC 3-Bets Only 0.9% To 1.5% Of Hands (Pocket Aces, Pocket Kings, And Occasionally Pocket Queens Or Ace-King Suited). Many OMCs Will Even Flat-Call QQ And AK To "See A Safe Flop First."',
      },
      {
        q: 'Should I Ever Call An OMC River Raise With Top Two Pair Or An Overpair?',
        a: 'No. Because An OMC Never Turns A One-Pair Hand Or Missed Draw Into A River Raise Bluff, Their River Raising Range Consists Exclusively Of Sets, Straights, Flushes, And Full Houses. Folding AA Or Top Two Pair Saves An Entire Buy-In.',
      },
      {
        q: 'How Do I Punish An OMC Who Limps Every Pocket Pair To Set-Mine?',
        a: 'Isolate Their Limps In Position To 4x+1BB And Continuation Bet High-Card Boards Small, Then Refuse To Pay Them Off When A Low Card Pairs Or Completes An Obvious Straight On The Turn.',
      },
    ],
  },
  {
    slug: 'calling-station-loose-passive',
    code: 'STATION',
    name: 'Calling Station (Loose-Passive Recreational)',
    shortTitle: 'Calling Station Exploit Guide',
    title: 'Calling Station Poker Exploit Guide',
    h1: 'How To Exploit Calling Stations & Loose-Passive Players For Maximum Value',
    category: 'Loose-Passive',
    vpipRange: '42% - 68%',
    pfrRange: '4% - 10%',
    threeBetRange: '1.0% - 2.5%',
    wtsdRange: '38% - 48%',
    dangerLevel: 'High Bankroll Donor (Dangerous If You Bluff Them)',
    summary:
      'The Loose-Passive Calling Station Is The Most Profitable Opponent In Poker. Entering Over 45% Of Pots By Limping And Cold-Calling, They Hate Folding Any Pair, Gutshot, Or Backdoor Flush Draw. The Universal Exploit Is Simple: Eliminate Low-Equity Bluffs And Value-Bet Thin With Expanded Sizing Across All Three Streets.',
    coreLeaks: [
      'Calling Preflop Raises Out Of Position With Dominated Offsuit Hands (K7o, Q8o, A4o, J9o) That Suffer Severe Reverse Implied Odds.',
      'Inelastic Postflop Calling: Calling 85% Pot Just As Often As 33% Pot When Holding Top Pair Weak Kicker, Middle Pair, Or Any Flush Draw.',
      'Chasing Negative-EV Gutshots And Naked Overcards Out Of Position Without Proper Direct Or Implied Pot Odds.',
      'Failing To Protect Their Checking Range: When They Finally Bet Big On The River After Calling Twice, They Usually Hit Their Draw.',
    ],
    preflopAdjustments: [
      'Isolate Their Limps Aggressively With A Merged Linear Value Range (ATo+, KJo+, QJs, 77+, Suited Aces) Sized At 4x To 5x Plus 1BB Per Limper.',
      'Drop Low-Card Pure Bluffs (Like 64s Or Offsuit Connectors) From Your Early Isolation Range Because You Will Rarely Win The Pot Without Making A Pair.',
      'Size Up Your Preflop 3-Bets For Value (4x In Position, 5x Out Of Position) When Holding JJ+, AK, And AQs Since A Calling Station Will Still Call With Dominated Hands.',
    ],
    postflopAdjustments: [
      'Eliminate Multi-Street Air Bluffs Completely: Never Triple-Barrel A Calling Station Hoping To Fold Out Middle Pair Or Bottom Pair.',
      'Widen Your Three-Street Value-Betting Threshold To Include Top Pair Good Kicker And Strong Second Pair On Uncoordinated Runouts.',
      'Check Back Marginal Draws On The Turn To Realize Free Equity Rather Than Semi-Bluffing Into An Opponent Who Never Folds.',
    ],
    betSizingExploits:
      'Abandon Solver 25% To 33% Small Range C-Bets When Holding Strong Value: Size Immediately To 75% To 100% Pot On The Flop And Turn With Top Pair Or Better Because A Calling Station\'s Calling Frequency Is Inelastic To Bet Size.',
    faqs: [
      {
        q: 'Why Does GTO Small 33% Flop C-Betting Cost Money Against A Calling Station?',
        a: 'Solvers Use 33% Pot Bets To Pressure Balanced Opponents Who Fold At Minimum Defense Frequency. Because A Calling Station Calls Any Pair Or Draw Regardless Of Whether You Bet $15 Or $45, Betting Small With Top Pair Leaves Massive Value On The Table.',
      },
      {
        q: 'Should I Ever Bluff A Calling Station On The Flop?',
        a: 'Only On Ultra-Dry Disconnected Boards (Such As K-7-2 Rainbow) Where Even A Loose Player Missed 65% Of The Time. If They Call Your Flop C-Bet, Shut Down Immediately Unless You Improve.',
      },
      {
        q: 'What Does It Mean When A Passive Calling Station Suddenly Raises The River?',
        a: 'When A Loose-Passive Player Calls Flop And Turn And Suddenly Check-Raises Or Leads Big On The River, Their Range Shifts From Passive Showdown Hands To Completed Flushes, Straights, Or Two Pair. Fold One-Pair Bluff-Catchers.',
      },
    ],
  },
  {
    slug: 'maniac-hyper-aggressive',
    code: 'MANIAC',
    name: 'Hyper-Aggressive Maniac (Action Whale)',
    shortTitle: 'Hyper-Aggressive Maniac Exploit Guide',
    title: 'Maniac Poker Player Exploit Guide',
    h1: 'How To Beat Hyper-Aggressive Maniacs & Action Whales In Cash Games',
    category: 'Loose-Aggressive',
    vpipRange: '48% - 75%',
    pfrRange: '35% - 58%',
    threeBetRange: '16% - 28%',
    wtsdRange: '34% - 42%',
    dangerLevel: 'High Variance, Ultra-High Expected Winrate',
    summary:
      'The Hyper-Aggressive Maniac Raises, 3-Bets, And Overbet-Barrels Nearly Every Pot To Bully Tight Regulars Off Medium-Strength Hands. Beating A Maniac Requires Emotional Discipline, Sitting To Their Direct Left When Possible, Let-Them-Hang-Themselves Trap Lines, And Calling Down Lighter With Top And Middle Pair.',
    coreLeaks: [
      'Spewing Chips With Zero-Equity Triple-Barrel Bluffs Into Uncapped Calling Ranges.',
      '3-Betting And 4-Betting Trash Offsuit Hands (K5o, Q7s, J8o) That Collapse Against Linear 4-Bet Value Ranges.',
      'Inability To Check Back And Take A Free Card Or Accept A Small Pot Loss When Checked To.',
      'Tilting And Escalating Bet Sizes Further After Losing A Showdown To A Trap Call.',
    ],
    preflopAdjustments: [
      'Tighten Your Trash Opens And Shift To A Merged High-Card & Pocket-Pair Value Range (88+, ATo+, KQo, A9s+, KTs+) That Dominates Their Wide Raising Range.',
      'Flat-Call More 3-Bets In Position With Hands Like AQs, AKo, JJ, And TT To Keep All Of The Maniac\'s Dominated Bluffs In The Pot Postflop.',
      '4-Bet For Value Wider (99+, AQ+) When Stacks Are 100BB Or Shorter And Be Prepared To Call Their Inevitable 5-Bet Shove.',
    ],
    postflopAdjustments: [
      'Under-Represent Your Hand Strength: Check Top Pair Top Kicker, Overpairs, And Sets To Allow The Maniac To Fire All Three Streets For You.',
      'Prioritize Unblocking Bluff-Catchers: Call Down With Hands That Do Not Block The Maniac\'s Missed Flush And Straight Draws.',
      'Avoid Slow-Playing Vulnerable One-Pair Hands Multiway, But Heads-Up Against The Maniac Let Them Drive The Betting Action.',
    ],
    betSizingExploits:
      'When You Do Bet Or Raise Against A Maniac, Use Inducing Small Sizes Or Click-Back Min-Raises That Trigger Their Ego To Re-Raise All-In With Air Or Weak Draws.',
    faqs: [
      {
        q: 'Should I Sit To The Left Or Right Of A Hyper-Aggressive Maniac?',
        a: 'Sitting Directly To The Maniac\'s Left Gives You Absolute Positional Advantage On Every Street After They Open-Raise. However, Sitting To Their Right Also Works Well If You Plan To Limp-Reraise Or Check-Call Trap Their Automatic Continuation Bets.',
      },
      {
        q: 'Why Is Top Pair Weak Kicker Suddenly A 3-Street Stack-Off Hand Against A Maniac?',
        a: 'Against A Normal Regular, Top Pair Weak Kicker Has Only ~28% Equity Facing Three Big Barrels. Against A Maniac Firing 60%+ Of Their Range Across Three Streets, Top Pair Holds 65%+ Equity And Must Be Called Down.',
      },
      {
        q: 'How Do I Handle The High Variance Of Playing Against A Maniac?',
        a: 'Accept Ahead Of Time That A Maniac Will Occasionally Suck Out With 8-4 Offsuit Making Two Pair. Keep 30+ Buy-Ins In Your Bankroll And Focus Purely On Getting Your Chips In With 65%+ Equity.',
      },
    ],
  },
  {
    slug: 'tag-tight-aggressive-reg',
    code: 'TAG',
    name: 'Tight-Aggressive Regular (ABC TAG Reg)',
    shortTitle: 'Tight-Aggressive (TAG) Reg Exploit Guide',
    title: 'Tight-Aggressive (TAG) Poker Exploit Guide',
    h1: 'How To Exploit Tight-Aggressive (TAG) Regulars & ABC Cash Game Grinders',
    category: 'Tight-Aggressive',
    vpipRange: '18% - 23%',
    pfrRange: '15% - 19%',
    threeBetRange: '6.5% - 8.5%',
    wtsdRange: '25% - 28%',
    dangerLevel: 'Moderate (Solid Baseline, Predictable In Polarized Spots)',
    summary:
      'The Tight-Aggressive (TAG) Regular Forms The Backbone Of Mid-Stakes Live ($2/$5) And Online (NL25-NL100) Player Pools. They Follow Disciplined Preflop Charts And C-Bet Flops Consistently, But They Frequently Under-Bluff Rivers, Cap Their Checking Ranges On The Turn, And Over-Fold To Polarized Check-Raises.',
    coreLeaks: [
      'Unprotected Turn Check-Back Ranges: When An ABC TAG Bets The Flop And Checks Back The Turn, They Almost Never Hold Top Pair+ And Will Fold To A River Overbet.',
      'Under-Bluffing 3-Bet Pots On The River: Once Called On The Flop And Turn In A 3-Bet Pot, Many TAGs Give Up With Missed AK/AQ On Brick Rivers.',
      'Over-Folding To Flop Check-Raises And Turn Probe Bets On Low Connected Textures That Favor The Big Blind.',
      'Predictable Linear 3-Betting Without Sufficient Suited Wheel Ace Or Suited Connector Board Coverage.',
    ],
    preflopAdjustments: [
      'Defend Your Big Blind Aggressively Against Their Standard 2.2x To 2.5x Steals And Mix In Polarized 3-Bet Bluffs (A5s-A2s, K9s, Q9s, 76s) Where They Over-Fold Medium Opens.',
      '4-Bet Bluff Selectively In Late-Position Cutoff Vs Button And Small Blind Vs Button Wars: ABC TAGs Often Fold The Bottom 60% Of Their 3-Bet Range To A Cold 2.3x 4-Bet.',
      'Avoid Cold-Calling Their Early-Position (UTG/MP) Opens With Dominated Offsuit Broadways Like AJo Or KQo.',
    ],
    postflopAdjustments: [
      'Float Flop C-Bets In Position With Backdoor Flush And Straight Equity, Then Attack The Turn With A 66% To 75% Bet Whenever The TAG Checks.',
      'Use Delayed Turn Probe Bets And River Overbets (125% Pot) From Out Of Position Whenever The TAG Checks Back The Flop Or Turn.',
      'Over-Fold Bluff-Catchers When An ABC TAG Fires A Triple Barrel Into A Dry Board: Average TAG Pools Under-Bluff Triple-Barrel Lines By 8% To 12% Compared To GTO.',
    ],
    betSizingExploits:
      'Use Polarized 75% Turn And 125% River Overbets Against TAG Capped Ranges: Because TAGs Study Pot Odds And Minimum Defense Frequency, Large Polarized Sizing Forces Their One-Pair Hands Into High-Pressure Indifference Folds.',
    faqs: [
      {
        q: 'What Is The Biggest Postflop Leak Of A Standard Tight-Aggressive (TAG) Regular?',
        a: 'Capping Their Range When They Check. Most ABC TAGs Always Bet Their Strong Hands (Top Pair Good Kicker, Overpairs, Sets) On The Flop And Turn, Meaning Whenever They Check, Their Range Consists Almost Entirely Of Weak Showdown Value That Folds To River Pressure.',
      },
      {
        q: 'Should I Hero-Call A Tight-Aggressive Regular\'s River Triple Barrel?',
        a: 'In Mass Data Analysis (MDA) Of Both Live $2/$5 And Online NL50-NL200 Pools, Standard TAGs Under-Bluff River Triple Barrels Significantly. Unless The Board Contains Obvious Missed Front-Door Draws That You Unblock, Over-Folding Pure Bluff-Catchers Increases Winrate.',
      },
      {
        q: 'How Do I Exploit A TAG Who C-Bets 80%+ Of Flops Small (33% Pot)?',
        a: 'Respond By Check-Raising At A Higher Frequency (18% To 24%) Across Both Value And High-Equity Backdoor Semibluffs, Forcing Them To Fold The Wide Air Portion Of Their Range C-Bet.',
      },
    ],
  },
  {
    slug: 'lag-loose-aggressive-pro',
    code: 'LAG',
    name: 'Loose-Aggressive Pro (Creative Pressure LAG)',
    shortTitle: 'Loose-Aggressive (LAG) Pro Exploit Guide',
    title: 'Loose-Aggressive (LAG) Poker Exploit Guide',
    h1: 'How To Counter Loose-Aggressive (LAG) Pros & High-Pressure Regulars',
    category: 'Loose-Aggressive',
    vpipRange: '27% - 34%',
    pfrRange: '22% - 29%',
    threeBetRange: '10.5% - 14.5%',
    wtsdRange: '28% - 32%',
    dangerLevel: 'High (Applies Relentless Positional & Overbet Pressure)',
    summary:
      'A Skilled Loose-Aggressive (LAG) Player Leverages Wide Positional Ranges, Frequent 3-Bet Squeezes, Turn Check-Raises, And Polarized River Overbets To Put Maximum Stress On Capped Ranges. Countering A LAG Requires Protecting Your Checking Ranges, 4-Betting Wider, And Refusing To Be Pushed Off Medium-Strong Showdown Value.',
    coreLeaks: [
      'Over-Attacking Protected Checking Ranges When They Misread A Trap Check As Weakness.',
      'Barrel-Bluffing Too Frequently On Brick Rivers When Opponents Hold Uncapped Check-Call Ranges.',
      'Opening And 3-Betting Slightly Too Wide From Middle And Late Position, Leaving Them Vulnerable To Disciplined 4-Bets.',
      'Fighting Too Hard For Small Uncontested Pots Out Of Position When Stack-To-Pot Ratios Are Awkward.',
    ],
    preflopAdjustments: [
      'Defend Against Their High 12%+ 3-Bet Frequency By Expanding Your 4-Bet Value And 4-Bet Bluff Ranges (Adding A5s-A2s, KQs, AJo Blockers, And 99+).',
      'Flat-Call Some Premium Hands (AA, KK, AKs) In Position Against Their 3-Bets To Keep Their Wide Bluffing Range Active Postflop.',
      '3-Bet Isolate Their Wide Cutoff And Button Opens From The Blinds At 13% To 16% Frequency With Linear Value Plus High-Card Blockers.',
    ],
    postflopAdjustments: [
      'Protect Your Check-Back And Check-Call Lines By Mixing Top Pair Top Kicker, Overpairs, And Flopped Sets Into Your Check Range.',
      'Call Down Lighter On Runouts Where Front-Door Flush And Straight Draws Brick Out, Prioritizing Hands That Do Not Block The LAG\'s Bluffs.',
      'Use Re-Bluff Turn Check-Raises Or River Check-Shoves When You Block The Nuts And Know The LAG Is Auto-Barreling A Capped Line.',
    ],
    betSizingExploits:
      'Let The LAG Dictate Larger Pot Sizes When You Hold Strong Uncapped Value By Checking To Induce Their 75% To 125% Overbets, And Use Compact 2.2x To 2.4x 4-Bet Sizings Preflop To Punish Their Wide 3-Bet Frequency Efficiently.',
    faqs: [
      {
        q: 'What Is The Difference Between A Skilled LAG And A Reckless Maniac?',
        a: 'A Maniac Bluffs Randomly With No Regard For Board Texture Or Range Advantage. A Skilled LAG Targets Specific Scare Cards, Capped Opponent Checking Lines, And Blocker Spots While Knowing How To Fold When Met With Uncapped Resistance.',
      },
      {
        q: 'How Do I Stop A LAG From Barrelling Every Time I Check?',
        a: 'Start Checking Back Or Check-Calling With A Portion Of Your Monster Hands (Such As AA On K-8-3 Or Top Set On Dry Boards). Once The LAG Runs Into Two Protected Traps At Showdown, Their Auto-Barrel Frequency Will Drop Immediately.',
      },
      {
        q: 'Which Hands Make The Best Bluff-Catchers Against A LAG On The River?',
        a: 'Second Pair Or Top Pair With Cards That Unblock Missed Flush Draws And Straight Draws (For Example, Holding Two Red Cards When A Two-Spade Flop Bricks Out).',
      },
    ],
  },
  {
    slug: 'short-stack-nit',
    code: 'SHORT-STACK',
    name: 'Short-Stack Capper (20BB - 40BB Live / Online Short-Stacker)',
    shortTitle: 'Short-Stack Nit Exploit Guide',
    title: 'Short-Stack Poker Player Exploit Guide',
    h1: 'How To Adjust & Exploit Short-Stack Players (20BB To 40BB Buy-In Cappers)',
    category: 'Tight-Aggressive',
    vpipRange: '14% - 19%',
    pfrRange: '12% - 17%',
    threeBetRange: '8% - 12% (Mostly All-In Or Commit-3-Bets)',
    wtsdRange: '32% - 38% (Low SPR All-Ins)',
    dangerLevel: 'Moderate (Kills Your Implied Odds If You Call Speculative Hands)',
    summary:
      'Short-Stackers Buy In For The Table Minimum (20BB To 40BB) To Simplify Postflop Decisions, Eliminate Deep-Stack Positional Disadvantage, And Push High-Card Equity All-In On The Flop Or Preflop. The Key Counter-Adjustment Is Eliminating Speculative Implied-Odds Calls And Shifting To High-Card Raw Equity.',
    coreLeaks: [
      'Predictable Preflop Commitment Thresholds: Limp-Shoving Or 3-Bet Shoving A Narrow Range Of 77-JJ, AQ, And AK.',
      'Stacking Off Automatically On The Flop With Any Top Pair Or Overpair Because Stack-To-Pot Ratio (SPR) Is Under 2.0.',
      'Zero Ability To Apply Multi-Street River Bluff Pressure Because They Lack Behind-Stack Leverage.',
      'Failing To Adjust When Deep-Stacked Opponents Isolate Them Purely With High-Equity Broadways.',
    ],
    preflopAdjustments: [
      'Stop Calling Their Opens Or 3-Bets With Small Pocket Pairs (22-66) And Low Suited Connectors (65s, 76s): At 30BB Effective Depth, You Lack The 15-To-1 Implied Odds Required To Set-Mine.',
      'Prioritize Big High-Card Hands (ATo+, KQo, AJs+, 88+) That Dominate Their Short-Stack Shoving Range In Raw Preflop Equity.',
      'When Deep-Stacked Players Are Also In The Pot, Size Your Opens And 3-Bets Carefully So You Do Not Re-Open The Action To A Short-Stack 22BB Jam.',
    ],
    postflopAdjustments: [
      'Treat Every Single-Raised Pot Against A 30BB Short-Stack As A Low-SPR Commitment Spot Where Top Pair Good Kicker Is An Automatic Stack-Off.',
      'Never Float Or Run Elaborate Multi-Street Bluffs Against A Short-Stack Who Has Already Committed 35%+ Of Their Chips Preflop.',
      'Use Small 25% To 33% Flop C-Bets In Heads-Up Pots: At Low SPR, A 33% Bet Generates The Same Fold Equity Against Unpaired Overcards As A 75% Bet.',
    ],
    betSizingExploits:
      'In Heads-Up Pots Against A 25BB-40BB Stack, Use Small 25% Flop C-Bets And Geometric Turn Shoves To Force Their Unimproved Ace-High And Pocket Underpairs Into Negative-EV Decisions.',
    faqs: [
      {
        q: 'Why Is Set-Mining With Small Pocket Pairs (22-66) A Leak Against A 35BB Short-Stack?',
        a: 'You Flop A Set Only 11.8% Of The Time (Roughly 1 In 8.5). To Profitably Call A 3BB Open Purely For Set Value, You Need At Least 45BB To 60BB In Effective Stack Depth Behind. Against A 35BB Stack, Calling 3BB Burns EV.',
      },
      {
        q: 'How Does A Short-Stacker Change Multiway Deep-Stack Pots?',
        a: 'A Short-Stack All-In Creates A Main Pot And A Dry Side Pot. Never Bluff Into A Dry Side Pot With Zero Extra Money Unless You Also Have Equity To Beat The All-In Short-Stacker For The Main Pot.',
      },
      {
        q: 'What Hands Do Live $1/$3 Short-Stackers Typically Limp-Reraise Shove With?',
        a: 'Live Short-Stack Limp-Shoves Consist Almost Entirely Of Two Buckets: Monster Traps (AA, KK) Or Medium Hands Afraid Of Seeing A Flop (88-JJ, AKo, AQo). Call With QQ+, AKs And Fold Medium Suited Hands.',
      },
    ],
  },
  {
    slug: 'tricky-trapper',
    code: 'TRAPPER',
    name: 'Tricky Slow-Player & Check-Raise Trapper',
    shortTitle: 'Tricky Trapper Exploit Guide',
    title: 'Tricky Trapper Poker Exploit Guide',
    h1: 'How To Exploit Tricky Slow-Players & Deceptive Trap-Heavy Opponents',
    category: 'Tight-Passive',
    vpipRange: '24% - 32%',
    pfrRange: '10% - 16%',
    threeBetRange: '3.5% - 6.0%',
    wtsdRange: '30% - 35%',
    dangerLevel: 'Moderate (Dangerous Only If You Blindly Barrel Into Their Checks)',
    summary:
      'The Tricky Trapper Loves Limp-Reraising Preflop, Flat-Calling Pocket Aces And Sets On Wet Boards, And Waiting Until The Turn Or River To Spring A Check-Raise. Once Identified, They Are Highly Exploitable Because They Give You Infinite Free Cards To Realize Your Equity And Fail To Charge Your Draws.',
    coreLeaks: [
      'Giving Free Turn And River Cards On Coordinated Two-Tone Boards By Slow-Playing Sets, Two Pair, And Overpairs.',
      'Telegraphing Monster Hands Through Sudden Passive Check-Calls On Flops Where A Normal Player Would Raise Or Fast-Play.',
      'Missing Massive Value Preflop And On The Flop Because Pots Remain Tiny Until The River.',
      'Checking Back Weak-To-Medium Hands Passively While Reserve-Pricing Check-Raises Exclusively For Nutted Monsters.',
    ],
    preflopAdjustments: [
      'Beware The Early-Position Limp: When A Known Trapper Limps UTG, Check Back Your Option Or Isolate With High-Playability Suited Hands Ready To Fold To A Limp-3-Bet.',
      'When A Trapper Smooth-Calls Your 3-Bet Out Of Position Or Cold-Calls A 3-Bet, Immediately Keep AA, KK, And QQ In Their Range.',
      'Realize Cheap Preflop Equity With Suited Connectors And Small Pairs In Position Because The Trapper Rarely Squeezes Aggressively.',
    ],
    postflopAdjustments: [
      'Take Free Cards Shamelessly In Position: When A Trapper Checks To You On The Turn After Smooth-Calling The Flop, Check Back Medium Showdown Value And Draws To Realize 100% Free River Equity.',
      'Respect Delayed Turn And River Check-Raises: When A Trapper Finally Springs The Trap On The Turn Or River, Fold One-Pair And Overpair Hands Immediately.',
      'Value-Bet Thin On The River When The Trapper Checks Three Times: Because They Always Spring Their Trap By The River Bet, A Third Check Means Their Trap Failed Or They Hold A Weak Pair.',
    ],
    betSizingExploits:
      'Use Pot-Control Check-Backs On The Turn With Medium Pairs To Deny The Trapper Their Check-Raise Street, And Size Down To 50% Pot On The River So You Can Comfortably Bet-Fold If They Wake Up With A Monster.',
    faqs: [
      {
        q: 'How Do I Punish An Opponent Who Slow-Plays Every Flopped Set And Two Pair?',
        a: 'Stop Auto-Barrelling The Turn With Air And Medium Top Pairs When They Smooth-Call The Flop. Check Back The Turn To Take A Free River Card With Your Draws And Force Them To Play A Small Pot With Their Monster.',
      },
      {
        q: 'What Does It Mean When A Tricky Trapper Checks All Three Streets And Then Calls?',
        a: 'If A Trapper Checks Flop, Turn, And River Without Ever Check-Raising Or Leading Out, Their Range Is Capped At One-Pair Bluff-Catchers Or Missed Traps. You Can Profitably Value-Bet Thin In Position On The River.',
      },
      {
        q: 'Why Is Slow-Playing Sets On Wet Boards A Major Mathematical Leak?',
        a: 'On A Coordinated Two-Tone Board (Like J-T-8 With Two Spades), Over 40% Of Turn Cards Complete A Straight, Flush, Or Pair The Board. Slow-Playing Allows Opponents To Draw Out For Free While Keeping The Pot Under 15 Big Blinds.',
      },
    ],
  },
  {
    slug: 'gto-solver-grinder',
    code: 'GTO-PRO',
    name: 'GTO Solver Grinder (Balanced Theory Regular)',
    shortTitle: 'GTO Solver Grinder Exploit Guide',
    title: 'GTO Solver Grinder Poker Exploit Guide',
    h1: 'How To Play Against & Counter GTO Solver Grinders In Modern Poker',
    category: 'Tight-Aggressive',
    vpipRange: '23% - 27%',
    pfrRange: '19% - 23%',
    threeBetRange: '9.0% - 11.5%',
    wtsdRange: '27% - 30%',
    dangerLevel: 'Very High (Unexploitable Baseline, Vulnerable To Off-Tree Simplifications)',
    summary:
      'The GTO Solver Grinder Studies 100BB Equilibrium Range Matrices, Mixed Check-Raise Frequencies, And Blocker-Driven River Overbets. While They Offer Few Obvious Preflop Leaks, Human Solver Grinders Can Be Pressured By Taking Them Off-Tree With Non-Standard Bet Sizings, Deep-Stack 200BB+ Dynamics, And Exploitatively Denying Indifference.',
    coreLeaks: [
      'Difficulty Recalculating Frequencies Off-Tree When Facing Non-Standard Preflop Sizings, Straddles, Or Multiway Live Pots.',
      'Over-Relying On Blocker Hero-Calls Against Players Who Are Actually Under-Bluffing Specific Lines.',
      'Attempting To Replicate Complex Mixed-Frequency Solver Checks And Small Bets That Become Readable Through Timing Tells.',
      'Paying High Rake In Low-To-Mid Stakes Games By Defending Wide Big Blind And 3-Bet Calling Ranges Designed For Lower-Rake Environments.',
    ],
    preflopAdjustments: [
      'Stick To Tight, Clean Linear And Polarized 100BB Ranges Yourself So You Give Up Zero Preflop EV.',
      'Introduce Non-Standard Stack Depths (200BB+ Match-The-Stack Or Mandatory Straddles) Where Memorized 100BB 6-Max Solver Charts No Longer Apply.',
      'Avoid Pure Ego Battles Out Of Position: Focus Your Creative Exploits On The Recreational Players At The Table Rather Than Engaging In High-Rake Reg Wars.',
    ],
    postflopAdjustments: [
      'Skew Your Value-To-Bluff Ratios Based On The Grinder\'s Blocker Biases: Against A Solver Grinder Who Hero-Calls Every Time They Hold An Ace Or Flush-Blocker, Shift Your River Range Purely To Value.',
      'Use Non-Standard Overbet Or Half-Pot Sizings On Early Streets To Force Them Out Of Memorized 33% / 75% Solver Decision Trees.',
      'Watch Their Timing Speed Carefully: Human Players Implementing Mixed 50/50 Solver Checks Almost Always Tank Before Checking A Strong Hand And Snap-Check Weak Air.',
    ],
    betSizingExploits:
      'When Value-Betting The River Against A Solver Grinder Who Understands Minimum Defense Frequency (MDF) And Blocker Theory, Use Full 125% To 150% Pot Overbets With Your Nutted Hands Because They Are Forced To Hero-Call With Bluff-Catchers To Avoid Being Exploited.',
    faqs: [
      {
        q: 'Why Is Value-Heavy Overbetting Effective Against A Studied GTO Grinder?',
        a: 'A Recreational Nit Folds Everything Except The Nuts To A 150% River Overbet. A Studied GTO Grinder Knows They Must Defend ~40% Of Their Range Against A 150% Overbet To Prevent Over-Folding, Which Means They Will Pay Off Your Nutted Value Overbets With One-Pair Bluff-Catchers.',
      },
      {
        q: 'How Do Timing Tells Expose Human Players Trying To Play GTO?',
        a: 'A Computer Solver Mixes Checking And Betting Instantly. A Human Who Flops Top Set On A Board Where The Solver Checks 30% Of The Time Usually Pauses For 4 To 6 Seconds To Decide Whether To Slow-Play, Whereas They Snap-Check Complete Air In Under 1 Second.',
      },
      {
        q: 'Should I Fight A GTO Grinder Or Change Tables?',
        a: 'In Poker, Your Winrate Comes From The Mistakes Of Your Opponents. If A Table Has Five GTO Grinders And Zero Recreational Players, The Highest-EV Exploit Is Immediate Table Selection.',
      },
    ],
  },
];

export function findPlayerArchetype(slug) {
  if (!slug) return null;
  const clean = String(slug).trim().toLowerCase();
  const target = PLAYER_TYPE_ALIASES[clean] || clean;
  return (
    PLAYER_ARCHETYPES.find(
      (p) => p.slug === target || p.code.toLowerCase() === target
    ) || null
  );
}

export function renderPlayerTypesIndexMarkdown() {
  const lines = [
    '# Poker Player Archetypes & Exploitative Strategy Hub (8 Canonical Profiles)',
    '',
    `Last Verified: ${PLAYER_TYPES_AS_OF}`,
    `Canonical URL: ${PLAYER_TYPES_URL}`,
    '',
    '## HUD VPIP / PFR / 3-Bet Comparison Table',
    '',
    '| Archetype | Category | VPIP | PFR | 3-Bet % | WTSD % |',
    '| :--- | :--- | :--- | :--- | :--- | :--- |',
    ...PLAYER_ARCHETYPES.map(
      (p) =>
        `| [${p.name}](${PLAYER_TYPES_URL}/${p.slug}) | ${p.category} | ${p.vpipRange} | ${p.pfrRange} | ${p.threeBetRange} | ${p.wtsdRange} |`
    ),
    '',
  ];
  return lines.join('\n');
}

export function renderPlayerTypeDetailMarkdown(typeOrSlug) {
  const p =
    typeof typeOrSlug === 'string' ? findPlayerArchetype(typeOrSlug) : typeOrSlug;
  if (!p) return '';
  return [
    `# ${p.h1}`,
    '',
    `- **Archetype Code:** ${p.code}`,
    `- **Category:** ${p.category}`,
    `- **VPIP Range:** ${p.vpipRange}`,
    `- **PFR Range:** ${p.pfrRange}`,
    `- **3-Bet Range:** ${p.threeBetRange}`,
    `- **WTSD Range:** ${p.wtsdRange}`,
    '',
    '## Executive Summary',
    p.summary,
    '',
    '## Core Behavioral Leaks',
    ...p.coreLeaks.map((l) => `- ${l}`),
    '',
    '## Preflop Exploitative Adjustments',
    ...p.preflopAdjustments.map((l) => `- ${l}`),
    '',
    '## Postflop Exploitative Adjustments',
    ...p.postflopAdjustments.map((l) => `- ${l}`),
    '',
    '## Bet-Sizing Exploit Protocol',
    p.betSizingExploits,
    '',
  ].join('\n');
}
