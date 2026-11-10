/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  INDIVIDUAL FAMOUS HISTORIC POKER HAND PAGE (/learn/famous-hands/[slug])
 * ═══════════════════════════════════════════════════════════════════════════════
 * Static detail page for each of the 12 iconic historic poker hands with
 * short-slug alias support, street-by-street solver breakdown, GTO math
 * verdict, one-click Odds Calculator link, and Article + FAQPage + Breadcrumb
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
  FAMOUS_HANDS,
  FAMOUS_HANDS_AS_OF,
  FAMOUS_HANDS_BASE_PATH,
  FAMOUS_HANDS_URL,
  getFamousHandBySlug,
  famousHandPath,
} from '../../../src/content/learn/famousHands';

export async function getStaticPaths() {
  return {
    paths: FAMOUS_HANDS.map((h) => ({ params: { slug: h.slug } })),
    fallback: 'blocking',
  };
}

export async function getStaticProps({ params }) {
  const hand = getFamousHandBySlug(params?.slug);
  if (!hand) return { notFound: true };

  const peerHands = FAMOUS_HANDS.filter((h) => h.slug !== hand.slug)
    .slice(0, 6)
    .map((h) => ({
      slug: h.slug,
      title: h.title,
      year: h.year,
      category: h.category,
      solverVerdict: h.solverVerdict,
    }));

  return {
    props: {
      hand,
      peerHands,
    },
  };
}

