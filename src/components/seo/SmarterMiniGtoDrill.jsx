/**
 * SmarterMiniGtoDrill - Compact Interactive 1-Hand GTO Poker Spot Widget
 *
 * Zero-dependency #SMARTERDESIGN playable GTO decision drill for SEO strategy
 * pillars and feature landers. Supports category-matched 100BB 6-Max spots
 * (Preflop, Postflop, Tournaments, Math), instant solver frequency & EV
 * rationale reveal, sp:seo-tool-engaged dispatch, zero-bloat funnel telemetry,
 * 1-tap SmarterQuickSignupSheet CTA, Next Spot toggle, and Share Result Card.
 *
 * House style: #SMARTERDESIGN (borderRadius: 0), Title Case, zero em dashes.
 */

import React, { useState } from 'react';
import { openQuickSignup } from './SmarterQuickSignupSheet';
import { trackSeoFunnelEvent } from '../../lib/seo/seoFunnelTelemetry';
import styles from './SmarterSeoKit.module.css';

const ACTIONS = ['Raise / 3-Bet', 'Call', 'Fold'];

const SPOT_BANKS = {
  Preflop: [
    {
      id: 'preflop-btn-a5s-vs-co',
      depth: '100BB 6-Max Cash',
      heroPosition: 'BTN',
      heroCards: [
        { rank: 'A', suit: 's', symbol: '♠', red: false },
        { rank: '5', suit: 's', symbol: '♠', red: false },
      ],
      board: [],
      villainAction: 'CO Opens To 2.5BB',
      potSize: '4.0BB',
      optimalAction: 'Raise / 3-Bet',
      frequencies: { 'Raise / 3-Bet': 68, Call: 32, Fold: 0 },
      evDelta: '+0.84 BB',
      rationale:
        'Ace-Five Suited Blocks Pocket Aces And Ace-King While Carrying Nut Flush And Wheel Straight Equity. Solver Prefers A 3-Bet To 7.5BB In Position At 68% Frequency And Mixes Flat Calls At 32% Versus A Wide Cutoff Open.',
    },
    {
      id: 'preflop-bb-kqo-vs-btn',
      depth: '100BB 6-Max Cash',
      heroPosition: 'BB',
      heroCards: [
        { rank: 'K', suit: 'h', symbol: '♥', red: true },
        { rank: 'Q', suit: 'd', symbol: '♦', red: true },
      ],
      board: [],
      villainAction: 'BTN Opens To 2.5BB',
      potSize: '4.0BB',
      optimalAction: 'Call',
      frequencies: { 'Raise / 3-Bet': 28, Call: 72, Fold: 0 },
      evDelta: '+0.62 BB',
      rationale:
        'Closing The Action In The Big Blind With Strong Broadway High Cards, King-Queen Offsuit Dominates Many Button Opens And Realizes Equity Smoothly As A 72% Call With A 28% Mixed 3-Bet For Linear Value.',
    },
    {
      id: 'preflop-co-ato-vs-utg',
      depth: '100BB 6-Max Cash',
      heroPosition: 'CO',
      heroCards: [
        { rank: 'A', suit: 'c', symbol: '♣', red: false },
        { rank: 'T', suit: 'd', symbol: '♦', red: true },
      ],
      board: [],
      villainAction: 'UTG Opens To 2.5BB',
      potSize: '4.0BB',
      optimalAction: 'Fold',
      frequencies: { 'Raise / 3-Bet': 12, Call: 0, Fold: 88 },
      evDelta: '0.00 BB',
      rationale:
        'Against A Tight Under The Gun 100BB Opening Range, Ace-Ten Offsuit Suffers Reverse Implied Odds Against Better Aces. Solver Folds 88% Purely And Uses Only A 12% Low-Frequency Blocker 3-Bet.',
    },
  ],
  Postflop: [
    {
      id: 'postflop-bb-87s-check-raise',
      depth: '100BB 6-Max Cash',
      heroPosition: 'BB',
      heroCards: [
        { rank: '8', suit: 's', symbol: '♠', red: false },
        { rank: '7', suit: 's', symbol: '♠', red: false },
      ],
      board: [
        { rank: '9', suit: 's', symbol: '♠', red: false },
        { rank: '6', suit: 'd', symbol: '♦', red: true },
        { rank: '2', suit: 'c', symbol: '♣', red: false },
      ],
      villainAction: 'BTN C-Bets 33% Pot (2.0BB)',
      potSize: '8.0BB',
      optimalAction: 'Raise / 3-Bet',
      frequencies: { 'Raise / 3-Bet': 64, Call: 36, Fold: 0 },
      evDelta: '+3.42 BB',
      rationale:
        'Holding An Open-Ended Straight Draw Plus Backdoor Flush Equity On A Low Nine-High Texture Where The Big Blind Holds Significant Nut Density, Solver Check-Raises 64% To Build The Pot And Deny Overcard Equity.',
    },
    {
      id: 'postflop-btn-qjs-second-pair',
      depth: '100BB 6-Max Cash',
      heroPosition: 'BTN',
      heroCards: [
        { rank: 'Q', suit: 'h', symbol: '♥', red: true },
        { rank: 'J', suit: 'h', symbol: '♥', red: true },
      ],
      board: [
        { rank: 'K', suit: 's', symbol: '♠', red: false },
        { rank: 'Q', suit: 'd', symbol: '♦', red: true },
        { rank: '4', suit: 'c', symbol: '♣', red: false },
      ],
      villainAction: 'CO C-Bets 50% Pot (3.0BB)',
      potSize: '9.0BB',
      optimalAction: 'Call',
      frequencies: { 'Raise / 3-Bet': 8, Call: 92, Fold: 0 },
      evDelta: '+2.15 BB',
      rationale:
        'Second Pair Good Kicker With A Backdoor Flush Draw Is A Classic Bluff-Catcher In Position. Raising Isolates Stronger Kings And Two-Pair Combos, So Solver Calls 92% To Keep Villain Bluffs In The Pot.',
    },
    {
      id: 'postflop-bb-a4o-wet-board',
      depth: '100BB 6-Max Cash',
      heroPosition: 'BB',
      heroCards: [
        { rank: 'A', suit: 'd', symbol: '♦', red: true },
        { rank: '4', suit: 'c', symbol: '♣', red: false },
      ],
      board: [
        { rank: 'J', suit: 'h', symbol: '♥', red: true },
        { rank: 'T', suit: 'h', symbol: '♥', red: true },
        { rank: '8', suit: 's', symbol: '♠', red: false },
      ],
      villainAction: 'CO C-Bets 75% Pot (4.5BB)',
      potSize: '10.5BB',
      optimalAction: 'Fold',
      frequencies: { 'Raise / 3-Bet': 0, Call: 6, Fold: 94 },
      evDelta: '0.00 BB',
      rationale:
        'On A Heavily Connected Broadway Texture Against A Polarized 75% Pot Bet, Ace-Four Offsuit Without A Heart Or Straight Card Realizes Minimal Equity. Solver Folds 94% Immediately.',
    },
  ],
  Tournaments: [
    {
      id: 'mtt-btn-ajs-vs-hj',
      depth: '100BB 6-Max Deep MTT',
      heroPosition: 'BTN',
      heroCards: [
        { rank: 'A', suit: 'h', symbol: '♥', red: true },
        { rank: 'J', suit: 'h', symbol: '♥', red: true },
      ],
      board: [],
      villainAction: 'HJ Opens To 2.2BB (12.5% Ante)',
      potSize: '4.5BB',
      optimalAction: 'Raise / 3-Bet',
      frequencies: { 'Raise / 3-Bet': 74, Call: 26, Fold: 0 },
      evDelta: '+1.12 BB',
      rationale:
        'With Antes In Play Deep In A Multi-Table Tournament, Ace-Jack Suited Captures Dead Money And Pressures Capped Hijack Continues. Solver 3-Bets 74% For Value And Position Control.',
    },
    {
      id: 'mtt-bb-77-vs-co',
      depth: '100BB 6-Max Deep MTT',
      heroPosition: 'BB',
      heroCards: [
        { rank: '7', suit: 'd', symbol: '♦', red: true },
        { rank: '7', suit: 'c', symbol: '♣', red: false },
      ],
      board: [],
      villainAction: 'CO Opens To 2.2BB (12.5% Ante)',
      potSize: '4.5BB',
      optimalAction: 'Call',
      frequencies: { 'Raise / 3-Bet': 14, Call: 86, Fold: 0 },
      evDelta: '+0.78 BB',
      rationale:
        'With Ante-Boosted Pot Odds In The Big Blind At 100BB Effective, Pocket Sevens Plays Cleanly As An 86% Defend To Set-Mine And Realize Showdown Value Against Wide Cutoff Steals.',
    },
    {
      id: 'mtt-sb-k8o-vs-utg',
      depth: '100BB 6-Max Deep MTT',
      heroPosition: 'SB',
      heroCards: [
        { rank: 'K', suit: 'c', symbol: '♣', red: false },
        { rank: '8', suit: 'd', symbol: '♦', red: true },
      ],
      board: [],
      villainAction: 'UTG Opens To 2.2BB (12.5% Ante)',
      potSize: '4.5BB',
      optimalAction: 'Fold',
      frequencies: { 'Raise / 3-Bet': 0, Call: 0, Fold: 100 },
      evDelta: '0.00 BB',
      rationale:
        'Out Of Position In The Small Blind Facing An Early-Position Tournament Open With The Big Blind Left To Act, King-Eight Offsuit Is A Pure 100% Fold To Preserve Stack Leverage.',
    },
  ],
  Math: [
    {
      id: 'math-bb-t9s-combo-draw',
      depth: '100BB 6-Max Pot Odds',
      heroPosition: 'BB',
      heroCards: [
        { rank: 'T', suit: 's', symbol: '♠', red: false },
        { rank: '9', suit: 's', symbol: '♠', red: false },
      ],
      board: [
        { rank: 'Q', suit: 's', symbol: '♠', red: false },
        { rank: '8', suit: 'd', symbol: '♦', red: true },
        { rank: '3', suit: 's', symbol: '♠', red: false },
      ],
      villainAction: 'BTN Bets 66% Pot (4.0BB) - 28.6% Pot Odds',
      potSize: '10.0BB',
      optimalAction: 'Raise / 3-Bet',
      frequencies: { 'Raise / 3-Bet': 58, Call: 42, Fold: 0 },
      evDelta: '+4.10 BB',
      rationale:
        'With 12 Clean Outs (9 Spades Plus 3 Non-Spade Jacks) Producing Over 45% Turn-Plus-River Equity Against 28.6% Pot Odds, Solver Semi-Bluff Check-Raises 58% To Leverage Fold Equity And Maximize EV.',
    },
    {
      id: 'math-btn-aqs-mdf',
      depth: '100BB 6-Max MDF Defense',
      heroPosition: 'BTN',
      heroCards: [
        { rank: 'A', suit: 'c', symbol: '♣', red: false },
        { rank: 'Q', suit: 'c', symbol: '♣', red: false },
      ],
      board: [
        { rank: 'A', suit: 'd', symbol: '♦', red: true },
        { rank: '7', suit: 's', symbol: '♠', red: false },
        { rank: '2', suit: 'h', symbol: '♥', red: true },
      ],
      villainAction: 'SB Check-Raises To 8.5BB - 27.9% Pot Odds',
      potSize: '17.5BB',
      optimalAction: 'Call',
      frequencies: { 'Raise / 3-Bet': 5, Call: 95, Fold: 0 },
      evDelta: '+5.20 BB',
      rationale:
        'Top Pair Second Kicker Sits High Inside Your Minimum Defense Frequency Threshold On A Dry Ace-High Flop. Solver Calls 95% In Position To Protect Checking Ranges And Punish Over-Bluffing.',
    },
    {
      id: 'math-co-99-overbet',
      depth: '100BB 6-Max Overbet Math',
      heroPosition: 'CO',
      heroCards: [
        { rank: '9', suit: 'h', symbol: '♥', red: true },
        { rank: '9', suit: 'c', symbol: '♣', red: false },
      ],
      board: [
        { rank: 'A', suit: 's', symbol: '♠', red: false },
        { rank: 'K', suit: 'd', symbol: '♦', red: true },
        { rank: 'Q', suit: 'c', symbol: '♣', red: false },
      ],
      villainAction: 'BTN Overbets 125% Pot (10.0BB) - 35.7% Pot Odds',
      potSize: '18.0BB',
      optimalAction: 'Fold',
      frequencies: { 'Raise / 3-Bet': 0, Call: 4, Fold: 96 },
      evDelta: '0.00 BB',
      rationale:
        'Facing A 125% Pot Overbet Requires 35.7% Raw Equity To Break Even, And Pocket Nines Holds Under 10% Against A Polarized Broadway Value Range. Solver Folds 96% Disciplinedly.',
    },
  ],
};

