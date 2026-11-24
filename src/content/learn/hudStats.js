/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  POKER HUD STATS & POPULATION TENDENCIES ENCYCLOPEDIA (src/content/learn/hudStats.js)
 * ═══════════════════════════════════════════════════════════════════════════════
 * Authoritative source of truth for /learn/hud-stats and /learn/hud-stats/[stat].
 * Covers 15 canonical HUD metrics with exact equations, 6-Max and Full-Ring GTO
 * solver targets, low-stakes vs high-stakes population averages, statistical
 * sample size convergence requirements, low/high exploits, If/Then/Because rules,
 * paired calculators, and FAQs.
 *
 * House style: Title Case, zero em dashes.
 */

export const HUD_STATS_AS_OF = '2026-11-24';
export const HUD_STATS_BASE_PATH = '/learn/hud-stats';
export const HUD_STATS_URL = 'https://smarter.poker/learn/hud-stats';
export const HUD_STATS_DOI = '10.5281/zenodo.15129481';

export function hudStatPath(stat) {
  return `/learn/hud-stats/${stat}`;
}

export const HUD_STATS = [
  {
    slug: 'vpip',
    code: 'VPIP',
    name: 'VPIP (Voluntarily Put Money In Pot %)',
    shortTitle: 'VPIP HUD Stat & GTO Target Guide',
    title: 'Poker VPIP HUD Stat And GTO Target Guide',
    h1: 'VPIP (Voluntarily Put Money In Pot %): GTO Targets, Population Averages & Exploits',
    formula: 'VPIP (%) = (Hands Where Player Voluntarily Calls Or Raises Preflop / Total Dealt Hands) x 100',
    gto6MaxTarget: '23.0% - 26.5%',
    gtoFullRingTarget: '15.5% - 18.5%',
    lowStakesPopulationAvg: '31.5% Online / 44.0% Live $1/$3',
    highStakesPopulationAvg: '24.8% (Tightly Clustered Around Solver Baseline)',
    sampleSizeRequired: '30 - 50 Hands (Fastest Converging HUD Metric)',
    exploitLow:
      'Against Low VPIP (<17% 6-Max Or <12% Full Ring): Steal Their Blinds Relentlessly With 2.2x Min-Opens And Fold One-Pair Hands When They Show Postflop Aggression.',
    exploitHigh:
      'Against High VPIP (>35% 6-Max Or >45% Live): Isolate Their Limps And Cold-Calls With A Merged Linear Value Range (ATo+, KQo, 77+) And Value-Bet Thin Across Three Streets.',
    ifThenBecause:
      'If An Opponent VPIP Exceeds 38% Over At Least 40 Dealt Hands -> Then Widen Your Linear Value Isolation Range And Eliminate Pure Air Triple-Barrel Bluffs -> Because A 38%+ Preflop Range Carries Excess Dominated Top-Pair And Second-Pair Hands.',
    calculatorHref: '/tools/preflop-ranges',
    faqs: [
      {
        q: 'Does Checking Your Option In The Big Blind Count Toward VPIP?',
        a: 'No. Posting The Mandatory Small Blind And Big Blind (Or Checking Your Unraised Big Blind Option) Does Not Count As Voluntarily Putting Money In The Pot. Only Completing From The Small Blind Or Calling/Raising A Preflop Bet Counts.',
      },
      {
        q: 'Why Is The Gap Between VPIP And PFR So Important?',
        a: 'The VPIP-To-PFR Gap Measures Preflop Passivity (Cold-Calling And Limping). A Healthy 6-Max Regular Has A Gap Under 5% (24% VPIP / 20% PFR), Whereas A Gap Over 15% (42% VPIP / 8% PFR) Identifies A Loose-Passive Calling Station.',
      },
      {
        q: 'How Many Hands Does It Take For VPIP To Be Statistically Reliable?',
        a: 'Because Every Single Dealt Hand Is A VPIP Trial, VPIP Converges Within 30 To 50 Hands ( roughly 1.5 Hours At A Live Table Or 30 Minutes Online).',
      },
    ],
  },
  {
    slug: 'pfr',
    code: 'PFR',
    name: 'PFR (Preflop Raise Percentage %)',
    shortTitle: 'PFR HUD Stat & GTO Target Guide',
    title: 'Poker PFR Preflop Raise HUD Stat Guide',
    h1: 'PFR (Preflop Raise %): GTO 6-Max Targets, VPIP Gap & Exploitative Counters',
    formula: 'PFR (%) = (Hands With At Least One Preflop Raise Or Re-Raise / Total Dealt Hands) x 100',
    gto6MaxTarget: '19.5% - 23.0%',
    gtoFullRingTarget: '12.5% - 15.5%',
    lowStakesPopulationAvg: '14.2% Online / 8.5% Live $1/$3',
    highStakesPopulationAvg: '21.2%',
    sampleSizeRequired: '40 - 60 Hands',
    exploitLow:
      'Against Low PFR (<12% 6-Max Or <7% Live): Respect Their Preflop Open-Raises And 3-Bets As Top-Of-Range Heavy (JJ+, AQs+, AKo) And Avoid Calling With Dominated Offsuit Broadways.',
    exploitHigh:
      'Against High PFR (>28% 6-Max): Defend Wider Via In-Position 3-Bets And Punish Their Wide C-Bets With Aggressive Flop Check-Raises And Turn Floats.',
    ifThenBecause:
      'If An Opponent Shows 40% VPIP But Only 6% PFR -> Then Treat Every Rare Preflop Raise From Them As A Premium Top-6% Hand -> Because They Limp Their Mediocre Hands And Reserve Raising Exclusively For Monsters.',
    calculatorHref: '/tools/preflop-ranges',
    faqs: [
      {
        q: 'Can PFR Ever Be Higher Than VPIP?',
        a: 'No. Because Every Preflop Raise Voluntarily Puts Money Into The Pot, PFR Is A Strict Mathematical Subset Of VPIP (PFR <= VPIP Always).',
      },
      {
        q: 'What Is The Optimal PFR-To-VPIP Ratio In 6-Max Cash Games?',
        a: 'In Modern Raked 6-Max Cash Games Where Cold-Calling Is Minimized, PFR Should Equal 80% To 88% Of VPIP (For Example, 24% VPIP / 20.5% PFR).',
      },
      {
        q: 'Does A 3-Bet Or 4-Bet Count Toward PFR?',
        a: 'Yes. Any Preflop Open-Raise, Isolation Raise, 3-Bet, Or 4-Bet Increments Your PFR Counter For That Hand.',
      },
    ],
  },
  {
    slug: 'three-bet-pct',
    code: '3-BET%',
    name: '3-Bet % (Preflop Re-Raise Frequency)',
    shortTitle: '3-Bet % HUD Stat & GTO Target Guide',
    title: 'Poker 3 Bet Percentage HUD Stat Guide',
    h1: 'Preflop 3-Bet % HUD Stat: GTO Targets, Linear Vs. Polarized Ranges & Exploits',
    formula: '3-Bet (%) = (Times Player 3-Bet Preflop / Total Opportunities Facing A Single Open-Raise) x 100',
    gto6MaxTarget: '8.5% - 11.2%',
    gtoFullRingTarget: '5.5% - 7.5%',
    lowStakesPopulationAvg: '5.2% Online / 2.4% Live $1/$3',
    highStakesPopulationAvg: '10.4%',
    sampleSizeRequired: '150 - 300 Hands',
    exploitLow:
      'Against Low 3-Bet (<4.5%): Over-Fold Medium Pairs (77-TT) And Offsuit Broadways (AQo, AJo, KQo) When They 3-Bet You, As Their Range Is Strictly QQ+, AK (Top 2.5%).',
    exploitHigh:
      'Against High 3-Bet (>13%): Expand Your 4-Bet Value Range (99+, AQs+, AKo), Add Blocker 4-Bet Bluffs (A5s-A2s, KQs), And Call More In Position To Keep Their Wide Bluffs In.',
    ifThenBecause:
      'If An Opponent 3-Bet Percentage Is Below 3.5% Over 200+ Hands -> Then Fold Ace-Queen Offsuit And Pocket Tens To Their 3-Bet -> Because A 3.0% Range Holds 71%+ Equity Against AQo And 99.',
    calculatorHref: '/tools/3bet-calculator',
    faqs: [
      {
        q: 'What Percentage Of Hands equals AA, KK, QQ, And AK In A 3-Bet Stat?',
        a: 'Pocket Aces (6), Kings (6), Queens (6), And Ace-King (16) Total 34 Combinations Out Of 1,326 = Exactly 2.56% Of All Hands. Adding JJ And AQs Brings It To 44 Combos = 3.32%.',
      },
      {
        q: 'Which Seat At A 6-Max Table Has The Highest GTO 3-Bet Percentage?',
        a: 'The Small Blind (11% To 15% 3-Bet Against Cutoff/Button Opens) Because The Small Blind Plays A Near-Pure 3-Bet-Or-Fold Strategy In Raked Cash Games.',
      },
      {
        q: 'Why Does 3-Bet % Take 150+ Hands To Converge?',
        a: 'Because A Player Only Faces A Single Uncalled Open-Raise roughly Once Every 3 To 4 Dealt Hands, So 150 Dealt Hands Contains Only ~45 True 3-Bet Opportunities.',
      },
    ],
  },
  {
    slug: 'fold-to-three-bet',
    code: 'FOLD-TO-3B',
    name: 'Fold To 3-Bet % (After Open-Raising)',
    shortTitle: 'Fold To 3-Bet % HUD Stat & Exploit Guide',
    title: 'Fold To 3 Bet HUD Stat And Exploit Guide',
    h1: 'Fold To 3-Bet % HUD Stat: Alpha Breakeven Math & Polarized 3-Bet Exploits',
    formula: 'Fold To 3-Bet (%) = (Times Opener Folded To A 3-Bet / Total Times Opener Faced A 3-Bet) x 100',
    gto6MaxTarget: '52.0% - 58.0% (Depending On In-Position vs Out-Of-Position 3-Bet Size)',
    gtoFullRingTarget: '55.0% - 61.0%',
    lowStakesPopulationAvg: '62.5% Online (Sticky Live Players Average 34%)',
    highStakesPopulationAvg: '54.5%',
    sampleSizeRequired: '300 - 500 Hands',
    exploitLow:
      'Against Sticky Low Fold-To-3-Bet (<42%): Stop 3-Bet Bluffing Low Suited Connectors And Shift To A Widened Linear Value 3-Bet Range (TT+, AQo+, AJs+, KQs) With Larger 3.5x IP / 4.5x OOP Sizing.',
    exploitHigh:
      'Against High Fold-To-3-Bet (>63%): Attack Their Opens With Polarized Blocker 3-Bet Bluffs (A5s-A2s, K9s, Q9s, AJo) Because Any 3x 3-Bet Prints Automatic Pre-Flop Profit Whenever Villain Folds Over 60%.',
    ifThenBecause:
      'If An Opener Folds To 3-Bets Over 64% Of The Time -> Then 3-Bet Bluff High-Card Blockers (Ax, Kx Offsuit/Suited) At Compact 3.0x Sizing -> Because A 7.5BB 3-Bet Over A 2.5BB Open Needs Only 58.8% Folds For Immediate Zero-Equity Profit.',
    calculatorHref: '/tools/3bet-calculator',
    faqs: [
      {
        q: 'What Is The Exact Breakeven Fold Percentage For A 3-Bet Bluff?',
        a: 'When You 3-Bet From The Button To 7.5BB Over A 2.5BB Cutoff Open (With 1.5BB In The Blinds), You Risk 7.5BB To Win 4.0BB Dead Money. Alpha = 7.5 / (7.5 + 4.0) = 65.2% Pure Zero-Equity Folds (Or ~56% Folds Counting Postflop Equity When Called).',
      },
      {
        q: 'Why Should I Switch From Polarized To Linear 3-Bets Against Players Who Never Fold?',
        a: 'Against An Opponent Who Calls 65% Of 3-Bets, Your Weak Polarized Bluffs (Like 64s Or K5s) Get Dominated Postflop, Whereas Linear Hands (AJs, KQs, TT) Dominate Their Wide Calling Range.',
      },
      {
        q: 'How Do I Fix My Own High Fold-To-3-Bet Stat (>65%)?',
        a: 'Either Tighten Your Initial Opening Range From Early/Middle Position Or Defend More Hands By 4-Betting And Calling In Position.',
      },
    ],
  },
  {
    slug: 'four-bet-pct',
    code: '4-BET%',
    name: '4-Bet % & 4-Bet Range Percentage',
    shortTitle: '4-Bet % HUD Stat & GTO Target Guide',
    title: 'Poker 4 Bet Percentage HUD Stat Guide',
    h1: '4-Bet % & 4-Bet Range HUD Stat: Identifying AA/KK Nits Vs. Balanced Aggressors',
    formula: '4-Bet (%) = (Times Opener 4-Bet After Facing A 3-Bet / Total Times Faced A 3-Bet) x 100 | 4-Bet Range = PFR x 4-Bet%',
    gto6MaxTarget: '11.5% - 14.5% (2.4% - 3.1% Overall 4-Bet Range)',
    gtoFullRingTarget: '8.5% - 11.0% (1.4% - 2.0% Overall 4-Bet Range)',
    lowStakesPopulationAvg: '7.2% (1.3% Total 4-Bet Range: Almost Purely QQ+, AK)',
    highStakesPopulationAvg: '13.2% (2.8% Total 4-Bet Range)',
    sampleSizeRequired: '500 - 1,000 Hands',
    exploitLow:
      'Against Low 4-Bet Range (<1.5%): Fold Everything Except AA And KK When They 4-Bet You! A 1.3% 4-Bet Range Is Strictly AA, KK, And Partial AKs.',
    exploitHigh:
      'Against High 4-Bet Range (>3.5%): Defend Your 3-Bets By 5-Bet Jamming QQ+, AK And Flat-Calling In Position With AQs, JJ, TT, And Suited Ace Blockers.',
    ifThenBecause:
      'If Your HUD Shows An Opponent 4-Bet Range Below 1.6% -> Then Fold Pocket Queens And Ace-King Offsuit To Their 4-Bet -> Because A 1.5% Range (AA, KK, AKs) Holds 64% Equity Against QQ And 69% Against AKo.',
    calculatorHref: '/tools/3bet-calculator',
    faqs: [
      {
        q: 'What Is The Difference Between "4-Bet %" And "4-Bet Range" On A HUD?',
        a: '"4-Bet %" Is The Conditional Percentage Of Times A Player 4-Bets Given That They Opened And Got 3-Bet (e.g., 10%). "4-Bet Range" Multiplies Their PFR By Their 4-Bet % (20% PFR x 10% 4-Bet = 2.0% Of All Starting Hands).',
      },
      {
        q: 'Which Hands Make The Best 4-Bet Bluffs At 100BB Stack Depth?',
        a: 'Suited Wheel Aces (A5s, A4s) And Offsuit Broadway Blockers (AQo, AJo, KQo) Because The Ace And King Blockers Remove 50% Of Villain AA And KK 5-Bet Jam Combos.',
      },
      {
        q: 'What Is The Standard GTO 4-Bet Sizing At 100BB?',
        a: 'In Position, 2.2x To 2.3x The 3-Bet Size (e.g., 2.5BB Open -> 8BB 3-Bet -> 18BB 4-Bet). Out Of Position, 2.5x To 2.7x The 3-Bet Size (20BB To 22BB).',
      },
    ],
  },
  {
    slug: 'cbet-flop',
    code: 'CBET-FLOP',
    name: 'Flop Continuation Bet % (Flop C-Bet)',
    shortTitle: 'Flop C-Bet % HUD Stat & GTO Target Guide',
    title: 'Flop C Bet Percentage HUD Stat Guide',
    h1: 'Flop Continuation Bet (C-Bet %): GTO Texture Targets & Check-Raise Exploits',
    formula: 'Flop C-Bet (%) = (Times Preflop Aggressor Bet The Flop / Total Flop Opportunities As Preflop Aggressor) x 100',
    gto6MaxTarget: '58.0% - 66.0% Aggregate Across All 1,755 Flops (35% OOP / 72% IP)',
    gtoFullRingTarget: '52.0% - 60.0%',
    lowStakesPopulationAvg: '68.5% (Often Unbalanced 75%+ Auto-C-Betting Or <45% Fit-Or-Fold)',
    highStakesPopulationAvg: '62.4%',
    sampleSizeRequired: '120 - 200 Hands',
    exploitLow:
      'Against Low Flop C-Bet (<48% Fit-Or-Fold): Attack Their Flop Checks Immediately With Delayed Turn Stab Bets (66% Pot) And Fold Marginal Pairs When They Do Bet The Flop.',
    exploitHigh:
      'Against High Flop C-Bet (>74% Auto-C-Bettor): Check-Raise Dynamic And Low Flops Aggressively (20%+ Frequency) And Float Wider In Position To Steal The Turn When They Check-Give-Up.',
    ifThenBecause:
      'If An Opponent Flop C-Bet Exceeds 75% But Their Turn C-Bet Drops Below 42% ("One-And-Done" Profile) -> Then Float Their Flop C-Bet Wide In Position And Bet 66% Pot Whenever They Check The Turn -> Because They Are Auto-Betting Air On The Flop And Surrendering On The Turn.',
    calculatorHref: '/tools/board-texture-analyzer',
    faqs: [
      {
        q: 'Why Is Out-Of-Position Flop C-Bet % So Much Lower Than In-Position C-Bet %?',
        a: 'When The Early-Position Opener Is Called By The Button Or Cutoff (OOP), The Caller Holds A Condensed Strong Range With Positional Advantage, Forcing The OOP Raiser To Check 55% To 70% Of Flops.',
      },
      {
        q: 'How Does Board Texture Shift GTO Flop C-Bet Frequency?',
        a: 'On A-8-2 Rainbow, In-Position GTO C-Bet Frequency Exceeds 88% (At 33% Sizing). On 8-7-6 Two-Tone, GTO C-Bet Frequency Drops Below 35%.',
      },
      {
        q: 'Does Flop C-Bet Count Multiway Pots?',
        a: 'Yes, Standard HUD Flop C-Bet Aggregates Heads-Up And Multiway Pots Unless Filtered For Heads-Up Only.',
      },
    ],
  },
  {
    slug: 'fold-to-flop-cbet',
    code: 'FOLD-FLOP-CBET',
    name: 'Fold To Flop C-Bet % (Single-Raised & 3-Bet Pots)',
    shortTitle: 'Fold To Flop C-Bet % HUD Stat Guide',
    title: 'Fold To Flop C Bet HUD Stat Guide',
    h1: 'Fold To Flop C-Bet % HUD Stat: Minimum Defense Frequency Vs. Over-Folder Exploits',
    formula: 'Fold To Flop C-Bet (%) = (Times Player Folded Facing A Flop C-Bet / Total Times Faced A Flop C-Bet) x 100',
    gto6MaxTarget: '36.0% - 44.0% (Against 33% To 50% Pot Sizing)',
    gtoFullRingTarget: '40.0% - 48.0%',
    lowStakesPopulationAvg: '49.5% (Or 26% Among Loose Calling Stations)',
    highStakesPopulationAvg: '41.2%',
    sampleSizeRequired: '150 - 250 Hands',
    exploitLow:
      'Against Sticky Low Fold-To-Flop-C-Bet (<34%): Stop Range C-Betting Complete Air Without Backdoor Equity, Value-Bet Larger (75% Pot) With Top Pair+, And Barrel The Turn Relentlessly When Their Float Brick-Outs.',
    exploitHigh:
      'Against High Fold-To-Flop-C-Bet (>52%): Range C-Bet 100% Of Your Hands Using A Cheap 25% To 33% Pot Size Because A 33% Bet Needs Only 25% Folds To Print Instant Profit!',
    ifThenBecause:
      'If An Opponent Folds To Flop C-Bets Over 50% Of The Time -> Then Range C-Bet 100% Of Your Unpaired Air At 25% To 33% Pot -> Because You Risk 0.33 Pots To Win 1.00 Pot (25% Alpha Breakeven) Against A 50%+ Folder.',
    calculatorHref: '/tools/pot-odds-calculator',
    faqs: [
      {
        q: 'Why Is Folding 50% To A 33% Flop C-Bet A Massive Mathematical Disaster?',
        a: 'Against A 33% Pot Bet, Alpha = 0.33 / 1.33 = 25.0%. If You Fold 50% Of The Time (Double The Breakeven Threshold), The Aggressor Doubles Their Invested C-Bet Risk With Zero-Equity Air.',
      },
      {
        q: 'What Hands Should I Float To Keep My Fold-To-Flop-C-Bet Below 42%?',
        a: 'Defend All Pairs, All Front-Door Draws, Ace-High With A Backdoor Flush Draw, And Overcards With Backdoor Straight + Backdoor Flush Equity (Such As KJs On T-7-2 With One Spade).',
      },
      {
        q: 'Should I Check-Raise Or Call To Defend Against Small Flop C-Bets?',
        a: 'Mix Both: Call ~44% And Check-Raise ~14% To 18% From The Big Blind Against A 33% Button C-Bet.',
      },
    ],
  },
  {
    slug: 'cbet-turn',
    code: 'CBET-TURN',
    name: 'Turn Continuation Bet % (Double-Barrel Frequency)',
    shortTitle: 'Turn C-Bet % (Double-Barrel) HUD Guide',
    title: 'Turn C Bet Double Barrel HUD Stat Guide',
    h1: 'Turn Continuation Bet (Turn C-Bet %): Double-Barrel Polarity & Exploit Guide',
    formula: 'Turn C-Bet (%) = (Times Player Fired A Second Barrel On The Turn / Total Turn Opportunities After Flop C-Bet Called) x 100',
    gto6MaxTarget: '48.0% - 56.0%',
    gtoFullRingTarget: '44.0% - 52.0%',
    lowStakesPopulationAvg: '41.5% (Most Low-Stakes Players Are "One-And-Done" Flop C-Bettors)',
    highStakesPopulationAvg: '52.8%',
    sampleSizeRequired: '250 - 400 Hands',
    exploitLow:
      'Against Low Turn C-Bet (<42%): Float Their Flop C-Bets Wide And Attack Their Turn Checks; When They Actually Fire A Second Barrel On The Turn, Respect It As Top Pair Top Kicker Or Better.',
    exploitHigh:
      'Against High Turn C-Bet (>62% Barrel Maniac): Call Down With Resilient Top Pairs And Middle Pairs Or Check-Raise All-In On The Turn With High-Equity Combo Draws And Sets.',
    ifThenBecause:
      'If An Opponent Has A 72% Flop C-Bet But A 36% Turn C-Bet -> Then Float The Flop With Any Pair Or Backdoor Draw And Fold One-Pair Bluff-Catchers Only When They Fire The Turn -> Because They Filter Out All Their Air Between Flop And Turn.',
    calculatorHref: '/tools/geometric-bet-calculator',
    faqs: [
      {
        q: 'Which Turn Cards Should Be Double-Barrelled At The Highest Frequency In GTO?',
        a: 'Overcards To The Flop (Especially An Ace, King, Or Queen Landing On A Low/Middling Flop) That Improve The Preflop Raiser Range Advantage, Plus Cards That Give Your Air Equity (Flush-Draw Or Gutshot Turns).',
      },
      {
        q: 'Which Turn Cards Force The Preflop Raiser To Check Most Often?',
        a: 'When The Middle Or Bottom Flop Card Pairs (e.g., 7 On K-7-3) Or When An Obvious Low Straight Draw Completes (e.g., 5 On 8-7-6), Because The Big Blind Caller Holds More Trips And Straights.',
      },
      {
        q: 'What Is The Standard GTO Turn Double-Barrel Bet Size?',
        a: 'While Flops Often Use 33% Small Bets, The Turn Is The Street Of Polarization: Solvers Shift To 66%, 75%, Or 125% Overbet Sizings On The Turn.',
      },
    ],
  },
  {
    slug: 'wtsd',
    code: 'WTSD%',
    name: 'WTSD % (Went To Showdown Percentage)',
    shortTitle: 'WTSD % (Went To Showdown) HUD Guide',
    title: 'Poker WTSD Went To Showdown HUD Guide',
    h1: 'WTSD % (Went To Showdown): Identifying Calling Stations Vs. Over-Folders',
    formula: 'WTSD (%) = (Hands Where Player Reached Showdown / Total Hands Where Player Saw The Flop) x 100',
    gto6MaxTarget: '26.5% - 30.0%',
    gtoFullRingTarget: '24.5% - 28.0%',
    lowStakesPopulationAvg: '32.5% (Up To 42%+ Among Recreational Calling Stations)',
    highStakesPopulationAvg: '28.2%',
    sampleSizeRequired: '250 - 400 Hands',
    exploitLow:
      'Against Low WTSD (<24% Postflop Nit): Double- And Triple-Barrel Bluff Relentlessly Across Scare Cards Because They Fold Top Pair Weak Kicker And Second Pair Before Showdown.',
    exploitHigh:
      'Against High WTSD (>34% Calling Station): Stop Bluffing Missed Draws On The River And Value-Bet Thin With Large 75%-100% Sizing Across All Three Streets.',
    ifThenBecause:
      'If An Opponent WTSD Exceeds 35% Over 250+ Hands -> Then Reduce Your River Bluff Frequency Toward Zero And Expand Thin Value-Betting -> Because A 35%+ WTSD Player Calls Down With Bottom Pair And Ace-High.',
    calculatorHref: '/tools/poker-odds-calculator',
    faqs: [
      {
        q: 'Why Must WTSD Always Be Evaluated Together With W$SD (Won Money At Showdown)?',
        a: 'Because High WTSD (34%) Paired With Low W$SD (42%) Proves The Player Is A Loose Calling Station Reaching Showdown With Weak Trash. Conversely, Low WTSD (22%) Paired With High W$SD (62%) Proves They Are Over-Folding Medium Hands And Only Showing Down The Nuts.',
      },
      {
        q: 'What Is The Denominator Of WTSD?',
        a: 'Only Hands Where The Player Actually Saw A Flop! Preflop Folds And Uncontested Preflop Walks Are Excluded From The WTSD Calculation.',
      },
      {
        q: 'How Does VPIP Affect WTSD Interpretation?',
        a: 'A 50% VPIP Player Who Also Has A 35% WTSD Is Taking 17.5% Of All Dealt Hands To Showdown (Massive Calling Station). A 14% VPIP Nit With 32% WTSD Is Only Taking Strong Preflop Hands To Showdown.',
      },
    ],
  },
  {
    slug: 'wsd',
    code: 'W$SD%',
    name: 'W$SD % (Won Money At Showdown Percentage)',
    shortTitle: 'W$SD % (Won At Showdown) HUD Guide',
    title: 'Poker WSD Won At Showdown HUD Stat Guide',
    h1: 'W$SD % (Won Money At Showdown): Diagnosing Thin Value & Bluff-Catching Balance',
    formula: 'W$SD (%) = (Showdown Hands Where Player Won Part Or All Of The Pot / Total Showdowns Reached) x 100',
    gto6MaxTarget: '51.5% - 55.5%',
    gtoFullRingTarget: '51.0% - 55.0%',
    lowStakesPopulationAvg: '48.5% (Under 44% For Calling Stations; Over 61% For Nits)',
    highStakesPopulationAvg: '53.4%',
    sampleSizeRequired: '350 - 600 Hands',
    exploitLow:
      'Against Low W$SD (<47%): Value-Bet Relentlessly And Never Fold Top Pair To Their River Checks; They Are Reaching Showdown With Dominated Bluff-Catchers And Busted Draws.',
    exploitHigh:
      'Against High W$SD (>60%): Over-Fold Bluff-Catchers When They Bet The River And Attack Their Checked-Back Ranges Because They Only Go To Showdown With Near-Nutted Value.',
    ifThenBecause:
      'If Your Own W$SD Exceeds 60% Over 10,000+ Hands -> Then Start Firing Thin River Value Bets And Calling River Bets Lighter -> Because Winning 60%+ At Showdown Proves You Are Leaving Thin Value Unbet And Over-Folding Bluff-Catchers.',
    calculatorHref: '/tools/pot-odds-calculator',
    faqs: [
      {
        q: 'Why Isn\'t A 65% W$SD Better Than A 53% W$SD?',
        a: 'Because Reaching Showdown On A River Pot Odds Call Requires Only 25% To 33% Equity! If You Make Profitable River Bluff-Catches At 35% Equity And Fire Thin River Value Bets That Win 54% When Called, Your Optimal W$SD Naturally Sits Around 52% To 55%.',
      },
      {
        q: 'What Does W$SD < 45% Combined With High WWSF (>52%) Indicate?',
        a: 'It Identifies A Hyper-Aggressive Maniac Or Spewy LAG Who Reaches The River With Way Too Many Failed Triple-Barrel Bluffs That Get Called Down.',
      },
      {
        q: 'How Do Split Pots Count In W$SD?',
        a: 'Most Trackers (PokerTracker 4, Holdem Manager 3, Hand2Note) Count Any Showdown Where You Receive A Non-Zero Share Of The Pot As A Showdown Win (Or Weight Split Pots At 0.5).',
      },
    ],
  },
  {
    slug: 'wwsf',
    code: 'WWSF%',
    name: 'WWSF % (Won When Saw Flop Percentage)',
    shortTitle: 'WWSF % (Won When Saw Flop) HUD Guide',
    title: 'Poker WWSF Won When Saw Flop HUD Guide',
    h1: 'WWSF % (Won When Saw Flop): The Ultimate Postflop Aggression & Red-Line Metric',
    formula: 'WWSF (%) = (Flop-Seen Hands Won either Via Postflop Fold Or At Showdown / Total Hands Where Player Saw Flop) x 100',
    gto6MaxTarget: '46.5% - 50.5%',
    gtoFullRingTarget: '43.5% - 47.5%',
    lowStakesPopulationAvg: '42.0% (Passive Players Give Up Small Pots Too Easily)',
    highStakesPopulationAvg: '48.8% (Elite Crushers Average 49% - 53%)',
    sampleSizeRequired: '300 - 500 Hands',
    exploitLow:
      'Against Low WWSF (<43%): Bet Every Time They Check! A Player Winning Under 43% Of Flops Seen Only Fights For Pots When They Flop Top Pair Or Better.',
    exploitHigh:
      'Against High WWSF (>52% Red-Line Aggressor): Protect Your Checking Ranges With Traps, Call Down Lighter, And Re-Bluff Their Automatic Float Stabs.',
    ifThenBecause:
      'If An Opponent WWSF Is Above 52% -> Then Stop Giving Up Uncontested Medium Pots And Trap-Check Strong Top Pairs -> Because They Are Aggressively Stabbing Every Checked Pot To Drive Up Their Red Line.',
    calculatorHref: '/tools/board-texture-analyzer',
    faqs: [
      {
        q: 'Why Do High-Stakes Coaches Call WWSF The Most Revealing Postflop Stat?',
        a: 'Because In Texas Holdem Both Players Miss The Flop Over 60% Of The Time. A Player With 40% WWSF Surrenders Every Unpaired Pot, Whereas A Player With 49% WWSF Fights For Unclaimed Orphan Pots With C-Bets, Probes, And Floats.',
      },
      {
        q: 'How Does WWSF Connect To My Non-Showdown Winnings (Red Line)?',
        a: 'WWSF Directly Drives Your Red Line (Non-Showdown Winnings). Every 1.5% Increase In WWSF From Profitable Postflop Stabs And Check-Raises Shifts Your Red Line Upward By Roughly +2.0 BB/100.',
      },
      {
        q: 'What Is The Danger Of Artificially Forcing WWSF Above 54%?',
        a: 'Players Who Blindly Bluff Every Street To Force A 55% WWSF Suffer A Cratering Blue Line (Showdown Winnings) And Low W$SD (<45%) Because Opponents Start Trap-Calling Them.',
      },
    ],
  },
  {
    slug: 'aggression-factor',
    code: 'AF',
    name: 'Aggression Factor (AF) & Aggression Frequency (AFq %)',
    shortTitle: 'Aggression Factor (AF & AFq) HUD Guide',
    title: 'Poker Aggression Factor AF HUD Stat Guide',
    h1: 'Postflop Aggression Factor (AF) & Aggression Frequency (AFq %): Complete HUD Guide',
    formula: 'AF = (Total Postflop Bets + Postflop Raises) / Total Postflop Calls | AFq (%) = (Bets + Raises) / (Bets + Raises + Calls + Folds)',
    gto6MaxTarget: 'AF: 2.4 - 3.2 | AFq: 44% - 50%',
    gtoFullRingTarget: 'AF: 2.1 - 2.9 | AFq: 41% - 47%',
    lowStakesPopulationAvg: 'AF: 1.4 (Passive Calling Stations Sit At 0.6 - 1.1)',
    highStakesPopulationAvg: 'AF: 2.8 | AFq: 47.5%',
    sampleSizeRequired: '150 - 250 Hands',
    exploitLow:
      'Against Low AF (<1.3 Passive Caller): Treat Any Postflop Raise Or River Bet From Them As The Nuts (Two Pair+) And Fold One-Pair Bluff-Catchers Immediately.',
    exploitHigh:
      'Against High AF (>4.0 Or AFq >58%): Let Them Bluff Into Your Medium-Strong Showdown Hands By Checking To Induce Their Barrels.',
    ifThenBecause:
      'If An Opponent Has A Postflop Aggression Factor Below 1.1 And Suddenly Raises The Turn Or River -> Then Fold Top Pair And Overpairs Immediately -> Because A 1.0 AF Player Calls With Top Pair And Raises Strictly With Two Pair, Sets, Or Straights.',
    calculatorHref: '/tools/pot-odds-calculator',
    faqs: [
      {
        q: 'Why Do Modern HUDs Prefer Aggression Frequency (AFq %) Over Classic Aggression Factor (AF)?',
        a: 'Because Classic AF = (Bets + Raises) / Calls Ignores Folds! A Ultra-Tight Nit Who Bets 3 Times, Calls 1 Time, And Folds 40 Times Has An AF Of 3.0 (Looking Aggressive), Whereas Their AFq Is Only 3 / 44 = 6.8% (Revealing Their True Passivity).',
      },
      {
        q: 'How Should Aggression Frequency Change From Flop To Turn To River?',
        a: 'In GTO Equilibrium, Aggression Frequency Starts High On The Flop (50%-55%), Moderates On The Turn (42%-48%), And Drops To ~32%-38% On The River. In Low-Stakes Pools, River AFq Plummets Below 22% (Severe River Under-Bluffing!).',
      },
      {
        q: 'Does Checking Count In The AF Or AFq Formula?',
        a: 'No! Neither AF Nor AFq Includes Checks In The Denominator; Only Active Decisions Facing A Bet Or Choosing To Bet Are Counted.',
      },
    ],
  },
  {
    slug: 'steal-attempt-pct',
    code: 'STEAL%',
    name: 'Steal Attempt % (CO, BTN & SB Open-Raise Frequency)',
    shortTitle: 'Steal Attempt % (ATS) HUD Stat Guide',
    title: 'Poker Steal Attempt ATS HUD Stat Guide',
    h1: 'Attempt To Steal Blinds (Steal % / ATS): Cutoff, Button & Small Blind GTO Targets',
    formula: 'Steal (%) = (Times Player Open-Raised When Folded To In CO, BTN, Or SB / Total Unopened Late-Position Opportunities) x 100',
    gto6MaxTarget: '38.0% - 44.0% Aggregate (CO: 28%, BTN: 46%, SB: 42%)',
    gtoFullRingTarget: '35.0% - 41.0%',
    lowStakesPopulationAvg: '29.5% (Many Low-Stakes Players Under-Steal The Button At <32%)',
    highStakesPopulationAvg: '42.5%',
    sampleSizeRequired: '150 - 250 Hands',
    exploitLow:
      'Against Low Steal (<28%): Respect Their Button And Cutoff Opens As Legitimate Value Hands And Do Not Spew Light 3-Bet Resteals Out Of The Blinds.',
    exploitHigh:
      'Against High Steal (>52% Late-Position Thief): 3-Bet Resteal Aggressively From The Small Blind And Big Blind (14% To 18% Frequency) To Punish The Bottom 60% Of Their Wide Steal Range.',
    ifThenBecause:
      'If A Button Or Small Blind Player Has A Steal Attempt Stat Above 55% -> Then Widen Your Big Blind 3-Bet Resteal Range To 16%+ Using High-Card Blockers And Suited Connectors -> Because They Cannot Defend 55% Of Hands Against A 3.5x-4.0x Out-Of-Position 3-Bet.',
    calculatorHref: '/tools/preflop-ranges',
    faqs: [
      {
        q: 'What Are The Exact 100BB 6-Max GTO Opening Percentages For Cutoff, Button, And Small Blind?',
        a: 'In A Standard 5% Capped-Rake 100BB 6-Max Cash Game: Cutoff Opens ~27.5% Of Hands, Button Opens ~45.5% Of Hands, And Small Blind Opens ~41.5% Of Hands (Raise-Or-Fold).',
      },
      {
        q: 'How Much Should I Increase My Button Steal % When Both Blinds Are Tight Nits?',
        a: 'If Both The Small Blind And Big Blind Fold To Steals Over 70% Of The Time (Combined Fold Probability = 0.70 x 0.70 = 49%+ Against A 2.2x Min-Open), You Can Profitably Open 65% To 80% Of All Buttons.',
      },
      {
        q: 'Why Does Cutoff Steal % Need To Be Tighter Than Button Steal %?',
        a: 'When You Open From The Cutoff, Three Players Remain Behind You (Button, Small Blind, Big Blind), And The Button Can Profitably 3-Bet Or Cold-Call You In Position.',
      },
    ],
  },
  {
    slug: 'fold-bb-to-steal',
    code: 'FOLD-BB-STEAL',
    name: 'Fold Big Blind To Steal % (BB Defense Threshold)',
    shortTitle: 'Fold BB To Steal % HUD Stat Guide',
    title: 'Fold Big Blind To Steal HUD Stat Guide',
    h1: 'Fold Big Blind To Steal % HUD Stat: Pot-Odds Defense Math & Auto-Profit Exploits',
    formula: 'Fold BB To Steal (%) = (Times Big Blind Folded Facing An Uncalled CO, BTN, Or SB Open / Total Steal Opportunities Faced) x 100',
    gto6MaxTarget: '44.0% - 52.0% Aggregate (vs 2.2x-2.5x Open Size)',
    gtoFullRingTarget: '48.0% - 55.0%',
    lowStakesPopulationAvg: '61.5% (Widespread Over-Folding In Online Micro/Low Stakes)',
    highStakesPopulationAvg: '47.8%',
    sampleSizeRequired: '150 - 250 Hands',
    exploitLow:
      'Against Sticky Low Fold-BB-To-Steal (<36% Defends Any Two Suited): Tighten Your Trash Steals, Open 2.5x-3.0x With Your Linear Value Range, And Value-Bet Flops Relentlessly.',
    exploitHigh:
      'Against High Fold-BB-To-Steal (>62%): Min-Open 2.0x-2.2x With Nearly Any Two Playable Cards From The Button And Small Blind To Collect Automatic Uncontested Blinds.',
    ifThenBecause:
      'If The Big Blind Folds To Steals Over 62% Of The Time (And The Small Blind Folds 80%) -> Then Open 75%+ Of Buttons At 2.0x-2.2x Sizing -> Because Combined Blind Fold Rate (0.80 x 0.62 = 49.6%) Exceeds The 47.1% Alpha Breakeven Of A 2.0x Open.',
    calculatorHref: '/tools/pot-odds-calculator',
    faqs: [
      {
        q: 'What Is The Exact Alpha Breakeven Percentage For A 2.0x Or 2.5x Button Steal?',
        a: 'A 2.0x Button Open Risks 2.0BB To Win 1.5BB Dead Blinds: Alpha = 2.0 / 3.5 = 57.14% Combined Blind Folds Needed. In A Big Blind Ante Tournament (2.5BB Dead Money), A 2.0x Open Needs Only 2.0 / 4.5 = 44.44% Combined Folds!',
      },
      {
        q: 'How Much Of My Big Blind Defense Should Be 3-Betting vs Calling?',
        a: 'Against A 2.5x Button Open In 6-Max Cash, GTO Defends ~54% Total: Calling ~41% Of Hands And 3-Betting ~13% Of Hands.',
      },
      {
        q: 'Why Should I Fold More In The Big Blind Against A 3.0x Open Than A 2.0x Open?',
        a: 'Against A 2.0x Open You Risk 1.0BB To Win 3.5BB (28.6% Direct Equity). Against A 3.0x Open You Risk 2.0BB To Win 4.5BB (44.4% Direct Equity), Forcing You To Fold The Bottom 15% Of Marginal Offsuit And Gapper Hands.',
      },
    ],
  },
  {
    slug: 'check-raise-flop',
    code: 'XR-FLOP%',
    name: 'Flop Check-Raise % (Out-Of-Position Defense Aggression)',
    shortTitle: 'Flop Check-Raise % HUD Stat Guide',
    title: 'Flop Check Raise Percentage HUD Guide',
    h1: 'Flop Check-Raise % (XR %) HUD Stat: GTO Board Targets & Polarized Punishers',
    formula: 'Flop Check-Raise (%) = (Times Player Check-Raised The Flop / Total Times Player Checked And Faced A Flop Bet) x 100',
    gto6MaxTarget: '13.5% - 18.5% Aggregate (8% On A-K-7r Up To 26% On 7-6-5ss)',
    gtoFullRingTarget: '10.0% - 14.5%',
    lowStakesPopulationAvg: '6.8% (Severely Under-Bluffed: Mostly Sets And Two Pair)',
    highStakesPopulationAvg: '15.8%',
    sampleSizeRequired: '300 - 500 Hands',
    exploitLow:
      'Against Low Flop Check-Raise (<7%): Range C-Bet 33% With Impunity In Position, And Immediately Fold One-Pair Hands (Including Overpairs On Low Boards) When They Actually Check-Raise!',
    exploitHigh:
      'Against High Flop Check-Raise (>19% Aggressive Defender): Check Back Vulnerable Medium-Strength Pairs On The Flop To Deny Their Check-Raise, And 3-Bet/Call Down Lighter With Top Pair And Overpairs.',
    ifThenBecause:
      'If An Opponent Flop Check-Raise Stat Is Below 7% Over 300+ Hands -> Then Fold Top Pair Top Kicker When They Check-Raise A Dry Board -> Because A 6% Flop Check-Raise Range Consists Almost Exclusively Of Flopped Sets And Two Pair (Which Hold 82%+ Equity Against Top Pair).',
    calculatorHref: '/tools/board-texture-analyzer',
    faqs: [
      {
        q: 'Why Is The Population Average Flop Check-Raise (6.8%) Less Than Half Of The GTO Target (16%)?',
        a: 'Because Human Players Naturally Check-Raise Their Sets, Two Pairs, And Monster Combo Draws, But Fail To Include The Required Backdoor Flush/Straight Semibluffs (Like K5s Or 97s With A Backdoor Draw) Needed To Reach 16%.',
      },
      {
        q: 'How Does Bet Sizing Change Optimal Flop Check-Raise Frequency?',
        a: 'Against A Small 25%-33% Pot Flop C-Bet, The Out-Of-Position Defender Must Check-Raise At High Frequency (16%-24%). Against A Large Polarized 75% Flop C-Bet, Check-Raise Frequency Drops To 7%-10%.',
      },
      {
        q: 'Which Hands Should I Add To Increase My Own Flop Check-Raise From 7% To 15%?',
        a: 'Add Gutshots With Overcards, Bottom Pair With A Backdoor Nut Flush Draw, And Wheel Aces (A4s, A3s) With Backdoor StraightAnd Flush Potential.',
      },
    ],
  },
];

