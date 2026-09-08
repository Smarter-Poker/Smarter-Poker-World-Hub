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

  return {
    solverVerified: isVerifiedSolverQuestion(question),
    solverSource: verifiedSolverSource(question),
    classification: frequencyGrade.classification,
    isCorrect: GOOD_CLASSIFICATIONS.has(frequencyGrade.classification),
    selectedFrequency: frequencyGrade.selectedFrequency,
    optimalFrequency: frequencyGrade.optimalFrequency,
    evLoss: measuredEVLoss === null ? null : +measuredEVLoss.toFixed(3),
    evLossMeasured: measuredEVLoss !== null,
    optimalAction: frequencyGrade.optimalAction,
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

  for (const row of rows || []) {
    if (!row?.solver_verified) continue;
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
      });
    }
    const group = groups.get(key);
    group.samples += 1;
    const isMistake = !GOOD_CLASSIFICATIONS.has(classification);
    if (isMistake) {
      group.mistakes += 1;
      if (evidenceScope === 'club_arena' && row.hand_external_id) {
        const externalId = String(row.hand_external_id);
        if (!group.mistakenHandExternalIds.includes(externalId)) {
          group.mistakenHandExternalIds.push(externalId);
        }
      }
      if (row.ev_loss_measured && finiteNumber(row.ev_loss) !== null) {
        group.totalMeasuredEV += Math.max(0, finiteNumber(row.ev_loss));
        group.measuredEVMistakes += 1;
      }
    }
    if (row.answered_at && (!group.newestAt || row.answered_at > group.newestAt)) {
      group.newestAt = row.answered_at;
    }
  }

  return [...groups.values()].map(group => {
    const errorRate = group.samples > 0 ? (group.mistakes / group.samples) * 100 : 0;
    return {
      ...group,
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
        recommended_drill: group.gameId.replace(/_/g, '-'),
        _sample_count: group.samples,
        _mistake_count: group.mistakes,
        _ev_measured_count: group.measuredEVMistakes,
        _mistaken_hand_external_ids: group.mistakenHandExternalIds,
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.current_frequency - a.current_frequency || b._sample_count - a._sample_count);
}

export default { isVerifiedSolverQuestion, enforceSolverClaimHonesty, classifyFrequencyDecision, gradeSolverDecision, solverDecisionGroupKey, summarizeSolverDecisionGroups, canResolveSolverLeakScope, aggregateSolverLeaks };
