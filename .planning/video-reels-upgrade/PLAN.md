# Phase 1 Plan: Restore Safe Supply And Endless Delivery

## Confirmed Production Failure

- Production has 2,397 poker clips, 8,936 sports clips, and 2,171 Video Library rows, but no managed supply currently reaches the public canonical Reels feed.
- The legacy feed admits only rows with `source_post_id`, which excludes all 68 existing YouTube Reels and leaves seven native personal uploads.
- Horse video supply is zero because the global content-engine switch is off and the current route reports a successful skip.
- The Video Library publisher was green-but-skipped through the disabled fleet route. The official publisher and slots eligibility migrations are now installed; the independent Open Claw route and bounded production backfill still require merged-source publication and live proof.
- The Social Media carousel fetches at most 50 canonical rows once and discards `next_cursor`.
- The canonical candidate feed currently rejects slots and sports by design, so category expansion needs an explicit allowlisted API contract rather than removal of safety gates.

## Wave 1: Contract And Tests

- [x] Add failing migration contract tests for canonical fields, rights gating, kill switch, and atomic publication.
- [x] Add failing bridge tests for pagination, allowlisted topic validation, RPC publication, and explicit author identity.
- [x] Add failing feed tests for poker topic, ready playback, canonical-only results, and backward-compatible deep links.

## Wave 2: Database Foundation

- [x] Add `origin_type`, `playback_type`, `topic`, `rights_status`, `source_asset_id`, `canonical_asset_key`, and duplicate lineage fields.
- [x] Replace the YouTube intercept so it preserves provenance and defaults third-party playback to embed-only.
- [x] Gate native jobs on explicit owned or licensed rights.
- [x] Add a global library-Reel publication setting and fail-closed RPC check.
- [x] Add a canonical partial unique index for library publications.
- [x] Add `publish_video_library_reel` with transaction-level idempotency and post/Reel assertions.
- [x] Backfill canonical fields without deleting engagement records.

## Wave 3: Publisher And Feed Wiring

- [x] Replace direct bridge inserts with the publication RPC.
- [x] Require an explicit system author; remove unrelated-profile fallback.
- [x] Page every source table and validate every candidate.
- [x] Publish only explicitly allowed poker and casino-slots library types in this phase.
- [x] Update full-screen Reels, embedded Reels, and public Reels APIs to use canonical topic and playback fields.
- [x] Keep legacy deep links and old rows playable during transition.

## Wave 4: Verification And Release

- [x] Run targeted tests and coverage for all new logic.
- [x] Run typecheck, lint, complete production build, and secret/stub/diff checks.
- [x] Dry-run the migration and execute its assertions.
- [x] Commit with the required Smarter-Poker identity and push without bypassing hooks.
- [x] Confirm the PR, CI result, merge, migration ledger, and production SHA.
- [x] Prove one canonical test publication is created once, linked on both tables, poker-filtered, embed-ready, and produces no transcode job.
- [x] Prove replay, stale link, kill-switch, and simulated mid-flight failure behavior.

## Wave 5: Restore Managed Supply

- [x] Install and read back the official publisher and slots eligibility migrations after the Tier 2 preflights.
- [x] Route the existing Open Claw Video Library job to the verified atomic publisher independently of `content_settings.engine_enabled`.
- [x] Verify availability and embeddability before publication; do not publish unknown library rows.
- [x] Add an independently controlled, approved `/cron/horse-video-reels` worker route and Open Claw schedule while leaving unrelated generated/text modes disabled.
- [x] Record positive and negative YouTube verdicts in the shared verifier contract before a horse video becomes public.
- [x] Preserve horse identity as ordinary author identity without exposing an internal horse label in the viewer.
- [x] Backfill in bounded, replay-safe pages until at least 2,000 unique verified candidates are public or every remaining candidate has a recorded rejection reason.

## Wave 6: Endless Multi-Topic Social Reels

- [x] Replace poker-only client/server naming and filtering with a validated category contract: `for-you`, `poker`, `casino-slots`, `sports`, and `following`.
- [x] Keep category-specific topic isolation and all public-ready, rights, availability, moderation, deletion, and attribution gates.
- [x] Store and consume `next_cursor` in the Social Media carousel and load the next page within three Reels of the boundary.
- [x] Preserve the active Reel while appending or merging realtime first-page changes.
- [x] Abort stale requests, prevent cursor loops, retain the current list on a mid-flight failure, and retry only by explicit user action.
- [x] Keep the mounted media window bounded to previous/current/next and prevent offscreen audio.
- [x] Add regression fixtures for 2,000 candidates, three-page continuation, stale storage, old deep links, and interrupted continuation.

## Phase 1 Acceptance Gates

1. A library video publication creates exactly one Reel and one linked social post.
2. Replaying or racing the request returns the existing publication.
3. A third-party YouTube publication creates no transcode job.
4. Owned or licensed processing remains explicitly available for Phase 6.
5. The new Reel appears on poker Reels surfaces and in the main social feed.
6. Poker, Casino And Slots, Sports, and Following responses are category-correct; For You may mix only explicitly eligible categories.
7. A disabled publication switch blocks writes without partial rows.
8. Old Reel IDs and legacy rows remain playable throughout the transition.
9. CI is green, the PR is merged, the migration is applied, and production serves the merged SHA.
10. The Social Media viewer crosses 50 unique Reels and at least three cursor pages without closing.
11. At least 2,000 unique verified Reels are publicly eligible, or every unfilled candidate has an explicit verifier, rights, moderation, or deduplication reason.
12. A disabled global horse content engine does not disable the separately approved video supply mode.
