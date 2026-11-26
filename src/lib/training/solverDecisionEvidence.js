/**
 * Canonical, server-safe grading for decisions made against Training Arena
 * questions. The Leak Finder uses this module too, so a decision cannot be
 * graded one way in the game and interpreted another way by the audit.
 *
 * This module deliberately does not estimate EV. A frequency distribution can
 * prove that an action is outside the solver's strategy, but it cannot prove a
 * BB loss unless the exact question contains per-action EVs.
 */

import {
  gradeCanonicalPolicyDecision,
  isSolverEvidenceClassification,
  sourceClassificationForQuestion,
} from './cacheTruthContract.mjs';

const WAREHOUSE_SOURCES = new Set([
  'DETERMINISTIC_SOLVER',
  'PIO_DATABASE',
  'PIO',
  'LOCAL_SOLVER_RANGES',
  'LEGACY_STRATEGY_ARCHIVE',
]);

const GOOD_CLASSIFICATIONS = new Set(['best', 'correct']);

/**
 * Historical memory-chart cache rows stored the audited push/fold percentage
 * on each option but omitted the duplicate `gtoFrequencies` map. Reconstruct
 * only that lossless map; never synthesize a percentage from the answer key.
 */
export function normalizeAuditedChartQuestion(question) {
  if (!question || String(question.type || '').toUpperCase() !== 'CHART') return question;
  const options = Array.isArray(question.options) ? question.options : [];
  const entries = options.map((option) => [String(option?.id || ''), Number(option?.frequency)]);
  const valid = entries.length === 2
    && entries.every(([id, frequency]) => id && Number.isFinite(frequency) && frequency >= 0 && frequency <= 100);
  const sum = entries.reduce((total, [, frequency]) => total + frequency, 0);
  if (!valid || Math.abs(sum - 100) > 1) return question;
  question.source = 'CHART';
  question.dataQuality = 'CHART_AUDITED';
  question.gtoFrequencies = Object.fromEntries(entries);
  question.evidenceDisclosure = 'Audited local push/fold chart corpus.';
  // Push/fold charts are preflop decisions. Historical cache writers stamped
  // some of these rows as Flop even though they contained no board and only
  // Push/Fold actions; the Arena then fabricated a board while the grader
  // correctly rejected the row. Canonicalize the lossless chart state here,
  // before either serving endpoint persists it.
  question.scenario = {
    ...(question.scenario || {}),
    street: 'preflop',
    board: '',
    boardCards: [],
  };
  question.street = 'preflop';
  question.boardCards = [];
  return question;
}

export function verifiedSolverSource(question) {
  const policySource = question?.solverPolicy?.sourceArtifact?.system;
  if (policySource) return String(policySource).slice(0, 100);
  const source = String(question?.source || question?.solverProvenance?.source || '').trim();
  if (source) return source.slice(0, 100);
  return question?.solverProvenance?.verified === true ? 'SOLVER_PROVENANCE_VERIFIED' : null;
}

function finiteNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function readFrequency(frequencies, actionId) {
  if (!frequencies || typeof frequencies !== 'object' || !actionId) return 0;
  const id = String(actionId);
  const exact = finiteNumber(frequencies[id]);
  if (exact !== null) return exact;
  const lower = id.toLowerCase();
  const key = Object.keys(frequencies).find(k => String(k).toLowerCase() === lower);
  return key ? (finiteNumber(frequencies[key]) ?? 0) : 0;
}

function readActionEV(evData, actionId) {
  if (!evData || typeof evData !== 'object' || !actionId) return null;
  const maps = [evData.actionEVs, evData.action_evs, evData.evByAction];
  for (const map of maps) {
    if (!map || typeof map !== 'object') continue;
    const exact = finiteNumber(map[actionId]);
    if (exact !== null) return exact;
    const lower = String(actionId).toLowerCase();
    const key = Object.keys(map).find(k => String(k).toLowerCase() === lower);
    if (key) {
      const found = finiteNumber(map[key]);
      if (found !== null) return found;
    }
  }
  return null;
}

export function isVerifiedSolverQuestion(question) {
  if (!question || typeof question !== 'object') return false;
  // Source names, cached labels, and legacy provenance objects are not enough.
  // Every verified decision must carry the structurally valid canonical policy
  // envelope that the database independently checks and seals.
  return isSolverEvidenceClassification(sourceClassificationForQuestion(question));
}

