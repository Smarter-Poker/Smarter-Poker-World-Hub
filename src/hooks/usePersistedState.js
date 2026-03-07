/**
 * usePersistedState — useState backed by localStorage
 * ═══════════════════════════════════════════════════════
 *
 * Drop-in replacement for useState that survives page refresh.
 * SSR-safe: returns defaultValue during server render, hydrates on mount.
 *
 * Usage:
 *   const [tab, setTab] = usePersistedState('settings-section', 'account');
 *   const [filters, setFilters] = usePersistedState('my-filters', {}, { ttl: 7 * 24 * 60 * 60 * 1000 });
 */

import { useState, useEffect, useCallback, useRef } from 'react';

/**
 * @param {string} key — localStorage key
 * @param {*} defaultValue — value when nothing is stored
 * @param {object} [options]
 * @param {number} [options.ttl] — time-to-live in ms (auto-expire)
 * @param {number} [options.debounceMs] — debounce writes (for forms)
 * @returns {[*, function]}
 */
export function usePersistedState(key, defaultValue, options = {}) {
  const { ttl, debounceMs } = options;
  const timerRef = useRef(null);

  // ── Lazy initializer: read from storage on first render ──────────────
  const [value, setValueRaw] = useState(() => {
    if (typeof window === 'undefined') return defaultValue;
    try {
      const raw = localStorage.getItem(key);
      if (raw === null) return defaultValue;
      const parsed = JSON.parse(raw);

      // TTL check
      if (ttl && parsed && parsed.__exp) {
        if (Date.now() > parsed.__exp) {
          localStorage.removeItem(key);
          return defaultValue;
        }
        return parsed.__v;
      }

      return parsed;
    } catch {
      return defaultValue;
    }
  });

  // ── Write to localStorage when value changes ─────────────────────────
  const writeToStorage = useCallback((val) => {
    if (typeof window === 'undefined') return;
    try {
      if (val === undefined || val === null) {
        localStorage.removeItem(key);
      } else if (ttl) {
        localStorage.setItem(key, JSON.stringify({ __v: val, __exp: Date.now() + ttl }));
      } else {
        localStorage.setItem(key, JSON.stringify(val));
      }
    } catch (error) {
      console.warn('[usePersistedState] Write failed:', key, error?.name);
    }
  }, [key, ttl]);

  // ── Setter that updates both React state and storage ─────────────────
  const setValue = useCallback((newValue) => {
    setValueRaw((prev) => {
      const resolved = typeof newValue === 'function' ? newValue(prev) : newValue;

      if (debounceMs) {
        clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => writeToStorage(resolved), debounceMs);
      } else {
        writeToStorage(resolved);
      }

      return resolved;
    });
  }, [writeToStorage, debounceMs]);

  // ── Cleanup debounce timer on unmount ────────────────────────────────
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return [value, setValue];
}

export default usePersistedState;
