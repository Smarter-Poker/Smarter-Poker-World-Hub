/**
 * Trivia Preferences Service
 * Manages user preferences for the Trivia page
 */

import { supabase } from '../lib/supabase';

/**
 * Get user's trivia preferences
 * @param {string} userId - User ID
 * @returns {Promise<Object>} Preferences object
 */
export async function getTriviaPreferences(userId) {
    if (!userId) {
        return { soundEffects: true, timerEnabled: true, hintsEnabled: false };
    }

    try {
        const { data, error } = await supabase
            .from('profiles')
            .select('trivia_preferences')
            .eq('id', userId)
            .maybeSingle();

        if (error) throw error;

        return data?.trivia_preferences || { soundEffects: true, timerEnabled: true, hintsEnabled: false };
    } catch (error) {
        console.error('Error fetching trivia preferences:', error);
        return { soundEffects: true, timerEnabled: true, hintsEnabled: false };
    }
}

/**
 * Update user's trivia preferences
 * @param {string} userId - User ID
 * @param {Object} preferences - Preferences to update
 * @returns {Promise<Object>} Updated preferences
 */
export async function updateTriviaPreferences(userId, preferences) {
    if (!userId) {
        throw new Error('User ID is required');
    }

    try {
        const { data, error } = await supabase.rpc('update_page_preferences', {
            p_user_id: userId,
            p_column_name: 'trivia_preferences',
            p_preferences: preferences,
        });

        if (error) throw error;

        return data;
    } catch (error) {
        console.error('Error updating trivia preferences:', error);
        throw error;
    }
}
