/**
 * Smarter.Poker - Core Poker Engine
 * Module: HandHistory
 * 
 * Records complete hand histories for:
 *   - Hand replay viewer
 *   - Player stats / analytics
 *   - Dispute resolution / audit trail
 *   - AI coaching leak finder (Jarvis integration)
 * 
 * Stores to the canonical Supabase `hand_history` table.
 * Each hand produces a self-contained JSON record.
 */

// Phase 48f: Resilient DB operations
const { resilientMutation, resilientQuery } = require('./SupabaseResilience');

// ============ HAND HISTORY RECORDER ============

class HandHistoryRecorder {
  /**
   * @param {Object} config
   * @param {Object} config.supabase - Supabase client
   * @param {string} config.tableId
   * @param {string} config.clubId
   * @param {string} config.variant - Game variant
   * @param {string} [config.format] - 'cash' or 'tournament'
   * @param {string} config.bettingStructure
   * @param {number} config.smallBlind
   * @param {number} config.bigBlind
   */
  constructor(config) {
    this.supabase = config.supabase;
    this.tableId = config.tableId;
    this.clubId = config.clubId;
    this.variant = config.variant;
    this.format = config.format || null;
    this.bettingStructure = config.bettingStructure;
    this.smallBlind = config.smallBlind;
    this.bigBlind = config.bigBlind;
    
    this._currentHand = null;
  }

  /**
   * Begin recording a new hand.
   * @param {Object} data
   * @param {number} data.handNumber
   * @param {Array} data.players - [{ id, displayName, seatIndex, stack }]
   * @param {number} data.buttonSeat
   */
  beginHand(data) {
    this._currentHand = {
      id: data.handId || `${this.tableId}_${data.handNumber}_${Date.now()}`,
      tableId: this.tableId,
      clubId: this.clubId,
      handNumber: data.handNumber,
      variant: this.variant,
      format: this.format,
      bettingStructure: this.bettingStructure,
      smallBlind: this.smallBlind,
      bigBlind: this.bigBlind,
      buttonSeat: data.buttonSeat,
      startedAt: new Date().toISOString(),
      
      players: data.players.map(p => ({
        id: p.id,
        displayName: p.displayName,
        seatIndex: p.seatIndex,
        startStack: p.stack,
        endStack: null,
        holeCards: null,
        netResult: null,
        showedCards: false,
      })),
      
      streets: {
        preflop: { actions: [] },
        flop: { cards: [], actions: [] },
        turn: { cards: [], actions: [] },
        river: { cards: [], actions: [] },
      },
      
      communityCards: [],
      pots: [],
      winners: [],
      rake: 0,
      showdown: false,
      completedAt: null,
    };
  }

  /**
   * Record blinds/antes posted.
   * @param {Array} blinds - [{ playerId, amount, type }]
   */
  recordBlinds(blinds) {
    if (!this._currentHand) return;
    
    for (const blind of blinds) {
      this._currentHand.streets.preflop.actions.push({
        playerId: blind.playerId,
        type: blind.type, // 'small_blind', 'big_blind', 'ante'
        amount: blind.amount,
        timestamp: Date.now(),
      });
    }
  }

  /**
   * Record hole cards dealt to a player.
   * @param {string|number} playerId
   * @param {number[]} cards - Card integers
   */
  recordHoleCards(playerId, cards) {
    if (!this._currentHand) return;
    
    const player = this._currentHand.players.find(p => String(p.id) === String(playerId));
    if (player) {
      player.holeCards = cards;
    }
  }

  /**
   * Record community cards for a street.
   * @param {string} street - 'flop', 'turn', 'river'
   * @param {number[]} cards - Card integers
   */
  recordCommunityCards(street, cards) {
    if (!this._currentHand) return;
    
    if (this._currentHand.streets[street]) {
      this._currentHand.streets[street].cards = cards;
    }
    this._currentHand.communityCards = [
      ...(this._currentHand.streets.flop?.cards || []),
      ...(this._currentHand.streets.turn?.cards || []),
      ...(this._currentHand.streets.river?.cards || []),
    ];
  }

