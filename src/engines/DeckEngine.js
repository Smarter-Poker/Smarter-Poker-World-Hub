/**
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 * DECK ENGINE — Deterministic Card Dealing for Training Games
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 *
 * Features:
 *   - Full 52-card deck with suit support
 *   - Dead card removal (hero/villain holdings)
 *   - Seed-based PRNG for reproducible deals (replay support)
 *   - Deal flop, turn, river
 *   - Card formatting and parsing utilities
 *
 * Card Format: "As" = Ace of spades, "Th" = Ten of hearts, "2c" = Two of clubs
 * Ranks: A, K, Q, J, T, 9, 8, 7, 6, 5, 4, 3, 2
 * Suits: s (spades), h (hearts), d (diamonds), c (clubs)
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 */

// ●● Constants ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

export const RANKS = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2'];
export const SUITS = ['s', 'h', 'd', 'c'];
export const RANK_VALUES = { 'A': 14, 'K': 13, 'Q': 12, 'J': 11, 'T': 10, '9': 9, '8': 8, '7': 7, '6': 6, '5': 5, '4': 4, '3': 3, '2': 2 };
export const SUIT_SYMBOLS = { 's': '♠', 'h': '♥', 'd': '♦', 'c': '♣' };
export const SUIT_COLORS = { 's': '#1a1a2e', 'h': '#e74c3c', 'd': '#3498db', 'c': '#27ae60' };

/** Full 52-card deck */
export const FULL_DECK = [];
for (const rank of RANKS) {
    for (const suit of SUITS) {
        FULL_DECK.push(rank + suit);
    }
}

// ●● Seeded PRNG (Mulberry32) ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

function mulberry32(seed) {
    return function () {
        let t = seed += 0x6D2B79F5;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

// ●● Card Utilities ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

/** Parse a card string into { rank, suit, value } */
export function parseCard(card) {
    if (!card || card.length < 2) return null;
    const rank = card[0];
    const suit = card[1];
    return {
        rank,
        suit,
        value: RANK_VALUES[rank] || 0,
        display: rank + SUIT_SYMBOLS[suit],
        color: SUIT_COLORS[suit] || '#000',
    };
}

/** Convert hand notation (e.g., "AKs") to possible card combos */
export function handToCards(hand) {
    if (!hand) return [];
    const r1 = hand[0];
    const r2 = hand[1];
    const type = hand[2]; // 's' = suited, 'o' = offsuit, undefined = pair

    const combos = [];
    if (!type) {
        // Pair: 6 combos
        for (let i = 0; i < 4; i++) {
            for (let j = i + 1; j < 4; j++) {
                combos.push([r1 + SUITS[i], r2 + SUITS[j]]);
            }
        }
    } else if (type === 's') {
        // Suited: 4 combos
        for (const s of SUITS) {
            combos.push([r1 + s, r2 + s]);
        }
    } else {
        // Offsuit: 12 combos
        for (let i = 0; i < 4; i++) {
            for (let j = 0; j < 4; j++) {
                if (i !== j) combos.push([r1 + SUITS[i], r2 + SUITS[j]]);
            }
        }
    }
    return combos;
}

/** Get display string for a card */
export function cardDisplay(card) {
    const parsed = parseCard(card);
    return parsed ? parsed.display : card;
}

// ●● Deck Engine Class ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

export class DeckEngine {
    /**
     * @param {Object} options
     * @param {number} [options.seed] - Seed for reproducible deals
     * @param {string[]} [options.deadCards] - Cards already in play (hero, villain, etc.)
     */
    constructor(options = {}) {
        this.seed = options.seed || Date.now();
        this.rng = mulberry32(this.seed);
        this.deadCards = new Set((options.deadCards || []).map(c => c.toUpperCase ? c : c));
        this.dealt = [];
        this.deck = this._buildDeck();
        this._shuffle();
    }

    /** Build deck excluding dead cards */
    _buildDeck() {
        return FULL_DECK.filter(card => !this.deadCards.has(card));
    }

    /** Fisher-Yates shuffle using seeded PRNG */
    _shuffle() {
        const arr = [...this.deck];
        for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(this.rng() * (i + 1));
            [arr[i], arr[j]] = [arr[j], arr[i]];
        }
        this.deck = arr;
        this.cursor = 0;
    }

    /** Deal N cards from the deck */
    deal(count) {
        const cards = [];
        for (let i = 0; i < count; i++) {
            if (this.cursor >= this.deck.length) {
                throw new Error('DeckEngine: No cards remaining');
            }
            const card = this.deck[this.cursor++];
            cards.push(card);
            this.dealt.push(card);
        }
        return cards;
    }

    /** Deal a flop (3 cards, burn 1 first) */
    dealFlop() {
        this.deal(1); // burn
        return this.deal(3);
    }

    /** Deal a turn (1 card, burn 1 first) */
    dealTurn() {
        this.deal(1); // burn
        return this.deal(1);
    }

    /** Deal a river (1 card, burn 1 first) */
    dealRiver() {
        this.deal(1); // burn
        return this.deal(1);
    }

    /** Deal a complete board (flop + turn + river) */
    dealFullBoard() {
        const flop = this.dealFlop();
        const turn = this.dealTurn();
        const river = this.dealRiver();
        return { flop, turn, river, board: [...flop, ...turn, ...river] };
    }

    /** Deal hero hole cards */
    dealHoleCards() {
        return this.deal(2);
    }

    /** Get remaining deck size */
    remaining() {
        return this.deck.length - this.cursor;
    }

    /** Add dead cards and rebuild deck */
    addDeadCards(cards) {
        for (const c of cards) this.deadCards.add(c);
        this.deck = this._buildDeck();
        this._shuffle();
    }

    /** Reset deck with new seed */
    reset(seed) {
        this.seed = seed || Date.now();
        this.rng = mulberry32(this.seed);
        this.dealt = [];
        this.deck = this._buildDeck();
        this._shuffle();
    }

    /** Create a new DeckEngine with specific hero/villain cards removed */
    static forScenario({ heroCards = [], villainCards = [], board = [] } = {}) {
        return new DeckEngine({
            seed: Date.now(),
            deadCards: [...heroCards, ...villainCards, ...board],
        });
    }
}

export default DeckEngine;
