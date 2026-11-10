/* ═══════════════════════════════════════════════════════════════════════════
   /learn/hands/[hand] - INDIVIDUAL STARTING HAND STRATEGY GUIDE
   ═══════════════════════════════════════════════════════════════════════════
   Statically generated Article + FAQPage + BreadcrumbList +
   SpeakableSpecification page for each canonical Texas Hold'em starting hand.

   Structured data audit (2026-11-09): the FAQPage questions are rendered on
   the page through FaqSection from the same handFaqs() list the schema reads,
   the Article names the publishing organization as its author, dateModified
   never precedes datePublished, and the Quiz node is gone because the page
   hosts no quiz.

   House style: Title Case, no em dashes.
   ═══════════════════════════════════════════════════════════════════════════ */

import React, { useState } from 'react';
import Link from 'next/link';
import SEOHead, { schemas } from '../../../src/components/seo/SEOHead';
import AiPromptLauncher from '../../../src/components/seo/AiPromptLauncher';
import CitationBacklinkBox from '../../../src/components/seo/CitationBacklinkBox';
import FaqSection from '../../../src/components/seo/FaqSection';
import {
  SITE_URL,
  LEARN_URL,
  ORGANIZATION_ID,
  LEARN_MODIFIED,
} from '../../../src/lib/learn/learnSite.js';
import { STARTING_HANDS, HANDS_BASE_PATH, handPath, getStartingHand, getExpandedHandMatchups } from '../../../src/content/learn/hands.js';
import { HAND_MATCHUPS, matchupPath } from '../../../src/content/learn/matchups.js';

export async function getStaticPaths() {
  return {
    paths: STARTING_HANDS.map((h) => ({ params: { hand: h.slug } })),
    fallback: 'blocking',
  };
}

export async function getStaticProps({ params }) {
  const hand = getStartingHand(params?.hand);
  if (!hand) return { notFound: true };
  return { props: { hand } };
}

/** The day the starting hand encyclopedia was first published. */
export const HANDS_PUBLISHED = '2026-10-01';
/** A page cannot be modified before it was published. */
export const HANDS_MODIFIED = LEARN_MODIFIED > HANDS_PUBLISHED ? LEARN_MODIFIED : HANDS_PUBLISHED;

/** The questions a hand page answers; the FAQPage node and the visible FAQ section read the same list. */
export function handFaqs(hand) {
  return [
    {
      question: `What Is The Preflop Equity Of ${hand.name} (${hand.code})?`,
      answer: `${hand.name} (${hand.code}) Ranks ${hand.preflopRank} Out Of 169 Starting Hands With ${hand.vsRandomEquity} Preflop Equity Against A Random Hand Across ${hand.combinations} Deck Combinations (${hand.probability}).`,
    },
    {
      question: `How Should I Play ${hand.name} (${hand.code}) Facing A 3-Bet?`,
      answer: hand.vs3Bet,
    },
  ];
}

export function handJsonLd(hand) {
  const path = handPath(hand.slug);
  const url = `${SITE_URL}${path}`;
  const ogImageUrl = `${SITE_URL}/api/og/tool-card?tool=preflop&title=${encodeURIComponent(`${hand.name} (${hand.code})`)}`;
  return [
    schemas.organization,
    {
      '@type': 'Article',
      '@id': `${url}#article`,
      headline: `How To Play ${hand.name} (${hand.code}) In Texas Hold'em`,
      description: hand.summary,
      url,
      mainEntityOfPage: { '@type': 'WebPage', '@id': url },
      inLanguage: 'en-US',
      datePublished: HANDS_PUBLISHED,
      dateModified: HANDS_MODIFIED,
      isAccessibleForFree: true,
      author: { '@id': ORGANIZATION_ID },
      publisher: { '@id': ORGANIZATION_ID },
      image: {
        '@type': 'ImageObject',
        '@id': `${url}#primaryimage`,
        url: ogImageUrl,
        contentUrl: ogImageUrl,
        caption: `How To Play ${hand.name} (${hand.code}) - Smarter.Poker GTO Strategy`,
      },
      speakable: {
        '@type': 'SpeakableSpecification',
        cssSelector: ['h1', 'main p:first-of-type'],
      },
    },
    {
      '@type': 'FAQPage',
      '@id': `${url}#faq`,
      mainEntity: handFaqs(hand).map((item) => ({
        '@type': 'Question',
        name: item.question,
        acceptedAnswer: { '@type': 'Answer', text: item.answer },
      })),
    },
    {
      '@type': 'BreadcrumbList',
      '@id': `${url}#breadcrumb`,
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Smarter.Poker', item: `${SITE_URL}/` },
        { '@type': 'ListItem', position: 2, name: 'Poker Strategy Lessons', item: LEARN_URL },
        { '@type': 'ListItem', position: 3, name: 'Starting Hand Encyclopedia', item: `${SITE_URL}${HANDS_BASE_PATH}` },
        { '@type': 'ListItem', position: 4, name: `${hand.name} (${hand.code})`, item: url },
      ],
    },
  ];
}

