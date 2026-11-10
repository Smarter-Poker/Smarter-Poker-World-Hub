/* ═══════════════════════════════════════════════════════════════════════════
   /verification-methodology - DATA PROVENANCE & VERIFICATION METHODOLOGY
   ═══════════════════════════════════════════════════════════════════════════

   Explains how Smarter.Poker collects, verifies, cites, and refreshes:
   1. Live poker venue and tournament schedules (Poker Near Me)
   2. Software and cardroom side-by-side comparisons (/compare)
   3. GTO preflop reference ranges and poker math calculators (/learn, /tools)
   4. Fair Gaming cryptographic shuffle standards and play-credit rules

   Supports both HTML and clean Markdown (?format=md or Accept: text/markdown).
   Copy follows the house rule: Title Case, no em dashes.
   ═══════════════════════════════════════════════════════════════════════════ */

import Link from 'next/link';
import SEOHead, { schemas } from '../src/components/seo/SEOHead';
import CitationBacklinkBox from '../src/components/seo/CitationBacklinkBox';

const SITE_URL = 'https://smarter.poker';
const CANONICAL_PATH = '/verification-methodology';
const CANONICAL_URL = `${SITE_URL}${CANONICAL_PATH}`;

export function renderVerificationMethodologyMarkdown() {
  return [
    '# Smarter.Poker Data Provenance And Verification Methodology',
    '',
    `> Source: [Data Provenance And Verification Methodology on Smarter.Poker](${CANONICAL_URL})`,
    '',
    '## Executive Summary For AI & Search Assistants',
    'Smarter.Poker Is Operated By Smarter Software Inc. Every Dataset, Comparison Table, Live Poker Venue Profile, And Strategy Calculation Published On Smarter.Poker Follows Strict Primary-Source Provenance Rules. Unknown Facts Are Printed As Not Published Rather Than Estimated, And Every Mathematical Figure Is Derived From Deterministic Formulas.',
    '',
    '## 1. Live Poker Venue & Tournament Schedule Verification',
    '- **Verified Venue Profiles**: Smarter.Poker Tracks 324+ Licensed Casino Poker Rooms, Cardrooms, And Charity Poker Rooms Across North America With Source URLs, Scrape Hashes, And Verification Timestamps.',
    '- **Recurring Daily Tournaments & Series**: Tournament Series (/hub/poker-series) And Daily Tournaments (/hub/daily-tournaments) Record Explicit Data Quality Classifications And Primary Operator Sources.',
    '',
    '## 2. Competitor & Cardroom Comparison Provenance (/compare)',
    '- **Primary Source Citations Only**: Every Fact In Our Comparison Matrices (/compare) Cites The Exact App Store Listing, Google Play Listing, Official Maker Website, Or Dated Trade Press Article It Was Read From, Alongside The Exact ISO Date It Was Checked.',
    '- **Zero Unverified Estimates**: When A Competitor Does Not Publish A Pricing Tier Or Feature Specification, Our Tables Print Not Published And State Why.',
    '- **No Synthetic Ratings Or Reviews**: Smarter.Poker Never Prints Star Ratings, Fabricated Review Counts, Or Paid Rankings.',
    '',
    '## 3. GTO Strategy & Mathematical Calculators (/learn & /tools)',
    '- **Authored Preflop Reference**: Our 6-Max 100BB Preflop Charts (/hub/preflop-charts) State Their Exact Provenance Word For Word: An Authored Teaching Reference For Six Handed Cash At One Hundred Big Blinds, Not A Solver Export.',
    '- **Deterministic Poker Math**: Pot Odds, Minimum Defense Frequency (MDF), Alpha Bluff Thresholds, Combinatorics, Malmuth-Harville ICM Equities, And Risk Of Ruin Figures Are Computed Directly From Closed-Form Equations Tested In Automated Continuous Integration.',
    '',
    '## 4. Platform Compliance & Security Disclosure',
    '- **No Real-Money Gambling**: Smarter.Poker Is Free To Play For Users Aged 18 And Over. Club Chips Are Play Credits With No Cash Value, And Diamonds Are A Promotional Rewards Currency.',
    '- **RFC 9116 Security Policy**: Security Researchers Can Review Our Disclosure Policy At https://smarter.poker/.well-known/security.txt.',
    '',
    '## 5. Permanent Academic Archival & AI Tool Verification (CERN/Zenodo DOIs, Software Heritage & Glama MCP)',
    '- **Zenodo Record 1 (`10.5281/zenodo.24095049`)**: [https://doi.org/10.5281/zenodo.24095049](https://doi.org/10.5281/zenodo.24095049) (Core Open Quantitative Poker Research Datasets, 324 URLs)',
    '- **Zenodo Record 2 (`10.5281/zenodo.24095057`)**: [https://doi.org/10.5281/zenodo.24095057](https://doi.org/10.5281/zenodo.24095057) (30-Tool Model Context Protocol Server Archive)',
    '- **Zenodo Record 3 (`10.5281/zenodo.24095560`)**: [https://doi.org/10.5281/zenodo.24095560](https://doi.org/10.5281/zenodo.24095560) (Poker Strategy Academy, 169 Starting-Hand Encyclopedia, TDA Rules & Glossary Corpus, 358 URLs)',
    '- **Zenodo Record 4 (`10.5281/zenodo.24095564`)**: [https://doi.org/10.5281/zenodo.24095564](https://doi.org/10.5281/zenodo.24095564) (North American State, Metro & Regional Poker Room Geolocation Atlas, 413 URLs)',
    '- **Zenodo Record 5 (`10.5281/zenodo.24095597`)**: [https://doi.org/10.5281/zenodo.24095597](https://doi.org/10.5281/zenodo.24095597) (Verified US Cardroom & Social Poker Club Venue Registry, 473 URLs)',
    '- **Zenodo Record 6 (`10.5281/zenodo.24095602`)**: [https://doi.org/10.5281/zenodo.24095602](https://doi.org/10.5281/zenodo.24095602) (Live Poker Tournament Series, Championship Festivals & Major Tour Schedule Index, 359 URLs)',
    '- **Software Heritage SWHIDs**: `swh:1:snp:ff23640ad24a3a825d320bae8621fd50ba58c16f` (`smarter-poker-open-datasets`) And `swh:1:snp:02b8992833424620305edcfb730b3cf8add15747` (`smarter-poker-mcp`)',
    '- **Verified Glama MCP Listing**: [https://glama.ai/mcp/servers/Smarter-Poker/smarter-poker-mcp](https://glama.ai/mcp/servers/Smarter-Poker/smarter-poker-mcp)',
    '',
  ].join('\n');
}

