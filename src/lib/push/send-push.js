/**
 * send-push.js -- SERVER ONLY. One sender, chosen per subscription row.
 *
 * push_subscriptions.transport (2026-09-08):
 *   'webpush'  a browser endpoint with VAPID keys        -> web-push.js
 *   'fcm'      the Club Arena app's device token         -> fcm.js
 *
 * Both return the same shape, so deliverPushNow and the dispatch cron treat a
 * phone and a browser identically: same failure counting, same retirement,
 * same receipts. A row with an unknown transport is retired rather than
 * retried forever - the same rule as an incomplete Web Push subscription.
 */
import { sendWebPush } from './web-push';
import { sendFcm } from './fcm';

export const SUBSCRIPTION_COLUMNS = 'id, endpoint, p256dh, auth, transport';

export async function sendPush(subscription, payload = {}, opts = {}) {
    const transport = subscription?.transport || 'webpush';
    if (transport === 'webpush') return sendWebPush(subscription, payload, opts);
    if (transport === 'fcm') return sendFcm(subscription, payload, opts);
    return { ok: false, expired: true, error: `unknown_transport:${transport}` };
}

export default { sendPush, SUBSCRIPTION_COLUMNS };
