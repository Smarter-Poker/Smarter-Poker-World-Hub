/* ═══════════════════════════════════════════════════════════════════════════
   /research/[slug] - INDIVIDUAL FIRST-PARTY POKER INDUSTRY RESEARCH REPORT
   ═══════════════════════════════════════════════════════════════════════════
   Emits Schema.org Report + Dataset + FAQPage + BreadcrumbList +
   SpeakableSpecification JSON-LD and serves raw Markdown when requested via
   .md or Accept: text/markdown.

   House style: Title Case, no em dashes.
   ═══════════════════════════════════════════════════════════════════════════ */

import React, { useState } from 'react';
import Link from 'next/link';
import SEOHead, { schemas } from '../../src/components/seo/SEOHead';
import AiPromptLauncher from '../../src/components/seo/AiPromptLauncher';
import CitationBacklinkBox from '../../src/components/seo/CitationBacklinkBox';
import { SITE_URL, ORGANIZATION_ID } from '../../src/lib/learn/learnSite.js';
import {
  RESEARCH_REPORTS,
  RESEARCH_BASE_PATH,
  researchPath,
  getResearchReport,
  renderResearchReportMarkdown,
} from '../../src/content/research/reports.js';

export async function getServerSideProps({ req, res, params, query }) {
  const slug = String(params?.slug || '').replace(/\.md$/i, '');
  const report = getResearchReport(slug);
  if (!report) return { notFound: true };

  const acceptHeader = String(req?.headers?.accept || '');
  const isMarkdownRequested =
    acceptHeader.includes('text/markdown') ||
    query?.format === 'md' ||
    req?.url?.includes('format=md') ||
    String(params?.slug || '').endsWith('.md');

  if (isMarkdownRequested) {
    const mdContent = renderResearchReportMarkdown(report);
    res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
    res.setHeader('Vary', 'Accept');
    res.write(mdContent);
    res.end();
    return { props: {} };
  }

  return { props: { report } };
}

