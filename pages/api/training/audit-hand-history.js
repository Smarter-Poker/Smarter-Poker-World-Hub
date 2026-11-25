import { getServerUserWithFallback } from '../../../src/lib/serverAuth.js';
import { createClient } from '../../../src/lib/supabaseServerClient.js';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit.js';
import { reportApiError } from '../../../src/lib/apiErrorHandler.js';
import { parseHandHistory } from '../../../src/engines/HandHistoryParser.js';
import { auditParsedHands } from '../../../src/lib/training/handAuditEngine.js';
import { buildCustomTrainingArenaHref } from '../../../src/lib/training/customTrainingLaunchContract.mjs';
import { parseStakesToBlinds } from '../../../src/lib/training/clubArenaTableParity.js';
import { evaluateTrainingSpotWithHorseBrain } from '../../../src/lib/training/horseBrainTrainingAdapter.js';

const HERO_CARDS_BY_VARIANT = Object.freeze({
  nlh: ['As', 'Kd'],
  plo4: ['As', 'Ks', 'Qh', 'Jh'],
  plo5: ['As', 'Ks', 'Qh', 'Jh', 'Td'],
  plo6: ['As', 'Ks', 'Qh', 'Jh', 'Td', '9d'],
});

const BOARD_CARDS = Object.freeze(['8d', '5c', '2s', '6h', '3d']);

function resolveHandVariant(hand = {}, defaultVariant = 'nlh') {
  const raw = String(hand?.variant || hand?.gameType || defaultVariant || 'nlh').trim().toLowerCase();
  const heroCards = Array.isArray(hand?.heroCards)
    ? hand.heroCards
    : Array.isArray(hand?.hero?.holeCards)
      ? hand.hero.holeCards
      : [];
  if (raw === 'plo6' || heroCards.length === 6) return 'plo6';
  if (raw === 'plo5' || heroCards.length === 5) return 'plo5';
  if (raw === 'plo4' || /plo|omaha/i.test(raw) || heroCards.length === 4) return 'plo4';
  return 'nlh';
}

function resolveHandBoardCards(hand = {}, street = 'flop') {
  const rawBoard = Array.isArray(hand?.boardCards) && hand.boardCards.length > 0
    ? hand.boardCards
    : Array.isArray(hand?.board) && hand.board.length > 0
      ? hand.board
      : extractBoardFromParsedHand(hand);
  const normStreet = String(street || 'flop').toLowerCase();
  const expectedCount = normStreet === 'preflop' ? 0
    : normStreet === 'turn' ? 4
      : normStreet === 'river' ? 5
        : 3;
  if (expectedCount === 0) return [];
  if (Array.isArray(rawBoard) && rawBoard.length >= expectedCount) {
    return rawBoard.slice(0, expectedCount);
  }
  const combined = [...(Array.isArray(rawBoard) ? rawBoard : [])];
  for (const fallbackCard of BOARD_CARDS) {
    if (combined.length >= expectedCount) break;
    if (!combined.some((c) => String(c).toLowerCase() === fallbackCard.toLowerCase())) {
      combined.push(fallbackCard);
    }
  }
  return combined.slice(0, expectedCount);
}

