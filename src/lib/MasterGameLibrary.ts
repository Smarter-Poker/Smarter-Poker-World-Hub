/**
 * 📚 MASTER GAME LIBRARY - The 20 Core Cartridges
 * 
 * The complete library of training games powered by the Game DNA System.
 * Each game is a pure configuration object - no logic code needed.
 * 
 * Categories:
 * - Games 1-5: Cash Fundamentals
 * - Games 6-10: Tournament Survival
 * - Games 11-15: Post-Flop Situations
 * - Games 16-20: Niche Formats
 */

import type { GameDefinition } from './GameDNA';

// ═══════════════════════════════════════════════════════════════════════════
// GAMES 1-5: CASH FUNDAMENTALS
// ═══════════════════════════════════════════════════════════════════════════

const cash_100bb_6max_btn_open: GameDefinition = {
    id: 'cash_100bb_6max_btn_open',
    name: 'Button Opening',
    description: 'The classic 100BB 6-max button open spot',
    longDescription: 'Master the fundamentals of opening from the button with 100BB effective. Learn which hands to open, sizing considerations, and how to react to 3-bets.',
    iconAsset: '/icons/games/btn_open.png',

    category: 'Cash',
    tableSize: 6,
    structure: {
        anteType: 'None',
        blindSpeed: 'Reg',
        bigBlindAmount: 100
    },

    economics: {
        stackDepth: 100,
        buyInChips: 10000
    },

    scenario: {
        heroPosition: 'BTN',
        situation: 'Open_Raise',
        villainProfile: 'TAG',
        boardTexture: 'Random'
    },

    difficulty: {
        level: 1,
        hintsEnabled: true,
        evExplanation: true
    },

    rewards: {
        baseXP: 100,
        diamondMultiplier: 1.0,
        streakBonus: true
    },

    tags: ['cash', '6max', 'preflop', 'fundamentals', 'beginner'],
    version: '1.0.0'
};

const cash_100bb_hu_blind_war: GameDefinition = {
    id: 'cash_100bb_hu_blind_war',
    name: 'Blind War',
    description: 'Heads-up blind battles with wide ranges',
    longDescription: 'In heads-up, every hand is a battle for the blinds. Learn the hyper-aggressive ranges needed to dominate 1v1 poker.',
    iconAsset: '/icons/games/hu_battle.png',

    category: 'Cash',
    tableSize: 2,
    structure: {
        anteType: 'None',
        blindSpeed: 'Reg',
        bigBlindAmount: 100
    },

    economics: {
        stackDepth: 100,
        buyInChips: 10000
    },

    scenario: {
        heroPosition: 'Random',
        situation: 'Blind_vs_Blind',
        villainProfile: 'LAG',
        boardTexture: 'Random'
    },

    difficulty: {
        level: 2,
        hintsEnabled: true,
        evExplanation: true
    },

    rewards: {
        baseXP: 125,
        diamondMultiplier: 1.25,
        streakBonus: true
    },

    tags: ['cash', 'heads-up', 'wide-range', 'aggressive'],
    version: '1.0.0'
};

const cash_200bb_deep_3bp: GameDefinition = {
    id: 'cash_200bb_deep_3bp',
    name: 'Deep Stack 3-Bet Pots',
    description: 'Navigate 200BB deep 3-bet pot dynamics',
    longDescription: 'Deep stack play changes everything. With 200BB effective, implied odds matter more and premium hands need protection. Master the art of deep 3-bet pots.',
    iconAsset: '/icons/games/deep_3bet.png',

    category: 'Cash',
    tableSize: 6,
    structure: {
        anteType: 'None',
        blindSpeed: 'Deep',
        bigBlindAmount: 100
    },

    economics: {
        stackDepth: 200,
        buyInChips: 20000
    },

    scenario: {
        heroPosition: 'CO',
        situation: 'Facing_3Bet',
        villainProfile: 'TAG',
        boardTexture: 'Random',
        forcedHistory: [
            { actor: 'hero', action: 'raise', sizing: 2.5, street: 'preflop' },
            { actor: 'villain', action: 'raise', sizing: 9, street: 'preflop' }
        ]
    },

    difficulty: {
        level: 4,
        hintsEnabled: false,
        evExplanation: true
    },

    rewards: {
        baseXP: 200,
        diamondMultiplier: 2.0,
        streakBonus: true
    },

    unlock: {
        minLevel: 5
    },

    tags: ['cash', 'deep-stack', '3bet', 'advanced'],
    version: '1.0.0'
};

