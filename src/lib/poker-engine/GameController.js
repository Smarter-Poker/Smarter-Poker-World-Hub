/**
 * 🎮 GAME CONTROLLER — Server-Side Poker Engine Orchestrator
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Singleton that manages all live poker tables. Uses globalThis to persist
 * across Next.js API route invocations and hot reloads.
 * 
 * Architecture:
 *   - LobbyManager owns all TableManager + ActionTimer + RealtimeSync + HandHistory instances
 *   - GameController wraps LobbyManager with HTTP API surface + state persistence
 *   - Supabase Realtime channels broadcast game events to connected clients
 *   - Supabase DB stores table configs + hand histories for crash recovery
 * 
 * Lifecycle:
 *   1. First API call → GameController.getInstance() → boots from DB
 *   2. Creates LobbyManager with Supabase client
 *   3. Recovers active tables from poker_tables
 *   4. Subsequent API calls reuse the same instance
 *   5. Hand completions persist to hand_histories automatically
 *   6. Table state snapshots saved periodically + on significant events
 * 
 * Usage from API routes:
 *   import { getController } from '@/lib/poker-engine/GameController';
 *   const controller = await getController();
 *   const result = controller.processAction(tableId, playerId, action);
 * ═══════════════════════════════════════════════════════════════════════════
 */

const { createClient } = require('@supabase/supabase-js');
const { LobbyManager } = require('./LobbyManager');
const { TableManager, TABLE_STATUS, SEAT_STATUS } = require('./TableManager');
const { GAME_VARIANT } = require('./GameStateMachine');
const { BETTING_STRUCTURES } = require('./ActionValidator');

// ═══════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════

const STATE_SNAPSHOT_INTERVAL_MS = 30000; // Save state every 30s
const STALE_TABLE_CHECK_MS = 60000;       // Check for stale tables every 60s
const MAX_EMPTY_TABLE_AGE_MS = 600000;    // Remove empty tables after 10 min

// Variant mapping: DB game_type → engine variant
const VARIANT_MAP = {
  // Hold'em variants
  'holdem': GAME_VARIANT.HOLDEM,
  'nlh': GAME_VARIANT.HOLDEM,
  'no_limit_holdem': GAME_VARIANT.HOLDEM,
  'texas_holdem': GAME_VARIANT.HOLDEM,
  // Fixed Limit Hold'em (plays same engine, betting structure differs)
  'flh': GAME_VARIANT.HOLDEM,
  'fixed_limit_holdem': GAME_VARIANT.HOLDEM,
  // Omaha 4-card
  'omaha': GAME_VARIANT.OMAHA4,
  'omaha4': GAME_VARIANT.OMAHA4,
  'plo': GAME_VARIANT.OMAHA4,
  'plo4': GAME_VARIANT.OMAHA4,
  'pot_limit_omaha': GAME_VARIANT.OMAHA4,
  // Fixed Limit Omaha (plays same engine, betting structure differs)
  'flo': GAME_VARIANT.OMAHA4,
  'fixed_limit_omaha': GAME_VARIANT.OMAHA4,
  // Omaha 5-card
  'omaha5': GAME_VARIANT.OMAHA5,
  'plo5': GAME_VARIANT.OMAHA5,
  // Omaha 6-card
  'omaha6': GAME_VARIANT.OMAHA6,
  'plo6': GAME_VARIANT.OMAHA6,
  // Omaha Hi-Lo
  'omaha_hi_lo': GAME_VARIANT.OMAHA_HILO,
  'omaha_hilo': GAME_VARIANT.OMAHA_HILO,
  'plo8': GAME_VARIANT.OMAHA_HILO,
  'omaha8': GAME_VARIANT.OMAHA_HILO,
  // Short Deck
  'short_deck': GAME_VARIANT.SHORT_DECK,
  '6plus': GAME_VARIANT.SHORT_DECK,
  // Mixed Game (alternates between Hold'em and Omaha, starts as Hold'em)
  'mixed': GAME_VARIANT.HOLDEM,
  'mixed_game': GAME_VARIANT.HOLDEM,
  // OFC (Open Face Chinese — uses separate scoring, mapped to Holdem engine base)
  'ofc': GAME_VARIANT.HOLDEM,
  'open_face_chinese': GAME_VARIANT.HOLDEM,
};

