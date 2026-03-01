/**
 * Smarter.Poker - Core Poker Engine
 * Module: Deck
 * 
 * Card representation, deck management, cryptographic shuffle,
 * deal, burn, and reset operations.
 * 
 * Cards are represented as integers 0-51 for maximum performance
 * in hand evaluation. Mapping:
 *   card = rank * 4 + suit
 *   rank: 0=2, 1=3, 2=4, ..., 8=T, 9=J, 10=Q, 11=K, 12=A
 *   suit: 0=clubs, 1=diamonds, 2=hearts, 3=spades
 */

const crypto = require('crypto');

// ============ CONSTANTS ============

const SUITS = ['c', 'd', 'h', 's'];
const SUIT_NAMES = ['clubs', 'diamonds', 'hearts', 'spades'];
const SUIT_SYMBOLS = ['♣', '♦', '♥', '♠'];

const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];
const RANK_NAMES = ['Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Jack', 'Queen', 'King', 'Ace'];

const FULL_DECK_SIZE = 52;
const SHORT_DECK_SIZE = 36; // 6+ Hold'em (remove 2-5)

// ============ CARD HELPERS ============

/**
 * Create a card integer from rank and suit indices.
 * @param {number} rank - 0-12 (2 through Ace)
 * @param {number} suit - 0-3 (clubs, diamonds, hearts, spades)
 * @returns {number} Card integer 0-51
 */
function makeCard(rank, suit) {
  if (rank < 0 || rank > 12) throw new Error(`Invalid rank: ${rank}`);
  if (suit < 0 || suit > 3) throw new Error(`Invalid suit: ${suit}`);
  return rank * 4 + suit;
}

/**
 * Parse a card string like "Ah", "Tc", "2d" into a card integer.
 * @param {string} str - Two-character card string (rank + suit)
 * @returns {number} Card integer
 */
function parseCard(str) {
  if (typeof str !== 'string' || str.length !== 2) {
    throw new Error(`Invalid card string: "${str}"`);
  }
  const rankChar = str[0].toUpperCase();
  const suitChar = str[1].toLowerCase();
  
  const rankIdx = RANKS.indexOf(rankChar);
  if (rankIdx === -1) throw new Error(`Invalid rank character: "${rankChar}"`);
  
  const suitIdx = SUITS.indexOf(suitChar);
  if (suitIdx === -1) throw new Error(`Invalid suit character: "${suitChar}"`);
  
  return makeCard(rankIdx, suitIdx);
}

/**
 * Parse multiple card strings. Accepts "AhKs" or "Ah Ks" or ["Ah", "Ks"].
 * @param {string|string[]} input
 * @returns {number[]} Array of card integers
 */
function parseCards(input) {
  if (Array.isArray(input)) {
    return input.map(parseCard);
  }
  if (typeof input === 'string') {
    // Remove spaces and split into 2-char chunks
    const clean = input.replace(/\s+/g, '');
    const cards = [];
    for (let i = 0; i < clean.length; i += 2) {
      cards.push(parseCard(clean.substring(i, i + 2)));
    }
    return cards;
  }
  throw new Error('Input must be a string or array of strings');
}

/**
 * Get the rank index (0-12) from a card integer.
 * @param {number} card
 * @returns {number}
 */
function getRank(card) {
  return Math.floor(card / 4);
}

/**
 * Get the suit index (0-3) from a card integer.
 * @param {number} card
 * @returns {number}
 */
function getSuit(card) {
  return card % 4;
}

/**
 * Convert a card integer to a two-character string like "Ah".
 * @param {number} card
 * @returns {string}
 */
function cardToString(card) {
  return RANKS[getRank(card)] + SUITS[getSuit(card)];
}

/**
 * Convert a card integer to a display string like "A♥".
 * @param {number} card
 * @returns {string}
 */
function cardToDisplay(card) {
  return RANKS[getRank(card)] + SUIT_SYMBOLS[getSuit(card)];
}

/**
 * Convert a card integer to a full name like "Ace of Hearts".
 * @param {number} card
 * @returns {string}
 */
function cardToFullName(card) {
  return `${RANK_NAMES[getRank(card)]} of ${SUIT_NAMES[getSuit(card)]}`;
}

