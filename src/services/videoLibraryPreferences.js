/**
 * Video Library Preferences Service
 * Manages user preferences for the Video Library page
 */

import { supabase } from '../lib/supabase';

/**
 * Get user's video library preferences
 * @param {string} userId - User ID
 * @returns {Promise<Object>} Preferences object
 */
export async function getVideoLibraryPreferences(userId) {
    if (!userId) {
        return { autoplay: true, hdQuality: true, captions: false };
    }

    try {
        const { data, error } = await supabase
            .from('profiles')
            .select('video_library_preferences')
            .eq('id', userId)
            .single();

        if (error) throw error;

        return data?.video_library_preferences || { autoplay: true, hdQuality: true, captions: false };
    } catch (error) {
        console.error('Error fetching video library preferences:', error);
        return { autoplay: true, hdQuality: true, captions: false };
    }
}

/**
 * Update user's video library preferences
 * @param {string} userId - User ID
 * @param {Object} preferences - Preferences to update
 * @returns {Promise<Object>} Updated preferences
 */
export async function updateVideoLibraryPreferences(userId, preferences) {
    if (!userId) {
        throw new Error('User ID is required');
    }

    try {
        const { data, error } = await supabase.rpc('update_page_preferences', {
            p_user_id: userId,
            p_column_name: 'video_library_preferences',
            p_preferences: preferences,
        });

        if (error) throw error;

        return data;
    } catch (error) {
        console.error('Error updating video library preferences:', error);
        throw error;
    }
}
