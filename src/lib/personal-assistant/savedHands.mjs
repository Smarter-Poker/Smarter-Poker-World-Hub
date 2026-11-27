import { randomUUID } from 'crypto';
import { parseHandSummary, toCardCodes } from './leakRecord.js';

export const SAVED_HAND_TABLE_ID = 'AI-Scan';
export const CLUB_ARENA_SOURCE = 'club-arena';
export const CLUB_ARENA_HAND_KEY_PREFIX = 'club-arena:';
export const CLUB_ARENA_ALT_HAND_KEY_PREFIX = 'ca:';
export const HAND_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const ALLOWED_REVIEW_STATUSES = new Set(['saved', 'in_review', 'reviewed']);
export const ALLOWED_ANALYSIS_STATES = new Set(['not_analyzed', 'analyzed']);
export const ALLOWED_LIST_STATUSES = new Set(['unreviewed', 'saved', 'in_review', 'reviewed', 'analyzed']);
export const MAX_NOTE_LENGTH = 4000;
export const MAX_TAGS = 10;
export const MAX_TAG_LENGTH = 32;
export const MAX_BATCH_HAND_IDS = 50;
export const DEFAULT_SAVED_HANDS_LIMIT = 25;
export const MAX_SAVED_HANDS_LIMIT = 100;
export const MAX_PAYLOAD_BYTES = 32_768;

export const SAVED_HAND_LIST_COLUMNS = [
  'id',
  'hand_id',
  'table_id',
  'club_id',
  'hand_number',
  'variant',
  'betting_structure',
  'small_blind',
  'big_blind',
  'player_ids',
  'hand_data',
  'pot_total',
  'winner_ids',
  'started_at',
  'completed_at',
  'created_at',
].join(',');

export const CLUB_ARENA_SOURCE_HAND_SELECT = [
  'id',
  'hand_number',
  'table_id',
  'tournament_id',
  'game_variant',
  'small_blind',
  'big_blind',
  'pot_size',
  'players',
  'hole_cards',
  'board',
  'community_cards',
  'community_cards2',
  'community_cards3',
  'bomb_pot',
  'kill_pot',
  'rit_boards',
  'button_seat',
  'actions',
  'winners',
  'winners_by_board',
  'showdown',
  'summary',
  'source',
  'created_at',
].join(', ');

const VARIANTS = ['NLH', 'PLO', 'PLO5', 'PLO6', 'Mixed'];
const MAX_CHIPS = 1_000_000_000_000;

export function isValidUuid(value) {
  return typeof value === 'string' && HAND_UUID_RE.test(value.trim());
}

export function clubArenaSavedHandKey(handId) {
  return `${CLUB_ARENA_HAND_KEY_PREFIX}${String(handId || '').trim().toLowerCase()}`;
}

export function clubArenaLookupKeys(handId) {
  const clean = String(handId || '').trim().toLowerCase();
  if (!clean) return [];
  return [`${CLUB_ARENA_HAND_KEY_PREFIX}${clean}`, `${CLUB_ARENA_ALT_HAND_KEY_PREFIX}${clean}`];
}

export function extractSourceHandIdFromKey(handIdKey) {
  const raw = String(handIdKey || '').trim().toLowerCase();
  if (!raw) return null;
  if (raw.startsWith(CLUB_ARENA_HAND_KEY_PREFIX)) {
    const id = raw.slice(CLUB_ARENA_HAND_KEY_PREFIX.length);
    return isValidUuid(id) ? id : null;
  }
  if (raw.startsWith(CLUB_ARENA_ALT_HAND_KEY_PREFIX)) {
    const id = raw.slice(CLUB_ARENA_ALT_HAND_KEY_PREFIX.length);
    return isValidUuid(id) ? id : null;
  }
  return isValidUuid(raw) ? raw : null;
}

/**
 * Sanitize a tags array: max 10 tags, max 32 chars each, alphanumeric/space/hyphen only,
 * case-insensitively deduplicated preserving first occurrence.
 */
export function sanitizeSavedHandTags(rawTags) {
  if (!Array.isArray(rawTags)) return [];
  const seen = new Set();
  const out = [];
  for (const raw of rawTags) {
    if (typeof raw !== 'string') continue;
    const cleaned = raw
      .replace(/[^a-zA-Z0-9 -]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, MAX_TAG_LENGTH)
      .trim();
    if (!cleaned) continue;
    const key = cleaned.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(cleaned);
    if (out.length >= MAX_TAGS) break;
  }
  return out;
}

export function normalizeVariantLabel(raw) {
  const clean = String(raw || '').trim().toLowerCase();
  if (!clean || clean === 'holdem' || clean === 'nlh' || clean === 'nlhe' || clean === 'texas_holdem' || clean === 'no_limit_holdem') {
    return 'NLH';
  }
  if (clean.includes('plo6') || clean.includes('6_card')) return 'PLO6';
  if (clean.includes('plo5') || clean.includes('5_card') || clean.includes('big_o')) return 'PLO5';
  if (clean.includes('plo8') || clean.includes('hi_lo') || clean.includes('hilo')) return 'PLO8';
  if (clean.includes('plo') || clean.includes('omaha')) return 'PLO';
  if (clean.includes('pineapple')) return 'Pineapple';
  if (clean.includes('short_deck') || clean.includes('6plus')) return 'Short Deck';
  if (VARIANTS.includes(String(raw || '').trim())) return String(raw || '').trim();
  return String(raw || 'NLH').trim().slice(0, 32) || 'NLH';
}

export function inferBettingStructure(variant) {
  const clean = String(variant || '').trim().toLowerCase();
  if (clean.startsWith('plo') || clean.includes('pot_limit')) return 'pot_limit';
  if (clean.startsWith('flo') || clean.includes('fixed_limit') || clean === 'limit') return 'fixed_limit';
  return 'no_limit';
}

function cardList(value, max) {
  if (!Array.isArray(value) || value.length > max) return null;
  const cards = [];
  for (const c of value) {
    if (!Number.isInteger(c) || c < 0 || c > 51) return null;
    if (cards.includes(c)) return null;
    cards.push(c);
  }
  return cards;
}

function chips(value, { allowNegative = false } = {}) {
  if (value === undefined || value === null || value === '') return 0;
  const n = Number(value);
  if (!Number.isFinite(n) || !Number.isInteger(n)) return null;
  if (!allowNegative && n < 0) return null;
  if (Math.abs(n) > MAX_CHIPS) return null;
  return n;
}

