/**
 * 📊 PERFORMANCE TRACKER — Horse Brain Analytics & Anomaly Detection
 * ═══════════════════════════════════════════════════════════════════
 *
 * Tracks real-time performance metrics for every horse across all tables:
 *   - bb/100 (big blinds won per 100 hands)
 *   - VPIP, PFR, 3bet%, AF per variant per session
 *   - Win rate trends with rolling windows
 *   - Session P&L with bankroll tracking
 *   - Anomaly detection (bot opponents, impossible stats, rake verification)
 *
 * Used by:
 *   - Session Management (when to leave a table)
 *   - Health Watchdog (performance-based alerts)
 *   - GameController (table selection quality)
 *   - Supabase persistence (long-term analytics)
 *
 * ═══════════════════════════════════════════════════════════════════
 */

// ═══════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════

const ROLLING_WINDOW_HANDS = 500;       // Rolling window for bb/100 calculation
const ANOMALY_CHECK_INTERVAL = 100;     // Check for anomalies every 100 hands
const MIN_HANDS_FOR_STATS = 20;         // Minimum hands before stats are meaningful
const BOT_DETECTION_THRESHOLD = 0.98;   // Suspiciously perfect action timing consistency
const RAKE_TOLERANCE_PERCENT = 5;       // Alert if rake deviates >5% from expected

// bb/100 thresholds (in BB units)
const WINRATE_THRESHOLDS = {
  crushing: 10,      // > 10 bb/100 = crushing
  winning: 3,        // > 3 bb/100 = solid winner
  breakeven: -3,     // -3 to 3 = breakeven
  losing: -10,       // -10 to -3 = losing
  disaster: -Infinity // < -10 = disaster
};

// ═══════════════════════════════════════════════════════════════════
// HORSE SESSION TRACKER
// ═══════════════════════════════════════════════════════════════════

class HorseSession {
  /**
   * @param {string} horseId
   * @param {string} tableId
   * @param {string} variant
   * @param {number} bigBlind
   * @param {number} initialStack
   */
  constructor(horseId, tableId, variant, bigBlind, initialStack) {
    this.horseId = horseId;
    this.tableId = tableId;
    this.variant = variant;
    this.bigBlind = bigBlind;
    this.initialStack = initialStack;
    this.currentStack = initialStack;
    this.startTime = Date.now();

    // Hand-level tracking
    this.handsPlayed = 0;
    this.handsWon = 0;

    // Preflop stats
    this.vpipCount = 0;        // Voluntarily Put $ In Pot
    this.pfrCount = 0;         // Preflop Raise
    this.threeBetCount = 0;    // 3-bet
    this.threeBetOpportunity = 0;
    this.foldToThreeBet = 0;
    this.facedThreeBet = 0;

    // Postflop stats
    this.cBetCount = 0;
    this.cBetOpportunity = 0;
    this.totalBets = 0;
    this.totalCalls = 0;
    this.totalChecks = 0;
    this.totalFolds = 0;
    this.totalRaises = 0;

    // Showdown
    this.wentToShowdown = 0;
    this.wonAtShowdown = 0;

    // P&L tracking (in chips)
    this.resultsHistory = [];  // Array of { handNum, chipDelta, bbDelta }
    this.totalChipDelta = 0;
    this.peakStack = initialStack;
    this.troughStack = initialStack;

    // Rake paid
    this.totalRakePaid = 0;

    // Timing
    this.actionTimesMs = [];   // Last 100 action times for timing analysis

    // Anomalies detected
    this.anomalies = [];
  }

