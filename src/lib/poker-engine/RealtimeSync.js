/**
 * Smarter.Poker - Core Poker Engine
 * Module: RealtimeSync
 * 
 * Manages real-time server→client broadcasting at a poker table
 * using Supabase Realtime channels.
 * 
 * Architecture (Phase 5+):
 *   WRITES: Client → HTTP API → GameController → TableManager/engine
 *   READS:  Engine events → RealtimeSync → Supabase channel → Client
 * 
 *   - One channel per table: `table:{tableId}`
 *   - Server broadcasts game events to all connected clients
 *   - Private data (hole cards, legal actions) sent via player-specific events
 *   - Presence tracks connected viewers
 *   - ActionTimer events broadcast remaining time
 * 
 * Client-side listeners are NOT processed here — all player actions
 * are handled via HTTP API routes (/api/poker/engine/*) through
 * the GameController singleton.
 */

// ============ CONSTANTS ============

const HEARTBEAT_INTERVAL_MS = 10000;  // Client sends heartbeat every 10s
const HEARTBEAT_TIMEOUT_MS = 30000;   // Consider disconnected after 30s
const BROADCAST_THROTTLE_MS = 100;    // Min ms between state broadcasts

// Channel event types
const CHANNEL_EVENTS = {
  // Server → Client
  TABLE_STATE: 'table_state',           // Full state snapshot
  HAND_START: 'hand_start',
  BLINDS_POSTED: 'blinds_posted',
  CARDS_DEALT: 'cards_dealt',           // Public: card count. Private: actual cards via presence
  STREET_START: 'street_start',
  ACTION_REQUIRED: 'action_required',   // Sent to specific player
  ACTION_PROCESSED: 'action_processed', // Broadcast to all
  TIMER_UPDATE: 'timer_update',
  SHOWDOWN: 'showdown',
  PAYOUT: 'payout',
  HAND_COMPLETE: 'hand_complete',
  PLAYER_SEATED: 'player_seated',
  PLAYER_LEFT: 'player_left',
  PLAYER_SITTING_OUT: 'player_sitting_out',
  PLAYER_SITTING_IN: 'player_sitting_in',
  PLAYER_DISCONNECTED: 'player_disconnected',
  PLAYER_RECONNECTED: 'player_reconnected',
  CHAT_MESSAGE: 'chat_message',
  TABLE_ERROR: 'table_error',
  
  // Client → Server (NOW VIA HTTP API, kept for reference)
  // These events are no longer listened to on the Realtime channel.
  // All client actions go through /api/poker/engine/* HTTP endpoints.
  PLAYER_ACTION: 'player_action',       // { type, amount? }
  SIT_DOWN: 'sit_down',                 // { seatIndex, buyIn }
  STAND_UP: 'stand_up',
  SIT_OUT: 'sit_out',
  SIT_IN: 'sit_in',
  ADD_CHIPS: 'add_chips',              // { amount }
  JOIN_WAITLIST: 'join_waitlist',
  LEAVE_WAITLIST: 'leave_waitlist',
  SEND_CHAT: 'send_chat',             // { message }
  HEARTBEAT: 'heartbeat',
  REQUEST_STATE: 'request_state',      // Request full state resync
};

// ============ REALTIME SYNC ============

class RealtimeSync {
  /**
   * @param {Object} config
   * @param {Object} config.supabase - Supabase client instance (server-side)
   * @param {string} config.tableId - Table identifier
   * @param {import('./TableManager').TableManager} config.tableManager - Table manager instance
   * @param {import('./ActionTimer').ActionTimer} config.actionTimer - Action timer instance
   */
  constructor(config = {}) {
    this.supabase = config.supabase || null;
    this.tableId = config.tableId || null;
    this.table = config.tableManager || null;
    this.timer = config.actionTimer || null;
    
    this.channelName = `table:${this.tableId}`;
    this.channel = null;
    
    /** @type {Map<string, { lastHeartbeat: number, userId: string }>} */
    this._connections = new Map();
    
    this._heartbeatChecker = null;
    this._lastBroadcast = 0;
  }

