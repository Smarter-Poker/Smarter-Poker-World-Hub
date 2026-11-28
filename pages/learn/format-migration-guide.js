/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  POKER FORMAT TRANSITION & MIGRATION BLUEPRINT (/learn/format-migration-guide)
 * ═══════════════════════════════════════════════════════════════════════════════
 * Interactive comparison matrix and transition playbook for players migrating
 * between Live Full-Ring Cash <-> Online 6-Max Cash <-> Multi-Table Tournaments
 * (MTTs) <-> Pot-Limit Omaha (PLO4/PLO5), covering mathematical adjustments for
 * rake, antes, ICM, stack depth, and equity realization.
 *
 * House style: Title Case, zero em dashes.
 */

import React, { useState } from 'react';
import Link from 'next/link';
import SEOHead from '../../src/components/seo/SEOHead';
import UniversalHeader from '../../src/components/ui/UniversalHeader';
import HubPageSummary from '../../src/components/seo/HubPageSummary';
import GeoCitationCapsule, { geoClaimSchema } from '../../src/components/seo/GeoCitationCapsule';
import GeoFollowUpChain from '../../src/components/seo/GeoFollowUpChain';
import CitationBacklinkBox from '../../src/components/seo/CitationBacklinkBox';
import AiPromptLauncher from '../../src/components/seo/AiPromptLauncher';
import SmarterAccountUnlockGate from '../../src/components/seo/SmarterAccountUnlockGate';

export const FORMAT_PROFILES = [
  {
    id: 'live-cash',
    name: 'Live Full-Ring Cash (9-Max $1/$3 To $5/$10)',
    openSizing: '4.0x To 5.0x BB (+1BB Per Limper)',
    rakeAndAnte: '10% Up To $5-$7 Drop + $2 Promo (Zero Antes)',
    stackDepth: '100BB To 300BB+ Deep',
    bubbleFactor: '1.00 (Linear Chip EV = Dollar EV)',
    stdDevBb100: '75 - 95 BB/100 (28-32 Hands/Hour)',
    bankrollRequirement: '20 - 35 Buy-Ins (2,000 - 3,500 BB)',
  },
  {
    id: 'online-6max',
    name: 'Online 6-Max Cash (100BB Fast-Fold & Reg Tables)',
    openSizing: '2.2x To 2.5x BB (3.0x From Small Blind)',
    rakeAndAnte: '4.5% - 5.0% Capped At 1.5BB - 3.0BB (Zero Antes)',
    stackDepth: '100BB Auto-Top-Up Baseline',
    bubbleFactor: '1.00 (Linear Chip EV = Dollar EV)',
    stdDevBb100: '80 - 105 BB/100 (75-250 Hands/HourPer Table)',
    bankrollRequirement: '35 - 50 Buy-Ins (3,500 - 5,000 BB)',
  },
  {
    id: 'mtt-tournaments',
    name: 'Multi-Table Tournaments (MTTs With 1BB Ante)',
    openSizing: '2.0x To 2.3x BB (1.0x Limp Mixing At Shallow Stacks)',
    rakeAndAnte: 'Zero Postflop Pot Drop + 1.0BB Big Blind Ante Every Hand',
    stackDepth: '12BB To 50BB Dynamic Compression',
    bubbleFactor: '1.05 To 2.45 (Malmuth-Harville ICM & Bounty Distortion)',
    stdDevBb100: 'High Finish Variance (ROI Standard Deviation 250%+)',
    bankrollRequirement: '100 - 200 Average Buy-Ins (ABI)',
  },
  {
    id: 'plo-omaha',
    name: 'Pot-Limit Omaha (PLO4 & PLO5 Cash Games)',
    openSizing: 'Pot-Size Raise (3.5BB Open; 3x + Trail + Center Pot)',
    rakeAndAnte: '5% - 10% Capped At $5-$10 (Often With Straddles & Bomb Pots)',
    stackDepth: '100BB To 250BB (Low Postflop SPR Due To Pot-Limit Escalation)',
    bubbleFactor: '1.00 (High Equity Compression: 60/40 Preflop Maximum)',
    stdDevBb100: '130 - 165 BB/100 (2.5x Higher Variance Than Holdem)',
    bankrollRequirement: '50 - 80 Buy-Ins (5,000 - 8,000 BB)',
  },
];

