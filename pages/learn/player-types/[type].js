/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  INDIVIDUAL POKER PLAYER ARCHETYPE & EXPLOIT GUIDE (/learn/player-types/[type])
 * ═══════════════════════════════════════════════════════════════════════════════
 * Static detail page for each of the 8 canonical poker player archetypes with
 * HUD VPIP/PFR/3-Bet/WTSD diagnostics, core behavioral leaks, preflop and
 * postflop exploitative adjustments, bet-sizing exploits, and JSON-LD schemas.
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
  PLAYER_ARCHETYPES,
  PLAYER_TYPES_AS_OF,
  PLAYER_TYPES_BASE_PATH,
  PLAYER_TYPES_URL,
  findPlayerArchetype,
  playerTypePath,
} from '../../../src/content/learn/playerTypes';

export async function getStaticPaths() {
  return {
    paths: PLAYER_ARCHETYPES.map((p) => ({ params: { type: p.slug } })),
    fallback: 'blocking',
  };
}

export async function getStaticProps({ params }) {
  const archetype = findPlayerArchetype(params?.type);
  if (!archetype) return { notFound: true };

  return {
    props: {
      archetype,
      allArchetypes: PLAYER_ARCHETYPES.map((p) => ({
        slug: p.slug,
        code: p.code,
        name: p.name,
        category: p.category,
        vpipRange: p.vpipRange,
        pfrRange: p.pfrRange,
      })),
    },
  };
}

