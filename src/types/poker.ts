/**
 * 🎯 POKER TYPE DEFINITIONS
 * Shared types for The Architect and The Director
 */

export interface GameConfig {
    bigBlind: number;
    ante: number;
    startStack: number;
}

export interface Player {
    seat: number;
    name: string;
    stack: number;
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
    | 'CHECK'
    | 'POT_SWEEP';

export interface ActionLogEntry {
    type: ActionType;
    player: number; // seat number
    amount: number;
    newStack: number;
    newBet: number;
    potAfter: number;
    timestamp: number; // for visual replay timing
}

export interface Scenario {
    config: GameConfig;
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
