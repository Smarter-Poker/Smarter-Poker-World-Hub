import { getServerUserWithFallback } from '../../../src/lib/serverAuth.js';
import { createClient } from '../../../src/lib/supabaseServerClient.js';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit.js';
import { reportApiError } from '../../../src/lib/apiErrorHandler.js';
import { checkSandboxAccess, isFeatureAccessible } from '../../../src/lib/personal-assistant/contextAuthority.js';
import { parseHandHistory } from '../../../src/engines/HandHistoryParser.js';
import { auditParsedHands } from '../../../src/lib/training/handAuditEngine.js';
import { buildCustomTrainingArenaHref } from '../../../src/lib/training/customTrainingLaunchContract.mjs';
import { parseStakesToBlinds } from '../../../src/lib/training/clubArenaTableParity.js';
import { evaluateTrainingSpotWithHorseBrain } from '../../../src/lib/training/horseBrainTrainingAdapter.js';

const HOLE_CARD_COUNT_BY_VARIANT = Object.freeze({
  nlh: 2,
  plo4: 4,
  plo5: 5,
  plo6: 6,
});

function resolveHandVariant(hand = {}, defaultVariant = 'nlh') {
  const raw = String(hand?.variant || hand?.gameVariant || hand?.gameType || defaultVariant || 'nlh').trim().toLowerCase();
  const heroCards = Array.isArray(hand?.heroCards)
    ? hand.heroCards
    : Array.isArray(hand?.hero?.holeCards)
      ? hand.hero.holeCards
      : [];
  if (raw === 'short_deck' || raw === '6+' || /short[\s_-]*deck|6\+/i.test(raw)) return 'short_deck';
  if (raw === 'omaha_hi_lo' || raw === 'plo8' || /hi[\s/-]*lo|o8|plo8/i.test(raw)) return 'omaha_hi_lo';
  if (raw === 'limit_holdem' || raw === 'pot_limit_holdem' || raw === 'fixed_limit') return raw;
  if (raw === 'plo6' || heroCards.length === 6) return 'plo6';
  if (raw === 'plo5' || heroCards.length === 5) return 'plo5';
  if (raw === 'plo4' || /plo|omaha/i.test(raw) || heroCards.length === 4) return 'plo4';
  return 'nlh';
}

function resolveHandBoardCards(hand = {}, street = 'preflop') {
  const rawBoard = Array.isArray(hand?.boardCards) && hand.boardCards.length > 0
    ? hand.boardCards
    : Array.isArray(hand?.board) && hand.board.length > 0
      ? hand.board
      : extractBoardFromParsedHand(hand);
  const cleanBoard = Array.isArray(rawBoard)
    ? rawBoard.filter((c) => typeof c === 'string' && c.trim().length > 0)
    : [];
  const normStreet = String(street || 'preflop').toLowerCase();
  const expectedCount = normStreet === 'preflop' ? 0
    : normStreet === 'turn' ? 4
      : normStreet === 'river' ? 5
        : 3;
  if (expectedCount === 0 || cleanBoard.length === 0) return [];
  if (cleanBoard.length >= expectedCount) {
    return cleanBoard.slice(0, expectedCount);
  }
  return [...cleanBoard];
}

