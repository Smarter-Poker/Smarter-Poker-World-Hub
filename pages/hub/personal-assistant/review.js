/**
 * PERSONAL ASSISTANT · Review My Play Study Workstation
 * /hub/personal-assistant/review
 *
 * Owner-scoped private review workstation for saved Club Arena and scanned hands.
 * - Opens `?hand=<saved-row UUID>` directly and preserves `?hand=` across Sign-In redirects.
 * - Interactive Street-By-Street Visual Replayer with keyboard arrow navigation on the street tablist.
 * - One-click sanitized handoff into Virtual Sandbox (`pa-sandbox-handoff-v1`).
 * - First-class multi-variant rendering (NLH, PLO4/5/6, Bomb Pots, Straddles, Multi-Board Run-It-Twice).
 * - Tags, structured filters, search, and cursor pagination (`Load More`).
 * - Post-session Suggested Hands To Review + Active-Table RTA gate before verified analysis.
 * - Offline-safe note draft recovery (`pa-review-draft:${userId}:${handId}:${revision}`).
 * - Instant cross-tab sync via `BroadcastChannel('smarter-poker-saved-hands')` + throttled `visibilitychange`.
 * - Native `<dialog>` safe deletion guard + 5-second non-destructive Undo Delete countdown toast.
 * - Privacy-safe anonymized hand sharing + authenticated Blob export (JSON / Text).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useRouter } from 'next/router';
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Download,
  ExternalLink,
  FlaskConical,
  Plus,
  RefreshCw,
  Save,
  ScanSearch,
  Share2,
  ShieldAlert,
  Sparkles,
  Tag,
  Trash2,
  Undo2,
} from 'lucide-react';

import SEOHead from '../../../src/components/seo/SEOHead';
import PageTransition from '../../../src/components/transitions/PageTransition';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import HamburgerMenu from '../../../src/components/ui/HamburgerMenu';
import HubPageShell from '../../../src/components/ui/HubPageShell';
import PersonalAssistantCopyPolicy from '../../../src/components/personal-assistant/PersonalAssistantCopyPolicy';
import { useAvatar } from '../../../src/contexts/AvatarContext';
import { getMenuConfig } from '../../../src/config/hamburgerMenus';
import { getAccessToken, getFreshAccessToken } from '../../../src/lib/authUtils';
import { useModalHistory } from '../../../src/hooks/useModalHistory';
import { anonymizeHandForShare } from '../../../src/lib/personal-assistant/anonymizeHandForShare.mjs';
import { collectSavedHandsExport } from '../../../src/lib/personal-assistant/savedHandExport.mjs';
import { recordPaMilestone } from '../../../src/lib/personal-assistant/telemetry.mjs';
import styles from '../../../src/styles/worlds/PersonalAssistantReview.module.css';

const SandboxPokerTable = dynamic(
  () => import('../../../src/components/sandbox/SandboxPokerTable'),
  { ssr: false },
);

const REQUEST_TIMEOUT_MS = 12000;
const PAGE_SIZE = 25;
const MAX_TAGS = 10;
const MAX_TAG_LENGTH = 32;
const DELETE_UNDO_SECONDS = 5;
const VISIBILITY_REFRESH_THROTTLE_MS = 10000;
const SANDBOX_HANDOFF_KEY = 'pa-sandbox-handoff-v1';
const SAVED_HANDS_CHANNEL = 'smarter-poker-saved-hands';
const TAB_ID = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
  ? crypto.randomUUID()
  : `pa-review-tab-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

const PRESET_TAGS = [
  '3-Bet Pot',
  'River Bluff-Catch',
  'Bubble',
  'Multi-Board',
  'Bomb Pot',
];

const SUITS = ['c', 'd', 'h', 's'];
const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];
const SUIT_GLYPH = { s: '♠', h: '♥', d: '♦', c: '♣' };
const GLYPH_TO_SUIT = { '♠': 's', '♥': 'h', '♦': 'd', '♣': 'c' };
const CARD_SUIT_ASSET_NAME = { s: 'spades', h: 'hearts', d: 'diamonds', c: 'clubs' };
const CARD_RANK_ASSET_NAME = {
  A: 'a', 2: '2', 3: '3', 4: '4', 5: '5',
  6: '6', 7: '7', 8: '8', 9: '9', T: '10',
  J: 'j', Q: 'q', K: 'k',
};
const CARD_RANK_LABEL = {
  A: 'A', 2: '2', 3: '3', 4: '4', 5: '5',
  6: '6', 7: '7', 8: '8', 9: '9', T: '10',
  J: 'J', Q: 'Q', K: 'K',
};
const CARD_SUIT_TITLE = {
  s: 'Spades',
  h: 'Hearts',
  d: 'Diamonds',
  c: 'Clubs',
};
const FOUR_COLOR_SUIT_INK = {
  s: '#111827',
  h: '#c81e2b',
  d: '#0f52ba',
  c: '#16794b',
};

const REVIEW_STATUS_LABELS = {
  saved: 'Saved',
  in_review: 'In Review',
  reviewed: 'Reviewed',
};

const STREET_ORDER = ['preflop', 'pineapple_discard', 'flop', 'turn', 'river'];

const STREET_LABELS = {
  preflop: 'Preflop',
  pineapple_discard: 'Discard',
  flop: 'Flop',
  turn: 'Turn',
  river: 'River',
};

const SMART_POSITIONS = ['All', 'BTN', 'CO', 'BB', 'SB', 'MP', 'UTG'];
const SMART_POT_TYPES = ['All', 'SRP', '3-Bet', '4-Bet'];
const SMART_VARIANTS = ['All', 'NLH', 'PLO'];

const ILLUSTRATIVE_SAMPLE_HAND = Object.freeze({
  id: 'sample-hand-preview',
  isSamplePreview: true,
  hand_number: 101,
  variant: 'NLH',
  small_blind: 1,
  big_blind: 2,
  pot_total: 108,
  created_at: null,
  hand_data: {
    source: 'sample-preview',
    tableName: 'Illustrative Sample Hand (Not Saved To Your Account)',
    format: 'cash',
    heroPosition: 'BTN',
    heroCards: ['Ah', 'Kh'],
    heroNet: 54,
    effectiveStack: 200,
    communityCards: ['Ks', '7c', '2d', '9h', '4s'],
    boards: [{ index: 1, label: 'Board 1', cards: ['Ks', '7c', '2d', '9h', '4s'] }],
    players: [
      { seatIndex: 1, name: 'You', position: 'BTN', isHero: true, startingStack: 200, stack: 200, netResult: 54, holeCards: ['Ah', 'Kh'] },
      { seatIndex: 2, name: 'Villain CO', position: 'CO', isHero: false, startingStack: 200, stack: 200, netResult: -54, showedCards: false, holeCards: [] },
    ],
    streets: [
      {
        name: 'preflop',
        cards: [],
        actions: [
          { position: 'CO', playerName: 'Villain CO', isHero: false, action: 'raise', amount: 6 },
          { position: 'BTN', playerName: 'You', isHero: true, action: 'raise', amount: 18 },
          { position: 'CO', playerName: 'Villain CO', isHero: false, action: 'call', amount: 12 },
        ],
      },
      {
        name: 'flop',
        cards: ['Ks', '7c', '2d'],
        actions: [
          { position: 'CO', playerName: 'Villain CO', isHero: false, action: 'check', amount: 0 },
          { position: 'BTN', playerName: 'You', isHero: true, action: 'bet', amount: 12 },
          { position: 'CO', playerName: 'Villain CO', isHero: false, action: 'call', amount: 12 },
        ],
      },
      {
        name: 'turn',
        cards: ['9h'],
        actions: [
          { position: 'CO', playerName: 'Villain CO', isHero: false, action: 'check', amount: 0 },
          { position: 'BTN', playerName: 'You', isHero: true, action: 'bet', amount: 24 },
          { position: 'CO', playerName: 'Villain CO', isHero: false, action: 'call', amount: 24 },
        ],
      },
      {
        name: 'river',
        cards: ['4s'],
        actions: [
          { position: 'CO', playerName: 'Villain CO', isHero: false, action: 'check', amount: 0 },
          { position: 'BTN', playerName: 'You', isHero: true, action: 'check', amount: 0 },
        ],
      },
    ],
    review: {
      status: 'saved',
      notes: '',
      tags: ['3-Bet Pot'],
      revision: 1,
      analysisState: 'not_analyzed',
    },
  },
});

function toStandardCardCode(card) {
  let code = '';
  if (typeof card === 'number' && Number.isInteger(card) && card >= 0 && card <= 51) {
    code = `${RANKS[card % 13]}${SUITS[Math.floor(card / 13)]}`;
  } else if (typeof card === 'string') {
    code = card.trim();
  }
  const match = code.match(/^(10|[2-9TJQKA])([shdc♠♥♦♣])$/i);
  if (!match) return '';
  const rawRank = match[1].toUpperCase();
  const rank = rawRank === '10' ? 'T' : rawRank;
  const rawSuit = match[2];
  const suit = GLYPH_TO_SUIT[rawSuit] || rawSuit.toLowerCase();
  return `${rank}${suit}`;
}

function ArenaMiniCard({ card, size = 'md', overlapped = false, overlapTight = false }) {
  const code = toStandardCardCode(card);
  const [fallbackTier, setFallbackTier] = useState(0);

  useEffect(() => {
    setFallbackTier(0);
  }, [code]);

  if (!code) return null;

  const rankChar = code[0];
  const suitChar = code[1];
  const suitName = CARD_SUIT_ASSET_NAME[suitChar];
  const rankName = CARD_RANK_ASSET_NAME[rankChar];
  const rankDisplay = CARD_RANK_LABEL[rankChar] || rankChar;
  const suitGlyph = SUIT_GLYPH[suitChar] || '';
  const cardAriaLabel = `${rankDisplay} Of ${CARD_SUIT_TITLE[suitChar] || 'Cards'}`;

  const sizeClass = size === 'xs'
    ? styles.arenaCardXs
    : size === 'sm'
      ? styles.arenaCardSm
      : size === 'lg'
        ? styles.arenaCardLg
        : styles.arenaCardMd;
  const overlapClass = overlapped
    ? (overlapTight ? styles.arenaCardOverlapTight : styles.arenaCardOverlap)
    : '';
  const showTextFallback = fallbackTier >= 2 || !suitName || !rankName;
  const imgSrc = fallbackTier === 0
    ? `/hub/club-arena/cards/4color/${suitName}_${rankName}.webp`
    : `/cards/${suitName}_${rankName}.png`;

  return (
    <span
      className={`${styles.arenaCard} ${sizeClass} ${overlapClass}`.trim()}
      data-review-card={code}
      data-pa-verbatim="true"
      aria-label={cardAriaLabel}
    >
      {showTextFallback ? (
        <span
          className={styles.arenaCardFallback}
          style={{ color: FOUR_COLOR_SUIT_INK[suitChar] || '#111827' }}
        >
          <span className={styles.arenaCardFallbackRank}>{rankDisplay}</span>
          <span className={styles.arenaCardFallbackSuit}>{suitGlyph}</span>
        </span>
      ) : (
        <>
          <img
            src={imgSrc}
            alt={cardAriaLabel}
            className={styles.arenaCardImg}
            onError={() => setFallbackTier((prev) => prev + 1)}
            decoding="async"
          />
          <span
            style={{
              position: 'absolute',
              width: 1,
              height: 1,
              padding: 0,
              margin: -1,
              overflow: 'hidden',
              clip: 'rect(0, 0, 0, 0)',
              whiteSpace: 'nowrap',
              border: 0,
            }}
          >
            {rankDisplay}{suitGlyph}
          </span>
        </>
      )}
    </span>
  );
}

function ArenaMiniCardBack({ size = 'sm', overlapped = false }) {
  const [fallbackTier, setFallbackTier] = useState(0);
  const sizeClass = size === 'xs'
    ? styles.arenaCardXs
    : size === 'sm'
      ? styles.arenaCardSm
      : size === 'lg'
        ? styles.arenaCardLg
        : styles.arenaCardMd;
  const overlapClass = overlapped ? styles.arenaCardOverlap : '';
  const imgSrc = fallbackTier === 0
    ? '/hub/club-arena/card-backs/classic_blue.webp'
    : '/cards/back.webp';

  return (
    <span
      className={`${styles.arenaCard} ${styles.arenaCardBack} ${sizeClass} ${overlapClass}`.trim()}
      aria-hidden="true"
    >
      {fallbackTier >= 2 ? (
        <span className={styles.arenaCardBackPattern} />
      ) : (
        <img
          src={imgSrc}
          alt=""
          className={styles.arenaCardImg}
          onError={() => setFallbackTier((prev) => prev + 1)}
          decoding="async"
        />
      )}
    </span>
  );
}

function formatChips(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '0';
  return Math.round(n * 100) / 100 === Math.trunc(n)
    ? Math.trunc(n).toLocaleString()
    : n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatSignedChips(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '0';
  if (n > 0) return `+${formatChips(n)}`;
  if (n < 0) return `-${formatChips(Math.abs(n))}`;
  return '0';
}

function formatDateStamp(value) {
  if (!value) return 'Recently Saved';
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return String(value);
  return dt.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatActionVerb(verb) {
  const clean = String(verb || '').trim().toLowerCase();
  const map = {
    sb: 'Small Blind',
    bb: 'Big Blind',
    ante: 'Ante',
    straddle: 'Straddle',
    post: 'Post',
    fold: 'Fold',
    check: 'Check',
    call: 'Call',
    bet: 'Bet',
    raise: 'Raise',
    allin: 'All-In',
    all_in: 'All-In',
    discard: 'Discard',
    return: 'Uncalled Return',
  };
  return map[clean] || (clean ? clean.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) : 'Action');
}

function sanitizeTagValue(raw) {
  if (typeof raw !== 'string') return '';
  return raw
    .replace(/[^a-zA-Z0-9\s-]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_TAG_LENGTH);
}

function normalizeTagList(rawTags) {
  if (!Array.isArray(rawTags)) return [];
  const seen = new Set();
  const out = [];
  for (const item of rawTags) {
    const clean = sanitizeTagValue(String(item || ''));
    if (!clean) continue;
    const key = clean.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(clean);
    if (out.length >= MAX_TAGS) break;
  }
  return out;
}

function tagsEqual(a, b) {
  const normA = normalizeTagList(a);
  const normB = normalizeTagList(b);
  if (normA.length !== normB.length) return false;
  return normA.every((val, idx) => val === normB[idx]);
}

function getDraftStorageKey(userId, handId, revision) {
  return `pa-review-draft:${userId}:${handId}:${revision}`;
}

function readDraftFromSession(userId, handId, revision) {
  if (typeof window === 'undefined' || !userId || !handId) return null;
  try {
    const raw = window.sessionStorage.getItem(getDraftStorageKey(userId, handId, revision));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    return {
      notes: typeof parsed.notes === 'string' ? parsed.notes : '',
      status: REVIEW_STATUS_LABELS[parsed.status] ? parsed.status : 'saved',
      tags: normalizeTagList(parsed.tags),
    };
  } catch {
    return null;
  }
}

function writeDraftToSession(userId, handId, revision, draft) {
  if (typeof window === 'undefined' || !userId || !handId) return;
  try {
    window.sessionStorage.setItem(
      getDraftStorageKey(userId, handId, revision),
      JSON.stringify({
        notes: typeof draft.notes === 'string' ? draft.notes : '',
        status: REVIEW_STATUS_LABELS[draft.status] ? draft.status : 'saved',
        tags: normalizeTagList(draft.tags),
        savedAt: Date.now(),
      }),
    );
  } catch {
    /* ignore quota/private mode */
  }
}

function clearDraftFromSession(userId, handId, revision) {
  if (typeof window === 'undefined' || !userId || !handId) return;
  try {
    window.sessionStorage.removeItem(getDraftStorageKey(userId, handId, revision));
  } catch {
    /* ignore */
  }
}

function getReviewMeta(hand) {
  const raw = hand?.review || hand?.hand_data?.review || {};
  const status = REVIEW_STATUS_LABELS[raw.status] ? raw.status : 'saved';
  const analysisState = raw.analysisState === 'analyzed' ? 'analyzed' : 'not_analyzed';
  const revision = Number.isInteger(Number(raw.revision)) && Number(raw.revision) >= 1 ? Number(raw.revision) : 1;
  return {
    status,
    notes: typeof raw.notes === 'string' ? raw.notes : '',
    tags: normalizeTagList(raw.tags || hand?.tags || []),
    revision,
    updatedAt: raw.updatedAt || hand?.created_at || null,
    analysisState,
    analyzedAt: analysisState === 'analyzed' ? (raw.analyzedAt || null) : null,
    lastAuditSummary: analysisState === 'analyzed' ? (raw.lastAuditSummary || null) : null,
  };
}

function getBoards(hand) {
  const hd = hand?.hand_data || {};
  if (Array.isArray(hd.boards) && hd.boards.length > 0) {
    return hd.boards;
  }
  if (Array.isArray(hd.communityCards) && hd.communityCards.length > 0) {
    return [{ index: 1, label: 'Board 1', cards: hd.communityCards }];
  }
  return [];
}

function getStreets(hand) {
  const hd = hand?.hand_data || {};
  if (Array.isArray(hd.streets)) return hd.streets;
  if (hd.streets && typeof hd.streets === 'object') {
    return Object.entries(hd.streets)
      .filter(([, st]) => (Array.isArray(st?.actions) && st.actions.length > 0) || (Array.isArray(st?.cards) && st.cards.length > 0))
      .map(([name, st]) => ({
        name,
        cards: Array.isArray(st?.cards) ? st.cards : [],
        actions: Array.isArray(st?.actions) ? st.actions : [],
      }));
  }
  return [];
}

function getHeroPlayer(hand) {
  const players = Array.isArray(hand?.hand_data?.players) ? hand.hand_data.players : [];
  return players.find((p) => p?.isHero) || players[0] || null;
}

function getHeroCards(hand) {
  const hero = getHeroPlayer(hand);
  if (Array.isArray(hero?.holeCards) && hero.holeCards.length > 0) return hero.holeCards;
  if (Array.isArray(hand?.hand_data?.heroCards) && hand.hand_data.heroCards.length > 0) {
    return hand.hand_data.heroCards;
  }
  return [];
}

function getGameFormat(hand) {
  const hd = hand?.hand_data || {};
  const raw = String(hd.format || hd.gameFormat || '').trim().toLowerCase();
  if (raw === 'tournament' || raw === 'mtt' || raw === 'sng' || hd.tournamentId || hd.tournament_id) {
    return 'tournament';
  }
  return 'cash';
}

