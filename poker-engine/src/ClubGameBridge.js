/**
 * ClubGameBridge — Connects Poker Engine Events → Supabase Persistence
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * When a hand completes in the engine:
 *   1. Collects rake from the pot
 *   2. Credits rake to club treasury
 *   3. Persists the hand to club_hand_histories
 *   4. Updates player stats (hands_played, chips_won, chips_lost)
 *   5. Updates table stats (hands_played, total_pot)
 * 
 * This module is initialized by GameController when a club table is created.
 * It listens to TableManager events and writes to Supabase.
 * 
 * Architecture:
 *   TableManager (engine) → emits events → ClubGameBridge → Supabase writes
 * ═══════════════════════════════════════════════════════════════════════════
 */

const { createClient } = require('@supabase/supabase-js');

class ClubGameBridge {
  /**
   * @param {Object} config
   * @param {string} config.clubId
   * @param {string} config.tableId
   * @param {Object} config.tableManager - TableManager instance
   * @param {Object} config.supabase - Supabase service client
   * @param {number} [config.rakePercent=5]
   * @param {number} [config.rakeCapBb=3]
   */
  constructor(config) {
    this.clubId = config.clubId;
    this.tableId = config.tableId;
    this.table = config.tableManager;
    this.supabase = config.supabase;
    this.rakePercent = config.rakePercent || 5;
    this.rakeCapBb = config.rakeCapBb || 3;
    this.bigBlind = config.bigBlind || 2;

    this._handCount = 0;
    this._totalRake = 0;
    this._attached = false;
  }

  /**
   * Attach event listeners to the TableManager.
   * Called once when the table is created.
   */
  attach() {
    if (this._attached) return;
    this._attached = true;

    // Listen to hand_complete events from the engine
    if (this.table.on) {
      this.table.on('hand_complete', (data) => this._onHandComplete(data));
      this.table.on('player_seated', (data) => this._onPlayerSeated(data));
      this.table.on('player_left', (data) => this._onPlayerLeft(data));
    }

    // Also hook into the game state machine if available
    if (this.table.game && this.table.game.on) {
      this.table.game.on('hand_complete', (data) => this._onHandComplete(data));
    }

    console.log(`[ClubGameBridge] Attached to table ${this.tableId} in club ${this.clubId}`);
  }

  /**
   * Detach all listeners. Called when table closes.
   */
  detach() {
    this._attached = false;
    // EventEmitter listeners are cleaned up when the table is destroyed
    console.log(`[ClubGameBridge] Detached from table ${this.tableId}`);
  }

  /**
   * Called when a hand completes. This is the core integration point.
   * @private
   */
  async _onHandComplete(data) {
    try {
      const {
        handNumber,
        players,     // [{ id, seatIndex, startStack, endStack, cards, ... }]
        community,   // ['Ah', 'Kd', ...]
        actions,     // [{ street, playerId, action, amount }]
        pots,        // [{ amount, winners: [{ id, amount }] }]
        winners,     // [{ id, amount, handName }]
        variant,
        smallBlind,
        bigBlind,
      } = data;

      // 1. Calculate rake
      const totalPot = (pots || []).reduce((sum, p) => sum + (p.amount || 0), 0);
      const rake = this._calculateRake(totalPot, bigBlind || this.bigBlind);

      this._handCount++;
      this._totalRake += rake;

      // 2. Persist hand history
      await this._saveHandHistory({
        handNumber,
        variant: variant || 'nlh',
        smallBlind: smallBlind || this.bigBlind / 2,
        bigBlind: bigBlind || this.bigBlind,
        players: players || [],
        communityCards: community || [],
        actions: actions || [],
        pots: pots || [],
        potTotal: totalPot,
        rake,
        winners: winners || [],
      });

      // 3. Credit rake to club treasury
      if (rake > 0) {
        await this._collectRake(rake);
      }

      // 4. Update player stats
      await this._updatePlayerStats(players || [], winners || [], rake);

      // 5. Update table stats
      await this._updateTableStats(totalPot);

    } catch (err) {
      console.error(`[ClubGameBridge] Hand complete error:`, err);
      // Don't throw — engine must continue even if persistence fails
    }
  }

  /**
   * Calculate rake for a pot.
   * @param {number} potTotal
   * @param {number} bb - Big blind amount
   * @returns {number} Rake amount
   */
  _calculateRake(potTotal, bb) {
    if (this.rakePercent <= 0 || potTotal <= 0) return 0;

    // No rake if pot is just blinds returned (no flop, no action)
    if (potTotal <= bb * 1.5) return 0;

    const rawRake = Math.floor(potTotal * (this.rakePercent / 100));
    const cap = Math.floor(this.rakeCapBb * bb);

    return Math.min(rawRake, cap);
  }

