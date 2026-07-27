/**
 * MULTI-STREET HAND MANAGER
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 * Manages the state of a single multi-street poker hand.
 * Chains flop → turn → river decisions with dynamic board dealing,
 * running pot calculation, and per-street GTO feedback.
 *
 * Usage:
 *   const hand = new MultiStreetHand(flopQuestion);
 *   hand.recordAction('b33'); // hero bets 33%
 *   const turnQ = await hand.advanceStreet(deterministicEngine, gameConfig);
 *   if (!turnQ) { // hand complete, no turn data }
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 */

const STREET_ORDER = ['flop', 'turn', 'river'];
const SUITS = ['s', 'h', 'd', 'c'];
const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];

/**
 * Generate all 52 cards
 */
function allCards() {
    const cards = [];
    for (const r of RANKS) {
        for (const s of SUITS) {
            cards.push(r + s);
        }
    }
    return cards;
}

/**
 * Deal a random card not in the dead cards set
 */
function dealRandomCard(deadCards) {
    const deck = allCards().filter(c => !deadCards.has(c.toLowerCase()));
    if (deck.length === 0) return null;
    return deck[Math.floor(Math.random() * deck.length)];
}

/**
 * Parse two-char cards from a hero hand like "AKs" into actual cards
 */
function heroHandToCards(heroHand) {
    if (!heroHand || heroHand.length < 2) return [];
    const r1 = heroHand[0];
    const r2 = heroHand[1];
    const suffix = heroHand.length >= 3 ? heroHand[2] : '';

    if (r1 === r2) return [`${r1}h`, `${r2}s`];
    if (suffix === 's') return [`${r1}s`, `${r2}s`];
    return [`${r1}s`, `${r2}h`];
}

/**
 * Compute pot size after an action
 * @param {number} currentPot - Current pot in BB
 * @param {string} action - Action code like 'c', 'b33', 'f'
 * @returns {number} New pot size
 */
function computePotAfterAction(currentPot, action) {
    if (!action) return currentPot;
    if (action === 'c' || action === 'x') return currentPot; // check
    if (action === 'f') return currentPot; // fold

    // Parse bet/raise percentage
    const betMatch = action.match(/^[br](\d+)$/);
    if (betMatch) {
        const pct = parseInt(betMatch[1]);
        const betSize = currentPot * (pct / 100);
        return currentPot + betSize; // Simplified: hero bets X, villain calls
    }

    if (action === 'allin') return currentPot * 2; // Rough approximation

    return currentPot;
}

export class MultiStreetHand {
    constructor(flopQuestion) {
        this.heroHand = flopQuestion.heroHand || flopQuestion.scenario?.heroHand || '';
        this.heroCards = flopQuestion.heroCards || heroHandToCards(this.heroHand);
        this.gameType = flopQuestion.scenario?.gameType || 'hu_cash';
        this.stackDepth = flopQuestion.scenario?.stackDepth || 100;
        this.heroPosition = flopQuestion.scenario?.heroPosition || 'BTN';
        this.villainPosition = flopQuestion.scenario?.villainPosition || 'BB';

        // Board state — starts with flop cards
        const flopBoard = flopQuestion.scenario?.board || '';
        this.boardCards = this._parseBoardCards(flopBoard);
        this.flopCards = [...this.boardCards]; // Save original flop

        // Dead cards (hero hand + board — can't be dealt again)
        this.deadCards = new Set();
        this.heroCards.forEach(c => this.deadCards.add(c.toLowerCase()));
        this.boardCards.forEach(c => this.deadCards.add(c.toLowerCase()));

        // Street tracking
        this.currentStreet = 'flop';
        this.streetIndex = 0;

        // Pot tracking — starts from flop question pot
        this.pot = flopQuestion.scenario?.pot || 6;
        this.initialPot = this.pot;

        // Action history across all streets
        this.streetActions = [];
        this.evHistory = []; // { street, classification, evLoss }

        // Current question reference
        this.currentQuestion = flopQuestion;

        // Per-street data
        this.streetData = [{
            street: 'flop',
            boardCards: [...this.boardCards],
            pot: this.pot,
            question: flopQuestion,
        }];
    }

    /**
     * Is the hand complete (no more streets)?
     */
    get isComplete() {
        return this.streetIndex >= 2 || this.currentStreet === 'done';
    }

