import { getServerUserWithFallback } from '../../../../src/lib/serverAuth';
/**
 * POST /api/assistant/leaks/detect
 * Runs leak detection analysis on user's hand history
 *
 * Per Masterplan Section VI:
 * - Identify statistical leaks over time, NOT single-hand mistakes
 * - A leak requires: Repetition, Same situation class, Measurable EV loss
 *
 * Club Arena hands are normalized and solver-audited before aggregation.
 */

import { createClient } from '../../../../src/lib/supabaseServerClient';
import { reportApiError } from '../../../../src/lib/apiErrorHandler';
import { aggregateSolverLeaks, canResolveSolverLeakScope, solverDecisionGroupKey, summarizeSolverDecisionGroups } from '../../../../src/lib/training/solverDecisionEvidence';
import { gradeCanonicalPolicyDecision } from '../../../../src/lib/training/cacheTruthContract.mjs';
import {
  cacheQuestionFromRow,
  cacheRowIsServingEligible,
} from '../../../../src/lib/training/cacheTruthPersistence.mjs';
import { readLeakStatsAggregate } from '../../../../src/lib/personal-assistant/leakStats';
import { MATCHER_VERSION, syncClubArenaHandsForAudit } from '../../../../src/lib/training/handAuditEngine';
import { incrementalBoundaryFromCompletedJob, isFullRescanRequested } from '../../../../src/lib/personal-assistant/auditJobRuntime.mjs';
import { analyzeCaHandFacts } from '../../../../src/lib/personal-assistant/caHandFactsAnalyzer.mjs';
import {
  toUserLeakPersistenceRow,
  generateLeakFix,
  LEAK_PATTERNS,
  PATTERN_STAT_KEYS,
  patternIsMeasured,
  deviationFromRange,
  parseHandSummary,
  classifyHandAuditEligibility,
  normalizeAuditHand,
  computeStatsFromAuditHands,
  classifyLeakStatus,
  generateExplanation,
  getCurrentValue,
  updateTrendData,
  toCardCodes,
  checkHandForLeak,
  getWhyLeakingEV,
} from '../../../../src/lib/personal-assistant/leakRecord';

import { applyRateLimit, applyDurableRateLimit } from '../../../../src/lib/apiRateLimit';
import { checkSandboxAccess, isFeatureAccessible } from '../../../../src/lib/personal-assistant/contextAuthority';
import { openAuditJobToken } from '../../../../src/lib/personal-assistant/auditJobToken.mjs';
import { fingerprintAuditCursor, openAuditCursor, sealAuditCursor } from '../../../../src/lib/personal-assistant/auditCursor.mjs';
import { attachPersonalAssistantTiming } from '../../../../src/lib/personal-assistant/serverTiming.mjs';

export const config = { maxDuration: 60 };

const LEAK_AUDIT_LIMIT = { max: 12, windowMs: 60_000 };
const AUDIT_HAND_BATCH_SIZE = 200;
const AUDIT_DECISION_BATCH_SIZE = 500;

let _supabase = null;
function getSupabase() {
    if (!_supabase) {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (!url || !key) throw new Error('Leak audit service configuration is unavailable');
        _supabase = createClient(url, key);
    }
    return _supabase;
}

// ═══════════════════════════════════════════════════════════════════════
// LEAK DETECTION ENGINE
// ═══════════════════════════════════════════════════════════════════════

function mergeSeparatedStatsSlices(slices) {
  const valid = (slices || []).filter(slice => slice?.data?.overall?.total_hands > 0);
  if (valid.length === 0) return null;

  const totalHands = valid.reduce((sum, slice) => sum + Number(slice.data.overall.total_hands || 0), 0);
  const lifetimeHands = valid.reduce((sum, slice) => sum + Number(slice.data?.lifetime?.hands ?? slice.data.overall.total_hands ?? 0), 0);

  const weightedRate = (readValue, readWeight, isAvailable) => {
    let numerator = 0;
    let denominator = 0;
    for (const slice of valid) {
      const o = slice.data.overall;
      const avail = slice.data?.quality?.metric_availability || o.metric_availability || {};
      if (!isAvailable(o, avail)) continue;
      const val = readValue(o, avail);
      const weight = Number(readWeight(o, avail));
      if (val === null || val === undefined || !Number.isFinite(Number(val)) || !Number.isFinite(weight) || weight <= 0) continue;
      numerator += Number(val) * weight;
      denominator += weight;
    }
    return denominator > 0 ? numerator / denominator : null;
  };

  const sumCount = (readCount) => {
    let total = 0;
    let seen = false;
    for (const slice of valid) {
      const o = slice.data.overall;
      const avail = slice.data?.quality?.metric_availability || o.metric_availability || {};
      const val = readCount(o, avail);
      if (val !== null && val !== undefined && Number.isFinite(Number(val))) {
        total += Number(val);
        seen = true;
      }
    }
    return seen ? total : null;
  };

  const cashHands = valid
    .filter(slice => slice.mode === 'cash')
    .reduce((sum, slice) => sum + Number(slice.data.overall.total_hands || 0), 0);
  const tournamentHands = valid
    .filter(slice => slice.mode === 'tournament')
    .reduce((sum, slice) => sum + Number(slice.data.overall.total_hands || 0), 0);

  const normalized = normalizeStats({
    hands_played: totalHands,
    vpip: weightedRate((o) => o.vpip, (o) => o.total_hands, () => true),
    pfr: weightedRate((o) => o.pfr, (o) => o.total_hands, () => true),
    three_bet_percentage: weightedRate(
      (o) => o.three_bet_percent,
      (o, avail) => avail.three_bet_opportunities ?? o.total_hands,
      (_o, avail) => avail.three_bet_percent !== false
        && (avail.three_bet_opportunities === undefined || Number(avail.three_bet_opportunities) > 0),
    ),
    cbet_percentage: weightedRate(
      (o) => o.cbet_flop,
      (o, avail) => avail.cbet_flop_opportunities ?? o.total_hands,
      (_o, avail) => avail.cbet_flop !== false,
    ),
    cbet_opportunities: sumCount((_o, avail) => avail.cbet_flop_opportunities),
    aggression_factor: weightedRate(
      (o) => o.aggression_factor,
      (o, avail) => avail.aggression_factor_actions ?? avail.postflop_actions ?? o.total_hands,
      (_o, avail) => avail.aggression_factor !== false,
    ),
    postflop_actions: sumCount((_o, avail) => avail.aggression_factor_actions ?? avail.postflop_actions),
    wtsd: weightedRate(
      (o) => o.wtsd,
      (o, avail) => avail.wtsd_opportunities ?? o.total_hands,
      (_o, avail) => avail.wtsd !== false,
    ),
  });
  normalized.analysisWindowHands = totalHands;
  normalized.lifetimeHands = lifetimeHands;
  normalized.cashHands = cashHands;
  normalized.tournamentHands = tournamentHands;
  normalized.formatBreakdown = {
    cashHands,
    tournamentHands,
    sources: valid.map(slice => `${slice.mode}:${slice.asset}`),
  };
  return normalized;
}

