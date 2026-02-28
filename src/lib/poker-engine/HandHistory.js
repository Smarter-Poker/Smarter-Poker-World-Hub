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
 * Stores to Supabase `hand_histories` table.
 * Each hand produces a self-contained JSON record.
 */

// ============ HAND HISTORY RECORDER ============

class HandHistoryRecorder {
  /**
   * @param {Object} config
   * @param {Object} config.supabase - Supabase client
   * @param {string} config.tableId
   * @param {string} config.clubId
   * @param {string} config.variant - Game variant
   * @param {string} config.bettingStructure
   * @param {number} config.smallBlind
   * @param {number} config.bigBlind
   */
  constructor(config) {
    this.supabase = config.supabase;
    this.tableId = config.tableId;
    this.clubId = config.clubId;
    this.variant = config.variant;
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
      id: `${this.tableId}_${data.handNumber}_${Date.now()}`,
      tableId: this.tableId,
      clubId: this.clubId,
      handNumber: data.handNumber,
      variant: this.variant,
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
   */
  recordAction(street, action) {
    if (!this._currentHand) return;
    
    const streetData = this._currentHand.streets[street];
    if (!streetData) return;
    
    streetData.actions.push({
      playerId: action.playerId,
      type: action.type,
      amount: action.amount || 0,
      auto: action.auto || false,
      timestamp: Date.now(),
    });
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
    this._currentHand.winners = data.winners;
    this._currentHand.pots = data.pots;
    this._currentHand.rake = data.rake || 0;
    
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
    
    // Persist to Supabase
    try {
      if (this.supabase) {
        const { error } = await this.supabase
          .from('hand_histories')
          .insert({
            id: handId,
            table_id: handRecord.tableId,
            club_id: handRecord.clubId,
            hand_number: handRecord.handNumber,
            variant: handRecord.variant,
            betting_structure: handRecord.bettingStructure,
            small_blind: handRecord.smallBlind,
            big_blind: handRecord.bigBlind,
            player_ids: handRecord.players.map(p => p.id),
            hand_data: handRecord,
            rake: handRecord.rake,
            pot_total: handRecord.pots.reduce((sum, p) => sum + (p.amount || 0), 0),
            winner_ids: handRecord.winners.map(w => w.playerId),
            started_at: handRecord.startedAt,
            completed_at: handRecord.completedAt,
          });
        
        if (error) {
          console.error('Hand history save error:', error);
          return { success: false, handId, error: error.message };
        }
      }
    } catch (err) {
      console.error('Hand history save exception:', err);
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
      .from('hand_histories')
      .select('*')
      .contains('player_ids', [playerId])
      .order('completed_at', { ascending: false });
    
    if (options.variant) query = query.eq('variant', options.variant);
    if (options.tableId) query = query.eq('table_id', options.tableId);
    if (options.limit) query = query.limit(options.limit);
    if (options.offset) query = query.range(options.offset, options.offset + (options.limit || 50) - 1);
    
    const { data, error } = await query;
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
    const { data, error } = await this.supabase
      .from('hand_histories')
      .select('*')
      .eq('table_id', tableId)
      .order('completed_at', { ascending: false })
      .limit(limit);
    
    if (error) throw error;
    return data || [];
  }

  /**
   * Get a single hand by ID.
   * @param {string} handId
   * @returns {Promise<Object|null>}
   */
  async getHand(handId) {
    const { data, error } = await this.supabase
      .from('hand_histories')
      .select('*')
      .eq('id', handId)
      .single();
    
    if (error) return null;
    return data;
  }

  /**
   * Get player stats summary.
   * @param {string} playerId
   * @param {Object} [options] - { variant, since }
   * @returns {Promise<Object>}
   */
  async getPlayerStats(playerId, options = {}) {
    let query = this.supabase
      .from('hand_histories')
      .select('hand_data, rake, pot_total, winner_ids, variant, completed_at')
      .contains('player_ids', [playerId]);
    
    if (options.variant) query = query.eq('variant', options.variant);
    if (options.since) query = query.gte('completed_at', options.since);
    
    const { data, error } = await query;
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
      const handData = hand.hand_data;
      if (!handData) continue;
      
      const player = handData.players?.find(p => String(p.id) === String(playerId));
      if (!player) continue;
      
      // Net result
      totalNetResult += player.netResult || 0;
      
      // Won hand?
      if (hand.winner_ids?.includes(playerId)) {
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
          if (hand.winner_ids?.includes(playerId)) wonAtShowdown++;
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

// ============ SUPABASE MIGRATION ============

/**
 * SQL migration for hand_histories table.
 * Run this in Supabase SQL editor.
 */
const MIGRATION_SQL = `
-- Hand histories table
CREATE TABLE IF NOT EXISTS hand_histories (
  id TEXT PRIMARY KEY,
  table_id TEXT NOT NULL,
  club_id TEXT,
  hand_number INTEGER NOT NULL,
  variant TEXT NOT NULL DEFAULT 'holdem',
  betting_structure TEXT NOT NULL DEFAULT 'no_limit',
  small_blind NUMERIC NOT NULL,
  big_blind NUMERIC NOT NULL,
  player_ids TEXT[] NOT NULL DEFAULT '{}',
  hand_data JSONB NOT NULL,
  rake NUMERIC DEFAULT 0,
  pot_total NUMERIC DEFAULT 0,
  winner_ids TEXT[] NOT NULL DEFAULT '{}',
  started_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_hand_histories_table_id ON hand_histories(table_id);
CREATE INDEX IF NOT EXISTS idx_hand_histories_club_id ON hand_histories(club_id);
CREATE INDEX IF NOT EXISTS idx_hand_histories_player_ids ON hand_histories USING GIN(player_ids);
CREATE INDEX IF NOT EXISTS idx_hand_histories_winner_ids ON hand_histories USING GIN(winner_ids);
CREATE INDEX IF NOT EXISTS idx_hand_histories_completed_at ON hand_histories(completed_at DESC);
CREATE INDEX IF NOT EXISTS idx_hand_histories_variant ON hand_histories(variant);

-- RLS policies
ALTER TABLE hand_histories ENABLE ROW LEVEL SECURITY;

-- Players can read hands they participated in
CREATE POLICY "Players can view their own hands"
  ON hand_histories FOR SELECT
  USING (auth.uid()::text = ANY(player_ids));

-- Club admins can view all hands at their club tables
CREATE POLICY "Club admins can view club hands"
  ON hand_histories FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM club_members
      WHERE club_members.club_id = hand_histories.club_id
      AND club_members.user_id = auth.uid()
      AND club_members.role IN ('owner', 'admin', 'manager')
    )
  );

-- Server can insert (service role)
CREATE POLICY "Service role can insert hands"
  ON hand_histories FOR INSERT
  WITH CHECK (true);
`;

// ============ EXPORTS ============

module.exports = {
  HandHistoryRecorder,
  HandHistoryQuery,
  MIGRATION_SQL,
};
