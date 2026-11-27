import { randomUUID } from 'crypto';
import { parseHandSummary, toCardCodes } from './leakRecord.js';

export const SAVED_HAND_TABLE_ID = 'AI-Scan';
export const CLUB_ARENA_SOURCE = 'club-arena';
export const CLUB_ARENA_HAND_KEY_PREFIX = 'club-arena:';
export const HAND_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const ALLOWED_REVIEW_STATUSES = new Set(['saved', 'in_review', 'reviewed']);
export const ALLOWED_ANALYSIS_STATES = new Set(['not_analyzed', 'analyzed']);
export const MAX_NOTE_LENGTH = 4000;

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

/**
 * Normalize recorded street actions without exposing any opponent's private cards.
 */
function extractSanitizedStreets(handRow, summary, userId, boards) {
  const uid = String(userId || '').trim();
  const primaryBoard = boards[0]?.cards || [];
  const rawActions = Array.isArray(handRow?.actions) ? handRow.actions : [];
  const playerMap = new Map();
  const rawPlayers = Array.isArray(summary?.players) && summary.players.length > 0
    ? summary.players
    : (Array.isArray(handRow?.players) ? handRow.players : []);
  for (const p of rawPlayers) {
    const pid = playerIdOf(p);
    if (pid) {
      playerMap.set(pid, {
        name: String(p.username || p.name || p.displayName || (pid === uid ? 'You' : 'Player')).trim(),
        position: p.position ? String(p.position).trim().toUpperCase() : null,
      });
    }
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
        const actorId = String(a?.playerId ?? a?.userId ?? a?.player_id ?? '').trim();
        const isHero = actorId !== '' && actorId === uid;
        const meta = playerMap.get(actorId);
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
 * - Review state (`status: 'saved'`) and analysis state (`analysisState: 'not_analyzed'`)
 *   are kept strictly distinct.
 */
export function buildClubArenaSavedHandRow({
  userId,
  handRow,
  heroPrivateCards = [],
  tableName = null,
  clubId = null,
  now = new Date(),
}) {
  const uid = String(userId || '').trim();
  const sourceHandId = String(handRow?.id || '').trim();
  const summary = parseHandSummary(handRow?.summary) || {};
  const at = now.toISOString();
  const boards = extractMultiBoards(handRow, summary);
  const streets = extractSanitizedStreets(handRow, summary, uid, boards);

  const rawPlayers = Array.isArray(summary?.players) && summary.players.length > 0
    ? summary.players
    : (Array.isArray(handRow?.players) ? handRow.players : []);

  const foldedIds = new Set();
  const allFlatActions = Array.isArray(handRow?.actions) ? handRow.actions : [];
  for (const a of allFlatActions) {
    const verb = String(a?.action || a?.type || '').trim().toLowerCase();
    const actorId = String(a?.playerId ?? a?.userId ?? a?.player_id ?? '').trim();
    if (verb === 'fold' && actorId) foldedIds.add(actorId);
  }
  if (summary?.streets && typeof summary.streets === 'object') {
    for (const st of Object.values(summary.streets)) {
      for (const a of Array.isArray(st?.actions) ? st.actions : []) {
        const verb = String(a?.action || a?.type || '').trim().toLowerCase();
        const actorId = String(a?.playerId ?? a?.userId ?? a?.player_id ?? '').trim();
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
  if (Array.isArray(summary?.showdown)) {
    for (const row of summary.showdown) {
      const pid = playerIdOf(row);
      const shownCards = normalizeBoardCodes(row?.holeCards || row?.cards);
      if (pid && shownCards.length > 0 && row?.mucked !== true) showdownPlayerIds.add(pid);
    }
  }
  const holeCardsColumn = handRow?.hole_cards && typeof handRow.hole_cards === 'object' && !Array.isArray(handRow.hole_cards)
    ? handRow.hole_cards
    : {};

  const wentToShowdown = Boolean(
    summary?.wentToShowdown === true
    || showdownPlayerIds.size > 0
    || rawPlayers.some((p) => p?.showedCards === true || p?.revealed === true || p?.shown === true),
  );

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
        p?.holeCards,
        p?.privateHoleCards,
        p?.cards,
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
      // Strictly strip hidden opponent cards.
      visibleCards = [];
      cardsVisibility = 'hidden';
    }

    const won = finiteNumber(p?.won ?? p?.payout ?? p?.collected, 0);
    const invested = finiteNumber(p?.invested ?? p?.totalBet ?? p?.bet, 0);
    const netResult = p?.netResult !== undefined && p?.netResult !== null
      ? finiteNumber(p.netResult, 0)
      : p?.net !== undefined && p?.net !== null
        ? finiteNumber(p.net, 0)
        : p?.result !== undefined && p?.result !== null
          ? finiteNumber(p.result, 0)
          : (won - invested);

    return {
      seatIndex: finiteNumber(p?.seat ?? p?.seatIndex ?? p?.seat_number, idx + 1),
      name: String(p?.username || p?.name || p?.displayName || (isHero ? 'You' : `Seat ${idx + 1}`)).trim(),
      position: p?.position ? String(p.position).trim().toUpperCase() : null,
      stack: finiteNumber(p?.stack ?? p?.startingStack ?? p?.chips, 0),
      netResult,
      won,
      folded,
      mucked,
      isHero,
      showedCards: cardsVisibility === 'shown',
      cardsVisibility,
      holeCards: visibleCards,
    };
  });

  const rawWinners = Array.isArray(summary?.winners) ? summary.winners : [];
  const winners = rawWinners.map((w) => {
    const pid = playerIdOf(w);
    const isHero = pid !== '' && pid === uid;
    const matchedPlayer = sanitizedPlayers.find((p) => (isHero ? p.isHero : p.name === (w?.playerName || w?.name)));
    return {
      playerName: String(w?.playerName || w?.name || matchedPlayer?.name || (isHero ? 'You' : 'Winner')).trim(),
      amount: finiteNumber(w?.amount ?? w?.won, 0),
      hand: w?.hand || w?.handName || w?.description || null,
      isHero,
      ...(w?.board !== undefined && w?.board !== null ? { board: Number(w.board) } : {}),
      ...(w?.low === true ? { low: true } : {}),
    };
  });

  const rawWinnersByBoard = Array.isArray(summary?.winnersByBoard)
    ? summary.winnersByBoard
    : (Array.isArray(summary?.boardResults) ? summary.boardResults : []);
  const winnersByBoard = rawWinnersByBoard.map((wb, idx) => {
    const pid = playerIdOf(wb);
    const isHero = pid !== '' && pid === uid;
    return {
      board: finiteNumber(wb?.board ?? wb?.boardIndex ?? wb?.run, idx + 1),
      playerName: String(wb?.playerName || wb?.name || (isHero ? 'You' : 'Winner')).trim(),
      amount: finiteNumber(wb?.amount ?? wb?.won, 0),
      hand: wb?.hand || wb?.handName || wb?.description || null,
      low: wb?.low === true,
      isHero,
    };
  });

  const heroEntry = sanitizedPlayers.find((p) => p.isHero) || null;
  const heroWon = Boolean(
    (heroEntry && (heroEntry.won > 0 || heroEntry.netResult > 0))
    || winners.some((w) => w.isHero),
  );

  const variant = normalizeVariantLabel(handRow?.game_variant || summary?.gameVariant || summary?.variant);
  const smallBlind = finiteNumber(handRow?.small_blind ?? summary?.smallBlind ?? summary?.small_blind, 0);
  const bigBlind = finiteNumber(handRow?.big_blind ?? summary?.bigBlind ?? summary?.big_blind, 0);
  const potTotal = finiteNumber(handRow?.pot_size ?? summary?.potTotal ?? summary?.potSize ?? summary?.pot, 0);
  const playedAt = handRow?.created_at || summary?.playedAt || at;
  const savedRowId = randomUUID();

  return {
    id: savedRowId,
    hand_id: clubArenaSavedHandKey(sourceHandId),
    user_id: uid,
    player_ids: [uid],
    table_id: String(handRow?.table_id || 'club-arena'),
    club_id: clubId ? String(clubId) : (summary?.clubId ? String(summary.clubId) : null),
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
      tableName: tableName ? String(tableName).trim() : (summary?.tableName ? String(summary.tableName).trim() : null),
      tournamentId: handRow?.tournament_id ? String(handRow.tournament_id) : null,
      buttonSeat: handRow?.button_seat ?? summary?.buttonSeat ?? null,
      wentToShowdown,
      bombPot: handRow?.bomb_pot || summary?.bombPot || null,
      killPot: Boolean(handRow?.kill_pot || summary?.killPot),
      heroCards: heroEntry?.holeCards || [],
      heroCardsVisibility: heroEntry?.cardsVisibility || 'unavailable',
      heroNet: heroEntry?.netResult ?? 0,
      heroPosition: heroEntry?.position || null,
      communityCards: boards[0]?.cards || [],
      boards,
      streets,
      players: sanitizedPlayers,
      winners,
      winnersByBoard,
      review: {
        status: 'saved',
        notes: '',
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
    revision,
    updatedAt: rawReview.updatedAt || row?.created_at || null,
    analysisState,
    analyzedAt: analysisState === 'analyzed' ? (rawReview.analyzedAt || null) : null,
    lastAuditSummary: analysisState === 'analyzed' ? (rawReview.lastAuditSummary || null) : null,
  };
}

/**
 * Validate a PATCH body updating private notes, review status, or analysis receipt.
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

  if (Object.prototype.hasOwnProperty.call(body, 'reviewStatus')) {
    const st = String(body.reviewStatus || '').trim().toLowerCase();
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

export default {
  SAVED_HAND_TABLE_ID,
  CLUB_ARENA_SOURCE,
  CLUB_ARENA_HAND_KEY_PREFIX,
  HAND_UUID_RE,
  ALLOWED_REVIEW_STATUSES,
  ALLOWED_ANALYSIS_STATES,
  SAVED_HAND_LIST_COLUMNS,
  CLUB_ARENA_SOURCE_HAND_SELECT,
  isValidUuid,
  clubArenaSavedHandKey,
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
};