export const TRANSITION_PLAYBOOKS = [
  {
    key: 'live-cash-to-online-6max',
    title: 'Transition 1: Live Full-Ring Cash -> Online 6-Max Cash',
    fromFormat: 'Live Full-Ring Cash',
    toFormat: 'Online 6-Max Cash',
    shockFactor: 'Speed (3x Faster Per Table), Compact 2.2x Sizing, And Aggressive 3-Bet/4-Bet Frequency',
    adjustments: [
      'Drop Live 4x-5x Open Sizes Down To 2.2x-2.5x: Opening 4x Online Against 6-Max Regulars Risks Nearly Double The Chips To Steal The Same 1.5BB Blinds And Gets Punished By 10% 3-Bet Frequencies.',
      'Eliminate Open-Limping And Cold-Calling 3-Bets OOP: Online 6-Max Regulars Squeeze Multiway Callers At 12%+ Frequency. Play A Strict 3-Bet-Or-Fold Strategy From The Small Blind And Cutoff.',
      'Defend Against Polarized Turn & River Overbets: Online Regulars Use 125%-150% Geometric Overbets With Balanced Bluffs, Whereas Live 150% Bets Are Almost Exclusively The Nuts.',
      'Remove UTG/UTG+1 Tightness Bias: In 6-Max, The First Seat To Act (Lojack/UTG) Is Equivalent To Middle Position In A 9-Handed Live Game (Open 16.5% Of Hands Instead Of 10%).',
    ],
    ifThenBecause:
      'If Moving From Live 9-Handed Cash To Online 6-Max -> Then Cut Open Sizing From 4.5x Down To 2.3x And Double Your 3-Bet Frequency From 4% To 9.5% -> Because Lower Online Rake Caps And 6-Handed Blind Velocity Demand Aggressive Pre-Flop Contesting.',
    calculatorHref: '/tools/preflop-ranges',
    calculatorName: '100BB 6-Max Preflop Range Matrix',
  },
  {
    key: 'cash-to-mtt-tournaments',
    title: 'Transition 2: 100BB Cash Games -> Multi-Table Tournaments (MTTs)',
    fromFormat: '100BB Cash Games',
    toFormat: 'MTT Tournaments',
    shockFactor: 'Big Blind Antes (2.5BB Dead Money), 15BB-35BB Shallow Stacks, And ICM Bubble Factors',
    adjustments: [
      'Widen Big Blind Defense Dramatically Due To Zero Rake + 1BB Ante: Facing A 2.0x Min-Open In An MTT With A 1BB Ante, You Call 1.0BB To Win A 4.5BB Final Pot (22.2% Equity Needed vs 28.6%+ In Raked Cash). Defend 60%+ Of Hands.',
      'Stop Set-Mining Below 35BB Effective Depth: Cash Players Habitually Call Opens With 22-66 To Hit A Set. At 25BB MTT Depth, You Lack The 15-To-1 Implied Odds To Set-Mine; 3-Bet Jam Or Fold Small Pairs.',
      'Master Asymmetric ICM Bubble Factors: In Cash Games, A 52% Coinflip Is Always +EV. On An MTT Bubble Or Final Table, A Covered Medium Stack Faces A 1.85+ Bubble Factor And Needs 65%+ Equity To Call All-In.',
      'Adjust C-Bet Sizing Downward At Shallow SPR And High ICM: At 25BB MTT Depth Or Final Table ICM, A 25%-33% Flop C-Bet Achieves The Same Fold Leverage As A 66% Cash-Game C-Bet.',
    ],
    ifThenBecause:
      'If Transitioning From 100BB Cash Games To Multi-Table Tournaments -> Then Expand Big Blind Defense By 15% To Capture The 1BB Ante And Apply Bubble-Factor Risk Premiums Before Calling All-Ins -> Because Zero Postflop Rake And ICM Nonlinearity Redefine Every Threshold.',
    calculatorHref: '/tools/icm-calculator',
    calculatorName: 'Malmuth-Harville ICM & Bubble Calculator',
  },
  {
    key: 'mtt-to-live-cash',
    title: 'Transition 3: MTT Tournaments -> Deep-Stack Live Cash ($1/$3 - $2/$5)',
    fromFormat: 'MTT Tournaments',
    toFormat: 'Deep-Stack Live Cash',
    shockFactor: 'Zero Antes, High Flop Rake Drop ($6-$7), And 150BB-300BB Multiway SPRs',
    adjustments: [
      'Tighten Big Blind Defense Against Large Live Opens: With Zero Antes In The Pot And A $6 Casino Flop Rake Drop, Calling A 4x-5x Live Open From The Big Blind With Weak Suited Hands (Q4s, J6s, 96s) Burns Money.',
      'Stop Stacking Off With One Pair At 150BB+ Depth: Tournament Players Used To 25BB Stacks Treat Top Pair Top Kicker And Overpairs As Automatic All-Ins. At 150BB Live Cash Depth (SPR 15+), One Pair Is Strictly A 2-Street Hand.',
      'Shift From Balanced Small Sizing To Exploitative Large Value Sizing: Against Live Loose-Passive Calling Stations (45% VPIP), Abandon 25% MTT C-Bets And Bet 75%-100% Pot With Value.',
      'Prioritize Nut Implied-Odds Hands Multiway: Deep Live Pots Frequently Go 4-Way To The Flop; Suited Aces, Pocket Pairs, And Suited Connectors Outperform Offsuit Broadways Like AJo Or KQo.',
    ],
    ifThenBecause:
      'If Moving From MTTs To Deep-Stack Live Cash Games -> Then Tighten Big Blind Calls By 18% And Refuse To Stack Off 150BB With Unimproved Overpairs -> Because Zero Antes Plus $6 Rake Kills Wide BB Defense And High SPR Demands Two Pair+ For Stacks.',
    calculatorHref: '/tools/rake-calculator',
    calculatorName: 'Live Cash Rake & Winrate Calculator',
  },
  {
    key: 'nlh-to-plo-omaha',
    title: 'Transition 4: No-Limit Texas Holdem (NLH) -> Pot-Limit Omaha (PLO4 / PLO5)',
    fromFormat: 'No-Limit Holdem (NLH)',
    toFormat: 'Pot-Limit Omaha (PLO)',
    shockFactor: 'Must Use Exactly 2 Hole Cards, 60/40 Close Equities, And Nut-Or-Nothing Multiway Draws',
    adjustments: [
      'Enforce The Mandatory Two-Hole-Card Rule: Holding A Single Ace Of Spades In Your Hand Does Not Give You A Flush In PLO; You Must Hold Two Spades In Your Hole Cards Combined With Three Spades On The Board.',
      'Never Draw To Non-Nut Flushes Or Bottom-End Straights: Because Every PLO Player Holds 4 (Or 5) Hole Cards, Each Player Has 6 (Or 10) Two-Card Combinations. Non-Nut Flushes And bare Overpairs Without Redraws Are Drawing Dead In Big Pots.',
      'Value Redraws & Freerolls Above Made Vulnerable Hands: In PLO, A Flopped Straight WithZero Redraws Is Frequently An Underdog Against Top Set Or Two Pair + Flush Draw.',
      'Triple Your Bankroll Cushion For PLO Variance: Because Pocket Aces Hold Only ~62% Equity Against A Double-Suited Rundown Preflop (Compared To 82% In Holdem), Standard Deviation Jumps From 85 BB/100 To 145+ BB/100.',
    ],
    ifThenBecause:
      'If Migrating From No-Limit Holdem To Pot-Limit Omaha -> Then Fold Bare Overpairs And Non-Nut Draws Without Redraws And Carry 60+ Buy-Ins -> Because 6 Two-Card Combos Per Player Ensure Someone Holds Nut Equity Plus Redraws In Every Bloated Pot.',
    calculatorHref: '/tools/plo-outs-calculator',
    calculatorName: 'PLO Straight Wrap & Redraw Outs Calculator',
  },
];

