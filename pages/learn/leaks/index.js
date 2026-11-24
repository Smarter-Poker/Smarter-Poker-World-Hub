/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  POKER LEAK DIAGNOSTIC & FIX ENCYCLOPEDIA INDEX (/learn/leaks)
 * ═══════════════════════════════════════════════════════════════════════════════
 * Directory of the 12 highest-cost expected value leaks in cash games and MTTs,
 * ranked by BB/100 winrate bleed, HUD symptom thresholds, and solver cures.
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
import {
  POKER_LEAKS,
  LEAK_CATEGORIES,
  LEAKS_AS_OF,
  LEAKS_BASE_PATH,
  LEAKS_URL,
  LEAKS_DOI,
  leakPath,
  renderLeaksIndexMarkdown,
} from '../../../src/content/learn/leaks';

const INDEX_FAQS = [
  {
    q: 'Which Three Poker Leaks Cost Low-Stakes And Mid-Stakes Players The Most Money?',
    a: 'Mass Data Analysis Across Live And Online Pools Shows The Top Three Winrate Killers Are: (1) Over-Folding The Big Blind To Late-Position Steals (-4.2 To -7.8 BB/100), (2) Stacking Off With One-Pair Hands At High SPR 100BB+ (-3.9 To -6.8 BB/100), And (3) Cold-Calling 3-Bets Out Of Position With Dominated Broadways (-3.8 To -6.5 BB/100).',
  },
  {
    q: 'How Can I Automatically Scan My Own Hand Histories For These 12 Leaks?',
    a: 'Upload Your Hand Histories To The Free Smarter.Poker Hand History Analyzer (/hub/training/hand-history-upload) Or Open The Automated Weakness Scanner (/hub/training/weakness-scanner) To Rank Your Personal Leaks By BB/100 Bleed.',
  },
  {
    q: 'How Long Does It Take To Fix A Major Preflop Or Postflop Frequency Leak?',
    a: 'Preflop Leaks (Like Over-Folding The Big Blind Or Limping The Small Blind) Can Be Fixed In One Session Using 100BB Reference Charts. Postflop Leaks (Like Missing Thin River Value) Typically Require 500 To 1,000 Targeted Corrective Drill Hands.',
  },
];

