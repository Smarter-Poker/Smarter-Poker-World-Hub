/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  NATIONAL GAME-TYPE VENUE DIRECTORIES (/poker-rooms/by-game)
 * ═══════════════════════════════════════════════════════════════════════════════
 * Index hub ranking North American live poker venues across 6 distinct game
 * formats: Pot-Limit Omaha, Double-Board Bomb Pots, Daily NLH Tournaments,
 * Bad Beat Jackpots, Time-Rake Membership Clubs, and High-Stakes Cash Games.
 *
 * House style: Title Case, zero em dashes.
 */

import React from 'react';
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
  POKER_ROOMS_BY_GAME,
  BY_GAME_AS_OF,
  BY_GAME_BASE_PATH,
  BY_GAME_URL,
  byGameGuidePath,
  renderByGameIndexMarkdown,
} from '../../../src/content/guides/byGame';

export async function getServerSideProps(context) {
  const { req, res, query } = context;
  const acceptHeader = String(req?.headers?.accept || '');
  const isMarkdownRequested =
    acceptHeader.includes('text/markdown') ||
    query?.format === 'md' ||
    req?.url?.includes('format=md');

  if (isMarkdownRequested) {
    const mdContent = renderByGameIndexMarkdown();
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
    q: 'Which US Poker Rooms Spread The Most 24/7 Pot-Limit Omaha (PLO) Cash Tables?',
    a: 'Aria Las Vegas, Prime Social And Champions Club In Houston, Texas Card House In Dallas And Austin, Seminole Hard Rock Hollywood And Tampa In Florida, And Parx Casino In Pennsylvania Maintain The Highest Year-Round 4-Card And 5-Card PLO Table Counts In North America.',
  },
  {
    q: 'Where Are Double-Board PLO Bomb Pots Most Popular In Live Poker?',
    a: 'Texas Membership Card Clubs (Including The Lodge Austin, Texas Card House Dallas/Houston, And Prime Social) Pioneer Mandatory And Dealer-Change Double-Board PLO Bomb Pots Because Time-Collection Rooms Take $0.00 In Extra Per-Hand Pot Rake.',
  },
  {
    q: 'Which Poker Rooms Have Had The Largest Bad Beat Jackpots In History?',
    a: 'Playground Poker Club Near Montreal ($2.59M CAD), Rivers Casino Pittsburgh ($1.22M USD), And MotorCity Casino Detroit Have Recorded The Largest Verified Brick-And-Mortar Bad Beat Jackpots In North American History.',
  },
  {
    q: 'Which Cities Spread Daily $5/$10 And $10/$25+ High-Stakes Cash Games?',
    a: 'Las Vegas (Bellagio, Aria, Wynn), Los Angeles (Commerce, Hustler, The Bike, Gardens), South Florida (Seminole Hard Rock Hollywood), Silicon Valley (Bay 101, Matrix), Houston/Austin (Prime Social, The Lodge), And Philadelphia/Atlantic City (Parx, Borgata) Run Year-Round $5/$10+ Cash Tables.',
  },
];