const cash_live_9max_limped_pot: GameDefinition = {
    id: 'cash_live_9max_limped_pot',
    name: 'Punishing Limpers',
    description: 'Exploit weak live game limped pots',
    longDescription: 'In live games, limpers are everywhere. Learn to isolate weak players with tight ranges and extract maximum value from fishy spots.',
    iconAsset: '/icons/games/limped_pot.png',

    category: 'Cash',
    tableSize: 9,
    structure: {
        anteType: 'None',
        blindSpeed: 'Reg',
        bigBlindAmount: 100
    },

    economics: {
        stackDepth: 100,
        buyInChips: 10000
    },

    scenario: {
        heroPosition: 'CO',
        situation: 'Limped_Pot',
        villainProfile: 'Passive',
        boardTexture: 'Random',
        minVillains: 2,
        maxVillains: 4,
        forcedHistory: [
            { actor: 'villain', action: 'call', sizing: 1, street: 'preflop' }, // Limp 1
            { actor: 'villain', action: 'call', sizing: 1, street: 'preflop' }  // Limp 2
        ]
    },

    difficulty: {
        level: 2,
        hintsEnabled: true,
        evExplanation: true
    },

    rewards: {
        baseXP: 125,
        diamondMultiplier: 1.25,
        streakBonus: true
    },

    tags: ['cash', 'live', '9max', 'isolation', 'exploit'],
    version: '1.0.0'
};

const cash_6max_cbet_defense: GameDefinition = {
    id: 'cash_6max_cbet_defense',
    name: 'Flop Floating',
    description: 'Defend against c-bets with floats and raises',
    longDescription: 'Learn when to call, raise, or fold facing continuation bets. Master the art of floating in position and check-raising out of position.',
    iconAsset: '/icons/games/float.png',

    category: 'Drill',
    tableSize: 6,
    structure: {
        anteType: 'None',
        blindSpeed: 'Reg',
        bigBlindAmount: 100
    },

    economics: {
        stackDepth: 100,
        buyInChips: 10000
    },

    scenario: {
        heroPosition: 'BB',
        situation: 'Postflop_Check_Raise',
        villainProfile: 'TAG',
        boardTexture: 'Random',
        forcedHistory: [
            { actor: 'villain', action: 'raise', sizing: 2.5, street: 'preflop' },
            { actor: 'hero', action: 'call', sizing: 2.5, street: 'preflop' },
            { actor: 'hero', action: 'check', street: 'flop' },
            { actor: 'villain', action: 'bet', sizing: 0.66, street: 'flop' }
        ]
    },

    difficulty: {
        level: 3,
        hintsEnabled: true,
        evExplanation: true
    },

    rewards: {
        baseXP: 150,
        diamondMultiplier: 1.5,
        streakBonus: true
    },

    tags: ['cash', 'postflop', 'float', 'check-raise', 'defense'],
    version: '1.0.0'
};

// ═══════════════════════════════════════════════════════════════════════════
// GAMES 6-10: TOURNAMENT SURVIVAL
// ═══════════════════════════════════════════════════════════════════════════

