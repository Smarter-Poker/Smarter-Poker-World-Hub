/**
 * 🌐 SOCIAL DATA TYPES & INTERFACES
 * src/app/social/types.js
 * 
 * TypeScript-style interfaces for Social Objects aligned with Global State.
 * Using JSDoc for type documentation in JavaScript.
 */

// ═══════════════════════════════════════════════════════════════════════════
// 👤 AUTHOR TYPES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * @typedef {Object} SocialAuthor
 * @property {string} id - User UUID
 * @property {string} username - Display name
 * @property {string|null} avatarUrl - Avatar storage URL
 * @property {number} level - Current player level
 * @property {string} tier - Tier badge (BRONZE, SILVER, GOLD, GTO_MASTER)
 * @property {boolean} isVerified - Verification status
 * @property {boolean} isFollowing - Whether current user follows this author
 */

/**
 * Create author object from profile data
 * @param {Object} profile - User DNA profile
 * @returns {SocialAuthor}
 */
export function createAuthor(profile) {
    return {
        id: profile.user_id || profile.id,
        username: profile.username || 'Anonymous',
        avatarUrl: profile.avatar_url || null,
        level: profile.current_level || 1,
        tier: profile.tier_id || 'BRONZE',
        isVerified: profile.is_verified || false,
        isFollowing: false
    };
}

// ═══════════════════════════════════════════════════════════════════════════
// 📝 POST TYPES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * @typedef {'text' | 'image' | 'video' | 'achievement' | 'milestone'} PostContentType
 */

/**
 * @typedef {'public' | 'followers' | 'private'} PostVisibility
 */

/**
 * @typedef {Object} EngagementMetrics
 * @property {number} likeCount - Total likes
 * @property {number} commentCount - Total comments
 * @property {number} shareCount - Total shares
 * @property {number} viewCount - Total views
 */

/**
 * @typedef {Object} SocialPost
 * @property {string} id - Post UUID
 * @property {SocialAuthor} author - Author information
 * @property {string} content - Post text content
 * @property {PostContentType} contentType - Type of content
 * @property {string[]} mediaUrls - Array of media URLs
 * @property {EngagementMetrics} engagement - Engagement metrics
 * @property {PostVisibility} visibility - Visibility setting
 * @property {boolean} isPinned - Is post pinned
 * @property {boolean} isLiked - Has current user liked
 * @property {string|null} userReaction - Current user's reaction type
 * @property {Object|null} achievementData - Achievement metadata if applicable
 * @property {string} createdAt - ISO timestamp
 * @property {string} updatedAt - ISO timestamp
 * @property {string} relativeTime - Human-readable relative time
 */

/**
 * Create post object from database row
 * @param {Object} row - Database row
 * @param {Object} author - Author profile
 * @returns {SocialPost}
 */
export function createPost(row, author = null) {
    return {
        id: row.id || row.post_id,
        authorId: row.author_id, // For delete ownership check
        author: author || createAuthor({
            user_id: row.author_id,
            username: row.author_username,
            avatar_url: row.author_avatar,
            current_level: row.author_level,
            tier_id: row.author_tier
        }),
        content: row.content,
        contentType: row.content_type || 'text',
        mediaUrls: row.media_urls || [],
        engagement: {
            likeCount: row.like_count || 0,
            commentCount: row.comment_count || 0,
            shareCount: row.share_count || 0,
            viewCount: row.view_count || 0
        },
        visibility: row.visibility || 'public',
        isPinned: row.is_pinned || false,
        isLiked: row.is_liked || false,
        userReaction: row.user_reaction || null,
        achievementData: row.achievement_data || null,
        createdAt: row.created_at,
        updatedAt: row.updated_at || row.created_at,
        relativeTime: getRelativeTime(row.created_at)
    };
}

// ═══════════════════════════════════════════════════════════════════════════
// 💬 COMMENT TYPES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * @typedef {Object} SocialComment
 * @property {string} id - Comment UUID
 * @property {string} postId - Parent post ID
 * @property {SocialAuthor} author - Comment author
 * @property {string} content - Comment text
 * @property {number} likeCount - Likes on comment
 * @property {boolean} isLiked - Has current user liked
 * @property {string|null} parentId - Parent comment ID (for replies)
 * @property {SocialComment[]} replies - Nested replies
 * @property {string} createdAt - ISO timestamp
 * @property {string} relativeTime - Human-readable relative time
 */

/**
 * Create comment object from database row
 * @param {Object} row - Database row
 * @returns {SocialComment}
 */
