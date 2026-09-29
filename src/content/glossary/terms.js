/**
 * THE POKER GLOSSARY: ONE SOURCE OF TRUTH (AEO section 3.4, 2026-09-22).
 *
 * Every glossary surface reads this module and nothing else:
 *   - /glossary, the indexable index, grouped by category
 *   - /glossary/<slug>, one server-rendered page per term
 *   - /hub/training/glossary, the interactive study tool (search, filters,
 *     saved terms), which canonicals to /glossary because it shows the same
 *     definitions
 *   - pages/sitemap.xml.js, which lists /glossary and every term page
 *
 * Until this module the 50 GTO terms lived inside the study tool's page
 * file as one-line fragments ("Continuation Bet - A Bet By The Preflop
 * Aggressor On The Flop."), and the club poker and live room vocabulary the
 * site is actually about (unions, agents, settlement, waitlists, must-move
 * tables) was not defined anywhere.
 *
 * The rules each entry follows, enforced by
 * __tests__/every-glossary-term-has-a-page.law.test.mjs:
 *   - slug: lowercase, unique, stable. It is the URL, so never rename one.
 *   - definition: 40 to 80 words, answer first (the first sentence says what
 *     the term is), Title Case (house rule), no em dashes, no ampersands.
 *   - related: slugs of other terms in this file, rendered as real links.
 *   - Accuracy: Smarter.Poker is play credit only. Club Chips have no cash
 *     value and Diamonds are a promotional rewards currency. Industry terms
 *     that involve real money are described neutrally, never as something
 *     the platform offers.
 *
 * Plain JS, no JSX and no imports, so a law test can import it under node.
 */

/** Display order of the categories, club and live room vocabulary first. */
export const GLOSSARY_CATEGORIES = ['Club Poker', 'Live Room', 'Basics', 'Preflop', 'Postflop', 'Math', 'Theory'];

/** One line per category, shown under its heading on /glossary. */
export const CATEGORY_INTROS = {
  'Club Poker': 'The Vocabulary Of Private Online Poker Clubs, Unions And Agents.',
  'Live Room': 'How A Live Poker Room Seats, Moves And Rewards Its Players.',
  Basics: 'The Mechanics Every Hand Of Hold\'em Is Built On.',
  Preflop: 'Opening, Re-Raising And Calling Before The Flop.',
  Postflop: 'Betting Lines And Board Reading After The Flop.',
  Math: 'The Numbers Behind Every Call, Bet And Fold.',
  Theory: 'Game Theory, Ranges And How Strategies Are Built.',
};

/**
 * Where a reader of each category can use the idea on Smarter.Poker. Every
 * label states only what the product's own pages and llms.txt already say;
 * nothing here claims a feature the product does not ship.
 */
export const CATEGORY_PRODUCTS = {
  'Club Poker': [
    { href: '/hub/club-arena', name: 'Poker Arena', text: 'Private Online Poker Clubs With Club Chips, Unions And Agent Tools.' },
  ],
  'Live Room': [
    { href: '/hub/commander', name: 'Club Commander', text: 'Live Poker Room Waitlists, Game Boards And Tournament Clocks.' },
    { href: '/hub/poker-near-me/lobby', name: 'Poker Near Me', text: 'Find A Live Poker Room And Its Games.' },
  ],
  Basics: [
    { href: '/hub/training', name: 'GTO Training', text: 'Scenario Based Poker Training, Free To Play.' },
  ],
  Preflop: [
    { href: '/hub/preflop-charts', name: 'Preflop Charts', text: 'Opening And Defending Ranges By Position.' },
    { href: '/hub/training', name: 'GTO Training', text: 'Scenario Based Poker Training, Free To Play.' },
  ],
  Postflop: [
    { href: '/hub/training', name: 'GTO Training', text: 'Scenario Based Poker Training, Free To Play.' },
  ],
  Math: [
    { href: '/hub/training', name: 'GTO Training', text: 'Scenario Based Poker Training, Free To Play.' },
  ],
  Theory: [
    { href: '/hub/training', name: 'GTO Training', text: 'Scenario Based Poker Training, Free To Play.' },
  ],
};

