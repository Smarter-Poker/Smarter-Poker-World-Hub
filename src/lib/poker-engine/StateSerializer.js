/**
 * 💾 STATE SERIALIZER — Mid-Hand Crash Recovery
 * ═══════════════════════════════════════════════════════════════
 * 
 * Solves the Vercel serverless cold start problem by serializing
 * the COMPLETE in-progress hand state to Supabase, enabling
 * full recovery even if the serverless function is destroyed mid-hand.
 * 
 * Serializes:
 *   - All seat/player data with stacks
 *   - Current game phase, street, pot, community cards
 *   - Each player's hole cards (encrypted column)
 *   - Betting round state (bets, actions, current player)
 *   - Dealer position, hand number
 *   - Action history for current hand
 * 
 * Recovery:
 *   - On cold start, loads serialized state from DB
 *   - Rebuilds GameStateMachine mid-hand
 *   - Resumes play from the exact point of interruption
 * 
 * Trigger:
 *   - Every action_processed event (incremental, ~5ms overhead)
 *   - On hand_start (full snapshot)
 *   - On hand_complete (clears serialized state)
 * ═══════════════════════════════════════════════════════════════
 */

const SAVE_DEBOUNCE_MS = 100; // Don't save more than once per 100ms (was 500ms)

class StateSerializer {
  /**
   * @param {string} tableId
   * @param {import('@supabase/supabase-js').SupabaseClient} supabase
   */
  constructor(tableId, supabase) {
    this.tableId = tableId;
    this.supabase = supabase;
    this._saveTimer = null;
    this._pendingState = null;
  }

  /**
   * Wire to a TableManager instance.
   * @param {import('./TableManager').TableManager} table
   */
  wire(table) {
    this.table = table;

    // Save on hand start (full snapshot)
    table.on('hand_start', () => this._queueSave());

    // Save on every action (debounced)
    table.on('action_processed', () => this._queueSave());

    // Save on street change
    table.on('street_start', () => this._queueSave());

    // CRITICAL: Immediate flush on showdown and payout — these are the
    // highest-stakes moments. If the server dies here, chips could be
    // lost or duplicated. Bypass debounce and write synchronously.
    table.on('showdown', () => this._immediateFlush());
    table.on('payout', () => this._immediateFlush());
    table.on('all_in_showdown', () => this._immediateFlush());

    // Clear live_state on hand complete, then write seat snapshot.
    // Between-hand snapshot keeps seated player stacks in DB so a
    // cold-start crash between hands can still restore seats.
    table.on('hand_complete', () => this._clearStateAndSnapshot());

    // Keep seat snapshot current whenever players join/leave.
    // No need to await — fire-and-forget is fine for snapshots.
    table.on('player_seated', () => this._writeSeatSnapshot().catch(() => {}));
    table.on('player_left', () => this._writeSeatSnapshot().catch(() => {}));
    table.on('chips_added', () => this._writeSeatSnapshot().catch(() => {}));
  }

  /**
   * Serialize the current table + game state.
   * @returns {Object} Serialized state
   */
  serialize() {
    if (!this.table) return null;

    const game = this.table.game;
    const hand = game.currentHand;

    return {
      tableId: this.tableId,
      savedAt: Date.now(),

      // Table state
      status: this.table.status,
      handCount: this.table.handCount,
      dealerSeat: this.table.dealerSeat,

      // Seats (includes player info, stacks, hole cards)
      seats: this.table.seats.map(s => ({
        seatIndex: s.seatIndex,
        status: s.status,
        stack: s.stack,
        player: s.player ? {
          id: s.player.id,
          displayName: s.player.displayName,
          avatarUrl: s.player.avatarUrl,
        } : null,
        disconnectedAt: s.disconnectedAt || null,
      })),

      // Game phase
      gamePhase: game.phase,
      variant: game.variant,

      // Current hand (if in progress)
      hand: hand ? {
        handNumber: hand.handNumber,
        players: hand.players.map(p => ({
          id: p.id,
          seatIndex: p.seatIndex,
          stack: p.stack,
          bet: p.bet,
          totalBet: p.totalBet,
          folded: p.folded,
          allIn: p.allIn,
          // SECURITY: Hole cards stored in separate restricted table (hand_private_state)
          // NOT stored here — live_state is readable by all club members via RLS.
          holeCards: null,
          acted: p.acted,
          showdownRevealed: p.showdownRevealed || false,
        })),
        communityCards: hand.communityCards || [],
        street: hand.street,
        pot: hand.pot,
        sidePots: hand.sidePots || [],
        currentBet: hand.currentBet || 0,
        minRaise: hand.minRaise || 0,
        currentPlayerIndex: hand.currentPlayerIndex,
        dealerIndex: hand.dealerIndex,
        smallBlindIndex: hand.smallBlindIndex,
        bigBlindIndex: hand.bigBlindIndex,
        lastAggressor: hand.lastAggressor || null,
        actionHistory: hand.actionHistory || [],
        // PotCalculator internal state (critical for cold-start recovery)
        potCalculator: game.potCalculator?.getState?.() || null,
      } : null,

      // Waitlist
      waitlist: this.table.waitlist || [],
    };
  }

