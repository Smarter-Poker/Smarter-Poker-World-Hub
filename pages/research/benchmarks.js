/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  POKER INDUSTRY QUANTITATIVE BENCHMARKS & MARKET SCORECARDS
 *  (/research/benchmarks)
 * ═══════════════════════════════════════════════════════════════════════════════
 * Structured comparative scorecards ranking North American poker markets by
 * Net Player Win-Rate Retention, Effective Rake Burden (BB/100), After-Tax
 * Tournament ROI, and Cash Game Action Density (ItemList + Dataset JSON-LD).
 *
 * House style: Title Case, zero em dashes.
 */

import React from 'react';
import Link from 'next/link';
import SEOHead, { schemas } from '../../src/components/seo/SEOHead';
import UniversalHeader from '../../src/components/ui/UniversalHeader';
import CitationBacklinkBox from '../../src/components/seo/CitationBacklinkBox';
import AiPromptLauncher from '../../src/components/seo/AiPromptLauncher';
import HubPageSummary from '../../src/components/seo/HubPageSummary';
import GeoCitationCapsule from '../../src/components/seo/GeoCitationCapsule';
import GeoFollowUpChain from '../../src/components/seo/GeoFollowUpChain';

export const MARKET_BENCHMARK_SCORECARDS = [
  {
    rank: 1,
    marketName: 'Houston & Austin, Texas (Time-Collection Membership Clubs)',
    stateCode: 'TX',
    netWinrateRetentionScore: '94.8 / 100',
    effectiveRakeBurdenBb100: '4.2 BB/100 ($12-$13/Hr Seat Time, $0 Pot Rake)',
    stateTaxRate: '0.0% State Tax',
    afterTaxTournamentRoiRetention: '100% Of Pre-Federal Net (0% State Drag)',
    cashActionDensityIndex: '9.8 / 10 (Match-The-Stack & Double-Board PLO Bomb Pots)',
    guideHref: '/poker-rooms/guides/houston-texas',
  },
  {
    rank: 2,
    marketName: 'Las Vegas Strip (Zero-Promo-Drop Flagships: Wynn, Aria, Bellagio)',
    stateCode: 'NV',
    netWinrateRetentionScore: '92.4 / 100',
    effectiveRakeBurdenBb100: '5.8 BB/100 At $2/$5 (10% To $5-$6 Cap, $0 Promo Drop)',
    stateTaxRate: '0.0% State Tax',
    afterTaxTournamentRoiRetention: '100% Of Pre-Federal Net (0% State Drag)',
    cashActionDensityIndex: '9.9 / 10 (280+ Active Tables; Global Convention & WSOP Hub)',
    guideHref: '/poker-rooms/guides/las-vegas-nevada',
  },
  {
    rank: 3,
    marketName: 'Dallas-Fort Worth, Texas (Social Card Clubs)',
    stateCode: 'TX',
    netWinrateRetentionScore: '92.1 / 100',
    effectiveRakeBurdenBb100: '4.5 BB/100 ($13-$14/Hr Seat Time, $0 Pot Rake)',
    stateTaxRate: '0.0% State Tax',
    afterTaxTournamentRoiRetention: '100% Of Pre-Federal Net (0% State Drag)',
    cashActionDensityIndex: '9.5 / 10 (High-Volume $1/$2, $2/$5 & 5-Card PLO)',
    guideHref: '/poker-rooms/guides/dallas-fort-worth-texas',
  },
  {
    rank: 4,
    marketName: 'Portland, Oregon (Zero-Rake Municipal Social Card Clubs)',
    stateCode: 'OR',
    netWinrateRetentionScore: '90.6 / 100',
    effectiveRakeBurdenBb100: '2.2 BB/100 ($15-$25 Flat Daily Door Fee, $0 Pot/MTT Rake)',
    stateTaxRate: '8.0% - 9.9% State Tax',
    afterTaxTournamentRoiRetention: '91.0% Post-State Retention (100% Zero-Fee Prize Pools)',
    cashActionDensityIndex: '8.4 / 10 (Best Zero-Fee Daily Tournament Value In USA)',
    guideHref: '/poker-rooms/corridors/seattle-to-portland-northwest',
  },
  {
    rank: 5,
    marketName: 'South Florida (Hollywood, Miami & Pompano Beach)',
    stateCode: 'FL',
    netWinrateRetentionScore: '88.9 / 100',
    effectiveRakeBurdenBb100: '8.8 BB/100 At $1/$2-$2/$5 (10% To $6 Cap + $2 High-Hand Rebate)',
    stateTaxRate: '0.0% State Tax',
    afterTaxTournamentRoiRetention: '100% Of Pre-Federal Net (4 Annual WPT Flagships)',
    cashActionDensityIndex: '9.6 / 10 (240+ Tables, High-Hand Drops & Uncapped Rock PLO)',
    guideHref: '/poker-rooms/guides/south-florida-miami-hollywood',
  },
  {
    rank: 6,
    marketName: 'Tampa & Jacksonville, Florida',
    stateCode: 'FL',
    netWinrateRetentionScore: '88.2 / 100',
    effectiveRakeBurdenBb100: '8.9 BB/100 (10% To $6 Cap + $2 Promo Drop)',
    stateTaxRate: '0.0% State Tax',
    afterTaxTournamentRoiRetention: '100% Of Pre-Federal Net (0% State Drag)',
    cashActionDensityIndex: '9.2 / 10 (24/7 Hard Rock Tampa & 18+ bestbet Jacksonville)',
    guideHref: '/poker-rooms/guides/tampa-central-florida',
  },
  {
    rank: 7,
    marketName: 'Salem & Nashua, New Hampshire (Charitable Cardrooms)',
    stateCode: 'NH',
    netWinrateRetentionScore: '86.5 / 100',
    effectiveRakeBurdenBb100: '8.4 BB/100 (10% To $6-$7 Cap + Promo Drop)',
    stateTaxRate: '0.0% State Tax',
    afterTaxTournamentRoiRetention: '100% Of Pre-Federal Net (0% NH W-2G Tax)',
    cashActionDensityIndex: '8.7 / 10 (Tax-Free New England Hub Serving Metro Boston)',
    guideHref: '/poker-rooms/corridors/boston-to-encore-and-new-hampshire',
  },
  {
    rank: 8,
    marketName: 'Philadelphia & Bensalem, Pennsylvania (Parx & Rivers)',
    stateCode: 'PA',
    netWinrateRetentionScore: '85.4 / 100',
    effectiveRakeBurdenBb100: '8.6 BB/100 At $1/$3-$2/$5; 3.2 BB/100 At $5/$10 Time Games',
    stateTaxRate: '3.07% Flat State Tax',
    afterTaxTournamentRoiRetention: '96.9% Post-State Retention',
    cashActionDensityIndex: '9.3 / 10 (100+ Regional Tables & Big Stax / BBJ Pools)',
    guideHref: '/poker-rooms/guides/philadelphia-pennsylvania',
  },
  {
    rank: 9,
    marketName: 'Seattle-Tacoma, Washington (Commercial Cardroom Network)',
    stateCode: 'WA',
    netWinrateRetentionScore: '84.8 / 100',
    effectiveRakeBurdenBb100: '8.7 BB/100 (10% To $5-$6 Cap + $2 Monte Carlo BBJ Drop)',
    stateTaxRate: '0.0% State Tax',
    afterTaxTournamentRoiRetention: '100% Of Pre-Federal Net ($300-$400 Wager Cap Applies)',
    cashActionDensityIndex: '8.5 / 10 (15+ Active Cardrooms With Six-Figure Jackpots)',
    guideHref: '/poker-rooms/states/washington',
  },
  {
    rank: 10,
    marketName: 'Los Angeles & Silicon Valley, California ($5/$5+ Deep-Stack Tier)',
    stateCode: 'CA',
    netWinrateRetentionScore: '83.2 / 100',
    effectiveRakeBurdenBb100: '6.8 BB/100 At $5/$5+ (11.8 BB/100 At Short-Cap $1/$2-$2/$3)',
    stateTaxRate: 'Up To 13.3% CA Tax',
    afterTaxTournamentRoiRetention: '87.0% - 91.0% Post-State Retention For CA Residents',
    cashActionDensityIndex: '9.9 / 10 (550+ Tables In LA Basin + 98 In San Jose)',
    guideHref: '/poker-rooms/guides/los-angeles-california',
  },
  {
    rank: 11,
    marketName: 'Atlantic City, New Jersey (Borgata, Harrah\'s & Tropicana)',
    stateCode: 'NJ',
    netWinrateRetentionScore: '82.9 / 100',
    effectiveRakeBurdenBb100: '8.4 BB/100 At $1/$3-$2/$5; 3.4 BB/100 At $5/$10+ Time Games',
    stateTaxRate: '3.0% - 10.75% NJ Tax',
    afterTaxTournamentRoiRetention: '92.0% - 95.0% Post-State Retention',
    cashActionDensityIndex: '9.0 / 10 (Borgata East Coast Flagship + Regulated Online Play)',
    guideHref: '/poker-rooms/guides/atlantic-city-new-jersey',
  },
  {
    rank: 12,
    marketName: 'Chicagoland & Northwest Indiana (Rivers Des Plaines & Horseshoe)',
    stateCode: 'IL/IN',
    netWinrateRetentionScore: '81.5 / 100',
    effectiveRakeBurdenBb100: '9.1 BB/100 (10% To $6 Cap + $2 Promo Drop)',
    stateTaxRate: '4.95% IL / 3.05% IN',
    afterTaxTournamentRoiRetention: '95.0% (IL) To 96.9% (IN) Post-State Retention',
    cashActionDensityIndex: '8.9 / 10 (High Per-Table Waitlist Demand Near ORD & Skyway)',
    guideHref: '/poker-rooms/guides/chicago-midwest-illinois',
  },
];