const SOLVER_CLAIM_RE = /\b(?:according to gto|gto mixes|gto solver|solver picks|nash equilibrium|solver[- ]exact|pure\s+[a-z-]+\s*\(\d+%|what is the gto play)\b/i;

/**
 * Preserve usable legacy strategy rows without laundering them into
 * solver-exact evidence. Historical cache writers attached strong GTO copy to
 * rows that had no machine, manifest, artifact, or audit seal. Those rows may
 * still power an explicitly disclosed archive drill after structural
 * sanitization, but the player must never be told that the answer is a
 * provenance-verified solve.
 */
export function enforceSolverClaimHonesty(question) {
  if (!question || typeof question !== 'object' || isVerifiedSolverQuestion(question)) return question;
  const source = String(question.source || '').toUpperCase();
  const legacyWarehouse = WAREHOUSE_SOURCES.has(source)
    || String(question.dataQuality || '').toUpperCase() === 'LEGACY_UNVERIFIED'
    || String(question?.solverProvenance?.source || '').includes('solved_spots_gold_legacy');
  if (!legacyWarehouse) return question;

  const scenario = question.scenario || {};
  const street = String(scenario.street || question.street || 'recorded').toLowerCase();
  const hand = question.heroHand || scenario.heroHand
    || (Array.isArray(question.heroCards) ? question.heroCards.join('') : 'this hand');
  const board = Array.isArray(question.boardCards) && question.boardCards.length > 0
    ? ` on ${question.boardCards.join(' ')}`
    : '';
  const options = Array.isArray(question.options) ? question.options : [];
  const correct = options.find((option) => String(option?.id) === String(question.correctAnswer));
  const action = String(correct?.text || question.correctAnswerText || question.correctAnswer || 'the recorded action');
  const frequency = Number(question?.gtoFrequencies?.[question.correctAnswer]);
  const frequencyText = Number.isFinite(frequency) ? ` at ${Math.round(frequency)}%` : '';

  if (SOLVER_CLAIM_RE.test(String(question.question || question.text || ''))) {
    question.question = `At this archived ${street} decision with ${hand}${board}, which action has the highest recorded frequency?`;
    if (Object.prototype.hasOwnProperty.call(question, 'text')) question.text = question.question;
  }
  question.explanation = `This is structurally validated legacy strategy data, not a fully provenance-sealed result. In the archived frequency table, ${action} is the highest recorded action${frequencyText} for this decision.`;
  question.source = 'LEGACY_STRATEGY_ARCHIVE';
  question.dataQuality = 'LEGACY_UNVERIFIED';
  question.solverProvenance = {
    ...(question.solverProvenance || {}),
    verified: false,
    source: question?.solverProvenance?.source || 'solved_spots_gold_legacy',
  };
  question.evidenceDisclosure = 'Legacy strategy archive; writer provenance is unavailable.';
  return question;
}

export function classifyFrequencyDecision(frequencies = {}, selectedAnswer, declaredCorrect) {
  const values = Object.values(frequencies).map(finiteNumber).filter(v => v !== null);
  const optimalFrequency = values.length > 0 ? Math.max(...values) : 0;
  const selectedFrequency = readFrequency(frequencies, selectedAnswer);
  const answerMatches = String(selectedAnswer || '').toLowerCase()
    === String(declaredCorrect || '').toLowerCase();

  if (!values.some(v => v > 0)) {
    return {
      classification: answerMatches ? 'best' : 'inaccuracy',
      selectedFrequency: null,
      optimalFrequency: null,
      optimalAction: null,
      hasDistribution: false,
    };
  }

  let classification;
  if (answerMatches) classification = selectedFrequency === 0 && optimalFrequency > 0 ? 'correct' : 'best';
  else if (selectedFrequency >= 20) classification = 'best';
  else if (selectedFrequency >= 5) classification = 'correct';
  else if (selectedFrequency >= 1) classification = 'inaccuracy';
  else {
    const nonZero = values.filter(v => v > 0).length;
    classification = optimalFrequency >= 80 || nonZero <= 1 ? 'blunder' : 'wrong';
  }

  const optimalAction = Object.entries(frequencies).reduce((best, [id, value]) => {
    const n = finiteNumber(value) ?? 0;
    return !best || n > best.frequency ? { id, frequency: n } : best;
  }, null);

  return {
    classification,
    selectedFrequency: +selectedFrequency.toFixed(2),
    optimalFrequency: +optimalFrequency.toFixed(2),
    optimalAction: optimalAction?.id || null,
    hasDistribution: true,
  };
}

export function gradeSolverDecision(question, selectedAnswer) {
  const canonicalGrade = gradeCanonicalPolicyDecision(question?.solverPolicy, selectedAnswer);
  if (canonicalGrade.valid) return canonicalGrade;
  const frequencyGrade = classifyFrequencyDecision(
    question?.gtoFrequencies || {},
    selectedAnswer,
    question?.correctAnswer
  );
  // Existing engine questions can contain frequency-derived action-EV
  // approximations. Those remain useful coaching estimates, but they cannot
  // become a measured BB-loss claim in Leak Finder without an explicit seal.
  const exactActionEV = question?.evData?.actionEVsMeasured === true
    || question?.evData?.quality === 'SOLVER_EXACT_ACTION_EV';
  const selectedEV = exactActionEV ? readActionEV(question?.evData, selectedAnswer) : null;
  const optimalEV = exactActionEV
    ? readActionEV(question?.evData, frequencyGrade.optimalAction)
    : null;
  const measuredEVLoss = selectedEV !== null && optimalEV !== null
    ? Math.max(0, optimalEV - selectedEV)
    : null;
  const solverVerified = isVerifiedSolverQuestion(question);

  return {
    solverVerified,
    solverSource: verifiedSolverSource(question),
    classification: frequencyGrade.classification,
    isCorrect: GOOD_CLASSIFICATIONS.has(frequencyGrade.classification),
    selectedFrequency: frequencyGrade.selectedFrequency,
    optimalFrequency: frequencyGrade.optimalFrequency,
    evLoss: measuredEVLoss === null ? null : +measuredEVLoss.toFixed(3),
    evLossMeasured: measuredEVLoss !== null,
    optimalAction: frequencyGrade.optimalAction,
    // Grouped answers use ids such as grouped_medium which deliberately do
    // not occur in the raw canonical policy. Their grade therefore follows
    // the aggregated served distribution above, but their lineage still comes
    // from that same structurally valid immutable policy. Preserve it so the
    // database can independently verify the answer instead of seeing a false
    // lineage gap only in grouped/RNG modes.
    ...(solverVerified ? {
      policyVersion: question?.solverPolicy?.policyVersion || null,
      sourceChecksum: question?.solverPolicy?.sourceArtifact?.sourceArtifactChecksum || null,
    } : {}),
  };
}

function safeSlug(value, fallback) {
  const slug = String(value || fallback || 'unknown')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 42);
  return slug || fallback || 'unknown';
}

