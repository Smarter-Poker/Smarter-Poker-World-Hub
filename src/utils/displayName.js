/**
 * Display Name Utility
 * Centralized logic for determining how to display user names in social media
 */

/**
 * Get the display name for a user based on their preference
 * @param {Object} user - User object with full_name, username, and display_name_preference
 * @param {string} user.full_name - User's full name (e.g., "John Smith")
 * @param {string} user.username - User's username/alias (e.g., "pokerpro123")
 * @param {string} user.display_name_preference - User's preference: 'username' or 'full_name'
 * @returns {string} - The appropriate display name
 */
export function getDisplayName(user) {
    if (!user) return 'Anonymous';

    const preference = user.display_name_preference || 'username'; // Default to Poker Alias

    if (preference === 'full_name') {
        return user.full_name || user.username || 'Anonymous';
    }

    // Default to username
    return user.username || user.full_name || 'Anonymous';
}

/**
 * Get display name with fallback for author objects
 * Handles both author.name and author.full_name patterns
 */
export function getAuthorDisplayName(author) {
    if (!author) return 'Anonymous';

    const preference = author.display_name_preference || 'username'; // Default to Poker Alias

    if (preference === 'full_name') {
        return author.full_name || author.name || author.username || 'Anonymous';
    }

    // Default to username
    return author.username || author.full_name || author.name || 'Anonymous';
}