function finiteNumber(value, fallback = 0) {
  if (value === null || value === undefined || value === '') return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function playerIdOf(player) {
  if (!player || typeof player !== 'object') return '';
  const raw = player.userId ?? player.user_id ?? player.id ?? player.playerId ?? player.player_id ?? '';
  return String(raw || '').trim();
}

function normalizeBoardCodes(raw) {
  const codes = toCardCodes(raw);
  return Array.isArray(codes) ? codes : [];
}

/** Validate a legacy AI-Scan POST body. Returns { hand } or { error }. */
export function validateSavedHand(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { error: 'Hand Details Are Required' };
  const heroCards = cardList(body.heroCards ?? [], 6);
  if (!heroCards) return { error: 'Your Cards Are Not Valid Cards' };
  const boardCards = cardList(body.boardCards ?? [], 5);
  if (!boardCards) return { error: 'The Board Cards Are Not Valid Cards' };
  if (heroCards.some((c) => boardCards.includes(c))) return { error: 'A Card Cannot Be In Your Hand And On The Board' };
  const smallBlind = chips(body.smallBlind);
  const bigBlind = chips(body.bigBlind);
  const pot = chips(body.pot);
  const heroNet = chips(body.heroNet, { allowNegative: true });
  if (smallBlind === null || bigBlind === null || pot === null || heroNet === null) {
    return { error: 'Stakes, Pot And Amount Must Be Whole Numbers' };
  }
  const result = body.result === 'Won' ? 'Won' : body.result === 'Lost' ? 'Lost' : null;
  if (!result) return { error: 'Result Must Be Won Or Lost' };
  const variant = VARIANTS.includes(body.variant) ? body.variant : 'NLH';
  const signedNet = result === 'Lost' && heroNet > 0 ? -heroNet : heroNet;
  return { hand: { heroCards, boardCards, smallBlind, bigBlind, pot, heroNet: signedNet, result, variant } };
}

/** Build the stored row for a validated AI-Scan hand. */
export function savedHandRow(userId, hand, now = new Date()) {
  const id = `ai-scan-${randomUUID()}`;
  const at = now.toISOString();
  const { heroCards, boardCards } = hand;
  return {
    id,
    hand_id: id,
    user_id: userId,
    player_ids: [userId],
    table_id: SAVED_HAND_TABLE_ID,
    club_id: null,
    hand_number: 0,
    variant: hand.variant,
    betting_structure: 'no_limit',
    small_blind: hand.smallBlind,
    big_blind: hand.bigBlind,
    pot_total: hand.pot,
    winner_ids: hand.result === 'Won' ? [userId] : [],
    hand_data: {
      source: 'ai-scan',
      players: [
        { id: userId, seatIndex: 1, holeCards: heroCards, netResult: hand.heroNet, showedCards: heroCards.length > 0 },
      ],
      winners: hand.result === 'Won' ? [{ hand: 'Winning Hand', amount: hand.pot }] : [],
      communityCards: boardCards,
      streets: {
        flop: { cards: boardCards.slice(0, 3), actions: [] },
        turn: { cards: boardCards.slice(3, 4), actions: [] },
        river: { cards: boardCards.slice(4, 5), actions: [] },
      },
      review: {
        status: 'saved',
        notes: '',
        tags: [],
        revision: 1,
        updatedAt: at,
        analysisState: 'not_analyzed',
        analyzedAt: null,
        lastAuditSummary: null,
      },
    },
    started_at: at,
    completed_at: at,
  };
}

/**
 * Determine whether caller participated in the authoritative Club Arena hand row.
 */
export function callerParticipatedInClubArenaHand(handRow, userId) {
  const uid = String(userId || '').trim();
  if (!uid || !handRow || typeof handRow !== 'object') return false;
  const summary = parseHandSummary(handRow.summary) || {};
  const lists = [
    Array.isArray(handRow.players) ? handRow.players : [],
    Array.isArray(summary.players) ? summary.players : [],
  ];
  for (const list of lists) {
    if (list.some((player) => playerIdOf(player) === uid)) return true;
  }
  return false;
}

/**
 * Extract all boards accurately (primary board + run-it-twice + bomb-pot boards).
 */
export function extractMultiBoards(handRow, summary = {}) {
  const boards = [];
  const primary = normalizeBoardCodes(
    handRow?.community_cards || handRow?.board || summary?.communityCards || summary?.board,
  );
  if (primary.length > 0) {
    boards.push({ index: 1, label: 'Board 1', cards: primary });
  }

  const extraCandidates = [];
  if (Array.isArray(handRow?.rit_boards)) {
    for (const b of handRow.rit_boards) extraCandidates.push(b);
  }
  if (Array.isArray(summary?.ritBoards)) {
    for (const b of summary.ritBoards) extraCandidates.push(b);
  }
  if (Array.isArray(summary?.bombBoards)) {
    for (const b of summary.bombBoards) extraCandidates.push(b);
  }
  if (handRow?.community_cards2) extraCandidates.push(handRow.community_cards2);
  if (handRow?.community_cards3) extraCandidates.push(handRow.community_cards3);

  const seen = new Set(boards.map((b) => b.cards.join(',')));
  const isBomb = Boolean(handRow?.bomb_pot || summary?.bombPot);
  for (const candidate of extraCandidates) {
    const cards = normalizeBoardCodes(candidate);
    if (cards.length === 0) continue;
    const key = cards.join(',');
    if (seen.has(key)) continue;
    seen.add(key);
    const idx = boards.length + 1;
    boards.push({
      index: idx,
      label: isBomb ? `Board ${idx}` : `Run ${idx}`,
      cards,
    });
  }

  if (boards.length > 1) {
    boards[0] = {
      ...boards[0],
      label: isBomb ? 'Board 1' : 'Run 1',
    };
  }
  return boards;
}

function optionalFiniteNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function extractHandLabel(entry) {
  if (!entry || typeof entry !== 'object') return null;
  if (typeof entry.hand === 'string' && entry.hand.trim()) return entry.hand.trim();
  if (entry.hand && typeof entry.hand === 'object') {
    const nested = entry.hand.name || entry.hand.description || entry.hand.handName || entry.hand.hand_name;
    if (typeof nested === 'string' && nested.trim()) return nested.trim();
  }
  const alt = entry.handName || entry.hand_name || entry.description;
  return typeof alt === 'string' && alt.trim() ? alt.trim() : null;
}

/**
 * Normalize recorded street actions without exposing any opponent's private cards.
 */
function extractSanitizedStreets(handRow, summary, userId, boards, heroPositionOverride = null) {
  const uid = String(userId || '').trim();
  const primaryBoard = boards[0]?.cards || [];
  const rawActions = Array.isArray(handRow?.actions) ? handRow.actions : [];
  const playerMap = new Map();
  const playerBySeat = new Map();
  const rawPlayers = Array.isArray(summary?.players) && summary.players.length > 0
    ? summary.players
    : (Array.isArray(handRow?.players) ? handRow.players : []);
  for (const p of rawPlayers) {
    const pid = playerIdOf(p);
    const seatKey = optionalFiniteNumber(p?.seat ?? p?.seatIndex ?? p?.seat_number);
    const isHeroPlayer = pid !== '' && pid === uid;
    const rawPos = p?.position || (isHeroPlayer ? heroPositionOverride : null);
    const meta = {
      pid,
      name: String(p.username || p.name || p.displayName || (isHeroPlayer ? 'You' : 'Player')).trim(),
      position: rawPos ? String(rawPos).trim().toUpperCase() : null,
    };
    if (pid) playerMap.set(pid, meta);
    if (seatKey !== null) playerBySeat.set(seatKey, meta);
  }

  const streetKeys = ['preflop', 'pineapple_discard', 'flop', 'turn', 'river'];
  const streets = [];
  for (const streetKey of streetKeys) {
    const summaryStreet = summary?.streets?.[streetKey];
    const fromSummary = Array.isArray(summaryStreet?.actions) && summaryStreet.actions.length > 0
      ? summaryStreet.actions
      : null;
    const fromFlat = rawActions.filter((a) => {
      const s = String(a?.street || a?.stage || 'preflop').trim().toLowerCase();
      return s === streetKey;
    });
    const list = fromSummary || fromFlat;
    if (!list.length) continue;

    const boardForStreet = streetKey === 'preflop' || streetKey === 'pineapple_discard'
      ? []
      : streetKey === 'flop'
        ? primaryBoard.slice(0, 3)
        : streetKey === 'turn'
          ? primaryBoard.slice(0, 4)
          : primaryBoard.slice(0, 5);

    streets.push({
      name: streetKey,
      cards: boardForStreet,
      actions: list.map((a) => {
        const explicitActorId = String(a?.playerId ?? a?.userId ?? a?.player_id ?? '').trim();
        const seatKey = optionalFiniteNumber(a?.seat ?? a?.seatIndex ?? a?.seat_number);
        const seatMeta = !explicitActorId && seatKey !== null ? playerBySeat.get(seatKey) : null;
        const actorId = explicitActorId || seatMeta?.pid || '';
        const isHero = actorId !== '' && actorId === uid;
        const meta = (actorId ? playerMap.get(actorId) : null) || seatMeta;
        const rawAction = String(a?.action || a?.type || '').trim().toLowerCase();
        const amount = a?.amount !== undefined && a?.amount !== null && a?.amount !== '' && Number.isFinite(Number(a.amount))
          ? Number(a.amount)
          : null;
        return {
          playerName: String(a?.playerName || meta?.name || (isHero ? 'You' : 'Player')).trim(),
          position: a?.position ? String(a.position).trim().toUpperCase() : (meta?.position || null),
          action: rawAction || 'action',
          amount,
          isHero,
          // Privacy invariant: only ever retain hero's own discarded card.
          ...(isHero && a?.discardedCard ? { discardedCard: String(a.discardedCard) } : {}),
        };
      }),
    });
  }
  return streets;
}

/**
 * Build a strictly privacy-hardened private snapshot row for `public.hand_histories`
 * from an authoritative completed `public.hand_history` row + caller's own `ca_hand_facts`.
 *
 * Security & privacy invariants:
 * - Caller must be a verified participant.
 * - Opponent hole cards are stripped unless explicitly revealed at showdown
 *   (and never revealed if the opponent folded or mucked).
 * - Hero's own hole cards are preserved (marked private if folded/mucked).
 * - `club_id` is ALWAYS stored as `null` on `public.hand_histories` so the legacy
 *   club-admin RLS policy can never read a player's private notes, tags, or folded cards.
 * - Review state (`status: 'saved'`) and analysis state (`analysisState: 'not_analyzed'`)
 *   are kept strictly distinct.
 */
export function buildClubArenaSavedHandRow({
  userId,
  handRow,
  heroPrivateCards = [],
  heroFactRow = null,
  tableName = null,
  clubId = null,
  now = new Date(),
}) {
  const uid = String(userId || '').trim();
  const sourceHandId = String(handRow?.id || '').trim();
  const summary = parseHandSummary(handRow?.summary) || {};
  const fact = heroFactRow && typeof heroFactRow === 'object' ? heroFactRow : null;
  const factPositionRaw = fact?.position || fact?.hero_position || null;
  const factPosition = factPositionRaw ? String(factPositionRaw).trim().toUpperCase() : null;
  const factInvested = optionalFiniteNumber(fact?.invested);
  const factReturned = optionalFiniteNumber(fact?.returned);
  const factNet = optionalFiniteNumber(fact?.net);
  const factNetBb = optionalFiniteNumber(fact?.net_bb);
  const at = now.toISOString();
  const boards = extractMultiBoards(handRow, summary);
  const streets = extractSanitizedStreets(handRow, summary, uid, boards, factPosition);

  const rawPlayers = Array.isArray(summary?.players) && summary.players.length > 0
    ? summary.players
    : (Array.isArray(handRow?.players) ? handRow.players : []);

  const seatToPlayerId = new Map();
  const playerNameById = new Map();
  for (let idx = 0; idx < rawPlayers.length; idx += 1) {
    const p = rawPlayers[idx];
    const pid = playerIdOf(p);
    const seatKey = optionalFiniteNumber(p?.seat ?? p?.seatIndex ?? p?.seat_number);
    if (pid && seatKey !== null) seatToPlayerId.set(seatKey, pid);
    if (pid) {
      const isHero = pid === uid;
      playerNameById.set(
        pid,
        String(p?.username || p?.name || p?.displayName || (isHero ? 'You' : `Seat ${idx + 1}`)).trim(),
      );
    }
  }

  const resolveActionActorId = (a) => {
    const explicit = String(a?.playerId ?? a?.userId ?? a?.player_id ?? '').trim();
    if (explicit) return explicit;
    const seatKey = optionalFiniteNumber(a?.seat ?? a?.seatIndex ?? a?.seat_number);
    return seatKey !== null ? (seatToPlayerId.get(seatKey) || '') : '';
  };

  const foldedIds = new Set();
  const allFlatActions = Array.isArray(handRow?.actions) ? handRow.actions : [];
  for (const a of allFlatActions) {
    const verb = String(a?.action || a?.type || '').trim().toLowerCase();
    const actorId = resolveActionActorId(a);
    if (verb === 'fold' && actorId) foldedIds.add(actorId);
  }
  if (summary?.streets && typeof summary.streets === 'object') {
    for (const st of Object.values(summary.streets)) {
      for (const a of Array.isArray(st?.actions) ? st.actions : []) {
        const verb = String(a?.action || a?.type || '').trim().toLowerCase();
        const actorId = resolveActionActorId(a);
        if (verb === 'fold' && actorId) foldedIds.add(actorId);
      }
    }
  }

  const muckedIds = new Set(
    (Array.isArray(summary?.muckedIds) ? summary.muckedIds : [])
      .map((id) => String(id || '').trim())
      .filter(Boolean),
  );
  for (const p of rawPlayers) {
    const pid = playerIdOf(p);
    if (pid && (p.mucked === true || p.didMuck === true)) muckedIds.add(pid);
  }

  const showdownPlayerIds = new Set();
  const showdownCardsByPid = new Map();

  // Merge top-level Club Arena engine `hand_history.showdown` entries:
  // `{ user_id, seat, reveal_order, mucked, hand_name, hand_description }`
  if (Array.isArray(handRow?.showdown)) {
    for (const row of handRow.showdown) {
      const seatKey = optionalFiniteNumber(row?.seat ?? row?.seatIndex ?? row?.seat_number);
      const pid = playerIdOf(row) || (seatKey !== null ? (seatToPlayerId.get(seatKey) || '') : '');
      if (!pid) continue;
      if (row?.mucked === true) {
        muckedIds.add(pid);
        continue;
      }
      showdownPlayerIds.add(pid);
      const shownCards = normalizeBoardCodes(row?.holeCards || row?.hole_cards || row?.cards);
      if (shownCards.length > 0) showdownCardsByPid.set(pid, shownCards);
    }
  }

  // Merge legacy `summary.showdown` entries.
  if (Array.isArray(summary?.showdown)) {
    for (const row of summary.showdown) {
      const seatKey = optionalFiniteNumber(row?.seat ?? row?.seatIndex ?? row?.seat_number);
      const pid = playerIdOf(row) || (seatKey !== null ? (seatToPlayerId.get(seatKey) || '') : '');
      if (!pid) continue;
      if (row?.mucked === true) {
        muckedIds.add(pid);
        continue;
      }
      const shownCards = normalizeBoardCodes(row?.holeCards || row?.hole_cards || row?.cards);
      if (shownCards.length > 0) {
        showdownPlayerIds.add(pid);
        if (!showdownCardsByPid.has(pid)) showdownCardsByPid.set(pid, shownCards);
      }
    }
  }

  const holeCardsColumn = handRow?.hole_cards && typeof handRow.hole_cards === 'object' && !Array.isArray(handRow.hole_cards)
    ? handRow.hole_cards
    : {};

  const wentToShowdown = Boolean(
    summary?.wentToShowdown === true
    || fact?.went_to_showdown === true
    || (Array.isArray(handRow?.showdown) && handRow.showdown.length > 0)
    || showdownPlayerIds.size > 0
    || rawPlayers.some((p) => p?.showedCards === true || p?.revealed === true || p?.shown === true),
  );

  // Merge top-level `handRow.winners` & `handRow.winners_by_board` alongside legacy `summary`.
  const rawWinners = Array.isArray(handRow?.winners) && handRow.winners.length > 0
    ? handRow.winners
    : (Array.isArray(summary?.winners) ? summary.winners : []);

  const rawWinnersByBoard = Array.isArray(handRow?.winners_by_board) && handRow.winners_by_board.length > 0
    ? handRow.winners_by_board
    : (Array.isArray(summary?.winnersByBoard) && summary.winnersByBoard.length > 0
      ? summary.winnersByBoard
      : (Array.isArray(summary?.boardResults) ? summary.boardResults : []));

  const winnerAmountByPid = new Map();
  for (const w of rawWinners) {
    const pid = playerIdOf(w);
    const amt = optionalFiniteNumber(w?.amount ?? w?.won);
    if (pid && amt !== null) {
      winnerAmountByPid.set(pid, (winnerAmountByPid.get(pid) || 0) + amt);
    }
  }
  if (winnerAmountByPid.size === 0 && rawWinnersByBoard.length > 0) {
    for (const wb of rawWinnersByBoard) {
      const pid = playerIdOf(wb);
      const amt = optionalFiniteNumber(wb?.amount ?? wb?.won);
      if (pid && amt !== null) {
        winnerAmountByPid.set(pid, (winnerAmountByPid.get(pid) || 0) + amt);
      }
    }
  }

  const sanitizedPlayers = rawPlayers.map((p, idx) => {
    const pid = playerIdOf(p);
    const isHero = pid !== '' && pid === uid;
    const folded = foldedIds.has(pid) || p?.folded === true;
    const mucked = muckedIds.has(pid) || p?.mucked === true;
    const explicitlyShown = Boolean(
      !folded
      && !mucked
      && (
        p?.showedCards === true
        || p?.revealed === true
        || p?.shown === true
        || showdownPlayerIds.has(pid)
        || (wentToShowdown && normalizeBoardCodes(holeCardsColumn[pid]).length > 0)
      ),
    );

    let visibleCards = [];
    let cardsVisibility = 'hidden';

    if (isHero) {
      const heroCandidates = [
        heroPrivateCards,
        fact?.hole_cards,
        p?.holeCards,
        p?.privateHoleCards,
        p?.cards,
        showdownCardsByPid.get(uid),
        holeCardsColumn[uid],
      ];
      for (const candidate of heroCandidates) {
        const parsed = normalizeBoardCodes(candidate);
        if (parsed.length > 0) {
          visibleCards = parsed;
          break;
        }
      }
      cardsVisibility = visibleCards.length === 0
        ? 'unavailable'
        : explicitlyShown
          ? 'shown'
          : 'private_hero';
    } else if (explicitlyShown) {
      const oppCandidates = [
        showdownCardsByPid.get(pid),
        holeCardsColumn[pid],
        p?.holeCards,
        p?.cards,
      ];
      for (const candidate of oppCandidates) {
        const parsed = normalizeBoardCodes(candidate);
        if (parsed.length > 0) {
          visibleCards = parsed;
          break;
        }
      }
      cardsVisibility = visibleCards.length > 0 ? 'shown' : 'hidden';
    } else {
      // Strictly strip hidden, folded, or mucked opponent cards.
      visibleCards = [];
      cardsVisibility = 'hidden';
    }

    const explicitWon = optionalFiniteNumber(p?.won ?? p?.payout ?? p?.collected);
    const won = explicitWon !== null
      ? explicitWon
      : (isHero && factReturned !== null
        ? factReturned
        : (pid && winnerAmountByPid.has(pid) ? winnerAmountByPid.get(pid) : 0));

    const explicitInvested = optionalFiniteNumber(p?.invested ?? p?.totalBet ?? p?.bet);
    const invested = explicitInvested !== null
      ? explicitInvested
      : (isHero && factInvested !== null ? factInvested : 0);

    const explicitNet = optionalFiniteNumber(p?.netResult ?? p?.net ?? p?.result);
    const netResult = explicitNet !== null
      ? explicitNet
      : (isHero && factNet !== null ? factNet : (won - invested));

    const resolvedPosition = p?.position
      ? String(p.position).trim().toUpperCase()
      : (isHero ? factPosition : null);

    return {
      seatIndex: finiteNumber(p?.seat ?? p?.seatIndex ?? p?.seat_number, idx + 1),
      name: String(p?.username || p?.name || p?.displayName || (isHero ? 'You' : `Seat ${idx + 1}`)).trim(),
      position: resolvedPosition,
      stack: finiteNumber(p?.stack ?? p?.startingStack ?? p?.chips, 0),
      netResult,
      won,
      invested,
      folded,
      mucked,
      isHero,
      showedCards: cardsVisibility === 'shown',
      cardsVisibility,
      holeCards: visibleCards,
    };
  });

  const winners = rawWinners.map((w) => {
    const pid = playerIdOf(w);
    const isHero = pid !== '' && pid === uid;
    const matchedName = (pid && playerNameById.get(pid))
      || w?.playerName
      || w?.name
      || (isHero ? 'You' : 'Winner');
    return {
      playerName: String(matchedName).trim(),
      amount: finiteNumber(w?.amount ?? w?.won, 0),
      hand: extractHandLabel(w),
      isHero,
      ...(w?.board !== undefined && w?.board !== null ? { board: Number(w.board) } : {}),
      ...(w?.low === true ? { low: true } : {}),
    };
  });

  const winnersByBoard = rawWinnersByBoard.map((wb, idx) => {
    const pid = playerIdOf(wb);
    const isHero = pid !== '' && pid === uid;
    const matchedName = (pid && playerNameById.get(pid))
      || wb?.playerName
      || wb?.name
      || (isHero ? 'You' : 'Winner');
    return {
      board: finiteNumber(wb?.board ?? wb?.boardIndex ?? wb?.run, idx + 1),
      playerName: String(matchedName).trim(),
      amount: finiteNumber(wb?.amount ?? wb?.won, 0),
      hand: extractHandLabel(wb),
      low: wb?.low === true,
      isHero,
    };
  });

  const heroEntry = sanitizedPlayers.find((p) => p.isHero) || null;
  const heroWonChips = heroEntry?.won ?? (factReturned ?? 0);
  const heroInvestedChips = heroEntry?.invested ?? (factInvested ?? 0);
  const heroNet = heroEntry?.netResult ?? (factNet ?? 0);
  const heroPosition = heroEntry?.position || factPosition || null;
  const heroWon = Boolean(
    heroWonChips > 0
    || heroNet > 0
    || winners.some((w) => w.isHero)
    || winnersByBoard.some((wb) => wb.isHero)
    || fact?.won_at_showdown === true,
  );

  const variant = normalizeVariantLabel(handRow?.game_variant || summary?.gameVariant || summary?.variant);
  const smallBlind = finiteNumber(handRow?.small_blind ?? summary?.smallBlind ?? summary?.small_blind, 0);
  const bigBlind = finiteNumber(handRow?.big_blind ?? summary?.bigBlind ?? summary?.big_blind, 0);
  const potTotal = finiteNumber(handRow?.pot_size ?? summary?.potTotal ?? summary?.potSize ?? summary?.pot, 0);
  const playedAt = handRow?.created_at || summary?.playedAt || at;
  const savedRowId = randomUUID();
  const resolvedClubId = clubId ? String(clubId) : (summary?.clubId ? String(summary.clubId) : null);

  return {
    id: savedRowId,
    hand_id: clubArenaSavedHandKey(sourceHandId),
    user_id: uid,
    player_ids: [uid],
    table_id: String(handRow?.table_id || 'club-arena'),
    // Privacy invariant: keep top-level club_id NULL on public.hand_histories so the
    // legacy "Club admins can view club hands" RLS policy can never expose private
    // notes, tags, or folded hero cards to club admins/managers.
    club_id: null,
    hand_number: Math.max(0, Math.trunc(finiteNumber(handRow?.hand_number ?? summary?.handNumber, 0))),
    variant,
    betting_structure: inferBettingStructure(variant),
    small_blind: smallBlind,
    big_blind: bigBlind,
    pot_total: potTotal,
    winner_ids: heroWon ? [uid] : [],
    hand_data: {
      source: CLUB_ARENA_SOURCE,
      sourceHandId,
      ...(resolvedClubId ? { clubId: resolvedClubId } : {}),
      tableName: tableName ? String(tableName).trim() : (summary?.tableName ? String(summary.tableName).trim() : null),
      tournamentId: handRow?.tournament_id ? String(handRow.tournament_id) : null,
      buttonSeat: handRow?.button_seat ?? summary?.buttonSeat ?? null,
      wentToShowdown,
      wonAtShowdown: Boolean(fact?.won_at_showdown === true || (wentToShowdown && heroWon)),
      bombPot: handRow?.bomb_pot || summary?.bombPot || null,
      killPot: Boolean(handRow?.kill_pot || summary?.killPot),
      heroCards: heroEntry?.holeCards || [],
      heroCardsVisibility: heroEntry?.cardsVisibility || 'unavailable',
      heroNet,
      ...(factNetBb !== null ? { heroNetBb: factNetBb } : {}),
      heroPosition,
      won: heroWonChips,
      invested: heroInvestedChips,
      communityCards: boards[0]?.cards || [],
      boards,
      streets,
      players: sanitizedPlayers,
      winners,
      winnersByBoard,
      review: {
        status: 'saved',
        notes: '',
        tags: [],
        revision: 1,
        updatedAt: at,
        analysisState: 'not_analyzed',
        analyzedAt: null,
        lastAuditSummary: null,
      },
    },
    started_at: playedAt,
    completed_at: playedAt,
  };
}

/**
 * Normalize a `hand_histories` row into a consistent review record for API responses.
 */
export function normalizeSavedHandReviewMeta(row) {
  const handData = row?.hand_data && typeof row.hand_data === 'object' ? row.hand_data : {};
  const rawReview = handData.review && typeof handData.review === 'object' ? handData.review : {};
  const status = ALLOWED_REVIEW_STATUSES.has(rawReview.status) ? rawReview.status : 'saved';
  const analysisState = ALLOWED_ANALYSIS_STATES.has(rawReview.analysisState) ? rawReview.analysisState : 'not_analyzed';
  const revision = Number.isInteger(Number(rawReview.revision)) && Number(rawReview.revision) >= 1
    ? Number(rawReview.revision)
    : 1;
  return {
    status,
    notes: typeof rawReview.notes === 'string' ? rawReview.notes : '',
    tags: sanitizeSavedHandTags(rawReview.tags),
    revision,
    updatedAt: rawReview.updatedAt || row?.created_at || null,
    analysisState,
    analyzedAt: analysisState === 'analyzed' ? (rawReview.analyzedAt || null) : null,
    lastAuditSummary: analysisState === 'analyzed' ? (rawReview.lastAuditSummary || null) : null,
  };
}

/**
 * Validate a PATCH body updating private notes, tags, review status, or analysis receipt.
 */
export function validateSavedHandPatch(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { error: 'Update Payload Is Required' };
  }
  const id = String(body.id || '').trim();
  if (!id || id.length > 128) {
    return { error: 'A Valid Saved Hand Identifier Is Required' };
  }

  let expectedRevision = null;
  if (body.expectedRevision !== undefined && body.expectedRevision !== null) {
    const rev = Number(body.expectedRevision);
    if (!Number.isInteger(rev) || rev < 1) {
      return { error: 'Expected Revision Must Be A Positive Integer' };
    }
    expectedRevision = rev;
  }

  const patch = {};
  if (Object.prototype.hasOwnProperty.call(body, 'notes')) {
    if (typeof body.notes !== 'string') {
      return { error: 'Notes Must Be Text' };
    }
    if (body.notes.length > MAX_NOTE_LENGTH) {
      return { error: `Notes Cannot Exceed ${MAX_NOTE_LENGTH} Characters` };
    }
    patch.notes = body.notes;
  }

  if (Object.prototype.hasOwnProperty.call(body, 'tags')) {
    if (!Array.isArray(body.tags)) {
      return { error: 'Tags Must Be An Array' };
    }
    if (body.tags.some((item) => typeof item !== 'string')) {
      return { error: 'Each Tag Must Be Text' };
    }
    patch.tags = sanitizeSavedHandTags(body.tags);
  }

  if (Object.prototype.hasOwnProperty.call(body, 'reviewStatus')) {
    const rawStatus = String(body.reviewStatus || '').trim().toLowerCase();
    const st = rawStatus === 'unreviewed' ? 'saved' : rawStatus;
    if (!ALLOWED_REVIEW_STATUSES.has(st)) {
      return { error: 'Review Status Must Be Saved, In Review, Or Reviewed' };
    }
    patch.status = st;
  }

  if (Object.prototype.hasOwnProperty.call(body, 'analysisState')) {
    const ast = String(body.analysisState || '').trim().toLowerCase();
    if (!ALLOWED_ANALYSIS_STATES.has(ast)) {
      return { error: 'Analysis State Must Be Not Analyzed Or Analyzed' };
    }
    patch.analysisState = ast;
    if (ast === 'analyzed') {
      patch.analyzedAt = typeof body.analyzedAt === 'string' ? body.analyzedAt : new Date().toISOString();
      if (body.lastAuditSummary && typeof body.lastAuditSummary === 'object' && !Array.isArray(body.lastAuditSummary)) {
        patch.lastAuditSummary = {
          solverVerifiedCount: finiteNumber(body.lastAuditSummary.solverVerifiedCount, 0),
          unpricedCount: finiteNumber(body.lastAuditSummary.unpricedCount, 0),
          matchedLeaksCount: finiteNumber(body.lastAuditSummary.matchedLeaksCount, 0),
          strategySupported: body.lastAuditSummary.strategySupported !== false,
          declineReason: typeof body.lastAuditSummary.declineReason === 'string'
            ? body.lastAuditSummary.declineReason.slice(0, 300)
            : null,
        };
      }
    } else {
      patch.analyzedAt = null;
      patch.lastAuditSummary = null;
    }
  }

  if (Object.keys(patch).length === 0) {
    return { error: 'At Least One Review Field Must Be Provided' };
  }

  return { id, expectedRevision, patch };
}

