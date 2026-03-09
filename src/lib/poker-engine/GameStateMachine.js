/**
 * Smarter.Poker - Core Poker Engine
 * Module: GameStateMachine
 * 
 * Orchestrates the full lifecycle of a poker hand:
 *   IDLE → POST_BLINDS → DEAL → PREFLOP → FLOP → TURN → RIVER → SHOWDOWN → PAYOUT → IDLE
 * 
 * This is the central controller that coordinates the Deck, HandEvaluator,
 * PotCalculator, ActionValidator, and BettingRound modules.
 * 
 * Emits events for the UI/network layer to respond to:
 *   - hand_start, blinds_posted, cards_dealt, street_start, 
 *   - action_required, action_processed, street_complete,
 *   - showdown, payout, hand_complete
 */

const { Deck } = require('./Deck');
const { evaluateHoldem, evaluateOmaha, holdemShowdown, omahaShowdown } = require('./HandEvaluator');
const { PotCalculator } = require('./PotCalculator');
const { ActionValidator, ACTION_TYPES, BETTING_STRUCTURES } = require('./ActionValidator');
const { BettingRound, ROUND_STATUS } = require('./BettingRound');
const { calculateEquity } = require('./EquityCalculator');

// ============ CONSTANTS ============

const GAME_PHASE = {
  IDLE: 'idle',
  POST_BLINDS: 'post_blinds',
  DEAL: 'deal',
  PREFLOP: 'preflop',
  FLOP: 'flop',
  DISCARD: 'discard',   // Pineapple: discard 1 card after flop betting
  TURN: 'turn',
  RIVER: 'river',
  SHOWDOWN: 'showdown',
  PAYOUT: 'payout',
};

const GAME_VARIANT = {
  HOLDEM: 'holdem',
  OMAHA4: 'omaha4',     // PLO 4-card
  OMAHA5: 'omaha5',     // PLO 5-card
  OMAHA6: 'omaha6',     // PLO 6-card
  SHORT_DECK: 'short_deck',
  OMAHA_HILO: 'omaha_hilo',
  PINEAPPLE: 'pineapple', // Crazy Pineapple — 3 hole cards, discard 1 after flop
};

const STREETS = ['preflop', 'flop', 'turn', 'river'];

// ============ GAME STATE MACHINE ============

class GameStateMachine {
  /**
   * @param {Object} config
   * @param {string} config.variant - Game variant (holdem, omaha4, etc.)
   * @param {string} config.bettingStructure - no_limit, pot_limit, fixed_limit
   * @param {number} config.smallBlind
   * @param {number} config.bigBlind
   * @param {number} [config.ante] - Per-player ante (in BBA mode, BB posts ante × numPlayers)
   * @param {boolean} [config.bigBlindAnte] - Big-Blind Ante mode: BB posts full table ante
   * @param {number} [config.rakePercent] - Rake percentage
   * @param {number} [config.rakeCap] - Maximum rake per pot
   * @param {boolean} [config.runItTwice] - Allow run-it-twice
   * @param {boolean} [config.runItThrice] - Allow run-it-three-times
   * @param {boolean} [config.insurance] - Allow insurance when all-in
   * @param {boolean} [config.bombPot] - Bomb pot mode
   * @param {boolean} [config.straddle] - Allow straddle
   */
  constructor(config) {
    this.config = {
      variant: config.variant || GAME_VARIANT.HOLDEM,
      bettingStructure: config.bettingStructure || BETTING_STRUCTURES.NO_LIMIT,
      smallBlind: config.smallBlind,
      bigBlind: config.bigBlind,
      ante: config.ante || 0,
      bigBlindAnte: config.bigBlindAnte || false,
      rakePercent: config.rakePercent || 0,
      rakeCap: config.rakeCap || Infinity,
      bbjEnabled: config.bbjEnabled || false,
      runItTwice: config.runItTwice || false,
      runItThrice: config.runItThrice || false,
      // Run-it mode: 'none' | 'player_choice' | 'mandatory_twice' | 'mandatory_thrice'
      runItMode: config.runItMode || (config.runItThrice ? 'mandatory_thrice' : config.runItTwice ? 'mandatory_twice' : 'none'),
      insurance: config.insurance || false,
      bombPot: config.bombPot || false,
      straddle: config.straddle || config.autoUtgStraddle || config.voluntaryStraddle || false,
      autoUtgStraddle: config.autoUtgStraddle || false,
      voluntaryStraddle: config.voluntaryStraddle || false,
      // Muck control: when true (default), losers' cards hidden; when false, all shown
      autoMuck: config.autoMuck !== false,
      // Cap game: max total investment per player per hand (0 = no cap)
      capAmount: config.capAmount || 0,
      // Multi-board: 1 = normal, 2 = double board, 3 = triple board
      numBoards: config.doubleBoard ? 2 : config.tripleBoard ? 3 : (config.numBoards || 1),
    };

    // Engine components
    this.deck = new Deck({ shortDeck: config.variant === GAME_VARIANT.SHORT_DECK });
    this.potCalculator = new PotCalculator();
    this.actionValidator = new ActionValidator({
      bettingStructure: this.config.bettingStructure,
      bigBlind: this.config.bigBlind,
      smallBlind: this.config.smallBlind,
      ante: this.config.ante,
      allowStraddle: this.config.straddle,
    });

    // Game state
    this.phase = GAME_PHASE.IDLE;
    this.handNumber = 0;
    this.buttonSeat = -1; // Will be set on first hand
    this._pendingStraddles = new Set(); // Players who want to straddle next hand

    // Current hand state
    this.currentHand = null;
    this.bettingRound = null;

    // Event listeners
    this._listeners = new Map();
  }

  // ============ EVENT SYSTEM ============

  /**
   * Register an event listener.
   * @param {string} event
   * @param {Function} callback
   */
  on(event, callback) {
    if (!this._listeners.has(event)) {
      this._listeners.set(event, []);
    }
    this._listeners.get(event).push(callback);
  }

  /**
   * Emit an event to all listeners.
   * @param {string} event
   * @param {Object} data
   */
  emit(event, data) {
    const listeners = this._listeners.get(event) || [];
    for (const cb of listeners) {
      try {
        cb(data);
      } catch (err) {
        console.error(`Event handler error (${event}):`, err);
      }
    }
  }

  // ============ HAND LIFECYCLE ============

  /**
   * Start a new hand.
   * @param {Array<{ id: string|number, stack: number, seatIndex: number }>} players
   *   Players seated at the table with their current stacks, in seat order.
   *   Must have at least 2 players.
   * @param {number} [buttonSeat] - Override button position (otherwise auto-rotates)
   * @returns {Object} Hand state
   */
  startHand(players, buttonSeat, options = {}) {
    if (players.length < 2) {
      throw new Error('Need at least 2 players to start a hand');
    }

    // Validate all players have chips
    const playersWithChips = players.filter(p => p.stack > 0);
    if (playersWithChips.length < 2) {
      throw new Error('Need at least 2 players with chips');
    }

    this.handNumber++;

    // Rotate button
    if (buttonSeat !== undefined) {
      this.buttonSeat = buttonSeat;
    } else {
      this.buttonSeat = this._rotateButton(playersWithChips);
    }

    // Determine blind positions
    const positions = this._assignPositions(playersWithChips);

    const isBombPot = options.bombPot || false;

    // Generate unique display hand ID — format: TTTT:HHHHHH
    //   TTTT  = first 4 hex chars of tableId (stable per table session)
    //   HHHHHH = zero-padded hand number (unique within this table run)
    // This ID is displayed on the table during play.
    // The globally unique DB sequential ID (SP-XXXXXXXXXX) is assigned
    // by the record_rake() RPC when the hand completes and rake is recorded.
    const tableCode = (this.config.tableId || 'LOCAL')
      .replace(/-/g, '').slice(0, 4).toUpperCase();
    const paddedHand = String(this.handNumber).padStart(6, '0');
    const handId = `${tableCode}:H${paddedHand}`;

    // Initialize hand state
    this.currentHand = {
      handNumber: this.handNumber,
      handId,
      players: playersWithChips.map((p, i) => ({
        ...p,
        position: positions[i],
        holeCards: [],
        folded: false,
        allIn: false,
        showCards: false,
      })),
      communityCards: [],
      // Multi-board: boards[0] = primary (alias of communityCards), boards[1..N] = extra
      boards: Array.from({ length: this.config.numBoards }, () => []),
      pot: 0,
      buttonSeat: this.buttonSeat,
      blinds: { sb: null, bb: null, straddle: null },
      straddleActive: false,
      actions: [],
      result: null,
      isBombPot,
    };

    // Reset components
    this.deck.reset();
    this.potCalculator.reset();

    this.phase = GAME_PHASE.POST_BLINDS;

    this.emit('hand_start', {
      handNumber: this.handNumber,
      handId,
      players: this.currentHand.players.map(p => ({ id: p.id, stack: p.stack, seatIndex: p.seatIndex, position: p.position })),
      buttonSeat: this.buttonSeat,
      bombPot: isBombPot,
    });

    if (isBombPot) {
      // ── BOMB POT: Everyone antes, skip preflop, deal flop ──
      const bombPotAnte = this.config.bigBlind * 2; // 2x BB per player
      const bombPotAmounts = [];
      for (const player of this.currentHand.players) {
        const amount = Math.min(bombPotAnte, player.stack);
        player.stack -= amount;
        this.potCalculator.addContribution(player.id, amount);
        bombPotAmounts.push({ id: player.id, amount, stack: player.stack });
        if (player.stack <= 0) player.allIn = true;
      }
      this.emit('blinds_posted', {
        bombPot: true,
        ante: bombPotAnte,
        players: bombPotAmounts,
      });

      // Deal hole cards
      this._dealHoleCards();

      // Deal flop immediately
      this._dealCommunityCards('flop');
      this.emit('street_start', {
        street: 'flop',
        communityCards: [...this.currentHand.communityCards],
        boards: this.config.numBoards > 1 ? this.currentHand.boards.map(b => [...b]) : undefined,
      });

      // Start betting at flop (skip preflop entirely)
      this._startBettingRound('flop');
    } else {
      // ── NORMAL HAND ──
      // Post blinds
      this._postBlinds();

      // Deal cards
      this._dealHoleCards();

      // Start preflop betting
      this._startBettingRound('preflop');
    }

    return this.getState();
  }

