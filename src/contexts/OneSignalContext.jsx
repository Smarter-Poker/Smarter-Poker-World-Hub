/* ═══════════════════════════════════════════════════════════════════════════
   ONESIGNAL PUSH NOTIFICATIONS — REACT CONTEXT
   Handles push notification subscription and management
   ═══════════════════════════════════════════════════════════════════════════ */

import React, { createContext, useContext, useEffect, useState } from 'react';

const OneSignalContext = createContext(null);

export function OneSignalProvider({ children }) {
    const [isInitialized, setIsInitialized] = useState(false);
    const [isSubscribed, setIsSubscribed] = useState(false);
    const [playerId, setPlayerId] = useState(null);
    const [permission, setPermission] = useState('default');

    useEffect(() => {
        // Only run on client side
        if (typeof window === 'undefined') return;

        const initOneSignal = async () => {
            try {
                // Dynamically import OneSignal
                const OneSignal = (await import('react-onesignal')).default;

                await OneSignal.init({
                    appId: process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID,
                    allowLocalhostAsSecureOrigin: true, // For development
                    notifyButton: {
                        enable: false, // We'll use our own UI
                    },
                    serviceWorkerPath: '/OneSignalSDKWorker.js',
                    // CRITICAL: Default URL when notification is clicked (prevents going to non-existent pages)
                    welcomeNotification: {
                        url: '/hub',
                    },
                    promptOptions: {
                        slidedown: {
                            prompts: [{
                                type: 'push',
                                autoPrompt: true,
                                text: {
                                    actionMessage: 'Allow Notifications',
                                    acceptButton: 'Allow',
                                    cancelButton: 'Later',
                                },
                                delay: {
                                    pageViews: 1,
                                    timeDelay: 3,
                                },
                            }],
                        },
                    },
                });

                // Handle notification clicks - redirect to /hub if no URL specified
                OneSignal.Notifications.addEventListener('click', (event) => {
                    const url = event.notification?.launchURL || event.result?.url || '/hub';
                    console.log('[OneSignal] Notification clicked, navigating to:', url);
                    // If it's a relative URL, navigate properly
                    if (url.startsWith('/')) {
                        window.location.href = url;
                    }
                });

                setIsInitialized(true);

                // Check subscription status
                const subscribed = await OneSignal.User.PushSubscription.optedIn;
                setIsSubscribed(subscribed);

                // Get player ID if subscribed
                if (subscribed) {
                    const id = await OneSignal.User.PushSubscription.id;
                    setPlayerId(id);
                }

                // Listen for subscription changes
                OneSignal.User.PushSubscription.addEventListener('change', (event) => {
                    setIsSubscribed(event.current.optedIn);
                    setPlayerId(event.current.id);
                });

                // Check notification permission
                const perm = await OneSignal.Notifications.permission;
                setPermission(perm ? 'granted' : 'default');

            } catch (error) {
                console.error('OneSignal initialization error:', error);
            }
        };

        initOneSignal();
    }, []);

    // Subscribe to push notifications
    const subscribe = async () => {
        if (!isInitialized) return false;

        try {
            const OneSignal = (await import('react-onesignal')).default;

            // Request permission and subscribe
            await OneSignal.Notifications.requestPermission();
            await OneSignal.User.PushSubscription.optIn();

            const id = await OneSignal.User.PushSubscription.id;
            setPlayerId(id);
            setIsSubscribed(true);
            setPermission('granted');

            return true;
        } catch (error) {
            console.error('OneSignal subscribe error:', error);
            return false;
        }
    };

    // Unsubscribe from push notifications
    const unsubscribe = async () => {
        if (!isInitialized) return false;

        try {
            const OneSignal = (await import('react-onesignal')).default;
            await OneSignal.User.PushSubscription.optOut();
            setIsSubscribed(false);
            setPlayerId(null);
            return true;
        } catch (error) {
            console.error('OneSignal unsubscribe error:', error);
            return false;
        }
    };

    // Set user tags (for targeted notifications)
    const setTags = async (tags) => {
        if (!isInitialized) return false;

        try {
            const OneSignal = (await import('react-onesignal')).default;
            await OneSignal.User.addTags(tags);
            return true;
        } catch (error) {
            console.error('OneSignal setTags error:', error);
            return false;
        }
    };

    // Set external user ID (links to your database user)
    // Uses server-side API because OneSignal.login() JS SDK is broken
    const setExternalUserId = async (userId) => {
        if (!isInitialized) return false;
        if (!userId) {
            console.warn('[OneSignal] setExternalUserId called without userId');
            return false;
        }
        if (!playerId) {
            console.warn('[OneSignal] setExternalUserId called without playerId - user may not be subscribed');
            return false;
        }

        try {
            console.log('[OneSignal] Linking user ID via API:', userId, 'playerId:', playerId);

            // Call server-side API to link user (bypasses broken JS SDK)
            const response = await fetch('/api/notifications/link-user', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ playerId, userId }),
            });

            const result = await response.json();

            if (result.success) {
                console.log('[OneSignal] User linked successfully via API');
                return true;
            } else {
                console.error('[OneSignal] API link failed:', result);
                return false;
            }
        } catch (error) {
            console.error('[OneSignal] setExternalUserId error:', error);
            return false;
        }
    };

    const value = {
        isInitialized,
        isSubscribed,
        playerId,
        permission,
        subscribe,
        unsubscribe,
        setTags,
        setExternalUserId,
    };

    return (
        <OneSignalContext.Provider value={value}>
            {children}
        </OneSignalContext.Provider>
    );
}

export function useOneSignal() {
    const context = useContext(OneSignalContext);
    if (!context) {
        throw new Error('useOneSignal must be used within a OneSignalProvider');
    }
    return context;
}

export default OneSignalContext;
