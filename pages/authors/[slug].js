/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  INDIVIDUAL E-E-A-T AUTHOR & RESEARCH DESK PROFILE (/authors/[slug])
 * ═══════════════════════════════════════════════════════════════════════════════
 * Detailed profile page with Schema.org ProfilePage + Organization JSON-LD,
 * technical credentials, verification methodology, published Zenodo DOIs,
 * audited calculators, and research reports.
 *
 * House style: Title Case, zero em dashes.
 */

import React from 'react';
import Link from 'next/link';
import SEOHead from '../../src/components/seo/SEOHead';
import UniversalHeader from '../../src/components/ui/UniversalHeader';
import HubPageSummary from '../../src/components/seo/HubPageSummary';
import GeoCitationCapsule, { geoClaimSchema } from '../../src/components/seo/GeoCitationCapsule';
import GeoFollowUpChain from '../../src/components/seo/GeoFollowUpChain';
import CitationBacklinkBox from '../../src/components/seo/CitationBacklinkBox';
import AiPromptLauncher from '../../src/components/seo/AiPromptLauncher';
import SmarterAccountUnlockGate from '../../src/components/seo/SmarterAccountUnlockGate';
import {
  EDITORIAL_AUTHORS,
  AUTHORS_AS_OF,
  AUTHORS_BASE_PATH,
  AUTHORS_URL,
  findAuthorBySlug,
  authorPath,
  renderAuthorDetailMarkdown,
} from '../../src/content/authors';