  /**
   * Process a player action.
   * @param {string|number} playerId
   * @param {Object} action - { type: string, amount?: number }
   * @returns {Object} Updated game state
   */
  processAction(playerId, action) {
    if (!this.bettingRound || this.bettingRound.status !== ROUND_STATUS.IN_PROGRESS) {
      throw new Error('No active betting round');
    }

    const result = this.bettingRound.processAction(playerId, action);

    if (!result.success) {
      return { success: false, error: result.error, state: this.getState() };
    }

    // Update pot calculator
    const player = this.currentHand.players.find(p => String(p.id) === String(playerId));
    if (result.action.type === ACTION_TYPES.FOLD) {
      player.folded = true;
      this.potCalculator.markFolded(playerId);
    } else if (result.action.amount > 0) {
      player.stack -= result.action.amount;
      this.potCalculator.addContribution(playerId, result.action.amount);
      // Mark all-in if action was explicitly all_in OR if stack is now 0
      if (result.action.type === ACTION_TYPES.ALL_IN || player.stack <= 0) {
        player.allIn = true;
        player.stack = 0;
        this.potCalculator.markAllIn(playerId);
      }
    }

    // Log action
    this.currentHand.actions.push({
      street: this.phase,
      playerId,
      action: result.action,
      potAfter: this.potCalculator.totalPot,
    });

    this.emit('action_processed', {
      playerId,
      action: result.action,
      street: this.phase,
      potTotal: this.potCalculator.totalPot,
      currentBet: this.bettingRound.currentBet,
    });

    // Check if round is complete
    if (result.roundComplete) {
      this._onRoundComplete();
    } else {
      // Emit action required for next player
      const nextPlayer = this.bettingRound.getCurrentPlayer();
      if (nextPlayer) {
        this.emit('action_required', {
          playerId: nextPlayer.id,
          legalActions: this.bettingRound.getLegalActions(),
          timeBank: 30, // Default time bank seconds
        });
      }
    }

    return { success: true, state: this.getState() };
  }

  /**
   * Declare straddle for the next hand (voluntary straddle).
   * Player must be UTG in the next hand for this to take effect.
   * @param {string} playerId
   */
  declareStraddle(playerId) {
    if (!this.config.voluntaryStraddle) {
      return { success: false, error: 'Voluntary straddle not enabled at this table' };
    }
    this._pendingStraddles.add(String(playerId));
    this.emit('straddle_declared', { playerId });
    return { success: true };
  }

  /**
   * Cancel straddle declaration for next hand.
   * @param {string} playerId
   */
  cancelStraddle(playerId) {
    this._pendingStraddles.delete(String(playerId));
    return { success: true };
  }

  // ============ PINEAPPLE DISCARD ============

  /**
   * Process a player's discard choice (Pineapple variant).
   * After flop betting, each player discards 1 of their 3 hole cards.
   * @param {string} playerId
   * @param {number} cardIndex - Index (0-2) of the card to discard from hole cards
   */
  processDiscard(playerId, cardIndex) {
    if (this.phase !== GAME_PHASE.DISCARD) {
      return { success: false, error: 'Not in discard phase' };
    }

    const pid = String(playerId);
    if (!this._pendingDiscards?.has(pid)) {
      return { success: false, error: 'Not waiting for your discard' };
    }

    const player = this.currentHand.players.find(p => String(p.id) === pid);
    if (!player) return { success: false, error: 'Player not found' };

    if (!player.holeCards || player.holeCards.length !== 3) {
      return { success: false, error: 'Player does not have 3 hole cards' };
    }

    if (cardIndex < 0 || cardIndex >= 3) {
      return { success: false, error: 'Card index must be 0, 1, or 2' };
    }

    // Remove the discarded card
    const discardedCard = player.holeCards.splice(cardIndex, 1)[0];
    this._pendingDiscards.delete(pid);

    this.emit('card_discarded', {
      playerId: pid,
      remainingCards: 2,
      // Don't broadcast which card — private info
    });

    // Check if all discards are in
    if (this._pendingDiscards.size === 0) {
      this._finishDiscardPhase();
    }

    return { success: true };
  }

  /**
   * Auto-discard the worst card for all-in players (Pineapple).
   * Uses hand evaluation to keep the best 2-card combo.
   * @private
   */
  _autoDiscardWorstCard(player) {
    if (!player.holeCards || player.holeCards.length !== 3) return;

    const board = this.currentHand.communityCards;
    let bestScore = -1;
    let bestDiscardIdx = 0;

    // Try discarding each card, keep the combo that makes the best hand
    for (let i = 0; i < 3; i++) {
      const twoCards = player.holeCards.filter((_, idx) => idx !== i);
      try {
        const result = evaluateHoldem(twoCards, board);
        if (result.score > bestScore) {
          bestScore = result.score;
          bestDiscardIdx = i;
        }
      } catch (e) {
        // If evaluation fails, discard first card
        bestDiscardIdx = 0;
      }
    }

    player.holeCards.splice(bestDiscardIdx, 1);
  }

  /**
   * Finish the discard phase and continue to turn.
   * @private
   */
  _finishDiscardPhase() {
    this._pendingDiscards = null;

    // Now continue as normal — deal turn card and start betting
    this.phase = 'flop'; // Reset to flop so _getNextStreet returns 'turn'
    const nextStreet = this._getNextStreet();

    if (!nextStreet) {
      this._handleShowdown();
      return;
    }

    this._dealCommunityCards(nextStreet);

    const activePlayers = this.currentHand.players.filter(p => !p.folded);
    const actionablePlayers = activePlayers.filter(p => !p.allIn);
    if (actionablePlayers.length <= 1) {
      this._runOutBoard(nextStreet);
      return;
    }

    this._startBettingRound(nextStreet);
  }

  /**
   * Auto-discard for a player who times out during discard phase.
   * @param {string} playerId
   */
  autoDiscard(playerId) {
    const player = this.currentHand.players.find(p => String(p.id) === String(playerId));
    if (player && player.holeCards?.length === 3) {
      this._autoDiscardWorstCard(player);
      this._pendingDiscards?.delete(String(playerId));
      this.emit('card_discarded', { playerId: String(playerId), remainingCards: 2 });
      if (this._pendingDiscards?.size === 0) {
        this._finishDiscardPhase();
      }
    }
  }

  // ============ PRIVATE: BLIND POSTING ============

  /**
   * Post Small-Blind, Big-Blind, and antes.
   * @private
   */
  _postBlinds() {
    const players = this.currentHand.players;
    const { smallBlind, bigBlind, ante } = this.config;

    // Find SB and BB players
    // In heads-up, the button player is also the SB
    const sbPlayer = players.find(p => p.position === 'sb')
      || (players.length === 2 ? players.find(p => p.position === 'btn') : null);
    const bbPlayer = players.find(p => p.position === 'bb');

    // Post antes (traditional ante: before blinds; BBA: after blinds)
    if (ante > 0 && !this.config.bigBlindAnte) {
      // ── TRADITIONAL ANTE: Each player posts individually ──
      for (const player of players) {
        const anteAmount = Math.min(ante, player.stack);
        player.stack -= anteAmount;
        this.potCalculator.addContribution(player.id, anteAmount);
        if (player.stack <= 0) {
          player.allIn = true;
          this.potCalculator.markAllIn(player.id);
        }
      }
    }

    // Post Small-Blind
    if (sbPlayer) {
      const sbAmount = Math.min(smallBlind, sbPlayer.stack);
      sbPlayer.stack -= sbAmount;
      this.potCalculator.addContribution(sbPlayer.id, sbAmount);
      this.currentHand.blinds.sb = { playerId: sbPlayer.id, amount: sbAmount };
      if (sbPlayer.stack <= 0) {
        sbPlayer.allIn = true;
        this.potCalculator.markAllIn(sbPlayer.id);
      }
    }

    // Post Big-Blind
    if (bbPlayer) {
      const bbAmount = Math.min(bigBlind, bbPlayer.stack);
      bbPlayer.stack -= bbAmount;
      this.potCalculator.addContribution(bbPlayer.id, bbAmount);
      this.currentHand.blinds.bb = { playerId: bbPlayer.id, amount: bbAmount };
      if (bbPlayer.stack <= 0) {
        bbPlayer.allIn = true;
        this.potCalculator.markAllIn(bbPlayer.id);
      }
    }

    // BIG BLIND ANTE: posted AFTER BB blind so blind is always covered first
    if (ante > 0 && this.config.bigBlindAnte && bbPlayer) {
      const totalAnte = ante * players.length;
      const anteAmount = Math.min(totalAnte, bbPlayer.stack);
      if (anteAmount > 0) {
        bbPlayer.stack -= anteAmount;
        this.potCalculator.addContribution(bbPlayer.id, anteAmount);
        if (bbPlayer.stack <= 0) {
          bbPlayer.allIn = true;
          this.potCalculator.markAllIn(bbPlayer.id);
        }
      }
    }

    this.emit('blinds_posted', {
      smallBlind: this.currentHand.blinds.sb,
      bigBlind: this.currentHand.blinds.bb,
      straddle: this.currentHand.blinds.straddle || null,
      ante: ante > 0 ? ante : null,
      bigBlindAnte: this.config.bigBlindAnte,
      potTotal: this.potCalculator.totalPot,
    });

    // ── STRADDLE ──────────────────────────────────────────────
    // If auto_utg_straddle: UTG always straddles (2x BB)
    // If voluntary_straddle: UTG can opt in (handled via pendingStraddle flag)
    // Straddle is posted AFTER blinds, BEFORE cards are dealt.
    // Note: In 3-handed, UTG is the button. Position label may be 'btn' not 'utg'.
    // We find the straddle-eligible player by seat order: next active player after BB.
    if ((this.config.straddle || this.config.autoUtgStraddle || this.config.voluntaryStraddle) && players.length > 2) {
      // Find UTG by seat: the player immediately after BB in seat order
      const bbPlayerId = this.currentHand.blinds.bb?.playerId;
      const bbPlayer2 = players.find(p => p.id === bbPlayerId);
      let utgPlayer = null;
      if (bbPlayer2) {
        const bbSeatIdx = players.indexOf(bbPlayer2);
        const utgIdx = (bbSeatIdx + 1) % players.length;
        utgPlayer = players[utgIdx];
      } else {
        // Fallback: look for position label
        utgPlayer = players.find(p => p.position === 'utg');
      }
      if (utgPlayer && utgPlayer.stack > 0) {
        const isAuto = this.config.autoUtgStraddle;
        const isVoluntary = this.config.voluntaryStraddle;
        // Auto straddle: always post. Voluntary: check pending flag.
        const shouldStraddle = isAuto || (isVoluntary && this._pendingStraddles?.has(String(utgPlayer.id)));

        if (shouldStraddle) {
          const straddleAmount = Math.min(bigBlind * 2, utgPlayer.stack);
          utgPlayer.stack -= straddleAmount;
          this.potCalculator.addContribution(utgPlayer.id, straddleAmount);
          this.currentHand.blinds.straddle = { playerId: utgPlayer.id, amount: straddleAmount };
          this.currentHand.straddleActive = true;
          if (utgPlayer.stack <= 0) {
            utgPlayer.allIn = true;
            this.potCalculator.markAllIn(utgPlayer.id);
          }
          this.emit('straddle_posted', {
            playerId: utgPlayer.id,
            amount: straddleAmount,
            potTotal: this.potCalculator.totalPot,
          });
        }
      }
      // Clear pending straddles for next hand
      this._pendingStraddles = new Set();
    }
  }

