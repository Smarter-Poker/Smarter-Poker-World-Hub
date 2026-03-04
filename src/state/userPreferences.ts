/* ═══════════════════════════════════════════════════════════════════════════
   HUB VANGUARD — USER PREFERENCES STORE
   Tracks most visited cards and last card position
   ═══════════════════════════════════════════════════════════════════════════ */

import { POKER_IQ_ORBS, COMMANDER_ORB, EMPLOYEE_PORTAL_ORB, TOKE_TRACKER_ORB } from '../orbs/manifest/registry';
import type { OrbConfig } from '../orbs/manifest/registry';
import { supabase } from '../lib/supabase';

// Resolve an orb ID to its config — checks standard orbs, Commander, Employee Portal, and Toke Tracker
function resolveOrb(id: string): OrbConfig | undefined {
    if (id === 'club-commander') return COMMANDER_ORB;
    if (id === 'employee-portal') return EMPLOYEE_PORTAL_ORB;
    if (id === 'toke-tracker') return TOKE_TRACKER_ORB;
    return POKER_IQ_ORBS.find(o => o.id === id);
}

// Default 6 cards when no user data exists
const DEFAULT_FOOTER_CARDS = [
    'social-media',
    'video-library',
    'club-arena',
    'training',
    'trivia',
    'diamond-arena',
];

interface UserPreferences {
    lastVisitedCardId: string | null;
    mostVisitedCardIds: string[];  // Sorted by visit count, most visited first
    visitCounts: Record<string, number>;
    hiddenCardIds: string[];       // Cards the user has toggled off in the Hub customizer
}

// Simple localStorage-based persistence
const STORAGE_KEY = 'hub-vanguard-user-prefs';

function loadPreferences(): UserPreferences {
    if (typeof window === 'undefined') {
        return {
            lastVisitedCardId: null,
            mostVisitedCardIds: [],
            visitCounts: {},
            hiddenCardIds: [],
        };
    }
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
        hiddenCardIds: [],
    };
}

function savePreferences(prefs: UserPreferences): void {
    if (typeof window === 'undefined') return;
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
        const orb = resolveOrb(id);
        return orb || POKER_IQ_ORBS[0]; // Fallback to first orb if not found
    });
}

// Get the default 6 cards (for when no user data exists)
export function getDefaultFooterCards(): OrbConfig[] {
    return DEFAULT_FOOTER_CARDS.map(id => {
        const orb = resolveOrb(id);
        return orb || POKER_IQ_ORBS[0];
    });
}

// Check if user has any visit history
export function hasUserHistory(): boolean {
    const prefs = loadPreferences();
    return prefs.lastVisitedCardId !== null || prefs.mostVisitedCardIds.length > 0;
}

// Get the last carousel index the user was viewing
export function getLastCarouselIndex(): number {
    if (typeof window === 'undefined') return 0;
    try {
        const stored = localStorage.getItem('hub-carousel-index');
        return stored ? parseInt(stored, 10) : 0;
    } catch {
        return 0;
    }
}

// Save the current carousel index
export function setLastCarouselIndex(index: number): void {
    if (typeof window === 'undefined') return;
    try {
        localStorage.setItem('hub-carousel-index', String(index));
    } catch {
        // Ignore storage errors
    }
}

// Trigger haptic feedback on supported devices
export function triggerHaptic(type: 'light' | 'medium' | 'heavy' = 'medium'): void {
    if (typeof window === 'undefined') return;

    // Try Vibration API
    if ('vibrate' in navigator) {
        const durations: Record<string, number> = {
            light: 10,
            medium: 25,
            heavy: 50,
        };
        navigator.vibrate(durations[type]);
    }
}

// ── Card Visibility Toggles ─────────────────────────────────────────────────
// Get the list of card IDs the user has hidden
export function getHiddenCardIds(): string[] {
    if (typeof window === 'undefined') return [];
    try {
        const prefs = loadPreferences();
        return prefs.hiddenCardIds || [];
    } catch {
        return [];
    }
}

// Set (overwrite) the list of hidden card IDs
export function setHiddenCardIds(ids: string[], userId?: string): void {
    if (typeof window === 'undefined') return;

    // 1. Instant optimistic LocalStorage update
    const prefs = loadPreferences();
    prefs.hiddenCardIds = ids;
    savePreferences(prefs);

    // 2. Background Cloud Persistence via RPC
    if (userId) {
        supabase.rpc('update_hub_preferences', {
            p_user_id: userId,
            p_preferences: { hiddenCardIds: ids }
        }).then(({ error }) => {
            if (error) console.error('[UserPreferences] Failed to sync hidden cards to cloud:', error);
        });
    }
}

// Hydrate local layout preferences from the cloud (called on Hub mount)
export async function hydrateHiddenCardIds(userId: string): Promise<void> {
    if (typeof window === 'undefined' || !userId) return;

    try {
        const { data, error } = await supabase
            .from('profiles')
            .select('hub_preferences')
            .eq('id', userId)
            .single();

        if (error) throw error;

        const cloudHidden = data?.hub_preferences?.hiddenCardIds;
        if (Array.isArray(cloudHidden)) {
            const currentLocal = getHiddenCardIds();
            const set1 = new Set(cloudHidden);
            const set2 = new Set(currentLocal);
            const isDifferent = set1.size !== set2.size || Array.from(set1).some(id => !set2.has(id));

            if (isDifferent) {
                // Cloud dictates truth for cross-device sync
                const prefs = loadPreferences();
                prefs.hiddenCardIds = cloudHidden;
                savePreferences(prefs);

                // Fire bus listener so any mounted components (like WorldHub or panels) update instantly
                window.dispatchEvent(new CustomEvent('hub-cards-hidden-changed', {
                    detail: { hiddenIds: cloudHidden }
                }));
            }
        }
    } catch (err) {
        console.error('[UserPreferences] Failed to hydrate cloud preferences:', err);
    }
}
