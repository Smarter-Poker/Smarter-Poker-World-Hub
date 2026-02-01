/**
 * Diamond Arena Preferences Service
 * Manages user preferences for the Diamond Arena page
 */

import { supabase } from '../lib/supabase';

/**
 * Get user's diamond arena preferences
 * @param {string} userId - User ID
 * @returns {Promise<Object>} Preferences object
 */
export async function getDiamondArenaPreferences(userId) {
    if (!userId) {
        return { soundEffects: true, animations: true, autoRebuy: false };
    }

    try {
        const { data, error } = await supabase
            .from('profiles')
            .select('diamond_arena_preferences')
            .eq('id', userId)
            .single();

        if (error) throw error;

        return data?.diamond_arena_preferences || { soundEffects: true, animations: true, autoRebuy: false };
    } catch (error) {
        console.error('Error fetching diamond arena preferences:', error);
        return { soundEffects: true, animations: true, autoRebuy: false };
    }
}

/**
 * Update user's diamond arena preferences
 * @param {string} userId - User ID
 * @param {Object} preferences - Preferences to update
 * @returns {Promise<Object>} Updated preferences
 */
export async function updateDiamondArenaPreferences(userId, preferences) {
    if (!userId) {
        throw new Error('User ID is required');
    }

    try {
        const { data, error } = await supabase.rpc('update_page_preferences', {
            p_user_id: userId,
            p_column_name: 'diamond_arena_preferences',
            p_preferences: preferences,
        });

        if (error) throw error;

        return data;
    } catch (error) {
        console.error('Error updating diamond arena preferences:', error);
        throw error;
    }
}