async function getPlayerStats(supabase, userId) {
  let finalStats = null;

  // 0. PREFERRED: the same RPC the Club Arena stats page reads, covering BOTH
  // live Cash games AND Tournaments (chips and diamonds) before falling back to
  // ca_player_stats_full for legacy aggregate rows.
  //
  // Only exactly-mappable fields are passed through. Anything this RPC does not
  // measure (opportunity counts, street-by-street fold frequencies) is left
  // absent so patternIsMeasured skips those patterns · the house rule that a
  // number which was never measured is never presented as if it was.
  try {
    const separatedQueries = [
      { mode: 'cash', asset: 'chips' },
      { mode: 'cash', asset: 'diamonds' },
      { mode: 'tournament', asset: 'chips' },
      { mode: 'tournament', asset: 'diamonds' },
    ];
    const separatedResults = await Promise.all(
      separatedQueries.map(async ({ mode, asset }) => {
        try {
          const res = await supabase.rpc('ca_player_stats_overview_separated', {
            p_user: userId,
            p_game_mode: mode,
            p_asset: asset,
          });
          return { mode, asset, data: res?.error ? null : res?.data, error: res?.error || null };
        } catch (err) {
          return { mode, asset, data: null, error: err };
        }
      }),
    );

    finalStats = mergeSeparatedStatsSlices(separatedResults);

    if (!finalStats) {
      const fullRes = await supabase.rpc('ca_player_stats_full', {
        p_user: userId,
      });
      const rpcStats = fullRes?.data;
      const rpcErr = fullRes?.error || separatedResults.find(r => r.error)?.error;
      if (rpcErr && !rpcStats) {
        console.warn('[LeakDetect] Club Arena stats RPC failed:', rpcErr.message);
      } else if (rpcStats?.overall?.total_hands > 0) {
        const o = rpcStats.overall;
        const avail = rpcStats?.quality?.metric_availability || o.metric_availability || {};
        const threeBetMeasured = avail.three_bet_percent !== false
          && (avail.three_bet_opportunities === undefined || Number(avail.three_bet_opportunities) > 0);
        finalStats = normalizeStats({
          hands_played: o.total_hands,
          vpip: o.vpip,
          pfr: o.pfr,
          three_bet_percentage: threeBetMeasured ? o.three_bet_percent : null,
          cbet_percentage: avail.cbet_flop === false ? null : o.cbet_flop,
          cbet_opportunities: avail.cbet_flop_opportunities ?? null,
          aggression_factor: avail.aggression_factor === false ? null : o.aggression_factor,
          postflop_actions: avail.aggression_factor_actions ?? avail.postflop_actions ?? null,
          wtsd: avail.wtsd === false ? null : o.wtsd,
        });
        finalStats.analysisWindowHands = o.total_hands;
        finalStats.lifetimeHands = rpcStats?.lifetime?.hands ?? o.total_hands;
        finalStats.formatBreakdown = { cashHands: null, tournamentHands: null, sources: ['ca_player_stats_full'] };
      }
    }
  } catch (e) {
    console.warn('[LeakDetect] Club Arena stats RPC threw:', e?.message || e);
  }

  // 1. Try to get aggregated stats from live hand history
  const { data: stats, error } = finalStats
    ? { data: null, error: null }
    : await supabase.from('player_stats').select('*').eq('user_id', userId).maybeSingle();

  if (error) console.warn('[LeakDetect] player_stats query failed:', error.message);

  if (finalStats) {
    // already resolved from the RPC
  } else if (!error && stats) {
    finalStats = normalizeStats(stats);
  } else {
    // Try alternative stats table
    const { data: altStats, error: altErr } = await supabase
      .from('user_poker_stats')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (altErr) console.warn('[LeakDetect] user_poker_stats query failed:', altErr.message);

    if (altStats) {
      finalStats = normalizeStats(altStats);
    } else {
      // Try to compute from live hand history · fetch variant & special-format
      // metadata so non-NLH variants, bomb/kill pots, and multi-board RIT are
      // excluded and Cash vs Tournament counts stay explicit.
      const queryHands = (key) => supabase
        .from('hand_history')
        .select('id, tournament_id, game_variant, bomb_pot, kill_pot, rit_boards, community_cards, community_cards2, community_cards3, hole_cards, actions, players, summary, created_at')
        .contains('players', JSON.stringify([{ [key]: userId }]))
        .order('created_at', { ascending: false })
        .limit(2000);
      const [modern, legacy] = await Promise.all([queryHands('userId'), queryHands('id')]);
      if (modern.error && legacy.error) {
        console.warn('[LeakDetect] hand_history query failed:', modern.error.message);
      }
      const byId = new Map();
      for (const hand of [...(modern.data || []), ...(legacy.data || [])]) {
        byId.set(String(hand.id), hand);
      }
      const hands = [...byId.values()].slice(0, 2000);
      if (hands.length > 0) {
        finalStats = computeStatsFromHands(hands, userId);
      }
    }
  }

  return finalStats;
}

function normalizeStats(stats) {
  // Return the first numeric value, or null when the column is absent ·
  // never fabricate frequencies or sample sizes for missing columns.
  const num = (...vals) => {
    for (const v of vals) {
      if (v !== null && v !== undefined && !Number.isNaN(Number(v))) return Number(v);
    }
    return null;
  };

  /**
   * Every LEAK_PATTERNS threshold is written in PERCENT (vpip < 18,
   * threeBetFreq > 14, foldToCbet > 55). `player_stats` stores these as
   * FRACTIONS: production ranges 0.00–0.55 for vpip and 0.00–0.32 for pfr,
   * with not one row above 1 in 1,156. Read raw, `vpip < 18` is therefore
   * true for every player alive · a 55% VPIP maniac gets told he is
   * "Overfolding Preflop". Anything at or below 1 is a fraction and is
   * scaled; anything above 1 is already a percent and is left alone. The
   * two ranges cannot collide: a real VPIP of 1% does not occur over the
   * 500+ hands these patterns require.
   */
  const asPercent = (...vals) => {
    const v = num(...vals);
    if (v === null) return null;
    return v > 0 && v <= 1 ? v * 100 : v;
  };

  /**
   * A voluntary-action rate of exactly 0 across hundreds of hands is not a
   * measurement, it is an unwritten column: 974 of the 1,089 accounts past
   * the 500-hand gate carry vpip = 0, several with 60k+ hands, which no
   * human produces. Returning null routes these through patternIsMeasured,
   * which skips the pattern · the codebase's standing rule that a number
   * which was never measured must never be presented as if it was.
   * Frequencies that ARE gated by an opportunity count (river bluffs, c-bets)
   * keep their honest zeros; only the ungated preflop rates are treated
   * this way.
   */
  const asMeasuredPercent = (...vals) => {
    const v = asPercent(...vals);
    return v === null || v === 0 ? null : v;
  };

  return {
    handsPlayed: num(stats.hands_played, stats.total_hands) ?? 0,
    vpip: asMeasuredPercent(stats.vpip),
    pfr: asMeasuredPercent(stats.pfr),
    // Postflop rates are ALSO compared against percent thresholds, so they get
    // the same fraction-to-percent normalisation. Their honest zeros survive
    // (asPercent, not asMeasuredPercent) because each one is gated by an
    // opportunity count below: 0% river bluffs over 20+ spots is a real,
    // measured leak, not an unwritten column.
    limpFreq: asPercent(stats.limp_freq, stats.limp_percentage),
    coldCallFreq: asPercent(stats.cold_call_freq, stats.cold_call_percentage),
    threeBetFreq: asPercent(stats.three_bet_freq, stats.three_bet_percentage),
    foldToCbet: asPercent(stats.fold_to_cbet, stats.fold_to_cbet_percentage),
    // Opportunity/faced counts default to 0 (NOT an invented sample) so
    // sample-size gates in the patterns don't fire on unknown samples.
    cbetsFaced: num(stats.cbets_faced) ?? 0,
    cbetFreq: asPercent(stats.cbet_freq, stats.cbet_percentage),
    cbetOpps: num(stats.cbet_opportunities) ?? 0,
    checkRaiseFreq: asPercent(stats.check_raise_freq, stats.check_raise_percentage),
    checkRaiseOpps: num(stats.check_raise_opportunities) ?? 0,
    turnBarrelFreq: asPercent(stats.turn_barrel_freq, stats.turn_cbet_percentage),
    turnBarrelOpps: num(stats.turn_barrel_opportunities) ?? 0,
    turnFoldFreq: asPercent(stats.turn_fold_freq),
    turnFaced: num(stats.turn_bets_faced) ?? 0,
    riverBluffFreq: asPercent(stats.river_bluff_freq, stats.river_aggression),
    riverBluffOpps: num(stats.river_bluff_opportunities) ?? 0,
    riverFoldFreq: asPercent(stats.river_fold_freq),
    riverFaced: num(stats.river_bets_faced) ?? 0,
    riverValueBetFreq: asPercent(stats.river_value_bet_freq),
    riverBetOpps: num(stats.river_bet_opportunities) ?? 0,
    aggFactor: num(stats.aggression_factor, stats.af),
    postflopActions: num(stats.postflop_actions, stats.aggression_factor_actions),
    wtsd: asPercent(stats.wtsd, stats.went_to_showdown),
  };
}

function computeStatsFromHands(hands, userId) {
  return computeStatsFromAuditHands(hands, userId);
}

function canonicalSpotType(question, fallback) {
  const scenario = question?.scenario || {};
  return scenario.spotType || scenario.nodeType || scenario.potType || question?.spotType || fallback || 'general';
}

