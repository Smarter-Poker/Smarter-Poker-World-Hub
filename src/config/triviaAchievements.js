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
        description: 'Answer Your First Trivia Question',
        icon: 'Target',
        category: 'basics',
        rarity: 'common',
        requirement: (stats) => stats.totalQuestions >= 1,
        reward: { diamonds: 5 }
    },
    {
        id: 'ten_correct',
        name: 'Getting Warm',
        description: 'Get 10 Correct Answers',
        icon: 'BookOpen',
        category: 'basics',
        rarity: 'common',
        requirement: (stats) => stats.correctAnswers >= 10,
        reward: { diamonds: 10 }
    },
    {
        id: 'fifty_correct',
        name: 'Knowledge Seeker',
        description: 'Get 50 Correct Answers',
        icon: 'Brain',
        category: 'basics',
        rarity: 'common',
        requirement: (stats) => stats.correctAnswers >= 50,
        reward: { diamonds: 25 }
    },
    {
        id: 'hundred_correct',
        name: 'Trivia Enthusiast',
        description: 'Get 100 Correct Answers',
        icon: 'Star',
        category: 'basics',
        rarity: 'rare',
        requirement: (stats) => stats.correctAnswers >= 100,
        reward: { diamonds: 50 }
    },
    {
        id: 'five_hundred_correct',
        name: 'Poker Scholar',
        description: 'Get 500 Correct Answers',
        icon: 'GraduationCap',
        category: 'basics',
        rarity: 'epic',
        requirement: (stats) => stats.correctAnswers >= 500,
        reward: { diamonds: 200 }
    },
    {
        id: 'thousand_correct',
        name: 'Walking Encyclopedia',
        description: 'Get 1,000 Correct Answers',
        icon: 'Library',
        category: 'basics',
        rarity: 'legendary',
        requirement: (stats) => stats.correctAnswers >= 1000,
        reward: { diamonds: 500 }
    },

    // === MASTERY (6) ===
    {
        id: 'perfect_game',
        name: 'Perfect Score',
        description: 'Get a Perfect Score in Any Mode',
        icon: 'BadgeCheck',
        category: 'mastery',
        rarity: 'rare',
        requirement: (stats) => stats.perfectGames >= 1,
        reward: { diamonds: 25 }
    },
    {
        id: 'five_perfects',
        name: 'Precision Player',
        description: 'Get 5 Perfect Scores',
        icon: 'Crosshair',
        category: 'mastery',
        rarity: 'epic',
        requirement: (stats) => stats.perfectGames >= 5,
        reward: { diamonds: 75 }
    },
    {
        id: 'ten_perfects',
        name: 'Perfectionist',
        description: 'Get 10 Perfect Scores',
        icon: 'Eye',
        category: 'mastery',
        rarity: 'legendary',
        requirement: (stats) => stats.perfectGames >= 10,
        reward: { diamonds: 150 }
    },
    {
        id: 'history_master',
        name: 'Historian',
        description: 'Get 50 Correct in Poker History',
        icon: 'Scroll',
        category: 'mastery',
        rarity: 'rare',
        requirement: (stats) => stats.categoryCorrect?.history >= 50,
        reward: { diamonds: 30 }
    },
    {
        id: 'rules_master',
        name: 'Rules Expert',
        description: 'Get 50 Correct in Rules Quiz',
        icon: 'Scale',
        category: 'mastery',
        rarity: 'rare',
        requirement: (stats) => stats.categoryCorrect?.rules >= 50,
        reward: { diamonds: 30 }
    },
    {
        id: 'pro_master',
        name: 'Strategy Sage',
        description: 'Get 50 Correct in Pro Knowledge',
        icon: 'Wand2',
        category: 'mastery',
        rarity: 'rare',
        requirement: (stats) => stats.categoryCorrect?.pro >= 50,
        reward: { diamonds: 30 }
    },

    // === STREAKS (6) ===
    {
        id: 'streak_3',
        name: 'Consistent',
        description: 'Reach a 3-day Streak',
        icon: 'Flame',
        category: 'streaks',
        rarity: 'common',
        requirement: (stats) => stats.bestStreak >= 3,
        reward: { diamonds: 10 }
    },
    {
        id: 'streak_7',
        name: 'Weekly Warrior',
        description: 'Reach a 7-day Streak',
        icon: 'Dumbbell',
        category: 'streaks',
        rarity: 'rare',
        requirement: (stats) => stats.bestStreak >= 7,
        reward: { diamonds: 50 }
    },
    {
        id: 'streak_14',
        name: 'Dedicated Mind',
        description: 'Reach a 14-day Streak',
        icon: 'Trophy',
        category: 'streaks',
        rarity: 'epic',
        requirement: (stats) => stats.bestStreak >= 14,
        reward: { diamonds: 100 }
    },
    {
        id: 'streak_30',
        name: 'Iron Mind',
        description: 'Reach a 30-day Streak',
        icon: 'Shield',
        category: 'streaks',
        rarity: 'epic',
        requirement: (stats) => stats.bestStreak >= 30,
        reward: { diamonds: 200 }
    },
    {
        id: 'streak_100',
        name: 'Legendary Mind',
        description: 'Reach a 100-day Streak',
        icon: 'Crown',
        category: 'streaks',
        rarity: 'legendary',
        requirement: (stats) => stats.bestStreak >= 100,
        reward: { diamonds: 500 }
    },
    {
        id: 'streak_365',
        name: 'Year of Knowledge',
        description: 'Reach a 365-day Streak',
        icon: 'Sparkles',
        category: 'streaks',
        rarity: 'legendary',
        requirement: (stats) => stats.bestStreak >= 365,
        reward: { diamonds: 2000 }
    },

    // === SPEED (4) ===
    {
        id: 'quick_draw',
        name: 'Quick Draw',
        description: 'Answer Correctly in Under 3 Seconds',
        icon: 'Zap',
        category: 'speed',
        rarity: 'rare',
        requirement: (stats) => stats.fastestAnswer <= 3,
        reward: { diamonds: 15 }
    },
    {
        id: 'lightning_fast',
        name: 'Lightning Fast',
        description: 'Answer Correctly in Under 2 Seconds',
        icon: 'Zap',
        category: 'speed',
        rarity: 'epic',
        requirement: (stats) => stats.fastestAnswer <= 2,
        reward: { diamonds: 30 }
    },
    {
        id: 'speed_demon',
        name: 'Speed Demon',
        description: 'Complete a Game with Avg Time Under 5 Seconds',
        icon: 'Gauge',
        category: 'speed',
        rarity: 'epic',
        requirement: (stats) => stats.fastestGame?.avgTime <= 5,
        reward: { diamonds: 50 }
    },
    {
        id: 'blitz_master',
        name: 'Blitz Master',
        description: 'Win 10 Games with Avg Time Under 5 Seconds',
        icon: 'Wind',
        category: 'speed',
        rarity: 'legendary',
        requirement: (stats) => stats.fastGamesWon >= 10,
        reward: { diamonds: 150 }
    },

    // === ARCADE (4) ===
    {
        id: 'arcade_debut',
        name: 'High Roller',
        description: 'Play Your First Arcade Game',
        icon: 'Gem',
        category: 'arcade',
        rarity: 'common',
        requirement: (stats) => stats.arcadeGames >= 1,
        reward: { diamonds: 10 }
    },
    {
        id: 'arcade_veteran',
        name: 'Diamond Hunter',
        description: 'Play 25 Arcade Games',
        icon: 'Coins',
        category: 'arcade',
        rarity: 'rare',
        requirement: (stats) => stats.arcadeGames >= 25,
        reward: { diamonds: 75 }
    },
    {
        id: 'arcade_profit',
        name: 'In The Black',
        description: 'Earn 500 Diamonds From Arcade',
        icon: 'TrendingUp',
        category: 'arcade',
        rarity: 'epic',
        requirement: (stats) => stats.arcadeDiamondsEarned >= 500,
        reward: { diamonds: 100 }
    },
    {
        id: 'arcade_whale',
        name: 'Diamond Whale',
        description: 'Earn 2000 Diamonds From Arcade',
        icon: 'Waves',
        category: 'arcade',
        rarity: 'legendary',
        requirement: (stats) => stats.arcadeDiamondsEarned >= 2000,
        reward: { diamonds: 300 }
    },

    // === SPECIAL (4) ===
    {
        id: 'night_owl',
        name: 'Night Owl',
        description: 'Play Between 2am and 5am',
        icon: 'Moon',
        category: 'special',
        rarity: 'rare',
        requirement: (stats) => stats.playedLateNight,
        reward: { diamonds: 25 }
    },
    {
        id: 'early_bird',
        name: 'Early Bird',
        description: 'Play Before 6am',
        icon: 'Sunrise',
        category: 'special',
        rarity: 'rare',
        requirement: (stats) => stats.playedEarlyMorning,
        reward: { diamonds: 25 }
    },
    {
        id: 'comeback_kid',
        name: 'Comeback Kid',
        description: 'Win a Game After Missing 3+ Questions',
        icon: 'RefreshCw',
        category: 'special',
        rarity: 'epic',
        requirement: (stats) => stats.comebackWins >= 1,
        reward: { diamonds: 40 }
    },
    {
        id: 'marathon',
        name: 'Marathon',
        description: 'Play 10 Games in a Single Day',
        icon: 'Footprints',
        category: 'special',
        rarity: 'epic',
        requirement: (stats) => stats.maxGamesInDay >= 10,
        reward: { diamonds: 75 }
    }
];

