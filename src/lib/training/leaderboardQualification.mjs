/**
 * TRAINING LEADERBOARD QUALIFICATION (2026-11-27)
 *
 * The verified board ranked purely by accuracy, so one correct answer (100%)
 * outranked a player with 738 correct answers at 90%. A ranking by accuracy is
 * only meaningful over a sample, so a player is RANKED by accuracy once they
 * have answered the period's minimum number of verified questions. Below it
 * they are PROVISIONAL: listed after every ranked player, ordered by correct
 * answers, and told how many more answers they need.
 *
 * The same thresholds drive the list (pages/api/training/leaderboard.js) and
 * the caller's own rank (fn_training_verified_leaderboard_rank_v3), so the
 * number on "Your Rank" always matches the row on the board.
 */
export const LEADERBOARD_MIN_QUESTIONS = Object.freeze({
  daily: 20,
  weekly: 50,
  monthly: 100,
  alltime: 100,
});

export function minQuestionsForPeriod(period) {
  return LEADERBOARD_MIN_QUESTIONS[period] ?? LEADERBOARD_MIN_QUESTIONS.alltime;
}

export function qualificationFor(questionsAnswered, period) {
  const minQuestions = minQuestionsForPeriod(period);
  const answered = Math.max(0, Number(questionsAnswered) || 0);
  return {
    minQuestions,
    qualified: answered >= minQuestions,
    questionsToQualify: Math.max(0, minQuestions - answered),
  };
}