  /**
   * Restore table state from serialized data.
   * @param {import('./TableManager').TableManager} table
   * @param {Object} state - Serialized state from DB
   * @returns {boolean} Whether recovery was successful
   */
  static restore(table, state) {
    if (!state || !state.seats) return false;

    try {
      // Restore seats
      for (const seatData of state.seats) {
        if (seatData.player && seatData.status !== 'empty') {
          const existing = table.seats[seatData.seatIndex];
          if (existing) {
            existing.status = seatData.status;
            existing.stack = seatData.stack;
            existing.player = seatData.player;
            existing.disconnectedAt = seatData.disconnectedAt;
          }
        }
      }

      // Restore dealer position
      if (typeof state.dealerSeat === 'number') {
        table.dealerSeat = state.dealerSeat;
      }

      // Restore hand count
      if (state.handCount) table.handCount = state.handCount;

      // If there was a hand in progress, restore it
      if (state.hand && state.gamePhase !== 'idle') {
        const game = table.game;
        const h = state.hand;

        // Rebuild players array
        game.currentHand = {
          handNumber: h.handNumber,
          players: h.players.map(p => ({
            ...p,
            holeCards: p.holeCards || [],
          })),
          communityCards: h.communityCards || [],
          street: h.street,
          pot: h.pot,
          sidePots: h.sidePots || [],
          currentBet: h.currentBet || 0,
          minRaise: h.minRaise || 0,
          currentPlayerIndex: h.currentPlayerIndex,
          dealerIndex: h.dealerIndex,
          smallBlindIndex: h.smallBlindIndex,
          bigBlindIndex: h.bigBlindIndex,
          lastAggressor: h.lastAggressor,
          actionHistory: h.actionHistory || [],
        };

        game.phase = state.gamePhase;

        // Restore PotCalculator internal state (investments, folded, allIn)
        if (h.potCalculator && game.potCalculator) {
          const pc = game.potCalculator;
          if (h.potCalculator.investments) {
            for (const [pid, amt] of Object.entries(h.potCalculator.investments)) {
              pc._investments.set(pid, amt);
            }
          }
          if (h.potCalculator.folded) {
            for (const [pid, val] of Object.entries(h.potCalculator.folded)) {
              pc._folded.set(pid, val);
            }
          }
          if (h.potCalculator.allIn) {
            for (const [pid, val] of Object.entries(h.potCalculator.allIn)) {
              pc._allIn.set(pid, val);
            }
          }
        }

        // Sync stacks back to seats
        for (const p of h.players) {
          const seat = table.seats.find(s => s.player?.id === p.id);
          if (seat) seat.stack = p.stack;
        }

        console.log(`[StateSerializer] Recovered hand #${h.handNumber} at ${h.street} phase (${h.players.filter(p => !p.folded).length} active players)`);
        return true;
      }

      console.log(`[StateSerializer] Recovered ${state.seats.filter(s => s.player).length} seated players (no hand in progress)`);
      return true;
    } catch (err) {
      console.error('[StateSerializer] Recovery failed:', err.message);
      return false;
    }
  }

  /**
   * Immediate flush — bypasses debounce. Used for showdown/payout events
   * where we cannot afford to lose state if the serverless function dies.
   * @private
   */
  async _immediateFlush() {
    if (!this.supabase) return;
    // Cancel any pending debounced save — we're doing it now
    if (this._saveTimer) {
      clearTimeout(this._saveTimer);
      this._saveTimer = null;
    }
    this._pendingState = this.serialize();
    await this._flush();
  }

  /**
   * Queue a save (debounced).
   * @private
   */
  _queueSave() {
    if (!this.supabase) return;
    this._pendingState = this.serialize();

    if (this._saveTimer) return; // Already queued
    this._saveTimer = setTimeout(() => {
      this._saveTimer = null;
      this._flush();
    }, SAVE_DEBOUNCE_MS);
  }

