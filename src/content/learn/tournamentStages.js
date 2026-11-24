/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  MTT TOURNAMENT STAGE STRATEGY PLAYBOOKS (src/content/learn/tournamentStages.js)
 * ═══════════════════════════════════════════════════════════════════════════════
 * Authoritative source of truth for /learn/tournament-stages and
 * /learn/tournament-stages/[stage].
 * Covers 8 canonical Multi-Table Tournament stages from Level 1 Deepstack through
 * Heads-Up For The Title with effective BB ranges, Bubble Factors, optimal
 * VPIP/PFR targets, strategy pillars, If/Then/Because rules, and calculators.
 *
 * House style: Title Case, zero em dashes.
 */

export const TOURNAMENT_STAGES_AS_OF = '2026-11-24';
export const TOURNAMENT_STAGES_BASE_PATH = '/learn/tournament-stages';
export const TOURNAMENT_STAGES_URL = 'https://smarter.poker/learn/tournament-stages';
export const TOURNAMENT_STAGES_DOI = '10.5281/zenodo.15129481';

export function tournamentStagePath(stage) {
  return `/learn/tournament-stages/${stage}`;
}

export const TOURNAMENT_STAGES = [
  {
    slug: 'early-deepstack',
    code: 'STAGE-1-EARLY',
    name: 'Stage 1: Early Deepstack Levels (100BB - 250BB)',
    shortTitle: 'Early Deepstack MTT Playbook',
    title: 'Early Deepstack MTT Strategy Playbook',
    h1: 'Early Deepstack MTT Tournament Strategy Playbook (100BB To 250BB)',
    effectiveBbRange: '100BB - 250BB (Harrington Green Zone M >= 40)',
    averageBubbleFactor: '1.01 - 1.03 (Near-Pure Chip EV)',
    optimalVpipPfr: '23% - 28% VPIP / 18% - 22% PFR',
    summary:
      'In Early Deepstack Tournament Levels (100BB To 250BB), Payout Jumps Are Distant And Bubble Factors Sit At 1.01 To 1.03. Play Near-Pure Chip EV With Zero Rake On Postflop Pots: Prioritize High-Implied-Odds Hands (Small Pocket Pairs, Suited Aces, Suited Connectors) In Position And Avoid Bloating Multiway Pots Out Of Position With One-Pair Hands.',
    strategyPillars: [
      'Zero Postflop Rake Advantage: Unlike Live Cash Games That Drop $5-$7 Per Flop, Tournament Pots Have Zero Postflop Drop, Making Speculative Set-Mining And Suited-Connector Calls In Position Substantially More Profitable At 120BB+ Depth.',
      'Pot Control With Unimproved Overpairs: At 150BB Effective Depth (SPR 12+), Pocket Aces And Pocket Kings Are Not Automatic 3-Street Stack-Offs On Wet Coordinated Boards.',
      'Exploit Early Recreational Passivity: Isolate Weak Limpers In Position With Merged Linear Value Hands And Extract Thin Value Before Blind Levels Escalate.',
      'Avoid Coin-Flipping For 150BB: You Do Not Need To Risk 150BB On A 52/48 Flip Against Another Deep Stack When Weak Opponents Will Gift Chips At Low Risk Postflop.',
    ],
    ifThenBecause:
      'If Effective Stack Depth Exceeds 100BB In Early Levels -> Then Prioritize Nut-Potential Suited Aces And Pocket Pairs In Position Over Offsuit Broadways -> Because Deep-Stack SPR (>10) Rewards Implied-Odds Nut Hands And Punishes Dominated Top-Pair Kickers.',
    recommendedCalculators: [
      { name: 'Stack-To-Pot Ratio (SPR) Calculator', href: '/tools/spr-calculator' },
      { name: '100BB Preflop Range Matrix', href: '/tools/preflop-ranges' },
      { name: 'Flop Board Texture Analyzer', href: '/tools/board-texture-analyzer' },
    ],
    faqs: [
      {
        q: 'Should I Skip Early Deepstack Levels And Late-Register Instead?',
        a: 'If Your Postflop Edge Over Recreational Early-Level Opponents Exceeds +12 BB/100, Playing From Level 1 At 200BB Depth Generates Higher Total Tournament ROI Than Late-Registering At 25BB.',
      },
      {
        q: 'How Does The Big Blind Ante (BBA) Change Level 1 Opening Sizes?',
        a: 'When Level 1 Includes A 1BB Big Blind Ante (2.5BB Dead Money), Standard Open Sizes Are 2.2x To 2.5x BB. If Level 1 Has Zero Antes (1.5BB Dead Money), You Can Open 2.5x To 3.0x For Value.',
      },
      {
        q: 'When Is It Correct To Fold An Overpair In Stage 1 Deepstack Play?',
        a: 'Whenever A Passive Opponent Check-Raises Turn Or Bombs River At 120BB+ Depth: At High SPR, One Pair Is A Bluff-Catcher Against Sets, Two Pairs, And Straights.',
      },
    ],
  },
  {
    slug: 'late-registration-entry',
    code: 'STAGE-2-LATEREG',
    name: 'Stage 2: Late-Registration Entry & Transition Window (20BB - 45BB)',
    shortTitle: 'Late-Registration Entry MTT Playbook',
    title: 'MTT Late Registration Strategy Playbook',
    h1: 'Late-Registration Entry & Transition Window MTT Playbook (20BB To 45BB)',
    effectiveBbRange: '20BB - 45BB (Harrington Yellow Zone M = 8 To 18)',
    averageBubbleFactor: '1.06 - 1.14 (Early ICM Chip Appreciation)',
    optimalVpipPfr: '21% - 25% VPIP / 18% - 22% PFR',
    summary:
      'Entering Or Grinding Through The Late-Registration Window (20BB To 45BB) Captures An Immediate +5% To +14% Malmuth-Harville ICM Equity Boost Because 30% To 50% Of The Starting Field Has Already Busted. At 25BB To 35BB Depth, Eliminate Set-Mining Calls And Shift To Compact 2.0x-2.2x Opens Paired With Aggressive 3-Bet Resteal Shoves.',
    strategyPillars: [
      'Instant ICM Chip Appreciation: A Fresh Starting Stack Bought At The Close Of Late Registration Is Worth 108% To 114% Of Its Net Prize-Pool Contribution Because Early Eliminations Move You Closer To The Money For Free.',
      'Compact 2.0x-2.1x Open Sizing: At 25BB To 35BB Depth, Opening To 2.0x Risks Only 4BB To Win 2.5BB Dead Money While Keeping Postflop SPR Manageable.',
      'The 18BB-28BB 3-Bet Resteal Jam: Punish Wide Late-Position Openers By 3-Bet Shoving High-Card Blockers (AJo+, KQo, A9s+, A5s) And Pocket Pairs (55-TT) Over Their 2.2x Opens.',
      'Retire Implied-Odds Set-Mining: Calling A 2.2x Open With 33 Or 44 At 22BB Depth Loses EV Because You Lack The 15x Stack Behind Required To Paid Off When Hitting A Set.',
    ],
    ifThenBecause:
      'If Entering Or Playing At 20BB To 30BB As Late Registration Closes -> Then Replace Passive Preflop Flat-Calls With 3-Bet All-In Resteals Or Folds -> Because A 25BB Shove Over A 2.2x Open Captures 4.7BB Dead Money (+18.8% Stack Increase) Uncontested.',
    recommendedCalculators: [
      { name: 'Late-Registration ICM Equity Calculator', href: '/tools/late-reg-calculator' },
      { name: 'Push/Fold Nash Equilibrium Chart', href: '/tools/push-fold-calculator' },
      { name: '3-Bet & Resteal EV Calculator', href: '/tools/3bet-calculator' },
    ],
    faqs: [
      {
        q: 'Why Does Late Registration Increase My Starting Stack Dollar Value?',
        a: 'In A 100-Player Freezeout Paying 15 Places, Buying In On Hand 1 Gives You 1/100th Of The Prize Pool. Buying In When 40 Players Have Already Busted Gives You A Full Starting Stack With Only 61 Players Competing For The Same 15 Payouts.',
      },
      {
        q: 'Should I Max-Late-Register Progressive Knockout (PKO) Tournaments?',
        a: 'No! In PKO Events, 50% Of Every Buy-In Goes Into Player Bounties That Are permanently Removed From The Prize Pool Whenever Early Players Bust. Late-Registering A PKO Costs You Access To Those Eliminated Bounty Pools.',
      },
      {
        q: 'What Is The Optimal 3-Bet Shove Stack Depth Over A Cutoff Open?',
        a: 'Between 16BB And 26BB. Below 15BB Your Shove Loses Some Fold Equity Against Pot-Committed Openers; Above 30BB Risking Your Whole Stack Without A Non-All-In 3-Bet Option Is Inefficient.',
      },
    ],
  },
  {
    slug: 'pre-bubble-accumulation',
    code: 'STAGE-3-PREBUBBLE',
    name: 'Stage 3: Pre-Bubble Stack Accumulation Phase (25% - 35% Field Remaining)',
    shortTitle: 'Pre-Bubble Accumulation MTT Playbook',
    title: 'Pre Bubble MTT Stack Accumulation Guide',
    h1: 'Pre-Bubble Stack Accumulation MTT Playbook: Building A Bubble-Crushing Stack',
    effectiveBbRange: '25BB - 60BB Average Stack (Before Hand-For-Hand)',
    averageBubbleFactor: '1.15 - 1.28 (Rising Survival Pressure On Short Stacks)',
    optimalVpipPfr: '26% - 32% VPIP (Big Stack) / 18% - 21% VPIP (Short Stack)',
    summary:
      'With 25% To 35% Of The Field Remaining (Roughly 20 To 40 Eliminations Before The Money), Recreational Players Begin Tightening Prematurely To Protect 20BB Stacks. This Creates A Prime Window To Steal Uncontested Blinds And Antes And Accumulate A 50BB+ Stack That Can Dominate The Incoming Money Bubble.',
    strategyPillars: [
      'Target Capped 18BB-28BB Mid-Stacks: Players Who Are Just Above Average Desperately Want To Coast Into The Money And Will Over-Fold To Delayed Turn Barrels And 3-Bets.',
      'Defend Your Big Blind Wide Against Min-Raises: With A 1BB Big Blind Ante In Play, Facing A 2.0x Min-Open Gives You 3.5-To-1 Pot Odds (Only 22.2% Equity Needed In Position Or ~26% Raw Equity OOP).',
      'Use Non-All-In 2.6x-2.8x 3-Bets In Position: At 40BB Effective Depth, A Small 5.5BB In-Position 3-Bet Applies Massive Pressure Without Committing Your Full Stack.',
      'Identify Who Knows The Payout Count: Watch Which Opponents Keep Checking The Tournament Clock; Those Players Will Fold Medium Pairs To Triple-Barrel Pressure.',
    ],
    ifThenBecause:
      'If Table Opponents Begin Tank-Folding And Checking The Tournament Clock 30 Spots Off The Money -> Then Expand Late-Position Steal Frequency By 8% To 12% -> Because Each Uncontested 2.5BB Orbit Steal Adds +6% To A 40BB Stack.',
    recommendedCalculators: [
      { name: 'Pot Odds & MDF Calculator', href: '/tools/pot-odds-calculator' },
      { name: 'Harrington M-Ratio Calculator', href: '/tools/m-ratio-calculator' },
      { name: 'MTT Session & ABI Planner', href: '/tools/mtt-grind-planner' },
    ],
    faqs: [
      {
        q: 'How Wide Should I Defend My Big Blind Against A 2.0x Button Open With A Big Blind Ante?',
        a: 'Against A 2.0x Button Open At 35BB Depth With A 1BB Ante, You Call 1.0BB To Win A Total Final Pot Of 4.5BB (22.2% Direct Odds). GTO Defends Roughly 58% To 64% Of All Starting Hands By Calling Or 3-Betting.',
      },
      {
        q: 'Why Is Building A 60BB Stack Before The Bubble Worth Extra Risk?',
        a: 'A 60BB Covering Stack On The Direct Money Bubble Can Open 45%+ Of Hands Uncontested Against 20BB Stacks Whose Bubble Factors Exceed 1.85.',
      },
      {
        q: 'How Do I Adjust If I Am The 14BB Short Stack During Pre-Bubble Play?',
        a: 'Stop Open-Min-Raising And Folding To 3-Bets: Shift To First-In All-In Shoves From Hijack, Cutoff, Button, And Small Blind Before Blinds Erode Your Fold Equity.',
      },
    ],
  },
  {
    slug: 'money-bubble-pressure',
    code: 'STAGE-4-BUBBLE',
    name: 'Stage 4: Direct Money Bubble & Hand-For-Hand Combat (1.5x - 2.4x Bubble Factor)',
    shortTitle: 'Direct Money Bubble ICM Playbook',
    title: 'MTT Money Bubble ICM Strategy Playbook',
    h1: 'Money Bubble & Hand-For-Hand MTT Strategy Playbook: Maximum ICM Leverage',
    effectiveBbRange: '10BB - 80BB (Hand-For-Hand Survival vs Covering Domination)',
    averageBubbleFactor: '1.65 - 2.45 (Peak Tournament Risk Premium)',
    optimalVpipPfr: '38% - 52% VPIP (Covering Big Stack) / 9% - 14% VPIP (At-Risk Mid Stack)',
    summary:
      'On The Direct Money Bubble (Hand-For-Hand Play), Busting Pays $0.00 While Surviving Even One More Elimination Locks Up 1.5x To 2.0x The Tournament Buy-In. Bubble Factors Spike To Their Highest Point Of The Entire Event (1.80 To 2.45 For Medium Stacks), Creating Extreme Asymmetry Between Covering Stacks And Covered Stacks.',
    strategyPillars: [
      'Big-Stack Covering Domination: If You Cover Every Player Behind You To Act, Open-Raise Or Open-Shove Up To 50%+ Of Hands Because Covered 20BB Stacks Can Only Call With QQ+, AKs (Top 2.5%).',
      'Medium-Stack Ultra-Tight Folding Against Covering Stacks: If Three 6BB Short Stacks Are In The Field And You Hold 22BB, Fold AQo, 99, And Even TT Facing A Covering 60BB Shove (You Need ~66% Equity To Call!).',
      'Never Stall When You Are The Short Stack Under Big Blind Ante: Under Modern TDA Shot Clocks And Hand-For-Hand Rules, Every Table Plays The Exact Same Number Of Hands.',
      'Small-Stack Postflop Pot Control: When A Covering Stack Defends Against Your Open, Avoid Ego-Barrelling Without Equity; Preserve Your 15BB Survival Cushion.',
    ],
    ifThenBecause:
      'If You Hold A Medium Stack On The Stone Bubble And Face An All-In From A Covering Chip Leader -> Then Fold All Hands Below 65% Raw Equity Against Their Range -> Because Your Bubble Factor (~1.90) Demands A +15.5% Risk Premium Over Chip EV.',
    recommendedCalculators: [
      { name: 'Malmuth-Harville ICM Calculator', href: '/tools/icm-calculator' },
      { name: 'Satellite & Bubble Survival Calculator', href: '/tools/satellite-calculator' },
      { name: 'Push/Fold Nash Equilibrium Calculator', href: '/tools/push-fold-calculator' },
    ],
    faqs: [
      {
        q: 'Why Do Medium Stacks Have Higher Bubble Factors Than Micro 3BB Short Stacks On The Bubble?',
        a: 'A 3BB Stack Is Likely To Bust In The Next Orbit Anyway ($EV Near Zero), Whereas A 22BB Medium Stack Has A 96%+ Probability Of Cashing Simply By Folding. Risking A 96% Cash Lock To Double Up Produces A Bubble Factor Above 2.00.',
      },
      {
        q: 'When Is It Correct To Fold Pocket Kings On A Tournament Bubble?',
        a: 'In A Milestone Satellite Where The Top 10 Players All Win Identical $10,000 Seats And 11 Players Remain: If You Are In 3rd Place And Two 2BB Stacks Are All-In, Calling A Covering Stack Shove With KK Is A Mathematical Blunder (You Need 99%+ Equity!).',
      },
      {
        q: 'How Do I Counter A Big Stack Who Opens Every Single Hand On The Bubble?',
        a: 'Wait Until You Hold The Top 4% To 6% Of Hands Or Until You Cover Another Player, And Use Small Non-All-In Postflop Lines Only If Stack Depth Exceeds 35BB.',
      },
    ],
  },
  {
    slug: 'in-the-money-laddering',
    code: 'STAGE-5-ITM',
    name: 'Stage 5: Post-Bubble In-The-Money Surge & Pay-Jump Laddering',
    shortTitle: 'In-The-Money (ITM) Laddering Playbook',
    title: 'In The Money MTT Laddering Playbook',
    h1: 'Post-Bubble In-The-Money (ITM) Surge & Pay-Jump Laddering Playbook',
    effectiveBbRange: '8BB - 45BB (Post-Bubble Short-Stack Bustout Wave)',
    averageBubbleFactor: '1.08 - 1.18 (Temporary ICM Drop After Min-Cash Lock)',
    optimalVpipPfr: '22% - 27% VPIP / 19% - 24% PFR',
    summary:
      'Immediately After The Money Bubble Bursts, Min-Cash Payout Jumps Are Flat (Typically Increasing By Only 0.15x Buy-In Every 18 Eliminations) And Bubble Factors Drop Back Down Toward 1.10. Dozen Of Short Stacks Who Survived On 5BB-10BB Immediately Shove Wide To Double Or Go Home, Requiring You To Widen Your Calling Ranges.',
    strategyPillars: [
      'Call Down The Post-Bubble Short-Stack Shove Wave: Short Stacks With 6BB To 11BB Who Nursed Their Stacks Through The Bubble Will Immediately Jam Any Ace, King-X, Or Connector Once ITM. Call Wider From The Big Blind Matching Near-Chip-EV Pot Odds.',
      'Ignore Minor Early Pay Jumps: Never Pass Up A +1.5BB Chip-EV Shove At 18BB Depth Just To Ladder From 72nd Place ($215) To 63rd Place ($235) When 1st Place Pays $18,000.',
      'Re-Establish Big Stack Aggression Against Mid-Stacks Hoping To Ladder: Target 15BB-20BB Stacks Who Are Still Playing Passively.',
      'Track Table Breaks And Seat Draws: As Tables Break Rapidly Post-Bubble, Immediately Profile New Seat Arrivals Within Their First Orbit.',
    ],
    ifThenBecause:
      'If The Money Bubble Just Burst And A 7BB Short Stack Open-Shoves Into Your Big Blind -> Then Call At Near-Chip-EV Pot Odds (35% To 38% Equity Required) -> Because Flat Early Pay Jumps Carry Less Than A 3% ICM Risk Premium.',
    recommendedCalculators: [
      { name: 'Tournament Payout Structure Calculator', href: '/tools/payout-calculator' },
      { name: 'Push/Fold Nash Calculator', href: '/tools/push-fold-calculator' },
      { name: 'Pot Odds & Breakeven Calculator', href: '/tools/pot-odds-calculator' },
    ],
    faqs: [
      {
        q: 'Why Do So Many Players Bust In The First 15 Minutes After The Bubble Breaks?',
        a: 'Because Short Stacks Who Held Onto 4BB To 9BB For An Hour During Hand-For-Hand Play Finally Have Their Min-Cash Locked Up And Shove Their Very First Playable Hand To Try To Get Back In Contention.',
      },
      {
        q: 'At What Point In The Tournament Do Pay Jumps Become Large Enough To Matter Again?',
        a: 'Usually Starting At The Final Three Tables (27 Players Left) And Escalating Sharply At The Final Two Tables (18 Players) Where Each Pay Jump Represents 0.75x To 3.0x The Original Buy-In.',
      },
      {
        q: 'Should I Ever Stall For A Pay Jump With 45 Players Left?',
        a: 'Only If You Hold Under 4 Big Blinds, Are About To Hit The Big Blind Next Hand, And The Tournament Clock Shows 37 Players Remaining With A Pay Jump At 36th.',
      },
    ],
  },
  {
    slug: 'final-two-tables-reshove',
    code: 'STAGE-6-SEMI',
    name: 'Stage 6: Final Two Tables (18 To 10 Players) Reshove & Final-Table Bubble',
    shortTitle: 'Final Two Tables (18-10 Left) Playbook',
    title: 'Final Two Tables MTT Reshove Playbook',
    h1: 'Final Two Tables (18 To 10 Players) MTT Playbook: Reshoves & FT Bubble Pressure',
    effectiveBbRange: '12BB - 35BB (High-Leverage Short-Handed Semi-Finals)',
    averageBubbleFactor: '1.35 - 1.75 (Rising Final-Table Bubble Pressure)',
    optimalVpipPfr: '25% - 31% VPIP (Short-Handed 6-To-8 Player Tables)',
    summary:
      'At The Final Two Tables (18 Down To 10 Players), Tables Run Short-Handed (5 To 8 Players Per Table) And Pay Jumps Accelerate Toward The Final Table where 70%+ Of The Total Prize Pool Resides. Mastering 15BB-25BB 3-Bet Reshove Wedges And Final-Table Bubble Pressure Determines Whether You Enter The Final Table As A Chip Leader.',
    strategyPillars: [
      'Short-Handed Effective M Acceleration: With Only 5 Or 6 Players Per Table On The Final Table Bubble (10 Or 11 Left), The 2.5BB Orbit Cost Hits Every 5.5 Hands, Forcing Relentless Blind Defense And Stealing.',
      'The 16BB-24BB Reshove Wedge: Identify Aggressive Openers Whose 30BB-40BB Stack Cannot Afford To Call Your 20BB All-In Without Risking Half Their Stack Before The Final Table.',
      'Final Table Bubble ICM Squeeze (10th And 11th Place): While Short Stacks Freeze Up Hoping To Make The Official 9-Handed Final Table TV/Stream Set, Big Stacks Can Steal With Impunity.',
      'Stop Calling 3-Bet Shoves With Dominated Aces (A9o-AJo): When A Tight 18BB Stack Reshoves Over Your Open At The Final Two Tables, Their Range Is Heavily Weighted To 77+, AQo+, AKs.',
    ],
    ifThenBecause:
      'If Playing 5-Handed Or 6-Handed On The Final Table Bubble (10-11 Left) With A 20BB Stack -> Then 3-Bet Jam High-Card Blockers (A5s, AJo, KQs) And Pairs Over Late-Position 35BB Openers -> Because A 35BB Opener Faces A 1.55+ Bubble Factor Calling Off Half Their Stack.',
    recommendedCalculators: [
      { name: 'Malmuth-Harville ICM Calculator', href: '/tools/icm-calculator' },
      { name: 'Harrington Effective M Calculator', href: '/tools/m-ratio-calculator' },
      { name: '3-Bet & Resteal EV Calculator', href: '/tools/3bet-calculator' },
    ],
    faqs: [
      {
        q: 'Why Is The Final Table Bubble (10 Players Left) Often More Profitable For Big Stacks Than The Money Bubble?',
        a: 'Because Only Two 5-Handed Tables Remain, Meaning A Big Stack Plays Every Single Hand Directly Against The 4 Opponents At Their Table And Can Apply Personal ICM Pressure On Every Orbit.',
      },
      {
        q: 'What Is The Optimal Open-Raise Size At The Final Two Tables?',
        a: 'Strictly 2.0x BB From All Positions Except The Small Blind (Where Limp-Mixing Or 2.5x-3.0x Raising Is Used). A 2.0x Open Minimizes Loss When Restealed Against.',
      },
      {
        q: 'How Do I Adjust When One Table Has 3 Micro-Stacks And My Table Has Only Big Stacks?',
        a: 'Tighten Your All-In Clash Ranges At The Big-Stack Table! Letting The Micro-Stacks At The Other Table Eliminate Each Other Locks Up Thousands Of Dollars In Free ICM Equity.',
      },
    ],
  },
  {
    slug: 'final-table-icm-combat',
    code: 'STAGE-7-FT',
    name: 'Stage 7: 9-Handed Final Table ICM Combat & Pay-Jump Ladder',
    shortTitle: 'Final Table ICM Combat Playbook',
    title: 'Final Table ICM Combat Strategy Playbook',
    h1: '9-Handed Final Table ICM Combat Playbook: Pay Jumps, Risk Premiums & Deals',
    effectiveBbRange: '8BB - 75BB (Multi-Tier Pay Jump Equilibrium)',
    averageBubbleFactor: '1.45 - 2.30 (Asymmetric Stack-On-Stack ICM Matrix)',
    optimalVpipPfr: 'Dictated By Stack Rank (1st Place 38% VPIP vs 4th Place 14% VPIP)',
    summary:
      'At A 9-Handed Final Table, Every Single Elimination Triggers A Massive Exponential Pay Jump (9th Place Typically Pays ~1.8% Of The Pool While 1st Place Pays ~18% To 22%). Your Optimal Preflop And Postflop Strategy Is Dictated Not By Absolute Big Blinds Alone, But By Your Exact Stack Rank Relative To Short Stacks And Covering Stacks.',
    strategyPillars: [
      'Compute Your Pairwise Bubble Factor Matrix: Before The First Hand Of The Final Table Deals, Note Who Covers You And How Many Short Stacks (<12BB) Sit At The Table.',
      'Second-Stack Restraint vs First-Stack Aggression: The #2 Stack At A Final Table Must Avoid High-Variance All-In Confrontations With The #1 Chip Leader While Short Stacks Are Still Alive, But Can Brutally Pressure #3 Through #9.',
      'Downward Postflop Bet Sizing: In ICM Final Table Pots, A 25% To 33% Flop C-Bet And 45% Turn Barrel Generates The Exact Same Fold Pressure As A 75% Cash-Game Bet Because Covered Opponents Cannot Risk Elimination.',
      'ICM Chop & Deal Evaluation: When 3 To 5 Players Remain, Always Run Exact Malmuth-Harville ICM Numbers Before Accepting Any Chip-Chop Proposal.',
    ],
    ifThenBecause:
      'If You Hold The 2nd Or 3rd Largest Stack At A Final Table With Two Sub-10BB Short Stacks Active -> Then Refuse To Stack Off Light Against The #1 Chip Leader -> Because Busting In 7th Place When Two Short Stacks Were About To Bust Burns 40%+ Of Your Dollar Equity.',
    recommendedCalculators: [
      { name: 'Final Table ICM Equity Calculator', href: '/tools/icm-calculator' },
      { name: 'Final Table Deal & Chop Calculator', href: '/tools/chop-calculator' },
      { name: 'Final Table Interactive Simulator', href: '/hub/training/final-table-sim' },
    ],
    faqs: [
      {
        q: 'Why Do GTO Solvers Bet Smaller Postflop At A Final Table Under ICM?',
        a: 'Because The Defender Carries A 1.50 To 2.10 Bubble Factor, Any Chips They Lose Cost Them Almost Double In Real Dollars What Chips Won Gain Them. Therefore, A Small 25%-33% Pot Bet Forces The Same Indifference Fold As A 66% Cash-Game Bet At Half The Risk.',
      },
      {
        q: 'What Is The Difference Between A Chip-Chop Deal And An ICM-Chop Deal?',
        a: 'A Chip-Chop Distributes Prize Money Strictly Proportionally To Chip Counts (Overpaying The Chip Leader Relative To Real Win Probability). An ICM-Chop Uses Malmuth-Harville Probabilities To Value Every Stack Fairly.',
      },
      {
        q: 'When Should A Short Stack Demand More Than ICM In A Final Table Deal?',
        a: 'Almost Never; It Is The Skilled Chip Leader Who Can Justifiably Ask For 2% To 4% Above Raw ICM Because Their Covering Leverage Allows Them To Out-Pressure Short Stacks If Play Continues.',
      },
    ],
  },
  {
    slug: 'heads-up-for-the-title',
    code: 'STAGE-8-HU',
    name: 'Stage 8: Heads-Up For The Title (Zero ICM Pure Chip-EV Duel)',
    shortTitle: 'Heads-Up For The Title MTT Playbook',
    title: 'Heads Up Tournament Final Duel Playbook',
    h1: 'Heads-Up For The Title MTT Playbook: Returning To 1.00 Bubble Factor Chip-EV',
    effectiveBbRange: '10BB - 60BB (1-On-1 Championship Match)',
    averageBubbleFactor: '1.00 (Zero ICM Distortion: Pure Linear Chip EV)',
    optimalVpipPfr: '75% - 85% Button VPIP / 55% - 68% BB Defense',
    summary:
      'The Moment The 3rd-Place Player Busts, 2nd-Place Prize Money Is 100% Locked Up For Both Remaining Contenders And You Are Playing Strictly Winner-Take-All For The Difference Between 1st And 2nd Place. Bubble Factor Drops Instantly From 1.85 Back To Exactly 1.00: Every Chip Won Or Lost Carries Identical Linear Dollar Value.',
    strategyPillars: [
      'Instant Switch Back To 1.00 Bubble Factor: Shed All Final-Table ICM Tightness Immediately. A 51% vs 49% All-In Coinflip Is Once Again Automatically +EV.',
      'Button / Small Blind 80%+ Engagement: On The Button (Which Posts The Small Blind And Acts First Preflop And Last Postflop), Open-Raise Or Limp-Mix 78% To 88% Of All Starting Hands depending On Stack Depth.',
      'Shallow Heads-Up Nash Push/Fold And Limp-Trapping (<20BB): Below 20BB Effective Depth, Mix 2.0x Min-Raises, Limp-Shoves (With Small Pairs And Strong Aces), And Direct Open-Shoves.',
      'Aggressive River Bluff-Catching: Because Ranges Are Ultra-Wide (80% Vs 65%), One-Pair Hands Like Second Pair Or Ace-High Are Strong Showdown Bluff-Catchers Heads-Up.',
    ],
    ifThenBecause:
      'If The Tournament Reaches Heads-Up (2 Players Remaining) -> Then Revert Immediately To 1.00 Bubble Factor Chip-EV Thresholds And Open 80%+ Of Buttons -> Because 2nd Place Money Is Locked And You Are Playing A Pure Linear Match For The Top Differential.',
    recommendedCalculators: [
      { name: 'Heads-Up Push/Fold Nash Calculator', href: '/tools/push-fold-calculator' },
      { name: 'Multi-Way & Heads-Up Odds Calculator', href: '/tools/poker-odds-calculator' },
      { name: 'Final Table Deal & Trophy Chop Tool', href: '/tools/chop-calculator' },
    ],
    faqs: [
      {
        q: 'Why Is There Zero ICM Pressure Once A Tournament Reaches Heads-Up?',
        a: 'Because Both Players Have Already Guaranteed The 2nd-Place Payout. If 2nd Pays $60,000 And 1st Pays $100,000, Both Players Already Own $60,000 And Are Playing A Pure Winner-Take-All Freezeout For The Remaining $40,000.',
      },
      {
        q: 'Why Do Solvers Limp So Many Hands From The Button At 15BB-25BB Heads-Up?',
        a: 'At 15BB To 25BB With A Big Blind Ante, Raising To 2.0x Allows The Big Blind To profitably 3-Bet Jam Wide And Deny Your Postflop Positional Advantage. Limping At 1.0x Realizes Positional Equity With Hands Like Q7o, J6s, While Protected By Limp-Reraise Traps (AA, KK, A5s).',
      },
      {
        q: 'What Hand Strength Is Considered A Monster In A 25BB Heads-Up Match?',
        a: 'In A 25BB Heads-Up Match, Any Pocket Pair 66+, Any Ace-Ten+, Or Any Flopped Top Pair Is Strong Enough To Play For All The Chips.',
      },
    ],
  },
];

