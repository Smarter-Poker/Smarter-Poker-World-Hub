/* ═══════════════════════════════════════════════════════════════════════════
   HUB VANGUARD — USER PREFERENCES STORE
   Tracks most visited cards and last card position
   ═══════════════════════════════════════════════════════════════════════════ */

import { POKER_IQ_ORBS } from '../orbs/manifest/registry';
import type { OrbConfig } from '../orbs/manifest/registry';

// Default 6 cards when no user data exists
const DEFAULT_FOOTER_CARDS = [
    'social-media',
    'club-arena',
    'training',
    'trivia',
    'bankroll-manager',
    'diamond-arena',
];

interface UserPreferences {
    lastVisitedCardId: string | null;
    mostVisitedCardIds: string[];  // Sorted by visit count, most visited first
    visitCounts: Record<string, number>;
}

// Simple localStorage-based persistence
const STORAGE_KEY = 'hub-vanguard-user-prefs';

function loadPreferences(): UserPreferences {
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
            return JSON.parse(stored);
        }
    } catch (e) {
        console.warn('Failed to load user preferences:', e);
    }
    return {
        lastVisitedCardId: null,
        mostVisitedCardIds: [],
        visitCounts: {},
    };
}

function savePreferences(prefs: UserPreferences): void {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
    } catch (e) {
        console.warn('Failed to save user preferences:', e);
    }
}

// Track when a card is visited
export function recordCardVisit(cardId: string): void {
    const prefs = loadPreferences();

    // Update last visited
    prefs.lastVisitedCardId = cardId;

    // Update visit count
    prefs.visitCounts[cardId] = (prefs.visitCounts[cardId] || 0) + 1;

    // Recalculate most visited order
    prefs.mostVisitedCardIds = Object.entries(prefs.visitCounts)
        .sort(([, a], [, b]) => b - a)
        .map(([id]) => id);

    savePreferences(prefs);
}

// Get the 6 footer cards based on user preferences
export function getFooterCards(): OrbConfig[] {
    const prefs = loadPreferences();
    const cardIds: string[] = [];

    // First card: last visited (if exists)
    if (prefs.lastVisitedCardId) {
        cardIds.push(prefs.lastVisitedCardId);
    }

    // Fill remaining with most visited
    for (const id of prefs.mostVisitedCardIds) {
        if (!cardIds.includes(id) && cardIds.length < 6) {
            cardIds.push(id);
        }
    }

    // Fill remaining with defaults
    for (const id of DEFAULT_FOOTER_CARDS) {
        if (!cardIds.includes(id) && cardIds.length < 6) {
            cardIds.push(id);
        }
    }

    // Map IDs to OrbConfig objects
    return cardIds.map(id => {
        const orb = POKER_IQ_ORBS.find(o => o.id === id);
        return orb || POKER_IQ_ORBS[0]; // Fallback to first orb if not found
    });
}

// Get the default 6 cards (for when no user data exists)
export function getDefaultFooterCards(): OrbConfig[] {
    return DEFAULT_FOOTER_CARDS.map(id => {
        const orb = POKER_IQ_ORBS.find(o => o.id === id);
        return orb || POKER_IQ_ORBS[0];
    });
}

// Check if user has any visit history
export function hasUserHistory(): boolean {
    const prefs = loadPreferences();
    return prefs.lastVisitedCardId !== null || prefs.mostVisitedCardIds.length > 0;
}