export function renderFormatMigrationMarkdown() {
  return [
    '# Poker Format Transition & Migration Blueprint: Live Cash, Online 6-Max, MTTs & PLO | Smarter.Poker',
    '',
    'Last Verified: 2026-11-24 | Zenodo DOI: 10.5281/zenodo.24115647',
    'Canonical URL: https://smarter.poker/learn/format-migration-guide',
    '',
    '## Master 4-Format Structural Comparison Matrix',
    '',
    '| Format | Standard Open Size | Rake & Ante Structure | Typical Stack Depth | Bubble Factor | StdDev & Bankroll |',
    '| :--- | :--- | :--- | :--- | :--- | :--- |',
    ...FORMAT_PROFILES.map(
      (f) =>
        `| **${f.name}** | ${f.openSizing} | ${f.rakeAndAnte} | ${f.stackDepth} | ${f.bubbleFactor} | ${f.stdDevBb100} (${f.bankrollRequirement}) |`
    ),
    '',
    ...TRANSITION_PLAYBOOKS.flatMap((t) => [
      `## ${t.title}`,
      `- **Primary Structural Shock**: ${t.shockFactor}`,
      ...t.adjustments.map((a) => `- ${a}`),
      `- **Causal Rule**: ${t.ifThenBecause}`,
      `- **Recommended Tool**: [${t.calculatorName}](https://smarter.poker${t.calculatorHref})`,
      '',
    ]),
  ].join('\n');
}

