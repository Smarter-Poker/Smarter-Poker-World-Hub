/**
 * push-deliver.js -- SERVER ONLY. Inline multi-device delivery.
 *
 * Sends a push to every ACTIVE subscription a user owns, right now, with no
 * queue in between. enqueuePush() calls this immediately after writing the
 * durable outbox row, which is why a phone buzzes within a second or two rather
 * than waiting up to 5 minutes for the dispatch cron.
 *
 * The cron is the safety net, not the delivery path.
 *
 * CONTRACT: never throws. Returns
 *   { attempted, accepted, expired, errors: [{ endpoint, error }] }
 */

import { sendWebPush, isPushConfigured } from './web-push';

/**
 * Consecutive transient failures before an endpoint is retired. Permanent
 * errors (404/410/403/400) deactivate immediately via `expired`; this covers
 * the endpoint that merely never works.
 */
const FAILURE_THRESHOLD = 10;

export async function deliverPushNow(supabase, userId, payload, opts = {}) {
    const result = { attempted: 0, accepted: 0, expired: 0, errors: [] };

    if (!supabase || !userId) {
        result.errors.push({ endpoint: null, error: 'missing supabase client or userId' });
        return result;
    }
    if (!isPushConfigured()) {
        result.errors.push({ endpoint: null, error: 'vapid_not_configured' });
        return result;
    }

    let subs = [];
    try {
        const { data, error } = await supabase
            .from('push_subscriptions')
            .select('id, endpoint, p256dh, auth')
            .eq('user_id', userId)
            .eq('is_active', true);
        if (error) {
            result.errors.push({ endpoint: null, error: error.message });
            return result;
        }
        subs = data || [];
    } catch (e) {
        result.errors.push({ endpoint: null, error: e?.message || 'subscription lookup failed' });
        return result;
    }

    if (subs.length === 0) {
        result.errors.push({ endpoint: null, error: 'no_subscription' });
        return result;
    }

    const nowIso = new Date().toISOString();

    // Fan out in parallel. A slow FCM endpoint must not delay an Apple one.
    await Promise.all(
        subs.map(async (sub) => {
            result.attempted += 1;
            const res = await sendWebPush(sub, payload, opts);

            if (res.ok) {
                result.accepted += 1;
                try {
                    await supabase
                        .from('push_subscriptions')
                        .update({ last_used_at: nowIso, failure_count: 0, last_failure_reason: null })
                        .eq('id', sub.id);
                } catch { /* telemetry only -- never fail the send */ }
                return;
            }

            result.errors.push({ endpoint: sub.endpoint, error: res.error });

            if (res.expired) {
                // Dead endpoint. Deactivate so we stop paying for it forever.
                result.expired += 1;
                try {
                    await supabase
                        .from('push_subscriptions')
                        .update({
                            is_active: false,
                            last_failure_reason: `expired_${res.statusCode || 410}`,
                            updated_at: nowIso,
                        })
                        .eq('id', sub.id);
                } catch { /* ignore */ }
                return;
            }

            // Transient failure -- count it, and retire the endpoint once it has
            // failed enough times.
            //
            // failure_count used to be write-only: incremented here and in
            // push-dispatch, reset on success, and READ BY NOTHING. An endpoint
            // that failed on every single send therefore stayed is_active=true
            // forever and was retried on every dispatch run for the life of the
            // deployment. Deactivating at a threshold is what makes the counter
            // mean something.
            try {
                const { data: row } = await supabase
                    .from('push_subscriptions')
                    .select('failure_count')
                    .eq('id', sub.id)
                    .maybeSingle();
                const nextCount = (row?.failure_count || 0) + 1;
                const retire = nextCount >= FAILURE_THRESHOLD;
                if (retire) result.expired += 1;
                await supabase
                    .from('push_subscriptions')
                    .update({
                        failure_count: nextCount,
                        is_active: !retire,
                        last_failure_reason: retire
                            ? `failure_threshold_${nextCount}`
                            : String(res.error || 'unknown').slice(0, 300),
                        updated_at: nowIso,
                    })
                    .eq('id', sub.id);
            } catch { /* ignore */ }
        })
    );

    return result;
}

export default { deliverPushNow };
