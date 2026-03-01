/**
 * Smarter.Poker - Core Poker Engine
 * Module: PotCalculator
 * 
 * Manages pot creation, side pot calculation for all-in scenarios,
 * and pot distribution at showdown.
 * 
 * The side pot algorithm:
 * When players are all-in for different amounts, we create separate pots
 * that each player is eligible for. A player can only win from pots they
 * contributed to.
 * 
 * Example:
 *   Player A: all-in $50
 *   Player B: all-in $150
 *   Player C: calls $150
 *   
 *   Main Pot: $150 (3 x $50) - A, B, C eligible
 *   Side Pot 1: $200 (2 x $100) - B, C eligible
 */

// ============ POT CLASS ============

class Pot {
  /**
   * @param {number} amount - Chips in this pot
   * @param {Set<string|number>} eligible - Player IDs eligible to win this pot
   */
  constructor(amount = 0, eligible = new Set()) {
    this.amount = amount;
    this.eligible = new Set(eligible);
  }

  toJSON() {
    return {
      amount: this.amount,
      eligible: [...this.eligible],
    };
  }
}

// ============ POT CALCULATOR CLASS ============

class PotCalculator {
  constructor() {
    /** @type {Map<string|number, number>} Player ID -> total amount invested this hand */
    this._investments = new Map();
    
    /** @type {Map<string|number, boolean>} Player ID -> whether they've folded */
    this._folded = new Map();
    
    /** @type {Map<string|number, boolean>} Player ID -> whether they're all-in */
    this._allIn = new Map();
    
    /** @type {number} Total rake collected this hand */
    this._rake = 0;
  }

  /**
   * Record a player's bet/call/raise contribution.
   * @param {string|number} playerId
   * @param {number} amount - Amount added to pot in this action
   */
  addContribution(playerId, amount) {
    if (amount < 0) throw new Error('Contribution cannot be negative');
    const current = this._investments.get(playerId) || 0;
    this._investments.set(playerId, current + amount);
    
    // Initialize fold status if not set
    if (!this._folded.has(playerId)) {
      this._folded.set(playerId, false);
    }
  }

  /**
   * Record that a player has folded.
   * Their contributions remain in the pot but they're ineligible to win.
   * @param {string|number} playerId
   */
  markFolded(playerId) {
    this._folded.set(playerId, true);
  }

  /**
   * Record that a player is all-in.
   * @param {string|number} playerId
   */
  markAllIn(playerId) {
    this._allIn.set(playerId, true);
  }

  /**
   * Check if a player has folded.
   * @param {string|number} playerId
   * @returns {boolean}
   */
  hasFolded(playerId) {
    return this._folded.get(playerId) || false;
  }

  /**
   * Check if a player is all-in.
   * @param {string|number} playerId
   * @returns {boolean}
   */
  isAllIn(playerId) {
    return this._allIn.get(playerId) || false;
  }

  /**
   * Get a player's total investment this hand.
   * @param {string|number} playerId
   * @returns {number}
   */
  getInvestment(playerId) {
    return this._investments.get(playerId) || 0;
  }

  /**
   * Get total pot amount (sum of all investments).
   * @returns {number}
   */
  get totalPot() {
    let total = 0;
    for (const amount of this._investments.values()) {
      total += amount;
    }
    return total;
  }

  /**
   * Get all active (non-folded) player IDs.
   * @returns {Array<string|number>}
   */
  get activePlayers() {
    return [...this._investments.keys()].filter(id => !this._folded.get(id));
  }

  /**
   * Get the number of active players.
   * @returns {number}
   */
  get activePlayerCount() {
    return this.activePlayers.length;
  }

