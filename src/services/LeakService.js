/**
 * 🕵️ LEAK SERVICE
 * ═══════════════════════════════════════════════════════════════════════════
 * Persists detected leaks to Supabase and pushes alerts to Jarvis PA
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { createClient } from '@supabase/supabase-js';
import { LEAK_TYPES } from '../engine/LeakSignalAnalyzer';

// Initialize Supabase client
const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

class LeakService {
    /**
     * Record a detected leak to Supabase
     * If leak already exists (same type, unfixed), increment count
     */
    async recordLeak(userId, leakType, context = {}) {
        if (!userId) {
            console.warn('[LeakService] No userId provided, skipping persistence');
            return null;
        }

        try {
            // Check if this leak type already exists and is unfixed
            const { data: existingLeak, error: fetchError } = await supabase
                .from('user_training_leaks')
                .select('id, count')
                .eq('user_id', userId)
                .eq('leak_type', leakType.id)
                .is('fixed_at', null)
                .maybeSingle();

            if (fetchError && fetchError.code !== 'PGRST116') {
                // PGRST116 = no rows returned, which is fine
                console.error('[LeakService] Error checking existing leak:', fetchError);
            }

            if (existingLeak) {
                // Update existing leak - increment count
                const { data, error } = await supabase
                    .from('user_training_leaks')
                    .update({
                        count: existingLeak.count + 1,
                        updated_at: new Date().toISOString(),
                        metadata: context
                    })
                    .eq('id', existingLeak.id)
                    .select()
                    .maybeSingle();

                if (error) throw error;
                console.log(`[LeakService] Updated leak ${leakType.id}: count=${data.count}`);
                return data;
            } else {
                // Insert new leak
                const { data, error } = await supabase
                    .from('user_training_leaks')
                    .insert({
                        user_id: userId,
                        leak_type: leakType.id,
                        leak_name: leakType.name,
                        description: leakType.description,
                        recommended_drill: leakType.drill,
                        metadata: context
                    })
                    .select()
                    .maybeSingle();

                if (error) throw error;
                console.log(`[LeakService] Recorded new leak: ${leakType.id}`);
                return data;
            }
        } catch (err) {
            console.error('[LeakService] Failed to record leak:', err);
            return null;
        }
    }

    /**
     * Get all active (unfixed) leaks for a user
     */
    async getActiveLeaks(userId) {
        if (!userId) return [];

        try {
            const { data, error } = await supabase
                .rpc('get_active_leaks', { p_user_id: userId });

            if (error) throw error;
            return data || [];
        } catch (err) {
            console.error('[LeakService] Failed to get active leaks:', err);
            return [];
        }
    }

    /**
     * Mark a leak as fixed
     */
    async markLeakFixed(userId, leakId) {
        if (!userId || !leakId) return false;

        try {
            const { error } = await supabase
                .from('user_training_leaks')
                .update({ fixed_at: new Date().toISOString() })
                .eq('id', leakId)
                .eq('user_id', userId);

            if (error) throw error;
            console.log(`[LeakService] Marked leak ${leakId} as fixed`);
            return true;
        } catch (err) {
            console.error('[LeakService] Failed to mark leak fixed:', err);
            return false;
        }
    }

    /**
     * Push a leak alert to Jarvis PA inbox
     */
    async pushToJarvis(userId, leakType, leakId = null) {
        if (!userId) return false;

        try {
            // Create coaching message based on leak type
            const message = this.generateJarvisMessage(leakType);
            const action = this.generateRecommendedAction(leakType);

            const { error } = await supabase
                .from('jarvis_leak_alerts')
                .insert({
                    user_id: userId,
                    leak_id: leakId,
                    leak_type: leakType.id,
                    message: message,
                    recommended_action: action
                });

            if (error) throw error;

            // Also mark the leak as notified
            if (leakId) {
                await supabase
                    .from('user_training_leaks')
                    .update({ jarvis_notified: true })
                    .eq('id', leakId);
            }

            console.log(`[LeakService] Pushed Jarvis alert for ${leakType.id}`);
            return true;
        } catch (err) {
            console.error('[LeakService] Failed to push to Jarvis:', err);
            return false;
        }
    }

    /**
     * Get unread Jarvis leak alerts
     */
    async getUnreadAlerts(userId) {
        if (!userId) return [];

        try {
            const { data, error } = await supabase
                .rpc('get_unread_leak_alerts', { p_user_id: userId });

            if (error) throw error;
            return data || [];
        } catch (err) {
            console.error('[LeakService] Failed to get unread alerts:', err);
            return [];
        }
    }

    /**
     * Mark an alert as read
     */
    async markAlertRead(userId, alertId) {
        if (!userId || !alertId) return false;

        try {
            const { error } = await supabase
                .from('jarvis_leak_alerts')
                .update({ read: true })
                .eq('id', alertId)
                .eq('user_id', userId);

            if (error) throw error;
            return true;
        } catch (err) {
            console.error('[LeakService] Failed to mark alert read:', err);
            return false;
        }
    }

    /**
     * Generate Jarvis coaching message based on leak type
     */
    generateJarvisMessage(leakType) {
        const messages = {
            PASSIVE_PLAY: `I've noticed you're playing a bit too passively, sir. You're calling when you should be raising, missing both value and fold equity. Shall I recommend some aggression drills?`,
            OVER_FOLDING: `I observe you're folding quite frequently, sir. Opponents could exploit this with any two cards. Might I suggest some hand defense exercises?`,
            CALLING_STATION: `A word of caution, sir — you're calling when folding would be optimal. This pattern makes you vulnerable to value bets. I have some discipline drills that might help.`,
            MANIAC_AGGRESSION: `Sir, your aggression frequency appears elevated. Raising when checking or calling is optimal could be costly. Perhaps some pot control exercises would benefit your game?`
        };

        return messages[leakType.id] || `I've detected a strategic leak in your game: ${leakType.name}. ${leakType.description}`;
    }

    /**
     * Generate recommended action based on leak type
     */
    generateRecommendedAction(leakType) {
        return `Train: ${leakType.drill || 'GTO Fundamentals'}`;
    }
}

// Export singleton instance
export const leakService = new LeakService();
export default leakService;
