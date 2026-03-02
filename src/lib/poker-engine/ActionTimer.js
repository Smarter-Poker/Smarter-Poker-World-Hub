/**
 * Smarter.Poker - Core Poker Engine
 * Module: ActionTimer
 * 
 * Server-authoritative turn timers with timebank support.
 * 
 * When a player's turn starts:
 *   1. Main timer starts (e.g., 30 seconds)
 *   2. If main timer expires, timebank kicks in (e.g., 30 more seconds)
 *   3. If timebank expires, auto-action (fold or check if possible)
 *   4. Each hand, timebank regenerates a portion
 * 
 * Broadcasts timer state to all clients for countdown display.
 */

// ============ CONSTANTS ============

const DEFAULT_TURN_TIME = 30;       // Seconds for main timer
const DEFAULT_TIMEBANK = 30;        // Seconds total timebank per player
const TIMEBANK_REGEN_PER_HAND = 5;  // Seconds regenerated each hand
const WARNING_THRESHOLD = 10;       // Broadcast warning at N seconds remaining
const DISCONNECT_TURN_TIME = 15;    // Reduced time for disconnected players

// ============ ACTION TIMER ============

class ActionTimer {
  /**
   * @param {Object} config
   * @param {number} [config.turnTime] - Seconds per turn (default 30)
   * @param {number} [config.timebank] - Total timebank seconds (default 30)
   * @param {number} [config.timebankRegenPerHand] - Timebank regen per hand
   * @param {number} [config.disconnectTurnTime] - Reduced turn time for DC'd players
   * @param {Function} config.onExpire - Called when timer fully expires: (playerId) => void
   * @param {Function} config.onTick - Called each second: (playerId, remaining, isTimebank) => void
   * @param {Function} [config.onWarning] - Called when reaching warning threshold
   */
  constructor(config) {
    this.turnTime = config.turnTime || DEFAULT_TURN_TIME;
    this.timebank = config.timebank || DEFAULT_TIMEBANK;
    this.timebankRegenPerHand = config.timebankRegenPerHand || TIMEBANK_REGEN_PER_HAND;
    this.disconnectTurnTime = config.disconnectTurnTime || DISCONNECT_TURN_TIME;
    
    this.onExpire = config.onExpire;
    this.onTick = config.onTick;
    this.onWarning = config.onWarning;
    
    /** @type {Map<string|number, number>} Player timebank balances */
    this._timebankBalances = new Map();
    
    // Current timer state
    this._currentPlayerId = null;
    this._mainTimer = null;
    this._tickInterval = null;
    this._startTime = null;
    this._totalAllowed = 0;
    this._isTimebank = false;
    this._warningFired = false;
    this._isDisconnected = false;
  }

  /**
   * Initialize timebank for a player.
   * @param {string|number} playerId
   * @param {number} [initialBalance] - Override initial timebank
   */
  initPlayer(playerId, initialBalance) {
    if (!this._timebankBalances.has(playerId)) {
      this._timebankBalances.set(playerId, initialBalance ?? this.timebank);
    }
  }

  /**
   * Regenerate timebank for all players (call between hands).
   */
  regenTimebanks() {
    for (const [playerId, balance] of this._timebankBalances) {
      const newBalance = Math.min(balance + this.timebankRegenPerHand, this.timebank);
      this._timebankBalances.set(playerId, newBalance);
    }
  }

  /**
   * Start the timer for a player's turn.
   * @param {string|number} playerId
   * @param {Object} [options]
   * @param {boolean} [options.disconnected] - Player is disconnected (shorter time)
   */
  startTurn(playerId, options = {}) {
    // Clear any existing timer
    this.cancelTurn();
    
    this._currentPlayerId = playerId;
    this._isDisconnected = options.disconnected || false;
    this._isTimebank = false;
    this._warningFired = false;
    
    const mainTime = this._isDisconnected ? this.disconnectTurnTime : this.turnTime;
    this._totalAllowed = mainTime;
    this._startTime = Date.now();
    
    // Initialize player timebank if needed
    this.initPlayer(playerId);
    
    // Start main timer
    this._mainTimer = setTimeout(() => {
      this._onMainExpire();
    }, mainTime * 1000);
    
    // Start tick interval (1 second)
    this._tickInterval = setInterval(() => {
      this._onTick();
    }, 1000);
  }

