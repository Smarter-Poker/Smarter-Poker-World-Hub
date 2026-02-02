/**
 * Privacy Enforcement Service
 * ═══════════════════════════════════════════════════════════════════════════
 * Centralized service for enforcing user privacy settings
 * Used by friend requests, online status, message filtering, and profile views
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { supabase } from '../lib/supabase';

// ═══════════════════════════════════════════════════════════════════════════
// PRIVACY CHECK FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Check if a user accepts friend requests
 * @param {string} targetUserId - The user to check
 * @returns {Promise<boolean>} - True if friend requests are allowed
 */
export async function canSendFriendRequest(targetUserId) {
    try {
        const { data, error } = await supabase
            .from('profiles')
            .select('friend_preferences')
            .eq('id', targetUserId)
            .single();

        if (error) {
            console.error('[Privacy] Error checking friend request permission:', error);
            return true; // Default to allowing requests if check fails
        }

        // If no preferences set, default to allowing requests
        if (!data?.friend_preferences) return true;

        // Check the allowRequests setting
        return data.friend_preferences.allowRequests !== false;
    } catch (error) {
        console.error('[Privacy] Exception checking friend request permission:', error);
        return true;
    }
}

/**
 * Check if a user shows their online status
 * @param {string} targetUserId - The user to check
 * @returns {Promise<boolean>} - True if online status should be shown
 */
export async function shouldShowOnlineStatus(targetUserId) {
    try {
        const { data, error } = await supabase
            .from('profiles')
            .select('friend_preferences')
            .eq('id', targetUserId)
            .single();

        if (error) {
            console.error('[Privacy] Error checking online status visibility:', error);
            return false; // Default to hiding status if check fails
        }

        if (!data?.friend_preferences) return true;

        return data.friend_preferences.showOnlineStatus !== false;
    } catch (error) {
        console.error('[Privacy] Exception checking online status:', error);
        return false;
    }
}

/**
 * Check if a user shows their active status in messenger
 * @param {string} targetUserId - The user to check
 * @returns {Promise<boolean>} - True if active status should be shown
 */
export async function shouldShowActiveStatus(targetUserId) {
    try {
        const { data, error } = await supabase
            .from('profiles')
            .select('messenger_preferences')
            .eq('id', targetUserId)
            .single();

        if (error) {
            console.error('[Privacy] Error checking active status visibility:', error);
            return false;
        }

        if (!data?.messenger_preferences) return true;

        return data.messenger_preferences.activeStatus !== false;
    } catch (error) {
        console.error('[Privacy] Exception checking active status:', error);
        return false;
    }
}

/**
 * Check if a user accepts messages from non-friends
 * @param {string} senderId - The user sending the message
 * @param {string} receiverId - The user receiving the message
 * @returns {Promise<{allowed: boolean, reason: string}>}
 */
export async function canSendMessage(senderId, receiverId) {
    try {
        // First check if they're friends
        const { data: friendship, error: friendError } = await supabase
            .from('friendships')
            .select('id')
            .or(`and(user_id.eq.${senderId},friend_id.eq.${receiverId}),and(user_id.eq.${receiverId},friend_id.eq.${senderId})`)
            .eq('status', 'accepted')
            .single();

        // If they're friends, always allow
        if (friendship) {
            return { allowed: true, reason: 'friends' };
        }

        // If not friends, check message request settings
        const { data: profile, error: profileError } = await supabase
            .from('profiles')
            .select('messenger_preferences')
            .eq('id', receiverId)
            .single();

        if (profileError) {
            console.error('[Privacy] Error checking message permission:', profileError);
            return { allowed: true, reason: 'default' }; // Default to allowing
        }

        // For now, allow message requests if they're not explicitly blocked
        // Can be extended to check a 'messageRequestsOnly' setting
        return { allowed: true, reason: 'message_request' };
    } catch (error) {
        console.error('[Privacy] Exception checking message permission:', error);
        return { allowed: true, reason: 'error_fallback' };
    }
}

/**
 * Get privacy settings for multiple users at once (for lists/feeds)
 * @param {string[]} userIds - Array of user IDs to check
 * @returns {Promise<Object>} - Map of userId -> privacy settings
 */
