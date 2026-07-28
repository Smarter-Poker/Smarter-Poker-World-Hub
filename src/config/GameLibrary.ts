/**
 * ═══════════════════════════════════════════════════════════════════════════
 * THE SOVEREIGN 100-GAME LIBRARY
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * The complete catalog of 100 training games organized into 5 categories.
 * Each game has 10 levels × 20 hands = 200 scenarios per game.
 *
 * Categories:
 *   - MTT (25 games): Tournament strategy from push/fold to final tables
 *   - CASH (25 games): Cash game mastery from fundamentals to elite exploits
 *   - SPINS (10 games): Spin & Go / SNG hyper-turbo strategy
 *   - PSYCHOLOGY (20 games): Mental game, tilt control, decision speed
 *   - ADVANCED (20 games): Solver mimicry, blocker math, node locking
 *
 * Rules:
 *   - 10 levels per game
 *   - 20 hands per level
 *   - 85% pass threshold (enforced by MasteryGate)
 *   - No diamond loss allowed
 *
 * Migrated from: AI-Content-GTO-Engine/src/core/GameLibrary.ts
 * ═══════════════════════════════════════════════════════════════════════════
 */

export interface GameDefinition {
    id: string;
    name: string;
    levels: number;
    focus: string;
    difficulty: number; // 1-5
}

export interface GameCategory {
    id: string;
    name: string;
    emoji: string;
    color: string;
    count: number;
}

export const GAME_RULES = {
    LEVELS_PER_GAME: 10,
    HANDS_PER_LEVEL: 20,
    PASS_THRESHOLD: 0.85,
    DIAMOND_LOSS_ALLOWED: false,
} as const;

export const CATEGORIES: Record<string, GameCategory> = {
    MTT:        { id: 'MTT',        name: 'Tournament',    emoji: '◆', color: '#2196F3', count: 25 },
    CASH:       { id: 'CASH',       name: 'Cash Game',     emoji: '◆', color: '#4CAF50', count: 25 },
    SPINS:      { id: 'SPINS',      name: 'Spins & SNGs',  emoji: '◆', color: '#FFC107', count: 10 },
    PSYCHOLOGY: { id: 'PSYCHOLOGY',  name: 'Psychology',    emoji: '◆', color: '#9C27B0', count: 20 },
    ADVANCED:   { id: 'ADVANCED',    name: 'Advanced',      emoji: '◆', color: '#F44336', count: 20 },
};

// ═══════════════════════════════════════════════════════════════════════════
// MTT CATEGORY (25 Games)
// ═══════════════════════════════════════════════════════════════════════════

export const MTT_GAMES: GameDefinition[] = [
    { id: 'mtt_01', name: 'Nash Push/Fold',    levels: 10, focus: 'Short Stack',       difficulty: 1 },
    { id: 'mtt_02', name: 'ICM Pressure',      levels: 10, focus: 'Bubble Play',       difficulty: 2 },
    { id: 'mtt_03', name: 'Chip Accumulator',   levels: 10, focus: 'Middle Stages',    difficulty: 2 },
    { id: 'mtt_04', name: 'PKO Bounty Hunt',   levels: 10, focus: 'Bounty Math',       difficulty: 3 },
    { id: 'mtt_05', name: 'Satellite Bubble',  levels: 10, focus: 'Survival GTO',      difficulty: 3 },
    { id: 'mtt_06', name: 'The Stop-and-Go',   levels: 10, focus: 'BB Shoving',        difficulty: 2 },
    { id: 'mtt_07', name: 'Ladder Jump Pro',   levels: 10, focus: 'ROI Defense',       difficulty: 4 },
    { id: 'mtt_08', name: 'BB Ante Defense',   levels: 10, focus: 'Dead Money',        difficulty: 2 },
    { id: 'mtt_09', name: 'Re-Steal Shove',    levels: 10, focus: '20BB Fold Equity',  difficulty: 3 },
    { id: 'mtt_10', name: 'Ring Mastery',       levels: 10, focus: 'Heads-Up Duel',    difficulty: 4 },
    { id: 'mtt_11', name: 'Bubble Bully',      levels: 10, focus: 'Stack Pressure',    difficulty: 3 },
    { id: 'mtt_12', name: 'Squeeze Play',      levels: 10, focus: 'Isolation',         difficulty: 3 },
    { id: 'mtt_13', name: 'Stall Master',      levels: 10, focus: 'Clock Strategy',    difficulty: 2 },
    { id: 'mtt_14', name: 'BvB Brawl',         levels: 10, focus: 'Blind Combat',      difficulty: 3 },
    { id: 'mtt_15', name: 'Post-Flop ICM',     levels: 10, focus: 'Final Table',       difficulty: 5 },
    { id: 'mtt_16', name: '3-Barrel Unblock',  levels: 10, focus: 'Bluff Selection',   difficulty: 4 },
    { id: 'mtt_17', name: 'Hero Engine',        levels: 10, focus: 'Blocker Calling',  difficulty: 5 },
    { id: 'mtt_18', name: 'Nut Overbet',       levels: 10, focus: 'Polarized Sizing',  difficulty: 4 },
    { id: 'mtt_19', name: 'Check-Trap',        levels: 10, focus: 'Inducement',        difficulty: 3 },
    { id: 'mtt_20', name: 'Range Nailer',      levels: 10, focus: 'Pot Control',       difficulty: 4 },
    { id: 'mtt_21', name: 'Bounty Isolation',  levels: 10, focus: 'PKO Protect',       difficulty: 3 },
    { id: 'mtt_22', name: 'SB Limp-Stab',      levels: 10, focus: 'Lead Strategy',    difficulty: 2 },
    { id: 'mtt_23', name: 'Donk-Crusher',      levels: 10, focus: 'Weak Leads',       difficulty: 3 },
    { id: 'mtt_24', name: 'Asymmetric Stack',  levels: 10, focus: 'Stack Gaps',        difficulty: 4 },
    { id: 'mtt_25', name: 'FT Multi-Way',      levels: 10, focus: 'Survival Math',     difficulty: 5 },
];

