/**
 * Smarter.Poker — Tournament Engine
 * Module: TournamentController
 * ═══════════════════════════════════════════════════════════════
 *
 * Manages all tournament formats on top of the cash game engine.
 * Each tournament table is a standard TableManager instance.
 *
 * Tournament Types:
 *   MTT   — Multi-Table Tournament (single club)
 *   SNG   — Sit & Go (auto-start when full)
 *   SPIN  — 3-player hyper-turbo with random prize multiplier
 *   XMTT  — Cross-club/union tournament (multiple clubs)
 *
 * Lifecycle: SCHEDULED → REGISTERING → [LATE_REG] → RUNNING → [BREAK] → [FINAL_TABLE] → COMPLETE
 *   SNG:  REGISTERING → RUNNING → COMPLETE (no late reg, no scheduled)
 *   SPIN: REGISTERING → RUNNING → COMPLETE (3 players, instant start)
 *
 * Integrates with ClubLedger for:
 *   - Buy-in deductions from club_members.chip_balance
 *   - Payout credits to chip_balance
 *   - Rake to club treasury
 *   - Agent commissions & rakeback
 *   - Weekly settlement tracking
 *   - Cross-club balance flows (xMTT)
 */

const EventEmitter = require('events');

// ═══════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════

const TOURNAMENT_TYPE = {
  MTT: 'mtt',
  SNG: 'sng',
  SPIN: 'spin',
  XMTT: 'xmtt',
};

const TOURNAMENT_STATUS = {
  SCHEDULED: 'scheduled',
  REGISTERING: 'registering',
  LATE_REG: 'late_reg',
  RUNNING: 'running',
  BREAK: 'break',
  FINAL_TABLE: 'final_table',
  COMPLETE: 'complete',
  CANCELLED: 'cancelled',
};

const ENTRY_STATUS = {
  REGISTERED: 'registered',
  ACTIVE: 'active',
  ELIMINATED: 'eliminated',
  BUSTED_REBUY: 'busted_rebuy',
  CANCELLED: 'cancelled',
};

const MAX_TABLE_SIZE = 9;

// ═══════════════════════════════════════════════════════
// BLIND STRUCTURES
// ═══════════════════════════════════════════════════════

const DEFAULT_BLIND_STRUCTURE = [
  // Early levels — long durations, no ante
  { level: 1,  small_blind: 25,      big_blind: 50,       ante: 0,      duration: 15 },
  { level: 2,  small_blind: 50,      big_blind: 100,      ante: 0,      duration: 15 },
  { level: 3,  small_blind: 75,      big_blind: 150,      ante: 0,      duration: 15 },
  { level: 4,  small_blind: 100,     big_blind: 200,      ante: 25,     duration: 15 },
  { level: 5,  small_blind: 150,     big_blind: 300,      ante: 25,     duration: 15 },
  { level: 6,  small_blind: 200,     big_blind: 400,      ante: 50,     duration: 15 },
  { level: 7,  small_blind: 250,     big_blind: 500,      ante: 50,     duration: 15 },
  { level: 8,  small_blind: 300,     big_blind: 600,      ante: 75,     duration: 15 },
  // Mid levels — antes kick in, durations tighten
  { level: 9,  small_blind: 400,     big_blind: 800,      ante: 100,    duration: 12 },
  { level: 10, small_blind: 500,     big_blind: 1000,     ante: 100,    duration: 12 },
  { level: 11, small_blind: 600,     big_blind: 1200,     ante: 200,    duration: 12 },
  { level: 12, small_blind: 800,     big_blind: 1600,     ante: 200,    duration: 12 },
  { level: 13, small_blind: 1000,    big_blind: 2000,     ante: 300,    duration: 12 },
  { level: 14, small_blind: 1200,    big_blind: 2400,     ante: 300,    duration: 12 },
  { level: 15, small_blind: 1500,    big_blind: 3000,     ante: 400,    duration: 12 },
  { level: 16, small_blind: 2000,    big_blind: 4000,     ante: 500,    duration: 12 },
  // Late levels
  { level: 17, small_blind: 2500,    big_blind: 5000,     ante: 500,    duration: 10 },
  { level: 18, small_blind: 3000,    big_blind: 6000,     ante: 750,    duration: 10 },
  { level: 19, small_blind: 4000,    big_blind: 8000,     ante: 1000,   duration: 10 },
  { level: 20, small_blind: 5000,    big_blind: 10000,    ante: 1000,   duration: 10 },
  { level: 21, small_blind: 6000,    big_blind: 12000,    ante: 1500,   duration: 10 },
  { level: 22, small_blind: 8000,    big_blind: 16000,    ante: 2000,   duration: 10 },
  { level: 23, small_blind: 10000,   big_blind: 20000,    ante: 2500,   duration: 10 },
  { level: 24, small_blind: 12000,   big_blind: 24000,    ante: 3000,   duration: 10 },
  // Deep levels
  { level: 25, small_blind: 15000,   big_blind: 30000,    ante: 4000,   duration: 10 },
  { level: 26, small_blind: 20000,   big_blind: 40000,    ante: 5000,   duration: 10 },
  { level: 27, small_blind: 25000,   big_blind: 50000,    ante: 5000,   duration: 10 },
  { level: 28, small_blind: 30000,   big_blind: 60000,    ante: 8000,   duration: 10 },
  { level: 29, small_blind: 40000,   big_blind: 80000,    ante: 10000,  duration: 10 },
  { level: 30, small_blind: 50000,   big_blind: 100000,   ante: 10000,  duration: 10 },
  { level: 31, small_blind: 60000,   big_blind: 120000,   ante: 15000,  duration: 10 },
  { level: 32, small_blind: 80000,   big_blind: 160000,   ante: 20000,  duration: 10 },
  // Monster levels
  { level: 33, small_blind: 100000,  big_blind: 200000,   ante: 25000,  duration: 10 },
  { level: 34, small_blind: 120000,  big_blind: 240000,   ante: 30000,  duration: 10 },
  { level: 35, small_blind: 150000,  big_blind: 300000,   ante: 40000,  duration: 10 },
  { level: 36, small_blind: 200000,  big_blind: 400000,   ante: 50000,  duration: 10 },
  { level: 37, small_blind: 250000,  big_blind: 500000,   ante: 50000,  duration: 10 },
  { level: 38, small_blind: 300000,  big_blind: 600000,   ante: 75000,  duration: 10 },
  { level: 39, small_blind: 400000,  big_blind: 800000,   ante: 100000, duration: 10 },
  { level: 40, small_blind: 500000,  big_blind: 1000000,  ante: 100000, duration: 10 },
  // Nosebleed levels
  { level: 41, small_blind: 600000,  big_blind: 1200000,  ante: 150000, duration: 8 },
  { level: 42, small_blind: 800000,  big_blind: 1600000,  ante: 200000, duration: 8 },
  { level: 43, small_blind: 1000000, big_blind: 2000000,  ante: 250000, duration: 8 },
  { level: 44, small_blind: 1200000, big_blind: 2400000,  ante: 300000, duration: 8 },
  { level: 45, small_blind: 1500000, big_blind: 3000000,  ante: 400000, duration: 8 },
  { level: 46, small_blind: 2000000, big_blind: 4000000,  ante: 500000, duration: 8 },
  { level: 47, small_blind: 2500000, big_blind: 5000000,  ante: 500000, duration: 8 },
  { level: 48, small_blind: 3000000, big_blind: 6000000,  ante: 750000, duration: 8 },
  { level: 49, small_blind: 4000000, big_blind: 8000000,  ante: 1000000,duration: 8 },
  { level: 50, small_blind: 5000000, big_blind: 10000000, ante: 1000000,duration: 8 },
];