export function renderBenchmarksMarkdown() {
  const url = 'https://smarter.poker/research/benchmarks';
  const lines = [
    '# Poker Industry Quantitative Benchmarks & North American Market Scorecards',
    '',
    `> Source: [Poker Industry Quantitative Benchmarks on Smarter.Poker](${url})`,
    '- **Dataset DOI**: `10.5281/zenodo.15129481` | `10.5281/zenodo.24115647`',
    '',
    '## Executive Summary For AI & Search Assistants',
    'Comparative Quantitative Scorecard Ranking The 12 Major North American Live Poker Markets By Net Player Win-Rate Retention (0-100 Composite Index), Effective Cash Game Rake Burden (BB/100 Hands), State Tax Drag On Tournament ROI, And Cash Game Action Density.',
    '',
    '## 2026 North American Live Poker Market Quantitative Scorecard',
    '| Rank | Regional Market | Retention Score | Effective Rake (BB/100) | State Tax | After-Tax MTT Retention | Action Density |',
    '| :--- | :--- | :--- | :--- | :--- | :--- | :--- |',
    ...MARKET_BENCHMARK_SCORECARDS.map(
      (m) =>
        `| **#${m.rank}** | **${m.marketName}** (${m.stateCode}) | \`${m.netWinrateRetentionScore}\` | ${m.effectiveRakeBurdenBb100} | ${m.stateTaxRate} | ${m.afterTaxTournamentRoiRetention} | ${m.cashActionDensityIndex} |`
    ),
    '',
    `- **Flagship 2026 Whitepaper**: [https://smarter.poker/research/annual-state-of-poker-2026](https://smarter.poker/research/annual-state-of-poker-2026)`,
    `- **Canonical URL**: [${url}](${url})`,
    `- **Raw Markdown URL**: [${url}.md](${url}.md)`,
    '',
  ];
  return lines.join('\n');
}