export function rankImportedHandsByEvLeak(hands = [], defaultVariant = 'nlh') {
  if (!Array.isArray(hands) || hands.length === 0) return [];
  const scored = hands.map((hand, idx) => {
    const variant = resolveHandVariant(hand, defaultVariant);
    const rawBoard = Array.isArray(hand?.boardCards) && hand.boardCards.length > 0
      ? hand.boardCards.filter((c) => typeof c === 'string' && c.trim().length > 0)
      : Array.isArray(hand?.board) && hand.board.length > 0
        ? hand.board.filter((c) => typeof c === 'string' && c.trim().length > 0)
        : extractBoardFromParsedHand(hand).filter((c) => typeof c === 'string' && c.trim().length > 0);
    const derivedStreet = rawBoard.length >= 5
      ? 'river'
      : rawBoard.length === 4
        ? 'turn'
        : rawBoard.length >= 3
          ? 'flop'
          : 'preflop';
    const explicitStreet = typeof hand?.street === 'string' && hand.street.trim()
      ? hand.street.trim().toLowerCase()
      : derivedStreet;
    const street = rawBoard.length === 0 ? 'preflop' : explicitStreet;
    const heroPosition = String(hand?.heroPosition || hand?.position || hand?.hero?.position || 'BTN').toUpperCase();
    const rawHeroCards = Array.isArray(hand?.heroCards) && hand.heroCards.length > 0
      ? hand.heroCards.filter((c) => typeof c === 'string' && c.trim().length > 0)
      : Array.isArray(hand?.hero?.holeCards) && hand.hero.holeCards.length > 0
        ? hand.hero.holeCards.filter((c) => typeof c === 'string' && c.trim().length > 0)
        : [];
    const expectedHoleCount = HOLE_CARD_COUNT_BY_VARIANT[variant];
    const isUnsupportedVariant = hand?.supported === false || !expectedHoleCount;
    if (isUnsupportedVariant) {
      return {
        ...hand,
        variant,
        supported: false,
        unsupportedReason: hand?.unsupportedReason || `unsupported_variant:${variant}`,
        street,
        heroPosition,
        heroCards: rawHeroCards,
        board: Array.isArray(hand?.board) && hand.board.length > 0 ? hand.board : rawBoard,
        boardCards: rawBoard,
        potSizeBb: Math.max(0, Number(hand?.potSizeBb || hand?.pot || 0) || 0),
        estimatedEvLossBb: null,
        recommendedAction: null,
        brainSource: null,
        _originalIndex: idx,
      };
    }

    const boardCards = resolveHandBoardCards({ ...hand, boardCards: rawBoard }, street);
    const missingRequiredBoard = street !== 'preflop' && boardCards.length < 3;
    if (rawHeroCards.length !== expectedHoleCount || missingRequiredBoard) {
      return {
        ...hand,
        variant,
        street: boardCards.length === 0 ? 'preflop' : street,
        heroPosition,
        heroCards: rawHeroCards,
        board: Array.isArray(hand?.board) && hand.board.length > 0 ? hand.board : boardCards,
        boardCards,
        potSizeBb: Math.max(0, Number(hand?.potSizeBb || hand?.pot || 0) || 0),
        estimatedEvLossBb: null,
        recommendedAction: null,
        brainSource: null,
        _originalIndex: idx,
      };
    }

    const heroCards = rawHeroCards;
    const potSizeBb = Math.max(1.5, Number(hand?.potSizeBb || hand?.pot || 12) || 12);
    const facingBetBb = Math.max(0, Number(hand?.facingBetBb ?? 4) || 0);
    const effectiveStackBb = Math.max(10, Number(hand?.effectiveStackBb || hand?.stackDepth || 100) || 100);

    let brainDecision = null;
    try {
      brainDecision = evaluateTrainingSpotWithHorseBrain({
        variant,
        street,
        heroPosition,
        heroCards,
        boardCards,
        potSizeBb,
        facingBetBb,
        effectiveStackBb,
      });
    } catch (_) {
      brainDecision = null;
    }

    const explicitLoss = Number(hand?.estimatedEvLossBb ?? hand?.evLoss);
    let estimatedEvLossBb = null;
    if (Number.isFinite(explicitLoss) && explicitLoss > 0) {
      estimatedEvLossBb = Number(explicitLoss.toFixed(2));
    } else if (brainDecision) {
      const actionEvValues = Object.values(brainDecision?.actionEVs || {})
        .map(Number)
        .filter(Number.isFinite);
      const maxEv = actionEvValues.length > 0 ? Math.max(...actionEvValues) : 0;
      const minEv = actionEvValues.length > 0 ? Math.min(...actionEvValues) : 0;
      const evSpread = Math.max(0.35, maxEv - minEv);
      const handScoreFactor = Math.max(0.25, (100 - (Number(brainDecision?.handScore) || 55)) / 100);
      const derived = Math.max(0.25, evSpread * 0.55 + potSizeBb * 0.08 * handScoreFactor);
      estimatedEvLossBb = Number(derived.toFixed(2));
    }

    return {
      ...hand,
      variant,
      street,
      heroPosition,
      heroCards,
      board: Array.isArray(hand?.board) && hand.board.length > 0 ? hand.board : boardCards,
      boardCards,
      potSizeBb,
      estimatedEvLossBb,
      recommendedAction: brainDecision?.recommendedAction || brainDecision?.correctAnswerText || null,
      brainSource: brainDecision ? (brainDecision.engineModule || 'holdem-brain.js') : null,
      _originalIndex: idx,
    };
  });

  scored.sort((a, b) => {
    const aLoss = Number.isFinite(a.estimatedEvLossBb) ? a.estimatedEvLossBb : -1;
    const bLoss = Number.isFinite(b.estimatedEvLossBb) ? b.estimatedEvLossBb : -1;
    const diff = bLoss - aLoss;
    if (Math.abs(diff) > 1e-9) return diff;
    return a._originalIndex - b._originalIndex;
  });

  return scored.map(({ _originalIndex, ...item }, index) => ({
    ...item,
    leakPriorityRank: index + 1,
  }));
}