function displayToken(value, fallback) {
  const text = String(value || fallback || 'Unknown').replace(/[_-]+/g, ' ').trim();
  return text.replace(/\b\w/g, c => c.toUpperCase());
}

export const SOLVER_EVIDENCE_RULE_VERSION = 'solver-decision-evidence-v3';

function decisionRowIdentityKey(row) {
  if (!row || typeof row !== 'object') return null;
  if (row.id !== null && row.id !== undefined && String(row.id).trim() !== '') {
    return `id:${String(row.id).trim()}`;
  }
  const dk = String(row.decision_key ?? row.decisionKey ?? '').trim();
  if (dk) {
    const ext = String(row.hand_external_id ?? row.handExternalId ?? '').trim();
    return `dk:${ext}|${dk}`;
  }
  const attemptId = String(row.attempt_id ?? row.attemptId ?? '').trim();
  const questionId = String(row.question_id ?? row.questionId ?? '').trim();
  if (attemptId && questionId) {
    return `attempt:${attemptId}|q:${questionId}`;
  }
  return null;
}

function isChartDecisionRow(row) {
  const src = String(row?.solver_source ?? row?.solverSource ?? '').toLowerCase();
  const cls = String(row?.source_classification ?? row?.sourceClassification ?? '').toUpperCase();
  const qid = String(row?.question_id ?? row?.questionId ?? '').toLowerCase();
  return cls === 'CHART_AUDITED' || src.includes('memory_charts_gold') || src.includes('chart') || qid.startsWith('mcg:');
}

