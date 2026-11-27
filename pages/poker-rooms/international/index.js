/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  INTERNATIONAL & GLOBAL LIVE POKER DESTINATION GUIDES (/poker-rooms/international)
 * ═══════════════════════════════════════════════════════════════════════════════
 * Global poker travel, rake, currency, tournament series, and visitor tax directory
 * covering 10 premier international poker destinations across Europe, Asia-Pacific,
 * Canada, and The Bahamas.
 *
 * House style: Title Case, zero em dashes.
 */

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import SEOHead from '../../../src/components/seo/SEOHead';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import CitationBacklinkBox from '../../../src/components/seo/CitationBacklinkBox';
import SmarterAccountUnlockGate from '../../../src/components/seo/SmarterAccountUnlockGate';
import AiPromptLauncher from '../../../src/components/seo/AiPromptLauncher';
import {
  INTERNATIONAL_POKER_GUIDES,
  INTERNATIONAL_REGIONS,
  INTERNATIONAL_GUIDES_AS_OF,
  INTERNATIONAL_BASE_PATH,
  INTERNATIONAL_URL,
  internationalGuidePath,
} from '../../../src/content/guides/internationalMarkets';

const DIRECTORY_FAQS = [
  {
    q: 'Which International Poker Destinations Have 0% Casino Cage Tax Withholding?',
    a: 'Major Global Poker Hubs Including London (United Kingdom), Rozvadov & Prague (Czech Republic), Monte Carlo (Monaco), Macau (China SAR), Melbourne (Australia), Montreal (Canada), And Nassau (The Bahamas) Levy 0% Casino Cage Income Tax Withholding On Live Poker Winnings (Subject To Your Home-Country Tax Residency Rules).',
  },
  {
    q: 'How Do European 5% Poker Rake Structures Compare To US 10% Rake Structures?',
    a: 'Most European Poker Rooms (London, Barcelona, Rozvadov, Prague, Monte Carlo) Charge A Lower 5% Pot Percentage With A Higher €10 To €20 Cap, Whereas US Rooms Typically Charge 10% With A Lower $5 To $7 Cap. In Europe, Small-To-Medium Pots Under €120 Are Raked Far Less, While Deep-Stack 200BB All-In Pots Pay Higher Total Rake.',
  },
  {
    q: 'Do I Need A Physical Passport To Enter International Casino Poker Rooms?',
    a: 'Yes. Virtually Every Regulated European, Asian, Australian, And Caribbean Casino Requires A Valid Physical Passport At The Door Reception Desk For Age Verification And Anti-Money-Laundering (AML) Entry Registration.',
  },
  {
    q: 'What Is The Legal Limit For Carrying Cash Bankrolls Across International Borders?',
    a: 'There Is No Limit On How Much Legal Poker Bankroll You Can Carry Internationally, Provided You File An Official Customs Currency Declaration (FinCEN Form 105 Entering/Exiting The US, Or EU €10,000+ Customs Declaration) Whenever Carrying $10,000 USD / €10,000 EUR Or More In Combined Currency Or Casino Chips.',
  },
];

