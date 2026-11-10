/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  FAMOUS HISTORIC POKER HANDS SOLVER BREAKDOWN ARCHIVE (/learn/famous-hands)
 * ═══════════════════════════════════════════════════════════════════════════════
 * Interactive directory analyzing 12 iconic historic poker hands through a
 * modern Game Theory Optimal (GTO) solver lens.
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
  FAMOUS_HANDS,
  FAMOUS_HANDS_AS_OF,
  FAMOUS_HANDS_BASE_PATH,
  FAMOUS_HANDS_URL,
  famousHandPath,
} from '../../../src/content/learn/famousHands';

const DIRECTORY_FAQS = [
  {
    q: 'How Do Modern GTO Solvers Evaluate Famous Old-School Poker Bluffs?',
    a: 'Modern Solvers Evaluate Bluffs Based On Card Removal (Blockers), Unblocking Of Opponent Folding Ranges, Minimum Defense Frequency (MDF), And Range Capping. Remarkably, Iconic Bluffs Like Chris Moneymaker\'s Ks 7h River Shove And Tom Dwan\'s Triple Barrels Align Closely With Modern Blocker And Capped-Range Theory.',
  },
  {
    q: 'What Was The Exact Turn Equity In The Garrett Adelstein Vs. Robbi Jade Lew J-4 Hand?',
    a: 'When All The Chips Went In On The Th Tc 9c 3h Turn, Garrett Adelstein\'s 8c 7c Open-Ended Straight-Flush Draw Held 53.4% Equity (21 Winning River Cards Out Of 44) Against Robbi Jade Lew\'s Unimproved Jc 4h (46.6% Equity).',
  },
  {
    q: 'What Were Gus Hansen\'s Odds Of Beating Daniel Negreanu\'s 66 Full House With 55 Quads?',
    a: 'On The 9c 6d 5h Flop, Negreanu\'s Middle Set (66) Was A 95.55% Favorite Over Hansen\'s Bottom Set (55, 4.45% Equity), Before Hansen Spiked The 1-Out Case Five On The Turn (2.22% Probability).',
  },
  {
    q: 'Can I Simulate Any Famous Televised Poker Hand In The Smarter.Poker Odds Calculator?',
    a: 'Yes. Every Hand Breakdown Below Includes A Direct One-Click Link To Load Both Players\' Exact Hole Cards Into The Smarter.Poker Interactive Odds Calculator.',
  },
];

