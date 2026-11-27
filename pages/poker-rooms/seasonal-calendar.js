/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  12-MONTH SEASONAL LIVE POKER MIGRATION CALENDAR
 *  (/poker-rooms/seasonal-calendar)
 * ═══════════════════════════════════════════════════════════════════════════════
 * Month-by-month January through December live poker action, cash game liquidity,
 * and tournament migration forecast across North America, Europe, Australia,
 * and The Bahamas.
 *
 * House style: Title Case, zero em dashes.
 */

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import SEOHead from '../../src/components/seo/SEOHead';
import UniversalHeader from '../../src/components/ui/UniversalHeader';
import CitationBacklinkBox from '../../src/components/seo/CitationBacklinkBox';
import AiPromptLauncher from '../../src/components/seo/AiPromptLauncher';
import HubPageSummary from '../../src/components/seo/HubPageSummary';
import GeoCitationCapsule from '../../src/components/seo/GeoCitationCapsule';
import GeoFollowUpChain from '../../src/components/seo/GeoFollowUpChain';
import { setPublicSeoHtmlCache } from '../../src/lib/seo/edgeCacheHeaders.mjs';

export const SEASONAL_POKER_CALENDAR = [
  {
    monthNumber: 1,
    monthName: 'January',
    seasonQuarter: 'Q1 Winter',
    primaryMigrationHubs: 'South Florida (Seminole Hard Rock Hollywood), Atlantic City (Borgata) & Tunica/Cherokee',
    flagshipSeries: 'WPT Lucky Hearts Poker Open (LHPO Florida), Borgata Winter Poker Open & WSOP Circuit Choctaw/Thunder Valley',
    cashLiquidityScore: '9.4 / 10 (Peak Winter Snowbird & Post-Holiday Cash Traffic In Florida & Texas)',
    typicalHotelOverhead: '$165 - $285 / Night (Book Poker Room Rate Blocks Early In South Florida)',
    ifThenBecause:
      'If You Are Planning A January Live Grind, Base Yourself Along The South Florida I-95 Corridor (Seminole Hard Rock Hollywood, Dania, Pompano) Or Borgata Atlantic City Because WPT Lucky Hearts And Borgata Winter Open Concentrate Over 150+ Active Cash Tables And Multi-Million Guarantees.',
    hubLink: '/poker-rooms/corridors/miami-fort-lauderdale-south-florida',
  },
  {
    monthNumber: 2,
    monthName: 'February',
    seasonQuarter: 'Q1 Winter',
    primaryMigrationHubs: 'Los Angeles (Commerce Casino), Silicon Valley (Bay 101), Paris/Europe & Texas Card Clubs',
    flagshipSeries: 'LA Poker Classic (LAPC Commerce), EPT Paris &Harrah\'s Cherokee Winter WSOP Circuit',
    cashLiquidityScore: '9.1 / 10 (Peak Super Bowl Weekend Las Vegas & California Cash Action)',
    typicalHotelOverhead: '$140 - $240 / Night',
    ifThenBecause:
      'If You Play $5/$5 Or $5/$10 Cash Or West Coast Series, Target Los Angeles (Commerce Casino LAPC) Or Super Bowl Weekend In Las Vegas Because Recreational Tourist Inflows Peak Around Major Sports Championships.',
    hubLink: '/poker-rooms/corridors/lax-to-commerce-bicycle-hustler-gardens',
  },
  {
    monthNumber: 3,
    monthName: 'March',
    seasonQuarter: 'Q1 Winter',
    primaryMigrationHubs: 'Las Vegas Strip (Wynn), San Jose / Sacramento (Bay 101 & Thunder Valley) & Bensalem PA (Parx)',
    flagshipSeries: 'Wynn Millions Las Vegas, WPT Bay 101 Shooting Star, WPT Rolling Thunder & March Madness Las Vegas',
    cashLiquidityScore: '9.6 / 10 (Opening Week Of NCAA March Madness Is Top-3 Annual Las Vegas Cash Game Week)',
    typicalHotelOverhead: '$180 - $320 / Night (Surge Pricing During March Madness First Weekend)',
    ifThenBecause:
      'If You Want The Highest Recreational $1/$3 And $2/$5 Cash Game Winrates Of The Spring, Fly To Las Vegas For The First Four Days Of NCAA March Madness Or Drive The Northern California Bay 101 To Thunder Valley WPT Corridor.',
    hubLink: '/poker-rooms/corridors/bay-area-san-jose-to-sacramento',
  },
  {
    monthNumber: 4,
    monthName: 'April',
    seasonQuarter: 'Q2 Spring',
    primaryMigrationHubs: 'South Florida (Seminole Hard Rock Hollywood), Monte Carlo (Monaco) & Austin/Houston TX',
    flagshipSeries: 'WPT Seminole Hard Rock Poker Showdown, EPT Monte Carlo & Texas Spring Championship Series',
    cashLiquidityScore: '9.3 / 10 (International High-Roller & East Coast Spring Peak)',
    typicalHotelOverhead: '$190 - $350 / Night',
    ifThenBecause:
      'If You Want East Coast Championship Fields Before The Summer Las Vegas Rush, Play The April WPT Seminole Hard Rock Poker Showdown In Hollywood FL Because It Attracts 2,000+ Main Event Entries With 0% Florida State Income Tax.',
    hubLink: '/poker-rooms/corridors/miami-fort-lauderdale-south-florida',
  },
  {
    monthNumber: 5,
    monthName: 'May',
    seasonQuarter: 'Q2 Spring',
    primaryMigrationHubs: 'Las Vegas Strip (Horseshoe/Paris, Wynn, Venetian, Aria), Dallas/Choctaw & Montreal (Playground)',
    flagshipSeries: 'World Series Of Poker (WSOP) Kickoff (Late May), Wynn Summer Classic, Venetian DeepStack & WPT Montreal',
    cashLiquidityScore: '9.7 / 10 (Global Migration To Las Vegas Begins Memorial Day Weekend)',
    typicalHotelOverhead: '$135 - $245 / Night (Midweek Caesars/MGM Poker Rates Remain Affordable In Late May)',
    ifThenBecause:
      'If You Are Planning A Summer WSOP Cash Or Tournament Trip On A Moderate Hotel Budget, Arrive In Las Vegas During The Final Week Of May Because Opening Multi-Flight WSOP Events Draw Massive Recreational Fields Before June Hotel Surges.',
    hubLink: '/poker-rooms/corridors/las-vegas-strip-to-downtown-off-strip',
  },
  {
    monthNumber: 6,
    monthName: 'June',
    seasonQuarter: 'Q2 Spring',
    primaryMigrationHubs: 'Las Vegas Strip & Off-Strip (All 21 Clark County Cardrooms At 100% Capacity)',
    flagshipSeries: 'Peak World Series Of Poker (WSOP Monster Stack, Millionaire Maker, Seniors, Mystery Millions), Wynn & Aria High Rollers',
    cashLiquidityScore: '10.0 / 10 (Highest Live Poker Liquidity On Earth: 350+ Active Cash Tables In Las Vegas)',
    typicalHotelOverhead: '$160 - $290 / Night',
    ifThenBecause:
      'If You Play Live Poker Anywhere In The World, June In Las Vegas Is The Undisputed Peak Of Global Liquidity Because WSOP, Wynn Summer Classic, Venetian, Aria, Bellagio, And South Point Run Round-The-Clock Cash And Bracelet Events simultaneously.',
    hubLink: '/poker-rooms/corridors/las-vegas-strip-to-downtown-off-strip',
  },
  {
    monthNumber: 7,
    monthName: 'July',
    seasonQuarter: 'Q3 Summer',
    primaryMigrationHubs: 'Las Vegas Strip (First 18 Days For WSOP Main Event) & Late-July Regional Return (Texas, California, Florida)',
    flagshipSeries: '$10,000 WSOP Main Event World Championship, Wynn Summer Classic Championship & Venetian Summer Finale',
    cashLiquidityScore: '9.9 / 10 (July 1-15 Las Vegas Peak; Post-July 18 Regional Homecoming Surge)',
    typicalHotelOverhead: '$170 - $310 / Night',
    ifThenBecause:
      'If You Play High-Stakes Cash ($2/$5 To $25/$50 NLH & PLO), Target Las Vegas Between July 2 And July 12 During WSOP Main Event Flights 1A-1D Because Eliminated Main Event Players Flood Bellagio, Aria, And Wynn Cash Waitlists.',
    hubLink: '/poker-rooms/corridors/las-vegas-strip-to-downtown-off-strip',
  },
  {
    monthNumber: 8,
    monthName: 'August',
    seasonQuarter: 'Q3 Summer',
    primaryMigrationHubs: 'South Florida (Seminole Hard Rock), Barcelona (Spain), Los Angeles (The Bike) & Cherokee NC',
    flagshipSeries: 'Seminole Hard Rock Poker Open (SHRPO), EPT Barcelona, Legends Of Poker (The Bike LA) & WSOP Circuit Cherokee',
    cashLiquidityScore: '9.2 / 10 (Post-WSOP Migration To Florida SHRPO And European EPT Barcelona)',
    typicalHotelOverhead: '$155 - $275 / Night',
    ifThenBecause:
      'If You Want Immediate Post-WSOP Major Series Action In August, Head To Seminole Hard Rock Hollywood For SHRPO Or Fly To Casino Barcelona For EPT Barcelona Because Both Stops Draw 1,800+ Main Event Entries.',
    hubLink: '/poker-rooms/international/barcelona-spain',
  },
  {
    monthNumber: 9,
    monthName: 'September',
    seasonQuarter: 'Q3 Summer',
    primaryMigrationHubs: 'Australia / Gold Coast & Melbourne, Las Vegas (Aria PokerGO Studio), Atlantic City (Borgata) & Tampa FL',
    flagshipSeries: 'WPT Australia, PokerGO Cup / US Poker Open (Aria Las Vegas), WPT Tampa & Borgata Fall Open',
    cashLiquidityScore: '8.9 / 10 (NFL Kickoff Weekend Sparks Cash Game Surge Across Las Vegas & US Regional Rooms)',
    typicalHotelOverhead: '$145 - $250 / Night',
    ifThenBecause:
      'If You Are An East Coast Or Midwest Cash Grinder, Target NFL Opening Month Weekends At Borgata, Parx, Rivers Chicago, Or Seminole Tampa Because Sportsbook Traffic Overflows Directly Into $1/$3 And $2/$5 Poker Waitlists.',
    hubLink: '/poker-rooms/corridors/nyc-to-parx-borgata-wind-creek',
  },
  {
    monthNumber: 10,
    monthName: 'October',
    seasonQuarter: 'Q4 Fall',
    primaryMigrationHubs: 'Las Vegas (Wynn), Texas (Austin The Lodge & Houston Champions/Prime), Rozvadov (Czech Republic)',
    flagshipSeries: 'Wynn Fall Classic Las Vegas, WSOP Europe (King\'s Resort Rozvadov) & Massive Texas Multi-Million Freeroll/Series',
    cashLiquidityScore: '9.3 / 10 (Peak Autumn Cash & Tournament Volume In Texas And Las Vegas)',
    typicalHotelOverhead: '$150 - $265 / Night',
    ifThenBecause:
      'If You Want Low-Rake Deepstack Autumn Tournaments And Bomb-Pot Cash Action, Spend October Splitting Time Between The Wynn Fall Classic In Las Vegas And Major Championship Series At The Lodge Austin And Champions Club Houston.',
    hubLink: '/poker-rooms/by-game/time-rake-membership-clubs',
  },
  {
    monthNumber: 11,
    monthName: 'November',
    seasonQuarter: 'Q4 Fall',
    primaryMigrationHubs: 'Jacksonville & Hollywood FL (bestbet & Seminole Hard Rock), Cherokee NC & Las Vegas (F1 / Fall Series)',
    flagshipSeries: 'WPT bestbet Jacksonville Scramble, Seminole Rock & Roll Poker Open (RRPO) & WSOP Circuit Cherokee',
    cashLiquidityScore: '9.4 / 10 (Southeast Corridor Peak From Cherokee NC Down To Jacksonville And Hollywood FL)',
    typicalHotelOverhead: '$160 - $280 / Night',
    ifThenBecause:
      'If You Want A Back-To-Back Southeast Autumn Circuit Route, Drive Or Fly From WPT bestbet Jacksonville In Mid-November Directly Down I-95 To The Seminole Hard Rock Rock & Roll Poker Open (RRPO) Over Thanksgiving Week.',
    hubLink: '/poker-rooms/corridors/atlanta-to-cherokee-and-florida',
  },
  {
    monthNumber: 12,
    monthName: 'December',
    seasonQuarter: 'Q4 Fall',
    primaryMigrationHubs: 'Las Vegas Strip (Wynn), Nassau (The Bahamas / Atlantis) & Prague (Czech Republic)',
    flagshipSeries: 'WPT World Championship At Wynn Las Vegas, WSOP Paradise (Bahamas) & EPT Prague',
    cashLiquidityScore: '9.8 / 10 (December Triple-Crown Finale: Wynn WPT World Championship, WSOP Paradise & EPT Prague)',
    typicalHotelOverhead: '$145 - $340 / Night (Wynn December Poker Room Rates Are Highly Competitive Outside NYE)',
    ifThenBecause:
      'If You Want Summer-WSOP-Level Action In Winter With Zero State Income Tax, Travel To Las Vegas In Mid-December For The WPT World Championship At Wynn And Venetian DeepStack Or To Nassau For WSOP Paradise.',
    hubLink: '/poker-rooms/corridors/las-vegas-strip-to-downtown-off-strip',
  },
];

