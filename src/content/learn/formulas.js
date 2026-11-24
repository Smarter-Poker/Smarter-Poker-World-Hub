/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  POKER MATH FORMULAS & EQUATIONS ENCYCLOPEDIA (src/content/learn/formulas.js)
 * ═══════════════════════════════════════════════════════════════════════════════
 * Authoritative source of truth for /learn/formulas and /learn/formulas/[slug].
 * Covers 15 canonical quantitative poker equations with LaTeX, plain equations,
 * variable definitions, worked examples, If/Then/Because causal rules, common
 * mistakes, paired calculator deep-links, citation claims, and FAQs.
 *
 * House style: Title Case, zero em dashes.
 */

export const FORMULAS_AS_OF = '2026-11-24';
export const FORMULAS_BASE_PATH = '/learn/formulas';
export const FORMULAS_URL = 'https://smarter.poker/learn/formulas';
export const FORMULAS_DOI = '10.5281/zenodo.15129481';

export function formulaPath(slug) {
  return `/learn/formulas/${slug}`;
}

export const FORMULA_CATEGORIES = [
  'Foundational Pot & Equity Math',
  'GTO Solver Equilibrium',
  'Multi-Street & Sizing Geometry',
  'Tournament ICM & Bounty Math',
  'Bankroll & Variance Risk',
];