const mtt_15bb_push_fold: GameDefinition = {
    id: 'mtt_15bb_push_fold',
    name: 'Push/Fold Mastery',
    description: 'Strict Nash charts for 15BB tournament play',
    longDescription: 'With 15BB, poker becomes push/fold. Learn the mathematically optimal shoving ranges from every position.',
    iconAsset: '/icons/games/push_fold.png',

    category: 'MTT',
    tableSize: 9,
    structure: {
        anteType: 'BigBlind',
        anteSize: 0.125,
        blindSpeed: 'Turbo',
        bigBlindAmount: 100
    },

    economics: {
        stackDepth: 15,
        buyInChips: 1500,
        payouts: [50, 30, 20]
    },

    scenario: {
        heroPosition: 'Random',
        situation: 'Push_Fold',
        villainProfile: 'TAG',
        boardTexture: 'Random'
    },

    difficulty: {
        level: 2,
        timeLimit: 15,
        hintsEnabled: true,
        evExplanation: true
    },

    rewards: {
        baseXP: 150,
        diamondMultiplier: 1.5,
        streakBonus: true
    },

    tags: ['mtt', 'push-fold', 'nash', 'short-stack'],
    version: '1.0.0'
};

const mtt_30bb_reshove: GameDefinition = {
    id: 'mtt_30bb_reshove',
    name: 'The Re-Steal',
    description: 'Re-shove over late position opens with 25-35BB',
    longDescription: 'The re-steal is one of the most powerful tournament weapons. Learn when to 3-bet jam over late position opens.',
    iconAsset: '/icons/games/reshove.png',

    category: 'MTT',
    tableSize: 9,
    structure: {
        anteType: 'BigBlind',
        anteSize: 0.125,
        blindSpeed: 'Turbo',
        bigBlindAmount: 100
    },

    economics: {
        stackDepth: 30,
        buyInChips: 3000,
        payouts: [50, 30, 20]
    },

    scenario: {
        heroPosition: 'BB',
        situation: 'Reshove',
        villainProfile: 'LAG',
        boardTexture: 'Random',
        forcedHistory: [
            { actor: 'villain_btn', action: 'raise', sizing: 2.2, street: 'preflop' },
            { actor: 'villain_sb', action: 'fold', street: 'preflop' }
        ]
    },

    difficulty: {
        level: 3,
        timeLimit: 20,
        hintsEnabled: true,
        evExplanation: true
    },

    rewards: {
        baseXP: 175,
        diamondMultiplier: 1.75,
        streakBonus: true
    },

    tags: ['mtt', 're-steal', '3bet-jam', 'aggression'],
    version: '1.0.0'
};

const mtt_bubble_abuse: GameDefinition = {
    id: 'mtt_bubble_abuse',
    name: 'Bubble Pressure',
    description: 'ICM pressure on medium stacks near the money',
    longDescription: 'The bubble is where fortunes are made. Learn to apply maximum ICM pressure on players desperate to cash.',
    iconAsset: '/icons/games/bubble.png',

    category: 'MTT',
    tableSize: 9,
    structure: {
        anteType: 'BigBlind',
        anteSize: 0.125,
        blindSpeed: 'Turbo',
        bigBlindAmount: 100
    },

    economics: {
        stackDepth: 25,
        buyInChips: 2500,
        payouts: [50, 30, 20],
        prizePool: 100000
    },

    scenario: {
        heroPosition: 'BTN',
        situation: 'Bubble_Pressure',
        villainProfile: 'Passive',
        boardTexture: 'Random'
    },

    visuals: {
        themeSkin: 'tournament_green',
        accentColor: '#22c55e'
    },

    difficulty: {
        level: 4,
        hintsEnabled: false,
        evExplanation: true
    },

    rewards: {
        baseXP: 200,
        diamondMultiplier: 2.0,
        streakBonus: true
    },

    unlock: {
        minLevel: 3
    },

    tags: ['mtt', 'icm', 'bubble', 'pressure', 'advanced'],
    version: '1.0.0'
};