function resolveCategoryBank(category) {
  const normalized = String(category || 'Preflop').trim();
  if (SPOT_BANKS[normalized]) return normalized;
  const lower = normalized.toLowerCase();
  if (lower === 'postflop' || lower === 'theory') return 'Postflop';
  if (lower === 'tournaments' || lower === 'mtt') return 'Tournaments';
  if (lower === 'math' || lower === 'bankroll') return 'Math';
  return 'Preflop';
}

export const DEFAULT_DRILL_UTM_QUERY = 'utm_source=player_share&utm_medium=referral&utm_campaign=gto_drill';

export function formatSpotHandCode(heroCards = []) {
  if (!Array.isArray(heroCards) || heroCards.length < 2) return 'AQs';
  const [c1, c2] = heroCards;
  const r1 = String(c1?.rank || '').trim();
  const r2 = String(c2?.rank || '').trim();
  if (!r1 || !r2) return 'AQs';
  if (r1 === r2) return `${r1}${r2}`;
  const suited = c1?.suit && c2?.suit && c1.suit === c2.suit ? 's' : 'o';
  return `${r1}${r2}${suited}`;
}

export function buildAttributedDrillShareUrl(input = {}) {
  const opts = typeof input === 'string' ? { redirectPath: input } : (input && typeof input === 'object' ? input : {});
  const base = String(opts.siteUrl || 'https://smarter.poker').trim().replace(/\/+$/, '') || 'https://smarter.poker';
  const rawTarget = String(opts.redirectPath || opts.pageUrl || opts.path || '/hub/training').trim();
  let urlObj;
  try {
    if (/^https?:\/\//i.test(rawTarget)) {
      urlObj = new URL(rawTarget);
    } else {
      const normalizedPath = rawTarget.startsWith('/') ? rawTarget : `/${rawTarget}`;
      urlObj = new URL(normalizedPath, base);
    }
  } catch (_) {
    urlObj = new URL('/hub/training', base);
  }
  const utmSource = String(opts.utmSource || 'player_share').trim().replace(/[^a-zA-Z0-9_-]+/g, '') || 'player_share';
  const utmMedium = String(opts.utmMedium || 'referral').trim().replace(/[^a-zA-Z0-9_-]+/g, '') || 'referral';
  const utmCampaign = String(opts.utmCampaign || 'gto_drill').trim().replace(/[^a-zA-Z0-9_-]+/g, '') || 'gto_drill';
  urlObj.searchParams.set('utm_source', utmSource);
  urlObj.searchParams.set('utm_medium', utmMedium);
  urlObj.searchParams.set('utm_campaign', utmCampaign);
  const cleanSpotId = String(opts.spotId || '').trim().replace(/[^a-zA-Z0-9_-]+/g, '').slice(0, 64);
  if (cleanSpotId) {
    urlObj.searchParams.set('spot', cleanSpotId);
  }
  const cleanHand = String(opts.hand || '').trim().replace(/[^A-Za-z0-9+]+/g, '').slice(0, 12);
  if (cleanHand) {
    urlObj.searchParams.set('hand', cleanHand);
  }
  const cleanPos = String(opts.pos || '').trim().toUpperCase().replace(/[^A-Z0-9+]+/g, '').slice(0, 8);
  if (cleanPos) {
    urlObj.searchParams.set('pos', cleanPos);
  }
  return urlObj.toString();
}

