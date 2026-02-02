/**
 * 🐴 HORSE STORY SERVICE - Multi-Post Narratives & Story Arcs
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Creates continuity in horse posts through story arcs that span multiple days.
 * Horses go through heaters, downswings, tournament runs, and study grinds.
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// ═══════════════════════════════════════════════════════════════════════════
// STORY ARC DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════
const STORY_ARCS = {
    heater: {
        name: 'Hot Streak',
        duration: { min: 3, max: 7 },
        phases: [
            { day: 1, templates: ['session went well', 'nice start', 'feeling it'] },
            { day: 2, templates: ['still running good', 'heater continues', 'back to back'] },
            { day: 3, templates: ['cant lose rn', '3 days straight', 'on fire 🔥'] },
            { day: 4, templates: ['this run is crazy', 'best week ever', 'unstoppable'] },
            { day: 5, templates: ['still going', 'when does it end', 'im scared lol'] }
        ],
        emojiSet: ['🔥', '📈', '💰', '🏆', '💪']
    },
    downswing: {
        name: 'Downswing',
        duration: { min: 2, max: 5 },
        phases: [
            { day: 1, templates: ['rough session', 'not my day', 'variance'] },
            { day: 2, templates: ['still running bad', 'another one', 'pain'] },
            { day: 3, templates: ['when does it end', 'studying tho', 'focusing on process'] },
            { day: 4, templates: ['light at the end', 'better today', 'back to normal maybe'] }
        ],
        emojiSet: ['😤', '📉', '🎰', '💀']
    },
    tournament_run: {
        name: 'Tournament Run',
        duration: { min: 2, max: 4 },
        phases: [
            { day: 1, templates: ['tourney time', 'firing a bullet', 'lets go'] },
            { day: 2, templates: ['still alive', 'made day 2', 'chip and a chair'] },
            { day: 3, templates: ['deep run', 'final table bubble', 'sweating'] },
            { day: 4, templates: ['shipped it 🏆', 'so close', 'gg'] }
        ],
        emojiSet: ['🏆', '♠️', '🃏', '👑']
    },
    study_grind: {
        name: 'Study Grind',
        duration: { min: 3, max: 6 },
        phases: [
            { day: 1, templates: ['time to study', 'solver work', 'reviewing hands'] },
            { day: 2, templates: ['range work', 'found some leaks', 'always learning'] },
            { day: 3, templates: ['making progress', 'theory gets clearer', 'leveling up'] },
            { day: 4, templates: ['back to the tables', 'applied what i learned', 'confidence'] }
        ],
        emojiSet: ['📚', '📊', '🧠', '💡']
    },
    vacation: {
        name: 'Vacation',
        duration: { min: 2, max: 4 },
        phases: [
            { day: 1, templates: ['taking a break', 'vacation mode', 'brb'] },
            { day: 2, templates: ['relaxing', 'needed this', 'recharging'] },
            { day: 3, templates: ['back soon', 'missing the grind', 'refreshed'] }
        ],
        emojiSet: ['🏖️', '✈️', '🌴', '😎']
    }
};

const ARC_TYPES = Object.keys(STORY_ARCS);

// In-memory arc cache (per function instance)
const activeArcs = new Map();

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
// STORY ARC MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Check if a horse currently has an active story arc (deterministic)
 * @param {string} profileId - Horse profile UUID
 * @returns {Object|null} Active arc info or null
 */
export function getActiveArc(profileId) {
    const hash = getHorseHash(profileId);
    const dayOfYear = Math.floor(Date.now() / (1000 * 60 * 60 * 24));

    // Determine arc cycle - horses have arcs ~20% of the time
    const arcCycle = Math.floor(dayOfYear / 7); // Weekly cycles
    const shouldHaveArc = (hash + arcCycle) % 5 === 0; // 20% chance

    if (!shouldHaveArc) return null;

    // Determine which arc type
    const arcIndex = (hash + arcCycle) % ARC_TYPES.length;
    const arcType = ARC_TYPES[arcIndex];
    const arc = STORY_ARCS[arcType];

    // Determine duration
    const duration = arc.duration.min + ((hash + arcCycle) % (arc.duration.max - arc.duration.min + 1));

    // Determine current day in arc
    const arcStartDay = dayOfYear - (dayOfYear % 7) + (hash % 3); // Starts within first 3 days of week
    const currentArcDay = Math.min(dayOfYear - arcStartDay + 1, duration);

    if (currentArcDay < 1 || currentArcDay > duration) return null;

    return {
        type: arcType,
        name: arc.name,
        day: currentArcDay,
        duration,
        emojiSet: arc.emojiSet
    };
}

/**
 * Generate a post that fits the current story arc
 * @param {string} profileId - Horse profile UUID
 * @returns {Object|null} Arc post data or null if no active arc
 */
export function generateArcPost(profileId) {
    const arc = getActiveArc(profileId);
    if (!arc) return null;

    const arcDef = STORY_ARCS[arc.type];
    const phase = arcDef.phases[Math.min(arc.day - 1, arcDef.phases.length - 1)];

    const hash = getHorseHash(profileId);
    const template = phase.templates[hash % phase.templates.length];
    const emoji = arcDef.emojiSet[hash % arcDef.emojiSet.length];

    return {
        template,
        emoji,
        arcType: arc.type,
        arcName: arc.name,
        arcDay: arc.day,
        arcDuration: arc.duration
    };
}

/**
 * Check if horse should reference their current arc in a post
 * @param {string} profileId - Horse profile UUID
 * @returns {boolean} True if should include arc reference
 */
export function shouldReferenceArc(profileId) {
    const arc = getActiveArc(profileId);
    if (!arc) return false;

    // 40% chance to reference arc when one is active
    return Math.random() < 0.4;
}

/**
 * Get arc-themed modifier for a regular post
 * @param {string} profileId - Horse profile UUID
 * @returns {Object|null} Modifiers to apply to regular post
 */
export function getArcModifiers(profileId) {
    const arc = getActiveArc(profileId);
    if (!arc) return null;

    const arcDef = STORY_ARCS[arc.type];

    return {
        emojiBoost: arc.type === 'heater' || arc.type === 'tournament_run' ? 1.5 : 0.8,
        energyLevel: arc.type === 'downswing' || arc.type === 'vacation' ? 'low' : 'high',
        preferredEmoji: arcDef.emojiSet[0]
    };
}

/**
 * Get a continuation phrase that references ongoing arc
 * @param {string} profileId - Horse profile UUID
 * @returns {string} Continuation phrase or empty string
 */
export function getArcContinuationPhrase(profileId) {
    const arc = getActiveArc(profileId);
    if (!arc) return '';

    const phrases = {
        heater: ['still running good', 'day ' + arc.day + ' of heater', 'the run continues'],
        downswing: ['day ' + arc.day + ' of pain', 'variance continues', 'still grinding thru it'],
        tournament_run: ['day ' + arc.day, 'deep in this one', 'still alive'],
        study_grind: ['day ' + arc.day + ' of study', 'putting in work', 'theory grind'],
        vacation: ['still on break', 'vacation mode', 'recharging']
    };

    const options = phrases[arc.type] || [];
    const hash = getHorseHash(profileId);
    return options[hash % options.length] || '';
}

export default {
    getActiveArc,
    generateArcPost,
    shouldReferenceArc,
    getArcModifiers,
    getArcContinuationPhrase,
    STORY_ARCS,
    ARC_TYPES
};
