/**
 * VillainArchetypeRanges.js
 * ═══════════════════════════════════════════════════════════════
 * Pre-built preflop opening ranges for each villain archetype.
 * Ranges defined as string notation: "AAs,KKs,QQs,..." or
 * VPIP percentages and labels for display.
 *
 * Usage:
 *   import { getArchetypeRange, ARCHETYPE_CONFIG } from './VillainArchetypeRanges';
 *   const range = getArchetypeRange('tag', 'BTN', 'open');   // 'open' | '3bet' | 'call'
 *
 * Contract: the archetype id domain is exactly the keys of ARCHETYPE_CONFIG
 * (nit | tag | lag | fish | calling_station | maniac | gto_neutral). Legacy ids
 * from older saved sessions/bookmarks are accepted as read-only aliases.
 *
 * `icon` holds a lucide-react icon NAME (no emoji in source per the repo's
 * build-safety rules) — a consuming UI must map the name to a component before
 * rendering it. Never interpolate `icon` directly into JSX text (it would print
 * the literal string), and never place it inside an <option>, which cannot host
 * a React element.
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
// Offsuit junk — the bulk of a loose player's VPIP lives here (12 combos each),
// which is why fish/station/maniac ranges built only from suited hands could
// never reach the VPIP numbers their labels advertise.
const WEAK_OFFSUIT_ACES = ['A9o', 'A8o', 'A7o', 'A6o', 'A5o', 'A4o', 'A3o', 'A2o'];
const WEAK_OFFSUIT_BROADWAY = ['K9o', 'K8o', 'Q9o', 'Q8o', 'J9o', 'J8o', 'T9o', 'T8o'];
const OFFSUIT_JUNK = ['K7o', 'K6o', 'K5o', 'Q7o', 'Q6o', 'J7o', 'T7o', '98o', '97o', '87o', '86o', '76o', '65o', '54o'];

// ─── Archetype definitions ─────────────────────────────────────────────────
// NOTE: each `vpip` entry mirrors the combo-weighted percentage of that
// position's openRange. getArchetypeVPIP() recomputes it from the range at
// call time, so the badge can never drift from the range the analyze API is
// actually given — if you widen a range, the displayed VPIP follows.
export const ARCHETYPE_CONFIG = {
    nit: {
        id: 'nit',
        name: 'Nit',
        icon: 'Snowflake',
        color: '#60a5fa',
        vpip: { UTG: 4, MP: 4, CO: 7, BTN: 8, SB: 6, BB: 6 },
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
        icon: 'Target',
        color: '#34d399',
        vpip: { UTG: 9, MP: 12, CO: 14, BTN: 21, SB: 12, BB: 13 },
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
        icon: 'Zap',
        color: '#f59e0b',
        vpip: { UTG: 15, MP: 21, CO: 24, BTN: 27, SB: 22, BB: 22 },
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
        icon: 'Fish',
        color: '#818cf8',
        vpip: { UTG: 31, MP: 34, CO: 42, BTN: 51, SB: 41, BB: 48 },
        description: 'Plays far too many hands. Fit-or-fold postflop.',
        postflopTip: 'Bet your made hands bigger. Bluff only with equity.',
        openRanges: {
            UTG: [...PREMIUM_PAIRS, ...MID_PAIRS, ...SMALL_PAIRS, ...BROADWAY_SUITED, ...BROADWAY_OFF, ...SUITED_ACES, ...SUITED_CONNECTORS, ...BROADWAYS_MEDIUM, ...WEAK_OFFSUIT_ACES, 'K8s', 'K7s', 'Q8s', 'J8s'],
            MP: [...PREMIUM_PAIRS, ...MID_PAIRS, ...SMALL_PAIRS, ...BROADWAY_SUITED, ...BROADWAY_OFF, ...SUITED_ACES, ...SUITED_CONNECTORS, ...SUITED_GAPPERS, ...BROADWAYS_MEDIUM, ...LOOSE_HANDS, ...WEAK_OFFSUIT_ACES],
            CO: [...PREMIUM_PAIRS, ...MID_PAIRS, ...SMALL_PAIRS, ...BROADWAY_SUITED, ...BROADWAY_OFF, ...SUITED_ACES, ...SUITED_CONNECTORS, ...SUITED_GAPPERS, ...BROADWAYS_MEDIUM, ...LOOSE_HANDS, ...WEAK_OFFSUIT_ACES, ...WEAK_OFFSUIT_BROADWAY, 'K6s', 'Q6s', 'J6s'],
            BTN: [...PREMIUM_PAIRS, ...MID_PAIRS, ...SMALL_PAIRS, ...BROADWAY_SUITED, ...BROADWAY_OFF, ...SUITED_ACES, ...SUITED_CONNECTORS, ...SUITED_GAPPERS, ...BROADWAYS_MEDIUM, ...LOOSE_HANDS, ...WEAK_OFFSUIT_ACES, ...WEAK_OFFSUIT_BROADWAY, ...OFFSUIT_JUNK.slice(0, 8), 'K6s', 'Q6s', 'J6s', 'T6s', '96s', '85s', '74s'],
            SB: [...PREMIUM_PAIRS, ...MID_PAIRS, ...SMALL_PAIRS, ...BROADWAY_SUITED, ...BROADWAY_OFF, ...SUITED_ACES, ...SUITED_CONNECTORS, ...SUITED_GAPPERS, ...BROADWAYS_MEDIUM, ...LOOSE_HANDS, ...WEAK_OFFSUIT_ACES, ...WEAK_OFFSUIT_BROADWAY],
            BB: [...PREMIUM_PAIRS, ...MID_PAIRS, ...SMALL_PAIRS, ...BROADWAY_SUITED, ...BROADWAY_OFF, ...SUITED_ACES, ...SUITED_CONNECTORS, ...SUITED_GAPPERS, ...BROADWAYS_MEDIUM, ...LOOSE_HANDS, ...WEAK_OFFSUIT_ACES, ...WEAK_OFFSUIT_BROADWAY, ...OFFSUIT_JUNK.slice(0, 8)],
        },
    },

    calling_station: {
        id: 'calling_station',
        name: 'Calling Station',
        icon: 'Phone',
        color: '#fb923c',
        vpip: { UTG: 19, MP: 29, CO: 38, BTN: 47, SB: 39, BB: 54 },
        description: 'Calls too wide. Never raises. Never folds to bets.',
        postflopTip: 'Bet thin for value. Abandon all bluffs — they never fold.',
        openRanges: {
            UTG: [...PREMIUM_PAIRS, ...MID_PAIRS, ...BROADWAY_SUITED, ...BROADWAY_OFF, ...SUITED_ACES, ...SUITED_CONNECTORS, ...WEAK_OFFSUIT_ACES.slice(0, 4), 'K9s', 'Q9s', 'J9s'],
            MP: [...PREMIUM_PAIRS, ...MID_PAIRS, ...SMALL_PAIRS.slice(0, 2), ...BROADWAY_SUITED, ...BROADWAY_OFF, ...SUITED_ACES, ...SUITED_CONNECTORS, ...SUITED_GAPPERS, ...BROADWAYS_MEDIUM, ...WEAK_OFFSUIT_ACES.slice(0, 6)],
            CO: [...PREMIUM_PAIRS, ...MID_PAIRS, ...SMALL_PAIRS, ...BROADWAY_SUITED, ...BROADWAY_OFF, ...SUITED_ACES, ...SUITED_CONNECTORS, ...SUITED_GAPPERS, ...BROADWAYS_MEDIUM, ...LOOSE_HANDS, ...WEAK_OFFSUIT_ACES, ...WEAK_OFFSUIT_BROADWAY.slice(0, 4)],
            BTN: [...PREMIUM_PAIRS, ...MID_PAIRS, ...SMALL_PAIRS, ...BROADWAY_SUITED, ...BROADWAY_OFF, ...SUITED_ACES, ...SUITED_CONNECTORS, ...SUITED_GAPPERS, ...BROADWAYS_MEDIUM, ...LOOSE_HANDS, ...WEAK_OFFSUIT_ACES, ...WEAK_OFFSUIT_BROADWAY, ...OFFSUIT_JUNK.slice(0, 6), 'K6s', 'Q6s'],
            SB: [...PREMIUM_PAIRS, ...MID_PAIRS, ...SMALL_PAIRS, ...BROADWAY_SUITED, ...BROADWAY_OFF, ...SUITED_ACES, ...SUITED_CONNECTORS, ...BROADWAYS_MEDIUM, ...LOOSE_HANDS, ...WEAK_OFFSUIT_ACES, ...WEAK_OFFSUIT_BROADWAY],
            BB: [...PREMIUM_PAIRS, ...MID_PAIRS, ...SMALL_PAIRS, ...BROADWAY_SUITED, ...BROADWAY_OFF, ...SUITED_ACES, ...SUITED_CONNECTORS, ...SUITED_GAPPERS, ...BROADWAYS_MEDIUM, ...LOOSE_HANDS, ...WEAK_OFFSUIT_ACES, ...WEAK_OFFSUIT_BROADWAY, ...OFFSUIT_JUNK],
        },
    },

    maniac: {
        id: 'maniac',
        name: 'Maniac',
        icon: 'Flame',
        color: '#f43f5e',
        vpip: { UTG: 39, MP: 43, CO: 51, BTN: 59, SB: 52, BB: 57 },
        description: 'Plays nearly any two cards. Hyper-aggressive bluffer.',
        postflopTip: 'Widen value range and call down lighter. Let them bluff off stacks.',
        openRanges: {
            UTG: [...PREMIUM_PAIRS, ...MID_PAIRS, ...SMALL_PAIRS, ...BROADWAY_SUITED, ...BROADWAY_OFF, ...SUITED_ACES, ...SUITED_CONNECTORS, ...SUITED_GAPPERS, ...BROADWAYS_MEDIUM, ...LOOSE_HANDS, ...WEAK_OFFSUIT_ACES, ...WEAK_OFFSUIT_BROADWAY.slice(0, 4), 'K6s', 'Q6s', 'J6s', 'T6s', '96s'],
            MP: [...PREMIUM_PAIRS, ...MID_PAIRS, ...SMALL_PAIRS, ...BROADWAY_SUITED, ...BROADWAY_OFF, ...SUITED_ACES, ...SUITED_CONNECTORS, ...SUITED_GAPPERS, ...BROADWAYS_MEDIUM, ...LOOSE_HANDS, ...WEAK_OFFSUIT_ACES, ...WEAK_OFFSUIT_BROADWAY, 'K6s', 'Q6s', 'J6s', 'T6s', '96s', '85s', '74s'],
            CO: [...PREMIUM_PAIRS, ...MID_PAIRS, ...SMALL_PAIRS, ...BROADWAY_SUITED, ...BROADWAY_OFF, ...SUITED_ACES, ...SUITED_CONNECTORS, ...SUITED_GAPPERS, ...BROADWAYS_MEDIUM, ...LOOSE_HANDS, ...WEAK_OFFSUIT_ACES, ...WEAK_OFFSUIT_BROADWAY, ...OFFSUIT_JUNK.slice(0, 8), 'K6s', 'K5s', 'Q6s', 'Q5s', 'J6s', 'T6s', '96s', '85s', '74s', '63s'],
            BTN: [...PREMIUM_PAIRS, ...MID_PAIRS, ...SMALL_PAIRS, ...BROADWAY_SUITED, ...BROADWAY_OFF, ...SUITED_ACES, ...SUITED_CONNECTORS, ...SUITED_GAPPERS, ...BROADWAYS_MEDIUM, ...LOOSE_HANDS, ...WEAK_OFFSUIT_ACES, ...WEAK_OFFSUIT_BROADWAY, ...OFFSUIT_JUNK, 'K6s', 'K5s', 'K4s', 'Q6s', 'Q5s', 'J6s', 'J5s', 'T6s', 'T5s', '96s', '95s', '85s', '84s', '74s', '73s', '63s', '62s', '52s'],
            SB: [...PREMIUM_PAIRS, ...MID_PAIRS, ...SMALL_PAIRS, ...BROADWAY_SUITED, ...BROADWAY_OFF, ...SUITED_ACES, ...SUITED_CONNECTORS, ...SUITED_GAPPERS, ...BROADWAYS_MEDIUM, ...LOOSE_HANDS, ...WEAK_OFFSUIT_ACES, ...WEAK_OFFSUIT_BROADWAY, ...OFFSUIT_JUNK.slice(0, 10), 'K6s', 'Q6s', 'J6s', 'T6s', '96s', '85s', '74s'],
            BB: [...PREMIUM_PAIRS, ...MID_PAIRS, ...SMALL_PAIRS, ...BROADWAY_SUITED, ...BROADWAY_OFF, ...SUITED_ACES, ...SUITED_CONNECTORS, ...SUITED_GAPPERS, ...BROADWAYS_MEDIUM, ...LOOSE_HANDS, ...WEAK_OFFSUIT_ACES, ...WEAK_OFFSUIT_BROADWAY, ...OFFSUIT_JUNK, 'K6s', 'K5s', 'Q6s', 'Q5s', 'J6s', 'T6s', '96s', '85s', '74s', '63s'],
        },
    },

    gto_neutral: {
        id: 'gto_neutral',
        name: 'GTO Neutral',
        icon: 'Scale',
        color: '#a78bfa',
        vpip: { UTG: 9, MP: 12, CO: 21, BTN: 25, SB: 20, BB: 22 },
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

// ─── Legacy id aliases ─────────────────────────────────────────────────────
// Sessions/bookmarks saved before the taxonomy was unified still carry these
// ids. Accepted read-only so a restored scenario resolves to a real range
// instead of silently producing an empty one.
const LEGACY_ID_ALIASES = {
    tight_passive: 'nit',
    loose_passive: 'calling_station',
    tight_aggressive: 'tag',
    loose_aggressive: 'lag',
    over_bluffer: 'maniac',
    under_bluffer: 'nit',
    fit_or_fold: 'fish',
    icm_scared: 'nit',
    icm_pressure: 'lag',
};

/**
 * Resolve any archetype id (canonical or legacy) to a canonical id.
 * @returns {string|null}
 */
