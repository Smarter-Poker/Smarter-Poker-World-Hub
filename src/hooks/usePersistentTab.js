/**
 * usePersistentTab — Tab state that survives Next.js page navigation
 * ══════════════════════════════════════════════════════════════════
 * Uses Zustand persist so the user's active tab is remembered when they
 * navigate away and come back — zero re-mount spinner, instant restore.
 *
 * Usage:
 *   const [activeTab, setActiveTab] = usePersistentTab('leaderboards', 'overall');
 *   // First arg: unique page key. Second arg: default tab value.
 *
 * URL query override: if `router.query.tab` is present, it takes precedence
 * on first mount and writes through to the persistent store.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { useEffect, useRef } from 'react';
import { useRouter } from 'next/router';

// ── Zustand store (persisted to localStorage) ─────────────────────────────
const useTabStore = create(
  persist(
    (set, get) => ({
      tabs: {}, // { [pageKey]: activeTabValue }
      setTab: (pageKey, value) =>
        set(state => ({ tabs: { ...state.tabs, [pageKey]: value } })),
      getTab: (pageKey, defaultValue) =>
        get().tabs[pageKey] ?? defaultValue,
    }),
    {
      name: 'sp_ui_tabs_v1',
      // Only store tabs, nothing else
      partialize: state => ({ tabs: state.tabs }),
    }
  )
);

/**
 * @param {string} pageKey     — Unique identifier for the page/feature
 * @param {string} defaultTab  — Initial tab if nothing is stored
 * @returns {[string, (tab: string) => void]}
 */
export function usePersistentTab(pageKey, defaultTab) {
  const router = useRouter();
  const { tabs, setTab } = useTabStore();
  const hydrated = useRef(false);

  const activeTab = tabs[pageKey] ?? defaultTab;

  // On first mount, honour URL query param if present
  useEffect(() => {
    if (hydrated.current) return;
    hydrated.current = true;

    const queryTab = router.query?.tab;
    if (queryTab && queryTab !== activeTab) {
      setTab(pageKey, queryTab);
    }
  }, [router.query?.tab]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSetTab = (value) => {
    setTab(pageKey, value);
  };

  return [activeTab, handleSetTab];
}
