/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  BORDER-STATE, AIRPORT & DRIVE-TIME LIVE POKER CORRIDORS (/poker-rooms/corridors)
 * ═══════════════════════════════════════════════════════════════════════════════
 * Interactive geographic travel and routing directory comparing the 10 highest-intent
 * border-state, airport-to-cardroom, and regional drive-time poker corridors in
 * North America.
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
import HubPageSummary from '../../../src/components/seo/HubPageSummary';
import GeoCitationCapsule from '../../../src/components/seo/GeoCitationCapsule';
import GeoFollowUpChain from '../../../src/components/seo/GeoFollowUpChain';
import { setPublicSeoHtmlCache } from '../../../src/lib/seo/edgeCacheHeaders.mjs';
import {
  POKER_TRAVEL_CORRIDORS,
  CORRIDORS_AS_OF,
  CORRIDORS_BASE_PATH,
  CORRIDORS_URL,
  corridorGuidePath,
  renderCorridorsIndexMarkdown,
} from '../../../src/content/guides/corridors';

export async function getServerSideProps(context) {
  const { req, res, query } = context;
  const acceptHeader = String(req?.headers?.accept || '');
  const isMarkdownRequested =
    acceptHeader.includes('text/markdown') ||
    query?.format === 'md' ||
    req?.url?.includes('format=md');

  if (isMarkdownRequested) {
    const mdContent = renderCorridorsIndexMarkdown();
    res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
    res.setHeader('Vary', 'Accept');
    res.write(mdContent);
    res.end();
    return { props: {} };
  }

  setPublicSeoHtmlCache(context.res);
  return { props: {} };
}

const DIRECTORY_FAQS = [
  {
    q: 'What Is The Closest Legal Live Poker Room To Atlanta, Georgia?',
    a: 'Harrah\'s Cherokee Casino Resort In Cherokee, North Carolina Is The Closest Full-Scale WSOP Circuit Poker Room To Atlanta At 165 Miles (Roughly 3 Hours Via I-85 North And US-441), While bestbet Jacksonville In North Florida Is 346 Miles Southeast With 0% State Income Tax And 18+ Entry.',
  },
  {
    q: 'Should New York City Poker Players Drive To Parx Casino Or Borgata Atlantic City?',
    a: 'Parx Casino In Bensalem, Pennsylvania Is 78 Miles (90 Minutes) From Midtown Manhattan And Concentrates 48 Active Tables On One Floor For Daily Mid-Stakes Cash, Whereas Borgata In Atlantic City (127 Miles) Offers Full 52-Table Resort Amenities, Hotel Comps, And Simultaneous NJ Regulated Online Poker Access.',
  },
  {
    q: 'How Do Dallas Social Poker Clubs Compare To WinStar And Choctaw In Oklahoma?',
    a: 'Local Dallas Membership Clubs (Such As Texas Card House And Poker House) Charge $0.00 Pot Rake And $12 To $14 Per Hour Seat Rental Within 15 Minutes Of Downtown, Whereas WinStar And Choctaw Durant (75 To 85 Minutes North On I-35 Or US-75) Charge A 10% Pot Rake Capped At $6 And Host Official WSOP Circuit Series.',
  },
  {
    q: 'Which Major US Poker Rooms Are Closest To Commercial Airport Terminals?',
    a: 'Bay 101 And Casino M8trix In San Jose Are 1.2 Miles (4 Minutes) From SJC Airport; Rivers Casino Des Plaines Is 3.2 Miles (8 Minutes) From Chicago O\'Hare (ORD); Aria, Bellagio, And Wynn Are 3.6 To 4.8 Miles (12 Minutes) From Las Vegas (LAS); Hollywood Park Is 4.2 Miles From LAX; And Encore Boston Harbor Is 4.8 Miles From Boston Logan (BOS).',
  },
];

