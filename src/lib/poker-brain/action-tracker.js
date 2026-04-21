/**
 * Poker Brain -- Action Tracker
 * =============================
 * Detects opponent actions via pot/stack delta analysis across OCR ticks.
 *
 * Detection method (1Hz from OCR loop):
 *   - Track pot size + each villain stack between observations
 *   - When a villain stack DECREASES: they put money in (bet/call/raise)
 *   - Stack decrease amount vs pot increase → infer action type
 *   - When a villain stack goes from >0 to absent/NaN: probable fold
 *   - Noise filter: ignore changes smaller than tolerance * BB
 *
 * The tracker accumulates per-hand action sequences that feed into the
 * Horse Brain decision engine's numLimpers, lastRaiser, preflopAction.
 */

class ActionTracker {
  constructor(options = {}) {
    // Minimum change (in BB multiples) to count as a real action
    this.tolerance = options.tolerance || 0.4;
    this.reset();
  }

  /**
   * Reset for a new hand.
   */
  reset(handId = null) {
    this.handId = handId || null;
    this.prev = null;
    this.actions = [];          // chronological action list
    this.activeSeats = new Set(); // seats with non-zero stacks
    this.foldedSeats = new Set(); // seats confirmed folded
    this.numLimpers = 0;
    this.lastRaiser = null;
    this.lastRaiseAmount = 0;
    this.numCallers = 0;
    this.raiseCount = 0;        // total raises this hand (for 3bet/4bet)
    this.currentStreetBet = 0;  // current bet amount to call
  }

  /**
   * Feed a new OCR observation. Called at 1Hz from the OCR loop.
   *
   * @param {{ potSize: number, heroStack: number, villainStacks: Object,
   *           bigBlind: number, timestamp?: number, street?: string }} obs
   * @returns {{ newActions: Array, summary: Object }|null}
   */
  observe(obs) {
    if (!obs || typeof obs.potSize !== 'number') return null;

    const ts = obs.timestamp || Date.now();
    const bb = obs.bigBlind || 1;
    const tol = this.tolerance * bb;

    // First observation: just record baseline
    if (!this.prev) {
      this.prev = { ...obs, timestamp: ts };
      // Initialize active seats from non-null villain stacks
      if (obs.villainStacks) {
        for (const [seat, stack] of Object.entries(obs.villainStacks || {})) {
          if (typeof stack === 'number' && stack > 0) {
            this.activeSeats.add(seat);
          }
        }
      }
      return null;
    }

    const potDelta = obs.potSize - (this.prev.potSize || 0);
    const newActions = [];

    // Detect street change: pot increase without any stack decrease
    // means a new street opened (pot stays, no new money in from action)

    // Process each villain seat
    const prevStacks = this.prev.villainStacks || {};
    const currStacks = obs.villainStacks || {};

    for (const seat of new Set([...Object.keys(prevStacks || {}), ...Object.keys(currStacks || {})])) {
      if (this.foldedSeats.has(seat)) continue; // already folded

      const prevStack = prevStacks[seat];
      const currStack = currStacks[seat];

      // Skip if we don't have valid readings for both
      if (typeof prevStack !== 'number' || prevStack <= 0) {
        // New seat appeared — add to active
        if (typeof currStack === 'number' && currStack > 0) {
          this.activeSeats.add(seat);
        }
        continue;
      }

      // Seat disappeared: probable fold (stack went from visible to gone)
      if (typeof currStack !== 'number' || currStack <= 0) {
        // Only mark as fold if they were active and stack didn't just go
        // off-screen (give one tick grace period)
        if (this.activeSeats.has(seat)) {
          const action = { seat, type: 'fold', amount: 0, ts };
          newActions.push(action);
          this.actions.push(action);
          this.foldedSeats.add(seat);
          this.activeSeats.delete(seat);
        }
        continue;
      }

      const stackDelta = currStack - prevStack; // negative = money went in

      // No significant change — seat is idle this tick
      if (Math.abs(stackDelta) < tol) continue;

      // Stack decreased — player put money in
      if (stackDelta < -tol) {
        const putIn = Math.abs(stackDelta);

        let actionType;
        if (currStack < tol) {
          // Stack went to ~0 — all-in
          actionType = 'all_in';
        } else if (this.currentStreetBet <= tol) {
          // No existing bet — this is a bet (or first raise preflop = raise)
          actionType = 'bet';
        } else if (putIn > this.currentStreetBet + tol) {
          // Put in more than the current bet — raise
          actionType = 'raise';
        } else {
          // Put in ~= current bet — call
          actionType = 'call';
        }

        const action = { seat, type: actionType, amount: putIn, ts };
        newActions.push(action);
        this.actions.push(action);

        // Update tracking state
        if (actionType === 'bet' || actionType === 'raise' || actionType === 'all_in') {
          this.lastRaiser = seat;
          this.lastRaiseAmount = putIn;
          this.currentStreetBet = putIn;
          this.raiseCount++;
        } else if (actionType === 'call') {
          this.numCallers++;
          if (this.raiseCount === 0) {
            // Call without a raise = limp
            this.numLimpers++;
          }
        }
      }

      // Stack increased — unusual, could be winning a pot or reload
      // Ignore for action tracking purposes
    }

    this.prev = { ...obs, timestamp: ts };

    if (newActions.length === 0) return null;

    return { newActions, summary: this.getSummary() };
  }

  /**
   * Notify the tracker of a street change (flop, turn, river).
   * Resets per-street tracking (currentStreetBet, callers) but keeps
   * the overall hand context (foldedSeats, raiseCount, etc.).
   */
  onStreetChange(newStreet) {
    this.currentStreetBet = 0;
    this.numCallers = 0;
    // Don't reset numLimpers, raiseCount, foldedSeats — those are hand-level
  }

  /**
   * Get the current action summary for the decision bridge.
   */
  getSummary() {
    // Classify preflopAction from raiseCount
    let preflopAction = 'unopened';
    if (this.numLimpers > 0 && this.raiseCount === 0) preflopAction = 'limped';
    else if (this.raiseCount === 1) preflopAction = 'raised';
    else if (this.raiseCount === 2) preflopAction = '3bet';
    else if (this.raiseCount >= 3) preflopAction = '4bet';

    return {
      numLimpers: this.numLimpers,
      lastRaiser: this.lastRaiser,
      lastRaiseAmount: this.lastRaiseAmount,
      numCallers: this.numCallers,
      totalBetsFacing: this.currentStreetBet,
      preflopAction,
      raiseCount: this.raiseCount,
      actionSequence: [...this.actions],
      activePlayers: this.activeSeats.size,
      foldedPlayers: this.foldedSeats.size,
    };
  }
}

export { ActionTracker };
export default ActionTracker;
