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

// Coalescing queue: collects all pending key-value pairs and flushes
// them in a single atomic DB write. Prevents race conditions when
// multiple different keys are saved within the debounce window.
const _pendingValues = {};
let _flushTimer = null;

/**
 * Flush all pending settings to DB in one atomic read-merge-write.
 * This eliminates the race condition where per-key debounce timers
 * could each read stale app_settings and overwrite each other.
 */
async function _flushPendingSettings() {
    _flushTimer = null;
    const toSave = { ..._pendingValues };
    // Clear immediately so new saves during the async operation
    // will be queued for the next flush cycle
    for (const k of Object.keys(toSave)) delete _pendingValues[k];

    if (Object.keys(toSave).length === 0) return;

    try {
        const user = getAuthUser();
        if (!user?.id) return;

        // Single atomic read-merge-write for ALL queued keys
        const { data: profile, error: readError } = await supabase
            .from('profiles')
            .select('app_settings')
            .eq('id', user.id)
            .maybeSingle();

        // CRITICAL: If read fails, do NOT proceed — writing with empty 'current'
        // would overwrite all existing settings with only the new keys.
        if (readError) {
            console.error('[AppSettings] Flush aborted — SELECT failed:', readError.message);
            // Re-queue the values so they're retried on the next flush cycle
            Object.assign(_pendingValues, toSave);
            if (!_flushTimer) _flushTimer = setTimeout(_flushPendingSettings, 2000);
            return;
        }

        const current = profile?.app_settings || {};
        const merged = { ...current, ...toSave };

        const { error } = await supabase.from('profiles').update({ app_settings: merged }).eq('id', user.id);
        if (error) console.error('[AppSettings] Flush DB error:', error.message, 'Keys:', Object.keys(toSave));
    } catch (err) {
        console.error('[AppSettings] Flush failed:', err, 'Keys:', Object.keys(toSave));
    }
}

/**
 * Save a single setting to profiles.app_settings JSONB.
 * Also writes to localStorage for instant local reads.
 * Coalesced — multiple keys are batched into a single DB write
 * after a 500ms quiet period.
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

    // 2. Queue for coalesced DB write
    _pendingValues[key] = value;
    if (_flushTimer) clearTimeout(_flushTimer);
    _flushTimer = setTimeout(_flushPendingSettings, 500);
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

        const { data: profile, error: readError } = await supabase
            .from('profiles')
            .select('app_settings')
            .eq('id', user.id)
            .maybeSingle();

        // CRITICAL: If read fails, do NOT proceed — would overwrite all settings
        if (readError) {
            console.error('[AppSettings] Batch aborted — SELECT failed:', readError.message);
            return;
        }

        const current = profile?.app_settings || {};
        const merged = { ...current, ...settingsMap };

        const { error } = await supabase.from('profiles').update({ app_settings: merged }).eq('id', user.id);
        if (error) console.error('[AppSettings] Batch DB error:', error.message);
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
