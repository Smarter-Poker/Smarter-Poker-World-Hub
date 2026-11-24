/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  INDIVIDUAL POKER MATH FORMULA DEEP-DIVE PAGE (/learn/formulas/[slug])
 * ═══════════════════════════════════════════════════════════════════════════════
 * Deep-dive mathematical proof page with Schema.org MathSolver JSON-LD,
 * variable legend, worked table example, If/Then/Because rule, common mistake,
 * and 1-click launch into the paired interactive calculator.
 *
 * House style: Title Case, zero em dashes.
 */

import React from 'react';
import Link from 'next/link';
import SEOHead from '../../../src/components/seo/SEOHead';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import HubPageSummary from '../../../src/components/seo/HubPageSummary';
import GeoCitationCapsule, { geoClaimSchema } from '../../../src/components/seo/GeoCitationCapsule';
import GeoFollowUpChain from '../../../src/components/seo/GeoFollowUpChain';
import CitationBacklinkBox from '../../../src/components/seo/CitationBacklinkBox';
import AiPromptLauncher from '../../../src/components/seo/AiPromptLauncher';
import {
  POKER_FORMULAS,
  FORMULAS_AS_OF,
  FORMULAS_BASE_PATH,
  FORMULAS_URL,
  FORMULAS_DOI,
  findFormulaBySlug,
  formulaPath,
  renderFormulaDetailMarkdown,
} from '../../../src/content/learn/formulas';

