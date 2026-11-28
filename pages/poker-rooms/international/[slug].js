/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  INDIVIDUAL INTERNATIONAL POKER DESTINATION GUIDE (/poker-rooms/international/[slug])
 * ═══════════════════════════════════════════════════════════════════════════════
 * Static detail page for each of the 10 international live poker destinations
 * with top cardrooms, table currency, cash game stakes, rake caps, tournament
 * series (EPT, Triton, WSOPE, WSOP Paradise, WPT), visitor gaming tax rules,
 * travel logistics, and 1-click links to /tools/poker-trip-planner & /tools/rake-calculator.
 *
 * House style: Title Case, zero em dashes.
 */

import React, { useState } from 'react';
import Link from 'next/link';
import SEOHead from '../../../src/components/seo/SEOHead';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import CitationBacklinkBox from '../../../src/components/seo/CitationBacklinkBox';
import SmarterAccountUnlockGate from '../../../src/components/seo/SmarterAccountUnlockGate';
import AiPromptLauncher from '../../../src/components/seo/AiPromptLauncher';
import {
  INTERNATIONAL_POKER_GUIDES,
  INTERNATIONAL_GUIDES_AS_OF,
  INTERNATIONAL_BASE_PATH,
  INTERNATIONAL_URL,
  findInternationalGuide,
  internationalGuidePath,
} from '../../../src/content/guides/internationalMarkets';

export async function getStaticPaths() {
  return {
    paths: INTERNATIONAL_POKER_GUIDES.map((g) => ({ params: { slug: g.slug } })),
    fallback: 'blocking',
  };
}

export async function getStaticProps({ params }) {
  const guide = findInternationalGuide(params?.slug);
  if (!guide) return { notFound: true };

  return {
    props: {
      guide,
      allGuides: INTERNATIONAL_POKER_GUIDES.map((g) => ({
        slug: g.slug,
        city: g.city,
        country: g.country,
        region: g.region,
        currency: g.currency,
        rakeCap: g.rakeCap,
      })),
    },
  };
}

