/**
 * 🎮 GAME MANIFEST - The Configuration Matrix
 * 
 * Defines all 50+ training game modes with their specific configurations.
 * The Universal Training Table looks up these configs by gameId.
 * 
 * Architecture:
 * - gameId: Unique identifier for each training game
 * - tableSize: Number of players (2, 4, 6, 9)
 * - engineType: Cash game vs Tournament vs SNG math
 * - strategyProfile: Specific training focus
 * - avatarSet: Visual theme for opponents
 */

import { TableSize } from '../types/poker';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════
export type EngineType = 'cash' | 'tournament' | 'sng';

export type StrategyProfile =
    | 'gto_basics'
    | 'blind_defense'
    | 'blind_stealing'
    | 'bubble_pressure'
    | 'icm_fundamentals'
    | 'heads_up'
    | 'short_stack'
    | 'deep_stack'
    | 'multiway_pots'
    | 'postflop_cbet'
    | 'postflop_raise'
    | 'river_bluff'
    | 'value_betting'
    | 'pot_control'
    | '3bet_defense'
    | '4bet_pots'
    | 'squeeze_play'
    | 'chip_leader'
    | 'short_stack_play'
    | 'final_table';

export type AvatarSet =
    | 'pro_team'      // Professional poker player avatars
    | 'animals'       // Animal-themed avatars
    | 'mythical'      // Fantasy/mythical creatures
    | 'warriors'      // Historical warriors
    | 'cyber'         // Cyberpunk/tech themed
    | 'classic';      // Classic poker faces

export type DifficultyLevel = 'beginner' | 'intermediate' | 'advanced' | 'expert';

export interface GameMode {
    // Core Identity
    id: string;
    name: string;
    description: string;
    category: 'fundamentals' | 'preflop' | 'postflop' | 'tournament' | 'advanced';

    // Table Configuration
    tableSize: TableSize;
    engineType: EngineType;

    // Strategy Configuration
    strategyProfile: StrategyProfile;
    difficultyLevel: DifficultyLevel;

    // Visual Configuration
    avatarSet: AvatarSet;
    themeColor: string; // Primary color for UI accents

    // Stack Configuration
    stackDepth: 'shallow' | 'medium' | 'deep'; // 20BB, 50BB, 100BB+
    startingStack: number; // Actual BB amount

    // Gameplay Rules
    forcedPosition?: 'button' | 'sb' | 'bb' | 'cutoff' | 'any'; // Hero starting position
    minRaiseSizing?: number; // Minimum raise as multiple of BB
    anteEnabled: boolean;
    anteSize?: number; // As fraction of BB

    // Rewards Configuration
    baseXP: number;
    xpMultiplier: number;
    diamondMultiplier: number;

