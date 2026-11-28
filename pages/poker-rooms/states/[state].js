/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  INDIVIDUAL US STATE POKER LEGALITY & TAX GUIDE (/poker-rooms/states/[state])
 * ═══════════════════════════════════════════════════════════════════════════════
 * Static detail page for all 50 US states and DC with 2-letter code
 * alias support (e.g. /poker-rooms/states/nv -> nevada, /poker-rooms/states/tx -> texas),
 * regulatory overview, W-2G withholding notes, top cities, and JSON-LD schemas.
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
import SmarterConversionCta from '../../../src/components/seo/SmarterConversionCta';
import {
  US_POKER_STATES,
  STATES_AS_OF,
  STATES_BASE_PATH,
  STATES_URL,
  getStateGuideBySlug,
  stateGuidePath,
} from '../../../src/content/guides/states';
// Outage fallback only: the live listed set (src/lib/server/venueStats.mjs)
// answers whenever the database can be read.
import venueDirectorySnapshot from '../../../data/poker-venue-directory-snapshot.json';
import { VENUE_COUNT_LABEL, listedVenueLabel } from '../../../src/lib/venueCount.mjs';
import { getStateRooms, VENUE_STATS_REVALIDATE_S } from '../../../src/lib/server/venueStats.mjs';

export async function getStaticPaths() {
  return {
    paths: US_POKER_STATES.map((s) => ({ params: { state: s.slug } })),
    fallback: 'blocking',
  };
}

export async function getStaticProps({ params }) {
  const stateGuide = getStateGuideBySlug(params?.state);
  if (!stateGuide) return { notFound: true };
  if (params?.state && String(params.state).trim().toLowerCase() !== stateGuide.slug) {
    return {
      redirect: {
        destination: stateGuidePath(stateGuide.slug),
        permanent: true,
      },
    };
  }

  // Top rooms and the room count come from ONE read of the live listed set,
  // the same rows /poker-rooms/states and /hub/poker-near-me/in/<state> show.
  const { stats, count, topRooms } = await getStateRooms(stateGuide.code, {
    fallbackVenues: venueDirectorySnapshot?.venues || [],
    limit: 8,
  });
  const hasLiveStateDirectory = count > 0;
  const topStateVenues = topRooms;
  const stateRoomLabel = listedVenueLabel(stateGuide.code, { [String(stateGuide.code).toUpperCase()]: count });

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
      hasLiveStateDirectory,
      topStateVenues,
      stateRoomLabel,
      venueCountLabel: stats.label,
      venueCountSource: stats.source,
    },
    revalidate: VENUE_STATS_REVALIDATE_S,
  };
}

