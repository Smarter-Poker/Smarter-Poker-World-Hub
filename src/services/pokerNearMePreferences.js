/**
 * Poker Near Me Preferences Service
 * Manages user preferences for the Poker Near Me page
 */

import { supabase } from '../lib/supabase';

/**
 * Get user's poker near me preferences
 * @param {string} userId - User ID
 * @returns {Promise<Object>} Preferences object
 */
export async function getPokerNearMePreferences(userId) {
    if (!userId) {
        return { geofenceAlerts: true, locationEnabled: true, showNewcomerFriendly: true };
    }

    try {
        const { data, error } = await supabase
            .from('profiles')
            .select('poker_near_me_preferences')
            .eq('id', userId)
            .maybeSingle();

        if (error) throw error;

        return data?.poker_near_me_preferences || { geofenceAlerts: true, locationEnabled: true, showNewcomerFriendly: true };
    } catch (error) {
        console.error('Error fetching poker near me preferences:', error);
        return { geofenceAlerts: true, locationEnabled: true, showNewcomerFriendly: true };
    }
}

/**
 * Update user's poker near me preferences
 * @param {string} userId - User ID
 * @param {Object} preferences - Preferences to update
 * @returns {Promise<Object>} Updated preferences
 */
export async function updatePokerNearMePreferences(userId, preferences) {
    if (!userId) {
        throw new Error('User ID is required');
    }

    try {
        const { data, error } = await supabase.rpc('update_page_preferences', {
            p_user_id: userId,
            p_column_name: 'poker_near_me_preferences',
            p_preferences: preferences,
        });

        if (error) throw error;

        return data;
    } catch (error) {
        console.error('Error updating poker near me preferences:', error);
        throw error;
    }
}
