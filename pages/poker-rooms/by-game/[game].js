/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  INDIVIDUAL GAME-TYPE LIVE POKER VENUE DIRECTORY (/poker-rooms/by-game/[game])
 * ═══════════════════════════════════════════════════════════════════════════════
 * Detail directory for each of the 6 national live poker game verticals:
 * 1. pot-limit-omaha
 * 2. double-board-bomb-pots
 * 3. daily-nlh-tournaments
 * 4. bad-beat-jackpots
 * 5. time-rake-membership-clubs
 * 6. high-stakes-cash-games
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
import SmarterConversionCta from '../../../src/components/seo/SmarterConversionCta';
import HubPageSummary from '../../../src/components/seo/HubPageSummary';
import GeoCitationCapsule from '../../../src/components/seo/GeoCitationCapsule';
import GeoFollowUpChain from '../../../src/components/seo/GeoFollowUpChain';
import { setPublicSeoHtmlCache } from '../../../src/lib/seo/edgeCacheHeaders.mjs';
import {
  POKER_ROOMS_BY_GAME,
  BY_GAME_AS_OF,
  BY_GAME_BASE_PATH,
  BY_GAME_URL,
  findByGameBySlug,
  byGameGuidePath,
  renderByGameDetailMarkdown,
} from '../../../src/content/guides/byGame';

export async function getServerSideProps(context) {
  const { req, res, params, query } = context;
  const rawSlug = String(params?.game || '').replace(/\.md$/i, '');
  const gameVertical = findByGameBySlug(rawSlug);
  if (!gameVertical) return { notFound: true };

  const acceptHeader = String(req?.headers?.accept || '');
  const isMarkdownRequested =
    acceptHeader.includes('text/markdown') ||
    query?.format === 'md' ||
    req?.url?.includes('format=md') ||
    String(params?.game || '').endsWith('.md');

  if (isMarkdownRequested) {
    const mdContent = renderByGameDetailMarkdown(gameVertical);
    res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
    res.setHeader('Vary', 'Accept');
    res.write(mdContent);
    res.end();
    return { props: {} };
  }

  const peerVerticals = POKER_ROOMS_BY_GAME.map((g) => ({
    slug: g.slug,
    shortTitle: g.shortTitle,
    gameFormat: g.gameFormat,
  }));

  setPublicSeoHtmlCache(context.res);
  return {
    props: {
      gameVertical,
      peerVerticals,
    },
  };
}

