/**
 * Table Layouts Registry
 * =====================
 * Contains pre-built layouts for different table types.
 * Each layout was exported using the DEV MODE export tool.
 */

// 9-MAX LAYOUT (Full Ring) - Hero + 8 Villains
// LOCKED POSITIONS - Matches template exactly
export const LAYOUT_9MAX = {
    name: '9MAX',
    seats: 9,
    heroCardsOffset: { x: 29, y: 117 },
    positions: {
        // Hero: Bottom center
        "hero": {
            "left": "50%",
            "top": "76%",
            "avatarOffset": { "x": -62, "y": 0 }
        },
        // Villain 1: Bottom left corner
        "seat1": {
            "left": "18%",
            "top": "66%",
            "avatarOffset": { "x": -62, "y": 0 }
        },
        // Villain 2: Left side, lower
        "seat2": {
            "left": "6%",
            "top": "44%",
            "avatarOffset": { "x": -62, "y": 0 }
        },
        // Villain 3: Left side, upper
        "seat3": {
            "left": "10%",
            "top": "20%",
            "avatarOffset": { "x": -62, "y": 0 }
        },
        // Villain 4: Top left
        "seat4": {
            "left": "28%",
            "top": "8%",
            "avatarOffset": { "x": -62, "y": 0 }
        },
        // Villain 5: Top right
        "seat5": {
            "left": "60%",
            "top": "8%",
            "avatarOffset": { "x": -62, "y": 0 }
        },
        // Villain 6: Right side, upper
        "seat6": {
            "left": "82%",
            "top": "20%",
            "avatarOffset": { "x": -62, "y": 0 }
        },
        // Villain 7: Right side, lower
        "seat7": {
            "left": "88%",
            "top": "44%",
            "avatarOffset": { "x": -62, "y": 0 }
        },
        // Villain 8: Bottom right corner
        "seat8": {
            "left": "76%",
            "top": "66%",
            "avatarOffset": { "x": -62, "y": 0 }
        }
    },
    heroCards: { x: 29, y: 117 }
};

// 6-MAX LAYOUT (Short-handed) - Hero + 5 Villains
// Uses seats: hero, 1, 3, 5, 6, 8 (evenly distributed)
export const LAYOUT_6MAX = {
    name: '6-max',
    seats: 6,
    description: 'Short-handed table',
    positions: {
        "hero": {
            "left": "50%",
            "top": "78%",
            "avatarOffset": { "x": 0, "y": 0 },
            "badgeOffset": { "x": -48, "y": 141 }
        },
        "seat1": {
            "left": "15%",
            "top": "55%",
            "avatarOffset": { "x": 0, "y": 0 },
            "badgeOffset": { "x": -40, "y": 130 }
        },
        "seat2": {
            "left": "12%",
            "top": "28%",
            "avatarOffset": { "x": 0, "y": 0 },
            "badgeOffset": { "x": -50, "y": 120 }
        },
        "seat3": {
            "left": "50%",
            "top": "10%",
            "avatarOffset": { "x": 0, "y": 0 },
            "badgeOffset": { "x": 0, "y": 120 }
        },
        "seat4": {
            "left": "88%",
            "top": "28%",
            "avatarOffset": { "x": 0, "y": 0 },
            "badgeOffset": { "x": -50, "y": 120 }
        },
        "seat5": {
            "left": "85%",
            "top": "55%",
            "avatarOffset": { "x": 0, "y": 0 },
            "badgeOffset": { "x": -40, "y": 130 }
        }
    },
    heroCards: { "x": 29, "y": 117 }
};

// HEADS-UP LAYOUT - Hero + 1 Villain
export const LAYOUT_HEADSUP = {
    name: 'heads-up',
    seats: 2,
    description: 'Heads-up / 1v1',
    positions: {
        "hero": {
            "left": "50%",
            "top": "78%",
            "avatarOffset": { "x": 0, "y": 0 },
            "badgeOffset": { "x": -48, "y": 141 }
        },
        "seat1": {
            "left": "50%",
            "top": "15%",
            "avatarOffset": { "x": 0, "y": 0 },
            "badgeOffset": { "x": 0, "y": 120 }
        }
    },
    heroCards: { "x": 29, "y": 117 }
};

// 3-HANDED LAYOUT - Hero + 2 Villains
export const LAYOUT_3HANDED = {
    name: '3-handed',
    seats: 3,
    description: 'Three-way',
    positions: {
        "hero": {
            "left": "50%",
            "top": "78%",
            "avatarOffset": { "x": 0, "y": 0 },
            "badgeOffset": { "x": -48, "y": 141 }
        },
        "seat1": {
            "left": "20%",
            "top": "30%",
            "avatarOffset": { "x": 0, "y": 0 },
            "badgeOffset": { "x": -40, "y": 120 }
        },
        "seat2": {
            "left": "80%",
            "top": "30%",
            "avatarOffset": { "x": 0, "y": 0 },
            "badgeOffset": { "x": -40, "y": 120 }
        }
    },
    heroCards: { "x": 29, "y": 117 }
};

// 4-HANDED LAYOUT - Hero + 3 Villains
export const LAYOUT_4HANDED = {
    name: '4-handed',
    seats: 4,
    description: 'Four-way',
    positions: {
        "hero": {
            "left": "50%",
            "top": "78%",
            "avatarOffset": { "x": 0, "y": 0 },
            "badgeOffset": { "x": -48, "y": 141 }
        },
        "seat1": {
            "left": "15%",
            "top": "45%",
            "avatarOffset": { "x": 0, "y": 0 },
            "badgeOffset": { "x": -40, "y": 120 }
        },
        "seat2": {
            "left": "50%",
            "top": "12%",
            "avatarOffset": { "x": 0, "y": 0 },
            "badgeOffset": { "x": 0, "y": 120 }
        },
        "seat3": {
            "left": "85%",
            "top": "45%",
            "avatarOffset": { "x": 0, "y": 0 },
            "badgeOffset": { "x": -40, "y": 120 }
        }
    },
    heroCards: { "x": 29, "y": 117 }
};

// Layout lookup by name
export const TABLE_LAYOUTS = {
    '9max': LAYOUT_9MAX,
    '6max': LAYOUT_6MAX,
    'headsup': LAYOUT_HEADSUP,
    '3handed': LAYOUT_3HANDED,
    '4handed': LAYOUT_4HANDED,
};

// Get layout by game configuration
export function getLayoutForGame(gameConfig) {
    const playerCount = gameConfig?.playerCount || 9;

    if (playerCount === 2) return LAYOUT_HEADSUP;
    if (playerCount === 3) return LAYOUT_3HANDED;
    if (playerCount === 4) return LAYOUT_4HANDED;
    if (playerCount <= 6) return LAYOUT_6MAX;
    return LAYOUT_9MAX;
}