export function findTournamentStage(slug) {
  if (!slug) return null;
  const clean = String(slug).trim().toLowerCase();
  return (
    TOURNAMENT_STAGES.find(
      (s) => s.slug === clean || s.code.toLowerCase() === clean
    ) || null
  );
}

export function renderTournamentStagesIndexMarkdown() {
  return [
    '# MTT Tournament Stage Strategy Playbooks (All 8 Phases From Level 1 To Heads-Up)',
    '',
    `Last Verified: ${TOURNAMENT_STAGES_AS_OF} | Zenodo DOI: ${TOURNAMENT_STAGES_DOI}`,
    `Canonical URL: ${TOURNAMENT_STAGES_URL}`,
    '',
    '## Master 8-Stage MTT Progression & Bubble Factor Matrix',
    '',
    '| Stage | Effective BB Range | Bubble Factor | Optimal VPIP / PFR | Core Causal Rule |',
    '| :--- | :--- | :--- | :--- | :--- |',
    ...TOURNAMENT_STAGES.map(
      (s) =>
        `| [${s.name}](${TOURNAMENT_STAGES_URL}/${s.slug}) | ${s.effectiveBbRange} | ${s.averageBubbleFactor} | ${s.optimalVpipPfr} | ${s.ifThenBecause} |`
    ),
    '',
  ].join('\n');
}

