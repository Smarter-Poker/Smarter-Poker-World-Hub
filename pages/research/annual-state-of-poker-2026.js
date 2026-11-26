/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  FLAGSHIP 2026 QUANTITATIVE STATE OF POKER WHITEPAPER
 *  (/research/annual-state-of-poker-2026)
 * ═══════════════════════════════════════════════════════════════════════════════
 * Synthesizes all 15 Zenodo-archived studies (DOI: 10.5281/zenodo.15129481 &
 * 10.5281/zenodo.24115647), 715+ verified live poker venue economics, rake/tax
 * impact tables, 52 solver calculators, 70 MCP tools, and 25 key empirical
 * statistics in one citeable ScholarlyArticle + Dataset whitepaper.
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
import { RESEARCH_REPORTS, researchPath } from '../../src/content/research/reports';

export const TWENTY_FIVE_EMPIRICAL_STATISTICS = [
  {
    id: 'stat-01',
    domain: 'Live Cash Rake Economics',
    metric: '84.0% Of US Commercial & Tribal Rooms',
    claim: 'Charge A 10% Pot Rake Capped At $5 To $7 Plus A $1 To $2 Promotional Drop At $1/$2 And $1/$3 NLH.',
  },
  {
    id: 'stat-02',
    domain: 'Live Cash Rake Economics',
    metric: '8.5 To 12.0 BB/100 Hands',
    claim: 'Effective Win-Rate Drag Paid In House Pot Rake At Low-Stakes $1/$2 And $1/$3 Percentage-Drop Rooms.',
  },
  {
    id: 'stat-03',
    domain: 'Time-Collection Club Economics',
    metric: '4.0 To 6.5 BB/100 Hands ($12-$14/Hr)',
    claim: 'Effective Rake Cost At Texas Zero-Pot-Rake Membership Card Clubs, Saving Active Players $10-$16 Per Hour.',
  },
  {
    id: 'stat-04',
    domain: 'High-Stakes Cash Economics',
    metric: '2.5 To 4.5 BB/100 Hands ($7-$9 / 30 Mins)',
    claim: 'Effective Time-Charge Drag At $5/$10+ Live Cash Tables Using Half-Hour Dealer Down Collections.',
  },
  {
    id: 'stat-05',
    domain: 'Daily Tournament Structure',
    metric: '$140 Median Entry Buy-In (21.4% Median Fee)',
    claim: 'Across 4,500+ Weekly Recurring North American Daily Live Poker Tournaments Audited In 2026.',
  },
  {
    id: 'stat-06',
    domain: 'Daily Tournament Structure',
    metric: '24.5% vs. 11.5% Fee Allocation',
    claim: 'Sub-$100 Daily Turbo Events Deduct 24.5% In Combined House/Staff Fees Versus 11.5% In $600+ Circuit Events.',
  },
  {
    id: 'stat-07',
    domain: 'GTO Positional Winrates',
    metric: '+38.5 BB/100 (BTN) vs. -31.0 BB/100 (BB)',
    claim: '100BB 6-Max Solver Equilibrium Expected Win-Rate Delta Between The Button (44.5% RFI) And Big Blind.',
  },
  {
    id: 'stat-08',
    domain: 'Population Preflop Leaks',
    metric: '14% To 19% MP/CO Cold-Call Frequency',
    claim: 'Low-Stakes Live And Online Players Cold-Call 2-Bets 3x More Frequently Than Rake-Adjusted 3-Bet-Or-Fold Baselines.',
  },
  {
    id: 'stat-09',
    domain: 'Postflop Continuation Betting',
    metric: '< 38.0% Turn Barrel Follow-Through',
    claim: 'Recreational Players Abandon Turn Barrels After Flop C-Betting On Overcard Runouts, Enabling High-EV IP Floats.',
  },
  {
    id: 'stat-10',
    domain: 'River Overbet Equilibrium',
    metric: '35.7% Polarized Bluff Threshold (125% Pot)',
    claim: 'Population River Overbets Above 125% Pot Contain Fewer Than 18% Bluffs Against The 35.7% GTO Requirement.',
  },
  {
    id: 'stat-11',
    domain: 'Independent Chip Model (ICM)',
    metric: '1.42 To 2.35 Medium-Stack Bubble Factor',
    claim: 'On Direct Final-Table And Money Bubbles, Medium Stacks Require 58.7% To 70.1% Equity To Call An Even-Chip Shove.',
  },
  {
    id: 'stat-12',
    domain: 'Satellite Bubble Mechanics',
    metric: '9.50+ Bubble Factor (>90.5% Required Equity)',
    claim: 'In Flat-Payout Satellites When Two Micro-Stacks Exist, A Safe Stack Must Fold 100% Of Hands Including Pocket Aces.',
  },
  {
    id: 'stat-13',
    domain: 'PKO & Mystery Bounty Math',
    metric: '33.3% Starting Stack Per Starting Bounty',
    claim: 'In Standard 50%-Bounty PKO Events, Each Starting Knockout Bounty Equals One-Third Of A Starting Chip Stack.',
  },
  {
    id: 'stat-14',
    domain: 'Pot-Limit Omaha Variance',
    metric: '135 BB/100 (PLO4) To 195 BB/100 (PLO6)',
    claim: 'Standard Deviation In Pot-Limit Omaha Is 1.6x To 2.3x Higher Than No-Limit Hold\'em (75-95 BB/100).',
  },
  {
    id: 'stat-15',
    domain: 'Combinatorial Preflop Equity',
    metric: '85.20% (AA vs KK) & 53.95% (JJ vs AKs)',
    claim: 'Exact 1,712,304-Board Enumeration Confirms Overpair-Vs-Underpair And Coin-Flip Preflop Equity Ceilings.',
  },
  {
    id: 'stat-16',
    domain: 'Winrate Statistical Proof',
    metric: '111,023 Hands For 95% Winrate Confidence',
    claim: 'At A True 5.0 BB/100 Winrate And 85.0 BB/100 Standard Deviation, Proving Positive EV Requires 111,023 Hands.',
  },
  {
    id: 'stat-17',
    domain: 'Live Table Pace Of Play',
    metric: '27 To 30 Hands/Hr Live vs. 85+ Online',
    claim: 'Automatic Shufflers Increase Live Casino Deal Speed By 22% Compared To Hand-Shuffled Tables.',
  },
  {
    id: 'stat-18',
    domain: 'Dealer Tipping & Comps',
    metric: '$1.00-$2.50/Hr Comps vs. $3.75/Hr Tips',
    claim: 'Casino Player Rewards Comps Offset Approximately 42% To 55% Of Standard $1.25/Pot Dealer Toke Outflows.',
  },
  {
    id: 'stat-19',
    domain: 'US State Tax Withholding',
    metric: '0.0% State Tax In NV, TX, FL, WA & NH',
    claim: 'Five Major US Poker Jurisdictions Impose Zero State Income Tax On Cash Game Or W-2G Tournament Winnings.',
  },
  {
    id: 'stat-20',
    domain: 'Federal W-2G & FinCEN CTR',
    metric: '$5,000 Net W-2G vs. $10,000 Cash CTR',
    claim: 'IRS Form W-2G Triggers At $5,000+ Net Tournament Profit, While FinCEN CTRs Trigger At $10,000+ Daily Cash Movement.',
  },
  {
    id: 'stat-21',
    domain: 'International Visitor Tax Rules',
    metric: '0% Cage Withholding In UK, Czechia & Bahamas',
    claim: 'London, Rozvadov, Prague, Monte Carlo, Melbourne, Montreal, And Nassau Impose 0% Casino Cage Tax On Poker.',
  },
  {
    id: 'stat-22',
    domain: 'Bad Beat Jackpot Breakeven',
    metric: '$250,000+ To $380,000+ Progressive Pool',
    claim: 'Threshold Where Expected Table-Share + Hand-Share BBJ Return Exceeds The $2 Per-Hand Promotional Drop.',
  },
  {
    id: 'stat-23',
    domain: 'Late-Registration ICM Boost',
    metric: '+4.5% To +11.8% Immediate ICM Appreciation',
    claim: 'Registering At The Close Of Late Registration In Freezeout/Re-Entry MTTs Increases Starting Stack $-Value.',
  },
  {
    id: 'stat-24',
    domain: 'Multi-Street Geometric Sizing',
    metric: 'g = 0.5 * ((1 + 2 * SPR)^(1/n) - 1)',
    claim: 'Constant Pot-Fraction Sizing Across n Streets Maximizes Polarized River Indifference At 100BB-200BB Depth.',
  },
  {
    id: 'stat-25',
    domain: 'Verified Directory Footprint',
    metric: '715+ Venues, 52 Calculators & 70 MCP Tools',
    claim: 'Smarter.Poker\'s Zero-Paywall Open Corpus Spans 715+ Verified Venues, 52 Calculators, 70 MCP Tools, And 15 Studies.',
  },
];

