/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  INDIVIDUAL MAJOR POKER SERIES STRATEGY GUIDE (/poker-series/guides/[slug])
 * ═══════════════════════════════════════════════════════════════════════════════
 * Static strategy guide page for each of the 10 major North American live poker
 * series and festivals.
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
  SERIES_GUIDES,
  SERIES_GUIDES_AS_OF,
  SERIES_GUIDES_BASE_PATH,
  SERIES_GUIDES_URL,
  getSeriesGuideBySlug,
  seriesGuidePath,
} from '../../../src/content/guides/seriesGuides';

export async function getStaticPaths() {
  return {
    paths: SERIES_GUIDES.map((s) => ({ params: { slug: s.slug } })),
    fallback: 'blocking',
  };
}

export async function getStaticProps({ params }) {
  const guide = getSeriesGuideBySlug(params?.slug);
  if (!guide) return { notFound: true };

  const peerGuides = SERIES_GUIDES.filter((g) => g.slug !== guide.slug).slice(0, 6);

  return {
    props: {
      guide,
      peerGuides,
    },
  };
}

export default function PokerSeriesDetailPage({ guide, peerGuides = [] }) {
  const [copiedSeriesEmbed, setCopiedSeriesEmbed] = useState(false);
  const canonicalPath = `/poker-series/guides/${guide.slug}`;
  const canonicalUrl = `https://smarter.poker${canonicalPath}`;
  const seoTitle = `${guide.shortName} Strategy And Structure Guide`;
  const seoDesc = `${guide.name} Strategy Guide At ${guide.hostVenue} (${guide.cityState}): ${guide.buyInRange} Buy-Ins, ${guide.startingStackBB} Stacks, And Bankroll Sizing.`;
  const icsFeedPath = `/api/seo/series-calendar?slug=${encodeURIComponent(guide.slug)}`;
  const googleCalTemplateUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(`${guide.name} (${guide.cityState})`)}&details=${encodeURIComponent(`${guide.name} At ${guide.hostVenue}. Buy-Ins: ${guide.buyInRange} (Main Event: ${guide.mainEventBuyIn}). Full Structure & Strategy Guide: ${canonicalUrl}`)}&location=${encodeURIComponent(`${guide.hostVenue}, ${guide.cityState}`)}`;
  const seriesTableHtml = `<div style="padding:14px;background:#070b14;border:1px solid #1e293b;border-radius:8px;color:#e2e8f0;font-family:Inter,system-ui,sans-serif;"><div style="font-size:14px;font-weight:700;color:#38bdf8;margin-bottom:6px;">${guide.name} (${guide.cityState}) - Structure &amp; Schedule</div><p style="margin:0 0 8px 0;font-size:12.5px;color:#cbd5e1;">Venue: ${guide.hostVenue} | Window: ${guide.typicalMonths} | Buy-Ins: ${guide.buyInRange} | Main Event: ${guide.mainEventBuyIn}</p><a href="${canonicalUrl}" target="_blank" rel="noopener" style="font-size:12px;font-weight:700;color:#34d399;text-decoration:none;">View Full ${guide.shortName} Schedule, Late-Reg EV &amp; Bankroll Guide At Smarter.Poker</a></div>`;

  const handleCopySeriesWidget = async () => {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(seriesTableHtml);
        setCopiedSeriesEmbed(true);
        setTimeout(() => setCopiedSeriesEmbed(false), 2200);
      }
      if (typeof fetch === 'function') {
        fetch(
          `/api/seo/referral-stats?event=record&category=widget_embeds&item=series-${encodeURIComponent(guide.slug)}&source=series-guide`,
          { method: 'POST', keepalive: true }
        ).catch(() => {});
      }
    } catch {
      // Ignore clipboard error
    }
  };

  const jsonLd = [
    {
      '@type': 'Article',
      '@id': `${canonicalUrl}#article`,
      headline: `${guide.name} Complete Tournament Strategy & Structure Guide`,
      name: seoTitle,
      description: seoDesc,
      url: canonicalUrl,
      inLanguage: 'en-US',
      datePublished: SERIES_GUIDES_AS_OF,
      dateModified: SERIES_GUIDES_AS_OF,
      isAccessibleForFree: true,
      author: { '@id': 'https://smarter.poker/#organization' },
      publisher: { '@id': 'https://smarter.poker/#organization' },
      speakable: {
        '@type': 'SpeakableSpecification',
        cssSelector: ['h1', '#quick-answer-summary'],
      },
    },
    {
      '@type': 'FAQPage',
      '@id': `${canonicalUrl}#faq`,
      mainEntity: (guide.faqs || []).map((f) => ({
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
        { '@type': 'ListItem', position: 2, name: 'Poker Series', item: 'https://smarter.poker/hub/poker-series' },
        { '@type': 'ListItem', position: 3, name: 'Series Strategy Guides', item: SERIES_GUIDES_URL },
        { '@type': 'ListItem', position: 4, name: guide.shortName, item: canonicalUrl },
      ],
    },
  ];

  return (
    <div style={styles.page}>
      <SEOHead
        title={seoTitle}
        description={seoDesc}
        canonical={`/poker-series/guides/${guide.slug}`}
        jsonLd={jsonLd}
      />

      <UniversalHeader pageDepth={3} />

      <main style={styles.container}>
        <nav aria-label="Breadcrumb" style={styles.breadcrumbs}>
          <Link href="/" style={styles.crumbLink}>
            Smarter.Poker
          </Link>
          <span style={styles.crumbSep}>/</span>
          <Link href="/hub/poker-series" style={styles.crumbLink}>
            Poker Series
          </Link>
          <span style={styles.crumbSep}>/</span>
          <Link href={SERIES_GUIDES_BASE_PATH} style={styles.crumbLink}>
            Series Strategy Guides
          </Link>
          <span style={styles.crumbSep}>/</span>
          <span style={styles.crumbCurrent}>{guide.shortName}</span>
        </nav>

        <header style={styles.heroPlate}>
          <div style={styles.badgeRow}>
            <span style={styles.cyanBadge}>{guide.cityState}</span>
            <span style={styles.emeraldBadge}>{guide.blindStructureRating}</span>
          </div>

          <h1 style={styles.h1}>
            {guide.name}: Structure, Schedule &amp; Strategy Guide
          </h1>

          <p id="quick-answer-summary" style={styles.lead}>
            <strong>Direct Festival Overview:</strong> Hosted At <strong>{guide.hostVenue}</strong> In <strong>{guide.cityState}</strong> During <strong>{guide.typicalMonths}</strong>, The <strong>{guide.shortName}</strong> Spans Buy-Ins From <strong>{guide.buyInRange}</strong> Headlined By The <strong>{guide.mainEventBuyIn}</strong> ({guide.typicalGuarantee}).
          </p>

          {/* Structure Analytics Grid */}
          <div style={styles.kpiGrid}>
            <div style={styles.kpiBox}>
              <div style={styles.kpiLabel}>Main Event Buy-In</div>
              <div style={styles.kpiValCyan}>{guide.mainEventBuyIn}</div>
            </div>
            <div style={styles.kpiBox}>
              <div style={styles.kpiLabel}>Starting Stack Depth</div>
              <div style={styles.kpiValEmerald}>{guide.startingStackBB}</div>
            </div>
            <div style={styles.kpiBox}>
              <div style={styles.kpiLabel}>Blind Level Duration</div>
              <div style={styles.kpiValCyan}>{guide.levelMinutes}</div>
            </div>
            <div style={styles.kpiBox}>
              <div style={styles.kpiLabel}>Series Guarantees</div>
              <div style={styles.kpiValEmerald}>{guide.typicalGuarantee}</div>
            </div>
          </div>

          <div style={styles.quickCrossLinks}>
            <Link href="/tools/bankroll-calculator" style={styles.crossBtnCyan}>
              Size Your Series Bankroll
            </Link>
            <Link href="/tools/staking-calculator" style={styles.crossBtnEmerald}>
              Calculate Staking &amp; Markup
            </Link>
            <Link href="/tools/icm-calculator" style={styles.crossBtnOutline}>
              Final Table ICM Calculator
            </Link>
            <Link href={SERIES_GUIDES_BASE_PATH} style={styles.crossBtnOutline}>
              All 10 Major Series Guides
            </Link>
            <a href={icsFeedPath} style={styles.crossBtnCyan}>
              Download Series .ICS Calendar
            </a>
            <a
              href={googleCalTemplateUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={styles.crossBtnEmerald}
            >
              Add Series To Google Calendar
            </a>
            <button
              type="button"
              onClick={handleCopySeriesWidget}
              style={{
                ...styles.crossBtnOutline,
                cursor: 'pointer',
                background: copiedSeriesEmbed ? '#10b981' : 'transparent',
                color: copiedSeriesEmbed ? '#04131d' : '#e2e8f0',
              }}
            >
              {copiedSeriesEmbed ? 'Copied Schedule Embed HTML' : 'Copy Embeddable Schedule Card'}
            </button>
          </div>
        </header>

        {/* Key Events Table */}
        <section aria-label="Key Events And Flagship Tournaments" style={styles.sectionPlate}>
          <h2 style={styles.h2}>
            Signature Events &amp; Must-Play Tournaments At {guide.shortName}
          </h2>
          <div style={{ overflowX: 'auto', marginTop: '14px' }}>
            <table style={styles.table}>
              <thead>
                <tr style={styles.trHead}>
                  <th style={styles.th}>Event Name</th>
                  <th style={styles.th}>Buy-In</th>
                  <th style={styles.th}>Structure &amp; Format</th>
                  <th style={styles.th}>Strategic Value &amp; Field Notes</th>
                </tr>
              </thead>
              <tbody>
                {guide.keyEvents.map((ev) => (
                  <tr key={ev.eventName} style={styles.trBody}>
                    <td style={styles.tdEvent}>{ev.eventName}</td>
                    <td style={styles.tdBuyIn}>{ev.buyIn}</td>
                    <td style={styles.tdFormat}>{ev.format}</td>
                    <td style={styles.tdCell}>{ev.notes}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Strategy & Logistics Cards */}
        <section aria-label="Late Registration Cash Games And Bankroll Strategy" style={styles.sectionPlate}>
          <h2 style={styles.h2}>
            Player Operations: Late Registration, Cash Spillover &amp; Bankroll Sizing
          </h2>
          <div style={styles.strategyGrid}>
            <div style={styles.strategyCard}>
              <div style={styles.cardBadgeCyan}>LATE-REGISTRATION EV &amp; LINES</div>
              <h3 style={styles.h3}>Registration &amp; Late-Entry Strategy</h3>
              <p style={styles.strategyText}>{guide.registrationStrategy}</p>
            </div>

            <div style={styles.strategyCard}>
              <div style={styles.cardBadgeEmerald}>LIVE CASH GAME SPILLOVER</div>
              <h3 style={styles.h3}>Cash Game Action &amp; Table Selection</h3>
              <p style={styles.strategyText}>{guide.cashGameAction}</p>
            </div>

            <div style={styles.strategyCard}>
              <div style={styles.cardBadgeCyan}>TRAVEL &amp; HOTEL LOGISTICS</div>
              <h3 style={styles.h3}>Venue Navigation &amp; Lodging Tips</h3>
              <p style={styles.strategyText}>{guide.travelLogistics}</p>
            </div>

            <div style={styles.strategyCard}>
              <div style={styles.cardBadgeEmerald}>BANKROLL &amp; STAKING REQUIREMENTS</div>
              <h3 style={styles.h3}>Recommended Bankroll &amp; Bullet Allocation</h3>
              <p style={styles.strategyText}>{guide.bankrollRequirement}</p>
              <div style={styles.inlineToolLinks}>
                <Link href="/tools/bankroll-calculator" style={styles.inlineLinkCyan}>
                  Open Bankroll Calculator
                </Link>
                <Link href="/tools/staking-calculator" style={styles.inlineLinkEmerald}>
                  Open Staking Calculator
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* Peer Series Guides */}
        <section aria-label="Other Major Poker Series Guides" style={styles.sectionPlate}>
          <h2 style={styles.h2}>Compare Other Major North American Poker Tours</h2>
          <div style={styles.peerGrid}>
            {peerGuides.map((peer) => (
              <Link key={peer.slug} href={seriesGuidePath(peer.slug)} style={styles.peerCard}>
                <span style={styles.peerLoc}>{peer.cityState}</span>
                <span style={styles.peerTitle}>{peer.name}</span>
                <span style={styles.peerMeta}>Main: {peer.mainEventBuyIn}</span>
              </Link>
            ))}
          </div>
        </section>

        {/* FAQ Section */}
        <section aria-label="Frequently Asked Questions" style={styles.sectionPlate}>
          <h2 style={styles.h2}>
            Frequently Asked Questions: {guide.shortName}
          </h2>
          <div style={styles.faqList}>
            {guide.faqs.map((item) => (
              <div key={item.q} style={styles.faqItem}>
                <h3 style={styles.faqQ}>{item.q}</h3>
                <p style={styles.faqA}>{item.a}</p>
              </div>
            ))}
          </div>
        </section>

        <CitationBacklinkBox
          title={`${guide.name} Strategy & Structure Guide`}
          canonicalUrl={canonicalUrl}
          badgeType="research"
          badgeLabel="Tournament Series Blueprint"
          badgeValue={guide.shortName}
          summary={seoDesc}
          publishedYear="2026"
          slug={`series-guide-${guide.slug}`}
        />

        <AiPromptLauncher
          title={`${guide.name} Strategy & Structure Guide`}
          canonicalUrl={canonicalUrl}
          canonicalPath={canonicalPath}
          markdownUrl={`/poker-series/guides/${guide.slug}.md`}
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
  kpiGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
    gap: '14px',
    marginBottom: '22px',
  },
  kpiBox: {
    backgroundColor: '#0a0f18',
    border: '1px solid #1e293b',
    borderRadius: '6px',
    padding: '14px 16px',
  },
  kpiLabel: {
    fontSize: '11.5px',
    fontWeight: 700,
    color: '#94a3b8',
    textTransform: 'uppercase',
    marginBottom: '6px',
  },
  kpiValCyan: {
    fontSize: '15px',
    fontWeight: 800,
    color: '#00d4ff',
    lineHeight: 1.35,
  },
  kpiValEmerald: {
    fontSize: '15px',
    fontWeight: 800,
    color: '#10b981',
    lineHeight: 1.35,
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
  tdEvent: {
    padding: '12px',
    color: '#f8fafc',
    fontWeight: 700,
  },
  tdBuyIn: {
    padding: '12px',
    color: '#10b981',
    fontWeight: 700,
    whiteSpace: 'nowrap',
  },
  tdFormat: {
    padding: '12px',
    color: '#00d4ff',
    fontWeight: 600,
  },
  tdCell: {
    padding: '12px',
    color: '#cbd5e1',
    lineHeight: 1.5,
  },
  strategyGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
    gap: '16px',
    marginTop: '14px',
  },
  strategyCard: {
    backgroundColor: '#0a0f18',
    border: '1px solid #1e293b',
    borderRadius: '6px',
    padding: '18px',
  },
  cardBadgeCyan: {
    fontSize: '11px',
    fontWeight: 700,
    color: '#00d4ff',
    marginBottom: '6px',
    letterSpacing: '0.05em',
  },
  cardBadgeEmerald: {
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
  strategyText: {
    fontSize: '13.5px',
    lineHeight: 1.6,
    color: '#cbd5e1',
    margin: 0,
  },
  inlineToolLinks: {
    display: 'flex',
    gap: '14px',
    marginTop: '12px',
  },
  inlineLinkCyan: {
    fontSize: '12.5px',
    fontWeight: 700,
    color: '#00d4ff',
    textDecoration: 'none',
  },
  inlineLinkEmerald: {
    fontSize: '12.5px',
    fontWeight: 700,
    color: '#10b981',
    textDecoration: 'none',
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
  peerLoc: {
    fontSize: '11.5px',
    fontWeight: 700,
    color: '#10b981',
  },
  peerTitle: {
    fontSize: '14px',
    fontWeight: 700,
    color: '#00d4ff',
  },
  peerMeta: {
    fontSize: '12px',
    color: '#94a3b8',
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
