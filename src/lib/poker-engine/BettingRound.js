/**
 * Smarter.Poker - Core Poker Engine
 * Module: BettingRound
 * 
 * Manages a single betting round (preflop, flop, turn, or river).
 * Tracks who has acted, enforces action order, manages bet levels,
 * and determines when the round is complete.
 * 
 * A betting round is complete when:
 *   1. All active players have acted and bets are equal, OR
 *   2. All but one player has folded, OR
 *   3. All remaining players are all-in
 */

const { ACTION_TYPES, ActionValidator } = require('./ActionValidator');

// ============ BETTING ROUND STATE ============

const ROUND_STATUS = {
  WAITING: 'waiting',         // Round not started
  IN_PROGRESS: 'in_progress', // Actions being taken
  COMPLETE: 'complete',       // All actions resolved
};

// ============ BETTING ROUND CLASS ============

class BettingRound {
  /**
   * @param {Object} config
   * @param {Array<{ id: string|number, stack: number, position: number }>} config.players 
   *   Active players in seat order, with current stacks
   * @param {number} config.dealerPosition - Index in players array of the dealer button
   * @param {string} config.street - 'preflop', 'flop', 'turn', 'river'
   * @param {ActionValidator} config.validator - Action validator instance
   * @param {number} [config.forcedBets] - Amount already forced in (blinds/antes)
   */
  constructor(config) {
    this.street = config.street;
    this.validator = config.validator;
    this.status = ROUND_STATUS.WAITING;
    this.capAmount = config.capAmount || 0; // 0 = no cap
    
    // Player state
    this.players = config.players.map(p => ({
      id: p.id,
      stack: p.stack,
      position: p.position,
      invested: 0,     // Amount invested this round
      totalInvested: 0, // Amount invested this hand (carried from previous rounds)
      folded: false,
      allIn: false,
      hasActed: false,  // Has had a chance to act this round
    }));
    
    // Betting state
    this.currentBet = 0;          // Current bet level to call
    this.lastRaiseSize = config.validator.bigBlind; // Size of last raise
    this.numRaises = 0;           // Number of raises this round
    this.potTotal = 0;            // Running pot total (includes previous rounds)
    
    // Action tracking
    this.actionIndex = -1;        // Index of player whose turn it is
    this.lastAggressorIndex = -1; // Last player who bet/raised
    this.actions = [];            // Log of all actions this round
    
    // The sequence of player indices to act
    this._actionOrder = [];
  }

  /**
   * Initialize the round with blind/ante information.
   * @param {Object} options
   * @param {number} options.potFromPreviousRounds - Pot carried forward
   * @param {Array<{ playerId: string|number, amount: number, invested: number }>} [options.blinds] 
   *   Forced bets already posted (from blind posting)
   */
  start(options = {}) {
    this.potTotal = options.potFromPreviousRounds || 0;
    
    // Apply blind investments
    if (options.blinds) {
      for (const blind of options.blinds) {
        const player = this.players.find(p => p.id === blind.playerId);
        if (player) {
          player.invested = blind.amount;
          player.totalInvested = blind.invested || blind.amount;
          // NOTE: Do NOT deduct from stack — stacks passed to constructor
          // are already post-blind (deducted in GameStateMachine._postBlinds)
          if (player.stack <= 0) {
            player.allIn = true;
          }
          this.potTotal += blind.amount;
          if (blind.amount > this.currentBet) {
            this.currentBet = blind.amount;
          }
        }
      }
    }
    
    // Carry forward total investments from prior rounds
    if (options.playerTotalInvestments) {
      for (const [playerId, total] of Object.entries(options.playerTotalInvestments)) {
        const player = this.players.find(p => String(p.id) === String(playerId));
        if (player) {
          player.totalInvested = total;
        }
      }
    }
    
    // Build action order based on street and positions
    this._buildActionOrder();
    
    // Mark any player with 0 stack as all-in (e.g. went all-in on previous street)
    for (const player of this.players) {
      if (player.stack <= 0 && !player.folded) {
        player.allIn = true;
      }
    }
    
    // Set first player to act
    this.actionIndex = 0;
    this.status = ROUND_STATUS.IN_PROGRESS;
    
    // Skip players who are folded or all-in
    this._advanceToNextActive();
    
    // Check if round is already complete (e.g., everyone is all-in)
    if (this._isRoundComplete()) {
      this.status = ROUND_STATUS.COMPLETE;
    }
  }

  /**
   * Build the order of players to act.
   * Preflop: Start after big blind (UTG), end at big blind.
   * Postflop: Start at first active player after dealer, end at dealer.
   * @private
   */
  _buildActionOrder() {
    const active = this.players.filter(p => !p.folded && !p.allIn);
    
    if (this.street === 'preflop') {
      // Preflop: UTG acts first (seat after BB)
      // The players array should already be in position order
      // Action starts after the last forced bet (typically BB at index 1 for 3+ players)
      // We need to know where the blinds are
      
      // For preflop, the action order is already determined by position
      // Players with blinds act last (they've already committed chips)
      this._actionOrder = this.players
        .map((p, i) => i)
        .filter(i => !this.players[i].folded && !this.players[i].allIn);
    } else {
      // Postflop: First active player after dealer acts first
      this._actionOrder = this.players
        .map((p, i) => i)
        .filter(i => !this.players[i].folded && !this.players[i].allIn);
    }
  }

