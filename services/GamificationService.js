/**
 * 🎮 GAMIFICATION SERVICE
 * ═══════════════════════════════════════════════════════════════════════════
 * Client-side service for recording training sessions and updating gamification
 * ═══════════════════════════════════════════════════════════════════════════
 */

const GamificationService = {
    /**
     * Record a completed training session
     * Updates leaderboard, checks achievements, and updates daily streak
     */
    async recordSession({
        userId,
        gameId,
        accuracy,
        questionsAnswered,
        questionsCorrect,
        bestStreak,
        levelPassed
    }) {
        if (!userId) {
            console.warn('[GamificationService] No userId provided, skipping');
            return { success: false, error: 'No userId' };
        }

        const results = {
            leaderboard: null,
            achievements: null,
            streak: null,
            newlyUnlocked: [],
            errors: []
        };

        // 1. Update leaderboard
        try {
            const leaderboardRes = await fetch('/api/training/leaderboard', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userId,
                    gameId,
                    accuracy,
                    questionsAnswered,
                    questionsCorrect,
                    bestStreak
                })
            });
            results.leaderboard = await leaderboardRes.json();
        } catch (e) {
            console.error('[GamificationService] Leaderboard error:', e);
            results.errors.push('leaderboard');
        }

        // 2. Check achievements
        try {
            const achievementsRes = await fetch('/api/training/achievements', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userId,
                    stats: {
                        accuracy,
                        currentStreak: bestStreak,
                        totalSessions: 1,
                        totalCorrect: questionsCorrect,
                        perfectRounds: accuracy === 100 ? 1 : 0
                    }
                })
            });
            results.achievements = await achievementsRes.json();

            if (results.achievements?.newlyUnlocked?.length > 0) {
                results.newlyUnlocked = results.achievements.newlyUnlocked;
            }
        } catch (e) {
            console.error('[GamificationService] Achievements error:', e);
            results.errors.push('achievements');
        }

        // 3. Update daily streak
        try {
            const streakRes = await fetch('/api/training/streak', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId })
            });
            results.streak = await streakRes.json();
        } catch (e) {
            console.error('[GamificationService] Streak error:', e);
            results.errors.push('streak');
        }

        // 4. Update weekly/monthly challenges
        try {
            const challengesRes = await fetch('/api/training/challenges', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userId,
                    sessionData: {
                        accuracy,
                        gameId, // Pass full gameId for category detection
                        isPerfect: accuracy === 100
                    }
                })
            });
            results.challenges = await challengesRes.json();

            // Check if any challenges were just completed
            if (results.challenges?.newlyCompleted?.length > 0) {
                results.challengesCompleted = results.challenges.newlyCompleted;
            }
        } catch (e) {
            console.error('[GamificationService] Challenges error:', e);
            results.errors.push('challenges');
        }

        return { success: results.errors.length === 0, ...results };
    }
};


export default GamificationService;