export function isUniqueViolationError(error) {
  if (!error) return false;
  const code = String(error.code || '').trim();
  if (code === '23505') return true;
  const msg = String(error.message || '').toLowerCase();
  return msg.includes('duplicate key') || msg.includes('uq_hand_histories_hand_user');
}

/**
 * Encode an opaque base64url cursor `{ createdAt, id }` for saved-hands pagination.
 */
export function encodeSavedHandsCursor({ createdAt, id }) {
  if (!createdAt) return null;
  const payload = JSON.stringify({ createdAt: String(createdAt), id: id ? String(id) : null });
  return Buffer.from(payload, 'utf8').toString('base64url');
}

/**
 * Decode a cursor supplied as opaque base64url JSON `{ createdAt, id }` OR raw ISO timestamp.
 * Returns `{ createdAt, id, ms }` or `{ error }`.
 */
export function decodeSavedHandsCursor(raw) {
  const value = String(raw || '').trim();
  if (!value) return null;
  if (value.length > 2048) return { error: 'Invalid Cursor Parameter' };

  // Support raw ISO timestamp cursors directly.
  if (/^\d{4}-\d{2}-\d{2}T/.test(value)) {
    const ms = Date.parse(value);
    if (!Number.isNaN(ms)) {
      return { createdAt: value, id: null, ms };
    }
    return { error: 'Invalid Cursor Timestamp' };
  }

  try {
    const decoded = Buffer.from(value, 'base64url').toString('utf8');
    const parsed = JSON.parse(decoded);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { error: 'Invalid Cursor Parameter' };
    }
    const createdAt = typeof parsed.createdAt === 'string' ? parsed.createdAt.trim() : '';
    const ms = Date.parse(createdAt);
    if (!createdAt || Number.isNaN(ms)) {
      return { error: 'Invalid Cursor Parameter' };
    }
    const id = typeof parsed.id === 'string' && parsed.id.trim() ? parsed.id.trim() : null;
    if (id && id.length > 128) return { error: 'Invalid Cursor Parameter' };
    return { createdAt, id, ms };
  } catch (_) {
    return { error: 'Invalid Cursor Parameter' };
  }
}

