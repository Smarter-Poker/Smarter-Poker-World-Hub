/**
 * News Preferences Service
 * Manages user preferences for the News page (stored in profiles.news_preferences)
 *
 * Contract (relied on by pages/hub/news.js and pages/hub/news/sources.js):
 *   - getNewsPreferences    → preferences object; safe defaults on any failure
 *   - updateNewsPreferences → resolves with the merged canonical preferences
 *                             object on success, THROWS on write failure
 *                             (callers .catch and warn).
 *
 * SECURITY NOTE: updateNewsPreferences calls the `update_page_preferences`
 * RPC with a client-supplied p_user_id and p_column_name. The SQL function
 * MUST enforce `p_user_id = auth.uid()` (or ignore the parameter and use
 * auth.uid() directly) and whitelist p_column_name — otherwise any
 * authenticated user could overwrite another user's preference columns.
 * Verify this in the Supabase migrations; it cannot be enforced client-side.
 */

import { supabase } from '../lib/supabase';

/** Default preference values — also the shape returned on failure. */
export const DEFAULT_NEWS_PREFERENCES = Object.freeze({
    pushNotifications: false,
    emailDigest: false
});

function defaults() {
    return { ...DEFAULT_NEWS_PREFERENCES };
}

/**
 * Get user's news preferences
 * @param {string} userId - User ID
 * @returns {Promise<Object>} Preferences object (never null; defaults on failure)
 */
export async function getNewsPreferences(userId) {
    if (!userId) {
        return defaults();
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
            return defaults();
        }

        const prefs = data?.news_preferences;
        if (prefs && typeof prefs === 'object' && !Array.isArray(prefs)) {
            // Merge over defaults so known keys are always present
            return { ...defaults(), ...prefs };
        }

        return defaults();
    } catch (error) {
        console.warn('News preferences not available:', error?.message);
        return defaults();
    }
}

/**
 * Update user's news preferences
 *
 * Callers send single-key deltas (e.g. { pushNotifications: true }). The
 * update_page_preferences RPC REPLACES the whole JSON column, so this function
 * reads the current value, merges the delta over it client-side, and writes
 * the full merged object. If the pre-read fails, the save is refused (thrown):
 * sending the raw delta would replace every saved sibling key with it.
 *
 * @param {string} userId - User ID
 * @param {Object} preferences - Preference keys to update (partial object)
 * @returns {Promise<Object>} The merged preferences object that was written
 */
export async function updateNewsPreferences(userId, preferences) {
    if (!userId) {
        throw new Error('User ID is required');
    }

    const patch = preferences && typeof preferences === 'object' && !Array.isArray(preferences) ? preferences : {};

    try {
        // Read-merge so the replace-semantics RPC cannot drop sibling keys.
        const { data, error: readError } = await supabase
            .from('profiles')
            .select('news_preferences')
            .eq('id', userId)
            .maybeSingle();

        // An unknown current value must not be overwritten with a partial one.
        if (readError) throw readError;

        const current = data?.news_preferences;
        const merged = {
            ...(current && typeof current === 'object' && !Array.isArray(current) ? current : {}),
            ...patch,
        };

        const { error } = await supabase.rpc('update_page_preferences', {
            p_user_id: userId,
            p_column_name: 'news_preferences',
            p_preferences: merged,
        });

        if (error) throw error;

        // Return the canonical merged object (the RPC's return shape is not a
        // documented contract) so callers can reconcile local state.
        return merged;
    } catch (error) {
        console.warn('Error updating news preferences:', error?.message || error);
        throw error;
    }
}
