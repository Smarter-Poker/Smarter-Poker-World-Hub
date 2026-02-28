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

// ============ CONSTANTS ============

const GAME_PHASE = {
  IDLE: 'idle',
  POST_BLINDS: 'post_blinds',
  DEAL: 'deal',
  PREFLOP: 'preflop',
  FLOP: 'flop',
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
   * @param {number} [config.ante] - Per-player ante
   * @param {number} [config.rakePercent] - Rake percentage
   * @param {number} [config.rakeCap] - Maximum rake per pot
   * @param {boolean} [config.runItTwice] - Allow run-it-twice
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
      rakePercent: config.rakePercent || 0,
      rakeCap: config.rakeCap || Infinity,
      runItTwice: config.runItTwice || false,
      bombPot: config.bombPot || false,
      straddle: config.straddle || false,
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
  startHand(players, buttonSeat) {
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
    
    // Initialize hand state
    this.currentHand = {
      handNumber: this.handNumber,
      players: playersWithChips.map((p, i) => ({
        ...p,
        position: positions[i],
        holeCards: [],
        folded: false,
        allIn: false,
        showCards: false,
      })),
      communityCards: [],
      pot: 0,
      buttonSeat: this.buttonSeat,
      blinds: { sb: null, bb: null },
      actions: [],
      result: null,
    };
    
    // Reset components
    this.deck.reset();
    this.potCalculator.reset();
    
    this.phase = GAME_PHASE.POST_BLINDS;
    
    this.emit('hand_start', {
      handNumber: this.handNumber,
      players: this.currentHand.players.map(p => ({ id: p.id, stack: p.stack, seatIndex: p.seatIndex, position: p.position })),
      buttonSeat: this.buttonSeat,
    });
    
    // Post blinds
    this._postBlinds();
    
    // Deal cards
    this._dealHoleCards();
    
    // Start preflop betting
    this._startBettingRound('preflop');
    
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
      if (result.action.type === ACTION_TYPES.ALL_IN) {
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

  // ============ PRIVATE: BLIND POSTING ============

  /**
   * Post small blind, big blind, and antes.
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
    
    // Post antes first
    if (ante > 0) {
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
    
    // Post small blind
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
    
    // Post big blind
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
    
    this.emit('blinds_posted', {
      smallBlind: this.currentHand.blinds.sb,
      bigBlind: this.currentHand.blinds.bb,
      ante: ante > 0 ? ante : null,
      potTotal: this.potCalculator.totalPot,
    });
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
      if (sb) blinds.push({ playerId: sb.playerId, amount: sb.amount });
      if (bb) blinds.push({ playerId: bb.playerId, amount: bb.amount });
    }
    
    this.bettingRound = new BettingRound({
      players: orderedPlayers.map(p => ({
        id: p.id,
        stack: p.stack,
        position: p.position,
      })),
      street,
      validator: this.actionValidator,
    });
    
    this.bettingRound.start({
      potFromPreviousRounds: this.potCalculator.totalPot - (blinds ? blinds.reduce((s, b) => s + b.amount, 0) : 0),
      blinds: street === 'preflop' ? blinds : undefined,
    });
    
    this.emit('street_start', {
      street,
      communityCards: this.currentHand.communityCards.map(c => c),
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
    switch (street) {
      case 'flop':
        const flop = this.deck.dealFlop();
        this.currentHand.communityCards.push(...flop);
        break;
      case 'turn':
        const turn = this.deck.dealTurn();
        this.currentHand.communityCards.push(turn);
        break;
      case 'river':
        const river = this.deck.dealRiver();
        this.currentHand.communityCards.push(river);
        break;
    }
  }

  /**
   * Run out remaining community cards when all players are all-in.
   * @private
   */
  _runOutBoard(fromStreet) {
    const streets = STREETS.slice(STREETS.indexOf(fromStreet));
    
    for (const street of streets) {
      this._dealCommunityCards(street);
      this.phase = street;
      
      this.emit('street_start', {
        street,
        communityCards: [...this.currentHand.communityCards],
        potTotal: this.potCalculator.totalPot,
        allIn: true,
      });
    }
    
    // Go to showdown
    this._handleShowdown();
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
    const board = this.currentHand.communityCards;
    const isOmaha = [GAME_VARIANT.OMAHA4, GAME_VARIANT.OMAHA5, GAME_VARIANT.OMAHA6, GAME_VARIANT.OMAHA_HILO].includes(this.config.variant);
    const isShortDeck = this.config.variant === GAME_VARIANT.SHORT_DECK;
    const isHiLo = this.config.variant === GAME_VARIANT.OMAHA_HILO;
    
    let showdownResult;
    
    if (isOmaha) {
      showdownResult = omahaShowdown(
        activePlayers.map(p => ({ playerId: p.id, holeCards: p.holeCards })),
        board,
        { shortDeck: isShortDeck, hiLo: isHiLo }
      );
    } else {
      showdownResult = holdemShowdown(
        activePlayers.map(p => ({ playerId: p.id, holeCards: p.holeCards })),
        board,
        { shortDeck: isShortDeck }
      );
    }
    
    // Mark cards as shown
    for (const player of activePlayers) {
      player.showCards = true;
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
    
    const { payouts, rake } = this.potCalculator.awardToLastPlayer(winner.id, {
      rakePercent: this.config.rakePercent,
      rakeCap: this.config.rakeCap,
    });
    
    // Update player stacks
    for (const [playerId, amount] of payouts) {
      const player = this.currentHand.players.find(p => String(p.id) === String(playerId));
      if (player) player.stack += amount;
    }
    
    this.currentHand.result = {
      type: 'fold',
      winners: [{ playerId: winner.id, amount: payouts.get(winner.id) }],
      rake,
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
    
    this.currentHand.result = {
      type: 'showdown',
      winners: winnerDetails,
      pots,
      rake,
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
      result: this.currentHand.result,
      rake: this.currentHand.result?.rake || 0,
      potTotal: this.potCalculator.totalPot,
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
    
    // Small Blind (next after button)
    const sbIdx = (buttonIdx + 1) % n;
    positions[sbIdx] = 'sb';
    
    // Big Blind (next after SB)
    const bbIdx = (sbIdx + 1) % n;
    positions[bbIdx] = 'bb';
    
    // UTG (next after BB)
    if (n > 3) {
      const utgIdx = (bbIdx + 1) % n;
      positions[utgIdx] = 'utg';
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
      buttonSeat: this.buttonSeat,
      communityCards: [...this.currentHand.communityCards],
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