  /**
   * Record a completed hand result.
   * @param {Object} result
   * @param {number} result.chipDelta - Chips won/lost this hand
   * @param {boolean} result.vpip - Did the horse voluntarily put money in?
   * @param {boolean} result.pfr - Did the horse raise preflop?
   * @param {boolean} result.wentToShowdown
   * @param {boolean} result.wonHand
   * @param {number} result.rakePaid
   * @param {Object} result.actions - { bets, calls, checks, folds, raises }
   * @param {number} [result.actionTimeMs] - How long the horse took to decide
   */
  recordHand(result) {
    this.handsPlayed++;

    // P&L
    const bbDelta = result.chipDelta / this.bigBlind;
    this.totalChipDelta += result.chipDelta;
    this.currentStack += result.chipDelta;
    this.peakStack = Math.max(this.peakStack, this.currentStack);
    this.troughStack = Math.min(this.troughStack, this.currentStack);

    this.resultsHistory.push({
      handNum: this.handsPlayed,
      chipDelta: result.chipDelta,
      bbDelta,
      timestamp: Date.now(),
    });

    // Keep rolling window
    if (this.resultsHistory.length > ROLLING_WINDOW_HANDS * 2) {
      this.resultsHistory = this.resultsHistory.slice(-ROLLING_WINDOW_HANDS);
    }

    // Stats
    if (result.vpip) this.vpipCount++;
    if (result.pfr) this.pfrCount++;
    if (result.wonHand) this.handsWon++;
    if (result.wentToShowdown) this.wentToShowdown++;
    if (result.wonHand && result.wentToShowdown) this.wonAtShowdown++;
    if (result.rakePaid) this.totalRakePaid += result.rakePaid;

    // Actions
    if (result.actions) {
      this.totalBets += result.actions.bets || 0;
      this.totalCalls += result.actions.calls || 0;
      this.totalChecks += result.actions.checks || 0;
      this.totalFolds += result.actions.folds || 0;
      this.totalRaises += result.actions.raises || 0;
    }

    // Action timing
    if (result.actionTimeMs) {
      this.actionTimesMs.push(result.actionTimeMs);
      if (this.actionTimesMs.length > 100) {
        this.actionTimesMs = this.actionTimesMs.slice(-100);
      }
    }

    // Periodic anomaly check
    if (this.handsPlayed % ANOMALY_CHECK_INTERVAL === 0) {
      this._checkAnomalies();
    }
  }

  /**
   * Record a 3-bet opportunity.
   * @param {boolean} didThreeBet
   */
  recordThreeBetOpportunity(didThreeBet) {
    this.threeBetOpportunity++;
    if (didThreeBet) this.threeBetCount++;
  }

  /**
   * Record facing a 3-bet.
   * @param {boolean} didFold
   */
  recordFacedThreeBet(didFold) {
    this.facedThreeBet++;
    if (didFold) this.foldToThreeBet++;
  }

  /**
   * Record a c-bet opportunity.
   * @param {boolean} didCBet
   */
  recordCBetOpportunity(didCBet) {
    this.cBetOpportunity++;
    if (didCBet) this.cBetCount++;
  }