// ═══════════════════════════════════════════════════════════════════════════
// CASH CATEGORY (25 Games)
// ═══════════════════════════════════════════════════════════════════════════

export const CASH_GAMES: GameDefinition[] = [
    { id: 'cash_01', name: '6-Max Blueprint',      levels: 10, focus: 'GTO Ranges',       difficulty: 1 },
    { id: 'cash_02', name: 'Rake-Proof Defense',   levels: 10, focus: 'High Rake Adj',    difficulty: 2 },
    { id: 'cash_03', name: '200BB Deep Diver',     levels: 10, focus: 'Deep Stack',       difficulty: 3 },
    { id: 'cash_04', name: 'Straddle Sniper',      levels: 10, focus: 'Bloated Pots',    difficulty: 3 },
    { id: 'cash_05', name: '3-Bet Factory',        levels: 10, focus: 'Linear Aggro',     difficulty: 2 },
    { id: 'cash_06', name: 'Check-Raise Clinic',   levels: 10, focus: 'Flop Defense',    difficulty: 3 },
    { id: 'cash_07', name: 'Value-Trap',           levels: 10, focus: 'River Sizing',     difficulty: 3 },
    { id: 'cash_08', name: 'Multi-Way Logic',      levels: 10, focus: '3+ Players',      difficulty: 4 },
    { id: 'cash_09', name: 'The Blind Thief',      levels: 10, focus: 'Stealing',        difficulty: 2 },
    { id: 'cash_10', name: '4-Bet War',            levels: 10, focus: 'Polarization',     difficulty: 4 },
    { id: 'cash_11', name: 'Turn Probing',         levels: 10, focus: 'Donking',         difficulty: 3 },
    { id: 'cash_12', name: 'Delay C-Bet',          levels: 10, focus: 'Balancing',       difficulty: 3 },
    { id: 'cash_13', name: 'Ace-High Hero',        levels: 10, focus: 'Blocker Defense', difficulty: 4 },
    { id: 'cash_14', name: 'The Squeeze',          levels: 10, focus: 'Isolation',        difficulty: 3 },
    { id: 'cash_15', name: 'Monotone Board',       levels: 10, focus: 'Flush Texture',   difficulty: 4 },
    { id: 'cash_16', name: 'SB Limp-Range',        levels: 10, focus: 'Completion',      difficulty: 2 },
    { id: 'cash_17', name: 'Bluff-Catcher',        levels: 10, focus: 'MDF Compliance',  difficulty: 4 },
    { id: 'cash_18', name: 'Thin Value Hunter',    levels: 10, focus: 'EV Max',          difficulty: 4 },
    { id: 'cash_19', name: 'Board Coverage',       levels: 10, focus: 'Interaction',      difficulty: 5 },
    { id: 'cash_20', name: 'Cold 4-Bet',           levels: 10, focus: 'Elite Exploits',  difficulty: 5 },
    { id: 'cash_21', name: 'Texture Awareness',    levels: 10, focus: 'Sizing',          difficulty: 3 },
    { id: 'cash_22', name: 'Donk-Counter',         levels: 10, focus: 'Exploiting',      difficulty: 3 },
    { id: 'cash_23', name: 'Suited Connectors',    levels: 10, focus: 'Implied Odds',    difficulty: 2 },
    { id: 'cash_24', name: 'Triple Barrel',        levels: 10, focus: 'Max Pressure',    difficulty: 4 },
    { id: 'cash_25', name: 'Fish Exploiter',       levels: 10, focus: 'Deviations',      difficulty: 3 },
];

