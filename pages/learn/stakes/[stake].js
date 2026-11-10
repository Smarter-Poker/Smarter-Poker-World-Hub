/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  INDIVIDUAL POKER STAKE LEVEL & MOVE-UP PAGE (/learn/stakes/[stake])
 * ═══════════════════════════════════════════════════════════════════════════════
 * Static detail page for each of the 7 canonical poker stake guides with
 * alias resolution (e.g. /learn/stakes/1-3, /learn/stakes/2-5, /learn/stakes/plo),
 * interactive Move-Up Readiness Checklist, pool tendencies, exploitative
 * adjustments, and Article + FAQPage + BreadcrumbList JSON-LD.
 *
 * House style: Title Case, zero em dashes.
 */

import React, { useState } from 'react';
import Link from 'next/link';
import SEOHead from '../../../src/components/seo/SEOHead';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import CitationBacklinkBox from '../../../src/components/seo/CitationBacklinkBox';
import AiPromptLauncher from '../../../src/components/seo/AiPromptLauncher';
import {
  POKER_STAKES,
  MOVE_UP_READINESS_CHECKLIST,
  STAKES_AS_OF,
  STAKES_BASE_PATH,
  STAKES_URL,
  getStakeBySlug,
  stakePath,
} from '../../../src/content/learn/stakes';

export async function getStaticPaths() {
  return {
    paths: POKER_STAKES.map((s) => ({ params: { stake: s.slug } })),
    fallback: 'blocking',
  };
}

export async function getStaticProps({ params }) {
  const stake = getStakeBySlug(params?.stake);
  if (!stake) return { notFound: true };

  const otherStakes = POKER_STAKES.filter((s) => s.slug !== stake.slug).map((s) => ({
    slug: s.slug,
    code: s.code,
    name: s.name,
    environment: s.environment,
    targetWinrate: s.targetWinrate,
  }));

  return {
    props: {
      stake,
      otherStakes,
    },
  };
}

