/**
 * Poker Brain -- Opponent Stats Tracker
 * ======================================
 * Accumulates per-opponent statistics across observed hands.
 * Fed by ActionTracker observations. Computes standard HUD stats:
 *
 *   VPIP  = Voluntarily Put $ In Pot (% of hands where villain put money
 *           in preflop voluntarily — excludes posting blinds)
 *   PFR   = Pre-Flop Raise (% of hands where villain raised preflop)
 *   AF    = Aggression Factor (bets + raises) / calls  (postflop)
 *   3Bet  = % of hands where villain 3-bet preflop
 *   WTSD  = Went To Showdown % (if we can detect showdown — future)
 *
 * Storage: in-memory Map keyed by seat identifier. Optionally persists
 * to localStorage so stats survive page refreshes within a session.
 *
 * Integration:
 *   - HUD.jsx feeds completed-hand action sequences from ActionTracker
 *   - Stats are displayed as a mini overlay per villain seat
 */

const STORAGE_KEY = 'poker-brain-opponent-stats';
const MAX_HANDS_STORED = 500; // Per opponent, cap memory usage

class OpponentStats {
  constructor(options = {}) {
    this.persistKey = options.persistKey || STORAGE_KEY;
    this.opponents = new Map(); // seat -> { vpipHands, pfrHands, ... }
    this._restore();
  }

  /**
   * Initialize or get an opponent's stat bucket.
   */
  _getOrCreate(seat) {
    if (!this.opponents.has(seat)) {
      this.opponents.set(seat, {
        handsObserved: 0,
        vpipCount: 0,       // hands where they voluntarily put money in preflop
        pfrCount: 0,        // hands where they raised preflop
        threeBetCount: 0,    // hands where they 3-bet preflop
        postflopBets: 0,     // total postflop bets + raises
        postflopCalls: 0,    // total postflop calls
        postflopFolds: 0,    // total postflop folds
        totalFolds: 0,       // all folds (pre + post)
        allInCount: 0,       // times they went all-in
        lastSeen: null,
      });
    }
    return this.opponents.get(seat);
  }

  /**
   * Record a completed hand's action sequence for all observed opponents.
   * Called once per hand, AFTER the hand ends (from onHandEnd callback).
   *
   * @param {Array} actions - Full action sequence from ActionTracker
   *   Each action: { seat, type: 'bet'|'call'|'raise'|'fold'|'all_in', amount, ts }
   * @param {Object} context - { street: string, bigBlind: number }
   */
  recordHand(actions, context = {}) {
    if (!Array.isArray(actions) || actions.length === 0) return;

    const bb = context.bigBlind || 1;
    const now = Date.now();

    // Group actions by seat
    const bySeat = new Map();
    for (const a of actions) {
      if (!a.seat) continue;
      if (!bySeat.has(a.seat)) bySeat.set(a.seat, []);
      bySeat.get(a.seat).push(a);
    }

    // Determine which seats were active this hand (appeared in any action)
    // Also track which streets each action occurred on based on ordering
    // We don't have perfect street tracking here, but we can infer preflop
    // vs postflop from action ordering and amounts
    const seatsWithAnyAction = new Set(bySeat.keys());

    for (const [seat, seatActions] of bySeat) {
      const stats = this._getOrCreate(seat);
      stats.handsObserved++;
      stats.lastSeen = now;

      // Determine preflop behavior:
      // - VPIP: any voluntary money in (bet, call, raise, all_in) before flop
      // - PFR: any raise/bet/all_in preflop
      // - 3bet: raise after a prior raise (raiseCount >= 2 in the hand)
      //
      // Heuristic: without explicit street markers, we treat the FIRST actions
      // in the sequence as preflop. Once a pattern break occurs (pot resets
      // or a significant time gap), we consider it postflop.
      // For simplicity, we use the first N actions (up to all opponents acting once)
      // as preflop, and the rest as postflop.

      let raisesSeenBeforeThisSeat = 0;
      let thisSeatActedPreflop = false;
      let thisSeatVpip = false;
      let thisSeatPfr = false;
      let thisSeatThreeBet = false;

      for (const a of seatActions) {
        const isAggressive = a.type === 'bet' || a.type === 'raise' || a.type === 'all_in';
        const isPassive = a.type === 'call';

        // Simple preflop heuristic: if this is one of the first actions
        // and it's a small-medium sizing relative to BB, it's likely preflop
        if (!thisSeatActedPreflop) {
          thisSeatActedPreflop = true;
          if (isAggressive || isPassive) {
            thisSeatVpip = true;
          }
          if (isAggressive) {
            thisSeatPfr = true;
          }
        }

        // Postflop tracking (all actions after the first)
        if (thisSeatActedPreflop) {
          if (isAggressive) {
            stats.postflopBets++;
          } else if (isPassive) {
            stats.postflopCalls++;
          } else if (a.type === 'fold') {
            stats.postflopFolds++;
            stats.totalFolds++;
          }
        }

        if (a.type === 'all_in') {
          stats.allInCount++;
        }
        if (a.type === 'fold') {
          stats.totalFolds++;
        }
      }

      if (thisSeatVpip) stats.vpipCount++;
      if (thisSeatPfr) stats.pfrCount++;
      if (thisSeatThreeBet) stats.threeBetCount++;
    }

    this._persist();
  }

