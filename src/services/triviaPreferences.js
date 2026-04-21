/**
 * Trivia Preferences Service
 * Manages user preferences for the Trivia page
 * Uses localStorage with per-user keys for persistence
 */

const DEFAULTS = { soundEffects: true, timerEnabled: true, hintsEnabled: false, difficulty: 'medium' };
const STORAGE_KEY = 'sp-trivia-prefs';

function getStorageKey(userId) {
    return userId ? `${STORAGE_KEY}-${userId}` : STORAGE_KEY;
}

/**
 * Get user's trivia preferences
 * @param {string} userId - User ID
 * @returns {Promise<Object>} Preferences object
 */
export async function getTriviaPreferences(userId) {
    try {
        if (typeof window === 'undefined') return { ...DEFAULTS };
        const raw = localStorage.getItem(getStorageKey(userId));
        if (raw) {
            return { ...DEFAULTS, ...JSON.parse(raw) };
        }
    } catch (e) { console.warn('[App] Handled exception:', e?.message || e); }
    return { ...DEFAULTS };
}

/**
 * Update user's trivia preferences
 * @param {string} userId - User ID
 * @param {Object} preferences - Preferences to update
 * @returns {Promise<Object>} Updated preferences
 */
export async function updateTriviaPreferences(userId, preferences) {
    try {
        if (typeof window === 'undefined') return preferences;
        const current = await getTriviaPreferences(userId);
        const merged = { ...current, ...preferences };
        localStorage.setItem(getStorageKey(userId), JSON.stringify(merged));
        return merged;
    } catch (e) {
        console.warn('[TriviaPrefs] Failed to save:', e);
        throw e;
    }
}
