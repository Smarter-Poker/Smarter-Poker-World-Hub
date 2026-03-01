/**
 * Smarter.Poker - Core Poker Engine
 * Module: TableManager
 * 
 * Manages a single poker table's persistent state:
 *   - Seat management (join, leave, sit-out, sit-in, reserve)
 *   - Stack management (buy-in, rebuy, cashout)
 *   - Waitlist queue
 *   - Table configuration (stakes, game variant, min/max buy-in)
 *   - Hand lifecycle coordination with GameStateMachine
 * 
 * This sits between the network layer (RealtimeSync) and the
 * game engine (GameStateMachine).
 */

const { GameStateMachine, GAME_PHASE, GAME_VARIANT } = require('./GameStateMachine');
const { BETTING_STRUCTURES } = require('./ActionValidator');

// ============ CONSTANTS ============

const SEAT_STATUS = {
  EMPTY: 'empty',
  OCCUPIED: 'occupied',
  SITTING_OUT: 'sitting_out',
  RESERVED: 'reserved',       // Reserved for returning player or waitlist
  DISCONNECTED: 'disconnected', // Player disconnected, grace period
};

const TABLE_STATUS = {
  WAITING: 'waiting',         // Not enough players
  RUNNING: 'running',         // Hand in progress
  BETWEEN_HANDS: 'between_hands', // Paused between hands
  PAUSED: 'paused',           // Admin paused
  CLOSED: 'closed',           // Table shut down
};

const MAX_SEATS = 10;
const DEFAULT_SEATS = 9;
const DISCONNECT_GRACE_MS = 60000;    // 60s to reconnect
const RESERVATION_TIMEOUT_MS = 30000; // 30s to take reserved seat
const SIT_OUT_AUTO_FOLD_HANDS = 3;    // Auto-remove after N hands sitting out

// ============ TABLE MANAGER ============

