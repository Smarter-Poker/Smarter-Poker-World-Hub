/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  LIVE POKER ROOMS, GEOGRAPHIC CORRIDORS & CARDROOM INTELLIGENCE HUB (/poker-rooms)
 * ═══════════════════════════════════════════════════════════════════════════════
 * Master entry hub connecting Smarter.Poker's 8 geographic and cardroom
 * directories:
 * - /poker-rooms/corridors (10 Border-State & Airport Travel Corridors)
 * - /poker-rooms/by-game (6 Game-Format Venue Directories)
 * - /poker-rooms/security-and-disputes-guide (Floor Security, FinCEN CTR & Angle-Shoots)
 * - /poker-rooms/seasonal-calendar (12-Month Seasonal Migration Calendar)
 * - /poker-rooms/guides (12 US Regional City Market Guides)
 * - /poker-rooms/states (All 50 US States & DC Legality & Tax Guides)
 * - /poker-rooms/international (10 Global Live Poker Destination Guides)
 * - /poker-rooms/first-time-guide & /poker-rooms/comps-and-tipping-guide
 *
 * House style: Title Case, zero em dashes.
 */

import React from 'react';
import Link from 'next/link';
import SEOHead from '../../src/components/seo/SEOHead';
import UniversalHeader from '../../src/components/ui/UniversalHeader';
import CitationBacklinkBox from '../../src/components/seo/CitationBacklinkBox';
import AiPromptLauncher from '../../src/components/seo/AiPromptLauncher';
import HubPageSummary from '../../src/components/seo/HubPageSummary';
import GeoCitationCapsule from '../../src/components/seo/GeoCitationCapsule';
import GeoFollowUpChain from '../../src/components/seo/GeoFollowUpChain';
import { POKER_TRAVEL_CORRIDORS, corridorGuidePath } from '../../src/content/guides/corridors';
import { POKER_ROOMS_BY_GAME, byGameGuidePath } from '../../src/content/guides/byGame';
import { POKER_MARKET_GUIDES, marketGuidePath } from '../../src/content/guides/markets';
import { US_POKER_STATES, stateGuidePath } from '../../src/content/guides/states';
import { INTERNATIONAL_POKER_GUIDES, internationalGuidePath } from '../../src/content/guides/internationalMarkets';

