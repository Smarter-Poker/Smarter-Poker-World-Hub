/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  OFFICIAL SMARTER.POKER PRESS KIT, MEDIA FACTS & DATA CITATIONS (/press)
 * ═══════════════════════════════════════════════════════════════════════════════
 * Authoritative media room providing quotable 2026 US live and online poker
 * industry benchmarks, Short/Medium/Long brand boilerplates with 1-Click Copy,
 * and press citation badges.
 *
 * House style: Title Case, zero em dashes.
 */

import React, { useState } from 'react';
import Link from 'next/link';
import SEOHead from '../src/components/seo/SEOHead';
import UniversalHeader from '../src/components/ui/UniversalHeader';
import CitationBacklinkBox from '../src/components/seo/CitationBacklinkBox';

const INDUSTRY_FAST_FACTS = [
  {
    metric: 'Verified US Brick-And-Mortar Poker Rooms',
    benchmark2026: '324+ Active Venues Across 38 States',
    context: 'Includes Commercial Casinos, Tribal Gaming Properties, California Card Rooms, And Texas/Oregon Social Membership Clubs.',
    sourcePath: '/research/us-live-poker-room-rake-and-jackpot-benchmark',
  },
  {
    metric: 'Standard US Low-Stakes Cash Game Rake ($1/$2 & $1/$3)',
    benchmark2026: '10% Pot Rake Capped At $5 To $7 + $1 To $2 Promo Drop',
    context: '84% Of Surveyed US Commercial And Tribal Rooms Operate On A Percentage Cap Model; California Uses Flat Per-Flop Drops.',
    sourcePath: '/research/us-live-poker-room-rake-and-jackpot-benchmark',
  },
  {
    metric: 'Texas Membership Card Club Seat-Rental Model',
    benchmark2026: '$0 Pot Rake | $10 To $14 Hourly Seat Time Fee',
    context: 'Reduces Effective Player Cost To 4.0 To 6.5 BB/100 Compared To 8.5 To 12.0 BB/100 In Percentage-Rake Casinos.',
    sourcePath: '/poker-rooms/guides',
  },
  {
    metric: 'Recurring Weekly US Live Poker Tournaments',
    benchmark2026: '4,500+ Scheduled Weekly Events | $140 Median Buy-In',
    context: 'Sub-$200 Daily Events Carry A 20.8% To 24.5% Combined House And Staff Fee Ratio Vs 13% To 16% In $300+ Deepstacks.',
    sourcePath: '/research/daily-poker-tournament-buy-in-and-guarantee-index',
  },
  {
    metric: 'Largest US Live Poker Markets By Active Table Count',
    benchmark2026: '#1 Los Angeles (550+ Tables) | #2 Las Vegas (280+ Tables)',
    context: 'Followed By South Florida (240+ Tables), Houston, And Dallas-Fort Worth.',
    sourcePath: '/poker-rooms/guides',
  },
  {
    metric: 'Smarter.Poker Free-To-Play & Math Ecosystem',
    benchmark2026: '24 Free Calculators, 169 Hand Guides, 30 Official Rules, 15 Studies',
    context: '100% Browser-Native With Dedicated .md Markdown And MCP Endpoints For AI Assistants And Journalists.',
    sourcePath: '/tools',
  },
];

