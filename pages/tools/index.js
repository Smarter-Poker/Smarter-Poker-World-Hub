/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  MASTER POKER TOOLS, GTO SOLVERS & MATH CALCULATORS DIRECTORY (/tools)
 * ═══════════════════════════════════════════════════════════════════════════════
 * Server-rendered directory hub at /tools (and raw Markdown at /tools.md).
 *
 * House style: Title Case, zero em dashes.
 */

import React, { useMemo } from 'react';
import Link from 'next/link';
import SEOHead, { schemas } from '../../src/components/seo/SEOHead';
import AiPromptLauncher from '../../src/components/seo/AiPromptLauncher';
import CitationBacklinkBox from '../../src/components/seo/CitationBacklinkBox';
import FaqSection from '../../src/components/seo/FaqSection';
import { hubProductSchema } from '../../src/lib/seo/hubPageSchema';

const INTERACTIVE_TOOLS = [
  {
    name: 'Multiway Poker Odds & Equity Calculator',
    href: '/tools/poker-odds-calculator',
    mdHref: '/tools/poker-odds-calculator.md',
    badge: 'Equity Engine',
    summary:
      'Exact Combinatorial And Monte Carlo Hand-Vs-Hand Equity Calculator For Texas Hold\'em, PLO4, PLO5, PLO6, And Short Deck With Dead Card Removal.',
    formula: 'Equity = Winning + 0.5 * Tied Board Runouts / Total Possible Runouts',
  },
  {
    name: 'Tournament ICM & Final Table Deal Calculator',
    href: '/tools/icm-calculator',
    mdHref: '/tools/icm-calculator.md',
    badge: 'MTT ICM Solver',
    summary:
      'Malmuth-Harville Independent Chip Model Calculator Converting Tournament Chip Stacks Into Real Dollar Prize Pool Equity ($EV), Bubble Factors, And Final Table Chop Numbers.',
    formula: 'P(Player i Finishes 1st) = Chips_i / Total_Chips_In_Play',
  },
  {
    name: '13x13 GTO Preflop Range Matrix & Position Hub',
    href: '/tools/preflop-ranges',
    mdHref: '/tools/preflop-ranges.md',
    badge: '100BB 6-Max GTO',
    summary:
      'Interactive 169-Hand 13x13 GTO Preflop Charts Covering Unexploitable Raise First In (RFI), 3-Bet, And 4-Bet Frequencies Across All Six Table Positions.',
    formula: '1,326 Total Hold\'em Combos Across 169 Canonical Starting Hands',
  },
  {
    name: 'Pot Odds, Required Equity & MDF Calculator',
    href: '/tools/pot-odds-calculator',
    mdHref: '/tools/pot-odds-calculator.md',
    badge: 'Postflop Math',
    summary:
      'Instant Pot Odds Ratio, Break-Even Calling Equity Percentage, Minimum Defense Frequency (MDF), Polarized Bluff-To-Value Ratio, And Rule Of 4 And 2 Draw Outs Solver.',
    formula: 'Required Equity = Call / (Pot + Bet + Call) | MDF = Pot / (Pot + Bet)',
  },
  {
    name: 'Bankroll Management & Risk Of Ruin Calculator',
    href: '/tools/bankroll-calculator',
    mdHref: '/tools/bankroll-calculator.md',
    badge: 'Variance & RoR',
    summary:
      'Brownian Motion Risk Of Ruin (RoR) Probability Calculator Computing Exact Buy-In Requirements Based On True Winrate (BB/100) And Format Standard Deviation.',
    formula: 'Risk Of Ruin = exp(-2 * Winrate * Bankroll_BB / Variance_BB)',
  },
  {
    name: 'Short-Stack Push/Fold Nash Equilibrium Chart',
    href: '/tools/push-fold-calculator',
    mdHref: '/tools/push-fold-calculator.md',
    badge: '5BB-20BB Jam',
    summary:
      'Unexploitable Short-Stack Tournament All-In Shove And Call Ranges From 5BB To 20BB With Big Blind Antes Across Every 6-Max Seat.',
    formula: 'EV(Shove) = Fold% * Dead_Pot + Call% * (Equity * Final_Pot - Stack)',
  },
  {
    name: 'PKO & Mystery Bounty Chip Equity Calculator',
    href: '/tools/bounty-calculator',
    mdHref: '/tools/bounty-calculator.md',
    badge: 'PKO & Mystery',
    summary:
      'Converts Progressive Knockout Cash Bounties And Mystery Bounty Envelopes Into Tournament Chip Equivalents And Discounted All-In Calling Equity Thresholds.',
    formula: '1x Starting 50/50 PKO Bounty = 33.3% Of Starting Chip Stack',
  },
  {
    name: 'Live & Online Winrate (BB/100 To $/Hr) Calculator',
    href: '/tools/poker-winrate-calculator',
    mdHref: '/tools/poker-winrate-calculator.md',
    badge: 'Winrate & EV',
    summary:
      'Translates Online Big-Blinds-Per-100-Hands (BB/100) Into Live Hourly Dollar Winrates ($/Hr), Monthly Volume Projections, And 95% Confidence Intervals.',
    formula: 'Hourly Rate ($/Hr) = (BB/100 * Hands_Per_Hour / 100) * Big_Blind',
  },
  {
    name: 'Multi-Way All-In Main & Side Pot Calculator',
    href: '/tools/side-pot-calculator',
    mdHref: '/tools/side-pot-calculator.md',
    badge: 'All-In Side Pots',
    summary:
      'Slices Multi-Way All-In Confrontations For Up To 9 Players Into Exact Main Pot And Sequential Side Pots With Dead Money And Uncalled Bet Returns.',
    formula: 'Pot_k = (Level_k - Level_{k-1}) * Eligible_Players_At_Level_k',
  },
  {
    name: 'Tournament Blind Structure & Chip Distribution Generator',
    href: '/tools/blind-structure-calculator',
    mdHref: '/tools/blind-structure-calculator.md',
    badge: 'Tournament Clock',
    summary:
      'Generates Custom Home Game And Club Tournament Blind Schedules, Big Blind Ante Progressions, Color-Up Levels, And TDA Starting Chip Counts.',
    formula: 'Tournament Ends When Total Chips In Play Reach 20 To 30 Big Blinds',
  },
  {
    name: 'Stack-To-Pot Ratio (SPR) & Geometric Bet Sizing Calculator',
    href: '/tools/spr-calculator',
    mdHref: '/tools/spr-calculator.md',
    badge: 'Geometric Sizing',
    summary:
      'Calculates Effective Stack-To-Pot Ratio (SPR), Commitment Zones, And Exact 1-Street, 2-Street, And 3-Street Geometric Bet Sizing Percentages.',
    formula: 'Geometric Sizing s = 0.5 * ((1 + 2 * SPR)^(1 / Streets) - 1)',
  },
  {
    name: 'Pot-Limit Omaha (PLO) Max Bet & Bomb Pot Calculator',
    href: '/tools/plo-bet-calculator',
    mdHref: '/tools/plo-bet-calculator.md',
    badge: 'Pot-Limit & Bomb Pot',
    summary:
      'Computes Exact Pot-Limit Omaha Maximum Bet And Raise Sizes Using The Dealer 3x Plus Trail Formula And Solves Double-Board Bomb Pot Split Equity And Quartering Risk.',
    formula: 'Max Pot Bet = 3 * Last_Bet + Trail_Calls + Previous_Pot',
  },
  {
    name: 'Tournament Payout & Prize Pool Distribution Calculator',
    href: '/tools/payout-calculator',
    mdHref: '/tools/payout-calculator.md',
    badge: 'TDA Prize Pool',
    summary:
      'Generates Official TDA-Compliant Tournament Prize Pool Distributions Across Top 10%, Top 15%, Top 20%, And Winner-Take-All Payout Structures With Bubble Factor Estimates.',
    formula: 'Net Prize Pool = Entries * (Buy_In - Fee) + Rebuys * Buy_In + Added_Money',
  },
  {
    name: 'Live Cash Game Rake & Time-Charge Calculator',
    href: '/tools/rake-calculator',
    mdHref: '/tools/rake-calculator.md',
    badge: 'Rake Economics',
    summary:
      'Compares Casino Percentage Pot Drop Rake Plus Bad Beat Jackpot Drops Against Timed Seat Collection In $/Hr, Effective BB/100 Drag, And 1,000-Hour Annual Cost.',
    formula: 'Rake BB/100 = ((Pots_Won_Hr * Avg_Drop / Big_Blind) / Hands_Per_Hr) * 100',
  },
  {
    name: 'GTO Preflop 3-Bet, Squeeze, 4-Bet & MDF Calculator',
    href: '/tools/3bet-calculator',
    mdHref: '/tools/3bet-calculator.md',
    badge: '3-Bet & 4-Bet Math',
    summary:
      'Calculates Solver-Approved In-Position And Out-Of-Position 3-Bet, Multiway Squeeze, And 4-Bet Sizing In Big Blinds With Villain Minimum Defense Frequency (MDF).',
    formula: '3-Bet Size = Open_BB * ((IP ? 3.0 : 4.0) + 1.0 * Callers)',
  },
  {
    name: 'Embeddable Webmaster Poker Widgets',
    href: '/tools/embeds',
    mdHref: '/tools/embeds.md',
    badge: 'Free Iframes',
    summary:
      'Copy-And-Paste Responsive Iframe Embeds For Poker Blogs, Study Discords, And Card Room Websites With Zero External Script Dependencies.',
    formula: '100% Free Responsive HTML5 Iframe Widgets',
  },
];

