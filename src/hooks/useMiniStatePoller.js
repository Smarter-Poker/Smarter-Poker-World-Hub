/**
 * useMiniStatePoller — Custom hook for polling live table mini-state
 *
 * Uses IntersectionObserver to track which GameCards are visible,
 * then batch-fetches mini-state every 4s for only visible tables.
 * Off-screen tables stop polling automatically.
 *
 * Usage:
 *   const { miniStates, observerRef } = useMiniStatePoller();
 *   // Wrap each card: <div ref={el => observerRef(tableId, el)}>
 *   // Read state:    miniStates.get(tableId)
 */

import { useState, useRef, useCallback, useEffect } from 'react';

const POLL_INTERVAL = 4000; // 4 seconds

export default function useMiniStatePoller() {
  const [miniStates, setMiniStates] = useState(new Map());
  const visibleIds = useRef(new Set());
  const elementsMap = useRef(new Map());   // tableId → DOM element
  const observerInstance = useRef(null);
  const intervalRef = useRef(null);

  // ── Fetch mini-state for all visible tables ──
  const fetchMiniStates = useCallback(async () => {
    const ids = Array.from(visibleIds.current);
    if (ids.length === 0) return;

    try {
      const res = await fetch(`/api/poker/engine/mini-state?tableIds=${ids.join(',')}`);
      if (!res.ok) return;

      const data = await res.json();
      if (!Array.isArray(data)) return;

      setMiniStates(prev => {
        const next = new Map(prev);
        for (const state of data) {
          next.set(state.tableId, state);
        }
        return next;
      });
    } catch {
      // Silently fail — next poll will retry
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

  // ── Start/stop polling based on visible set ──
  useEffect(() => {
    // Initial fetch
    fetchMiniStates();

    intervalRef.current = setInterval(fetchMiniStates, POLL_INTERVAL);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
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
    }

    if (el) {
      el.dataset.miniStateId = tableId;
      observerInstance.current.observe(el);
      elementsMap.current.set(tableId, el);
    }
  }, []);

  return { miniStates, observerRef };
}