export default function FamousHandDetailPage({ hand, peerHands = [] }) {
  const canonicalPath = famousHandPath(hand.slug);
  const canonicalUrl = `https://smarter.poker${canonicalPath}`;

  const jsonLd = [
    {
      '@type': 'Article',
      '@id': `${canonicalUrl}#article`,
      headline: hand.h1,
      name: hand.title,
      description: hand.summary,
      url: canonicalUrl,
      inLanguage: 'en-US',
      datePublished: FAMOUS_HANDS_AS_OF,
      dateModified: FAMOUS_HANDS_AS_OF,
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
      mainEntity: (hand.faqs || []).map((f) => ({
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
        { '@type': 'ListItem', position: 3, name: 'Famous Poker Hands', item: FAMOUS_HANDS_URL },
        { '@type': 'ListItem', position: 4, name: hand.title, item: canonicalUrl },
      ],
    },
  ];

  return (
    <div style={styles.page}>
      <SEOHead
        title={hand.title}
        description={hand.summary}
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
          <Link href={FAMOUS_HANDS_BASE_PATH} style={styles.crumbLink}>
            Famous Poker Hands
          </Link>
          <span style={styles.crumbSep}>/</span>
          <span style={styles.crumbCurrent}>{hand.title}</span>
        </nav>

        <header style={styles.heroPlate}>
          <div style={styles.badgeRow}>
            <span style={styles.cyanBadge}>
              {hand.year} {hand.event}
            </span>
            <span style={styles.emeraldBadge}>{hand.category}</span>
          </div>

          <h1 style={styles.h1}>{hand.h1}</h1>

          <p style={styles.lead}>
            <strong>Executive Hand Summary:</strong> {hand.summary}
          </p>

          <div style={styles.metricsGrid}>
            <div style={styles.metricCard}>
              <div style={styles.metricLabel}>Hero Holding</div>
              <div style={styles.metricValueCyan}>{hand.heroPlayer}</div>
            </div>
            <div style={styles.metricCard}>
              <div style={styles.metricLabel}>Opposing Holding</div>
              <div style={styles.metricValueEmerald}>{hand.villainPlayer}</div>
            </div>
            <div style={styles.metricCard}>
              <div style={styles.metricLabel}>Official Board Runout</div>
              <div style={styles.metricValueCyan}>{hand.boardRunout}</div>
            </div>
            <div style={styles.metricCard}>
              <div style={styles.metricLabel}>Pot Size / Stakes</div>
              <div style={styles.metricValueEmerald}>{hand.potSize}</div>
            </div>
          </div>

          <div style={styles.quickCrossLinks}>
            <Link
              href={`/tools/poker-odds-calculator?hand1=${encodeURIComponent(hand.heroHandCode)}&hand2=${encodeURIComponent(hand.villainHandCode)}`}
              style={styles.crossBtnCyan}
            >
              Simulate {hand.heroHandCode} Vs {hand.villainHandCode} In Odds Calculator
            </Link>
            <Link href="/tools/pot-odds-calculator" style={styles.crossBtnEmerald}>
              Pot Odds &amp; MDF Solver
            </Link>
            <Link href={FAMOUS_HANDS_BASE_PATH} style={styles.crossBtnOutline}>
              All 12 Famous Poker Hands
            </Link>
            <Link href="/learn/matchups" style={styles.crossBtnOutline}>
              25 All-In Hand Matchups
            </Link>
          </div>
        </header>

        {/* Street-By-Street Action Breakdown */}
        <section aria-label="Street By Street Hand Action" style={styles.sectionPlate}>
          <h2 style={styles.h2}>
            Street-By-Street Action &amp; Decision Tree ({hand.year} {hand.event})
          </h2>
          <div style={styles.streetList}>
            {(hand.streetBreakdown || []).map((street, idx) => (
              <div key={street} style={styles.streetCard}>
                <span style={styles.streetBadge}>PHASE {idx + 1}</span>
                <p style={styles.streetText}>{street}</p>
              </div>
            ))}
          </div>
        </section>

        {/* GTO Solver & Mathematical Insight */}
        <section aria-label="GTO Solver And Combinatoric Math Verdict" style={styles.sectionPlate}>
          <div style={styles.verdictBanner}>
            <span style={styles.verdictTag}>SOLVER VERDICT: {hand.solverVerdict}</span>
          </div>
          <h2 style={styles.h2}>
            Modern GTO Solver, Blocker &amp; Minimum Defense Frequency (MDF) Analysis
          </h2>
          <p style={styles.bodyText}>{hand.gtoMathInsight}</p>
        </section>

        {/* Related Famous Hands */}
        <section aria-label="More Famous Historic Poker Hands" style={styles.sectionPlate}>
          <h2 style={styles.h2}>More Iconic Televised &amp; WSOP Hand Breakdowns</h2>
          <div style={styles.peerGrid}>
            {peerHands.map((peer) => (
              <Link key={peer.slug} href={famousHandPath(peer.slug)} style={styles.peerCard}>
                <span style={styles.peerCode}>
                  {peer.year} | {peer.category}
                </span>
                <span style={styles.peerName}>{peer.title}</span>
                <span style={styles.peerVerdict}>{peer.solverVerdict}</span>
              </Link>
            ))}
          </div>
        </section>

        {/* FAQs */}
        <section aria-label="Frequently Asked Questions" style={styles.sectionPlate}>
          <h2 style={styles.h2}>
            Frequently Asked Questions: {hand.heroPlayer} Vs {hand.villainPlayer}
          </h2>
          <div style={styles.faqList}>
            {(hand.faqs || []).map((item) => (
              <div key={item.q} style={styles.faqItem}>
                <h3 style={styles.faqQ}>{item.q}</h3>
                <p style={styles.faqA}>{item.a}</p>
              </div>
            ))}
          </div>
        </section>

        <CitationBacklinkBox
          title={hand.title}
          canonicalUrl={canonicalUrl}
          badgeType="research"
          badgeLabel={`${hand.year} Solver Analysis`}
          badgeValue={hand.solverVerdict}
          summary={hand.summary}
          publishedYear="2026"
          slug={`famous-hand-${hand.slug}`}
        />

        <AiPromptLauncher
          title={hand.title}
          canonicalUrl={canonicalUrl}
          canonicalPath={canonicalPath}
          markdownUrl={`/learn/famous-hands/${hand.slug}.md`}
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
    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
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
    fontSize: '16px',
    fontWeight: 800,
    color: '#00d4ff',
  },
  metricValueEmerald: {
    fontSize: '16px',
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
  streetList: {
    display: 'grid',
    gap: '12px',
  },
  streetCard: {
    backgroundColor: '#0a0f18',
    border: '1px solid #1e293b',
    borderRadius: '6px',
    padding: '16px',
  },
  streetBadge: {
    display: 'inline-block',
    fontSize: '11px',
    fontWeight: 800,
    color: '#00d4ff',
    marginBottom: '6px',
  },
  streetText: {
    fontSize: '14px',
    lineHeight: 1.65,
    color: '#cbd5e1',
    margin: 0,
  },
  verdictBanner: {
    marginBottom: '10px',
  },
  verdictTag: {
    display: 'inline-block',
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    border: '1px solid #10b981',
    color: '#10b981',
    fontSize: '11.5px',
    fontWeight: 800,
    padding: '5px 12px',
    borderRadius: '4px',
  },
  bodyText: {
    fontSize: '14.5px',
    lineHeight: 1.7,
    color: '#cbd5e1',
    margin: 0,
  },
  peerGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
    gap: '12px',
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
  peerCode: {
    fontSize: '11.5px',
    fontWeight: 700,
    color: '#00d4ff',
  },
  peerName: {
    fontSize: '14px',
    fontWeight: 700,
    color: '#f8fafc',
  },
  peerVerdict: {
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