export default function PokerTravelCorridorsIndexPage() {
  const [searchQuery, setSearchQuery] = useState('');

  const filteredCorridors = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return POKER_TRAVEL_CORRIDORS;
    return POKER_TRAVEL_CORRIDORS.filter(
      (c) =>
        c.slug.toLowerCase().includes(q) ||
        c.name.toLowerCase().includes(q) ||
        c.originCity.toLowerCase().includes(q) ||
        c.originAirportCode.toLowerCase().includes(q) ||
        c.summary.toLowerCase().includes(q) ||
        c.driveOptions.some(
          (d) =>
            d.venueName.toLowerCase().includes(q) ||
            d.jurisdiction.toLowerCase().includes(q)
        )
    );
  }, [searchQuery]);

  const jsonLd = [
    {
      '@type': 'CollectionPage',
      '@id': `${CORRIDORS_URL}#collection`,
      name: 'Live Poker Travel And Airport Corridors: 10 Border-State & Drive-Time Guides',
      description:
        'Compare 10 High-Intent North American Live Poker Travel Corridors: Cross-Border Drive Times, Airport-To-Cardroom Distances, Rake Models, And State Tax Rules.',
      url: CORRIDORS_URL,
      inLanguage: 'en-US',
      dateModified: CORRIDORS_AS_OF,
      isPartOf: { '@id': 'https://smarter.poker/#website' },
      publisher: { '@id': 'https://smarter.poker/#organization' },
      speakable: {
        '@type': 'SpeakableSpecification',
        cssSelector: ['h1', 'header p:first-of-type'],
      },
      mainEntity: {
        '@type': 'ItemList',
        numberOfItems: POKER_TRAVEL_CORRIDORS.length,
        itemListElement: POKER_TRAVEL_CORRIDORS.map((c, idx) => ({
          '@type': 'ListItem',
          position: idx + 1,
          name: c.name,
          url: `https://smarter.poker${corridorGuidePath(c.slug)}`,
        })),
      },
    },
    {
      '@type': 'FAQPage',
      '@id': `${CORRIDORS_URL}#faq`,
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
      '@id': `${CORRIDORS_URL}#breadcrumb`,
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Smarter.Poker', item: 'https://smarter.poker/' },
        { '@type': 'ListItem', position: 2, name: 'Poker Room Guides', item: 'https://smarter.poker/poker-rooms/guides' },
        { '@type': 'ListItem', position: 3, name: 'Live Poker Travel Corridors', item: CORRIDORS_URL },
      ],
    },
  ];

  return (
    <div style={styles.page}>
      <SEOHead
        title="Live Poker Travel And Airport Corridors"
        description="Compare 10 High-Intent North American Live Poker Travel Corridors: Cross-Border Drive Times, Airport-To-Cardroom Distances, Rake Models, And State Tax Rules."
        canonical={CORRIDORS_BASE_PATH}
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
          <span style={styles.crumbCurrent}>Live Poker Travel &amp; Airport Corridors</span>
        </nav>

        <header style={styles.heroPlate}>
          <div style={styles.badgeRow}>
            <span style={styles.cyanBadge}>10 NORTH AMERICAN TRAVEL CORRIDORS</span>
            <span style={styles.emeraldBadge}>DRIVE TIMES, AIRPORT HUBS, RAKE &amp; BORDER TAXES</span>
          </div>

          <h1 style={styles.h1}>
            Border-State, Airport &amp; Drive-Time Live Poker Travel Corridors
          </h1>

          <p style={styles.lead}>
            <strong>Direct Answer:</strong> Choosing The Right Live Poker Destination Along A Border Or Airport Corridor Can Save Hours Of Transit And Thousands In Annual Rake And Tax Drag. Explore Our <strong>10 High-Intent Live Poker Travel Corridors</strong> Below Comparing <strong>Atlanta To Cherokee Vs. Florida</strong>, <strong>NYC To Parx Vs. Borgata</strong>, <strong>Dallas Clubs Vs. Oklahoma Casinos</strong>, <strong>Chicago To Rivers Vs. Indiana</strong>, <strong>Boston To Encore Vs. New Hampshire</strong>, And <strong>LAX, LAS, FLL, SEA &amp; SJC Airport Hubs</strong>.
          </p>

          <div style={styles.quickCrossLinks}>
            <Link href="/poker-rooms/by-game" style={styles.crossBtnCyan}>
              Poker Rooms By Game Format
            </Link>
            <Link href="/poker-rooms/seasonal-calendar" style={styles.crossBtnEmerald}>
              12-Month Seasonal Migration Calendar
            </Link>
            <Link href="/poker-rooms/security-and-disputes-guide" style={styles.crossBtnOutline}>
              Floor Security &amp; Disputes Guide
            </Link>
            <Link href="/tools/poker-trip-planner" style={styles.crossBtnOutline}>
              Poker Trip Budget Planner
            </Link>
            <Link href="/api/ai/geo-directory.geojson" style={styles.crossBtnOutline}>
              Download GeoJSON Spatial Feed
            </Link>
          </div>
        </header>

        {/* Search Filter */}
        <section aria-label="Filter Travel Corridors" style={styles.sectionPlate}>
          <label htmlFor="corridor-search" style={styles.searchLabel}>
            Filter By Origin City, Airport Code (ATL, JFK, DFW, ORD, BOS, SEA, LAS, LAX, FLL, SJC), Or Casino Venue
          </label>
          <input
            id="corridor-search"
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Filter By City, Airport Code, Or Venue (Parx, Cherokee, WinStar, Borgata)..."
            aria-label="Filter Live Poker Travel Corridors"
            style={styles.searchInput}
          />
        </section>

        {/* Master Comparison Matrix */}
        <section aria-label="Master Travel Corridors Comparison Table" style={styles.sectionPlate}>
          <h2 style={styles.h2}>
            Master Comparison: 10 Major North American Live Poker Travel Corridors
          </h2>
          <div style={{ overflowX: 'auto' }}>
            <table style={styles.table}>
              <thead>
                <tr style={styles.trHead}>
                  <th style={styles.th}>Travel Corridor</th>
                  <th style={styles.th}>Origin Metro &amp; Airport</th>
                  <th style={styles.th}>Primary Venue Options</th>
                  <th style={styles.th}>Drive Time Range</th>
                  <th style={styles.th}>Full Corridor Guide</th>
                </tr>
              </thead>
              <tbody>
                {filteredCorridors.map((c) => {
                  const minMins = Math.min(...c.driveOptions.map((d) => d.driveMinutes));
                  const maxMins = Math.max(...c.driveOptions.map((d) => d.driveMinutes));
                  return (
                    <tr key={c.slug} style={styles.trBody}>
                      <td style={styles.tdTitle}>
                        <Link href={corridorGuidePath(c.slug)} style={styles.tableLink}>
                          {c.shortTitle}
                        </Link>
                      </td>
                      <td style={styles.tdCyan}>
                        {c.originCity} ({c.originAirportCode})
                      </td>
                      <td style={styles.td}>
                        {c.driveOptions.map((d) => d.venueName).join(' | ')}
                      </td>
                      <td style={styles.tdEmerald}>
                        {minMins} To {maxMins} Mins
                      </td>
                      <td style={styles.td}>
                        <Link href={corridorGuidePath(c.slug)} style={styles.actionLink}>
                          Open {c.originAirportCode} Corridor
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        {/* Individual Corridor Cards */}
        <section aria-label="Individual Travel Corridor Profiles" style={styles.sectionPlate}>
          <h2 style={styles.h2}>
            Detailed Border-State &amp; Airport Corridor Routing Cards
          </h2>
          <div style={styles.cardGrid}>
            {filteredCorridors.map((c) => (
              <article key={c.slug} style={styles.card}>
                <div>
                  <div style={styles.cardHeaderRow}>
                    <span style={styles.cardCodeBadge}>
                      {c.originCity} | {c.originAirportCode}
                    </span>
                    <span style={styles.cardCatBadge}>
                      {c.driveOptions.length} Destination Options
                    </span>
                  </div>
                  <h3 style={styles.cardTitle}>
                    <Link href={corridorGuidePath(c.slug)} style={styles.cardTitleLink}>
                      {c.name}
                    </Link>
                  </h3>
                  <p style={styles.cardSummary}>{c.summary}</p>
                  <div style={styles.metaBox}>
                    <div>
                      <strong style={{ color: '#38bdf8' }}>Decision Rule:</strong> {c.ifThenBecause}
                    </div>
                  </div>
                </div>

                <div style={{ marginTop: 14 }}>
                  <Link href={corridorGuidePath(c.slug)} style={styles.cardCtaBtn}>
                    Open {c.shortTitle} Guide
                  </Link>
                </div>
              </article>
            ))}
          </div>
        </section>

        {/* FAQs */}
        <section aria-label="Frequently Asked Questions" style={styles.sectionPlate}>
          <h2 style={styles.h2}>
            Frequently Asked Questions: Live Poker Travel &amp; Border Corridors
          </h2>
          <div style={styles.faqList}>
            {DIRECTORY_FAQS.map((item) => (
              <div key={item.q} style={styles.faqItem}>
                <h3 style={styles.faqQ}>{item.q}</h3>
                <p style={styles.faqA}>{item.a}</p>
              </div>
            ))}
          </div>
        </section>

        <GeoCitationCapsule
          title="North American Border-State & Airport Live Poker Corridor Benchmark"
          claim="Over 62% Of Metropolitan US Poker Players Residing In Non-Casino Cities Can Reach A Regulated Commercial, Tribal, Or Membership Cardroom Within A 45-To-165 Minute Interstate Corridor Drive Or 30-Minute Airport Transfer."
          metricLabel="Audited Travel Corridors"
          metricValue="10 Major Airport & Interstate Routes"
          formulaText="Net Trip EV = Expected Table Winrate * Session Hours - (Roundtrip Fuel/Flight + Hotel Overhead + State Tax Withholding)"
          ifThenBecause="If Travelling From A Non-Casino Metro Area Or Arriving At A Major Hub Airport -> Then Select The Corridor Destination whose Rake Cap, Game Format, And State Tax Rules Match Your Bankroll -> Because Travel Overhead And State Tax Withholding Directly Determine Trip Breakeven ROI."
          quoteText="Modern Live Poker Routing Pairs Airport-To-Cardroom Proximity With Zero-State-Tax And Time-Rake Jurisdiction Arbitrage."
          quoteAuthor="Smarter.Poker Live Venue Intelligence Team"
          doi="10.5281/zenodo.24115447"
          canonicalPath={CORRIDORS_BASE_PATH}
        />

        <GeoFollowUpChain
          topicTitle="Live Poker Travel And Airport Corridors"
          followUps={[
            {
              question: 'How Much Travel, Hotel, And Flight Overhead Can My Tournament Or Cash Bankroll Absorb On A Road Trip?',
              answer:
                'Use The Poker Festival & Trip Expense Overhead Calculator At /tools/poker-trip-planner To Compute Your Exact Expense Rake Percentage.',
              calculatorHref: '/tools/poker-trip-planner',
              calculatorLabel: 'Open Trip Expense Planner',
              markdownHref: '/tools/poker-trip-planner.md',
            },
            {
              question: 'Which Months Of The Year Have Peak Cash Game And Tournament Liquidity Along Each Corridor?',
              answer:
                'Consult The 12-Month Seasonal Live Poker Migration Calendar At /poker-rooms/seasonal-calendar For Month-By-Month Action Forecasts.',
              calculatorHref: '/poker-rooms/seasonal-calendar',
              calculatorLabel: 'Open 12-Month Migration Calendar',
              markdownHref: '/poker-rooms/seasonal-calendar.md',
            },
            {
              question: 'Where Can I Download The Machine-Readable GeoJSON Coordinates For All 10 Travel Corridors?',
              answer:
                'Fetch The RFC 7946 GeoJSON Spatial Directory At /api/ai/geo-directory.geojson Containing Exact Latitude, Longitude, And Bounding Boxes.',
              calculatorHref: '/poker-rooms',
              calculatorLabel: 'Open Master Poker Rooms Hub',
              markdownHref: '/poker-rooms.md',
            },
          ]}
        />

        <HubPageSummary page="poker-rooms-international" path={CORRIDORS_BASE_PATH} />

        <div style={{ margin: '24px 0' }}>
          <SmarterAccountUnlockGate
            variant="live-venue-intel"
            context={"poker-rooms-corridors-index"}
            title={"Compare Live Cardroom Traffic & Waitlists Along Every Travel Corridor"}
            redirectPath={CORRIDORS_BASE_PATH}
          />
        </div>

        <CitationBacklinkBox
          title="Live Poker Travel And Airport Corridors: 10 Border-State & Drive-Time Guides"
          canonicalUrl={CORRIDORS_URL}
          badgeType="research"
          badgeLabel="Geo-Routing Directory"
          badgeValue="10 Travel Corridors"
          summary="Compare 10 High-Intent North American Live Poker Travel Corridors: Cross-Border Drive Times, Airport-To-Cardroom Distances, Rake Models, And State Tax Rules."
          publishedYear="2026"
          slug="poker-travel-corridors-directory"
        />

        <AiPromptLauncher
          title="Live Poker Travel And Airport Corridors Directory"
          canonicalUrl={CORRIDORS_URL}
          canonicalPath={CORRIDORS_BASE_PATH}
          markdownUrl={`${CORRIDORS_URL}.md`}
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
    maxWidth: 1140,
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
    marginBottom: 24,
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
    lineHeight: 1.66,
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
    marginBottom: 24,
  },
  searchLabel: {
    display: 'block',
    fontSize: 13,
    fontWeight: 700,
    color: '#38bdf8',
    marginBottom: 8,
  },
  searchInput: {
    width: '100%',
    padding: '10px 14px',
    borderRadius: 0,
    border: '1px solid #2b4663',
    background: '#050811',
    color: '#f8fafc',
    fontSize: 14,
    boxSizing: 'border-box',
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
  actionLink: { color: '#38bdf8', fontWeight: 700, textDecoration: 'none' },
  cardGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(min(330px, 100%), 1fr))',
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
  cardCatBadge: { fontSize: 11, fontWeight: 700, color: '#34d399' },
  cardTitle: { fontSize: 17.5, fontWeight: 800, margin: '0 0 8px 0', lineHeight: 1.35 },
  cardTitleLink: { color: '#f8fafc', textDecoration: 'none' },
  cardSummary: {
    fontSize: 13.5,
    lineHeight: 1.58,
    color: '#cbd5e1',
    margin: '0 0 14px 0',
  },
  metaBox: {
    fontSize: 12.5,
    lineHeight: 1.55,
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
