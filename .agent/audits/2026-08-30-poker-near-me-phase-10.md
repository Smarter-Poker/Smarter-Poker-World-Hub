# Poker Near Me Phase 10 — Directory Operations, SSR, and Performance

Date: 2026-08-30
Branch: `agent/codex-pnm10/feat/pnm-phase10`

## Scope

This phase closes the remaining operational and first-paint gaps after the shared Poker Near Me visual system was already propagated across lobby, discovery, venue detail, events, community, saved/history, and location families.

## Route families affected

- Dynamic Poker Near Me tabs: `/hub/poker-near-me/[pnmTab]` (server-rendered first venue directory plus client refresh).
- Location index: `/hub/poker-near-me/in`.
- State landing pages: `/hub/poker-near-me/in/[state]`.
- City landing pages: `/hub/poker-near-me/in/[state]/[city]`.
- Venue detail: `/hub/venues/[id]` (canonical retirement redirect).
- Protected operator console: `/admin/venue-integrity`.
- Public and protected venue APIs.

The current production registry yields 41 state pages and 376 city pages. With the location index, dynamic discovery tab family, venue profiles, and the operator console, more than 1,000 concrete URLs inherit the affected shared systems without one-off route patches.

## Database operations

Applied and ledgered before dependent application code:

- `20260830210000_pnm_phase10_directory_operations.sql`
- `20260830211500_pnm_phase10_duplicate_state_refresh.sql`

Additive changes:

- Indexed `venue_location_integrity_state` for server-filtered location, completeness, freshness, and duplicate signals.
- Immutable source-enrichment and duplicate-retirement logs.
- Revision-safe, service-role-only enrichment and retirement RPCs.
- Safe duplicate retirement with `canonical_venue_id`; no referenced history is deleted or rewritten.
- Active-directory, coordinate, canonical, queue, issue-array, and full-text search indexes.
- Exact polygon synchronization in application code after the SQL invalidation/backfill pass.

Production exact-sync result: 603 source rows synchronized. Active public queue: 573 records, 333 actionable, 3 boundary conflicts, 80 missing coordinates, 5 boundary-unavailable, 204 incomplete, 255 stale, and 0 current normalized duplicate rows.

## Performance and rendering

- Added `view=directory`, an explicit-projection endpoint that avoids the rich endpoint's nationwide schedule/social enrichment work.
- Final warm production-artifact directory response: 0.36s and 503 KB, versus the audited production rich response at about 11.47s and 1.198 MB.
- Final warm server-rendered Poker Near Me tab: 0.19s locally.
- Final warm location pages: 0.008–0.010s locally for the index, Nevada, and Las Vegas representatives.
- State/city SSR no longer makes an internal HTTP round trip.
- The first 24 venue records and an eight-room cinematic directory rail are server-rendered, including venue links and ItemList structured data.
- Static snapshot degradation remains available for location-page database failures.
- Synthetic social-page identifiers are excluded from integer venue-review aggregation in both the discovery client and API boundary.

## Operational controls

- Server-side issue filters, search, ordering, counts, and pagination.
- Exact rescan workflow.
- Boundary-verified, optimistic-concurrency location correction.
- Source URL, confidence, before/after evidence, and immutable enrichment history.
- Safe canonical retirement and permanent old-ID redirects.
- All mutations remain platform-admin-only and MFA-gated.
- The authenticated test account correctly receives `403 requiresMfa` for writes because it is not enrolled; no bypass was added.

## Verification

- Phase 8–10 focused Node suites: 12/12 green.
- New Phase 10 contract suite: 5/5 green.
- Repository prebuild: 491/491 green.
- Production-artifact Playwright coverage: 6/6 green across desktop and mobile for directory projection, SSR HTML, location index/state/city, admin queue, MFA refusal, and exact 390×844 overflow.
- Required production build path: platform bins pruned, Next patches applied, webpack optimized build completed.
- Both migrations recorded once in `supabase_migrations.schema_migrations`.

Known unrelated build warnings retained: Next middleware/Edge deprecations and the experimental localStorage warning during static generation.