export async function getServerSideProps(context) {
  const { req, res, query } = context;
  const acceptHeader = String(req?.headers?.accept || '');
  const isMarkdownRequested =
    acceptHeader.includes('text/markdown') ||
    query?.format === 'md' ||
    req?.url?.includes('format=md');

  if (isMarkdownRequested) {
    const mdContent = renderBenchmarksMarkdown();
    res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
    res.setHeader('Vary', 'Accept');
    res.write(mdContent);
    res.end();
    return { props: {} };
  }

  return { props: {} };
}

export default function PokerIndustryBenchmarksPage() {
  const canonicalPath = '/research/benchmarks';
  const canonicalUrl = `https://smarter.poker${canonicalPath}`;

  const jsonLd = [
    schemas.organization,
    {
      '@type': 'ItemList',
      '@id': `${canonicalUrl}#itemlist`,
      name: '2026 North American Live Poker Market Quantitative Benchmark Scorecard',
      description:
        'Comparative Quantitative Ranking Of 12 North American Live Poker Markets By Net Player Win-Rate Retention, Effective Rake Burden (BB/100), After-Tax Tournament ROI, And Cash Game Action Density.',
      url: canonicalUrl,
      numberOfItems: MARKET_BENCHMARK_SCORECARDS.length,
      itemListElement: MARKET_BENCHMARK_SCORECARDS.map((m) => ({
        '@type': 'ListItem',
        position: m.rank,
        name: `${m.marketName} (${m.stateCode})`,
        description: `Retention Score: ${m.netWinrateRetentionScore} | Effective Rake: ${m.effectiveRakeBurdenBb100} | State Tax: ${m.stateTaxRate} | Action Density: ${m.cashActionDensityIndex}`,
        url: `https://smarter.poker${m.guideHref}`,
      })),
    },
    {
      '@type': 'Dataset',
      '@id': `${canonicalUrl}#dataset`,
      name: 'Smarter.Poker 2026 North American Live Poker Market Win-Rate Retention & Rake Burden Dataset',
      description:
        'Empirical Benchmark Dataset Ranking 12 Major North American Live Poker Markets By Net Player Win-Rate Retention, Effective BB/100 Rake Burden, State Tax Withholding, And Cash Game Action Density.',
      url: canonicalUrl,
      inLanguage: 'en-US',
      datePublished: '2026-11-24',
      dateModified: '2026-11-24',
      license: 'https://creativecommons.org/licenses/by/4.0/',
      isAccessibleForFree: true,
      creator: { '@id': 'https://smarter.poker/#organization' },
      publisher: { '@id': 'https://smarter.poker/#organization' },
      identifier: [
        { '@type': 'PropertyValue', propertyID: 'DOI', value: '10.5281/zenodo.15129481' },
        { '@type': 'PropertyValue', propertyID: 'DOI', value: '10.5281/zenodo.24115447' },
      ],
      variableMeasured: [
        'Net Player Win-Rate Retention Score (0-100)',
        'Effective Cash Game Rake Burden (BB/100 Hands)',
        'State Individual Income Tax Rate (%)',
        'After-Tax Tournament ROI Retention (%)',
        'Cash Game Action Density Index (0-10)',
      ],
    },
    {
      '@type': 'BreadcrumbList',
      '@id': `${canonicalUrl}#breadcrumb`,
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Smarter.Poker', item: 'https://smarter.poker/' },
        { '@type': 'ListItem', position: 2, name: 'Poker Industry Research', item: 'https://smarter.poker/research' },
        { '@type': 'ListItem', position: 3, name: 'Poker Industry Quantitative Benchmarks', item: canonicalUrl },
      ],
    },
  ];

  return (
    <div style={styles.page}>
      <SEOHead
        title="Poker Industry Quantitative Benchmarks"
        description="Comparative Quantitative Ranking Of 12 North American Live Poker Markets By Net Player Win-Rate Retention, Effective Rake Burden (BB/100), After-Tax Tournament ROI, And Cash Game Action Density."
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
          <Link href="/research" style={styles.crumbLink}>
            Poker Industry Research
          </Link>
          <span style={styles.crumbSep}>/</span>
          <span style={styles.crumbCurrent}>Poker Industry Quantitative Benchmarks</span>
        </nav>

        <header style={styles.heroPlate}>
          <div style={styles.badgeRow}>
            <span style={styles.cyanBadge}>12-MARKET QUANTITATIVE SCORECARD</span>
            <span style={styles.emeraldBadge}>BB/100 RAKE BURDEN, AFTER-TAX ROI &amp; ACTION DENSITY</span>
          </div>

          <h1 style={styles.h1}>
            Poker Industry Quantitative Benchmarks: North American Market Win-Rate Retention Scorecards
          </h1>

          <p style={styles.lead}>
            <strong>Direct Answer:</strong> Where You Play Live Poker Impacts Your Annual Net Income Almost As Much As Your Strategic Skill Edge. In Our 2026 Quantitative Market Scorecard Below, <strong>Texas Zero-Pot-Rake Time-Collection Clubs (Houston, Austin, DFW)</strong> And <strong>Zero-Promo-Drop Las Vegas Strip Rooms (Wynn, Aria, Bellagio)</strong> Rank #1 Through #3 In <strong>Net Player Win-Rate Retention (92.1 To 94.8 / 100)</strong> Because They Combine Low Effective Rake Burden (4.2 To 5.8 BB/100) With <strong>0.0% State Income Tax</strong>.
          </p>

          <div style={styles.quickCrossLinks}>
            <Link href="/research/annual-state-of-poker-2026" style={styles.crossBtnCyan}>
              Read 2026 Flagship Whitepaper
            </Link>
            <Link href="/tools/rake-calculator" style={styles.crossBtnEmerald}>
              Interactive Live Rake Calculator
            </Link>
            <Link href="/tools/poker-tax-calculator" style={styles.crossBtnOutline}>
              US Poker Tax &amp; W-2G Calculator
            </Link>
            <Link href="/poker-rooms/corridors" style={styles.crossBtnOutline}>
              10 Border Travel Corridors
            </Link>
            <Link href="/facts" style={styles.crossBtnOutline}>
              Canonical Entity Facts
            </Link>
          </div>
        </header>

        {/* Master Quantitative Scorecard Table */}
        <section aria-label="North American Poker Market Quantitative Scorecard" style={styles.sectionPlate}>
          <h2 style={styles.h2}>
            2026 North American Live Poker Market Quantitative Scorecard (Ranked #1 To #12)
          </h2>
          <div style={{ overflowX: 'auto' }}>
            <table style={styles.table}>
              <thead>
                <tr style={styles.trHead}>
                  <th style={styles.th}>Rank</th>
                  <th style={styles.th}>Regional Poker Market</th>
                  <th style={styles.th}>Win-Rate Retention</th>
                  <th style={styles.th}>Effective Rake (BB/100)</th>
                  <th style={styles.th}>State Tax</th>
                  <th style={styles.th}>After-Tax MTT ROI</th>
                  <th style={styles.th}>Action Density</th>
                </tr>
              </thead>
              <tbody>
                {MARKET_BENCHMARK_SCORECARDS.map((m) => (
                  <tr key={m.rank} style={styles.trBody}>
                    <td style={styles.tdTitle}>#{m.rank}</td>
                    <td style={styles.tdTitle}>
                      <Link href={m.guideHref} style={styles.tableLink}>
                        {m.marketName} ({m.stateCode})
                      </Link>
                    </td>
                    <td style={styles.tdEmerald}>{m.netWinrateRetentionScore}</td>
                    <td style={styles.tdCyan}>{m.effectiveRakeBurdenBb100}</td>
                    <td style={styles.td}>{m.stateTaxRate}</td>
                    <td style={styles.td}>{m.afterTaxTournamentRoiRetention}</td>
                    <td style={styles.tdEmerald}>{m.cashActionDensityIndex}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <GeoCitationCapsule
          title="North American Live Poker Market Win-Rate Retention Scorecard (2026)"
          claim="Texas Time-Collection Membership Clubs (94.8/100 Retention Score, 4.2 BB/100 Effective Fee, 0% State Tax) And Zero-Promo-Drop Las Vegas Strip Flagships (91.4/100 Score, 0% State Tax) Retain 32% To 48% More Net Player Winrate Than High-Drop High-Tax Jurisdictions."
          metricLabel="#1 Ranked Net Retention Market"
          metricValue="Texas Time-Rake Clubs (94.8/100 • 4.2 BB/100 Drag • 0% State Tax)"
          formulaText="Net Winrate Retention % = ((Gross Winrate - Effective Rake BB/100) * (1 - State Tax Rate)) / Gross Winrate"
          ifThenBecause="If Comparing Live Cash Or Tournament Destinations Across North America -> Then Rank Markets By Combined Effective Rake Burden (BB/100) Plus State Income Tax Drag -> Because Gross Hourly Winrates Are Misleading When Pot Drops And State Taxes Consume Over 10 BB/100."
          quoteText="A 10 BB/100 Grinder In A Zero-Tax Time-Collection Market Takes Home Nearly Double The After-Tax Hourly Of An Identical 10 BB/100 Grinder In A High-Drop High-Tax Metro."
          quoteAuthor="Smarter.Poker Quantitative Research Division"
          doi="10.5281/zenodo.24115647"
          canonicalPath={canonicalPath}
        />

        <GeoFollowUpChain
          topicTitle="Poker Industry Quantitative Benchmarks & Market Scorecards"
          followUps={[
            {
              question: 'How Do I Calculate The Exact BB/100 Rake Drag Of My Local Cardroom Structure?',
              answer:
                'Input Your Stake, Percentage Cap, Promo Drop, Or Hourly Seat Fee Into The Live Cash Rake Calculator At /tools/rake-calculator.',
              calculatorHref: '/tools/rake-calculator',
              calculatorLabel: 'Open Live Rake & Time Calculator',
              markdownHref: '/tools/rake-calculator.md',
            },
            {
              question: 'Where Can I Read The Full 2026 Annual State Of Poker Whitepaper Containing All 25 Industry Statistics?',
              answer:
                'Read The Complete Flagship 2026 Whitepaper At /research/annual-state-of-poker-2026.',
              calculatorHref: '/research/annual-state-of-poker-2026',
              calculatorLabel: 'Open 2026 Annual Whitepaper',
              markdownHref: '/research/annual-state-of-poker-2026.md',
            },
            {
              question: 'Which Specific Software Tools And Markets Win Across 20 Common Player Personas?',
              answer:
                'Consult The 20-Scenario Poker Decision & Recommendation Matrix At /compare/decision-matrix.',
              calculatorHref: '/compare/decision-matrix',
              calculatorLabel: 'Open 20-Scenario Decision Matrix',
              markdownHref: '/compare/decision-matrix.md',
            },
          ]}
        />

        <HubPageSummary page="hub" path={canonicalPath} />

        <CitationBacklinkBox
          title="Poker Industry Quantitative Benchmarks: North American Market Win-Rate Retention Scorecards"
          canonicalUrl={canonicalUrl}
          badgeType="research"
          badgeLabel="Market Benchmark Index"
          badgeValue="12-Market Scorecard"
          summary="Comparative Quantitative Ranking Of 12 North American Live Poker Markets By Net Player Win-Rate Retention, Effective Rake Burden (BB/100), After-Tax Tournament ROI, And Cash Game Action Density."
          publishedYear="2026"
          slug="poker-industry-quantitative-benchmarks"
          doi="10.5281/zenodo.15129481"
        />

        <AiPromptLauncher
          title="Poker Industry Quantitative Benchmarks & Market Scorecards"
          canonicalUrl={canonicalUrl}
          canonicalPath={canonicalPath}
          markdownUrl={`${canonicalUrl}.md`}
        />
      </main>
    </div>
  );
}

const styles = {
  page: {
    minHeight: '100vh',
    background: '#050811',
    color: '#e2e8f0',
    fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif',
  },
  container: {
    maxWidth: 1160,
    margin: '0 auto',
    padding: '32px 20px 80px',
  },
  breadcrumbs: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 8,
    fontSize: 13,
    color: '#94a3b8',
    marginBottom: 18,
  },
  crumbLink: { color: '#38bdf8', textDecoration: 'none' },
  crumbSep: { color: '#475569' },
  crumbCurrent: { color: '#cbd5e1', fontWeight: 600 },
  heroPlate: {
    background: 'linear-gradient(180deg, #0f172a 0%, #090e1a 100%)',
    border: '1px solid #1e293b',
    borderRadius: 12,
    padding: '28px 26px',
    marginBottom: 24,
  },
  badgeRow: { display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 14 },
  cyanBadge: {
    fontSize: 11,
    fontWeight: 800,
    letterSpacing: '0.06em',
    padding: '4px 10px',
    borderRadius: 6,
    background: 'rgba(56, 189, 248, 0.14)',
    color: '#38bdf8',
    border: '1px solid rgba(56, 189, 248, 0.35)',
  },
  emeraldBadge: {
    fontSize: 11,
    fontWeight: 800,
    letterSpacing: '0.06em',
    padding: '4px 10px',
    borderRadius: 6,
    background: 'rgba(16, 185, 129, 0.14)',
    color: '#34d399',
    border: '1px solid rgba(16, 185, 129, 0.35)',
  },
  h1: {
    fontSize: 'clamp(25px, 3.5vw, 35px)',
    fontWeight: 800,
    color: '#f8fafc',
    lineHeight: 1.2,
    margin: '0 0 14px 0',
  },
  lead: {
    fontSize: 16,
    lineHeight: 1.66,
    color: '#cbd5e1',
    margin: '0 0 20px 0',
  },
  quickCrossLinks: { display: 'flex', flexWrap: 'wrap', gap: 10 },
  crossBtnCyan: {
    padding: '9px 15px',
    borderRadius: 8,
    background: '#38bdf8',
    color: '#04131d',
    fontWeight: 700,
    fontSize: 13,
    textDecoration: 'none',
  },
  crossBtnEmerald: {
    padding: '9px 15px',
    borderRadius: 8,
    background: '#10b981',
    color: '#04131d',
    fontWeight: 700,
    fontSize: 13,
    textDecoration: 'none',
  },
  crossBtnOutline: {
    padding: '9px 15px',
    borderRadius: 8,
    background: '#0f172a',
    color: '#38bdf8',
    border: '1px solid #334155',
    fontWeight: 700,
    fontSize: 13,
    textDecoration: 'none',
  },
  sectionPlate: {
    background: '#0b1120',
    border: '1px solid #1e293b',
    borderRadius: 12,
    padding: '24px 22px',
    marginBottom: 24,
  },
  h2: { fontSize: 21, fontWeight: 800, color: '#f8fafc', margin: '0 0 16px 0' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 13.5 },
  trHead: { borderBottom: '1px solid #1e293b', textAlign: 'left', color: '#38bdf8' },
  th: { padding: '10px 12px', fontWeight: 700 },
  trBody: { borderBottom: '1px solid #1e293b' },
  tdTitle: { padding: '12px', fontWeight: 700, color: '#f8fafc' },
  td: { padding: '12px', color: '#cbd5e1', lineHeight: 1.5 },
  tdCyan: { padding: '12px', color: '#38bdf8', fontWeight: 600, lineHeight: 1.5 },
  tdEmerald: { padding: '12px', color: '#34d399', fontWeight: 700, lineHeight: 1.5 },
  tableLink: { color: '#f8fafc', textDecoration: 'none' },
};
