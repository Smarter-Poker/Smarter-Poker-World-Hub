/**
 * Smarter.Poker - Core Poker Engine
 * Module: LobbyManager
 * 
 * Manages the multi-table lobby:
 *   - Table creation and destruction
 *   - Table discovery and filtering
 *   - Player tracking across tables (prevent multi-tabling if rules require)
 *   - Lobby state broadcasting via Supabase Realtime
 *   - Auto-close empty tables after timeout
 */

const { TableManager, TABLE_STATUS } = require('./TableManager');
const { ActionTimer } = require('./ActionTimer');
const { RealtimeSync } = require('./RealtimeSync');
const { HandHistoryRecorder } = require('./HandHistory');
const { GAME_VARIANT } = require('./GameStateMachine');
const { BETTING_STRUCTURES } = require('./ActionValidator');

// ============ CONSTANTS ============

const EMPTY_TABLE_TIMEOUT_MS = 300000; // 5 min before closing empty table
const LOBBY_BROADCAST_INTERVAL_MS = 5000; // Refresh lobby every 5s

// ============ LOBBY MANAGER ============

class LobbyManager {
  /**
   * @param {Object} config
   * @param {Object} config.supabase - Supabase client (server-side, service role)
   */
  constructor(config = {}) {
    this.supabase = config.supabase || null;
    
    /** @type {Map<string, { table: TableManager, sync: RealtimeSync, timer: ActionTimer, history: HandHistoryRecorder }>} */
    this.tables = new Map();
    
    /** @type {Map<string, Set<string>>} playerId → Set of tableIds */
    this.playerTables = new Map();
    
    this._emptyTimers = new Map();
    this._lobbyChannel = null;
    this._lobbyBroadcastInterval = null;
  }

  /**
   * Initialize lobby channel for broadcasting table list updates.
   */
  async initialize() {
    // Skip channel creation if no Supabase client (memory-only mode)
    if (!this.supabase) {
      console.log('[LobbyManager] No Supabase client — running without lobby broadcast');
      return;
    }

    this._lobbyChannel = this.supabase.channel('lobby', {
      config: { broadcast: { self: false } },
    });
    
    await this._lobbyChannel.subscribe();
    
    // Broadcast lobby state periodically
    this._lobbyBroadcastInterval = setInterval(() => {
      this._broadcastLobbyState();
    }, LOBBY_BROADCAST_INTERVAL_MS);
  }

  /**
   * Create a new table.
   * @param {Object} config - Table configuration
   * @param {string} config.tableId
   * @param {string} config.clubId
   * @param {string} config.tableName - Display name
   * @param {string} [config.variant]
   * @param {string} [config.bettingStructure]
   * @param {number} config.smallBlind
   * @param {number} config.bigBlind
   * @param {number} [config.ante]
   * @param {number} config.minBuyIn
   * @param {number} config.maxBuyIn
   * @param {number} [config.maxSeats]
   * @param {number} [config.turnTime] - Seconds per turn
   * @param {number} [config.timebank]
   * @param {number} [config.rakePercent]
   * @param {number} [config.rakeCap]
   * @returns {{ success: boolean, tableId?: string, error?: string }}
   */
  async createTable(config) {
    if (this.tables.has(config.tableId)) {
      return { success: false, error: 'Table ID already exists' };
    }
    
    // Create TableManager
    const table = new TableManager({
      tableId: config.tableId,
      clubId: config.clubId,
      variant: config.variant || GAME_VARIANT.HOLDEM,
      bettingStructure: config.bettingStructure || BETTING_STRUCTURES.NO_LIMIT,
      smallBlind: config.smallBlind,
      bigBlind: config.bigBlind,
      ante: config.ante,
      minBuyIn: config.minBuyIn,
      maxBuyIn: config.maxBuyIn,
      maxSeats: config.maxSeats,
      rakePercent: config.rakePercent,
      rakeCap: config.rakeCap,
    });
    
    // Create ActionTimer
    const timer = new ActionTimer({
      turnTime: config.turnTime || 30,
      timebank: config.timebank || 30,
      onExpire: (playerId) => table.autoFold(playerId),
      onTick: () => {},     // Wired by RealtimeSync
      onWarning: () => {},  // Wired by RealtimeSync
    });
    
    // Create HandHistoryRecorder
    const history = new HandHistoryRecorder({
      supabase: this.supabase,
      tableId: config.tableId,
      clubId: config.clubId,
      variant: config.variant || GAME_VARIANT.HOLDEM,
      bettingStructure: config.bettingStructure || BETTING_STRUCTURES.NO_LIMIT,
      smallBlind: config.smallBlind,
      bigBlind: config.bigBlind,
    });
    
    // Wire hand history recording to table events
    this._wireHandHistory(table, history);
    
    // Create RealtimeSync
    const sync = new RealtimeSync({
      supabase: this.supabase,
      tableId: config.tableId,
      tableManager: table,
      actionTimer: timer,
    });
    
    await sync.initialize();
    
    // Track player joins/leaves for multi-table tracking
    table.on('player_seated', (data) => {
      this._trackPlayerJoin(data.playerId, config.tableId);
    });
    table.on('player_left', (data) => {
      this._trackPlayerLeave(data.playerId, config.tableId);
    });
    
    // Store
    this.tables.set(config.tableId, {
      table,
      sync,
      timer,
      history,
      config: {
        tableId: config.tableId,
        clubId: config.clubId,
        tableName: config.tableName || config.tableId,
        variant: config.variant || GAME_VARIANT.HOLDEM,
        bettingStructure: config.bettingStructure || BETTING_STRUCTURES.NO_LIMIT,
        smallBlind: config.smallBlind,
        bigBlind: config.bigBlind,
        ante: config.ante || 0,
        minBuyIn: config.minBuyIn,
        maxBuyIn: config.maxBuyIn,
        maxSeats: config.maxSeats || 9,
        createdAt: new Date().toISOString(),
      },
    });
    
    // Broadcast lobby update
    this._broadcastLobbyState();
    
    return { success: true, tableId: config.tableId };
  }