export const POKER_FORMULAS = [
  {
    slug: 'pot-odds',
    code: 'POT-ODDS',
    name: 'Pot Odds & Required Breakeven Equity Equation',
    shortTitle: 'Pot Odds & Required Equity Formula',
    title: 'Poker Pot Odds And Required Equity Formula',
    h1: 'Pot Odds & Required Breakeven Equity Formula: Complete Poker Math Guide',
    category: 'Foundational Pot & Equity Math',
    equationLatex: 'E_{\\text{req}} = \\frac{C}{P_0 + B + C}',
    equationPlain: 'Required Equity (%) = Call Amount / (Pot Before Bet + Opponent Bet + Call Amount)',
    metricLabel: 'Breakeven vs 50% Pot Bet',
    metricValue: '25.00% Required Equity (3:1 Odds)',
    variables: [
      { symbol: 'E_req', meaning: 'Minimum Breakeven Showdown Equity Percentage Required For A Zero-EV Call' },
      { symbol: 'C', meaning: 'Call Amount You Must Invest Into The Pot' },
      { symbol: 'P_0', meaning: 'Pot Size Before Your Opponent Placed Their Bet' },
      { symbol: 'B', meaning: 'Opponent Bet Size Facing You On The Current Street' },
    ],
    workedExample:
      'There Is $100 In The Center Pot On The River And Your Opponent Bets $50 (Making The Pot $150 Before Your Action). You Must Call $50 To Win A Total Final Pot Of $200. Required Equity = $50 / ($100 + $50 + $50) = $50 / $200 = 25.00%. Whenever Your Bluff-Catcher Wins More Than 25.00% Of The Time At Showdown, Calling Generates Positive Expected Value.',
    ifThenBecause:
      'If Your Hand Equity Against Villain Betting Range Exceeds Call / (Pot + Bet + Call) -> Then Call Immediately -> Because Every Percentage Point Above The Breakeven Threshold Captures Pure Long-Term Pot Profit.',
    commonMistake:
      'Dividing The Call Amount By The Pot Before Your Call ($50 / $150 = 33.3%) Instead Of Including Your Own Call In The Total Final Pot ($50 / $200 = 25.0%), Which Causes Players To Over-Fold Profitable Bluff-Catchers.',
    calculatorHref: '/tools/pot-odds-calculator',
    calculatorName: 'Pot Odds & MDF Calculator',
    citationClaim:
      'Facing A Half-Pot Bet (50% Pot), A Player Receives Exactly 3-To-1 Direct Pot Odds And Requires Only 25.00% Raw Showdown Equity To Break Even On A Call.',
    faqs: [
      {
        q: 'How Do I Convert Ratio Pot Odds (3-To-1) Into Percentage Equity At A Live Table?',
        a: 'Add The Two Numbers In The Ratio Together And Divide The Right Side By That Sum. For 3-To-1 Pot Odds: 1 / (3 + 1) = 1 / 4 = 25.0% Required Equity. For 2-To-1 Pot Odds: 1 / (2 + 1) = 1 / 3 = 33.33% Required Equity.',
      },
      {
        q: 'How Does Rake Affect The Pot Odds Breakeven Formula In Cash Games?',
        a: 'Subtract The Expected Casino Rake Drop From The Final Pot Denominator: Required Equity = Call / (Total Final Pot - Rake). In High-Rake Low-Stakes Cash Games ($6 Cap), Required Equity Increases By 1.5% To 2.5% On Medium Pots.',
      },
      {
        q: 'Do Direct Pot Odds Account For Future Betting Streets?',
        a: 'Direct Pot Odds Assume No Further Betting Or All-In Closure. When Stacks Remain Deep Behind On The Flop Or Turn, You Must Adjust Direct Pot Odds Using Implied Odds Or Reverse Implied Odds.',
      },
    ],
  },
  {
    slug: 'minimum-defense-frequency',
    code: 'MDF',
    name: 'Minimum Defense Frequency (MDF) & Indifference Equation',
    shortTitle: 'Minimum Defense Frequency (MDF) Formula',
    title: 'Poker Minimum Defense Frequency MDF Formula',
    h1: 'Minimum Defense Frequency (MDF) Formula: GTO Bluff-Catching & Indifference Guide',
    category: 'GTO Solver Equilibrium',
    equationLatex: '\\text{MDF} = 1 - \\alpha = \\frac{P}{P + B}',
    equationPlain: 'MDF (%) = Pot Size / (Pot Size + Opponent Bet Size)',
    metricLabel: 'MDF vs 100% Full-Pot Bet',
    metricValue: '50.00% Minimum Continuing Range',
    variables: [
      { symbol: 'MDF', meaning: 'Minimum Percentage Of Your Current Range That Must Continue (By Calling Or Raising)' },
      { symbol: 'P', meaning: 'Pot Size Immediately Prior To The Opponent Bet' },
      { symbol: 'B', meaning: 'Size Of The Bet Or Raise Placed By Your Opponent' },
      { symbol: 'alpha', meaning: 'Pure Bluff Breakeven Frequency (B / (P + B))' },
    ],
    workedExample:
      'On A Brick River With $120 In The Pot, Your Opponent Fires A 75% Pot Bet Of $90. MDF = $120 / ($120 + $90) = 120 / 210 = 57.14%. To Prevent Your Opponent From Generating Automatic Profit By Bluffing Any Two Unpaired Cards, You Must Defend (Call Or Raise) With At Least The Top 57.14% Of The Hands You Reached The River With.',
    ifThenBecause:
      'If An Opponent Polarizes With A Bet Of Size B Into Pot P -> Then Defend Close To P / (P + B) Using Hands That Unblock Bluffs And Block Value -> Because Folding More Than Alpha (B / (P + B)) Guarantees Automatic Any-Two-Cards Bluff Profit.',
    commonMistake:
      'Applying Raw MDF Blindly On The Flop When Out Of Position Against A Range Advantage Raiser: When Your Range Has A Severe Equity Disadvantage On A High Card Board (Like A-K-7), Solver Equilibrium Folds Slightly More Than Raw MDF Because Even Villain Air Holds Live Overcard Equity.',
    calculatorHref: '/tools/pot-odds-calculator',
    calculatorName: 'Minimum Defense Frequency (MDF) Solver',
    citationClaim:
      'Under Game Theory Optimal Equilibrium On The River, Minimum Defense Frequency Equals P / (P + B), Requiring A 75.0% Defense Rate Against A 33% Bet And A 50.0% Defense Rate Against A 100% Pot Bet.',
    faqs: [
      {
        q: 'When Does A GTO Solver Deviate From Raw Minimum Defense Frequency?',
        a: 'Raw MDF Assumes The Aggressor Bluffs Hold 0% Equity When Called (True Only On The River With Polarized Air). On The Flop And Turn, Where Bluffs Hold 15% To 35% Draw Equity And The Aggressor Holds Range Advantage, The Defender Must Fold More Often Than Raw 1 - Alpha.',
      },
      {
        q: 'Should I Follow MDF Against A Tight-Passive Live Player Who Never Bluffs?',
        a: 'No. MDF Is A Defensive Shield Against Balanced Or Aggressive Bluffs. If An Old Man Coffee Or Tight Regular Under-Bluffs The River By 15%, The Optimal Exploit Is To Over-Fold All Pure Bluff-Catchers.',
      },
      {
        q: 'How Do I Choose Which Hands Make My MDF Cutoff On The River?',
        a: 'Rank Hands Not Just By Absolute Hand Strength, But By Card Removal: Prioritize Bluff-Catchers That Block Villain Nut Value Combos And Unblock Villain Missed Flush Or Straight Draws.',
      },
    ],
  },
  {
    slug: 'expected-value',
    code: 'EV',
    name: 'Expected Value (EV) Fundamental Poker Decision Equation',
    shortTitle: 'Poker Expected Value (EV) Formula',
    title: 'Poker Expected Value EV Formula And Guide',
    h1: 'Poker Expected Value (EV) Formula: Calculating Long-Term Profit On Every Street',
    category: 'Foundational Pot & Equity Math',
    equationLatex: '\\text{EV} = \\sum_{i} P(O_i) \\times V(O_i) = (W \\times G) - (L \\times R)',
    equationPlain: 'EV ($) = (Win Probability x Net Amount Won) - (Loss Probability x Amount Risked)',
    metricLabel: 'EV Threshold Invariant',
    metricValue: 'EV > 0.00 BB (Strictly Profitable Decision)',
    variables: [
      { symbol: 'EV', meaning: 'Average Long-Term Dollar Or Big Blind Profit Generated Per Execution Of The Action' },
      { symbol: 'W', meaning: 'Probability (0.00 To 1.00) That You Win The Pot At Showdown Or Via Fold' },
      { symbol: 'G', meaning: 'Net Chips Or Dollars Gained From The Pot When You Win' },
      { symbol: 'L', meaning: 'Probability (1 - W) That You Lose The Hand' },
      { symbol: 'R', meaning: 'Chips Or Dollars You Risk From Your Stack On The Current Action' },
    ],
    workedExample:
      'Your Opponent Shoves All-In For $100 Into A $100 Pot On The River (Total Pot Available To Win Before Your Call Is $200; Risked Call Is $100). You Estimate Your Hand Wins 40% Of The Time (W = 0.40) And Loses 60% Of The Time (L = 0.60). EV = (0.40 x $200) - (0.60 x $100) = $80.00 - $60.00 = +$20.00 Per Call.',
    ifThenBecause:
      'If The Probability-Weighted Sum Of All Branch Outcomes Exceeds Zero ((W x G) - (L x R) > 0) -> Then Execute The Line Without Hesitation -> Because The Law Of Large Numbers Converges Cumulative Bankroll Profit To Summed EV.',
    commonMistake:
      'Counting Previously Invested Street Chips As Part Of Current Risk R: Once Chips Cross The Betting Line On The Flop Or Turn, They Belong To The Center Pot And Must Never Be Treated As Uncommitted Stack Risk On The River.',
    calculatorHref: '/tools/poker-odds-calculator',
    calculatorName: 'Multi-Way Equity & EV Simulator',
    citationClaim:
      'Under The Fundamental Theorem Of Poker And Expected Value Calculus, Sunk Chips From Prior Betting Streets Carry Zero Weight In Current-Street EV Equations; Only Uncommitted Stack Risk And Remaining Pot Equity Govern Optimal Action.',
    faqs: [
      {
        q: 'Why is a Fold Always Defined As 0.00 EV In Poker Solvers?',
        a: 'Solvers Measure Expected Value Relative To The Decision Node Baseline. Because Folding Surrenders All Claim To The Current Pot While Risking Zero Additional Chips From Your Remaining Stack, Folding Establishes The 0.00 BB Reference Floor.',
      },
      {
        q: 'Can Both Calling And Raising Be +EV In The Same Spot?',
        a: 'Yes. Often Calling Yields +1.8 BB While Raising Yields +3.4 BB. A Winning Player Always Selects The Highest-EV Branch Rather Than Merely Any Positive-EV Branch.',
      },
      {
        q: 'How Does Chip EV (cEV) Differ From Dollar EV ($EV)?',
        a: 'In Cash Games, 1 Chip Always Equals Fixed Dollar Value (cEV = $EV). In Tournaments, Payout Jumps Cause Diminishing Marginal Chip Value, Requiring Malmuth-Harville ICM Conversion From cEV To $EV.',
      },
    ],
  },
  {
    slug: 'spr-commitment',
    code: 'SPR',
    name: 'Stack-To-Pot Ratio (SPR) Postflop Commitment Equation',
    shortTitle: 'Stack-To-Pot Ratio (SPR) Formula',
    title: 'Poker Stack To Pot Ratio SPR Formula',
    h1: 'Stack-To-Pot Ratio (SPR) Formula: Flop Commitment Zones & Sizing Architecture',
    category: 'Multi-Street & Sizing Geometry',
    equationLatex: '\\text{SPR} = \\frac{S_{\\text{eff}}}{P_{\\text{flop}}}',
    equationPlain: 'SPR = Effective Remaining Stack / Flop Pot Size',
    metricLabel: 'One-Pair Stack-Off Zone',
    metricValue: 'SPR <= 3.5 (3-Bet & Short-Stack Pots)',
    variables: [
      { symbol: 'SPR', meaning: 'Ratio Of Uncommitted Effective Chips To The Starting Flop Pot' },
      { symbol: 'S_eff', meaning: 'Smaller Remaining Chip Stack Between The Active Contenders On The Flop' },
      { symbol: 'P_flop', meaning: 'Total Chips In The Center Pot At The Start Of Flop Action' },
    ],
    workedExample:
      'In A $2/$5 Cash Game With $500 Effective Stacks (100BB), Cutoff Opens To $15, Button 3-Bets To $45, Blinds Fold, And Cutoff Calls. The Flop Pot Is $97 ($92 After $5 Rake) And Both Players Have $455 Behind. SPR = $455 / $92 = 4.95. Had Cutoff 4-Bet To $115 And Button Called ($232 Pot, $385 Behind), SPR Drops To 1.66, Where Any Overpair Or Top Pair Is Locked In.',
    ifThenBecause:
      'If Flop SPR Drops Below 3.5 With An Overpair Or Top Pair Top Kicker -> Then Plan A 2-Street Geometric Value Commitment Line -> Because Opponent Set-Mining And Speculative Draw Implied Odds Are Mathematically Denied At Low SPR.',
    commonMistake:
      'Using Your Own Big Stack Instead Of The Smaller Opponent Stack To Compute SPR, Or Failing To Adjust Hand Selection Preflop When Short Stacks Compress Effective SPR Below The 15-To-1 Set-Mining Threshold.',
    calculatorHref: '/tools/spr-calculator',
    calculatorName: 'Stack-To-Pot Ratio (SPR) Calculator',
    citationClaim:
      'At Stack-To-Pot Ratios Below 3.0, An Overpair Or Top Pair Top Kicker Requires Less Than 38% All-In Equity Against Villain Stack-Off Range To Profitably Commit, Eliminating Postflop Foldability.',
    faqs: [
      {
        q: 'What Are The Three Canonical SPR Commitment Zones In No-Limit Holdem?',
        a: 'Low SPR (0 To 3.5): Automatic Commitment Zone For Top Pair And Overpairs. Medium SPR (4.0 To 8.5): Two Pair, Strong Combo Draws, And Select Overpairs. High SPR (9.0+): Deep-Stack Nut Zone Requiring Sets, Straights, Or Flushes To Stack Off 100BB+.',
      },
      {
        q: 'How Do I Manipulate SPR Preflop To Favor My Hand Category?',
        a: 'With High Pocket Pairs (AA, KK, QQ) And AK, Use Larger 3-Bets And 4-Bets To Drive SPR Down Toward 1.5 To 4.0. With Speculative Suited Connectors And Small Pairs In Position, Call Or Keep Pots Compact So SPR Remains Above 10.',
      },
      {
        q: 'Why Is SPR So Much Lower In Pot-Limit Omaha (PLO) Than Holdem?',
        a: 'Because PLO Equities Run Close Together And Pot-Size Raises Escalate Exponentially Preflop, 3-Bet PLO Pots Frequently Start On The Flop With An SPR Between 1.0 And 2.5.',
      },
    ],
  },
  {
    slug: 'kelly-criterion',
    code: 'KELLY',
    name: 'Kelly Criterion Optimal Bankroll Stake Fraction Equation',
    shortTitle: 'Kelly Criterion Poker Bankroll Formula',
    title: 'Kelly Criterion Poker Bankroll Formula',
    h1: 'Kelly Criterion Formula For Poker Bankroll Management & Optimal Stake Sizing',
    category: 'Bankroll & Variance Risk',
    equationLatex: 'f^* = \\frac{\\mu}{\\sigma^2} \\quad \\Rightarrow \\quad B_{\\text{Kelly}} = \\frac{\\sigma^2}{\\mu}',
    equationPlain: 'Full Kelly Bankroll (In 100BB Buy-Ins) = (StdDev_100^2) / (100 x Winrate_BB100)',
    metricLabel: 'Half-Kelly 6-Max Cushion',
    metricValue: '29 Buy-Ins At +5 BB/100 (85 StdDev)',
    variables: [
      { symbol: 'f*', meaning: 'Optimal Fraction Of Total Liquid Bankroll Risked Per 100-Hand Interval' },
      { symbol: 'mu', meaning: 'True Expected Winrate In Big Blinds Per 100 Hands (BB/100)' },
      { symbol: 'sigma', meaning: 'Standard Deviation In Big Blinds Per 100 Hands (Typically 75-100 In NLH, 130-160 In PLO)' },
    ],
    workedExample:
      'A 6-Max Online Cash Grinder Wins At mu = +5.0 BB/100 With Standard Deviation sigma = 85 BB/100. Full Kelly Bankroll = (85^2) / 5.0 = 7,225 / 5.0 = 1,445 Big Blinds (14.45 Buy-Ins). Because Full Kelly Carries High Short-Term Volatility And Winrates Are Estimated With Uncertainty, Professional Grinders Use Half-Kelly (2x = 28.9 Buy-Ins) Or Quarter-Kelly (4x = 57.8 Buy-Ins).',
    ifThenBecause:
      'If Your Format Standard Deviation Doubles (Such As Moving From NLH To 5-Card PLO) -> Then Quadruple Your Buy-In Cushion At The Same Winrate -> Because Kelly Required Bankroll Scales With Variance Squared (sigma^2).',
    commonMistake:
      'Plugging A Short-Term Heater Winrate (+15 BB/100 Over 20 Hours) Into Full Kelly, Which Leads To Severe Over-Betting Of Bankroll Equity And Immediate Ruin During A Standard 15-Buy-In Downswing.',
    calculatorHref: '/tools/bankroll-calculator',
    calculatorName: 'Bankroll & Kelly Criterion Calculator',
    citationClaim:
      'Under Continuous Gaussian Kelly Criterion Optimization, Required Poker Bankroll Scales Linearly With Inverse Winrate (1 / mu) And Quadratically With Format Standard Deviation (sigma^2), Requiring 4x More Buy-Ins When Volatility Doubles.',
    faqs: [
      {
        q: 'Why Do Professional Poker Players Use Half-Kelly Or Quarter-Kelly Instead Of Full Kelly?',
        a: 'Full Kelly Maximizes Logarithmic Growth Rate Assuming You Know Your Exact True Winrate With 100% Certainty. Because Poker Winrates Carry A Wide Standard Error Over Under 200,000 Hands, Half-Kelly Achieves 75% Of The Maximum Growth Rate With Only 25% Of The Variance.',
      },
      {
        q: 'How Many Buy-Ins Does Quarter-Kelly Recommend For Live $2/$5 Cash Games?',
        a: 'If A Live $2/$5 Grinder Wins +8 BB/100 ($40/Hr At 30 Hands/Hr) With A Live Standard Deviation Of 95 BB/100, Full Kelly Is 9,025 / 8 = 1,128 BB (11.3 Buy-Ins), Putting Half-Kelly At 23 Buy-Ins And Conservative Quarter-Kelly At 45 Buy-Ins.',
      },
      {
        q: 'Can Kelly Criterion Be Used ForTournament Staking And Shot-Taking?',
        a: 'Yes. When Taking A 1-Table Shot At A Higher Stake where Expected Winrate Drops From +6 BB/100 To +2.5 BB/100, Kelly Dictates Selling Action Or Enforcing A Strict 3-Buy-In Shot Stop-Loss.',
      },
    ],
  },
  {
    slug: 'risk-of-ruin',
    code: 'ROR',
    name: 'Risk Of Ruin (RoR) Brownian Downswing Probability Equation',
    shortTitle: 'Poker Risk Of Ruin (RoR) Formula',
    title: 'Poker Risk Of Ruin RoR Formula And Guide',
    h1: 'Poker Risk Of Ruin (RoR) Formula: Exact Downswing & Bankroll Survival Math',
    category: 'Bankroll & Variance Risk',
    equationLatex: '\\text{RoR} = \\exp\\left( \\frac{-2 \\cdot \\mu \\cdot B}{\\sigma^2} \\right)',
    equationPlain: 'Risk Of Ruin (%) = exp( (-2 x Winrate_BB100 x Bankroll_BB) / (StdDev_BB100^2) )',
    metricLabel: 'RoR At 35 Buy-Ins (+5 BB/100)',
    metricValue: '0.79% Lifetime Ruin Probability',
    variables: [
      { symbol: 'RoR', meaning: 'Probability Of Losing Your Entire Bankroll B Before Infinite Horizon Growth' },
      { symbol: 'mu', meaning: 'True Winrate In Big Blinds Per 100 Hands' },
      { symbol: 'B', meaning: 'Total Dedicated Poker Bankroll Expressed In Big Blinds' },
      { symbol: 'sigma', meaning: 'Standard Deviation In Big Blinds Per 100 Hands' },
    ],
    workedExample:
      'A Player Holds 3,000 Big Blinds (30 Buy-Ins At 100BB) With A True Winrate Of +4.5 BB/100 And Standard Deviation Of 85 BB/100 (Variance sigma^2 = 7,225). RoR = exp( (-2 x 4.5 x 3000) / 7225 ) = exp( -27,000 / 7,225 ) = exp(-3.737) = 2.38% Probability Of Total Bankroll Depletion Assuming Fixed Stakes.',
    ifThenBecause:
      'If Your Computed Risk Of Ruin Exceeds 1.0% At Your Current Stake -> Then Move Down One Stake Level Immediately When Dropping 25% Of Your Roll -> Because Moving Down Dynamically Resets Effective Buy-In Depth And Cuts Ruin Probability Toward Zero.',
    commonMistake:
      'Assuming Risk Of Ruin Remains Static While Withdrawing Monthly Living Expenses From The Active Bankroll: Every Living Expense Withdrawal Acts As A Negative Drift Reduction On mu.',
    calculatorHref: '/tools/bankroll-calculator',
    calculatorName: 'Risk Of Ruin & Variance Simulator',
    citationClaim:
      'For A +5.0 BB/100 6-Max No-Limit Holdem Winner (85 BB/100 Standard Deviation), Carrying 20 Buy-Ins Yields A 6.27% Risk Of Ruin, Whereas 35 Buy-Ins Compresses Risk Of Ruin To 0.79%.',
    faqs: [
      {
        q: 'What Is TheRisk Of Ruin Of A Breakeven Or Losing Poker Player?',
        a: 'If True Winrate mu <= 0.00 BB/100 Over An Infinite Sample With A Finite Bankroll, Mathematical Risk Of Ruin Is Exactly 100.0%. No Bankroll Size Can Protect A Negative-EV Strategy.',
      },
      {
        q: 'How Do I Solve The Risk Of Ruin Formula Backwards For Required Bankroll?',
        a: 'Take The Natural Log Of Your Target Risk Of Ruin: Required Bankroll (BB) = [ -ln(Target_RoR) x (StdDev^2) ] / (2 x Winrate). For A 1% RoR (-ln(0.01) = 4.605), Bankroll = (2.3026 x StdDev^2) / Winrate.',
      },
      {
        q: 'Why Do Multi-Table Tournaments Require 100 To 200+ Buy-Ins For Under 1% RoR?',
        a: 'Large-Field MTTs Feature Top-Heavy Payout Structures (1st Place Pays 15% To 20% Of The Pool), Producing Massive Buy-In Standard Deviations That Require 100+ ABI Cushions.',
      },
    ],
  },
  {
    slug: 'malmuth-harville-icm',
    code: 'ICM',
    name: 'Malmuth-Harville Independent Chip Model (ICM) Tournament Equity Equation',
    shortTitle: 'Malmuth-Harville ICM Formula',
    title: 'Malmuth Harville ICM Tournament Formula',
    h1: 'Malmuth-Harville ICM Formula: Converting Tournament Chips To Real Dollar Equity',
    category: 'Tournament ICM & Bounty Math',
    equationLatex: 'P(i = 1\\text{st}) = \\frac{c_i}{C}, \\quad P(i = k\\text{th}) = \\sum_{j \\neq i} P(j = 1\\text{st}) \\cdot P(i = (k-1)\\text{th} \\mid C - c_j)',
    equationPlain: 'Dollar Equity ($EV_i) = Sum Over All Places k Of [ P(Player i Finishes Place k) x Payout_k ]',
    metricLabel: '50% Chip Leader ICM Share (3-Way)',
    metricValue: '38.33% Prize Pool Equity (50/30/20 Payouts)',
    variables: [
      { symbol: 'c_i', meaning: 'Current Tournament Chip Stack Of Player i' },
      { symbol: 'C', meaning: 'Total Tournament Chips In Play Across All Remaining Players' },
      { symbol: 'Payout_k', meaning: 'Cash Prize Awarded To Finishing Position k' },
    ],
    workedExample:
      'Three Players Remain For A $1,000 Prize Pool Paying $500 (1st), $300 (2nd), And $200 (3rd). Stacks Are P1 = 5,000, P2 = 3,000, P3 = 2,000 (Total 10,000). P1 Wins 1st 50.0% Of The Time. P1 Finishes 2nd Behind P2: 0.30 x (5000/7000) = 21.43%; Behind P3: 0.20 x (5000/8000) = 12.50% (Total 2nd = 33.93%, Total 3rd = 16.07%). P1 $EV = (0.50 x $500) + (0.3393 x $300) + (0.1607 x $200) = $250 + $101.79 + $32.14 = $383.93.',
    ifThenBecause:
      'If Two Short Stacks Are Clashing On A Final Table With Major Pay Jumps Below You -> Then Tighten Your Medium-Stack Calling Range Substantially -> Because Every Elimination Below You Transfers Instant Risk-Free Malmuth-Harville Dollar Equity.',
    commonMistake:
      'Making Chip-EV (+52% Coinflip) All-In Calls For Your Tournament Life As A Medium Stack On The Final Table When Two 8BB Short Stacks Are About To Blind Out.',
    calculatorHref: '/tools/icm-calculator',
    calculatorName: 'Malmuth-Harville ICM Calculator',
    citationClaim:
      'Under Malmuth-Harville Independent Chip Model Recursion, A Final Table Chip Leader Holding 50% Of All Chips In Play Captures Only 38.39% Of A Standard 50%/30%/20% Three-Handed Prize Pool Due To The First-Place Ceiling.',
    faqs: [
      {
        q: 'Why Does Doubling Your Stack In A Tournament Never Double Your Dollar Value?',
        a: 'Because You Cannot Win First Place Twice. Even If You Accumulate 100% Of The Chips, You Only Win 1st Place ($500 Out Of $1,000), So Each Additional Chip Carries Diminishing Marginal Dollar Utility.',
      },
      {
        q: 'What Is The Difference Between Malmuth-Harville ICM And Future Game Simulation (FGS)?',
        a: 'Standard Malmuth-Harville ICM Is Blind-Agnostic (It Ignores Who Posts The Big Blind Next Hand). Future Game Simulation (FGS) Looks 1 To 6 Orbits Ahead To Account For Imminent Blind Posting By Short Stacks.',
      },
      {
        q: 'How Do I Use The ICM Formula To Negotiate A Final Table Chop?',
        a: 'Enter Every Remaining Player Chip Stack And Remaining Payout Tier Into The Smarter.Poker ICM Calculator To Output Exact Fair Dollar Shares, Leaving 5% To 10% On The Table To Play For.',
      },
    ],
  },
  {
    slug: 'bubble-factor',
    code: 'BUBBLE-FACTOR',
    name: 'Tournament Bubble Factor & Risk Premium Equation',
    shortTitle: 'Tournament Bubble Factor Formula',
    title: 'Poker Bubble Factor And Risk Premium Math',
    h1: 'Tournament Bubble Factor & Risk Premium Formula: Exact ICM Calling Thresholds',
    category: 'Tournament ICM & Bounty Math',
    equationLatex: '\\text{BF}_{i,j} = \\frac{\\Delta \\text{EV}_{\\text{lose}}}{\\Delta \\text{EV}_{\\text{win}}}, \\quad E_{\\text{ICM-req}} = \\frac{\\text{BF}}{\\text{BF} + 1}',
    equationPlain: 'Bubble Factor (BF) = Dollar Equity Lost If Stacked / Dollar Equity Gained If Doubling Up',
    metricLabel: 'Stone Bubble Medium-Stack BF',
    metricValue: 'BF = 1.85 To 2.40 (64.9% - 70.6% Equity Needed)',
    variables: [
      { symbol: 'BF', meaning: 'Ratio Of Real Dollar Equity Lost When Eliminated To Dollar Equity Gained When Winning The All-In' },
      { symbol: 'Delta_EV_lose', meaning: 'Current ICM Equity Minus Post-Loss ICM Equity' },
      { symbol: 'Delta_EV_win', meaning: 'Post-Double-Up ICM Equity Minus Current ICM Equity' },
      { symbol: 'E_ICM_req', meaning: 'Required Head-To-Head All-In Equity To Break Even In Dollars (BF / (BF + 1))' },
    ],
    workedExample:
      'At A Final Table, Your Current 25BB Stack Is Worth $4,200 In ICM Equity. If You Call The Chip Leader All-In And Lose, Your Equity Drops To $0 (Loss = $4,200). If You Call And Double Up To 50BB, Your New ICM Equity Is $6,500 (Gain = $2,300). Bubble Factor = $4,200 / $2,300 = 1.826. Required Equity = 1.826 / (1.826 + 1) = 64.61% (A +14.61% Risk Premium Above A 50% Cash Coinflip!).',
    ifThenBecause:
      'If Your Bubble Factor Against A Covering Big Stack Exceeds 1.80 -> Then Fold Pocket Tens, Ace-Queen, And Medium Pairs To Their Shove -> Because You Require Over 64.3% Raw Equity Simply To Break Even In Tournament Dollars.',
    commonMistake:
      'Treating Bubble Factor As Symmetric Between Two Players: The Covering Big Stack Has A Low Bubble Factor (~1.20) Against You, While You Have A Massive Bubble Factor (~2.00) Against Them.',
    calculatorHref: '/tools/icm-calculator',
    calculatorName: 'ICM Bubble Factor & Risk Premium Solver',
    citationClaim:
      'In Tournament ICM Combat, Required All-In Calling Equity Equals BF / (BF + 1): A Bubble Factor Of 2.00 Demands 66.67% Showdown Equity (+16.67% Risk Premium Over Chip EV).',
    faqs: [
      {
        q: 'What Is The Bubble Factor In A Standard Cash Game?',
        a: 'In A Cash Game, Every Chip Won Or Lost Equals Its Exact Face Value ($1 Won = $1 Lost), So Bubble Factor Is Always Exactly 1.00 (1 / (1 + 1) = 50.0% Even-Money Equity).',
      },
      {
        q: 'Which Player At A Final Table Has The Highest Bubble Factor?',
        a: 'The Second-Place Or Third-Place Medium Stack Facing An All-In From The Chip Leader While Short Stacks Sit At The Table. They Risk Losing Guaranteed 2nd/3rd Place Money To Gain Marginal Chip-Lead Equity.',
      },
      {
        q: 'Can A Bubble Factor Ever Be Less Than 1.00?',
        a: 'Yes! In Progressive Knockout (PKO) Or Mystery Bounty Tournaments, A Covering Big Stack Hunting A Large Bounty Can Have An Effective Bubble Factor Below 0.85, Allowing Profitable Calls With Under 45% Equity.',
      },
    ],
  },
  {
    slug: 'bounty-chip-equivalence',
    code: 'BOUNTY-EV',
    name: 'PKO & Mystery Bounty Starting-Stack Chip Equivalence Equation',
    shortTitle: 'Bounty Chip Equivalence Formula',
    title: 'PKO And Mystery Bounty Chip Formula',
    h1: 'PKO & Mystery Bounty Chip Equivalence Formula: Converting Knockouts To Chips',
    category: 'Tournament ICM & Bounty Math',
    equationLatex: 'C_{\\text{bounty}} = S_0 \\times \\frac{\\text{Bounty}_{\\text{cash}}}{\\text{PrizePoolShare}_{S_0}} \\approx 0.33 \\cdot S_0 \\cdot \\left(\\frac{B_{\\text{collected}}}{B_{\\text{initial}}}\\right)',
    equationPlain: 'Bounty Chip Value = Starting Stack x (Immediate Cash Bounty Collected / Regular Buy-In Prize Pool Share)',
    metricLabel: '1 Starting PKO Bounty Value',
    metricValue: '33.3% Of Starting Stack (At 50/50 PKO Split)',
    variables: [
      { symbol: 'C_bounty', meaning: 'Equivalent Tournament Chips Added To The Center Pot When You Cover The All-In Player' },
      { symbol: 'S_0', meaning: 'Tournament Starting Chip Stack At Level 1' },
      { symbol: 'B_collected', meaning: 'Immediate Cash Dollar Amount Pockets On Elimination (50% Of Displayed PKO Bounty)' },
    ],
    workedExample:
      'In A $100 PKO Tournament ($50 To Regular Prize Pool, $50 To Bounty Pool) With A 10,000 Starting Stack, Eliminating A Player On Hand 1 Immediately Pays $25 Cash (And Adds $25 To Your Own Head). Because 10,000 Chips Represent $50 Of Regular Pool Plus $25 Future Equity ($75 Total), A $25 Instant Bounty Equals 25 / 75 = 33.3% Of A Starting Stack (3,333 Virtual Chips Added To The Pot).',
    ifThenBecause:
      'If You Cover An All-In Short Stack In A PKO Or Mystery Bounty Phase -> Then Add The Converted Bounty Chip Value Directly To The Pot Denominator Before Computing Pot Odds -> Because Only A Covering Stack Can Realize The Knockout Equity.',
    commonMistake:
      'Calling Wider With A Bounty On Your Own Head When You Are Covered By The Opponent: If Your Opponent Covers You, The Bounty Adds Zero Chips To Your Pot Odds.',
    calculatorHref: '/tools/bounty-calculator',
    calculatorName: 'PKO & Mystery Bounty Chip Calculator',
    citationClaim:
      'In A Standard 50/50 Progressive Knockout (PKO) Tournament, One Initial Starting Bounty Equals Exactly 33.33% Of A Starting Chip Stack (Growing To 40%+ In Late Stages As ICM Discounts Regular Chips).',
    faqs: [
      {
        q: 'How Does The Bounty Power Factor Change Late In A PKO Tournament?',
        a: 'As The Tournament Reaches The Final Two Tables, ICM Compression Reduces The Marginal Dollar Value Of Regular Tournament Chips While Cash Bounties Retain 100% Face Dollar Value, Increasing A Starting Bounty From 33% To Over 45% Of A Starting Stack.',
      },
      {
        q: 'How Do I Calculate Mystery Bounty Chip Value Once In The Money?',
        a: 'Divide The Total Remaining Unpulled Mystery Bounty Pool By The Number Of Remaining Players To Find The Average Envelope Value, Then Divide By The Regular Dollar Value Per Chip.',
      },
      {
        q: 'How Much Wider Can I Call A 15BB Shove When Covering A 2x Starting Bounty?',
        a: 'A 2x Starting Bounty Adds ~6,667 Chips (6.7BB At 500/1000) Of Dead Money To A 31.5BB Total Pot, Dropping Required Calling Equity From 47.6% Down To 39.2%.',
      },
    ],
  },
  {
    slug: 'fold-equity-breakeven',
    code: 'FOLD-EQUITY',
    name: 'Fold Equity & Semi-Bluff All-In Total EV Equation',
    shortTitle: 'Fold Equity & Semi-Bluff EV Formula',
    title: 'Poker Fold Equity And Semi Bluff Formula',
    h1: 'Fold Equity & Semi-Bluff All-In Formula: Combining Folds With Draw Equity',
    category: 'Foundational Pot & Equity Math',
    equationLatex: '\\text{EV}_{\\text{shove}} = F \\cdot P_0 + (1 - F) \\cdot \\left[ E_{\\text{call}} \\cdot (P_0 + B_{\\text{call}} + S) - S \\right]',
    equationPlain: 'Total Shove EV = (Fold % x Current Pot) + (Call % x [ (Equity When Called x Final All-In Pot) - Risked Shove ])',
    metricLabel: '9-Out Flush Draw Shove Breakeven',
    metricValue: '21.8% Required Fold Equity (At 1x Pot Shove)',
    variables: [
      { symbol: 'F', meaning: 'Probability (0.00 To 1.00) That Your Opponent Folds To Your All-In Or Raise' },
      { symbol: 'P_0', meaning: 'Current Pot Size Before Your Semi-Bluff Action' },
      { symbol: 'E_call', meaning: 'Your Showdown Equity When Villain Calls Your Shove' },
      { symbol: 'S', meaning: 'Total Chips Risked In Your Semi-Bluff Shove' },
    ],
    workedExample:
      'The Flop Pot Is $100 (Including Villain $33 C-Bet) And You Check-Raise All-In For $100 Total With A 9-Out Nut Flush Draw (35.0% Equity When Called). If Villain Folds 40% Of The Time (F = 0.40): EV = (0.40 x $100) + 0.60 x [ (0.35 x $267) - $100 ] = $40.00 + 0.60 x (-$6.55) = +$36.07 Net Profit.',
    ifThenBecause:
      'If Your Draw Holds 30%+ Showdown Equity When Called And Villain Folds At Least 25% Of Their C-Bet Range -> Then Check-Raise Semi-Bluff Aggressively -> Because Compounding Fold Equity With Live Draw Outs Overcomes Slight Showdown Underdog Status.',
    commonMistake:
      'Using Pure Bluff Alpha (Bet / (Pot + Bet)) To Evaluate A Semi-Bluff: Pure Alpha Assumes 0% Equity When Called, Which Massively Understates The Profitability Of Semi-Bluffing 8-Out To 15-Out Draws.',
    calculatorHref: '/tools/3bet-calculator',
    calculatorName: '3-Bet & Fold Equity EV Calculator',
    citationClaim:
      'A 100% Pot-Sized Semi-Bluff With A 35% Equity Flush Draw Requires Only 23.1% Fold Equity To Break Even, Compared To 50.0% Fold Equity For A Zero-Equity Pure Bluff.',
    faqs: [
      {
        q: 'What Is The Exact Formula For Pure Bluff Breakeven (Alpha)?',
        a: 'When Equity When Called Is 0% (E_call = 0), The Formula Simplifies To Alpha = Risked Bet / (Current Pot + Risked Bet). A Pot-Sized Pure Bluff Needs 50% Folds.',
      },
      {
        q: 'When Is A Semi-Bluff Shove +EV Even With 0% Fold Equity?',
        a: 'When You Hold A 15-Out Combo Draw (Straight + Flush Draw With 54.1% Flop Equity Against One Pair) Or When Existing Dead Money In The Pot Gives Direct Pot Odds Above Your Equity.',
      },
      {
        q: 'Why Do Blockers Increase Fold Equity In 3-Bet And River Shoves?',
        a: 'Holding An Ace Or King Blocker Removes 25% To 50% Of Villain Top-Of-Range Calling Combinations (AA, KK, AK), Directly Increasing Their Mathematical Fold Frequency F.',
      },
    ],
  },
  {
    slug: 'geometric-bet-sizing',
    code: 'GEOMETRIC-BET',
    name: 'Multi-Street 2e & 3e Geometric Bet Sizing Equation',
    shortTitle: 'Geometric Bet Sizing Formula (2e & 3e)',
    title: 'Poker Geometric Bet Sizing Formula Guide',
    h1: 'Geometric Bet Sizing Formula (2e & 3e): Smooth Multi-Street All-In Pot Growth',
    category: 'Multi-Street & Sizing Geometry',
    equationLatex: 'b_N = \\frac{(2 \\cdot \\text{SPR} + 1)^{1/N} - 1}{2}',
    equationPlain: 'Equal Geometric Bet Fraction (b) = [ ((2 x SPR + 1)^(1 / N)) - 1 ] / 2',
    metricLabel: '3-Street (3e) Geometric At SPR 4',
    metricValue: '54.25% Pot On Flop, Turn & River',
    variables: [
      { symbol: 'b_N', meaning: 'Constant Percentage Of The Pot Bet On Each Of The Remaining N Streets To Reach All-In' },
      { symbol: 'SPR', meaning: 'Current Stack-To-Pot Ratio (Remaining Effective Stack / Current Pot)' },
      { symbol: 'N', meaning: 'Number Of Remaining Betting Streets Planned (N = 3 On Flop, N = 2 On Turn)' },
    ],
    workedExample:
      'You Reach The Flop In A Single-Raised Pot With $20 In The Center And $90 Effective Stacks Behind (SPR = 4.50). To Bet The Exact Same Percentage Of The Pot On Flop, Turn, And River (N = 3): b_3 = [ ((2 x 4.5 + 1)^(1/3)) - 1 ] / 2 = (10^0.3333 - 1) / 2 = (2.1544 - 1) / 2 = 57.72% Of The Pot On Every Street.',
    ifThenBecause:
      'If You Hold A Polarized Nut Advantage Range On A Static Board -> Then Size Your Flop And Turn Barrels To The Geometric 2e Or 3e Fraction -> Because Equal Percentage Growth Maximizes Total EV Extraction From Inelastic Bluff-Catchers Without Awkward Tiny River Shoves.',
    commonMistake:
      'Betting 33% On The Flop And 50% On The Turn At High SPR (SPR 9) With The Nuts, Which Leaves A Massive 220% River Overbet Shove That Alerts Opponents To Fold All One-Pair Hands.',
    calculatorHref: '/tools/geometric-bet-calculator',
    calculatorName: '2e & 3e Geometric Bet Sizing Calculator',
    citationClaim:
      'To Put An Entire 100BB Effective Stack All-In Across Three Equal Percentage Barrels From A 6.5BB Single-Raised Flop Pot (SPR 14.6), The Exact 3e Geometric Bet Size Is 106.1% Of The Pot Per Street.',
    faqs: [
      {
        q: 'What Does "2e" And "3e" Mean In Modern GTO Solver Bet Sizing?',
        a: '"3e" Means The Equal Pot-Fraction Bet Size That Puts All Remaining Chips In Across 3 Streets (Flop, Turn, River), While "2e" Puts All Remaining Chips In Across 2 Streets (Flop + Turn, Or Turn + River).',
      },
      {
        q: 'What Is The Exact SPR For 100% Pot Bets Across Three Streets?',
        a: 'Setting b_3 = 1.00 (100% Pot): 2 x SPR + 1 = (2(1) + 1)^3 = 27, So SPR = (27 - 1) / 2 = 13.0. At SPR 13, Betting Full Pot On Flop (1 -> 3), Turn (3 -> 9), And River (9 -> 27) Invests Exactly 13x The Starting Pot.',
      },
      {
        q: 'When Does A Solver Prefer Non-Geometric Sizing (Like Small Flop, Big Turn)?',
        a: 'On Dynamic Flops Where Turn Cards Dramatically Shift Nut Advantage, Solvers Bet 33% On The Flop With Their Entire Range And Then Polarize To A 2e Geometric Size (75% To 150%) On Favorable Turn Cards.',
      },
    ],
  },
  {
    slug: 'polar-bluff-to-value-ratio',
    code: 'BLUFF-RATIO',
    name: 'Optimal Polarized River Bluff-To-Value Ratio Equation',
    shortTitle: 'Polarized Bluff-To-Value Ratio Formula',
    title: 'Poker Bluff To Value Ratio GTO Formula',
    h1: 'Optimal Polarized Bluff-To-Value Ratio Formula: Balanced River Sizing Math',
    category: 'GTO Solver Equilibrium',
    equationLatex: 'R_{\\text{bluff}} = \\frac{B}{P + 2B}, \\quad \\text{Ratio}_{\\text{Bluff:Value}} = B : (P + B)',
    equationPlain: 'Bluff Share Of Betting Range (%) = Bet Size / (Pot Size + 2 x Bet Size)',
    metricLabel: '100% Pot River Bet Balance',
    metricValue: '33.33% Bluffs / 66.67% Value (1:2 Ratio)',
    variables: [
      { symbol: 'R_bluff', meaning: 'Optimal Percentage Of Your Total River Betting Range Composed Of Zero-Equity Bluffs' },
      { symbol: 'B', meaning: 'River Bet Size Placed By The Polarized Aggressor' },
      { symbol: 'P', meaning: 'Center Pot Size Prior To The River Bet' },
    ],
    workedExample:
      'On The River With $100 In The Pot, You Bet $75 (75% Pot) With A Polarized Range Of Nutted Value Hands And Missed Draw Bluffs. Villain Receives ($100 + $75) : $75 = 175 : 75 = 7 : 3 Pot Odds (Needs 30.0% Equity To Call). Therefore, Your River Betting Range Must Contain Exactly 30.0% Bluffs ($75 / ($100 + $150) = 75 / 250 = 30.0%) And 70.0% Value Hands.',
    ifThenBecause:
      'If You Increase Your Polarized River Bet Size From 50% Pot To 150% Overbet -> Then Expand Your Bluff Share From 25.0% Up To 37.5% Of Your Betting Range -> Because Larger Bet Sizes Offer Villain Worse Pot Odds.',
    commonMistake:
      'Confusing Villain Pot Odds (B / (P + 2B)) With Bluff-To-Value Ratio (B / (P + B)): At A Full-Pot Bet, Bluffs Are 1/3 Of Your Total Betting Range (33.3% Share), Which Is A 1-To-2 Ratio Of Bluffs To Value (Not 50% Of Your Range!).',
    calculatorHref: '/tools/pot-odds-calculator',
    calculatorName: 'Polarized Bluff-To-Value & MDF Calculator',
    citationClaim:
      'To Make An Opponent Indifferent With Pure Bluff-Catchers On The River, The Aggressor Bluff Share Must Equal B / (P + 2B): 20.0% Bluffs At 33% Pot, 25.0% Bluffs At 50% Pot, 33.3% Bluffs At 100% Pot, And 40.0% Bluffs At 200% Pot.',
    faqs: [
      {
        q: 'What Is The Maximum Possible Bluff Percentage In An Infinite River Overbet?',
        a: 'As River Overbet Size B Approaches Infinity Relative To Pot P, B / (P + 2B) Approaches 1 / 2 = 50.0% Bluffs And 50.0% Value (A 1:1 Ratio). You Can Never Profitably Have More Pure Bluffs Than Value Hands On The River In Equilibrium.',
      },
      {
        q: 'How Many Bluff Combos Should I Have If I Hold 12 Value Combos And Bet 75% Pot?',
        a: 'At 75% Pot, The Bluff-To-Value Ratio Is 0.75 : 1.75 (3 Bluffs For Every 7 Value Combos). With 12 Value Combos, Include 12 x (3 / 7) = 5.14 (Roughly 5) Bluff Combinations.',
      },
      {
        q: 'Should I Balance My River Bluff Ratio Against Low-Stakes Live Players?',
        a: 'Only Against Observant Regulars. Against A Live Calling Station Who Calls Every River Bet, Drop Your Bluff Frequency To 0% And Value-Bet Thin. Against A Tight Player Who Over-Folds To River Overbets, Bluff Well Above 40%.',
      },
    ],
  },
  {
    slug: 'effective-m-ratio',
    code: 'M-RATIO',
    name: 'Harrington M-Ratio & Short-Handed Effective M Equation',
    shortTitle: 'Harrington M-Ratio & Effective M Formula',
    title: 'Harrington M Ratio And Effective M Formula',
    h1: 'Harrington M-Ratio & Effective M Formula: Tournament Orbit Survival Zones',
    category: 'Tournament ICM & Bounty Math',
    equationLatex: 'M = \\frac{S}{\\text{SB} + \\text{BB} + A_{\\text{orbit}}}, \\quad M_{\\text{eff}} = M \\times \\left(\\frac{N_{\\text{players}}}{10}\\right)',
    equationPlain: 'M-Ratio = Chip Stack / (Small Blind + Big Blind + Total Table Antes) | Effective M = M x (Active Players / 10)',
    metricLabel: 'Red Zone Push-Fold Trigger',
    metricValue: 'Effective M <= 5.0 (Or <= 12.5 Big Blinds)',
    variables: [
      { symbol: 'M', meaning: 'Number Of Full Table Orbits Your Stack Can Survive If Folding Every Hand' },
      { symbol: 'S', meaning: 'Your Current Tournament Chip Stack' },
      { symbol: 'A_orbit', meaning: 'Total Antes Posted Across One Complete Orbit (Equals 1 BB In Modern Big Blind Ante Events)' },
      { symbol: 'N_players', meaning: 'Number Of Active Seated Players Currently At Your Table' },
    ],
    workedExample:
      'At Blinds 1,000 / 2,000 With A 2,000 Big Blind Ante (Total Orbit Cost = 1,000 + 2,000 + 2,000 = 5,000 Chips), You Hold 30,000 Chips At A 6-Handed Final Table. Raw M = 30,000 / 5,000 = 6.0 Orbits. Because The Table Is 6-Handed, Blinds Hit You Faster: Effective M = 6.0 x (6 / 10) = 3.60 (Firmly In The Red Push-Or-Fold Zone).',
    ifThenBecause:
      'If Your Effective M Drops Below 6.0 (Roughly 15BB In A Big Blind Ante Structure) -> Then Eliminate Speculative Open-Calling And Shift To First-In All-In Or Tight 2x Open-Commit Ranges -> Because Fold Equity Collapses Once Your Shove Cannot Threaten Villain Pot Odds.',
    commonMistake:
      'Counting Only Big Blinds While Ignoring The Big Blind Ante And Short-Handed Table Speed: 12 Big Blinds At A 5-Handed Final Table With A Big Blind Ante Burns Through 42% Of Your Stack In Two Orbits.',
    calculatorHref: '/tools/m-ratio-calculator',
    calculatorName: 'Harrington M-Ratio & Orbit Calculator',
    citationClaim:
      'In Modern Big Blind Ante (BBA) Tournaments Where Each Orbit Costs 2.5 Big Blinds, An M-Ratio Of 6.0 Corresponds Exactly To A 15.0 Big Blind Stack Depth (The Universal Push-Or-Fold Inflection Point).',
    faqs: [
      {
        q: 'What Are Dan Harrington Five Canonical M-Ratio Zones?',
        a: 'Green Zone (M >= 20): Full Deep-Stack Freedom. Yellow Zone (M 10 To 19): Aggressive Stealing, Drop Small Pairs OOP. Orange Zone (M 6 To 9): Re-Steal All-In And Tight Opens. Red Zone (M 1 To 5): Strictly Push-Or-Fold. Dead Zone (M < 1): Zero Fold Equity.',
      },
      {
        q: 'How do Big Blind Antes (BBA) Change The Classic M-Ratio Conversion?',
        a: 'Under Universal TDA Big Blind Ante Rules, The Big Blind Posts A 1BB Ante For The Entire Table Regardless Of Seat Count, Making Orbit Cost Constantly 2.5BB (1SB + 1BB + 1BB Ante). Thus M = Stack_BB / 2.5.',
      },
      {
        q: 'Why Do You Multiply M By (Players / 10) For Effective M?',
        a: 'With Fewer Players At The Table, The Blinds Rotate Through Your Seat Proportionally Faster. At A 5-Handed Table, You Pay The Blinds Twice As Often Per 10 Hands As At A 10-Handed Table.',
      },
    ],
  },
  {
    slug: 'g-bucks-range-ev',
    code: 'G-BUCKS',
    name: 'Galfond G-Bucks (Range vs Range Expected Value) Equation',
    shortTitle: 'Galfond G-Bucks Range EV Formula',
    title: 'Galfond G Bucks RangeVsRange EV Formula',
    h1: 'Galfond G-Bucks Formula: Range-Vs-Range Equity & True Sklansky Dollars',
    category: 'GTO Solver Equilibrium',
    equationLatex: '\\text{G-Bucks}(H, R_V) = P_{\\text{total}} \\times \\left( \\frac{\\sum_{c \\in R_V} w_c \\cdot E(H, c)}{\\sum_{c \\in R_V} w_c} \\right) - C_{\\text{invested}}',
    equationPlain: 'G-Bucks ($) = (Total Pot x Hero Hand Equity Against Villain Exact Weighted Range) - Hero Chips Invested',
    metricLabel: 'Level-3 Evaluation Standard',
    metricValue: 'Hand vs Weighted Opponent Range (Not Card-vs-Card)',
    variables: [
      { symbol: 'H', meaning: 'Your Exact Specific Hole Cards On The Current Street' },
      { symbol: 'R_V', meaning: 'Your Opponent Complete Weighted Range Of Possible Hole Card Combinations' },
      { symbol: 'E(H, c)', meaning: 'All-In Equity Of Your Hand H Against Specific Villain Combination c' },
      { symbol: 'w_c', meaning: 'Probability Weight (0.0 To 1.0) That Villain Reaches This Node With Combo c' },
    ],
    workedExample:
      'You Call A $100 River Shove Into A $100 Pot ($300 Total Pot) With King-High Flush. Villain Shows Ace-High Flush (So You Lose -$100 In Real Dollars And -$100 In Card-Vs-Card Sklansky Bucks). However, Villain Shoving Range Contained 4 Combos Of Ace-High Flush, 6 Combos Of Lower Flushes, And 5 Missed Bluffs (You Beat 11 Of 15 Combos = 73.33% Range Equity). Your G-Bucks Profit = (0.7333 x $300) - $100 = +$120.00!',
    ifThenBecause:
      'If Your Hand Holds High G-Bucks Equity Against Villain Complete Weighted Range -> Then Ignore Single-Hand Showdown Coolers When Evaluating Your Decision -> Because Only Range-Vs-Range Equity Determines Long-Term Solver EV.',
    commonMistake:
      'Judging A Call As A Mistake Simply Because Villain Tabled The Top 10% Of Their Range At Showdown (Results-Oriented Thinking Instead Of G-Bucks Range Accounting).',
    calculatorHref: '/tools/poker-odds-calculator',
    calculatorName: 'Range-Vs-Range Equity & G-Bucks Simulator',
    citationClaim:
      'Phil Galfond G-Bucks Framework Proves That Sklansky All-In EV Graphs Still Contain Card-Distribution Variance; True Skill Edge Is Measured Exclusively By Hand Equity Against Villain Weighted Decision-Node Range.',
    faqs: [
      {
        q: 'What Is The Difference Between Real Dollars, Sklansky Bucks, And G-Bucks?',
        a: 'Real Dollars Measure Actual Pot Won After The River Card Lands. Sklansky Bucks Measure All-In Equity Between The Two Specific Hands Tabled (Ignoring Runout Luck). G-Bucks Measure Your Hand Equity Against Every Hand In Villain Range (Ignoring Which Specific Combo Villain Happened To Hold).',
      },
      {
        q: 'What Is The Fourth Level Beyond G-Bucks (Range Vs Range EV)?',
        a: 'Full Range-Vs-Range Solver EV: Evaluating How Your Entire Weighted Range Performs Against Villain Entire Weighted Range Across The Whole Game Tree.',
      },
      {
        q: 'How Do I Calculate G-Bucks In Post-Session Hand Reviews?',
        a: 'Count Every Value Combo And Bluff Combo Your Opponent Takes That Exact Line With, Compute Your Equity Against Each Bucket, Weight By Combo Count, And Multiply By Total Final Pot.',
      },
    ],
  },
  {
    slug: 'bayes-range-updating',
    code: 'BAYES-THEOREM',
    name: 'Bayesian Range Updating & Street Filtering Equation',
    shortTitle: 'Bayes Theorem Poker Range Updating Formula',
    title: 'Bayes Theorem Poker Range Updating Guide',
    h1: 'Bayes Theorem In Poker: Street-By-Street Range Narrowing & Conditional Probability',
    category: 'GTO Solver Equilibrium',
    equationLatex: 'P(H_i \\mid A_t) = \\frac{P(A_t \\mid H_i) \\cdot P(H_i)}{\\sum_{j} P(A_t \\mid H_j) \\cdot P(H_j)}',
    equationPlain: 'Posterior Combo Weight = (Prior Combo Weight x Action Frequency For Combo) / Sum Of All Continuing Weighted Combos',
    metricLabel: 'Range Narrowing Invariant',
    metricValue: 'River Range <= Turn Range <= Flop Range <= Preflop Range',
    variables: [
      { symbol: 'P(H_i)', meaning: 'Prior Probability Weight That Villain Holds Combo H_i At The Start Of The Street' },
      { symbol: 'P(A_t | H_i)', meaning: 'Conditional Probability That Villain Chooses Observed Action A_t When Holding H_i' },
      { symbol: 'P(H_i | A_t)', meaning: 'Updated Posterior Probability That Villain Holds H_i After Taking Action A_t' },
    ],
    workedExample:
      'Villain Calls Your Preflop Raise With 100 Total Combos (Prior): 12 Combos Of Sets/Two-Pair, 38 Combos Of One-Pair, And 50 Combos Of Air/Draws. On The Flop, Villain Check-Raises. You Estimate Villain Check-Raises 100% Of Sets/Two-Pair (12 x 1.0 = 12), 0% Of One-Pair (38 x 0 = 0), And 24% Of Draws (50 x 0.24 = 12). Total Continuing Combos = 24. By Bayes Theorem, P(Value | Check-Raise) = 12 / 24 = 50.0% And P(Draw | Check-Raise) = 12 / 24 = 50.0%.',
    ifThenBecause:
      'If An Opponent Never Takes A Specific Preflop Or Flop Action With A Hand Class (P(A | H) = 0) -> Then Permanently Zero Out That Hand Class On Later Streets -> Because Bayesian Multiplication By Zero Can Never Resurrect A Eliminated Combo.',
    commonMistake:
      'Putting An Opponent On A Rivered Full House Or Nut Flush That They Would Have 3-Bet Preflop Or Fast-Played On The Flop 100% Of The Time (Violating The Bayesian Prior Filter).',
    calculatorHref: '/tools/preflop-ranges',
    calculatorName: 'Interactive 13x13 Range Matrix & Filter',
    citationClaim:
      'Under Bayesian Conditional Probability Filtering, Every Street Action Multiplies Prior Combination Weights By Action Likelihood P(A_t | H_i), Monotonically Compressing Active Range Combos From Preflop To River.',
    faqs: [
      {
        q: 'Why Is The Rule "Ranges Only Narrow, Never Expand" A Consequence Of Bayes Theorem?',
        a: 'Because Every Action Likelihood P(A | H) Is Between 0.0 And 1.0. Multiplying Any Prior Combo Weight By A Number <= 1.0 Can Only Reduce Or Preserve That Combo Count, Never Create New Combos That Were Folded Earlier.',
      },
      {
        q: 'How Do Card Removal Blockers Interact With Bayesian Range Updating?',
        a: 'Before Multiplying By Action Frequencies, Any Combination Containing A Card Visible In Your Hand Or On The Community Board Has Its Prior Weight Set To 0.00.',
      },
      {
        q: 'How Do GTO Solvers Use Bayesian Updating During CFR Training?',
        a: 'Counterfactual Regret Minimization (CFR) Passes Reach Probabilities Down Every Branch Of The Game Tree, Which Are Exact Unnormalized Bayesian Posterior Range Weights.',
      },
    ],
  },
];

