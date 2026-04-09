/**
 * Poker Brain - Hand State Machine
 * =================================
 * Takes raw debounced card detections and turns them into structured hand state:
 *   - Which street we are on (waiting | preflop | flop | turn | river | showdown)
 *   - When a new hand starts (hole cards appear after being absent)
 *   - When a street transitions (board card count changes stably)
 *   - A running hand record we can log to storage when the hand ends
 *
 * All transitions are debounced at the STATE level on top of the matcher's
 * frame-level debouncing, so noisy single-frame blips cannot fire a false
 * street change or a false new-hand event.
 *
 * Pure JS. No React dependency - designed to be called from any loop.
 */

export const STREETS = {
  WAITING: 'waiting',   // No hole cards visible (between hands or observing)
  PREFLOP: 'preflop',   // 2 hole cards, 0 board cards
  FLOP: 'flop',         // 2 hole cards, 3 board cards
  TURN: 'turn',         // 2 hole cards, 4 board cards
  RIVER: 'river',       // 2 hole cards, 5 board cards
  SHOWDOWN: 'showdown', // River seen and hand is over (hole disappeared mid-showdown)
};

/**
 * Derive the street from the current detection snapshot.
 * Does NOT account for debouncing - that happens in the state machine.
 */
export function deriveStreet(holeCards, boardCards) {
  const h = holeCards ? holeCards.length : 0;
  const b = boardCards ? boardCards.length : 0;

  if (h < 2) return STREETS.WAITING;
  if (b === 0) return STREETS.PREFLOP;
  if (b === 3) return STREETS.FLOP;
  if (b === 4) return STREETS.TURN;
  if (b === 5) return STREETS.RIVER;

  // Transient state (e.g., 1 or 2 board cards mid-deal). Treat as previous street.
  return null;
}

/**
 * Create a stable key for a card set to detect unchanged vs changed frames.
 */
function cardKey(cards) {
  if (!cards || cards.length === 0) return '';
  return cards.map((c) => (c ? `${c.rank}${c.suit}` : '?')).join(',');
}

/**
 * HandStateMachine
 * ----------------
 * Feed it raw detection snapshots each frame via observe(). It emits events
 * via the callbacks you pass in the constructor.
 *
 * Events:
 *   onHandStart(hand)       - new hole cards just became stable
 *   onStreetChange(hand, prevStreet, nextStreet)
 *   onHandEnd(hand)         - hole cards disappeared after at least preflop
 *   onStateChange(state)    - any field on internal state changed (for React)
 *
 * Required stability: a proposed new street must persist for `requiredFrames`
 * consecutive observations before the machine commits to it. This is on top
 * of the matcher debouncing in HUD.jsx.
 */
export class HandStateMachine {
  constructor({
    requiredFrames = 2,
    onHandStart = null,
    onStreetChange = null,
    onHandEnd = null,
    onStateChange = null,
  } = {}) {
    this.requiredFrames = requiredFrames;
    this.onHandStart = onHandStart;
    this.onStreetChange = onStreetChange;
    this.onHandEnd = onHandEnd;
    this.onStateChange = onStateChange;

    // Committed state (debounced)
    this.state = {
      street: STREETS.WAITING,
      holeCards: [],
      boardCards: [],
      handStartedAt: null,
      handId: null,
      streetHistory: [],       // list of {street, enteredAt, board}
      lastChangeAt: null,
    };

    // Proposed state (pending debounce)
    this._pendingStreet = STREETS.WAITING;
    this._pendingHole = [];
    this._pendingBoard = [];
    this._pendingKey = '';
    this._pendingFrames = 0;

    // Running totals for the current hand (for logging)
    this._currentHand = null;
  }

  /**
   * Feed a detection snapshot into the machine.
   * Called every detection tick with the debounced hole/board from the matcher.
   */
  observe(holeCards, boardCards) {
    const street = deriveStreet(holeCards, boardCards);
    if (street === null) return; // transient, ignore

    const key = `${street}|${cardKey(holeCards)}|${cardKey(boardCards)}`;

    if (key === this._pendingKey) {
      this._pendingFrames += 1;
    } else {
      this._pendingKey = key;
      this._pendingStreet = street;
      this._pendingHole = holeCards || [];
      this._pendingBoard = boardCards || [];
      this._pendingFrames = 1;
    }

    if (this._pendingFrames < this.requiredFrames) return;

    // Stable - check if it actually changed from committed state
    const committedKey = `${this.state.street}|${cardKey(this.state.holeCards)}|${cardKey(this.state.boardCards)}`;
    if (committedKey === key) return;

    this._commit(this._pendingStreet, this._pendingHole, this._pendingBoard);
  }

