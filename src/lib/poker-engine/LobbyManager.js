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

const { TableManager, TABLE_STATUS, SEAT_STATUS } = require('./TableManager');
const { ActionTimer } = require('./ActionTimer');
const { RealtimeSync } = require('./RealtimeSync');
const ChipBridge = require('./ChipBridge');
const { HandHistoryRecorder } = require('./HandHistory');
const { StateSerializer } = require('./StateSerializer');
const { GAME_VARIANT } = require('./GameStateMachine');
const { BETTING_STRUCTURES } = require('./ActionValidator');
const HorsePokerBrain = require('./brain');
const { resilientMutation, resilientQuery } = require('./SupabaseResilience');

// Lazy Sentry import for financial error reporting (must not crash engine if Sentry unavailable)
let _Sentry = null;
function getSentry() {
  if (!_Sentry) try { _Sentry = require('@sentry/nextjs'); } catch { _Sentry = { captureException: () => {} }; }
  return _Sentry;
}

/**
 * Map an arbitrary canonical hand id ("LOCA:H000016", "hand_<tableId>_42")
 * onto a stable RFC-4122 v5 uuid.
 *
 * Why this exists: atomic_distribute_rake types p_hand_id as uuid and uses it
 * as its idempotency key — ON CONFLICT (hand_id) DO NOTHING on rake_records,
 * and v_leg_key := COALESCE(p_hand_id, gen_random_uuid()) for the distribution
 * legs. Passing NULL therefore disables dedupe silently, and the rake call is
 * wrapped in resilientMutation, which retries. Without a deterministic id a
 * retry would credit the club and union wallets twice.
 *
 * Deterministic: the same hand id always yields the same uuid, so retries
 * collapse onto one row; distinct hand ids do not collide.
 *
 * @param {string} text canonical hand id
 * @returns {string} RFC-4122 version 5 uuid
 */