let _supabase = null;

function getSupabase() {
  if (!_supabase) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      throw new Error('SUPABASE_SERVICE_ROLE_KEY and NEXT_PUBLIC_SUPABASE_URL are required');
    }
    _supabase = createClient(url, key);
  }
  return _supabase;
}

function normalizeClubArenaHand(row, userId) {
  if (!row) return null;
  const uid = String(userId || '').trim();
  const players = Array.isArray(row.players) ? row.players : [];
  const hero = players.find((p) => {
    const pid = String(p?.id || p?.userId || p?.playerId || p?.user_id || '').trim();
    return pid === uid;
  }) || null;
  const candidateSources = [
    row?.hole_cards?.[uid],
    hero?.cards,
    hero?.holeCards,
    hero?.hole_cards,
  ];
  let heroCards = [];
  for (const src of candidateSources) {
    if (Array.isArray(src)) {
      const cleaned = src.filter((c) => typeof c === 'string' && c.trim().length > 0);
      if (cleaned.length > 0) {
        heroCards = cleaned;
        break;
      }
    }
  }
  const rawBoard = Array.isArray(row.community_cards) && row.community_cards.length > 0
    ? row.community_cards
    : Array.isArray(row.board)
      ? row.board
      : [];
  const board = rawBoard.filter((c) => typeof c === 'string' && c.trim().length > 0);
  return {
    id: String(row.id || row.hand_number || ''),
    heroCards,
    board,
    heroPosition: String(hero?.position || 'BTN').toUpperCase(),
  };
}

function isUserParticipantInHandRow(row, userId) {
  const uid = String(userId || '').trim();
  if (!uid || !row) return false;
  const players = Array.isArray(row.players) ? row.players : [];
  return players.some((p) => {
    const pid = String(p?.id || p?.userId || p?.playerId || p?.user_id || '').trim();
    return pid === uid;
  });
}

function extractBoardFromParsedHand(hand) {
  if (Array.isArray(hand?.board) && hand.board.length > 0) return hand.board;
  const board = [];
  if (Array.isArray(hand?.streets?.flop?.board)) board.push(...hand.streets.flop.board);
  if (hand?.streets?.turn?.card) board.push(hand.streets.turn.card);
  if (hand?.streets?.river?.card) board.push(hand.streets.river.card);
  return board;
}

function sanitizeDrillNavigationOptions(rawOptions = {}) {
  const defaultOpts = { source: 'live-hand-sync', returnTo: null };
  const rawSource = typeof rawOptions?.source === 'string' ? rawOptions.source.trim().toLowerCase() : '';
  const source = /^[a-z0-9][a-z0-9_-]{1,63}$/.test(rawSource) ? rawSource : defaultOpts.source;
  const rawReturnTo = typeof rawOptions?.returnTo === 'string' ? rawOptions.returnTo.trim() : '';
  const returnTo = rawReturnTo.startsWith('/hub/')
    && !rawReturnTo.startsWith('//')
    && !rawReturnTo.includes('://')
    && /^\/hub\/[A-Za-z0-9/_\-?=&%.:+]*$/.test(rawReturnTo)
    ? rawReturnTo
    : defaultOpts.returnTo;
  return { source, returnTo };
}

