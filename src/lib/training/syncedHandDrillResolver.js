/**
 * Server-Authoritative Synced Hand -> Training Drill Resolver
 * ===========================================================
 * Resolves `syncedHandId` strictly from authenticated server storage
 * (`hand_history` and `training_tool_records` where `tool_id = 'synced-hand-history'`),
 * enforces participant-only access (`403 PARTICIPANT_ACCESS_DENIED`), refuses
 * missing (`404 HAND_NOT_FOUND`) or unsupported (`422 HAND_DRILL_UNSUPPORTED`)
 * hands, conceals opponent hole cards, and constructs a 10-hand drill whose
 * first hand is the exact server-stored hand evaluated by Horse Brain / PLO Brain.
 *
 * Client-supplied URL parameters (`syncedHeroCards`, `syncedBoard`, etc.) are
 * never read or trusted by this module.
 */

import { evaluateTrainingSpotWithHorseBrain, validateDealAndPotLimitBounds } from './horseBrainTrainingAdapter.js';
import { generateCuratedPokerConceptBatch } from './curatedPokerConcepts.js';
import { SolverPolicyService } from '../../services/SolverPolicyService.js';

const solverPolicyService = new SolverPolicyService();

const CARD_TOKEN_RE = /[2-9TJQKA][cdhs]/gi;
const VALID_POSITIONS = new Set(['UTG', 'MP', 'HJ', 'CO', 'BTN', 'SB', 'BB']);

function parseCardList(raw) {
  if (Array.isArray(raw)) {
    return raw
      .flatMap((item) => String(item || '').match(CARD_TOKEN_RE) || [])
      .map((c) => `${c[0].toUpperCase()}${c[1].toLowerCase()}`);
  }
  if (typeof raw === 'string') {
    return (raw.match(CARD_TOKEN_RE) || []).map((c) => `${c[0].toUpperCase()}${c[1].toLowerCase()}`);
  }
  return [];
}

function inferVariantFromHoleCards(heroCards = [], rawVariant = '') {
  const explicit = String(rawVariant || '').trim().toLowerCase();
  if (['nlh', 'plo4', 'plo5', 'plo6'].includes(explicit)) return explicit;
  if (heroCards.length === 6) return 'plo6';
  if (heroCards.length === 5) return 'plo5';
  if (heroCards.length === 4) return 'plo4';
  return 'nlh';
}

function inferStreetFromBoard(boardCards = [], rawStreet = '') {
  if (boardCards.length === 0) return 'preflop';
  if (boardCards.length === 3) return 'flop';
  if (boardCards.length === 4) return 'turn';
  if (boardCards.length === 5) return 'river';
  const explicit = String(rawStreet || '').trim().toLowerCase();
  if (['preflop', 'flop', 'turn', 'river'].includes(explicit)) return explicit;
  return 'flop';
}

function normalizePosition(rawPos, fallback = 'BTN') {
  const upper = String(rawPos || '').trim().toUpperCase();
  if (VALID_POSITIONS.has(upper)) return upper;
  return fallback;
}

function verifyParticipant(record, userId) {
  if (!record || !userId) return false;
  const uid = String(userId).trim();
  if (record.user_id && String(record.user_id).trim() === uid) return true;
  if (record.owner_id && String(record.owner_id).trim() === uid) return true;
  if (Array.isArray(record.player_ids) && record.player_ids.map(String).includes(uid)) return true;
  if (Array.isArray(record.participant_ids) && record.participant_ids.map(String).includes(uid)) return true;
  const data = record.data && typeof record.data === 'object' ? record.data : {};
  if (data.userId && String(data.userId).trim() === uid) return true;
  if (Array.isArray(data.participantIds) && data.participantIds.map(String).includes(uid)) return true;
  return false;
}