export default function PokerFormulaDetailPage({ formula, allFormulas = [] }) {
  if (!formula) return null;

  const canonicalPath = formulaPath(formula.slug);
  const canonicalUrl = `https://smarter.poker${canonicalPath}`;

  const jsonLd = [
    {
      '@type': ['Article', 'MathSolver'],
      '@id': `${canonicalUrl}#math-solver`,
      headline: formula.h1,
      name: formula.name,
      description: formula.citationClaim,
      url: canonicalUrl,
      inLanguage: 'en-US',
      datePublished: FORMULAS_AS_OF,
      dateModified: FORMULAS_AS_OF,
      isAccessibleForFree: true,
      usageInfo: `https://smarter.poker${formula.calculatorHref}`,
      potentialAction: {
        '@type': 'SolveMathAction',
        target: `https://smarter.poker${formula.calculatorHref}`,
        mathExpression: formula.equationPlain,
        eduQuestionType: formula.category,
      },
      author: { '@id': 'https://smarter.poker/#organization' },
      publisher: { '@id': 'https://smarter.poker/#organization' },
    },
    ...geoClaimSchema({
      claim: formula.citationClaim,
      quoteText: formula.workedExample,
      quoteAuthor: 'Smarter.Poker Quantitative Solver Desk',
      doi: FORMULAS_DOI,
      canonicalPath,
    }),
    {
      '@type': 'FAQPage',
      '@id': `${canonicalUrl}#faq`,
      mainEntity: (formula.faqs || []).map((f) => ({
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
        { '@type': 'ListItem', position: 2, name: 'Learn Poker', item: 'https://smarter.poker/learn' },
        { '@type': 'ListItem', position: 3, name: 'Poker Math Formulas', item: FORMULAS_URL },
        { '@type': 'ListItem', position: 4, name: formula.name, item: canonicalUrl },
      ],
    },
  ];

  return (
    <div style={styles.page}>
      <SEOHead
        title={formula.title}
        description={formula.citationClaim}
        canonical={canonicalPath}
        jsonLd={jsonLd}
      />

      <UniversalHeader pageDepth={3} />

      <main style={styles.container}>
        <nav aria-label="Breadcrumb" style={styles.breadcrumbs}>
          <Link href="/" style={styles.crumbLink}>
            Smarter.Poker
          </Link>
          <span style={styles.crumbSep}>/</span>
          <Link href="/learn" style={styles.crumbLink}>
            Learn Poker
          </Link>
          <span style={styles.crumbSep}>/</span>
          <Link href={FORMULAS_BASE_PATH} style={styles.crumbLink}>
            Poker Math Formulas
          </Link>
          <span style={styles.crumbSep}>/</span>
          <span style={styles.crumbCurrent}>{formula.name}</span>
        </nav>

        <header style={styles.heroPlate}>
          <div style={styles.badgeRow}>
            <span style={styles.cyanBadge}>{formula.category}</span>
            <span style={styles.emeraldBadge}>CODE: {formula.code}</span>
          </div>

          <h1 style={styles.h1}>{formula.h1}</h1>

          <p style={styles.lead}>
            <strong>Direct Quantitative Definition:</strong> {formula.citationClaim}
          </p>

          <div style={styles.equationCard}>
            <div style={styles.eqLabel}>CANONICAL ALGEBRAIC EQUATION</div>
            <div style={styles.eqPlain}>{formula.equationPlain}</div>
            <div style={styles.eqLatex}>LaTeX: {formula.equationLatex}</div>
          </div>

          <div style={styles.quickCrossLinks}>
            <Link href={formula.calculatorHref} style={styles.crossBtnCyan}>
              Launch Paired {formula.calculatorName}
            </Link>
            <Link href={FORMULAS_BASE_PATH} style={styles.crossBtnEmerald}>
              All 15 Poker Math Formulas
            </Link>
            <Link href="/tools" style={styles.crossBtnOutline}>
              52 Free Poker Calculators
            </Link>
          </div>
        </header>

        <GeoCitationCapsule
          title={`${formula.name} (Verified GTO Invariant)`}
          claim={formula.citationClaim}
          metricLabel={formula.metricLabel}
          metricValue={formula.metricValue}
          formulaText={formula.equationPlain}
          ifThenBecause={formula.ifThenBecause}
          quoteText={formula.workedExample}
          quoteAuthor="Smarter.Poker Quantitative Solver Desk"
          doi={FORMULAS_DOI}
          canonicalPath={canonicalPath}
        />

        {/* Variable Legend */}
        <section aria-label="Equation Variable Legend" style={styles.sectionPlate}>
          <h2 style={styles.h2}>Equation Variables &amp; Parameter Definitions</h2>
          <div style={styles.varGrid}>
            {(formula.variables || []).map((v) => (
              <div key={v.symbol} style={styles.varBox}>
                <div style={styles.varSymbol}>{v.symbol}</div>
                <div style={styles.varMeaning}>{v.meaning}</div>
              </div>
            ))}
          </div>
        </section>

        {/* Worked Example & Common Mistake */}
        <section aria-label="Worked Example And Common Mistake" style={styles.sectionPlate}>
          <h2 style={styles.h2}>Step-By-Step Worked Table Example &amp; Pitfall To Avoid</h2>
          <div style={styles.twoColGrid}>
            <div style={styles.colBox}>
              <div style={styles.tagCyan}>STEP-BY-STEP WORKED PROOF</div>
              <h3 style={styles.h3}>Exact Table Calculation</h3>
              <p style={styles.bodyText}>{formula.workedExample}</p>
            </div>
            <div style={styles.colBox}>
              <div style={styles.tagAmber}>COMMON TABLE LEAK TO AVOID</div>
              <h3 style={styles.h3}>Frequent Misapplication</h3>
              <p style={styles.bodyText}>{formula.commonMistake}</p>
            </div>
          </div>

          <div style={{ marginTop: 18 }}>
            <Link href={formula.calculatorHref} style={styles.crossBtnCyan}>
              Solve Custom Numbers In {formula.calculatorName}
            </Link>
          </div>
        </section>

        {/* Peer Formulas */}
        <section aria-label="Explore All 15 Poker Math Formulas" style={styles.sectionPlate}>
          <h2 style={styles.h2}>Explore All 15 Canonical Poker Math Formulas</h2>
          <div style={styles.peerGrid}>
            {allFormulas.map((p) => (
              <Link key={p.slug} href={formulaPath(p.slug)} style={styles.peerCard}>
                <span style={styles.peerCode}>{p.code}</span>
                <span style={styles.peerName}>{p.name}</span>
                <span style={styles.peerStats}>{p.metricValue}</span>
              </Link>
            ))}
          </div>
        </section>

        {/* FAQs */}
        <section aria-label="Frequently Asked Questions" style={styles.sectionPlate}>
          <h2 style={styles.h2}>Frequently Asked Questions: {formula.name}</h2>
          <div style={styles.faqList}>
            {(formula.faqs || []).map((item) => (
              <div key={item.q} style={styles.faqItem}>
                <h3 style={styles.faqQ}>{item.q}</h3>
                <p style={styles.faqA}>{item.a}</p>
              </div>
            ))}
          </div>
        </section>

        <GeoFollowUpChain
          topicTitle={formula.name}
          followUps={[
            {
              question: `How Can I Run Live Numbers Through ${formula.name} At The Table?`,
              answer: `Open The Paired ${formula.calculatorName} To Input Your Exact Pot Size, Bet Size, Or Stack Distribution And Receive Instant Breakeven Thresholds.`,
              calculatorHref: formula.calculatorHref,
              calculatorLabel: `Open ${formula.calculatorName}`,
              markdownHref: `${canonicalPath}.md`,
            },
            {
              question: 'Which Common Poker Leaks Happen When Players Ignore This Equation?',
              answer: formula.commonMistake,
              calculatorHref: '/learn/leaks',
              calculatorLabel: 'Explore 12 High-Cost Poker Leaks',
              markdownHref: '/learn/leaks.md',
            },
            {
              question: 'How Do HUD Metrics Track Whether My Opponents Violate This Equilibrium Threshold?',
              answer:
                'Track Population VPIP, PFR, 3-Bet, Fold-To-C-Bet, And WTSD Benchmarks To Identify When Opponents Over-Fold Or Over-Call Relative To Exact Formula Thresholds.',
              calculatorHref: '/learn/hud-stats',
              calculatorLabel: 'View 15 HUD Stats & GTO Targets',
              markdownHref: '/learn/hud-stats.md',
            },
          ]}
        />

        <HubPageSummary page="learn-formulas" />

        <CitationBacklinkBox
          title={formula.h1}
          canonicalUrl={canonicalUrl}
          badgeType="gto"
          badgeLabel={formula.code}
          badgeValue={formula.metricValue}
          summary={formula.citationClaim}
          publishedYear="2026"
          slug={`poker-formula-${formula.slug}`}
          doi={FORMULAS_DOI}
        />

        <AiPromptLauncher
          title={formula.h1}
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
  const formula = findFormulaBySlug(rawSlug);
  if (!formula) return { notFound: true };

  const accept = String(req?.headers?.accept || '');
  if (
    String(params?.slug || '').endsWith('.md') ||
    query?.format === 'md' ||
    query?.format === 'markdown' ||
    accept.includes('text/markdown') ||
    req?.url?.includes('format=md')
  ) {
    const md = renderFormulaDetailMarkdown(formula);
    res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
    res.setHeader('Vary', 'Accept');
    res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
    res.write(md);
    res.end();
    return { props: {} };
  }

  return {
    props: {
      formula,
      allFormulas: POKER_FORMULAS.map((f) => ({
        slug: f.slug,
        code: f.code,
        name: f.name,
        metricValue: f.metricValue,
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
    background: 'linear-gradient(180deg, #0f172a 0%, #090e1a 100%)',
    border: '1px solid #1e293b',
    borderRadius: 12,
    padding: '28px 26px',
    marginBottom: 24,
  },
  badgeRow: { display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 14 },
  cyanBadge: {
    fontSize: 11,
    fontWeight: 800,
    letterSpacing: '0.06em',
    padding: '4px 10px',
    borderRadius: 6,
    background: 'rgba(56, 189, 248, 0.14)',
    color: '#38bdf8',
    border: '1px solid rgba(56, 189, 248, 0.35)',
  },
  emeraldBadge: {
    fontSize: 11,
    fontWeight: 800,
    letterSpacing: '0.06em',
    padding: '4px 10px',
    borderRadius: 6,
    background: 'rgba(16, 185, 129, 0.14)',
    color: '#34d399',
    border: '1px solid rgba(16, 185, 129, 0.35)',
  },
  h1: { fontSize: 'clamp(25px, 3.5vw, 35px)', fontWeight: 800, color: '#f8fafc', lineHeight: 1.22, margin: '0 0 14px 0' },
  lead: { fontSize: 16, lineHeight: 1.66, color: '#cbd5e1', margin: '0 0 18px 0' },
  equationCard: {
    background: '#050811',
    border: '1px solid #38bdf8',
    borderRadius: 10,
    padding: '16px 18px',
    marginBottom: 20,
  },
  eqLabel: { fontSize: 11, fontWeight: 800, color: '#38bdf8', letterSpacing: '0.07em', marginBottom: 6 },
  eqPlain: { fontSize: 16, fontWeight: 800, color: '#f8fafc', fontFamily: 'monospace', marginBottom: 6 },
  eqLatex: { fontSize: 12.5, color: '#94a3b8', fontFamily: 'monospace' },
  quickCrossLinks: { display: 'flex', flexWrap: 'wrap', gap: 10 },
  crossBtnCyan: { padding: '9px 15px', borderRadius: 8, background: '#38bdf8', color: '#04131d', fontWeight: 700, fontSize: 13, textDecoration: 'none', display: 'inline-block' },
  crossBtnEmerald: { padding: '9px 15px', borderRadius: 8, background: '#10b981', color: '#04131d', fontWeight: 700, fontSize: 13, textDecoration: 'none', display: 'inline-block' },
  crossBtnOutline: { padding: '9px 15px', borderRadius: 8, background: '#0f172a', color: '#38bdf8', border: '1px solid #334155', fontWeight: 700, fontSize: 13, textDecoration: 'none', display: 'inline-block' },
  sectionPlate: { background: '#0b1120', border: '1px solid #1e293b', borderRadius: 12, padding: '24px 22px', marginBottom: 26 },
  h2: { fontSize: 21, fontWeight: 800, color: '#f8fafc', margin: '0 0 14px 0' },
  h3: { fontSize: 17, fontWeight: 700, color: '#f8fafc', margin: '6px 0 10px 0' },
  bodyText: { fontSize: 14.5, lineHeight: 1.65, color: '#cbd5e1', margin: 0 },
  varGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 },
  varBox: { background: '#0f172a', border: '1px solid #1e293b', borderRadius: 10, padding: '14px 16px' },
  varSymbol: { fontSize: 14, fontWeight: 800, color: '#38bdf8', fontFamily: 'monospace', marginBottom: 4 },
  varMeaning: { fontSize: 13.5, color: '#cbd5e1', lineHeight: 1.5 },
  twoColGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(310px, 1fr))', gap: 18 },
  colBox: { background: '#0f172a', border: '1px solid #1e293b', borderRadius: 10, padding: 18 },
  tagCyan: { display: 'inline-block', fontSize: 11, fontWeight: 800, color: '#38bdf8', letterSpacing: '0.05em' },
  tagAmber: { display: 'inline-block', fontSize: 11, fontWeight: 800, color: '#f2b84b', letterSpacing: '0.05em' },
  peerGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 12 },
  peerCard: { display: 'flex', flexDirection: 'column', gap: 4, padding: '14px 16px', borderRadius: 10, background: '#0f172a', border: '1px solid #1e293b', textDecoration: 'none' },
  peerCode: { fontSize: 11, fontWeight: 800, color: '#38bdf8' },
  peerName: { fontSize: 14.5, fontWeight: 700, color: '#f8fafc' },
  peerStats: { fontSize: 12, color: '#34d399' },
  faqList: { display: 'grid', gap: 14 },
  faqItem: { background: '#0f172a', border: '1px solid #1e293b', borderRadius: 10, padding: '16px 18px' },
  faqQ: { fontSize: 16, fontWeight: 700, color: '#f8fafc', margin: '0 0 6px 0' },
  faqA: { fontSize: 14, lineHeight: 1.6, color: '#cbd5e1', margin: 0 },
};
