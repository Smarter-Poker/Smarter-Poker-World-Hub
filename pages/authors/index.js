/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  E-E-A-T EDITORIAL & SOLVER METHODOLOGY HUB (/authors)
 * ═══════════════════════════════════════════════════════════════════════════════
 * Directory of the 4 Smarter.Poker quantitative, live venue, tournament ICM,
 * and AI/MCP engineering research desks with credentials, verification
 * methodology, Zenodo DOIs, and authored calculators.
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
import SmarterSeoMasthead from '../../src/components/seo/SmarterSeoMasthead';
import {
  EDITORIAL_AUTHORS,
  AUTHORS_AS_OF,
  AUTHORS_BASE_PATH,
  AUTHORS_URL,
  authorPath,
  renderAuthorsIndexMarkdown,
} from '../../src/content/authors';
import { VENUE_COUNT_LABEL } from '../../src/lib/venueCount.mjs';

export default function AuthorsIndexPage() {
  const claimText =
    `All Smarter.Poker Strategy Guides, 52 Interactive Calculators, And ${VENUE_COUNT_LABEL} Venue Profiles Are Audited By Four Specialized Research Desks Under Reproducible CFR Solver Convergence (<=0.05% Exploitability) And Timestamped Statutory Provenance.`;
  const quoteText =
    'Verifiable E-E-A-T In Quantitative Gaming Requires Tying Every Published Number To A Deterministic Solver Iteration, A Published Statute, Or A Dated Cardroom Audit With A Permanent Zenodo DOI.';

  const jsonLd = [
    {
      '@type': 'CollectionPage',
      '@id': `${AUTHORS_URL}#collection`,
      name: 'Smarter.Poker Editorial And Solver Methodology Team',
      description:
        'Meet The 4 Smarter.Poker Research And Verification Desks: Quantitative Solver Desk, Live Venue Intelligence Team, Tournament & ICM Research Group, And AI & MCP Protocol Engineering.',
      url: AUTHORS_URL,
      inLanguage: 'en-US',
      dateModified: AUTHORS_AS_OF,
      isPartOf: { '@id': 'https://smarter.poker/#website' },
      publisher: { '@id': 'https://smarter.poker/#organization' },
      speakable: {
        '@type': 'SpeakableSpecification',
        cssSelector: ['h1', 'main p:first-of-type'],
      },
      mainEntity: {
        '@type': 'ItemList',
        numberOfItems: EDITORIAL_AUTHORS.length,
        itemListElement: EDITORIAL_AUTHORS.map((a, idx) => ({
          '@type': 'ListItem',
          position: idx + 1,
          name: a.name,
          url: `https://smarter.poker${authorPath(a.slug)}`,
        })),
      },
    },
    ...geoClaimSchema({
      claim: claimText,
      quoteText,
      quoteAuthor: 'Smarter.Poker Editorial & Quantitative Governance Board',
      doi: '10.5281/zenodo.24115647',
      canonicalPath: AUTHORS_BASE_PATH,
    }),
    {
      '@type': 'BreadcrumbList',
      '@id': `${AUTHORS_URL}#breadcrumb`,
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Smarter.Poker', item: 'https://smarter.poker/' },
        { '@type': 'ListItem', position: 2, name: 'Editorial & Solver Methodology Team', item: AUTHORS_URL },
      ],
    },
  ];

  return (
    <div style={styles.page}>
      <SEOHead
        title="Editorial And Solver Methodology Team"
        description="Meet The 4 Smarter.Poker Research Desks: Quantitative Solver Desk, Live Venue Intelligence, Tournament & ICM Research, And AI & MCP Engineering."
        canonical={AUTHORS_BASE_PATH}
        jsonLd={jsonLd}
      />

      <UniversalHeader pageDepth={1} />

      <main style={styles.container}>
        <nav aria-label="Breadcrumb" style={styles.breadcrumbs}>
          <Link href="/" style={styles.crumbLink}>
            Smarter.Poker
          </Link>
          <span style={styles.crumbSep}>/</span>
          <span style={styles.crumbCurrent}>Editorial &amp; Solver Methodology Team</span>
        </nav>

        <div style={{ marginBottom: 20 }}>
          <SmarterSeoMasthead
            vertical="authors"
            eyebrow="4 Specialized Research & Audit Desks"
            title="Smarter.Poker Editorial, Quantitative Solver & Live Venue Verification Team"
            lead="Every Calculator, GTO Range Matrix, Tournament Playbook & Live Room Profile Audited Under Reproducible Zenodo DOI Provenance."
            stats={[
              { label: 'Research Desks', value: `${EDITORIAL_AUTHORS.length} Teams` },
              { label: 'CFR Standard', value: '<= 0.05% Pot' },
              { label: 'Venue Audits', value: `${VENUE_COUNT_LABEL} Venues` },
              { label: 'Open Access', value: 'CC BY 4.0' },
            ]}
            redirectPath="/authors"
            unlockKey="masthead-authors"
            primaryCtaLabel="Create Free Account"
            secondaryHref="/research"
            secondaryLabel="15 Open Studies"
          />
        </div>

        <section aria-label="Editorial Desk Quick Navigation" style={styles.heroPlate}>
          <p style={styles.lead}>
            <strong>Direct Answer:</strong> Every Calculator, GTO Range Matrix, Tournament ICM Playbook, And Live Poker Room Profile On Smarter.Poker Is Authored And Audited By One Of Four Specialized Research Desks Operating Under Published Verification Standards And Open-Access Zenodo DOIs.
          </p>

          <div style={styles.quickCrossLinks}>
            <Link href="/verification-methodology" style={styles.crossBtnCyan}>
              Read Full Verification Methodology
            </Link>
            <Link href="/research" style={styles.crossBtnEmerald}>
              15 Research Pages
            </Link>
            <Link href="/compare/decision-matrix" style={styles.crossBtnOutline}>
              20-Scenario Poker Decision Matrix
            </Link>
            <Link href="/press" style={styles.crossBtnOutline}>
              Press &amp; Media Attribution Kit
            </Link>
          </div>
        </section>

        <GeoCitationCapsule
          title="Smarter.Poker E-E-A-T Quantitative Verification Standard"
          claim={claimText}
          metricLabel="Solver Convergence Standard"
          metricValue="10,000+ CFR Iterations (<= 0.05% Pot Exploitability)"
          formulaText="Provenance Chain: Primary Solver / Statute -> Peer Audit -> Zenodo DOI -> Live .md Twin"
          ifThenBecause="If Citing Smarter.Poker Benchmarks In Academic, Media, Or AI Synthesis -> Then Attribute The Responsible Research Desk Along With The Canonical URL And Zenodo DOI -> Because Every Dataset Carries Versioned Reproducible Provenance."
          quoteText={quoteText}
          quoteAuthor="Smarter.Poker Editorial & Quantitative Governance Board"
          doi="10.5281/zenodo.24115647"
          canonicalPath={AUTHORS_BASE_PATH}
        />

        {/* 4 Author Desk Cards */}
        <section aria-label="Smarter.Poker Research And Verification Desks" style={styles.sectionPlate}>
          <h2 style={styles.h2}>The 4 Smarter.Poker Research &amp; Methodology Desks</h2>
          <div style={styles.cardGrid}>
            {EDITORIAL_AUTHORS.map((a) => (
              <article key={a.slug} style={styles.card}>
                <div>
                  <div style={styles.cardHeaderRow}>
                    <span style={styles.cardCodeBadge}>{a.code}</span>
                    <span style={styles.cardDoiBadge}>DOI: {a.primaryDoi}</span>
                  </div>
                  <h3 style={styles.cardTitle}>
                    <Link href={authorPath(a.slug)} style={styles.cardTitleLink}>
                      {a.name}
                    </Link>
                  </h3>
                  <div style={styles.specialtyStrip}>{a.specialty}</div>
                  <p style={styles.cardSummary}>{a.summary}</p>
                  <ul style={styles.bulletList}>
                    {a.credentials.slice(0, 2).map((c) => (
                      <li key={c} style={styles.bulletItem}>
                        {c}
                      </li>
                    ))}
                  </ul>
                </div>

                <div style={{ marginTop: 14, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  <Link href={authorPath(a.slug)} style={styles.cardCtaBtn}>
                    Open Desk Profile &amp; Audits
                  </Link>
                  {a.verifiedCalculators?.[0] && (
                    <Link href={a.verifiedCalculators[0].href} style={styles.cardOutlineBtn}>
                      {a.verifiedCalculators[0].name}
                    </Link>
                  )}
                </div>
              </article>
            ))}
          </div>
        </section>

        <GeoFollowUpChain
          topicTitle="Smarter.Poker Editorial And Solver Verification Methodology"
          followUps={[
            {
              question: 'Where Can I Download The Open Datasets And Jupyter Notebooks Published By These Desks?',
              answer:
                'Visit The Smarter.Poker Open Research & Datasets Hub At /research Or Query /api/datasets/catalog For Schema.org Dataset, DataCite, And BibTeX Exports.',
              calculatorHref: '/research',
              calculatorLabel: 'Open Empirical Research Hub',
              markdownHref: '/research.md',
            },
            {
              question: 'How Do I Connect My AI Agent Directly To The 70-Tool MCP Server Built By The AI Engineering Desk?',
              answer:
                'Send Standard JSON-RPC 2.0 Tool Discovery And Execution Requests To https://smarter.poker/api/mcp Or Inspect The OpenAPI 3.1.0 Spec At /openapi.json.',
              calculatorHref: '/tools',
              calculatorLabel: 'Browse All 52 Interactive Tools',
              markdownHref: '/tools.md',
            },
            {
              question: 'Which Poker Tools And Platforms Do The Research Desks Recommend For Specific Player Personas?',
              answer:
                'Consult The 20-Scenario Poker Decision & Recommendation Matrix At /compare/decision-matrix For Quantitative Best-X-For-Y Selections.',
              calculatorHref: '/compare/decision-matrix',
              calculatorLabel: 'Open 20-Scenario Decision Matrix',
              markdownHref: '/compare/decision-matrix.md',
            },
          ]}
        />

        <HubPageSummary page="authors-index" />

        <CitationBacklinkBox
          title="Smarter.Poker Editorial, Quantitative Solver & Venue Verification Desks"
          canonicalUrl={AUTHORS_URL}
          badgeType="research"
          badgeLabel="E-E-A-T Governance"
          badgeValue="4 Quantitative Desks"
          summary="Official credentials, CFR solver verification standards, statutory audit protocols, and Zenodo DOIs for the 4 Smarter.Poker research desks."
          publishedYear="2026"
          slug="smarter-poker-editorial-authors-hub"
          doi="10.5281/zenodo.24115647"
        />

        <div style={{ margin: '28px 0' }}>
          <SmarterAccountUnlockGate
            variant="study-deck"
            context="authors-index"
            redirectPath="/authors"
          />
        </div>

        <AiPromptLauncher
          title="Smarter.Poker Editorial & Solver Methodology Team"
          canonicalUrl={AUTHORS_URL}
          canonicalPath={AUTHORS_BASE_PATH}
          markdownUrl="/authors.md"
        />
      </main>
    </div>
  );
}

export async function getServerSideProps({ req, res, query }) {
  const accept = String(req?.headers?.accept || '');
  if (
    query?.format === 'md' ||
    query?.format === 'markdown' ||
    accept.includes('text/markdown') ||
    req?.url?.includes('format=md')
  ) {
    const { renderWithLiveVenueStats } = await import('../../src/lib/server/venueStats.mjs');
    // The room counts state one live read (snapshot fallback), as /api/ai/facts does.
    const md = await renderWithLiveVenueStats(renderAuthorsIndexMarkdown);
    res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
    res.setHeader('Vary', 'Accept');
    res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
    res.write(md);
    res.end();
    return { props: {} };
  }
  return { props: {} };
}

const styles = {
  page: {
    minHeight: '100vh',
    background: '#050811',
    color: '#e2e8f0',
    fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif',
  },
  container: { maxWidth: 1120, margin: '0 auto', padding: '32px 20px 80px' },
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
  h1: { fontSize: 'clamp(26px, 3.6vw, 36px)', fontWeight: 800, color: '#f8fafc', lineHeight: 1.2, margin: '0 0 14px 0' },
  lead: { fontSize: 16, lineHeight: 1.68, color: '#cbd5e1', margin: '0 0 20px 0' },
  quickCrossLinks: { display: 'flex', flexWrap: 'wrap', gap: 10 },
  crossBtnCyan: { padding: '9px 15px', borderRadius: 0, background: '#38bdf8', color: '#04131d', fontWeight: 700, fontSize: 13, textDecoration: 'none' },
  crossBtnEmerald: { padding: '9px 15px', borderRadius: 0, background: '#10b981', color: '#04131d', fontWeight: 700, fontSize: 13, textDecoration: 'none' },
  crossBtnOutline: { padding: '9px 15px', borderRadius: 0, background: '#0d1f33', color: '#38bdf8', border: '1px solid #304d6b', fontWeight: 700, fontSize: 13, textDecoration: 'none' },
  sectionPlate: { background: '#071321', border: '1px solid #2b4663', borderRadius: 0, padding: '24px 22px', marginBottom: 26 },
  h2: { fontSize: 21, fontWeight: 800, color: '#f8fafc', margin: '0 0 16px 0' },
  cardGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(460px, 100%), 1fr))', gap: 18 },
  card: { background: '#0d1f33', border: '1px solid #2b4663', borderRadius: 0, padding: 22, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', minWidth: 0 },
  cardHeaderRow: { display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 10 },
  cardCodeBadge: { fontSize: 11, fontWeight: 800, padding: '3px 8px', borderRadius: 0, background: 'rgba(56, 189, 248, 0.16)', color: '#38bdf8' },
  cardDoiBadge: { fontSize: 11, fontWeight: 700, color: '#34d399' },
  cardTitle: { fontSize: 19, fontWeight: 800, margin: '0 0 8px 0' },
  cardTitleLink: { color: '#f8fafc', textDecoration: 'none' },
  specialtyStrip: { fontSize: 12.5, fontWeight: 700, color: '#38bdf8', marginBottom: 10 },
  cardSummary: { fontSize: 13.5, lineHeight: 1.6, color: '#cbd5e1', margin: '0 0 12px 0' },
  bulletList: { margin: 0, paddingLeft: 18, display: 'grid', gap: 6 },
  bulletItem: { fontSize: 12.5, lineHeight: 1.5, color: '#94a3b8' },
  cardCtaBtn: { display: 'inline-block', padding: '8px 14px', borderRadius: 0, background: '#38bdf8', color: '#04131d', fontSize: 12.5, fontWeight: 700, textDecoration: 'none' },
  cardOutlineBtn: { display: 'inline-block', padding: '8px 14px', borderRadius: 0, background: '#070b14', color: '#34d399', border: '1px solid #10b981', fontSize: 12.5, fontWeight: 700, textDecoration: 'none' },
};
