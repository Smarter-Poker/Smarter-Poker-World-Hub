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
            .maybeSingle();

        if (error) throw error;

        return data?.bankroll_preferences || { autoSave: true, notifications: true };
    } catch (error) {
        console.warn('Error fetching bankroll preferences:', error);
        return { autoSave: true, notifications: true };
    }
}

/**
 * Update user's bankroll preferences
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
export async function updateBankrollPreferences(userId, preferences) {
    if (!userId) {
        throw new Error('User ID is required');
    }

    const patch = preferences && typeof preferences === 'object' && !Array.isArray(preferences) ? preferences : {};

    try {
        const { data: row, error: readError } = await supabase
            .from('profiles')
            .select('bankroll_preferences')
            .eq('id', userId)
            .maybeSingle();

        if (readError) throw readError;

        const current = row?.bankroll_preferences;
        const merged = {
            ...(current && typeof current === 'object' && !Array.isArray(current) ? current : {}),
            ...patch,
        };

        const { error } = await supabase.rpc('update_page_preferences', {
            p_user_id: userId,
            p_column_name: 'bankroll_preferences',
            p_preferences: merged,
        });

        if (error) throw error;

        return merged;
    } catch (error) {
        console.warn('Error updating bankroll preferences:', error);
        throw error;
    }
}