function toDeterministicUuid(text) {
  const crypto = require('crypto');
  const bytes = Buffer.from(
    crypto.createHash('sha1').update(`smarter.poker:rake:${String(text)}`).digest()
  ).subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50; // version 5
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // RFC-4122 variant
  const h = bytes.toString('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

// ── Phase mapping: engine phases → display phases ──
const DISPLAY_PHASE = {
  idle: 'idle',
  post_blinds: 'dealing',
  deal: 'dealing',
  preflop: 'preflop',
  flop: 'flop',
  discard: 'flop',       // Pineapple discard happens during flop
  turn: 'turn',
  river: 'river',
  showdown: 'showdown',
  payout: 'showdown',
};

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

    /** @type {Map<string, boolean>} key: "tableId:seatIndex" → consent to show cards */
    this._showCardsConsent = new Map();
  }

  /**
   * Initialize lobby channel for broadcasting table list updates.
   */
  async initialize() {
    // Skip channel creation if no Supabase client (memory-only mode)
    if (!this.supabase) {
      console.debug('[LobbyManager] No Supabase client — running without lobby broadcast');
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
      name: config.name || config.tableName,
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
      straddle: config.straddle || config.straddleEnabled || false,
      autoUtgStraddle: config.autoUtgStraddle || false,
      voluntaryStraddle: config.voluntaryStraddle || config.straddleEnabled || false,
      bbjEnabled: config.bbjEnabled || false,
      bbjPercent: config.bbjPercent || 0,
      noRathole: config.noRathole || config.clubSettings?.no_rathole || false,
      sevenDeuce: config.sevenDeuce || config.clubSettings?.seven_deuce || false,
      clubSettings: config.clubSettings || {},
    });

    // ── Auto-Rebuy callback for club tables ──
    // When a player busts and has auto-rebuy ON, this locks chips from their balance
    if (config.clubId) {
      table.onAutoRebuy = async (playerId, amount, seatIndex) => {
        const clubId = config.clubId;
        const lockResult = await ChipBridge.lockChips(clubId, playerId, config.tableId, amount);
        if (lockResult.success) {
          // Add chips to the seat
          const seat = table.seats[seatIndex];
          if (seat && seat.player?.id === playerId) {
            seat.stack += amount;
            seat.status = SEAT_STATUS.OCCUPIED;
            table.emit('auto_rebuy_success', { playerId, amount, newStack: seat.stack, seatIndex });
            table.emit('chips_added', { playerId, amount, newStack: seat.stack, seatIndex });
            console.debug(`[LobbyManager] Auto-rebuy: ${playerId} rebuys ${amount} chips`);
          }
        } else {
          // Not enough balance — throw to trigger vacate in TableManager
          throw new Error(lockResult.error || 'Insufficient balance for auto-rebuy');
        }
      };

      // ── Auto Top-Up callback for club tables ──
      // Between hands, if player stack < target, lock additional chips from balance
      table.onAutoTopUp = async (playerId, amount, seatIndex) => {
        const clubId = config.clubId;
        const lockResult = await ChipBridge.lockChips(clubId, playerId, config.tableId, amount);
        if (lockResult.success) {
          const seat = table.seats[seatIndex];
          if (seat && seat.player?.id === playerId) {
            seat.stack += amount;
            table.emit('auto_topup_success', { playerId, amount, newStack: seat.stack, seatIndex });
            table.emit('chips_added', { playerId, amount, newStack: seat.stack, seatIndex });
            console.debug(`[LobbyManager] Auto top-up: ${playerId} tops up ${amount} chips → ${seat.stack}`);
          }
        } else {
          // Non-fatal for top-up — just log and continue
          console.warn(`[LobbyManager] Auto top-up failed for ${playerId}: ${lockResult.error}`);
        }
      };
    }

    // Create ActionTimer
    const timer = new ActionTimer({
      turnTime: config.turnTime || config.actionTime || 30,
      timebank: config.timebank || 30,
      onExpire: (playerId) => table.autoFold(playerId),
      onTick: () => { },     // Wired by RealtimeSync
      onWarning: () => { },  // Wired by RealtimeSync
    });

    // Wire timer into table manager for pause/resume control
    table.timer = timer;
    if (table.game) {
      table.game.timer = timer;
    }

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
    // Note: sync is created AFTER this call, so we pass a getter
    const getSyncForTable = () => this.tables.get(config.tableId)?.sync;
    this._wireHandHistory(table, history, config, getSyncForTable);

    // Wire live mini-state broadcasting for Lobby observers
    this._wireMiniStateBroadcast(table, config.tableId);
    this._wireAuditLogging(table, config.tableId, config.clubId);

    // Wire state serializer for crash recovery
    const serializer = new StateSerializer(config.tableId, this.supabase);
    serializer.wire(table);

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
      // Update current_players in DB for lobby display
      this._updateTablePlayerCount(config.tableId, table);
      // Auto-create new table when all same-config tables are full
      if (config.clubSettings?.auto_create_table) {
        this._checkAutoCreateTable(config);
      }
      // Lifetime VIP Timebank for AI Horses (#NEW)
      // Horses carry Lifetime VIP status — initialize them with a large VIP timebank
      // (600s = 10 minutes) so they use the same VIP timebank system as human VIP members.
      // No artificial extra time is granted — the ActionTimer manages when to auto-activate.
      if (timer && HorsePokerBrain.isHorse) {
        HorsePokerBrain.isHorse(String(data.playerId)).then(isAI => {
          if (isAI) {
            const VIP_LIFETIME_TIMEBANK_SECONDS = 600; // 10 min Lifetime VIP bank
            timer.initPlayer(data.playerId, VIP_LIFETIME_TIMEBANK_SECONDS);
            console.debug(`[LobbyManager] 👑 Lifetime VIP Timebank granted to Horse ${String(data.playerId).substring(0, 8)}: ${VIP_LIFETIME_TIMEBANK_SECONDS}s`);
          }
        }).catch(e => console.warn('[App] Handled promise rejection:', e?.message || e));
      }
    });
    table.on('player_left', (data) => {
      this._trackPlayerLeave(data.playerId, config.tableId);
      this._updateTablePlayerCount(config.tableId, table);

      // ── Auto-unlock chips for engine-initiated removals (busted, auto-kicked) ──
      // If a player was removed by the engine (not via seat.js stand_up),
      // their chip lock still exists. Clean it up and return remaining chips.
      const clubId = config.clubId;
      if (clubId && data.playerId) {
        const cashout = data.cashout || 0;
        // Delay to let seat.js handle it first if this was a manual stand_up.
        setTimeout(async () => {
          try {
            const hasLock = await ChipBridge.checkLockExists(config.tableId, data.playerId);
            if (hasLock) {
              // Lock still exists — this was an engine auto-removal
              console.debug(`[LobbyManager] Auto-unlock: player ${data.playerId} removed from table with ${cashout} chips`);
              await ChipBridge.unlockChips(clubId, data.playerId, config.tableId, cashout);
            }
          } catch (e) {
            console.warn('[LobbyManager] Auto-unlock error:', e);
          }
        }, 500);
      }
    });

    // Store
    this.tables.set(config.tableId, {
      table,
      sync,
      timer,
      history,
      serializer, // Stored for external access (e.g., force-flush on admin operations)
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
        clubSettings: config.clubSettings || {},
        createdAt: new Date().toISOString(),
      },
    });

    // ── Game Length Timer: auto-close table after configured hours ──
    const gameLengthHours = config.clubSettings?.game_length_hours || config.gameLengthHours;
    if (gameLengthHours && gameLengthHours > 0) {
      const gameLengthMs = gameLengthHours * 60 * 60 * 1000;
      const warnMs = Math.max(gameLengthMs - (5 * 60 * 1000), 0); // 5min warning

      // 5-minute warning
      if (warnMs > 0) {
        setTimeout(() => {
          table.emit('game_length_warning', { minutesRemaining: 5, closeAt: Date.now() + 5 * 60 * 1000 });
        }, warnMs);
      }

      // Auto-close: finish current hand then close
      setTimeout(() => {
        console.debug(`[LobbyManager] Game length expired (${gameLengthHours}h) for ${config.tableId}`);

        // Auto-extension: if players are seated and auto_extension enabled, extend
        const autoExtension = config.clubSettings?.auto_extension || config.autoExtension;
        const seatedCount = table.seats.filter(s => s.status !== SEAT_STATUS.EMPTY).length;

        if (autoExtension && seatedCount >= 2) {
          console.debug(`[LobbyManager] Auto-extending table ${config.tableId} (${seatedCount} players seated)`);
          table.emit('game_length_extended', { hours: gameLengthHours, seatedPlayers: seatedCount });
          // Schedule another check after 1 hour
          setTimeout(() => {
            const stillSeated = table.seats.filter(s => s.status !== SEAT_STATUS.EMPTY).length;
            if (stillSeated < 2) {
              this.closeTable(config.tableId);
            } else {
              table.emit('game_length_extended', { hours: 1, seatedPlayers: stillSeated });
            }
          }, 60 * 60 * 1000);
          return;
        }

        table.emit('game_length_expired', { hours: gameLengthHours });
        // Wait for current hand to finish, then close
        if (table.game.phase === 'idle') {
          this.closeTable(config.tableId);
        } else {
          table.once('hand_complete', () => this.closeTable(config.tableId));
        }
      }, gameLengthMs);
    }

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

    // ── Collect seated players BEFORE close (close clears all seats) ──
    const clubId = entry.config?.clubId;
    const seatedPlayers = [];
    if (clubId) {
      for (const seat of entry.table.seats) {
        if (seat.player && seat.player.id) {
          const pendingAdd = entry.table._pendingChipAdds?.get(String(seat.player.id)) || 0;
          seatedPlayers.push({ playerId: seat.player.id, stack: (seat.stack || 0) + pendingAdd });
        }
      }
    }

    // Close table (cashes out all players via _vacateSeat)
    entry.table.close();

    // ── Unlock chips for ALL seated players (close() doesn't emit player_left) ──
    if (clubId && seatedPlayers.length > 0) {
      for (const { playerId, stack } of seatedPlayers) {
        try {
          await ChipBridge.unlockChips(clubId, playerId, tableId, stack);
          console.debug(`[LobbyManager.closeTable] Unlocked ${stack} chips for ${playerId}`);
        } catch (e) {
          console.warn(`[LobbyManager.closeTable] Failed to unlock chips for ${playerId}:`, e.message);
        }
      }
    }

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

    // 🐛 Fix: Memory leak cleanup — purge all show-cards consent entries for this table
    for (const key of this._showCardsConsent.keys()) {
      if (key.startsWith(`${tableId}:`)) {
        this._showCardsConsent.delete(key);
      }
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
   * @param {number} [filters.minStakes] - Min Big-Blind
   * @param {number} [filters.maxStakes] - Max Big-Blind
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
   * @param {TableManager} table
   * @param {HandHistoryRecorder} history
   * @param {Object} config - Table config (clubId, bigBlind, variant, tableId)
   * @param {Function} getSync - Getter for RealtimeSync (deferred because sync is created after wiring)
   */
  _wireHandHistory(table, history, config, getSync) {
    // Helper to safely get sync channel
    const getSyncChannel = () => {
      const sync = typeof getSync === 'function' ? getSync() : getSync;
      return sync?.channel || null;
    };
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

    // ── BBJ TRIGGERED — Award jackpot when qualifying hand detected ──
    table.on('bbj_triggered', async (bbjData) => {
      const clubId = config.clubId;
      if (!clubId || !bbjData?.triggered) return;

      try {
        const sb = ChipBridge.getSupabase();
        const { getRakeConfig, getTierForBB } = require('./RakeConfig');
        const tierConfig = getRakeConfig(config.bigBlind, config.variant || 'nlh');
        const tier = getTierForBB(config.bigBlind);

        console.debug(`[BBJ] 🎰 BAD BEAT JACKPOT TRIGGERED! Hand #${bbjData.handNumber}`);
        console.debug(`[BBJ]   Loser: ${bbjData.loserId} (${bbjData.loserHand})`);
        console.debug(`[BBJ]   Winner: ${bbjData.winnerId} (${bbjData.winnerHand})`);

        // Award via bbj_pools table (Phase 48f: resilient — financial critical)
        const { data: awardResult, error: awardErr } = await resilientMutation(sb, () => sb.rpc('award_bbj', {
          p_club_id: clubId,
          p_table_id: config.tableId,
          p_hand_number: bbjData.handNumber || 0,
          p_loser_user_id: bbjData.loserId,
          p_loser_display_name: bbjData.loserDisplayName || 'Player',
          p_loser_hand: bbjData.loserHand,
          p_loser_cards: bbjData.loserCards || '',
          p_winner_user_id: bbjData.winnerId,
          p_winner_display_name: bbjData.winnerDisplayName || 'Player',
          p_winner_hand: bbjData.winnerHand,
          p_winner_cards: bbjData.winnerCards || '',
          p_payout_total_pct: tierConfig.bbjPayoutTotal,
          p_payout_loser_pct: tierConfig.bbjPayoutLoser,
          p_payout_winner_pct: tierConfig.bbjPayoutWinner,
          p_payout_table_pct: tierConfig.bbjPayoutTable,
          p_stakes_tier: tier?.label?.toLowerCase() || 'small',
          p_game_variant: config.variant || 'nlh',
          p_big_blind: config.bigBlind,
        }), { critical: true });

        if (awardErr) {
          console.warn('[BBJ] Award error:', awardErr.message);
        } else if (awardResult?.success) {
          console.debug(`[BBJ] ✅ Jackpot paid! Total: ${awardResult.total_payout}`);

          // Broadcast BBJ win to the table channel
          const _bbjCh = getSyncChannel();
          if (_bbjCh) {
            _bbjCh.send({
              type: 'broadcast',
              event: 'bbj_won',
              payload: {
                loserId: bbjData.loserId,
                loserHand: bbjData.loserHand,
                winnerId: bbjData.winnerId,
                winnerHand: bbjData.winnerHand,
                loserPayout: awardResult.loser_payout,
                winnerPayout: awardResult.winner_payout,
                tableSharePayout: awardResult.table_share_payout,
                totalPayout: awardResult.total_payout,
                handNumber: bbjData.handNumber,
              },
            });
          }

          // [AUDIT LOG] Record the Bad Beat Jackpot winners and losers locally in the true ledger
          try {
            const sbAudit = ChipBridge.getSupabase();
            sbAudit.rpc('record_arena_audit_log', {
              p_club_id: clubId,
              p_table_id: config.tableId,
              p_user_id: bbjData.loserId,
              p_action_type: 'bbj_loser_pool',
              p_amount: awardResult.loser_payout,
              p_details: { handNumber: bbjData.handNumber, hand: bbjData.loserHand }
            })
              .then(({ error }) => { if (error) throw error; })
              .catch(e => { console.warn('[LobbyManager] BBJ loser payout audit FAILED:', e?.message || e); getSentry().captureException(e, { tags: { area: 'bbj', type: 'loser_payout' } }); });

            sbAudit.rpc('record_arena_audit_log', {
              p_club_id: clubId,
              p_table_id: config.tableId,
              p_user_id: bbjData.winnerId,
              p_action_type: 'bbj_winner_pool',
              p_amount: awardResult.winner_payout,
              p_details: { handNumber: bbjData.handNumber, hand: bbjData.winnerHand }
            })
              .then(({ error }) => { if (error) throw error; })
              .catch(e => { console.warn('[LobbyManager] BBJ winner payout audit FAILED:', e?.message || e); getSentry().captureException(e, { tags: { area: 'bbj', type: 'winner_payout' } }); });
            
            // NOTE: We could theoretically loop the tableSharePayout to all players, 
            // but tracking the two massive chip movements provides the primary BBJ absolute trace.
          } catch (e) { console.warn('[LobbyManager] BBJ audit log error:', e?.message || e); getSentry().captureException(e, { tags: { area: 'bbj' } }); }
        }
      } catch (err) {
        console.warn('[BBJ] Trigger error:', err.message);
        getSentry().captureException(err, { tags: { area: 'bbj', type: 'trigger' } });
      }
    });

    // ── INSURANCE EVENTS ────────────────────────────────────────
    table.on('insurance_offered', (data) => {
      const ch = getSyncChannel();
      if (ch) {
        ch.send({ type: 'broadcast', event: `insurance_offered:${data.leaderId}`, payload: data });
        ch.send({ type: 'broadcast', event: 'insurance_offered', payload: data });
      }
    });

    table.on('insurance_purchased', (data) => {
      getSyncChannel()?.send({ type: 'broadcast', event: 'insurance_purchased', payload: data });
      // Record premium as union/club revenue (non-blocking)
      if (config.clubId) {
        const sb = ChipBridge.getSupabase();
        sb.rpc('record_insurance_transaction', {
          p_club_id: config.clubId,
          p_table_id: config.tableId,
          p_player_id: data.buyerId,
          p_amount: data.premium,
          p_type: 'premium',
          p_metadata: { coverage: data.amount, equity: data.trailerEquity },
        }).then(({ error }) => {
          if (error) console.warn('[LobbyManager] Insurance premium recording failed:', error.message);
        }).catch(e => { console.warn('[LobbyManager] Insurance premium recording rejected:', e?.message || e); getSentry().captureException(e, { tags: { area: 'insurance', type: 'premium_record' } }); });

        // [AUDIT LOG] Trace the chip movement leaving the player's account for the premium
        try {
          sb.rpc('record_arena_audit_log', {
            p_club_id: config.clubId,
            p_table_id: config.tableId,
            p_user_id: data.buyerId,
            p_action_type: 'insurance_premium',
            p_amount: -(data.premium),
            p_details: { coverage: data.amount, equity: data.trailerEquity }
          })
            .then(({ error }) => { if (error) throw error; })
            .catch(e => { console.warn('[LobbyManager] Insurance premium audit FAILED:', e?.message || e); getSentry().captureException(e, { tags: { area: 'insurance', type: 'premium' } }); });
        } catch (e) { console.warn('[LobbyManager] Insurance premium error:', e?.message || e); getSentry().captureException(e, { tags: { area: 'insurance' } }); }
      }
    });

    table.on('insurance_declined', (data) => {
      getSyncChannel()?.send({ type: 'broadcast', event: 'insurance_declined', payload: data });
    });

    table.on('insurance_payout', (data) => {
      getSyncChannel()?.send({ type: 'broadcast', event: 'insurance_payout', payload: data });
      // Record payout as union/club expense (non-blocking)
      if (config.clubId) {
        const sb = ChipBridge.getSupabase();
        sb.rpc('record_insurance_transaction', {
          p_club_id: config.clubId,
          p_table_id: config.tableId,
          p_player_id: data.buyerId,
          p_amount: data.payout,
          p_type: 'payout',
          p_metadata: { premium: data.premium, netGain: data.netGain },
        }).then(({ error }) => {
          if (error) { console.warn('[LobbyManager] Insurance payout recording failed:', error.message); getSentry().captureException(new Error(error.message), { tags: { area: 'insurance', type: 'payout_record' } }); }
        }).catch(e => { console.warn('[LobbyManager] Insurance payout recording rejected:', e?.message || e); getSentry().captureException(e, { tags: { area: 'insurance', type: 'payout_record' } }); });

        // [AUDIT LOG] Trace the chip movement entering the player's account from the insurance hit
        try {
          sb.rpc('record_arena_audit_log', {
            p_club_id: config.clubId,
            p_table_id: config.tableId,
            p_user_id: data.buyerId,
            p_action_type: 'insurance_payout',
            p_amount: data.payout,
            p_details: { premium: data.premium, netGain: data.netGain }
          })
            .then(({ error }) => { if (error) throw error; })
            .catch(e => { console.warn('[LobbyManager] Insurance payout audit FAILED:', e?.message || e); getSentry().captureException(e, { tags: { area: 'insurance', type: 'payout' } }); });
        } catch (e) { console.warn('[LobbyManager] Insurance payout error:', e?.message || e); getSentry().captureException(e, { tags: { area: 'insurance' } }); }
      }
    });

    table.on('insurance_expired', (data) => {
      getSyncChannel()?.send({ type: 'broadcast', event: 'insurance_expired', payload: data });
      // Premium already recorded on purchase — no additional action needed.
      // The premium is pure profit for the union/club.
    });

    // ── RUN IT MULTIPLE (2x / 3x boards) ────────────────────────
    // ── RUN IT OFFER — Consent flow for player_choice mode ──
    table.on('run_it_offer', (data) => {
      getSyncChannel()?.send({ type: 'broadcast', event: 'run_it_offer', payload: data });
    });
    table.on('run_it_response', (data) => {
      getSyncChannel()?.send({ type: 'broadcast', event: 'run_it_response', payload: data });
    });
    table.on('run_it_agreed', (data) => {
      getSyncChannel()?.send({ type: 'broadcast', event: 'run_it_agreed', payload: data });
    });
    table.on('run_it_declined', (data) => {
      getSyncChannel()?.send({ type: 'broadcast', event: 'run_it_declined', payload: data });
    });

    // ── STRADDLE EVENTS ──
    table.on('straddle_posted', (data) => {
      getSyncChannel()?.send({ type: 'broadcast', event: 'straddle_posted', payload: data });
    });

    // ── ALL-IN EQUITY — Win percentages when all players are all-in ──
    table.on('all_in_equity', (data) => {
      getSyncChannel()?.send({ type: 'broadcast', event: 'all_in_equity', payload: data });
    });

    table.on('run_it_multiple', (data) => {
      getSyncChannel()?.send({ type: 'broadcast', event: 'run_it_multiple', payload: data });
    });

    table.on('run_it_twice', (data) => {
      getSyncChannel()?.send({ type: 'broadcast', event: 'run_it_twice', payload: data });
    });

    table.on('run_it_thrice', (data) => {
      getSyncChannel()?.send({ type: 'broadcast', event: 'run_it_thrice', payload: data });
    });

    table.on('hand_complete', async (data) => {
      const finalStacks = table.seats
        .filter(s => s.player)
        .map(s => ({ playerId: s.player.id, stack: s.stack }));

      await history.completeHand(finalStacks);

      // ── Record rake to Club Arena DB via Supabase RPC ──
      // Uses DEALT METHOD: rake split equally among ALL dealt players
      const clubId = config.clubId;
      const rakeAmount = data.rake || 0;

      if (clubId && rakeAmount > 0) {
        try {
          const sb = ChipBridge.getSupabase();
          const { calculateBBJFee } = require('./RakeConfig');

          // ALL players dealt into this hand (not just those who invested)
          const dealtPlayerIds = (data.players || []).map(p => p.id);

          // Calculate BBJ fee using tier-based config
          // Fee is in BB units (e.g. 0.25BB for Small stakes), applied per hand
          // Only charged if pot ≥ 10BB and 4+ players dealt
          const bbjContribution = calculateBBJFee(
            config.bigBlind,
            data.potTotal || 0,
            dealtPlayerIds.length,
            config.variant || 'nlh'
          );

          // ── Dan 2026-08-16 — REPOINTED AT atomic_distribute_rake ──
          //
          // This used to call record_rake with p_bbj_contribution and
          // p_dealt_player_ids. Neither parameter exists, and four that do
          // were omitted, so PostgREST named-argument resolution returned
          // PGRST202 every single time: the hand completed, every player was
          // paid, and ZERO rake was recorded anywhere. It only console.warn'd,
          // so it was silent.
          //
          // A previous note here claimed this path was "dormant". That was
          // wrong. On 2026-08-16 between 00:07 and 00:32 UTC it fired seven
          // times across four tournament tables (pots up to 56,516) and every
          // one of those hands has zero rows in rake_records.
          //
          // atomic_distribute_rake is the function the Hetzner engine of
          // record already uses for all 626k+ rake_records rows. It is the
          // right target for three reasons:
          //   1. p_bbj is an ABSOLUTE chip amount, which is what
          //      calculateBBJFee returns. record_rake's p_bbj_pct is a
          //      PERCENTAGE (default 0.05) — feeding an absolute fee into it
          //      would have silently corrupted the BBJ take.
          //   2. It is idempotent: ON CONFLICT (hand_id) DO NOTHING on
          //      rake_records, plus (leg_key, leg) dedupe on
          //      rake_distribution_legs.
          //   3. It handles union-vs-club-treasury routing; record_rake does
          //      not.
          //
          // IDEMPOTENCY DEPENDS ON A STABLE hand_id. Inside the function,
          // v_leg_key := COALESCE(p_hand_id, gen_random_uuid()) — so a NULL
          // hand id silently disables dedupe altogether. This call is wrapped
          // in resilientMutation, which RETRIES, and a retry with no stable id
          // would double-credit the club and union wallets. p_hand_id is also
          // typed uuid while our canonical ids are text ("LOCA:H000016"), so
          // we derive a deterministic RFC-4122 v5 uuid from the canonical id:
          // the same hand always maps to the same uuid, different hands never
          // collide, and retries dedupe correctly.
          const canonicalHandId = data.handId ||
            (data.handNumber ? `hand_${config.tableId}_${data.handNumber}` : `hand_${config.tableId}_${Date.now()}`);
          const handUuid = toDeterministicUuid(canonicalHandId);

          // Real per-player pot investment from GameStateMachine._finishHand().
          // The KEYS drive equal-share rakeback attribution (every player dealt
          // in, DECISION D-001); the values are the audit record of who
          // actually put chips in.
          const contributions = {};
          for (const p of (data.players || [])) {
            if (p?.id) contributions[p.id] = Number(p.invested) || 0;
          }

          // Phase 48f: resilient — financial critical
          const { data: rakeResult, error: rakeErr } = await resilientMutation(sb, () => sb.rpc('atomic_distribute_rake', {
            p_table_id: config.tableId,
            p_club_id: clubId,
            p_hand_id: handUuid,
            p_hand_number: Number(data.handNumber) || null,
            p_rake: rakeAmount,
            p_bbj: bbjContribution,
            p_pot: data.potTotal || 0,
            p_num_players: dealtPlayerIds.length || finalStacks.length,
            p_contributions: Object.keys(contributions).length > 0 ? contributions : null,
            p_tournament_id: config.tournamentId || null,
          }), { critical: true });

          if (rakeErr) {
            // Kept as a durable alert so this can never fail quietly again.
            // Silent revenue loss is the worst failure mode this path has.
            console.error('[LobbyManager] RAKE NOT RECORDED:', rakeErr.message);
            try {
              await sb.from('financial_alerts').insert({
                severity: 'critical',
                source: 'LobbyManager.record_rake_failed',
                message: `World Hub poker engine completed a hand but recorded NO rake: ${rakeErr.message}`,
                context: {
                  hand_id: canonicalHandId,
                  club_id: clubId,
                  table_id: config.tableId,
                  rake_amount: rakeAmount,
                  pot_size: data.potTotal || 0,
                  note: 'record_rake argument mismatch — see comment in LobbyManager.js',
                },
                resolved: false,
              });
            } catch (alertErr) {
              console.error('[LobbyManager] could not even raise the alert:', alertErr?.message);
            }
          } else if (rakeResult?.global_hand_id) {
            // Store global ID so it can be pushed to clients if needed in future
            // For now, log it for audit trail
            console.debug(`[LobbyManager] Hand recorded: ${canonicalHandId} → SP-${String(rakeResult.global_hand_id).padStart(10, '0')} (rake=${rakeAmount})`);
          }

          // ── INCREMENT SETTLEMENT COUNTERS ──
          // BUG #229 FIX: This was only in the HTTP API route (record-rake.js),
          // but the engine calls record_rake RPC directly. Without this,
          // settlement_periods.hands_played and total_rake stay at 0 forever,
          // making auto-settlement distribute nothing.
          try {
            // Phase 48f: resilient mutation
            await resilientMutation(sb, () => sb.rpc('increment_settlement_counters', {
              p_club_id: clubId,
              p_rake: rakeAmount,
              p_hands: 1,
            }));
          } catch (settlErr) {
            console.warn('[LobbyManager] Settlement counter increment failed:', settlErr.message);
            // Non-fatal — don't block hand progression
          }

          // ── ADD BBJ CONTRIBUTION TO POOL ──
          if (bbjContribution > 0) {
            try {
              const { getTierForBB } = require('./RakeConfig');
              const tier = getTierForBB(config.bigBlind);
              await sb.rpc('add_bbj_contribution', {
                p_club_id: clubId,
                p_table_id: config.tableId,
                p_hand_number: data.handNumber || 0,
                p_amount: bbjContribution,
                p_big_blind: config.bigBlind,
                p_stakes_tier: tier?.label?.toLowerCase() || 'small',
              });
            } catch (bbjErr) {
              console.warn('[LobbyManager] BBJ contribution failed:', bbjErr.message);
            }
          }

          // Run cascading commission for each dealt player IN PARALLEL (non-blocking)
          // Credits agents up the hierarchy — don't block hand progression
          if (dealtPlayerIds.length > 0) {
            const perPlayerRake = rakeAmount / dealtPlayerIds.length;
            const handId = data.handId || (data.handNumber ? `hand_${config.tableId}_${data.handNumber}` : `hand_${config.tableId}_${Date.now()}`);
            Promise.allSettled(
              dealtPlayerIds.map(playerId =>
                sb.rpc('calculate_cascading_commission', {
                  p_hand_id: handId,
                  p_club_id: clubId,
                  p_player_user_id: playerId,
                  p_rake_amount: perPlayerRake,
                })
              )
            ).then(results => {
              const failures = results.filter(r => r.status === 'rejected' || r.value?.error);
              if (failures.length > 0) {
                console.warn(`[LobbyManager] ${failures.length}/${dealtPlayerIds.length} commission calcs failed`);
              }
            }).catch(console.warn);
          }
        } catch (rakeErr) {
          console.warn('[LobbyManager] Rake recording failed:', rakeErr);
          // Don't block hand progression on rake recording failure
        }
      }

      // ── PROMO PLAYTHROUGH: Record wagering per player ──
      // Each player's invested amount in this hand counts toward their 3x playthrough
      if (clubId && data.players?.length > 0) {
        try {
          const sb = ChipBridge.getSupabase();
          for (const player of data.players) {
            const invested = player.invested || 0;
            if (invested > 0) {
              sb.rpc('record_promo_wagering', {
                p_club_id: clubId,
                p_player_user_id: player.id,
                p_amount_wagered: invested,
              })
                .then(({ error }) => { if (error) throw error; })
                .catch(err => { console.warn('[LobbyManager] Promo wagering RPC failed:', err?.message || err); getSentry().captureException(err, { tags: { area: 'promo_wagering' } }); });
            }
          }
        } catch (promoErr) {
          console.warn('[LobbyManager] Promo wagering tracking failed:', promoErr.message);
          getSentry().captureException(promoErr, { tags: { area: 'promo_wagering', type: 'outer' } });
        }
      }

      // ── TABLE STATS: Update hands_dealt + avg_pot for lobby display ──
      try {
        const sb = ChipBridge.getSupabase();
        if (sb) {
          const potTotal = data.potTotal || data.result?.pots?.reduce((s, p) => s + p.amount, 0) || 0;
          // Increment hands_dealt; update running avg_pot using exponential moving average
          // avg_pot = (old_avg * 0.9) + (new_pot * 0.1) — smoothed over many hands
          // Phase 48f: resilient mutation
          await resilientMutation(sb, () => sb.rpc('update_table_stats', {
            p_table_id: config.tableId,
            p_pot_total: potTotal,
          })).catch(e => console.warn('[App] Handled promise rejection:', e?.message || e));
        }
      } catch (_) { console.warn('[App] Handled exception:', _?.message || _); }
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
        const autoRestart = entry.config?.clubSettings?.auto_restart || entry.config?.autoRestart;

        if (autoRestart) {
          // Auto-restart: keep table alive, just set status to waiting
          entry.table.status = 'WAITING';
          console.debug(`[LobbyManager] Table ${tableId} empty — auto_restart ON, keeping alive`);
          entry.table.emit('table_waiting', { reason: 'empty', autoRestart: true });
        } else {
          // Standard: close after timeout
          this._emptyTimers.set(tableId, setTimeout(() => {
            this.closeTable(tableId);
          }, EMPTY_TABLE_TIMEOUT_MS));
        }
      }
    }
  }

  /**
   * Check if all tables with the same config are full; if so, create a new one.
   * @private
   */
  /**
   * Update current_players count in DB for lobby display.
   * @private
   */
  async _updateTablePlayerCount(tableId, table) {
    try {
      const count = table.seats.filter(s =>
        s.status === SEAT_STATUS.OCCUPIED || s.status === SEAT_STATUS.SITTING_OUT
      ).length;

      const sb = ChipBridge.getSupabase();
      if (sb) {
        // Phase 48f: resilient mutation
        await resilientMutation(sb, () => sb.from('tables').update({
          current_players: count,
          updated_at: new Date().toISOString(),
        }).eq('id', tableId));
      }
    } catch (e) { console.warn('[App] Handled exception:', e?.message || e); }
  }

  _checkAutoCreateTable(templateConfig) {
    const clubId = templateConfig.clubId;
    if (!clubId) return;

    const variant = templateConfig.variant;
    const bigBlind = templateConfig.bigBlind;

    // Find all tables for this club with same variant + stakes
    let allFull = true;
    let tableCount = 0;

    for (const [, entry] of this.tables) {
      if (entry.config.clubId !== clubId) continue;
      if (entry.config.variant !== variant || entry.config.bigBlind !== bigBlind) continue;
      tableCount++;

      const seated = entry.table.seats.filter(s => s.status !== SEAT_STATUS.EMPTY).length;
      if (seated < entry.table.maxSeats) {
        allFull = false;
        break;
      }
    }

    // Max 5 auto-created tables per variant+stakes
    if (allFull && tableCount < 5) {
      const newConfig = {
        ...templateConfig,
        tableId: `auto_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        tableName: `${templateConfig.tableName || 'Table'} #${tableCount + 1}`,
      };

      console.debug(`[LobbyManager] Auto-creating table: all ${tableCount} ${variant} ${bigBlind}BB tables full`);
      this.createTable(newConfig).then(result => {
        if (result.success) {
          console.debug(`[LobbyManager] Auto-created table ${newConfig.tableId} for ${variant} ${bigBlind}BB`);
        }
      }).catch(err => {
        console.warn('[LobbyManager] Auto-create table failed:', err.message);
      });
    }
  }

  /**
   * Wire mini-state real-time broadcast to table events.
   * Pushes zero-latency updates to the 'lobby' channel.
   * @private
   */
  _wireMiniStateBroadcast(table, tableId) {
    const triggerUpdate = () => {
      // 200ms debounce to batch rapid sequential events
      if (table._miniStateTimeout) clearTimeout(table._miniStateTimeout);
      table._miniStateTimeout = setTimeout(() => {
        this._broadcastMiniState(tableId);
      }, 200);
    };

    table.on('player_seated', triggerUpdate);
    table.on('player_left', (data) => {
      // 🐛 Fix: Memory leak cleanup — remove consent when player leaves
      if (data && data.seatIndex !== undefined) {
        this._showCardsConsent.delete(`${tableId}:${data.seatIndex}`);
      }
      triggerUpdate();
    });
    table.on('hand_start', triggerUpdate);
    table.on('action_processed', triggerUpdate);
    table.on('street_start', triggerUpdate);
    table.on('cards_dealt', triggerUpdate);
    table.on('showdown', triggerUpdate);

    // Store hand result for flash animation AND DVR replayer
    // ROOT CAUSE FIX: Previously wired to 'payout' which lacked handId/winners/handNumber.
    // Now wired to 'hand_complete' which carries the full engine data contract.
    table.on('payout', (data) => {
      triggerUpdate();
    });
    table.on('hand_complete', (data) => {
      const entry = this.tables.get(tableId);
      if (entry && data) {
        const winners = data.result?.winners || data.winners || [];
        const firstWinner = winners[0];
        entry._lastHandResult = {
          handId: data.handId || null,
          handNumber: data.handNumber || 0,
          winnerName: firstWinner?.displayName || firstWinner?.playerId || 'Winner',
          amount: firstWinner?.amount || data.potTotal || 0,
          winners,
          rake: data.rake || data.result?.rake || 0,
          result: data.result || null,
          timestamp: Date.now(),
        };
        // Clear after 30s — DVR needs longer than flash animations
        setTimeout(() => { if (entry._lastHandResult) entry._lastHandResult = null; }, 30000);
      }
      triggerUpdate();
    });

    // Chat message listener
    table.on('chat_message', (data) => {
      const entry = this.tables.get(tableId);
      if (entry && data) {
        entry._lastChatMessage = {
          playerName: data.playerName || 'Player',
          message: String(data.message || '').substring(0, 40),
          timestamp: Date.now(),
        };
        // Clear after 6s
        setTimeout(() => { if (entry._lastChatMessage) entry._lastChatMessage = null; }, 6000);
        triggerUpdate();
      }
    });

    // Emoji reaction listener
    table.on('emoji_reaction', (data) => {
      const entry = this.tables.get(tableId);
      if (entry && data) {
        if (!entry._emojiReactions) entry._emojiReactions = [];
        entry._emojiReactions.push({
          emoji: data.emoji || '🔥',
          seatIndex: data.seatIndex,
          timestamp: Date.now(),
        });
        // Keep last 5 only
        if (entry._emojiReactions.length > 5) entry._emojiReactions = entry._emojiReactions.slice(-5);
        // Clear old after 4s
        setTimeout(() => {
          if (entry._emojiReactions) {
            entry._emojiReactions = entry._emojiReactions.filter(e => Date.now() - e.timestamp < 4000);
          }
        }, 4000);
        triggerUpdate();
      }
    });
  }

  /**
   * Wire macro/micro event logging for the Absolute Accounting Record.
   * @private
   */
  _wireAuditLogging(table, tableId, clubId) {
    if (!clubId) return;

    // 1. Chat Message Logging
    table.on('chat_message', (data) => {
      if (!data || !data.message) return;
      try {
        const sb = ChipBridge.getSupabase();
        sb.rpc('record_arena_message', {
          p_club_id: clubId,
          p_table_id: tableId,
          p_user_id: data.playerId || null,
          p_player_name: data.playerName || 'Player',
          p_message: String(data.message)
        })
          .then(({ error }) => { if (error) throw error; })
          .catch(err => console.warn('[Audit] Chat log error:', err.message));
      } catch (e) { console.warn('[App] Handled exception:', e?.message || e); }
    });

    // 2. MACRO ACTIONS (Seating & Cashouts)
    table.on('player_seated', (data) => {
      try {
        const sb = ChipBridge.getSupabase();
        sb.rpc('record_arena_audit_log', {
          p_club_id: clubId,
          p_table_id: tableId,
          // Phase 48e FIX #12: player_seated emits playerId and stack, not player.id and buyIn
          p_user_id: data.playerId || null,
          p_action_type: 'sit_down',
          p_amount: data.stack || 0,
          p_details: { seatIndex: data.seatIndex }
        })
          .then(({ error }) => { if (error) throw error; })
          .catch(e => console.warn('[App] Handled promise rejection:', e?.message || e));
      } catch (e) { console.warn('[App] Handled exception:', e?.message || e); }
    });

    table.on('player_left', (data) => {
      try {
        const sb = ChipBridge.getSupabase();
        sb.rpc('record_arena_audit_log', {
          p_club_id: clubId,
          p_table_id: tableId,
          p_user_id: data.playerId || null,
          p_action_type: 'stand_up',
          p_amount: data.stack || 0,
          p_details: { reason: data.reason }
        })
          .then(({ error }) => { if (error) throw error; })
          .catch(e => console.warn('[App] Handled promise rejection:', e?.message || e));
      } catch (e) { console.warn('[App] Handled exception:', e?.message || e); }
    });

    table.on('add_chips', (data) => {
       try {
        const sb = ChipBridge.getSupabase();
        sb.rpc('record_arena_audit_log', {
          p_club_id: clubId,
          p_table_id: tableId,
          p_user_id: data.playerId || null,
          p_action_type: 'add_chips',
          p_amount: data.amount || 0,
          p_details: { reason: 'rebuy' }
        })
          .then(({ error }) => { if (error) throw error; })
          .catch(e => console.warn('[App] Handled promise rejection:', e?.message || e));
       } catch (e) { console.warn('[App] Handled exception:', e?.message || e); }
    });

    // 3. MICRO ACTIONS (Hand progress)
    table.on('action_processed', (data) => {
      if (!data.action) return;
      try {
        const sb = ChipBridge.getSupabase();
        sb.rpc('record_arena_audit_log', {
          p_club_id: clubId,
          p_table_id: tableId,
          p_user_id: data.playerId || null,
          p_action_type: `action_${data.action.type}`, // e.g. action_fold, action_bet
          p_amount: data.action.amount || 0,
          p_details: { street: data.street, handNumber: table.handCount || 0 }
        })
          .then(({ error }) => { if (error) throw error; })
          .catch(e => console.warn('[App] Handled promise rejection:', e?.message || e));
      } catch (e) { console.warn('[App] Handled exception:', e?.message || e); }
    });
  }

  /**
   * Calculate and broadcast a single table's mini state payload.
   * @private
   */
  _broadcastMiniState(tableId) {
    if (!this._lobbyChannel) return;
    const entry = this.tables.get(tableId);
    if (!entry || !entry.table) return;

    try {
      const state = entry.table.getState(null);
      const enginePhase = state.game?.phase || 'idle';
      const displayPhase = DISPLAY_PHASE[enginePhase] || enginePhase;
      const gameActionProps = state.game?.actionSequence || {}; // if any exists

      const seats = (state.seats || []).map(s => {
        if (!s.player) return { seatIndex: s.seatIndex, occupied: false };
        
        let lastAction = null;
        if (state.game && state.game.bettingRound) {
           const log = state.game.bettingRound.actionLog;
           if (log && log.length > 0) {
              const pActions = log.filter(a => a.playerId === s.player.id);
              if (pActions.length > 0) {
                 lastAction = pActions[pActions.length - 1];
              }
           }
        }

        return {
          seatIndex: s.seatIndex,
          occupied: true,
          stack: s.stack || 0,
          buyIn: s.buyIn || 0,
          currentStreak: s.currentStreak || 0,
          isFolded: s.isFolded || false,
          isActor: s.isCurrentActor || false,
          isDealer: s.seatIndex === (state.game?.buttonSeat ?? -1),
          isAllIn: s.isInHand && s.stack === 0,
          displayName: s.player.displayName ? String(s.player.displayName).substring(0, 10) : 'Player',
          avatarUrl: s.player.avatarUrl || s.player.avatar_url || null,
          lastAction: lastAction ? (lastAction.type === 'call' && lastAction.amount === 0 ? 'CHECK' : lastAction.type.toUpperCase()) : null,
          lastActionAmount: lastAction?.amount,
        };
      });

      // Calculate spectator count (total connections - seated players)
      const seatedCount = seats.filter(s => s.occupied).length;
      const totalConnections = entry.sync?._connections?.size || 0;
      const spectatorCount = Math.max(0, totalConnections - seatedCount);

      // Hand result for flash animation
      const lastResult = entry._lastHandResult || null;

      // Chat message for bubble
      const lastChat = entry._lastChatMessage || null;

      // Emoji reactions queue
      const emojiReactions = entry._emojiReactions || [];

      // Tournament-specific overlay data
      const tourneyData = entry.config?.tournamentId ? {
        blindLevel: entry.config.blindLevel || null,
        nextLevelTime: entry.config.nextLevelTime || null,
        avgStack: entry.config.avgStack || null,
        playersRemaining: entry.config.playersRemaining || null,
        totalPlayers: entry.config.totalPlayers || null,
      } : null;

      this._lobbyChannel.send({
        type: 'broadcast',
        event: 'mini_state_update',
        payload: {
          tableId,
          phase: displayPhase,
          communityCards: state.game?.communityCards || [],
          boards: state.game?.boards || null,
          shownCards: (state.game?.shownCards || []).filter(sc => {
            const key = `${tableId}:${sc.seatIndex}`;
            return this._showCardsConsent?.get(key) === true;
          }),
          potTotal: state.game?.potTotal || 0,
          avgPotSize: entry.table?.avgPotSize || 0,
          pots: state.game?.pots || [],
          handNumber: state.game?.handNumber || 0,
          currentActorSeat: seats.findIndex(s => s.isActor),
          turnEndTime: entry.timer?.turnEndTime || null,
          turnTotalTime: entry.timer?.turnTime || 15,
          seats,
          lastHandResult: lastResult,
          lastChatMessage: lastChat,
          emojiReactions,
          tournamentOverlay: tourneyData,
          spectatorCount,
        }
      });
    } catch (e) {
      console.warn('[LobbyManager] Error broadcasting mini state:', e.message);
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
