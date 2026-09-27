// A pre-destination feed can contain retained operational originals. Do not
// paint that cached personal list after the destination cutover.
import { isOwnerOperationalRow } from './notifications/ownerOperationalClassifier.mjs';

const CACHE_VERSION = 4;
const CACHE_MAX_AGE_MS = 300_000;

// `/api/notifications/feed` reads from the `personal_notifications` view,
// which already excludes the owner's routed operational originals (its own
// WHERE clause, independent of role/RLS-bypass — see
// supabase/components/owner-operational-notification-destination.sql). But
// two components subscribe to RAW `postgres_changes` INSERT/UPDATE events on
// `public.notifications` instead (src/components/notifications/
// HubNotificationsFeed.jsx, src/hooks/useUnreadCount.jsx), and paint or count
// whatever payload the socket delivers without ever calling that view or the
// feed API. Whether Supabase Realtime honours the table's RESTRICTIVE
// `personal_notification_destination` policy for every one of those payloads
// is exactly the kind of provider behaviour CLAUDE.md 10.86 says never to
// take on faith. This filter is the client-side backstop: even if a routed
// operational row's INSERT reaches the socket anyway, it must never be
// painted into the owner's own feed. `userId` is required so a non-owner's
// identically-typed row (there is no such thing today, but this must not
// silently start hiding a normal customer's own financial_incident-shaped
// row if one is ever added) is never affected.
export function isVisibleNotification(row, userId) {
    return !!row && row.type !== 'accounting_invoice_detail' && !isOwnerOperationalRow(userId, row);
}

export function notificationCache(rows, userId, now = Date.now()) {
    if (!userId) return null;
    const visible = rows.filter((row) => isVisibleNotification(row, userId)).slice(0, 30);
    return JSON.stringify(visible.map((row, index) => index === 0 ? {
        ...row, _cache_ts: now, _cache_user: userId, _cache_version: CACHE_VERSION,
    } : row));
}

export function readNotificationCache(raw, userId, now = Date.now()) {
    if (!raw || !userId) return null;
    try {
        const rows = JSON.parse(raw);
        const first = Array.isArray(rows) ? rows[0] : null;
        const age = now - first?._cache_ts;
        if (!first || first._cache_version !== CACHE_VERSION || first._cache_user !== userId ||
            !Number.isFinite(age) || age < 0 || age >= CACHE_MAX_AGE_MS) return null;
        return rows.filter((row) => isVisibleNotification(row, userId));
    } catch { return null; }
}