  /**
   * Close and remove a table.
   * @param {string} tableId
   * @returns {{ success: boolean, error?: string }}
   */
  async closeTable(tableId) {
    const entry = this.tables.get(tableId);
    if (!entry) return { success: false, error: 'Table not found' };
    
    // Close table (cashes out all players)
    entry.table.close();
    
    // Clean up
    await entry.sync.destroy();
    entry.timer.destroy();
    entry.table.destroy();
    
    // Clear empty timer
    if (this._emptyTimers.has(tableId)) {
      clearTimeout(this._emptyTimers.get(tableId));
      this._emptyTimers.delete(tableId);
    }
    
    // Remove player tracking
    for (const [playerId, tables] of this.playerTables) {
      tables.delete(tableId);
      if (tables.size === 0) this.playerTables.delete(playerId);
    }
    
    this.tables.delete(tableId);
    this._broadcastLobbyState();
    
    return { success: true };
  }

  /**
   * Get a table entry by ID.
   * @param {string} tableId
   * @returns {Object|null}
   */
  getTable(tableId) {
    return this.tables.get(tableId) || null;
  }

  /**
   * Get lobby listing — all active tables with summary info.
   * @param {Object} [filters]
   * @param {string} [filters.clubId]
   * @param {string} [filters.variant]
   * @param {string} [filters.bettingStructure]
   * @param {number} [filters.minStakes] - Min big blind
   * @param {number} [filters.maxStakes] - Max big blind
   * @param {boolean} [filters.hasOpenSeats]
   * @returns {Array}
   */
  getTableList(filters = {}) {
    const list = [];
    
    for (const [tableId, entry] of this.tables) {
      const { table, config } = entry;
      
      if (table.status === TABLE_STATUS.CLOSED) continue;
      
      // Apply filters
      if (filters.clubId && config.clubId !== filters.clubId) continue;
      if (filters.variant && config.variant !== filters.variant) continue;
      if (filters.bettingStructure && config.bettingStructure !== filters.bettingStructure) continue;
      if (filters.minStakes && config.bigBlind < filters.minStakes) continue;
      if (filters.maxStakes && config.bigBlind > filters.maxStakes) continue;
      
      const seatedCount = table.seats.filter(s => 
        s.status === 'occupied' || s.status === 'sitting_out' || s.status === 'disconnected'
      ).length;
      const openSeats = config.maxSeats - seatedCount;
      
      if (filters.hasOpenSeats && openSeats <= 0) continue;
      
      // Calculate average stack
      const stacks = table.seats
        .filter(s => s.status === 'occupied' && s.stack > 0)
        .map(s => s.stack);
      const avgStack = stacks.length > 0 
        ? Math.round(stacks.reduce((a, b) => a + b, 0) / stacks.length)
        : 0;
      
      list.push({
        tableId,
        tableName: config.tableName,
        clubId: config.clubId,
        variant: config.variant,
        bettingStructure: config.bettingStructure,
        stakes: `${config.smallBlind}/${config.bigBlind}`,
        smallBlind: config.smallBlind,
        bigBlind: config.bigBlind,
        ante: config.ante,
        minBuyIn: config.minBuyIn,
        maxBuyIn: config.maxBuyIn,
        maxSeats: config.maxSeats,
        playerCount: seatedCount,
        openSeats,
        waitlistCount: table.waitlist.length,
        avgStack,
        status: table.status,
        handCount: table.handCount,
      });
    }
    
    return list;
  }

  /**
   * Get all tables a player is currently at.
   * @param {string} playerId
   * @returns {string[]} Array of tableIds
   */
  getPlayerActiveTables(playerId) {
    return Array.from(this.playerTables.get(playerId) || []);
  }

  // ============ PRIVATE ============