// Auto-detect betting structure from variant name
const VARIANT_STRUCTURE_MAP = {
  'flh': 'fixed_limit',
  'fixed_limit_holdem': 'fixed_limit',
  'flo': 'fixed_limit',
  'fixed_limit_omaha': 'fixed_limit',
  'plo': 'pot_limit',
  'plo4': 'pot_limit',
  'plo5': 'pot_limit',
  'plo6': 'pot_limit',
  'plo8': 'pot_limit',
  'omaha': 'pot_limit',
  'omaha4': 'pot_limit',
  'omaha5': 'pot_limit',
  'omaha6': 'pot_limit',
  'omaha_hilo': 'pot_limit',
  'pot_limit_omaha': 'pot_limit',
};

const STRUCTURE_MAP = {
  'no_limit': BETTING_STRUCTURES.NO_LIMIT,
  'pot_limit': BETTING_STRUCTURES.POT_LIMIT,
  'fixed_limit': BETTING_STRUCTURES.FIXED_LIMIT,
};

// ═══════════════════════════════════════════════════════════════════════════
// GAME CONTROLLER
// ═══════════════════════════════════════════════════════════════════════════

class GameController {
  constructor() {
    this.supabase = null;
    this.lobby = null;
    this.initialized = false;
    this._snapshotInterval = null;
    this._staleCheckInterval = null;
    this._bootTime = Date.now();
    this._stats = {
      handsDealt: 0,
      peakPlayers: 0,
      totalActions: 0,
    };
  }

  // ═══════════════════════════════════════════════════════════════════
  // INITIALIZATION
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Boot the game controller. Idempotent — safe to call multiple times.
   */
  async initialize() {
    if (this.initialized) return;

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url || !key) {
      console.warn('[GameController] Missing Supabase credentials — running in memory-only mode');
      this.supabase = null;
    } else {
      this.supabase = createClient(url, key, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
    }

    // Create LobbyManager
    this.lobby = new LobbyManager({ supabase: this.supabase });

    // Initialize lobby channel (broadcasts table list to /hub/poker/lobby)
    await this.lobby.initialize();

    // Recover active tables from DB
    await this._recoverTables();

    // Start background tasks
    this._snapshotInterval = setInterval(() => this._saveAllSnapshots(), STATE_SNAPSHOT_INTERVAL_MS);
    this._staleCheckInterval = setInterval(() => this._cleanupStaleTables(), STALE_TABLE_CHECK_MS);

    this.initialized = true;
    console.log(`[GameController] Initialized (${this.lobby.tables.size} tables recovered)`);
  }

  /**
   * Graceful shutdown.
   */
  async shutdown() {
    console.log('[GameController] Shutting down...');

    if (this._snapshotInterval) clearInterval(this._snapshotInterval);
    if (this._staleCheckInterval) clearInterval(this._staleCheckInterval);

    // Save final snapshots
    await this._saveAllSnapshots();

    // Destroy lobby
    if (this.lobby) {
      await this.lobby.destroy();
    }

    this.initialized = false;
    console.log('[GameController] Shutdown complete');
  }