export function rowEffectiveTimestamp(row) {
  return row?.created_at || row?.completed_at || row?.started_at || null;
}

function timestampNanos(value) {
  const text = String(value || '');
  const ms = Date.parse(text);
  if (Number.isNaN(ms)) return 0n;
  const fractional = text.match(/\.(\d+)(?:Z|[+-]\d{2}:?\d{2})$/i)?.[1] || '';
  const submillisecond = fractional.slice(3, 9).padEnd(6, '0');
  return BigInt(ms) * 1_000_000n + BigInt(submillisecond || '0');
}

export function compareSavedHandRowsDesc(a, b) {
  // Postgres preserves microseconds. Rounding to JS milliseconds before the
  // merge would misorder rows and skip them at the database keyset boundary.
  const aTime = timestampNanos(rowEffectiveTimestamp(a));
  const bTime = timestampNanos(rowEffectiveTimestamp(b));
  if (aTime !== bTime) return aTime > bTime ? -1 : 1;
  const idA = String(a?.id || '');
  const idB = String(b?.id || '');
  if (idB > idA) return 1;
  if (idB < idA) return -1;
  return 0;
}

export function isRowAfterCursor(row, cursor) {
  if (!cursor) return true;
  const rowTime = timestampNanos(rowEffectiveTimestamp(row));
  const cursorTime = timestampNanos(cursor.createdAt);
  if (rowTime < cursorTime) return true;
  if (rowTime > cursorTime) return false;
  // Raw ISO timestamp cursors carry no tie-breaker ID; include equal-millisecond
  // siblings rather than silently dropping rows that share the same timestamp.
  if (!cursor.id) return true;
  return String(row?.id || '') < String(cursor.id);
}

