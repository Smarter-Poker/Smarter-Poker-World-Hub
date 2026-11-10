/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  POKER HAND VS HAND MATCHUP ODDS DIRECTORY (/learn/matchups)
 * ═══════════════════════════════════════════════════════════════════════════════
 * Interactive directory covering 25 canonical preflop hand-vs-hand matchups in
 * No-Limit Texas Hold'em with combinatorics, flop texture shifts, and stack-off
 * thresholds.
 *
 * House style: Title Case, zero em dashes.
 */

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import SEOHead from '../../../src/components/seo/SEOHead';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import CitationBacklinkBox from '../../../src/components/seo/CitationBacklinkBox';
import {
  HAND_MATCHUPS,
  MATCHUP_CATEGORIES,
  MATCHUPS_AS_OF,
  MATCHUPS_BASE_PATH,
  MATCHUPS_URL,
  matchupPath,
} from '../../../src/content/learn/matchups';

const DIRECTORY_FAQS = [
  {
    q: 'What Is The Exact Preflop Equity Of An Overpair Vs An Underpair In Texas Hold\'em?',
    a: 'Across All 1,712,304 Five-Card Board Runouts, A Higher Pocket Pair Beats A Lower Pocket Pair Approximately 81.3% To 82.2% Of The Time (Roughly 4.5-To-1 Favorite), With The Underpair Winning Around 18% Primarily By Flopping Or Turning A Three-Of-A-Kind Set.',
  },
  {
    q: 'Why Is A Pocket Pair Vs Two Overcards Called A Coinflip?',
    a: 'When A Pocket Pair Like QQ Or JJ Faces Two Unpaired Overcards Such As AKs Or AKo, The Pocket Pair Holds Between 52.2% And 56.9% Preflop Equity While The Two Overcards Hold Between 43.1% And 47.8% Equity. Because Dead Blinds And 3-Bet Money Are Already In The Pot, Both Sides Profitably Commit All-In At 100BB.',
  },
  {
    q: 'How Much Equity Does Suitedness Add In A Hand-Vs-Hand Matchup?',
    a: 'Holding Two Cards Of The Same Suit Adds Roughly 2.5% To 3.0% Additional Total Equity Compared To The Exact Same Offsuit Hand Because Of Five-Card Flush Runouts.',
  },
  {
    q: 'Where Can I Run Custom Multiway Or Dead-Card Equity Simulations?',
    a: 'Launch The Free Smarter.Poker Multiway Poker Odds Calculator At /tools/poker-odds-calculator To Compute Exact Board-Specific And Dead-Card Equities.',
  },
];

