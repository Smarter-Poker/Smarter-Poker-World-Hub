/**
 * Poker Near Me Preferences Service
 * Manages user preferences for the Poker Near Me page
 */

import { supabase } from '../lib/supabase';
import { readOwnProfile } from '../lib/ownProfile';

/**
 * Default preference values. Returned as a fresh object every time so callers
 * can never mutate the shared defaults.
 */
function defaultPreferences() {
    return { geofenceAlerts: true, locationEnabled: true, showNewcomerFriendly: true };
}

/**
 * Read the raw stored preferences blob.
 * @returns {Promise<{ ok: boolean, error: Object|null, preferences: Object|null }>}
 */
async function readStoredPreferences(userId) {
    const { data, error } = await readOwnProfile(supabase, 'poker_near_me_preferences', { expectId: userId });

    if (error) {
        return { ok: false, error, preferences: null };
    }

    const stored = data?.poker_near_me_preferences;
    return {
        ok: true,
        error: null,
        preferences: stored && typeof stored === 'object' && !Array.isArray(stored) ? stored : null,
    };
}

/**
 * Get user's poker near me preferences
 * @param {string} userId - User ID
 * @returns {Promise<Object>} Preferences object
 */
export async function getPokerNearMePreferences(userId) {
    if (!userId) {
        return defaultPreferences();
    }

    try {
        const { ok, error, preferences } = await readStoredPreferences(userId);

        if (!ok) {
            if (error.code === '42703') {
                console.warn('DB migration pending for poker_near_me_preferences. Returning defaults.');
                return defaultPreferences();
            }
            throw error;
        }

        // Merge OVER the defaults: a stored {} (or a blob missing a key) must
        // read each missing key as its default, not as undefined/off.
        return { ...defaultPreferences(), ...(preferences || {}) };
    } catch (error) {
        console.warn('Error fetching poker near me preferences:', error);
        return defaultPreferences();
    }
}

/**
 * Update user's poker near me preferences
 *
 * The update_page_preferences RPC REPLACES the whole jsonb column, but every
 * caller passes a partial patch (a single toggle, a location key, ...). Merge
 * the patch over the currently stored blob first so unrelated preferences are
 * not wiped.
 *
 * A failed read or a failed save THROWS. This used to return the optimistic
 * value on any error, so the page looked saved when nothing was stored; every
 * caller already catches (try/catch or .catch) and keeps its local state.
 *
 * @param {string} userId - User ID
 * @param {Object} preferences - Partial preferences to merge in
 * @returns {Promise<Object>} The full merged preferences object that was written
 */
export async function updatePokerNearMePreferences(userId, preferences) {
    if (!userId) {
        throw new Error('User ID is required');
    }

    const patch = preferences && typeof preferences === 'object' ? preferences : {};

    try {
        const stored = await readStoredPreferences(userId);

        if (!stored.ok) {
            // Writing a partial blob when the current value is unknown would wipe
            // every other stored preference - bail out instead.
            throw stored.error;
        }

        const merged = {
            ...defaultPreferences(),
            ...(stored.preferences || {}),
            ...patch,
        };

        const { error } = await supabase.rpc('update_page_preferences', {
            p_user_id: userId,
            p_column_name: 'poker_near_me_preferences',
            p_preferences: merged,
        });

        if (error) throw error;

        return merged;
    } catch (error) {
        console.warn('Error updating poker near me preferences:', error);
        throw error;
    }
}