/**
 * Convert an array of card integers to string representation.
 * @param {number[]} cards
 * @returns {string}
 */
function cardsToString(cards) {
  return cards.map(cardToString).join(' ');
}

/**
 * Convert an array of card integers to display representation.
 * @param {number[]} cards
 * @returns {string}
 */
function cardsToDisplay(cards) {
  return cards.map(cardToDisplay).join(' ');
}

// ============ DECK CLASS ============

class Deck {
  /**
   * Create a new deck.
   * @param {Object} options
   * @param {boolean} options.shortDeck - If true, create a 36-card short deck (6+)
   * @param {number[]} options.removeCards - Specific cards to remove from deck
   */
  constructor(options = {}) {
    this._shortDeck = options.shortDeck || false;
    this._removeCards = new Set(options.removeCards || []);
    this._cards = [];
    this._position = 0; // Next card to deal
    this._burnPile = [];
    this._dealtCards = [];
    
    this._buildDeck();
  }

  /**
   * Build the initial deck of cards.
   * @private
   */
  _buildDeck() {
    this._cards = [];
    
    const startRank = this._shortDeck ? 4 : 0; // Short deck starts at 6 (index 4)
    
    for (let rank = startRank; rank <= 12; rank++) {
      for (let suit = 0; suit <= 3; suit++) {
        const card = makeCard(rank, suit);
        if (!this._removeCards.has(card)) {
          this._cards.push(card);
        }
      }
    }
  }

  /**
   * Shuffle the deck using Fisher-Yates with cryptographic randomness.
   * This is the gold standard for fair card shuffling.
   * @returns {Deck} this (for chaining)
   */
  shuffle() {
    const cards = this._cards;
    const n = cards.length;
    
    // Generate all random bytes needed at once for efficiency
    // Each swap needs 4 bytes for a 32-bit random number
    const randomBytes = crypto.randomBytes(n * 4);
    
    // Fisher-Yates shuffle (Knuth shuffle) - O(n), unbiased
    for (let i = n - 1; i > 0; i--) {
      // Read 4 bytes as unsigned 32-bit integer
      const offset = i * 4;
      const randomValue = randomBytes.readUInt32BE(offset);
      
      // Map to range [0, i] without modulo bias
      // Using rejection sampling equivalent via floating point
      const j = Math.floor((randomValue / 0x100000000) * (i + 1));
      
      // Swap
      [cards[i], cards[j]] = [cards[j], cards[i]];
    }
    
    this._position = 0;
    this._burnPile = [];
    this._dealtCards = [];
    
    return this;
  }

  /**
   * Deal one card from the top of the deck.
   * @returns {number} Card integer
   * @throws {Error} If deck is exhausted
   */
  deal() {
    if (this._position >= this._cards.length) {
      throw new Error('Deck exhausted: no more cards to deal');
    }
    const card = this._cards[this._position++];
    this._dealtCards.push(card);
    return card;
  }

  /**
   * Deal multiple cards from the top of the deck.
   * @param {number} count - Number of cards to deal
   * @returns {number[]} Array of card integers
   */
  dealMultiple(count) {
    const cards = [];
    for (let i = 0; i < count; i++) {
      cards.push(this.deal());
    }
    return cards;
  }

  /**
   * Burn one card (discard face-down, as per poker protocol).
   * @returns {number} The burned card
   */
  burn() {
    if (this._position >= this._cards.length) {
      throw new Error('Deck exhausted: no card to burn');
    }
    const card = this._cards[this._position++];
    this._burnPile.push(card);
    return card;
  }

  /**
   * Deal community cards with proper burn protocol.
   * Burns one card, then deals the specified number.
   * @param {number} count - Number of community cards (3 for flop, 1 for turn/river)
   * @returns {number[]} Dealt community cards
   */
  dealCommunity(count) {
    this.burn();
    return this.dealMultiple(count);
  }

  /**
   * Deal a full flop (burn 1, deal 3).
   * @returns {number[]} Three flop cards
   */
  dealFlop() {
    return this.dealCommunity(3);
  }

  /**
   * Deal the turn card (burn 1, deal 1).
   * @returns {number} Turn card
   */
  dealTurn() {
    return this.dealCommunity(1)[0];
  }

