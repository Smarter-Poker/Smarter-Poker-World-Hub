/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  INDIVIDUAL POKER HAND VS HAND MATCHUP PAGE (/learn/matchups/[slug])
 * ═══════════════════════════════════════════════════════════════════════════════
 * Static detail page for each of the 25 canonical preflop hand matchups with
 * visual equity comparison bar, Win/Tie/Loss table, Flop Texture Shift matrix,
 * 100BB / 200BB / 25BB / ICM EV cards, and Dataset + FAQPage + BreadcrumbList
 * JSON-LD.
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
  HAND_MATCHUPS,
  MATCHUPS_AS_OF,
  MATCHUPS_BASE_PATH,
  MATCHUPS_URL,
  getMatchupBySlug,
  matchupPath,
} from '../../../src/content/learn/matchups';

export async function getStaticPaths() {
  return {
    paths: HAND_MATCHUPS.map((m) => ({ params: { slug: m.slug } })),
    fallback: 'blocking',
  };
}

export async function getStaticProps({ params }) {
  const matchup = getMatchupBySlug(params?.slug);
  if (!matchup) return { notFound: true };

  const peerMatchups = HAND_MATCHUPS.filter(
    (m) => m.category === matchup.category && m.slug !== matchup.slug
  ).slice(0, 6);

  return {
    props: {
      matchup,
      peerMatchups,
    },
  };
}