  /**
   * Initialize the realtime channel and wire up event handlers.
   */
  async initialize() {
    // Skip channel creation if no Supabase client (memory-only mode)
    if (!this.supabase) {
      console.log(`[RealtimeSync] No Supabase client — running without realtime for table ${this.tableId}`);
      this._wireTableEvents();
      this._wireTimerEvents();
      return;
    }

    // Create Supabase Realtime channel
    this.channel = this.supabase.channel(this.channelName, {
      config: {
        broadcast: { self: false },  // Don't echo back to sender
        presence: { key: '' },
      },
    });
    
    // Presence tracking (clients join/leave the channel)
    this.channel
      .on('presence', { event: 'join' }, ({ key, newPresences }) => {
        this._handlePresenceJoin(newPresences);
      })
      .on('presence', { event: 'leave' }, ({ key, leftPresences }) => {
        this._handlePresenceLeave(leftPresences);
      });
    
    // Subscribe to channel
    await this.channel.subscribe();
    
    // Wire TableManager events to broadcasts
    this._wireTableEvents();
    
    // Wire ActionTimer broadcasts
    this._wireTimerEvents();
    
    // Start heartbeat checker
    this._heartbeatChecker = setInterval(() => {
      this._checkHeartbeats();
    }, HEARTBEAT_INTERVAL_MS);
  }

  /**
   * Wire TableManager events to channel broadcasts.
   * @private
   */
  _wireTableEvents() {
    const broadcastEvents = [
      // Core game flow
      'hand_start', 'blinds_posted', 'street_start',
      'action_processed', 'showdown', 'payout', 'hand_complete',
      // Player state
      'player_seated', 'player_left', 'player_sitting_out',
      'player_sitting_in', 'player_disconnected', 'player_reconnected',
      'player_auto_removed', 'seat_offered', 'table_paused', 'table_resumed',
      // Run It Twice/Thrice
      'run_it_offer', 'run_it_response', 'run_it_agreed',
      'run_it_declined', 'run_it_multiple', 'run_it_twice', 'run_it_thrice',
      // Insurance
      'insurance_offered', 'insurance_purchased', 'insurance_declined',
      'insurance_expired', 'insurance_payout',
      // Straddle
      'straddle_posted', 'straddle_declared',
      // All-in equity display
      'all_in_equity',
      // Bad Beat Jackpot
      'bbj_triggered',
      // Discard (Pineapple)
      'discard_required', 'card_discarded',
      // Chips
      'chips_added',
      // Auto-rebuy / top-up
      'auto_rebuy_success', 'auto_rebuy_attempt',
      'auto_topup_success', 'auto_topup_attempt',
      // Access control
      'buyin_authorization_requested', 'buyin_authorized', 'buyin_rejected',
      'player_invited',
      // Game length
      'game_length_warning', 'game_length_expired', 'game_length_extended',
      // Nit game
      'nit_warning', 'nit_sitout',
      // Config update (admin changed settings)
      'config_updated',
      // Table lifecycle
      'table_paused', 'table_resumed',
      // Seven-Deuce bonus
      'seven_deuce_bonus',
    ];
    
    for (const event of broadcastEvents) {
      this.table.on(event, (data) => {
        this._broadcast(event, data);
      });
    }
    
    // Cards dealt is special — send private cards to each player
    this.table.on('cards_dealt', (data) => {
      // Broadcast public info (card count)
      this._broadcast(CHANNEL_EVENTS.CARDS_DEALT, {
        players: data.players.map(p => ({ id: p.id, cardCount: p.cardCount })),
      });
      
      // Send private cards to each player via targeted message
      for (const player of data.players) {
        const cards = this.table.getPlayerCards(player.id);
        if (cards) {
          this._sendToPlayer(player.id, 'private_cards', {
            holeCards: cards,
          });
        }
      }
    });
    
    // Action required — send to specific player with their legal actions
    this.table.on('action_required', (data) => {
      // Broadcast that it's someone's turn (public)
      this._broadcast(CHANNEL_EVENTS.ACTION_REQUIRED, {
        playerId: data.playerId,
        timeBank: data.timeBank,
      });
      
      // Send legal actions to the specific player (private)
      const actions = this.table.getActionsForPlayer(data.playerId);
      if (actions) {
        this._sendToPlayer(data.playerId, 'your_turn', {
          legalActions: actions.actions,
          presets: actions.presets,
        });
      }
      
      // Start action timer
      const seat = this.table.seats.find(s => s.player?.id === data.playerId);
      const isDisconnected = seat?.status === 'disconnected';
      
      this.timer.startTurn(data.playerId, { disconnected: isDisconnected });
    });
  }