export function findHudStat(slug) {
  if (!slug) return null;
  const clean = String(slug).trim().toLowerCase();
  return HUD_STATS.find((s) => s.slug === clean || s.code.toLowerCase() === clean) || null;
}

export function renderHudStatsIndexMarkdown() {
  return [
    '# Poker HUD Stats & Population Tendencies Encyclopedia (15 Metrics & GTO Targets)',
    '',
    `Last Verified: ${HUD_STATS_AS_OF} | Zenodo DOI: ${HUD_STATS_DOI}`,
    `Canonical URL: ${HUD_STATS_URL}`,
    '',
    '## Master 15-Stat HUD Benchmark & Population Comparison Matrix',
    '',
    '| HUD Metric | GTO 6-Max Target | GTO Full-Ring Target | Low-Stakes Pop Avg | Sample Size |',
    '| :--- | :--- | :--- | :--- | :--- |',
    ...HUD_STATS.map(
      (s) =>
        `| [${s.name}](${HUD_STATS_URL}/${s.slug}) | ${s.gto6MaxTarget} | ${s.gtoFullRingTarget} | ${s.lowStakesPopulationAvg} | ${s.sampleSizeRequired} |`
    ),
    '',
  ].join('\n');
}

export function renderHudStatDetailMarkdown(slugOrObj) {
  const s = typeof slugOrObj === 'string' ? findHudStat(slugOrObj) : slugOrObj;
  if (!s) return '';
  const url = `${HUD_STATS_URL}/${s.slug}`;
  return [
    `# ${s.h1}`,
    '',
    `> Source: [${s.name} on Smarter.Poker](${url}) | DOI: https://doi.org/${HUD_STATS_DOI}`,
    '',
    '## Mathematical Formula & GTO Targets',
    `- **HUD Code**: \`${s.code}\``,
    `- **Exact Equation**: \`${s.formula}\``,
    `- **GTO 6-Max Target (100BB)**: ${s.gto6MaxTarget}`,
    `- **GTO Full-Ring Target (9-Max)**: ${s.gtoFullRingTarget}`,
    `- **Low-Stakes Population Average**: ${s.lowStakesPopulationAvg}`,
    `- **High-Stakes Regular Average**: ${s.highStakesPopulationAvg}`,
    `- **Sample Size For Convergence**: ${s.sampleSizeRequired}`,
    `- **Paired Interactive Solver**: [https://smarter.poker${s.calculatorHref}](https://smarter.poker${s.calculatorHref})`,
    '',
    '## Exploitative Counter-Strategies',
    `- **Exploiting Low ${s.code}**: ${s.exploitLow}`,
    `- **Exploiting High ${s.code}**: ${s.exploitHigh}`,
    '',
    '## Causal Decision Rule (If / Then / Because)',
    s.ifThenBecause,
    '',
    '## Frequently Asked Questions',
    ...(s.faqs || []).flatMap((f) => [`### ${f.q}`, f.a, '']),
  ].join('\n');
}
