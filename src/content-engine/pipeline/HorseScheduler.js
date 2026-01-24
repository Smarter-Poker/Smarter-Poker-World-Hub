/**
 * 🐴 HORSE SCHEDULER - Individual Horse Activity Scheduling
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Assigns each horse to one of 4 cron slots based on their profile_id hash.
 * Cron runs at minutes 3, 18, 33, 48 - each horse is assigned to ONE of these.
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 */

// The 4 cron trigger minutes
const CRON_SLOTS = [3, 18, 33, 48];

/**
 * Get a deterministic slot index (0-3) for a horse based on their profile_id
 * This assigns each horse to one of the 4 cron trigger times
 */
export function getHorseSlot(profileId) {
    if (!profileId) return 0;

    // Create hash from profile_id string
    let hash = 0;
    for (let i = 0; i < profileId.length; i++) {
        const char = profileId.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32-bit integer
    }

    // Map to 0-3 range (one of 4 cron slots)
    return Math.abs(hash) % 4;
}

/**
 * Get the actual minute this horse should be active
 */
export function getHorseCronMinute(profileId) {
    const slotIndex = getHorseSlot(profileId);
    return CRON_SLOTS[slotIndex];
}

/**
 * Check if a horse should be active during the current minute
 * Horses are active when the current minute matches their assigned cron slot
 */
export function shouldHorseBeActive(profileId, currentMinute, variance = 2) {
    const assignedMinute = getHorseCronMinute(profileId);

    // Allow ±variance from their assigned minute
    const diff = Math.abs(currentMinute - assignedMinute);
    return diff <= variance || diff >= (60 - variance);
}

/**
 * Get horses that should be active during the current cron run
 * Instead of picking random horses, we select horses whose slot matches current time
 */
export function getActiveHorsesForMinute(horses, currentMinute, variance = 2) {
    return horses.filter(horse =>
        shouldHorseBeActive(horse.profile_id, currentMinute, variance)
    );
}

/**
 * Get a horse's activity probability for a given action type
 * Different horses have different activity rates
 */
export function getHorseActivityRate(profileId, actionType) {
    const hash = getHorseSlot(profileId);

    // Base rates with variation based on horse
    const baseRates = {
        like: 0.4 + (hash % 40) / 100,      // 40-80% likely to like
        comment: 0.2 + (hash % 30) / 100,   // 20-50% likely to comment
        reply: 0.15 + (hash % 25) / 100,    // 15-40% likely to reply
        post: 0.1 + (hash % 20) / 100,      // 10-30% likely to post
        friend: 0.05 + (hash % 15) / 100    // 5-20% likely to friend
    };

    return baseRates[actionType] || 0.3;
}

/**
 * Get horse's preferred activity hours (12-hour windows - horses sleep!)
 * Each horse has a unique 12-hour active window based on their ID
 */
export function getHorseActiveHours(profileId) {
    const hash = getHorseSlot(profileId);

    // All patterns are exactly 12 hours active
    // start = when they wake up, end = when they sleep (exactly 12 hours later)
    const patterns = [
        { start: 6, end: 18 },   // Early bird: 6am-6pm
        { start: 8, end: 20 },   // Morning person: 8am-8pm
        { start: 10, end: 22 },  // Late riser: 10am-10pm
        { start: 12, end: 0 },   // Afternoon/evening: 12pm-12am
        { start: 14, end: 2 },   // Evening person: 2pm-2am
        { start: 16, end: 4 },   // Night owl: 4pm-4am
        { start: 18, end: 6 },   // Night shift: 6pm-6am
        { start: 20, end: 8 },   // Late night: 8pm-8am
        { start: 22, end: 10 },  // Graveyard: 10pm-10am
        { start: 0, end: 12 },   // Midnight player: 12am-12pm
    ];

    return patterns[hash % patterns.length];
}

/**
 * Check if current hour is within horse's active hours
 */
export function isHorseActiveHour(profileId, currentHour) {
    const { start, end } = getHorseActiveHours(profileId);

    if (start <= end) {
        return currentHour >= start && currentHour <= end;
    } else {
        // Wraps around midnight
        return currentHour >= start || currentHour <= end;
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// PER-HORSE WRITING STYLES
// Each horse has a unique personality reflected in their writing
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get a horse's unique writing style based on their profile_id
 */
export function getHorseWritingStyle(profileId) {
    const hash = getHorseSlot(profileId);

    return {
        // Capitalization: none, first_letter, all_caps, normal, random
        capitalization: ['none', 'first_letter', 'all_caps', 'normal', 'random'][hash % 5],
        // Emoji frequency (0-3)
        emojiFrequency: hash % 4,
        // Punctuation: none, normal, enthusiastic, minimal
        punctuation: ['none', 'normal', 'enthusiastic', 'minimal'][hash % 4],
        // Add filler words
        useFillers: hash % 3 === 0,
        // Personality type
        personality: ['chill', 'hype', 'analytical', 'funny', 'supportive', 'sarcastic'][hash % 6]
    };
}

/**
 * Apply a horse's writing style to a comment
 */
export function applyWritingStyle(comment, profileId) {
    const style = getHorseWritingStyle(profileId);
    let result = comment;

    // Apply capitalization
    switch (style.capitalization) {
        case 'none':
            result = result.toLowerCase();
            break;
        case 'first_letter':
            result = result.charAt(0).toUpperCase() + result.slice(1).toLowerCase();
            break;
        case 'all_caps':
            if (Math.random() < 0.3) result = result.toUpperCase();
            break;
        case 'random':
            result = result.split(' ').map(word =>
                Math.random() > 0.7 ? word.toUpperCase() : word.toLowerCase()
            ).join(' ');
            break;
    }

    // Apply punctuation style
    switch (style.punctuation) {
        case 'none':
            result = result.replace(/[.!?]+$/, '');
            break;
        case 'enthusiastic':
            if (!result.endsWith('!') && !result.endsWith('?')) {
                result = result.replace(/[.]+$/, '') + '!';
            }
            break;
        case 'minimal':
            result = result.replace(/[!]+/g, '');
            break;
    }

    // Add emoji for high-frequency horses
    if (style.emojiFrequency >= 2 && !result.match(/[\u{1F300}-\u{1F9FF}]/u)) {
        const emojis = ['🔥', '💯', '👀', '😂', '💀', '🙏', '👑', '🎯', '⚡', '🃏'];
        result = result + ' ' + emojis[Math.floor(Math.random() * emojis.length)];
    }

    // Add fillers for some horses
    if (style.useFillers && Math.random() > 0.6) {
        const fillers = ['honestly ', 'ngl ', 'fr ', 'lowkey ', 'tbh '];
        result = fillers[Math.floor(Math.random() * fillers.length)] + result.toLowerCase();
    }

    return result.trim();
}

export default {
    getHorseSlot,
    shouldHorseBeActive,
    getActiveHorsesForMinute,
    getHorseActivityRate,
    getHorseActiveHours,
    isHorseActiveHour,
    getHorseWritingStyle,
    applyWritingStyle
};
