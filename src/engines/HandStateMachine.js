/**
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 * HAND STATE MACHINE — Complete Poker Hand Lifecycle
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 *
 * Manages the complete state of a poker hand from deal to showdown:
 *   - States: PREFLOP → FLOP → TURN → RIVER → SHOWDOWN → COMPLETE
 *   - Pot tracking, stack tracking, position tracking
 *   - Action history (who did what at each street)
 *   - Supports heads-up and multiway (up to 6 players)
 *
 * Used by FullHandTrainer to run complete training hands.
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 */

import { DeckEngine } from './DeckEngine';
import { evaluateHand } from './HandStrengthEngine';

// ●● Hand States ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

export const HAND_STATES = {
    WAITING: 'waiting',
    PREFLOP: 'preflop',
    FLOP: 'flop',
    TURN: 'turn',
    RIVER: 'river',
    SHOWDOWN: 'showdown',
    COMPLETE: 'complete',
};

// ●● Position Names (6-max) ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

export const POSITIONS_6MAX = ['UTG', 'MP', 'CO', 'BTN', 'SB', 'BB'];
export const POSITIONS_HU = ['BTN', 'BB'];

// ●● Player Object ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

function createPlayer(position, stackBB, isHero = false) {
    return {
        position,
        stack: stackBB,
        holeCards: null,
        isHero,
        isActive: true,       // still in the hand
        hasActed: false,       // has acted this street
        totalInvested: 0,      // total chips put into the pot this hand
        streetInvested: 0,     // chips put in this street
        isFolded: false,
        isAllIn: false,
    };
}

// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
// HAND STATE MACHINE
// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

export class HandStateMachine {
    /**
     * @param {Object} options
     * @param {number} [options.numPlayers=2] - Number of players (2-6)
     * @param {number} [options.stackBB=100] - Starting stack in BB
     * @param {number} [options.sbSize=0.5] - Small blind in BB
     * @param {number} [options.bbSize=1] - Big blind in BB
     * @param {string} [options.heroPosition] - Hero's seat position
     * @param {number} [options.seed] - Seed for reproducible deals
     * @param {string[]} [options.heroCards] - Predetermined hero cards (for scenarios)
     * @param {string[]} [options.board] - Predetermined board (for scenarios)
     */
    constructor(options = {}) {
        this.numPlayers = Math.min(6, Math.max(2, options.numPlayers || 2));
        this.stackBB = options.stackBB || 100;
        this.sbSize = options.sbSize || 0.5;
        this.bbSize = options.bbSize || 1;
        this.seed = options.seed || Date.now();
        this.heroPosition = options.heroPosition || (this.numPlayers === 2 ? 'BTN' : 'BTN');
        this.presetHeroCards = options.heroCards || null;
        this.presetBoard = options.board || null;

        // State
        this.state = HAND_STATES.WAITING;
        this.players = [];
        this.board = [];
        this.pot = 0;
        this.sidePots = [];
        this.currentBet = 0;         // Current bet to match this street
        this.minRaise = this.bbSize; // Minimum raise increment
        this.actionIndex = 0;        // Which player acts next
        this.deck = null;

        // History
        this.actionHistory = [];     // All actions taken
        this.streetActions = {};     // Actions per street
        this.handNumber = 0;

        this._initPlayers();
    }

    /** Initialize players around the table */
    _initPlayers() {
        const positions = this.numPlayers === 2
            ? POSITIONS_HU
            : POSITIONS_6MAX.slice(0, this.numPlayers);

        this.players = positions.map(pos =>
            createPlayer(pos, this.stackBB, pos === this.heroPosition)
        );
    }

    /** Get the hero player */
    get hero() {
        return this.players.find(p => p.isHero);
    }

    /** Get active (non-folded) players */
    get activePlayers() {
        return this.players.filter(p => p.isActive && !p.isFolded);
    }

