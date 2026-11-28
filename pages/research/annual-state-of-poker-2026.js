/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  FLAGSHIP 2026 QUANTITATIVE STATE OF POKER WHITEPAPER
 *  (/research/annual-state-of-poker-2026)
 * ═══════════════════════════════════════════════════════════════════════════════
 * Collects the research-page figures that have a real basis (computed math,
 * statute, dated directory reads), each labelled with that basis.
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
import { RESEARCH_REPORTS, researchPath, RESEARCH_ARCHIVE_NOTE } from '../../src/content/research/reports';
import { setPublicSeoHtmlCache } from '../../src/lib/seo/edgeCacheHeaders.mjs';
import { VENUE_COUNT_LABEL, VENUE_STATE_COUNT } from '../../src/lib/venueCount.mjs';
import {
  TOURNAMENT_WEEK_EVENTS,
  TOURNAMENT_WEEK_MEDIAN_BUY_IN,
  TOURNAMENT_WEEK_VENUES,
  TOURNAMENT_SNAPSHOT_WEEK_START,
  TOURNAMENT_SNAPSHOT_WEEK_END,
} from '../../src/lib/research/tournamentDirectoryFacts.mjs';
import { AA_VS_KK, JJ_VS_AKS } from '../../src/lib/research/holdemFacts.mjs';
import { pct } from '../../src/lib/research/shortDeckFacts.mjs';

/**
 * The figures this whitepaper states, each with its basis.
 *
 * It used to list twenty-five "empirical statistics". On 2026-11-28 each was
 * checked: sixteen came from surveys, audits or simulations that never ran
 * (rake shares, fee ratios, population frequencies, toke offsets, bad beat
 * breakevens and the rest) and were removed, and "AA Vs KK 85.20%" was
 * wrong (the exact enumeration gives 81.3%). What remains is arithmetic,
 * statute, or a directory read. __tests__/the-research-figures-are-real.law.test.mjs
 * pins this list.
 */
export const WHITEPAPER_DESCRIPTION =
  'The Smarter.Poker 2026 Whitepaper: Exact Poker Math, US Poker Tax Rules, And Dated Directory Data From The Research Pages, Each Figure Labelled With Its Basis.';

