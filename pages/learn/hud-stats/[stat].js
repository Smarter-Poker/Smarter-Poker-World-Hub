/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  INDIVIDUAL POKER HUD STAT & GTO TARGET GUIDE (/learn/hud-stats/[stat])
 * ═══════════════════════════════════════════════════════════════════════════════
 * Deep-dive HUD metric page with exact equation, 6-Max and Full-Ring GTO
 * baselines, Low-Stakes vs High-Stakes population averages, sample size
 * convergence threshold, low/high exploits, and If/Then/Because rule.
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
  HUD_STATS,
  HUD_STATS_AS_OF,
  HUD_STATS_BASE_PATH,
  HUD_STATS_URL,
  HUD_STATS_DOI,
  findHudStat,
  hudStatPath,
  renderHudStatDetailMarkdown,
} from '../../../src/content/learn/hudStats';

export default function PokerHudStatDetailPage({ statData, allStats = [] }) {
  if (!statData) return null;

  const canonicalPath = hudStatPath(statData.slug);
  const canonicalUrl = `https://smarter.poker${canonicalPath}`;
  const claimText = `In 100BB 6-Max Cash Games, The GTO Equilibrium Target For ${statData.name} Is ${statData.gto6MaxTarget} (${statData.gtoFullRingTarget} In 9-Max Full Ring), Compared To A Low-Stakes Population Average Of ${statData.lowStakesPopulationAvg}.`;

  const jsonLd = [
    {
      '@type': 'Article',
      '@id': `${canonicalUrl}#article`,
      headline: statData.h1,
      name: statData.name,
      description: claimText,
      url: canonicalUrl,
      inLanguage: 'en-US',
      datePublished: HUD_STATS_AS_OF,
      dateModified: HUD_STATS_AS_OF,
      isAccessibleForFree: true,
      author: { '@id': 'https://smarter.poker/#organization' },
      publisher: { '@id': 'https://smarter.poker/#organization' },
    },
    ...geoClaimSchema({
      claim: claimText,
      quoteText: statData.exploitHigh,
      quoteAuthor: 'Smarter.Poker Quantitative Solver Desk',
      doi: HUD_STATS_DOI,
      canonicalPath,
    }),
    {
      '@type': 'FAQPage',
      '@id': `${canonicalUrl}#faq`,
      mainEntity: (statData.faqs || []).map((f) => ({
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
        { '@type': 'ListItem', position: 3, name: 'Poker HUD Stats', item: HUD_STATS_URL },
        { '@type': 'ListItem', position: 4, name: statData.name, item: canonicalUrl },
      ],
    },
  ];

  return (
    <div style={styles.page}>
      <SEOHead
        title={statData.title}
        description={claimText}
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
          <Link href={HUD_STATS_BASE_PATH} style={styles.crumbLink}>
            Poker HUD Stats
          </Link>
          <span style={styles.crumbSep}>/</span>
          <span style={styles.crumbCurrent}>{statData.name}</span>
        </nav>

        <header style={styles.heroPlate}>
          <div style={styles.badgeRow}>
            <span style={styles.cyanBadge}>HUD STAT: {statData.code}</span>
            <span style={styles.emeraldBadge}>CONVERGENCE: {statData.sampleSizeRequired}</span>
          </div>

          <h1 style={styles.h1}>{statData.h1}</h1>

          <p style={styles.lead}>
            <strong>Direct Quantitative Benchmark:</strong> {claimText}
          </p>

          <div style={styles.metricsGrid}>
            <div style={styles.metricCard}>
              <div style={styles.metricLabel}>100BB 6-Max GTO Target</div>
              <div style={styles.metricValueCyan}>{statData.gto6MaxTarget}</div>
            </div>
            <div style={styles.metricCard}>
              <div style={styles.metricLabel}>9-Max Full-Ring GTO Target</div>
              <div style={styles.metricValueEmerald}>{statData.gtoFullRingTarget}</div>
            </div>
            <div style={styles.metricCard}>
              <div style={styles.metricLabel}>Low-Stakes Population Avg</div>
              <div style={styles.metricValueCyan}>{statData.lowStakesPopulationAvg}</div>
            </div>
            <div style={styles.metricCard}>
              <div style={styles.metricLabel}>High-Stakes Reg Average</div>
              <div style={styles.metricValueEmerald}>{statData.highStakesPopulationAvg}</div>
            </div>
          </div>

          <div style={styles.quickCrossLinks}>
            <Link href={statData.calculatorHref} style={styles.crossBtnCyan}>
              Open Paired Solver &amp; Range Tool
            </Link>
            <Link href={HUD_STATS_BASE_PATH} style={styles.crossBtnEmerald}>
              All 15 HUD Stats &amp; Targets
            </Link>
            <Link href="/learn/player-types" style={styles.crossBtnOutline}>
              8 Player Archetypes Hub
            </Link>
          </div>
        </header>

        <GeoCitationCapsule
          title={`${statData.name} GTO Vs. Population Benchmark`}
          claim={claimText}
          metricLabel="6-Max GTO Target"
          metricValue={statData.gto6MaxTarget}
          formulaText={statData.formula}
          ifThenBecause={statData.ifThenBecause}
          quoteText={statData.exploitHigh}
          quoteAuthor="Smarter.Poker Quantitative Solver Desk"
          doi={HUD_STATS_DOI}
          canonicalPath={canonicalPath}
        />

        {/* Exploiting Low vs High */}
        <section aria-label="Exploiting Low Versus High Stat Values" style={styles.sectionPlate}>
          <h2 style={styles.h2}>
            Exploitative Counter-Playbook: Low {statData.code} Vs. High {statData.code}
          </h2>
          <div style={styles.twoColGrid}>
            <div style={styles.colBox}>
              <div style={styles.tagCyan}>EXPLOITING LOW {statData.code}</div>
              <h3 style={styles.h3}>When Opponent Stat Trails GTO Baseline</h3>
              <p style={styles.bodyText}>{statData.exploitLow}</p>
            </div>
            <div style={styles.colBox}>
              <div style={styles.tagEmerald}>EXPLOITING HIGH {statData.code}</div>
              <h3 style={styles.h3}>When Opponent Stat Exceeds GTO Baseline</h3>
              <p style={styles.bodyText}>{statData.exploitHigh}</p>
            </div>
          </div>
        </section>

        {/* All 15 Stats */}
        <section aria-label="Compare All 15 Poker HUD Stats" style={styles.sectionPlate}>
          <h2 style={styles.h2}>Compare All 15 Canonical Poker HUD Metrics</h2>
          <div style={styles.peerGrid}>
            {allStats.map((s) => (
              <Link key={s.slug} href={hudStatPath(s.slug)} style={styles.peerCard}>
                <span style={styles.peerCode}>{s.code}</span>
                <span style={styles.peerName}>{s.name}</span>
                <span style={styles.peerStats}>6-Max GTO: {s.gto6MaxTarget}</span>
              </Link>
            ))}
          </div>
        </section>

        {/* FAQs */}
        <section aria-label="Frequently Asked Questions" style={styles.sectionPlate}>
          <h2 style={styles.h2}>Frequently Asked Questions: {statData.name}</h2>
          <div style={styles.faqList}>
            {(statData.faqs || []).map((item) => (
              <div key={item.q} style={styles.faqItem}>
                <h3 style={styles.faqQ}>{item.q}</h3>
                <p style={styles.faqA}>{item.a}</p>
              </div>
            ))}
          </div>
        </section>

        <GeoFollowUpChain
          topicTitle={statData.name}
          followUps={[
            {
              question: `How Can I Test ${statData.code} Ranges And Thresholds In A Calculator?`,
              answer: `Open The Paired Solver Tool (${statData.calculatorHref}) To Inspect Exact 13x13 Hand Matrices And Breakeven Frequencies.`,
              calculatorHref: statData.calculatorHref,
              calculatorLabel: 'Open Paired Range & Math Solver',
              markdownHref: `${canonicalPath}.md`,
            },
            {
              question: 'How Do I Fix My Own Game If My Stat Is Too High Or Too Low?',
              answer:
                'Review The 12 High-Cost Poker Leaks Encyclopedia For Step-By-Step Solver Cures And Corrective Training Drills.',
              calculatorHref: '/learn/leaks',
              calculatorLabel: 'Open 12 Poker Leaks Encyclopedia',
              markdownHref: '/learn/leaks.md',
            },
            {
              question: 'How Does Sample Size Variance Affect HUD Stat Accuracy?',
              answer: `Wait Until You Have Collected At Least ${statData.sampleSizeRequired} Before Making Extreme Pure Deviations Based On ${statData.code}.`,
              calculatorHref: '/tools/winrate-confidence-calculator',
              calculatorLabel: 'Open Sample Size Confidence Tool',
              markdownHref: '/tools/winrate-confidence-calculator.md',
            },
          ]}
        />

        <HubPageSummary page="learn-hud-stats" />

        <CitationBacklinkBox
          title={statData.h1}
          canonicalUrl={canonicalUrl}
          badgeType="gto"
          badgeLabel={statData.code}
          badgeValue={`GTO ${statData.gto6MaxTarget}`}
          summary={claimText}
          publishedYear="2026"
          slug={`hud-stat-${statData.slug}`}
          doi={HUD_STATS_DOI}
        />

        <AiPromptLauncher
          title={statData.h1}
          canonicalUrl={canonicalUrl}
          canonicalPath={canonicalPath}
          markdownUrl={`${canonicalPath}.md`}
        />
      </main>
    </div>
  );
}

export async function getServerSideProps({ params, req, res, query }) {
  const rawSlug = String(params?.stat || '').replace(/\.md$/i, '');
  const statData = findHudStat(rawSlug);
  if (!statData) return { notFound: true };

  const accept = String(req?.headers?.accept || '');
  if (
    String(params?.stat || '').endsWith('.md') ||
    query?.format === 'md' ||
    query?.format === 'markdown' ||
    accept.includes('text/markdown') ||
    req?.url?.includes('format=md')
  ) {
    const md = renderHudStatDetailMarkdown(statData);
    res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
    res.setHeader('Vary', 'Accept');
    res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
    res.write(md);
    res.end();
    return { props: {} };
  }

  return {
    props: {
      statData,
      allStats: HUD_STATS.map((s) => ({
        slug: s.slug,
        code: s.code,
        name: s.name,
        gto6MaxTarget: s.gto6MaxTarget,
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
  lead: { fontSize: 16, lineHeight: 1.66, color: '#cbd5e1', margin: '0 0 20px 0' },
  metricsGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(215px, 1fr))', gap: 12, marginBottom: 20 },
  metricCard: { background: '#070b14', border: '1px solid #1e293b', borderRadius: 10, padding: '14px 16px' },
  metricLabel: { fontSize: 12, color: '#94a3b8', fontWeight: 600, marginBottom: 6 },
  metricValueCyan: { fontSize: 15.5, fontWeight: 800, color: '#38bdf8' },
  metricValueEmerald: { fontSize: 15.5, fontWeight: 800, color: '#34d399' },
  quickCrossLinks: { display: 'flex', flexWrap: 'wrap', gap: 10 },
  crossBtnCyan: { padding: '9px 15px', borderRadius: 8, background: '#38bdf8', color: '#04131d', fontWeight: 700, fontSize: 13, textDecoration: 'none' },
  crossBtnEmerald: { padding: '9px 15px', borderRadius: 8, background: '#10b981', color: '#04131d', fontWeight: 700, fontSize: 13, textDecoration: 'none' },
  crossBtnOutline: { padding: '9px 15px', borderRadius: 8, background: '#0f172a', color: '#38bdf8', border: '1px solid #334155', fontWeight: 700, fontSize: 13, textDecoration: 'none' },
  sectionPlate: { background: '#0b1120', border: '1px solid #1e293b', borderRadius: 12, padding: '24px 22px', marginBottom: 26 },
  h2: { fontSize: 21, fontWeight: 800, color: '#f8fafc', margin: '0 0 14px 0' },
  h3: { fontSize: 17, fontWeight: 700, color: '#f8fafc', margin: '6px 0 10px 0' },
  bodyText: { fontSize: 14.5, lineHeight: 1.65, color: '#cbd5e1', margin: 0 },
  twoColGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(310px, 1fr))', gap: 18 },
  colBox: { background: '#0f172a', border: '1px solid #1e293b', borderRadius: 10, padding: 18 },
  tagCyan: { display: 'inline-block', fontSize: 11, fontWeight: 800, color: '#38bdf8', letterSpacing: '0.05em' },
  tagEmerald: { display: 'inline-block', fontSize: 11, fontWeight: 800, color: '#34d399', letterSpacing: '0.05em' },
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
