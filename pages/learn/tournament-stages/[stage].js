/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  INDIVIDUAL MTT TOURNAMENT STAGE PLAYBOOK PAGE (/learn/tournament-stages/[stage])
 * ═══════════════════════════════════════════════════════════════════════════════
 * Deep-dive tournament stage page with effective BB benchmarks, Bubble Factor
 * thresholds, VPIP/PFR targets, 4 strategic pillars, If/Then/Because causal
 * rule, and paired calculator launches.
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
  TOURNAMENT_STAGES,
  TOURNAMENT_STAGES_AS_OF,
  TOURNAMENT_STAGES_BASE_PATH,
  TOURNAMENT_STAGES_URL,
  TOURNAMENT_STAGES_DOI,
  findTournamentStage,
  tournamentStagePath,
  renderTournamentStageDetailMarkdown,
} from '../../../src/content/learn/tournamentStages';

export default function TournamentStageDetailPage({ stageData, allStages = [] }) {
  if (!stageData) return null;

  const canonicalPath = tournamentStagePath(stageData.slug);
  const canonicalUrl = `https://smarter.poker${canonicalPath}`;

  const jsonLd = [
    {
      '@type': 'Article',
      '@id': `${canonicalUrl}#article`,
      headline: stageData.h1,
      name: stageData.name,
      description: stageData.summary,
      url: canonicalUrl,
      inLanguage: 'en-US',
      datePublished: TOURNAMENT_STAGES_AS_OF,
      dateModified: TOURNAMENT_STAGES_AS_OF,
      isAccessibleForFree: true,
      author: { '@id': 'https://smarter.poker/#organization' },
      publisher: { '@id': 'https://smarter.poker/#organization' },
    },
    ...geoClaimSchema({
      claim: stageData.summary,
      quoteText: stageData.strategyPillars?.[0] || stageData.summary,
      quoteAuthor: 'Smarter.Poker Tournament & ICM Research Group',
      doi: TOURNAMENT_STAGES_DOI,
      canonicalPath,
    }),
    {
      '@type': 'FAQPage',
      '@id': `${canonicalUrl}#faq`,
      mainEntity: (stageData.faqs || []).map((f) => ({
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
        { '@type': 'ListItem', position: 3, name: 'MTT Tournament Stages', item: TOURNAMENT_STAGES_URL },
        { '@type': 'ListItem', position: 4, name: stageData.name, item: canonicalUrl },
      ],
    },
  ];

  return (
    <div style={styles.page}>
      <SEOHead
        title={stageData.title}
        description={stageData.summary}
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
          <Link href={TOURNAMENT_STAGES_BASE_PATH} style={styles.crumbLink}>
            MTT Tournament Stages
          </Link>
          <span style={styles.crumbSep}>/</span>
          <span style={styles.crumbCurrent}>{stageData.name}</span>
        </nav>

        <header style={styles.heroPlate}>
          <div style={styles.badgeRow}>
            <span style={styles.cyanBadge}>{stageData.code}</span>
            <span style={styles.emeraldBadge}>BUBBLE FACTOR: {stageData.averageBubbleFactor}</span>
          </div>

          <h1 style={styles.h1}>{stageData.h1}</h1>

          <p style={styles.lead}>
            <strong>Direct Stage Playbook:</strong> {stageData.summary}
          </p>

          <div style={styles.metricsGrid}>
            <div style={styles.metricCard}>
              <div style={styles.metricLabel}>Effective Stack Depth</div>
              <div style={styles.metricValueCyan}>{stageData.effectiveBbRange}</div>
            </div>
            <div style={styles.metricCard}>
              <div style={styles.metricLabel}>Average ICM Bubble Factor</div>
              <div style={styles.metricValueEmerald}>{stageData.averageBubbleFactor}</div>
            </div>
            <div style={styles.metricCard}>
              <div style={styles.metricLabel}>Optimal VPIP / PFR Target</div>
              <div style={styles.metricValueCyan}>{stageData.optimalVpipPfr}</div>
            </div>
          </div>

          <div style={styles.quickCrossLinks}>
            {(stageData.recommendedCalculators || []).map((calc, idx) => (
              <Link
                key={calc.href}
                href={calc.href}
                style={idx === 0 ? styles.crossBtnCyan : idx === 1 ? styles.crossBtnEmerald : styles.crossBtnOutline}
              >
                Launch {calc.name}
              </Link>
            ))}
            <Link href={TOURNAMENT_STAGES_BASE_PATH} style={styles.crossBtnOutline}>
              All 8 Tournament Stages
            </Link>
          </div>
        </header>

        <GeoCitationCapsule
          title={`${stageData.name} Quantitative ICM Benchmark`}
          claim={stageData.summary}
          metricLabel="Stage Bubble Factor"
          metricValue={stageData.averageBubbleFactor}
          formulaText={`Stack Zone: ${stageData.effectiveBbRange} | Target Profile: ${stageData.optimalVpipPfr}`}
          ifThenBecause={stageData.ifThenBecause}
          quoteText={stageData.strategyPillars?.[0] || stageData.summary}
          quoteAuthor="Smarter.Poker Tournament & ICM Research Group"
          doi={TOURNAMENT_STAGES_DOI}
          canonicalPath={canonicalPath}
        />

        {/* Core Strategy Pillars */}
        <section aria-label="Core Strategic Pillars For This Tournament Stage" style={styles.sectionPlate}>
          <h2 style={styles.h2}>
            Core Solver &amp; ICM Strategic Pillars: {stageData.name}
          </h2>
          <ul style={styles.bulletList}>
            {(stageData.strategyPillars || []).map((pillar) => (
              <li key={pillar} style={styles.bulletItem}>
                {pillar}
              </li>
            ))}
          </ul>
        </section>

        {/* All 8 Stages Navigation */}
        <section aria-label="Explore All 8 MTT Tournament Stages" style={styles.sectionPlate}>
          <h2 style={styles.h2}>Complete 8-Stage MTT Progression Timeline</h2>
          <div style={styles.peerGrid}>
            {allStages.map((s) => (
              <Link key={s.slug} href={tournamentStagePath(s.slug)} style={styles.peerCard}>
                <span style={styles.peerCode}>{s.code}</span>
                <span style={styles.peerName}>{s.name}</span>
                <span style={styles.peerStats}>BF: {s.averageBubbleFactor}</span>
              </Link>
            ))}
          </div>
        </section>
        <SmarterAccountUnlockGate
          variant="solver-matrix"
          context={`learn-tournament-stage-${stageData.slug}`}
          title="Unlock Tournament Stage Push-Fold & ICM Solver Matrices Free"
          redirectPath={canonicalPath}
        />


        {/* FAQs */}
        <section aria-label="Frequently Asked Questions" style={styles.sectionPlate}>
          <h2 style={styles.h2}>Frequently Asked Questions: {stageData.name}</h2>
          <div style={styles.faqList}>
            {(stageData.faqs || []).map((item) => (
              <div key={item.q} style={styles.faqItem}>
                <h3 style={styles.faqQ}>{item.q}</h3>
                <p style={styles.faqA}>{item.a}</p>
              </div>
            ))}
          </div>
        </section>

        <GeoFollowUpChain
          topicTitle={stageData.name}
          followUps={[
            {
              question: `Which Interactive Calculator Should I Use During ${stageData.name}?`,
              answer: `Launch The ${stageData.recommendedCalculators?.[0]?.name || 'Malmuth-Harville ICM Calculator'} To Model Exact Stack Distributions And Breakeven Equities For This Tournament Phase.`,
              calculatorHref: stageData.recommendedCalculators?.[0]?.href || '/tools/icm-calculator',
              calculatorLabel: `Open ${stageData.recommendedCalculators?.[0]?.name || 'ICM Calculator'}`,
              markdownHref: `${canonicalPath}.md`,
            },
            {
              question: 'How Do I Avoid High-Cost ICM And Bubble Leaks During Tournament Play?',
              answer:
                'Inspect The Smarter.Poker Leak Diagnostic Encyclopedia To Fix Ignoring ICM Bubble Factors, Over-Folding The Big Blind, And Neglecting Bounty Chip Conversion.',
              calculatorHref: '/learn/leaks/ignoring-icm-bubble-factors',
              calculatorLabel: 'Read ICM Bubble Leak Cure',
              markdownHref: '/learn/leaks/ignoring-icm-bubble-factors.md',
            },
            {
              question: 'What Is The Exact Mathematical Equation Behind Bubble Factor And Risk Premium?',
              answer:
                'Bubble Factor = Dollar Equity Lost / Dollar Equity Gained, And Required Calling Equity = BF / (BF + 1).',
              calculatorHref: '/learn/formulas/bubble-factor',
              calculatorLabel: 'View Bubble Factor Formula Proof',
              markdownHref: '/learn/formulas/bubble-factor.md',
            },
          ]}
        />

        <HubPageSummary page="learn-tournament-stages" />

        <CitationBacklinkBox
          title={stageData.h1}
          canonicalUrl={canonicalUrl}
          badgeType="gto"
          badgeLabel={stageData.code}
          badgeValue={`BF ${stageData.averageBubbleFactor}`}
          summary={stageData.summary}
          publishedYear="2026"
          slug={`mtt-stage-${stageData.slug}`}
          doi={TOURNAMENT_STAGES_DOI}
        />

        <AiPromptLauncher
          title={stageData.h1}
          canonicalUrl={canonicalUrl}
          canonicalPath={canonicalPath}
          markdownUrl={`${canonicalPath}.md`}
        />
      </main>
    </div>
  );
}

export async function getServerSideProps({ params, req, res, query }) {
  const rawSlug = String(params?.stage || '').replace(/\.md$/i, '');
  const stageData = findTournamentStage(rawSlug);
  if (!stageData) return { notFound: true };

  const accept = String(req?.headers?.accept || '');
  if (
    String(params?.stage || '').endsWith('.md') ||
    query?.format === 'md' ||
    query?.format === 'markdown' ||
    accept.includes('text/markdown') ||
    req?.url?.includes('format=md')
  ) {
    const md = renderTournamentStageDetailMarkdown(stageData);
    res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
    res.setHeader('Vary', 'Accept');
    res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
    res.write(md);
    res.end();
    return { props: {} };
  }

  return {
    props: {
      stageData,
      allStages: TOURNAMENT_STAGES.map((s) => ({
        slug: s.slug,
        code: s.code,
        name: s.name,
        averageBubbleFactor: s.averageBubbleFactor,
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
  h1: { fontSize: 'clamp(25px, 3.5vw, 35px)', fontWeight: 800, color: '#f2f7ff', lineHeight: 1.22, margin: '0 0 14px 0' },
  lead: { fontSize: 16, lineHeight: 1.66, color: '#bdd0e2', margin: '0 0 20px 0' },
  metricsGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 12, marginBottom: 20 },
  metricCard: { background: '#071321', border: '1px solid #2b4663', borderRadius: 0, padding: '14px 16px' },
  metricLabel: { fontSize: 12, color: '#bdd0e2', fontWeight: 600, marginBottom: 6 },
  metricValueCyan: { fontSize: 15.5, fontWeight: 800, color: '#38bdf8' },
  metricValueEmerald: { fontSize: 15.5, fontWeight: 800, color: '#34d399' },
  quickCrossLinks: { display: 'flex', flexWrap: 'wrap', gap: 10 },
  crossBtnCyan: { padding: '9px 15px', borderRadius: 0, background: '#38bdf8', color: '#071321', fontWeight: 700, fontSize: 13, textDecoration: 'none' },
  crossBtnEmerald: { padding: '9px 15px', borderRadius: 0, background: '#10b981', color: '#071321', fontWeight: 700, fontSize: 13, textDecoration: 'none' },
  crossBtnOutline: { padding: '9px 15px', borderRadius: 0, background: '#0d1f33', color: '#38bdf8', border: '1px solid #2b4663', fontWeight: 700, fontSize: 13, textDecoration: 'none' },
  sectionPlate: { background: '#0a1a2b', border: '1px solid #2b4663', borderRadius: 0, padding: '24px 22px', marginBottom: 26 },
  h2: { fontSize: 21, fontWeight: 800, color: '#f2f7ff', margin: '0 0 14px 0' },
  bulletList: { margin: 0, paddingLeft: 18, display: 'grid', gap: 12 },
  bulletItem: { fontSize: 14.5, lineHeight: 1.65, color: '#bdd0e2' },
  peerGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 12 },
  peerCard: { display: 'flex', flexDirection: 'column', gap: 4, padding: '14px 16px', borderRadius: 0, background: '#0d1f33', border: '1px solid #2b4663', textDecoration: 'none' },
  peerCode: { fontSize: 11, fontWeight: 800, color: '#38bdf8' },
  peerName: { fontSize: 14.5, fontWeight: 700, color: '#f2f7ff' },
  peerStats: { fontSize: 12, color: '#34d399' },
  faqList: { display: 'grid', gap: 14 },
  faqItem: { background: '#0d1f33', border: '1px solid #2b4663', borderRadius: 0, padding: '16px 18px' },
  faqQ: { fontSize: 16, fontWeight: 700, color: '#f2f7ff', margin: '0 0 6px 0' },
  faqA: { fontSize: 14, lineHeight: 1.6, color: '#bdd0e2', margin: 0 },
};
