/**
 * Converts the immutable server ledger response into one canonical UI result.
 * The fallback is used only for legacy, non-token drills. A verified retry can
 * switch interaction modes, so its trigger must never override the locked row.
 */
export function lockedDrillResult(graded, fallbackPick = null) {
  const timedOut = graded?.timedOut === true;
  const correct = !timedOut && graded?.isCorrect === true;
  const pick = timedOut ? 'Ran out of time' : (graded?.selectedAnswer || fallbackPick || null);
  return { timedOut, correct, pick };
}

export default lockedDrillResult;