  /**
   * Get computed statistics.
   * @returns {Object} Stats summary
   */
  getStats() {
    const h = Math.max(this.handsPlayed, 1);
    const totalActions = this.totalBets + this.totalCalls + this.totalChecks + this.totalFolds + this.totalRaises;

    // bb/100 over full session
    const bbPer100 = h >= MIN_HANDS_FOR_STATS
      ? (this.totalChipDelta / this.bigBlind) / h * 100
      : null;

    // bb/100 over rolling window
    const recentHands = this.resultsHistory.slice(-ROLLING_WINDOW_HANDS);
    const rollingBBPer100 = recentHands.length >= MIN_HANDS_FOR_STATS
      ? (recentHands.reduce((sum, r) => sum + r.bbDelta, 0) / recentHands.length) * 100
      : null;

    return {
      horseId: this.horseId,
      tableId: this.tableId,
      variant: this.variant,
      bigBlind: this.bigBlind,
      handsPlayed: this.handsPlayed,
      sessionDurationMin: Math.round((Date.now() - this.startTime) / 60000),

      // P&L
      totalChipDelta: this.totalChipDelta,
      totalBBDelta: +(this.totalChipDelta / this.bigBlind).toFixed(2),
      bbPer100: bbPer100 !== null ? +bbPer100.toFixed(2) : null,
      rollingBBPer100: rollingBBPer100 !== null ? +rollingBBPer100.toFixed(2) : null,
      peakStack: this.peakStack,
      troughStack: this.troughStack,
      currentStack: this.currentStack,

      // Playing stats (as percentages)
      vpip: +(this.vpipCount / h * 100).toFixed(1),
      pfr: +(this.pfrCount / h * 100).toFixed(1),
      threeBet: this.threeBetOpportunity > 0 ? +(this.threeBetCount / this.threeBetOpportunity * 100).toFixed(1) : 0,
      foldToThreeBet: this.facedThreeBet > 0 ? +(this.foldToThreeBet / this.facedThreeBet * 100).toFixed(1) : 0,
      cBet: this.cBetOpportunity > 0 ? +(this.cBetCount / this.cBetOpportunity * 100).toFixed(1) : 0,

      // Aggression factor: (bets + raises) / calls
      aggressionFactor: this.totalCalls > 0
        ? +((this.totalBets + this.totalRaises) / this.totalCalls).toFixed(2) : 0,

      // Showdown stats
      wtsd: +(this.wentToShowdown / h * 100).toFixed(1),
      wsd: this.wentToShowdown > 0 ? +(this.wonAtShowdown / this.wentToShowdown * 100).toFixed(1) : 0,

      // Win rate classification
      winRateClass: this._classifyWinRate(bbPer100),

      // Rake
      totalRakePaid: this.totalRakePaid,
      rakePerHand: +(this.totalRakePaid / h).toFixed(2),

      // Anomalies
      anomalies: this.anomalies.slice(-5),
    };
  }

  /**
   * Classify win rate into human-readable category.
   * @private
   */
  _classifyWinRate(bbPer100) {
    if (bbPer100 === null) return 'insufficient_data';
    if (bbPer100 > WINRATE_THRESHOLDS.crushing) return 'crushing';
    if (bbPer100 > WINRATE_THRESHOLDS.winning) return 'winning';
    if (bbPer100 > WINRATE_THRESHOLDS.breakeven) return 'breakeven';
    if (bbPer100 > WINRATE_THRESHOLDS.losing) return 'losing';
    return 'disaster';
  }

  /**
   * Check for statistical anomalies.
   * @private
   */
  _checkAnomalies() {
    // Anomaly detection will be enhanced over time
    // For now, check basic sanity
    if (this.handsPlayed < MIN_HANDS_FOR_STATS) return;

    const vpipPct = this.vpipCount / this.handsPlayed;
    const pfrPct = this.pfrCount / this.handsPlayed;

    // PFR should never exceed VPIP
    if (pfrPct > vpipPct + 0.01) {
      this.anomalies.push({
        type: 'pfr_exceeds_vpip',
        time: Date.now(),
        detail: `PFR ${(pfrPct * 100).toFixed(1)}% > VPIP ${(vpipPct * 100).toFixed(1)}%`,
      });
    }
  }
}

// ═══════════════════════════════════════════════════════════════════
// PERFORMANCE TRACKER (GLOBAL SINGLETON)
// ═══════════════════════════════════════════════════════════════════

class PerformanceTracker {
  constructor() {
    // Active sessions: `${horseId}:${tableId}` → HorseSession
    this._sessions = new Map();

    // Completed session summaries (persisted to Supabase periodically)
    this._completedSessions = [];

    // Opponent anomaly tracker: opponentId → { timing, stats }
    this._opponentAnomalies = new Map();

    // Global stats across all horses
    this._globalStats = {
      totalHandsDealt: 0,
      totalRakeCollected: 0,
      totalHorseSessions: 0,
    };
  }