  /**
   * Wire hand history recording to table events.
   * @private
   */
  _wireHandHistory(table, history) {
    table.on('hand_start', (data) => {
      history.beginHand(data);
    });
    
    table.on('blinds_posted', (data) => {
      // blinds_posted emits { smallBlind: { playerId, amount }, bigBlind: { playerId, amount }, ante }
      const blinds = [];
      if (data.smallBlind) {
        blinds.push({ playerId: data.smallBlind.playerId, type: 'small_blind', amount: data.smallBlind.amount });
      }
      if (data.bigBlind) {
        blinds.push({ playerId: data.bigBlind.playerId, type: 'big_blind', amount: data.bigBlind.amount });
      }
      history.recordBlinds(blinds);
    });
    
    table.on('cards_dealt', (data) => {
      // cards_dealt event only has { id, cardCount } for privacy.
      // Pull actual cards from the table engine for hand history recording.
      if (data.players) {
        for (const p of data.players) {
          const cards = table.getPlayerCards(p.id);
          if (cards) history.recordHoleCards(p.id, cards);
        }
      }
    });
    
    table.on('street_start', (data) => {
      if (data.street && data.communityCards) {
        history.recordCommunityCards(data.street, data.communityCards);
      }
    });
    
    table.on('action_processed', (data) => {
      if (data.street && data.action) {
        history.recordAction(data.street, {
          playerId: data.playerId,
          type: data.action.type,
          amount: data.action.amount,
          auto: data.action.auto,
        });
      }
    });
    
    table.on('showdown', (data) => {
      // showdown has { players: [{ id, holeCards, hand }], communityCards, winners: [playerId] }
      // Record shown cards from showdown event
      history.recordShowdown({
        shownCards: data.players?.map(p => ({
          playerId: p.id,
          cards: p.holeCards,
          hand: p.hand,
        })) || [],
      });
    });
    
    table.on('payout', (data) => {
      // payout has { type, winners: [{ playerId, amount }], pots, rake }
      // Update winners, pots, and rake from payout event
      if (!history._currentHand) return;
      history._currentHand.winners = data.winners || [];
      history._currentHand.pots = data.pots || [];
      history._currentHand.rake = data.rake || 0;
    });
    
    table.on('hand_complete', async (data) => {
      const finalStacks = table.seats
        .filter(s => s.player)
        .map(s => ({ playerId: s.player.id, stack: s.stack }));
      
      await history.completeHand(finalStacks);
    });
  }

  /**
   * Track player joining a table.
   * @private
   */
  _trackPlayerJoin(playerId, tableId) {
    if (!this.playerTables.has(playerId)) {
      this.playerTables.set(playerId, new Set());
    }
    this.playerTables.get(playerId).add(tableId);
    
    // Clear empty timer if table was empty
    if (this._emptyTimers.has(tableId)) {
      clearTimeout(this._emptyTimers.get(tableId));
      this._emptyTimers.delete(tableId);
    }
  }

  /**
   * Track player leaving a table.
   * @private
   */
  _trackPlayerLeave(playerId, tableId) {
    const tables = this.playerTables.get(playerId);
    if (tables) {
      tables.delete(tableId);
      if (tables.size === 0) this.playerTables.delete(playerId);
    }
    
    // Check if table is now empty — start auto-close timer
    const entry = this.tables.get(tableId);
    if (entry) {
      const seatedCount = entry.table.seats.filter(s => 
        s.status === 'occupied' || s.status === 'sitting_out'
      ).length;
      
      if (seatedCount === 0 && !this._emptyTimers.has(tableId)) {
        this._emptyTimers.set(tableId, setTimeout(() => {
          this.closeTable(tableId);
        }, EMPTY_TABLE_TIMEOUT_MS));
      }
    }
  }

  /**
   * Broadcast lobby state to all connected clients.
   * @private
   */
  _broadcastLobbyState() {
    if (!this._lobbyChannel) return;
    
    const tableList = this.getTableList();
    
    this._lobbyChannel.send({
      type: 'broadcast',
      event: 'lobby_update',
      payload: {
        tables: tableList,
        totalPlayers: this.playerTables.size,
        totalTables: tableList.length,
        timestamp: Date.now(),
      },
    });
  }

  /**
   * Destroy lobby and all tables.
   */
  async destroy() {
    if (this._lobbyBroadcastInterval) {
      clearInterval(this._lobbyBroadcastInterval);
    }
    
    for (const timer of this._emptyTimers.values()) {
      clearTimeout(timer);
    }
    
    // Close all tables
    for (const tableId of this.tables.keys()) {
      await this.closeTable(tableId);
    }
    
    if (this._lobbyChannel) {
      await this.supabase.removeChannel(this._lobbyChannel);
    }
  }
}

// ============ CLIENT-SIDE LOBBY HELPER ============

/**
 * Connect to the lobby channel from the client.
 * @param {Object} supabase - Supabase client
 * @param {Object} callbacks - { onUpdate: (tables) => void }
 * @returns {Object} Lobby controller
 */
function createLobbyClient(supabase, callbacks = {}) {
  const channel = supabase.channel('lobby');
  
  channel.on('broadcast', { event: 'lobby_update' }, (payload) => {
    if (callbacks.onUpdate) callbacks.onUpdate(payload.payload);
  });
  
  channel.subscribe();
  
  return {
    channel,
    async disconnect() {
      await supabase.removeChannel(channel);
    },
  };
}

// ============ EXPORTS ============

module.exports = {
  LobbyManager,
  createLobbyClient,
  EMPTY_TABLE_TIMEOUT_MS,
};
