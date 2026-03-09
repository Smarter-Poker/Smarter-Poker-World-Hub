/**
 * 🏗️ THE ARCHITECT - Scenario Generator
 * 
 * Pure poker math engine that generates mathematically perfect scenarios.
 * Handles all chip calculations, action sequences, and validation.
 * 
 * Key Principles:
 * - Chips move in stages: Stack → CurrentBet → Pot
 * - All math must be exact (no rounding errors)
 * - Total chips always conserved
 * - Returns immutable scenario objects
 */

import type {
    GameConfig,
    Player,
    ActionLogEntry,
    Scenario,
    ActionType,
    TableSize
} from '../types/poker';
import { getBlindPositions, getPreflopActionOrder, getVillainNames } from './SeatLayouts';
import { type GameMode } from './GameManifest';

export class ScenarioGenerator {
    private config: GameConfig;
    private tableSize: TableSize;
    private mode: GameMode | null;
    private players: Player[];
    private pot: number;
    private actionLog: ActionLogEntry[];
    private buttonSeat: number;
    private heroSeat: number;
    private currentBet: number;
    private timestamp: number;
    private heroCards: string[];
    private usedCards: Set<string>;

    constructor(config: GameConfig, mode?: GameMode) {
        this.config = config;
        this.mode = mode || null;
        this.tableSize = mode?.tableSize || config.tableSize || 9;
        this.players = [];
        this.pot = 0;
        this.actionLog = [];
        this.buttonSeat = 0;
        this.heroSeat = 0;
        this.currentBet = 0;
        this.timestamp = 0;
        this.heroCards = [];
        this.usedCards = new Set();
    }

    /**
     * 🎲 PUBLIC API: Create a new scenario
     */
    static create(config: GameConfig, mode?: GameMode): Scenario {
        const generator = new ScenarioGenerator(config, mode);
        return generator.generate();
    }

    /**
     * 🎬 Main generation pipeline
     */
    private generate(): Scenario {
        this.initializePlayers();
        this.heroCards = this.dealHeroCards();
        this.phaseA_Antes();
        this.phaseB_Blinds();
        this.phaseC_PreflopAction();

        const boardCards = this.generateBoardCards();
        const correctAction = this.determineCorrectAction(boardCards);
        const question = this.generateQuestion();

        return {
            config: this.config,
            tableSize: this.tableSize,
            players: this.clonePlayers(),
            buttonSeat: this.buttonSeat,
            heroSeat: this.heroSeat,
            actionLog: [...this.actionLog],
            boardCards,
            heroCards: [...this.heroCards],
            finalPot: this.pot,
            question,
            correctAction
        };
    }

    /**
     * 👥 Initialize players based on table size and mode
     */
    private initializePlayers(): void {
        const playerCount = this.tableSize;

        // Determine hero seat based on forced position
        this.heroSeat = this.calculateHeroSeat(playerCount);
        this.buttonSeat = this.calculateButtonSeat(playerCount);

        // Get stack size from mode or config
        const stackSize = this.mode?.startingStack
            ? this.mode.startingStack * this.config.bigBlind
            : this.config.startStack;

        const villainNames = getVillainNames(this.tableSize);

        for (let seat = 0; seat < playerCount; seat++) {
            this.players.push({
                seat,
                name: seat === this.heroSeat ? 'Hero' : villainNames[seat - 1] || `Villain ${seat}`,
                stack: stackSize,
                startingStack: stackSize,
                currentBet: 0,
                isHero: seat === this.heroSeat,
                hasFolded: false
            });
        }
    }

    /**
     * 📍 Calculate hero seat based on forced position
     */
    private calculateHeroSeat(playerCount: number): number {
        if (!this.mode?.forcedPosition) {
            return 0; // Default: hero at seat 0
        }

        // For forced positions, we need to set button first, then calculate hero
        const tempButton = Math.floor(Math.random() * playerCount);

        switch (this.mode.forcedPosition) {
            case 'button':
                return tempButton;
            case 'sb':
                return this.tableSize === 2 ? tempButton : (tempButton + 1) % playerCount;
            case 'bb':
                return this.tableSize === 2 ? (tempButton + 1) % playerCount : (tempButton + 2) % playerCount;
            case 'cutoff':
                return (tempButton + playerCount - 1) % playerCount;
            case 'any':
            default:
                return 0;
        }
    }

