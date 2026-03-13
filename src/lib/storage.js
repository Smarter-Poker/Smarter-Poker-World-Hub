/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * STORAGE — Centralized localStorage Utility for Smarter.Poker World Hub
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * SSR-safe, try-catch wrapped, with TTL support and quota monitoring.
 * Mirrors Club Arena's storage.ts pattern for consistency across the ecosystem.
 *
 * Usage:
 *   import { safeGet, safeSet, STORAGE_KEYS } from '@/lib/storage';
 *   const val = safeGet(STORAGE_KEYS.FRIENDS_TAB, 'all');
 *   safeSet(STORAGE_KEYS.FRIENDS_TAB, 'online');
 */

// ═══════════════════════════════════════════════════════════════════════════════
// SSR GUARD
// ═══════════════════════════════════════════════════════════════════════════════

const isBrowser = typeof window !== 'undefined';

// ═══════════════════════════════════════════════════════════════════════════════
// CORE OPERATIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Get item from localStorage with JSON parse and fallback
 * @param {string} key
 * @param {*} defaultValue
 * @returns {*}
 */
export function safeGet(key, defaultValue) {
  if (!isBrowser) return defaultValue;
  try {
    const item = localStorage.getItem(key);
    if (item === null) return defaultValue;
    return JSON.parse(item);
  } catch {
    return defaultValue;
  }
}

/**
 * Set item in localStorage with JSON stringify
 * @param {string} key
 * @param {*} value
 */
export function safeSet(key, value) {
  if (!isBrowser) return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.warn('[Storage] Failed to save:', key, error?.name);
  }
}

/**
 * Remove item from localStorage
 * @param {string} key
 */
export function safeRemove(key) {
  if (!isBrowser) return;
  try {
    localStorage.removeItem(key);
  } catch {
    // Silently fail
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// TTL (TIME-TO-LIVE) STORAGE
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Set item with expiration
 * @param {string} key
 * @param {*} value
 * @param {number} ttlMs - Time to live in milliseconds
 */
export function setWithTTL(key, value, ttlMs) {
  safeSet(key, { __v: value, __exp: Date.now() + ttlMs });
}

/**
 * Get item, returning defaultValue if expired
 * @param {string} key
 * @param {*} defaultValue
 * @returns {*}
 */
export function getWithTTL(key, defaultValue) {
  const item = safeGet(key, null);
  if (!item || !item.__exp) return defaultValue;
  if (Date.now() > item.__exp) {
    safeRemove(key);
    return defaultValue;
  }
  return item.__v;
}

// ═══════════════════════════════════════════════════════════════════════════════
// QUOTA MONITORING
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Check localStorage usage and warn if near quota
 * Call on app init or periodically
 */
export function checkQuota() {
  if (!isBrowser) return;
  try {
    let totalBytes = 0;
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      const val = localStorage.getItem(key);
      totalBytes += (key.length + (val ? val.length : 0)) * 2; // UTF-16
    }
    const usedKB = (totalBytes / 1024).toFixed(1);
    const estimatedMax = 5 * 1024 * 1024; // 5MB typical
    const pct = ((totalBytes / estimatedMax) * 100).toFixed(1);
    if (totalBytes > estimatedMax * 0.8) {
      console.warn(`[Storage] Usage at ${pct}% (${usedKB} KB) — consider cleanup`);
    }
  } catch {
    // Ignore — storage may be unavailable
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// CENTRALIZED STORAGE KEYS
// ═══════════════════════════════════════════════════════════════════════════════
//
// All new localStorage keys should be registered here to prevent collisions.
// Existing keys (smarter-poker-auth, commander_staff, etc.) are NOT duplicated
// here — they remain in their original locations for backwards compatibility.
//

export const STORAGE_KEYS = {
  // ── Zustand Store Persistence ──────────────────────────────────────────
  CLUB_ARENA_PREFS:      'sp-club-arena-prefs',
  DIAMOND_ARENA_PREFS:   'sp-diamond-arena-prefs',
  FRIENDS_PREFS:         'sp-friends-prefs',
  SETTINGS_PREFS:        'sp-settings-prefs',
  SOCIAL_PREFS:          'sp-social-prefs',
  REELS_PREFS:           'sp-reels-prefs',
  MESSENGER_PREFS:       'sp-messenger-prefs',
  NOTIFICATIONS_PREFS:   'sp-notifications-prefs',

  // ── Page Filter Persistence ────────────────────────────────────────────
  FILTER_PREFIX:         'sp-filters-',  // Used as prefix: sp-filters-{pageKey}

  // ── Form Draft Persistence ─────────────────────────────────────────────
  DRAFT_PREFIX:          'sp-draft-',    // Used as prefix: sp-draft-{formKey}
};

// ═══════════════════════════════════════════════════════════════════════════════
// NOOP STORAGE (for SSR / Zustand fallback)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * No-op storage object for Zustand persist when running server-side.
 * Prevents crashes during Next.js SSR/SSG.
 */
export const noopStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
};

/**
 * Returns localStorage if available, otherwise noopStorage.
 * Use with Zustand persist: { storage: getStorage() }
 */
export function getStorage() {
  return isBrowser ? localStorage : noopStorage;
}