function getVariantInfo(hand, heroCards, boards, streets) {
  const rawVariant = String(hand?.variant || hand?.hand_data?.variant || 'NLH').trim();
  const clean = rawVariant.toLowerCase();
  let label = rawVariant || 'NLH';
  if (heroCards.length === 6 && !clean.includes('6')) label = 'PLO6';
  else if (heroCards.length === 5 && !clean.includes('5')) label = 'PLO5';
  else if (heroCards.length === 4 && (clean === 'nlh' || clean === 'holdem')) label = 'PLO4';

  const isNlh =
    (clean === 'nlh' || clean === 'nlhe' || clean === 'holdem' || clean === 'texas_holdem' || clean === 'no_limit_holdem')
    && heroCards.length <= 2;

  const hd = hand?.hand_data || {};
  const isBombPot = Boolean(hd.bombPot || hd.bomb_pot);
  const hasStraddle = Boolean(
    hd.straddle
    || hd.hasStraddle
    || streets.some((st) => (st.actions || []).some((a) => String(a?.action || '').toLowerCase().includes('straddle'))),
  );
  const isMultiBoard = boards.length > 1;

  return {
    label,
    isNlh,
    isBombPot,
    hasStraddle,
    isMultiBoard,
    honestNotice: isNlh
      ? null
      : `${label} · Manual Review · Hold'em Solver Grading Does Not Apply`,
  };
}

function sliceBoardCardsForStreet(cards, streetName, fallbackCards = []) {
  const list = Array.isArray(cards) ? cards : [];
  if (streetName === 'preflop' || streetName === 'pineapple_discard') return [];
  if (streetName === 'flop') {
    return list.length >= 3 ? list.slice(0, 3) : fallbackCards.slice(0, 3);
  }
  if (streetName === 'turn') {
    return list.length >= 4 ? list.slice(0, 4) : (list.length > 0 ? list.slice(0, 4) : fallbackCards.slice(0, 4));
  }
  if (streetName === 'river') {
    return list.length >= 5 ? list.slice(0, 5) : (list.length > 0 ? list.slice(0, 5) : fallbackCards.slice(0, 5));
  }
  return list.length > 0 ? list : fallbackCards;
}

function buildReplayerSteps(hand, boards, streets) {
  const normalizedBoards = Array.isArray(boards) ? boards : [];
  const primaryCards = Array.isArray(normalizedBoards?.[0]?.cards) ? normalizedBoards[0].cards : [];
  const maxBoardLen = Math.max(
    0,
    ...normalizedBoards.map((b) => (Array.isArray(b?.cards) ? b.cards.length : 0)),
  );
  const hero = getHeroPlayer(hand);
  const bigBlind = Number(hand?.big_blind || 0);
  const smallBlind = Number(hand?.small_blind || 0);
  const potTotal = Number(hand?.pot_total || 0);
  const isBombPot = Boolean(hand?.hand_data?.bombPot || hand?.hand_data?.bomb_pot);
  const heroStartStack = Number(
    hero?.startingStack
    ?? hero?.stack
    ?? hand?.hand_data?.effectiveStack
    ?? (bigBlind > 0 ? bigBlind * 100 : 0),
  );

  const byName = new Map();
  for (const st of streets || []) {
    const key = String(st?.name || '').trim().toLowerCase();
    if (!key) continue;
    byName.set(key, {
      name: key,
      cards: Array.isArray(st.cards) ? st.cards : [],
      actions: Array.isArray(st.actions) ? st.actions : [],
    });
  }

  // Ensure standard streets appear when board cards exist even if action list was compact.
  if (!byName.has('preflop')) {
    byName.set('preflop', { name: 'preflop', cards: [], actions: [] });
  }
  if (maxBoardLen >= 3 && !byName.has('flop')) {
    byName.set('flop', { name: 'flop', cards: primaryCards.slice(0, 3), actions: [] });
  }
  if (maxBoardLen >= 4 && !byName.has('turn')) {
    byName.set('turn', { name: 'turn', cards: primaryCards.slice(3, 4), actions: [] });
  }
  if (maxBoardLen >= 5 && !byName.has('river')) {
    byName.set('river', { name: 'river', cards: primaryCards.slice(4, 5), actions: [] });
  }

  const orderedNames = [
    ...STREET_ORDER.filter((name) => byName.has(name)),
    ...[...byName.keys()].filter((name) => !STREET_ORDER.includes(name)),
  ];

  let runningPot = 0;
  let heroInvested = 0;
  const hasExplicitBlinds = orderedNames.some((name) =>
    (byName.get(name)?.actions || []).some((a) => {
      const verb = String(a?.action || '').toLowerCase();
      return verb === 'sb' || verb === 'bb' || verb === 'ante' || verb === 'post' || verb === 'straddle';
    }),
  );
  let hasRecordedActionAmounts = false;
  let totalNetActionContribution = 0;
  for (const name of orderedNames) {
    for (const action of byName.get(name)?.actions || []) {
      const amt = Number(action?.amount || 0);
      if (Number.isFinite(amt) && amt > 0) {
        hasRecordedActionAmounts = true;
        const verb = String(action?.action || '').toLowerCase();
        if (verb === 'return') {
          totalNetActionContribution = Math.max(0, totalNetActionContribution - amt);
        } else {
          totalNetActionContribution += amt;
        }
      }
    }
  }
  if (!hasExplicitBlinds) {
    if (isBombPot && hasRecordedActionAmounts && potTotal > totalNetActionContribution) {
      runningPot += potTotal - totalNetActionContribution;
    } else if (!isBombPot && hasRecordedActionAmounts && (smallBlind > 0 || bigBlind > 0)) {
      runningPot += smallBlind + bigBlind;
    }
  }

  let cumulativeBoard = [];

  return orderedNames.map((name, idx) => {
    const st = byName.get(name);
    if (name === 'preflop' || name === 'pineapple_discard') {
      cumulativeBoard = [];
    } else if (name === 'flop') {
      cumulativeBoard = primaryCards.length >= 3
        ? primaryCards.slice(0, 3)
        : st.cards.slice(0, 3);
    } else if (name === 'turn') {
      cumulativeBoard = primaryCards.length >= 4
        ? primaryCards.slice(0, 4)
        : [...cumulativeBoard.slice(0, 3), ...st.cards].slice(0, 4);
    } else if (name === 'river') {
      cumulativeBoard = primaryCards.length >= 5
        ? primaryCards.slice(0, 5)
        : [...cumulativeBoard.slice(0, 4), ...st.cards].slice(0, 5);
    } else if (st.cards.length > 0) {
      cumulativeBoard = [...cumulativeBoard, ...st.cards];
    }

    const potAtStreetStart = runningPot;
    const heroStackAtStreetStart = heroStartStack > 0 ? Math.max(0, heroStartStack - heroInvested) : 0;

    let streetContribution = 0;
    let heroStreetDecisions = 0;
    for (const action of st.actions) {
      const amt = Number(action?.amount || 0);
      if (Number.isFinite(amt) && amt > 0) {
        const verb = String(action?.action || '').toLowerCase();
        if (verb === 'return') {
          streetContribution = Math.max(0, streetContribution - amt);
          if (action?.isHero) heroInvested = Math.max(0, heroInvested - amt);
        } else {
          streetContribution += amt;
          if (action?.isHero) heroInvested += amt;
        }
      }
      if (action?.isHero) {
        const verb = String(action?.action || '').toLowerCase();
        if (!['sb', 'bb', 'ante', 'post', 'straddle', 'return'].includes(verb)) {
          heroStreetDecisions += 1;
        }
      }
    }

    runningPot += streetContribution;
    const isFinal = idx === orderedNames.length - 1;
    const usePotTotalOnFinal = isFinal && potTotal > 0 && (
      runningPot <= 0
      || (!hasExplicitBlinds && (!hasRecordedActionAmounts || isBombPot))
    );
    const displayPot = usePotTotalOnFinal
      ? potTotal
      : (runningPot > 0 ? runningPot : potAtStreetStart);
    const sprBasePot = potAtStreetStart > 0 ? potAtStreetStart : displayPot;
    const spr = heroStackAtStreetStart > 0 && sprBasePot > 0
      ? (heroStackAtStreetStart / sprBasePot).toFixed(2)
      : null;

    const stepBoards = normalizedBoards.map((board, bIdx) => {
      const boardNumber = Number(board?.index || bIdx + 1);
      return {
        index: boardNumber,
        label: board?.label || `Board ${boardNumber}`,
        cards: sliceBoardCardsForStreet(
          board?.cards,
          name,
          bIdx === 0 ? cumulativeBoard : [],
        ),
      };
    });

    return {
      name,
      label: STREET_LABELS[name] || name.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
      boardCards: [...cumulativeBoard],
      boards: stepBoards,
      actions: st.actions,
      runningPot: displayPot,
      spr,
      heroDecisionCount: heroStreetDecisions,
    };
  });
}

function buildSandboxHandoffPayload(hand, heroCards, boards, variantInfo) {
  const hero = getHeroPlayer(hand);
  const primaryBoard = Array.isArray(boards?.[0]?.cards) ? boards[0].cards : [];
  const cleanHeroCards = heroCards.map(toStandardCardCode).filter(Boolean);
  const cleanBoardCards = primaryBoard.map(toStandardCardCode).filter(Boolean);
  const smallBlind = Number(hand?.small_blind || 0);
  const bigBlind = Number(hand?.big_blind || 0);
  const potChips = Number(hand?.pot_total || 0);
  const effectiveStackChips = Number(
    hero?.startingStack
    ?? hero?.stack
    ?? hand?.hand_data?.effectiveStack
    ?? (bigBlind > 0 ? bigBlind * 100 : 100),
  );
  const potBb = bigBlind > 0 && potChips > 0
    ? Math.round((potChips / bigBlind) * 10) / 10
    : potChips;
  const effectiveStackBb = bigBlind > 0 && effectiveStackChips > 0
    ? Math.round((effectiveStackChips / bigBlind) * 10) / 10
    : effectiveStackChips;
  const gameFormat = getGameFormat(hand);

  // Strictly sanitized: ZERO opponent hole cards, ZERO opponent IDs or names.
  return {
    version: 1,
    sourceRowId: String(hand.id),
    sourceHandId: hand?.sourceHandId || hand?.hand_data?.sourceHandId || null,
    heroCards: cleanHeroCards,
    board: cleanBoardCards,
    boardCards: cleanBoardCards,
    heroPosition: String(hero?.position || hand?.hand_data?.heroPosition || 'BTN').toUpperCase(),
    pot: potBb,
    potBase: potBb,
    potBb,
    potChips,
    effectiveStack: effectiveStackBb,
    effectiveStackBb,
    effectiveStackChips,
    smallBlind,
    bigBlind,
    gameFormat,
    format: gameFormat,
    variant: variantInfo.label,
    createdAt: Date.now(),
  };
}

function broadcastSavedHandsSync(payload) {
  if (typeof BroadcastChannel === 'undefined') return;
  try {
    const channel = new BroadcastChannel(SAVED_HANDS_CHANNEL);
    channel.postMessage({ ...payload, tabId: TAB_ID, at: Date.now() });
    channel.close();
  } catch {
    /* ignore restricted browser contexts */
  }
}

function getHandPosition(hand) {
  const hero = getHeroPlayer(hand);
  const raw = String(hero?.position || hand?.hand_data?.heroPosition || '').trim().toUpperCase();
  if (raw === 'HJ' || raw === 'LJ' || raw === 'MP1' || raw === 'MP2') return 'MP';
  if (raw === 'UTG+1' || raw === 'EP') return 'UTG';
  if (raw === 'BU' || raw === 'BUTTON') return 'BTN';
  return raw || '';
}

function getHandPotBb(hand) {
  const bb = Number(hand?.big_blind || 0);
  const pot = Number(hand?.pot_total || 0);
  if (bb > 0 && pot > 0) return Math.round((pot / bb) * 10) / 10;
  const fallback = Number(hand?.hand_data?.potBb || 0);
  return Number.isFinite(fallback) && fallback > 0 ? fallback : 0;
}

function getHandPotType(hand) {
  const meta = getReviewMeta(hand);
  const tagText = meta.tags.join(' ').toLowerCase();
  if (tagText.includes('4-bet') || tagText.includes('4bet')) return '4-Bet';
  if (tagText.includes('3-bet') || tagText.includes('3bet')) return '3-Bet';
  const streets = getStreets(hand);
  const preflop = streets.find((s) => String(s?.name || '').toLowerCase() === 'preflop');
  if (preflop && Array.isArray(preflop.actions)) {
    const raises = preflop.actions.filter((a) => {
      const verb = String(a?.action || '').toLowerCase();
      return verb === 'raise' || verb === 'allin' || verb === 'all_in';
    }).length;
    if (raises >= 3) return '4-Bet';
    if (raises === 2) return '3-Bet';
  }
  return 'SRP';
}

function getHandVariantCategory(hand) {
  const heroCards = getHeroCards(hand);
  const raw = String(hand?.variant || hand?.hand_data?.variant || 'NLH').toLowerCase();
  if (raw.includes('plo') || raw.includes('omaha') || heroCards.length >= 4) return 'PLO';
  return 'NLH';
}

function buildReplayerArenaProps(hand, activeStep, heroCards, variantInfo) {
  const hero = getHeroPlayer(hand);
  const bb = Number(hand?.big_blind || 0);
  const cleanHeroCards = heroCards.map(toStandardCardCode).filter(Boolean);
  const cleanBoard = (activeStep?.boardCards || []).map(toStandardCardCode).filter(Boolean);
  const rawPos = String(hero?.position || hand?.hand_data?.heroPosition || 'BTN').toUpperCase();
  const heroPosition = ['UTG', 'MP', 'CO', 'BTN', 'SB', 'BB'].includes(rawPos) ? rawPos : 'BTN';

  const heroStackRaw = Number(hero?.startingStack ?? hero?.stack ?? hand?.hand_data?.effectiveStack ?? (bb > 0 ? bb * 100 : 100));
  const heroStack = bb > 0 && heroStackRaw > 0
    ? Math.max(1, Math.round((heroStackRaw / bb) * 10) / 10)
    : Math.max(1, Math.round(heroStackRaw || 100));

  const potRaw = Number(activeStep?.runningPot ?? hand?.pot_total ?? 0);
  const pot = bb > 0 && potRaw > 0
    ? Math.max(0, Math.round((potRaw / bb) * 10) / 10)
    : Math.max(0, Math.round(potRaw * 10) / 10);

  const playersList = Array.isArray(hand?.hand_data?.players) ? hand.hand_data.players : [];
  const opponents = playersList.filter((p) => p && !p.isHero).slice(0, 5);
  const villains = opponents.length > 0
    ? opponents.map((p, idx) => {
      const oppStackRaw = Number(p?.startingStack ?? p?.stack ?? (bb > 0 ? bb * 100 : 100));
      const oppStack = bb > 0 && oppStackRaw > 0
        ? Math.max(1, Math.round((oppStackRaw / bb) * 10) / 10)
        : Math.max(1, Math.round(oppStackRaw || 100));
      const oppPos = String(p?.position || `V${idx + 1}`).toUpperCase();
      return {
        id: idx,
        position: oppPos,
        stack: oppStack,
      };
    })
    : [{ id: 0, position: heroPosition === 'BB' ? 'BTN' : 'BB', stack: heroStack }];

  // Only reveal villain hole cards when explicitly shown at showdown; never leak hidden cards.
  const villainHoleCards = {};
  opponents.forEach((p, idx) => {
    if (p?.showedCards === true && p?.cardsVisibility !== 'hidden' && Array.isArray(p?.holeCards) && p.holeCards.length >= 2) {
      const shown = p.holeCards.map(toStandardCardCode).filter(Boolean);
      if (shown.length >= 2) {
        villainHoleCards[`villain_${idx}`] = shown;
      }
    }
  });

  const stepName = String(activeStep?.name || 'preflop').toLowerCase();
  const street = ['preflop', 'flop', 'turn', 'river'].includes(stepName) ? stepName : 'flop';
  const vLabel = String(variantInfo?.label || 'NLH').toLowerCase();
  const variant = vLabel.includes('plo6') ? 'plo6' : vLabel.includes('plo5') ? 'plo5' : vLabel.includes('plo') ? 'plo4' : 'nlh';

  return {
    heroCards: cleanHeroCards,
    communityCards: cleanBoard,
    pot,
    heroPosition,
    heroStack,
    villains,
    villainHoleCards,
    street,
    variant,
  };
}

async function fetchJsonWithTimeout(url, options = {}, timeoutMs = REQUEST_TIMEOUT_MS) {
  const controller = new AbortController();
  const externalSignal = options.signal;
  const onExternalAbort = () => controller.abort();
  if (externalSignal) {
    if (externalSignal.aborted) controller.abort();
    else externalSignal.addEventListener('abort', onExternalAbort, { once: true });
  }
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    const body = await res.json().catch(() => null);
    return { ok: res.ok, status: res.status, body };
  } finally {
    window.clearTimeout(timer);
    if (externalSignal) externalSignal.removeEventListener('abort', onExternalAbort);
  }
}