const mtt_final_table_hu: GameDefinition = {
    id: 'mtt_final_table_hu',
    name: 'Heads Up for the Trophy',
    description: 'Final two players - winner takes all',
    longDescription: 'You\'ve made it to heads-up at the final table. Learn the adjustments needed when playing for first place.',
    iconAsset: '/icons/games/ft_hu.png',

    category: 'MTT',
    tableSize: 2,
    structure: {
        anteType: 'BigBlind',
        anteSize: 0.15,
        blindSpeed: 'Turbo',
        bigBlindAmount: 100
    },

    economics: {
        stackDepth: 40,
        buyInChips: 4000,
        payouts: [60, 40],
        prizePool: 50000
    },

    scenario: {
        heroPosition: 'Random',
        situation: 'Final_Table',
        villainProfile: 'TAG',
        boardTexture: 'Random'
    },

    visuals: {
        themeSkin: 'high_roller',
        accentColor: '#FFD700'
    },

    difficulty: {
        level: 5,
        hintsEnabled: false,
        evExplanation: true
    },

    rewards: {
        baseXP: 250,
        diamondMultiplier: 2.5,
        streakBonus: true,
        perfectBonus: 100
    },

    unlock: {
        minLevel: 8
    },

    tags: ['mtt', 'final-table', 'heads-up', 'icm', 'elite'],
    version: '1.0.0'
};

const pko_bounty_hunting: GameDefinition = {
    id: 'pko_bounty_hunting',
    name: 'Bounty Hunter',
    description: 'Adjusted calling ranges for bounty value',
    longDescription: 'In PKO tournaments, every knockout is worth money. Learn to widen your calling ranges based on bounty value.',
    iconAsset: '/icons/games/bounty.png',

    category: 'PKO',
    tableSize: 6,
    structure: {
        anteType: 'BigBlind',
        anteSize: 0.125,
        blindSpeed: 'Turbo',
        bigBlindAmount: 100
    },

    economics: {
        stackDepth: 30,
        buyInChips: 3000,
        payouts: [40, 25, 15, 10, 6, 4],
        bountyAmount: 500
    },

    scenario: {
        heroPosition: 'BB',
        situation: 'Bounty_Hunt',
        villainProfile: 'Mixed',
        boardTexture: 'Random',
        forcedHistory: [
            { actor: 'villain', action: 'all_in', street: 'preflop' }
        ]
    },

    visuals: {
        themeSkin: 'pko_bounty_hunter',
        chipStyle: 'pko_bounty',
        accentColor: '#ef4444'
    },

    difficulty: {
        level: 3,
        hintsEnabled: true,
        evExplanation: true
    },

    rewards: {
        baseXP: 175,
        diamondMultiplier: 1.75,
        streakBonus: true
    },

    tags: ['pko', 'bounty', 'calling-range', 'knockout'],
    version: '1.0.0'
};

// ═══════════════════════════════════════════════════════════════════════════
// GAMES 11-15: POST-FLOP SITUATIONS
// ═══════════════════════════════════════════════════════════════════════════

const drill_cbet_wet_board: GameDefinition = {
    id: 'drill_cbet_wet_board',
    name: 'Wet Board C-Bet',
    description: 'Continuation betting on coordinated boards',
    longDescription: 'Wet boards change everything. Learn when to c-bet, check back, or even check-raise on boards with many draws.',
    iconAsset: '/icons/games/cbet_wet.png',

    category: 'Drill',
    tableSize: 6,
    structure: {
        anteType: 'None',
        blindSpeed: 'Reg',
        bigBlindAmount: 100
    },

    economics: {
        stackDepth: 100,
        buyInChips: 10000
    },

    scenario: {
        heroPosition: 'BTN',
        situation: 'Postflop_CBet',
        villainProfile: 'TAG',
        boardTexture: 'Wet',
        forcedHistory: [
            { actor: 'hero', action: 'raise', sizing: 2.5, street: 'preflop' },
            { actor: 'villain', action: 'call', sizing: 2.5, street: 'preflop' },
            { actor: 'villain', action: 'check', street: 'flop' }
        ]
    },

    difficulty: {
        level: 3,
        hintsEnabled: true,
        evExplanation: true
    },

    rewards: {
        baseXP: 150,
        diamondMultiplier: 1.5,
        streakBonus: true
    },

    tags: ['postflop', 'cbet', 'wet-board', 'texture'],
    version: '1.0.0'
};