function buildDrillHrefForHand(hand, analysis = null, navOptions = {}) {
  const board = extractBoardFromParsedHand(hand);
  const heroCards = Array.isArray(hand?.hero?.holeCards)
    ? hand.hero.holeCards
    : Array.isArray(hand?.heroCards)
      ? hand.heroCards
      : [];
  const lastDecision = Array.isArray(analysis?.decisions) && analysis.decisions.length > 0
    ? analysis.decisions[analysis.decisions.length - 1]
    : null;
  const street = String(
    board.length >= 5
      ? 'river'
      : board.length === 4
        ? 'turn'
        : board.length >= 3
          ? 'flop'
          : (lastDecision?.street || 'preflop'),
  ).toLowerCase();
  const isTournament = /tournament|mtt/i.test(String(hand?.gameType || ''));
  const isPlo = heroCards.length >= 4 || /plo|omaha/i.test(String(hand?.gameType || ''));
  const targetGameId = isTournament
    ? 'mtt-002'
    : isPlo
      ? 'cash-005'
      : street === 'preflop'
        ? 'cash-001'
        : 'cash-002';
  const nav = sanitizeDrillNavigationOptions(navOptions);
  const params = new URLSearchParams({
    level: '1',
    source: nav.source,
    syncedHandId: String(hand?.id || analysis?.handId || 'hand'),
  });
  if (nav.returnTo) {
    params.set('returnTo', nav.returnTo);
  }
  const resolvedHandVar = resolveHandVariant(hand, 'nlh');
  if (resolvedHandVar === 'omaha_hi_lo' || resolvedHandVar === 'plo8') params.set('variant', 'plo8');
  else if (heroCards.length === 4 || resolvedHandVar === 'plo4') params.set('variant', 'plo4');
  else if (heroCards.length === 5 || resolvedHandVar === 'plo5') params.set('variant', 'plo5');
  else if (heroCards.length === 6 || resolvedHandVar === 'plo6') params.set('variant', 'plo6');
  return `/hub/training/arena/${targetGameId}?${params.toString()}`;
}

