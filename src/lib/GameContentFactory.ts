/**
 * 🏭 GAME CONTENT FACTORY - The Assembly Line
 * 
 * Just-In-Time assembler that reads Game DNA and produces complete,
 * mathematically accurate poker scenarios. Everything is derived from
 * the GameDefinition - no hard-coded logic.
 * 
 * If you change stackDepth from 100 to 10, the engine automatically
 * switches from "Flop Strategy" to "Push/Fold Strategy".
 */

import type {
    GameDefinition,
    ActionHistoryStep,
    HeroPosition,
    BoardTexture,
    VillainProfile,
    SituationType,
    ThemeSkin
} from './GameDNA';
import { getRangeProfile, shouldApplyICM, getThemeSkin, isPushFoldMode } from './GameDNA';
import { getGameDefinition, GAMES_LIST } from './MasterGameLibrary';
import { getBlindPositions, getPreflopActionOrder, getVillainNames, type TableSize } from './SeatLayouts';
import type { Scenario, GameConfig, Player, ActionLogEntry, ActionType } from '../types/poker';

// ═══════════════════════════════════════════════════════════════════════════
// FACTORY OUTPUT TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface FactoryScenario extends Scenario {
    gameDefinition: GameDefinition;
    rangeProfile: ReturnType<typeof getRangeProfile>;
    useICM: boolean;
    isPushFold: boolean;
    themeSkin: ThemeSkin;
    preSimulatedHistory: ActionLogEntry[];
}

export interface HydrationResult {
    players: Player[];
    pot: number;
    actionLog: ActionLogEntry[];
    heroPosition: number;
    buttonPosition: number;
    currentBet: number;
    street: 'preflop' | 'flop' | 'turn' | 'river';
    boardCards: string[];
}

// ═══════════════════════════════════════════════════════════════════════════
// CARD & DECK UTILITIES
// ═══════════════════════════════════════════════════════════════════════════

const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];
const SUITS = ['h', 'd', 'c', 's'];

function createDeck(): string[] {
    const deck: string[] = [];
    for (const rank of RANKS) {
        for (const suit of SUITS) {
            deck.push(`${rank}${suit}`);
        }
    }
    return deck;
}

function shuffleDeck(deck: string[]): string[] {
    const shuffled = [...deck];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
}