    /**
     * Get the next street name
     */
    get nextStreetName() {
        if (this.streetIndex >= 2) return null;
        return STREET_ORDER[this.streetIndex + 1];
    }

    /**
     * Record the hero's action at the current street
     */
    recordAction(actionCode, classification, evLoss) {
        this.streetActions.push({
            street: this.currentStreet,
            action: actionCode,
            pot: this.pot,
        });

        this.evHistory.push({
            street: this.currentStreet,
            classification,
            evLoss,
        });

        // Update pot after action (hero bets, assume villain calls)
        this.pot = computePotAfterAction(this.pot, actionCode);

        // If hero folds, hand is over
        if (actionCode === 'f' || actionCode === 'simple_fold') {
            this.currentStreet = 'done';
        }
    }

    /**
     * Advance to the next street.
     * Deals a new card, queries solver for next-street data.
     * Returns the next street's question or null if hand is complete.
     *
     * @param {DeterministicGTOEngine} engine - The deterministic engine
     * @param {Object} gameConfig - PIO game config
     * @returns {Promise<Object|null>} Next street question or null
     */
    async advanceStreet(engine, gameConfig) {
        if (this.isComplete) return null;

        const nextStreet = this.nextStreetName;
        if (!nextStreet) return null;

        // Deal new card(s)
        const newCard = dealRandomCard(this.deadCards);
        if (!newCard) return null;

        this.deadCards.add(newCard.toLowerCase());
        this.boardCards.push(newCard);
        this.streetIndex++;
        this.currentStreet = nextStreet;

        // Try to find solver data for the extended board
        const nextQuestion = await engine.queryNextStreet({
            gameConfig,
            heroHand: this.heroHand,
            boardCards: this.boardCards,
            street: nextStreet,
            pot: this.pot,
            stackDepth: this.stackDepth,
            heroPosition: this.heroPosition,
            villainPosition: this.villainPosition,
        });

        if (nextQuestion) {
            // Enrich with multi-street context
            nextQuestion.scenario = {
                ...nextQuestion.scenario,
                pot: Math.round(this.pot),
                heroStack: this.stackDepth,
                villainStack: this.stackDepth,
                heroPosition: this.heroPosition,
                villainPosition: this.villainPosition,
                board: this.boardCards.join(' '),
                heroHand: this.heroHand,
                street: nextStreet,
                isMultiStreet: true,
                streetNumber: this.streetIndex + 1,
                previousActions: this.streetActions,
            };
            nextQuestion.heroCards = this.heroCards;
            nextQuestion.heroHand = this.heroHand;

            this.currentQuestion = nextQuestion;
            this.streetData.push({
                street: nextStreet,
                boardCards: [...this.boardCards],
                pot: this.pot,
                question: nextQuestion,
                newCard: newCard,
            });

            return nextQuestion;
        }

        // No solver data for this street — hand is complete
        this.currentStreet = 'done';
        return null;
    }

    /**
     * Get hand summary for end-of-hand review
     */
    getHandSummary() {
        const totalEVLoss = this.evHistory.reduce((sum, e) => sum + (e.evLoss || 0), 0);
        const worstStreet = this.evHistory.reduce(
            (worst, e) => (e.evLoss > (worst?.evLoss || 0) ? e : worst),
            null
        );

        return {
            heroHand: this.heroHand,
            heroCards: this.heroCards,
            flopCards: this.flopCards,
            allBoardCards: this.boardCards,
            streets: this.streetData.map(s => ({
                street: s.street,
                boardCards: s.boardCards,
                pot: s.pot,
                newCard: s.newCard || null,
            })),
            actions: this.streetActions,
            evHistory: this.evHistory,
            totalEVLoss,
            worstStreet,
            streetsPlayed: this.streetData.length,
            heroPosition: this.heroPosition,
            villainPosition: this.villainPosition,
        };
    }

    // ●●● PRIVATE UTILS ●●●

    _parseBoardCards(boardStr) {
        if (Array.isArray(boardStr)) return boardStr;
        if (typeof boardStr !== 'string' || boardStr.length < 4) return [];
        const cleaned = boardStr.replace(/\s+/g, '');
        const cards = [];
        for (let i = 0; i < cleaned.length; i += 2) {
            if (i + 1 < cleaned.length) {
                const card = cleaned.substring(i, i + 2);
                if (/^[2-9TJQKA][shdc]$/i.test(card)) {
                    cards.push(card);
                }
            }
        }
        return cards;
    }
}