export default function PersonalAssistantReviewPage() {
  const router = useRouter();
  const { user, initializing: authInitializing } = useAvatar();
  const [showMenu, setShowMenu] = useState(false);
  const closeMenu = useCallback(() => setShowMenu(false), []);
  useModalHistory(showMenu, closeMenu);
  const menuConfig = getMenuConfig('personal-assistant', user, {}, {});

  const [hands, setHands] = useState([]);
  const [nextCursor, setNextCursor] = useState(null);
  const [totalCount, setTotalCount] = useState(null);
  const [unreviewedCount, setUnreviewedCount] = useState(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [selectedHandId, setSelectedHandId] = useState('');
  const [loadStatus, setLoadStatus] = useState('loading'); // loading | ready | error | signed_out
  const [loadError, setLoadError] = useState('');
  const [missingRequestedId, setMissingRequestedId] = useState('');

  // Queue filters & search
  const [filterStatus, setFilterStatus] = useState('');
  const [filterSource, setFilterSource] = useState('');
  const [filterFormat, setFilterFormat] = useState('');
  const [filterTag, setFilterTag] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');

  // Smart Filter Chips (client-side refinement over loaded queue)
  const [chipPosition, setChipPosition] = useState('All');
  const [chipPotType, setChipPotType] = useState('All');
  const [chipBigPotOnly, setChipBigPotOnly] = useState(false);
  const [chipVariant, setChipVariant] = useState('All');

  // 1-Tap Illustrative Sample Hand preview for empty / signed-out states
  const [sampleHandActive, setSampleHandActive] = useState(false);
  const [sampleStreetIdx, setSampleStreetIdx] = useState(1);

  // Post-session Suggested Hands To Review + Bulk Club Arena Import
  const [suggestedLoading, setSuggestedLoading] = useState(false);
  const [suggestedRestricted, setSuggestedRestricted] = useState(false);
  const [suggestedNotice, setSuggestedNotice] = useState('');
  const [suggestedHands, setSuggestedHands] = useState([]);
  const [totalUnsavedCount, setTotalUnsavedCount] = useState(0);
  const [savingSuggestedId, setSavingSuggestedId] = useState('');
  const [suggestedError, setSuggestedError] = useState('');
  const [importingArena, setImportingArena] = useState(false);
  const [importStatusMessage, setImportStatusMessage] = useState('');
  const [importError, setImportError] = useState('');

  // Replayer state
  const [activeStreetIdx, setActiveStreetIdx] = useState(0);
  const streetTabRefs = useRef([]);

  // Editor state for the selected hand
  const [draftNotes, setDraftNotes] = useState('');
  const [draftStatus, setDraftStatus] = useState('saved');
  const [draftTags, setDraftTags] = useState([]);
  const [customTagInput, setCustomTagInput] = useState('');
  const [draftRevision, setDraftRevision] = useState(1);
  const [draftRestored, setDraftRestored] = useState(false);
  const [saveState, setSaveState] = useState('idle'); // idle | saving | saved | error | interrupted | conflict
  const [saveError, setSaveError] = useState('');
  const [conflictServerHand, setConflictServerHand] = useState(null);

  // Analysis flow state (strictly distinct from Saved status)
  const [analysisStatus, setAnalysisStatus] = useState('idle'); // idle | loading | ready | restricted | error
  const [analysisResult, setAnalysisResult] = useState(null);
  const [analysisError, setAnalysisError] = useState('');

  // Share & Export feedback
  const [shareFeedback, setShareFeedback] = useState('');
  const [exportingFormat, setExportingFormat] = useState('');
  const [exportError, setExportError] = useState('');

  // Native <dialog> Safe Deletion + 5-second Undo Delete countdown toast
  const deleteDialogRef = useRef(null);
  const [deleteDialogHand, setDeleteDialogHand] = useState(null);
  const [pendingDelete, setPendingDelete] = useState(null); // { hand, ownerUserId, ownerToken, sourceHandId, secondsLeft, index }
  const deleteTimerRef = useRef(null);
  const deleteTickRef = useRef(null);
  const pendingDeleteRef = useRef(null);
  pendingDeleteRef.current = pendingDelete;
  const commitServerDeleteRef = useRef(null);

  const activeUserIdRef = useRef(user?.id || null);
  activeUserIdRef.current = user?.id || null;
  const prevUserIdRef = useRef(user?.id || null);
  const draftOwnerUserIdRef = useRef(null);
  const draftHandIdRef = useRef('');
  const draftSourceRevRef = useRef(1);
  const draftBaselineRef = useRef({ notes: '', status: 'saved', tags: [] });
  const loadGenRef = useRef(0);
  const saveAbortRef = useRef(null);
  const analysisAbortRef = useRef(null);
  const exportAbortRef = useRef(null);
  const importAbortRef = useRef(null);
  const autoImportAttemptedRef = useRef(false);
  const lastVisibilityRefreshRef = useRef(0);
  const selectedHandIdRef = useRef('');
  selectedHandIdRef.current = selectedHandId;

  const applyUnreviewedDelta = useCallback((previousStatus, nextStatus) => {
    const wasUnreviewed = previousStatus === 'saved';
    const isNowUnreviewed = nextStatus === 'saved';
    if (wasUnreviewed === isNowUnreviewed) return;
    setUnreviewedCount((prev) => (
      prev !== null ? Math.max(0, prev + (isNowUnreviewed ? 1 : -1)) : null
    ));
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedQuery(searchInput.trim());
    }, 280);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  const requestedQueryHandId = useMemo(() => {
    const raw = router?.query?.hand;
    const val = Array.isArray(raw) ? raw[0] : raw;
    return typeof val === 'string' ? val.trim() : '';
  }, [router?.query?.hand]);

  const signInHref = useMemo(() => {
    const rawAsPath = typeof router?.asPath === 'string' && router.asPath.startsWith('/')
      ? router.asPath
      : requestedQueryHandId
        ? `/hub/personal-assistant/review?hand=${encodeURIComponent(requestedQueryHandId)}`
        : '/hub/personal-assistant/review';
    return `/auth/login?redirect=${encodeURIComponent(rawAsPath)}`;
  }, [router?.asPath, requestedQueryHandId]);

  const hasSmartFilters = Boolean(
    chipPosition !== 'All' || chipPotType !== 'All' || chipBigPotOnly || chipVariant !== 'All',
  );

  const displayedHands = useMemo(() => {
    if (!hasSmartFilters) return hands;
    return hands.filter((hand) => {
      if (chipPosition !== 'All' && getHandPosition(hand) !== chipPosition) return false;
      if (chipPotType !== 'All' && getHandPotType(hand) !== chipPotType) return false;
      if (chipBigPotOnly && getHandPotBb(hand) < 40) return false;
      if (chipVariant !== 'All' && getHandVariantCategory(hand) !== chipVariant) return false;
      return true;
    });
  }, [hands, hasSmartFilters, chipPosition, chipPotType, chipBigPotOnly, chipVariant]);

  const selectedHand = useMemo(
    () => displayedHands.find((h) => String(h.id) === String(selectedHandId))
      || hands.find((h) => String(h.id) === String(selectedHandId))
      || null,
    [displayedHands, hands, selectedHandId],
  );

  const hasActiveFilters = Boolean(
    filterStatus || filterSource || filterFormat || filterTag || debouncedQuery || hasSmartFilters,
  );

  const buildFilterQueryParams = useCallback((cursor = '') => {
    const params = new URLSearchParams();
    params.set('limit', String(PAGE_SIZE));
    if (cursor) params.set('cursor', cursor);
    if (filterStatus) params.set('status', filterStatus);
    if (filterSource) params.set('source', filterSource);
    if (filterFormat) params.set('format', filterFormat);
    if (filterTag) params.set('tag', filterTag);
    if (debouncedQuery) params.set('q', debouncedQuery);
    return params.toString();
  }, [filterStatus, filterSource, filterFormat, filterTag, debouncedQuery]);

  const syncEditorFromHand = useCallback((hand, { preserveLocalDraft = true } = {}) => {
    const meta = getReviewMeta(hand);
    const uid = activeUserIdRef.current;
    const restored = preserveLocalDraft && hand?.id && uid
      ? readDraftFromSession(uid, hand.id, meta.revision)
      : null;
    const hasMeaningfulDraft = Boolean(
      restored
      && (
        restored.notes !== meta.notes
        || restored.status !== meta.status
        || !tagsEqual(restored.tags, meta.tags)
      ),
    );

    draftOwnerUserIdRef.current = uid || null;
    draftHandIdRef.current = hand?.id ? String(hand.id) : '';
    draftSourceRevRef.current = meta.revision;
    draftBaselineRef.current = {
      notes: meta.notes,
      status: meta.status,
      tags: meta.tags,
    };

    if (hasMeaningfulDraft) {
      setDraftNotes(restored.notes);
      setDraftStatus(restored.status);
      setDraftTags(restored.tags);
      setDraftRestored(true);
    } else {
      setDraftNotes(meta.notes);
      setDraftStatus(meta.status);
      setDraftTags(meta.tags);
      setDraftRestored(false);
    }
    setCustomTagInput('');
    setDraftRevision(meta.revision);
    setSaveState('idle');
    setSaveError('');
    setConflictServerHand(null);
    setAnalysisStatus('idle');
    setAnalysisResult(null);
    setAnalysisError('');
    setShareFeedback('');
    setActiveStreetIdx(0);
  }, []);

  const loadSuggestedHands = useCallback(async () => {
    if (authInitializing || !user?.id) {
      setSuggestedHands([]);
      setTotalUnsavedCount(0);
      setSuggestedRestricted(false);
      setSuggestedNotice('');
      setSuggestedLoading(false);
      return;
    }

    const expectedUserId = user.id;
    setSuggestedLoading(true);
    setSuggestedError('');
    try {
      const token = await getFreshAccessToken();
      if (activeUserIdRef.current !== expectedUserId || !token) return;
      const res = await fetchJsonWithTimeout('/api/poker/saved-hands?suggested=1', {
        method: 'GET',
        cache: 'no-store',
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      });
      if (activeUserIdRef.current !== expectedUserId) return;
      if (!res.ok || !res.body?.success) {
        setSuggestedHands([]);
        setTotalUnsavedCount(0);
        return;
      }
      if (res.body.activePlayRestricted) {
        setSuggestedRestricted(true);
        setSuggestedNotice(
          res.body.message || 'Suggested Hands Appear After You Leave Your Active Table.',
        );
        setSuggestedHands([]);
        setTotalUnsavedCount(0);
        return;
      }
      setSuggestedRestricted(false);
      setSuggestedNotice('');
      const nextSuggested = Array.isArray(res.body.suggested) ? res.body.suggested.slice(0, 5) : [];
      setSuggestedHands(nextSuggested);
      const serverUnsaved = Number(res.body.totalUnsavedCount);
      setTotalUnsavedCount(
        Number.isFinite(serverUnsaved) && serverUnsaved >= 0
          ? Math.trunc(serverUnsaved)
          : nextSuggested.length,
      );
    } catch {
      if (activeUserIdRef.current === expectedUserId) {
        setSuggestedHands([]);
        setTotalUnsavedCount(0);
      }
    } finally {
      if (activeUserIdRef.current === expectedUserId) {
        setSuggestedLoading(false);
      }
    }
  }, [authInitializing, user?.id]);

  const loadSavedHands = useCallback(async ({ preferHandId = '', silent = false } = {}) => {
    const gen = ++loadGenRef.current;
    setLoadingMore(false);
    if (authInitializing) return;
    if (!user?.id) {
      setHands([]);
      setNextCursor(null);
      setTotalCount(null);
      setUnreviewedCount(null);
      setSelectedHandId('');
      setLoadStatus('signed_out');
      setLoadError('');
      return;
    }

    const expectedUserId = user.id;
    if (!silent) {
      setLoadStatus('loading');
      setLoadError('');
      setMissingRequestedId('');
    }

    try {
      const token = await getFreshAccessToken();
      if (gen !== loadGenRef.current || activeUserIdRef.current !== expectedUserId) return;
      if (!token) {
        setLoadStatus('signed_out');
        return;
      }

      const headers = { Authorization: `Bearer ${token}`, Accept: 'application/json' };
      const targetId = preferHandId || selectedHandIdRef.current || requestedQueryHandId;
      const queryStr = buildFilterQueryParams();

      const listPromise = fetchJsonWithTimeout(`/api/poker/saved-hands?${queryStr}`, {
        method: 'GET',
        cache: 'no-store',
        headers,
      });

      const shouldFetchDirect = Boolean(targetId && !hasActiveFilters);
      const directPromise = shouldFetchDirect
        ? fetchJsonWithTimeout(`/api/poker/saved-hands?id=${encodeURIComponent(targetId)}`, {
            method: 'GET',
            cache: 'no-store',
            headers,
          })
        : Promise.resolve(null);

      const [listRes, directRes] = await Promise.all([listPromise, directPromise]);
      if (gen !== loadGenRef.current || activeUserIdRef.current !== expectedUserId) return;

      if (listRes.status === 401 || directRes?.status === 401) {
        setHands([]);
        setNextCursor(null);
        setTotalCount(null);
        setUnreviewedCount(null);
        setSelectedHandId('');
        setLoadError('');
        setLoadStatus('signed_out');
        return;
      }

      if (!listRes.ok || !listRes.body?.success || !Array.isArray(listRes.body.hands)) {
        if (!silent) {
          setLoadStatus('error');
          setLoadError(listRes.body?.error || 'Could Not Load Your Saved Hands. Please Retry.');
        }
        return;
      }

      let loadedHands = listRes.body.hands;
      const activePendingDelete = pendingDeleteRef.current?.ownerUserId === expectedUserId
        ? pendingDeleteRef.current
        : null;
      if (activePendingDelete?.hand?.id) {
        const hidingId = String(activePendingDelete.hand.id);
        loadedHands = loadedHands.filter((row) => String(row.id) !== hidingId);
      }

      if (directRes && directRes.ok && directRes.body?.success && directRes.body?.hand) {
        const directRow = directRes.body.hand;
        if (
          String(directRow.id) !== String(activePendingDelete?.hand?.id || '')
          && !loadedHands.some((row) => String(row.id) === String(directRow.id))
        ) {
          loadedHands = [directRow, ...loadedHands];
        }
      }

      setHands(loadedHands);
      setNextCursor(listRes.body.nextCursor || null);
      setTotalCount(
        listRes.body.countsComplete !== false && Number.isFinite(listRes.body.totalCount)
          ? listRes.body.totalCount
          : null,
      );
      setUnreviewedCount(
        listRes.body.countsComplete !== false && Number.isFinite(listRes.body.unreviewedCount)
          ? listRes.body.unreviewedCount
          : null,
      );
      setLoadStatus('ready');

      if (silent && selectedHandIdRef.current) {
        const stillExists = loadedHands.find((row) => String(row.id) === String(selectedHandIdRef.current));
        if (stillExists) return;
      }

      if (targetId) {
        const matched = loadedHands.find((row) => String(row.id) === String(targetId));
        if (matched) {
          setSelectedHandId(matched.id);
          syncEditorFromHand(matched);
          return;
        }
        if (!hasActiveFilters && requestedQueryHandId && targetId === requestedQueryHandId) {
          setMissingRequestedId(targetId);
        }
      }

      if (loadedHands.length > 0) {
        const first = loadedHands[0];
        setSelectedHandId(first.id);
        syncEditorFromHand(first);
      } else {
        setSelectedHandId('');
      }
    } catch (err) {
      if (gen !== loadGenRef.current || activeUserIdRef.current !== expectedUserId) return;
      if (!silent) {
        setLoadStatus('error');
        setLoadError(err?.name === 'AbortError'
          ? 'Loading Timed Out. Check Your Connection And Retry.'
          : 'Could Not Load Your Saved Hands. Please Retry.');
      }
    }
  }, [
    authInitializing,
    user?.id,
    requestedQueryHandId,
    buildFilterQueryParams,
    hasActiveFilters,
    syncEditorFromHand,
  ]);

  const handleLoadMore = useCallback(async () => {
    if (!nextCursor || loadingMore || !user?.id) return;
    const expectedUserId = user.id;
    const gen = loadGenRef.current;
    setLoadingMore(true);
    setLoadError('');
    try {
      const token = await getFreshAccessToken();
      if (gen !== loadGenRef.current || activeUserIdRef.current !== expectedUserId) return;
      if (!token) {
        setLoadStatus('signed_out');
        return;
      }
      const queryStr = buildFilterQueryParams(nextCursor);
      const res = await fetchJsonWithTimeout(`/api/poker/saved-hands?${queryStr}`, {
        method: 'GET',
        cache: 'no-store',
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      });
      if (gen !== loadGenRef.current || activeUserIdRef.current !== expectedUserId) return;
      if (res.status === 401) {
        setHands([]);
        setNextCursor(null);
        setTotalCount(null);
        setUnreviewedCount(null);
        setSelectedHandId('');
        setLoadError('');
        setLoadStatus('signed_out');
        return;
      }
      if (!res.ok || !res.body?.success || !Array.isArray(res.body.hands)) {
        setLoadError(res.body?.error || 'Could Not Load More Saved Hands. Please Retry.');
        return;
      }
      const hidingId = pendingDeleteRef.current?.ownerUserId === expectedUserId
        ? String(pendingDeleteRef.current?.hand?.id || '')
        : '';
      const incoming = res.body.hands.filter((row) => String(row.id) !== hidingId);
      setHands((prev) => {
        const seen = new Set(prev.map((row) => String(row.id)));
        const merged = [...prev];
        for (const row of incoming) {
          if (!seen.has(String(row.id))) {
            seen.add(String(row.id));
            merged.push(row);
          }
        }
        return merged;
      });
      setNextCursor(res.body.nextCursor || null);
      if (!selectedHandIdRef.current && incoming.length > 0) {
        setSelectedHandId(incoming[0].id);
        syncEditorFromHand(incoming[0]);
      }
    } catch (err) {
      if (gen === loadGenRef.current && activeUserIdRef.current === expectedUserId) {
        setLoadError(
          err?.name === 'AbortError'
            ? 'Loading More Hands Timed Out. Check Your Connection And Retry.'
            : 'Could Not Load More Saved Hands. Please Retry.',
        );
      }
    } finally {
      if (gen === loadGenRef.current && activeUserIdRef.current === expectedUserId) {
        setLoadingMore(false);
      }
    }
  }, [nextCursor, loadingMore, user?.id, buildFilterQueryParams, syncEditorFromHand]);

  // Synchronously flush pending deletes and reset all user-scoped state on account switch BEFORE any draft effect runs.
  useEffect(() => {
    const currentUserId = user?.id || null;
    if (prevUserIdRef.current === currentUserId) return;
    prevUserIdRef.current = currentUserId;

    if (deleteTimerRef.current) {
      window.clearTimeout(deleteTimerRef.current);
      deleteTimerRef.current = null;
    }
    if (deleteTickRef.current) {
      window.clearInterval(deleteTickRef.current);
      deleteTickRef.current = null;
    }
    const dialog = deleteDialogRef.current;
    if (dialog?.open) {
      try {
        dialog.close('cancel');
      } catch {
        /* ignore */
      }
    }
    setDeleteDialogHand(null);

    const priorPending = pendingDeleteRef.current;
    pendingDeleteRef.current = null;
    setPendingDelete(null);
    if (priorPending && typeof commitServerDeleteRef.current === 'function') {
      commitServerDeleteRef.current(priorPending, { keepalive: true });
    }

    saveAbortRef.current?.abort?.();
    analysisAbortRef.current?.abort?.();
    exportAbortRef.current?.abort?.();
    exportAbortRef.current = null;
    importAbortRef.current?.abort?.();
    importAbortRef.current = null;
    autoImportAttemptedRef.current = false;
    setExportingFormat('');
    setImportingArena(false);
    setImportStatusMessage('');
    setImportError('');
    setTotalUnsavedCount(0);

    draftOwnerUserIdRef.current = null;
    draftHandIdRef.current = '';
    draftSourceRevRef.current = 1;
    draftBaselineRef.current = { notes: '', status: 'saved', tags: [] };

    setHands([]);
    setNextCursor(null);
    setTotalCount(null);
    setUnreviewedCount(null);
    setSelectedHandId('');
    setMissingRequestedId('');
    setLoadError('');
    setSuggestedHands([]);
    setSuggestedRestricted(false);
    setSuggestedNotice('');
    setSuggestedError('');
    setDraftNotes('');
    setDraftStatus('saved');
    setDraftTags([]);
    setCustomTagInput('');
    setDraftRevision(1);
    setDraftRestored(false);
    setSaveState('idle');
    setSaveError('');
    setConflictServerHand(null);
    setAnalysisStatus('idle');
    setAnalysisResult(null);
    setAnalysisError('');
    setShareFeedback('');
    setExportError('');
  }, [user?.id]);

  useEffect(() => {
    if (router?.isReady === false) return;
    loadSavedHands();
  }, [router?.isReady, loadSavedHands]);

  useEffect(() => {
    if (router?.isReady === false) return;
    loadSuggestedHands();
  }, [router?.isReady, loadSuggestedHands]);

  // Instant Cross-Tab Sync via BroadcastChannel + throttled document visibilitychange
  useEffect(() => {
    if (typeof window === 'undefined' || !user?.id) return undefined;

    let channel = null;
    if (typeof BroadcastChannel !== 'undefined') {
      try {
        channel = new BroadcastChannel(SAVED_HANDS_CHANNEL);
        channel.onmessage = (event) => {
          const msg = event?.data;
          if (!msg || msg.tabId === TAB_ID) return;
          const msgType = msg.type;
          if (msgType === 'saved-hand-updated' || msgType === 'saved-hand-deleted') {
            loadSavedHands({ silent: true });
            loadSuggestedHands();
          }
        };
      } catch {
        channel = null;
      }
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState !== 'visible') return;
      const now = Date.now();
      if (now - lastVisibilityRefreshRef.current < VISIBILITY_REFRESH_THROTTLE_MS) return;
      lastVisibilityRefreshRef.current = now;
      loadSavedHands({ silent: true });
      loadSuggestedHands();
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (channel) {
        try { channel.close(); } catch { /* ignore */ }
      }
    };
  }, [user?.id, loadSavedHands, loadSuggestedHands]);

  // Cleanup aborts and flush any confirmed pending delete on unmount
  useEffect(() => () => {
    saveAbortRef.current?.abort?.();
    analysisAbortRef.current?.abort?.();
    exportAbortRef.current?.abort?.();
    exportAbortRef.current = null;
    importAbortRef.current?.abort?.();
    importAbortRef.current = null;
    if (deleteTimerRef.current) {
      window.clearTimeout(deleteTimerRef.current);
      deleteTimerRef.current = null;
    }
    if (deleteTickRef.current) {
      window.clearInterval(deleteTickRef.current);
      deleteTickRef.current = null;
    }
    const pending = pendingDeleteRef.current;
    pendingDeleteRef.current = null;
    if (pending && typeof commitServerDeleteRef.current === 'function') {
      commitServerDeleteRef.current(pending, { keepalive: true });
    }
  }, []);

  // Offline-safe note/status/tags draft persistence in sessionStorage (strictly pinned to owner, hand, and source revision)
  useEffect(() => {
    const draftOwner = draftOwnerUserIdRef.current;
    const draftHandId = draftHandIdRef.current;
    const draftSourceRev = draftSourceRevRef.current;
    if (
      !selectedHand?.id
      || !user?.id
      || !draftOwner
      || draftOwner !== user.id
      || String(draftHandId) !== String(selectedHand.id)
      || !Number.isInteger(draftSourceRev)
      || draftSourceRev < 1
    ) {
      return;
    }
    const baseline = draftBaselineRef.current;
    const dirty =
      draftNotes !== baseline.notes
      || draftStatus !== baseline.status
      || !tagsEqual(draftTags, baseline.tags);
    if (dirty) {
      writeDraftToSession(draftOwner, draftHandId, draftSourceRev, {
        notes: draftNotes,
        status: draftStatus,
        tags: draftTags,
      });
    } else {
      clearDraftFromSession(draftOwner, draftHandId, draftSourceRev);
    }
  }, [selectedHand, user?.id, draftNotes, draftStatus, draftTags]);

  const handleSelectHand = useCallback((hand) => {
    if (!hand?.id) return;
    saveAbortRef.current?.abort?.();
    analysisAbortRef.current?.abort?.();
    setSelectedHandId(hand.id);
    setMissingRequestedId('');
    syncEditorFromHand(hand);
    if (typeof router?.replace === 'function') {
      router.replace(
        { pathname: '/hub/personal-assistant/review', query: { hand: hand.id } },
        undefined,
        { shallow: true },
      );
    }
  }, [router, syncEditorFromHand]);

  const applyServerHand = useCallback((serverHand, { previousRevision = null } = {}) => {
    if (!serverHand?.id) return;
    const uid = activeUserIdRef.current;
    const meta = getReviewMeta(serverHand);
    const priorSourceRev = draftSourceRevRef.current;
    if (uid) {
      clearDraftFromSession(uid, serverHand.id, meta.revision);
      if (previousRevision !== null && previousRevision !== meta.revision) {
        clearDraftFromSession(uid, serverHand.id, previousRevision);
      }
      if (priorSourceRev && priorSourceRev !== meta.revision) {
        clearDraftFromSession(uid, serverHand.id, priorSourceRev);
      }
    }
    draftOwnerUserIdRef.current = uid || null;
    draftHandIdRef.current = String(serverHand.id);
    draftSourceRevRef.current = meta.revision;
    draftBaselineRef.current = {
      notes: meta.notes,
      status: meta.status,
      tags: meta.tags,
    };
    setHands((prev) => prev.map((row) => (String(row.id) === String(serverHand.id) ? serverHand : row)));
    setDraftNotes(meta.notes);
    setDraftStatus(meta.status);
    setDraftTags(meta.tags);
    setDraftRevision(meta.revision);
    setDraftRestored(false);
    setConflictServerHand(null);
  }, []);

  const handleToggleTag = useCallback((tagLabel) => {
    const clean = sanitizeTagValue(tagLabel);
    if (!clean) return;
    setDraftTags((prev) => {
      const exists = prev.some((t) => t.toLowerCase() === clean.toLowerCase());
      if (exists) {
        return prev.filter((t) => t.toLowerCase() !== clean.toLowerCase());
      }
      if (prev.length >= MAX_TAGS) return prev;
      return [...prev, clean];
    });
  }, []);

  const handleAddCustomTag = useCallback(() => {
    const clean = sanitizeTagValue(customTagInput);
    if (!clean) return;
    setDraftTags((prev) => {
      if (prev.length >= MAX_TAGS) return prev;
      if (prev.some((t) => t.toLowerCase() === clean.toLowerCase())) return prev;
      return [...prev, clean];
    });
    setCustomTagInput('');
  }, [customTagInput]);

  const submitReviewUpdate = useCallback(async ({ overrideRevision = null, reconcileBeforeWrite = false } = {}) => {
    if (!selectedHand?.id || !user?.id) return;
    if (saveState === 'saving') return;

    const targetHandId = selectedHand.id;
    const expectedUserId = user.id;
    const previousStatus = getReviewMeta(selectedHand).status;
    const desiredNotes = draftNotes;
    const desiredStatus = draftStatus;
    const desiredTags = normalizeTagList(draftTags);
    const expectedRevision = overrideRevision ?? draftRevision;

    saveAbortRef.current?.abort?.();
    const controller = new AbortController();
    saveAbortRef.current = controller;

    setSaveState('saving');
    setSaveError('');

    try {
      const token = await getFreshAccessToken();
      if (controller.signal.aborted || activeUserIdRef.current !== expectedUserId) return;
      if (!token) {
        setSaveState('error');
        setSaveError('Your Session Expired. Sign In Again To Save Changes.');
        return;
      }
      const headers = {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      };

      // Durable readback before retrying an interrupted save.
      if (reconcileBeforeWrite) {
        const readback = await fetchJsonWithTimeout(
          `/api/poker/saved-hands?id=${encodeURIComponent(targetHandId)}`,
          { method: 'GET', cache: 'no-store', headers, signal: controller.signal },
        );
        if (controller.signal.aborted || activeUserIdRef.current !== expectedUserId) return;
        if (!readback.ok || !readback.body?.success || !readback.body?.hand) {
          setSaveState('interrupted');
          setSaveError('Could Not Confirm Whether Your Last Save Committed. Retry When Connected.');
          return;
        }
        const serverHand = readback.body.hand;
        const serverMeta = getReviewMeta(serverHand);
        if (
          serverMeta.notes === desiredNotes
          && serverMeta.status === desiredStatus
          && tagsEqual(serverMeta.tags, desiredTags)
        ) {
          applyUnreviewedDelta(previousStatus, serverMeta.status);
          applyServerHand(serverHand, { previousRevision: expectedRevision });
          setSaveState('saved');
          return;
        }
        if (serverMeta.revision !== expectedRevision) {
          setHands((prev) => prev.map((row) => (String(row.id) === String(serverHand.id) ? serverHand : row)));
          setConflictServerHand(serverHand);
          setSaveState('conflict');
          setSaveError('This Hand Changed Elsewhere Before Retry. Choose Whether To Reload Or Overwrite.');
          return;
        }
      }

      const patchRes = await fetchJsonWithTimeout('/api/poker/saved-hands', {
        method: 'PATCH',
        headers,
        signal: controller.signal,
        body: JSON.stringify({
          id: targetHandId,
          expectedRevision,
          notes: desiredNotes,
          reviewStatus: desiredStatus,
          tags: desiredTags,
        }),
      });
      if (controller.signal.aborted || activeUserIdRef.current !== expectedUserId) return;

      if (patchRes.status === 409 && patchRes.body?.hand) {
        setHands((prev) => prev.map((row) => (String(row.id) === String(patchRes.body.hand.id) ? patchRes.body.hand : row)));
        setConflictServerHand(patchRes.body.hand);
        setSaveState('conflict');
        setSaveError(patchRes.body.error || 'This Hand Was Updated Elsewhere. Reload Or Overwrite.');
        return;
      }

      if (!patchRes.ok || !patchRes.body?.success || !patchRes.body?.hand) {
        const possiblyCommitted = patchRes.status >= 500 || patchRes.status === 408 || patchRes.status === 429;
        setSaveState(possiblyCommitted ? 'interrupted' : 'error');
        setSaveError(patchRes.body?.error || 'Could Not Save Your Review Changes. Your Draft Is Preserved.');
        return;
      }

      const updatedMeta = getReviewMeta(patchRes.body.hand);
      applyUnreviewedDelta(previousStatus, updatedMeta.status);
      applyServerHand(patchRes.body.hand, { previousRevision: expectedRevision });
      setSaveState('saved');
      broadcastSavedHandsSync({ type: 'saved-hand-updated', savedRowId: targetHandId });
    } catch (err) {
      if (controller.signal.aborted || activeUserIdRef.current !== expectedUserId) return;
      setSaveState('interrupted');
      setSaveError(
        err?.name === 'AbortError'
          ? 'Save Was Interrupted Before Confirmation. Retry Will Verify Server State First.'
          : 'Network Interrupted During Save. Your Draft Is Safe. Retry Will Reconcile First.',
      );
    }
  }, [selectedHand, user?.id, saveState, draftNotes, draftStatus, draftTags, draftRevision, applyServerHand, applyUnreviewedDelta]);

  const handleAnalyzeHand = useCallback(async () => {
    const sourceHandId = selectedHand?.sourceHandId || selectedHand?.hand_data?.sourceHandId;
    if (!sourceHandId || !selectedHand?.id || !user?.id) return;
    if (analysisStatus === 'loading') return;

    const targetHandId = selectedHand.id;
    const expectedUserId = user.id;

    analysisAbortRef.current?.abort?.();
    const controller = new AbortController();
    analysisAbortRef.current = controller;

    setAnalysisStatus('loading');
    setAnalysisError('');

    try {
      const token = await getFreshAccessToken();
      if (controller.signal.aborted || activeUserIdRef.current !== expectedUserId) return;
      if (!token) {
        setAnalysisStatus('error');
        setAnalysisError('Sign In To Analyze This Hand.');
        return;
      }

      const headers = {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      };

      // Active-Table RTA Gate before sending a saved hand into verified solver analysis.
      const gateRes = await fetchJsonWithTimeout('/api/poker/saved-hands?analysisGate=1', {
        method: 'GET',
        cache: 'no-store',
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
        signal: controller.signal,
      });
      if (controller.signal.aborted || activeUserIdRef.current !== expectedUserId) return;

      if (
        gateRes.status === 423
        || gateRes.body?.activePlayRestricted
        || gateRes.body?.code === 'ACTIVE_PLAY_RESTRICTED'
      ) {
        setAnalysisStatus('restricted');
        setAnalysisError(
          gateRes.body?.error
          || gateRes.body?.message
          || 'Active Table Detected. Your Hand Stays Saved Safely, And Verified Solver Analysis Unlocks After You Leave Your Active Table.',
        );
        return;
      }

      if (gateRes.status === 401) {
        setAnalysisStatus('error');
        setAnalysisError('Your Session Expired. Sign In Again To Analyze This Hand.');
        return;
      }

      if (!gateRes.ok || gateRes.body?.success === false) {
        setAnalysisStatus('error');
        setAnalysisError(
          gateRes.body?.error
          || gateRes.body?.message
          || 'Could Not Verify Active Table Status Before Analysis. Please Retry.',
        );
        return;
      }

      const res = await fetchJsonWithTimeout('/api/assistant/leaks/hand-audit', {
        method: 'POST',
        headers,
        signal: controller.signal,
        body: JSON.stringify({ handId: sourceHandId }),
      }, 25000);
      if (controller.signal.aborted || activeUserIdRef.current !== expectedUserId) return;

      if (res.status === 423 || res.body?.code === 'ACTIVE_PLAY_RESTRICTED') {
        setAnalysisStatus('restricted');
        setAnalysisError(
          res.body?.error
          || 'Active Table Detected. Your Hand Stays Saved Safely, And Verified Solver Analysis Unlocks After You Leave Your Active Table.',
        );
        return;
      }

      if (!res.ok || !res.body?.success) {
        setAnalysisStatus('error');
        setAnalysisError(res.body?.error || 'Hand Analysis Could Not Complete Right Now.');
        return;
      }

      setAnalysisResult(res.body);
      setAnalysisStatus('ready');

      // Record explicit analyzed receipt separately from Saved review status.
      if (controller.signal.aborted || activeUserIdRef.current !== expectedUserId) return;
      const currentMeta = getReviewMeta(selectedHand);
      const receiptRes = await fetchJsonWithTimeout('/api/poker/saved-hands', {
        method: 'PATCH',
        headers,
        signal: controller.signal,
        body: JSON.stringify({
          id: targetHandId,
          expectedRevision: currentMeta.revision,
          analysisState: 'analyzed',
          lastAuditSummary: {
            solverVerifiedCount: Number(res.body.solverVerifiedCount || 0),
            unpricedCount: Number(res.body.unpricedCount || 0),
            matchedLeaksCount: Array.isArray(res.body.matchedLeaks) ? res.body.matchedLeaks.length : 0,
            strategySupported: res.body.strategySupported !== false,
            declineReason: res.body.declineReason || null,
          },
        }),
      });
      if (controller.signal.aborted || activeUserIdRef.current !== expectedUserId) return;
      if (receiptRes.ok && receiptRes.body?.success && receiptRes.body?.hand) {
        const updatedHand = receiptRes.body.hand;
        const nextMeta = getReviewMeta(updatedHand);
        setHands((prev) => prev.map((row) => (String(row.id) === String(updatedHand.id) ? updatedHand : row)));
        applyUnreviewedDelta(currentMeta.status, nextMeta.status);
        if (String(selectedHandIdRef.current) === String(targetHandId)) {
          setDraftRevision(nextMeta.revision);
          const baseline = draftBaselineRef.current;
          const hasDirtyDraft =
            draftNotes !== baseline.notes
            || draftStatus !== baseline.status
            || !tagsEqual(draftTags, baseline.tags);
          if (!hasDirtyDraft) {
            draftSourceRevRef.current = nextMeta.revision;
            draftBaselineRef.current = {
              notes: nextMeta.notes,
              status: nextMeta.status,
              tags: nextMeta.tags,
            };
          }
        }
        broadcastSavedHandsSync({
          type: 'saved-hand-updated',
          savedRowId: targetHandId,
          sourceHandId,
        });
      }
    } catch {
      if (controller.signal.aborted || activeUserIdRef.current !== expectedUserId) return;
      setAnalysisStatus('error');
      setAnalysisError('Analysis Request Was Interrupted. Please Retry.');
    }
  }, [selectedHand, user?.id, analysisStatus, applyUnreviewedDelta, draftNotes, draftStatus, draftTags]);

  const handleSaveSuggestedHand = useCallback(async (item) => {
    if (!item?.handId || !user?.id || savingSuggestedId) return;
    const expectedUserId = user.id;
    setSavingSuggestedId(item.handId);
    setSuggestedError('');
    try {
      const token = await getFreshAccessToken();
      if (activeUserIdRef.current !== expectedUserId || !token) return;
      const res = await fetchJsonWithTimeout('/api/poker/saved-hands', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          source: 'club-arena',
          handId: item.handId,
        }),
      });
      if (activeUserIdRef.current !== expectedUserId) return;
      if (!res.ok || !res.body?.success || !res.body?.hand) {
        setSuggestedError(res.body?.error || 'Could Not Save Suggested Hand Right Now.');
        return;
      }
      const savedRow = res.body.hand;
      setSuggestedHands((prev) => prev.filter((s) => s.handId !== item.handId));
      setTotalUnsavedCount((prev) => Math.max(0, prev - 1));
      setHands((prev) => {
        if (prev.some((row) => String(row.id) === String(savedRow.id))) return prev;
        return [savedRow, ...prev];
      });
      if (!res.body.alreadySaved) {
        setTotalCount((prev) => (prev !== null && !hasActiveFilters ? prev + 1 : null));
        if (getReviewMeta(savedRow).status === 'saved') {
          setUnreviewedCount((prev) => (prev !== null ? prev + 1 : null));
        }
      }
      setLoadStatus('ready');
      handleSelectHand(savedRow);
      broadcastSavedHandsSync({
        type: 'saved-hand-updated',
        source: 'club-arena',
        handId: item.handId,
        savedRowId: savedRow.id,
      });
    } catch {
      if (activeUserIdRef.current === expectedUserId) {
        setSuggestedError('Could Not Save Suggested Hand. Please Retry.');
      }
    } finally {
      if (activeUserIdRef.current === expectedUserId) {
        setSavingSuggestedId('');
      }
    }
  }, [user?.id, savingSuggestedId, handleSelectHand, hasActiveFilters]);

  const handleImportClubArenaHands = useCallback(async ({ limit = 25, isAuto = false } = {}) => {
    if (!user?.id || importingArena) return;
    const expectedUserId = user.id;
    const safeLimit = Math.max(1, Math.min(50, Math.trunc(Number(limit) || 25)));

    importAbortRef.current?.abort?.();
    const controller = new AbortController();
    importAbortRef.current = controller;

    setImportingArena(true);
    setImportError('');
    if (!isAuto) setImportStatusMessage('');

    try {
      const token = await getFreshAccessToken();
      if (controller.signal.aborted || activeUserIdRef.current !== expectedUserId) return;
      if (!token) {
        if (!isAuto) setImportError('Sign In Again To Import Your Club Arena Hands.');
        return;
      }

      const res = await fetchJsonWithTimeout('/api/poker/saved-hands', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        signal: controller.signal,
        body: JSON.stringify({
          action: 'import_club_arena',
          limit: safeLimit,
        }),
      }, 25000);
      if (controller.signal.aborted || activeUserIdRef.current !== expectedUserId) return;

      if (!res.ok || !res.body?.success) {
        if (!isAuto) {
          setImportError(res.body?.error || 'Could Not Import Club Arena Hands Right Now. Please Retry.');
        }
        return;
      }

      const importedCount = Number(res.body.importedCount || 0);
      const alreadySavedCount = Number(res.body.alreadySavedCount || 0);
      const remainingCount = Math.max(0, Number(res.body.remainingCount || 0));
      const importedHands = Array.isArray(res.body.hands) ? res.body.hands : [];

      setTotalUnsavedCount(remainingCount);

      if (importedCount > 0) {
        const handWord = importedCount === 1 ? 'Hand' : 'Hands';
        const moreText = remainingCount > 0 ? ` (${remainingCount} More Available)` : '';
        setImportStatusMessage(`Imported ${importedCount} Club Arena ${handWord} Into Review My Play${moreText}`);
        broadcastSavedHandsSync({ type: 'saved-hand-updated', source: 'club-arena' });
        await Promise.all([
          loadSavedHands({ preferHandId: importedHands[0]?.id || selectedHandIdRef.current }),
          loadSuggestedHands(),
        ]);
      } else {
        if (!isAuto) {
          setImportStatusMessage(
            alreadySavedCount > 0
              ? 'All Recent Club Arena Hands Are Already Imported Into Review My Play.'
              : 'No Completed Club Arena Hands Found To Import Yet.',
          );
        }
        await loadSuggestedHands();
      }
    } catch (err) {
      if (controller.signal.aborted || activeUserIdRef.current !== expectedUserId) return;
      if (!isAuto) {
        setImportError(
          err?.name === 'AbortError'
            ? 'Importing Club Arena Hands Timed Out. Please Retry.'
            : 'Could Not Import Club Arena Hands Right Now. Please Retry.',
        );
      }
    } finally {
      if (importAbortRef.current === controller) {
        importAbortRef.current = null;
      }
      if (activeUserIdRef.current === expectedUserId) {
        setImportingArena(false);
      }
    }
  }, [user?.id, importingArena, loadSavedHands, loadSuggestedHands]);

  // Automatic initial sync when a signed-in user has past Club Arena hands but zero saved hands yet.
  useEffect(() => {
    if (
      !user?.id
      || loadStatus !== 'ready'
      || hands.length !== 0
      || hasActiveFilters
      || suggestedLoading
      || suggestedRestricted
      || suggestedHands.length === 0
      || importingArena
      || autoImportAttemptedRef.current
    ) {
      return;
    }
    autoImportAttemptedRef.current = true;
    handleImportClubArenaHands({ limit: 25, isAuto: true });
  }, [
    user?.id,
    loadStatus,
    hands.length,
    hasActiveFilters,
    suggestedLoading,
    suggestedRestricted,
    suggestedHands.length,
    importingArena,
    handleImportClubArenaHands,
  ]);

  const handleExploreInSandbox = useCallback(() => {
    if (!selectedHand?.id) return;
    const heroCards = getHeroCards(selectedHand);
    const boards = getBoards(selectedHand);
    const streets = getStreets(selectedHand);
    const variantInfo = getVariantInfo(selectedHand, heroCards, boards, streets);
    const payload = buildSandboxHandoffPayload(selectedHand, heroCards, boards, variantInfo);
    try {
      window.sessionStorage.setItem(SANDBOX_HANDOFF_KEY, JSON.stringify(payload));
    } catch {
      /* sandbox also falls back to ?fromReview=<id> fetch if storage is unavailable */
    }
    recordPaMilestone('review_opened_on_table', { surface: 'review', variant: variantInfo.label });
    router.push(`/hub/personal-assistant/sandbox?fromReview=${encodeURIComponent(selectedHand.id)}`);
  }, [selectedHand, router]);

  const handleLoadSampleHand = useCallback(() => {
    setSampleHandActive(true);
    setSampleStreetIdx(1);
    recordPaMilestone('sample_hand_loaded', { surface: 'review' });
  }, []);

  const handleExploreSampleInSandbox = useCallback(() => {
    const heroCards = getHeroCards(ILLUSTRATIVE_SAMPLE_HAND);
    const boards = getBoards(ILLUSTRATIVE_SAMPLE_HAND);
    const streets = getStreets(ILLUSTRATIVE_SAMPLE_HAND);
    const variantInfo = getVariantInfo(ILLUSTRATIVE_SAMPLE_HAND, heroCards, boards, streets);
    const payload = buildSandboxHandoffPayload(ILLUSTRATIVE_SAMPLE_HAND, heroCards, boards, variantInfo);
    try {
      window.sessionStorage.setItem(SANDBOX_HANDOFF_KEY, JSON.stringify(payload));
    } catch {
      /* ignore restricted storage */
    }
    recordPaMilestone('review_opened_on_table', { surface: 'review', source: 'sample' });
    router.push(`/hub/personal-assistant/sandbox?fromReview=${encodeURIComponent(ILLUSTRATIVE_SAMPLE_HAND.id)}`);
  }, [router]);

  const handleShareAnonymized = useCallback(async () => {
    if (!selectedHand) return;
    try {
      const origin = typeof window !== 'undefined' ? window.location.origin : '';
      const anonymized = anonymizeHandForShare(selectedHand, { includeNotes: false, origin });
      const rawUrl = anonymized?.shareUrl || anonymized?.url || anonymized?.sharePath || '';
      const fullUrl = rawUrl && rawUrl.startsWith('/') && origin
        ? `${origin}${rawUrl}`
        : rawUrl;
      const summary = anonymized?.summaryText || anonymized?.summary || anonymized?.text || '';
      const clipText = summary
        ? (fullUrl && !summary.includes(fullUrl) ? `${summary}\n${fullUrl}` : summary)
        : (fullUrl || 'Shared Anonymized Hand From Smarter.Poker');

      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(clipText);
        setShareFeedback('Anonymized Hand Copied To Clipboard.');
      } else {
        setShareFeedback('Anonymized Hand Ready To Share.');
      }
    } catch {
      setShareFeedback('Could Not Copy Share Link. Please Retry.');
    }
  }, [selectedHand]);

  const handleExportHands = useCallback(async (format) => {
    if (!user?.id || exportingFormat || exportAbortRef.current) return;
    const expectedUserId = user.id;
    const controller = new AbortController();
    exportAbortRef.current = controller;
    const ext = format === 'json' ? 'json' : 'txt';
    setExportingFormat(format);
    setExportError('');
    try {
      const token = await getFreshAccessToken();
      if (controller.signal.aborted || activeUserIdRef.current !== expectedUserId) return;
      if (!token) {
        setExportError('Sign In Again To Export Your Saved Hands.');
        return;
      }
      const result = await collectSavedHandsExport(async (cursor, signal) => {
        if (activeUserIdRef.current !== expectedUserId) {
          controller.abort();
          throw new Error('Export Account Changed');
        }
        const suffix = cursor ? `&cursor=${encodeURIComponent(cursor)}` : '';
        const res = await fetchJsonWithTimeout(`/api/poker/saved-hands?export=${encodeURIComponent(format)}&chunk=1${suffix}`, {
          method: 'GET',
          cache: 'no-store',
          signal,
          headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
        });
        if (!res.ok || !res.body?.success) {
          throw new Error(res.body?.error || 'Export Was Interrupted. No Partial File Was Downloaded.');
        }
        return res.body;
      }, { format, signal: controller.signal });
      if (controller.signal.aborted || activeUserIdRef.current !== expectedUserId) return;
      const blob = new Blob(result.parts, { type: result.mimeType });
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = `smarter-poker-saved-hands.${ext}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    } catch (err) {
      if (activeUserIdRef.current !== expectedUserId || exportAbortRef.current !== controller) return;
      setExportError(controller.signal.aborted
        ? 'Export Cancelled. No Partial File Was Downloaded.'
        : err?.message || 'Export Was Interrupted. No Partial File Was Downloaded.');
    } finally {
      if (exportAbortRef.current === controller) {
        exportAbortRef.current = null;
        setExportingFormat('');
      }
    }
  }, [user?.id, exportingFormat]);

  // Execute actual server DELETE after 5-second non-destructive Undo window expires (or on account switch / unmount flush)
  const commitServerDelete = useCallback(async (snapshot, { keepalive = false } = {}) => {
    const hand = snapshot?.hand;
    const ownerUserId = snapshot?.ownerUserId;
    const sourceHandId = snapshot?.sourceHandId || hand?.sourceHandId || hand?.hand_data?.sourceHandId || null;
    if (!hand?.id || !ownerUserId) return;

    const restoreHandOnFailure = (errorMessage) => {
      if (keepalive || activeUserIdRef.current !== ownerUserId) return;
      setHands((prev) => {
        if (prev.some((row) => String(row.id) === String(hand.id))) return prev;
        const next = [...prev];
        next.splice(Math.min(snapshot.index ?? 0, next.length), 0, hand);
        return next;
      });
      if (!selectedHandIdRef.current) {
        setSelectedHandId(hand.id);
        syncEditorFromHand(hand);
      }
      setLoadError(errorMessage);
    };

    try {
      let token = snapshot.ownerToken || null;
      if (!token && !keepalive && activeUserIdRef.current === ownerUserId) {
        token = await getFreshAccessToken();
        if (activeUserIdRef.current !== ownerUserId) return;
      }
      if (!token) {
        restoreHandOnFailure('Your Session Expired While Deleting. Hand Restored To Your Queue.');
        return;
      }

      const deleteUrl = `/api/poker/saved-hands?id=${encodeURIComponent(hand.id)}`;
      const deleteHeaders = { Authorization: `Bearer ${token}`, Accept: 'application/json' };

      if (keepalive) {
        clearDraftFromSession(ownerUserId, hand.id, getReviewMeta(hand).revision);
        try {
          const res = await fetch(deleteUrl, {
            method: 'DELETE',
            keepalive: true,
            headers: deleteHeaders,
          });
          if (res.ok || res.status === 404) {
            broadcastSavedHandsSync({
              type: 'saved-hand-deleted',
              savedRowId: hand.id,
              sourceHandId,
              tabId: TAB_ID,
            });
          }
        } catch {
          /* keepalive flush best-effort on unmount or account switch */
        }
        return;
      }

      const res = await fetchJsonWithTimeout(deleteUrl, {
        method: 'DELETE',
        headers: deleteHeaders,
      });
      if (!res.ok && res.status !== 404) {
        restoreHandOnFailure(res.body?.error || 'Could Not Delete Hand. Restored To Your Queue.');
        return;
      }
      clearDraftFromSession(ownerUserId, hand.id, getReviewMeta(hand).revision);
      if (activeUserIdRef.current === ownerUserId) {
        setTotalCount((prev) => (prev !== null ? Math.max(0, prev - 1) : null));
        if (getReviewMeta(hand).status === 'saved') {
          setUnreviewedCount((prev) => (prev !== null ? Math.max(0, prev - 1) : null));
        }
      }
      broadcastSavedHandsSync({
        type: 'saved-hand-deleted',
        savedRowId: hand.id,
        sourceHandId,
        tabId: TAB_ID,
      });
    } catch {
      restoreHandOnFailure('Network Interrupted While Deleting. Hand Restored To Your Queue.');
    }
  }, [syncEditorFromHand]);
  commitServerDeleteRef.current = commitServerDelete;

  const startUndoableDelete = useCallback((handToDelete) => {
    const ownerUserId = activeUserIdRef.current;
    if (!handToDelete?.id || !ownerUserId) return;
    // Flush any prior pending delete immediately so it is never lost
    if (pendingDeleteRef.current) {
      if (deleteTimerRef.current) {
        window.clearTimeout(deleteTimerRef.current);
        deleteTimerRef.current = null;
      }
      if (deleteTickRef.current) {
        window.clearInterval(deleteTickRef.current);
        deleteTickRef.current = null;
      }
      const prior = pendingDeleteRef.current;
      pendingDeleteRef.current = null;
      commitServerDelete(prior);
    }

    const idx = hands.findIndex((row) => String(row.id) === String(handToDelete.id));
    const remaining = hands.filter((row) => String(row.id) !== String(handToDelete.id));
    setHands(remaining);
    if (String(selectedHandId) === String(handToDelete.id)) {
      if (remaining.length > 0) {
        const nextHand = remaining[Math.min(Math.max(idx, 0), remaining.length - 1)];
        setSelectedHandId(nextHand.id);
        syncEditorFromHand(nextHand);
      } else {
        setSelectedHandId('');
      }
    }

    const capturedToken = getAccessToken() || null;
    const sourceHandId = handToDelete?.sourceHandId || handToDelete?.hand_data?.sourceHandId || null;
    const snapshot = {
      hand: handToDelete,
      ownerUserId,
      ownerToken: capturedToken,
      sourceHandId,
      index: Math.max(idx, 0),
      secondsLeft: DELETE_UNDO_SECONDS,
    };
    pendingDeleteRef.current = snapshot;
    setPendingDelete(snapshot);

    getFreshAccessToken()
      .then((freshToken) => {
        if (
          freshToken
          && activeUserIdRef.current === ownerUserId
          && pendingDeleteRef.current?.hand?.id === handToDelete.id
          && pendingDeleteRef.current?.ownerUserId === ownerUserId
        ) {
          pendingDeleteRef.current = { ...pendingDeleteRef.current, ownerToken: freshToken };
        }
      })
      .catch(() => { /* keep synchronously captured token */ });

    deleteTickRef.current = window.setInterval(() => {
      setPendingDelete((curr) => (curr && curr.secondsLeft > 1
        ? { ...curr, secondsLeft: curr.secondsLeft - 1 }
        : curr));
    }, 1000);

    deleteTimerRef.current = window.setTimeout(() => {
      if (deleteTickRef.current) window.clearInterval(deleteTickRef.current);
      deleteTickRef.current = null;
      deleteTimerRef.current = null;
      const latest = pendingDeleteRef.current;
      pendingDeleteRef.current = null;
      setPendingDelete(null);
      if (latest) commitServerDelete(latest);
    }, DELETE_UNDO_SECONDS * 1000);
  }, [hands, selectedHandId, syncEditorFromHand, commitServerDelete]);

  const handleUndoDelete = useCallback(() => {
    const snapshot = pendingDeleteRef.current;
    if (!snapshot || snapshot.ownerUserId !== activeUserIdRef.current) return;
    if (deleteTimerRef.current) window.clearTimeout(deleteTimerRef.current);
    if (deleteTickRef.current) window.clearInterval(deleteTickRef.current);
    deleteTimerRef.current = null;
    deleteTickRef.current = null;
    pendingDeleteRef.current = null;
    setPendingDelete(null);
    setHands((prev) => {
      if (prev.some((row) => String(row.id) === String(snapshot.hand.id))) return prev;
      const next = [...prev];
      next.splice(Math.min(snapshot.index, next.length), 0, snapshot.hand);
      return next;
    });
    setSelectedHandId(snapshot.hand.id);
    syncEditorFromHand(snapshot.hand);
  }, [syncEditorFromHand]);

  const handleOpenDeleteDialog = useCallback(() => {
    if (!selectedHand) return;
    const dialog = deleteDialogRef.current;
    if (!dialog || typeof dialog.showModal !== 'function' || !dialog.isConnected || dialog.open) {
      setDeleteDialogHand(null);
      return;
    }
    setDeleteDialogHand(selectedHand);
    try {
      dialog.showModal();
    } catch {
      setDeleteDialogHand(null);
    }
  }, [selectedHand]);

  const handleDeleteDialogClose = useCallback(() => {
    const dialog = deleteDialogRef.current;
    const outcome = dialog?.returnValue || '';
    if (dialog) {
      dialog.returnValue = '';
    }
    const target = deleteDialogHand;
    setDeleteDialogHand(null);
    if (outcome === 'confirm' && target && activeUserIdRef.current) {
      startUndoableDelete(target);
    }
  }, [deleteDialogHand, startUndoableDelete]);

  const selectedMeta = selectedHand ? getReviewMeta(selectedHand) : null;
  const selectedBoards = selectedHand ? getBoards(selectedHand) : [];
  const selectedStreets = selectedHand ? getStreets(selectedHand) : [];
  const selectedHeroCards = selectedHand ? getHeroCards(selectedHand) : [];
  const selectedVariantInfo = selectedHand
    ? getVariantInfo(selectedHand, selectedHeroCards, selectedBoards, selectedStreets)
    : null;
  const replayerSteps = useMemo(
    () => (selectedHand ? buildReplayerSteps(selectedHand, selectedBoards, selectedStreets) : []),
    [selectedHand, selectedBoards, selectedStreets],
  );
  const clampedStreetIdx = replayerSteps.length > 0
    ? Math.min(activeStreetIdx, replayerSteps.length - 1)
    : 0;
  const activeStep = replayerSteps[clampedStreetIdx] || null;
  const replayerArenaProps = useMemo(
    () => (selectedHand && activeStep
      ? buildReplayerArenaProps(selectedHand, activeStep, selectedHeroCards, selectedVariantInfo)
      : null),
    [selectedHand, activeStep, selectedHeroCards, selectedVariantInfo],
  );

  const sampleReplayerSteps = useMemo(() => {
    if (!sampleHandActive) return [];
    return buildReplayerSteps(
      ILLUSTRATIVE_SAMPLE_HAND,
      getBoards(ILLUSTRATIVE_SAMPLE_HAND),
      getStreets(ILLUSTRATIVE_SAMPLE_HAND),
    );
  }, [sampleHandActive]);
  const clampedSampleStreetIdx = sampleReplayerSteps.length > 0
    ? Math.min(sampleStreetIdx, sampleReplayerSteps.length - 1)
    : 0;
  const activeSampleStep = sampleReplayerSteps[clampedSampleStreetIdx] || null;
  const sampleArenaProps = useMemo(() => {
    if (!sampleHandActive || !activeSampleStep) return null;
    const heroCards = getHeroCards(ILLUSTRATIVE_SAMPLE_HAND);
    const boards = getBoards(ILLUSTRATIVE_SAMPLE_HAND);
    const streets = getStreets(ILLUSTRATIVE_SAMPLE_HAND);
    const variantInfo = getVariantInfo(ILLUSTRATIVE_SAMPLE_HAND, heroCards, boards, streets);
    return buildReplayerArenaProps(ILLUSTRATIVE_SAMPLE_HAND, activeSampleStep, heroCards, variantInfo);
  }, [sampleHandActive, activeSampleStep]);

  const selectedPlayers = Array.isArray(selectedHand?.hand_data?.players) ? selectedHand.hand_data.players : [];
  const selectedWinnersByBoard = Array.isArray(selectedHand?.hand_data?.winnersByBoard)
    ? selectedHand.hand_data.winnersByBoard
    : [];
  const selectedWinners = Array.isArray(selectedHand?.hand_data?.winners)
    ? selectedHand.hand_data.winners
    : [];
  const selectedSourceHandId = selectedHand?.sourceHandId || selectedHand?.hand_data?.sourceHandId || null;

  const isDirty = selectedMeta
    ? (
      draftNotes !== selectedMeta.notes
      || draftStatus !== selectedMeta.status
      || !tagsEqual(draftTags, selectedMeta.tags)
    )
    : false;

  const handleStreetTabKeyDown = useCallback((event, idx) => {
    if (replayerSteps.length <= 1) return;
    let nextIdx = null;
    if (event.key === 'ArrowRight') nextIdx = (idx + 1) % replayerSteps.length;
    else if (event.key === 'ArrowLeft') nextIdx = (idx - 1 + replayerSteps.length) % replayerSteps.length;
    else if (event.key === 'Home') nextIdx = 0;
    else if (event.key === 'End') nextIdx = replayerSteps.length - 1;
    if (nextIdx === null) return;
    event.preventDefault();
    setActiveStreetIdx(nextIdx);
    streetTabRefs.current[nextIdx]?.focus?.();
  }, [replayerSteps.length]);

  const handleClearFilters = useCallback(() => {
    setFilterStatus('');
    setFilterSource('');
    setFilterFormat('');
    setFilterTag('');
    setSearchInput('');
    setDebouncedQuery('');
    setChipPosition('All');
    setChipPotType('All');
    setChipBigPotOnly(false);
    setChipVariant('All');
  }, []);

  return (
    <PageTransition disableInitialAnimation>
      <SEOHead
        title="Review My Play - Personal Assistant"
        description="Review Your Saved Club Arena Hands, Step Through Streets, Keep Private Notes, And Launch Verified Hand Analysis Inside Personal Assistant."
        canonical="/hub/personal-assistant/review"
      />
      <PersonalAssistantCopyPolicy />
      <HubPageShell
        className="pa"
        maxWidth={1120}
        header={<UniversalHeader pageDepth={2} onMenuClick={() => setShowMenu(!showMenu)} />}
      >
        <div className={styles.page}>
          <HamburgerMenu
            isOpen={showMenu}
            onClose={closeMenu}
            direction="left"
            theme="pa"
            user={user}
            menuItems={menuConfig.menuItems}
            bottomLinks={menuConfig.bottomLinks}
          />

          <div className={styles.main}>
            <header className={styles.headerRow}>
              <div className={styles.headerCopy}>
                <span className={styles.eyebrow}>Personal Assistant · Saved Hand Study Workstation</span>
                <h1 className={styles.title}>Review My Play</h1>
                <p className={styles.subtitle}>
                  Replay Streets, Tag Key Spots, Keep Private Notes, Explore In Sandbox, And Run Verified Analysis.
                </p>
              </div>
              <div className={styles.headerActions}>
                <Link href="/hub/personal-assistant" className={styles.secondaryBtn}>
                  <ArrowLeft size={15} aria-hidden="true" />
                  Personal Assistant
                </Link>
                {user?.id && (
                  <>
                    <button
                      type="button"
                      className={styles.primaryBtn}
                      data-import-club-arena-btn="true"
                      disabled={importingArena}
                      onClick={() => handleImportClubArenaHands({ limit: 25 })}
                    >
                      <Download size={15} aria-hidden="true" />
                      {importingArena
                        ? 'Importing Arena Hands…'
                        : totalUnsavedCount > 0
                          ? `Import ${Math.min(25, totalUnsavedCount)} Arena ${Math.min(25, totalUnsavedCount) === 1 ? 'Hand' : 'Hands'}`
                          : 'Import Arena Hands'}
                    </button>
                    <button
                      type="button"
                      className={styles.secondaryBtn}
                      data-testid="export-json-btn"
                      disabled={Boolean(exportingFormat)}
                      onClick={() => {
                        recordPaMilestone('study_exported', { format: 'json', surface: 'review' });
                        handleExportHands('json');
                      }}
                    >
                      <Download size={15} aria-hidden="true" />
                      {exportingFormat === 'json' ? 'Exporting…' : 'Export JSON'}
                    </button>
                    <button
                      type="button"
                      className={styles.secondaryBtn}
                      data-testid="export-text-btn"
                      disabled={Boolean(exportingFormat)}
                      onClick={() => {
                        recordPaMilestone('study_exported', { format: 'text', surface: 'review' });
                        handleExportHands('text');
                      }}
                    >
                      <Download size={15} aria-hidden="true" />
                      {exportingFormat === 'text' ? 'Exporting…' : 'Export Text'}
                    </button>
                    {exportingFormat && (
                      <button
                        type="button"
                        className={styles.secondaryBtn}
                        data-testid="cancel-export-btn"
                        onClick={() => exportAbortRef.current?.abort?.()}
                      >
                        Cancel Export
                      </button>
                    )}
                  </>
                )}
                <button
                  type="button"
                  className={styles.secondaryBtn}
                  onClick={() => {
                    loadSavedHands({ preferHandId: selectedHandId || requestedQueryHandId });
                    loadSuggestedHands();
                  }}
                  disabled={loadStatus === 'loading'}
                >
                  <RefreshCw size={15} aria-hidden="true" />
                  Refresh
                </button>
              </div>
            </header>

            {importStatusMessage && (
              <div className={styles.importSuccessBanner} role="status" aria-live="polite" data-testid="import-status-banner">
                <span>{importStatusMessage}</span>
                {totalUnsavedCount > 0 && (
                  <button
                    type="button"
                    className={styles.compactBtn}
                    disabled={importingArena}
                    onClick={() => handleImportClubArenaHands({ limit: 25 })}
                  >
                    {importingArena ? 'Importing…' : `Import Next ${Math.min(25, totalUnsavedCount)}`}
                  </button>
                )}
              </div>
            )}

            {importError && (
              <div className={styles.alertBox} role="alert">
                <span>{importError}</span>
              </div>
            )}

            {exportError && (
              <div className={styles.alertBox} role="alert">
                <span>{exportError}</span>
              </div>
            )}

            {/* Post-Session Suggested Hands To Review */}
            {user?.id && (suggestedRestricted || suggestedHands.length > 0 || suggestedLoading) && (
              <section className={styles.panel} aria-label="Suggested Hands To Review" data-testid="suggested-hands-panel">
                <div className={styles.panelHead}>
                  <h2>
                    <Sparkles size={15} aria-hidden="true" /> Suggested Hands To Review
                  </h2>
                  <div className={styles.panelHeadActions}>
                    <span className={styles.panelCount}>
                      {suggestedRestricted
                        ? 'Active Table Gate'
                        : suggestedLoading
                          ? 'Checking Recent Session…'
                          : totalUnsavedCount > suggestedHands.length
                            ? `${suggestedHands.length} Featured · ${totalUnsavedCount} Unsaved`
                            : `${suggestedHands.length} Notable ${suggestedHands.length === 1 ? 'Hand' : 'Hands'}`}
                    </span>
                    {!suggestedRestricted && suggestedHands.length > 0 && (
                      <button
                        type="button"
                        className={styles.primaryBtn}
                        data-import-club-arena-btn="true"
                        disabled={importingArena}
                        onClick={() => handleImportClubArenaHands({ limit: Math.min(50, Math.max(25, totalUnsavedCount)) })}
                      >
                        <Download size={15} aria-hidden="true" />
                        {importingArena ? 'Importing…' : 'Import All Available'}
                      </button>
                    )}
                  </div>
                </div>

                {suggestedError && (
                  <div className={styles.alertBox} role="alert">
                    <span>{suggestedError}</span>
                  </div>
                )}

                {suggestedRestricted ? (
                  <div className={styles.rtaNotice} role="status" data-testid="suggested-rta-notice">
                    <strong>Active Table Protection</strong>
                    <span>{suggestedNotice || 'Suggested Hands Appear After You Leave Your Active Table.'}</span>
                  </div>
                ) : suggestedHands.length > 0 ? (
                  <div className={styles.suggestedGrid}>
                    {suggestedHands.map((item) => {
                      const heroCards = Array.isArray(item.heroCards) ? item.heroCards : [];
                      const boardCards = Array.isArray(item.board) ? item.board : [];
                      const netBb = Number(item.netBb ?? 0);
                      const isSaving = savingSuggestedId === item.handId;
                      return (
                        <div
                          key={item.handId}
                          className={styles.suggestedCard}
                          onClick={(event) => {
                            if (event.target?.closest?.('a, button')) return;
                            handleSaveSuggestedHand(item);
                          }}
                        >
                          <div className={styles.suggestedTop}>
                            <span>
                              {item.variant || 'NLH'} · {item.heroPosition || 'Hero'}
                            </span>
                            <span className={netBb > 0 ? styles.netPos : netBb < 0 ? styles.netNeg : ''}>
                              {netBb > 0 ? `+${netBb}` : String(netBb)} BB
                            </span>
                          </div>
                          <div className={styles.suggestedMeta}>
                            {item.tableName && <span>{item.tableName}</span>}
                            {item.format && <span>· {item.format === 'tournament' ? 'Tournament' : 'Cash'}</span>}
                            {Number.isFinite(Number(item.potBb)) && <span>· Pot {item.potBb} BB</span>}
                          </div>
                          {(heroCards.length > 0 || boardCards.length > 0) && (
                            <div className={styles.arenaMiniFeltStage} data-suggested-card-stage="true">
                              {heroCards.length > 0 && (
                                <div className={styles.arenaMiniFeltGroup} aria-label="Your Hand">
                                  <span className={styles.arenaMiniFeltLabel}>Your Hand</span>
                                  <div className={styles.arenaCardRow}>
                                    {heroCards.map((c, idx) => (
                                      <ArenaMiniCard
                                        key={`sug-h-${item.handId}-${idx}`}
                                        card={c}
                                        size={heroCards.length >= 5 ? 'sm' : 'md'}
                                        overlapped={idx > 0}
                                        overlapTight={heroCards.length >= 4}
                                      />
                                    ))}
                                  </div>
                                </div>
                              )}
                              {boardCards.length > 0 && (
                                <div className={styles.arenaMiniFeltGroup} aria-label="Board">
                                  <span className={styles.arenaMiniFeltLabel}>Board</span>
                                  <div className={styles.arenaCardRow}>
                                    {boardCards.slice(0, 5).map((c, idx) => (
                                      <ArenaMiniCard
                                        key={`sug-b-${item.handId}-${idx}`}
                                        card={c}
                                        size="sm"
                                      />
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                          {item.reason && <p className={styles.suggestedReason}>{item.reason}</p>}
                          <button
                            type="button"
                            className={styles.primaryBtn}
                            disabled={Boolean(savingSuggestedId) || importingArena}
                            onClick={() => handleSaveSuggestedHand(item)}
                          >
                            {isSaving ? 'Saving…' : 'Save & Review'}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                ) : null}
              </section>
            )}

            {loadStatus === 'loading' && (
              <section className={styles.panel} role="status" aria-live="polite" aria-busy="true">
                <div className={styles.emptyState}>
                  <h2>Loading Saved Hands</h2>
                  <p>Fetching Your Private Saved Hands And Review Notes.</p>
                </div>
              </section>
            )}

            {loadStatus === 'signed_out' && (
              <section className={styles.panel}>
                <div className={styles.emptyState}>
                  <h2>Sign In To Review Your Saved Hands</h2>
                  <p>Your Saved Hands And Private Notes Are Owner-Scoped And Require An Active Account.</p>
                  <div className={styles.actionBar}>
                    <Link href={signInHref} className={styles.primaryBtn} data-testid="review-signin-cta">
                      Sign In
                    </Link>
                    <button
                      type="button"
                      className={styles.secondaryBtn}
                      data-sample-hand-trigger="true"
                      onClick={handleLoadSampleHand}
                    >
                      <FlaskConical size={15} aria-hidden="true" />
                      <span>Load Sample Hand</span>
                    </button>
                  </div>
                </div>
              </section>
            )}

            {loadStatus === 'error' && (
              <section className={styles.panel}>
                <div className={styles.alertBox} role="alert">
                  <strong>Could Not Load Saved Hands</strong>
                  <span>{loadError}</span>
                  <div className={styles.actionBar}>
                    <button type="button" className={styles.primaryBtn} onClick={() => loadSavedHands()}>
                      Retry
                    </button>
                  </div>
                </div>
              </section>
            )}

            {loadStatus === 'ready' && hands.length === 0 && !hasActiveFilters && (
              <section className={styles.panel}>
                <div className={styles.emptyState}>
                  <h2>No Saved Hands Yet</h2>
                  <p>
                    Import Your Past Completed Club Arena Hands Instantly, Tap Log This Hand Inside Club Arena Previous Hands, Or Try A Sample Hand To Explore The Replayer.
                  </p>
                  <div className={styles.actionBar}>
                    <button
                      type="button"
                      className={styles.primaryBtn}
                      data-import-club-arena-btn="true"
                      disabled={importingArena}
                      onClick={() => handleImportClubArenaHands({ limit: 25 })}
                    >
                      <Download size={15} aria-hidden="true" />
                      <span>{importingArena ? 'Importing Arena Hands…' : 'Import Club Arena Hands'}</span>
                    </button>
                    <button
                      type="button"
                      className={styles.secondaryBtn}
                      data-sample-hand-trigger="true"
                      onClick={handleLoadSampleHand}
                    >
                      <FlaskConical size={15} aria-hidden="true" />
                      <span>Load Sample Hand</span>
                    </button>
                    <Link href="/hub/personal-assistant" className={styles.secondaryBtn}>
                      Back To Personal Assistant
                    </Link>
                    <Link href="/hub/personal-assistant/leaks" className={styles.secondaryBtn}>
                      Open My Leaks
                    </Link>
                  </div>
                </div>
              </section>
            )}

            {sampleHandActive && hands.length === 0 && (loadStatus === 'signed_out' || loadStatus === 'ready') && activeSampleStep && (
              <section className={styles.panel} aria-label="Illustrative Sample Hand Replayer" data-sample-hand-preview="true">
                <div className={styles.sampleBanner} role="status">
                  <span>Illustrative Sample Hand (Not Saved To Your Account)</span>
                  <div className={styles.actionBar}>
                    <button
                      type="button"
                      className={styles.primaryBtn}
                      data-sample-explore-sandbox="true"
                      onClick={handleExploreSampleInSandbox}
                    >
                      <FlaskConical size={15} aria-hidden="true" />
                      <span>Explore Sample In Sandbox</span>
                    </button>
                    <button
                      type="button"
                      className={styles.compactBtn}
                      onClick={() => setSampleHandActive(false)}
                    >
                      <span>Close Sample</span>
                    </button>
                  </div>
                </div>

                <div className={styles.replayerBox}>
                  <div className={styles.replayerHead}>
                    <span className={styles.replayerTitle}>Sample Street-By-Street Replayer</span>
                    <div role="tablist" aria-label="Sample Hand Streets" className={styles.streetTablist}>
                      {sampleReplayerSteps.map((step, idx) => {
                        const isActive = idx === clampedSampleStreetIdx;
                        return (
                          <button
                            key={`sample-tab-${step.name}`}
                            type="button"
                            role="tab"
                            aria-selected={isActive}
                            tabIndex={isActive ? 0 : -1}
                            className={`${styles.streetTab} ${isActive ? styles.streetTabActive : ''}`}
                            onClick={() => setSampleStreetIdx(idx)}
                          >
                            <span>{step.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className={styles.replayerStage}>
                    {sampleArenaProps && (
                      <div className={styles.replayerArenaWrap} data-review-arena-table="true">
                        <SandboxPokerTable
                          heroCards={sampleArenaProps.heroCards}
                          communityCards={sampleArenaProps.communityCards}
                          pot={sampleArenaProps.pot}
                          heroPosition={sampleArenaProps.heroPosition}
                          heroStack={sampleArenaProps.heroStack}
                          villains={sampleArenaProps.villains}
                          villainHoleCards={sampleArenaProps.villainHoleCards}
                          street={sampleArenaProps.street}
                          variant={sampleArenaProps.variant}
                          readOnly
                        />
                      </div>
                    )}
                    <div className={styles.replayerMetrics}>
                      <div className={styles.cardsGroup} aria-label={`${activeSampleStep.label} Community Cards`}>
                        <span className={styles.boardLabel}>{activeSampleStep.label} Board:</span>
                        {activeSampleStep.boardCards.length > 0 ? (
                          <div className={styles.arenaCardRow}>
                            {activeSampleStep.boardCards.map((c, cIdx) => (
                              <ArenaMiniCard
                                key={`sample-c-${cIdx}`}
                                card={c}
                                size="md"
                              />
                            ))}
                          </div>
                        ) : (
                          <span className={styles.panelCount}>No Community Cards Dealt</span>
                        )}
                      </div>
                      <div className={styles.replayerMetricGroup}>
                        <span className={styles.replayerMetricChip}>
                          Pot: {formatChips(activeSampleStep.runningPot)}
                        </span>
                        {activeSampleStep.spr && (
                          <span className={styles.replayerMetricChip}>
                            SPR: {activeSampleStep.spr}
                          </span>
                        )}
                      </div>
                    </div>
                    {activeSampleStep.actions.length > 0 && (
                      <ul className={styles.actionList}>
                        {activeSampleStep.actions.map((a, aIdx) => (
                          <li
                            key={`sample-a-${aIdx}`}
                            className={`${styles.actionRow} ${a.isHero ? styles.actionRowHero : ''}`}
                          >
                            <span>
                              {a.position ? `${a.position} · ` : ''}
                              <strong>{a.playerName || (a.isHero ? 'You' : 'Villain')}</strong>
                              {a.isHero ? ' (Hero)' : ''}
                            </span>
                            <span>
                              {formatActionVerb(a.action)}
                              {Number(a.amount) > 0 ? ` ${formatChips(a.amount)}` : ''}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              </section>
            )}

            {loadStatus === 'ready' && (hands.length > 0 || hasActiveFilters) && (
              <>
                {missingRequestedId && (
                  <div className={styles.alertBox} role="status">
                    <span>
                      Requested Hand <code>{missingRequestedId}</code> Was Not Found In Your Saved Hands. Showing Your Latest Saved Hand Instead.
                    </span>
                  </div>
                )}

                {loadError && (
                  <div className={styles.alertBox} role="alert">
                    <span>{loadError}</span>
                  </div>
                )}

                <div className={styles.workspace}>
                  {/* Saved Hands Queue + Filters + Search + Cursor Pagination */}
                  <aside className={styles.panel} aria-label="Saved Hands List">
                    <div className={styles.panelHead}>
                      <h2>Saved Hands</h2>
                      <span className={styles.panelCount}>
                        {totalCount !== null ? `${totalCount} Total` : `${hands.length} Loaded`}
                        {unreviewedCount !== null ? ` · ${unreviewedCount} Unreviewed` : ''}
                      </span>
                    </div>

                    <div className={styles.filterStack} aria-label="Filter Saved Hands">
                      <input
                        type="search"
                        aria-label="Search Saved Hands"
                        className={styles.searchInput}
                        value={searchInput}
                        onChange={(e) => setSearchInput(e.target.value)}
                        placeholder="Search Notes, Cards, Table, Or Tags…"
                      />
                      <div className={styles.filterGrid}>
                        <select
                          aria-label="Filter By Status"
                          className={styles.filterSelect}
                          value={filterStatus}
                          onChange={(e) => setFilterStatus(e.target.value)}
                        >
                          <option value="">All Status</option>
                          <option value="unreviewed">Unreviewed</option>
                          <option value="in_review">In Review</option>
                          <option value="reviewed">Reviewed</option>
                          <option value="analyzed">Analyzed</option>
                        </select>
                        <select
                          aria-label="Filter By Source"
                          className={styles.filterSelect}
                          value={filterSource}
                          onChange={(e) => setFilterSource(e.target.value)}
                        >
                          <option value="">All Sources</option>
                          <option value="club-arena">Club Arena</option>
                          <option value="ai-scan">AI Scan</option>
                          <option value="manual">Manual</option>
                        </select>
                        <select
                          aria-label="Filter By Format"
                          className={styles.filterSelect}
                          value={filterFormat}
                          onChange={(e) => setFilterFormat(e.target.value)}
                        >
                          <option value="">All Formats</option>
                          <option value="cash">Cash</option>
                          <option value="tournament">Tournament</option>
                        </select>
                      </div>
                      <div className={styles.smartFilterGroups} aria-label="Smart Filter Chips" data-smart-filter-chips="true">
                        <div className={styles.smartFilterRow} role="group" aria-label="Position Filter">
                          <span className={styles.smartFilterLabel}>Pos:</span>
                          {SMART_POSITIONS.map((pos) => {
                            const active = chipPosition === pos;
                            return (
                              <button
                                key={`pos-chip-${pos}`}
                                type="button"
                                aria-pressed={active}
                                className={`${styles.smartChipBtn} ${active ? styles.smartChipBtnActive : ''}`}
                                onClick={() => setChipPosition(pos)}
                              >
                                <span>{pos}</span>
                              </button>
                            );
                          })}
                        </div>
                        <div className={styles.smartFilterRow} role="group" aria-label="Pot Type And Size Filter">
                          <span className={styles.smartFilterLabel}>Pot:</span>
                          {SMART_POT_TYPES.map((potType) => {
                            const active = chipPotType === potType;
                            return (
                              <button
                                key={`pot-chip-${potType}`}
                                type="button"
                                aria-pressed={active}
                                className={`${styles.smartChipBtn} ${active ? styles.smartChipBtnActive : ''}`}
                                onClick={() => setChipPotType(potType)}
                              >
                                <span>{potType}</span>
                              </button>
                            );
                          })}
                          <button
                            type="button"
                            aria-pressed={chipBigPotOnly}
                            className={`${styles.smartChipBtn} ${chipBigPotOnly ? styles.smartChipBtnActive : ''}`}
                            onClick={() => setChipBigPotOnly((prev) => !prev)}
                          >
                            <span>40+ BB</span>
                          </button>
                        </div>
                        <div className={styles.smartFilterRow} role="group" aria-label="Variant Filter">
                          <span className={styles.smartFilterLabel}>Game:</span>
                          {SMART_VARIANTS.map((variantOption) => {
                            const active = chipVariant === variantOption;
                            return (
                              <button
                                key={`var-chip-${variantOption}`}
                                type="button"
                                aria-pressed={active}
                                className={`${styles.smartChipBtn} ${active ? styles.smartChipBtnActive : ''}`}
                                onClick={() => setChipVariant(variantOption)}
                              >
                                <span>{variantOption}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                      {hasActiveFilters && (
                        <div className={styles.filterFooterRow}>
                          <span>
                            {filterTag ? `Tag: ${filterTag}` : `${displayedHands.length} Matching`}
                          </span>
                          <button
                            type="button"
                            className={styles.compactBtn}
                            onClick={handleClearFilters}
                          >
                            Clear Filters
                          </button>
                        </div>
                      )}
                    </div>

                    {displayedHands.length === 0 ? (
                      <div className={styles.emptyState}>
                        <h2>{nextCursor ? 'No Matching Hands In This Batch' : 'No Matching Hands'}</h2>
                        <p>{nextCursor
                          ? 'Load More To Search Older Saved Hands.'
                          : 'Try Clearing A Filter Or Searching A Different Term.'}</p>
                        <button type="button" className={styles.secondaryBtn} onClick={handleClearFilters}>
                          Clear Filters
                        </button>
                      </div>
                    ) : (
                      <div className={styles.handList}>
                        {displayedHands.map((hand) => {
                          const meta = getReviewMeta(hand);
                          const isSelected = String(hand.id) === String(selectedHand?.id);
                          const heroNet = Number(hand.hand_data?.heroNet ?? hand.hand_data?.players?.find((p) => p.isHero)?.netResult ?? 0);
                          const rowHeroCards = getHeroCards(hand);
                          const rowBoardCards = getBoards(hand)[0]?.cards || [];
                          return (
                            <button
                              key={hand.id}
                              type="button"
                              className={`${styles.handRow} ${isSelected ? styles.handRowActive : ''}`}
                              aria-current={isSelected ? 'true' : undefined}
                              onClick={() => handleSelectHand(hand)}
                            >
                              <span className={styles.handRowTop}>
                                <span>
                                  {hand.hand_number ? `Hand #${hand.hand_number}` : 'Saved Hand'} · {hand.variant || 'NLH'}
                                </span>
                                <span className={heroNet > 0 ? styles.netPos : heroNet < 0 ? styles.netNeg : ''}>
                                  {formatSignedChips(heroNet)}
                                </span>
                              </span>
                              {(rowHeroCards.length > 0 || rowBoardCards.length > 0) && (
                                <span className={styles.handRowCardsStage}>
                                  {rowHeroCards.length > 0 && (
                                    <span className={styles.handRowCardGroup} aria-label="Your Hand">
                                      <span className={styles.handRowCardLabel}>Your Hand</span>
                                      <span className={styles.arenaCardRow}>
                                        {rowHeroCards.map((c, idx) => (
                                          <ArenaMiniCard
                                            key={`list-h-${hand.id}-${idx}`}
                                            card={c}
                                            size="xs"
                                            overlapped={idx > 0}
                                            overlapTight={rowHeroCards.length >= 4}
                                          />
                                        ))}
                                      </span>
                                    </span>
                                  )}
                                  {rowBoardCards.length > 0 && (
                                    <span className={styles.handRowCardGroup} aria-label="Board">
                                      <span className={styles.handRowCardLabel}>Board</span>
                                      <span className={styles.arenaCardRow}>
                                        {rowBoardCards.slice(0, 5).map((c, idx) => (
                                          <ArenaMiniCard
                                            key={`list-b-${hand.id}-${idx}`}
                                            card={c}
                                            size="xs"
                                          />
                                        ))}
                                      </span>
                                    </span>
                                  )}
                                </span>
                              )}
                              <span className={styles.handRowMeta}>
                                <span>{hand.small_blind}/{hand.big_blind}</span>
                                <span>·</span>
                                <span>Pot {formatChips(hand.pot_total)}</span>
                                <span>·</span>
                                <span>{formatDateStamp(hand.completed_at || hand.created_at)}</span>
                              </span>
                              <span className={styles.badgeRow}>
                                <span className={`${styles.badge} ${meta.status === 'reviewed' ? styles.badgeReviewed : styles.badgeSaved}`}>
                                  {REVIEW_STATUS_LABELS[meta.status]}
                                </span>
                                <span className={`${styles.badge} ${meta.analysisState === 'analyzed' ? styles.badgeAnalyzed : styles.badgeNotAnalyzed}`}>
                                  {meta.analysisState === 'analyzed' ? 'Analyzed' : 'Not Analyzed'}
                                </span>
                                {meta.tags.slice(0, 2).map((tag) => (
                                  <span key={`qtag-${hand.id}-${tag}`} className={styles.badge}>
                                    {tag}
                                  </span>
                                ))}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    )}

                    {nextCursor && (
                      <button
                        type="button"
                        className={`${styles.secondaryBtn} ${styles.loadMoreBtn}`}
                        data-testid="load-more-hands-btn"
                        disabled={loadingMore}
                        onClick={handleLoadMore}
                      >
                        {loadingMore ? 'Loading More…' : 'Load More'}
                      </button>
                    )}
                  </aside>

                  {/* Active Saved Hand Detail & Study Workstation */}
                  {selectedHand && selectedMeta && selectedVariantInfo && (
                    <div className={styles.detailStack}>
                      {/* Overview, Multi-Variant Badges, Action Toolbar & Replayer */}
                      <section className={styles.panel} aria-label="Selected Saved Hand">
                        <div className={styles.panelHead}>
                          <h2>
                            {selectedHand.hand_number ? `Hand #${selectedHand.hand_number}` : 'Saved Hand'}
                            {selectedHand.hand_data?.tableName ? ` · ${selectedHand.hand_data.tableName}` : ''}
                          </h2>
                          <div className={styles.badgeRow}>
                            <span
                              data-testid="review-status-badge"
                              className={`${styles.badge} ${selectedMeta.status === 'reviewed' ? styles.badgeReviewed : styles.badgeSaved}`}
                            >
                              {REVIEW_STATUS_LABELS[selectedMeta.status]}
                            </span>
                            <span
                              data-testid="analysis-status-badge"
                              className={`${styles.badge} ${selectedMeta.analysisState === 'analyzed' ? styles.badgeAnalyzed : styles.badgeNotAnalyzed}`}
                            >
                              {selectedMeta.analysisState === 'analyzed' ? 'Analyzed' : 'Not Analyzed'}
                            </span>
                            {selectedVariantInfo.isBombPot && (
                              <span className={`${styles.badge} ${styles.badgeSpecial}`}>Bomb Pot</span>
                            )}
                            {selectedVariantInfo.hasStraddle && (
                              <span className={`${styles.badge} ${styles.badgeSpecial}`}>Straddle</span>
                            )}
                            {selectedVariantInfo.isMultiBoard && (
                              <span className={`${styles.badge} ${styles.badgeSpecial}`}>
                                Run It {selectedBoards.length === 2 ? 'Twice' : `${selectedBoards.length} Times`}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Honest Multi-Variant Notice */}
                        {selectedVariantInfo.honestNotice && (
                          <div className={styles.variantNotice} role="status" data-testid="variant-honest-notice">
                            {selectedVariantInfo.honestNotice}
                          </div>
                        )}

                        {/* Quick Workstation Toolbar: Explore In Sandbox, Privacy-Safe Share, Safe Delete */}
                        <div className={styles.actionBar}>
                          <button
                            type="button"
                            className={styles.primaryBtn}
                            data-testid="explore-in-sandbox-btn"
                            onClick={handleExploreInSandbox}
                          >
                            <FlaskConical size={15} aria-hidden="true" />
                            Explore In Sandbox
                          </button>
                          <button
                            type="button"
                            className={styles.secondaryBtn}
                            data-testid="share-anonymized-btn"
                            onClick={handleShareAnonymized}
                          >
                            <Share2 size={15} aria-hidden="true" />
                            Share Anonymized Hand
                          </button>
                          <button
                            type="button"
                            className={styles.dangerBtn}
                            data-testid="delete-hand-btn"
                            onClick={handleOpenDeleteDialog}
                          >
                            <Trash2 size={15} aria-hidden="true" />
                            Delete Hand
                          </button>
                          {shareFeedback && (
                            <span className={styles.shareFeedback} role="status" aria-live="polite">
                              {shareFeedback}
                            </span>
                          )}
                        </div>

                        <div className={styles.summaryGrid}>
                          <div className={styles.statBox}>
                            <span className={styles.statLabel}>Variant</span>
                            <span className={styles.statValue}>{selectedVariantInfo.label}</span>
                          </div>
                          <div className={styles.statBox}>
                            <span className={styles.statLabel}>Stakes</span>
                            <span className={styles.statValue}>
                              {selectedHand.small_blind}/{selectedHand.big_blind}
                            </span>
                          </div>
                          <div className={styles.statBox}>
                            <span className={styles.statLabel}>Total Pot</span>
                            <span className={styles.statValue}>{formatChips(selectedHand.pot_total)}</span>
                          </div>
                          <div className={styles.statBox}>
                            <span className={styles.statLabel}>Your Result</span>
                            <span
                              className={`${styles.statValue} ${
                                Number(selectedHand.hand_data?.heroNet ?? 0) > 0
                                  ? styles.netPos
                                  : Number(selectedHand.hand_data?.heroNet ?? 0) < 0
                                    ? styles.netNeg
                                    : ''
                              }`}
                            >
                              {formatSignedChips(selectedHand.hand_data?.heroNet ?? 0)}
                            </span>
                          </div>
                        </div>

                        {/* First-Class Hero Hole Cards Strip (2, 4, 5, or 6 cards cleanly) */}
                        {selectedHeroCards.length > 0 && (
                          <div className={styles.heroCardsStrip} aria-label="Your Hole Cards">
                            <span className={styles.heroCardsLabel}>
                              Your Hole Cards ({selectedHeroCards.length}-Card {selectedVariantInfo.label})
                            </span>
                            <div className={styles.arenaCardRow}>
                              {selectedHeroCards.map((c, cIdx) => (
                                <ArenaMiniCard
                                  key={`hero-card-${cIdx}`}
                                  card={c}
                                  size={selectedHeroCards.length >= 5 ? 'md' : 'lg'}
                                  overlapped={cIdx > 0 && selectedHeroCards.length >= 4}
                                  overlapTight={selectedHeroCards.length >= 5}
                                />
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Interactive Street-By-Street Visual Replayer */}
                        {replayerSteps.length > 0 && activeStep && (
                          <div className={styles.replayerBox} data-testid="street-replayer">
                            <div className={styles.replayerHead}>
                              <span className={styles.replayerTitle}>Street-By-Street Replayer</span>
                              <div
                                role="tablist"
                                aria-label="Hand Streets"
                                className={styles.streetTablist}
                              >
                                {replayerSteps.map((step, idx) => {
                                  const isActive = idx === clampedStreetIdx;
                                  return (
                                    <button
                                      key={`tab-${step.name}`}
                                      ref={(el) => { streetTabRefs.current[idx] = el; }}
                                      id={`street-tab-${step.name}`}
                                      type="button"
                                      role="tab"
                                      aria-selected={isActive}
                                      aria-controls={`street-panel-${step.name}`}
                                      tabIndex={isActive ? 0 : -1}
                                      className={`${styles.streetTab} ${isActive ? styles.streetTabActive : ''}`}
                                      onClick={() => setActiveStreetIdx(idx)}
                                      onKeyDown={(e) => handleStreetTabKeyDown(e, idx)}
                                    >
                                      {step.label}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>

                            <div
                              id={`street-panel-${activeStep.name}`}
                              role="tabpanel"
                              aria-labelledby={`street-tab-${activeStep.name}`}
                              className={styles.replayerStage}
                            >
                              {replayerArenaProps && (
                                <div className={styles.replayerArenaWrap} data-review-arena-table="true">
                                  <SandboxPokerTable
                                    heroCards={replayerArenaProps.heroCards}
                                    communityCards={replayerArenaProps.communityCards}
                                    pot={replayerArenaProps.pot}
                                    heroPosition={replayerArenaProps.heroPosition}
                                    heroStack={replayerArenaProps.heroStack}
                                    villains={replayerArenaProps.villains}
                                    villainHoleCards={replayerArenaProps.villainHoleCards}
                                    street={replayerArenaProps.street}
                                    variant={replayerArenaProps.variant}
                                    readOnly
                                  />
                                </div>
                              )}
                              <div className={styles.replayerMetrics}>
                                {Array.isArray(activeStep.boards)
                                && activeStep.boards.length > 1
                                && activeStep.boards.some((b) => Array.isArray(b.cards) && b.cards.length > 0) ? (
                                  <div
                                    className={styles.replayerBoardsStack}
                                    aria-label={`${activeStep.label} Run It Multi-Board Community Cards`}
                                    data-testid="replayer-multi-boards"
                                  >
                                    {activeStep.boards.map((board) => (
                                      <div key={`rep-b-${board.index}`} className={styles.cardsGroup}>
                                        <span className={styles.boardLabel}>
                                          {activeStep.label} {board.label}:
                                        </span>
                                        {board.cards.length > 0 ? (
                                          <div className={styles.arenaCardRow}>
                                            {board.cards.map((c, cIdx) => (
                                              <ArenaMiniCard
                                                key={`rep-b${board.index}-c-${cIdx}`}
                                                card={c}
                                                size="md"
                                              />
                                            ))}
                                          </div>
                                        ) : (
                                          <span className={styles.panelCount}>No Community Cards Dealt</span>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                ) : (
                                  <div className={styles.cardsGroup} aria-label={`${activeStep.label} Community Cards`}>
                                    <span className={styles.boardLabel}>{activeStep.label} Board:</span>
                                    {activeStep.boardCards.length > 0 ? (
                                      <div className={styles.arenaCardRow}>
                                        {activeStep.boardCards.map((c, cIdx) => (
                                          <ArenaMiniCard
                                            key={`rep-c-${cIdx}`}
                                            card={c}
                                            size="md"
                                          />
                                        ))}
                                      </div>
                                    ) : (
                                      <span className={styles.panelCount}>No Community Cards Dealt</span>
                                    )}
                                  </div>
                                )}
                                <div className={styles.replayerMetricGroup}>
                                  <span className={styles.replayerMetricChip}>
                                    Pot: {formatChips(activeStep.runningPot)}
                                  </span>
                                  {activeStep.spr && (
                                    <span className={styles.replayerMetricChip}>
                                      SPR: {activeStep.spr}
                                    </span>
                                  )}
                                  <span className={styles.replayerMetricChip}>
                                    Hero Decisions: {activeStep.heroDecisionCount}
                                  </span>
                                </div>
                              </div>

                              {activeStep.actions.length > 0 ? (
                                <ul className={styles.actionList}>
                                  {activeStep.actions.map((a, aIdx) => (
                                    <li
                                      key={`rep-a-${aIdx}`}
                                      className={`${styles.actionRow} ${a.isHero ? styles.actionRowHero : ''}`}
                                    >
                                      <span>
                                        {a.position ? `${a.position} · ` : ''}
                                        <strong>{a.playerName || (a.isHero ? 'You' : 'Player')}</strong>
                                        {a.isHero ? ' (Hero)' : ''}
                                      </span>
                                      <span>
                                        {formatActionVerb(a.action)}
                                        {a.amount !== null && a.amount !== undefined && Number(a.amount) > 0
                                          ? ` ${formatChips(a.amount)}`
                                          : ''}
                                      </span>
                                    </li>
                                  ))}
                                </ul>
                              ) : (
                                <span className={styles.panelCount}>No Actions Recorded On {activeStep.label}.</span>
                              )}

                              <div className={styles.replayerNavRow}>
                                <button
                                  type="button"
                                  className={styles.compactBtn}
                                  disabled={clampedStreetIdx <= 0}
                                  onClick={() => setActiveStreetIdx((i) => Math.max(0, i - 1))}
                                >
                                  <ChevronLeft size={15} aria-hidden="true" />
                                  Previous Street
                                </button>
                                <span className={styles.panelCount}>
                                  Street {clampedStreetIdx + 1} Of {replayerSteps.length}
                                </span>
                                <button
                                  type="button"
                                  className={styles.compactBtn}
                                  disabled={clampedStreetIdx >= replayerSteps.length - 1}
                                  onClick={() => setActiveStreetIdx((i) => Math.min(replayerSteps.length - 1, i + 1))}
                                >
                                  Next Street
                                  <ChevronRight size={15} aria-hidden="true" />
                                </button>
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Boards & Multi-Board Runout Panels */}
                        {selectedBoards.length > 0 && (
                          <div className={styles.boardList} aria-label="Boards">
                            {selectedBoards.map((board, bIdx) => {
                              const boardNumber = Number(board.index || bIdx + 1);
                              const boardWins = selectedWinnersByBoard.filter((w) => Number(w.board) === boardNumber);
                              return (
                                <div key={`board-${boardNumber}`} className={styles.boardRow}>
                                  <div className={styles.cardsGroup}>
                                    <span className={styles.boardLabel}>{board.label || `Board ${boardNumber}`}</span>
                                    <div className={styles.arenaCardRow}>
                                      {(board.cards || []).map((c, cIdx) => (
                                        <ArenaMiniCard
                                          key={`b${boardNumber}-c${cIdx}`}
                                          card={c}
                                          size="md"
                                        />
                                      ))}
                                    </div>
                                  </div>
                                  {boardWins.length > 0 && (
                                    <div className={styles.boardWinner}>
                                      {boardWins.map((w, wIdx) => (
                                        <span key={`bw-${boardNumber}-${wIdx}`}>
                                          {wIdx > 0 ? ' · ' : ''}
                                          {w.playerName}
                                          {w.low ? ' (Low)' : ''}
                                          {w.hand ? ` (${w.hand})` : ''}
                                          {w.amount ? ` (+${formatChips(w.amount)})` : ''}
                                        </span>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}

                        {selectedWinnersByBoard.length === 0 && selectedWinners.length > 0 && (
                          <div className={styles.boardWinner}>
                            Winners:{' '}
                            {selectedWinners.map((w, idx) => (
                              <span key={`win-${idx}`}>
                                {idx > 0 ? ' · ' : ''}
                                {w.playerName || 'Winner'}
                                {w.hand ? ` (${w.hand})` : ''}
                                {w.amount ? ` ${formatChips(w.amount)}` : ''}
                              </span>
                            ))}
                          </div>
                        )}

                        {/* Players & Authorized Cards Only */}
                        {selectedPlayers.length > 0 && (
                          <div className={styles.playerList} aria-label="Players And Cards">
                            {selectedPlayers.map((p, pIdx) => {
                              const cards = Array.isArray(p.holeCards) ? p.holeCards : [];
                              const net = Number(p.netResult ?? 0);
                              return (
                                <div key={`player-${pIdx}`} className={styles.playerRow}>
                                  <div className={styles.playerIdentity}>
                                    <span>{p.position ? `${p.position} · ` : ''}{p.name || `Seat ${p.seatIndex || pIdx + 1}`}</span>
                                    {p.isHero && <span className={`${styles.badge} ${styles.badgeSaved}`}>You</span>}
                                    {p.isHero && p.cardsVisibility === 'private_hero' && (
                                      <span className={styles.badge}>Private</span>
                                    )}
                                  </div>
                                  <div className={styles.cardsGroup}>
                                    {cards.length > 0 ? (
                                      <div className={styles.arenaCardRow}>
                                        {cards.map((c, cIdx) => (
                                          <ArenaMiniCard
                                            key={`p${pIdx}-c${cIdx}`}
                                            card={c}
                                            size="sm"
                                            overlapped={cIdx > 0 && cards.length >= 4}
                                            overlapTight={cards.length >= 5}
                                          />
                                        ))}
                                      </div>
                                    ) : (
                                      <span className={styles.hiddenCardsCluster} aria-label="Hidden Cards">
                                        <span className={styles.arenaCardRow}>
                                          <ArenaMiniCardBack size="xs" />
                                          <ArenaMiniCardBack size="xs" overlapped />
                                        </span>
                                        <span className={styles.hiddenCardsLabel}>Hidden</span>
                                      </span>
                                    )}
                                  </div>
                                  <span className={net > 0 ? styles.netPos : net < 0 ? styles.netNeg : ''}>
                                    {formatSignedChips(net)}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </section>

                      {/* Private Notes, Tags & Review Status Persistence + Offline Draft Recovery */}
                      <section className={styles.panel} aria-label="Private Review Notes">
                        <div className={styles.panelHead}>
                          <h2>Private Notes, Tags &amp; Review Status</h2>
                          <div className={styles.badgeRow}>
                            {draftRestored && (
                              <span className={styles.draftRestoredPill} data-testid="draft-restored-pill">
                                Draft Restored
                              </span>
                            )}
                            <span className={styles.panelCount}>Revision {draftRevision}</span>
                          </div>
                        </div>

                        <div className={styles.formGroup}>
                          <label htmlFor="review-status-select" className={styles.formLabel}>
                            Review Status
                          </label>
                          <select
                            id="review-status-select"
                            className={styles.selectInput}
                            value={draftStatus}
                            onChange={(e) => setDraftStatus(e.target.value)}
                          >
                            <option value="saved">Saved</option>
                            <option value="in_review">In Review</option>
                            <option value="reviewed">Reviewed</option>
                          </select>
                        </div>

                        {/* Tags Editor */}
                        <div className={styles.tagSection} aria-label="Hand Tags">
                          <span className={styles.formLabel}>
                            <Tag size={13} aria-hidden="true" /> Tags ({draftTags.length}/{MAX_TAGS})
                          </span>
                          <div className={styles.tagPillList}>
                            {PRESET_TAGS.map((preset) => {
                              const active = draftTags.some((t) => t.toLowerCase() === preset.toLowerCase());
                              return (
                                <button
                                  key={`preset-${preset}`}
                                  type="button"
                                  className={`${styles.presetTagBtn} ${active ? styles.presetTagBtnActive : ''}`}
                                  aria-pressed={active}
                                  disabled={!active && draftTags.length >= MAX_TAGS}
                                  onClick={() => handleToggleTag(preset)}
                                >
                                  {preset}
                                </button>
                              );
                            })}
                          </div>

                          {draftTags.length > 0 && (
                            <div className={styles.tagPillList} data-testid="active-tag-pills">
                              {draftTags.map((tag) => (
                                <span key={`tag-${tag}`} className={styles.tagPill}>
                                  <span>{tag}</span>
                                  <button
                                    type="button"
                                    className={styles.tagRemoveBtn}
                                    aria-label={`Remove Tag ${tag}`}
                                    onClick={() => handleToggleTag(tag)}
                                  >
                                    ×
                                  </button>
                                </span>
                              ))}
                            </div>
                          )}

                          <div className={styles.tagInputRow}>
                            <input
                              type="text"
                              aria-label="Add Custom Tag"
                              className={styles.tagInput}
                              value={customTagInput}
                              maxLength={MAX_TAG_LENGTH}
                              placeholder="Add Custom Tag (Example: Check-Raise)"
                              onChange={(e) => setCustomTagInput(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  handleAddCustomTag();
                                }
                              }}
                            />
                            <button
                              type="button"
                              className={styles.secondaryBtn}
                              disabled={!sanitizeTagValue(customTagInput) || draftTags.length >= MAX_TAGS}
                              onClick={handleAddCustomTag}
                            >
                              <Plus size={14} aria-hidden="true" />
                              Add Tag
                            </button>
                          </div>
                        </div>

                        <div className={styles.formGroup}>
                          <label htmlFor="review-notes-input" className={styles.formLabel}>
                            Private Notes
                          </label>
                          <textarea
                            id="review-notes-input"
                            className={styles.notesInput}
                            value={draftNotes}
                            maxLength={4000}
                            placeholder="Write Your Private Read, Sizing Thoughts, Or Follow-Up Questions For This Hand."
                            onChange={(e) => setDraftNotes(e.target.value)}
                          />
                        </div>

                        {saveState === 'conflict' && conflictServerHand && (
                          <div className={styles.conflictBox} role="alert" data-testid="revision-conflict-banner">
                            <strong>Revision Conflict Detected</strong>
                            <span>{saveError}</span>
                            <span>
                              Latest Server Status: <strong>{REVIEW_STATUS_LABELS[getReviewMeta(conflictServerHand).status]}</strong> (Revision {getReviewMeta(conflictServerHand).revision})
                            </span>
                            <span>
                              Latest Server Notes: {getReviewMeta(conflictServerHand).notes || 'Empty'}
                            </span>
                            <div className={styles.actionBar}>
                              <button
                                type="button"
                                className={styles.secondaryBtn}
                                onClick={() => {
                                  applyServerHand(conflictServerHand, { previousRevision: draftRevision });
                                  setSaveState('idle');
                                  setSaveError('');
                                }}
                              >
                                Reload Latest
                              </button>
                              <button
                                type="button"
                                className={styles.primaryBtn}
                                onClick={() => submitReviewUpdate({ overrideRevision: getReviewMeta(conflictServerHand).revision })}
                              >
                                Keep My Changes And Save
                              </button>
                            </div>
                          </div>
                        )}

                        {(saveState === 'error' || saveState === 'interrupted') && (
                          <div className={styles.alertBox} role="alert" data-testid="save-error-banner">
                            <strong>
                              <AlertTriangle size={14} aria-hidden="true" />{' '}
                              {saveState === 'interrupted' ? 'Save Interrupted' : 'Save Error'}
                            </strong>
                            <span>{saveError}</span>
                            <div className={styles.actionBar}>
                              <button
                                type="button"
                                className={styles.primaryBtn}
                                onClick={() => submitReviewUpdate({ reconcileBeforeWrite: saveState === 'interrupted' })}
                              >
                                Retry Save
                              </button>
                            </div>
                          </div>
                        )}

                        <div className={styles.formFooter}>
                          <span className={styles.statusText} role="status" aria-live="polite">
                            {saveState === 'saving'
                              ? 'Saving Review Changes…'
                              : saveState === 'saved' && !isDirty
                                ? 'Private Notes, Tags, And Status Saved.'
                                : isDirty
                                  ? 'Unsaved Changes (Draft Cached Locally).'
                                  : `Last Updated ${formatDateStamp(selectedMeta.updatedAt)}`}
                          </span>
                          <div className={styles.actionBar}>
                            {draftRestored && (
                              <button
                                type="button"
                                className={styles.secondaryBtn}
                                onClick={() => {
                                  if (user?.id && selectedHand?.id) {
                                    clearDraftFromSession(
                                      draftOwnerUserIdRef.current || user.id,
                                      draftHandIdRef.current || selectedHand.id,
                                      draftSourceRevRef.current || selectedMeta.revision,
                                    );
                                  }
                                  syncEditorFromHand(selectedHand, { preserveLocalDraft: false });
                                }}
                              >
                                Discard Draft
                              </button>
                            )}
                            <button
                              type="button"
                              className={styles.primaryBtn}
                              disabled={saveState === 'saving' || (!isDirty && saveState !== 'interrupted' && saveState !== 'error')}
                              onClick={() => submitReviewUpdate({ reconcileBeforeWrite: saveState === 'interrupted' })}
                            >
                              <Save size={15} aria-hidden="true" />
                              {saveState === 'saving' ? 'Saving…' : 'Save Review'}
                            </button>
                          </div>
                        </div>
                      </section>

                      {/* Verified Analysis Handoff (With Active-Table RTA Gate & Distinct From Saved State) */}
                      <section className={styles.panel} aria-label="Hand Analysis">
                        <div className={styles.panelHead}>
                          <h2>Verified Hand Analysis</h2>
                          <span className={styles.panelCount}>
                            {selectedMeta.analysisState === 'analyzed'
                              ? `Analyzed ${formatDateStamp(selectedMeta.analyzedAt)}`
                              : 'Not Analyzed Yet'}
                          </span>
                        </div>

                        {selectedSourceHandId ? (
                          <>
                            <p className={styles.subtitle}>
                              Saving A Hand Keeps It Private In Your Queue Without Analyzing It. Run Analysis When Ready To Inspect Verified Solver References For Canonical Hand <code>{selectedSourceHandId.slice(0, 8)}</code>.
                            </p>
                            <div className={styles.actionBar}>
                              <button
                                type="button"
                                className={styles.primaryBtn}
                                disabled={analysisStatus === 'loading'}
                                onClick={handleAnalyzeHand}
                              >
                                <ScanSearch size={15} aria-hidden="true" />
                                {analysisStatus === 'loading' ? 'Checking Table & Analyzing…' : 'Analyze Hand'}
                              </button>
                              <Link
                                href={`/hub/personal-assistant/leaks?hand=${encodeURIComponent(selectedSourceHandId)}&source=personal-assistant-review`}
                                className={styles.secondaryBtn}
                              >
                                <ExternalLink size={15} aria-hidden="true" />
                                Open In Leak Finder
                              </Link>
                            </div>

                            {analysisStatus === 'restricted' && (
                              <div className={styles.rtaNotice} role="status" data-testid="analysis-rta-notice">
                                <strong>
                                  <ShieldAlert size={14} aria-hidden="true" /> Active Table Protection
                                </strong>
                                <span>{analysisError}</span>
                              </div>
                            )}

                            {analysisStatus === 'error' && (
                              <div className={styles.alertBox} role="alert">
                                <span>{analysisError}</span>
                              </div>
                            )}

                            {(analysisResult || selectedMeta.lastAuditSummary) && (
                              <div className={styles.conflictBox} role="status">
                                <strong>
                                  <CheckCircle2 size={14} aria-hidden="true" /> Analysis Complete
                                </strong>
                                {(() => {
                                  const summary = analysisResult
                                    ? {
                                        solverVerifiedCount: Number(analysisResult.solverVerifiedCount || 0),
                                        unpricedCount: Number(analysisResult.unpricedCount || 0),
                                        matchedLeaksCount: Array.isArray(analysisResult.matchedLeaks) ? analysisResult.matchedLeaks.length : 0,
                                        strategySupported: analysisResult.strategySupported !== false,
                                        declineReason: analysisResult.declineReason || null,
                                      }
                                    : selectedMeta.lastAuditSummary;
                                  if (!summary) return null;
                                  if (!summary.strategySupported && summary.declineReason) {
                                    return <span>{summary.declineReason}</span>;
                                  }
                                  return (
                                    <span>
                                      Verified Decisions: {summary.solverVerifiedCount} · Unpriced Decisions: {summary.unpricedCount} · Matched Leaks: {summary.matchedLeaksCount}
                                    </span>
                                  );
                                })()}
                              </div>
                            )}
                          </>
                        ) : (
                          <p className={styles.subtitle}>
                            This Saved Hand Does Not Carry A Canonical Club Arena Source Hand Identifier. You Can Still Keep Private Notes, Tags, And Review Status Here.
                          </p>
                        )}
                      </section>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>

          {/* Native Safe Deletion <dialog> (showModal, autoFocus on Cancel, returnValue reset) */}
          <dialog
            ref={deleteDialogRef}
            className={styles.confirmDialog}
            aria-labelledby="delete-hand-dialog-title"
            onClose={handleDeleteDialogClose}
          >
            <div className={styles.confirmDialogBody}>
              <h2 id="delete-hand-dialog-title" className={styles.confirmDialogHead}>
                Delete Saved Hand?
              </h2>
              <p className={styles.confirmDialogCopy}>
                {deleteDialogHand?.hand_number
                  ? `Remove Hand #${deleteDialogHand.hand_number} And Its Private Notes From Your Review Queue?`
                  : 'Remove This Saved Hand And Its Private Notes From Your Review Queue?'}
                {' '}You Will Have {DELETE_UNDO_SECONDS} Seconds To Undo Before Deletion Completes.
              </p>
              <div className={styles.confirmDialogActions}>
                <button
                  type="button"
                  autoFocus
                  className={styles.secondaryBtn}
                  onClick={() => deleteDialogRef.current?.close('cancel')}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className={styles.dangerBtn}
                  onClick={() => deleteDialogRef.current?.close('confirm')}
                >
                  <Trash2 size={15} aria-hidden="true" />
                  Delete Hand
                </button>
              </div>
            </div>
          </dialog>

          {/* 5-Second Non-Destructive Undo Delete Countdown Toast */}
          {pendingDelete && (
            <div className={styles.undoToast} role="status" aria-live="polite" data-testid="undo-delete-toast">
              <div className={styles.undoToastCopy}>
                <strong>
                  Deleting {pendingDelete.hand?.hand_number ? `Hand #${pendingDelete.hand.hand_number}` : 'Saved Hand'} In {pendingDelete.secondsLeft}s
                </strong>
                <span>Click Undo To Keep This Hand In Your Review Queue.</span>
              </div>
              <button
                type="button"
                className={styles.primaryBtn}
                data-testid="undo-delete-btn"
                onClick={handleUndoDelete}
              >
                <Undo2 size={15} aria-hidden="true" />
                Undo Delete
              </button>
            </div>
          )}
        </div>
      </HubPageShell>
    </PageTransition>
  );
}