  /**
   * Get the current player to act.
   * @returns {{ id: string|number, stack: number, position: number } | null}
   */
  getCurrentPlayer() {
    if (this.status !== ROUND_STATUS.IN_PROGRESS) return null;
    if (this.actionIndex < 0 || this.actionIndex >= this._actionOrder.length) return null;
    
    const playerIdx = this._actionOrder[this.actionIndex];
    return this.players[playerIdx] || null;
  }

  /**
   * Get the current player's legal actions.
   * @returns {Array<Object>}
   */
  getLegalActions() {
    const player = this.getCurrentPlayer();
    if (!player) return [];
    
    // Calculate effective stack: reduced by cap if applicable
    let effectiveStack = player.stack;
    if (this.capAmount > 0) {
      const capRemaining = Math.max(0, this.capAmount - player.totalInvested - player.invested);
      effectiveStack = Math.min(player.stack, capRemaining);
      // If cap exhausted, player can only check or fold
      if (effectiveStack <= 0) {
        const actions = [{ type: 'fold' }];
        if (player.invested >= this.currentBet) {
          actions.unshift({ type: 'check' });
        }
        return actions;
      }
    }
    
    const actions = this.validator.getLegalActions({
      playerStack: effectiveStack,
      playerInvested: player.invested,
      currentBet: this.currentBet,
      lastRaiseSize: this.lastRaiseSize,
      potTotal: this.potTotal,
      street: this.street,
      numRaises: this.numRaises,
    });
    
    return actions;
  }

  /**
   * Process a player's action.
   * @param {string|number} playerId - Must match current player
   * @param {Object} action - { type: string, amount?: number }
   * @returns {{ success: boolean, error?: string, roundComplete: boolean, action: Object }}
   */
  processAction(playerId, action) {
    const currentPlayer = this.getCurrentPlayer();
    
    if (!currentPlayer) {
      return { success: false, error: 'No player to act', roundComplete: true };
    }
    
    if (String(currentPlayer.id) !== String(playerId)) {
      return { success: false, error: `Not ${playerId}'s turn. Current player: ${currentPlayer.id}`, roundComplete: false };
    }
    
    // Validate the action
    const validation = this.validator.validateAction(action, {
      playerStack: currentPlayer.stack,
      playerInvested: currentPlayer.invested,
      currentBet: this.currentBet,
      lastRaiseSize: this.lastRaiseSize,
      potTotal: this.potTotal,
      street: this.street,
      numRaises: this.numRaises,
    });
    
    if (!validation.valid) {
      return { success: false, error: validation.error, roundComplete: false };
    }
    
    const validatedAction = validation.action;
    
    // Apply the action
    const result = this._applyAction(currentPlayer, validatedAction);
    
    // Log the action
    this.actions.push({
      playerId: currentPlayer.id,
      action: validatedAction,
      timestamp: Date.now(),
      potAfter: this.potTotal,
      currentBetAfter: this.currentBet,
    });
    
    // Advance to next player
    currentPlayer.hasActed = true;
    this._advanceAction(validatedAction);
    
    // Check if round is complete
    const roundComplete = this._isRoundComplete();
    if (roundComplete) {
      this.status = ROUND_STATUS.COMPLETE;
    }
    
    return {
      success: true,
      action: validatedAction,
      roundComplete,
      potTotal: this.potTotal,
      currentBet: this.currentBet,
      warning: validation.warning,
    };
  }

  /**
   * Apply a validated action to the game state.
   * @private
   */
  _applyAction(player, action) {
    switch (action.type) {
      case ACTION_TYPES.FOLD:
        player.folded = true;
        break;
        
      case ACTION_TYPES.CHECK:
        // No state change
        break;
        
      case ACTION_TYPES.CALL: {
        const amount = action.amount;
        player.stack -= amount;
        player.invested += amount;
        player.totalInvested += amount;
        this.potTotal += amount;
        
        if (player.stack <= 0) {
          player.allIn = true;
        }
        break;
      }
        
      case ACTION_TYPES.BET:
      case ACTION_TYPES.RAISE: {
        const amount = action.amount; // Chips to add
        player.stack -= amount;
        player.invested += amount;
        player.totalInvested += amount;
        this.potTotal += amount;
        
        // Update raise tracking
        const newBetLevel = action.totalBet;
        this.lastRaiseSize = action.raiseSize || (newBetLevel - this.currentBet);
        this.currentBet = newBetLevel;
        this.numRaises++;
        this.lastAggressorIndex = this._actionOrder[this.actionIndex];
        
        if (player.stack <= 0) {
          player.allIn = true;
        }
        break;
      }
        
      case ACTION_TYPES.ALL_IN: {
        const amount = action.amount;
        player.stack -= amount;
        player.invested += amount;
        player.totalInvested += amount;
        this.potTotal += amount;
        player.allIn = true;
        
        // Check if this all-in constitutes a raise
        const newTotal = player.invested;
        if (newTotal > this.currentBet) {
          const raiseAmount = newTotal - this.currentBet;
          if (raiseAmount >= this.lastRaiseSize || action.reopensAction) {
            // Full raise - reopens action
            this.lastRaiseSize = raiseAmount;
            this.numRaises++;
            this.lastAggressorIndex = this._actionOrder[this.actionIndex];
          }
          this.currentBet = newTotal;
        }
        break;
      }
    }
  }

