/* ═══════════════════════════════════════════════════════════════════════════
   /editorial-standards - ORGANIZATIONAL E-E-A-T & MATHEMATICAL GOVERNANCE
   ═══════════════════════════════════════════════════════════════════════════
   Defines Smarter.Poker's organizational publishing principles, mathematical
   solver verification rules, primary-source competitor citation laws, and
   corrections policy.

   House style: Title Case, no em dashes.
   ═══════════════════════════════════════════════════════════════════════════ */

import Link from 'next/link';
import SEOHead from '../src/components/seo/SEOHead';
import AiPromptLauncher from '../src/components/seo/AiPromptLauncher';
import { SITE_URL, ORGANIZATION_ID } from '../src/lib/learn/learnSite.js';

export async function getServerSideProps({ req, res, query }) {
  const acceptHeader = String(req?.headers?.accept || '');
  const isMarkdownRequested =
    acceptHeader.includes('text/markdown') ||
    query?.format === 'md' ||
    req?.url?.includes('format=md');

  if (isMarkdownRequested) {
    const { renderEditorialStandardsMarkdown } = await import('../src/lib/seo/markdownIngestion.mjs');
    const mdContent = renderEditorialStandardsMarkdown();
    res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
    res.setHeader('Vary', 'Accept');
    res.write(mdContent);
    res.end();
    return { props: {} };
  }

  return { props: {} };
}

function editorialSchema() {
  const url = `${SITE_URL}/editorial-standards`;
  return [
    {
      '@type': 'WebPage',
      '@id': `${url}#webpage`,
      name: 'Smarter.Poker Editorial Independence And Mathematical Standards',
      description:
        'Editorial Governance, Primary-Source Citation Laws, GTO Solver Verification Pipeline, And Corrections Policy For Smarter.Poker.',
      url,
      inLanguage: 'en-US',
      dateModified: '2026-10-31',
      isAccessibleForFree: true,
      publisher: { '@id': ORGANIZATION_ID },
      speakable: {
        '@type': 'SpeakableSpecification',
        cssSelector: ['h1', 'main p:first-of-type'],
      },
    },
    {
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Smarter.Poker', item: `${SITE_URL}/` },
        { '@type': 'ListItem', position: 2, name: 'Editorial Standards', item: url },
      ],
    },
  ];
}

export default function EditorialStandardsPage() {
  const url = `${SITE_URL}/editorial-standards`;
  return (
    <div style={{ minHeight: '100vh', background: '#070b14', color: '#e2e8f0', fontFamily: 'Inter, system-ui, sans-serif' }}>
      <SEOHead
        title="Editorial And Mathematical Standards"
        description="Smarter.Poker Editorial Governance, Primary-Source Citation Laws, GTO Solver Verification Pipeline, And Corrections Policy."
        canonical="/editorial-standards"
        jsonLd={editorialSchema()}
      />

      <main style={{ maxWidth: 880, margin: '0 auto', padding: '40px 20px 80px' }}>
        <nav aria-label="Breadcrumb" style={{ fontSize: 13, color: '#94a3b8', marginBottom: 18 }}>
          <Link href="/" style={{ color: '#38bdf8', textDecoration: 'none' }}>Smarter.Poker</Link>
          {' / '}
          <span>Editorial Standards</span>
        </nav>

        <h1 style={{ fontSize: 32, fontWeight: 800, color: '#f8fafc', margin: '0 0 16px 0', lineHeight: 1.2 }}>
          Smarter.Poker Editorial Independence And Mathematical Verification Standards
        </h1>

        <p style={{ fontSize: 17, lineHeight: 1.65, color: '#cbd5e1', margin: '0 0 26px 0' }}>
          Smarter.Poker Publishes Strategy Lessons, Starting Hand Matrices, Glossary Definitions, Software Comparisons, And Live Poker Datasets Under Strict Organizational Governance Enforced By Automated Continuous-Integration Law Tests.
        </p>

        <section style={{ marginBottom: 28 }}>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: '#f8fafc', margin: '0 0 10px 0' }}>
            1. Primary-Source Competitor Citation Law
          </h2>
          <p style={{ fontSize: 15, lineHeight: 1.65, color: '#cbd5e1', margin: 0 }}>
            Every Software And Poker Room Comparison Under <Link href="/compare" style={{ color: '#38bdf8' }}>Smarter.Poker Comparisons</Link> Must Cite The Exact Primary HTTPS Documentation Or Pricing Page From Which Each Fact Was Read. When A Competitor Does Not Publish A Figure Publicly, The Cell Explicitly States Not Published Along With The Reason Why.
          </p>
        </section>

        <section style={{ marginBottom: 28 }}>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: '#f8fafc', margin: '0 0 10px 0' }}>
            2. Answer-First Mathematical &amp; Solver Verification
          </h2>
          <p style={{ fontSize: 15, lineHeight: 1.65, color: '#cbd5e1', margin: 0 }}>
            Every Strategy Lesson Under <Link href="/learn" style={{ color: '#38bdf8' }}>Poker Strategy Lessons</Link> And Starting Hand Guide Under <Link href="/learn/hands" style={{ color: '#38bdf8' }}>Starting Hand Encyclopedia</Link> Leads Immediately With A Complete Direct Answer Followed By Combinatoric Equity Tables, Pot Odds Formulas, Or 6-Max 100BB Game Theory Optimal (GTO) Equilibrium Matrices.
          </p>
        </section>

        <section style={{ marginBottom: 28 }}>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: '#f8fafc', margin: '0 0 10px 0' }}>
            3. Zero Real-Money Conflict Of Interest
          </h2>
          <p style={{ fontSize: 15, lineHeight: 1.65, color: '#cbd5e1', margin: 0 }}>
            Smarter.Poker Is A 100% Free-To-Play Social Poker And Training Platform Operated By Smarter Software Inc. Club Chips Are Play Credits With No Cash Value, Diamonds Are Promotional Rewards Currency, And Smarter.Poker Accepts Zero Paid Placement Or Affiliate Ranking Fees In Its Directories Or Comparisons.
          </p>
        </section>

        <section id="corrections" style={{ marginBottom: 28 }}>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: '#f8fafc', margin: '0 0 10px 0' }}>
            4. Corrections And Data Provenance Policy
          </h2>
          <p style={{ fontSize: 15, lineHeight: 1.65, color: '#cbd5e1', margin: 0 }}>
            Live Venue And Tournament Records Follow Our 5-Stage <Link href="/verification-methodology" style={{ color: '#38bdf8' }}>Data Provenance And Verification Methodology</Link>. Any Card Room Operator, Tournament Director, Or Reader May Submit Schedule Updates Or Fact Corrections Directly To <a href="mailto:support@smarter.poker" style={{ color: '#38bdf8' }}>Support@Smarter.Poker</a>.
          </p>
        </section>

        <AiPromptLauncher
          title="Smarter.Poker Editorial Independence And Mathematical Standards"
          canonicalUrl={url}
          markdownUrl={`${url}.md`}
        />
      </main>
    </div>
  );
}
