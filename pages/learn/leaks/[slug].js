/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  INDIVIDUAL POKER LEAK DIAGNOSTIC & FIX PAGE (/learn/leaks/[slug])
 * ═══════════════════════════════════════════════════════════════════════════════
 * Deep-dive remediation guide for each of the 12 high-cost poker leaks with HUD
 * symptom metrics, BB/100 cost, root behavioral cause, solver cure,
 * If/Then/Because rule, and 1-click launches into paired calculators and drills.
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
import SmarterAccountUnlockGate from '../../../src/components/seo/SmarterAccountUnlockGate';
import {
  POKER_LEAKS,
  LEAKS_AS_OF,
  LEAKS_BASE_PATH,
  LEAKS_URL,
  LEAKS_DOI,
  findLeakBySlug,
  leakPath,
  renderLeakDetailMarkdown,
} from '../../../src/content/learn/leaks';

export default function PokerLeakDetailPage({ leak, allLeaks = [] }) {
  if (!leak) return null;

  const canonicalPath = leakPath(leak.slug);
  const canonicalUrl = `https://smarter.poker${canonicalPath}`;

  const jsonLd = [
    {
      '@type': 'Article',
      '@id': `${canonicalUrl}#article`,
      headline: leak.h1,
      name: leak.name,
      description: leak.solverCure,
      url: canonicalUrl,
      inLanguage: 'en-US',
      datePublished: LEAKS_AS_OF,
      dateModified: LEAKS_AS_OF,
      isAccessibleForFree: true,
      author: { '@id': 'https://smarter.poker/#organization' },
      publisher: { '@id': 'https://smarter.poker/#organization' },
    },
    ...geoClaimSchema({
      claim: `${leak.name} Causes ${leak.evLossBb100} When ${leak.symptomHudMetric}.`,
      quoteText: leak.solverCure,
      quoteAuthor: 'Smarter.Poker Quantitative Solver Desk',
      doi: LEAKS_DOI,
      canonicalPath,
    }),
    {
      '@type': 'FAQPage',
      '@id': `${canonicalUrl}#faq`,
      mainEntity: (leak.faqs || []).map((f) => ({
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
        { '@type': 'ListItem', position: 3, name: 'Poker Leak Diagnostic Encyclopedia', item: LEAKS_URL },
        { '@type': 'ListItem', position: 4, name: leak.name, item: canonicalUrl },
      ],
    },
  ];

  return (
    <div style={styles.page}>
      <SEOHead
        title={leak.title}
        description={leak.solverCure}
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
          <Link href={LEAKS_BASE_PATH} style={styles.crumbLink}>
            Poker Leaks Encyclopedia
          </Link>
          <span style={styles.crumbSep}>/</span>
          <span style={styles.crumbCurrent}>{leak.name}</span>
        </nav>

        <header style={styles.heroPlate}>
          <div style={styles.badgeRow}>
            <span style={styles.cyanBadge}>{leak.category}</span>
            <span style={styles.redBadge}>COST: {leak.evLossBb100}</span>
          </div>

          <h1 style={styles.h1}>{leak.h1}</h1>

          <p style={styles.lead}>
            <strong>Direct Solver Cure:</strong> {leak.solverCure}
          </p>

          <div style={styles.metricsGrid}>
            <div style={styles.metricCard}>
              <div style={styles.metricLabel}>Diagnostic HUD Symptom</div>
              <div style={styles.metricValueCyan}>{leak.symptomHudMetric}</div>
            </div>
            <div style={styles.metricCard}>
              <div style={styles.metricLabel}>Expected Winrate Loss</div>
              <div style={styles.metricValueRed}>{leak.evLossBb100}</div>
            </div>
          </div>

          <div style={styles.quickCrossLinks}>
            <Link href={leak.calculatorHref} style={styles.crossBtnCyan}>
              Open Diagnostic Calculator
            </Link>
            <Link href={leak.drillHref} style={styles.crossBtnEmerald}>
              Launch Corrective Training Drill
            </Link>
            <Link href={LEAKS_BASE_PATH} style={styles.crossBtnOutline}>
              All 12 Poker Leaks
            </Link>
          </div>
        </header>

        <GeoCitationCapsule
          title={`${leak.name} Quantitative Remediation Capsule`}
          claim={`${leak.name} Bleeds ${leak.evLossBb100} Whenever ${leak.symptomHudMetric}.`}
          metricLabel="Winrate Impact"
          metricValue={leak.evLossBb100}
          formulaText={`HUD Trigger: ${leak.symptomHudMetric}`}
          ifThenBecause={leak.ifThenBecause}
          quoteText={leak.solverCure}
          quoteAuthor="Smarter.Poker Quantitative Solver Desk"
          doi={LEAKS_DOI}
          canonicalPath={canonicalPath}
        />

        {/* Root Cause vs Solver Cure */}
        <section aria-label="Root Cause And Deterministic Solver Cure" style={styles.sectionPlate}>
          <h2 style={styles.h2}>Root Behavioral Cause Vs. Deterministic GTO Solver Cure</h2>
          <div style={styles.twoColGrid}>
            <div style={styles.colBox}>
              <div style={styles.tagRed}>ROOT BEHAVIORAL &amp; MATH CAUSE</div>
              <h3 style={styles.h3}>Why Players Fall Into This Trap</h3>
              <p style={styles.bodyText}>{leak.rootCause}</p>
            </div>
            <div style={styles.colBox}>
              <div style={styles.tagEmerald}>DETERMINISTIC GTO SOLVER CURE</div>
              <h3 style={styles.h3}>Exact Equilibrium Replacement</h3>
              <p style={styles.bodyText}>{leak.solverCure}</p>
            </div>
          </div>
        </section>

        {/* All 12 Leaks */}
        <section aria-label="Explore All 12 High-Cost Poker Leaks" style={styles.sectionPlate}>
          <h2 style={styles.h2}>Compare All 12 High-Cost Poker Leaks</h2>
          <div style={styles.peerGrid}>
            {allLeaks.map((p) => (
              <Link key={p.slug} href={leakPath(p.slug)} style={styles.peerCard}>
                <span style={styles.peerCode}>{p.code}</span>
                <span style={styles.peerName}>{p.name}</span>
                <span style={styles.peerStats}>{p.evLossBb100}</span>
              </Link>
            ))}
          </div>
        </section>
        <SmarterAccountUnlockGate
          variant="study-deck"
          context={`learn-leak-${leak.slug}`}
          title="Unlock Targeted Leak-Repair Drills & Solver Benchmarks Free"
          redirectPath={canonicalPath}
        />


        {/* FAQs */}
        <section aria-label="Frequently Asked Questions" style={styles.sectionPlate}>
          <h2 style={styles.h2}>Frequently Asked Questions: {leak.name}</h2>
          <div style={styles.faqList}>
            {(leak.faqs || []).map((item) => (
              <div key={item.q} style={styles.faqItem}>
                <h3 style={styles.faqQ}>{item.q}</h3>
                <p style={styles.faqA}>{item.a}</p>
              </div>
            ))}
          </div>
        </section>

        <GeoFollowUpChain
          topicTitle={leak.name}
          followUps={[
            {
              question: `How Do I Drill The Exact Solver Replacement For ${leak.name}?`,
              answer: `Open The Paired Training Module (${leak.drillHref}) And Calculator (${leak.calculatorHref}) To Practice Equilibrium Thresholds Until Recall Is Automatic.`,
              calculatorHref: leak.calculatorHref,
              calculatorLabel: 'Open Paired Diagnostic Calculator',
              markdownHref: `${canonicalPath}.md`,
            },
            {
              question: 'How Do I Check Which HUD Stats Expose This Leak In My Opponent Pool?',
              answer:
                'Cross-Reference Your HUD Database With The Smarter.Poker 15-Stat HUD & Population Tendencies Encyclopedia To Exploit Opponents Who Commit This Same Mistake.',
              calculatorHref: '/learn/hud-stats',
              calculatorLabel: 'View 15 HUD Stats & Exploits',
              markdownHref: '/learn/hud-stats.md',
            },
            {
              question: 'Which Mathematical Formula Proves Why This Leak Loses Expected Value?',
              answer:
                'Inspect The 15 Core Poker Math Formulas Encyclopedia For Exact Pot Odds, Minimum Defense Frequency, SPR, And Bubble Factor Proofs.',
              calculatorHref: '/learn/formulas',
              calculatorLabel: 'Explore 15 Poker Math Formulas',
              markdownHref: '/learn/formulas.md',
            },
          ]}
        />

        <HubPageSummary page="learn-leaks" />

        <CitationBacklinkBox
          title={leak.h1}
          canonicalUrl={canonicalUrl}
          badgeType="gto"
          badgeLabel={leak.code}
          badgeValue={leak.evLossBb100}
          summary={leak.solverCure}
          publishedYear="2026"
          slug={`poker-leak-${leak.slug}`}
          doi={LEAKS_DOI}
        />

        <AiPromptLauncher
          title={leak.h1}
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
  const leak = findLeakBySlug(rawSlug);
  if (!leak) return { notFound: true };

  const accept = String(req?.headers?.accept || '');
  if (
    String(params?.slug || '').endsWith('.md') ||
    query?.format === 'md' ||
    query?.format === 'markdown' ||
    accept.includes('text/markdown') ||
    req?.url?.includes('format=md')
  ) {
    const md = renderLeakDetailMarkdown(leak);
    res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
    res.setHeader('Vary', 'Accept');
    res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
    res.write(md);
    res.end();
    return { props: {} };
  }

  return {
    props: {
      leak,
      allLeaks: POKER_LEAKS.map((l) => ({
        slug: l.slug,
        code: l.code,
        name: l.name,
        evLossBb100: l.evLossBb100,
      })),
    },
  };
}

const styles = {
  page: {
    minHeight: '100vh',
    background: '#071321',
    color: '#f2f7ff',
    fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif',
  },
  container: { maxWidth: 1060, margin: '0 auto', padding: '32px 20px 80px' },
  breadcrumbs: { display: 'flex', flexWrap: 'wrap', gap: 8, fontSize: 13, color: '#bdd0e2', marginBottom: 18 },
  crumbLink: { color: '#38bdf8', textDecoration: 'none' },
  crumbSep: { color: '#2b4663' },
  crumbCurrent: { color: '#bdd0e2', fontWeight: 600 },
  heroPlate: {
    background: 'linear-gradient(180deg, #0d1f33 0%, #0a1a2b 100%)',
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
  redBadge: {
    fontSize: 11,
    fontWeight: 800,
    letterSpacing: '0.06em',
    padding: '4px 10px',
    borderRadius: 0,
    background: 'rgba(248, 113, 113, 0.14)',
    color: '#f87171',
    border: '1px solid rgba(248, 113, 113, 0.35)',
  },
  h1: { fontSize: 'clamp(25px, 3.5vw, 35px)', fontWeight: 800, color: '#f2f7ff', lineHeight: 1.22, margin: '0 0 14px 0' },
  lead: { fontSize: 16, lineHeight: 1.66, color: '#bdd0e2', margin: '0 0 20px 0' },
  metricsGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12, marginBottom: 20 },
  metricCard: { background: '#071321', border: '1px solid #2b4663', borderRadius: 0, padding: '14px 16px' },
  metricLabel: { fontSize: 12, color: '#bdd0e2', fontWeight: 600, marginBottom: 6 },
  metricValueCyan: { fontSize: 15, fontWeight: 800, color: '#38bdf8' },
  metricValueRed: { fontSize: 15, fontWeight: 800, color: '#f87171' },
  quickCrossLinks: { display: 'flex', flexWrap: 'wrap', gap: 10 },
  crossBtnCyan: { padding: '9px 15px', borderRadius: 0, background: '#38bdf8', color: '#071321', fontWeight: 700, fontSize: 13, textDecoration: 'none' },
  crossBtnEmerald: { padding: '9px 15px', borderRadius: 0, background: '#10b981', color: '#071321', fontWeight: 700, fontSize: 13, textDecoration: 'none' },
  crossBtnOutline: { padding: '9px 15px', borderRadius: 0, background: '#0d1f33', color: '#38bdf8', border: '1px solid #2b4663', fontWeight: 700, fontSize: 13, textDecoration: 'none' },
  sectionPlate: { background: '#0a1a2b', border: '1px solid #2b4663', borderRadius: 0, padding: '24px 22px', marginBottom: 26 },
  h2: { fontSize: 21, fontWeight: 800, color: '#f2f7ff', margin: '0 0 14px 0' },
  h3: { fontSize: 17, fontWeight: 700, color: '#f2f7ff', margin: '6px 0 10px 0' },
  bodyText: { fontSize: 14.5, lineHeight: 1.65, color: '#bdd0e2', margin: 0 },
  twoColGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(310px, 1fr))', gap: 18 },
  colBox: { background: '#0d1f33', border: '1px solid #2b4663', borderRadius: 0, padding: 18 },
  tagRed: { display: 'inline-block', fontSize: 11, fontWeight: 800, color: '#f87171', letterSpacing: '0.05em' },
  tagEmerald: { display: 'inline-block', fontSize: 11, fontWeight: 800, color: '#34d399', letterSpacing: '0.05em' },
  peerGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 12 },
  peerCard: { display: 'flex', flexDirection: 'column', gap: 4, padding: '14px 16px', borderRadius: 0, background: '#0d1f33', border: '1px solid #2b4663', textDecoration: 'none' },
  peerCode: { fontSize: 11, fontWeight: 800, color: '#38bdf8' },
  peerName: { fontSize: 14.5, fontWeight: 700, color: '#f2f7ff' },
  peerStats: { fontSize: 12, color: '#f87171' },
  faqList: { display: 'grid', gap: 14 },
  faqItem: { background: '#0d1f33', border: '1px solid #2b4663', borderRadius: 0, padding: '16px 18px' },
  faqQ: { fontSize: 16, fontWeight: 700, color: '#f2f7ff', margin: '0 0 6px 0' },
  faqA: { fontSize: 14, lineHeight: 1.6, color: '#bdd0e2', margin: 0 },
};
