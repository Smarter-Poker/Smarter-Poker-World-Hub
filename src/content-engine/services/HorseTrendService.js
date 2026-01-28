/**
 * 🐴 HORSE TREND SERVICE - Trend Awareness, Moods & Location Timing
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Makes horses aware of poker calendar events, moods, and timezones.
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 */

// ═══════════════════════════════════════════════════════════════════════════
// POKER CALENDAR - Major events horses react to
// ═══════════════════════════════════════════════════════════════════════════
const POKER_CALENDAR = {
    wsop: { start: { month: 5, day: 28 }, end: { month: 7, day: 17 }, name: 'WSOP' },
    wpt_champ: { start: { month: 12, day: 1 }, end: { month: 12, day: 20 }, name: 'WPT Championship' },
    super_bowl: { start: { month: 2, day: 1 }, end: { month: 2, day: 15 }, name: 'Super Bowl Poker' },
    march_madness: { start: { month: 3, day: 15 }, end: { month: 4, day: 8 }, name: 'March Madness' },
    holidays: { start: { month: 12, day: 20 }, end: { month: 1, day: 2 }, name: 'Holidays' },
    new_year: { start: { month: 1, day: 1 }, end: { month: 1, day: 7 }, name: 'New Year' }
};

// ═══════════════════════════════════════════════════════════════════════════
// MOOD DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════
const MOODS = {
    hot_streak: {
        postFrequencyMod: 1.4,
        emojiMod: 1.5,
        energyLevel: 'high',
        templates: ['running good', 'heater continues', 'cant lose rn', '📈📈'],
        duration: { min: 3, max: 7 }
    },
    grinding: {
        postFrequencyMod: 1.0,
        emojiMod: 1.0,
        energyLevel: 'normal',
        templates: ['the grind', 'session time', 'back at it'],
        duration: { min: 5, max: 10 }
    },
    tilted: {
        postFrequencyMod: 0.6,
        emojiMod: 0.5,
        energyLevel: 'low',
        templates: ['rough one', 'variance', 'need a break'],
        duration: { min: 1, max: 3 }
    },
    chill: {
        postFrequencyMod: 0.8,
        emojiMod: 0.9,
        energyLevel: 'relaxed',
        templates: ['taking it easy', 'light session', 'vibing'],
        duration: { min: 2, max: 5 }
    },
    on_fire: {
        postFrequencyMod: 1.6,
        emojiMod: 2.0,
        energyLevel: 'max',
        templates: ['LETS GO', 'on fire rn 🔥🔥', 'unstoppable'],
        duration: { min: 1, max: 3 }
    }
};

const MOOD_TYPES = Object.keys(MOODS);

// ═══════════════════════════════════════════════════════════════════════════
// LOCATION/TIMEZONE DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════
const LOCATIONS = {
    vegas: { utcOffset: -8, peakHours: [20, 21, 22, 23, 0, 1, 2], name: 'Vegas' },
    la: { utcOffset: -8, peakHours: [18, 19, 20, 21, 22, 23], name: 'LA' },
    east_coast: { utcOffset: -5, peakHours: [19, 20, 21, 22, 23], name: 'East Coast' },
    midwest: { utcOffset: -6, peakHours: [18, 19, 20, 21, 22], name: 'Midwest' },
    international: { utcOffset: 0, peakHours: [12, 13, 14, 15, 16, 17, 18], name: 'International' }
};

const LOCATION_KEYS = Object.keys(LOCATIONS);

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
// TREND AWARENESS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get current active poker events/trends
 * @returns {Array} Array of active trend objects
 */
export function getCurrentTrends() {
    const now = new Date();
    const month = now.getMonth() + 1;
    const day = now.getDate();

    const activeTrends = [];

    for (const [key, event] of Object.entries(POKER_CALENDAR)) {
        const { start, end } = event;

        // Handle year wraparound (e.g., holidays Dec-Jan)
        let isActive = false;
        if (start.month <= end.month) {
            isActive = (month > start.month || (month === start.month && day >= start.day)) &&
                (month < end.month || (month === end.month && day <= end.day));
        } else {
            isActive = (month > start.month || (month === start.month && day >= start.day)) ||
                (month < end.month || (month === end.month && day <= end.day));
        }

        if (isActive) {
            activeTrends.push({ key, ...event });
        }
    }

    return activeTrends;
}

/**
 * Check if horse should post about a current trend
 * @param {string} profileId - Horse profile UUID
 * @param {string} trendKey - Trend identifier
 * @returns {boolean} True if should post about trend
 */
export function shouldPostAboutTrend(profileId, trendKey) {
    const hash = getHorseHash(profileId);
    // 40% base chance, modified by horse hash for variety
    const trendAffinity = (hash % 60) / 100 + 0.2; // 20-80% range
    return Math.random() < trendAffinity;
}

/**
 * Get trend-specific templates for content
 * @param {string} trendKey - Trend identifier
 * @returns {Array} Templates for that trend
 */