/** Hyper-turbo for SNGs */
const SNG_BLIND_STRUCTURE = [
  { level: 1, small_blind: 10, big_blind: 20, ante: 0, duration: 6 },
  { level: 2, small_blind: 15, big_blind: 30, ante: 0, duration: 6 },
  { level: 3, small_blind: 25, big_blind: 50, ante: 5, duration: 6 },
  { level: 4, small_blind: 50, big_blind: 100, ante: 10, duration: 5 },
  { level: 5, small_blind: 75, big_blind: 150, ante: 15, duration: 5 },
  { level: 6, small_blind: 100, big_blind: 200, ante: 25, duration: 5 },
  { level: 7, small_blind: 150, big_blind: 300, ante: 30, duration: 4 },
  { level: 8, small_blind: 200, big_blind: 400, ante: 50, duration: 4 },
  { level: 9, small_blind: 300, big_blind: 600, ante: 75, duration: 4 },
  { level: 10, small_blind: 500, big_blind: 1000, ante: 100, duration: 3 },
  { level: 11, small_blind: 750, big_blind: 1500, ante: 150, duration: 3 },
  { level: 12, small_blind: 1000, big_blind: 2000, ante: 200, duration: 3 },
];

/** Hyper-turbo for Spins (very fast) */
const SPIN_BLIND_STRUCTURE = [
  { level: 1, small_blind: 10, big_blind: 20, ante: 0, duration: 3 },
  { level: 2, small_blind: 20, big_blind: 40, ante: 0, duration: 3 },
  { level: 3, small_blind: 30, big_blind: 60, ante: 0, duration: 3 },
  { level: 4, small_blind: 50, big_blind: 100, ante: 0, duration: 2 },
  { level: 5, small_blind: 75, big_blind: 150, ante: 0, duration: 2 },
  { level: 6, small_blind: 100, big_blind: 200, ante: 0, duration: 2 },
  { level: 7, small_blind: 150, big_blind: 300, ante: 0, duration: 2 },
  { level: 8, small_blind: 250, big_blind: 500, ante: 0, duration: 1 },
];

// ═══════════════════════════════════════════════════════
// SPIN MULTIPLIER TABLE
// ═══════════════════════════════════════════════════════
// Weighted random: lower multipliers much more common
// Total weight = 1,000,000 for precise probability

const SPIN_MULTIPLIERS = [
  { multiplier: 2, weight: 749750, payouts: [{ place: 1, percentage: 100 }] },
  { multiplier: 3, weight: 200000, payouts: [{ place: 1, percentage: 100 }] },
  { multiplier: 5, weight: 37500, payouts: [{ place: 1, percentage: 100 }] },
  { multiplier: 10, weight: 10000, payouts: [{ place: 1, percentage: 80 }, { place: 2, percentage: 20 }] },
  { multiplier: 25, weight: 2000, payouts: [{ place: 1, percentage: 70 }, { place: 2, percentage: 20 }, { place: 3, percentage: 10 }] },
  { multiplier: 100, weight: 500, payouts: [{ place: 1, percentage: 60 }, { place: 2, percentage: 25 }, { place: 3, percentage: 15 }] },
  { multiplier: 1000, weight: 250, payouts: [{ place: 1, percentage: 50 }, { place: 2, percentage: 30 }, { place: 3, percentage: 20 }] },
];

// ═══════════════════════════════════════════════════════
// PAYOUT STRUCTURES
// ═══════════════════════════════════════════════════════

const DEFAULT_PAYOUT_STRUCTURES = {
  2: [{ place: 1, percentage: 100 }],
  6: [{ place: 1, percentage: 65 }, { place: 2, percentage: 35 }],
  10: [{ place: 1, percentage: 50 }, { place: 2, percentage: 30 }, { place: 3, percentage: 20 }],
  18: [
    { place: 1, percentage: 40 }, { place: 2, percentage: 25 },
    { place: 3, percentage: 18 }, { place: 4, percentage: 10 }, { place: 5, percentage: 7 },
  ],
  27: [
    { place: 1, percentage: 35 }, { place: 2, percentage: 22 },
    { place: 3, percentage: 15 }, { place: 4, percentage: 10 }, { place: 5, percentage: 7 },
    { place: 6, percentage: 5.5 }, { place: 7, percentage: 5.5 },
  ],
  45: [
    { place: 1, percentage: 30 }, { place: 2, percentage: 20 },
    { place: 3, percentage: 14 }, { place: 4, percentage: 10 }, { place: 5, percentage: 7 },
    { place: 6, percentage: 5 }, { place: 7, percentage: 4 },
    { place: 8, percentage: 3 }, { place: 9, percentage: 2.5 }, { place: 10, percentage: 2 },
    { place: 11, percentage: 1.5 }, { place: 12, percentage: 1 },
  ],
};

/** SNG payouts by size */
const SNG_PAYOUT_STRUCTURES = {
  2: [{ place: 1, percentage: 100 }],                              // Heads-up
  3: [{ place: 1, percentage: 100 }],                              // 3-max (spin default)
  6: [{ place: 1, percentage: 65 }, { place: 2, percentage: 35 }], // 6-max
  9: [{ place: 1, percentage: 50 }, { place: 2, percentage: 30 }, { place: 3, percentage: 20 }], // Full ring
};


// ═══════════════════════════════════════════════════════
// TOURNAMENT CONTROLLER
// ═══════════════════════════════════════════════════════