    /**
     * 🎯 Calculate button seat based on hero position and mode
     */
    private calculateButtonSeat(playerCount: number): number {
        if (!this.mode?.forcedPosition) {
            return Math.floor(Math.random() * playerCount);
        }

        // Button position is derived from hero position for forced positions
        switch (this.mode.forcedPosition) {
            case 'button':
                return this.heroSeat;
            case 'sb':
                return this.tableSize === 2 ? this.heroSeat : (this.heroSeat + playerCount - 1) % playerCount;
            case 'bb':
                return this.tableSize === 2 ? (this.heroSeat + playerCount - 1) % playerCount : (this.heroSeat + playerCount - 2) % playerCount;
            case 'cutoff':
                return (this.heroSeat + 1) % playerCount;
            case 'any':
            default:
                return Math.floor(Math.random() * playerCount);
        }
    }

    /**
     * 💰 PHASE A: Collect antes from all players
     */
    private phaseA_Antes(): void {
        if (this.config.ante === 0) return;

        for (const player of this.players) {
            const anteAmount = Math.min(this.config.ante, player.stack);
            player.stack -= anteAmount;
            this.pot += anteAmount;

            this.logAction('ANTE', player.seat, anteAmount, player.stack, 0);
        }
    }

    /**
     * 🎯 PHASE B: Post small blind and big blind
     */
    private phaseB_Blinds(): void {
        const { sbSeat, bbSeat } = getBlindPositions(this.tableSize, this.buttonSeat);
        const sbPlayer = this.players[sbSeat];
        const bbPlayer = this.players[bbSeat];

        // Small Blind
        const sbAmount = Math.min(this.config.bigBlind / 2, sbPlayer.stack);
        sbPlayer.stack -= sbAmount;
        sbPlayer.currentBet = sbAmount;
        this.logAction('BLIND_SB', sbSeat, sbAmount, sbPlayer.stack, sbAmount);

        // Big Blind
        const bbAmount = Math.min(this.config.bigBlind, bbPlayer.stack);
        bbPlayer.stack -= bbAmount;
        bbPlayer.currentBet = bbAmount;
        this.currentBet = bbAmount;
        this.logAction('BLIND_BB', bbSeat, bbAmount, bbPlayer.stack, bbAmount);
    }

    /**
     * 🃏 PHASE C: Generate preflop action sequence
     * Safety cap: max 50 iterations to prevent infinite loops
     */
    private phaseC_PreflopAction(): void {
        const actionOrder = this.getPreflopActionOrder();
        let actionComplete = false;
        let lastAggressorIndex = -1;
        let iterations = 0;
        const MAX_ITERATIONS = 50;

        while (!actionComplete && iterations < MAX_ITERATIONS) {
            iterations++;

            for (let i = 0; i < actionOrder.length; i++) {
                const seat = actionOrder[i];
                const player = this.players[seat];

                if (player.hasFolded || player.stack === 0) continue;

                // Skip hero — hero's decision is the user's choice
                if (player.isHero) continue;

                // Determine valid actions
                const needsToAct = player.currentBet < this.currentBet;

                if (!needsToAct && i > lastAggressorIndex) {
                    // Can check
                    this.logAction('CHECK', seat, 0, player.stack, player.currentBet);
                    continue;
                }

                // Random action: fold, call, or raise
                const action = this.getRandomAction(player, needsToAct);

                if (action === 'FOLD') {
                    player.hasFolded = true;
                    this.logAction('FOLD', seat, 0, player.stack, player.currentBet);
                } else if (action === 'CALL') {
                    const callAmount = this.currentBet - player.currentBet;
                    const actualCall = Math.min(callAmount, player.stack);
                    player.stack -= actualCall;
                    player.currentBet += actualCall;
                    this.logAction('CALL', seat, actualCall, player.stack, player.currentBet);
                } else if (action === 'RAISE') {
                    const raiseSize = this.currentBet * 2.5; // 2.5x raise
                    const raiseAmount = raiseSize - player.currentBet;
                    const actualRaise = Math.min(raiseAmount, player.stack);
                    player.stack -= actualRaise;
                    player.currentBet += actualRaise;
                    this.currentBet = player.currentBet;
                    lastAggressorIndex = i;
                    this.logAction('RAISE', seat, actualRaise, player.stack, player.currentBet);
                }
            }

            // Check if action is complete (everyone has acted and matched current bet or folded)
            actionComplete = this.isActionComplete(actionOrder, lastAggressorIndex);
        }

        if (iterations >= MAX_ITERATIONS) {
            console.warn('⚠️ ScenarioGenerator: Hit iteration safety cap in phaseC_PreflopAction');
        }

        // Sweep all bets to pot
        this.sweepBetsToPot();
    }

