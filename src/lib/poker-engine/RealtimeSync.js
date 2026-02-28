/**
 * Smarter.Poker - Core Poker Engine
 * Module: RealtimeSync
 * 
 * Manages real-time communication between the server and all
 * connected players at a table using Supabase Realtime channels.
 * 
 * Architecture:
 *   - One channel per table: `table:{tableId}`
 *   - Server broadcasts game events to all players
 *   - Players send actions via the channel
 *   - Private data (hole cards) sent via presence or direct messages
 *   - Heartbeat system detects disconnects
 * 
 * This module is designed to work with Supabase Realtime but
 * can be adapted to any WebSocket provider.
 * 
 * Usage:
 *   const sync = new RealtimeSync({ supabase, tableId, tableManager });
 *   sync.initialize();
 *   // Players subscribe from client side
 *   // Server broadcasts events automatically via TableManager hooks
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
  
  // Client → Server
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
    
    // Listen for client messages
    this.channel
      .on('broadcast', { event: CHANNEL_EVENTS.PLAYER_ACTION }, (payload) => {
        this._handlePlayerAction(payload);
      })
      .on('broadcast', { event: CHANNEL_EVENTS.SIT_DOWN }, (payload) => {
        this._handleSitDown(payload);
      })
      .on('broadcast', { event: CHANNEL_EVENTS.STAND_UP }, (payload) => {
        this._handleStandUp(payload);
      })
      .on('broadcast', { event: CHANNEL_EVENTS.SIT_OUT }, (payload) => {
        this._handleSitOut(payload);
      })
      .on('broadcast', { event: CHANNEL_EVENTS.SIT_IN }, (payload) => {
        this._handleSitIn(payload);
      })
      .on('broadcast', { event: CHANNEL_EVENTS.ADD_CHIPS }, (payload) => {
        this._handleAddChips(payload);
      })
      .on('broadcast', { event: CHANNEL_EVENTS.JOIN_WAITLIST }, (payload) => {
        this._handleJoinWaitlist(payload);
      })
      .on('broadcast', { event: CHANNEL_EVENTS.LEAVE_WAITLIST }, (payload) => {
        this._handleLeaveWaitlist(payload);
      })
      .on('broadcast', { event: CHANNEL_EVENTS.SEND_CHAT }, (payload) => {
        this._handleChat(payload);
      })
      .on('broadcast', { event: CHANNEL_EVENTS.HEARTBEAT }, (payload) => {
        this._handleHeartbeat(payload);
      })
      .on('broadcast', { event: CHANNEL_EVENTS.REQUEST_STATE }, (payload) => {
        this._handleStateRequest(payload);
      })
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
      'hand_start', 'blinds_posted', 'street_start',
      'action_processed', 'showdown', 'payout', 'hand_complete',
      'player_seated', 'player_left', 'player_sitting_out',
      'player_sitting_in', 'player_disconnected', 'player_reconnected',
      'player_auto_removed', 'seat_offered', 'table_paused', 'table_resumed',
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

  /** @private */
  _handlePlayerAction(payload) {
    const { playerId, action } = payload.payload || {};
    if (!playerId || !action) return;
    
    // Cancel timer — player acted
    this.timer.recordAction(playerId);
    this.timer.cancelTurn();
    
    const result = this.table.processAction(playerId, action);
    
    if (!result.success) {
      this._sendToPlayer(playerId, CHANNEL_EVENTS.TABLE_ERROR, {
        error: result.error,
      });
    }
  }

  /** @private */
  _handleSitDown(payload) {
    const { playerId, seatIndex, buyIn, displayName, avatarUrl } = payload.payload || {};
    if (!playerId || seatIndex === undefined || !buyIn) return;
    
    const result = this.table.sitDown(playerId, seatIndex, buyIn, { displayName, avatarUrl });
    
    if (!result.success) {
      this._sendToPlayer(playerId, CHANNEL_EVENTS.TABLE_ERROR, { error: result.error });
    }
  }

  /** @private */
  _handleStandUp(payload) {
    const { playerId } = payload.payload || {};
    if (!playerId) return;
    this.table.standUp(playerId);
  }

  /** @private */
  _handleSitOut(payload) {
    const { playerId } = payload.payload || {};
    if (!playerId) return;
    this.table.sitOut(playerId);
  }

  /** @private */
  _handleSitIn(payload) {
    const { playerId } = payload.payload || {};
    if (!playerId) return;
    this.table.sitIn(playerId);
  }

  /** @private */
  _handleAddChips(payload) {
    const { playerId, amount } = payload.payload || {};
    if (!playerId || !amount) return;
    
    const result = this.table.addChips(playerId, amount);
    if (!result.success) {
      this._sendToPlayer(playerId, CHANNEL_EVENTS.TABLE_ERROR, { error: result.error });
    }
  }

  /** @private */
  _handleJoinWaitlist(payload) {
    const { playerId, displayName, seatPreference } = payload.payload || {};
    if (!playerId) return;
    
    const result = this.table.joinWaitlist(playerId, { displayName, seatPreference });
    if (!result.success) {
      this._sendToPlayer(playerId, CHANNEL_EVENTS.TABLE_ERROR, { error: result.error });
    }
  }

  /** @private */
  _handleLeaveWaitlist(payload) {
    const { playerId } = payload.payload || {};
    if (!playerId) return;
    this.table.leaveWaitlist(playerId);
  }

  /** @private */
  _handleChat(payload) {
    const { playerId, message } = payload.payload || {};
    if (!playerId || !message) return;
    
    // Validate and sanitize
    const clean = String(message).slice(0, 200).trim();
    if (!clean) return;
    
    // Find player name
    const seat = this.table.seats.find(s => s.player?.id === playerId);
    const displayName = seat?.player?.displayName || playerId;
    
    this._broadcast(CHANNEL_EVENTS.CHAT_MESSAGE, {
      playerId,
      displayName,
      message: clean,
      timestamp: Date.now(),
    });
  }

  /** @private */
  _handleHeartbeat(payload) {
    const { playerId } = payload.payload || {};
    if (!playerId) return;
    
    this._connections.set(playerId, {
      lastHeartbeat: Date.now(),
      userId: playerId,
    });
    
    // If player was disconnected, handle reconnect
    this.table.handleReconnect(playerId);
  }

  /** @private */
  _handleStateRequest(payload) {
    const { playerId } = payload.payload || {};
    if (!playerId) return;
    
    // Send full state to requesting player
    const state = this.table.getState(playerId);
    const cards = this.table.getPlayerCards(playerId);
    
    this._sendToPlayer(playerId, CHANNEL_EVENTS.TABLE_STATE, {
      ...state,
      yourCards: cards,
    });
  }

  // ============ PRESENCE HANDLERS ============

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
    'table_state', 'hand_start', 'blinds_posted', 'cards_dealt',
    'street_start', 'action_required', 'action_processed',
    'timer_update', 'showdown', 'payout', 'hand_complete',
    'player_seated', 'player_left', 'player_sitting_out',
    'player_sitting_in', 'player_disconnected', 'player_reconnected',
    'chat_message', 'table_error', 'seat_offered',
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