export default function InternationalPokerGuideDetailPage({ guide, allGuides = [] }) {
  const [copiedCard, setCopiedCard] = useState('');
  const canonicalPath = internationalGuidePath(guide.slug);
  const canonicalUrl = `https://smarter.poker${canonicalPath}`;

  const destinationAssumptions = `As Of ${INTERNATIONAL_GUIDES_AS_OF}; Statutory Visitor Gaming Tax & Casino Cage Rules In ${guide.country} (${guide.currency})`;
  const discordFactSheet = `[Smarter.Poker International Poker Guide: ${guide.city}, ${guide.country}] Currency: ${guide.currency} | Stakes: ${guide.typicalStakes} | Rake Cap: ${guide.rakeCap} | Series: ${guide.flagshipSeries} | Assumptions: ${destinationAssumptions} | Guide: ${canonicalUrl}`;
  const redditFactSheet = `**${guide.city}, ${guide.country} - International Live Poker Destination Fact Sheet**\n- **Table Currency:** ${guide.currency}\n- **Typical Cash Game Stakes:** ${guide.typicalStakes}\n- **Rake Percentage & Cap:** ${guide.rakeCap}\n- **Flagship Tournament Series:** ${guide.flagshipSeries}\n- **Jurisdiction Assumptions:** ${destinationAssumptions}\n- *Source: [Smarter.Poker ${guide.city} Poker Destination Guide](${canonicalUrl})*`;

  const handleCopyFactSheet = async (type, text) => {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(text);
        setCopiedCard(type);
        setTimeout(() => setCopiedCard(''), 2200);
      }
      if (typeof fetch === 'function') {
        fetch(
          `/api/seo/referral-stats?event=record&category=solved_spot_shares&item=international-${encodeURIComponent(guide.slug)}&source=${encodeURIComponent(type)}`,
          { method: 'POST', keepalive: true }
        ).catch(() => {});
      }
    } catch {
      // Ignore clipboard failures
    }
  };

  const jsonLd = [
    {
      '@type': 'Article',
      '@id': `${canonicalUrl}#article`,
      headline: guide.h1,
      name: guide.title,
      description: guide.summary,
      url: canonicalUrl,
      inLanguage: 'en-US',
      datePublished: INTERNATIONAL_GUIDES_AS_OF,
      dateModified: INTERNATIONAL_GUIDES_AS_OF,
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
        { '@type': 'ListItem', position: 2, name: 'International Poker Guides', item: INTERNATIONAL_URL },
        { '@type': 'ListItem', position: 3, name: `${guide.city}, ${guide.country}`, item: canonicalUrl },
      ],
    },
  ];

  return (
    <div style={styles.page}>
      <SEOHead
        title={guide.title}
        description={guide.summary}
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
          <Link href={INTERNATIONAL_BASE_PATH} style={styles.crumbLink}>
            International Poker Guides
          </Link>
          <span style={styles.crumbSep}>/</span>
          <span style={styles.crumbCurrent}>
            {guide.city}, {guide.country}
          </span>
        </nav>

        <header style={styles.heroPlate}>
          <div style={styles.badgeRow}>
            <span style={styles.cyanBadge}>{guide.region}</span>
            <span style={styles.emeraldBadge}>CURRENCY: {guide.currency}</span>
          </div>

          <h1 style={styles.h1}>{guide.h1}</h1>

          <p style={styles.lead}>
            <strong>Direct Destination Summary:</strong> {guide.summary}
          </p>

          <div style={styles.metricsGrid}>
            <div style={styles.metricCard}>
              <div style={styles.metricLabel}>Table Currency</div>
              <div style={styles.metricValueCyan}>{guide.currency}</div>
            </div>
            <div style={styles.metricCard}>
              <div style={styles.metricLabel}>Typical Cash Game Stakes</div>
              <div style={styles.metricValueText}>{guide.typicalStakes}</div>
            </div>
            <div style={styles.metricCard}>
              <div style={styles.metricLabel}>Rake Percentage &amp; Cap</div>
              <div style={styles.metricValueEmerald}>{guide.rakeCap}</div>
            </div>
            <div style={styles.metricCard}>
              <div style={styles.metricLabel}>Major Tournament Series</div>
              <div style={styles.metricValueText}>{guide.flagshipSeries}</div>
            </div>
          </div>

          <div style={styles.quickCrossLinks}>
            <Link href="/tools/poker-trip-planner" style={styles.crossBtnCyan}>
              Plan Your {guide.city} Trip In Poker Trip Planner
            </Link>
            <Link href="/tools/rake-calculator" style={styles.crossBtnEmerald}>
              Compare {guide.city} Rake In Rake Calculator
            </Link>
            <Link href="/tools/poker-tax-calculator" style={styles.crossBtnOutline}>
              2026 Poker Tax &amp; Treaty Calculator
            </Link>
            <Link href={INTERNATIONAL_BASE_PATH} style={styles.crossBtnOutline}>
              All 10 Global Destinations
            </Link>
            <button
              type="button"
              onClick={() => handleCopyFactSheet('discord', discordFactSheet)}
              style={{ ...styles.crossBtnOutline, cursor: 'pointer', color: '#25c8ff', borderColor: 'rgba(37, 200, 255, 0.45)' }}
            >
              {copiedCard === 'discord' ? 'Copied Discord Fact Sheet!' : 'Copy Discord Destination Card'}
            </button>
            <button
              type="button"
              onClick={() => handleCopyFactSheet('reddit', redditFactSheet)}
              style={{ ...styles.crossBtnOutline, cursor: 'pointer', color: '#34d399', borderColor: 'rgba(52, 211, 153, 0.45)' }}
            >
              {copiedCard === 'reddit' ? 'Copied Reddit Markdown!' : 'Copy Reddit / Forum Markdown'}
            </button>
          </div>
        </header>

        {/* Premier Poker Rooms */}
        <section aria-label="Premier Poker Rooms And Venues" style={styles.sectionPlate}>
          <h2 style={styles.h2}>
            Top Live Poker Rooms &amp; Tournament Venues In {guide.city}, {guide.country}
          </h2>
          <div style={styles.venueGrid}>
            {(guide.topPokerRooms || []).map((room) => (
              <article key={room.name} style={styles.venueCard}>
                <div style={styles.venueHeader}>
                  <span style={styles.tagCyan}>{room.neighborhood}</span>
                </div>
                <h3 style={styles.h3}>{room.name}</h3>
                <p style={styles.bodyText}>{room.highlights}</p>
              </article>
            ))}
          </div>
        </section>

        {/* Visitor Tax Rule & Travel Logistics */}
        <section aria-label="Visitor Gaming Tax Rules And Travel Strategy" style={styles.sectionPlate}>
          <h2 style={styles.h2}>
            Visitor Gaming Tax Rules, Currency Logistics &amp; Table Strategy In {guide.city}
          </h2>
          <div style={styles.twoColGrid}>
            <div style={styles.colBox}>
              <div style={styles.tagEmerald}>VISITOR GAMING TAX &amp; CAGE WITHHOLDING</div>
              <h3 style={styles.h3}>How Winnings Are Taxed In {guide.country}</h3>
              <p style={styles.bodyText}>{guide.visitorTaxRule}</p>
            </div>

            <div style={styles.colBox}>
              <div style={styles.tagCyan}>TRAVEL LOGISTICS &amp; TABLE STRATEGY</div>
              <h3 style={styles.h3}>Pro Tips For Visiting Players In {guide.city}</h3>
              <ul style={styles.bulletList}>
                {(guide.travelAndStrategyTips || []).map((tip) => (
                  <li key={tip} style={styles.bulletItem}>
                    {tip}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div style={{ marginTop: 18, display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            <Link href="/tools/poker-trip-planner" style={styles.crossBtnCyan}>
              Calculate {guide.city} Hotel, Flight &amp; Buy-In Budget
            </Link>
            <Link href="/tools/rake-calculator" style={styles.crossBtnEmerald}>
              Model {guide.city} Hourly Rake Impact
            </Link>
            <Link href="/learn/poker-as-a-business" style={styles.crossBtnOutline}>
              Read International Tax Treaty &amp; Form W-8BEN Guide
            </Link>
          </div>
        </section>

        {/* All 10 Global Destinations */}
        <section aria-label="Compare Other International Poker Destinations" style={styles.sectionPlate}>
          <h2 style={styles.h2}>Compare All 10 Global Live Poker Hubs</h2>
          <div style={styles.peerGrid}>
            {allGuides.map((g) => (
              <Link key={g.slug} href={internationalGuidePath(g.slug)} style={styles.peerCard}>
                <span style={styles.peerCode}>
                  {g.region} | {g.currency}
                </span>
                <span style={styles.peerName}>
                  {g.city}, {g.country}
                </span>
                <span style={styles.peerStats}>{g.rakeCap}</span>
              </Link>
            ))}
          </div>
        </section>

        {/* FAQs */}
        <section aria-label="Frequently Asked Questions" style={styles.sectionPlate}>
          <h2 style={styles.h2}>
            Frequently Asked Questions: Live Poker In {guide.city}, {guide.country}
          </h2>
          <div style={styles.faqList}>
            {(guide.faqs || []).map((item) => (
              <div key={item.q} style={styles.faqItem}>
                <h3 style={styles.faqQ}>{item.q}</h3>
                <p style={styles.faqA}>{item.a}</p>
              </div>
            ))}
          </div>
        </section>

        <div style={{ margin: '24px 0' }}>
          <SmarterAccountUnlockGate
            variant="live-venue-intel"
            context={`poker-rooms-intl-${guide.slug}`}
            title={`Save ${guide.city || guide.country} Poker Rooms & Series Alerts Free`}
            redirectPath={canonicalPath}
          />
        </div>

        <CitationBacklinkBox
          title={guide.h1}
          canonicalUrl={canonicalUrl}
          badgeType="research"
          badgeLabel={`${guide.city}, ${guide.country}`}
          badgeValue={guide.currency}
          summary={guide.summary}
          publishedYear="2026"
          slug={`international-poker-${guide.slug}`}
        />

        <AiPromptLauncher
          title={guide.h1}
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
    background: 'linear-gradient(180deg, #0d1f33 0%, #071321 100%)',
    border: '1px solid #2b4663',
    borderRadius: 0,
    padding: '28px 26px',
    marginBottom: 26,
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
    border: '1px solid #2b4663',
    borderRadius: 0,
    padding: '14px 16px',
  },
  metricLabel: { fontSize: 12, color: '#94a3b8', fontWeight: 600, marginBottom: 6 },
  metricValueCyan: { fontSize: 15.5, fontWeight: 800, color: '#38bdf8' },
  metricValueEmerald: { fontSize: 14.5, fontWeight: 800, color: '#34d399', lineHeight: 1.4 },
  metricValueText: { fontSize: 13.5, fontWeight: 700, color: '#f8fafc', lineHeight: 1.4 },
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
    marginBottom: 26,
  },
  h2: { fontSize: 21, fontWeight: 800, color: '#f8fafc', margin: '0 0 14px 0' },
  h3: { fontSize: 17, fontWeight: 700, color: '#f8fafc', margin: '6px 0 10px 0' },
  bodyText: { fontSize: 14.5, lineHeight: 1.65, color: '#cbd5e1', margin: 0 },
  venueGrid: { display: 'grid', gap: 14 },
  venueCard: {
    background: '#0d1f33',
    border: '1px solid #2b4663',
    borderRadius: 0,
    padding: '16px 18px',
  },
  venueHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  twoColGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(310px, 1fr))',
    gap: 18,
  },
  colBox: {
    background: '#0d1f33',
    border: '1px solid #2b4663',
    borderRadius: 0,
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
    borderRadius: 0,
    background: '#0d1f33',
    border: '1px solid #2b4663',
    textDecoration: 'none',
  },
  peerCode: { fontSize: 11, fontWeight: 800, color: '#38bdf8' },
  peerName: { fontSize: 14.5, fontWeight: 700, color: '#f8fafc' },
  peerStats: { fontSize: 12, color: '#94a3b8' },
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
