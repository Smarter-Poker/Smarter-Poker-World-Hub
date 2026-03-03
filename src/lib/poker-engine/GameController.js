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
 *   3. Recovers active tables from DB
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
const { TournamentController, TOURNAMENT_TYPE, TOURNAMENT_STATUS } = require('./TournamentController');
const { TournamentBridge } = require('./TournamentBridge');
const { AntiCheat } = require('./AntiCheat');
const { AntiCheatMonitor } = require('./AntiCheatMonitor');
const { ClubLedger } = require('./ClubLedger');
const HorsePokerBrain = require('./HorsePokerBrain');

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
  // Pineapple (Crazy Pineapple — 3 hole cards, discard 1 after flop)
  'pineapple': GAME_VARIANT.PINEAPPLE,
  'crazy_pineapple': GAME_VARIANT.PINEAPPLE,
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
    this.ledger = null;
    this.antiCheat = null;
    this.antiCheatMonitor = null;
    this.initialized = false;
    this._snapshotInterval = null;
    this._staleCheckInterval = null;
    this._bootTime = Date.now();
    this._tournaments = new Map(); // tournamentId → { controller, bridge }
    this._stats = {
      handsDealt: 0,
      peakPlayers: 0,
      totalActions: 0,
    };
    // Guard against double-triggering horse AI for the same player turn
    this._horseActionPending = new Set();
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

    // Create ClubLedger for tournament chip operations (payouts, rebuys, addons, bounties)
    this.ledger = new ClubLedger({ supabase: this.supabase });

    // Initialize lobby channel (broadcasts table list to /hub/poker/lobby)
    await this.lobby.initialize();

    // Recover active tables from DB
    await this._recoverTables();

    // Start background tasks
    this._snapshotInterval = setInterval(() => this._saveAllSnapshots(), STATE_SNAPSHOT_INTERVAL_MS);
    this._staleCheckInterval = setInterval(() => this._cleanupStaleTables(), STALE_TABLE_CHECK_MS);

    // ─── Anti-Cheat Background Monitor ──────────────────────────────
    // Fully automated. No manual approvals. Scans every 30s, auto-boots.
    this.antiCheat = new AntiCheat(this.supabase);
    this.antiCheatMonitor = new AntiCheatMonitor(this, this.antiCheat, this.supabase);
    this.antiCheatMonitor.start();

    // ─── Horse AI Brain — Pre-load horse identities ──────────────────
    HorsePokerBrain.loadHorseIds().catch(err => {
      console.warn('[GameController] Horse ID pre-load failed:', err.message);
    });

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

    // Stop anti-cheat monitor
    if (this.antiCheatMonitor) this.antiCheatMonitor.stop();
    if (this.antiCheat) this.antiCheat.cleanup();

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
        .from('tables')
        .insert({
          club_id: clubId,
          name: name || `${sb}/${bb} ${variant === 'holdem' ? 'NLH' : variant.toUpperCase()}`,
          game_type: 'cash',
          game_variant: variant === 'holdem' ? 'nlh' : variant,
          stakes: `${sb}/${bb}`,
          max_players: Math.min(Math.max(parseInt(maxSeats) || 9, 2), 10),
          small_blind: sb,
          big_blind: bb,
          min_buy_in: parseInt(minBuyIn) || bb * 20,
          max_buy_in: parseInt(maxBuyIn) || bb * 100,
          created_by: createdBy,
          status: 'waiting',
          current_players: 0,
          settings: {},
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
      autoUtgStraddle: config.autoUtgStraddle || false,
      voluntaryStraddle: config.voluntaryStraddle || false,
      bombPot,
    };

    try {
      await this.lobby.createTable(tableConfig);
      this._wireHorseAI(tableId);
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
        autoUtgStraddle: row.settings?.auto_utg_straddle || false,
        voluntaryStraddle: row.settings?.voluntary_straddle || row.settings?.straddle_enabled || false,
        straddle: row.settings?.straddle_enabled || false,
        runItTwice: row.settings?.run_it_twice || false,
        runItThrice: row.settings?.run_it_thrice || false,
        runItMode: row.settings?.run_it_mode || 'none',
        insurance: row.settings?.insurance || false,
        // Game modes
        noRathole: row.settings?.no_rathole || false,
        sevenDeuce: row.settings?.seven_deuce || false,
        nitGame: row.settings?.nit_game || false,
        maintainPercent: Number(row.settings?.maintain_percent) || 0,
        maintainHands: Number(row.settings?.maintain_hands) || 10,
        bombPot: row.settings?.bomb_pot_enabled || row.settings?.bomb_pot || false,
        // Muck, cap, privacy settings
        autoMuck: row.settings?.auto_muck !== false, // default true
        capAmount: Number(row.settings?.cap_amount) || 0,
        doubleBoard: row.settings?.double_board || false,
        tripleBoard: row.settings?.triple_board || false,
        anonymousTable: row.settings?.anonymous_table || false,
        privateGame: row.settings?.private_game || false,
        vipOnly: row.settings?.vip_only || false,
        // Anti-cheat settings from Club Arena table configuration
        clubSettings: {
          ip_restriction: row.settings?.ip_restriction !== false, // default ON
          gps_restriction: row.settings?.gps_restriction !== false, // default ON
          restrict_device: row.settings?.restrict_device !== false, // default ON
          emulator_restriction: row.settings?.emulator_restriction || false,
          same_agent_downline_limit: row.settings?.same_agent_downline_limit || 0,
          restrict_observers: row.settings?.restrict_observers || false,
          buy_in_authorization: row.settings?.buy_in_authorization || false,
          photo_rotation_verification: row.settings?.photo_rotation_verification || false,
          gps_min_distance_meters: row.settings?.gps_min_distance_meters || 100,
          game_length_hours: row.settings?.game_length_hours || 0,
          career_percent: Number(row.settings?.career_percent) || 0,
          auto_create_table: row.settings?.auto_create_table || false,
          auto_extension: row.settings?.auto_extension || false,
          ban_chat: row.settings?.ban_chat || false,
          mixed_game: row.settings?.mixed_game || false,
          variant_rotation: row.settings?.variant_rotation || null,
          auto_restart: row.settings?.auto_restart || false,
        },
      };

      await this.lobby.createTable(config);
      this._wireHorseAI(clubTableId);

      // Update Club Arena table status
      await this.supabase
        .from('tables')
        .update({ status: 'running' })
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
    // Use the explicit mapping first
    if (VARIANT_STRUCTURE_MAP[v]) {
      return STRUCTURE_MAP[VARIANT_STRUCTURE_MAP[v]] || BETTING_STRUCTURES.NO_LIMIT;
    }
    // Fallback: prefix detection
    if (v.startsWith('plo') || v.includes('omaha')) return BETTING_STRUCTURES.POT_LIMIT;
    if (v.startsWith('fl') || v.includes('fixed_limit')) return BETTING_STRUCTURES.FIXED_LIMIT;
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

      // Clear AI session tracking
      HorsePokerBrain.clearTableSessions(tableId);

      // Update DB
      if (this.supabase) {
        await this.supabase
          .from('tables')
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
      // Track AI sessions (Phase 2 feature)
      HorsePokerBrain.recordSitDown(tableId, playerId, buyIn);

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
    // Return the result directly — it already has { success, cashout } or { success, pending }
    return result;
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
   * Admin kicks a player from the table.
   */
  async kickPlayer(tableId, targetPlayerId, reason = 'admin_kick') {
    await this._ensureInit();
    const entry = this.lobby.tables.get(tableId);
    if (!entry) return { success: false, error: 'Table not found' };

    const result = entry.table.kickPlayer(targetPlayerId, reason);
    if (result.success) {
      this._broadcastTableState(tableId);
      this._updateTablePlayerCount(tableId);
    }
    return result;
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
   * Declare voluntary straddle for next hand.
   */
  declareStraddle(tableId, playerId) {
    const entry = this.lobby.tables.get(tableId);
    if (!entry) return { success: false, error: 'Table not found' };
    return entry.table.declareStraddle(playerId);
  }

  /**
   * Cancel voluntary straddle declaration.
   */
  cancelStraddle(tableId, playerId) {
    const entry = this.lobby.tables.get(tableId);
    if (!entry) return { success: false, error: 'Table not found' };
    return entry.table.cancelStraddle(playerId);
  }

  /**
   * Set auto-rebuy preference for a player at a table.
   */
  setAutoRebuy(tableId, playerId, enabled) {
    const entry = this.lobby.tables.get(tableId);
    if (!entry) return { success: false, error: 'Table not found' };
    return entry.table.setAutoRebuy(playerId, enabled);
  }

  /**
   * Set auto top-up preference for a player at a table.
   * @param {string} tableId
   * @param {string} playerId
   * @param {boolean|number} value - true = top up to max buy-in, number = specific target, false = off
   */
  setAutoTopUp(tableId, playerId, value) {
    const entry = this.lobby.tables.get(tableId);
    if (!entry) return { success: false, error: 'Table not found' };
    return entry.table.setAutoTopUp(playerId, value);
  }

  /**
   * Invite a player to a private table.
   */
  invitePlayer(tableId, playerId) {
    const entry = this.lobby.tables.get(tableId);
    if (!entry) return { success: false, error: 'Table not found' };
    return entry.table.invitePlayer(playerId);
  }

  /**
   * Approve a pending buy-in authorization request.
   */
  approveBuyIn(tableId, playerId) {
    const entry = this.lobby.tables.get(tableId);
    if (!entry) return { success: false, error: 'Table not found' };
    return entry.table.approveBuyIn(playerId);
  }

  /**
   * Reject a pending buy-in authorization request.
   */
  rejectBuyIn(tableId, playerId) {
    const entry = this.lobby.tables.get(tableId);
    if (!entry) return { success: false, error: 'Table not found' };
    return entry.table.rejectBuyIn(playerId);
  }

  /**
   * Respond to a run-it-twice/thrice offer.
   * @param {string} tableId
   * @param {string} playerId
   * @param {string} choice — 'twice' | 'thrice' | 'decline'
   */
  respondRunIt(tableId, playerId, choice) {
    const entry = this.lobby.tables.get(tableId);
    if (!entry) return { success: false, error: 'Table not found' };
    return entry.table.respondRunIt(playerId, choice);
  }

  /**
   * Process Pineapple discard — player discards 1 of 3 hole cards after flop.
   */
  processDiscard(tableId, playerId, cardIndex) {
    const entry = this.lobby.tables.get(tableId);
    if (!entry) return { success: false, error: 'Table not found' };
    return entry.table.processDiscard(playerId, cardIndex);
  }

  /**
   * Player adds chips.
   */
  async addChips(tableId, playerId, amount) {
    await this._ensureInit();

    const entry = this.lobby.tables.get(tableId);
    if (!entry) return { success: false, error: 'Table not found' };

    const result = entry.table.addChips(playerId, amount);
    if (result.success) {
      // Track AI rebuy/add-on stats (Phase 2 feature)
      HorsePokerBrain.recordRebuy(tableId, playerId, amount);
    }
    return result;
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

    // IMPORTANT: Cancel the timer FIRST to prevent _expire() from firing
    // between here and the engine's processAction. Then record timebank usage.
    // recordAction needs _startTime which cancelTurn clears, so capture first.
    const timerWasActive = entry.timer._currentPlayerId === String(playerId);
    entry.timer.recordAction(playerId);
    entry.timer.cancelTurn();

    // If the timer already expired for this player (race: _expire fired
    // during _ensureInit await), the engine will have already auto-folded.
    // Don't double-process.
    if (!timerWasActive) {
      // Timer wasn't tracking this player — likely already expired/auto-folded
      // Still try the action; engine will reject if it's not their turn
    }

    // Process through the engine
    const result = entry.table.processAction(playerId, action);

    if (result.success) {
      this._stats.totalActions++;
    }

    return result;
  }

  // ═══════════════════════════════════════════════════════════════════
  // HORSE AI — Auto-action system for AI players
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Execute an AI horse's poker decision.
   * 1. Guards against double-triggering with _horseActionPending
   * 2. Reads game state (with horse's hole cards visible)
   * 3. Calls HorsePokerBrain.getDecision() for GTO-informed action
   * 4. Waits for human-like timing delay
   * 5. Submits the action through the normal pipeline
   * 
   * @param {string} tableId
   * @param {string} playerId - Horse profile UUID
   * @private
   */
  async _triggerHorseAction(tableId, playerId) {
    // Guard: prevent double-trigger for same player at same table
    const key = `${tableId}:${playerId}`;
    if (this._horseActionPending.has(key)) return;
    this._horseActionPending.add(key);

    try {
      const entry = this.lobby.tables.get(tableId);
      if (!entry) return;

      // Get full game state (with horse's own cards visible)
      const game = entry.table.game;
      if (!game) return;

      const engineState = game.getState(playerId);
      if (!engineState) return;

      // Verify it's still this horse's turn
      const currentPlayerId = game.bettingRound?.getCurrentPlayer()?.id;
      if (String(currentPlayerId) !== String(playerId)) return;

      // Get legal actions from the engine
      const actionsInfo = game.getCurrentActions();
      if (!actionsInfo || !actionsInfo.actions || actionsInfo.actions.length === 0) return;

      // Build table config for the brain
      const tableConfig = {
        bigBlind: entry.config?.bigBlind || game.config?.bigBlind || 2,
        smallBlind: entry.config?.smallBlind || game.config?.smallBlind || 1,
      };

      // Get the AI decision
      const { action, delayMs } = await HorsePokerBrain.getDecision(
        playerId,
        engineState,
        actionsInfo.actions,
        tableConfig
      );

      // Wait for human-like delay
      await new Promise(resolve => setTimeout(resolve, delayMs));

      // Verify it's STILL this horse's turn after the delay
      const game2 = entry.table.game;
      if (!game2 || !game2.bettingRound) return;
      const currentPlayerId2 = game2.bettingRound.getCurrentPlayer()?.id;
      if (String(currentPlayerId2) !== String(playerId)) return;

      // Submit the action through the normal pipeline
      // (Cancel timer first, matching the processAction flow)
      entry.timer.recordAction(playerId);
      entry.timer.cancelTurn();

      const result = entry.table.processAction(playerId, action);

      if (result.success) {
        this._stats.totalActions++;
        console.log(`[HorseAI] ${playerId.substring(0, 8)}... \u2192 ${action.type}${action.amount ? ' ' + action.amount : ''} (${delayMs}ms delay)`);
      } else {
        console.warn(`[HorseAI] Action rejected for ${playerId.substring(0, 8)}...: ${result.error}`);
      }
    } catch (err) {
      console.error(`[HorseAI] _triggerHorseAction error:`, err.message);
    } finally {
      this._horseActionPending.delete(key);
    }
  }

  /**
   * Wire horse AI event listener to a table.
   * Listens for 'action_required' so the brain triggers on hand/street start
   * when the first-to-act player is a horse.
   * @param {string} tableId
   * @private
   */
  _wireHorseAI(tableId) {
    const entry = this.lobby.tables.get(tableId);
    if (!entry) return;

    entry.table.on('action_required', (data) => {
      if (data?.playerId) {
        // Non-blocking check: is this an AI horse?
        HorsePokerBrain.isHorse(String(data.playerId)).then(isAI => {
          if (isAI) {
            this._triggerHorseAction(tableId, String(data.playerId)).catch(err => {
              console.error(`[HorseAI] action_required trigger failed:`, err.message);
            });
          }
        }).catch(() => { });
      }
    });

    // Evaluate horse sessions at the end of every hand (Phase 2)
    entry.table.on('hand_complete', () => {
      HorsePokerBrain.evaluateSessions(this, entry.table).catch(err => {
        console.error(`[HorseAI] evaluateSessions failed:`, err.message);
      });
    });
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

  /**
   * Voluntarily show cards after a hand.
   */
  async showCards(tableId, playerId) {
    await this._ensureInit();
    const entry = this.lobby.tables.get(tableId);
    if (!entry) return { success: false, error: 'Table not found' };
    const result = entry.table.game?.voluntaryShowCards?.(playerId);
    if (!result) return { success: false, error: 'No active hand' };
    return result;
  }

  async sendChat(tableId, playerId, message) {
    await this._ensureInit();
    const entry = this.lobby.tables.get(tableId);
    if (!entry) return { success: false, error: 'Table not found' };

    // Ban chat enforcement
    const settings = entry.config?.clubSettings || {};
    if (settings.ban_chat) {
      return { success: false, error: 'Chat is disabled at this table' };
    }

    // Sanitize
    const clean = String(message).slice(0, 200).trim();
    if (!clean) return { success: false, error: 'Empty message' };

    const seat = entry.table.seats.find(s => s.player?.id === playerId);

    // Anonymous table: hide real name
    let displayName;
    if (entry.table.anonymousTable) {
      const seatIdx = seat?.seatIndex ?? '?';
      displayName = `Player ${seatIdx + 1}`;
    } else {
      displayName = seat?.player?.displayName || playerId;
    }

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
  // TOURNAMENTS
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Create a tournament.
   */
  async createTournament(config) {
    await this._ensureInit();
    const {
      name, clubId, unionId, type = 'mtt', variant = 'nlh',
      buyIn = 100, startingChips = 10000, maxPlayers = 100,
      maxTableSize = 9, blindStructure, lateRegLevels = 6,
      rebuyEnabled = false, rebuyLevels = 4, maxRebuys = 1,
      rebuyCost, rebuyChips, addonEnabled = false, addonCost, addonChips,
      guaranteedPrize = 0, payoutStructure, sngSize = 6,
      levelDuration = 15, actionTime = 30, timeBankSeconds = 30,
      autoStartDelay = 3000, breakSchedule,
      // Bounty config
      bountyType = 'none', bountyAmount = 0,
      mysteryThreshold = 0, mysteryTiers,
    } = config;

    let tournamentId = `tournament_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    if (this.supabase) {
      try {
        const { data, error } = await this.supabase
          .from('club_tournaments')
          .insert({
            name, club_id: clubId, union_id: unionId, type, variant,
            buy_in: buyIn, starting_chips: startingChips, max_players: maxPlayers,
            status: 'registering',
            settings: {
              maxTableSize, blindStructure, lateRegLevels, rebuyEnabled, rebuyLevels, maxRebuys,
              rebuyCost, rebuyChips, addonEnabled, addonCost, addonChips,
              guaranteedPrize, payoutStructure, sngSize, levelDuration, actionTime, timeBankSeconds, autoStartDelay, breakSchedule,
              bountyType, bountyAmount, mysteryThreshold, mysteryTiers
            },
          })
          .select('id').single();
        if (!error && data) tournamentId = data.id;
      } catch (err) { console.error('[GameController] Tournament DB insert:', err.message); }
    }

    const controller = new TournamentController({
      tournamentId, name, clubId, unionId,
      tournamentType: TOURNAMENT_TYPE[type?.toUpperCase()] || TOURNAMENT_TYPE.MTT,
      variant: VARIANT_MAP[variant] || 'holdem',
      buyIn, startingChips, maxPlayers, maxTableSize, blindStructure, lateRegLevels,
      allowsRebuys: rebuyEnabled, rebuyEndLevel: rebuyLevels, maxRebuys,
      rebuyCost: rebuyCost || buyIn, rebuyChips: rebuyChips || startingChips,
      allowsAddon: addonEnabled, addonCost, addonChips: addonChips || startingChips,
      guaranteedPrize, payoutStructure, sngSize,
      levelDuration: (levelDuration || 15) * 60000, actionTime: (actionTime || 30) * 1000,
      timeBankSeconds: (timeBankSeconds || 30) * 1000, autoStartDelay: autoStartDelay || 3000,
      breakSchedule,
      // Bounty config
      bountyType, bountyAmount, mysteryThreshold, mysteryTiers,
      // Club chip ledger — handles payouts, rebuys, addons, bounty credits
      ledger: this.ledger,
    });

    const bridge = new TournamentBridge(controller, this.lobby, this.supabase);
    bridge.wire();
    this._tournaments.set(tournamentId, { controller, bridge });
    console.log(`[GameController] Tournament created: ${tournamentId} (${name})`);
    return { success: true, tournamentId };
  }

  async registerForTournament(tournamentId, playerId, playerName, options = {}) {
    await this._ensureInit();
    const entry = this._tournaments.get(tournamentId);
    if (!entry) return { success: false, error: 'Tournament not found' };
    return entry.controller.registerPlayer(playerId, playerName, options);
  }

  async unregisterFromTournament(tournamentId, playerId) {
    await this._ensureInit();
    const entry = this._tournaments.get(tournamentId);
    if (!entry) return { success: false, error: 'Tournament not found' };
    return entry.controller.unregisterPlayer(playerId);
  }

  async startTournament(tournamentId) {
    await this._ensureInit();
    const entry = this._tournaments.get(tournamentId);
    if (!entry) return { success: false, error: 'Tournament not found' };
    return entry.controller.startTournament();
  }

  async tournamentRebuy(tournamentId, playerId) {
    await this._ensureInit();
    const entry = this._tournaments.get(tournamentId);
    if (!entry) return { success: false, error: 'Tournament not found' };
    return entry.controller.rebuy(playerId);
  }

  async tournamentAddon(tournamentId, playerId) {
    await this._ensureInit();
    const entry = this._tournaments.get(tournamentId);
    if (!entry) return { success: false, error: 'Tournament not found' };
    return entry.controller.addon(playerId);
  }

  getTournamentState(tournamentId) {
    const entry = this._tournaments.get(tournamentId);
    if (!entry) return null;
    return entry.bridge.getState();
  }

  listTournaments() {
    return [...this._tournaments.entries()].map(([id, entry]) => ({
      tournamentId: id, name: entry.controller.name, status: entry.controller.status,
      type: entry.controller.tournamentType, players: entry.controller.entries?.size || 0,
      tables: entry.controller.tables.size, currentLevel: entry.controller.currentLevel,
    }));
  }

  async cancelTournament(tournamentId) {
    await this._ensureInit();
    const entry = this._tournaments.get(tournamentId);
    if (!entry) return { success: false, error: 'Tournament not found' };

    const t = entry.controller;
    const clubId = t.clubId;

    // ── Refund all active/registered entries ──
    // Players who haven't been eliminated or cancelled get full buy-in back
    let refunded = 0;
    let refundErrors = 0;
    if (this.supabase && clubId) {
      for (const [playerId, e] of t.entries) {
        if (e.status === 'cancelled') continue;
        const refundAmount = e.totalInvested || (t.buyinAmount + t.buyinFee);
        if (refundAmount <= 0) continue;
        try {
          const { error: creditErr } = await this.supabase.rpc('fn_credit_chips', {
            p_club_id: e.clubId || clubId,
            p_user_id: playerId,
            p_amount: refundAmount,
          });
          if (!creditErr) {
            await this.supabase.from('chip_transactions').insert({
              club_id: e.clubId || clubId,
              to_user_id: playerId,
              amount: refundAmount,
              transaction_type: 'tournament_payout',
              notes: `Tournament cancelled — full refund (${t.name || tournamentId})`,
            });
            refunded++;
          } else {
            console.error(`[cancelTournament] Refund failed for ${playerId}:`, creditErr.message);
            refundErrors++;
          }
        } catch (err) {
          console.error(`[cancelTournament] Refund error for ${playerId}:`, err.message);
          refundErrors++;
        }
      }
    }

    // Persist cancelled status
    t.status = 'cancelled';
    t.emit('tournament_cancelled', { tournamentId, refunded, refundErrors });

    entry.bridge.destroy();
    this._tournaments.delete(tournamentId);
    console.log(`[GameController] Tournament ${tournamentId} cancelled — ${refunded} refunds issued`);
    return { success: true, refunded, refundErrors };
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
        .from('tables')
        .select('*')
        .in('status', ['waiting', 'running', 'paused'])
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

      const { StateSerializer } = require('./StateSerializer');

      for (const row of tables) {
        try {
          const config = {
            tableId: row.id,
            clubId: row.club_id,
            name: row.name,
            tableName: row.name,
            variant: VARIANT_MAP[row.game_variant] || GAME_VARIANT.HOLDEM,
            bettingStructure: this._inferBettingStructure(row.game_variant || 'nlh'),
            maxSeats: row.max_players || 9,
            smallBlind: row.small_blind || 1,
            bigBlind: row.big_blind || 2,
            minBuyIn: row.min_buy_in || (row.big_blind || 2) * 20,
            maxBuyIn: row.max_buy_in || (row.big_blind || 2) * 100,
            ante: row.ante || 0,
            rakePercent: row.rake_percent || 0,
            rakeCap: row.rake_cap_bb || 0,
            actionTime: row.action_time_seconds || 30,
            // Club settings (same as connectToClubTable)
            straddleEnabled: row.settings?.straddle_enabled || false,
            autoUtgStraddle: row.settings?.auto_utg_straddle || false,
            voluntaryStraddle: row.settings?.voluntary_straddle || row.settings?.straddle_enabled || false,
            straddle: row.settings?.straddle_enabled || false,
            runItTwice: row.settings?.run_it_twice || false,
            runItThrice: row.settings?.run_it_thrice || false,
            runItMode: row.settings?.run_it_mode || 'none',
            insurance: row.settings?.insurance || false,
            noRathole: row.settings?.no_rathole || false,
            sevenDeuce: row.settings?.seven_deuce || false,
            nitGame: row.settings?.nit_game || false,
            maintainPercent: Number(row.settings?.maintain_percent) || 0,
            maintainHands: Number(row.settings?.maintain_hands) || 10,
            bombPot: row.settings?.bomb_pot_enabled || row.settings?.bomb_pot || false,
            autoMuck: row.settings?.auto_muck !== false,
            capAmount: Number(row.settings?.cap_amount) || 0,
            doubleBoard: row.settings?.double_board || false,
            tripleBoard: row.settings?.triple_board || false,
            anonymousTable: row.settings?.anonymous_table || false,
            privateGame: row.settings?.private_game || false,
            vipOnly: row.settings?.vip_only || false,
            clubSettings: {
              ip_restriction: row.settings?.ip_restriction !== false,
              gps_restriction: row.settings?.gps_restriction !== false,
              restrict_device: row.settings?.restrict_device !== false,
              mixed_game: row.settings?.mixed_game || false,
              variant_rotation: row.settings?.variant_rotation || null,
            },
          };

          await this.lobby.createTable(config);
          this._wireHorseAI(row.id);

          // Try mid-hand recovery from live_state + private hole cards
          if (row.live_state && row.live_state.savedAt) {
            const entry = this.lobby.tables.get(row.id);
            if (entry) {
              // MUST use loadFromDB to merge hole cards from hand_private_state
              // raw row.live_state has holeCards: null for security
              const fullState = await StateSerializer.loadFromDB(row.id, this.supabase);
              const recovered = fullState ? StateSerializer.restore(entry.table, fullState) : false;
              if (recovered) {
                console.log(`[GameController] Mid-hand recovered: ${row.id}`);
                continue; // Skip snapshot recovery
              }
            }
          }

          // Fallback: recover seated players from snapshot
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

        // Store snapshot + hand tracking in settings JSONB
        const currentSettings = entry.config?.clubSettings || {};
        await this.supabase
          .from('tables')
          .update({
            status: entry.table.status === 'RUNNING' ? 'running' :
              entry.table.status === 'WAITING' ? 'waiting' :
                (entry.table.status || 'running').toLowerCase(),
            settings: {
              ...currentSettings,
              _snapshot: snapshot,
              _hand_number: entry.table.game?.handNumber || 0,
              _hands_played: entry.table.handCount,
            },
          })
          .eq('id', tableId);
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
        .from('tables')
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
