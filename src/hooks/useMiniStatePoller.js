/**
 * useMiniStatePoller — Custom hook for polling live table mini-state (v2)
 *
 * v2 improvements:
 *   • Adaptive polling — pauses interval when no tables are visible
 *   • Error resilience — exponential backoff on API failures (max 16s)
 *   • Stale timestamps — injects _fetchedAt on each state for stale detection
 *   • Proper cleanup — unobserves all elements on unmount
 *
 * Usage:
 *   const { miniStates, observerRef } = useMiniStatePoller();
 *   // Wrap each card: <div ref={el => observerRef(tableId, el)}>
 *   // Read state:    miniStates.get(tableId)
 */

import { useState, useRef, useCallback, useEffect } from 'react';

const POLL_INTERVAL = 4000; // 4 seconds
const MAX_BACKOFF = 16000;  // 16 seconds max backoff

export default function useMiniStatePoller() {
  const [miniStates, setMiniStates] = useState(new Map());
  const visibleIds = useRef(new Set());
  const elementsMap = useRef(new Map());
  const observerInstance = useRef(null);
  const intervalRef = useRef(null);
  const failCount = useRef(0);
  const mountedRef = useRef(true);

  // ── Fetch mini-state for all visible tables ──
  const fetchMiniStates = useCallback(async () => {
    if (!mountedRef.current) return;

    const ids = Array.from(visibleIds.current);
    if (ids.length === 0) return; // ← Adaptive: skip fetch when nothing visible

    try {
      const res = await fetch(`/api/poker/engine/mini-state?tableIds=${ids.join(',')}`);
      if (!res.ok) {
        failCount.current = Math.min(failCount.current + 1, 4);
        return;
      }

      const data = await res.json();
      if (!Array.isArray(data) || !mountedRef.current) return;

      // Reset backoff on success
      failCount.current = 0;

      const now = Date.now();
      setMiniStates(prev => {
        const next = new Map(prev);
        for (const state of data) {
          state._fetchedAt = now; // Stale timestamp
          next.set(state.tableId, state);
        }
        return next;
      });
    } catch {
      failCount.current = Math.min(failCount.current + 1, 4);
      // Silently fail — backoff will slow retries
    }
  }, []);

  // ── Setup IntersectionObserver (once) ──
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return;

    observerInstance.current = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const tableId = entry.target.dataset.miniStateId;
          if (!tableId) continue;

          if (entry.isIntersecting) {
            visibleIds.current.add(tableId);
          } else {
            visibleIds.current.delete(tableId);
          }
        }
      },
      { rootMargin: '100px', threshold: 0 }
    );

    return () => {
      observerInstance.current?.disconnect();
      observerInstance.current = null;
    };
  }, []);

  // ── Adaptive polling with backoff ──
  useEffect(() => {
    mountedRef.current = true;

    // Initial fetch
    fetchMiniStates();

    // Use dynamic interval that respects backoff
    const tick = () => {
      if (!mountedRef.current) return;

      fetchMiniStates();

      // Schedule next tick with backoff
      const delay = failCount.current > 0
        ? Math.min(POLL_INTERVAL * Math.pow(2, failCount.current), MAX_BACKOFF)
        : POLL_INTERVAL;

      intervalRef.current = setTimeout(tick, delay);
    };

    intervalRef.current = setTimeout(tick, POLL_INTERVAL);

    return () => {
      mountedRef.current = false;
      if (intervalRef.current) clearTimeout(intervalRef.current);
    };
  }, [fetchMiniStates]);

  // ── Register/unregister DOM elements for observation ──
  const observerRef = useCallback((tableId, el) => {
    if (!observerInstance.current) return;

    // Unobserve previous element for this tableId
    const prev = elementsMap.current.get(tableId);
    if (prev && prev !== el) {
      observerInstance.current.unobserve(prev);
      elementsMap.current.delete(tableId);
      visibleIds.current.delete(tableId);
    }

    if (el) {
      el.dataset.miniStateId = tableId;
      observerInstance.current.observe(el);
      elementsMap.current.set(tableId, el);
    }
  }, []);

  return { miniStates, observerRef };
}