  /**
   * Wire ActionTimer events to broadcasts.
   * @private
   */
  _wireTimerEvents() {
    // Timer tick → broadcast remaining time
    this.timer.onTick = (playerId, remaining, isTimebank) => {
      this._broadcast(CHANNEL_EVENTS.TIMER_UPDATE, {
        playerId,
        remaining,
        isTimebank,
      });
    };
    
    // Timer warning
    this.timer.onWarning = (playerId, remaining, isTimebank) => {
      this._broadcast(CHANNEL_EVENTS.TIMER_UPDATE, {
        playerId,
        remaining,
        isTimebank,
        warning: true,
      });
    };
    
    // Timer expired → auto-fold
    this.timer.onExpire = (playerId) => {
      this.table.autoFold(playerId);
      this._broadcast(CHANNEL_EVENTS.ACTION_PROCESSED, {
        playerId,
        action: { type: 'fold', auto: true },
        reason: 'timeout',
      });
    };
  }

  // ============ CLIENT → SERVER HANDLERS ============

  // ============ PRESENCE HANDLERS ============
  // Note: Client action handlers (_handlePlayerAction, _handleSitDown, etc.)
  // were removed in Phase 7. All client writes now go through HTTP API routes
  // (/api/poker/engine/*) → GameController, which processes them server-side.
  // RealtimeSync is now broadcast-only (server → client).

  /** @private */
  _handlePresenceJoin(presences) {
    for (const presence of presences) {
      const playerId = presence.user_id || presence.playerId;
      if (playerId) {
        this._connections.set(playerId, {
          lastHeartbeat: Date.now(),
          userId: playerId,
        });
      }
    }
  }

  /** @private */
  _handlePresenceLeave(presences) {
    for (const presence of presences) {
      const playerId = presence.user_id || presence.playerId;
      if (playerId) {
        this._connections.delete(playerId);
        this.table.handleDisconnect(playerId);
      }
    }
  }

  // ============ HEARTBEAT CHECKER ============

  /** @private */
  _checkHeartbeats() {
    const now = Date.now();
    
    for (const [playerId, conn] of this._connections) {
      if (now - conn.lastHeartbeat > HEARTBEAT_TIMEOUT_MS) {
        // Player hasn't sent heartbeat — consider disconnected
        this._connections.delete(playerId);
        this.table.handleDisconnect(playerId);
      }
    }
  }

  // ============ BROADCASTING ============

  /**
   * Broadcast an event to all players at the table.
   * @private
   */
  _broadcast(event, data) {
    if (!this.channel) return;
    
    // Throttle rapid broadcasts
    const now = Date.now();
    if (now - this._lastBroadcast < BROADCAST_THROTTLE_MS) {
      setTimeout(() => this._broadcast(event, data), BROADCAST_THROTTLE_MS);
      return;
    }
    this._lastBroadcast = now;
    
    this.channel.send({
      type: 'broadcast',
      event,
      payload: {
        ...data,
        timestamp: Date.now(),
        tableId: this.tableId,
      },
    });
  }