const BRAND_BOILERPLATES = [
  {
    id: 'short',
    label: 'Short Boilerplate (1 Sentence / 35 Words)',
    text: 'Smarter.Poker Is The Unified Poker Ecosystem Combining A 324-Venue Live Poker Near Me Directory, 24 Free GTO And Tournament Math Calculators, Club Arena Social Poker, And Club Commander Cardroom Management Software.',
  },
  {
    id: 'medium',
    label: 'Medium Boilerplate (2 Sentences / 75 Words)',
    text: 'Smarter.Poker (Published By Smarter Software Inc.) Is The Premier Online And Live Poker Intelligence Platform Serving Players, Club Operators, And Tournament Directors Across North America. The Platform Integrates Real-Time Waitlists And Schedules For 324+ Verified US Poker Rooms, 24 Browser-Native Poker Math Calculators, 169 GTO Starting Hand Charts, 15 Empirical Industry Benchmark Studies, Club Arena Online Play, And Club Commander Cardroom Operations Software.',
  },
  {
    id: 'long',
    label: 'Long Press Boilerplate (Full Media Attribution Paragraph)',
    text: 'Founded By Smarter Software Inc., Smarter.Poker Is The All-In-One Poker Technology, Data Research, And Cardroom Management Ecosystem. For Everyday Players, Smarter.Poker Provides Free Access To 24 Interactive GTO And Tournament Calculators, 169 Canonical Starting Hand Strategy Guides, 25 Head-To-Head Matchup Solvers, 30 Official TDA And Robert\'s Rules Of Poker Floor Rulings, And Real-Time Live Discovery Across 324+ US Poker Venues And 4,500+ Weekly Tournaments. For Private Clubs And Commercial Cardrooms, Smarter.Poker Powers Club Arena And Club Commander, Delivering Waitlist Automation, Tournament Clocks, Floor Management, And Transparent Player Analytics Under Creative Commons CC BY 4.0 Open Data Attribution.',
  },
];

const PRESS_BADGE_SNIPPETS = [
  {
    id: 'badge-research',
    title: 'Empirical Research Authority Badge',
    code: '<a href="https://smarter.poker/research" target="_blank" rel="noopener"><img src="https://smarter.poker/api/seo/badge?type=research&label=Verified+Data+Source&value=Smarter.Poker+Research" alt="Verified Data Source: Smarter.Poker Research" height="28" /></a>',
  },
  {
    id: 'badge-live-index',
    title: 'US Live Poker Room Benchmark Badge',
    code: '<a href="https://smarter.poker/poker-rooms/guides" target="_blank" rel="noopener"><img src="https://smarter.poker/api/seo/badge?type=market&label=US+Live+Poker+Index&value=324%2B+Verified+Rooms" alt="US Live Poker Index: 324+ Verified Rooms" height="28" /></a>',
  },
  {
    id: 'badge-tools',
    title: 'Interactive GTO Math Suite Attribution Badge',
    code: '<a href="https://smarter.poker/tools" target="_blank" rel="noopener"><img src="https://smarter.poker/api/seo/badge?type=tool&label=Powered+By&value=Smarter.Poker+Math+Engine" alt="Powered By Smarter.Poker Math Engine" height="28" /></a>',
  },
];

const PRESS_FAQS = [
  {
    q: 'May Journalists And Content Creators Quote Smarter.Poker Research Data Free Of Charge?',
    a: 'Yes. All First-Party Industry Benchmarks, Rake Studies, Tournament Indexes, And Combinatorial Tables Published On Smarter.Poker Are Licensed Under Creative Commons Attribution 4.0 International (CC BY 4.0). Simply Credit "Smarter.Poker Research" With A Direct Link To The Source URL.',
  },
  {
    q: 'Does Smarter.Poker Provide Raw Markdown, JSON Datasets, And Zenodo DOIs For Data Journalists?',
    a: 'Yes. Append .md To Any Research Report, Rule, Game Variant, Or Calculator URL To Retrieve Clean Markdown Tables, Or Visit /research And /api/datasets/catalog To Download Structured CSV And JSON Releases Self-Archived On Zenodo (Starting At https://doi.org/10.5281/zenodo.24095049) And Software Heritage.',
  },
];

