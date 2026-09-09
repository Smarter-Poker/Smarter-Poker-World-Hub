/**
 * 🎮 GAMIFICATION SERVICE
 * ═══════════════════════════════════════════════════════════════════════════
 * Compatibility facade for the retired browser-authored gamification flow.
 * ═══════════════════════════════════════════════════════════════════════════
 */

const GamificationService = {
    /**
     * Browser-authored completion statistics are not evidence of a settled
     * Training attempt. Keep the legacy method callable for old consumers, but
     * report that it is unavailable instead of issuing retired mutations or
     * pretending that achievements, streaks, challenges, or ranks changed.
     */
    async recordSession({ userId } = {}) {
        if (!userId) {
            console.warn('[GamificationService] No userId provided, skipping');
            return { success: false, error: 'No userId' };
        }

        return {
            success: false,
            available: false,
            code: 'TRAINING_VERIFIED_ATTEMPT_REQUIRED',
            error: 'Gamification updates require a server-verified Training attempt.',
            leaderboard: null,
            achievements: null,
            streak: null,
            challenges: null,
            newlyUnlocked: [],
            challengesCompleted: [],
            errors: ['retired-browser-gamification'],
        };
    }
};


export default GamificationService;