export default function FamousHandsIndexPage() {
  const [searchQuery, setSearchQuery] = useState('');

  const filteredHands = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return FAMOUS_HANDS;
    return FAMOUS_HANDS.filter(
      (h) =>
        h.slug.toLowerCase().includes(q) ||
        h.title.toLowerCase().includes(q) ||
        h.heroPlayer.toLowerCase().includes(q) ||
        h.villainPlayer.toLowerCase().includes(q) ||
        h.event.toLowerCase().includes(q) ||
        h.category.toLowerCase().includes(q) ||
        h.summary.toLowerCase().includes(q)
    );
  }, [searchQuery]);

  const jsonLd = [
    {
      '@type': 'CollectionPage',
      '@id': `${FAMOUS_HANDS_URL}#collection`,
      name: 'Famous Historic Poker Hands Solver Breakdown Archive',
      description:
        'GTO Solver And Combinatoric Equity Breakdowns Of 12 Iconic Televised And WSOP Poker Hands: Moneymaker Vs Farha, Dwan Vs Ivey, Negreanu Vs Hansen, Adelstein Vs Lew, And More.',
      url: FAMOUS_HANDS_URL,
      inLanguage: 'en-US',
      dateModified: FAMOUS_HANDS_AS_OF,
      isPartOf: { '@id': 'https://smarter.poker/#website' },
      publisher: { '@id': 'https://smarter.poker/#organization' },
      speakable: {
        '@type': 'SpeakableSpecification',
        cssSelector: ['h1', 'header p:first-of-type'],
      },
      mainEntity: {
        '@type': 'ItemList',
        numberOfItems: FAMOUS_HANDS.length,
        itemListElement: FAMOUS_HANDS.map((h, idx) => ({
          '@type': 'ListItem',
          position: idx + 1,
          name: h.title,
          url: `https://smarter.poker${famousHandPath(h.slug)}`,
        })),
      },
    },
    {
      '@type': 'FAQPage',
      '@id': `${FAMOUS_HANDS_URL}#faq`,
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
      '@id': `${FAMOUS_HANDS_URL}#breadcrumb`,
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Smarter.Poker', item: 'https://smarter.poker/' },
        { '@type': 'ListItem', position: 2, name: 'Learn Poker', item: 'https://smarter.poker/learn' },
        { '@type': 'ListItem', position: 3, name: 'Famous Poker Hands Archive', item: FAMOUS_HANDS_URL },
      ],
    },
  ];

  return (
    <div style={styles.page}>
      <SEOHead
        title="Famous Historic Poker Hands: GTO Solver & Equity Breakdowns"
        description="GTO Solver And Combinatoric Equity Breakdowns Of 12 Iconic Televised And WSOP Poker Hands: Moneymaker Vs Farha, Dwan Vs Ivey, Negreanu Vs Hansen, Adelstein Vs Lew, And More."
        canonical={FAMOUS_HANDS_BASE_PATH}
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
          <span style={styles.crumbCurrent}>Famous Historic Poker Hands</span>
        </nav>

        <header style={styles.heroPlate}>
          <div style={styles.badgeRow}>
            <span style={styles.cyanBadge}>12 ICONIC TELEVISED &amp; WSOP HANDS</span>
            <span style={styles.emeraldBadge}>MODERN GTO SOLVER &amp; EQUITY VERDICTS</span>
          </div>

          <h1 style={styles.h1}>
            Famous Historic Poker Hands Archive: GTO Solver &amp; Combinatoric Equity Breakdowns
          </h1>

          <p style={styles.lead}>
            <strong>Direct Answer:</strong> Poker History&apos;S Most Famous Hands Are Often Remembered As Pure Gut Feel Or Unlucky Coolers, Yet Modern Game Theory Optimal (GTO) Solvers Reveal Deep Mathematical Structure Underneath:
            <strong> Chris Moneymaker&apos;S 2003 Ks Nut-Blocker Shove</strong>,
            <strong> Tom Dwan&apos;S Capped-Range Triple Barrels</strong>,
            <strong> Garrett Adelstein&apos;S 53.4% Turn Straight-Flush Draw Favorite Vs J-4</strong>, And
            <strong> Doyle Brunson&apos;S 0.303% Runner-Runner 10-2 Full Houses</strong>.
          </p>

          <div style={styles.quickCrossLinks}>
            <Link href="/tools/poker-odds-calculator" style={styles.crossBtnCyan}>
              Launch Interactive Odds Calculator
            </Link>
            <Link href="/learn/matchups" style={styles.crossBtnEmerald}>
              25 All-In Hand Matchups
            </Link>
            <Link href="/learn/hands" style={styles.crossBtnOutline}>
              All 169 Starting Hands
            </Link>
            <Link href="/learn/poker-math" style={styles.crossBtnOutline}>
              Poker Math Formulas Reference
            </Link>
            <Link href="/learn/live-poker-tells" style={styles.crossBtnOutline}>
              Live Poker Tells Encyclopedia
            </Link>
          </div>
        </header>

        <section aria-label="Search Famous Hands" style={styles.filterPlate}>
          <label htmlFor="famous-search" style={styles.searchLabel}>
            Search By Player, Event, Or Hand (E.G. Moneymaker, Dwan, Ivey, Negreanu, J4, Brunson)
          </label>
          <input
            id="famous-search"
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Filter Famous Hands By Player Or Event..."
            style={styles.searchInput}
          />
        </section>

        <section aria-label="Master Famous Poker Hands Table" style={styles.tablePlate}>
          <div style={styles.sectionHeader}>
            <h2 style={styles.h2}>Master Index Of 12 Iconic Historic Poker Hands</h2>
            <span style={styles.asOfText}>
              Showing {filteredHands.length} Of {FAMOUS_HANDS.length} Historic Hands
            </span>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={styles.table}>
              <thead>
                <tr style={styles.trHead}>
                  <th style={styles.th}>Historic Confrontation</th>
                  <th style={styles.th}>Year &amp; Event</th>
                  <th style={styles.th}>Board Runout</th>
                  <th style={styles.th}>GTO Solver Verdict</th>
                  <th style={styles.th}>Full Analysis</th>
                </tr>
              </thead>
              <tbody>
                {filteredHands.map((h) => (
                  <tr key={h.slug} style={styles.trBody}>
                    <td style={styles.tdTitle}>
                      <Link href={famousHandPath(h.slug)} style={styles.handLink}>
                        {h.heroPlayer} Vs {h.villainPlayer}
                      </Link>
                    </td>
                    <td style={styles.tdCell}>
                      {h.year} {h.event}
                    </td>
                    <td style={styles.tdCyan}>{h.boardRunout}</td>
                    <td style={styles.tdEmerald}>{h.solverVerdict}</td>
                    <td style={styles.tdAction}>
                      <Link href={famousHandPath(h.slug)} style={styles.guideLink}>
                        Read Breakdown
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section aria-label="Famous Hand Breakdown Cards" style={styles.cardsSection}>
          <h2 style={styles.h2}>Street-By-Street Solver &amp; Blocker Breakdown Cards</h2>
          <div style={styles.cardGrid}>
            {filteredHands.map((h) => (
              <article key={h.slug} style={styles.cardPlate}>
                <div>
                  <div style={styles.cardTopMeta}>
                    <span style={styles.cardCatBadge}>{h.category}</span>
                    <span style={styles.cardYearBadge}>{h.year}</span>
                  </div>

                  <h3 style={styles.h3}>
                    <Link href={famousHandPath(h.slug)} style={styles.cardTitleLink}>
                      {h.title}
                    </Link>
                  </h3>

                  <div style={styles.metaBox}>
                    <div>
                      <strong>Matchup:</strong> {h.heroPlayer} Vs {h.villainPlayer}
                    </div>
                    <div>
                      <strong>Board:</strong> {h.boardRunout}
                    </div>
                    <div>
                      <strong>Verdict:</strong> {h.solverVerdict}
                    </div>
                  </div>

                  <p style={styles.cardSummary}>{h.summary}</p>
                </div>

                <div style={styles.cardFooter}>
                  <Link href={famousHandPath(h.slug)} style={styles.readGuideLink}>
                    Street-By-Street Solver Math
                  </Link>
                  <Link
                    href={`/tools/poker-odds-calculator?hand1=${encodeURIComponent(h.heroHandCode)}&hand2=${encodeURIComponent(h.villainHandCode)}`}
                    style={styles.toolLink}
                  >
                    Simulate In Odds Calculator
                  </Link>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section style={styles.tablePlate}>
          <h2 style={styles.h2}>Frequently Asked Questions On Famous Historic Poker Hands</h2>
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
          title="Famous Historic Poker Hands Solver Breakdown Archive"
          canonicalUrl={FAMOUS_HANDS_URL}
          badgeType="research"
          badgeLabel="Historic Hand Solver Index"
          badgeValue="12 Iconic Televised Hands"
          summary="GTO Solver And Combinatoric Equity Breakdowns Of 12 Iconic Televised And WSOP Poker Hands: Moneymaker Vs Farha, Dwan Vs Ivey, Negreanu Vs Hansen, Adelstein Vs Lew, And More."
          publishedYear="2026"
          slug="famous-poker-hands-archive"
        />

        <AiPromptLauncher
          title="Famous Historic Poker Hands Solver Breakdown Archive"
          canonicalUrl={FAMOUS_HANDS_URL}
          canonicalPath={FAMOUS_HANDS_BASE_PATH}
          markdownUrl="/learn/famous-hands.md"
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
  handLink: {
    color: '#00d4ff',
    textDecoration: 'none',
    fontWeight: 700,
  },
  tdCyan: {
    padding: '12px',
    color: '#00d4ff',
    fontWeight: 600,
  },
  tdEmerald: {
    padding: '12px',
    color: '#10b981',
    fontWeight: 600,
  },
  tdCell: {
    padding: '12px',
    color: '#cbd5e1',
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
  cardYearBadge: {
    fontSize: '11.5px',
    fontWeight: 700,
    color: '#10b981',
  },
  h3: {
    fontSize: '17.5px',
    fontWeight: 700,
    margin: '0 0 12px',
    lineHeight: 1.35,
  },
  cardTitleLink: {
    color: '#f8fafc',
    textDecoration: 'none',
  },
  metaBox: {
    backgroundColor: '#0a0f18',
    border: '1px solid #1e293b',
    borderRadius: '6px',
    padding: '10px 12px',
    fontSize: '12.5px',
    color: '#cbd5e1',
    lineHeight: 1.65,
    marginBottom: '12px',
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
