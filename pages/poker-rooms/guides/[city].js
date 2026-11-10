/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  INDIVIDUAL US REGIONAL LIVE POKER MARKET GUIDE (/poker-rooms/guides/[city])
 * ═══════════════════════════════════════════════════════════════════════════════
 * Static regional market strategy guide page for each of the 12 major US live
 * poker markets.
 *
 * House style: Title Case, zero em dashes, #SmarterCasinoRealism theme.
 */

import React, { useState } from 'react';
import Link from 'next/link';
import SEOHead from '../../../src/components/seo/SEOHead';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import AiPromptLauncher from '../../../src/components/seo/AiPromptLauncher';
import CitationBacklinkBox from '../../../src/components/seo/CitationBacklinkBox';
import { SITE_URL, ORGANIZATION_ID } from '../../../src/lib/learn/learnSite.js';
import {
  MARKET_GUIDES_AS_OF,
  POKER_MARKET_GUIDES,
  marketGuidePath,
  getMarketGuideBySlug,
} from '../../../src/content/guides/markets.js';

export async function getStaticPaths() {
  return {
    paths: POKER_MARKET_GUIDES.map((g) => ({ params: { city: g.slug } })),
    fallback: 'blocking',
  };
}

export async function getStaticProps({ params }) {
  const guide = getMarketGuideBySlug(params?.city);
  if (!guide) return { notFound: true };
  return { props: { guide } };
}

