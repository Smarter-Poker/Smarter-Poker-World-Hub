/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  COMPLETE POKER MATH FORMULAS & EQUATIONS REFERENCE HUB (/learn/poker-math)
 * ═══════════════════════════════════════════════════════════════════════════════
 * Evergreen mathematical reference covering 12 foundational poker equations:
 * Pot Odds, Required Equity, Expected Value (EV), Fold Equity, Minimum Defense
 * Frequency (MDF), Alpha (Bluff Breakeven), Bluff-to-Value Ratio, Geometric Bet
 * Sizing, Stack-to-Pot Ratio (SPR), ICM Malmuth-Harville, Risk of Ruin, and
 * Hypergeometric Draw Probability.
 *
 * House style: Title Case, zero em dashes.
 */

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import SEOHead from '../../src/components/seo/SEOHead';
import UniversalHeader from '../../src/components/ui/UniversalHeader';
import CitationBacklinkBox from '../../src/components/seo/CitationBacklinkBox';
import AiPromptLauncher from '../../src/components/seo/AiPromptLauncher';

const POKER_FORMULAS = [
  {
    id: 'pot-odds-required-equity',
    name: '1. Pot Odds & Required Breakeven Equity (%)',
    category: 'Foundational Pot Math',
    equation: 'Required Equity (%) = Call Amount / (Pot Before Call + Bet + Call Amount)',
    shortcut: 'Against A Half-Pot Bet (50%), Required Equity = 0.5 / 2.0 = 25.0%. Against A Full-Pot Bet (100%), Required Equity = 1.0 / 3.0 = 33.33%.',
    workedExample:
      'The Pot Is $100 And Your Opponent Bets $50 (Making The Pot $150 Before Your Action). You Must Call $50 To Win A Total Final Pot Of $200. Required Equity = $50 / $200 = 25.0%. If Your Hand Wins At Least 25% Of The Time, Calling Is +EV.',
    toolHref: '/tools/pot-odds-calculator',
    toolLabel: 'Open Pot Odds Calculator',
  },
  {
    id: 'rule-of-4-and-2',
    name: '2. The Rule Of 4 And 2 (Flop & Turn Draw Equity)',
    category: 'Foundational Pot Math',
    equation: 'Flop Equity (2 Cards To Come) ≈ Outs x 4 | Turn Equity (1 Card To Come) ≈ Outs x 2',
    shortcut: 'A 9-Out Flush Draw Holds ~35% Equity On The Flop (9 x 4 - 1) And 19.6% On The Turn (9 / 46). An 8-Out Open-Ended Straight Draw Holds ~31.5% On The Flop And 17.4% On The Turn.',
    workedExample:
      'You Hold As Ks On A Qs 7s 2d Flop (9 Remaining Spades Out Of 47 Unseen Cards). Using The Rule Of 4: 9 x 4 = 36% Approximate Equity (Exact Combinatoric Equity Is 34.97%). On The Turn With One Card Left: 9 x 2 = 18% (Exact Is 19.57%).',
    toolHref: '/tools/out-to-equity-calculator',
    toolLabel: 'Open Out-To-Equity Calculator',
  },
  {
    id: 'expected-value-ev',
    name: '3. Expected Value (EV) Of Any Call, Bet Or Shove',
    category: 'Expected Value & Fold Equity',
    equation: 'EV = (% Win x $ Won When Winning) - (% Lose x $ Lost When Losing)',
    shortcut: 'Whenever EV > $0.00, The Action Generates Long-Term Profit Regardless Of Single-Hand Variance.',
    workedExample:
      'Your Opponent Shoves $100 Into A $100 Pot On The River (Total Pot $200, Costs $100 To Call). You Estimate Your Bluff-Catcher Wins 40% Of The Time And Loses 60% Of The Time: EV = (0.40 x $200) - (0.60 x $100) = $80 - $60 = +$20.00 Per Call.',
    toolHref: '/tools/ev-calculator',
    toolLabel: 'Open EV Calculator',
  },
  {
    id: 'fold-equity-semi-bluff',
    name: '4. Semi-Bluff All-In EV With Fold Equity',
    category: 'Expected Value & Fold Equity',
    equation: 'Total EV = (Fold % x Current Pot) + (Call % x [(Eq x Final Pot) - Risked Stack])',
    shortcut: 'Combining 35% Fold Equity With 35% Draw Equity When Called Turns Almost Any Semi-Bluff Shove Into A Massive +EV Play.',
    workedExample:
      'There Is $90 In The Pot And You Shove $100 With A Flush Draw (35% Equity When Called). If Villain Folds 45% Of The Time: EV = (0.45 x $90) + 0.55 x [(0.35 x $290) - $100] = $40.50 + 0.55 x ($1.50) = +$41.33.',
    toolHref: '/tools/fold-equity-calculator',
    toolLabel: 'Open Fold Equity Calculator',
  },
  {
    id: 'alpha-bluff-breakeven',
    name: '5. Alpha (α): Pure Bluff Breakeven Percentage',
    category: 'GTO & Solver Equilibrium',
    equation: 'Alpha (α) = Bet Size / (Pot Size + Bet Size)',
    shortcut: 'A 33% Pot Bluff Needs 25.0% Folds; A 50% Pot Bluff Needs 33.3% Folds; A 75% Pot Bluff Needs 42.9% Folds; A 100% Pot Bluff Needs 50.0% Folds.',
    workedExample:
      'You Fire A $75 Pure Bluff With 0% Equity Into A $100 River Pot. Alpha = $75 / ($100 + $75) = 75 / 175 = 42.86%. If Your Opponent Folds More Than 42.86% Of The Time, Your Bluff Prints Immediate Profit.',
    toolHref: '/tools/pot-odds-calculator',
    toolLabel: 'Open Alpha & MDF Solver',
  },
  {
    id: 'minimum-defense-frequency-mdf',
    name: '6. Minimum Defense Frequency (MDF)',
    category: 'GTO & Solver Equilibrium',
    equation: 'MDF (%) = 1 - Alpha = Pot Size / (Pot Size + Bet Size)',
    shortcut: 'Against A 33% Pot Bet, Defend 75.0%; Against A 50% Pot Bet, Defend 66.7%; Against A 100% Pot Bet, Defend 50.0%; Against A 150% Overbet, Defend 40.0%.',
    workedExample:
      'Your Opponent Bets $66 Into A $100 River Pot. MDF = $100 / ($100 + $66) = 60.24%. To Prevent Your Opponent From Profitably Bluffing Any Two Cards, You Must Call Or Raise With At Least 60.24% Of Your Range.',
    toolHref: '/tools/pot-odds-calculator',
    toolLabel: 'Open MDF Calculator',
  },
  {
    id: 'optimal-bluff-to-value-ratio',
    name: '7. Optimal Polarized River Bluff-To-Value Ratio',
    category: 'GTO & Solver Equilibrium',
    equation: 'Bluff Share Of Betting Range = Bet Size / (Pot Size + 2 x Bet Size)',
    shortcut: 'At 50% Pot Sizing: 25% Bluffs / 75% Value (1:3 Ratio). At 75% Pot Sizing: 30% Bluffs / 70% Value. At 100% Pot Sizing: 33.3% Bluffs / 66.7% Value (1:2 Ratio).',
    workedExample:
      'You Bet Full Pot ($100 Into $100) On The River With A Polarized Range. Because Villain Gets 2-To-1 Pot Odds (Needs 33.3% Equity), Your Betting Range Should Contain 1 Bluff Combination For Every 2 Value Combinations (33.3% Bluffs, 66.7% Value) To Make Villain Indifferent.',
    toolHref: '/tools/ev-calculator',
    toolLabel: 'Test Polarized Ranges',
  },
  {
    id: 'stack-to-pot-ratio-spr',
    name: '8. Stack-To-Pot Ratio (SPR)',
    category: 'Multi-Street & Sizing Math',
    equation: 'SPR = Effective Remaining Stack / Flop Pot Size',
    shortcut: 'Low SPR (1 To 3): Commit With Top Pair Or Overpairs. Medium SPR (4 To 8): Two Pair Or Strong Draws. High SPR (9+): Require Sets, Straights, Or Flushes To Stack Off.',
    workedExample:
      'In A 100BB ($300) Cash Game, A Player Opens To $12, Gets 3-Bet To $40, And Calls. The Flop Pot Is $84 And Both Players Have $260 Remaining Behind. SPR = $260 / $84 = 3.10, Making Overpairs (QQ+) Automatic Stack-Offs.',
    toolHref: '/tools/spr-calculator',
    toolLabel: 'Open SPR Calculator',
  },
  {
    id: 'geometric-bet-sizing',
    name: '9. Geometric Bet Sizing (Multi-Street All-In Growth)',
    category: 'Multi-Street & Sizing Math',
    equation: 'Geometric Bet Fraction (b) = [((2 x SPR + 1)^(1 / N)) - 1] / 2',
    shortcut: 'At SPR 4 Across 3 Streets (N = 3): Bet 54.3% Pot On Flop, Turn, And River. At SPR 13 Across 3 Streets: Bet 100% Pot On Flop, Turn, And River.',
    workedExample:
      'You Reach The Turn With $100 In The Pot And $275 Effective Stacks Remaining (Turn SPR = 2.75) And Want To Bet The Exact Same Percentage On Turn And River (N = 2 Streets). Using The Formula: ((2 x 2.75 + 1)^0.5 - 1) / 2 = (2.5495 - 1) / 2 = 77.5% Pot On Both Turn And River.',
    toolHref: '/tools/geometric-bet-calculator',
    toolLabel: 'Open Geometric Bet Calculator',
  },
  {
    id: 'icm-malmuth-harville',
    name: '10. Independent Chip Model (ICM Malmuth-Harville Equation)',
    category: 'Tournament & Bankroll Math',
    equation: 'P(Player i Finishes 1st) = Chips_i / Total_Chips | P(i = 2nd | j = 1st) = Chips_i / (Total_Chips - Chips_j)',
    shortcut: 'In Tournaments, Doubling Your Chip Stack Always Less Than Doubles Your Real-Dollar ($EV) Equity Because First-Place Prize Money Is Capped.',
    workedExample:
      'Three Players Remain For Prizes Of $500 / $300 / $200 ($1,000 Total) With Chip Counts Of 5,000 (50%), 3,000 (30%), And 2,000 (20%). The Chip Leader Holds 50% Of The Chips, Yet His Exact ICM Equity Is $383.33 (38.3% Of The Prize Pool), Not $500.',
    toolHref: '/tools/icm-calculator',
    toolLabel: 'Open ICM Payout Calculator',
  },
  {
    id: 'risk-of-ruin-bankroll',
    name: '11. Risk Of Ruin & Required Bankroll Equation',
    category: 'Tournament & Bankroll Math',
    equation: 'Risk Of Ruin (RoR) = exp( (-2 x Winrate x Bankroll) / (StdDev^2) )',
    shortcut: 'Doubling Your Winrate Cuts Your Required Bankroll For A 1% Risk Of Ruin In Half; Doubling Your Standard Deviation Quadruples Your Required Bankroll.',
    workedExample:
      'A 6-Max Cash Player Wins +5 BB/100 With A Standard Deviation Of 85 BB/100. With A 2,500 BB Bankroll (25 Buy-Ins), Risk Of Ruin = exp((-2 x 5 x 2500) / (100 x 7225 / 100)) = exp(-3.46) = 3.14%. Increasing To 35 Buy-Ins Drops RoR Below 0.8%.',
    toolHref: '/tools/bankroll-calculator',
    toolLabel: 'Open Bankroll & RoR Calculator',
  },
  {
    id: 'hypergeometric-combinatorics',
    name: '12. Hypergeometric Combinatorics & Card Removal',
    category: 'Foundational Pot Math',
    equation: 'C(n, k) = n! / [k! x (n - k)!] | Total Hold\'em Starting Combos = C(52, 2) = 1,326',
    shortcut: 'Each Pocket Pair Has 6 Combos; Each Suited Hand Has 4 Combos; Each Offsuit Hand Has 12 Combos (16 Total For Any Unpaired Hand). Holding One Blocker Cuts Pocket Pair Combos By 50% (From 6 To 3).',
    workedExample:
      'Normally There Are C(4, 2) = 6 Combinations Of Pocket Aces (AA) And 4 x 4 = 16 Combinations Of Ace-King. If You Hold The Ace Of Spades (As) In Your Hand, Only C(3, 2) = 3 Combinations Of AA And 3 x 4 = 12 Combinations Of AK Remain Possible.',
    toolHref: '/tools/poker-odds-calculator',
    toolLabel: 'Open Combinatorics & Odds Tool',
  },
];

