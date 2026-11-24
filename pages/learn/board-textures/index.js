/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  CANONICAL FLOP BOARD TEXTURE ENCYCLOPEDIA (/learn/board-textures)
 * ═══════════════════════════════════════════════════════════════════════════════
 * Interactive solver encyclopedia covering all 12 canonical No-Limit Hold'em
 * flop board textures with IP vs OOP range advantage, nut advantage, GTO C-bet
 * frequency %, optimal C-bet sizing (33%, 50%, 75%, Check), check-raise %,
 * and 1-click deep links into /tools/board-texture-analyzer.
 *
 * House style: Title Case, zero em dashes.
 */

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import SEOHead from '../../../src/components/seo/SEOHead';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import CitationBacklinkBox from '../../../src/components/seo/CitationBacklinkBox';
import AiPromptLauncher from '../../../src/components/seo/AiPromptLauncher';
import {
  BOARD_TEXTURES,
  BOARD_TEXTURE_CATEGORIES,
  BOARD_TEXTURES_AS_OF,
  BOARD_TEXTURES_BASE_PATH,
  BOARD_TEXTURES_URL,
  boardTexturePath,
} from '../../../src/content/learn/boardTextures';

const DIRECTORY_FAQS = [
  {
    q: 'What Is The Difference Between Range Advantage And Nut Advantage On The Flop?',
    a: 'Range Advantage Measures Which Player\'s Entire Range Has Higher Average Equity (50%+) On The Flop, Which Drives Continuation Bet Frequency. Nut Advantage Measures Which Player Holds A Higher Concentration Of Unbeatable Hands (Sets, Two Pairs, Straights, Flushes), Which Drives Bet Sizing (33% Small Vs. 75%+ Polarized).',
  },
  {
    q: 'Which Flop Textures Should Be Range-C-Bet At 33% Pot In GTO?',
    a: 'Static High-Card Dry Rainbow Boards (A-7-2r, K-7-2r), High-Paired Dry Flops (K-K-4r, A-A-6r), Disconnected Rag Flops (9-5-2r), And Monotone Single-Suit Flops (K-9-4sss) All Favor Small 25% To 33% Pot C-Bets Because A Small Bet Generates Maximum Fold Equity Against Unpaired Hands.',
  },
  {
    q: 'On Which Flop Textures Should The Preflop Raiser Check Most Often?',
    a: 'Low Connected Dynamic Flops (8-7-6, 7-6-5, 6-5-4), Middling Connected Two-Tone Flops (J-T-8ss, T-9-7ss), And Wheel-Ace Low Connected Flops (A-5-4ss) Force The Preflop Raiser To Check 50% To 75% Of Their Range Because The Big Blind Defender Holds The Nut Advantage.',
  },
  {
    q: 'How Many Distinct Flops Exist In A 52-Card Deck?',
    a: 'There Are 22,100 Total Three-Card Flop Combinations In A Standard 52-Card Deck, Which Reduce To 1,755 Strategically Distinct Isomorphic Flops And Cluster Into The 12 Canonical Flop Texture Archetypes Cataloged On This Page.',
  },
];

