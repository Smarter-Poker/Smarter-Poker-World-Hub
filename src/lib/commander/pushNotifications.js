/**
 * commander/pushNotifications.js -- COMPATIBILITY SHIM. OneSignal is gone.
 *
 * REWIRED 2026-08-19. Previously a bare re-export of the vendored
 * @smarter-poker/commander-shared OneSignal helper. It now implements the same
 * exported surface on top of self-hosted VAPID Web Push so Commander and the
 * news digest keep working with no call-site changes.
 *
 * The vendored package still contains the old OneSignal code; nothing imports
 * it any more. This file deliberately shadows it.
 *
 * NEW CODE SHOULD IMPORT src/lib/notify.js INSTEAD.
 */
import { sendPushNotification as vapidSend, isOneSignalConfigured, getOneSignalStatus } from '../onesignal-server';

/**
 * Same signature the commander code has always called:
 *   sendPushNotification({ playerIds, externalUserIds, title, message, url, data, buttons })
 */
export async function sendPushNotification({
    playerIds,
    externalUserIds,
    externalIds,
    title,
    message,
    url,
    data = {},
    buttons = [],
    event = null,
} = {}) {
    return vapidSend({
        playerIds,
        externalIds: externalIds || externalUserIds,
        heading: title,
        content: message,
        url,
        data,
        event,
        options: buttons.length > 0
            ? { actions: buttons.slice(0, 2).map((b) => ({ action: b.id || b.action, title: b.text || b.title })) }
            : {},
    });
}

export { isOneSignalConfigured, getOneSignalStatus };
export default { sendPushNotification, isOneSignalConfigured, getOneSignalStatus };
