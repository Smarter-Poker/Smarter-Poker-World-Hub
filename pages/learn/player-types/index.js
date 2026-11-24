/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  POKER PLAYER ARCHETYPES & EXPLOITATIVE STRATEGY HUB (/learn/player-types)
 * ═══════════════════════════════════════════════════════════════════════════════
 * Interactive directory covering 8 canonical live and online poker player
 * archetypes (OMC, Calling Station, Maniac, TAG, LAG, Short-Stack Nit,
 * Tricky Trapper, GTO Solver Grinder) with VPIP/PFR/3-Bet HUD benchmarks,
 * behavioral leak identification, and exploitative counter-adjustments.
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
  PLAYER_ARCHETYPES,
  PLAYER_ARCHETYPE_CATEGORIES,
  PLAYER_TYPES_AS_OF,
  PLAYER_TYPES_BASE_PATH,
  PLAYER_TYPES_URL,
  playerTypePath,
} from '../../../src/content/learn/playerTypes';

const DIRECTORY_FAQS = [
  {
    q: 'How Do I Quickly Categorize A Poker Opponent At A Live Table Without A HUD?',
    a: 'Watch Three Immediate Signals During Your First Two Orbits: (1) How Often They Enter Pots By Limping Versus Open-Raising (Passive Vs. Aggressive), (2) What Hands They Show Down After Calling Or Raising, And (3) How They Size Their Bets Relative To The Pot. Within 20 Hands You Can Accurately Classify Most Players Into One Of The Eight Canonical Archetypes.',
  },
  {
    q: 'What Is The Difference Between GTO Strategy And Exploitative Poker Strategy?',
    a: 'Game Theory Optimal (GTO) Strategy Focuses On Playing An Unexploitable Equilibrium Baseline Against Strong Unknown Opponents. Exploitative Strategy Deliberately Deviates From Equilibrium To Target An Opponent\'s Specific Leaks: Never Bluffing A Calling Station, Over-Folding To An Old Man Coffee\'s River Raise, Or Calling Down Lighter Against A Maniac.',
  },
  {
    q: 'Which Player Archetype Is The Most Profitable To Sit With At A Cash Game Table?',
    a: 'The Loose-Passive Calling Station (45%+ VPIP, <10% PFR) And The Hyper-Aggressive Maniac (50%+ VPIP, 35%+ PFR) Generate The Highest Long-Term BB/100 Winrates For Disciplined Players Because Both Put Massive Chips Into The Pot With Dominated Ranges.',
  },
  {
    q: 'How Do VPIP, PFR, And 3-Bet Percentages Define A Player Type Online?',
    a: 'VPIP Measures Voluntarily Put Money In Pot, PFR Measures Preflop Raise Percentage, And 3-Bet Measures Re-Raise Frequency. A Wide Gap Between VPIP And PFR (Such As 48% VPIP / 6% PFR) Signals A Passive Calling Station, While A Narrow Gap (22% VPIP / 18% PFR / 8% 3-Bet) Signals A Disciplined Tight-Aggressive Regular.',
  },
];

