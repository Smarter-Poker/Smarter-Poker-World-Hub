/**
 * useLoadFailsafe + useInitialLoadRef: the two loading rules from the
 * Social Media gold standard, extracted so every page gets them for free.
 *
 * WHY: the 2026 social feed (commit 5af49bf4cb) shipped an 8-second failsafe
 * after players reported a skeleton that never resolved when a Supabase call
 * hung or a realtime channel failed to answer. A page that stays on its
 * skeleton forever is indistinguishable from a crash. The same commit added
 * `isInitialLoadRef` so a background refresh (realtime insert, tab refocus,
 * pull to refresh) never flashes the skeleton over content the player is
 * already reading, which wiped scroll position every time.
 *
 * Usage:
 *   const [loading, setLoading] = useState(true);
 *   useLoadFailsafe(loading, setLoading);            // 8000ms default
 *   const isInitialLoad = useInitialLoadRef();
 *   ...
 *   if (isInitialLoad.current) setLoading(true);     // only the first time
 *   await fetchFeed();
 *   isInitialLoad.current = false;
 */
import { useEffect, useRef } from 'react';

export function useLoadFailsafe(isLoading, setLoading, ms = 8000) {
  useEffect(() => {
    if (!isLoading) return undefined;
    const timer = setTimeout(() => {
      try {
        setLoading(false);
      } catch (_) {
        // The component may have unmounted between the tick and the call.
      }
    }, ms);
    return () => clearTimeout(timer);
  }, [isLoading, setLoading, ms]);
}

/**
 * A ref that is `true` until the caller flips it after the first successful
 * load. Read `.current` before deciding to show a skeleton; set it to false
 * in the first load's `finally`. Background refreshes then keep the content
 * on screen instead of replacing it with a shimmer.
 */
export function useInitialLoadRef() {
  return useRef(true);
}

export default useLoadFailsafe;
