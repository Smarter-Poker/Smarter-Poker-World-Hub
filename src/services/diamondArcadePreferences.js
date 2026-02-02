/**
 * Diamond Arcade Preferences Service
 * Manages user preferences for the Diamond Arcade page
 */

import { supabase } from '../lib/supabase';

/**
 * Get user's diamond arcade preferences
 * @param {string} userId - User ID
 * @returns {Promise<Object>} Preferences object
 */
export async function getDiamondArcadePreferences(userId) {
    if (!userId) {
        return { soundEffects: true, animations: true, hints: false };
    }

    try {
        const { data, error } = await supabase
            .from('profiles')
            .select('diamond_arcade_preferences')
            .eq('id', userId)
            .single();

        if (error) throw error;

        return data?.diamond_arcade_preferences || { soundEffects: true, animations: true, hints: false };
    } catch (error) {
        console.error('Error fetching diamond arcade preferences:', error);
        return { soundEffects: true, animations: true, hints: false };
    }
}

/**
 * Update user's diamond arcade preferences
 * @param {string} userId - User ID
 * @param {Object} preferences - Preferences to update
 * @returns {Promise<Object>} Updated preferences
 */
export async function updateDiamondArcadePreferences(userId, preferences) {
    if (!userId) {
        throw new Error('User ID is required');
    }

    try {
        const { data, error } = await supabase.rpc('update_page_preferences', {
            p_user_id: userId,
            p_column_name: 'diamond_arcade_preferences',
            p_preferences: preferences,
        });

        if (error) throw error;

        return data;
    } catch (error) {
        console.error('Error updating diamond arcade preferences:', error);
        throw error;
    }
}
