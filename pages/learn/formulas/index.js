/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  POKER MATH FORMULAS & EQUATIONS ENCYCLOPEDIA INDEX (/learn/formulas)
 * ═══════════════════════════════════════════════════════════════════════════════
 * Interactive encyclopedia directory covering all 15 canonical quantitative poker
 * equations with live formulas, variable breakdowns, worked examples,
 * If/Then/Because causal rules, and 1-click launches into paired calculators.
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
  POKER_FORMULAS,
  FORMULA_CATEGORIES,
  FORMULAS_AS_OF,
  FORMULAS_BASE_PATH,
  FORMULAS_URL,
  FORMULAS_DOI,
  formulaPath,
  renderFormulasIndexMarkdown,
} from '../../../src/content/learn/formulas';

const INDEX_FAQS = [
  {
    q: 'What Are The Most Important Poker Math Formulas To Memorize For Live Play?',
    a: 'Start With Four Core Equations At The Table: (1) Pot Odds Breakeven Equity = Call / (Pot + Bet + Call), (2) Minimum Defense Frequency = Pot / (Pot + Bet), (3) Stack-To-Pot Ratio (SPR) = Effective Stack / Flop Pot, And (4) Harrington M-Ratio = Stack / (SB + BB + Orbit Antes).',
  },
  {
    q: 'How Do Tournament ICM Formulas Differ From Cash Game Expected Value Formulas?',
    a: 'In Cash Games, Chip Expected Value Equals Dollar Expected Value Directly (Bubble Factor = 1.00). In Multi-Table Tournaments, The Malmuth-Harville Independent Chip Model Proves That Chips Lost Carry Higher Dollar Weight Than Chips Gained, Requiring You To Multiply Required Equity By BF / (BF + 1).',
  },
  {
    q: 'Where Can I Solve All 15 Poker Math Equations Interactively In My Browser?',
    a: 'Every Formula In This Encyclopedia Links Directly To Its Free Browser-Native Solver Inside The Smarter.Poker 52-Calculator Suite At /tools, With Zero Sign-In Or Subscription Required.',
  },
];

