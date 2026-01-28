/**
 * 🐴 HORSE BEHAVIOR SERVICE - Advanced Behavioral Patterns
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Deep behavioral patterns: rivalries, inside jokes, sleep schedules,
 * typing patterns, content fatigue, and superstitions.
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// ═══════════════════════════════════════════════════════════════════════════
// RIVALRY SYSTEM
// ═══════════════════════════════════════════════════════════════════════════
const RIVALRY_TYPES = {
    friendly: {
        chance: 0.7,
        templates: ['👀', 'sure buddy', 'if you say so', 'lol ok', 'debatable'],
        intensity: 1
    },
    competitive: {
        chance: 0.2,
        templates: ['cap', 'nah', 'doubt', 'hmm', '🤔'],
        intensity: 2
    },
    heated: {
        chance: 0.1,
        templates: ['wrong', 'bad take', 'respectfully disagree', 'uh no'],
        intensity: 3
    }
};

// ═══════════════════════════════════════════════════════════════════════════
// INSIDE JOKES - Per friend group
// ═══════════════════════════════════════════════════════════════════════════
const INSIDE_JOKES = {
    high_rollers: ['the nosebleeds call', 'big game energy', 'high roller problems'],
    grinders: ['volume > everything', 'rakeback warriors', 'the grind never stops'],
    rec_players: ['just for fun', 'gamble gamble', 'recreational right'],
    study_group: ['solver says', 'gto approved', 'EV+'],
    degen_crew: ['one more bullet', 'sleep is for the weak', 'im good for it'],
    old_school: ['back in my day', 'reads > math', 'soul read'],
    young_guns: ['shipped it', 'future wsop champ', 'next up'],
    content_creators: ['like and subscribe', 'content is content', 'for the vlog'],
    tournament_regs: ['icm torture', 'another day 2', 'reg battle'],
    cash_game_pros: ['deep stacked vibes', 'rake is real', 'exploitative line']
};

// ═══════════════════════════════════════════════════════════════════════════
// SLEEP SCHEDULES
// ═══════════════════════════════════════════════════════════════════════════
const SLEEP_PATTERNS = {
    early_bird: { sleepStart: 22, sleepEnd: 6, name: 'Early Bird' },
    normal: { sleepStart: 0, sleepEnd: 8, name: 'Normal' },
    night_owl: { sleepStart: 4, sleepEnd: 12, name: 'Night Owl' },
    degen: { sleepStart: 6, sleepEnd: 14, name: 'Degen' },
    irregular: { sleepStart: 3, sleepEnd: 10, name: 'Irregular' }
};

const SLEEP_PATTERN_KEYS = Object.keys(SLEEP_PATTERNS);

// ═══════════════════════════════════════════════════════════════════════════
// SUPERSTITIONS
// ═══════════════════════════════════════════════════════════════════════════
const SUPERSTITIONS = {
    no_friday_tweets: {
        check: () => new Date().getDay() === 5,
        name: 'Never posts on Fridays'
    },
    no_session_tweets: {
        check: (hour) => hour >= 18 && hour <= 23,
        name: 'Quiet during peak session hours'
    },
    lucky_hours: {
        check: (hour) => hour === 11 || hour === 22,
        name: 'Only posts at lucky hours',
        invert: true // Posts MORE at these times
    },
    morning_only: {
        check: (hour) => hour >= 6 && hour <= 12,
        name: 'Morning poster only',
        invert: true
    }
};

const SUPERSTITION_KEYS = Object.keys(SUPERSTITIONS);

// ═══════════════════════════════════════════════════════════════════════════
// TYPING PATTERNS
// ═══════════════════════════════════════════════════════════════════════════
const TYPING_PATTERNS = {
    single_poster: {
        doubleTextChance: 0.05,
        avgDelay: 0,
        description: 'Always single posts'
    },
    double_texter: {
        doubleTextChance: 0.35,
        avgDelay: 30000, // 30 seconds between
        description: 'Frequently adds follow-up'
    },
    stream_of_consciousness: {
        doubleTextChance: 0.5,
        avgDelay: 10000, // 10 seconds
        description: 'Often multi-posts rapidly'
    },
    deliberate: {
        doubleTextChance: 0.15,
        avgDelay: 60000, // 1 minute
        description: 'Occasional thoughtful follow-up'
    }
};

const TYPING_PATTERN_KEYS = Object.keys(TYPING_PATTERNS);

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
// RIVALRY FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Check if two horses have a rivalry
 * @param {string} horse1Id - First horse profile ID
 * @param {string} horse2Id - Second horse profile ID
 * @returns {Object|null} Rivalry info or null
 */