  /**
   * Deal the river card (burn 1, deal 1).
   * @returns {number} River card
   */
  dealRiver() {
    return this.dealCommunity(1)[0];
  }

  /**
   * Deal hole cards to a specified number of players.
   * Deals one card to each player in order, then a second round (poker dealing protocol).
   * @param {number} numPlayers - Number of players to deal to
   * @param {number} cardsPerPlayer - Cards per player (2 for Hold'em, 4 for PLO, etc.)
   * @returns {number[][]} Array of hole card arrays, one per player
   */
  dealHoleCards(numPlayers, cardsPerPlayer = 2) {
    const hands = Array.from({ length: numPlayers }, () => []);
    
    // Deal in rounds (one card per player per round), as in real poker
    for (let round = 0; round < cardsPerPlayer; round++) {
      for (let player = 0; player < numPlayers; player++) {
        hands[player].push(this.deal());
      }
    }
    
    return hands;
  }

  /**
   * Reset the deck and reshuffle for a new hand.
   * @returns {Deck} this (for chaining)
   */
  reset() {
    this._buildDeck();
    return this.shuffle();
  }

  /**
   * Get the number of remaining (undealt) cards.
   * @returns {number}
   */
  get remaining() {
    return this._cards.length - this._position;
  }

  /**
   * Get the total deck size.
   * @returns {number}
   */
  get size() {
    return this._cards.length;
  }

  /**
   * Get all cards that have been dealt.
   * @returns {number[]}
   */
  get dealtCards() {
    return [...this._dealtCards];
  }

  /**
   * Get all burned cards.
   * @returns {number[]}
   */
  get burnPile() {
    return [...this._burnPile];
  }

  /**
   * Peek at remaining community cards without advancing the deck.
   * Simulates burn+deal for each remaining street.
   * @param {number} boardSize - Current community card count (0-5)
   * @returns {number[]} Cards that would be dealt for remaining streets
   */
  peekRabbitCards(boardSize) {
    const result = [];
    let pos = this._position;
    const cards = this._cards;
    const len = cards.length;

    // Simulate remaining streets: flop (3), turn (1), river (1)
    if (boardSize < 3) {
      // Need flop: burn 1, deal 3
      if (pos < len) pos++; // burn
      for (let i = 0; i < 3 && pos < len; i++) result.push(cards[pos++]);
    }
    if (boardSize < 4 && result.length >= (boardSize < 3 ? 3 : 0)) {
      // Need turn: burn 1, deal 1
      if (pos < len) pos++; // burn
      if (pos < len) result.push(cards[pos++]);
    }
    if (boardSize < 5 && result.length >= (boardSize < 3 ? 4 : boardSize < 4 ? 1 : 0)) {
      // Need river: burn 1, deal 1
      if (pos < len) pos++; // burn
      if (pos < len) result.push(cards[pos++]);
    }
    return result;
  }

  /**
   * Check if this is a short deck.
   * @returns {boolean}
   */
  get isShortDeck() {
    return this._shortDeck;
  }

  /**
   * Get a snapshot of the full deck state (for server-side auditing).
   * @returns {Object}
   */
  getState() {
    return {
      cards: [...this._cards],
      position: this._position,
      burnPile: [...this._burnPile],
      dealtCards: [...this._dealtCards],
      remaining: this.remaining,
      shortDeck: this._shortDeck,
    };
  }

  /**
   * Create a string representation of the remaining deck (for debugging).
   * @returns {string}
   */
  toString() {
    const remaining = this._cards.slice(this._position);
    return `Deck(${this.remaining}/${this.size}): ${cardsToString(remaining)}`;
  }
}

// ============ EXPORTS ============

module.exports = {
  // Constants
  SUITS,
  SUIT_NAMES,
  SUIT_SYMBOLS,
  RANKS,
  RANK_NAMES,
  FULL_DECK_SIZE,
  SHORT_DECK_SIZE,
  
  // Card helpers
  makeCard,
  parseCard,
  parseCards,
  getRank,
  getSuit,
  cardToString,
  cardToDisplay,
  cardToFullName,
  cardsToString,
  cardsToDisplay,
  
  // Deck class
  Deck,
};