export async function lookupServerSyncedHand({ supabase, userId, syncedHandId }) {
  const targetId = String(syncedHandId || '').trim();
  if (!targetId) {
    return { ok: false, status: 404, code: 'HAND_NOT_FOUND', error: 'Synced hand ID is required.' };
  }

  let matchedRecord = null;

  // 1. Check training_tool_records (synced-hand-history)
  try {
    const { data: toolRows } = await supabase
      .from('training_tool_records')
      .select('id, user_id, tool_id, record_type, record_key, data, created_at')
      .eq('tool_id', 'synced-hand-history')
      .order('created_at', { ascending: false })
      .limit(100);

    if (Array.isArray(toolRows)) {
      matchedRecord = toolRows.find((row) => {
        const d = row?.data || {};
        return (
          String(row?.record_key || '') === targetId
          || String(row?.id || '') === targetId
          || String(d.id || '') === targetId
          || String(d.handId || '') === targetId
          || String(d.hand_number || '') === targetId
        );
      }) || null;
    }
  } catch (_err) {
    // Continue to hand_history fallback
  }

  // 2. Check hand_history table if not found in tool records
  if (!matchedRecord) {
    try {
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(targetId);
      const query = supabase
        .from('hand_history')
        .select('id, user_id, player_ids, game_type, stakes, pot_size, hero_cards, board, hero_position, action_summary, hand_data, hand_number, created_at')
        .limit(5);
      const { data: hhRows } = isUuid
        ? await query.eq('id', targetId)
        : await query.eq('hand_number', targetId);
      if (Array.isArray(hhRows) && hhRows.length > 0) {
        matchedRecord = hhRows[0];
      }
    } catch (_err) {
      // Ignore schema/table lookup error
    }
  }

  if (!matchedRecord) {
    return {
      ok: false,
      status: 404,
      code: 'HAND_NOT_FOUND',
      error: `Authenticated hand #${targetId} was not found in server hand history.`,
    };
  }

  if (!verifyParticipant(matchedRecord, userId)) {
    return {
      ok: false,
      status: 403,
      code: 'PARTICIPANT_ACCESS_DENIED',
      error: 'Participant-only access: you were not a participant in this hand.',
    };
  }

  const payload = matchedRecord.data && typeof matchedRecord.data === 'object'
    ? matchedRecord.data
    : matchedRecord;
  const handData = payload.hand_data && typeof payload.hand_data === 'object'
    ? payload.hand_data
    : {};

  const heroCards = parseCardList(
    payload.hero_cards || payload.heroCards || handData.hero_cards || handData.heroCards,
  );
  const boardCards = parseCardList(
    payload.board || payload.boardCards || handData.board || handData.boardCards,
  );
  const variant = inferVariantFromHoleCards(heroCards, payload.variant || handData.variant);
  const street = inferStreetFromBoard(boardCards, payload.street || handData.street);
  const heroPosition = normalizePosition(
    payload.hero_position || payload.heroPosition || handData.hero_position || handData.heroPosition,
    'BTN',
  );
  const villainPosition = heroPosition === 'BB' ? 'BTN' : 'BB';
  const rawPot = Number(payload.pot_size ?? payload.pot ?? handData.pot_size ?? handData.pot);
  const pot = Number.isFinite(rawPot) && rawPot > 0
    ? Number(rawPot.toFixed(1))
    : street === 'preflop'
      ? 4.5
      : street === 'flop'
        ? 6.5
        : street === 'turn'
          ? 14
          : 28;
  const rawStack = Number(
    payload.stack_depth ?? payload.stackDepth ?? payload.effectiveStack ?? handData.stack_depth ?? 100,
  );
  const stackDepth = Number.isFinite(rawStack) && rawStack > 0 ? Math.round(rawStack) : 100;
  const rawToCall = Number(payload.to_call ?? payload.toCall ?? handData.toCall ?? 0);
  const toCall = Number.isFinite(rawToCall) && rawToCall >= 0 ? Number(rawToCall.toFixed(1)) : 0;

  return {
    ok: true,
    handRecord: {
      handId: targetId,
      heroCards,
      boardCards,
      variant,
      street,
      heroPosition,
      villainPosition,
      pot,
      toCall,
      stackDepth,
      gameType: String(payload.game_type || payload.gameType || 'cash'),
      stakes: String(payload.stakes || '1/2'),
      actionSummary: String(
        payload.action_summary || payload.actionSummary || handData.action_summary || 'Action reaches Hero',
      ).slice(0, 180),
      participantVerified: true,
    },
  };
}