  /**
   * Record a player action.
   * @param {string} street - 'preflop', 'flop', 'turn', 'river'
   * @param {Object} action
   * @param {string|number} action.playerId
   * @param {string} action.type - fold/check/call/bet/raise/all_in
   * @param {number} [action.amount]
   * @param {boolean} [action.auto] - Was this an auto-action (timeout)
   * @param {number} [action.potBefore] - Pot immediately before the action
   * @param {number} [action.currentBetBefore] - Street wager to call before the action
   * @param {number} [action.raiseTo] - Exact street total after a raise
   */
  recordAction(street, action) {
    if (!this._currentHand) return;
    
    const streetData = this._currentHand.streets[street];
    if (!streetData) return;
    
    const recorded = {
      playerId: action.playerId,
      type: action.type,
      amount: action.amount || 0,
      auto: action.auto || false,
      timestamp: Date.now(),
    };
    for (const field of ['potBefore', 'currentBetBefore', 'raiseTo', 'sizingPct']) {
      if (action[field] !== null && action[field] !== undefined && Number.isFinite(Number(action[field]))) {
        recorded[field] = Number(action[field]);
      }
    }
    streetData.actions.push(recorded);
  }

  /**
   * Record showdown results.
   * @param {Object} data
   * @param {Array} data.winners - [{ playerId, amount, handDescription }]
   * @param {Array} data.pots - Pot breakdown
   * @param {number} data.rake
   * @param {Array} [data.shownCards] - [{ playerId, cards }]
   */
  recordShowdown(data) {
    if (!this._currentHand) return;
    
    this._currentHand.showdown = true;
    if (Array.isArray(data.winners)) this._currentHand.winners = data.winners;
    if (Array.isArray(data.pots)) this._currentHand.pots = data.pots;
    if (data.rake !== null && data.rake !== undefined) this._currentHand.rake = Number(data.rake) || 0;
    
    // Mark which players showed cards
    if (data.shownCards) {
      for (const shown of data.shownCards) {
        const player = this._currentHand.players.find(p => String(p.id) === String(shown.playerId));
        if (player) {
          player.showedCards = true;
          if (!player.holeCards) player.holeCards = shown.cards;
        }
      }
    }
  }

  /**
   * Record a fold-win (no showdown).
   * @param {Object} data
   * @param {string|number} data.winnerId
   * @param {number} data.amount
   */
  recordFoldWin(data) {
    if (!this._currentHand) return;
    
    this._currentHand.showdown = false;
    this._currentHand.winners = [{
      playerId: data.winnerId,
      amount: data.amount,
      handDescription: 'Last player standing',
    }];
    if (data.rake !== null && data.rake !== undefined) this._currentHand.rake = Number(data.rake) || 0;
  }