export default function PokerStakeDetailPage({ stake, otherStakes = [] }) {
  const [checkedItems, setCheckedItems] = useState({
    'bankroll-30bi': true,
    'proven-sample': false,
    'three-bet-comfort': false,
    'stop-loss-plan': true,
    'zero-scared-money': false,
  });

  const toggleChecklist = (id) => {
    setCheckedItems((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const completedCount = Object.values(checkedItems).filter(Boolean).length;
  const totalChecklist = MOVE_UP_READINESS_CHECKLIST.length;

  const canonicalPath = stakePath(stake.slug);
  const canonicalUrl = `https://smarter.poker${canonicalPath}`;

  const jsonLd = [
    {
      '@type': 'Article',
      '@id': `${canonicalUrl}#article`,
      headline: stake.h1,
      name: stake.title,
      description: stake.summary,
      url: canonicalUrl,
      inLanguage: 'en-US',
      datePublished: STAKES_AS_OF,
      dateModified: STAKES_AS_OF,
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
      mainEntity: (stake.faqs || []).map((f) => ({
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
        { '@type': 'ListItem', position: 3, name: 'Stake Levels Hub', item: STAKES_URL },
        { '@type': 'ListItem', position: 4, name: stake.name, item: canonicalUrl },
      ],
    },
  ];

  return (
    <div style={styles.page}>
      <SEOHead
        title={stake.title}
        description={stake.summary}
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
          <Link href={STAKES_BASE_PATH} style={styles.crumbLink}>
            Stake Levels Hub
          </Link>
          <span style={styles.crumbSep}>/</span>
          <span style={styles.crumbCurrent}>{stake.name}</span>
        </nav>

        <header style={styles.heroPlate}>
          <div style={styles.badgeRow}>
            <span style={styles.cyanBadge}>{stake.environment}</span>
            <span style={styles.emeraldBadge}>TARGET: {stake.targetWinrate}</span>
          </div>

          <h1 style={styles.h1}>{stake.h1}</h1>

          <p style={styles.lead}>
            <strong>Direct Stake Summary:</strong> {stake.summary}
          </p>

          <div style={styles.metricsGrid}>
            <div style={styles.metricCard}>
              <div style={styles.metricLabel}>Standard Buy-In Range</div>
              <div style={styles.metricValueCyan}>{stake.typicalBuyIn}</div>
            </div>
            <div style={styles.metricCard}>
              <div style={styles.metricLabel}>Recommended Bankroll</div>
              <div style={styles.metricValueEmerald}>{stake.recommendedBankroll}</div>
            </div>
            <div style={styles.metricCard}>
              <div style={styles.metricLabel}>Target Winrate / ROI</div>
              <div style={styles.metricValueCyan}>{stake.targetWinrate}</div>
            </div>
            <div style={styles.metricCard}>
              <div style={styles.metricLabel}>Rake &amp; Fee Structure</div>
              <div style={styles.metricValueText}>{stake.rakeProfile}</div>
            </div>
          </div>

          <div style={styles.quickCrossLinks}>
            <Link href="/tools/bankroll-calculator" style={styles.crossBtnCyan}>
              Open Bankroll &amp; Risk Of Ruin Calculator
            </Link>
            <Link href="/tools/rake-calculator" style={styles.crossBtnEmerald}>
              Run Cash Rake Impact Calculator
            </Link>
            <Link href={STAKES_BASE_PATH} style={styles.crossBtnOutline}>
              All 7 Stake Level Guides
            </Link>
            <Link href="/learn/roadmaps" style={styles.crossBtnOutline}>
              5 Player Progression Roadmaps
            </Link>
          </div>
        </header>

        {/* Pool Tendencies & Exploitative Adjustments */}
        <section aria-label="Pool Tendencies And Exploitative Adjustments" style={styles.sectionPlate}>
          <h2 style={styles.h2}>
            {stake.code} Player Pool Tendencies &amp; Exploitative Counter-Strategy
          </h2>

          <div style={styles.twoColGrid}>
            <div style={styles.colBox}>
              <div style={styles.tagCyan}>POPULATION LEAKS &amp; TENDENCIES</div>
              <h3 style={styles.h3}>What Opponents Do Wrong At {stake.code}</h3>
              <ul style={styles.bulletList}>
                {(stake.poolTendencies || []).map((item) => (
                  <li key={item} style={styles.bulletItem}>
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            <div style={styles.colBox}>
              <div style={styles.tagEmerald}>EXPLOITATIVE COUNTER-ADJUSTMENTS</div>
              <h3 style={styles.h3}>How To Crush {stake.code} For Maximum EV</h3>
              <ul style={styles.bulletList}>
                {(stake.exploitativeAdjustments || []).map((item) => (
                  <li key={item} style={styles.bulletItem}>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* Move-Up Criteria & Interactive Checklist */}
        <section aria-label="Move Up Readiness Checklist" style={styles.sectionPlate}>
          <div style={styles.sectionHeader}>
            <h2 style={styles.h2}>
              Move-Up Readiness Checklist For {stake.code} ({completedCount} Of {totalChecklist} Verified)
            </h2>
            <span style={styles.readinessBadge}>
              {completedCount === totalChecklist
                ? 'READY TO STEP UP'
                : `${totalChecklist - completedCount} ITEMS REMAINING`}
            </span>
          </div>

          <p style={styles.sectionSub}>
            <strong>Specific Graduation Benchmark:</strong> {stake.moveUpCriteria}
          </p>

          <div style={styles.checklistGrid}>
            {MOVE_UP_READINESS_CHECKLIST.map((item) => {
              const isChecked = Boolean(checkedItems[item.id]);
              return (
                <div
                  key={item.id}
                  onClick={() => toggleChecklist(item.id)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') toggleChecklist(item.id);
                  }}
                  style={isChecked ? styles.checkCardActive : styles.checkCard}
                >
                  <div style={styles.checkHeader}>
                    <span style={isChecked ? styles.checkBoxOn : styles.checkBoxOff}>
                      {isChecked ? 'VERIFIED' : 'PENDING'}
                    </span>
                    <h3 style={styles.h3}>{item.label}</h3>
                  </div>
                  <p style={styles.checkDetail}>{item.detail}</p>
                </div>
              );
            })}
          </div>
        </section>

        {/* Other Stakes */}
        <section aria-label="Explore Other Stake Levels" style={styles.sectionPlate}>
          <h2 style={styles.h2}>Compare Other Live &amp; Online Poker Stake Tiers</h2>
          <div style={styles.peerGrid}>
            {otherStakes.map((peer) => (
              <Link key={peer.slug} href={stakePath(peer.slug)} style={styles.peerCard}>
                <span style={styles.peerCode}>{peer.environment}</span>
                <span style={styles.peerName}>{peer.name}</span>
                <span style={styles.peerWin}>{peer.targetWinrate}</span>
              </Link>
            ))}
          </div>
        </section>

        {/* FAQs */}
        <section aria-label="Frequently Asked Questions" style={styles.sectionPlate}>
          <h2 style={styles.h2}>
            Frequently Asked Questions: {stake.name}
          </h2>
          <div style={styles.faqList}>
            {(stake.faqs || []).map((item) => (
              <div key={item.q} style={styles.faqItem}>
                <h3 style={styles.faqQ}>{item.q}</h3>
                <p style={styles.faqA}>{item.a}</p>
              </div>
            ))}
          </div>
        </section>

        <CitationBacklinkBox
          title={stake.title}
          canonicalUrl={canonicalUrl}
          badgeType="gto"
          badgeLabel={stake.code}
          badgeValue={stake.targetWinrate}
          summary={stake.summary}
          publishedYear="2026"
          slug={`stake-${stake.slug}`}
        />

        <AiPromptLauncher
          title={stake.title}
          canonicalUrl={canonicalUrl}
          canonicalPath={canonicalPath}
          markdownUrl={`/learn/stakes/${stake.slug}.md`}
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
    fontSize: '18px',
    fontWeight: 800,
    color: '#00d4ff',
  },
  metricValueEmerald: {
    fontSize: '18px',
    fontWeight: 800,
    color: '#10b981',
  },
  metricValueText: {
    fontSize: '13.5px',
    fontWeight: 600,
    color: '#f8fafc',
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
  sectionHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: '10px',
    marginBottom: '10px',
  },
  h2: {
    fontSize: '21px',
    fontWeight: 800,
    color: '#f8fafc',
    margin: '0 0 12px',
  },
  readinessBadge: {
    fontSize: '11.5px',
    fontWeight: 700,
    color: '#10b981',
    border: '1px solid #10b981',
    padding: '4px 10px',
    borderRadius: '4px',
  },
  sectionSub: {
    fontSize: '14px',
    color: '#cbd5e1',
    lineHeight: 1.6,
    margin: '0 0 16px',
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
    margin: '0 0 10px',
  },
  bulletList: {
    margin: 0,
    paddingLeft: '18px',
    display: 'grid',
    gap: '8px',
  },
  bulletItem: {
    fontSize: '13.5px',
    lineHeight: 1.6,
    color: '#cbd5e1',
  },
  checklistGrid: {
    display: 'grid',
    gap: '12px',
  },
  checkCard: {
    backgroundColor: '#0a0f18',
    border: '1px solid #1e293b',
    borderRadius: '6px',
    padding: '16px',
    cursor: 'pointer',
  },
  checkCardActive: {
    backgroundColor: 'rgba(16, 185, 129, 0.08)',
    border: '1px solid #10b981',
    borderRadius: '6px',
    padding: '16px',
    cursor: 'pointer',
  },
  checkHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    marginBottom: '6px',
    flexWrap: 'wrap',
  },
  checkBoxOn: {
    backgroundColor: '#10b981',
    color: '#0a0f18',
    fontSize: '11px',
    fontWeight: 800,
    padding: '3px 8px',
    borderRadius: '4px',
  },
  checkBoxOff: {
    backgroundColor: '#1e293b',
    color: '#94a3b8',
    fontSize: '11px',
    fontWeight: 700,
    padding: '3px 8px',
    borderRadius: '4px',
  },
  checkDetail: {
    fontSize: '13.5px',
    color: '#cbd5e1',
    margin: 0,
    lineHeight: 1.55,
  },
  peerGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
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
