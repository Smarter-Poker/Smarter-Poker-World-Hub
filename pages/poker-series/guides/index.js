/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  MAJOR POKER SERIES & TOUR STRATEGY GUIDES DIRECTORY (/poker-series/guides)
 * ═══════════════════════════════════════════════════════════════════════════════
 * Index hub for the 10 premier North American live poker tournament series and
 * festivals (WSOP, WPT, WSOPC, MSPT, RGPS, SHRPO, Borgata, Wynn, Venetian, Texas).
 *
 * House style: Title Case, zero em dashes.
 */

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import SEOHead from '../../../src/components/seo/SEOHead';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import CitationBacklinkBox from '../../../src/components/seo/CitationBacklinkBox';
import {
  SERIES_GUIDES,
  SERIES_GUIDES_AS_OF,
  SERIES_GUIDES_BASE_PATH,
  SERIES_GUIDES_URL,
  seriesGuidePath,
} from '../../../src/content/guides/seriesGuides';

const INDEX_FAQS = [
  {
    q: 'Which Live Poker Series Has The Best Blind Structures In North America?',
    a: 'The $10,000 WSOP Main Event Leads All Annual Tournaments With 120-Minute Blind Levels And A 300 BB Starting Stack, While Wynn Las Vegas (WPT World Championship And Wynn Summer Classic) Ranks #1 Overall Across Prelim And Mid-Stakes Events With 40-Minute To 90-Minute Levels.',
  },
  {
    q: 'How Many Buy-Ins Do I Need In My Bankroll For A Major Live Poker Series?',
    a: 'Because Live Multi-Flight Tournament Fields Regularly Exceed 1,000 To 5,000 Entries, Professional Bankroll Management Requires 75 To 100 Average Buy-Ins For Regional Tours (MSPT, RGPS, WSOPC) And 100 To 150 Buy-Ins For Large-Field Las Vegas Or Florida Festivals.',
  },
  {
    q: 'Is Late Registration Profitable In Major Series Tournaments?',
    a: 'Yes. Under Independent Chip Model (ICM) Mathematics, Entering A Freezeout Or Multi-Flight Tournament At 35 BB To 50 BB Captures Immediate Prize Pool Equity From Early Eliminations While Reducing Total Hotel And Hourly Grind Overhead.',
  },
];