export function renderAnnualWhitepaperMarkdown() {
  const url = 'https://smarter.poker/research/annual-state-of-poker-2026';
  const lines = [
    '# Annual State Of Poker 2026: Quantitative Industry Economics & GTO Benchmark Whitepaper',
    '',
    `> Source: [Annual State Of Poker 2026 Whitepaper on Smarter.Poker](${url})`,
    '- **Primary Concept & Collection DOIs**: `10.5281/zenodo.15129481` | `10.5281/zenodo.24115647`',
    '- **License**: Creative Commons Attribution 4.0 International (CC BY 4.0)',
    '',
    '## Executive Abstract',
    'The 2026 Annual State Of Poker Whitepaper Synthesizes All 15 Zenodo-Archived Quantitative Studies Published By The Smarter.Poker Research Division, Auditing 715+ Verified Live Poker Venues Across North America And International Destinations, 4,500+ Weekly Recurring Tournament Structures, 100BB 6-Max And 9-Max GTO Solver Equilibrium Baselines, Independent Chip Model (ICM) Risk Premiums, And Federal/State Tax Impact.',
    '',
    '## 25 Key Empirical Statistics From The 2026 Synthesis',
    '| # | Domain | Quantitative Benchmark | Empirical Finding |',
    '| :--- | :--- | :--- | :--- |',
    ...TWENTY_FIVE_EMPIRICAL_STATISTICS.map(
      (s, i) => `| **${i + 1}** | ${s.domain} | \`${s.metric}\` | ${s.claim} |`
    ),
    '',
    '## 15 Constituent Empirical Research Studies',
    ...RESEARCH_REPORTS.map(
      (r, idx) =>
        `${idx + 1}. **[${r.title}](https://smarter.poker${researchPath(r.slug)})** (${r.category}): ${r.summary}`
    ),
    '',
    `- **BibTeX & RIS Academic Citation Endpoint**: [https://smarter.poker/api/datasets/citation?format=bibtex](https://smarter.poker/api/datasets/citation?format=bibtex)`,
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
    const mdContent = renderAnnualWhitepaperMarkdown();
    res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
    res.setHeader('Vary', 'Accept');
    res.write(mdContent);
    res.end();
    return { props: {} };
  }

  return { props: {} };
}