export const GLOSSARY_TERMS = [
  {
    slug: '3-bet',
    term: '3-Bet',
    category: 'Preflop',
    definition:
      'A 3-Bet Is The First Re-Raise Before The Flop, Made Over An Open Raise. The Blinds Count As The First Bet And The Open As The Second, Which Is Why The Re-Raise Is The Third. A 3-Bet Can Be Made For Value With Strong Hands Or As A Bluff With Hands That Block The Opener\'s Best Holdings.',
    related: ['4-bet', 'squeeze', 'cold-call', 'blocker'],
  },
  {
    slug: '4-bet',
    term: '4-Bet',
    category: 'Preflop',
    definition:
      'A 4-Bet Is A Re-Raise Over A 3-Bet Before The Flop. At Common Stack Depths A 4-Bet Commits A Large Share Of The Effective Stack, So Ranges Become Narrow And Polarized: Premium Pairs And Big Aces For Value, Plus A Few Suited Hands With Blockers As Bluffs. The Next Raise, A 5-Bet, Is Usually All In.',
    related: ['3-bet', 'polarized-range', 'effective-stack', 'blocker'],
  },
  {
    slug: 'cold-call',
    term: 'Cold Call',
    category: 'Preflop',
    definition:
      'A Cold Call Is A Call Of A Raise By A Player Who Has Put No Voluntary Chips Into The Pot Yet, Such As Flatting An Open From The Button. Cold Calling Invites A Squeeze From The Players Behind And Usually Means Playing Out Of Position Against A Stronger Range, So Solver Strategies Cold Call Far Less Than Most Players Do.',
    related: ['squeeze', '3-bet', 'in-position', 'rfi'],
  },
  {
    slug: 'isolation-raise',
    term: 'Isolation Raise',
    category: 'Preflop',
    definition:
      'An Isolation Raise Is A Raise Over One Or More Limpers, Sized To Push The Other Players Out So The Raiser Can Play Heads Up Against The Limper, Who Is Often The Weakest Player At The Table. The Usual Size Is The Standard Open Plus One Big Blind For Each Limper Already In The Pot.',
    related: ['rfi', 'in-position', 'range', 'blinds'],
  },
  {
    slug: 'rfi',
    term: 'RFI (Raise First In)',
    category: 'Preflop',
    definition:
      'RFI, Short For Raise First In, Is The First Voluntary Raise When Every Player Before You Has Folded. RFI Ranges Widen As The Position Gets Later: A Player Under The Gun Opens A Tight Range, While The Button Can Open Close To Half Of All Hands Because Only The Two Blinds Remain To Act Behind.',
    related: ['isolation-raise', '3-bet', 'dealer-button', 'range'],
  },
  {
    slug: 'squeeze',
    term: 'Squeeze',
    category: 'Preflop',
    definition:
      'A Squeeze Is A 3-Bet Made After One Player Has Opened And At Least One Other Player Has Called. It Works Because The Opener Must Worry About The Caller Behind, And The Caller Has Already Shown A Capped Range That Rarely Contains The Strongest Hands. Squeezes Are Usually Sized Larger Than A Normal 3-Bet.',
    related: ['3-bet', 'cold-call', 'fold-equity', 'range'],
  },
  {
    slug: 'backdoor-draw',
    term: 'Backdoor Draw',
    category: 'Postflop',
    definition:
      'A Backdoor Draw Is A Draw That Needs Both The Turn And The River To Complete, Such As Holding Two Hearts On A Flop With One Heart. It Is Worth Only A Few Percent Of Equity On Its Own, But It Adds Reasons To Bet Or Continue And Gives Bluffs Extra Ways To Improve On Later Streets.',
    related: ['outs', 'equity', 'semi-bluff', 'wet-board'],
  },
  {
    slug: 'barrel',
    term: 'Barrel',
    category: 'Postflop',
    definition:
      'A Barrel Is A Bet On A Later Street After Betting The Street Before. Betting The Flop And The Turn Is A Double Barrel, And Betting All Three Streets Is A Triple Barrel. Good Barrels Continue With Value Hands And With Bluffs That Picked Up Equity Or Blockers, While Giving Up With Hands That Did Neither.',
    related: ['c-bet', 'semi-bluff', 'polarized-range', 'blocker'],
  },
  {
    slug: 'board-texture',
    term: 'Board Texture',
    category: 'Postflop',
    definition:
      'Board Texture Describes How The Community Cards Interact. A Dry Board Such As K72 With Three Suits Offers Few Draws, A Wet Board Is Full Of Straight And Flush Possibilities, And A Monotone Board Shows Three Cards Of One Suit. Texture Decides Which Range It Favors, Which Is Why Bet Sizes And Frequencies Change From Flop To Flop.',
    related: ['wet-board', 'range-advantage', 'nut-advantage', 'c-bet'],
  },
  {
    slug: 'c-bet',
    term: 'C-Bet (Continuation Bet)',
    category: 'Postflop',
    definition:
      'A C-Bet, Or Continuation Bet, Is A Flop Bet By The Player Who Made The Last Raise Before The Flop. It Continues The Story The Raise Told. Solver Strategies C-Bet Small And Often On Boards That Favor The Raiser\'s Range And Bet Less, Or Check, On Boards That Connect Better With The Caller.',
    related: ['barrel', 'range-advantage', 'board-texture', 'probe-bet'],
  },
  {
    slug: 'donk-bet',
    term: 'Donk Bet',
    category: 'Postflop',
    definition:
      'A Donk Bet Is A Bet Made Out Of Position Into The Player Who Had The Betting Lead On The Previous Street, Before That Player Can Continue Their Aggression. It Is Usually A Mistake, But A Small Donk Bet Can Be Correct On Turns And Rivers That Improve The Caller\'s Range Far More Than The Aggressor\'s.',
    related: ['out-of-position', 'c-bet', 'probe-bet', 'range-advantage'],
  },
  {
    slug: 'overbet',
    term: 'Overbet',
    category: 'Postflop',
    definition:
      'An Overbet Is Any Bet Larger Than The Pot. It Is Strongest When The Bettor Holds A Clear Nut Advantage And A Polarized Range, Because The Opponent Then Holds Many Medium Hands That Cannot Call Comfortably. Overbets Are Most Common On Turns And Rivers, Where The Board Has Moved In The Bettor\'s Favor.',
    related: ['nut-advantage', 'polarized-range', 'value-bet', 'mdf'],
  },
  {
    slug: 'probe-bet',
    term: 'Probe Bet',
    category: 'Postflop',
    definition:
      'A Probe Bet Is A Bet From The Out Of Position Player On The Turn After The In Position Player Checked Back The Flop. The Check Back Weakens That Player\'s Range, Because Most Strong Hands Would Have Bet, So The Out Of Position Player Can Lead With Value Hands And Draws That Benefit From Building The Pot.',
    related: ['donk-bet', 'c-bet', 'out-of-position', 'range'],
  },
  {
    slug: 'semi-bluff',
    term: 'Semi-Bluff',
    category: 'Postflop',
    definition:
      'A Semi-Bluff Is A Bet Or Raise With A Hand That Is Probably Behind Now But Has Real Outs To Improve, Such As A Flush Draw Or An Open Ended Straight Draw. It Wins In Two Ways: The Opponent Folds Right Away, Or The Draw Completes. That Combination Makes Semi-Bluffs The Backbone Of Most Balanced Bluffing Ranges.',
    related: ['outs', 'fold-equity', 'equity', 'backdoor-draw'],
  },
  {
    slug: 'slow-play',
    term: 'Slow Play',
    category: 'Postflop',
    definition:
      'Slow Playing Means Checking Or Calling With A Very Strong Hand Instead Of Betting Or Raising, So The Opponent Stays In And Keeps Betting. It Works Best On Dry Boards Where Few Cards Can Hurt You And The Opponent Is Likely To Bluff. On Wet Boards And In Multiway Pots It Risks Giving Free Cards That Beat You.',
    related: ['trap', 'value-bet', 'board-texture', 'wet-board'],
  },
  {
    slug: 'thin-value-bet',
    term: 'Thin Value Bet',
    category: 'Postflop',
    definition:
      'A Thin Value Bet Is A Bet With A Hand That Is Only Slightly Ahead Of The Hands That Will Call, Such As Second Pair Against An Opponent Who Calls With Weaker Pairs. It Earns A Small Profit When Called By Worse And A Small Loss When Called By Better, So Accurate Reads Of The Calling Range Decide Whether It Is Right.',
    related: ['value-bet', 'range', 'expected-value', 'equity'],
  },
  {
    slug: 'trap',
    term: 'Trap',
    category: 'Postflop',
    definition:
      'A Trap Is A Line Designed To Induce Bets From An Opponent While Holding A Monster Hand, Usually By Check Calling Or Check Raising Rather Than Leading. It Differs From A Plain Slow Play In Its Aim: The Trapper Wants The Opponent To Bluff Or Bet Worse Hands Into Them, Then Collects The Extra Chips On A Later Street.',
    related: ['slow-play', 'value-bet', 'range', 'villain'],
  },
  {
    slug: 'value-bet',
    term: 'Value Bet',
    category: 'Postflop',
    definition:
      'A Value Bet Is A Bet Made Because Worse Hands Will Call It Often Enough To Show A Profit. The Test Is Simple: If The Opponent Calls, Are You Ahead Of Most Of The Hands They Call With? Value Bets Pay For Bluffs In A Balanced Strategy, And Missing Them Costs More Money Than Most Players Realize.',
    related: ['thin-value-bet', 'polarized-range', 'overbet', 'expected-value'],
  },
  {
    slug: 'wet-board',
    term: 'Wet Board',
    category: 'Postflop',
    definition:
      'A Wet Board Is A Flop Or Turn With Many Straight And Flush Possibilities, Such As J T 9 With Two Hearts. Equities Run Closer On Wet Boards, So Strong Hands Bet Larger To Charge Draws, And Ranges Change Sharply From Street To Street. The Opposite Is A Dry Board, Where Few Draws Exist And Small Bets Are Common.',
    related: ['board-texture', 'semi-bluff', 'outs', 'backdoor-draw'],
  },
  {
    slug: 'combo',
    term: 'Combo',
    category: 'Math',
    definition:
      'A Combo Is One Specific Way To Hold A Starting Hand, Counting Suits. Every Pocket Pair Has 6 Combos, Every Suited Hand Has 4 And Every Offsuit Hand Has 12, For 1,326 Starting Combos In Total. Counting Combos, And Removing Those Your Own Cards Block, Is How Players Estimate How Often An Opponent Holds A Given Hand.',
    related: ['blocker', 'range', 'equity', 'outs'],
  },
  {
    slug: 'expected-value',
    term: 'EV (Expected Value)',
    category: 'Math',
    definition:
      'Expected Value, Or EV, Is The Average Result Of A Decision If It Could Be Repeated Many Times. Each Possible Outcome Is Multiplied By Its Probability And The Results Are Added Together. A Positive EV Play Earns Over Time Even When It Loses On A Given Hand, Which Is Why Good Players Judge Decisions By EV Rather Than Results.',
    related: ['equity', 'pot-odds', 'variance', 'gto'],
  },
  {
    slug: 'equity',
    term: 'Equity',
    category: 'Math',
    definition:
      'Equity Is Your Share Of The Pot Based On How Often Your Hand Would Win If All Remaining Cards Were Dealt With No Further Betting. A Hand With 40 Percent Equity In A 100 Chip Pot Owns 40 Chips Of It On Average. Equity Against A Whole Range, Rather Than One Hand, Is What Drives Sound Decisions.',
    related: ['pot-odds', 'fold-equity', 'outs', 'expected-value'],
  },
  {
    slug: 'icm',
    term: 'ICM (Independent Chip Model)',
    category: 'Math',
    definition:
      'ICM, The Independent Chip Model, Converts Tournament Chip Stacks Into Shares Of The Remaining Prize Pool. Because Chips Lost Hurt More Than Chips Won Help Once Payouts Are Close, ICM Tells Players To Tighten Their Calling Ranges Near The Bubble And At Final Tables. It Is The Standard Tool For Tournament Deals And Late Stage Push And Fold Decisions.',
    related: ['expected-value', 'effective-stack', 'variance', 'chip-up'],
  },
  {
    slug: 'implied-odds',
    term: 'Implied Odds',
    category: 'Math',
    definition:
      'Implied Odds Are The Chips You Expect To Win On Later Streets When Your Draw Completes, Beyond What Is Already In The Pot. They Justify Calling With Hands Such As Small Pairs Or Suited Connectors When The Immediate Pot Odds Are Too Thin, Provided Stacks Are Deep And The Opponent Will Pay Off When You Hit.',
    related: ['pot-odds', 'reverse-implied-odds', 'outs', 'spr'],
  },
  {
    slug: 'mdf',
    term: 'MDF (Minimum Defense Frequency)',
    category: 'Math',
    definition:
      'Minimum Defense Frequency, Or MDF, Is The Share Of Your Range You Must Continue With So That An Opponent\'s Bluff Cannot Profit Automatically. It Equals The Pot Divided By The Pot Plus The Bet, So Facing A Pot Sized Bet You Defend At Least Half Your Range. It Is A Guideline, Not A Rule, Against Opponents Who Rarely Bluff.',
    related: ['pot-odds', 'under-defense', 'range', 'gto'],
  },
  {
    slug: 'outs',
    term: 'Outs',
    category: 'Math',
    definition:
      'Outs Are The Unseen Cards That Improve Your Hand To The Likely Winner. A Flush Draw Has Nine Outs And An Open Ended Straight Draw Has Eight. A Quick Estimate Of Your Chance To Hit Is Outs Times Four On The Flop, With Two Cards To Come, Or Outs Times Two On The Turn With One Card Left.',
    related: ['equity', 'pot-odds', 'semi-bluff', 'backdoor-draw'],
  },
  {
    slug: 'pot-odds',
    term: 'Pot Odds',
    category: 'Math',
    definition:
      'Pot Odds Compare The Size Of A Call With The Pot You Could Win. Divide The Call By The Total Pot After You Call To Find The Equity You Need: Calling 50 Into A Pot That Will Be 150 Needs 33 Percent. If Your Equity Is Higher Than That Break Even Point, The Call Makes Money Over Time.',
    related: ['equity', 'implied-odds', 'mdf', 'expected-value'],
  },
  {
    slug: 'reverse-implied-odds',
    term: 'Reverse Implied Odds',
    category: 'Math',
    definition:
      'Reverse Implied Odds Are The Chips You Expect To Lose On Later Streets When You Make Your Hand But An Opponent Has Made A Better One. Dominated Hands Such As Weak Aces And Low Flush Draws Carry Heavy Reverse Implied Odds, Because They Often Win Small Pots And Lose Big Ones, Which Makes Them Worse Than Their Raw Equity Suggests.',
    related: ['implied-odds', 'equity', 'pot-odds', 'value-bet'],
  },
  {
    slug: 'spr',
    term: 'SPR (Stack To Pot Ratio)',
    category: 'Math',
    definition:
      'SPR, The Stack To Pot Ratio, Is The Effective Stack Divided By The Pot At The Start Of A Street, Usually The Flop. A Low SPR, Below About Three, Means Top Pair Is Often Worth Getting All In. A High SPR, Above Ten, Rewards Hands That Can Make The Nuts And Punishes One Pair Hands That Overcommit.',
    related: ['effective-stack', 'implied-odds', 'value-bet', 'range'],
  },
  {
    slug: 'variance',
    term: 'Variance',
    category: 'Math',
    definition:
      'Variance Is The Spread Of Results Around A Player\'s Expected Value. High Variance Games Such As Tournaments And Pot Limit Omaha Produce Long Losing And Winning Stretches Even For Skilled Players. Understanding Variance Keeps Decisions Tied To Expected Value, And It Is Why A Large Sample Of Hands Is Needed Before Judging Any Strategy.',
    related: ['expected-value', 'tilt', 'icm', 'equity'],
  },
  {
    slug: 'vpip',
    term: 'VPIP',
    category: 'Math',
    definition:
      'VPIP, Short For Voluntarily Put Money In Pot, Is The Share Of Hands A Player Calls Or Raises Before The Flop. Posting A Blind Does Not Count, Only Voluntary Chips Do. A VPIP Near 20 To 25 Percent At A Full Ring Cash Table Is Typical Of A Solid Regular, While A VPIP Above 40 Percent Usually Marks A Loose Player.',
    related: ['rfi', 'range', 'exploitative-play', 'villain'],
  },
  {
    slug: 'blocker',
    term: 'Blocker',
    category: 'Theory',
    definition:
      'A Blocker Is A Card In Your Hand That Reduces The Number Of Combos Of A Particular Hand Your Opponent Can Hold. Holding The Ace Of Hearts On A Board With Three Hearts Means The Opponent Cannot Have The Nut Flush. Blockers Guide The Choice Of Which Hands To Bluff With And Which Marginal Hands Can Call.',
    related: ['combo', 'nut-advantage', '3-bet', 'range'],
  },
  {
    slug: 'exploitative-play',
    term: 'Exploitative Play',
    category: 'Theory',
    definition:
      'Exploitative Play Deliberately Departs From A Balanced Strategy To Win More Against A Specific Opponent\'s Mistakes, Such As Bluffing More Against A Player Who Folds Too Often. It Can Earn More Than Game Theory Optimal Play Against Weak Opponents, But It Opens You To Counter Exploitation If The Read Is Wrong Or The Opponent Adjusts.',
    related: ['gto', 'nodelocking', 'villain', 'under-defense'],
  },
  {
    slug: 'fold-equity',
    term: 'Fold Equity',
    category: 'Theory',
    definition:
      'Fold Equity Is The Extra Value A Bet Or Raise Gains From The Chance That The Opponent Folds. It Equals How Often They Fold Multiplied By The Pot You Win When They Do. Fold Equity Is Why A Semi-Bluff Can Be Profitable When Calling Cannot, And Why Short Stacks Lose Much Of Their Bluffing Power.',
    related: ['semi-bluff', 'equity', 'squeeze', 'expected-value'],
  },
  {
    slug: 'frequency',
    term: 'Frequency',
    category: 'Theory',
    definition:
      'Frequency Is How Often A Player Takes An Action In A Given Spot Across Their Whole Range, For Example Betting 65 Percent Of The Time On A Particular Flop. Solvers Express Strategy As Frequencies Rather Than Fixed Rules, And Matching Sensible Frequencies Is What Keeps A Player Hard To Read And Hard To Exploit.',
    related: ['mixed-strategy', 'gto', 'range', 'mdf'],
  },
  {
    slug: 'gto',
    term: 'GTO (Game Theory Optimal)',
    category: 'Theory',
    definition:
      'GTO, Or Game Theory Optimal, Describes A Strategy That Cannot Be Exploited, Because No Opposing Strategy Can Win Against It In The Long Run. In Poker It Approximates A Nash Equilibrium Computed By A Solver. Players Study GTO To Build A Sound Baseline, Then Adjust Away From It To Exploit The Specific Mistakes Of Real Opponents.',
    related: ['nash-equilibrium', 'exploitative-play', 'mixed-strategy', 'nodelocking'],
  },
  {
    slug: 'in-position',
    term: 'In Position (IP)',
    category: 'Theory',
    definition:
      'In Position, Or IP, Means Acting After Your Opponent On Every Postflop Street. The Player In Position Sees What The Opponent Does Before Deciding, Controls The Size Of The Pot And Can Take Free Cards. The Dealer Button Is Always In Position After The Flop, Which Is Why Late Positions Play More Hands Profitably.',
    related: ['out-of-position', 'dealer-button', 'probe-bet', 'rfi'],
  },
  {
    slug: 'linear-range',
    term: 'Linear Range',
    category: 'Theory',
    definition:
      'A Linear Range, Also Called A Merged Range, Is A Betting Range Built From The Strongest Hands Downward With No Gap, Such As Every Pair From Aces Down To A Middle Pair. It Suits Spots Where Many Worse Hands Will Call. The Contrast Is A Polarized Range, Which Skips The Middle And Bets Only Very Strong Hands And Bluffs.',
    related: ['polarized-range', 'range', 'value-bet', '3-bet'],
  },
  {
    slug: 'mixed-strategy',
    term: 'Mixed Strategy',
    category: 'Theory',
    definition:
      'A Mixed Strategy Plays The Same Hand In Different Ways At Set Frequencies, For Example Betting A Hand 60 Percent Of The Time And Checking It 40 Percent. Solvers Produce Mixed Strategies When Two Actions Have Nearly Equal Expected Value, And Mixing Keeps Each Line Balanced So An Opponent Cannot Read The Hand From The Action.',
    related: ['frequency', 'gto', 'nash-equilibrium', 'range'],
  },
  {
    slug: 'nash-equilibrium',
    term: 'Nash Equilibrium',
    category: 'Theory',
    definition:
      'A Nash Equilibrium Is A Set Of Strategies In Which No Player Can Gain By Changing Their Own Strategy While The Others Stay The Same. In Two Player Zero Sum Games Such As Heads Up Poker, An Equilibrium Strategy Is Unexploitable. Poker Solvers Approximate It Closely, And That Output Is What Players Call A GTO Strategy.',
    related: ['gto', 'mixed-strategy', 'exploitative-play', 'frequency'],
  },
  {
    slug: 'nodelocking',
    term: 'Nodelocking',
    category: 'Theory',
    definition:
      'Nodelocking Is A Solver Technique That Fixes One Player\'s Strategy At A Decision Point, For Example Forcing A Player To Bet Too Often, And Then Recomputes The Best Response For Everyone Else. It Shows How The Optimal Counter Strategy Changes Against A Real Tendency, Which Makes It The Bridge Between GTO Study And Exploitative Play.',
    related: ['gto', 'exploitative-play', 'frequency', 'range'],
  },
  {
    slug: 'nut-advantage',
    term: 'Nut Advantage',
    category: 'Theory',
    definition:
      'Nut Advantage Means One Player\'s Range Holds More Of The Strongest Possible Hands On The Current Board Than The Opponent\'s Range Does. It Is Different From Range Advantage, Which Compares Average Strength. A Player With A Nut Advantage Can Use Large Bets And Overbets, Because The Opponent Rarely Holds Hands Strong Enough To Punish Them.',
    related: ['range-advantage', 'overbet', 'polarized-range', 'board-texture'],
  },
  {
    slug: 'out-of-position',
    term: 'OOP (Out Of Position)',
    category: 'Theory',
    definition:
      'Out Of Position, Or OOP, Means Acting Before Your Opponent On Each Postflop Street. The Out Of Position Player Gives Information Away First And Has Less Control Over The Size Of The Pot, Which Lowers The Value Of Every Hand. The Blinds Play Most Pots Out Of Position, Which Is Why They Defend Tighter Than Their Price Suggests.',
    related: ['in-position', 'donk-bet', 'probe-bet', 'blinds'],
  },
  {
    slug: 'polarized-range',
    term: 'Polarized Range',
    category: 'Theory',
    definition:
      'A Polarized Range Is Made Of Very Strong Hands And Bluffs, With Few Medium Strength Hands In Between. Polarized Ranges Pair With Large Bets And Overbets, Because Strong Hands Want The Pot To Grow And Bluffs Need The Fold Equity. The Medium Hands That Are Left Out Are Checked, Where They Keep Their Showdown Value.',
    related: ['linear-range', 'overbet', 'nut-advantage', 'value-bet'],
  },
  {
    slug: 'range',
    term: 'Range',
    category: 'Theory',
    definition:
      'A Range Is The Full Set Of Hands A Player Could Hold In A Given Spot, Based On Their Position And Every Action So Far. Strong Players Think In Ranges Rather Than Single Hands, Because Opponents Act With Many Hands In The Same Way. Reading A Range Means Narrowing It Street By Street As New Actions Arrive.',
    related: ['range-advantage', 'combo', 'polarized-range', 'linear-range'],
  },
  {
    slug: 'range-advantage',
    term: 'Range Advantage',
    category: 'Theory',
    definition:
      'Range Advantage Means One Player\'s Whole Range Has More Equity On The Current Board Than The Opponent\'s Range. The Preflop Raiser Usually Has It On High Card Flops Such As A K 4. The Player With Range Advantage Can Bet Often With A Small Size, While The Other Player Defends More Carefully And Bets Rarely.',
    related: ['nut-advantage', 'c-bet', 'board-texture', 'range'],
  },
  {
    slug: 'sizing-tell',
    term: 'Sizing Tell',
    category: 'Theory',
    definition:
      'A Sizing Tell Is Information Leaked By The Size Of A Bet, Such As A Player Who Bets Small With Medium Hands And Large Only With The Nuts. Opponents Who Notice Can Fold And Raise Accurately Against Each Size. Balanced Strategies Prevent The Leak By Betting A Mix Of Strong Hands And Bluffs With Every Size They Use.',
    related: ['polarized-range', 'frequency', 'exploitative-play', 'value-bet'],
  },
  {
    slug: 'tilt',
    term: 'Tilt',
    category: 'Theory',
    definition:
      'Tilt Is An Emotional State In Which Frustration, Anger Or Overconfidence Leads A Player To Make Worse Decisions Than Usual, Such As Calling Too Wide After A Bad Beat. It Is One Of The Largest Leaks In Poker. Common Remedies Include Stop Loss Limits, Short Breaks And Reviewing Decisions Rather Than Results After A Session.',
    related: ['variance', 'bad-beat-jackpot', 'expected-value', 'exploitative-play'],
  },
  {
    slug: 'under-defense',
    term: 'Under-Defense',
    category: 'Theory',
    definition:
      'Under-Defense Is Folding Too Often When Facing Bets, Which Lets An Opponent Profit By Betting Any Two Cards. A Player Defending Well Below The Minimum Defense Frequency In Common Spots Is Easy To Exploit With Bluffs. The Fix Is To Continue With More Hands That Have Equity Or Blockers, Not To Call Everything.',
    related: ['mdf', 'exploitative-play', 'range', 'blocker'],
  },
  {
    slug: 'villain',
    term: 'Villain',
    category: 'Theory',
    definition:
      'Villain Is Poker Slang For The Opponent In A Hand Being Discussed, While Hero Is The Player Telling The Story. The Terms Are Neutral Labels, Not Insults, And Appear In Almost Every Hand History And Strategy Forum. A Hand Review Might Say Villain Opens From The Cutoff And Hero Defends From The Big Blind.',
    related: ['range', 'exploitative-play', 'vpip', 'tilt'],
  },
  {
    slug: 'blinds',
    term: 'Blinds',
    category: 'Basics',
    definition:
      'Blinds Are Forced Bets Posted Before The Cards Are Dealt By The Two Players To The Left Of The Button: The Small Blind And The Big Blind, Which Is Usually Twice As Large. Blinds Create A Pot Worth Fighting For On Every Hand. Stakes Are Named After Them, So A 1/2 Game Has A 1 Small Blind And A 2 Big Blind.',
    related: ['dealer-button', 'straddle', 'rfi', 'out-of-position'],
  },
  {
    slug: 'dealer-button',
    term: 'Dealer Button',
    category: 'Basics',
    definition:
      'The Dealer Button Is The Marker That Shows Which Player Acts Last In Each Betting Round After The Flop. It Moves One Seat To The Left After Every Hand, And The Blinds Are Posted By The Two Players To Its Left. The Button Is The Most Profitable Seat At The Table Because It Plays Every Postflop Street In Position.',
    related: ['blinds', 'in-position', 'rfi', 'straddle'],
  },
  {
    slug: 'effective-stack',
    term: 'Effective Stack',
    category: 'Basics',
    definition:
      'The Effective Stack Is The Smaller Of The Stacks Between Two Players In A Hand, Because Nobody Can Win Or Lose More Than That Amount From The Other. If One Player Has 300 Chips And The Other 80, The Effective Stack Is 80. Strategy Depends On Effective Stacks, Not The Size Of Either Player\'s Own Stack.',
    related: ['spr', '4-bet', 'icm', 'implied-odds'],
  },
  {
    slug: 'rake',
    term: 'Rake',
    category: 'Basics',
    definition:
      'Rake Is The Fee A Card Room Or Club Takes From Each Pot Or Tournament Entry To Pay For Running The Game, Usually A Percentage Of The Pot Up To A Cap. Rake Is The Main Way A Poker Operator Earns Revenue. In Play Credit Games, Rake Is Taken In Chips That Have No Cash Value.',
    related: ['rakeback', 'comp', 'blinds', 'club-agent'],
  },
  {
    slug: 'showdown',
    term: 'Showdown',
    category: 'Basics',
    definition:
      'Showdown Is The Moment After The Final Betting Round When The Remaining Players Reveal Their Cards And The Best Five Card Hand Wins The Pot. The Last Player To Bet Or Raise On The River Shows First. A Player Who Cannot Win May Muck, Meaning Fold The Hand Face Down, Without Showing It.',
    related: ['value-bet', 'equity', 'run-it-twice', 'bad-beat-jackpot'],
  },
  {
    slug: 'poker-union',
    term: 'Poker Union',
    category: 'Club Poker',
    definition:
      'A Poker Union Is An Alliance Of Private Online Poker Clubs That Share One Pool Of Tables, So Members Of Every Club In The Union Can Play Each Other And Games Run At More Stakes And Hours. A Union Sets Shared Rules And Fees. On Smarter.Poker Unions Use Club Chips, Which Are Play Credits With No Cash Value.',
    related: ['club-agent', 'settlement', 'club-id', 'club-chips-versus-diamonds'],
  },
  {
    slug: 'club-agent',
    term: 'Club Agent',
    category: 'Club Poker',
    definition:
      'A Club Agent Is A Person Who Recruits Players Into A Private Online Poker Club And Looks After Them There, Managing Their Chip Requests And Questions For The Club Owner. In The Wider Industry Agents Are Often Paid A Share Of The Rake Their Players Generate. On Smarter.Poker Agent Tools Manage Club Chips, Which Have No Cash Value.',
    related: ['poker-union', 'rakeback', 'settlement', 'club-id'],
  },
  {
    slug: 'rakeback',
    term: 'Rakeback',
    category: 'Club Poker',
    definition:
      'Rakeback Is A Rebate Of Part Of The Rake A Player Pays, Returned By The Room, Club Or Agent As A Loyalty Incentive, Often As A Fixed Percentage Each Week. It Lowers The Effective Cost Of Playing. On Smarter.Poker There Is No Real-Money Gambling, So Any Rebate Is In Club Chips Or Rewards With No Cash Value.',
    related: ['rake', 'club-agent', 'comp', 'settlement'],
  },
  {
    slug: 'club-chips-versus-diamonds',
    term: 'Club Chips Versus Diamonds',
    category: 'Club Poker',
    definition:
      'On Smarter.Poker, Club Chips And Diamonds Are Two Separate Currencies. Club Chips Are Play Credits A Club Issues For Its Own Tables, With No Cash Value. Diamonds Are A Promotional Rewards Currency Used Across The Platform, Including Diamond Arena Games. Neither Can Be Cashed Out, And There Is No Real-Money Gambling On The Platform.',
    related: ['settlement', 'poker-union', 'rakeback', 'club-agent'],
  },
  {
    slug: 'settlement',
    term: 'Settlement',
    category: 'Club Poker',
    definition:
      'Settlement Is The Periodic Reconciliation Of Chip Balances In A Club Or Union, Usually Weekly, When Wins, Losses, Rake Shares And Agent Balances Are Totaled And Zeroed For The New Period. Real-Money Clubs Settle In Cash Outside The App. On Smarter.Poker Settlement Only Reconciles Club Chips, Which Are Play Credits With No Cash Value.',
    related: ['poker-union', 'club-agent', 'club-chips-versus-diamonds', 'rakeback'],
  },
  {
    slug: 'club-id',
    term: 'Club ID',
    category: 'Club Poker',
    definition:
      'A Club ID Is The Unique Number Or Code That Identifies A Private Online Poker Club Inside A Poker App. Players Enter The Club ID To Find The Club And Request To Join, And The Owner Or An Agent Approves The Request. Sharing A Club ID Is How Private Clubs Invite New Members Without A Public Listing.',
    related: ['club-agent', 'poker-union', 'gps-and-ip-restriction', 'settlement'],
  },
  {
    slug: 'gps-and-ip-restriction',
    term: 'GPS And IP Restriction',
    category: 'Club Poker',
    definition:
      'GPS And IP Restriction Is A Table Security Setting That Blocks Players Who Are Physically Close Together, Or Who Share An Internet Address, From Sitting At The Same Table. It Targets Collusion, Where Friends In One Room Share Hole Cards Or Team Up Against Others. Club Owners Switch It On Per Table When Creating A Game.',
    related: ['club-id', 'poker-union', 'time-bank', 'insurance'],
  },
  {
    slug: 'insurance',
    term: 'Insurance',
    category: 'Club Poker',
    definition:
      'Insurance Is An Optional Side Bet Offered In Some Club Games When Players Are All In Before The River. The Player Ahead Can Pay A Premium To Be Paid Back If An Opponent\'s Out Lands, Which Reduces Variance On Big All In Pots. The Price Is Set From The Number Of Outs, And The House Keeps The Edge.',
    related: ['run-it-twice', 'outs', 'variance', 'equity'],
  },
  {
    slug: 'run-it-twice',
    term: 'Run It Twice',
    category: 'Club Poker',
    definition:
      'Run It Twice Is An Agreement Between All In Players To Deal The Remaining Board Cards Two Times And Split The Pot, With Half Going To The Winner Of Each Run. It Does Not Change Anyone\'s Expected Value, But It Reduces Variance, So A Big Pot Is Less Likely To Be Decided Entirely By One Card.',
    related: ['insurance', 'variance', 'equity', 'showdown'],
  },
  {
    slug: 'time-bank',
    term: 'Time Bank',
    category: 'Club Poker',
    definition:
      'A Time Bank Is A Reserve Of Extra Seconds An Online Player Can Draw On After The Normal Action Clock Runs Out, For A Difficult Decision. Once Used, The Extra Time Is Gone Until It Refills, Often After A Set Number Of Hands. Time Banks Keep Games Moving While Still Allowing Time To Think In Big Spots.',
    related: ['gps-and-ip-restriction', 'club-id', 'showdown', 'tilt'],
  },
  {
    slug: 'straddle',
    term: 'Straddle',
    category: 'Live Room',
    definition:
      'A Straddle Is An Optional Blind Bet, Usually Twice The Big Blind, Posted Before The Cards Are Dealt By The Player To The Left Of The Big Blind. It Doubles The Stakes For That Hand, And The Straddler Acts Last Before The Flop. Many Rooms And Clubs Also Allow Button Or Mississippi Straddles Under House Rules.',
    related: ['blinds', 'dealer-button', 'bomb-pot', 'effective-stack'],
  },
  {
    slug: 'bomb-pot',
    term: 'Bomb Pot',
    category: 'Live Room',
    definition:
      'A Bomb Pot Is A Special Hand In Which Every Player Puts An Agreed Amount Into The Pot Before The Deal And The Hand Skips Preflop Betting, Going Straight To The Flop. Bomb Pots Create Large Multiway Pots And Are Often Played With A Double Board, Where The Pot Is Split Between The Winners Of Each Board.',
    related: ['straddle', 'blinds', 'run-it-twice', 'wet-board'],
  },
  {
    slug: 'waitlist',
    term: 'Waitlist',
    category: 'Live Room',
    definition:
      'A Waitlist Is The Queue A Poker Room Keeps For Each Game, Such As 1/3 No Limit Hold\'em, So Players Are Seated In Order As Seats Open. Players Can Join For Several Games At Once And Are Called By Name When A Seat Is Ready. Remote Waitlists Let Players Join From A Phone Before Arriving At The Room.',
    related: ['must-move-table', 'table-balancing', 'comp', 'high-hand-promotion'],
  },
  {
    slug: 'must-move-table',
    term: 'Must-Move Table',
    category: 'Live Room',
    definition:
      'A Must-Move Table Is A Second Table Of The Same Game That Feeds A Main Table. Players Start At The Must-Move Table And Are Moved To The Main Game In Order As Seats Open There. It Keeps The Main Table Full, Protects It From Breaking, And Lets A Room Start A New Game While The Waitlist Is Still Long.',
    related: ['waitlist', 'table-balancing', 'comp', 'dealer-button'],
  },
  {
    slug: 'table-balancing',
    term: 'Table Balancing',
    category: 'Live Room',
    definition:
      'Table Balancing Is Moving Players Between Tables So Each Table In A Tournament Or Cash Game Stays Close To The Same Number Of Players. In Tournaments, The Tournament Director Moves A Player From The Fullest Table To The Shortest, Usually Into The Equivalent Position, And Breaks Tables As The Field Shrinks Toward The Final Table.',
    related: ['must-move-table', 'chip-up', 'waitlist', 'icm'],
  },
  {
    slug: 'chip-up',
    term: 'Chip-Up',
    category: 'Live Room',
    definition:
      'A Chip-Up, Also Called A Color Up, Is When A Tournament Removes Its Smallest Chip Denomination Once The Blinds No Longer Need It And Exchanges Those Chips For Larger Ones. Leftover Odd Chips Are Settled By A Chip Race, Dealing One Card Per Odd Chip, So A Player Can Never Be Eliminated By The Chip-Up Itself.',
    related: ['table-balancing', 'blinds', 'icm', 'effective-stack'],
  },
  {
    slug: 'comp',
    term: 'Comp',
    category: 'Live Room',
    definition:
      'A Comp, Short For Complimentary, Is A Reward A Poker Room Or Casino Gives Players For Time Played, Such As Food Credits Or Points Toward Merchandise. Comps Are Usually Earned Per Hour Of Live Play And Tracked On A Player Card. Each Venue Sets Its Own Earning Rate, Redemption Rules And Expiry Policy For Comps.',
    related: ['rake', 'rakeback', 'high-hand-promotion', 'waitlist'],
  },
  {
    slug: 'high-hand-promotion',
    term: 'High Hand Promotion',
    category: 'Live Room',
    definition:
      'A High Hand Promotion Pays A Bonus To The Player Who Makes The Best Qualifying Hand During A Set Period, Such As The Highest Hand Of Each Hour Where Quads Or Better Qualify. Many Rooms Require Both Hole Cards To Play And The Hand To Reach Showdown. The Prize Is Usually Funded From A Small Drop Taken From Each Pot.',
    related: ['bad-beat-jackpot', 'comp', 'rake', 'showdown'],
  },
  {
    slug: 'bad-beat-jackpot',
    term: 'Bad Beat Jackpot',
    category: 'Live Room',
    definition:
      'A Bad Beat Jackpot Is A Progressive Prize Paid When A Very Strong Hand, Such As Four Jacks Or Better, Loses At Showdown To An Even Stronger Hand. The Losing Player Usually Takes The Largest Share, With The Winner And The Rest Of The Table Splitting The Remainder. It Is Funded By A Small Drop Taken From Each Qualifying Pot.',
    related: ['high-hand-promotion', 'showdown', 'comp', 'tilt'],
  },
];

const BY_SLUG = new Map(GLOSSARY_TERMS.map((t) => [t.slug, t]));

/** The term for a slug, or null. */
export function getGlossaryTerm(slug) {
  return BY_SLUG.get(String(slug)) || null;
}

/** The related terms of a term, resolved, in the order they were listed. */
export function relatedGlossaryTerms(term) {
  return (term?.related || []).map((slug) => BY_SLUG.get(slug)).filter(Boolean);
}

/** [{ category, terms }] in display order, terms alphabetical within each. */
export function glossaryByCategory() {
  return GLOSSARY_CATEGORIES.map((category) => ({
    category,
    terms: GLOSSARY_TERMS.filter((t) => t.category === category).sort((a, b) => a.term.localeCompare(b.term)),
  })).filter((group) => group.terms.length > 0);
}

/** The path of a term page. The only place the URL shape is written. */
export function glossaryTermPath(slug) {
  return `/glossary/${slug}`;
}

export const GLOSSARY_PATH = '/glossary';
export const GLOSSARY_URL = 'https://smarter.poker/glossary';
export const GLOSSARY_SET_ID = `${GLOSSARY_URL}#glossary`;