  // ============ PRIVATE: DEALING ============

  /**
   * Deal hole cards to all players.
   * @private
   */
  _dealHoleCards() {
    const players = this.currentHand.players;
    const cardsPerPlayer = this._getCardsPerPlayer();

    const hands = this.deck.dealHoleCards(players.length, cardsPerPlayer);

    for (let i = 0; i < players.length; i++) {
      players[i].holeCards = hands[i];
    }

    this.phase = GAME_PHASE.DEAL;

    this.emit('cards_dealt', {
      players: players.map(p => ({
        id: p.id,
        cardCount: cardsPerPlayer,
        // Note: actual cards are private! Only sent to the specific player
      })),
    });
  }

  /**
   * Get cards per player based on variant.
   * @private
   */
  _getCardsPerPlayer() {
    switch (this.config.variant) {
      case GAME_VARIANT.HOLDEM:
      case GAME_VARIANT.SHORT_DECK:
        return 2;
      case GAME_VARIANT.PINEAPPLE:
        return 3; // Deal 3, discard 1 after flop
      case GAME_VARIANT.OMAHA4:
      case GAME_VARIANT.OMAHA_HILO:
        return 4;
      case GAME_VARIANT.OMAHA5:
        return 5;
      case GAME_VARIANT.OMAHA6:
        return 6;
      default:
        return 2;
    }
  }

  // ============ PRIVATE: BETTING ROUNDS ============

  /**
   * Start a new betting round.
   * @private
   */
  _startBettingRound(street) {
    this.phase = street;

    const activePlayers = this.currentHand.players.filter(p => !p.folded);

    // Build player list for the betting round
    // Order: For preflop, UTG first. For postflop, first after button.
    let orderedPlayers;
    if (street === 'preflop') {
      orderedPlayers = this._getPreflopOrder();
    } else {
      orderedPlayers = this._getPostflopOrder();
    }

    // Prepare blind info for preflop
    let blinds = undefined;
    if (street === 'preflop') {
      blinds = [];
      const sb = this.currentHand.blinds.sb;
      const bb = this.currentHand.blinds.bb;
      const straddle = this.currentHand.blinds.straddle;
      if (sb) blinds.push({ playerId: sb.playerId, amount: sb.amount });
      if (bb) blinds.push({ playerId: bb.playerId, amount: bb.amount });
      if (straddle) blinds.push({ playerId: straddle.playerId, amount: straddle.amount });
    }

    this.bettingRound = new BettingRound({
      players: orderedPlayers.map(p => ({
        id: p.id,
        stack: p.stack,
        position: p.position,
      })),
      street,
      validator: this.actionValidator,
      capAmount: this.config.capAmount || 0,
    });

    this.bettingRound.start({
      potFromPreviousRounds: this.potCalculator.totalPot - (blinds ? blinds.reduce((s, b) => s + b.amount, 0) : 0),
      blinds: street === 'preflop' ? blinds : undefined,
    });

    this.emit('street_start', {
      street,
      communityCards: this.currentHand.communityCards.map(c => c),
      boards: this.config.numBoards > 1 ? this.currentHand.boards.map(b => [...b]) : undefined,
      potTotal: this.potCalculator.totalPot,
    });

    // Check if betting is already complete (everyone all-in)
    if (this.bettingRound.status === ROUND_STATUS.COMPLETE) {
      this._onRoundComplete();
      return;
    }

    // Emit action required for first player
    const firstPlayer = this.bettingRound.getCurrentPlayer();
    if (firstPlayer) {
      this.emit('action_required', {
        playerId: firstPlayer.id,
        legalActions: this.bettingRound.getLegalActions(),
        timeBank: 30,
      });
    }
  }

  /**
   * Handle completion of a betting round.
   * @private
   */
  _onRoundComplete() {
    // Check if hand is over (all but one folded)
    const activePlayers = this.currentHand.players.filter(p => !p.folded);

    if (activePlayers.length <= 1) {
      // Everyone folded - award pot to last player
      this._handleFoldWin(activePlayers[0]);
      return;
    }

    // ── PINEAPPLE DISCARD — After flop betting, players discard 1 of 3 cards ──
    if (this.config.variant === GAME_VARIANT.PINEAPPLE && this.phase === 'flop') {
      this.phase = GAME_PHASE.DISCARD;
      this._pendingDiscards = new Set(activePlayers.filter(p => !p.allIn).map(p => String(p.id)));
      // All-in players auto-discard their worst card
      for (const p of activePlayers.filter(pl => pl.allIn)) {
        this._autoDiscardWorstCard(p);
      }
      this.emit('discard_required', {
        playerIds: [...this._pendingDiscards],
        deadline: 15, // seconds to discard
      });
      // If all are all-in, no one needs to discard manually
      if (this._pendingDiscards.size === 0) {
        this._finishDiscardPhase();
      }
      return;
    }

    // Advance to next street
    const nextStreet = this._getNextStreet();

    if (!nextStreet) {
      // No more streets - go to showdown
      this._handleShowdown();
      return;
    }

    // Check if we need to deal community cards
    this._dealCommunityCards(nextStreet);

    // Check if all remaining players are all-in (run out the board)
    const actionablePlayers = activePlayers.filter(p => !p.allIn);
    if (actionablePlayers.length <= 1) {
      // Run out remaining streets without betting
      this._runOutBoard(nextStreet);
      return;
    }

    // Start next betting round
    this._startBettingRound(nextStreet);
  }

  /**
   * Deal community cards for the given street.
   * @private
   */
  _dealCommunityCards(street) {
    // Deal to primary board (board[0] / communityCards)
    switch (street) {
      case 'flop':
        const flop = this.deck.dealFlop();
        this.currentHand.communityCards.push(...flop);
        if (this.currentHand.boards?.[0]) this.currentHand.boards[0] = [...this.currentHand.communityCards];
        break;
      case 'turn':
        const turn = this.deck.dealTurn();
        this.currentHand.communityCards.push(turn);
        if (this.currentHand.boards?.[0]) this.currentHand.boards[0] = [...this.currentHand.communityCards];
        break;
      case 'river':
        const river = this.deck.dealRiver();
        this.currentHand.communityCards.push(river);
        if (this.currentHand.boards?.[0]) this.currentHand.boards[0] = [...this.currentHand.communityCards];
        break;
    }

    // Multi-board: deal same street to extra boards (board[1], board[2])
    const numBoards = this.config.numBoards || 1;
    if (numBoards > 1) {
      for (let b = 1; b < numBoards; b++) {
        if (!this.currentHand.boards[b]) this.currentHand.boards[b] = [];
        switch (street) {
          case 'flop':
            this.currentHand.boards[b].push(...this.deck.dealFlop());
            break;
          case 'turn':
            this.currentHand.boards[b].push(this.deck.dealTurn());
            break;
          case 'river':
            this.currentHand.boards[b].push(this.deck.dealRiver());
            break;
        }
      }
    }
  }

  /**
   * Run out remaining community cards when all players are all-in.
   * Supports Run It Twice (2 boards), Run It Thrice (3 boards), and Insurance.
   * 
   * Run-it modes:
   *   - 'none': Single board always
   *   - 'player_choice': Best-hand player proposes; ALL others must agree or it's single board
   *   - 'mandatory_twice': Auto run 2 boards (any 2+ all-in)
   *   - 'mandatory_thrice': Auto run 3 boards (any 2+ all-in)
   * @private
   */
  _runOutBoard(fromStreet) {
    const activePlayers = this.currentHand.players.filter(p => !p.folded);
    const multiAllIn = activePlayers.length >= 2 && fromStreet !== 'river';
    const mode = this.config.runItMode || 'none';

    // Emit equity immediately when all-in is detected (before any new cards)
    if (activePlayers.length >= 2) {
      this._emitAllInEquity(activePlayers);
    }

    // ── MANDATORY MODES — auto-trigger, no consent needed ──
    if (multiAllIn && mode === 'mandatory_thrice') {
      this._runItMultiple(fromStreet, activePlayers, 3);
      return;
    }
    if (multiAllIn && mode === 'mandatory_twice') {
      this._runItMultiple(fromStreet, activePlayers, 2);
      return;
    }

    // ── PLAYER CHOICE — best hand proposes, all others accept/decline ──
    if (multiAllIn && mode === 'player_choice') {
      this._offerRunIt(fromStreet, activePlayers);
      return;
    }

    // ── LEGACY BOOLEAN FLAGS (backwards compatible) ──
    if (multiAllIn && this.config.runItThrice && mode === 'none') {
      this._runItMultiple(fromStreet, activePlayers, 3);
      return;
    }
    if (multiAllIn && this.config.runItTwice && mode === 'none') {
      this._runItMultiple(fromStreet, activePlayers, 2);
      return;
    }

    // ── DEFAULT — Single board runout with equity updates per street ──
    this._singleBoardRunout(fromStreet);
  }

