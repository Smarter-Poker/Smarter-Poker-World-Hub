/* ═══════════════════════════════════════════════════════════════════════════
   /research/[slug] - INDIVIDUAL FIRST-PARTY POKER INDUSTRY RESEARCH REPORT
   ═══════════════════════════════════════════════════════════════════════════
   Emits Schema.org Report + Dataset + FAQPage + BreadcrumbList +
   SpeakableSpecification JSON-LD and serves raw Markdown when requested via
   .md or Accept: text/markdown.

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
  return [
    {
      '@type': 'Report',
      '@id': `${url}#report`,
      headline: report.title,
      name: report.title,
      description: report.summary,
      url,
      inLanguage: 'en-US',
      datePublished: report.publishedDate,
      dateModified: report.modifiedDate,
      isAccessibleForFree: true,
      publisher: { '@id': ORGANIZATION_ID },
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
      license: 'https://creativecommons.org/licenses/by/4.0/',
      isAccessibleForFree: true,
      creator: { '@id': ORGANIZATION_ID },
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
      ],
    },
    {
      '@type': 'FAQPage',
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
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Smarter.Poker', item: `${SITE_URL}/` },
        { '@type': 'ListItem', position: 2, name: 'Poker Industry Research', item: `${SITE_URL}${RESEARCH_BASE_PATH}` },
        { '@type': 'ListItem', position: 3, name: report.shortTitle, item: url },
      ],
    },
  ];
}

export default function ResearchReportDetailPage({ report }) {
  const path = researchPath(report.slug);
  const url = `${SITE_URL}${path}`;
  const others = RESEARCH_REPORTS.filter((r) => r.slug !== report.slug);

  return (
    <div style={{ minHeight: '100vh', background: '#070b14', color: '#e2e8f0', fontFamily: 'Inter, system-ui, sans-serif' }}>
      <SEOHead
        title={report.shortTitle}
        description={report.summary}
        canonical={path}
        jsonLd={reportJsonLd(report)}
      />

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

        <AiPromptLauncher
          title={report.title}
          canonicalUrl={url}
          markdownUrl={`${url}.md`}
        />
      </main>
    </div>
  );
}