export default function USStatePokerDetailPage({
  stateGuide,
  peerStates = [],
  hasLiveStateDirectory = false,
  topStateVenues = [],
  stateRoomLabel,
  venueCountLabel = VENUE_COUNT_LABEL,
}) {
  const roomLabel = stateRoomLabel || listedVenueLabel(stateGuide.code);
  const liveRoomsHref = hasLiveStateDirectory
    ? `/hub/poker-near-me/in/${stateGuide.code.toLowerCase()}`
    : '/hub/poker-near-me/lobby';
  const [copiedCard, setCopiedCard] = useState('');
  const canonicalPath = stateGuidePath(stateGuide.slug);
  const canonicalUrl = `https://smarter.poker${canonicalPath}`;

  const stateAssumptions = '2026 US State Gaming Commission Statutes & IRS/State Form W-2G Tax Code';
  const discordFactSheet = `[Smarter.Poker US State Poker Law & Tax Fact Sheet: ${stateGuide.name} (${stateGuide.code})] Status: ${stateGuide.legalStatus} | Min Age: ${stateGuide.minAge} | State Tax: ${stateGuide.stateIncomeTaxRate} | Listed Rooms: ${roomLabel} | Rake Model: ${stateGuide.rakeModel} | Assumptions: ${stateAssumptions} | Source: ${canonicalUrl}`;
  const redditFactSheet = `**${stateGuide.name} (${stateGuide.code}) - Live & Online Poker Legality, Rake & Tax Fact Sheet**\n- **Legal Cardroom Status:** ${stateGuide.legalStatus}\n- **Minimum Gaming Age:** ${stateGuide.minAge}\n- **State Income Tax / W-2G Rate:** ${stateGuide.stateIncomeTaxRate}\n- **Listed Poker Rooms:** ${roomLabel}\n- **Standard Rake Model:** ${stateGuide.rakeModel}\n- **Statutory Assumptions:** ${stateAssumptions}\n- *Source: [Smarter.Poker ${stateGuide.name} Poker Guide](${canonicalUrl})*`;

  const handleCopyFactSheet = async (type, text) => {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(text);
        setCopiedCard(type);
        setTimeout(() => setCopiedCard(''), 2200);
      }
      if (typeof fetch === 'function') {
        fetch(
          `/api/seo/referral-stats?event=record&category=solved_spot_shares&item=state-${encodeURIComponent(stateGuide.slug)}&source=${encodeURIComponent(type)}`,
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
              <div style={styles.metricLabel}>Listed Poker Rooms</div>
              <div style={styles.metricValueCyan}>{roomLabel}</div>
            </div>
            <div style={styles.metricCard}>
              <div style={styles.metricLabel}>Standard Rake Model</div>
              <div style={styles.metricValueEmerald}>{stateGuide.rakeModel}</div>
            </div>
          </div>

          <div style={styles.quickCrossLinks}>
            <Link href={liveRoomsHref} style={styles.crossBtnCyan}>
              {hasLiveStateDirectory ? `Find Live ${stateGuide.name} Rooms Near Me` : 'Browse Live Poker Rooms Nationwide'}
            </Link>
            <Link href="/tools/rake-calculator" style={styles.crossBtnEmerald}>
              Run Cash Rake Impact Calculator
            </Link>
            <Link href={STATES_BASE_PATH} style={styles.crossBtnOutline}>
              All 50 US States &amp; DC Guides
            </Link>
            <Link href="/poker-rooms/guides" style={styles.crossBtnOutline}>
              12 Regional City Market Guides
            </Link>
            <button
              type="button"
              onClick={() => handleCopyFactSheet('discord', discordFactSheet)}
              style={{ ...styles.crossBtnOutline, cursor: 'pointer', color: '#25c8ff', borderColor: 'rgba(37, 200, 255, 0.45)' }}
            >
              {copiedCard === 'discord' ? 'Copied Discord Fact Sheet!' : 'Copy Discord State Law Card'}
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

          {topStateVenues.length > 0 && (
            <div style={{ marginTop: '20px', paddingTop: '18px', borderTop: '1px solid #2b4663' }}>
              <h3 style={styles.h3}>Top Listed Live Poker Rooms In {stateGuide.name}</h3>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginTop: '10px' }}>
                {topStateVenues.map((venue) => (
                  <Link
                    key={venue.id}
                    href={`/hub/venues/${venue.id}`}
                    style={{
                      padding: '8px 12px',
                      background: '#020608',
                      border: '1px solid #2b4663',
                      borderRadius: 0,
                      color: '#25c8ff',
                      textDecoration: 'none',
                      fontSize: '13px',
                      fontWeight: 600,
                    }}
                  >
                    {venue.name}{venue.city ? ` (${venue.city})` : ''}
                  </Link>
                ))}
              </div>
            </div>
          )}
        </section>

        {/* Contextual Internal-Link Mesh */}
        <section aria-label={`Live Poker Resources For ${stateGuide.name}`} style={styles.sectionPlate}>
          <h2 style={styles.h2}>Explore Live Poker &amp; Tools For {stateGuide.name}</h2>
          <div style={styles.peerGrid}>
            <Link href={liveRoomsHref} style={styles.peerCard}>
              <span style={styles.peerCode}>LIVE DIRECTORY</span>
              <span style={styles.peerName}>
                {hasLiveStateDirectory ? `Live Poker Rooms In ${stateGuide.name}` : 'Browse Nationwide Live Poker Rooms'}
              </span>
              <span style={styles.peerTax}>Listed Rooms, Cash Games &amp; Schedules</span>
            </Link>
            <Link href={`/hub/home-games/in/${stateGuide.code.toLowerCase()}`} style={styles.peerCard}>
              <span style={styles.peerCode}>HOME GAMES</span>
              <span style={styles.peerName}>Home Poker Games In {stateGuide.name}</span>
              <span style={styles.peerTax}>Public Local Games &amp; Host Schedules</span>
            </Link>
            <Link href="/tools/poker-tax-calculator" style={styles.peerCard}>
              <span style={styles.peerCode}>FREE CALCULATOR</span>
              <span style={styles.peerName}>IRS W-2G &amp; State Poker Tax Calculator</span>
              <span style={styles.peerTax}>{stateGuide.stateIncomeTaxRate}</span>
            </Link>
            <Link href="/hub/tournaments/this-weekend" style={styles.peerCard}>
              <span style={styles.peerCode}>WEEKEND SCHEDULE</span>
              <span style={styles.peerName}>Poker Tournaments This Weekend</span>
              <span style={styles.peerTax}>Friday To Sunday Guaranteed Events</span>
            </Link>
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

        <div style={{ marginBottom: 24 }}>
          <SmarterConversionCta
            eyebrow={`Free ${stateGuide.name} Poker Companion`}
            title={`Track Live ${stateGuide.name} Poker Rooms & Sessions Free`}
            description={`Create A Free Smarter.Poker Account To Save Favorite ${stateGuide.name} Cardrooms, Check Live Cash Games, And Log W-2G & Cash Game Results.`}
            primaryLabel="Create Free Account"
            primaryHref={`/auth/signup?redirect=${encodeURIComponent(canonicalPath)}&src=poker-rooms-state`}
            secondaryLabel="Sign In"
            secondaryHref={`/auth/login?redirect=${encodeURIComponent(canonicalPath)}`}
            highlights={['100% Free Account', `${venueCountLabel} Poker Rooms`, 'Bankroll & Tax Log']}
          />
        </div>

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

        <div style={{ margin: '24px 0' }}>
          <SmarterAccountUnlockGate
            variant="live-venue-intel"
            context={`poker-rooms-state-${stateGuide.slug}`}
            title={`See Live ${stateGuide.name} Poker Rooms, Waitlists & Alerts Free`}
            redirectPath={canonicalPath}
          />
        </div>

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
    backgroundColor: '#071321',
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
    background: 'linear-gradient(180deg, #0d1f33 0%, #071321 100%)',
    border: '1px solid #2b4663',
    borderRadius: 0,
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
    borderRadius: 0,
    letterSpacing: '0.06em',
  },
  emeraldBadge: {
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    border: '1px solid #10b981',
    color: '#10b981',
    fontSize: '11px',
    fontWeight: 700,
    padding: '4px 10px',
    borderRadius: 0,
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
    backgroundColor: '#071321',
    border: '1px solid #2b4663',
    borderRadius: 0,
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
    borderRadius: 0,
    textDecoration: 'none',
  },
  crossBtnEmerald: {
    backgroundColor: '#10b981',
    color: '#0a0f18',
    fontWeight: 700,
    fontSize: '13px',
    padding: '9px 16px',
    borderRadius: 0,
    textDecoration: 'none',
  },
  crossBtnOutline: {
    backgroundColor: '#071321',
    border: '1px solid #2b4663',
    color: '#e2e8f0',
    fontWeight: 600,
    fontSize: '13px',
    padding: '9px 16px',
    borderRadius: 0,
    textDecoration: 'none',
  },
  sectionPlate: {
    background: 'linear-gradient(180deg, #0d1f33 0%, #071321 100%)',
    border: '1px solid #2b4663',
    borderRadius: 0,
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
    backgroundColor: '#071321',
    border: '1px solid #2b4663',
    borderRadius: 0,
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
    backgroundColor: '#071321',
    border: '1px solid #2b4663',
    borderRadius: 0,
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
    backgroundColor: '#071321',
    border: '1px solid #2b4663',
    borderRadius: 0,
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
