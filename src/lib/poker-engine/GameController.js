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
// 2026-07-20 club-arena retirement: the tournament controller + bridge classes
// were removed. Tournaments run exclusively on the Club Arena engine (Hetzner)
// against the canonical `tournaments` table; the World Hub engine's tournament
// subsystem wrote to the legacy `club_tournaments` table (dead since 2026-03).
// createTournament now returns a clear error and _recoverTournaments is a
// no-op. Archived copies: archive/legacy-club-tournaments/.
const { AntiCheat } = require('./AntiCheat');
const { AntiCheatMonitor } = require('./AntiCheatMonitor');
const { ClubLedger } = require('./ClubLedger');
const HorsePokerBrain = require('./brain');
const { HealthWatchdog } = require('./HealthWatchdog');
const { tracker: performanceTracker } = require('./PerformanceTracker');
const { resilientQuery, resilientMutation } = require('./SupabaseResilience');

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
    // Bomb Pot frequency counters — per-table hand count for random bomb pot triggering
    this._bombPotCounters = new Map();
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

    // Recover active tournaments from DB
    await this._recoverTournaments();

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

    // ─── Horse AI Heartbeat — Fully Autonomous Pipeline ──────────────
    // Runs every 60 seconds to continuously ensure tables and tournaments are populated
    this._horsePipelineInterval = setInterval(() => this._runHorsePipeline(), 60000);

    // ─── Phase 48f: Health Watchdog — Zero-Intervention System Monitor ──
    this.healthWatchdog = new HealthWatchdog({
      gameController: this,
      supabase: this.supabase,
      lobby: this.lobby,
    });
    this.healthWatchdog.start();

    // ─── Phase 48f: Performance Tracker — Available globally ────────────
    this.performanceTracker = performanceTracker;

    // ─── Phase 48f: Multi-Table Coordination Lock ──────────────────────
    // Prevents the same horse from being in _triggerHorseAction on multiple
    // tables simultaneously. Ensures one decision completes before the next.
    this._horseGlobalLock = new Map(); // horseId → Promise<void>

    this.initialized = true;
    console.debug(`[GameController] Initialized (${this.lobby.tables.size} tables recovered)`);
  }

  /**
   * Graceful shutdown.
   */
  async shutdown() {
    console.debug('[GameController] Shutting down...');

    if (this._snapshotInterval) clearInterval(this._snapshotInterval);
    if (this._staleCheckInterval) clearInterval(this._staleCheckInterval);
    if (this._horsePipelineInterval) clearInterval(this._horsePipelineInterval);

    // Stop anti-cheat monitor
    if (this.antiCheatMonitor) this.antiCheatMonitor.stop();
    if (this.antiCheat) this.antiCheat.cleanup();

    // Stop health watchdog
    if (this.healthWatchdog) this.healthWatchdog.destroy();

    // Phase 48f: End all active performance tracker sessions on shutdown
    try {
      const activeSessions = performanceTracker.getAllSessions();
      for (const session of activeSessions) {
        const stats = performanceTracker.endSession(session.horseId, session.tableId);
        if (stats && this.supabase) {
          await performanceTracker.persistSessionStats(this.supabase, stats).catch(e => console.warn('[App] Handled promise rejection:', e?.message || e));
        }
      }
    } catch (_) { console.warn('[App] Handled exception:', _?.message || _); }

    // Save final snapshots
    await this._saveAllSnapshots();

    // Destroy lobby
    if (this.lobby) {
      await this.lobby.destroy();
    }

    this.initialized = false;
    console.debug('[GameController] Shutdown complete');
  }

  /**
   * The core autonomic heartbeat for the Horse AI system.
   * Continuously scans active games and registering tournaments, 
   * populating them with horses as needed without human intervention.
   * @private
   */
  async _runHorsePipeline() {
    try {
      const now = Date.now();
      const horseIds = await HorsePokerBrain.loadHorseIds();

      // ─── GAP 8: 9:00 AM CST Daily Reload ───
      const cstDateStr = new Date(now).toLocaleString('en-US', { timeZone: 'America/Chicago' });
      const cstDate = new Date(cstDateStr);
      const todayStr = cstDateStr.split(',')[0];

      if (cstDate.getHours() >= 9) {
        if (this._lastReloadDate !== todayStr) {
          this._lastReloadDate = todayStr;
          await this._processDailyHorseReload(horseIds);
        }
      }

      // 1. Auto-fill cash tables & Watchdog Sweep
      for (const [tableId, entry] of this.lobby.tables.entries()) {
        const table = entry.table;
        const seats = table?.seats || [];

        let occupied = 0;
        let requiresHeal = false;

        for (const seat of seats) {
          if (!seat.player || seat.status === 'empty') continue;
          occupied++;

          // ─── WATCHDOG: Self-Healing Anomalies (Gap 5) ───
          if (horseIds.has(seat.player.id)) {
            const playerId = seat.player.id;

            // Anomaly 1: Sitting Out Zombie (> 5 mins)
            if (seat.status === 'sitting_out') {
              seat._sitOutTime = seat._sitOutTime || now;
              if (now - seat._sitOutTime > 5 * 60000) {
                console.debug(`[HorseAI Watchdog] 🧟 Zombie removed: ${playerId.substring(0, 8)} sitting out > 5m on ${tableId}`);
                // Phase 48f: End session + persist stats on ALL exit paths
                const zombieStats = performanceTracker.endSession(playerId, tableId);
                if (zombieStats && this.supabase) {
                  performanceTracker.persistSessionStats(this.supabase, zombieStats).catch(e => console.warn('[App] Handled promise rejection:', e?.message || e));
                }
                this.standUp(tableId, playerId);
                requiresHeal = true;
              }
            } else {
              seat._sitOutTime = null; // reset if back
            }

            // Anomaly 2: Zero-Chip Zombie (Failed to rebuy)
            if (seat.stack === 0 && table.game && !table.game.handInProgress) {
              console.debug(`[HorseAI Watchdog] 💸 Zero-Chip removed: ${playerId.substring(0, 8)} busted on ${tableId}`);
              // Phase 48f: End session + persist stats on ALL exit paths
              const bustedStats = performanceTracker.endSession(playerId, tableId);
              if (bustedStats && this.supabase) {
                performanceTracker.persistSessionStats(this.supabase, bustedStats).catch(e => console.warn('[App] Handled promise rejection:', e?.message || e));
              }
              this.standUp(tableId, playerId);
              requiresHeal = true;
            }

            // Anomaly 3: Action Stall (> 60s without acting)
            const game = table.game;
            if (game?.bettingRound && String(game.bettingRound.getCurrentPlayer()?.id) === String(playerId)) {
              // Phase 48f FIX #15: Track stall per-player, not globally on timer
              // Use a Map keyed by playerId to avoid stale timestamps from previous hands
              if (!entry._horseStallTracker) entry._horseStallTracker = new Map();
              const tracker = entry._horseStallTracker;
              if (!tracker.has(playerId)) tracker.set(playerId, now);
              const stallStart = tracker.get(playerId);
              if (now - stallStart > 60000) {
                console.warn(`[HorseAI Watchdog] ⏱️ Stall detected: ${playerId.substring(0, 8)} frozen > 60s on ${tableId}. Forcing fold.`);
                table.processAction(playerId, { type: 'fold' });
                tracker.delete(playerId);
                requiresHeal = true;
              }
            } else {
              // Phase 48f FIX #15: Clear stall tracker when horse is NOT the current player
              if (entry._horseStallTracker) entry._horseStallTracker.delete(playerId);
            }
            // Phase 48f: Session Management (#7) — Check if horse should leave
            if (!table.game?.handInProgress) {
              const leaveCheck = performanceTracker.shouldLeaveTable(playerId, tableId);
              if (leaveCheck.shouldLeave) {
                console.debug(`[HorseAI Session] 🚪 ${playerId.substring(0, 8)} leaving ${tableId}: ${leaveCheck.reason}`);
                const sessionStats = performanceTracker.endSession(playerId, tableId);
                if (sessionStats && this.supabase) {
                  performanceTracker.persistSessionStats(this.supabase, sessionStats).catch(e => console.warn('[App] Handled promise rejection:', e?.message || e));
                }
                this.standUp(tableId, playerId);
                requiresHeal = true;
              }
            }
          }
        }

        // Re-count after watchdog purges
        if (requiresHeal) occupied = table.seats.filter(s => s.player && s.status !== 'empty').length;

        // Auto-fill active tables 
        const target = Math.min(entry.config?.maxPlayers || 9, 6); // Aim for 6 players
        if (occupied < target && table.status !== 'paused') {
          await this.fillTableWithHorses(tableId, target);
        }
      }

      // 2. Auto-register & Manage Tournaments (Bulletproof Overlay Protection)
      for (const [tournamentId, entry] of this._tournaments.entries()) {
        const t = entry.controller;

        // Use t.status (not t.state)
        const isRegistering = t.status === 'registering';
        const isLateReg = t.status === 'late_reg' || (t.status === 'running' && t.currentLevel <= (t.lateRegLevels || 0));

        // ─── BULLETPROOF OVERLAY DEFENSE ───
        // Re-calculate live overlay Amount on every tick to perfectly calibrate response.
        const overlayAmount = (t.guaranteedPrize || 0) > 0 ? t.guaranteedPrize - (t.prizePool || 0) : 0;

        // 1. Weaponized Rebuys & Add-ons (Active Defense & Base 100% Addons)
        if (t.entries) {
          for (const [playerId, pEntry] of t.entries.entries()) {
            if (!horseIds.has(playerId)) continue;

            // Auto-Rebuy (Only forced if busted AND we still have an overlay to cover)
            if (overlayAmount > 0 && t.allowsRebuys && pEntry.status === 'busted_rebuy') {
              console.debug(`[HorseAI Defense] 🔥 Forcing rebuy for ${playerId.substring(0, 8)} to cover overlay on ${tournamentId}`);
              await t.processRebuy(playerId);
            }
            // Auto-Addon (ALWAYS executed 100% of the time during break, completely ignoring overlayAmount)
            else if (t.allowsAddon && t.status === 'break' && pEntry.status === 'active' && !pEntry.addonTaken) {
              console.debug(`[HorseAI] ➕ 100% Add-On Mandate: Forcing Add-on for ${playerId.substring(0, 8)} on ${tournamentId}`);
              await t.processAddon(playerId);
            }
          }
        }

        // 2. Late Registration Flooding & Desperation Curve (Passive Defense)
        if (isRegistering || isLateReg) {
          const currentEntries = t.entries?.size || 0;
          let target = Math.min(t.maxPlayers || 100, 30); // Base fill aim
          let batchSize = Math.floor(Math.random() * 3) + 1; // Normal trickle

          if (overlayAmount > 0) {
            const buyIn = t.buyinAmount || 1;
            const shortfallEntries = Math.ceil(overlayAmount / buyIn);

            // Target adjusts to exactly cover shortfall, bounded by table max.
            target = Math.min(t.maxPlayers || 100, currentEntries + shortfallEntries);

            // ─── Desperation Curve ───
            // If we are in the absolute final level of late registration, panic and dump the rest instantly.
            const isDesperate = isLateReg && t.currentLevel >= Math.max(1, t.lateRegLevels || 0);

            if (isDesperate) {
              batchSize = shortfallEntries; // Immediate mass dump
              console.warn(`[HorseAI Defense] 🚨 DESPERATION CURVE ACTIVATED on ${tournamentId}. Dumping ${batchSize} horses instantly to kill overlay.`);
            } else {
              batchSize = Math.min(shortfallEntries, Math.floor(Math.random() * 6) + 3); // Faster trickle of 3-8
            }
          } else if (isLateReg) {
            // Guarantee fully met! Stop all late reg insertion to preserve server AI balance.
            target = 0;
          }

          // Trigger registration if we are below target capacity.
          if (currentEntries < target) {
            await this.autoRegisterHorses(tournamentId, batchSize);
          }
        }
      }
    } catch (err) {
      console.warn(`[HorseAI] Pipeline Heartbeat failed:`, err.message);
    }
  }

  /**
   * Bankrolls all horses with 50k chips each morning at 9am.
   * Runs exactly once per day via the heartbeat.
   * @private
   */
  async _processDailyHorseReload(horseIds) {
    if (!this.supabase || !horseIds || horseIds.size === 0) return;
    console.debug(`[HorseAI] 🏦 Executing 9:00 AM Daily Bankroll Reload for ${horseIds.size} horses`);
    try {
      // ─── AUDIT 13 Fix: UPSERT into all active clubs ───
      // Horses aren't always explicitly invited to clubs, so their ledger rows might not exist.
      // We find all clubs currently running tables, and ensure every horse has a 50k ledger.
      const activeClubIds = new Set();
      for (const entry of this.lobby.tables.values()) {
        if (entry.config?.clubId) activeClubIds.add(entry.config.clubId);
      }

      if (activeClubIds.size === 0) {
        console.debug('[HorseAI] 🏦 No active clubs found to reload horses into.');
        return;
      }

      let reloaded = 0;
      for (const clubId of activeClubIds) {
        const updates = Array.from(horseIds).map(horseId => ({
          club_id: clubId,
          user_id: horseId, // SCHEMA: club_members uses user_id, not profile_id
          role: 'member',
          status: 'approved',
          chip_balance: 50000,
          updated_at: new Date().toISOString()
        }));

        // Bulk upsert for performance
        const { error } = await this.supabase
          .from('club_members')
          .upsert(updates, { onConflict: 'club_id,user_id' });

        if (!error) {
          reloaded += updates.length;
        } else {
          console.warn(`[HorseAI] Failed to upsert ledgers for club ${clubId}:`, error.message);
        }
      }
      console.debug(`[HorseAI] 🏦 Daily reload complete. Successfully refreshed ${reloaded} horse ledgers across ${activeClubIds.size} clubs.`);
    } catch (err) {
      console.warn('[HorseAI] Daily reload failed:', err.message);
    }
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
        .maybeSingle();

      if (error) {
        console.warn('[GameController] DB insert failed:', error.message);
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
      console.debug(`[GameController] Table created: ${tableId}`);
      return { success: true, tableId };
    } catch (err) {
      console.warn('[GameController] Engine table creation failed:', err.message);
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
        .maybeSingle();

      if (error || !row) {
        return { success: false, error: error?.message || 'Table not found in club database' };
      }

      // Map Club Arena columns → engine config
      const variant = row.game_variant || row.game_type || 'nlh';
      const { getRakeConfig } = require('./RakeConfig');
      const tierConfig = getRakeConfig(row.big_blind || 2, variant, row.small_blind);

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
        bombPotFrequency: parseInt(row.settings?.bomb_pot_frequency) || 0, // N = every Nth hand is bomb pot
        bombPotAnteMultiplier: Math.max(1, parseInt(row.settings?.bomb_pot_ante_multiplier) || 2), // Nx BB per player
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

      // ─── MID-HAND RECOVERY ──────────────────────────────────────────
      // If this table has a serialized live_state, restore it now.
      // This covers the ensureTable() path (individual on-demand cold-start).
      // _recoverTables() at startup handles batch recovery, but any table
      // created after startup or missed in the batch query hits this path instead.
      if (row.live_state && row.live_state.savedAt) {
        const { StateSerializer } = require('./StateSerializer');
        const entry = this.lobby.tables.get(clubTableId);
        if (entry) {
          try {
            const fullState = await StateSerializer.loadFromDB(clubTableId, this.supabase);
            const recovered = fullState ? StateSerializer.restore(entry.table, fullState) : false;
            if (recovered) {
              console.debug(`[GameController] connectToClubTable: mid-hand state restored for ${clubTableId}`);
              // Resume Horse AI if it was their turn when server crashed
              const game = entry.table.game;
              if (game?.bettingRound) {
                const currPlayer = game.bettingRound.getCurrentPlayer();
                if (currPlayer) {
                  HorsePokerBrain.isHorse(String(currPlayer.id)).then(isAI => {
                    if (isAI) this._triggerHorseAction(clubTableId, currPlayer.id);
                  }).catch(e => console.warn('[App] Handled promise rejection:', e?.message || e));
                }
              }
            }
          } catch (err) {
            console.warn(`[GameController] Mid-hand restore failed for ${clubTableId}:`, err.message);
          }
        }
      } else if (row.settings?.snapshot?.seats?.length > 0) {
        // ─── BETWEEN-HAND RECOVERY ────────────────────────────────────
        // No live_state (between hands) but we have a seat snapshot.
        // Restore seated players so they don't lose their spots.
        const snapshot = row.settings.snapshot;
        const entry = this.lobby.tables.get(clubTableId);
        if (entry) {
          for (const seatData of snapshot.seats) {
            if (seatData.player && seatData.status !== 'empty' && seatData.stack > 0) {
              try {
                entry.table.sitDown(
                  seatData.player.id,
                  seatData.seatIndex,
                  seatData.stack,
                  { displayName: seatData.player.displayName, avatarUrl: seatData.player.avatarUrl }
                );
              } catch (_) { console.warn('[App] Handled exception:', _?.message || _); }
            }
          }
          console.debug(`[GameController] connectToClubTable: restored ${snapshot.seats.length} seats from snapshot for ${clubTableId}`);
        }
      }

      // Update Club Arena table status
      const { error: err_tables_uc9b7 } = await this.supabase
        .from('tables')
        .update({ status: 'running' })
        .eq('id', clubTableId);
      if (err_tables_uc9b7) console.warn('[Supabase] Silent mutation failed in tables:', err_tables_uc9b7.message);

      console.debug(`[GameController] Connected to club table: ${clubTableId} (${row.name})`);
      return { success: true, tableId: clubTableId, name: row.name };
    } catch (err) {
      console.warn('[GameController] Club table connect failed:', err.message);
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

      // Phase 48f: End all active performance sessions for this table
      try {
        const allSessions = performanceTracker.getAllSessions();
        for (const sess of allSessions) {
          if (sess.tableId === tableId) {
            const stats = performanceTracker.endSession(sess.horseId, sess.tableId);
            if (stats && this.supabase) {
              await performanceTracker.persistSessionStats(this.supabase, stats).catch(e => console.warn('[App] Handled promise rejection:', e?.message || e));
            }
          }
        }
      } catch (_) { console.warn('[App] Handled exception:', _?.message || _); }

      // Clear AI session tracking
      HorsePokerBrain.clearTableSessions(tableId);
      // Clear live observer data for this table
      HorsePokerBrain.clearTableLiveObservers(tableId);

      // Update DB (Phase 48f: resilient mutation)
      if (this.supabase) {
        await resilientMutation(this.supabase, () =>
          this.supabase
            .from('tables')
            .update({ status: 'closed' })
            .eq('id', tableId)
        );
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
      // Track AI sessions ONLY for horses (Phase 2 feature)
      HorsePokerBrain.isHorse(String(playerId)).then(isAI => {
        if (isAI) HorsePokerBrain.recordSitDown(tableId, String(playerId), buyIn);
      }).catch(e => console.warn('[App] Handled promise rejection:', e?.message || e));

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

    // Phase 48f: Safety net — end any active PerformanceTracker session on standUp
    // This catches manual standups or any exit path that didn't explicitly end the session
    try {
      const existingSession = performanceTracker.getSession(playerId, tableId);
      if (existingSession) {
        const stats = performanceTracker.endSession(playerId, tableId);
        if (stats && this.supabase) {
          performanceTracker.persistSessionStats(this.supabase, stats).catch(e => console.warn('[App] Handled promise rejection:', e?.message || e));
        }
      }
    } catch (_) { console.warn('[App] Handled exception:', _?.message || _); }

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
      // Track AI rebuy/add-on stats ONLY for horses (Phase 2 feature)
      HorsePokerBrain.isHorse(String(playerId)).then(isAI => {
        if (isAI) HorsePokerBrain.recordRebuy(tableId, String(playerId), amount);
      }).catch(e => console.warn('[App] Handled promise rejection:', e?.message || e));
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

    // Phase 48f: Multi-Table Coordination (#8)
    // If this horse is deciding on another table, wait for that to finish first.
    // This prevents timing out on Table A while tanking on Table B.
    const existingLock = this._horseGlobalLock?.get(playerId);
    if (existingLock) {
      try { await Promise.race([existingLock, new Promise(r => setTimeout(r, 10000))]); }
      catch (_) { console.warn('[App] Handled exception:', _?.message || _); }
    }
    let _resolveLock;
    const lockPromise = new Promise(r => { _resolveLock = r; });
    this._horseGlobalLock?.set(playerId, lockPromise);

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
        console.debug(`[HorseAI] ${playerId.substring(0, 8)}... \u2192 ${action.type}${action.amount ? ' ' + action.amount : ''} (${delayMs}ms delay)`);

        // Check for AI Emotes/Chat (#10) - Emote when all-in or throwing good luck
        const messages = HorsePokerBrain.getChatMessages();
        if (messages.length > 0 && entry.sync) {
          for (const msg of messages) {
            if (String(msg.playerId) !== String(playerId)) continue;

            if (msg.type === 'gif') {
              // Broadcast as a GIF event — frontend picks a GIF via the tag keyword
              entry.sync._broadcast('table_gif', {
                playerId: msg.playerId,
                tag: msg.message,   // e.g. 'good luck', 'all in', 'lets go'
                timestamp: Date.now()
              });
            } else {
              // Words-only chat message
              entry.sync._broadcast('chat_message', {
                playerId: msg.playerId,
                message: msg.message,
                timestamp: Date.now()
              });
            }
          }
        }
      } else {
        console.warn(`[HorseAI] Action rejected for ${playerId.substring(0, 8)}...: ${result.error}`);
      }
    } catch (err) {
      console.warn(`[HorseAI] _triggerHorseAction error:`, err.message);
    } finally {
      this._horseActionPending.delete(key);
      // Phase 48f: Release multi-table coordination lock
      if (_resolveLock) _resolveLock();
      this._horseGlobalLock?.delete(playerId);
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

    // ═══════════════════════════════════════════════════════════════════
    // ██  ALWAYS-ON LIVE OBSERVER — hand_start hook  ██
    // Notify all horses at this table that a new hand is starting.
    // This resets in-hand tracking and increments handsObserved.
    // ═══════════════════════════════════════════════════════════════════
    entry.table.on('hand_start', (data) => {
      try {
        const players = data.players || [];
        const horseIds = HorsePokerBrain.getHorseIdsAtTable(players);
        if (horseIds.length > 0) {
          const bb = entry.config?.bigBlind || entry.table.bigBlind || 2;
          HorsePokerBrain.observeNewHand(tableId, data.handId || `${tableId}_${data.handNumber}`, players, horseIds, bb);
        }
      } catch (err) {
        console.warn(`[LiveObserver] hand_start hook failed:`, err.message);
      }
    });

    // ═══════════════════════════════════════════════════════════════════
    // ██  ALWAYS-ON LIVE OBSERVER — action_processed hook  ██
    // Every single player action at this table is observed by ALL horses.
    // This is the core "always watching" pipeline — zero latency, synchronous.
    // ═══════════════════════════════════════════════════════════════════
    entry.table.on('action_processed', (data) => {
      try {
        const game = entry.table.game;
        if (!game || !data?.playerId || !data?.action) return;

        const players = game.currentHand?.players || [];
        const horseIds = HorsePokerBrain.getHorseIdsAtTable(players);
        if (horseIds.length === 0) return;

        const actorId = String(data.playerId);
        const street = data.street || game.phase || 'preflop';
        const actionType = data.action?.type || data.action || 'unknown';
        const amount = data.action?.amount || 0;
        const potSize = data.potTotal || game.potCalculator?.totalPot || 0;
        const currentBet = data.currentBet || 0;

        // Find the actor's position and calculate context
        const actorPlayer = players.find(p => String(p.id) === actorId);
        const position = actorPlayer?.position || '';

        // Calculate timing: how long since the last action_required was emitted for this player
        // (The ActionTimer tracks this, but we can approximate from the timestamp diff)
        const timerEntry = entry.timer;
        const decisionTimeMs = timerEntry?._lastActionDuration || 0;

        // Determine context for preflop tracking
        const isOpenAction = street === 'preflop' && !actorPlayer?.invested;
        const raiseCount = game.bettingRound?.raiseCount || 0;

        HorsePokerBrain.observeAction(
          tableId,
          actorId,
          street,
          actionType,
          {
            amount,
            potSize,
            toCall: Math.max(0, currentBet - (actorPlayer?.invested || 0)),
            decisionTimeMs,
            position,
            isOpenAction,
            facingRaiseCount: raiseCount,
          },
          horseIds
        );

        // Phase 48f: Record hand progress for stuck-hand detection
        if (this._healthWatchdog) {
          const handKey = `${tableId}_hand${game.handNumber || 0}`;
          this._healthWatchdog.recordHandProgress(tableId, handKey);
        }

        // Phase 48f: Record opponent timing for bot detection
        if (decisionTimeMs > 0) {
          for (const hId of horseIds) {
            if (hId !== actorId) {
              performanceTracker.recordOpponentTiming(actorId, decisionTimeMs);
            }
          }
        }
      } catch (err) { console.warn('[App] Handled exception:', err?.message || err); }
    });

    // ═══════════════════════════════════════════════════════════════════
    // ██  ALWAYS-ON LIVE OBSERVER — showdown hook  ██
    // When cards are revealed, feed showdown data to all observing horses.
    // ═══════════════════════════════════════════════════════════════════
    entry.table.on('showdown', (data) => {
      try {
        const game = entry.table.game;
        const players = game?.currentHand?.players || [];
        const horseIds = HorsePokerBrain.getHorseIdsAtTable(players);
        if (horseIds.length === 0) return;

        const showdownPlayers = data.players || [];
        const winnerIds = new Set(
          (data.winners || []).map(w => String(w.playerId || w))
        );

        for (const sp of showdownPlayers) {
          const pid = String(sp.id);
          const won = winnerIds.has(pid);
          // Estimate hand strength from ranking (if available)
          const handRank = sp.hand?.rank || 0;
          // Convert rank to approximate strength: 1 (high card) = 15, 8 (straight flush) = 95
          const handStrength = Math.min(95, 10 + handRank * 10);

          // Detect bluff: aggressive final action + weak hand
          const playerActions = game?.currentHand?.actions?.filter(a => String(a.playerId) === pid) || [];
          const lastAction = playerActions[playerActions.length - 1];
          const wasAggressive = lastAction && ['bet', 'raise', 'all_in'].includes(lastAction.action?.type);
          const wasBluff = wasAggressive && handStrength < 35;

          HorsePokerBrain.observeShowdown(tableId, pid, won, handStrength, wasBluff, horseIds);
        }
      } catch (err) {
        console.warn(`[LiveObserver] showdown hook failed:`, err.message);
      }
    });

    entry.table.on('action_required', (data) => {
      if (data?.playerId) {
        // Non-blocking check: is this an AI horse?
        HorsePokerBrain.isHorse(String(data.playerId)).then(isAI => {
          if (isAI) {
            this._triggerHorseAction(tableId, String(data.playerId)).catch(err => {
              console.warn(`[HorseAI] action_required trigger failed:`, err.message);
            });
          }
        }).catch(e => console.warn('[App] Handled promise rejection:', e?.message || e));
      }
    });

    // Evaluate horse sessions at the end of every hand (Phase 2)
    // Process hand results for tilt + showdown tracking (Phase 3A)
    entry.table.on('hand_complete', (data) => {
      const bb = entry.table.bigBlind || 2;
      HorsePokerBrain.processHandResult(data, bb).catch(err => {
        console.warn(`[HorseAI] processHandResult failed:`, err.message);
      });
      HorsePokerBrain.evaluateSessions(this, entry.table).catch(err => {
        console.warn(`[HorseAI] evaluateSessions failed:`, err.message);
      });

      // Phase 48f: Record hand results in PerformanceTracker for all horses at table
      try {
        const players = entry.table.game?.currentHand?.players || data.players || [];
        const horseIds = HorsePokerBrain.getHorseIdsAtTable(players);
        for (const hId of horseIds) {
          const playerData = players.find(p => String(p.id) === String(hId));
          if (playerData) {
            performanceTracker.recordHand(hId, tableId, {
              chipDelta: playerData.netResult || 0,
              vpip: playerData.vpip || false,
              pfr: playerData.pfr || false,
              wonHand: playerData.wonHand || false,
              wentToShowdown: playerData.wentToShowdown || false,
              rakePaid: playerData.rakePaid || 0,
            });
          }
        }
      } catch (perfErr) {
        console.warn(`[PerformanceTracker] recordHand failed:`, perfErr.message);
      }

      // ═══ BOMB POT FREQUENCY TRIGGER ═══
      const freq = entry.config?.bombPotFrequency || 0;
      if (freq > 0) {
        const count = (this._bombPotCounters.get(tableId) || 0) + 1;
        this._bombPotCounters.set(tableId, count);
        // Write to the TableManager's game.config so startNextHand() can read it
        const gameConfig = entry.table?.game?.config;
        if (gameConfig) gameConfig.bombPotFrequency = freq;
        if (count >= freq) {
          this._bombPotCounters.set(tableId, 0);
          // Flag the next hand as a bomb pot on the engine's config
          if (gameConfig) gameConfig.bombPotTriggered = true;
          console.debug(`[GameController] 💣 Bomb Pot triggered on ${tableId} (every ${freq} hands)`);
        } else {
          if (gameConfig) gameConfig.bombPotTriggered = false;
        }
      }
    });

    // Auto-fill table with horses after wiring (non-blocking)
    this.fillTableWithHorses(tableId).catch(err => {
      console.warn(`[HorseAI] Auto-fill failed for ${tableId}:`, err.message);
    });
  }

  /**
   * Auto-fill a table with horse AI players to reach an ideal player count.
   * Queries horse profiles, filters by personality preferences, and seats them.
   * @param {string} tableId
   * @param {number} targetCount - How many horses to add (default: fill to 6 players)
   * @returns {{ success: boolean, seated: number }}
   */
  async fillTableWithHorses(tableId, targetCount = null) {
    await this._ensureInit();

    const entry = this.lobby.tables.get(tableId);
    if (!entry) return { success: false, error: 'Table not found', seated: 0 };

    // Count current players + empty seats
    const seats = entry.table.seats || [];
    const maxSeats = entry.config?.maxPlayers || seats.length || 9;
    const occupiedSeats = seats.filter(s => s.status !== 'empty' && s.player).length;
    const emptySeats = seats
      .map((s, i) => ({ seat: s, index: i }))
      .filter(({ seat }) => seat.status === 'empty' || !seat.player);

    // Determine how many horses to add
    const targetPlayers = targetCount || Math.min(maxSeats, 6); // Default: fill to 6
    const horsesNeeded = Math.max(0, targetPlayers - occupiedSeats);

    if (horsesNeeded === 0 || emptySeats.length === 0) {
      return { success: true, seated: 0 };
    }

    // ─── AUDIT 14: RESOURCE EXHAUSTION GUARD ───
    // If humans are deliberately holding the table hostage by maxing timebanks,
    // the hands-per-hour will collapse. Horses refuse to sit at maliciously slow tables.
    const createdAt = new Date(entry.config?.createdAt || Date.now());
    const elapsedMinutes = (Date.now() - createdAt.getTime()) / 60000;

    if (elapsedMinutes > 15) { // Only judge after table has been open 15 mins
      const handsPlayed = entry.table.handCount || 0;
      const handsPerHour = (handsPlayed / elapsedMinutes) * 60;

      // Normal online poker is 40-70. If it drops below 15, it's a hostage situation.
      if (handsPerHour < 15) {
        console.warn(`[HorseAI] 🛑 Refusing to seat horses at ${tableId}: Table is incredibly slow (${handsPerHour.toFixed(1)} HPH). Hostage guard engaged.`);
        return { success: false, error: 'Table too slow', seated: 0 };
      }
    }

    // Get all horse IDs
    const horseIds = await HorsePokerBrain.loadHorseIds();
    if (!horseIds || horseIds.size === 0) {
      return { success: false, error: 'No horse profiles found', seated: 0 };
    }

    // Get table stakes for personality filtering & min buyin validation
    const bigBlind = entry.config?.bigBlind || 2;
    const clubId = entry.config?.clubId;
    const minBuyIn = bigBlind * 20;

    // ─── GAP 7: Enforce True Bankrolls  ───
    // Horses MUST have at least the minimum buy-in inside their physical club_members account.
    const sb = this.supabase;
    let horseProfiles = [];
    if (sb && clubId) {
      const { data } = await sb
        .from('club_members')
        .select(`
          chip_balance,
          user_id,
          profiles!inner ( id, alias, avatar_url )
        `)
        .eq('club_id', clubId)
        .gt('chip_balance', minBuyIn)
        .limit(100);

      horseProfiles = (data || [])
        .filter(row => row.profiles && horseIds.has(row.user_id))
        .map(row => ({
          id: row.user_id,
          alias: row.profiles.alias || null,
          avatar_url: row.profiles.avatar_url || null,
          balance: row.chip_balance
        }));
    } else {
      // Fallback: use IDs without names (only if entirely disconnected, very rare)
      horseProfiles = [...horseIds].map(id => ({ id, alias: `Horse ${id.substring(0, 6)}`, avatar_url: null, balance: Infinity }));
    }

    // Phase 48f FIX #16: Use Fisher-Yates shuffle instead of biased sort comparator
    const shuffled = [...horseProfiles];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    // Filter by personality preferences and seat them
    let seated = 0;
    const personalityModule = await this._getPersonalityModule();

    for (const horse of shuffled) {
      if (seated >= horsesNeeded || emptySeats.length === 0) break;

      // Skip horses already at this table
      const alreadySeated = seats.some(s => s.player?.id === horse.id);
      if (alreadySeated) continue;

      // Check personality fit (stakes preference, active hours, etc.)
      if (personalityModule?.shouldSitAtTable) {
        const decision = personalityModule.shouldSitAtTable(horse.id, bigBlind, occupiedSeats + seated);
        if (!decision.shouldSit) continue;
      }

      // Find next empty seat
      const seatSlot = emptySeats.shift();
      if (!seatSlot) break;

      // Calculate buy-in (100BB standard, or max they have if < 100BB)
      const idealBuyIn = bigBlind * 100;
      const buyIn = Math.min(idealBuyIn, horse.balance);

      // ─── AUDIT 13: Wire into Physical Economy (Lock Chips) ───
      // The API layer normally does this, but autonomous seating bypasses the API.
      // We MUST lock chips so the LobbyManager cashOut failsafe recognizes the session.
      if (clubId) {
        const ChipBridge = require('./ChipBridge');
        const lockResult = await ChipBridge.lockChips(clubId, horse.id, tableId, buyIn);
        if (!lockResult.success) {
          console.warn(`[HorseAI] Failed to physically lock chips for ${horse.id} at ${tableId}:`, lockResult.error);
          continue; // Skip this horse if they can't lock chips
        }
      }

      const result = entry.table.sitDown(horse.id, seatSlot.index, buyIn, {
        displayName: horse.alias || `Horse ${horse.id.substring(0, 6)}`,
        avatarUrl: horse.avatar_url || null,
      });

      if (result.success) {
        seated++;
        HorsePokerBrain.recordSitDown(tableId, horse.id, buyIn);
        // Phase 48f: Start performance tracking session
        const variant = entry.config?.variant || 'holdem';
        performanceTracker.startSession(horse.id, tableId, variant, bigBlind, buyIn);
        console.debug(`[HorseAI] 🐴 ${horse.alias || horse.id.substring(0, 8)} seated at ${tableId} (seat ${seatSlot.index}) physically locking ${buyIn} chips!`);
      } else if (clubId) {
        // Rollback physical lock if memory table rejects them
        const ChipBridge = require('./ChipBridge');
        await ChipBridge.unlockChips(clubId, horse.id, tableId, buyIn);
      }
    }

    if (seated > 0) {
      this._broadcastTableState(tableId);
      this._updateTablePlayerCount(tableId);
      console.debug(`[HorseAI] ✅ Auto-filled ${seated} horses at table ${tableId}`);
    }

    return { success: true, seated };
  }

  /**
   * Auto-register horse AI players for a tournament.
   * @param {string} tournamentId
   * @param {number} maxCount - Max horses to register (default: fill to capacity)
   * @returns {{ success: boolean, registered: number }}
   */
  async autoRegisterHorses(tournamentId, maxCount = null) {
    await this._ensureInit();

    const entry = this._tournaments.get(tournamentId);
    if (!entry) return { success: false, error: 'Tournament not found', registered: 0 };

    const t = entry.controller;
    const currentEntries = t.entries?.size || 0;
    const maxPlayers = t.maxPlayers || 100;
    const slotsAvailable = maxPlayers - currentEntries;
    const horsesToRegister = maxCount ? Math.min(maxCount, slotsAvailable) : slotsAvailable;

    if (horsesToRegister <= 0) return { success: true, registered: 0 };

    // Get horse profiles and verify they have the money (Phase 2)
    const sb = this.supabase;
    if (!sb) return { success: false, error: 'No Supabase client', registered: 0 };

    const clubId = entry.config?.clubId;
    const buyIn = entry.config?.buyIn || 0;

    // We need to load all known horse IDs from the Brain first
    const horseIds = await HorsePokerBrain.loadHorseIds();
    if (!horseIds || horseIds.size === 0) {
      return { success: false, error: 'No horse profiles found in Brain', registered: 0 };
    }

    let horseProfiles = [];

    if (clubId) {
      const { data } = await sb
        .from('club_members')
        .select(`
        chip_balance,
        user_id,
        profiles!inner ( id, alias, avatar_url )
      `)
        .eq('club_id', clubId)
        .gte('chip_balance', buyIn)
        .limit(100);

      horseProfiles = (data || [])
        .filter(row => row.profiles && horseIds.has(row.user_id))
        .map(row => ({
          id: row.user_id,
          alias: row.profiles.alias || null,
          avatar_url: row.profiles.avatar_url || null,
          balance: row.chip_balance
        }));
    } else {
      // Global fallback (very rare)
      const { data } = await sb
        .from('profiles')
        .select('id, alias, avatar_url')
        .eq('is_horse', true)
        .limit(100);
      horseProfiles = data || [];
    }

    if (!horseProfiles || horseProfiles.length === 0) {
      return { success: false, error: 'No horse profiles with sufficient funds', registered: 0 };
    }

    // Phase 48f FIX #16: Use Fisher-Yates shuffle instead of biased sort comparator
    const shuffled = [...horseProfiles];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    let registered = 0;

    // Phase 2: Filter by stakes preference
    const personalityModule = await this._getPersonalityModule();

    for (const horse of shuffled) {
      if (registered >= horsesToRegister) break;

      // Skip already registered
      if (t.entries?.has(horse.id)) continue;

      // Phase 2: Check personality fit (stakes preference)
      if (personalityModule?.shouldSitAtTable) {
        // We pass the tournament buyIn as the "stakes" metric.
        // We pass 1 for current players to bypass the "empty table" hesitance.
        const decision = personalityModule.shouldSitAtTable(horse.id, buyIn, 1);
        if (!decision.shouldSit) continue;
      }

      const result = await t.registerPlayer(horse.id, horse.alias || `Horse ${horse.id.substring(0, 6)}`, { clubId });
      if (result.success) {
        registered++;

        // Deep Bug Hunt Parity Fix: the React UI queries `tournament_registrations` for the roster,
        // so we must manually persist the AI horse here just like the human API does.
        try {
          await sb.from('tournament_registrations').insert({
            tournament_id: tournamentId,
            user_id: horse.id,
            club_id: clubId,
            status: 'registered',
            registered_at: new Date().toISOString()
          });
        } catch (dbErr) {
          console.warn(`[HorseAI] Failed to persist UI registration for ${horse.id}:`, dbErr.message);
        }

        // We don't need ChipBridge locking here; TournamentController.registerPlayer handles `ledger.deductBuyin` natively.
        console.debug(`[HorseAI] 🏆 ${horse.alias || horse.id.substring(0, 8)} registered for tournament ${tournamentId} for ${buyIn} chips`);
      } else {
        console.warn(`[HorseAI] Failed to register ${horse.id.substring(0, 8)}: ${result.error}`);
      }
    }

    console.debug(`[HorseAI] ✅ Auto-registered ${registered} horses for tournament ${tournamentId}`);
    return { success: true, registered };
  }

  /** @private — Lazy-load personality module */
  async _getPersonalityModule() {
    try {
      return await import('../../content-engine/services/HorsePokerPersonality.js').then(m => m.default || m);
    } catch {
      return null;
    }
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

    // Merge tournament-specific config from lobby registration
    // (TournamentBridge registers tables with isTournament/tournamentName/buyIn
    //  in the lobby config, but TableManager doesn't store them on itself)
    if (entry.config?.isTournament && state.config) {
      state.config.isTournament = true;
      state.config.tournamentId = entry.config.tournamentId || null;
      state.config.tournamentName = entry.config.tournamentName || null;
      state.config.buyIn = entry.config.buyIn || 0;
    }

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

  async showOneCard(tableId, playerId, cardIndex) {
    await this._ensureInit();
    const entry = this.lobby.tables.get(tableId);
    if (!entry) return { success: false, error: 'Table not found' };
    const result = entry.table.game?.showOneCard?.(playerId, cardIndex);
    if (!result) return { success: false, error: 'No active hand or method not available' };
    return result;
  }

  /**
   * Request rabbit hunt cards — peek at remaining board cards from the last hand.
   * Only available after a fold win (hand ended before showdown).
   * @param {string} tableId
   * @param {string} playerId - Must be seated at the table
   * @returns {{ success: boolean, rabbitCards?: Array, boardAtEnd?: Array }}
   */
  requestRabbit(tableId, playerId) {
    const entry = this.lobby.tables.get(tableId);
    if (!entry) return { success: false, error: 'Table not found' };

    // Verify the player is seated
    const seat = entry.table.seats.find(s =>
      s.player && String(s.player.id) === String(playerId) && s.status !== 'empty'
    );
    if (!seat) return { success: false, error: 'Not seated at this table' };

    // Get the last hand result from the game engine
    const lastHand = entry.table.game?.currentHand;
    const lastResult = lastHand?.result;

    if (!lastResult) {
      return { success: false, error: 'No recent hand result available' };
    }

    if (lastResult.type !== 'fold') {
      return { success: false, error: 'Rabbit hunt only available after fold wins' };
    }

    const rabbitCards = lastResult.rabbitCards || [];
    const boardAtEnd = lastResult.boardAtEnd || [];

    if (rabbitCards.length === 0) {
      // If rabbitCards wasn't stored (hand ended on river), nothing to show
      return { success: true, rabbitCards: [], boardAtEnd };
    }

    return { success: true, rabbitCards, boardAtEnd };
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
  async createTournament(_config) {
    // 2026-07-20 club-arena retirement: the World Hub engine no longer runs
    // tournaments. Tournaments are created and run by the Club Arena engine
    // (Hetzner) against the canonical `tournaments` table. The old path here
    // wrote to the legacy `club_tournaments` table (dead since 2026-03).
    return {
      success: false,
      error: 'Tournaments have moved to Club Arena. Create tournaments at smarter.poker/hub/club-arena.',
    };
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
    // Players who haven't been eliminated or cancelled get full buy-in back.
    // IMPORTANT: Registration uses lock_chips_for_table, so refund MUST use
    // unlock_chips_from_table to clear the chip_lock record properly.
    // Using fn_credit_chips would leave orphaned lock records and double-count chips.
    let refunded = 0;
    let refundErrors = 0;
    if (this.supabase && clubId) {
      for (const [playerId, e] of t.entries) {
        if (e.status === 'cancelled') continue;
        const refundAmount = e.totalInvested || (t.buyinAmount + t.buyinFee);
        if (refundAmount <= 0) continue;
        const entryClubId = e.clubId || clubId;
        // Use a synthetic tableId for tournament chip locks (matches registration path)
        const lockTableId = e.tableId || `tournament_${tournamentId}`;
        try {
          // Phase 48f: resilient — financial critical (tournament refunds)
          const { error: unlockErr } = await resilientMutation(this.supabase, () => this.supabase.rpc('unlock_chips_from_table', {
            p_club_id: entryClubId,
            p_user_id: playerId,
            p_table_id: lockTableId,
            p_amount: refundAmount,
          }), { critical: true });
          if (!unlockErr) {
            await resilientMutation(this.supabase, () => this.supabase.from('chip_transactions').insert({
              club_id: entryClubId,
              to_user_id: playerId,
              amount: refundAmount,
              transaction_type: 'tournament_refund',
              notes: `Tournament cancelled — full refund (${t.name || tournamentId})`,
            }), { critical: true });
            refunded++;
          } else {
            // Fallback: if unlock fails (e.g., no lock record found), try direct credit
            console.warn(`[cancelTournament] Unlock failed for ${playerId}, falling back to credit:`, unlockErr.message);
            const { error: creditErr } = await resilientMutation(this.supabase, () => this.supabase.rpc('fn_credit_chips', {
              p_club_id: entryClubId,
              p_user_id: playerId,
              p_amount: refundAmount,
            }), { critical: true });
            if (!creditErr) {
              await resilientMutation(this.supabase, () => this.supabase.from('chip_transactions').insert({
                club_id: entryClubId,
                to_user_id: playerId,
                amount: refundAmount,
                transaction_type: 'tournament_refund',
                notes: `Tournament cancelled — full refund via fallback credit (${t.name || tournamentId})`,
              }), { critical: true });
              refunded++;
            } else {
              console.warn(`[cancelTournament] Refund failed for ${playerId}:`, creditErr.message);
              refundErrors++;
            }
          }
        } catch (err) {
          console.warn(`[cancelTournament] Refund error for ${playerId}:`, err.message);
          refundErrors++;
        }
      }
    }

    // Persist cancelled status
    t.status = 'cancelled';
    t.emit('tournament_cancelled', { tournamentId, refunded, refundErrors });

    entry.bridge.destroy();
    this._tournaments.delete(tournamentId);
    console.debug(`[GameController] Tournament ${tournamentId} cancelled — ${refunded} refunds issued`);
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
  // PUBLIC: COLD-START RECOVERY HELPER
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Ensure a table is loaded in memory. Called by action/state/seat API routes.
   * If the serverless function cold-started and this table wasn't recovered,
   * re-connects it from the DB on demand — zero downtime for active games.
   * @param {string} tableId
   * @returns {Promise<boolean>} true if table is now available
   */
  async ensureTable(tableId) {
    await this._ensureInit();
    if (this.lobby.tables.has(tableId)) return true;

    // Not in memory — try to reconnect from DB
    console.debug(`[GameController] Cold-start auto-recovery: reconnecting table ${tableId}`);
    const result = await this.connectToClubTable(tableId);
    if (result.success) {
      console.debug(`[GameController] Auto-recovery succeeded: ${tableId}`);
    } else {
      console.warn(`[GameController] Auto-recovery failed for ${tableId}: ${result.error}`);
    }
    return result.success;
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
        console.debug('[GameController] No tables to recover');
        return;
      }

      const { StateSerializer } = require('./StateSerializer');

      for (const row of tables) {
        try {
          const variant = row.game_variant || 'nlh';
          const { getRakeConfig } = require('./RakeConfig');
          const tierConfig = getRakeConfig(row.big_blind || 2, variant, row.small_blind);

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
            rakePercent: row.rake_percent || tierConfig.rakePercent,
            rakeCap: row.rake_cap_bb || tierConfig.rakeCapBB,
            bbjPercent: row.bbj_percent || tierConfig.bbjFeeBB,
            bbjEnabled: tierConfig.bbjEnabled && (row.bbj_percent || tierConfig.bbjFeeBB) > 0,
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
            bombPotFrequency: parseInt(row.settings?.bomb_pot_frequency) || 0,
            bombPotAnteMultiplier: Math.max(1, parseInt(row.settings?.bomb_pot_ante_multiplier) || 2),
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
                console.debug(`[GameController] Mid-hand recovered: ${row.id}`);

                // ─── GAP 6: Resume Horse AI if it was their turn when server crashed ───
                const game = entry.table.game;
                if (game?.bettingRound) {
                  const currPlayer = game.bettingRound.getCurrentPlayer();
                  if (currPlayer) {
                    HorsePokerBrain.isHorse(String(currPlayer.id)).then(isAI => {
                      if (isAI) {
                        console.debug(`[HorseAI] Resuming interrupted turn for ${currPlayer.id.substring(0, 8)} on ${row.id}`);
                        this._triggerHorseAction(row.id, currPlayer.id);
                      }
                    }).catch(e => console.warn('[App] Handled promise rejection:', e?.message || e));
                  }
                }

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
          console.warn(`[GameController] Failed to recover table ${row.id}:`, err.message);
        }
      }

      console.debug(`[GameController] Recovered ${tables.length} tables from DB`);
    } catch (err) {
      console.warn('[GameController] Recovery failed:', err.message);
    }
  }

  /**
   * Recover active tournaments from DB on cold start.
   * Reconstructs TournamentController instances for tournaments in
   * registering / late_reg / running / break states.
   * @private
   */
  async _recoverTournaments() {
    // 2026-07-20 club-arena retirement: no-op. The old implementation
    // reconstructed TournamentController instances from the legacy
    // club_tournaments table on every cold start — including a stale
    // 'running' row from 2026-03 (a zombie tournament revived at every boot).
    // Tournaments now run exclusively on the Club Arena engine.
    return;
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
        const { error: err_tables_d419d } = await this.supabase
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
        if (err_tables_d419d) console.warn('[Supabase] Silent mutation failed in tables:', err_tables_d419d.message);
      } catch (err) {
        console.warn(`[GameController] Snapshot save failed for ${tableId}:`, err.message);
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
          console.debug(`[GameController] Removing stale empty table: ${tableId}`);
          await this.closeTable(tableId);
        }
      }
    }
  }

  /** @private */
  _broadcastTableState(tableId) {
    // REMOVED IN PHASE 4: DELTA-UPDATE LAW
    // We are forbidden from broadcasting 5KB state objects.
    // RealtimeSync is already listening to delta events (player_seated, player_left, etc.)
    // this.lobby.tables.get(tableId)?.sync?.broadcastFullState();
  }

  /** @private */
  async _updateTablePlayerCount(tableId) {
    if (!this.supabase) return;

    const entry = this.lobby.tables.get(tableId);
    if (!entry) return;

    const count = entry.table.seats.filter(s => s.status !== SEAT_STATUS.EMPTY).length;

    try {
      const { error: err_tables_q1knp } = await this.supabase
        .from('tables')
        .update({ current_players: count })
        .eq('id', tableId);
      if (err_tables_q1knp) console.warn('[Supabase] Silent mutation failed in tables:', err_tables_q1knp.message);
    } catch (_) { console.warn('[App] Handled exception:', _?.message || _); }
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
  ensureTable: async (tableId) => {
    const ctrl = await getController();
    return ctrl.ensureTable(tableId);
  },
};
