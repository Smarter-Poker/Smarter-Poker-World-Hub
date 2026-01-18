/**
 * 🎯 POKER TYPE DEFINITIONS
 * Shared types for The Architect and The Director
 */

export type TableSize = 9 | 6 | 4 | 2;

export interface GameConfig {
    bigBlind: number;
    ante: number;
    startStack: number;
    tableSize?: TableSize; // 9-max, 6-max, 4-max, or heads-up
}

export interface Player {
    seat: number;
    name: string;
    stack: number;
    startingStack: number;
    currentBet: number;
    isHero: boolean;
    hasFolded: boolean;
}

export type ActionType =
    | 'ANTE'
    | 'BLIND_SB'
    | 'BLIND_BB'
    | 'FOLD'
    | 'CALL'
    | 'RAISE'
    | 'BET'
    | 'ALL_IN'
    | 'CHECK'
    | 'POT_SWEEP';

export interface ActionLogEntry {
    type: ActionType;
    player: number; // seat number (deprecated, use playerSeat)
    playerSeat: number; // seat number
    amount: number;
    newStack: number;
    newBet: number;
    potAfter: number;
    timestamp: number; // for visual replay timing
}

export interface Scenario {
    config: GameConfig;
    tableSize: TableSize;
    players: Player[];
    buttonSeat: number;
    heroSeat: number;
    actionLog: ActionLogEntry[];
    boardCards: string[];
    finalPot: number;
    question: string;
    correctAction: 'FOLD' | 'CALL' | 'RAISE' | 'ALL_IN';
}

export interface ValidationResult {
    isValid: boolean;
    errors: string[];
    totalChips: number;
    calculatedPot: number;
}