export default function PokerRoomsByGameIndexPage() {
  const jsonLd = [
    {
      '@type': 'CollectionPage',
      '@id': `${BY_GAME_URL}#collection`,
      name: 'Live Poker Rooms By Game Format: PLO, Bomb Pots, Dailies, BBJ, Time-Rake & High Stakes',
      description:
        'Explore 6 Curated National Live Poker Venue Directories Ranked By Game Format: Pot-Limit Omaha, Double-Board Bomb Pots, Daily Tournaments, Bad Beat Jackpots, Time-Rake Clubs, And High-Stakes Cash.',
      url: BY_GAME_URL,
      inLanguage: 'en-US',
      dateModified: BY_GAME_AS_OF,
      isPartOf: { '@id': 'https://smarter.poker/#website' },
      publisher: { '@id': 'https://smarter.poker/#organization' },
      speakable: {
        '@type': 'SpeakableSpecification',
        cssSelector: ['h1', 'header p:first-of-type'],
      },
      mainEntity: {
        '@type': 'ItemList',
        numberOfItems: POKER_ROOMS_BY_GAME.length,
        itemListElement: POKER_ROOMS_BY_GAME.map((g, idx) => ({
          '@type': 'ListItem',
          position: idx + 1,
          name: g.name,
          url: `https://smarter.poker${byGameGuidePath(g.slug)}`,
        })),
      },
    },
    {
      '@type': 'FAQPage',
      '@id': `${BY_GAME_URL}#faq`,
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
      '@id': `${BY_GAME_URL}#breadcrumb`,
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Smarter.Poker', item: 'https://smarter.poker/' },
        { '@type': 'ListItem', position: 2, name: 'Poker Room Guides', item: 'https://smarter.poker/poker-rooms/guides' },
        { '@type': 'ListItem', position: 3, name: 'Live Poker Rooms By Game Format', item: BY_GAME_URL },
      ],
    },
  ];

  return (
    <div style={styles.page}>
      <SEOHead
        title="Live Poker Rooms By Game Format"
        description="Explore 6 Curated National Live Poker Venue Directories Ranked By Game Format: Pot-Limit Omaha, Double-Board Bomb Pots, Daily Tournaments, Bad Beat Jackpots, Time-Rake Clubs, And High-Stakes Cash."
        canonical={BY_GAME_BASE_PATH}
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
          <span style={styles.crumbCurrent}>Live Poker Rooms By Game Format</span>
        </nav>

        <header style={styles.heroPlate}>
          <div style={styles.badgeRow}>
            <span style={styles.cyanBadge}>6 NATIONAL GAME-FORMAT DIRECTORIES</span>
            <span style={styles.emeraldBadge}>48+ CURATED FLAGSHIP VENUES &amp; BANKROLL SPECS</span>
          </div>

          <h1 style={styles.h1}>
            National Live Poker Venue Directories By Game Format &amp; Action Structure
          </h1>

          <p style={styles.lead}>
            <strong>Direct Answer:</strong> Different Live Poker Formats Require Completely Different Rake Models And Bankroll Cushions. Browse Our <strong>6 National Game-Type Venue Directories</strong> Below Covering <strong>Pot-Limit Omaha (PLO4 &amp; PLO5)</strong>, <strong>Double-Board PLO Bomb Pots</strong>, <strong>Daily NLH Tournament Rooms</strong>, <strong>Six-Figure Bad Beat Jackpot Rooms</strong>, <strong>Zero-Pot-Rake Time-Collection Clubs</strong>, And <strong>$5/$10+ High-Stakes Cash Hubs</strong>.
          </p>

          <div style={styles.quickCrossLinks}>
            <Link href="/poker-rooms/corridors" style={styles.crossBtnCyan}>
              10 Border &amp; Airport Travel Corridors
            </Link>
            <Link href="/poker-rooms/seasonal-calendar" style={styles.crossBtnEmerald}>
              12-Month Seasonal Migration Calendar
            </Link>
            <Link href="/poker-rooms/security-and-disputes-guide" style={styles.crossBtnOutline}>
              Floor Security &amp; Disputes Guide
            </Link>
            <Link href="/poker-rooms/guides" style={styles.crossBtnOutline}>
              12 US Regional City Guides
            </Link>
          </div>
        </header>

        {/* Master Comparison Table */}
        <section aria-label="Master Game Format Directory Table" style={styles.sectionPlate}>
          <h2 style={styles.h2}>
            Master Comparison: 6 Live Poker Game-Format Directories
          </h2>
          <div style={{ overflowX: 'auto' }}>
            <table style={styles.table}>
              <thead>
                <tr style={styles.trHead}>
                  <th style={styles.th}>Game Vertical</th>
                  <th style={styles.th}>Primary Format &amp; Stakes</th>
                  <th style={styles.th}>Recommended Bankroll</th>
                  <th style={styles.th}>Flagship Venues</th>
                  <th style={styles.th}>Full Directory</th>
                </tr>
              </thead>
              <tbody>
                {POKER_ROOMS_BY_GAME.map((g) => (
                  <tr key={g.slug} style={styles.trBody}>
                    <td style={styles.tdTitle}>
                      <Link href={byGameGuidePath(g.slug)} style={styles.tableLink}>
                        {g.shortTitle}
                      </Link>
                    </td>
                    <td style={styles.td}>{g.gameFormat}</td>
                    <td style={styles.tdCyan}>{g.recommendedBankrollBuyIns}</td>
                    <td style={styles.tdEmerald}>{g.topVenues.length} Curated Rooms</td>
                    <td style={styles.td}>
                      <Link href={byGameGuidePath(g.slug)} style={styles.actionLink}>
                        Open Directory
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Cards Grid */}
        <section aria-label="Browse Game Format Directories" style={styles.sectionPlate}>
          <h2 style={styles.h2}>
            Explore Individual Game-Type Venue Directories
          </h2>
          <div style={styles.cardGrid}>
            {POKER_ROOMS_BY_GAME.map((g) => (
              <article key={g.slug} style={styles.card}>
                <div>
                  <div style={styles.cardHeaderRow}>
                    <span style={styles.cardCodeBadge}>
                      {g.topVenues.length} TOP VENUES
                    </span>
                    <span style={styles.cardCatBadge}>
                      {g.recommendedBankrollBuyIns.split('(')[0].trim()}
                    </span>
                  </div>
                  <h3 style={styles.cardTitle}>
                    <Link href={byGameGuidePath(g.slug)} style={styles.cardTitleLink}>
                      {g.name}
                    </Link>
                  </h3>
                  <p style={styles.cardSummary}>{g.summary}</p>
                  <div style={styles.metaBox}>
                    <div>
                      <strong style={{ color: '#38bdf8' }}>If / Then / Because:</strong> {g.ifThenBecause}
                    </div>
                  </div>
                </div>

                <div style={{ marginTop: 14, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  <Link href={byGameGuidePath(g.slug)} style={styles.cardCtaBtn}>
                    Open {g.shortTitle}
                  </Link>
                  <Link href={g.calculatorHref} style={styles.cardCalcBtn}>
                    Launch Format Calculator
                  </Link>
                </div>
              </article>
            ))}
          </div>
        </section>

        {/* FAQs */}
        <section aria-label="Frequently Asked Questions" style={styles.sectionPlate}>
          <h2 style={styles.h2}>
            Frequently Asked Questions: Live Poker Venues By Game Format
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
          title="North American Live Poker Venue Segmentation By Game Variant"
          claim="Specializing Your Venue Selection By Game Format (PLO4/PLO5, Double-Board Bomb Pots, Daily MTTs, Six-Figure Bad Beat Jackpots, Time-Rake Clubs, Or $5/$10+ High Stakes) Increases Realized Hourly Winrate By 25% To 60% Over Random Room Selection."
          metricLabel="National Game Directories"
          metricValue="6 Format-Specific Venue Directories"
          formulaText="Table Quality Score = Format Liquidity + Recreational Whale Density + Stack Depth - Effective Rake Drag"
          ifThenBecause="If You Specialize In A Specific Variant Like PLO, Bomb Pots, Or Daily Tournaments -> Then Target Cardrooms With Dedicated Daily Lists And Format-Appropriate Rake Structures -> Because Multi-Table Format Liquidity Prevents Short-Handed Reg Battles."
          quoteText="Game Selection Starts Before You Walk Through The Casino Doors: Pick The Cardroom Whose Flagship Game Matches Your Highest-EV Variant."
          quoteAuthor="Smarter.Poker Live Venue Intelligence Team"
          doi="10.5281/zenodo.24115447"
          canonicalPath={BY_GAME_BASE_PATH}
        />

        <GeoFollowUpChain
          topicTitle="Live Poker Rooms By Game Format"
          followUps={[
            {
              question: 'How Do I Score A Specific Live Cash Game Table From S-Tier To F-Tier Once I Arrive At The Room?',
              answer:
                'Use The Live Cash Game Table Selection & Profitability Scorer At /tools/table-selection-calculator.',
              calculatorHref: '/tools/table-selection-calculator',
              calculatorLabel: 'Open Table Selection Scorer',
              markdownHref: '/tools/table-selection-calculator.md',
            },
            {
              question: 'How Do Double-Board PLO Bomb Pots And Mississippi Straddles Change Required Bankroll Depth?',
              answer:
                'Model Effective Stack Compression And Variance Multipliers In The Straddle & Bomb Pot EV Calculator At /tools/straddle-calculator.',
              calculatorHref: '/tools/straddle-calculator',
              calculatorLabel: 'Open Straddle & Bomb Pot Calculator',
              markdownHref: '/tools/straddle-calculator.md',
            },
            {
              question: 'When Does A Six-Figure Bad Beat Jackpot Turn The Promotional Drop Into A +EV Player Rebate?',
              answer:
                'Calculate The Exact Breakeven Jackpot Pool Threshold At /tools/promo-ev-calculator.',
              calculatorHref: '/tools/promo-ev-calculator',
              calculatorLabel: 'Open Bad Beat Jackpot EV Calculator',
              markdownHref: '/tools/promo-ev-calculator.md',
            },
          ]}
        />

        <HubPageSummary page="poker-rooms-international" path={BY_GAME_BASE_PATH} />

        <div style={{ margin: '24px 0' }}>
          <SmarterAccountUnlockGate
            variant="live-venue-intel"
            context={"poker-rooms-by-game-index"}
            title={"See Live Game Tables, PLO Waitlists & Peak Hours With A Free Account"}
            redirectPath={BY_GAME_BASE_PATH}
          />
        </div>

        <CitationBacklinkBox
          title="Live Poker Rooms By Game Format: PLO, Bomb Pots, Dailies, BBJ, Time-Rake & High Stakes"
          canonicalUrl={BY_GAME_URL}
          badgeType="research"
          badgeLabel="Game-Type Venue Index"
          badgeValue="6 Format Directories"
          summary="Explore 6 Curated National Live Poker Venue Directories Ranked By Game Format: Pot-Limit Omaha, Double-Board Bomb Pots, Daily Tournaments, Bad Beat Jackpots, Time-Rake Clubs, And High-Stakes Cash."
          publishedYear="2026"
          slug="poker-rooms-by-game-format"
        />

        <AiPromptLauncher
          title="Live Poker Rooms By Game Format Directory"
          canonicalUrl={BY_GAME_URL}
          canonicalPath={BY_GAME_BASE_PATH}
          markdownUrl={`${BY_GAME_URL}.md`}
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
  cardTitle: { fontSize: 18, fontWeight: 800, margin: '0 0 8px 0', lineHeight: 1.35 },
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
  cardCalcBtn: {
    display: 'inline-block',
    padding: '8px 14px',
    borderRadius: 0,
    background: '#070b14',
    color: '#34d399',
    border: '1px solid #10b981',
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