  /**
   * Complete the hand and persist to database.
   * @param {Array} finalStacks - [{ playerId, stack }]
   * @returns {Promise<{ success: boolean, handId?: string, error?: string }>}
   */
  async completeHand(finalStacks) {
    if (!this._currentHand) return { success: false, error: 'No hand in progress' };
    
    this._currentHand.completedAt = new Date().toISOString();
    
    // Calculate net results
    for (const player of this._currentHand.players) {
      const final = finalStacks.find(f => String(f.playerId) === String(player.id));
      if (final) {
        player.endStack = final.stack;
        player.netResult = final.stack - player.startStack;
      }
    }
    
    const handRecord = { ...this._currentHand };
    const handId = handRecord.id;
    
    // Persist to Supabase (Phase 48f: resilient mutation)
    try {
      if (this.supabase) {
        const { error } = await resilientMutation(this.supabase, () =>
          this.supabase
            .from('hand_history')
            // 2026-08-15 CHECK 13 fix: this wrote club_id/variant/
            // betting_structure/player_ids/hand_data/rake/pot_total/winner_ids/
            // completed_at — none exist on hand_history (real: game_variant/
            // players jsonb/rake_amount/pot_size/winners jsonb/ended_at; club
            // scope lives on tables.club_id) — so the insert 42703'd and the
            // API-engine's hands were NEVER recorded. players/winners now match
            // the live rows' shape (userId keys); the full hand record is
            // preserved as JSON in summary (text) for the stats reader.
            .insert({
              id: handId,
              table_id: handRecord.tableId,
              hand_number: handRecord.handNumber,
              game_variant: handRecord.variant,
              small_blind: handRecord.smallBlind,
              big_blind: handRecord.bigBlind,
              players: handRecord.players.map(p => ({
                userId: p.id,
                username: p.displayName,
                seat: p.seatIndex,
                stack: p.endStack ?? p.startStack,
              })),
              board: handRecord.communityCards || handRecord.board || [],
              summary: JSON.stringify(handRecord),
              rake_amount: handRecord.rake || 0,
              pot_size: (handRecord.pots || []).reduce((sum, p) => sum + (p.amount || 0), 0)
                || (handRecord.winners || []).reduce((sum, winner) => sum + (winner.amount || 0), 0),
              winners: (handRecord.winners || []).map(w => ({ userId: w.playerId, amount: w.amount })),
              source: 'wh-engine',
              started_at: handRecord.startedAt,
              ended_at: handRecord.completedAt,
            }),
          { critical: true }
        );

        if (error) {
          console.warn('Hand history save error:', error);
          return { success: false, handId, error: error.message };
        }
      }
    } catch (err) {
      console.warn('Hand history save exception:', err);
      return { success: false, handId, error: err.message };
    }
    
    // Clear current hand
    this._currentHand = null;
    
    return { success: true, handId };
  }

  /**
   * Get the current in-progress hand record (for debugging).
   * @returns {Object|null}
   */
  getCurrentHand() {
    return this._currentHand ? { ...this._currentHand } : null;
  }
}

// ============ HAND HISTORY QUERIES ============

/**
 * Query hand histories from Supabase.
 */
class HandHistoryQuery {
  constructor(supabase) {
    this.supabase = supabase;
  }

  /**
   * Get hands for a specific player.
   * @param {string} playerId
   * @param {Object} [options]
   * @param {number} [options.limit]
   * @param {number} [options.offset]
   * @param {string} [options.variant]
   * @param {string} [options.tableId]
   * @returns {Promise<Array>}
   */
  async getPlayerHands(playerId, options = {}) {
    let query = this.supabase
      .from('hand_history')
      .select('*')
      // 2026-08-15 CHECK 13 fix: containment on the real players jsonb
      // (userId keys), ordered by the real ended_at column.
      .contains('players', JSON.stringify([{ userId: playerId }]))
      .order('ended_at', { ascending: false });

    if (options.variant) query = query.eq('game_variant', options.variant);
    if (options.tableId) query = query.eq('table_id', options.tableId);
    if (options.limit) query = query.limit(options.limit);
    if (options.offset) query = query.range(options.offset, options.offset + (options.limit || 50) - 1);

    // Phase 48f: resilient query
    const { data, error } = await resilientQuery(this.supabase, () => query);
    if (error) throw error;
    return data || [];
  }

  /**
   * Get hands for a specific table.
   * @param {string} tableId
   * @param {number} [limit]
   * @returns {Promise<Array>}
   */
  async getTableHands(tableId, limit = 50) {
    // Phase 48f: resilient query
    const { data, error } = await resilientQuery(this.supabase, () =>
      this.supabase
        .from('hand_history')
        .select('*')
        .eq('table_id', tableId)
        .order('ended_at', { ascending: false })
        .limit(limit)
    );

    if (error) throw error;
    return data || [];
  }