function reportJsonLd(report) {
  const path = researchPath(report.slug);
  const url = `${SITE_URL}${path}`;
  const ogImageUrl = `${SITE_URL}/api/og/tool-card?tool=research&title=${encodeURIComponent(report.shortTitle)}`;
  const doi = report.doi || null;
  const doiUrl = report.doiUrl || null;
  const zenodoUrl = report.zenodoUrl || null;
  const collectionDoi = report.collectionDoi || '10.5281/zenodo.24115647';
  const collectionDoiUrl = report.collectionDoiUrl || 'https://doi.org/10.5281/zenodo.24115647';
  const swhid = report.swhid || 'swh:1:snp:ff23640ad24a3a825d320bae8621fd50ba58c16f';
  return [
    schemas.organization,
    {
      '@type': 'Report',
      '@id': `${url}#report`,
      headline: report.title,
      name: report.title,
      description: report.summary,
      url,
      mainEntityOfPage: { '@type': 'WebPage', '@id': url },
      inLanguage: 'en-US',
      datePublished: report.publishedDate,
      dateModified: report.modifiedDate,
      isAccessibleForFree: true,
      license: 'https://creativecommons.org/licenses/by/4.0/',
      isPartOf: {
        '@type': 'CollectionPage',
        '@id': `${SITE_URL}${RESEARCH_BASE_PATH}#collection`,
        url: `${SITE_URL}${RESEARCH_BASE_PATH}`,
      },
      ...(doiUrl && zenodoUrl ? { sameAs: [doiUrl, zenodoUrl] } : {}),
      identifier: [
        ...(doi ? [{ '@type': 'PropertyValue', propertyID: 'DOI', value: doi, url: doiUrl }] : []),
        { '@type': 'PropertyValue', propertyID: 'SWHID', value: swhid },
      ],
      author: {
        '@type': 'Organization',
        '@id': ORGANIZATION_ID,
        name: 'Smarter.Poker Research Division',
        url: SITE_URL,
      },
      publisher: { '@id': ORGANIZATION_ID },
      image: {
        '@type': 'ImageObject',
        '@id': `${url}#primaryimage`,
        url: ogImageUrl,
        contentUrl: ogImageUrl,
        caption: `${report.title} - Smarter.Poker Research`,
      },
      about: { '@id': `${url}#dataset` },
      speakable: {
        '@type': 'SpeakableSpecification',
        cssSelector: ['h1', 'main p:first-of-type'],
      },
    },
    {
      '@type': 'Dataset',
      '@id': `${url}#dataset`,
      name: report.table.caption,
      description: report.summary,
      url,
      inLanguage: 'en-US',
      datePublished: report.publishedDate,
      dateModified: report.modifiedDate,
      temporalCoverage: '2026',
      license: 'https://creativecommons.org/licenses/by/4.0/',
      isAccessibleForFree: true,
      keywords: [report.category, 'Poker Research', 'Smarter.Poker Dataset', report.shortTitle],
      creator: { '@id': ORGANIZATION_ID },
      publisher: { '@id': ORGANIZATION_ID },
      includedInDataCatalog: {
        '@type': 'DataCatalog',
        '@id': `${SITE_URL}${RESEARCH_BASE_PATH}#datacatalog`,
        name: 'Smarter.Poker Open Quantitative Poker & Live Cardroom Data Catalog',
        url: `${SITE_URL}${RESEARCH_BASE_PATH}`,
        sameAs: [collectionDoiUrl],
        identifier: {
          '@type': 'PropertyValue',
          propertyID: 'DOI',
          value: collectionDoi,
          url: collectionDoiUrl,
        },
      },
      sameAs: [
        ...(doiUrl && zenodoUrl ? [doiUrl, zenodoUrl] : []),
        'https://github.com/Smarter-Poker/smarter-poker-open-datasets',
        `https://archive.softwareheritage.org/${swhid}`,
      ],
      identifier: [
        ...(doi ? [{ '@type': 'PropertyValue', propertyID: 'DOI', value: doi, url: doiUrl }] : []),
        { '@type': 'PropertyValue', propertyID: 'SWHID', value: swhid, url: `https://archive.softwareheritage.org/${swhid}` },
      ],
      variableMeasured: report.table.columns,
      distribution: [
        {
          '@type': 'DataDownload',
          encodingFormat: 'text/html',
          contentUrl: url,
        },
        {
          '@type': 'DataDownload',
          encodingFormat: 'text/markdown',
          contentUrl: `${url}.md`,
        },
        {
          '@type': 'DataDownload',
          encodingFormat: 'application/json',
          contentUrl: `${SITE_URL}/api/datasets/catalog?slug=${report.slug}`,
        },
        {
          '@type': 'DataDownload',
          encodingFormat: 'image/svg+xml',
          contentUrl: `${SITE_URL}/api/seo/research-chart?slug=${report.slug}`,
        },
      ],
    },
    {
      '@type': 'FAQPage',
      '@id': `${url}#faq`,
      mainEntity: report.faq.map((item) => ({
        '@type': 'Question',
        name: item.q,
        acceptedAnswer: {
          '@type': 'Answer',
          text: item.a,
        },
      })),
    },
    {
      '@type': 'BreadcrumbList',
      '@id': `${url}#breadcrumb`,
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Smarter.Poker', item: `${SITE_URL}/` },
        { '@type': 'ListItem', position: 2, name: 'Poker Industry Research', item: `${SITE_URL}${RESEARCH_BASE_PATH}` },
        { '@type': 'ListItem', position: 3, name: report.shortTitle, item: url },
      ],
    },
  ];
}

