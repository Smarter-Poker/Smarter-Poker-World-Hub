# Phase 1 Plan

## Wave 1: Contract And Tests

- [x] Add failing migration contract tests for canonical fields, rights gating, kill switch, and atomic publication.
- [x] Add failing bridge tests for pagination, poker-only validation, RPC publication, and explicit author identity.
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
- [x] Publish only allowed poker library types in this phase.
- [x] Update full-screen Reels, embedded Reels, and public Reels APIs to use canonical topic and playback fields.
- [x] Keep legacy deep links and old rows playable during transition.

## Wave 4: Verification And Release

- [ ] Run targeted tests and coverage for all new logic.
- [ ] Run typecheck, lint, complete production build, and secret/stub/diff checks.
- [ ] Dry-run the migration and execute its assertions.
- [ ] Commit with the required Smarter-Poker identity and push without bypassing hooks.
- [ ] Confirm the PR, CI result, merge, migration ledger, and production SHA.
- [ ] Prove one canonical test publication is created once, linked on both tables, poker-filtered, embed-ready, and produces no transcode job.
- [ ] Prove replay, stale link, kill-switch, and simulated mid-flight failure behavior.

## Phase 1 Acceptance Gates

1. A library video publication creates exactly one Reel and one linked social post.
2. Replaying or racing the request returns the existing publication.
3. A third-party YouTube publication creates no transcode job.
4. Owned or licensed processing remains explicitly available for Phase 6.
5. The new Reel appears on poker Reels surfaces and in the main social feed.
6. Slots and unrelated sports cannot enter poker-only Reels responses.
7. A disabled publication switch blocks writes without partial rows.
8. Old Reel IDs and legacy rows remain playable throughout the transition.
9. CI is green, the PR is merged, the migration is applied, and production serves the merged SHA.
