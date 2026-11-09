import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { reportApiError } from '../../../src/lib/apiErrorHandler';
import { parseHandHistory } from '../../../src/engines/HandHistoryParser';
import { auditParsedHands } from '../../../src/lib/training/handAuditEngine';
import { buildCustomTrainingArenaHref } from '../../../src/lib/training/customTrainingLaunchContract.mjs';

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
  const heroCards = Array.isArray(hero?.cards)
    ? hero.cards
    : Array.isArray(hero?.holeCards)
      ? hero.holeCards
      : Array.isArray(hero?.hole_cards)
        ? hero.hole_cards
        : [];
  const board = Array.isArray(row.community_cards) ? row.community_cards : [];
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
  const firstDecision = Array.isArray(analysis?.decisions) && analysis.decisions.length > 0
    ? analysis.decisions[0]
    : null;
  const street = String(
    firstDecision?.street
      || (board.length >= 5 ? 'river' : board.length === 4 ? 'turn' : board.length >= 3 ? 'flop' : 'preflop'),
  ).toLowerCase();
  const position = String(
    firstDecision?.position
      || hand?.hero?.position
      || hand?.heroPosition
      || 'BTN',
  ).toUpperCase();
  const gameType = /tournament|mtt/i.test(String(hand?.gameType || '')) ? 'mtt' : 'cash';
  const stackDepth = Number(hand?.hero?.stackBb || hand?.stackDepth || 100) || 100;
  const baseHref = buildCustomTrainingArenaHref(
    {
      gameType,
      position,
      street,
      stackDepth,
    },
    'live-hand-sync',
  );
  const sep = baseHref.includes('?') ? '&' : '?';
  const params = new URLSearchParams();
  params.set('syncedHandId', String(hand?.id || analysis?.handId || 'hand'));
  if (heroCards.length >= 2) {
    params.set('syncedHeroCards', heroCards.join(''));
    if (heroCards.length === 4) params.set('variant', 'plo4');
    else if (heroCards.length === 5) params.set('variant', 'plo5');
    else if (heroCards.length === 6) params.set('variant', 'plo6');
  }
  if (board.length > 0) params.set('syncedBoard', board.join(''));
  return `${baseHref}${sep}${params.toString()}`;
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
        // 1. Check live table hand_history first
        const { data: liveRow } = await supabase
          .from('hand_history')
          .select('id, table_id, club_id, hand_number, game_variant, stakes, players, community_cards, actions, pot_total, winners, completed_at, created_at')
          .eq('id', requestedHandId)
          .maybeSingle();

        if (liveRow) {
          if (!isUserParticipantInHandRow(liveRow, user.id)) {
            return res.status(403).json({
              success: false,
              error: 'Participant-only access: you were not dealt into this hand.',
              code: 'PARTICIPANT_ACCESS_DENIED',
            });
          }
          const normalized = normalizeClubArenaHand(liveRow, user.id);
          const handObj = {
            id: String(normalized?.id || liveRow.id),
            site: 'Club Arena',
            gameType: liveRow.game_variant || 'Cash',
            stakes: liveRow.stakes || '1/2',
            heroCards: normalized?.heroCards || [],
            board: normalized?.board || liveRow.community_cards || [],
            heroPosition: normalized?.heroPosition || 'BTN',
            pot: Number(liveRow.pot_total) || 0,
            participantUserId: user.id,
          };
          handObj.drillHref = buildDrillHrefForHand(handObj, null);
          return res.status(200).json({
            success: true,
            participantVerified: true,
            hand: handObj,
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
          return res.status(200).json({
            success: true,
            participantVerified: true,
            hand: {
              ...handPayload,
              id: String(handPayload.id || ownedRow.record_key),
              participantUserId: user.id,
              drillHref: handPayload.drillHref || buildDrillHrefForHand(handPayload, null),
            },
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
          .select('id, table_id, club_id, hand_number, game_variant, stakes, players, community_cards, actions, pot_total, winners, completed_at, created_at')
          .or(filter)
          .order('created_at', { ascending: false })
          .limit(20);

        for (const row of liveRows || []) {
          if (!isUserParticipantInHandRow(row, user.id)) continue;
          const normalized = normalizeClubArenaHand(row, user.id);
          const item = {
            id: String(normalized?.id || row.id),
            site: 'Club Arena Live Table',
            gameType: row.game_variant || 'Cash',
            stakes: row.stakes || '1/2',
            heroCards: normalized?.heroCards || [],
            board: normalized?.board || row.community_cards || [],
            heroPosition: normalized?.heroPosition || 'BTN',
            pot: Number(row.pot_total) || 0,
            createdAt: row.completed_at || row.created_at,
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
            drillHref: p.drillHref || buildDrillHrefForHand(p, null),
          };
          if (!participantHands.some((existing) => existing.id === item.id)) {
            participantHands.push(item);
          }
        }
      } catch (_) { /* ignore */ }

      return res.status(200).json({
        success: true,
        participantVerified: true,
        userId: user.id,
        hands: participantHands,
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
      const street = analysis?.decisions?.[0]?.street
        || (board.length >= 5 ? 'river' : board.length === 4 ? 'turn' : board.length >= 3 ? 'flop' : 'preflop');
      const drillHref = buildDrillHrefForHand(hand, analysis);
      if (analysis) {
        analysis.drillHref = drillHref;
        analysis.heroCards = heroCards;
        analysis.board = board;
        analysis.heroPosition = heroPosition;
        analysis.street = street;
      }
      return {
        id: String(hand.id),
        site: hand.site || 'PokerStars',
        gameType: hand.gameType || 'Cash',
        stakes: hand.stakes || '1/2',
        heroCards,
        board,
        heroPosition,
        street,
        pot: Number(hand?.result?.pot || 0),
        solverVerified: Boolean(analysis?.solverVerified),
        evLoss: analysis?.totalEVLoss ?? null,
        participants: [String(user.id)],
        participantUserId: user.id,
        drillHref,
      };
    });

    try {
      const nowIso = new Date().toISOString();
      const toolRecords = syncedHands.slice(0, 25).map((h) => ({
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
      syncedHands,
    });
  } catch (error) {
    try { reportApiError(error, req); } catch (_) { /* reporting must not mask response */ }
    console.warn('[HandAudit] Unhandled error:', error);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
