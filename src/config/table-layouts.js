/**
 * Table Layouts Registry
 * =====================
 * Contains pre-built layouts for different table types.
 * Each layout was exported using the DEV MODE export tool.
 */

// 9-MAX LAYOUT (Full Ring) - Hero + 8 Villains
// Exported 2026-01-24T02:02:32.086Z
export const LAYOUT_9MAX = {
    name: '9-max',
    seats: 9,
    description: 'Full ring table',
    // Note: avatarOffset is 0,0 - badge auto-positions on pre-attached gold box
    positions: {
        "hero": {
            "left": "50%",
            "top": "78%",
            "avatarOffset": { "x": -55, "y": 0 }
        },
        "seat1": {
            "left": "20%",
            "top": "68%",
            "avatarOffset": { "x": -55, "y": -20 }
        },
        "seat2": {
            "left": "8%",
            "top": "45%",
            "avatarOffset": { "x": -20, "y": 0 }
        },
        "seat3": {
            "left": "10%",
            "top": "22%",
            "avatarOffset": { "x": -20, "y": 0 }
        },
        "seat4": {
            "left": "30%",
            "top": "8%",
            "avatarOffset": { "x": -55, "y": 0 }
        },
        "seat5": {
            "left": "60%",
            "top": "8%",
            "avatarOffset": { "x": -55, "y": 0 }
        },
        "seat6": {
            "left": "80%",
            "top": "22%",
            "avatarOffset": { "x": -55, "y": 0 }
        },
        "seat7": {
            "left": "88%",
            "top": "45%",
            "avatarOffset": { "x": -75, "y": 0 }
        },
        "seat8": {
            "left": "82%",
            "top": "68%",
            "avatarOffset": { "x": -75, "y": -20 }
        }
    },
    heroCards: { "x": 29, "y": 117 }
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