export function isSavedHandUnreviewed(decoratedRow) {
  const status = decoratedRow?.review?.status || normalizeSavedHandReviewMeta(decoratedRow).status;
  return status === 'saved';
}

export function inferSavedHandFormat(row) {
  const handData = row?.hand_data && typeof row.hand_data === 'object' ? row.hand_data : {};
  const explicit = String(handData.format || row?.format || '').trim().toLowerCase();
  if (explicit === 'tournament' || explicit === 'mtt' || explicit === 'sng') return 'tournament';
  if (explicit === 'cash') return 'cash';
  if (handData.tournamentId || handData.tournament_id || row?.tournament_id) return 'tournament';
  return 'cash';
}

function identifiedHeroPlayerForRow(row) {
  const handData = row?.hand_data && typeof row.hand_data === 'object' ? row.hand_data : {};
  const players = Array.isArray(handData.players) ? handData.players : [];
  const explicitHero = players.find(player => player?.isHero === true);
  if (explicitHero) return explicitHero;
  let ownerId = typeof row?.user_id === 'string' ? row.user_id.trim() : '';
  // Historical AI-Scan rows store the owner in player_ids and on the player,
  // while their list projection omits user_id. That identity, not seat order,
  // identifies the hero even when the old row has no isHero flag.
  if (!ownerId && row?.table_id === SAVED_HAND_TABLE_ID && handData.source === 'ai-scan'
    && Array.isArray(row?.player_ids) && row.player_ids.length === 1 && isValidUuid(row.player_ids[0])) {
    ownerId = row.player_ids[0].trim();
  }
  return ownerId ? players.find(player => playerIdOf(player) === ownerId) || null : null;
}