export default function PokerPlayerTypeDetailPage({ archetype, allArchetypes = [] }) {
  const [copiedCard, setCopiedCard] = useState('');
  const canonicalPath = playerTypePath(archetype.slug);
  const canonicalUrl = `https://smarter.poker${canonicalPath}`;

  const archetypeAssumptions = '100BB 6-Max & 9-Max Cash Game Population Frequencies; Deviation From 5% Capped Rake GTO Baseline';
  const discordFactSheet = `[Smarter.Poker Player Archetype Exploit Sheet: ${archetype.name} (${archetype.code})] VPIP: ${archetype.vpipRange} | PFR: ${archetype.pfrRange} | 3-Bet: ${archetype.threeBetRange} | WTSD: ${archetype.wtsdRange} | Assumptions: ${archetypeAssumptions} | Guide: ${canonicalUrl}`;
  const redditFactSheet = `**${archetype.name} (${archetype.code}) - Exploitative Counter-Strategy Fact Sheet**\n- **VPIP Range:** ${archetype.vpipRange}\n- **PFR Range:** ${archetype.pfrRange}\n- **3-Bet Frequency:** ${archetype.threeBetRange}\n- **Went To Showdown (WTSD):** ${archetype.wtsdRange}\n- **Model Assumptions:** ${archetypeAssumptions}\n- *Source: [Smarter.Poker ${archetype.name} Exploit Guide](${canonicalUrl})*`;

  const handleCopyFactSheet = async (type, text) => {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(text);
        setCopiedCard(type);
        setTimeout(() => setCopiedCard(''), 2200);
      }
      if (typeof fetch === 'function') {
        fetch(
          `/api/seo/referral-stats?event=record&category=solved_spot_shares&item=player-type-${encodeURIComponent(archetype.slug)}&source=${encodeURIComponent(type)}`,
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
      headline: archetype.h1,
      name: archetype.title,
      description: archetype.summary,
      url: canonicalUrl,
      inLanguage: 'en-US',
      datePublished: PLAYER_TYPES_AS_OF,
      dateModified: PLAYER_TYPES_AS_OF,
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
      mainEntity: (archetype.faqs || []).map((f) => ({
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
        { '@type': 'ListItem', position: 3, name: 'Poker Player Archetypes', item: PLAYER_TYPES_URL },
        { '@type': 'ListItem', position: 4, name: archetype.name, item: canonicalUrl },
      ],
    },
  ];

  return (
    <div style={styles.page}>
      <SEOHead
        title={archetype.title}
        description={archetype.summary}
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
          <Link href={PLAYER_TYPES_BASE_PATH} style={styles.crumbLink}>
            Poker Player Archetypes
          </Link>
          <span style={styles.crumbSep}>/</span>
          <span style={styles.crumbCurrent}>{archetype.name}</span>
        </nav>

        <header style={styles.heroPlate}>
          <div style={styles.badgeRow}>
            <span style={styles.cyanBadge}>{archetype.category}</span>
            <span style={styles.emeraldBadge}>CODE: {archetype.code}</span>
          </div>

          <h1 style={styles.h1}>{archetype.h1}</h1>

          <p style={styles.lead}>
            <strong>Direct Exploitative Summary:</strong> {archetype.summary}
          </p>

          <div style={styles.metricsGrid}>
            <div style={styles.metricCard}>
              <div style={styles.metricLabel}>VPIP (Voluntarily In Pot)</div>
              <div style={styles.metricValueCyan}>{archetype.vpipRange}</div>
            </div>
            <div style={styles.metricCard}>
              <div style={styles.metricLabel}>PFR (Preflop Raise %)</div>
              <div style={styles.metricValueEmerald}>{archetype.pfrRange}</div>
            </div>
            <div style={styles.metricCard}>
              <div style={styles.metricLabel}>3-Bet Frequency</div>
              <div style={styles.metricValueCyan}>{archetype.threeBetRange}</div>
            </div>
            <div style={styles.metricCard}>
              <div style={styles.metricLabel}>Went To Showdown (WTSD)</div>
              <div style={styles.metricValueEmerald}>{archetype.wtsdRange}</div>
            </div>
          </div>

          <div style={styles.quickCrossLinks}>
            <Link href="/tools/preflop-ranges" style={styles.crossBtnCyan}>
              Open 100BB 6-Max GTO Preflop Ranges
            </Link>
            <Link href="/tools/3bet-calculator" style={styles.crossBtnEmerald}>
              Test 3-Bet &amp; 4-Bet EV Calculator
            </Link>
            <Link href="/tools/board-texture-analyzer" style={styles.crossBtnOutline}>
              Launch Flop Board Texture Analyzer
            </Link>
            <Link href={PLAYER_TYPES_BASE_PATH} style={styles.crossBtnOutline}>
              All 8 Player Archetypes
            </Link>
            <button
              type="button"
              onClick={() => handleCopyFactSheet('discord', discordFactSheet)}
              style={{ ...styles.crossBtnOutline, cursor: 'pointer', color: '#25c8ff', borderColor: 'rgba(37, 200, 255, 0.45)' }}
            >
              {copiedCard === 'discord' ? 'Copied Discord Fact Sheet!' : 'Copy Discord Exploit Card'}
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

        {/* Core Behavioral Leaks */}
        <section aria-label="Core Behavioral And Frequency Leaks" style={styles.sectionPlate}>
          <h2 style={styles.h2}>
            Core Frequency Leaks &amp; Table Tells Of The {archetype.name}
          </h2>
          <ul style={styles.bulletList}>
            {(archetype.coreLeaks || []).map((leak) => (
              <li key={leak} style={styles.bulletItem}>
                {leak}
              </li>
            ))}
          </ul>
        </section>

        {/* Preflop & Postflop Counter-Playbook */}
        <section aria-label="Preflop And Postflop Exploitative Adjustments" style={styles.sectionPlate}>
          <h2 style={styles.h2}>
            Street-By-Street Counter-Strategy Against {archetype.code} Opponents
          </h2>
          <div style={styles.twoColGrid}>
            <div style={styles.colBox}>
              <div style={styles.tagCyan}>PREFLOP EXPLOIT PROTOCOL</div>
              <h3 style={styles.h3}>Preflop Isolation, 3-Bet &amp; Defense Adjustments</h3>
              <ul style={styles.bulletList}>
                {(archetype.preflopAdjustments || []).map((item) => (
                  <li key={item} style={styles.bulletItem}>
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            <div style={styles.colBox}>
              <div style={styles.tagEmerald}>POSTFLOP EXPLOIT PROTOCOL</div>
              <h3 style={styles.h3}>Flop, Turn &amp; River C-Bet And Bluff-Catching Rules</h3>
              <ul style={styles.bulletList}>
                {(archetype.postflopAdjustments || []).map((item) => (
                  <li key={item} style={styles.bulletItem}>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* Bet Sizing Exploits */}
        <section aria-label="Bet Sizing Exploits And Interactive Tools" style={styles.sectionPlate}>
          <h2 style={styles.h2}>
            Optimal Bet-Sizing Exploits Against {archetype.name}
          </h2>
          <p style={styles.bodyText}>{archetype.betSizingExploits}</p>

          <div style={{ marginTop: 18, display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            <Link href="/tools/preflop-ranges" style={styles.crossBtnCyan}>
              Compare Against 100BB GTO Preflop Ranges
            </Link>
            <Link href="/tools/3bet-calculator" style={styles.crossBtnEmerald}>
              Calculate 3-Bet Fold Equity Vs {archetype.code}
            </Link>
            <Link href="/tools/board-texture-analyzer" style={styles.crossBtnOutline}>
              Analyze Postflop C-Bet Sizing On Any Flop
            </Link>
          </div>
        </section>

        {/* Peer Archetypes */}
        <section aria-label="Compare Other Poker Player Archetypes" style={styles.sectionPlate}>
          <h2 style={styles.h2}>Compare All 8 Poker Player Archetypes</h2>
          <div style={styles.peerGrid}>
            {allArchetypes.map((p) => (
              <Link key={p.slug} href={playerTypePath(p.slug)} style={styles.peerCard}>
                <span style={styles.peerCode}>
                  {p.code} | {p.category}
                </span>
                <span style={styles.peerName}>{p.name}</span>
                <span style={styles.peerStats}>
                  VPIP: {p.vpipRange} | PFR: {p.pfrRange}
                </span>
              </Link>
            ))}
          </div>
        </section>

        {/* FAQs */}
        <section aria-label="Frequently Asked Questions" style={styles.sectionPlate}>
          <h2 style={styles.h2}>
            Frequently Asked Questions: Beating {archetype.name}
          </h2>
          <div style={styles.faqList}>
            {(archetype.faqs || []).map((item) => (
              <div key={item.q} style={styles.faqItem}>
                <h3 style={styles.faqQ}>{item.q}</h3>
                <p style={styles.faqA}>{item.a}</p>
              </div>
            ))}
          </div>
        </section>

        <CitationBacklinkBox
          title={archetype.h1}
          canonicalUrl={canonicalUrl}
          badgeType="gto"
          badgeLabel={archetype.category}
          badgeValue={`VPIP ${archetype.vpipRange}`}
          summary={archetype.summary}
          publishedYear="2026"
          slug={`player-type-${archetype.slug}`}
        />

        <AiPromptLauncher
          title={archetype.h1}
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
    background: 'linear-gradient(180deg, #0f172a 0%, #090e1a 100%)',
    border: '1px solid #1e293b',
    borderRadius: 12,
    padding: '28px 26px',
    marginBottom: 26,
  },
  badgeRow: { display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 14 },
  cyanBadge: {
    fontSize: 11,
    fontWeight: 800,
    letterSpacing: '0.06em',
    padding: '4px 10px',
    borderRadius: 6,
    background: 'rgba(56, 189, 248, 0.14)',
    color: '#38bdf8',
    border: '1px solid rgba(56, 189, 248, 0.35)',
  },
  emeraldBadge: {
    fontSize: 11,
    fontWeight: 800,
    letterSpacing: '0.06em',
    padding: '4px 10px',
    borderRadius: 6,
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
    gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
    gap: 12,
    marginBottom: 20,
  },
  metricCard: {
    background: '#070b14',
    border: '1px solid #1e293b',
    borderRadius: 10,
    padding: '14px 16px',
  },
  metricLabel: { fontSize: 12, color: '#94a3b8', fontWeight: 600, marginBottom: 6 },
  metricValueCyan: { fontSize: 18, fontWeight: 800, color: '#38bdf8' },
  metricValueEmerald: { fontSize: 18, fontWeight: 800, color: '#34d399' },
  quickCrossLinks: { display: 'flex', flexWrap: 'wrap', gap: 10 },
  crossBtnCyan: {
    padding: '9px 15px',
    borderRadius: 8,
    background: '#38bdf8',
    color: '#04131d',
    fontWeight: 700,
    fontSize: 13,
    textDecoration: 'none',
  },
  crossBtnEmerald: {
    padding: '9px 15px',
    borderRadius: 8,
    background: '#10b981',
    color: '#04131d',
    fontWeight: 700,
    fontSize: 13,
    textDecoration: 'none',
  },
  crossBtnOutline: {
    padding: '9px 15px',
    borderRadius: 8,
    background: '#0f172a',
    color: '#38bdf8',
    border: '1px solid #334155',
    fontWeight: 700,
    fontSize: 13,
    textDecoration: 'none',
  },
  sectionPlate: {
    background: '#0b1120',
    border: '1px solid #1e293b',
    borderRadius: 12,
    padding: '24px 22px',
    marginBottom: 26,
  },
  h2: { fontSize: 21, fontWeight: 800, color: '#f8fafc', margin: '0 0 14px 0' },
  h3: { fontSize: 17, fontWeight: 700, color: '#f8fafc', margin: '6px 0 12px 0' },
  bodyText: { fontSize: 15, lineHeight: 1.68, color: '#cbd5e1', margin: 0 },
  twoColGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(310px, 1fr))',
    gap: 18,
  },
  colBox: {
    background: '#0f172a',
    border: '1px solid #1e293b',
    borderRadius: 10,
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
    borderRadius: 10,
    background: '#0f172a',
    border: '1px solid #1e293b',
    textDecoration: 'none',
  },
  peerCode: { fontSize: 11, fontWeight: 800, color: '#38bdf8' },
  peerName: { fontSize: 14.5, fontWeight: 700, color: '#f8fafc' },
  peerStats: { fontSize: 12, color: '#94a3b8' },
  faqList: { display: 'grid', gap: 14 },
  faqItem: {
    background: '#0f172a',
    border: '1px solid #1e293b',
    borderRadius: 10,
    padding: '16px 18px',
  },
  faqQ: { fontSize: 16, fontWeight: 700, color: '#f8fafc', margin: '0 0 6px 0' },
  faqA: { fontSize: 14, lineHeight: 1.6, color: '#cbd5e1', margin: 0 },
};
