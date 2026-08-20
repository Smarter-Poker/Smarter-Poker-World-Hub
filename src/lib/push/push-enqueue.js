/**
 * push-enqueue.js -- SERVER ONLY. THE entry point for sending a web push.
 *
 * Three steps, in this order:
 *   1. GATE   -- read notification_preferences and decide whether to send.
 *   2. QUEUE  -- write a durable push_outbox row (audit trail + retry insurance).
 *   3. DELIVER-- call deliverPushNow(); if inline delivery succeeds, flip the
 *                outbox row to `sent` so the cron never touches it.
 *
 * If the process dies between step 2 and step 3, the row stays `pending` and
 * /api/cron/push-dispatch picks it up within 5 minutes. That is the entire
 * point of the outbox: a crash costs latency, never a lost notification.
 *
 * Feature code should NOT call this directly -- call notify() in src/lib/notify.js,
 * which fires the in-app bell and the push together.
 *
 * CONTRACT: never throws. Returns { sent, outboxId, skipped, reason, accepted }.
 */

import { deliverPushNow } from './push-deliver';
import { loadGateContext, gateDecision, needsDailyCount, countSentToday } from './push-gate';
import { isPushConfigured } from './web-push';

const TITLE_MAX = 120;
const BODY_MAX = 500;

/**
 * Read the gate for ONE user. Delegates to src/lib/push/push-gate.js so the
 * inline path and the dispatch cron cannot drift apart -- they must agree on
 * what a user consented to.
 */
async function checkGate(supabase, userId, event) {
    try {
        const ctx = await loadGateContext(supabase, [userId]);
        const entry = ctx.get(userId) || { prefs: null, legacy: null };
        const opts = {};
        if (needsDailyCount(entry, event)) {
            opts.sentToday = await countSentToday(supabase, userId);
        }
        return gateDecision(entry, event, opts);
    } catch (e) {
        // A gate failure must never silence a user.
        console.warn('[push-enqueue] gate threw, defaulting to allow:', e?.message || e);
        return { allowed: true, reason: 'gate_error_default_allow' };
    }
}

export async function enqueuePush(supabase, args = {}) {
    const out = { sent: false, outboxId: null, skipped: false, reason: null, accepted: 0 };

    const userId = args.userId;
    if (!supabase || !userId) {
        out.skipped = true;
        out.reason = 'missing_supabase_or_user';
        return out;
    }

    const title = String(args.title || 'Smarter Poker').slice(0, TITLE_MAX);
    const body = String(args.body || '').slice(0, BODY_MAX);
    const url = args.url || '/hub';
    const event = args.event || null;

    // -- 1. GATE -------------------------------------------------------------
    if (args.force !== true) {
        const gate = await checkGate(supabase, userId, event);
        if (!gate.allowed) {
            out.skipped = true;
            out.reason = gate.reason;
            // Record the suppression so /admin/push-health can distinguish
            // "user opted out" from "we are broken".
            try {
                await supabase.from('push_outbox').insert({
                    recipient_user_id: userId,
                    title,
                    body,
                    url,
                    event,
                    tag: args.tag || null,
                    status: 'skipped',
                    failure_reason: gate.reason,
                    related_entity_id: args.relatedEntityId || null,
                });
            } catch { /* ignore */ }
            return out;
        }
    }

    // -- 2. QUEUE ------------------------------------------------------------
    let outboxId = null;
    try {
        const { data, error } = await supabase
            .from('push_outbox')
            .insert({
                recipient_user_id: userId,
                title,
                body,
                url,
                event,
                tag: args.tag || null,
                icon_url: args.icon || null,
                badge_url: args.badge || null,
                image_url: args.image || null,
                related_entity_id: args.relatedEntityId || null,
                // 'processing', NOT 'pending'. The cron claims on
                // status='pending', so inserting as pending opened a window
                // where a dispatch run fired between this INSERT and the inline
                // send below -- delivering the same push twice. Claiming the row
                // for ourselves up front closes it; if this process dies here,
                // requeue_stuck_push_outbox releases the row after the stale
                // window and the cron picks it up.
                status: 'processing',
                claimed_at: new Date().toISOString(),
            })
            .select('id')
            .maybeSingle();
        if (error) {
            out.reason = `outbox_insert_failed:${error.message}`;
        } else {
            outboxId = data?.id || null;
            out.outboxId = outboxId;
        }
    } catch (e) {
        out.reason = `outbox_insert_threw:${e?.message || e}`;
    }

    // Not configured -- hand the row back to the queue so the dispatch cron
    // drains the backlog the moment VAPID env vars land. It was claimed as
    // 'processing' above, so it must be released explicitly or it would sit
    // until the stale-claim sweep.
    if (!isPushConfigured()) {
        out.reason = 'vapid_not_configured_queued';
        if (outboxId) {
            try {
                await supabase
                    .from('push_outbox')
                    .update({ status: 'pending', claimed_at: null })
                    .eq('id', outboxId);
            } catch { /* the stale sweep is the backstop */ }
        }
        return out;
    }

    // -- 3. DELIVER ----------------------------------------------------------
    const payload = {
        title,
        body,
        url,
        tag: args.tag,
        icon: args.icon,
        badge: args.badge,
        image: args.image,
        requireInteraction: args.requireInteraction,
        actions: args.actions,
        data: { event, outboxId },
    };

    const delivery = await deliverPushNow(supabase, userId, payload);
    out.accepted = delivery.accepted;

    if (outboxId) {
        // NOTE: `attempts` is deliberately NOT written here. That column is
        // owned by claim_push_outbox_batch, which increments it on every claim.
        // Writing attempts:1 from the inline path reset the cron's counter and
        // broke the MAX_ATTEMPTS ceiling, so a permanently failing row could be
        // retried indefinitely.
        //
        // Every update is also scoped to .eq('status','processing') so we only
        // ever finalise the row WE claimed. If the stale sweep has already
        // released it to another runner, our late write is a no-op rather than
        // resurrecting a row that runner is mid-send on.
        try {
            if (delivery.accepted > 0) {
                await supabase
                    .from('push_outbox')
                    .update({ status: 'sent', sent_at: new Date().toISOString() })
                    .eq('id', outboxId)
                    .eq('status', 'processing');
            } else {
                const noSub = delivery.errors.some((e) => e.error === 'no_subscription');
                await supabase
                    .from('push_outbox')
                    .update({
                        // No devices is terminal for THIS send; anything else is
                        // released back to the queue for the cron to retry.
                        status: noSub ? 'skipped' : 'pending',
                        claimed_at: noSub ? undefined : null,
                        failure_reason: noSub
                            ? 'no_subscription'
                            : String(delivery.errors[0]?.error || 'inline_delivery_failed').slice(0, 300),
                    })
                    .eq('id', outboxId)
                    .eq('status', 'processing');
            }
        } catch { /* ignore */ }
    }

    out.sent = delivery.accepted > 0;
    out.reason = out.reason || (out.sent ? 'delivered' : 'queued_for_retry');
    return out;
}

export default { enqueuePush };
