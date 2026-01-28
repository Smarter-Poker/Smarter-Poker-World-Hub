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
// 100 UNIQUE WRITING STYLES - Every horse gets a deterministically unique voice
// Based on multiple dimensions that combine to create distinct personalities
// ═══════════════════════════════════════════════════════════════════════════

// Style dimensions with many options for combination
const CAPITALIZATION_STYLES = ['all_lower', 'normal', 'first_cap', 'random_caps', 'all_caps', 'lazy_caps'];
const EMOJI_STYLES = ['none', 'minimal', 'moderate', 'heavy', 'emoji_only', 'trailing'];
const PUNCTUATION_STYLES = ['none', 'minimal', 'normal', 'enthusiastic', 'ellipsis', 'dash_lover'];
const FILLER_SETS = [
    [], // No fillers
    ['honestly', 'ngl'],
    ['fr', 'lowkey'],
    ['tbh', 'imo'],
    ['yo', 'bruh'],
    ['like', 'idk'],
    ['lmao', 'lol'],
    ['bro', 'dude'],
    ['damn', 'sheesh'],
    ['ong', 'no cap']
];
const OPENER_STYLES = ['direct', 'reaction', 'emoji_first', 'filler_first', 'one_word'];
const LINGUISTIC_QUIRKS = [
    'none',
    'double_letters', // "niice", "yooo"  
    'drops_vowels',   // "wht", "tht"
    'adds_periods',   // "this. is. fire."
    'stretches',      // "sooo", "fireee"
    'abbreviates',    // "w/", "bc"
    'uses_numbers',   // "gr8", "2day"
    'spaces_out',     // "w h a t"
    'repeats_end',    // "niceeee"
    'slang_heavy'     // heavy use of slang
];

/**
 * Generate a unique hash value for a horse (0-99 range for 100 distinct styles)
 */
function getHorseStyleHash(profileId) {
    if (!profileId) return 0;
    let hash = 0;
    for (let i = 0; i < profileId.length; i++) {
        const char = profileId.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
    }
    return Math.abs(hash) % 100;
}

/**
 * Get a horse's unique writing style based on their profile_id
 * Creates 100 distinct combinations across multiple dimensions
 */
export function getHorseWritingStyle(profileId) {
    const hash = getHorseStyleHash(profileId);

    // Use different parts of the hash to select from each dimension
    const capStyle = CAPITALIZATION_STYLES[hash % CAPITALIZATION_STYLES.length];
    const emojiStyle = EMOJI_STYLES[(hash * 7) % EMOJI_STYLES.length];
    const punctStyle = PUNCTUATION_STYLES[(hash * 13) % PUNCTUATION_STYLES.length];
    const fillerSet = FILLER_SETS[(hash * 17) % FILLER_SETS.length];
    const openerStyle = OPENER_STYLES[(hash * 23) % OPENER_STYLES.length];
    const quirk = LINGUISTIC_QUIRKS[(hash * 31) % LINGUISTIC_QUIRKS.length];

    // Additional unique traits
    const emojiChoices = [
        ['🔥', '💯', '👀'],
        ['😂', '💀', '🤣'],
        ['🙏', '👑', '⚡'],
        ['🎯', '🃏', '♠️'],
        ['📈', '📉', '💰'],
        ['🤔', '🧐', '👁️'],
        ['😤', '💪', '🏆'],
        ['❤️', '🖤', '💜']
    ][(hash * 41) % 8];

    return {
        capitalization: capStyle,
        emojiStyle: emojiStyle,
        emojiChoices: emojiChoices,
        punctuation: punctStyle,
        fillers: fillerSet,
        openerStyle: openerStyle,
        quirk: quirk,
        // Probability modifiers (0.0 - 1.0)
        fillerProbability: (hash % 50) / 100,  // 0-50% chance
        emojiProbability: ((hash * 3) % 80) / 100,  // 0-80% chance
        doubleEmoji: hash % 5 === 0  // 20% of horses double up emojis
    };
}

/**
 * Apply linguistic quirk to text
 */
function applyQuirk(text, quirk) {
    switch (quirk) {
        case 'double_letters':
            return text.replace(/([aeiou])/gi, (m) => Math.random() > 0.7 ? m + m : m);
        case 'stretches':
            return text.replace(/([aeiousy])(\s|$)/gi, (m, letter, after) =>
                Math.random() > 0.6 ? letter + letter + letter + after : m);
        case 'adds_periods':
            return text.split(' ').join('. ').replace(/\.\s*\./g, '.');
        case 'abbreviates':
            return text.replace(/\bwith\b/gi, 'w/').replace(/\bbecause\b/gi, 'bc');
        case 'repeats_end':
            if (text.length > 3) {
                const lastChar = text[text.length - 1];
                if (/[a-z]/i.test(lastChar)) {
                    return text + lastChar.repeat(2 + Math.floor(Math.random() * 3));
                }
            }
            return text;
        default:
            return text;
    }
}