  /**
   * Start tracking a horse session.
   * @param {string} horseId
   * @param {string} tableId
   * @param {string} variant
   * @param {number} bigBlind
   * @param {number} buyIn
   * @returns {HorseSession}
   */
  startSession(horseId, tableId, variant, bigBlind, buyIn) {
    const key = `${horseId}:${tableId}`;
    const session = new HorseSession(horseId, tableId, variant, bigBlind, buyIn);
    this._sessions.set(key, session);
    this._globalStats.totalHorseSessions++;
    return session;
  }

  /**
   * Get an active session.
   * @param {string} horseId
   * @param {string} tableId
   * @returns {HorseSession|null}
   */
  getSession(horseId, tableId) {
    return this._sessions.get(`${horseId}:${tableId}`) || null;
  }

  /**
   * End a horse session and archive the results.
   * @param {string} horseId
   * @param {string} tableId
   * @returns {Object|null} Final session stats
   */
  endSession(horseId, tableId) {
    const key = `${horseId}:${tableId}`;
    const session = this._sessions.get(key);
    if (!session) return null;

    const stats = session.getStats();
    this._completedSessions.push(stats);

    // Keep last 200 completed sessions
    if (this._completedSessions.length > 200) {
      this._completedSessions = this._completedSessions.slice(-200);
    }

    this._sessions.delete(key);
    return stats;
  }