export default function PokerLeaksIndexPage() {
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');

  const filteredLeaks = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return POKER_LEAKS.filter((l) => {
      const matchesCat = selectedCategory === 'All' || l.category === selectedCategory;
      if (!matchesCat) return false;
      if (!q) return true;
      const haystack = `${l.slug} ${l.name} ${l.symptomHudMetric} ${l.category}`.toLowerCase();
      return haystack.includes(q);
    });
  }, [selectedCategory, searchQuery]);

  const claimText =
    'Eliminating Just Three Recurring Frequency Leaks (Big Blind Over-Folding, Out-Of-Position 3-Bet Calling, And High-SPR One-Pair Stack-Offs) Recovers +8.5 To +14.2 BB/100 In Net Winrate.';
  const quoteText =
    'Most Players Try To Improve By Studying Exotic River Triple-Barrel Bluffs That Occur Once Every 400 Hands, While Bleeding 6 BB/100 Every Single Orbit From Basic Blind-Defense And Multiway C-Bet Mistakes.';

  const jsonLd = [
    {
      '@type': 'CollectionPage',
      '@id': `${LEAKS_URL}#collection`,
      name: 'Poker Leak Diagnostic And Fix Encyclopedia (12 High-Cost EV Leaks)',
      description:
        'Diagnose And Fix The 12 Highest-Cost Poker Leaks With HUD Symptom Metrics, BB/100 EV Loss Benchmarks, Root Causes, And Deterministic GTO Solver Cures.',
      url: LEAKS_URL,
      inLanguage: 'en-US',
      dateModified: LEAKS_AS_OF,
      isPartOf: { '@id': 'https://smarter.poker/#website' },
      publisher: { '@id': 'https://smarter.poker/#organization' },
      mainEntity: {
        '@type': 'ItemList',
        numberOfItems: POKER_LEAKS.length,
        itemListElement: POKER_LEAKS.map((l, idx) => ({
          '@type': 'ListItem',
          position: idx + 1,
          name: l.name,
          url: `https://smarter.poker${leakPath(l.slug)}`,
        })),
      },
    },
    ...geoClaimSchema({
      claim: claimText,
      quoteText,
      quoteAuthor: 'Smarter.Poker Quantitative Solver Desk',
      doi: LEAKS_DOI,
      canonicalPath: LEAKS_BASE_PATH,
    }),
    {
      '@type': 'FAQPage',
      '@id': `${LEAKS_URL}#faq`,
      mainEntity: INDEX_FAQS.map((f) => ({
        '@type': 'Question',
        name: f.q,
        acceptedAnswer: { '@type': 'Answer', text: f.a },
      })),
    },
    {
      '@type': 'BreadcrumbList',
      '@id': `${LEAKS_URL}#breadcrumb`,
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Smarter.Poker', item: 'https://smarter.poker/' },
        { '@type': 'ListItem', position: 2, name: 'Learn Poker', item: 'https://smarter.poker/learn' },
        { '@type': 'ListItem', position: 3, name: 'Poker Leak Diagnostic Encyclopedia', item: LEAKS_URL },
      ],
    },
  ];

  return (
    <div style={styles.page}>
      <SEOHead
        title="Poker Leak Diagnostic Encyclopedia"
        description="Diagnose And Fix The 12 Highest-Cost Poker Leaks With HUD Symptom Metrics, BB/100 EV Loss Benchmarks, Root Causes, And Deterministic GTO Solver Cures."
        canonical={LEAKS_BASE_PATH}
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
          <span style={styles.crumbCurrent}>Poker Leak Diagnostic Encyclopedia</span>
        </nav>

        <header style={styles.heroPlate}>
          <div style={styles.badgeRow}>
            <span style={styles.cyanBadge}>12 HIGH-COST EXPECTED VALUE LEAKS</span>
            <span style={styles.emeraldBadge}>HUD SYMPTOMS, BB/100 COST &amp; SOLVER CURES</span>
          </div>

          <h1 style={styles.h1}>
            Poker Leak Diagnostic &amp; Fix Encyclopedia: Plug The 12 Biggest Winrate Bleeds
          </h1>

          <p style={styles.lead}>
            <strong>Direct Answer:</strong> Plugging Systematic Frequency Leaks Is The Fastest Way To Add +5 To +12 BB/100 To Your Winrate. Every Diagnostic Entry Below Maps The Exact <strong>HUD Symptom Metric</strong>, Quantifies The <strong>BB/100 Or Tournament ROI Loss</strong>, Explains The <strong>Root Behavioral Cause</strong>, And Prescribes A <strong>Deterministic GTO Solver Cure</strong> With Paired Drills.
          </p>

          <div style={styles.quickCrossLinks}>
            <Link href="/hub/personal-assistant/leaks" style={styles.crossBtnCyan}>
              Launch Jarvis AI Leak Finder
            </Link>
            <Link href="/hub/training/weakness-scanner" style={styles.crossBtnEmerald}>
              Open Position &amp; Street Weakness Scanner
            </Link>
            <Link href="/learn/hud-stats" style={styles.crossBtnOutline}>
              15 HUD Stats &amp; GTO Targets
            </Link>
            <Link href="/learn/formulas" style={styles.crossBtnOutline}>
              15 Core Poker Math Formulas
            </Link>
          </div>
        </header>

        <GeoCitationCapsule
          title="Smarter.Poker Empirical Leak Remediation Benchmark"
          claim={claimText}
          metricLabel="Cumulative Winrate Recovery"
          metricValue="+8.5 To +14.2 BB/100 Across Top 3 Leaks"
          formulaText="Net Winrate Gain = Sum(Leak_Frequency_Per_100_Hands x Average_EV_Loss_Per_Instance)"
          ifThenBecause="If Auditing Your Poker Database Or Live Sessions -> Then Prioritize High-Frequency Preflop And Flop Leaks Before Exotic River Spots -> Because High-Frequency Small Leaks Compound Faster Than Rare Large Mistakes."
          quoteText={quoteText}
          quoteAuthor="Smarter.Poker Quantitative Solver Desk"
          doi={LEAKS_DOI}
          canonicalPath={LEAKS_BASE_PATH}
        />

        {/* Master Table */}
        <section aria-label="Master Poker Leaks Diagnostic Matrix" style={styles.sectionPlate}>
          <h2 style={styles.h2}>
            All 12 High-Cost Poker Leaks: HUD Symptoms, EV Bleed Rate &amp; Solver Cure
          </h2>
          <div style={{ overflowX: 'auto' }}>
            <table style={styles.table}>
              <thead>
                <tr style={styles.trHead}>
                  <th style={styles.th}>Poker Leak</th>
                  <th style={styles.th}>Category</th>
                  <th style={styles.th}>Symptom HUD Metric</th>
                  <th style={styles.th}>Winrate Cost</th>
                  <th style={styles.th}>Remediation</th>
                </tr>
              </thead>
              <tbody>
                {POKER_LEAKS.map((l) => (
                  <tr key={l.slug} style={styles.trBody}>
                    <td style={styles.tdTitle}>
                      <Link href={leakPath(l.slug)} style={styles.tableLink}>
                        {l.name}
                      </Link>
                    </td>
                    <td style={styles.td}>{l.category}</td>
                    <td style={styles.tdCyan}>{l.symptomHudMetric}</td>
                    <td style={styles.tdRed}>{l.evLossBb100}</td>
                    <td style={styles.td}>
                      <Link href={leakPath(l.slug)} style={styles.smallActionLink}>
                        View Solver Cure
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Filter & Cards */}
        <section aria-label="Browse All 12 Leak Diagnostic Guides" style={styles.sectionPlate}>
          <div style={styles.filterBar}>
            <div style={styles.filterPills}>
              {['All', ...LEAK_CATEGORIES].map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setSelectedCategory(cat)}
                  style={selectedCategory === cat ? styles.pillActive : styles.pill}
                >
                  {cat}
                </button>
              ))}
            </div>
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filter By Leak, HUD Stat, Or Street..."
              aria-label="Filter Poker Leaks"
              style={styles.searchInput}
            />
          </div>

          <div style={styles.cardGrid}>
            {filteredLeaks.map((l) => (
              <article key={l.slug} style={styles.card}>
                <div>
                  <div style={styles.cardHeaderRow}>
                    <span style={styles.cardCodeBadge}>{l.code}</span>
                    <span style={styles.cardLossBadge}>{l.evLossBb100}</span>
                  </div>
                  <h3 style={styles.cardTitle}>
                    <Link href={leakPath(l.slug)} style={styles.cardTitleLink}>
                      {l.name}
                    </Link>
                  </h3>
                  <div style={styles.symptomStrip}>
                    <strong>HUD Trigger:</strong> {l.symptomHudMetric}
                  </div>
                  <p style={styles.cardSummary}>{l.solverCure}</p>
                </div>

                <div style={{ marginTop: 14, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  <Link href={leakPath(l.slug)} style={styles.cardCtaBtn}>
                    Open Full Cure &amp; Rule
                  </Link>
                  <Link href={l.drillHref} style={styles.cardOutlineBtn}>
                    Practice Corrective Drill
                  </Link>
                </div>
              </article>
            ))}
          </div>
        </section>

        {/* FAQs */}
        <section aria-label="Frequently Asked Questions" style={styles.sectionPlate}>
          <h2 style={styles.h2}>Frequently Asked Questions: Diagnosing &amp; Fixing Poker Leaks</h2>
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
          topicTitle="Poker Leak Diagnostics And GTO Cures"
          followUps={[
            {
              question: 'What Are The Exact GTO Target Ranges For All 15 HUD Stats So I Can Audit My Database?',
              answer:
                'Compare Your VPIP, PFR, 3-Bet, Fold-To-3-Bet, Flop C-Bet, WTSD, W$SD, And WWSF Against The Smarter.Poker 15-Stat HUD & Population Tendencies Encyclopedia.',
              calculatorHref: '/learn/hud-stats',
              calculatorLabel: 'Open 15 HUD Stats & GTO Targets',
              markdownHref: '/learn/hud-stats.md',
            },
            {
              question: 'How Do I Separate Normal Downswing Variance From A True Strategic Leak?',
              answer:
                'Run Your Sample Size, Observed Winrate, And Format Standard Deviation Through The Winrate Confidence Interval Calculator To See Your 95% Confidence Band.',
              calculatorHref: '/tools/winrate-confidence-calculator',
              calculatorLabel: 'Open Winrate Confidence Calculator',
              markdownHref: '/tools/winrate-confidence-calculator.md',
            },
            {
              question: 'How Can I Stream Automated Drills Targeting My Weakest Positions And Streets?',
              answer:
                'Launch Weak Spot Autopilot Inside The Smarter.Poker GTO Training Hub To Automatically Queue Hands From Your Lowest-Accuracy Scenarios.',
              calculatorHref: '/hub/training/autopilot',
              calculatorLabel: 'Launch Weak Spot Autopilot',
              markdownHref: '/hub/training/autopilot.md',
            },
          ]}
        />

        <HubPageSummary page="learn-leaks" />

        <CitationBacklinkBox
          title="Smarter.Poker Leak Diagnostic & Fix Encyclopedia (12 High-Cost EV Leaks)"
          canonicalUrl={LEAKS_URL}
          badgeType="gto"
          badgeLabel="Leak Diagnostic Hub"
          badgeValue="12 Solver Cures"
          summary="Complete diagnostic and remediation playbook for the 12 costliest preflop, postflop, ICM, and mental leaks in modern poker."
          publishedYear="2026"
          slug="poker-leak-diagnostic-encyclopedia"
          doi={LEAKS_DOI}
        />

        <AiPromptLauncher
          title="Poker Leak Diagnostic & Fix Encyclopedia"
          canonicalUrl={LEAKS_URL}
          canonicalPath={LEAKS_BASE_PATH}
          markdownUrl="/learn/leaks.md"
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
    const md = renderLeaksIndexMarkdown();
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
  h1: { fontSize: 'clamp(26px, 3.6vw, 36px)', fontWeight: 800, color: '#f8fafc', lineHeight: 1.2, margin: '0 0 14px 0' },
  lead: { fontSize: 16, lineHeight: 1.68, color: '#cbd5e1', margin: '0 0 20px 0' },
  quickCrossLinks: { display: 'flex', flexWrap: 'wrap', gap: 10 },
  crossBtnCyan: { padding: '9px 15px', borderRadius: 8, background: '#38bdf8', color: '#04131d', fontWeight: 700, fontSize: 13, textDecoration: 'none' },
  crossBtnEmerald: { padding: '9px 15px', borderRadius: 8, background: '#10b981', color: '#04131d', fontWeight: 700, fontSize: 13, textDecoration: 'none' },
  crossBtnOutline: { padding: '9px 15px', borderRadius: 8, background: '#0f172a', color: '#38bdf8', border: '1px solid #334155', fontWeight: 700, fontSize: 13, textDecoration: 'none' },
  sectionPlate: { background: '#0b1120', border: '1px solid #1e293b', borderRadius: 12, padding: '24px 22px', marginBottom: 26 },
  h2: { fontSize: 21, fontWeight: 800, color: '#f8fafc', margin: '0 0 16px 0' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 13.5 },
  trHead: { borderBottom: '1px solid #1e293b', textAlign: 'left', color: '#38bdf8' },
  th: { padding: '10px 12px', fontWeight: 700 },
  trBody: { borderBottom: '1px solid #1e293b' },
  tdTitle: { padding: '11px 12px', fontWeight: 700 },
  td: { padding: '11px 12px', color: '#cbd5e1' },
  tdCyan: { padding: '11px 12px', color: '#38bdf8', fontWeight: 700 },
  tdRed: { padding: '11px 12px', color: '#f87171', fontWeight: 700 },
  tableLink: { color: '#f8fafc', textDecoration: 'none' },
  smallActionLink: { color: '#34d399', textDecoration: 'none', fontWeight: 700 },
  filterBar: { display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 20 },
  filterPills: { display: 'flex', flexWrap: 'wrap', gap: 8 },
  pill: { padding: '6px 13px', borderRadius: 999, border: '1px solid #334155', background: '#0f172a', color: '#cbd5e1', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' },
  pillActive: { padding: '6px 13px', borderRadius: 999, border: '1px solid #38bdf8', background: '#38bdf8', color: '#04131d', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' },
  searchInput: { padding: '8px 14px', borderRadius: 8, border: '1px solid #334155', background: '#050811', color: '#f8fafc', fontSize: 13.5, minWidth: 260 },
  cardGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(330px, 1fr))', gap: 18 },
  card: { background: '#0f172a', border: '1px solid #1e293b', borderRadius: 10, padding: 20, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' },
  cardHeaderRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  cardCodeBadge: { fontSize: 11, fontWeight: 800, padding: '3px 8px', borderRadius: 5, background: 'rgba(56, 189, 248, 0.16)', color: '#38bdf8' },
  cardLossBadge: { fontSize: 11, fontWeight: 800, color: '#f87171' },
  cardTitle: { fontSize: 17.5, fontWeight: 800, margin: '0 0 10px 0' },
  cardTitleLink: { color: '#f8fafc', textDecoration: 'none' },
  symptomStrip: { background: '#050811', border: '1px solid #1e293b', borderRadius: 7, padding: '8px 11px', fontSize: 12.5, color: '#38bdf8', marginBottom: 10 },
  cardSummary: { fontSize: 13.5, lineHeight: 1.58, color: '#cbd5e1', margin: 0 },
  cardCtaBtn: { display: 'inline-block', padding: '8px 13px', borderRadius: 7, background: '#38bdf8', color: '#04131d', fontSize: 12.5, fontWeight: 700, textDecoration: 'none' },
  cardOutlineBtn: { display: 'inline-block', padding: '8px 13px', borderRadius: 7, background: '#070b14', color: '#34d399', border: '1px solid #10b981', fontSize: 12.5, fontWeight: 700, textDecoration: 'none' },
  faqList: { display: 'grid', gap: 14 },
  faqItem: { background: '#0f172a', border: '1px solid #1e293b', borderRadius: 10, padding: '16px 18px' },
  faqQ: { fontSize: 16, fontWeight: 700, color: '#f8fafc', margin: '0 0 6px 0' },
  faqA: { fontSize: 14, lineHeight: 1.6, color: '#cbd5e1', margin: 0 },
};