// Category groupings
export const ACHIEVEMENT_CATEGORIES = [
    { id: 'basics', name: 'Basics', icon: 'BookOpen', color: '#60a5fa' },
    { id: 'mastery', name: 'Mastery', icon: 'GraduationCap', color: '#fbbf24' },
    { id: 'streaks', name: 'Streaks', icon: 'Flame', color: '#f97316' },
    { id: 'speed', name: 'Speed', icon: 'Zap', color: '#22c55e' },
    { id: 'arcade', name: 'Arcade', icon: 'Gem', color: '#00d4ff' },
    { id: 'special', name: 'Special', icon: 'Star', color: '#a78bfa' }
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
 * Evaluate one achievement predicate defensively.
 * A single bad predicate used to take down the whole scan (checkNewUnlocks and
 * getAchievementProgress both threw 'ReferenceError: Stats is not defined' for
 * ANY input because three speed achievements referenced a capital-S `Stats`).
 * @returns {boolean}
 */
export function isUnlocked(achievement, stats) {
    try {
        return !!achievement?.requirement?.(stats || {});
    } catch (err) {
        console.warn(`[triviaAchievements] requirement for "${achievement?.id}" threw:`, err?.message || err);
        return false;
    }
}

/**
 * Check which achievements are newly unlocked
 * @param {object} stats - from computeTriviaStats()
 * @param {string[]} previousUnlocked - achievement ids already granted
 */
export function checkNewUnlocks(stats, previousUnlocked = []) {
    const already = new Set(Array.isArray(previousUnlocked) ? previousUnlocked : []);
    const newlyUnlocked = [];

    for (const achievement of TRIVIA_ACHIEVEMENTS) {
        if (already.has(achievement.id)) continue;
        if (isUnlocked(achievement, stats)) newlyUnlocked.push(achievement);
    }

    return newlyUnlocked;
}

/**
 * Total diamonds owed for a set of newly-unlocked achievements.
 * @param {Array} achievements
 * @returns {number}
 */
export function sumAchievementRewards(achievements) {
    if (!Array.isArray(achievements)) return 0;
    return achievements.reduce((sum, a) => sum + (a?.reward?.diamonds || 0), 0);
}

/**
 * Get total achievements count and unlocked count
 */
export function getAchievementProgress(stats) {
    const total = TRIVIA_ACHIEVEMENTS.length;
    const unlocked = TRIVIA_ACHIEVEMENTS.filter(a => isUnlocked(a, stats)).length;

    return { total, unlocked, percentage: total > 0 ? Math.round((unlocked / total) * 100) : 0 };
}

// ═══════════════════════════════════════════════════════════════════════════
// SHARED STATS AGGREGATOR
// ═══════════════════════════════════════════════════════════════════════════

/** Mode -> the categoryCorrect bucket the mastery achievements read. */
const MODE_TO_BUCKET = {
    history: 'history',
    rules: 'rules',
    pro: 'pro',
    daily: 'daily',
    arcade: 'arcade',
    mtt: 'mtt',
    cash: 'cash',
    icm: 'icm',
    gto: 'gto',
};

function chicagoHour(iso) {
    if (!iso) return null;
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return null;
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/Chicago',
        hour: '2-digit',
        hour12: false,
    }).formatToParts(d);
    const raw = parts.find(p => p.type === 'hour')?.value;
    const hour = parseInt(raw, 10);
    return Number.isFinite(hour) ? hour % 24 : null;
}