const GENERIC_SOLVER_GAME_SLUGS = new Set([
  'training', 'cash_hand_audit', 'mtt_hand_audit', 'hand_audit', 'cash', 'mtt', 'tournament', 'unknown',
]);

const PREFLOP_DEFAULT_GAME_SLUGS = new Set([
  'cash_001', 'cash_006', 'cash_007', 'cash_008', 'cash_010', 'cash_018',
  'mtt_001', 'mtt_002', 'mtt_003', 'mtt_004', 'mtt_005', 'mtt_006',
  'mtt_007', 'mtt_008', 'mtt_009', 'mtt_010', 'mtt_011', 'mtt_012',
  'mtt_013', 'mtt_014', 'mtt_015', 'mtt_016', 'mtt_017', 'mtt_018',
  'mtt_019', 'mtt_020', 'mtt_022', 'mtt_023',
]);

const FLOP_DEFAULT_GAME_SLUGS = new Set(['cash_002', 'cash_011', 'cash_014']);

export function resolveSolverRecommendedDrill(group = {}) {
  const gameSlug = safeSlug(group.gameId ?? group.game_id, 'training');
  const street = safeSlug(group.street, 'all_streets');
  const spot = safeSlug(group.spotType ?? group.spot_type, 'general');
  const pos = safeSlug(group.position ?? group.heroPosition ?? group.hero_position, 'all_positions');
  const dominantAction = safeSlug(group.dominantPlayerAction ?? group.player_action, '');
  const isMtt = gameSlug.startsWith('mtt') || gameSlug.includes('tournament');
  const isGeneric = GENERIC_SOLVER_GAME_SLUGS.has(gameSlug);
  const isMismatchedPostflop = (
    (street === 'river' && (PREFLOP_DEFAULT_GAME_SLUGS.has(gameSlug) || FLOP_DEFAULT_GAME_SLUGS.has(gameSlug)))
    || (street === 'turn' && (PREFLOP_DEFAULT_GAME_SLUGS.has(gameSlug) || FLOP_DEFAULT_GAME_SLUGS.has(gameSlug)))
    || (street === 'flop' && PREFLOP_DEFAULT_GAME_SLUGS.has(gameSlug))
  );

  if (!isGeneric && !isMismatchedPostflop) {
    return gameSlug.replace(/_/g, '-');
  }

  const combined = `${spot}_${dominantAction}`;
  if (street === 'river') {
    if (isMtt) {
      return /(?:check_raise|check_shove|xr)/.test(combined) ? 'mtt-021' : 'mtt-024';
    }
    if (/(?:overbet)/.test(spot) && !/(?:faces_bet|facing|defense|bluff_catch|call|fold)/.test(combined)) {
      return 'cash-015';
    }
    if (
      /(?:faces_bet|facing|bluff_catch|hero_call|defense|overfold|river_call|over_call)/.test(combined)
      || dominantAction === 'call'
      || dominantAction === 'fold'
    ) {
      return 'cash-005';
    }
    if (/(?:thin_value|river_value|missed_value|value)/.test(spot)) {
      return 'cash-004';
    }
    return 'cash-012';
  }

  if (street === 'turn') {
    if (isMtt) {
      return /(?:faces_bet|facing|defense|overfold|check_raise|check_shove)/.test(combined) ? 'mtt-021' : 'mtt-024';
    }
    if (/(?:faces_bet|facing|defense|overfold)/.test(combined)) return 'cash-003';
    if (/(?:probe)/.test(spot)) return 'cash-013';
    return 'cash-004';
  }

  if (street === 'flop') {
    if (isMtt) {
      return /(?:cbet|barrel)/.test(spot) && !/(?:faces_bet|facing|defense|overfold|check_raise)/.test(combined)
        ? 'mtt-024'
        : 'mtt-021';
    }
    if (/(?:check_raise|xr)/.test(combined)) return 'cash-014';
    if (/(?:donk)/.test(spot)) return 'cash-011';
    if (/(?:faces_bet|facing|defense|overfold)/.test(combined)) return 'cash-003';
    return 'cash-002';
  }

  if (street === 'preflop') {
    if (isMtt) {
      if (/(?:squeeze)/.test(spot)) return 'mtt-010';
      if (/(?:3bet|three_bet|vs3bet|resteal)/.test(spot)) return 'mtt-009';
      if (/(?:bb_defense|blind|facing_steal|sb_push)/.test(spot)) return 'mtt-017';
      if (pos === 'btn') return 'mtt-018';
      return 'mtt-001';
    }
    if (/(?:4bet|four_bet)/.test(spot)) return 'cash-008';
    if (/(?:3bet|three_bet|vs3bet)/.test(spot)) return 'cash-007';
    if (/(?:squeeze)/.test(spot)) return 'cash-016';
    if (/(?:bb_defense|blind|cold_call|facing_raise)/.test(spot)) return 'cash-003';
    if (pos === 'btn') return 'cash-006';
    return 'cash-001';
  }

  return gameSlug.replace(/_/g, '-');
}

