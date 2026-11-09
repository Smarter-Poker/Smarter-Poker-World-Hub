/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  US REGIONAL LIVE POKER MARKET GUIDES DIRECTORY (/poker-rooms/guides)
 * ═══════════════════════════════════════════════════════════════════════════════
 * Index hub for the 12 largest US live cash game and tournament poker markets.
 *
 * House style: Title Case, zero em dashes, #SmarterCasinoRealism theme.
 */

import React from 'react';
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
} from '../../../src/content/guides/markets.js';

const DIRECTORY_FAQS = [
  {
    q: 'Which US Cities Have The Largest Live Poker Markets?',
    a: 'Los Angeles Leads In Total Active Card Room Tables (550+ Across 12 Rooms), Followed By Las Vegas (280+ Tables Across 21 Strip And Local Casinos), South Florida (240+ Tables), And The Texas Membership Card Club Hubs Of Houston, Dallas-Fort Worth, And Austin.',
  },
  {
    q: 'How Do Live Poker Rake Models Differ Across US Regions?',
    a: 'Las Vegas Strip Rooms Charge 10% Up To $5 - $6 With Zero Promo Drop; California Card Rooms Charge A Flat $6 - $7 Flop Drop; Texas Membership Clubs Charge $0 Pot Rake And $10 - $14/Hr Seat Time; And Florida/East Coast Casinos Typically Charge 10% Up To $5 - $7 Plus A $2 High-Hand Or Bad Beat Jackpot Drop.',
  },
  {
    q: 'Where Can I Check Live Poker Room Waitlists And Tournament Clocks Near Me?',
    a: 'Use The Smarter.Poker Live Directory At /hub/poker-near-me To Browse 324+ Verified US Poker Venues, Real-Time Cash Waitlists, And 4,500+ Weekly Tournament Schedules.',
  },
];