export function buildDrillOgCardUrl({
  hand = 'AQs',
  pos = 'BTN',
  action = '3-Bet',
  grade = 'Optimal',
  siteUrl = 'https://smarter.poker',
} = {}) {
  const base = String(siteUrl || 'https://smarter.poker').trim().replace(/\/+$/, '') || 'https://smarter.poker';
  const params = new URLSearchParams();
  params.set('tool', 'gto-drill');
  params.set('hand', String(hand || 'AQs').trim().replace(/[^A-Za-z0-9+]+/g, '').slice(0, 12) || 'AQs');
  params.set('pos', String(pos || 'BTN').trim().toUpperCase().replace(/[^A-Z0-9+]+/g, '').slice(0, 8) || 'BTN');
  params.set('action', String(action || '3-Bet').trim().slice(0, 24) || '3-Bet');
  params.set('grade', String(grade || 'Optimal').trim().slice(0, 24) || 'Optimal');
  params.set('utm_source', 'drill_share');
  params.set('utm_medium', 'social');
  params.set('utm_campaign', 'gto_drill');
  return `${base}/api/og/tool-card?${params.toString()}`;
}

export function buildDrillSocialShareUrl(input = {}) {
  return buildAttributedDrillShareUrl({
    ...(input && typeof input === 'object' ? input : { redirectPath: input }),
    utmSource: 'drill_share',
    utmMedium: 'social',
    utmCampaign: 'gto_drill',
  });
}

