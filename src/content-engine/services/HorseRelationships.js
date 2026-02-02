/**
 * 🐴 HORSE RELATIONSHIPS - Friend Groups & Social Dynamics
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Defines relationship networks between horses for realistic social interactions.
 * Horses in the same friend group interact more often (likes, comments, replies).
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// ═══════════════════════════════════════════════════════════════════════════
// FRIEND GROUP DEFINITIONS - Based on stakes, personality, and vibe
// ═══════════════════════════════════════════════════════════════════════════
const FRIEND_GROUP_TYPES = [
    'high_rollers',      // High stakes players who respect each other
    'grinders',          // Mid-stakes regular grinders
    'rec_players',       // Recreational/casual players
    'study_group',       // Players who share strategy content
    'degen_crew',        // Late-night grinding degens
    'old_school',        // Experienced veterans
    'young_guns',        // Up-and-coming players
    'content_creators',  // Players who make poker content
    'tournament_regs',   // Tournament circuit regulars
    'cash_game_pros'     // Cash game specialists
];

// Reply templates for threaded conversations
const REPLY_TEMPLATES = {
    agreement: ['this', 'facts', 'fr', 'yep', '💯', 'real', 'exactly'],
    disagreement: ['nah', 'idk about that', 'hmm', '🤔', 'debatable'],
    hype: ['YOOO', 'LFG', '🔥🔥', 'massive', 'lets gooo'],
    casual: ['lol', 'haha', '😂', 'bruh', 'same'],
    support: ['gg', '🙏', 'congrats', 'nice one', '👑']
};

/**
 * Get a horse's friend group based on their profile_id hash
 * @param {string} profileId - Horse's profile UUID
 * @returns {string} Friend group type
 */
export function getHorseFriendGroup(profileId) {
    if (!profileId) return 'grinders';

    let hash = 0;
    for (let i = 0; i < profileId.length; i++) {
        hash = ((hash << 5) - hash) + profileId.charCodeAt(i);
        hash = hash & hash;
    }

    return FRIEND_GROUP_TYPES[Math.abs(hash) % FRIEND_GROUP_TYPES.length];
}

/**
 * Check if two horses are in the same friend group
 * @param {string} profileId1 - First horse's profile UUID
 * @param {string} profileId2 - Second horse's profile UUID
 * @returns {boolean} True if in same friend group
 */
export function areHorsesFriends(profileId1, profileId2) {
    return getHorseFriendGroup(profileId1) === getHorseFriendGroup(profileId2);
}

/**
 * Get interaction probability modifier based on relationship
 * @param {string} profileId1 - Actor horse's profile UUID
 * @param {string} profileId2 - Target horse's profile UUID
 * @returns {number} Multiplier for interaction probability (1.0 = normal)
 */
export function getInteractionModifier(profileId1, profileId2) {
    if (areHorsesFriends(profileId1, profileId2)) {
        return 2.5; // 2.5x more likely to interact with friends
    }

    // Check for "rivals" - different group entirely, rare interactions
    const group1 = getHorseFriendGroup(profileId1);
    const group2 = getHorseFriendGroup(profileId2);

    // High rollers and rec players rarely interact
    if ((group1 === 'high_rollers' && group2 === 'rec_players') ||
        (group1 === 'rec_players' && group2 === 'high_rollers')) {
        return 0.3;
    }

    return 1.0;
}

/**
 * Select a horse to reply to a post based on relationships
 * @param {string} postAuthorId - Profile ID of the post author
 * @param {Array} availableHorses - Array of horse objects that could reply
 * @returns {Object|null} Selected horse to reply, or null if none
 */
export function selectHorseForReply(postAuthorId, availableHorses) {
    if (!availableHorses || availableHorses.length === 0) return null;

    // Weight horses by their interaction modifier
    const weighted = availableHorses.map(horse => ({
        horse,
        weight: getInteractionModifier(horse.profile_id, postAuthorId)
    }));

    const totalWeight = weighted.reduce((sum, w) => sum + w.weight, 0);
    let random = Math.random() * totalWeight;

    for (const { horse, weight } of weighted) {
        random -= weight;
        if (random <= 0) return horse;
    }

    return weighted[0].horse;
}

/**
 * Generate a reply that fits the relationship context
 * @param {string} replierProfileId - Profile ID of the horse replying
 * @param {string} originalPost - Content of the post being replied to
 * @param {string} replyType - Type of reply (agreement, hype, casual, etc.)
 * @returns {string} Generated reply text
 */
export function generateContextualReply(replierProfileId, originalPost, replyType = null) {
    // Auto-detect reply type if not specified
    if (!replyType) {
        const lower = (originalPost || '').toLowerCase();
        if (lower.match(/win|ship|congrats|1st/)) {
            replyType = 'hype';
        } else if (lower.match(/bad|lost|bust|rip/)) {
            replyType = 'support';
        } else if (lower.match(/lol|haha|😂/)) {
            replyType = 'casual';
        } else {
            replyType = Math.random() > 0.5 ? 'agreement' : 'casual';
        }
    }

    const templates = REPLY_TEMPLATES[replyType] || REPLY_TEMPLATES.casual;

    // Select deterministically based on horse's hash
    let hash = 0;
    for (let i = 0; i < replierProfileId.length; i++) {
        hash = ((hash << 5) - hash) + replierProfileId.charCodeAt(i);
        hash = hash & hash;
    }

    return templates[Math.abs(hash) % templates.length];
}

/**
 * Check if a horse should reply to a post (probability check)
 * @param {string} replierProfileId - Profile ID of potential replier
 * @param {string} postAuthorId - Profile ID of post author
 * @param {number} baseChance - Base probability of replying (default 0.15)
 * @returns {boolean} True if horse should reply
 */
export function shouldHorseReply(replierProfileId, postAuthorId, baseChance = 0.15) {
    const modifier = getInteractionModifier(replierProfileId, postAuthorId);
    const adjustedChance = baseChance * modifier;
    return Math.random() < adjustedChance;
}

/**
 * Get recent posts from horses in the same friend group for threading
 * @param {string} horseProfileId - Profile ID to find group posts for
 * @param {number} limit - Max posts to return
 * @returns {Promise<Array>} Recent posts from friend group
 */
export async function getFriendGroupPosts(horseProfileId, limit = 5) {
    try {
        const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
        const group = getHorseFriendGroup(horseProfileId);

        // Get all horses (we'll filter by group based on their IDs)
        const { data: horses } = await supabase
            .from('content_authors')
            .select('profile_id, alias')
            .eq('is_active', true)
            .not('profile_id', 'is', null);

        if (!horses) return [];

        // Filter to same friend group
        const groupHorses = horses.filter(h =>
            h.profile_id !== horseProfileId &&
            getHorseFriendGroup(h.profile_id) === group
        );

        if (groupHorses.length === 0) return [];

        const groupIds = groupHorses.map(h => h.profile_id);

        // Get recent posts from group
        const { data: posts } = await supabase
            .from('social_posts')
            .select('id, author_id, content, created_at')
            .in('author_id', groupIds)
            .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
            .order('created_at', { ascending: false })
            .limit(limit);

        return posts || [];
    } catch (error) {
        console.error('Error fetching friend group posts:', error);
        return [];
    }
}

export default {
    getHorseFriendGroup,
    areHorsesFriends,
    getInteractionModifier,
    selectHorseForReply,
    generateContextualReply,
    shouldHorseReply,
    getFriendGroupPosts,
    FRIEND_GROUP_TYPES,
    REPLY_TEMPLATES
};
