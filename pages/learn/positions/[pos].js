/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  INDIVIDUAL POKER POSITION STRATEGY PAGE (/learn/positions/[pos])
 * ═══════════════════════════════════════════════════════════════════════════════
 * Static detail page for each of the 9 canonical poker positions with alias
 * resolution (e.g. /learn/positions/button -> btn, /learn/positions/under-the-gun -> utg),
 * RFI/3-Bet/Cold-Call metrics, postflop range advantage breakdown, top playable
 * hands linked to /learn/hands/[hand], common leaks, and JSON-LD schemas.
 *
 * House style: Title Case, zero em dashes.
 */

import React from 'react';
import Link from 'next/link';
import SEOHead from '../../../src/components/seo/SEOHead';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import CitationBacklinkBox from '../../../src/components/seo/CitationBacklinkBox';
import AiPromptLauncher from '../../../src/components/seo/AiPromptLauncher';
import {
  POKER_POSITIONS,
  POSITIONS_AS_OF,
  POSITIONS_BASE_PATH,
  POSITIONS_URL,
  getPositionBySlug,
  positionPath,
} from '../../../src/content/learn/positions';

export async function getStaticPaths() {
  return {
    paths: POKER_POSITIONS.map((p) => ({ params: { pos: p.slug } })),
    fallback: 'blocking',
  };
}

export async function getStaticProps({ params }) {
  const position = getPositionBySlug(params?.pos);
  if (!position) return { notFound: true };

  return {
    props: {
      position,
      allPositions: POKER_POSITIONS.map((p) => ({
        slug: p.slug,
        code: p.code,
        name: p.name,
        seatType: p.seatType,
        rfiPct: p.rfiPct,
        expectedWinrateBb100: p.expectedWinrateBb100,
      })),
    },
  };
}