const MATH_FAQS = [
  {
    q: 'What Are The Only Three Poker Math Formulas Every Live Player Must Memorize At The Table?',
    a: 'At A Live Table Without Calculators, Memorize: (1) Pot Odds Breakeven Equity = Call / (Pot + Bet + Call), (2) The Rule Of 4 And 2 (Multiply Outs By 4 On The Flop Or By 2 On The Turn), And (3) Minimum Defense Frequency = Pot / (Pot + Bet).',
  },
  {
    q: 'How Accurate Is The Rule Of 4 And 2 Compared To Exact Combinatorics?',
    a: 'For Draws With 8 Or Fewer Outs, The Rule Of 4 And 2 Is Accurate Within 1.0% Of Exact Hypergeometric Probability. Once You Have 12 To 15+ Outs (Like A Flush Draw Plus Open-Ended Straight Draw), Subtract 2% To 3% From The Flop Rule Of 4 Estimate (For 15 Outs: 15 x 4 - 6 = 54.1% Exact).',
  },
  {
    q: 'Why Does Holding One Ace Reduce Your Opponent\'s Pocket Aces Combos By 50%?',
    a: 'Four Aces Form Exactly C(4,2) = 6 Two-Card Combinations. Removing Just One Ace Leaves Three Aces In The Deck, Which Can Only Form C(3,2) = 3 Two-Card Combinations, Cutting Pocket Aces In Half.',
  },
  {
    q: 'Where Can I Practice All 12 Poker Math Equations Interactively?',
    a: 'Every Equation On This Page Links Directly To Its Free Interactive Calculator Inside The Smarter.Poker 24-Tool Suite At /tools.',
  },
];

