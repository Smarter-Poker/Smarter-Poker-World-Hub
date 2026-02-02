/**
 * 🐴 HORSE POKER PERSONALITY - Individual AI for Each Horse
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Gives each of the 100 horses a unique poker-playing AI personality.
 * Covers play style, skill level, tendencies, table chat, and adaptation.
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// ═══════════════════════════════════════════════════════════════════════════
// PLAY STYLE ARCHETYPES
// ═══════════════════════════════════════════════════════════════════════════
const PLAY_STYLES = {
    TAG: {
        name: 'Tight-Aggressive',
        description: 'Plays few hands but bets/raises often',
        vpipRange: [15, 22],
        pfrRange: [12, 18],
        threeBetRange: [5, 9],
        cbetRange: [65, 80],
        aggressionFactor: [2.5, 4.0]
    },
    LAG: {
        name: 'Loose-Aggressive',
        description: 'Plays many hands and applies pressure',
        vpipRange: [28, 38],
        pfrRange: [22, 32],
        threeBetRange: [8, 14],
        cbetRange: [70, 85],
        aggressionFactor: [3.0, 5.0]
    },
    nit: {
        name: 'Nit',
        description: 'Only plays premium hands',
        vpipRange: [8, 14],
        pfrRange: [6, 12],
        threeBetRange: [3, 5],
        cbetRange: [75, 90],
        aggressionFactor: [1.5, 2.5]
    },
    calling_station: {
        name: 'Calling Station',
        description: 'Calls too much, rarely folds',
        vpipRange: [35, 50],
        pfrRange: [8, 15],
        threeBetRange: [2, 5],
        cbetRange: [40, 55],
        aggressionFactor: [0.5, 1.2]
    },
    maniac: {
        name: 'Maniac',
        description: 'Extremely aggressive, bets/raises constantly',
        vpipRange: [45, 65],
        pfrRange: [35, 50],
        threeBetRange: [12, 20],
        cbetRange: [80, 95],
        aggressionFactor: [4.0, 7.0]
    }
};

const PLAY_STYLE_KEYS = Object.keys(PLAY_STYLES);

// ═══════════════════════════════════════════════════════════════════════════
// SKILL TIERS
// ═══════════════════════════════════════════════════════════════════════════
const SKILL_TIERS = {
    fish: {
        level: 1,
        name: 'Fish',
        decisionAccuracy: 0.35,
        bluffFrequency: 0.40, // Bluffs too much
        valueFrequency: 0.50, // Misses value
        foldToAggression: 0.25, // Doesn't fold enough
        adaptSpeed: 0
    },
    recreational: {
        level: 2,
        name: 'Recreational',
        decisionAccuracy: 0.50,
        bluffFrequency: 0.30,
        valueFrequency: 0.60,
        foldToAggression: 0.35,
        adaptSpeed: 0.1
    },
    grinder: {
        level: 3,
        name: 'Grinder',
        decisionAccuracy: 0.70,
        bluffFrequency: 0.25,
        valueFrequency: 0.75,
        foldToAggression: 0.45,
        adaptSpeed: 0.3
    },
    reg: {
        level: 4,
        name: 'Regular',
        decisionAccuracy: 0.85,
        bluffFrequency: 0.22,
        valueFrequency: 0.85,
        foldToAggression: 0.50,
        adaptSpeed: 0.5
    },
    crusher: {
        level: 5,
        name: 'Crusher',
        decisionAccuracy: 0.95,
        bluffFrequency: 0.20,
        valueFrequency: 0.92,
        foldToAggression: 0.55,
        adaptSpeed: 0.8
    }
};

const SKILL_TIER_KEYS = Object.keys(SKILL_TIERS);

// ═══════════════════════════════════════════════════════════════════════════
// TABLE CHAT STYLES
// ═══════════════════════════════════════════════════════════════════════════
const CHAT_STYLES = {
    silent: {
        name: 'Silent',
        chatFrequency: 0.02,
        messages: []
    },
    minimal: {
        name: 'Minimal',
        chatFrequency: 0.08,
        messages: ['gg', 'nh', 'ty', 'gl']
    },
    friendly: {
        name: 'Friendly',
        chatFrequency: 0.15,
        messages: ['nice hand!', 'well played', 'good luck everyone', 'gg wp', 'fun table']
    },
    analytical: {
        name: 'Analytical',
        chatFrequency: 0.12,
        messages: ['interesting line', 'std', 'close spot', 'tough river', 'wp']
    },
    trash_talker: {
        name: 'Trash Talker',
        chatFrequency: 0.25,
        messages: ['lol', 'really?', 'ok buddy', 'sure', 'nice call 🙄', 'wow']
    },
    supportive: {
        name: 'Supportive',
        chatFrequency: 0.18,
        messages: ['unlucky', 'variance', 'itll come back', 'good fold', 'tough spot']
    }
};

const CHAT_STYLE_KEYS = Object.keys(CHAT_STYLES);

// ═══════════════════════════════════════════════════════════════════════════
// STAKES PREFERENCES
// ═══════════════════════════════════════════════════════════════════════════
const STAKES_LEVELS = {
    micro: { min: 1, max: 10, name: 'Micro Stakes' },       // $0.01/$0.02 - $0.05/$0.10
    low: { min: 10, max: 50, name: 'Low Stakes' },          // $0.10/$0.25 - $0.25/$0.50
    mid: { min: 50, max: 200, name: 'Mid Stakes' },         // $0.50/$1 - $1/$2
    high: { min: 200, max: 1000, name: 'High Stakes' },     // $2/$5 - $5/$10
    nosebleed: { min: 1000, max: 10000, name: 'Nosebleeds' } // $10/$25+
};

const STAKES_KEYS = Object.keys(STAKES_LEVELS);

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

function lerp(min, max, t) {
    return min + (max - min) * t;
}

// ═══════════════════════════════════════════════════════════════════════════
// CORE PERSONALITY FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get a horse's complete poker personality profile
 * @param {string} profileId - Horse profile UUID
 * @returns {Object} Complete poker personality
 */
