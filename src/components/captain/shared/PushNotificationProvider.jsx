/**
 * OneSignal Push Notification Provider
 * Dark industrial sci-fi gaming theme
 *
 * Usage in _app.js:
 * import PushNotificationProvider from '../src/components/captain/shared/PushNotificationProvider';
 *
 * function MyApp({ Component, pageProps }) {
 *   return (
 *     <PushNotificationProvider>
 *       <Component {...pageProps} />
 *     </PushNotificationProvider>
 *   );
 * }
 */
import React, { useEffect, useState, createContext, useContext } from 'react';

const PushContext = createContext({
  isSupported: false,
  isSubscribed: false,
  permission: 'default',
  subscribe: () => {},
  unsubscribe: () => {},
});

export function usePushNotifications() {
  return useContext(PushContext);
}

export default function PushNotificationProvider({ children }) {
  const [isSupported, setIsSupported] = useState(false);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [permission, setPermission] = useState('default');
  const [OneSignal, setOneSignal] = useState(null);

  useEffect(() => {
    // Check if OneSignal is configured
    const appId = process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID;
    if (!appId) {
      console.log('OneSignal App ID not configured');
      return;
    }

    // Check if browser supports push
    if (typeof window === 'undefined' || !('Notification' in window)) {
      console.log('Push notifications not supported');
      return;
    }

    setIsSupported(true);
    setPermission(Notification.permission);

    // Load OneSignal SDK
    const loadOneSignal = async () => {
      try {
        // Add OneSignal script
        if (!window.OneSignal) {
          const script = document.createElement('script');
          script.src = 'https://cdn.onesignal.com/sdks/OneSignalSDK.js';
          script.async = true;
          document.head.appendChild(script);

          await new Promise((resolve) => {
            script.onload = resolve;
          });
        }

        window.OneSignal = window.OneSignal || [];

        window.OneSignal.push(function() {
          window.OneSignal.init({
            appId: appId,
            safari_web_id: process.env.NEXT_PUBLIC_ONESIGNAL_SAFARI_WEB_ID,
            notifyButton: {
              enable: false, // We'll use our own UI
            },
            allowLocalhostAsSecureOrigin: process.env.NODE_ENV === 'development',
          });

          // Check subscription status
          window.OneSignal.isPushNotificationsEnabled(function(isEnabled) {
            setIsSubscribed(isEnabled);
          });

          // Listen for subscription changes
          window.OneSignal.on('subscriptionChange', function(isSubscribed) {
            setIsSubscribed(isSubscribed);
          });

          // Listen for permission changes
          window.OneSignal.on('permissionPromptDisplay', function() {
            setPermission('prompt');
          });

          window.OneSignal.on('notificationPermissionChange', function(permissionChange) {
            setPermission(permissionChange.to);
          });

          setOneSignal(window.OneSignal);
        });
      } catch (err) {
        console.error('Failed to load OneSignal:', err);
      }
    };

    loadOneSignal();
  }, []);

  const subscribe = async () => {
    if (!OneSignal) return false;

    try {
      await new Promise((resolve) => {
        OneSignal.push(function() {
          OneSignal.showNativePrompt();
          resolve();
        });
      });

      // Set external user ID if user is logged in
      const userId = localStorage.getItem('smarter-poker-user-id');
      if (userId) {
        OneSignal.push(function() {
          OneSignal.setExternalUserId(userId);
        });
      }

      return true;
    } catch (err) {
      console.error('Subscribe error:', err);
      return false;
    }
  };

  const unsubscribe = async () => {
    if (!OneSignal) return false;

    try {
      await new Promise((resolve) => {
        OneSignal.push(function() {
          OneSignal.setSubscription(false);
          resolve();
        });
      });
      setIsSubscribed(false);
      return true;
    } catch (err) {
      console.error('Unsubscribe error:', err);
      return false;
    }
  };

  // Set external user ID when user logs in
  const setUserId = (userId) => {
    if (!OneSignal || !userId) return;

    OneSignal.push(function() {
      OneSignal.setExternalUserId(userId);
    });
  };

  // Add tags for targeting (e.g., venue_id)
  const addTags = (tags) => {
    if (!OneSignal) return;

    OneSignal.push(function() {
      OneSignal.sendTags(tags);
    });
  };

  return (
    <PushContext.Provider
      value={{
        isSupported,
        isSubscribed,
        permission,
        subscribe,
        unsubscribe,
        setUserId,
        addTags,
      }}
    >
      {children}
    </PushContext.Provider>
  );
}

/**
 * Push notification prompt button component
 */
export function PushNotificationButton({ className = '' }) {
  const { isSupported, isSubscribed, permission, subscribe, unsubscribe } = usePushNotifications();

  if (!isSupported) {
    return null;
  }

  if (permission === 'denied') {
    return (
      <div className={`text-sm text-[#4A5E78] ${className}`}>
        Notifications blocked. Enable in browser settings.
      </div>
    );
  }

  if (isSubscribed) {
    return (
      <button
        onClick={unsubscribe}
        className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-[#10B981]/10 text-[#10B981] ${className}`}
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
        Notifications On
      </button>
    );
  }

  return (
    <button
      onClick={subscribe}
      className={`cap-btn cap-btn-primary flex items-center gap-2 px-4 py-2 text-sm ${className}`}
    >
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
      </svg>
      Enable Notifications
    </button>
  );
}
