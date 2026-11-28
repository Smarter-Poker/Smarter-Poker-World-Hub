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
import SmarterConversionCta from '../../../src/components/seo/SmarterConversionCta';
import SmarterAccountUnlockGate from '../../../src/components/seo/SmarterAccountUnlockGate';
import { openQuickSignup } from '../../../src/components/seo/SmarterQuickSignupSheet';
import { capture } from '../../../src/lib/analytics';
import { firstThatFits, fitMetaDescription } from '../../../src/lib/seo/titleFit.js';
import {
  SITE_URL,
  LEARN_URL,
  ORGANIZATION_ID,
  LEARN_MODIFIED,
} from '../../../src/lib/learn/learnSite.js';
import { STARTING_HANDS, HANDS_BASE_PATH, handPath, getStartingHand, getExpandedHandMatchups } from '../../../src/content/learn/hands.js';
import { HAND_MATCHUPS, matchupPath } from '../../../src/content/learn/matchups.js';
import { RFI } from '../../../src/config/solverRanges';

const SIX_MAX_SEATS = [
  { id: 'UTG', label: 'Under The Gun (UTG)' },
  { id: 'MP', label: 'Middle Position (MP)' },
  { id: 'HJ', label: 'Hijack (HJ)' },
  { id: 'CO', label: 'Cutoff (CO)' },
  { id: 'BTN', label: 'Button (BTN)' },
  { id: 'SB', label: 'Small Blind (SB)' },
];

function getSeatOpenProfile(seatId, handCode) {
  const rawFreq = Number(RFI?.[seatId]?.[handCode]?.raise || 0);
  const openPct = Math.max(0, Math.min(100, Math.round(rawFreq * 100)));
  const foldPct = 100 - openPct;
  const statusLabel =
    openPct >= 99
      ? 'Pure Open 100%'
      : openPct > 0
        ? `Mixed ${openPct}%`
        : 'Fold 0%';
  const tone = openPct >= 99 ? 'pure' : openPct > 0 ? 'mixed' : 'fold';
  return { seatId, openPct, foldPct, statusLabel, tone };
}

export async function getStaticPaths() {
  return {
    paths: STARTING_HANDS.map((h) => ({ params: { hand: h.slug } })),
    fallback: 'blocking',
  };
}