export function rankImportedHandsByEvLeak(hands = [], defaultVariant = 'nlh') {
  if (!Array.isArray(hands) || hands.length === 0) return [];
  const scored = hands.map((hand, idx) => {
    const variant = resolveHandVariant(hand, defaultVariant);
    const rawBoard = Array.isArray(hand?.boardCards) && hand.boardCards.length > 0
      ? hand.boardCards
      : Array.isArray(hand?.board) && hand.board.length > 0
        ? hand.board
        : extractBoardFromParsedHand(hand);
    const street = String(
      hand?.street
      || (rawBoard.length >= 5 ? 'river' : rawBoard.length === 4 ? 'turn' : rawBoard.length >= 3 ? 'flop' : 'flop'),
    ).toLowerCase();
    const heroPosition = String(hand?.heroPosition || hand?.position || hand?.hero?.position || 'BTN').toUpperCase();
    const rawHeroCards = Array.isArray(hand?.heroCards) && hand.heroCards.length > 0
      ? hand.heroCards
      : Array.isArray(hand?.hero?.holeCards) && hand.hero.holeCards.length > 0
        ? hand.hero.holeCards
        : HERO_CARDS_BY_VARIANT[variant] || HERO_CARDS_BY_VARIANT.nlh;
    const expectedHoleCount = (HERO_CARDS_BY_VARIANT[variant] || HERO_CARDS_BY_VARIANT.nlh).length;
    const heroCards = rawHeroCards.length === expectedHoleCount
      ? rawHeroCards
      : (HERO_CARDS_BY_VARIANT[variant] || HERO_CARDS_BY_VARIANT.nlh);
    const boardCards = resolveHandBoardCards({ ...hand, boardCards: rawBoard }, street);
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
      brainDecision = evaluateTrainingSpotWithHorseBrain({
        variant: 'nlh',
        street: 'flop',
        heroPosition: 'BTN',
        heroCards: ['As', 'Kd'],
        boardCards: ['8d', '5c', '2s'],
        potSizeBb,
        facingBetBb: 4,
        effectiveStackBb: 100,
      });
    }

    const explicitLoss = Number(hand?.estimatedEvLossBb ?? hand?.evLoss);
    let estimatedEvLossBb;
    if (Number.isFinite(explicitLoss) && explicitLoss > 0) {
      estimatedEvLossBb = Number(explicitLoss.toFixed(2));
    } else {
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
      recommendedAction: brainDecision?.recommendedAction || brainDecision?.correctAnswerText || 'Bet 75% Pot',
      brainSource: brainDecision?.engineModule || 'holdem-brain.js',
      _originalIndex: idx,
    };
  });

  scored.sort((a, b) => {
    const diff = b.estimatedEvLossBb - a.estimatedEvLossBb;
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
    _supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
    );
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

function buildDrillHrefForHand(hand, analysis = null) {
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
  const params = new URLSearchParams({
    level: '1',
    source: 'live-hand-sync',
    syncedHandId: String(hand?.id || analysis?.handId || 'hand'),
  });
  if (heroCards.length === 4) params.set('variant', 'plo4');
  else if (heroCards.length === 5) params.set('variant', 'plo5');
  else if (heroCards.length === 6) params.set('variant', 'plo6');
  return `/hub/training/arena/${targetGameId}?${params.toString()}`;
}

export const config = { api: { bodyParser: { sizeLimit: '1mb' } } };

export default async function handler(req, res) {
  try {
    if (!applyRateLimit(req, res, LIMITS.ai)) return;
    if (req.method !== 'POST' && req.method !== 'GET') {
      return res.status(405).json({ success: false, error: 'Method not allowed' });
    }

    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ success: false, error: 'Authentication required' });
    const { user, error: authError } = await getServerUserWithFallback(req, getSupabase());
    if (authError || !user) return res.status(401).json({ success: false, error: 'Invalid token' });

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

        // 2. Check synced hand records in training_tool_records
        const { data: toolRows } = await supabase
          .from('training_tool_records')
          .select('id, user_id, record_type, record_key, data, created_at')
          .eq('tool_id', 'synced-hand-history')
          .eq('record_key', requestedHandId)
          .limit(5);

        if (Array.isArray(toolRows) && toolRows.length > 0) {
          const ownedRow = toolRows.find((r) => {
            const rowData = r?.data || {};
            const participants = Array.isArray(rowData.participants)
              ? rowData.participants.map(String)
              : [String(r?.user_id || '')];
            return String(r?.user_id || '') === String(user.id) && participants.includes(String(user.id));
          });
          if (!ownedRow) {
            return res.status(403).json({
              success: false,
              error: 'Participant-only access: you were not dealt into this hand.',
              code: 'PARTICIPANT_ACCESS_DENIED',
            });
          }
          const handPayload = ownedRow.data || {};
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
          const item = {
            id: String(p.id || row.record_key),
            site: p.site || 'Club Arena Sync',
            gameType: p.gameType || 'Cash',
            stakes: p.stakes || '1/2',
            heroCards: Array.isArray(p.heroCards) ? p.heroCards : [],
            board: Array.isArray(p.board) ? p.board : [],
            heroPosition: p.heroPosition || 'BTN',
            street: p.street || 'flop',
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

    const hands = parseHandHistory(text).slice(0, 100);
    if (hands.length === 0) {
      return res.status(422).json({ success: false, error: 'No supported hand histories were parsed' });
    }

    const result = await auditParsedHands(getSupabase(), user.id, hands, { maxDecisions: 250, persist: true });
    if (result.persisted === false || result.evidenceReconciled === false) {
      return res.status(503).json({
        ...result,
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

    const analysisById = new Map((result.analyses || []).map((a) => [String(a.handId), a]));
    const syncedHands = hands.map((hand) => {
      const analysis = analysisById.get(String(hand.id)) || null;
      const board = extractBoardFromParsedHand(hand);
      const heroCards = Array.isArray(hand?.hero?.holeCards) ? hand.hero.holeCards : [];
      const heroPosition = hand?.hero?.position || analysis?.decisions?.[0]?.position || 'BTN';
      const street = board.length >= 5
        ? 'river'
        : board.length === 4
          ? 'turn'
          : board.length >= 3
            ? 'flop'
            : (analysis?.decisions?.[0]?.street || 'preflop');
      const drillHref = buildDrillHrefForHand(hand, analysis);
      if (analysis) {
        analysis.drillHref = drillHref;
        analysis.heroCards = heroCards;
        analysis.board = board;
        analysis.heroPosition = heroPosition;
        analysis.street = street;
      }
      const stakesInfo = parseStakesToBlinds(hand.stakes || '1/2');
      const rawPotChips = Number(hand?.result?.pot || 0);
      const potBb = stakesInfo.bigBlind > 0 && rawPotChips > 0
        ? Number((rawPotChips / stakesInfo.bigBlind).toFixed(2))
        : rawPotChips;
      const rawHeroStackChips = Number(hand?.hero?.stack || hand?.hero?.startingStack || 0);
      const stackDepthBb = stakesInfo.bigBlind > 0 && rawHeroStackChips > 0
        ? Number((rawHeroStackChips / stakesInfo.bigBlind).toFixed(2))
        : 100;
      const heroStackChips = rawHeroStackChips > 0
        ? rawHeroStackChips
        : Number((stackDepthBb * stakesInfo.bigBlind).toFixed(2));
      return {
        id: String(hand.id),
        site: hand.site || 'PokerStars',
        gameType: hand.gameType || 'Cash',
        stakes: stakesInfo.stakesLabel,
        smallBlind: stakesInfo.smallBlind,
        bigBlind: stakesInfo.bigBlind,
        heroCards,
        board,
        heroPosition,
        street,
        pot: potBb,
        potChips: rawPotChips > 0 ? rawPotChips : Number((potBb * stakesInfo.bigBlind).toFixed(2)),
        stackDepth: stackDepthBb,
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
