/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  INDIVIDUAL US STATE POKER LEGALITY & TAX GUIDE (/poker-rooms/states/[state])
 * ═══════════════════════════════════════════════════════════════════════════════
 * Static detail page for each of the top 15 US poker states with 2-letter code
 * alias support (e.g. /poker-rooms/states/nv -> nevada, /poker-rooms/states/tx -> texas),
 * regulatory overview, W-2G withholding notes, top cities, and JSON-LD schemas.
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
  US_POKER_STATES,
  STATES_AS_OF,
  STATES_BASE_PATH,
  STATES_URL,
  getStateGuideBySlug,
  stateGuidePath,
} from '../../../src/content/guides/states';

export async function getStaticPaths() {
  return {
    paths: US_POKER_STATES.map((s) => ({ params: { state: s.slug } })),
    fallback: 'blocking',
  };
}

export async function getStaticProps({ params }) {
  const stateGuide = getStateGuideBySlug(params?.state);
  if (!stateGuide) return { notFound: true };

  const peerStates = US_POKER_STATES.filter((s) => s.slug !== stateGuide.slug)
    .slice(0, 8)
    .map((s) => ({
      slug: s.slug,
      code: s.code,
      name: s.name,
      minAge: s.minAge,
      stateIncomeTaxRate: s.stateIncomeTaxRate,
    }));

  return {
    props: {
      stateGuide,
      peerStates,
    },
  };
}