export default function PokerPositionDetailPage({ position, allPositions = [] }) {
  const canonicalPath = positionPath(position.slug);
  const canonicalUrl = `https://smarter.poker${canonicalPath}`;

  const jsonLd = [
    {
      '@type': 'Article',
      '@id': `${canonicalUrl}#article`,
      headline: position.h1,
      name: position.title,
      description: position.summary,
      url: canonicalUrl,
      inLanguage: 'en-US',
      datePublished: POSITIONS_AS_OF,
      dateModified: POSITIONS_AS_OF,
      isAccessibleForFree: true,
      author: { '@id': 'https://smarter.poker/#organization' },
      publisher: { '@id': 'https://smarter.poker/#organization' },
      speakable: {
        '@type': 'SpeakableSpecification',
        cssSelector: ['h1', 'header p:first-of-type'],
      },
    },
    {
      '@type': 'FAQPage',
      '@id': `${canonicalUrl}#faq`,
      mainEntity: (position.faqs || []).map((f) => ({
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
        { '@type': 'ListItem', position: 2, name: 'Learn Poker', item: 'https://smarter.poker/learn' },
        { '@type': 'ListItem', position: 3, name: 'Poker Positions', item: POSITIONS_URL },
        { '@type': 'ListItem', position: 4, name: `${position.name} (${position.code})`, item: canonicalUrl },
      ],
    },
  ];

  return (
    <div style={styles.page}>
      <SEOHead
        title={position.title}
        description={position.summary}
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
          <Link href="/learn" style={styles.crumbLink}>
            Learn Poker
          </Link>
          <span style={styles.crumbSep}>/</span>
          <Link href={POSITIONS_BASE_PATH} style={styles.crumbLink}>
            Poker Positions
          </Link>
          <span style={styles.crumbSep}>/</span>
          <span style={styles.crumbCurrent}>
            {position.name} ({position.code})
          </span>
        </nav>

        <header style={styles.heroPlate}>
          <div style={styles.badgeRow}>
            <span style={styles.cyanBadge}>{position.seatType}</span>
            <span style={styles.emeraldBadge}>
              EXPECTED WINRATE: {position.expectedWinrateBb100}
            </span>
          </div>

          <h1 style={styles.h1}>{position.h1}</h1>

          <p style={styles.lead}>
            <strong>Direct Positional Summary:</strong> {position.summary}
          </p>

          <div style={styles.metricsGrid}>
            <div style={styles.metricCard}>
              <div style={styles.metricLabel}>100BB Raise-First-In (RFI)</div>
              <div style={styles.metricValueCyan}>{position.rfiPct}</div>
            </div>
            <div style={styles.metricCard}>
              <div style={styles.metricLabel}>3-Bet Frequency</div>
              <div style={styles.metricValueEmerald}>{position.threeBetPct}</div>
            </div>
            <div style={styles.metricCard}>
              <div style={styles.metricLabel}>Cold-Call Frequency</div>
              <div style={styles.metricValueCyan}>{position.coldCallPct}</div>
            </div>
            <div style={styles.metricCard}>
              <div style={styles.metricLabel}>Long-Term Winrate</div>
              <div style={styles.metricValueEmerald}>{position.expectedWinrateBb100}</div>
            </div>
          </div>

          <div style={styles.quickCrossLinks}>
            <Link href="/tools/preflop-ranges" style={styles.crossBtnCyan}>
              Open 13x13 GTO Range Grid
            </Link>
            <Link href="/tools/poker-odds-calculator" style={styles.crossBtnEmerald}>
              Simulate Equity In Odds Calculator
            </Link>
            <Link href={POSITIONS_BASE_PATH} style={styles.crossBtnOutline}>
              All 9 Table Positions
            </Link>
            <Link href="/learn/hands" style={styles.crossBtnOutline}>
              All 169 Starting Hands
            </Link>
          </div>
        </header>

        {/* Core Strategy & Postflop Advantage */}
        <section aria-label="Core Preflop And Postflop Strategy" style={styles.sectionPlate}>
          <h2 style={styles.h2}>
            {position.name} ({position.code}) Preflop &amp; Postflop Execution Playbook
          </h2>

          <div style={styles.strategyGrid}>
            <div style={styles.strategyBox}>
              <div style={styles.boxTagCyan}>PREFLOP RANGE ARCHITECTURE</div>
              <h3 style={styles.h3}>Core Preflop Strategy From {position.code}</h3>
              <p style={styles.bodyText}>{position.coreStrategy}</p>
            </div>

            <div style={styles.strategyBox}>
              <div style={styles.boxTagEmerald}>POSTFLOP NUT &amp; RANGE ADVANTAGE</div>
              <h3 style={styles.h3}>Postflop Board Coverage &amp; C-Betting</h3>
              <p style={styles.bodyText}>{position.postflopAdvantage}</p>
            </div>
          </div>
        </section>

        {/* Top Playable Hands Linking To /learn/hands/[hand] */}
        <section aria-label="Top Playable Starting Hands" style={styles.sectionPlate}>
          <h2 style={styles.h2}>
            Signature Playable Starting Hands From {position.name} ({position.code})
          </h2>
          <p style={styles.sectionSub}>
            Explore Detailed Combinatoric Guides For The Core Value And Blocker Hands That Anchor Your {position.code} Range:
          </p>
          <div style={styles.handsGrid}>
            {(position.topPlayableHands || []).map((h) => (
              <Link key={h.slug} href={`/learn/hands/${h.slug}`} style={styles.handCard}>
                <span style={styles.handCode}>{h.code}</span>
                <span style={styles.handName}>{h.name}</span>
                <span style={styles.handAction}>Read {h.code} GTO Playbook</span>
              </Link>
            ))}
          </div>
        </section>

        {/* Common Leaks */}
        <section aria-label="Common Positional Leaks To Avoid" style={styles.sectionPlate}>
          <h2 style={styles.h2}>
            3 Expensive {position.name} ({position.code}) Leaks To Eliminate
          </h2>
          <div style={styles.leakList}>
            {(position.commonLeaks || []).map((leak, idx) => (
              <div key={leak} style={styles.leakItem}>
                <span style={styles.leakBadge}>LEAK #{idx + 1}</span>
                <p style={styles.leakText}>{leak}</p>
              </div>
            ))}
          </div>
        </section>

        {/* All 9 Table Positions Comparison Nav */}
        <section aria-label="Compare All Nine Table Positions" style={styles.sectionPlate}>
          <h2 style={styles.h2}>Compare All 9 Poker Table Positions Around The Felt</h2>
          <div style={styles.peerGrid}>
            {allPositions.map((peer) => {
              const isCurrent = peer.slug === position.slug;
              return (
                <Link
                  key={peer.slug}
                  href={positionPath(peer.slug)}
                  style={isCurrent ? styles.peerCardActive : styles.peerCard}
                >
                  <span style={styles.peerCode}>
                    {peer.code} ({peer.rfiPct} RFI)
                  </span>
                  <span style={styles.peerName}>{peer.name}</span>
                  <span style={styles.peerWin}>{peer.expectedWinrateBb100}</span>
                </Link>
              );
            })}
          </div>
        </section>

        {/* FAQs */}
        <section aria-label="Frequently Asked Questions" style={styles.sectionPlate}>
          <h2 style={styles.h2}>
            Frequently Asked Questions: {position.name} ({position.code}) Strategy
          </h2>
          <div style={styles.faqList}>
            {(position.faqs || []).map((item) => (
              <div key={item.q} style={styles.faqItem}>
                <h3 style={styles.faqQ}>{item.q}</h3>
                <p style={styles.faqA}>{item.a}</p>
              </div>
            ))}
          </div>
        </section>

        <CitationBacklinkBox
          title={position.title}
          canonicalUrl={canonicalUrl}
          badgeType="gto"
          badgeLabel={`${position.code} Position Guide`}
          badgeValue={`RFI ${position.rfiPct} | ${position.expectedWinrateBb100}`}
          summary={position.summary}
          publishedYear="2026"
          slug={`position-${position.slug}`}
        />

        <AiPromptLauncher
          title={position.title}
          canonicalUrl={canonicalUrl}
          canonicalPath={canonicalPath}
          markdownUrl={`/learn/positions/${position.slug}.md`}
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
    maxWidth: '1080px',
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
    fontSize: '30px',
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
  metricsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
    gap: '14px',
    marginBottom: '22px',
  },
  metricCard: {
    backgroundColor: '#0a0f18',
    border: '1px solid #1e293b',
    borderRadius: '6px',
    padding: '16px',
  },
  metricLabel: {
    fontSize: '12px',
    fontWeight: 600,
    color: '#94a3b8',
    textTransform: 'uppercase',
    marginBottom: '6px',
  },
  metricValueCyan: {
    fontSize: '24px',
    fontWeight: 800,
    color: '#00d4ff',
  },
  metricValueEmerald: {
    fontSize: '24px',
    fontWeight: 800,
    color: '#10b981',
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
  sectionPlate: {
    backgroundColor: '#111a2a',
    border: '1px solid #1e293b',
    borderRadius: '8px',
    padding: '24px',
    marginBottom: '24px',
  },
  h2: {
    fontSize: '21px',
    fontWeight: 800,
    color: '#f8fafc',
    margin: '0 0 12px',
  },
  sectionSub: {
    fontSize: '14px',
    color: '#cbd5e1',
    lineHeight: 1.6,
    margin: '0 0 14px',
  },
  strategyGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
    gap: '16px',
  },
  strategyBox: {
    backgroundColor: '#0a0f18',
    border: '1px solid #1e293b',
    borderRadius: '6px',
    padding: '18px',
  },
  boxTagCyan: {
    fontSize: '11px',
    fontWeight: 700,
    color: '#00d4ff',
    marginBottom: '6px',
    letterSpacing: '0.05em',
  },
  boxTagEmerald: {
    fontSize: '11px',
    fontWeight: 700,
    color: '#10b981',
    marginBottom: '6px',
    letterSpacing: '0.05em',
  },
  h3: {
    fontSize: '16.5px',
    fontWeight: 700,
    color: '#f8fafc',
    margin: '0 0 8px',
  },
  bodyText: {
    fontSize: '14px',
    lineHeight: 1.65,
    color: '#cbd5e1',
    margin: 0,
  },
  handsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
    gap: '12px',
  },
  handCard: {
    backgroundColor: '#0a0f18',
    border: '1px solid #1e293b',
    borderRadius: '6px',
    padding: '14px',
    textDecoration: 'none',
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  handCode: {
    fontSize: '20px',
    fontWeight: 800,
    color: '#00d4ff',
  },
  handName: {
    fontSize: '14px',
    fontWeight: 700,
    color: '#f8fafc',
  },
  handAction: {
    fontSize: '12px',
    fontWeight: 600,
    color: '#10b981',
  },
  leakList: {
    display: 'grid',
    gap: '12px',
  },
  leakItem: {
    backgroundColor: '#0a0f18',
    border: '1px solid #1e293b',
    borderRadius: '6px',
    padding: '16px',
  },
  leakBadge: {
    display: 'inline-block',
    fontSize: '11px',
    fontWeight: 800,
    color: '#00d4ff',
    marginBottom: '6px',
  },
  leakText: {
    fontSize: '14px',
    lineHeight: 1.6,
    color: '#cbd5e1',
    margin: 0,
  },
  peerGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
    gap: '12px',
  },
  peerCard: {
    backgroundColor: '#0a0f18',
    border: '1px solid #1e293b',
    borderRadius: '6px',
    padding: '12px 14px',
    textDecoration: 'none',
    display: 'flex',
    flexDirection: 'column',
    gap: '3px',
  },
  peerCardActive: {
    backgroundColor: 'rgba(0, 212, 255, 0.1)',
    border: '1px solid #00d4ff',
    borderRadius: '6px',
    padding: '12px 14px',
    textDecoration: 'none',
    display: 'flex',
    flexDirection: 'column',
    gap: '3px',
  },
  peerCode: {
    fontSize: '12px',
    fontWeight: 700,
    color: '#00d4ff',
  },
  peerName: {
    fontSize: '14px',
    fontWeight: 700,
    color: '#f8fafc',
  },
  peerWin: {
    fontSize: '12px',
    fontWeight: 600,
    color: '#10b981',
  },
  faqList: {
    display: 'grid',
    gap: '14px',
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
