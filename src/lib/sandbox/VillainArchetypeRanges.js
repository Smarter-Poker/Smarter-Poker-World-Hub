/**
 * VillainArchetypeRanges.js
 * ═══════════════════════════════════════════════════════════════
 * Pre-built preflop opening ranges for each villain archetype.
 * Ranges defined as string notation: "AAs,KKs,QQs,..." or
 * VPIP percentages and labels for display.
 *
 * Usage:
 *   import { getArchetypeRange, ARCHETYPE_CONFIG } from './VillainArchetypeRanges';
 *   const range = getArchetypeRange('tag', 'BTN', 'open');
 */

// ─── Hand category sets ────────────────────────────────────────────────────
const PREMIUM_PAIRS = ['AA', 'KK', 'QQ', 'JJ', 'TT'];
const MID_PAIRS = ['99', '88', '77', '66'];
const SMALL_PAIRS = ['55', '44', '33', '22'];
const BROADWAY_SUITED = ['AKs', 'AQs', 'AJs', 'ATs', 'KQs', 'KJs', 'KTs', 'QJs', 'QTs', 'JTs'];
const BROADWAY_OFF = ['AKo', 'AQo', 'AJo', 'KQo'];
const SUITED_ACES = ['A9s', 'A8s', 'A7s', 'A6s', 'A5s', 'A4s', 'A3s', 'A2s'];
const SUITED_CONNECTORS = ['T9s', '98s', '87s', '76s', '65s', '54s'];
const SUITED_GAPPERS = ['T8s', '97s', '86s', '75s', '64s', '53s', 'J9s'];
const SUITED_BROADWAY_GAPPERS = ['ATs', 'A9s', 'KJs', 'K9s', 'QJs', 'Q9s', 'J8s'];
const BROADWAYS_MEDIUM = ['ATo', 'KJo', 'KTo', 'QJo', 'QTo', 'JTo'];
const MID_SUITED_CONNECTORS = ['T9s', '98s', '87s', '76s', '65s'];
const LOOSE_HANDS = ['54s', '43s', '32s', 'K8s', 'K7s', 'Q8s', 'Q7s', 'J7s', 'T7s'];

