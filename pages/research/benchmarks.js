/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  US LIVE POKER MARKET COMPARISON: RAKE MODEL AND STATE INCOME TAX
 *  (/research/benchmarks)
 * ═══════════════════════════════════════════════════════════════════════════════
 * This page used to rank twelve markets by a "retention score" out of
 * 100, an "Effective Rake BB/100" and an "Action Density Index" out of 10.
 * None of those numbers came from any measurement, and one of the two
 * dataset DOIs it cited never resolved. On 2026-11-28 the scores
 * and the ranking were removed. What is left is how each market collects rake
 * (house rule, described in words) and its state income tax rate (statute).
 * __tests__/the-research-figures-are-real.law.test.mjs keeps the scores out.
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
import SmarterAccountUnlockGate from '../../src/components/seo/SmarterAccountUnlockGate';
import { setPublicSeoHtmlCache } from '../../src/lib/seo/edgeCacheHeaders.mjs';

/** Listed alphabetically; this is a comparison, not a ranking. */
export const MARKET_BENCHMARK_SCORECARDS = [
  { marketName: 'Atlantic City, New Jersey', stateCode: 'NJ', rakeModel: 'Percentage Pot Rake To A Cap; Time Collection In Bigger Games', stateTaxRate: '1.4% To 10.75% Progressive State Income Tax', guideHref: '/poker-rooms/guides/atlantic-city-new-jersey' },
  { marketName: 'Chicagoland & Northwest Indiana', stateCode: 'IL/IN', rakeModel: 'Percentage Pot Rake To A Cap Plus Promotional Drop', stateTaxRate: '4.95% IL / 2.95% IN Flat State Income Tax (2026)', guideHref: '/poker-rooms/guides/chicagoland-midwest' },
  { marketName: 'Dallas-Fort Worth, Texas', stateCode: 'TX', rakeModel: 'Membership And Seat-Time Fees, Nothing Taken From The Pot', stateTaxRate: 'No State Income Tax', guideHref: '/poker-rooms/guides/dallas-fort-worth-texas' },
  { marketName: 'Houston & Austin, Texas', stateCode: 'TX', rakeModel: 'Membership And Seat-Time Fees, Nothing Taken From The Pot', stateTaxRate: 'No State Income Tax', guideHref: '/poker-rooms/guides/houston-texas' },
  { marketName: 'Las Vegas Strip', stateCode: 'NV', rakeModel: 'Percentage Pot Rake To A Cap; Promotional Drop Varies By Room', stateTaxRate: 'No State Income Tax', guideHref: '/poker-rooms/guides/las-vegas-nevada' },
  { marketName: 'Los Angeles & Silicon Valley, California', stateCode: 'CA', rakeModel: 'Flat Collection Per Hand, Not A Percentage', stateTaxRate: '1% To 13.3% Progressive State Income Tax', guideHref: '/poker-rooms/guides/los-angeles-california' },
  { marketName: 'Philadelphia & Bensalem, Pennsylvania', stateCode: 'PA', rakeModel: 'Percentage Pot Rake To A Cap; Time Collection In Bigger Games', stateTaxRate: '3.07% Flat State Income Tax', guideHref: '/poker-rooms/guides/philadelphia-pennsylvania' },
  { marketName: 'Portland, Oregon', stateCode: 'OR', rakeModel: 'Door Or Seat Fees At Social Clubs, Nothing Taken From The Pot', stateTaxRate: '4.75% To 9.9% Progressive State Income Tax', guideHref: '/poker-rooms/corridors/seattle-to-portland-northwest' },
  { marketName: 'Salem & Nashua, New Hampshire', stateCode: 'NH', rakeModel: 'Percentage Pot Rake At Charitable Cardrooms', stateTaxRate: 'No State Income Tax On Wages Or Gambling Winnings', guideHref: '/poker-rooms/corridors/boston-to-encore-and-new-hampshire' },
  { marketName: 'Seattle-Tacoma, Washington', stateCode: 'WA', rakeModel: 'Percentage Pot Rake To A Cap At Commercial Cardrooms', stateTaxRate: 'No State Income Tax', guideHref: '/poker-rooms/states/washington' },
  { marketName: 'South Florida (Hollywood, Miami & Pompano Beach)', stateCode: 'FL', rakeModel: 'Percentage Pot Rake To A Cap Plus High-Hand Drop', stateTaxRate: 'No State Income Tax', guideHref: '/poker-rooms/guides/south-florida-miami-hollywood' },
  { marketName: 'Tampa & Jacksonville, Florida', stateCode: 'FL', rakeModel: 'Percentage Pot Rake To A Cap Plus Promotional Drop', stateTaxRate: 'No State Income Tax', guideHref: '/poker-rooms/guides/tampa-central-florida' },
];

