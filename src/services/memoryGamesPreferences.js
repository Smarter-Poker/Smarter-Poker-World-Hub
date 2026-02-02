/**
 * Memory Games Preferences Service
 * Manages user preferences for the Memory Games page
 */

import { supabase } from '../lib/supabase';

/**
 * Get user's memory games preferences
 * @param {string} userId - User ID
 * @returns {Promise<Object>} Preferences object
 */
export async function getMemoryGamesPreferences(userId) {
    if (!userId) {
        return { soundEffects: true, keyboardShortcuts: true, showTimer: true, visualHints: false };
    }

    try {
        const { data, error } = await supabase
            .from('profiles')
            .select('memory_games_preferences')
            .eq('id', userId)
            .single();

        if (error) throw error;

        return data?.memory_games_preferences || { soundEffects: true, keyboardShortcuts: true, showTimer: true, visualHints: false };
    } catch (error) {
        console.error('Error fetching memory games preferences:', error);
        return { soundEffects: true, keyboardShortcuts: true, showTimer: true, visualHints: false };
    }
}

/**
 * Update user's memory games preferences
 * @param {string} userId - User ID
 * @param {Object} preferences - Preferences to update
 * @returns {Promise<Object>} Updated preferences
 */
export async function updateMemoryGamesPreferences(userId, preferences) {
    if (!userId) {
        throw new Error('User ID is required');
    }

    try {
        const { data, error } = await supabase.rpc('update_page_preferences', {
            p_user_id: userId,
            p_column_name: 'memory_games_preferences',
            p_preferences: preferences,
        });

        if (error) throw error;

        return data;
    } catch (error) {
        console.error('Error updating memory games preferences:', error);
        throw error;
    }
}