export function getHorsePokerProfile(profileId) {
    const hash = getHorseHash(profileId);

    return {
        profileId,
        playStyle: getPlayStyle(profileId),
        skillTier: getSkillTier(profileId),
        stats: getStats(profileId),
        chatStyle: getTableChatStyle(profileId),
        stakesPreference: getStakesPreference(profileId),
        sessionProfile: getSessionProfile(profileId),
        tiltFactor: getTiltFactor(profileId),
        adaptationRate: getAdaptationRate(profileId)
    };
}

/**
 * Get a horse's play style archetype
 * @param {string} profileId - Horse profile UUID
 * @returns {Object} Play style with full details
 */
export function getPlayStyle(profileId) {
    const hash = getHorseHash(profileId);

    // Weighted distribution: 35% TAG, 25% LAG, 15% nit, 15% calling station, 10% maniac
    const roll = hash % 100;
    let styleKey;
    if (roll < 35) styleKey = 'TAG';
    else if (roll < 60) styleKey = 'LAG';
    else if (roll < 75) styleKey = 'nit';
    else if (roll < 90) styleKey = 'calling_station';
    else styleKey = 'maniac';

    return { key: styleKey, ...PLAY_STYLES[styleKey] };
}

/**
 * Get a horse's skill tier
 * @param {string} profileId - Horse profile UUID
 * @returns {Object} Skill tier with full details
 */
export function getSkillTier(profileId) {
    const hash = getHorseHash(profileId);

    // Weighted: 15% fish, 25% rec, 35% grinder, 20% reg, 5% crusher
    const roll = hash % 100;
    let tierKey;
    if (roll < 15) tierKey = 'fish';
    else if (roll < 40) tierKey = 'recreational';
    else if (roll < 75) tierKey = 'grinder';
    else if (roll < 95) tierKey = 'reg';
    else tierKey = 'crusher';

    return { key: tierKey, ...SKILL_TIERS[tierKey] };
}

/**
 * Get a horse's poker stats (VPIP, PFR, etc.)
 * @param {string} profileId - Horse profile UUID
 * @returns {Object} Poker statistics
 */
export function getStats(profileId) {
    const hash = getHorseHash(profileId);
    const style = getPlayStyle(profileId);

    // Use hash to pick specific values within the style's range
    const t = (hash % 1000) / 1000; // 0-1

    return {
        vpip: lerp(style.vpipRange[0], style.vpipRange[1], t),
        pfr: lerp(style.pfrRange[0], style.pfrRange[1], t),
        threeBet: lerp(style.threeBetRange[0], style.threeBetRange[1], t),
        cbet: lerp(style.cbetRange[0], style.cbetRange[1], t),
        aggression: lerp(style.aggressionFactor[0], style.aggressionFactor[1], t),
        wtsd: 25 + (hash % 15), // Went to showdown: 25-40%
        won: 48 + (hash % 8)     // Won at showdown: 48-55%
    };
}

/**
 * Get a horse's table chat style
 * @param {string} profileId - Horse profile UUID
 * @returns {Object} Chat style details
 */
export function getTableChatStyle(profileId) {
    const hash = getHorseHash(profileId);
    const styleKey = CHAT_STYLE_KEYS[hash % CHAT_STYLE_KEYS.length];
    return { key: styleKey, ...CHAT_STYLES[styleKey] };
}

/**
 * Get a horse's stakes preference
 * @param {string} profileId - Horse profile UUID
 * @returns {Object} Stakes preference
 */