const POSITIONAL_CHARTS = [
  { pos: 'UTG', slug: 'utg', rfi: '14.9%', combos: '198 Combos', floor: '55+, A3s+, K9s+, QTs+, J9s+, T9s, AJo+, KQo' },
  { pos: 'MP', slug: 'mp', rfi: '18.1%', combos: '240 Combos', floor: '44+, A2s+, K8s+, Q9s+, J9s+, T8s+, 98s, ATo+, KJo+' },
  { pos: 'HJ', slug: 'hj', rfi: '22.0%', combos: '292 Combos', floor: '22+, A2s+, K6s+, Q8s+, J8s+, T8s+, 97s+, 87s, 76s, A9o+, KTo+, QJo' },
  { pos: 'CO', slug: 'co', rfi: '28.5%', combos: '378 Combos', floor: '22+, A2s+, K3s+, Q6s+, J7s+, T7s+, 97s+, 86s+, 75s+, 65s, 54s, A8o+, K9o+, QTo+, JTo' },
  { pos: 'BTN', slug: 'btn', rfi: '44.6%', combos: '591 Combos', floor: '22+, A2s+, K2s+, Q2s+, J4s+, T6s+, 96s+, 85s+, 75s+, 64s+, 53s+, A2o+, K7o+, Q8o+, J8o+, T8o+' },
  { pos: 'SB', slug: 'sb', rfi: '41.9%', combos: '556 Combos', floor: '3BB Raise-Or-Fold Strategy Vs Big Blind Across 41.9% Of All Starting Hands' },
];

