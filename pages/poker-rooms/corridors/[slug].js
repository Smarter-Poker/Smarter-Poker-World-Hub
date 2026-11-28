/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  INDIVIDUAL LIVE POKER TRAVEL CORRIDOR GUIDE (/poker-rooms/corridors/[slug])
 * ═══════════════════════════════════════════════════════════════════════════════
 * Detail page for each of the 10 North American live poker travel corridors,
 * featuring Place + GeoCoordinates JSON-LD, drive-time and mileage matrix,
 * rake vs. time-collection breakdown, state tax withholding comparison, and
 * 1-click links to /tools/poker-trip-planner & /tools/rake-calculator.
 *
 * House style: Title Case, zero em dashes.
 */

import React from 'react';
import Link from 'next/link';
import SEOHead from '../../../src/components/seo/SEOHead';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import CitationBacklinkBox from '../../../src/components/seo/CitationBacklinkBox';
import SmarterAccountUnlockGate from '../../../src/components/seo/SmarterAccountUnlockGate';
import { openQuickSignup } from '../../../src/components/seo/SmarterQuickSignupSheet';
import AiPromptLauncher from '../../../src/components/seo/AiPromptLauncher';
import { trackSeoFunnelEvent } from '../../../src/lib/seo/seoFunnelTelemetry';
import seoKitStyles from '../../../src/components/seo/SmarterSeoKit.module.css';
import HubPageSummary from '../../../src/components/seo/HubPageSummary';
import GeoCitationCapsule from '../../../src/components/seo/GeoCitationCapsule';
import GeoFollowUpChain from '../../../src/components/seo/GeoFollowUpChain';
import { setPublicSeoHtmlCache } from '../../../src/lib/seo/edgeCacheHeaders.mjs';
import {
  POKER_TRAVEL_CORRIDORS,
  CORRIDORS_AS_OF,
  CORRIDORS_BASE_PATH,
  CORRIDORS_URL,
  findCorridorBySlug,
  corridorGuidePath,
  renderCorridorDetailMarkdown,
} from '../../../src/content/guides/corridors';

export async function getServerSideProps(context) {
  const { req, res, params, query } = context;
  const rawSlug = String(params?.slug || '').replace(/\.md$/i, '');
  const corridor = findCorridorBySlug(rawSlug);
  if (!corridor) return { notFound: true };

  const acceptHeader = String(req?.headers?.accept || '');
  const isMarkdownRequested =
    acceptHeader.includes('text/markdown') ||
    query?.format === 'md' ||
    req?.url?.includes('format=md') ||
    String(params?.slug || '').endsWith('.md');

  if (isMarkdownRequested) {
    const mdContent = renderCorridorDetailMarkdown(corridor);
    res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
    res.setHeader('Vary', 'Accept');
    res.write(mdContent);
    res.end();
    return { props: {} };
  }

  const peerCorridors = POKER_TRAVEL_CORRIDORS.map((c) => ({
    slug: c.slug,
    shortTitle: c.shortTitle,
    originCity: c.originCity,
    originAirportCode: c.originAirportCode,
  }));

  setPublicSeoHtmlCache(context.res);
  return {
    props: {
      corridor,
      peerCorridors,
    },
  };
}

