/**
 * TRIVIA ACHIEVEMENTS — Expanded achievement system (30 achievements)
 * Categories: Basics, Mastery, Streaks, Speed, Social, Rare
 */

// Achievement definitions with unlock conditions
export const TRIVIA_ACHIEVEMENTS = [
    // === BASICS (6) ===
    {
        id: 'first_question',
        name: 'First Steps',
        description: 'Answer your first trivia question',
        icon: '🎯',
        category: 'basics',
        rarity: 'common',
        requirement: (stats) => stats.totalQuestions >= 1,
        reward: { diamonds: 5 }
    },
    {
        id: 'ten_correct',
        name: 'Getting Warm',
        description: 'Get 10 correct answers',
        icon: '📚',
        category: 'basics',
        rarity: 'common',
        requirement: (stats) => stats.correctAnswers >= 10,
        reward: { diamonds: 10 }
    },
    {
        id: 'fifty_correct',
        name: 'Knowledge Seeker',
        description: 'Get 50 correct answers',
        icon: '🧠',
        category: 'basics',
        rarity: 'common',
        requirement: (stats) => stats.correctAnswers >= 50,
        reward: { diamonds: 25 }
    },
    {
        id: 'hundred_correct',
        name: 'Trivia Enthusiast',
        description: 'Get 100 correct answers',
        icon: '⭐',
        category: 'basics',
        rarity: 'rare',
        requirement: (stats) => stats.correctAnswers >= 100,
        reward: { diamonds: 50 }
    },
    {
        id: 'five_hundred_correct',
        name: 'Poker Scholar',
        description: 'Get 500 correct answers',
        icon: '🎓',
        category: 'basics',
        rarity: 'epic',
        requirement: (stats) => stats.correctAnswers >= 500,
        reward: { diamonds: 200 }
    },
    {
        id: 'thousand_correct',
        name: 'Walking Encyclopedia',
        description: 'Get 1,000 correct answers',
        icon: '📖',
        category: 'basics',
        rarity: 'legendary',
        requirement: (stats) => stats.correctAnswers >= 1000,
        reward: { diamonds: 500 }
    },

    // === MASTERY (6) ===
    {
        id: 'perfect_game',
        name: 'Perfect Score',
        description: 'Get a perfect score in any mode',
        icon: '💯',
        category: 'mastery',
        rarity: 'rare',
        requirement: (stats) => stats.perfectGames >= 1,
        reward: { diamonds: 25 }
    },
    {
        id: 'five_perfects',
        name: 'Precision Player',
        description: 'Get 5 perfect scores',
        icon: '🎯',
        category: 'mastery',
        rarity: 'epic',
        requirement: (stats) => stats.perfectGames >= 5,
        reward: { diamonds: 75 }
    },
    {
        id: 'ten_perfects',
        name: 'Perfectionist',
        description: 'Get 10 perfect scores',
        icon: '👁️',
        category: 'mastery',
        rarity: 'legendary',
        requirement: (stats) => stats.perfectGames >= 10,
        reward: { diamonds: 150 }
    },
    {
        id: 'history_master',
        name: 'Historian',
        description: 'Get 50 correct in Poker History',
        icon: '📜',
        category: 'mastery',
        rarity: 'rare',
        requirement: (stats) => stats.categoryCorrect?.history >= 50,
        reward: { diamonds: 30 }
    },
    {
        id: 'rules_master',
        name: 'Rules Expert',
        description: 'Get 50 correct in Rules Quiz',
        icon: '⚖️',
        category: 'mastery',
        rarity: 'rare',
        requirement: (stats) => stats.categoryCorrect?.rules >= 50,
        reward: { diamonds: 30 }
    },
    {
        id: 'pro_master',
        name: 'Strategy Sage',
        description: 'Get 50 correct in Pro Knowledge',
        icon: '🧙',
        category: 'mastery',
        rarity: 'rare',
        requirement: (stats) => stats.categoryCorrect?.pro >= 50,
        reward: { diamonds: 30 }
    },

    // === STREAKS (6) ===
    {
        id: 'streak_3',
        name: 'Consistent',
        description: 'Reach a 3-day streak',
        icon: '🔥',
        category: 'streaks',
        rarity: 'common',
        requirement: (stats) => stats.bestStreak >= 3,
        reward: { diamonds: 10 }
    },
    {
        id: 'streak_7',
        name: 'Weekly Warrior',
        description: 'Reach a 7-day streak',
        icon: '💪',
        category: 'streaks',
        rarity: 'rare',
        requirement: (stats) => stats.bestStreak >= 7,
        reward: { diamonds: 50 }
    },
    {
        id: 'streak_14',
        name: 'Dedicated Mind',
        description: 'Reach a 14-day streak',
        icon: '🏆',
        category: 'streaks',
        rarity: 'epic',
        requirement: (stats) => stats.bestStreak >= 14,
        reward: { diamonds: 100 }
    },
    {
        id: 'streak_30',
        name: 'Iron Mind',
        description: 'Reach a 30-day streak',
        icon: '🛡️',
        category: 'streaks',
        rarity: 'epic',
        requirement: (stats) => stats.bestStreak >= 30,
        reward: { diamonds: 200 }
    },
    {
        id: 'streak_100',
        name: 'Legendary Mind',
        description: 'Reach a 100-day streak',
        icon: '👑',
        category: 'streaks',
        rarity: 'legendary',
        requirement: (stats) => stats.bestStreak >= 100,
        reward: { diamonds: 500 }
    },
    {
        id: 'streak_365',
        name: 'Year of Knowledge',
        description: 'Reach a 365-day streak',
        icon: '🌟',
        category: 'streaks',
        rarity: 'legendary',
        requirement: (stats) => stats.bestStreak >= 365,
        reward: { diamonds: 2000 }
    },

    // === SPEED (4) ===
    {
        id: 'quick_draw',
        name: 'Quick Draw',
        description: 'Answer correctly in under 3 seconds',
        icon: '⚡',
        category: 'speed',
        rarity: 'rare',
        requirement: (stats) => stats.fastestAnswer <= 3,
        reward: { diamonds: 15 }
    },
    {
        id: 'lightning_fast',
        name: 'Lightning Fast',
        description: 'Answer correctly in under 2 seconds',
        icon: '⚡',
        category: 'speed',
        rarity: 'epic',
        requirement: (stats) => stats.fastestAnswer <= 2,
        reward: { diamonds: 30 }
    },
    {
        id: 'speed_demon',
        name: 'Speed Demon',
        description: 'Complete a game with avg time under 5 seconds',
        icon: '🏎️',
        category: 'speed',
        rarity: 'epic',
        requirement: (stats) => stats.fastestGame?.avgTime <= 5,
        reward: { diamonds: 50 }
    },
    {
        id: 'blitz_master',
        name: 'Blitz Master',
        description: 'Win 10 games with avg time under 5 seconds',
        icon: '💨',
        category: 'speed',
        rarity: 'legendary',
        requirement: (stats) => stats.fastGamesWon >= 10,
        reward: { diamonds: 150 }
    },

    // === ARCADE (4) ===
    {
        id: 'arcade_debut',
        name: 'High Roller',
        description: 'Play your first Arcade game',
        icon: '💎',
        category: 'arcade',
        rarity: 'common',
        requirement: (stats) => stats.arcadeGames >= 1,
        reward: { diamonds: 10 }
    },
    {
        id: 'arcade_veteran',
        name: 'Diamond Hunter',
        description: 'Play 25 Arcade games',
        icon: '💰',
        category: 'arcade',
        rarity: 'rare',
        requirement: (stats) => stats.arcadeGames >= 25,
        reward: { diamonds: 75 }
    },
    {
        id: 'arcade_profit',
        name: 'In The Black',
        description: 'Earn 500 diamonds from Arcade',
        icon: '📈',
        category: 'arcade',
        rarity: 'epic',
        requirement: (stats) => stats.arcadeDiamondsEarned >= 500,
        reward: { diamonds: 100 }
    },
    {
        id: 'arcade_whale',
        name: 'Diamond Whale',
        description: 'Earn 2000 diamonds from Arcade',
        icon: '🐳',
        category: 'arcade',
        rarity: 'legendary',
        requirement: (stats) => stats.arcadeDiamondsEarned >= 2000,
        reward: { diamonds: 300 }
    },

    // === SPECIAL (4) ===
    {
        id: 'night_owl',
        name: 'Night Owl',
        description: 'Play between 2am and 5am',
        icon: '🦉',
        category: 'special',
        rarity: 'rare',
        requirement: (stats) => stats.playedLateNight,
        reward: { diamonds: 25 }
    },
    {
        id: 'early_bird',
        name: 'Early Bird',
        description: 'Play before 6am',
        icon: '🐦',
        category: 'special',
        rarity: 'rare',
        requirement: (stats) => stats.playedEarlyMorning,
        reward: { diamonds: 25 }
    },
    {
        id: 'comeback_kid',
        name: 'Comeback Kid',
        description: 'Win a game after missing 3+ questions',
        icon: '🔄',
        category: 'special',
        rarity: 'epic',
        requirement: (stats) => stats.comebackWins >= 1,
        reward: { diamonds: 40 }
    },
    {
        id: 'marathon',
        name: 'Marathon',
        description: 'Play 10 games in a single day',
        icon: '🏃',
        category: 'special',
        rarity: 'epic',
        requirement: (stats) => stats.maxGamesInDay >= 10,
        reward: { diamonds: 75 }
    }
];

