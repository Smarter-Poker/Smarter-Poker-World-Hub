/**
 * PushContext -- React context for self-hosted VAPID Web Push.
 *
 * Replaces OneSignalContext (removed 2026-08-19). It deliberately exposes the
 * SAME hook surface the OneSignal context did -- isInitialized, isSubscribed,
 * permission, subscribe, unsubscribe, setExternalUserId, playerId -- so the
 * existing consumers (messenger, notification bell) needed no rewrite.
 *
 * Differences from the OneSignal version, all intentional:
 *   - `playerId` is now the push endpoint URL. There is no third-party device
 *     id any more; the endpoint IS the device identity.
 *   - `setExternalUserId` is a no-op. Subscriptions are keyed to the Supabase
 *     user id server-side at /api/push/subscribe, using the caller's verified
 *     JWT, so the client cannot and should not assert its own identity.
 *   - Nothing loads a third-party SDK, so there is no init race and no second
 *     service worker competing for scope with /sw.js.
 */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
    enablePush, disablePush, isWebPushSupported,
    notificationPermission, hasLocalSubscription,
} from '../lib/push-client';

const PushContext = createContext(null);

export function PushProvider({ children }) {
    const [isInitialized, setIsInitialized] = useState(false);
    const [isSubscribed, setIsSubscribed] = useState(false);
    const [permission, setPermission] = useState('default');
    const [endpoint, setEndpoint] = useState(null);

    const refresh = useCallback(async () => {
        if (typeof window === 'undefined') return;
        setPermission(notificationPermission());
        if (!isWebPushSupported()) {
            setIsSubscribed(false);
            return;
        }
        try {
            const has = await hasLocalSubscription();
            setIsSubscribed(has);
            if (has) {
                const reg = await navigator.serviceWorker.ready;
                const sub = await reg.pushManager.getSubscription();
                setEndpoint(sub?.endpoint || null);
            } else {
                setEndpoint(null);
            }
        } catch {
            setIsSubscribed(false);
        }
    }, []);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            await refresh();
            if (!cancelled) setIsInitialized(true);
        })();
        return () => { cancelled = true; };
    }, [refresh]);

    const subscribe = useCallback(async () => {
        const result = await enablePush();
        await refresh();
        return result;
    }, [refresh]);

    const unsubscribe = useCallback(async () => {
        const result = await disablePush();
        await refresh();
        return result;
    }, [refresh]);

    // Kept for signature compatibility. Identity is established server-side from
    // the JWT on /api/push/subscribe -- a client-asserted user id would be an
    // IDOR vector, so this deliberately does nothing.
    const setExternalUserId = useCallback(() => Promise.resolve(true), []);

    const value = useMemo(() => ({
        isInitialized,
        isSubscribed,
        permission,
        playerId: endpoint,
        endpoint,
        subscribe,
        unsubscribe,
        setExternalUserId,
        refresh,
        supported: isWebPushSupported(),
    }), [isInitialized, isSubscribed, permission, endpoint, subscribe, unsubscribe, setExternalUserId, refresh]);

    return <PushContext.Provider value={value}>{children}</PushContext.Provider>;
}

export function usePush() {
    const ctx = useContext(PushContext);
    if (!ctx) {
        // Render-safe fallback: a consumer mounted outside the provider gets
        // inert values rather than a crash.
        return {
            isInitialized: false,
            isSubscribed: false,
            permission: 'default',
            playerId: null,
            endpoint: null,
            subscribe: async () => ({ ok: false, error: 'Push provider not mounted' }),
            unsubscribe: async () => ({ ok: false }),
            setExternalUserId: async () => true,
            refresh: async () => {},
            supported: false,
        };
    }
    return ctx;
}

export default PushContext;