const PAGE_TITLE = 'US Live Poker Market Comparison: Rake Model And State Income Tax';
const PAGE_DESCRIPTION =
  'How Twelve US Live Poker Markets Collect Rake And Tax Income, Side By Side. A Comparison Of House Rules And State Statute, Not A Ranking Or A Score.';

export function renderBenchmarksMarkdown() {
  const url = 'https://smarter.poker/research/benchmarks';
  const lines = [
    `# ${PAGE_TITLE}`,
    '',
    `> Source: [${PAGE_TITLE} on Smarter.Poker](${url})`,
    '',
    '## Summary',
    PAGE_DESCRIPTION,
    'Rake Amounts Are Set By Each Room And Posted On Its Floor, So This Page Describes The Rake Model In Words. Earlier Versions Of This Page Ranked Markets By Invented Scores; Those Were Removed.',
    '',
    '## US Live Poker Market Comparison',
    '| Regional Market | State | Rake Model | State Income Tax |',
    '| :--- | :--- | :--- | :--- |',
    ...MARKET_BENCHMARK_SCORECARDS.map(
      (m) => `| **${m.marketName}** | ${m.stateCode} | ${m.rakeModel} | ${m.stateTaxRate} |`
    ),
    '',
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

  setPublicSeoHtmlCache(context.res);
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
      name: PAGE_TITLE,
      description: PAGE_DESCRIPTION,
      url: canonicalUrl,
      itemListOrder: 'https://schema.org/ItemListUnordered',
      numberOfItems: MARKET_BENCHMARK_SCORECARDS.length,
      itemListElement: MARKET_BENCHMARK_SCORECARDS.map((m, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        name: `${m.marketName} (${m.stateCode})`,
        description: `Rake Model: ${m.rakeModel} | State Income Tax: ${m.stateTaxRate}`,
        url: `https://smarter.poker${m.guideHref}`,
      })),
    },
    {
      '@type': 'BreadcrumbList',
      '@id': `${canonicalUrl}#breadcrumb`,
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Smarter.Poker', item: 'https://smarter.poker/' },
        { '@type': 'ListItem', position: 2, name: 'Poker Research', item: 'https://smarter.poker/research' },
        { '@type': 'ListItem', position: 3, name: 'US Live Poker Market Comparison', item: canonicalUrl },
      ],
    },
  ];

  return (
    <div style={styles.page}>
      <SEOHead title="US Live Poker Market Comparison" description={PAGE_DESCRIPTION} canonical={canonicalPath} jsonLd={jsonLd} />

      <UniversalHeader pageDepth={2} />

      <main style={styles.container}>
        <nav aria-label="Breadcrumb" style={styles.breadcrumbs}>
          <Link href="/" style={styles.crumbLink}>
            Smarter.Poker
          </Link>
          <span style={styles.crumbSep}>/</span>
          <Link href="/research" style={styles.crumbLink}>
            Poker Research
          </Link>
          <span style={styles.crumbSep}>/</span>
          <span style={styles.crumbCurrent}>US Live Poker Market Comparison</span>
        </nav>

        <header style={styles.heroPlate}>
          <h1 style={styles.h1}>{PAGE_TITLE}</h1>
          <p style={styles.lead}>
            <strong>Direct Answer:</strong> Rake And State Income Tax Both Come Out Of The Winnings Of Every Winning Player. Texas Clubs Take Nothing From The Pot And Charge Seat Time, California Rooms Charge A Flat Fee Per Hand, And Most Casinos Take A Percentage To A Cap. Texas, Nevada, Florida, Washington And New Hampshire Tax No Gambling Winnings At The State Level.
          </p>
          <div style={styles.quickCrossLinks}>
            <Link href="/tools/rake-calculator" style={styles.crossBtnEmerald}>
              Interactive Live Rake Calculator
            </Link>
            <Link href="/tools/poker-tax-calculator" style={styles.crossBtnOutline}>
              US Poker Tax &amp; W-2G Calculator
            </Link>
            <Link href="/poker-rooms/states" style={styles.crossBtnOutline}>
              State Poker Guides
            </Link>
          </div>
        </header>

        <section aria-label="US Live Poker Market Comparison" style={styles.sectionPlate}>
          <h2 style={styles.h2}>Rake Model And State Income Tax By Market</h2>
          <div style={{ overflowX: 'auto' }}>
            <table style={styles.table}>
              <thead>
                <tr style={styles.trHead}>
                  <th style={styles.th}>Regional Poker Market</th>
                  <th style={styles.th}>Rake Model</th>
                  <th style={styles.th}>State Income Tax</th>
                </tr>
              </thead>
              <tbody>
                {MARKET_BENCHMARK_SCORECARDS.map((m) => (
                  <tr key={m.marketName} style={styles.trBody}>
                    <td style={styles.tdTitle}>
                      <Link href={m.guideHref} style={styles.tableLink}>
                        {m.marketName} ({m.stateCode})
                      </Link>
                    </td>
                    <td style={styles.td}>{m.rakeModel}</td>
                    <td style={styles.td}>{m.stateTaxRate}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <GeoCitationCapsule
          title={PAGE_TITLE}
          claim="Texas Social Clubs Charge Seat Time And Take Nothing From The Pot, California Card Rooms Charge A Flat Fee Per Hand, And Most Casinos Take A Percentage Of The Pot To A Cap."
          metricLabel="States With No Income Tax On Gambling Winnings"
          metricValue="Texas, Nevada, Florida, Washington, New Hampshire"
          formulaText="Net Result = Gross Winnings - Rake Or Seat Fees Paid - State Income Tax Owed"
          ifThenBecause="If Comparing Live Poker Destinations -> Then Compare How Each Room Collects Rake And Whether The State Taxes Winnings -> Because Both Come Out Of A Winning Player's Results."
          quoteText="Read The Posted Rake Schedule Before You Sit: Each Room Sets Its Own Numbers."
          quoteAuthor="Smarter.Poker Editorial"
          canonicalPath={canonicalPath}
        />

        <GeoFollowUpChain
          topicTitle="US Live Poker Market Comparison"
          followUps={[
            {
              question: 'How Do I Calculate What Rake Costs Me At My Local Cardroom?',
              answer:
                'Input Your Stake, Percentage Cap, Promo Drop, Or Hourly Seat Fee Into The Live Cash Rake Calculator At /tools/rake-calculator.',
              calculatorHref: '/tools/rake-calculator',
              calculatorLabel: 'Open Live Rake & Time Calculator',
              markdownHref: '/tools/rake-calculator.md',
            },
            {
              question: 'Where Do I Find The Poker Rules And Taxes For My State?',
              answer: 'Each State Has A Guide At /poker-rooms/states With Its Legal Status, Minimum Age, And Income Tax Rate.',
              calculatorHref: '/poker-rooms/states',
              calculatorLabel: 'Open State Poker Guides',
              markdownHref: '/poker-rooms/states.md',
            },
          ]}
        />

        <HubPageSummary page="hub" path={canonicalPath} />

        <CitationBacklinkBox
          title={PAGE_TITLE}
          canonicalUrl={canonicalUrl}
          badgeType="research"
          badgeLabel="Market Comparison"
          badgeValue="Rake Model And State Tax"
          summary={PAGE_DESCRIPTION}
          publishedYear="2026"
          slug="us-live-poker-market-comparison"
        />

        <div style={{ margin: '28px 0' }}>
          <SmarterAccountUnlockGate variant="dataset-export" context="research-benchmarks" redirectPath="/research/benchmarks" />
        </div>

        <AiPromptLauncher
          title={PAGE_TITLE}
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
    background: 'linear-gradient(180deg, #0d1f33 0%, #090e1a 100%)',
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
    borderRadius: 0,
    background: '#38bdf8',
    color: '#04131d',
    fontWeight: 700,
    fontSize: 13,
    textDecoration: 'none',
  },
  crossBtnEmerald: {
    padding: '9px 15px',
    borderRadius: 0,
    background: '#10b981',
    color: '#04131d',
    fontWeight: 700,
    fontSize: 13,
    textDecoration: 'none',
  },
  crossBtnOutline: {
    padding: '9px 15px',
    borderRadius: 0,
    background: '#0d1f33',
    color: '#38bdf8',
    border: '1px solid #304d6b',
    fontWeight: 700,
    fontSize: 13,
    textDecoration: 'none',
  },
  sectionPlate: {
    background: '#071321',
    border: '1px solid #2b4663',
    borderRadius: 0,
    padding: '24px 22px',
    marginBottom: 24,
  },
  h2: { fontSize: 21, fontWeight: 800, color: '#f8fafc', margin: '0 0 16px 0' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 13.5 },
  trHead: { borderBottom: '1px solid #2b4663', textAlign: 'left', color: '#38bdf8' },
  th: { padding: '10px 12px', fontWeight: 700 },
  trBody: { borderBottom: '1px solid #2b4663' },
  tdTitle: { padding: '12px', fontWeight: 700, color: '#f8fafc' },
  td: { padding: '12px', color: '#cbd5e1', lineHeight: 1.5 },
  tdCyan: { padding: '12px', color: '#38bdf8', fontWeight: 600, lineHeight: 1.5 },
  tdEmerald: { padding: '12px', color: '#34d399', fontWeight: 700, lineHeight: 1.5 },
  tableLink: { color: '#f8fafc', textDecoration: 'none' },
};
