/**
 * 🎰 GAME DATA LOADER — Data-Driven GameLoop Phase 2
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Purpose: Structured data ingestion for the training system.
 * Replaces text-parsing logic with type-safe data loading.
 * 
 * HARD RULES:
 * - All game state derived from structured data (not text parsing)
 * - Required fields are validated before rendering
 * - Error handling for missing/malformed data
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { TRAINING_CLINICS } from '../data/TRAINING_CLINICS';

// ═══════════════════════════════════════════════════════════════════════════
// TYPE DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════

/** Action performed before hero's turn */
export interface ActionHistoryEntry {
    seat: number;           // 0-8 absolute seat index
    position: string;       // UTG, MP, CO, BTN, SB, BB
    action: 'fold' | 'call' | 'raise' | 'check' | 'all-in';
    amount?: number;        // Bet/raise amount in BB
}

/** Stack distribution across the table */
export interface EffectiveStacks {
    hero: number;           // Hero's stack in BB
    villains: number[];     // Villain stacks in seat order (excluding hero)
}

/** Extended starting state with GameLoop fields */
export interface GameLoopStartingState {
    // Legacy fields (backwards compatible)
    heroCards: string[];
    villainCards: string[];
    board: string[];
    pot: number;
    dealerBtn: string;
    heroStack: number;
    villainStack: number;

    // Data-Driven GameLoop fields
    topology?: 2 | 6 | 9;           // Table size
    buttonPosition?: number;        // BTN seat index (0-8)
    heroPosition?: string;          // Position label
    effectiveStacks?: EffectiveStacks;
    actionHistory?: ActionHistoryEntry[];
}

/** Loaded game data with validation status */
export interface LoadedGameData {
    clinicId: string;
    clinicName: string;
    startingState: GameLoopStartingState;
    questions: any[];       // Question array from clinic
    isGameLoopReady: boolean;  // True if all GameLoop fields present
    validationErrors: string[];
}

// ═══════════════════════════════════════════════════════════════════════════
// DATA LOADING FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Load game data for a clinic by ID
 * @param gameId - Clinic ID (e.g., 'clinic-01', 'clinic-13')
 * @returns LoadedGameData with validation status
 */
export function loadGameData(gameId: string): LoadedGameData | null {
    // Find the clinic
    const clinic = TRAINING_CLINICS.find(c => c.id === gameId);

    if (!clinic) {
        console.error(`[GameDataLoader] Clinic not found: ${gameId}`);
        return null;
    }

    // Initialize validation
    const validationErrors: string[] = [];

    // Get starting state (default to empty if missing)
    const startingState: GameLoopStartingState = clinic.startingState || {
        heroCards: ['??', '??'],
        villainCards: ['??', '??'],
        board: [],
        pot: 0,
        dealerBtn: 'villain',
        heroStack: 100,
        villainStack: 100
    };

    // Get questions (from levels or direct questions array)
    let questions: any[] = [];
    if (clinic.levels && Array.isArray(clinic.levels)) {
        // Flatten all level questions
        questions = clinic.levels.flatMap((level: any) => level.questions || []);
    } else if (clinic.questions) {
        questions = clinic.questions;
    }

    // Validate GameLoop fields
    const hasTopology = typeof startingState.topology === 'number';
    const hasButtonPosition = typeof startingState.buttonPosition === 'number';
    const hasHeroPosition = typeof startingState.heroPosition === 'string';
    const hasEffectiveStacks = startingState.effectiveStacks !== undefined;
    const hasActionHistory = Array.isArray(startingState.actionHistory);

    if (!hasTopology) validationErrors.push('Missing topology (table size)');
    if (!hasButtonPosition) validationErrors.push('Missing buttonPosition');
    if (!hasHeroPosition) validationErrors.push('Missing heroPosition');
    if (!hasEffectiveStacks) validationErrors.push('Missing effectiveStacks');
    if (!hasActionHistory) validationErrors.push('Missing actionHistory');

    // Determine if GameLoop ready
    const isGameLoopReady = hasTopology && hasButtonPosition && hasHeroPosition &&
        hasEffectiveStacks && hasActionHistory;

    if (!isGameLoopReady) {
        console.warn(`[GameDataLoader] ${gameId} missing GameLoop fields:`, validationErrors);
    }

    return {
        clinicId: clinic.id,
        clinicName: clinic.name,
        startingState,
        questions,
        isGameLoopReady,
        validationErrors
    };
}

