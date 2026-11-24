/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  INDIVIDUAL FLOP BOARD TEXTURE STRATEGY PAGE (/learn/board-textures/[slug])
 * ═══════════════════════════════════════════════════════════════════════════════
 * Static detail page for each of the 12 canonical No-Limit Hold'em flop board
 * textures with IP vs OOP range advantage, nut advantage, GTO C-bet frequency,
 * optimal sizing (33%, 50%, 75%, Check), check-raise frequency, turn barrel
 * cards, and 1-click button to test that exact board in /tools/board-texture-analyzer.
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
  BOARD_TEXTURES,
  BOARD_TEXTURES_AS_OF,
  BOARD_TEXTURES_BASE_PATH,
  BOARD_TEXTURES_URL,
  findBoardTexture,
  boardTexturePath,
} from '../../../src/content/learn/boardTextures';

export async function getStaticPaths() {
  return {
    paths: BOARD_TEXTURES.map((b) => ({ params: { slug: b.slug } })),
    fallback: 'blocking',
  };
}

export async function getStaticProps({ params }) {
  const texture = findBoardTexture(params?.slug);
  if (!texture) return { notFound: true };

  return {
    props: {
      texture,
      allTextures: BOARD_TEXTURES.map((b) => ({
        slug: b.slug,
        code: b.code,
        exampleBoard: b.exampleBoard,
        name: b.name,
        category: b.category,
        gtoCbetFreq: b.gtoCbetFreq,
        optimalCbetSize: b.optimalCbetSize,
      })),
    },
  };
}

