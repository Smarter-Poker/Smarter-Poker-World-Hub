/**
 * 🐴 HORSE POKER ADVANCED - Deep AI Behaviors
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Advanced poker behaviors: hand history memory, timing tells, tilt cascades,
 * table image awareness, exploits, rivalries, softplay, grudges, leaderboards.
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
// HAND HISTORY MEMORY
// ═══════════════════════════════════════════════════════════════════════════

// In-memory hand history cache (per session)
const handHistoryCache = new Map();

/**
 * Record a significant hand against an opponent
 * @param {string} horseId - Horse profile ID
 * @param {string} opponentId - Opponent profile ID
 * @param {Object} handInfo - Hand details
 */
export function recordHandHistory(horseId, opponentId, handInfo) {
    const key = `${horseId}_${opponentId}`;
    const history = handHistoryCache.get(key) || [];

    history.push({
        ...handInfo,
        timestamp: Date.now()
    });

    // Keep last 20 significant hands
    if (history.length > 20) history.shift();

    handHistoryCache.set(key, history);
}

/**
 * Get hand history against an opponent
 * @param {string} horseId - Horse profile ID
 * @param {string} opponentId - Opponent profile ID
 * @returns {Array} Recent hands
 */
export function getHandHistory(horseId, opponentId) {
    const key = `${horseId}_${opponentId}`;
    return handHistoryCache.get(key) || [];
}

/**
 * Get read on opponent based on history
 * @param {string} horseId - Horse profile ID
 * @param {string} opponentId - Opponent profile ID
 * @returns {Object} Read on opponent
 */
export function getOpponentRead(horseId, opponentId) {
    const history = getHandHistory(horseId, opponentId);
    if (history.length < 3) return null;

    let bluffs = 0, value = 0, folds = 0;

    for (const hand of history) {
        if (hand.wasBluff) bluffs++;
        if (hand.wasValue) value++;
        if (hand.folded) folds++;
    }

    const total = history.length;

    return {
        bluffFrequency: bluffs / total,
        valueFrequency: value / total,
        foldFrequency: folds / total,
        handsObserved: total,
        tendency: bluffs > value ? 'bluffy' : folds > total * 0.5 ? 'weak-tight' : 'balanced'
    };
}

// ═══════════════════════════════════════════════════════════════════════════
// TIMING TELLS
// ═══════════════════════════════════════════════════════════════════════════

const TIMING_PATTERNS = {
    standard: {
        // No tell - consistent timing
        strongHandDelay: [2000, 4000],
        weakHandDelay: [2000, 4000],
        bluffDelay: [2000, 4000],
        hasTell: false
    },
    fast_strong: {
        // Fast = strong (common pattern)
        strongHandDelay: [500, 1500],
        weakHandDelay: [3000, 5000],
        bluffDelay: [2500, 4500],
        hasTell: true,
        tellType: 'fast_strong'
    },
    slow_strong: {
        // Slow = strong (Hollywood)
        strongHandDelay: [4000, 7000],
        weakHandDelay: [1000, 2000],
        bluffDelay: [3000, 5000],
        hasTell: true,
        tellType: 'slow_strong'
    },
    bluff_tank: {
        // Tanks before bluffing
        strongHandDelay: [1500, 3000],
        weakHandDelay: [1500, 3000],
        bluffDelay: [5000, 8000],
        hasTell: true,
        tellType: 'bluff_tank'
    },
    instant_fold: {
        // Insta-folds weak hands
        strongHandDelay: [2000, 3500],
        weakHandDelay: [200, 800],
        bluffDelay: [3000, 5000],
        hasTell: true,
        tellType: 'instant_fold'
    }
};

const TIMING_PATTERN_KEYS = Object.keys(TIMING_PATTERNS);

/**
 * Get a horse's timing pattern
 * @param {string} profileId - Horse profile ID
 * @returns {Object} Timing pattern
 */
export function getTimingPattern(profileId) {
    const hash = getHorseHash(profileId);
    const patternKey = TIMING_PATTERN_KEYS[hash % TIMING_PATTERN_KEYS.length];
    return { key: patternKey, ...TIMING_PATTERNS[patternKey] };
}

/**
 * Get action delay based on hand strength and personality
 * @param {string} profileId - Horse profile ID
 * @param {string} handType - 'strong', 'weak', 'bluff'
 * @returns {number} Delay in milliseconds
 */