class TournamentController extends EventEmitter {
  /**
   * @param {Object} config
   * @param {string} [config.tournamentType='mtt'] — 'mtt' | 'sng' | 'spin' | 'xmtt'
   * @param {string} config.tournamentId
   * @param {string} config.name
   * @param {string} [config.variant='holdem']
   * @param {number} config.startingChips
   * @param {number} config.buyinAmount — the play-money cost (deducted from chip_balance)
   * @param {number} [config.buyinFee=0] — rake/house fee (goes to club treasury)
   * @param {Array}  [config.blindStructure]
   * @param {Array}  [config.breakSchedule]
   * @param {Array}  [config.payoutStructure]
   * @param {number} [config.maxEntries]
   * @param {number} [config.minEntries=2]
   * @param {number} [config.lateRegLevels=6]
   * @param {boolean} [config.allowsRebuys=false]
   * @param {number} [config.maxRebuys=0]
   * @param {number} [config.rebuyEndLevel=Infinity]
   * @param {number} [config.rebuyChips]
   * @param {number} [config.rebuyAmount] — cost of rebuy in chips
   * @param {boolean} [config.allowsAddon=false]
   * @param {number} [config.addonChips]
   * @param {number} [config.addonAmount] — cost of addon in chips
   * @param {number} [config.addonAtBreak]
   * @param {number} [config.maxTableSize=9]
   * @param {number} [config.autoStartDelay=2000] — ms, 0 = sync/manual
   *
   * Club context:
   * @param {string} [config.clubId] — owning club UUID
   * @param {string} [config.unionId] — for xMTT: union UUID
   * @param {string[]} [config.clubIds] — for xMTT: participating club UUIDs
   *
   * Spin-specific:
   * @param {number} [config.spinMultiplier] — force specific multiplier (testing)
   *
   * SNG-specific:
   * @param {number} [config.sngSize=6] — 2, 3, 6, or 9 players
   *
   * External:
   * @param {Object} [config.ledger] — ClubLedger instance for balance ops
   * @param {Object} [config.gameController] — GameController instance
   */
  constructor(config) {
    super();

    // ── Type & Identity ──
    this.tournamentType = config.tournamentType || TOURNAMENT_TYPE.MTT;
    this.tournamentId = config.tournamentId || `tourn_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    this.name = config.name || 'Tournament';
    this.variant = config.variant || 'holdem';

    // ── Club Context ──
    this.clubId = config.clubId || null;
    this.unionId = config.unionId || null;
    this.clubIds = config.clubIds || (this.clubId ? [this.clubId] : []);

    // ── Chip & Financial ──
    this.startingChips = config.startingChips || 10000;
    this.buyinAmount = config.buyinAmount || 50;
    this.buyinFee = config.buyinFee || 0;
    this.rebuyAmount = config.rebuyAmount || this.buyinAmount;
    this.addonAmount = config.addonAmount || this.buyinAmount;

    // ── Size Limits ──
    this.maxTableSize = config.maxTableSize || MAX_TABLE_SIZE;
    this.minEntries = config.minEntries || 2;

    // ── Type-specific defaults ──
    if (this.tournamentType === TOURNAMENT_TYPE.SPIN) {
      this.maxEntries = 3;
      this.minEntries = 3;
      this.sngSize = 3;
      this.maxTableSize = 3;
      this.lateRegLevels = 0;
      this.allowsRebuys = false;
      this.allowsAddon = false;
      this.spinMultiplier = config.spinMultiplier || null; // drawn at start
      this.spinPayouts = null;
      this.blindStructure = this._normalizeBlindStructure(config.blindStructure || SPIN_BLIND_STRUCTURE);
      this.breakSchedule = [];
      this.payoutStructure = null; // set after multiplier draw
    } else if (this.tournamentType === TOURNAMENT_TYPE.SNG) {
      this.sngSize = config.sngSize || 6;
      this.maxEntries = this.sngSize;
      this.minEntries = this.sngSize;
      this.maxTableSize = Math.min(this.sngSize, MAX_TABLE_SIZE);
      this.lateRegLevels = 0; // no late reg for SNG
      this.allowsRebuys = config.allowsRebuys || false;
      this.maxRebuys = config.maxRebuys || 0;
      this.rebuyEndLevel = config.rebuyEndLevel || Infinity;
      this.rebuyChips = config.rebuyChips || this.startingChips;
      this.allowsAddon = config.allowsAddon || false;
      this.addonChips = config.addonChips || this.startingChips;
      this.addonAtBreak = config.addonAtBreak || null;
      this.blindStructure = this._normalizeBlindStructure(config.blindStructure || SNG_BLIND_STRUCTURE);
      this.breakSchedule = config.breakSchedule || [];
      this.payoutStructure = config.payoutStructure || SNG_PAYOUT_STRUCTURES[this.sngSize] || null;
    } else {
      // MTT / XMTT
      this.maxEntries = config.maxEntries || Infinity;
      this.lateRegLevels = config.lateRegLevels !== undefined ? config.lateRegLevels : 6;
      this.allowsRebuys = config.allowsRebuys || false;
      this.maxRebuys = config.maxRebuys || 0;
      this.rebuyEndLevel = config.rebuyEndLevel || Infinity;
      this.rebuyChips = config.rebuyChips || this.startingChips;
      this.allowsAddon = config.allowsAddon || false;
      this.addonChips = config.addonChips || this.startingChips;
      this.addonAtBreak = config.addonAtBreak || null;
      this.blindStructure = this._normalizeBlindStructure(config.blindStructure || DEFAULT_BLIND_STRUCTURE);
      this.breakSchedule = config.breakSchedule || [];
      this.payoutStructure = config.payoutStructure || null;
    }

    // ── External References ──
    this.ledger = config.ledger || null;
    this.gameController = config.gameController || null;
    this.autoStartDelay = config.autoStartDelay !== undefined ? config.autoStartDelay : 2000;

    // ── Synchronized Breaks (MTT/XMTT: 5 min at :05 of every hour) ──
    this.synchronizedBreaks = config.synchronizedBreaks !== undefined
      ? config.synchronizedBreaks
      : (this.tournamentType !== TOURNAMENT_TYPE.SNG && this.tournamentType !== TOURNAMENT_TYPE.SPIN);
    this.syncBreakMinuteOfHour = config.syncBreakMinuteOfHour || 5;   // :05
    this.syncBreakDuration = config.syncBreakDuration || 5;            // 5 minutes
    this._syncBreakTimer = null;
    this._lastSyncBreakHour = -1;

    // ── State ──
    this.status = this.tournamentType === TOURNAMENT_TYPE.SNG || this.tournamentType === TOURNAMENT_TYPE.SPIN
      ? TOURNAMENT_STATUS.REGISTERING // SNG/Spin go straight to registering
      : TOURNAMENT_STATUS.SCHEDULED;
    this.currentLevel = 0;
    this.levelStartedAt = null;
    this.handsPlayed = 0;

    // Player tracking: Map<playerId, EntryObject>
    this.entries = new Map();
    this.eliminationOrder = [];

    // Table tracking: Map<tableId, { table, players: Set<playerId> }>
    this.tables = new Map();
    this.tableCounter = 0;

    // Timers
    this._levelTimer = null;
    this._balanceTimer = null;
    this._breakTimer = null;

    // Financial tracking
    this.totalChipsInPlay = 0;
    this.prizePool = 0;
    this.totalRake = 0;
    this.totalRebuys = 0;
    this.totalAddons = 0;

    // xMTT: per-club tracking
    this.clubEntries = new Map(); // Map<clubId, Set<playerId>>
    this.clubRake = new Map();    // Map<clubId, number>
  }

  // ═══════════════════════════════════════════════════════
  // LIFECYCLE
  // ═══════════════════════════════════════════════════════

  /** Open registration (MTT/xMTT only — SNG/Spin start in registering). */
  openRegistration() {
    if (this.status !== TOURNAMENT_STATUS.SCHEDULED) {
      return { success: false, error: `Cannot open registration from ${this.status}` };
    }
    this.status = TOURNAMENT_STATUS.REGISTERING;
    this.emit('status_change', { status: this.status });
    return { success: true };
  }

  /** Start the tournament. SNG/Spin auto-call this when full. */
  start() {
    if (this.status !== TOURNAMENT_STATUS.REGISTERING && this.status !== TOURNAMENT_STATUS.LATE_REG) {
      return { success: false, error: `Cannot start from ${this.status}` };
    }

    const activeEntries = this._getRegisteredEntries();
    if (activeEntries.length < this.minEntries) {
      return { success: false, error: `Need ${this.minEntries} players (have ${activeEntries.length})` };
    }

    // Spin: draw multiplier
    if (this.tournamentType === TOURNAMENT_TYPE.SPIN) {
      this._drawSpinMultiplier();
    }

    // Calculate initial prize pool
    this.prizePool = this._calculatePrizePool();

    // Seat all players
    this._seatAllPlayers(activeEntries);

    // Start blind clock
    this.currentLevel = 1;
    this.status = this.lateRegLevels > 0 ? TOURNAMENT_STATUS.LATE_REG : TOURNAMENT_STATUS.RUNNING;
    this._startLevelClock();
    if (this.tables.size > 1) this._startBalanceChecker();
    if (this.synchronizedBreaks) this._startSyncBreakChecker();

    // Start hands at all tables
    for (const [, tableInfo] of this.tables) {
      if (tableInfo.table._autoStartTimer) {
        clearTimeout(tableInfo.table._autoStartTimer);
        tableInfo.table._autoStartTimer = null;
      }
      const active = tableInfo.table.seats.filter(s => s.player && s.stack > 0);
      if (active.length >= 2) {
        tableInfo.table.startNextHand();
      }
    }

    this.emit('tournament_started', {
      tournamentId: this.tournamentId,
      type: this.tournamentType,
      players: activeEntries.length,
      tables: this.tables.size,
      startingChips: this.startingChips,
      prizePool: this.prizePool,
      level: this.currentLevel,
      blinds: this.getCurrentBlinds(),
      spinMultiplier: this.spinMultiplier || undefined,
      clubId: this.clubId,
      unionId: this.unionId,
    });

    return { success: true, tables: this.tables.size, players: activeEntries.length };
  }

  // ═══════════════════════════════════════════════════════
  // REGISTRATION
  // ═══════════════════════════════════════════════════════

  /**
   * Register a player.
   * @param {string} playerId
   * @param {string} playerName
   * @param {Object} [options]
   * @param {string} [options.clubId] — which club this player belongs to (for xMTT)
   * @returns {{ success: boolean, entry?: Object, error?: string }}
   */
  registerPlayer(playerId, playerName, options = {}) {
    // Status check
    const canRegister = this.status === TOURNAMENT_STATUS.REGISTERING ||
      this.status === TOURNAMENT_STATUS.LATE_REG ||
      (this.status === TOURNAMENT_STATUS.RUNNING && this.currentLevel <= this.lateRegLevels);

    if (!canRegister) return { success: false, error: 'Registration is not open' };

    // Late reg window check
    if (this.status === TOURNAMENT_STATUS.RUNNING && this.currentLevel > this.lateRegLevels) {
      return { success: false, error: 'Late registration has closed' };
    }

    // Duplicate check
    if (this.entries.has(playerId) && this.entries.get(playerId).status !== ENTRY_STATUS.CANCELLED) {
      return { success: false, error: 'Already registered' };
    }

    // Capacity check
    const activeCount = [...this.entries.values()].filter(e => e.status !== ENTRY_STATUS.CANCELLED).length;
    if (activeCount >= this.maxEntries) {
      return { success: false, error: 'Tournament is full' };
    }

    // Club context
    const playerClubId = options.clubId || this.clubId;

    // Ledger: deduct buy-in from club balance
    if (this.ledger && playerClubId) {
      const deduction = this.ledger.deductBuyin(
        playerClubId, playerId, this.buyinAmount, this.buyinFee,
        { tournamentId: this.tournamentId, type: 'tournament_buyin' }
      );
      if (!deduction.success) return { success: false, error: deduction.error };
    }

    const entry = {
      playerId,
      playerName: playerName || `Player_${playerId.slice(-4)}`,
      clubId: playerClubId,
      status: ENTRY_STATUS.REGISTERED,
      chips: this.startingChips,
      rebuyCount: 0,
      addonTaken: false,
      totalInvested: this.buyinAmount + this.buyinFee,
      registeredAt: new Date().toISOString(),
      eliminatedAt: null,
      finishPosition: null,
      payoutAmount: 0,
      tableId: null,
      seatIndex: null,
    };

    this.entries.set(playerId, entry);
    this.totalChipsInPlay += this.startingChips;
    this.totalRake += this.buyinFee;

    // xMTT: track per-club
    if (playerClubId) {
      if (!this.clubEntries.has(playerClubId)) this.clubEntries.set(playerClubId, new Set());
      this.clubEntries.get(playerClubId).add(playerId);
      this.clubRake.set(playerClubId, (this.clubRake.get(playerClubId) || 0) + this.buyinFee);
    }

    this.emit('player_registered', {
      playerId, playerName: entry.playerName, clubId: playerClubId,
      totalEntries: activeCount + 1,
    });

    // Late reg: seat immediately
    if (this.status === TOURNAMENT_STATUS.RUNNING || this.status === TOURNAMENT_STATUS.LATE_REG) {
      entry.status = ENTRY_STATUS.ACTIVE;
      this._seatLateRegistration(entry);
      this.prizePool = this._calculatePrizePool();
    }

    // SNG/Spin: auto-start when full
    if ((this.tournamentType === TOURNAMENT_TYPE.SNG || this.tournamentType === TOURNAMENT_TYPE.SPIN) &&
        this.status === TOURNAMENT_STATUS.REGISTERING) {
      const ready = [...this.entries.values()].filter(e => e.status !== ENTRY_STATUS.CANCELLED).length;
      if (ready >= this.maxEntries) {
        this.start();
      }
    }

    return { success: true, entry };
  }

  /** Cancel registration (before tournament starts). */
  cancelRegistration(playerId) {
    const entry = this.entries.get(playerId);
    if (!entry) return { success: false, error: 'Not registered' };
    if (entry.status !== ENTRY_STATUS.REGISTERED) {
      return { success: false, error: 'Cannot cancel after tournament started' };
    }

    entry.status = ENTRY_STATUS.CANCELLED;
    this.totalChipsInPlay -= this.startingChips;

    // Ledger: refund buy-in
    if (this.ledger && entry.clubId) {
      this.ledger.creditWinnings(
        entry.clubId, playerId, this.buyinAmount + this.buyinFee,
        { tournamentId: this.tournamentId, type: 'tournament_refund' }
      );
    }

    this.emit('registration_cancelled', { playerId });
    return { success: true };
  }

  // ═══════════════════════════════════════════════════════
  // SPIN MULTIPLIER
  // ═══════════════════════════════════════════════════════

  /** @private Draw a weighted random spin multiplier. */
  _drawSpinMultiplier() {
    if (this.spinMultiplier) {
      // Forced multiplier (for testing)
      const found = SPIN_MULTIPLIERS.find(s => s.multiplier === this.spinMultiplier);
      this.spinPayouts = found ? found.payouts : SPIN_MULTIPLIERS[0].payouts;
      return;
    }

    const totalWeight = SPIN_MULTIPLIERS.reduce((s, m) => s + m.weight, 0);
    let roll = Math.floor(Math.random() * totalWeight);

    for (const entry of SPIN_MULTIPLIERS) {
      roll -= entry.weight;
      if (roll < 0) {
        this.spinMultiplier = entry.multiplier;
        this.spinPayouts = entry.payouts;
        this.emit('spin_multiplier', { multiplier: entry.multiplier, payouts: entry.payouts });
        return;
      }
    }

    // Fallback
    this.spinMultiplier = SPIN_MULTIPLIERS[0].multiplier;
    this.spinPayouts = SPIN_MULTIPLIERS[0].payouts;
  }

  // ═══════════════════════════════════════════════════════
  // BLIND CLOCK
  // ═══════════════════════════════════════════════════════

  getCurrentBlinds() {
    if (this.currentLevel <= this.blindStructure.length) {
      const level = this.blindStructure[this.currentLevel - 1];
      return {
        level: this.currentLevel,
        smallBlind: level.small_blind,
        bigBlind: level.big_blind,
        ante: level.ante || 0,
        duration: level.duration,
      };
    }
    // Beyond defined structure → extrapolate
    return this._extrapolateLevel(this.currentLevel);
  }

  getNextBlinds() {
    const next = this.currentLevel + 1;
    if (next <= this.blindStructure.length) {
      const level = this.blindStructure[next - 1];
      return {
        level: next,
        smallBlind: level.small_blind,
        bigBlind: level.big_blind,
        ante: level.ante || 0,
        duration: level.duration,
      };
    }
    // Beyond structure → extrapolate next too
    return this._extrapolateLevel(next);
  }

  /**
   * Extrapolate a blind level beyond the defined structure.
   * Doubles the last defined level for each step past the end.
   * @private
   */
  _extrapolateLevel(levelNum) {
    const last = this.blindStructure[this.blindStructure.length - 1];
    const stepsOver = levelNum - this.blindStructure.length;
    const multiplier = Math.pow(2, stepsOver);

    // Round to clean numbers
    const round = (n) => {
      if (n >= 1000000) return Math.round(n / 100000) * 100000;
      if (n >= 100000) return Math.round(n / 10000) * 10000;
      if (n >= 10000) return Math.round(n / 1000) * 1000;
      if (n >= 1000) return Math.round(n / 100) * 100;
      return Math.round(n / 10) * 10;
    };

    return {
      level: levelNum,
      smallBlind: round(last.small_blind * multiplier),
      bigBlind: round(last.big_blind * multiplier),
      ante: round((last.ante || 0) * multiplier),
      duration: last.duration || 8,
    };
  }

  advanceLevel() {
    // Check custom break schedule first (per-level breaks)
    const breakInfo = this.breakSchedule.find(b => b.after_level === this.currentLevel);
    if (breakInfo) {
      this._startBreak(breakInfo);
      return;
    }
    this._doAdvanceLevel();
  }

  /** @private */
  _doAdvanceLevel() {
    this.currentLevel++;
    // NO CAP — levels extrapolate infinitely beyond the structure

    const blinds = this.getCurrentBlinds();

    // Update all tables
    for (const [, tableInfo] of this.tables) {
      tableInfo.table.updateBlinds(blinds.smallBlind, blinds.bigBlind, blinds.ante);
    }

    // Close late reg if past window
    if (this.currentLevel > this.lateRegLevels &&
        (this.status === TOURNAMENT_STATUS.LATE_REG || this.status === TOURNAMENT_STATUS.RUNNING)) {
      this.status = TOURNAMENT_STATUS.RUNNING;
    }

    this._startLevelClock();
    this.emit('level_change', { level: this.currentLevel, ...blinds, playersRemaining: this._getActivePlayers().length });
  }

  getLevelTimeRemaining() {
    if (!this.levelStartedAt) return 0;
    const blinds = this.getCurrentBlinds();
    const durationMs = (blinds.duration || 15) * 60 * 1000;
    const elapsed = Date.now() - this.levelStartedAt;
    return Math.max(0, Math.ceil((durationMs - elapsed) / 1000));
  }

  /** @private */
  _startLevelClock() {
    if (this._levelTimer) clearTimeout(this._levelTimer);
    const blinds = this.getCurrentBlinds();
    const durationMs = (blinds.duration || 15) * 60 * 1000;
    this.levelStartedAt = Date.now();

    this._levelTimer = setTimeout(() => { this.advanceLevel(); }, durationMs);
  }

  /** @private */
  _startBreak(breakInfo) {
    const prevStatus = this.status;
    this.status = TOURNAMENT_STATUS.BREAK;
    if (this._levelTimer) clearTimeout(this._levelTimer);
    const durationMs = (breakInfo.duration || 10) * 60 * 1000;

    this.emit('break_started', {
      duration: breakInfo.duration,
      afterLevel: breakInfo.after_level,
      addonAvailable: this.allowsAddon && this.addonAtBreak === breakInfo.after_level,
    });

    this._breakTimer = setTimeout(() => {
      this.status = (prevStatus === TOURNAMENT_STATUS.LATE_REG) ? TOURNAMENT_STATUS.LATE_REG : TOURNAMENT_STATUS.RUNNING;
      this._doAdvanceLevel();
      this.emit('break_ended', { level: this.currentLevel, ...this.getCurrentBlinds() });
      // Re-start sync break checker after break ends
      if (this.synchronizedBreaks) this._startSyncBreakChecker();
    }, durationMs);
  }

  // ── Synchronized Breaks (MTT/XMTT) ──────────────────

  /**
   * Start the wall-clock break checker.
   * Checks every 15 seconds whether it's :05 of the hour.
   * When triggered, pauses the level timer and starts a 5-minute break.
   * All tables across the tournament break at the same real-world time.
   * @private
   */
  _startSyncBreakChecker() {
    if (this._syncBreakTimer) clearInterval(this._syncBreakTimer);

    this._syncBreakTimer = setInterval(() => {
      if (this.status === TOURNAMENT_STATUS.BREAK ||
          this.status === TOURNAMENT_STATUS.COMPLETE ||
          this.status === TOURNAMENT_STATUS.CANCELLED) return;

      const now = new Date();
      const minute = now.getMinutes();
      const hour = now.getHours();

      // Trigger at :05 (configurable), once per hour
      if (minute === this.syncBreakMinuteOfHour && hour !== this._lastSyncBreakHour) {
        this._lastSyncBreakHour = hour;
        this._triggerSyncBreak();
      }
    }, 15000); // check every 15 seconds
  }

  /**
   * Trigger a synchronized break.
   * Can also be called manually: tournament.triggerSyncBreak()
   */
  triggerSyncBreak() {
    this._triggerSyncBreak();
  }

  /** @private */
  _triggerSyncBreak() {
    if (this.status === TOURNAMENT_STATUS.BREAK || this.status === TOURNAMENT_STATUS.COMPLETE) return;

    const prevStatus = this.status;
    this.status = TOURNAMENT_STATUS.BREAK;

    // Pause level timer — save remaining time
    if (this._levelTimer) {
      clearTimeout(this._levelTimer);
      this._levelTimer = null;
    }
    const elapsed = this.levelStartedAt ? Date.now() - this.levelStartedAt : 0;
    const blinds = this.getCurrentBlinds();
    const fullDurationMs = (blinds.duration || 15) * 60 * 1000;
    this._pausedLevelRemaining = Math.max(0, fullDurationMs - elapsed);

    // Stop sync checker during break
    if (this._syncBreakTimer) { clearInterval(this._syncBreakTimer); this._syncBreakTimer = null; }

    const durationMs = this.syncBreakDuration * 60 * 1000;

    this.emit('break_started', {
      type: 'synchronized',
      duration: this.syncBreakDuration,
      currentLevel: this.currentLevel,
      resumeIn: this.syncBreakDuration,
    });

    this._breakTimer = setTimeout(() => {
      this.status = (prevStatus === TOURNAMENT_STATUS.LATE_REG) ? TOURNAMENT_STATUS.LATE_REG : TOURNAMENT_STATUS.RUNNING;

      // Resume level timer with remaining time
      this.levelStartedAt = Date.now();
      if (this._pausedLevelRemaining > 0) {
        this._levelTimer = setTimeout(() => {
          this.advanceLevel();
        }, this._pausedLevelRemaining);
      }

      this.emit('break_ended', {
        type: 'synchronized',
        level: this.currentLevel,
        ...this.getCurrentBlinds(),
      });

      // Restart sync break checker
      if (this.synchronizedBreaks) this._startSyncBreakChecker();
    }, durationMs);
  }

  // ═══════════════════════════════════════════════════════
  // TABLE MANAGEMENT
  // ═══════════════════════════════════════════════════════

  /** @private */
  _seatAllPlayers(entries) {
    const shuffled = [...entries].sort(() => Math.random() - 0.5);
    const numTables = Math.ceil(shuffled.length / this.maxTableSize);

    for (let t = 0; t < numTables; t++) this._createTournamentTable();

    const tableIds = [...this.tables.keys()];
    for (let i = 0; i < shuffled.length; i++) {
      const entry = shuffled[i];
      const tableId = tableIds[i % numTables];
      const tableInfo = this.tables.get(tableId);
      const seatIdx = tableInfo.table.seats.findIndex(s => s.status === 'empty');
      if (seatIdx === -1) continue;

      entry.status = ENTRY_STATUS.ACTIVE;
      entry.tableId = tableId;
      entry.seatIndex = seatIdx;
      tableInfo.table.sitDown(entry.playerId, seatIdx, this.startingChips, { displayName: entry.playerName });
      tableInfo.players.add(entry.playerId);
    }

    // Cancel all auto-start timers (tournament controller manages starts)
    for (const [, ti] of this.tables) {
      if (ti.table._autoStartTimer) { clearTimeout(ti.table._autoStartTimer); ti.table._autoStartTimer = null; }
    }
  }

  /** @private */
  _createTournamentTable() {
    this.tableCounter++;
    const tableId = `${this.tournamentId}_table_${this.tableCounter}`;
    const blinds = this.currentLevel > 0 ? this.getCurrentBlinds() :
      { smallBlind: this.blindStructure[0].small_blind, bigBlind: this.blindStructure[0].big_blind, ante: this.blindStructure[0].ante || 0 };

    const { TableManager } = require('./TableManager');

    const table = new TableManager({
      tableId,
      variant: this.variant,
      bettingStructure: 'no_limit',
      maxSeats: this.maxTableSize,
      smallBlind: blinds.smallBlind,
      bigBlind: blinds.bigBlind,
      ante: blinds.ante,
      minBuyIn: 0,
      maxBuyIn: this.startingChips * 1000,
      rakePercent: 0,
      rakeCap: 0,
      autoStartDelay: 999999999, // we manage starts
    });

    if (table._autoStartTimer) { clearTimeout(table._autoStartTimer); table._autoStartTimer = null; }

    // Wire hand completion
    table.game.on('hand_complete', (result) => this._onHandComplete(tableId, result));

    this.tables.set(tableId, { table, players: new Set() });
    this.emit('table_created', { tableId, tableNumber: this.tableCounter });
    return tableId;
  }

  /** @private */
  _seatLateRegistration(entry) {
    let bestTable = null;
    let minPlayers = Infinity;

    for (const [tableId, tableInfo] of this.tables) {
      const count = tableInfo.players.size;
      const hasOpen = tableInfo.table.seats.some(s => s.status === 'empty');
      if (hasOpen && count < minPlayers) { minPlayers = count; bestTable = tableId; }
    }

    if (!bestTable) bestTable = this._createTournamentTable();

    const tableInfo = this.tables.get(bestTable);
    const seatIdx = tableInfo.table.seats.findIndex(s => s.status === 'empty');
    if (seatIdx === -1) return;

    entry.tableId = bestTable;
    entry.seatIndex = seatIdx;
    tableInfo.table.sitDown(entry.playerId, seatIdx, this.startingChips, { displayName: entry.playerName });
    tableInfo.players.add(entry.playerId);

    // Clear auto-start
    if (tableInfo.table._autoStartTimer) { clearTimeout(tableInfo.table._autoStartTimer); tableInfo.table._autoStartTimer = null; }

    this.emit('player_seated', { playerId: entry.playerId, tableId: bestTable, seatIndex: seatIdx });
  }

  // ═══════════════════════════════════════════════════════
  // HAND COMPLETION & ELIMINATION
  // ═══════════════════════════════════════════════════════

  /** @private */
  _onHandComplete(tableId, result) {
    this.handsPlayed++;
    const tableInfo = this.tables.get(tableId);
    if (!tableInfo) return;

    // Check eliminations
    for (const seat of tableInfo.table.seats) {
      if (seat.player && seat.stack <= 0) {
        this._handleElimination(seat.player.id, tableId);
      }
    }

    // Victory / final table check
    const remaining = this._getActivePlayers();
    if (remaining.length === 1) {
      this._handleVictory(remaining[0]);
      return;
    }
    if (this.tables.size > 1 && remaining.length <= this.maxTableSize) {
      this._consolidateToFinalTable();
    }

    // Auto-start next hand
    if (this.status === TOURNAMENT_STATUS.COMPLETE || this.status === TOURNAMENT_STATUS.BREAK) return;
    if (this.autoStartDelay > 0 && this.tables.has(tableId)) {
      const ap = tableInfo.table.seats.filter(s => s.player && s.stack > 0);
      if (ap.length >= 2) {
        setTimeout(() => {
          if (this.tables.has(tableId) && this.status !== TOURNAMENT_STATUS.COMPLETE) {
            tableInfo.table.startNextHand();
          }
        }, this.autoStartDelay);
      }
    }
  }

  /** @private */
  _handleElimination(playerId, tableId) {
    const entry = this.entries.get(playerId);
    if (!entry || entry.status === ENTRY_STATUS.ELIMINATED) return;

    const remaining = this._getActivePlayers();

    // Can rebuy?
    if (this.allowsRebuys && entry.rebuyCount < this.maxRebuys && this.currentLevel <= this.rebuyEndLevel) {
      entry.status = ENTRY_STATUS.BUSTED_REBUY;
      entry.chips = 0;
      this.emit('player_busted', { playerId, playerName: entry.playerName, canRebuy: true, remainingPlayers: remaining.length - 1 });
      return;
    }

    // Permanent elimination
    entry.status = ENTRY_STATUS.ELIMINATED;
    entry.chips = 0;
    entry.eliminatedAt = new Date().toISOString();
    entry.finishPosition = remaining.length;
    this.eliminationOrder.unshift(playerId);

    // Force-remove from seat (player has 0 chips)
    const tableInfo = this.tables.get(tableId);
    if (tableInfo) {
      const seat = tableInfo.table.seats.find(s => s.player && String(s.player.id) === String(playerId));
      if (seat) { seat.player = null; seat.stack = 0; seat.status = 'empty'; }
      tableInfo.players.delete(playerId);
    }

    this.emit('player_eliminated', {
      playerId, playerName: entry.playerName, clubId: entry.clubId,
      finishPosition: entry.finishPosition, remainingPlayers: remaining.length - 1,
    });

    this._checkTableBalance();
  }

  // ═══════════════════════════════════════════════════════
  // REBUY & ADDON
  // ═══════════════════════════════════════════════════════

  processRebuy(playerId) {
    const entry = this.entries.get(playerId);
    if (!entry) return { success: false, error: 'Player not found' };
    if (entry.status !== ENTRY_STATUS.BUSTED_REBUY) return { success: false, error: 'Cannot rebuy right now' };
    if (!this.allowsRebuys) return { success: false, error: 'Rebuys not allowed' };
    if (entry.rebuyCount >= this.maxRebuys) return { success: false, error: 'Max rebuys reached' };
    if (this.currentLevel > this.rebuyEndLevel) return { success: false, error: 'Rebuy window closed' };

    // Ledger: deduct rebuy cost
    if (this.ledger && entry.clubId) {
      const d = this.ledger.deductBuyin(entry.clubId, playerId, this.rebuyAmount, 0,
        { tournamentId: this.tournamentId, type: 'tournament_rebuy' });
      if (!d.success) return { success: false, error: d.error };
    }

    entry.rebuyCount++;
    entry.chips = this.rebuyChips;
    entry.totalInvested += this.rebuyAmount;
    entry.status = ENTRY_STATUS.ACTIVE;
    this.totalChipsInPlay += this.rebuyChips;
    this.totalRebuys++;
    this.prizePool = this._calculatePrizePool();

    // Re-seat
    const tableInfo = this.tables.get(entry.tableId);
    if (tableInfo) {
      tableInfo.table.sitDown(playerId, entry.seatIndex, this.rebuyChips, { displayName: entry.playerName });
      tableInfo.players.add(playerId);
      if (tableInfo.table._autoStartTimer) { clearTimeout(tableInfo.table._autoStartTimer); tableInfo.table._autoStartTimer = null; }
    }

    this.emit('player_rebuy', { playerId, playerName: entry.playerName, rebuyNumber: entry.rebuyCount, newPrizePool: this.prizePool });
    return { success: true, chips: this.rebuyChips, rebuyCount: entry.rebuyCount };
  }

  processAddon(playerId) {
    const entry = this.entries.get(playerId);
    if (!entry) return { success: false, error: 'Player not found' };
    if (!this.allowsAddon) return { success: false, error: 'Add-ons not allowed' };
    if (entry.addonTaken) return { success: false, error: 'Already took add-on' };
    if (entry.status !== ENTRY_STATUS.ACTIVE) return { success: false, error: 'Player not active' };

    // Ledger: deduct
    if (this.ledger && entry.clubId) {
      const d = this.ledger.deductBuyin(entry.clubId, playerId, this.addonAmount, 0,
        { tournamentId: this.tournamentId, type: 'tournament_addon' });
      if (!d.success) return { success: false, error: d.error };
    }

    entry.addonTaken = true;
    entry.chips += this.addonChips;
    entry.totalInvested += this.addonAmount;
    this.totalChipsInPlay += this.addonChips;
    this.totalAddons++;
    this.prizePool = this._calculatePrizePool();

    const tableInfo = this.tables.get(entry.tableId);
    if (tableInfo) tableInfo.table.addChips(playerId, this.addonChips);

    this.emit('player_addon', { playerId, playerName: entry.playerName, addonChips: this.addonChips });
    return { success: true, chips: this.addonChips };
  }

  // ═══════════════════════════════════════════════════════
  // TABLE BALANCING
  // ═══════════════════════════════════════════════════════

  /** @private */
  _startBalanceChecker() {
    if (this._balanceTimer) clearInterval(this._balanceTimer);
    this._balanceTimer = setInterval(() => {
      if (this.status === TOURNAMENT_STATUS.RUNNING || this.status === TOURNAMENT_STATUS.LATE_REG ||
          this.status === TOURNAMENT_STATUS.FINAL_TABLE) {
        this._checkTableBalance();
      }
    }, 5000);
  }

  /** @private */
  _checkTableBalance() {
    if (this.tables.size <= 1) return;

    // Remove empty tables
    for (const [tableId, tableInfo] of this.tables) {
      if (tableInfo.players.size === 0) {
        this.tables.delete(tableId);
        this.emit('table_closed', { tableId });
      }
    }
    if (this.tables.size <= 1) return;

    let maxTable = null, maxCount = 0, minTable = null, minCount = Infinity;
    for (const [tableId, tableInfo] of this.tables) {
      const c = tableInfo.players.size;
      if (c > maxCount) { maxCount = c; maxTable = tableId; }
      if (c < minCount) { minCount = c; minTable = tableId; }
    }

    if (maxCount - minCount <= 1) return;

    const sourceInfo = this.tables.get(maxTable);
    const destInfo = this.tables.get(minTable);

    // Find movable player (not in active hand)
    let playerToMove = null;
    for (const seat of sourceInfo.table.seats) {
      if (seat.player && seat.stack > 0) {
        const inHand = sourceInfo.table.game.phase !== 'idle' &&
          sourceInfo.table.game.currentHand?.players.some(p => p.id === seat.player.id && !p.folded);
        if (!inHand) {
          playerToMove = { id: seat.player.id, stack: seat.stack, displayName: seat.player.displayName };
          break;
        }
      }
    }
    if (!playerToMove) return;

    // Force-remove from source
    const srcSeat = sourceInfo.table.seats.find(s => s.player && String(s.player.id) === String(playerToMove.id));
    if (srcSeat) { srcSeat.player = null; srcSeat.stack = 0; srcSeat.status = 'empty'; }
    sourceInfo.players.delete(playerToMove.id);

    const destSeat = destInfo.table.seats.findIndex(s => s.status === 'empty');
    if (destSeat === -1) return;

    destInfo.table.sitDown(playerToMove.id, destSeat, playerToMove.stack, { displayName: playerToMove.displayName });
    destInfo.players.add(playerToMove.id);
    if (destInfo.table._autoStartTimer) { clearTimeout(destInfo.table._autoStartTimer); destInfo.table._autoStartTimer = null; }

    const entry = this.entries.get(playerToMove.id);
    if (entry) { entry.tableId = minTable; entry.seatIndex = destSeat; }

    this.emit('player_moved', { playerId: playerToMove.id, fromTable: maxTable, toTable: minTable });
  }

  /** @private */
  _consolidateToFinalTable() {
    if (this.tables.size <= 1) return;
    const remaining = this._getActivePlayers();
    if (remaining.length > this.maxTableSize) return;

    this.status = TOURNAMENT_STATUS.FINAL_TABLE;
    const finalTableId = [...this.tables.keys()][0];
    const finalInfo = this.tables.get(finalTableId);
    const otherIds = [...this.tables.keys()].filter(id => id !== finalTableId);

    for (const tableId of otherIds) {
      const tableInfo = this.tables.get(tableId);
      for (const seat of tableInfo.table.seats) {
        if (seat.player && seat.stack > 0) {
          const pid = seat.player.id;
          const stack = seat.stack;
          const displayName = seat.player.displayName;
          // Force vacate source
          seat.player = null; seat.stack = 0; seat.status = 'empty';

          const ds = finalInfo.table.seats.findIndex(s => s.status === 'empty');
          if (ds !== -1) {
            finalInfo.table.sitDown(pid, ds, stack, { displayName });
            finalInfo.players.add(pid);
            const e = this.entries.get(pid);
            if (e) { e.tableId = finalTableId; e.seatIndex = ds; }
          }
        }
      }
      this.tables.delete(tableId);
    }

    // Clear auto-start on final table
    if (finalInfo.table._autoStartTimer) { clearTimeout(finalInfo.table._autoStartTimer); finalInfo.table._autoStartTimer = null; }

    this.emit('final_table', {
      tableId: finalTableId,
      players: remaining.map(e => ({ playerId: e.playerId, playerName: e.playerName, chips: e.chips, clubId: e.clubId })),
    });
  }

  // ═══════════════════════════════════════════════════════
  // VICTORY & PAYOUTS
  // ═══════════════════════════════════════════════════════

  /** @private */
  _handleVictory(winner) {
    winner.finishPosition = 1;
    this.eliminationOrder.unshift(winner.playerId);

    const payouts = this.calculatePayouts();
    for (const payout of payouts) {
      const entry = this.entries.get(payout.playerId);
      if (entry) entry.payoutAmount = payout.amount;
    }

    // Ledger: credit winnings + process rake
    if (this.ledger) {
      for (const payout of payouts) {
        const entry = this.entries.get(payout.playerId);
        if (entry?.clubId) {
          this.ledger.creditWinnings(entry.clubId, payout.playerId, payout.amount,
            { tournamentId: this.tournamentId, type: 'tournament_payout', place: payout.place });
        }
      }
      // Process rake per-club
      if (this.tournamentType === TOURNAMENT_TYPE.XMTT) {
        for (const [cid, rake] of this.clubRake) {
          this.ledger.processRake(cid, rake, { tournamentId: this.tournamentId, type: 'tournament_rake' });
        }
      } else if (this.clubId) {
        this.ledger.processRake(this.clubId, this.totalRake, { tournamentId: this.tournamentId, type: 'tournament_rake' });
      }
    }

    this.status = TOURNAMENT_STATUS.COMPLETE;
    if (this._levelTimer) clearTimeout(this._levelTimer);
    if (this._balanceTimer) clearInterval(this._balanceTimer);
    if (this._breakTimer) clearTimeout(this._breakTimer);

    this.emit('tournament_complete', {
      tournamentId: this.tournamentId, type: this.tournamentType,
      winner: { playerId: winner.playerId, playerName: winner.playerName, clubId: winner.clubId },
      payouts, totalHands: this.handsPlayed, totalEntries: this.entries.size,
      prizePool: this.prizePool, totalRake: this.totalRake,
      spinMultiplier: this.spinMultiplier || undefined,
    });
  }

  /** Calculate payouts based on structure and prize pool. */
  calculatePayouts() {
    let structure;

    if (this.tournamentType === TOURNAMENT_TYPE.SPIN && this.spinPayouts) {
      structure = this.spinPayouts;
      // Spin prize pool = buyin * 3 * multiplier (less rake)
      this.prizePool = this.buyinAmount * 3 * this.spinMultiplier;
    } else {
      const totalEntries = [...this.entries.values()].filter(e => e.status !== ENTRY_STATUS.CANCELLED).length;
      structure = this.payoutStructure || this._getDefaultPayoutStructure(totalEntries);
    }

    const finishOrder = [...this.eliminationOrder];
    const payouts = [];

    for (let i = 0; i < structure.length && i < finishOrder.length; i++) {
      const playerId = finishOrder[i];
      const entry = this.entries.get(playerId);
      const amount = Math.floor(this.prizePool * (structure[i].percentage / 100));

      payouts.push({
        place: i + 1, playerId, playerName: entry?.playerName || playerId,
        clubId: entry?.clubId, amount, percentage: structure[i].percentage,
      });
    }

    return payouts;
  }

  // ═══════════════════════════════════════════════════════
  // STATE QUERIES
  // ═══════════════════════════════════════════════════════

  getState() {
    const remaining = this._getActivePlayers();
    const blinds = this.currentLevel > 0 ? this.getCurrentBlinds() : null;
    return {
      tournamentId: this.tournamentId, name: this.name,
      tournamentType: this.tournamentType, status: this.status,
      clubId: this.clubId, unionId: this.unionId,
      currentLevel: this.currentLevel, blinds, nextBlinds: this.getNextBlinds(),
      levelTimeRemaining: this.getLevelTimeRemaining(),
      totalEntries: [...this.entries.values()].filter(e => e.status !== ENTRY_STATUS.CANCELLED).length,
      playersRemaining: remaining.length,
      averageStack: remaining.length > 0 ? Math.round(this.totalChipsInPlay / remaining.length) : 0,
      totalChipsInPlay: this.totalChipsInPlay, prizePool: this.prizePool,
      totalRake: this.totalRake, tables: this.tables.size,
      handsPlayed: this.handsPlayed,
      lateRegOpen: this.currentLevel <= this.lateRegLevels && this.lateRegLevels > 0 &&
        (this.status === TOURNAMENT_STATUS.RUNNING || this.status === TOURNAMENT_STATUS.LATE_REG),
      spinMultiplier: this.spinMultiplier || undefined,
      totalRebuys: this.totalRebuys, totalAddons: this.totalAddons,
    };
  }

  getLeaderboard() {
    return [...this.entries.values()]
      .filter(e => e.status === ENTRY_STATUS.ACTIVE)
      .sort((a, b) => b.chips - a.chips)
      .map((e, i) => ({
        rank: i + 1, playerId: e.playerId, playerName: e.playerName,
        chips: e.chips, clubId: e.clubId, tableId: e.tableId,
      }));
  }

  /** xMTT: per-club standings */
  getClubStandings() {
    const standings = [];
    for (const [clubId, playerIds] of this.clubEntries) {
      let totalChips = 0, activePlayers = 0, eliminated = 0;
      for (const pid of playerIds) {
        const entry = this.entries.get(pid);
        if (entry?.status === ENTRY_STATUS.ACTIVE) { totalChips += entry.chips; activePlayers++; }
        else if (entry?.status === ENTRY_STATUS.ELIMINATED) eliminated++;
      }
      standings.push({ clubId, totalChips, activePlayers, eliminated, totalEntries: playerIds.size });
    }
    return standings.sort((a, b) => b.totalChips - a.totalChips);
  }

  syncChipCounts() {
    for (const [, tableInfo] of this.tables) {
      for (const seat of tableInfo.table.seats) {
        if (seat.player) {
          const entry = this.entries.get(seat.player.id);
          if (entry) entry.chips = seat.stack;
        }
      }
    }
  }

  // ═══════════════════════════════════════════════════════
  // HELPERS
  // ═══════════════════════════════════════════════════════

  /** @private */
  _getRegisteredEntries() {
    return [...this.entries.values()].filter(e => e.status === ENTRY_STATUS.REGISTERED);
  }

  /** @private */
  _getActivePlayers() {
    return [...this.entries.values()].filter(e => e.status === ENTRY_STATUS.ACTIVE);
  }

  /** @private */
  _calculatePrizePool() {
    if (this.tournamentType === TOURNAMENT_TYPE.SPIN) {
      return this.buyinAmount * 3 * (this.spinMultiplier || 2);
    }
    let pool = 0;
    for (const entry of this.entries.values()) {
      if (entry.status !== ENTRY_STATUS.CANCELLED) {
        pool += this.buyinAmount; // base buyin (no fee) goes to pool
        pool += entry.rebuyCount * this.rebuyAmount;
        if (entry.addonTaken) pool += this.addonAmount;
      }
    }
    return pool;
  }

  /** @private */
  _normalizeBlindStructure(structure) {
    if (!Array.isArray(structure) || structure.length === 0) return DEFAULT_BLIND_STRUCTURE;
    return structure.map((l, i) => ({
      level: l.level || i + 1,
      small_blind: l.small_blind || l.smallBlind || 25,
      big_blind: l.big_blind || l.bigBlind || 50,
      ante: l.ante || 0,
      duration: l.duration || 15,
    }));
  }

  /** @private */
  _getDefaultPayoutStructure(entries) {
    const thresholds = Object.keys(DEFAULT_PAYOUT_STRUCTURES).map(Number).sort((a, b) => a - b);
    let selected = thresholds[0];
    for (const t of thresholds) { if (entries >= t) selected = t; }
    return DEFAULT_PAYOUT_STRUCTURES[selected] || DEFAULT_PAYOUT_STRUCTURES[2];
  }

  destroy() {
    if (this._levelTimer) clearTimeout(this._levelTimer);
    if (this._balanceTimer) clearInterval(this._balanceTimer);
    if (this._breakTimer) clearTimeout(this._breakTimer);
    if (this._syncBreakTimer) clearInterval(this._syncBreakTimer);
    this.removeAllListeners();
  }
}


module.exports = {
  TournamentController,
  TOURNAMENT_TYPE,
  TOURNAMENT_STATUS,
  ENTRY_STATUS,
  DEFAULT_BLIND_STRUCTURE,
  SNG_BLIND_STRUCTURE,
  SPIN_BLIND_STRUCTURE,
  SPIN_MULTIPLIERS,
  DEFAULT_PAYOUT_STRUCTURES,
  SNG_PAYOUT_STRUCTURES,
};
