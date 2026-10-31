/**
 * What the hamburger's "Turn On Notifications" row offers on this device
 * (Dan, 2026-10-31: "THE TURN ON NOTIFICATIONS IS GONE FROM THE HAMBURGER
 * MENU... THAT PROBABLY NEEDS TO BE ADDED BACK IN GLOBALLY"). Club Arena's
 * src/lib/pushMenuState.ts answers the same question the same way.
 *
 *   'ask'     - push works here and this device holds no live subscription:
 *               the tap enrols it (enablePush, inside the tap gesture).
 *   'install' - iPhone or iPad in a plain Safari tab. Apple only allows push
 *               from an installed Home Screen app; the row opens /hub/install.
 *   'blocked' - the browser denied permission; the row opens Settings,
 *               Notifications, which explains how to allow it.
 *   null      - nothing to offer: already receiving push here, or the browser
 *               cannot receive push at all.
 *
 * An explicit opt-out still gets 'ask': a menu row is where a player goes to
 * change their mind, unlike a prompt that must not nag past a decision.
 */
// `client` is src/lib/push-client.js (passed in so this stays importable by
// node tests, which cannot resolve that browser module).
export async function pushMenuState(client) {
    if (!client.isWebPushSupported()) return client.isIos() && !client.isIosStandalonePwa() ? 'install' : null;
    if (client.notificationPermission() === 'denied') return 'blocked';
    try {
        const subscribed = await client.hasLocalSubscription();
        if (subscribed && client.notificationPermission() === 'granted') return null;
    } catch { /* could not tell: offering the row is the safe answer */ }
    return 'ask';
}

export const PUSH_MENU_DESTINATIONS = { install: '/hub/install', blocked: '/hub/settings/notifications' };