export default function FormatMigrationGuidePage() {
  const [selectedTransition, setSelectedTransition] = useState(TRANSITION_PLAYBOOKS[0].key);

  const activePlaybook =
    TRANSITION_PLAYBOOKS.find((t) => t.key === selectedTransition) || TRANSITION_PLAYBOOKS[0];

  const canonicalPath = '/learn/format-migration-guide';
  const canonicalUrl = `https://smarter.poker${canonicalPath}`;
  const claimText =
    'Migrating Between Poker Formats Requires Adjusting For Five Structural Variables: Pre-Flop Dead Money (0-Ante Cash vs 1BB-Ante MTT), Flop Rake Drop ($6 Live vs 0% MTT), Effective Stack Depth (200BB Live vs 25BB MTT), ICM Bubble Factor (1.00 vs 2.20), And Combo Density (1 Holdem Hand vs 6 PLO4 Combos).';
  const quoteText =
    'A Winning 100BB Cash Game Player Who Brings Unmodified Cash Ranges Into A 25BB MTT Under-Defends The Big Blind By 18% And Spews Final-Table Equity By Ignoring 1.90 Bubble Factors.';

  const jsonLd = [
    {
      '@type': 'Article',
      '@id': `${canonicalUrl}#article`,
      headline: 'Poker Format Transition & Migration Blueprint: Live Cash, Online 6-Max, MTTs & PLO',
      name: 'Poker Format Migration Blueprint',
      description:
        'Complete Mathematical Transition Matrix For Switching Between Live Cash Games, Online 6-Max, Multi-Table Tournaments (MTTs), And Pot-Limit Omaha (PLO).',
      url: canonicalUrl,
      inLanguage: 'en-US',
      datePublished: '2026-11-24',
      dateModified: '2026-11-24',
      isAccessibleForFree: true,
      author: { '@id': 'https://smarter.poker/#organization' },
      publisher: { '@id': 'https://smarter.poker/#organization' },
    },
    ...geoClaimSchema({
      claim: claimText,
      quoteText,
      quoteAuthor: 'Smarter.Poker Quantitative Solver Desk',
      doi: '10.5281/zenodo.24115647',
      canonicalPath,
    }),
    {
      '@type': 'BreadcrumbList',
      '@id': `${canonicalUrl}#breadcrumb`,
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Smarter.Poker', item: 'https://smarter.poker/' },
        { '@type': 'ListItem', position: 2, name: 'Learn Poker', item: 'https://smarter.poker/learn' },
        { '@type': 'ListItem', position: 3, name: 'Poker Format Migration Blueprint', item: canonicalUrl },
      ],
    },
  ];

  return (
    <div style={styles.page}>
      <SEOHead
        title="Poker Format Migration Blueprint"
        description="Complete Mathematical Transition Matrix For Switching Between Live Cash Games, Online 6-Max, Multi-Table Tournaments (MTTs), And Pot-Limit Omaha (PLO)."
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
          <span style={styles.crumbCurrent}>Poker Format Migration Blueprint</span>
        </nav>

        <header style={styles.heroPlate}>
          <div style={styles.badgeRow}>
            <span style={styles.cyanBadge}>4-FORMAT STRUCTURAL COMPARISON MATRIX</span>
            <span style={styles.emeraldBadge}>LIVE CASH · ONLINE 6-MAX · MTTS · PLO</span>
          </div>

          <h1 style={styles.h1}>
            Poker Format Transition &amp; Migration Blueprint: Live Cash, Online 6-Max, MTTs &amp; PLO
          </h1>

          <p style={styles.lead}>
            <strong>Direct Answer:</strong> Switching Between <strong>Live Full-Ring Cash</strong>, <strong>Online 6-Max</strong>, <strong>Multi-Table Tournaments (MTTs)</strong>, And <strong>Pot-Limit Omaha (PLO)</strong> Without Recalibrating For Rake Caps, Big Blind Antes, Stack-To-Pot Ratios, And ICM Bubble Factors Turns Winning Habits Into Expensive Leaks. Use The Interactive Format Transition Selector And Master Comparison Matrix Below.
          </p>

          <div style={styles.quickCrossLinks}>
            <Link href="/tools/format-quiz" style={styles.crossBtnCyan}>
              Take Best Poker Format Quiz
            </Link>
            <Link href="/learn/online-vs-live-poker" style={styles.crossBtnEmerald}>
              Online Vs. Live Poker Guide
            </Link>
            <Link href="/learn/tournament-stages" style={styles.crossBtnOutline}>
              8 MTT Stage Playbooks
            </Link>
            <Link href="/games" style={styles.crossBtnOutline}>
              15 Poker Variants Encyclopedia
            </Link>
          </div>
        </header>

        <GeoCitationCapsule
          title="Smarter.Poker Cross-Format Mathematical Calibration Benchmark"
          claim={claimText}
          metricLabel="Format Variance Scaling"
          metricValue="NLH 85 StdDev vs PLO 145 StdDev vs MTT 150 ABI"
          formulaText="MTT Orbit Dead Money = 2.5BB (0% Postflop Rake) vs Live Cash = 1.5BB ($6-$7 Flop Drop)"
          ifThenBecause="If Switching Between Any Two Poker Formats -> Then Recalibrate Your Open Sizing, Big Blind Defense Width, One-Pair Stack-Off SPR, And Bankroll Cushion -> Because Dead Money Ratios And Variance Multiply Across Formats."
          quoteText={quoteText}
          quoteAuthor="Smarter.Poker Quantitative Solver Desk"
          doi="10.5281/zenodo.24115647"
          canonicalPath={canonicalPath}
        />

        {/* Master 4-Format Comparison Table */}
        <section aria-label="Master 4-Format Comparison Matrix" style={styles.sectionPlate}>
          <h2 style={styles.h2}>
            Master Structural Comparison Table: Live Cash Vs. Online 6-Max Vs. MTTs Vs. PLO
          </h2>
          <div style={{ overflowX: 'auto', maxWidth: '100%', WebkitOverflowScrolling: 'touch' }}>
            <table style={styles.table}>
              <thead>
                <tr style={styles.trHead}>
                  <th style={styles.th}>Poker Format</th>
                  <th style={styles.th}>Open-Raise Sizing</th>
                  <th style={styles.th}>Rake &amp; Ante Structure</th>
                  <th style={styles.th}>Typical Stack Depth</th>
                  <th style={styles.th}>ICM Bubble Factor</th>
                  <th style={styles.th}>Bankroll Cushion</th>
                </tr>
              </thead>
              <tbody>
                {FORMAT_PROFILES.map((f) => (
                  <tr key={f.id} style={styles.trBody}>
                    <td style={styles.tdTitle}>{f.name}</td>
                    <td style={styles.tdCyan}>{f.openSizing}</td>
                    <td style={styles.td}>{f.rakeAndAnte}</td>
                    <td style={styles.td}>{f.stackDepth}</td>
                    <td style={styles.tdEmerald}>{f.bubbleFactor}</td>
                    <td style={styles.td}>{f.bankrollRequirement}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Interactive Format Transition Selector */}
        <section aria-label="Interactive Format Transition Selector" style={styles.sectionPlate}>
          <h2 style={styles.h2}>Interactive Format Migration Playbook Selector</h2>
          <div style={styles.filterPills}>
            {TRANSITION_PLAYBOOKS.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setSelectedTransition(t.key)}
                style={selectedTransition === t.key ? styles.pillActive : styles.pill}
              >
                {t.fromFormat} To {t.toFormat}
              </button>
            ))}
          </div>

          <article style={styles.activeCard}>
            <div style={styles.shockStrip}>
              <strong style={{ color: '#38bdf8' }}>Primary Structural Shock:</strong>{' '}
              {activePlaybook.shockFactor}
            </div>
            <h3 style={styles.h3}>{activePlaybook.title}</h3>
            <ul style={styles.bulletList}>
              {activePlaybook.adjustments.map((adj) => (
                <li key={adj} style={styles.bulletItem}>
                  {adj}
                </li>
              ))}
            </ul>
            <div style={styles.ruleBox}>
              <strong style={{ color: '#34d399' }}>Causal Migration Rule:</strong>{' '}
              {activePlaybook.ifThenBecause}
            </div>
            <div style={{ marginTop: 14 }}>
              <Link href={activePlaybook.calculatorHref} style={styles.crossBtnCyan}>
                Launch {activePlaybook.calculatorName}
              </Link>
            </div>
          </article>
        </section>

        {/* All 4 Transition Playbooks Visible For SSR Crawlers */}
        <section aria-label="Complete Format Transition Playbooks" style={styles.sectionPlate}>
          <h2 style={styles.h2}>All 4 Format Migration Checklists At A Glance</h2>
          <div style={styles.cardGrid}>
            {TRANSITION_PLAYBOOKS.map((t) => (
              <div key={t.key} style={styles.card}>
                <h3 style={styles.h3}>{t.title}</h3>
                <p style={{ fontSize: 13.5, color: '#bdd0e2', margin: '0 0 10px 0' }}>
                  <strong>Shock:</strong> {t.shockFactor}
                </p>
                <p style={{ fontSize: 13.5, color: '#bdd0e2', lineHeight: 1.58, margin: '0 0 12px 0' }}>
                  {t.ifThenBecause}
                </p>
                <Link href={t.calculatorHref} style={styles.smallLink}>
                  Open {t.calculatorName}
                </Link>
              </div>
            ))}
          </div>
        </section>

        <GeoFollowUpChain
          topicTitle="Poker Format Migration Blueprint"
          followUps={[
            {
              question: 'Which Poker Format Best Matches My Bankroll Size, Schedule, And Risk Tolerance?',
              answer:
                'Take The Interactive Smarter.Poker Format Selection Quiz Or Consult The 20-Scenario Poker Decision Matrix To Match Your Exact Goals.',
              calculatorHref: '/compare/decision-matrix',
              calculatorLabel: 'Open 20-Scenario Decision Matrix',
              markdownHref: '/compare/decision-matrix.md',
            },
            {
              question: 'How Do I Calculate Exact Pot-Limit Bets And Straight Wrap Outs When Moving To PLO?',
              answer:
                'Use The PLO Max Pot-Size Bet Calculator (3x + Trail + Center Pot) And The PLO Straight Wrap & Flush Redraw Outs Calculator.',
              calculatorHref: '/tools/plo-outs-calculator',
              calculatorLabel: 'Open PLO Wrap & Outs Calculator',
              markdownHref: '/tools/plo-outs-calculator.md',
            },
            {
              question: 'How Much Does Live Casino Rake Affect My Preflop Opening And Calling Ranges?',
              answer:
                'Compare Pot-Rake Caps Against Time-Collection Rates In The Live Rake Calculator And Inspect The Rake Sensitivity Curve Explorer.',
              calculatorHref: '/tools/rake-calculator',
              calculatorLabel: 'Open Live Rake Cost Calculator',
              markdownHref: '/tools/rake-calculator.md',
            },
          ]}
        />

        <HubPageSummary page="learn-format-migration-guide" />
        <SmarterAccountUnlockGate
          variant="study-deck"
          context="learn-format-migration-guide"
          title="Save This Format Migration Blueprint & Drill Transition Spots Free"
          redirectPath={canonicalPath}
        />


        <CitationBacklinkBox
          title="Smarter.Poker Format Transition & Migration Blueprint (Cash, 6-Max, MTT & PLO)"
          canonicalUrl={canonicalUrl}
          badgeType="gto"
          badgeLabel="Format Migration Matrix"
          badgeValue="4 Core Poker Formats"
          summary="Complete mathematical transition guide for switching between Live Cash, Online 6-Max, Multi-Table Tournaments, and Pot-Limit Omaha."
          publishedYear="2026"
          slug="poker-format-migration-blueprint"
          doi="10.5281/zenodo.24115647"
        />

        <AiPromptLauncher
          title="Poker Format Transition & Migration Blueprint"
          canonicalUrl={canonicalUrl}
          canonicalPath={canonicalPath}
          markdownUrl="/learn/format-migration-guide.md"
        />
      </main>
    </div>
  );
}