function extractHeroCardsForRow(row) {
  const handData = row?.hand_data && typeof row.hand_data === 'object' ? row.hand_data : {};
  if (Array.isArray(handData.heroCards) && handData.heroCards.length > 0) {
    return normalizeBoardCodes(handData.heroCards);
  }
  const hero = identifiedHeroPlayerForRow(row);
  return hero?.holeCards ? normalizeBoardCodes(hero.holeCards) : [];
}

function extractHeroPositionForRow(row) {
  const handData = row?.hand_data && typeof row.hand_data === 'object' ? row.hand_data : {};
  if (handData.heroPosition) return String(handData.heroPosition).trim().toUpperCase();
  const hero = identifiedHeroPlayerForRow(row);
  return hero?.position ? String(hero.position).trim().toUpperCase() : null;
}

function cardCodesToHandClass(codes) {
  if (!Array.isArray(codes) || codes.length !== 2) return '';
  const r1 = String(codes[0] || '').slice(0, -1).toUpperCase().replace(/^10$/, 'T');
  const s1 = String(codes[0] || '').slice(-1).toLowerCase();
  const r2 = String(codes[1] || '').slice(0, -1).toUpperCase().replace(/^10$/, 'T');
  const s2 = String(codes[1] || '').slice(-1).toLowerCase();
  const order = '23456789TJQKA';
  const i1 = order.indexOf(r1);
  const i2 = order.indexOf(r2);
  if (i1 === -1 || i2 === -1) return '';
  const hi = i1 >= i2 ? r1 : r2;
  const lo = i1 >= i2 ? r2 : r1;
  if (hi === lo) return `${hi}${lo}`;
  return `${hi}${lo}${s1 === s2 ? 's' : 'o'}`;
}

/**
 * Filter a decorated saved hand row against structured query filters.
 */
export function matchesSavedHandFilters(row, filters = {}) {
  if (!row || typeof row !== 'object') return false;
  const handData = row.hand_data && typeof row.hand_data === 'object' ? row.hand_data : {};
  const review = row.review || normalizeSavedHandReviewMeta(row);

  if (filters.source) {
    const wantedSource = String(filters.source).trim().toLowerCase();
    const rowSource = String(row.source || handData.source || '').trim().toLowerCase();
    if (rowSource !== wantedSource) return false;
  }

  if (filters.status) {
    const wantedStatus = String(filters.status).trim().toLowerCase();
    if (!ALLOWED_LIST_STATUSES.has(wantedStatus)) return false;
    if (wantedStatus === 'unreviewed' || wantedStatus === 'saved') {
      if (review.status !== 'saved') return false;
    } else if (wantedStatus === 'in_review' || wantedStatus === 'reviewed') {
      if (review.status !== wantedStatus) return false;
    } else if (wantedStatus === 'analyzed') {
      if (review.analysisState !== 'analyzed') return false;
    }
  }

  if (filters.format) {
    const wantedFormat = String(filters.format).trim().toLowerCase();
    if (inferSavedHandFormat(row) !== wantedFormat) return false;
  }

  if (filters.position) {
    const wantedPos = String(filters.position).trim().toUpperCase();
    const heroPos = extractHeroPositionForRow(row);
    if (!heroPos || heroPos !== wantedPos) return false;
  }

  if (filters.tag) {
    const wantedTag = String(filters.tag).trim().toLowerCase();
    const tags = Array.isArray(review.tags) ? review.tags : [];
    if (!tags.some((t) => String(t).toLowerCase() === wantedTag)) return false;
  }

  if (filters.q) {
    const needle = String(filters.q).trim().toLowerCase();
    if (needle) {
      const heroCards = extractHeroCardsForRow(row);
      const primaryBoard = normalizeBoardCodes(handData.communityCards || handData.boards?.[0]?.cards || []);
      const allBoards = Array.isArray(handData.boards)
        ? handData.boards.flatMap((b) => normalizeBoardCodes(b?.cards || []))
        : primaryBoard;
      const haystackParts = [
        review.notes || '',
        ...(Array.isArray(review.tags) ? review.tags : []),
        heroCards.join(' '),
        heroCards.join(''),
        cardCodesToHandClass(heroCards),
        allBoards.join(' '),
        allBoards.join(''),
        handData.tableName || '',
        row.variant || '',
        extractHeroPositionForRow(row) || '',
      ];
      const haystack = haystackParts.join(' ').toLowerCase();
      if (!haystack.includes(needle)) return false;
    }
  }

  return true;
}

