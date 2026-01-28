/**
 * 🐴 HORSE SOCIAL INTELLIGENCE - Emotional & Social Dynamics
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Advanced social behaviors: mood contagion, self-references, opinion memory,
 * clout chasing, and friend tagging.
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

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

// ═══════════════════════════════════════════════════════════════════════════
// MOOD CONTAGION - Absorb feed energy
// ═══════════════════════════════════════════════════════════════════════════

const MOOD_INDICATORS = {
    negative: ['lost', 'rip', 'pain', 'variance', 'bust', 'bad', 'rough', 'cooler', '😤', '💀'],
    positive: ['win', 'ship', 'huge', 'lets go', 'lfg', 'fire', 'congrats', '🔥', '🏆', '💰'],
    neutral: ['interesting', 'hmm', 'update', 'news', 'check']
};

/**
 * Analyze recent feed posts to detect overall mood
 * @param {Array} recentPosts - Array of recent post content strings
 * @returns {Object} Mood analysis with dominant mood and intensity
 */
export function analyzeFeedMood(recentPosts = []) {
    if (!recentPosts || recentPosts.length === 0) {
        return { mood: 'neutral', intensity: 0.5, negativeCount: 0, positiveCount: 0 };
    }

    let negativeCount = 0;
    let positiveCount = 0;

    for (const post of recentPosts) {
        const lower = (post || '').toLowerCase();

        for (const indicator of MOOD_INDICATORS.negative) {
            if (lower.includes(indicator)) {
                negativeCount++;
                break;
            }
        }

        for (const indicator of MOOD_INDICATORS.positive) {
            if (lower.includes(indicator)) {
                positiveCount++;
                break;
            }
        }
    }

    const total = recentPosts.length;
    const negativeRatio = negativeCount / total;
    const positiveRatio = positiveCount / total;

    let mood = 'neutral';
    let intensity = 0.5;

    if (negativeRatio > 0.5) {
        mood = 'sympathetic';
        intensity = 0.5 + (negativeRatio * 0.5);
    } else if (positiveRatio > 0.5) {
        mood = 'hyped';
        intensity = 0.5 + (positiveRatio * 0.5);
    }

    return { mood, intensity, negativeCount, positiveCount };
}

/**
 * Get mood-contagion adjusted response style
 * @param {Object} feedMood - Result from analyzeFeedMood
 * @returns {Object} Style adjustments
 */
export function getMoodContagionStyle(feedMood) {
    if (feedMood.mood === 'sympathetic') {
        return {
            emojiMod: 0.7,
            energyMod: 0.6,
            preferredResponses: ['rough', 'hang in there', 'variance', '🙏', 'gg next'],
            tone: 'supportive'
        };
    }

    if (feedMood.mood === 'hyped') {
        return {
            emojiMod: 1.5,
            energyMod: 1.4,
            preferredResponses: ['LETS GO', '🔥🔥', 'huge', 'love to see it', 'W'],
            tone: 'energetic'
        };
    }

    return {
        emojiMod: 1.0,
        energyMod: 1.0,
        preferredResponses: ['interesting', '👀', 'hmm', 'nice'],
        tone: 'neutral'
    };
}

// ═══════════════════════════════════════════════════════════════════════════
// CALLBACK REFERENCES - Reference own past posts
// ═══════════════════════════════════════════════════════════════════════════

const CALLBACK_TEMPLATES = {
    prediction: ['called it 👀', 'told ya', 'saw this coming', 'said this last week'],
    continuation: ['still on this', 'update on earlier', 'following up'],
    reflection: ['been thinking about this since', 'remember when i said', 'revisiting this']
};

/**
 * Check if horse should reference a past post
 * @param {string} profileId - Horse profile ID
 * @param {string} currentTopic - Current post topic
 * @param {Array} pastPosts - Horse's recent posts
 * @returns {Object|null} Callback reference or null
 */