export default function PokerSeriesGuidesIndexPage() {
  const [searchQuery, setSearchQuery] = useState('');

  const filteredSeries = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return SERIES_GUIDES;
    return SERIES_GUIDES.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.shortName.toLowerCase().includes(q) ||
        s.hostVenue.toLowerCase().includes(q) ||
        s.cityState.toLowerCase().includes(q) ||
        s.buyInRange.toLowerCase().includes(q)
    );
  }, [searchQuery]);

  const jsonLd = [
    {
      '@type': 'CollectionPage',
      '@id': `${SERIES_GUIDES_URL}#collection`,
      name: 'Major Poker Series & Tour Strategy Guides',
      description:
        'Complete Tournament Series Strategy Guides For WSOP, WPT, WSOP Circuit, MSPT, RGPS, Wynn, Venetian, Borgata, SHRPO, And Texas Major Festivals.',
      url: SERIES_GUIDES_URL,
      inLanguage: 'en-US',
      dateModified: SERIES_GUIDES_AS_OF,
      isPartOf: { '@id': 'https://smarter.poker/#website' },
      publisher: { '@id': 'https://smarter.poker/#organization' },
      mainEntity: {
        '@type': 'ItemList',
        numberOfItems: SERIES_GUIDES.length,
        itemListElement: SERIES_GUIDES.map((s, idx) => ({
          '@type': 'ListItem',
          position: idx + 1,
          name: s.name,
          url: `https://smarter.poker${seriesGuidePath(s.slug)}`,
        })),
      },
    },
    {
      '@type': 'FAQPage',
      '@id': `${SERIES_GUIDES_URL}#faq`,
      mainEntity: INDEX_FAQS.map((f) => ({
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
      '@id': `${SERIES_GUIDES_URL}#breadcrumb`,
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Smarter.Poker', item: 'https://smarter.poker/' },
        { '@type': 'ListItem', position: 2, name: 'Poker Series', item: 'https://smarter.poker/hub/poker-series' },
        { '@type': 'ListItem', position: 3, name: 'Major Series Strategy Guides', item: SERIES_GUIDES_URL },
      ],
    },
  ];

  return (
    <div style={styles.page}>
      <SEOHead
        title="Major Poker Series And Tour Strategy Guides"
        description="Complete Tournament Series Strategy Guides For WSOP, WPT, WSOP Circuit, MSPT, RGPS, Wynn, Venetian, Borgata, SHRPO, And Texas Major Festivals."
        canonical="/poker-series/guides"
        jsonLd={jsonLd}
      />

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@graph': jsonLd,
          }),
        }}
      />

      <UniversalHeader pageDepth={2} />

      <main style={styles.container}>
        <nav aria-label="Breadcrumb" style={styles.breadcrumbs}>
          <Link href="/" style={styles.crumbLink}>
            Smarter.Poker
          </Link>
          <span style={styles.crumbSep}>/</span>
          <Link href="/hub/poker-series" style={styles.crumbLink}>
            Poker Series
          </Link>
          <span style={styles.crumbSep}>/</span>
          <span style={styles.crumbCurrent}>Major Series Strategy Guides</span>
        </nav>

        <header style={styles.heroPlate}>
          <div style={styles.badgeRow}>
            <span style={styles.cyanBadge}>10 PREMIER LIVE FESTIVAL BLUEPRINTS</span>
            <span style={styles.emeraldBadge}>VERIFIED STRUCTURE &amp; BANKROLL ANALYTICS</span>
          </div>

          <h1 style={styles.h1}>
            Major Live Poker Series, Tour &amp; Festival Strategy Guides
          </h1>

          <p style={styles.lead}>
            <strong>Direct Answer:</strong> Maximizing Return On Investment (ROI) At A Major Live Poker Festival Requires Matching Your Bankroll And Schedule To Each Venue&apos;S Exact Blind Structure, Late-Registration Window, Milestone Satellite Format, And Cash Game Spillover. Explore Our <strong>10 Comprehensive Poker Series Strategy Guides</strong> Covering The <strong>WSOP</strong>, <strong>WPT World Championship</strong>, <strong>WSOP Circuit</strong>, <strong>MSPT</strong>, <strong>RunGood (RGPS)</strong>, <strong>Seminole Hard Rock (SHRPO)</strong>, <strong>Borgata</strong>, <strong>Wynn</strong>, <strong>Venetian</strong>, And <strong>Texas Major Card Club Championships</strong>.
          </p>

          <div style={styles.quickCrossLinks}>
            <Link href="/tools/bankroll-calculator" style={styles.crossBtnCyan}>
              Tournament Bankroll Calculator
            </Link>
            <Link href="/tools/staking-calculator" style={styles.crossBtnEmerald}>
              Tournament Staking &amp; Markup Calculator
            </Link>
            <Link href="/tools/icm-calculator" style={styles.crossBtnOutline}>
              Final Table ICM Chop Solver
            </Link>
            <Link href="/poker-rooms/guides" style={styles.crossBtnOutline}>
              12 Regional Cash Market Guides
            </Link>
          </div>
        </header>

        <section aria-label="Search Series Guides" style={styles.filterPlate}>
          <label htmlFor="series-search" style={styles.searchLabel}>
            Filter By Tour, Host Casino, City, Or Buy-In Range
          </label>
          <input
            id="series-search"
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search WSOP, Wynn, Venetian, Borgata, Seminole, MSPT, Texas..."
            style={styles.searchInput}
          />
        </section>

        <section aria-label="Master Comparison Table Of Major Poker Series" style={styles.tablePlate}>
          <div style={styles.sectionHeader}>
            <h2 style={styles.h2}>National Comparison Matrix: 10 Major Poker Tours &amp; Festivals</h2>
            <span style={styles.asOfText}>Verified {SERIES_GUIDES_AS_OF}</span>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={styles.table}>
              <thead>
                <tr style={styles.trHead}>
                  <th style={styles.th}>Series / Tour</th>
                  <th style={styles.th}>Host Venue &amp; Hub</th>
                  <th style={styles.th}>Buy-In Range</th>
                  <th style={styles.th}>Main Event</th>
                  <th style={styles.th}>Level Length</th>
                  <th style={styles.th}>Structure Rating</th>
                </tr>
              </thead>
              <tbody>
                {filteredSeries.map((s) => (
                  <tr key={s.slug} style={styles.trBody}>
                    <td style={styles.tdTitle}>
                      <Link href={seriesGuidePath(s.slug)} style={styles.seriesLink}>
                        {s.shortName}
                      </Link>
                    </td>
                    <td style={styles.tdCell}>{s.cityState}</td>
                    <td style={styles.tdCell}>{s.buyInRange}</td>
                    <td style={styles.tdEmerald}>{s.mainEventBuyIn}</td>
                    <td style={styles.tdCell}>{s.levelMinutes}</td>
                    <td style={styles.tdCyan}>{s.blindStructureRating}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section aria-label="Detailed Series Cards" style={styles.cardsSection}>
          <h2 style={styles.h2}>Complete Festival Blueprints &amp; Registration Playbooks</h2>
          <div style={styles.cardGrid}>
            {filteredSeries.map((s) => (
              <article key={s.slug} style={styles.cardPlate}>
                <div>
                  <div style={styles.cardTopMeta}>
                    <span style={styles.cardCityBadge}>{s.cityState}</span>
                    <span style={styles.cardRatingBadge}>{s.blindStructureRating}</span>
                  </div>

                  <h3 style={styles.h3}>
                    <Link href={seriesGuidePath(s.slug)} style={styles.cardTitleLink}>
                      {s.name}
                    </Link>
                  </h3>

                  <div style={styles.metaGrid}>
                    <div style={styles.metaItem}>
                      <span style={styles.metaLabel}>Host Venue</span>
                      <span style={styles.metaValue}>{s.hostVenue}</span>
                    </div>
                    <div style={styles.metaItem}>
                      <span style={styles.metaLabel}>Calendar Window</span>
                      <span style={styles.metaValue}>{s.typicalMonths}</span>
                    </div>
                    <div style={styles.metaItem}>
                      <span style={styles.metaLabel}>Buy-In Bracket</span>
                      <span style={styles.metaValue}>{s.buyInRange}</span>
                    </div>
                    <div style={styles.metaItem}>
                      <span style={styles.metaLabel}>Starting Stack</span>
                      <span style={styles.metaValue}>{s.startingStackBB}</span>
                    </div>
                  </div>

                  <p style={styles.cardSummary}>{s.registrationStrategy}</p>
                </div>

                <div style={styles.cardFooter}>
                  <Link href={seriesGuidePath(s.slug)} style={styles.readGuideLink}>
                    Open Full Series Strategy Guide
                  </Link>
                  <Link href="/tools/bankroll-calculator" style={styles.toolLink}>
                    Bankroll Sizing
                  </Link>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section style={styles.faqPlate}>
          <h2 style={styles.h2}>Frequently Asked Questions On Live Poker Series Strategy</h2>
          <div style={styles.faqList}>
            {INDEX_FAQS.map((item) => (
              <div key={item.q} style={styles.faqItem}>
                <h3 style={styles.faqQ}>{item.q}</h3>
                <p style={styles.faqA}>{item.a}</p>
              </div>
            ))}
          </div>
        </section>

        <CitationBacklinkBox
          title="Major Live Poker Series, Tour & Festival Strategy Guides"
          canonicalUrl={SERIES_GUIDES_URL}
          badgeType="research"
          badgeLabel="Tournament Series Intelligence"
          badgeValue="10 Major US Tours & Festivals"
          summary="Complete Tournament Series Strategy Guides For WSOP, WPT, WSOP Circuit, MSPT, RGPS, Wynn, Venetian, Borgata, SHRPO, And Texas Major Festivals."
          publishedYear="2026"
          slug="poker-series-strategy-guides"
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
  seriesLink: {
    color: '#00d4ff',
    textDecoration: 'none',
    fontWeight: 700,
  },
  tdCell: {
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
  cardsSection: {
    marginBottom: '32px',
  },
  cardGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(500px, 1fr))',
    gap: '18px',
    marginTop: '16px',
  },
  cardPlate: {
    backgroundColor: '#111a2a',
    border: '1px solid #1e293b',
    borderRadius: '8px',
    padding: '22px',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'space-between',
  },
  cardTopMeta: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: '8px',
    marginBottom: '10px',
  },
  cardCityBadge: {
    fontSize: '11px',
    fontWeight: 700,
    color: '#00d4ff',
    backgroundColor: '#0a0f18',
    border: '1px solid #1e293b',
    padding: '4px 9px',
    borderRadius: '4px',
  },
  cardRatingBadge: {
    fontSize: '11px',
    fontWeight: 700,
    color: '#10b981',
  },
  h3: {
    fontSize: '19px',
    fontWeight: 800,
    margin: '0 0 14px',
    lineHeight: 1.3,
  },
  cardTitleLink: {
    color: '#f8fafc',
    textDecoration: 'none',
  },
  metaGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap: '10px',
    backgroundColor: '#0a0f18',
    border: '1px solid #1e293b',
    borderRadius: '6px',
    padding: '12px',
    marginBottom: '14px',
  },
  metaItem: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
  },
  metaLabel: {
    fontSize: '11px',
    fontWeight: 700,
    color: '#94a3b8',
    textTransform: 'uppercase',
  },
  metaValue: {
    fontSize: '13px',
    fontWeight: 600,
    color: '#f8fafc',
  },
  cardSummary: {
    fontSize: '13.5px',
    lineHeight: 1.6,
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
    fontSize: '13px',
    fontWeight: 700,
    textDecoration: 'none',
  },
  toolLink: {
    color: '#10b981',
    fontSize: '13px',
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
