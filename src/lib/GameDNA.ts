/**
 * 🧬 GAME DNA SCHEMA - Universal Game Definition Interface
 * 
 * Military-grade precision schema that covers EVERY possible variable
 * of a poker training game. A single JSON object spawns a complete,
 * mathematically accurate, deep-strategy training experience.
 * 
 * The Industrial Content Engine reads this schema and auto-generates:
 * - Scenario sequences with correct action history
 * - Range charts based on stack depth + format
 * - ICM calculations when applicable
 * - Visual themes and asset overrides
 */

import { TableSize } from './SeatLayouts';

// ═══════════════════════════════════════════════════════════════════════════
// CORE ENUMS - The Building Blocks
// ═══════════════════════════════════════════════════════════════════════════

export type GameCategory =
    | 'Cash'
    | 'MTT'
    | 'Spin_Go'
    | 'PKO'
    | 'Satellite'
    | 'HeadsUp_SNG'
    | 'SitAndGo'
    | 'Drill';

export type AnteType = 'BigBlind' | 'Classic' | 'None';
export type BlindSpeed = 'Hyper' | 'Turbo' | 'Reg' | 'Deep';

export type HeroPosition =
    | 'BTN'
    | 'SB'
    | 'BB'
    | 'EP'      // Early Position (UTG, UTG+1, UTG+2)
    | 'MP'      // Middle Position
    | 'CO'      // Cut-Off
    | 'HJ'      // Hijack
    | 'Random';

export type SituationType =
    // Preflop Situations
    | 'Open_Raise'           // Hero opens the pot
    | 'Facing_Raise'         // Hero facing an open
    | 'Facing_3Bet'          // Hero opens, villain 3-bets
    | 'Squeeze'              // Multiple players in, hero squeezes
    | 'Blind_Defense'        // Hero in blinds facing steal
    | 'Blind_vs_Blind'       // SB vs BB war
    | 'Limped_Pot'           // Facing or punishing limpers
    | 'Push_Fold'            // Sub-20BB decisions
    | 'Reshove'              // Re-shove over opener
    // Postflop Situations
    | 'Postflop_CBet'        // IP continuation bet decisions
    | 'Postflop_Check_Raise' // OOP check-raise spots
    | 'Double_Barrel'        // Turn aggression
    | 'Triple_Barrel'        // River aggression
    | 'River_Bluff_Catch'    // Hero calling river bets
    | 'River_Value_Bet'      // Thin value decisions
    | 'Wet_Board_Play'       // Coordinated board decisions
    | 'Dry_Board_Play'       // Disconnected board decisions
    // Special Situations
    | 'Bubble_Pressure'      // ICM bubble abuse
    | 'Bubble_Defense'       // Surviving the bubble
    | 'Bounty_Hunt'          // PKO bounty calculations
    | 'Final_Table'          // FT ICM decisions
    | 'Bomb_Pot'             // Multi-way forced action
    | 'Random';              // Any situation

export type VillainProfile =
    | 'Nit'           // Tight-passive, folds to aggression
    | 'Passive'       // Calls too much, rarely raises
    | 'TAG'           // Tight-aggressive (standard good player)
    | 'LAG'           // Loose-aggressive
    | 'Maniac'        // Hyper-aggressive, wide ranges
    | 'Calling_Station' // Calls everything
    | 'GTO_Bot'       // Balanced, unexploitable
    | 'Fish'          // Random, makes mistakes
    | 'Mixed';        // Random villain types

export type BoardTexture =
    | 'Random'
    | 'Monotone'      // 3 of same suit
    | 'Two_Tone'      // 2 of same suit
    | 'Rainbow'       // All different suits
    | 'Paired'        // Board has a pair
    | 'Double_Paired' // Two pairs on board
    | 'Trips'         // Three of a kind on board
    | 'Dry'           // Disconnected, no draws
    | 'Wet'           // Many draws possible
    | 'Connected'     // Straight possibilities
    | 'High_Card'     // Broadway heavy
    | 'Low_Card'      // Small cards
    | 'Ace_High';     // Ace on board

