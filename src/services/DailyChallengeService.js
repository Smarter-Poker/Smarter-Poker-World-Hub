/**
 * DailyChallengeService - Memory Matrix daily practice assignment
 *
 * This browser service is deliberately read-only. The Preflop Charts launch
 * is unsigned local practice and therefore cannot settle challenge progress,
 * streaks, leaderboards, or Diamond rewards.
 */

import { supabase } from '../lib/supabase';

class DailyChallengeService {
    constructor() {
        // Use singleton client directly - no external initialization needed
        this.supabase = supabase;
    }

    /**
     * Initialize with optional Supabase client override
     * @deprecated Use singleton client directly
     */
    async initialize(supabaseClient) {
        // Allow override for backwards compatibility but prefer singleton
        if (supabaseClient) {
            this.supabase = supabaseClient;
        }
    }


    /**
     * Get today's daily challenge
     */
    async getTodaysChallenge() {
        try {
            const { data, error } = await this.supabase.rpc('get_daily_challenge');

            if (error) throw error;

            if (!data?.success || !data?.challenge) return data;

            // The legacy RPC includes completion/reward fields for its retired
            // browser-scored flow. Preserve only the published assignment and
            // label its actual local-practice authority at this call site.
            const {
                diamond_reward: _diamondReward,
                bonus_reward: _bonusReward,
                ...assignment
            } = data.challenge;
            return {
                success: true,
                challenge: assignment,
                completed: false,
                practiceOnly: true,
                rewardEligible: false,
                authority: 'unsigned_local_practice',
            };
        } catch (error) {
            console.warn('[DailyChallengeService] Error getting daily challenge:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

}

// Export singleton instance
const dailyChallengeService = new DailyChallengeService();
export default dailyChallengeService;