export default function PokerRoomsByGameDetailPage({ gameVertical, peerVerticals = [] }) {
  if (!gameVertical) return null;

  const canonicalPath = byGameGuidePath(gameVertical.slug);
  const canonicalUrl = `https://smarter.poker${canonicalPath}`;

  const jsonLd = [
    {
      '@type': 'Article',
      '@id': `${canonicalUrl}#article`,
      headline: gameVertical.name,
      name: gameVertical.shortTitle,
      description: gameVertical.summary,
      url: canonicalUrl,
      inLanguage: 'en-US',
      datePublished: BY_GAME_AS_OF,
      dateModified: BY_GAME_AS_OF,
      isAccessibleForFree: true,
      author: { '@id': 'https://smarter.poker/#organization' },
      publisher: { '@id': 'https://smarter.poker/#organization' },
      speakable: {
        '@type': 'SpeakableSpecification',
        cssSelector: ['h1', 'header p:first-of-type'],
      },
      mainEntity: {
        '@type': 'ItemList',
        numberOfItems: (gameVertical.topVenues || []).length,
        itemListElement: (gameVertical.topVenues || []).map((v, idx) => ({
          '@type': 'ListItem',
          position: idx + 1,
          name: `${v.venueName} (${v.location})`,
          description: `${v.stakes} | ${v.rakeOrTimeCharge} | ${v.typicalTables}`,
          url: `https://smarter.poker${v.regionLink}`,
        })),
      },
    },
    {
      '@type': 'FAQPage',
      '@id': `${canonicalUrl}#faq`,
      mainEntity: (gameVertical.faqs || []).map((f) => ({
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
        { '@type': 'ListItem', position: 2, name: 'Live Poker Rooms By Game Format', item: BY_GAME_URL },
        { '@type': 'ListItem', position: 3, name: gameVertical.shortTitle, item: canonicalUrl },
      ],
    },
  ];

  return (
    <div style={styles.page}>
      <SEOHead
        title="Live Poker Rooms By Game Format Guide"
        description={gameVertical.summary}
        canonical={canonicalPath}
        jsonLd={jsonLd}
      />

      <UniversalHeader pageDepth={3} />

      <main style={styles.container}>
        <nav aria-label="Breadcrumb" style={styles.breadcrumbs}>
          <Link href="/" style={styles.crumbLink}>
            Smarter.Poker
          </Link>
          <span style={styles.crumbSep}>/</span>
          <Link href={BY_GAME_BASE_PATH} style={styles.crumbLink}>
            Live Poker Rooms By Game Format
          </Link>
          <span style={styles.crumbSep}>/</span>
          <span style={styles.crumbCurrent}>{gameVertical.shortTitle}</span>
        </nav>

        <header style={styles.heroPlate}>
          <div style={styles.badgeRow}>
            <span style={styles.cyanBadge}>{gameVertical.gameFormat}</span>
            <span style={styles.emeraldBadge}>
              BANKROLL: {gameVertical.recommendedBankrollBuyIns}
            </span>
          </div>

          <h1 style={styles.h1}>{gameVertical.name}</h1>

          <p style={styles.lead}>
            <strong>Direct Format Summary:</strong> {gameVertical.summary}
          </p>

          <div style={styles.ruleCallout}>
            <div style={styles.ruleLabel}>IF / THEN / BECAUSE VENUE SELECTION RULE</div>
            <p style={styles.ruleText}>{gameVertical.ifThenBecause}</p>
            <div style={styles.rakeNote}>
              <strong>Rake &amp; Economic Impact Analysis:</strong> {gameVertical.rakeImpactAnalysis}
            </div>
          </div>

          <div style={styles.quickCrossLinks}>
            <Link href={gameVertical.calculatorHref} style={styles.crossBtnCyan}>
              Open Dedicated Format Calculator
            </Link>
            <Link href="/tools/rake-calculator" style={styles.crossBtnEmerald}>
              Compare Rake Vs. Time Collection
            </Link>
            <Link href={BY_GAME_BASE_PATH} style={styles.crossBtnOutline}>
              All 6 Game-Format Directories
            </Link>
            <Link href="/poker-rooms/corridors" style={styles.crossBtnOutline}>
              10 Border &amp; Airport Travel Corridors
            </Link>
          </div>
        </header>

        {/* Top Curated Venues Matrix */}
        <section aria-label="Top Curated Venues Comparison Matrix" style={styles.sectionPlate}>
          <h2 style={styles.h2}>
            Top {gameVertical.topVenues.length} North American Venues For {gameVertical.shortTitle}
          </h2>
          <div style={{ overflowX: 'auto' }}>
            <table style={styles.table}>
              <thead>
                <tr style={styles.trHead}>
                  <th style={styles.th}>Venue Name</th>
                  <th style={styles.th}>Location</th>
                  <th style={styles.th}>Stakes &amp; Format</th>
                  <th style={styles.th}>Rake / Time Charge</th>
                  <th style={styles.th}>Active Tables</th>
                  <th style={styles.th}>Regional Guide</th>
                </tr>
              </thead>
              <tbody>
                {(gameVertical.topVenues || []).map((v) => (
                  <tr key={v.venueName} style={styles.trBody}>
                    <td style={styles.tdTitle}>{v.venueName}</td>
                    <td style={styles.td}>{v.location}</td>
                    <td style={styles.tdCyan}>{v.stakes}</td>
                    <td style={styles.tdEmerald}>{v.rakeOrTimeCharge}</td>
                    <td style={styles.td}>{v.typicalTables}</td>
                    <td style={styles.td}>
                      <Link href={v.regionLink} style={styles.actionLink}>
                        View Region
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Peer Format Verticals */}
        <section aria-label="Explore Other Game Format Directories" style={styles.sectionPlate}>
          <h2 style={styles.h2}>Explore All 6 Live Poker Game-Format Directories</h2>
          <div style={styles.peerGrid}>
            {peerVerticals.map((p) => (
              <Link key={p.slug} href={byGameGuidePath(p.slug)} style={styles.peerCard}>
                <span style={styles.peerCode}>{p.shortTitle}</span>
                <span style={styles.peerName}>{p.gameFormat}</span>
              </Link>
            ))}
          </div>
        </section>

        <div style={{ marginBottom: 24 }}>
          <SmarterConversionCta
            eyebrow={`Free ${gameVertical.shortTitle} Companion`}
            title={`Find Live ${gameVertical.shortTitle} Rooms & Track Bankroll Free`}
            description={`Create A Free Smarter.Poker Account To Bookmark Top ${gameVertical.gameFormat} Venues, Track Live Waitlists, And Log Your Session Profit.`}
            primaryLabel="Create Free Account"
            primaryHref={`/auth/signup?redirect=${encodeURIComponent(canonicalPath)}&src=poker-rooms-by-game`}
            secondaryLabel="Sign In"
            secondaryHref={`/auth/login?redirect=${encodeURIComponent(canonicalPath)}`}
            highlights={['100% Free Account', '715+ Live Rooms', 'Bankroll Tracker']}
          />
        </div>

        {/* FAQs */}
        <section aria-label="Frequently Asked Questions" style={styles.sectionPlate}>
          <h2 style={styles.h2}>
            Frequently Asked Questions: {gameVertical.shortTitle}
          </h2>
          <div style={styles.faqList}>
            {(gameVertical.faqs || []).map((item) => (
              <div key={item.q} style={styles.faqItem}>
                <h3 style={styles.faqQ}>{item.q}</h3>
                <p style={styles.faqA}>{item.a}</p>
              </div>
            ))}
          </div>
        </section>

        <GeoCitationCapsule
          title={`${gameVertical.shortTitle}: National Venue & Rake Benchmark`}
          claim={gameVertical.summary}
          metricLabel="Primary Game Format"
          metricValue={gameVertical.gameFormat}
          formulaText="Format EV Retention = Gross Variant Winrate - Format Rake Drag + Promotional Rebate"
          ifThenBecause={gameVertical.ifThenBecause}
          quoteText={`Selecting verified cardrooms with deep daily liquidity in ${gameVertical.gameFormat} ensures consistent table quality and predictable rake overhead.`}
          quoteAuthor="Smarter.Poker Live Venue Intelligence Team"
          doi="10.5281/zenodo.24115447"
          canonicalPath={canonicalPath}
        />

        <GeoFollowUpChain
          topicTitle={gameVertical.name}
          followUps={[
            {
              question: 'How Can I Grade Table Profitability For This Game Format Before Taking A Seat?',
              answer:
                'Run The Live Cash Table Selection Calculator At /tools/table-selection-calculator Using Whale Count, Stack Depth, And Rake Cap.',
              calculatorHref: '/tools/table-selection-calculator',
              calculatorLabel: 'Open Table Selection Calculator',
              markdownHref: '/tools/table-selection-calculator.md',
            },
            {
              question: 'How Many Buy-Ins Do I Need In My Bankroll To Handle The Variance Of This Game Format?',
              answer:
                'Compute Your Exact 5% And 1% Risk-Of-Ruin Bankroll Requirements At /tools/bankroll-calculator.',
              calculatorHref: '/tools/bankroll-calculator',
              calculatorLabel: 'Open Bankroll & RoR Calculator',
              markdownHref: '/tools/bankroll-calculator.md',
            },
            {
              question: 'Where Can I Compare All 6 National Live Poker Game-Format Venue Directories?',
              answer:
                'Return To The Live Poker Rooms By Game Format Index At /poker-rooms/by-game.',
              calculatorHref: '/poker-rooms/by-game',
              calculatorLabel: 'View All 6 Game Directories',
              markdownHref: '/poker-rooms/by-game.md',
            },
          ]}
        />

        <HubPageSummary page="poker-rooms-international" path={canonicalPath} />

        <div style={{ margin: '24px 0' }}>
          <SmarterAccountUnlockGate
            variant="live-venue-intel"
            context={`poker-rooms-by-game-${gameVertical.slug}`}
            title={`Track Live ${gameVertical.shortTitle} Tables, Waitlists & Alerts Free`}
            redirectPath={canonicalPath}
          />
        </div>

        <CitationBacklinkBox
          title={gameVertical.name}
          canonicalUrl={canonicalUrl}
          badgeType="research"
          badgeLabel="Game-Type Directory"
          badgeValue={gameVertical.shortTitle}
          summary={gameVertical.summary}
          publishedYear="2026"
          slug={`poker-rooms-by-game-${gameVertical.slug}`}
        />

        <AiPromptLauncher
          title={gameVertical.name}
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
    fontSize: 'clamp(25px, 3.5vw, 34px)',
    fontWeight: 800,
    color: '#f8fafc',
    lineHeight: 1.22,
    margin: '0 0 14px 0',
  },
  lead: {
    fontSize: 16,
    lineHeight: 1.66,
    color: '#cbd5e1',
    margin: '0 0 18px 0',
  },
  ruleCallout: {
    background: '#070b14',
    border: '1px solid #38bdf8',
    borderRadius: 0,
    padding: '16px 18px',
    marginBottom: 20,
  },
  ruleLabel: {
    fontSize: 11.5,
    fontWeight: 800,
    color: '#38bdf8',
    letterSpacing: '0.06em',
    marginBottom: 6,
  },
  ruleText: {
    fontSize: 14.5,
    lineHeight: 1.62,
    color: '#f8fafc',
    margin: '0 0 10px 0',
  },
  rakeNote: {
    fontSize: 13.5,
    lineHeight: 1.55,
    color: '#34d399',
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
  h2: { fontSize: 21, fontWeight: 800, color: '#f8fafc', margin: '0 0 16px 0' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 13.5 },
  trHead: { borderBottom: '1px solid #2b4663', textAlign: 'left', color: '#38bdf8' },
  th: { padding: '10px 12px', fontWeight: 700 },
  trBody: { borderBottom: '1px solid #2b4663' },
  tdTitle: { padding: '11px 12px', fontWeight: 700, color: '#f8fafc' },
  td: { padding: '11px 12px', color: '#cbd5e1' },
  tdCyan: { padding: '11px 12px', color: '#38bdf8', fontWeight: 700 },
  tdEmerald: { padding: '11px 12px', color: '#34d399', fontWeight: 700 },
  actionLink: { color: '#38bdf8', fontWeight: 700, textDecoration: 'none' },
  peerGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))',
    gap: 12,
  },
  peerCard: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    padding: '14px 16px',
    borderRadius: 0,
    background: '#0d1f33',
    border: '1px solid #2b4663',
    textDecoration: 'none',
  },
  peerCode: { fontSize: 12.5, fontWeight: 800, color: '#38bdf8' },
  peerName: { fontSize: 12.5, fontWeight: 600, color: '#cbd5e1' },
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