  /**
   * Calculate all pots (main + side pots) based on current investments.
   * Uses the "contribution sorting" algorithm.
   * 
   * @returns {Pot[]} Array of pots, main pot first
   */
  calculatePots() {
    // Get all players with their investments
    const players = [];
    for (const [playerId, amount] of this._investments) {
      players.push({ playerId, amount, folded: this._folded.get(playerId) || false });
    }
    
    // Sort by investment amount (ascending)
    const sortedInvestments = players
      .map(p => p.amount)
      .filter((v, i, a) => a.indexOf(v) === i) // Unique amounts
      .sort((a, b) => a - b);
    
    const pots = [];
    let previousLevel = 0;
    
    for (const level of sortedInvestments) {
      if (level <= previousLevel) continue;
      
      const increment = level - previousLevel;
      let potAmount = 0;
      const eligible = new Set();
      
      for (const player of players) {
        if (player.amount >= level) {
          potAmount += increment;
          // Only non-folded players are eligible
          if (!player.folded) {
            eligible.add(player.playerId);
          }
        }
      }
      
      if (potAmount > 0) {
        pots.push(new Pot(potAmount, eligible));
      }
      
      previousLevel = level;
    }
    
    // Merge pots with identical eligible sets (optimization)
    return this._mergePots(pots);
  }

  /**
   * Merge consecutive pots with identical eligible player sets.
   * @private
   * @param {Pot[]} pots
   * @returns {Pot[]}
   */
  _mergePots(pots) {
    if (pots.length <= 1) return pots;
    
    const merged = [pots[0]];
    
    for (let i = 1; i < pots.length; i++) {
      const prev = merged[merged.length - 1];
      const curr = pots[i];
      
      if (this._sameEligible(prev.eligible, curr.eligible)) {
        prev.amount += curr.amount;
      } else {
        merged.push(curr);
      }
    }
    
    return merged;
  }

  /**
   * Check if two eligible sets are identical.
   * @private
   */
  _sameEligible(a, b) {
    if (a.size !== b.size) return false;
    for (const id of a) {
      if (!b.has(id)) return false;
    }
    return true;
  }

  /**
   * Distribute pots to winners at showdown.
   * 
   * @param {Array<{ playerId: string|number, handScore: number }>} playerHands
   *   Players still in the hand with their evaluated hand scores.
   *   Higher score = better hand.
   * @param {Object} options
   * @param {number} options.rakePercent - Rake percentage (0-100), default 0
   * @param {number} options.rakeCap - Maximum rake per pot, default Infinity
   * @param {boolean} options.hiLo - If true, split between hi and lo winners
   * @param {Array<{ playerId: string|number, lowScore: number }>} options.lowHands - Low hand scores (lower = better)
   * @returns {{ payouts: Map<string|number, number>, pots: Array<{ pot: Pot, winners: Array, payout: number }>, rake: number }}
   */
  distribute(playerHands, options = {}) {
    const { rakePercent = 0, rakeCap = Infinity, hiLo = false, lowHands = [] } = options;
    
    const pots = this.calculatePots();
    const payouts = new Map();
    const potDetails = [];
    let totalRake = 0;
    
    for (const pot of pots) {
      // Find eligible players who are in the hand rankings
      const eligibleHands = playerHands.filter(ph => pot.eligible.has(ph.playerId));
      
      if (eligibleHands.length === 0) {
        // No eligible winner (shouldn't happen, but safety)
        // Return to the last remaining player
        const remaining = [...pot.eligible][0];
        if (remaining) {
          payouts.set(remaining, (payouts.get(remaining) || 0) + pot.amount);
        }
        continue;
      }
      
      // Calculate rake — cap is GLOBAL across all pots in the hand
      let rake = 0;
      if (rakePercent > 0 && pot.eligible.size > 1) {
        const uncappedRake = Math.floor(pot.amount * rakePercent / 100);
        const remainingCap = rakeCap === Infinity ? Infinity : Math.max(0, rakeCap - totalRake);
        rake = Math.min(uncappedRake, remainingCap);
        totalRake += rake;
      }
      
      const distributable = pot.amount - rake;
      
      if (hiLo && lowHands.length > 0) {
        // Hi-Lo: split pot between best high and best low
        this._distributeHiLo(distributable, eligibleHands, lowHands, pot, payouts, potDetails);
      } else {
        // Standard: all to high hand winner(s)
        this._distributeHigh(distributable, eligibleHands, pot, payouts, potDetails);
      }
    }
    
    this._rake = totalRake;
    
    return {
      payouts,
      pots: potDetails,
      rake: totalRake,
    };
  }

