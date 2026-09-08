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
    'bankroll-manager',
    'preflop-charts',
    'poker-near-me',
    'marketplace',
    'personal-assistant',
    'training',
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
    prefs.mostVisitedCardIds = Object.entries(prefs.visitCounts || {})
        .sort(([, a], [, b]) => b - a)
        .map(([id]) => id);

    savePreferences(prefs);
}

// Get the 6 footer cards based on user preferences
// excludeIds: card IDs to skip (e.g. user-hidden cards) so all 6 slots are filled with visible cards
export function getFooterCards(excludeIds: string[] = []): OrbConfig[] {
    const prefs = loadPreferences();
    const cardIds: string[] = [];

    // First card: last visited (if exists and not excluded)
    if (prefs.lastVisitedCardId && !excludeIds.includes(prefs.lastVisitedCardId)) {
        cardIds.push(prefs.lastVisitedCardId);
    }

    // Fill remaining with most visited (skip excluded)
    for (const id of prefs.mostVisitedCardIds) {
        if (!cardIds.includes(id) && !excludeIds.includes(id) && cardIds.length < 6) {
            cardIds.push(id);
        }
    }

    // Fill remaining with defaults (skip excluded)
    for (const id of DEFAULT_FOOTER_CARDS) {
        if (!cardIds.includes(id) && !excludeIds.includes(id) && cardIds.length < 6) {
            cardIds.push(id);
        }
    }

    // Ultimate fallback: draw from FULL orb registry if defaults were all excluded
    if (cardIds.length < 6) {
        for (const orb of POKER_IQ_ORBS) {
            if (!cardIds.includes(orb.id) && !excludeIds.includes(orb.id) && cardIds.length < 6) {
                cardIds.push(orb.id);
            }
        }
    }

    // Map IDs to OrbConfig objects.
    //
    // A stored id that no longer resolves is DROPPED, not replaced. It used to
    // fall back to POKER_IQ_ORBS[0], which is a bug with teeth: WorldHub renders
    // this list with key={orb.id}, so a retired id silently became a SECOND copy
    // of whichever card happens to sit at index 0 - duplicate React keys, and one
    // of the reader's six personalised slots wasted on a card they already have.
    //
    // It went unnoticed because it only fires when a card leaves the registry.
    // Removing the My Clubs card on 2026-09-08 made it fire for exactly the
    // people who had used My Clubs, since their stored lastVisitedCardId and
    // mostVisitedCardIds still name it.
    //
    // Dropping is safe: the slot-filling above already tops the list up from
    // DEFAULT_FOOTER_CARDS and then the full registry, so the reader still gets
    // six real cards - just their next genuine preference instead of a phantom.
    const resolved = cardIds
        .map(id => resolveOrb(id))
        .filter((orb): orb is OrbConfig => Boolean(orb));

    // Top up if retired ids left us short of six.
    for (const orb of POKER_IQ_ORBS) {
        if (resolved.length >= 6) break;
        if (excludeIds.includes(orb.id)) continue;
        if (resolved.some(r => r.id === orb.id)) continue;
        resolved.push(orb);
    }

    return resolved;
}

// Get the default 6 cards (for when no user data exists)
export function getDefaultFooterCards(): OrbConfig[] {
    // Same rule as getFooterCards: drop what does not resolve rather than
    // duplicating card zero. DEFAULT_FOOTER_CARDS is maintained by hand, so a
    // typo or a retired id here would otherwise show as a mysterious repeat.
    return DEFAULT_FOOTER_CARDS
        .map(id => resolveOrb(id))
        .filter((orb): orb is OrbConfig => Boolean(orb));
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
        const parsed = stored ? parseInt(stored, 10) : 0;
        if (!Number.isFinite(parsed)) return 0;
        // Clamp to the registry this index is about to address. The carousel
        // wraps with modulo so an out-of-range value does not crash, but it
        // does silently park the reader on a different card than the one they
        // left. That happens whenever the registry shrinks - removing the My
        // Clubs card on 2026-09-08 took it from 14 entries to 13, so anyone
        // whose stored index was 13 came back to a different card.
        const max = Math.max(0, POKER_IQ_ORBS.length - 1);
        return Math.min(Math.max(parsed, 0), max);
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

// ── Card Visibility Toggles ──────────────────────────────────────────────
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
            if (error) console.warn('[UserPreferences] Failed to sync hidden cards to cloud:', error);
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
            .maybeSingle();

        if (error) throw error;

        const cloudHidden = (data?.hub_preferences as Record<string, unknown> | null)?.hiddenCardIds;
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
        console.warn('[UserPreferences] Failed to hydrate cloud preferences:', err);
    }
}