export function getCallbackReference(profileId, currentTopic, pastPosts = []) {
    if (!pastPosts || pastPosts.length < 3) return null;

    // 15% chance to make a callback
    if (Math.random() > 0.15) return null;

    // Find matching past post on same topic
    const matchingPost = pastPosts.find(post => {
        const lower = (post.content || '').toLowerCase();
        return lower.includes(currentTopic.toLowerCase());
    });

    if (!matchingPost) return null;

    const hash = getHorseHash(profileId);
    const templateType = ['prediction', 'continuation', 'reflection'][hash % 3];
    const templates = CALLBACK_TEMPLATES[templateType];

    return {
        type: templateType,
        phrase: templates[hash % templates.length],
        referencedPost: matchingPost
    };
}

/**
 * Generate a self-referencing intro
 * @param {string} profileId - Horse profile ID
 * @returns {string} Self-reference phrase
 */
export function getSelfReferencePhrase(profileId) {
    const hash = getHorseHash(profileId);
    const phrases = [
        'like i said before',
        'still stand by this',
        'thinking about my post from earlier',
        'following up on yesterday',
        'update:'
    ];
    return phrases[hash % phrases.length];
}

// ═══════════════════════════════════════════════════════════════════════════
// OPINION MEMORY - Stay consistent with past stances
// ═══════════════════════════════════════════════════════════════════════════

const OPINION_TOPICS = {
    gto_vs_exploitative: {
        pro: ['gto is the way', 'solver approved', 'gto > reads'],
        anti: ['reads > math', 'exploitative ftw', 'feel the table']
    },
    online_vs_live: {
        pro: ['online all day', 'volume > everything', 'rake is lower online'],
        anti: ['live poker best poker', 'cant beat live reads', 'online is rigged lol']
    },
    tournaments_vs_cash: {
        pro: ['tourney life', 'bracelet chasing', 'icm warrior'],
        anti: ['cash is king', 'no variance in cash', 'hourly > glory']
    },
    studying: {
        pro: ['study grind', 'solver work', 'always improving'],
        anti: ['natural talent', 'just play more', 'experience > study']
    }
};

/**
 * Get a horse's consistent opinion on a topic
 * @param {string} profileId - Horse profile ID
 * @param {string} topic - Opinion topic key
 * @returns {Object} Opinion stance and phrases
 */
export function getHorseOpinion(profileId, topic) {
    if (!OPINION_TOPICS[topic]) return null;

    const hash = getHorseHash(profileId);
    const isPro = hash % 2 === 0;

    const phrases = isPro
        ? OPINION_TOPICS[topic].pro
        : OPINION_TOPICS[topic].anti;

    return {
        topic,
        stance: isPro ? 'pro' : 'anti',
        phrases,
        preferredPhrase: phrases[hash % phrases.length]
    };
}

/**
 * Check if content relates to an opinion topic
 * @param {string} content - Post content
 * @returns {string|null} Detected opinion topic or null
 */
export function detectOpinionTopic(content) {
    const lower = (content || '').toLowerCase();

    if (lower.match(/gto|solver|exploitative|reads vs math/)) return 'gto_vs_exploitative';
    if (lower.match(/online|live poker|in person/)) return 'online_vs_live';
    if (lower.match(/tournament|cash game|mtt|bracelet/)) return 'tournaments_vs_cash';
    if (lower.match(/study|review|improve|learn/)) return 'studying';

    return null;
}

// ═══════════════════════════════════════════════════════════════════════════
// CLOUT CHASING - Small accounts engage with big accounts
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Check if horse should clout chase (engage with bigger account)
 * @param {number} horseFollowers - Horse's follower count
 * @param {number} targetFollowers - Target's follower count
 * @returns {Object} Clout chase decision and modifiers
 */
export function shouldCloutChase(horseFollowers = 0, targetFollowers = 0) {
    // Only clout chase if target has significantly more followers
    if (targetFollowers <= horseFollowers * 1.5) {
        return { shouldChase: false, reason: 'similar_size' };
    }

    // Base 25% chance, increases with follower gap
    const followerRatio = targetFollowers / Math.max(horseFollowers, 1);
    const chaseChance = Math.min(0.25 + (followerRatio * 0.05), 0.6);

    const shouldChase = Math.random() < chaseChance;

    return {
        shouldChase,
        reason: shouldChase ? 'clout_opportunity' : 'passed',
        followerRatio,
        engagementMod: shouldChase ? 1.5 : 1.0
    };
}