export function solverDecisionGroupKey({ evidenceScope, gameId, street, position, spotType } = {}) {
  return [
    'solver',
    safeSlug(evidenceScope, 'training'),
    safeSlug(gameId, 'training'),
    safeSlug(street, 'all_streets'),
    safeSlug(position, 'all_positions'),
    safeSlug(spotType, 'general'),
  ].join('_').slice(0, 180);
}

export function summarizeSolverDecisionGroups(rows, { minSamples = 8, targetErrorRate = 15 } = {}) {
  const groups = new Map();
  const seenIdentityKeys = new Set();

  for (const row of rows || []) {
    if (!row?.solver_verified) continue;
    const identityKey = decisionRowIdentityKey(row);
    if (identityKey) {
      if (seenIdentityKeys.has(identityKey)) continue;
      seenIdentityKeys.add(identityKey);
    }
    const classification = String(row.classification || '').toLowerCase();
    if (!classification) continue;
    const gameId = safeSlug(row.game_id, 'training');
    const street = safeSlug(row.street, 'all_streets');
    const position = safeSlug(row.hero_position, 'all_positions');
    const spotType = safeSlug(row.spot_type, 'general');
    // Training drills and audited Club Arena hands answer different product
    // questions. Keep them in separate evidence groups so a strong drill run
    // cannot dilute (or resolve) a leak that still exists in real hands.
    const evidenceScope = safeSlug(row.evidence_scope, 'training');
    const key = `${evidenceScope}|${gameId}|${street}|${position}|${spotType}`;
    if (!groups.has(key)) {
      groups.set(key, {
        evidenceScope, gameId, street, position, spotType,
        samples: 0, mistakes: 0, totalMeasuredEV: 0, measuredEVMistakes: 0,
        mistakenHandExternalIds: [],
        newestAt: null,
        chartCount: 0,
        exactSolverCount: 0,
        actionCounts: {},
        representativeDecision: null,
      });
    }
    const group = groups.get(key);
    group.samples += 1;
    if (isChartDecisionRow(row)) group.chartCount += 1;
    else group.exactSolverCount += 1;

    const isMistake = !GOOD_CLASSIFICATIONS.has(classification);
    if (isMistake) {
      group.mistakes += 1;
      const pAction = safeSlug(row.player_action ?? row.playerAction ?? row.answer_id, '');
      if (pAction && pAction !== 'unknown') {
        group.actionCounts[pAction] = (group.actionCounts[pAction] || 0) + 1;
      }
      if (evidenceScope === 'club_arena' && row.hand_external_id) {
        const externalId = String(row.hand_external_id);
        if (!group.mistakenHandExternalIds.includes(externalId)) {
          group.mistakenHandExternalIds.push(externalId);
        }
      }
      const evVal = row.ev_loss_measured && finiteNumber(row.ev_loss) !== null
        ? Math.max(0, finiteNumber(row.ev_loss))
        : null;
      if (evVal !== null) {
        group.totalMeasuredEV += evVal;
        group.measuredEVMistakes += 1;
      }
      const prevRepLoss = group.representativeDecision?.evLossBB ?? -1;
      const candidateLoss = evVal ?? 0;
      if (!group.representativeDecision || candidateLoss > prevRepLoss) {
        group.representativeDecision = {
          handExternalId: row.hand_external_id || null,
          decisionKey: row.decision_key || null,
          questionId: row.question_id || null,
          street: row.street || street,
          heroPosition: row.hero_position || position,
          villainPosition: row.villain_position || null,
          heroHand: row.hero_hand || null,
          boardCards: Array.isArray(row.board_cards) ? row.board_cards : [],
          spotType: row.spot_type || spotType,
          playerAction: row.player_action ?? row.answer_id ?? null,
          solverAction: row.solver_action ?? null,
          sizingPct: finiteNumber(row.sizing_pct ?? row.sizingPct),
          potBeforeBB: finiteNumber(row.pot_before_bb ?? row.potBeforeBB),
          stackDepthBb: finiteNumber(row.stack_depth_bb ?? row.stackDepthBb),
          evLossBB: evVal,
          evLossMeasured: evVal !== null,
        };
      }
    }
    const rowTime = row.answered_at || row.audited_at || null;
    if (rowTime && (!group.newestAt || rowTime > group.newestAt)) {
      group.newestAt = rowTime;
    }
  }

  return [...groups.values()].map(group => {
    const errorRate = group.samples > 0 ? (group.mistakes / group.samples) * 100 : 0;
    const dominantPlayerAction = Object.entries(group.actionCounts)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] || null;
    const evidenceBasis = group.chartCount > 0 && group.exactSolverCount === 0
      ? 'chart'
      : 'exact_solver_match';
    return {
      evidenceScope: group.evidenceScope,
      gameId: group.gameId,
      street: group.street,
      position: group.position,
      spotType: group.spotType,
      samples: group.samples,
      mistakes: group.mistakes,
      totalMeasuredEV: group.totalMeasuredEV,
      measuredEVMistakes: group.measuredEVMistakes,
      mistakenHandExternalIds: group.mistakenHandExternalIds,
      newestAt: group.newestAt,
      dominantPlayerAction,
      evidenceBasis,
      representativeDecision: group.representativeDecision,
      leakType: solverDecisionGroupKey(group),
      errorRate,
      recoveryEligible: group.samples >= minSamples && errorRate < targetErrorRate + 10,
    };
  });
}