// ─── Archetype definitions ─────────────────────────────────────────────────
export const ARCHETYPE_CONFIG = {
    nit: {
        id: 'nit',
        name: 'Nit',
        icon: '🧊',
        color: '#60a5fa',
        vpip: { UTG: 8, MP: 9, CO: 11, BTN: 14, SB: 12, BB: 14 },
        description: 'Plays only premium hands. Fold to most aggression.',
        postflopTip: 'Respect every bet — they only play when they have it.',
        openRanges: {
            UTG: [...PREMIUM_PAIRS, 'AKs', 'AKo', 'AQs'],
            MP: [...PREMIUM_PAIRS, 'AKs', 'AKo', 'AQs', 'AJs', 'KQs'],
            CO: [...PREMIUM_PAIRS, ...BROADWAY_SUITED.slice(0, 6), 'AKo', 'AQo', 'KQo'],
            BTN: [...PREMIUM_PAIRS, ...BROADWAY_SUITED.slice(0, 8), 'AKo', 'AQo', 'AJo', 'KQo'],
            SB: [...PREMIUM_PAIRS, 'AKs', 'AKo', 'AQs', 'AQo', 'AJs', 'KQs', 'KQo'],
            BB: [...PREMIUM_PAIRS, ...BROADWAY_SUITED.slice(0, 6), 'AKo', 'AQo'],
        },
    },

    tag: {
        id: 'tag',
        name: 'TAG',
        icon: '🎯',
        color: '#34d399',
        vpip: { UTG: 14, MP: 16, CO: 22, BTN: 32, SB: 26, BB: 28 },
        description: 'Tight-aggressive. Solid ranges, bets for value and bluff.',
        postflopTip: 'Play your best hands — they balance well. Respect 3-bets.',
        openRanges: {
            UTG: [...PREMIUM_PAIRS, ...MID_PAIRS.slice(0, 2), ...BROADWAY_SUITED, 'AKo', 'AQo', 'AJo'],
            MP: [...PREMIUM_PAIRS, ...MID_PAIRS, ...BROADWAY_SUITED, 'AKo', 'AQo', 'AJo', 'KQo', ...SUITED_ACES.slice(0, 3)],
            CO: [...PREMIUM_PAIRS, ...MID_PAIRS, ...BROADWAY_SUITED, ...BROADWAY_OFF, ...SUITED_ACES.slice(0, 5), ...MID_SUITED_CONNECTORS],
            BTN: [...PREMIUM_PAIRS, ...MID_PAIRS, ...SMALL_PAIRS.slice(0, 2), ...BROADWAY_SUITED, ...BROADWAY_OFF, ...SUITED_ACES, ...SUITED_CONNECTORS, ...BROADWAYS_MEDIUM],
            SB: [...PREMIUM_PAIRS, ...MID_PAIRS, ...BROADWAY_SUITED, ...BROADWAY_OFF, ...SUITED_ACES.slice(0, 5)],
            BB: [...PREMIUM_PAIRS, ...MID_PAIRS, ...BROADWAY_SUITED, ...BROADWAY_OFF, ...SUITED_ACES.slice(0, 5), 'KQo', 'QJo'],
        },
    },

    lag: {
        id: 'lag',
        name: 'LAG',
        icon: '⚡',
        color: '#f59e0b',
        vpip: { UTG: 22, MP: 26, CO: 36, BTN: 48, SB: 42, BB: 45 },
        description: 'Loose-aggressive. Wide ranges, frequent 3-bets and bluffs.',
        postflopTip: 'Tighten up and let them hang themselves. Call wider.',
        openRanges: {
            UTG: [...PREMIUM_PAIRS, ...MID_PAIRS, ...BROADWAY_SUITED, ...BROADWAY_OFF, ...SUITED_ACES, ...MID_SUITED_CONNECTORS],
            MP: [...PREMIUM_PAIRS, ...MID_PAIRS, ...SMALL_PAIRS.slice(0, 2), ...BROADWAY_SUITED, ...BROADWAY_OFF, ...SUITED_ACES, ...SUITED_CONNECTORS, ...BROADWAYS_MEDIUM],
            CO: [...PREMIUM_PAIRS, ...MID_PAIRS, ...SMALL_PAIRS, ...BROADWAY_SUITED, ...BROADWAY_OFF, ...SUITED_ACES, ...SUITED_CONNECTORS, ...SUITED_GAPPERS, ...BROADWAYS_MEDIUM],
            BTN: [...PREMIUM_PAIRS, ...MID_PAIRS, ...SMALL_PAIRS, ...BROADWAY_SUITED, ...BROADWAY_OFF, ...SUITED_ACES, ...SUITED_CONNECTORS, ...SUITED_GAPPERS, ...BROADWAYS_MEDIUM, ...LOOSE_HANDS],
            SB: [...PREMIUM_PAIRS, ...MID_PAIRS, ...SMALL_PAIRS.slice(0, 3), ...BROADWAY_SUITED, ...BROADWAY_OFF, ...SUITED_ACES, ...SUITED_CONNECTORS, ...BROADWAYS_MEDIUM],
            BB: [...PREMIUM_PAIRS, ...MID_PAIRS, ...SMALL_PAIRS, ...BROADWAY_SUITED, ...BROADWAY_OFF, ...SUITED_ACES, ...SUITED_CONNECTORS, ...BROADWAYS_MEDIUM],
        },
    },

    fish: {
        id: 'fish',
        name: 'Fish',
        icon: '🐟',
        color: '#818cf8',
        vpip: { UTG: 40, MP: 42, CO: 48, BTN: 55, SB: 50, BB: 55 },
        description: 'Plays far too many hands. Fit-or-fold postflop.',
        postflopTip: 'Bet your made hands bigger. Bluff only with equity.',
        openRanges: {
            UTG: [...PREMIUM_PAIRS, ...MID_PAIRS, ...SMALL_PAIRS, ...BROADWAY_SUITED, ...BROADWAY_OFF, ...SUITED_ACES, ...SUITED_CONNECTORS, ...BROADWAYS_MEDIUM, 'K8s', 'K7s', 'Q8s', 'J8s'],
            MP: [...PREMIUM_PAIRS, ...MID_PAIRS, ...SMALL_PAIRS, ...BROADWAY_SUITED, ...BROADWAY_OFF, ...SUITED_ACES, ...SUITED_CONNECTORS, ...SUITED_GAPPERS, ...BROADWAYS_MEDIUM, ...LOOSE_HANDS],
            CO: [...PREMIUM_PAIRS, ...MID_PAIRS, ...SMALL_PAIRS, ...BROADWAY_SUITED, ...BROADWAY_OFF, ...SUITED_ACES, ...SUITED_CONNECTORS, ...SUITED_GAPPERS, ...BROADWAYS_MEDIUM, ...LOOSE_HANDS, 'K6s', 'Q6s', 'J6s'],
            BTN: [...PREMIUM_PAIRS, ...MID_PAIRS, ...SMALL_PAIRS, ...BROADWAY_SUITED, ...BROADWAY_OFF, ...SUITED_ACES, ...SUITED_CONNECTORS, ...SUITED_GAPPERS, ...BROADWAYS_MEDIUM, ...LOOSE_HANDS, 'K6s', 'Q6s', 'J6s', 'T6s', '96s', '85s', '74s'],
            SB: [...PREMIUM_PAIRS, ...MID_PAIRS, ...SMALL_PAIRS, ...BROADWAY_SUITED, ...BROADWAY_OFF, ...SUITED_ACES, ...SUITED_CONNECTORS, ...SUITED_GAPPERS, ...BROADWAYS_MEDIUM, ...LOOSE_HANDS],
            BB: [...PREMIUM_PAIRS, ...MID_PAIRS, ...SMALL_PAIRS, ...BROADWAY_SUITED, ...BROADWAY_OFF, ...SUITED_ACES, ...SUITED_CONNECTORS, ...SUITED_GAPPERS, ...BROADWAYS_MEDIUM, ...LOOSE_HANDS],
        },
    },

    calling_station: {
        id: 'calling_station',
        name: 'Calling Station',
        icon: '📞',
        color: '#fb923c',
        vpip: { UTG: 35, MP: 38, CO: 44, BTN: 52, SB: 48, BB: 60 },
        description: 'Calls too wide. Never raises. Never folds to bets.',
        postflopTip: 'Bet thin for value. Abandon all bluffs — they never fold.',
        openRanges: {
            UTG: [...PREMIUM_PAIRS, ...MID_PAIRS, ...BROADWAY_SUITED, ...BROADWAY_OFF, ...SUITED_ACES, ...SUITED_CONNECTORS, 'K9s', 'Q9s', 'J9s'],
            MP: [...PREMIUM_PAIRS, ...MID_PAIRS, ...SMALL_PAIRS.slice(0, 2), ...BROADWAY_SUITED, ...BROADWAY_OFF, ...SUITED_ACES, ...SUITED_CONNECTORS, ...SUITED_GAPPERS, ...BROADWAYS_MEDIUM],
            CO: [...PREMIUM_PAIRS, ...MID_PAIRS, ...SMALL_PAIRS, ...BROADWAY_SUITED, ...BROADWAY_OFF, ...SUITED_ACES, ...SUITED_CONNECTORS, ...SUITED_GAPPERS, ...BROADWAYS_MEDIUM, ...LOOSE_HANDS],
            BTN: [...PREMIUM_PAIRS, ...MID_PAIRS, ...SMALL_PAIRS, ...BROADWAY_SUITED, ...BROADWAY_OFF, ...SUITED_ACES, ...SUITED_CONNECTORS, ...SUITED_GAPPERS, ...BROADWAYS_MEDIUM, ...LOOSE_HANDS, 'K6s', 'Q6s'],
            SB: [...PREMIUM_PAIRS, ...MID_PAIRS, ...SMALL_PAIRS, ...BROADWAY_SUITED, ...BROADWAY_OFF, ...SUITED_ACES, ...SUITED_CONNECTORS, ...BROADWAYS_MEDIUM, ...LOOSE_HANDS],
            BB: [...PREMIUM_PAIRS, ...MID_PAIRS, ...SMALL_PAIRS, ...BROADWAY_SUITED, ...BROADWAY_OFF, ...SUITED_ACES, ...SUITED_CONNECTORS, ...SUITED_GAPPERS, ...BROADWAYS_MEDIUM, ...LOOSE_HANDS],
        },
    },

    maniac: {
        id: 'maniac',
        name: 'Maniac',
        icon: '🔥',
        color: '#f43f5e',
        vpip: { UTG: 55, MP: 58, CO: 65, BTN: 75, SB: 70, BB: 75 },
        description: 'Plays nearly any two cards. Hyper-aggressive bluffer.',
        postflopTip: 'Widen value range and call down lighter. Let them bluff off stacks.',
        openRanges: {
            UTG: [...PREMIUM_PAIRS, ...MID_PAIRS, ...SMALL_PAIRS, ...BROADWAY_SUITED, ...BROADWAY_OFF, ...SUITED_ACES, ...SUITED_CONNECTORS, ...SUITED_GAPPERS, ...BROADWAYS_MEDIUM, ...LOOSE_HANDS, 'K6s', 'Q6s', 'J6s', 'T6s', '96s'],
            MP: [...PREMIUM_PAIRS, ...MID_PAIRS, ...SMALL_PAIRS, ...BROADWAY_SUITED, ...BROADWAY_OFF, ...SUITED_ACES, ...SUITED_CONNECTORS, ...SUITED_GAPPERS, ...BROADWAYS_MEDIUM, ...LOOSE_HANDS, 'K6s', 'Q6s', 'J6s', 'T6s', '96s', '85s', '74s'],
            CO: [...PREMIUM_PAIRS, ...MID_PAIRS, ...SMALL_PAIRS, ...BROADWAY_SUITED, ...BROADWAY_OFF, ...SUITED_ACES, ...SUITED_CONNECTORS, ...SUITED_GAPPERS, ...BROADWAYS_MEDIUM, ...LOOSE_HANDS, 'K6s', 'K5s', 'Q6s', 'Q5s', 'J6s', 'T6s', '96s', '85s', '74s', '63s'],
            BTN: [...PREMIUM_PAIRS, ...MID_PAIRS, ...SMALL_PAIRS, ...BROADWAY_SUITED, ...BROADWAY_OFF, ...SUITED_ACES, ...SUITED_CONNECTORS, ...SUITED_GAPPERS, ...BROADWAYS_MEDIUM, ...LOOSE_HANDS, 'K6s', 'K5s', 'K4s', 'Q6s', 'Q5s', 'J6s', 'J5s', 'T6s', 'T5s', '96s', '95s', '85s', '84s', '74s', '73s', '63s', '62s', '52s'],
            SB: [...PREMIUM_PAIRS, ...MID_PAIRS, ...SMALL_PAIRS, ...BROADWAY_SUITED, ...BROADWAY_OFF, ...SUITED_ACES, ...SUITED_CONNECTORS, ...SUITED_GAPPERS, ...BROADWAYS_MEDIUM, ...LOOSE_HANDS, 'K6s', 'Q6s', 'J6s', 'T6s', '96s', '85s', '74s'],
            BB: [...PREMIUM_PAIRS, ...MID_PAIRS, ...SMALL_PAIRS, ...BROADWAY_SUITED, ...BROADWAY_OFF, ...SUITED_ACES, ...SUITED_CONNECTORS, ...SUITED_GAPPERS, ...BROADWAYS_MEDIUM, ...LOOSE_HANDS, 'K6s', 'K5s', 'Q6s', 'Q5s', 'J6s', 'T6s', '96s', '85s', '74s', '63s'],
        },
    },

    gto_neutral: {
        id: 'gto_neutral',
        name: 'GTO Neutral',
        icon: '⚖️',
        color: '#a78bfa',
        vpip: { UTG: 14, MP: 18, CO: 26, BTN: 40, SB: 35, BB: 38 },
        description: 'Solves for balanced GTO frequencies. Unexploitable.',
        postflopTip: 'Stay balanced yourself. There is no specific exploit edge.',
        openRanges: {
            UTG: [...PREMIUM_PAIRS, ...MID_PAIRS.slice(0, 2), ...BROADWAY_SUITED, 'AKo', 'AQo', 'AJo'],
            MP: [...PREMIUM_PAIRS, ...MID_PAIRS, ...BROADWAY_SUITED, ...BROADWAY_OFF, ...SUITED_ACES.slice(0, 4), 'KQo'],
            CO: [...PREMIUM_PAIRS, ...MID_PAIRS, ...SMALL_PAIRS.slice(0, 2), ...BROADWAY_SUITED, ...BROADWAY_OFF, ...SUITED_ACES, ...MID_SUITED_CONNECTORS, ...BROADWAYS_MEDIUM],
            BTN: [...PREMIUM_PAIRS, ...MID_PAIRS, ...SMALL_PAIRS, ...BROADWAY_SUITED, ...BROADWAY_OFF, ...SUITED_ACES, ...SUITED_CONNECTORS, ...SUITED_GAPPERS, ...BROADWAYS_MEDIUM, ...SUITED_BROADWAY_GAPPERS],
            SB: [...PREMIUM_PAIRS, ...MID_PAIRS, ...SMALL_PAIRS.slice(0, 2), ...BROADWAY_SUITED, ...BROADWAY_OFF, ...SUITED_ACES.slice(0, 5), ...MID_SUITED_CONNECTORS, ...BROADWAYS_MEDIUM],
            BB: [...PREMIUM_PAIRS, ...MID_PAIRS, ...SMALL_PAIRS, ...BROADWAY_SUITED, ...BROADWAY_OFF, ...SUITED_ACES, ...SUITED_CONNECTORS, ...BROADWAYS_MEDIUM],
        },
    },
};

/**
 * Get the opening range for a given archetype and position.
 * Returns a deduplicated array of hand strings.
 */
export function getArchetypeRange(archetypeId, position = 'BTN', action = 'open') {
    const config = ARCHETYPE_CONFIG[archetypeId];
    if (!config) return [];
    const rangeArr = config.openRanges?.[position] || [];
    // Deduplicate
    return [...new Set(rangeArr)];
}

/**
 * Get VPIP % for a given archetype and position.
 */
export function getArchetypeVPIP(archetypeId, position = 'BTN') {
    const config = ARCHETYPE_CONFIG[archetypeId];
    if (!config) return null;
    return config.vpip?.[position] ?? null;
}

/**
 * Get a compact range string for passing to the analyze API.
 * Returns something like: "AA,KK,QQ,AKs,AKo,..."
 */
export function getArchetypeRangeString(archetypeId, position = 'BTN') {
    const range = getArchetypeRange(archetypeId, position);
    return range.join(',');
}

/**
 * Get archetype display metadata.
 */
export function getArchetypeInfo(archetypeId) {
    return ARCHETYPE_CONFIG[archetypeId] || null;
}