export const WHITEPAPER_FIGURES = [
  {
    id: 'fig-01',
    domain: 'River Bet-Sizing Math',
    basis: 'Computed',
    metric: '35.7% Bluffs At A 125% Pot Bet',
    claim: 'A Balanced River Bet Of 125% Pot Contains Bet / (Pot + 2 x Bet) = 35.7% Bluffs, Which Is Also The Equity A Bluff-Catcher Needs To Call.',
  },
  {
    id: 'fig-02',
    domain: 'Independent Chip Model (ICM)',
    basis: 'Computed',
    metric: 'Bubble Factor 2.0 Needs 66.7% Equity',
    claim: 'With Bubble Factor B, Calling An Even-Stack All-In Needs B / (B + 1) Equity, Against 50% In Chip-EV.',
  },
  {
    id: 'fig-03',
    domain: 'PKO Bounty Rules',
    basis: 'Computed',
    metric: '25% Of The Buy-In In Cash',
    claim: 'In A PKO Where Half The Buy-In Funds Bounties, Half Of A Collected Starting Bounty Is Paid In Cash: A Quarter Of The Buy-In.',
  },
  {
    id: 'fig-04',
    domain: 'Combinatorial Preflop Equity',
    basis: 'Computed',
    metric: `${pct(AA_VS_KK)} (AA Vs KK) & ${pct(JJ_VS_AKS)} (JJ Vs AKs)`,
    claim: 'Exact Enumeration Of All 1,712,304 Boards (Aces And Jacks In Spades And Hearts; Kings, And Ace-King Suited, In The Other Suits).',
  },
  {
    id: 'fig-05',
    domain: 'Winrate Statistical Proof',
    basis: 'Computed',
    metric: '111,023 Hands For 95% Confidence',
    claim: 'At A True 5.0 BB/100 Winrate And 85.0 BB/100 Standard Deviation, The 95% Interval Excludes Zero After (1.96 x 85 / 5)^2 x 100 = 111,023 Hands.',
  },
  {
    id: 'fig-06',
    domain: 'Multi-Street Geometric Sizing',
    basis: 'Computed',
    metric: 'g = 0.5 * ((1 + 2 * SPR)^(1/n) - 1)',
    claim: 'Betting The Same Fraction g Of The Pot On Each Of n Streets Gets Stacks All In By The River.',
  },
  {
    id: 'fig-07',
    domain: 'US State Income Tax',
    basis: 'Statute',
    metric: 'No State Income Tax In NV, TX, FL, WA & NH',
    claim: 'These Five States Levy No Personal Income Tax On Gambling Winnings.',
  },
  {
    id: 'fig-08',
    domain: 'Federal W-2G & FinCEN CTR',
    basis: 'Statute',
    metric: 'W-2G Over 5,000 Net; CTR Over 10,000 Cash',
    claim: 'Form W-2G Reports Poker Tournament Winnings Over 5,000 Dollars Net Of The Buy-In; A FinCEN CTR Covers Cash Over 10,000 Dollars In One Gaming Day. From Tax Year 2026 Only 90% Of Gambling Losses Are Deductible.',
  },
  {
    id: 'fig-09',
    domain: 'Tournament Directory',
    basis: 'Directory Data',
    metric: `${TOURNAMENT_WEEK_EVENTS} Events, Median Buy-In ${TOURNAMENT_WEEK_MEDIAN_BUY_IN}`,
    claim: `Live Tournaments The Smarter.Poker Directory Listed At ${TOURNAMENT_WEEK_VENUES} Venues For ${TOURNAMENT_SNAPSHOT_WEEK_START} To ${TOURNAMENT_SNAPSHOT_WEEK_END}.`,
  },
  {
    id: 'fig-10',
    domain: 'Listed Directory Footprint',
    basis: 'Directory Data',
    metric: `${VENUE_COUNT_LABEL} Listed US Poker Rooms`,
    claim: `The Smarter.Poker Directory Lists ${VENUE_COUNT_LABEL} US Poker Rooms Across ${VENUE_STATE_COUNT} States.`,
  },
];