const drill_double_barrel: GameDefinition = {
    id: 'drill_double_barrel',
    name: 'Double Barrel',
    description: 'Turn aggression after flop c-bet',
    longDescription: 'The double barrel is key to extracting value and applying pressure. Learn which turns to continue betting on.',
    iconAsset: '/icons/games/double_barrel.png',

    category: 'Drill',
    tableSize: 6,
    structure: {
        anteType: 'None',
        blindSpeed: 'Reg',
        bigBlindAmount: 100
    },

    economics: {
        stackDepth: 100,
        buyInChips: 10000
    },

    scenario: {
        heroPosition: 'CO',
        situation: 'Double_Barrel',
        villainProfile: 'Calling_Station',
        boardTexture: 'Random',
        forcedHistory: [
            { actor: 'hero', action: 'raise', sizing: 2.5, street: 'preflop' },
            { actor: 'villain', action: 'call', sizing: 2.5, street: 'preflop' },
            { actor: 'villain', action: 'check', street: 'flop' },
            { actor: 'hero', action: 'bet', sizing: 0.66, street: 'flop' },
            { actor: 'villain', action: 'call', sizing: 0.66, street: 'flop' },
            { actor: 'villain', action: 'check', street: 'turn' }
        ]
    },

    difficulty: {
        level: 3,
        hintsEnabled: true,
        evExplanation: true
    },

    rewards: {
        baseXP: 150,
        diamondMultiplier: 1.5,
        streakBonus: true
    },

    tags: ['postflop', 'turn', 'aggression', 'barrel'],
    version: '1.0.0'
};

const drill_river_hero_call: GameDefinition = {
    id: 'drill_river_hero_call',
    name: 'River Bluff Catch',
    description: 'When to hero call river bets',
    longDescription: 'The river hero call is one of the most satisfying plays in poker. Learn to read betting patterns and identify bluffs.',
    iconAsset: '/icons/games/hero_call.png',

    category: 'Drill',
    tableSize: 6,
    structure: {
        anteType: 'None',
        blindSpeed: 'Reg',
        bigBlindAmount: 100
    },

    economics: {
        stackDepth: 100,
        buyInChips: 10000
    },

    scenario: {
        heroPosition: 'BB',
        situation: 'River_Bluff_Catch',
        villainProfile: 'LAG',
        boardTexture: 'Random',
        forcedHistory: [
            { actor: 'villain', action: 'raise', sizing: 2.5, street: 'preflop' },
            { actor: 'hero', action: 'call', sizing: 2.5, street: 'preflop' },
            { actor: 'hero', action: 'check', street: 'flop' },
            { actor: 'villain', action: 'bet', sizing: 0.5, street: 'flop' },
            { actor: 'hero', action: 'call', sizing: 0.5, street: 'flop' },
            { actor: 'hero', action: 'check', street: 'turn' },
            { actor: 'villain', action: 'bet', sizing: 0.66, street: 'turn' },
            { actor: 'hero', action: 'call', sizing: 0.66, street: 'turn' },
            { actor: 'hero', action: 'check', street: 'river' },
            { actor: 'villain', action: 'bet', sizing: 1.0, street: 'river' }
        ]
    },

    difficulty: {
        level: 4,
        hintsEnabled: false,
        evExplanation: true
    },

    rewards: {
        baseXP: 200,
        diamondMultiplier: 2.0,
        streakBonus: true
    },

    unlock: {
        minLevel: 5
    },

    tags: ['postflop', 'river', 'bluff-catch', 'hero-call'],
    version: '1.0.0'
};

