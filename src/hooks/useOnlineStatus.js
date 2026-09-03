/**
 * useOnlineStatus: is the browser online, SSR-safe.
 *
 * WHY: a phone drops off wifi in an elevator and every fetch on the page
 * fails silently; the player sees stale content and a spinner and blames
 * the app. The shell needs one truthful signal to show "You Are Offline"
 * (src/components/ui/OfflineBar.jsx) and to let a page pause polling.
 *
 * SSR: the server has no navigator, so the initial value is always `true`
 * and the real value is read in an effect after hydration. That means the
 * server markup and the first client render agree (no hydration mismatch),
 * and an offline first paint is corrected within one frame.
 */
import { useEffect, useState } from 'react';

export function useOnlineStatus() {
  const [online, setOnline] = useState(true);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof navigator === 'undefined') return undefined;
    const sync = () => setOnline(navigator.onLine !== false);
    sync();
    window.addEventListener('online', sync);
    window.addEventListener('offline', sync);
    return () => {
      window.removeEventListener('online', sync);
      window.removeEventListener('offline', sync);
    };
  }, []);

  return online;
}

export default useOnlineStatus;