/**
 * Rank recent completed `ca_hand_facts` rows into up to `limit` (default 5)
 * post-session suggested hands for review. Excludes already-saved hands and
 * never leaks any opponent hidden cards or PII.
 */
export function rankSuggestedHands(
  factRows = [],
  {
    savedSourceHandIds = new Set(),
    handHistoryById = new Map(),
    tableNameById = new Map(),
    limit = 5,
  } = {},
) {
  if (!Array.isArray(factRows) || factRows.length === 0) return [];
  const savedSet = savedSourceHandIds instanceof Set
    ? new Set([...savedSourceHandIds].map((id) => String(id).trim().toLowerCase()))
    : new Set();

  const scored = [];
  const seenHandIds = new Set();

  for (const fact of factRows) {
    const handId = String(fact?.hand_id || '').trim().toLowerCase();
    if (!isValidUuid(handId) || savedSet.has(handId) || seenHandIds.has(handId)) continue;
    seenHandIds.add(handId);

    const historyRow = handHistoryById instanceof Map ? handHistoryById.get(handId) : null;
    const summary = historyRow ? (parseHandSummary(historyRow.summary) || {}) : {};
    const bigBlind = finiteNumber(fact?.big_blind ?? historyRow?.big_blind ?? summary?.bigBlind, 0);
    const netBb = finiteNumber(fact?.net_bb, bigBlind > 0 ? finiteNumber(fact?.net, 0) / bigBlind : 0);
    const absNetBb = Math.abs(netBb);
    const invested = finiteNumber(fact?.invested, 0);
    const returned = finiteNumber(fact?.returned, 0);
    const rawPot = historyRow?.pot_size ?? summary?.potTotal ?? summary?.potSize ?? fact?.pot_size ?? null;
    let potBb = null;
    if (rawPot !== null && rawPot !== undefined && Number.isFinite(Number(rawPot)) && bigBlind > 0) {
      potBb = +(Number(rawPot) / bigBlind).toFixed(1);
    } else if (fact?.pot_bb !== undefined && fact?.pot_bb !== null && Number.isFinite(Number(fact.pot_bb))) {
      potBb = +Number(fact.pot_bb).toFixed(1);
    } else if (bigBlind > 0) {
      const approxPot = Math.max(returned, invested * 2, Math.abs(finiteNumber(fact?.net, 0)) * 2);
      potBb = +(approxPot / bigBlind).toFixed(1);
    } else {
      potBb = +(absNetBb * 2).toFixed(1);
    }

    const evNetBb = fact?.ev_net_bb !== undefined && fact?.ev_net_bb !== null && Number.isFinite(Number(fact.ev_net_bb))
      ? Number(fact.ev_net_bb)
      : null;

    let score = (potBb || 0) * 1.1 + absNetBb * 1.6;
    const reasons = [];

    if (fact?.was_all_in) {
      score += 45;
      reasons.push({ weight: 50, label: 'All-In Decision' });
    }
    if (fact?.four_bet) {
      score += 35;
      reasons.push({ weight: 42, label: '4-Bet Pot' });
    }
    if (fact?.went_to_showdown && !fact?.won_at_showdown && absNetBb >= 15) {
      score += 32;
      reasons.push({ weight: 40, label: 'Lost Big Showdown' });
    }
    if (fact?.three_bet || fact?.faced_three_bet) {
      score += 24;
      reasons.push({ weight: 30, label: '3-Bet Pot Decision' });
    }
    if (evNetBb !== null && Math.abs(netBb - evNetBb) >= 20) {
      score += 18;
      reasons.push({ weight: 28, label: 'High-Variance All-In' });
    }
    if ((potBb || 0) >= 40 || absNetBb >= 25) {
      score += 20;
      reasons.push({ weight: 35, label: netBb < 0 ? 'Largest Pot Lost' : 'Biggest Pot Won' });
    }
    if (fact?.went_to_showdown) {
      score += 12;
      reasons.push({ weight: 20, label: 'Showdown Decision' });
    }

    reasons.sort((a, b) => b.weight - a.weight);
    const reason = reasons[0]?.label || ((potBb || 0) >= 15 ? 'Large Pot' : 'Notable Decision');

    // Privacy: ONLY hero's own cards from owner-scoped ca_hand_facts + community board cards.
    // Never include any opponent cards, usernames, or IDs.
    const heroCards = normalizeBoardCodes(fact?.hole_cards);
    const board = historyRow
      ? normalizeBoardCodes(historyRow.community_cards || historyRow.board || summary?.communityCards || summary?.board)
      : normalizeBoardCodes(fact?.board || fact?.community_cards);

    const tableId = String(fact?.table_id || historyRow?.table_id || '').trim();
    const resolvedTableName = (tableId && tableNameById instanceof Map && tableNameById.get(tableId))
      || (summary?.tableName ? String(summary.tableName).trim() : null)
      || (fact?.table_name ? String(fact.table_name).trim() : null)
      || null;

    scored.push({
      score,
      playedAtMs: Date.parse(String(fact?.played_at || historyRow?.created_at || '')) || 0,
      item: {
        handId,
        playedAt: fact?.played_at || historyRow?.created_at || null,
        variant: normalizeVariantLabel(fact?.game_variant || historyRow?.game_variant),
        format: fact?.tournament_id || historyRow?.tournament_id ? 'tournament' : 'cash',
        heroPosition: fact?.position ? String(fact.position).trim().toUpperCase() : null,
        heroCards,
        board,
        potBb: Number.isFinite(potBb) ? potBb : 0,
        netBb: Number.isFinite(netBb) ? +netBb.toFixed(1) : 0,
        tableName: resolvedTableName,
        reason,
      },
    });
  }

  scored.sort((a, b) => (b.score - a.score) || (b.playedAtMs - a.playedAtMs));
  return scored.slice(0, Math.max(1, Math.min(limit, 20))).map((entry) => entry.item);
}

/**
 * Strip any hidden opponent hole cards from a saved hand's players array (defense in depth).
 */
function sanitizePlayersForExport(players, heroPlayer) {
  if (!Array.isArray(players)) return [];
  return players.map((p) => {
    const isHero = heroPlayer !== null && p === heroPlayer;
    const canShow = isHero || (p?.showedCards === true && p?.cardsVisibility === 'shown' && !p?.folded && !p?.mucked);
    return {
      seatIndex: p?.seatIndex ?? null,
      name: String(p?.name || (isHero ? 'You' : 'Player')).trim(),
      position: p?.position || null,
      stack: finiteNumber(p?.stack, 0),
      netResult: finiteNumber(p?.netResult, 0),
      won: finiteNumber(p?.won, 0),
      folded: Boolean(p?.folded),
      mucked: Boolean(p?.mucked),
      isHero,
      showedCards: Boolean(p?.showedCards && canShow),
      cardsVisibility: canShow ? (p?.cardsVisibility || (isHero ? 'private_hero' : 'shown')) : 'hidden',
      holeCards: canShow ? normalizeBoardCodes(p?.holeCards) : [],
    };
  });
}

/**
 * Build a clean portable JSON export object for a single saved hand.
 */
