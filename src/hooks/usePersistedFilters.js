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
  const keysToSync = queryKeys || Object.keys(defaults || {});

  // ── Load from storage on mount ───────────────────────────────────────
  // IMPORTANT: Always init with defaults (SSR-safe). Reading localStorage in
  // useState initializer causes React error #418 (hydration mismatch) because
  // the server renders with defaults but client hydrates with stored values.
  const [filters, setFiltersRaw] = useState({ ...defaults });

  // ── Hydrate from localStorage after mount (client-only) ─────────────
  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return;
      const parsed = JSON.parse(raw);

      // TTL check
      if (parsed.__exp && Date.now() > parsed.__exp) {
        localStorage.removeItem(storageKey);
        return;
      }

      const stored = parsed.__v || parsed;
      setFiltersRaw((prev) => ({ ...prev, ...stored }));
    } catch {
      // ignore corrupt storage
    }
  }, [storageKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Override from URL query params on first mount ────────────────────
  useEffect(() => {
    if (hydrated.current) return;

    // Must wait for the router to populate query params. On statically
    // optimized/dynamic routes isReady is false on the first client render,
    // so the flag is only latched AFTER readiness — otherwise the effect
    // marks itself hydrated on the first pass and the overrides never apply.
    if (!router.isReady) return;
    hydrated.current = true;

    const overrides = {};
    let hasOverrides = false;
    keysToSync.forEach((key) => {
      const raw = router.query[key];
      // Repeated params arrive as arrays — take the first value.
      const qVal = Array.isArray(raw) ? raw[0] : raw;
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
      try { localStorage.removeItem(storageKey); } catch (e) { console.warn('[App] Handled exception:', e); }
    }
  }, [defaults, storageKey]);

  return { filters, setFilter, setFilters, resetFilters };
}

export default usePersistedFilters;