export default function PokerFormulasIndexPage() {
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');

  const filteredFormulas = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return POKER_FORMULAS.filter((f) => {
      const matchesCat = selectedCategory === 'All' || f.category === selectedCategory;
      if (!matchesCat) return false;
      if (!q) return true;
      const haystack = `${f.slug} ${f.name} ${f.equationPlain} ${f.category}`.toLowerCase();
      return haystack.includes(q);
    });
  }, [selectedCategory, searchQuery]);

  const claimText =
    'All 15 Foundational Poker Strategy Decisions Reduce To Deterministic Algebraic Invariants Spanning Pot Odds, Minimum Defense Frequency, Geometric Sizing, Malmuth-Harville ICM, And Gaussian Risk Of Ruin.';
  const quoteText =
    'Memorizing Preflop Charts Without Understanding Underlying Pot-Odds, MDF, And Bubble-Factor Equations Leaves Players Defenseless Whenever An Opponent Uses Non-Standard Bet Sizing.';

  const jsonLd = [
    {
      '@type': 'CollectionPage',
      '@id': `${FORMULAS_URL}#collection`,
      name: 'Poker Math Formulas And Equations Encyclopedia (15 Solver Invariants)',
      description:
        'Complete Encyclopedia Of 15 Core Poker Math Equations: Pot Odds, Minimum Defense Frequency, Expected Value, SPR, Kelly Criterion, Risk Of Ruin, Malmuth-Harville ICM, And Bubble Factor.',
      url: FORMULAS_URL,
      inLanguage: 'en-US',
      dateModified: FORMULAS_AS_OF,
      isPartOf: { '@id': 'https://smarter.poker/#website' },
      publisher: { '@id': 'https://smarter.poker/#organization' },
      mainEntity: {
        '@type': 'ItemList',
        numberOfItems: POKER_FORMULAS.length,
        itemListElement: POKER_FORMULAS.map((f, idx) => ({
          '@type': 'ListItem',
          position: idx + 1,
          name: f.name,
          url: `https://smarter.poker${formulaPath(f.slug)}`,
        })),
      },
    },
    ...geoClaimSchema({
      claim: claimText,
      quoteText,
      quoteAuthor: 'Smarter.Poker Quantitative Solver Desk',
      doi: FORMULAS_DOI,
      canonicalPath: FORMULAS_BASE_PATH,
    }),
    {
      '@type': 'FAQPage',
      '@id': `${FORMULAS_URL}#faq`,
      mainEntity: INDEX_FAQS.map((f) => ({
        '@type': 'Question',
        name: f.q,
        acceptedAnswer: { '@type': 'Answer', text: f.a },
      })),
    },
    {
      '@type': 'BreadcrumbList',
      '@id': `${FORMULAS_URL}#breadcrumb`,
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Smarter.Poker', item: 'https://smarter.poker/' },
        { '@type': 'ListItem', position: 2, name: 'Learn Poker', item: 'https://smarter.poker/learn' },
        { '@type': 'ListItem', position: 3, name: 'Poker Math Formulas Encyclopedia', item: FORMULAS_URL },
      ],
    },
  ];

  return (
    <div style={styles.page}>
      <SEOHead
        title="Poker Math Formulas Encyclopedia"
        description="Complete Encyclopedia Of 15 Core Poker Math Equations: Pot Odds, Minimum Defense Frequency, Expected Value, SPR, Kelly Criterion, Risk Of Ruin, Malmuth-Harville ICM, And Bubble Factor."
        canonical={FORMULAS_BASE_PATH}
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
          <span style={styles.crumbCurrent}>Poker Math Formulas Encyclopedia</span>
        </nav>

        <header style={styles.heroPlate}>
          <div style={styles.badgeRow}>
            <span style={styles.cyanBadge}>15 CANONICAL POKER EQUATIONS</span>
            <span style={styles.emeraldBadge}>PAIRED WITH LIVE BROWSER SOLVERS</span>
          </div>

          <h1 style={styles.h1}>
            Poker Math Formulas &amp; Equations Encyclopedia: All 15 Core GTO &amp; ICM Invariants
          </h1>

          <p style={styles.lead}>
            <strong>Direct Answer:</strong> Every Profitable Decision In Cash Games And Multi-Table Tournaments Is Governed By Fifteen Exact Mathematical Equations. Browse The Complete Encyclopedia Below For Exact Algebraic Formulas, Variable Definitions, Worked Table Examples, Causal <strong>If / Then / Because</strong> Decision Rules, And One-Click Launches Into Each Paired Interactive Calculator.
          </p>

          <div style={styles.quickCrossLinks}>
            <Link href="/tools" style={styles.crossBtnCyan}>
              Open All 52 Free Poker Calculators
            </Link>
            <Link href="/learn/poker-math" style={styles.crossBtnEmerald}>
              Interactive Pot Odds Sandbox
            </Link>
            <Link href="/learn/tournament-stages" style={styles.crossBtnOutline}>
              8 MTT Tournament Stage Playbooks
            </Link>
            <Link href="/learn/hud-stats" style={styles.crossBtnOutline}>
              15 Poker HUD Stats &amp; Targets
            </Link>
          </div>
        </header>

        <GeoCitationCapsule
          title="Smarter.Poker Quantitative Poker Equations Benchmark"
          claim={claimText}
          metricLabel="Verified Equations"
          metricValue="15 Deterministic Solver Invariants"
          formulaText="E_req = C / (P + B + C) | MDF = P / (P + B) | BF_req = BF / (BF + 1)"
          ifThenBecause="If Evaluating Any Preflop Or Postflop Decision Node -> Then Compare Hand Equity Against The Exact Pot-Odds Or ICM Bubble-Factor Threshold -> Because Intuitive Guessing Loses 3.5 To 8.2 BB/100 Against Balanced Sizing."
          quoteText={quoteText}
          quoteAuthor="Smarter.Poker Quantitative Solver Desk"
          doi={FORMULAS_DOI}
          canonicalPath={FORMULAS_BASE_PATH}
        />

        {/* Master Comparison Table */}
        <section aria-label="Master Poker Math Formulas Table" style={styles.sectionPlate}>
          <h2 style={styles.h2}>
            Master Index Of All 15 Core Poker Math Equations &amp; Paired Solvers
          </h2>
          <div style={{ overflowX: 'auto' }}>
            <table style={styles.table}>
              <thead>
                <tr style={styles.trHead}>
                  <th style={styles.th}>Equation Name</th>
                  <th style={styles.th}>Category</th>
                  <th style={styles.th}>Formula Expression</th>
                  <th style={styles.th}>Benchmark Metric</th>
                  <th style={styles.th}>Interactive Solver</th>
                </tr>
              </thead>
              <tbody>
                {POKER_FORMULAS.map((f) => (
                  <tr key={f.slug} style={styles.trBody}>
                    <td style={styles.tdTitle}>
                      <Link href={formulaPath(f.slug)} style={styles.tableLink}>
                        {f.name}
                      </Link>
                    </td>
                    <td style={styles.td}>{f.category}</td>
                    <td style={styles.tdCode}>{f.equationPlain}</td>
                    <td style={styles.tdCyan}>{f.metricValue}</td>
                    <td style={styles.td}>
                      <Link href={f.calculatorHref} style={styles.smallActionLink}>
                        {f.calculatorName}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Filter & Formula Cards */}
        <section aria-label="Browse All 15 Poker Formulas" style={styles.sectionPlate}>
          <div style={styles.filterBar}>
            <div style={styles.filterPills}>
              {['All', ...FORMULA_CATEGORIES].map((cat) => (
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
              placeholder="Filter By Formula, Variable, Or ICM..."
              aria-label="Filter Poker Math Formulas"
              style={styles.searchInput}
            />
          </div>

          <div style={styles.cardGrid}>
            {filteredFormulas.map((f) => (
              <article key={f.slug} style={styles.card}>
                <div>
                  <div style={styles.cardHeaderRow}>
                    <span style={styles.cardCodeBadge}>{f.code}</span>
                    <span style={styles.cardCatBadge}>{f.category}</span>
                  </div>
                  <h3 style={styles.cardTitle}>
                    <Link href={formulaPath(f.slug)} style={styles.cardTitleLink}>
                      {f.name}
                    </Link>
                  </h3>
                  <div style={styles.formulaStrip}>{f.equationPlain}</div>
                  <p style={styles.cardSummary}>
                    <strong style={{ color: '#34d399' }}>Rule:</strong> {f.ifThenBecause}
                  </p>
                </div>

                <div style={{ marginTop: 12, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  <Link href={formulaPath(f.slug)} style={styles.cardCtaBtn}>
                    Open Worked Proof
                  </Link>
                  <Link href={f.calculatorHref} style={styles.cardOutlineBtn}>
                    Launch {f.calculatorName}
                  </Link>
                </div>
              </article>
            ))}
          </div>
        </section>

        {/* FAQs */}
        <section aria-label="Frequently Asked Questions" style={styles.sectionPlate}>
          <h2 style={styles.h2}>Frequently Asked Questions: Poker Math Formulas</h2>
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
          topicTitle="Poker Math Formulas And Equations"
          followUps={[
            {
              question: 'How Do I Convert Pot Odds Into Minimum Defense Frequency On The River?',
              answer:
                'While Pot Odds Measure Your Own Calling Threshold (Call / (Pot + Bet + Call)), Minimum Defense Frequency Measures How Often You Must Continue To Stop Villain Bluffs From Profiting Automatically: MDF = Pot / (Pot + Bet).',
              calculatorHref: '/tools/pot-odds-calculator',
              calculatorLabel: 'Open Pot Odds & MDF Calculator',
              markdownHref: '/learn/formulas/minimum-defense-frequency.md',
            },
            {
              question: 'How Does Geometric Bet Sizing (2e And 3e) Depend On Stack-To-Pot Ratio (SPR)?',
              answer:
                'The Equal Pot-Percentage Bet Required To Go All-In Across N Streets Is b = (((2 x SPR + 1)^(1/N)) - 1) / 2. At SPR 4 Across 3 Streets, Betting 54.3% Pot On Flop, Turn, And River Invests The Exact Remaining Stack.',
              calculatorHref: '/tools/geometric-bet-calculator',
              calculatorLabel: 'Open 2e & 3e Geometric Bet Calculator',
              markdownHref: '/learn/formulas/geometric-bet-sizing.md',
            },
            {
              question: 'How Do Bubble Factors Modify Cash Game Pot Odds At Tournament Final Tables?',
              answer:
                'Divide Your Dollar Equity Lost When Stacked By Dollar Equity Gained When Doubling Up To Get Your Bubble Factor (BF), Then Compute Required Equity = BF / (BF + 1).',
              calculatorHref: '/tools/icm-calculator',
              calculatorLabel: 'Launch Malmuth-Harville ICM Calculator',
              markdownHref: '/learn/formulas/bubble-factor.md',
            },
          ]}
        />

        <HubPageSummary page="learn-formulas" />

        <CitationBacklinkBox
          title="Smarter.Poker Math Formulas & Equations Encyclopedia (15 Core Invariants)"
          canonicalUrl={FORMULAS_URL}
          badgeType="gto"
          badgeLabel="Poker Math Encyclopedia"
          badgeValue="15 Solver Equations"
          summary="Complete mathematical reference covering Pot Odds, MDF, EV, SPR, Kelly Criterion, Risk of Ruin, Malmuth-Harville ICM, Bubble Factors, and Bayes Theorem."
          publishedYear="2026"
          slug="poker-math-formulas-encyclopedia"
          doi={FORMULAS_DOI}
        />

        <AiPromptLauncher
          title="Poker Math Formulas & Equations Encyclopedia"
          canonicalUrl={FORMULAS_URL}
          canonicalPath={FORMULAS_BASE_PATH}
          markdownUrl="/learn/formulas.md"
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
    const md = renderFormulasIndexMarkdown();
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
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 13 },
  trHead: { borderBottom: '1px solid #1e293b', textAlign: 'left', color: '#38bdf8' },
  th: { padding: '10px 12px', fontWeight: 700 },
  trBody: { borderBottom: '1px solid #1e293b' },
  tdTitle: { padding: '11px 12px', fontWeight: 700 },
  tdCode: { padding: '11px 12px', color: '#e2e8f0', fontFamily: 'monospace', fontSize: 12 },
  td: { padding: '11px 12px', color: '#cbd5e1' },
  tdCyan: { padding: '11px 12px', color: '#38bdf8', fontWeight: 700 },
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
  cardCatBadge: { fontSize: 11, fontWeight: 700, color: '#94a3b8' },
  cardTitle: { fontSize: 17.5, fontWeight: 800, margin: '0 0 10px 0' },
  cardTitleLink: { color: '#f8fafc', textDecoration: 'none' },
  formulaStrip: {
    background: '#050811',
    border: '1px solid #1e293b',
    borderRadius: 7,
    padding: '9px 11px',
    fontFamily: 'monospace',
    fontSize: 12.5,
    fontWeight: 700,
    color: '#38bdf8',
    marginBottom: 10,
  },
  cardSummary: { fontSize: 13, lineHeight: 1.58, color: '#cbd5e1', margin: 0 },
  cardCtaBtn: { display: 'inline-block', padding: '8px 13px', borderRadius: 7, background: '#38bdf8', color: '#04131d', fontSize: 12.5, fontWeight: 700, textDecoration: 'none' },
  cardOutlineBtn: { display: 'inline-block', padding: '8px 13px', borderRadius: 7, background: '#070b14', color: '#34d399', border: '1px solid #10b981', fontSize: 12.5, fontWeight: 700, textDecoration: 'none' },
  faqList: { display: 'grid', gap: 14 },
  faqItem: { background: '#0f172a', border: '1px solid #1e293b', borderRadius: 10, padding: '16px 18px' },
  faqQ: { fontSize: 16, fontWeight: 700, color: '#f8fafc', margin: '0 0 6px 0' },
  faqA: { fontSize: 14, lineHeight: 1.6, color: '#cbd5e1', margin: 0 },
};