  /**
   * Save hand to club_hand_histories.
   * @private
   */
  async _saveHandHistory(hand) {
    if (!this.supabase) return;

    try {
      await this.supabase
        .from('club_hand_histories')
        .insert({
          club_id: this.clubId,
          table_id: this.tableId,
          hand_number: hand.handNumber || this._handCount,
          game_variant: hand.variant,
          small_blind: hand.smallBlind,
          big_blind: hand.bigBlind,
          players: hand.players,
          community_cards: hand.communityCards,
          actions: hand.actions,
          pots: hand.pots,
          pot_total: hand.potTotal,
          rake: hand.rake,
          winners: hand.winners,
        });
    } catch (err) {
      console.error('[ClubGameBridge] Failed to save hand history:', err);
    }
  }

  /**
   * Collect rake into club treasury.
   * @private
   */
  async _collectRake(amount) {
    if (!this.supabase || amount <= 0) return;

    try {
      await this.supabase.rpc('update_club_treasury', {
        p_club_id: this.clubId,
        p_amount: amount,
      });
    } catch (err) {
      console.error('[ClubGameBridge] Failed to collect rake:', err);
    }
  }

  /**
   * Update player stats after a hand.
   * @private
   */
  async _updatePlayerStats(players, winners, rake) {
    if (!this.supabase) return;

    const winnerMap = {};
    for (const w of winners) {
      winnerMap[w.id] = (winnerMap[w.id] || 0) + (w.amount || 0);
    }

    for (const p of players) {
      if (!p.id) continue;

      const won = winnerMap[p.id] || 0;
      const invested = (p.startStack || 0) - (p.endStack || 0) + won;
      const netResult = won - invested;

      try {
        // Find membership
        const { data: member } = await this.supabase
          .from('club_members')
          .select('id, hands_played, chips_won, chips_lost, total_rake_paid, biggest_pot')
          .eq('club_id', this.clubId)
          .eq('user_id', p.id)
          .single();

        if (member) {
          const updates = {
            hands_played: (member.hands_played || 0) + 1,
            last_active_at: new Date().toISOString(),
          };

          if (netResult > 0) {
            updates.chips_won = (member.chips_won || 0) + netResult;
          } else if (netResult < 0) {
            updates.chips_lost = (member.chips_lost || 0) + Math.abs(netResult);
          }

          // Approximate per-player rake share
          const rakeShare = Math.floor(rake / Math.max(players.length, 1));
          updates.total_rake_paid = (member.total_rake_paid || 0) + rakeShare;

          if (won > (member.biggest_pot || 0)) {
            updates.biggest_pot = won;
          }

          await this.supabase
            .from('club_members')
            .update(updates)
            .eq('id', member.id);
        }
      } catch (err) {
        // Non-critical, continue
      }
    }
  }

  /**
   * Update table stats.
   * @private
   */
  async _updateTableStats(potTotal) {
    if (!this.supabase) return;

    try {
      const { data: table } = await this.supabase
        .from('club_tables')
        .select('hands_played, total_pot')
        .eq('id', this.tableId)
        .single();

      if (table) {
        await this.supabase
          .from('club_tables')
          .update({
            hands_played: (table.hands_played || 0) + 1,
            total_pot: (table.total_pot || 0) + potTotal,
            status: 'active',
            updated_at: new Date().toISOString(),
          })
          .eq('id', this.tableId);
      }
    } catch (err) {
      // Non-critical
    }
  }

  /**
   * Track new player seated for table player count.
   * @private
   */
  async _onPlayerSeated(data) {
    if (!this.supabase) return;
    try {
      const playerCount = this.table.seats
        ? this.table.seats.filter(s => s.status !== 'empty').length
        : 0;
      await this.supabase
        .from('club_tables')
        .update({ current_players: playerCount, updated_at: new Date().toISOString() })
        .eq('id', this.tableId);
    } catch (_) {}
  }

  /**
   * Track player leaving for table player count.
   * @private
   */
  async _onPlayerLeft(data) {
    if (!this.supabase) return;
    try {
      const playerCount = this.table.seats
        ? this.table.seats.filter(s => s.status !== 'empty').length
        : 0;
      await this.supabase
        .from('club_tables')
        .update({ current_players: playerCount, updated_at: new Date().toISOString() })
        .eq('id', this.tableId);
    } catch (_) {}
  }

  /**
   * Get bridge stats.
   */
  getStats() {
    return {
      clubId: this.clubId,
      tableId: this.tableId,
      handsProcessed: this._handCount,
      totalRakeCollected: this._totalRake,
      attached: this._attached,
    };
  }
}

module.exports = { ClubGameBridge };