export function checkRivalry(horse1Id, horse2Id) {
    const hash1 = getHorseHash(horse1Id);
    const hash2 = getHorseHash(horse2Id);
    const combined = (hash1 + hash2) % 100;

    // 15% of horse pairs have rivalries
    if (combined > 15) return null;

    // Determine rivalry type
    const typeRoll = combined % 10;
    let rivalryType;
    if (typeRoll < 7) rivalryType = 'friendly';
    else if (typeRoll < 9) rivalryType = 'competitive';
    else rivalryType = 'heated';

    return {
        type: rivalryType,
        ...RIVALRY_TYPES[rivalryType]
    };
}

/**
 * Get a rivalry-flavored reply
 * @param {string} horse1Id - Replying horse
 * @param {string} horse2Id - Original poster
 * @returns {string|null} Rivalry reply or null
 */
export function getRivalryReply(horse1Id, horse2Id) {
    const rivalry = checkRivalry(horse1Id, horse2Id);
    if (!rivalry) return null;

    // 30% chance to use rivalry reply when rivalry exists
    if (Math.random() > 0.3) return null;

    const hash = getHorseHash(horse1Id);
    return rivalry.templates[hash % rivalry.templates.length];
}

// ═══════════════════════════════════════════════════════════════════════════
// INSIDE JOKES FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get an inside joke for a friend group
 * @param {string} friendGroup - Friend group key
 * @param {string} profileId - Horse profile ID (for variety)
 * @returns {string} Inside joke phrase
 */
export function getInsideJoke(friendGroup, profileId) {
    const jokes = INSIDE_JOKES[friendGroup] || INSIDE_JOKES.grinders;
    const hash = getHorseHash(profileId);
    return jokes[hash % jokes.length];
}

/**
 * Check if horse should use an inside joke
 * @param {string} profileId - Horse profile ID
 * @returns {boolean} True if should use joke (10% chance)
 */
export function shouldUseInsideJoke(profileId) {
    return Math.random() < 0.10;
}

// ═══════════════════════════════════════════════════════════════════════════
// SLEEP SCHEDULE FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get a horse's sleep pattern
 * @param {string} profileId - Horse profile ID
 * @returns {Object} Sleep pattern object
 */
export function getSleepPattern(profileId) {
    const hash = getHorseHash(profileId);
    const patternKey = SLEEP_PATTERN_KEYS[hash % SLEEP_PATTERN_KEYS.length];
    return { key: patternKey, ...SLEEP_PATTERNS[patternKey] };
}

/**
 * Check if horse is currently "asleep"
 * @param {string} profileId - Horse profile ID
 * @param {number} hour - Current hour (0-23)
 * @returns {boolean} True if horse is sleeping
 */
export function isHorseSleeping(profileId, hour = null) {
    if (hour === null) hour = new Date().getHours();

    const pattern = getSleepPattern(profileId);
    const { sleepStart, sleepEnd } = pattern;

    // Handle overnight sleep (e.g., 22-6)
    if (sleepStart > sleepEnd) {
        return hour >= sleepStart || hour < sleepEnd;
    }
    return hour >= sleepStart && hour < sleepEnd;
}

/**
 * Get activity modifier based on sleep schedule
 * @param {string} profileId - Horse profile ID
 * @returns {number} Activity multiplier (0 if sleeping, 1 if awake)
 */
