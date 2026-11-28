/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  POKER LEAK DIAGNOSTIC & FIX ENCYCLOPEDIA (src/content/learn/leaks.js)
 * ═══════════════════════════════════════════════════════════════════════════════
 * Authoritative source of truth for /learn/leaks and /learn/leaks/[slug].
 * Covers 12 high-cost poker leaks with HUD symptom metrics, BB/100 EV loss
 * benchmarks, root causes, solver cures, If/Then/Because causal rules, paired
 * calculators, training drills, and FAQs.
 *
 * House style: Title Case, zero em dashes.
 */

export const LEAKS_AS_OF = '2026-11-24';
export const LEAKS_BASE_PATH = '/learn/leaks';
export const LEAKS_URL = 'https://smarter.poker/learn/leaks';
export const LEAKS_DOI = '10.5281/zenodo.24115647';

export function leakPath(slug) {
  return `/learn/leaks/${slug}`;
}

export const LEAK_CATEGORIES = [
  'Preflop & Blind Defense Leaks',
  'Flop & Turn Continuation Leaks',
  'River Sizing & Value Leaks',
  'Tournament ICM & Mental Leaks',
];

export const POKER_LEAKS = [
  {
    slug: 'overfolding-big-blind',
    code: 'LEAK-01-BB-FOLD',
    name: 'Over-Folding The Big Blind To Late-Position Steals',
    shortTitle: 'Over-Folding The Big Blind Leak Fix',
    title: 'Over Folding Big Blind Poker Leak Fix',
    h1: 'Over-Folding The Big Blind To Steals: HUD Diagnosis & GTO Defense Cure',
    category: 'Preflop & Blind Defense Leaks',
    symptomHudMetric: 'Fold BB To Steal > 64% (GTO Target: 42% - 50% vs 2.2x-2.5x Open)',
    evLossBb100: '-4.2 To -7.8 BB/100 Overall Winrate Bleed',
    rootCause:
      'Players Treat The 1.0BB Already Posted In The Big Blind As Lost Money Or Fear Playing Weak Suited Hands Out Of Position, Failing To Realize That A 2.2x Button Open Offers 2.92-To-1 Pot Odds (3.75-To-1 With A 1BB Ante).',
    solverCure:
      'Defend 52% To 60% Of Hands In The Big Blind Against A 2.2x-2.5x Button Open By Calling Wide With All Suited Aces, Suited Kings, Suited Connectors, Suited Gappers, And Pocket Pairs While Polarized/Linear 3-Betting 12% To 14%.',
    ifThenBecause:
      'If Your Fold-BB-To-Steal Stat Exceeds 60% Against Cutoff And Button Min-Opens -> Then Add Suited Gappers (97s, 86s, K5s, Q6s) And Polarized 3-Bet Bluffs (A5s-A2s, K9s) -> Because Over-Folding Allows Opponents To Print +0.65BB Automatic Profit With Any Two Cards.',
    calculatorHref: '/tools/preflop-ranges',
    drillHref: '/hub/training/position-mastery',
    faqs: [
      {
        q: 'What Is The baseline Expected Winrate From The Big Blind In 6-Max Cash Games?',
        a: 'Because You Start Every Big Blind Hand At -100 BB/100 Automatically, Even A World-Class GTO Solver Loses Roughly -28 To -32 BB/100 From The Big Blind. Over-Folders Lose -55 To -70 BB/100 From The Big Blind.',
      },
      {
        q: 'How Does High Live Casino Rake Change Big Blind Defense Width?',
        a: 'In A High-Rake Live $1/$3 Game ($6-$7 Drop), Trim Offsuit Trash Calls From Your Big Blind Defense And Shift 3% To 5% More Hands Into 3-Bet-Or-Fold Lines (No Flop, No Drop).',
      },
      {
        q: 'How Do I Play Postflop After Defending Wide In The Big Blind?',
        a: 'Use Range Check-Raises (14% To 22%) On Low And Middling Connected Flops Where Your Big Blind Range Holds The Two-Pair And Straight Nut Advantage.',
      },
    ],
  },
  {
    slug: 'calling-3bets-out-of-position',
    code: 'LEAK-02-OOP-3BET',
    name: 'Cold-Calling & Flat-Calling 3-Bets Out Of Position With Dominated Hands',
    shortTitle: 'Calling 3-Bets Out Of Position Leak Fix',
    title: 'Calling 3 Bets Out Of Position Leak Fix',
    h1: 'Calling 3-Bets Out Of Position: Why Offsuit Broadways Bleed EV & Solver Cure',
    category: 'Preflop & Blind Defense Leaks',
    symptomHudMetric: 'Call 3-Bet OOP > 38% Or Cold-Call 3-Bet > 4%',
    evLossBb100: '-3.8 To -6.5 BB/100 In 3-Bet Pots',
    rootCause:
      'Attachment To Pretty Pre-Flop Hands Like AJo, KQo, ATs, Or Small Pairs (22-55) After Opening From Early Or Middle Position And Facing An In-Position 3.0x 3-Bet.',
    solverCure:
      'Adopt A Strict 4-Bet-Or-Fold Strategy From The Small Blind And Early Positions Against Tight 3-Bettors, Retaining Only High-Playability Suited Broadways (AQs, AJs, KQs) And Medium-High Pocket Pairs (88-JJ) As OOP Calls At 100BB.',
    ifThenBecause:
      'If You Face An In-Position 3-Bet While Holding Offsuit Broadways (AJo, KQo, KJo) Or Low Pocket Pairs (22-55) Out Of Position -> Then Fold Immediately (Or 4-Bet Bluff AJo Selectively) -> Because Out-Of-Position Equity Realization At SPR 3.5 Drops Below 68% Of Raw Equity.',
    calculatorHref: '/tools/3bet-calculator',
    drillHref: '/hub/training/preflop-charts',
    faqs: [
      {
        q: 'Why Do Small Pocket Pairs (22-55) Lose Money Calling 3-Bets Out Of Position At 100BB?',
        a: 'When You Open 2.5BB And Face A 7.5BB In-Position 3-Bet, Calling 5BB More To Win A ~90BB Remaining Stack Offers Only 18-To-1 Gross Implied Odds. Out Of Position, You Rarely Stack The Aggressor When You Hit A Set And Get Forced Off Every Unimproved Flop.',
      },
      {
        q: 'Should The Small Blind Ever Cold-Call A Button Or Cutoff Open?',
        a: 'In High-Rake Cash Games, GTO Solvers Play A Near-100% 3-Bet-Or-Fold Strategy From The Small Blind Because Flat-Calling Invites The Big Blind To Squeeze And Forces You To Play Multiway Out Of Position.',
      },
      {
        q: 'Which Hands Perform Best When Calling A 3-Bet Out Of Position?',
        a: 'Suited Broadways (AQs, KQs, QJs, JTs) And Medium Pairs (99, TT, JJ) That Can Flop Strong Top Pairs, Nut Flush Draws, And Sets At Low SPR.',
      },
    ],
  },
  {
    slug: 'missing-thin-river-value',
    code: 'LEAK-03-THIN-VALUE',
    name: 'Checking Back Thin River Value In Position Against Capped Ranges',
    shortTitle: 'Missing Thin River Value Leak Fix',
    title: 'Missing Thin River Value Poker Leak Fix',
    h1: 'Missing Thin River Value In Position: The 50%+ Equity Rule & Sizing Cure',
    category: 'River Sizing & Value Leaks',
    symptomHudMetric: 'River Bet Frequency IP < 28% / Won At Showdown (W$SD) > 62%',
    evLossBb100: '-3.5 To -5.9 BB/100 Uncollected Showdown Profit',
    rootCause:
      'Fear Of Being Check-Raised On The River Or Misunderstanding That A River Value Bet Only Needs To Win >50% Of The Time When Called (Not 80% Of The Time).',
    solverCure:
      'Whenever Your Opponent Checks Twice Or Three Times To Cap Their Range At Medium One-Pair Bluff-Catchers, Value-Bet Top Pair Good Kicker And Strong Second Pair Using A Compact 33% To 50% Block/Thin Value Size And Fold To A Check-Raise.',
    ifThenBecause:
      'If Your Won-Money-At-Showdown (W$SD) Exceeds 60% And Opponent Range Is Capped By Two Checks -> Then Fire A 40% To 55% Pot Thin River Value Bet whenever You Beat >52% Of Their Calling Range -> Because Checking Back Monsters-In-Context Leaves Thousands Of Big Blinds Uncollected.',
    calculatorHref: '/tools/poker-odds-calculator',
    drillHref: '/hub/training/weakness-scanner',
    faqs: [
      {
        q: 'Why Is A Very High W$SD (Won Money At Showdown > 63%) Actually A Leak?',
        a: 'If You Win 65% Of The Time Whenever Your River Bets Are Called, It Means You Are Only Betting Nutted Hands And Checking BackDozens Of Profitable 55%-60% Equity Thin Value Bets.',
      },
      {
        q: 'What Bet Size Should I Use For Thin River Value In Position?',
        a: 'Use 33% To 50% Of The Pot. A Smaller Bet Forces Your Opponent To Call With Weaker Second And Third Pairs To Meet Minimum Defense Frequency, Ensuring Your Thin Value Hand Maintains 55%+ Equity When Called.',
      },
      {
        q: 'What If My Opponent Check-Raises My Thin River Value Bet?',
        a: 'In Low-And-Mid Stakes Player Pools, River Check-Raises Against Thin Value Bets Are Severely Under-Bluffed. You Can Comfortably Bet-Fold Your Thin One-Pair Value Hand.',
      },
    ],
  },
  {
    slug: 'cbetting-100-percent-multiway',
    code: 'LEAK-04-MULTIWAY-CBET',
    name: 'Autopilot Continuation Betting Into Multiway (3+ Player) Flops',
    shortTitle: 'Autopilot Multiway C-Betting Leak Fix',
    title: 'Multiway Flop C Betting Poker Leak Fix',
    h1: 'Autopilot C-Betting Multiway Flops: Why Heads-Up Frequencies Bleed Chips 3-Way+',
    category: 'Flop & Turn Continuation Leaks',
    symptomHudMetric: 'Multiway Flop C-Bet > 55% (GTO Multiway Target: 22% - 35%)',
    evLossBb100: '-3.1 To -5.4 BB/100 In Multiway Single-Raised Pots',
    rootCause:
      'Applying Heads-Up Range C-Betting Habits (80% C-Bet At 33% Pot) Into 3-Way Or 4-Way Pots Where Combined Opponent Defense Burden Is Shared And Somebody Almost Always Connects.',
    solverCure:
      'Cut Multiway Flop C-Betting Frequency In Half (Down To 25%-35%), Check Most Vulnerable One-Pair Hands For Pot Control, And Bet Strictly With Nutted Value (Sets, Top Two Pair, Overpairs On Dry Boards) Plus Nut Draws.',
    ifThenBecause:
      'If Three Or More Players See The Flop -> Then Reduce Your Continuation Bet Frequency To 25%-35% Using Compact 25%-33% Sizing -> Because Combined Opponent Fold Probability Equals F_1 x F_2 (Two 60% Folders Fold Together Only 36% Of The Time).',
    calculatorHref: '/tools/board-texture-analyzer',
    drillHref: '/hub/training/multiway-preflop',
    faqs: [
      {
        q: 'What Is The Exact Multiplication Math Showing Why Multiway Bluffs Fail?',
        a: 'If Each Individual Opponent Folds To A Flop C-Bet 60% Of The Time (0.60), In A 3-Way Pot Against Two Opponents Both Fold Only 0.60 x 0.60 = 36% Of The Time. In A 4-Way Pot Against Three Opponents, All Three Fold Only 0.60^3 = 21.6% Of The Time!',
      },
      {
        q: 'Why Do Solvers Use Small 25%-33% Sizing In Multiway Pots?',
        a: 'Because Multiple Opponents Share The Minimum Defense Frequency Burden, Even A 25% Pot Bet Forces Each Individual Player To Fold Weak Pairs And Gutshots That Would Have Continued Heads-Up.',
      },
      {
        q: 'Should I Bluff Multiway With A Non-Nut Flush Draw (Like 7s 6s)?',
        a: 'No. In Multiway Pots, Another Player Frequently Holds The Ace-High Flush Draw (As Xs), Subjecting Non-Nut Draws To Brutal Reverse Implied Odds.',
      },
    ],
  },
  {
    slug: 'ignoring-icm-bubble-factors',
    code: 'LEAK-05-ICM-BUNT',
    name: 'Playing Chip-EV All-Ins Under High Tournament ICM Bubble Pressure',
    shortTitle: 'Ignoring ICM Bubble Factors Leak Fix',
    title: 'Ignoring Tournament ICM Bubble Factor Fix',
    h1: 'Ignoring Tournament ICM Bubble Factors: How Chip-EV Coinflips Torch Tournament ROI',
    category: 'Tournament ICM & Mental Leaks',
    symptomHudMetric: 'Bubble & Final-Table All-In Call Equity < 60% As Covered Medium Stack',
    evLossBb100: '-18% To -35% Total Tournament ROI Loss',
    rootCause:
      'Evaluating Final Table Or Stone-Bubble All-Ins Using Cash-Game Chip-EV Pot Odds (Calling A 25BB Shove With AQo Or 99 At 53% Equity) While Short Stacks Sit At The Table.',
    solverCure:
      'Compute Your Bubble Factor (Dollar Loss / Dollar Gain) Before Calling Any Covering Stack All-In; At BF = 1.90, Require At Least 1.90 / 2.90 = 65.5% Raw Equity To Call.',
    ifThenBecause:
      'If You Hold A Medium Stack Near The Bubble Or At A Final Table With Short Stacks Active -> Then Add A +12% To +20% Risk Premium Above Cash Pot Odds When Facing A Covering Stack -> Because Busting Ahead Of Short Stacks Surrenders Guaranteed Pay Jumps.',
    calculatorHref: '/tools/icm-calculator',
    drillHref: '/hub/training/icm-simulator',
    faqs: [
      {
        q: 'How Much Real Money Does One Bad ICM Call Cost At A Final Table?',
        a: 'In A $1,000 Buy-In Tournament With $150,000 For 1st Place, Making A Chip-EV (+0.5BB) But ICM-Negative Call For 25BB With 6 Players Left Typically Costs -$4,500 To -$11,000 In Instant Real-Dollar Expected Value (-4.5 To -11 Buy-Ins In One Hand).',
      },
      {
        q: 'Does ICM Mean I Should Play Passively At Final Tables?',
        a: 'Only When Calling All-In Against Players Who Cover You! When You Are The Covering Stack Acting First, ICM Mandates Hyper-Aggression Because Covered Opponents Are Forced To Over-Fold.',
      },
      {
        q: 'Where Can I Practice Final Table ICM Spots Without Risking Buy-Ins?',
        a: 'Use The Free Smarter.Poker Final Table Simulator (/hub/training/final-table-sim) And ICM Calculator (/tools/icm-calculator).',
      },
    ],
  },
  {
    slug: 'underbluffing-river-overbets',
    code: 'LEAK-06-RIVER-BLUFF',
    name: 'Giving Up On The River & Under-Bluffing Polarized Lines',
    shortTitle: 'Under-Bluffing River Overbets Leak Fix',
    title: 'Under Bluffing River Overbets Leak Fix',
    h1: 'Under-Bluffing River Overbets: Why Unbalanced Value Lines Get Exploited',
    category: 'River Sizing & Value Leaks',
    symptomHudMetric: 'River Aggression Frequency < 22% / River Bet W$SD > 68%',
    evLossBb100: '-2.6 To -4.4 BB/100 Against Observant Regulars',
    rootCause:
      'Giving Up Automatically On The River Whenever A Flop And Turn Semi-Bluff Draw Misses, Leaving Your River Large-Bet Range 90%+ Value.',
    solverCure:
      'Select Missed Draw Combos With High Card Removal (Holding The Nut Flush Blocker Or Straight Blockers while Unblocking Villain Folding Range) To Reach A 28% To 35% Bluff Share On Polarized 75%-125% River Bets.',
    ifThenBecause:
      'If You Polarize On The River With A 100% To 150% Pot Bet -> Then Construct Your Range With 1 Bluff Combo For Every 2 Value Combos (33% To 37.5% Bluffs) Using Nut Blockers -> Because Without Bluffs, Observant Opponents Fold All Bluff-Catchers And Deny Your Value Hands.',
    calculatorHref: '/tools/geometric-bet-calculator',
    drillHref: '/hub/training/hand-lab',
    faqs: [
      {
        q: 'Which Missed Draws Make The Worst River Bluffs?',
        a: 'Missed Front-Door Flush Draws (Like Holding 8s 7s When Three Spades Miss): Because You Hold Two Spades In Your Hand, You Block The Exact Missed Flush Draws You Want Your Opponent To Fold!',
      },
      {
        q: 'Which Hands Make The Best River Overbet Bluffs In GTO?',
        a: 'Holding The Single Ace Or King Of The Flush Suit On A Brick River (Blocking Villain Nut Flushes/Top Sets) Or Holding Board-Blocker Cards To Straights (Like A Ten On K-Q-9-4-2).',
      },
      {
        q: 'Should I Still Bluff 33% Of The Time On The River Against A Live Calling Station?',
        a: 'No. Against A Confirmed Calling Station (WTSD > 40%), Exploitatively Under-Bluff The River And Value-Bet Bigger.',
      },
    ],
  },
  {
    slug: 'limping-small-blind-unbalanced',
    code: 'LEAK-07-SB-LIMP',
    name: 'Open-Limping The Small Blind With A Capped, Face-Up Range',
    shortTitle: 'Unbalanced Small Blind Limping Leak Fix',
    title: 'Small Blind Open Limping Poker Leak Fix',
    h1: 'Unbalanced Small Blind Open-Limping: Why Capped SB Limps Get Crushed',
    category: 'Preflop & Blind Defense Leaks',
    symptomHudMetric: 'SB Open-Limp > 18% With 0% Limp-Reraise Protection',
    evLossBb100: '-2.4 To -4.1 BB/100 From The Small Blind Seat',
    rootCause:
      'Open-Raising All Strong Hands From The Small Blind While Open-Limping Only Weak Mediocre Hands ("To See A Cheap Flop"), Which Telegraphs A Capped Range To The Big Blind.',
    solverCure:
      'In Raked Cash Games, Play A 100% Raise-Or-Fold Strategy From The Small Blind (3.0x Open Size) To Win The Pot Uncontested Pre-Rake. In Zero-Rake Ante Tournaments Where You Limp, Protect Your Limp Range By Mixing In Limp-Reraises With AA, KK, And Suited Wheel Aces.',
    ifThenBecause:
      'If Playing A Raked Cash Game When Folded To You In The Small Blind -> Then Eliminate Open-Limping And Raise 3.0x Or Fold -> Because Limping Guarantees Paying Casino Flop Rake Out Of Position With A Capped Range.',
    calculatorHref: '/tools/rake-calculator',
    drillHref: '/hub/training/preflop-charts',
    faqs: [
      {
        q: 'Why Do Cash-Game Solvers Raise 3.0x From The Small Blind Instead Of 2.2x?',
        a: 'Because The Small Blind Acts Out Of Position On All Three Postflop Streets, A Larger 3.0x Raise Denies The Big Blind Cheap Pot Odds (Forcing The Big Blind To Call 2.0BB To Win 4.0BB = 33.3% Required Equity) And Maximizes Pre-Rake Folds.',
      },
      {
        q: 'Why Is Small Blind Limping Allowed In Tournaments But Not Raked Cash Games?',
        a: 'Tournaments Have Zero Postflop Pot Rake And Include A 1BB Big Blind Ante (Offering The Small Blind 7-To-1 Pot Odds To Complete 0.5BB Into A 3.5BB Pot). Even Then, Tournament SB Limps Must Be Protected With Limp-Traps.',
      },
      {
        q: 'How Do I Exploit An Opponent Who Open-Limps A Capped Small Blind Range?',
        a: 'From The Big Blind, Iso-Raise Their Limps To 3.5x-4.0x With A Wide Polarized Value + Bluff Range And C-Bet Aggressively In Position.',
      },
    ],
  },
  {
    slug: 'playing-bloated-pots-high-spr-one-pair',
    code: 'LEAK-08-HIGH-SPR-1P',
    name: 'Stacking Off For 100BB+ At High SPR With One-Pair Hands',
    shortTitle: 'High-SPR One-Pair Stack-Off Leak Fix',
    title: 'High SPR One Pair Stack Off Leak Fix',
    h1: 'Stacking Off With One Pair At High SPR (100BB+ Single-Raised Pots): Solver Cure',
    category: 'Flop & Turn Continuation Leaks',
    symptomHudMetric: 'W$SD < 46% In Pots > 80BB Single-Raised',
    evLossBb100: '-3.9 To -6.8 BB/100 Deep-Stack Punt Rate',
    rootCause:
      'Falling In Love With Pocket Aces, Pocket Kings, Or Top Pair Top Kicker (AK On A-9-6) In A Single-Raised 100BB Pot (SPR 13+) And Calling Down Triple Barrels Or Check-Raises.',
    solverCure:
      'Match Hand Strength To Stack-To-Pot Ratio: In Single-Raised 100BB+ Pots (SPR > 9), Insert A Pot-Control Check Street On The Flop Or Turn With One-Pair Hands So Your Final Pot Stays Around 35BB-50BB.',
    ifThenBecause:
      'If Flop SPR Exceeds 9.0 In A Single-Raised Or Limped Pot And You Hold Only One Pair (Even AA) -> Then Check At Least One Street For Pot Control And Fold To Turn/River Raises -> Because At 100BB+ Depth, Opponent Stack-Off Ranges Consist Almost Exclusively Of Two Pair, Sets, And Straights.',
    calculatorHref: '/tools/spr-calculator',
    drillHref: '/hub/training/spot-trainer',
    faqs: [
      {
        q: 'How Many Streets Of Value Is Top Pair Top Kicker Worth At 100BB In A Single-Raised Pot?',
        a: 'Against A Competent Regular, Top Pair Top Kicker Is Typically A 2-Street Value Hand (Bet Flop + Turn, Check River; Or Bet Flop, Check Turn, Value-Bet/Bluff-Catch River). Only Against Calling Stations Is It A 3-Street Bet.',
      },
      {
        q: 'Why Is Pocket Aces An Automatic Stack-Off In A 4-Bet Pot But A Fold To A River Jam In A Single-Raised Pot?',
        a: 'In A 4-Bet Pot, Flop SPR Is ~1.5, So Villain Jam Range Includes Worse Overpairs (QQ, JJ) And Top Pairs. In A Single-Raised Pot (SPR 14), Villain Only Invests 100BB Postflop With Sets, Two Pairs, And Straights.',
      },
      {
        q: 'How Does Deeper Stack Depth (200BB Live Cash) Magnify This Leak?',
        a: 'At 200BB (SPR 25+), Even Bottom Set And Non-Nut Flushes Must Exercise Pot Control On Paired Or Four-Flush Boards.',
      },
    ],
  },
  {
    slug: 'chasing-draws-without-implied-odds',
    code: 'LEAK-09-BAD-DRAWS',
    name: 'Chasing Gutshots & Non-Nut Draws Out Of Position Without Implied Odds',
    shortTitle: 'Chasing Draws Without Implied Odds Fix',
    title: 'Chasing Poker Draws Without Implied Odds',
    h1: 'Chasing Draws Without Direct Or Implied Pot Odds: Mathematical Cure',
    category: 'Flop & Turn Continuation Leaks',
    symptomHudMetric: 'Turn Call C-Bet > 62% With Low River W$SD',
    evLossBb100: '-2.8 To -4.9 BB/100 Postflop Bleed',
    rootCause:
      'Calling 75% To 100% Pot Turn Bets Out Of Position With A 4-Out Gutshot (8.7% Equity) Or Dominated Low Flush Draw When Villain Remaining Stack Is Too Shallow To Compensate The Direct Pot-Odds Deficit.',
    solverCure:
      'Calculate Exact Required Implied Odds: Required Future Payoff = [ (Call / Draw_Equity) - Total_Pot_After_Call ]. If Villain Remaining Stack Or Willingness To Pay Off On Obvious River Cards Is Smaller Than That Number, Fold Or Semi-Bluff Raise On The Flop.',
    ifThenBecause:
      'If Calling A Turn Bet With A Draw Where Direct Pot Odds Exceed Your Turn Hit Probability (Outs / 46) -> Then Verify That Effective Remaining Stacks Exceed Required Implied Payoff And That Your Draw Is To The Nuts -> Because Out-Of-Position River Leads On Obvious Flush Cards Rarely Get Paid.',
    calculatorHref: '/tools/outs-calculator',
    drillHref: '/hub/training/hand-lab',
    faqs: [
      {
        q: 'What Is The Exact Formula For Required Implied Odds In Dollars Or Big Blinds?',
        a: 'Required River Win = (Call Amount / Exact Draw Equity) - (Current Pot + Opponent Bet + Your Call). For Example, Calling $50 Into A $100 Pot ($200 Final Pot) With A 9-Out Turn Flush Draw (19.57% Equity) Requires ($50 / 0.1957) - $200 = $255.50 - $200 = +$55.50 Extra Extracted On The River Every Time You Hit.',
      },
      {
        q: 'Why Are Implied Odds Worse When You Are Out Of Position?',
        a: 'When The Front-Door Flush Card Lands On The River And You Lead Out From Out Of Position, Observant Opponents Fold One-Pair Hands. If You Check To Induce, They Check Back Behind You.',
      },
      {
        q: 'What Are Reverse Implied Odds?',
        a: 'The Expected Loss When You Hit Your Draw (Such As Making A 7-High Flush Or Bottom End Of A One-Card Straight) Only To Lose A Full Stack To A Higher Flush Or Higher Straight.',
      },
    ],
  },
  {
    slug: 'autopilot-min-cbet-wet-boards',
    code: 'LEAK-10-WET-33-CBET',
    name: 'Range C-Betting 33% Small On Wet, Dynamic Low-Connected Flops',
    shortTitle: 'Small C-Betting Wet Connected Flops Fix',
    title: 'Small C Betting Wet Connected Flops Fix',
    h1: 'Range C-Betting 33% On Wet Connected Flops (8-7-6, J-T-8): Why Solvers Check & Polarize',
    category: 'Flop & Turn Continuation Leaks',
    symptomHudMetric: 'Flop C-Bet > 75% Across All Textures With Uniform 33% Sizing',
    evLossBb100: '-2.2 To -3.9 BB/100 Against Check-Raise Aggressive Opponents',
    rootCause:
      'Misapplying The "Range C-Bet 33% Pot" Rule (Which Works Only On Dry High-Card Boards Like A-7-2r Or K-8-3r) Onto Low/Middling Coordinated Two-Tone Boards Where The Big Blind Holds More Straights And Two Pairs.',
    solverCure:
      'On Dynamic Connected Boards (7-6-5, 8-7-6, J-T-8ss, 9-8-6ss), Increase Your Flop Check Frequency To 45%-65% And Use A Larger Polarized 66%-75% Bet Size When You Do Bet To Deny Equity.',
    ifThenBecause:
      'If The Flop Comes Low Or Middling Connected (Such As 8-7-5 Two-Tone Or T-9-7) -> Then Check 50%+ Of Your Range And Size Up Bets To 66%-75% Pot -> Because A Tiny 33% Bet Offers Villain 4-To-1 Odds On Every Pair+Draw And Invites Punishing Check-Raises.',
    calculatorHref: '/tools/board-texture-analyzer',
    drillHref: '/learn/board-textures',
    faqs: [
      {
        q: 'Why Does The Big Blind Defender Have The Nut Advantage On 8-7-6 Or 7-6-5?',
        a: 'An Early Or Middle Position Opener Folds 95o, T9o, 86s, 75s, And 64s Preflop, Whereas The Big Blind Defends All Of Those Suited Connectors And Gappers, Giving The Big Blind Far More Flopped Straights And Two Pairs.',
      },
      {
        q: 'How Do I Exploit An Opponent Who C-Bets 33% On Every Wet Flop?',
        a: 'Attack Their Small C-Bet By Check-Raising At 22% To 28% Frequency With All Two Pairs, Sets, Straights, Combo Draws, And Pair-Plus-Gutshot Hands.',
      },
      {
        q: 'Which Flop TexturesActually Allow An 80%+ 33% Range C-Bet?',
        a: 'High-Card Dry Rainbow Boards (A-8-2r, K-7-2r), High-Paired Dry Flops (K-K-4r, Q-Q-5r), And Triple-Broadway Flops (A-K-Qr) Where The Preflop Raiser Owns Both Range And Nut Advantage.',
      },
    ],
  },
  {
    slug: 'neglecting-bounty-chip-conversion',
    code: 'LEAK-11-BOUNTY-MATH',
    name: 'Using Standard Freezeout Ranges In PKO & Mystery Bounty Tournaments',
    shortTitle: 'Neglecting Bounty Chip Conversion Fix',
    title: 'PKO And Mystery Bounty Range Leak Fix',
    h1: 'Neglecting Bounty Chip Conversion In PKO & Mystery Bounty MTTs: Solver Cure',
    category: 'Tournament ICM & Mental Leaks',
    symptomHudMetric: 'Same All-In Call Width When Covering Vs Covered In Bounty Events',
    evLossBb100: '-14% To -28% PKO & Mystery Bounty ROI Loss',
    rootCause:
      'Failing To Convert A Covered Opponent Cash Bounty Into Equivalent Tournament Chips Before Computing Pot Odds, Or Shoving Too Wide When Covered By Big Stacks Hunting Your Bounty.',
    solverCure:
      'Convert Every Covered Starting Bounty Into 33% Of A Starting Stack (Plus ICM Escalation Late), Add Those Virtual Chips To The Center Pot, And Tighten Your Own Shoving Range By 15%-25% When Covered By Big Stacks.',
    ifThenBecause:
      'If You Cover An All-In Short Stack Holding A 2x Starting Bounty -> Then Add 66% Of A Starting Stack In Virtual Chips To The Pot Odds Denominator And Call 12%-18% Wider -> Because Instant Cash Bounty Equity Reduces Required Showdown Equity Below 38%.',
    calculatorHref: '/tools/bounty-calculator',
    drillHref: '/learn/formulas/bounty-chip-equivalence',
    faqs: [
      {
        q: 'What Is The Biggest Difference Between PKO Strategy And Mystery Bounty Strategy?',
        a: 'In A PKO, Bounties Are Active From Hand 1 And Scale Gradually As Players Bust Others. In A Mystery Bounty, Bounties Are 0 Until Day 2 / In The Money, Meaning Early Play Is 100% Chip Accumulation To Enter The Mystery Phase With A Covering Stack!',
      },
      {
        q: 'Why Must I Shove Tighter When I Am Covered In A Bounty Event?',
        a: 'Because Covering Opponents Get Extra Bounty Pot Odds To Call You With Hands Like KTo, QJo, And 44, Your Fold Equity Drops Dramatically. Shove Solid Linear High-Equity Hands And Drop Zero-Equity Bluffs.',
      },
      {
        q: 'How Much Is A Mystery Bounty Worth Once The Envelope Phase Begins?',
        a: 'Compute Average Envelope = (Total Remaining Unpulled Bounty Pool) / (Remaining Players), Then Convert That Dollar Value Into Starting-Stack Chip Equivalents.',
      },
    ],
  },
  {
    slug: 'tilt-induced-stake-jumping',
    code: 'LEAK-12-TILT-STAKES',
    name: 'Tilt-Induced Stake Jumping & Chasing Session Losses Above Bankroll',
    shortTitle: 'Tilt-Induced Stake Jumping Leak Fix',
    title: 'Tilt Stake Jumping And Loss Chasing Fix',
    h1: 'Tilt-Induced Stake Jumping & Chasing Losses: How To Eliminate Bankroll Ruin',
    category: 'Tournament ICM & Mental Leaks',
    symptomHudMetric: 'Winrate At Shot Stakes < -15 BB/100 When Entering Stuck > 2 Buy-Ins',
    evLossBb100: '100% Bankroll Risk Of Ruin Exposure',
    rootCause:
      'Loss Aversion (Kahneman-Tversky Prospect Theory) Driving Players Who Lose 3 Buy-Ins At $2/$5 To Jump Into $5/$10 Or High-Stakes PLO At 1:00 AM While Fatigued And Tilted To "Get Even Before Going Home."',
    solverCure:
      'Enforce A Non-Negotiable Pre-Session Buy-In Rule: Never Move Up Stakes Mid-Session While Stuck, Carry Only 3 Buy-Ins For Your Target Stake, And Schedule All Shot-Taking Exclusively At The Start Of A Rested A-Game Session.',
    ifThenBecause:
      'If You Drop 3 Buy-Ins In A Single Session Or Score Below 4/5 On The A-Game Mental Checklist -> Then Execute An Immediate Hard Session Stop-Loss -> Because Playing Higher Stakes With A Negative C-Game Winrate Multiplies Risk Of Ruin To 100%.',
    calculatorHref: '/tools/bankroll-calculator',
    drillHref: '/hub/training/tilt-guard',
    faqs: [
      {
        q: 'Why Does Jumping Up One Stake Level While Tilted Destroy 3 Months Of Grinding?',
        a: 'Because Stepping From $2/$5 To $5/$10 Doubles The Dollar Value Of Every Big Blind While Simultaneouly Pitting Your Fatigued C-Game (-12 BB/100) Against Tougher Regulars, Burning 6 Base-Stake Buy-Ins In Two Hours.',
      },
      {
        q: 'What Is The Correct Way To Take A Shot At A Higher Stake?',
        a: 'Take A Pre-Planned 3-Buy-In Shot Only When Rested At Peak A-Game On A Friday Or Saturday Night With Confirmed Recreational Whales At The Table. If The 3 Shot Buy-Ins Lose, Drop Immediately Back To Your Base Stake.',
      },
      {
        q: 'How Does The Smarter.Poker Bankroll Manager Prevent Stake Jumping?',
        a: 'Log Every Session With Pre-Set Bankroll Tiers And Stop-Loss Rules Inside /hub/bankroll-manager And Run The Tilt Guard Protocol At /hub/training/tilt-guard.',
      },
    ],
  },
];