    /** Get the current player to act */
    get currentPlayer() {
        const active = this.activePlayers.filter(p => !p.isAllIn);
        if (active.length === 0) return null;
        return active[this.actionIndex % active.length];
    }

    // ●● Start Hand ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

    /**
     * Start a new hand. Posts blinds, deals cards, sets up preflop action.
     * @returns {Object} Initial hand state
     */
    startHand() {
        this.handNumber++;
        this.state = HAND_STATES.PREFLOP;
        this.board = [];
        this.pot = 0;
        this.currentBet = 0;
        this.minRaise = this.bbSize;
        this.actionHistory = [];
        this.streetActions = { preflop: [], flop: [], turn: [], river: [] };

        // Reset players
        for (const p of this.players) {
            p.holeCards = null;
            p.isActive = true;
            p.hasActed = false;
            p.totalInvested = 0;
            p.streetInvested = 0;
            p.isFolded = false;
            p.isAllIn = false;
            p.stack = this.stackBB;
        }

        // Post blinds
        this._postBlinds();

        // Deal cards
        const deadCards = this.presetHeroCards ? [...this.presetHeroCards] : [];
        if (this.presetBoard) deadCards.push(...this.presetBoard);
        this.deck = new DeckEngine({ seed: this.seed + this.handNumber, deadCards });

        for (const p of this.players) {
            if (p.isHero && this.presetHeroCards) {
                p.holeCards = this.presetHeroCards;
            } else {
                p.holeCards = this.deck.deal(2);
            }
        }

        // Set action to first player after BB (UTG in 6max, BTN in HU)
        this._setFirstToAct();

        return this.getState();
    }

    /** Post small and big blinds */
    _postBlinds() {
        const sb = this.players.find(p => p.position === 'SB');
        const bb = this.players.find(p => p.position === 'BB');

        if (sb) {
            const sbAmount = Math.min(this.sbSize, sb.stack);
            sb.stack -= sbAmount;
            sb.totalInvested += sbAmount;
            sb.streetInvested += sbAmount;
            this.pot += sbAmount;
        }

        if (bb) {
            const bbAmount = Math.min(this.bbSize, bb.stack);
            bb.stack -= bbAmount;
            bb.totalInvested += bbAmount;
            bb.streetInvested += bbAmount;
            this.pot += bbAmount;
        }

        this.currentBet = this.bbSize;
    }

    /** Set who acts first on a given street */
    _setFirstToAct() {
        const active = this.activePlayers.filter(p => !p.isAllIn);
        if (active.length === 0) return;

        if (this.state === HAND_STATES.PREFLOP) {
            // First to act preflop: UTG (or BTN in HU)
            if (this.numPlayers === 2) {
                this.actionIndex = active.findIndex(p => p.position === 'BTN');
                // In HU preflop, BTN/SB acts first
            } else {
                // First non-blind position
                const nonBlinds = active.filter(p => p.position !== 'SB' && p.position !== 'BB');
                this.actionIndex = nonBlinds.length > 0
                    ? active.indexOf(nonBlinds[0])
                    : 0;
            }
        } else {
            // Postflop: SB (or first active player OOP) acts first
            this.actionIndex = 0; // Already sorted by position
        }

        if (this.actionIndex < 0) this.actionIndex = 0;
    }

    // ●● Actions ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