export function getActionDelay(profileId, handType) {
    const pattern = getTimingPattern(profileId);

    let range;
    switch (handType) {
        case 'strong': range = pattern.strongHandDelay; break;
        case 'weak': range = pattern.weakHandDelay; break;
        case 'bluff': range = pattern.bluffDelay; break;
        default: range = [2000, 4000];
    }

    return range[0] + Math.random() * (range[1] - range[0]);
}

// ═══════════════════════════════════════════════════════════════════════════
// TILT CASCADES
// ═══════════════════════════════════════════════════════════════════════════

// Tilt state per horse
const tiltState = new Map();

const TILT_STYLE_SHIFTS = {
    nit: 'TAG',           // Nit becomes normally aggressive
    TAG: 'LAG',           // TAG loosens up
    LAG: 'maniac',        // LAG goes full maniac
    calling_station: 'maniac', // Calling station starts spewing
    maniac: 'maniac'      // Maniac stays maniac (can't tilt harder)
};

/**
 * Record a bad beat or big loss
 * @param {string} profileId - Horse profile ID
 * @param {number} bbLost - Big blinds lost
 * @param {boolean} wasBadBeat - Was it a bad beat
 */
export function recordBadBeat(profileId, bbLost, wasBadBeat = false) {
    const current = tiltState.get(profileId) || { level: 0, decayTime: 0 };

    // Increase tilt level
    let tiltIncrease = bbLost * 0.1;
    if (wasBadBeat) tiltIncrease *= 2;

    current.level = Math.min(current.level + tiltIncrease, 10);
    current.decayTime = Date.now() + (15 * 60 * 1000); // Decay after 15 minutes

    tiltState.set(profileId, current);
}

/**
 * Get current tilt level
 * @param {string} profileId - Horse profile ID
 * @returns {number} Tilt level 0-10
 */
export function getTiltLevel(profileId) {
    const current = tiltState.get(profileId);
    if (!current) return 0;

    // Check if tilt has decayed
    if (Date.now() > current.decayTime) {
        current.level = Math.max(0, current.level - 2);
        current.decayTime = Date.now() + (5 * 60 * 1000);
        tiltState.set(profileId, current);
    }

    return current.level;
}

/**
 * Get tilted play style
 * @param {string} profileId - Horse profile ID
 * @param {string} normalStyle - Normal play style key
 * @returns {string} Adjusted play style key
 */
export function getTiltedStyle(profileId, normalStyle) {
    const tiltLevel = getTiltLevel(profileId);

    // Only shift style if tilt is high enough
    if (tiltLevel < 5) return normalStyle;

    return TILT_STYLE_SHIFTS[normalStyle] || normalStyle;
}

/**
 * Get tilt-adjusted stats
 * @param {string} profileId - Horse profile ID
 * @param {Object} normalStats - Normal poker stats
 * @returns {Object} Adjusted stats
 */
export function getTiltedStats(profileId, normalStats) {
    const tiltLevel = getTiltLevel(profileId);
    if (tiltLevel < 3) return normalStats;

    const tiltMultiplier = 1 + (tiltLevel * 0.1); // Up to 2x at max tilt

    return {
        ...normalStats,
        vpip: Math.min(normalStats.vpip * tiltMultiplier, 80),
        pfr: Math.min(normalStats.pfr * tiltMultiplier, 60),
        aggression: normalStats.aggression * tiltMultiplier
    };
}

// ═══════════════════════════════════════════════════════════════════════════
// TABLE IMAGE AWARENESS
// ═══════════════════════════════════════════════════════════════════════════

// Session stats tracking for table image
const sessionStats = new Map();

/**
 * Record a showdown
 * @param {string} profileId - Horse profile ID
 * @param {boolean} hadStrong - Had strong hand
 * @param {boolean} wasBetting - Was betting/raising
 */
export function recordShowdown(profileId, hadStrong, wasBetting) {
    const stats = sessionStats.get(profileId) || { strong: 0, weak: 0, bluffs: 0, valueBets: 0, total: 0 };

    stats.total++;
    if (hadStrong) {
        stats.strong++;
        if (wasBetting) stats.valueBets++;
    } else {
        stats.weak++;
        if (wasBetting) stats.bluffs++;
    }

    sessionStats.set(profileId, stats);
}