export function getSleepActivityMod(profileId) {
    return isHorseSleeping(profileId) ? 0 : 1;
}

// ═══════════════════════════════════════════════════════════════════════════
// TYPING PATTERN FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get a horse's typing pattern
 * @param {string} profileId - Horse profile ID
 * @returns {Object} Typing pattern object
 */
export function getTypingPattern(profileId) {
    const hash = getHorseHash(profileId);
    const patternKey = TYPING_PATTERN_KEYS[hash % TYPING_PATTERN_KEYS.length];
    return { key: patternKey, ...TYPING_PATTERNS[patternKey] };
}

/**
 * Check if horse should send a follow-up message
 * @param {string} profileId - Horse profile ID
 * @returns {Object} { shouldDouble: boolean, delayMs: number }
 */
export function shouldDoubleText(profileId) {
    const pattern = getTypingPattern(profileId);
    const shouldDouble = Math.random() < pattern.doubleTextChance;

    return {
        shouldDouble,
        delayMs: shouldDouble ? pattern.avgDelay + (Math.random() * 10000) : 0
    };
}

// ═══════════════════════════════════════════════════════════════════════════
// SUPERSTITION FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get a horse's superstition
 * @param {string} profileId - Horse profile ID
 * @returns {Object|null} Superstition (30% of horses have one)
 */
export function getSuperstition(profileId) {
    const hash = getHorseHash(profileId);

    // 30% of horses have superstitions
    if (hash % 100 > 30) return null;

    const superstitionKey = SUPERSTITION_KEYS[hash % SUPERSTITION_KEYS.length];
    return { key: superstitionKey, ...SUPERSTITIONS[superstitionKey] };
}

/**
 * Check if superstition prevents posting right now
 * @param {string} profileId - Horse profile ID
 * @returns {boolean} True if superstition blocks posting
 */
export function isBlockedBySuperstition(profileId) {
    const superstition = getSuperstition(profileId);
    if (!superstition) return false;

    const hour = new Date().getHours();
    const isTriggered = superstition.check(hour);

    // Inverted superstitions mean post MORE at these times, not less
    if (superstition.invert) {
        return !isTriggered;
    }

    return isTriggered;
}

// ═══════════════════════════════════════════════════════════════════════════
// CONTENT FATIGUE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Check if horse has content fatigue for a topic
 * @param {string} profileId - Horse profile ID
 * @param {string} topic - Content topic
 * @param {Array} recentTopics - Array of recent post topics
 * @param {number} threshold - Max consecutive posts on same topic (default 4)
 * @returns {boolean} True if should pivot to different topic
 */
export function hasContentFatigue(profileId, topic, recentTopics = [], threshold = 4) {
    if (!recentTopics || recentTopics.length < threshold) return false;

    // Count consecutive posts on same topic
    let consecutiveCount = 0;
    for (let i = recentTopics.length - 1; i >= 0; i--) {
        if (recentTopics[i] === topic) {
            consecutiveCount++;
        } else {
            break;
        }
    }

    return consecutiveCount >= threshold;
}

/**
 * Get alternative topic when fatigued
 * @param {string} currentTopic - Topic to avoid
 * @returns {string} Alternative topic suggestion
 */
export function getAlternativeTopic(currentTopic) {
    const topics = ['tournament', 'cash_game', 'strategy', 'lifestyle', 'clip', 'general'];
    const available = topics.filter(t => t !== currentTopic);
    return available[Math.floor(Math.random() * available.length)];
}

// ═══════════════════════════════════════════════════════════════════════════
// FOLLOWER-AWARE POSTING
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get polish level based on follower count
 * @param {number} followerCount - Number of followers
 * @returns {Object} Polish modifiers
 */
