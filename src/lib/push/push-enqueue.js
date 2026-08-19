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
import {
    eventToTypeKey, pushTypeAllowed,
    legacyPrefAllowed, LEGACY_PREF_COLUMNS,
    isWithinQuietHours, isUrgentType,
} from './push-prefs';
import { isPushConfigured } from './web-push';

const TITLE_MAX = 120;
const BODY_MAX = 500;

/**
 * Read the gate. Returns { allowed, reason }.
 *
 * DEFAULT-ON: a user with no notification_preferences row is ALLOWED. Only an
 * explicit opt-out suppresses. 990 existing profiles have never touched the
 * settings page and must still get notified.
 */
async function checkGate(supabase, userId, event) {
    const key = eventToTypeKey(event);
    const urgent = isUrgentType(key);

    try {
        // Both preference tables in one round trip. `notification_preferences`
        // is the new per-type store; `user_notification_preferences` is the
        // legacy table that /hub/settings has always written. Honouring only
        // one of them silently breaks a promise the UI made to the user.
        const [{ data, error }, legacyRes] = await Promise.all([
            supabase
                .from('notification_preferences')
                .select('push_enabled, mute_all, push_type_prefs, quiet_hours_start, quiet_hours_end, quiet_hours_tz, daily_push_cap')
                .eq('user_id', userId)
                .maybeSingle(),
            supabase
                .from('user_notification_preferences')
                .select(['user_id', ...LEGACY_PREF_COLUMNS].join(','))
                .eq('user_id', userId)
                .maybeSingle(),
        ]);
        const legacyRow = legacyRes?.data || null;

        if (error) {
            // A read failure must not silence the user.
            console.warn('[push-enqueue] prefs read failed, defaulting to allow:', error.message);
            return { allowed: true, reason: 'prefs_read_failed_default_allow' };
        }
        if (!data) {
            // No new-style row yet, but a legacy opt-out must still be honoured.
            if (!legacyPrefAllowed(legacyRow, key)) {
                return { allowed: false, reason: `legacy_disabled:${key}` };
            }
            return { allowed: true, reason: 'no_prefs_row_default_allow' };
        }

        if (data.mute_all === true) return { allowed: false, reason: 'mute_all' };
        if (data.push_enabled === false) return { allowed: false, reason: 'push_disabled' };

        if (!pushTypeAllowed(data.push_type_prefs, key)) {
            return { allowed: false, reason: `type_disabled:${key}` };
        }
        if (!legacyPrefAllowed(legacyRow, key)) {
            return { allowed: false, reason: `legacy_disabled:${key}` };
        }

        // Quiet hours and the daily cap are courtesy limits, not consent.
        // Genuinely time-critical pushes (a ringing call, a seat about to be
        // forfeited, a tournament starting) pierce both -- suppressing those
        // would make the feature actively harmful.
        if (!urgent && isWithinQuietHours(data)) {
            return { allowed: false, reason: 'quiet_hours' };
        }

        const cap = Number(data.daily_push_cap || 0);
        if (!urgent && cap > 0) {
            const since = new Date(Date.now() - 86400_000).toISOString();
            const { count } = await supabase
                .from('push_outbox')
                .select('id', { count: 'exact', head: true })
                .eq('recipient_user_id', userId)
                .eq('status', 'sent')
                .gte('sent_at', since);
            if ((count || 0) >= cap) {
                return { allowed: false, reason: `daily_cap_reached:${cap}` };
            }
        }

        return { allowed: true, reason: 'allowed' };
    } catch (e) {
        console.warn('[push-enqueue] gate threw, defaulting to allow:', e?.message || e);
        return { allowed: true, reason: 'gate_error_default_allow' };
    }
}

/**
 * @param {object} supabase service-role Supabase client
 * @param {object} args { userId, title, body, url, event, tag, icon, badge,
 *                        requireInteraction, actions, relatedEntityId, force }
 */
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
                related_entity_id: args.relatedEntityId || null,
                status: 'pending',
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

    // Not configured -- leave the row pending. The moment VAPID env vars land,
    // the dispatch cron drains the backlog instead of it being lost.
    if (!isPushConfigured()) {
        out.reason = 'vapid_not_configured_queued';
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
        requireInteraction: args.requireInteraction,
        actions: args.actions,
        data: { event, outboxId },
    };

    const delivery = await deliverPushNow(supabase, userId, payload);
    out.accepted = delivery.accepted;

    if (outboxId) {
        try {
            if (delivery.accepted > 0) {
                await supabase
                    .from('push_outbox')
                    .update({ status: 'sent', sent_at: new Date().toISOString(), attempts: 1 })
                    .eq('id', outboxId);
            } else {
                const noSub = delivery.errors.some((e) => e.error === 'no_subscription');
                await supabase
                    .from('push_outbox')
                    .update({
                        status: noSub ? 'skipped' : 'pending',
                        attempts: 1,
                        failure_reason: noSub
                            ? 'no_subscription'
                            : String(delivery.errors[0]?.error || 'inline_delivery_failed').slice(0, 300),
                    })
                    .eq('id', outboxId);
            }
        } catch { /* ignore */ }
    }

    out.sent = delivery.accepted > 0;
    out.reason = out.reason || (out.sent ? 'delivered' : 'queued_for_retry');
    return out;
}

export default { enqueuePush };
