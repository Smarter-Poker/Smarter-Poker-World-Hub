/**
 * App Settings Sync — Shared utility for DB-persisted user settings
 * ═══════════════════════════════════════════════════════════════════
 * Reads/writes individual settings to profiles.app_settings JSONB.
 * Used across Hub, Club Arena, poker table, and all pages needing
 * cross-device persistence. localStorage is kept as fast cache.
 * ═══════════════════════════════════════════════════════════════════
 */

import { supabase } from './supabase';
import { getAuthUser } from './authUtils';

// Debounce map: prevents rapid-fire DB writes for the same key
const _pending = {};

/**
 * Save a single setting to profiles.app_settings JSONB.
 * Also writes to localStorage for instant local reads.
 * Debounced at 500ms per-key to prevent spamming during sliders/rapid toggles.
 *
 * @param {string} key - Setting key (e.g. 'poker_sound_pack', 'theme')
 * @param {*} value - Value to save
 * @param {string} [localStorageKey] - Optional localStorage key to also update
 */
export function saveAppSetting(key, value, localStorageKey) {
    // 1. Write to localStorage immediately (fast cache)
    if (localStorageKey && typeof window !== 'undefined') {
        try { localStorage.setItem(localStorageKey, typeof value === 'object' ? JSON.stringify(value) : String(value)); } catch (_) {}
    }

    // 2. Debounced DB write
    if (_pending[key]) clearTimeout(_pending[key]);
    _pending[key] = setTimeout(async () => {
        delete _pending[key];
        try {
            const user = getAuthUser();
            if (!user?.id) return;

            // Read current app_settings, merge, write back
            const { data: profile } = await supabase
                .from('profiles')
                .select('app_settings')
                .eq('id', user.id)
                .maybeSingle();

            const current = profile?.app_settings || {};
            const merged = { ...current, [key]: value };

            await supabase.from('profiles').update({ app_settings: merged }).eq('id', user.id);
        } catch (err) {
            console.error(`[AppSettings] Failed to save "${key}":`, err);
        }
    }, 500);
}

/**
 * Save multiple settings at once (batched write).
 *
 * @param {Object} settingsMap - { key: value } pairs to save
 */
export async function saveAppSettingsBatch(settingsMap) {
    try {
        const user = getAuthUser();
        if (!user?.id) return;

        const { data: profile } = await supabase
            .from('profiles')
            .select('app_settings')
            .eq('id', user.id)
            .maybeSingle();

        const current = profile?.app_settings || {};
        const merged = { ...current, ...settingsMap };

        await supabase.from('profiles').update({ app_settings: merged }).eq('id', user.id);
    } catch (err) {
        console.error('[AppSettings] Batch save failed:', err);
    }
}

/**
 * Load all app_settings from the DB (call once on page load).
 * Returns the app_settings object or empty object.
 *
 * @param {string} [userId] - User ID. If not provided, attempts to get from auth.
 * @returns {Promise<Object>} app_settings JSONB
 */
export async function loadAppSettings(userId) {
    try {
        const uid = userId || getAuthUser()?.id;
        if (!uid) return {};

        const { data: profile } = await supabase
            .from('profiles')
            .select('app_settings')
            .eq('id', uid)
            .maybeSingle();

        return profile?.app_settings || {};
    } catch (err) {
        console.error('[AppSettings] Load failed:', err);
        return {};
    }
}
