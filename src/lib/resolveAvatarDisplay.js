/**
 * resolveAvatarDisplay — Shared avatar resolution for all Club Arena displays
 * 
 * Given a user's avatar_url (from profiles table), returns the best display URL.
 * - Custom avatars (Supabase/external URLs) → used directly
 * - Library avatars (/avatars/free/*.png) → mapped to table-optimized versions
 * - No avatar → deterministic fallback based on a seed string (user ID, index, etc.)
 */

const AVATAR_FALLBACKS = [
    '/avatars/table/free_shark.png',
    '/avatars/table/free_lion.png',
    '/avatars/table/free_owl.png',
    '/avatars/table/free_fox.png',
    '/avatars/table/free_ninja.png',
    '/avatars/table/free_pirate.png',
    '/avatars/table/free_samurai.png',
    '/avatars/table/free_viking.png',
    '/avatars/table/free_knight.png',
    '/avatars/table/free_cowboy.png',
    '/avatars/table/free_wizard.png',
    '/avatars/table/free_rockstar.png',
    '/avatars/table/free_detective.png',
    '/avatars/table/free_cyborg.png',
    '/avatars/table/free_penguin.png',
];

/**
 * Simple hash of a string to a positive integer (for deterministic avatar assignment)
 */
function hashSeed(str) {
    if (!str) return 0;
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = ((hash << 5) - hash) + str.charCodeAt(i);
        hash = hash & hash;
    }
    return Math.abs(hash);
}

/**
 * Resolve avatar URL with fallback chain:
 * 1. Custom avatar (external URL) → use directly
 * 2. Library avatar path → map to table-optimized version
 * 3. No avatar → deterministic fallback from seed
 * 
 * @param {string|null} avatarUrl - The avatar_url from profiles table
 * @param {string|number} seed - A seed for deterministic fallback (user ID, index, etc.)
 * @returns {string} Resolved avatar URL
 */
export function resolveAvatarDisplay(avatarUrl, seed = '') {
    // Custom avatar (Supabase/external URL)
    if (avatarUrl && (avatarUrl.startsWith('http') || avatarUrl.startsWith('data:'))) {
        return avatarUrl;
    }
    // Library avatar path → table-optimized version
    if (avatarUrl && avatarUrl.startsWith('/avatars/')) {
        const filename = avatarUrl.split('/').pop().replace('.png', '');
        const tier = avatarUrl.includes('/vip/') ? 'vip' : 'free';
        return `/avatars/table/${tier}_${filename}.png`;
    }
    // Deterministic fallback
    const idx = typeof seed === 'number' ? seed : hashSeed(String(seed));
    return AVATAR_FALLBACKS[idx % AVATAR_FALLBACKS.length];
}

export default resolveAvatarDisplay;