/**
 * Get clout-chasing style response (more agreeable/supportive)
 * @param {string} profileId - Horse profile ID
 * @returns {string} Clout-appropriate response
 */
export function getCloutChaseResponse(profileId) {
    const hash = getHorseHash(profileId);
    const responses = [
        'big facts',
        'this right here',
        '💯',
        'underrated take',
        'exactly this',
        'W take',
        'goat behavior'
    ];
    return responses[hash % responses.length];
}

// ═══════════════════════════════════════════════════════════════════════════
// TAG FRIENDS - @ mention friend group members
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Check if horse should tag a friend on this content
 * @param {string} profileId - Horse profile ID
 * @param {string} content - Post content
 * @returns {boolean} True if should tag (20% chance for relevant content)
 */
export function shouldTagFriend(profileId, content) {
    // More likely to tag for exciting content
    const lower = (content || '').toLowerCase();
    const isExciting = lower.match(/huge|win|ship|crazy|wild|need to see|check this/);

    const tagChance = isExciting ? 0.25 : 0.08;
    return Math.random() < tagChance;
}

/**
 * Get a friend to tag from same friend group
 * @param {string} horseProfileId - Horse doing the tagging
 * @param {Array} friendGroupMembers - Array of {profile_id, alias} in same group
 * @returns {Object|null} Friend to tag or null
 */
export function selectFriendToTag(horseProfileId, friendGroupMembers = []) {
    if (!friendGroupMembers || friendGroupMembers.length === 0) return null;

    // Filter out self
    const others = friendGroupMembers.filter(f => f.profile_id !== horseProfileId);
    if (others.length === 0) return null;

    const hash = getHorseHash(horseProfileId);
    return others[hash % others.length];
}

/**
 * Generate tag message
 * @param {string} alias - Friend's alias to tag
 * @param {string} content - Content context
 * @returns {string} Tag message
 */
export function generateTagMessage(alias, content) {
    const lower = (content || '').toLowerCase();

    let prefix;
    if (lower.match(/win|ship|huge/)) {
        prefix = ['you seeing this', 'look at this', 'W alert'][Math.floor(Math.random() * 3)];
    } else if (lower.match(/bad|lost|rough/)) {
        prefix = ['pain', 'rip', 'oof'][Math.floor(Math.random() * 3)];
    } else {
        prefix = ['thoughts', '👀', 'this'][Math.floor(Math.random() * 3)];
    }

    return `@${alias} ${prefix}`;
}

/**
 * Get friends from database for tagging
 * @param {string} horseProfileId - Horse profile ID
 * @param {string} friendGroup - Friend group key
 * @returns {Promise<Array>} Friends in same group
 */
export async function getFriendsForTagging(horseProfileId, friendGroup) {
    try {
        const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

        const { data: horses } = await supabase
            .from('content_authors')
            .select('profile_id, alias')
            .eq('is_active', true)
            .not('profile_id', 'is', null)
            .limit(20);

        if (!horses) return [];

        // This would need the friend group logic from HorseRelationships
        // For now return all horses except self
        return horses.filter(h => h.profile_id !== horseProfileId);
    } catch (error) {
        console.error('Error fetching friends:', error);
        return [];
    }
}

export default {
    // Mood Contagion
    analyzeFeedMood,
    getMoodContagionStyle,
    MOOD_INDICATORS,

    // Callback References
    getCallbackReference,
    getSelfReferencePhrase,
    CALLBACK_TEMPLATES,

    // Opinion Memory
    getHorseOpinion,
    detectOpinionTopic,
    OPINION_TOPICS,

    // Clout Chasing
    shouldCloutChase,
    getCloutChaseResponse,

    // Tag Friends
    shouldTagFriend,
    selectFriendToTag,
    generateTagMessage,
    getFriendsForTagging
};