export function renderTournamentStageDetailMarkdown(slugOrObj) {
  const s = typeof slugOrObj === 'string' ? findTournamentStage(slugOrObj) : slugOrObj;
  if (!s) return '';
  const url = `${TOURNAMENT_STAGES_URL}/${s.slug}`;
  return [
    `# ${s.h1}`,
    '',
    `> Source: [${s.name} on Smarter.Poker](${url}) | DOI: https://doi.org/${TOURNAMENT_STAGES_DOI}`,
    '',
    '## Stage Benchmark Metrics',
    `- **Effective BB Range**: ${s.effectiveBbRange}`,
    `- **Average ICM Bubble Factor**: ${s.averageBubbleFactor}`,
    `- **Target VPIP / PFR Profile**: ${s.optimalVpipPfr}`,
    '',
    '## Executive Stage Playbook',
    s.summary,
    '',
    '## Core Strategic Pillars',
    ...(s.strategyPillars || []).map((p) => `- ${p}`),
    '',
    '## Causal Decision Rule (If / Then / Because)',
    s.ifThenBecause,
    '',
    '## Recommended Stage Calculators',
    ...(s.recommendedCalculators || []).map(
      (c) => `- **[${c.name}](https://smarter.poker${c.href})**`
    ),
    '',
    '## Frequently Asked Questions',
    ...(s.faqs || []).flatMap((f) => [`### ${f.q}`, f.a, '']),
  ].join('\n');
}
