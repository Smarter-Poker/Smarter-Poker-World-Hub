/**
 * 🐴 HORSE MEMORY SERVICE - Track what horses have posted
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Tracks recent post topics per horse to ensure content diversity.
 * Prevents the same horse from posting similar content repeatedly.
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// In-memory cache for quick lookups (persists per function instance)
const memoryCache = new Map();

/**
 * Get a horse's recent post topics from the database
 * @param {string} horseProfileId - The horse's profile UUID
 * @param {number} lookbackHours - How many hours to look back (default 48)
 * @returns {Promise<string[]>} Array of content categories posted recently
 */
export async function getRecentTopics(horseProfileId, lookbackHours = 48) {
    const cacheKey = `topics_${horseProfileId}`;

    // Check cache first (valid for 5 minutes)
    const cached = memoryCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < 5 * 60 * 1000) {
        return cached.topics;
    }

    try {
        const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
        const cutoff = new Date(Date.now() - lookbackHours * 60 * 60 * 1000);

        const { data: posts } = await supabase
            .from('social_posts')
            .select('content, content_type, created_at')
            .eq('author_id', horseProfileId)
            .gte('created_at', cutoff.toISOString())
            .order('created_at', { ascending: false })
            .limit(10);

        if (!posts || posts.length === 0) {
            return [];
        }

        // Extract content categories from posts
        const topics = posts.map(post => detectTopicFromContent(post.content));

        // Update cache
        memoryCache.set(cacheKey, { topics, timestamp: Date.now() });

        return topics;
    } catch (error) {
        console.error('Error fetching recent topics:', error);
        return [];
    }
}

/**
 * Check if a horse should avoid a specific topic based on recent posts
 * @param {string} horseProfileId - The horse's profile UUID
 * @param {string} topic - The topic to check (e.g., 'tournament', 'strategy')
 * @param {number} threshold - Max times a topic can appear before avoiding (default 2)
 * @returns {Promise<boolean>} True if horse should avoid this topic
 */
export async function shouldAvoidTopic(horseProfileId, topic, threshold = 2) {
    const recentTopics = await getRecentTopics(horseProfileId);
    const topicCount = recentTopics.filter(t => t === topic).length;
    return topicCount >= threshold;
}

/**
 * Get a horse's post count for the current day
 * @param {string} horseProfileId - The horse's profile UUID
 * @returns {Promise<number>} Number of posts today
 */
export async function getTodayPostCount(horseProfileId) {
    try {
        const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const { count } = await supabase
            .from('social_posts')
            .select('id', { count: 'exact', head: true })
            .eq('author_id', horseProfileId)
            .gte('created_at', today.toISOString());

        return count || 0;
    } catch (error) {
        console.error('Error fetching today post count:', error);
        return 0;
    }
}

/**
 * Check if a horse has reached their daily post limit
 * @param {string} horseProfileId - The horse's profile UUID
 * @param {number} limit - Max posts per day (default 4)
 * @returns {Promise<boolean>} True if horse has reached limit
 */
export async function hasReachedDailyLimit(horseProfileId, limit = 4) {
    const todayCount = await getTodayPostCount(horseProfileId);
    return todayCount >= limit;
}

/**
 * Detect topic from post content
 * @param {string} content - The post content
 * @returns {string} Detected topic category
 */
function detectTopicFromContent(content) {
    const lower = (content || '').toLowerCase();

    if (lower.match(/wsop|wpt|tournament|bracelet|final table|win|ship|champion/)) {
        return 'tournament';
    }
    if (lower.match(/strategy|gto|range|study|solver|ev|icm/)) {
        return 'strategy';
    }
    if (lower.match(/clip|video|watch|stream|live/)) {
        return 'clip';
    }
    if (lower.match(/bad beat|cooler|suck|lost|bust/)) {
        return 'bad_beat';
    }
    if (lower.match(/grind|session|life|story/)) {
        return 'lifestyle';
    }
    return 'general';
}

/**
 * Get time since horse's last post
 * @param {string} horseProfileId - The horse's profile UUID
 * @returns {Promise<number>} Minutes since last post (or Infinity if never posted)
 */
export async function getMinutesSinceLastPost(horseProfileId) {
    try {
        const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

        const { data: posts } = await supabase
            .from('social_posts')
            .select('created_at')
            .eq('author_id', horseProfileId)
            .order('created_at', { ascending: false })
            .limit(1);

        if (!posts || posts.length === 0) {
            return Infinity;
        }

        const lastPost = new Date(posts[0].created_at);
        return Math.floor((Date.now() - lastPost.getTime()) / (1000 * 60));
    } catch (error) {
        console.error('Error fetching last post time:', error);
        return Infinity;
    }
}

export default {
    getRecentTopics,
    shouldAvoidTopic,
    getTodayPostCount,
    hasReachedDailyLimit,
    getMinutesSinceLastPost
};