export function findFormulaBySlug(slug) {
  if (!slug) return null;
  const clean = String(slug).trim().toLowerCase();
  return POKER_FORMULAS.find((f) => f.slug === clean || f.code.toLowerCase() === clean) || null;
}

export function renderFormulasIndexMarkdown() {
  return [
    '# Poker Math Formulas & Equations Encyclopedia (15 Canonical Solver Equations)',
    '',
    `Last Verified: ${FORMULAS_AS_OF} | Zenodo DOI: ${FORMULAS_DOI}`,
    `Canonical URL: ${FORMULAS_URL}`,
    '',
    '## Master Table Of All 15 Core Poker Math Equations',
    '',
    '| Formula Name | Category | Plain Equation | Benchmark Metric | Paired Calculator |',
    '| :--- | :--- | :--- | :--- | :--- |',
    ...POKER_FORMULAS.map(
      (f) =>
        `| [${f.name}](${FORMULAS_URL}/${f.slug}) | ${f.category} | \`${f.equationPlain}\` | ${f.metricValue} | [${f.calculatorName}](https://smarter.poker${f.calculatorHref}) |`
    ),
    '',
  ].join('\n');
}

export function renderFormulaDetailMarkdown(slugOrObj) {
  const f = typeof slugOrObj === 'string' ? findFormulaBySlug(slugOrObj) : slugOrObj;
  if (!f) return '';
  const url = `${FORMULAS_URL}/${f.slug}`;
  return [
    `# ${f.h1}`,
    '',
    `> Source: [${f.name} on Smarter.Poker](${url}) | DOI: https://doi.org/${FORMULAS_DOI}`,
    '',
    '## Quantitative Formula & Invariant',
    `- **Category**: ${f.category}`,
    `- **Plain Equation**: \`${f.equationPlain}\``,
    `- **LaTeX Equation**: \`${f.equationLatex}\``,
    `- **Benchmark Metric (${f.metricLabel})**: ${f.metricValue}`,
    `- **Paired Interactive Solver**: [${f.calculatorName}](https://smarter.poker${f.calculatorHref})`,
    '',
    '## Variable Definitions',
    ...f.variables.map((v) => `- **\`${v.symbol}\`**: ${v.meaning}`),
    '',
    '## Worked Table Example',
    f.workedExample,
    '',
    '## Causal Decision Rule (If / Then / Because)',
    f.ifThenBecause,
    '',
    '## Common Player Mistake To Avoid',
    f.commonMistake,
    '',
    '## Frequently Asked Questions',
    ...(f.faqs || []).flatMap((faq) => [`### ${faq.q}`, faq.a, '']),
  ].join('\n');
}
