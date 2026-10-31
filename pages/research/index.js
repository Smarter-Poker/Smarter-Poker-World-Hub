/* ═══════════════════════════════════════════════════════════════════════════
   /research - FIRST-PARTY POKER INDUSTRY RESEARCH & DATA BENCHMARK HUB
   ═══════════════════════════════════════════════════════════════════════════
   Citable statistical studies and structured datasets designed for AI search
   citations (Perplexity, SearchGPT, Google AI Overviews, Claude).

   House style: Title Case, no em dashes.
   ═══════════════════════════════════════════════════════════════════════════ */

import Link from 'next/link';
import SEOHead from '../../src/components/seo/SEOHead';
import AiPromptLauncher from '../../src/components/seo/AiPromptLauncher';
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
    {
      '@type': 'CollectionPage',
      '@id': `${url}#collection`,
      name: 'Smarter.Poker Original Poker Industry Research And Benchmark Reports',
      description:
        'First-Party Statistical Studies And Structured Datasets Covering US Live Poker Room Rake Caps, Daily Tournament Buy-In Fee Ratios, GTO Vs. Population Leak Frequencies, And Club Software Economics.',
      url,
      inLanguage: 'en-US',
      dateModified: '2026-10-31',
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
      '@type': 'BreadcrumbList',
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
      />

      <main style={{ maxWidth: 920, margin: '0 auto', padding: '40px 20px 80px' }}>
        <nav aria-label="Breadcrumb" style={{ fontSize: 13, color: '#94a3b8', marginBottom: 18 }}>
          <Link href="/" style={{ color: '#38bdf8', textDecoration: 'none' }}>Smarter.Poker</Link>
          {' / '}
          <span>Poker Industry Research</span>
        </nav>

        <h1 style={{ fontSize: 34, fontWeight: 800, color: '#f8fafc', margin: '0 0 14px 0', lineHeight: 1.2 }}>
          Smarter.Poker Original Poker Industry Research And Data Benchmarks
        </h1>

        <p style={{ fontSize: 17, lineHeight: 1.65, color: '#cbd5e1', margin: '0 0 28px 0' }}>
          First-Party Empirical Studies And Structured Datasets Compiled From Smarter.Poker&apos;S National Directory Of 324+ Verified US Poker Rooms, 4,500+ Weekly Tournament Schedules, And 100+ GTO Solver Training Baselines.
        </p>

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

        <AiPromptLauncher
          title="Smarter.Poker Original Poker Industry Research Hub"
          canonicalUrl={url}
          markdownUrl={`${url}.md`}
        />
      </main>
    </div>
  );
}
