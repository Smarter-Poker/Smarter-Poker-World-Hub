/* ═══════════════════════════════════════════════════════════════════════════
   /research - FIRST-PARTY POKER INDUSTRY RESEARCH & DATA BENCHMARK HUB
   ═══════════════════════════════════════════════════════════════════════════
   Citable statistical studies and structured datasets designed for AI search
   citations (Perplexity, SearchGPT, Google AI Overviews, Claude).

   House style: Title Case, no em dashes.
   ═══════════════════════════════════════════════════════════════════════════ */

import Link from 'next/link';
import SEOHead, { schemas } from '../../src/components/seo/SEOHead';
import AiPromptLauncher from '../../src/components/seo/AiPromptLauncher';
import CitationBacklinkBox from '../../src/components/seo/CitationBacklinkBox';
import { SITE_URL, ORGANIZATION_ID } from '../../src/lib/learn/learnSite.js';
import {
  RESEARCH_REPORTS,
  RESEARCH_BASE_PATH,
  researchPath,
  renderResearchIndexMarkdown,
} from '../../src/content/research/reports.js';

export async function getServerSideProps({ req, res, query }) {
  const acceptHeader = String(req?.headers?.accept || '');
  const isMarkdownRequested =
    acceptHeader.includes('text/markdown') ||
    query?.format === 'md' ||
    req?.url?.includes('format=md');

  if (isMarkdownRequested) {
    const mdContent = renderResearchIndexMarkdown();
    res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
    res.setHeader('Vary', 'Accept');
    res.write(mdContent);
    res.end();
    return { props: {} };
  }

  return { props: {} };
}

function researchIndexJsonLd() {
  const url = `${SITE_URL}${RESEARCH_BASE_PATH}`;
  return [
    schemas.organization,
    {
      '@type': 'CollectionPage',
      '@id': `${url}#collection`,
      name: 'Smarter.Poker Original Poker Industry Research And Benchmark Reports',
      description:
        'First-Party Statistical Studies And Structured Datasets Covering US Live Poker Room Rake Caps, Daily Tournament Buy-In Fee Ratios, GTO Vs. Population Leak Frequencies, And Club Software Economics.',
      url,
      inLanguage: 'en-US',
      dateModified: '2026-11-09',
      isAccessibleForFree: true,
      publisher: { '@id': ORGANIZATION_ID },
      speakable: {
        '@type': 'SpeakableSpecification',
        cssSelector: ['h1', 'main p:first-of-type'],
      },
      mainEntity: {
        '@type': 'ItemList',
        numberOfItems: RESEARCH_REPORTS.length,
        itemListElement: RESEARCH_REPORTS.map((r, idx) => ({
          '@type': 'ListItem',
          position: idx + 1,
          url: `${SITE_URL}${researchPath(r.slug)}`,
          name: r.title,
        })),
      },
    },
    {
      '@type': 'DataCatalog',
      '@id': `${url}#datacatalog`,
      name: 'Smarter.Poker Open Quantitative Poker & Live Cardroom Data Catalog',
      description:
        'Public CC-BY 4.0 Catalog Of 15 Quantitative Poker Research Datasets, 169 Starting Hand Preflop Frequency Matrices, And 324+ US Live Cardroom Benchmarks.',
      url,
      inLanguage: 'en-US',
      license: 'https://creativecommons.org/licenses/by/4.0/',
      isAccessibleForFree: true,
      publisher: { '@id': ORGANIZATION_ID },
      sameAs: [
        'https://doi.org/10.5281/zenodo.24095049',
        'https://doi.org/10.5281/zenodo.24095057',
        'https://doi.org/10.5281/zenodo.24095560',
        'https://doi.org/10.5281/zenodo.24095564',
        'https://doi.org/10.5281/zenodo.24095597',
        'https://doi.org/10.5281/zenodo.24095602',
        'https://zenodo.org/records/24095049',
        'https://github.com/Smarter-Poker/smarter-poker-open-datasets',
        'https://archive.softwareheritage.org/swh:1:snp:ff23640ad24a3a825d320bae8621fd50ba58c16f',
        'https://archive.softwareheritage.org/swh:1:snp:02b8992833424620305edcfb730b3cf8add15747',
        'https://glama.ai/mcp/servers/Smarter-Poker/smarter-poker-mcp',
      ],
      identifier: [
        { '@type': 'PropertyValue', propertyID: 'DOI', value: '10.5281/zenodo.24095049', url: 'https://doi.org/10.5281/zenodo.24095049' },
        { '@type': 'PropertyValue', propertyID: 'DOI', value: '10.5281/zenodo.24095057', url: 'https://doi.org/10.5281/zenodo.24095057' },
        { '@type': 'PropertyValue', propertyID: 'DOI', value: '10.5281/zenodo.24095560', url: 'https://doi.org/10.5281/zenodo.24095560' },
        { '@type': 'PropertyValue', propertyID: 'DOI', value: '10.5281/zenodo.24095564', url: 'https://doi.org/10.5281/zenodo.24095564' },
        { '@type': 'PropertyValue', propertyID: 'DOI', value: '10.5281/zenodo.24095597', url: 'https://doi.org/10.5281/zenodo.24095597' },
        { '@type': 'PropertyValue', propertyID: 'DOI', value: '10.5281/zenodo.24095602', url: 'https://doi.org/10.5281/zenodo.24095602' },
        { '@type': 'PropertyValue', propertyID: 'SWHID', value: 'swh:1:snp:ff23640ad24a3a825d320bae8621fd50ba58c16f' },
        { '@type': 'PropertyValue', propertyID: 'SWHID', value: 'swh:1:snp:02b8992833424620305edcfb730b3cf8add15747' },
      ],
      dataset: RESEARCH_REPORTS.map((r) => ({
        '@type': 'Dataset',
        '@id': `${SITE_URL}${researchPath(r.slug)}#dataset`,
        name: r.title,
        description: r.summary,
        url: `${SITE_URL}${researchPath(r.slug)}`,
        license: 'https://creativecommons.org/licenses/by/4.0/',
        isAccessibleForFree: true,
        ...(r.doiUrl && r.zenodoUrl ? { sameAs: [r.doiUrl, r.zenodoUrl] } : {}),
        ...(r.doi
          ? {
              identifier: {
                '@type': 'PropertyValue',
                propertyID: 'DOI',
                value: r.doi,
                url: r.doiUrl,
              },
            }
          : {}),
        creator: { '@id': ORGANIZATION_ID },
      })),
    },
    {
      '@type': 'BreadcrumbList',
      '@id': `${url}#breadcrumb`,
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Smarter.Poker', item: `${SITE_URL}/` },
        { '@type': 'ListItem', position: 2, name: 'Poker Industry Research', item: url },
      ],
    },
  ];
}