  /**
   * Send a private message to a specific player.
   * Uses broadcast with player-specific event name.
   * @private
   */
  _sendToPlayer(playerId, event, data) {
    if (!this.channel) return;
    
    // Use player-specific event channel
    this.channel.send({
      type: 'broadcast',
      event: `${event}:${playerId}`,
      payload: {
        ...data,
        timestamp: Date.now(),
        tableId: this.tableId,
      },
    });
  }

  /**
   * Broadcast full table state to all (each player gets their own view).
   */
  broadcastFullState() {
    // Public state (no hole cards)
    const publicState = this.table.getState();
    this._broadcast(CHANNEL_EVENTS.TABLE_STATE, publicState);
    
    // Private cards for each seated player
    for (const seat of this.table.seats) {
      if (seat.player) {
        const cards = this.table.getPlayerCards(seat.player.id);
        if (cards) {
          this._sendToPlayer(seat.player.id, 'private_cards', { holeCards: cards });
        }
      }
    }
  }

  // ============ CLEANUP ============

  /**
   * Disconnect and clean up.
   */
  async destroy() {
    if (this._heartbeatChecker) {
      clearInterval(this._heartbeatChecker);
    }
    
    if (this.channel) {
      await this.supabase.removeChannel(this.channel);
      this.channel = null;
    }
    
    this._connections.clear();
  }
}

// ============ CLIENT-SIDE HELPER ============

/**
 * Create a client-side connection to a table channel.
 * Call this from the browser/React component.
 * 
 * @param {Object} supabase - Supabase client instance
 * @param {string} tableId
 * @param {string} playerId - Current user's ID
 * @param {Object} callbacks - Event handlers
 * @returns {Object} Channel controller with send methods
 */