export function findLeakBySlug(slug) {
  if (!slug) return null;
  const clean = String(slug).trim().toLowerCase();
  return POKER_LEAKS.find((l) => l.slug === clean || l.code.toLowerCase() === clean) || null;
}

export function renderLeaksIndexMarkdown() {
  return [
    '# Poker Leak Diagnostic & Fix Encyclopedia (12 High-Cost EV Leaks & Solver Cures)',
    '',
    `Last Verified: ${LEAKS_AS_OF} | Zenodo DOI: ${LEAKS_DOI}`,
    `Canonical URL: ${LEAKS_URL}`,
    '',
    '## Master Diagnostic Table Of 12 High-Cost Poker Leaks',
    '',
    '| Leak Name | Category | Symptom HUD Metric | EV Loss (BB/100) | Paired Solver / Tool |',
    '| :--- | :--- | :--- | :--- | :--- |',
    ...POKER_LEAKS.map(
      (l) =>
        `| [${l.name}](${LEAKS_URL}/${l.slug}) | ${l.category} | ${l.symptomHudMetric} | ${l.evLossBb100} | [Open Tool](https://smarter.poker${l.calculatorHref}) |`
    ),
    '',
  ].join('\n');
}

export function renderLeakDetailMarkdown(slugOrObj) {
  const l = typeof slugOrObj === 'string' ? findLeakBySlug(slugOrObj) : slugOrObj;
  if (!l) return '';
  const url = `${LEAKS_URL}/${l.slug}`;
  return [
    `# ${l.h1}`,
    '',
    `> Source: [${l.name} on Smarter.Poker](${url}) | DOI: https://doi.org/${LEAKS_DOI}`,
    '',
    '## Diagnostic Metrics & EV Cost',
    `- **Leak Code**: ${l.code}`,
    `- **Category**: ${l.category}`,
    `- **Symptom HUD Metric**: ${l.symptomHudMetric}`,
    `- **Estimated Winrate Loss**: ${l.evLossBb100}`,
    `- **Diagnostic Calculator**: [https://smarter.poker${l.calculatorHref}](https://smarter.poker${l.calculatorHref})`,
    `- **Corrective Training Drill**: [https://smarter.poker${l.drillHref}](https://smarter.poker${l.drillHref})`,
    '',
    '## Root Behavioral & Mathematical Cause',
    l.rootCause,
    '',
    '## Deterministic GTO Solver Cure',
    l.solverCure,
    '',
    '## Causal Decision Rule (If / Then / Because)',
    l.ifThenBecause,
    '',
    '## Frequently Asked Questions',
    ...(l.faqs || []).flatMap((f) => [`### ${f.q}`, f.a, '']),
  ].join('\n');
}