/**
 * Get current table image
 * @param {string} profileId - Horse profile ID
 * @returns {Object} Table image assessment
 */
export function getTableImage(profileId) {
    const stats = sessionStats.get(profileId);
    if (!stats || stats.total < 5) {
        return { image: 'unknown', shouldAdjust: false };
    }

    const bluffRatio = stats.bluffs / Math.max(stats.total, 1);
    const strongRatio = stats.strong / Math.max(stats.total, 1);

    if (bluffRatio > 0.4) {
        return { image: 'bluffy', shouldAdjust: true, adjustment: 'tighten_up' };
    }
    if (strongRatio > 0.7) {
        return { image: 'tight', shouldAdjust: true, adjustment: 'add_bluffs' };
    }

    return { image: 'balanced', shouldAdjust: false };
}

/**
 * Get image-adjusted action
 * @param {string} profileId - Horse profile ID
 * @param {string} baseAction - Original action decision
 * @param {number} handStrength - Hand strength 0-1
 * @returns {string} Adjusted action
 */
export function getImageAdjustedAction(profileId, baseAction, handStrength) {
    const image = getTableImage(profileId);
    if (!image.shouldAdjust) return baseAction;

    // If image is too bluffy, reduce bluffs
    if (image.adjustment === 'tighten_up' && baseAction === 'raise' && handStrength < 0.4) {
        return Math.random() < 0.5 ? 'fold' : 'call';
    }

    // If image is too tight, add bluffs
    if (image.adjustment === 'add_bluffs' && baseAction === 'fold' && handStrength > 0.2) {
        return Math.random() < 0.3 ? 'raise' : 'fold';
    }

    return baseAction;
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPLOITATIVE ADJUSTMENTS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Identify opponent leak
 * @param {Object} opponentRead - Read from getOpponentRead
 * @returns {Object|null} Identified leak and counter
 */
export function identifyLeak(opponentRead) {
    if (!opponentRead) return null;

    if (opponentRead.bluffFrequency > 0.4) {
        return {
            leak: 'overbluffs',
            counter: 'call_down_light',
            description: 'Opponent bluffs too much - call down with marginal hands'
        };
    }

    if (opponentRead.foldFrequency > 0.6) {
        return {
            leak: 'overfolds',
            counter: 'bluff_more',
            description: 'Opponent folds too much - increase bluff frequency'
        };
    }

    if (opponentRead.valueFrequency > 0.7) {
        return {
            leak: 'too_value_heavy',
            counter: 'fold_more',
            description: 'Opponent rarely bluffs - fold marginal hands'
        };
    }

    return null;
}

/**
 * Get exploit-adjusted decision
 * @param {string} horseId - Horse profile ID
 * @param {string} opponentId - Opponent profile ID
 * @param {string} baseAction - Original action
 * @param {number} skillLevel - Horse skill level 1-5
 * @returns {Object} Adjusted action with reasoning
 */
export function getExploitAdjustedAction(horseId, opponentId, baseAction, skillLevel) {
    // Only higher skill horses exploit
    if (skillLevel < 3) {
        return { action: baseAction, exploiting: false };
    }

    const read = getOpponentRead(horseId, opponentId);
    const leak = identifyLeak(read);

    if (!leak) {
        return { action: baseAction, exploiting: false };
    }

    const exploitChance = (skillLevel - 2) * 0.25; // 25% at level 3, 75% at level 5
    if (Math.random() > exploitChance) {
        return { action: baseAction, exploiting: false };
    }

    let adjustedAction = baseAction;

    switch (leak.counter) {
        case 'call_down_light':
            if (baseAction === 'fold') adjustedAction = 'call';
            break;
        case 'bluff_more':
            if (baseAction === 'check' || baseAction === 'fold') adjustedAction = 'raise';
            break;
        case 'fold_more':
            if (baseAction === 'call') adjustedAction = 'fold';
            break;
    }

    return { action: adjustedAction, exploiting: true, leak: leak.leak, counter: leak.counter };
}

// ═══════════════════════════════════════════════════════════════════════════
// RIVALRY & SOCIAL DYNAMICS AT TABLES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Check if horses have a rivalry (from social layer)
 * @param {string} horse1Id - First horse
 * @param {string} horse2Id - Second horse
 * @returns {boolean} True if rivals
 */
export function areRivals(horse1Id, horse2Id) {
    const hash1 = getHorseHash(horse1Id);
    const hash2 = getHorseHash(horse2Id);
    const combined = (hash1 + hash2) % 100;

    // 15% of pairs are rivals
    return combined < 15;
}

/**
 * Check if horses are friends (same friend group)
 * @param {string} horse1Id - First horse
 * @param {string} horse2Id - Second horse
 * @returns {boolean} True if friends
 */
export function areFriends(horse1Id, horse2Id) {
    const hash1 = getHorseHash(horse1Id);
    const hash2 = getHorseHash(horse2Id);

    // Same friend group if similar hash bucket
    return (hash1 % 10) === (hash2 % 10);
}

/**
 * Get rivalry-adjusted aggression
 * @param {string} horseId - Acting horse
 * @param {string} opponentId - Opponent
 * @param {number} baseAggression - Base aggression factor
 * @returns {number} Adjusted aggression
 */
export function getRivalryAggression(horseId, opponentId, baseAggression) {
    if (areRivals(horseId, opponentId)) {
        return baseAggression * 1.5; // 50% more aggressive against rivals
    }
    return baseAggression;
}

/**
 * Get softplay modifier for friends
 * @param {string} horseId - Acting horse
 * @param {string} opponentId - Opponent
 * @returns {Object} Softplay modifiers
 */
export function getSoftplayModifier(horseId, opponentId) {
    if (!areFriends(horseId, opponentId)) {
        return { bluffReduction: 1.0, valueReduction: 1.0, isSoftplaying: false };
    }

    return {
        bluffReduction: 0.5,  // 50% fewer bluffs against friends
        valueReduction: 0.85, // Slightly less thin value
        isSoftplaying: true
    };
}

// ═══════════════════════════════════════════════════════════════════════════
// GRUDGE MATCHES
// ═══════════════════════════════════════════════════════════════════════════

// Grudge tracking
const grudges = new Map();

/**
 * Record a big pot loss
 * @param {string} loserId - Losing horse
 * @param {string} winnerId - Winning horse
 * @param {number} potSize - Pot size in BB
 */
export function recordGrudge(loserId, winnerId, potSize) {
    if (potSize < 20) return; // Only big pots create grudges

    const key = `${loserId}_${winnerId}`;
    const current = grudges.get(key) || { intensity: 0, lastPot: 0 };

    current.intensity = Math.min(current.intensity + potSize * 0.05, 5);
    current.lastPot = Date.now();

    grudges.set(key, current);
}

/**
 * Get grudge level against opponent
 * @param {string} horseId - Horse with potential grudge
 * @param {string} opponentId - Opponent
 * @returns {number} Grudge level 0-5
 */
export function getGrudgeLevel(horseId, opponentId) {
    const key = `${horseId}_${opponentId}`;
    const grudge = grudges.get(key);

    if (!grudge) return 0;

    // Grudges decay over 30 minutes
    const ageMs = Date.now() - grudge.lastPot;
    const decayFactor = Math.max(0, 1 - (ageMs / (30 * 60 * 1000)));

    return grudge.intensity * decayFactor;
}

/**
 * Get grudge-adjusted targeting
 * @param {string} horseId - Acting horse
 * @param {Array} opponents - List of opponent IDs
 * @returns {Object} Target preferences
 */
export function getGrudgeTargeting(horseId, opponents) {
    const targeting = {};

    for (const opponentId of opponents) {
        const grudge = getGrudgeLevel(horseId, opponentId);
        targeting[opponentId] = {
            grudgeLevel: grudge,
            targetPriority: grudge > 2 ? 'high' : grudge > 0 ? 'medium' : 'normal',
            aggressionMod: 1 + (grudge * 0.2) // Up to 2x aggression at max grudge
        };
    }

    return targeting;
}

// ═══════════════════════════════════════════════════════════════════════════
// LEADERBOARD IMPACT
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get leaderboard-adjusted strategy
 * @param {string} profileId - Horse profile ID
 * @param {number} leaderboardPosition - Current position (1 = leader)
 * @param {number} totalPlayers - Total players in leaderboard
 * @param {number} pointsToNext - Points needed to move up
 * @returns {Object} Strategy adjustments
 */
export function getLeaderboardStrategy(profileId, leaderboardPosition, totalPlayers, pointsToNext) {
    const percentile = 1 - (leaderboardPosition / totalPlayers);

    // Top 10% - protect lead, play tighter
    if (percentile >= 0.9) {
        return {
            mode: 'protecting_lead',
            vpipMod: 0.8,
            aggressionMod: 0.9,
            riskTolerance: 0.7,
            description: 'Playing tight to protect leaderboard position'
        };
    }

    // Close to moving up - push harder
    if (pointsToNext < 50) {
        return {
            mode: 'pushing_up',
            vpipMod: 1.1,
            aggressionMod: 1.2,
            riskTolerance: 1.3,
            description: 'Playing aggressive to climb leaderboard'
        };
    }

    // Bottom 50% - grind mode
    if (percentile < 0.5) {
        return {
            mode: 'grinding_up',
            vpipMod: 1.0,
            aggressionMod: 1.1,
            riskTolerance: 1.0,
            description: 'Standard grinding to improve position'
        };
    }

    return {
        mode: 'maintenance',
        vpipMod: 1.0,
        aggressionMod: 1.0,
        riskTolerance: 1.0,
        description: 'Maintaining current strategy'
    };
}

// ═══════════════════════════════════════════════════════════════════════════
// SEASONAL GOALS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get horse's monthly goal type
 * @param {string} profileId - Horse profile ID
 * @returns {Object} Monthly goal
 */
export function getMonthlyGoal(profileId) {
    const hash = getHorseHash(profileId);
    const month = new Date().getMonth();
    const goalSeed = (hash + month) % 100;

    if (goalSeed < 30) {
        return {
            type: 'volume',
            target: 1000 + (hash % 4000), // 1000-5000 hands
            description: 'Grinding for volume',
            strategyMod: { vpipMod: 1.1, sessionLengthMod: 1.3 }
        };
    }

    if (goalSeed < 60) {
        return {
            type: 'winrate',
            target: 3 + (hash % 7), // 3-10 bb/100 target
            description: 'Optimizing winrate',
            strategyMod: { vpipMod: 0.9, riskMod: 0.8 }
        };
    }

    if (goalSeed < 80) {
        return {
            type: 'move_up',
            description: 'Taking shots at higher stakes',
            strategyMod: { riskMod: 1.2, sessionLengthMod: 0.8 }
        };
    }

    return {
        type: 'study',
        description: 'Focus on improvement over results',
        strategyMod: { vpipMod: 0.95, experimentMod: 1.5 }
    };
}

/**
 * Get progress toward monthly goal
 * @param {string} profileId - Horse profile ID
 * @param {Object} currentStats - Current month stats
 * @returns {Object} Progress assessment
 */
export function getGoalProgress(profileId, currentStats = {}) {
    const goal = getMonthlyGoal(profileId);
    const dayOfMonth = new Date().getDate();
    const daysInMonth = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate();
    const progressPercent = dayOfMonth / daysInMonth;

    let onTrack = true;
    let urgency = 'normal';

    if (goal.type === 'volume' && currentStats.handsPlayed) {
        const expectedProgress = goal.target * progressPercent;
        onTrack = currentStats.handsPlayed >= expectedProgress * 0.8;
        urgency = onTrack ? 'normal' : currentStats.handsPlayed < expectedProgress * 0.5 ? 'high' : 'medium';
    }

    return {
        goal,
        onTrack,
        urgency,
        daysRemaining: daysInMonth - dayOfMonth,
        // Adjust strategy if behind
        strategyAdjustment: !onTrack && goal.type === 'volume'
            ? { vpipMod: 1.15, sessionLengthMod: 1.5 }
            : {}
    };
}

export default {
    // Hand History
    recordHandHistory,
    getHandHistory,
    getOpponentRead,

    // Timing Tells
    getTimingPattern,
    getActionDelay,
    TIMING_PATTERNS,

    // Tilt
    recordBadBeat,
    getTiltLevel,
    getTiltedStyle,
    getTiltedStats,

    // Table Image
    recordShowdown,
    getTableImage,
    getImageAdjustedAction,

    // Exploits
    identifyLeak,
    getExploitAdjustedAction,

    // Rivalries & Friends
    areRivals,
    areFriends,
    getRivalryAggression,
    getSoftplayModifier,

    // Grudges
    recordGrudge,
    getGrudgeLevel,
    getGrudgeTargeting,

    // Leaderboard
    getLeaderboardStrategy,

    // Seasonal Goals
    getMonthlyGoal,
    getGoalProgress
};
