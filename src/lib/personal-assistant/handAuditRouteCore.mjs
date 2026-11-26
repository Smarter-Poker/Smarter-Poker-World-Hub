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
  resolveStackDepthBb,
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

const STREET_ORDER = { preflop: 0, flop: 1, turn: 2, river: 3 };
const ORDERED_STREETS = ['preflop', 'flop', 'turn', 'river'];

export function buildHandMetadata(row, eligibility = {}, heroCards = [], {
  heroRaw = null,
  normalizedHand = null,
  decisions = [],
  streetTimeline = [],
} = {}) {
  const summary = parseHandSummary(row?.summary) || {};
  const sb = Number(row?.small_blind ?? summary?.smallBlind ?? summary?.small_blind);
  const bb = Number(row?.big_blind ?? summary?.bigBlind ?? summary?.big_blind ?? normalizedHand?.bigBlind);
  const stakes = Number.isFinite(sb) && Number.isFinite(bb) && bb > 0 ? `${sb}/${bb}` : null;
  const board = toCardCodes(row?.community_cards || row?.board || summary?.board) || [];

  const rawPot = row?.pot_size ?? row?.potSize ?? row?.pot ?? summary?.potSize ?? summary?.pot_size ?? summary?.pot;
  const potSize = rawPot !== null && rawPot !== undefined && rawPot !== '' && Number.isFinite(Number(rawPot))
    ? Number(rawPot)
    : null;
  const potBb = potSize !== null && Number.isFinite(bb) && bb > 0
    ? +(potSize / bb).toFixed(2)
    : null;

  const rawEffCandidates = [
    row?.effectiveStackBb,
    row?.effective_stack_bb,
    row?.hero_effective_stack_bb,
    row?.effective_stack_bb_at_deal,
    normalizedHand?.effectiveStackBb,
    normalizedHand?.hero?.effectiveStackBb,
    normalizedHand?.hero?.stack,
  ];
  let effectiveStackBb = null;
  for (const candidate of rawEffCandidates) {
    if (candidate !== null && candidate !== undefined && candidate !== '') {
      const parsed = Number(candidate);
      if (Number.isFinite(parsed) && parsed > 0) {
        effectiveStackBb = Math.round(parsed * 10) / 10;
        break;
      }
    }
  }
  if (effectiveStackBb === null && normalizedHand) {
    effectiveStackBb = resolveStackDepthBb(normalizedHand, {});
  }

  const rawHeroPos = normalizedHand?.hero?.position
    || heroRaw?.position
    || (Array.isArray(decisions) ? decisions.find(d => d?.heroPosition || d?.hero_position)?.heroPosition || decisions.find(d => d?.heroPosition || d?.hero_position)?.hero_position : null)
    || (Array.isArray(streetTimeline)
      ? streetTimeline.flatMap(st => Array.isArray(st?.actions) ? st.actions : []).find(a => a?.isHero && a?.position)?.position
      : null)
    || null;
  const heroPosition = rawHeroPos ? String(rawHeroPos).trim().toUpperCase() || null : null;

  let maxStreetIdx = board.length >= 5 ? 3 : board.length === 4 ? 2 : board.length >= 3 ? 1 : 0;
  const considerStreet = (st) => {
    const clean = String(st || '').trim().toLowerCase();
    if (Object.prototype.hasOwnProperty.call(STREET_ORDER, clean)) {
      maxStreetIdx = Math.max(maxStreetIdx, STREET_ORDER[clean]);
    }
  };
  for (const st of Array.isArray(streetTimeline) ? streetTimeline : []) considerStreet(st?.street);
  for (const dec of Array.isArray(decisions) ? decisions : []) considerStreet(dec?.street);
  if (normalizedHand?.streets) {
    for (const s of ORDERED_STREETS) {
      if (normalizedHand.streets[s]) considerStreet(s);
    }
  }
  for (const act of Array.isArray(row?.actions) ? row.actions : []) {
    considerStreet(act?.street || act?.stage);
  }
  const street = ORDERED_STREETS[maxStreetIdx] || 'preflop';

  return {
    id: String(row?.id ?? ''),
    handNumber: row?.hand_number ?? summary?.handNumber ?? null,
    format: eligibility.format,
    formatLabel: eligibility.format === 'tournament' ? 'Tournament' : 'Cash Game',
    variant: eligibility.variant,
    specialFormat: eligibility.specialFormat || null,
    stakes,
    potSize,
    pot: potSize,
    potBb,
    effectiveStackBb,
    effectiveStack: effectiveStackBb,
    heroPosition,
    street,
    board,
    heroCards: Array.isArray(heroCards) && heroCards.length >= 2 ? heroCards : null,
    createdAt: row?.created_at || null,
  };
}