export default function PokerMarketCityGuidePage({ guide }) {
  const [copiedMarketEmbed, setCopiedMarketEmbed] = useState('');
  const canonicalPath = marketGuidePath(guide.slug);
  const canonicalUrl = `${SITE_URL}${canonicalPath}`;
  const otherGuides = POKER_MARKET_GUIDES.filter((g) => g.slug !== guide.slug);
  const badgeSvgUrl = `${SITE_URL}/api/seo/badge?type=directory-listing&label=${encodeURIComponent(`Listed In ${guide.regionName} Directory`)}&value=${encodeURIComponent('Smarter.Poker Public Guide')}`;
  const venueBadgeHtml = `<a href="${canonicalUrl}" target="_blank" rel="noopener" title="${guide.h1}"><img src="${badgeSvgUrl}" alt="Publicly Listed In ${guide.regionName} Poker Room Directory On Smarter.Poker" height="28" style="border:0;height:28px;" /></a>`;
  const marketTableHtml = `<div style="padding:14px;background:#020608;border:1px solid #1e293b;border-radius:4px;color:#e2e8f0;font-family:Inter,system-ui,sans-serif;"><div style="font-size:14px;font-weight:700;color:#25c8ff;margin-bottom:8px;">${guide.regionName} Live Poker Room Benchmark (${guide.activeRoomsEstimate})</div><p style="margin:0 0 10px 0;font-size:12.5px;color:#cbd5e1;">Standard Rake Model: ${guide.typicalRakeModel} | Stakes: ${guide.signatureStakes}</p><a href="${canonicalUrl}" target="_blank" rel="noopener" style="font-size:12px;font-weight:700;color:#f2b84b;text-decoration:none;">View Full ${guide.regionName} Live Poker Directory &amp; Rake Guide At Smarter.Poker</a></div>`;

  const handleCopyMarketSnippet = async (key, text) => {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(text);
        setCopiedMarketEmbed(key);
        setTimeout(() => setCopiedMarketEmbed(''), 2200);
      }
      if (typeof fetch === 'function') {
        fetch(
          `/api/seo/referral-stats?event=record&category=widget_embeds&item=market-${encodeURIComponent(guide.slug)}&source=market-guide`,
          { method: 'POST', keepalive: true }
        ).catch(() => {});
      }
    } catch {
      // Ignore clipboard failure
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
      datePublished: MARKET_GUIDES_AS_OF,
      dateModified: MARKET_GUIDES_AS_OF,
      isAccessibleForFree: true,
      publisher: { '@id': ORGANIZATION_ID },
      speakable: {
        '@type': 'SpeakableSpecification',
        cssSelector: ['h1', '#quick-answer-summary'],
      },
    },
    {
      '@type': 'FAQPage',
      '@id': `${canonicalUrl}#faq`,
      mainEntity: guide.faqs.map((item) => ({
        '@type': 'Question',
        name: item.q,
        acceptedAnswer: {
          '@type': 'Answer',
          text: item.a,
        },
      })),
    },
    {
      '@type': 'BreadcrumbList',
      '@id': `${canonicalUrl}#breadcrumb`,
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Smarter.Poker', item: `${SITE_URL}/` },
        { '@type': 'ListItem', position: 2, name: 'Poker Near Me', item: `${SITE_URL}/hub/poker-near-me` },
        { '@type': 'ListItem', position: 3, name: 'US Regional Poker Market Guides', item: `${SITE_URL}/poker-rooms/guides` },
        { '@type': 'ListItem', position: 4, name: guide.regionName, item: canonicalUrl },
      ],
    },
  ];

  return (
    <div style={{ minHeight: '100vh', background: '#020608', color: '#e2e8f0', fontFamily: 'Inter, system-ui, sans-serif' }}>
      <SEOHead
        title={guide.title}
        description={guide.summary}
        canonical={canonicalPath}
        jsonLd={jsonLd}
      />

      <UniversalHeader />

      <main style={{ maxWidth: 1020, margin: '0 auto', padding: '36px 20px 80px' }}>
        <nav aria-label="Breadcrumb" style={{ fontSize: 13, color: '#94a3b8', marginBottom: 18 }}>
          <Link href="/" style={{ color: '#25c8ff', textDecoration: 'none' }}>Smarter.Poker</Link>
          {' / '}
          <Link href="/hub/poker-near-me" style={{ color: '#25c8ff', textDecoration: 'none' }}>Poker Near Me</Link>
          {' / '}
          <Link href="/poker-rooms/guides" style={{ color: '#25c8ff', textDecoration: 'none' }}>Regional Market Guides</Link>
          {' / '}
          <span>{guide.regionName}</span>
        </nav>

        <div style={{ fontSize: 12, fontWeight: 700, color: '#f2b84b', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
          {guide.stateCode} Regional Poker Intelligence · Verified {MARKET_GUIDES_AS_OF}
        </div>

        <h1 style={{ fontSize: 32, fontWeight: 800, color: '#f8fafc', margin: '0 0 14px 0', lineHeight: 1.2 }}>
          {guide.h1}
        </h1>

        <p id="quick-answer-summary" style={{ fontSize: 16, lineHeight: 1.65, color: '#cbd5e1', margin: '0 0 28px 0' }}>
          <strong>Direct Market Overview:</strong> {guide.summary}
        </p>

        {/* Regional Market KPI Grid */}
        <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 16, marginBottom: 32 }}>
          <div style={{ background: '#101a20', padding: 18, borderRadius: '2px', border: '1px solid #25c8ff' }}>
            <div style={{ fontSize: 12, color: '#94a3b8', textTransform: 'uppercase' }}>
              Active Room &amp; Table Footprint
            </div>
            <div style={{ fontSize: 18, fontWeight: 800, color: '#25c8ff', marginTop: 6 }}>
              {guide.activeRoomsEstimate}
            </div>
          </div>

          <div style={{ background: '#101a20', padding: 18, borderRadius: '2px', border: '1px solid #f2b84b' }}>
            <div style={{ fontSize: 12, color: '#94a3b8', textTransform: 'uppercase' }}>
              Standard House Rake / Time Model
            </div>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#f2b84b', marginTop: 6 }}>
              {guide.typicalRakeModel}
            </div>
          </div>

          <div style={{ background: '#101a20', padding: 18, borderRadius: '2px', border: '1px solid #1e293b' }}>
            <div style={{ fontSize: 12, color: '#94a3b8', textTransform: 'uppercase' }}>
              Signature Cash Game Stakes
            </div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#f8fafc', marginTop: 6 }}>
              {guide.signatureStakes}
            </div>
          </div>

          <div style={{ background: '#101a20', padding: 18, borderRadius: '2px', border: '1px solid #1e293b' }}>
            <div style={{ fontSize: 12, color: '#94a3b8', textTransform: 'uppercase' }}>
              Peak Season &amp; Flagship Series
            </div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#34d399', marginTop: 6 }}>
              {guide.peakSeasonAndSeries}
            </div>
          </div>
        </section>

        {/* Top Venue Highlights Table */}
        <section style={{ marginBottom: 34, overflowX: 'auto' }}>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: '#f8fafc', margin: '0 0 12px 0' }}>
            Flagship Poker Rooms &amp; Card Clubs In {guide.regionName}
          </h2>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14, background: '#101a20', borderRadius: '2px', border: '1px solid #1e293b' }}>
            <caption style={{ textAlign: 'left', fontWeight: 600, padding: '8px 0', color: '#94a3b8' }}>
              Anchor Venues, Table Counts, And Signature Cash And Tournament Offerings In {guide.regionName}
            </caption>
            <thead>
              <tr style={{ borderBottom: '1px solid #1e293b', color: '#25c8ff', textAlign: 'left' }}>
                <th scope="col" style={{ padding: '10px 14px' }}>Venue Name</th>
                <th scope="col" style={{ padding: '10px 14px' }}>Location</th>
                <th scope="col" style={{ padding: '10px 14px' }}>Poker Tables</th>
                <th scope="col" style={{ padding: '10px 14px' }}>Signature Action &amp; Series</th>
              </tr>
            </thead>
            <tbody>
              {guide.topVenueHighlights.map((venue) => (
                <tr key={venue.name} style={{ borderBottom: '1px solid #1e293b' }}>
                  <td style={{ padding: '10px 14px', fontWeight: 700, color: '#f8fafc' }}>{venue.name}</td>
                  <td style={{ padding: '10px 14px', color: '#cbd5e1' }}>{venue.city}</td>
                  <td style={{ padding: '10px 14px', color: '#f2b84b', fontWeight: 700 }}>{venue.tables}</td>
                  <td style={{ padding: '10px 14px', color: '#cbd5e1' }}>{venue.knownFor}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        {/* Venue Manager Badge & Regional Market Snapshot Embed */}
        <section
          aria-label="Venue Manager Badge And Regional Market Embed"
          style={{
            marginBottom: 34,
            padding: 20,
            background: '#101a20',
            borderRadius: '2px',
            border: '1px solid #25c8ff',
          }}
        >
          <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#f2b84b', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                For Cardroom Publishers &amp; Regional Poker Media
              </div>
              <h2 style={{ fontSize: 19, fontWeight: 700, color: '#f8fafc', margin: '4px 0 6px 0' }}>
                Embed {guide.regionName} Public Directory Listing Badge Or Market Snapshot
              </h2>
              <p style={{ fontSize: 13.5, color: '#cbd5e1', margin: 0 }}>
                Display The Smarter.Poker {guide.regionName} Public Directory Listing Badge Or Regional Rake &amp; Stakes Snapshot On Your Website Or Blog.
              </p>
              <p style={{ fontSize: 12, color: '#94a3b8', margin: '6px 0 0 0', lineHeight: 1.5 }}>
                Listing Status Distinction: This Self-Service Badge Indicates A Public Directory Listing Compiled From State Gaming Commission Records And Published Cardroom Schedules. It Does Not Represent An Owner-Claimed Club Commander Venue Or A Commercial Partnership With Smarter.Poker.
              </p>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              <button
                type="button"
                onClick={() => handleCopyMarketSnippet('badge', venueBadgeHtml)}
                style={{
                  padding: '8px 14px',
                  fontSize: 12,
                  fontWeight: 700,
                  background: copiedMarketEmbed === 'badge' ? '#10b981' : '#25c8ff',
                  color: '#020608',
                  border: 'none',
                  borderRadius: '2px',
                  cursor: 'pointer',
                }}
              >
                {copiedMarketEmbed === 'badge'
                  ? 'Copied Public Directory Badge'
                  : 'Copy Public Directory Listing Badge HTML'}
              </button>
              <button
                type="button"
                onClick={() => handleCopyMarketSnippet('snapshot', marketTableHtml)}
                style={{
                  padding: '8px 14px',
                  fontSize: 12,
                  fontWeight: 700,
                  background: copiedMarketEmbed === 'snapshot' ? '#10b981' : '#020608',
                  color: copiedMarketEmbed === 'snapshot' ? '#020608' : '#f2b84b',
                  border: '1px solid #f2b84b',
                  borderRadius: '2px',
                  cursor: 'pointer',
                }}
              >
                {copiedMarketEmbed === 'snapshot'
                  ? 'Copied Market Snapshot Widget'
                  : 'Copy Regional Market Snapshot HTML'}
              </button>
            </div>
          </div>
        </section>

        {/* Regional Tactical Adjustments */}
        <section style={{ marginBottom: 34, padding: 22, background: '#101a20', borderRadius: '2px', border: '1px solid #1e293b' }}>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: '#25c8ff', margin: '0 0 12px 0' }}>
            Winning Cash Game &amp; Bankroll Adjustments For {guide.regionName}
          </h2>
          <ul style={{ margin: 0, paddingLeft: 20, lineHeight: 1.8, color: '#cbd5e1', fontSize: 15 }}>
            {guide.playerStrategyTips.map((tip) => (
              <li key={tip} style={{ marginBottom: 8 }}>{tip}</li>
            ))}
          </ul>
        </section>

        {/* FAQs */}
        <section style={{ marginBottom: 34 }}>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: '#f8fafc', margin: '0 0 14px 0' }}>
            Frequently Asked Questions: {guide.regionName} Live Poker
          </h2>
          {guide.faqs.map((item) => (
            <div key={item.q} style={{ marginBottom: 16, padding: 18, background: '#101a20', borderRadius: '2px', border: '1px solid #1e293b' }}>
              <h3 style={{ fontSize: 17, fontWeight: 700, color: '#25c8ff', margin: '0 0 6px 0' }}>{item.q}</h3>
              <p style={{ fontSize: 15, lineHeight: 1.6, color: '#cbd5e1', margin: 0 }}>{item.a}</p>
            </div>
          ))}
        </section>

        {/* Cross-Links To Live Directory, Research & Rake Calculator */}
        <section style={{ marginBottom: 34, padding: 20, background: '#101a20', borderRadius: '2px', border: '1px solid #1e293b' }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: '#f8fafc', margin: '0 0 12px 0' }}>
            Verify Live Waitlists &amp; Compute Your {guide.regionName} Rake Impact
          </h2>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            <Link href="/hub/poker-near-me" style={{ padding: '8px 14px', background: '#25c8ff', color: '#020608', borderRadius: '2px', textDecoration: 'none', fontSize: 13, fontWeight: 700 }}>
              Find Live Poker Rooms Near Me
            </Link>
            <Link href="/tools/rake-calculator" style={{ padding: '8px 14px', background: '#020608', color: '#f2b84b', border: '1px solid #334155', borderRadius: '2px', textDecoration: 'none', fontSize: 13, fontWeight: 700 }}>
              Interactive Rake &amp; Time Calculator
            </Link>
            <Link href="/research/us-live-poker-room-rake-and-jackpot-benchmark" style={{ padding: '8px 14px', background: '#020608', color: '#e2e8f0', border: '1px solid #334155', borderRadius: '2px', textDecoration: 'none', fontSize: 13, fontWeight: 600 }}>
              US Live Poker Room Rake Study
            </Link>
            <Link href="/poker-rooms/guides" style={{ padding: '8px 14px', background: '#020608', color: '#e2e8f0', border: '1px solid #334155', borderRadius: '2px', textDecoration: 'none', fontSize: 13, fontWeight: 600 }}>
              All 12 US Regional Market Guides
            </Link>
          </div>
        </section>

        {/* Other Regional Guides */}
        <section style={{ marginBottom: 32 }}>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: '#f8fafc', margin: '0 0 12px 0' }}>
            Explore Other Major US Live Poker Markets
          </h2>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {otherGuides.map((other) => (
              <Link
                key={other.slug}
                href={marketGuidePath(other.slug)}
                style={{
                  padding: '6px 12px',
                  background: '#101a20',
                  border: '1px solid #1e293b',
                  borderRadius: '2px',
                  color: '#25c8ff',
                  fontSize: 13,
                  fontWeight: 600,
                  textDecoration: 'none',
                }}
              >
                {other.regionName} ({other.stateCode})
              </Link>
            ))}
          </div>
        </section>

        <CitationBacklinkBox
          title={guide.h1}
          canonicalUrl={canonicalUrl}
          badgeType="directory-listing"
          badgeLabel="Public Directory Guide"
          badgeValue={`${guide.regionName} (${guide.stateCode})`}
          summary={guide.summary}
          slug={`poker-market-guide-${guide.slug}`}
          doi="10.5281/zenodo.24115447"
        />

        <AiPromptLauncher
          title={guide.h1}
          canonicalUrl={canonicalUrl}
          markdownUrl={`${canonicalUrl}.md`}
        />
      </main>
    </div>
  );
}