// Category groupings
export const ACHIEVEMENT_CATEGORIES = [
    { id: 'basics', name: 'Basics', icon: '📚', color: '#60a5fa' },
    { id: 'mastery', name: 'Mastery', icon: '🎓', color: '#fbbf24' },
    { id: 'streaks', name: 'Streaks', icon: '🔥', color: '#f97316' },
    { id: 'speed', name: 'Speed', icon: '⚡', color: '#22c55e' },
    { id: 'arcade', name: 'Arcade', icon: '💎', color: '#00d4ff' },
    { id: 'special', name: 'Special', icon: '⭐', color: '#a78bfa' }
];

// Rarity configurations
export const RARITY_CONFIG = {
    common: { color: '#94a3b8', label: 'Common' },
    rare: { color: '#60a5fa', label: 'Rare' },
    epic: { color: '#a855f7', label: 'Epic' },
    legendary: { color: '#ffd700', label: 'Legendary' }
};

/**
 * Get achievements by category
 */
export function getAchievementsByCategory(categoryId) {
    return TRIVIA_ACHIEVEMENTS.filter(a => a.category === categoryId);
}

/**
 * Check which achievements are newly unlocked
 */
export function checkNewUnlocks(stats, previousUnlocked = []) {
    const newlyUnlocked = [];

    for (const achievement of TRIVIA_ACHIEVEMENTS) {
        const wasUnlocked = previousUnlocked.includes(achievement.id);
        const isNowUnlocked = achievement.requirement(stats);

        if (isNowUnlocked && !wasUnlocked) {
            newlyUnlocked.push(achievement);
        }
    }

    return newlyUnlocked;
}

/**
 * Get total achievements count and unlocked count
 */
export function getAchievementProgress(stats) {
    const total = TRIVIA_ACHIEVEMENTS.length;
    const unlocked = TRIVIA_ACHIEVEMENTS.filter(a => a.requirement(stats)).length;

    return { total, unlocked, percentage: Math.round((unlocked / total) * 100) };
}