function createTableClient(supabase, tableId, playerId, callbacks = {}) {
  const channelName = `table:${tableId}`;
  
  const channel = supabase.channel(channelName);
  
  // Subscribe to all server events
  const serverEvents = [
    // Core game flow
    'table_state', 'hand_start', 'blinds_posted', 'cards_dealt',
    'street_start', 'action_required', 'action_processed',
    'timer_update', 'showdown', 'payout', 'hand_complete',
    // Player state
    'player_seated', 'player_left', 'player_sitting_out',
    'player_sitting_in', 'player_disconnected', 'player_reconnected',
    'chat_message', 'table_error', 'seat_offered',
    // Run It Twice/Thrice
    'run_it_offer', 'run_it_response', 'run_it_agreed',
    'run_it_declined', 'run_it_multiple', 'run_it_twice', 'run_it_thrice',
    // Insurance
    'insurance_offered', 'insurance_purchased', 'insurance_declined',
    'insurance_expired', 'insurance_payout',
    // Straddle
    'straddle_posted', 'straddle_declared',
    // All-in equity
    'all_in_equity',
    // Bad Beat Jackpot
    'bbj_triggered',
    // Discard / Pineapple
    'discard_required', 'card_discarded',
    // Chips
    'chips_added',
    // Auto-rebuy / top-up
    'auto_rebuy_success', 'auto_rebuy_attempt',
    'auto_topup_success', 'auto_topup_attempt',
    // Access control
    'buyin_authorization_requested', 'buyin_authorized', 'buyin_rejected',
    'player_invited',
    // Game length
    'game_length_warning', 'game_length_expired', 'game_length_extended',
    // Nit game
    'nit_warning', 'nit_sitout',
    // Config update
    'config_updated',
    // Table lifecycle
    'table_paused', 'table_resumed',
    // Seven-Deuce
    'seven_deuce_bonus',
  ];
  
  for (const event of serverEvents) {
    channel.on('broadcast', { event }, (payload) => {
      if (callbacks[event]) callbacks[event](payload.payload);
      if (callbacks.onAny) callbacks.onAny(event, payload.payload);
    });
  }
  
  // Subscribe to private events for this player
  const privateEvents = ['private_cards', 'your_turn', 'table_state', 'table_error'];
  for (const event of privateEvents) {
    channel.on('broadcast', { event: `${event}:${playerId}` }, (payload) => {
      if (callbacks[event]) callbacks[event](payload.payload);
    });
  }
  
  // Track presence
  channel.on('presence', { event: 'sync' }, () => {
    const state = channel.presenceState();
    if (callbacks.onPresenceSync) callbacks.onPresenceSync(state);
  });
  
  // Subscribe
  channel.subscribe(async (status) => {
    if (status === 'SUBSCRIBED') {
      // Track presence
      await channel.track({ user_id: playerId, online_at: new Date().toISOString() });
      
      // Request initial state
      channel.send({
        type: 'broadcast',
        event: CHANNEL_EVENTS.REQUEST_STATE,
        payload: { playerId },
      });
      
      // Start heartbeat
      const heartbeat = setInterval(() => {
        channel.send({
          type: 'broadcast',
          event: CHANNEL_EVENTS.HEARTBEAT,
          payload: { playerId },
        });
      }, HEARTBEAT_INTERVAL_MS);
      
      // Store for cleanup
      channel._heartbeatInterval = heartbeat;
      
      if (callbacks.onConnected) callbacks.onConnected();
    }
  });
  
  // Return controller object
  return {
    channel,
    
    // Send player action (fold/check/call/bet/raise/all_in)
    sendAction(action) {
      channel.send({
        type: 'broadcast',
        event: CHANNEL_EVENTS.PLAYER_ACTION,
        payload: { playerId, action },
      });
    },
    
    // Sit down at a seat
    sitDown(seatIndex, buyIn, displayName, avatarUrl) {
      channel.send({
        type: 'broadcast',
        event: CHANNEL_EVENTS.SIT_DOWN,
        payload: { playerId, seatIndex, buyIn, displayName, avatarUrl },
      });
    },
    
    // Stand up (leave table)
    standUp() {
      channel.send({
        type: 'broadcast',
        event: CHANNEL_EVENTS.STAND_UP,
        payload: { playerId },
      });
    },
    
    // Sit out
    sitOut() {
      channel.send({
        type: 'broadcast',
        event: CHANNEL_EVENTS.SIT_OUT,
        payload: { playerId },
      });
    },
    
    // Sit back in
    sitIn() {
      channel.send({
        type: 'broadcast',
        event: CHANNEL_EVENTS.SIT_IN,
        payload: { playerId },
      });
    },
    
    // Add chips (rebuy)
    addChips(amount) {
      channel.send({
        type: 'broadcast',
        event: CHANNEL_EVENTS.ADD_CHIPS,
        payload: { playerId, amount },
      });
    },
    
    // Join waitlist
    joinWaitlist(displayName, seatPreference) {
      channel.send({
        type: 'broadcast',
        event: CHANNEL_EVENTS.JOIN_WAITLIST,
        payload: { playerId, displayName, seatPreference },
      });
    },
    
    // Leave waitlist
    leaveWaitlist() {
      channel.send({
        type: 'broadcast',
        event: CHANNEL_EVENTS.LEAVE_WAITLIST,
        payload: { playerId },
      });
    },
    
    // Send chat message
    sendChat(message) {
      channel.send({
        type: 'broadcast',
        event: CHANNEL_EVENTS.SEND_CHAT,
        payload: { playerId, message },
      });
    },
    
    // Request full state resync
    requestState() {
      channel.send({
        type: 'broadcast',
        event: CHANNEL_EVENTS.REQUEST_STATE,
        payload: { playerId },
      });
    },
    
    // Disconnect and clean up
    async disconnect() {
      if (channel._heartbeatInterval) {
        clearInterval(channel._heartbeatInterval);
      }
      await channel.untrack();
      await supabase.removeChannel(channel);
    },
  };
}

// ============ EXPORTS ============

module.exports = {
  CHANNEL_EVENTS,
  HEARTBEAT_INTERVAL_MS,
  HEARTBEAT_TIMEOUT_MS,
  RealtimeSync,
  createTableClient,
};