class TableManager {
  /**
   * @param {Object} config
   * @param {string} config.tableId - Unique table identifier
   * @param {string} config.clubId - Club this table belongs to
   * @param {string} config.variant - Game variant
   * @param {string} config.bettingStructure - NL/PL/FL
   * @param {number} config.smallBlind
   * @param {number} config.bigBlind
   * @param {number} [config.ante]
   * @param {number} config.minBuyIn - Minimum buy-in (in chips)
   * @param {number} config.maxBuyIn - Maximum buy-in (in chips)
   * @param {number} [config.maxSeats] - Number of seats (2-10)
   * @param {number} [config.rakePercent]
   * @param {number} [config.rakeCap]
   * @param {boolean} [config.runItTwice]
   * @param {boolean} [config.runItThrice]
   * @param {boolean} [config.insurance]
   * @param {boolean} [config.bombPot]
   * @param {boolean} [config.straddle]
   * @param {number} [config.autoStartDelay] - ms delay before auto-starting hand
   */
  constructor(config) {
    this.tableId = config.tableId;
    this.clubId = config.clubId;
    this.tableName = config.name || config.tableName || config.tableId;
    this.maxSeats = Math.min(Math.max(config.maxSeats || DEFAULT_SEATS, 2), MAX_SEATS);
    this.minBuyIn = config.minBuyIn;
    this.maxBuyIn = config.maxBuyIn;
    this.smallBlind = config.smallBlind;
    this.bigBlind = config.bigBlind;
    this.autoStartDelay = config.autoStartDelay || 3000;
    
    // Seats array (indexed by seat number 0..maxSeats-1)
    this.seats = Array.from({ length: this.maxSeats }, (_, i) => ({
      seatIndex: i,
      status: SEAT_STATUS.EMPTY,
      player: null,         // { id, displayName, avatarUrl }
      stack: 0,
      sittingOutHands: 0,   // Consecutive hands sitting out
      reservedFor: null,     // Player ID if reserved
      reservedAt: null,      // Timestamp
      disconnectedAt: null,  // Timestamp
    }));
    
    // Waitlist
    this.waitlist = [];     // [{ playerId, displayName, requestedAt, seatPreference? }]
    
    // Game engine
    this.game = new GameStateMachine({
      variant: config.variant || GAME_VARIANT.HOLDEM,
      bettingStructure: config.bettingStructure || BETTING_STRUCTURES.NO_LIMIT,
      smallBlind: config.smallBlind,
      bigBlind: config.bigBlind,
      ante: config.ante || 0,
      rakePercent: config.rakePercent || 0,
      rakeCap: config.rakeCap || Infinity,
      runItTwice: config.runItTwice || false,
      runItThrice: config.runItThrice || false,
      insurance: config.insurance || false,
      bombPot: config.bombPot || false,
      straddle: config.straddle || false,
      autoUtgStraddle: config.autoUtgStraddle || false,
      voluntaryStraddle: config.voluntaryStraddle || false,
    });
    
    // Table state
    this.status = TABLE_STATUS.WAITING;
    this.handCount = 0;
    this._autoStartTimer = null;
    this._disconnectTimers = new Map();
    this._reservationTimers = new Map();
    
    // No-rathole enforcement: tracks departed stacks to prevent hit-and-run
    // Map<playerId, { stack: number, leftAt: number }>
    this.noRathole = config.noRathole || config.clubSettings?.no_rathole || false;
    this._departedStacks = new Map();
    this._ratholeTimeoutMs = 30 * 60 * 1000; // 30 minutes
    
    // Seven-Deuce bonus game
    this.sevenDeuce = config.sevenDeuce || config.clubSettings?.seven_deuce || false;
    this.sevenDeuceBonus = config.sevenDeuceBonus || config.bigBlind * 10; // Default: 10BB bonus
    this.banChat = config.banChat || config.clubSettings?.ban_chat || false;
    
    // Bomb pot tracking
    this._lastBombPotHand = 0;
    
    // Nit game / VPIP enforcement
    this.nitGame = config.nitGame || config.clubSettings?.nit_game || false;
    this.maintainPercent = config.maintainPercent || config.clubSettings?.maintain_percent || 0;
    this.maintainHands = Math.max(config.maintainHands || config.clubSettings?.maintain_hands || 12, 12);
    // Per-player tracking: Map<playerId, { handsDealt, vpipHands, warned }>
    this._vpipTracker = new Map();
    
    // Table access control
    this.anonymousTable = config.anonymousTable || config.clubSettings?.anonymous_table || false;

    // ── Mixed Game Rotation ──────────────────────────────────
    // Supported rotations: HORSE (holdem, omaha4, razz, stud, stud_hilo) 
    // or custom list like ['holdem', 'omaha4', 'omaha5', 'short_deck']
    this.mixedGame = config.mixedGame || config.clubSettings?.mixed_game || false;
    this.variantRotation = config.variantRotation || config.clubSettings?.variant_rotation || null;
    this._mixedGameIndex = 0;
    this._mixedOrbitStart = -1; // buttonSeat when current variant started
    this._mixedHandsSinceRotation = 0;
    
    if (this.mixedGame && !this.variantRotation) {
      // Default HORSE rotation
      this.variantRotation = ['holdem', 'omaha4', 'omaha_hilo', 'short_deck'];
    }
    if (this.variantRotation?.length > 0) {
      this.game.config.variant = this.variantRotation[0];
    }
    this.privateGame = config.privateGame || config.clubSettings?.private_game || false;
    this.vipOnly = config.vipOnly || config.clubSettings?.vip_only || false;
    this.buyInAuthorization = config.clubSettings?.buy_in_authorization || false;
    
    // Private game invite list + buy-in auth pending queue
    this._privateInvites = new Set(); // Set<playerId>
    this._pendingBuyIns = new Map();  // Map<playerId, { playerId, seatIndex, buyIn, playerInfo, requestedAt }>
    this._approvedBuyIns = new Set(); // Set<playerId>
    
    // Auto-rebuy preferences: Map<playerId, boolean>
    this._autoRebuyPrefs = new Map();
    
    // Auto top-up preferences: Map<playerId, number|boolean>
    // When set to true: top up to max buy-in between hands
    // When set to a number: top up to that specific amount
    this._autoTopUpPrefs = new Map();
    
    // Auto-rebuy callback — set by LobbyManager for club chip locking
    this.onAutoRebuy = null;
    
    // Auto top-up callback — set by LobbyManager for club chip locking
    this.onAutoTopUp = null;
    
    // Event listeners
    this._listeners = new Map();
    
    // Wire game engine events through
    this.game.on('hand_start', (d) => this.emit('hand_start', d));
    this.game.on('blinds_posted', (d) => this.emit('blinds_posted', d));
    this.game.on('cards_dealt', (d) => this.emit('cards_dealt', d));
    this.game.on('street_start', (d) => this.emit('street_start', d));
    this.game.on('action_required', (d) => this.emit('action_required', d));
    this.game.on('action_processed', (d) => this.emit('action_processed', d));
    this.game.on('showdown', (d) => this.emit('showdown', d));
    this.game.on('payout', (d) => this.emit('payout', d));
    this.game.on('hand_complete', (d) => this._onHandComplete(d));

    // Run-it-twice/thrice events
    this.game.on('run_it_offer', (d) => this.emit('run_it_offer', d));
    this.game.on('run_it_response', (d) => this.emit('run_it_response', d));
    this.game.on('run_it_agreed', (d) => this.emit('run_it_agreed', d));
    this.game.on('run_it_declined', (d) => this.emit('run_it_declined', d));
    this.game.on('run_it_multiple', (d) => this.emit('run_it_multiple', d));
    this.game.on('run_it_twice', (d) => this.emit('run_it_twice', d));
    this.game.on('run_it_thrice', (d) => this.emit('run_it_thrice', d));

    // Straddle events
    this.game.on('straddle_posted', (d) => this.emit('straddle_posted', d));
    this.game.on('straddle_declared', (d) => this.emit('straddle_declared', d));

    // All-in equity percentages
    this.game.on('all_in_equity', (d) => this.emit('all_in_equity', d));

    // BBJ
    this.game.on('bbj_triggered', (d) => this.emit('bbj_triggered', d));

    // Discard (Pineapple)
    this.game.on('discard_required', (d) => this.emit('discard_required', d));

    // Insurance events
    this.game.on('insurance_offered', (d) => this.emit('insurance_offered', d));
    this.game.on('insurance_purchased', (d) => this.emit('insurance_purchased', d));
    this.game.on('insurance_declined', (d) => this.emit('insurance_declined', d));
    this.game.on('insurance_expired', (d) => this.emit('insurance_expired', d));
    this.game.on('insurance_payout', (d) => this.emit('insurance_payout', d));
  }

  // ============ EVENT SYSTEM ============

  on(event, callback) {
    if (!this._listeners.has(event)) this._listeners.set(event, []);
    this._listeners.get(event).push(callback);
  }

  emit(event, data) {
    const listeners = this._listeners.get(event) || [];
    for (const cb of listeners) {
      try { cb(data); } catch (err) { console.error(`TableManager event error (${event}):`, err); }
    }
  }

  // ============ SEAT MANAGEMENT ============