  /**
   * Cancel the current timer (player acted in time).
   */
  cancelTurn() {
    if (this._mainTimer) {
      clearTimeout(this._mainTimer);
      this._mainTimer = null;
    }
    if (this._tickInterval) {
      clearInterval(this._tickInterval);
      this._tickInterval = null;
    }
    this._currentPlayerId = null;
    this._startTime = null;
  }

  /**
   * Get remaining time for current player.
   * @returns {{ playerId: string|number|null, remaining: number, isTimebank: boolean, timebankBalance: number } | null}
   */
  getTimerState() {
    if (!this._currentPlayerId || !this._startTime) return null;
    
    const elapsed = (Date.now() - this._startTime) / 1000;
    const remaining = Math.max(0, this._totalAllowed - elapsed);
    
    return {
      playerId: this._currentPlayerId,
      remaining: Math.ceil(remaining),
      isTimebank: this._isTimebank,
      timebankBalance: this._timebankBalances.get(this._currentPlayerId) || 0,
    };
  }

  /**
   * Handle main timer expiration — transition to timebank.
   * @private
   */
  _onMainExpire() {
    const playerId = this._currentPlayerId;
    if (!playerId) return;
    
    const timebankBalance = this._timebankBalances.get(playerId) || 0;
    
    if (timebankBalance <= 0 || this._isDisconnected) {
      // No timebank or disconnected — expire immediately
      this._expire();
      return;
    }
    
    // Transition to timebank
    this._isTimebank = true;
    this._startTime = Date.now();
    this._totalAllowed = timebankBalance;
    this._warningFired = false;
    
    // Start timebank timer
    this._mainTimer = setTimeout(() => {
      // Deduct used timebank
      this._timebankBalances.set(playerId, 0);
      this._expire();
    }, timebankBalance * 1000);
  }

  /**
   * Tick handler — broadcast remaining time.
   * @private
   */
  _onTick() {
    if (!this._currentPlayerId || !this._startTime) return;
    
    const elapsed = (Date.now() - this._startTime) / 1000;
    const remaining = Math.max(0, this._totalAllowed - elapsed);
    
    if (this.onTick) {
      this.onTick(this._currentPlayerId, Math.ceil(remaining), this._isTimebank);
    }
    
    // Fire warning
    if (!this._warningFired && remaining <= WARNING_THRESHOLD && remaining > 0) {
      this._warningFired = true;
      if (this.onWarning) {
        this.onWarning(this._currentPlayerId, Math.ceil(remaining), this._isTimebank);
      }
    }
    
    if (remaining <= 0) {
      // Clean up tick interval (timer should handle expiry)
      clearInterval(this._tickInterval);
      this._tickInterval = null;
    }
  }

  /**
   * Handle full timer expiration — auto-fold.
   * @private
   */
  _expire() {
    const playerId = this._currentPlayerId;
    
    // Clean up
    if (this._tickInterval) {
      clearInterval(this._tickInterval);
      this._tickInterval = null;
    }
    this._mainTimer = null;
    this._currentPlayerId = null;
    this._startTime = null;
    
    // Callback to auto-fold/check
    if (this.onExpire && playerId) {
      this.onExpire(playerId);
    }
  }

  /**
   * Player acted — deduct timebank if they used it.
   * Call this BEFORE cancelTurn() so _isTimebank and _startTime are still set.
   * @param {string|number} playerId
   */
  recordAction(playerId) {
    if (this._isTimebank && this._startTime) {
      const used = (Date.now() - this._startTime) / 1000;
      const balance = this._timebankBalances.get(playerId) || 0;
      this._timebankBalances.set(playerId, Math.max(0, balance - used));
    }
  }

  /**
   * Remove a player's timebank tracking.
   * @param {string|number} playerId
   */
  removePlayer(playerId) {
    this._timebankBalances.delete(playerId);
    if (this._currentPlayerId === playerId) {
      this.cancelTurn();
    }
  }

  /**
   * Destroy all timers.
   */
  destroy() {
    this.cancelTurn();
    this._timebankBalances.clear();
  }
}

// ============ EXPORTS ============

module.exports = {
  ActionTimer,
  DEFAULT_TURN_TIME,
  DEFAULT_TIMEBANK,
};
