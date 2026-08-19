/**
 * onesignal-server.js -- COMPATIBILITY SHIM. OneSignal is gone.
 *
 * REWIRED 2026-08-19. OneSignal was removed from smarter.poker and replaced by
 * self-hosted VAPID Web Push (src/lib/push/*). This module keeps its original
 * name and function signature so existing call sites do not have to change, but
 * every send now goes through enqueuePush() -- which means it is gated by
 * notification_preferences, recorded in push_outbox, and retried by
 * /api/cron/push-dispatch.
 *
 * The file name is retained only because the repo mount cannot delete files.
 * NEW CODE SHOULD IMPORT src/lib/notify.js INSTEAD -- notify() fires the in-app
 * bell and the push together, which is what almost every caller actually wants.
 *
 * BREAKING: `playerIds` no longer does anything. Those were OneSignal device
 * identifiers with no meaning outside OneSignal's system. Pass `externalIds`
 * (Supabase user ids) instead. A call that supplies only playerIds returns a
 * failure with an explicit message rather than silently succeeding, because a
 * silent no-op here is exactly the class of bug that made push look "sent" while
 * no phone ever buzzed.
 */
import { createClient } from './supabaseServerClient';
import { enqueuePush } from './push/push-enqueue';
import { isPushConfigured } from './push/web-push';

let _supabase = null;
function getSupabase() {
    if (!_supabase) _supabase = createClient();
    return _supabase;
}

export async function sendPushNotification({
    playerIds,
    externalIds,
    externalUserIds,
    collapseId,
    heading,
    content,
    url,
    data = {},
    event = null,
    options = {},
} = {}) {
    if (!isPushConfigured()) {
        console.warn('[push] VAPID keys are not configured. Push aborted.');
        return { success: false, error: 'Push is not configured (VAPID keys missing)' };
    }

    const targets = Array.from(new Set([...(externalIds || []), ...(externalUserIds || [])].filter(Boolean)));

    if (targets.length === 0) {
        if (playerIds?.length) {
            return {
                success: false,
                error: 'playerIds are no longer supported (OneSignal removed 2026-08-19). Pass externalIds with Supabase user ids.',
            };
        }
        return { success: false, error: 'No recipients provided' };
    }

    const supabase = getSupabase();

    try {
        const results = await Promise.all(
            targets.map((userId) =>
                enqueuePush(supabase, {
                    userId,
                    title: heading || 'Smarter Poker',
                    body: content || '',
                    url: url || '/hub',
                    event,
                    // collapseId was OneSignal's dedup key; `tag` is the Web Push
                    // equivalent and replaces an existing banner instead of stacking.
                    tag: collapseId || undefined,
                    requireInteraction: options.requireInteraction === true,
                    actions: options.actions,
                })
            )
        );

        const delivered = results.filter((r) => r.sent).length;
        return {
            success: true,
            delivered,
            queued: results.filter((r) => !r.sent && !r.skipped).length,
            skipped: results.filter((r) => r.skipped).length,
            recipients: delivered,
            data,
        };
    } catch (e) {
        console.warn('[push] sendPushNotification failed:', e?.message || e);
        return { success: false, error: e?.message || 'Push failed' };
    }
}

export function isOneSignalConfigured() {
    return isPushConfigured();
}

export function getOneSignalStatus() {
    return {
        provider: 'vapid-web-push',
        onesignal: 'removed_2026_08_19',
        configured: isPushConfigured(),
    };
}

export default { sendPushNotification, isOneSignalConfigured, getOneSignalStatus };