export function getFollowerPolish(followerCount = 0) {
    if (followerCount >= 1000) {
        return {
            typoReduction: 0.5, // Half as many typos
            slangReduction: 0.7, // Slightly less slang
            emojiMod: 0.8,
            level: 'influencer'
        };
    }
    if (followerCount >= 500) {
        return {
            typoReduction: 0.7,
            slangReduction: 0.9,
            emojiMod: 0.9,
            level: 'established'
        };
    }
    if (followerCount >= 100) {
        return {
            typoReduction: 0.9,
            slangReduction: 1.0,
            emojiMod: 1.0,
            level: 'growing'
        };
    }
    return {
        typoReduction: 1.0,
        slangReduction: 1.0,
        emojiMod: 1.0,
        level: 'new'
    };
}

// ═══════════════════════════════════════════════════════════════════════════
// TIME-AWARE ENGAGEMENT
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get engagement modifier based on post age
 * @param {Date|string} postCreatedAt - When post was created
 * @returns {number} Engagement probability modifier
 */
export function getPostAgeEngagementMod(postCreatedAt) {
    const ageMs = Date.now() - new Date(postCreatedAt).getTime();
    const ageMinutes = ageMs / (1000 * 60);

    if (ageMinutes < 15) return 2.0;   // 2x for very fresh
    if (ageMinutes < 30) return 1.5;   // 1.5x for fresh
    if (ageMinutes < 60) return 1.0;   // Normal
    if (ageMinutes < 180) return 0.5;  // Half for older
    return 0.2;                         // Very low for stale
}

/**
 * Check if post is worth engaging with based on freshness
 * @param {Date|string} postCreatedAt - When post was created
 * @param {number} baseChance - Base engagement chance
 * @returns {boolean} True if should engage
 */
export function shouldEngageWithPost(postCreatedAt, baseChance = 0.2) {
    const mod = getPostAgeEngagementMod(postCreatedAt);
    return Math.random() < (baseChance * mod);
}

// ═══════════════════════════════════════════════════════════════════════════
// ANNIVERSARY POSTS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Check if horse has an anniversary today
 * @param {string} profileId - Horse profile ID
 * @param {Date|string} accountCreatedAt - Account creation date
 * @returns {Object|null} Anniversary info or null
 */
export function checkAnniversary(profileId, accountCreatedAt) {
    if (!accountCreatedAt) return null;

    const created = new Date(accountCreatedAt);
    const now = new Date();

    // Same month and day?
    if (created.getMonth() !== now.getMonth()) return null;
    if (created.getDate() !== now.getDate()) return null;

    const years = now.getFullYear() - created.getFullYear();
    if (years < 1) return null;

    return {
        years,
        template: years === 1
            ? '1 year on here 🎉'
            : `${years} years on this app 🎂`
    };
}

/**
 * Check for milestone follower counts
 * @param {number} followerCount - Current follower count
 * @returns {Object|null} Milestone info or null
 */
export function checkFollowerMilestone(followerCount) {
    const milestones = [100, 500, 1000, 2500, 5000, 10000];

    for (const milestone of milestones) {
        // Within 5 of milestone (recently hit it)
        if (followerCount >= milestone && followerCount < milestone + 5) {
            return {
                milestone,
                template: milestone >= 1000
                    ? `${milestone / 1000}k followers 🙏`
                    : `${milestone} followers, wild`
            };
        }
    }

    return null;
}

export default {
    // Rivalry
    checkRivalry,
    getRivalryReply,
    RIVALRY_TYPES,

    // Inside Jokes
    getInsideJoke,
    shouldUseInsideJoke,
    INSIDE_JOKES,

    // Sleep
    getSleepPattern,
    isHorseSleeping,
    getSleepActivityMod,
    SLEEP_PATTERNS,

    // Typing
    getTypingPattern,
    shouldDoubleText,
    TYPING_PATTERNS,

    // Superstitions
    getSuperstition,
    isBlockedBySuperstition,
    SUPERSTITIONS,

    // Content Fatigue
    hasContentFatigue,
    getAlternativeTopic,

    // Follower-Aware
    getFollowerPolish,

    // Time-Aware
    getPostAgeEngagementMod,
    shouldEngageWithPost,

    // Milestones
    checkAnniversary,
    checkFollowerMilestone
};