export type ThemeSkin =
    | 'default'
    | 'pko_bounty_hunter'
    | 'high_roller'
    | 'neon_vegas'
    | 'vintage_casino'
    | 'cyber_punk'
    | 'tournament_green'
    | 'spin_and_go';

// ═══════════════════════════════════════════════════════════════════════════
// THE GAME DEFINITION INTERFACE - Complete Game DNA
// ═══════════════════════════════════════════════════════════════════════════

export interface GameStructure {
    anteType: AnteType;
    anteSize?: number;        // As fraction of BB (e.g., 0.125 = 12.5%)
    blindSpeed: BlindSpeed;
    bigBlindAmount: number;   // Starting BB (usually 100)
}

export interface GameEconomics {
    stackDepth: number;       // In BB (10, 20, 25, 40, 50, 100, 200)
    buyInChips: number;       // Total starting chips
    payouts?: number[];       // ICM payout structure (e.g., [50, 30, 20])
    bountyAmount?: number;    // PKO bounty value
    prizePool?: number;       // Total prize pool for ICM calcs
}

export interface ScenarioDriver {
    heroPosition: HeroPosition;
    situation: SituationType;
    villainProfile: VillainProfile;
    boardTexture: BoardTexture;

    // Advanced scenario control
    minVillains?: number;           // Minimum active villains
    maxVillains?: number;           // Maximum active villains
    forcedHistory?: ActionHistoryStep[]; // Pre-scripted actions before user input
    requiredBoard?: string[];       // Specific board cards (e.g., ['Ah', 'Kh', '2s'])
}

export interface ActionHistoryStep {
    actor: 'hero' | 'villain' | 'villain_sb' | 'villain_bb' | 'villain_btn';
    action: 'fold' | 'call' | 'raise' | 'check' | 'bet' | 'all_in';
    sizing?: number;    // As multiple of pot or BB
    street: 'preflop' | 'flop' | 'turn' | 'river';
}

export interface VisualOverrides {
    themeSkin?: ThemeSkin;
    chipStyle?: 'classic' | 'pko_bounty' | 'high_value';
    feltColor?: string;         // Hex color override
    accentColor?: string;       // Theme accent
    iconAsset?: string;         // Card/icon for game selection
    backgroundImage?: string;   // Custom background
}

export interface DifficultyConfig {
    level: 1 | 2 | 3 | 4 | 5;   // 1=Basic Math, 5=GTO Wizardry
    timeLimit?: number;         // Seconds per decision
    hintsEnabled?: boolean;     // Show EV hints
    rangeHelperEnabled?: boolean; // Show range visualization
    evExplanation?: boolean;    // Explain correct answer
}

export interface RewardConfig {
    baseXP: number;
    xpMultiplier: number;
    diamondMultiplier: number;
    streakBonus: boolean;       // Apply streak multiplier
    perfectBonus?: number;      // Bonus for 100% accuracy
}

export interface UnlockRequirements {
    minLevel?: number;          // Player level required
    prerequisiteGames?: string[]; // Games that must be completed
    isVIPOnly?: boolean;        // Requires VIP subscription
    isBetaOnly?: boolean;       // Beta testers only
}

// ═══════════════════════════════════════════════════════════════════════════
// THE COMPLETE GAME DEFINITION - The "Game DNA" Object
// ═══════════════════════════════════════════════════════════════════════════

export interface GameDefinition {
    // ─── IDENTITY ───
    id: string;                 // Unique identifier (e.g., 'cash_100bb_6max_btn_open')
    name: string;               // Display name
    description: string;        // Short description for UI
    longDescription?: string;   // Detailed explanation
    iconAsset: string;          // Icon path for game card

    // ─── FORMAT ───
    category: GameCategory;
    tableSize: TableSize;
    structure: GameStructure;

