/**
 * ═══════════════════════════════════════════════════════════════════════════
 * PROFILE FALLBACK UTILITY
 * /src/utils/profileFallback.js
 * 
 * Provides null-safe profile handling to prevent new users from breaking
 * features when FK joins return null.
 * ═══════════════════════════════════════════════════════════════════════════
 */

// Default profile object for when FK joins fail
export const DEFAULT_PROFILE = {
    id: null,
    display_name: 'Unknown User',
    username: null,
    full_name: null,
    avatar_url: null,
    email: null
};

/**
 * Returns a safe profile object, using defaults for null/undefined profiles
 * @param {Object|null} profile - The profile from FK join
 * @param {Object} fallback - Custom fallback values (optional)
 * @returns {Object} - Safe profile object
 */
export function safeProfile(profile, fallback = {}) {
    if (profile) return profile;
    return { ...DEFAULT_PROFILE, ...fallback };
}

/**
 * Safely get display name from profile with fallback
 * @param {Object|null} profile - Profile object
 * @returns {string} - Display name or 'Unknown User'
 */
export function getDisplayName(profile) {
    if (!profile) return 'Unknown User';
    return profile.display_name || profile.full_name || profile.username || 'Unknown User';
}

/**
 * Enrich items array with safe profile data
 * @param {Array} items - Array of items with profile FK joins
 * @param {string} profileKey - Key where profile data lives (e.g., 'profiles')
 * @returns {Array} - Items with guaranteed non-null profile data
 */
export function enrichWithSafeProfiles(items, profileKey = 'profiles') {
    return (items || []).map(item => ({
        ...item,
        [profileKey]: safeProfile(item[profileKey])
    }));
}

/**
 * Build profile map from array with safe fallbacks
 * @param {Array} profiles - Array of profile objects
 * @returns {Object} - Map of id -> profile with defaults for missing
 */
export function buildSafeProfileMap(profiles) {
    const map = {};
    (profiles || []).forEach(p => {
        if (p?.id) map[p.id] = p;
    });
    return map;
}

/**
 * Get profile from map with automatic fallback
 * @param {Object} profileMap - Map of id -> profile
 * @param {string} userId - User ID to look up
 * @returns {Object} - Profile or default
 */
export function getProfileFromMap(profileMap, userId) {
    return profileMap[userId] || { ...DEFAULT_PROFILE, id: userId };
}

export default {
    DEFAULT_PROFILE,
    safeProfile,
    getDisplayName,
    enrichWithSafeProfiles,
    buildSafeProfileMap,
    getProfileFromMap
};