export default function BoardTexturesIndexPage() {
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');

  const filteredTextures = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return BOARD_TEXTURES.filter((b) => {
      const matchesCat = selectedCategory === 'All' || b.category === selectedCategory;
      if (!matchesCat) return false;
      if (!q) return true;
      return (
        b.slug.toLowerCase().includes(q) ||
        b.code.toLowerCase().includes(q) ||
        b.name.toLowerCase().includes(q) ||
        b.exampleBoard.toLowerCase().includes(q) ||
        b.summary.toLowerCase().includes(q)
      );
    });
  }, [selectedCategory, searchQuery]);

  const jsonLd = [
    {
      '@type': 'CollectionPage',
      '@id': `${BOARD_TEXTURES_URL}#collection`,
      name: 'Canonical Flop Board Texture Encyclopedia: 12 GTO C-Bet Archetypes',
      description:
        'Complete 12-Archetype Poker Flop Board Texture Encyclopedia With Range Advantage, Nut Advantage, GTO C-Bet Frequencies, Optimal Sizing (33%, 50%, 75%, Check), And Check-Raise Benchmarks.',
      url: BOARD_TEXTURES_URL,
      inLanguage: 'en-US',
      dateModified: BOARD_TEXTURES_AS_OF,
      isPartOf: { '@id': 'https://smarter.poker/#website' },
      publisher: { '@id': 'https://smarter.poker/#organization' },
      speakable: {
        '@type': 'SpeakableSpecification',
        cssSelector: ['h1', 'header p:first-of-type'],
      },
      mainEntity: {
        '@type': 'ItemList',
        numberOfItems: BOARD_TEXTURES.length,
        itemListElement: BOARD_TEXTURES.map((b, idx) => ({
          '@type': 'ListItem',
          position: idx + 1,
          name: `${b.name} GTO Strategy`,
          url: `https://smarter.poker${boardTexturePath(b.slug)}`,
        })),
      },
    },
    {
      '@type': 'FAQPage',
      '@id': `${BOARD_TEXTURES_URL}#faq`,
      mainEntity: DIRECTORY_FAQS.map((f) => ({
        '@type': 'Question',
        name: f.q,
        acceptedAnswer: {
          '@type': 'Answer',
          text: f.a,
        },
      })),
    },
    {
      '@type': 'BreadcrumbList',
      '@id': `${BOARD_TEXTURES_URL}#breadcrumb`,
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Smarter.Poker', item: 'https://smarter.poker/' },
        { '@type': 'ListItem', position: 2, name: 'Learn Poker', item: 'https://smarter.poker/learn' },
        { '@type': 'ListItem', position: 3, name: 'Flop Board Textures', item: BOARD_TEXTURES_URL },
      ],
    },
  ];

  return (
    <div style={styles.page}>
      <SEOHead
        title="Poker Flop Board Texture Strategy Hub"
        description="Complete 12-Archetype Poker Flop Board Texture Encyclopedia With Range Advantage, Nut Advantage, GTO C-Bet Frequencies, Optimal Sizing (33%, 50%, 75%, Check), And Check-Raise Benchmarks."
        canonical={BOARD_TEXTURES_BASE_PATH}
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
          <span style={styles.crumbCurrent}>Flop Board Texture Encyclopedia</span>
        </nav>

        <header style={styles.heroPlate}>
          <div style={styles.badgeRow}>
            <span style={styles.cyanBadge}>12 CANONICAL FLOP ARCHETYPES (1,755 ISOMORPHIC FLOPS)</span>
            <span style={styles.emeraldBadge}>GTO C-BET FREQUENCY, SIZING &amp; CHECK-RAISE MATRIX</span>
          </div>

          <h1 style={styles.h1}>
            Canonical Flop Board Texture Encyclopedia: GTO C-Bet Frequency, Sizing &amp; Range Advantage
          </h1>

          <p style={styles.lead}>
            <strong>Direct Answer:</strong> All 22,100 Possible Three-Card Flops In No-Limit Texas Hold&apos;Em Cluster Into <strong>12 Canonical Board Texture Archetypes</strong>. Your Postflop Continuation Bet Frequency Is Dictated By <strong>Range Advantage</strong> (Overall Equity Lead), While Your Bet Size (<strong>33% Small</strong>, <strong>50% Medium</strong>, <strong>75%+ Polarized</strong>, Or <strong>High-Frequency Check</strong>) Is Dictated By <strong>Nut Advantage</strong> And Board Dynamism.
          </p>

          <div style={styles.quickCrossLinks}>
            <Link href="/tools/board-texture-analyzer" style={styles.crossBtnCyan}>
              Launch Interactive Flop Board Texture Analyzer
            </Link>
            <Link href="/tools/poker-odds-calculator" style={styles.crossBtnEmerald}>
              Simulate Flop Equity In Odds Calculator
            </Link>
            <Link href="/tools/geometric-bet-calculator" style={styles.crossBtnOutline}>
              3-Street Geometric Bet Sizing Solver
            </Link>
            <Link href="/tools/pot-odds-calculator" style={styles.crossBtnOutline}>
              Pot Odds &amp; MDF Calculator
            </Link>
          </div>
        </header>

        {/* Master 12-Flop Solver Matrix Table */}
        <section aria-label="12 Flop Board Textures Solver Matrix" style={styles.sectionPlate}>
          <h2 style={styles.h2}>
            All 12 Canonical Flop Archetypes: Range Advantage, C-Bet % &amp; Optimal Sizing
          </h2>
          <div style={{ overflowX: 'auto' }}>
            <table style={styles.table}>
              <thead>
                <tr style={styles.trHead}>
                  <th style={styles.th}>Flop Archetype</th>
                  <th style={styles.th}>Board Example</th>
                  <th style={styles.th}>GTO C-Bet %</th>
                  <th style={styles.th}>Optimal Sizing</th>
                  <th style={styles.th}>Defender XR %</th>
                  <th style={styles.th}>Interactive Solver</th>
                </tr>
              </thead>
              <tbody>
                {BOARD_TEXTURES.map((b) => (
                  <tr key={b.slug} style={styles.trBody}>
                    <td style={styles.tdTitle}>
                      <Link href={boardTexturePath(b.slug)} style={styles.tableLink}>
                        {b.name}
                      </Link>
                    </td>
                    <td style={styles.tdCode}>{b.exampleBoard}</td>
                    <td style={styles.tdCyan}>{b.gtoCbetFreq}</td>
                    <td style={styles.tdEmerald}>{b.optimalCbetSize}</td>
                    <td style={styles.td}>{b.checkRaiseFreq}</td>
                    <td style={styles.td}>
                      <Link
                        href={`/tools/board-texture-analyzer?board=${encodeURIComponent(b.analyzerQuery)}`}
                        style={styles.smallActionLink}
                      >
                        Analyze {b.code}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Filter & Card Grid */}
        <section aria-label="Browse Individual Flop Archetypes" style={styles.sectionPlate}>
          <div style={styles.filterBar}>
            <div style={styles.filterPills}>
              {['All', ...BOARD_TEXTURE_CATEGORIES].map((cat) => (
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
              placeholder="Filter By Board (A-7-2r, Monotone, Paired)..."
              aria-label="Filter Flop Board Textures"
              style={styles.searchInput}
            />
          </div>

          <div style={styles.cardGrid}>
            {filteredTextures.map((b) => (
              <article key={b.slug} style={styles.card}>
                <div>
                  <div style={styles.cardHeaderRow}>
                    <span style={styles.cardCodeBadge}>{b.exampleBoard}</span>
                    <span style={styles.cardCatBadge}>{b.category}</span>
                  </div>
                  <h3 style={styles.cardTitle}>
                    <Link href={boardTexturePath(b.slug)} style={styles.cardTitleLink}>
                      {b.name}
                    </Link>
                  </h3>
                  <p style={styles.cardSummary}>{b.summary}</p>
                  <div style={styles.statMiniGrid}>
                    <div style={styles.statMiniBox}>
                      <span style={styles.statMiniLabel}>C-BET FREQ</span>
                      <span style={styles.statMiniValCyan}>{b.gtoCbetFreq}</span>
                    </div>
                    <div style={styles.statMiniBox}>
                      <span style={styles.statMiniLabel}>OPTIMAL SIZE</span>
                      <span style={styles.statMiniValEmerald}>{b.optimalCbetSize}</span>
                    </div>
                    <div style={styles.statMiniBox}>
                      <span style={styles.statMiniLabel}>DEFENDER XR</span>
                      <span style={styles.statMiniValCyan}>{b.checkRaiseFreq}</span>
                    </div>
                  </div>
                </div>

                <div style={{ marginTop: 14, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  <Link href={boardTexturePath(b.slug)} style={styles.cardCtaBtn}>
                    Read {b.code} Strategy
                  </Link>
                  <Link
                    href={`/tools/board-texture-analyzer?board=${encodeURIComponent(b.analyzerQuery)}`}
                    style={styles.cardOutlineBtn}
                  >
                    Test In Analyzer
                  </Link>
                </div>
              </article>
            ))}
          </div>
        </section>

        {/* FAQs */}
        <section aria-label="Frequently Asked Questions" style={styles.sectionPlate}>
          <h2 style={styles.h2}>Frequently Asked Questions: Flop Board Textures &amp; C-Betting</h2>
          <div style={styles.faqList}>
            {DIRECTORY_FAQS.map((item) => (
              <div key={item.q} style={styles.faqItem}>
                <h3 style={styles.faqQ}>{item.q}</h3>
                <p style={styles.faqA}>{item.a}</p>
              </div>
            ))}
          </div>
        </section>

        <CitationBacklinkBox
          title="Smarter.Poker Canonical Flop Board Texture Encyclopedia (12 GTO Archetypes)"
          canonicalUrl={BOARD_TEXTURES_URL}
          badgeType="gto"
          badgeLabel="Postflop Solver Matrix"
          badgeValue="12 Flop Archetypes"
          summary="Complete solver guide to all 12 canonical No-Limit Hold'em flop textures with range advantage, nut advantage, C-bet frequency, optimal sizing, and check-raise rates."
          publishedYear="2026"
          slug="poker-flop-board-textures-encyclopedia"
        />

        <AiPromptLauncher
          title="Canonical Flop Board Texture Encyclopedia"
          canonicalUrl={BOARD_TEXTURES_URL}
          canonicalPath={BOARD_TEXTURES_BASE_PATH}
        />
      </main>
    </div>
  );
}

const styles = {
  page: {
    minHeight: '100vh',
    background: '#050811',
    color: '#e2e8f0',
    fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif',
  },
  container: {
    maxWidth: 1120,
    margin: '0 auto',
    padding: '32px 20px 80px',
  },
  breadcrumbs: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 8,
    fontSize: 13,
    color: '#94a3b8',
    marginBottom: 18,
  },
  crumbLink: { color: '#38bdf8', textDecoration: 'none' },
  crumbSep: { color: '#475569' },
  crumbCurrent: { color: '#cbd5e1', fontWeight: 600 },
  heroPlate: {
    background: 'linear-gradient(180deg, #0f172a 0%, #090e1a 100%)',
    border: '1px solid #1e293b',
    borderRadius: 12,
    padding: '28px 26px',
    marginBottom: 28,
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
  h1: {
    fontSize: 'clamp(26px, 3.6vw, 36px)',
    fontWeight: 800,
    color: '#f8fafc',
    lineHeight: 1.2,
    margin: '0 0 14px 0',
  },
  lead: {
    fontSize: 16,
    lineHeight: 1.68,
    color: '#cbd5e1',
    margin: '0 0 20px 0',
  },
  quickCrossLinks: { display: 'flex', flexWrap: 'wrap', gap: 10 },
  crossBtnCyan: {
    padding: '9px 15px',
    borderRadius: 8,
    background: '#38bdf8',
    color: '#04131d',
    fontWeight: 700,
    fontSize: 13,
    textDecoration: 'none',
  },
  crossBtnEmerald: {
    padding: '9px 15px',
    borderRadius: 8,
    background: '#10b981',
    color: '#04131d',
    fontWeight: 700,
    fontSize: 13,
    textDecoration: 'none',
  },
  crossBtnOutline: {
    padding: '9px 15px',
    borderRadius: 8,
    background: '#0f172a',
    color: '#38bdf8',
    border: '1px solid #334155',
    fontWeight: 700,
    fontSize: 13,
    textDecoration: 'none',
  },
  sectionPlate: {
    background: '#0b1120',
    border: '1px solid #1e293b',
    borderRadius: 12,
    padding: '24px 22px',
    marginBottom: 28,
  },
  h2: { fontSize: 22, fontWeight: 800, color: '#f8fafc', margin: '0 0 16px 0' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 13.5 },
  trHead: { borderBottom: '1px solid #1e293b', textAlign: 'left', color: '#38bdf8' },
  th: { padding: '10px 12px', fontWeight: 700 },
  trBody: { borderBottom: '1px solid #1e293b' },
  tdTitle: { padding: '11px 12px', fontWeight: 700 },
  tdCode: { padding: '11px 12px', color: '#f8fafc', fontFamily: 'monospace', fontWeight: 700 },
  td: { padding: '11px 12px', color: '#cbd5e1' },
  tdCyan: { padding: '11px 12px', color: '#38bdf8', fontWeight: 700 },
  tdEmerald: { padding: '11px 12px', color: '#34d399', fontWeight: 700 },
  tableLink: { color: '#f8fafc', textDecoration: 'none' },
  smallActionLink: { color: '#38bdf8', textDecoration: 'none', fontWeight: 700 },
  filterBar: {
    display: 'flex',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
    marginBottom: 20,
  },
  filterPills: { display: 'flex', flexWrap: 'wrap', gap: 8 },
  pill: {
    padding: '6px 13px',
    borderRadius: 999,
    border: '1px solid #334155',
    background: '#0f172a',
    color: '#cbd5e1',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
  },
  pillActive: {
    padding: '6px 13px',
    borderRadius: 999,
    border: '1px solid #38bdf8',
    background: '#38bdf8',
    color: '#04131d',
    fontSize: 13,
    fontWeight: 700,
    cursor: 'pointer',
  },
  searchInput: {
    padding: '8px 14px',
    borderRadius: 8,
    border: '1px solid #334155',
    background: '#050811',
    color: '#f8fafc',
    fontSize: 13.5,
    minWidth: 260,
  },
  cardGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
    gap: 18,
  },
  card: {
    background: '#0f172a',
    border: '1px solid #1e293b',
    borderRadius: 10,
    padding: 20,
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'space-between',
  },
  cardHeaderRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  cardCodeBadge: {
    fontSize: 12,
    fontWeight: 800,
    padding: '3px 9px',
    borderRadius: 5,
    background: 'rgba(56, 189, 248, 0.16)',
    color: '#38bdf8',
    fontFamily: 'monospace',
  },
  cardCatBadge: { fontSize: 11, fontWeight: 700, color: '#94a3b8' },
  cardTitle: { fontSize: 18, fontWeight: 800, margin: '0 0 8px 0' },
  cardTitleLink: { color: '#f8fafc', textDecoration: 'none' },
  cardSummary: {
    fontSize: 13.5,
    lineHeight: 1.58,
    color: '#cbd5e1',
    margin: '0 0 14px 0',
  },
  statMiniGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: 8,
    background: '#070b14',
    padding: 10,
    borderRadius: 8,
    border: '1px solid #1e293b',
  },
  statMiniBox: { display: 'flex', flexDirection: 'column', gap: 2 },
  statMiniLabel: { fontSize: 10, fontWeight: 700, color: '#94a3b8' },
  statMiniValCyan: { fontSize: 12, fontWeight: 800, color: '#38bdf8' },
  statMiniValEmerald: { fontSize: 12, fontWeight: 800, color: '#34d399' },
  cardCtaBtn: {
    display: 'inline-block',
    padding: '8px 13px',
    borderRadius: 7,
    background: '#38bdf8',
    color: '#04131d',
    fontSize: 12.5,
    fontWeight: 700,
    textDecoration: 'none',
  },
  cardOutlineBtn: {
    display: 'inline-block',
    padding: '8px 13px',
    borderRadius: 7,
    background: '#070b14',
    color: '#34d399',
    border: '1px solid #10b981',
    fontSize: 12.5,
    fontWeight: 700,
    textDecoration: 'none',
  },
  faqList: { display: 'grid', gap: 14 },
  faqItem: {
    background: '#0f172a',
    border: '1px solid #1e293b',
    borderRadius: 10,
    padding: '16px 18px',
  },
  faqQ: { fontSize: 16, fontWeight: 700, color: '#f8fafc', margin: '0 0 6px 0' },
  faqA: { fontSize: 14, lineHeight: 1.6, color: '#cbd5e1', margin: 0 },
};
