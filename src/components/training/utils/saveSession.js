/**
 * LEGACY PRACTICE SESSION UTILITY
 *
 * Retained specialty trainers compute results in the browser. Those results
 * are useful as personal practice notes, but they are not authoritative
 * Training attempts and may not affect progress, rewards, or leaderboards.
 */

import { busEmit } from '../../../engine/EventBus';
import { getAuthUser } from '../../../lib/authUtils';
import { savePracticeSession } from '../../../lib/training/practiceSession';

/**
 * Save training session data to backend
 * @param {Object} sessionData - All session data to save
 * @param {string} sessionData.gameId - Game identifier
 * @param {string} sessionData.gameName - Display name of game
 * @param {number} sessionData.gtowScore - GTOW score (0-100)
 * @param {number} sessionData.totalEVLoss - Total EV loss in BB
 * @param {number} sessionData.totalQuestions - Number of questions answered
 * @param {number} sessionData.sessionMistakes - Number of mistakes made
 * @param {number} sessionData.correctCount - Number of correct answers
 * @param {number} sessionData.bestStreak - Best streak achieved
 * @param {boolean} sessionData.levelPassed - Whether level was passed
 * @param {number} sessionData.currentLevel - Current level number
 * @param {Array} sessionData.handHistory - Array of hand history entries
 * @param {number} sessionData.avgEVLossPerHand - Average EV loss per hand
 * @param {number} sessionData.avgEVLossPerMistake - Average EV loss per mistake
 * @param {number} sessionData.avgFrequencyDiff - Average frequency difference
 * @param {Object} sessionData.trainerConfig - Trainer configuration object
 * @returns {Promise<void>}
 */
export async function saveSession(sessionData) {
  const user = getAuthUser();
  if (!user?.id) return;
  const gameId = String(sessionData?.gameId || sessionData?.game_id || 'legacy-training-practice');
  await savePracticeSession(gameId, {
    ...sessionData,
    handsPlayed: sessionData?.handsPlayed ?? sessionData?.totalQuestions,
    correctAnswers: sessionData?.correctAnswers ?? sessionData?.correctCount,
    accuracy: sessionData?.accuracy ?? (
      Number(sessionData?.totalQuestions) > 0
        ? Math.round((Number(sessionData?.correctCount) / Number(sessionData?.totalQuestions)) * 100)
        : null
    ),
  });
  try {
    busEmit.sessionEnd('Training Practice');
    busEmit.dataMutated('training_tool_records');
  } catch (busErr) {
    console.warn('[saveSession] Practice record bus event failed:', busErr?.message || busErr);
  }
}