export default function USStatePokerDetailPage({ stateGuide, peerStates = [] }) {
  const canonicalPath = stateGuidePath(stateGuide.slug);
  const canonicalUrl = `https://smarter.poker${canonicalPath}`;

  const jsonLd = [
    {
      '@type': 'Article',
      '@id': `${canonicalUrl}#article`,
      headline: stateGuide.h1,
      name: stateGuide.title,
      description: stateGuide.summary,
      url: canonicalUrl,
      inLanguage: 'en-US',
      datePublished: STATES_AS_OF,
      dateModified: STATES_AS_OF,
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
      mainEntity: (stateGuide.faqs || []).map((f) => ({
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
        { '@type': 'ListItem', position: 2, name: 'US State Poker Guides', item: STATES_URL },
        { '@type': 'ListItem', position: 3, name: `${stateGuide.name} (${stateGuide.code})`, item: canonicalUrl },
      ],
    },
  ];

  return (
    <div style={styles.page}>
      <SEOHead
        title={stateGuide.title}
        description={stateGuide.summary}
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
          <Link href={STATES_BASE_PATH} style={styles.crumbLink}>
            US State Poker Guides
          </Link>
          <span style={styles.crumbSep}>/</span>
          <span style={styles.crumbCurrent}>
            {stateGuide.name} ({stateGuide.code})
          </span>
        </nav>

        <header style={styles.heroPlate}>
          <div style={styles.badgeRow}>
            <span style={styles.cyanBadge}>
              {stateGuide.name} ({stateGuide.code}) | MIN AGE {stateGuide.minAge}
            </span>
            <span style={styles.emeraldBadge}>
              STATE TAX: {stateGuide.stateIncomeTaxRate}
            </span>
          </div>

          <h1 style={styles.h1}>{stateGuide.h1}</h1>

          <p style={styles.lead}>
            <strong>Direct State Summary:</strong> {stateGuide.summary}
          </p>

          <div style={styles.metricsGrid}>
            <div style={styles.metricCard}>
              <div style={styles.metricLabel}>Legal Cardroom Status</div>
              <div style={styles.metricValueCyan}>{stateGuide.legalStatus}</div>
            </div>
            <div style={styles.metricCard}>
              <div style={styles.metricLabel}>State Income Tax Rate</div>
              <div style={styles.metricValueEmerald}>{stateGuide.stateIncomeTaxRate}</div>
            </div>
            <div style={styles.metricCard}>
              <div style={styles.metricLabel}>Active Live Poker Rooms</div>
              <div style={styles.metricValueCyan}>{stateGuide.approxLiveRooms}</div>
            </div>
            <div style={styles.metricCard}>
              <div style={styles.metricLabel}>Standard Rake Model</div>
              <div style={styles.metricValueEmerald}>{stateGuide.rakeModel}</div>
            </div>
          </div>

          <div style={styles.quickCrossLinks}>
            <Link href="/hub/poker-near-me" style={styles.crossBtnCyan}>
              Find Live {stateGuide.name} Rooms Near Me
            </Link>
            <Link href="/tools/rake-calculator" style={styles.crossBtnEmerald}>
              Run Cash Rake Impact Calculator
            </Link>
            <Link href={STATES_BASE_PATH} style={styles.crossBtnOutline}>
              All 15 US State Guides
            </Link>
            <Link href="/poker-rooms/guides" style={styles.crossBtnOutline}>
              12 Regional City Market Guides
            </Link>
          </div>
        </header>

        {/* Regulatory & Tax Details */}
        <section aria-label="Regulatory And Tax Breakdown" style={styles.sectionPlate}>
          <h2 style={styles.h2}>
            {stateGuide.name} ({stateGuide.code}) Gaming Regulation, Online Status &amp; W-2G Tax Rules
          </h2>

          <div style={styles.twoColGrid}>
            <div style={styles.colBox}>
              <div style={styles.tagCyan}>REGULATORY &amp; LICENSING OVERVIEW</div>
              <h3 style={styles.h3}>How Live &amp; Online Poker Operate In {stateGuide.name}</h3>
              <p style={styles.bodyText}>{stateGuide.regulatoryOverview}</p>
              <p style={{ ...styles.bodyText, marginTop: '10px' }}>
                <strong>Online Real-Money Status:</strong> {stateGuide.onlineRealMoneyStatus}
              </p>
            </div>

            <div style={styles.colBox}>
              <div style={styles.tagEmerald}>TAX RATES &amp; W-2G WITHHOLDING</div>
              <h3 style={styles.h3}>{stateGuide.name} Tax &amp; Cage Withholding Rules</h3>
              <p style={styles.bodyText}>{stateGuide.taxWithholdingNotes}</p>
              <p style={{ ...styles.bodyText, marginTop: '10px' }}>
                <strong>Major Poker Cities:</strong> {(stateGuide.topCities || []).join(' | ')}
              </p>
            </div>
          </div>
        </section>

        {/* Other States */}
        <section aria-label="Compare Other US Poker States" style={styles.sectionPlate}>
          <h2 style={styles.h2}>Compare Other Major US Poker Jurisdictions</h2>
          <div style={styles.peerGrid}>
            {peerStates.map((peer) => (
              <Link key={peer.slug} href={stateGuidePath(peer.slug)} style={styles.peerCard}>
                <span style={styles.peerCode}>
                  {peer.code} | Age {peer.minAge}
                </span>
                <span style={styles.peerName}>{peer.name} Poker Guide</span>
                <span style={styles.peerTax}>{peer.stateIncomeTaxRate}</span>
              </Link>
            ))}
          </div>
        </section>

        {/* FAQs */}
        <section aria-label="Frequently Asked Questions" style={styles.sectionPlate}>
          <h2 style={styles.h2}>
            Frequently Asked Questions: {stateGuide.name} Poker Laws &amp; Rooms
          </h2>
          <div style={styles.faqList}>
            {(stateGuide.faqs || []).map((item) => (
              <div key={item.q} style={styles.faqItem}>
                <h3 style={styles.faqQ}>{item.q}</h3>
                <p style={styles.faqA}>{item.a}</p>
              </div>
            ))}
          </div>
        </section>

        <CitationBacklinkBox
          title={stateGuide.title}
          canonicalUrl={canonicalUrl}
          badgeType="research"
          badgeLabel={`${stateGuide.code} Poker Guide`}
          badgeValue={stateGuide.stateIncomeTaxRate}
          summary={stateGuide.summary}
          publishedYear="2026"
          slug={`state-poker-${stateGuide.slug}`}
        />

        <AiPromptLauncher
          title={stateGuide.title}
          canonicalUrl={canonicalUrl}
          canonicalPath={canonicalPath}
          markdownUrl={`/poker-rooms/states/${stateGuide.slug}.md`}
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
    fontSize: '14.5px',
    fontWeight: 700,
    color: '#00d4ff',
    lineHeight: 1.45,
  },
  metricValueEmerald: {
    fontSize: '14.5px',
    fontWeight: 700,
    color: '#10b981',
    lineHeight: 1.45,
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
    margin: '0 0 14px',
  },
  twoColGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(310px, 1fr))',
    gap: '16px',
  },
  colBox: {
    backgroundColor: '#0a0f18',
    border: '1px solid #1e293b',
    borderRadius: '6px',
    padding: '18px',
  },
  tagCyan: {
    fontSize: '11px',
    fontWeight: 700,
    color: '#00d4ff',
    marginBottom: '6px',
    letterSpacing: '0.05em',
  },
  tagEmerald: {
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
  bodyText: {
    fontSize: '14px',
    lineHeight: 1.65,
    color: '#cbd5e1',
    margin: 0,
  },
  peerGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
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
    fontSize: '14.5px',
    fontWeight: 700,
    color: '#f8fafc',
  },
  peerTax: {
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
