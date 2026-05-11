/**
 * PlayingCard
 * ═══════════════════════════════════════════════════════════════════════════
 * Shared component for rendering a single playing card using the canonical
 * custom 52-deck PNG asset set at /public/cards/{suit}_{rank}.png.
 *
 * Same deck used by Club Arena, sandbox, hand-replayer, and (after this
 * rollout) every training surface.
 *
 * Source asset convention: 150 x 210 px, RGBA PNG.
 *
 * Accepted inputs (use ONE of):
 *   - <PlayingCard card="As" />         shorthand: rank + suit letter
 *   - <PlayingCard card="10h" />        ten-spot needs two-char rank
 *   - <PlayingCard rank="A" suit="s" /> explicit
 *   - <PlayingCard cardId={51} />       engine integer 0–51 (clubs:0–12,
 *                                       diamonds:13–25, hearts:26–38, spades:39–51)
 *   - <PlayingCard faceDown />          card back
 *
 * Common props:
 *   size       'xs' | 'sm' | 'md' | 'lg' | 'xl'  (default 'md')
 *   width      numeric override
 *   faceDown   boolean
 *   cardBack   'blue' | 'red' | 'black' | 'white'  (default 'blue')
 *   highlighted boolean — selected/active outline
 *   dimmed     boolean — muted/folded
 *   optimized  boolean — pull from /cards/optimized/
 *   priority   boolean — eager-load (above the fold)
 *   onClick    handler
 *   ariaLabel  string override
 *   className  string
 *   style      object — merged AFTER built-in styles so callers can override
 *
 * Build-safety: no emoji chars in source, no JSX comments inside conditional
 * expressions. Follows the rules from PR #362/#365/#369.
 */
// TRAIN-PLAYCARD-1 — audit-marker registry token


import React from 'react';

const SUIT_FULL = {
  c: 'clubs',
  d: 'diamonds',
  h: 'hearts',
  s: 'spades',
  clubs: 'clubs',
  diamonds: 'diamonds',
  hearts: 'hearts',
  spades: 'spades',
};

const RANK_FILE = {
  '2': '2',
  '3': '3',
  '4': '4',
  '5': '5',
  '6': '6',
  '7': '7',
  '8': '8',
  '9': '9',
  '10': '10',
  T: '10',
  t: '10',
  J: 'j',
  j: 'j',
  Q: 'q',
  q: 'q',
  K: 'k',
  k: 'k',
  A: 'a',
  a: 'a',
};

const RANK_LABEL = {
  '2': 'Two',
  '3': 'Three',
  '4': 'Four',
  '5': 'Five',
  '6': 'Six',
  '7': 'Seven',
  '8': 'Eight',
  '9': 'Nine',
  '10': 'Ten',
  j: 'Jack',
  q: 'Queen',
  k: 'King',
  a: 'Ace',
};

const SIZE_PRESETS = {
  xs: 24,
  sm: 36,
  md: 60,
  lg: 90,
  xl: 120,
};

const ASPECT_RATIO = 150 / 210; // width / height

const ENGINE_SUITS = ['clubs', 'diamonds', 'hearts', 'spades'];
const ENGINE_RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'j', 'q', 'k', 'a'];

function partsFromCard(card) {
  if (typeof card !== 'string') return null;
  const trimmed = card.trim();
  // Allow optional separator like an embedded suit symbol
  const stripped = trimmed.replace(/[\s_-]/g, '');
  // Handle unicode suit symbols by mapping them back
  const suitChar = stripped.slice(-1).toLowerCase();
  const rankPart = stripped.slice(0, -1);
  const SUIT_FROM_SYMBOL = { '\u2663': 'c', '\u2666': 'd', '\u2665': 'h', '\u2660': 's' };
  const normSuit = SUIT_FROM_SYMBOL[stripped.slice(-1)] || suitChar;
  if (!SUIT_FULL[normSuit]) return null;
  const rankFile = RANK_FILE[rankPart];
  if (!rankFile) return null;
  return { suit: SUIT_FULL[normSuit], rank: rankFile };
}

function partsFromCardId(cardId) {
  if (typeof cardId !== 'number' || cardId < 0 || cardId > 51) return null;
  // CardAssets canonical: suit = floor(id/13), rank = id%13
  const suit = ENGINE_SUITS[Math.floor(cardId / 13)];
  const rank = ENGINE_RANKS[cardId % 13];
  return { suit, rank };
}