// ═══════════════════════════════════════════════════════════════════════════
// SPINS CATEGORY (10 Games)
// ═══════════════════════════════════════════════════════════════════════════

export const SPINS_GAMES: GameDefinition[] = [
    { id: 'spin_01', name: 'Hyper Opener',     levels: 10, focus: '25BB 3-Max',    difficulty: 2 },
    { id: 'spin_02', name: 'Button Limp',      levels: 10, focus: 'Small-Ball',    difficulty: 2 },
    { id: 'spin_03', name: 'Jackpot Stress',   levels: 10, focus: 'High Stakes',   difficulty: 4 },
    { id: 'spin_04', name: 'HU Finisher',      levels: 10, focus: '10BB Duel',     difficulty: 3 },
    { id: 'spin_05', name: 'Redline Pro',      levels: 10, focus: 'Aggression',    difficulty: 3 },
    { id: 'spin_06', name: 'Phase Shift',      levels: 10, focus: 'Transitions',   difficulty: 3 },
    { id: 'spin_07', name: '50/50 Survival',   levels: 10, focus: 'SNG Bubble',    difficulty: 3 },
    { id: 'spin_08', name: 'Poverty Drill',    levels: 10, focus: 'Short Stack',   difficulty: 2 },
    { id: 'spin_09', name: '3-Bet Shove',      levels: 10, focus: 'Restreals',     difficulty: 3 },
    { id: 'spin_10', name: 'Dealer Defense',   levels: 10, focus: 'BB vs BTN',     difficulty: 2 },
];

// ═══════════════════════════════════════════════════════════════════════════
// PSYCHOLOGY CATEGORY (20 Games)
// ═══════════════════════════════════════════════════════════════════════════

export const PSYCHOLOGY_GAMES: GameDefinition[] = [
    { id: 'psy_01', name: 'The Metronome',       levels: 10, focus: 'Timing',       difficulty: 2 },
    { id: 'psy_02', name: 'The Cooler Cage',     levels: 10, focus: 'Tilt',         difficulty: 4 },
    { id: 'psy_03', name: 'The Reviewer',        levels: 10, focus: 'Bias',         difficulty: 3 },
    { id: 'psy_04', name: 'The Marathon',         levels: 10, focus: 'Endurance',   difficulty: 4 },
    { id: 'psy_05', name: 'The Mucker',          levels: 10, focus: 'Curiosity',    difficulty: 2 },
    { id: 'psy_06', name: 'Decision Speed',      levels: 10, focus: 'Processing',   difficulty: 3 },
    { id: 'psy_07', name: 'The Zen Player',      levels: 10, focus: 'Regulation',   difficulty: 4 },
    { id: 'psy_08', name: "Winner's Tilt",       levels: 10, focus: 'Preservation', difficulty: 3 },
    { id: 'psy_09', name: 'The Multitasker',     levels: 10, focus: 'Attention',    difficulty: 3 },
    { id: 'psy_10', name: 'Self-Awareness',      levels: 10, focus: 'Honesty',      difficulty: 4 },
    { id: 'psy_11', name: 'Ego Killer',          levels: 10, focus: 'Folding',      difficulty: 3 },
    { id: 'psy_12', name: 'Patience Drill',      levels: 10, focus: 'Control',      difficulty: 2 },
    { id: 'psy_13', name: 'Pressure Plate',      levels: 10, focus: 'Simulation',   difficulty: 4 },
    { id: 'psy_14', name: 'The Chameleon',       levels: 10, focus: 'Adaptation',   difficulty: 3 },
    { id: 'psy_15', name: 'Information Filter',  levels: 10, focus: 'Noise',        difficulty: 3 },
    { id: 'psy_16', name: 'Intuition Test',      levels: 10, focus: 'Gut vs GTO',   difficulty: 4 },
    { id: 'psy_17', name: 'Fortitude',           levels: 10, focus: 'Downswing',    difficulty: 5 },
    { id: 'psy_18', name: 'Focus Lock',          levels: 10, focus: 'Distraction',  difficulty: 3 },
    { id: 'psy_19', name: 'Aggro Dial',          levels: 10, focus: 'Emotions',     difficulty: 3 },
    { id: 'psy_20', name: 'Process Focus',       levels: 10, focus: 'Detachment',   difficulty: 4 },
];