  /**
   * Record a hand result for a horse.
   * @param {string} horseId
   * @param {string} tableId
   * @param {Object} result - See HorseSession.recordHand
   */
  recordHand(horseId, tableId, result) {
    const session = this.getSession(horseId, tableId);
    if (session) {
      session.recordHand(result);
      this._globalStats.totalHandsDealt++;
      if (result.rakePaid) this._globalStats.totalRakeCollected += result.rakePaid;
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // ANOMALY DETECTION (#10)
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Analyze an opponent's action timing for bot-like patterns.
   * @param {string} opponentId
   * @param {number} actionTimeMs - Time taken for the action
   */
  recordOpponentTiming(opponentId, actionTimeMs) {
    if (!this._opponentAnomalies.has(opponentId)) {
      this._opponentAnomalies.set(opponentId, {
        timings: [],
        flagCount: 0,
        lastFlagTime: 0,
      });
    }

    const tracker = this._opponentAnomalies.get(opponentId);
    tracker.timings.push(actionTimeMs);

    // Keep last 50 timings
    if (tracker.timings.length > 50) {
      tracker.timings = tracker.timings.slice(-50);
    }

    // Check for bot-like timing patterns (needs 20+ samples)
    if (tracker.timings.length >= 20) {
      const mean = tracker.timings.reduce((a, b) => a + b, 0) / tracker.timings.length;
      const variance = tracker.timings.reduce((sum, t) => sum + (t - mean) ** 2, 0) / tracker.timings.length;
      const stdDev = Math.sqrt(variance);
      const cv = mean > 0 ? stdDev / mean : 0; // Coefficient of variation

      // Bots tend to have very low timing variance (cv < 0.15)
      // Humans are inconsistent (cv typically 0.3-0.8)
      if (cv < 0.15 && cv > 0) {
        tracker.flagCount++;
        tracker.lastFlagTime = Date.now();
      }
    }

    // Clean up old opponent trackers (keep only active tables)
    if (this._opponentAnomalies.size > 500) {
      const oldest = [...this._opponentAnomalies.entries()]
        .sort((a, b) => (a[1].lastFlagTime || 0) - (b[1].lastFlagTime || 0))
        .slice(0, 100);
      for (const [id] of oldest) {
        this._opponentAnomalies.delete(id);
      }
    }
  }

  /**
   * Check if an opponent has been flagged as a potential bot.
   * @param {string} opponentId
   * @returns {{ flagged: boolean, flagCount: number, confidence: number }}
   */
  checkOpponentAnomaly(opponentId) {
    const tracker = this._opponentAnomalies.get(opponentId);
    if (!tracker) return { flagged: false, flagCount: 0, confidence: 0 };

    // Need multiple flags to be confident
    const flagged = tracker.flagCount >= 3;
    const confidence = Math.min(tracker.flagCount / 5, 1.0);

    return { flagged, flagCount: tracker.flagCount, confidence };
  }

  /**
   * Verify rake is within expected bounds for a hand.
   * @param {number} potSize
   * @param {number} rakeCharged
   * @param {number} rakePercent - Expected rake percentage (e.g., 5 for 5%)
   * @param {number} rakeCap - Maximum rake in chips
   * @returns {{ valid: boolean, expected: number, deviation: number }}
   */
  verifyRake(potSize, rakeCharged, rakePercent, rakeCap) {
    const expectedRake = Math.min(potSize * (rakePercent / 100), rakeCap);
    const deviation = Math.abs(rakeCharged - expectedRake);
    const deviationPercent = expectedRake > 0 ? (deviation / expectedRake) * 100 : 0;

    return {
      valid: deviationPercent <= RAKE_TOLERANCE_PERCENT,
      expected: +expectedRake.toFixed(2),
      actual: rakeCharged,
      deviation: +deviation.toFixed(2),
      deviationPercent: +deviationPercent.toFixed(1),
    };
  }

  // ═══════════════════════════════════════════════════════════════════
  // SESSION MANAGEMENT HELPERS (#7)
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Should a horse leave this table? Evaluates stop-loss, tilt, edge erosion.
   * @param {string} horseId
   * @param {string} tableId
   * @param {Object} [personality] - Horse personality config
   * @returns {{ shouldLeave: boolean, reason: string }}
   */
  shouldLeaveTable(horseId, tableId, personality = {}) {
    const session = this.getSession(horseId, tableId);
    if (!session) return { shouldLeave: false, reason: 'no_session' };

    const stats = session.getStats();
    const bb = session.bigBlind;

    // 1. Stop-loss: default 5 buy-ins (500 BB)
    const stopLossBB = personality.stopLossBB || 500;
    if (stats.totalBBDelta < -stopLossBB) {
      return { shouldLeave: true, reason: `stop_loss_hit: ${stats.totalBBDelta}bb < -${stopLossBB}bb` };
    }

    // 2. Session time limit: default 4 hours
    const maxSessionMin = personality.maxSessionMinutes || 240;
    if (stats.sessionDurationMin > maxSessionMin) {
      return { shouldLeave: true, reason: `session_time_limit: ${stats.sessionDurationMin}min > ${maxSessionMin}min` };
    }

    // 3. Win rate catastrophe: losing badly over 200+ hands
    if (stats.handsPlayed >= 200 && stats.rollingBBPer100 !== null && stats.rollingBBPer100 < -15) {
      return { shouldLeave: true, reason: `catastrophic_loss: ${stats.rollingBBPer100}bb/100 over ${stats.handsPlayed} hands` };
    }

    // 4. Table quality: if all opponents have left (< 3 players means no action)
    // This is checked externally by the pipeline; we just provide the data

    return { shouldLeave: false, reason: 'playing_well' };
  }

  /**
   * Score a table for horse placement (table selection quality).
   * Higher score = better table.
   * @param {string} tableId
   * @param {Array<string>} playerIds - Current players at the table
   * @param {Set<string>} horseIds - Known horse IDs (to exclude from fish count)
   * @returns {number} Score 0-100
   */
  scoreTable(tableId, playerIds, horseIds) {
    const humanPlayers = playerIds.filter(id => !horseIds.has(id));
    const horsePlayers = playerIds.filter(id => horseIds.has(id));

    // Fish-to-reg ratio (more humans = better)
    const fishRatio = playerIds.length > 0 ? humanPlayers.length / playerIds.length : 0;

    // Check if any humans are known weak players (from opponent journals)
    let weakPlayerBonus = 0;
    for (const opId of humanPlayers) {
      const anomaly = this.checkOpponentAnomaly(opId);
      if (!anomaly.flagged) weakPlayerBonus += 5; // Non-bot humans are good
    }

    // Score: 50% fish ratio + 30% player count + 20% weak player bonus
    const playerCountScore = Math.min(playerIds.length / 6, 1) * 30;
    const fishScore = fishRatio * 50;
    const weakScore = Math.min(weakPlayerBonus, 20);

    return Math.round(fishScore + playerCountScore + weakScore);
  }

  // ═══════════════════════════════════════════════════════════════════
  // REPORTING
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Get a summary of all active sessions.
   * @returns {Array<Object>} Session stats for all active horses
   */
  getActiveSessions() {
    return [...this._sessions.values()].map(s => s.getStats());
  }

  /**
   * Get all active sessions with identifiers (for shutdown cleanup).
   * @returns {Array<{horseId: string, tableId: string}>}
   */
  getAllSessions() {
    return [...this._sessions.entries()].map(([key]) => {
      const [horseId, tableId] = key.split(':');
      return { horseId, tableId };
    });
  }

  /**
   * Get completed session history.
   * @param {string} [horseId] - Filter by horse (optional)
   * @returns {Array<Object>}
   */
  getCompletedSessions(horseId = null) {
    if (horseId) {
      return this._completedSessions.filter(s => s.horseId === horseId);
    }
    return [...this._completedSessions];
  }

  /**
   * Get global stats across all horses.
   * @returns {Object}
   */
  getGlobalStats() {
    return {
      ...this._globalStats,
      activeSessions: this._sessions.size,
      completedSessions: this._completedSessions.length,
      trackedOpponents: this._opponentAnomalies.size,
    };
  }

  /**
   * Persist session analytics to Supabase.
   * @param {import('@supabase/supabase-js').SupabaseClient} supabase
   * @param {Object} stats - Session stats from getStats()
   */
  async persistSessionStats(supabase, stats) {
    if (!supabase || !stats) return;
    try {
      const { resilientMutation } = require('./SupabaseResilience');
      await resilientMutation(supabase, () =>
        supabase.from('horse_session_analytics').upsert({
          horse_id: stats.horseId,
          table_id: stats.tableId,
          variant: stats.variant,
          big_blind: stats.bigBlind,
          hands_played: stats.handsPlayed,
          bb_per_100: stats.bbPer100,
          total_bb_delta: stats.totalBBDelta,
          vpip: stats.vpip,
          pfr: stats.pfr,
          three_bet: stats.threeBet,
          aggression_factor: stats.aggressionFactor,
          wtsd: stats.wtsd,
          wsd: stats.wsd,
          session_duration_min: stats.sessionDurationMin,
          total_rake_paid: stats.totalRakePaid,
          win_rate_class: stats.winRateClass,
          // 2026-08-15 CHECK 13 fix: anomalies/ended_at are not columns (real
          // timestamp: recorded_at) — the upsert 42703'd, so horse session
          // analytics were never persisted. Anomalies remain in logs.
          recorded_at: new Date().toISOString(),
        }, { onConflict: 'horse_id,table_id' }),
        { label: 'persist_session_stats', idempotent: true }
      );
    } catch (err) {
      console.warn(`[PerformanceTracker] Failed to persist stats: ${err.message}`);
    }
  }

  /**
   * Reset all tracking (for testing).
   */
  reset() {
    this._sessions.clear();
    this._completedSessions = [];
    this._opponentAnomalies.clear();
    this._globalStats = {
      totalHandsDealt: 0,
      totalRakeCollected: 0,
      totalHorseSessions: 0,
    };
  }
}

// Singleton instance
const tracker = new PerformanceTracker();

// ═══════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════

module.exports = {
  PerformanceTracker,
  HorseSession,
  tracker, // Singleton for global access
  WINRATE_THRESHOLDS,
  ROLLING_WINDOW_HANDS,
  MIN_HANDS_FOR_STATS,
};