async function fetchCanonicalQuestionMap(db, rows) {
  const ids = [...new Set((rows || []).map(r => r.question_id).filter(Boolean))];
  const map = new Map();
  for (let i = 0; i < ids.length; i += 100) {
    const batch = ids.slice(i, i + 100);
    const { data, error } = await db
      .from('training_question_cache')
      .select('question_id, game_id, question_data, canonical_policy, source_classification, quality_status, policy_version, policy_checksum')
      .in('question_id', batch)
      .in('quality_status', ['active', 'active_fallback'])
      .limit(100);
    if (error) throw error;
    for (const row of data || []) {
      const hydrated = { ...row, question_data: cacheQuestionFromRow(row) };
      if (!cacheRowIsServingEligible(hydrated)) continue;
      const entry = {
        question: hydrated.question_data,
        policy: row.canonical_policy,
        policyChecksum: row.policy_checksum,
        gameId: row.game_id,
      };
      map.set(String(row.question_id), entry);
      if (hydrated.question_data?.id) map.set(String(hydrated.question_data.id), entry);
    }
  }
  return map;
}

async function fetchPagedRows(buildQuery, { pageSize = 1000, maxRows = 10000 } = {}) {
  const rows = [];
  for (let from = 0; from < maxRows; from += pageSize) {
    let result;
    try {
      result = await buildQuery(from, Math.min(maxRows, from + pageSize) - 1);
    } catch (error) {
      return { data: rows, error, complete: false };
    }
    if (result?.error) return { data: rows, error: result.error, complete: false };
    const page = Array.isArray(result?.data) ? result.data : [];
    rows.push(...page);
    if (page.length < pageSize) return { data: rows, error: null, complete: true };
  }
  return { data: rows, error: null, complete: false };
}

async function getSolverTrainingEvidence(db, userId) {
  const evidenceSnapshot = new Date().toISOString();
  const attemptAuthority = 'training_attempts!training_answers_attempt_fk!inner(id, user_id, status, practice_only)';
  const modernColumns = `game_id, question_id, answer_id, hero_position, villain_position, street, classification, ev_loss, spot_type, answered_at, solver_verified, solver_source, selected_frequency, optimal_frequency, ev_loss_measured, evidence_metadata, attempt_id, ${attemptAuthority}`;
  const legacyColumns = `game_id, question_id, answer_id, hero_position, villain_position, street, classification, ev_loss, spot_type, answered_at, attempt_id, ${attemptAuthority}`;
  const readTraining = columns => fetchPagedRows((from, to) => db
      .from('training_answers')
      .select(columns)
      .eq('user_id', userId)
      .eq('training_attempts.user_id', userId)
      .eq('training_attempts.status', 'completed')
      .eq('training_attempts.practice_only', false)
      .not('attempt_id', 'is', null)
      .lte('answered_at', evidenceSnapshot)
      .order('answered_at', { ascending: false })
      .order('id', { ascending: false })
      .range(from, to));
  let result = await readTraining(modernColumns);

  // Safe during a rolling migration. Legacy rows are regraded from canonical
  // cache data below; no client-provided classification becomes solver proof.
  if (result.error?.code === '42703' || /column .* does not exist/i.test(result.error?.message || '')) {
    result = await readTraining(legacyColumns);
  }
  let trainingAvailable = !result.error;
  let trainingComplete = trainingAvailable && result.complete === true;
  if (result.error) {
    console.warn('[LeakDetect] training_answers evidence query failed:', result.error.message);
  }

  const rows = trainingAvailable ? (result.data || []) : [];
  const decisions = [];
  const canonicalAliases = {};
  let trainingDecisionCount = 0;
  let canonicalMisses = 0;
  if (rows.length > 0) {
    let canonical;
    try {
      canonical = await fetchCanonicalQuestionMap(db, rows);
    } catch (error) {
      console.warn('[LeakDetect] canonical question lookup failed:', error.message);
      trainingAvailable = false;
      trainingComplete = false;
      canonical = new Map();
    }

    for (const row of rows) {
      const cached = canonical.get(String(row.question_id));
      if (!cached?.question) {
        canonicalMisses += 1;
        trainingComplete = false;
        continue;
      }
      if (
        String(row?.evidence_metadata?.policyChecksum || '').toLowerCase()
        !== String(cached.policyChecksum || '').toLowerCase()
      ) {
        canonicalMisses += 1;
        trainingComplete = false;
        continue;
      }
      const grade = gradeCanonicalPolicyDecision(cached.policy, row.answer_id);
      if (!grade.solverVerified) continue;
      const scenario = cached.question.scenario || {};
      const gameId = cached.gameId || row.game_id;
      const position = scenario.heroPosition || scenario.position || row.hero_position;
      const street = scenario.street || row.street;
      // Verified grouping must be built only from the canonical cache row.
      // Browser-supplied `spot_type` used to create durable but impossible
      // groups such as `btn_play`, while the authoritative question belonged
      // to `general`. Keep a precise alias so the detector can retire those
      // stale identities after writing the canonical finding.
      const spotType = canonicalSpotType(cached.question, null);
      const legacySpotType = canonicalSpotType(cached.question, row.spot_type);
      const canonicalType = solverDecisionGroupKey({
        evidenceScope: 'training', gameId, street, position, spotType,
      });
      const legacyType = solverDecisionGroupKey({
        evidenceScope: 'training', gameId, street, position, spotType: legacySpotType,
      });
      if (legacyType !== canonicalType) canonicalAliases[legacyType] = canonicalType;
      decisions.push({
        ...row,
        evidence_scope: 'training',
        game_id: gameId,
        hero_position: position,
        villain_position: scenario.villainPosition || row.villain_position,
        street,
        spot_type: spotType,
        classification: grade.classification,
        ev_loss: grade.evLoss,
        solver_verified: true,
        solver_source: grade.solverSource,
        selected_frequency: grade.selectedFrequency,
        optimal_frequency: grade.optimalFrequency,
        ev_loss_measured: grade.evLossMeasured,
      });
      trainingDecisionCount += 1;
    }
  }

  const auditModernColumns = 'hand_external_id, game_id, question_id, hero_position, villain_position, street, classification, ev_loss, spot_type, audited_at, solver_verified, solver_source, selected_frequency, optimal_frequency, ev_loss_measured, evidence_scope';
  const auditLegacyColumns = 'hand_external_id, game_id, question_id, hero_position, villain_position, street, classification, ev_loss, spot_type, audited_at, solver_verified, solver_source, selected_frequency, optimal_frequency, ev_loss_measured';
  const readHandAudits = columns => fetchPagedRows((from, to) => db
      .from('hand_audit_decisions')
      .select(columns)
      .eq('user_id', userId)
      .eq('solver_verified', true)
      // Matcher v3 additionally proves normalized pot, sizing, villain and
      // prior-action context alongside street order, concrete postflop combos,
      // stack/table identity and action sizing. Legacy rows are deliberately
      // excluded until the idempotent Club Arena sync re-audits their hands.
      .like('solver_source', '%|hand-audit-v3')
      .lte('audited_at', evidenceSnapshot)
      .order('audited_at', { ascending: false })
      .order('id', { ascending: false })
      .range(from, to));
  let auditResult = await readHandAudits(auditModernColumns);
  if (auditResult.error?.code === '42703' || /column .* does not exist/i.test(auditResult.error?.message || '')) {
    auditResult = await readHandAudits(auditLegacyColumns);
  }
  const auditAvailable = !auditResult.error;
  const auditComplete = auditAvailable && auditResult.complete === true;
  if (auditResult.error && auditResult.error.code !== '42P01') {
    console.warn('[LeakDetect] hand_audit_decisions query failed:', auditResult.error.message);
  }
  let handAuditDecisionCount = 0;
  for (const row of auditResult.data || []) {
    if (row.evidence_scope && row.evidence_scope !== 'club_arena') continue;
    decisions.push({ ...row, evidence_scope: 'club_arena', answered_at: row.audited_at });
    handAuditDecisionCount += 1;
  }

  return {
    // A failure in one evidence source must never erase healthy evidence from
    // the other. Club Arena audits remain usable if training-answer lookup is
    // degraded, and vice versa.
    available: trainingAvailable || auditAvailable,
    sources: {
      training: {
        available: trainingAvailable,
        complete: trainingComplete,
        integrityComplete: trainingAvailable && canonicalMisses === 0,
        truncated: trainingAvailable && result.complete !== true,
        decisions: trainingDecisionCount,
      },
      handAudit: { available: auditAvailable, complete: auditComplete, decisions: handAuditDecisionCount },
    },
    decisions,
    groups: summarizeSolverDecisionGroups(decisions),
    leaks: aggregateSolverLeaks(decisions),
    canonicalAliases,
    canonicalMisses,
  };
}

