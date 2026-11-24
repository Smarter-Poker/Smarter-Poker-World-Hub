import { checkSandboxAccess, isFeatureAccessible } from './contextAuthority.js';
import {
  checkHandForLeak,
  classifyHandAuditEligibility,
  normalizeAuditHand,
  normalizeUserLeakRow,
  parseHandSummary,
  toCardCodes,
} from './leakRecord.js';
import { leakToDrill } from '../sandbox/leakReview.js';
import {
  auditParsedHands,
  clubArenaHandRejectionReason,
  normalizeClubArenaHand,
} from '../training/handAuditEngine.js';
import { solverDecisionGroupKey } from '../training/solverDecisionEvidence.js';

export const HAND_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const HAND_SELECT = [
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

function buildHandMetadata(row, eligibility, heroCards) {
  const summary = parseHandSummary(row?.summary) || {};
  const sb = Number(row?.small_blind ?? summary?.smallBlind ?? summary?.small_blind);
  const bb = Number(row?.big_blind ?? summary?.bigBlind ?? summary?.big_blind);
  const stakes = Number.isFinite(sb) && Number.isFinite(bb) && bb > 0 ? `${sb}/${bb}` : null;
  const board = toCardCodes(row?.community_cards || row?.board || summary?.board) || [];
  return {
    id: String(row.id),
    handNumber: row.hand_number ?? summary?.handNumber ?? null,
    format: eligibility.format,
    formatLabel: eligibility.format === 'tournament' ? 'Tournament' : 'Cash Game',
    variant: eligibility.variant,
    specialFormat: eligibility.specialFormat || null,
    stakes,
    potSize: Number.isFinite(Number(row?.pot_size)) ? Number(row.pot_size) : null,
    board,
    heroCards: heroCards.length >= 2 ? heroCards : null,
    createdAt: row.created_at || null,
  };
}

function formatDecisionRow(row) {
  return {
    decisionKey: row.decision_key || row.decisionKey || null,
    street: row.street || 'preflop',
    heroPosition: row.hero_position || row.heroPosition || null,
    villainPosition: row.villain_position || row.villainPosition || null,
    spotType: row.spot_type || row.spotType || 'general',
    playerAction: row.player_action || row.playerAction || null,
    solverAction: row.solver_action || row.solverAction || null,
    classification: row.classification || 'unpriced',
    selectedFrequency: row.selected_frequency ?? row.selectedFrequency ?? null,
    optimalFrequency: row.optimal_frequency ?? row.optimalFrequency ?? null,
    evLoss: row.ev_loss ?? row.evLoss ?? null,
    evLossMeasured: row.ev_loss_measured === true || row.evLossMeasured === true,
    solverVerified: row.solver_verified === true || row.solverVerified === true,
    solverSource: row.solver_source || row.solverSource || null,
    matchTier: row.match_tier ?? row.matchTier ?? null,
    gameId: row.game_id || row.gameId || null,
  };
}

export function returnUrlForHand(handId, leakId = null) {
  const params = new URLSearchParams({
    hand: String(handId),
    source: 'personal-assistant',
  });
  if (leakId) params.set('leak', String(leakId));
  return `/hub/club-arena/hand-history?${params.toString()}`;
}

/**
 * Pure, dependency-injected single-hand audit execution core.
 * Enforces: private no-store headers, 405 before rate-limit, fail-closed config,
 * owner-scoped hand_history read, server-side live-play/cooldown restrictions,
 * preserved Club Arena card-retention rules, honest unsupported-format handling,
 * and idempotent solver audit persistence.
 */
export async function executeSingleHandAudit(req, res, {
  getDb,
  applyRateLimit,
  limits,
  getUser,
  checkAccess = checkSandboxAccess,
  auditHands = auditParsedHands,
} = {}) {
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  res.setHeader('Vary', 'Authorization');

  if (!['GET', 'POST'].includes(req.method)) {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ success: false, error: 'Method Not Allowed' });
  }

  if (typeof applyRateLimit === 'function') {
    const limit = req.method === 'GET' ? (limits?.read || { max: 60, windowMs: 60_000 }) : limits?.write;
    if (!applyRateLimit(req, res, limit)) return;
  }

  try {
    const db = getDb();
    const { user, error: authError, status: authStatus } = await getUser(req, db);
    if (authError || !user) {
      return res.status(authStatus === 503 ? 503 : 401).json({
        success: false,
        error: authStatus === 503 ? 'Session Verification Temporarily Unavailable' : 'Authentication Required',
      });
    }

    const access = await checkAccess(db, user.id);
    const requiredFeature = req.method === 'POST' ? 'leak_finder_detect' : 'hand_review';
    if (!access?.allowed || !isFeatureAccessible(access.accessLevel, requiredFeature)) {
      return res.status(403).json({
        success: false,
        error: access?.message || 'Hand Audit Is Restricted While Seated At A Live Table Or During Cooldown.',
        code: access?.contextState || 'live_play_restricted',
        access,
      });
    }

    const rawHandId = req.method === 'GET'
      ? (Array.isArray(req.query?.hand) ? req.query.hand[0] : (req.query?.hand ?? req.query?.handId))
      : (req.body?.handId ?? req.body?.hand);
    const handId = String(rawHandId || '').trim();
    if (!HAND_UUID_RE.test(handId)) {
      return res.status(400).json({
        success: false,
        error: 'A Valid Club Arena Hand Identifier Is Required.',
      });
    }

    const readOwnedHand = (membershipKey) => db
      .from('hand_history')
      .select(HAND_SELECT)
      .eq('id', handId)
      .contains('players', JSON.stringify([{ [membershipKey]: user.id }]))
      .maybeSingle();

    const [modernRes, legacyRes] = await Promise.all([
      readOwnedHand('userId'),
      readOwnedHand('id'),
    ]);
    if (modernRes?.error && legacyRes?.error) {
      throw modernRes.error;
    }
    const handRow = modernRes?.data || legacyRes?.data || null;
    if (!handRow) {
      return res.status(404).json({
        success: false,
        error: 'Hand Not Found In Your Club Arena History.',
      });
    }

    // Permitted owner-only private card lookup from ca_hand_facts.
    // Preserves Club Arena card-retention policy (never stores or synthesizes
    // mucked/preflop-fold hole cards).
    let privateCards = [];
    try {
      const factRes = await db
        .from('ca_hand_facts')
        .select('hand_id, hole_cards')
        .eq('user_id', user.id)
        .eq('hand_id', handId)
        .maybeSingle();
      if (!factRes?.error && factRes?.data?.hole_cards) {
        privateCards = toCardCodes(factRes.data.hole_cards) || [];
      }
    } catch (_) {
      privateCards = [];
    }

    const hydratedRow = privateCards.length >= 2
      ? { ...handRow, hero_private_cards: privateCards }
      : handRow;

    const eligibility = classifyHandAuditEligibility(hydratedRow, { requireExplicitVariant: true });
    const summaryObj = parseHandSummary(hydratedRow.summary) || {};
    const rawPlayers = Array.isArray(summaryObj.players) && summaryObj.players.length > 0
      ? summaryObj.players
      : (Array.isArray(hydratedRow.players) ? hydratedRow.players : []);
    const heroRaw = rawPlayers.find(p => String(p?.userId ?? p?.id ?? p?.playerId) === String(user.id)) || {};
    const resolvedHeroCards = [
      hydratedRow.hero_private_cards,
      heroRaw.holeCards,
      heroRaw.heroCards,
      heroRaw.cards,
      hydratedRow.hole_cards?.[user.id],
    ].map(toCardCodes).find(candidate => Array.isArray(candidate) && candidate.length >= 2) || [];

    const handMeta = buildHandMetadata(hydratedRow, eligibility, resolvedHeroCards);

    if (!eligibility.eligible) {
      return res.status(200).json({
        success: true,
        supported: false,
        audited: false,
        reason: eligibility.reason,
        limitation: eligibility.limitation,
        hand: handMeta,
        decisions: [],
        solverVerifiedCount: 0,
        unpricedCount: 0,
        matchedLeaks: [],
        trainingAction: null,
        returnToClubArenaHref: returnUrlForHand(handId),
      });
    }

    const rejectionReason = clubArenaHandRejectionReason(hydratedRow, user.id);
    if (rejectionReason === 'missing_private_cards') {
      return res.status(200).json({
        success: true,
        supported: true,
        audited: false,
        reason: 'missing_private_cards',
        limitation: 'Hero Hole Cards Are Not Retained For This Hand Under Club Arena Card-Retention Rules, So Solver Decisions Remain Explicitly Unmeasured.',
        hand: handMeta,
        decisions: [],
        solverVerifiedCount: 0,
        unpricedCount: 0,
        matchedLeaks: [],
        trainingAction: null,
        returnToClubArenaHref: returnUrlForHand(handId),
      });
    }

    const normalizedHand = normalizeClubArenaHand(hydratedRow, user.id);
    if (!normalizedHand) {
      return res.status(200).json({
        success: true,
        supported: false,
        audited: false,
        reason: rejectionReason || 'incomplete_hand_structure',
        limitation: 'This Hand Does Not Contain Complete Single-Board Hold\'em Decision Structure For Deterministic Solver Grading.',
        hand: handMeta,
        decisions: [],
        solverVerifiedCount: 0,
        unpricedCount: 0,
        matchedLeaks: [],
        trainingAction: null,
        returnToClubArenaHref: returnUrlForHand(handId),
      });
    }

    const externalId = `club-arena:${handId}`;
    let decisions = [];
    let persisted = false;

    const shouldAuditNow = req.method === 'POST';
    if (!shouldAuditNow) {
      const existingRes = await db
        .from('hand_audit_decisions')
        .select('decision_key, game_id, street, hero_position, villain_position, spot_type, player_action, solver_action, selected_frequency, optimal_frequency, classification, ev_loss, ev_loss_measured, solver_verified, solver_source, match_tier')
        .eq('user_id', user.id)
        .eq('hand_external_id', externalId)
        .order('audited_at', { ascending: true })
        .limit(12);
      if (!existingRes?.error && Array.isArray(existingRes.data) && existingRes.data.length > 0) {
        decisions = existingRes.data.map(formatDecisionRow);
        persisted = true;
      }
    }

    if (decisions.length === 0 || shouldAuditNow) {
      const auditRes = await auditHands(db, user.id, [normalizedHand], {
        maxDecisions: 12,
        persist: shouldAuditNow,
        reconcileExisting: shouldAuditNow,
      });
      persisted = auditRes?.persisted === true;
      const handAnalysis = auditRes?.analyses?.[0];
      decisions = (handAnalysis?.decisions || []).map(formatDecisionRow);
    }

    const auditLeakTypes = new Set(
      decisions
        .filter(d => d.solverVerified && d.classification !== 'correct')
        .map(d => solverDecisionGroupKey({
          scope: 'club_arena',
          gameId: d.gameId,
          street: d.street,
          position: d.heroPosition,
          spotType: d.spotType,
        })),
    );

    const normalizedForPatterns = normalizeAuditHand(hydratedRow, user.id);
    const leaksRes = await db
      .from('user_leaks')
      .select('id, leak_type, leak_category, situation_class, status, avg_ev_loss_bb, occurrence_count, recommended_drill, source_system, is_active')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false })
      .limit(100);

    const ownedLeaks = (!leaksRes?.error && Array.isArray(leaksRes.data))
      ? leaksRes.data.map(normalizeUserLeakRow)
      : [];

    const matchedLeaks = ownedLeaks.filter(leak => {
      if (auditLeakTypes.has(leak.leak_type)) return true;
      if (leak.status !== 'resolved' && checkHandForLeak(normalizedForPatterns, leak.leak_type)) return true;
      return false;
    }).slice(0, 5);

    const primaryLeak = matchedLeaks[0] || null;
    const mistakeDecision = decisions.find(d => d.solverVerified && d.classification !== 'correct') || decisions[0] || null;
    const trainingAction = primaryLeak
      ? {
          leakId: String(primaryLeak.id),
          title: primaryLeak.situation_class || primaryLeak.leak_type,
          status: primaryLeak.status,
          drillParams: leakToDrill(primaryLeak),
        }
      : (mistakeDecision
          ? {
              leakId: null,
              title: `${String(mistakeDecision.street || 'Flop').replace(/^\w/, c => c.toUpperCase())} ${mistakeDecision.heroPosition || ''} Decision Review`.trim(),
              status: 'spot_review',
              drillParams: leakToDrill({
                leakCategory: mistakeDecision.street,
                leakType: mistakeDecision.spotType,
                recommendedDrill: mistakeDecision.gameId,
                heroPosition: mistakeDecision.heroPosition,
              }),
            }
          : null);

    const solverVerifiedCount = decisions.filter(d => d.solverVerified).length;
    const unpricedCount = decisions.length - solverVerifiedCount;

    return res.status(200).json({
      success: true,
      supported: true,
      audited: true,
      persisted,
      reason: null,
      limitation: solverVerifiedCount === 0 && decisions.length > 0
        ? 'No Exact Certified Solver Node Matched This Board And Action Line. Decisions Remain Explicitly Unmeasured Rather Than Estimated.'
        : null,
      hand: handMeta,
      decisions,
      solverVerifiedCount,
      unpricedCount,
      matchedLeaks: matchedLeaks.map(l => ({
        id: String(l.id),
        leakType: l.leak_type,
        title: l.situation_class,
        category: l.leak_category,
        status: l.status,
        occurrenceCount: l.occurrence_count,
        avgEvLossBB: l.avg_ev_loss_bb ?? null,
        recommendedDrill: l.recommended_drill || null,
      })),
      trainingAction,
      returnToClubArenaHref: returnUrlForHand(handId, primaryLeak?.id || null),
    });
  } catch (error) {
    console.warn('[assistant/leaks/hand-audit] request failed:', error?.message || error);
    return res.status(503).json({
      success: false,
      error: 'Hand Audit Is Temporarily Unavailable.',
    });
  }
}