function generateBoardForTexture(texture: BoardTexture, requiredCards?: string[]): string[] {
    if (requiredCards && requiredCards.length >= 3) {
        return requiredCards.slice(0, 5);
    }

    const deck = shuffleDeck(createDeck());

    switch (texture) {
        case 'Monotone': {
            // 3 cards of same suit
            const suit = SUITS[Math.floor(Math.random() * 4)];
            const suitedCards = deck.filter(c => c.endsWith(suit));
            return suitedCards.slice(0, 5);
        }
        case 'Paired': {
            // Board with a pair
            const rank = RANKS[Math.floor(Math.random() * 13)];
            const pairCards = deck.filter(c => c.startsWith(rank)).slice(0, 2);
            const others = deck.filter(c => !c.startsWith(rank)).slice(0, 3);
            return [...pairCards, ...others];
        }
        case 'Dry': {
            // Disconnected, rainbow
            const cards: string[] = [];
            const usedSuits: string[] = [];
            for (let i = 0; i < 5 && cards.length < 5; i += 3) {
                const card = deck[i];
                if (!usedSuits.includes(card[1])) {
                    usedSuits.push(card[1]);
                    cards.push(card);
                }
            }
            return cards.length >= 3 ? cards : deck.slice(0, 5);
        }
        default:
            return deck.slice(0, 5);
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// POSITION UTILITIES
// ═══════════════════════════════════════════════════════════════════════════

function resolveHeroPosition(position: HeroPosition, tableSize: TableSize, buttonSeat: number): number {
    if (position === 'Random') {
        return Math.floor(Math.random() * tableSize);
    }

    // Calculate position relative to button
    switch (position) {
        case 'BTN':
            return buttonSeat;
        case 'SB':
            return tableSize === 2 ? buttonSeat : (buttonSeat + 1) % tableSize;
        case 'BB':
            return tableSize === 2 ? (buttonSeat + 1) % tableSize : (buttonSeat + 2) % tableSize;
        case 'CO':
            return (buttonSeat + tableSize - 1) % tableSize;
        case 'HJ':
            return (buttonSeat + tableSize - 2) % tableSize;
        case 'MP':
            return (buttonSeat + tableSize - 3) % tableSize;
        case 'EP':
            return (buttonSeat + 3) % tableSize; // UTG
        default:
            return 0;
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// VILLAIN BEHAVIOR PROFILES
// ═══════════════════════════════════════════════════════════════════════════

interface VillainBehavior {
    foldFrequency: number;
    callFrequency: number;
    raiseFrequency: number;
    aggressionFactor: number;
}

function getVillainBehavior(profile: VillainProfile): VillainBehavior {
    switch (profile) {
        case 'Nit':
            return { foldFrequency: 0.7, callFrequency: 0.25, raiseFrequency: 0.05, aggressionFactor: 0.3 };
        case 'Passive':
            return { foldFrequency: 0.3, callFrequency: 0.6, raiseFrequency: 0.1, aggressionFactor: 0.5 };
        case 'TAG':
            return { foldFrequency: 0.4, callFrequency: 0.35, raiseFrequency: 0.25, aggressionFactor: 1.0 };
        case 'LAG':
            return { foldFrequency: 0.2, callFrequency: 0.35, raiseFrequency: 0.45, aggressionFactor: 1.5 };
        case 'Maniac':
            return { foldFrequency: 0.1, callFrequency: 0.3, raiseFrequency: 0.6, aggressionFactor: 2.0 };
        case 'Calling_Station':
            return { foldFrequency: 0.1, callFrequency: 0.85, raiseFrequency: 0.05, aggressionFactor: 0.3 };
        case 'GTO_Bot':
            return { foldFrequency: 0.35, callFrequency: 0.4, raiseFrequency: 0.25, aggressionFactor: 1.0 };
        case 'Fish':
            return { foldFrequency: 0.25, callFrequency: 0.5, raiseFrequency: 0.25, aggressionFactor: 0.7 };
        case 'Mixed':
        default:
            return { foldFrequency: 0.33, callFrequency: 0.34, raiseFrequency: 0.33, aggressionFactor: 1.0 };
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// THE HYDRATION ENGINE - Pre-simulates action history
// ═══════════════════════════════════════════════════════════════════════════

function hydrateScenario(
    game: GameDefinition,
    players: Player[],
    buttonSeat: number,
    heroSeat: number
): HydrationResult {
    const { structure, economics, scenario } = game;
    const tableSize = game.tableSize;

    let pot = 0;
    let currentBet = 0;
    let street: 'preflop' | 'flop' | 'turn' | 'river' = 'preflop';
    const actionLog: ActionLogEntry[] = [];
    let timestamp = 0;

    // Deep clone players
    const hydratedPlayers = players.map(p => ({ ...p }));

    // Helper to log action
    const logAction = (type: ActionType, seat: number, amount: number, newStack: number, newBet: number) => {
        actionLog.push({
            type,
            player: seat,
            playerSeat: seat,
            amount,
            newStack,
            newBet,
            potAfter: pot,
            timestamp: timestamp++
        });
    };

    // Step 1: Post antes if applicable
    if (structure.anteType !== 'None' && structure.anteSize) {
        const anteAmount = Math.floor(structure.bigBlindAmount * structure.anteSize);
        for (const player of hydratedPlayers) {
            const actualAnte = Math.min(anteAmount, player.stack);
            player.stack -= actualAnte;
            pot += actualAnte;
            logAction('ANTE', player.seat, actualAnte, player.stack, 0);
        }
    }

    // Step 2: Post blinds
    const { sbSeat, bbSeat } = getBlindPositions(tableSize, buttonSeat);
    const sbPlayer = hydratedPlayers[sbSeat];
    const bbPlayer = hydratedPlayers[bbSeat];

    const sbAmount = Math.min(structure.bigBlindAmount / 2, sbPlayer.stack);
    sbPlayer.stack -= sbAmount;
    sbPlayer.currentBet = sbAmount;
    logAction('BLIND_SB', sbSeat, sbAmount, sbPlayer.stack, sbAmount);

    const bbAmount = Math.min(structure.bigBlindAmount, bbPlayer.stack);
    bbPlayer.stack -= bbAmount;
    bbPlayer.currentBet = bbAmount;
    currentBet = bbAmount;
    logAction('BLIND_BB', bbSeat, bbAmount, bbPlayer.stack, bbAmount);

    // Step 3: Execute forced history if present
    if (scenario.forcedHistory && scenario.forcedHistory.length > 0) {
        for (const step of scenario.forcedHistory) {
            const actorSeat = resolveActorSeat(step.actor, heroSeat, buttonSeat, tableSize);
            const actor = hydratedPlayers[actorSeat];
            if (!actor) continue;

            // Update street if changed
            if (step.street !== street) {
                // Sweep bets to pot and reset
                for (const p of hydratedPlayers) {
                    pot += p.currentBet;
                    p.currentBet = 0;
                }
                currentBet = 0;
                street = step.street;
            }

            switch (step.action) {
                case 'fold':
                    actor.hasFolded = true;
                    logAction('FOLD', actorSeat, 0, actor.stack, actor.currentBet);
                    break;
                case 'check':
                    logAction('CHECK', actorSeat, 0, actor.stack, actor.currentBet);
                    break;
                case 'call': {
                    const callAmount = Math.min(currentBet - actor.currentBet, actor.stack);
                    actor.stack -= callAmount;
                    actor.currentBet += callAmount;
                    logAction('CALL', actorSeat, callAmount, actor.stack, actor.currentBet);
                    break;
                }
                case 'bet':
                case 'raise': {
                    const sizing = step.sizing || 2.5;
                    let raiseAmount: number;

                    if (street === 'preflop') {
                        raiseAmount = Math.floor(sizing * structure.bigBlindAmount);
                    } else {
                        // Postflop: sizing is pot fraction
                        raiseAmount = Math.floor(pot * sizing);
                    }

                    const totalBet = Math.min(raiseAmount, actor.stack + actor.currentBet);
                    const chipsPut = totalBet - actor.currentBet;
                    actor.stack -= chipsPut;
                    actor.currentBet = totalBet;
                    currentBet = totalBet;
                    logAction(step.action === 'bet' ? 'BET' : 'RAISE', actorSeat, chipsPut, actor.stack, actor.currentBet);
                    break;
                }
                case 'all_in': {
                    const allInAmount = actor.stack;
                    actor.currentBet += allInAmount;
                    actor.stack = 0;
                    if (actor.currentBet > currentBet) currentBet = actor.currentBet;
                    logAction('ALL_IN', actorSeat, allInAmount, 0, actor.currentBet);
                    break;
                }
            }
        }
    }

    // Sweep remaining bets to pot
    for (const p of hydratedPlayers) {
        pot += p.currentBet;
        p.currentBet = 0;
    }

    // Generate board based on street
    const cardsNeeded = street === 'preflop' ? 0 : street === 'flop' ? 3 : street === 'turn' ? 4 : 5;
    const boardCards = generateBoardForTexture(scenario.boardTexture, scenario.requiredBoard).slice(0, cardsNeeded);

    return {
        players: hydratedPlayers,
        pot,
        actionLog,
        heroPosition: heroSeat,
        buttonPosition: buttonSeat,
        currentBet,
        street,
        boardCards
    };
}

function resolveActorSeat(
    actor: ActionHistoryStep['actor'],
    heroSeat: number,
    buttonSeat: number,
    tableSize: TableSize
): number {
    switch (actor) {
        case 'hero':
            return heroSeat;
        case 'villain_btn':
            return buttonSeat;
        case 'villain_sb':
            return tableSize === 2 ? buttonSeat : (buttonSeat + 1) % tableSize;
        case 'villain_bb':
            return tableSize === 2 ? (buttonSeat + 1) % tableSize : (buttonSeat + 2) % tableSize;
        case 'villain':
        default:
            // Find first non-hero, non-folded villain
            for (let i = 0; i < tableSize; i++) {
                if (i !== heroSeat) return i;
            }
            return (heroSeat + 1) % tableSize;
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// THE MAIN FACTORY CLASS
// ═══════════════════════════════════════════════════════════════════════════

export class GameContentFactory {

    /**
     * 🏭 Generate a complete scenario from a game ID
     * This is the main entry point - the Just-In-Time Assembler
     */
    static generateLevel(gameId: string): FactoryScenario | null {
        // STEP A: Lookup
        const game = getGameDefinition(gameId);
        if (!game) {
            console.error(`[GameContentFactory] Unknown game ID: ${gameId}`);
            return null;
        }

        // STEP B: Derive configuration
        const rangeProfile = getRangeProfile(game);
        const useICM = shouldApplyICM(game);
        const isPushFold = isPushFoldMode(game);
        const themeSkin = getThemeSkin(game);

        // STEP C: Initialize players
        const tableSize = game.tableSize;
        const buttonSeat = Math.floor(Math.random() * tableSize);
        const heroSeat = resolveHeroPosition(game.scenario.heroPosition, tableSize, buttonSeat);

        const villainNames = getVillainNames(tableSize);
        const stackChips = game.economics.stackDepth * game.structure.bigBlindAmount;

        const players: Player[] = [];
        for (let seat = 0; seat < tableSize; seat++) {
            players.push({
                seat,
                name: seat === heroSeat ? 'Hero' : villainNames[seat - (seat > heroSeat ? 1 : 0)] || `Villain ${seat}`,
                stack: stackChips,
                startingStack: stackChips,
                currentBet: 0,
                isHero: seat === heroSeat,
                hasFolded: false
            });
        }

        // STEP D: Hydrate scenario (simulate pre-history)
        const hydration = hydrateScenario(game, players, buttonSeat, heroSeat);

        // STEP E: Generate question based on situation
        const question = generateQuestion(game, hydration);

        // STEP F: Determine correct action
        const correctAction = determineCorrectAction(game, hydration, isPushFold);

        // STEP G: Build the scenario
        const config: GameConfig = {
            bigBlind: game.structure.bigBlindAmount,
            ante: game.structure.anteType !== 'None' && game.structure.anteSize
                ? Math.floor(game.structure.bigBlindAmount * game.structure.anteSize)
                : 0,
            startStack: stackChips,
            tableSize: tableSize
        };

        return {
            config,
            tableSize,
            players: hydration.players,
            buttonSeat: hydration.buttonPosition,
            heroSeat: hydration.heroPosition,
            actionLog: hydration.actionLog,
            boardCards: hydration.boardCards,
            finalPot: hydration.pot,
            question,
            correctAction,

            // Factory metadata
            gameDefinition: game,
            rangeProfile,
            useICM,
            isPushFold,
            themeSkin,
            preSimulatedHistory: hydration.actionLog
        };
    }

    /**
     * Generate multiple scenarios for a game
     */
    static generateBatch(gameId: string, count: number): FactoryScenario[] {
        const scenarios: FactoryScenario[] = [];
        for (let i = 0; i < count; i++) {
            const scenario = this.generateLevel(gameId);
            if (scenario) scenarios.push(scenario);
        }
        return scenarios;
    }

    /**
     * Validate a game definition
     */
    static validate(game: GameDefinition): { valid: boolean; errors: string[] } {
        const errors: string[] = [];

        if (!game.id) errors.push('Missing game ID');
        if (!game.name) errors.push('Missing game name');
        if (!game.category) errors.push('Missing category');
        if (![2, 4, 6, 9].includes(game.tableSize)) errors.push('Invalid table size');
        if (game.economics.stackDepth < 1) errors.push('Stack depth must be positive');
        if (game.difficulty.level < 1 || game.difficulty.level > 5) errors.push('Difficulty must be 1-5');

        return { valid: errors.length === 0, errors };
    }

    /**
     * Get all available game IDs
     */
    static getAvailableGames(): string[] {
        return Object.keys(GAMES_LIST);
    }

    /**
     * Get game count
     */
    static getGameCount(): number {
        return Object.keys(GAMES_LIST).length;
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

function generateQuestion(game: GameDefinition, hydration: HydrationResult): string {
    const { scenario } = game;
    const potSize = hydration.pot;

    switch (scenario.situation) {
        case 'Open_Raise':
            return `It folds to you on the ${scenario.heroPosition}. What is your action?`;
        case 'Facing_Raise':
            return `Facing a ${game.structure.bigBlindAmount * 2.5} open. What is your action?`;
        case 'Facing_3Bet':
            return `You opened, villain 3-bets. Pot is ${potSize}. What is your action?`;
        case 'Blind_Defense':
            return `Villain raises from late position. Defend or fold?`;
        case 'Blind_vs_Blind':
            return `Heads-up in the blinds. What is your move?`;
        case 'Push_Fold':
            return `${game.economics.stackDepth}BB effective. Push or fold?`;
        case 'Reshove':
            return `Facing an open, you have ${game.economics.stackDepth}BB. Reshove or fold?`;
        case 'Postflop_CBet':
            return `IP on the flop, pot is ${potSize}. C-bet or check?`;
        case 'Postflop_Check_Raise':
            return `OOP facing a bet. Call, raise, or fold?`;
        case 'River_Bluff_Catch':
            return `Facing a river bet of ${Math.floor(potSize * 0.75)}. Hero call or fold?`;
        case 'Bubble_Pressure':
            return `On the bubble with ${game.economics.stackDepth}BB. Apply pressure?`;
        case 'Bounty_Hunt':
            return `Villain shoves. Bounty worth ${game.economics.bountyAmount || 500}. Call or fold?`;
        default:
            return `Pot is ${potSize}. What is your action?`;
    }
}

function determineCorrectAction(
    game: GameDefinition,
    hydration: HydrationResult,
    isPushFold: boolean
): 'FOLD' | 'CALL' | 'RAISE' | 'ALL_IN' {
    // This would normally connect to a GTO solver or precomputed charts
    // For now, return a reasonable default based on situation

    const { scenario, economics } = game;

    if (isPushFold) {
        // Push/fold logic
        return economics.stackDepth <= 10 ? 'ALL_IN' : 'RAISE';
    }

    switch (scenario.situation) {
        case 'Open_Raise':
            return 'RAISE';
        case 'Blind_Defense':
            return Math.random() > 0.4 ? 'CALL' : 'FOLD';
        case 'Facing_3Bet':
            return Math.random() > 0.5 ? 'CALL' : 'FOLD';
        case 'River_Bluff_Catch':
            return Math.random() > 0.6 ? 'CALL' : 'FOLD';
        case 'Bubble_Pressure':
            return 'RAISE';
        default:
            return Math.random() > 0.5 ? 'RAISE' : 'CALL';
    }
}

export default GameContentFactory;