/**
 * Apply a horse's unique writing style to a comment
 * Sanitizes em-dashes and hyphenated words, then applies style
 */
export function applyWritingStyle(comment, profileId) {
    const style = getHorseWritingStyle(profileId);
    let result = comment;

    // ═══════════════════════════════════════════════════════════════════════
    // SANITIZATION - Remove em-dashes and hyphenated-word patterns
    // ═══════════════════════════════════════════════════════════════════════
    result = result
        .replace(/—/g, ' ')           // Em-dashes to space
        .replace(/–/g, ' ')           // En-dashes to space  
        .replace(/(\w)-(\w)/g, '$1 $2')  // Hyphenated-words to spaces
        .replace(/["'"']/g, '')       // All quote variants
        .replace(/:/g, '')            // Colons
        .replace(/\s+/g, ' ')         // Multiple spaces to single
        .trim();

    // ═══════════════════════════════════════════════════════════════════════
    // CAPITALIZATION
    // ═══════════════════════════════════════════════════════════════════════
    switch (style.capitalization) {
        case 'all_lower':
            result = result.toLowerCase();
            break;
        case 'first_cap':
            result = result.charAt(0).toUpperCase() + result.slice(1).toLowerCase();
            break;
        case 'all_caps':
            result = result.toUpperCase();
            break;
        case 'random_caps':
            result = result.split('').map(c =>
                Math.random() > 0.7 ? c.toUpperCase() : c.toLowerCase()
            ).join('');
            break;
        case 'lazy_caps':
            // Only capitalize if feeling like it (30% chance)
            if (Math.random() > 0.7) {
                result = result.charAt(0).toUpperCase() + result.slice(1).toLowerCase();
            } else {
                result = result.toLowerCase();
            }
            break;
        // 'normal' - leave as is
    }

    // ═══════════════════════════════════════════════════════════════════════
    // PUNCTUATION
    // ═══════════════════════════════════════════════════════════════════════
    switch (style.punctuation) {
        case 'none':
            result = result.replace(/[.!?,]+$/g, '');
            break;
        case 'minimal':
            result = result.replace(/[!]+/g, '').replace(/[.]+$/, '');
            break;
        case 'enthusiastic':
            if (!result.match(/[!?]$/)) {
                result = result.replace(/[.]+$/, '') + (Math.random() > 0.5 ? '!' : '!!');
            }
            break;
        case 'ellipsis':
            if (!result.match(/[.!?]$/)) {
                result = result + '...';
            }
            break;
        case 'dash_lover':
            result = result.replace(/[.!?]+$/, '') + ' -';
            break;
        // 'normal' - leave as is
    }

    // ═══════════════════════════════════════════════════════════════════════
    // FILLERS (prepend or append based on style)
    // ═══════════════════════════════════════════════════════════════════════
    if (style.fillers.length > 0 && Math.random() < style.fillerProbability) {
        const filler = style.fillers[Math.floor(Math.random() * style.fillers.length)];
        if (style.openerStyle === 'filler_first' || Math.random() > 0.5) {
            result = filler + ' ' + result.toLowerCase();
        } else {
            result = result + ' ' + filler;
        }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // EMOJIS
    // ═══════════════════════════════════════════════════════════════════════
    const hasEmoji = result.match(/[\u{1F300}-\u{1F9FF}]/u);
    if (!hasEmoji && style.emojiStyle !== 'none' && Math.random() < style.emojiProbability) {
        const emoji = style.emojiChoices[Math.floor(Math.random() * style.emojiChoices.length)];

        switch (style.emojiStyle) {
            case 'emoji_only':
                if (result.length < 10) result = emoji;
                break;
            case 'trailing':
                result = result + ' ' + emoji;
                if (style.doubleEmoji) result = result + emoji;
                break;
            case 'heavy':
                result = emoji + ' ' + result + ' ' + emoji;
                break;
            default:
                result = result + ' ' + emoji;
        }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // LINGUISTIC QUIRKS
    // ═══════════════════════════════════════════════════════════════════════
    if (style.quirk !== 'none' && Math.random() > 0.4) {
        result = applyQuirk(result, style.quirk);
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