  /**
   * ═══════════════════════════════════════════════════════════════
   * RUN IT OFFER — Best-hand player proposes, all others accept/decline
   * ═══════════════════════════════════════════════════════════════
   * 
   * Flow:
   *   1. Evaluate current hands with available community cards
   *   2. Player with the best hand is the "proposer"
   *   3. Proposer chooses: 'once' | 'twice' | 'thrice'
   *   4. All other all-in players must 'accept' or 'decline'
   *   5. ANY single decline → single board (run once)
   *   6. ALL accept → run the number of boards the proposer chose
   * 
   * Works for 2, 3, 4, 5+ players all-in.
   * @private
   */
  _offerRunIt(fromStreet, activePlayers) {
    const board = [...this.currentHand.communityCards];

    // ── Evaluate current hands to find the leader ──
    const isOmaha = [GAME_VARIANT.OMAHA4, GAME_VARIANT.OMAHA5, GAME_VARIANT.OMAHA6, GAME_VARIANT.OMAHA_HILO].includes(this.config.variant);
    const isShortDeck = this.config.variant === GAME_VARIANT.SHORT_DECK;

    let rankings = activePlayers.map(p => {
      let hand;
      if (board.length >= 3) {
        // We have community cards — evaluate partial hand
        if (isOmaha) {
          hand = evaluateOmaha(p.holeCards, board);
        } else {
          hand = evaluateHoldem(p.holeCards, board, { shortDeck: isShortDeck });
        }
      } else {
        // Preflop all-in — just use hole card rank sum as tiebreaker
        const { getRank } = require('./Deck');
        const rankSum = p.holeCards.reduce((s, c) => s + getRank(c), 0);
        hand = { score: rankSum, description: 'Preflop' };
      }
      return { playerId: String(p.id), hand, score: hand.score };
    });

    rankings.sort((a, b) => b.score - a.score);
    const proposerId = rankings[0].playerId;
    const responderIds = rankings.slice(1).map(r => r.playerId);
    const allPlayerIds = activePlayers.map(p => String(p.id));

    // Store pending offer state
    this._runItOffer = {
      fromStreet,
      activePlayers,
      allPlayerIds,
      proposerId,
      responderIds,
      proposal: null,       // Will be set when proposer picks: 'once' | 'twice' | 'thrice'
      responses: {},         // responderId → 'accept' | 'decline'
      resolved: false,
      timeoutHandle: null,
    };

    // Emit offer to clients — proposer gets choice buttons, others wait
    this.emit('run_it_offer', {
      proposerId,
      responderIds,
      allPlayerIds,
      pot: this.potCalculator.totalPot,
      communityCards: board,
      deadline: 15, // seconds
      rankings: rankings.map(r => ({ playerId: r.playerId, description: r.hand.description })),
    });

    // Timeout: 15 seconds total. If not all responded, treat as decline.
    this._runItOffer.timeoutHandle = setTimeout(() => {
      if (!this._runItOffer || this._runItOffer.resolved) return;
      console.log('[RunIt] Offer timed out — running single board');
      this._resolveRunItOffer();
    }, 15000);
  }

  /**
   * Process a player's response to a run-it offer.
   * 
   * If the player is the PROPOSER:
   *   choice must be 'once' | 'twice' | 'thrice'
   *   - 'once' immediately ends the offer → single board
   *   - 'twice'/'thrice' sets the proposal, waits for responders
   * 
   * If the player is a RESPONDER:
   *   choice must be 'accept' | 'decline'
   *   - 'decline' immediately ends the offer → single board
   *   - 'accept' is recorded; if all responders accepted, run multiple boards
   * 
   * @param {string} playerId
   * @param {string} choice
   */
  respondRunIt(playerId, choice) {
    if (!this._runItOffer || this._runItOffer.resolved) {
      return { success: false, error: 'No pending run-it offer' };
    }

    const pid = String(playerId);
    const offer = this._runItOffer;

    // ── PROPOSER responding (best hand picks the number of boards) ──
    if (pid === offer.proposerId) {
      const validProposals = ['once', 'twice', 'thrice'];
      if (!validProposals.includes(choice)) {
        return { success: false, error: `Proposer must choose: ${validProposals.join(', ')}` };
      }

      if (choice === 'once') {
        // Proposer chose single board — done immediately, no need to ask others
        console.log('[RunIt] Proposer chose once — single board');
        this.emit('run_it_response', { playerId: pid, role: 'proposer', choice });
        offer.resolved = true;
        if (offer.timeoutHandle) { clearTimeout(offer.timeoutHandle); offer.timeoutHandle = null; }
        this.emit('run_it_declined', { reason: 'proposer_chose_once', proposer: pid });
        this._runItOffer = null;
        this._singleBoardRunout(offer.fromStreet);
        return { success: true };
      }

      // Proposer chose twice or thrice — set proposal and wait for responders
      offer.proposal = choice;
      this.emit('run_it_response', { playerId: pid, role: 'proposer', choice });

      // If there are no responders (only 1 player?? shouldn't happen but safe)
      // or check if all responders already responded
      this._checkRunItComplete();
      return { success: true };
    }

    // ── RESPONDER responding ──
    if (!offer.responderIds.includes(pid)) {
      return { success: false, error: 'You are not part of this run-it offer' };
    }

    const validResponses = ['accept', 'decline'];
    if (!validResponses.includes(choice)) {
      return { success: false, error: `Responder must choose: ${validResponses.join(', ')}` };
    }

    offer.responses[pid] = choice;
    this.emit('run_it_response', { playerId: pid, role: 'responder', choice });

    // Instant decline — any single decline kills the offer
    if (choice === 'decline') {
      console.log(`[RunIt] Player ${pid} declined — single board`);
      offer.resolved = true;
      if (offer.timeoutHandle) { clearTimeout(offer.timeoutHandle); offer.timeoutHandle = null; }
      this.emit('run_it_declined', { reason: 'responder_declined', declinedBy: pid });
      this._runItOffer = null;
      this._singleBoardRunout(offer.fromStreet);
      return { success: true };
    }

    // Check if all responders have now accepted
    this._checkRunItComplete();
    return { success: true };
  }

  /**
   * Check if the run-it offer is fully resolved.
   * Resolves when: proposer has chosen AND all responders have responded.
   * @private
   */
  _checkRunItComplete() {
    const offer = this._runItOffer;
    if (!offer || offer.resolved) return;

    // Need proposer's choice first
    if (!offer.proposal) return;

    // Need all responders to have responded
    const allResponded = offer.responderIds.every(pid => offer.responses[pid]);
    if (!allResponded) return;

    // All have responded — resolve
    this._resolveRunItOffer();
  }

  /**
   * Resolve the run-it offer.
   * Called when all responses are in, or on timeout.
   * @private
   */
  _resolveRunItOffer() {
    const offer = this._runItOffer;
    if (!offer || offer.resolved) return;
    offer.resolved = true;

    if (offer.timeoutHandle) {
      clearTimeout(offer.timeoutHandle);
      offer.timeoutHandle = null;
    }

    const { fromStreet, activePlayers, proposal, responderIds, responses, proposerId } = offer;

    // If proposer never chose, or chose 'once', or any responder didn't respond → single board
    if (!proposal || proposal === 'once') {
      console.log('[RunIt] No proposal or chose once — single board');
      this.emit('run_it_declined', { reason: 'no_proposal' });
      this._runItOffer = null;
      this._singleBoardRunout(fromStreet);
      return;
    }

    // Check all responders accepted
    const allAccepted = responderIds.every(pid => responses[pid] === 'accept');

    if (!allAccepted) {
      // At least one missing or declined
      const decliners = responderIds.filter(pid => responses[pid] !== 'accept');
      console.log(`[RunIt] Not all agreed (${decliners.length} declined/timeout) — single board`);
      this.emit('run_it_declined', { reason: 'not_all_accepted', declinedBy: decliners });
      this._runItOffer = null;
      this._singleBoardRunout(fromStreet);
      return;
    }

    // Everyone agreed! Run the boards
    const numBoards = proposal === 'thrice' ? 3 : 2;
    console.log(`[RunIt] All ${activePlayers.length} players agreed → Run It ${numBoards === 2 ? 'Twice' : 'Three Times'}`);
    this.emit('run_it_agreed', { numBoards, proposerId, proposal });
    this._runItOffer = null;

    this._runItMultiple(fromStreet, activePlayers, numBoards);
  }

  /**
   * Standard single-board runout (extracted for reuse after declined run-it).
   * Emits equity percentages at each street for all-in display.
   * @private
   */
  _singleBoardRunout(fromStreet) {
    const activePlayers = this.currentHand.players.filter(p => !p.folded);

    // Insurance check
    if (this.config.insurance && activePlayers.length >= 2 && fromStreet !== 'river') {
      this._offerInsurance(fromStreet, activePlayers);
    }

    // fromStreet has ALREADY been dealt by _onRoundComplete → _dealCommunityCards.
    // Only deal the streets AFTER fromStreet.
    const streetIdx = STREETS.indexOf(fromStreet);
    const remainingStreets = STREETS.slice(streetIdx + 1);

    // Emit event for fromStreet (already dealt, just announce it)
    const equity0 = this._computeEquity(activePlayers);
    this.emit('street_start', {
      street: fromStreet,
      communityCards: [...this.currentHand.communityCards],
      potTotal: this.potCalculator.totalPot,
      allIn: true,
      equity: equity0,
    });

    for (const street of remainingStreets) {
      this._dealCommunityCards(street);
      this.phase = street;

      // Compute updated equity after this street
      const equity = this._computeEquity(activePlayers);

      this.emit('street_start', {
        street,
        communityCards: [...this.currentHand.communityCards],
        potTotal: this.potCalculator.totalPot,
        allIn: true,
        equity, // attach equity data
      });
    }
    this._handleShowdown();
  }

  /**
   * Compute equity for all active players and emit an 'all_in_equity' event.
   * Called at the start of an all-in runout before any new cards.
   * @private
   */
  _emitAllInEquity(activePlayers) {
    const equity = this._computeEquity(activePlayers);
    if (equity) {
      this.emit('all_in_equity', equity);
    }
  }

