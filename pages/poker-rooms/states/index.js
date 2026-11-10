/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  TOP 15 US STATE POKER LEGALITY, TAX & ROOM DIRECTORY HUB (/poker-rooms/states)
 * ═══════════════════════════════════════════════════════════════════════════════
 * Interactive directory covering the top 15 US poker states with legal age,
 * state income tax rates, rake models, W-2G withholding rules, and regulated
 * online poker status.
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
  US_POKER_STATES,
  STATES_AS_OF,
  STATES_BASE_PATH,
  STATES_URL,
  stateGuidePath,
} from '../../../src/content/guides/states';

const DIRECTORY_FAQS = [
  {
    q: 'Which Major US Poker States Have 0% State Income Tax On Poker Winnings?',
    a: 'Nevada, Texas, And Florida All Levy 0.0% State Individual Income Tax On Cash Game And Poker Tournament Winnings, Making Las Vegas, Houston/Dallas/Austin, And South Florida/Tampa The Three Most Tax-Advantaged Bases For Poker Players.',
  },
  {
    q: 'Which US States Allow Playing Live Poker At Age 18+',
    a: 'Licensed Pari-Mutuel Cardrooms In Florida (25+ Venues), Most Private Membership Social Poker Clubs In Texas And Ohio, And Select Non-Alcohol Tribal Poker Rooms Such As Turning Stone In New York Legally Admit Players Age 18 And Older.',
  },
  {
    q: 'Which US States Have Regulated Real-Money Online Poker?',
    a: 'Nevada, New Jersey, Michigan, And Pennsylvania Operate Full State-Regulated Real-Money Online Poker Platforms (Such As WSOP Online, PokerStars, And BetMGM) Connected Through The Multi-State Internet Gaming Agreement (MSIGA).',
  },
  {
    q: 'When Does A Casino Issue An IRS Form W-2G For Poker?',
    a: 'US Casinos Issue IRS Form W-2G Automatically Whenever Net Poker Tournament Winnings (Payout Minus Buy-In) Exceed $5,000. Live Cash Game Chip Redemptions At The Cage Do Not Trigger W-2G Tax Withholding Forms, Though Currency Transaction Reports (CTRs) Apply To Cash Transactions Over $10,000.',
  },
];

