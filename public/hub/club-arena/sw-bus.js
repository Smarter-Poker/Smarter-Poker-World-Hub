/**
 * Service Worker — MasterBus Background Notifications
 * Receives critical bus events via postMessage and shows native notifications.
 */

// eslint-disable-next-line no-restricted-globals
const sw = self;

const EVENT_LABELS = {
    BALANCE_UPDATED: '💰 Balance Updated',
    CLUB_JOINED: '♠️ Club Joined',
    CLUB_LEFT: '🚪 Left Club',
    TABLE_SEATED: '🎯 Seated at Table',
    TABLE_LEFT: '👋 Left Table',
};

sw.addEventListener('message', (event) => {
    if (event.data?.type !== 'BUS_EVENT') return;

    const { type: eventType, payload } = event.data.event || {};
    const title = EVENT_LABELS[eventType] || `🚌 ${eventType}`;

    // Only show notification if page is not visible
    // (clients.matchAll checks if any tab is focused)
    sw.clients.matchAll({ type: 'window', includeUncontrolled: false }).then(clients => {
        const anyFocused = clients.some(c => c.visibilityState === 'visible');
        if (anyFocused) return; // Don't notify if user is looking at the app

        let body = '';
        if (eventType === 'BALANCE_UPDATED') {
            body = `Source: ${payload?.source || 'unknown'}`;
        } else if (eventType === 'CLUB_JOINED' || eventType === 'CLUB_LEFT') {
            body = payload?.clubName || payload?.clubId || '';
        } else if (eventType === 'TABLE_SEATED' || eventType === 'TABLE_LEFT') {
            body = `Table: ${payload?.tableId || ''}`;
        }

        sw.registration.showNotification(title, {
            body,
            icon: '/favicon.ico',
            badge: '/favicon.ico',
            tag: `bus-${eventType}`,
            renotify: true,
            silent: false,
        });
    });
});

// Notification click → focus the app tab
sw.addEventListener('notificationclick', (event) => {
    event.notification.close();
    event.waitUntil(
        sw.clients.matchAll({ type: 'window' }).then(clients => {
            if (clients.length > 0) {
                clients[0].focus();
            } else {
                sw.clients.openWindow('/');
            }
        })
    );
});

// Install/activate
sw.addEventListener('install', () => sw.skipWaiting());
sw.addEventListener('activate', () => sw.clients.claim());
