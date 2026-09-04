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

/**
 * Imperative check for a submit handler that lives inside a modal and has no
 * render-time flag to hand: reads navigator.onLine at the moment of the
 * tap. Returns true when the mutation may proceed; otherwise shows the
 * standard offline toast (Title Case, no em dash) and returns false. `toast`
 * is the object from src/stores/toastStore (or anything with `.error`).
 */
export const OFFLINE_TOAST = 'You Are Offline. Try Again When Connected.';

export function requireOnlineNow(toast) {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    if (toast && typeof toast.error === 'function') toast.error(OFFLINE_TOAST);
    return false;
  }
  return true;
}

export default useOnlineStatus;