export function resolveArchetypeId(archetypeId) {
    if (!archetypeId) return null;
    if (ARCHETYPE_CONFIG[archetypeId]) return archetypeId;
    const alias = LEGACY_ID_ALIASES[archetypeId];
    return alias && ARCHETYPE_CONFIG[alias] ? alias : null;
}

// 3-bet value core — everything an archetype would re-raise with if it holds it
const THREE_BET_VALUE = ['AA', 'KK', 'QQ', 'JJ', 'AKs', 'AKo', 'AQs'];
// Archetype-specific 3-bet bluff candidates (only used if already in the open range)
const THREE_BET_BLUFFS = {
    nit: [],
    tag: ['A5s', 'A4s'],
    lag: ['A5s', 'A4s', 'A3s', 'KJs', '76s', '65s'],
    fish: ['AJs', 'KQs'],
    calling_station: [],
    maniac: ['A5s', 'A4s', 'A3s', 'A2s', 'KJs', 'QJs', 'JTs', '98s', '87s', '76s', '65s', '54s'],
    gto_neutral: ['A5s', 'A4s', 'KJs'],
};

/**
 * Get a range for a given archetype, position and action.
 * @param {string} archetypeId - canonical or legacy id
 * @param {string} position
 * @param {string} action - 'open' (default) | '3bet' | 'call'
 * @returns {string[]} deduplicated hand notations ([] for unknown inputs)
 */
