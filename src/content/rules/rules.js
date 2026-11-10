/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  OFFICIAL POKER RULES & FLOOR RULINGS ENCYCLOPEDIA (src/content/rules/rules.js)
 * ═══════════════════════════════════════════════════════════════════════════════
 * Authoritative source of truth for /rules and /rules/[slug].
 * Covers 30 official Robert's Rules of Poker (RROP) and Poker Tournament
 * Directors Association (TDA) floor rulings with common scenarios, calculators,
 * glossary links, and FAQ schemas.
 *
 * House style: Title Case, zero em dashes or en dashes.
 */

export const RULES_AS_OF = '2026-11-09';
export const RULES_BASE_PATH = '/rules';
export const RULES_URL = 'https://smarter.poker/rules';

export const RULE_CATEGORIES = [
  'Showdown & Pot Award',
  'Betting & Action',
  'Tournament TDA',
  'Cash Game Procedures',
  'Variant Specific',
];

export function rulePath(slug) {
  return `/rules/${slug}`;
}

const RULE_SLUG_ALIASES = {
  'showdown-order': 'showdown-order-who-shows-first',
  'who-shows-first': 'showdown-order-who-shows-first',
  'verbal-declarations': 'verbal-declarations-binding-action',
  'string-bet': 'string-bets-and-oversized-chip-rule',
  'string-bets': 'string-bets-and-oversized-chip-rule',
  'oversized-chip': 'string-bets-and-oversized-chip-rule',
  'odd-chip': 'odd-chip-rule-split-pots',
  'split-pot': 'odd-chip-rule-split-pots',
  'side-pot': 'side-pot-and-all-in-protection-rules',
  'side-pots': 'side-pot-and-all-in-protection-rules',
  'misdeal': 'misdeals-and-exposed-card-rules',
  'misdeals': 'misdeals-and-exposed-card-rules',
  'dead-hand': 'dead-hands-and-fouled-decks',
  'minimum-raise': 'minimum-raise-and-incomplete-all-in-reopen',
  'straddle': 'straddle-rules-utg-button-mississippi',
  'mississippi-straddle': 'straddle-rules-utg-button-mississippi',
  'big-blind-ante': 'big-blind-ante-vs-traditional-ante-rules',
  'bba': 'big-blind-ante-vs-traditional-ante-rules',
  'one-player-to-a-hand': 'one-player-to-a-hand-and-collusion-rules',
  'first-card-off-the-deck': 'first-card-off-the-deck-and-substantial-action',
  'chip-race': 'color-up-and-chip-race-rules',
  'color-up': 'color-up-and-chip-race-rules',
  'table-balancing': 'table-balancing-and-breaking-order',
  'hand-for-hand': 'hand-for-hand-bubble-play-rules',
  'shot-clock': 'shot-clock-and-time-bank-rules',
  'missed-blinds': 'missed-blinds-posting-and-buying-the-button',
  'buying-the-button': 'missed-blinds-posting-and-buying-the-button',
  'run-it-twice': 'run-it-twice-and-all-in-insurance-rules',
  'bomb-pot': 'bomb-pots-and-double-board-rules',
  'bomb-pots': 'bomb-pots-and-double-board-rules',
  'double-board': 'bomb-pots-and-double-board-rules',
  'kill-pot': 'kill-pots-and-half-kill-rules',
  'rabbit-hunting': 'rabbit-hunting-and-dealing-unused-cards',
  'out-of-turn': 'check-raising-and-out-of-turn-action',
  'table-stakes': 'chip-visibility-and-table-stakes-rules',
  'icm-chop': 'final-table-redraw-and-icm-chop-rules',
  'late-registration': 'late-registration-and-re-entry-rules',
  'mystery-bounty': 'bounty-and-mystery-bounty-token-rules',
  'pot-limit': 'pot-limit-maximum-bet-calculation-rules',
  'pot-limit-omaha': 'pot-limit-maximum-bet-calculation-rules',
  'texas-holdem': 'showdown-order-who-shows-first',
  'eight-or-better': 'hi-lo-eight-or-better-qualifier-rules',
  'short-deck': 'short-deck-six-plus-holdem-rules',
  'disputed-pots': 'disputed-pots-and-surveillance-review-rules',
};

export function getRuleBySlug(slug) {
  if (!slug) return null;
  const clean = String(slug).trim().toLowerCase();
  const target = RULE_SLUG_ALIASES[clean] || clean;
  return (
    POKER_RULES.find((r) => r.slug === target) ||
    POKER_RULES.find((r) => r.slug.includes(clean)) ||
    null
  );
}