export async function getBulkPrivacySettings(userIds) {
    try {
        const { data, error } = await supabase
            .from('profiles')
            .select('id, friend_preferences, messenger_preferences')
            .in('id', userIds);

        if (error) {
            console.error('[Privacy] Error fetching bulk privacy settings:', error);
            return {};
        }

        const privacyMap = {};
        (data || []).forEach(profile => {
            privacyMap[profile.id] = {
                allowFriendRequests: profile.friend_preferences?.allowRequests !== false,
                showOnlineStatus: profile.friend_preferences?.showOnlineStatus !== false,
                showActiveStatus: profile.messenger_preferences?.activeStatus !== false,
                showReadReceipts: profile.messenger_preferences?.readReceipts !== false
            };
        });

        return privacyMap;
    } catch (error) {
        console.error('[Privacy] Exception fetching bulk privacy settings:', error);
        return {};
    }
}

/**
 * Check if a user is blocked by another user
 * @param {string} blockerId - The user who may have blocked
 * @param {string} targetId - The user who may be blocked
 * @returns {Promise<boolean>} - True if blocked
 */
export async function isUserBlocked(blockerId, targetId) {
    try {
        const { data, error } = await supabase
            .from('blocked_users')
            .select('id')
            .eq('blocker_id', blockerId)
            .eq('blocked_id', targetId)
            .single();

        if (error && error.code !== 'PGRST116') {
            console.error('[Privacy] Error checking block status:', error);
            return false;
        }

        return !!data;
    } catch (error) {
        console.error('[Privacy] Exception checking block status:', error);
        return false;
    }
}

/**
 * Block a user
 * @param {string} blockerId - The user doing the blocking
 * @param {string} targetId - The user being blocked
 */
export async function blockUser(blockerId, targetId) {
    try {
        const { error } = await supabase
            .from('blocked_users')
            .insert({
                blocker_id: blockerId,
                blocked_id: targetId
            });

        if (error) throw error;

        // Also remove any existing friendship
        await supabase
            .from('friendships')
            .delete()
            .or(`and(user_id.eq.${blockerId},friend_id.eq.${targetId}),and(user_id.eq.${targetId},friend_id.eq.${blockerId})`);

        console.log('[Privacy] User blocked successfully');
    } catch (error) {
        console.error('[Privacy] Error blocking user:', error);
        throw error;
    }
}

/**
 * Unblock a user
 * @param {string} blockerId - The user doing the unblocking
 * @param {string} targetId - The user being unblocked
 */
export async function unblockUser(blockerId, targetId) {
    try {
        const { error } = await supabase
            .from('blocked_users')
            .delete()
            .eq('blocker_id', blockerId)
            .eq('blocked_id', targetId);

        if (error) throw error;

        console.log('[Privacy] User unblocked successfully');
    } catch (error) {
        console.error('[Privacy] Error unblocking user:', error);
        throw error;
    }
}

/**
 * Get list of blocked users for a user
 * @param {string} userId - The user to get blocked list for
 * @returns {Promise<Object[]>} - Array of blocked user profiles
 */
export async function getBlockedUsers(userId) {
    try {
        const { data, error } = await supabase
            .from('blocked_users')
            .select(`
                blocked_id,
                created_at,
                blocked:profiles!blocked_id(id, username, full_name, avatar_url)
            `)
            .eq('blocker_id', userId)
            .order('created_at', { ascending: false });

        if (error) throw error;
        return data || [];
    } catch (error) {
        console.error('[Privacy] Error getting blocked users:', error);
        return [];
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// FILTER HELPERS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Filter online users based on their privacy settings
 * @param {Object[]} users - Array of user objects with id and online status
 * @returns {Promise<Object[]>} - Filtered array with privacy-respecting online status
 */
export async function filterOnlineUsers(users) {
    const userIds = users.map(u => u.id);
    const privacySettings = await getBulkPrivacySettings(userIds);

    return users.map(user => ({
        ...user,
        isOnline: privacySettings[user.id]?.showOnlineStatus ? user.isOnline : false
    }));
}

/**
 * Filter friend suggestions based on privacy settings
 * @param {string} userId - The requesting user
 * @param {Object[]} suggestions - Array of suggested users
 * @returns {Promise<Object[]>} - Filtered suggestions
 */
export async function filterFriendSuggestions(userId, suggestions) {
    const suggestionIds = suggestions.map(s => s.id);
    const privacySettings = await getBulkPrivacySettings(suggestionIds);

    return suggestions.filter(user =>
        privacySettings[user.id]?.allowFriendRequests !== false
    );
}

export default {
    canSendFriendRequest,
    shouldShowOnlineStatus,
    shouldShowActiveStatus,
    canSendMessage,
    getBulkPrivacySettings,
    isUserBlocked,
    blockUser,
    unblockUser,
    getBlockedUsers,
    filterOnlineUsers,
    filterFriendSuggestions
};