    /**
     * 🔄 Get preflop action order based on table size
     */
    private getPreflopActionOrder(): number[] {
        return getPreflopActionOrder(this.tableSize, this.buttonSeat);
    }

    /**
     * 🎲 Get random action for a player (adjusted by table size)
     */
    private getRandomAction(player: Player, needsToAct: boolean): 'FOLD' | 'CALL' | 'RAISE' | 'CHECK' {
        if (!needsToAct) return 'CHECK';

        // Adjust action frequencies by table size
        // Heads-Up: More aggressive (wider ranges)
        // 6-Max: Aggressive
        // Full Ring: Tighter play
        const rand = Math.random();

        if (this.tableSize === 2) {
            // Heads-Up: Very aggressive
            if (rand < 0.15) return 'FOLD';
            if (rand < 0.5) return 'CALL';
            return 'RAISE';
        } else if (this.tableSize === 6) {
            // 6-Max: Aggressive
            if (rand < 0.2) return 'FOLD';
            if (rand < 0.6) return 'CALL';
            return 'RAISE';
        } else {
            // Full Ring: Standard/tight
            if (rand < 0.3) return 'FOLD';
            if (rand < 0.8) return 'CALL';
            return 'RAISE';
        }
    }

    /**
     * ✅ Check if action round is complete
     */
    private isActionComplete(actionOrder: number[], lastAggressorIndex: number): boolean {
        const activePlayers = this.players.filter(p => !p.hasFolded && p.stack > 0);

        if (activePlayers.length <= 1) return true;

        // Everyone has matched the current bet or is all-in
        return activePlayers.every(p =>
            p.currentBet === this.currentBet || p.stack === 0
        );
    }

    /**
     * 💸 Sweep all current bets into the pot
     */
    private sweepBetsToPot(): void {
        for (const player of this.players) {
            if (player.currentBet > 0) {
                this.pot += player.currentBet;
                this.logAction('POT_SWEEP', player.seat, player.currentBet, player.stack, 0);
                player.currentBet = 0;
            }
        }
    }

    /**
     * 📝 Log an action with current state
     */
    private logAction(
        type: ActionType,
        seat: number,
        amount: number,
        newStack: number,
        newBet: number
    ): void {
        this.actionLog.push({
            type,
            player: seat,
            playerSeat: seat,
            amount,
            newStack,
            newBet,
            potAfter: this.pot,
            timestamp: this.timestamp++
        });
    }

    /**
     * 🃏 Deal 2 hole cards to the hero (unique, not duplicated on the board)
     */
    private dealHeroCards(): string[] {
        const ranks = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2'];
        const suits = ['♠', '♥', '♦', '♣'];
        const cards: string[] = [];

        while (cards.length < 2) {
            const rank = ranks[Math.floor(Math.random() * ranks.length)];
            const suit = suits[Math.floor(Math.random() * suits.length)];
            const card = rank + suit;
            if (!this.usedCards.has(card)) {
                cards.push(card);
                this.usedCards.add(card);
            }
        }

        return cards;
    }