  /**
   * Player sits down at a specific seat.
   * @param {string|number} playerId
   * @param {number} seatIndex - 0-based seat number
   * @param {number} buyIn - Chip amount
   * @param {Object} [playerInfo] - { displayName, avatarUrl }
   * @returns {{ success: boolean, error?: string }}
   */
  sitDown(playerId, seatIndex, buyIn, playerInfo = {}) {
    // ── Access Control ──
    
    // Private game: only invited players or staff can sit
    if (this.privateGame) {
      const isInvited = this._privateInvites?.has(String(playerId));
      const isStaff = playerInfo.role === 'owner' || playerInfo.role === 'admin' || playerInfo.role === 'agent';
      if (!isInvited && !isStaff) {
        return { success: false, error: 'Private table — ask admin for an invitation', code: 'PRIVATE_TABLE' };
      }
    }
    
    // VIP-only table: check member tier
    if (this.vipOnly) {
      const tier = (playerInfo.tier || 'bronze').toLowerCase();
      const vipTiers = ['vip', 'gold', 'platinum', 'diamond'];
      const isStaff = playerInfo.role === 'owner' || playerInfo.role === 'admin' || playerInfo.role === 'agent';
      if (!vipTiers.includes(tier) && !isStaff) {
        return { success: false, error: 'VIP-only table — upgrade your membership', code: 'VIP_ONLY' };
      }
    }
    
    // Buy-in authorization: queue for admin approval
    if (this.buyInAuthorization) {
      const isStaff = playerInfo.role === 'owner' || playerInfo.role === 'admin' || playerInfo.role === 'agent';
      if (!isStaff && !this._approvedBuyIns?.has(String(playerId))) {
        // Add to pending queue and notify admin
        if (!this._pendingBuyIns) this._pendingBuyIns = new Map();
        this._pendingBuyIns.set(String(playerId), {
          playerId, seatIndex, buyIn, playerInfo,
          requestedAt: Date.now(),
        });
        this.emit('buyin_authorization_requested', {
          playerId,
          displayName: playerInfo.displayName || playerId,
          seatIndex,
          buyIn,
        });
        return { success: false, error: 'Buy-in requires admin authorization. Request submitted.', code: 'BUYIN_AUTH_PENDING' };
      }
      // Clear approval after use
      this._approvedBuyIns?.delete(String(playerId));
    }
    
    // Validate seat
    if (seatIndex < 0 || seatIndex >= this.maxSeats) {
      return { success: false, error: `Invalid seat: ${seatIndex}` };
    }
    
    const seat = this.seats[seatIndex];
    
    // Check if seat is available
    if (seat.status === SEAT_STATUS.OCCUPIED || seat.status === SEAT_STATUS.SITTING_OUT) {
      return { success: false, error: 'Seat is occupied' };
    }
    
    if (seat.status === SEAT_STATUS.RESERVED && seat.reservedFor !== playerId) {
      return { success: false, error: 'Seat is reserved for another player' };
    }
    
    // Check if player is already seated
    const existingSeat = this.seats.find(s => s.player?.id === playerId);
    if (existingSeat) {
      return { success: false, error: 'Player already seated at this table' };
    }
    
    // Validate buy-in
    if (buyIn < this.minBuyIn) {
      return { success: false, error: `Minimum buy-in is ${this.minBuyIn}` };
    }
    if (buyIn > this.maxBuyIn) {
      return { success: false, error: `Maximum buy-in is ${this.maxBuyIn}` };
    }
    
    // No-rathole enforcement: returning players must buy in at or above their previous stack
    if (this.noRathole) {
      const departed = this._departedStacks.get(String(playerId));
      if (departed && (Date.now() - departed.leftAt) < this._ratholeTimeoutMs) {
        const requiredMin = Math.min(departed.stack, this.maxBuyIn); // Can't exceed table max
        if (buyIn < requiredMin) {
          return {
            success: false,
            error: `No rathole: you left with ${departed.stack} chips. Minimum buy-in is ${requiredMin}`,
            ratholeMin: requiredMin,
          };
        }
      }
      // Clear the record once they successfully sit down
      this._departedStacks.delete(String(playerId));
    }
    
    // Sit down
    seat.status = SEAT_STATUS.OCCUPIED;
    seat.player = { id: playerId, displayName: playerInfo.displayName || playerId, avatarUrl: playerInfo.avatarUrl || null };
    
    // Reset VPIP tracker — fresh session for this player at this table
    this._vpipTracker.delete(String(playerId));
    seat.stack = buyIn;
    seat.sittingOutHands = 0;
    seat.reservedFor = null;
    seat.reservedAt = null;
    seat.disconnectedAt = null;
    
    // Clear any reservation timer
    this._clearReservation(seatIndex);
    
    // Remove from waitlist if present
    this.waitlist = this.waitlist.filter(w => w.playerId !== playerId);
    
    this.emit('player_seated', {
      playerId,
      seatIndex,
      stack: buyIn,
      displayName: seat.player.displayName,
    });
    
    // Check if we can start a hand
    this._checkAutoStart();
    
    return { success: true };
  }

  /**
   * Player leaves the table (stands up).
   * @param {string|number} playerId
   * @returns {{ success: boolean, cashout?: number, error?: string }}
   */
  standUp(playerId) {
    const seat = this._findPlayerSeat(playerId);
    if (!seat) return { success: false, error: 'Player not at this table' };
    
    // If hand is in progress and player is in the hand, they must fold first
    if (this.game.phase !== GAME_PHASE.IDLE) {
      const handPlayer = this.game.currentHand?.players.find(p => String(p.id) === String(playerId));
      if (handPlayer && !handPlayer.folded) {
        // Mark as sitting out - will be auto-folded
        seat.status = SEAT_STATUS.SITTING_OUT;
        this.emit('player_sitting_out', { playerId, seatIndex: seat.seatIndex });
        return { success: true, pending: true, message: 'Will stand up after current hand' };
      }
    }
    
    const cashout = seat.stack;
    
    // No-rathole: record departing stack so returning player must buy in at this level
    if (this.noRathole && cashout > this.minBuyIn) {
      this._departedStacks.set(String(playerId), {
        stack: cashout,
        leftAt: Date.now(),
      });
    }
    
    this._vacateSeat(seat);
    
    this.emit('player_left', { playerId, seatIndex: seat.seatIndex, cashout });
    
    // Seat next waitlist player
    this._seatFromWaitlist(seat.seatIndex);
    
    return { success: true, cashout };
  }

  /**
   * Admin kicks a player from the table.
   * Forces immediate removal — if in a hand, auto-folds first.
   * @param {string|number} playerId
   * @param {string} [reason='admin_kick']
   * @returns {{ success: boolean, cashout?: number, error?: string }}
   */
  kickPlayer(playerId, reason = 'admin_kick') {
    const seat = this._findPlayerSeat(playerId);
    if (!seat) return { success: false, error: 'Player not at this table' };

    // If in active hand, force-fold them
    if (this.game.phase !== GAME_PHASE.IDLE) {
      const handPlayer = this.game.currentHand?.players.find(p => String(p.id) === String(playerId));
      if (handPlayer && !handPlayer.folded) {
        this.game.processAction(playerId, { type: 'fold' });
      }
    }

    const cashout = seat.stack;
    this._vacateSeat(seat);

    this.emit('player_kicked', { playerId, seatIndex: seat.seatIndex, cashout, reason });
    this.emit('player_left', { playerId, seatIndex: seat.seatIndex, cashout, kicked: true });

    this._seatFromWaitlist(seat.seatIndex);

    return { success: true, cashout };
  }