  /**
   * Compute win percentages for all active players given current board.
   * @private
   * @returns {Object|null} { players: [{ id, equity }], boardSize }
   */
  _computeEquity(activePlayers) {
    try {
      const variant = this.config.variant || GAME_VARIANT.HOLDEM;
      const variantStr = {
        [GAME_VARIANT.HOLDEM]: 'holdem',
        [GAME_VARIANT.SHORT_DECK]: 'short_deck',
        [GAME_VARIANT.OMAHA4]: 'omaha4',
        [GAME_VARIANT.OMAHA5]: 'omaha5',
        [GAME_VARIANT.OMAHA6]: 'omaha6',
        [GAME_VARIANT.OMAHA_HILO]: 'omaha4',
      }[variant] || 'holdem';

      const playerData = activePlayers
        .filter(p => p.holeCards && p.holeCards.length > 0)
        .map(p => ({ id: p.id, holeCards: p.holeCards }));

      if (playerData.length < 2) return null;

      // Use fewer iterations for Omaha (more combos per eval)
      const iters = variantStr.startsWith('omaha') ? 1000 : 2000;

      return calculateEquity(
        playerData,
        this.currentHand.communityCards,
        variantStr,
        iters
      );
    } catch (err) {
      console.error('[Equity] Calculation error:', err.message);
      return null;
    }
  }

  /**
   * Run It Multiple — deal N separate boards from the current point,
   * splitting the pot evenly and awarding each portion separately.
   * Supports 2 (RIT) or 3 (RI3) runouts.
   * @private
   * @param {string} fromStreet - Street to start dealing from
   * @param {Array} activePlayers - Players still in the hand
   * @param {number} numBoards - Number of boards to run (2 or 3)
   */
  _runItMultiple(fromStreet, activePlayers, numBoards) {
    const boardBefore = [...this.currentHand.communityCards];
    // fromStreet has ALREADY been dealt by _onRoundComplete → _dealCommunityCards.
    // Only deal streets AFTER fromStreet.
    const streetsRemaining = STREETS.slice(STREETS.indexOf(fromStreet) + 1);

    const isOmaha = [GAME_VARIANT.OMAHA4, GAME_VARIANT.OMAHA5, GAME_VARIANT.OMAHA6, GAME_VARIANT.OMAHA_HILO].includes(this.config.variant);
    const isShortDeck = this.config.variant === GAME_VARIANT.SHORT_DECK;

    // Helper: evaluate a board for all active players
    const evalBoard = (board) => {
      const results = [];
      for (const p of activePlayers) {
        let hand;
        if (isOmaha) {
          hand = evaluateOmaha(p.holeCards, board);
        } else {
          hand = evaluateHoldem(p.holeCards, board, { shortDeck: isShortDeck });
        }
        results.push({ playerId: p.id, hand, score: hand.score });
      }
      results.sort((a, b) => b.score - a.score);
      return results;
    };

    // Helper: deal a fresh board from deck
    const dealBoard = () => {
      const cards = [...boardBefore];
      for (const street of streetsRemaining) {
        switch (street) {
          case 'flop':
            cards.push(...this.deck.dealFlop());
            break;
          case 'turn':
            cards.push(this.deck.dealTurn());
            break;
          case 'river':
            cards.push(this.deck.dealRiver());
            break;
        }
      }
      return cards;
    };

    // Board 1: deal using the standard community card methods
    for (const street of streetsRemaining) {
      this._dealCommunityCards(street);
    }
    const boards = [{ board: [...this.currentHand.communityCards] }];

    // Boards 2..N: deal from remaining deck
    for (let i = 1; i < numBoards; i++) {
      boards.push({ board: dealBoard() });
    }

    this.phase = GAME_PHASE.SHOWDOWN;

    // Evaluate all boards
    const allResults = boards.map(b => {
      b.results = evalBoard(b.board);
      b.winner = b.results[0];
      return b;
    });

    // ── Use PotCalculator for correct side pot distribution per board ──
    const pots = this.potCalculator.calculatePots();
    const totalPot = this.potCalculator.totalPot;

    // Apply rake to total pot
    // "No flop, no drop" — no rake if flop was never dealt
    const flopSeen = this.currentHand.communityCards.length >= 3;
    const rakePercent = this.config.rakePercent || 0;
    const rakeCap = this.config.rakeCap || 0;
    let rake = 0;
    if (rakePercent > 0 && flopSeen) {
      const hasMultiple = pots.some(p => p.eligible.size > 1);
      if (hasMultiple) {
        rake = Math.min(Math.round(totalPot * rakePercent / 100), rakeCap > 0 ? rakeCap : Infinity);
      }
    }

    // Deduct rake from pots (main pot first)
    let rakeRemaining = rake;
    for (const pot of pots) {
      if (rakeRemaining <= 0) break;
      const deduction = Math.min(rakeRemaining, pot.amount);
      pot.amount -= deduction;
      rakeRemaining -= deduction;
    }

    // Distribute each pot across boards, respecting eligibility
    const payouts = {};
    const boardPayouts = allResults.map(() => ({})); // per-board payout map

    for (const pot of pots) {
      if (pot.amount <= 0) continue;

      // Split this pot across N boards
      const basePortion = Math.floor(pot.amount / numBoards);
      let potRemainder = pot.amount - (basePortion * numBoards);

      allResults.forEach((b, boardIdx) => {
        const portion = basePortion + (boardIdx === 0 ? potRemainder : 0);
        if (portion <= 0) return;

        // Find best eligible hand for this pot on this board
        const eligibleResults = b.results.filter(r => pot.eligible.has(r.playerId));
        if (eligibleResults.length === 0) return;

        // Best score among eligible (handle ties)
        const bestScore = eligibleResults[0].score;
        const winners = eligibleResults.filter(r => r.score === bestScore);

        const share = Math.floor(portion / winners.length);
        let shareRemainder = portion - (share * winners.length);

        for (const winner of winners) {
          const award = share + (shareRemainder > 0 ? 1 : 0);
          if (shareRemainder > 0) shareRemainder--;
          payouts[winner.playerId] = (payouts[winner.playerId] || 0) + award;
          boardPayouts[boardIdx][winner.playerId] = (boardPayouts[boardIdx][winner.playerId] || 0) + award;
        }
      });
    }

    // Compute per-board total payouts for reporting
    allResults.forEach((b, i) => {
      b.payout = Object.values(boardPayouts[i]).reduce((s, v) => s + v, 0);
    });

    // Apply payouts to player stacks
    for (const [pid, amount] of Object.entries(payouts)) {
      const player = this.currentHand.players.find(p => String(p.id) === String(pid));
      if (player) player.stack += amount;
    }

    // Store multi-runout results
    const runoutData = {
      numBoards,
      boards: allResults.map((b, i) => {
        // Primary winner = player with highest payout on this board
        const bpEntries = Object.entries(boardPayouts[i]);
        bpEntries.sort((a, b2) => b2[1] - a[1]);
        const boardWinner = bpEntries.length > 0 ? bpEntries[0][0] : (b.results[0]?.playerId || null);
        return {
          boardIndex: i + 1,
          cards: b.board,
          results: b.results,
          winner: boardWinner,
          payout: b.payout,
        };
      }),
      payouts,
      totalPot,
    };

    this.currentHand.runItMultiple = runoutData;

    // Backwards-compatible: also set runItTwice for 2-board runs
    if (numBoards === 2) {
      this.currentHand.runItTwice = {
        board1: allResults[0].board, board2: allResults[1].board,
        results1: allResults[0].results, results2: allResults[1].results,
        winner1: runoutData.boards[0].winner, winner2: runoutData.boards[1].winner,
        payout1: allResults[0].payout, payout2: allResults[1].payout,
      };
    }

    // Set hand result for _finishHand
    this.currentHand.result = {
      winners: Object.entries(payouts).map(([playerId, amount]) => ({
        playerId,
        amount,
        hand: allResults[0].results.find(r => r.playerId === playerId)?.hand ||
          allResults[1].results.find(r => r.playerId === playerId)?.hand,
      })),
      runItMultiple: runoutData,
      potTotal: totalPot,
      rake,
    };

    const eventName = numBoards === 2 ? 'run_it_twice' : 'run_it_thrice';
    this.emit(eventName, runoutData);

    // Also emit generic event for UI
    this.emit('run_it_multiple', runoutData);

    console.log(`🃏 Run It ${numBoards === 2 ? 'Twice' : 'Three Times'}: ${numBoards} boards dealt`);

    // Finish hand normally
    this._finishHand();
  }

  /**
   * ═══════════════════════════════════════════════════════════════
   * INSURANCE SYSTEM
   * ═══════════════════════════════════════════════════════════════
   * When players are all-in, the player who is ahead can buy insurance
   * against their opponent's outs. Insurance pays out if the behind
   * player catches up, reducing variance.
   *
   * Insurance pricing: Based on opponent's equity (outs/remaining cards).
   * Premium = insuranceAmount * (opponentEquity / (1 - opponentEquity))
   * Payout = insuranceAmount if opponent wins
   *
   * The insurance pool is taken from the pot and paid to a virtual house.
   * ═══════════════════════════════════════════════════════════════
   */
  _offerInsurance(fromStreet, activePlayers) {
    const isOmaha = [GAME_VARIANT.OMAHA4, GAME_VARIANT.OMAHA5, GAME_VARIANT.OMAHA6, GAME_VARIANT.OMAHA_HILO].includes(this.config.variant);
    const isShortDeck = this.config.variant === GAME_VARIANT.SHORT_DECK;

    // Evaluate current hand strengths
    const board = [...this.currentHand.communityCards];
    const evaluations = activePlayers.map(p => {
      let hand;
      if (isOmaha) {
        hand = evaluateOmaha(p.holeCards, board);
      } else {
        hand = evaluateHoldem(p.holeCards, board, { shortDeck: isShortDeck });
      }
      return { playerId: p.id, hand, score: hand.score, holeCards: p.holeCards };
    }).sort((a, b) => b.score - a.score);

    // Count remaining cards and approximate outs for trailing player
    const cardsDealt = board.length + activePlayers.reduce((sum, p) => sum + p.holeCards.length, 0);
    const deckSize = isShortDeck ? 36 : 52;
    const remainingCards = deckSize - cardsDealt;
    const streetsLeft = STREETS.slice(STREETS.indexOf(fromStreet)).length;

    // Approximate equity: trailing player has roughly (outs / remaining) per street
    // For simplicity, use a fixed approximation based on street
    const leader = evaluations[0];
    const trailer = evaluations[evaluations.length - 1];

    // Rough out estimation based on hand category gap
    const categoryGap = Math.floor(leader.score / 1e10) - Math.floor(trailer.score / 1e10);
    let estimatedOuts;
    if (categoryGap === 0) estimatedOuts = Math.min(remainingCards - 2, 15); // same category, many outs
    else if (categoryGap === 1) estimatedOuts = Math.min(10, remainingCards - 5);
    else if (categoryGap === 2) estimatedOuts = Math.min(6, remainingCards - 5);
    else estimatedOuts = Math.max(2, Math.min(4, remainingCards - 10));

    // Equity approximation (rule of 2 and 4)
    const trailerEquity = Math.min(0.45, Math.max(0.02,
      (estimatedOuts * (streetsLeft >= 2 ? 4 : 2)) / 100
    ));

    const totalPot = this.potCalculator.totalPot;
    const maxInsurance = Math.floor(totalPot * 0.5); // Can insure up to 50% of pot

    // Insurance premium calculation: fair odds + house edge (10%)
    const fairPremiumRate = trailerEquity / (1 - trailerEquity);
    const premiumRate = fairPremiumRate * 1.10; // 10% house edge

    // Emit insurance offer for the leading player
    this.emit('insurance_offered', {
      leaderId: leader.playerId,
      trailerId: trailer.playerId,
      leaderHand: leader.hand,
      trailerHand: trailer.hand,
      trailerEquity: Math.round(trailerEquity * 100),
      maxInsurance,
      premiumRate: Math.round(premiumRate * 100) / 100,
      estimatedOuts,
      streetsLeft,
      totalPot,
    });

    // Store insurance data for when player responds
    this.currentHand.insuranceOffer = {
      leaderId: leader.playerId,
      trailerId: trailer.playerId,
      trailerEquity,
      maxInsurance,
      premiumRate,
      totalPot,
    };
  }