    /**
     * 🃏 Generate random board cards (unique, not duplicating hero cards)
     */
    private generateBoardCards(): string[] {
        const ranks = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2'];
        const suits = ['♠', '♥', '♦', '♣'];
        const cards: string[] = [];

        while (cards.length < 5) {
            const rank = ranks[Math.floor(Math.random() * ranks.length)];
            const suit = suits[Math.floor(Math.random() * suits.length)];
            const card = rank + suit;
            if (!this.usedCards.has(card)) {
                cards.push(card);
                this.usedCards.add(card);
            }
        }

        return cards;
    }

    /**
     * ❓ Generate a context-aware question based on the scenario
     */
    private generateQuestion(): string {
        const hero = this.players[this.heroSeat];
        const potSize = this.pot;
        const heroStack = hero.stack;
        const heroCards = this.heroCards.join(' ');

        // Describe what happened before hero's turn
        const raisers = this.actionLog.filter(a => a.type === 'RAISE' && a.playerSeat !== this.heroSeat);
        const callers = this.actionLog.filter(a => a.type === 'CALL' && a.playerSeat !== this.heroSeat);

        let context = '';
        if (raisers.length > 0) {
            const lastRaise = raisers[raisers.length - 1];
            const raiserName = this.players[lastRaise.playerSeat]?.name || 'Villain';
            context = `${raiserName} raised to ${lastRaise.newBet}. `;
            if (callers.length > 0) {
                context += `${callers.length} player${callers.length > 1 ? 's' : ''} called. `;
            }
        } else if (callers.length > 0) {
            context = `${callers.length} limper${callers.length > 1 ? 's' : ''} entered the pot. `;
        }

        return `You hold ${heroCards} with ${heroStack} chips. ${context}The pot is ${potSize}. What is your best move?`;
    }

    /**
     * ✅ Determine the correct action based on actual hand strength
     *
     * Uses a multi-factor evaluation:
     * 1. Raw card rank strength (high cards, pairs)
     * 2. Suitedness bonus (flush draw potential)
     * 3. Connectivity bonus (straight draw potential)
     * 4. Position adjustment
     * 5. Pot odds and stack-to-pot ratio
     */
    private determineCorrectAction(boardCards: string[]): 'FOLD' | 'CALL' | 'RAISE' | 'ALL_IN' {
        const hero = this.players[this.heroSeat];
        const strength = this.evaluateHandStrength(this.heroCards, boardCards);
        const spr = hero.stack / Math.max(this.pot, 1); // Stack-to-pot ratio
        const facingRaise = this.currentBet > this.config.bigBlind;

        // Position factor: being in later position is advantageous
        const { sbSeat, bbSeat } = getBlindPositions(this.tableSize, this.buttonSeat);
        const isInPosition = this.heroSeat === this.buttonSeat;
        const isInBlinds = this.heroSeat === sbSeat || this.heroSeat === bbSeat;
        const positionBonus = isInPosition ? 0.1 : (isInBlinds ? -0.05 : 0);

        const adjustedStrength = Math.min(1, strength + positionBonus);

        // Very short stack → push/fold mode
        if (spr < 3) {
            if (adjustedStrength >= 0.55) return 'ALL_IN';
            if (adjustedStrength >= 0.35 && !facingRaise) return 'ALL_IN';
            return 'FOLD';
        }

        // Facing a raise
        if (facingRaise) {
            if (adjustedStrength >= 0.75) return 'RAISE';  // Premium → 3-bet
            if (adjustedStrength >= 0.45) return 'CALL';   // Playable → call
            return 'FOLD';                                  // Weak → fold
        }

        // Open spot (no raise yet)
        if (adjustedStrength >= 0.65) return 'RAISE';  // Strong → open raise
        if (adjustedStrength >= 0.40) return 'CALL';   // Marginal → limp/call
        return 'FOLD';                                  // Weak → fold
    }