  /**
   * Player sits out (still occupies seat but won't be dealt in).
   * @param {string|number} playerId
   * @returns {{ success: boolean, error?: string }}
   */
  sitOut(playerId) {
    const seat = this._findPlayerSeat(playerId);
    if (!seat) return { success: false, error: 'Player not at this table' };
    
    seat.status = SEAT_STATUS.SITTING_OUT;
    seat.sittingOutHands = 0;
    
    this.emit('player_sitting_out', { playerId, seatIndex: seat.seatIndex });
    return { success: true };
  }

  /**
   * Player returns from sitting out.
   * @param {string|number} playerId
   * @returns {{ success: boolean, error?: string }}
   */
  sitIn(playerId) {
    const seat = this._findPlayerSeat(playerId);
    if (!seat) return { success: false, error: 'Player not at this table' };
    
    if (seat.status !== SEAT_STATUS.SITTING_OUT && seat.status !== SEAT_STATUS.DISCONNECTED) {
      return { success: false, error: 'Player is not sitting out' };
    }
    
    seat.status = SEAT_STATUS.OCCUPIED;
    seat.sittingOutHands = 0;
    seat.disconnectedAt = null;
    
    // Clear disconnect timer
    if (this._disconnectTimers.has(playerId)) {
      clearTimeout(this._disconnectTimers.get(playerId));
      this._disconnectTimers.delete(playerId);
    }
    
    this.emit('player_sitting_in', { playerId, seatIndex: seat.seatIndex });
    this._checkAutoStart();
    
    return { success: true };
  }

  /**
   * Declare voluntary straddle for next hand.
   * @param {string} playerId
   */
  declareStraddle(playerId) {
    return this.game.declareStraddle(playerId);
  }

  /**
   * Cancel voluntary straddle declaration.
   * @param {string} playerId
   */
  cancelStraddle(playerId) {
    return this.game.cancelStraddle(playerId);
  }

  /**
   * Respond to a run-it-twice/thrice offer.
   * @param {string} playerId
   * @param {string} choice — 'twice' | 'thrice' | 'decline'
   */
  respondRunIt(playerId, choice) {
    return this.game.respondRunIt(playerId, choice);
  }

  /**
   * Process Pineapple discard — player discards 1 of 3 hole cards after flop.
   * @param {string} playerId
   * @param {number} cardIndex - 0, 1, or 2
   */
  processDiscard(playerId, cardIndex) {
    return this.game.processDiscard(playerId, cardIndex);
  }

  /**
   * Auto-discard for timed-out player (Pineapple).
   * @param {string} playerId
   */
  autoDiscard(playerId) {
    return this.game.autoDiscard(playerId);
  }

  /**
   * Player adds chips to their stack (rebuy/top-up).
   * Only allowed between hands or when not in current hand.
   * @param {string|number} playerId
   * @param {number} amount
   * @returns {{ success: boolean, newStack?: number, error?: string }}
   */
  addChips(playerId, amount) {
    const seat = this._findPlayerSeat(playerId);
    if (!seat) return { success: false, error: 'Player not at this table' };
    
    if (amount <= 0) return { success: false, error: 'Amount must be positive' };
    
    const newStack = seat.stack + amount;
    if (newStack > this.maxBuyIn) {
      return { success: false, error: `Stack would exceed max buy-in of ${this.maxBuyIn}` };
    }
    
    seat.stack += amount;
    
    this.emit('chips_added', { playerId, amount, newStack: seat.stack, seatIndex: seat.seatIndex });
    return { success: true, newStack: seat.stack };
  }

  /**
   * Set auto-rebuy preference for a player.
   * When enabled, busted players are automatically re-bought in at min buy-in.
   * @param {string|number} playerId
   * @param {boolean} enabled
   */
  setAutoRebuy(playerId, enabled) {
    const seat = this._findPlayerSeat(playerId);
    if (!seat) return { success: false, error: 'Player not at this table' };
    this._autoRebuyPrefs.set(String(playerId), !!enabled);
    return { success: true, autoRebuy: !!enabled };
  }

  /**
   * Set auto top-up preference for a player.
   * Between hands, if stack < target amount, automatically top up from club balance.
   * @param {string|number} playerId
   * @param {boolean|number} value - true = top up to maxBuyIn, number = top up to that amount, false = off
   */
  setAutoTopUp(playerId, value) {
    const seat = this._findPlayerSeat(playerId);
    if (!seat) return { success: false, error: 'Player not at this table' };
    
    if (value === false || value === 0) {
      this._autoTopUpPrefs.delete(String(playerId));
      return { success: true, autoTopUp: false };
    }
    
    // Validate target amount
    const target = (value === true) ? this.maxBuyIn : Math.min(Number(value), this.maxBuyIn);
    if (target < this.minBuyIn) {
      return { success: false, error: `Target must be at least ${this.minBuyIn}` };
    }
    
    this._autoTopUpPrefs.set(String(playerId), target);
    return { success: true, autoTopUp: true, targetAmount: target };
  }

  // ============ ACCESS CONTROL ============

  /**
   * Invite a player to a private table.
   * @param {string} playerId
   */
  invitePlayer(playerId) {
    this._privateInvites.add(String(playerId));
    this.emit('player_invited', { playerId });
    return { success: true };
  }

  /**
   * Revoke a private table invitation.
   * @param {string} playerId
   */
  uninvitePlayer(playerId) {
    this._privateInvites.delete(String(playerId));
    return { success: true };
  }

  /**
   * Approve a pending buy-in request (buy_in_authorization).
   * @param {string} playerId
   */
  approveBuyIn(playerId) {
    const pending = this._pendingBuyIns.get(String(playerId));
    if (!pending) return { success: false, error: 'No pending buy-in for this player' };
    
    this._pendingBuyIns.delete(String(playerId));
    this._approvedBuyIns.add(String(playerId));
    
    this.emit('buyin_authorized', {
      playerId,
      displayName: pending.playerInfo?.displayName,
      seatIndex: pending.seatIndex,
      buyIn: pending.buyIn,
    });
    
    // Auto-seat the player if the seat is still available
    const result = this.sitDown(playerId, pending.seatIndex, pending.buyIn, pending.playerInfo);
    return result;
  }

