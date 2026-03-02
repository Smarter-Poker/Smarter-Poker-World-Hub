/**
 * Smarter.Poker - Core Poker Engine
 * Module: ActionValidator
 * 
 * Determines what actions are legal for the current player
 * based on the current game state and betting structure.
 * 
 * Betting Structures:
 *   - No Limit (NL): Min raise = previous raise size, max = player's stack
 *   - Pot Limit (PL): Min raise = previous raise size, max = current pot + call amount
 *   - Fixed Limit (FL): Bet/raise = fixed amount (big bet on turn/river)
 * 
 * Actions:
 *   - FOLD: Surrender hand
 *   - CHECK: Pass action (only when no bet to call)
 *   - CALL: Match the current bet
 *   - BET: Open betting (when no current bet)
 *   - RAISE: Increase the current bet
 *   - ALL_IN: Put all remaining chips in
 */

// ============ CONSTANTS ============

const ACTION_TYPES = {
  FOLD: 'fold',
  CHECK: 'check',
  CALL: 'call',
  BET: 'bet',
  RAISE: 'raise',
  ALL_IN: 'all_in',
};

const BETTING_STRUCTURES = {
  NO_LIMIT: 'no_limit',
  POT_LIMIT: 'pot_limit',
  FIXED_LIMIT: 'fixed_limit',
};

// ============ ACTION VALIDATOR CLASS ============

class ActionValidator {
  /**
   * @param {Object} config
   * @param {string} config.bettingStructure - 'no_limit', 'pot_limit', or 'fixed_limit'
   * @param {number} config.bigBlind - Big blind amount
   * @param {number} config.smallBlind - Small blind amount
   * @param {number} [config.ante] - Ante amount (optional)
   * @param {boolean} [config.allowStraddle] - Allow straddle bets
   */
  constructor(config) {
    this.bettingStructure = config.bettingStructure || BETTING_STRUCTURES.NO_LIMIT;
    this.bigBlind = config.bigBlind;
    this.smallBlind = config.smallBlind;
    this.ante = config.ante || 0;
    this.allowStraddle = config.allowStraddle || false;
  }

  /**
   * Get all legal actions for the current player.
   * 
   * @param {Object} state - Current betting round state
   * @param {number} state.playerStack - Current player's chip stack
   * @param {number} state.playerInvested - Amount player has already put in this round
   * @param {number} state.currentBet - Current highest bet in this round
   * @param {number} state.lastRaiseSize - Size of the last raise (for min-raise calculation)
   * @param {number} state.potTotal - Total pot before this action
   * @param {string} state.street - Current street ('preflop', 'flop', 'turn', 'river')
   * @param {number} state.numRaises - Number of raises this round (for fixed limit cap)
   * @param {number} [state.maxRaises] - Max raises per round (fixed limit, usually 3-4)
   * @returns {Array<{ type: string, minAmount?: number, maxAmount?: number, callAmount?: number }>}
   */
  getLegalActions(state) {
    const {
      playerStack,
      playerInvested = 0,
      currentBet = 0,
      lastRaiseSize = this.bigBlind,
      potTotal = 0,
      street = 'preflop',
      numRaises = 0,
      maxRaises = 4,
    } = state;

    const actions = [];
    const toCall = currentBet - playerInvested;
    
    // Player can always fold (unless they can check)
    // FOLD
    if (toCall > 0) {
      actions.push({ type: ACTION_TYPES.FOLD });
    }
    
    // CHECK - Only when there's no bet to call
    if (toCall <= 0) {
      actions.push({ type: ACTION_TYPES.CHECK });
      // Can also fold when can check (sometimes players want to fold to avoid showing)
      // But typically fold is hidden when check is available
    }
    
    // CALL - When there's a bet to match
    if (toCall > 0) {
      if (playerStack <= toCall) {
        // Player can't afford the full call - all-in
        actions.push({
          type: ACTION_TYPES.ALL_IN,
          amount: playerStack,
          isShortCall: true,
        });
      } else {
        actions.push({
          type: ACTION_TYPES.CALL,
          amount: toCall,
          totalBet: currentBet,
        });
      }
    }
    
    // BET/RAISE - Only if player has chips beyond the call amount
    if (playerStack > toCall) {
      const raiseActions = this._getRaiseActions(state);
      if (raiseActions) {
        actions.push(raiseActions);
      }
    }
    
    // ALL-IN (as a raise) - Always available if player has chips
    // This is separate from the all-in call above
    if (playerStack > toCall && playerStack > 0) {
      const allInAmount = playerStack + playerInvested;
      // Only add if it's larger than the minimum raise (otherwise it's already covered)
      const raiseActions = this._getRaiseActions(state);
      if (!raiseActions || allInAmount > (raiseActions.maxAmount || 0) || playerStack <= (raiseActions.minRaiseAmount || this.bigBlind)) {
        // If going all-in for less than min raise, it's still legal but doesn't reopen action
        if (!actions.some(a => a.type === ACTION_TYPES.ALL_IN)) {
          actions.push({
            type: ACTION_TYPES.ALL_IN,
            amount: playerStack,
            totalBet: playerStack + playerInvested,
            reopensAction: (playerStack + playerInvested) >= (currentBet + lastRaiseSize),
          });
        }
      }
    }
    
    return actions;
  }