export function formatDecisionRow(row) {
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
    evLossMeasured: Boolean(row.ev_loss_measured ?? row.evLossMeasured),
    solverVerified: row.solver_verified === true || row.solverVerified === true,
    solverSource: row.solver_source || row.solverSource || null,
    matchTier: row.match_tier ?? row.matchTier ?? null,
    gameId: row.game_id || row.gameId || null,
  };
}

const ALLOWED_DRILL_POSITIONS = new Set(['UTG', 'MP', 'CO', 'BTN', 'SB', 'BB', 'Any']);

function normalizeDrillPosition(pos) {
  const upper = String(pos || '').trim().toUpperCase();
  if (!upper) return null;
  if (ALLOWED_DRILL_POSITIONS.has(upper)) return upper;
  if (upper === 'EP' || upper === 'UTG+1' || upper === 'UTG1') return 'UTG';
  if (upper === 'HJ' || upper === 'LJ' || upper === 'MP+1' || upper === 'MP1') return 'MP';
  return 'Any';
}

function buildStreetTimeline(normalizedHand) {
  const streets = normalizedHand?.streets || {};
  const flopBoard = Array.isArray(streets.flop?.board) ? streets.flop.board.filter(Boolean) : [];
  const turnCard = streets.turn?.card || null;
  const riverCard = streets.river?.card || null;
  const fallbackBoard = Array.isArray(normalizedHand?.board) ? normalizedHand.board.filter(Boolean) : [];
  const fullBoard = flopBoard.length >= 3
    ? [...flopBoard.slice(0, 3), ...(turnCard ? [turnCard] : []), ...(riverCard ? [riverCard] : [])]
    : fallbackBoard;

  const ordered = [];
  for (const street of ['preflop', 'flop', 'turn', 'river']) {
    const actions = Array.isArray(streets[street]?.actions) ? streets[street].actions : [];
    if (actions.length === 0) continue;
    ordered.push({
      street,
      board: street === 'preflop'
        ? []
        : (street === 'flop'
            ? fullBoard.slice(0, 3)
            : (street === 'turn'
                ? fullBoard.slice(0, 4)
                : fullBoard.slice(0, 5))),
      actions: actions.slice(0, 12).map(a => ({
        position: a.position || null,
        action: a.action || null,
        amount: Number.isFinite(Number(a.amount)) ? Number(a.amount) : null,
        potBeforeBB: Number.isFinite(Number(a.potBeforeBB)) ? +Number(a.potBeforeBB).toFixed(2) : null,
        isHero: a.isHero === true,
      })),
    });
  }
  return ordered;
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

    // Fast path: single-round-trip owner-scoped RPC (`get_pa_linked_hand_bundle`)
    // when available in the database, with transparent fallback to direct
    // owner-scoped queries so rolling deployments never fail.
    let handRow = null;
    let privateCards = [];
    let effectiveStackBb = null;
    let preloadedDecisions = null;
    let preloadedLeaks = null;
    let usedSingleRoundTrip = false;

    if (typeof db.rpc === 'function') {
      try {
        const bundleRes = await db.rpc('get_pa_linked_hand_bundle', {
          p_user_id: user.id,
          p_hand_id: handId,
        });
        if (!bundleRes?.error && bundleRes?.data && typeof bundleRes.data === 'object' && 'found' in bundleRes.data) {
          usedSingleRoundTrip = true;
          if (!bundleRes.data.found) {
            return res.status(404).json({
              success: false,
              error: 'Hand Not Found In Your Club Arena History.',
            });
          }
          handRow = bundleRes.data.hand || null;
          if (bundleRes.data.fact?.hole_cards) {
            privateCards = toCardCodes(bundleRes.data.fact.hole_cards) || [];
          }
          const rpcEffStack = Number(bundleRes.data.fact?.effective_stack_bb_at_deal);
          if (Number.isFinite(rpcEffStack) && rpcEffStack > 0) {
            effectiveStackBb = rpcEffStack;
          }
          if (Array.isArray(bundleRes.data.decisions)) {
            preloadedDecisions = bundleRes.data.decisions;
          }
          if (Array.isArray(bundleRes.data.leaks)) {
            preloadedLeaks = bundleRes.data.leaks;
          }
        }
      } catch (_) {
        usedSingleRoundTrip = false;
      }
    }

    if (!usedSingleRoundTrip) {
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
      handRow = modernRes?.data || legacyRes?.data || null;
      if (!handRow) {
        return res.status(404).json({
          success: false,
          error: 'Hand Not Found In Your Club Arena History.',
        });
      }

      // Permitted owner-only private card & effective stack lookup from ca_hand_facts.
      // Preserves Club Arena card-retention policy (never stores or synthesizes
      // mucked/preflop-fold hole cards).
      try {
        const factRes = await db
          .from('ca_hand_facts')
          .select('hand_id, hole_cards, effective_stack_bb_at_deal')
          .eq('user_id', user.id)
          .eq('hand_id', handId)
          .maybeSingle();
        if (!factRes?.error && factRes?.data) {
          if (factRes.data.hole_cards) {
            privateCards = toCardCodes(factRes.data.hole_cards) || [];
          }
          const factEffStack = Number(factRes.data.effective_stack_bb_at_deal);
          if (Number.isFinite(factEffStack) && factEffStack > 0) {
            effectiveStackBb = factEffStack;
          }
        }
      } catch (_) {
        privateCards = [];
      }
    }

    const hydratedRow = {
      ...handRow,
      ...(privateCards.length >= 2 ? { hero_private_cards: privateCards } : {}),
      ...(effectiveStackBb !== null ? { hero_effective_stack_bb: effectiveStackBb } : {}),
    };

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

    const handMeta = buildHandMetadata(hydratedRow, eligibility, resolvedHeroCards, { heroRaw });

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
      if (Array.isArray(preloadedDecisions) && preloadedDecisions.length > 0) {
        decisions = preloadedDecisions.map(formatDecisionRow);
        persisted = true;
      } else {
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
    }

    const canComputeLiveSolver = isFeatureAccessible(access.accessLevel, 'leak_finder_detect');
    let cooldownBlockedLiveGrade = false;
    if (decisions.length === 0 || shouldAuditNow) {
      if (!canComputeLiveSolver) {
        cooldownBlockedLiveGrade = true;
      } else {
        const auditRes = await auditHands(db, user.id, [normalizedHand], {
          maxDecisions: 12,
          persist: shouldAuditNow,
          reconcileExisting: shouldAuditNow,
          evidenceScope: 'club_arena',
        });
        persisted = auditRes?.persisted === true;
        const handAnalysis = auditRes?.analyses?.[0];
        decisions = (handAnalysis?.decisions || []).map(formatDecisionRow);
      }
    }

    const isMistakeClassification = (cls) => !['best', 'correct'].includes(String(cls || '').toLowerCase());

    const auditLeakTypes = new Set(
      decisions
        .filter(d => d.solverVerified && isMistakeClassification(d.classification))
        .map(d => solverDecisionGroupKey({
          evidenceScope: 'club_arena',
          gameId: d.gameId,
          street: d.street,
          position: d.heroPosition,
          spotType: d.spotType,
        })),
    );

    const normalizedForPatterns = normalizeAuditHand(hydratedRow, user.id);
    let rawOwnedLeaks = preloadedLeaks;
    if (!Array.isArray(rawOwnedLeaks)) {
      const leaksRes = await db
        .from('user_leaks')
        .select('id, leak_type, leak_category, situation_class, status, avg_ev_loss_bb, occurrence_count, recommended_drill, source_system, is_active')
        .eq('user_id', user.id)
        .order('updated_at', { ascending: false })
        .limit(100);
      rawOwnedLeaks = (!leaksRes?.error && Array.isArray(leaksRes.data)) ? leaksRes.data : [];
    }

    const ownedLeaks = rawOwnedLeaks.map(normalizeUserLeakRow);

    const matchedLeaks = ownedLeaks.filter(leak => {
      if (auditLeakTypes.has(leak.leak_type)) return true;
      if (leak.status !== 'resolved' && checkHandForLeak(normalizedForPatterns, leak.leak_type)) return true;
      return false;
    }).slice(0, 5);

    const primaryLeak = matchedLeaks[0] || null;
    // Seed drills from the largest EV-loss verified mistake in the hand first.
    const verifiedMistakes = decisions
      .filter(d => d.solverVerified && isMistakeClassification(d.classification))
      .sort((a, b) => (Math.abs(Number(b.evLoss) || 0) - Math.abs(Number(a.evLoss) || 0)));
    const mistakeDecision = verifiedMistakes[0] || decisions[0] || null;
    const safeDrillPosition = normalizeDrillPosition(mistakeDecision?.heroPosition);
    const trainingAction = primaryLeak
      ? {
          leakId: String(primaryLeak.id),
          title: primaryLeak.situation_class || primaryLeak.leak_type,
          status: primaryLeak.status,
          street: mistakeDecision?.street || primaryLeak.leak_category || null,
          position: mistakeDecision?.heroPosition || null,
          evLossBB: mistakeDecision?.evLossMeasured ? mistakeDecision.evLoss : (primaryLeak.avg_ev_loss_bb ?? null),
          drillParams: {
            ...leakToDrill(primaryLeak),
            ...(mistakeDecision?.gameId ? { game: mistakeDecision.gameId } : {}),
            ...(mistakeDecision?.street ? { street: String(mistakeDecision.street).replace(/^\w/, c => c.toUpperCase()) } : {}),
            ...(safeDrillPosition ? { position: safeDrillPosition } : {}),
          },
        }
      : (mistakeDecision
          ? {
              leakId: null,
              title: `${String(mistakeDecision.street || 'Flop').replace(/^\w/, c => c.toUpperCase())} ${mistakeDecision.heroPosition || ''} Decision Review`.trim(),
              status: 'spot_review',
              street: mistakeDecision.street || null,
              position: mistakeDecision.heroPosition || null,
              evLossBB: mistakeDecision.evLossMeasured ? mistakeDecision.evLoss : null,
              drillParams: {
                ...leakToDrill({
                  leakCategory: mistakeDecision.street,
                  leakType: mistakeDecision.spotType,
                  recommendedDrill: mistakeDecision.gameId,
                  heroPosition: mistakeDecision.heroPosition,
                }),
                ...(mistakeDecision.gameId ? { game: mistakeDecision.gameId } : {}),
                ...(mistakeDecision.street ? { street: String(mistakeDecision.street).replace(/^\w/, c => c.toUpperCase()) } : {}),
                ...(safeDrillPosition ? { position: safeDrillPosition } : {}),
              },
            }
          : null);

    const solverVerifiedCount = decisions.filter(d => d.solverVerified).length;
    const unpricedCount = decisions.length - solverVerifiedCount;
    const streetTimeline = buildStreetTimeline(normalizedHand);
    const enrichedHandMeta = buildHandMetadata(hydratedRow, eligibility, resolvedHeroCards, {
      heroRaw,
      normalizedHand,
      decisions,
      streetTimeline,
    });

    return res.status(200).json({
      success: true,
      supported: true,
      audited: !cooldownBlockedLiveGrade,
      persisted,
      singleRoundTrip: usedSingleRoundTrip,
      reason: cooldownBlockedLiveGrade ? 'cooldown_active' : null,
      limitation: cooldownBlockedLiveGrade
        ? 'Post-Session Cooldown Active. Live Solver Grading Unlocks Once Your Cooldown Completes.'
        : (solverVerifiedCount === 0 && decisions.length > 0
            ? 'No Exact Certified Solver Node Matched This Board And Action Line. Decisions Remain Explicitly Unmeasured Rather Than Estimated.'
            : null),
      hand: enrichedHandMeta,
      streetTimeline,
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
