/**
 * Avatar Pool System
 * ==================
 * Manages avatar selection and rotation for training games.
 * Provides seeded shuffling so same game/level always shows same avatars.
 */

// Free avatars (available to all users) - clean bust images (badge rendered separately)
export const FREE_AVATARS = [
    '/avatars/free/lion.png',
    '/avatars/free/shark.png',
    '/avatars/free/owl.png',
    '/avatars/free/fox.png',
    '/avatars/free/ninja.png',
    '/avatars/free/pirate.png',
    '/avatars/free/samurai.png',
    '/avatars/free/viking.png',
    '/avatars/free/knight.png',
    '/avatars/free/cowboy.png',
    '/avatars/free/cyborg.png',
    '/avatars/free/detective.png',
];

// VIP avatars (premium users only) - clean bust images (badge rendered separately)
export const VIP_AVATARS = [
    '/avatars/free/rockstar.png',
    '/avatars/free/wizard.png',
    '/avatars/free/chef.png',
    '/avatars/free/geisha.png',
    '/avatars/free/aztec.png',
    '/avatars/free/business.png',
    '/avatars/free/musician.png',
    '/avatars/free/android.png',
    '/avatars/free/penguin.png',
    '/avatars/free/rabbit.png',
    '/avatars/free/shiba.png',
    '/avatars/free/space_captain.png',
    '/avatars/free/teacher.png',
];

// All avatars combined
export const ALL_AVATARS = [...FREE_AVATARS, ...VIP_AVATARS];

/**
 * Seeded random number generator
 * Same seed always produces same sequence
 */
function seededRandom(seed) {
    let x = Math.sin(seed++) * 10000;
    return x - Math.floor(x);
}

/**
 * Fisher-Yates shuffle with seed
 * Same seed = same shuffle result
 */
function seededShuffle(array, seed) {
    const shuffled = [...array];
    let currentSeed = seed;

    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(seededRandom(currentSeed++) * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    return shuffled;
}

/**
 * Generate a numeric seed from a string
 */
function hashString(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash);
}

/**
 * Get villain avatars for a specific game and level
 * @param gameId - The game identifier (e.g., 'blind-vs-blind')
 * @param levelId - The level number (1, 2, 3, etc.)
 * @param count - Number of villains needed
 * @param excludeHeroAvatar - Avatar to exclude (hero's avatar)
 * @returns Array of avatar paths
 */
export function getVillainAvatars(gameId, levelId = 1, count = 8, excludeHeroAvatar = null) {
    // Create a unique seed from gameId + levelId
    const seed = hashString(`${gameId}-level-${levelId}`);

    // Get available avatars (excluding hero's avatar if specified)
    let available = [...ALL_AVATARS];
    if (excludeHeroAvatar) {
        available = available.filter(a => a !== excludeHeroAvatar);
    }

    // Shuffle with seed
    const shuffled = seededShuffle(available, seed);

    // Return requested count
    return shuffled.slice(0, count);
}

/**
 * Get hero avatar
 * Priority: User profile > localStorage > default
 */
export function getHeroAvatar(userProfile = null) {
    // Check user profile first
    if (userProfile?.avatar_url) {
        return userProfile.avatar_url;
    }

    // Check localStorage for custom selection
    if (typeof window !== 'undefined') {
        const stored = localStorage.getItem('hero_avatar');
        if (stored) return stored;
    }

    // Default hero avatar (clean bust image)
    return '/avatars/free/rockstar.png';
}

/**
 * Set hero avatar (saves to localStorage)
 */
export function setHeroAvatar(avatarPath) {
    if (typeof window !== 'undefined') {
        localStorage.setItem('hero_avatar', avatarPath);
    }
}

/**
 * Get all available avatars for selection
 * @param isVip - Whether user has VIP access
 */
export function getSelectableAvatars(isVip = false) {
    return isVip ? ALL_AVATARS : FREE_AVATARS;
}