// ═══════════════════════════════════════════════════════════════════════════
// ADVANCED CATEGORY (20 Games)
// ═══════════════════════════════════════════════════════════════════════════

export const ADVANCED_GAMES: GameDefinition[] = [
    { id: 'adv_01', name: 'Aggro Vampire',       levels: 10, focus: 'Redline',       difficulty: 4 },
    { id: 'adv_02', name: 'Meta-Shifter',        levels: 10, focus: '2026 Pools',    difficulty: 4 },
    { id: 'adv_03', name: 'Equity Guardian',     levels: 10, focus: 'Realization',   difficulty: 4 },
    { id: 'adv_04', name: 'Invisible Nut',       levels: 10, focus: 'Bluffs',        difficulty: 4 },
    { id: 'adv_05', name: 'Flow-State Fix',      levels: 10, focus: 'Adrenaline',    difficulty: 5 },
    { id: 'adv_06', name: 'Context Switcher',    levels: 10, focus: 'Structure',     difficulty: 3 },
    { id: 'adv_07', name: 'Blocker Matrix',      levels: 10, focus: 'Combos',        difficulty: 5 },
    { id: 'adv_08', name: 'Range Architect',     levels: 10, focus: 'Construction',  difficulty: 5 },
    { id: 'adv_09', name: 'Solver Mimicry',      levels: 10, focus: 'Accuracy',      difficulty: 5 },
    { id: 'adv_10', name: 'The Exploiter',       levels: 10, focus: 'Deviations',    difficulty: 4 },
    { id: 'adv_11', name: 'Geometry',            levels: 10, focus: 'Sizing',         difficulty: 4 },
    { id: 'adv_12', name: 'Node Locker',         levels: 10, focus: 'Strategy',      difficulty: 5 },
    { id: 'adv_13', name: 'Asymmetric Combat',   levels: 10, focus: 'Gaps',          difficulty: 4 },
    { id: 'adv_14', name: 'Indifference',        levels: 10, focus: 'Bluff-Catch',   difficulty: 4 },
    { id: 'adv_15', name: 'Balance',             levels: 10, focus: 'Mixing',         difficulty: 5 },
    { id: 'adv_16', name: 'Texture Transpo',     levels: 10, focus: 'Streets',       difficulty: 5 },
    { id: 'adv_17', name: 'Unexploitable',       levels: 10, focus: 'Zero-Leak',     difficulty: 5 },
    { id: 'adv_18', name: 'HUD Hunter',          levels: 10, focus: 'Stats',         difficulty: 3 },
    { id: 'adv_19', name: 'Algorithm',           levels: 10, focus: 'Machine Prep',  difficulty: 5 },
    { id: 'adv_20', name: 'Final Solution',      levels: 10, focus: 'Endgame',       difficulty: 5 },
];

// ═══════════════════════════════════════════════════════════════════════════
// UNIFIED LOBBY
// ═══════════════════════════════════════════════════════════════════════════

export const POKERIQ_LOBBY: Record<string, GameDefinition[]> = {
    MTT: MTT_GAMES,
    CASH: CASH_GAMES,
    SPINS: SPINS_GAMES,
    PSYCHOLOGY: PSYCHOLOGY_GAMES,
    ADVANCED: ADVANCED_GAMES,
};

export const ALL_GAMES: GameDefinition[] = [
    ...MTT_GAMES,
    ...CASH_GAMES,
    ...SPINS_GAMES,
    ...PSYCHOLOGY_GAMES,
    ...ADVANCED_GAMES,
];

// ═══════════════════════════════════════════════════════════════════════════
// LOOKUP HELPERS
// ═══════════════════════════════════════════════════════════════════════════

export function getGameById(id: string): GameDefinition | undefined {
    return ALL_GAMES.find(g => g.id === id);
}

export function getGamesByCategory(categoryId: string): GameDefinition[] {
    return POKERIQ_LOBBY[categoryId] || [];
}

export function getGamesByDifficulty(difficulty: number): GameDefinition[] {
    return ALL_GAMES.filter(g => g.difficulty === difficulty);
}
