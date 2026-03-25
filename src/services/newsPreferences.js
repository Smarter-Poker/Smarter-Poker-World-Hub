/**
 * News Preferences Service
 * Manages user preferences for the News page
 */

import { getSupabase } from '../lib/supabase';

/**
 * Get user's news preferences
 * @param {string} userId - User ID
 * @returns {Promise<Object>} Preferences object
 */
export async function getNewsPreferences(userId) {
    if (!userId) {
        return { pushNotifications: false, emailDigest: false };
    }

    try {
        const { data, error } = await supabase
            .from('profiles')
            .select('news_preferences')
            .eq('id', userId)
            .maybeSingle();

        if (error) {
            // Column may not exist in DB — gracefully degrade
            console.warn('News preferences fetch failed (non-critical):', error?.message);
            return { pushNotifications: false, emailDigest: false };
        }

        return data?.news_preferences || { pushNotifications: false, emailDigest: false };
    } catch (error) {
        console.warn('News preferences not available:', error?.message);
        return { pushNotifications: false, emailDigest: false };
    }
}

/**
 * Update user's news preferences
 * @param {string} userId - User ID
 * @param {Object} preferences - Preferences to update
 * @returns {Promise<Object>} Updated preferences
 */
export async function updateNewsPreferences(userId, preferences) {
    if (!userId) {
        throw new Error('User ID is required');
    }

    try {
        const { data, error } = await supabase.rpc('update_page_preferences', {
            p_user_id: userId,
            p_column_name: 'news_preferences',
            p_preferences: preferences,
        });

        if (error) throw error;

        return data;
    } catch (error) {
        console.error('Error updating news preferences:', error);
        throw error;
    }
}
