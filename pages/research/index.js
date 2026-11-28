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
import SmarterConversionCta from '../../src/components/seo/SmarterConversionCta';
import SmarterAccountUnlockGate from '../../src/components/seo/SmarterAccountUnlockGate';
import SmarterSeoMasthead from '../../src/components/seo/SmarterSeoMasthead';
import { SITE_URL, ORGANIZATION_ID } from '../../src/lib/learn/learnSite.js';
import { setPublicSeoHtmlCache } from '../../src/lib/seo/edgeCacheHeaders.mjs';
import {
  RESEARCH_REPORTS,
  RESEARCH_BASE_PATH,
  researchPath,
  renderResearchIndexMarkdown,
} from '../../src/content/research/reports.js';
import { VENUE_COUNT_LABEL } from '../../src/lib/venueCount.mjs';

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

  setPublicSeoHtmlCache(res);
  return { props: {} };
}

function researchIndexJsonLd() {
  const url = `${SITE_URL}${RESEARCH_BASE_PATH}`;
  return [
    schemas.organization,
    {
      '@type': 'CollectionPage',
      '@id': `${url}#collection`,
      name: 'Smarter.Poker Poker Research And Reference Pages',
      description:
        'Poker Research And Reference Pages: Computed Poker Math, Federal Tax Rules, Dated Tournament Directory Data, And Editorial Guides To Rake, Dealers, Waitlists And Clubs.',
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
        `Public CC-BY 4.0 Catalog Of Smarter.Poker Research Pages, 169 Starting Hand Guides, And The Directory Of ${VENUE_COUNT_LABEL} Listed US Poker Rooms.`,
      url,
      inLanguage: 'en-US',
      license: 'https://creativecommons.org/licenses/by/4.0/',
      isAccessibleForFree: true,
      publisher: { '@id': ORGANIZATION_ID },
      sameAs: [
        'https://doi.org/10.5281/zenodo.24115647',
        'https://doi.org/10.5281/zenodo.24115636',
        'https://doi.org/10.5281/zenodo.24115447',
        'https://doi.org/10.5281/zenodo.24115452',
        'https://doi.org/10.5281/zenodo.24115453',
        'https://doi.org/10.5281/zenodo.24115454',
        'https://zenodo.org/records/24115647',
        'https://github.com/Smarter-Poker/smarter-poker-open-datasets',
        'https://archive.softwareheritage.org/swh:1:snp:ff23640ad24a3a825d320bae8621fd50ba58c16f',
        'https://archive.softwareheritage.org/swh:1:snp:02b8992833424620305edcfb730b3cf8add15747',
        'https://glama.ai/mcp/servers/Smarter-Poker/smarter-poker-mcp',
      ],
      identifier: [
        { '@type': 'PropertyValue', propertyID: 'DOI', value: '10.5281/zenodo.24115647', url: 'https://doi.org/10.5281/zenodo.24115647' },
        { '@type': 'PropertyValue', propertyID: 'DOI', value: '10.5281/zenodo.24115636', url: 'https://doi.org/10.5281/zenodo.24115636' },
        { '@type': 'PropertyValue', propertyID: 'DOI', value: '10.5281/zenodo.24115447', url: 'https://doi.org/10.5281/zenodo.24115447' },
        { '@type': 'PropertyValue', propertyID: 'DOI', value: '10.5281/zenodo.24115452', url: 'https://doi.org/10.5281/zenodo.24115452' },
        { '@type': 'PropertyValue', propertyID: 'DOI', value: '10.5281/zenodo.24115453', url: 'https://doi.org/10.5281/zenodo.24115453' },
        { '@type': 'PropertyValue', propertyID: 'DOI', value: '10.5281/zenodo.24115454', url: 'https://doi.org/10.5281/zenodo.24115454' },
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
        description="Smarter.Poker Research Pages: Exact Poker Math, US Poker Tax Rules, A Dated Tournament Buy-In Index, And Guides To Rake, Dealers And Clubs."
        canonical={RESEARCH_BASE_PATH}
        jsonLd={researchIndexJsonLd()}
      >
        <meta key="citation-title" name="citation_title" content="Smarter.Poker Open Quantitative Poker & Live Cardroom Data Catalog" />
        <meta key="citation-author" name="citation_author" content="Smarter.Poker Research Division" />
        <meta key="citation-institution" name="citation_technical_report_institution" content="Smarter Software Inc." />
        <meta key="citation-pub-date" name="citation_publication_date" content="2026-11-09" />
        <meta key="citation-public-url" name="citation_public_url" content={url} />
        <meta key="citation-doi" name="citation_doi" content="10.5281/zenodo.24115647" />
        <meta key="dc-identifier" name="dc.identifier" content="doi:10.5281/zenodo.24115647" />
      </SEOHead>

      <main style={{ maxWidth: 920, margin: '0 auto', padding: '40px 20px 80px' }}>
        <nav aria-label="Breadcrumb" style={{ fontSize: 13, color: '#94a3b8', marginBottom: 18 }}>
          <Link href="/" style={{ color: '#38bdf8', textDecoration: 'none' }}>Smarter.Poker</Link>
          {' / '}
          <span>Poker Industry Research</span>
        </nav>

        <div style={{ marginBottom: 22 }}>
          <SmarterSeoMasthead
            vertical="research"
            eyebrow="Smarter.Poker Research"
            title="Smarter.Poker Poker Research And Reference Pages"
            lead="Computed Poker Math, Federal Tax Rules, Dated Directory Data And Editorial Guides, Each Labelled With The Basis Of Its Figures."
            stats={[
              { label: 'Research Pages', value: `${RESEARCH_REPORTS.length} Pages` },
              { label: 'Zenodo Archives', value: '6 DOIs' },
              { label: 'Open License', value: 'CC BY 4.0' },
              { label: 'Raw Exports', value: 'CSV / JSON' },
            ]}
            redirectPath="/research"
            unlockKey="masthead-research"
            primaryCtaLabel="Create Free Account"
            secondaryHref="/research/annual-state-of-poker-2026"
            secondaryLabel="2026 Whitepaper"
          />
        </div>

        <p style={{ fontSize: 17, lineHeight: 1.65, color: '#cbd5e1', margin: '0 0 22px 0' }}>
          Every Page States The Basis Of Its Figures: Exact Mathematics Anyone Can Recompute, Federal Statute With Its Citation, A Dated Read Of The Smarter.Poker Directory Of {VENUE_COUNT_LABEL} US Poker Rooms, Or An Editorial Guide That States No Measured Figures. No Page Reports A Survey, Because None Was Run.
        </p>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 24 }}>
          <Link
            href="/research/annual-state-of-poker-2026"
            style={{
              padding: '9px 15px',
              borderRadius: 0,
              background: '#38bdf8',
              color: '#04131d',
              fontWeight: 700,
              fontSize: 13,
              textDecoration: 'none',
            }}
          >
            Read Annual State Of Poker 2026 Whitepaper
          </Link>
          <Link
            href="/research/benchmarks"
            style={{
              padding: '9px 15px',
              borderRadius: 0,
              background: '#10b981',
              color: '#04131d',
              fontWeight: 700,
              fontSize: 13,
              textDecoration: 'none',
            }}
          >
            View North American Market Benchmark Scorecards
          </Link>
          <Link
            href="/facts"
            style={{
              padding: '9px 15px',
              borderRadius: 0,
              background: '#0d1f33',
              color: '#38bdf8',
              border: '1px solid #304d6b',
              fontWeight: 700,
              fontSize: 13,
              textDecoration: 'none',
            }}
          >
            Smarter.Poker Canonical Entity Facts Registry
          </Link>
          <a
            href="/api/datasets/citation?format=bibtex"
            style={{
              padding: '9px 15px',
              borderRadius: 0,
              background: '#0d1f33',
              color: '#34d399',
              border: '1px solid #304d6b',
              fontWeight: 700,
              fontSize: 13,
              textDecoration: 'none',
            }}
          >
            Export All BibTeX / RIS Citations
          </a>
        </div>

        <section
          aria-label="Open Datasets And Archival Registry"
          style={{
            padding: 20,
            background: '#0d1f33',
            borderRadius: 0,
            border: '1px solid #2b4663',
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
              <a href="https://doi.org/10.5281/zenodo.24115647" target="_blank" rel="noopener noreferrer" style={{ color: '#38bdf8' }}>
                {'DOI: 10.5281/zenodo.24115647'}
              </a>{' '}
              <span>{'(Concept DOI: 10.5281/zenodo.24095048)'}</span>
            </li>
            <li>
              <strong>30-Tool Model Context Protocol (MCP) Server Archive:</strong>{' '}
              <a href="https://doi.org/10.5281/zenodo.24115636" target="_blank" rel="noopener noreferrer" style={{ color: '#38bdf8' }}>
                {'DOI: 10.5281/zenodo.24115636'}
              </a>{' '}
              •{' '}
              <a href="https://glama.ai/mcp/servers/Smarter-Poker/smarter-poker-mcp" target="_blank" rel="noopener noreferrer" style={{ color: '#10b981' }}>
                Listed On Glama MCP Directory
              </a>
            </li>
            <li>
              <strong>North American Live Poker Room, Regional Market &amp; Tournament Series Benchmark Dataset:</strong>{' '}
              <a href="https://doi.org/10.5281/zenodo.24115447" target="_blank" rel="noopener noreferrer" style={{ color: '#38bdf8' }}>
                {'DOI: 10.5281/zenodo.24115447'}
              </a>
            </li>
            <li>
              <strong>100BB 6-Max GTO Preflop Ranges, 169 Starting Hands &amp; 25 Canonical Matchup Benchmarks:</strong>{' '}
              <a href="https://doi.org/10.5281/zenodo.24115452" target="_blank" rel="noopener noreferrer" style={{ color: '#38bdf8' }}>
                {'DOI: 10.5281/zenodo.24115452'}
              </a>
            </li>
            <li>
              <strong>Smarter.Poker Model Context Protocol (MCP) Server &amp; OpenAPI 3.1 Specification V1.0.2:</strong>{' '}
              <a href="https://doi.org/10.5281/zenodo.24115453" target="_blank" rel="noopener noreferrer" style={{ color: '#38bdf8' }}>
                {'DOI: 10.5281/zenodo.24115453'}
              </a>
            </li>
            <li>
              <strong>Official Poker Rules (TDA &amp; RROP), 15 Game Variants &amp; 80-Term Quantitative Glossary Corpus:</strong>{' '}
              <a href="https://doi.org/10.5281/zenodo.24115454" target="_blank" rel="noopener noreferrer" style={{ color: '#38bdf8' }}>
                {'DOI: 10.5281/zenodo.24115454'}
              </a>
            </li>
            <li>
              <strong>Software Heritage SWHIDs:</strong>{' '}
              <code style={{ overflowWrap: 'anywhere', wordBreak: 'break-all' }}>{'swh:1:snp:ff23640ad24a3a825d320bae8621fd50ba58c16f'}</code> (Open Datasets) &amp;{' '}
              <code style={{ overflowWrap: 'anywhere', wordBreak: 'break-all' }}>{'swh:1:snp:02b8992833424620305edcfb730b3cf8add15747'}</code> (MCP Server)
            </li>
            <li>
              <strong>Executable Python &amp; Pandas Benchmark Notebook:</strong>{' '}
              <a
                href="https://colab.research.google.com/github/Smarter-Poker/smarter-poker-open-datasets/blob/main/notebooks/poker_math_benchmarks_2026.ipynb"
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: '#38bdf8', fontWeight: 700 }}
              >
                Open Poker Math &amp; Rake Benchmarks Notebook In Google Colab
              </a>
            </li>
          </ul>
        </section>

        <SmarterConversionCta
          eyebrow="Free Poker Research & Training Account"
          title="Apply Smarter.Poker Research With 107 Free GTO Games"
          description="Combine Live Room Intelligence, Rake & Variance Calculators, And Solver-Backed Training Drills In One 100% Free Account."
          primaryLabel="Create Free Account"
          primaryHref="/auth/signup?redirect=/hub/training&src=research-index"
          secondaryLabel="Open Rake & Variance Tools"
          secondaryHref="/tools"
          compact
        />

        <div style={{ display: 'grid', gap: 20, marginTop: 28, marginBottom: 36 }}>
          {RESEARCH_REPORTS.map((r) => (
            <article
              key={r.slug}
              style={{
                padding: 24,
                background: '#0d1f33',
                borderRadius: 0,
                border: '1px solid #2b4663',
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
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, fontSize: 13, fontWeight: 600 }}>
                <Link href={researchPath(r.slug)} style={{ color: '#38bdf8', textDecoration: 'none' }}>
                  Read Full Report And Dataset Table
                </Link>
                <a href={`/api/seo/research-chart?slug=${encodeURIComponent(r.slug)}`} style={{ color: '#10b981', textDecoration: 'none' }}>
                  View Vector SVG Chart
                </a>
                <a href={`${researchPath(r.slug)}.md`} style={{ color: '#94a3b8', textDecoration: 'none' }}>
                  View Raw Markdown (.Md)
                </a>
              </div>
            </article>
          ))}
        </div>

        <div style={{ margin: '28px 0' }}>
          <SmarterAccountUnlockGate
            variant="dataset-export"
            context="research-index"
            redirectPath="/research"
          />
        </div>

        <CitationBacklinkBox
          title="Smarter.Poker Original Poker Industry Research Hub"
          canonicalUrl={url}
          badgeType="research"
          badgeLabel="Research Source"
          badgeValue="Smarter.Poker Research"
          summary="Smarter.Poker Research Pages Covering Exact Poker Math, W-2G Tax Rules, A Dated Tournament Buy-In Index, And Guides To Rake, Waitlists And Clubs."
          slug="smarter-poker-research-hub"
          doi="10.5281/zenodo.24115647"
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