export default function USStatePokerDirectoryPage() {
  const [searchQuery, setSearchQuery] = useState('');

  const filteredStates = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return US_POKER_STATES;
    return US_POKER_STATES.filter(
      (s) =>
        s.slug.toLowerCase().includes(q) ||
        s.code.toLowerCase().includes(q) ||
        s.name.toLowerCase().includes(q) ||
        s.topCities.some((c) => c.toLowerCase().includes(q)) ||
        s.rakeModel.toLowerCase().includes(q) ||
        s.summary.toLowerCase().includes(q)
    );
  }, [searchQuery]);

  const jsonLd = [
    {
      '@type': 'CollectionPage',
      '@id': `${STATES_URL}#collection`,
      name: 'US State Poker Legality, Tax Rates, Rake & Room Directory Hub',
      description:
        'Complete Guide To Live And Online Poker Across The Top 15 US States: Legal Age (18+ Vs 21+), State Income Tax Rates, W-2G Rules, Rake Models, And Active Cardrooms.',
      url: STATES_URL,
      inLanguage: 'en-US',
      dateModified: STATES_AS_OF,
      isPartOf: { '@id': 'https://smarter.poker/#website' },
      publisher: { '@id': 'https://smarter.poker/#organization' },
      speakable: {
        '@type': 'SpeakableSpecification',
        cssSelector: ['h1', 'header p:first-of-type'],
      },
      mainEntity: {
        '@type': 'ItemList',
        numberOfItems: US_POKER_STATES.length,
        itemListElement: US_POKER_STATES.map((s, idx) => ({
          '@type': 'ListItem',
          position: idx + 1,
          name: `${s.name} (${s.code}) Poker Laws, Taxes & Rooms Guide`,
          url: `https://smarter.poker${stateGuidePath(s.slug)}`,
        })),
      },
    },
    {
      '@type': 'FAQPage',
      '@id': `${STATES_URL}#faq`,
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
      '@id': `${STATES_URL}#breadcrumb`,
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Smarter.Poker', item: 'https://smarter.poker/' },
        { '@type': 'ListItem', position: 2, name: 'Poker Room Guides', item: 'https://smarter.poker/poker-rooms/guides' },
        { '@type': 'ListItem', position: 3, name: 'US State Poker Laws & Tax Hub', item: STATES_URL },
      ],
    },
  ];

  return (
    <div style={styles.page}>
      <SEOHead
        title="US State Poker Laws, Taxes And Cardrooms"
        description="Complete Guide To Live And Online Poker Across The Top 15 US States: Legal Age (18+ Vs 21+), State Income Tax Rates, W-2G Rules, Rake Models, And Active Cardrooms."
        canonical={STATES_BASE_PATH}
        jsonLd={jsonLd}
      />

      <UniversalHeader pageDepth={2} />

      <main style={styles.container}>
        <nav aria-label="Breadcrumb" style={styles.breadcrumbs}>
          <Link href="/" style={styles.crumbLink}>
            Smarter.Poker
          </Link>
          <span style={styles.crumbSep}>/</span>
          <Link href="/poker-rooms/guides" style={styles.crumbLink}>
            Poker Room Guides
          </Link>
          <span style={styles.crumbSep}>/</span>
          <span style={styles.crumbCurrent}>US State Poker Legality &amp; Tax Hub</span>
        </nav>

        <header style={styles.heroPlate}>
          <div style={styles.badgeRow}>
            <span style={styles.cyanBadge}>TOP 15 US POKER JURISDICTIONS</span>
            <span style={styles.emeraldBadge}>LEGAL AGE, TAX RATES, RAKE &amp; W-2G RULES</span>
          </div>

          <h1 style={styles.h1}>
            US State Poker Legality, Income Tax Rates, Rake Models &amp; Cardroom Directory
          </h1>

          <p style={styles.lead}>
            <strong>Direct Answer:</strong> Live And Online Poker Regulations Vary Dramatically Across US State Lines:
            <strong> Nevada, Texas, And Florida Offer 0% State Income Tax</strong>;
            <strong> California Operates 85+ Rooms On A Flat Per-Flop Collection Drop</strong>;
            <strong> Texas Social Clubs Charge $0 Pot Rake And Hourly Seat Time</strong>; And
            <strong> Nevada, New Jersey, Michigan, And Pennsylvania Share Regulated Multi-State Online Poker Liquidity</strong>.
          </p>

          <div style={styles.quickCrossLinks}>
            <Link href="/hub/poker-near-me" style={styles.crossBtnCyan}>
              Find Live Poker Rooms Near Me
            </Link>
            <Link href="/poker-rooms/guides" style={styles.crossBtnEmerald}>
              12 Regional City Market Guides
            </Link>
            <Link href="/poker-rooms/first-time-guide" style={styles.crossBtnOutline}>
              First-Time Live Poker Room Guide
            </Link>
            <Link href="/poker-rooms/comps-and-tipping-guide" style={styles.crossBtnOutline}>
              Casino Comps &amp; Tipping Guide
            </Link>
            <Link href="/tools/rake-calculator" style={styles.crossBtnOutline}>
              Live Cash Rake Calculator
            </Link>
          </div>
        </header>

        <section aria-label="Search US States" style={styles.filterPlate}>
          <label htmlFor="state-search" style={styles.searchLabel}>
            Search By State Name, 2-Letter Code, Or City (E.G. NV, TX, FL, CA, PA, NJ, Las Vegas, Houston)
          </label>
          <input
            id="state-search"
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Filter By State Code Or City (Nevada, Texas, Florida, California, Pennsylvania)..."
            style={styles.searchInput}
          />
        </section>

        {/* Master Comparison Table */}
        <section aria-label="Master US State Poker Comparison Table" style={styles.tablePlate}>
          <div style={styles.sectionHeader}>
            <h2 style={styles.h2}>Master Comparison Of Top 15 US Poker States</h2>
            <span style={styles.asOfText}>
              Showing {filteredStates.length} Of {US_POKER_STATES.length} States
            </span>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={styles.table}>
              <thead>
                <tr style={styles.trHead}>
                  <th style={styles.th}>State</th>
                  <th style={styles.th}>Min Age</th>
                  <th style={styles.th}>State Income Tax</th>
                  <th style={styles.th}>Active Live Rooms</th>
                  <th style={styles.th}>Typical Rake Model</th>
                  <th style={styles.th}>Full State Guide</th>
                </tr>
              </thead>
              <tbody>
                {filteredStates.map((s) => (
                  <tr key={s.slug} style={styles.trBody}>
                    <td style={styles.tdTitle}>
                      <Link href={stateGuidePath(s.slug)} style={styles.stateLink}>
                        {s.name} ({s.code})
                      </Link>
                    </td>
                    <td style={styles.tdCyan}>{s.minAge}</td>
                    <td style={styles.tdEmerald}>{s.stateIncomeTaxRate}</td>
                    <td style={styles.tdCell}>{s.approxLiveRooms}</td>
                    <td style={styles.tdCell}>{s.rakeModel}</td>
                    <td style={styles.tdAction}>
                      <Link href={stateGuidePath(s.slug)} style={styles.guideLink}>
                        Open {s.code} Guide
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* State Cards */}
        <section aria-label="State By State Cards" style={styles.cardsSection}>
          <h2 style={styles.h2}>State-By-State Regulatory, Tax &amp; Cardroom Profiles</h2>
          <div style={styles.cardGrid}>
            {filteredStates.map((s) => (
              <article key={s.slug} style={styles.cardPlate}>
                <div>
                  <div style={styles.cardTopMeta}>
                    <span style={styles.cardCodeBadge}>
                      {s.code} | {s.minAge}
                    </span>
                    <span style={styles.cardTaxBadge}>{s.stateIncomeTaxRate}</span>
                  </div>

                  <h3 style={styles.h3}>
                    <Link href={stateGuidePath(s.slug)} style={styles.cardTitleLink}>
                      {s.name} Poker Laws, Tax &amp; Rooms
                    </Link>
                  </h3>

                  <div style={styles.metaBox}>
                    <div>
                      <strong>Top Cities:</strong> {s.topCities.join(', ')}
                    </div>
                    <div>
                      <strong>Rake Model:</strong> {s.rakeModel}
                    </div>
                    <div>
                      <strong>Online Status:</strong> {s.onlineRealMoneyStatus}
                    </div>
                  </div>

                  <p style={styles.cardSummary}>{s.summary}</p>
                </div>

                <div style={styles.cardFooter}>
                  <Link href={stateGuidePath(s.slug)} style={styles.readGuideLink}>
                    View {s.name} Laws &amp; Tax Guide
                  </Link>
                  <Link href="/hub/poker-near-me" style={styles.toolLink}>
                    Live Rooms
                  </Link>
                </div>
              </article>
            ))}
          </div>
        </section>

        {/* FAQs */}
        <section style={styles.tablePlate}>
          <h2 style={styles.h2}>Frequently Asked Questions On US State Poker Laws &amp; Taxes</h2>
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
          title="US State Poker Legality, Tax Rates, Rake & Room Directory Hub"
          canonicalUrl={STATES_URL}
          badgeType="research"
          badgeLabel="15-State Regulatory Index"
          badgeValue="Laws, Taxes & Rake Models"
          summary="Complete Guide To Live And Online Poker Across The Top 15 US States: Legal Age (18+ Vs 21+), State Income Tax Rates, W-2G Rules, Rake Models, And Active Cardrooms."
          publishedYear="2026"
          slug="us-state-poker-laws-directory"
        />

        <AiPromptLauncher
          title="US State Poker Legality, Tax Rates & Room Directory"
          canonicalUrl={STATES_URL}
          canonicalPath={STATES_BASE_PATH}
          markdownUrl="/poker-rooms/states.md"
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
  stateLink: {
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
  cardCodeBadge: {
    fontSize: '11px',
    fontWeight: 700,
    color: '#00d4ff',
    backgroundColor: '#0a0f18',
    border: '1px solid #1e293b',
    padding: '3px 8px',
    borderRadius: '4px',
  },
  cardTaxBadge: {
    fontSize: '11px',
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
  metaBox: {
    backgroundColor: '#0a0f18',
    border: '1px solid #1e293b',
    borderRadius: '6px',
    padding: '10px 12px',
    fontSize: '12.5px',
    color: '#cbd5e1',
    lineHeight: 1.6,
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