  /**
   * Get a single hand by ID.
   * @param {string} handId
   * @returns {Promise<Object|null>}
   */
  async getHand(handId) {
    // Phase 48f: resilient query
    const { data, error } = await resilientQuery(this.supabase, () =>
      this.supabase
        .from('hand_history')
        .select('*')
        .eq('id', handId)
        .maybeSingle()
    );

    if (error) return null;
    return data || null;
  }

  /**
   * Get player stats summary.
   * @param {string} playerId
   * @param {Object} [options] - { variant, since }
   * @returns {Promise<Object>}
   */
  async getPlayerStats(playerId, options = {}) {
    let query = this.supabase
      .from('hand_history')
      .select('summary, rake_amount, pot_size, winners, game_variant, ended_at')
      .contains('players', JSON.stringify([{ userId: playerId }]));
    
    if (options.variant) query = query.eq('game_variant', options.variant);
    if (options.since) query = query.gte('ended_at', options.since);

    // Phase 48f: resilient query
    const { data, error } = await resilientQuery(this.supabase, () => query);
    if (error) throw error;
    
    if (!data || data.length === 0) {
      return { handsPlayed: 0, handsWon: 0, totalNetResult: 0, vpipRate: 0, pfr: 0 };
    }
    
    let handsWon = 0;
    let totalNetResult = 0;
    let vpipHands = 0;      // Voluntarily put money in pot
    let pfrHands = 0;        // Preflop raise
    let wentToShowdown = 0;
    let wonAtShowdown = 0;
    
    for (const hand of data) {
      // Full hand record is stored as JSON in summary (see the insert above).
      let handData = null;
      try { handData = hand.summary ? JSON.parse(hand.summary) : null; } catch { handData = null; }
      if (!handData) continue;
      
      const player = handData.players?.find(p => String(p.id) === String(playerId));
      if (!player) continue;
      
      // Net result
      totalNetResult += player.netResult || 0;
      
      // Won hand?
      const winnerIds = (hand.winners || []).map(w => w.userId ?? w.playerId);
      if (winnerIds.includes(playerId)) {
        handsWon++;
      }
      
      // VPIP: did player voluntarily put money in preflop? (call or raise, not just blinds)
      const preflopActions = handData.streets?.preflop?.actions || [];
      const playerPreflopActions = preflopActions.filter(a => String(a.playerId) === String(playerId));
      const voluntaryPreflop = playerPreflopActions.some(a => 
        a.type === 'call' || a.type === 'raise' || a.type === 'bet' || a.type === 'all_in'
      );
      if (voluntaryPreflop) vpipHands++;
      
      // PFR: did player raise preflop?
      const raisedPreflop = playerPreflopActions.some(a => a.type === 'raise' || a.type === 'bet');
      if (raisedPreflop) pfrHands++;
      
      // Showdown stats
      if (handData.showdown) {
        const didntFold = !preflopActions.some(a => String(a.playerId) === String(playerId) && a.type === 'fold');
        if (didntFold) {
          wentToShowdown++;
          if (winnerIds.includes(playerId)) wonAtShowdown++;
        }
      }
    }
    
    const handsPlayed = data.length;
    
    return {
      handsPlayed,
      handsWon,
      winRate: handsPlayed > 0 ? (handsWon / handsPlayed * 100).toFixed(1) : 0,
      totalNetResult,
      avgNetPerHand: handsPlayed > 0 ? (totalNetResult / handsPlayed).toFixed(2) : 0,
      vpipRate: handsPlayed > 0 ? (vpipHands / handsPlayed * 100).toFixed(1) : 0,
      pfrRate: handsPlayed > 0 ? (pfrHands / handsPlayed * 100).toFixed(1) : 0,
      wtsdRate: vpipHands > 0 ? (wentToShowdown / vpipHands * 100).toFixed(1) : 0,
      wonAtShowdownRate: wentToShowdown > 0 ? (wonAtShowdown / wentToShowdown * 100).toFixed(1) : 0,
    };
  }
}

// ============ EXPORTS ============

module.exports = {
  HandHistoryRecorder,
  HandHistoryQuery,
};
