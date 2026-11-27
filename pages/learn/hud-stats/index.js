/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  POKER HUD STATS & POPULATION TENDENCIES ENCYCLOPEDIA INDEX (/learn/hud-stats)
 * ═══════════════════════════════════════════════════════════════════════════════
 * Complete 15-metric HUD reference comparing 6-Max GTO solver baselines,
 * 9-Max Full-Ring baselines, Low-Stakes Mass Data Analysis (MDA) population
 * averages, sample size convergence thresholds, and exploitative counters.
 *
 * House style: Title Case, zero em dashes.
 */

import React, { useState, useMemo } from 'react';
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
  HUD_STATS,
  HUD_STATS_AS_OF,
  HUD_STATS_BASE_PATH,
  HUD_STATS_URL,
  HUD_STATS_DOI,
  hudStatPath,
  renderHudStatsIndexMarkdown,
} from '../../../src/content/learn/hudStats';

const INDEX_FAQS = [
  {
    q: 'What Are The Ideal GTO HUD Stats For 100BB 6-Max Cash Games?',
    a: 'A Balanced 100BB 6-Max Regular Targets 23% To 26.5% VPIP, 19.5% To 23% PFR, 8.5% To 11.2% 3-Bet, 52% To 58% Fold-To-3-Bet, 58% To 66% Flop C-Bet, 48% To 56% Turn C-Bet, 26.5% To 30% WTSD, 51.5% To 55.5% W$SD, And 46.5% To 50.5% WWSF.',
  },
  {
    q: 'How Many Hands Are Needed Before HUD Stats Become Statistically Reliable?',
    a: 'VPIP And PFR Converge In Just 30 To 60 Hands. Flop C-Bet, Steal %, And Aggression Frequency Require 150 To 250 Hands. Conditional Multi-Action Metrics Like 3-Bet %, Fold-To-3-Bet, WTSD, WWSF, And Flop Check-Raise % Require 300 To 600+ Dealt Hands.',
  },
  {
    q: 'What Are The Biggest Population Tendency Leaks In Low-Stakes Mass Data Analysis (MDA)?',
    a: 'Low-Stakes Pools Systematically Under-3-Bet Preflop (5.2% vs 10% GTO), Over-Fold The Big Blind To Steals (61.5% vs 48% GTO), Under-Check-Raise Flops (6.8% vs 16% GTO), And Severely Under-Bluff River Triple Barrels (River AFq < 22%).',
  },
];