export default function PokerMatchupDetailPage({ matchup, peerMatchups = [] }) {
  const canonicalPath = `/learn/matchups/${matchup.slug}`;
  const canonicalUrl = `https://smarter.poker${canonicalPath}`;
  const seoTitle = `${matchup.handA} Vs ${matchup.handB} Preflop Odds And Equity Guide`;

  const jsonLd = [
    {
      '@type': 'Article',
      '@id': `${canonicalUrl}#article`,
      headline: matchup.title,
      name: seoTitle,
      description: matchup.summary,
      url: canonicalUrl,
      inLanguage: 'en-US',
      datePublished: MATCHUPS_AS_OF,
      dateModified: MATCHUPS_AS_OF,
      isAccessibleForFree: true,
      author: { '@id': 'https://smarter.poker/#organization' },
      publisher: { '@id': 'https://smarter.poker/#organization' },
      speakable: {
        '@type': 'SpeakableSpecification',
        cssSelector: ['h1', '#quick-answer-summary'],
      },
    },
    {
      '@type': 'Dataset',
      '@id': `${canonicalUrl}#dataset`,
      name: matchup.title,
      description: matchup.summary,
      url: canonicalUrl,
      inLanguage: 'en-US',
      datePublished: MATCHUPS_AS_OF,
      dateModified: MATCHUPS_AS_OF,
      isAccessibleForFree: true,
      license: 'https://creativecommons.org/licenses/by/4.0/',
      creator: { '@id': 'https://smarter.poker/#organization' },
      publisher: { '@id': 'https://smarter.poker/#organization' },
      variableMeasured: [
        `${matchup.handA} Preflop Equity (${matchup.handAEquity}%)`,
        `${matchup.handB} Preflop Equity (${matchup.handBEquity}%)`,
        `Tie Probability (${matchup.tiePct}%)`,
      ],
    },
    {
      '@type': 'FAQPage',
      '@id': `${canonicalUrl}#faq`,
      mainEntity: (matchup.faqs || []).map((f) => ({
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
        { '@type': 'ListItem', position: 3, name: 'Hand Matchups', item: MATCHUPS_URL },
        { '@type': 'ListItem', position: 4, name: `${matchup.handA} Vs ${matchup.handB}`, item: canonicalUrl },
      ],
    },
  ];

  return (
    <div style={styles.page}>
      <SEOHead
        title={seoTitle}
        description={matchup.summary}
        canonical={`/learn/matchups/${matchup.slug}`}
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
          <Link href={MATCHUPS_BASE_PATH} style={styles.crumbLink}>
            Hand Matchups
          </Link>
          <span style={styles.crumbSep}>/</span>
          <span style={styles.crumbCurrent}>
            {matchup.handA} Vs {matchup.handB}
          </span>
        </nav>

        <header style={styles.heroPlate}>
          <div style={styles.badgeRow}>
            <span style={styles.cyanBadge}>{matchup.category}</span>
            <span style={styles.emeraldBadge}>
              {matchup.combosA} Combos Vs {matchup.combosB} Combos
            </span>
          </div>

          <h1 style={styles.h1}>{matchup.title}</h1>

          <p id="quick-answer-summary" style={styles.lead}>
            <strong>Direct Combinatorial Answer:</strong> {matchup.summary}
          </p>

          {/* Visual Equity Bar */}
          <div style={styles.equityCard}>
            <div style={styles.equityHeaderRow}>
              <div>
                <div style={styles.handCodeCyan}>{matchup.handA}</div>
                <div style={styles.equityNumberCyan}>{matchup.handAEquity.toFixed(2)}% Equity</div>
                <div style={styles.winSubText}>
                  Win: {matchup.handAWinPct.toFixed(2)}% | Combos: {matchup.combosA}
                </div>
              </div>

              <div style={styles.vsBadge}>VS (Tie: {matchup.tiePct.toFixed(2)}%)</div>

              <div style={{ textAlign: 'right' }}>
                <div style={styles.handCodeEmerald}>{matchup.handB}</div>
                <div style={styles.equityNumberEmerald}>{matchup.handBEquity.toFixed(2)}% Equity</div>
                <div style={styles.winSubText}>
                  Win: {matchup.handBWinPct.toFixed(2)}% | Combos: {matchup.combosB}
                </div>
              </div>
            </div>

            <div style={styles.equityBarTrack}>
              <div
                style={{
                  ...styles.equityBarFillA,
                  width: `${matchup.handAEquity}%`,
                }}
              />
              <div
                style={{
                  ...styles.equityBarFillB,
                  width: `${matchup.handBEquity}%`,
                }}
              />
            </div>
          </div>

          <div style={styles.quickCrossLinks}>
            <Link href={`/tools/poker-odds-calculator?hand1=${encodeURIComponent(matchup.handA)}&hand2=${encodeURIComponent(matchup.handB)}`} style={styles.crossBtnCyan}>
              Open In Odds Calculator
            </Link>
            <Link href="/tools/pot-odds-calculator" style={styles.crossBtnEmerald}>
              Run Pot Odds &amp; EV Calculator
            </Link>
            <Link href="/learn/hands" style={styles.crossBtnOutline}>
              Browse All 169 Starting Hands
            </Link>
            <Link href={MATCHUPS_BASE_PATH} style={styles.crossBtnOutline}>
              All 25 Hand Matchups
            </Link>
          </div>
        </header>

        {/* Win / Tie / Loss Breakdown Table */}
        <section aria-label="Win Tie Loss Breakdown Table" style={styles.sectionPlate}>
          <h2 style={styles.h2}>
            {matchup.handA} Vs {matchup.handB} Preflop Win, Tie &amp; Combinatoric Breakdown
          </h2>
          <div style={{ overflowX: 'auto', marginTop: '14px' }}>
            <table style={styles.table}>
              <thead>
                <tr style={styles.trHead}>
                  <th style={styles.th}>Starting Hand</th>
                  <th style={styles.th}>Total Preflop Equity</th>
                  <th style={styles.th}>Outright Win %</th>
                  <th style={styles.th}>Split Pot Tie %</th>
                  <th style={styles.th}>Outright Loss %</th>
                  <th style={styles.th}>Preflop Combinations</th>
                </tr>
              </thead>
              <tbody>
                <tr style={styles.trBody}>
                  <td style={styles.tdHandA}>{matchup.handA}</td>
                  <td style={styles.tdHandA}>{matchup.handAEquity.toFixed(2)}%</td>
                  <td style={styles.tdCell}>{matchup.handAWinPct.toFixed(2)}%</td>
                  <td style={styles.tdCell}>{matchup.tiePct.toFixed(2)}%</td>
                  <td style={styles.tdCell}>{matchup.handBWinPct.toFixed(2)}%</td>
                  <td style={styles.tdCell}>{matchup.combosA} Combos</td>
                </tr>
                <tr style={styles.trBody}>
                  <td style={styles.tdHandB}>{matchup.handB}</td>
                  <td style={styles.tdHandB}>{matchup.handBEquity.toFixed(2)}%</td>
                  <td style={styles.tdCell}>{matchup.handBWinPct.toFixed(2)}%</td>
                  <td style={styles.tdCell}>{matchup.tiePct.toFixed(2)}%</td>
                  <td style={styles.tdCell}>{matchup.handAWinPct.toFixed(2)}%</td>
                  <td style={styles.tdCell}>{matchup.combosB} Combos</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        {/* Flop Texture Shift Matrix */}
        <section aria-label="Flop Texture Shift Matrix" style={styles.sectionPlate}>
          <h2 style={styles.h2}>
            Postflop Board Texture Shift Matrix For {matchup.handA} Vs {matchup.handB}
          </h2>
          <p style={styles.sectionSub}>
            Preflop Equities Shift Dramatically Once Three Community Cards Hit The Felt. Review How {matchup.handA} And {matchup.handB} Navigate The Three Primary Flop Archetypes:
          </p>

          <div style={{ overflowX: 'auto' }}>
            <table style={styles.table}>
              <thead>
                <tr style={styles.trHead}>
                  <th style={styles.th}>Flop Texture Archetype</th>
                  <th style={styles.th}>Optimal {matchup.handA} Strategy</th>
                  <th style={styles.th}>Postflop Equity Shift</th>
                </tr>
              </thead>
              <tbody>
                {matchup.flopShifts.map((shift) => (
                  <tr key={shift.texture} style={styles.trBody}>
                    <td style={styles.tdTexture}>{shift.texture}</td>
                    <td style={styles.tdCell}>{shift.handAAction}</td>
                    <td style={styles.tdShift}>{shift.equityShift}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Stack Depth & ICM EV Guidance Cards */}
        <section aria-label="Stack Depth And ICM EV Guidance" style={styles.sectionPlate}>
          <h2 style={styles.h2}>
            Stack-Depth &amp; Tournament ICM EV Guidance ({matchup.handA} Vs {matchup.handB})
          </h2>
          <div style={styles.evGrid}>
            <div style={styles.evCard}>
              <div style={styles.evCardBadgeCyan}>100BB 6-MAX CASH GAME</div>
              <h3 style={styles.h3}>100BB Cash Game Stack-Off Strategy</h3>
              <p style={styles.evBody}>{matchup.evAnalysis.cash100bb}</p>
            </div>

            <div style={styles.evCard}>
              <div style={styles.evCardBadgeEmerald}>200BB DEEP-STACK CASH</div>
              <h3 style={styles.h3}>200BB Deep-Stack Navigation</h3>
              <p style={styles.evBody}>{matchup.evAnalysis.cash200bb}</p>
            </div>

            <div style={styles.evCard}>
              <div style={styles.evCardBadgeCyan}>25BB TOURNAMENT RE-STEAL</div>
              <h3 style={styles.h3}>25BB MTT Jam Or Call Threshold</h3>
              <p style={styles.evBody}>{matchup.evAnalysis.mtt25bb}</p>
            </div>

            <div style={styles.evCard}>
              <div style={styles.evCardBadgeEmerald}>FINAL TABLE ICM PRESSURE</div>
              <h3 style={styles.h3}>Final Table Bubble &amp; ICM Adjustment</h3>
              <p style={styles.evBody}>{matchup.evAnalysis.icmFinalTable}</p>
            </div>
          </div>
        </section>

        {/* Peer Matchups */}
        {peerMatchups.length > 0 && (
          <section aria-label="Related Hand Matchups" style={styles.sectionPlate}>
            <h2 style={styles.h2}>Related {matchup.category} Matchups</h2>
            <div style={styles.peerGrid}>
              {peerMatchups.map((peer) => (
                <Link key={peer.slug} href={matchupPath(peer.slug)} style={styles.peerCard}>
                  <span style={styles.peerHands}>
                    {peer.handA} ({peer.handAEquity.toFixed(1)}%) Vs {peer.handB} ({peer.handBEquity.toFixed(1)}%)
                  </span>
                  <span style={styles.peerTitle}>{peer.title}</span>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* FAQ Section */}
        <section aria-label="Frequently Asked Questions" style={styles.sectionPlate}>
          <h2 style={styles.h2}>
            Frequently Asked Questions: {matchup.handA} Vs {matchup.handB}
          </h2>
          <div style={styles.faqList}>
            {matchup.faqs.map((item) => (
              <div key={item.q} style={styles.faqItem}>
                <h3 style={styles.faqQ}>{item.q}</h3>
                <p style={styles.faqA}>{item.a}</p>
              </div>
            ))}
          </div>
        </section>

        <CitationBacklinkBox
          title={matchup.title}
          canonicalUrl={canonicalUrl}
          badgeType="research"
          badgeLabel="Preflop Equity Benchmark"
          badgeValue={`${matchup.handA} ${matchup.handAEquity}% Vs ${matchup.handB} ${matchup.handBEquity}%`}
          summary={matchup.summary}
          publishedYear="2026"
          slug={`matchup-${matchup.slug}`}
        />

        <AiPromptLauncher
          title={matchup.title}
          canonicalUrl={canonicalUrl}
          canonicalPath={canonicalPath}
          markdownUrl={`/learn/matchups/${matchup.slug}.md`}
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
  equityCard: {
    backgroundColor: '#0a0f18',
    border: '1px solid #1e293b',
    borderRadius: '8px',
    padding: '20px',
    marginBottom: '22px',
  },
  equityHeaderRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: '12px',
    marginBottom: '14px',
  },
  handCodeCyan: {
    fontSize: '26px',
    fontWeight: 800,
    color: '#00d4ff',
  },
  equityNumberCyan: {
    fontSize: '18px',
    fontWeight: 700,
    color: '#f8fafc',
  },
  handCodeEmerald: {
    fontSize: '26px',
    fontWeight: 800,
    color: '#10b981',
  },
  equityNumberEmerald: {
    fontSize: '18px',
    fontWeight: 700,
    color: '#f8fafc',
  },
  winSubText: {
    fontSize: '12.5px',
    color: '#94a3b8',
    marginTop: '4px',
  },
  vsBadge: {
    backgroundColor: '#111a2a',
    border: '1px solid #1e293b',
    color: '#e2e8f0',
    fontWeight: 700,
    fontSize: '13px',
    padding: '6px 14px',
    borderRadius: '20px',
  },
  equityBarTrack: {
    display: 'flex',
    height: '16px',
    borderRadius: '8px',
    overflow: 'hidden',
    backgroundColor: '#111a2a',
    border: '1px solid #1e293b',
  },
  equityBarFillA: {
    backgroundColor: '#00d4ff',
    height: '100%',
  },
  equityBarFillB: {
    backgroundColor: '#10b981',
    height: '100%',
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
    margin: '0 0 10px',
  },
  sectionSub: {
    fontSize: '14px',
    color: '#cbd5e1',
    lineHeight: 1.6,
    margin: '0 0 14px',
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
  tdHandA: {
    padding: '12px',
    color: '#00d4ff',
    fontWeight: 700,
  },
  tdHandB: {
    padding: '12px',
    color: '#10b981',
    fontWeight: 700,
  },
  tdTexture: {
    padding: '12px',
    color: '#f8fafc',
    fontWeight: 700,
    minWidth: '200px',
  },
  tdShift: {
    padding: '12px',
    color: '#10b981',
    fontWeight: 600,
    lineHeight: 1.5,
  },
  tdCell: {
    padding: '12px',
    color: '#cbd5e1',
    lineHeight: 1.5,
  },
  evGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
    gap: '16px',
    marginTop: '14px',
  },
  evCard: {
    backgroundColor: '#0a0f18',
    border: '1px solid #1e293b',
    borderRadius: '6px',
    padding: '18px',
  },
  evCardBadgeCyan: {
    display: 'inline-block',
    fontSize: '11px',
    fontWeight: 700,
    color: '#00d4ff',
    marginBottom: '6px',
    letterSpacing: '0.05em',
  },
  evCardBadgeEmerald: {
    display: 'inline-block',
    fontSize: '11px',
    fontWeight: 700,
    color: '#10b981',
    marginBottom: '6px',
    letterSpacing: '0.05em',
  },
  h3: {
    fontSize: '16px',
    fontWeight: 700,
    color: '#f8fafc',
    margin: '0 0 8px',
  },
  evBody: {
    fontSize: '13.5px',
    lineHeight: 1.6,
    color: '#cbd5e1',
    margin: 0,
  },
  peerGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(290px, 1fr))',
    gap: '12px',
    marginTop: '14px',
  },
  peerCard: {
    backgroundColor: '#0a0f18',
    border: '1px solid #1e293b',
    borderRadius: '6px',
    padding: '14px',
    textDecoration: 'none',
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  peerHands: {
    fontSize: '12px',
    fontWeight: 700,
    color: '#10b981',
  },
  peerTitle: {
    fontSize: '14px',
    fontWeight: 700,
    color: '#00d4ff',
  },
  faqList: {
    display: 'grid',
    gap: '14px',
    marginTop: '14px',
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
