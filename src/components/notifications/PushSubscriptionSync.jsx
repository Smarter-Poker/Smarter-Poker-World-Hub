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
 * It also relays the service worker's SP_PUSH_RECEIVED message onto the app's
 * existing `smarter_poker_notif_sync` broadcast, so when a push lands while the
 * app is open the header bell, the club-arena bell and the notifications page
 * all refresh immediately instead of waiting out their poll interval.
 *
 * Renders nothing.
 */
import { useEffect, useRef } from 'react';
import { enablePush, isWebPushSupported, notificationPermission, isOptedOut } from '../../lib/push-client';
import { getAuthUser } from '../../lib/authUtils';
import { broadcastSync } from '../../lib/broadcastSync';

const SYNC_KEY = 'sp_push_sync_at';
const THROTTLE_MS = 60 * 60 * 1000; // 1 hour

export default function PushSubscriptionSync() {
    const running = useRef(false);
    // In-memory mirror of the throttle. localStorage reads THROW when storage is
    // blocked (Safari private mode); the old code caught that, left `last` at 0,
    // and the `if (last && ...)` guard short-circuited to false — so the throttle
    // silently vanished and a full enablePush() ran on EVERY visibilitychange,
    // i.e. every tab switch.
    const lastRunRef = useRef(0);

    useEffect(() => {
        if (typeof window === 'undefined') return undefined;

        const maybeSync = async () => {
            if (running.current) return;
            if (!isWebPushSupported()) return;
            if (notificationPermission() !== 'granted') return; // never prompt
            // Respect an explicit "turn push off on this device". Without this
            // the repair loop re-subscribes what the user just switched off.
            if (isOptedOut()) return;
            if (!getAuthUser()?.id) return;

            let last = lastRunRef.current;
            try { last = Math.max(last, Number(localStorage.getItem(SYNC_KEY) || 0)); } catch { /* private mode */ }
            if (Date.now() - last < THROTTLE_MS) return;

            running.current = true;
            lastRunRef.current = Date.now();
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

        // Relay SW push events to the in-app refresh channel.
        const onSwMessage = (e) => {
            if (e?.data?.type !== 'SP_PUSH_RECEIVED') return;
            try {
                broadcastSync('smarter_poker_notif_sync', { action: 'refresh_notifications' });
            } catch { /* broadcast is best-effort */ }
        };
        navigator.serviceWorker?.addEventListener?.('message', onSwMessage);

        return () => {
            clearTimeout(boot);
            document.removeEventListener('visibilitychange', onVisible);
            navigator.serviceWorker?.removeEventListener?.('message', onSwMessage);
        };
    }, []);

    return null;
}
