/**
 * Poker Near Me Preferences Service
 * Manages user preferences for the Poker Near Me page
 */

import { supabase } from '../lib/supabase';
import { readOwnProfile } from '../lib/ownProfile';
import { newPlanningOperationId, patchPlayerPreferences, checkPlanningOperation } from './pokerNearMePlayerPlanning';
import { validatePreferencePatch } from '../lib/poker-near-me/playerPlanning';
import { getAuthUser } from '../lib/authUtils';
const preferenceWrites = new Set();
function notifyPreferenceRequest() {
    if (typeof window !== 'undefined') window.dispatchEvent(new Event('pnm-preference-request'));
}
function clearPreferenceRequest(storage, key, operationId) {
    try {
        const current = JSON.parse(storage.getItem(key) || 'null');
        if (current?.operation_id === operationId) storage.removeItem(key);
        notifyPreferenceRequest();
        return true;
    }
    catch (_) {
        console.warn('The preference write is confirmed, but its local request receipt could not be cleared.');
        return false;
    }
}

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

    const { ok, error, preferences } = await readStoredPreferences(userId);
    if (!ok) throw error;
    // Missing keys in a successfully read blob retain defaults. An unavailable
    // authenticated read is not a successfully loaded default configuration.
    return { ...defaultPreferences(), ...(preferences || {}) };
}

/**
 * Update user's poker near me preferences
 *
 * The owning RPC merges a bounded patch under a database row lock. The original
 * UUID is retained on uncertain writes; a new operation must not silently retry it.
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

    if (preferenceWrites.has(userId)) throw Object.assign(new Error('A preference change is already being saved. Wait for its result before changing another preference.'), { confirmedRefusal: true, status: 409 });
    preferenceWrites.add(userId);
    try { return await writePokerNearMePreferences(userId, preferences); }
    finally { preferenceWrites.delete(userId); }
}
async function writePokerNearMePreferences(userId, preferences) {
    const patch = validatePreferencePatch(preferences);
    if (getAuthUser()?.id !== userId) throw Object.assign(new Error('The signed-in account does not match these preferences.'), { confirmedRefusal: true, status: 401 });
    const key = `pnm-preference-pending:${userId}`;
    if (typeof sessionStorage === 'undefined') throw Object.assign(new Error('Browser request storage is unavailable. No preference change was sent.'), { confirmedRefusal: true });
    const storage = sessionStorage;
    let pending;
    try { pending = JSON.parse(storage?.getItem(key) || 'null'); } catch (_) { throw new Error('The saved preference request could not be read. Check account planning before saving again.'); }
    if (pending?.operation_id) {
        const receipt = await checkPlanningOperation(pending.operation_id, { kind: 'preferences', expectedUserId: userId });
        if (receipt) {
            if (receipt.action !== 'preferences') throw new Error('The saved preference receipt did not match this request.');
            if (!clearPreferenceRequest(storage, key, pending.operation_id)) throw Object.assign(new Error('Your original preference write is confirmed, but its local receipt cannot be cleared. No new change was sent.'), { operation_id: pending.operation_id, outcome: 'confirmed', confirmedRefusal: true, status: 409 });
        }
        else throw Object.assign(new Error('Your previous preference request is not yet confirmed. Check it before saving another change.'), { operation_id: pending.operation_id, outcome: 'unknown' });
    }
    const request = { operation_id: newPlanningOperationId(), patch };
    // Failing to persist the request identity must stop before the network write.
    try { storage.setItem(key, JSON.stringify(request)); }
    catch (_) { throw Object.assign(new Error('The original preference request could not be stored. No change was sent.'), { confirmedRefusal: true }); }
    notifyPreferenceRequest();
    try {
        const receipt = await patchPlayerPreferences(request, fetch, userId);
        clearPreferenceRequest(storage, key, request.operation_id);
        return { ...defaultPreferences(), ...receipt.preferences };
    } catch (error) {
        if (error.confirmedRefusal) clearPreferenceRequest(storage, key, request.operation_id);
        error.operation_id = request.operation_id;
        if (!error.confirmedRefusal) error.outcome = 'unknown';
        throw error;
    }
}

export function readPendingPreference(userId) {
    if (!userId || typeof sessionStorage === 'undefined') return null;
    try { return JSON.parse(sessionStorage.getItem(`pnm-preference-pending:${userId}`) || 'null'); }
    catch (_) { throw new Error('Your original preference request could not be read.'); }
}
export async function checkPendingPreference(userId) {
    if (getAuthUser()?.id !== userId) throw new Error('Return to the original account to check this preference request.');
    const pending = readPendingPreference(userId);
    if (!pending) return null;
    const receipt = await checkPlanningOperation(pending.operation_id, { kind: 'preferences', expectedUserId: userId });
    if (receipt) {
        if (receipt.action !== 'preferences') throw new Error('The preference receipt did not match the original request.');
        clearPreferenceRequest(sessionStorage, `pnm-preference-pending:${userId}`, pending.operation_id);
    }
    return receipt;
}
export async function retryPendingPreference(userId) {
    if (preferenceWrites.has(userId)) throw Object.assign(new Error('A preference request is already being saved.'), { confirmedRefusal: true });
    preferenceWrites.add(userId);
    try { return await recoverPendingPreference(userId); }
    finally { preferenceWrites.delete(userId); }
}
async function recoverPendingPreference(userId) {
    if (getAuthUser()?.id !== userId) throw new Error('Return to the original account to recover this preference request.');
    const pending = readPendingPreference(userId);
    if (!pending) return null;
    const receipt = await checkPendingPreference(userId);
    if (receipt) return receipt;
    validatePreferencePatch(pending.patch);
    try {
        const recovered = await patchPlayerPreferences(pending, fetch, userId);
        clearPreferenceRequest(sessionStorage, `pnm-preference-pending:${userId}`, pending.operation_id);
        return recovered;
    } catch (error) {
        if (error.confirmedRefusal) clearPreferenceRequest(sessionStorage, `pnm-preference-pending:${userId}`, pending.operation_id);
        error.operation_id = pending.operation_id;
        throw error;
    }
}
