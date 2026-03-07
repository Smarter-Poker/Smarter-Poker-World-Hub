/**
 * usePersistedFilters — Filter/sort/search state that survives navigation
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Specialized hook for pages with filter panels (leaderboards, hand history,
 * tournament lists, venue search, etc.). Stores a single JSON object per page.
 *
 * URL query params override stored values on first load (deep linking).
 *
 * Usage:
 *   const { filters, setFilter, setFilters, resetFilters } = usePersistedFilters(
 *     'commander-leaderboard',
 *     { metric: 'hours', period: 'month' }
 *   );
 *
 *   // Read: filters.metric → 'hours'
 *   // Write: setFilter('metric', 'sessions')
 *   // Bulk:  setFilters({ metric: 'sessions', period: 'week' })
 *   // Reset: resetFilters()
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/router';

const FILTER_PREFIX = 'sp-filters-';
const DEFAULT_TTL = 30 * 24 * 60 * 60 * 1000; // 30 days

/**
 * @param {string} pageKey — unique page identifier (e.g., 'commander-leaderboard')
 * @param {object} defaults — default filter values
 * @param {object} [options]
 * @param {number} [options.ttl] — expiration in ms (default 30 days)
 * @param {string[]} [options.queryKeys] — URL query param names to sync (defaults to all keys in defaults)
 * @returns {{ filters, setFilter, setFilters, resetFilters }}
 */
export function usePersistedFilters(pageKey, defaults, options = {}) {
  const { ttl = DEFAULT_TTL, queryKeys } = options;
  const router = useRouter();
  const storageKey = `${FILTER_PREFIX}${pageKey}`;
  const hydrated = useRef(false);
  const keysToSync = queryKeys || Object.keys(defaults);

  // ── Load from storage on mount ───────────────────────────────────────
  const [filters, setFiltersRaw] = useState(() => {
    if (typeof window === 'undefined') return { ...defaults };
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return { ...defaults };
      const parsed = JSON.parse(raw);

      // TTL check
      if (parsed.__exp && Date.now() > parsed.__exp) {
        localStorage.removeItem(storageKey);
        return { ...defaults };
      }

      const stored = parsed.__v || parsed;
      // Merge stored with defaults (defaults fill in any missing keys)
      return { ...defaults, ...stored };
    } catch {
      return { ...defaults };
    }
  });

  // ── Override from URL query params on first mount ────────────────────
  useEffect(() => {
    if (hydrated.current) return;
    hydrated.current = true;

    if (!router.isReady) return;

    const overrides = {};
    let hasOverrides = false;
    keysToSync.forEach((key) => {
      const qVal = router.query[key];
      if (qVal !== undefined && qVal !== null) {
        overrides[key] = qVal;
        hasOverrides = true;
      }
    });

    if (hasOverrides) {
      setFiltersRaw((prev) => {
        const merged = { ...prev, ...overrides };
        writeToStorage(merged);
        return merged;
      });
    }
  }, [router.isReady]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Write helper ─────────────────────────────────────────────────────
  const writeToStorage = useCallback((data) => {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(storageKey, JSON.stringify({
        __v: data,
        __exp: Date.now() + ttl,
      }));
    } catch (error) {
      console.warn('[usePersistedFilters] Write failed:', storageKey, error?.name);
    }
  }, [storageKey, ttl]);

  // ── Set a single filter key ──────────────────────────────────────────
  const setFilter = useCallback((key, value) => {
    setFiltersRaw((prev) => {
      const updated = { ...prev, [key]: value };
      writeToStorage(updated);
      return updated;
    });
  }, [writeToStorage]);

  // ── Set multiple filter keys at once ─────────────────────────────────
  const setFilters = useCallback((patch) => {
    setFiltersRaw((prev) => {
      const updated = { ...prev, ...patch };
      writeToStorage(updated);
      return updated;
    });
  }, [writeToStorage]);

  // ── Reset all filters to defaults ────────────────────────────────────
  const resetFilters = useCallback(() => {
    setFiltersRaw({ ...defaults });
    if (typeof window !== 'undefined') {
      try { localStorage.removeItem(storageKey); } catch {}
    }
  }, [defaults, storageKey]);

  return { filters, setFilter, setFilters, resetFilters };
}

export default usePersistedFilters;