    /**
     * Process a player action.
     * @param {string} action - 'fold', 'check', 'call', 'bet', 'raise', 'allin'
     * @param {number} [amount] - Bet/raise amount in BB (total, not on top)
     * @returns {{ valid: boolean, newState: Object, error?: string }}
     */
    processAction(action, amount) {
        const player = this.currentPlayer;
        if (!player) return { valid: false, error: 'No player to act' };
        if (this.state === HAND_STATES.SHOWDOWN || this.state === HAND_STATES.COMPLETE) {
            return { valid: false, error: 'Hand is complete' };
        }

        const streetKey = this.state;
        let result = { valid: true };

        switch (action) {
            case 'fold':
                player.isFolded = true;
                player.isActive = false;
                this._recordAction(player, 'fold', 0);
                break;

            case 'check':
                if (player.streetInvested < this.currentBet) {
                    return { valid: false, error: 'Cannot check — must call or raise' };
                }
                this._recordAction(player, 'check', 0);
                break;

            case 'call': {
                const callAmount = Math.min(this.currentBet - player.streetInvested, player.stack);
                player.stack -= callAmount;
                player.totalInvested += callAmount;
                player.streetInvested += callAmount;
                this.pot += callAmount;
                if (player.stack <= 0) player.isAllIn = true;
                this._recordAction(player, 'call', callAmount);
                break;
            }

            case 'bet': {
                if (this.currentBet > 0 && player.streetInvested < this.currentBet) {
                    return { valid: false, error: 'Use raise when facing a bet' };
                }
                const betAmount = Math.min(amount || this.bbSize * 2, player.stack);
                player.stack -= betAmount;
                player.totalInvested += betAmount;
                player.streetInvested += betAmount;
                this.pot += betAmount;
                this.currentBet = player.streetInvested;
                this.minRaise = betAmount;
                if (player.stack <= 0) player.isAllIn = true;
                // Reset hasActed for other players (they need to respond)
                for (const p of this.activePlayers) {
                    if (p !== player && !p.isAllIn) p.hasActed = false;
                }
                this._recordAction(player, 'bet', betAmount);
                break;
            }

            case 'raise': {
                const raiseTotal = amount || (this.currentBet + this.minRaise);
                const raiseAmount = Math.min(raiseTotal - player.streetInvested, player.stack);
                player.stack -= raiseAmount;
                player.totalInvested += raiseAmount;
                player.streetInvested += raiseAmount;
                this.pot += raiseAmount;
                const raiseIncrement = player.streetInvested - this.currentBet;
                this.minRaise = Math.max(this.minRaise, raiseIncrement);
                this.currentBet = player.streetInvested;
                if (player.stack <= 0) player.isAllIn = true;
                // Reset hasActed for other players
                for (const p of this.activePlayers) {
                    if (p !== player && !p.isAllIn) p.hasActed = false;
                }
                this._recordAction(player, 'raise', raiseAmount);
                break;
            }

            case 'allin': {
                const allInAmount = player.stack;
                const wasRaise = player.streetInvested + allInAmount > this.currentBet;
                player.totalInvested += allInAmount;
                player.streetInvested += allInAmount;
                this.pot += allInAmount;
                player.stack = 0;
                player.isAllIn = true;
                if (wasRaise) {
                    this.minRaise = Math.max(this.minRaise, player.streetInvested - this.currentBet);
                    this.currentBet = player.streetInvested;
                    for (const p of this.activePlayers) {
                        if (p !== player && !p.isAllIn) p.hasActed = false;
                    }
                }
                this._recordAction(player, 'allin', allInAmount);
                break;
            }

            default:
                return { valid: false, error: `Unknown action: ${action}` };
        }

        player.hasActed = true;

        // Check if street is complete
        if (this._isStreetComplete()) {
            this._advanceStreet();
        } else {
            this._advanceAction();
        }

        return { valid: true, newState: this.getState() };
    }

    /** Record an action in history */
    _recordAction(player, action, amount) {
        const entry = {
            player: player.position,
            isHero: player.isHero,
            action,
            amount,
            pot: this.pot,
            street: this.state,
            timestamp: Date.now(),
        };
        this.actionHistory.push(entry);
        if (this.streetActions[this.state]) {
            this.streetActions[this.state].push(entry);
        }
    }

    /** Check if the current street's action is complete */
    _isStreetComplete() {
        const active = this.activePlayers.filter(p => !p.isAllIn);

        // Only one player left (everyone else folded)
        if (this.activePlayers.length <= 1) return true;

        // All active non-allin players have acted and matched the current bet
        return active.every(p =>
            p.hasActed && (p.streetInvested >= this.currentBet || p.isFolded)
        );
    }