export function createComment(row) {
    return {
        id: row.id,
        postId: row.post_id,
        author: createAuthor({
            user_id: row.author_id,
            username: row.author_username,
            avatar_url: row.author_avatar,
            current_level: row.author_level
        }),
        content: row.content,
        likeCount: row.like_count || 0,
        isLiked: row.is_liked || false,
        parentId: row.parent_id || null,
        replies: [],
        createdAt: row.created_at,
        relativeTime: getRelativeTime(row.created_at)
    };
}

// ═══════════════════════════════════════════════════════════════════════════
// 💫 INTERACTION TYPES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * @typedef {'like' | 'love' | 'fire' | 'clap' | 'mind_blown'} InteractionType
 */

export const INTERACTION_TYPES = {
    like: { emoji: '👍', label: 'Like', color: '#00BFFF' },
    love: { emoji: '❤️', label: 'Love', color: '#FF1493' },
    fire: { emoji: '🔥', label: 'Fire', color: '#FF6B35' },
    clap: { emoji: '👏', label: 'Clap', color: '#FFD700' },
    mind_blown: { emoji: '🤯', label: 'Mind Blown', color: '#9400D3' }
};

/**
 * @typedef {Object} SocialInteraction
 * @property {string} id - Interaction UUID
 * @property {string} userId - User who interacted
 * @property {string} postId - Target post
 * @property {InteractionType} type - Interaction type
 * @property {string} createdAt - ISO timestamp
 */

// ═══════════════════════════════════════════════════════════════════════════
// 🤝 CONNECTION TYPES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * @typedef {'active' | 'pending' | 'blocked'} ConnectionStatus
 */

/**
 * @typedef {Object} SocialConnection
 * @property {string} id - Connection UUID
 * @property {string} followerId - Follower user ID
 * @property {string} followingId - Following user ID
 * @property {ConnectionStatus} status - Connection status
 * @property {boolean} notifyPosts - Notify on new posts
 * @property {boolean} notifyAchievements - Notify on achievements
 * @property {string} createdAt - ISO timestamp
 */

// ═══════════════════════════════════════════════════════════════════════════
// 🎯 FEED FILTER TYPES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * @typedef {'recent' | 'trending' | 'following'} FeedFilter
 */

export const FEED_FILTERS = {
    recent: { label: 'Recent', icon: '🕐', description: 'Latest posts' },
    trending: { label: 'Trending', icon: '🔥', description: 'Most popular' },
    following: { label: 'Following', icon: '👥', description: 'From people you follow' }
};

/**
 * @typedef {Object} FeedState
 * @property {SocialPost[]} posts - Array of posts
 * @property {FeedFilter} filter - Current filter
 * @property {boolean} isLoading - Loading state
 * @property {boolean} hasMore - Has more posts to load
 * @property {number} offset - Current pagination offset
 * @property {string|null} error - Error message
 */

export const initialFeedState = {
    posts: [],
    filter: 'recent',
    isLoading: false,
    hasMore: true,
    offset: 0,
    error: null
};

// ═══════════════════════════════════════════════════════════════════════════
// 🛠️ UTILITY FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get relative time string from timestamp
 * @param {string} timestamp - ISO timestamp
 * @returns {string} - Relative time string
 */
export function getRelativeTime(timestamp) {
    if (!timestamp) return 'just now';

    const now = new Date();
    const date = new Date(timestamp);
    const seconds = Math.floor((now - date) / 1000);

    if (seconds < 60) return 'just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
    if (seconds < 2592000) return `${Math.floor(seconds / 604800)}w ago`;

    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/**
 * Validate post content
 * @param {string} content - Post content
 * @returns {{ valid: boolean, error?: string }}
 */
export function validatePostContent(content) {
    if (!content || content.trim().length === 0) {
        return { valid: false, error: 'Post content cannot be empty' };
    }
    if (content.length > 2000) {
        return { valid: false, error: 'Post content exceeds 2000 characters' };
    }
    return { valid: true };
}

/**
 * Validate comment content
 * @param {string} content - Comment content
 * @returns {{ valid: boolean, error?: string }}
 */
export function validateCommentContent(content) {
    if (!content || content.trim().length === 0) {
        return { valid: false, error: 'Comment cannot be empty' };
    }
    if (content.length > 500) {
        return { valid: false, error: 'Comment exceeds 500 characters' };
    }
    return { valid: true };
}

export default {
    INTERACTION_TYPES,
    FEED_FILTERS,
    initialFeedState,
    createAuthor,
    createPost,
    createComment,
    getRelativeTime,
    validatePostContent,
    validateCommentContent
};
