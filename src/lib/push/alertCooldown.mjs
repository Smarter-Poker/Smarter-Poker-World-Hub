import { ALERT_OWNER_ID } from './operational-push-routing.mjs';

/**
 * Which recipients were already told about `title` inside the cooldown window.
 *
 * A persistent push-health problem is reported once per window, not once per
 * run. "Already told" has two homes:
 *
 *   - public.notifications, for every recipient;
 *   - public.operational_notification_destinations, for the owner account
 *     only. Its operational notices are delivered to the Production Alerts
 *     task alone (store-only delivery, Club Arena migration 20260927235053),
 *     so the personal row the cooldown used to find is never written, and
 *     reading only the inbox would re-send the owner's copy on every run.
 *     A routed copy counts only once its receipt is recorded
 *     (inbox_event_id set): a pending one has not reached the task yet.
 *
 * The destinations table is read only when the owner is in the list and his
 * inbox has not already answered for him. Nobody else can have a row there
 * (its recipient_user_id CHECK admits the owner account only).
 *
 * Fails OPEN, scoped to the lookup that failed, so a lookup failure never
 * silences an alert and never re-sends one it did not concern:
 *   - the inbox read fails -> every recipient is returned;
 *   - the destinations read fails -> the owner is returned, and every other
 *     recipient keeps the inbox verdict.
 *
 * Needs the service-role client push-health uses (the destinations table is
 * readable by service_role only).
 *
 * The owner branch is not reached from push-health any more (2026-09-28).
 * push-health, the only caller, removes the owner account from both lists
 * first (personalRecipients in src/lib/push/pushHealthOperationalAlerts.mjs):
 * what it finds is recorded for the Production Alerts task as store episodes,
 * and those episodes are his once-per-window rule. The branch is kept on
 * purpose: it is still correct for any caller that does pass him, and
 * push-health-alert-cooldown.test.mjs pins it, so removing it would mean
 * deleting those tests.
 */
export async function filterRecentlyAlerted(supabase, userIds, title, sinceIso) {
    if (!userIds.length) return [];
    let told;
    try {
        const { data, error } = await supabase
            .from('notifications')
            .select('user_id')
            .in('user_id', userIds)
            .eq('title', title)
            .gte('created_at', sinceIso);
        if (error || !Array.isArray(data)) return userIds;
        told = new Set(data.map((n) => n.user_id));
    } catch {
        return userIds;
    }
    if (userIds.includes(ALERT_OWNER_ID) && !told.has(ALERT_OWNER_ID)
        && await ownerRoutedCopyWasReceipted(supabase, title, sinceIso)) {
        told.add(ALERT_OWNER_ID);
    }
    return userIds.filter((id) => !told.has(id));
}

// True only when a routed original with this title reached the Production
// Alerts task inside the window. Any failure answers false, so the owner is
// alerted: the routed read can only ever withhold his alert on evidence.
async function ownerRoutedCopyWasReceipted(supabase, title, sinceIso) {
    try {
        const { data, error } = await supabase
            .from('operational_notification_destinations')
            .select('recipient_user_id')
            .eq('recipient_user_id', ALERT_OWNER_ID)
            .eq('original_notification->>title', title)
            .gte('captured_at', sinceIso)
            .not('inbox_event_id', 'is', null)
            .limit(1);
        if (error || !Array.isArray(data)) return false;
        return data.some((row) => row?.recipient_user_id === ALERT_OWNER_ID);
    } catch {
        return false;
    }
}