export default function InternationalPokerGuidesIndexPage() {
  const [selectedRegion, setSelectedRegion] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');

  const filteredGuides = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return INTERNATIONAL_POKER_GUIDES.filter((g) => {
      const matchesReg = selectedRegion === 'All' || g.region === selectedRegion;
      if (!matchesReg) return false;
      if (!q) return true;
      return (
        g.slug.toLowerCase().includes(q) ||
        g.city.toLowerCase().includes(q) ||
        g.country.toLowerCase().includes(q) ||
        g.currency.toLowerCase().includes(q) ||
        g.flagshipSeries.toLowerCase().includes(q) ||
        g.summary.toLowerCase().includes(q)
      );
    });
  }, [selectedRegion, searchQuery]);

  const jsonLd = [
    {
      '@type': 'CollectionPage',
      '@id': `${INTERNATIONAL_URL}#collection`,
      name: 'International Poker Room City Guides: 10 Global Cash & Tournament Hubs',
      description:
        'Explore 10 Premier International Live Poker Destination Guides: London, Barcelona, Rozvadov, Monte Carlo, Prague, Manila, Macau, Melbourne, Montreal, And Nassau.',
      url: INTERNATIONAL_URL,
      inLanguage: 'en-US',
      dateModified: INTERNATIONAL_GUIDES_AS_OF,
      isPartOf: { '@id': 'https://smarter.poker/#website' },
      publisher: { '@id': 'https://smarter.poker/#organization' },
      speakable: {
        '@type': 'SpeakableSpecification',
        cssSelector: ['h1', 'header p:first-of-type'],
      },
      mainEntity: {
        '@type': 'ItemList',
        numberOfItems: INTERNATIONAL_POKER_GUIDES.length,
        itemListElement: INTERNATIONAL_POKER_GUIDES.map((g, idx) => ({
          '@type': 'ListItem',
          position: idx + 1,
          name: `${g.city}, ${g.country} Live Poker Guide`,
          url: `https://smarter.poker${internationalGuidePath(g.slug)}`,
        })),
      },
    },
    {
      '@type': 'FAQPage',
      '@id': `${INTERNATIONAL_URL}#faq`,
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
      '@id': `${INTERNATIONAL_URL}#breadcrumb`,
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Smarter.Poker', item: 'https://smarter.poker/' },
        { '@type': 'ListItem', position: 2, name: 'Poker Rooms & Markets', item: 'https://smarter.poker/poker-rooms/guides' },
        { '@type': 'ListItem', position: 3, name: 'International Poker Room Guides', item: INTERNATIONAL_URL },
      ],
    },
  ];

  return (
    <div style={styles.page}>
      <SEOHead
        title="International Poker Room City Guides"
        description="Explore 10 Premier International Live Poker Destination Guides: London, Barcelona, Rozvadov, Monte Carlo, Prague, Manila, Macau, Melbourne, Montreal, And Nassau."
        canonical={INTERNATIONAL_BASE_PATH}
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
            Regional Market Guides
          </Link>
          <span style={styles.crumbSep}>/</span>
          <span style={styles.crumbCurrent}>International Poker Destination Guides</span>
        </nav>

        <header style={styles.heroPlate}>
          <div style={styles.badgeRow}>
            <span style={styles.cyanBadge}>10 GLOBAL LIVE POKER DESTINATIONS</span>
            <span style={styles.emeraldBadge}>RAKE CAPS, CURRENCY, SERIES &amp; VISITOR TAX RULES</span>
          </div>

          <h1 style={styles.h1}>
            International &amp; Global Live Poker Destination Guides: Top 10 World Poker Hubs
          </h1>

          <p style={styles.lead}>
            <strong>Direct Answer:</strong> Planning An International Cash Game Or Championship Tournament Trip Requires Knowing Each Destination{"'"}s <strong>Table Currency</strong>, <strong>Percentage Rake Cap</strong>, <strong>Flagship Festival Schedule (EPT, Triton, WSOP Europe, WSOP Paradise, WPT)</strong>, And <strong>Visitor Gaming Tax Rules</strong>. Compare All <strong>10 Global Live Poker Capitals</strong> Below.
          </p>

          <div style={styles.quickCrossLinks}>
            <Link href="/tools/poker-trip-planner" style={styles.crossBtnCyan}>
              Open Poker Trip Budget &amp; EV Planner
            </Link>
            <Link href="/tools/rake-calculator" style={styles.crossBtnEmerald}>
              Compare Global Rake Impact Calculator
            </Link>
            <Link href="/poker-rooms/guides" style={styles.crossBtnOutline}>
              12 US Regional Poker Market Guides
            </Link>
            <Link href="/learn/poker-as-a-business" style={styles.crossBtnOutline}>
              International Tax Treaties &amp; W-8BEN Guide
            </Link>
          </div>
        </header>

        {/* Global Comparison Table */}
        <section aria-label="Global Poker Destinations Comparison Matrix" style={styles.sectionPlate}>
          <h2 style={styles.h2}>
            Top 10 Global Poker Hubs: Table Currency, Stakes, Rake Caps &amp; Flagship Series
          </h2>
          <div style={{ overflowX: 'auto' }}>
            <table style={styles.table}>
              <thead>
                <tr style={styles.trHead}>
                  <th style={styles.th}>City &amp; Country</th>
                  <th style={styles.th}>Table Currency</th>
                  <th style={styles.th}>Signature Cash Stakes</th>
                  <th style={styles.th}>Rake Structure</th>
                  <th style={styles.th}>Flagship Series</th>
                </tr>
              </thead>
              <tbody>
                {INTERNATIONAL_POKER_GUIDES.map((g) => (
                  <tr key={g.slug} style={styles.trBody}>
                    <td style={styles.tdTitle}>
                      <Link href={internationalGuidePath(g.slug)} style={styles.tableLink}>
                        {g.city}, {g.country}
                      </Link>
                    </td>
                    <td style={styles.tdCyan}>{g.currency}</td>
                    <td style={styles.td}>{g.typicalStakes}</td>
                    <td style={styles.tdEmerald}>{g.rakeCap}</td>
                    <td style={styles.td}>{g.flagshipSeries}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Region Filter & Cards */}
        <section aria-label="Browse International Destination Guides" style={styles.sectionPlate}>
          <div style={styles.filterBar}>
            <div style={styles.filterPills}>
              {['All', ...INTERNATIONAL_REGIONS].map((reg) => (
                <button
                  key={reg}
                  type="button"
                  onClick={() => setSelectedRegion(reg)}
                  style={selectedRegion === reg ? styles.pillActive : styles.pill}
                >
                  {reg}
                </button>
              ))}
            </div>
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filter By City, Country, Series (EPT, WSOPE)..."
              aria-label="Filter International Poker Guides"
              style={styles.searchInput}
            />
          </div>

          <div style={styles.cardGrid}>
            {filteredGuides.map((g) => (
              <article key={g.slug} style={styles.card}>
                <div>
                  <div style={styles.cardHeaderRow}>
                    <span style={styles.cardCodeBadge}>{g.region}</span>
                    <span style={styles.cardCatBadge}>{g.currency}</span>
                  </div>
                  <h3 style={styles.cardTitle}>
                    <Link href={internationalGuidePath(g.slug)} style={styles.cardTitleLink}>
                      {g.city}, {g.country}
                    </Link>
                  </h3>
                  <p style={styles.cardSummary}>{g.summary}</p>
                  <div style={styles.metaBox}>
                    <div>
                      <strong style={{ color: '#38bdf8' }}>Rake Cap:</strong> {g.rakeCap}
                    </div>
                    <div style={{ marginTop: 4 }}>
                      <strong style={{ color: '#34d399' }}>Major Series:</strong> {g.flagshipSeries}
                    </div>
                  </div>
                </div>

                <div style={{ marginTop: 14 }}>
                  <Link href={internationalGuidePath(g.slug)} style={styles.cardCtaBtn}>
                    Open {g.city} Poker Destination Guide
                  </Link>
                </div>
              </article>
            ))}
          </div>
        </section>

        {/* FAQs */}
        <section aria-label="Frequently Asked Questions" style={styles.sectionPlate}>
          <h2 style={styles.h2}>Frequently Asked Questions: International Live Poker Travel</h2>
          <div style={styles.faqList}>
            {DIRECTORY_FAQS.map((item) => (
              <div key={item.q} style={styles.faqItem}>
                <h3 style={styles.faqQ}>{item.q}</h3>
                <p style={styles.faqA}>{item.a}</p>
              </div>
            ))}
          </div>
        </section>

        <div style={{ margin: '24px 0' }}>
          <SmarterAccountUnlockGate
            variant="live-venue-intel"
            context={"poker-rooms-international-index"}
            title={"Track Global Poker Room Schedules, Stakes & Series Alerts Free"}
            redirectPath={INTERNATIONAL_BASE_PATH}
          />
        </div>

        <CitationBacklinkBox
          title="International & Global Live Poker Destination Guides (10 World Hubs)"
          canonicalUrl={INTERNATIONAL_URL}
          badgeType="research"
          badgeLabel="Global Poker Intelligence"
          badgeValue="10 World Destinations"
          summary="Comprehensive directory of the 10 premier international live poker destinations comparing local currencies, cash game stakes, rake caps, tournament series, and visitor tax rules."
          publishedYear="2026"
          slug="international-poker-destination-guides"
        />

        <AiPromptLauncher
          title="International & Global Live Poker Destination Guides"
          canonicalUrl={INTERNATIONAL_URL}
          canonicalPath={INTERNATIONAL_BASE_PATH}
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
    background: 'linear-gradient(180deg, #0d1f33 0%, #071321 100%)',
    border: '1px solid #2b4663',
    borderRadius: 0,
    padding: '28px 26px',
    marginBottom: 28,
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
    borderRadius: 0,
    background: '#38bdf8',
    color: '#04131d',
    fontWeight: 700,
    fontSize: 13,
    textDecoration: 'none',
  },
  crossBtnEmerald: {
    padding: '9px 15px',
    borderRadius: 0,
    background: '#10b981',
    color: '#04131d',
    fontWeight: 700,
    fontSize: 13,
    textDecoration: 'none',
  },
  crossBtnOutline: {
    padding: '9px 15px',
    borderRadius: 0,
    background: '#0d1f33',
    color: '#38bdf8',
    border: '1px solid #2b4663',
    fontWeight: 700,
    fontSize: 13,
    textDecoration: 'none',
  },
  sectionPlate: {
    background: 'linear-gradient(180deg, #0d1f33 0%, #071321 100%)',
    border: '1px solid #2b4663',
    borderRadius: 0,
    padding: '24px 22px',
    marginBottom: 28,
  },
  h2: { fontSize: 22, fontWeight: 800, color: '#f8fafc', margin: '0 0 16px 0' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 13.5 },
  trHead: { borderBottom: '1px solid #2b4663', textAlign: 'left', color: '#38bdf8' },
  th: { padding: '10px 12px', fontWeight: 700 },
  trBody: { borderBottom: '1px solid #2b4663' },
  tdTitle: { padding: '11px 12px', fontWeight: 700 },
  td: { padding: '11px 12px', color: '#cbd5e1' },
  tdCyan: { padding: '11px 12px', color: '#38bdf8', fontWeight: 700 },
  tdEmerald: { padding: '11px 12px', color: '#34d399', fontWeight: 700 },
  tableLink: { color: '#f8fafc', textDecoration: 'none' },
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
    borderRadius: 0,
    border: '1px solid #2b4663',
    background: '#0d1f33',
    color: '#cbd5e1',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
  },
  pillActive: {
    padding: '6px 13px',
    borderRadius: 0,
    border: '1px solid #38bdf8',
    background: '#38bdf8',
    color: '#04131d',
    fontSize: 13,
    fontWeight: 700,
    cursor: 'pointer',
  },
  searchInput: {
    padding: '8px 14px',
    borderRadius: 0,
    border: '1px solid #2b4663',
    background: '#050811',
    color: '#f8fafc',
    fontSize: 13.5,
    minWidth: 260,
  },
  cardGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(min(320px, 100%), 1fr))',
    gap: 18,
  },
  card: {
    background: '#0d1f33',
    border: '1px solid #2b4663',
    borderRadius: 0,
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
    borderRadius: 0,
    background: 'rgba(56, 189, 248, 0.16)',
    color: '#38bdf8',
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
  metaBox: {
    fontSize: 12.5,
    lineHeight: 1.5,
    color: '#cbd5e1',
    background: '#070b14',
    padding: '10px 12px',
    borderRadius: 0,
    border: '1px solid #2b4663',
  },
  cardCtaBtn: {
    display: 'inline-block',
    padding: '8px 14px',
    borderRadius: 0,
    background: '#38bdf8',
    color: '#04131d',
    fontSize: 13,
    fontWeight: 700,
    textDecoration: 'none',
  },
  faqList: { display: 'grid', gap: 14 },
  faqItem: {
    background: '#0d1f33',
    border: '1px solid #2b4663',
    borderRadius: 0,
    padding: '16px 18px',
  },
  faqQ: { fontSize: 16, fontWeight: 700, color: '#f8fafc', margin: '0 0 6px 0' },
  faqA: { fontSize: 14, lineHeight: 1.6, color: '#cbd5e1', margin: 0 },
};