export function getStakesPreference(profileId) {
    const hash = getHorseHash(profileId);
    const skillTier = getSkillTier(profileId);

    // Higher skill = higher stakes tendency
    const stakeIndex = Math.min(
        skillTier.level - 1 + (hash % 2),
        STAKES_KEYS.length - 1
    );

    const stakeKey = STAKES_KEYS[stakeIndex];
    return { key: stakeKey, ...STAKES_LEVELS[stakeKey] };
}

/**
 * Get session profile (when they play, how long)
 * @param {string} profileId - Horse profile UUID
 * @returns {Object} Session patterns
 */
export function getSessionProfile(profileId) {
    const hash = getHorseHash(profileId);

    return {
        preferredHours: getPreferredPlayHours(hash),
        avgSessionLength: 30 + (hash % 90), // 30-120 minutes
        tablesPerSession: 1 + (hash % 4),   // 1-4 tables
        daysActivePerWeek: 2 + (hash % 5),  // 2-6 days
        breakFrequency: 0.1 + (hash % 20) / 100 // 10-30% chance of break
    };
}

/**
 * Get preferred play hours based on hash
 */
function getPreferredPlayHours(hash) {
    const patterns = [
        [18, 19, 20, 21, 22, 23],          // Evening (most common)
        [20, 21, 22, 23, 0, 1, 2],         // Late night degen
        [9, 10, 11, 12, 13, 14],           // Daytime grinder
        [6, 7, 8, 17, 18, 19],             // Before/after work
        [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23] // 24/7 degen
    ];
    return patterns[hash % patterns.length];
}

/**
 * Get tilt factor (how likely to tilt after bad beats)
 * @param {string} profileId - Horse profile UUID
 * @returns {number} Tilt factor 0-1 (higher = more tilty)
 */
export function getTiltFactor(profileId) {
    const hash = getHorseHash(profileId);
    const skillTier = getSkillTier(profileId);

    // Lower skill = higher tilt tendency
    const baseTilt = (5 - skillTier.level) * 0.15;
    const variance = (hash % 20) / 100;

    return Math.min(baseTilt + variance, 0.8);
}

/**
 * Get how quickly horse adapts to opponents
 * @param {string} profileId - Horse profile UUID
 * @returns {number} Adaptation rate 0-1
 */
export function getAdaptationRate(profileId) {
    const skillTier = getSkillTier(profileId);
    return skillTier.adaptSpeed;
}

// ═══════════════════════════════════════════════════════════════════════════
// DECISION MAKING
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Make a poker decision based on personality
 * @param {string} profileId - Horse profile UUID
 * @param {Object} gameState - Current game state
 * @returns {Object} Decision with action and sizing
 */
export function makeDecision(profileId, gameState) {
    const profile = getHorsePokerProfile(profileId);
    const { handStrength, potSize, toCall, position, street, opponentActions } = gameState;

    // Base decision on hand strength and personality
    const stats = profile.stats;
    const skill = profile.skillTier;

    // Add noise based on skill (lower skill = more random)
    const noise = (1 - skill.decisionAccuracy) * (Math.random() - 0.5);
    const adjustedStrength = Math.max(0, Math.min(1, handStrength + noise));

    // Determine action thresholds based on play style
    let foldThreshold, callThreshold, raiseThreshold;

    switch (profile.playStyle.key) {
        case 'nit':
            foldThreshold = 0.7;
            callThreshold = 0.85;
            raiseThreshold = 0.92;
            break;
        case 'TAG':
            foldThreshold = 0.5;
            callThreshold = 0.7;
            raiseThreshold = 0.85;
            break;
        case 'LAG':
            foldThreshold = 0.35;
            callThreshold = 0.55;
            raiseThreshold = 0.70;
            break;
        case 'calling_station':
            foldThreshold = 0.15;
            callThreshold = 0.9;  // Almost never raises
            raiseThreshold = 0.95;
            break;
        case 'maniac':
            foldThreshold = 0.2;
            callThreshold = 0.4;
            raiseThreshold = 0.5;
            break;
        default:
            foldThreshold = 0.4;
            callThreshold = 0.65;
            raiseThreshold = 0.8;
    }

    // Determine action
    let action, sizing;

    if (adjustedStrength < foldThreshold) {
        // Consider bluffing based on skill and aggression
        const bluffChance = skill.bluffFrequency * (stats.aggression / 3);
        if (Math.random() < bluffChance) {
            action = 'raise';
            sizing = potSize * (0.5 + Math.random() * 0.5);
        } else {
            action = toCall > 0 ? 'fold' : 'check';
            sizing = 0;
        }
    } else if (adjustedStrength < callThreshold) {
        action = toCall > 0 ? 'call' : 'check';
        sizing = toCall;
    } else if (adjustedStrength < raiseThreshold) {
        // Sometimes just call with medium-strong hands
        if (Math.random() < 0.4) {
            action = toCall > 0 ? 'call' : 'check';
            sizing = toCall;
        } else {
            action = 'raise';
            sizing = potSize * (0.5 + Math.random() * 0.3);
        }
    } else {
        // Strong hand - value bet/raise
        action = 'raise';
        sizing = potSize * (0.6 + Math.random() * 0.6);
    }

    return {
        action,
        sizing: Math.round(sizing * 100) / 100,
        confidence: skill.decisionAccuracy,
        reasoning: `${profile.playStyle.name} ${profile.skillTier.name}`
    };
}