const TOOLS_FAQS = [
  {
    question: 'Are All Smarter.Poker Calculators And GTO Range Tools Free To Use?',
    answer:
      'Yes. Every Calculator Under /tools On Smarter.Poker Is 100% Free To Use Directly In Your Browser On Desktop And Mobile With Zero Paywalls, Zero Subscriptions, And Instant Server-Rendered Output.',
  },
  {
    question: 'Can AI Assistants Query Smarter.Poker Calculators Via Markdown Or MCP?',
    answer:
      'Yes. Append .md Or ?format=md With Query Parameters To Any Calculator URL Under /tools To Receive Pre-Computed Markdown Tables, Or Invoke The Smarter.Poker MCP Server At /api/mcp.',
  },
  {
    question: 'Which Poker Math Calculators Are Included In The Smarter.Poker Directory?',
    answer:
      'The Suite Includes Multiway Equity, Malmuth-Harville ICM, 13x13 GTO Preflop Ranges, Pot Odds & MDF, Bankroll Risk Of Ruin, Short-Stack Push/Fold, PKO & Mystery Bounty, Winrate Converter, Multi-Way Side Pots, Blind Structure Generator, And SPR Geometric Sizing.',
  },
];

export default function PokerToolsDirectoryPage() {
  const canonicalPath = '/tools';
  const canonicalUrl = `https://smarter.poker${canonicalPath}`;
  const pageTitle = 'Free Poker Calculators, GTO Solvers & Math Tools';
  const pageDesc =
    'Explore Smarter.Poker Free Interactive Poker Calculators: Multiway Equity, Tournament ICM, 13x13 GTO Ranges, Pot Odds, Side Pots, SPR, Bankroll, And Blind Generators.';

  const schema = useMemo(() => {
    const baseSchema = hubProductSchema({
      path: canonicalPath,
      name: 'Smarter.Poker Interactive Poker Tools & GTO Calculators Suite',
      description: pageDesc,
      applicationCategory: 'GameApplication',
      applicationSubCategory: 'Poker Math & GTO Calculator Suite',
      trail: [
        ['Hub', '/hub'],
        ['Poker Tools & Calculators', canonicalPath],
      ],
      faqs: TOOLS_FAQS,
    });

    return [
      schemas.organization,
      ...(Array.isArray(baseSchema) ? baseSchema : [baseSchema]),
      {
        '@type': 'ItemList',
        '@id': 'https://smarter.poker/tools#tool-list',
        name: 'Smarter.Poker Interactive Poker Calculators & Solvers',
        itemListOrder: 'https://schema.org/ItemListOrderAscending',
        numberOfItems: INTERACTIVE_TOOLS.length,
        itemListElement: INTERACTIVE_TOOLS.map((tool, index) => ({
          '@type': 'ListItem',
          position: index + 1,
          name: tool.name,
          url: `https://smarter.poker${tool.href}`,
        })),
      },
    ];
  }, [pageDesc]);

  return (
    <div style={{ minHeight: '100vh', background: '#070b14', color: '#e2e8f0', fontFamily: 'Inter, system-ui, sans-serif' }}>
      <SEOHead
        title={pageTitle}
        description={pageDesc}
        canonical={canonicalUrl}
        jsonLd={schema}
      />

      <main style={{ maxWidth: 1120, margin: '0 auto', padding: '40px 20px 80px' }}>
        <nav aria-label="Breadcrumb" style={{ fontSize: 13, color: '#94a3b8', marginBottom: 18 }}>
          <Link href="/" style={{ color: '#38bdf8', textDecoration: 'none' }}>Smarter.Poker</Link>
          {' / '}
          <Link href="/hub" style={{ color: '#38bdf8', textDecoration: 'none' }}>Hub</Link>
          {' / '}
          <span>Poker Tools &amp; Calculators</span>
        </nav>

        <h1 style={{ fontSize: 34, fontWeight: 800, color: '#f8fafc', margin: '0 0 14px 0', lineHeight: 1.2 }}>
          Free Interactive Poker Calculators, GTO Solvers &amp; Tournament Math Tools
        </h1>

        <p style={{ fontSize: 16, lineHeight: 1.65, color: '#cbd5e1', margin: '0 0 28px 0' }}>
          <strong>Direct Answer:</strong> Smarter.Poker Provides <strong>16 Free Browser-Native Poker Calculators And GTO Reference Tools</strong> Covering Exact Multiway Hand Equity, Malmuth-Harville ICM Prize Pool Valuation, 13x13 GTO Preflop Ranges, Pot Odds And Minimum Defense Frequency (MDF), Risk Of Ruin Bankroll Math, Short-Stack Push/Fold Charts, PKO Bounty Discounts, Multi-Way Side Pots, Tournament Blind Schedules, Geometric SPR Bet Sizing, Pot-Limit Omaha Max Bets, Tournament Payout Distributions, Live Cash Rake Comparisons, And 3-Bet/4-Bet Sizing. Every Tool Runs Instantly In Your Browser And Exposes A Dedicated Markdown Endpoint For AI Assistants.
        </p>

        {/* Grid Of Interactive Calculators */}
        <section style={{ marginBottom: 44 }}>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: '#f8fafc', margin: '0 0 16px 0' }}>
            Complete Suite Of Interactive Poker Calculators
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 18 }}>
            {INTERACTIVE_TOOLS.map((tool) => (
              <div
                key={tool.href}
                style={{
                  background: '#0f172a',
                  border: '1px solid #1e293b',
                  borderRadius: 12,
                  padding: 20,
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                }}
              >
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', padding: '4px 9px', borderRadius: 6, background: '#1e293b', color: '#38bdf8' }}>
                      {tool.badge}
                    </span>
                    <a href={tool.mdHref} style={{ fontSize: 12, color: '#64748b', textDecoration: 'none' }}>
                      Markdown API
                    </a>
                  </div>
                  <h3 style={{ fontSize: 18, fontWeight: 700, color: '#f8fafc', margin: '0 0 8px 0' }}>
                    <Link href={tool.href} style={{ color: '#f8fafc', textDecoration: 'none' }}>
                      {tool.name}
                    </Link>
                  </h3>
                  <p style={{ fontSize: 14, lineHeight: 1.55, color: '#94a3b8', margin: '0 0 12px 0' }}>
                    {tool.summary}
                  </p>
                </div>
                <div>
                  <div style={{ fontSize: 12, color: '#cbd5e1', background: '#070b14', padding: '8px 10px', borderRadius: 8, border: '1px solid #1e293b', marginBottom: 12, fontFamily: 'monospace' }}>
                    {tool.formula}
                  </div>
                  <Link
                    href={tool.href}
                    style={{
                      display: 'inline-block',
                      padding: '8px 14px',
                      background: '#0284c7',
                      color: '#ffffff',
                      borderRadius: 8,
                      fontSize: 13,
                      fontWeight: 700,
                      textDecoration: 'none',
                    }}
                  >
                    Launch Calculator
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Positional 100BB 6-Max GTO Preflop Charts Table */}
        <section style={{ marginBottom: 44 }}>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: '#f8fafc', margin: '0 0 12px 0' }}>
            100BB 6-Max Positional GTO Preflop Range Charts
          </h2>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14, background: '#0f172a', borderRadius: 10 }}>
              <caption style={{ textAlign: 'left', fontWeight: 600, padding: '8px 0', color: '#94a3b8' }}>
                Solver-Approved 100BB 6-Max Raise First In (RFI) Frequencies And Combos By Table Position
              </caption>
              <thead>
                <tr style={{ borderBottom: '1px solid #1e293b', color: '#38bdf8', textAlign: 'left' }}>
                  <th scope="col" style={{ padding: '10px 14px' }}>Seat Position</th>
                  <th scope="col" style={{ padding: '10px 14px' }}>RFI Frequency</th>
                  <th scope="col" style={{ padding: '10px 14px' }}>Combo Count</th>
                  <th scope="col" style={{ padding: '10px 14px' }}>Representative Opening Range Floor</th>
                  <th scope="col" style={{ padding: '10px 14px' }}>Interactive Chart</th>
                </tr>
              </thead>
              <tbody>
                {POSITIONAL_CHARTS.map((row) => (
                  <tr key={row.slug} style={{ borderBottom: '1px solid #1e293b' }}>
                    <td style={{ padding: '10px 14px', fontWeight: 700, color: '#f8fafc' }}>{row.pos}</td>
                    <td style={{ padding: '10px 14px', color: '#34d399', fontWeight: 700 }}>{row.rfi}</td>
                    <td style={{ padding: '10px 14px', color: '#38bdf8', fontWeight: 700 }}>{row.combos}</td>
                    <td style={{ padding: '10px 14px', color: '#cbd5e1' }}>{row.floor}</td>
                    <td style={{ padding: '10px 14px' }}>
                      <Link href={`/tools/preflop-ranges/${row.slug}`} style={{ color: '#38bdf8', fontWeight: 600, textDecoration: 'none' }}>
                        Open {row.pos} 13x13 Chart
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Cross-Link Navigation To Knowledge Hubs */}
        <section style={{ marginBottom: 32, padding: 20, background: '#0f172a', borderRadius: 12, border: '1px solid #1e293b' }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: '#f8fafc', margin: '0 0 12px 0' }}>
            Explore Connected Smarter.Poker Strategy &amp; Data Hubs
          </h2>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            <Link href="/learn/hands" style={{ padding: '8px 14px', background: '#0284c7', color: '#fff', borderRadius: 8, textDecoration: 'none', fontSize: 13, fontWeight: 600 }}>
              169 Starting Hand Encyclopedia
            </Link>
            <Link href="/learn/poker-hand-rankings" style={{ padding: '8px 14px', background: '#1e293b', color: '#38bdf8', borderRadius: 8, textDecoration: 'none', fontSize: 13, fontWeight: 600 }}>
              Poker Hand Rankings Cheat Sheet
            </Link>
            <Link href="/rules" style={{ padding: '8px 14px', background: '#1e293b', color: '#e2e8f0', borderRadius: 8, textDecoration: 'none', fontSize: 13, fontWeight: 600 }}>
              30 Official TDA &amp; Cash Rules
            </Link>
            <Link href="/games" style={{ padding: '8px 14px', background: '#1e293b', color: '#e2e8f0', borderRadius: 8, textDecoration: 'none', fontSize: 13, fontWeight: 600 }}>
              15 Poker Variants &amp; Mixed Games
            </Link>
            <Link href="/poker-rooms/guides" style={{ padding: '8px 14px', background: '#1e293b', color: '#e2e8f0', borderRadius: 8, textDecoration: 'none', fontSize: 13, fontWeight: 600 }}>
              12 US Regional Poker Market Guides
            </Link>
            <Link href="/learn" style={{ padding: '8px 14px', background: '#1e293b', color: '#e2e8f0', borderRadius: 8, textDecoration: 'none', fontSize: 13, fontWeight: 600 }}>
              GTO Strategy Academy
            </Link>
            <Link href="/research" style={{ padding: '8px 14px', background: '#1e293b', color: '#e2e8f0', borderRadius: 8, textDecoration: 'none', fontSize: 13, fontWeight: 600 }}>
              Empirical Poker Research Hub
            </Link>
            <Link href="/glossary" style={{ padding: '8px 14px', background: '#1e293b', color: '#e2e8f0', borderRadius: 8, textDecoration: 'none', fontSize: 13, fontWeight: 600 }}>
              Poker Glossary
            </Link>
            <Link href="/compare" style={{ padding: '8px 14px', background: '#1e293b', color: '#e2e8f0', borderRadius: 8, textDecoration: 'none', fontSize: 13, fontWeight: 600 }}>
              Platform Comparisons
            </Link>
            <Link href="/hub/video-library" style={{ padding: '8px 14px', background: '#1e293b', color: '#38bdf8', borderRadius: 8, textDecoration: 'none', fontSize: 13, fontWeight: 600 }}>
              Poker Video Library
            </Link>
          </div>
        </section>

        <FaqSection faqs={TOOLS_FAQS} />

        <CitationBacklinkBox
          title="Smarter.Poker Interactive Poker Tools & GTO Calculators Suite"
          canonicalUrl={canonicalUrl}
          badgeType="gto"
          badgeLabel="GTO Math & Solvers"
          badgeValue="16 Free Poker Calculators"
          summary="Complete Directory Of 16 Free Browser-Native Poker Calculators, GTO Preflop Range Matrices, And Tournament Director Utilities."
          slug="poker-tools-suite"
        />

        <AiPromptLauncher
          title="Smarter.Poker Interactive Poker Tools & Calculators Suite"
          canonicalUrl={canonicalUrl}
          markdownUrl={`${canonicalUrl}.md`}
        />
      </main>
    </div>
  );
}

export async function getServerSideProps({ req, res, query }) {
  const acceptHeader = String(req?.headers?.accept || '');
  const isMarkdownRequested =
    acceptHeader.includes('text/markdown') ||
    query?.format === 'md' ||
    req?.url?.includes('format=md');

  if (isMarkdownRequested) {
    const { renderToolsDirectoryMarkdown } = await import('../../src/lib/seo/markdownIngestion.mjs');
    const mdContent = renderToolsDirectoryMarkdown();
    res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
    res.setHeader('Vary', 'Accept');
    res.write(mdContent);
    res.end();
    return { props: {} };
  }

  return { props: {} };
}