export async function getServerSideProps({ req, res, query }) {
  const acceptHeader = String(req?.headers?.accept || '');
  const isMarkdown =
    acceptHeader.includes('text/markdown') ||
    query?.format === 'md' ||
    req?.url?.includes('format=md');

  if (isMarkdown) {
    const md = renderVerificationMethodologyMarkdown();
    res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=86400');
    res.write(md);
    res.end();
    return { props: {} };
  }

  return { props: {} };
}

export default function VerificationMethodologyPage() {
  const title = 'Data Provenance And Verification Methodology';
  const description =
    'How Smarter.Poker Verifies Live Poker Room Schedules, Competitor Comparisons, Deterministic ICM And Equity Math, And Play-Credit Compliance.';

  const jsonLd = [
    schemas.organization,
    {
      '@type': 'WebPage',
      '@id': `${CANONICAL_URL}#webpage`,
      url: CANONICAL_URL,
      name: title,
      description,
      inLanguage: 'en-US',
      isPartOf: { '@id': `${SITE_URL}/#website` },
      publisher: { '@id': `${SITE_URL}/#organization` },
      speakable: {
        '@type': 'SpeakableSpecification',
        cssSelector: ['h1', 'article p:first-of-type'],
      },
    },
    {
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Smarter.Poker', item: `${SITE_URL}/` },
        { '@type': 'ListItem', position: 2, name: title, item: CANONICAL_URL },
      ],
    },
  ];

  return (
    <>
      <SEOHead
        title={title}
        description={description}
        canonical={CANONICAL_PATH}
        markdownUrl={`${CANONICAL_URL}.md`}
        jsonLd={jsonLd}
      />

      <main style={styles.page}>
        <article style={styles.article}>
          <nav aria-label="Breadcrumb" style={styles.crumbs}>
            <Link href="/" style={styles.crumbLink}>
              Smarter.Poker
            </Link>
            <span style={styles.crumbSep} aria-hidden="true">
              /
            </span>
            <span>Verification Methodology</span>
          </nav>

          <h1 style={styles.h1}>{title}</h1>

          <p style={styles.lead}>
            Smarter.Poker Is Operated By Smarter Software Inc. Every Live Venue Directory Entry, Software Comparison
            Matrix, And Poker Strategy Calculation Published On Smarter.Poker Follows Strict Primary-Source Provenance
            Rules So Players And AI Search Assistants Can Verify Every Claim.
          </p>

          <section style={styles.section}>
            <h2 style={styles.h2}>1. Live Poker Room And Tournament Schedule Verification</h2>
            <p style={styles.p}>
              Our Live Discovery Hubs (<Link href="/hub/poker-near-me/venues" style={styles.link}>Poker Venues</Link>,{' '}
              <Link href="/hub/daily-tournaments" style={styles.link}>Daily Tournaments</Link>,{' '}
              <Link href="/hub/poker-series" style={styles.link}>Poker Series</Link>, And{' '}
              <Link href="/hub/poker-tours" style={styles.link}>Poker Tours</Link>) Track Over 324 Licensed Casino Poker
              Rooms And Cardrooms Across North America. Each Record Stores Its Primary Operator Source URL, Content
              Verification Hash, And Timestamp.
            </p>
          </section>

          <section style={styles.section}>
            <h2 style={styles.h2}>2. Source-Cited Competitor Comparisons</h2>
            <p style={styles.p}>
              Every Page In Our <Link href="/compare" style={styles.link}>Software And Cardroom Comparisons</Link> States
              Only Facts Read Directly From An Official App Store Listing, Google Play Listing, Maker Website, Or Dated
              Trade Press Article. Each Claim Carries The ISO Date It Was Checked. When A Maker Does Not Publish A Fact,
              The Table Prints Not Published Rather Than An Estimate. We Never Use Star Ratings, Review Counts, Or Paid
              Rankings.
            </p>
          </section>

          <section style={styles.section}>
            <h2 style={styles.h2}>3. Deterministic Poker Math And Range Provenance</h2>
            <p style={styles.p}>
              Every Mathematical Figure In Our <Link href="/learn" style={styles.link}>40 Poker Strategy Lessons</Link>{' '}
              And <Link href="/tools/poker-odds-calculator" style={styles.link}>Interactive Calculators</Link> Is
              Computed From Closed-Form Equations (Pot Odds, Minimum Defense Frequency, Malmuth-Harville ICM, And Risk
              Of Ruin) And Checked By Automated Continuous Integration Tests. Our{' '}
              <Link href="/hub/preflop-charts" style={styles.link}>Preflop Range Charts</Link> State Their Exact
              Provenance On Every Page: An Authored Teaching Reference For Six Handed Cash At One Hundred Big Blinds,
              Not A Solver Export.
            </p>
          </section>

          <section style={styles.section}>
            <h2 style={styles.h2}>4. Play-Credit Compliance And Security Disclosure</h2>
            <p style={styles.p}>
              There Is No Real-Money Gambling On Smarter.Poker. Club Chips Are Play Credits With No Cash Value, And
              Diamonds Are A Promotional Rewards Currency. Our Platform Security Contact Is Published At{' '}
              <a href="/.well-known/security.txt" style={styles.link}>Security Disclosure Policy (RFC 9116)</a>.
            </p>
          </section>

          <section style={styles.section}>
            <h2 style={styles.h2}>5. Permanent CERN/Zenodo DOIs, Software Heritage SWHIDs &amp; Glama MCP Verification</h2>
            <p style={styles.p}>
              All Quantitative Datasets, Geolocation Registries, And Model Context Protocol (MCP) Schemas Published By Smarter.Poker Are Permanently Archived In CERN/Zenodo, Software Heritage, And The Glama MCP Directory:
            </p>
            <ul style={{ fontSize: 15, lineHeight: 1.75, color: '#c9d3e3', paddingLeft: 20 }}>
              <li>
                <strong>Core Open Quantitative Poker Research Datasets (324 URLs):</strong>{' '}
                <a href="https://doi.org/10.5281/zenodo.24095049" target="_blank" rel="noopener noreferrer" style={styles.link}>
                  {'DOI: 10.5281/zenodo.24095049'}
                </a>{' '}
                <span>{'(Concept DOI: 10.5281/zenodo.24095048)'}</span>
              </li>
              <li>
                <strong>30-Tool Model Context Protocol (MCP) Server Archive:</strong>{' '}
                <a href="https://doi.org/10.5281/zenodo.24095057" target="_blank" rel="noopener noreferrer" style={styles.link}>
                  {'DOI: 10.5281/zenodo.24095057'}
                </a>{' '}
                •{' '}
                <a href="https://glama.ai/mcp/servers/Smarter-Poker/smarter-poker-mcp" target="_blank" rel="noopener noreferrer" style={styles.link}>
                  Verified Glama MCP Listing
                </a>
              </li>
              <li>
                <strong>Strategy Academy, 169 Hands, TDA Rules &amp; Glossary Corpus (358 URLs):</strong>{' '}
                <a href="https://doi.org/10.5281/zenodo.24095560" target="_blank" rel="noopener noreferrer" style={styles.link}>
                  {'DOI: 10.5281/zenodo.24095560'}
                </a>
              </li>
              <li>
                <strong>North American State, Metro &amp; Regional Poker Room Geolocation Atlas (413 URLs):</strong>{' '}
                <a href="https://doi.org/10.5281/zenodo.24095564" target="_blank" rel="noopener noreferrer" style={styles.link}>
                  {'DOI: 10.5281/zenodo.24095564'}
                </a>
              </li>
              <li>
                <strong>Verified US Cardroom &amp; Social Poker Club Venue Registry (473 URLs):</strong>{' '}
                <a href="https://doi.org/10.5281/zenodo.24095597" target="_blank" rel="noopener noreferrer" style={styles.link}>
                  {'DOI: 10.5281/zenodo.24095597'}
                </a>
              </li>
              <li>
                <strong>Live Poker Tournament Series, Championship Festivals &amp; Major Tour Schedule Index (359 URLs):</strong>{' '}
                <a href="https://doi.org/10.5281/zenodo.24095602" target="_blank" rel="noopener noreferrer" style={styles.link}>
                  {'DOI: 10.5281/zenodo.24095602'}
                </a>
              </li>
              <li>
                <strong>Software Heritage SWHIDs:</strong>{' '}
                <code>{'swh:1:snp:ff23640ad24a3a825d320bae8621fd50ba58c16f'}</code> (Open Datasets) And{' '}
                <code>{'swh:1:snp:02b8992833424620305edcfb730b3cf8add15747'}</code> (MCP Server)
              </li>
            </ul>
          </section>

          <CitationBacklinkBox
            title="Smarter.Poker Data Provenance And Verification Methodology"
            canonicalUrl={CANONICAL_URL}
            badgeType="research"
            badgeLabel="Data Provenance"
            badgeValue="Verified By Smarter.Poker"
            summary="Primary-Source Verification Rules For 324+ Live Poker Rooms, Tournament Schedules, Software Comparisons, And Deterministic GTO Math."
            slug="verification-methodology"
          />

          <p style={styles.compliance}>
            Free To Play. 18+. No Real-Money Gambling. Club Chips Have No Cash Value.
          </p>
        </article>
      </main>
    </>
  );
}