  /**
   * Calculate raise/bet parameters based on betting structure.
   * @private
   * @param {Object} state
   * @returns {Object|null} Raise action parameters, or null if raising not allowed
   */
  _getRaiseActions(state) {
    const {
      playerStack,
      playerInvested = 0,
      currentBet = 0,
      lastRaiseSize = this.bigBlind,
      potTotal = 0,
      street = 'preflop',
      numRaises = 0,
      maxRaises = 4,
    } = state;

    const toCall = Math.max(0, currentBet - playerInvested);
    const chipsAfterCall = playerStack - toCall;
    
    if (chipsAfterCall <= 0) return null; // Can't raise if calling takes all chips
    
    const isOpening = currentBet === 0; // No bet yet (opening bet, not a raise)
    const actionType = isOpening ? ACTION_TYPES.BET : ACTION_TYPES.RAISE;
    
    let minRaise, maxRaise;
    
    switch (this.bettingStructure) {
      case BETTING_STRUCTURES.NO_LIMIT:
        // Min raise: Must raise by at least the last raise size (or big blind for first action)
        minRaise = isOpening ? this.bigBlind : Math.max(lastRaiseSize, this.bigBlind);
        // Max raise: All remaining chips
        maxRaise = chipsAfterCall;
        break;
        
      case BETTING_STRUCTURES.POT_LIMIT:
        // Min raise: Same as NL
        minRaise = isOpening ? this.bigBlind : Math.max(lastRaiseSize, this.bigBlind);
        // Max raise: Pot-sized raise
        // Pot = current pot + all bets on table + call amount, then you can raise up to that
        maxRaise = this._calculatePotSizeRaise(potTotal, currentBet, toCall);
        maxRaise = Math.min(maxRaise, chipsAfterCall);
        break;
        
      case BETTING_STRUCTURES.FIXED_LIMIT:
        // Check raise cap
        if (numRaises >= maxRaises) return null;
        
        // Fixed raise amount depends on street
        const betSize = (street === 'turn' || street === 'river') 
          ? this.bigBlind * 2  // Big bet on turn/river
          : this.bigBlind;     // Small bet on preflop/flop
        
        minRaise = betSize;
        maxRaise = betSize; // Fixed - no sizing choice
        break;
        
      default:
        throw new Error(`Unknown betting structure: ${this.bettingStructure}`);
    }
    
    // If minimum raise exceeds remaining chips, can still go all-in
    if (minRaise > chipsAfterCall) {
      return null; // All-in is handled separately
    }
    
    return {
      type: actionType,
      minAmount: currentBet + minRaise,    // Total bet amount (min)
      maxAmount: currentBet + maxRaise,    // Total bet amount (max)
      minRaiseAmount: minRaise,            // Raise increment (min)
      maxRaiseAmount: maxRaise,            // Raise increment (max)
      callAmount: toCall,
    };
  }

  /**
   * Calculate pot-size raise for Pot Limit games.
   * Formula: raise = pot + all bets + call + call = pot + 2*call + currentBets
   * Or simply: the maximum raise is the size of the pot after calling.
   * @private
   */
  _calculatePotSizeRaise(potTotal, currentBet, toCall) {
    // Pot-size raise: after calling, the pot is potTotal + toCall.
    // You can raise by that amount (the pot after your call).
    // So raise increment = potTotal + toCall
    return potTotal + toCall;
  }