export const POKER_RULES = [
  {
    slug: 'showdown-order-who-shows-first',
    title: 'Showdown Order: Who Shows First On The River',
    h1: 'Showdown Order: Who Shows First On The River In Live And Tournament Poker',
    category: 'Showdown & Pot Award',
    tdaRef: 'TDA Rule 16 & Rule 17 / RROP Section 3',
    summary:
      'At Showdown, The Last Aggressor On The Final Betting Street Must Table All Hole Cards First; If The Final Street Checks Around, Showdown Proceeds Clockwise Starting From The First Active Player Left Of The Dealer Button.',
    floorRuling:
      'Under Official Poker TDA Rule 16 (Face Up For All-Ins) And Rule 17 (Non-All-In Showdowns), When There Is Betting On The River Or Final Street, The Player Who Made The Last Aggressive Action (Bet Or Raise) Must Table Their Hand First. If There Was No Betting On The Final Street (Checked Down), The Player Who Would Act First In The Betting Round (Closest Left Of The Button In Flop Games, High Board In Stud, Low Board In Razz) Must Show First. In Any All-In Situation Where All Further Betting Action Is Closed, All Live Hands Must Immediately Be Tabled Face Up Before Any Additional Community Cards Are Dealt.',
    commonScenarios: [
      {
        situation: 'Player A Bets On The Turn, Player B Calls, And Both Players Check The River.',
        ruling: 'Because There Was Zero Betting Action On The River Street, The First Active Player To The Left Of The Dealer Button Must Show First Regardless Of Who Bet On The Turn.',
      },
      {
        situation: 'Player A Bets The River, Player B Raises, Player C Calls, And Player A Calls.',
        ruling: 'Player B Made The Final Aggressive Action On The River And Must Table Both Hole Cards First, Followed Clockwise By Player C And Then Player A.',
      },
      {
        situation: 'Two Players Are All-In On The Flop With No Side Action Remaining.',
        ruling: 'In Tournaments Under TDA Rule 16, Both Players Must Immediately Table Their Cards Face Up Before The Turn Card Is Burned And Dealt.',
      },
    ],
    relatedCalculators: [
      { href: '/tools/poker-odds-calculator', label: 'Multiway Poker Odds Calculator' },
      { href: '/tools/side-pot-calculator', label: 'Multi-Way Side Pot Calculator' },
    ],
    relatedTerms: ['showdown', 'dealer-button', 'in-position', 'out-of-position'],
    faqs: [
      {
        q: 'Who Shows First If The River Goes Check-Check?',
        a: 'When The River Checks Through With No Bet, The First Active Player Seated To The Immediate Left Of The Dealer Button (Starting With The Small Blind Seat) Must Table Their Hand First, Moving Clockwise Around The Table.',
      },
      {
        q: 'Can I Refuse To Show My Winning Hand Until My Opponent Shows?',
        a: 'If Your Opponent Was The Last Aggressor On The River, You Have The Right To Wait For Them To Table Their Cards Or Muck. However, Under TDA Rule 17, Any Player May Voluntarily Table Their Hand Immediately To Speed Up The Game.',
      },
    ],
  },
  {
    slug: 'verbal-declarations-binding-action',
    title: 'Verbal Declarations & Binding Action In Poker',
    h1: 'Verbal Declarations And Binding Action Rules In Live Poker',
    category: 'Betting & Action',
    tdaRef: 'TDA Rule 40 & Rule 42 / RROP Section 14',
    summary:
      'Verbal Declarations In Turn Are 100% Binding And Take Precedence Over Physical Chip Movements When A Clear Contradiction Occurs, Provided The Declaration Was Made In Turn.',
    floorRuling:
      'Under TDA Rule 40 (Methods Of Betting: Verbal And Chips), A Player May Act Either By Speaking An Action ("Call", "Raise", "All-In", "Fold", "Check") Or By Pushing Chips Across The Betting Line. When A Player Acts In Turn, Whichever Occurs First Defines The Action. If A Player Simultaneously Speaks A Clear Action And Moves Chips That Contradict That Statement, The Floor Enforces The Verbal Declaration first And Requires The Physical Chips To Be Adjusted To Match The Legal Stated Action.',
    commonScenarios: [
      {
        situation: 'A Player Announces "Call" In Turn While Accidentally Dropping Enough High-Denomination Chips To Equal A Full Raise.',
        ruling: 'The Verbal Statement "Call" Is Binding. The Dealer Returns The Excess Chips To The Player Stack And Enforces A Call Only.',
      },
      {
        situation: 'A Player Says "Raise" In Turn Without Stating An Amount And Then Pushes Out Only Enough Chips To Call.',
        ruling: 'Because "Raise" Was Declared Verbally In Turn, The Player Is Bound To Make At Least The Minimum Legal Raise For That Street.',
      },
      {
        situation: 'A Player Announces "Raise To 5,000" When The Current Bet Is already 4,000 And The Minimum Legal Raise Total Is 7,000.',
        ruling: 'Because The Verbal Intent To Raise Was Explicitly Stated, The Player Must Bring The Total Bet Up To The Minimum Legal Raise Of 7,000.',
      },
    ],
    relatedCalculators: [
      { href: '/tools/pot-odds-calculator', label: 'Pot Odds & MDF Calculator' },
      { href: '/tools/spr-calculator', label: 'SPR & Geometric Sizing Calculator' },
    ],
    relatedTerms: ['3-bet', '4-bet', 'value-bet', 'overbet'],
    faqs: [
      {
        q: 'Does Saying A Number Alone Count As A Raise Or Total Bet?',
        a: 'Stating A Single Number In Turn Always Refers To The Total Amount The Player Is Putting Into The Pot On The Current Street, Not The Additional Amount Added On Top Of The Previous Bet.',
      },
      {
        q: 'Are Conditional Statements Like "If You Bet I Will Raise" Binding?',
        a: 'No. Under TDA Rule 66, Conditional Statements About Future Action Are Non-Binding And Strongly Discouraged; Repeat Violations Can Incur A Tournament Penalty.',
      },
    ],
  },
  {
    slug: 'string-bets-and-oversized-chip-rule',
    title: 'String Bets & The Single Oversized Chip Rule',
    h1: 'String Bets And The Single Oversized Chip Rule Explained',
    category: 'Betting & Action',
    tdaRef: 'TDA Rule 41 & Rule 45 / RROP Section 14',
    summary:
      'Throwing A Single Oversized Chip Into The Pot Facing A Bet Without Saying "Raise" Is Always Ruled A Call; Moving Multiple Trips Of Chips Forward Without A Prior Verbal Declaration Is A Prohibited String Bet.',
    floorRuling:
      'Under TDA Rule 45 (Multiple Chip Betting) And Rule 46 (Previous Bet Chips Not Pulled In), A Player Raising With Chips Alone Must Push Out The Entire Raise Amount In One Continuous Forward Motion Or Verbally Announce "Raise" Before Crossing The Line. Reaching Back To The Stack For A Second Handful Of Chips Without Speaking First Is A String Bet, Restricting The Action To The First Motion Only. Under TDA Rule 44 (Oversized Chip Betting), Putting A Single Chip Into The Pot That Is Larger Than The Current Bet Without Verbally Declaring "Raise" Is Strictly A Call.',
    commonScenarios: [
      {
        situation: 'Facing A 300-Chip Bet, A Player Silently Tosses A Single 1,000-Value Chip Into The Pot.',
        ruling: 'Under The Single Oversized Chip Rule, Silent Placement Of One Chip Larger Than The Bet Is Strictly A Call Of 300.',
      },
      {
        situation: 'Facing A 500 Bet, A Player Places One 500 Chip Across The Line, Pauses, And Then Reaches Back To Grab Another 1,500 Chip.',
        ruling: 'This Is A String Bet. Because No Verbal Raise Was Announced Before The First Chip Landed, Only The Initial 500 Call Stands.',
      },
      {
        situation: 'Facing A 400 Bet, A Player Silently Drops Two 500 Chips (1,000 Total) Into The Pot With Nothing Pulled Back.',
        ruling: 'Under TDA Rule 45, Because Removing One 500 Chip Still Leaves 500 (Which Is Greater Than Or Equal To The 400 Call), Dropping Multiple Chips Constitutes A Valid Raise To 1,000.',
      },
    ],
    relatedCalculators: [
      { href: '/tools/pot-odds-calculator', label: 'Pot Odds & MDF Calculator' },
      { href: '/tools/side-pot-calculator', label: 'Multi-Way Side Pot Calculator' },
    ],
    relatedTerms: ['blinds', 'sizing-tell', 'value-bet', 'c-bet'],
    faqs: [
      {
        q: 'How Do I Avoid A String Bet Or Oversized Chip Ruling?',
        a: 'Always Announce The Word "Raise" Or State Your Exact Total Bet Verbally Before Touching Or Releasing Any Chips. A Clear Verbal Declaration Protects You From Both String Bet And Single-Chip Call Rulings.',
      },
      {
        q: 'What Happens If I Throw Out A Single Oversized Chip When Nobody Has Bet Yet?',
        a: 'If You Are First To Act Or Facing A Check, Silently Tossing A Single Oversized Chip Into The Pot Counts As A Bet Equal To The Full Denomination Of That Chip.',
      },
    ],
  },
  {
    slug: 'odd-chip-rule-split-pots',
    title: 'The Odd Chip Rule In Split & Multi-Board Pots',
    h1: 'The Odd Chip Rule In Split Pots, Hi-Lo Games, And Double-Board Bomb Pots',
    category: 'Showdown & Pot Award',
    tdaRef: 'TDA Rule 20 / RROP Section 3 Rule 10',
    summary:
      'When A Split Pot Cannot Be Divided Evenly Using The Smallest Denomination Chip In Play, The Indivisible Odd Chip Is Awarded By Game Type: Worst Position Left Of The Button In Flop Games, High Card By Suit In Stud, And High Hand In Hi-Lo.',
    floorRuling:
      'Under TDA Rule 20 (Awarding Odd Chips), Total Pots Are Broken Down To The Smallest Chip Denomination Currently In Play Before Splitting. When One Odd Chip Remains: (1) In Button/Community Card Games (Hold\'em, PLO), The Odd Chip Goes To The First Tied Player Clockwise From The Dealer Button (Small Blind Seat First); (2) In Stud Games, The Odd Chip Goes To The High Card By Suit (Spades, Hearts, Diamonds, Clubs) In The Players\' Best 5-Card Hands; (3) In Hi-Lo Split Games, The Odd Chip Always Goes To The High Half Of The Pot; (4) In Double-Board Pots, Each Board Is Treated As A Separate Half First, With Any Overall Odd Chip Going To The Top/First Board.',
    commonScenarios: [
      {
        situation: 'Two Hold\'em Players Split A 10,500 Pot Using 1,000-Minimum Chips After The 500s Were Colored Up, Wait - If 500s Are In Play, 10,500 Splits To 5,250 If 25s Exist, Or Leaves One 500 Odd Chip.',
        ruling: 'The Single Indivisible 500 Chip Is Awarded To The Tied Player Seated Closest To The Immediate Left Of The Dealer Button.',
      },
      {
        situation: 'In Omaha Hi-Lo (PLO8), The Total Pot Is 4,500 In A Game Where 500 Is The Smallest Denomination.',
        ruling: 'The High Hand Receives 2,500 And The Qualifying Low Hand Receives 2,000 Because The Odd Chip Between Halves Always Goes To The High Hand.',
      },
      {
        situation: 'In A Double-Board PLO Bomb Pot, The Total Pot Is 2,100 With 100-Value Chips As The Smallest Unit.',
        ruling: 'The Top Board Receives 1,100 And The Bottom Board Receives 1,000, Awarding The Odd Chip To The Primary Top Board.',
      },
    ],
    relatedCalculators: [
      { href: '/tools/side-pot-calculator', label: 'Multi-Way Side Pot Calculator' },
      { href: '/tools/poker-odds-calculator', label: 'Multiway Poker Odds Calculator' },
    ],
    relatedTerms: ['showdown', 'dealer-button', 'double-board-bomb-pot', 'chip-up'],
    faqs: [
      {
        q: 'Are Suit Rankings Ever Used To Award The Odd Chip In Texas Hold\'em?',
        a: 'No. In Texas Hold\'em And Pot-Limit Omaha, Suits Never Break Ties At Showdown And Never Award An Odd Chip; Position Relative To The Left Of The Button Always Decides The Odd Chip.',
      },
      {
        q: 'If There Is Both A Main Pot And A Side Pot, Are Odd Chips Calculated Separately?',
        a: 'No. Under TDA Rule 20, All Pots For Which The Same Set Of Tied Players Compete Are Combined First Before Breaking Down Denominations To Minimize The Number Of Odd Chips.',
      },
    ],
  },
  {
    slug: 'side-pot-and-all-in-protection-rules',
    title: 'Side Pot Construction & All-In Protection Rules',
    h1: 'Side Pot Construction, All-In Protection, And Uncalled Bet Return Rules',
    category: 'Showdown & Pot Award',
    tdaRef: 'TDA Rule 16, Rule 19 & Rule 49 / RROP Section 3',
    summary:
      'Under Table Stakes Rules, An All-In Player Can Only Win From Each Opponent An Amount Equal To Their Own Total Chip Commitment, With Excess Bets Segregated Into Sequential Side Pots.',
    floorRuling:
      'Under TDA Rule 19 And RROP Table Stakes Principles, A Player Cannot Be Bet Out Of A Pot Once They Commit Their Entire Stack On The Table. When One Or More Players Go All-In For Different Stack Sizes, The Dealer Pulls Equal Matching Slices From Every Active Player Into The Main Pot (Along With All Dead Blinds, Antes, And Folded Bets). Remaining Chips From Deeper Stacks Form Side Pot 1, Side Pot 2, And So Forth. At Showdown, The Dealer Always Resolves And Awards The Highest Exterior Side Pot First Before Working Down To The Main Pot.',
    commonScenarios: [
      {
        situation: 'Player A Is All-In For 2,000, Player B Is All-In For 6,000, And Player C Calls 6,000 With 300 In Dead Blinds.',
        ruling: 'The Main Pot Holds 6,300 (3 x 2,000 + 300 Dead) Contested By A, B, And C. Side Pot 1 Holds 8,000 (2 x 4,000) Contested Only By B And C.',
      },
      {
        situation: 'Player A Has The Best Hand Overall And Wins The Main Pot, While Player B Beats Player C.',
        ruling: 'Dealer Awards Side Pot 1 (8,000) To Player B First, Then Awards The Main Pot (6,300) To Player A.',
      },
      {
        situation: 'Player C Shoves 15,000 Over Player B\'s 6,000 All-In, And Nobody Else Calls.',
        ruling: 'The Uncalled 9,000 Overbet Is Immediately Returned To Player C Before Any Community Cards Are Run Out.',
      },
    ],
    relatedCalculators: [
      { href: '/tools/side-pot-calculator', label: 'Multi-Way Side Pot Calculator' },
      { href: '/tools/bounty-calculator', label: 'PKO & Mystery Bounty Calculator' },
    ],
    relatedTerms: ['effective-stack', 'showdown', 'all-in', 'equity'],
    faqs: [
      {
        q: 'Which Pot Does The Dealer Award First At Showdown?',
        a: 'The Dealer Always Awards The Last (Highest) Side Pot First And Works Backward Toward The Main Pot So That Eliminated Or Short-Stacked Players Keep Their Chips Separate From Exterior Pots.',
      },
      {
        q: 'Do Dead Blinds And Antes Go Into The Main Pot Or Side Pot?',
        a: 'All Dead Blinds, Big Blind Antes, And Folded Preflop Bets Always Stay In The Main Pot, Providing Maximum Leverage To The Shortest All-In Stack.',
      },
    ],
  },
  {
    slug: 'misdeals-and-exposed-card-rules',
    title: 'Misdeals, Boxed Cards & Flashed Card Rules',
    h1: 'Official Misdeal Rules, Exposed Initial Hole Cards, And Boxed Cards',
    category: 'Tournament TDA',
    tdaRef: 'TDA Rule 34, Rule 35 & Rule 36 / RROP Section 4',
    summary:
      'Exposing Either Of The First Two Cards Dealt (Small Blind Or Big Blind First Card) Or Exposing Two Total Cards During The Deal Causes An Immediate Misdeal; A Single Exposed Later Hole Card Is Replaced After The Deal.',
    floorRuling:
      'Under TDA Rule 35 (Misdeals), A Misdeal Is Called Immediately Provided Substantial Action Has Not Occurred When: (1) Either Of The First Two Cards Off The Deck (First Card To Small Blind Or Big Blind) Is Exposed By Dealer Error; (2) Two Or More Total Cards Are Exposed By The Dealer; (3) Cards Are Dealt To An Empty Seat Or Wrong Button Position; Or (4) A Player Receives The Wrong Number Of Cards. If Only One Card (Other Than The First Two) Is Exposed By The Dealer, Play Continues: The Player Keeps The Other Card, The Exposed Card Becomes The First Burn Card On The Flop, And The Player Receives The Top Card Off The Stub After All Other Players Have Their Hole Cards.',
    commonScenarios: [
      {
        situation: 'The Dealer Accidentally Flips Up The Very First Card Dealt To The Small Blind.',
        ruling: 'Immediate Misdeal Under TDA Rule 35. The Deck Is Collected, Reshuffled, And Re-Dealt From The Same Button Position.',
      },
      {
        situation: 'The Dealer Exposes The Second Hole Card Dealt To The Cutoff Seat.',
        ruling: 'No Misdeal. The Dealer Completes Dealing All Other Cards, Gives The Cutoff The Next Card Off The Top Of The Deck, And Places The Exposed Card Face Up On Top Of The Stub To Serve As The Flop Burn Card.',
      },
      {
        situation: 'A Face-Up Card (Boxed Card) Appears Naturally Facing Up Inside The Deck Stub During The Deal.',
        ruling: 'Under TDA Rule 34, A Boxed Card Is Treated As A Meaningless Scrap Of Paper (Dead Card) And Replaced Immediately With The Next Card Below It Without Stopping The Hand.',
      },
    ],
    relatedCalculators: [
      { href: '/tools/poker-odds-calculator', label: 'Multiway Poker Odds Calculator' },
      { href: '/tools/preflop-ranges', label: 'GTO Preflop Range Matrix' },
    ],
    relatedTerms: ['dealer-button', 'blinds', 'blocker', 'combo'],
    faqs: [
      {
        q: 'What Happens If A Player Exposes Their Own Hole Card During The Deal?',
        a: 'If A Player (Rather Than The Dealer) Exposes Their Own Card, The Player Has Zero Recourse, Must Play The Hand With That Card Exposed, And Cannot Request A Misdeal Or Replacement Card.',
      },
      {
        q: 'What Happens If The Dealer Prematurely Deals The Flop Before Preflop Action Finishes?',
        a: 'Under TDA Rule 39, The Burn Card Remains In Place, The Prematurely Exposed Flop Cards Are Shuffled Back Into The Remaining Deck Stub, Preflop Action Finishes, And A New 3-Card Flop Is Dealt Without Burning A Second Card.',
      },
    ],
  },
  {
    slug: 'dead-hands-and-fouled-decks',
    title: 'Dead Hands, Fouled Decks & Unprotected Hands',
    h1: 'Dead Hands, Unprotected Hole Cards, And Fouled Deck Rulings',
    category: 'Tournament TDA',
    tdaRef: 'TDA Rule 36, Rule 63 & Rule 65 / RROP Section 3',
    summary:
      'Players Are Strictly Responsible For Protecting Their Own Hole Cards; An Unprotected Hand Swept Into The Muck By The Dealer Or Contacted By A Discarded Hand Is Dead Unless Identifiable Beyond Doubt.',
    floorRuling:
      'Under TDA Rule 65 (Accidentally Killed / Fouled Hands), Players Must Protect Their Hole Cards At All Times Using A Chip, Card Protector, Or Their Hands. If The Dealer Kills An Unprotected Hand Or Another Player\'s Folded Cards Touch And Mix With An Unprotected Hand, The Player Has No Redress And Is Not Entitled To A Refund Of Committed Bets (Except Uncalled Bets). Under TDA Rule 36 (Fouled Decks), If A Deck Is Discovered To Have The Wrong Number Of Cards, Duplicate Cards, Or Different Back Designs, The Current Hand Is Voided Immediately And All Chips Are Returned To Their Starting Stacks For That Hand.',
    commonScenarios: [
      {
        situation: 'A Player In Seat 1 Leaves Their Hole Cards Unprotected Without A Chip On Top, And The Dealer Accidentally Sweeps Them Into The Muck.',
        ruling: 'The Hand Is Dead. If The Player Had Made A Raise That Had Not Yet Been Called, Only The Uncalled Portion Of The Raise Is Returned.',
      },
      {
        situation: 'During A Flop Bet, Two Players Realize Both Hold The Ace Of Spades Because Of A Defective Deck.',
        ruling: 'Fouled Deck Under TDA Rule 36. The Current Hand Is Declared Void And All Preflop And Flop Bets Are Reconstructed And Returned To Each Player.',
      },
      {
        situation: 'In Texas Hold\'em, A Player Looks Down On The Turn And Discovers They Were Dealt Three Hole Cards Instead Of Two.',
        ruling: 'The Player\'s Hand Is Declared Dead Immediately Because It Contains An Illegal Number Of Cards After Substantial Action Has Occurred.',
      },
    ],
    relatedCalculators: [
      { href: '/tools/side-pot-calculator', label: 'Multi-Way Side Pot Calculator' },
      { href: '/tools/poker-odds-calculator', label: 'Multiway Poker Odds Calculator' },
    ],
    relatedTerms: ['showdown', 'effective-stack', 'dealer-button', 'blinds'],
    faqs: [
      {
        q: 'Can The Floor Retrieve My Cards From The Muck If I Announce Both Exact Cards?',
        a: 'In Most Modern TDA Rooms, Once Cards Touch And Mix With The Muck Pile, The Hand Is Irretrievably Dead. Only If The Cards Lie Clearly Separate And Identifiable With 100% Certainty May A Floor Supervisor Rule Them Live.',
      },
      {
        q: 'Does Discovering A Fouled Deck Invalidate Previous Hands Already Completed?',
        a: 'No. Under Both TDA And RROP Rules, Discovering A Fouled Deck Only Voids The Hand Currently In Progress; All Prior Completed Hands And Pot Awards Stand Final.',
      },
    ],
  },
  {
    slug: 'minimum-raise-and-incomplete-all-in-reopen',
    title: 'Minimum Raise & Incomplete All-In Reopen Rules',
    h1: 'Minimum Raise Sizing And When An Incomplete All-In Reopens Betting Action',
    category: 'Betting & Action',
    tdaRef: 'TDA Rule 43 & Rule 47 / RROP Section 14',
    summary:
      'A Legal Minimum Raise Must Equal At Least The Size Of The Largest Previous Bet Or Raise Increment On The Current Street; An All-In Wager Of Less Than A Full Raise Does Not Reopen Betting For Players Who Have Already Acted.',
    floorRuling:
      'Under TDA Rule 43 (Raise Amounts) And Rule 47 (Re-Opening The Bet), In No-Limit And Pot-Limit Games The Minimum Raise Increment Is Equal To The Largest Prior Full Bet Or Raise Increment Of The Current Betting Round. If A Player Goes All-In For An Amount That Exceeds The Previous Bet By Less Than The Minimum Legal Raise Increment (An "Under-Raise" Or Incomplete All-In), Players Who Have Already Acted And Are Facing Less Than A Full Raise Increment May Only Call Or Fold; They May Not Re-Raise Unless Another Player Behind First Makes A Full Legal Raise Or Multiple Short All-Ins Accumulate To Equal A Full Raise Increment.',
    commonScenarios: [
      {
        situation: 'In A 100/200 Game, Player A Opens To 500 (A 300 Raise Increment). Player B Wants To Make A Minimum 3-Bet.',
        ruling: 'Because The Previous Raise Increment Was 300 (From 200 To 500), Player B Must Raise By At Least 300 More, Making The Minimum Legal 3-Bet Total 800.',
      },
      {
        situation: 'Player A Opens To 600 (In A 100/200 Game, 400 Increment). Player B Shoves All-In For 850 (Only A 250 Increase). Everyone Folds Back To Player A.',
        ruling: 'Because 250 Is Less Than The 400 Minimum Raise Increment, Betting Is NOT Reopened For Player A. Player A May Only Call The Extra 250 Or Fold.',
      },
      {
        situation: 'Player A Opens To 600 (400 Increment). Player B Shoves For 850 (+250), And Player C Behind Shoves For 1,050 (+200 More, Total +450 Over Player A).',
        ruling: 'Under TDA Rule 47B, Because The Combined Short All-Ins Total +450 (Which Exceeds The 400 Minimum Increment), Action IS Reopened For Player A To Re-Raise.',
      },
    ],
    relatedCalculators: [
      { href: '/tools/pot-odds-calculator', label: 'Pot Odds & MDF Calculator' },
      { href: '/tools/push-fold-calculator', label: 'Push/Fold Nash Calculator' },
    ],
    relatedTerms: ['3-bet', '4-bet', 'rfi', 'squeeze'],
    faqs: [
      {
        q: 'What Is The 50% Rule For Unclear Chip Raises?',
        a: 'Under TDA Rule 45B, If A Player Puts Out Multiple Chips Without Speaking And The Total Amount Includes At Least 50% Of The Minimum Raise Increment, The Player Is Required To Add Chips To Complete A Full Minimum Raise.',
      },
      {
        q: 'Can A Player Who Has Not Yet Acted On The Street Still Raise Over A Short All-In?',
        a: 'Yes. A Player Who Has Not Yet Acted Facing Both An Open And A Short All-In Has Full Betting Options: Fold, Call The Total Amount, Or Make A Full Raise (Adding At Least The Full Prior Raise Increment On Top Of The All-In Total).',
      },
    ],
  },
  {
    slug: 'straddle-rules-utg-button-mississippi',
    title: 'Live Poker Straddle Rules: UTG, Button & Mississippi',
    h1: 'Live Cash Game Straddle Rules: UTG Straddle, Button Straddle, And Mississippi Straddle',
    category: 'Cash Game Procedures',
    tdaRef: 'RROP Section 5 / Live Cardroom House Rules',
    summary:
      'A Straddle Is A Voluntary Blind Raise Posted Before Hole Cards Are Dealt (Typically 2x The Big Blind) That Purchases Last Action Preflop And Sets The Effective Third Blind For Minimum Raise Calculations.',
    floorRuling:
      'In Live Cash Games governed By Robert\'s Rules Of Poker, A Standard Under-The-Gun (UTG) Straddle Is Posted By The Player Immediately Left Of The Big Blind For 2x The Big Blind Before Any Cards Are Dealt. Preflop Action Begins With UTG+1, And The Straddler Acts Last After The Big Blind. In Rooms Allowing A Button Straddle Or Mississippi Straddle (Posted From Any Seat), Action Either Starts With The Small Blind (Giving The Button Absolute Last Action) Or Starts Left Of The Straddler Depending On Posted House Procedure. A Straddle Always Counts As The Third Blind, Meaning The Minimum Preflop Open Raise Is 2x The Straddle.',
    commonScenarios: [
      {
        situation: 'In A $2/$5 Cash Game, The UTG Player Posts A $10 Straddle Before The Deal.',
        ruling: 'Preflop Action Begins With UTG+1. The Minimum Legal Open Raise Is Now $20 (A $10 Increment Over The $10 Third Blind), And The UTG Straddler Acts Last Preflop.',
      },
      {
        situation: 'In A Game Allowing Re-Straddles (Double Straddle), UTG Posts $10 And UTG+1 Posts $20.',
        ruling: 'Preflop Action Starts At UTG+2, The Minimum Raise Is $40, And UTG+1 Has Final Preflop Option After UTG.',
      },
      {
        situation: 'Both The UTG Player And The Dealer Button Want To Post A Straddle On The Same Hand.',
        ruling: 'In Most Cardrooms, The Traditional UTG Straddle Takes Priority Over A Button Straddle Unless The Room Explicitly Enforces Button Priority.',
      },
    ],
    relatedCalculators: [
      { href: '/tools/spr-calculator', label: 'SPR & Geometric Sizing Calculator' },
      { href: '/tools/poker-winrate-calculator', label: 'Poker Winrate Calculator' },
    ],
    relatedTerms: ['straddle', 'blinds', 'effective-stack', 'rfi'],
    faqs: [
      {
        q: 'Are Straddles Allowed In Poker Tournaments?',
        a: 'No. Under Official Poker TDA Rules, Voluntary Straddles And Sleeper Bets Are Prohibited In All Sanctioned Tournament Play To Preserve Blind Equity Integrity.',
      },
      {
        q: 'How Does A Straddle Change The Effective Stack Depth Of A Cash Game?',
        a: 'A 2x Straddle Immediately Cuts Every Player\'s Effective Stack Depth In Half (Turning A 100BB Stack Into A 50-Straddle Stack) And Lowers Postflop Stack-To-Pot Ratios (SPR).',
      },
    ],
  },
  {
    slug: 'big-blind-ante-vs-traditional-ante-rules',
    title: 'Big Blind Ante (BBA) Placement & Short-Stack Ante Rules',
    h1: 'Big Blind Ante (BBA) Rules: Big Blind First Or Ante First When Short-Stacked?',
    category: 'Tournament TDA',
    tdaRef: 'TDA Rule 19 & Recommended Procedure RP-13',
    summary:
      'In Big Blind Ante (BBA) Tournaments, The Single Player In The Big Blind Posts Both The Big Blind And The Entire Table Ante; When All-In With Fewer Chips Than Both, The Big Blind Is Satisfied First under TDA Rules.',
    floorRuling:
      'Under Poker TDA Recommended Procedure RP-13 (Big Blind Ante), A Single Ante Equal To One Big Blind Is Posted Every Hand By The Player In The Big Blind Seat Instead Of Every Player Posting Individual Micro-Antes. The Ante Is Dead Money Placed Directly Into The Center Pot And Does Not Count Toward The Player\'s Preflop Call Amount. If The Player In The Big Blind Has Fewer Chips Than The Combined Big Blind Plus Ante, TDA Standard Procedure Applies The Player\'s Chips To The Live Big Blind First (So They Can Win A Full Multiplied Main Pot), With Only Any Excess Chips Above One Big Blind Going Into The Ante.',
    commonScenarios: [
      {
        situation: 'At 1,000/2,000 With A 2,000 Big Blind Ante, The Player In The Big Blind Has Exactly 1,500 Total Chips Remaining.',
        ruling: 'Under TDA Big Blind First Priority, All 1,500 Chips Are Posted As The Live Big Blind And Zero Chips Are Posted Toward The Ante. The Player Can Win Up To 1,500 From Each Caller.',
      },
      {
        situation: 'At 1,000/2,000 With A 2,000 BBA, The Player In The Big Blind Has 2,800 Total Chips Remaining.',
        ruling: '2,000 Chips Are Posted As The Full Live Big Blind And The Remaining 800 Chips Are Posted As A Partial Dead Ante.',
      },
      {
        situation: 'The Tournament Reaches 4-Handed Play At The Final Table With 50,000/100,000 Blinds.',
        ruling: 'The Big Blind Ante Remains Equal To One Full Big Blind (100,000) Unless The Tournament Structure Sheet Explicitly Reduces The Ante To A Small Blind Ante Short-Handed.',
      },
    ],
    relatedCalculators: [
      { href: '/tools/blind-structure-calculator', label: 'Tournament Blind Structure Generator' },
      { href: '/tools/push-fold-calculator', label: 'Push/Fold Nash Calculator' },
    ],
    relatedTerms: ['blinds', 'side-pot', 'icm', 'effective-stack'],
    faqs: [
      {
        q: 'Does The Big Blind Ante Count Toward Calling A Raise?',
        a: 'No. The Big Blind Ante Is Dead Money In The Center Pot. If The Blinds Are 1,000/2,000 With A 2,000 BBA And Someone Raises To 5,000, The Big Blind Must Call An Additional 3,000.',
      },
      {
        q: 'Why Do Modern Tournaments Use The Big Blind Ante Instead Of Traditional Antes?',
        a: 'BBA Eliminates Dealer Change-Making Delays Every Hand, Speeds Up Tournament Hands Per Hour By 15% To 20%, And Allows Earlier Color-Up Removal Of Small Chip Denominations.',
      },
    ],
  },
  {
    slug: 'one-player-to-a-hand-and-collusion-rules',
    title: 'One Player To A Hand & Show One Show All Rules',
    h1: 'One Player To A Hand, Collusion Prevention, And Show-One-Show-All Rules',
    category: 'Tournament TDA',
    tdaRef: 'TDA Rule 68, Rule 69 & Rule 70 / RROP Section 15',
    summary:
      'Players Must Play Every Hand Independently Without Outside Advice, May Never Reveal Live Or Folded Hole Cards While Action Remains Pending, And Showing Cards To One Player Requires Showing The Entire Table.',
    floorRuling:
      'Under TDA Rule 68 (One Player To A Hand) And Rule 69 (No Disclosure), Players May Not Consult Spectators, Charts, Solvers, Or Other Players During A Hand. No Player May Expose Hole Cards, Discuss Strategy, Or Speculate On Possible Hands While Any Live Multiway Or Heads-Up Action Is Pending, Particularly In Tournaments Where ICM And Elimination Equity Affect All Other Entrants. Under The Show-One-Show-All Rule, If A Player Intentionally Or Accidentally Shows Their Cards To Any Single Player At The Table At The Conclusion Of A Hand, Any Other Player May Demand That The Dealer Table Those Cards Face Up For The Entire Table.',
    commonScenarios: [
      {
        situation: 'In A 3-Way Pot, Player A Folds On The Flop And Immediately Shows Their Folded Pocket Fours To Their Neighbor While Players B And C Are Still Betting.',
        ruling: 'Severe Violation Of TDA Rule 69. The Dealer Holds The Exposed Folded Cards Aside, Reveals Them To All Players Once The Hand Concludes, And The Floor Issues A Penalty To Player A.',
      },
      {
        situation: 'In A Tournament Heads-Up Pot, Player A Bets The River And Shows Their Hand To Player B To Induce A Reaction.',
        ruling: 'Under TDA Rule 68, Exposing Live Hole Cards During A Pending Tournament Hand Is Prohibited To Prevent Chip Dumping And Soft Play; The Hand Remains Live, But The Player Receives A Floor Penalty After The Hand.',
      },
      {
        situation: 'A Player Looks At A Preflop Chart On Their Smartphone While Holding Live Hole Cards.',
        ruling: 'Electronic Assistance Or Solver Reference During A Live Hand Violates One-Player-To-A-Hand And Electronic Device Rules, Resulting In Immediate Hand Forfeiture Or Disqualification.',
      },
    ],
    relatedCalculators: [
      { href: '/tools/icm-calculator', label: 'Tournament ICM Calculator' },
      { href: '/tools/preflop-ranges', label: 'GTO Preflop Range Matrix' },
    ],
    relatedTerms: ['icm', 'blocker', 'showdown', 'gto'],
    faqs: [
      {
        q: 'Can I Show My Cards To My Opponent In A Cash Game Heads-Up Pot?',
        a: 'Many Live Cash Rooms Allow A Player Closing The Action In A Strictly Heads-Up Cash Pot To Expose Their Cards Before Calling Or Folding, Provided No Third Player Remains In The Hand. In Tournaments, However, Exposing Live Cards Is Strictly Penalized.',
      },
      {
        q: 'What Is Soft Playing And Why Is It Penalized In Tournaments?',
        a: 'Soft Playing Occurs When Friends Or Staking Partners Refuse To Bet Value Hands Or Check Down Strong Holdings Against Each Other. In Tournaments, Soft Play Colludes Against The Rest Of The Field\'s ICM Equity And Carries Penalties Up To Disqualification.',
      },
    ],
  },
  {
    slug: 'first-card-off-the-deck-and-substantial-action',
    title: 'Substantial Action & The TDA First-Card Rule',
    h1: 'TDA Substantial Action Definition And The First-Card-Off-The-Deck Rule',
    category: 'Tournament TDA',
    tdaRef: 'TDA Rule 32 & Rule 36 / RROP Section 4',
    summary:
      'A Hand Officially Begins When The First Riffle Of The Shuffle Starts Or The First Card Leaves The Deck; Once Substantial Action Occurs (2 Actions With Chips Or 3 Total Actions), A Misdeal Cannot Be Called.',
    floorRuling:
      'Under TDA Rule 36 (Substantial Action), Substantial Action Has Occurred When Either: (A) Any Two Actions In Turn Occur, At Least One Of Which Puts Chips Into The Pot (Bet, Call, Or Raise); Or (B) Any Combination Of Three Actions In Turn Occurs (Check, Bet, Raise, Call, Or Fold). Once Substantial Action Has Occurred On The Preflop Street, A Misdeal Cannot Be Declared For Wrong Button Position Or Deal Irregularities, And The Hand Must Be Played To Completion Unless The Deck Itself Is Fouled. Under TDA Rule 32, A Player Must Be At Their Seat When The Final Card Is Dealt To The Button To Have A Live Hand.',
    commonScenarios: [
      {
        situation: 'UTG Folds And UTG+1 Calls The Big Blind Before Anyone Notices The Dealer Button Was Not Moved From The Previous Hand.',
        ruling: 'Because Two Actions Occurred And One Put Chips Into The Pot (Fold + Call), Substantial Action Has Occurred. The Hand Plays Out As Dealt, And The Button Stays In The Same Spot For The Next Hand To Correct Position.',
      },
      {
        situation: 'UTG Folds And UTG+1 Folds Before A Player Notices Seat 5 Was Accidentally Skipped In The Deal.',
        ruling: 'Only Two Folds Have Occurred (Zero Chips Put In And Fewer Than Three Total Actions). Substantial Action Has NOT Occurred, So The Floor Calls A Misdeal And Re-Deals.',
      },
      {
        situation: 'A Player Walking Back From Break Is 6 Feet Away From Their Chair When The Dealer Pitching The Final Card To The Button Releases The Card.',
        ruling: 'Under TDA Rule 32 (At Your Seat), Because The Player Was Not Physically At Their Seat When The Last Hole Card Was Dealt, Their Hand Is Immediately Mucked Dead By The Dealer.',
      },
    ],
    relatedCalculators: [
      { href: '/tools/blind-structure-calculator', label: 'Tournament Blind Structure Generator' },
      { href: '/tools/push-fold-calculator', label: 'Push/Fold Nash Calculator' },
    ],
    relatedTerms: ['dealer-button', 'blinds', 'time-bank', 'table-balancing'],
    faqs: [
      {
        q: 'Does Posting The Small Blind And Big Blind Count Toward Substantial Action?',
        a: 'No. Forced Blinds And Antes Posted Before The Deal Never Count Toward The Two-Action Or Three-Action Threshold For Substantial Action.',
      },
      {
        q: 'What Counts As Being "At Your Seat" Under TDA Rule 32?',
        a: 'A Player Must Be Within Reach Of Their Chair (Able To Touch Their Chair Or Table Spot) Without Delaying The Game When The Dealer Deals The Final Card To The Button.',
      },
    ],
  },
  {
    slug: 'color-up-and-chip-race-rules',
    title: 'Tournament Chip Race & Color-Up Procedures',
    h1: 'Tournament Chip Race And Color-Up Rules: Maximum 1 Chip & Elimination Protection',
    category: 'Tournament TDA',
    tdaRef: 'TDA Rule 23 / RROP Tournament Rule 15',
    summary:
      'When Small-Denomination Chips Are Removed During A Color-Up Break, Odd Remainder Chips Are Raced Off Using One Face-Up Card Per Odd Chip Starting At Seat 1; A PlayerCan Win At Most One Chip And Can Never Be Raced Out Of The Tournament.',
    floorRuling:
      'Under TDA Rule 23 (Coloring Up), Players First Exchange Full Multiples Of The Expired Denomination For Larger Chips. Any Remaining Odd Chips Are Raced Off: Starting In Seat 1, Each Player Receives One Face-Up Card Per Odd Chip They Hold. If Four Total Chips Of The New Denomination Are Available To Distribute Among The Odd Remainders, The Four Highest Cards By Rank And Suit (Spades High, Then Hearts, Diamonds, Clubs) Each Win One Chip. A Player May Win A Maximum Of One Replacement Chip No Matter How Many Cards They Receive, And A Player Who Loses Their Very Last Tournament Chips In A Chip Race Automatically Receives One Chip Of The New Denomination.',
    commonScenarios: [
      {
        situation: 'During A 100-To-500 Chip Race, Seat 3 Has Four 100-Value Chips And Receives The Ace Of Spades And King Of Spades (The Two Highest Cards At The Table).',
        ruling: 'Under The One-Chip Maximum Rule, Seat 3 Wins Exactly One 500-Value Chip From The Ace Of Spades, And The Next Chip Goes To The Highest Card Held By A Different Player.',
      },
      {
        situation: 'Seat 5 And Seat 8 Both Receive A Queen During The Chip Race: Seat 5 Has The Queen Of Hearts And Seat 8 Has The Queen Of Diamonds.',
        ruling: 'Because Hearts Outrank Diamonds In Standard Bridge Suit Order (Spades > Hearts > Diamonds > Clubs), Seat 5\'s Queen Of Hearts Beats Seat 8\'s Queen Of Diamonds.',
      },
      {
        situation: 'A Short-Stacked Player Has Only Three 100-Value Chips Left In Their Entire Stack And Loses The Race For A 500 Chip.',
        ruling: 'Because A Player Cannot Be Eliminated By A Chip Race Under TDA Rule 23, The Tournament Floor Awards That Player One Free 500-Value Chip.',
      },
    ],
    relatedCalculators: [
      { href: '/tools/blind-structure-calculator', label: 'Tournament Blind Structure Generator' },
      { href: '/tools/icm-calculator', label: 'Tournament ICM Calculator' },
    ],
    relatedTerms: ['chip-up', 'blinds', 'effective-stack', 'icm'],
    faqs: [
      {
        q: 'What Is The Official Suit Order Used During A Tournament Chip Race?',
        a: 'Tournament Chip Races And High-Card Draws For The Button Use Alphabetical Bridge Order From Highest To Lowest: Spades (Highest), Hearts, Diamonds, And Clubs (Lowest).',
      },
      {
        q: 'Can I Hide Small Denomination Chips During A Color-Up To Avoid Racing?',
        a: 'No. Concealing Chips Remains A Violation Of Chip Visibility Rules, And Any Expired Denomination Chips Discovered Later Are Only Exchanged At Full Multiples With Odd Chips Forfeited.',
      },
    ],
  },
  {
    slug: 'table-balancing-and-breaking-order',
    title: 'Tournament Table Balancing & Breaking Order Rules',
    h1: 'Tournament Table Balancing Rules: Big Blind Move And Table Breaking Procedures',
    category: 'Tournament TDA',
    tdaRef: 'TDA Rule 11 / RROP Tournament Section',
    summary:
      'In Flop Tournaments, Table Balancing Moves The Player Who Will Be Next To Post The Big Blind From The Fullest Table To The Worst Position (Closest To The Big Blind) At The Shortest Table.',
    floorRuling:
      'Under TDA Rule 11 (Balancing Tables And Halting Play), Tournament Tables Are Kept Balanced Within One Player Of Each Other. When Moving A Single Player From A Fuller Table To A Shorter Table In Hold\'em Or Omaha, The Floor Moves The Player Who Is Due To Post The Big Blind Next And Seats Them In The Worst Available Seat (Closest To Posting The Big Blind) At The Destination Table So That No Player Dodges Their Blind Obligation. If Any Table Falls Three Or More Players Below The Largest Table, Play At The Short Table Halts Immediately Until Balanced. When A Full Table Breaks, Players Draw Random Seat Cards And Assume The Immediate Rights And Blind Obligations Of Their New Seat.',
    commonScenarios: [
      {
        situation: 'Table 4 Has 9 Players And Table 7 Drops To 7 Players After A Double Elimination.',
        ruling: 'At The Completion Of The Current Hand On Table 4, The Player Seated In The Upcoming Big Blind Position Is Moved To The Seat Closest To The Big Blind At Table 7.',
      },
      {
        situation: 'A Player Moved During Table Balancing Is Seated Between The Small Blind And The Dealer Button At Their New Table.',
        ruling: 'Under TDA Rule 10, A New Player Seated Between The Small Blind And Button Must Wait One Hand (Dead Seat) Until The Button Passes Them Before Being Dealt In.',
      },
      {
        situation: 'In Seven-Card Stud, A Table Needs To Move One Player To Balance.',
        ruling: 'Unlike Flop Games That Move The Upcoming Big Blind, Stud Games Balance By Moving The Player By Position (Counting Seats Clockwise From The Dealer Tray).',
      },
    ],
    relatedCalculators: [
      { href: '/tools/blind-structure-calculator', label: 'Tournament Blind Structure Generator' },
      { href: '/tools/icm-calculator', label: 'Tournament ICM Calculator' },
    ],
    relatedTerms: ['table-balancing', 'must-move-table', 'blinds', 'dealer-button'],
    faqs: [
      {
        q: 'What Is The Difference Between A Breaking Table And A Must-Move Table?',
        a: 'In Tournaments, Tables Break Randomly By Pre-Set Order And Players Draw Random New Seats. In Cash Games, A Must-Move Feeder Table Sends Players In Exact Chronological Arrival Order Into The Main Game.',
      },
      {
        q: 'When Does Play Halt On A Short-Handed Tournament Table?',
        a: 'Under TDA Rule 11D, Any Table That Has Three Or More Fewer Players Than The Table With The Most Players Must Pause Dealing Immediately Until Balancing Players Arrive.',
      },
    ],
  },
  {
    slug: 'hand-for-hand-bubble-play-rules',
    title: 'Hand-For-Hand Money Bubble Procedures',
    h1: 'Hand-For-Hand Tournament Money Bubble Rules And Simultaneous Elimination Ties',
    category: 'Tournament TDA',
    tdaRef: 'TDA Rule 18 & Rule 59 / RROP Tournament Section',
    summary:
      'On The Money Bubble, All Tables Deal One Synchronized Hand At A Time And Wait For Every Table To Finish; Players Eliminated On The Same Synchronized Hand At Different Tables Split The Tied Payouts Regardless Of Starting Stack Size.',
    floorRuling:
      'Under TDA Rule 59 (Hand-For-Hand Procedures), One Or Two Spots Prior To The Money Bubble, The Tournament Clock Typically Runs Off Two Minutes Per Synchronized Deal (Or Real Elapsed Time) While Dealers Pause After Each Hand Until Every Active Table Finishes. Whenever An All-In And Call Occurs During Hand-For-Hand Play, The Dealer Freezes Action And Keeps All Hole Cards Face Down Until The Floor Directs All Tables To Reveal Cards And Run Out Boards Sequentially. Under TDA Rule 18, If Multiple Players Are Eliminated On The Same Synchronized Hand At Different Tables, They Tie Equally And Split Any Applicable Prize Money Regardless Of Their Starting Chip Stacks; If Eliminated At The Same Table On The Same Hand, The Larger Starting Stack Finishes Higher.',
    commonScenarios: [
      {
        situation: 'With 101 Players Left And 100 Paid, Player A At Table 1 (Starting Hand With 15,000 Chips) And Player B At Table 4 (Starting Hand With 85,000 Chips) Both Bust On The Same Hand-For-Hand Deal.',
        ruling: 'Under TDA Rule 18B, Because They Bust On Different Tables During The Same Hand-For-Hand Deal, Their Starting Stack Sizes Do Not Matter: They Tie For 100th/101st Place And Split The 100th-Place Min-Cash 50/50.',
      },
      {
        situation: 'In A Single Hand At Table 2, Two Short Stacks (Player X With 12,000 And Player Y With 28,000) Both Lose All-In To The Chip Leader On The Bubble.',
        ruling: 'Under TDA Rule 18A, Because Both Eliminations Occurred In The Exact Same Hand At The Same Table, Starting Chip Stacks Decide Placement: Player Y (28,000) Finishes One Spot Higher Than Player X (12,000).',
      },
      {
        situation: 'During Hand-For-Hand Play, Two Players Are All-In On Table 3 And Immediately Flip Their Hole Cards Face Up Before Other Tables Finish.',
        ruling: 'Violation Of Hand-For-Hand Protocol. Players Are Required To Keep Cards Face Down Until The Floor Announces Showdown To Prevent Collusive Stalling Or Information Leaks.',
      },
    ],
    relatedCalculators: [
      { href: '/tools/icm-calculator', label: 'Tournament ICM Calculator' },
      { href: '/tools/push-fold-calculator', label: 'Push/Fold Nash Calculator' },
    ],
    relatedTerms: ['icm', 'showdown', 'effective-stack', 'time-bank'],
    faqs: [
      {
        q: 'Why Do Starting Stacks Break Ties At The Same Table But Not Across Different Tables?',
        a: 'At Different Tables, Blind Sizes And Deal Speeds Vary Slightly And Players Cannot Directly Contest Each Other\'s Chips, So TDA Rule 18B Treats Same-Hand Multi-Table Bustouts As Equal Ties.',
      },
      {
        q: 'Who Wins The Tournament Seat Or Trophy When Two Bubble Players Split Min-Cash?',
        a: 'Cash Prize Money Is Divided Equally Down To The Dollar, While Non-Divisible Prizes (Like A Satellite Seat Or Trophy) Are Decided By A High-Card Draw Or Flip-Out Hand.',
      },
    ],
  },
  {
    slug: 'shot-clock-and-time-bank-rules',
    title: 'Tournament Shot Clocks, Calling The Clock & Time Banks',
    h1: 'Tournament Shot Clock Rules, Calling The Clock (25+5 Seconds), And Time Bank Extensions',
    category: 'Tournament TDA',
    tdaRef: 'TDA Rule 58 / Recommended Procedure RP-14',
    summary:
      'Once Reasonable Thinking Time Has Passed, Any Player At The Table May Call The Clock, Giving The Acting Player 25 Seconds Plus A 5-Second Verbal Countdown Before Their Hand Is Declared Dead (Or Checked If Facing No Bet).',
    floorRuling:
      'Under TDA Rule 58 (Calling The Clock), Once A Reasonable Amount Of Time Has Elapsed, Any Player At The Table May Request That The Floor Call A Clock On An Acting Player (Or The Floor May Initiate One Directly). When Approved, The Player Is Given 25 Seconds Plus A 5-Second Audible Countdown (30 Seconds Total). If The Player Has Not Acted By The Time The Final Second Expires, The Hand Is Immediately Dead If Facing A Bet, Or Checked If Facing No Bet. In Events Using Action Shot Clocks (RP-14, Typically 15 To 30 Seconds Per Decision), A Player Who Lets Their Shot Clock Expire Automatically Burns One Physical Or Digital Time Bank Card (Adding 30 To 60 Seconds); If Out Of Time Banks, Their Hand Is Dead Facing A Bet.',
    commonScenarios: [
      {
        situation: 'Player A Tanks For 3 Minutes On The River Facing An All-In Bet. A Player Not In The Hand Requests The Clock.',
        ruling: 'Under TDA Rule 58, Any Player Seated At The Table (Even If Not In The Current Hand) May Request The Clock. The Floor Starts The 25-Second Timer Plus 5-Second Countdown.',
      },
      {
        situation: 'The Floor Reaches "One... Zero" On The Countdown Just As The Player Reaches For Chips Without Having Spoken Or Released Them.',
        ruling: 'Because The Countdown Reached Zero Before A Binding Verbal Declaration Or Chip Release Occurred, The Hand Is Dead And All Previous Bets Stay In The Pot.',
      },
      {
        situation: 'In A Shot-Clock Event, A Player Facing A Check On The Turn Runs Out Of Time And Has Zero Time Bank Extensions Remaining.',
        ruling: 'Because The Player Faces Zero Bet, Their Hand Is Not Killed; Instead, An Automatic Check Is Enforced And The River Card Is Dealt.',
      },
    ],
    relatedCalculators: [
      { href: '/tools/blind-structure-calculator', label: 'Tournament Blind Structure Generator' },
      { href: '/tools/icm-calculator', label: 'Tournament ICM Calculator' },
    ],
    relatedTerms: ['time-bank', 'icm', 'showdown', 'out-of-position'],
    faqs: [
      {
        q: 'Can A Player From Another Table Call The Clock On My Hand?',
        a: 'No. Only A Player Actively Seated At The Same Table Or A Tournament Floor Supervisor Has Standing To Request Or Initiate A Clock.',
      },
      {
        q: 'What Happens If A Tie Occurs On A Countdown Clock?',
        a: 'Under TDA Rule 58, Any Tie Between The Expiration Of The Final Second And The Player\'s Binding Verbal Or Physical Action Always Goes To The Player.',
      },
    ],
  },
  {
    slug: 'missed-blinds-posting-and-buying-the-button',
    title: 'Missed Blinds, Posting Dead & Buying The Button',
    h1: 'Cash Game Missed Blinds Rules: Posting Dead Money And Buying The Button Explained',
    category: 'Cash Game Procedures',
    tdaRef: 'RROP Section 5 / Live Cardroom Procedures',
    summary:
      'In Live Cash Games, A Returning Player Who Missed Their Blinds Must Either Wait For The Big Blind Seat, Post Both Blinds (Big Blind Live + Small Blind Dead), Or Buy The Button By Posting Both Blinds From The Cutoff Seat.',
    floorRuling:
      'Under Robert\'s Rules Of Poker (Section 5: Blinds), Cash Game Players Who Leave Their Seat And Miss Either The Big Blind Or Both Blinds Incur A Missed-Blind Button Marker. To Re-Enter Action Immediately Without Waiting For The Natural Big Blind Seat, The Player Must Post A Sum Equal To The Missed Blinds: One Full Big Blind Is Posted As A Live Blind And The Missed Small Blind Is Posted As Dead Money Placed Directly Into The Center Pot. If The Player Re-Enters Exactly Between The Small Blind And The Button ("Buying The Button"), They Post Both Blinds, Act Last Preflop Behind The Real Blinds, And Receive The Actual Dealer Button On The Very Next Hand.',
    commonScenarios: [
      {
        situation: 'In A $2/$5 Cash Game, A Player Returns From Dinner With Both Missed Blind Buttons And Wants To Be Dealt In Immediately From Middle Position.',
        ruling: 'The Player Posts A Live $5 Big Blind Plus A Dead $2 Small Blind ($7 Total). If Another Player Raises To $20, Only The Live $5 Counts Toward The Call (Requiring $15 More).',
      },
      {
        situation: 'A Returning Player Waits Until The Seat Immediately To The Right Of The Dealer Button (Cutoff) To Post Their Missed Blinds.',
        ruling: 'This Is "Buying The Button": The Player Posts $5 Live + $2 Dead, Plays This Hand From The Cutoff, And Then Receives The Dealer Button On The Next Hand While The Two Players To Their Left Post The Regular Blinds.',
      },
      {
        situation: 'In A Tournament, A Player Is Away From The Table For Three Orbits And Returns To Their Seat.',
        ruling: 'In Tournaments, Blinds And Antes Are Posted Automatically Every Orbit By The Dealer From The Absent Player\'s Stack, So There Is Never Any Missed Blind Makeup Upon Return.',
      },
    ],
    relatedCalculators: [
      { href: '/tools/poker-winrate-calculator', label: 'Poker Winrate Calculator' },
      { href: '/tools/bankroll-calculator', label: 'Bankroll & Risk Of Ruin Calculator' },
    ],
    relatedTerms: ['blinds', 'dealer-button', 'waitlist', 'must-move-table'],
    faqs: [
      {
        q: 'Is It Mathematically Better To Post Missed Blinds In Middle Position Or Wait For The Big Blind?',
        a: 'Waiting For The Natural Big Blind Or Buying The Button Is Always Higher EV Because Posting Dead Money Out Of Position In Middle Seats Donates Extra Blinds Without Positional Advantage.',
      },
      {
        q: 'Do New Players Sitting Down At A Cash Table Have To Post A Big Blind?',
        a: 'Most Modern Live Cardrooms Allow Brand-New Players (And Table-Change Transfers) To Be Dealt In Immediately Without Posting A Blind, Provided They Do Not Sit Directly Between The Small Blind And The Button.',
      },
    ],
  },
  {
    slug: 'run-it-twice-and-all-in-insurance-rules',
    title: 'Run It Twice (RIT) & Cash Game All-In Agreements',
    h1: 'Run It Twice (RIT) Rules, Variance Reduction, And Cash Game All-In Insurance',
    category: 'Cash Game Procedures',
    tdaRef: 'RROP Section 16 / Private Club & Cardroom Rules',
    summary:
      'Run It Twice (RIT) Allows All Players Remaining In An All-In Cash Game Pot To Agree Before The Next Card Is Dealt To Deal Two Separate Board Runouts, Splitting The Total Pot 50/50 Between Both Boards Without Changing Expected Value (EV).',
    floorRuling:
      'In Live And Online Cash Games That Permit Run It Twice (RIT), Once All Active Players Are All-In And No Further Side Betting Is Possible, The Remaining Contenders May Unanimously Agree To Deal The Remaining Community Cards Two (Or Three) Times. The Total Pot Is Divided Into Two Equal Halves: The First Board Runout Determines The Winner Of Half #1, And A Second Complete Board (Using Standard Burn Cards) Is Dealt From The Same Remaining Deck Stub To Determine The Winner Of Half #2. Any Player Still Contending For The Pot May Veto Running It Multiple Times, And All Agreements Must Be Concluded Before The Next Burn Card Touches The Felt.',
    commonScenarios: [
      {
        situation: 'Two Players Are All-In On The Flop In A $5/$10 Cash Game And Agree To Run It Twice.',
        ruling: 'The Dealer Burns And Deals Turn #1 And River #1 For The First Half Of The Pot, Then Burns And Deals Turn #2 And River #2 For The Second Half Of The Pot.',
      },
      {
        situation: 'In A 3-Way All-InWith A Main Pot And A Side Pot, Players A And B Want To Run It Twice, But Short-Stacked Player C Wants To Run It Once.',
        ruling: 'Depending On House Rules, Either The Entire Pot Must Run Once Because It Is Not Unanimous, Or The Main Pot Runs On Board #1 Only While Side Pot #1 Between A And B Splits Across Both Boards.',
      },
      {
        situation: 'An All-In Favorite Purchases All-In Equity Insurance In A Club Arena Cash Game Before The River Card.',
        ruling: 'Insurance Locks In A Guaranteed Payout Against The Underdog\'s Exact Out Cards For A Small Mathematical Premium, Eliminating Bad Beat Downswing Variance.',
      },
    ],
    relatedCalculators: [
      { href: '/tools/poker-odds-calculator', label: 'Multiway Poker Odds Calculator' },
      { href: '/tools/bankroll-calculator', label: 'Bankroll & Risk Of Ruin Calculator' },
    ],
    relatedTerms: ['run-it-twice', 'insurance', 'variance', 'expected-value'],
    faqs: [
      {
        q: 'Does Running It Twice Change My Mathematical Expected Value (EV)?',
        a: 'No. By Linearity Of Expectation, Dealing Two Independent Boards Without Replacement From The Remaining Deck Stub Preserves Your Exact Mathematical Expected Value To The Penny While Significantly Lowering Variance.',
      },
      {
        q: 'Can Players Agree To Run It Twice In A Sanctioned Poker Tournament?',
        a: 'No. Under Official Poker TDA Rules, Running It Twice And All-In Chop Deals On Individual Hands Are Strictly Prohibited In Tournaments Because Every Elimination Directly Impacts The Entire Field.',
      },
    ],
  },
  {
    slug: 'bomb-pots-and-double-board-rules',
    title: 'Single & Double-Board Bomb Pot Rules',
    h1: 'Bomb Pot Rules: How Single-Board And Double-Board PLO Bomb Pots Work',
    category: 'Variant Specific',
    tdaRef: 'Live Cardroom & Club Arena Bomb Pot Standard',
    summary:
      'In A Bomb Pot, Every Seated Player Posts An Agreed Ante (Typically 2BB To 5BB) With Zero Preflop Betting And Deals Straight To The Flop (Or Two Simultaneous Flops), With Half The Pot Awarded To Each Board.',
    floorRuling:
      'A Bomb Pot Is Triggered Either Once Per Dealer Down, On Every Dealer Change, Or At Scheduled Intervals. Every Participating Player Posts A Uniform Bomb Pot Ante (For Example, $10 Or $25), The Blinds Are Skipped, And There Is Zero Preflop Betting Round. The Dealer Deals Hole Cards (2 Cards For Hold\'em Or 4/5 Cards For PLO) And Immediately Deals Either One Or Two 3-Card Flops Simultaneously. Postflop Betting Begins With The Player Immediately Left Of The Dealer Button Across Flop, Turn, And River Streets. In Double-Board Bomb Pots, Each Board Awards Exactly 50% Of The Total Pot At Showdown, With Any Indivisible Odd Chip Awarded To The Top Board.',
    commonScenarios: [
      {
        situation: 'In A Double-Board PLO4 Bomb Pot, Player A Has The Nut Flush On The Top Board And Air On The Bottom Board, While Player B Has A Full House On The Bottom Board.',
        ruling: 'Player A Wins 50% Of The Pot From The Top Board And Player B Wins 50% Of The Pot From The Bottom Board (A "Chop" Where Both Players Split The Pot).',
      },
      {
        situation: 'A Player Sitting At The Table Declines To Participate In A Scheduled Bomb Pot.',
        ruling: 'The Non-Participating Player Is Dealt Out Of The Bomb Pot Without Penalty, And The Dealer Button Does Not Move During A Special Bomb Pot Hand So Normal Blinds Resume On The Exact Same Seat Afterward.',
      },
      {
        situation: 'On The Turn Of A Double-Board PLO Bomb Pot, A Player Announces "Pot".',
        ruling: 'The Dealer Calculates The Pot-Limit Maximum Bet Using The Combined Total Pot In The Center, And That Single Bet Applies Simultaneously To Both Boards.',
      },
    ],
    relatedCalculators: [
      { href: '/tools/poker-odds-calculator', label: 'Multiway Poker Odds Calculator' },
      { href: '/tools/side-pot-calculator', label: 'Multi-Way Side Pot Calculator' },
    ],
    relatedTerms: ['bomb-pot', 'double-board-bomb-pot', 'nut-advantage', 'equity'],
    faqs: [
      {
        q: 'Do You Bet Separately On Each Board In A Double-Board Bomb Pot?',
        a: 'No. There Is Only One Central Pot And One Betting Round Per Street (Flop, Turn, And River). Any Bet Or Fold Applies To Both Boards At The Same Time.',
      },
      {
        q: 'Why Is PLO Preferred Over Texas Hold\'em For Double-Board Bomb Pots?',
        a: 'Because Four Or Five Hole Cards Create Dramatically More Two-Way Nut Combinations That Can Simultaneously Contest Both The Top And Bottom Boards (Scoop Equity).',
      },
    ],
  },
  {
    slug: 'kill-pots-and-half-kill-rules',
    title: 'Full Kill & Half-Kill Pot Rules In Limit & Omaha',
    h1: 'Kill Pot And Half-Kill Rules In Limit Hold\'Em And Omaha Hi-Lo (O8)',
    category: 'Variant Specific',
    tdaRef: 'RROP Section 11: Kill Pots',
    summary:
      'A Kill Button Triggers An Automatic Blind And Betting Limit Escalation (1.5x For Half-Kill Or 2x For Full Kill) On The Following Hand Whenever A Player Wins Two Consecutive Pots Or Scoops A Qualifying Pot Size.',
    floorRuling:
      'Under Robert\'s Rules Of Poker (Section 11: Kill Pots), Fixed-Limit And Mixed Games Frequently Use A Half-Kill (1.5x Limits) Or Full Kill (2x Limits) Trigger. A Kill Hand Is Activated Either When One Player Wins Two Consecutive Full Pots In A Row ("Two-In-A-Row Kill") Or, In Split-Pot Games Like Omaha Hi-Lo (O8), When One Player Scoops An Entire Pot That Meets Or Exceeds A Minimum Dollar Threshold (Typically 5x To 10x The Lower Betting Limit). The Winner Receives The Kill Button, Must Post The Escalated Kill Blind Out Of Turn On The Very Next Hand regardless Of Seat Position, And Acts Last Preflop Behind The Regular Blinds (Except If Seated In The Small Or Big Blind).',
    commonScenarios: [
      {
        situation: 'In A $20/$40 Limit Omaha Hi-Lo Game With A Half-Kill Triggered At A $200 Scoop, Seat 6 Scoops A $240 Pot.',
        ruling: 'The Next Hand Plays At $30/$60 Limits. Seat 6 Receives The Kill Button, Posts A $30 Kill Blind Before The Deal, And Acts Last Preflop.',
      },
      {
        situation: 'A Player Holding The Active Kill Button Scoops Another Qualifying Pot On The Kill Hand.',
        ruling: 'The Kill Remains Active ("Re-Killed") For The Next Hand At The Same Escalated Limit; It Does Not Double A Second Time.',
      },
      {
        situation: 'Two Players Split A $300 Pot In Limit Hold\'em Where Winning Two Consecutive Pots Triggers A Kill.',
        ruling: 'Splitting A Pot Does Not Count As A Consecutive Win Toward A Kill Button, Nor Does It Extinguish An Existing One-Leg Marker ("Leg Up") If One Of The Winners Already Won The Prior Hand.',
      },
    ],
    relatedCalculators: [
      { href: '/tools/poker-odds-calculator', label: 'Multiway Poker Odds Calculator' },
      { href: '/tools/bankroll-calculator', label: 'Bankroll & Risk Of Ruin Calculator' },
    ],
    relatedTerms: ['blinds', 'straddle', 'variance', 'pot-odds'],
    faqs: [
      {
        q: 'What Is A "Leg Up" In A Kill Game?',
        a: 'When A Game Requires Winning Two Consecutive Pots To Trigger A Kill, Winning The First Qualifying Pot Gives That Player A "Leg Up" (Indicated By Flipping The Kill Button White-Side Up).',
      },
      {
        q: 'If The Kill Player Is In The Big Blind Seat, Do They Post Both The Big Blind And The Kill Blind?',
        a: 'No. Under RROP Section 11, If The Player Who Triggered The Kill Is Also In The Natural Small Blind Or Big Blind Seat, They Only Post The Single Escalated Kill Blind Amount.',
      },
    ],
  },
  {
    slug: 'rabbit-hunting-and-dealing-unused-cards',
    title: 'Rabbit Hunting Rules In Live & Online Poker',
    h1: 'Rabbit Hunting Rules: Why Looking At Unused Community Cards Is Prohibited Under TDA',
    category: 'Cash Game Procedures',
    tdaRef: 'TDA Rule 69B / Live Cardroom Etiquette',
    summary:
      'Rabbit Hunting - Dealing Out Remaining Unseen Community Cards After A Hand Ends Without A Showdown - Is Strictly Prohibited In All TDA Tournaments And Most Live Cardrooms Unless Explicitly Enabled As An Online Feature.',
    floorRuling:
      'Under Poker TDA Rule 69B (Rabbit Hunting), Dealing Or Exposing Any Cards That Would Have Come On The Flop, Turn, Or River After A Hand Has Concluded By Fold Is Strictly Forbidden In All Tournament Play. Most Commercial Live Cash Rooms Also Prohibit Rabbit Hunting Because It Slows Down Hands Per Hour, Reveals Deck Stub Composition, And Sparks Tilt Or Table Disputes. In Private Home Games Or Online Platforms Like Club Arena That Offer An Automated Rabbit Hunt Feature, The Remaining Board May Be Revealed Digitally Without Delaying The Next Deal.',
    commonScenarios: [
      {
        situation: 'After Folding A Flush Draw On The Turn In A Tournament, A Player Asks The Dealer To Flip Over The River Card Just To See If The Flush Hit.',
        ruling: 'Strictly Prohibited Under TDA Rule 69B. The Dealer Must Pull In The Deck Stub Immediately Without Exposing Any Unused Cards.',
      },
      {
        situation: 'A Player Reaches Toward The Deck Stub Himself After A Cash Hand Ends To Peek At The Top Card.',
        ruling: 'Severe Etiquette And Security Violation. Touching The Dealer\'s Deck Stub Can Result In Immediate Floor Warning Or Removal From The Game.',
      },
      {
        situation: 'In An Online Club Arena Cash Game, A Player Taps The Digital Rabbit Icon After Everyone Folds On The Flop.',
        ruling: 'The Online Engine Instantly Displays The Simulated Turn And River Cards On The Player\'s Screen Without Slowing Down The Next Hand Deal.',
      },
    ],
    relatedCalculators: [
      { href: '/tools/poker-odds-calculator', label: 'Multiway Poker Odds Calculator' },
      { href: '/tools/pot-odds-calculator', label: 'Pot Odds & MDF Calculator' },
    ],
    relatedTerms: ['outs', 'equity', 'tilt', 'club-arena'],
    faqs: [
      {
        q: 'Why Do Live Casinos Ban Rabbit Hunting Even In Cash Games?',
        a: 'Even A 5-Second Delay On 10 Hands Per Hour Costs The Table 2 To 3 Full Deals Per Hour, Reducing Both Player Volume And Dealer Down Efficiency.',
      },
      {
        q: 'If A Dealer Accidentally Flashes The Next Card While Gathering The Deck, Does It Change Anything?',
        a: 'No. Once The Final Active Opponent Has Folded And The Pot Has Been Pushed, The Hand Is Officially Over And Any Accidentally Flashed Stub Card Has Zero Effect.',
      },
    ],
  },
  {
    slug: 'check-raising-and-out-of-turn-action',
    title: 'Check-Raising & Binding Out-Of-Turn Action Rules',
    h1: 'Check-Raising Legality And Binding Out-Of-Turn Action Rules (TDA Rule 53)',
    category: 'Betting & Action',
    tdaRef: 'TDA Rule 53 / RROP Section 3 & Section 14',
    summary:
      'Check-Raising Is 100% Legal In All Standard Poker Formats; Under TDA Rule 53, Any Action Taken Out Of Turn Is Binding If The Action To That Player Does Not Change Before Their Real Turn Arrives.',
    floorRuling:
      'Check-Raising (Checking First In Turn And Then Raising After An Opponent Behind Bets On The Same Street) Is Permitted In Every Sanctioned Cash Game And Tournament Unless A Private Home Game Explicitly Announces Otherwise Before Play Starts. Under TDA Rule 53 (Action Out Of Turn - OOT), If A Player Checks, Calls, Bets, Raises, Or Folds Out Of Turn, Action Returns To The Correct Player In Turn. If The Intervening Player(s) Check (When The OOT Player Checked Or Bet) Or Call (When The OOT Player Called, Raised, Or Folded), The Action Has Not Changed And The OOT Action Is 100% Binding. If An Intervening Player Changes The Action By Betting Or Raising, The OOT Player Gets Their Chips Back And Regains All Betting Options.',
    commonScenarios: [
      {
        situation: 'On The Flop, Player A Is First To Act, Player B Is Second, And Player C Is Third. Player B Bets 2,000 Out Of Turn Before Player A Acts.',
        ruling: 'Action Returns To Player A. If Player A Checks, The Action To Player B Has Not Changed, So Player B\'s 2,000 Bet Stands As Binding.',
      },
      {
        situation: 'In The Same Scenario, After Player B Bets 2,000 Out Of Turn, Player A Decides To Bet 1,000 In Turn.',
        ruling: 'Because Player A Bet (Changing The Action From No Bet To A 1,000 Bet), Player B\'s Out-Of-Turn 2,000 Is Returned And Player B May Now Fold, Call 1,000, Or Raise To At Least 2,000.',
      },
      {
        situation: 'Player C Mucks Their Cards Into The Pile Out Of Turn While Player A And Player B Are Still Acting.',
        ruling: 'An Out-Of-Turn Fold Where The Cards Hit The Muck Is Immediately Dead And Irreversible Regardless Of What Players A And B Do.',
      },
    ],
    relatedCalculators: [
      { href: '/tools/pot-odds-calculator', label: 'Pot Odds & MDF Calculator' },
      { href: '/tools/spr-calculator', label: 'SPR & Geometric Sizing Calculator' },
    ],
    relatedTerms: ['out-of-position', 'in-position', 'trap', 'slow-play'],
    faqs: [
      {
        q: 'What Happens If A Player Was Intentionally Skipped By The Table And Action Moved Past Them?',
        a: 'Under TDA Rule 54, A Skipped Player Must Speak Up Immediately Before Substantial Action Occurs Behind Them; Once Substantial Action Occurs After The Skip, They Lose Their Right To Act On That Street.',
      },
      {
        q: 'Can I Check-Raise In Limit Poker As Well As No-Limit?',
        a: 'Yes. Check-Raising Is 100% Legal In Fixed-Limit, Pot-Limit, Spread-Limit, And No-Limit Poker.',
      },
    ],
  },
  {
    slug: 'chip-visibility-and-table-stakes-rules',
    title: 'Table Stakes, Chip Visibility & Going South Rules',
    h1: 'Table Stakes, Highest-Denomination Chip Visibility, And Going South (Ratholing) Rules',
    category: 'Cash Game Procedures',
    tdaRef: 'TDA Rule 25 / RROP Section 3: Table Stakes',
    summary:
      'All Chips On The Table Must Remain Clearly Visible With Highest-Denomination Chips In Front Or On Top; Removing Chips From Play ("Going South" Or "Ratholing") Or Adding Chips Mid-Hand Is Strictly Prohibited.',
    floorRuling:
      'Under TDA Rule 25 (Visible And Countable Chips) And RROP Table Stakes Rules, Players Must Keep Their Entire Chip Stack Visible, Countable, And Organized In Clean Stacks (Standard 20 Chips Per Stack) With The Highest-Denomination Chips Clearly Positioned Where All Opponents Can See Them At All Times. Under Table Stakes Rules, Only Chips And Approved Cash Equivalents Sitting On The Table Before The First Card Of A Hand Is Dealt Are In Play For That Hand. In Cash Games, Players May Never Remove Chips From Their Stack To Reduce Their Exposure ("Going South" Or "Ratholing") Without Leaving The Game For The House Minimum Cool-Down Period (Typically 60 To 120 Minutes).',
    commonScenarios: [
      {
        situation: 'A Player Hides Two 5,000-Value Chips Behind A Wall Of 100-Value Chips, And An Opponent Shoves Thinking The Player Only Has 2,000 Total.',
        ruling: 'Violation Of TDA Rule 25. While The Hidden Chips Are Generally Still In Play If They Were On The Table, The Offending Player Is Subject To A Severe Floor Penalty And Must Immediately Bring All High-Value Chips To The Front.',
      },
      {
        situation: 'In A $2/$5 Cash Game, A Player Runs A $500 Buy-In Up To $1,800 And Tries To Put $1,000 Into Their Pocket While Continuing To Play.',
        ruling: 'Illegal Going South (Ratholing). The Floor Requires The Player ToEither Return The $1,000 To The Table Stack Or Cash Out Completely And Wait The Mandatory Re-Buy Time Period.',
      },
      {
        situation: 'During A Hand On The Flop, A Player Pulls Five Extra $100 Bills Out Of Their Wallet To Call An Opponent\'s All-In.',
        ruling: 'Under Table Stakes Rules, Money Not On The Table Before The First Card Was Dealt Cannot Play In The Current Hand.',
      },
    ],
    relatedCalculators: [
      { href: '/tools/side-pot-calculator', label: 'Multi-Way Side Pot Calculator' },
      { href: '/tools/bankroll-calculator', label: 'Bankroll & Risk Of Ruin Calculator' },
    ],
    relatedTerms: ['effective-stack', 'spr', 'showdown', 'waitlist'],
    faqs: [
      {
        q: 'Am I Entitled To Ask An Opponent How Many Chips They Have Left?',
        a: 'Under TDA Rule 25, You Are Always Entitled To A Clear Visual View Of An Opponent\'s Stacks (With Big Chips Front And Center), Though The Dealer Will Only Count Out An Exact Stack Amount Once A Bet Or All-In Has Been Made.',
      },
      {
        q: 'Can I Pay For Food Or Tips From My Cash Game Table Stack?',
        a: 'Most Live Cardrooms Allow Small Incidental Deductions For Dealer Tips, Food, And Beverages From Your Table Stack Provided You Are Not Currently In An Active Hand.',
      },
    ],
  },
  {
    slug: 'final-table-redraw-and-icm-chop-rules',
    title: 'Final Table Redraw & Official ICM Chop Agreements',
    h1: 'Final Table Seat Redraw Rules And Official Tournament ICM Deal Procedures',
    category: 'Tournament TDA',
    tdaRef: 'TDA Rule 12 & Rule 24 / RROP Tournament Section',
    summary:
      'Tournaments Perform A Complete Random Seat And Button Redraw When Reaching The Final Table; Official Final Table Prize Pool Chops Require 100% Unanimous Player Agreement Under Floor Supervision.',
    floorRuling:
      'Under TDA Rule 12 (Final Table Redraws), When A Multi-Table Tournament Consolidates Down To The Final Table (Typically 9 Players For 9-Max Or 7 Players For 6-Max), Play Halts Completely And All Remaining Players Draw Random New Seat Assignments. After All Players Are Seated, The Dealer Deals One Face-Up Card To Each Player Starting In Seat 1, And The Highest Card By Rank And Bridge Suit Order Wins The New Dealer Button. When Final Table Players Wish To Discuss A Prize Pool Deal (ICM Chop Or Chip Chop), Play Pauses On The Break Or Between Hands, And Every Remaining Player Must Unanimously Agree To The Exact Payout Numbers Computed By The Tournament Director.',
    commonScenarios: [
      {
        situation: 'A 9-Handed Tournament Reaches 10 Players Across Two 5-Handed Tables, And One More Player Busts.',
        ruling: 'Play Stops Immediately. All 9 Finalists Rack Their Chips, Draw Random Seats 1 Through 9 At The Final Table, And Draw High Card For The First Dealer Button.',
      },
      {
        situation: 'Four Finalists At A Final Table Ask The Floor To Calculate An Independent Chip Model (ICM) Chop.',
        ruling: 'The Floor Pauses The Clock, Counts Every Stack Exactly, Computes Each Player\'s Malmuth-Harville ICM Equity (Often Setting Aside 5% To 10% Plus The Trophy For 1st Place), And Requires All Four Signatures.',
      },
      {
        situation: 'Three Players Agree To The ICM Numbers, But The Chip Leader Demands $3,000 More And One Short Stack Refuses.',
        ruling: 'Because Deal Agreements Require 100% Unanimous Consent, The Deal Fails And Tournament Play Resumes Immediately Under The Original Payout Structure.',
      },
    ],
    relatedCalculators: [
      { href: '/tools/icm-calculator', label: 'Tournament ICM Calculator' },
      { href: '/tools/bounty-calculator', label: 'PKO & Mystery Bounty Calculator' },
    ],
    relatedTerms: ['icm', 'expected-value', 'table-balancing', 'dealer-button'],
    faqs: [
      {
        q: 'Why Is An ICM Chop Fairer Than A Chip Chop At A Final Table?',
        a: 'A Chip Chop Linearly Overpays The Chip Leader (Sometimes Awarding More Than 1st Place Prize Money), Whereas ICM Accurately Weights The Probability Of Finishing In 2nd, 3rd, And 4th Place.',
      },
      {
        q: 'How Are Bounties Handled During A Final Table Deal In A PKO Or Mystery Bounty Event?',
        a: 'Standard ICM Chops Only Redistribute The Regular Main Prize Pool; Active Bounties And Mystery Envelopes Usually Remain In Play To Be Won Via Actual Knockouts.',
      },
    ],
  },
  {
    slug: 'late-registration-and-re-entry-rules',
    title: 'Tournament Late Registration, Rebuys & Re-Entry Rules',
    h1: 'Tournament Late Registration, Re-Entry Vs. Rebuy Rules, And Alternate Seat Assignment',
    category: 'Tournament TDA',
    tdaRef: 'TDA Rule 8, Rule 9 & Rule 10 / RROP Tournament Section',
    summary:
      'Late Registrants And Re-Entries Receive A Full Starting Stack And Are Seated Randomly Like New Players; Once The Late Registration Clock Expires, Any Player Already In Line Or Eliminated Before The Bell Has Final Eligibility.',
    floorRuling:
      'Under TDA Rule 8 (Alternates, Late Registration, And Re-Entries), All Late Registrants, Alternates, And Re-Entry Players Are Sold Full Unreduced Starting Stacks And Assigned Seats Using The Same Random Balancing Process As Starting Players. A Re-Entry Differs From A Traditional Rebuy: In A Rebuy Event, A Player Reloads Chips At Their Current Seat Without Moving, Whereas A Re-Entry Player Is Officially Eliminated, Surrenders Their Seat, Pays A Fresh Entry Fee At The Cage, And Draws A Random New Table And Seat. Under TDA Rule 10, A Newly Seated Player Can Be Dealt In Immediately In Any Seat Except Between The Small Blind And The Dealer Button.',
    commonScenarios: [
      {
        situation: 'A Player Busts On The Final Hand Before The Level 8 Late Registration Break And Immediately Announces They Want To Re-Enter.',
        ruling: 'Because The Elimination Occurred Before The Registration Period Closed And The Player Declared Intent Immediately, They Are Eligible To Re-Enter Before The Next Level Deals.',
      },
      {
        situation: 'A Late Registrant Draws Table 6 Seat 2, Which Is Currently Seated Directly Between The Small Blind (Seat 3) And The Button (Seat 1).',
        ruling: 'Under TDA Rule 10, The New Player Must Wait Out That Single Hand And Will Be Dealt In On The Next Hand Once The Button Moves To Seat 2.',
      },
      {
        situation: 'A Tournament Sells Out All Physical Seats And Operates An Alternate List.',
        ruling: 'Alternates Are Seated In Exact Registration Order Into Newly Vacated Seats From Bustouts And Always Receive A Full Starting Chip Stack.',
      },
    ],
    relatedCalculators: [
      { href: '/tools/icm-calculator', label: 'Tournament ICM Calculator' },
      { href: '/tools/blind-structure-calculator', label: 'Tournament Blind Structure Generator' },
    ],
    relatedTerms: ['icm', 'effective-stack', 'push-fold', 'blinds'],
    faqs: [
      {
        q: 'Does Registering At The Last Second Of Late Registration Give An ICM Boost?',
        a: 'Yes. Because Early Bustouts Have Already Exited Without Cashing While Prize Pool Dollars Remain Intact, A Fresh Starting Stack Entering At The Close Of Late Registration Carries Positive ICM Dollar Markup Over Buy-In.',
      },
      {
        q: 'What Is The Difference Between An Add-On And A Rebuy?',
        a: 'A Rebuy Can Only Be Purchased When Your Stack Is At Or Below The Starting Stack During The Rebuy Period, Whereas An Add-On Is An Optional Bonus Chip Purchase Available To All Surviving Players At The Close Of The Rebuy Period Regardless Of Stack Size.',
      },
    ],
  },
  {
    slug: 'bounty-and-mystery-bounty-token-rules',
    title: 'Knockout Bounty & Mystery Bounty Token Custody Rules',
    h1: 'Knockout Bounty, PKO, And Mystery Bounty Token Award And Split-Pot Rules',
    category: 'Tournament TDA',
    tdaRef: 'TDA Recommended Procedure RP-16 / Bounty Custody Rules',
    summary:
      'A Player Wins An Opponent\'s Bounty Token Only By Winning The Exact Pot (Main Or Exterior Side Pot) That Eliminates That Player\'s Final Tournament Chip; Tied Eliminating Hands Split Bounties Equally.',
    floorRuling:
      'In Standard Knockout (KO), Progressive Knockout (PKO), And Mystery Bounty Tournaments, A Bounty Token Represents Financial Prize Value And Must Be Kept Visibly On The Table Alongside The Player\'s Chip Stack. When A Short-Stacked Player Is Eliminated In A Multi-Way All-In, The Bounty Belongs Strictly To The Player Who Wins The Specific Pot That Covered The Eliminated Player\'s Final Chip (For Example, If The Eliminated Player Had 8,000 Chips, Whoever Wins The 8,000-Level Pot Wins The Bounty, Even If Someone Else Wins The Lower Main Pot). If Two Covering Players Tie With Identical Winning Hands For The Eliminating Pot, The Bounty Token Or Mystery Pull Is Split Or Awarded By Position/Odd-Chip Rules Per The Event Structure.',
    commonScenarios: [
      {
        situation: 'Player A (3,000 Chips) And Player B (7,000 Chips) Are Both All-In, Covered By Player C (25,000 Chips). Player A Wins The 9,000 Main Pot With Aces, While Player C Beats Player B With Kings To Win Side Pot 1 (8,000).',
        ruling: 'Player A Survives And Triples Up. Player B Is Eliminated Because Player C Won Side Pot 1 Containing Player B\'s Final 4,000 Chips, So Player C Wins Player B\'s Bounty Token.',
      },
      {
        situation: 'Two Covering Players (Seat 2 And Seat 6) Both Hold Identical Straights To Chop The Pot That Eliminates Seat 4 In A Mystery Bounty Tournament.',
        ruling: 'In Cash Bounty Events, The Bounty Value Is Split 50/50. In Physical Mystery Bounty Envelope Events, The Two Winners Either Agree To Split The Drawn Envelope 50/50 Or The Odd Token Goes To The First Tied Player Left Of The Button.',
      },
      {
        situation: 'A Player Puts Their Physical Bounty Chips Into Their Backpack During The Tournament.',
        ruling: 'Violation Of Bounty Custody Rules. All Bounty Tokens Must Remain Visible On The Table So Opponents Know Exact Knockout Eligibility And Count.',
      },
    ],
    relatedCalculators: [
      { href: '/tools/bounty-calculator', label: 'PKO & Mystery Bounty Calculator' },
      { href: '/tools/side-pot-calculator', label: 'Multi-Way Side Pot Calculator' },
    ],
    relatedTerms: ['mystery-bounty', 'progressive-knockout', 'side-pot', 'icm'],
    faqs: [
      {
        q: 'Can I Win My Own Bounty If I Bust Out?',
        a: 'No, Unless You Win The entire Tournament (1st Place), In Which Case You Keep Your Own Final Bounty Plus The Final Opponent\'s Bounty.',
      },
      {
        q: 'When Do Mystery Bounties Usually Activate In A Multi-Flight Tournament?',
        a: 'Mystery Bounties Almost Always Activate At The Start Of Day 2 (Or Upon Reaching The Money Bubble In Single-Day Events), Never During Day 1 Starting Flights.',
      },
    ],
  },
  {
    slug: 'pot-limit-maximum-bet-calculation-rules',
    title: 'Pot-Limit Maximum Bet Calculation & Pre-Counting Rules',
    h1: 'Pot-Limit Maximum Bet Formula (3x Last Bet + Trail) And Dealer Pot Count Rules',
    category: 'Variant Specific',
    tdaRef: 'TDA Rule 43 & Rule 51 / RROP Section 14: Pot-Limit',
    summary:
      'In Pot-Limit Games (PLO), Any Player In Turn May Ask The Dealer For An Exact Pot Count; The Maximum Pot Raise Equals 3 Times The Facing Bet Plus All Other Chips In The Center Pot And Previous Trail Bets.',
    floorRuling:
      'Under TDA Rule 51 (Pot Size And Pot-Limit Bets), Players In Pot-Limit Games (Unlike No-Limit Games) Are Entitled To Know The Exact Size Of The Pot At Any Time During Their Turn To Act. Saying "Pot" Is A Binding Verbal Declaration To Bet Or Raise The Maximum Legal Pot Amount. To Compute A Pot-Size Raise Rapidly, Dealers Use The Shortcut Formula: Maximum Total Bet = (3 x The Last Bet Facing You) + (All Other Trail Bets On The Current Street) + (The Center Pot From Prior Streets). In Preflop Calculations, The Unposted Portion Of The Small Blind Is Treated As Complete Only If The Small Blind Is The Player Acting; Otherwise, Exact Posted Blinds Are Used.',
    commonScenarios: [
      {
        situation: 'In A 100/200 PLO4 Game, The UTG Player Announces "Pot" First To Act Preflop.',
        ruling: 'Using The 3x Formula: (3 x 200 Big Blind) + 100 Small Blind = 700 Maximum Preflop Open.',
      },
      {
        situation: 'Following UTG\'s 700 Open In The 100/200 Game, UTG+1 Calls 700, And The Cutoff Announces "Pot".',
        ruling: 'Using The 3x Formula: (3 x 700 Facing Bet) + 700 Trail Call + 100 Small Blind + 200 Big Blind = 3,100 Maximum 3-Bet.',
      },
      {
        situation: 'In A No-Limit Hold\'em Game, A Player Asks The Dealer "How Much Is In The Pot?" Before Betting.',
        ruling: 'Under TDA Rule 51B, Dealers Do NOT Count The Center Pot In No-Limit Or Fixed-Limit Games; They Only Spread The Pot Visually So The Player Can Estimate It Themselves.',
      },
    ],
    relatedCalculators: [
      { href: '/tools/pot-odds-calculator', label: 'Pot Odds & MDF Calculator' },
      { href: '/tools/spr-calculator', label: 'SPR & Geometric Sizing Calculator' },
    ],
    relatedTerms: ['pot-odds', 'spr', '3-bet', 'geometric-sizing'],
    faqs: [
      {
        q: 'Can I Announce "Pot" When There Has Been No Bet Yet On The Flop?',
        a: 'Yes. Saying "Pot" Or "Bet The Pot" When First To Act Postflop Is A Binding Bet Equal To 100% Of The Center Pot.',
      },
      {
        q: 'What Happens If I Announce A Specific Number That Exceeds The Legal Pot Limit?',
        a: 'Under TDA Rule 51, If You State An Amount Or Push Out Chips Exceeding The Maximum Legal Pot Bet, Your Wager Is Automatically Reduced Down To The Exact Pot-Limit Maximum.',
      },
    ],
  },
  {
    slug: 'hi-lo-eight-or-better-qualifier-rules',
    title: 'Hi-Lo Split 8-Or-Better Qualifier & Counterfeit Rules',
    h1: 'Hi-Lo Split 8-Or-Better Qualifier Rules, Two-Card Omaha Mandate, And Counterfeiting',
    category: 'Variant Specific',
    tdaRef: 'RROP Section 9 & Section 10: High-Low Split Games',
    summary:
      'In 8-Or-Better Hi-Lo Games (PLO8 And Stud8), The Low Hand Requires Five Unpaired Cards Ranked 8 Or Lower (With Aces Low And Straights/Flushes Ignored For Low); If No Hand Qualifies For Low, The High Hand Scoops 100% Of The Pot.',
    floorRuling:
      'Under Robert\'s Rules Of Poker For High-Low Split 8-Or-Better Games, The Total Pot Is Split 50/50 Between The Best High Hand And The Best Qualifying Low Hand. To Qualify For Low, A Hand Must Contain Five Distinct Unpaired Ranks All 8 Or Lower Using Ace-To-Five (California) Lowball Ranking, Where Aces Count As 1 And Straights And Flushes Do Not Hurt A Low (Making A-2-3-4-5 The "Wheel" - Both The Nut Low And A 5-High Straight). In Omaha Hi-Lo (PLO8 / O8), A Player Must Use Exactly Two Hole Cards And Three Board Cards Independently For Their High Hand And Exactly Two Hole Cards And Three Board Cards For Their Low Hand. If Fewer Than Three Unpaired Cards 8 Or Lower Appear On An Omaha Board, No Low Is Possible.',
    commonScenarios: [
      {
        situation: 'In Omaha Hi-Lo, The Board Runs Out A-2-7-K-Q And A Player Holds 3-4-K-Q.',
        ruling: 'The Player Uses K-Q From Their Hand With A-K-Q On The Board For Two Pair High, And Uses 3-4 From Their Hand With A-2-7 On The Board For A 7-4-3-2-A Nut Low.',
      },
      {
        situation: 'A Player Holds A-2-K-K On A Flop Of 3-5-8, Giving Them The Nut A-2-3-5-8 Low, But The Turn Card Is An Ace (Making The Board 3-5-8-A).',
        ruling: 'The Player\'s Ace In Their Hand Is Now "Counterfeited" By The Board Ace: Because Their Two Hole Cards Can No Longer Supply Both An Unpaired Ace And Deuce To Combine With Three Board Cards, They Only Have A King-High Low (No Qualifier) Unless The River Is Another Low Card.',
      },
      {
        situation: 'Player A Wins The High Hand outright And Also Ties Player B For The Exact Same Nut A-2-3-4-6 Low.',
        ruling: 'Player A Wins The Entire 50% High Half Plus Half Of The 50% Low Half (25%), Winning 75% ("Three-Quartering" Player B, Who Receives Only 25%).',
      },
    ],
    relatedCalculators: [
      { href: '/tools/poker-odds-calculator', label: 'Multiway Poker Odds Calculator' },
      { href: '/tools/side-pot-calculator', label: 'Multi-Way Side Pot Calculator' },
    ],
    relatedTerms: ['equity', 'nut-advantage', 'showdown', 'outs'],
    faqs: [
      {
        q: 'Do I Have To Use The Same Two Hole Cards For Both My High Hand And My Low Hand In Omaha Hi-Lo?',
        a: 'No. You May Use Any Two Of Your Hole Cards With Three Board Cards To Make Your High Hand, And A Completely Different Pair Of Your Hole Cards With Three Board Cards To Make Your Low Hand.',
      },
      {
        q: 'What Is The Worst Possible Qualifying Low Hand In 8-Or-Better?',
        a: 'The Worst Qualifying 8-Or-Better Low Hand Is 8-7-6-5-4 ("Eight-Seven Low"). Any 5-Card Hand Containing A Pair Or A Card Ranked 9 Or Higher Does Not Qualify For Low.',
      },
    ],
  },
  {
    slug: 'short-deck-six-plus-holdem-rules',
    title: 'Short Deck (6+ Hold\'em) Button Blind & Flush Ranking Rules',
    h1: 'Short Deck (6+ Hold\'Em) Official Rules: 36-Card Deck, Flush Beats Full House & A-6-7-8-9 Straight',
    category: 'Variant Specific',
    tdaRef: 'Short Deck 6+ Tournament & Cash Game Standard',
    summary:
      'Short Deck (6+ Hold\'em) Removes All 2s, 3s, 4s, And 5s To Play With A 36-Card Deck Where Aces Play Both High And As A 5 (Making A-6-7-8-9 The Low Straight) And A Flush Beats A Full House.',
    floorRuling:
      'In Official Short Deck (6+ Hold\'em) Rules, All 16 Cards Ranked 2 Through 5 Are Removed From The Standard 52-Card Deck, Leaving 36 Cards (6 Through Ace In All Four Suits). Because Only 9 Cards Of Each Suit Remain In The Deck, Making A Flush Is Mathematically Harder Than Making A Full House, So A Flush Officially Outranks A Full House. Aces Play High (In A-K-Q-J-T Broadway) And Also Substitute For The Missing 5 To Form The Lowest Straight: A-6-7-8-9 (9-High Straight). In Almost All Sanctioned Short Deck Structures, Every Player Posts An Equal Ante And The Dealer Button Posts A Double Ante ("Button Blind"), With Preflop Action Starting Immediately Left Of The Button.',
    commonScenarios: [
      {
        situation: 'At Showdown In Short Deck, Player A Tables A Queen-High Flush And Player B Tables Kings Full Of Tens (Full House).',
        ruling: 'Player A Wins The Entire Pot Because A Flush Always Beats A Full House Under Official Short Deck 6+ Rules.',
      },
      {
        situation: 'The Board Reads 6-7-8-9-K With No Flush Possible, And Player A Holds Ace-Queen.',
        ruling: 'Player A Has A 9-High Straight (A-6-7-8-9) Because The Ace Acts As The Low End Of The 6-7-8-9 Sequence.',
      },
      {
        situation: 'A New Player Asks Whether Three Of A Kind Beats A Straight In Short Deck.',
        ruling: 'In Official WSOP, Triton, And Smarter.Poker Rules, A Straight Still Beats Three Of A Kind (Trips), While A Flush Beats A Full House.',
      },
    ],
    relatedCalculators: [
      { href: '/tools/poker-odds-calculator', label: 'Multiway Poker Odds Calculator' },
      { href: '/tools/pot-odds-calculator', label: 'Pot Odds & MDF Calculator' },
    ],
    relatedTerms: ['equity', 'outs', 'combo', 'blinds'],
    faqs: [
      {
        q: 'What Is The Rule Of 6 And 3 In Short Deck 6+ Hold\'em?',
        a: 'Because Only 31 Unseen Cards Remain On The Flop (And 30 On The Turn) Instead Of 47/46, Each Out Gives Roughly 3.2% Equity Per Street: Multiply Your Outs By 6 On The Flop (All-In) Or By 3 On The Turn To Estimate Equity.',
      },
      {
        q: 'How Does The Button Blind Structure Work In Short Deck?',
        a: 'Instead Of A Small Blind And Big Blind, Every Player Posts 1 Ante Unit And The Player On The Dealer Button Posts An Extra Ante ("Button Blind"). Preflop Action Starts With The Seat Left Of The Button, And The Button Acts Last Both Preflop And Postflop.',
      },
    ],
  },
  {
    slug: 'disputed-pots-and-surveillance-review-rules',
    title: 'Disputed Pots, Floor Rulings & Camera Review Rules',
    h1: 'Disputed Pots, TDA Rule 1 Floor Discretion, And When Cards Speak At Showdown',
    category: 'Showdown & Pot Award',
    tdaRef: 'TDA Rule 1, Rule 12 & Rule 22 / RROP Section 1',
    summary:
      'Cards Speak For Themselves Once Properly Tabled Face Up, And Any Right To Dispute A Pot Calculation Or Hand Reading Ends The Instant The Next Hand Officially Begins.',
    floorRuling:
      'Under TDA Rule 12 (Cards Speak) And Rule 22 (Disputed Hands And Pots), Once A Player Properly Tables Their Hole Cards Face Up At Showdown, The Cards Speak For Themselves: Verbal Misstatements By A Player About Their Hand Strength Do Not Cost Them The Pot, And Every Player And Dealer Has An Ethical Duty To Help Read The True Winning Hand. However, Any Dispute Over A Pot Award, Side Pot Math, Or Misread Board Must Be Raised Before The Next Hand Officially Begins (Which Starts With The First Riffle Of The Shuffle Or First Push Of The Automatic Shuffler Button). Under TDA Rule 1 (Floor Decisions), The Tournament Director Is Empowered To Prioritize Fairness And The Best Interest Of The Game Over Strict Technicalities In Extraordinary Circumstances.',
    commonScenarios: [
      {
        situation: 'At Showdown, Player A Tables Both Cards Face Up Thinking They Only Have A Pair Of Sixes, While Nobody Immediately Notices They Actually Hit A Backdoor Straight. The Dealer Pushes The Pot To Player B\'s Two Pair, But Seat 4 Speaks Up Before The Next Shuffle Starts.',
        ruling: 'Because Player A\'s Cards Were Properly Tabled Face Up And The Next Shuffle Had Not Started, Cards Speak: The Floor Retrieves The Pot From Player B And Awards It To Player A\'s Straight.',
      },
      {
        situation: 'Player A Misreads The Board, Announces "You Win", And Tosses Their Unshown Cards Face Down Into The Muck Without Tabling Them.',
        ruling: 'Cards Only Speak When Tabled Face Up. Because Player A Mucked Face Down Without Showing, They Forfeited All Rights To The Pot.',
      },
      {
        situation: 'Three Minutes And Two Hands Later, A Player Realizes A Side Pot Was Miscounted By 1,000 Chips.',
        ruling: 'Under TDA Rule 22, Once The Next Hand Has Begun, Prior Pot Awards Are Final And Cannot Be Reopened Unless Clear Surveillance Evidence Proves Exact Stack Misappropriation during An Immediate Pause.',
      },
    ],
    relatedCalculators: [
      { href: '/tools/side-pot-calculator', label: 'Multi-Way Side Pot Calculator' },
      { href: '/tools/poker-odds-calculator', label: 'Multiway Poker Odds Calculator' },
    ],
    relatedTerms: ['showdown', 'side-pot', 'dealer-button', 'effective-stack'],
    faqs: [
      {
        q: 'Is It Considered Bad Etiquette Or Against The Rules To Point Out A Winning Tabled Hand?',
        a: 'No. Under TDA Rule 12, Once Hands Are Properly Tabled Face Up At Showdown, Every Player At The Table Is Obligated To Speak Up If The Dealer Is About To Award The Pot To The Wrong Tabled Hand.',
      },
      {
        q: 'When Does A Hand Officially End And The Next Hand Begin?',
        a: 'Under TDA Rule 22, The Next Hand Begins With The First Riffle Of A Manual Shuffle, Or When The Dealer Presses The Green Button On An Automatic Deck Shuffler.',
      },
    ],
  },
];