    // Unlock Requirements (optional)
    unlockLevel?: number;
    unlockGames?: string[]; // GameIDs that must be completed first
    isVIPOnly?: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════
// GAME MODES DICTIONARY
// ═══════════════════════════════════════════════════════════════════════════
export const GAME_MODES: Record<string, GameMode> = {
    // ═══════════════════════════════════════════════════════════════════════
    // FUNDAMENTALS (Beginner Games)
    // ═══════════════════════════════════════════════════════════════════════
    'gto_basics_9max': {
        id: 'gto_basics_9max',
        name: 'GTO Basics',
        description: 'Learn fundamental GTO concepts in a full ring environment',
        category: 'fundamentals',
        tableSize: 9,
        engineType: 'cash',
        strategyProfile: 'gto_basics',
        difficultyLevel: 'beginner',
        avatarSet: 'classic',
        themeColor: '#00d4ff',
        stackDepth: 'deep',
        startingStack: 100,
        anteEnabled: false,
        baseXP: 100,
        xpMultiplier: 1.0,
        diamondMultiplier: 1.0,
    },

    'blind_defense_6max': {
        id: 'blind_defense_6max',
        name: 'Blind Defense',
        description: 'Master defending your blinds against steals',
        category: 'preflop',
        tableSize: 6,
        engineType: 'cash',
        strategyProfile: 'blind_defense',
        difficultyLevel: 'beginner',
        avatarSet: 'animals',
        themeColor: '#22c55e',
        stackDepth: 'deep',
        startingStack: 100,
        forcedPosition: 'bb',
        anteEnabled: false,
        baseXP: 100,
        xpMultiplier: 1.0,
        diamondMultiplier: 1.0,
    },

    'blind_stealing_6max': {
        id: 'blind_stealing_6max',
        name: 'Blind Stealing',
        description: 'Learn to profitably steal blinds from late position',
        category: 'preflop',
        tableSize: 6,
        engineType: 'cash',
        strategyProfile: 'blind_stealing',
        difficultyLevel: 'beginner',
        avatarSet: 'animals',
        themeColor: '#f59e0b',
        stackDepth: 'deep',
        startingStack: 100,
        forcedPosition: 'button',
        anteEnabled: false,
        baseXP: 100,
        xpMultiplier: 1.0,
        diamondMultiplier: 1.0,
    },

    // ═══════════════════════════════════════════════════════════════════════
    // HEADS-UP GAMES
    // ═══════════════════════════════════════════════════════════════════════
    'hu_cash_deep': {
        id: 'hu_cash_deep',
        name: 'Heads-Up Deep Stack',
        description: 'Deep stack heads-up cash game fundamentals',
        category: 'advanced',
        tableSize: 2,
        engineType: 'cash',
        strategyProfile: 'heads_up',
        difficultyLevel: 'intermediate',
        avatarSet: 'pro_team',
        themeColor: '#a855f7',
        stackDepth: 'deep',
        startingStack: 100,
        anteEnabled: false,
        baseXP: 150,
        xpMultiplier: 1.5,
        diamondMultiplier: 1.5,
    },

    'hu_sng': {
        id: 'hu_sng',
        name: 'Heads-Up SNG',
        description: 'Heads-up sit & go with ICM considerations',
        category: 'tournament',
        tableSize: 2,
        engineType: 'sng',
        strategyProfile: 'heads_up',
        difficultyLevel: 'intermediate',
        avatarSet: 'warriors',
        themeColor: '#ef4444',
        stackDepth: 'medium',
        startingStack: 50,
        anteEnabled: true,
        anteSize: 0.1,
        baseXP: 150,
        xpMultiplier: 1.5,
        diamondMultiplier: 1.5,
    },

    'hu_hyper_turbo': {
        id: 'hu_hyper_turbo',
        name: 'Hyper Turbo HU',
        description: 'Ultra-aggressive heads-up with shallow stacks',
        category: 'tournament',
        tableSize: 2,
        engineType: 'sng',
        strategyProfile: 'short_stack',
        difficultyLevel: 'advanced',
        avatarSet: 'cyber',
        themeColor: '#ec4899',
        stackDepth: 'shallow',
        startingStack: 15,
        anteEnabled: true,
        anteSize: 0.2,
        baseXP: 200,
        xpMultiplier: 2.0,
        diamondMultiplier: 2.0,
    },

    // ═══════════════════════════════════════════════════════════════════════
    // ICM / TOURNAMENT GAMES
    // ═══════════════════════════════════════════════════════════════════════
    'icm_9max': {
        id: 'icm_9max',
        name: 'ICM Fundamentals',
        description: 'Learn ICM decision-making in tournament spots',
        category: 'tournament',
        tableSize: 9,
        engineType: 'tournament',
        strategyProfile: 'icm_fundamentals',
        difficultyLevel: 'intermediate',
        avatarSet: 'mythical',
        themeColor: '#FFD700',
        stackDepth: 'medium',
        startingStack: 30,
        anteEnabled: true,
        anteSize: 0.125,
        baseXP: 150,
        xpMultiplier: 1.5,
        diamondMultiplier: 1.5,
    },

    'icm_bubble': {
        id: 'icm_bubble',
        name: 'Bubble Pressure',
        description: 'Navigate the money bubble with ICM awareness',
        category: 'tournament',
        tableSize: 9,
        engineType: 'tournament',
        strategyProfile: 'bubble_pressure',
        difficultyLevel: 'advanced',
        avatarSet: 'warriors',
        themeColor: '#ef4444',
        stackDepth: 'shallow',
        startingStack: 20,
        anteEnabled: true,
        anteSize: 0.125,
        baseXP: 200,
        xpMultiplier: 2.0,
        diamondMultiplier: 2.0,
    },

    'icm_final_table': {
        id: 'icm_final_table',
        name: 'Final Table',
        description: 'High-stakes ICM decisions at the final table',
        category: 'tournament',
        tableSize: 9,
        engineType: 'tournament',
        strategyProfile: 'final_table',
        difficultyLevel: 'expert',
        avatarSet: 'pro_team',
        themeColor: '#FFD700',
        stackDepth: 'medium',
        startingStack: 40,
        anteEnabled: true,
        anteSize: 0.1,
        baseXP: 250,
        xpMultiplier: 2.5,
        diamondMultiplier: 2.5,
        unlockLevel: 10,
    },

    // ═══════════════════════════════════════════════════════════════════════
    // 6-MAX CASH GAMES
    // ═══════════════════════════════════════════════════════════════════════
    'cash_6max_reg': {
        id: 'cash_6max_reg',
        name: '6-Max Cash',
        description: 'Standard 6-max cash game training',
        category: 'fundamentals',
        tableSize: 6,
        engineType: 'cash',
        strategyProfile: 'gto_basics',
        difficultyLevel: 'beginner',
        avatarSet: 'classic',
        themeColor: '#00d4ff',
        stackDepth: 'deep',
        startingStack: 100,
        anteEnabled: false,
        baseXP: 100,
        xpMultiplier: 1.0,
        diamondMultiplier: 1.0,
    },

    'cash_6max_3bet': {
        id: 'cash_6max_3bet',
        name: '3-Bet Pots',
        description: 'Master playing in 3-bet pots',
        category: 'preflop',
        tableSize: 6,
        engineType: 'cash',
        strategyProfile: '3bet_defense',
        difficultyLevel: 'intermediate',
        avatarSet: 'warriors',
        themeColor: '#f59e0b',
        stackDepth: 'deep',
        startingStack: 100,
        anteEnabled: false,
        baseXP: 150,
        xpMultiplier: 1.5,
        diamondMultiplier: 1.5,
    },

    'cash_6max_deep': {
        id: 'cash_6max_deep',
        name: 'Deep Stack 6-Max',
        description: 'Deep stack dynamics in 6-max format',
        category: 'advanced',
        tableSize: 6,
        engineType: 'cash',
        strategyProfile: 'deep_stack',
        difficultyLevel: 'advanced',
        avatarSet: 'pro_team',
        themeColor: '#a855f7',
        stackDepth: 'deep',
        startingStack: 200,
        anteEnabled: false,
        baseXP: 200,
        xpMultiplier: 2.0,
        diamondMultiplier: 2.0,
        unlockLevel: 5,
    },

    // ═══════════════════════════════════════════════════════════════════════
    // POSTFLOP GAMES
    // ═══════════════════════════════════════════════════════════════════════
    'postflop_cbet_6max': {
        id: 'postflop_cbet_6max',
        name: 'C-Bet Mastery',
        description: 'Learn continuation betting strategies',
        category: 'postflop',
        tableSize: 6,
        engineType: 'cash',
        strategyProfile: 'postflop_cbet',
        difficultyLevel: 'intermediate',
        avatarSet: 'animals',
        themeColor: '#22c55e',
        stackDepth: 'deep',
        startingStack: 100,
        anteEnabled: false,
        baseXP: 150,
        xpMultiplier: 1.5,
        diamondMultiplier: 1.5,
    },

    'postflop_river_bluff': {
        id: 'postflop_river_bluff',
        name: 'River Bluffing',
        description: 'Master river bluffing frequency and sizing',
        category: 'postflop',
        tableSize: 6,
        engineType: 'cash',
        strategyProfile: 'river_bluff',
        difficultyLevel: 'advanced',
        avatarSet: 'cyber',
        themeColor: '#ec4899',
        stackDepth: 'deep',
        startingStack: 100,
        anteEnabled: false,
        baseXP: 200,
        xpMultiplier: 2.0,
        diamondMultiplier: 2.0,
        unlockLevel: 8,
    },

    'postflop_value_betting': {
        id: 'postflop_value_betting',
        name: 'Value Betting',
        description: 'Extract maximum value from your strong hands',
        category: 'postflop',
        tableSize: 6,
        engineType: 'cash',
        strategyProfile: 'value_betting',
        difficultyLevel: 'intermediate',
        avatarSet: 'mythical',
        themeColor: '#FFD700',
        stackDepth: 'deep',
        startingStack: 100,
        anteEnabled: false,
        baseXP: 150,
        xpMultiplier: 1.5,
        diamondMultiplier: 1.5,
    },

    // ═══════════════════════════════════════════════════════════════════════
    // SPECIAL FORMATS
    // ═══════════════════════════════════════════════════════════════════════
    'spin_and_go': {
        id: 'spin_and_go',
        name: 'Spin & Go',
        description: 'Fast-paced 3-handed hyper turbo SNGs',
        category: 'tournament',
        tableSize: 4,
        engineType: 'sng',
        strategyProfile: 'short_stack',
        difficultyLevel: 'advanced',
        avatarSet: 'cyber',
        themeColor: '#f59e0b',
        stackDepth: 'shallow',
        startingStack: 25,
        anteEnabled: true,
        anteSize: 0.15,
        baseXP: 175,
        xpMultiplier: 1.75,
        diamondMultiplier: 1.75,
    },

    'chip_leader_play': {
        id: 'chip_leader_play',
        name: 'Chip Leader',
        description: 'Leverage your big stack to pressure opponents',
        category: 'tournament',
        tableSize: 6,
        engineType: 'tournament',
        strategyProfile: 'chip_leader',
        difficultyLevel: 'intermediate',
        avatarSet: 'warriors',
        themeColor: '#22c55e',
        stackDepth: 'deep',
        startingStack: 80,
        anteEnabled: true,
        anteSize: 0.1,
        baseXP: 150,
        xpMultiplier: 1.5,
        diamondMultiplier: 1.5,
    },

    'short_stack_ninja': {
        id: 'short_stack_ninja',
        name: 'Short Stack Ninja',
        description: 'Master push/fold with a short stack',
        category: 'tournament',
        tableSize: 6,
        engineType: 'tournament',
        strategyProfile: 'short_stack_play',
        difficultyLevel: 'intermediate',
        avatarSet: 'warriors',
        themeColor: '#ef4444',
        stackDepth: 'shallow',
        startingStack: 12,
        anteEnabled: true,
        anteSize: 0.125,
        baseXP: 150,
        xpMultiplier: 1.5,
        diamondMultiplier: 1.5,
    },
};

// ═══════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get a game mode by ID
 */
export function getGameMode(gameId: string): GameMode | null {
    return GAME_MODES[gameId] || null;
}

/**
 * Get all game modes in a category
 */
export function getGamesByCategory(category: GameMode['category']): GameMode[] {
    return Object.values(GAME_MODES).filter(game => game.category === category);
}

/**
 * Get all unlocked games for a player level
 */
export function getUnlockedGames(playerLevel: number, isVIP: boolean = false): GameMode[] {
    return Object.values(GAME_MODES).filter(game => {
        const levelOk = !game.unlockLevel || playerLevel >= game.unlockLevel;
        const vipOk = !game.isVIPOnly || isVIP;
        return levelOk && vipOk;
    });
}

/**
 * Get the avatar set paths for a mode
 */
export function getAvatarSetPaths(avatarSet: AvatarSet): string[] {
    const basePath = '/avatars';

    switch (avatarSet) {
        case 'pro_team':
            return [
                `${basePath}/vip/viking_warrior.png`,
                `${basePath}/vip/wolf.png`,
                `${basePath}/vip/spartan.png`,
                `${basePath}/vip/pharaoh.png`,
                `${basePath}/vip/samurai.png`,
                `${basePath}/vip/phoenix.png`,
                `${basePath}/vip/dragon.png`,
                `${basePath}/vip/tiger.png`,
                `${basePath}/vip/kraken.png`,
            ];
        case 'animals':
            return [
                `${basePath}/free/fox.png`,
                `${basePath}/free/owl.png`,
                `${basePath}/free/lion.png`,
                `${basePath}/free/eagle.png`,
                `${basePath}/free/wolf.png`,
                `${basePath}/free/bear.png`,
                `${basePath}/free/shark.png`,
                `${basePath}/free/hawk.png`,
                `${basePath}/free/cobra.png`,
            ];
        case 'mythical':
            return [
                `${basePath}/vip/phoenix.png`,
                `${basePath}/vip/dragon.png`,
                `${basePath}/vip/griffin.png`,
                `${basePath}/vip/unicorn.png`,
                `${basePath}/vip/hydra.png`,
                `${basePath}/vip/cerberus.png`,
                `${basePath}/vip/sphinx.png`,
                `${basePath}/vip/minotaur.png`,
                `${basePath}/vip/chimera.png`,
            ];
        case 'warriors':
            return [
                `${basePath}/vip/viking_warrior.png`,
                `${basePath}/vip/spartan.png`,
                `${basePath}/vip/samurai.png`,
                `${basePath}/vip/knight.png`,
                `${basePath}/vip/gladiator.png`,
                `${basePath}/vip/ninja.png`,
                `${basePath}/vip/ranger.png`,
                `${basePath}/vip/berserker.png`,
                `${basePath}/vip/shogun.png`,
            ];
        case 'cyber':
            return [
                `${basePath}/vip/cyber_ninja.png`,
                `${basePath}/vip/robo_warrior.png`,
                `${basePath}/vip/neon_samurai.png`,
                `${basePath}/vip/android.png`,
                `${basePath}/vip/hacker.png`,
                `${basePath}/vip/cyborg.png`,
                `${basePath}/vip/digital_ghost.png`,
                `${basePath}/vip/matrix.png`,
                `${basePath}/vip/techno.png`,
            ];
        case 'classic':
        default:
            return [
                `${basePath}/free/wizard.png`,
                `${basePath}/free/ninja.png`,
                `${basePath}/free/pirate.png`,
                `${basePath}/free/cowboy.png`,
                `${basePath}/free/fox.png`,
                `${basePath}/free/robot.png`,
                `${basePath}/free/alien.png`,
                `${basePath}/free/ghost.png`,
                `${basePath}/free/demon.png`,
            ];
    }
}

/**
 * Convert stack depth to actual BB
 */
export function getStackBB(depth: GameMode['stackDepth']): number {
    switch (depth) {
        case 'shallow': return 20;
        case 'medium': return 50;
        case 'deep': return 100;
        default: return 100;
    }
}

/**
 * Get all game mode IDs
 */
export function getAllGameIds(): string[] {
    return Object.keys(GAME_MODES);
}

/**
 * Get game count
 */
export function getGameCount(): number {
    return Object.keys(GAME_MODES).length;
}