  /**
   * Reject a pending buy-in request.
   * @param {string} playerId
   */
  rejectBuyIn(playerId) {
    const pending = this._pendingBuyIns.get(String(playerId));
    if (!pending) return { success: false, error: 'No pending buy-in' };
    
    this._pendingBuyIns.delete(String(playerId));
    this.emit('buyin_rejected', {
      playerId,
      displayName: pending.playerInfo?.displayName,
    });
    return { success: true };
  }

  /**
   * Handle player disconnect.
   * @param {string|number} playerId
   */
  handleDisconnect(playerId) {
    const seat = this._findPlayerSeat(playerId);
    if (!seat) return;
    
    seat.status = SEAT_STATUS.DISCONNECTED;
    seat.disconnectedAt = Date.now();
    
    this.emit('player_disconnected', { playerId, seatIndex: seat.seatIndex });
    
    // Start grace period timer
    const timer = setTimeout(() => {
      // If still disconnected after grace period, sit them out
      if (seat.status === SEAT_STATUS.DISCONNECTED) {
        seat.status = SEAT_STATUS.SITTING_OUT;
        this.emit('player_timed_out', { playerId, seatIndex: seat.seatIndex });
      }
      this._disconnectTimers.delete(playerId);
    }, DISCONNECT_GRACE_MS);
    
    this._disconnectTimers.set(playerId, timer);
  }

  /**
   * Handle player reconnect.
   * @param {string|number} playerId
   * @returns {{ success: boolean, seatIndex?: number }}
   */
  handleReconnect(playerId) {
    const seat = this._findPlayerSeat(playerId);
    if (!seat) return { success: false };
    
    if (seat.status === SEAT_STATUS.DISCONNECTED) {
      seat.status = SEAT_STATUS.OCCUPIED;
      seat.disconnectedAt = null;
      
      if (this._disconnectTimers.has(playerId)) {
        clearTimeout(this._disconnectTimers.get(playerId));
        this._disconnectTimers.delete(playerId);
      }
      
      this.emit('player_reconnected', { playerId, seatIndex: seat.seatIndex });
      return { success: true, seatIndex: seat.seatIndex };
    }
    
    return { success: true, seatIndex: seat.seatIndex };
  }

  // ============ WAITLIST ============

  /**
   * Add a player to the waitlist.
   * @param {string|number} playerId
   * @param {Object} [options] - { displayName, seatPreference }
   * @returns {{ success: boolean, position?: number, error?: string }}
   */
  joinWaitlist(playerId, options = {}) {
    // Check if already seated
    if (this._findPlayerSeat(playerId)) {
      return { success: false, error: 'Already seated at this table' };
    }
    
    // Check if already on waitlist
    if (this.waitlist.some(w => w.playerId === playerId)) {
      return { success: false, error: 'Already on the waitlist' };
    }
    
    this.waitlist.push({
      playerId,
      displayName: options.displayName || playerId,
      requestedAt: Date.now(),
      seatPreference: options.seatPreference || null,
    });
    
    const position = this.waitlist.length;
    
    this.emit('waitlist_joined', { playerId, position });
    
    // If there's an empty seat, offer it immediately
    const emptySeat = this.seats.find(s => s.status === SEAT_STATUS.EMPTY);
    if (emptySeat) {
      this._offerSeatFromWaitlist(emptySeat.seatIndex);
    }
    
    return { success: true, position };
  }

  /**
   * Remove a player from the waitlist.
   * @param {string|number} playerId
   * @returns {{ success: boolean }}
   */
  leaveWaitlist(playerId) {
    const idx = this.waitlist.findIndex(w => w.playerId === playerId);
    if (idx === -1) return { success: false, error: 'Not on the waitlist' };
    
    this.waitlist.splice(idx, 1);
    this.emit('waitlist_left', { playerId });
    return { success: true };
  }

  // ============ HAND CONTROL ============

  /**
   * Start a new hand (called automatically or manually by admin).
   * @returns {{ success: boolean, error?: string }}
   */
  startNextHand() {
    if (this.game.phase !== GAME_PHASE.IDLE) {
      return { success: false, error: 'Hand already in progress' };
    }
    
    // Get active players (occupied seats with chips)
    const activePlayers = this.seats
      .filter(s => s.status === SEAT_STATUS.OCCUPIED && s.stack > 0)
      .map(s => ({
        id: s.player.id,
        stack: s.stack,
        seatIndex: s.seatIndex,
      }));
    
    if (activePlayers.length < 2) {
      this.status = TABLE_STATUS.WAITING;
      return { success: false, error: 'Need at least 2 active players' };
    }
    
    // Increment sitting-out counters and handle auto-remove
    for (const seat of this.seats) {
      if (seat.status === SEAT_STATUS.SITTING_OUT) {
        seat.sittingOutHands++;
        if (seat.sittingOutHands >= SIT_OUT_AUTO_FOLD_HANDS) {
          const cashout = seat.stack;
          const playerId = seat.player?.id;
          this._vacateSeat(seat);
          this.emit('player_auto_removed', { playerId, seatIndex: seat.seatIndex, cashout, reason: 'sitting_out_too_long' });
        }
      }
    }
    
    this.status = TABLE_STATUS.RUNNING;
    this.handCount++;
    
    // Bomb Pot detection
    const bombPotEnabled = this.game.config.bombPot;
    let isBombPot = false;
    if (bombPotEnabled && activePlayers.length >= 3) {
      // Trigger bomb pot every ~10 hands (10% chance per hand, min 5 hands apart)
      const handsSinceLastBomb = this.handCount - (this._lastBombPotHand || 0);
      if (handsSinceLastBomb >= 5 && Math.random() < 0.10) {
        isBombPot = true;
        this._lastBombPotHand = this.handCount;
        this.emit('bomb_pot_starting', { handNumber: this.handCount });
      }
    }
    
    // Start the hand on the game engine
    this.game.startHand(activePlayers, undefined, { bombPot: isBombPot });
    
    return { success: true };
  }