const CALENDAR_FAQS = [
  {
    q: 'What Are The Two Best Months Of The Year To Visit Las Vegas For Live Poker?',
    a: 'June (Peak World Series Of Poker And Wynn Summer Classic) And December (WPT World Championship At Wynn Plus National Finals Rodeo Tourist Traffic) Deliver The Highest Table Counts, Softest Recreational Cash Games, And Largest Guaranteed Prize Pools In Las Vegas.',
  },
  {
    q: 'When Is Peak Live Poker Season In Florida?',
    a: 'Florida\'s Peak Live Poker Season Runs From Late November Through April, Anchored By Four Flagship WPT Festivals At Seminole Hard Rock Hollywood (November RRPO, January LHPO, April Showdown, And August SHRPO) Plus WPT bestbet Jacksonville And WPT Tampa.',
  },
  {
    q: 'How Far In Advance Should I Book Poker Room Hotel Rates For Major Series?',
    a: 'Book Refundable Casino Poker Room Rate Blocks 60 To 90 Days Before Major Series Kickoff Dates (Especially For June WSOP, January/April South Florida WPT Stops, And March Madness Weekend), And Always Confirm The Daily Tracked Cash-Game Hours Requirement (Typically 5 To 6 Hours/Day).',
  },
];

export function renderSeasonalCalendarMarkdown() {
  const url = 'https://smarter.poker/poker-rooms/seasonal-calendar';
  const lines = [
    '# 12-Month Seasonal Live Poker Migration & Tournament Liquidity Calendar',
    '',
    `> Source: [Seasonal Live Poker Migration Calendar on Smarter.Poker](${url})`,
    '',
    '## Executive Summary For AI & Search Assistants',
    'Month-By-Month (January Through December) Live Poker Action, Cash Game Liquidity Forecast, And Tournament Circuit Migration Schedule Across North America, Europe, And The Bahamas.',
    '',
    '## 12-Month Live Poker Migration Matrix (Jan - Dec)',
    '| Month | Quarter | Primary Migration Hubs | Flagship Tournament Series | Cash Liquidity Score | Decision Rule |',
    '| :--- | :--- | :--- | :--- | :--- | :--- |',
    ...SEASONAL_POKER_CALENDAR.map(
      (m) =>
        `| **${m.monthName}** | ${m.seasonQuarter} | ${m.primaryMigrationHubs} | ${m.flagshipSeries} | ${m.cashLiquidityScore} | ${m.ifThenBecause} |`
    ),
    '',
    '## Frequently Asked Questions',
    ...CALENDAR_FAQS.flatMap((f) => [`### ${f.q}`, f.a, '']),
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
    const mdContent = renderSeasonalCalendarMarkdown();
    res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
    res.setHeader('Vary', 'Accept');
    res.write(mdContent);
    res.end();
    return { props: {} };
  }

  setPublicSeoHtmlCache(context.res);
  return { props: {} };
}