  // ═══════════════════════════════════════════════════════════════════
  // TABLE MANAGEMENT
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Create a new table and register it with the lobby.
   * @param {Object} config
   * @returns {{ success: boolean, tableId?: string, error?: string }}
   */
  async createTable(config) {
    await this._ensureInit();

    const {
      name, variant = 'holdem', maxSeats = 9,
      smallBlind = 1, bigBlind = 2,
      minBuyIn, maxBuyIn,
      clubId = null, createdBy = null,
      ante = 0, rakePercent = 0, rakeCap = 0,
      runItTwice = false, runItThrice = false, insurance = false,
      straddle = false, bombPot = false,
    } = config;

    const sb = parseInt(smallBlind) || 1;
    const bb = parseInt(bigBlind) || sb * 2;

    // Persist to DB first to get an ID
    let tableId = null;
    if (this.supabase) {
      const { data, error } = await this.supabase
        .from('poker_tables')
        .insert({
          name: name || `${sb}/${bb} ${variant === 'holdem' ? 'NLH' : variant.toUpperCase()}`,
          game_type: variant,
          betting_structure: 'no_limit',
          table_size: Math.min(Math.max(parseInt(maxSeats) || 9, 2), 10),
          small_blind: sb,
          big_blind: bb,
          min_buy_in: parseInt(minBuyIn) || bb * 20,
          max_buy_in: parseInt(maxBuyIn) || bb * 100,
          created_by: createdBy,
          status: 'waiting',
          hand_number: 0,
          hands_played: 0,
          pot_total: 0,
          current_bet: 0,
          dealer_seat: 0,
        })
        .select('id')
        .single();

      if (error) {
        console.error('[GameController] DB insert failed:', error.message);
        tableId = `table_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      } else {
        tableId = data.id;
      }
    } else {
      tableId = `table_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    }

    // Boot engine table
    const tableConfig = {
      tableId,
      clubId,
      name: name || `${sb}/${bb} ${variant === 'holdem' ? 'NLH' : variant.toUpperCase()}`,
      tableName: name,
      variant: VARIANT_MAP[variant] || GAME_VARIANT.HOLDEM,
      bettingStructure: STRUCTURE_MAP[config.bettingStructure] || STRUCTURE_MAP[VARIANT_STRUCTURE_MAP[variant]] || BETTING_STRUCTURES.NO_LIMIT,
      maxSeats: Math.min(Math.max(parseInt(maxSeats) || 9, 2), 10),
      smallBlind: sb,
      bigBlind: bb,
      minBuyIn: parseInt(minBuyIn) || bb * 20,
      maxBuyIn: parseInt(maxBuyIn) || bb * 100,
      ante,
      rakePercent,
      rakeCap,
      runItTwice,
      runItThrice,
      insurance,
      straddle,
      bombPot,
    };

    try {
      await this.lobby.createTable(tableConfig);
      console.log(`[GameController] Table created: ${tableId}`);
      return { success: true, tableId };
    } catch (err) {
      console.error('[GameController] Engine table creation failed:', err.message);
      return { success: false, error: err.message };
    }
  }

  /**
   * Connect to a Club Arena table (from 'tables' DB).
   * If the table already has an in-memory engine instance, returns it.
   * Otherwise, reads config from the 'tables' DB and creates one.
   * This bridges Club Arena's table management with the poker engine.
   * 
   * @param {string} clubTableId - UUID from the 'tables' DB
   * @returns {{ success: boolean, tableId?: string, error?: string }}
   */
  async connectToClubTable(clubTableId) {
    await this._ensureInit();

    // Already connected?
    if (this.lobby.tables.has(clubTableId)) {
      return { success: true, tableId: clubTableId, existing: true };
    }

    // Read from Club Arena 'tables' DB
    if (!this.supabase) {
      return { success: false, error: 'No database connection' };
    }

    try {
      const { data: row, error } = await this.supabase
        .from('tables')
        .select('*')
        .eq('id', clubTableId)
        .single();

      if (error || !row) {
        return { success: false, error: error?.message || 'Table not found in club database' };
      }

      // Map Club Arena columns → engine config
      const variant = row.game_variant || row.game_type || 'nlh';
      const { getRakeConfig } = require('./RakeConfig');
      const tierConfig = getRakeConfig(row.big_blind || 2, variant);

      const config = {
        tableId: row.id,
        name: row.name,
        tableName: row.name,
        variant: VARIANT_MAP[variant] || GAME_VARIANT.HOLDEM,
        bettingStructure: this._inferBettingStructure(variant),
        maxSeats: row.max_players || 9,
        smallBlind: row.small_blind || 1,
        bigBlind: row.big_blind || 2,
        minBuyIn: row.min_buy_in || row.min_buyin || (row.big_blind || 2) * 40,
        maxBuyIn: row.max_buy_in || row.max_buyin || (row.big_blind || 2) * 200,
        ante: row.ante || 0,
        rakePercent: row.rake_percent || tierConfig.rakePercent,
        rakeCap: row.rake_cap_bb || tierConfig.rakeCapBB,
        bbjPercent: row.bbj_percent || tierConfig.bbjFeeBB,
        bbjEnabled: tierConfig.bbjEnabled && (row.bbj_percent || tierConfig.bbjFeeBB) > 0,
        clubId: row.club_id || null,
        actionTime: row.action_time_seconds || 30,
        straddleEnabled: row.settings?.straddle_enabled || false,
        runItTwice: row.settings?.run_it_twice || false,
        runItThrice: row.settings?.run_it_thrice || false,
        insurance: row.settings?.insurance || false,
      };

      await this.lobby.createTable(config);

      // Update Club Arena table status
      await this.supabase
        .from('tables')
        .update({ status: 'active' })
        .eq('id', clubTableId);

      console.log(`[GameController] Connected to club table: ${clubTableId} (${row.name})`);
      return { success: true, tableId: clubTableId, name: row.name };
    } catch (err) {
      console.error('[GameController] Club table connect failed:', err.message);
      return { success: false, error: err.message };
    }
  }

  /**
   * Infer betting structure from variant string.
   * @private
   */
  _inferBettingStructure(variant) {
    const v = (variant || '').toLowerCase();
    if (v.startsWith('plo') || v.startsWith('omaha')) return BETTING_STRUCTURES.POT_LIMIT;
    return BETTING_STRUCTURES.NO_LIMIT;
  }

  /**
   * Close/remove a table.
   * @param {string} tableId
   * @returns {{ success: boolean }}
   */
  async closeTable(tableId) {
    await this._ensureInit();

    try {
      const result = await this.lobby.closeTable(tableId);
      if (!result.success) return result;

      // Update DB
      if (this.supabase) {
        await this.supabase
          .from('poker_tables')
          .update({ status: 'closed' })
          .eq('id', tableId);
      }

      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  /**
   * List all active tables.
   * @returns {Array}
   */
  async listTables() {
    await this._ensureInit();
    return this.lobby.getTableList();
  }

  /**
   * Get a specific table's info.
   * @param {string} tableId
   * @returns {Object|null}
   */
  getTableInfo(tableId) {
    const entry = this.lobby.tables.get(tableId);
    if (!entry) return null;
    return {
      tableId,
      config: entry.config,
      playerCount: entry.table.seats.filter(s => s.status !== SEAT_STATUS.EMPTY).length,
      status: entry.table.status,
    };
  }

  // ═══════════════════════════════════════════════════════════════════
  // PLAYER ACTIONS
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Sit a player down at a table.
   * @param {string} tableId
   * @param {string} playerId
   * @param {number} seatIndex
   * @param {number} buyIn
   * @param {Object} playerInfo - { displayName, avatarUrl }
   * @returns {{ success: boolean, error?: string }}
   */
  async sitDown(tableId, playerId, seatIndex, buyIn, playerInfo = {}) {
    await this._ensureInit();

    const entry = this.lobby.tables.get(tableId);
    if (!entry) return { success: false, error: 'Table not found' };

    const result = entry.table.sitDown(playerId, seatIndex, buyIn, playerInfo);

    if (result.success) {
      // Broadcast via RealtimeSync
      this._broadcastTableState(tableId);
      this._updateTablePlayerCount(tableId);
    }

    return result;
  }

  /**
   * Player stands up from a table.
   */
  async standUp(tableId, playerId) {
    await this._ensureInit();

    const entry = this.lobby.tables.get(tableId);
    if (!entry) return { success: false, error: 'Table not found' };

    const result = entry.table.standUp(playerId);
    this._broadcastTableState(tableId);
    this._updateTablePlayerCount(tableId);
    return { success: true, cashout: result };
  }

  /**
   * Player sits out.
   */
  async sitOut(tableId, playerId) {
    await this._ensureInit();

    const entry = this.lobby.tables.get(tableId);
    if (!entry) return { success: false, error: 'Table not found' };

    entry.table.sitOut(playerId);
    return { success: true };
  }

  /**
   * Player sits back in.
   */
  async sitIn(tableId, playerId) {
    await this._ensureInit();

    const entry = this.lobby.tables.get(tableId);
    if (!entry) return { success: false, error: 'Table not found' };

    entry.table.sitIn(playerId);
    return { success: true };
  }

  /**
   * Player adds chips.
   */
  async addChips(tableId, playerId, amount) {
    await this._ensureInit();

    const entry = this.lobby.tables.get(tableId);
    if (!entry) return { success: false, error: 'Table not found' };

    return entry.table.addChips(playerId, amount);
  }

  /**
   * Process a player's game action (fold, check, call, bet, raise, all_in).
   * @param {string} tableId
   * @param {string} playerId
   * @param {Object} action - { type: string, amount?: number }
   * @returns {{ success: boolean, error?: string }}
   */
  async processAction(tableId, playerId, action) {
    await this._ensureInit();

    const entry = this.lobby.tables.get(tableId);
    if (!entry) return { success: false, error: 'Table not found' };

    // Cancel the action timer — player acted in time
    entry.timer.recordAction(playerId);
    entry.timer.cancelTurn();

    // Process through the engine
    const result = entry.table.processAction(playerId, action);

    if (result.success) {
      this._stats.totalActions++;
    }

    return result;
  }

  // ═══════════════════════════════════════════════════════════════════
  // STATE QUERIES
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Get the full table state for a specific player.
   * Private cards are only revealed for the requesting player.
   * @param {string} tableId
   * @param {string} playerId
   * @returns {Object|null}
   */
  async getTableState(tableId, playerId) {
    await this._ensureInit();

    const entry = this.lobby.tables.get(tableId);
    if (!entry) return null;

    const state = entry.table.getState(playerId);
    const cards = entry.table.getPlayerCards(playerId);

    return {
      ...state,
      yourCards: cards,
    };
  }

  /**
   * Get legal actions for the current player.
   * @param {string} tableId
   * @param {string} playerId
   * @returns {Object|null}
   */
  getPlayerActions(tableId, playerId) {
    const entry = this.lobby.tables.get(tableId);
    if (!entry) return null;

    return entry.table.getActionsForPlayer(playerId);
  }

  // ═══════════════════════════════════════════════════════════════════
  // WAITLIST
  // ═══════════════════════════════════════════════════════════════════

  async joinWaitlist(tableId, playerId, options = {}) {
    await this._ensureInit();
    const entry = this.lobby.tables.get(tableId);
    if (!entry) return { success: false, error: 'Table not found' };
    return entry.table.joinWaitlist(playerId, options);
  }

  async leaveWaitlist(tableId, playerId) {
    await this._ensureInit();
    const entry = this.lobby.tables.get(tableId);
    if (!entry) return { success: false, error: 'Table not found' };
    entry.table.leaveWaitlist(playerId);
    return { success: true };
  }

  // ═══════════════════════════════════════════════════════════════════
  // CHAT
  // ═══════════════════════════════════════════════════════════════════

  async sendChat(tableId, playerId, message) {
    await this._ensureInit();
    const entry = this.lobby.tables.get(tableId);
    if (!entry) return { success: false, error: 'Table not found' };

    // Sanitize
    const clean = String(message).slice(0, 200).trim();
    if (!clean) return { success: false, error: 'Empty message' };

    const seat = entry.table.seats.find(s => s.player?.id === playerId);
    const displayName = seat?.player?.displayName || playerId;

    // Broadcast via sync
    entry.sync._broadcast('chat_message', {
      playerId,
      displayName,
      message: clean,
      timestamp: Date.now(),
    });

    return { success: true };
  }

  // ═══════════════════════════════════════════════════════════════════
  // HEARTBEAT / CONNECTION
  // ═══════════════════════════════════════════════════════════════════

  async handleHeartbeat(tableId, playerId) {
    await this._ensureInit();
    const entry = this.lobby.tables.get(tableId);
    if (!entry) return;

    entry.sync._connections.set(playerId, {
      lastHeartbeat: Date.now(),
      userId: playerId,
    });

    // Reconnect if disconnected
    entry.table.handleReconnect(playerId);
  }

  async handleDisconnect(tableId, playerId) {
    await this._ensureInit();
    const entry = this.lobby.tables.get(tableId);
    if (!entry) return;

    entry.table.handleDisconnect(playerId);
  }

  // ═══════════════════════════════════════════════════════════════════
  // STATS
  // ═══════════════════════════════════════════════════════════════════

  getStats() {
    const tables = this.lobby ? this.lobby.tables.size : 0;
    let totalPlayers = 0;
    if (this.lobby) {
      for (const [, entry] of this.lobby.tables) {
        totalPlayers += entry.table.seats.filter(s => s.status !== SEAT_STATUS.EMPTY).length;
      }
    }
    this._stats.peakPlayers = Math.max(this._stats.peakPlayers, totalPlayers);

    return {
      uptime: Date.now() - this._bootTime,
      tables,
      totalPlayers,
      ...this._stats,
    };
  }

  // ═══════════════════════════════════════════════════════════════════
  // PRIVATE: STATE PERSISTENCE
  // ═══════════════════════════════════════════════════════════════════

  /** @private */
  async _recoverTables() {
    if (!this.supabase) return;

    try {
      const { data: tables, error } = await this.supabase
        .from('poker_tables')
        .select('*')
        .in('status', ['waiting', 'active', 'playing', 'between_hands'])
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) {
        console.warn('[GameController] Recovery query failed:', error.message);
        return;
      }

      if (!tables || tables.length === 0) {
        console.log('[GameController] No tables to recover');
        return;
      }

      for (const row of tables) {
        try {
          const config = {
            tableId: row.id,
            name: row.name,
            tableName: row.name,
            variant: VARIANT_MAP[row.game_type] || GAME_VARIANT.HOLDEM,
            bettingStructure: STRUCTURE_MAP[row.betting_structure] || BETTING_STRUCTURES.NO_LIMIT,
            maxSeats: row.table_size || 9,
            smallBlind: row.small_blind || 1,
            bigBlind: row.big_blind || 2,
            minBuyIn: row.min_buy_in || (row.big_blind || 2) * 20,
            maxBuyIn: row.max_buy_in || (row.big_blind || 2) * 100,
            ante: row.ante || 0,
            rakePercent: row.rake_percent || 0,
            rakeCap: row.rake_cap_bb || 0,
          };

          await this.lobby.createTable(config);

          // Recover seated players from snapshot if available
          if (row.settings?.snapshot?.seats) {
            const snapshot = row.settings.snapshot;
            for (const seatData of snapshot.seats) {
              if (seatData.player && seatData.status !== 'empty') {
                const entry = this.lobby.tables.get(row.id);
                if (entry) {
                  entry.table.sitDown(
                    seatData.player.id,
                    seatData.seatIndex,
                    seatData.stack,
                    { displayName: seatData.player.displayName, avatarUrl: seatData.player.avatarUrl }
                  );
                }
              }
            }
          }
        } catch (err) {
          console.error(`[GameController] Failed to recover table ${row.id}:`, err.message);
        }
      }

      console.log(`[GameController] Recovered ${tables.length} tables from DB`);
    } catch (err) {
      console.error('[GameController] Recovery failed:', err.message);
    }
  }

  /** @private */
  async _saveAllSnapshots() {
    if (!this.supabase || !this.lobby) return;

    for (const [tableId, entry] of this.lobby.tables) {
      try {
        const state = entry.table.getState(null);
        const snapshot = {
          seats: state.seats,
          handCount: entry.table.handCount,
          status: entry.table.status,
          savedAt: new Date().toISOString(),
        };

        await this.supabase
          .from('poker_tables')
          .update({
            status: entry.table.status,
            hand_number: entry.table.game?.handNumber || 0,
            hands_played: entry.table.handCount,
            settings: { snapshot },
          })
          .eq('id', tableId)
          .then(({ error }) => {
            // Fallback: if settings column doesn't exist, update without it
            if (error?.message?.includes('settings')) {
              return this.supabase
                .from('poker_tables')
                .update({
                  status: entry.table.status,
                  hand_number: entry.table.game?.handNumber || 0,
                  hands_played: entry.table.handCount,
                })
                .eq('id', tableId);
            }
          });
      } catch (err) {
        console.error(`[GameController] Snapshot save failed for ${tableId}:`, err.message);
      }
    }
  }

  /** @private */
  async _cleanupStaleTables() {
    if (!this.lobby) return;

    const now = Date.now();

    for (const [tableId, entry] of this.lobby.tables) {
      const playerCount = entry.table.seats.filter(s => s.status !== SEAT_STATUS.EMPTY).length;

      if (playerCount === 0) {
        const created = new Date(entry.config.createdAt).getTime();
        if (now - created > MAX_EMPTY_TABLE_AGE_MS) {
          console.log(`[GameController] Removing stale empty table: ${tableId}`);
          await this.closeTable(tableId);
        }
      }
    }
  }

  /** @private */
  _broadcastTableState(tableId) {
    const entry = this.lobby.tables.get(tableId);
    if (!entry || !entry.sync) return;

    // The RealtimeSync already handles broadcasting via table events.
    // This is a fallback for manual state pushes.
    entry.sync.broadcastFullState();
  }

  /** @private */
  async _updateTablePlayerCount(tableId) {
    if (!this.supabase) return;

    const entry = this.lobby.tables.get(tableId);
    if (!entry) return;

    const count = entry.table.seats.filter(s => s.status !== SEAT_STATUS.EMPTY).length;

    try {
      await this.supabase
        .from('poker_tables')
        .update({ current_players: count })
        .eq('id', tableId);
    } catch (_) {
      // Silently fail if current_players column doesn't exist yet
    }
  }

  /** @private */
  async _ensureInit() {
    if (!this.initialized) {
      await this.initialize();
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// SINGLETON via globalThis (survives Next.js hot reloads)
// ═══════════════════════════════════════════════════════════════════════════

const GLOBAL_KEY = '__POKER_GAME_CONTROLLER__';

/**
 * Get the singleton GameController instance.
 * Initializes on first call, reuses on subsequent calls.
 * @returns {Promise<GameController>}
 */
async function getController() {
  if (!globalThis[GLOBAL_KEY]) {
    globalThis[GLOBAL_KEY] = new GameController();
  }

  const controller = globalThis[GLOBAL_KEY];

  if (!controller.initialized) {
    await controller.initialize();
  }

  return controller;
}

/**
 * Get the controller synchronously (assumes already initialized).
 * @returns {GameController|null}
 */
function getControllerSync() {
  return globalThis[GLOBAL_KEY] || null;
}

module.exports = {
  GameController,
  getController,
  getControllerSync,
};