function renderCardTile(card, key) {
  return (
    <span
      key={key}
      style={{
        display: 'inline-flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        width: 48,
        height: 64,
        borderRadius: 0,
        background: 'linear-gradient(180deg, #f8fafc 0%, #e2e8f0 100%)',
        border: '2px solid #38bdf8',
        boxShadow: '0 4px 10px rgba(0, 0, 0, 0.5)',
        color: card.red ? '#dc2626' : '#0f172a',
        fontFamily: 'var(--font-roboto-condensed), Arial, sans-serif',
        fontWeight: 900,
        lineHeight: 1,
        userSelect: 'none',
      }}
    >
      <span style={{ fontSize: 19, letterSpacing: '-0.02em' }}>{card.rank}</span>
      <span style={{ fontSize: 20, marginTop: 2 }} aria-hidden="true">
        {card.symbol}
      </span>
    </span>
  );
}

export default function SmarterMiniGtoDrill({
  category = 'Preflop',
  redirectPath = '/hub/training',
}) {
  const bankKey = resolveCategoryBank(category);
  const spots = SPOT_BANKS[bankKey];
  const [spotIndex, setSpotIndex] = useState(0);
  const [selectedAction, setSelectedAction] = useState(null);
  const [copiedShare, setCopiedShare] = useState(false);

  const safeIndex = spotIndex % spots.length;
  const spot = spots[safeIndex];
  const heroHandLabel = spot.heroCards.map((c) => `${c.rank}${c.symbol}`).join(' ');
  const boardLabel = spot.board.length > 0 ? spot.board.map((c) => `${c.rank}${c.symbol}`).join(' ') : '';

  const selectedFreq = selectedAction ? Number(spot.frequencies[selectedAction] || 0) : 0;
  const isOptimal = Boolean(selectedAction && selectedAction === spot.optimalAction);
  const isMixedApproved = Boolean(selectedAction && !isOptimal && selectedFreq > 0);

  const verdictLabel = isOptimal
    ? 'Optimal Solver Play'
    : isMixedApproved
      ? 'Valid Mixed Frequency'
      : 'Solver Prefers A Different Line';

  const handleChooseAction = (action) => {
    setSelectedAction(action);
    setCopiedShare(false);
    const chosenOptimal = action === spot.optimalAction;
    try {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('sp:seo-tool-engaged', {
            detail: {
              tool: 'mini-gto-drill',
              category: bankKey,
              spotId: spot.id,
              action,
            },
          }),
        );
      }
      trackSeoFunnelEvent('seo_mini_gto_drill_answered', {
        category: bankKey,
        spot_id: spot.id,
        choice: action,
        optimal_action: spot.optimalAction,
        is_optimal: chosenOptimal,
        redirect_path: redirectPath,
      });
    } catch (_) {
      /* non-blocking */
    }
  };

  const handleNextSpot = () => {
    setSpotIndex((prev) => (prev + 1) % spots.length);
    setSelectedAction(null);
    setCopiedShare(false);
  };

  const handleOpenSignupCta = () => {
    trackSeoFunnelEvent('seo_mini_gto_drill_cta_click', {
      category: bankKey,
      spot_id: spot.id,
      choice: selectedAction || 'unanswered',
      redirect_path: redirectPath,
    });
    openQuickSignup({
      unlockKey: `mini-gto-drill-${bankKey.toLowerCase()}`,
      source: `mini-gto-drill-${bankKey.toLowerCase()}`,
      redirectPath: redirectPath || '/hub/training',
      eyebrow: `Free ${bankKey} GTO Training`,
      title: 'Play All 107 GTO Poker Training Games Free',
      subtitle: selectedAction
        ? `You Played ${selectedAction} With ${heroHandLabel} From ${spot.heroPosition}. Create Your Free Account To Unlock All 107 Solver Drills And Track EV Accuracy.`
        : 'Create Your Free Smarter.Poker Account In 10 Seconds To Play All 107 GTO Games, Save Ranges & Track Your Leaks.',
      benefits: [
        '100% Free Forever - Zero Credit Card Required',
        '107 Interactive GTO Cash & Tournament Training Games',
        'Instant Solver Frequency Grading & EV Loss Analytics',
      ],
    });
  };

  const handleShareResult = async () => {
    const currentPagePath =
      typeof window !== 'undefined' && window.location?.pathname && window.location.pathname !== '/'
        ? window.location.pathname
        : redirectPath || '/hub/training';
    const handCode = formatSpotHandCode(spot.heroCards);
    const shortGrade = isOptimal ? 'Optimal' : isMixedApproved ? 'Mixed' : 'Review';
    const attributedPageUrl = buildAttributedDrillShareUrl({
      redirectPath: currentPagePath,
      spotId: spot.id,
      hand: handCode,
      pos: spot.heroPosition,
    });
    const ogLink = buildDrillOgCardUrl({
      hand: handCode,
      pos: spot.heroPosition,
      action: spot.optimalAction,
      grade: shortGrade,
    });
    const summaryText = `Smarter.Poker ${spot.depth} GTO Spot (${spot.heroPosition} holding ${heroHandLabel}, ${spot.villainAction}): I Picked ${selectedAction || spot.optimalAction} | Solver: ${spot.optimalAction} ${spot.frequencies[spot.optimalAction]}% (${spot.evDelta}) | Card: ${ogLink} | Play Spot: ${attributedPageUrl}`;
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(summaryText);
        setCopiedShare(true);
        setTimeout(() => setCopiedShare(false), 2400);
      }
      trackSeoFunnelEvent('seo_mini_gto_drill_share', {
        category: bankKey,
        spot_id: spot.id,
        hand: handCode,
        pos: spot.heroPosition,
      });
    } catch (_) {
      /* ignore clipboard refusal */
    }
  };

  return (
    <section
      className={`${styles.kit} ${styles.frameActive}`}
      aria-label={`Interactive ${category} GTO Poker Drill`}
      data-testid="smarter-mini-gto-drill"
      data-category={bankKey}
      style={{
        margin: '24px 0',
        padding: '20px 20px 22px',
        borderRadius: 0,
        background: 'linear-gradient(180deg, #081121 0%, #060d1a 100%)',
      }}
    >
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 10,
          marginBottom: 14,
        }}
      >
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
          <span className={styles.eyebrowTag}>
            Playable {category} GTO Drill
          </span>
          <span
            style={{
              fontSize: 12,
              fontWeight: 700,
              color: '#86daff',
              letterSpacing: '0.05em',
              textTransform: 'uppercase',
            }}
          >
            {spot.depth} · Spot {safeIndex + 1} Of {spots.length}
          </span>
        </div>

        <button
          type="button"
          className={styles.btnSharpSecondary}
          onClick={handleNextSpot}
          data-testid="mini-gto-next-spot-btn"
        >
          Next Spot ({((safeIndex + 1) % spots.length) + 1}/{spots.length})
        </button>
      </div>

      <h2
        style={{
          margin: '0 0 14px 0',
          fontSize: 20,
          fontWeight: 800,
          color: '#f2f7ff',
          lineHeight: 1.25,
        }}
      >
        Test Your {category} Instincts: What Is The Solver Play?
      </h2>

      <div
        className={styles.rowPanel}
        style={{
          padding: '16px',
          marginBottom: 16,
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(175px, 1fr))',
          gap: 14,
          alignItems: 'center',
        }}
      >
        <div>
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: '#86daff',
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              marginBottom: 8,
            }}
          >
            Hero Hand ({spot.heroPosition})
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }} aria-label={`Hero Holds ${heroHandLabel}`}>
            {spot.heroCards.map((c, idx) => renderCardTile(c, `${spot.id}-hero-${idx}`))}
          </div>
        </div>

        {spot.board.length > 0 && (
          <div>
            <div
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: '#86daff',
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                marginBottom: 8,
              }}
            >
              Flop Texture
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }} aria-label={`Board ${boardLabel}`}>
              {spot.board.map((c, idx) => renderCardTile(c, `${spot.id}-board-${idx}`))}
            </div>
          </div>
        )}

        <div style={{ display: 'grid', gap: 8 }}>
          <div
            style={{
              padding: '8px 10px',
              borderRadius: 0,
              border: '1px solid #2b4663',
              background: '#060d1a',
            }}
          >
            <span
              style={{
                display: 'block',
                fontSize: 11,
                fontWeight: 700,
                color: '#86daff',
                textTransform: 'uppercase',
                letterSpacing: '0.07em',
              }}
            >
              Villain Action
            </span>
            <span style={{ display: 'block', marginTop: 2, fontSize: 14, fontWeight: 700, color: '#f2f7ff' }}>
              {spot.villainAction}
            </span>
          </div>
          <div
            style={{
              padding: '8px 10px',
              borderRadius: 0,
              border: '1px solid #2b4663',
              background: '#060d1a',
            }}
          >
            <span
              style={{
                display: 'block',
                fontSize: 11,
                fontWeight: 700,
                color: '#86daff',
                textTransform: 'uppercase',
                letterSpacing: '0.07em',
              }}
            >
              Current Pot Size
            </span>
            <span style={{ display: 'block', marginTop: 2, fontSize: 14, fontWeight: 800, color: '#38bdf8' }}>
              {spot.potSize}
            </span>
          </div>
        </div>
      </div>

      <div
        role="group"
        aria-label="Choose Hero Poker Action"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
          gap: 10,
        }}
      >
        {ACTIONS.map((action) => {
          const isPicked = selectedAction === action;
          const isBest = Boolean(selectedAction && action === spot.optimalAction);
          return (
            <button
              key={action}
              type="button"
              aria-pressed={isPicked}
              data-testid={`mini-gto-action-${action.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}
              onClick={() => handleChooseAction(action)}
              style={{
                minHeight: 48,
                padding: '10px 14px',
                borderRadius: 0,
                border: isBest
                  ? '1px solid #34d399'
                  : isPicked
                    ? '1px solid #38bdf8'
                    : '1px solid #2b4663',
                background: isPicked
                  ? 'linear-gradient(180deg, #1d4ed8 0%, #10328c 100%)'
                  : 'linear-gradient(180deg, #10243a 0%, #060d1a 100%)',
                color: '#f2f7ff',
                fontSize: 14,
                fontWeight: 800,
                letterSpacing: '0.03em',
                cursor: 'pointer',
              }}
            >
              {action}
            </button>
          );
        })}
      </div>

      {selectedAction && (
        <div
          role="status"
          aria-live="polite"
          data-testid="mini-gto-result-panel"
          style={{
            marginTop: 16,
            padding: 16,
            borderRadius: 0,
            background: '#060d1a',
            border: `1px solid ${isOptimal || isMixedApproved ? '#34d399' : '#38bdf8'}`,
          }}
        >
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 8,
              marginBottom: 10,
            }}
          >
            <strong
              style={{
                fontSize: 15,
                fontWeight: 800,
                color: isOptimal || isMixedApproved ? '#34d399' : '#38bdf8',
              }}
            >
              {verdictLabel} · Best Play: {spot.optimalAction} ({spot.frequencies[spot.optimalAction]}%)
            </strong>
            <span
              style={{
                padding: '4px 10px',
                borderRadius: 0,
                border: '1px solid #2b4663',
                background: '#081121',
                fontSize: 12,
                fontWeight: 800,
                color: '#86daff',
              }}
            >
              Solver EV: {spot.evDelta}
            </span>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
              gap: 8,
              marginBottom: 12,
            }}
          >
            {ACTIONS.map((act) => (
              <div
                key={act}
                style={{
                  padding: '8px 10px',
                  borderRadius: 0,
                  border: act === spot.optimalAction ? '1px solid #38bdf8' : '1px solid #22384f',
                  background: '#081121',
                }}
              >
                <div style={{ fontSize: 11, fontWeight: 700, color: '#bdd0e2' }}>{act}</div>
                <div style={{ fontSize: 16, fontWeight: 800, color: '#f2f7ff', marginTop: 2 }}>
                  {spot.frequencies[act]}%
                </div>
              </div>
            ))}
          </div>

          <p style={{ margin: '0 0 14px 0', fontSize: 13.5, lineHeight: 1.55, color: '#bdd0e2' }}>
            {spot.rationale}
          </p>

          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10 }}>
            <button
              type="button"
              className={styles.ctaPrimary}
              onClick={handleOpenSignupCta}
              data-testid="mini-gto-signup-cta"
            >
              <span>Play All 107 GTO Games Free</span>
            </button>

            <button
              type="button"
              className={styles.btnSharpSecondary}
              onClick={handleShareResult}
              data-testid="mini-gto-share-btn"
            >
              {copiedShare ? 'Result Card Copied' : 'Share Result Card'}
            </button>

            <button
              type="button"
              className={styles.btnSharpPrimary}
              onClick={handleNextSpot}
              data-testid="mini-gto-next-spot-after-answer"
            >
              Play Next Spot
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
