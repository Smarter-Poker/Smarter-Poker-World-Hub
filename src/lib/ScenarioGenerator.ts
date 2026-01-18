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
    ActionType
} from '../types/poker';

export class ScenarioGenerator {
    private config: GameConfig;
    private players: Player[];
    private pot: number;
    private actionLog: ActionLogEntry[];
    private buttonSeat: number;
    private heroSeat: number;
    private currentBet: number;
    private timestamp: number;

    constructor(config: GameConfig) {
        this.config = config;
        this.players = [];
        this.pot = 0;
        this.actionLog = [];
        this.buttonSeat = 0;
        this.heroSeat = 0;
        this.currentBet = 0;
        this.timestamp = 0;
    }

    /**
     * 🎲 PUBLIC API: Create a new scenario
     */
    static create(config: GameConfig): Scenario {
        const generator = new ScenarioGenerator(config);
        return generator.generate();
    }

    /**
     * 🎬 Main generation pipeline
     */
    private generate(): Scenario {
        this.initializePlayers();
        this.phaseA_Antes();
        this.phaseB_Blinds();
        this.phaseC_PreflopAction();

        const boardCards = this.generateBoardCards();
        const question = this.generateQuestion();
        const correctAction = this.determineCorrectAction();

        return {
            config: this.config,
            players: this.clonePlayers(),
            buttonSeat: this.buttonSeat,
            heroSeat: this.heroSeat,
            actionLog: [...this.actionLog],
            boardCards,
            finalPot: this.pot,
            question,
            correctAction
        };
    }

    /**
     * 👥 Initialize 9 players with random hero seat
     */
    private initializePlayers(): void {
        this.heroSeat = Math.floor(Math.random() * 9);
        this.buttonSeat = Math.floor(Math.random() * 9);

        const villainNames = [
            'Viking', 'Wizard', 'Ninja', 'Wolf', 'Spartan',
            'Pharaoh', 'Pirate', 'Cowboy', 'Fox'
        ];

        for (let seat = 0; seat < 9; seat++) {
            this.players.push({
                seat,
                name: seat === this.heroSeat ? 'Hero' : villainNames[seat],
                stack: this.config.startStack,
                currentBet: 0,
                isHero: seat === this.heroSeat,
                hasFolded: false
            });
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
        const sbSeat = (this.buttonSeat + 1) % 9;
        const bbSeat = (this.buttonSeat + 2) % 9;
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
     */
    private phaseC_PreflopAction(): void {
        const actionOrder = this.getPreflopActionOrder();
        let actionComplete = false;
        let lastAggressorIndex = -1;

        while (!actionComplete) {
            for (let i = 0; i < actionOrder.length; i++) {
                const seat = actionOrder[i];
                const player = this.players[seat];

                if (player.hasFolded || player.stack === 0) continue;

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

        // Sweep all bets to pot
        this.sweepBetsToPot();
    }

    /**
     * 🔄 Get preflop action order (UTG to Button)
     */
    private getPreflopActionOrder(): number[] {
        const order: number[] = [];
        const utgSeat = (this.buttonSeat + 3) % 9; // UTG is 3 seats after button

        for (let i = 0; i < 9; i++) {
            order.push((utgSeat + i) % 9);
        }

        return order;
    }

    /**
     * 🎲 Get random action for a player
     */
    private getRandomAction(player: Player, needsToAct: boolean): 'FOLD' | 'CALL' | 'RAISE' | 'CHECK' {
        if (!needsToAct) return 'CHECK';

        const rand = Math.random();
        if (rand < 0.3) return 'FOLD';
        if (rand < 0.8) return 'CALL';
        return 'RAISE';
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
            amount,
            newStack,
            newBet,
            potAfter: this.pot,
            timestamp: this.timestamp++
        });
    }

    /**
     * 🃏 Generate random board cards
     */
    private generateBoardCards(): string[] {
        const ranks = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2'];
        const suits = ['♠', '♥', '♦', '♣'];
        const cards: string[] = [];

        while (cards.length < 5) {
            const rank = ranks[Math.floor(Math.random() * ranks.length)];
            const suit = suits[Math.floor(Math.random() * suits.length)];
            const card = rank + suit;
            if (!cards.includes(card)) {
                cards.push(card);
            }
        }

        return cards;
    }

    /**
     * ❓ Generate a question based on the scenario
     */
    private generateQuestion(): string {
        const hero = this.players[this.heroSeat];
        const potSize = this.pot;
        const heroStack = hero.stack;

        return `You are in seat ${this.heroSeat + 1} with ${heroStack} chips. The pot is ${potSize}. What is your best move?`;
    }

    /**
     * ✅ Determine the correct action (simplified for now)
     */
    private determineCorrectAction(): 'FOLD' | 'CALL' | 'RAISE' | 'ALL_IN' {
        // Simplified logic - can be enhanced with GTO solver integration
        const rand = Math.random();
        if (rand < 0.3) return 'FOLD';
        if (rand < 0.6) return 'CALL';
        if (rand < 0.9) return 'RAISE';
        return 'ALL_IN';
    }

    /**
     * 🔄 Clone players array for immutability
     */
    private clonePlayers(): Player[] {
        return this.players.map(p => ({ ...p }));
    }

    /**
     * ✅ Validate scenario mathematical integrity
     */
    static validate(scenario: Scenario): boolean {
        const totalChips = scenario.players.reduce((sum, p) => sum + p.stack + p.currentBet, 0) + scenario.finalPot;
        const expectedTotal = scenario.config.startStack * 9;

        if (Math.abs(totalChips - expectedTotal) > 0.01) {
            console.error('Chip conservation violated!', { totalChips, expectedTotal });
            return false;
        }

        return true;
    }
}