const drill_monotone_flush: GameDefinition = {
    id: 'drill_monotone_flush',
    name: 'Monotone Board Play',
    description: 'Playing when 3 of the same suit flop',
    longDescription: 'Monotone boards drastically change hand equities. Learn to navigate these tricky textures.',
    iconAsset: '/icons/games/monotone.png',

    category: 'Drill',
    tableSize: 6,
    structure: {
        anteType: 'None',
        blindSpeed: 'Reg',
        bigBlindAmount: 100
    },

    economics: {
        stackDepth: 100,
        buyInChips: 10000
    },

    scenario: {
        heroPosition: 'BTN',
        situation: 'Wet_Board_Play',
        villainProfile: 'TAG',
        boardTexture: 'Monotone',
        forcedHistory: [
            { actor: 'hero', action: 'raise', sizing: 2.5, street: 'preflop' },
            { actor: 'villain', action: 'call', sizing: 2.5, street: 'preflop' },
            { actor: 'villain', action: 'check', street: 'flop' }
        ],
        requiredBoard: ['Ah', 'Kh', 'Th']
    },

    difficulty: {
        level: 4,
        hintsEnabled: true,
        evExplanation: true
    },

    rewards: {
        baseXP: 175,
        diamondMultiplier: 1.75,
        streakBonus: true
    },

    tags: ['postflop', 'monotone', 'flush', 'texture'],
    version: '1.0.0'
};

const drill_paired_board_defense: GameDefinition = {
    id: 'drill_paired_board_defense',
    name: 'Paired Board Defense',
    description: 'Defending and attacking on paired boards',
    longDescription: 'Paired boards favor the preflop aggressor. Learn when to defend your range on these scary textures.',
    iconAsset: '/icons/games/paired.png',

    category: 'Drill',
    tableSize: 6,
    structure: {
        anteType: 'None',
        blindSpeed: 'Reg',
        bigBlindAmount: 100
    },

    economics: {
        stackDepth: 100,
        buyInChips: 10000
    },

    scenario: {
        heroPosition: 'BB',
        situation: 'Postflop_Check_Raise',
        villainProfile: 'TAG',
        boardTexture: 'Paired',
        forcedHistory: [
            { actor: 'villain', action: 'raise', sizing: 2.5, street: 'preflop' },
            { actor: 'hero', action: 'call', sizing: 2.5, street: 'preflop' },
            { actor: 'hero', action: 'check', street: 'flop' },
            { actor: 'villain', action: 'bet', sizing: 0.33, street: 'flop' }
        ],
        requiredBoard: ['Kh', 'Kd', '7s']
    },

    difficulty: {
        level: 3,
        hintsEnabled: true,
        evExplanation: true
    },

    rewards: {
        baseXP: 150,
        diamondMultiplier: 1.5,
        streakBonus: true
    },

    tags: ['postflop', 'paired', 'defense', 'texture'],
    version: '1.0.0'
};

// ═══════════════════════════════════════════════════════════════════════════
// GAMES 16-20: NICHE FORMATS
// ═══════════════════════════════════════════════════════════════════════════

const spin_3max_hyper: GameDefinition = {
    id: 'spin_3max_hyper',
    name: 'Spin & Go Warfare',
    description: 'Any Two Cards battles in hyper turbo 3-max',
    longDescription: 'Spin & Gos require ultra-aggressive play. Learn the push/fold and call ranges for this fast-paced format.',
    iconAsset: '/icons/games/spin_go.png',

    category: 'Spin_Go',
    tableSize: 4, // 3-max + 1 for format
    structure: {
        anteType: 'None',
        blindSpeed: 'Hyper',
        bigBlindAmount: 100
    },

    economics: {
        stackDepth: 25,
        buyInChips: 2500,
        payouts: [100]
    },

    scenario: {
        heroPosition: 'Random',
        situation: 'Push_Fold',
        villainProfile: 'LAG',
        boardTexture: 'Random'
    },

    visuals: {
        themeSkin: 'spin_and_go',
        accentColor: '#f59e0b'
    },

    difficulty: {
        level: 3,
        timeLimit: 10,
        hintsEnabled: true,
        evExplanation: true
    },

    rewards: {
        baseXP: 175,
        diamondMultiplier: 1.75,
        streakBonus: true
    },

    tags: ['spin-go', 'hyper', 'aggressive', 'push-fold'],
    version: '1.0.0'
};

