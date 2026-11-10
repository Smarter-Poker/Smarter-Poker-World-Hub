/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  9-SEAT POKER POSITION STRATEGY ENCYCLOPEDIA (/learn/positions)
 * ═══════════════════════════════════════════════════════════════════════════════
 * Interactive directory covering all 9 canonical No-Limit Texas Hold'em table
 * positions with RFI opening frequencies, 3-bet and cold-call rates, BB/100
 * winrate benchmarks, and seat-by-seat playbooks.
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
  POKER_POSITIONS,
  POSITION_SEAT_TYPES,
  POSITIONS_AS_OF,
  POSITIONS_BASE_PATH,
  POSITIONS_URL,
  positionPath,
} from '../../../src/content/learn/positions';

const DIRECTORY_FAQS = [
  {
    q: 'Why Is Table Position The Most Important Factor In Texas Hold\'em?',
    a: 'Acting Last On The Flop, Turn, And River Allows You To See Every Opponent Decision Before Committing Chips. Players On The Dealer Button And Cutoff Realize Over 100% Of Their Raw Equity And Win +27.8 To +38.5 BB/100, Whereas Players In The Blinds Lose -14.5 To -28.0 BB/100 Due To Forced Blind Posts And Positional Disadvantage.',
  },
  {
    q: 'How Do 9-Max Full-Ring Positions Map To 6-Max Short-Handed Games?',
    a: 'A 6-Max Table Simply Removes The Three Earliest Seats (UTG, UTG+1, And MP) From A 9-Max Table. The First Player To Act In A 6-Max Game Sits Five Off The Button, Which Mathematically Matches The Lojack (LJ) Seat In A 9-Max Game (17.5% RFI).',
  },
  {
    q: 'Why Should The Small Blind Use A 3-Bet Or Fold Strategy Instead Of Calling?',
    a: 'Flat-Calling In The Small Blind Guarantees You Will Act First On Every Postflop Street, Invites The Big Blind To Squeeze Or Overcall With Great Pot Odds, And Triggers Full Casino Pot Rake. Playing 3-Bet Or Fold Captures Dead Money Preflop Or Gives You The Uncapped Range Initiative.',
  },
  {
    q: 'Where Can I View Interactive 13x13 GTO Range Grids For Each Position?',
    a: 'Open Any Individual Position Guide Below Or Launch The Interactive Smarter.Poker 13x13 GTO Preflop Range Matrix At /tools/preflop-ranges.',
  },
];