  /**
   * Process insurance purchase. Called when leading player accepts insurance.
   * @param {string} playerId - Player buying insurance
   * @param {number} amount - Insurance amount (what they want to protect)
   */
  processInsurance(playerId, amount) {
    const offer = this.currentHand?.insuranceOffer;
    if (!offer || offer.leaderId !== playerId) {
      this.emit('error', { message: 'No insurance offer available' });
      return;
    }

    const clampedAmount = Math.max(0, Math.min(amount, offer.maxInsurance));
    if (clampedAmount <= 0) {
      // Declined insurance
      this.currentHand.insurance = { declined: true };
      this.emit('insurance_declined', { playerId });
      return;
    }

    const premium = Math.ceil(clampedAmount * offer.premiumRate);

    // Deduct premium from the leader's stack NOW
    const buyer = this.currentHand.players.find(p => p.id === playerId);
    if (!buyer || buyer.stack < premium) {
      this.currentHand.insurance = { declined: true };
      this.emit('insurance_declined', { playerId, reason: 'Insufficient stack for premium' });
      return;
    }
    buyer.stack -= premium;

    this.currentHand.insurance = {
      buyerId: playerId,
      amount: clampedAmount,
      premium,
      trailerEquity: offer.trailerEquity,
      trailerId: offer.trailerId,
      accepted: true,
    };

    this.emit('insurance_purchased', {
      buyerId: playerId,
      amount: clampedAmount,
      premium,
      trailerEquity: Math.round(offer.trailerEquity * 100),
      // Premium goes to union treasury (or club if standalone)
      houseRevenue: premium,
    });

    console.log(`🛡️ Insurance purchased: ${clampedAmount} coverage for ${premium} premium`);
  }

  /**
   * Settle insurance after showdown. Called from _handlePayout.
   * @private
   */
  _settleInsurance(showdownResult) {
    const ins = this.currentHand?.insurance;
    if (!ins || !ins.accepted) return null;

    // Check if the trailer won (insurance should pay out)
    const trailerWon = showdownResult?.winners?.some(w => w.playerId === ins.trailerId);

    if (trailerWon) {
      // Insurance pays out: buyer gets their insured amount.
      // Funds come from the UNION treasury (or club if standalone).
      // The trailer keeps their full winnings — insurance is a house product.
      const payout = ins.amount;
      const buyer = this.currentHand.players.find(p => p.id === ins.buyerId);
      if (buyer) buyer.stack += payout;
      // NOTE: Trailer stack is NOT touched — they keep full pot winnings.
      // The union/club absorbs the payout as an insurance expense.

      this.emit('insurance_payout', {
        buyerId: ins.buyerId,
        payout,
        premium: ins.premium,
        netGain: payout - ins.premium,
        reason: 'Trailer won — union/club pays insurance claim',
      });

      return { buyerId: ins.buyerId, payout, premium: ins.premium, source: 'house' };
    } else {
      // Leader won — insurance not needed. Premium already deducted from
      // buyer's stack and recorded as union/club insurance revenue.
      this.emit('insurance_expired', {
        buyerId: ins.buyerId,
        premiumLost: ins.premium,
        reason: 'Leader won — no payout',
      });

      console.log(`🛡️ Insurance expired: ${ins.buyerId} loses ${ins.premium} premium`);
      return { buyerId: ins.buyerId, payout: 0, premiumLost: ins.premium };
    }
  }

  /**
   * Get the next street after the current phase.
   * @private
   */
  _getNextStreet() {
    const idx = STREETS.indexOf(this.phase);
    if (idx === -1 || idx >= STREETS.length - 1) return null;
    return STREETS[idx + 1];
  }

  // ============ PRIVATE: SHOWDOWN ============

  /**
   * Handle showdown - evaluate all hands and determine winners.
   * @private
   */
  _handleShowdown() {
    this.phase = GAME_PHASE.SHOWDOWN;

    const activePlayers = this.currentHand.players.filter(p => !p.folded);
    const isOmaha = [GAME_VARIANT.OMAHA4, GAME_VARIANT.OMAHA5, GAME_VARIANT.OMAHA6, GAME_VARIANT.OMAHA_HILO].includes(this.config.variant);
    const isShortDeck = this.config.variant === GAME_VARIANT.SHORT_DECK;
    const isHiLo = this.config.variant === GAME_VARIANT.OMAHA_HILO;
    const numBoards = this.config.numBoards || 1;

    // Helper: evaluate a board
    const evalBoard = (board) => {
      if (isOmaha) {
        return omahaShowdown(
          activePlayers.map(p => ({ playerId: p.id, holeCards: p.holeCards })),
          board, { shortDeck: isShortDeck, hiLo: isHiLo }
        );
      }
      return holdemShowdown(
        activePlayers.map(p => ({ playerId: p.id, holeCards: p.holeCards })),
        board, { shortDeck: isShortDeck }
      );
    };

    // ── MULTI-BOARD SHOWDOWN ──────────────────────────────────
    if (numBoards > 1 && this.currentHand.boards?.length > 1) {
      const boardResults = [];
      const allWinnerIds = new Set();

      for (let b = 0; b < numBoards; b++) {
        const board = this.currentHand.boards[b];
        if (!board || board.length < 5) continue;
        const result = evalBoard(board);
        const winners = result.hiWinners || result.winners || [];
        winners.forEach(w => allWinnerIds.add(String(w.playerId)));
        boardResults.push({ boardIndex: b, board, result, winners });
      }

      // Mark cards shown
      for (const player of activePlayers) {
        player.showCards = this.config.autoMuck ? allWinnerIds.has(String(player.id)) : true;
      }

      // ── Side-pot-aware distribution across boards ──
      const pots = this.potCalculator.calculatePots();
      const totalPot = this.potCalculator.totalPot;

      // Calculate rake on full pot ("no flop, no drop")
      const flopSeen = this.currentHand.communityCards.length >= 3;
      const rakeAmount = flopSeen ? Math.min(
        Math.round(totalPot * (this.config.rakePercent || 0) / 100),
        this.config.rakeCap || Infinity
      ) : 0;

      // Deduct rake from pots (main pot first)
      let rakeLeft = rakeAmount;
      for (const pot of pots) {
        if (rakeLeft <= 0) break;
        const deduct = Math.min(rakeLeft, pot.amount);
        pot.amount -= deduct;
        rakeLeft -= deduct;
      }

      const payouts = {};
      const boardWinners = [];

      for (const pot of pots) {
        if (pot.amount <= 0) continue;

        const basePortion = Math.floor(pot.amount / boardResults.length);
        let potRemainder = pot.amount - (basePortion * boardResults.length);

        boardResults.forEach((br, i) => {
          const portion = basePortion + (i === 0 ? potRemainder : 0);
          if (portion <= 0) return;

          // Find the best hand(s) AMONG eligible players for this pot
          // (not just the overall board winners — they may not be eligible for side pots)
          const allRankings = br.result.hiRankings || br.result.rankings || [];
          const eligibleRankings = allRankings.filter(r => pot.eligible.has(r.playerId));

          if (eligibleRankings.length === 0) return;

          // Best score among eligible players (rankings are already sorted desc)
          const bestScore = eligibleRankings[0].hand.score;
          const eligibleWinners = eligibleRankings.filter(r => r.hand.score === bestScore);

          const perWinner = Math.floor(portion / eligibleWinners.length);
          let shareRemainder = portion - (perWinner * eligibleWinners.length);

          for (const w of eligibleWinners) {
            const award = perWinner + (shareRemainder > 0 ? 1 : 0);
            if (shareRemainder > 0) shareRemainder--;
            payouts[w.playerId] = (payouts[w.playerId] || 0) + award;
          }
        });
      }

      boardResults.forEach((br, i) => {
        boardWinners.push({
          boardIndex: br.boardIndex,
          board: br.board,
          winners: br.winners.map(w => w.playerId),
          portion: Object.values(payouts).reduce((s, v) => s + v, 0) / boardResults.length,
        });
      });

      // Apply payouts
      const winnerDetails = [];
      for (const [pid, amount] of Object.entries(payouts)) {
        const player = this.currentHand.players.find(p => String(p.id) === String(pid));
        if (player) {
          player.stack += amount;
          winnerDetails.push({ playerId: pid, amount });
        }
      }

      this.emit('showdown', {
        multiBoard: true,
        numBoards,
        boardResults: boardWinners,
        players: activePlayers.map(p => ({ id: p.id, holeCards: p.holeCards })),
        winners: [...allWinnerIds],
      });

      this.currentHand.result = {
        type: 'multi_board_showdown',
        winners: winnerDetails,
        boards: boardWinners,
        rake: rakeAmount,
      };

      this.emit('hand_complete', this.currentHand.result);
      return;
    }

    // ── STANDARD SINGLE-BOARD SHOWDOWN ────────────────────────
    const board = this.currentHand.communityCards;
    let showdownResult = evalBoard(board);

    // Mark cards as shown based on auto-muck setting
    const winnerIds = new Set(
      (showdownResult.hiWinners || showdownResult.winners || []).map(w => String(w.playerId))
    );
    for (const player of activePlayers) {
      if (this.config.autoMuck) {
        player.showCards = winnerIds.has(String(player.id));
      } else {
        player.showCards = true;
      }
    }

    // ── BBJ DETECTION ───────────────────────────────────────
    const bbjResult = this._checkBBJ(activePlayers, showdownResult, board);
    if (bbjResult) {
      this.emit('bbj_triggered', bbjResult);
    }

    this.emit('showdown', {
      players: activePlayers.map(p => ({
        id: p.id,
        holeCards: p.holeCards,
        hand: showdownResult.hiRankings
          ? showdownResult.hiRankings.find(r => r.playerId === p.id)?.hand
          : showdownResult.rankings.find(r => r.playerId === p.id)?.hand,
      })),
      communityCards: board,
      winners: (showdownResult.hiWinners || showdownResult.winners).map(w => w.playerId),
      bbj: bbjResult || null,
    });

    // Distribute pots
    this._handlePayout(showdownResult);
  }

