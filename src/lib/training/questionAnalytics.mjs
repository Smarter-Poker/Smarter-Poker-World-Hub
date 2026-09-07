export function buildQuestionConfusion(answers, limit = 25) {
  const questions = new Map();
  for (const answer of answers || []) {
    if (!answer?.question_id) continue;
    const key = `${answer.game_id || 'unknown'}:${answer.question_id}`;
    if (!questions.has(key)) {
      questions.set(key, {
        gameId: answer.game_id || 'unknown',
        questionId: answer.question_id,
        attempts: 0,
        correct: 0,
        measuredEvLoss: 0,
        measuredEvDecisions: 0,
        verified: 0,
        selectedAnswers: {},
        wrongAnswers: {},
        optimalAction: null,
        lastLevel: null,
        lastAnswered: null,
      });
    }
    const row = questions.get(key);
    row.attempts += 1;
    if (answer.is_correct) row.correct += 1;
    const rawEvLoss = answer.ev_loss;
    const evLoss = Number(rawEvLoss);
    if (answer.solver_verified === true
      && answer.ev_loss_measured === true
      && rawEvLoss !== null
      && rawEvLoss !== undefined
      && rawEvLoss !== ''
      && Number.isFinite(evLoss)) {
      row.measuredEvLoss += evLoss;
      row.measuredEvDecisions += 1;
    }
    if (answer.solver_verified) row.verified += 1;

    const selected = String(answer.answer_id || 'unknown');
    row.selectedAnswers[selected] = (row.selectedAnswers[selected] || 0) + 1;
    if (!answer.is_correct) row.wrongAnswers[selected] = (row.wrongAnswers[selected] || 0) + 1;

    const optimal = answer.evidence_metadata?.optimalAction;
    if (typeof optimal === 'string' && optimal) row.optimalAction = optimal;
    if (!row.lastAnswered || String(answer.answered_at) > row.lastAnswered) {
      row.lastAnswered = String(answer.answered_at || '');
      row.lastLevel = Math.min(12, Math.max(1, Number(answer.level) || 1));
    }
  }

  return [...questions.values()]
    .map((row) => {
      const wrong = row.attempts - row.correct;
      const mostCommonWrong = Object.entries(row.wrongAnswers)
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0] || null;
      const avgEvLoss = row.measuredEvDecisions > 0
        ? Number((row.measuredEvLoss / row.measuredEvDecisions).toFixed(3))
        : null;
      const { measuredEvLoss, ...publicRow } = row;
      return {
        ...publicRow,
        totalEvLoss: row.measuredEvDecisions > 0
          ? Number(measuredEvLoss.toFixed(3))
          : null,
        avgEvLoss,
        wrong,
        accuracy: row.attempts > 0 ? Math.round((row.correct / row.attempts) * 100) : 0,
        confusionRate: row.attempts > 0 ? Math.round((wrong / row.attempts) * 100) : 0,
        solverVerifiedRate: row.attempts > 0
          ? Math.round((row.verified / row.attempts) * 100)
          : 0,
        mostCommonWrongAnswer: mostCommonWrong
          ? { answerId: mostCommonWrong[0], count: mostCommonWrong[1] }
          : null,
      };
    })
    .sort((a, b) => (
      b.wrong - a.wrong
      || b.confusionRate - a.confusionRate
      || (b.avgEvLoss ?? Number.NEGATIVE_INFINITY)
        - (a.avgEvLoss ?? Number.NEGATIVE_INFINITY)
      || b.attempts - a.attempts
    ))
    .slice(0, Math.max(1, Number(limit) || 25));
}
