/**
 * 🐴 HORSE PROFILE SERVICE - Profile Updates & Following Behavior
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Manages organic profile updates (bio changes) and following behavior.
 * Makes horses feel like real accounts that evolve over time.
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// ═══════════════════════════════════════════════════════════════════════════
// BIO TEMPLATES BY MOOD/SEASON
// ═══════════════════════════════════════════════════════════════════════════
const BIO_TEMPLATES = {
    default: [
        'poker player 🃏',
        'grinding ♠️',
        'studying the game 📚',
        'cashgame reg',
        'tournament grinder',
        'just here for the content'
    ],
    hot_streak: [
        'running good 📈',
        'heater mode 🔥',
        'cant lose rn',
        'sun running ☀️'
    ],
    downswing: [
        'variance is real',
        'studying through it 📚',
        'process > results',
        'itll turn'
    ],
    wsop: [
        'wsop 2026 🏆',
        'bracelet hunting',
        'vegas grind ♠️',
        'main event or bust'
    ],
    holidays: [
        '🎄',
        'taking a break',
        'family > poker rn',
        'back soon'
    ]
};

// Follow queue in memory
const followQueue = new Map();

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
// PROFILE BIO UPDATES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Check if horse should update their bio today
 * @param {string} profileId - Horse profile UUID
 * @returns {boolean} True if should update (5% daily chance)
 */
export function shouldUpdateBio(profileId) {
    const hash = getHorseHash(profileId);
    const dayOfYear = Math.floor(Date.now() / (1000 * 60 * 60 * 24));

    // Deterministic 5% chance per day
    return (hash + dayOfYear) % 20 === 0;
}

/**
 * Generate a new bio based on mood/season
 * @param {string} profileId - Horse profile UUID
 * @param {string} context - Current context (mood, season, etc.)
 * @returns {string} New bio text
 */
export function generateNewBio(profileId, context = 'default') {
    const templates = BIO_TEMPLATES[context] || BIO_TEMPLATES.default;
    const hash = getHorseHash(profileId);
    const dayOfYear = Math.floor(Date.now() / (1000 * 60 * 60 * 24));

    // Pick deterministically but different from yesterday
    const index = (hash + dayOfYear) % templates.length;
    return templates[index];
}

/**
 * Update horse's bio in database
 * @param {string} profileId - Horse profile UUID
 * @param {string} newBio - New bio text
 */
export async function updateHorseBio(profileId, newBio) {
    try {
        const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

        await supabase
            .from('profiles')
            .update({ bio: newBio })
            .eq('id', profileId);

        console.log(`   📝 Updated bio for ${profileId.slice(0, 8)}...`);
        return true;
    } catch (error) {
        console.error('Error updating bio:', error);
        return false;
    }
}

/**
 * Check and potentially update bio for a horse
 * @param {string} profileId - Horse profile UUID
 * @param {string} moodType - Current mood type
 * @param {string} season - Current season
 */
export async function maybeUpdateBio(profileId, moodType = 'default', season = null) {
    if (!shouldUpdateBio(profileId)) return false;

    // Prioritize season over mood
    let context = 'default';
    if (season && BIO_TEMPLATES[season.toLowerCase()]) {
        context = season.toLowerCase();
    } else if (moodType && BIO_TEMPLATES[moodType]) {
        context = moodType;
    }

    const newBio = generateNewBio(profileId, context);
    return await updateHorseBio(profileId, newBio);
}

// ═══════════════════════════════════════════════════════════════════════════
// FOLLOWING BEHAVIOR
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Queue a follow action for later
 * @param {string} horseProfileId - Horse who will follow
 * @param {string} targetUserId - User to follow
 * @param {number} delayMs - Delay before following (default 1-24 hours)
 */
export function queueFollow(horseProfileId, targetUserId, delayMs = null) {
    if (delayMs === null) {
        // Random delay between 1-24 hours
        delayMs = (1 + Math.random() * 23) * 60 * 60 * 1000;
    }

    const queueKey = `${horseProfileId}_${targetUserId}`;

    // Don't queue duplicates
    if (followQueue.has(queueKey)) return;

    followQueue.set(queueKey, {
        horseProfileId,
        targetUserId,
        executeAt: Date.now() + delayMs,
        queued: Date.now()
    });
}

/**
 * Process pending follow queue
 * @returns {number} Number of follows executed
 */
export async function processFollowQueue() {
    let executed = 0;
    const now = Date.now();

    for (const [key, item] of followQueue) {
        if (item.executeAt <= now) {
            const success = await executeFollow(item.horseProfileId, item.targetUserId);
            if (success) executed++;
            followQueue.delete(key);
        }
    }

    return executed;
}

/**
 * Execute a follow action
 * @param {string} horseProfileId - Horse who is following
 * @param {string} targetUserId - User being followed
 */
async function executeFollow(horseProfileId, targetUserId) {
    try {
        const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

        // Check if already following
        const { data: existing } = await supabase
            .from('follows')
            .select('id')
            .eq('follower_id', horseProfileId)
            .eq('following_id', targetUserId)
            .single();

        if (existing) return false;

        // Create follow
        await supabase
            .from('follows')
            .insert({
                follower_id: horseProfileId,
                following_id: targetUserId
            });

        console.log(`   👤 ${horseProfileId.slice(0, 8)} followed ${targetUserId.slice(0, 8)}`);
        return true;
    } catch (error) {
        console.error('Error executing follow:', error);
        return false;
    }
}

/**
 * Check if horse should follow a user who interacted with them
 * @param {string} horseProfileId - Horse profile
 * @param {string} userId - User who interacted
 * @param {string} interactionType - 'like', 'comment', or 'follow'
 * @returns {boolean} True if should queue a follow
 */
export function shouldFollowBack(horseProfileId, userId, interactionType = 'like') {
    // Base chances by interaction type
    const chances = {
        follow: 0.7,    // 70% follow back followers
        comment: 0.4,   // 40% follow commenters
        like: 0.15      // 15% follow likers
    };

    const chance = chances[interactionType] || 0.1;
    return Math.random() < chance;
}

/**
 * Handle user interaction - potentially queue follow
 * @param {string} horseProfileId - Horse who was interacted with
 * @param {string} userId - User who interacted
 * @param {string} interactionType - Type of interaction
 */
export function handleInteraction(horseProfileId, userId, interactionType) {
    if (shouldFollowBack(horseProfileId, userId, interactionType)) {
        queueFollow(horseProfileId, userId);
    }
}

/**
 * Get queue status
 * @returns {Object} Queue statistics
 */
export function getQueueStatus() {
    const now = Date.now();
    let pending = 0;
    let ready = 0;

    for (const item of followQueue.values()) {
        if (item.executeAt <= now) ready++;
        else pending++;
    }

    return { total: followQueue.size, pending, ready };
}

export default {
    shouldUpdateBio,
    generateNewBio,
    updateHorseBio,
    maybeUpdateBio,
    queueFollow,
    processFollowQueue,
    shouldFollowBack,
    handleInteraction,
    getQueueStatus,
    BIO_TEMPLATES
};