/**
 * Compute every stat field the achievement predicates need, from raw rows.
 * One implementation so achievements.js, stats.js and index.js can never
 * disagree about a player's numbers.
 *
 * @param {object[]} scores - trivia_scores rows (mode, score, correct_count,
 *        total_questions, diamonds_earned, time_spent, play_date, created_at)
 * @param {object} [streakRow] - trivia_streaks row
 * @param {object} [extra] - anything already known (fastestAnswer seconds,
 *        comebackWins, ...) that cannot be derived from trivia_scores
 * @returns {object} stats object accepted by checkNewUnlocks/getAchievementProgress
 */
export function computeTriviaStats(scores, streakRow = null, extra = {}) {
    const rows = Array.isArray(scores) ? scores.filter(Boolean) : [];

    const stats = {
        totalGames: rows.length,
        totalQuestions: 0,
        correctAnswers: 0,
        perfectGames: 0,
        arcadeGames: 0,
        arcadeDiamondsEarned: 0,
        fastGamesWon: 0,
        maxGamesInDay: 0,
        playedLateNight: false,
        playedEarlyMorning: false,
        categoryCorrect: {},
        bestStreak: streakRow?.best_streak || 0,
        currentStreak: streakRow?.current_streak || 0,
        comebackWins: 0,
        fastestAnswer: Number.POSITIVE_INFINITY,
        fastestGame: null,
    };

    const perDay = new Map();
    let bestAvgTime = Number.POSITIVE_INFINITY;

    for (const row of rows) {
        const correct = Number(row.correct_count) || 0;
        const total = Number(row.total_questions) || 0;
        stats.correctAnswers += correct;
        stats.totalQuestions += total;

        if (total > 0 && correct === total) stats.perfectGames += 1;

        const bucket = MODE_TO_BUCKET[row.mode];
        if (bucket) stats.categoryCorrect[bucket] = (stats.categoryCorrect[bucket] || 0) + correct;

        if (row.mode === 'arcade') {
            stats.arcadeGames += 1;
            stats.arcadeDiamondsEarned += Number(row.diamonds_earned) || 0;
        }

        if (row.play_date) perDay.set(row.play_date, (perDay.get(row.play_date) || 0) + 1);

        const timeSpent = Number(row.time_spent) || 0;
        if (timeSpent > 0 && total > 0) {
            const avgTime = timeSpent / total;
            if (avgTime < bestAvgTime) bestAvgTime = avgTime;
            // "Won" = a majority-correct run, matching the blitz_master wording.
            if (avgTime < 5 && correct * 2 > total) stats.fastGamesWon += 1;
        }

        const hour = chicagoHour(row.created_at);
        if (hour != null) {
            if (hour >= 2 && hour < 5) stats.playedLateNight = true;
            if (hour < 6) stats.playedEarlyMorning = true;
        }
    }

    for (const count of perDay.values()) {
        if (count > stats.maxGamesInDay) stats.maxGamesInDay = count;
    }

    if (Number.isFinite(bestAvgTime)) stats.fastestGame = { avgTime: bestAvgTime };

    // Merge caller-supplied fields that trivia_scores cannot express.
    const merged = { ...stats, ...(extra || {}) };
    if (!Number.isFinite(merged.fastestAnswer)) merged.fastestAnswer = Number.POSITIVE_INFINITY;
    return merged;
}