export default function BoardTextureDetailPage({ texture, allTextures = [] }) {
  const canonicalPath = boardTexturePath(texture.slug);
  const canonicalUrl = `https://smarter.poker${canonicalPath}`;
  const analyzerHref = `/tools/board-texture-analyzer?board=${encodeURIComponent(texture.analyzerQuery)}`;

  const jsonLd = [
    {
      '@type': 'Article',
      '@id': `${canonicalUrl}#article`,
      headline: texture.h1,
      name: texture.title,
      description: texture.summary,
      url: canonicalUrl,
      inLanguage: 'en-US',
      datePublished: BOARD_TEXTURES_AS_OF,
      dateModified: BOARD_TEXTURES_AS_OF,
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
      mainEntity: (texture.faqs || []).map((f) => ({
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
        { '@type': 'ListItem', position: 3, name: 'Flop Board Textures', item: BOARD_TEXTURES_URL },
        { '@type': 'ListItem', position: 4, name: texture.name, item: canonicalUrl },
      ],
    },
  ];

  return (
    <div style={styles.page}>
      <SEOHead
        title={texture.title}
        description={texture.summary}
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
          <Link href={BOARD_TEXTURES_BASE_PATH} style={styles.crumbLink}>
            Flop Board Textures
          </Link>
          <span style={styles.crumbSep}>/</span>
          <span style={styles.crumbCurrent}>
            {texture.name}
          </span>
        </nav>

        <header style={styles.heroPlate}>
          <div style={styles.badgeRow}>
            <span style={styles.cyanBadge}>{texture.category}</span>
            <span style={styles.emeraldBadge}>
              CANONICAL BOARD: {texture.exampleBoard}
            </span>
          </div>

          <h1 style={styles.h1}>{texture.h1}</h1>

          <p style={styles.lead}>
            <strong>Direct Solver Summary:</strong> {texture.summary}
          </p>

          <div style={styles.metricsGrid}>
            <div style={styles.metricCard}>
              <div style={styles.metricLabel}>GTO C-Bet Frequency</div>
              <div style={styles.metricValueCyan}>{texture.gtoCbetFreq}</div>
            </div>
            <div style={styles.metricCard}>
              <div style={styles.metricLabel}>Optimal C-Bet Sizing</div>
              <div style={styles.metricValueEmerald}>{texture.optimalCbetSize}</div>
            </div>
            <div style={styles.metricCard}>
              <div style={styles.metricLabel}>Defender Check-Raise %</div>
              <div style={styles.metricValueCyan}>{texture.checkRaiseFreq}</div>
            </div>
            <div style={styles.metricCard}>
              <div style={styles.metricLabel}>Range / Nut Advantage</div>
              <div style={styles.metricValueText}>{texture.rangeAdvantage}</div>
            </div>
          </div>

          <div style={styles.quickCrossLinks}>
            <Link href={analyzerHref} style={styles.crossBtnCyan}>
              Test {texture.exampleBoard} In Flop Board Texture Analyzer
            </Link>
            <Link href="/tools/poker-odds-calculator" style={styles.crossBtnEmerald}>
              Simulate Equity On {texture.code}
            </Link>
            <Link href="/tools/geometric-bet-calculator" style={styles.crossBtnOutline}>
              Geometric 3-Street Bet Solver
            </Link>
            <Link href={BOARD_TEXTURES_BASE_PATH} style={styles.crossBtnOutline}>
              All 12 Flop Textures
            </Link>
          </div>
        </header>

        {/* Range Advantage & Nut Advantage */}
        <section aria-label="Range Advantage And Nut Advantage Breakdown" style={styles.sectionPlate}>
          <h2 style={styles.h2}>
            Range Advantage, Nut Advantage &amp; Turn Barrel Matrix For {texture.code}
          </h2>
          <div style={styles.metricsGrid}>
            <div style={styles.colBox}>
              <div style={styles.tagCyan}>EQUITY &amp; RANGE ADVANTAGE</div>
              <p style={styles.bodyText}>{texture.rangeAdvantage}</p>
            </div>
            <div style={styles.colBox}>
              <div style={styles.tagEmerald}>TOP-OF-RANGE NUT ADVANTAGE</div>
              <p style={styles.bodyText}>{texture.nutAdvantage}</p>
            </div>
            <div style={styles.colBox}>
              <div style={styles.tagCyan}>BEST TURN BARREL CARDS</div>
              <p style={styles.bodyText}>{texture.bestTurnBarrels}</p>
            </div>
          </div>
        </section>

        {/* IP vs OOP Strategy */}
        <section aria-label="In Position And Out Of Position Solver Playbooks" style={styles.sectionPlate}>
          <h2 style={styles.h2}>
            In-Position Raiser Vs. Out-Of-Position Big Blind Defender Playbook ({texture.exampleBoard})
          </h2>
          <div style={styles.twoColGrid}>
            <div style={styles.colBox}>
              <div style={styles.tagCyan}>IN-POSITION PREFLOP RAISER (IP)</div>
              <h3 style={styles.h3}>GTO C-Bet Frequency &amp; Sizing Rules</h3>
              <ul style={styles.bulletList}>
                {(texture.ipStrategy || []).map((item) => (
                  <li key={item} style={styles.bulletItem}>
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            <div style={styles.colBox}>
              <div style={styles.tagEmerald}>OUT-OF-POSITION BIG BLIND DEFENDER (OOP)</div>
              <h3 style={styles.h3}>Check-Raise, Float &amp; Probe Rules</h3>
              <ul style={styles.bulletList}>
                {(texture.oopDefenseStrategy || []).map((item) => (
                  <li key={item} style={styles.bulletItem}>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* Turn Barrelling Rules & Interactive Analyzer Launch */}
        <section aria-label="Turn Barrel Strategy And Interactive Solver" style={styles.sectionPlate}>
          <h2 style={styles.h2}>
            Turn Double-Barrel Rules &amp; Equity Shifts On {texture.name}
          </h2>
          <p style={styles.bodyText}>{texture.turnBarrelRules}</p>

          <div style={{ marginTop: 18, display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            <Link href={analyzerHref} style={styles.crossBtnCyan}>
              Open {texture.exampleBoard} In Interactive Flop Board Texture Analyzer
            </Link>
            <Link href="/tools/preflop-ranges" style={styles.crossBtnEmerald}>
              Compare 100BB Preflop Calling &amp; Opening Ranges
            </Link>
            <Link href="/tools/pot-odds-calculator" style={styles.crossBtnOutline}>
              Calculate Minimum Defense Frequency (MDF)
            </Link>
          </div>
        </section>

        {/* All 12 Textures */}
        <section aria-label="Compare All 12 Canonical Flop Textures" style={styles.sectionPlate}>
          <h2 style={styles.h2}>Explore All 12 Canonical Flop Board Textures</h2>
          <div style={styles.peerGrid}>
            {allTextures.map((b) => (
              <Link key={b.slug} href={boardTexturePath(b.slug)} style={styles.peerCard}>
                <span style={styles.peerCode}>
                  {b.exampleBoard} | {b.category}
                </span>
                <span style={styles.peerName}>{b.name}</span>
                <span style={styles.peerStats}>
                  C-Bet: {b.gtoCbetFreq} | Size: {b.optimalCbetSize}
                </span>
              </Link>
            ))}
          </div>
        </section>

        {/* FAQs */}
        <section aria-label="Frequently Asked Questions" style={styles.sectionPlate}>
          <h2 style={styles.h2}>
            Frequently Asked Questions: {texture.name}
          </h2>
          <div style={styles.faqList}>
            {(texture.faqs || []).map((item) => (
              <div key={item.q} style={styles.faqItem}>
                <h3 style={styles.faqQ}>{item.q}</h3>
                <p style={styles.faqA}>{item.a}</p>
              </div>
            ))}
          </div>
        </section>

        <CitationBacklinkBox
          title={texture.h1}
          canonicalUrl={canonicalUrl}
          badgeType="gto"
          badgeLabel={texture.exampleBoard}
          badgeValue={`C-Bet ${texture.gtoCbetFreq}`}
          summary={texture.summary}
          publishedYear="2026"
          slug={`board-texture-${texture.slug}`}
        />

        <AiPromptLauncher
          title={texture.h1}
          canonicalUrl={canonicalUrl}
          canonicalPath={canonicalPath}
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
    maxWidth: 1060,
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
    marginBottom: 26,
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
    lineHeight: 1.22,
    margin: '0 0 14px 0',
  },
  lead: {
    fontSize: 16,
    lineHeight: 1.66,
    color: '#cbd5e1',
    margin: '0 0 20px 0',
  },
  metricsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(215px, 1fr))',
    gap: 12,
    marginBottom: 20,
  },
  metricCard: {
    background: '#070b14',
    border: '1px solid #1e293b',
    borderRadius: 10,
    padding: '14px 16px',
  },
  metricLabel: { fontSize: 12, color: '#94a3b8', fontWeight: 600, marginBottom: 6 },
  metricValueCyan: { fontSize: 17, fontWeight: 800, color: '#38bdf8' },
  metricValueEmerald: { fontSize: 17, fontWeight: 800, color: '#34d399' },
  metricValueText: { fontSize: 13.5, fontWeight: 700, color: '#f8fafc', lineHeight: 1.4 },
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
    marginBottom: 26,
  },
  h2: { fontSize: 21, fontWeight: 800, color: '#f8fafc', margin: '0 0 14px 0' },
  h3: { fontSize: 17, fontWeight: 700, color: '#f8fafc', margin: '6px 0 12px 0' },
  bodyText: { fontSize: 14.5, lineHeight: 1.65, color: '#cbd5e1', margin: '6px 0 0 0' },
  twoColGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(310px, 1fr))',
    gap: 18,
  },
  colBox: {
    background: '#0f172a',
    border: '1px solid #1e293b',
    borderRadius: 10,
    padding: 18,
  },
  tagCyan: {
    display: 'inline-block',
    fontSize: 11,
    fontWeight: 800,
    color: '#38bdf8',
    letterSpacing: '0.05em',
  },
  tagEmerald: {
    display: 'inline-block',
    fontSize: 11,
    fontWeight: 800,
    color: '#34d399',
    letterSpacing: '0.05em',
  },
  bulletList: { margin: 0, paddingLeft: 18, display: 'grid', gap: 10 },
  bulletItem: { fontSize: 14, lineHeight: 1.6, color: '#cbd5e1' },
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
    borderRadius: 10,
    background: '#0f172a',
    border: '1px solid #1e293b',
    textDecoration: 'none',
  },
  peerCode: { fontSize: 11, fontWeight: 800, color: '#38bdf8', fontFamily: 'monospace' },
  peerName: { fontSize: 14.5, fontWeight: 700, color: '#f8fafc' },
  peerStats: { fontSize: 12, color: '#94a3b8' },
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