export function renderAnnualWhitepaperMarkdown() {
  const url = 'https://smarter.poker/research/annual-state-of-poker-2026';
  const lines = [
    '# Annual State Of Poker 2026: Poker Math, Tax Rules And Directory Data Whitepaper',
    '',
    `> Source: [Annual State Of Poker 2026 Whitepaper on Smarter.Poker](${url})`,
    `- **Archive DOI**: \`10.5281/zenodo.24115647\` (${RESEARCH_ARCHIVE_NOTE})`,
    '- **License**: Creative Commons Attribution 4.0 International (CC BY 4.0)',
    '',
    '## Executive Abstract',
    `This Whitepaper Collects The Figures From The ${RESEARCH_REPORTS.length} Smarter.Poker Research Pages That Have A Real Basis: Exact Poker Mathematics, Federal And State Tax Statute, And Dated Reads Of The Smarter.Poker Directory Of ${VENUE_COUNT_LABEL} Listed US Poker Rooms. Earlier Versions Listed Statistics From Surveys And Simulations That Were Never Run; Those Were Removed.`,
    '',
    '## Key Figures And Their Basis',
    '| # | Domain | Figure | Basis | What It Means |',
    '| :--- | :--- | :--- | :--- | :--- |',
    ...WHITEPAPER_FIGURES.map(
      (s, i) => `| **${i + 1}** | ${s.domain} | \`${s.metric}\` | ${s.basis} | ${s.claim} |`
    ),
    '',
    '## The Research Pages',
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

  setPublicSeoHtmlCache(context.res);
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
      headline: 'Annual State Of Poker 2026: Poker Math, Tax Rules And Directory Data Whitepaper',
      name: 'Annual State Of Poker 2026 Whitepaper',
      description:
        WHITEPAPER_DESCRIPTION,
      url: canonicalUrl,
      inLanguage: 'en-US',
      datePublished: '2026-11-24',
      dateModified: '2026-11-24',
      isAccessibleForFree: true,
      license: 'https://creativecommons.org/licenses/by/4.0/',
      sameAs: ['https://doi.org/10.5281/zenodo.24115647'],
      identifier: [
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
      name: 'Annual State Of Poker 2026 Figures And Their Basis',
      description:
        WHITEPAPER_DESCRIPTION,
      url: canonicalUrl,
      inLanguage: 'en-US',
      datePublished: '2026-11-24',
      dateModified: '2026-11-24',
      license: 'https://creativecommons.org/licenses/by/4.0/',
      isAccessibleForFree: true,
      creator: { '@id': 'https://smarter.poker/#organization' },
      publisher: { '@id': 'https://smarter.poker/#organization' },
      identifier: [
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
        description={WHITEPAPER_DESCRIPTION}
        canonical={canonicalPath}
        jsonLd={jsonLd}
      >
        <meta key="citation-title" name="citation_title" content="Annual State Of Poker 2026: Poker Math, Tax Rules And Directory Data Whitepaper" />
        <meta key="citation-author" name="citation_author" content="Smarter.Poker Research Division" />
        <meta key="citation-institution" name="citation_technical_report_institution" content="Smarter Software Inc." />
        <meta key="citation-pub-date" name="citation_publication_date" content="2026-11-24" />
        <meta key="citation-public-url" name="citation_public_url" content={canonicalUrl} />
        <meta key="citation-doi" name="citation_doi" content="10.5281/zenodo.24115647" />
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
            <span style={styles.cyanBadge}>ZENODO DOI: 10.5281/ZENODO.24115647</span>
            <span style={styles.emeraldBadge}>EVERY FIGURE LABELLED WITH ITS BASIS</span>
          </div>

          <h1 style={styles.h1}>
            Annual State Of Poker 2026: Poker Math, Tax Rules And Directory Data Whitepaper
          </h1>

          <p style={styles.lead}>
            <strong>Executive Abstract:</strong> This Whitepaper Collects The Figures From The Smarter.Poker Research Pages That Have A Real Basis: <strong>Exact Poker Mathematics</strong>, <strong>Federal And State Tax Statute</strong>, And <strong>Dated Reads Of The Smarter.Poker Directory Of {VENUE_COUNT_LABEL} Listed US Poker Rooms</strong>. Every Figure Below Names Its Basis. No Figure Comes From A Survey, Because None Was Run.
          </p>

          <div style={styles.quickCrossLinks}>
            <Link href="/research/benchmarks" style={styles.crossBtnCyan}>
              View US Market Comparison
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
              All Research Pages
            </Link>
          </div>
        </header>

        {/* Key Figures Table */}
        <section aria-label="Key Figures And Their Basis" style={styles.sectionPlate}>
          <h2 style={styles.h2}>
            Key Figures And Their Basis
          </h2>
          <div style={{ overflowX: 'auto' }}>
            <table style={styles.table}>
              <thead>
                <tr style={styles.trHead}>
                  <th style={styles.th}>#</th>
                  <th style={styles.th}>Research Domain</th>
                  <th style={styles.th}>Figure</th>
                  <th style={styles.th}>Basis</th>
                  <th style={styles.th}>What It Means</th>
                </tr>
              </thead>
              <tbody>
                {WHITEPAPER_FIGURES.map((stat, idx) => (
                  <tr key={stat.id} style={styles.trBody}>
                    <td style={styles.tdTitle}>{idx + 1}</td>
                    <td style={styles.tdCyan}>{stat.domain}</td>
                    <td style={styles.tdEmerald}>{stat.metric}</td>
                    <td style={styles.td}>{stat.basis}</td>
                    <td style={styles.td}>{stat.claim}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Research Pages */}
        <section aria-label="All Smarter.Poker Research Pages" style={styles.sectionPlate}>
          <h2 style={styles.h2}>
            All Smarter.Poker Research Pages (CC BY 4.0)
          </h2>
          <div style={styles.studyGrid}>
            {RESEARCH_REPORTS.map((r, idx) => (
              <article key={r.slug} style={styles.studyCard}>
                <div style={styles.studyMeta}>
                  PAGE #{idx + 1} • {r.category}
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
          title="Annual State Of Poker 2026 Whitepaper"
          claim="Rake, ICM Mistakes And Tax All Come Out Of A Winning Player's Edge, So Room Choice, Bubble Discipline And Where You Play Matter Alongside Strategy At The Table."
          metricLabel="Primary Archival DOI"
          metricValue="DOI: 10.5281/zenodo.24115647 (Archive Of Earlier Page Text)"
          formulaText="Net Annual Poker Profit = Gross Game-Theory Edge - (House Rake Drag + ICM Bubble Mistakes + State/Federal Tax Drag)"
          ifThenBecause="If Citing A Figure From This Whitepaper -> Then Cite The Basis Shown Next To It -> Because Each Figure Is Exact Math, A Statute, Or A Dated Directory Read, And Says Which."
          quoteText="Winning Poker Is Decisions At The Felt Plus Choices Away From It: Which Room, Which Rake, Which State."
          quoteAuthor="Smarter.Poker Editorial"
          doi="10.5281/zenodo.24115647"
          canonicalPath={canonicalPath}
        />

        <GeoFollowUpChain
          topicTitle="Annual State Of Poker 2026 Whitepaper"
          followUps={[
            {
              question: 'How Do Twelve US Live Poker Markets Compare On Rake Model And State Income Tax?',
              answer:
                'See The Side-By-Side Market Comparison At /research/benchmarks.',
              calculatorHref: '/research/benchmarks',
              calculatorLabel: 'Open US Market Comparison',
              markdownHref: '/research/benchmarks.md',
            },
            {
              question: 'How Can I Export Official BibTeX (.bib) Or RIS (.ris) Academic Citations For This Whitepaper?',
              answer:
                'Download Ready-To-Import Academic Citations Directly From /api/datasets/citation.bib And /api/datasets/citation.ris.',
              calculatorHref: '/research',
              calculatorLabel: 'Browse All Research Pages',
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
          title="Annual State Of Poker 2026: Poker Math, Tax Rules And Directory Data Whitepaper"
          canonicalUrl={canonicalUrl}
          badgeType="research"
          badgeLabel="2026 Flagship Whitepaper"
          badgeValue="DOI: 10.5281/zenodo.24115647"
          summary={WHITEPAPER_DESCRIPTION}
          publishedYear="2026"
          slug="annual-state-of-poker-2026"
          doi="10.5281/zenodo.24115647"
        />

        <div style={{ margin: '28px 0' }}>
          <SmarterAccountUnlockGate
            variant="dataset-export"
            context="research-annual-2026"
            redirectPath="/research/annual-state-of-poker-2026"
          />
        </div>

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
  h3: { fontSize: 17, fontWeight: 700, color: '#f8fafc', margin: '6px 0 8px 0' },
  bodyText: { fontSize: 13.5, lineHeight: 1.6, color: '#cbd5e1', margin: '0 0 10px 0' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 13.5 },
  trHead: { borderBottom: '1px solid #2b4663', textAlign: 'left', color: '#38bdf8' },
  th: { padding: '10px 12px', fontWeight: 700 },
  trBody: { borderBottom: '1px solid #2b4663' },
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
    background: '#0d1f33',
    border: '1px solid #2b4663',
    borderRadius: 0,
    padding: 18,
  },
  studyMeta: { fontSize: 11, fontWeight: 800, color: '#38bdf8', letterSpacing: '0.05em' },
  studyLink: { color: '#f8fafc', textDecoration: 'none' },
  studyLinksRow: { display: 'flex', flexWrap: 'wrap', gap: 12, fontSize: 12.5, fontWeight: 700 },
  inlineCyan: { color: '#38bdf8', textDecoration: 'none' },
  inlineEmerald: { color: '#34d399', textDecoration: 'none' },
};