  /**
   * Forward a player action to the game engine.
   * @param {string|number} playerId
   * @param {Object} action - { type, amount? }
   * @returns {Object} Game state result
   */
  processAction(playerId, action) {
    if (this.game.phase === GAME_PHASE.IDLE) {
      return { success: false, error: 'No hand in progress' };
    }
    
    const result = this.game.processAction(playerId, action);
    
    // Sync stacks back from engine after each action
    if (result.success) {
      this._syncStacks();
    }
    
    return result;
  }

  /**
   * Auto-fold for a player who times out or is disconnected.
   * @param {string|number} playerId
   */
  autoFold(playerId) {
    const current = this.game.getCurrentActions();
    if (current && String(current.playerId) === String(playerId)) {
      // Check if they can check (prefer check over fold)
      const canCheck = current.actions.some(a => a.type === 'check');
      this.processAction(playerId, { type: canCheck ? 'check' : 'fold' });
    }
  }

  // ============ PRIVATE HELPERS ============

  /**
   * Find the seat occupied by a player.
   * @private
   */
  _findPlayerSeat(playerId) {
    return this.seats.find(s => 
      s.player && String(s.player.id) === String(playerId) &&
      s.status !== SEAT_STATUS.EMPTY
    );
  }

  /**
   * Clear a seat entirely.
   * @private
   */
  _vacateSeat(seat) {
    // Clear session VPIP tracking for nit game
    if (seat.player?.id) this._vpipTracker.delete(String(seat.player.id));
    seat.status = SEAT_STATUS.EMPTY;
    seat.player = null;
    seat.stack = 0;
    seat.sittingOutHands = 0;
    seat.reservedFor = null;
    seat.reservedAt = null;
    seat.disconnectedAt = null;
  }

  /**
   * Sync stacks from game engine back to seats after hand actions.
   * @private
   */
  _syncStacks() {
    if (!this.game.currentHand) return;
    
    for (const player of this.game.currentHand.players) {
      const seat = this.seats.find(s => s.player?.id === player.id);
      if (seat) {
        seat.stack = player.stack;
      }
    }
  }

  /**
   * Handle hand completion.
   * @private
   */
  _onHandComplete(data) {
    // Sync final stacks
    this._syncStacks();
    
    this.status = TABLE_STATUS.BETWEEN_HANDS;
    
    // ── Seven-Deuce Bonus Game ──
    // If enabled, players who win a pot with 7-2 offsuit collect a bonus from every other player
    if (this.sevenDeuce && data.result?.winners?.length > 0 && data.result.type !== 'fold') {
      const { getRank, getSuit } = require('./Deck');
      for (const winner of data.result.winners) {
        const player = this.game.currentHand?.players?.find(p => String(p.id) === String(winner.playerId));
        if (!player?.holeCards || player.holeCards.length < 2) continue;
        
        // Check for 7-2 offsuit (rank 5 = '7', rank 0 = '2')
        const ranks = player.holeCards.map(c => getRank(c)).sort((a, b) => a - b);
        const suits = player.holeCards.map(c => getSuit(c));
        const is72 = ranks[0] === 0 && ranks[1] === 5 && suits[0] !== suits[1];
        
        if (is72) {
          const bonus = this.sevenDeuceBonus;
          let totalCollected = 0;
          const payers = [];
          
          // Collect from all other seated players
          for (const seat of this.seats) {
            if (!seat.player || String(seat.player.id) === String(winner.playerId)) continue;
            if (seat.status !== SEAT_STATUS.OCCUPIED && seat.status !== SEAT_STATUS.SITTING_OUT) continue;
            const payment = Math.min(bonus, seat.stack);
            if (payment > 0) {
              seat.stack -= payment;
              totalCollected += payment;
              payers.push({ playerId: seat.player.id, amount: payment });
            }
          }
          
          // Award to winner
          const winnerSeat = this._findPlayerSeat(winner.playerId);
          if (winnerSeat && totalCollected > 0) {
            winnerSeat.stack += totalCollected;
            this.emit('seven_deuce_bonus', {
              winnerId: winner.playerId,
              winnerName: winnerSeat.player?.displayName,
              bonus: totalCollected,
              perPlayer: bonus,
              payers,
              holeCards: player.holeCards,
            });
          }
        }
      }
    }
    
    this.emit('hand_complete', data);
    
    // ── NIT GAME / VPIP ENFORCEMENT ──
    // Track VPIP per player and warn/sit-out players who play too tight
    if (this.nitGame && this.maintainPercent > 0 && this.game.currentHand) {
      const handPlayers = this.game.currentHand.players || [];
      const actions = this.game.currentHand.actions || [];
      
      for (const player of handPlayers) {
        const pid = String(player.id);
        let tracker = this._vpipTracker.get(pid);
        if (!tracker) {
          tracker = { handsDealt: 0, vpipHands: 0, warned: false };
          this._vpipTracker.set(pid, tracker);
        }
        
        tracker.handsDealt++;
        
        // Check if player VPIP'd (voluntarily put money in preflop)
        const playerPreflopActions = actions.filter(a =>
          String(a.playerId) === pid && a.street === 'preflop' &&
          ['call', 'raise', 'bet', 'all_in'].includes(a.type)
        );
        if (playerPreflopActions.length > 0) {
          tracker.vpipHands++;
        }
        
        // Enforce after minimum hands played
        if (tracker.handsDealt >= this.maintainHands) {
          const vpipRate = (tracker.vpipHands / tracker.handsDealt) * 100;
          
          if (vpipRate < this.maintainPercent) {
            if (!tracker.warned) {
              // First offense: warning
              tracker.warned = true;
              this.emit('nit_warning', {
                playerId: pid,
                vpipRate: vpipRate.toFixed(1),
                required: this.maintainPercent,
                handsPlayed: tracker.handsDealt,
              });
            } else {
              // Second offense: sit-out
              this.emit('nit_sitout', {
                playerId: pid,
                vpipRate: vpipRate.toFixed(1),
                required: this.maintainPercent,
              });
              this.sitOut(pid);
              // Reset tracker after sit-out
              this._vpipTracker.delete(pid);
            }
          } else {
            // Reset warning if they improved
            tracker.warned = false;
          }
        }
      }
    }
    
    // Handle pending stand-ups and busted players
    for (const seat of this.seats) {
      if (seat.status === SEAT_STATUS.SITTING_OUT && seat.stack <= 0) {
        const playerId = seat.player?.id;
        
        // ── Auto-Rebuy: if enabled and callback available, attempt rebuy ──
        if (playerId && this._autoRebuyPrefs.get(String(playerId)) && this.onAutoRebuy) {
          const rebuyAmount = this.minBuyIn;
          this.emit('auto_rebuy_attempt', { playerId, amount: rebuyAmount, seatIndex: seat.seatIndex });
          
          // onAutoRebuy is async — set by LobbyManager for ChipBridge integration
          // We fire-and-forget; LobbyManager will call addChips if successful
          Promise.resolve(this.onAutoRebuy(playerId, rebuyAmount, seat.seatIndex)).catch(err => {
            console.error('[TableManager] Auto-rebuy failed for', playerId, err.message);
            // If rebuy fails, vacate the player
            this._vacateSeat(seat);
            this.emit('player_left', { playerId, seatIndex: seat.seatIndex, cashout: 0, reason: 'busted_rebuy_failed' });
            this._seatFromWaitlist(seat.seatIndex);
          });
          continue; // Don't vacate yet — waiting for rebuy callback
        }
        
        this._vacateSeat(seat);
        this.emit('player_left', { playerId, seatIndex: seat.seatIndex, cashout: 0, reason: 'busted' });
        this._seatFromWaitlist(seat.seatIndex);
      }
    }
    
    // ── Auto Top-Up: top up seated players whose stack is below their target ──
    if (this.onAutoTopUp) {
      for (const seat of this.seats) {
        if (seat.status !== SEAT_STATUS.OCCUPIED || !seat.player) continue;
        const playerId = String(seat.player.id);
        const target = this._autoTopUpPrefs.get(playerId);
        if (!target || seat.stack >= target) continue;
        
        const topUpAmount = target - seat.stack;
        if (topUpAmount <= 0) continue;
        
        this.emit('auto_topup_attempt', { playerId, amount: topUpAmount, currentStack: seat.stack, target, seatIndex: seat.seatIndex });
        
        Promise.resolve(this.onAutoTopUp(playerId, topUpAmount, seat.seatIndex)).catch(err => {
          console.warn('[TableManager] Auto top-up failed for', playerId, err.message);
          // Non-fatal — player just stays at current stack
        });
      }
    }
    
    // ── Mixed Game Rotation: Check if we need to switch variants ──
    this._checkMixedGameRotation();
    
    // Auto-start next hand after delay
    this._checkAutoStart();
  }