const ARCHIVAL_REGISTRIES = [
  {
    label: 'Zenodo Deposit 1 (Core Open Research Datasets)',
    identifier: 'DOI: 10.5281/zenodo.24095049 (Concept DOI: 10.5281/zenodo.24095048)',
    href: 'https://doi.org/10.5281/zenodo.24095049',
    scope: '15 Open Quantitative Poker Research CSV & JSON Datasets',
  },
  {
    label: 'Zenodo Deposit 2 (30-Tool MCP Server Archive)',
    identifier: 'DOI: 10.5281/zenodo.24095057 (Concept DOI: 10.5281/zenodo.24095056)',
    href: 'https://doi.org/10.5281/zenodo.24095057',
    scope: 'Model Context Protocol JSON-RPC 2.0 Server & Manifests',
  },
  {
    label: 'Zenodo Deposit 3 (Live Poker Room, Regional Market & Tournament Series Benchmark Dataset)',
    identifier: 'DOI: 10.5281/zenodo.24095560 (Concept DOI: 10.5281/zenodo.24095559)',
    href: 'https://doi.org/10.5281/zenodo.24095560',
    scope: 'North American Cardroom, Regional Market & Tournament Series Benchmark Deposit',
  },
  {
    label: 'Zenodo Deposit 4 (100BB 6-Max GTO Preflop Ranges, 169 Hands & 25 Matchups)',
    identifier: 'DOI: 10.5281/zenodo.24095564 (Concept DOI: 10.5281/zenodo.24095563)',
    href: 'https://doi.org/10.5281/zenodo.24095564',
    scope: '100BB 6-Max Preflop Charts, 169 Starting Hands & 25 Canonical Matchup Benchmarks',
  },
  {
    label: 'Zenodo Deposit 5 (MCP Server & OpenAPI 3.1 Specification V1.0.2)',
    identifier: 'DOI: 10.5281/zenodo.24095597 (Concept DOI: 10.5281/zenodo.24095596)',
    href: 'https://doi.org/10.5281/zenodo.24095597',
    scope: 'Model Context Protocol Server & OpenAPI 3.1 Specification Release Archive',
  },
  {
    label: 'Zenodo Deposit 6 (Official Poker Rules, 15 Game Variants & 80-Term Glossary Corpus)',
    identifier: 'DOI: 10.5281/zenodo.24095602 (Concept DOI: 10.5281/zenodo.24095601)',
    href: 'https://doi.org/10.5281/zenodo.24095602',
    scope: 'Official TDA & RROP Floor Rulings, 15 Game Variants & Quantitative Glossary Corpus',
  },
  {
    label: 'Software Heritage Archive (Open Datasets Repository)',
    identifier: 'swh:1:snp:ff23640ad24a3a825d320bae8621fd50ba58c16f',
    href: 'https://archive.softwareheritage.org/swh:1:snp:ff23640ad24a3a825d320bae8621fd50ba58c16f',
    scope: 'Cryptographic Git Snapshot Of smarter-poker-open-datasets',
  },
  {
    label: 'Software Heritage Archive (30-Tool MCP Server)',
    identifier: 'swh:1:snp:02b8992833424620305edcfb730b3cf8add15747',
    href: 'https://archive.softwareheritage.org/swh:1:snp:02b8992833424620305edcfb730b3cf8add15747',
    scope: 'Cryptographic Git Snapshot Of smarter-poker-mcp',
  },
  {
    label: 'Glama AI Model Context Protocol Directory Listing',
    identifier: 'glama.ai/mcp/servers/Smarter-Poker/smarter-poker-mcp',
    href: 'https://glama.ai/mcp/servers/Smarter-Poker/smarter-poker-mcp',
    scope: '30 Deterministic Poker Math & Venue Discovery Tools',
  },
];

