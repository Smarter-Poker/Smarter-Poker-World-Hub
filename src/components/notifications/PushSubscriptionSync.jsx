/**
 * PushSubscriptionSync -- silent, invisible subscription repair.
 *
 * THE INCIDENT THIS FIXES
 * A user enables push once. Weeks later their browser silently rotates the
 * subscription (OS update, storage eviction, PWA reinstall). The old endpoint
 * is dead but the server never learns, so every send is "accepted" by FCM and
 * the phone stays silent forever. The first-run prompt has already been marked
 * done in localStorage, so nothing ever asks again. The user concludes push is
 * broken; the dashboard says everything is fine.
 *
 * WHAT THIS DOES
 * On every app boot, and whenever a backgrounded PWA comes back to the
 * foreground, if permission is already granted and someone is signed in, it
 * silently re-runs enablePush() to refresh and re-register the subscription.
 *
 * It NEVER prompts -- it bails immediately unless permission is already
 * 'granted', so it can never steal the permission dialog from the first-run
 * flow. Throttled to once per hour per device. Errors are never surfaced.
 *
 * Renders nothing.
 */
import { useEffect, useRef } from 'react';
import { enablePush, isWebPushSupported, notificationPermission } from '../../lib/push-client';
import { getAuthUser } from '../../lib/authUtils';

const SYNC_KEY = 'sp_push_sync_at';
const THROTTLE_MS = 60 * 60 * 1000; // 1 hour

export default function PushSubscriptionSync() {
    const running = useRef(false);

    useEffect(() => {
        if (typeof window === 'undefined') return undefined;

        const maybeSync = async () => {
            if (running.current) return;
            if (!isWebPushSupported()) return;
            if (notificationPermission() !== 'granted') return; // never prompt
            if (!getAuthUser()?.id) return;

            let last = 0;
            try { last = Number(localStorage.getItem(SYNC_KEY) || 0); } catch { /* private mode */ }
            if (last && Date.now() - last < THROTTLE_MS) return;

            running.current = true;
            try {
                await enablePush();
                try { localStorage.setItem(SYNC_KEY, String(Date.now())); } catch { /* ignore */ }
            } catch {
                // Silent by design. A failed repair must never interrupt the user.
            } finally {
                running.current = false;
            }
        };

        // Defer past first paint -- this is background maintenance, not startup work.
        const boot = setTimeout(maybeSync, 4000);

        const onVisible = () => {
            if (document.visibilityState === 'visible') maybeSync();
        };
        document.addEventListener('visibilitychange', onVisible);

        return () => {
            clearTimeout(boot);
            document.removeEventListener('visibilitychange', onVisible);
        };
    }, []);

    return null;
}