function evidenceReceipt({ liveHands, solverEvidence, clubArenaSync }) {
  const trainingDecisions = solverEvidence?.sources?.training?.decisions || 0;
  const handAuditDecisions = solverEvidence?.sources?.handAudit?.decisions || 0;
  const auditedThisRun = clubArenaSync?.decisionsAnalyzed || 0;
  const verifiedThisRun = clubArenaSync?.solverVerified || 0;
  return {
    liveHands,
    verifiedDecisions: solverEvidence?.decisions?.length || 0,
    trainingDecisions,
    handAuditDecisions,
    auditedThisRun,
    verifiedThisRun,
    unpricedThisRun: clubArenaSync?.unpriced || 0,
    verificationRate: auditedThisRun > 0
      ? +((verifiedThisRun / auditedThisRun) * 100).toFixed(1)
      : null,
  };
}

function isMissingColumnError(error) {
  const code = String(error?.code || '');
  const message = String(error?.message || '').toLowerCase();
  return code === '42703' || code === 'PGRST204' || message.includes('does not exist') || message.includes('schema cache');
}

async function readAuditWatermark(db, userId) {
  try {
    const { data, error } = await db
      .from('user_assistant_stats')
      .select('last_audited_hand_at, last_audited_hand_id, last_audited_matcher_version')
      .eq('user_id', userId)
      .maybeSingle();
    if (error) return null;
    if (!data?.last_audited_hand_at || !data?.last_audited_hand_id) return null;
    return {
      createdAt: data.last_audited_hand_at,
      id: String(data.last_audited_hand_id),
      matcherVersion: data.last_audited_matcher_version || null,
    };
  } catch (_) {
    return null;
  }
}