export default function PressKitMediaPage() {
  const [copiedId, setCopiedId] = useState(null);

  const handleCopy = (id, text) => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(text).then(() => {
        setCopiedId(id);
        setTimeout(() => setCopiedId(null), 2200);
      });
    }
  };

  const canonicalUrl = 'https://smarter.poker/press';

  const jsonLd = [
    {
      '@type': 'AboutPage',
      '@id': `${canonicalUrl}#about`,
      name: 'Smarter.Poker Press Kit, Media Facts & Data Citations',
      description:
        'Official Smarter.Poker Press Kit, 2026 US Live And Online Poker Industry Benchmarks, Verified Brand Boilerplates, And Media Citation Snippets.',
      url: canonicalUrl,
      inLanguage: 'en-US',
      dateModified: '2026-11-09',
      isPartOf: { '@id': 'https://smarter.poker/#website' },
      publisher: { '@id': 'https://smarter.poker/#organization' },
    },
    {
      '@type': 'FAQPage',
      '@id': `${canonicalUrl}#faq`,
      mainEntity: PRESS_FAQS.map((f) => ({
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
        { '@type': 'ListItem', position: 2, name: 'Press Kit & Media Citations', item: canonicalUrl },
      ],
    },
  ];

  return (
    <div style={styles.page}>
      <SEOHead
        title="Press Kit, Media Facts & Data Citations"
        description="Official Smarter.Poker Press Kit, 2026 US Live And Online Poker Industry Benchmarks, Verified Brand Boilerplates, And Media Citation Snippets."
        canonical="/press"
        jsonLd={jsonLd}
      />

      <UniversalHeader pageDepth={1} />

      <main style={styles.container}>
        <nav aria-label="Breadcrumb" style={styles.breadcrumbs}>
          <Link href="/" style={styles.crumbLink}>
            Smarter.Poker
          </Link>
          <span style={styles.crumbSep}>/</span>
          <span style={styles.crumbCurrent}>Press Kit, Media Facts &amp; Data Citations</span>
        </nav>

        <header style={styles.heroPlate}>
          <div style={styles.badgeRow}>
            <span style={styles.cyanBadge}>OFFICIAL SMARTER.POKER NEWSROOM</span>
            <span style={styles.emeraldBadge}>CC BY 4.0 OPEN MEDIA ATTRIBUTION</span>
          </div>

          <h1 style={styles.h1}>
            Smarter.Poker Press Kit, 2026 Poker Industry Fast Facts &amp; Media Citations
          </h1>

          <p style={styles.lead}>
            <strong>Direct Media Resource:</strong> Journalists, Podcasters, Industry Analysts, And Academic Researchers May Freely Quote And Embed All 2026 Smarter.Poker Live And Online Poker Benchmarks Under <strong>Creative Commons Attribution 4.0 (CC BY 4.0)</strong>. Use The Quotable Fast Facts Table, 1-Click Brand Boilerplates, And Authority Badge Snippets Below.
          </p>

          <div style={styles.quickCrossLinks}>
            <Link href="/research" style={styles.crossBtnCyan}>
              15 Empirical Research Studies
            </Link>
            <a href="/api/datasets/catalog" style={styles.crossBtnEmerald}>
              Open JSON Data Catalog
            </a>
            <Link href="/tools/embeds" style={styles.crossBtnOutline}>
              Embeddable Widgets &amp; Streamer Commands
            </Link>
            <Link href="/verification-methodology" style={styles.crossBtnOutline}>
              Data Verification Methodology
            </Link>
          </div>
        </header>

        {/* 2026 Poker Industry Fast Facts Table */}
        <section aria-label="Quotable 2026 Poker Industry Fast Facts" style={styles.sectionPlate}>
          <div style={styles.sectionHeader}>
            <h2 style={styles.h2}>Quotable 2026 US Live &amp; Online Poker Industry Fast Facts</h2>
            <span style={styles.asOfText}>Verified Q4 2026</span>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={styles.table}>
              <thead>
                <tr style={styles.trHead}>
                  <th style={styles.th}>Industry Metric</th>
                  <th style={styles.th}>2026 Verified Benchmark</th>
                  <th style={styles.th}>Empirical Context &amp; Scope</th>
                  <th style={styles.th}>Primary Study</th>
                </tr>
              </thead>
              <tbody>
                {INDUSTRY_FAST_FACTS.map((row) => (
                  <tr key={row.metric} style={styles.trBody}>
                    <td style={styles.tdMetric}>{row.metric}</td>
                    <td style={styles.tdBenchmark}>{row.benchmark2026}</td>
                    <td style={styles.tdContext}>{row.context}</td>
                    <td style={styles.tdSource}>
                      <Link href={row.sourcePath} style={styles.sourceLink}>
                        View Source Data
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Short / Medium / Long Brand Boilerplates */}
        <section aria-label="Official Brand Boilerplates With One Click Copy" style={styles.sectionPlate}>
          <h2 style={styles.h2}>
            Official Smarter.Poker Brand Boilerplates (1-Click Copy)
          </h2>
          <p style={styles.sectionSub}>
            Copy Approved Short, Medium, Or Full-Length Attribution Descriptions For Press Releases, Podcast Show Notes, And Article Footers:
          </p>

          <div style={styles.boilerplateList}>
            {BRAND_BOILERPLATES.map((item) => (
              <div key={item.id} style={styles.boilerplateCard}>
                <div style={styles.boilerplateTop}>
                  <span style={styles.boilerplateLabel}>{item.label}</span>
                  <button
                    type="button"
                    onClick={() => handleCopy(item.id, item.text)}
                    style={copiedId === item.id ? styles.copyBtnCopied : styles.copyBtn}
                  >
                    {copiedId === item.id ? 'Copied To Clipboard' : 'Copy Boilerplate'}
                  </button>
                </div>
                <p style={styles.boilerplateText}>{item.text}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Press & Media Badge Snippets */}
        <section aria-label="Press And Media Badge Snippets" style={styles.sectionPlate}>
          <h2 style={styles.h2}>Press &amp; Media SVG Citation Badge Snippets</h2>
          <p style={styles.sectionSub}>
            Embed Zero-Script SVG Data Attribution Badges Directly In Your Article Or Research Post. Need Interactive Calculator Iframe Widgets Or Streamer Bot Commands? Visit <Link href="/tools/embeds" style={styles.inlineLink}>/Tools/Embeds</Link>.
          </p>

          <div style={styles.badgeSnippetGrid}>
            {PRESS_BADGE_SNIPPETS.map((snippet) => (
              <div key={snippet.id} style={styles.snippetCard}>
                <div style={styles.boilerplateTop}>
                  <span style={styles.snippetTitle}>{snippet.title}</span>
                  <button
                    type="button"
                    onClick={() => handleCopy(snippet.id, snippet.code)}
                    style={copiedId === snippet.id ? styles.copyBtnCopied : styles.copyBtn}
                  >
                    {copiedId === snippet.id ? 'Copied HTML' : 'Copy HTML Embed'}
                  </button>
                </div>
                <pre style={styles.codeBlock}>{snippet.code}</pre>
              </div>
            ))}
          </div>
        </section>

        {/* Self-Archived Zenodo DOIs, Software Heritage SWHIDs & Glama MCP Registry */}
        <section aria-label="Self-Archived DOIs And Archival Registries" style={styles.sectionPlate}>
          <div style={styles.sectionHeader}>
            <h2 style={styles.h2}>Self-Archived Zenodo DOIs, Software Heritage SWHIDs &amp; Glama MCP Listing</h2>
            <span style={styles.asOfText}>6 Zenodo Deposits + 2 SWHIDs + Glama MCP</span>
          </div>
          <p style={styles.sectionSub}>
            Smarter.Poker Research Corpora, Geolocation Registries, And Model Context Protocol (MCP) Schemas Are Self-Archived On Zenodo And Software Heritage, And Listed In The Glama MCP Directory:
          </p>
          <div style={{ overflowX: 'auto' }}>
            <table style={styles.table}>
              <thead>
                <tr style={styles.trHead}>
                  <th style={styles.th}>Archival Deposit / Registry</th>
                  <th style={styles.th}>Permanent Identifier (DOI / SWHID)</th>
                  <th style={styles.th}>Indexed Scope</th>
                  <th style={styles.th}>Direct Resolver</th>
                </tr>
              </thead>
              <tbody>
                {ARCHIVAL_REGISTRIES.map((reg) => (
                  <tr key={reg.identifier} style={styles.trBody}>
                    <td style={styles.tdMetric}>{reg.label}</td>
                    <td style={styles.tdBenchmark}>{reg.identifier}</td>
                    <td style={styles.tdContext}>{reg.scope}</td>
                    <td style={styles.tdSource}>
                      <a href={reg.href} target="_blank" rel="noopener noreferrer" style={styles.sourceLink}>
                        Open Archive
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* FAQ Section */}
        <section aria-label="Press And Media Frequently Asked Questions" style={styles.sectionPlate}>
          <h2 style={styles.h2}>Frequently Asked Questions For Media &amp; Researchers</h2>
          <div style={styles.faqList}>
            {PRESS_FAQS.map((item) => (
              <div key={item.q} style={styles.faqItem}>
                <h3 style={styles.faqQ}>{item.q}</h3>
                <p style={styles.faqA}>{item.a}</p>
              </div>
            ))}
          </div>
        </section>

        <CitationBacklinkBox
          title="Smarter.Poker Official Press Kit & 2026 Poker Industry Fast Facts"
          canonicalUrl={canonicalUrl}
          badgeType="research"
          badgeLabel="Official Media Kit"
          badgeValue="Smarter.Poker Press & Research"
          summary="Official Smarter.Poker Press Kit, 2026 US Live And Online Poker Industry Benchmarks, Verified Brand Boilerplates, And Media Citation Snippets."
          publishedYear="2026"
          slug="smarter-poker-press-kit"
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
    maxWidth: '1120px',
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
    fontSize: '30px',
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
    marginBottom: '24px',
  },
  sectionHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: '10px',
    marginBottom: '14px',
  },
  h2: {
    fontSize: '21px',
    fontWeight: 800,
    color: '#f8fafc',
    margin: '0 0 10px',
  },
  asOfText: {
    fontSize: '12.5px',
    color: '#10b981',
    fontWeight: 700,
  },
  sectionSub: {
    fontSize: '14px',
    color: '#cbd5e1',
    lineHeight: 1.6,
    margin: '0 0 16px',
  },
  inlineLink: {
    color: '#00d4ff',
    fontWeight: 700,
    textDecoration: 'none',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: '13.5px',
  },
  trHead: {
    backgroundColor: '#0a0f18',
    borderBottom: '2px solid #00d4ff',
    textAlign: 'left',
  },
  th: {
    padding: '11px 12px',
    color: '#00d4ff',
    fontWeight: 700,
    fontSize: '12px',
  },
  trBody: {
    borderBottom: '1px solid #1e293b',
  },
  tdMetric: {
    padding: '12px',
    color: '#f8fafc',
    fontWeight: 700,
    minWidth: '210px',
  },
  tdBenchmark: {
    padding: '12px',
    color: '#10b981',
    fontWeight: 700,
    minWidth: '210px',
  },
  tdContext: {
    padding: '12px',
    color: '#cbd5e1',
    lineHeight: 1.5,
  },
  tdSource: {
    padding: '12px',
    whiteSpace: 'nowrap',
  },
  sourceLink: {
    color: '#00d4ff',
    fontWeight: 700,
    textDecoration: 'none',
    fontSize: '12.5px',
  },
  boilerplateList: {
    display: 'grid',
    gap: '14px',
  },
  boilerplateCard: {
    backgroundColor: '#0a0f18',
    border: '1px solid #1e293b',
    borderRadius: '6px',
    padding: '18px',
  },
  boilerplateTop: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: '10px',
    marginBottom: '10px',
  },
  boilerplateLabel: {
    fontSize: '13px',
    fontWeight: 700,
    color: '#00d4ff',
  },
  copyBtn: {
    backgroundColor: '#00d4ff',
    border: 'none',
    color: '#0a0f18',
    fontSize: '12px',
    fontWeight: 700,
    padding: '6px 14px',
    borderRadius: '4px',
    cursor: 'pointer',
  },
  copyBtnCopied: {
    backgroundColor: '#10b981',
    border: 'none',
    color: '#0a0f18',
    fontSize: '12px',
    fontWeight: 700,
    padding: '6px 14px',
    borderRadius: '4px',
    cursor: 'pointer',
  },
  boilerplateText: {
    fontSize: '14px',
    lineHeight: 1.65,
    color: '#e2e8f0',
    margin: 0,
  },
  badgeSnippetGrid: {
    display: 'grid',
    gap: '14px',
  },
  snippetCard: {
    backgroundColor: '#0a0f18',
    border: '1px solid #1e293b',
    borderRadius: '6px',
    padding: '16px',
  },
  snippetTitle: {
    fontSize: '13.5px',
    fontWeight: 700,
    color: '#10b981',
  },
  codeBlock: {
    backgroundColor: '#111a2a',
    border: '1px solid #1e293b',
    borderRadius: '4px',
    padding: '12px',
    color: '#00d4ff',
    fontSize: '12px',
    overflowX: 'auto',
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
