/**
 * TRIVIA ENGINE - Core game logic
 */

export interface TriviaQuestion {
    id: string;
    category: string;
    difficulty: 'easy' | 'medium' | 'hard';
    question: string;
    options: string[];
    correct_index: number;
    explanation?: string;
}

export interface TriviaSession {
    mode: string;
    questions: TriviaQuestion[];
    currentIndex: number;
    answers: number[];
    correctCount: number;
    startTime: number;
    timeLimit?: number;
}

export interface TriviaResult {
    mode: string;
    totalQuestions: number;
    correctCount: number;
    accuracy: number;
    timeSpent: number;

    diamondsEarned: number;
    streakBonus: number;
}

export const TRIVIA_MODES = {
    daily: {
        id: 'daily',
        name: 'Daily Trivia',
        description: '10 Questions • Fresh Daily',
        questionsCount: 10,
        timeLimit: null,
        diamondCost: 0,
        diamondReward: 5,
        perfectBonus: 10,
        icon: 'lightning',
        color: '#00ccff'
    },
    history: {
        id: 'history',
        name: 'Poker History',
        description: 'Iconic moments, famous hands, legendary players',
        questionsCount: 10,
        timeLimit: null,
        diamondCost: 0,
        diamondReward: 3,
        perfectBonus: 5,
        icon: 'trophy',
        color: '#fbbf24'
    },
    rules: {
        id: 'rules',
        name: 'Rules Quiz',
        description: 'Test your understanding of official poker rules',
        questionsCount: 10,
        timeLimit: null,
        diamondCost: 0,
        diamondReward: 3,
        perfectBonus: 5,
        icon: 'book',
        color: '#3b82f6'
    },
    pro: {
        id: 'pro',
        name: 'Pro Knowledge',
        description: 'Strategy concepts, GTO basics, advanced trivia',
        questionsCount: 10,
        timeLimit: null,
        diamondCost: 0,
        diamondReward: 5,
        perfectBonus: 10,
        icon: 'graduation',
        color: '#8b5cf6'
    },
    arcade: {
        id: 'arcade',
        name: 'Quick Stakes',
        description: 'Fast-paced trivia with Diamond entry',
        questionsCount: 10,
        timeLimit: 60,
        diamondCost: 10,
        diamondReward: 100,
        perfectBonus: 50,
        icon: 'diamond',
        color: '#06b6d4'
    },
    survival: {
        id: 'survival',
        name: 'Survival Mode',
        description: 'Answer until you miss. Rewards stack!',
        questionsCount: 100, // Unlimited effectively
        timeLimit: null,
        diamondCost: 0,
        diamondReward: 1, // Per correct answer
        perfectBonus: 0,
        icon: 'heart',
        color: '#ef4444'
    },
    // NEW GAME MODES - Strategy Categories
    mtt: {
        id: 'mtt',
        name: 'MTT Scenarios',
        description: 'Multi-table tournament situations and decisions',
        questionsCount: 10,
        timeLimit: null,
        diamondCost: 0,
        diamondReward: 5,
        perfectBonus: 10,
        icon: 'users',
        color: '#f97316'
    },
    cash: {
        id: 'cash',
        name: 'Cash Game',
        description: 'Deep stack scenarios, implied odds, table dynamics',
        questionsCount: 10,
        timeLimit: null,
        diamondCost: 0,
        diamondReward: 5,
        perfectBonus: 10,
        icon: 'banknote',
        color: '#22c55e'
    },
    icm: {
        id: 'icm',
        name: 'ICM & Chip EV',
        description: 'Tournament equity, chip value vs $EV decisions',
        questionsCount: 10,
        timeLimit: null,
        diamondCost: 0,
        diamondReward: 5,
        perfectBonus: 10,
        icon: 'calculator',
        color: '#06b6d4'
    },
    gto: {
        id: 'gto',
        name: 'GTO Master',
        description: 'Solver-based scenarios combining MTT, Cash, and ICM',
        questionsCount: 10,
        timeLimit: null,
        diamondCost: 0,
        diamondReward: 8,
        perfectBonus: 15,
        icon: 'brain',
        color: '#a855f7'
    }
} as const;

export type TriviaMode = keyof typeof TRIVIA_MODES;

// Category mappings for new modes
export const CATEGORY_MAPPINGS = {
    mtt: ['mtt_situations'],
    cash: ['cash_game_situations'],
    icm: ['icm_chip_ev'],
    gto: ['gto_theory', 'mtt_situations', 'cash_game_situations', 'icm_chip_ev'],
    history: ['poker_history', 'famous_hands', 'player_profiles'],
    rules: ['rule_knowledge'],
    pro: ['gto_theory', 'tournament_facts']
} as const;

export function calculateDiamonds(
    mode: TriviaMode,
    correctCount: number,
    totalQuestions: number,
    timeRemaining: number = 0
): number {
    const config = TRIVIA_MODES[mode];
    const accuracy = totalQuestions > 0 ? correctCount / totalQuestions : 0;

    // Survival mode: 1 diamond per correct, 2x every 5
    if (mode === 'survival') {
        let total = 0;
        for (let i = 1; i <= correctCount; i++) {
            const multiplier = Math.floor((i - 1) / 5) + 1;
            total += multiplier;
        }
        return total;
    }

    // Quick Stakes (arcade): Original tiered system
    if (mode === 'arcade') {
        const timeBonus = Math.floor(timeRemaining / 6);
        if (accuracy < 0.5) return 0;
        if (accuracy < 0.7) return Math.floor(config.diamondReward * 0.2) + timeBonus;
        if (accuracy < 0.9) return Math.floor(config.diamondReward * 0.5) + timeBonus;
        return config.diamondReward + config.perfectBonus + timeBonus;
    }

    // All other modes: Base reward + perfect bonus
    if (accuracy === 1.0) {
        return config.diamondReward + config.perfectBonus;
    } else if (accuracy >= 0.7) {
        return config.diamondReward;
    } else if (accuracy >= 0.5) {
        return Math.floor(config.diamondReward * 0.5);
    }

    return 0; // Less than 50% accuracy = no diamonds
}

export function getDifficultyColor(difficulty: string): string {
    switch (difficulty) {
        case 'easy': return '#22c55e';
        case 'medium': return '#fbbf24';
        case 'hard': return '#ef4444';
        default: return '#6b7280';
    }
}

export function getCategoryIcon(category: string): string {
    switch (category) {
        case 'poker_history': return '📜';
        case 'famous_hands': return '🃏';
        case 'gto_theory': return '🧮';
        case 'player_profiles': return '👤';
        case 'tournament_facts': return '🏆';
        case 'rule_knowledge': return '📋';
        // New categories
        case 'mtt_situations': return '🎯';
        case 'cash_game_situations': return '💵';
        case 'icm_chip_ev': return '📊';
        default: return '❓';
    }
}

export function getCategoryName(category: string): string {
    switch (category) {
        case 'poker_history': return 'Poker History';
        case 'famous_hands': return 'Famous Hands';
        case 'gto_theory': return 'GTO Theory';
        case 'player_profiles': return 'Player Profiles';
        case 'tournament_facts': return 'Tournament Facts';
        case 'rule_knowledge': return 'Rules & Etiquette';
        // New categories
        case 'mtt_situations': return 'MTT Scenarios';
        case 'cash_game_situations': return 'Cash Game';
        case 'icm_chip_ev': return 'ICM & Chip EV';
        default: return 'General';
    }
}