    /**
     * 📊 Evaluate hand strength on a 0-1 scale
     * Considers: high card rank, pairs, suitedness, connectivity, board interaction
     */
    private evaluateHandStrength(heroCards: string[], boardCards: string[]): number {
        const RANK_VALUES: Record<string, number> = {
            'A': 14, 'K': 13, 'Q': 12, 'J': 11, 'T': 10,
            '9': 9, '8': 8, '7': 7, '6': 6, '5': 5, '4': 4, '3': 3, '2': 2
        };

        if (heroCards.length < 2) return 0.3;

        const r1 = heroCards[0][0];
        const r2 = heroCards[1][0];
        const s1 = heroCards[0].slice(1);
        const s2 = heroCards[1].slice(1);

        const v1 = RANK_VALUES[r1] || 5;
        const v2 = RANK_VALUES[r2] || 5;
        const highCard = Math.max(v1, v2);
        const lowCard = Math.min(v1, v2);

        let score = 0;

        // 1. Base rank strength (0-0.5)
        // Average rank normalized to 0-1, weighted toward high cards
        score += ((highCard + lowCard) / 28) * 0.35;

        // 2. Pair bonus (0-0.25)
        if (r1 === r2) {
            // Pocket pair — strength scales with rank
            score += 0.15 + (highCard / 14) * 0.15;
        }

        // 3. Suitedness bonus (0-0.08)
        const isSuited = s1 === s2;
        if (isSuited) {
            score += 0.08;
        }

        // 4. Connectivity bonus (0-0.07)
        const gap = Math.abs(v1 - v2);
        if (gap === 1) score += 0.07;      // Connectors (e.g., 9T)
        else if (gap === 2) score += 0.04; // One-gappers (e.g., 9J)
        else if (gap === 3) score += 0.02; // Two-gappers

        // 5. Broadway bonus — both cards T or higher
        if (v1 >= 10 && v2 >= 10) {
            score += 0.05;
        }

        // 6. Ace bonus (kicker matters)
        if (r1 === 'A' || r2 === 'A') {
            score += 0.06;
        }

        // 7. Board interaction (basic — check for pairs on board)
        if (boardCards.length >= 3) {
            const boardRanks = boardCards.map(c => c[0]);
            const boardSuits = boardCards.map(c => c.slice(1));

            // Paired with board
            if (boardRanks.includes(r1)) score += 0.12;
            if (boardRanks.includes(r2)) score += 0.10;

            // Flush draw (3+ same suit on board + hero)
            if (isSuited) {
                const suitCount = boardSuits.filter(s => s === s1).length;
                if (suitCount >= 2) score += 0.08; // Flush draw
                if (suitCount >= 3) score += 0.10; // Made flush
            }
        }

        return Math.min(1, Math.max(0, score));
    }

    /**
     * 🔄 Clone players array for immutability
     */
    private clonePlayers(): Player[] {
        return this.players.map(p => ({ ...p }));
    }

    /**
     * ✅ Validate scenario mathematical integrity
     * Uses actual player count instead of hardcoded 9
     */
    static validate(scenario: Scenario): boolean {
        const totalChips = scenario.players.reduce((sum, p) => sum + p.stack + p.currentBet, 0) + scenario.finalPot;
        const expectedTotal = scenario.config.startStack * scenario.players.length;

        if (Math.abs(totalChips - expectedTotal) > 0.01) {
            console.error('Chip conservation violated!', { totalChips, expectedTotal, playerCount: scenario.players.length });
            return false;
        }

        // Validate hero cards exist
        if (!scenario.heroCards || scenario.heroCards.length !== 2) {
            console.error('Hero cards missing or invalid!', scenario.heroCards);
            return false;
        }

        // Validate no duplicate cards between hero and board
        const allCards = [...scenario.heroCards, ...scenario.boardCards];
        const uniqueCards = new Set(allCards);
        if (uniqueCards.size !== allCards.length) {
            console.error('Duplicate cards detected!', allCards);
            return false;
        }

        return true;
    }
}
