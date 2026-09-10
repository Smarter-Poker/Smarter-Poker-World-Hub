# Notification Feed Recovery

The Club Arena Phase 12 end-to-end review found six reproducible server defects: the unified feed ignored four required Supabase read errors; stored page-follow identifiers could alter its raw service-role filter; and page mark-all selected an unordered 100 rows, omitting the latest notifications shown in the feed.

The feed now refuses required read errors before caching or returning success. Its page-follow filter uses the same allowed identifier shapes as the existing poker notifications route. Mark-all orders newest first within its existing bound. Optional profile enrichment and the shared destination resolver retain their behavior.

The actual API handlers reproduced all six failures in __tests__/notification-feed-recovery.test.mjs. After repair, that suite plus notification-copy and notification-route passed 46 tests. Tests also preserve authenticated account filtering, anonymous refusal, confirmed empty feeds, and explicit fresh-read cache bypass.

Club Arena uses the existing bust=1 feed option with browser no-store and the existing authenticated social/page read APIs. It waits for both owners before reconciling partial mark-all refusal. No new API, queue, cron, or schema is required in World Hub.

A separate Club Arena migration restores the missing notifications publication membership caused by September 8's publication SET TABLE. Version 20260910003525 was applied once and verified with unchanged owner-only RLS and unrelated publication column lists.

Release status: implementation and targeted tests verified; production adoption must be verified from /api/health after normal auto-PR, CI, autopilot, and Vercel publication. Physical-device delivery is not established by handler tests.

Required CI caught a wiring omission in the first push: the new handler suite was not reachable from CHECK 8. It is now imported by the existing CI test entry point, preserving the reachability guard and running the actual regressions on future changes. No workflow or guard was weakened.