    /** Advance to next player to act */
    _advanceAction() {
        const active = this.activePlayers.filter(p => !p.isAllIn && !p.isFolded);
        if (active.length === 0) return;

        // Find next player who hasn't acted or needs to respond to a raise
        this.actionIndex = (this.actionIndex + 1) % active.length;
        let attempts = 0;
        while (active[this.actionIndex]?.hasActed && attempts < active.length) {
            this.actionIndex = (this.actionIndex + 1) % active.length;
            attempts++;
        }
    }

    /** Advance to next street */
    _advanceStreet() {
        // Only one player remains — they win
        if (this.activePlayers.length <= 1) {
            this.state = HAND_STATES.COMPLETE;
            this._resolvePot();
            return;
        }

        // All active players are all-in — run out remaining streets
        const canAct = this.activePlayers.filter(p => !p.isAllIn);
        const mustRunOut = canAct.length <= 1;

        // Reset street betting
        for (const p of this.players) {
            p.hasActed = false;
            p.streetInvested = 0;
        }
        this.currentBet = 0;
        this.minRaise = this.bbSize;

        switch (this.state) {
            case HAND_STATES.PREFLOP:
                this.state = HAND_STATES.FLOP;
                this._dealStreet('flop');
                break;
            case HAND_STATES.FLOP:
                this.state = HAND_STATES.TURN;
                this._dealStreet('turn');
                break;
            case HAND_STATES.TURN:
                this.state = HAND_STATES.RIVER;
                this._dealStreet('river');
                break;
            case HAND_STATES.RIVER:
                this.state = HAND_STATES.SHOWDOWN;
                this._resolvePot();
                return;
        }

        if (mustRunOut) {
            // Skip action and auto-advance through remaining streets
            this._advanceStreet();
        } else {
            this._setFirstToAct();
        }
    }

    /** Deal community cards for a street */
    _dealStreet(street) {
        if (this.presetBoard) {
            // Use preset board cards
            if (street === 'flop' && this.presetBoard.length >= 3) {
                this.board = this.presetBoard.slice(0, 3);
            } else if (street === 'turn' && this.presetBoard.length >= 4) {
                this.board = this.presetBoard.slice(0, 4);
            } else if (street === 'river' && this.presetBoard.length >= 5) {
                this.board = this.presetBoard.slice(0, 5);
            }
        } else {
            if (street === 'flop') {
                this.board = this.deck.dealFlop();
            } else if (street === 'turn') {
                this.board.push(...this.deck.dealTurn());
            } else if (street === 'river') {
                this.board.push(...this.deck.dealRiver());
            }
        }
    }

    /** Resolve the pot at showdown or when only one player remains */
    _resolvePot() {
        const active = this.activePlayers;

        if (active.length === 1) {
            // Single winner — no showdown needed
            const winner = active[0];
            winner.stack += this.pot;
            this.state = HAND_STATES.COMPLETE;
            this._recordAction(winner, 'wins', this.pot);
            return { winners: [{ player: winner, amount: this.pot }] };
        }

        // Showdown — evaluate hands
        // Fill board to 5 cards if needed
        while (this.board.length < 5) {
            if (this.presetBoard && this.presetBoard.length > this.board.length) {
                this.board.push(this.presetBoard[this.board.length]);
            } else {
                const card = this.deck.deal(1);
                this.board.push(...card);
            }
        }

        const handResults = active.map(p => ({
            player: p,
            eval: evaluateHand(p.holeCards, this.board),
        }));

        // Sort by hand strength (best first)
        handResults.sort((a, b) => {
            if (a.eval.rank !== b.eval.rank) return b.eval.rank - a.eval.rank;
            for (let i = 0; i < Math.min(a.eval.kickers.length, b.eval.kickers.length); i++) {
                if (a.eval.kickers[i] !== b.eval.kickers[i]) return b.eval.kickers[i] - a.eval.kickers[i];
            }
            return 0;
        });

        // Award pot to winner(s) — simple version (no side pots for now)
        const bestRank = handResults[0].eval.rank;
        const bestKickers = handResults[0].eval.kickers;
        const winners = handResults.filter(h => {
            if (h.eval.rank !== bestRank) return false;
            return h.eval.kickers.every((k, i) => k === bestKickers[i]);
        });

        const share = this.pot / winners.length;
        for (const w of winners) {
            w.player.stack += share;
            this._recordAction(w.player, 'wins', share);
        }

        this.state = HAND_STATES.COMPLETE;

        return {
            winners: winners.map(w => ({
                player: w.player,
                amount: share,
                hand: w.eval,
            })),
            handResults,
        };
    }