// Fallback incremental boundary: the user's latest COMPLETED audit job, used
// only when the per-user hand watermark is missing (for example the watermark
// columns were not yet installed when the last audit finished). Fail closed to
// a full scan on any read error or doubt.
async function readCompletedJobBoundary(db, userId) {
  try {
    const { data, error } = await db
      .from('pa_leak_audit_jobs')
      .select('id, status, progress, result, started_at, created_at, completed_at')
      .eq('user_id', userId)
      .eq('status', 'completed')
      .order('completed_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error || !data) return null;
    return incrementalBoundaryFromCompletedJob(data, MATCHER_VERSION);
  } catch (_) {
    return null;
  }
}

async function readCaHandFactsAnalysis(db, userId) {
  try {
    const { data, error } = await db
      .from('ca_hand_facts')
      .select('hand_id, tournament_id, played_at, game_variant, effective_stack_bb_at_deal, position, vpip, pfr, three_bet, three_bet_opportunity, faced_three_bet, folded_to_three_bet, squeeze_opportunity, squeezed, steal_opportunity, stole, blind_defense_opportunity, defended_blind, had_cbet_flop_opp, cbet_flop_opportunity, cbet_flop, barrel_turn_opportunity, barreled_turn, barrel_river_opportunity, barreled_river, check_raise_opportunity, check_raised, donk_opportunity, donk_bet, probe_opportunity, probe_bet, saw_flop, went_to_showdown, won_at_showdown, aggressive_actions_flop, passive_actions_flop, aggressive_actions_turn, passive_actions_turn, aggressive_actions_river, passive_actions_river, af_bet_raise_actions, af_call_actions, created_at')
      .eq('user_id', userId)
      .order('played_at', { ascending: false })
      .limit(2000);
    if (error || !Array.isArray(data) || data.length === 0) return null;
    return analyzeCaHandFacts(data);
  } catch (_) {
    return null;
  }
}

async function upsertAssistantStatsWithWatermark(db, payload, watermark) {
  const withWatermark = watermark?.createdAt && watermark?.id
    ? {
        ...payload,
        last_audited_hand_at: watermark.createdAt,
        last_audited_hand_id: watermark.id,
        last_audited_matcher_version: watermark.matcherVersion || null,
      }
    : payload;
  const firstAttempt = await db.from('user_assistant_stats').upsert(withWatermark, { onConflict: 'user_id' });
  if (!firstAttempt.error) return firstAttempt;
  if (withWatermark !== payload && isMissingColumnError(firstAttempt.error)) {
    return db.from('user_assistant_stats').upsert(payload, { onConflict: 'user_id' });
  }
  return firstAttempt;
}

// ═══════════════════════════════════════════════════════════════════════
// API HANDLER
// ═══════════════════════════════════════════════════════════════════════

export default async function handler(req, res) {
  attachPersonalAssistantTiming(res, 'leak_detection');
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  res.setHeader('Vary', 'Authorization');
  try {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      return res.status(405).json({ success: false, error: 'Method not allowed' });
    }
    const workerAuth = openAuditJobToken(req.headers['x-pa-audit-worker'], 'detect');
    // One complete audit may require several signed continuation requests.
    // The generic AI limit (5/minute) made accounts with >500 hands impossible
    // to finish, while 12 bounded, authenticated batches still keeps the route
    // protected at both token and infrastructure-IP levels.
    if (!workerAuth && !applyRateLimit(req, res, LEAK_AUDIT_LIMIT)) return;

    // Require JWT auth for write operations
    let authenticatedUser = null;
    if (req.method !== 'GET') {
      if (workerAuth) {
        const requestBody = req.body && typeof req.body === 'object' ? req.body : {};
        if (requestBody.jobId !== workerAuth.jobId) {
          return res.status(401).json({ success: false, error: 'Invalid worker job identity' });
        }
        const { data: workerJob, error: workerJobError } = await getSupabase()
          .from('pa_leak_audit_jobs').select('id, user_id, status')
          .eq('id', workerAuth.jobId).eq('user_id', workerAuth.userId).eq('status', 'running').maybeSingle();
        if (workerJobError || !workerJob) {
          return res.status(409).json({ success: false, error: 'Audit job is not claimable' });
        }
        authenticatedUser = { id: workerAuth.userId };
        req.body = { ...requestBody, userId: workerAuth.userId };
      } else {
        const _token = req.headers.authorization?.replace('Bearer ', '');
        if (!_token) return res.status(401).json({ success: false, error: 'Authentication required' });
        const { user: _authUser, error: authErr, status: authStatus } = await getServerUserWithFallback(req, getSupabase());
        if (authErr || !_authUser) {
          return res.status(authStatus === 503 ? 503 : 401).json({
            success: false,
            error: authStatus === 503 ? 'Session verification unavailable' : 'Invalid token',
          });
        }
        authenticatedUser = _authUser;
        if (!await applyDurableRateLimit(getSupabase(), res, {
          key: `pa:leaks:detect:${_authUser.id}`, max: LEAK_AUDIT_LIMIT.max, windowSeconds: 60,
        })) return;
        // Rebuild the body so an empty/non-JSON body still carries the JWT userId
        req.body = { ...(req.body && typeof req.body === 'object' ? req.body : {}), userId: _authUser.id };
      }
    }
    if (req.method !== 'POST') {
      return res.status(405).json({ success: false, error: 'Method not allowed' });
    }

    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({ success: false, error: 'userId required' });
    }

    if (!workerAuth) {
      const contextAccess = await checkSandboxAccess(getSupabase(), authenticatedUser?.id);
      if (!contextAccess.allowed || !isFeatureAccessible(contextAccess.accessLevel, 'leak_finder_detect')) {
        return res.status(403).json({
          success: false,
          blocked: true,
          contextState: contextAccess.contextState,
          error: contextAccess.message || 'Leak detection is unavailable in the current session context.',
        });
      }
    }

    let auditCursor = null;
    try {
      auditCursor = openAuditCursor(req.body.auditCursor, userId);
    } catch (_) {
      return res.status(400).json({
        success: false,
        code: 'invalid_audit_cursor',
        error: 'Audit continuation must be restarted. Run the audit again.',
      });
    }

    try {
      // `forceFullRescan: true` (or the durable job flag `fullRescan`) always
      // overrides every incremental boundary and scans the whole account.
      const fullRescan = isFullRescanRequested(req.body);
      let sinceBoundary = null;
      let incrementalSource = null;
      if (!auditCursor && !fullRescan) {
        sinceBoundary = await readAuditWatermark(getSupabase(), userId);
        incrementalSource = sinceBoundary ? 'watermark' : null;
        if (!sinceBoundary) {
          sinceBoundary = await readCompletedJobBoundary(getSupabase(), userId);
          incrementalSource = sinceBoundary ? 'completed_job' : null;
        }
      }
      const clubArenaSync = await syncClubArenaHandsForAudit(getSupabase(), userId, {
        limit: AUDIT_HAND_BATCH_SIZE,
        maxDecisions: AUDIT_DECISION_BATCH_SIZE,
        cursor: auditCursor,
        sinceBoundary,
        fullRescan,
      });
      if (incrementalSource && clubArenaSync && typeof clubArenaSync === 'object') {
        clubArenaSync.incrementalSource = incrementalSource;
        clubArenaSync.incrementalSince = sinceBoundary?.createdAt || null;
      }
      if (clubArenaSync?.continuation) {
        const continuation = clubArenaSync.continuation;
        delete clubArenaSync.continuation;
        clubArenaSync.cursorFingerprint = fingerprintAuditCursor(continuation, userId);
        clubArenaSync.auditCursor = sealAuditCursor(continuation, userId);
      }

      if (clubArenaSync?.partial === true) {
        res.setHeader('Retry-After', '2');
        return res.status(503).json({
          success: false,
          code: 'club_arena_audit_partial',
          retryable: true,
          error: 'One Club Arena hand source is temporarily unavailable. The saved checkpoint will be retried.',
          clubArenaSync,
        });
      }

      if (clubArenaSync?.available === false || clubArenaSync?.persisted === false) {
        res.setHeader('Retry-After', '2');
        return res.status(503).json({
          success: false,
          code: 'club_arena_audit_unavailable',
          retryable: true,
          error: clubArenaSync?.error || 'Club Arena evidence could not be verified. No leak changes were made.',
          clubArenaSync,
        });
      }

      // Persist and advance each bounded Club Arena page first. Re-running the
      // full leak aggregation for every continuation page multiplied database
      // reads and writes by the number of pages. The final page performs the
      // deterministic aggregation exactly once over the now-current evidence.
      if (clubArenaSync?.available === true && clubArenaSync?.auditCursor) {
        return res.status(200).json({
          success: true,
          auditInProgress: true,
          message: 'Club Arena evidence batch recorded. Continuing the deterministic audit.',
          persisted: clubArenaSync.persisted !== false,
          clubArenaSync,
          leaksDetected: null,
          leaks: [],
        });
      }

      // Live tendencies, format-scoped ca_hand_facts, and solver-graded decisions
      // are separate evidence sets. They must never be blended into one invented frequency.
      const [stats, caHandFactsResult] = await Promise.all([
        getPlayerStats(getSupabase(), userId),
        readCaHandFactsAnalysis(getSupabase(), userId),
      ]);
      // Read solver evidence after syncing so newly audited Club Arena
      // decisions are included in this same scan.
      const solverEvidence = await getSolverTrainingEvidence(getSupabase(), userId);
      const liveHands = Math.max(stats?.handsPlayed || 0, caHandFactsResult?.totalEligibleHands || 0);
      const solverDecisions = solverEvidence.decisions.length;
      const watermarkToSave = clubArenaSync?.complete === true && clubArenaSync?.latestHandWatermark
        ? clubArenaSync.latestHandWatermark
        : null;
      const caHandFactsSummary = caHandFactsResult
        ? {
            totalEligibleHands: caHandFactsResult.totalEligibleHands,
            excludedUnsupportedHands: caHandFactsResult.excludedUnsupportedHands,
            cashHands: caHandFactsResult.cash?.hands || 0,
            tournamentHands: caHandFactsResult.tournament?.hands || 0,
            tournamentByStack: {
              short: caHandFactsResult.tournamentByStack?.short?.hands || 0,
              mid: caHandFactsResult.tournamentByStack?.mid?.hands || 0,
              deep: caHandFactsResult.tournamentByStack?.deep?.hands || 0,
            },
            detectedCount: caHandFactsResult.detectedLeaks?.length || 0,
          }
        : null;
      const sourceCompleteness = {
        trainingSolver: solverEvidence.sources?.training?.complete === true,
        handAudit: solverEvidence.sources?.handAudit?.complete === true,
        clubArena: clubArenaSync.complete === true,
      };
      const evidenceCoverage = {
        ...evidenceReceipt({ liveHands, solverEvidence, clubArenaSync }),
        sourceCompleteness,
      };
      const evidenceSources = {
        livePlay: liveHands > 0,
        trainingSolver: solverEvidence.sources?.training?.available === true,
        handAudit: solverEvidence.sources?.handAudit?.available === true,
        clubArena: clubArenaSync.available === true,
      };

      // Record the completed signed-snapshot hand total even when the account
      // has not yet accumulated enough evidence to produce a leak. This total
      // spans every continuation page, not merely the final batch.
      const auditedHandTotal = Math.max(liveHands, clubArenaSync.cumulativeHandsFound || clubArenaSync.handsFound || 0);
      const syncAuditedHandTotal = async () => {
        const { data: current, error: readError } = await getSupabase()
          .from('user_assistant_stats').select('total_hands_analyzed').eq('user_id', userId).maybeSingle();
        if (readError) return false;
        const { error: writeError } = await upsertAssistantStatsWithWatermark(getSupabase(), {
          user_id: userId,
          total_hands_analyzed: Math.max(Number(current?.total_hands_analyzed) || 0, auditedHandTotal),
          updated_at: new Date().toISOString(),
        }, watermarkToSave);
        return !writeError;
      };

      if (liveHands < 100 && solverDecisions < 8) {
        const statsPersisted = await syncAuditedHandTotal();
        return res.status(200).json({
          success: true,
          message: 'Need more evidence to detect leaks (100 live hands or 8 server-verified solver decisions)',
          handsAnalyzed: liveHands,
          solverDecisionsAnalyzed: solverDecisions,
          clubArenaSync,
          evidenceSources,
          evidenceCoverage,
          evidencePartial: !sourceCompleteness.trainingSolver || !sourceCompleteness.handAudit,
          leaksDetected: 0,
          leaks: [],
          persisted: statsPersisted,
          partial: !statsPersisted,
        });
      }

      // Get existing leaks
      const existingResult = await fetchPagedRows((from, to) => getSupabase()
        .from('user_leaks')
        .select('*')
        .eq('user_id', userId)
        .order('updated_at', { ascending: false })
        .order('id', { ascending: false })
        .range(from, to));
      const { data: existingLeaks, error: existingErr } = existingResult;
      if (existingErr) {
        console.warn('[LeakDetect] existing user_leaks query failed:', existingErr.message);
        return res.status(503).json({ success: false, retryable: true, error: 'Leak history is temporarily unavailable. No changes were made.' });
      }

      const existingLeakMap = {};
      (existingLeaks || []).forEach(leak => {
        existingLeakMap[leak.leak_type] = leak;
      });

      // Detect leaks
      const detectedLeaks = [];
      const persistenceEvidence = new Map();
      const now = new Date().toISOString();

      for (const [leakType, pattern] of Object.entries(LEAK_PATTERNS || {})) {
        if (!stats || liveHands < 100) continue;
        // Skip patterns whose inputs were not genuinely measured
        if (!patternIsMeasured(stats, leakType)) continue;

        if (pattern.check(stats)) {
          const existingLeak = existingLeakMap[leakType];
          const currentValue = getCurrentValue(stats, leakType);
          const status = classifyLeakStatus(existingLeak, currentValue, pattern.optimalRange);

          if (!status) continue;

          // EV loss scales with how far the player deviates from optimal
          const [optMin, optMax] = pattern.optimalRange;
          const deviation = deviationFromRange(currentValue, pattern.optimalRange);
          const scaledEvLoss = +(pattern.evImpact * Math.min(3, 1 + deviation / ((optMax - optMin) || 1))).toFixed(3);

          const leak = {
            user_id: userId,
            leak_type: leakType,
            leak_category: pattern.category,
            situation_class: pattern.name,
            status,
            source_system: 'live_play',
            confidence: stats.handsPlayed > 1000 ? 'high' : stats.handsPlayed > 500 ? 'medium' : 'low',
            avg_ev_loss_bb: scaledEvLoss,
            ev_loss_measured: false,
            // Aggregate patterns do not expose individual mistake rows. Keep
            // the actual opportunity window stable rather than incrementing on
            // every rerun of the same data.
            occurrence_count: pattern.category === 'preflop'
              ? stats.handsPlayed
              : (stats[PATTERN_STAT_KEYS[leakType]?.find(k => /Opps|Faced/.test(k))] || existingLeak?.occurrence_count || 1),
            optimal_frequency: pattern.optimalRange[0],
            current_frequency: currentValue,
            first_detected_at: existingLeak?.first_detected_at || now,
            last_detected_at: now,
            trend_data: updateTrendData(existingLeak?.trend_data, currentValue),
            explanation: generateExplanation(leakType, currentValue, pattern.optimalRange),
            why_leaking_ev: getWhyLeakingEV(leakType),
          };

          detectedLeaks.push(leak);
          persistenceEvidence.set(leakType, {
            totalSamples: stats.analysisWindowHands || stats.handsPlayed,
            mistakeCount: leak.occurrence_count,
          });
        }
      }

      // Append format-scoped, position- & street-specific deterministic leaks
      // measured directly from Club Arena ca_hand_facts opportunity columns
      // (separating Cash NLH vs. stack-depth-aware Tournament NLH baselines).
      const detectedLeakTypeSet = new Set(detectedLeaks.map(l => l.leak_type));
      for (const factLeak of (caHandFactsResult?.detectedLeaks || [])) {
        if (detectedLeakTypeSet.has(factLeak.leak_type)) continue;
        const existingLeak = existingLeakMap[factLeak.leak_type];
        // caHandFactsAnalyzer has already enforced opportunity-sample and pattern trigger gates.
        // Use minDeviation: 2 for percentage patterns (ratio metrics like AF auto-use 0.3).
        const isRatioRange = Array.isArray(factLeak.optimal_range) && Number(factLeak.optimal_range[1]) <= 10;
        const status = classifyLeakStatus(
          existingLeak,
          factLeak.current_frequency,
          factLeak.optimal_range,
          isRatioRange ? {} : { minDeviation: 2 },
        );
        if (!status) continue;
        const confidence = factLeak.total_samples >= 80 ? 'high' : factLeak.total_samples >= 40 ? 'medium' : 'low';
        detectedLeaks.push({
          user_id: userId,
          leak_type: factLeak.leak_type,
          leak_category: factLeak.leak_category,
          situation_class: factLeak.situation_class,
          status,
          source_system: 'ca_hand_facts',
          confidence,
          avg_ev_loss_bb: factLeak.avg_ev_loss_bb,
          ev_loss_measured: false,
          occurrence_count: factLeak.occurrence_count,
          optimal_frequency: factLeak.optimal_frequency,
          current_frequency: factLeak.current_frequency,
          recommended_drill: factLeak.recommended_drill,
          first_detected_at: existingLeak?.first_detected_at || now,
          last_detected_at: now,
          trend_data: updateTrendData(existingLeak?.trend_data, factLeak.current_frequency),
          explanation: factLeak.explanation,
          why_leaking_ev: factLeak.why_leaking_ev,
          suggested_fix: existingLeak?.suggested_fix || generateLeakFix(factLeak),
        });
        detectedLeakTypeSet.add(factLeak.leak_type);
        persistenceEvidence.set(factLeak.leak_type, {
          totalSamples: factLeak.total_samples,
          mistakeCount: factLeak.occurrence_count,
        });
      }

      // Append solver-derived leaks. Their occurrence count is the number of
      // actual mistaken decisions, their denominator is the situation group's
      // sample count, and BB loss is zero unless exact per-action EVs exist.
      const solverSourceHands = new Map();
      for (const solverLeak of solverEvidence.leaks) {
        const {
          _sample_count,
          _mistake_count,
          _ev_measured_count,
          _mistaken_hand_external_ids,
          ...persistableSolverLeak
        } = solverLeak;
        const existingLeak = existingLeakMap[solverLeak.leak_type];
        const currentValue = solverLeak.current_frequency;
        const optimalRange = [0, solverLeak.optimal_frequency];
        detectedLeaks.push({
          ...persistableSolverLeak,
          user_id: userId,
          status: classifyLeakStatus(existingLeak, currentValue, optimalRange) || solverLeak.status,
          first_detected_at: existingLeak?.first_detected_at || now,
          last_detected_at: now,
          trend_data: updateTrendData(existingLeak?.trend_data, currentValue),
          suggested_fix: existingLeak?.suggested_fix || generateLeakFix(solverLeak),
        });
        persistenceEvidence.set(solverLeak.leak_type, {
          totalSamples: _sample_count,
          mistakeCount: _mistake_count,
        });
        solverSourceHands.set(solverLeak.leak_type, _mistaken_hand_external_ids || []);
      }

      // Save detected leaks and link hand examples
      let secondarySync = {
        handExamples: { persisted: true, linked: 0 },
        suggestionsPersisted: true,
      };
      if (detectedLeaks.length > 0) {
        const persistenceRows = detectedLeaks.map(leak => ({
          ...toUserLeakPersistenceRow(leak, {
            userId,
            ...(persistenceEvidence.get(leak.leak_type) || {}),
          }),
          detector_managed: true,
          updated_at: now,
        }));
        // Batch upsert all detected leaks · eliminates N+1 (one round-trip)
        const { error: upsertErr } = await getSupabase()
          .from('user_leaks')
          .upsert(
            persistenceRows,
            { onConflict: 'user_id,leak_type', ignoreDuplicates: false }
          );

        if (upsertErr) {
          console.warn('[LeakDetect] Failed to persist detected leaks:', upsertErr.message);
          return res.status(503).json({
            success: false,
            retryable: true,
            persisted: false,
            reason: 'write_failed',
            error: 'The audit completed, but Leak Finder could not save the results. No leak history was changed.',
            handsAnalyzed: liveHands,
            solverDecisionsAnalyzed: solverDecisions,
            leaksDetected: detectedLeaks.length,
          });
        }

        // Merge DB ids back into the response objects so clients can deep-link
        const savedIdentityRows = [];
        let identitiesComplete = true;
        const detectedTypes = detectedLeaks.map(leak => leak.leak_type);
        for (let i = 0; i < detectedTypes.length; i += 100) {
          const identityResult = await getSupabase()
            .from('user_leaks')
            .select('id, leak_type')
            .eq('user_id', userId)
            .in('leak_type', detectedTypes.slice(i, i + 100));
          if (identityResult.error) {
            console.warn('[LeakDetect] Failed to reload saved leak identities:', identityResult.error.message);
            identitiesComplete = false;
            break;
          }
          savedIdentityRows.push(...(identityResult.data || []));
        }
        const idMap = Object.fromEntries(savedIdentityRows.map(r => [r.leak_type, r.id]));
        detectedLeaks.forEach(l => {
          if (idMap[l.leak_type]) l.id = idMap[l.leak_type];
        });

        // Link hand examples (single hand-history fetch, batch save)
        const leaksWithIds = detectedLeaks.filter(l => l.id).map(leak => ({
          ...leak,
          sourceHandExternalIds: solverSourceHands.get(leak.leak_type) || null,
        }));
        let handExamplesSync = { persisted: true, linked: 0 };
        if (!identitiesComplete) {
          handExamplesSync = { persisted: false, linked: 0, reason: 'identity_read_failed' };
        } else if (leaksWithIds.length > 0) {
          handExamplesSync = await linkHandExamples(userId, leaksWithIds);
        }

        // Deterministic fixes keep detection fast, repeatable and independent
        // of an LLM request. Existing personalized notes are preserved.
        const topLeaks = [...detectedLeaks]
          .sort((a, b) => (b.avg_ev_loss_bb || 0) - (a.avg_ev_loss_bb || 0))
          .slice(0, 3);
        topLeaks.forEach(l => {
          l.suggested_fix = l.suggested_fix || existingLeakMap[l.leak_type]?.suggested_fix || generateLeakFix(l);
        });

        // Persist suggestions (requires user_leaks.suggested_fix column;
        // degrade gracefully if it doesn't exist yet)
        const suggestionResults = await Promise.all(topLeaks
          .filter(l => l.id && l.suggested_fix)
          .map(async (l) => {
            const { error: fixErr } = await getSupabase()
              .from('user_leaks')
              .update({ suggested_fix: l.suggested_fix })
              .eq('id', l.id)
              .eq('user_id', userId);
            if (fixErr) console.warn('[LeakDetect] Could not persist suggested_fix (column may be missing):', fixErr.message);
            return !fixErr;
          }));
        secondarySync = {
          handExamples: handExamplesSync,
          suggestionsPersisted: suggestionResults.every(Boolean),
        };
      }

      // Batch-update resolved leaks · eliminates N+1.
      // Only resolve leak types this engine owns (LEAK_PATTERNS) AND whose
      // inputs were measured this run · never touch POSTed/training/custom
      // leak types, and never resolve a leak we simply couldn't measure.
      const solverRecoveryByType = new Map(
        (solverEvidence.groups || []).map(group => [group.leakType, group.recoveryEligible === true]),
      );
      // Recovery uses a bounded recent evidence window per scoped group. It
      // does not require a lifetime table export (which would permanently
      // block accounts above the 10k read window). Club Arena groups add the
      // stronger requirement that the signed hand-history snapshot reached
      // its end and every page was reconciled before resolution.
      const solverScopeCanResolve = leakType => canResolveSolverLeakScope(leakType, {
        recoveryEligible: solverRecoveryByType.get(leakType) === true,
        existingHistoryComplete: existingResult.complete === true,
        sources: solverEvidence.sources,
        clubArenaSync,
      });
      const detectedTypes = new Set(detectedLeaks.map(leak => leak.leak_type));
      const supersededSolverScopeCanResolve = (leakType, existingLeak) => {
        const canonicalType = solverEvidence.canonicalAliases?.[leakType];
        if (!canonicalType || existingLeak?.detector_managed !== true || existingResult.complete !== true) return false;
        if (solverEvidence.sources?.training?.available !== true
          || solverEvidence.sources?.training?.integrityComplete !== true) return false;
        return detectedTypes.has(canonicalType) || solverRecoveryByType.get(canonicalType) === true;
      };
      const canResolveCaFactLeak = (leakType) => {
        if (!caHandFactsResult) return false;
        const key = String(leakType || '');
        let metrics = null;
        let posMetrics = null;
        let slug = '';
        if (key.startsWith('cash_')) {
          metrics = caHandFactsResult.cash;
          posMetrics = caHandFactsResult.positions?.cash;
          slug = key.slice('cash_'.length);
        } else if (key.startsWith('mtt_short_')) {
          metrics = caHandFactsResult.tournamentByStack?.short;
          posMetrics = caHandFactsResult.positions?.tournament;
          slug = key.slice('mtt_short_'.length);
        } else if (key.startsWith('mtt_mid_')) {
          metrics = caHandFactsResult.tournamentByStack?.mid;
          posMetrics = caHandFactsResult.positions?.tournament;
          slug = key.slice('mtt_mid_'.length);
        } else if (key.startsWith('mtt_deep_')) {
          metrics = caHandFactsResult.tournamentByStack?.deep;
          posMetrics = caHandFactsResult.positions?.tournament;
          slug = key.slice('mtt_deep_'.length);
        } else if (key.startsWith('mtt_')) {
          metrics = caHandFactsResult.tournament;
          posMetrics = caHandFactsResult.positions?.tournament;
          slug = key.slice('mtt_'.length);
        } else {
          return false;
        }
        if (!metrics || (metrics.hands || 0) < 30) return false;
        // Require the exact pattern's opportunity denominator to meet its sample gate
        // before auto-resolving so a temporary dip in opportunities never falsely resolves a leak.
        const gateBySlug = {
          blind_defense_too_tight: (metrics.blindDefenseOpps || 0) >= 30,
          steal_too_rare: (metrics.stealOpps || 0) >= 30,
          squeeze_too_rare: (metrics.squeezeOpps || 0) >= 20,
          fold_to_3bet_too_high: (metrics.facedThreeBet || 0) >= 25,
          turn_barrel_too_rare_facts: (metrics.barrelTurnOpps || 0) >= 25,
          river_barrel_too_rare_facts: (metrics.barrelRiverOpps || 0) >= 20,
          check_raise_too_rare_facts: (metrics.checkRaiseOpps || 0) >= 25,
          passive_turn_river: (metrics.turnRiverActions || 0) >= 30,
          passive_postflop_facts: (metrics.postflopActions || 0) >= 40,
          btn_too_tight: (posMetrics?.BTN?.hands || 0) >= 40,
          utg_too_loose: (posMetrics?.UTG?.hands || 0) >= 40,
        };
        return slug in gateBySlug ? gateBySlug[slug] : (metrics.hands || 0) >= 100;
      };
      const resolutionCandidates = Object.entries(existingLeakMap || {})
        .filter(([leakType, existingLeak]) =>
          existingLeak.detector_managed !== false &&
          ((LEAK_PATTERNS[leakType] && stats && patternIsMeasured(stats, leakType)) ||
            (existingLeak.source_system === 'ca_hand_facts' && canResolveCaFactLeak(leakType)) ||
            (['training_solver', 'solver_engine'].includes(existingLeak.source_system)
              && (solverScopeCanResolve(leakType)
                || supersededSolverScopeCanResolve(leakType, existingLeak)))) &&
          !detectedLeaks.find(l => l.leak_type === leakType) &&
          existingLeak.status !== 'resolved'
        )
        .map(([, existingLeak]) => ({
          id: existingLeak.id,
          expected_updated_at: existingLeak.updated_at || null,
        }));

      let resolutionsSynced = true;
      if (resolutionCandidates.length > 0) {
        const { data: resolutionResult, error: resolutionError } = await getSupabase()
          .rpc('resolve_user_leaks_if_unchanged', {
            p_user_id: userId,
            p_candidates: resolutionCandidates,
            p_resolved_at: now,
          });
        if (resolutionError || resolutionResult?.success === false) {
          resolutionsSynced = false;
          console.warn('[LeakDetect] Failed to sync resolved leaks:', resolutionError?.message || resolutionResult?.error);
        } else if (Number(resolutionResult?.conflicts) > 0) {
          resolutionsSynced = false;
          console.warn('[LeakDetect] Retained concurrently changed leaks during resolution reconciliation.');
        }
      }

      // Update the global Personal Assistant statistics only after the
      // authoritative leak totals have been read successfully.
      // Recalculate active/resolved leaks
      const { data: leakStats, error: updatedLeaksErr } = await readLeakStatsAggregate(getSupabase(), userId);

      let statsSynced = !updatedLeaksErr;
      if (updatedLeaksErr) {
        console.warn('[LeakDetect] Refusing to overwrite assistant stats after leak-count read failed:', updatedLeaksErr.message);
      } else {
        const activeLeaks = leakStats.activeLeaks;
        const resolvedLeaksCount = leakStats.resolvedLeaks;

        // Fetch existing stats. A failed read must not be converted to zero and
        // written back over a real lifetime total.
        const { data: existingStats, error: existingStatsErr } = await getSupabase()
          .from('user_assistant_stats')
          .select('total_hands_analyzed')
          .eq('user_id', userId)
          .maybeSingle();

        if (existingStatsErr) {
          statsSynced = false;
          console.warn('[LeakDetect] Refusing to overwrite assistant stats after current-total read failed:', existingStatsErr.message);
        } else {
          const currentHands = existingStats?.total_hands_analyzed || 0;

          // Atomic Upsert for Stats Sync · SET (not accumulate) hands analyzed so
          // re-running detection on the same hands doesn't inflate the counter.
          // Solver decisions are not hands; one hand can expose many decisions.
          const { error: statsWriteErr } = await upsertAssistantStatsWithWatermark(getSupabase(), {
            user_id: userId,
            total_hands_analyzed: Math.max(currentHands, auditedHandTotal),
            active_leaks_count: activeLeaks,
            resolved_leaks_count: resolvedLeaksCount,
            updated_at: new Date().toISOString(),
          }, watermarkToSave);
          if (statsWriteErr) {
            statsSynced = false;
            console.warn('[LeakDetect] Assistant stats sync failed:', statsWriteErr.message);
          }
        }
      }

      // `partial` is the durable-write contract consumed by the worker. An
      // incomplete optional evidence source must stay visible, but it must not
      // misreport successfully persisted Club Arena findings as a failed
      // transaction. Recovery already fails closed per affected solver scope.
      const evidencePartial = !sourceCompleteness.trainingSolver ||
        !sourceCompleteness.handAudit || existingResult.complete !== true;
      const partial = !resolutionsSynced || !statsSynced ||
        clubArenaSync.persisted === false || clubArenaSync.complete === false ||
        secondarySync.handExamples?.persisted === false || !secondarySync.suggestionsPersisted;

      return res.status(200).json({
        success: true,
        handsAnalyzed: liveHands,
        solverDecisionsAnalyzed: solverDecisions,
        evidenceSources,
        evidenceCoverage: {
          ...evidenceCoverage,
          sourceCompleteness: {
            ...sourceCompleteness,
            leakHistory: existingResult.complete === true,
          },
        },
        evidencePartial,
        formatCoverage: stats?.formatBreakdown || null,
        caHandFactsSummary,
        clubArenaSync,
        leaksDetected: detectedLeaks.length,
        leaks: detectedLeaks,
        persisted: true,
        partial,
        sync: {
          ...secondarySync,
          resolutionsPersisted: resolutionsSynced,
          statsPersisted: statsSynced,
        },
      });

    } catch (error) {
      console.warn('Leak detection error:', error);
      return res.status(500).json({
        success: false,
        error: 'Leak detection could not be completed. No unverified result was applied.',
      });
    }

  } catch (err) {
    try { reportApiError(err, req); } catch (_reportError) { console.warn('[App] Handled exception:', _reportError?.message || _reportError); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}

// ═══════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════

/**
 * Link relevant hand examples to all detected leaks.
 * Fetches exact audited source hands for solver groups and bounded recent
 * candidates for statistical leaks, then saves one idempotent batch.
 * `leaksWithIds` entries need: id, leak_type, avg_ev_loss_bb.
 */
export async function linkHandExamples(userId, leaksWithIds, db = getSupabase()) {
  try {
    const exactExternalIds = [...new Set(leaksWithIds
      .flatMap(leak => Array.isArray(leak.sourceHandExternalIds) ? leak.sourceHandExternalIds : [])
      .filter(id => String(id).startsWith('club-arena:'))
      .map(id => String(id).slice('club-arena:'.length))
      .filter(Boolean))];
    const needsStatisticalCandidates = leaksWithIds.some(leak => leak.sourceHandExternalIds === null);
    const handsById = new Map();
    const readErrors = [];
    const select = 'id, tournament_id, game_variant, bomb_pot, kill_pot, rit_boards, actions, players, summary, hole_cards, board, community_cards, community_cards2, community_cards3, button_seat, pot_size, created_at';
    const readOwnedHands = async (membershipKey, ids = null) => {
      let query = db.from('hand_history')
        .select(select)
        // Both writer generations are owner-scoped here. Never fetch an exact
        // audit id first and check ownership in application code afterward.
        .contains('players', JSON.stringify([{ [membershipKey]: userId }]));
      if (ids) query = query.in('id', ids);
      const result = await query.order('created_at', { ascending: false }).limit(ids ? ids.length : 100);
      if (result.error) readErrors.push(result.error);
      for (const hand of result.data || []) handsById.set(String(hand.id), hand);
    };

    if (needsStatisticalCandidates) {
      await Promise.all([readOwnedHands('userId'), readOwnedHands('id')]);
    }
    for (let index = 0; index < exactExternalIds.length; index += 100) {
      const batch = exactExternalIds.slice(index, index + 100);
      await Promise.all([readOwnedHands('userId', batch), readOwnedHands('id', batch)]);
    }

    if (readErrors.length > 0) {
      console.warn('[LeakDetect] hand_history fetch for examples failed:', readErrors[0].message);
      return { persisted: false, linked: 0, reason: 'hand_history_read_failed' };
    }
    const hands = [...handsById.values()]
      .filter(hand => exactExternalIds.includes(String(hand.id)) || classifyHandAuditEligibility(hand).eligible)
      .sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || ''))
        || String(b.id).localeCompare(String(a.id)));
    if (!hands || hands.length === 0) return { persisted: true, linked: 0 };

    // Hydrate the authenticated player's own private cards from owner-scoped
    // ca_hand_facts so folded/mucked Club Arena leak examples still display
    // hero's real holding instead of null. Never leaks opponent cards.
    const privateHeroCardsByHand = new Map();
    const handIds = hands.map(h => String(h.id)).filter(Boolean);
    for (let index = 0; index < handIds.length; index += 200) {
      const batch = handIds.slice(index, index + 200);
      try {
        const factRes = await db
          .from('ca_hand_facts')
          .select('hand_id, hole_cards')
          .eq('user_id', userId)
          .in('hand_id', batch)
          .limit(batch.length);
        if (!factRes?.error && Array.isArray(factRes?.data)) {
          for (const fact of factRes.data) {
            const normalizedCards = toCardCodes(fact?.hole_cards);
            if (normalizedCards && normalizedCards.length >= 2) {
              privateHeroCardsByHand.set(String(fact.hand_id), normalizedCards);
            }
          }
        }
      } catch (_) {
        // Optional enrichment: fall back to hand_history.hole_cards / summary.
      }
    }

    const examples = [];

    for (const leak of leaksWithIds) {
      const exactSourceIds = Array.isArray(leak.sourceHandExternalIds)
        ? new Set(leak.sourceHandExternalIds
          .filter(id => String(id).startsWith('club-arena:'))
          .map(id => String(id).slice('club-arena:'.length)))
        : null;
      let count = 0;
      for (const rawHand of hands) {
        if (exactSourceIds && !exactSourceIds.has(String(rawHand.id))) continue;
        const hand = normalizeAuditHand(rawHand, userId);
        const summary = parseHandSummary(rawHand.summary);
        const summaryHero = (summary?.players || []).find(p =>
          String(p?.id ?? p?.userId ?? p?.playerId) === String(userId));
        // Solver groups already identify the exact mistaken decision rows.
        // Heuristic pattern matching here could attach an unrelated hand, so
        // only legacy statistical leaks use checkHandForLeak.
        const leakMatch = exactSourceIds
          ? { action: 'solver-graded mistake', street: leak.leak_category || null }
          : checkHandForLeak(hand, leak.leak_type);
        if (!leakMatch) continue;

        // COLUMN FIX 2026-08-15: this insert has NEVER succeeded. It wrote
        // `situation_snapshot` and `ev_loss_bb`, which are the names from the
        // design doc (.agent/skills/personal-assistant/SCHEMA.sql) and NOT the
        // names that were actually deployed. The real columns are `hand_data`
        // and `ev_loss`. Postgres rejected every row with 42703, the catch
        // below logged a console.warn, the per-row fallback retried with the
        // same wrong names, and the endpoint still returned success:true --
        // so `leak_hand_examples` has 0 rows platform-wide while the UI
        // reports a clean detection run.
        //
        // The READ side was already corrected (useAssistant.js aliases
        // `situation_snapshot:hand_data, ev_loss_bb:ev_loss`); only the write
        // side was left behind. `situation_class` is populated too so the
        // examples can be grouped by street, which is what the column is for.
        examples.push({
          leak_id: leak.id,
          hand_history_id: hand.id,
          hand_data: {
            // Hero's own cards: owner-scoped ca_hand_facts covers folded/mucked
            // hands privately for this user; showdown hole_cards / summary are
            // fallback sources. Never leaks opponent holdings.
            hero_cards: privateHeroCardsByHand.get(String(rawHand.id))
              || toCardCodes(rawHand.hole_cards?.[userId] || summaryHero?.holeCards),
            board: toCardCodes(rawHand.community_cards || rawHand.board || summary?.communityCards),
            button_seat: rawHand.button_seat ?? summary?.buttonSeat ?? null,
            pot_size: rawHand.pot_size ?? (summary?.pots || []).reduce((sum, p) => sum + (Number(p?.amount) || 0), 0),
            leak_action: leakMatch.action,
            street: leakMatch.street,
          },
          situation_class: leakMatch.street || null,
          // Use the deviation-scaled EV loss from the detection run, not a
          // second hardcoded constant
          ev_loss: leak.avg_ev_loss_bb,
        });

        // Limit to 5 examples per leak
        if (++count >= 5) break;
      }
    }

    if (examples.length === 0) return { persisted: true, linked: 0 };

    // Single batch upsert; duplicates are ignored via the unique index on
    // (leak_id, hand_history_id)
    const { error: upsertErr } = await db
      .from('leak_hand_examples')
      .upsert(examples, { onConflict: 'leak_id,hand_history_id', ignoreDuplicates: true });

    if (upsertErr) {
      // Fallback when the unique index is missing: per-row existence check
      console.warn('[LeakDetect] Batch example upsert failed, falling back:', upsertErr.message);
      let linked = 0;
      for (const example of examples) {
        const { data: existing, error: selErr } = await db
          .from('leak_hand_examples')
          .select('id')
          .eq('leak_id', example.leak_id)
          .eq('hand_history_id', example.hand_history_id)
          .maybeSingle();

        if (selErr) {
          console.warn('[LeakDetect] Failed to verify existing hand example:', selErr.message);
          return { persisted: false, linked, reason: 'example_read_failed' };
        }
        if (existing) {
          linked += 1;
        } else {
          const { error: insErr } = await db.from('leak_hand_examples').insert(example);
          if (insErr) {
            console.warn('[LeakDetect] Failed to link hand example:', insErr.message);
            return { persisted: false, linked, reason: 'example_write_failed' };
          }
          linked += 1;
        }
      }
      return { persisted: true, linked };
    }
    return { persisted: true, linked: examples.length };
  } catch (error) {
    console.warn('Error linking hand examples:', error);
    return { persisted: false, linked: 0, reason: 'example_sync_failed' };
  }
}