export function formatSavedHandForExport(row) {
  const handData = row?.hand_data && typeof row.hand_data === 'object' ? row.hand_data : {};
  const review = row?.review || normalizeSavedHandReviewMeta(row);
  const heroCards = extractHeroCardsForRow(row);
  const primaryBoard = normalizeBoardCodes(handData.communityCards || handData.boards?.[0]?.cards || []);
  const boards = Array.isArray(handData.boards) && handData.boards.length > 0
    ? handData.boards.map((b, idx) => ({
      index: b?.index ?? idx + 1,
      label: b?.label || `Board ${idx + 1}`,
      cards: normalizeBoardCodes(b?.cards),
    }))
    : (primaryBoard.length > 0 ? [{ index: 1, label: 'Board 1', cards: primaryBoard }] : []);
  const smallBlind = finiteNumber(row?.small_blind, 0);
  const bigBlind = finiteNumber(row?.big_blind, 0);

  return {
    id: row?.id || null,
    source: row?.source || handData.source || (row?.table_id === SAVED_HAND_TABLE_ID ? 'ai-scan' : CLUB_ARENA_SOURCE),
    sourceHandId: row?.sourceHandId || handData.sourceHandId || null,
    savedAt: row?.created_at || null,
    playedAt: row?.started_at || row?.completed_at || row?.created_at || null,
    handNumber: row?.hand_number ?? 0,
    variant: normalizeVariantLabel(row?.variant),
    format: inferSavedHandFormat(row),
    stakes: bigBlind > 0 ? `${smallBlind}/${bigBlind}` : null,
    smallBlind,
    bigBlind,
    potTotal: finiteNumber(row?.pot_total, 0),
    tableName: handData.tableName || null,
    heroPosition: extractHeroPositionForRow(row),
    heroCards,
    heroNet: finiteNumber(handData.heroNet, 0),
    board: primaryBoard,
    boards,
    players: sanitizePlayersForExport(handData.players, identifiedHeroPlayerForRow(row)),
    streets: Array.isArray(handData.streets) ? handData.streets : [],
    winners: Array.isArray(handData.winners) ? handData.winners : [],
    winnersByBoard: Array.isArray(handData.winnersByBoard) ? handData.winnersByBoard : [],
    review: {
      status: review.status,
      notes: review.notes,
      tags: review.tags,
      analysisState: review.analysisState,
      analyzedAt: review.analyzedAt,
      lastAuditSummary: review.lastAuditSummary,
    },
  };
}

/**
 * Format all caller-owned saved hands + private notes into readable standard hand-history text.
 */
export function formatSavedHandsAsText(rows = []) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return '# Smarter.Poker Saved Hands Export\n# No saved hands found.\n';
  }

  const blocks = rows.map((rawRow) => {
    const item = formatSavedHandForExport(rawRow);
    const lines = [];
    const handRef = item.handNumber > 0 ? `#${item.handNumber}` : `#${item.id || 'saved'}`;
    const stakesLabel = item.stakes ? `(${item.stakes})` : '(No Blinds Recorded)';
    const playedLabel = item.playedAt || item.savedAt || '';
    lines.push(`Smarter.Poker Hand ${handRef}: ${item.variant} ${stakesLabel}${playedLabel ? ` - ${playedLabel}` : ''}`);
    lines.push(`Table '${item.tableName || 'Saved Hand'}' (${item.format === 'tournament' ? 'Tournament' : 'Cash'}) | Source: ${item.source}`);

    for (const p of item.players) {
      const posTag = p.position ? ` (${p.position})` : '';
      const heroTag = p.isHero ? ' [Hero]' : '';
      lines.push(`Seat ${p.seatIndex ?? '?'}: ${p.name}${posTag}${heroTag} (${p.stack} in chips)`);
    }

    if (item.heroCards.length > 0) {
      lines.push('*** HOLE CARDS ***');
      lines.push(`Dealt to Hero [${item.heroCards.join(' ')}]`);
    }

    for (const st of item.streets) {
      const stName = String(st?.name || 'street').toUpperCase();
      const stCards = normalizeBoardCodes(st?.cards);
      lines.push(stCards.length > 0 ? `*** ${stName} *** [${stCards.join(' ')}]` : `*** ${stName} ***`);
      for (const act of Array.isArray(st?.actions) ? st.actions : []) {
        const actor = act?.playerName || (act?.isHero ? 'Hero' : 'Player');
        const amt = act?.amount !== null && act?.amount !== undefined ? ` ${act.amount}` : '';
        lines.push(`${actor}: ${act?.action || 'action'}${amt}`);
      }
    }

    if (item.boards.length > 1) {
      for (const b of item.boards) {
        lines.push(`*** ${String(b.label || `Board ${b.index}`).toUpperCase()} *** [${b.cards.join(' ')}]`);
      }
    }

    lines.push('*** SUMMARY ***');
    lines.push(`Total pot ${item.potTotal} | Hero Net: ${item.heroNet >= 0 ? `+${item.heroNet}` : item.heroNet}`);
    if (item.board.length > 0) {
      lines.push(`Board [${item.board.join(' ')}]`);
    }
    for (const p of item.players) {
      if (p.showedCards && p.holeCards.length > 0 && !p.isHero) {
        lines.push(`${p.name}: showed [${p.holeCards.join(' ')}]`);
      }
    }
    for (const w of item.winners) {
      const handDesc = w?.hand ? ` (${w.hand})` : '';
      lines.push(`Winner: ${w?.playerName || 'Player'} collected ${w?.amount ?? 0}${handDesc}`);
    }
    for (const wb of item.winnersByBoard) {
      const handDesc = wb?.hand ? ` (${wb.hand})` : '';
      lines.push(`Board ${wb?.board ?? 1} Winner: ${wb?.playerName || 'Player'} collected ${wb?.amount ?? 0}${handDesc}`);
    }

    lines.push('*** REVIEW NOTES ***');
    lines.push(`Status: ${item.review.status} | Analysis: ${item.review.analysisState}`);
    if (item.review.tags.length > 0) {
      lines.push(`Tags: ${item.review.tags.join(', ')}`);
    }
    if (item.review.notes) {
      lines.push(`Notes: ${item.review.notes}`);
    }

    return lines.join('\n');
  });

  return `${blocks.join('\n\n\n')}\n`;
}

export default {
  SAVED_HAND_TABLE_ID,
  CLUB_ARENA_SOURCE,
  CLUB_ARENA_HAND_KEY_PREFIX,
  CLUB_ARENA_ALT_HAND_KEY_PREFIX,
  HAND_UUID_RE,
  ALLOWED_REVIEW_STATUSES,
  ALLOWED_ANALYSIS_STATES,
  ALLOWED_LIST_STATUSES,
  MAX_NOTE_LENGTH,
  MAX_TAGS,
  MAX_TAG_LENGTH,
  MAX_BATCH_HAND_IDS,
  DEFAULT_SAVED_HANDS_LIMIT,
  MAX_SAVED_HANDS_LIMIT,
  MAX_PAYLOAD_BYTES,
  SAVED_HAND_LIST_COLUMNS,
  CLUB_ARENA_SOURCE_HAND_SELECT,
  isValidUuid,
  clubArenaSavedHandKey,
  clubArenaLookupKeys,
  extractSourceHandIdFromKey,
  sanitizeSavedHandTags,
  normalizeVariantLabel,
  inferBettingStructure,
  validateSavedHand,
  savedHandRow,
  callerParticipatedInClubArenaHand,
  extractMultiBoards,
  buildClubArenaSavedHandRow,
  normalizeSavedHandReviewMeta,
  validateSavedHandPatch,
  isUniqueViolationError,
  encodeSavedHandsCursor,
  decodeSavedHandsCursor,
  rowEffectiveTimestamp,
  compareSavedHandRowsDesc,
  isRowAfterCursor,
  isSavedHandUnreviewed,
  inferSavedHandFormat,
  matchesSavedHandFilters,
  rankSuggestedHands,
  formatSavedHandForExport,
  formatSavedHandsAsText,
};
