/**
 * Project a sealed training_sessions row onto the evidence that the product is
 * allowed to display. Database compatibility columns use zero when no solver
 * EV was measured, so those columns cannot be consumed directly by UI code.
 */

export function finiteTrainingNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function deriveTrainingSessionAccuracy(session) {
  const answered = finiteTrainingNumber(session?.hands_played);
  const correct = finiteTrainingNumber(session?.correct_count);

  if (answered !== null) {
    if (
      !Number.isInteger(answered)
      || answered <= 0
      || !Number.isInteger(correct)
      || correct < 0
      || correct > answered
    ) return null;
    return Math.round((correct / answered) * 100);
  }

  const storedAccuracy = finiteTrainingNumber(session?.accuracy);
  return storedAccuracy !== null && storedAccuracy >= 0 && storedAccuracy <= 100
    ? storedAccuracy
    : null;
}

export function signedTrainingScore(session) {
  if (Number(session?.score_scale) !== 2) return null;
  const score = finiteTrainingNumber(session?.gtow_score);
  return score !== null && score >= -100 && score <= 100 ? score : null;
}

function measuredHistoryEntry(entry) {
  if (entry?.solverVerified !== true || entry?.evLossMeasured !== true) return null;
  return finiteTrainingNumber(entry?.evLoss);
}

function projectPositionStats(session, handHistory) {
  const projected = {};
  const source = session?.position_stats && typeof session.position_stats === 'object'
    ? session.position_stats
    : {};

  for (const [position, stats] of Object.entries(source)) {
    const total = finiteTrainingNumber(stats?.total);
    const correct = finiteTrainingNumber(stats?.correct);
    if (
      !Number.isInteger(total)
      || total < 0
      || !Number.isInteger(correct)
      || correct < 0
      || correct > total
    ) continue;
    projected[position] = {
      total,
      correct,
      accuracy: total > 0 ? Number(((correct / total) * 100).toFixed(2)) : null,
      evLoss: null,
      avgEvLoss: null,
      measuredEvDecisions: 0,
    };
  }

  for (const entry of handHistory) {
    const position = String(entry?.heroPosition || 'unknown');
    if (!projected[position]) {
      projected[position] = {
        total: 0,
        correct: 0,
        accuracy: null,
        evLoss: null,
        avgEvLoss: null,
        measuredEvDecisions: 0,
      };
    }
    const evLoss = measuredHistoryEntry(entry);
    if (evLoss === null) continue;
    projected[position].evLoss = (projected[position].evLoss ?? 0) + evLoss;
    projected[position].measuredEvDecisions += 1;
  }

  for (const stats of Object.values(projected)) {
    if (stats.measuredEvDecisions > 0) {
      stats.evLoss = Number(stats.evLoss.toFixed(4));
      stats.avgEvLoss = Number((stats.evLoss / stats.measuredEvDecisions).toFixed(4));
    }
  }

  return projected;
}

export function projectTrainingSessionEvidence(row) {
  if (!row || typeof row !== 'object') return row;
  const { training_attempts: _attempt, ...session } = row;
  const handHistory = Array.isArray(session.hand_history) ? session.hand_history : [];
  const measuredLosses = handHistory
    .map(measuredHistoryEntry)
    .filter((value) => value !== null);
  const measuredEvDecisions = measuredLosses.length;
  const totalEvLoss = measuredEvDecisions > 0
    ? Number(measuredLosses.reduce((sum, value) => sum + value, 0).toFixed(4))
    : null;
  const decisionCount = handHistory.length;

  return {
    ...session,
    gtow_score_signed: signedTrainingScore(session),
    total_ev_loss: totalEvLoss,
    avg_ev_loss_per_hand: null,
    avg_ev_loss_per_mistake: null,
    avg_ev_loss_per_measured_decision: measuredEvDecisions > 0
      ? Number((totalEvLoss / measuredEvDecisions).toFixed(4))
      : null,
    measured_ev_decisions: measuredEvDecisions,
    ev_loss_decision_coverage: decisionCount > 0
      ? Number((measuredEvDecisions / decisionCount).toFixed(4))
      : null,
    ev_loss_complete: decisionCount > 0 && measuredEvDecisions === decisionCount,
    decision_count: decisionCount,
    position_stats: projectPositionStats(session, handHistory),
  };
}

export function projectTrainingLevelHistory(row) {
  const rawAccuracy = finiteTrainingNumber(row?.accuracy_percentage);
  const accuracy = rawAccuracy !== null && rawAccuracy >= 0 && rawAccuracy <= 100
    ? rawAccuracy
    : null;
  const rawAnswered = finiteTrainingNumber(row?.questions_answered);
  const rawCorrect = finiteTrainingNumber(row?.questions_correct);
  const countsValid = Number.isInteger(rawAnswered)
    && rawAnswered >= 0
    && Number.isInteger(rawCorrect)
    && rawCorrect >= 0
    && rawCorrect <= rawAnswered;
  const questionsAnswered = countsValid ? rawAnswered : 0;
  const questionsCorrect = countsValid ? rawCorrect : 0;
  return {
    id: row?.id,
    game_id: row?.game_id,
    gtow_score: null,
    score_scale: null,
    gtow_score_signed: null,
    hands_played: questionsAnswered,
    total_ev_loss: null,
    avg_ev_loss_per_hand: null,
    avg_ev_loss_per_mistake: null,
    avg_ev_loss_per_measured_decision: null,
    measured_ev_decisions: 0,
    ev_loss_decision_coverage: null,
    ev_loss_complete: false,
    decision_count: 0,
    mistake_count: questionsAnswered - questionsCorrect,
    accuracy,
    correct_count: questionsCorrect,
    best_streak: Number(row?.best_streak) || 0,
    level_passed: row?.passed === true,
    level: Number(row?.level) || 1,
    created_at: row?.created_at || null,
    position_stats: {},
    classification_counts: {},
    hand_history: [],
  };
}
