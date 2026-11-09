/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  OFFICIAL POKER HAND RANKINGS & TIE-BREAKER CHEAT SHEET (/learn/poker-hand-rankings)
 * ═══════════════════════════════════════════════════════════════════════════════
 * Comprehensive server-rendered #SmarterCasinoRealism reference covering:
 *  - Standard 10-Tier High Hand Rankings (5-card combinatorics out of 2,598,960
 *    and 7-card Hold'em/Stud probabilities out of 133,784,560)
 *  - Short Deck (6+ Hold'em) 36-Card Hand Rankings (Flush beats Full House)
 *  - Pot-Limit Omaha (PLO) Mandatory Two-Hole-Card Rule
 *  - Ace-To-Five (California) vs. Deuce-To-Seven (Kansas City) Lowball Rankings
 *  - Official Split-Pot Tie-Breaker & Kicker Rules
 *
 * Design: #SmarterCasinoRealism (#020608 obsidian, #101a20 gunmetal, #25c8ff cyan,
 * #f2b84b vault gold, borderRadius: '2px').
 * House style: Title Case, zero em dashes.
 */

import React from 'react';
import Link from 'next/link';
import SEOHead from '../../src/components/seo/SEOHead';
import UniversalHeader from '../../src/components/ui/UniversalHeader';
import CitationBacklinkBox from '../../src/components/seo/CitationBacklinkBox';

const PAGE_PATH = '/learn/poker-hand-rankings';
const PAGE_URL = 'https://smarter.poker/learn/poker-hand-rankings';
const PUBLISHED_DATE = '2026-11-09';

const STANDARD_HIGH_HAND_RANKINGS = [
  {
    rank: 1,
    name: 'Royal Flush',
    example: 'As Ks Qs Js Ts',
    definition: 'Ace, King, Queen, Jack, And Ten All Of The Exact Same Suit (The Unbeatable Nut High Hand).',
    combos5Card: '4',
    prob5Card: '0.000154% (649,739 : 1)',
    combos7Card: '4,324',
    prob7Card: '0.00323% (30,939 : 1)',
    tieBreaker: 'All Four Suits Are Equal In Standard Poker; Two Royal Flushes On The Board Split The Pot.',
  },
  {
    rank: 2,
    name: 'Straight Flush',
    example: '9h 8h 7h 6h 5h',
    definition: 'Any Five Consecutive Ranks All Of The Same Suit (From 5-High Steel Wheel Up To King-High).',
    combos5Card: '36',
    prob5Card: '0.001385% (72,192 : 1)',
    combos7Card: '37,260',
    prob7Card: '0.02785% (3,589 : 1)',
    tieBreaker: 'The Straight Flush With The Highest Top Card Wins (Note: In A-2-3-4-5, The 5 Is The Top Card).',
  },
  {
    rank: 3,
    name: 'Four Of A Kind (Quads)',
    example: 'Qd Qh Qc Qs 7d',
    definition: 'All Four Cards Of The Same Numerical Rank Plus One Fifth Side Card (Kicker).',
    combos5Card: '624',
    prob5Card: '0.02401% (4,164 : 1)',
    combos7Card: '224,848',
    prob7Card: '0.1681% (594 : 1)',
    tieBreaker: 'Higher Quad Rank Wins; If Quads Are On The Community Board, Highest Fifth Card (Kicker) Wins.',
  },
  {
    rank: 4,
    name: 'Full House (Boat)',
    example: 'Kd Kh Kc Js Jd',
    definition: 'Three Of A Kind Of One Rank Combined With A Pair Of A Second Rank ("Kings Full Of Jacks").',
    combos5Card: '3,744',
    prob5Card: '0.14406% (693 : 1)',
    combos7Card: '3,473,184',
    prob7Card: '2.5961% (37.5 : 1)',
    tieBreaker: 'Compare The Three-Of-A-Kind Rank First; Only If Both Players Share The Same Trips Does The Pair Break The Tie.',
  },
  {
    rank: 5,
    name: 'Flush',
    example: 'Ad Jd 8d 6d 2d',
    definition: 'Any Five Cards Of The Exact Same Suit That Are Not All In Consecutive Rank Order.',
    combos5Card: '5,108',
    prob5Card: '0.19654% (508 : 1)',
    combos7Card: '4,047,644',
    prob7Card: '3.0255% (32.1 : 1)',
    tieBreaker: 'Compare Highest Flush Card First, Then Second, Third, Fourth, And Fifth Card; Suits Never Break Ties.',
  },
  {
    rank: 6,
    name: 'Straight',
    example: 'Tc 9s 8d 7h 6c',
    definition: 'Five Consecutive Ranks Of Mixed Suits (Aces Can Play High In A-K-Q-J-T Or Low In A-2-3-4-5).',
    combos5Card: '10,200',
    prob5Card: '0.39246% (254 : 1)',
    combos7Card: '6,180,020',
    prob7Card: '4.6194% (20.6 : 1)',
    tieBreaker: 'The Straight With The Highest Top Rank Wins; Identical Top-Rank Straights Always Split The Pot.',
  },
  {
    rank: 7,
    name: 'Three Of A Kind (Set Or Trips)',
    example: '8s 8h 8d Ac 4s',
    definition: 'Three Cards Of The Same Rank Plus Two Unpaired Side Kickers.',
    combos5Card: '54,912',
    prob5Card: '2.11285% (46.3 : 1)',
    combos7Card: '6,461,620',
    prob7Card: '4.8299% (19.7 : 1)',
    tieBreaker: 'Higher Three-Of-A-Kind Rank Wins; If Tied On Board Trips, Compare Highest Fourth Card Then Fifth Card.',
  },
  {
    rank: 8,
    name: 'Two Pair',
    example: 'Ah As 9c 9d Qs',
    definition: 'Two Cards Of One Rank, Two Cards Of A Second Rank, Plus One Fifth Side Card (Kicker).',
    combos5Card: '123,552',
    prob5Card: '4.75390% (20.0 : 1)',
    combos7Card: '31,433,400',
    prob7Card: '23.4955% (3.26 : 1)',
    tieBreaker: 'Compare Highest Pair First, Then Second Pair, And Finally The Single Fifth Kicker Card (Third Pair Never Plays).',
  },
  {
    rank: 9,
    name: 'One Pair',
    example: 'Ks Kc Qd 9h 3s',
    definition: 'Two Cards Of The Same Rank Plus Three Distinct Unpaired Side Kickers.',
    combos5Card: '1,098,240',
    prob5Card: '42.25690% (1.37 : 1)',
    combos7Card: '58,627,800',
    prob7Card: '43.8225% (1.28 : 1)',
    tieBreaker: 'Compare Pair Rank First, Then Highest Kicker, Second Kicker, And Third Kicker In Descending Order.',
  },
  {
    rank: 10,
    name: 'High Card (No Pair)',
    example: 'Ah Qd 9s 6c 3h',
    definition: 'Five Unpaired Cards Of Mixed Suits That Do Not Form A Five-Card Straight.',
    combos5Card: '1,302,540',
    prob5Card: '50.11774% (0.995 : 1)',
    combos7Card: '23,294,460',
    prob7Card: '17.4119% (4.74 : 1)',
    tieBreaker: 'Compare Highest Card Down Through The Fifth Card Until The First Higher Rank Breaks The Tie.',
  },
];

const SHORT_DECK_COMPARISON = [
  {
    rankOrder: '1. Royal Flush & 2. Straight Flush',
    shortDeckCombos: '4 Royal + 32 Straight Flushes (36 Total)',
    shortDeckPct: '0.00955%',
    ruleDifference: 'A-6-7-8-9 Suited Is The Lowest Straight Flush Because Ace Replaces The Removed 5.',
  },
  {
    rankOrder: '3. Four Of A Kind (Quads)',
    shortDeckCombos: '288 Combos',
    shortDeckPct: '0.07639%',
    ruleDifference: 'Outranks Both Flushes And Full Houses Across All 36-Card Rulesets.',
  },
  {
    rankOrder: '4. Flush (BEATS Full House!)',
    shortDeckCombos: '4,104 Combos',
    shortDeckPct: '1.08862%',
    ruleDifference: 'Because Only 9 Cards Per Suit Exist, A Flush Is 3.15x Rarer Than A Full House And Beats It.',
  },
  {
    rankOrder: '5. Full House (Boat)',
    shortDeckCombos: '12,960 Combos',
    shortDeckPct: '3.43774%',
    ruleDifference: 'Loses To A Flush In Short Deck Because Paired Boards Occur Much More Frequently.',
  },
  {
    rankOrder: '6. Straight (Before Trips)',
    shortDeckCombos: '20,444 Combos',
    shortDeckPct: '5.42293%',
    ruleDifference: 'A-6-7-8-9 Is The Lowest 9-High Straight; Beats Three Of A Kind In Official WSOP/Triton Rules.',
  },
  {
    rankOrder: '7. Three Of A Kind -> 8. Two Pair -> 9. One Pair -> 10. High Card',
    shortDeckCombos: '339,160 Combined Combos',
    shortDeckPct: '89.96477%',
    ruleDifference: 'Two Pair (22.9%) And One Pair (49.6%) Make Up Over 72% Of All 5-Card Deals In A 36-Card Deck.',
  },
];

const LOWBALL_SYSTEMS = [
  {
    system: 'Ace-To-Five (California) Lowball',
    gamesUsed: 'Razz, Omaha Hi-Lo 8-Or-Better (PLO8/O8), Seven-Card Stud Hi-Lo (Stud8)',
    aceRule: 'Aces Are Always Low (Count As 1)',
    straightsAndFlushes: 'Ignored Completely (Straights And Flushes Do NOT Hurt Your Low)',
    bestHand: '5-4-3-2-A ("The Wheel" Or "Bicycle") Regardless Of Suit',
    secondBest: '6-4-3-2-A, Then 6-5-3-2-A, Then 6-5-4-2-A, Then 6-5-4-3-A',
  },
  {
    system: 'Deuce-To-Seven (Kansas City) Lowball',
    gamesUsed: '2-7 Triple Draw Lowball, No-Limit 2-7 Single Draw Lowball',
    aceRule: 'Aces Are Strictly HIGH (Above A King; A-2-3-4-5 Is Just Ace-High, Not A Straight)',
    straightsAndFlushes: 'Count Against You! (Straights And Flushes Make Your Low Very Weak)',
    bestHand: '7-5-4-3-2 Not All Of The Same Suit ("Number One" Or "The 2-7 Wheel")',
    secondBest: '7-6-4-3-2 Offsuit, Then 7-6-5-3-2, Then 7-6-5-4-2, Then 8-5-4-3-2',
  },
  {
    system: 'Badugi 4-Card Rainbow Lowball',
    gamesUsed: 'Badugi, Badeucy, Badacy',
    aceRule: 'Aces Are Always Low (Count As 1)',
    straightsAndFlushes: 'Straights Do Not Hurt, But Duplicate Suits Are Eliminated (Must Have 4 Different Suits)',
    bestHand: '4-3-2-A Rainbow (One Spade, One Heart, One Diamond, And One Club)',
    secondBest: '5-3-2-A Rainbow; Every 4-Card Badugi (Even K-Q-J-T Rainbow) Beats Every 3-Card Hand',
  },
];

const HAND_RANKING_FAQS = [
  {
    q: 'Does One Suit Ever Beat Another Suit At Showdown In Texas Hold\'em Or PLO?',
    a: 'No. In Texas Hold\'em, Pot-Limit Omaha, And Short Deck, All Four Suits (Spades, Hearts, Diamonds, Clubs) Have Identical Value At Showdown. Bridge Suit Order Is Only Used For Administrative Procedures Like Drawing For The Button, Chip Races, Or Determining The Stud Third-Street Bring-In.',
  },
  {
    q: 'How Many Cards Play In A Texas Hold\'em Or Seven-Card Stud Hand At Showdown?',
    a: 'Exactly Five Cards! Even Though Seven Total Cards Are Available In Hold\'em And Stud (And Up To Eleven In 6-Card Omaha), Every Showdown Hand Is Strictly The Best Five-Card Combination. A Sixth Or Seventh Card ("Third Pair" Or "Sixth Flush Card") Never Breaks A Tie.',
  },
  {
    q: 'Why Does My Single Ace Of Spades Not Give Me A Flush When Four Spades Are On The Board In PLO?',
    a: 'Because All Omaha Variants (PLO4, PLO5, PLO6, And PLO8) Enforce The Mandatory Two-Hole-Card Rule: You Must Use Exactly Two Cards From Your Hand And Exactly Three Cards From The Board. To Make A Flush In Omaha, You Must Hold At Least Two Cards Of That Suit In Your Hand.',
  },
  {
    q: 'Which Low Hand Wins Between 7-6-2-A-3 And 8-4-3-2-A In Omaha Hi-Lo Or Razz?',
    a: '7-6-3-2-A Wins! Low Hands Are Always Compared Starting From Their Highest ("Top") Card Downward. Because 7 Is Lower Than 8, Any 7-High Low (Even 7-6-5-4-3) Beats Every 8-High Low (Even 8-4-3-2-A).',
  },
];

export default function PokerHandRankingsPage() {
  const jsonLd = [
    {
      '@type': 'Article',
      '@id': `${PAGE_URL}#article`,
      headline: 'Official Poker Hand Rankings & Tie-Breaker Cheat Sheet: High, Short Deck 6+, PLO & Lowball',
      description:
        'Complete Mathematical Reference To The 10 Official Poker Hand Rankings With 5-Card And 7-Card Combinatorics, Short Deck 6+ Rankings, Omaha 2-Card Rules, A-5 Vs. 2-7 Lowball, And Tie-Breaker Rules.',
      datePublished: PUBLISHED_DATE,
      dateModified: PUBLISHED_DATE,
      inLanguage: 'en-US',
      mainEntityOfPage: PAGE_URL,
      author: { '@id': 'https://smarter.poker/#organization' },
      publisher: { '@id': 'https://smarter.poker/#organization' },
      speakable: {
        '@type': 'SpeakableSpecification',
        cssSelector: ['h1', '#hand-rankings-summary'],
      },
    },
    {
      '@type': 'BreadcrumbList',
      '@id': `${PAGE_URL}#breadcrumb`,
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Smarter.Poker', item: 'https://smarter.poker/' },
        { '@type': 'ListItem', position: 2, name: 'Learn Poker Strategy', item: 'https://smarter.poker/learn' },
        { '@type': 'ListItem', position: 3, name: 'Poker Hand Rankings Cheat Sheet', item: PAGE_URL },
      ],
    },
    {
      '@type': 'FAQPage',
      '@id': `${PAGE_URL}#faq`,
      mainEntity: HAND_RANKING_FAQS.map((f) => ({
        '@type': 'Question',
        name: f.q,
        acceptedAnswer: {
          '@type': 'Answer',
          text: f.a,
        },
      })),
    },
  ];

  return (
    <div style={styles.page}>
      <SEOHead
        title="Poker Hand Rankings & Tie-Breaker Guide"
        description="Official 10-Tier Poker Hand Rankings Cheat Sheet With Exact 5-Card And 7-Card Combinatorics, Short Deck 6+ Rankings (Flush Beats Full House), Omaha 2-Card Rules, And Kicker Tie-Breakers."
        canonical={PAGE_PATH}
        markdownUrl="https://smarter.poker/learn/poker-hand-rankings.md"
        jsonLd={jsonLd}
      />

      <UniversalHeader pageDepth={2} />

      <main style={styles.container}>
        <nav aria-label="Breadcrumb" style={styles.breadcrumbs}>
          <Link href="/" style={styles.crumbLink}>
            Smarter.Poker
          </Link>
          <span style={styles.crumbSep}>/</span>
          <Link href="/learn" style={styles.crumbLink}>
            Learn Poker Strategy
          </Link>
          <span style={styles.crumbSep}>/</span>
          <span style={styles.crumbCurrent}>Official Poker Hand Rankings Cheat Sheet</span>
        </nav>

        <header style={styles.heroPlate}>
          <div style={styles.badgeRow}>
            <span style={styles.goldBadge}>OFFICIAL 10-TIER HAND HIERARCHY</span>
            <span style={styles.cyanBadge}>2,598,960 5-CARD &amp; 133,784,560 7-CARD COMBOS</span>
            <a href="/learn/poker-hand-rankings.md" style={styles.mdBadge}>
              RAW MARKDOWN (.MD)
            </a>
          </div>

          <h1 style={styles.h1}>
            Official Poker Hand Rankings &amp; Tie-Breaker Cheat Sheet: High, Short Deck 6+, PLO &amp; Lowball
          </h1>

          <div id="hand-rankings-summary" style={styles.summaryBox}>
            <div style={styles.summaryLabel}>ORDER OF POKER HANDS FROM HIGHEST TO LOWEST</div>
            <p style={styles.summaryText}>
              In Standard 52-Card High Poker (Texas Hold&apos;Em, Pot-Limit Omaha, And Seven-Card Stud), The Ten Official
              Five-Card Hand Rankings From Strongest (#1) To Weakest (#10) Are: (1) Royal Flush, (2) Straight Flush, (3)
              Four Of A Kind, (4) Full House, (5) Flush, (6) Straight, (7) Three Of A Kind, (8) Two Pair, (9) One Pair,
              And (10) High Card.
            </p>
          </div>

          <div style={styles.quickCrossLinks}>
            <Link href="/rules" style={styles.crossBtnGold}>
              30 Official TDA &amp; Cash Floor Rulings
            </Link>
            <Link href="/games" style={styles.crossBtnCyan}>
              15 Poker Variants &amp; Mixed Games
            </Link>
            <Link href="/learn/hands" style={styles.crossBtnOutline}>
              169 Starting Hand Encyclopedia
            </Link>
            <Link href="/tools/poker-odds-calculator" style={styles.crossBtnOutline}>
              Multiway Poker Odds Calculator
            </Link>
          </div>
        </header>

        <section style={styles.sectionPlate}>
          <div style={styles.sectionHeader}>
            <h2 style={styles.h2}>
              1. Standard 52-Card High Hand Rankings &amp; Exact Combinatorics
            </h2>
            <span style={styles.asOfText}>C(52,5) = 2,598,960 | C(52,7) = 133,784,560</span>
          </div>
          <p style={styles.bodyText}>
            Every Standard High Poker Hand Is Evaluated Using The Best Five Cards Available. The Table Below Lists All
            10 Official Tiers Along With Exact 5-Card Deal Combinatorics (Out Of 2,598,960 Hands), 7-Card Showdown
            Combinatorics (Out Of 133,784,560 7-Card Deals In Hold&apos;Em And 7-Card Stud), And Tie-Breaker Rules:
          </p>

          <div style={{ overflowX: 'auto' }}>
            <table style={styles.table}>
              <thead>
                <tr style={styles.trHead}>
                  <th style={styles.th}>Tier</th>
                  <th style={styles.th}>Hand Name &amp; Example</th>
                  <th style={styles.th}>Official Definition</th>
                  <th style={styles.th}>5-Card Combos &amp; Odds</th>
                  <th style={styles.th}>7-Card Combos &amp; Freq</th>
                  <th style={styles.th}>Showdown Tie-Breaker Rule</th>
                </tr>
              </thead>
              <tbody>
                {STANDARD_HIGH_HAND_RANKINGS.map((row) => (
                  <tr key={row.rank} style={styles.trBody}>
                    <td style={styles.tdRankNum}>#{row.rank}</td>
                    <td style={styles.tdName}>
                      <div style={styles.handTitle}>{row.name}</div>
                      <div style={styles.handExample}>{row.example}</div>
                    </td>
                    <td style={styles.tdCell}>{row.definition}</td>
                    <td style={styles.tdMath}>
                      <div style={styles.mathBold}>{row.combos5Card}</div>
                      <div style={styles.mathSub}>{row.prob5Card}</div>
                    </td>
                    <td style={styles.tdMath}>
                      <div style={styles.mathCyan}>{row.combos7Card}</div>
                      <div style={styles.mathSub}>{row.prob7Card}</div>
                    </td>
                    <td style={styles.tdCell}>{row.tieBreaker}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section style={styles.sectionPlate}>
          <div style={styles.sectionHeader}>
            <h2 style={styles.h2}>
              2. Short Deck (6+ Hold&apos;Em) 36-Card Hand Rankings: Why Flush Beats Full House
            </h2>
            <span style={styles.asOfText}>C(36,5) = 376,992 Total 5-Card Hands</span>
          </div>
          <p style={styles.bodyText}>
            In{' '}
            <Link href="/games/short-deck-six-plus" style={styles.inlineLink}>
              Short Deck (6+ Hold&apos;Em)
            </Link>
            , Removing All 2s, 3s, 4s, And 5s Leaves 36 Cards (9 Ranks Across 4 Suits). Because Only 9 Cards Of Each
            Suit Remain In The Deck, There Are Only 4,104 Possible Flushes Compared To 12,960 Full Houses. Consequently,
            A Flush Officially Outranks A Full House, And Aces Substitute For The Missing 5 To Make A-6-7-8-9 The Lowest
            9-High Straight:
          </p>

          <div style={{ overflowX: 'auto' }}>
            <table style={styles.table}>
              <thead>
                <tr style={styles.trHead}>
                  <th style={styles.th}>Short Deck Rank Order</th>
                  <th style={styles.th}>5-Card Combos (Out Of 376,992)</th>
                  <th style={styles.th}>Frequency</th>
                  <th style={styles.th}>Key Rule Adjustment Vs. 52-Card Hold&apos;Em</th>
                </tr>
              </thead>
              <tbody>
                {SHORT_DECK_COMPARISON.map((item) => (
                  <tr key={item.rankOrder} style={styles.trBody}>
                    <td style={styles.tdName}>{item.rankOrder}</td>
                    <td style={styles.tdMath}>{item.shortDeckCombos}</td>
                    <td style={styles.tdRankNum}>{item.shortDeckPct}</td>
                    <td style={styles.tdCell}>{item.ruleDifference}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section style={styles.sectionPlate}>
          <h2 style={styles.h2}>
            3. The Pot-Limit Omaha (PLO) Mandatory Two-Hole-Card Rule
          </h2>
          <p style={styles.bodyText}>
            The Single Most Common Showdown Error Made By Hold&apos;Em Players Transitioning To{' '}
            <Link href="/games/pot-limit-omaha-plo4" style={styles.inlineLink}>
              4-Card PLO (PLO4)
            </Link>
            ,{' '}
            <Link href="/games/five-card-omaha-plo5" style={styles.inlineLink}>
              5-Card PLO (PLO5)
            </Link>
            , Or{' '}
            <Link href="/games/six-card-omaha-plo6" style={styles.inlineLink}>
              6-Card PLO (PLO6)
            </Link>{' '}
            Is Forgetting That Every Player MUST Use Exactly Two Cards From Their Hand And Exactly Three Cards From The
            Community Board:
          </p>
          <div style={styles.omahaGrid}>
            <div style={styles.omahaCard}>
              <div style={styles.omahaLabel}>FOUR-FLUSH BOARD TRAP</div>
              <p style={styles.omahaText}>
                If The Community Board Reads Ks-Ts-7s-2s-4d And You Hold As-Kh-Qd-Jc (Only One Spade In Your Hand), You
                Do NOT Have A Flush! You Must Hold Two Spades In Your Hand To Combine With Three Board Spades.
              </p>
            </div>
            <div style={styles.omahaCard}>
              <div style={styles.omahaLabel}>PAIRED BOARD FULL HOUSE RULE</div>
              <p style={styles.omahaText}>
                If The Board Reads K-K-K-8-2 And You Hold A-Q-J-T (No Pair In Your Hand), You Do NOT Have Kings Full And
                You Do NOT Even Have Trips With Ace-Queen Kickers; You Must Use Two Hole Cards (A-Q) Plus Two Kings And
                One Other Card, Leaving Only One Pair Of Kings!
              </p>
            </div>
            <div style={styles.omahaCard}>
              <div style={styles.omahaLabel}>QUADS IN THE HOLE TRAP</div>
              <p style={styles.omahaText}>
                If You Are Dealt Four Of A Kind In Your Own Hand (Such As 9-9-9-9), You Only Have Pocket Nines! Because
                You Can Only Use Two Of Your Four Nines, You Can Never Make A Set Of Nines Because Zero Nines Remain In
                The Deck.
              </p>
            </div>
          </div>
        </section>

        <section style={styles.sectionPlate}>
          <h2 style={styles.h2}>
            4. Lowball Hand Ranking Systems: Ace-To-Five Vs. Deuce-To-Seven Vs. Badugi
          </h2>
          <p style={styles.bodyText}>
            Mixed-Game Players Must Distinguish Between The Three Official Lowball Evaluation Systems Used In{' '}
            <Link href="/games/horse-and-eight-game-mix" style={styles.inlineLink}>
              H.O.R.S.E. And 8-Game Mix
            </Link>
            :
          </p>

          <div style={{ overflowX: 'auto' }}>
            <table style={styles.table}>
              <thead>
                <tr style={styles.trHead}>
                  <th style={styles.th}>Lowball System</th>
                  <th style={styles.th}>Variants Using System</th>
                  <th style={styles.th}>How Aces Play</th>
                  <th style={styles.th}>Straights &amp; Flushes</th>
                  <th style={styles.th}>#1 Nut Low Hand</th>
                  <th style={styles.th}>#2 Through #5 Lows</th>
                </tr>
              </thead>
              <tbody>
                {LOWBALL_SYSTEMS.map((sys) => (
                  <tr key={sys.system} style={styles.trBody}>
                    <td style={styles.tdName}>{sys.system}</td>
                    <td style={styles.tdCell}>{sys.gamesUsed}</td>
                    <td style={styles.tdMath}>{sys.aceRule}</td>
                    <td style={styles.tdCell}>{sys.straightsAndFlushes}</td>
                    <td style={styles.tdRankNum}>{sys.bestHand}</td>
                    <td style={styles.tdCell}>{sys.secondBest}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section style={styles.sectionPlate}>
          <h2 style={styles.h2}>
            5. Official Split-Pot Tie-Breaker &amp; Kicker Rules
          </h2>
          <div style={styles.tieGrid}>
            <div style={styles.tieCard}>
              <h3 style={styles.tieTitle}>Strictly Five Cards Play (No 6th Kicker)</h3>
              <p style={styles.tieBody}>
                In Hold&apos;Em And Seven-Card Stud, Only The Best Five Cards Count. If The Board Reads A-K-Q-J-2 And
                Player A Holds J-T While Player B Holds J-9, Both Players Have The Exact Same Five-Card Hand (J-J-A-K-Q)
                And Split The Pot 50/50 Because The Sixth Card Never Plays.
              </p>
            </div>
            <div style={styles.tieCard}>
              <h3 style={styles.tieTitle}>Counterfeited Two Pair On Paired Boards</h3>
              <p style={styles.tieBody}>
                If You Hold 6-6 On A Board Of K-K-9-9-A And Your Opponent Holds A-2, Your Pocket Sixes Are Counterfeited!
                Three Pairs Cannot Play In A Five-Card Hand: The Board Plays Kings And Nines With An Ace Kicker
                (K-K-9-9-A), Splitting Or Losing To Anyone With A King, Nine, Or Pocket Aces.
              </p>
            </div>
            <div style={styles.tieCard}>
              <h3 style={styles.tieTitle}>Suits Never Break Ties At Showdown</h3>
              <p style={styles.tieBody}>
                Under{' '}
                <Link href="/rules/odd-chip-rule-split-pots" style={styles.inlineLink}>
                  TDA Rule 20 And {"Robert's"} Rules Of Poker
                </Link>
                , If Two Players Hold Identical Five-Card Straights Or Identical Board Flushes, They Split The Pot. If
                An Indivisible Odd Chip Remains, It Goes To The First Tied Player Left Of The Button In Flop Games.
              </p>
            </div>
          </div>
        </section>

        <section style={styles.crossHubPlate}>
          <h2 style={styles.h2}>Explore Connected Rules, Variants, Starting Hands &amp; Calculators</h2>
          <div style={styles.hubLinkGrid}>
            <Link href="/rules" style={styles.hubCard}>
              <span style={styles.hubCardLabel}>OFFICIAL RULES &amp; RULINGS</span>
              <span style={styles.hubCardTitle}>30 TDA &amp; RROP Floor Rulings: Showdown Order, Odd Chips &amp; Side Pots</span>
            </Link>
            <Link href="/games" style={styles.hubCard}>
              <span style={styles.hubCardLabel}>15 POKER VARIANTS</span>
              <span style={styles.hubCardTitle}>Complete Rulebooks For Hold&apos;Em, PLO4/5/6, Stud, Razz, 2-7 &amp; Badugi</span>
            </Link>
            <Link href="/learn/hands" style={styles.hubCard}>
              <span style={styles.hubCardLabel}>169 STARTING HANDS</span>
              <span style={styles.hubCardTitle}>Texas Hold&apos;Em Starting Hand Encyclopedia &amp; 100BB GTO Matrix</span>
            </Link>
            <Link href="/tools" style={styles.hubCard}>
              <span style={styles.hubCardLabel}>POKER MATH CALCULATORS</span>
              <span style={styles.hubCardTitle}>Multiway Equity, ICM, Side Pot, Pot Odds, SPR &amp; Push/Fold Solvers</span>
            </Link>
          </div>
        </section>

        <section style={styles.sectionPlate}>
          <h2 style={styles.h2}>Frequently Asked Questions On Poker Hand Rankings</h2>
          <div style={styles.faqList}>
            {HAND_RANKING_FAQS.map((item) => (
              <div key={item.q} style={styles.faqItem}>
                <h3 style={styles.faqQ}>{item.q}</h3>
                <p style={styles.faqA}>{item.a}</p>
              </div>
            ))}
          </div>
        </section>

        <CitationBacklinkBox
          title="Official Poker Hand Rankings & Combinatorial Cheat Sheet"
          canonicalUrl={PAGE_URL}
          badgeType="gto"
          badgeLabel="Hand Rankings Reference"
          badgeValue="2,598,960 Exact Combos"
          summary="Complete mathematical breakdown of the 10 standard poker hand rankings, Short Deck 6+ probabilities, Omaha 2-card rules, and lowball systems published by Smarter.Poker."
          slug="poker-hand-rankings-cheat-sheet"
        />

        <p style={styles.complianceFooter}>
          Smarter.Poker Is A Free-To-Play Poker Training, Rules Reference, And Social Community Platform. 18+. Club
          Chips And Diamonds Have No Cash Value.
        </p>
      </main>
    </div>
  );
}

const styles = {
  page: {
    minHeight: '100vh',
    backgroundColor: '#020608',
    color: '#e2e8f0',
    fontFamily: 'var(--font-inter), Inter, system-ui, -apple-system, sans-serif',
  },
  container: {
    maxWidth: '1180px',
    margin: '0 auto',
    padding: '28px 18px 80px',
  },
  breadcrumbs: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: '13px',
    color: '#94a3b8',
    marginBottom: '20px',
    flexWrap: 'wrap',
  },
  crumbLink: {
    color: '#25c8ff',
    textDecoration: 'none',
    fontWeight: 600,
  },
  crumbSep: {
    color: '#475569',
  },
  crumbCurrent: {
    color: '#cbd5e1',
  },
  heroPlate: {
    backgroundColor: '#101a20',
    border: '1px solid rgba(37, 200, 255, 0.28)',
    borderRadius: '2px',
    padding: '28px 26px',
    marginBottom: '24px',
    boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.06), 0 12px 32px rgba(0, 0, 0, 0.55)',
  },
  badgeRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '10px',
    marginBottom: '14px',
  },
  goldBadge: {
    backgroundColor: 'rgba(242, 184, 75, 0.14)',
    border: '1px solid #f2b84b',
    color: '#f2b84b',
    fontSize: '11px',
    fontWeight: 700,
    letterSpacing: '0.08em',
    padding: '4px 10px',
    borderRadius: '2px',
  },
  cyanBadge: {
    backgroundColor: 'rgba(37, 200, 255, 0.12)',
    border: '1px solid #25c8ff',
    color: '#25c8ff',
    fontSize: '11px',
    fontWeight: 700,
    letterSpacing: '0.08em',
    padding: '4px 10px',
    borderRadius: '2px',
  },
  mdBadge: {
    backgroundColor: 'rgba(148, 163, 184, 0.12)',
    border: '1px solid rgba(148, 163, 184, 0.4)',
    color: '#e2e8f0',
    fontSize: '11px',
    fontWeight: 700,
    letterSpacing: '0.06em',
    padding: '4px 10px',
    borderRadius: '2px',
    textDecoration: 'none',
  },
  h1: {
    fontFamily: 'var(--font-orbitron), sans-serif',
    fontSize: 'clamp(23px, 3.5vw, 35px)',
    fontWeight: 800,
    lineHeight: 1.2,
    color: '#ffffff',
    margin: '0 0 16px',
    letterSpacing: '0.02em',
  },
  summaryBox: {
    backgroundColor: '#020608',
    borderLeft: '4px solid #f2b84b',
    borderTop: '1px solid rgba(242, 184, 75, 0.25)',
    borderRight: '1px solid rgba(242, 184, 75, 0.25)',
    borderBottom: '1px solid rgba(242, 184, 75, 0.25)',
    borderRadius: '2px',
    padding: '16px 18px',
    marginBottom: '20px',
  },
  summaryLabel: {
    fontSize: '11px',
    fontWeight: 800,
    color: '#f2b84b',
    letterSpacing: '0.08em',
    marginBottom: '6px',
  },
  summaryText: {
    fontSize: '15.5px',
    lineHeight: 1.65,
    color: '#f8fafc',
    fontWeight: 600,
    margin: 0,
  },
  quickCrossLinks: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '10px',
  },
  crossBtnGold: {
    backgroundColor: '#f2b84b',
    color: '#020608',
    fontWeight: 700,
    fontSize: '13px',
    padding: '9px 14px',
    borderRadius: '2px',
    textDecoration: 'none',
  },
  crossBtnCyan: {
    backgroundColor: '#25c8ff',
    color: '#020608',
    fontWeight: 700,
    fontSize: '13px',
    padding: '9px 14px',
    borderRadius: '2px',
    textDecoration: 'none',
  },
  crossBtnOutline: {
    backgroundColor: '#020608',
    border: '1px solid rgba(37, 200, 255, 0.4)',
    color: '#25c8ff',
    fontWeight: 600,
    fontSize: '13px',
    padding: '8px 14px',
    borderRadius: '2px',
    textDecoration: 'none',
  },
  sectionPlate: {
    backgroundColor: '#101a20',
    border: '1px solid rgba(148, 163, 184, 0.22)',
    borderRadius: '2px',
    padding: '24px',
    marginBottom: '26px',
  },
  sectionHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    flexWrap: 'wrap',
    gap: '10px',
    marginBottom: '12px',
  },
  h2: {
    fontFamily: 'var(--font-orbitron), sans-serif',
    fontSize: 'clamp(18px, 2.4vw, 22px)',
    fontWeight: 700,
    color: '#ffffff',
    margin: '0 0 10px',
    letterSpacing: '0.02em',
  },
  asOfText: {
    fontSize: '12px',
    color: '#f2b84b',
    fontWeight: 700,
  },
  bodyText: {
    fontSize: '14.5px',
    lineHeight: 1.65,
    color: '#cbd5e1',
    margin: '0 0 16px',
  },
  inlineLink: {
    color: '#25c8ff',
    fontWeight: 700,
    textDecoration: 'underline',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: '13px',
  },
  trHead: {
    backgroundColor: '#020608',
    borderBottom: '2px solid #25c8ff',
    textAlign: 'left',
  },
  th: {
    padding: '11px 12px',
    color: '#25c8ff',
    fontWeight: 700,
    fontSize: '11.5px',
    letterSpacing: '0.05em',
    textTransform: 'uppercase',
  },
  trBody: {
    borderBottom: '1px solid rgba(148, 163, 184, 0.14)',
  },
  tdRankNum: {
    padding: '12px',
    color: '#f2b84b',
    fontWeight: 800,
    verticalAlign: 'top',
  },
  tdName: {
    padding: '12px',
    verticalAlign: 'top',
    minWidth: '165px',
    color: '#ffffff',
    fontWeight: 700,
  },
  handTitle: {
    fontSize: '14px',
    fontWeight: 700,
    color: '#ffffff',
    marginBottom: '3px',
  },
  handExample: {
    fontSize: '12px',
    fontWeight: 700,
    color: '#25c8ff',
    fontFamily: 'monospace',
  },
  tdCell: {
    padding: '12px',
    color: '#cbd5e1',
    lineHeight: 1.55,
    verticalAlign: 'top',
  },
  tdMath: {
    padding: '12px',
    verticalAlign: 'top',
    minWidth: '150px',
    color: '#e2e8f0',
    fontWeight: 600,
  },
  mathBold: {
    color: '#f2b84b',
    fontWeight: 700,
    fontSize: '13.5px',
  },
  mathCyan: {
    color: '#25c8ff',
    fontWeight: 700,
    fontSize: '13.5px',
  },
  mathSub: {
    fontSize: '11.5px',
    color: '#94a3b8',
    marginTop: '2px',
  },
  omahaGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
    gap: '14px',
  },
  omahaCard: {
    backgroundColor: '#020608',
    border: '1px solid rgba(242, 184, 75, 0.3)',
    borderRadius: '2px',
    padding: '16px 18px',
  },
  omahaLabel: {
    fontSize: '11.5px',
    fontWeight: 800,
    color: '#f2b84b',
    letterSpacing: '0.07em',
    marginBottom: '6px',
  },
  omahaText: {
    fontSize: '14px',
    lineHeight: 1.6,
    color: '#e2e8f0',
    margin: 0,
  },
  tieGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
    gap: '14px',
  },
  tieCard: {
    backgroundColor: '#020608',
    border: '1px solid rgba(37, 200, 255, 0.25)',
    borderRadius: '2px',
    padding: '16px 18px',
  },
  tieTitle: {
    fontSize: '15px',
    fontWeight: 700,
    color: '#25c8ff',
    margin: '0 0 8px',
  },
  tieBody: {
    fontSize: '13.5px',
    lineHeight: 1.6,
    color: '#cbd5e1',
    margin: 0,
  },
  crossHubPlate: {
    backgroundColor: '#101a20',
    border: '1px solid rgba(242, 184, 75, 0.35)',
    borderRadius: '2px',
    padding: '24px',
    marginBottom: '26px',
  },
  hubLinkGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
    gap: '12px',
    marginTop: '14px',
  },
  hubCard: {
    backgroundColor: '#020608',
    border: '1px solid rgba(37, 200, 255, 0.25)',
    borderRadius: '2px',
    padding: '14px 16px',
    textDecoration: 'none',
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  hubCardLabel: {
    fontSize: '11px',
    fontWeight: 700,
    color: '#f2b84b',
    letterSpacing: '0.07em',
  },
  hubCardTitle: {
    fontSize: '14px',
    fontWeight: 700,
    color: '#25c8ff',
    lineHeight: 1.4,
  },
  faqList: {
    display: 'grid',
    gap: '14px',
    marginTop: '14px',
  },
  faqItem: {
    backgroundColor: '#020608',
    border: '1px solid rgba(148, 163, 184, 0.18)',
    borderRadius: '2px',
    padding: '16px 18px',
  },
  faqQ: {
    fontSize: '15px',
    fontWeight: 700,
    color: '#25c8ff',
    margin: '0 0 8px',
  },
  faqA: {
    fontSize: '14px',
    lineHeight: 1.65,
    color: '#cbd5e1',
    margin: 0,
  },
  complianceFooter: {
    fontSize: '12px',
    color: '#64748b',
    textAlign: 'center',
    marginTop: '32px',
  },
};
