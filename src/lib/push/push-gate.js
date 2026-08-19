/**
 * push-gate.js -- SERVER ONLY. The single preference gate, batched.
 *
 * WHY THIS MODULE EXISTS
 * The gate used to live privately inside push-enqueue.js, which meant it ran
 * only on the inline path. Anything that reached push_outbox another way --
 * including the DB trigger that mirrors every `notifications` row -- was
 * delivered with NO preference check at all. A user with push switched off
 * would still have been pushed.
 *
 * It is also the wrong moment to decide. A row can sit in the outbox for
 * minutes (or hours, after an incident). Evaluating consent at SEND time, not
 * at QUEUE time, means a user who mutes at 22:00 is not pushed by a row that
 * was queued at 21:58.
 *
 * Everything here is batched: one query for N recipients, then pure in-memory
 * decisions. The dispatch cron gates up to 100 rows per run and must not turn
 * that into 200 round trips.
 */

import {
    eventToTypeKey, pushTypeAllowed,
    legacyPrefAllowed, LEGACY_PREF_COLUMNS,
    isWithinQuietHours, isUrgentType, isDiagnosticEvent,
} from './push-prefs';

/**
 * Load both preference tables for a set of users in two queries total.
 * @returns {Promise<Map<string, { prefs: object|null, legacy: object|null }>>}
 */
export async function loadGateContext(supabase, userIds) {
    const ids = Array.from(new Set((userIds || []).filter(Boolean)));
    const ctx = new Map();
    if (!supabase || ids.length === 0) return ctx;

    const [prefsRes, legacyRes] = await Promise.all([
        supabase
            .from('notification_preferences')
            .select('user_id, push_enabled, mute_all, push_type_prefs, quiet_hours_start, quiet_hours_end, quiet_hours_tz, daily_push_cap')
            .in('user_id', ids),
        supabase
            .from('user_notification_preferences')
            .select(['user_id', ...LEGACY_PREF_COLUMNS].join(','))
            .in('user_id', ids),
    ]);

    // A failed read must not silence anyone. Missing context = default-allow,
    // which is the same posture the per-user gate has always taken.
    const prefsById = new Map((prefsRes?.data || []).map((r) => [r.user_id, r]));
    const legacyById = new Map((legacyRes?.data || []).map((r) => [r.user_id, r]));
    for (const id of ids) {
        ctx.set(id, { prefs: prefsById.get(id) || null, legacy: legacyById.get(id) || null });
    }
    return ctx;
}

/**
 * Pure decision. No IO, so it is trivially testable.
 * The daily cap is NOT evaluated here -- it needs a count query. Callers that
 * care about it pass `sentToday`.
 *
 * @returns {{ allowed: boolean, reason: string }}
 */
export function gateDecision({ prefs, legacy } = {}, event, opts = {}) {
    const key = eventToTypeKey(event);
    // Diagnostics count as urgent for courtesy limits: a "Send Test" swallowed
    // by quiet hours reports a broken subscription that is perfectly healthy.
    const urgent = isUrgentType(key) || isDiagnosticEvent(event);

    if (!prefs) {
        // No new-style row, but a legacy opt-out must still be honoured.
        if (!legacyPrefAllowed(legacy, key)) return { allowed: false, reason: `legacy_disabled:${key}` };
        return { allowed: true, reason: 'no_prefs_row_default_allow' };
    }

    if (prefs.mute_all === true) return { allowed: false, reason: 'mute_all' };
    if (prefs.push_enabled === false) return { allowed: false, reason: 'push_disabled' };
    if (!pushTypeAllowed(prefs.push_type_prefs, key)) return { allowed: false, reason: `type_disabled:${key}` };
    if (!legacyPrefAllowed(legacy, key)) return { allowed: false, reason: `legacy_disabled:${key}` };

    if (!urgent && isWithinQuietHours(prefs, opts.now)) {
        return { allowed: false, reason: 'quiet_hours' };
    }

    const cap = Number(prefs.daily_push_cap || 0);
    if (!urgent && cap > 0 && typeof opts.sentToday === 'number' && opts.sentToday >= cap) {
        return { allowed: false, reason: `daily_cap_reached:${cap}` };
    }

    return { allowed: true, reason: 'allowed' };
}

/** True when this decision needs a sentToday count to be complete. */
export function needsDailyCount({ prefs } = {}, event) {
    if (!prefs) return false;
    const key = eventToTypeKey(event);
    if (isUrgentType(key) || isDiagnosticEvent(event)) return false;
    return Number(prefs.daily_push_cap || 0) > 0;
}

/** Rolling-24h count of pushes actually delivered to a user. */
export async function countSentToday(supabase, userId) {
    try {
        const since = new Date(Date.now() - 86400_000).toISOString();
        const { count } = await supabase
            .from('push_outbox')
            .select('id', { count: 'exact', head: true })
            .eq('recipient_user_id', userId)
            .eq('status', 'sent')
            .gte('sent_at', since);
        return count || 0;
    } catch {
        return 0; // fail open
    }
}

export default { loadGateContext, gateDecision, needsDailyCount, countSentToday };
