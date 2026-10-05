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
 *
 * The update_page_preferences RPC REPLACES the whole jsonb column, and every
 * caller passes a partial patch (a single toggle). Read the stored value and
 * merge the patch over it first so sibling preferences are not wiped. If the
 * stored value cannot be read, the save is refused (thrown) rather than
 * overwriting it with a partial object.
 *
 * @param {string} userId - User ID
 * @param {Object} preferences - Partial preferences to merge in
 * @returns {Promise<Object>} The full merged preferences object that was written
 */
export async function updateMemoryGamesPreferences(userId, preferences) {
    if (!userId) {
        throw new Error('User ID is required');
    }

    const patch = preferences && typeof preferences === 'object' && !Array.isArray(preferences) ? preferences : {};

    try {
        const { data: row, error: readError } = await supabase
            .from('profiles')
            .select('memory_games_preferences')
            .eq('id', userId)
            .maybeSingle();

        if (readError) throw readError;

        const current = row?.memory_games_preferences;
        const merged = {
            ...(current && typeof current === 'object' && !Array.isArray(current) ? current : {}),
            ...patch,
        };

        const { error } = await supabase.rpc('update_page_preferences', {
            p_user_id: userId,
            p_column_name: 'memory_games_preferences',
            p_preferences: merged,
        });

        if (error) throw error;

        return merged;
    } catch (error) {
        console.warn('Error updating memory games preferences:', error);
        throw error;
    }
}