  /**
   * Handle fold win - award pot without showdown.
   * @private
   */
  _handleFoldWin(winner) {
    this.phase = GAME_PHASE.PAYOUT;

    // "No flop, no drop" — standard poker rule: no rake if hand ends before flop
    // NOTE: this.phase is already PAYOUT here, so only communityCards is reliable
    const flopSeen = this.currentHand.communityCards.length >= 3;
    const { payouts, rake } = this.potCalculator.awardToLastPlayer(winner.id, {
      rakePercent: this.config.rakePercent,
      rakeCap: this.config.rakeCap,
      flopSeen,
    });

    // Update player stacks
    for (const [playerId, amount] of payouts) {
      const player = this.currentHand.players.find(p => String(p.id) === String(playerId));
      if (player) player.stack += amount;
    }

    // Rabbit hunt: peek at remaining board cards
    const boardSize = this.currentHand.communityCards.length;
    const rabbitCards = this.deck.peekRabbitCards(boardSize);

    this.currentHand.result = {
      type: 'fold',
      winners: [{ playerId: winner.id, amount: payouts.get(winner.id) }],
      rake,
      rabbitCards: rabbitCards.length > 0 ? rabbitCards : null,
      boardAtEnd: [...this.currentHand.communityCards],
    };

    this.emit('payout', {
      type: 'fold',
      winners: [{ playerId: winner.id, amount: payouts.get(winner.id) }],
      rake,
    });

    this._finishHand();
  }

  /**
   * Handle pot distribution at showdown.
   * @private
   */
  _handlePayout(showdownResult) {
    this.phase = GAME_PHASE.PAYOUT;

    // Build player hand scores for pot distribution
    const playerHands = [];
    const rankings = showdownResult.hiRankings || showdownResult.rankings;

    for (const ranking of rankings) {
      playerHands.push({
        playerId: ranking.playerId,
        handScore: ranking.hand.score,
      });
    }

    // Build low hands if Hi-Lo
    let lowHands = [];
    if (showdownResult.loRankings) {
      lowHands = showdownResult.loRankings.map(r => ({
        playerId: r.playerId,
        lowScore: r.hand.score,
      }));
    }

    const { payouts, pots, rake } = this.potCalculator.distribute(playerHands, {
      rakePercent: this.config.rakePercent,
      rakeCap: this.config.rakeCap,
      hiLo: this.config.variant === GAME_VARIANT.OMAHA_HILO,
      lowHands,
    });

    // Update player stacks
    const winnerDetails = [];
    for (const [playerId, amount] of payouts) {
      const player = this.currentHand.players.find(p => String(p.id) === String(playerId));
      if (player) {
        player.stack += amount;
        winnerDetails.push({
          playerId,
          amount,
          hand: rankings.find(r => r.playerId === playerId)?.hand?.description,
        });
      }
    }

    // ── INSURANCE SETTLEMENT ────────────────────────────────
    const insuranceResult = this._settleInsurance(showdownResult);

    this.currentHand.result = {
      type: 'showdown',
      winners: winnerDetails,
      pots,
      rake,
      insurance: insuranceResult || null,
    };

    this.emit('payout', {
      type: 'showdown',
      winners: winnerDetails,
      pots,
      rake,
    });

    this._finishHand();
  }

  /**
   * Finish the hand and prepare for the next one.
   * @private
   */
  _finishHand() {
    this.phase = GAME_PHASE.IDLE;

    this.emit('hand_complete', {
      handNumber: this.handNumber,
      handId: this.currentHand.handId,
      result: this.currentHand.result,
      rake: this.currentHand.result?.rake || 0,
      potTotal: this.potCalculator.totalPot,
      rabbitCards: this.currentHand.result?.rabbitCards || null,
      boardAtEnd: this.currentHand.result?.boardAtEnd || this.currentHand.communityCards,
      players: this.currentHand.players.map(p => ({
        id: p.id,
        stack: p.stack,
        seatIndex: p.seatIndex,
        invested: this.potCalculator.getInvestment(p.id),
      })),
    });
  }

  // ============ PRIVATE: POSITION MANAGEMENT ============

  /**
   * Check if a showdown qualifies for Bad Beat Jackpot.
   * 
   * BBJ Rules (from RakeConfig):
   *   - Pot must be ≥ 10BB
   *   - 4+ players must have been dealt in preflop
   *   - Not available for Double/Triple Board games
   *   - If run it multiple times, only first runout counts
   * 
   * Qualifying hands:
   *   NLH/FLH: AAAJJ+ must LOSE to Quads or Straight Flush
   *            Loser must have at least one Ace in hole cards
   *   PLO4/FLO4: KKKK+ (Four Kings) must LOSE
   *   PLO5/FLO5: 8-high Straight Flush must LOSE
   * 
   * @returns {Object|null} BBJ result or null if not qualified
   */
  _checkBBJ(activePlayers, showdownResult, board) {
    // Only check if BBJ is enabled for this table
    if (!this.config.bbjEnabled) return null;

    const totalDealt = this.currentHand.players.length;
    const bb = this.config.bigBlind || 2;
    const potTotal = this.potCalculator.totalPot;

    // Must have 4+ players dealt and pot ≥ 10BB
    if (totalDealt < 4) return null;
    if (potTotal < bb * 10) return null;

    // Must have 2+ active players at showdown
    if (activePlayers.length < 2) return null;

    const rankings = showdownResult.hiRankings || showdownResult.rankings;
    if (!rankings || rankings.length < 2) return null;

    // Rankings are sorted best→worst. Winner = [0], Loser = [1]
    const winner = rankings[0];
    const loser = rankings[1];
    if (!winner?.hand || !loser?.hand) return null;

    const variant = this.config.variant || 'holdem';
    const isOmaha = [GAME_VARIANT.OMAHA4, GAME_VARIANT.OMAHA5, GAME_VARIANT.OMAHA6].includes(variant);

    // ── NLH / FLH: Loser needs AAAJJ+, beaten by Quads or SF ──
    if (variant === GAME_VARIANT.HOLDEM || variant === GAME_VARIANT.SHORT_DECK || variant === GAME_VARIANT.PINEAPPLE) {
      const loserCat = loser.hand.category;
      const winnerCat = winner.hand.category;

      // Winner must have Quads (8) or Straight Flush (9)
      if (winnerCat < 8) return null;

      // Loser must have Full House (7) or better
      if (loserCat < 7) return null;

      // If loser has Full House, must be Aces full of Jacks or better
      // Full House tiebreaker = trips_rank * 13 + pair_rank
      // Aces (rank 12) full of Jacks (rank 9) = 12*13 + 9 = 165
      if (loserCat === 7) {
        const loserTiebreaker = loser.hand.score % 1e10;
        const tripsRank = Math.floor(loserTiebreaker / 13);
        const pairRank = loserTiebreaker % 13;
        // Must be Aces (12) as trips, Jacks (9) or better as pair
        if (tripsRank !== 12 || pairRank < 9) return null;
      }
      // If loser has Quads (8) or SF (9), they auto-qualify (beaten by better quads/SF)

      // Loser must have at least one Ace in their hole cards
      const loserPlayer = activePlayers.find(p => String(p.id) === String(loser.playerId));
      if (!loserPlayer?.holeCards) return null;
      const { getRank } = require('./Deck');
      const hasAceInHole = loserPlayer.holeCards.some(c => getRank(c) === 12); // 12 = Ace
      if (!hasAceInHole) return null;

      // BBJ QUALIFIED!
      return this._buildBBJResult(winner, loser, activePlayers, rankings, board, 'nlh');
    }

    // ── PLO4 / FLO4: Loser needs KKKK+ (Four Kings or better) ──
    if (variant === GAME_VARIANT.OMAHA4) {
      const loserCat = loser.hand.category;
      if (loserCat < 8) return null; // Must have at least Quads

      if (loserCat === 8) {
        // Four of a Kind — check if Kings (rank 11) or Aces (rank 12)
        const loserTiebreaker = loser.hand.score % 1e10;
        const quadsRank = Math.floor(loserTiebreaker / 13);
        if (quadsRank < 11) return null; // Must be Kings (11) or Aces (12)
      }
      // If SF (9), they auto-qualify

      return this._buildBBJResult(winner, loser, activePlayers, rankings, board, 'plo4');
    }

    // ── PLO5 / PLO6 / FLO5: Loser needs 8-high Straight Flush or better ──
    if ([GAME_VARIANT.OMAHA5, GAME_VARIANT.OMAHA6].includes(variant)) {
      const loserCat = loser.hand.category;
      if (loserCat < 9) return null; // Must be Straight Flush

      // Straight Flush tiebreaker = high card rank. 8-high = rank 6 (0=2,1=3,...6=8)
      const loserTiebreaker = loser.hand.score % 1e10;
      if (loserTiebreaker < 6) return null; // Must be 8-high (6) or better

      return this._buildBBJResult(winner, loser, activePlayers, rankings, board, 'plo5');
    }

    return null; // No BBJ for other variants (Hi/Lo, OFC, etc.)
  }