  /**
   * Distribute a pot to the best high hand(s).
   * @private
   */
  _distributeHigh(amount, eligibleHands, pot, payouts, potDetails) {
    // Find best hand score among eligible
    const bestScore = Math.max(...eligibleHands.map(h => h.handScore));
    const winners = eligibleHands.filter(h => h.handScore === bestScore);
    
    // Split evenly among winners
    const share = Math.floor(amount / winners.length);
    let remainder = amount - share * winners.length;
    
    for (const winner of winners) {
      let payout = share;
      if (remainder > 0) {
        payout += 1; // Odd chips go to first winner(s)
        remainder--;
      }
      payouts.set(winner.playerId, (payouts.get(winner.playerId) || 0) + payout);
    }
    
    potDetails.push({
      pot: pot.toJSON(),
      winners: winners.map(w => w.playerId),
      payout: amount,
    });
  }

  /**
   * Distribute a pot in Hi-Lo format (half to best high, half to best low).
   * If no qualifying low, full pot goes to high.
   * @private
   */
  _distributeHiLo(amount, eligibleHands, lowHands, pot, payouts, potDetails) {
    // Filter low hands to eligible players
    const eligibleLows = lowHands.filter(lh => pot.eligible.has(lh.playerId));
    
    if (eligibleLows.length === 0) {
      // No qualifying low - all to high
      this._distributeHigh(amount, eligibleHands, pot, payouts, potDetails);
      return;
    }
    
    // Split pot in half
    const hiHalf = Math.ceil(amount / 2);
    const loHalf = amount - hiHalf;
    
    // Distribute high half
    const bestHiScore = Math.max(...eligibleHands.map(h => h.handScore));
    const hiWinners = eligibleHands.filter(h => h.handScore === bestHiScore);
    const hiShare = Math.floor(hiHalf / hiWinners.length);
    let hiRemainder = hiHalf - hiShare * hiWinners.length;
    
    for (const winner of hiWinners) {
      let payout = hiShare;
      if (hiRemainder > 0) { payout++; hiRemainder--; }
      payouts.set(winner.playerId, (payouts.get(winner.playerId) || 0) + payout);
    }
    
    // Distribute low half (lowest score wins)
    const bestLoScore = Math.min(...eligibleLows.map(h => h.lowScore));
    const loWinners = eligibleLows.filter(h => h.lowScore === bestLoScore);
    const loShare = Math.floor(loHalf / loWinners.length);
    let loRemainder = loHalf - loShare * loWinners.length;
    
    for (const winner of loWinners) {
      let payout = loShare;
      if (loRemainder > 0) { payout++; loRemainder--; }
      payouts.set(winner.playerId, (payouts.get(winner.playerId) || 0) + payout);
    }
    
    potDetails.push({
      pot: pot.toJSON(),
      hiWinners: hiWinners.map(w => w.playerId),
      loWinners: loWinners.map(w => w.playerId),
      payout: amount,
    });
  }

  /**
   * Handle the case where all but one player has folded.
   * The remaining player wins the entire pot without showdown.
   * @param {string|number} winnerId
   * @param {Object} options
   * @param {number} options.rakePercent
   * @param {number} options.rakeCap
   * @returns {{ payouts: Map, rake: number }}
   */
  awardToLastPlayer(winnerId, options = {}) {
    const { rakePercent = 0, rakeCap = Infinity } = options;
    
    const total = this.totalPot;
    let rake = 0;
    
    // Some rooms don't rake if no flop was seen ("no flop, no drop")
    if (rakePercent > 0) {
      rake = Math.min(Math.floor(total * rakePercent / 100), rakeCap);
    }
    
    const payouts = new Map();
    payouts.set(winnerId, total - rake);
    
    this._rake = rake;
    
    return { payouts, rake };
  }

  /**
   * Reset for a new hand.
   */
  reset() {
    this._investments.clear();
    this._folded.clear();
    this._allIn.clear();
    this._rake = 0;
  }

  /**
   * Get the current state for serialization.
   * @returns {Object}
   */
  getState() {
    return {
      investments: Object.fromEntries(this._investments),
      folded: Object.fromEntries(this._folded),
      allIn: Object.fromEntries(this._allIn),
      totalPot: this.totalPot,
      pots: this.calculatePots().map(p => p.toJSON()),
      rake: this._rake,
    };
  }
}

// ============ EXPORTS ============

module.exports = {
  Pot,
  PotCalculator,
};