export default function PokerTravelCorridorDetailPage({ corridor, peerCorridors = [] }) {
  if (!corridor) return null;

  const canonicalPath = corridorGuidePath(corridor.slug);
  const canonicalUrl = `https://smarter.poker${canonicalPath}`;
  const corridorContextLabel = corridor.originCity
    ? `${corridor.originCity.split(',')[0].trim()} Corridor`
    : 'Corridor';

  const handleFollowLocalRooms = () => {
    trackSeoFunnelEvent('seo_local_action_bar_click', {
      vertical: 'corridor',
      slug: corridor.slug,
    });
    openQuickSignup({
      unlockKey: 'local-corridor-rooms',
      source: 'local-corridor-action-bar',
      redirectPath: canonicalPath,
      eyebrow: `Free ${corridorContextLabel} Alerts`,
      title: `Follow ${corridorContextLabel} Poker Rooms Free`,
      subtitle: 'Save Favorite Rooms, Get Tournament Start Reminders & Track Live Bankroll Sessions Free',
      benefits: [
        `Save Favorite ${corridorContextLabel} Listed Poker Rooms & Quick Access`,
        'Get Tournament Start Reminders & Series Alerts Free',
        'Log Cash & Tournament Sessions In Free Bankroll Manager',
      ],
    });
  };

  const jsonLd = [
    {
      '@type': 'Article',
      '@id': `${canonicalUrl}#article`,
      headline: corridor.name,
      name: corridor.shortTitle,
      description: corridor.summary,
      url: canonicalUrl,
      inLanguage: 'en-US',
      datePublished: CORRIDORS_AS_OF,
      dateModified: CORRIDORS_AS_OF,
      isAccessibleForFree: true,
      author: { '@id': 'https://smarter.poker/#organization' },
      publisher: { '@id': 'https://smarter.poker/#organization' },
      about: { '@id': `${canonicalUrl}#place` },
      speakable: {
        '@type': 'SpeakableSpecification',
        cssSelector: ['h1', 'header p:first-of-type'],
      },
    },
    {
      '@type': 'Place',
      '@id': `${canonicalUrl}#place`,
      name: `${corridor.originCity} (${corridor.originAirportCode}) Live Poker Travel Corridor`,
      description: corridor.summary,
      url: canonicalUrl,
      geo: {
        '@type': 'GeoCoordinates',
        latitude: corridor.originCoords.lat,
        longitude: corridor.originCoords.lng,
      },
      containsPlace: (corridor.driveOptions || []).map((opt) => ({
        '@type': 'Place',
        name: opt.venueName,
        address: opt.jurisdiction,
        description: `${opt.distanceMiles} Miles (${opt.driveMinutes} Minutes) From ${corridor.originCity}: ${opt.typicalGames}`,
      })),
    },
    {
      '@type': 'FAQPage',
      '@id': `${canonicalUrl}#faq`,
      mainEntity: (corridor.faqs || []).map((f) => ({
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
        { '@type': 'ListItem', position: 2, name: 'Live Poker Travel Corridors', item: CORRIDORS_URL },
        { '@type': 'ListItem', position: 3, name: corridor.shortTitle, item: canonicalUrl },
      ],
    },
  ];

  return (
    <div style={styles.page}>
      <SEOHead
        title="Live Poker Travel Corridor Routing Guide"
        description={corridor.summary}
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
          <Link href={CORRIDORS_BASE_PATH} style={styles.crumbLink}>
            Live Poker Travel Corridors
          </Link>
          <span style={styles.crumbSep}>/</span>
          <span style={styles.crumbCurrent}>{corridor.shortTitle}</span>
        </nav>

        <header style={styles.heroPlate}>
          <div style={styles.badgeRow}>
            <span style={styles.cyanBadge}>
              ORIGIN HUB: {corridor.originCity} ({corridor.originAirportCode})
            </span>
            <span style={styles.emeraldBadge}>
              GPS: {corridor.originCoords.lat}, {corridor.originCoords.lng}
            </span>
          </div>

          <h1 style={styles.h1}>{corridor.name}</h1>

          <p style={styles.lead}>
            <strong>Direct Corridor Summary:</strong> {corridor.summary}
          </p>

          <div style={styles.ruleCallout}>
            <div style={styles.ruleLabel}>IF / THEN / BECAUSE ROUTING DECISION RULE</div>
            <p style={styles.ruleText}>{corridor.ifThenBecause}</p>
            <div style={styles.personaNote}>
              <strong>Best For Player Persona:</strong> {corridor.bestForPersona}
            </div>
          </div>

          <div style={styles.quickCrossLinks}>
            <Link href="/tools/poker-trip-planner" style={styles.crossBtnCyan}>
              Calculate Trip Overhead In Poker Trip Planner
            </Link>
            <Link href="/tools/rake-calculator" style={styles.crossBtnEmerald}>
              Compare Rake Vs. Time Collection
            </Link>
            <Link href={CORRIDORS_BASE_PATH} style={styles.crossBtnOutline}>
              All 10 Travel Corridors
            </Link>
            <Link href="/poker-rooms/by-game" style={styles.crossBtnOutline}>
              Poker Rooms By Game Format
            </Link>
          </div>
        </header>

        {/* #SMARTERDESIGN Local Player Action Strip */}
        <section
          aria-label={`Follow ${corridorContextLabel} Poker Rooms And Log Sessions`}
          data-testid="local-player-action-strip"
          className={seoKitStyles.kit}
          style={{
            marginBottom: 24,
            padding: '16px 18px',
            background: 'linear-gradient(180deg, #111827 0%, #0b1120 100%)',
            border: '1px solid #2563eb',
            boxShadow: 'inset 0 1px 0 rgba(56, 189, 248, 0.35), 0 8px 20px rgba(0, 0, 0, 0.45)',
            borderRadius: 0,
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '14px 16px',
            maxWidth: '100%',
            boxSizing: 'border-box',
          }}
        >
          <div style={{ flex: '1 1 240px', minWidth: 0 }}>
            <span className={seoKitStyles.eyebrowTag}>
              Free {corridorContextLabel} Action Bar
            </span>
            <h2
              style={{
                margin: '8px 0 4px 0',
                fontSize: 17,
                fontWeight: 800,
                color: '#f8fafc',
                lineHeight: 1.25,
              }}
            >
              Follow {corridorContextLabel} Poker Rooms &amp; Log Live Sessions Free
            </h2>
            <p
              style={{
                margin: 0,
                fontSize: 13.5,
                lineHeight: 1.5,
                color: '#cbd5e1',
              }}
            >
              Save Favorite Rooms, Get Tournament Start Reminders &amp; Track Live Bankroll Sessions Free.
            </p>
          </div>
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              gap: 10,
              flex: '1 1 260px',
              justifyContent: 'flex-start',
              maxWidth: '100%',
              minWidth: 0,
            }}
          >
            <button
              type="button"
              data-testid="local-follow-rooms-cta"
              onClick={handleFollowLocalRooms}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                minHeight: 44,
                padding: '10px 16px',
                background: '#2563eb',
                border: '1px solid #38bdf8',
                borderRadius: 0,
                color: '#ffffff',
                fontSize: 13.5,
                fontWeight: 800,
                lineHeight: 1.25,
                textAlign: 'center',
                whiteSpace: 'normal',
                maxWidth: '100%',
                boxSizing: 'border-box',
                cursor: 'pointer',
              }}
            >
              Follow {corridorContextLabel} Poker Rooms Free
            </button>
            <Link
              href="/hub/bankroll-manager"
              data-testid="local-bankroll-cta"
              onClick={() =>
                trackSeoFunnelEvent('seo_local_action_bar_click', {
                  vertical: 'corridor',
                  slug: corridor.slug,
                  action: 'bankroll',
                })
              }
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                minHeight: 44,
                padding: '10px 16px',
                background: '#0b1120',
                border: '1px solid #38bdf8',
                borderRadius: 0,
                color: '#38bdf8',
                fontSize: 13.5,
                fontWeight: 700,
                lineHeight: 1.25,
                textAlign: 'center',
                textDecoration: 'none',
                whiteSpace: 'normal',
                maxWidth: '100%',
                boxSizing: 'border-box',
              }}
            >
              Log Tonight&apos;s Session Free
            </Link>
          </div>
        </section>

        {/* Drive-Time & Destination Comparison Table */}
        <section aria-label="Destination Drive Time And Rake Matrix" style={styles.sectionPlate}>
          <h2 style={styles.h2}>
            Drive-Time, Rake Model &amp; Tax Withholding Comparison From {corridor.originCity} ({corridor.originAirportCode})
          </h2>
          <div style={{ overflowX: 'auto' }}>
            <table style={styles.table}>
              <thead>
                <tr style={styles.trHead}>
                  <th style={styles.th}>Destination Venue</th>
                  <th style={styles.th}>Jurisdiction</th>
                  <th style={styles.th}>Distance &amp; Drive</th>
                  <th style={styles.th}>Rake / Time Model</th>
                  <th style={styles.th}>Tax Withholding</th>
                  <th style={styles.th}>Typical Cash &amp; Series</th>
                </tr>
              </thead>
              <tbody>
                {(corridor.driveOptions || []).map((opt) => (
                  <tr key={opt.venueName} style={styles.trBody}>
                    <td style={styles.tdTitle}>{opt.venueName}</td>
                    <td style={styles.td}>{opt.jurisdiction}</td>
                    <td style={styles.tdCyan}>
                      {opt.distanceMiles} Miles ({opt.driveMinutes} Mins)
                    </td>
                    <td style={styles.tdEmerald}>{opt.rakeModel}</td>
                    <td style={styles.td}>{opt.taxWithholding}</td>
                    <td style={styles.td}>{opt.typicalGames}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Detailed Venue Cards */}
        <section aria-label="Corridor Destination Profiles" style={styles.sectionPlate}>
          <h2 style={styles.h2}>
            Detailed Destination Profiles Along The {corridor.originCity} Corridor
          </h2>
          <div style={styles.venueGrid}>
            {(corridor.driveOptions || []).map((opt) => (
              <article key={opt.venueName} style={styles.venueCard}>
                <div style={styles.venueHeader}>
                  <span style={styles.tagCyan}>{opt.jurisdiction}</span>
                  <span style={styles.tagEmerald}>
                    {opt.distanceMiles} Miles • {opt.driveMinutes} Mins Drive
                  </span>
                </div>
                <h3 style={styles.h3}>{opt.venueName}</h3>
                <p style={styles.bodyText}>
                  <strong>Rake &amp; Collection Structure:</strong> {opt.rakeModel}
                </p>
                <p style={{ ...styles.bodyText, marginTop: 6 }}>
                  <strong>Tax &amp; W-2G Rules:</strong> {opt.taxWithholding}
                </p>
                <p style={{ ...styles.bodyText, marginTop: 6 }}>
                  <strong>Typical Cash &amp; Tournament Action:</strong> {opt.typicalGames}
                </p>
              </article>
            ))}
          </div>
        </section>

        {/* Peer Corridors */}
        <section aria-label="Compare Other North American Travel Corridors" style={styles.sectionPlate}>
          <h2 style={styles.h2}>Compare All 10 North American Live Poker Travel Corridors</h2>
          <div style={styles.peerGrid}>
            {peerCorridors.map((p) => (
              <Link key={p.slug} href={corridorGuidePath(p.slug)} style={styles.peerCard}>
                <span style={styles.peerCode}>
                  {p.originCity} | {p.originAirportCode}
                </span>
                <span style={styles.peerName}>{p.shortTitle}</span>
              </Link>
            ))}
          </div>
        </section>

        {/* FAQs */}
        <section aria-label="Frequently Asked Questions" style={styles.sectionPlate}>
          <h2 style={styles.h2}>
            Frequently Asked Questions: {corridor.shortTitle}
          </h2>
          <div style={styles.faqList}>
            {(corridor.faqs || []).map((item) => (
              <div key={item.q} style={styles.faqItem}>
                <h3 style={styles.faqQ}>{item.q}</h3>
                <p style={styles.faqA}>{item.a}</p>
              </div>
            ))}
          </div>
        </section>

        <GeoCitationCapsule
          title={`${corridor.shortTitle} (${corridor.originAirportCode}) Geographic Routing Benchmark`}
          claim={corridor.summary}
          metricLabel="Origin Hub & Airport"
          metricValue={`${corridor.originCity} (${corridor.originAirportCode})`}
          formulaText="Corridor Selection Rule: Compare Drive Time, Rake Cap Vs. Seat Time, And Destination State Tax Rate"
          ifThenBecause={corridor.ifThenBecause}
          quoteText={`For players departing ${corridor.originCity} (${corridor.originAirportCode}), matching session duration and stakes to the corridor's rake and tax regime maximizes net hourly retention.`}
          quoteAuthor="Smarter.Poker Live Venue Intelligence Team"
          doi="10.5281/zenodo.24115447"
          canonicalPath={canonicalPath}
        />

        <GeoFollowUpChain
          topicTitle={corridor.name}
          followUps={[
            {
              question: 'How Do I Calculate My Trip Breakeven Winrate Before Driving Or Flying This Corridor?',
              answer:
                'Input Your Planned Days, Hotel Rate, And Buy-Ins Into The Poker Trip Expense Planner At /tools/poker-trip-planner.',
              calculatorHref: '/tools/poker-trip-planner',
              calculatorLabel: 'Launch Trip Expense Planner',
              markdownHref: '/tools/poker-trip-planner.md',
            },
            {
              question: 'How Do Pot-Rake Caps Compare Against Hourly Seat-Rental Fees At Destination Cardrooms?',
              answer:
                'Compare Effective BB/100 Rake Drag Across Pot-Percentage And Time-Collection Models At /tools/rake-calculator.',
              calculatorHref: '/tools/rake-calculator',
              calculatorLabel: 'Launch Live Rake Calculator',
              markdownHref: '/tools/rake-calculator.md',
            },
            {
              question: 'How Can I Compare All 10 North American Airport And Border-State Poker Corridors Side By Side?',
              answer:
                'Return To The Master Live Poker Travel Corridors Directory At /poker-rooms/corridors.',
              calculatorHref: '/poker-rooms/corridors',
              calculatorLabel: 'View All 10 Travel Corridors',
              markdownHref: '/poker-rooms/corridors.md',
            },
          ]}
        />

        <HubPageSummary page="poker-rooms-international" path={canonicalPath} />

        <div style={{ margin: '24px 0' }}>
          <SmarterAccountUnlockGate
            variant="live-venue-intel"
            context={`poker-rooms-corridor-${corridor.slug}`}
            title={`See Live Waitlists & Peak Hours For ${corridor.originCity} Cardrooms Free`}
            redirectPath={canonicalPath}
          />
        </div>

        <CitationBacklinkBox
          title={corridor.name}
          canonicalUrl={canonicalUrl}
          badgeType="research"
          badgeLabel={`${corridor.originCity} (${corridor.originAirportCode})`}
          badgeValue="Corridor Routing Guide"
          summary={corridor.summary}
          publishedYear="2026"
          slug={`poker-corridor-${corridor.slug}`}
        />

        <AiPromptLauncher
          title={corridor.name}
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
  personaNote: {
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
  h3: { fontSize: 17, fontWeight: 700, color: '#f8fafc', margin: '6px 0 8px 0' },
  bodyText: { fontSize: 14, lineHeight: 1.6, color: '#cbd5e1', margin: 0 },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 13.5 },
  trHead: { borderBottom: '1px solid #2b4663', textAlign: 'left', color: '#38bdf8' },
  th: { padding: '10px 12px', fontWeight: 700 },
  trBody: { borderBottom: '1px solid #2b4663' },
  tdTitle: { padding: '11px 12px', fontWeight: 700, color: '#f8fafc' },
  td: { padding: '11px 12px', color: '#cbd5e1' },
  tdCyan: { padding: '11px 12px', color: '#38bdf8', fontWeight: 700 },
  tdEmerald: { padding: '11px 12px', color: '#34d399', fontWeight: 700 },
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
  tagCyan: { fontSize: 11, fontWeight: 800, color: '#38bdf8', letterSpacing: '0.05em' },
  tagEmerald: { fontSize: 11, fontWeight: 800, color: '#34d399', letterSpacing: '0.05em' },
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
  peerName: { fontSize: 14, fontWeight: 700, color: '#f8fafc' },
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