export default function StartingHandDetailPage({ hand }) {
  const [copiedHandCard, setCopiedHandCard] = useState('');
  const path = handPath(hand.slug);
  const url = `${SITE_URL}${path}`;
  const directMatchups = HAND_MATCHUPS.filter(
    (m) =>
      m.handA === hand.code ||
      m.handB === hand.code ||
      m.slug.includes(hand.slug)
  );
  const featuredMatchups =
    directMatchups.length > 0 ? directMatchups : HAND_MATCHUPS.slice(0, 6);
  const cardSuitAssumptions = `52-Card Deck Full Enumeration; ${hand.combinations} Of 1,326 Total Two-Card Combinations (${hand.probability}); Zero Dead Cards; Heads-Up Equity Vs Uniform Random Hand`;
  const discordHandCard = `[Smarter.Poker Starting Hand Guide: ${hand.name} (${hand.code})] Rank: ${hand.preflopRank} | Combos: ${hand.combinations}/1,326 (${hand.probability}) | Equity Vs Random: ${hand.vsRandomEquity} | Assumptions: ${cardSuitAssumptions} | 100BB 6-Max Guide: ${url}`;
  const redditHandCard = `**${hand.name} (${hand.code}) - 100BB 6-Max GTO Fact Sheet**\n- **Preflop Rank:** ${hand.preflopRank}\n- **Combinations:** ${hand.combinations} Out Of 1,326 (${hand.probability})\n- **Heads-Up Equity Vs. Random Hand:** ${hand.vsRandomEquity}\n- **Card & Suit Assumptions:** ${cardSuitAssumptions}\n- **Facing 3-Bet:** ${hand.vs3Bet}\n- *Full Solver Guide & Matchups: [Smarter.Poker ${hand.code} Strategy](${url}) (DOI: https://doi.org/10.5281/zenodo.24115452)*`;

  const handleCopyHandCard = async (type, value) => {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(value);
        setCopiedHandCard(type);
        setTimeout(() => setCopiedHandCard(''), 2200);
      }
      if (typeof fetch === 'function') {
        fetch(
          `/api/seo/referral-stats?event=record&category=solved_spot_shares&item=hand-${encodeURIComponent(hand.slug)}&source=hand-card`,
          { method: 'POST', keepalive: true }
        ).catch(() => {});
      }
    } catch {
      // Ignore clipboard error
    }
  };

  return (
    <div style={{ minHeight: '100vh', background: '#070b14', color: '#e2e8f0', fontFamily: 'Inter, system-ui, sans-serif' }}>
      <SEOHead
        title={`How To Play ${hand.name} (${hand.code}): GTO Poker Strategy`}
        description={hand.summary}
        canonical={path}
        jsonLd={handJsonLd(hand)}
      />

      <main style={{ maxWidth: 880, margin: '0 auto', padding: '40px 20px 80px' }}>
        <nav aria-label="Breadcrumb" style={{ fontSize: 13, color: '#94a3b8', marginBottom: 18 }}>
          <Link href="/" style={{ color: '#38bdf8', textDecoration: 'none' }}>Smarter.Poker</Link>
          {' / '}
          <Link href="/learn" style={{ color: '#38bdf8', textDecoration: 'none' }}>Poker Strategy Lessons</Link>
          {' / '}
          <Link href="/learn/hands" style={{ color: '#38bdf8', textDecoration: 'none' }}>Starting Hand Encyclopedia</Link>
          {' / '}
          <span>{hand.name} ({hand.code})</span>
        </nav>

        <h1 style={{ fontSize: 32, fontWeight: 800, color: '#f8fafc', margin: '0 0 14px 0', lineHeight: 1.2 }}>
          How To Play {hand.name} ({hand.code}) In No-Limit Texas Hold&apos;Em
        </h1>

        <p style={{ fontSize: 17, lineHeight: 1.65, color: '#cbd5e1', margin: '0 0 26px 0' }}>
          {hand.summary}
        </p>

        <section style={{ marginBottom: 32, padding: 20, background: '#0f172a', borderRadius: 12, border: '1px solid #1e293b' }}>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: '#f8fafc', margin: '0 0 14px 0' }}>
            Combinatoric Fact Sheet For {hand.name} ({hand.code})
          </h2>
          <ul style={{ margin: 0, paddingLeft: 20, lineHeight: 1.8, color: '#cbd5e1' }}>
            <li><strong>Hand Notation:</strong> {hand.code} ({hand.nickname})</li>
            <li><strong>Category:</strong> {hand.category}</li>
            <li><strong>Combinations In 52-Card Deck:</strong> {hand.combinations} Out Of 1,326 ({hand.probability})</li>
            <li><strong>Preflop Rank:</strong> {hand.preflopRank}</li>
            <li><strong>Heads-Up Equity Vs. Random Hand:</strong> {hand.vsRandomEquity}</li>
          </ul>
          <div
            style={{
              marginTop: 14,
              paddingTop: 12,
              borderTop: '1px solid #1e293b',
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 8,
            }}
          >
            <span style={{ fontSize: 12, fontWeight: 700, color: '#94a3b8' }}>
              Share {hand.code} Preflop Equity &amp; GTO Fact Card:
            </span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              <button
                type="button"
                onClick={() => handleCopyHandCard('discord', discordHandCard)}
                style={{
                  padding: '6px 12px',
                  fontSize: 12,
                  fontWeight: 700,
                  background: copiedHandCard === 'discord' ? '#10b981' : '#38bdf8',
                  color: '#04131d',
                  border: 'none',
                  borderRadius: 6,
                  cursor: 'pointer',
                }}
              >
                {copiedHandCard === 'discord'
                  ? 'Copied Discord / Chat Card'
                  : 'Copy Discord / Group-Chat Summary'}
              </button>
              <button
                type="button"
                onClick={() => handleCopyHandCard('reddit', redditHandCard)}
                style={{
                  padding: '6px 12px',
                  fontSize: 12,
                  fontWeight: 700,
                  background: copiedHandCard === 'reddit' ? '#10b981' : '#070b14',
                  color: copiedHandCard === 'reddit' ? '#04131d' : '#38bdf8',
                  border: '1px solid #38bdf8',
                  borderRadius: 6,
                  cursor: 'pointer',
                }}
              >
                {copiedHandCard === 'reddit'
                  ? 'Copied Forum / Reddit Card'
                  : 'Copy Forum / Reddit Markdown Card'}
              </button>
            </div>
          </div>
        </section>

        <section style={{ marginBottom: 32 }}>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: '#f8fafc', margin: '0 0 12px 0' }}>
            6-Max 100BB GTO Opening Strategy By Position
          </h2>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14, background: '#0f172a', borderRadius: 10 }}>
            <caption style={{ textAlign: 'left', fontWeight: 600, padding: '8px 0', color: '#94a3b8' }}>
              Solver Raise-First-In (RFI) Action By Seat For {hand.code}
            </caption>
            <thead>
              <tr style={{ borderBottom: '1px solid #1e293b', color: '#38bdf8', textAlign: 'left' }}>
                <th scope="col" style={{ padding: '10px 14px' }}>Table Position</th>
                <th scope="col" style={{ padding: '10px 14px' }}>100BB GTO Action</th>
                <th scope="col" style={{ padding: '10px 14px' }}>Positional Range Chart</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(hand.rfiByPosition).map(([pos, act]) => (
                <tr key={pos} style={{ borderBottom: '1px solid #1e293b' }}>
                  <td style={{ padding: '10px 14px', fontWeight: 700, color: '#f8fafc' }}>{pos}</td>
                  <td style={{ padding: '10px 14px', color: '#cbd5e1' }}>{act}</td>
                  <td style={{ padding: '10px 14px' }}>
                    <Link
                      href={`/tools/preflop-ranges/${pos.toLowerCase()}`}
                      style={{ color: '#38bdf8', textDecoration: 'none', fontWeight: 600 }}
                    >
                      View {pos} 13x13 GTO Chart
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section style={{ marginBottom: 32 }}>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: '#f8fafc', margin: '0 0 12px 0' }}>
            3-Bet Response And Postflop Execution Playbook
          </h2>
          <p style={{ fontSize: 15, lineHeight: 1.65, color: '#cbd5e1', margin: '0 0 12px 0' }}>
            <strong>Facing A 3-Bet:</strong> {hand.vs3Bet}
          </p>
          <p style={{ fontSize: 15, lineHeight: 1.65, color: '#cbd5e1', margin: 0 }}>
            <strong>Postflop Strategy:</strong> {hand.postflopPlaybook}
          </p>
        </section>

        <section style={{ marginBottom: 32 }}>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: '#f8fafc', margin: '0 0 12px 0' }}>
            Head-To-Head Preflop Equity Matchups
          </h2>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14, background: '#0f172a', borderRadius: 10 }}>
            <caption style={{ textAlign: 'left', fontWeight: 600, padding: '8px 0', color: '#94a3b8' }}>
              All-In Preflop Equity Benchmarks For {hand.code} Across Key Holdings
            </caption>
            <thead>
              <tr style={{ borderBottom: '1px solid #1e293b', color: '#38bdf8', textAlign: 'left' }}>
                <th scope="col" style={{ padding: '10px 14px' }}>Opposing Hand</th>
                <th scope="col" style={{ padding: '10px 14px' }}>{hand.code} Equity</th>
                <th scope="col" style={{ padding: '10px 14px' }}>Opponent Equity</th>
                <th scope="col" style={{ padding: '10px 14px' }}>Tie Frequency</th>
                <th scope="col" style={{ padding: '10px 14px' }}>Interactive Simulation</th>
              </tr>
            </thead>
            <tbody>
              {getExpandedHandMatchups(hand).map((m) => (
                <tr key={m.villain} style={{ borderBottom: '1px solid #1e293b' }}>
                  <td style={{ padding: '10px 14px', fontWeight: 600, color: '#f8fafc' }}>
                    {m.villainSlug ? (
                      <Link href={`/learn/hands/${m.villainSlug}`} style={{ color: '#f8fafc', textDecoration: 'none' }}>
                        {m.villain}
                      </Link>
                    ) : (
                      m.villain
                    )}
                  </td>
                  <td style={{ padding: '10px 14px', color: '#34d399', fontWeight: 700 }}>{m.heroEquity}</td>
                  <td style={{ padding: '10px 14px', color: '#cbd5e1' }}>{m.villainEquity}</td>
                  <td style={{ padding: '10px 14px', color: '#94a3b8' }}>{m.tie}</td>
                  <td style={{ padding: '10px 14px' }}>
                    <Link
                      href={`/tools/poker-odds-calculator?hand1=${encodeURIComponent(hand.code)}&hand2=${encodeURIComponent(m.villainCode)}`}
                      style={{ color: '#38bdf8', textDecoration: 'none', fontWeight: 600 }}
                    >
                      Simulate {hand.code} Vs {m.villainCode}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section style={{ marginBottom: 32 }}>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: '#f8fafc', margin: '0 0 12px 0' }}>
            Head-To-Head Pre-Flop Matchups Featuring This Hand
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 }}>
            {featuredMatchups.map((m) => (
              <Link
                key={m.slug}
                href={matchupPath(m.slug)}
                style={{
                  padding: '12px 14px',
                  background: '#0f172a',
                  border: '1px solid #1e293b',
                  borderRadius: 8,
                  textDecoration: 'none',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 4,
                }}
              >
                <span style={{ fontSize: 13, fontWeight: 700, color: '#34d399' }}>
                  {m.handA} ({m.handAEquity.toFixed(1)}%) Vs {m.handB} ({m.handBEquity.toFixed(1)}%)
                </span>
                <span style={{ fontSize: 14, fontWeight: 700, color: '#38bdf8' }}>
                  {m.title}
                </span>
              </Link>
            ))}
          </div>
        </section>

        <section style={{ marginBottom: 32 }}>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: '#f8fafc', margin: '0 0 12px 0' }}>
            Practice {hand.name} On Smarter.Poker
          </h2>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
            <Link
              href={`/tools/poker-odds-calculator?hand1=${encodeURIComponent(hand.code)}`}
              style={{ padding: '10px 16px', background: '#0284c7', color: '#fff', borderRadius: 8, textDecoration: 'none', fontWeight: 600, fontSize: 14 }}
            >
              Simulate {hand.code} In Odds Calculator
            </Link>
            <Link
              href="/tools/preflop-ranges"
              style={{ padding: '10px 16px', background: '#1e293b', color: '#e2e8f0', borderRadius: 8, textDecoration: 'none', fontWeight: 600, fontSize: 14 }}
            >
              Open Full 13x13 GTO Range Matrix
            </Link>
            <Link
              href="/learn/hands"
              style={{ padding: '10px 16px', background: '#1e293b', color: '#e2e8f0', borderRadius: 8, textDecoration: 'none', fontWeight: 600, fontSize: 14 }}
            >
              Browse All {STARTING_HANDS.length} Starting Hands
            </Link>
            <Link
              href="/tools/pot-odds-calculator"
              style={{ padding: '10px 16px', background: '#1e293b', color: '#38bdf8', borderRadius: 8, textDecoration: 'none', fontWeight: 600, fontSize: 14 }}
            >
              Pot Odds &amp; MDF Calculator
            </Link>
          </div>
        </section>

        <FaqSection faqs={handFaqs(hand)} />

        <CitationBacklinkBox
          title={`How To Play ${hand.name} (${hand.code}) In Texas Hold'em`}
          canonicalUrl={url}
          badgeType="gto"
          badgeLabel="169 Starting Hand Guide"
          badgeValue={`${hand.code} GTO Chart`}
          summary={`${hand.summary} (${cardSuitAssumptions}).`}
          slug={`hand-${hand.slug}`}
          doi="10.5281/zenodo.24115452"
        />

        <AiPromptLauncher
          title={`How To Play ${hand.name} (${hand.code})`}
          canonicalUrl={url}
          markdownUrl={`${url}.md`}
        />
      </main>
    </div>
  );
}
