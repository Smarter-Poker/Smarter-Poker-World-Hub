/**
 * Display Name Utility
 * Centralized logic for determining how to display user names in social media
 *
 * Ruling 25: profiles.full_name (the legal name) is owner-only. Other people
 * are shown public fields only, so these helpers never read full_name and the
 * retired display_name_preference ("post as my real name") no longer applies.
 * A player who wants their real name shown makes it their display name.
 */

/**
 * Get the public name for a user
 * @param {Object} user - User object with username and display_name
 * @returns {string} - The public name
 */
export function getDisplayName(user) {
    if (!user) return 'Anonymous';
    return user.username || user.display_name || 'Anonymous';
}

/**
 * Get the public name for an author object (feed cards carry `name`, which is
 * already the public display name or username)
 */
export function getAuthorDisplayName(author) {
    if (!author) return 'Anonymous';
    return author.username || author.display_name || author.name || 'Anonymous';
}
