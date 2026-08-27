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
        return { autoplay: true, captions: false };
    }

    const { data, error } = await supabase
        .from('profiles')
        .select('video_library_preferences')
        .eq('id', userId)
        .maybeSingle();

    if (error) {
        console.warn('Error fetching video library preferences:', error);
        throw error;
    }

    return { autoplay: true, captions: false, ...(data?.video_library_preferences || {}) };
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
        const patch = preferences && typeof preferences === 'object' ? preferences : {};
        const { data, error } = await supabase.rpc('patch_video_library_preferences', {
            p_expected_user_id: userId,
            p_patch: patch,
        });

        if (error) throw error;

        return data || patch;
    } catch (error) {
        console.warn('Error updating video library preferences:', error);
        throw error;
    }
}