export default function PokerMathReferencePage() {
  const [potSize, setPotSize] = useState(100);
  const [betSize, setBetSize] = useState(50);
  const [outs, setOuts] = useState(9);

  const liveMath = useMemo(() => {
    const p = Math.max(1, Number(potSize) || 100);
    const b = Math.max(1, Number(betSize) || 50);
    const o = Math.min(22, Math.max(1, Number(outs) || 9));

    const reqEquity = (b / (p + b + b)) * 100;
    const alpha = (b / (p + b)) * 100;
    const mdf = (p / (p + b)) * 100;
    const turnDrawEq = (o / 46) * 100;
    const flopDrawEq = (1 - ((47 - o) / 47) * ((46 - o) / 46)) * 100;

    return {
      reqEquity,
      alpha,
      mdf,
      turnDrawEq,
      flopDrawEq,
    };
  }, [potSize, betSize, outs]);

  const canonicalPath = '/learn/poker-math';
  const canonicalUrl = `https://smarter.poker${canonicalPath}`;

  const jsonLd = [
    {
      '@type': 'Article',
      '@id': `${canonicalUrl}#article`,
      headline: 'Complete Poker Math Formulas & Equations Reference Hub',
      name: 'Complete Poker Math Formulas & Equations Reference Hub',
      description:
        'Master All 12 Core Poker Math Equations: Pot Odds, Rule Of 4 And 2, Expected Value (EV), Fold Equity, MDF, Alpha, Bluff-To-Value Ratio, Geometric Sizing, SPR, ICM, And Risk Of Ruin.',
      url: canonicalUrl,
      inLanguage: 'en-US',
      datePublished: '2026-11-10',
      dateModified: '2026-11-10',
      isAccessibleForFree: true,
      author: { '@id': 'https://smarter.poker/#organization' },
      publisher: { '@id': 'https://smarter.poker/#organization' },
      speakable: {
        '@type': 'SpeakableSpecification',
        cssSelector: ['h1', 'header p:first-of-type'],
      },
    },
    {
      '@type': 'FAQPage',
      '@id': `${canonicalUrl}#faq`,
      mainEntity: MATH_FAQS.map((f) => ({
        '@type': 'Question',
        name: f.q,
        acceptedAnswer: {
          '@type': 'Answer',
          text: f.a,
        },
      })),
    },
    {
      '@type': 'BreadcrumbList',
      '@id': `${canonicalUrl}#breadcrumb`,
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Smarter.Poker', item: 'https://smarter.poker/' },
        { '@type': 'ListItem', position: 2, name: 'Learn Poker', item: 'https://smarter.poker/learn' },
        { '@type': 'ListItem', position: 3, name: 'Complete Poker Math Formulas', item: canonicalUrl },
      ],
    },
  ];

  return (
    <div style={styles.page}>
      <SEOHead
        title="Complete Poker Math Formulas & Equations Reference Guide"
        description="Master All 12 Core Poker Math Equations: Pot Odds, Rule Of 4 And 2, Expected Value (EV), Fold Equity, MDF, Alpha, Bluff-To-Value Ratio, Geometric Sizing, SPR, ICM, And Risk Of Ruin."
        canonical={canonicalPath}
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
            Learn Poker
          </Link>
          <span style={styles.crumbSep}>/</span>
          <span style={styles.crumbCurrent}>Poker Math Formulas Reference</span>
        </nav>

        <header style={styles.heroPlate}>
          <div style={styles.badgeRow}>
            <span style={styles.cyanBadge}>12 CANONICAL POKER EQUATIONS</span>
            <span style={styles.emeraldBadge}>INCLUDES LIVE POT ODDS, MDF &amp; OUTS WIDGET</span>
          </div>

          <h1 style={styles.h1}>
            Complete Poker Math Formulas &amp; Equations Reference: Pot Odds, EV, MDF, SPR &amp; ICM
          </h1>

          <p style={styles.lead}>
            <strong>Direct Mathematical Summary:</strong> Every Profitable Poker Decision Rests On Twelve Exact Equations:
            <strong> Pot Odds Required Equity = Call / (Pot + Bet + Call)</strong>,
            <strong> Minimum Defense Frequency = Pot / (Pot + Bet)</strong>,
            <strong> Pure Bluff Alpha = Bet / (Pot + Bet)</strong>, And
            <strong> The Rule Of 4 And 2 For Draw Outs</strong>.
            Use The Live Instant-Math Widget Below And Explore All 12 Worked Equations With Direct Links To Their Calculators.
          </p>

          <div style={styles.quickCrossLinks}>
            <Link href="/tools" style={styles.crossBtnCyan}>
              All 24 Free Poker Calculators
            </Link>
            <Link href="/tools/pot-odds-calculator" style={styles.crossBtnEmerald}>
              Pot Odds &amp; MDF Calculator
            </Link>
            <Link href="/learn/cheat-sheets" style={styles.crossBtnOutline}>
              Printable Poker Cheat Sheets
            </Link>
            <Link href="/learn/matchups" style={styles.crossBtnOutline}>
              25 All-In Hand Matchups
            </Link>
            <Link href="/learn/positions" style={styles.crossBtnOutline}>
              9-Seat Position Encyclopedia
            </Link>
          </div>
        </header>

        {/* Interactive Instant Poker Math Sandbox */}
        <section aria-label="Interactive Instant Poker Math Calculator" style={styles.sectionPlate}>
          <div style={styles.sectionHeader}>
            <h2 style={styles.h2}>Interactive Instant Pot Odds, MDF, Alpha &amp; Draw Equity Sandbox</h2>
            <span style={styles.calcBadge}>REAL-TIME EQUATION SOLVER</span>
          </div>

          <div style={styles.calcInputGrid}>
            <div style={styles.inputGroup}>
              <label htmlFor="math-pot" style={styles.inputLabel}>
                Pot Size Before Bet ($ Or BB)
              </label>
              <input
                id="math-pot"
                type="number"
                min="1"
                value={potSize}
                onChange={(e) => setPotSize(e.target.value)}
                style={styles.numInput}
              />
            </div>

            <div style={styles.inputGroup}>
              <label htmlFor="math-bet" style={styles.inputLabel}>
                Bet / Call Size ($ Or BB)
              </label>
              <input
                id="math-bet"
                type="number"
                min="1"
                value={betSize}
                onChange={(e) => setBetSize(e.target.value)}
                style={styles.numInput}
              />
            </div>

            <div style={styles.inputGroup}>
              <label htmlFor="math-outs" style={styles.inputLabel}>
                Clean Draw Outs (1 To 20)
              </label>
              <input
                id="math-outs"
                type="number"
                min="1"
                max="20"
                value={outs}
                onChange={(e) => setOuts(e.target.value)}
                style={styles.numInput}
              />
            </div>
          </div>

          <div style={styles.calcOutputGrid}>
            <div style={styles.outputCard}>
              <div style={styles.outputLabel}>Required Call Equity</div>
              <div style={styles.outputValueCyan}>{liveMath.reqEquity.toFixed(2)}%</div>
              <div style={styles.outputSub}>Call / (Pot + Bet + Call)</div>
            </div>
            <div style={styles.outputCard}>
              <div style={styles.outputLabel}>Minimum Defense (MDF)</div>
              <div style={styles.outputValueEmerald}>{liveMath.mdf.toFixed(2)}%</div>
              <div style={styles.outputSub}>Pot / (Pot + Bet)</div>
            </div>
            <div style={styles.outputCard}>
              <div style={styles.outputLabel}>Bluff Breakeven (Alpha)</div>
              <div style={styles.outputValueCyan}>{liveMath.alpha.toFixed(2)}%</div>
              <div style={styles.outputSub}>Bet / (Pot + Bet)</div>
            </div>
            <div style={styles.outputCard}>
              <div style={styles.outputLabel}>Exact Flop / Turn Draw %</div>
              <div style={styles.outputValueEmerald}>
                {liveMath.flopDrawEq.toFixed(1)}% / {liveMath.turnDrawEq.toFixed(1)}%
              </div>
              <div style={styles.outputSub}>Flop (2 Cards) / Turn (1 Card)</div>
            </div>
          </div>
        </section>

        {/* All 12 Formulas */}
        <section aria-label="Twelve Core Poker Math Formulas" style={styles.sectionPlate}>
          <h2 style={styles.h2}>All 12 Essential Poker Math Formulas, Shortcuts &amp; Worked Examples</h2>
          <div style={styles.formulaGrid}>
            {POKER_FORMULAS.map((f) => (
              <article key={f.id} style={styles.formulaCard}>
                <div style={styles.formulaTop}>
                  <span style={styles.formulaCat}>{f.category}</span>
                  <Link href={f.toolHref} style={styles.formulaToolBtn}>
                    {f.toolLabel}
                  </Link>
                </div>

                <h3 style={styles.h3}>{f.name}</h3>

                <div style={styles.equationBox}>
                  <code>{f.equation}</code>
                </div>

                <p style={styles.shortcutText}>
                  <strong>Table Shortcut:</strong> {f.shortcut}
                </p>

                <p style={styles.exampleText}>
                  <strong>Worked Example:</strong> {f.workedExample}
                </p>
              </article>
            ))}
          </div>
        </section>

        {/* FAQs */}
        <section aria-label="Frequently Asked Questions" style={styles.sectionPlate}>
          <h2 style={styles.h2}>Frequently Asked Questions On Poker Mathematics</h2>
          <div style={styles.faqList}>
            {MATH_FAQS.map((item) => (
              <div key={item.q} style={styles.faqItem}>
                <h3 style={styles.faqQ}>{item.q}</h3>
                <p style={styles.faqA}>{item.a}</p>
              </div>
            ))}
          </div>
        </section>

        <CitationBacklinkBox
          title="Complete Poker Math Formulas & Equations Reference Hub"
          canonicalUrl={canonicalUrl}
          badgeType="gto"
          badgeLabel="12 Core Equations"
          badgeValue="Pot Odds, EV, MDF & ICM"
          summary="Master All 12 Core Poker Math Equations: Pot Odds, Rule Of 4 And 2, Expected Value (EV), Fold Equity, MDF, Alpha, Bluff-To-Value Ratio, Geometric Sizing, SPR, ICM, And Risk Of Ruin."
          publishedYear="2026"
          slug="complete-poker-math-formulas-reference"
        />

        <AiPromptLauncher
          title="Complete Poker Math Formulas & Equations Reference Hub"
          canonicalUrl={canonicalUrl}
          canonicalPath={canonicalPath}
          markdownUrl="/learn/poker-math.md"
        />
      </main>
    </div>
  );
}