function resolveParts({ card, cardId, rank, suit }) {
  if (rank && suit) {
    const r = RANK_FILE[rank];
    const sChar = String(suit).toLowerCase();
    const SUIT_FROM_SYMBOL = { '\u2663': 'c', '\u2666': 'd', '\u2665': 'h', '\u2660': 's' };
    const normSuit = SUIT_FROM_SYMBOL[suit] || sChar;
    const s = SUIT_FULL[normSuit] || SUIT_FULL[sChar];
    if (r && s) return { rank: r, suit: s };
  }
  if (card) return partsFromCard(card);
  if (cardId !== undefined && cardId !== null) return partsFromCardId(cardId);
  return null;
}

function buildAltText(parts, faceDown) {
  if (faceDown) return 'Playing card, face down';
  if (!parts) return 'Playing card';
  const rankLabel = RANK_LABEL[parts.rank] || parts.rank;
  const suitLabel = parts.suit.charAt(0).toUpperCase() + parts.suit.slice(1);
  return `${rankLabel} of ${suitLabel}`;
}

function buildSrc(parts, { faceDown, cardBack, optimized }) {
  if (faceDown) return `/cards/back.png`;
  if (!parts) return `/cards/back.png`;
  const base = optimized ? '/cards/optimized' : '/cards';
  return `${base}/${parts.suit}_${parts.rank}.png`;
}

const BASE_STYLE = {
  display: 'inline-block',
  borderRadius: 6,
  overflow: 'hidden',
  userSelect: 'none',
  WebkitUserSelect: 'none',
  verticalAlign: 'middle',
  background: 'transparent',
  lineHeight: 0,
};

const PlayingCard = React.memo(function PlayingCard({
  card,
  cardId,
  rank,
  suit,
  size = 'md',
  width,
  faceDown = false,
  cardBack = 'blue',
  highlighted = false,
  dimmed = false,
  optimized = false,
  priority = false,
  onClick,
  ariaLabel,
  className,
  style,
  alt,
}) {
  const parts = resolveParts({ card, cardId, rank, suit });
  const isFaceDown = Boolean(faceDown) || (!parts && !card && cardId === undefined);
  const w = typeof width === 'number' ? width : SIZE_PRESETS[size] || SIZE_PRESETS.md;
  const h = Math.round(w / ASPECT_RATIO);

  const computedAlt = alt || buildAltText(parts, isFaceDown);
  const computedAria = ariaLabel || computedAlt;

  const wrapperStyle = {
    ...BASE_STYLE,
    width: w,
    height: h,
    cursor: typeof onClick === 'function' ? 'pointer' : 'default',
    opacity: dimmed ? 0.45 : 1,
    boxShadow: highlighted
      ? '0 0 0 2px #00d4ff, 0 4px 12px rgba(0, 212, 255, 0.35)'
      : '0 1px 3px rgba(0, 0, 0, 0.35)',
    transition: 'opacity 0.15s ease, box-shadow 0.15s ease, transform 0.15s ease',
    ...(style || {}),
  };

  const src = buildSrc(parts, { faceDown: isFaceDown, cardBack, optimized });

  const onKey = (e) => {
    if (typeof onClick !== 'function') return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onClick(e);
    }
  };

  return (
    <span
      className={className}
      style={wrapperStyle}
      onClick={onClick}
      onKeyDown={onClick ? onKey : undefined}
      role={onClick ? 'button' : 'img'}
      tabIndex={onClick ? 0 : undefined}
      aria-label={computedAria}
      aria-pressed={onClick && highlighted ? true : undefined}
    >
      <img
        src={src}
        alt={computedAlt}
        width={w}
        height={h}
        draggable={false}
        loading={priority ? 'eager' : 'lazy'}
        decoding="async"
        style={{ width: '100%', height: '100%', display: 'block', objectFit: 'cover' }}
      />
    </span>
  );
});

export default PlayingCard;

// ─── Named helpers (re-exported for convenience) ────────────────────────────

export function getCardImagePath(parts, { optimized = false } = {}) {
  if (!parts) return '/cards/back.png';
  const base = optimized ? '/cards/optimized' : '/cards';
  return `${base}/${parts.suit}_${parts.rank}.png`;
}

export function preloadDeck({ optimized = true } = {}) {
  if (typeof window === 'undefined') return;
  ENGINE_SUITS.forEach((s) => {
    ENGINE_RANKS.forEach((r) => {
      const img = new window.Image();
      img.src = `${optimized ? '/cards/optimized' : '/cards'}/${s}_${r}.png`;
    });
  });
  const back = new window.Image();
  back.src = '/cards/back.png';
}

export const PLAYING_CARD_VERSION = '1.0.0';