  /**
   * Check if we should auto-start the next hand.
   * @private
   */
  /**
   * Check if mixed game should rotate to next variant.
   * Rotates after one full orbit (N hands where N = active players).
   * @private
   */
  _checkMixedGameRotation() {
    if (!this.variantRotation || this.variantRotation.length <= 1) return;
    
    this._mixedHandsSinceRotation++;
    
    // One orbit = number of active players at time of rotation start
    const activePlayers = this.seats.filter(s => 
      s.status === SEAT_STATUS.OCCUPIED && s.stack > 0
    ).length;
    
    // Initialize orbit tracking
    if (this._mixedOrbitStart === -1) {
      this._mixedOrbitStart = this.game.buttonSeat;
      this._mixedHandsSinceRotation = 1;
      return;
    }
    
    // Rotate when button has gone around once (hands >= players)
    if (this._mixedHandsSinceRotation >= Math.max(activePlayers, 2)) {
      this._mixedGameIndex = (this._mixedGameIndex + 1) % this.variantRotation.length;
      const newVariant = this.variantRotation[this._mixedGameIndex];
      
      // Update game config
      this.game.config.variant = newVariant;
      
      // Reset deck for short deck variant
      if (newVariant === 'short_deck') {
        this.game.deck = new (require('./Deck').Deck)({ shortDeck: true });
      } else if (this.game.deck?.shortDeck) {
        this.game.deck = new (require('./Deck').Deck)({ shortDeck: false });
      }
      
      // Reset orbit tracking
      this._mixedOrbitStart = this.game.buttonSeat;
      this._mixedHandsSinceRotation = 0;
      
      // Emit for UI + RealtimeSync
      this.emit('variant_changed', {
        variant: newVariant,
        rotationIndex: this._mixedGameIndex,
        rotation: this.variantRotation,
        nextVariant: this.variantRotation[(this._mixedGameIndex + 1) % this.variantRotation.length],
      });
      
      console.log(`[TableManager] Mixed game rotation: ${newVariant} (${this._mixedGameIndex + 1}/${this.variantRotation.length})`);
    }
  }

  _checkAutoStart() {
    if (this._autoStartTimer) {
      clearTimeout(this._autoStartTimer);
      this._autoStartTimer = null;
    }
    
    if (this.game.phase !== GAME_PHASE.IDLE) return;
    if (this.status === TABLE_STATUS.PAUSED || this.status === TABLE_STATUS.CLOSED) return;
    
    const activePlayers = this.seats.filter(
      s => s.status === SEAT_STATUS.OCCUPIED && s.stack > 0
    );
    
    if (activePlayers.length >= 2) {
      this._autoStartTimer = setTimeout(() => {
        this.startNextHand();
      }, this.autoStartDelay);
    }
  }

  /**
   * Offer next waitlist player a seat.
   * @private
   */
  _seatFromWaitlist(seatIndex) {
    if (this.waitlist.length === 0) return;
    this._offerSeatFromWaitlist(seatIndex);
  }

