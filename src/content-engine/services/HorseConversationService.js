/**
 * 🐴 HORSE CONVERSATION SERVICE - Reply Chains & Threaded Conversations
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Creates multi-message back-and-forth conversations between horses.
 * Adds realistic social dynamics with natural delays and contextual replies.
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// ═══════════════════════════════════════════════════════════════════════════
// CONVERSATION TYPES
// ═══════════════════════════════════════════════════════════════════════════
const CONVERSATION_TYPES = {
    banter: {
        name: 'Friendly Banter',
        maxReplies: 3,
        templates: [
            ['lol', 'fr fr', '😂'],
            ['facts', 'this', 'real'],
            ['bruh', 'lmao', 'same']
        ]
    },
    debate: {
        name: 'Friendly Debate',
        maxReplies: 4,
        templates: [
            ['idk about that', 'hmm', 'debatable'],
            ['nah i disagree', 'fair point but', 'see what u mean'],
            ['ok maybe', 'true actually', 'valid'],
            ['gg', 'agree to disagree', '🤝']
        ]
    },
    hype_train: {
        name: 'Hype Train',
        maxReplies: 3,
        templates: [
            ['LETS GO', 'LFG', '🔥🔥'],
            ['massive', 'huge W', '👑'],
            ['congrats!', 'deserved', 'gg']
        ]
    },
    sympathy: {
        name: 'Sympathy',
        maxReplies: 2,
        templates: [
            ['rough', 'rip', 'pain'],
            ['itll turn around', 'variance', 'gg next']
        ]
    },
    strategy_chat: {
        name: 'Strategy Chat',
        maxReplies: 3,
        templates: [
            ['interesting line', 'what about x/r', 'gto?'],
            ['depends on reads', 'true', 'solver says...'],
            ['makes sense', 'ill try that', '📈']
        ]
    }
};

const CONVO_TYPES = Object.keys(CONVERSATION_TYPES);

// Active conversations in memory
const activeConversations = new Map();

// ═══════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════
function getHorseHash(profileId) {
    if (!profileId) return 0;
    let hash = 0;
    for (let i = 0; i < profileId.length; i++) {
        hash = ((hash << 5) - hash) + profileId.charCodeAt(i);
        hash = hash & hash;
    }
    return Math.abs(hash);
}

/**
 * Generate a unique conversation ID
 */
function generateConversationId(horse1Id, horse2Id, postId) {
    return `${horse1Id.slice(0, 8)}_${horse2Id.slice(0, 8)}_${postId.slice(0, 8)}`;
}

// ═══════════════════════════════════════════════════════════════════════════
// CONVERSATION MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Detect conversation type based on post content
 * @param {string} content - Original post content
 * @returns {string} Conversation type key
 */
export function detectConversationType(content) {
    const lower = (content || '').toLowerCase();

    if (lower.match(/win|ship|huge|massive|congrats/)) return 'hype_train';
    if (lower.match(/lost|bad beat|variance|rip|pain/)) return 'sympathy';
    if (lower.match(/range|gto|solver|ev|icm|strategy/)) return 'strategy_chat';
    if (lower.match(/lol|haha|😂|bruh|funny/)) return 'banter';

    // Random between banter and debate for neutral posts
    return Math.random() > 0.5 ? 'banter' : 'debate';
}

/**
 * Start a new conversation between horses
 * @param {Object} initiator - Horse starting the conversation
 * @param {Object} responder - Horse responding
 * @param {Object} post - Original post being discussed
 * @returns {Object} Conversation object
 */
export function startConversation(initiator, responder, post) {
    const convoType = detectConversationType(post.content);
    const convoDef = CONVERSATION_TYPES[convoType];

    const conversation = {
        id: generateConversationId(initiator.profile_id, responder.profile_id, post.id),
        type: convoType,
        postId: post.id,
        participants: [initiator.profile_id, responder.profile_id],
        participantNames: [initiator.alias, responder.alias],
        replyCount: 0,
        maxReplies: convoDef.maxReplies,
        lastReplyAt: Date.now(),
        completed: false
    };

    activeConversations.set(conversation.id, conversation);
    return conversation;
}

/**
 * Get next reply in a conversation
 * @param {string} conversationId - Conversation ID
 * @param {string} replierProfileId - Who is replying
 * @returns {Object|null} Reply data or null if conversation complete
 */
export function getNextReply(conversationId, replierProfileId) {
    const convo = activeConversations.get(conversationId);
    if (!convo || convo.completed) return null;

    const convoDef = CONVERSATION_TYPES[convo.type];
    if (convo.replyCount >= convo.maxReplies) {
        convo.completed = true;
        return null;
    }

    const templates = convoDef.templates[Math.min(convo.replyCount, convoDef.templates.length - 1)];
    const hash = getHorseHash(replierProfileId);
    const reply = templates[hash % templates.length];

    convo.replyCount++;
    convo.lastReplyAt = Date.now();

    if (convo.replyCount >= convo.maxReplies) {
        convo.completed = true;
    }

    return {
        content: reply,
        conversationId,
        replyNumber: convo.replyCount,
        isLast: convo.completed
    };
}

/**
 * Get natural delay for next reply in milliseconds
 * @returns {number} Delay in milliseconds (1-10 minutes)
 */
export function getReplyDelay() {
    return (1 + Math.random() * 9) * 60 * 1000; // 1-10 minutes
}

/**
 * Check if a conversation should continue
 * @param {string} conversationId - Conversation ID
 * @returns {boolean} True if more replies expected
 */
export function shouldContinueConversation(conversationId) {
    const convo = activeConversations.get(conversationId);
    if (!convo) return false;

    // Don't continue if completed or too old (>30 minutes since last reply)
    if (convo.completed) return false;
    if (Date.now() - convo.lastReplyAt > 30 * 60 * 1000) {
        convo.completed = true;
        return false;
    }

    return convo.replyCount < convo.maxReplies;
}

/**
 * Get pending conversations that need follow-up
 * @returns {Array} Conversations needing replies
 */
export function getPendingConversations() {
    const pending = [];

    for (const [id, convo] of activeConversations) {
        if (shouldContinueConversation(id)) {
            pending.push(convo);
        }
    }

    return pending;
}

/**
 * Check if two horses should start a conversation
 * @param {string} horse1Id - First horse profile ID
 * @param {string} horse2Id - Second horse profile ID
 * @param {string} postContent - Content of post
 * @returns {boolean} True if should start conversation
 */
export function shouldStartConversation(horse1Id, horse2Id, postContent) {
    // Base 15% chance
    let chance = 0.15;

    // Boost for hype-worthy content
    if (postContent.match(/win|ship|huge|massive|congrats/i)) {
        chance = 0.35;
    }

    // Lower for mundane content
    if (postContent.length < 10) {
        chance = 0.08;
    }

    return Math.random() < chance;
}

/**
 * Post a reply to Supabase
 * @param {string} postId - Post to reply to
 * @param {string} authorId - Reply author profile ID
 * @param {string} content - Reply content
 */
export async function postReply(postId, authorId, content) {
    try {
        const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

        await supabase
            .from('social_post_comments')
            .insert({
                post_id: postId,
                author_id: authorId,
                content
            });

        return true;
    } catch (error) {
        console.error('Error posting reply:', error);
        return false;
    }
}

export default {
    detectConversationType,
    startConversation,
    getNextReply,
    getReplyDelay,
    shouldContinueConversation,
    getPendingConversations,
    shouldStartConversation,
    postReply,
    CONVERSATION_TYPES
};