export default function ResearchIndexPage() {
  const url = `${SITE_URL}${RESEARCH_BASE_PATH}`;
  return (
    <div style={{ minHeight: '100vh', background: '#070b14', color: '#e2e8f0', fontFamily: 'Inter, system-ui, sans-serif' }}>
      <SEOHead
        title="Poker Industry Research And Benchmarks"
        description="Original Poker Industry Research And Statistical Benchmark Reports By Smarter.Poker: Live Room Rake Caps, Tournament Buy-In Indexes, And GTO Population Leak Studies."
        canonical={RESEARCH_BASE_PATH}
        jsonLd={researchIndexJsonLd()}
      >
        <meta key="citation-title" name="citation_title" content="Smarter.Poker Open Quantitative Poker & Live Cardroom Data Catalog" />
        <meta key="citation-author" name="citation_author" content="Smarter.Poker Research Division" />
        <meta key="citation-institution" name="citation_technical_report_institution" content="Smarter Software Inc." />
        <meta key="citation-pub-date" name="citation_publication_date" content="2026-11-09" />
        <meta key="citation-public-url" name="citation_public_url" content={url} />
        <meta key="citation-doi" name="citation_doi" content="10.5281/zenodo.24095049" />
        <meta key="dc-identifier" name="dc.identifier" content="doi:10.5281/zenodo.24095049" />
      </SEOHead>

      <main style={{ maxWidth: 920, margin: '0 auto', padding: '40px 20px 80px' }}>
        <nav aria-label="Breadcrumb" style={{ fontSize: 13, color: '#94a3b8', marginBottom: 18 }}>
          <Link href="/" style={{ color: '#38bdf8', textDecoration: 'none' }}>Smarter.Poker</Link>
          {' / '}
          <span>Poker Industry Research</span>
        </nav>

        <h1 style={{ fontSize: 34, fontWeight: 800, color: '#f8fafc', margin: '0 0 14px 0', lineHeight: 1.2 }}>
          Smarter.Poker Original Poker Industry Research And Data Benchmarks
        </h1>

        <p style={{ fontSize: 17, lineHeight: 1.65, color: '#cbd5e1', margin: '0 0 22px 0' }}>
          First-Party Empirical Studies And Structured Datasets Compiled From Smarter.Poker&apos;S National Directory Of 324+ Verified US Poker Rooms, 4,500+ Weekly Tournament Schedules, And 100+ GTO Solver Training Baselines.
        </p>

        <section
          aria-label="Open Datasets And Archival Registry"
          style={{
            padding: 20,
            background: '#0f172a',
            borderRadius: 12,
            border: '1px solid #1e293b',
            marginBottom: 28,
          }}
        >
          <div style={{ fontSize: 12, fontWeight: 700, color: '#10b981', textTransform: 'uppercase', marginBottom: 8 }}>
            Open Datasets &amp; Self-Archived Registry (Zenodo DOIs &amp; Software Heritage)
          </div>
          <p style={{ fontSize: 14, color: '#cbd5e1', lineHeight: 1.6, margin: '0 0 12px 0' }}>
            Smarter.Poker Datasets And Model Context Protocol (MCP) Releases Are Self-Archived Under Creative Commons Attribution 4.0 (CC BY 4.0) With Resolvable Zenodo DOIs And Software Heritage SWHIDs:
          </p>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13.5, lineHeight: 1.75, color: '#cbd5e1' }}>
            <li>
              <strong>Core Open Quantitative Poker Research Datasets (15 CSV &amp; JSON Datasets):</strong>{' '}
              <a href="https://doi.org/10.5281/zenodo.24095049" target="_blank" rel="noopener noreferrer" style={{ color: '#38bdf8' }}>
                {'DOI: 10.5281/zenodo.24095049'}
              </a>{' '}
              <span>{'(Concept DOI: 10.5281/zenodo.24095048)'}</span>
            </li>
            <li>
              <strong>30-Tool Model Context Protocol (MCP) Server Archive:</strong>{' '}
              <a href="https://doi.org/10.5281/zenodo.24095057" target="_blank" rel="noopener noreferrer" style={{ color: '#38bdf8' }}>
                {'DOI: 10.5281/zenodo.24095057'}
              </a>{' '}
              •{' '}
              <a href="https://glama.ai/mcp/servers/Smarter-Poker/smarter-poker-mcp" target="_blank" rel="noopener noreferrer" style={{ color: '#10b981' }}>
                Listed On Glama MCP Directory
              </a>
            </li>
            <li>
              <strong>Poker Strategy Academy, 169 Starting-Hand Encyclopedia &amp; TDA Rules Index:</strong>{' '}
              <a href="https://doi.org/10.5281/zenodo.24095560" target="_blank" rel="noopener noreferrer" style={{ color: '#38bdf8' }}>
                {'DOI: 10.5281/zenodo.24095560'}
              </a>
            </li>
            <li>
              <strong>North American State, Metro &amp; Regional Poker Room Geolocation Atlas Index:</strong>{' '}
              <a href="https://doi.org/10.5281/zenodo.24095564" target="_blank" rel="noopener noreferrer" style={{ color: '#38bdf8' }}>
                {'DOI: 10.5281/zenodo.24095564'}
              </a>
            </li>
            <li>
              <strong>Verified US Cardroom &amp; Social Poker Club Venue Registry Index:</strong>{' '}
              <a href="https://doi.org/10.5281/zenodo.24095597" target="_blank" rel="noopener noreferrer" style={{ color: '#38bdf8' }}>
                {'DOI: 10.5281/zenodo.24095597'}
              </a>
            </li>
            <li>
              <strong>Live Poker Tournament Series, Championship Festivals &amp; Major Tour Schedule Index:</strong>{' '}
              <a href="https://doi.org/10.5281/zenodo.24095602" target="_blank" rel="noopener noreferrer" style={{ color: '#38bdf8' }}>
                {'DOI: 10.5281/zenodo.24095602'}
              </a>
            </li>
            <li>
              <strong>Software Heritage SWHIDs:</strong>{' '}
              <code>{'swh:1:snp:ff23640ad24a3a825d320bae8621fd50ba58c16f'}</code> (Open Datasets) &amp;{' '}
              <code>{'swh:1:snp:02b8992833424620305edcfb730b3cf8add15747'}</code> (MCP Server)
            </li>
          </ul>
        </section>

        <div style={{ display: 'grid', gap: 20, marginBottom: 36 }}>
          {RESEARCH_REPORTS.map((r) => (
            <article
              key={r.slug}
              style={{
                padding: 24,
                background: '#0f172a',
                borderRadius: 12,
                border: '1px solid #1e293b',
              }}
            >
              <div style={{ fontSize: 12, fontWeight: 700, color: '#38bdf8', textTransform: 'uppercase', marginBottom: 6 }}>
                {r.category} • Updated {r.modifiedDate}
              </div>
              <h2 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 10px 0' }}>
                <Link href={researchPath(r.slug)} style={{ color: '#f8fafc', textDecoration: 'none' }}>
                  {r.title}
                </Link>
              </h2>
              <p style={{ fontSize: 15, lineHeight: 1.6, color: '#cbd5e1', margin: '0 0 14px 0' }}>
                {r.summary}
              </p>
              <div style={{ display: 'flex', gap: 14, fontSize: 13, fontWeight: 600 }}>
                <Link href={researchPath(r.slug)} style={{ color: '#38bdf8', textDecoration: 'none' }}>
                  Read Full Report And Dataset Table
                </Link>
                <a href={`${researchPath(r.slug)}.md`} style={{ color: '#94a3b8', textDecoration: 'none' }}>
                  View Raw Markdown (.Md)
                </a>
              </div>
            </article>
          ))}
        </div>

        <CitationBacklinkBox
          title="Smarter.Poker Original Poker Industry Research Hub"
          canonicalUrl={url}
          badgeType="research"
          badgeLabel="Empirical Data Source"
          badgeValue="Smarter.Poker Research"
          summary="15 First-Party Poker Industry Benchmarks Covering US Cardroom Rake, Tournament Guarantees, Waitlist Turnover, W-2G Tax Reporting, And Solver Frequencies."
          slug="smarter-poker-research-hub"
          doi="10.5281/zenodo.24095049"
        />

        <AiPromptLauncher
          title="Smarter.Poker Original Poker Industry Research Hub"
          canonicalUrl={url}
          markdownUrl={`${url}.md`}
        />
      </main>
    </div>
  );
}