  _commit(nextStreet, holeCards, boardCards) {
    const prevStreet = this.state.street;
    const now = Date.now();

    // Hand start detection: were in WAITING, now in any active street
    const wasWaiting = prevStreet === STREETS.WAITING;
    const nowActive = nextStreet !== STREETS.WAITING;
    const isHandStart = wasWaiting && nowActive;

    // Hand end detection: were active with a real hand, now in WAITING
    const wasActive = prevStreet !== STREETS.WAITING;
    const nowWaiting = nextStreet === STREETS.WAITING;
    const isHandEnd = wasActive && nowWaiting && this._currentHand !== null;

    if (isHandStart) {
      this._currentHand = {
        handId: `h_${now}_${Math.floor(Math.random() * 10000)}`,
        startedAt: now,
        holeCards: holeCards.slice(),
        flop: null,
        turn: null,
        river: null,
        finalBoard: [],
        streetDecisions: {},  // street -> {action, equity, potOdds, ...}
        ended: false,
      };
      this.state.handStartedAt = now;
      this.state.handId = this._currentHand.handId;
      this.state.streetHistory = [];
    }

    // Street history: any street change gets recorded
    if (nextStreet !== prevStreet && nextStreet !== STREETS.WAITING) {
      this.state.streetHistory.push({
        street: nextStreet,
        enteredAt: now,
        board: boardCards.slice(),
      });
      if (this._currentHand) {
        if (nextStreet === STREETS.FLOP) this._currentHand.flop = boardCards.slice(0, 3);
        else if (nextStreet === STREETS.TURN) this._currentHand.turn = boardCards[3] || null;
        else if (nextStreet === STREETS.RIVER) this._currentHand.river = boardCards[4] || null;
      }
    }

    const committedStreet = this.state.street;
    this.state.street = nextStreet;
    this.state.holeCards = holeCards;
    this.state.boardCards = boardCards;
    this.state.lastChangeAt = now;
    if (this._currentHand) this._currentHand.finalBoard = boardCards.slice();

    // Fire callbacks
    if (isHandStart && this.onHandStart) {
      try { this.onHandStart(this._currentHand); } catch (e) { /* swallow */ }
    }
    if (nextStreet !== committedStreet && this.onStreetChange) {
      try { this.onStreetChange(this._currentHand, committedStreet, nextStreet); } catch (e) { /* swallow */ }
    }
    if (isHandEnd) {
      if (this._currentHand) {
        this._currentHand.ended = true;
        this._currentHand.endedAt = now;
      }
      if (this.onHandEnd) {
        try { this.onHandEnd(this._currentHand); } catch (e) { /* swallow */ }
      }
      this._currentHand = null;
      this.state.handId = null;
      this.state.handStartedAt = null;
    }

    if (this.onStateChange) {
      try { this.onStateChange(this.getState()); } catch (e) { /* swallow */ }
    }
  }

  /**
   * Record a decision made on the current street. Used by the caller to store
   * what the engine recommended, which we can later attach to the hand log.
   */
  recordDecision(decision) {
    if (!this._currentHand) return;
    const street = this.state.street;
    this._currentHand.streetDecisions[street] = {
      ...decision,
      at: Date.now(),
    };
  }

  /**
   * Force-end the current hand (e.g., user clicked "New Hand" button).
   */
  reset() {
    const hadHand = this._currentHand !== null;
    const finished = this._currentHand;
    this._currentHand = null;
    this.state = {
      street: STREETS.WAITING,
      holeCards: [],
      boardCards: [],
      handStartedAt: null,
      handId: null,
      streetHistory: [],
      lastChangeAt: Date.now(),
    };
    this._pendingStreet = STREETS.WAITING;
    this._pendingHole = [];
    this._pendingBoard = [];
    this._pendingKey = '';
    this._pendingFrames = 0;
    if (hadHand && this.onHandEnd && finished) {
      try { finished.ended = true; finished.endedAt = Date.now(); this.onHandEnd(finished); } catch (e) { /* swallow */ }
    }
    if (this.onStateChange) {
      try { this.onStateChange(this.getState()); } catch (e) { /* swallow */ }
    }
  }

  getState() {
    return {
      ...this.state,
      currentHand: this._currentHand ? { ...this._currentHand } : null,
    };
  }
}

export default HandStateMachine;
