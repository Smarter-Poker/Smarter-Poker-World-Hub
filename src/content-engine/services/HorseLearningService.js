/**
 * 🐴 HORSE LEARNING SERVICE - Learn from Engagement
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Tracks which post styles get more engagement and subtly shifts toward them.
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// Style categories we track
const STYLE_CATEGORIES = [
    'emoji_heavy',
    'emoji_minimal',
    'short_form',
    'longer_form',
    'hype_energy',
    'chill_energy',
    'news_repost',
    'clip_share',
    'original_thought'
];

// In-memory cache for quick lookups
const engagementCache = new Map();

/**
 * Record engagement for a post style
 * @param {string} horseProfileId - Horse profile UUID
 * @param {string} styleKey - Style category
 * @param {number} likes - Number of likes received
 * @param {number} comments - Number of comments received
 */
export async function recordPostEngagement(horseProfileId, styleKey, likes = 0, comments = 0) {
    const cacheKey = `${horseProfileId}_${styleKey}`;
    const current = engagementCache.get(cacheKey) || { totalLikes: 0, totalComments: 0, postCount: 0 };

    engagementCache.set(cacheKey, {
        totalLikes: current.totalLikes + likes,
        totalComments: current.totalComments + comments,
        postCount: current.postCount + 1,
        lastUpdated: Date.now()
    });
}

/**
 * Get engagement stats for a horse across all styles
 * @param {string} horseProfileId - Horse profile UUID
 * @returns {Object} Stats per style category
 */
export function getEngagementStats(horseProfileId) {
    const stats = {};

    for (const style of STYLE_CATEGORIES) {
        const cacheKey = `${horseProfileId}_${style}`;
        const data = engagementCache.get(cacheKey);

        if (data && data.postCount > 0) {
            stats[style] = {
                avgLikes: data.totalLikes / data.postCount,
                avgComments: data.totalComments / data.postCount,
                postCount: data.postCount
            };
        }
    }

    return stats;
}

/**
 * Get the best performing style for a horse
 * @param {string} horseProfileId - Horse profile UUID
 * @returns {string|null} Best performing style key
 */
export function getBestPerformingStyle(horseProfileId) {
    const stats = getEngagementStats(horseProfileId);

    let bestStyle = null;
    let bestScore = 0;

    for (const [style, data] of Object.entries(stats)) {
        // Require minimum 3 posts to consider
        if (data.postCount < 3) continue;

        const score = data.avgLikes + (data.avgComments * 2); // Comments worth more
        if (score > bestScore) {
            bestScore = score;
            bestStyle = style;
        }
    }

    return bestStyle;
}

/**
 * Get style modifier based on learning
 * @param {string} horseProfileId - Horse profile UUID
 * @returns {Object} Style adjustments
 */
export function getLearnedStyleModifiers(horseProfileId) {
    const bestStyle = getBestPerformingStyle(horseProfileId);

    if (!bestStyle) return { emojiMod: 1.0, lengthMod: 1.0, energyMod: 1.0 };

    // Adjust based on what works
    const modifiers = {
        emoji_heavy: { emojiMod: 1.3, lengthMod: 1.0, energyMod: 1.0 },
        emoji_minimal: { emojiMod: 0.7, lengthMod: 1.0, energyMod: 1.0 },
        short_form: { emojiMod: 1.0, lengthMod: 0.7, energyMod: 1.0 },
        longer_form: { emojiMod: 1.0, lengthMod: 1.3, energyMod: 1.0 },
        hype_energy: { emojiMod: 1.2, lengthMod: 1.0, energyMod: 1.4 },
        chill_energy: { emojiMod: 0.9, lengthMod: 1.1, energyMod: 0.7 }
    };

    return modifiers[bestStyle] || { emojiMod: 1.0, lengthMod: 1.0, energyMod: 1.0 };
}

/**
 * Detect style category from post content
 * @param {string} content - Post content
 * @returns {string} Style category
 */
export function detectStyleCategory(content) {
    const emojiCount = (content.match(/[\u{1F300}-\u{1F9FF}]/gu) || []).length;
    const wordCount = content.split(/\s+/).length;

    if (emojiCount >= 3) return 'emoji_heavy';
    if (emojiCount === 0) return 'emoji_minimal';
    if (wordCount <= 4) return 'short_form';
    if (wordCount >= 10) return 'longer_form';
    if (content.match(/LFG|LETS|🔥🔥|!!!/i)) return 'hype_energy';
    if (content.match(/chill|vibes|relaxing/i)) return 'chill_energy';
    if (content.includes('http') || content.includes('🔗')) return 'news_repost';

    return 'original_thought';
}

/**
 * Analyze recent posts and update engagement cache from database
 * @param {string} horseProfileId - Horse profile UUID
 */
export async function syncEngagementFromDatabase(horseProfileId) {
    try {
        const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

        // Get recent posts with like counts
        const { data: posts } = await supabase
            .from('social_posts')
            .select(`
                id,
                content,
                created_at,
                social_post_likes(count),
                social_post_comments(count)
            `)
            .eq('author_id', horseProfileId)
            .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
            .limit(20);

        if (!posts) return;

        for (const post of posts) {
            const styleKey = detectStyleCategory(post.content);
            const likes = post.social_post_likes?.[0]?.count || 0;
            const comments = post.social_post_comments?.[0]?.count || 0;

            await recordPostEngagement(horseProfileId, styleKey, likes, comments);
        }
    } catch (error) {
        console.error('Error syncing engagement:', error);
    }
}

export default {
    recordPostEngagement,
    getEngagementStats,
    getBestPerformingStyle,
    getLearnedStyleModifiers,
    detectStyleCategory,
    syncEngagementFromDatabase,
    STYLE_CATEGORIES
};