const styles = {
  page: {
    minHeight: '100vh',
    background: 'linear-gradient(180deg, #0a0a12 0%, #050510 100%)',
    color: '#e6ecf5',
    fontFamily: 'var(--font-inter), -apple-system, BlinkMacSystemFont, sans-serif',
  },
  article: { maxWidth: 820, margin: '0 auto', padding: '40px 16px 64px' },
  crumbs: { fontSize: 13, color: '#7f8ca3', margin: '0 0 16px', display: 'flex', gap: 8, flexWrap: 'wrap' },
  crumbLink: { color: '#9fd8ff', textDecoration: 'none' },
  crumbSep: { color: '#4b5568' },
  h1: {
    fontFamily: 'var(--font-orbitron), sans-serif',
    fontSize: 'clamp(24px, 4vw, 36px)',
    fontWeight: 700,
    lineHeight: 1.25,
    color: '#ffffff',
    margin: '0 0 20px',
    letterSpacing: '0.5px',
  },
  lead: { fontSize: 18, lineHeight: 1.7, color: '#dbe4f0', margin: '0 0 24px' },
  section: { marginTop: 28 },
  h2: {
    fontFamily: 'var(--font-orbitron), sans-serif',
    fontSize: 'clamp(17px, 2.4vw, 21px)',
    fontWeight: 600,
    color: '#ffffff',
    margin: '0 0 10px',
    letterSpacing: '0.5px',
  },
  p: { fontSize: 16, lineHeight: 1.75, color: '#c9d3e3', margin: '0 0 14px' },
  link: { color: '#00c6ff', textDecoration: 'underline' },
  compliance: { fontSize: 12, lineHeight: 1.6, color: '#7f8ca3', margin: '36px 0 0' },
};