export function getTrendTemplates(trendKey) {
    const templates = {
        wsop: ['wsop szn', 'bracelet hunting', 'vegas grind', 'wsop 🏆', 'main event vibes'],
        wpt_champ: ['wpt finals', 'championship time', 'title run'],
        holidays: ['holiday break', 'family time', 'back soon'],
        new_year: ['new year new bankroll', 'fresh start', '2026 szn']
    };
    return templates[trendKey] || ['👀'];
}

// ═══════════════════════════════════════════════════════════════════════════
// HORSE MOODS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get a horse's current mood (deterministic per week)
 * @param {string} profileId - Horse profile UUID
 * @returns {Object} Mood object with type and modifiers
 */
export function getHorseMood(profileId) {
    const hash = getHorseHash(profileId);
    const weekOfYear = Math.floor(Date.now() / (1000 * 60 * 60 * 24 * 7));

    // Combine hash with week for deterministic but varying mood
    const moodSeed = (hash + weekOfYear) % 100;

    // Weighted mood distribution
    let moodType;
    if (moodSeed < 15) moodType = 'on_fire';      // 15%
    else if (moodSeed < 35) moodType = 'hot_streak'; // 20%
    else if (moodSeed < 60) moodType = 'grinding';   // 25%
    else if (moodSeed < 80) moodType = 'chill';      // 20%
    else moodType = 'tilted';                         // 20%

    return {
        type: moodType,
        ...MOODS[moodType]
    };
}

/**
 * Get behavior modifiers based on current mood
 * @param {string} moodType - Mood type string
 * @returns {Object} Modifier values
 */
export function getMoodModifiers(moodType) {
    return MOODS[moodType] || MOODS.grinding;
}

/**
 * Get a mood-appropriate filler/template
 * @param {string} profileId - Horse profile UUID
 * @returns {string} Mood-themed text
 */
export function getMoodTemplate(profileId) {
    const mood = getHorseMood(profileId);
    const templates = mood.templates || [];
    if (templates.length === 0) return '';

    const hash = getHorseHash(profileId);
    return templates[hash % templates.length];
}

// ═══════════════════════════════════════════════════════════════════════════
// LOCATION-BASED TIMING
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get a horse's assigned location/timezone
 * @param {string} profileId - Horse profile UUID
 * @returns {Object} Location object with timezone info
 */
export function getHorseLocation(profileId) {
    const hash = getHorseHash(profileId);
    const locationKey = LOCATION_KEYS[hash % LOCATION_KEYS.length];
    return { key: locationKey, ...LOCATIONS[locationKey] };
}

/**
 * Get a horse's UTC offset
 * @param {string} profileId - Horse profile UUID
 * @returns {number} UTC offset in hours
 */
export function getHorseTimezone(profileId) {
    return getHorseLocation(profileId).utcOffset;
}

/**
 * Check if current time is peak hours for this horse's location
 * @param {string} profileId - Horse profile UUID
 * @returns {boolean} True if in peak hours
 */
export function isHorsePeakTime(profileId) {
    const location = getHorseLocation(profileId);
    const now = new Date();
    const localHour = (now.getUTCHours() + location.utcOffset + 24) % 24;
    return location.peakHours.includes(localHour);
}

/**
 * Get activity modifier based on local time
 * @param {string} profileId - Horse profile UUID
 * @returns {number} Activity multiplier (0.3-1.5)
 */
export function getLocationActivityMod(profileId) {
    if (isHorsePeakTime(profileId)) {
        return 1.5; // 50% more active during peak
    }

    const location = getHorseLocation(profileId);
    const now = new Date();
    const localHour = (now.getUTCHours() + location.utcOffset + 24) % 24;

    // Very low activity 3am-7am local time
    if (localHour >= 3 && localHour < 7) {
        return 0.3;
    }

    return 1.0;
}

// ═══════════════════════════════════════════════════════════════════════════
// SEASONAL CONTENT
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get current season/event name
 * @returns {string|null} Current season or null
 */
export function getCurrentSeason() {
    const trends = getCurrentTrends();
    if (trends.length > 0) {
        return trends[0].name;
    }

    const month = new Date().getMonth() + 1;
    if (month >= 6 && month <= 8) return 'Summer Grind';
    if (month >= 9 && month <= 11) return 'Fall Season';
    if (month === 12 || month <= 2) return 'Winter';
    return 'Spring';
}

/**
 * Get seasonal templates
 * @param {string} season - Season name
 * @returns {Array} Seasonal caption templates
 */
export function getSeasonalTemplates(season) {
    const templates = {
        'WSOP': ['bracelet szn', 'vegas baby', 'wsop grind', 'main event'],
        'Holidays': ['holiday vibes', 'fam time', 'taking a break'],
        'Summer Grind': ['summer sessions', 'pool + poker', 'vacation grind'],
        'Winter': ['cold outside warm bankroll', 'winter grind']
    };
    return templates[season] || [];
}

export default {
    getCurrentTrends,
    shouldPostAboutTrend,
    getTrendTemplates,
    getHorseMood,
    getMoodModifiers,
    getMoodTemplate,
    getHorseLocation,
    getHorseTimezone,
    isHorsePeakTime,
    getLocationActivityMod,
    getCurrentSeason,
    getSeasonalTemplates,
    POKER_CALENDAR,
    MOODS,
    LOCATIONS
};
