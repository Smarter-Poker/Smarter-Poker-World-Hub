/**
 * Memory Games Preferences Service
 * Manages user preferences for the Memory Games page
 */

import { supabase } from '../lib/supabase';

export const DEFAULT_MEMORY_GAME_PREFERENCES = Object.freeze({
    soundEffects: true,
    keyboardShortcuts: true,
    showTimer: true,
    visualHints: false,
});

export function normalizeMemoryGamePreferences(preferences) {
    return { ...DEFAULT_MEMORY_GAME_PREFERENCES, ...(preferences || {}) };
}

/**
 * Get user's memory games preferences
 * @param {string} userId - User ID
 * @returns {Promise<Object>} Preferences object
 */
export async function getMemoryGamesPreferences(userId) {
    if (!userId) {
        return { ...DEFAULT_MEMORY_GAME_PREFERENCES };
    }

    try {
        const { data, error } = await supabase
            .from('profiles')
            .select('memory_games_preferences')
            .eq('id', userId)
            .maybeSingle();

        if (error) throw error;

        return normalizeMemoryGamePreferences(data?.memory_games_preferences);
    } catch (error) {
        console.warn('Error fetching memory games preferences:', error);
        return { ...DEFAULT_MEMORY_GAME_PREFERENCES };
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
        console.warn('Error updating memory games preferences:', error);
        throw error;
    }
}