export const config = { api: { bodyParser: { sizeLimit: '1mb' } } };

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  res.setHeader('Vary', 'Authorization');
  try {
    if (req.method !== 'POST' && req.method !== 'GET') {
      res.setHeader('Allow', 'GET, POST');
      return res.status(405).json({ success: false, error: 'Method not allowed' });
    }
    if (!applyRateLimit(req, res, LIMITS.write)) return;

    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ success: false, error: 'Authentication required' });
    const { user, error: authError, status: authStatus } = await getServerUserWithFallback(req, getSupabase());
    if (authError || !user) {
      return res.status(authStatus === 503 ? 503 : 401).json({
        success: false,
        error: authStatus === 503 ? 'Session verification unavailable' : 'Invalid token',
      });
    }

    const contextAccess = await checkSandboxAccess(getSupabase(), user.id);
    if (!contextAccess?.allowed || !isFeatureAccessible(contextAccess.accessLevel, 'leak_finder_detect')) {
      return res.status(403).json({
        success: false,
        blocked: true,
        contextState: contextAccess?.contextState || 'session_active_unknown',
        accessLevel: contextAccess?.accessLevel || 'hard_block',
        error: contextAccess?.message || 'Hand history analysis is unavailable during live play or post-session cooldown.',
      });
    }

    if (req.method === 'GET') {
      const requestedHandId = typeof req.query?.handId === 'string' ? req.query.handId.trim() : '';
      const supabase = getSupabase();

      if (requestedHandId) {
        // 1. Check live table hand_history first (only query .eq('id', ...) when UUID)
        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(requestedHandId);
        let liveRow = null;
        try {
          const hhQuery = supabase
            .from('hand_history')
            .select('id, hand_number, game_variant, players, hole_cards, board, community_cards, button_seat, actions, summary, source, created_at');
          const { data: hhData } = isUuid
            ? await hhQuery.eq('id', requestedHandId).maybeSingle()
            : await hhQuery.eq('hand_number', requestedHandId).maybeSingle();
          liveRow = hhData || null;
        } catch (_) {
          liveRow = null;
        }

        if (liveRow) {
          if (!isUserParticipantInHandRow(liveRow, user.id)) {
            return res.status(403).json({
              success: false,
              error: 'Participant-only access: you were not dealt into this hand.',
              code: 'PARTICIPANT_ACCESS_DENIED',
            });
          }
          const normalized = normalizeClubArenaHand(liveRow, user.id);
          const summary = liveRow.summary && typeof liveRow.summary === 'object' ? liveRow.summary : {};
          const handObj = {
            id: String(normalized?.id || liveRow.id),
            site: 'Club Arena',
            gameType: liveRow.game_variant || summary.format || 'Cash',
            stakes: summary.stakes || (summary.bigBlind ? `${Number(summary.smallBlind) || 1}/${Number(summary.bigBlind)}` : '1/2'),
            heroCards: normalized?.heroCards || [],
            board: normalized?.board || liveRow.community_cards || liveRow.board || [],
            heroPosition: normalized?.heroPosition || 'BTN',
            pot: Number(summary.potTotal || summary.pot || 0) || 0,
            participantUserId: user.id,
          };
          handObj.drillHref = buildDrillHrefForHand(handObj, null);
          const [rankedSingle] = rankImportedHandsByEvLeak([handObj]);
          return res.status(200).json({
            success: true,
            participantVerified: true,
            hand: rankedSingle || handObj,
            topLeakHand: rankedSingle || handObj,
          });
        }

        // 2. Check synced hand records in training_tool_records (owner-scoped directly)
        const toolQuery = supabase
          .from('training_tool_records')
          .select('id, user_id, record_type, record_key, data, created_at')
          .eq('user_id', user.id)
          .eq('tool_id', 'synced-hand-history')
          .eq('record_key', requestedHandId);
        const toolRes = typeof toolQuery.maybeSingle === 'function'
          ? await toolQuery.maybeSingle()
          : await toolQuery.limit(1);
        const ownedRow = Array.isArray(toolRes?.data) ? toolRes.data[0] : (toolRes?.data || null);

        if (ownedRow && String(ownedRow.user_id || '') === String(user.id)) {
          const handPayload = ownedRow.data || {};
          const participants = Array.isArray(handPayload.participants)
            ? handPayload.participants.map(String)
            : [String(ownedRow.user_id || '')];
          if (!participants.includes(String(user.id))) {
            return res.status(404).json({
              success: false,
              error: 'Requested hand history was not found.',
              code: 'HAND_NOT_FOUND',
            });
          }
          const [rankedToolHand] = rankImportedHandsByEvLeak([{
            ...handPayload,
            id: String(handPayload.id || ownedRow.record_key),
            participantUserId: user.id,
            drillHref: buildDrillHrefForHand(handPayload, null),
          }]);
          return res.status(200).json({
            success: true,
            participantVerified: true,
            hand: rankedToolHand,
            topLeakHand: rankedToolHand,
          });
        }

        return res.status(404).json({
          success: false,
          error: 'Requested hand history was not found.',
          code: 'HAND_NOT_FOUND',
        });
      }

      // List authenticated user's participant-verified hands (both Club Arena table hands & synced hands)
      const participantHands = [];
      try {
        const filter = [
          `players.cs.${JSON.stringify([{ id: user.id }])}`,
          `players.cs.${JSON.stringify([{ userId: user.id }])}`,
          `players.cs.${JSON.stringify([{ playerId: user.id }])}`,
        ].join(',');
        const { data: liveRows } = await supabase
          .from('hand_history')
          .select('id, hand_number, game_variant, players, hole_cards, board, community_cards, button_seat, actions, summary, source, created_at')
          .or(filter)
          .order('created_at', { ascending: false })
          .limit(20);

        for (const row of liveRows || []) {
          if (!isUserParticipantInHandRow(row, user.id)) continue;
          const normalized = normalizeClubArenaHand(row, user.id);
          const summary = row.summary && typeof row.summary === 'object' ? row.summary : {};
          const normBoard = normalized?.streets
            ? [
                ...(Array.isArray(normalized.streets.flop?.board) ? normalized.streets.flop.board : []),
                ...(normalized.streets.turn?.card ? [normalized.streets.turn.card] : []),
                ...(normalized.streets.river?.card ? [normalized.streets.river.card] : []),
              ]
            : [];
          const item = {
            id: String(normalized?.id || row.id),
            site: 'Club Arena Live Table',
            gameType: row.game_variant || summary.format || 'Cash',
            stakes: summary.stakes || (summary.bigBlind ? `${Number(summary.smallBlind) || 1}/${Number(summary.bigBlind)}` : '1/2'),
            heroCards: normalized?.hero?.holeCards || normalized?.heroCards || [],
            board: normBoard.length > 0 ? normBoard : (normalized?.board || row.community_cards || row.board || []),
            heroPosition: normalized?.hero?.position || normalized?.heroPosition || 'BTN',
            pot: Number(summary.potTotal || summary.pot || 0) || 0,
            createdAt: row.created_at,
            participantUserId: user.id,
          };
          item.drillHref = buildDrillHrefForHand(item, null);
          participantHands.push(item);
        }
      } catch (_) { /* continue to synced tool records */ }

      try {
        const { data: syncedRows } = await supabase
          .from('training_tool_records')
          .select('id, user_id, record_type, record_key, data, created_at')
          .eq('user_id', user.id)
          .eq('tool_id', 'synced-hand-history')
          .order('created_at', { ascending: false })
          .limit(25);

        for (const row of syncedRows || []) {
          if (String(row.user_id) !== String(user.id)) continue;
          const p = row.data || {};
          const recordBoard = Array.isArray(p.board) ? p.board : [];
          const item = {
            id: String(p.id || row.record_key),
            site: p.site || 'Club Arena Sync',
            gameType: p.gameType || 'Cash',
            stakes: p.stakes || '1/2',
            heroCards: Array.isArray(p.heroCards) ? p.heroCards : [],
            board: recordBoard,
            heroPosition: p.heroPosition || 'BTN',
            street: p.street || (recordBoard.length >= 5 ? 'river' : recordBoard.length === 4 ? 'turn' : recordBoard.length >= 3 ? 'flop' : 'preflop'),
            pot: Number(p.pot) || 0,
            solverVerified: Boolean(p.solverVerified),
            evLoss: p.evLoss ?? null,
            createdAt: row.created_at,
            participantUserId: user.id,
            drillHref: buildDrillHrefForHand(p, null),
          };
          if (!participantHands.some((existing) => existing.id === item.id)) {
            participantHands.push(item);
          }
        }
      } catch (_) { /* ignore */ }

      const rankedParticipantHands = rankImportedHandsByEvLeak(participantHands);
      return res.status(200).json({
        success: true,
        participantVerified: true,
        userId: user.id,
        hands: rankedParticipantHands,
        topLeakHand: rankedParticipantHands[0] || null,
      });
    }

    const text = typeof req.body?.handHistoryText === 'string' ? req.body.handHistoryText : '';
    if (!text.trim()) return res.status(400).json({ success: false, error: 'handHistoryText required' });
    if (text.length > 800_000) return res.status(413).json({ success: false, error: 'Hand history file is too large' });

    const hands = parseHandHistory(text).slice(0, 100).map((hand) => {
      const hasStakes = typeof hand?.stakes === 'string' && hand.stakes.trim().length > 0;
      const parsedBlinds = hasStakes ? parseStakesToBlinds(hand.stakes) : null;
      const bigBlind = Number(hand?.bigBlind) > 0
        ? Number(hand.bigBlind)
        : (Number(parsedBlinds?.bigBlind) > 0 ? Number(parsedBlinds.bigBlind) : null);
      const smallBlind = Number(hand?.smallBlind) > 0
        ? Number(hand.smallBlind)
        : (Number(parsedBlinds?.smallBlind) > 0 ? Number(parsedBlinds.smallBlind) : null);

      const players = Array.isArray(hand?.players) ? hand.players : [];
      const heroName = String(hand?.hero?.name || '').trim();
      const heroSeat = hand?.hero?.seat;
      const heroPlayer = players.find((p) =>
        p?.isHero
        || (heroName && String(p?.name || '').trim() === heroName)
        || (heroSeat !== undefined && heroSeat !== null && Number(p?.seat) === Number(heroSeat))
      ) || null;
      const rawHeroChips = Number(
        hand?.hero?.stack ?? hand?.hero?.startingStack ?? heroPlayer?.stack ?? heroPlayer?.startingStack ?? 0,
      );
      const villainStacks = players
        .filter((p) => p && p !== heroPlayer && (!heroName || String(p?.name || '').trim() !== heroName))
        .map((p) => Number(p?.stack ?? p?.startingStack ?? 0))
        .filter((s) => Number.isFinite(s) && s > 0);
      const maxVillainChips = villainStacks.length > 0 ? Math.max(...villainStacks) : null;
      const effectiveChips = rawHeroChips > 0
        ? (maxVillainChips !== null ? Math.min(rawHeroChips, maxVillainChips) : rawHeroChips)
        : null;

      const explicitEffBb = Number(hand?.effectiveStackBb ?? hand?.effective_stack_bb_at_deal);
      const derivedEffBb = Number.isFinite(explicitEffBb) && explicitEffBb > 0
        ? Number(explicitEffBb.toFixed(1))
        : (bigBlind && bigBlind > 0 && effectiveChips && effectiveChips > 0
            ? Number((effectiveChips / bigBlind).toFixed(1))
            : null);

      return {
        ...hand,
        ...(bigBlind !== null ? { bigBlind } : {}),
        ...(smallBlind !== null ? { smallBlind } : {}),
        ...(derivedEffBb !== null ? { effectiveStackBb: derivedEffBb } : {}),
        ...(hand?.hero && rawHeroChips > 0 && !(Number(hand.hero.stack) > 0)
            ? { hero: { ...hand.hero, stack: rawHeroChips } }
            : {}),
      };
    });
    if (hands.length === 0) {
      return res.status(422).json({ success: false, error: 'No supported hand histories were parsed' });
    }

    const rawScope = req.body?.evidenceScope;
    const evidenceScope = (rawScope === 'self_reported_live' || rawScope === 'external_upload')
      ? rawScope
      : 'external_upload';

    const result = await auditParsedHands(getSupabase(), user.id, hands, { maxDecisions: 250, persist: true, evidenceScope: evidenceScope });
    if (result.persisted === false || result.evidenceReconciled === false) {
      return res.status(503).json({
        ...result,
        evidenceScope,
        success: false,
        persisted: false,
        decisionEvidencePersisted: result.persisted !== false,
        evidenceReconciled: result.evidenceReconciled !== false,
        reason: result.persisted === false ? 'write_failed' : 'reconciliation_failed',
        error: result.persisted === false
          ? 'The hand audit completed, but its decision evidence could not be saved.'
          : 'The hand audit was saved, but obsolete decision evidence could not be reconciled. Please retry.',
      });
    }

    const navOptions = sanitizeDrillNavigationOptions({
      source: req.body?.source,
      returnTo: req.body?.returnTo,
    });
    const analysisById = new Map((result.analyses || []).map((a) => [String(a.handId), a]));
    const syncedHands = hands.map((hand) => {
      const analysis = analysisById.get(String(hand.id)) || null;
      const board = extractBoardFromParsedHand(hand);
      const heroCards = Array.isArray(hand?.hero?.holeCards) ? hand.hero.holeCards : [];
      const heroPosition = hand?.hero?.position || analysis?.decisions?.[0]?.heroPosition || analysis?.decisions?.[0]?.position || 'BTN';
      const street = board.length >= 5
        ? 'river'
        : board.length === 4
          ? 'turn'
          : board.length >= 3
            ? 'flop'
            : (analysis?.decisions?.[0]?.street || 'preflop');
      const drillHref = buildDrillHrefForHand(hand, analysis, navOptions);
      if (analysis) {
        analysis.drillHref = drillHref;
        analysis.heroCards = heroCards;
        analysis.board = board;
        analysis.heroPosition = heroPosition;
        analysis.street = street;
      }
      const hasStakesText = typeof hand?.stakes === 'string' && hand.stakes.trim().length > 0;
      const stakesInfo = hasStakesText ? parseStakesToBlinds(hand.stakes) : null;
      const resolvedBigBlind = Number(hand?.bigBlind) > 0
        ? Number(hand.bigBlind)
        : (Number(stakesInfo?.bigBlind) > 0 ? Number(stakesInfo.bigBlind) : 2);
      const resolvedSmallBlind = Number(hand?.smallBlind) > 0
        ? Number(hand.smallBlind)
        : (Number(stakesInfo?.smallBlind) > 0 ? Number(stakesInfo.smallBlind) : Number((resolvedBigBlind / 2).toFixed(2)));
      const stakesLabel = stakesInfo?.stakesLabel
        || (hasStakesText ? hand.stakes.trim() : `${resolvedSmallBlind}/${resolvedBigBlind}`);
      const rawPotChips = Number(hand?.result?.pot ?? hand?.pot ?? 0);
      const potBb = resolvedBigBlind > 0 && rawPotChips > 0
        ? Number((rawPotChips / resolvedBigBlind).toFixed(2))
        : rawPotChips;
      const rawHeroStackChips = Number(hand?.hero?.stack || hand?.hero?.startingStack || 0);
      const stackDepthBb = Number(hand?.effectiveStackBb) > 0
        ? Number(hand.effectiveStackBb)
        : (resolvedBigBlind > 0 && rawHeroStackChips > 0
            ? Number((rawHeroStackChips / resolvedBigBlind).toFixed(2))
            : 100);
      const heroStackChips = rawHeroStackChips > 0
        ? rawHeroStackChips
        : Number((stackDepthBb * resolvedBigBlind).toFixed(2));
      return {
        id: String(hand.id),
        site: hand.site || 'PokerStars',
        gameType: hand.gameType || 'Cash',
        stakes: stakesLabel,
        smallBlind: resolvedSmallBlind,
        bigBlind: resolvedBigBlind,
        heroCards,
        board,
        heroPosition,
        street,
        pot: potBb,
        potSizeBb: potBb,
        potChips: rawPotChips > 0 ? rawPotChips : Number((potBb * resolvedBigBlind).toFixed(2)),
        stackDepth: stackDepthBb,
        effectiveStackBb: stackDepthBb,
        heroStackChips,
        solverVerified: Boolean(analysis?.solverVerified),
        evLoss: analysis?.totalEVLoss ?? null,
        participants: [String(user.id)],
        participantUserId: user.id,
        drillHref,
      };
    });

    const rankedSyncedHands = rankImportedHandsByEvLeak(syncedHands);
    const rankedById = new Map(rankedSyncedHands.map((h) => [String(h.id), h]));
    for (const analysis of result.analyses || []) {
      const ranked = rankedById.get(String(analysis.handId));
      if (ranked) {
        analysis.estimatedEvLossBb = ranked.estimatedEvLossBb;
        analysis.leakPriorityRank = ranked.leakPriorityRank;
        analysis.recommendedAction = ranked.recommendedAction;
        analysis.brainSource = ranked.brainSource;
      }
    }

    try {
      const nowIso = new Date().toISOString();
      const toolRecords = rankedSyncedHands.slice(0, 25).map((h) => ({
        user_id: user.id,
        tool_id: 'synced-hand-history',
        record_type: 'hand',
        record_key: String(h.id).slice(0, 120),
        data: h,
        updated_at: nowIso,
      }));
      if (toolRecords.length > 0) {
        await getSupabase()
          .from('training_tool_records')
          .upsert(toolRecords, { onConflict: 'user_id,tool_id,record_key' });
      }
    } catch (syncPersistErr) {
      console.warn('[HandAudit] Non-fatal synced hand record write warning:', syncPersistErr?.message);
    }

    return res.status(200).json({
      success: true,
      ...result,
      evidenceScope: evidenceScope,
      participantVerified: true,
      syncedHands: rankedSyncedHands,
      hands: rankedSyncedHands,
      topLeakHand: rankedSyncedHands[0] || null,
    });
  } catch (error) {
    try { reportApiError(error, req); } catch (_) { /* reporting must not mask response */ }
    console.warn('[HandAudit] Unhandled error:', error);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