  /**
   * Advance to the next player to act.
   * @private
   */
  _advanceAction(lastAction) {
    // After a raise/bet, everyone else needs to act again
    if (lastAction.type === ACTION_TYPES.BET || 
        lastAction.type === ACTION_TYPES.RAISE ||
        (lastAction.type === ACTION_TYPES.ALL_IN && lastAction.reopensAction)) {
      // Reset hasActed for everyone except the raiser
      for (let i = 0; i < this.players.length; i++) {
        if (i !== this._actionOrder[this.actionIndex] && !this.players[i].folded && !this.players[i].allIn) {
          this.players[i].hasActed = false;
        }
      }
    }
    
    this.actionIndex++;
    this._advanceToNextActive();
  }

  /**
   * Skip to the next player who can act (not folded, not all-in, hasn't completed action).
   * Wraps around the action order.
   * @private
   */
  _advanceToNextActive() {
    const totalPlayers = this._actionOrder.length;
    let attempts = 0;
    
    while (attempts < totalPlayers * 2) {
      // Wrap around
      if (this.actionIndex >= this._actionOrder.length) {
        this.actionIndex = 0;
      }
      
      const playerIdx = this._actionOrder[this.actionIndex];
      const player = this.players[playerIdx];
      
      // A player needs to act if:
      // - Not folded, not all-in, AND
      // - Either hasn't acted yet, OR invested less than current bet
      //   (covers undersized all-in: action not reopened for re-raising,
      //    but player still needs to call the difference or fold)
      if (!player.folded && !player.allIn && 
          (!player.hasActed || player.invested < this.currentBet)) {
        return; // Found next active player
      }
      
      this.actionIndex++;
      attempts++;
    }
    
    // No active player found - round is complete
    this.actionIndex = -1;
  }

  /**
   * Check if the betting round is complete.
   * @private
   * @returns {boolean}
   */
  _isRoundComplete() {
    const activePlayers = this.players.filter(p => !p.folded);
    
    // Only one player left (everyone else folded)
    if (activePlayers.length <= 1) return true;
    
    // All active players are all-in
    const nonAllIn = activePlayers.filter(p => !p.allIn);
    if (nonAllIn.length <= 1) {
      // If one player remains and has matched the bet AND has acted, done
      if (nonAllIn.length === 0) return true;
      if (nonAllIn[0].invested >= this.currentBet && nonAllIn[0].hasActed) return true;
    }
    
    // All active non-all-in players have acted and bets are equal
    const needsAction = activePlayers.filter(p => 
      !p.allIn && (!p.hasActed || p.invested < this.currentBet)
    );
    
    return needsAction.length === 0;
  }

  /**
   * Get the invested amounts per player for pot calculation.
   * @returns {Map<string|number, number>}
   */
  getInvestments() {
    const investments = new Map();
    for (const player of this.players) {
      if (player.invested > 0) {
        investments.set(player.id, player.invested);
      }
    }
    return investments;
  }

  /**
   * Get players still in the hand (not folded).
   * @returns {Array}
   */
  getActivePlayers() {
    return this.players.filter(p => !p.folded);
  }

  /**
   * Get players who can still take actions (not folded, not all-in).
   * @returns {Array}
   */
  getActionablePlayers() {
    return this.players.filter(p => !p.folded && !p.allIn);
  }

  /**
   * Check if only one player remains (everyone else folded).
   * @returns {boolean}
   */
  isHandOver() {
    return this.players.filter(p => !p.folded).length <= 1;
  }

  /**
   * Get the last standing player if everyone else folded.
   * @returns {Object|null}
   */
  getLastStanding() {
    const active = this.players.filter(p => !p.folded);
    return active.length === 1 ? active[0] : null;
  }

  /**
   * Get current state for serialization/broadcasting.
   * @returns {Object}
   */
  getState() {
    return {
      street: this.street,
      status: this.status,
      currentBet: this.currentBet,
      potTotal: this.potTotal,
      numRaises: this.numRaises,
      currentPlayerId: this.getCurrentPlayer()?.id || null,
      players: this.players.map(p => ({
        id: p.id,
        stack: p.stack,
        invested: p.invested,
        totalInvested: p.totalInvested,
        folded: p.folded,
        allIn: p.allIn,
        hasActed: p.hasActed,
      })),
      actions: this.actions,
    };
  }
}

// ============ EXPORTS ============

module.exports = {
  ROUND_STATUS,
  BettingRound,
};