  /**
   * Build the BBJ result object.
   * @private
   */
  _buildBBJResult(winner, loser, activePlayers, rankings, board, qualifyingVariant) {
    // Table share = all active players at showdown except winner/loser
    const tableSharePlayerIds = activePlayers
      .filter(p => String(p.id) !== String(winner.playerId) && String(p.id) !== String(loser.playerId))
      .map(p => p.id);

    // All players dealt into this hand (for BBJ eligibility)
    const allDealtPlayerIds = this.currentHand.players.map(p => p.id);

    return {
      triggered: true,
      variant: qualifyingVariant,
      loserId: loser.playerId,
      loserHand: loser.hand.description,
      loserCards: activePlayers.find(p => String(p.id) === String(loser.playerId))?.holeCards || [],
      winnerId: winner.playerId,
      winnerHand: winner.hand.description,
      winnerCards: activePlayers.find(p => String(p.id) === String(winner.playerId))?.holeCards || [],
      communityCards: board,
      tableSharePlayerIds,
      allDealtPlayerIds,
      potTotal: this.potCalculator.totalPot,
      handNumber: this.handNumber,
    };
  }

  /**
   * Rotate the button to the next player.
   * @private
   */
  _rotateButton(players) {
    if (this.buttonSeat === -1) {
      // First hand - random button
      return players[0].seatIndex;
    }

    // Find next player clockwise from current button
    const seats = players.map(p => p.seatIndex).sort((a, b) => a - b);
    const currentIdx = seats.indexOf(this.buttonSeat);

    if (currentIdx === -1) {
      // Button player left - find next clockwise seat
      for (const seat of seats) {
        if (seat > this.buttonSeat) return seat;
      }
      return seats[0]; // Wrap around
    }

    return seats[(currentIdx + 1) % seats.length];
  }

  /**
   * Assign position labels to players based on button location.
   * @private
   */
  _assignPositions(players) {
    const n = players.length;
    const buttonIdx = players.findIndex(p => p.seatIndex === this.buttonSeat);

    if (n === 2) {
      // Heads-up: Button is SB, other is BB
      return players.map((p, i) => {
        if (i === buttonIdx) return 'btn'; // Button/SB in HU
        return 'bb';
      });
    }

    const positions = new Array(n).fill('mp');

    // Button
    positions[buttonIdx] = 'btn';

    // Small-Blind (next after button)
    const sbIdx = (buttonIdx + 1) % n;
    positions[sbIdx] = 'sb';

    // Big-Blind (next after SB)
    const bbIdx = (sbIdx + 1) % n;
    positions[bbIdx] = 'bb';

    // UTG (next after BB)
    // In 3-handed, the button player IS UTG for straddle purposes.
    // We always assign UTG for n >= 3 so straddle logic can find them by label.
    if (n >= 3) {
      const utgIdx = (bbIdx + 1) % n;
      // Only set UTG if it isn't already the button (shouldn't happen, but guard it)
      if (positions[utgIdx] === 'mp' || n === 3) positions[utgIdx] = 'utg';
    }

    // CO (before button)
    if (n > 4) {
      const coIdx = (buttonIdx - 1 + n) % n;
      if (positions[coIdx] === 'mp') positions[coIdx] = 'co';
    }

    // HJ (before CO)
    if (n > 5) {
      const coIdx = (buttonIdx - 1 + n) % n;
      const hjIdx = (coIdx - 1 + n) % n;
      if (positions[hjIdx] === 'mp') positions[hjIdx] = 'hj';
    }

    // LJ (before HJ)
    if (n > 6) {
      const coIdx = (buttonIdx - 1 + n) % n;
      const hjIdx = (coIdx - 1 + n) % n;
      const ljIdx = (hjIdx - 1 + n) % n;
      if (positions[ljIdx] === 'mp') positions[ljIdx] = 'lj';
    }

    // UTG+1, UTG+2, etc.
    if (n > 7) {
      const bbIdx2 = (buttonIdx + 3) % n;
      let utgPlus = 1;
      for (let i = 1; i < n - 6; i++) {
        const idx = (bbIdx2 + i) % n;
        if (positions[idx] === 'mp') {
          positions[idx] = `utg+${utgPlus}`;
          utgPlus++;
        }
      }
    }

    return positions;
  }

  /**
   * Get preflop action order (UTG first, BB last).
   * @private
   */
  _getPreflopOrder() {
    const players = this.currentHand.players.filter(p => !p.folded);

    // If straddle is active, action starts from player AFTER straddler (UTG+1)
    // and straddler acts last (like BB normally would).
    if (this.currentHand.straddleActive && this.currentHand.blinds.straddle) {
      const straddlerIdx = players.findIndex(p => p.id === this.currentHand.blinds.straddle.playerId);
      if (straddlerIdx !== -1) {
        const ordered = [];
        for (let i = 1; i <= players.length; i++) {
          const idx = (straddlerIdx + i) % players.length;
          ordered.push(players[idx]);
        }
        return ordered;
      }
    }

    const bbIdx = players.findIndex(p => p.position === 'bb');

    if (bbIdx === -1) return players;

    // Start from after BB, wrap around to BB
    const ordered = [];
    for (let i = 1; i <= players.length; i++) {
      const idx = (bbIdx + i) % players.length;
      ordered.push(players[idx]);
    }

    return ordered;
  }

  /**
   * Get postflop action order (first after button, button last).
   * @private
   */
  _getPostflopOrder() {
    const players = this.currentHand.players.filter(p => !p.folded);
    const btnIdx = players.findIndex(p => p.position === 'btn');

    if (btnIdx === -1) return players;

    // Start from after button, wrap around to button
    const ordered = [];
    for (let i = 1; i <= players.length; i++) {
      const idx = (btnIdx + i) % players.length;
      ordered.push(players[idx]);
    }

    return ordered;
  }

  // ============ PUBLIC: STATE ACCESS ============

  /**
   * Get the full game state for serialization/broadcasting.
   * @param {string|number} [forPlayerId] - If provided, include that player's hole cards
   * @returns {Object}
   */
  getState(forPlayerId) {
    if (!this.currentHand) {
      return {
        phase: this.phase,
        handNumber: this.handNumber,
        buttonSeat: this.buttonSeat,
      };
    }

    return {
      phase: this.phase,
      handNumber: this.handNumber,
      handId: this.currentHand.handId,
      buttonSeat: this.buttonSeat,
      communityCards: [...this.currentHand.communityCards],
      boards: this.config.numBoards > 1 ? this.currentHand.boards.map(b => [...b]) : undefined,
      potTotal: this.potCalculator.totalPot,
      pots: this.potCalculator.calculatePots().map(p => p.toJSON()),
      currentBet: this.bettingRound?.currentBet || 0,
      currentPlayerId: this.bettingRound?.getCurrentPlayer()?.id || null,
      players: this.currentHand.players.map(p => ({
        id: p.id,
        seatIndex: p.seatIndex,
        stack: p.stack,
        position: p.position,
        folded: p.folded,
        allIn: p.allIn,
        invested: this.potCalculator.getInvestment(p.id),
        // Only show hole cards to the requesting player (or at showdown)
        holeCards: (String(p.id) === String(forPlayerId) || p.showCards) ? p.holeCards : null,
        showCards: p.showCards,
      })),
      result: this.currentHand.result,
    };
  }

  /**
   * Get a player's private state (their hole cards).
   * @param {string|number} playerId
   * @returns {number[]|null}
   */
  getPlayerCards(playerId) {
    if (!this.currentHand) return null;
    const player = this.currentHand.players.find(p => String(p.id) === String(playerId));
    return player?.holeCards || null;
  }

  /**
   * Allow a player to voluntarily show their cards (e.g. after winning without showdown).
   * Only valid during PAYOUT or SHOWDOWN phase, or right after hand_complete.
   * @param {string|number} playerId
   * @returns {{ success: boolean, error?: string }}
   */
  voluntaryShowCards(playerId) {
    if (!this.currentHand) return { success: false, error: 'No active hand' };
    const player = this.currentHand.players.find(p => String(p.id) === String(playerId));
    if (!player) return { success: false, error: 'Player not in hand' };
    if (!player.holeCards || player.holeCards.length === 0) return { success: false, error: 'No cards to show' };
    if (player.showCards) return { success: true }; // already showing

    player.showCards = true;
    this.emit('cards_shown', {
      playerId,
      holeCards: player.holeCards,
    });
    return { success: true };
  }

  /**
   * Get legal actions for the current player.
   * @returns {{ playerId: string|number, actions: Array }|null}
   */
  getCurrentActions() {
    if (!this.bettingRound) return null;
    const player = this.bettingRound.getCurrentPlayer();
    if (!player) return null;

    return {
      playerId: player.id,
      actions: this.bettingRound.getLegalActions(),
      presets: this.actionValidator.getBetPresets({
        playerStack: player.stack,
        playerInvested: player.invested,
        currentBet: this.bettingRound.currentBet,
        lastRaiseSize: this.bettingRound.lastRaiseSize,
        potTotal: this.potCalculator.totalPot,
        street: this.phase,
      }),
    };
  }

  /**
   * Get complete hand history for recording.
   * @returns {Object}
   */
  getHandHistory() {
    if (!this.currentHand) return null;

    return {
      handNumber: this.handNumber,
      variant: this.config.variant,
      bettingStructure: this.config.bettingStructure,
      stakes: `${this.config.smallBlind}/${this.config.bigBlind}`,
      ante: this.config.ante,
      buttonSeat: this.buttonSeat,
      players: this.currentHand.players.map(p => ({
        id: p.id,
        seatIndex: p.seatIndex,
        position: p.position,
        holeCards: p.holeCards,
        startingStack: p.stack + this.potCalculator.getInvestment(p.id) - (this.currentHand.result?.winners?.find(w => w.playerId === p.id)?.amount || 0),
        endingStack: p.stack,
      })),
      communityCards: this.currentHand.communityCards,
      actions: this.currentHand.actions,
      result: this.currentHand.result,
      potTotal: this.potCalculator.totalPot,
    };
  }
}

// ============ EXPORTS ============

module.exports = {
  GAME_PHASE,
  GAME_VARIANT,
  STREETS,
  GameStateMachine,
};
