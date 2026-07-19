/**
 * SAVE SESSION UTILITY
 * Handles auto-saving training session data to the backend
 */

import { enqueueMutation } from '../../../engine/OfflineSyncQueue';
import { busEmit } from '../../../engine/EventBus';

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
 * @param {number} sessionData.speedBonusDiamonds - Speed bonus diamonds earned
 * @returns {Promise<void>}
 */
export async function saveSession(sessionData) {
  const {
    gameId,
    gameName,
    gtowScore,
    totalEVLoss,
    totalQuestions,
    sessionMistakes,
    correctCount,
    bestStreak,
    levelPassed,
    currentLevel,
    handHistory,
    avgEVLossPerHand,
    avgEVLossPerMistake,
    avgFrequencyDiff,
    trainerConfig,
    speedBonusDiamonds,
  } = sessionData;

  // Get auth user + access token
  // BUG FIX (2026-05-08, MAX-RIGOR audit): getAuthUser() returns the User object
  // (no `.session.access_token`), so the previous check `user?.session?.access_token`
  // was ALWAYS undefined and this whole function silent-returned on every session
  // completion. Use getSessionToken() — the canonical token getter that reads
  // `localStorage.getItem('smarter-poker-auth').access_token`.
  const { getAuthUser, getSessionToken } = await import('../../../lib/authUtils');
  const user = getAuthUser();
  const accessToken = getSessionToken();
  if (!user?.id || !accessToken) return;

  // Build position stats from hand history
  const posStats = {};
  const classCounts = {};
  handHistory.forEach((h) => {
    const pos = h.handData?.heroPosition || 'UNK';
    if (!posStats[pos]) posStats[pos] = { correct: 0, total: 0, evLoss: 0 };
    posStats[pos].total++;
    if (h.classification === 'best' || h.classification === 'correct') posStats[pos].correct++;
    posStats[pos].evLoss += h.evLoss || 0;
    if (h.classification) classCounts[h.classification] = (classCounts[h.classification] || 0) + 1;
  });

  // ═══ 2026-07-19 AUDIT FIX (E2E defect D1 — CRITICAL) ═══
  // Each handHistory entry carried the FULL question object including
  // rawFrequencies (a per-action x 169-hand solver matrix) and
  // evData.handEVs (another 169-hand map). 100 such entries blew past the
  // 1MB Next.js body limit, so POST /api/training/save-session returned
  // 413 on EVERY level completion — sessions were never saved and the
  // level-progression system was dead in production. Strip the bulk
  // matrices; keep everything the review/replay/report consumers read.
  const compactHandHistory = (handHistory || []).slice(0, 100).map((h) => {
    if (!h || typeof h !== 'object') return h;
    const hd = h.handData && typeof h.handData === 'object' ? h.handData : null;
    return {
      ...h,
      handData: hd
        ? {
            ...hd,
            rawFrequencies: undefined,
            evData:
              hd.evData && typeof hd.evData === 'object'
                ? { ...hd.evData, handEVs: undefined }
                : hd.evData ?? null,
          }
        : hd,
    };
  });

  const payload = {
    gameId,
    gameName,
    gtowScore,
    totalEVLoss,
    handsPlayed: totalQuestions,
    mistakeCount: sessionMistakes,
    avgEVLossPerHand,
    avgEVLossPerMistake,
    avgFrequencyDiff,
    accuracy: totalQuestions > 0 ? Math.round((correctCount / totalQuestions) * 100) : 0,
    correctCount,
    bestStreak,
    levelPassed,
    level: currentLevel,
    handHistory: compactHandHistory,
    positionStats: posStats,
    classificationCounts: classCounts,
    trainerConfig,
    speedBonusDiamonds,
  };

  try {
    const res = await fetch('/api/training/save-session', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) throw new Error(`HTTP Error ${res.status}`);
    console.debug('[saveSession] Session saved directly to database');

    // H7: Hardened busEmit — bus failures must never crash the save flow
    try {
      busEmit.sessionEnd('Training Arena');
      busEmit.dataMutated('training_sessions');
      if (speedBonusDiamonds > 0) {
        busEmit.diamondsEarned(speedBonusDiamonds, 'Training Speed Bonus');
      }
    } catch (busErr) {
      console.warn('[saveSession] busEmit failed (non-critical):', busErr.message);
    }
  } catch (e) {
    console.warn('[saveSession] Network save failed, queueing to OfflineSyncQueue:', e.message);
    await enqueueMutation('/api/training/save-session', payload, {
      Authorization: `Bearer ${accessToken}`,
    });
  }
}