export async function getServerSideProps({ req, res, query }) {
  const accept = String(req?.headers?.accept || '');
  if (
    query?.format === 'md' ||
    query?.format === 'markdown' ||
    accept.includes('text/markdown') ||
    req?.url?.includes('format=md')
  ) {
    const md = renderFormatMigrationMarkdown();
    res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
    res.setHeader('Vary', 'Accept');
    res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
    res.write(md);
    res.end();
    return { props: {} };
  }
  return { props: {} };
}

const styles = {
  page: {
    minHeight: '100vh',
    background: '#071321',
    color: '#f2f7ff',
    fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif',
  },
  container: { maxWidth: 1120, margin: '0 auto', padding: '32px 20px 80px' },
  breadcrumbs: { display: 'flex', flexWrap: 'wrap', gap: 8, fontSize: 13, color: '#bdd0e2', marginBottom: 18 },
  crumbLink: { color: '#38bdf8', textDecoration: 'none' },
  crumbSep: { color: '#2b4663' },
  crumbCurrent: { color: '#bdd0e2', fontWeight: 600 },
  heroPlate: {
    background: 'linear-gradient(180deg, #0d1f33 0%, #0a1a2b 100%)',
    border: '1px solid #2b4663',
    borderRadius: 0,
    padding: '28px 26px',
    marginBottom: 24,
  },
  badgeRow: { display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 14 },
  cyanBadge: {
    fontSize: 11,
    fontWeight: 800,
    letterSpacing: '0.06em',
    padding: '4px 10px',
    borderRadius: 0,
    background: 'rgba(56, 189, 248, 0.14)',
    color: '#38bdf8',
    border: '1px solid rgba(56, 189, 248, 0.35)',
  },
  emeraldBadge: {
    fontSize: 11,
    fontWeight: 800,
    letterSpacing: '0.06em',
    padding: '4px 10px',
    borderRadius: 0,
    background: 'rgba(16, 185, 129, 0.14)',
    color: '#34d399',
    border: '1px solid rgba(16, 185, 129, 0.35)',
  },
  h1: { fontSize: 'clamp(26px, 3.6vw, 36px)', fontWeight: 800, color: '#f2f7ff', lineHeight: 1.2, margin: '0 0 14px 0' },
  lead: { fontSize: 16, lineHeight: 1.68, color: '#bdd0e2', margin: '0 0 20px 0' },
  quickCrossLinks: { display: 'flex', flexWrap: 'wrap', gap: 10 },
  crossBtnCyan: { padding: '9px 15px', borderRadius: 0, background: '#38bdf8', color: '#071321', fontWeight: 700, fontSize: 13, textDecoration: 'none', display: 'inline-block' },
  crossBtnEmerald: { padding: '9px 15px', borderRadius: 0, background: '#10b981', color: '#071321', fontWeight: 700, fontSize: 13, textDecoration: 'none', display: 'inline-block' },
  crossBtnOutline: { padding: '9px 15px', borderRadius: 0, background: '#0d1f33', color: '#38bdf8', border: '1px solid #2b4663', fontWeight: 700, fontSize: 13, textDecoration: 'none', display: 'inline-block' },
  sectionPlate: { background: '#0a1a2b', border: '1px solid #2b4663', borderRadius: 0, padding: '24px 22px', marginBottom: 26 },
  h2: { fontSize: 21, fontWeight: 800, color: '#f2f7ff', margin: '0 0 16px 0' },
  h3: { fontSize: 18, fontWeight: 800, color: '#f2f7ff', margin: '0 0 12px 0' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 13 },
  trHead: { borderBottom: '1px solid #2b4663', textAlign: 'left', color: '#38bdf8' },
  th: { padding: '10px 12px', fontWeight: 700 },
  trBody: { borderBottom: '1px solid #2b4663' },
  tdTitle: { padding: '11px 12px', fontWeight: 800, color: '#f2f7ff' },
  td: { padding: '11px 12px', color: '#bdd0e2' },
  tdCyan: { padding: '11px 12px', color: '#38bdf8', fontWeight: 700 },
  tdEmerald: { padding: '11px 12px', color: '#34d399', fontWeight: 700 },
  filterPills: { display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 18 },
  pill: { padding: '7px 14px', borderRadius: 0, border: '1px solid #2b4663', background: '#0d1f33', color: '#bdd0e2', fontSize: 13, fontWeight: 600, cursor: 'pointer' },
  pillActive: { padding: '7px 14px', borderRadius: 0, border: '1px solid #38bdf8', background: '#38bdf8', color: '#071321', fontSize: 13, fontWeight: 800, cursor: 'pointer' },
  activeCard: { background: '#0d1f33', border: '1px solid #38bdf8', borderRadius: 0, padding: '20px 22px' },
  shockStrip: { fontSize: 13, color: '#f2f7ff', marginBottom: 10 },
  bulletList: { margin: '0 0 14px 0', paddingLeft: 18, display: 'grid', gap: 10 },
  bulletItem: { fontSize: 14, lineHeight: 1.62, color: '#bdd0e2' },
  ruleBox: { background: '#071321', border: '1px solid rgba(16, 185, 129, 0.35)', borderRadius: 0, padding: '11px 14px', fontSize: 13.5, lineHeight: 1.58, color: '#d1fae5' },
  cardGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 },
  card: { background: '#0d1f33', border: '1px solid #2b4663', borderRadius: 0, padding: 18 },
  smallLink: { fontSize: 13, fontWeight: 700, color: '#38bdf8', textDecoration: 'none' },
};