export default function PokerMarketGuidesIndexPage() {
  const canonicalPath = '/poker-rooms/guides';
  const canonicalUrl = `${SITE_URL}${canonicalPath}`;
  const pageTitle = 'US Regional Live Poker Market Guides: Rake, Stakes & Venues';
  const pageDesc =
    'Explore Comprehensive Strategy And Rake Guides For The Top 12 US Regional Live Poker Markets: Las Vegas, Los Angeles, South Florida, Houston, DFW, Austin, Tampa, Atlantic City, Philadelphia, Phoenix, Chicago, And New England.';

  const jsonLd = [
    {
      '@type': 'Article',
      '@id': `${canonicalUrl}#article`,
      headline: pageTitle,
      name: pageTitle,
      description: pageDesc,
      url: canonicalUrl,
      inLanguage: 'en-US',
      datePublished: MARKET_GUIDES_AS_OF,
      dateModified: MARKET_GUIDES_AS_OF,
      isAccessibleForFree: true,
      publisher: { '@id': ORGANIZATION_ID },
    },
    {
      '@type': 'FAQPage',
      '@id': `${canonicalUrl}#faq`,
      mainEntity: DIRECTORY_FAQS.map((f) => ({
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
        { '@type': 'ListItem', position: 1, name: 'Smarter.Poker', item: `${SITE_URL}/` },
        { '@type': 'ListItem', position: 2, name: 'Poker Near Me', item: `${SITE_URL}/hub/poker-near-me` },
        { '@type': 'ListItem', position: 3, name: 'US Regional Poker Market Guides', item: canonicalUrl },
      ],
    },
  ];

  return (
    <div style={{ minHeight: '100vh', background: '#020608', color: '#e2e8f0', fontFamily: 'Inter, system-ui, sans-serif' }}>
      <SEOHead
        title={pageTitle}
        description={pageDesc}
        canonical={canonicalPath}
        jsonLd={jsonLd}
      />

      <UniversalHeader />

      <main style={{ maxWidth: 1120, margin: '0 auto', padding: '36px 20px 80px' }}>
        <nav aria-label="Breadcrumb" style={{ fontSize: 13, color: '#94a3b8', marginBottom: 18 }}>
          <Link href="/" style={{ color: '#25c8ff', textDecoration: 'none' }}>Smarter.Poker</Link>
          {' / '}
          <Link href="/hub/poker-near-me" style={{ color: '#25c8ff', textDecoration: 'none' }}>Poker Near Me</Link>
          {' / '}
          <span>US Regional Poker Market Guides</span>
        </nav>

        <div style={{ fontSize: 12, fontWeight: 700, color: '#f2b84b', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
          Verified Regional Market Intelligence · Updated {MARKET_GUIDES_AS_OF}
        </div>

        <h1 style={{ fontSize: 34, fontWeight: 800, color: '#f8fafc', margin: '0 0 14px 0', lineHeight: 1.2 }}>
          Top 12 US Regional Live Poker Market Strategy &amp; Rake Guides
        </h1>

        <p style={{ fontSize: 16, lineHeight: 1.65, color: '#cbd5e1', margin: '0 0 28px 0' }}>
          <strong>Direct Answer:</strong> Live Cash Game Strategy, Preflop Sizing, And Hourly Winrates Depend Heavily On Your Regional Rake And Buy-In Structure. Explore Our <strong>12 US Regional Live Poker Market Guides</strong> Below Comparing <strong>Las Vegas Strip Percentage Caps</strong>, <strong>Los Angeles Flat Flop Drops</strong>, <strong>Texas Time-Collection Membership Clubs</strong>, And <strong>Florida / East Coast Promotional Jackpot Hubs</strong>.
        </p>

        {/* Summary Comparison Table */}
        <section style={{ marginBottom: 40, overflowX: 'auto' }}>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: '#f8fafc', margin: '0 0 12px 0' }}>
            National Overview: Top 12 US Live Poker Markets At A Glance
          </h2>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14, background: '#101a20', borderRadius: '2px', border: '1px solid #1e293b' }}>
            <caption style={{ textAlign: 'left', fontWeight: 600, padding: '8px 0', color: '#94a3b8' }}>
              Active Room Estimates, Rake Models, Signature Stakes, And Peak Tournament Seasons Across 12 US Markets
            </caption>
            <thead>
              <tr style={{ borderBottom: '1px solid #1e293b', color: '#25c8ff', textAlign: 'left' }}>
                <th scope="col" style={{ padding: '10px 14px' }}>Regional Market</th>
                <th scope="col" style={{ padding: '10px 14px' }}>Active Capacity</th>
                <th scope="col" style={{ padding: '10px 14px' }}>House Rake / Time Model</th>
                <th scope="col" style={{ padding: '10px 14px' }}>Signature Cash Stakes</th>
              </tr>
            </thead>
            <tbody>
              {POKER_MARKET_GUIDES.map((market) => (
                <tr key={market.slug} style={{ borderBottom: '1px solid #1e293b' }}>
                  <td style={{ padding: '10px 14px', fontWeight: 700 }}>
                    <Link href={marketGuidePath(market.slug)} style={{ color: '#25c8ff', textDecoration: 'none' }}>
                      {market.regionName} ({market.stateCode})
                    </Link>
                  </td>
                  <td style={{ padding: '10px 14px', color: '#f2b84b', fontWeight: 700 }}>{market.activeRoomsEstimate}</td>
                  <td style={{ padding: '10px 14px', color: '#cbd5e1' }}>{market.typicalRakeModel}</td>
                  <td style={{ padding: '10px 14px', color: '#94a3b8' }}>{market.signatureStakes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        {/* Grid Of 12 Regional Market Cards */}
        <section style={{ marginBottom: 40 }}>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: '#f8fafc', margin: '0 0 16px 0' }}>
            Browse Individual Regional Market Strategy Guides
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 18 }}>
            {POKER_MARKET_GUIDES.map((market) => (
              <div
                key={market.slug}
                style={{
                  background: '#101a20',
                  border: '1px solid #1e293b',
                  borderRadius: '2px',
                  padding: 20,
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                }}
              >
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 8px', background: '#020608', color: '#f2b84b', border: '1px solid #334155', borderRadius: '2px' }}>
                      {market.stateCode} Market
                    </span>
                    <span style={{ fontSize: 12, color: '#94a3b8' }}>
                      {market.activeRoomsEstimate}
                    </span>
                  </div>
                  <h3 style={{ fontSize: 18, fontWeight: 700, color: '#f8fafc', margin: '0 0 8px 0' }}>
                    <Link href={marketGuidePath(market.slug)} style={{ color: '#f8fafc', textDecoration: 'none' }}>
                      {market.regionName}
                    </Link>
                  </h3>
                  <p style={{ fontSize: 14, color: '#cbd5e1', lineHeight: 1.55, margin: '0 0 12px 0' }}>
                    {market.summary}
                  </p>
                </div>
                <div>
                  <div style={{ fontSize: 12, color: '#25c8ff', background: '#020608', padding: '8px 10px', borderRadius: '2px', border: '1px solid #1e293b', marginBottom: 12 }}>
                    <strong>Rake Model:</strong> {market.typicalRakeModel}
                  </div>
                  <Link
                    href={marketGuidePath(market.slug)}
                    style={{
                      display: 'inline-block',
                      padding: '8px 14px',
                      background: '#25c8ff',
                      color: '#020608',
                      borderRadius: '2px',
                      fontSize: 13,
                      fontWeight: 700,
                      textDecoration: 'none',
                    }}
                  >
                    Read Regional Strategy Guide
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Cross-Links */}
        <section style={{ marginBottom: 32, padding: 20, background: '#101a20', borderRadius: '2px', border: '1px solid #1e293b' }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: '#f8fafc', margin: '0 0 12px 0' }}>
            Live Poker Room Finder &amp; Rake Economics Tools
          </h2>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            <Link href="/hub/poker-near-me" style={{ padding: '8px 14px', background: '#25c8ff', color: '#020608', borderRadius: '2px', textDecoration: 'none', fontSize: 13, fontWeight: 700 }}>
              Poker Near Me (324+ Live Venues)
            </Link>
            <Link href="/research/us-live-poker-room-rake-and-jackpot-benchmark" style={{ padding: '8px 14px', background: '#020608', color: '#f2b84b', border: '1px solid #334155', borderRadius: '2px', textDecoration: 'none', fontSize: 13, fontWeight: 700 }}>
              US Live Poker Room Rake Benchmark Study
            </Link>
            <Link href="/tools/rake-calculator" style={{ padding: '8px 14px', background: '#020608', color: '#e2e8f0', border: '1px solid #334155', borderRadius: '2px', textDecoration: 'none', fontSize: 13, fontWeight: 600 }}>
              Interactive Rake &amp; Time Calculator
            </Link>
            <Link href="/tools/poker-winrate-calculator" style={{ padding: '8px 14px', background: '#020608', color: '#e2e8f0', border: '1px solid #334155', borderRadius: '2px', textDecoration: 'none', fontSize: 13, fontWeight: 600 }}>
              Winrate &amp; BB/100 Calculator
            </Link>
          </div>
        </section>

        <CitationBacklinkBox
          title="Top 12 US Regional Live Poker Market Strategy & Rake Guides"
          canonicalUrl={canonicalUrl}
          badgeType="research"
          badgeLabel="US Regional Poker Directory"
          badgeValue="12 Major Live Poker Hubs"
          summary="Comprehensive Strategy, Rake Model, And Venue Benchmark Guides Across The 12 Largest US Live Poker Markets."
          slug="us-regional-poker-market-guides"
        />

        <AiPromptLauncher
          title="Top 12 US Regional Live Poker Market Strategy & Rake Guides"
          canonicalUrl={canonicalUrl}
          markdownUrl={`${canonicalUrl}.md`}
        />
      </main>
    </div>
  );
}