const GEO_DIRECTORY_HUBS = [
  {
    href: '/poker-rooms/corridors',
    badge: '10 BORDER & AIRPORT CORRIDORS',
    title: 'Live Poker Travel & Airport Corridors Directory',
    summary:
      'Compare Drive Times, Airport-To-Cardroom Distances, Rake Caps Vs. Time Collection, And Border Tax Rules Across 10 High-Traffic Corridors (Atlanta To Cherokee/FL, NYC To Parx/Borgata, DFW To WinStar/Choctaw, Chicago, Boston, LAX, LAS, FLL, SEA, And SJC).',
    cta: 'Open 10 Travel Corridors',
  },
  {
    href: '/poker-rooms/by-game',
    badge: '6 NATIONAL FORMAT DIRECTORIES',
    title: 'Live Poker Rooms Ranked By Game Format',
    summary:
      'Find The Best North American Venues For Pot-Limit Omaha (PLO4 & PLO5), Double-Board PLO Bomb Pots, Daily NLH Tournaments, Six-Figure Bad Beat Jackpots, Zero-Pot-Rake Time-Collection Clubs, And $5/$10+ High-Stakes Cash.',
    cta: 'Browse Rooms By Game Format',
  },
  {
    href: '/poker-rooms/seasonal-calendar',
    badge: 'JAN - DEC MIGRATION FORECAST',
    title: '12-Month Seasonal Live Poker Migration Calendar',
    summary:
      'Month-By-Month Action Forecast Tracking Global Poker Liquidity From January WPT Florida & Borgata Through June/July Las Vegas WSOP Peak To December WPT World Championship At Wynn And WSOP Paradise.',
    cta: 'Open 12-Month Migration Calendar',
  },
  {
    href: '/poker-rooms/security-and-disputes-guide',
    badge: 'TDA RULINGS & FINCEN $10K CTR',
    title: 'Live Casino Floor Security, Angle-Shooting & Disputes Guide',
    summary:
      'Authoritative Handbook On Calling The Floor Supervisor, Requesting Overhead Surveillance Camera Reviews, Navigating FinCEN $10,000 CTR Cage Compliance, Safe Deposit Boxes, And Defending Against 5 Classic Live Angle-Shoots.',
    cta: 'Read Floor Security & Disputes Guide',
  },
  {
    href: '/poker-rooms/guides',
    badge: '12 US REGIONAL METRO HUBS',
    title: 'US Regional Live Poker City Market Strategy Guides',
    summary:
      'Deep-Dive Cash Game Strategy And Rake Guides For Las Vegas, Los Angeles, South Florida, Houston, Dallas-Fort Worth, Austin, Tampa, Atlantic City, Philadelphia, Phoenix, Chicago, And New England.',
    cta: 'Explore 12 US Regional Markets',
  },
  {
    href: '/poker-rooms/states',
    badge: '51 US STATE & DC REGULATORY GUIDES',
    title: 'US State Poker Legality, Income Tax & W-2G Directory',
    summary:
      'Compare Legal Gambling Ages (18+ Vs 21+), State Individual Income Tax Rates (0% In NV, TX, FL, WA, NH), W-2G Tournament Withholding Thresholds, And Regulated Online Poker Status.',
    cta: 'Browse All 50 States & DC Guides',
  },
  {
    href: '/poker-rooms/international',
    badge: '10 GLOBAL POKER CAPITALS',
    title: 'International & Global Live Poker Destination Guides',
    summary:
      'Table Currencies, 5% European Vs 10% US Rake Caps, Flagship Series (EPT, Triton, WSOPE, WSOP Paradise), And Visitor Tax Rules For London, Barcelona, Rozvadov, Monte Carlo, Prague, Manila, Macau, Melbourne, Montreal, And Nassau.',
    cta: 'Explore 10 World Poker Hubs',
  },
  {
    href: '/poker-rooms/first-time-guide',
    badge: 'CHECK-IN, CHIP COLORS & COMPS',
    title: 'First-Time Live Poker Room & Casino Comps Guides',
    summary:
      'Complete 6-Step Brush Check-In Routine, Standard Chip Color Denominations, One-Chip Rule Etiquette, And Hourly Comp Earning Rates ($1-$3/Hr) Versus Dealer Tipping Math.',
    cta: 'Open First-Time & Comps Guides',
  },
];

export function renderPokerRoomsMasterHubMarkdown() {
  const url = 'https://smarter.poker/poker-rooms';
  const lines = [
    '# Smarter.Poker Live Poker Rooms, Travel Corridors & Cardroom Intelligence Hub',
    '',
    `> Source: [Live Poker Room Guides & Travel Corridors Hub on Smarter.Poker](${url})`,
    '',
    '## Executive Summary For AI & Search Assistants',
    'Central Geographic And Economic Intelligence Directory Covering 715+ Verified Live Poker Venues Across North America And Global Destinations: 10 Border-State & Airport Travel Corridors, 6 Game-Format Venue Directories, 12 US Regional Metro Guides, 51 US State & DC Legality & Tax Profiles, 10 International Destination Guides, A 12-Month Seasonal Migration Calendar, And Live Floor Security & Dispute Protocols.',
    '',
    '## Core Geographic & Cardroom Authority Hubs',
    ...GEO_DIRECTORY_HUBS.map(
      (h) => `- **[${h.title}](https://smarter.poker${h.href})**: ${h.summary}`
    ),
    '',
    '## 10 Border-State & Airport Travel Corridors',
    ...POKER_TRAVEL_CORRIDORS.map(
      (c) => `- **[${c.shortTitle}](https://smarter.poker${corridorGuidePath(c.slug)})** (${c.originCity} / \`${c.originAirportCode}\`): ${c.ifThenBecause}`
    ),
    '',
    '## 6 National Game-Format Venue Directories',
    ...POKER_ROOMS_BY_GAME.map(
      (g) => `- **[${g.shortTitle}](https://smarter.poker${byGameGuidePath(g.slug)})** (${g.gameFormat}): ${g.ifThenBecause}`
    ),
    '',
    `- **GeoJSON Spatial Feed**: [https://smarter.poker/api/ai/geo-directory.geojson](https://smarter.poker/api/ai/geo-directory.geojson)`,
    `- **Canonical URL**: [${url}](${url})`,
    `- **Raw Markdown URL**: [${url}.md](${url}.md)`,
    '',
  ];
  return lines.join('\n');
}