export async function resolveSyncedHandForTrainingDrill({
  supabase,
  userId,
  syncedHandId,
  gameId = 'cash-001',
  level = 1,
}) {
  const lookup = await lookupServerSyncedHand({ supabase, userId, syncedHandId });
  if (!lookup.ok) return lookup;

  const hand = lookup.handRecord;
  const validation = validateDealAndPotLimitBounds({
    variant: hand.variant,
    street: hand.street,
    heroCards: hand.heroCards,
    boardCards: hand.boardCards,
    pot: hand.pot,
    toCall: hand.toCall,
    effectiveStack: hand.stackDepth,
  });

  if (!validation.ok) {
    return {
      ok: false,
      status: 422,
      code: 'HAND_DRILL_UNSUPPORTED',
      error: validation.error || 'Synced hand cannot be converted into a valid training drill.',
    };
  }

  let brainEval;
  try {
    brainEval = evaluateTrainingSpotWithHorseBrain({
      gameId,
      variant: hand.variant,
      street: hand.street,
      heroCards: hand.heroCards,
      boardCards: hand.boardCards,
      heroPosition: hand.heroPosition,
      villainPosition: hand.villainPosition,
      pot: hand.pot,
      toCall: hand.toCall,
      stackDepth: hand.stackDepth,
    });
  } catch (evalErr) {
    return {
      ok: false,
      status: 422,
      code: 'HAND_DRILL_UNSUPPORTED',
      error: evalErr?.message || 'Unable to evaluate synced hand.',
    };
  }

  const safeHandSlug = String(hand.handId).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 48) || 'hand';
  const variantTitle = hand.variant === 'plo6'
    ? '6-Card PLO (Pot-Limit)'
    : hand.variant === 'plo5'
      ? '5-Card PLO (Pot-Limit)'
      : hand.variant === 'plo4'
        ? '4-Card PLO (Pot-Limit)'
        : "No-Limit Hold'em";
  const isPlo = hand.variant.startsWith('plo');
  const spotType = hand.street === 'preflop'
    ? (hand.heroPosition === 'BB' ? 'bb_defense' : 'rfi')
    : hand.street === 'flop'
      ? 'cbet'
      : hand.street === 'turn'
        ? 'turn_barrel'
        : 'river_value';

  const primaryQuestionRaw = {
    id: `curated_synced_${safeHandSlug}_L${level}_h1`,
    type: 'PIO',
    source: 'CURATED_SCENARIO',
    dataQuality: 'CURATED',
    evidenceDisclosure: 'Expert-authored poker concept; no solver-exact frequency or EV is claimed.',
    question: `[Synced Hand #${hand.handId} · ${variantTitle}] Action reaches Hero in ${hand.heroPosition} on ${hand.street.toUpperCase()}${hand.boardCards.length ? ` (${hand.boardCards.join(' ')})` : ''} with ${hand.heroCards.join(' ')} (${hand.pot} BB pot, ${hand.stackDepth} BB effective). What is your best action?`,
    scenario: {
      isConceptQuestion: true,
      isSyncedHandDrill: true,
      syncedHandId: String(hand.handId),
      street: hand.street,
      variant: hand.variant,
      holeCardCount: hand.heroCards.length,
      bettingStructure: isPlo ? 'pot_limit' : 'no_limit',
      board: hand.boardCards.join(''),
      boardCards: hand.boardCards,
      action: hand.actionSummary,
      context: `${variantTitle} · Authenticated Hand #${hand.handId} (${hand.heroPosition} vs ${hand.villainPosition}).`,
      description: `Server-verified decision drill for Hand #${hand.handId}`,
      heroPosition: hand.heroPosition,
      villainPosition: hand.villainPosition,
      heroStack: hand.stackDepth,
      villainStack: hand.stackDepth,
      stackDepth: hand.stackDepth,
      pot: hand.pot,
      gameType: hand.gameType,
      spotType,
      brainEvaluation: brainEval.brainEvaluation,
      madeHandCategory: brainEval.madeHandCategory,
      potLimitSizing: brainEval.potLimitSizing,
    },
    heroCards: hand.heroCards,
    boardCards: hand.boardCards,
    options: brainEval.options,
    correctAnswer: brainEval.correctAnswer,
    correctAnswerText: brainEval.correctAnswerText,
    explanation: `${brainEval.explanation} This answer comes from the curated concept curriculum.`,
    structuredExplanation: brainEval.structuredExplanation,
    level,
  };

  const companionsRaw = generateCuratedPokerConceptBatch({
    gameId,
    level,
    count: 9,
    gameConfig: {
      pioGameType: isPlo ? 'plo_high' : 'postflop_complete',
      pioStackDepth: hand.stackDepth,
      pioStreet: hand.street,
      variant: hand.variant,
    },
    spotTypes: [spotType],
    stackDepths: [hand.stackDepth],
    positions: [hand.heroPosition, hand.villainPosition],
    targetStreet: hand.street,
  });

  const allRaw = [primaryQuestionRaw, ...companionsRaw].slice(0, 10);
  const questions = allRaw.map((q) => solverPolicyService.attachToQuestion(q, 'get-question'));

  return {
    ok: true,
    questions,
    syncedHand: {
      handId: String(hand.handId),
      heroCards: hand.heroCards,
      boardCards: hand.boardCards,
      board: hand.boardCards.join(' '),
      heroPosition: hand.heroPosition,
      villainPosition: hand.villainPosition,
      street: hand.street,
      variant: hand.variant,
      pot: hand.pot,
      stackDepth: hand.stackDepth,
      engineModule: brainEval.brainEvaluation.engineModule,
      madeHandCategory: brainEval.madeHandCategory,
      participantVerified: true,
    },
  };
}