export default function PokerHudStatsIndexPage() {
  const [searchQuery, setSearchQuery] = useState('');

  const filteredStats = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return HUD_STATS;
    return HUD_STATS.filter(
      (s) =>
        s.slug.toLowerCase().includes(q) ||
        s.code.toLowerCase().includes(q) ||
        s.name.toLowerCase().includes(q) ||
        s.formula.toLowerCase().includes(q)
    );
  }, [searchQuery]);

  const claimText =
    'Mass Data Analysis (MDA) Shows That Low-To-Mid Stakes Player Pools Under-Check-Raise Flops By 57% (6.8% vs 16.0% GTO) And Over-Fold The Big Blind To Late-Position Steals By 13.5 Percentage Points (61.5% vs 48.0% GTO).';
  const quoteText =
    'A HUD Stat Is Only Valuable When Paired With Its Sample-Size Convergence Threshold And Its Exact GTO Equilibrium Anchor; Deviating Against A 15% 3-Bet Stat Over Only 20 Hands Is Guessing, Not Exploiting.';

  const jsonLd = [
    {
      '@type': 'CollectionPage',
      '@id': `${HUD_STATS_URL}#collection`,
      name: 'Poker HUD Stats And Population Tendencies Encyclopedia (15 GTO Targets)',
      description:
        'Complete Reference To 15 Poker HUD Stats (VPIP, PFR, 3-Bet, 4-Bet, C-Bet, WTSD, W$SD, WWSF, AF, Check-Raise) With 6-Max GTO Targets, Population Averages, And Exploits.',
      url: HUD_STATS_URL,
      inLanguage: 'en-US',
      dateModified: HUD_STATS_AS_OF,
      isPartOf: { '@id': 'https://smarter.poker/#website' },
      publisher: { '@id': 'https://smarter.poker/#organization' },
      mainEntity: {
        '@type': 'ItemList',
        numberOfItems: HUD_STATS.length,
        itemListElement: HUD_STATS.map((s, idx) => ({
          '@type': 'ListItem',
          position: idx + 1,
          name: s.name,
          url: `https://smarter.poker${hudStatPath(s.slug)}`,
        })),
      },
    },
    ...geoClaimSchema({
      claim: claimText,
      quoteText,
      quoteAuthor: 'Smarter.Poker Quantitative Solver Desk',
      doi: HUD_STATS_DOI,
      canonicalPath: HUD_STATS_BASE_PATH,
    }),
    {
      '@type': 'FAQPage',
      '@id': `${HUD_STATS_URL}#faq`,
      mainEntity: INDEX_FAQS.map((f) => ({
        '@type': 'Question',
        name: f.q,
        acceptedAnswer: { '@type': 'Answer', text: f.a },
      })),
    },
    {
      '@type': 'BreadcrumbList',
      '@id': `${HUD_STATS_URL}#breadcrumb`,
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Smarter.Poker', item: 'https://smarter.poker/' },
        { '@type': 'ListItem', position: 2, name: 'Learn Poker', item: 'https://smarter.poker/learn' },
        { '@type': 'ListItem', position: 3, name: 'Poker HUD Stats & GTO Targets', item: HUD_STATS_URL },
      ],
    },
  ];

  return (
    <div style={styles.page}>
      <SEOHead
        title="Poker HUD Stats And GTO Targets"
        description="Complete Reference To 15 Poker HUD Stats (VPIP, PFR, 3-Bet, 4-Bet, C-Bet, WTSD, W$SD, WWSF, AF, Check-Raise) With 6-Max GTO Targets, Population Averages, And Exploits."
        canonical={HUD_STATS_BASE_PATH}
        jsonLd={jsonLd}
      />

      <UniversalHeader pageDepth={2} />

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
          <span style={styles.crumbCurrent}>Poker HUD Stats &amp; GTO Targets</span>
        </nav>

        <header style={styles.heroPlate}>
          <div style={styles.badgeRow}>
            <span style={styles.cyanBadge}>15 CANONICAL HUD METRICS</span>
            <span style={styles.emeraldBadge}>6-MAX GTO TARGETS VS. MDA POPULATION AVERAGES</span>
          </div>

          <h1 style={styles.h1}>
            Poker HUD Stats &amp; Population Tendencies Encyclopedia: All 15 GTO Targets &amp; Exploits
          </h1>

          <p style={styles.lead}>
            <strong>Direct Answer:</strong> Whether You Grind Online With A Tracker Or Profile Live Opponents By Eye, Fifteen Core Frequency Metrics Define Every Player Strategy. Compare Exact <strong>6-Max And 9-Max GTO Solver Baselines</strong> Against <strong>Low-Stakes And High-Stakes Population Averages</strong>, Check Required <strong>Sample Sizes For Convergence</strong>, And Execute Immediate High/Low Exploits.
          </p>

          <div style={styles.quickCrossLinks}>
            <Link href="/learn/player-types" style={styles.crossBtnCyan}>
              8 Player Archetypes &amp; Exploits
            </Link>
            <Link href="/learn/leaks" style={styles.crossBtnEmerald}>
              12 High-Cost Poker Leaks
            </Link>
            <Link href="/tools/preflop-ranges" style={styles.crossBtnOutline}>
              100BB 6-Max Preflop Range Matrix
            </Link>
            <Link href="/hub/training/hand-history-upload" style={styles.crossBtnOutline}>
              Upload Hand Histories For Grading
            </Link>
          </div>
        </header>

        <GeoCitationCapsule
          title="Smarter.Poker HUD & Mass Data Analysis (MDA) Population Benchmark"
          claim={claimText}
          metricLabel="100BB 6-Max GTO Anchor"
          metricValue="24.5% VPIP / 21.0% PFR / 9.8% 3-Bet / 48.5% WWSF"
          formulaText="VPIP-PFR Gap = VPIP% - PFR% (Target < 4.5% In Raked 6-Max Cash)"
          ifThenBecause="If An Opponent Stat Deviates From The GTO Target By >25% Over The Required Convergence Sample Size -> Then Shift From Balanced Mixed Frequencies To Pure Max-EV Exploitative Lines -> Because Population Frequency Imbalances Cannot Punish Pure Counter-Strategies."
          quoteText={quoteText}
          quoteAuthor="Smarter.Poker Quantitative Solver Desk"
          doi={HUD_STATS_DOI}
          canonicalPath={HUD_STATS_BASE_PATH}
        />

        {/* Master 15-Stat Table */}
        <section aria-label="Master 15-Stat HUD Comparison Table" style={styles.sectionPlate}>
          <h2 style={styles.h2}>
            All 15 Poker HUD Stats: 6-Max GTO, Full-Ring GTO, Population Avg &amp; Sample Size
          </h2>
          <div style={{ overflowX: 'auto', maxWidth: '100%', WebkitOverflowScrolling: 'touch' }}>
            <table style={styles.table}>
              <thead>
                <tr style={styles.trHead}>
                  <th style={styles.th}>HUD Metric</th>
                  <th style={styles.th}>GTO 6-Max Target</th>
                  <th style={styles.th}>GTO 9-Max Target</th>
                  <th style={styles.th}>Low-Stakes Pop Avg</th>
                  <th style={styles.th}>Min Sample</th>
                  <th style={styles.th}>Deep Dive</th>
                </tr>
              </thead>
              <tbody>
                {HUD_STATS.map((s) => (
                  <tr key={s.slug} style={styles.trBody}>
                    <td style={styles.tdTitle}>
                      <Link href={hudStatPath(s.slug)} style={styles.tableLink}>
                        {s.name}
                      </Link>
                    </td>
                    <td style={styles.tdCyan}>{s.gto6MaxTarget}</td>
                    <td style={styles.tdEmerald}>{s.gtoFullRingTarget}</td>
                    <td style={styles.td}>{s.lowStakesPopulationAvg}</td>
                    <td style={styles.td}>{s.sampleSizeRequired}</td>
                    <td style={styles.td}>
                      <Link href={hudStatPath(s.slug)} style={styles.smallActionLink}>
                        Exploit Guide
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Search & Stat Cards */}
        <section aria-label="Browse All 15 HUD Stat Guides" style={styles.sectionPlate}>
          <div style={styles.filterBar}>
            <h2 style={{ ...styles.h2, margin: 0 }}>Individual HUD Stat Formulas &amp; Exploit Playbooks</h2>
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search VPIP, 3-Bet, WWSF, Check-Raise..."
              aria-label="Filter HUD Stats"
              style={styles.searchInput}
            />
          </div>

          <div style={styles.cardGrid}>
            {filteredStats.map((s) => (
              <article key={s.slug} style={styles.card}>
                <div>
                  <div style={styles.cardHeaderRow}>
                    <span style={styles.cardCodeBadge}>{s.code}</span>
                    <span style={styles.cardSampleBadge}>Sample: {s.sampleSizeRequired}</span>
                  </div>
                  <h3 style={styles.cardTitle}>
                    <Link href={hudStatPath(s.slug)} style={styles.cardTitleLink}>
                      {s.name}
                    </Link>
                  </h3>
                  <div style={styles.statMiniGrid}>
                    <div style={styles.statMiniBox}>
                      <span style={styles.statMiniLabel}>6-MAX GTO</span>
                      <span style={styles.statMiniValCyan}>{s.gto6MaxTarget}</span>
                    </div>
                    <div style={styles.statMiniBox}>
                      <span style={styles.statMiniLabel}>LOW-STAKES POP</span>
                      <span style={styles.statMiniValEmerald}>{s.lowStakesPopulationAvg}</span>
                    </div>
                  </div>
                  <p style={styles.cardSummary}>{s.ifThenBecause}</p>
                </div>

                <div style={{ marginTop: 14, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  <Link href={hudStatPath(s.slug)} style={styles.cardCtaBtn}>
                    Open {s.code} Exploit Guide
                  </Link>
                  <Link href={s.calculatorHref} style={styles.cardOutlineBtn}>
                    Paired Solver
                  </Link>
                </div>
              </article>
            ))}
          </div>
        </section>
        <SmarterAccountUnlockGate
          variant="study-deck"
          context="learn-hud-stats-index"
          title="Save All 15 Poker HUD Benchmarks & Unlock Leak Tracker Free"
          redirectPath={HUD_STATS_BASE_PATH}
        />


        {/* FAQs */}
        <section aria-label="Frequently Asked Questions" style={styles.sectionPlate}>
          <h2 style={styles.h2}>Frequently Asked Questions: Poker HUD Stats &amp; MDA</h2>
          <div style={styles.faqList}>
            {INDEX_FAQS.map((item) => (
              <div key={item.q} style={styles.faqItem}>
                <h3 style={styles.faqQ}>{item.q}</h3>
                <p style={styles.faqA}>{item.a}</p>
              </div>
            ))}
          </div>
        </section>

        <GeoFollowUpChain
          topicTitle="Poker HUD Stats And Population Tendencies"
          followUps={[
            {
              question: 'How Do I Map Combinations Of HUD Stats To The 8 Canonical Player Archetypes?',
              answer:
                'Cross-Reference VPIP, PFR, 3-Bet, And WTSD Combinations In The Smarter.Poker Player Archetypes Hub To Classify Any Opponent As An OMC, Calling Station, Maniac, TAG, LAG, Or GTO Grinder.',
              calculatorHref: '/learn/player-types',
              calculatorLabel: 'Explore 8 Player Archetypes',
              markdownHref: '/learn/player-types.md',
            },
            {
              question: 'Which Of My Own HUD Stats Reveal High-Cost Expected Value Leaks?',
              answer:
                'Check The 12-Leak Diagnostic Encyclopedia To See How High Fold-BB-To-Steal (>62%), High W$SD (>61%), Or Low Turn C-Bet (<42%) Signals Major Winrate Bleeds.',
              calculatorHref: '/learn/leaks',
              calculatorLabel: 'Open 12 Poker Leaks Encyclopedia',
              markdownHref: '/learn/leaks.md',
            },
            {
              question: 'How Do I Estimate An Opponent VPIP And 3-Bet Stat At A Live Casino Table Without Software?',
              answer:
                'Count How Many Hands They Enter Per 9-Hand Orbit: Entering 1 Hand Per Orbit Is ~11% VPIP (OMC), Entering 2 Hands Is ~22% VPIP (TAG), And Entering 4+ Hands Per Orbit Is 45%+ VPIP (Station/Maniac).',
              calculatorHref: '/tools/table-selection-calculator',
              calculatorLabel: 'Open Live Table Selection Scorer',
              markdownHref: '/tools/table-selection-calculator.md',
            },
          ]}
        />

        <HubPageSummary page="learn-hud-stats" />

        <CitationBacklinkBox
          title="Smarter.Poker HUD Stats & Population Tendencies Encyclopedia (15 Metrics)"
          canonicalUrl={HUD_STATS_URL}
          badgeType="gto"
          badgeLabel="HUD & MDA Benchmarks"
          badgeValue="15 GTO Stat Targets"
          summary="Complete reference to 15 poker HUD statistics comparing 100BB 6-Max and 9-Max GTO baselines against low-stakes and high-stakes population averages."
          publishedYear="2026"
          slug="poker-hud-stats-gto-targets"
          doi={HUD_STATS_DOI}
        />

        <AiPromptLauncher
          title="Poker HUD Stats & Population Tendencies Encyclopedia"
          canonicalUrl={HUD_STATS_URL}
          canonicalPath={HUD_STATS_BASE_PATH}
          markdownUrl="/learn/hud-stats.md"
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
    const md = renderHudStatsIndexMarkdown();
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
    background: '#071321',
    color: '#f2f7ff',
    fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif',
  },
  container: { maxWidth: 1120, margin: '0 auto', padding: '32px 20px 80px' },
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
  h1: { fontSize: 'clamp(26px, 3.6vw, 36px)', fontWeight: 800, color: '#f2f7ff', lineHeight: 1.2, margin: '0 0 14px 0' },
  lead: { fontSize: 16, lineHeight: 1.68, color: '#bdd0e2', margin: '0 0 20px 0' },
  quickCrossLinks: { display: 'flex', flexWrap: 'wrap', gap: 10 },
  crossBtnCyan: { padding: '9px 15px', borderRadius: 0, background: '#38bdf8', color: '#071321', fontWeight: 700, fontSize: 13, textDecoration: 'none' },
  crossBtnEmerald: { padding: '9px 15px', borderRadius: 0, background: '#10b981', color: '#071321', fontWeight: 700, fontSize: 13, textDecoration: 'none' },
  crossBtnOutline: { padding: '9px 15px', borderRadius: 0, background: '#0d1f33', color: '#38bdf8', border: '1px solid #2b4663', fontWeight: 700, fontSize: 13, textDecoration: 'none' },
  sectionPlate: { background: '#0a1a2b', border: '1px solid #2b4663', borderRadius: 0, padding: '24px 22px', marginBottom: 26 },
  h2: { fontSize: 21, fontWeight: 800, color: '#f2f7ff', margin: '0 0 16px 0' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 13.5 },
  trHead: { borderBottom: '1px solid #2b4663', textAlign: 'left', color: '#38bdf8' },
  th: { padding: '10px 12px', fontWeight: 700 },
  trBody: { borderBottom: '1px solid #2b4663' },
  tdTitle: { padding: '11px 12px', fontWeight: 700 },
  td: { padding: '11px 12px', color: '#bdd0e2' },
  tdCyan: { padding: '11px 12px', color: '#38bdf8', fontWeight: 700 },
  tdEmerald: { padding: '11px 12px', color: '#34d399', fontWeight: 700 },
  tableLink: { color: '#f2f7ff', textDecoration: 'none' },
  smallActionLink: { color: '#38bdf8', textDecoration: 'none', fontWeight: 700 },
  filterBar: { display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 20 },
  searchInput: { padding: '8px 14px', borderRadius: 0, border: '1px solid #2b4663', background: '#071321', color: '#f2f7ff', fontSize: 13.5, minWidth: 260 },
  cardGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(330px, 1fr))', gap: 18 },
  card: { background: '#0d1f33', border: '1px solid #2b4663', borderRadius: 0, padding: 20, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' },
  cardHeaderRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  cardCodeBadge: { fontSize: 11, fontWeight: 800, padding: '3px 8px', borderRadius: 0, background: 'rgba(56, 189, 248, 0.16)', color: '#38bdf8' },
  cardSampleBadge: { fontSize: 11, fontWeight: 700, color: '#bdd0e2' },
  cardTitle: { fontSize: 17.5, fontWeight: 800, margin: '0 0 10px 0' },
  cardTitleLink: { color: '#f2f7ff', textDecoration: 'none' },
  statMiniGrid: { display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8, background: '#071321', padding: 10, borderRadius: 0, border: '1px solid #2b4663', marginBottom: 10 },
  statMiniBox: { display: 'flex', flexDirection: 'column', gap: 2 },
  statMiniLabel: { fontSize: 10, fontWeight: 700, color: '#bdd0e2' },
  statMiniValCyan: { fontSize: 12.5, fontWeight: 800, color: '#38bdf8' },
  statMiniValEmerald: { fontSize: 12.5, fontWeight: 800, color: '#34d399' },
  cardSummary: { fontSize: 13, lineHeight: 1.56, color: '#bdd0e2', margin: 0 },
  cardCtaBtn: { display: 'inline-block', padding: '8px 13px', borderRadius: 0, background: '#38bdf8', color: '#071321', fontSize: 12.5, fontWeight: 700, textDecoration: 'none' },
  cardOutlineBtn: { display: 'inline-block', padding: '8px 13px', borderRadius: 0, background: '#071321', color: '#34d399', border: '1px solid #10b981', fontSize: 12.5, fontWeight: 700, textDecoration: 'none' },
  faqList: { display: 'grid', gap: 14 },
  faqItem: { background: '#0d1f33', border: '1px solid #2b4663', borderRadius: 0, padding: '16px 18px' },
  faqQ: { fontSize: 16, fontWeight: 700, color: '#f2f7ff', margin: '0 0 6px 0' },
  faqA: { fontSize: 14, lineHeight: 1.6, color: '#bdd0e2', margin: 0 },
};