const styles = {
  page: {
    minHeight: '100vh',
    backgroundColor: '#0a0f18',
    color: '#e2e8f0',
    fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
  },
  container: {
    maxWidth: '1140px',
    margin: '0 auto',
    padding: '28px 20px 80px',
  },
  breadcrumbs: {
    display: 'flex',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: '8px',
    fontSize: '13px',
    color: '#94a3b8',
    marginBottom: '20px',
  },
  crumbLink: {
    color: '#00d4ff',
    textDecoration: 'none',
    fontWeight: 600,
  },
  crumbSep: {
    color: '#475569',
  },
  crumbCurrent: {
    color: '#e2e8f0',
    fontWeight: 600,
  },
  heroPlate: {
    backgroundColor: '#111a2a',
    border: '1px solid #1e293b',
    borderRadius: '8px',
    padding: '28px',
    marginBottom: '24px',
  },
  badgeRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '10px',
    marginBottom: '14px',
  },
  cyanBadge: {
    backgroundColor: 'rgba(0, 212, 255, 0.12)',
    border: '1px solid #00d4ff',
    color: '#00d4ff',
    fontSize: '11px',
    fontWeight: 700,
    padding: '4px 10px',
    borderRadius: '4px',
    letterSpacing: '0.06em',
  },
  emeraldBadge: {
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    border: '1px solid #10b981',
    color: '#10b981',
    fontSize: '11px',
    fontWeight: 700,
    padding: '4px 10px',
    borderRadius: '4px',
    letterSpacing: '0.06em',
  },
  h1: {
    fontSize: '31px',
    fontWeight: 800,
    color: '#f8fafc',
    margin: '0 0 14px',
    lineHeight: 1.2,
  },
  lead: {
    fontSize: '15.5px',
    lineHeight: 1.65,
    color: '#cbd5e1',
    margin: '0 0 22px',
  },
  quickCrossLinks: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '10px',
  },
  crossBtnCyan: {
    backgroundColor: '#00d4ff',
    color: '#0a0f18',
    fontWeight: 700,
    fontSize: '13px',
    padding: '9px 16px',
    borderRadius: '6px',
    textDecoration: 'none',
  },
  crossBtnEmerald: {
    backgroundColor: '#10b981',
    color: '#0a0f18',
    fontWeight: 700,
    fontSize: '13px',
    padding: '9px 16px',
    borderRadius: '6px',
    textDecoration: 'none',
  },
  crossBtnOutline: {
    backgroundColor: '#0a0f18',
    border: '1px solid #1e293b',
    color: '#e2e8f0',
    fontWeight: 600,
    fontSize: '13px',
    padding: '9px 16px',
    borderRadius: '6px',
    textDecoration: 'none',
  },
  sectionPlate: {
    backgroundColor: '#111a2a',
    border: '1px solid #1e293b',
    borderRadius: '8px',
    padding: '24px',
    marginBottom: '26px',
  },
  sectionHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: '10px',
    marginBottom: '16px',
  },
  h2: {
    fontSize: '21px',
    fontWeight: 800,
    color: '#f8fafc',
    margin: 0,
  },
  calcBadge: {
    fontSize: '11px',
    fontWeight: 700,
    color: '#10b981',
    border: '1px solid #10b981',
    padding: '4px 10px',
    borderRadius: '4px',
  },
  calcInputGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
    gap: '14px',
    marginBottom: '18px',
  },
  inputGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  inputLabel: {
    fontSize: '12px',
    fontWeight: 700,
    color: '#00d4ff',
  },
  numInput: {
    backgroundColor: '#0a0f18',
    border: '1px solid #1e293b',
    borderRadius: '6px',
    padding: '10px 12px',
    color: '#f8fafc',
    fontSize: '15px',
    fontWeight: 700,
  },
  calcOutputGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
    gap: '14px',
  },
  outputCard: {
    backgroundColor: '#0a0f18',
    border: '1px solid #1e293b',
    borderRadius: '6px',
    padding: '16px',
  },
  outputLabel: {
    fontSize: '12px',
    fontWeight: 700,
    color: '#94a3b8',
    textTransform: 'uppercase',
    marginBottom: '6px',
  },
  outputValueCyan: {
    fontSize: '23px',
    fontWeight: 800,
    color: '#00d4ff',
  },
  outputValueEmerald: {
    fontSize: '23px',
    fontWeight: 800,
    color: '#10b981',
  },
  outputSub: {
    fontSize: '12px',
    color: '#cbd5e1',
    marginTop: '4px',
  },
  formulaGrid: {
    display: 'grid',
    gap: '16px',
    marginTop: '16px',
  },
  formulaCard: {
    backgroundColor: '#0a0f18',
    border: '1px solid #1e293b',
    borderRadius: '6px',
    padding: '20px',
  },
  formulaTop: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: '10px',
    marginBottom: '8px',
  },
  formulaCat: {
    fontSize: '11px',
    fontWeight: 700,
    color: '#00d4ff',
    letterSpacing: '0.05em',
    textTransform: 'uppercase',
  },
  formulaToolBtn: {
    fontSize: '12px',
    fontWeight: 700,
    color: '#10b981',
    textDecoration: 'none',
    border: '1px solid #10b981',
    padding: '5px 12px',
    borderRadius: '4px',
  },
  h3: {
    fontSize: '18px',
    fontWeight: 700,
    color: '#f8fafc',
    margin: '0 0 10px',
  },
  equationBox: {
    backgroundColor: '#111a2a',
    border: '1px solid #00d4ff',
    borderRadius: '6px',
    padding: '12px 14px',
    color: '#00d4ff',
    fontWeight: 700,
    fontSize: '14px',
    marginBottom: '12px',
    overflowX: 'auto',
  },
  shortcutText: {
    fontSize: '13.5px',
    lineHeight: 1.6,
    color: '#10b981',
    margin: '0 0 8px',
  },
  exampleText: {
    fontSize: '13.5px',
    lineHeight: 1.6,
    color: '#cbd5e1',
    margin: 0,
  },
  faqList: {
    display: 'grid',
    gap: '14px',
    marginTop: '14px',
  },
  faqItem: {
    backgroundColor: '#0a0f18',
    border: '1px solid #1e293b',
    borderRadius: '6px',
    padding: '16px',
  },
  faqQ: {
    fontSize: '15.5px',
    fontWeight: 700,
    color: '#00d4ff',
    margin: '0 0 8px',
  },
  faqA: {
    fontSize: '14px',
    lineHeight: 1.6,
    color: '#cbd5e1',
    margin: 0,
  },
};