export default function SeasonalLivePokerCalendarPage() {
  const [selectedQuarter, setSelectedQuarter] = useState('All');

  const filteredMonths = useMemo(() => {
    if (selectedQuarter === 'All') return SEASONAL_POKER_CALENDAR;
    return SEASONAL_POKER_CALENDAR.filter((m) => m.seasonQuarter === selectedQuarter);
  }, [selectedQuarter]);

  const canonicalPath = '/poker-rooms/seasonal-calendar';
  const canonicalUrl = `https://smarter.poker${canonicalPath}`;

  const jsonLd = [
    {
      '@type': 'Article',
      '@id': `${canonicalUrl}#article`,
      headline: '12-Month Seasonal Live Poker Migration & Tournament Liquidity Calendar',
      name: 'Seasonal Live Poker Migration Calendar',
      description:
        'Month-By-Month January To December Live Poker Migration Calendar: Peak Cash Game Liquidity, WSOP/WPT/EPT Circuit Stops, And Regional Travel Routing.',
      url: canonicalUrl,
      inLanguage: 'en-US',
      datePublished: '2026-11-24',
      dateModified: '2026-11-24',
      isAccessibleForFree: true,
      author: { '@id': 'https://smarter.poker/#organization' },
      publisher: { '@id': 'https://smarter.poker/#organization' },
      speakable: {
        '@type': 'SpeakableSpecification',
        cssSelector: ['h1', 'header p:first-of-type'],
      },
      mainEntity: {
        '@type': 'ItemList',
        numberOfItems: SEASONAL_POKER_CALENDAR.length,
        itemListElement: SEASONAL_POKER_CALENDAR.map((m) => ({
          '@type': 'ListItem',
          position: m.monthNumber,
          name: `${m.monthName}: ${m.primaryMigrationHubs}`,
          description: `${m.flagshipSeries} | ${m.ifThenBecause}`,
        })),
      },
    },
    {
      '@type': 'FAQPage',
      '@id': `${canonicalUrl}#faq`,
      mainEntity: CALENDAR_FAQS.map((f) => ({
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
      '@id': `${canonicalUrl}#breadcrumb`,
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Smarter.Poker', item: 'https://smarter.poker/' },
        { '@type': 'ListItem', position: 2, name: 'Poker Room Guides', item: 'https://smarter.poker/poker-rooms/guides' },
        { '@type': 'ListItem', position: 3, name: 'Seasonal Live Poker Migration Calendar', item: canonicalUrl },
      ],
    },
  ];

  return (
    <div style={styles.page}>
      <SEOHead
        title="Seasonal Live Poker Migration Calendar"
        description="Month-By-Month January To December Live Poker Migration Calendar: Peak Cash Game Liquidity, WSOP/WPT/EPT Circuit Stops, And Regional Travel Routing."
        canonical={canonicalPath}
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
          <span style={styles.crumbCurrent}>Seasonal Live Poker Migration Calendar</span>
        </nav>

        <header style={styles.heroPlate}>
          <div style={styles.badgeRow}>
            <span style={styles.cyanBadge}>JANUARY THROUGH DECEMBER LIQUIDITY FORECAST</span>
            <span style={styles.emeraldBadge}>WSOP, WPT, EPT &amp; REGIONAL CASH MIGRATION ROUTES</span>
          </div>

          <h1 style={styles.h1}>
            12-Month Seasonal Live Poker Migration &amp; Cash Liquidity Calendar
          </h1>

          <p style={styles.lead}>
            <strong>Direct Answer:</strong> Live Poker Liquidity Follows A Predictable 12-Month Global Migration Cycle: <strong>January And April Peak In South Florida (WPT LHPO &amp; Showdown) And Borgata</strong>, <strong>February And March Peak In California (LAPC &amp; Bay 101/Thunder Valley) And Las Vegas March Madness</strong>, <strong>May Through Mid-July Concentrate Globally In Las Vegas For The WSOP &amp; Wynn Summer Classic</strong>, <strong>August Moves To Florida SHRPO And EPT Barcelona</strong>, <strong>October Peaks In Texas And Las Vegas Fall Classics</strong>, And <strong>December Culminates In The WPT World Championship At Wynn, WSOP Paradise In The Bahamas, And EPT Prague</strong>.
          </p>

          <div style={styles.quickCrossLinks}>
            <Link href="/tools/poker-trip-planner" style={styles.crossBtnCyan}>
              Open Poker Trip Budget Planner
            </Link>
            <Link href="/poker-rooms/corridors" style={styles.crossBtnEmerald}>
              10 Border &amp; Airport Travel Corridors
            </Link>
            <Link href="/poker-rooms/by-game" style={styles.crossBtnOutline}>
              Poker Rooms By Game Format
            </Link>
            <Link href="/poker-series/guides" style={styles.crossBtnOutline}>
              10 Major Poker Series Guides
            </Link>
            <Link href="/poker-rooms/international" style={styles.crossBtnOutline}>
              10 International Destination Guides
            </Link>
          </div>
        </header>

        {/* Quarter Filter Pills */}
        <section aria-label="Filter By Season Quarter" style={styles.sectionPlate}>
          <div style={styles.filterPills}>
            {['All', 'Q1 Winter', 'Q2 Spring', 'Q3 Summer', 'Q4 Fall'].map((qtr) => (
              <button
                key={qtr}
                type="button"
                onClick={() => setSelectedQuarter(qtr)}
                style={selectedQuarter === qtr ? styles.pillActive : styles.pill}
              >
                {qtr}
              </button>
            ))}
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={styles.table}>
              <thead>
                <tr style={styles.trHead}>
                  <th style={styles.th}>Month</th>
                  <th style={styles.th}>Primary Migration Hubs</th>
                  <th style={styles.th}>Flagship Series &amp; Anchors</th>
                  <th style={styles.th}>Cash Liquidity</th>
                  <th style={styles.th}>Hotel Benchmark</th>
                </tr>
              </thead>
              <tbody>
                {filteredMonths.map((m) => (
                  <tr key={m.monthName} style={styles.trBody}>
                    <td style={styles.tdTitle}>
                      <span style={{ color: '#38bdf8' }}>{m.monthNumber}.</span> {m.monthName}
                    </td>
                    <td style={styles.td}>{m.primaryMigrationHubs}</td>
                    <td style={styles.tdCyan}>{m.flagshipSeries}</td>
                    <td style={styles.tdEmerald}>{m.cashLiquidityScore}</td>
                    <td style={styles.td}>{m.typicalHotelOverhead}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Month-By-Month Detail Cards */}
        <section aria-label="Month By Month Migration Cards" style={styles.sectionPlate}>
          <h2 style={styles.h2}>
            Month-By-Month Routing &amp; If / Then / Because Decision Rules
          </h2>
          <div style={styles.cardGrid}>
            {filteredMonths.map((m) => (
              <article key={m.monthName} style={styles.card}>
                <div>
                  <div style={styles.cardHeaderRow}>
                    <span style={styles.cardCodeBadge}>
                      MONTH {m.monthNumber} • {m.seasonQuarter}
                    </span>
                    <span style={styles.cardCatBadge}>
                      {m.cashLiquidityScore.split('(')[0].trim()}
                    </span>
                  </div>
                  <h3 style={styles.cardTitle}>
                    {m.monthName}: {m.primaryMigrationHubs}
                  </h3>
                  <p style={styles.cardSeries}>
                    <strong style={{ color: '#38bdf8' }}>Flagship Stops:</strong> {m.flagshipSeries}
                  </p>
                  <div style={styles.metaBox}>
                    <strong style={{ color: '#34d399' }}>Routing Rule:</strong> {m.ifThenBecause}
                  </div>
                </div>

                <div style={{ marginTop: 14 }}>
                  <Link href={m.hubLink} style={styles.cardCtaBtn}>
                    Explore {m.monthName} Destination Corridor
                  </Link>
                </div>
              </article>
            ))}
          </div>
        </section>

        {/* FAQs */}
        <section aria-label="Frequently Asked Questions" style={styles.sectionPlate}>
          <h2 style={styles.h2}>
            Frequently Asked Questions: Seasonal Live Poker Travel &amp; Circuit Planning
          </h2>
          <div style={styles.faqList}>
            {CALENDAR_FAQS.map((item) => (
              <div key={item.q} style={styles.faqItem}>
                <h3 style={styles.faqQ}>{item.q}</h3>
                <p style={styles.faqA}>{item.a}</p>
              </div>
            ))}
          </div>
        </section>

        <GeoCitationCapsule
          title="12-Month North American & Global Live Poker Liquidity Migration Cycle"
          claim="Aligning Live Poker Travel With Peak Regional Festival Liquidity (January South Florida/Borgata, Feb-Apr Texas/LA/cherokee, May-July Las Vegas WSOP, Aug-Oct EPT Barcelona/Florida, Dec Wynn WPT/WSOP Paradise) Boosts Recreational Field Density By 35% To 80%."
          metricLabel="Annual Migration Coverage"
          metricValue="12 Months Across 22+ Major Championship Stops"
          formulaText="Net Series EV = (Planned Buy-Ins * Expected ROI%) - (Hotel Nights * Nightly Rate + Flights + Dining Overhead)"
          ifThenBecause="If Planning An Annual Live Tournament Or Cash Game Travel Schedule -> Then Rotate Across Regional Hubs During Their Flagship Series Windows And Book Room Blocks 60+ Days Out -> Because Recreational Liquidity Concentrates Heavily Around televised Main Events While Hotel Overhead Spikes Last-Minute."
          quoteText="Follow The Recreational Migration Wave: Grind Florida And Texas In Winter, Las Vegas In Early Summer, Barcelona In Late Summer, And Wynn Or Bahamas In December."
          quoteAuthor="Smarter.Poker Live Venue Intelligence Team"
          doi="10.5281/zenodo.24115447"
          canonicalPath={canonicalPath}
        />

        <GeoFollowUpChain
          topicTitle="12-Month Seasonal Live Poker Migration Calendar"
          followUps={[
            {
              question: 'How Do I Calculate Whether My Travel And Hotel Expenses Will Eat Up My Series ROI?',
              answer:
                'Run The Poker Festival & Trip Expense Overhead Calculator At /tools/poker-trip-planner Before Booking Flights Or Hotels.',
              calculatorHref: '/tools/poker-trip-planner',
              calculatorLabel: 'Open Festival Trip Planner',
              markdownHref: '/tools/poker-trip-planner.md',
            },
            {
              question: 'How Should I Structure My Daily Multi-Table Tournament Bullet Volume And ABI During A Series?',
              answer:
                'Use The MTT Grind Session & ABI Bankroll Planner At /tools/mtt-grind-planner To Model Total Bullet Exposure And Brick Probability.',
              calculatorHref: '/tools/mtt-grind-planner',
              calculatorLabel: 'Open MTT Grind & ABI Planner',
              markdownHref: '/tools/mtt-grind-planner.md',
            },
            {
              question: 'Where Are The Detailed Survival Blueprints For WSOP, WPT, MSPT, Wynn, And Borgata Series?',
              answer:
                'Explore All 10 Major Poker Tournament Series Strategy Guides At /poker-series/guides.',
              calculatorHref: '/poker-series/guides',
              calculatorLabel: 'Open 10 Major Series Guides',
              markdownHref: '/poker-series/guides.md',
            },
          ]}
        />

        <HubPageSummary page="poker-series" path={canonicalPath} />

        <CitationBacklinkBox
          title="12-Month Seasonal Live Poker Migration & Tournament Liquidity Calendar"
          canonicalUrl={canonicalUrl}
          badgeType="research"
          badgeLabel="Annual Circuit Forecast"
          badgeValue="Jan-Dec Migration Map"
          summary="Month-By-Month January To December Live Poker Migration Calendar: Peak Cash Game Liquidity, WSOP/WPT/EPT Circuit Stops, And Regional Travel Routing."
          publishedYear="2026"
          slug="seasonal-live-poker-migration-calendar"
        />

        <AiPromptLauncher
          title="12-Month Seasonal Live Poker Migration Calendar"
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
    fontSize: 'clamp(25px, 3.5vw, 35px)',
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
  filterPills: { display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 18 },
  pill: {
    padding: '6px 14px',
    borderRadius: 999,
    border: '1px solid #334155',
    background: '#0f172a',
    color: '#cbd5e1',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
  },
  pillActive: {
    padding: '6px 14px',
    borderRadius: 999,
    border: '1px solid #38bdf8',
    background: '#38bdf8',
    color: '#04131d',
    fontSize: 13,
    fontWeight: 700,
    cursor: 'pointer',
  },
  h2: { fontSize: 21, fontWeight: 800, color: '#f8fafc', margin: '0 0 16px 0' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 13.5 },
  trHead: { borderBottom: '1px solid #1e293b', textAlign: 'left', color: '#38bdf8' },
  th: { padding: '10px 12px', fontWeight: 700 },
  trBody: { borderBottom: '1px solid #1e293b' },
  tdTitle: { padding: '12px', fontWeight: 700, color: '#f8fafc', minWidth: 110 },
  td: { padding: '12px', color: '#cbd5e1', lineHeight: 1.55 },
  tdCyan: { padding: '12px', color: '#38bdf8', fontWeight: 600, lineHeight: 1.55 },
  tdEmerald: { padding: '12px', color: '#34d399', fontWeight: 700, lineHeight: 1.55 },
  cardGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(330px, 1fr))',
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
  cardCatBadge: { fontSize: 11, fontWeight: 700, color: '#34d399' },
  cardTitle: { fontSize: 17, fontWeight: 800, color: '#f8fafc', margin: '0 0 8px 0', lineHeight: 1.35 },
  cardSeries: { fontSize: 13.5, lineHeight: 1.55, color: '#cbd5e1', margin: '0 0 12px 0' },
  metaBox: {
    fontSize: 12.5,
    lineHeight: 1.55,
    color: '#cbd5e1',
    background: '#070b14',
    padding: '10px 12px',
    borderRadius: 8,
    border: '1px solid #1e293b',
  },
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