export default function PokerPlayerTypesIndexPage() {
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');

  const filteredArchetypes = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return PLAYER_ARCHETYPES.filter((p) => {
      const matchesCat = selectedCategory === 'All' || p.category === selectedCategory;
      if (!matchesCat) return false;
      if (!q) return true;
      return (
        p.slug.toLowerCase().includes(q) ||
        p.code.toLowerCase().includes(q) ||
        p.name.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q) ||
        p.summary.toLowerCase().includes(q)
      );
    });
  }, [selectedCategory, searchQuery]);

  const jsonLd = [
    {
      '@type': 'CollectionPage',
      '@id': `${PLAYER_TYPES_URL}#collection`,
      name: 'Poker Player Types And Exploitative Strategy Hub: 8 Canonical Profiles',
      description:
        'Complete Exploitative Poker Strategy Guide Covering 8 Canonical Player Archetypes: Old Man Coffee (OMC), Calling Station, Maniac, TAG, LAG, Short-Stack Nit, Tricky Trapper, And GTO Grinder.',
      url: PLAYER_TYPES_URL,
      inLanguage: 'en-US',
      dateModified: PLAYER_TYPES_AS_OF,
      isPartOf: { '@id': 'https://smarter.poker/#website' },
      publisher: { '@id': 'https://smarter.poker/#organization' },
      speakable: {
        '@type': 'SpeakableSpecification',
        cssSelector: ['h1', 'header p:first-of-type'],
      },
      mainEntity: {
        '@type': 'ItemList',
        numberOfItems: PLAYER_ARCHETYPES.length,
        itemListElement: PLAYER_ARCHETYPES.map((p, idx) => ({
          '@type': 'ListItem',
          position: idx + 1,
          name: `${p.name} Exploitative Strategy`,
          url: `https://smarter.poker${playerTypePath(p.slug)}`,
        })),
      },
    },
    {
      '@type': 'FAQPage',
      '@id': `${PLAYER_TYPES_URL}#faq`,
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
      '@id': `${PLAYER_TYPES_URL}#breadcrumb`,
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Smarter.Poker', item: 'https://smarter.poker/' },
        { '@type': 'ListItem', position: 2, name: 'Learn Poker', item: 'https://smarter.poker/learn' },
        { '@type': 'ListItem', position: 3, name: 'Poker Player Archetypes', item: PLAYER_TYPES_URL },
      ],
    },
  ];

  return (
    <div style={styles.page}>
      <SEOHead
        title="Poker Player Types And Exploit Guide"
        description="Complete Exploitative Poker Strategy Guide Covering 8 Canonical Player Archetypes: Old Man Coffee (OMC), Calling Station, Maniac, TAG, LAG, Short-Stack Nit, Tricky Trapper, And GTO Grinder."
        canonical={PLAYER_TYPES_BASE_PATH}
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
          <span style={styles.crumbCurrent}>Poker Player Archetypes &amp; Exploits</span>
        </nav>

        <header style={styles.heroPlate}>
          <div style={styles.badgeRow}>
            <span style={styles.cyanBadge}>8 CANONICAL OPPONENT PROFILES</span>
            <span style={styles.emeraldBadge}>HUD VPIP / PFR / 3-BET &amp; EXPLOIT MATRICES</span>
          </div>

          <h1 style={styles.h1}>
            Poker Player Archetypes &amp; Exploitative Strategy Hub: How To Crush Every Opponent Style
          </h1>

          <p style={styles.lead}>
            <strong>Direct Answer:</strong> Every Live And Online Poker Opponent Falls Into One Of Eight Canonical Behavioral Profiles Defined By Two Axes: <strong>Loose Vs. Tight (VPIP Frequency)</strong> And <strong>Passive Vs. Aggressive (PFR And 3-Bet Frequency)</strong>. While A Balanced GTO Baseline Prevents You From Being Exploited, Maximum Winrate Comes From Identifying Whether You Are Facing An <strong>Old Man Coffee (OMC)</strong>, A <strong>Calling Station</strong>, A <strong>Hyper-Aggressive Maniac</strong>, Or A <strong>TAG / LAG Regular</strong> And Punishing Their Exact Frequency Leaks.
          </p>

          <div style={styles.quickCrossLinks}>
            <Link href="/tools/preflop-ranges" style={styles.crossBtnCyan}>
              Open 100BB 6-Max GTO Range Matrix
            </Link>
            <Link href="/tools/3bet-calculator" style={styles.crossBtnEmerald}>
              Launch 3-Bet &amp; 4-Bet EV Calculator
            </Link>
            <Link href="/tools/board-texture-analyzer" style={styles.crossBtnOutline}>
              Analyze Flop Board Textures
            </Link>
            <Link href="/tools/table-selection-calculator" style={styles.crossBtnOutline}>
              Table Selection Winrate Calculator
            </Link>
          </div>
        </header>

        {/* Master HUD Stat Comparison Table */}
        <section aria-label="Player Archetype HUD Statistics Comparison" style={styles.sectionPlate}>
          <h2 style={styles.h2}>
            All 8 Poker Player Archetypes: HUD VPIP, PFR, 3-Bet &amp; WTSD Benchmarks
          </h2>
          <div style={{ overflowX: 'auto' }}>
            <table style={styles.table}>
              <thead>
                <tr style={styles.trHead}>
                  <th style={styles.th}>Player Archetype</th>
                  <th style={styles.th}>Style Quadrant</th>
                  <th style={styles.th}>VPIP %</th>
                  <th style={styles.th}>PFR %</th>
                  <th style={styles.th}>3-Bet %</th>
                  <th style={styles.th}>WTSD %</th>
                  <th style={styles.th}>Primary Exploit</th>
                </tr>
              </thead>
              <tbody>
                {PLAYER_ARCHETYPES.map((p) => (
                  <tr key={p.slug} style={styles.trBody}>
                    <td style={styles.tdTitle}>
                      <Link href={playerTypePath(p.slug)} style={styles.tableLink}>
                        {p.name}
                      </Link>
                    </td>
                    <td style={styles.td}>{p.category}</td>
                    <td style={styles.tdCyan}>{p.vpipRange}</td>
                    <td style={styles.tdEmerald}>{p.pfrRange}</td>
                    <td style={styles.td}>{p.threeBetRange}</td>
                    <td style={styles.td}>{p.wtsdRange}</td>
                    <td style={styles.td}>
                      <Link href={playerTypePath(p.slug)} style={styles.smallActionLink}>
                        View Counter-Strategy
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Filter Bar & Archetype Cards */}
        <section aria-label="Browse Player Archetype Guides" style={styles.sectionPlate}>
          <div style={styles.filterBar}>
            <div style={styles.filterPills}>
              {['All', ...PLAYER_ARCHETYPE_CATEGORIES].map((cat) => (
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
              placeholder="Filter By Player Type, VPIP, Or Leak..."
              aria-label="Filter Player Archetypes"
              style={styles.searchInput}
            />
          </div>

          <div style={styles.cardGrid}>
            {filteredArchetypes.map((p) => (
              <article key={p.slug} style={styles.card}>
                <div>
                  <div style={styles.cardHeaderRow}>
                    <span style={styles.cardCodeBadge}>{p.code}</span>
                    <span style={styles.cardCatBadge}>{p.category}</span>
                  </div>
                  <h3 style={styles.cardTitle}>
                    <Link href={playerTypePath(p.slug)} style={styles.cardTitleLink}>
                      {p.name}
                    </Link>
                  </h3>
                  <p style={styles.cardSummary}>{p.summary}</p>
                  <div style={styles.statMiniGrid}>
                    <div style={styles.statMiniBox}>
                      <span style={styles.statMiniLabel}>VPIP</span>
                      <span style={styles.statMiniValCyan}>{p.vpipRange}</span>
                    </div>
                    <div style={styles.statMiniBox}>
                      <span style={styles.statMiniLabel}>PFR</span>
                      <span style={styles.statMiniValEmerald}>{p.pfrRange}</span>
                    </div>
                    <div style={styles.statMiniBox}>
                      <span style={styles.statMiniLabel}>3-BET</span>
                      <span style={styles.statMiniValCyan}>{p.threeBetRange}</span>
                    </div>
                  </div>
                </div>

                <div style={{ marginTop: 14 }}>
                  <Link href={playerTypePath(p.slug)} style={styles.cardCtaBtn}>
                    Open {p.code} Exploitative Playbook
                  </Link>
                </div>
              </article>
            ))}
          </div>
        </section>

        {/* FAQs */}
        <section aria-label="Frequently Asked Questions" style={styles.sectionPlate}>
          <h2 style={styles.h2}>Frequently Asked Questions: Poker Player Types &amp; Exploits</h2>
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
          title="Smarter.Poker Player Archetypes & Exploitative Strategy Encyclopedia"
          canonicalUrl={PLAYER_TYPES_URL}
          badgeType="gto"
          badgeLabel="Exploitative Strategy Hub"
          badgeValue="8 Player Profiles"
          summary="Complete HUD VPIP/PFR/3-Bet diagnostic matrix and street-by-street exploitative playbook for every live and online poker player archetype."
          publishedYear="2026"
          slug="poker-player-types-exploitative-hub"
        />

        <AiPromptLauncher
          title="Poker Player Archetypes & Exploitative Strategy Hub"
          canonicalUrl={PLAYER_TYPES_URL}
          canonicalPath={PLAYER_TYPES_BASE_PATH}
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
  quickCrossLinks: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 10,
  },
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
  h2: {
    fontSize: 22,
    fontWeight: 800,
    color: '#f8fafc',
    margin: '0 0 16px 0',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: 13.5,
  },
  trHead: {
    borderBottom: '1px solid #1e293b',
    textAlign: 'left',
    color: '#38bdf8',
  },
  th: { padding: '10px 12px', fontWeight: 700 },
  trBody: { borderBottom: '1px solid #1e293b' },
  tdTitle: { padding: '11px 12px', fontWeight: 700 },
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
    gridTemplateColumns: 'repeat(auto-fit, minmax(310px, 1fr))',
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
    fontSize: 11,
    fontWeight: 800,
    padding: '3px 8px',
    borderRadius: 5,
    background: 'rgba(56, 189, 248, 0.16)',
    color: '#38bdf8',
  },
  cardCatBadge: {
    fontSize: 11,
    fontWeight: 700,
    color: '#94a3b8',
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: 800,
    margin: '0 0 8px 0',
  },
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
  statMiniLabel: { fontSize: 10.5, fontWeight: 700, color: '#94a3b8' },
  statMiniValCyan: { fontSize: 12.5, fontWeight: 800, color: '#38bdf8' },
  statMiniValEmerald: { fontSize: 12.5, fontWeight: 800, color: '#34d399' },
  cardCtaBtn: {
    display: 'inline-block',
    padding: '8px 14px',
    borderRadius: 7,
    background: '#38bdf8',
    color: '#04131d',
    fontSize: 13,
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