export default function PokerPositionsIndexPage() {
  const [selectedSeatType, setSelectedSeatType] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');

  const filteredPositions = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return POKER_POSITIONS.filter((p) => {
      const matchesSeat = selectedSeatType === 'All' || p.seatType === selectedSeatType;
      if (!matchesSeat) return false;
      if (!q) return true;
      return (
        p.slug.toLowerCase().includes(q) ||
        p.code.toLowerCase().includes(q) ||
        p.name.toLowerCase().includes(q) ||
        p.seatType.toLowerCase().includes(q) ||
        p.summary.toLowerCase().includes(q)
      );
    });
  }, [selectedSeatType, searchQuery]);

  const jsonLd = [
    {
      '@type': 'CollectionPage',
      '@id': `${POSITIONS_URL}#collection`,
      name: 'Poker Table Positions Strategy Encyclopedia: UTG To Button & Blinds',
      description:
        'Complete 9-Seat Poker Position Strategy Encyclopedia Covering UTG, UTG+1, MP, Lojack, Hijack, Cutoff, Button, Small Blind, And Big Blind With Exact 100BB RFI Ranges And Winrates.',
      url: POSITIONS_URL,
      inLanguage: 'en-US',
      dateModified: POSITIONS_AS_OF,
      isPartOf: { '@id': 'https://smarter.poker/#website' },
      publisher: { '@id': 'https://smarter.poker/#organization' },
      speakable: {
        '@type': 'SpeakableSpecification',
        cssSelector: ['h1', 'header p:first-of-type'],
      },
      mainEntity: {
        '@type': 'ItemList',
        numberOfItems: POKER_POSITIONS.length,
        itemListElement: POKER_POSITIONS.map((p, idx) => ({
          '@type': 'ListItem',
          position: idx + 1,
          name: `${p.name} (${p.code}) Poker Strategy`,
          url: `https://smarter.poker${positionPath(p.slug)}`,
        })),
      },
    },
    {
      '@type': 'FAQPage',
      '@id': `${POSITIONS_URL}#faq`,
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
      '@id': `${POSITIONS_URL}#breadcrumb`,
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Smarter.Poker', item: 'https://smarter.poker/' },
        { '@type': 'ListItem', position: 2, name: 'Learn Poker', item: 'https://smarter.poker/learn' },
        { '@type': 'ListItem', position: 3, name: 'Poker Table Positions', item: POSITIONS_URL },
      ],
    },
  ];

  return (
    <div style={styles.page}>
      <SEOHead
        title="Poker Table Positions Guide: 9-Max & 6-Max RFI Ranges By Seat"
        description="Complete 9-Seat Poker Position Strategy Encyclopedia Covering UTG, UTG+1, MP, Lojack, Hijack, Cutoff, Button, Small Blind, And Big Blind With Exact 100BB RFI Ranges And Winrates."
        canonical={POSITIONS_BASE_PATH}
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
          <span style={styles.crumbCurrent}>Poker Table Positions Encyclopedia</span>
        </nav>

        <header style={styles.heroPlate}>
          <div style={styles.badgeRow}>
            <span style={styles.cyanBadge}>9-MAX &amp; 6-MAX TABLE ARCHITECTURE</span>
            <span style={styles.emeraldBadge}>100BB SOLVER RFI &amp; WINRATE BENCHMARKS</span>
          </div>

          <h1 style={styles.h1}>
            Poker Table Positions Strategy Encyclopedia: UTG, Hijack, Cutoff, Button &amp; Blinds
          </h1>

          <p style={styles.lead}>
            <strong>Direct Answer:</strong> A Standard 9-Handed Poker Table Divides Into Four Positional Zones:
            <strong> Early Position (UTG 10.5% RFI, UTG+1 12.2% RFI)</strong>,
            <strong> Middle Position (MP 14.5%, Lojack 17.5%, Hijack 21.5%)</strong>,
            <strong> Late Position (Cutoff 28.0%, Dealer Button 44.5%)</strong>, And
            <strong> The Blinds (Small Blind 3-Bet Or Fold, Big Blind Closing Action)</strong>.
            Compare Exact Opening Frequencies, 3-Bet Percentages, And BB/100 Winrates Below.
          </p>

          <div style={styles.statsBanner}>
            <div style={styles.statBox}>
              <div style={styles.statValue}>9 Seats</div>
              <div style={styles.statLabel}>Full-Ring &amp; 6-Max Positions</div>
            </div>
            <div style={styles.statBox}>
              <div style={styles.statValue}>10.5% To 44.5%</div>
              <div style={styles.statLabel}>UTG To Button RFI Spread</div>
            </div>
            <div style={styles.statBox}>
              <div style={styles.statValue}>+38.5 BB/100</div>
              <div style={styles.statLabel}>Dealer Button Benchmark</div>
            </div>
            <div style={styles.statBox}>
              <div style={styles.statValue}>-28.0 BB/100</div>
              <div style={styles.statLabel}>Big Blind Defense Target</div>
            </div>
          </div>

          <div style={styles.quickCrossLinks}>
            <Link href="/tools/preflop-ranges" style={styles.crossBtnCyan}>
              Open 13x13 GTO Range Matrix
            </Link>
            <Link href="/learn/hands" style={styles.crossBtnEmerald}>
              All 169 Starting Hands Guide
            </Link>
            <Link href="/learn/matchups" style={styles.crossBtnOutline}>
              25 All-In Hand Matchups
            </Link>
            <Link href="/learn/stakes" style={styles.crossBtnOutline}>
              Stake Level &amp; Move-Up Hub
            </Link>
            <Link href="/learn/poker-math" style={styles.crossBtnOutline}>
              Poker Math Formulas Reference
            </Link>
            <Link href="/learn/cheat-sheets" style={styles.crossBtnOutline}>
              Printable Poker Cheat Sheets
            </Link>
            <Link href="/tools" style={styles.crossBtnOutline}>
              24 Free Poker Calculators
            </Link>
          </div>
        </header>

        <section aria-label="Search And Filter Table Positions" style={styles.filterPlate}>
          <div style={styles.searchRow}>
            <label htmlFor="pos-search" style={styles.searchLabel}>
              Search Table Position (E.G. UTG, Lojack, Hijack, Cutoff, Button, Big Blind)
            </label>
            <input
              id="pos-search"
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search By Seat Code Or Name (UTG, LJ, HJ, CO, BTN, SB, BB)..."
              style={styles.searchInput}
            />
          </div>

          <div style={styles.categoryFilterRow}>
            <button
              type="button"
              onClick={() => setSelectedSeatType('All')}
              style={selectedSeatType === 'All' ? styles.filterBtnActive : styles.filterBtn}
            >
              All 9 Positions ({POKER_POSITIONS.length})
            </button>
            {POSITION_SEAT_TYPES.map((type) => {
              const count = POKER_POSITIONS.filter((p) => p.seatType === type).length;
              return (
                <button
                  key={type}
                  type="button"
                  onClick={() => setSelectedSeatType(type)}
                  style={selectedSeatType === type ? styles.filterBtnActive : styles.filterBtn}
                >
                  {type} ({count})
                </button>
              );
            })}
          </div>
        </section>

        <section aria-label="Master 9-Seat Position Comparison Table" style={styles.tablePlate}>
          <div style={styles.sectionHeader}>
            <h2 style={styles.h2}>Master 9-Max &amp; 6-Max Positional Metrics Table (100BB)</h2>
            <span style={styles.asOfText}>
              Showing {filteredPositions.length} Of {POKER_POSITIONS.length} Seats
            </span>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={styles.table}>
              <thead>
                <tr style={styles.trHead}>
                  <th style={styles.th}>Seat Code &amp; Name</th>
                  <th style={styles.th}>Table Zone</th>
                  <th style={styles.th}>100BB RFI %</th>
                  <th style={styles.th}>3-Bet %</th>
                  <th style={styles.th}>Cold-Call %</th>
                  <th style={styles.th}>Expected BB/100</th>
                  <th style={styles.th}>Playbook &amp; Chart</th>
                </tr>
              </thead>
              <tbody>
                {filteredPositions.map((p) => (
                  <tr key={p.slug} style={styles.trBody}>
                    <td style={styles.tdTitle}>
                      <Link href={positionPath(p.slug)} style={styles.posLink}>
                        {p.code}: {p.name}
                      </Link>
                    </td>
                    <td style={styles.tdCat}>{p.seatType}</td>
                    <td style={styles.tdCyan}>{p.rfiPct}</td>
                    <td style={styles.tdEmerald}>{p.threeBetPct}</td>
                    <td style={styles.tdMuted}>{p.coldCallPct}</td>
                    <td style={styles.tdWinrate}>{p.expectedWinrateBb100}</td>
                    <td style={styles.tdAction}>
                      <Link href={positionPath(p.slug)} style={styles.guideLink}>
                        Open {p.code} Guide
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section aria-label="Position Strategy Cards" style={styles.cardsSection}>
          <h2 style={styles.h2}>Seat-By-Seat Positional Strategy Cards &amp; Leak Busters</h2>
          <div style={styles.cardGrid}>
            {filteredPositions.map((p) => (
              <article key={p.slug} style={styles.cardPlate}>
                <div>
                  <div style={styles.cardTopMeta}>
                    <span style={styles.cardCatBadge}>{p.seatType}</span>
                    <span style={styles.cardWinBadge}>{p.expectedWinrateBb100}</span>
                  </div>

                  <h3 style={styles.h3}>
                    <Link href={positionPath(p.slug)} style={styles.cardTitleLink}>
                      {p.name} ({p.code}) Strategy
                    </Link>
                  </h3>

                  <div style={styles.metricRow}>
                    <span style={styles.metricPillCyan}>RFI: {p.rfiPct}</span>
                    <span style={styles.metricPillEmerald}>3-Bet: {p.threeBetPct}</span>
                    <span style={styles.metricPillSlate}>Call: {p.coldCallPct}</span>
                  </div>

                  <p style={styles.cardSummary}>{p.summary}</p>
                </div>

                <div style={styles.cardFooter}>
                  <Link href={positionPath(p.slug)} style={styles.readGuideLink}>
                    View {p.code} Ranges &amp; Leaks
                  </Link>
                  <Link href="/tools/preflop-ranges" style={styles.toolLink}>
                    13x13 Chart
                  </Link>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section style={styles.faqPlate}>
          <h2 style={styles.h2}>Frequently Asked Questions On Poker Table Positions</h2>
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
          title="Poker Table Positions Strategy Encyclopedia: UTG To Button & Blinds"
          canonicalUrl={POSITIONS_URL}
          badgeType="gto"
          badgeLabel="9-Seat Positional Index"
          badgeValue="UTG To BB RFI & Winrates"
          summary="Complete 9-Seat Poker Position Strategy Encyclopedia Covering UTG, UTG+1, MP, Lojack, Hijack, Cutoff, Button, Small Blind, And Big Blind With Exact 100BB RFI Ranges And Winrates."
          publishedYear="2026"
          slug="poker-table-positions-encyclopedia"
        />

        <AiPromptLauncher
          title="Poker Table Positions Strategy Encyclopedia"
          canonicalUrl={POSITIONS_URL}
          canonicalPath={POSITIONS_BASE_PATH}
          markdownUrl="/learn/positions.md"
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
  posLink: {
    color: '#00d4ff',
    textDecoration: 'none',
    fontWeight: 700,
  },
  tdCat: {
    padding: '12px',
    color: '#cbd5e1',
  },
  tdCyan: {
    padding: '12px',
    color: '#00d4ff',
    fontWeight: 700,
  },
  tdEmerald: {
    padding: '12px',
    color: '#10b981',
    fontWeight: 700,
  },
  tdMuted: {
    padding: '12px',
    color: '#94a3b8',
  },
  tdWinrate: {
    padding: '12px',
    color: '#f8fafc',
    fontWeight: 700,
  },
  tdAction: {
    padding: '12px',
  },
  guideLink: {
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
  cardWinBadge: {
    fontSize: '11.5px',
    fontWeight: 700,
    color: '#10b981',
  },
  h3: {
    fontSize: '18px',
    fontWeight: 700,
    margin: '0 0 12px',
    lineHeight: 1.35,
  },
  cardTitleLink: {
    color: '#f8fafc',
    textDecoration: 'none',
  },
  metricRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '8px',
    marginBottom: '12px',
  },
  metricPillCyan: {
    fontSize: '11.5px',
    fontWeight: 700,
    color: '#00d4ff',
    backgroundColor: '#0a0f18',
    border: '1px solid #1e293b',
    padding: '4px 9px',
    borderRadius: '4px',
  },
  metricPillEmerald: {
    fontSize: '11.5px',
    fontWeight: 700,
    color: '#10b981',
    backgroundColor: '#0a0f18',
    border: '1px solid #1e293b',
    padding: '4px 9px',
    borderRadius: '4px',
  },
  metricPillSlate: {
    fontSize: '11.5px',
    fontWeight: 600,
    color: '#cbd5e1',
    backgroundColor: '#0a0f18',
    border: '1px solid #1e293b',
    padding: '4px 9px',
    borderRadius: '4px',
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
  toolLink: {
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