  /**
   * Flush pending state to DB.
   * @private
   */
  async _flush() {
    if (!this._pendingState || !this.supabase) return;
    const state = this._pendingState;
    this._pendingState = null;

    try {
      // Save public state (no hole cards — visible to club members via RLS)
      await this.supabase
        .from('tables')
        .update({
          live_state: state,
          status: this.table?.status === 'RUNNING' ? 'running' : 'waiting',
        })
        .eq('id', this.tableId);

      // Save private state (hole cards) in restricted table
      // hand_private_state has NO select policy for regular members
      if (state.hand && this.table?.game?.currentHand) {
        const holeCardData = {};
        for (const p of this.table.game.currentHand.players) {
          if (p.holeCards?.length > 0) {
            holeCardData[p.id] = p.holeCards;
          }
        }
        await this.supabase
          .from('hand_private_state')
          .upsert({
            table_id: this.tableId,
            hand_number: state.hand.handNumber,
            hole_cards: holeCardData,
            saved_at: new Date().toISOString(),
          }, { onConflict: 'table_id' });
      }
    } catch (err) {
      console.error(`[StateSerializer] Save failed for ${this.tableId}:`, err.message);
    }
  }

  /**
   * Clear serialized state (hand completed normally).
   * @private
   */
  async _clearState() {
    if (!this.supabase) return;
    if (this._saveTimer) {
      clearTimeout(this._saveTimer);
      this._saveTimer = null;
    }
    this._pendingState = null;

    try {
      await this.supabase
        .from('tables')
        .update({ live_state: null })
        .eq('id', this.tableId);

      // Also clear private hole card state
      await this.supabase
        .from('hand_private_state')
        .delete()
        .eq('table_id', this.tableId);
    } catch (err) {
      // Non-critical
    }
  }

  /**
   * Called on hand_complete: clear live_state then immediately write seat
   * snapshot so between-hand crashes can restore seated players.
   * @private
   */
  async _clearStateAndSnapshot() {
    await this._clearState();
    await this._writeSeatSnapshot().catch(() => {});
  }

  /**
   * Write a lightweight snapshot of currently-seated players to
   * tables.settings.snapshot.  Used as fallback during cold-start
   * recovery when live_state is null (between hands).
   *
   * Format: { seats: [{ seatIndex, player: { id, displayName, avatarUrl }, stack, status }] }
   * @private
   */
  async _writeSeatSnapshot() {
    if (!this.supabase || !this.table) return;

    // Build snapshot from live seat array
    const seats = [];
    for (let i = 0; i < this.table.seats.length; i++) {
      const seat = this.table.seats[i];
      if (seat && seat.player && seat.status !== 'empty') {
        seats.push({
          seatIndex: i,
          player: {
            id: seat.player.id,
            displayName: seat.player.displayName || seat.player.name || '',
            avatarUrl: seat.player.avatarUrl || seat.player.avatar || null,
          },
          stack: seat.stack || 0,
          status: seat.status,
        });
      }
    }

    try {
      // Read current settings, merge snapshot sub-key, write back.
      // Best-effort: failures are logged but not thrown.
      const { data: row } = await this.supabase
        .from('tables')
        .select('settings')
        .eq('id', this.tableId)
        .maybeSingle();

      const currentSettings = row?.settings || {};
      await this.supabase
        .from('tables')
        .update({
          settings: {
            ...currentSettings,
            snapshot: { seats, savedAt: Date.now() },
          },
        })
        .eq('id', this.tableId);
    } catch (_err) {
      // Snapshot writes are best-effort — not critical
    }
  }

  /**
   * Load serialized state from DB for recovery.
   * @param {string} tableId
   * @param {import('@supabase/supabase-js').SupabaseClient} supabase
   * @returns {Object|null}
   */
  static async loadFromDB(tableId, supabase) {
    if (!supabase) return null;
    try {
      const { data, error } = await supabase
        .from('tables')
        .select('live_state')
        .eq('id', tableId)
        .maybeSingle();

      if (error || !data?.live_state) return null;

      // Check staleness (don't recover states older than 5 minutes)
      const state = data.live_state;
      if (state.savedAt && Date.now() - state.savedAt > 300000) {
        console.log(`[StateSerializer] Stale state for ${tableId} (${Math.round((Date.now() - state.savedAt) / 1000)}s old) — skipping recovery`);
        return null;
      }

      // Load private hole cards from restricted table
      if (state.hand) {
        const { data: privateData } = await supabase
          .from('hand_private_state')
          .select('hole_cards')
          .eq('table_id', tableId)
          .single();

        if (privateData?.hole_cards && state.hand.players) {
          for (const player of state.hand.players) {
            player.holeCards = privateData.hole_cards[player.id] || [];
          }
        }
      }

      return state;
    } catch (err) {
      console.error(`[StateSerializer] Load failed for ${tableId}:`, err.message);
      return null;
    }
  }

  destroy() {
    if (this._saveTimer) clearTimeout(this._saveTimer);
    this._pendingState = null;
  }
}

module.exports = { StateSerializer };