// ═══════════════════════════════════════════════════════════════════════════
// TABLE SELECTION & SESSION LOGIC
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Check if horse should sit at this table
 * @param {string} profileId - Horse profile UUID
 * @param {number} stakes - Table stakes (big blind amount)
 * @param {number} currentPlayers - Number of players at table
 * @returns {Object} Decision and reasoning
 */
export function shouldSitAtTable(profileId, stakes, currentPlayers = 0) {
    const preference = getStakesPreference(profileId);
    const session = getSessionProfile(profileId);
    const hour = new Date().getHours();

    // Check if stakes match preference
    const stakesMatch = stakes >= preference.min && stakes <= preference.max;

    // Check if current hour is preferred
    const hourMatch = session.preferredHours.includes(hour);

    // Prefer tables with 4-8 players
    const playerCountIdeal = currentPlayers >= 4 && currentPlayers <= 8;

    const shouldSit = stakesMatch && hourMatch && (playerCountIdeal || currentPlayers === 0);

    return {
        shouldSit,
        stakesMatch,
        hourMatch,
        playerCountIdeal,
        reason: shouldSit
            ? 'Good fit for stake and time preference'
            : !stakesMatch ? 'Stakes outside comfort zone'
                : !hourMatch ? 'Not preferred playing hours'
                    : 'Table conditions not ideal'
    };
}

/**
 * Check if horse should leave the table
 * @param {string} profileId - Horse profile UUID
 * @param {Object} sessionState - Current session info
 * @returns {Object} Decision and reasoning
 */
export function shouldLeaveTable(profileId, sessionState) {
    const { minutesPlayed, stackChange, handsPlayed } = sessionState;
    const session = getSessionProfile(profileId);
    const tiltFactor = getTiltFactor(profileId);

    // Leave if session exceeds preferred length
    if (minutesPlayed >= session.avgSessionLength) {
        return { shouldLeave: true, reason: 'Session length reached' };
    }

    // Leave if tilting (big loss + high tilt factor)
    if (stackChange < -3 && Math.random() < tiltFactor) {
        return { shouldLeave: true, reason: 'Tilting - taking a break' };
    }

    // Random break
    if (Math.random() < session.breakFrequency / 100) {
        return { shouldLeave: true, reason: 'Taking a break' };
    }

    // Leave if big win and want to lock it up
    if (stackChange > 5 && Math.random() < 0.1) {
        return { shouldLeave: true, reason: 'Locking up a win' };
    }

    return { shouldLeave: false, reason: 'Continuing session' };
}

// ═══════════════════════════════════════════════════════════════════════════
// TABLE CHAT
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get a chat message for a table situation
 * @param {string} profileId - Horse profile UUID
 * @param {string} situation - 'win', 'lose', 'badbeat', 'bigpot', 'sit', 'leave'
 * @returns {string|null} Chat message or null if silent
 */
export function getTableChat(profileId, situation) {
    const chatStyle = getTableChatStyle(profileId);

    // Check if should chat at all
    if (Math.random() > chatStyle.chatFrequency) {
        return null;
    }

    const situationMessages = {
        win: ['gg', 'ty', 'nh (to myself)', ':)'],
        lose: ['nh', 'gg', 'wp'],
        badbeat: ['wow', 'sick', 'variance', 'lol ok'],
        bigpot: ['biggie', 'ship it', 'lets go'],
        sit: ['gl all', 'hi', 'glgl'],
        leave: ['gg all', 'cya', 'gn', 'ty for the game']
    };

    // Combine style messages with situation messages
    const allMessages = [...chatStyle.messages, ...(situationMessages[situation] || [])];

    if (allMessages.length === 0) return null;

    const hash = getHorseHash(profileId);
    return allMessages[(hash + Date.now()) % allMessages.length];
}

export default {
    getHorsePokerProfile,
    getPlayStyle,
    getSkillTier,
    getStats,
    getTableChatStyle,
    getStakesPreference,
    getSessionProfile,
    getTiltFactor,
    getAdaptationRate,
    makeDecision,
    shouldSitAtTable,
    shouldLeaveTable,
    getTableChat,
    PLAY_STYLES,
    SKILL_TIERS,
    CHAT_STYLES,
    STAKES_LEVELS
};