export default function PokerMatchupsIndexPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');

  const filteredMatchups = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return HAND_MATCHUPS.filter((m) => {
      const matchesCat = selectedCategory === 'All' || m.category === selectedCategory;
      if (!matchesCat) return false;
      if (!q) return true;
      return (
        m.slug.toLowerCase().includes(q) ||
        m.title.toLowerCase().includes(q) ||
        m.handA.toLowerCase().includes(q) ||
        m.handB.toLowerCase().includes(q) ||
        m.category.toLowerCase().includes(q) ||
        m.summary.toLowerCase().includes(q)
      );
    });
  }, [searchQuery, selectedCategory]);

  const jsonLd = [
    {
      '@type': 'CollectionPage',
      '@id': `${MATCHUPS_URL}#collection`,
      name: 'Poker Hand Vs Hand Matchup Odds Directory',
      description:
        'Complete Preflop Hand-Vs-Hand Equity Directory Covering 25 Canonical Hold\'em Matchups, Combinatorics, Flop Shifts, And Stack-Off Thresholds.',
      url: MATCHUPS_URL,
      inLanguage: 'en-US',
      dateModified: MATCHUPS_AS_OF,
      isPartOf: { '@id': 'https://smarter.poker/#website' },
      publisher: { '@id': 'https://smarter.poker/#organization' },
      mainEntity: {
        '@type': 'ItemList',
        numberOfItems: HAND_MATCHUPS.length,
        itemListElement: HAND_MATCHUPS.map((m, idx) => ({
          '@type': 'ListItem',
          position: idx + 1,
          name: m.title,
          url: `https://smarter.poker${matchupPath(m.slug)}`,
        })),
      },
    },
    {
      '@type': 'FAQPage',
      '@id': `${MATCHUPS_URL}#faq`,
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
      '@id': `${MATCHUPS_URL}#breadcrumb`,
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Smarter.Poker', item: 'https://smarter.poker/' },
        { '@type': 'ListItem', position: 2, name: 'Learn Poker', item: 'https://smarter.poker/learn' },
        { '@type': 'ListItem', position: 3, name: 'Hand Vs Hand Matchups', item: MATCHUPS_URL },
      ],
    },
  ];

  return (
    <div style={styles.page}>
      <SEOHead
        title="Poker Hand Vs Hand Matchup Odds Directory"
        description="Complete Preflop Hand-Vs-Hand Equity Directory Covering 25 Canonical Hold'em Matchups, Combinatorics, Flop Shifts, And Stack-Off Thresholds."
        canonical="/learn/matchups"
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
          <span style={styles.crumbCurrent}>Hand Vs Hand Matchup Directory</span>
        </nav>

        <header style={styles.heroPlate}>
          <div style={styles.badgeRow}>
            <span style={styles.cyanBadge}>25 CANONICAL PREFLOP MATCHUPS</span>
            <span style={styles.emeraldBadge}>EXACT 1,712,304 RUNOUT COMBINATORICS</span>
          </div>

          <h1 style={styles.h1}>
            Poker Hand Vs Hand Matchup Odds &amp; Preflop Equity Directory
          </h1>

          <p style={styles.lead}>
            <strong>Direct Answer:</strong> Every No-Limit Hold&apos;Em All-In Confrontation Boils Down To Four Mathematical Archetypes:
            <strong> Overpair Vs Underpair (~82% Vs 18%)</strong>, <strong>Dominated Kicker (~70% To 74% Vs 26% To 30%)</strong>,
            <strong> Pair Vs Suited Connectors (~79% Vs 21%)</strong>, And <strong>Classic Coinflip Races (~52% To 57% Vs 43% To 48%)</strong>.
            Explore All 25 Canonical Preflop Matchups Below With Exact Win/Tie/Loss Splits, Flop Texture Shifts, And 100BB/200BB/25BB Stack-Off Thresholds.
          </p>

          <div style={styles.statsBanner}>
            <div style={styles.statBox}>
              <div style={styles.statValue}>25</div>
              <div style={styles.statLabel}>Canonical Matchups</div>
            </div>
            <div style={styles.statBox}>
              <div style={styles.statValue}>1,712,304</div>
              <div style={styles.statLabel}>Board Runouts Per Pair</div>
            </div>
            <div style={styles.statBox}>
              <div style={styles.statValue}>82.18%</div>
              <div style={styles.statLabel}>AA Vs KK Benchmark</div>
            </div>
            <div style={styles.statBox}>
              <div style={styles.statValue}>53.92%</div>
              <div style={styles.statLabel}>QQ Vs AKs Coinflip</div>
            </div>
          </div>

          <div style={styles.quickCrossLinks}>
            <Link href="/tools/poker-odds-calculator" style={styles.crossBtnCyan}>
              Launch Interactive Odds Calculator
            </Link>
            <Link href="/tools/pot-odds-calculator" style={styles.crossBtnEmerald}>
              Pot Odds &amp; MDF Solver
            </Link>
            <Link href="/tools" style={styles.crossBtnOutline}>
              24 Free Poker Calculators
            </Link>
            <Link href="/learn" style={styles.crossBtnOutline}>
              GTO Strategy Academy
            </Link>
            <Link href="/learn/hands" style={styles.crossBtnOutline}>
              All 169 Starting Hands Matrix
            </Link>
            <Link href="/tools/preflop-ranges" style={styles.crossBtnOutline}>
              13x13 GTO Preflop Ranges
            </Link>
            <Link href="/poker-rooms/guides" style={styles.crossBtnOutline}>
              12 Regional Poker Market Guides
            </Link>
            <Link href="/poker-rooms/first-time-guide" style={styles.crossBtnOutline}>
              First-Time Live Poker Room Guide
            </Link>
            <Link href="/poker-series/guides" style={styles.crossBtnOutline}>
              10 Major Poker Series Guides
            </Link>
          </div>
        </header>

        <section aria-label="Search And Filter Matchups" style={styles.filterPlate}>
          <div style={styles.searchRow}>
            <label htmlFor="matchup-search" style={styles.searchLabel}>
              Search Hand Matchups (E.G. AA, KK, AKs, QQ, JTs, Coinflip)
            </label>
            <input
              id="matchup-search"
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search By Hand Or Matchup (AA Vs KK, AKs Vs QQ, 22 Vs AKo)..."
              style={styles.searchInput}
            />
          </div>

          <div style={styles.categoryFilterRow}>
            <button
              type="button"
              onClick={() => setSelectedCategory('All')}
              style={selectedCategory === 'All' ? styles.filterBtnActive : styles.filterBtn}
            >
              All Matchups ({HAND_MATCHUPS.length})
            </button>
            {MATCHUP_CATEGORIES.map((cat) => {
              const count = HAND_MATCHUPS.filter((m) => m.category === cat).length;
              return (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setSelectedCategory(cat)}
                  style={selectedCategory === cat ? styles.filterBtnActive : styles.filterBtn}
                >
                  {cat} ({count})
                </button>
              );
            })}
          </div>
        </section>

        <section aria-label="Master Preflop Equity Comparison Table" style={styles.tablePlate}>
          <div style={styles.sectionHeader}>
            <h2 style={styles.h2}>Master Index Of 25 Preflop Hand-Vs-Hand Matchups</h2>
            <span style={styles.asOfText}>Showing {filteredMatchups.length} Of {HAND_MATCHUPS.length} Matchups</span>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={styles.table}>
              <thead>
                <tr style={styles.trHead}>
                  <th style={styles.th}>Matchup</th>
                  <th style={styles.th}>Category</th>
                  <th style={styles.th}>Hand A Equity</th>
                  <th style={styles.th}>Hand B Equity</th>
                  <th style={styles.th}>Tie %</th>
                  <th style={styles.th}>Combos (A / B)</th>
                  <th style={styles.th}>Interactive Solver</th>
                </tr>
              </thead>
              <tbody>
                {filteredMatchups.map((m) => (
                  <tr key={m.slug} style={styles.trBody}>
                    <td style={styles.tdTitle}>
                      <Link href={matchupPath(m.slug)} style={styles.matchupLink}>
                        {m.handA} Vs {m.handB}
                      </Link>
                    </td>
                    <td style={styles.tdCat}>{m.category}</td>
                    <td style={styles.tdEqA}>
                      {m.handA}: {m.handAEquity.toFixed(2)}%
                    </td>
                    <td style={styles.tdEqB}>
                      {m.handB}: {m.handBEquity.toFixed(2)}%
                    </td>
                    <td style={styles.tdTie}>{m.tiePct.toFixed(2)}%</td>
                    <td style={styles.tdCombos}>
                      {m.combosA} / {m.combosB}
                    </td>
                    <td style={styles.tdAction}>
                      <Link href={`/tools/poker-odds-calculator?hand1=${encodeURIComponent(m.handA)}&hand2=${encodeURIComponent(m.handB)}`} style={styles.calcLink}>
                        Run In Odds Calculator
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section aria-label="Hand Matchup Comparison Cards" style={styles.cardsSection}>
          <h2 style={styles.h2}>Detailed Head-To-Head Equity Cards &amp; Stack-Off Guides</h2>
          <div style={styles.cardGrid}>
            {filteredMatchups.map((m) => (
              <article key={m.slug} style={styles.cardPlate}>
                <div>
                  <div style={styles.cardTopMeta}>
                    <span style={styles.cardCatBadge}>{m.category}</span>
                    <span style={styles.cardComboBadge}>
                      {m.combosA} Vs {m.combosB} Combos
                    </span>
                  </div>

                  <h3 style={styles.h3}>
                    <Link href={matchupPath(m.slug)} style={styles.cardTitleLink}>
                      {m.title}
                    </Link>
                  </h3>

                  <div style={styles.equityBarLabels}>
                    <span style={styles.eqLabelCyan}>
                      {m.handA}: {m.handAEquity.toFixed(2)}%
                    </span>
                    <span style={styles.eqLabelEmerald}>
                      {m.handB}: {m.handBEquity.toFixed(2)}%
                    </span>
                  </div>
                  <div style={styles.equityBarTrack}>
                    <div
                      style={{
                        ...styles.equityBarFillA,
                        width: `${m.handAEquity}%`,
                      }}
                    />
                    <div
                      style={{
                        ...styles.equityBarFillB,
                        width: `${m.handBEquity}%`,
                      }}
                    />
                  </div>

                  <p style={styles.cardSummary}>{m.summary}</p>
                </div>

                <div style={styles.cardFooter}>
                  <Link href={matchupPath(m.slug)} style={styles.readGuideLink}>
                    View Flop Shifts &amp; 100BB EV Guide
                  </Link>
                  <Link href={`/tools/poker-odds-calculator?hand1=${encodeURIComponent(m.handA)}&hand2=${encodeURIComponent(m.handB)}`} style={styles.oddsToolLink}>
                    Odds Calculator
                  </Link>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section style={styles.faqPlate}>
          <h2 style={styles.h2}>Frequently Asked Questions On Poker Hand Matchup Odds</h2>
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
          title="Poker Hand Vs Hand Matchup Odds & Preflop Equity Directory"
          canonicalUrl={MATCHUPS_URL}
          badgeType="research"
          badgeLabel="Combinatorial Equity Index"
          badgeValue="25 Canonical Hold'em Matchups"
          summary="Complete Preflop Hand-Vs-Hand Equity Directory Covering 25 Canonical Hold'em Matchups, Combinatorics, Flop Shifts, And Stack-Off Thresholds."
          publishedYear="2026"
          slug="poker-hand-matchups-directory"
        />
      </main>
    </div>
  );
}

const styles = {
  page: {
    minHeight: '100vh',
    backgroundColor: '#0a0f18',
    color: '#e2e8f0',
    fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
  },
  container: {
    maxWidth: '1160px',
    margin: '0 auto',
    padding: '28px 20px 80px',
  },
  breadcrumbs: {
    display: 'flex',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: '8px',
    fontSize: '13px',
    color: '#94a3b8',
    marginBottom: '20px',
  },
  crumbLink: {
    color: '#00d4ff',
    textDecoration: 'none',
    fontWeight: 600,
  },
  crumbSep: {
    color: '#475569',
  },
  crumbCurrent: {
    color: '#e2e8f0',
    fontWeight: 600,
  },
  heroPlate: {
    backgroundColor: '#111a2a',
    border: '1px solid #1e293b',
    borderRadius: '8px',
    padding: '28px',
    marginBottom: '24px',
  },
  badgeRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '10px',
    marginBottom: '14px',
  },
  cyanBadge: {
    backgroundColor: 'rgba(0, 212, 255, 0.12)',
    border: '1px solid #00d4ff',
    color: '#00d4ff',
    fontSize: '11px',
    fontWeight: 700,
    padding: '4px 10px',
    borderRadius: '4px',
    letterSpacing: '0.06em',
  },
  emeraldBadge: {
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    border: '1px solid #10b981',
    color: '#10b981',
    fontSize: '11px',
    fontWeight: 700,
    padding: '4px 10px',
    borderRadius: '4px',
    letterSpacing: '0.06em',
  },
  h1: {
    fontSize: '32px',
    fontWeight: 800,
    color: '#f8fafc',
    margin: '0 0 14px',
    lineHeight: 1.2,
  },
  lead: {
    fontSize: '15.5px',
    lineHeight: 1.65,
    color: '#cbd5e1',
    margin: '0 0 22px',
  },
  statsBanner: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
    gap: '14px',
    marginBottom: '22px',
  },
  statBox: {
    backgroundColor: '#0a0f18',
    border: '1px solid #1e293b',
    borderRadius: '6px',
    padding: '14px 16px',
  },
  statValue: {
    fontSize: '22px',
    fontWeight: 800,
    color: '#00d4ff',
    marginBottom: '4px',
  },
  statLabel: {
    fontSize: '12px',
    fontWeight: 600,
    color: '#94a3b8',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  },
  quickCrossLinks: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '10px',
  },
  crossBtnCyan: {
    backgroundColor: '#00d4ff',
    color: '#0a0f18',
    fontWeight: 700,
    fontSize: '13px',
    padding: '9px 16px',
    borderRadius: '6px',
    textDecoration: 'none',
  },
  crossBtnEmerald: {
    backgroundColor: '#10b981',
    color: '#0a0f18',
    fontWeight: 700,
    fontSize: '13px',
    padding: '9px 16px',
    borderRadius: '6px',
    textDecoration: 'none',
  },
  crossBtnOutline: {
    backgroundColor: '#0a0f18',
    border: '1px solid #1e293b',
    color: '#e2e8f0',
    fontWeight: 600,
    fontSize: '13px',
    padding: '9px 16px',
    borderRadius: '6px',
    textDecoration: 'none',
  },
  filterPlate: {
    backgroundColor: '#111a2a',
    border: '1px solid #1e293b',
    borderRadius: '8px',
    padding: '20px',
    marginBottom: '24px',
  },
  searchRow: {
    marginBottom: '14px',
  },
  searchLabel: {
    display: 'block',
    fontSize: '12.5px',
    fontWeight: 700,
    color: '#00d4ff',
    marginBottom: '6px',
  },
  searchInput: {
    width: '100%',
    backgroundColor: '#0a0f18',
    border: '1px solid #1e293b',
    borderRadius: '6px',
    padding: '11px 14px',
    color: '#f8fafc',
    fontSize: '14px',
    boxSizing: 'border-box',
  },
  categoryFilterRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '8px',
  },
  filterBtn: {
    backgroundColor: '#0a0f18',
    border: '1px solid #1e293b',
    color: '#cbd5e1',
    fontSize: '12.5px',
    fontWeight: 600,
    padding: '8px 14px',
    borderRadius: '6px',
    cursor: 'pointer',
  },
  filterBtnActive: {
    backgroundColor: '#00d4ff',
    border: '1px solid #00d4ff',
    color: '#0a0f18',
    fontSize: '12.5px',
    fontWeight: 700,
    padding: '8px 14px',
    borderRadius: '6px',
    cursor: 'pointer',
  },
  tablePlate: {
    backgroundColor: '#111a2a',
    border: '1px solid #1e293b',
    borderRadius: '8px',
    padding: '22px',
    marginBottom: '28px',
  },
  sectionHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: '10px',
    marginBottom: '14px',
  },
  h2: {
    fontSize: '22px',
    fontWeight: 800,
    color: '#f8fafc',
    margin: 0,
  },
  asOfText: {
    fontSize: '12.5px',
    color: '#10b981',
    fontWeight: 700,
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: '13.5px',
  },
  trHead: {
    backgroundColor: '#0a0f18',
    borderBottom: '2px solid #00d4ff',
    textAlign: 'left',
  },
  th: {
    padding: '11px 12px',
    color: '#00d4ff',
    fontWeight: 700,
    fontSize: '12px',
  },
  trBody: {
    borderBottom: '1px solid #1e293b',
  },
  tdTitle: {
    padding: '12px',
    fontWeight: 700,
  },
  matchupLink: {
    color: '#00d4ff',
    textDecoration: 'none',
    fontWeight: 700,
  },
  tdCat: {
    padding: '12px',
    color: '#cbd5e1',
  },
  tdEqA: {
    padding: '12px',
    color: '#00d4ff',
    fontWeight: 700,
  },
  tdEqB: {
    padding: '12px',
    color: '#10b981',
    fontWeight: 700,
  },
  tdTie: {
    padding: '12px',
    color: '#94a3b8',
  },
  tdCombos: {
    padding: '12px',
    color: '#e2e8f0',
  },
  tdAction: {
    padding: '12px',
  },
  calcLink: {
    color: '#10b981',
    textDecoration: 'none',
    fontWeight: 700,
    fontSize: '12.5px',
  },
  cardsSection: {
    marginBottom: '32px',
  },
  cardGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))',
    gap: '16px',
    marginTop: '16px',
  },
  cardPlate: {
    backgroundColor: '#111a2a',
    border: '1px solid #1e293b',
    borderRadius: '8px',
    padding: '20px',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'space-between',
  },
  cardTopMeta: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '10px',
  },
  cardCatBadge: {
    fontSize: '11px',
    fontWeight: 700,
    color: '#00d4ff',
    backgroundColor: '#0a0f18',
    border: '1px solid #1e293b',
    padding: '3px 8px',
    borderRadius: '4px',
  },
  cardComboBadge: {
    fontSize: '11px',
    fontWeight: 600,
    color: '#94a3b8',
  },
  h3: {
    fontSize: '17px',
    fontWeight: 700,
    margin: '0 0 12px',
    lineHeight: 1.35,
  },
  cardTitleLink: {
    color: '#f8fafc',
    textDecoration: 'none',
  },
  equityBarLabels: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: '12.5px',
    fontWeight: 700,
    marginBottom: '6px',
  },
  eqLabelCyan: {
    color: '#00d4ff',
  },
  eqLabelEmerald: {
    color: '#10b981',
  },
  equityBarTrack: {
    display: 'flex',
    height: '10px',
    borderRadius: '5px',
    overflow: 'hidden',
    backgroundColor: '#0a0f18',
    border: '1px solid #1e293b',
    marginBottom: '12px',
  },
  equityBarFillA: {
    backgroundColor: '#00d4ff',
    height: '100%',
  },
  equityBarFillB: {
    backgroundColor: '#10b981',
    height: '100%',
  },
  cardSummary: {
    fontSize: '13.5px',
    lineHeight: 1.55,
    color: '#cbd5e1',
    margin: '0 0 16px',
  },
  cardFooter: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTop: '1px solid #1e293b',
    paddingTop: '12px',
  },
  readGuideLink: {
    color: '#00d4ff',
    fontSize: '12.5px',
    fontWeight: 700,
    textDecoration: 'none',
  },
  oddsToolLink: {
    color: '#10b981',
    fontSize: '12.5px',
    fontWeight: 700,
    textDecoration: 'none',
  },
  faqPlate: {
    backgroundColor: '#111a2a',
    border: '1px solid #1e293b',
    borderRadius: '8px',
    padding: '24px',
    marginBottom: '28px',
  },
  faqList: {
    display: 'grid',
    gap: '14px',
    marginTop: '16px',
  },
  faqItem: {
    backgroundColor: '#0a0f18',
    border: '1px solid #1e293b',
    borderRadius: '6px',
    padding: '16px',
  },
  faqQ: {
    fontSize: '15.5px',
    fontWeight: 700,
    color: '#00d4ff',
    margin: '0 0 8px',
  },
  faqA: {
    fontSize: '14px',
    lineHeight: 1.6,
    color: '#cbd5e1',
    margin: 0,
  },
};
