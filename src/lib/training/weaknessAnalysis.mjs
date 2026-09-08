const NON_SCORING_TOOLS = new Set(['focus-timer', 'risk-analyzer', 'gto-preloader']);

function verifiedCounts(session) {
  const total = Number(session?.hands_played ?? session?.total_questions ?? session?.questions_answered);
  const correct = Number(session?.correct_count ?? session?.questions_correct);
  if (!Number.isFinite(total) || total <= 0) return null;
  if (!Number.isFinite(correct) || correct < 0 || correct > total) return null;
  return { total, correct };
}

function recommendationFor(gameId, area, accuracy, sample) {
  const evidence = `${area} is ${Math.round(accuracy)}% across ${sample} verified decisions.`;
  if (gameId.includes('preflop')) {
    return {
      category: 'Preflop',
      recommendation: `${evidence} Review each incorrect answer's authored or solver-backed explanation, then repeat the module.`,
    };
  }
  if (gameId.includes('icm') || gameId.includes('tournament')) {
    return {
      category: 'ICM / Math',
      recommendation: `${evidence} Recheck the payout, stack, and position context shown with each missed answer before repeating the module.`,
    };
  }
  if (gameId.includes('ev') || gameId.includes('geometry') || gameId.includes('odds')) {
    return {
      category: 'Postflop Math',
      recommendation: `${evidence} Rework the recorded calculation in each missed response, then repeat the module.`,
    };
  }
  if (gameId.includes('short-deck')) {
    return {
      category: 'Variant Rules',
      recommendation: `${evidence} Review the variant-specific explanation attached to each missed answer, then repeat the module.`,
    };
  }
  return {
    category: 'General Tactics',
    recommendation: `${evidence} Review the missed-answer explanations and repeat this module to confirm improvement.`,
  };
}

export function analyzeVerifiedTrainingWeaknesses(sessions) {
  if (!Array.isArray(sessions) || sessions.length === 0) return null;

  let totalHands = 0;
  let totalCorrect = 0;
  const gameAccuracy = {};

  for (const session of sessions) {
    const counts = verifiedCounts(session);
    if (!counts) continue;
    totalHands += counts.total;
    totalCorrect += counts.correct;

    const gameId = String(session?.game_id || session?.gameId || '').trim();
    if (!gameId || NON_SCORING_TOOLS.has(gameId)) continue;
    if (!gameAccuracy[gameId]) gameAccuracy[gameId] = { total: 0, correct: 0 };
    gameAccuracy[gameId].total += counts.total;
    gameAccuracy[gameId].correct += counts.correct;
  }

  const leaks = Object.entries(gameAccuracy).flatMap(([gameId, counts], index) => {
    if (counts.total < 3) return [];
    const accuracy = (counts.correct / counts.total) * 100;
    if (accuracy > 85) return [];
    const area = gameId.replace(/-/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
    const { category, recommendation } = recommendationFor(gameId, area, accuracy, counts.total);
    return [{
      id: index + 1,
      cat: category,
      area,
      acc: Math.round(accuracy),
      sample: counts.total,
      tip: recommendation,
      sev: accuracy < 65 ? 'High' : 'Medium',
      gameId,
    }];
  }).sort((a, b) => a.acc - b.acc);

  return {
    overallAcc: totalHands > 0 ? (totalCorrect / totalHands) * 100 : null,
    totalHands,
    leaks,
  };
}