const sat_bubble_folding: GameDefinition = {
    id: 'sat_bubble_folding',
    name: 'Satellite Bubble',
    description: 'Sometimes folding Aces is correct',
    longDescription: 'In satellites, the bubble is everything. Learn the extreme ICM situations where folding premium hands is mathematically correct.',
    iconAsset: '/icons/games/sat_bubble.png',

    category: 'Satellite',
    tableSize: 6,
    structure: {
        anteType: 'BigBlind',
        anteSize: 0.125,
        blindSpeed: 'Turbo',
        bigBlindAmount: 100
    },

    economics: {
        stackDepth: 20,
        buyInChips: 2000,
        payouts: [100, 100, 100, 100, 100, 0] // Top 5 win seats
    },

    scenario: {
        heroPosition: 'Random',
        situation: 'Bubble_Defense',
        villainProfile: 'Mixed',
        boardTexture: 'Random'
    },

    visuals: {
        themeSkin: 'tournament_green',
        accentColor: '#22c55e'
    },

    difficulty: {
        level: 5,
        hintsEnabled: false,
        evExplanation: true
    },

    rewards: {
        baseXP: 250,
        diamondMultiplier: 2.5,
        streakBonus: true
    },

    unlock: {
        minLevel: 10
    },

    tags: ['satellite', 'icm', 'bubble', 'extreme-icm'],
    version: '1.0.0'
};

const hu_sng_turbo: GameDefinition = {
    id: 'hu_sng_turbo',
    name: 'HU SNG Turbo',
    description: 'Heads-up sit & go turbo format',
    longDescription: 'The purest form of poker - just you vs one opponent. Master the wide ranges needed for heads-up SNG success.',
    iconAsset: '/icons/games/hu_sng.png',

    category: 'HeadsUp_SNG',
    tableSize: 2,
    structure: {
        anteType: 'None',
        blindSpeed: 'Turbo',
        bigBlindAmount: 100
    },

    economics: {
        stackDepth: 50,
        buyInChips: 5000,
        payouts: [100, 0]
    },

    scenario: {
        heroPosition: 'Random',
        situation: 'Blind_vs_Blind',
        villainProfile: 'TAG',
        boardTexture: 'Random'
    },

    difficulty: {
        level: 3,
        hintsEnabled: true,
        evExplanation: true
    },

    rewards: {
        baseXP: 150,
        diamondMultiplier: 1.5,
        streakBonus: true
    },

    tags: ['heads-up', 'sng', 'turbo', '1v1'],
    version: '1.0.0'
};

const short_deck_ante_only: GameDefinition = {
    id: 'short_deck_ante_only',
    name: 'Short Deck Ante',
    description: 'Short deck/6+ hold\'em ante-only format',
    longDescription: 'Short Deck changes everything - flushes beat full houses, and the ante-only structure creates unique dynamics.',
    iconAsset: '/icons/games/short_deck.png',

    category: 'Cash',
    tableSize: 6,
    structure: {
        anteType: 'Classic',
        anteSize: 1.0,  // Everyone antes 1 unit
        blindSpeed: 'Reg',
        bigBlindAmount: 100
    },

    economics: {
        stackDepth: 100,
        buyInChips: 10000
    },

    scenario: {
        heroPosition: 'BTN',
        situation: 'Open_Raise',
        villainProfile: 'TAG',
        boardTexture: 'Random'
    },

    visuals: {
        accentColor: '#a855f7'
    },

    difficulty: {
        level: 4,
        hintsEnabled: true,
        evExplanation: true
    },

    rewards: {
        baseXP: 175,
        diamondMultiplier: 1.75,
        streakBonus: true
    },

    unlock: {
        isVIPOnly: true
    },

    tags: ['short-deck', '6+', 'ante-only', 'niche'],
    version: '1.0.0'
};