/**
 * Get all GameLoop-ready clinics
 * @returns Array of clinic IDs that have all GameLoop fields
 */
export function getGameLoopReadyClinics(): string[] {
    return TRAINING_CLINICS
        .filter(clinic => {
            const state = clinic.startingState;
            if (!state) return false;
            return (
                typeof state.topology === 'number' &&
                typeof state.buttonPosition === 'number' &&
                typeof state.heroPosition === 'string' &&
                state.effectiveStacks !== undefined &&
                Array.isArray(state.actionHistory)
            );
        })
        .map(clinic => clinic.id);
}

/**
 * Calculate hero's absolute seat index from position and button
 * @param heroPosition - Position label (BTN, CO, etc.)
 * @param buttonPosition - Button seat index (0-8)
 * @param topology - Table size (2, 6, or 9)
 * @returns Hero's absolute seat index
 */
export function calculateHeroSeat(
    heroPosition: string,
    buttonPosition: number,
    topology: 2 | 6 | 9
): number {
    // Position offsets from button (clockwise)
    const positionOffsets: Record<string, number> = {
        'BTN': 0,
        'CO': -1,
        'HJ': -2,
        'MP+1': -3,
        'MP': -4,
        'UTG+1': -5,
        'UTG': -6,
        'SB': 1,
        'BB': 2
    };

    const offset = positionOffsets[heroPosition] ?? 0;

    // Calculate seat with wraparound
    let heroSeat = (buttonPosition + offset) % topology;
    if (heroSeat < 0) heroSeat += topology;

    return heroSeat;
}

/**
 * Build player array from effective stacks
 * @param effectiveStacks - Stack distribution
 * @param heroPosition - Hero's position label
 * @param buttonPosition - Button seat index
 * @param topology - Table size
 * @returns Array of player objects with seat, stack, and status
 */
export function buildPlayersArray(
    effectiveStacks: EffectiveStacks,
    heroPosition: string,
    buttonPosition: number,
    topology: 2 | 6 | 9
): Array<{ seat: number; stack: number; isHero: boolean; position: string }> {
    const heroSeat = calculateHeroSeat(heroPosition, buttonPosition, topology);
    const players: Array<{ seat: number; stack: number; isHero: boolean; position: string }> = [];

    // Position labels in order from button (clockwise for 9-max)
    const positions9Max = ['BTN', 'SB', 'BB', 'UTG', 'UTG+1', 'MP', 'MP+1', 'HJ', 'CO'];
    const positions6Max = ['BTN', 'SB', 'BB', 'UTG', 'MP', 'CO'];
    const positions2Max = ['BTN', 'BB'];

    const positionLabels = topology === 9 ? positions9Max :
        topology === 6 ? positions6Max :
            positions2Max;

    let villainIdx = 0;

    for (let seat = 0; seat < topology; seat++) {
        const isHero = seat === heroSeat;
        const positionOffset = (seat - buttonPosition + topology) % topology;
        const position = positionLabels[positionOffset] || `Seat ${seat}`;

        players.push({
            seat,
            stack: isHero ? effectiveStacks.hero : (effectiveStacks.villains[villainIdx++] || 100),
            isHero,
            position
        });
    }

    return players;
}

export default {
    loadGameData,
    getGameLoopReadyClinics,
    calculateHeroSeat,
    buildPlayersArray
};