    // ─── ECONOMICS ───
    economics: GameEconomics;

    // ─── SCENARIO DRIVER (The Brain) ───
    scenario: ScenarioDriver;

    // ─── VISUALS ───
    visuals?: VisualOverrides;

    // ─── DIFFICULTY ───
    difficulty: DifficultyConfig;

    // ─── REWARDS ───
    rewards: RewardConfig;

    // ─── ACCESS CONTROL ───
    unlock?: UnlockRequirements;

    // ─── METADATA ───
    tags?: string[];            // Searchable tags
    version: string;            // Definition version
    author?: string;            // Content creator
    createdAt?: string;         // ISO date
    updatedAt?: string;         // ISO date
}

// ═══════════════════════════════════════════════════════════════════════════
// RANGE PROFILE TYPE - For strategy injection
// ═══════════════════════════════════════════════════════════════════════════

export type RangeProfile =
    | 'push_fold_10bb'      // Nash push/fold charts
    | 'push_fold_15bb'
    | 'push_fold_20bb'
    | 'reshove_15bb'
    | 'reshove_20bb'
    | 'open_raise_100bb'    // Standard cash opens
    | 'open_raise_deep'     // 200BB+ ranges
    | '3bet_vs_open'
    | '3bet_squeeze'
    | 'blind_defense_vs_btn'
    | 'blind_defense_vs_co'
    | 'postflop_cbet_ip'
    | 'postflop_cbet_oop'
    | 'gto_balanced';

/**
 * Determines the appropriate range profile based on game definition
 */
export function getRangeProfile(game: GameDefinition): RangeProfile {
    const { economics, scenario, category } = game;
    const stack = economics.stackDepth;

    // Push/Fold territory
    if (stack <= 12) return 'push_fold_10bb';
    if (stack <= 17) return 'push_fold_15bb';
    if (stack <= 22) return 'push_fold_20bb';

    // Reshove territory
    if (scenario.situation === 'Reshove') {
        return stack <= 17 ? 'reshove_15bb' : 'reshove_20bb';
    }

    // 3-Bet situations
    if (scenario.situation === 'Facing_3Bet' || scenario.situation === 'Squeeze') {
        return '3bet_vs_open';
    }

    // Blind defense
    if (scenario.situation === 'Blind_Defense') {
        return scenario.heroPosition === 'BB' ? 'blind_defense_vs_btn' : 'blind_defense_vs_co';
    }

    // Postflop
    if (scenario.situation.startsWith('Postflop')) {
        return 'postflop_cbet_ip';
    }

    // Deep stack
    if (stack >= 150) return 'open_raise_deep';

    // Standard cash
    if (category === 'Cash') return 'open_raise_100bb';

    // Default
    return 'gto_balanced';
}

/**
 * Determines if ICM calculations should be applied
 */
export function shouldApplyICM(game: GameDefinition): boolean {
    const icmCategories: GameCategory[] = ['MTT', 'Spin_Go', 'Satellite', 'HeadsUp_SNG', 'SitAndGo'];

    if (!icmCategories.includes(game.category)) return false;
    if (!game.economics.payouts) return false;
    if (game.scenario.situation === 'Push_Fold') return true;
    if (game.scenario.situation.includes('Bubble')) return true;
    if (game.scenario.situation === 'Final_Table') return true;

    return true;
}

/**
 * Get the theme skin for a game
 */
export function getThemeSkin(game: GameDefinition): ThemeSkin {
    if (game.visuals?.themeSkin) return game.visuals.themeSkin;

    switch (game.category) {
        case 'PKO': return 'pko_bounty_hunter';
        case 'Spin_Go': return 'spin_and_go';
        case 'MTT': return 'tournament_green';
        default: return 'default';
    }
}

/**
 * Determines if push/fold strategy should be used
 */
export function isPushFoldMode(game: GameDefinition): boolean {
    return game.economics.stackDepth <= 15 || game.scenario.situation === 'Push_Fold';
}