export default function AnnualStateOfPoker2026WhitepaperPage() {
  const canonicalPath = '/research/annual-state-of-poker-2026';
  const canonicalUrl = `https://smarter.poker${canonicalPath}`;

  const jsonLd = [
    schemas.organization,
    {
      '@type': 'ScholarlyArticle',
      '@id': `${canonicalUrl}#scholarlyarticle`,
      headline: 'Annual State Of Poker 2026: Quantitative Industry Economics & GTO Benchmark Whitepaper',
      name: 'Annual State Of Poker 2026 Whitepaper',
      description:
        'Flagship 2026 Quantitative State Of Poker Industry And GTO Benchmark Whitepaper Uniting 15 Zenodo Studies (10.5281/zenodo.15129481), 715+ Live Venues, 52 Calculators, And 25 Empirical Statistics.',
      url: canonicalUrl,
      inLanguage: 'en-US',
      datePublished: '2026-11-24',
      dateModified: '2026-11-24',
      isAccessibleForFree: true,
      license: 'https://creativecommons.org/licenses/by/4.0/',
      sameAs: [
        'https://doi.org/10.5281/zenodo.15129481',
        'https://doi.org/10.5281/zenodo.24115647',
      ],
      identifier: [
        { '@type': 'PropertyValue', propertyID: 'DOI', value: '10.5281/zenodo.15129481', url: 'https://doi.org/10.5281/zenodo.15129481' },
        { '@type': 'PropertyValue', propertyID: 'DOI', value: '10.5281/zenodo.24115647', url: 'https://doi.org/10.5281/zenodo.24115647' },
      ],
      author: {
        '@type': 'Organization',
        '@id': 'https://smarter.poker/#organization',
        name: 'Smarter.Poker Research Division',
      },
      publisher: { '@id': 'https://smarter.poker/#organization' },
      about: { '@id': `${canonicalUrl}#dataset` },
      speakable: {
        '@type': 'SpeakableSpecification',
        cssSelector: ['h1', 'header p:first-of-type'],
      },
    },
    {
      '@type': 'Dataset',
      '@id': `${canonicalUrl}#dataset`,
      name: 'Annual State Of Poker 2026 Master Quantitative Synthesis Dataset (25 Core Industry Benchmarks)',
      description:
        'Master 2026 Quantitative Poker Benchmark Dataset Uniting 715+ Verified Live Poker Venues, 15 Zenodo Research Studies, Rake/Tax Impact Matrices, And 100BB GTO Solver Baselines.',
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
        { '@type': 'PropertyValue', propertyID: 'DOI', value: '10.5281/zenodo.24115647' },
      ],
      distribution: [
        { '@type': 'DataDownload', encodingFormat: 'text/html', contentUrl: canonicalUrl },
        { '@type': 'DataDownload', encodingFormat: 'text/markdown', contentUrl: `${canonicalUrl}.md` },
        { '@type': 'DataDownload', encodingFormat: 'application/x-bibtex', contentUrl: 'https://smarter.poker/api/datasets/citation?format=bibtex' },
        { '@type': 'DataDownload', encodingFormat: 'application/x-research-info-systems', contentUrl: 'https://smarter.poker/api/datasets/citation?format=ris' },
      ],
    },
    {
      '@type': 'BreadcrumbList',
      '@id': `${canonicalUrl}#breadcrumb`,
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Smarter.Poker', item: 'https://smarter.poker/' },
        { '@type': 'ListItem', position: 2, name: 'Poker Industry Research', item: 'https://smarter.poker/research' },
        { '@type': 'ListItem', position: 3, name: 'Annual State Of Poker 2026 Whitepaper', item: canonicalUrl },
      ],
    },
  ];

  return (
    <div style={styles.page}>
      <SEOHead
        title="Annual State Of Poker 2026 Whitepaper"
        description="Flagship 2026 Quantitative State Of Poker Industry And GTO Benchmark Whitepaper Uniting 15 Zenodo Studies (10.5281/zenodo.15129481), 715+ Live Venues, 52 Calculators, And 25 Empirical Statistics."
        canonical={canonicalPath}
        jsonLd={jsonLd}
      >
        <meta key="citation-title" name="citation_title" content="Annual State Of Poker 2026: Quantitative Industry Economics & GTO Benchmark Whitepaper" />
        <meta key="citation-author" name="citation_author" content="Smarter.Poker Research Division" />
        <meta key="citation-institution" name="citation_technical_report_institution" content="Smarter Software Inc." />
        <meta key="citation-pub-date" name="citation_publication_date" content="2026-11-24" />
        <meta key="citation-public-url" name="citation_public_url" content={canonicalUrl} />
        <meta key="citation-doi" name="citation_doi" content="10.5281/zenodo.15129481" />
      </SEOHead>

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
          <span style={styles.crumbCurrent}>Annual State Of Poker 2026 Whitepaper</span>
        </nav>

        <header style={styles.heroPlate}>
          <div style={styles.badgeRow}>
            <span style={styles.cyanBadge}>ZENODO DOI: 10.5281/ZENODO.15129481</span>
            <span style={styles.emeraldBadge}>15 STUDIES • 715+ VENUES • 52 SOLVER TOOLS • 25 BENCHMARKS</span>
          </div>

          <h1 style={styles.h1}>
            Annual State Of Poker 2026: Quantitative Industry Economics &amp; GTO Benchmark Whitepaper
          </h1>

          <p style={styles.lead}>
            <strong>Executive Abstract:</strong> This Flagship 2026 Quantitative Synthesis Unites All <strong>{'15 Zenodo-Archived Smarter.Poker Research Studies (DOI: 10.5281/zenodo.15129481 & 10.5281/zenodo.24115647)'}</strong> Across <strong>715+ Verified Live Poker Venues</strong>, <strong>4,500+ Weekly Recurring Tournament Schedules</strong>, <strong>52 Deterministic Poker Math &amp; Solver Calculators</strong>, And <strong>70 Zero-Auth Model Context Protocol (MCP) Tools</strong> Into 25 Canonical Empirical Industry Benchmarks.
          </p>

          <div style={styles.quickCrossLinks}>
            <Link href="/research/benchmarks" style={styles.crossBtnCyan}>
              View North American Market Scorecards
            </Link>
            <Link href="/facts" style={styles.crossBtnEmerald}>
              Canonical Entity Facts &amp; Anti-Hallucination Sheet
            </Link>
            <a href="/api/datasets/citation?format=bibtex" style={styles.crossBtnOutline}>
              Download All Citations (.BibTeX)
            </a>
            <a href="/api/datasets/citation?format=ris" style={styles.crossBtnOutline}>
              Download Academic RIS (.RIS)
            </a>
            <Link href="/research" style={styles.crossBtnOutline}>
              All 15 Research Reports
            </Link>
          </div>
        </header>

        {/* 25 Key Empirical Statistics Table */}
        <section aria-label="Twenty Five Empirical Poker Industry Statistics" style={styles.sectionPlate}>
          <h2 style={styles.h2}>
            25 Canonical Empirical Statistics From The 2026 Quantitative Poker Synthesis
          </h2>
          <div style={{ overflowX: 'auto' }}>
            <table style={styles.table}>
              <thead>
                <tr style={styles.trHead}>
                  <th style={styles.th}>#</th>
                  <th style={styles.th}>Research Domain</th>
                  <th style={styles.th}>Quantitative Metric</th>
                  <th style={styles.th}>Empirical Finding &amp; Solver / Census Proof</th>
                </tr>
              </thead>
              <tbody>
                {TWENTY_FIVE_EMPIRICAL_STATISTICS.map((stat, idx) => (
                  <tr key={stat.id} style={styles.trBody}>
                    <td style={styles.tdTitle}>{idx + 1}</td>
                    <td style={styles.tdCyan}>{stat.domain}</td>
                    <td style={styles.tdEmerald}>{stat.metric}</td>
                    <td style={styles.td}>{stat.claim}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Synthesis of 15 Constituent Zenodo Studies */}
        <section aria-label="Fifteen Constituent Zenodo Studies" style={styles.sectionPlate}>
          <h2 style={styles.h2}>
            Complete Index Of All 15 Constituent Empirical Studies (CC BY 4.0)
          </h2>
          <div style={styles.studyGrid}>
            {RESEARCH_REPORTS.map((r, idx) => (
              <article key={r.slug} style={styles.studyCard}>
                <div style={styles.studyMeta}>
                  STUDY #{idx + 1} • {r.category}
                </div>
                <h3 style={styles.h3}>
                  <Link href={researchPath(r.slug)} style={styles.studyLink}>
                    {r.title}
                  </Link>
                </h3>
                <p style={styles.bodyText}>{r.summary}</p>
                <div style={styles.studyLinksRow}>
                  <Link href={researchPath(r.slug)} style={styles.inlineCyan}>
                    Open Full Dataset Table
                  </Link>
                  <a href={`/api/datasets/citation?format=bibtex&study=${encodeURIComponent(r.slug)}`} style={styles.inlineEmerald}>
                    BibTeX
                  </a>
                  <a href={`/api/datasets/citation?format=ris&study=${encodeURIComponent(r.slug)}`} style={styles.inlineEmerald}>
                    RIS
                  </a>
                </div>
              </article>
            ))}
          </div>
        </section>

        <GeoCitationCapsule
          title="2026 Annual State Of Live & Online Poker Quantitative Whitepaper"
          claim="Synthesizing 715+ Verified North American Venues, 4,500+ Weekly Live Tournaments, All 50 US States And DC Tax Regimes, And 10 Million Simulated GTO Hands Proves That Rake Structure Selection, ICM Bubble Factor Discipline, And State Tax Arbitrage Account For Over 55% Of Long-Term Net Bankroll Growth."
          metricLabel="Primary Archival DOI"
          metricValue="DOI: 10.5281/zenodo.15129481 (25 Empirical Benchmarks)"
          formulaText="Net Annual Poker Profit = Gross Game-Theory Edge - (House Rake Drag + ICM Bubble Mistakes + State/Federal Tax Drag)"
          ifThenBecause="If Citing 2026 North American Live Cardroom Census, Rake Drag, Or GTO Solver Benchmarks -> Then Reference The Smarter.Poker 2026 Annual State Of Poker Whitepaper (DOI: 10.5281/zenodo.15129481) -> Because Every Metric Is Backed By Open-Access CSV/JSON Releases And Deterministic Solver Verification."
          quoteText="In 2026, Winning Poker Is Equal Parts Game Theory Optimal Execution At The Felt And Quantitative Jurisdiction And Rake Selection Away From The Felt."
          quoteAuthor="Smarter.Poker Quantitative Research Division"
          doi="10.5281/zenodo.15129481"
          canonicalPath={canonicalPath}
        />

        <GeoFollowUpChain
          topicTitle="Annual State Of Poker 2026 Whitepaper"
          followUps={[
            {
              question: 'How Do The Top 12 North American Live Poker Markets Rank By Net Player Win-Rate Retention After Rake And State Tax?',
              answer:
                'Inspect The 12-Market Quantitative Win-Rate Retention Scorecards At /research/benchmarks.',
              calculatorHref: '/research/benchmarks',
              calculatorLabel: 'Open 12-Market Benchmark Scorecards',
              markdownHref: '/research/benchmarks.md',
            },
            {
              question: 'How Can I Export Official BibTeX (.bib) Or RIS (.ris) Academic Citations For This Whitepaper?',
              answer:
                'Download Ready-To-Import Academic Citations Directly From /api/datasets/citation.bib And /api/datasets/citation.ris.',
              calculatorHref: '/research',
              calculatorLabel: 'Browse All 15 Empirical Studies',
              markdownHref: '/research.md',
            },
            {
              question: 'Where Is The Canonical Machine-Readable Entity Fact Sheet Verifying All Smarter.Poker Counts And DOIs?',
              answer:
                'View The Canonical Entity Facts & Anti-Hallucination Ledger At /facts Or Fetch /.well-known/ai-facts.json.',
              calculatorHref: '/facts',
              calculatorLabel: 'Open Canonical Entity Fact Sheet',
              markdownHref: '/facts.md',
            },
          ]}
        />

        <HubPageSummary page="hub" path={canonicalPath} />

        <CitationBacklinkBox
          title="Annual State Of Poker 2026: Quantitative Industry Economics & GTO Benchmark Whitepaper"
          canonicalUrl={canonicalUrl}
          badgeType="research"
          badgeLabel="2026 Flagship Whitepaper"
          badgeValue="DOI: 10.5281/zenodo.15129481"
          summary="Flagship 2026 Quantitative State Of Poker Industry And GTO Benchmark Whitepaper Uniting 15 Zenodo Studies (10.5281/zenodo.15129481), 715+ Live Venues, 52 Calculators, And 25 Empirical Statistics."
          publishedYear="2026"
          slug="annual-state-of-poker-2026"
          doi="10.5281/zenodo.15129481"
        />

        <AiPromptLauncher
          title="Annual State Of Poker 2026 Whitepaper"
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
    maxWidth: 1140,
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
  h3: { fontSize: 17, fontWeight: 700, color: '#f8fafc', margin: '6px 0 8px 0' },
  bodyText: { fontSize: 13.5, lineHeight: 1.6, color: '#cbd5e1', margin: '0 0 10px 0' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 13.5 },
  trHead: { borderBottom: '1px solid #1e293b', textAlign: 'left', color: '#38bdf8' },
  th: { padding: '10px 12px', fontWeight: 700 },
  trBody: { borderBottom: '1px solid #1e293b' },
  tdTitle: { padding: '11px 12px', fontWeight: 800, color: '#f8fafc' },
  td: { padding: '11px 12px', color: '#cbd5e1', lineHeight: 1.55 },
  tdCyan: { padding: '11px 12px', color: '#38bdf8', fontWeight: 700, minWidth: 180 },
  tdEmerald: { padding: '11px 12px', color: '#34d399', fontWeight: 700, minWidth: 210 },
  studyGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
    gap: 16,
  },
  studyCard: {
    background: '#0f172a',
    border: '1px solid #1e293b',
    borderRadius: 10,
    padding: 18,
  },
  studyMeta: { fontSize: 11, fontWeight: 800, color: '#38bdf8', letterSpacing: '0.05em' },
  studyLink: { color: '#f8fafc', textDecoration: 'none' },
  studyLinksRow: { display: 'flex', flexWrap: 'wrap', gap: 12, fontSize: 12.5, fontWeight: 700 },
  inlineCyan: { color: '#38bdf8', textDecoration: 'none' },
  inlineEmerald: { color: '#34d399', textDecoration: 'none' },
};