export default function ResearchReportDetailPage({ report }) {
  const [chartCopiedKey, setChartCopiedKey] = useState('');
  const path = researchPath(report.slug);
  const url = `${SITE_URL}${path}`;
  const ogImageUrl = `${SITE_URL}/api/og/tool-card?tool=research&title=${encodeURIComponent(report.shortTitle)}`;
  const chartSvgUrl = `${SITE_URL}/api/seo/research-chart?slug=${encodeURIComponent(report.slug)}`;
  const colabNotebookUrl =
    'https://colab.research.google.com/github/Smarter-Poker/smarter-poker-open-datasets/blob/main/notebooks/poker_math_benchmarks_2026.ipynb';
  const chartHtmlSnippet = `<figure style="margin:0;padding:14px;background:#070b14;border:1px solid #1e293b;border-radius:10px;text-align:center;"><img src="${chartSvgUrl}" alt="${report.title}" width="880" height="480" style="max-width:100%;height:auto;border-radius:8px;" loading="lazy" /><figcaption style="margin-top:8px;font-size:12px;color:#94a3b8;font-family:Inter,system-ui,sans-serif;">Source: ${report.shortTitle} (Smarter.Poker Research, CC BY 4.0, DOI: ${report.doi || '10.5281/zenodo.24115647'})</figcaption></figure>`;
  const chartMarkdownSnippet = `![${report.shortTitle}](${chartSvgUrl})\n*Source: ${report.title} (Smarter.Poker Research, DOI: ${report.doi || '10.5281/zenodo.24115647'}, ${url})*`;
  const others = RESEARCH_REPORTS.filter((r) => r.slug !== report.slug);

  const handleChartCopy = async (key, value) => {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(value);
        setChartCopiedKey(key);
        setTimeout(() => setChartCopiedKey(''), 2200);
      }
    } catch {
      // Clipboard fallback ignored
    }
  };

  return (
    <div style={{ minHeight: '100vh', background: '#070b14', color: '#e2e8f0', fontFamily: 'Inter, system-ui, sans-serif' }}>
      <SEOHead
        title={report.shortTitle}
        description={report.summary}
        canonical={path}
        ogImage={ogImageUrl}
        ogType="article"
        jsonLd={reportJsonLd(report)}
      >
        <meta key="citation-title" name="citation_title" content={report.title} />
        <meta key="citation-author" name="citation_author" content="Smarter.Poker Research Division" />
        <meta key="citation-institution" name="citation_technical_report_institution" content="Smarter Software Inc." />
        <meta key="citation-pub-date" name="citation_publication_date" content={report.publishedDate} />
        <meta key="citation-online-date" name="citation_online_date" content={report.modifiedDate} />
        <meta key="citation-public-url" name="citation_public_url" content={url} />
        {report.doi ? <meta key="citation-doi" name="citation_doi" content={report.doi} /> : null}
        <meta key="citation-language" name="citation_language" content="en" />
        <meta key="dc-identifier" name="dc.identifier" content={report.doi ? `doi:${report.doi}` : url} />
        <meta key="dc-relation-ispartof" name="dc.relation.ispartof" content={`doi:${report.collectionDoi || '10.5281/zenodo.24115647'}`} />
        <meta key="dc-rights" name="dc.rights" content="https://creativecommons.org/licenses/by/4.0/" />
      </SEOHead>

      <main style={{ maxWidth: 920, margin: '0 auto', padding: '40px 20px 80px' }}>
        <nav aria-label="Breadcrumb" style={{ fontSize: 13, color: '#94a3b8', marginBottom: 18 }}>
          <Link href="/" style={{ color: '#38bdf8', textDecoration: 'none' }}>Smarter.Poker</Link>
          {' / '}
          <Link href="/research" style={{ color: '#38bdf8', textDecoration: 'none' }}>Poker Industry Research</Link>
          {' / '}
          <span>{report.shortTitle}</span>
        </nav>

        <div style={{ fontSize: 12, fontWeight: 700, color: '#38bdf8', textTransform: 'uppercase', marginBottom: 8 }}>
          {report.category} • Published {report.publishedDate} • Updated {report.modifiedDate}
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 14 }}>
          <a
            href={report.doiUrl || report.collectionDoiUrl || 'https://doi.org/10.5281/zenodo.24115647'}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              fontSize: 12,
              fontWeight: 700,
              color: '#10b981',
              background: 'rgba(16, 185, 129, 0.12)',
              border: '1px solid #10b981',
              padding: '4px 10px',
              borderRadius: 6,
              textDecoration: 'none',
            }}
          >
            {report.doi ? `Report DOI: ${report.doi}` : `Parent Dataset Archive (Zenodo DOI: ${report.collectionDoi || '10.5281/zenodo.24115647'})`}
          </a>
          <a
            href={`https://archive.softwareheritage.org/${report.swhid || 'swh:1:snp:ff23640ad24a3a825d320bae8621fd50ba58c16f'}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: '#38bdf8',
              background: 'rgba(56, 189, 248, 0.12)',
              border: '1px solid #38bdf8',
              padding: '4px 10px',
              borderRadius: 6,
              textDecoration: 'none',
              fontFamily: 'monospace',
            }}
          >
            {report.swhid || 'swh:1:snp:ff23640ad24a3a825d320bae8621fd50ba58c16f'}
          </a>
          <a
            href={colabNotebookUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              fontSize: 12,
              fontWeight: 700,
              color: '#f59e0b',
              background: 'rgba(245, 158, 11, 0.12)',
              border: '1px solid #f59e0b',
              padding: '4px 10px',
              borderRadius: 6,
              textDecoration: 'none',
            }}
          >
            Open In Google Colab (Python Notebook)
          </a>
        </div>

        <h1 style={{ fontSize: 32, fontWeight: 800, color: '#f8fafc', margin: '0 0 16px 0', lineHeight: 1.2 }}>
          {report.title}
        </h1>

        <p style={{ fontSize: 17, lineHeight: 1.65, color: '#cbd5e1', margin: '0 0 26px 0' }}>
          {report.summary}
        </p>

        <section style={{ marginBottom: 32, padding: 20, background: '#0f172a', borderRadius: 12, border: '1px solid #1e293b' }}>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: '#f8fafc', margin: '0 0 12px 0' }}>
            Key Empirical Findings
          </h2>
          <ul style={{ margin: 0, paddingLeft: 20, lineHeight: 1.75, color: '#cbd5e1' }}>
            {report.keyFindings.map((finding) => (
              <li key={finding} style={{ marginBottom: 8 }}>{finding}</li>
            ))}
          </ul>
        </section>

        <section
          aria-label="Embeddable Vector Benchmark Chart"
          style={{
            marginBottom: 32,
            padding: 20,
            background: '#0f172a',
            borderRadius: 12,
            border: '1px solid #1e293b',
          }}
        >
          <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <div>
              <h2 style={{ fontSize: 20, fontWeight: 700, color: '#f8fafc', margin: 0 }}>
                Publication-Ready Vector Benchmark Chart (CC BY 4.0)
              </h2>
              <p style={{ fontSize: 13, color: '#94a3b8', margin: '4px 0 0 0' }}>
                Embed Or Download This Vector SVG Chart With Canonical Smarter.Poker And Zenodo DOI Attribution
              </p>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              <button
                type="button"
                onClick={() => handleChartCopy('html', chartHtmlSnippet)}
                style={{
                  padding: '7px 12px',
                  fontSize: 12,
                  fontWeight: 700,
                  borderRadius: 6,
                  border: '1px solid #38bdf8',
                  background: chartCopiedKey === 'html' ? '#10b981' : 'rgba(56, 189, 248, 0.14)',
                  color: chartCopiedKey === 'html' ? '#04131d' : '#38bdf8',
                  cursor: 'pointer',
                }}
              >
                {chartCopiedKey === 'html' ? 'Copied HTML Chart Embed' : 'Copy HTML Chart Embed'}
              </button>
              <button
                type="button"
                onClick={() => handleChartCopy('md', chartMarkdownSnippet)}
                style={{
                  padding: '7px 12px',
                  fontSize: 12,
                  fontWeight: 700,
                  borderRadius: 6,
                  border: '1px solid #10b981',
                  background: chartCopiedKey === 'md' ? '#10b981' : 'rgba(16, 185, 129, 0.12)',
                  color: chartCopiedKey === 'md' ? '#04131d' : '#34d399',
                  cursor: 'pointer',
                }}
              >
                {chartCopiedKey === 'md' ? 'Copied Markdown Chart' : 'Copy Markdown Chart'}
              </button>
              <a
                href={`/api/seo/research-chart?slug=${encodeURIComponent(report.slug)}&download=1`}
                style={{
                  padding: '7px 12px',
                  fontSize: 12,
                  fontWeight: 700,
                  borderRadius: 6,
                  border: '1px solid #475569',
                  background: '#070b14',
                  color: '#e2e8f0',
                  textDecoration: 'none',
                }}
              >
                Download SVG Chart
              </a>
            </div>
          </div>

          <div style={{ background: '#070b14', padding: 12, borderRadius: 8, border: '1px solid #1e293b', textAlign: 'center' }}>
            <img
              src={`/api/seo/research-chart?slug=${encodeURIComponent(report.slug)}`}
              alt={`${report.title} Benchmark Chart`}
              width={880}
              height={460}
              loading="lazy"
              style={{ maxWidth: '100%', height: 'auto', borderRadius: 6, display: 'block', margin: '0 auto' }}
            />
          </div>
        </section>

        <section style={{ marginBottom: 32, overflowX: 'auto' }}>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: '#f8fafc', margin: '0 0 12px 0' }}>
            {report.table.caption}
          </h2>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14, background: '#0f172a', borderRadius: 10 }}>
            <caption style={{ textAlign: 'left', fontWeight: 600, padding: '8px 0', color: '#94a3b8' }}>
              {report.methodology}
            </caption>
            <thead>
              <tr style={{ borderBottom: '1px solid #1e293b', color: '#38bdf8', textAlign: 'left' }}>
                {report.table.columns.map((col) => (
                  <th key={col} scope="col" style={{ padding: '12px 14px' }}>{col}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {report.table.rows.map((row) => (
                <tr key={row[0]} style={{ borderBottom: '1px solid #1e293b' }}>
                  {row.map((cell, idx) => (
                    <td
                      key={`${row[0]}-${idx}`}
                      style={{
                        padding: '12px 14px',
                        fontWeight: idx === 0 ? 700 : 400,
                        color: idx === 0 ? '#f8fafc' : '#cbd5e1',
                      }}
                    >
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section style={{ marginBottom: 32 }}>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: '#f8fafc', margin: '0 0 14px 0' }}>
            Frequently Asked Questions
          </h2>
          {report.faq.map((item) => (
            <div key={item.q} style={{ marginBottom: 18 }}>
              <h3 style={{ fontSize: 17, fontWeight: 700, color: '#e2e8f0', margin: '0 0 6px 0' }}>{item.q}</h3>
              <p style={{ fontSize: 15, lineHeight: 1.6, color: '#cbd5e1', margin: 0 }}>{item.a}</p>
            </div>
          ))}
        </section>

        <section style={{ marginBottom: 32 }}>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: '#f8fafc', margin: '0 0 12px 0' }}>
            More Smarter.Poker Research Reports
          </h2>
          <ul style={{ margin: 0, paddingLeft: 20, lineHeight: 1.8 }}>
            {others.map((o) => (
              <li key={o.slug}>
                <Link href={researchPath(o.slug)} style={{ color: '#38bdf8', textDecoration: 'none', fontWeight: 600 }}>
                  {o.title}
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <CitationBacklinkBox
          title={report.title}
          canonicalUrl={url}
          badgeType="research"
          badgeLabel="Empirical Data Source"
          badgeValue={report.shortTitle || 'Smarter.Poker Research'}
          summary={report.summary}
          publishedYear={String(report.publishedDate || '2026').slice(0, 4)}
          slug={report.slug}
        />

        <AiPromptLauncher
          title={report.title}
          canonicalUrl={url}
          markdownUrl={`${url}.md`}
        />
      </main>
    </div>
  );
}