const bomb_pot_sim: GameDefinition = {
    id: 'bomb_pot_sim',
    name: 'Bomb Pot Chaos',
    description: '5 players see the flop with huge pot',
    longDescription: 'In bomb pots, everyone antes big and sees a flop. Navigate the multiway chaos with massive pots from the start.',
    iconAsset: '/icons/games/bomb_pot.png',

    category: 'Cash',
    tableSize: 6,
    structure: {
        anteType: 'Classic',
        anteSize: 5.0,  // 5BB ante from everyone
        blindSpeed: 'Reg',
        bigBlindAmount: 100
    },

    economics: {
        stackDepth: 100,
        buyInChips: 10000
    },

    scenario: {
        heroPosition: 'Random',
        situation: 'Bomb_Pot',
        villainProfile: 'Mixed',
        boardTexture: 'Random',
        minVillains: 4,
        maxVillains: 5,
        forcedHistory: [
            // All players ante and see flop
            { actor: 'villain', action: 'call', sizing: 0, street: 'preflop' },
            { actor: 'villain', action: 'call', sizing: 0, street: 'preflop' },
            { actor: 'villain', action: 'call', sizing: 0, street: 'preflop' },
            { actor: 'villain', action: 'call', sizing: 0, street: 'preflop' },
            { actor: 'hero', action: 'call', sizing: 0, street: 'preflop' },
            // Action starts on flop
            { actor: 'villain', action: 'check', street: 'flop' }
        ]
    },

    visuals: {
        themeSkin: 'neon_vegas',
        accentColor: '#ec4899'
    },

    difficulty: {
        level: 4,
        hintsEnabled: true,
        evExplanation: true
    },

    rewards: {
        baseXP: 200,
        diamondMultiplier: 2.0,
        streakBonus: true
    },

    unlock: {
        minLevel: 7
    },

    tags: ['bomb-pot', 'multiway', 'live', 'chaos'],
    version: '1.0.0'
};

// ═══════════════════════════════════════════════════════════════════════════
// MASTER GAMES LIST EXPORT
// ═══════════════════════════════════════════════════════════════════════════

export const GAMES_LIST: Record<string, GameDefinition> = {
    // Cash Fundamentals (1-5)
    cash_100bb_6max_btn_open,
    cash_100bb_hu_blind_war,
    cash_200bb_deep_3bp,
    cash_live_9max_limped_pot,
    cash_6max_cbet_defense,

    // Tournament Survival (6-10)
    mtt_15bb_push_fold,
    mtt_30bb_reshove,
    mtt_bubble_abuse,
    mtt_final_table_hu,
    pko_bounty_hunting,

    // Post-Flop Situations (11-15)
    drill_cbet_wet_board,
    drill_double_barrel,
    drill_river_hero_call,
    drill_monotone_flush,
    drill_paired_board_defense,

    // Niche Formats (16-20)
    spin_3max_hyper,
    sat_bubble_folding,
    hu_sng_turbo,
    short_deck_ante_only,
    bomb_pot_sim,
};

// ═══════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get a game definition by ID
 */
export function getGameDefinition(gameId: string): GameDefinition | null {
    return GAMES_LIST[gameId] || null;
}

/**
 * Get all game IDs
 */
export function getAllGameDefinitionIds(): string[] {
    return Object.keys(GAMES_LIST);
}

/**
 * Get games by category
 */
export function getGamesByCategory(category: GameDefinition['category']): GameDefinition[] {
    return Object.values(GAMES_LIST).filter(game => game.category === category);
}

/**
 * Get games by tag
 */
export function getGamesByTag(tag: string): GameDefinition[] {
    return Object.values(GAMES_LIST).filter(game => game.tags?.includes(tag));
}

/**
 * Get unlocked games for a player
 */
export function getUnlockedGameDefinitions(playerLevel: number, isVIP: boolean = false): GameDefinition[] {
    return Object.values(GAMES_LIST).filter(game => {
        const levelOk = !game.unlock?.minLevel || playerLevel >= game.unlock.minLevel;
        const vipOk = !game.unlock?.isVIPOnly || isVIP;
        return levelOk && vipOk;
    });
}

/**
 * Get total game count
 */
export function getGameDefinitionCount(): number {
    return Object.keys(GAMES_LIST).length;
}
