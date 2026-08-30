/**
 * Canonical, server-safe grading for decisions made against Training Arena
 * questions. The Leak Finder uses this module too, so a decision cannot be
 * graded one way in the game and interpreted another way by the audit.
 *
 * This module deliberately does not estimate EV. A frequency distribution can
 * prove that an action is outside the solver's strategy, but it cannot prove a
 * BB loss unless the exact question contains per-action EVs.
 */

const VERIFIED_SOURCES = new Set([
  'DETERMINISTIC_SOLVER',
  'local_solver_ranges',
  'PIO_DATABASE',
  'PIO',
  'CHART',
]);

const GOOD_CLASSIFICATIONS = new Set(['best', 'correct']);

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
  const frequencies = question.gtoFrequencies;
  const hasDistribution = frequencies && typeof frequencies === 'object'
    && Object.values(frequencies).some(v => (finiteNumber(v) ?? 0) > 0);
  if (!hasDistribution) return false;
  if (String(question.dataQuality || '').toUpperCase() === 'SIMULATED') return false;

  const source = String(question.source || '');
  if (VERIFIED_SOURCES.has(source)) return true;
  // An explicit provenance object is the only source-less compatibility path.
  // `dataQuality=SOLVER_EXACT` alone is insufficient because legacy enrichment
  // initialized that label before it knew whether frequencies were fabricated.
  return question?.solverProvenance?.verified === true;
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
    solverSource: question?.source || null,
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

/**
 * Aggregate server-verified solver decisions into stable, opportunity-based
 * leaks. Every group is one situation class; rerunning the endpoint with the
 * same rows produces the same occurrence count and EV result.
 */
export function aggregateSolverLeaks(rows, { minSamples = 8, minMistakes = 3, targetErrorRate = 15 } = {}) {
  const groups = new Map();

  for (const row of rows || []) {
    if (!row?.solver_verified) continue;
    const classification = String(row.classification || '').toLowerCase();
    if (!classification) continue;
    const gameId = safeSlug(row.game_id, 'training');
    const street = safeSlug(row.street, 'all_streets');
    const position = safeSlug(row.hero_position, 'all_positions');
    const spotType = safeSlug(row.spot_type, 'general');
    const key = `${gameId}|${street}|${position}|${spotType}`;
    if (!groups.has(key)) {
      groups.set(key, {
        gameId, street, position, spotType,
        samples: 0, mistakes: 0, totalMeasuredEV: 0, measuredEVMistakes: 0,
        newestAt: null,
      });
    }
    const group = groups.get(key);
    group.samples += 1;
    const isMistake = !GOOD_CLASSIFICATIONS.has(classification);
    if (isMistake) {
      group.mistakes += 1;
      if (row.ev_loss_measured && finiteNumber(row.ev_loss) !== null) {
        group.totalMeasuredEV += Math.max(0, finiteNumber(row.ev_loss));
        group.measuredEVMistakes += 1;
      }
    }
    if (row.answered_at && (!group.newestAt || row.answered_at > group.newestAt)) {
      group.newestAt = row.answered_at;
    }
  }

  return [...groups.values()]
    .filter(g => g.samples >= minSamples && g.mistakes >= minMistakes)
    .map(group => {
      const errorRate = (group.mistakes / group.samples) * 100;
      if (errorRate < targetErrorRate + 10) return null;
      const avgMeasuredEV = group.measuredEVMistakes > 0
        ? group.totalMeasuredEV / group.measuredEVMistakes
        : 0;
      const confidence = group.samples >= 40 ? 'high' : group.samples >= 20 ? 'medium' : 'low';
      const context = `${displayToken(group.position)} ${displayToken(group.street)} ${displayToken(group.spotType)}`;
      return {
        leak_type: `solver_${group.gameId}_${group.street}_${group.position}_${group.spotType}`.slice(0, 180),
        leak_category: group.street === 'all_streets' ? 'training' : group.street,
        situation_class: `${context} Decisions`,
        status: errorRate >= 50 ? 'persistent' : 'emerging',
        source_system: 'solver_engine',
        confidence,
        // A solver frequency can prove an action error without proving its BB
        // cost. Null keeps that distinction intact all the way through the
        // existing user_leaks schema and the Leak Finder UI.
        avg_ev_loss_bb: group.measuredEVMistakes > 0 ? +avgMeasuredEV.toFixed(3) : null,
        occurrence_count: group.mistakes,
        optimal_frequency: targetErrorRate,
        current_frequency: +errorRate.toFixed(1),
        last_detected_at: group.newestAt,
        explanation: `You made a solver-graded error in ${group.mistakes} of ${group.samples} ${context.toLowerCase()} decisions (${errorRate.toFixed(1)}%).`,
        why_leaking_ev: group.measuredEVMistakes > 0
          ? `${group.measuredEVMistakes} mistakes include exact per-action solver EV; average measured loss is ${avgMeasuredEV.toFixed(2)} BB.`
          : 'The shared solver range rejects these actions, but the source rows do not expose complete per-action EVs, so no BB loss is invented.',
        recommended_drill: group.gameId.replace(/_/g, '-'),
        _sample_count: group.samples,
        _mistake_count: group.mistakes,
        _ev_measured_count: group.measuredEVMistakes,
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.current_frequency - a.current_frequency || b._sample_count - a._sample_count);
}

export default { isVerifiedSolverQuestion, classifyFrequencyDecision, gradeSolverDecision, aggregateSolverLeaks };