export default function AuthorDetailPage({ author, allAuthors = [] }) {
  if (!author) return null;

  const canonicalPath = authorPath(author.slug);
  const canonicalUrl = `https://smarter.poker${canonicalPath}`;

  const jsonLd = [
    {
      '@type': 'ProfilePage',
      '@id': `${canonicalUrl}#profile`,
      name: author.h1,
      description: author.summary,
      url: canonicalUrl,
      inLanguage: 'en-US',
      dateCreated: '2026-01-15',
      dateModified: AUTHORS_AS_OF,
      isPartOf: { '@id': 'https://smarter.poker/#website' },
      mainEntity: {
        '@type': 'Organization',
        '@id': author.orcidStyleId,
        name: author.name,
        url: canonicalUrl,
        parentOrganization: { '@id': 'https://smarter.poker/#organization' },
        knowsAbout: [
          author.specialty,
          'Game Theory Optimal Poker',
          'Independent Chip Model',
          'Counterfactual Regret Minimization',
        ],
        sameAs: [`https://doi.org/${author.primaryDoi}`, 'https://github.com/Smarter-Poker'],
      },
    },
    ...geoClaimSchema({
      claim: author.summary,
      quoteText: author.verificationMethodology?.[0] || author.summary,
      quoteAuthor: author.name,
      doi: author.primaryDoi,
      canonicalPath,
    }),
    {
      '@type': 'FAQPage',
      '@id': `${canonicalUrl}#faq`,
      mainEntity: (author.faqs || []).map((f) => ({
        '@type': 'Question',
        name: f.q,
        acceptedAnswer: { '@type': 'Answer', text: f.a },
      })),
    },
    {
      '@type': 'BreadcrumbList',
      '@id': `${canonicalUrl}#breadcrumb`,
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Smarter.Poker', item: 'https://smarter.poker/' },
        { '@type': 'ListItem', position: 2, name: 'Editorial & Solver Methodology Team', item: AUTHORS_URL },
        { '@type': 'ListItem', position: 3, name: author.name, item: canonicalUrl },
      ],
    },
  ];

  return (
    <div style={styles.page}>
      <SEOHead
        title={author.title}
        description={author.summary}
        canonical={canonicalPath}
        jsonLd={jsonLd}
      />

      <UniversalHeader pageDepth={2} />

      <main style={styles.container}>
        <nav aria-label="Breadcrumb" style={styles.breadcrumbs}>
          <Link href="/" style={styles.crumbLink}>
            Smarter.Poker
          </Link>
          <span style={styles.crumbSep}>/</span>
          <Link href={AUTHORS_BASE_PATH} style={styles.crumbLink}>
            Editorial &amp; Solver Methodology Team
          </Link>
          <span style={styles.crumbSep}>/</span>
          <span style={styles.crumbCurrent}>{author.name}</span>
        </nav>

        <header style={styles.heroPlate}>
          <div style={styles.badgeRow}>
            <span style={styles.cyanBadge}>DESK CODE: {author.code}</span>
            <span style={styles.emeraldBadge}>PRIMARY DOI: {author.primaryDoi}</span>
          </div>

          <h1 style={styles.h1}>{author.h1}</h1>

          <p style={styles.lead}>
            <strong>Charter &amp; Scope:</strong> {author.summary}
          </p>

          <div style={styles.quickCrossLinks}>
            <Link href={AUTHORS_BASE_PATH} style={styles.crossBtnCyan}>
              All 4 Research Desks
            </Link>
            <Link href="/verification-methodology" style={styles.crossBtnEmerald}>
              Verification Methodology
            </Link>
            <Link href="/research" style={styles.crossBtnOutline}>
              Open Research Datasets
            </Link>
          </div>
        </header>

        <GeoCitationCapsule
          title={`${author.name} Verification Charter`}
          claim={author.summary}
          metricLabel="Primary Zenodo DOI"
          metricValue={author.primaryDoi}
          formulaText={`Specialty: ${author.specialty}`}
          ifThenBecause={`If Auditing Content Authored By ${author.name} -> Then Inspect The Paired Interactive Calculators And Raw .md Specification -> Because Every Claim Is Backed By Deterministic Code.`}
          quoteText={author.verificationMethodology?.[0] || author.summary}
          quoteAuthor={author.name}
          doi={author.primaryDoi}
          canonicalPath={canonicalPath}
        />

        {/* Credentials & Verification Methodology */}
        <section aria-label="Credentials And Verification Methodology" style={styles.sectionPlate}>
          <h2 style={styles.h2}>Technical Credentials &amp; Audit Methodology</h2>
          <div style={styles.twoColGrid}>
            <div style={styles.colBox}>
              <div style={styles.tagCyan}>TECHNICAL CREDENTIALS &amp; STANDARDS</div>
              <ul style={styles.bulletList}>
                {(author.credentials || []).map((c) => (
                  <li key={c} style={styles.bulletItem}>
                    {c}
                  </li>
                ))}
              </ul>
            </div>
            <div style={styles.colBox}>
              <div style={styles.tagEmerald}>VERIFICATION &amp; AUDIT PROTOCOL</div>
              <ul style={styles.bulletList}>
                {(author.verificationMethodology || []).map((m) => (
                  <li key={m} style={styles.bulletItem}>
                    {m}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* Verified Calculators & Authored Hubs */}
        <section aria-label="Verified Calculators And Authored Hubs" style={styles.sectionPlate}>
          <h2 style={styles.h2}>Audited Calculators &amp; Authored Authority Hubs</h2>
          <div style={styles.twoColGrid}>
            <div style={styles.colBox}>
              <div style={styles.tagCyan}>AUDITED SOLVERS &amp; ENDPOINTS</div>
              <div style={styles.linkStack}>
                {(author.verifiedCalculators || []).map((c) => (
                  <Link key={c.href} href={c.href} style={styles.stackLink}>
                    {c.name}
                  </Link>
                ))}
              </div>
            </div>
            <div style={styles.colBox}>
              <div style={styles.tagEmerald}>AUTHORED ENCYCLOPEDIAS &amp; REPORTS</div>
              <div style={styles.linkStack}>
                {(author.researchReports || []).map((r) => (
                  <Link key={r.href} href={r.href} style={styles.stackLink}>
                    {r.name}
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Peer Authors */}
        <section aria-label="Explore All 4 Research Desks" style={styles.sectionPlate}>
          <h2 style={styles.h2}>All 4 Smarter.Poker Research &amp; Verification Desks</h2>
          <div style={styles.peerGrid}>
            {allAuthors.map((a) => (
              <Link key={a.slug} href={authorPath(a.slug)} style={styles.peerCard}>
                <span style={styles.peerCode}>{a.code}</span>
                <span style={styles.peerName}>{a.name}</span>
                <span style={styles.peerStats}>DOI: {a.primaryDoi}</span>
              </Link>
            ))}
          </div>
        </section>

        {/* FAQs */}
        <section aria-label="Frequently Asked Questions" style={styles.sectionPlate}>
          <h2 style={styles.h2}>Frequently Asked Questions: {author.name}</h2>
          <div style={styles.faqList}>
            {(author.faqs || []).map((item) => (
              <div key={item.q} style={styles.faqItem}>
                <h3 style={styles.faqQ}>{item.q}</h3>
                <p style={styles.faqA}>{item.a}</p>
              </div>
            ))}
          </div>
        </section>

        <GeoFollowUpChain topicTitle={author.name} />

        <HubPageSummary page="authors-index" />

        <CitationBacklinkBox
          title={author.h1}
          canonicalUrl={canonicalUrl}
          badgeType="research"
          badgeLabel={author.code}
          badgeValue={`DOI ${author.primaryDoi}`}
          summary={author.summary}
          publishedYear="2026"
          slug={`author-${author.slug}`}
          doi={author.primaryDoi}
        />

        <div style={{ margin: '28px 0' }}>
          <SmarterAccountUnlockGate
            variant="study-deck"
            context="authors-detail"
            redirectPath={canonicalPath}
          />
        </div>

        <AiPromptLauncher
          title={author.h1}
          canonicalUrl={canonicalUrl}
          canonicalPath={canonicalPath}
          markdownUrl={`${canonicalPath}.md`}
        />
      </main>
    </div>
  );
}

export async function getServerSideProps({ params, req, res, query }) {
  const rawSlug = String(params?.slug || '').replace(/\.md$/i, '');
  const author = findAuthorBySlug(rawSlug);
  if (!author) return { notFound: true };

  const accept = String(req?.headers?.accept || '');
  if (
    String(params?.slug || '').endsWith('.md') ||
    query?.format === 'md' ||
    query?.format === 'markdown' ||
    accept.includes('text/markdown') ||
    req?.url?.includes('format=md')
  ) {
    const md = renderAuthorDetailMarkdown(author);
    res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
    res.setHeader('Vary', 'Accept');
    res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
    res.write(md);
    res.end();
    return { props: {} };
  }

  return {
    props: {
      author,
      allAuthors: EDITORIAL_AUTHORS.map((a) => ({
        slug: a.slug,
        code: a.code,
        name: a.name,
        primaryDoi: a.primaryDoi,
      })),
    },
  };
}

const styles = {
  page: {
    minHeight: '100vh',
    background: '#050811',
    color: '#e2e8f0',
    fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif',
  },
  container: { maxWidth: 1060, margin: '0 auto', padding: '32px 20px 80px' },
  breadcrumbs: { display: 'flex', flexWrap: 'wrap', gap: 8, fontSize: 13, color: '#94a3b8', marginBottom: 18 },
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
  h1: { fontSize: 'clamp(25px, 3.5vw, 35px)', fontWeight: 800, color: '#f8fafc', lineHeight: 1.22, margin: '0 0 14px 0' },
  lead: { fontSize: 16, lineHeight: 1.66, color: '#cbd5e1', margin: '0 0 20px 0' },
  quickCrossLinks: { display: 'flex', flexWrap: 'wrap', gap: 10 },
  crossBtnCyan: { padding: '9px 15px', borderRadius: 0, background: '#38bdf8', color: '#04131d', fontWeight: 700, fontSize: 13, textDecoration: 'none' },
  crossBtnEmerald: { padding: '9px 15px', borderRadius: 0, background: '#10b981', color: '#04131d', fontWeight: 700, fontSize: 13, textDecoration: 'none' },
  crossBtnOutline: { padding: '9px 15px', borderRadius: 0, background: '#0d1f33', color: '#38bdf8', border: '1px solid #304d6b', fontWeight: 700, fontSize: 13, textDecoration: 'none' },
  sectionPlate: { background: '#071321', border: '1px solid #2b4663', borderRadius: 0, padding: '24px 22px', marginBottom: 26 },
  h2: { fontSize: 21, fontWeight: 800, color: '#f8fafc', margin: '0 0 16px 0' },
  twoColGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(310px, 1fr))', gap: 18 },
  colBox: { background: '#0d1f33', border: '1px solid #2b4663', borderRadius: 0, padding: 18 },
  tagCyan: { display: 'inline-block', fontSize: 11, fontWeight: 800, color: '#38bdf8', letterSpacing: '0.05em', marginBottom: 10 },
  tagEmerald: { display: 'inline-block', fontSize: 11, fontWeight: 800, color: '#34d399', letterSpacing: '0.05em', marginBottom: 10 },
  bulletList: { margin: 0, paddingLeft: 18, display: 'grid', gap: 10 },
  bulletItem: { fontSize: 14, lineHeight: 1.6, color: '#cbd5e1' },
  linkStack: { display: 'grid', gap: 10 },
  stackLink: { display: 'block', padding: '10px 12px', background: '#050811', border: '1px solid #2b4663', borderRadius: 0, color: '#38bdf8', fontWeight: 700, fontSize: 13.5, textDecoration: 'none' },
  peerGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 12 },
  peerCard: { display: 'flex', flexDirection: 'column', gap: 4, padding: '14px 16px', borderRadius: 0, background: '#0d1f33', border: '1px solid #2b4663', textDecoration: 'none' },
  peerCode: { fontSize: 11, fontWeight: 800, color: '#38bdf8' },
  peerName: { fontSize: 14.5, fontWeight: 700, color: '#f8fafc' },
  peerStats: { fontSize: 12, color: '#34d399' },
  faqList: { display: 'grid', gap: 14 },
  faqItem: { background: '#0d1f33', border: '1px solid #2b4663', borderRadius: 0, padding: '16px 18px' },
  faqQ: { fontSize: 16, fontWeight: 700, color: '#f8fafc', margin: '0 0 6px 0' },
  faqA: { fontSize: 14, lineHeight: 1.6, color: '#cbd5e1', margin: 0 },
};
