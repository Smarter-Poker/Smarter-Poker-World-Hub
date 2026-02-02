/**
 * Bankroll Manager Preferences Service
 * Manages user preferences for the Bankroll Manager page
 */

import { supabase } from '../lib/supabase';

/**
 * Get user's bankroll preferences
 * @param {string} userId - User ID
 * @returns {Promise<Object>} Preferences object
 */
export async function getBankrollPreferences(userId) {
    if (!userId) {
        return { autoSave: true, notifications: true };
    }

    try {
        const { data, error } = await supabase
            .from('profiles')
            .select('bankroll_preferences')
            .eq('id', userId)
            .single();

        if (error) throw error;

        return data?.bankroll_preferences || { autoSave: true, notifications: true };
    } catch (error) {
        console.error('Error fetching bankroll preferences:', error);
        return { autoSave: true, notifications: true };
    }
}

/**
 * Update user's bankroll preferences
 * @param {string} userId - User ID
 * @param {Object} preferences - Preferences to update
 * @returns {Promise<Object>} Updated preferences
 */
export async function updateBankrollPreferences(userId, preferences) {
    if (!userId) {
        throw new Error('User ID is required');
    }

    try {
        const { data, error } = await supabase.rpc('update_page_preferences', {
            p_user_id: userId,
            p_column_name: 'bankroll_preferences',
            p_preferences: preferences,
        });

        if (error) throw error;

        return data;
    } catch (error) {
        console.error('Error updating bankroll preferences:', error);
        throw error;
    }
}