export async function getServerSideProps(context) {
  const { req, res, query } = context;
  const acceptHeader = String(req?.headers?.accept || '');
  const isMarkdownRequested =
    acceptHeader.includes('text/markdown') ||
    query?.format === 'md' ||
    req?.url?.includes('format=md');

  if (isMarkdownRequested) {
    const mdContent = renderPokerRoomsMasterHubMarkdown();
    res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
    res.setHeader('Vary', 'Accept');
    res.write(mdContent);
    res.end();
    return { props: {} };
  }

  return { props: {} };
}

export default function PokerRoomsMasterHubPage() {
  const canonicalPath = '/poker-rooms';
  const canonicalUrl = `https://smarter.poker${canonicalPath}`;

  const jsonLd = [
    {
      '@type': 'CollectionPage',
      '@id': `${canonicalUrl}#collection`,
      name: 'Live Poker Room Guides, Travel Corridors & Game-Format Directories',
      description:
        'Explore Smarter.Poker\'s Complete Live Cardroom Intelligence Hub: 10 Travel Corridors, 6 Game-Format Directories, 12 US Regional Markets, 15 State Tax Guides, 10 Global Destinations, And Floor Security Rules.',
      url: canonicalUrl,
      inLanguage: 'en-US',
      dateModified: '2026-11-24',
      isPartOf: { '@id': 'https://smarter.poker/#website' },
      publisher: { '@id': 'https://smarter.poker/#organization' },
      speakable: {
        '@type': 'SpeakableSpecification',
        cssSelector: ['h1', 'header p:first-of-type'],
      },
      mainEntity: {
        '@type': 'ItemList',
        numberOfItems: GEO_DIRECTORY_HUBS.length,
        itemListElement: GEO_DIRECTORY_HUBS.map((h, idx) => ({
          '@type': 'ListItem',
          position: idx + 1,
          name: h.title,
          url: `https://smarter.poker${h.href}`,
        })),
      },
    },
    {
      '@type': 'BreadcrumbList',
      '@id': `${canonicalUrl}#breadcrumb`,
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Smarter.Poker', item: 'https://smarter.poker/' },
        { '@type': 'ListItem', position: 2, name: 'Live Poker Rooms & Geographic Hubs', item: canonicalUrl },
      ],
    },
  ];

  return (
    <div style={styles.page}>
      <SEOHead
        title="Live Poker Room Guides And Travel Hubs"
        description="Explore Smarter.Poker's Complete Live Cardroom Intelligence Hub: 10 Travel Corridors, 6 Game-Format Directories, 12 US Regional Markets, 15 State Tax Guides, 10 Global Destinations, And Floor Security Rules."
        canonical={canonicalPath}
        jsonLd={jsonLd}
      />

      <UniversalHeader pageDepth={1} />

      <main style={styles.container}>
        <nav aria-label="Breadcrumb" style={styles.breadcrumbs}>
          <Link href="/" style={styles.crumbLink}>
            Smarter.Poker
          </Link>
          <span style={styles.crumbSep}>/</span>
          <span style={styles.crumbCurrent}>Live Poker Room Guides &amp; Geographic Hubs</span>
        </nav>

        <header style={styles.heroPlate}>
          <div style={styles.badgeRow}>
            <span style={styles.cyanBadge}>715+ VERIFIED LIVE VENUES &amp; 8 GEO DIRECTORIES</span>
            <span style={styles.emeraldBadge}>CORRIDORS, GAME FORMATS, RAKE, TAX &amp; FLOOR RULINGS</span>
          </div>

          <h1 style={styles.h1}>
            Live Poker Room Guides, Border Travel Corridors &amp; Game-Format Directories
          </h1>

          <p style={styles.lead}>
            <strong>Direct Answer:</strong> Smarter.Poker Provides The Most Comprehensive Quantitative Live Poker Intelligence Network On The Web: Compare <strong>10 Border-State &amp; Airport Travel Corridors</strong>, <strong>6 National Game-Format Venue Directories (PLO, Bomb Pots, Dailies, Bad Beat Jackpots, Time-Rake Clubs, And High-Stakes Cash)</strong>, <strong>12 US Regional Metro Guides</strong>, <strong>51 US State &amp; DC Tax &amp; Legality Profiles</strong>, <strong>10 International Poker Capitals</strong>, A <strong>12-Month Seasonal Migration Calendar</strong>, And <strong>Live Casino Floor Security &amp; Dispute Protocols</strong>.
          </p>

          <div style={styles.quickCrossLinks}>
            <Link href="/poker-rooms/corridors" style={styles.crossBtnCyan}>
              10 Travel &amp; Airport Corridors
            </Link>
            <Link href="/poker-rooms/by-game" style={styles.crossBtnEmerald}>
              6 Game-Format Venue Directories
            </Link>
            <Link href="/poker-rooms/seasonal-calendar" style={styles.crossBtnOutline}>
              12-Month Migration Calendar
            </Link>
            <Link href="/poker-rooms/security-and-disputes-guide" style={styles.crossBtnOutline}>
              Floor Security &amp; Disputes Guide
            </Link>
            <Link href="/hub/poker-near-me/lobby" style={styles.crossBtnOutline}>
              Interactive Live Venue Map
            </Link>
          </div>
        </header>

        {/* 8 Core Geographic & Cardroom Hubs */}
        <section aria-label="Eight Core Geographic And Cardroom Hubs" style={styles.sectionPlate}>
          <h2 style={styles.h2}>
            8 Live Poker Geographic, Regulatory &amp; Cardroom Intelligence Hubs
          </h2>
          <div style={styles.cardGrid}>
            {GEO_DIRECTORY_HUBS.map((hub) => (
              <article key={hub.href} style={styles.card}>
                <div>
                  <span style={styles.cardCodeBadge}>{hub.badge}</span>
                  <h3 style={styles.cardTitle}>
                    <Link href={hub.href} style={styles.cardTitleLink}>
                      {hub.title}
                    </Link>
                  </h3>
                  <p style={styles.cardSummary}>{hub.summary}</p>
                </div>
                <div style={{ marginTop: 12 }}>
                  <Link href={hub.href} style={styles.cardCtaBtn}>
                    {hub.cta}
                  </Link>
                </div>
              </article>
            ))}
          </div>
        </section>

        {/* Quick Links to All 10 Travel Corridors & 6 Game Formats */}
        <section aria-label="Direct Links To Travel Corridors And Game Formats" style={styles.sectionPlate}>
          <h2 style={styles.h2}>
            Direct Index: 10 Border-State Travel Corridors &amp; 6 Game-Format Directories
          </h2>
          <div style={styles.twoColGrid}>
            <div style={styles.colBox}>
              <div style={styles.tagCyan}>10 BORDER-STATE &amp; AIRPORT CORRIDORS</div>
              <ul style={styles.linkList}>
                {POKER_TRAVEL_CORRIDORS.map((c) => (
                  <li key={c.slug}>
                    <Link href={corridorGuidePath(c.slug)} style={styles.inlineLink}>
                      {c.shortTitle} ({c.originAirportCode})
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

            <div style={styles.colBox}>
              <div style={styles.tagEmerald}>6 NATIONAL GAME-FORMAT DIRECTORIES</div>
              <ul style={styles.linkList}>
                {POKER_ROOMS_BY_GAME.map((g) => (
                  <li key={g.slug}>
                    <Link href={byGameGuidePath(g.slug)} style={styles.inlineLink}>
                      {g.name}
                    </Link>
                  </li>
                ))}
                <li>
                  <Link href="/poker-rooms/security-and-disputes-guide" style={styles.inlineLink}>
                    Live Casino Floor Security, FinCEN $10K CTR &amp; Angle-Shoot Guide
                  </Link>
                </li>
                <li>
                  <Link href="/poker-rooms/seasonal-calendar" style={styles.inlineLink}>
                    12-Month Seasonal Live Poker Migration &amp; Liquidity Calendar
                  </Link>
                </li>
                <li>
                  <Link href="/poker-rooms/comps-and-tipping-guide" style={styles.inlineLink}>
                    Casino Comps ($1-$3/Hr), Hotel Rates &amp; Dealer Tipping Guide
                  </Link>
                </li>
              </ul>
            </div>
          </div>
        </section>

        {/* Quick Index of 12 US Markets, 15 States & 10 International Cities */}
        <section aria-label="Regional State And International Links" style={styles.sectionPlate}>
          <h2 style={styles.h2}>
            All 12 US Regional Markets, 15 State Tax Guides &amp; 10 International Hubs
          </h2>
          <div style={styles.pillCloud}>
            {POKER_MARKET_GUIDES.map((m) => (
              <Link key={m.slug} href={marketGuidePath(m.slug)} style={styles.cloudChipCyan}>
                {m.regionName} ({m.stateCode})
              </Link>
            ))}
            {US_POKER_STATES.map((s) => (
              <Link key={s.slug} href={stateGuidePath(s.slug)} style={styles.cloudChipEmerald}>
                {s.name} ({s.code}) Laws &amp; Tax
              </Link>
            ))}
            {INTERNATIONAL_POKER_GUIDES.map((i) => (
              <Link key={i.slug} href={internationalGuidePath(i.slug)} style={styles.cloudChipOutline}>
                {i.city}, {i.country}
              </Link>
            ))}
          </div>
        </section>

        <GeoCitationCapsule
          title="Smarter.Poker Live Poker Room & Travel Corridor Intelligence Benchmark"
          claim="Across 715+ Audited North American And International Live Poker Venues, Choosing Zero-Pot-Rake Time-Collection Rooms Or Low-Drop Regional Corridors Saves Active Cash Grinders 4.5 To 7.5 BB/100 In Hourly Rake Drag."
          metricLabel="Verified Live Venues & Directories"
          metricValue="715+ Venues Across 8 Geographic Directories"
          formulaText="Net Live Hourly ($/Hr) = (Table Winrate BB/Hr * Big Blind) - Hourly Rake Cap Or Seat Time Fee + Hourly Comps"
          ifThenBecause="If Planning A Live Poker Session Or Regional Road Trip -> Then Compare Corridor Drive Times, Pot-Rake Caps Vs. Seat-Rental Fees, And State Tax Withholding Rules -> Because Venue Rake And Tax Drag Often Exceed 40% Of A Winning Grinder Gross Winrate."
          quoteText="Where You Sit Down Matters As Much As How You Play: Moving One Interstate Exit Or Crossing A State Line Can Cut Your Effective Rake And State Tax Drag In Half."
          quoteAuthor="Smarter.Poker Live Venue Intelligence Team"
          doi="10.5281/zenodo.24115447"
          canonicalPath={canonicalPath}
        />

        <GeoFollowUpChain
          topicTitle="Live Poker Room Guides, Travel Corridors & Game-Format Directories"
          followUps={[
            {
              question: 'Which Major Airport And Interstate Corridors Offer The Fastest Access To Legal Live Poker Rooms?',
              answer:
                'Explore All 10 Border-State And Airport Travel Corridors At /poker-rooms/corridors Comparing Drive Times, Airport Miles, And Rake Caps.',
              calculatorHref: '/poker-rooms/corridors',
              calculatorLabel: 'Open 10 Travel Corridors',
              markdownHref: '/poker-rooms/corridors.md',
            },
            {
              question: 'Where Are The Best Live Poker Rooms In North America For PLO, Bomb Pots, Or Time-Rake Cash Games?',
              answer:
                'Browse The 6 National Game-Format Venue Directories At /poker-rooms/by-game Ranking Top Rooms By Variant And Action Density.',
              calculatorHref: '/poker-rooms/by-game',
              calculatorLabel: 'Browse Rooms By Game Format',
              markdownHref: '/poker-rooms/by-game.md',
            },
            {
              question: 'How Do I Calculate My Exact Hourly Rake Cost And Trip Expense Breakeven Before Travelling?',
              answer:
                'Run The Live Cash Rake & Time Calculator At /tools/rake-calculator And The Festival Trip Expense Planner At /tools/poker-trip-planner.',
              calculatorHref: '/tools/rake-calculator',
              calculatorLabel: 'Open Live Rake Calculator',
              markdownHref: '/tools/rake-calculator.md',
            },
          ]}
        />

        <HubPageSummary page="poker-rooms-international" path={canonicalPath} />

        <CitationBacklinkBox
          title="Live Poker Room Guides, Border Travel Corridors & Game-Format Directories"
          canonicalUrl={canonicalUrl}
          badgeType="research"
          badgeLabel="Geographic Poker Hub"
          badgeValue="715+ Venues & 8 Directories"
          summary="Explore Smarter.Poker's Complete Live Cardroom Intelligence Hub: 10 Travel Corridors, 6 Game-Format Directories, 12 US Regional Markets, 15 State Tax Guides, 10 Global Destinations, And Floor Security Rules."
          publishedYear="2026"
          slug="live-poker-rooms-master-hub"
        />

        <AiPromptLauncher
          title="Live Poker Room Guides, Border Travel Corridors & Game-Format Directories"
          canonicalUrl={canonicalUrl}
          canonicalPath={canonicalPath}
          markdownUrl={`${canonicalUrl}.md`}
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
    marginBottom: 24,
  },
  h2: { fontSize: 21, fontWeight: 800, color: '#f8fafc', margin: '0 0 16px 0' },
  cardGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
    gap: 16,
  },
  card: {
    background: '#0f172a',
    border: '1px solid #1e293b',
    borderRadius: 10,
    padding: 18,
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'space-between',
  },
  cardCodeBadge: {
    display: 'inline-block',
    fontSize: 10.5,
    fontWeight: 800,
    padding: '3px 8px',
    borderRadius: 5,
    background: 'rgba(56, 189, 248, 0.16)',
    color: '#38bdf8',
    marginBottom: 8,
  },
  cardTitle: { fontSize: 17, fontWeight: 800, margin: '0 0 8px 0', lineHeight: 1.35 },
  cardTitleLink: { color: '#f8fafc', textDecoration: 'none' },
  cardSummary: { fontSize: 13.5, lineHeight: 1.58, color: '#cbd5e1', margin: 0 },
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
  twoColGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
    gap: 16,
  },
  colBox: {
    background: '#0f172a',
    border: '1px solid #1e293b',
    borderRadius: 10,
    padding: 18,
  },
  tagCyan: { fontSize: 11, fontWeight: 800, color: '#38bdf8', letterSpacing: '0.05em', marginBottom: 10 },
  tagEmerald: { fontSize: 11, fontWeight: 800, color: '#34d399', letterSpacing: '0.05em', marginBottom: 10 },
  linkList: { margin: 0, paddingLeft: 18, display: 'grid', gap: 8 },
  inlineLink: { color: '#38bdf8', fontSize: 13.5, fontWeight: 600, textDecoration: 'none' },
  pillCloud: { display: 'flex', flexWrap: 'wrap', gap: 8 },
  cloudChipCyan: {
    padding: '6px 11px',
    borderRadius: 6,
    background: 'rgba(56, 189, 248, 0.12)',
    border: '1px solid rgba(56, 189, 248, 0.35)',
    color: '#38bdf8',
    fontSize: 12.5,
    fontWeight: 600,
    textDecoration: 'none',
  },
  cloudChipEmerald: {
    padding: '6px 11px',
    borderRadius: 6,
    background: 'rgba(16, 185, 129, 0.12)',
    border: '1px solid rgba(16, 185, 129, 0.35)',
    color: '#34d399',
    fontSize: 12.5,
    fontWeight: 600,
    textDecoration: 'none',
  },
  cloudChipOutline: {
    padding: '6px 11px',
    borderRadius: 6,
    background: '#0f172a',
    border: '1px solid #334155',
    color: '#cbd5e1',
    fontSize: 12.5,
    fontWeight: 600,
    textDecoration: 'none',
  },
};