export async function getStaticProps({ params }) {
  const hand = getStartingHand(params?.hand);
  if (!hand) return { notFound: true };
  if (params?.hand && params.hand !== hand.slug) {
    return {
      redirect: {
        destination: handPath(hand.slug),
        permanent: true,
      },
    };
  }
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

function evaluateBtnSpotCheck(hand, choice) {
  const btnAction = hand.rfiByPosition?.BTN || hand.positions?.BTN || '100% Open Raise';
  const normalized = btnAction.toLowerCase();
  const isPureRaise = normalized.includes('100%') && normalized.includes('open');
  const isPureFold = normalized.includes('0%') || normalized.includes('pure fold');
  const isMixedOpen = normalized.includes('45%');
  const isMixedSteal = normalized.includes('10%');

  if (isPureRaise) {
    const isCorrect = choice === 'Open Raise';
    return {
      isCorrect,
      btnAction,
      verdict: isCorrect ? 'Correct Solver Play' : 'Solver Prefers Open Raise',
      explanation: isCorrect
        ? `${hand.name} (${hand.code}) Is A Pure 100% Button Open Raise At 100BB 6-Max. Raising Captures Immediate Fold Equity And Builds Pots In Position.`
        : `At 100BB 6-Max, ${hand.code} Is A Pure ${btnAction} From The Button. Choosing ${choice} Surrenders Significant Preflop EV Against The Blinds.`,
    };
  }

  if (isPureFold) {
    const isCorrect = choice === 'Fold';
    return {
      isCorrect,
      btnAction,
      verdict: isCorrect ? 'Correct Solver Play' : 'Solver Prefers Pure Fold',
      explanation: isCorrect
        ? `${hand.name} (${hand.code}) Is A Pure Fold On The Button At 100BB 6-Max Because It Realizes Equity Poorly Against Aggressive Blind Defenses.`
        : `At 100BB 6-Max, ${hand.code} Is A ${btnAction} On The Button. Choosing ${choice} Loses EV Against Standard Small Blind And Big Blind 3-Bet Ranges.`,
    };
  }

  if (isMixedOpen) {
    const isCorrect = choice === 'Open Raise' || choice === 'Fold';
    return {
      isCorrect,
      btnAction,
      verdict:
        choice === 'Limp'
          ? 'Solver Never Open-Limps Here'
          : 'Valid Equilibrium Frequency',
      explanation:
        choice === 'Limp'
          ? `${hand.code} Plays As A ${btnAction} (45% Raise / 55% Fold, 0% Limp) On The Button At 100BB 6-Max. Open-Limping Caps Your Range And Invites Iso-Raises.`
          : `${hand.name} (${hand.code}) Is A Borderline Button Hand That Mixes ${btnAction} (45% Raise / 55% Fold) At Equilibrium, Making ${choice} A Solver-Approved Play.`,
    };
  }

  if (isMixedSteal) {
    const isCorrect = choice === 'Fold' || choice === 'Open Raise';
    return {
      isCorrect,
      btnAction,
      verdict:
        choice === 'Fold'
          ? 'Correct Primary Solver Play'
          : choice === 'Open Raise'
            ? 'Low-Frequency Solver Steal'
            : 'Solver Never Open-Limps Here',
      explanation:
        choice === 'Limp'
          ? `${hand.code} Plays As A ${btnAction} (90% Fold / 10% Open Raise, 0% Limp) On The Button At 100BB 6-Max. Never Open-Limp From The Button.`
          : `${hand.name} (${hand.code}) Plays As A ${btnAction} (90% Fold / 10% Open Raise) On The Button At 100BB. Fold As Default And Open Selectively Against Tight Blinds.`,
    };
  }

  const isCorrect = choice === 'Open Raise';
  return {
    isCorrect,
    btnAction,
    verdict: isCorrect ? 'Correct Solver Play' : 'Check Solver Frequency',
    explanation: `100BB 6-Max Button GTO Action For ${hand.name} (${hand.code}): ${btnAction}.`,
  };
}

export default function StartingHandDetailPage({ hand }) {
  const [copiedHandCard, setCopiedHandCard] = useState('');
  const [spotSelection, setSpotSelection] = useState(null);
  const [seatSelection, setSeatSelection] = useState(null);
  const activeSeat = seatSelection?.slug === hand.slug ? seatSelection.seat : 'BTN';
  const seatProfiles = SIX_MAX_SEATS.map((seat) => ({
    ...seat,
    ...getSeatOpenProfile(seat.id, hand.code),
  }));
  const activeSeatProfile =
    seatProfiles.find((seat) => seat.id === activeSeat) || seatProfiles[4];
  const openCombos = ((Number(hand.combinations || 0) * activeSeatProfile.openPct) / 100).toFixed(1);
  const shareableHandCardUrl = `${SITE_URL}/api/og/tool-card?tool=preflop&title=${encodeURIComponent(
    `${hand.name} (${hand.code}) - ${activeSeatProfile.id} ${activeSeatProfile.statusLabel}`
  )}&subtitle=${encodeURIComponent(
    `100BB 6-Max Open ${activeSeatProfile.openPct}% (${openCombos}/${hand.combinations} Combos) | Equity Vs Random ${hand.vsRandomEquity}`
  )}`;
  const activeChoice = spotSelection?.slug === hand.slug ? spotSelection.choice : null;
  const spotResult = activeChoice ? evaluateBtnSpotCheck(hand, activeChoice) : null;
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

  const metaTitle = firstThatFits([
    `How To Play ${hand.name} (${hand.code}) GTO Guide`,
    `How To Play ${hand.code}: GTO Poker Strategy`,
    `${hand.name} (${hand.code}) GTO Guide`,
  ]);
  const metaDescription = fitMetaDescription(hand.summary, 158);

  return (
    <div style={{ minHeight: '100vh', background: '#071321', color: '#f2f7ff', fontFamily: 'Inter, system-ui, sans-serif' }}>
      <SEOHead
        title={metaTitle}
        description={metaDescription}
        canonical={path}
        jsonLd={handJsonLd(hand)}
      />

      <main style={{ maxWidth: 880, margin: '0 auto', padding: '40px 20px 80px' }}>
        <nav aria-label="Breadcrumb" style={{ fontSize: 13, color: '#bdd0e2', marginBottom: 18 }}>
          <Link href="/" style={{ color: '#86daff', textDecoration: 'none' }}>Smarter.Poker</Link>
          {' / '}
          <Link href="/learn" style={{ color: '#86daff', textDecoration: 'none' }}>Poker Strategy Lessons</Link>
          {' / '}
          <Link href="/learn/hands" style={{ color: '#86daff', textDecoration: 'none' }}>Starting Hand Encyclopedia</Link>
          {' / '}
          <span>{hand.name} ({hand.code})</span>
        </nav>

        <h1 style={{ fontSize: 32, fontWeight: 800, color: '#f2f7ff', margin: '0 0 14px 0', lineHeight: 1.2 }}>
          How To Play {hand.name} ({hand.code}) In No-Limit Texas Hold&apos;Em
        </h1>

        <p style={{ fontSize: 17, lineHeight: 1.65, color: '#bdd0e2', margin: '0 0 26px 0' }}>
          {hand.summary}
        </p>

        <section
          aria-label="6-Max 100BB Position Action Bar"
          data-testid="hand-position-action-bar"
          style={{
            marginBottom: 28,
            padding: 20,
            background: 'linear-gradient(180deg, #081121 0%, #060d1a 100%)',
            borderRadius: 0,
            border: '1px solid #38bdf8',
          }}
        >
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 10,
              marginBottom: 12,
            }}
          >
            <div>
              <div style={{ fontSize: 11.5, fontWeight: 800, color: '#86daff', letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: 4 }}>
                6-Max 100BB Position Action Bar · {hand.code}
              </div>
              <h2 style={{ fontSize: 19, fontWeight: 800, color: '#f2f7ff', margin: 0 }}>
                {hand.code} Solver Open Frequency Across Every Table Seat
              </h2>
            </div>
            <button
              type="button"
              data-testid="copy-shareable-hand-card-btn"
              onClick={() => handleCopyHandCard('shareable-og', shareableHandCardUrl)}
              style={{
                minHeight: 44,
                padding: '8px 14px',
                borderRadius: 0,
                border: '1px solid #38bdf8',
                background: copiedHandCard === 'shareable-og' ? '#047857' : '#1d4ed8',
                color: '#f2f7ff',
                fontSize: 12.5,
                fontWeight: 800,
                cursor: 'pointer',
              }}
            >
              {copiedHandCard === 'shareable-og'
                ? 'Copied Shareable Hand Card'
                : 'Copy Shareable Hand Card'}
            </button>
          </div>

          <div
            role="tablist"
            aria-label={`Select 6-Max Seat For ${hand.code}`}
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
              gap: 8,
              marginBottom: 14,
            }}
          >
            {seatProfiles.map((seat) => {
              const isSelected = seat.id === activeSeatProfile.id;
              const badgeColor =
                seat.tone === 'pure'
                  ? '#34d399'
                  : seat.tone === 'mixed'
                    ? '#38bdf8'
                    : '#94a3b8';
              return (
                <button
                  key={seat.id}
                  type="button"
                  role="tab"
                  aria-selected={isSelected}
                  data-testid={`hand-seat-btn-${seat.id.toLowerCase()}`}
                  onClick={() => setSeatSelection({ slug: hand.slug, seat: seat.id })}
                  style={{
                    minHeight: 58,
                    padding: '10px 10px',
                    borderRadius: 0,
                    border: isSelected ? '1px solid #38bdf8' : '1px solid #2b4663',
                    background: isSelected
                      ? 'linear-gradient(180deg, #1d4ed8 0%, #10328c 100%)'
                      : '#0a1a2b',
                    color: '#f2f7ff',
                    textAlign: 'left',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    gap: 4,
                  }}
                >
                  <span style={{ fontSize: 13, fontWeight: 800, letterSpacing: '0.04em' }}>
                    {seat.id}
                  </span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: isSelected ? '#f2f7ff' : badgeColor }}>
                    {seat.statusLabel}
                  </span>
                </button>
              );
            })}
          </div>

          <div
            role="tabpanel"
            data-testid="hand-seat-inspector"
            style={{
              padding: 14,
              borderRadius: 0,
              border: '1px solid #2b4663',
              background: '#0a1a2b',
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
            }}
          >
            <div>
              <div style={{ fontSize: 14, fontWeight: 800, color: '#f2f7ff', marginBottom: 4 }}>
                {activeSeatProfile.label}: {activeSeatProfile.statusLabel}
              </div>
              <div style={{ fontSize: 13, color: '#bdd0e2', lineHeight: 1.5 }}>
                Raise First In: <strong style={{ color: '#38bdf8' }}>{activeSeatProfile.openPct}%</strong> ({openCombos} Of {hand.combinations} Deck Combos) · Fold: <strong>{activeSeatProfile.foldPct}%</strong>
              </div>
            </div>
            <Link
              href={`/tools/preflop-ranges/${activeSeatProfile.id.toLowerCase()}`}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                minHeight: 44,
                padding: '8px 14px',
                borderRadius: 0,
                border: '1px solid #2b4663',
                background: '#071321',
                color: '#86daff',
                fontSize: 12.5,
                fontWeight: 700,
                textDecoration: 'none',
              }}
            >
              Inspect {activeSeatProfile.id} Full 13x13 Chart
            </Link>
          </div>
        </section>

        <section
          aria-label="Interactive Solver And Equity Quick-Launch"
          style={{
            marginBottom: 28,
            padding: 20,
            background: 'linear-gradient(180deg, #0d1f33 0%, #071321 100%)',
            borderRadius: 0,
            border: '1px solid #2b4663',
          }}
        >
          <div style={{ fontSize: 11.5, fontWeight: 800, color: '#86daff', letterSpacing: '0.06em', marginBottom: 6 }}>
            Interactive Solver &amp; Equity Quick-Launch For {hand.code}
          </div>
          <h2 style={{ fontSize: 19, fontWeight: 800, color: '#f2f7ff', margin: '0 0 12px 0' }}>
            Test {hand.name} ({hand.code}) In Smarter.Poker Live Solvers &amp; Calculators
          </h2>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            <Link
              href={`/tools/poker-odds-calculator?hand1=${encodeURIComponent(hand.code)}`}
              rel="nofollow"
              prefetch={false}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                minHeight: 44,
                padding: '10px 16px',
                borderRadius: 0,
                background: '#0284c7',
                border: '1px solid #38bdf8',
                color: '#f2f7ff',
                fontWeight: 700,
                fontSize: 13,
                textDecoration: 'none',
              }}
            >
              Test {hand.code} Live Equity In Odds Calculator
            </Link>
            <Link
              href="/tools/preflop-ranges"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                minHeight: 44,
                padding: '10px 16px',
                borderRadius: 0,
                background: '#0a1a2b',
                color: '#86daff',
                border: '1px solid #2b4663',
                fontWeight: 700,
                fontSize: 13,
                textDecoration: 'none',
              }}
            >
              View 100BB 6-Max GTO Matrix
            </Link>
            <Link
              href="/tools/board-texture-analyzer"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                minHeight: 44,
                padding: '10px 16px',
                borderRadius: 0,
                background: '#0a1a2b',
                color: '#f2f7ff',
                border: '1px solid #2b4663',
                fontWeight: 700,
                fontSize: 13,
                textDecoration: 'none',
              }}
            >
              Analyze C-Bet Strategy On Any Flop
            </Link>
            <Link
              href="/learn/positions"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                minHeight: 44,
                padding: '10px 16px',
                borderRadius: 0,
                background: '#0a1a2b',
                color: '#f2f7ff',
                border: '1px solid #2b4663',
                fontWeight: 700,
                fontSize: 13,
                textDecoration: 'none',
              }}
            >
              Compare Positional Winrates
            </Link>
          </div>
        </section>

        <section style={{ marginBottom: 32, padding: 20, background: '#0a1a2b', borderRadius: 0, border: '1px solid #2b4663' }}>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: '#f2f7ff', margin: '0 0 14px 0' }}>
            Combinatoric Fact Sheet For {hand.name} ({hand.code})
          </h2>
          <ul style={{ margin: 0, paddingLeft: 20, lineHeight: 1.8, color: '#bdd0e2' }}>
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
              borderTop: '1px solid #2b4663',
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 8,
            }}
          >
            <span style={{ fontSize: 12, fontWeight: 700, color: '#bdd0e2' }}>
              Share {hand.code} Preflop Equity &amp; GTO Fact Card:
            </span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              <button
                type="button"
                onClick={() => handleCopyHandCard('discord', discordHandCard)}
                style={{
                  minHeight: 44,
                  padding: '8px 14px',
                  fontSize: 12.5,
                  fontWeight: 700,
                  background: copiedHandCard === 'discord' ? '#047857' : '#0284c7',
                  color: '#f2f7ff',
                  border: '1px solid #2b4663',
                  borderRadius: 0,
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
                  minHeight: 44,
                  padding: '8px 14px',
                  fontSize: 12.5,
                  fontWeight: 700,
                  background: copiedHandCard === 'reddit' ? '#047857' : '#071321',
                  color: copiedHandCard === 'reddit' ? '#f2f7ff' : '#86daff',
                  border: '1px solid #2b4663',
                  borderRadius: 0,
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
          <h2 style={{ fontSize: 22, fontWeight: 700, color: '#f2f7ff', margin: '0 0 12px 0' }}>
            6-Max 100BB GTO Opening Strategy By Position
          </h2>
          <div style={{ overflowX: 'auto', maxWidth: '100%', WebkitOverflowScrolling: 'touch' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14, background: '#0a1a2b', border: '1px solid #2b4663', borderRadius: 0 }}>
            <caption style={{ textAlign: 'left', fontWeight: 600, padding: '8px 0', color: '#bdd0e2' }}>
              Solver Raise-First-In (RFI) Action By Seat For {hand.code}
            </caption>
            <thead>
              <tr style={{ borderBottom: '1px solid #2b4663', background: '#0d1f33', color: '#86daff', textAlign: 'left' }}>
                <th scope="col" style={{ padding: '10px 14px' }}>Table Position</th>
                <th scope="col" style={{ padding: '10px 14px' }}>100BB GTO Action</th>
                <th scope="col" style={{ padding: '10px 14px' }}>Positional Range Chart</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(hand.rfiByPosition).map(([pos, act]) => (
                <tr key={pos} style={{ borderBottom: '1px solid #2b4663' }}>
                  <td style={{ padding: '10px 14px', fontWeight: 700, color: '#f2f7ff' }}>{pos}</td>
                  <td style={{ padding: '10px 14px', color: '#bdd0e2' }}>{act}</td>
                  <td style={{ padding: '10px 14px' }}>
                    <Link
                      href={`/tools/preflop-ranges/${pos.toLowerCase()}`}
                      style={{ color: '#86daff', textDecoration: 'none', fontWeight: 600 }}
                    >
                      View {pos} 13x13 GTO Chart
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </section>

        <section style={{ marginBottom: 32 }}>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: '#f2f7ff', margin: '0 0 12px 0' }}>
            3-Bet Response And Postflop Execution Playbook
          </h2>
          <p style={{ fontSize: 15, lineHeight: 1.65, color: '#bdd0e2', margin: '0 0 12px 0' }}>
            <strong>Facing A 3-Bet:</strong> {hand.vs3Bet}
          </p>
          <p style={{ fontSize: 15, lineHeight: 1.65, color: '#bdd0e2', margin: 0 }}>
            <strong>Postflop Strategy:</strong> {hand.postflopPlaybook}
          </p>
        </section>

        <section style={{ marginBottom: 32 }}>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: '#f2f7ff', margin: '0 0 12px 0' }}>
            Head-To-Head Preflop Equity Matchups
          </h2>
          <div style={{ overflowX: 'auto', maxWidth: '100%', WebkitOverflowScrolling: 'touch' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14, background: '#0a1a2b', border: '1px solid #2b4663', borderRadius: 0 }}>
            <caption style={{ textAlign: 'left', fontWeight: 600, padding: '8px 0', color: '#bdd0e2' }}>
              All-In Preflop Equity Benchmarks For {hand.code} Across Key Holdings
            </caption>
            <thead>
              <tr style={{ borderBottom: '1px solid #2b4663', background: '#0d1f33', color: '#86daff', textAlign: 'left' }}>
                <th scope="col" style={{ padding: '10px 14px' }}>Opposing Hand</th>
                <th scope="col" style={{ padding: '10px 14px' }}>{hand.code} Equity</th>
                <th scope="col" style={{ padding: '10px 14px' }}>Opponent Equity</th>
                <th scope="col" style={{ padding: '10px 14px' }}>Tie Frequency</th>
                <th scope="col" style={{ padding: '10px 14px' }}>Interactive Simulation</th>
              </tr>
            </thead>
            <tbody>
              {getExpandedHandMatchups(hand).map((m) => (
                <tr key={m.villain} style={{ borderBottom: '1px solid #2b4663' }}>
                  <td style={{ padding: '10px 14px', fontWeight: 600, color: '#f2f7ff' }}>
                    {m.villainSlug ? (
                      <Link href={`/learn/hands/${m.villainSlug}`} style={{ color: '#f2f7ff', textDecoration: 'none' }}>
                        {m.villain}
                      </Link>
                    ) : (
                      m.villain
                    )}
                  </td>
                  <td style={{ padding: '10px 14px', color: '#34d399', fontWeight: 700 }}>{m.heroEquity}</td>
                  <td style={{ padding: '10px 14px', color: '#bdd0e2' }}>{m.villainEquity}</td>
                  <td style={{ padding: '10px 14px', color: '#bdd0e2' }}>{m.tie}</td>
                  <td style={{ padding: '10px 14px' }}>
                    <Link
                      href={`/tools/poker-odds-calculator?hand1=${encodeURIComponent(hand.code)}&hand2=${encodeURIComponent(m.villainCode)}`}
                      rel="nofollow"
                      prefetch={false}
                      style={{ color: '#86daff', textDecoration: 'none', fontWeight: 600 }}
                    >
                      Simulate {hand.code} Vs {m.villainCode}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </section>

        <section style={{ marginBottom: 32 }}>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: '#f2f7ff', margin: '0 0 12px 0' }}>
            Head-To-Head Pre-Flop Matchups Featuring This Hand
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 }}>
            {featuredMatchups.map((m) => (
              <Link
                key={m.slug}
                href={matchupPath(m.slug)}
                style={{
                  padding: '12px 14px',
                  background: '#0a1a2b',
                  border: '1px solid #2b4663',
                  borderRadius: 0,
                  textDecoration: 'none',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 4,
                }}
              >
                <span style={{ fontSize: 13, fontWeight: 700, color: '#34d399' }}>
                  {m.handA} ({m.handAEquity.toFixed(1)}%) Vs {m.handB} ({m.handBEquity.toFixed(1)}%)
                </span>
                <span style={{ fontSize: 14, fontWeight: 700, color: '#86daff' }}>
                  {m.title}
                </span>
              </Link>
            ))}
          </div>
        </section>

        <section
          aria-label="Quick GTO Preflop Spot Check"
          style={{
            marginBottom: 32,
            padding: 22,
            background: 'linear-gradient(180deg, #0d1f33 0%, #071321 100%)',
            border: '1px solid #2b4663',
            borderRadius: 0,
          }}
        >
          <div style={{ fontSize: 11.5, fontWeight: 800, color: '#86daff', letterSpacing: '0.06em', marginBottom: 6 }}>
            GTO Preflop Spot Check · 6-Max 100BB
          </div>
          <h2 style={{ fontSize: 20, fontWeight: 800, color: '#f2f7ff', margin: '0 0 14px 0', lineHeight: 1.35 }}>
            Quick GTO Spot Check: You Are Dealt {hand.code} On The Button At 100BB (Folded To You). What Is The Solver Play?
          </h2>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            {['Open Raise', 'Limp', 'Fold'].map((option) => {
              const isSelected = activeChoice === option;
              return (
                <button
                  key={option}
                  type="button"
                  aria-pressed={isSelected}
                  onClick={() => {
                    setSpotSelection({ slug: hand.slug, choice: option });
                    try {
                      capture('seo_gto_spot_check_answered', { hand: hand.code, slug: hand.slug, choice: option });
                      if (typeof window !== 'undefined') {
                        window.dispatchEvent(new CustomEvent('sp:seo-tool-engaged', { detail: { hand: hand.code } }));
                      }
                    } catch (_) {
                      /* non-blocking */
                    }
                  }}
                  style={{
                    minHeight: 44,
                    minWidth: 128,
                    padding: '10px 18px',
                    borderRadius: 0,
                    background: isSelected ? '#1d4ed8' : '#0a1a2b',
                    color: '#f2f7ff',
                    border: isSelected
                      ? '1px solid #38bdf8'
                      : '1px solid #2b4663',
                    fontSize: 14,
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  {option}
                </button>
              );
            })}
          </div>

          {spotResult && (
            <div
              role="status"
              aria-live="polite"
              style={{
                marginTop: 16,
                padding: 16,
                background: '#071321',
                borderRadius: 0,
                border: `1px solid ${spotResult.isCorrect ? 'rgba(52, 211, 153, 0.45)' : 'rgba(248, 113, 113, 0.45)'}`,
              }}
            >
              <div
                style={{
                  fontSize: 14,
                  fontWeight: 800,
                  color: spotResult.isCorrect ? '#34d399' : '#f87171',
                  marginBottom: 6,
                }}
              >
                {spotResult.verdict} · Exact Button Frequency: {spotResult.btnAction}
              </div>
              <p style={{ fontSize: 14, lineHeight: 1.6, color: '#bdd0e2', margin: '0 0 14px 0' }}>
                {spotResult.explanation}
              </p>
              <a
                href={`/auth/signup?redirect=/hub/training&unlock=hand-${encodeURIComponent(hand.slug)}&src=hand-${encodeURIComponent(hand.slug)}`}
                data-testid="hand-spot-check-signup-cta"
                onClick={(e) => {
                  if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
                  e.preventDefault();
                  openQuickSignup({
                    unlockKey: `hand-${hand.slug}`,
                    eyebrow: `Free GTO Hand Drill · ${hand.code}`,
                    title: `Drill ${hand.code} & Unlock All 169 Solver Matrices Free`,
                    subtitle: `You Answered ${activeChoice}. Create Your Free Smarter.Poker Account To Drill ${hand.code} Across Every Position & Stack Depth.`,
                    redirectPath: `/learn/hands/${hand.slug}`,
                    source: `hand-spot-check-${hand.slug}`,
                  });
                }}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  minHeight: 44,
                  padding: '10px 18px',
                  borderRadius: 0,
                  background: 'linear-gradient(180deg, #1f6feb 0%, #11449e 100%)',
                  color: '#f2f7ff',
                  fontSize: 14,
                  fontWeight: 700,
                  textDecoration: 'none',
                  border: '1px solid #5bc0ff',
                }}
              >
                Drill {hand.code} Free In GTO Training
              </a>
            </div>
          )}
        </section>

        <SmarterAccountUnlockGate
          variant="solver-matrix"
          context={`learn-hand-${hand.slug}`}
          title="See Full Multi-Position Solver Frequencies (UTG Through BB) & Drill Free"
          subtitle={`Unlock Complete 6-Max & 9-Max Solver Splits, 3-Bet/4-Bet Responses, And Unlimited Interactive GTO Drills For ${hand.name} (${hand.code}) With A Free Account.`}
          ctaLabel={`Unlock Full ${hand.code} Solver Matrix Free`}
          redirectPath={path}
        />

        <section style={{ marginBottom: 32, marginTop: 32 }}>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: '#f2f7ff', margin: '0 0 12px 0' }}>
            Practice {hand.name} On Smarter.Poker
          </h2>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
            <Link
              href={`/tools/poker-odds-calculator?hand1=${encodeURIComponent(hand.code)}`}
              rel="nofollow"
              prefetch={false}
              style={{ display: 'inline-flex', alignItems: 'center', minHeight: 44, padding: '10px 16px', background: '#0284c7', border: '1px solid #38bdf8', color: '#f2f7ff', borderRadius: 0, textDecoration: 'none', fontWeight: 600, fontSize: 14 }}
            >
              Simulate {hand.code} In Odds Calculator
            </Link>
            <Link
              href="/tools/preflop-ranges"
              style={{ display: 'inline-flex', alignItems: 'center', minHeight: 44, padding: '10px 16px', background: '#0a1a2b', color: '#f2f7ff', border: '1px solid #2b4663', borderRadius: 0, textDecoration: 'none', fontWeight: 600, fontSize: 14 }}
            >
              Open Full 13x13 GTO Range Matrix
            </Link>
            <Link
              href="/learn/hands"
              style={{ display: 'inline-flex', alignItems: 'center', minHeight: 44, padding: '10px 16px', background: '#0a1a2b', color: '#f2f7ff', border: '1px solid #2b4663', borderRadius: 0, textDecoration: 'none', fontWeight: 600, fontSize: 14 }}
            >
              Browse All {STARTING_HANDS.length} Starting Hands
            </Link>
            <Link
              href="/tools/pot-odds-calculator"
              style={{ display: 'inline-flex', alignItems: 'center', minHeight: 44, padding: '10px 16px', background: '#0a1a2b', color: '#86daff', border: '1px solid #2b4663', borderRadius: 0, textDecoration: 'none', fontWeight: 600, fontSize: 14 }}
            >
              Pot Odds &amp; MDF Calculator
            </Link>
          </div>
        </section>

        <SmarterConversionCta
          eyebrow="Free GTO Preflop & Postflop Training"
          title={`Drill ${hand.name} (${hand.code}) In 107 Free GTO Games`}
          description={`Lock In ${hand.code} Opening Frequencies, 3-Bet Responses, And Postflop C-Bet Lines With Interactive Solver Drills.`}
          primaryLabel={`Drill ${hand.code} Free In GTO Training`}
          primaryHref={`/auth/signup?redirect=/hub/training&src=hand-${encodeURIComponent(hand.slug)}`}
          secondaryLabel="Explore 13x13 GTO Matrix"
          secondaryHref="/tools/preflop-ranges"
        />

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