  /**
   * Reserve a seat for the next waitlist player.
   * @private
   */
  _offerSeatFromWaitlist(seatIndex) {
    if (this.waitlist.length === 0) return;
    
    const seat = this.seats[seatIndex];
    if (seat.status !== SEAT_STATUS.EMPTY) return;
    
    const next = this.waitlist.shift();
    
    seat.status = SEAT_STATUS.RESERVED;
    seat.reservedFor = next.playerId;
    seat.reservedAt = Date.now();
    
    this.emit('seat_offered', {
      playerId: next.playerId,
      seatIndex,
      timeout: RESERVATION_TIMEOUT_MS,
    });
    
    // Start reservation timeout
    const timer = setTimeout(() => {
      if (seat.status === SEAT_STATUS.RESERVED && seat.reservedFor === next.playerId) {
        seat.status = SEAT_STATUS.EMPTY;
        seat.reservedFor = null;
        seat.reservedAt = null;
        this.emit('reservation_expired', { playerId: next.playerId, seatIndex });
        // Offer to next person
        this._seatFromWaitlist(seatIndex);
      }
    }, RESERVATION_TIMEOUT_MS);
    
    this._reservationTimers.set(seatIndex, timer);
  }

  /**
   * Clear a reservation timer.
   * @private
   */
  _clearReservation(seatIndex) {
    if (this._reservationTimers.has(seatIndex)) {
      clearTimeout(this._reservationTimers.get(seatIndex));
      this._reservationTimers.delete(seatIndex);
    }
  }

  // ============ PUBLIC: STATE ============

  /**
   * Get full table state for broadcasting.
   * @param {string|number} [forPlayerId] - Show that player's hole cards
   * @returns {Object}
   */
  getState(forPlayerId) {
    const gameState = this.game.getState(forPlayerId);
    
    return {
      tableId: this.tableId,
      clubId: this.clubId,
      status: this.status,
      handCount: this.handCount,
      maxSeats: this.maxSeats,
      seats: this.seats.map((s, idx) => ({
        seatIndex: s.seatIndex,
        status: s.status,
        player: s.player ? {
          id: s.player.id,
          // Anonymous table: hide real names unless it's the requesting player
          displayName: this.anonymousTable && String(s.player.id) !== String(forPlayerId)
            ? `Player ${idx + 1}`
            : s.player.displayName,
          avatarUrl: this.anonymousTable && String(s.player.id) !== String(forPlayerId)
            ? null
            : s.player.avatarUrl,
        } : null,
        stack: s.stack,
        // Only show hole cards for the requesting player
        holeCards: gameState.players?.find(p => 
          p.id === s.player?.id && (String(p.id) === String(forPlayerId) || p.showCards)
        )?.holeCards || null,
        isInHand: gameState.players?.some(p => p.id === s.player?.id && !p.folded) || false,
        isFolded: gameState.players?.some(p => p.id === s.player?.id && p.folded) || false,
        isCurrentActor: String(gameState.currentPlayerId) === String(s.player?.id),
        invested: gameState.players?.find(p => p.id === s.player?.id)?.invested || 0,
      })),
      waitlist: this.waitlist.map((w, i) => ({
        playerId: w.playerId,
        displayName: w.displayName,
        position: i + 1,
      })),
      game: {
        phase: gameState.phase,
        handNumber: gameState.handNumber,
        communityCards: gameState.communityCards || [],
        boards: gameState.boards || undefined,
        potTotal: gameState.potTotal || 0,
        pots: gameState.pots || [],
        currentBet: gameState.currentBet || 0,
        currentPlayerId: gameState.currentPlayerId,
        buttonSeat: gameState.buttonSeat,
        result: gameState.result,
      },
      config: {
        variant: this.game.config.variant,
        bettingStructure: this.game.config.bettingStructure,
        smallBlind: this.smallBlind,
        bigBlind: this.bigBlind,
        minBuyIn: this.minBuyIn,
        maxBuyIn: this.maxBuyIn,
        tableName: this.tableName,
        // Feature flags for UI indicators
        anonymousTable: this.anonymousTable,
        capAmount: this.game.config.capAmount || 0,
        autoMuck: this.game.config.autoMuck,
        privateGame: this.privateGame,
        vipOnly: this.vipOnly,
        nitGame: this.nitGame,
        maintainPercent: this.maintainPercent || 0,
        numBoards: this.game.config.numBoards || 1,
        bombPot: !!this.bombPotConfig?.enabled,
        sevenDeuce: this.sevenDeuce,
        noRathole: this.noRathole,
        pineapple: this.game.config.variant === 'pineapple',
        banChat: this.banChat,
        mixedGame: this.mixedGame,
        variantRotation: this.variantRotation,
        currentVariantIndex: this._mixedGameIndex,
      },
    };
  }

  /**
   * Get the current player actions if it's their turn.
   * @param {string|number} playerId
   * @returns {Object|null}
   */
  getActionsForPlayer(playerId) {
    const current = this.game.getCurrentActions();
    if (!current || String(current.playerId) !== String(playerId)) return null;
    return current;
  }

  /**
   * Get player's private cards.
   * @param {string|number} playerId
   * @returns {number[]|null}
   */
  getPlayerCards(playerId) {
    return this.game.getPlayerCards(playerId);
  }

  /**
   * Admin: Pause the table.
   */
  pause() {
    this.status = TABLE_STATUS.PAUSED;
    this.emit('table_paused', { tableId: this.tableId });
  }

  /**
   * Admin: Resume the table.
   */
  resume() {
    this.status = TABLE_STATUS.BETWEEN_HANDS;
    this.emit('table_resumed', { tableId: this.tableId });
    this._checkAutoStart();
  }

  /**
   * Admin: Close the table.
   */
  close() {
    this.status = TABLE_STATUS.CLOSED;
    if (this._autoStartTimer) clearTimeout(this._autoStartTimer);
    
    // Cash out all players
    const cashouts = [];
    for (const seat of this.seats) {
      if (seat.player && seat.stack > 0) {
        cashouts.push({ playerId: seat.player.id, amount: seat.stack });
      }
      this._vacateSeat(seat);
    }
    
    this.emit('table_closed', { tableId: this.tableId, cashouts });
  }

  /**
   * Destroy and clean up timers.
   */
  destroy() {
    if (this._autoStartTimer) clearTimeout(this._autoStartTimer);
    for (const timer of this._disconnectTimers.values()) clearTimeout(timer);
    for (const timer of this._reservationTimers.values()) clearTimeout(timer);
    this._disconnectTimers.clear();
    this._reservationTimers.clear();
    this._listeners.clear();
  }
}

// ============ EXPORTS ============

module.exports = {
  SEAT_STATUS,
  TABLE_STATUS,
  TableManager,
};
