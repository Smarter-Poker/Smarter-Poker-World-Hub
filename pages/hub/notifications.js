/**
 * NOTIFICATIONS PAGE — the `/hub/notifications` route
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * The feed itself moved to `src/components/notifications/HubNotificationsFeed`
 * on 2026-09-02. It was moved, not rewritten: the extraction was done with
 * `sed` rather than by retyping, so the fetching, the display, the click
 * handlers and the routing are byte-for-byte what they were, and only the
 * import depth changed. `.agent/workflows/social-feed-protection.md` was
 * followed for the change; the reasoning and the four deliberate additions are
 * documented in the component's own header.
 *
 * WHY IT MOVED
 * ───────────────────────────────────────────────────────────────────────────
 * Dan, 2026-09-02: "IT SHOULD CREATE A 'FULL SCREEN POP UP' SO YOU STAY ON THE
 * PAGE YOU WERE ON." The popup was achieving that by FRAMING this page, so
 * tapping the bell booted a second Next.js application on top of the warm one —
 * fresh document, the Next runtime, _app, hydration, a second Supabase client,
 * a second realtime subscription — all serial, all behind a spinner, before the
 * feed request could start. As a component there is no second boot: the popup
 * renders it directly.
 *
 * THIS ROUTE STAYS, AND IT IS NOT A REDIRECT
 * ───────────────────────────────────────────────────────────────────────────
 * Push payloads, emails, bookmarks, `sitemap.xml`, and cmd-clicking any of the
 * bells all resolve here. A route that redirected into a popup would be a dead
 * link to every one of them. The page and the popup are two doors onto one
 * room — the same component, rendered twice, which is also what keeps Dan's
 * "we need ONE DISPLAY" (2026-08-25) true.
 */

import HubNotificationsFeed from '../../src/components/notifications/HubNotificationsFeed';
import { HubErrorBoundary } from '../../src/components/ui/HubErrorBoundary';

export default function NotificationsPageWithBoundary() {
    return (
        <HubErrorBoundary name="Notifications">
            <HubNotificationsFeed />
        </HubErrorBoundary>
    );
}