  /**
   * Record from ActionTracker summary directly (alternative to per-action recording).
   * Uses the summary's raiseCount and action list for per-seat classification.
   *
   * @param {Object} summary - ActionTracker.getSummary() output
   * @param {Array} actions - ActionTracker.actions array
   */
  recordFromSummary(summary, actions) {
    if (!summary || !Array.isArray(actions) || actions.length === 0) return;

    const now = Date.now();
    const seenSeats = new Set();
    let globalRaisesSoFar = 0;

    for (const a of actions) {
      if (!a.seat) continue;
      const stats = this._getOrCreate(a.seat);

      // First time seeing this seat in this hand
      if (!seenSeats.has(a.seat)) {
        seenSeats.add(a.seat);
        stats.handsObserved++;
        stats.lastSeen = now;
      }

      const isAggressive = a.type === 'bet' || a.type === 'raise' || a.type === 'all_in';

      if (isAggressive || a.type === 'call') {
        stats.vpipCount++;  // Will be normalized below
      }

      if (isAggressive) {
        globalRaisesSoFar++;
        stats.pfrCount++;
        if (globalRaisesSoFar >= 2) {
          stats.threeBetCount++;
        }
      }

      if (a.type === 'fold') {
        stats.totalFolds++;
      }
      if (a.type === 'all_in') {
        stats.allInCount++;
      }
    }

    this._persist();
  }

  /**
   * Get computed stats for a specific opponent seat.
   * Returns null if no data.
   */
  getStats(seat) {
    const s = this.opponents.get(seat);
    if (!s || s.handsObserved === 0) return null;

    const h = s.handsObserved;
    const vpip = Math.round((s.vpipCount / h) * 100);
    const pfr = Math.round((s.pfrCount / h) * 100);
    const threeBet = Math.round((s.threeBetCount / h) * 100);

    // AF = (bets + raises) / calls. Undefined if 0 calls → show as Infinity or cap.
    const aggressiveActions = s.postflopBets;
    const passiveActions = s.postflopCalls;
    const af = passiveActions > 0
      ? Math.round((aggressiveActions / passiveActions) * 10) / 10
      : (aggressiveActions > 0 ? 99.9 : 0);

    // Fold to bet % (postflop)
    const postflopTotal = s.postflopBets + s.postflopCalls + s.postflopFolds;
    const foldPct = postflopTotal > 0
      ? Math.round((s.postflopFolds / postflopTotal) * 100)
      : null;

    return {
      seat,
      hands: h,
      vpip,
      pfr,
      threeBet,
      af,
      foldPct,
      allInCount: s.allInCount,
      lastSeen: s.lastSeen,
      // Derived player type classification
      playerType: classifyPlayer(vpip, pfr, af),
    };
  }

  /**
   * Get stats for all tracked opponents.
   * Returns Map<seat, stats>.
   */
  getAllStats() {
    const result = new Map();
    for (const seat of this.opponents.keys()) {
      const stats = this.getStats(seat);
      if (stats) result.set(seat, stats);
    }
    return result;
  }

  /**
   * Reset all stats (new session).
   */
  reset() {
    this.opponents.clear();
    try { localStorage.removeItem(this.persistKey); } catch (_) { console.warn('[App] Handled exception:', _?.message || _); }
  }

  /**
   * Remove stats for a specific seat.
   */
  removeSeat(seat) {
    this.opponents.delete(seat);
    this._persist();
  }

  // --- Persistence ---

  _persist() {
    try {
      const data = {};
      for (const [seat, s] of this.opponents) {
        data[seat] = { ...s };
      }
      localStorage.setItem(this.persistKey, JSON.stringify(data));
    } catch (_) { console.warn('[App] Handled exception:', _?.message || _); }
  }

  _restore() {
    try {
      const raw = localStorage.getItem(this.persistKey);
      if (!raw) return;
      const data = JSON.parse(raw);
      for (const [seat, s] of Object.entries(data || {})) {
        this.opponents.set(seat, {
          handsObserved: s.handsObserved || 0,
          vpipCount: s.vpipCount || 0,
          pfrCount: s.pfrCount || 0,
          threeBetCount: s.threeBetCount || 0,
          postflopBets: s.postflopBets || 0,
          postflopCalls: s.postflopCalls || 0,
          postflopFolds: s.postflopFolds || 0,
          totalFolds: s.totalFolds || 0,
          allInCount: s.allInCount || 0,
          lastSeen: s.lastSeen || null,
        });
      }
    } catch (_) { console.warn('[App] Handled exception:', _?.message || _); }
  }
}

/**
 * Classify a player based on VPIP/PFR/AF into standard poker archetypes.
 * Returns a short label for HUD display.
 */
function classifyPlayer(vpip, pfr, af) {
  if (vpip >= 40 && af >= 2) return 'LAG';     // Loose-Aggressive (maniac-ish)
  if (vpip >= 40 && af < 2) return 'LP';        // Loose-Passive (calling station)
  if (vpip < 25 && pfr >= 15 && af >= 2) return 'TAG';  // Tight-Aggressive (solid)
  if (vpip < 25 && af < 2) return 'TP';         // Tight-Passive (nit)
  if (vpip >= 25 && vpip < 40 && af >= 2) return 'TAG';  // Borderline TAG
  if (vpip >= 25 && vpip < 40 && af < 2) return 'LP';    // Borderline LP
  return 'UNK';  // Unknown / insufficient data
}

export { OpponentStats, classifyPlayer };
export default OpponentStats;