export function canResolveSolverLeakScope(leakType, {
  recoveryEligible = false,
  existingHistoryComplete = false,
  sources = {},
  clubArenaSync = {},
} = {}) {
  if (!recoveryEligible || !existingHistoryComplete) return false;
  if (String(leakType).startsWith('solver_training_')) {
    // Window truncation is intentional, but missing/ungradeable canonical
    // questions make that window untrustworthy for recovery.
    return sources.training?.available === true
      && sources.training?.integrityComplete === true;
  }
  if (String(leakType).startsWith('solver_club_arena_')) {
    return sources.handAudit?.available === true
      && clubArenaSync?.complete === true
      && clubArenaSync?.persisted !== false
      && clubArenaSync?.evidenceReconciled !== false;
  }
  return false;
}

/**
 * Aggregate server-verified solver decisions into stable, opportunity-based
 * leaks. Every group is one situation class; rerunning the endpoint with the
 * same rows produces the same occurrence count and EV result.
 */
export function aggregateSolverLeaks(rows, { minSamples = 8, minMistakes = 3, targetErrorRate = 15 } = {}) {
  return summarizeSolverDecisionGroups(rows, { minSamples, targetErrorRate })
    .filter(g => g.samples >= minSamples && g.mistakes >= minMistakes)
    .map(group => {
      const errorRate = group.errorRate;
      if (errorRate < targetErrorRate + 10) return null;
      const fullyMeasuredEV = group.mistakes > 0 && group.measuredEVMistakes === group.mistakes;
      const avgMeasuredEV = fullyMeasuredEV
        ? group.totalMeasuredEV / group.measuredEVMistakes
        : 0;
      const confidence = group.samples >= 40 ? 'high' : group.samples >= 20 ? 'medium' : 'low';
      const context = `${displayToken(group.position)} ${displayToken(group.street)} ${displayToken(group.spotType)}`;
      const recommendedDrill = resolveSolverRecommendedDrill(group);
      return {
        leak_type: group.leakType,
        leak_category: group.street === 'all_streets' ? 'training' : group.street,
        situation_class: `${context} Decisions`,
        status: errorRate >= 50 ? 'persistent' : 'emerging',
        source_system: 'solver_engine',
        confidence,
        // A solver frequency can prove an action error without proving its BB
        // cost. Null keeps that distinction intact all the way through the
        // existing user_leaks schema and the Leak Finder UI.
        avg_ev_loss_bb: fullyMeasuredEV ? +avgMeasuredEV.toFixed(3) : null,
        ev_loss_measured: fullyMeasuredEV,
        occurrence_count: group.mistakes,
        optimal_frequency: targetErrorRate,
        current_frequency: +errorRate.toFixed(1),
        last_detected_at: group.newestAt,
        explanation: `You made a solver-graded error in ${group.mistakes} of ${group.samples} ${context.toLowerCase()} decisions (${errorRate.toFixed(1)}%).`,
        why_leaking_ev: fullyMeasuredEV
          ? `${group.measuredEVMistakes} mistakes include exact per-action solver EV; average measured loss is ${avgMeasuredEV.toFixed(2)} BB.`
          : group.measuredEVMistakes > 0
            ? `Only ${group.measuredEVMistakes} of ${group.mistakes} mistakes expose exact per-action solver EV. Coverage is incomplete, so no aggregate BB loss is claimed.`
            : 'The shared solver range rejects these actions, but the source rows do not expose complete per-action EVs, so no BB loss is invented.',
        recommended_drill: recommendedDrill,
        rule_version: SOLVER_EVIDENCE_RULE_VERSION,
        evidence_basis: group.evidenceBasis,
        representative_decision: group.representativeDecision,
        _sample_count: group.samples,
        _mistake_count: group.mistakes,
        _ev_measured_count: group.measuredEVMistakes,
        _mistaken_hand_external_ids: group.mistakenHandExternalIds,
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.current_frequency - a.current_frequency || b._sample_count - a._sample_count);
}

/**
 * Qualify a set of decision rows for a situation class without fabricating
 * recurring leaks on small samples or inventing optimal play / EV loss on
 * unpriced or failed-lookup rows.
 */
export function qualifySolverDecisionSample(rows = [], { minSamples = 8, minMistakes = 3, targetErrorRate = 15 } = {}) {
  const validRows = Array.isArray(rows) ? rows.filter(Boolean) : [];
  if (validRows.length === 0) {
    return {
      state: 'unavailable_metric',
      isRecurringLeak: false,
      evidenceBasis: null,
      ruleVersion: SOLVER_EVIDENCE_RULE_VERSION,
      opportunities: 0,
      mistakes: 0,
      requiredOpportunities: minSamples,
      requiredMistakes: minMistakes,
      optimalAction: null,
      evLossBB: null,
      evLossMeasured: false,
      limitation: 'No audited decision rows are available for this situation class.',
      explanation: 'Decision evidence is unavailable; no optimal play or EV loss is claimed.',
    };
  }

  const verifiedRows = validRows.filter(row => row.solver_verified === true);
  if (verifiedRows.length === 0) {
    const first = validRows[0];
    const source = String(first?.solver_source || '').toLowerCase();
    const lookupFailed = source.includes('lookup-failed');
    return {
      state: 'unavailable_metric',
      isRecurringLeak: false,
      evidenceBasis: null,
      ruleVersion: SOLVER_EVIDENCE_RULE_VERSION,
      opportunities: 0,
      unpricedCount: validRows.length,
      mistakes: 0,
      requiredOpportunities: minSamples,
      requiredMistakes: minMistakes,
      optimalAction: null,
      evLossBB: null,
      evLossMeasured: false,
      reason: lookupFailed ? 'solver_lookup_failed' : 'no_exact_solver_node',
      limitation: lookupFailed
        ? 'Solver lookup failed for this decision; the spot remains explicitly unpriced until the cache refresh window.'
        : 'No exact solver node matched this decision; no optimal action or EV loss is invented.',
      explanation: 'This spot is unpriced in the verified solver corpus. No optimal play or BB loss is claimed.',
    };
  }

  const groups = summarizeSolverDecisionGroups(verifiedRows, { minSamples, targetErrorRate });
  const primary = groups.sort((a, b) => b.mistakes - a.mistakes || b.samples - a.samples)[0];
  const leaks = aggregateSolverLeaks(verifiedRows, { minSamples, minMistakes, targetErrorRate });

  if (leaks.length > 0) {
    const leak = leaks[0];
    const rep = primary?.representativeDecision || null;
    const drill = leak.recommended_drill;
    const where = `${displayToken(primary.position)} · ${displayToken(primary.street)} · ${displayToken(primary.spotType)}`;
    const nextTime = rep?.solverAction && rep?.playerAction
      ? `Prefer ${displayToken(rep.solverAction)} over ${displayToken(rep.playerAction)} in this node and practice in ${drill}.`
      : `Review the range frequencies in ${drill} to bring your mistake rate below ${targetErrorRate}%.`;
    return {
      state: 'supported_leak',
      isRecurringLeak: true,
      evidenceBasis: primary.evidenceBasis,
      ruleVersion: SOLVER_EVIDENCE_RULE_VERSION,
      opportunities: primary.samples,
      mistakes: primary.mistakes,
      errorRatePct: +primary.errorRate.toFixed(1),
      requiredOpportunities: minSamples,
      requiredMistakes: minMistakes,
      recommendedDrill: drill,
      representativeDecision: rep,
      optimalAction: rep?.solverAction || null,
      evLossBB: leak.avg_ev_loss_bb,
      evLossMeasured: leak.ev_loss_measured,
      takeaway: {
        whatYouAreDoing: leak.explanation,
        where,
        whatToDoNextTime: nextTime,
        summary: `What you are doing: ${leak.explanation} Where: ${where}. Next time: ${nextTime}`,
      },
      leak,
    };
  }

  if (primary.samples < minSamples || (primary.mistakes > 0 && primary.mistakes < minMistakes)) {
    const rep = primary.representativeDecision || null;
    const where = `${displayToken(primary.position)} · ${displayToken(primary.street)} · ${displayToken(primary.spotType)}`;
    const singleHandCopy = rep?.playerAction && rep?.solverAction
      ? `In hand ${rep.handExternalId || 'reviewed'}, choosing ${rep.playerAction} instead of ${rep.solverAction} was a single-spot error.`
      : `Observed ${primary.mistakes} error${primary.mistakes === 1 ? '' : 's'} across ${primary.samples} verified decision${primary.samples === 1 ? '' : 's'}.`;
    return {
      state: 'insufficient_sample',
      isRecurringLeak: false,
      evidenceBasis: primary.evidenceBasis,
      ruleVersion: SOLVER_EVIDENCE_RULE_VERSION,
      opportunities: primary.samples,
      mistakes: primary.mistakes,
      errorRatePct: +primary.errorRate.toFixed(1),
      requiredOpportunities: minSamples,
      requiredMistakes: minMistakes,
      recommendedDrill: resolveSolverRecommendedDrill(primary),
      representativeDecision: rep,
      optimalAction: rep?.solverAction || null,
      evLossBB: rep?.evLossMeasured ? rep.evLossBB : null,
      evLossMeasured: Boolean(rep?.evLossMeasured),
      explanation: `${singleHandCopy} Evidence count: ${primary.mistakes} mistake${primary.mistakes === 1 ? '' : 's'} in ${primary.samples} verified opportunit${primary.samples === 1 ? 'y' : 'ies'} (${minSamples} opportunities and ${minMistakes} mistakes are required before claiming a recurring leak).`,
    };
  }

  return {
    state: 'sound_play',
    isRecurringLeak: false,
    evidenceBasis: primary.evidenceBasis,
    ruleVersion: SOLVER_EVIDENCE_RULE_VERSION,
    opportunities: primary.samples,
    mistakes: primary.mistakes,
    errorRatePct: +primary.errorRate.toFixed(1),
    requiredOpportunities: minSamples,
    requiredMistakes: minMistakes,
    optimalAction: null,
    evLossBB: null,
    evLossMeasured: false,
    explanation: `Sound play across ${primary.samples} verified opportunities (${primary.mistakes} mistakes, ${primary.errorRate.toFixed(1)}% error rate vs ${targetErrorRate}% target).`,
  };
}

export {
  gradeCanonicalPolicyDecision,
};

export default {
  SOLVER_EVIDENCE_RULE_VERSION,
  gradeCanonicalPolicyDecision,
  isVerifiedSolverQuestion,
  enforceSolverClaimHonesty,
  classifyFrequencyDecision,
  gradeSolverDecision,
  resolveSolverRecommendedDrill,
  solverDecisionGroupKey,
  summarizeSolverDecisionGroups,
  canResolveSolverLeakScope,
  aggregateSolverLeaks,
  qualifySolverDecisionSample,
};