  /**
   * Validate a specific player action.
   * @param {Object} action - The action to validate
   * @param {string} action.type - Action type
   * @param {number} [action.amount] - Bet/raise amount (total, not increment)
   * @param {Object} state - Current game state (same as getLegalActions)
   * @returns {{ valid: boolean, error?: string, action?: Object }}
   */
  validateAction(action, state) {
    const legalActions = this.getLegalActions(state);
    
    // Check if action type is legal
    const matchingLegal = legalActions.filter(a => a.type === action.type);
    
    if (matchingLegal.length === 0) {
      // Check if fold when can check (convert to check)
      if (action.type === ACTION_TYPES.FOLD) {
        const canCheck = legalActions.some(a => a.type === ACTION_TYPES.CHECK);
        if (canCheck) {
          return {
            valid: true,
            action: { type: ACTION_TYPES.CHECK },
            warning: 'Converted fold to check (no bet to call)',
          };
        }
      }
      
      return {
        valid: false,
        error: `Action "${action.type}" is not legal. Legal actions: ${legalActions.map(a => a.type).join(', ')}`,
      };
    }
    
    // For fold and check, no amount needed
    if (action.type === ACTION_TYPES.FOLD || action.type === ACTION_TYPES.CHECK) {
      return { valid: true, action: { type: action.type } };
    }
    
    // For call, amount is fixed
    if (action.type === ACTION_TYPES.CALL) {
      const callAction = matchingLegal[0];
      return {
        valid: true,
        action: { type: ACTION_TYPES.CALL, amount: callAction.amount },
      };
    }
    
    // For all-in, amount is fixed (all remaining chips)
    if (action.type === ACTION_TYPES.ALL_IN) {
      const allInAction = matchingLegal[0];
      return {
        valid: true,
        action: { type: ACTION_TYPES.ALL_IN, amount: allInAction.amount || state.playerStack },
      };
    }
    
    // For bet/raise, validate the amount
    if (action.type === ACTION_TYPES.BET || action.type === ACTION_TYPES.RAISE) {
      const raiseAction = matchingLegal[0];
      
      if (!action.amount && action.amount !== 0) {
        return { valid: false, error: 'Bet/raise requires an amount' };
      }
      
      // Amount should be the total bet (not the increment)
      const totalBet = action.amount;
      
      if (totalBet < raiseAction.minAmount) {
        // If the player can't meet the minimum but has enough to go all-in
        if (totalBet === state.playerStack + (state.playerInvested || 0)) {
          return {
            valid: true,
            action: { type: ACTION_TYPES.ALL_IN, amount: state.playerStack },
          };
        }
        return {
          valid: false,
          error: `Minimum ${action.type} is ${raiseAction.minAmount}, got ${totalBet}`,
        };
      }
      
      if (totalBet > raiseAction.maxAmount) {
        return {
          valid: false,
          error: `Maximum ${action.type} is ${raiseAction.maxAmount}, got ${totalBet}`,
        };
      }
      
      // Calculate the actual chip amount the player needs to put in
      const chipsNeeded = totalBet - (state.playerInvested || 0);
      
      if (chipsNeeded > state.playerStack) {
        return {
          valid: false,
          error: `Player only has ${state.playerStack} chips but needs ${chipsNeeded}`,
        };
      }
      
      return {
        valid: true,
        action: {
          type: action.type,
          amount: chipsNeeded,      // Chips to add to pot
          totalBet,                 // Total bet level
          raiseSize: totalBet - (state.currentBet || 0), // Raise increment
        },
      };
    }
    
    return { valid: false, error: `Unknown action type: ${action.type}` };
  }

  /**
   * Calculate common bet size presets for UI display.
   * @param {Object} state - Current game state
   * @returns {Array<{ label: string, amount: number, totalBet: number }>}
   */
  getBetPresets(state) {
    if (this.bettingStructure === BETTING_STRUCTURES.FIXED_LIMIT) {
      return []; // No sizing choice in fixed limit
    }
    
    const legalActions = this.getLegalActions(state);
    const raiseAction = legalActions.find(a => 
      a.type === ACTION_TYPES.BET || a.type === ACTION_TYPES.RAISE
    );
    
    if (!raiseAction) return [];
    
    const { potTotal = 0, currentBet = 0, playerInvested = 0, playerStack } = state;
    const toCall = Math.max(0, currentBet - playerInvested);
    const effectivePot = potTotal + toCall;
    
    const presets = [];
    
    if (currentBet === 0) {
      // Opening bet presets
      const sizes = [
        { label: '1/3 Pot', multiplier: 1/3 },
        { label: '1/2 Pot', multiplier: 1/2 },
        { label: '2/3 Pot', multiplier: 2/3 },
        { label: 'Pot', multiplier: 1 },
      ];
      
      for (const { label, multiplier } of sizes) {
        const amount = Math.max(Math.round(effectivePot * multiplier), this.bigBlind);
        if (amount >= raiseAction.minAmount && amount <= raiseAction.maxAmount) {
          presets.push({ label, amount, totalBet: amount });
        }
      }
    } else {
      // Raise presets
      const sizes = [
        { label: 'Min Raise', amount: raiseAction.minAmount },
        { label: '2.5x', amount: Math.round(currentBet * 2.5) },
        { label: '3x', amount: currentBet * 3 },
        { label: 'Pot', amount: Math.round(potTotal + currentBet * 2 + toCall) },
      ];
      
      for (const { label, amount } of sizes) {
        if (amount >= raiseAction.minAmount && amount <= raiseAction.maxAmount) {
          presets.push({ label, amount, totalBet: amount });
        }
      }
    }
    
    // Always add All-In
    presets.push({
      label: 'All-In',
      amount: playerStack + playerInvested,
      totalBet: playerStack + playerInvested,
    });
    
    return presets;
  }
}

// ============ EXPORTS ============

module.exports = {
  ACTION_TYPES,
  BETTING_STRUCTURES,
  ActionValidator,
};