    // ●● Valid Actions ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

    /**
     * Get the valid actions for the current player.
     * @returns {{ actions: string[], minBet: number, maxBet: number, callAmount: number }}
     */
    getValidActions() {
        const player = this.currentPlayer;
        if (!player) return { actions: [], minBet: 0, maxBet: 0, callAmount: 0 };

        const callAmount = Math.min(this.currentBet - player.streetInvested, player.stack);
        const actions = [];

        // Can always fold (unless no bet to face)
        if (callAmount > 0) {
            actions.push('fold');
            actions.push('call');
        } else {
            actions.push('check');
        }

        // Can bet if no current bet
        if (this.currentBet === 0 || player.streetInvested >= this.currentBet) {
            if (this.currentBet === 0) {
                actions.push('bet');
            }
        }

        // Can raise if facing a bet
        if (callAmount > 0 && player.stack > callAmount) {
            actions.push('raise');
        }

        // Can always go all-in
        if (player.stack > 0) {
            actions.push('allin');
        }

        return {
            actions,
            minBet: this.currentBet > 0
                ? Math.min(this.currentBet + this.minRaise, player.stack + player.streetInvested)
                : Math.min(this.bbSize, player.stack),
            maxBet: player.stack + player.streetInvested,
            callAmount,
            potSize: this.pot,
        };
    }

    // ●● State Snapshot ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

    /**
     * Get a complete snapshot of the current hand state.
     * This is what the UI reads to render the table.
     */
    getState() {
        const player = this.currentPlayer;
        return {
            state: this.state,
            handNumber: this.handNumber,
            board: [...this.board],
            pot: this.pot,
            currentBet: this.currentBet,
            players: this.players.map(p => ({
                position: p.position,
                stack: p.stack,
                isHero: p.isHero,
                isActive: p.isActive,
                isFolded: p.isFolded,
                isAllIn: p.isAllIn,
                holeCards: p.isHero ? p.holeCards : null, // Only reveal hero cards
                streetInvested: p.streetInvested,
                totalInvested: p.totalInvested,
            })),
            currentPlayer: player ? {
                position: player.position,
                isHero: player.isHero,
            } : null,
            validActions: this.getValidActions(),
            actionHistory: this.actionHistory,
            streetActions: this.streetActions,
        };
    }

    /**
     * Get the showdown result (all hands revealed).
     * Only available after SHOWDOWN/COMPLETE state.
     */
    getShowdownState() {
        if (this.state !== HAND_STATES.COMPLETE && this.state !== HAND_STATES.SHOWDOWN) {
            return null;
        }

        return {
            ...this.getState(),
            players: this.players.map(p => ({
                position: p.position,
                stack: p.stack,
                isHero: p.isHero,
                isActive: p.isActive,
                isFolded: p.isFolded,
                isAllIn: p.isAllIn,
                holeCards: p.holeCards, // Reveal all cards at showdown
                streetInvested: p.streetInvested,
                totalInvested: p.totalInvested,
                handEval: !p.isFolded && p.holeCards
                    ? evaluateHand(p.holeCards, this.board)
                    : null,
            })),
        };
    }
}

export default HandStateMachine;
