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
    xpEarned: number;
    diamondsEarned: number;
    streakBonus: number;
}

export const TRIVIA_MODES = {
    daily: {
        id: 'daily',
        name: 'Daily Trivia',
        description: '1 Question • Once Per Day',
        questionsCount: 1,
        timeLimit: null,
        xpBase: 50,
        diamondCost: 0,
        diamondReward: 0,
        icon: 'lightning',
        color: '#00ccff'
    },
    history: {
        id: 'history',
        name: 'Poker History',
        description: 'Iconic moments, famous hands, legendary players',
        questionsCount: 10,
        timeLimit: null,
        xpBase: 10,
        diamondCost: 0,
        diamondReward: 0,
        icon: 'trophy',
        color: '#fbbf24'
    },
    rules: {
        id: 'rules',
        name: 'Rules Quiz',
        description: 'Test your understanding of official poker rules',
        questionsCount: 10,
        timeLimit: null,
        xpBase: 10,
        diamondCost: 0,
        diamondReward: 0,
        icon: 'book',
        color: '#3b82f6'
    },
    pro: {
        id: 'pro',
        name: 'Pro Knowledge',
        description: 'Strategy concepts, GTO basics, advanced trivia',
        questionsCount: 10,
        timeLimit: null,
        xpBase: 15,
        diamondCost: 0,
        diamondReward: 0,
        icon: 'graduation',
        color: '#8b5cf6'
    },
    arcade: {
        id: 'arcade',
        name: 'Diamond Arcade',
        description: 'High-speed trivia for Diamond rewards',
        questionsCount: 10,
        timeLimit: 60,
        xpBase: 0,
        diamondCost: 10,
        diamondReward: 100,
        icon: 'diamond',
        color: '#06b6d4'
    }
} as const;

export type TriviaMode = keyof typeof TRIVIA_MODES;

export function calculateXP(
    mode: TriviaMode,
    correctCount: number,
    totalQuestions: number,
    streak: number
): number {
    const config = TRIVIA_MODES[mode];
    const baseXP = config.xpBase * correctCount;
    const streakBonus = Math.min(streak, 7) * 5;
    const accuracyBonus = correctCount === totalQuestions ? 25 : 0;
    return baseXP + streakBonus + accuracyBonus;
}

export function calculateDiamonds(
    mode: TriviaMode,
    correctCount: number,
    totalQuestions: number,
    timeRemaining: number
): number {
    if (mode !== 'arcade') return 0;

    const config = TRIVIA_MODES[mode];
    const accuracy = correctCount / totalQuestions;
    const timeBonus = Math.floor(timeRemaining / 6);

    if (accuracy < 0.5) return 0;
    if (accuracy < 0.7) return Math.floor(config.diamondReward * 0.2) + timeBonus;
    if (accuracy < 0.9) return Math.floor(config.diamondReward * 0.5) + timeBonus;
    return config.diamondReward + timeBonus;
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
        default: return 'General';
    }
}