export function getArchetypeRange(archetypeId, position = 'BTN', action = 'open') {
    const id = resolveArchetypeId(archetypeId);
    if (!id) return [];
    const config = ARCHETYPE_CONFIG[id];
    const openRange = [...new Set(config.openRanges?.[position] || [])];

    const act = String(action || 'open').toLowerCase();
    if (act === 'open' || act === 'rfi') return openRange;

    if (act === '3bet' || act === 'threebet') {
        const bluffs = THREE_BET_BLUFFS[id] || [];
        return openRange.filter(h => THREE_BET_VALUE.includes(h) || bluffs.includes(h));
    }

    if (act === 'call' || act === 'defend' || act === 'flat') {
        const threeBet = new Set(getArchetypeRange(id, position, '3bet'));
        return openRange.filter(h => !threeBet.has(h));
    }

    console.warn(`[VillainArchetypeRanges] Unknown action "${action}" — no range available.`);
    return [];
}

/**
 * Combo-weighted percentage of a hand list (pair 6, suited 4, offsuit 12 of 1326).
 */
export function computeRangePercent(range) {
    const list = range instanceof Set ? [...range] : (range || []);
    const combos = list.reduce((sum, hand) => {
        if (!hand || hand.length < 2) return sum;
        if (hand.length === 2) return sum + 6;
        if (hand.endsWith('s')) return sum + 4;
        if (hand.endsWith('o')) return sum + 12;
        return sum;
    }, 0);
    return combos / 1326 * 100;
}

/**
 * Get VPIP % for a given archetype and position.
 * Derived from the range that is actually generated (and sent to the analyze
 * API) so the badge and the coaching advice can never disagree. The `vpip`
 * table on each config is the design target only.
 */
export function getArchetypeVPIP(archetypeId, position = 'BTN') {
    const id = resolveArchetypeId(archetypeId);
    if (!id) return null;
    const range = getArchetypeRange(id, position, 'open');
    if (range.length === 0) return ARCHETYPE_CONFIG[id].vpip?.[position] ?? null;
    return Math.round(computeRangePercent(range));
}

/**
 * Get a compact range string for passing to the analyze API.
 * Returns something like: "AA,KK,QQ,AKs,AKo,..."
 */
export function getArchetypeRangeString(archetypeId, position = 'BTN', action = 'open') {
    const range = getArchetypeRange(archetypeId, position, action);
    return range.join(',');
}

/**
 * Get archetype display metadata (legacy ids resolve to their canonical entry).
 */
export function getArchetypeInfo(archetypeId) {
    const id = resolveArchetypeId(archetypeId);
    return id ? ARCHETYPE_CONFIG[id] : null;
}
