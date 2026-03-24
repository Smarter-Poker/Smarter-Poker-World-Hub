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

/**
 * DB key → localStorage key mapping.
 * When seeding from DB, we write each DB setting to its localStorage key.
 */
const DB_TO_LS_MAP = {
    // Theme & display
    theme: 'smarter-poker-theme',
    // Poker table
    poker_sound_pack: 'poker-sound-pack',
    poker_auto_muck: 'poker-auto-muck',
    poker_felt_color: 'poker-felt-color',
    poker_seat_prefs: 'poker-seat-prefs',
    poker_bet_presets: 'smarter-poker-bet-presets',
    // Reels
    reels_sound_enabled: 'reels-sound-enabled',
    // Geeves
    geeves_language: 'geeves-language',
    jarvis_theme: 'jarvis-theme',
    jarvis_compact_mode: 'jarvis-compact-mode',
    // Sandbox
    sandbox_coach_mode: 'sandbox-coach-mode',
    sandbox_felt: 'sandbox-felt',
    // Poker Near Me
    sp_favorites: 'sp-favorites',
    followed_series: 'followed-series',
    followed_tours: 'followed-tours',
    followed_venues: 'followed-venues',
    poker_near_me_search_filters: 'poker-near-me-search-filters',
};

/**
 * Seed localStorage from DB on login.
 * Call once during auth session start (_app.js).
 * This is what makes cross-device settings persistence actually work:
 * on a new device, the user gets all their preferences restored.
 *
 * @param {string} [userId] - Optional user ID override
 */
export async function seedLocalStorageFromDB(userId) {
    if (typeof window === 'undefined') return;
    try {
        const settings = await loadAppSettings(userId);
        if (!settings || Object.keys(settings).length === 0) return;

        for (const [dbKey, lsKey] of Object.entries(DB_TO_LS_MAP)) {
            if (settings[dbKey] !== undefined && settings[dbKey] !== null) {
                const val = settings[dbKey];
                const str = typeof val === 'object' ? JSON.stringify(val) : String(val);
                try { localStorage.setItem(lsKey, str); } catch (_) {}
            }
        }
        console.log('[AppSettings] ✅ Seeded localStorage from DB —', Object.keys(settings).length, 'keys');
    } catch (err) {
        console.error('[AppSettings] Seed failed:', err);
    }
}
