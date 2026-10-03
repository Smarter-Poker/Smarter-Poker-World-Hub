# Phase 3 Plan: Source Registry And High-Volume Ingestion

## Confirmed Baseline

Phase 2 is protected-merged and live at `5e4b74d749e251089a9541823d1556ebc87bf589`. The canonical feed contains 2,212 playable Reels, but Video Library discovery still reads a hardcoded Python creator array through `yt-dlp`. That path has no durable provider cursor, no quota budget, incomplete source-health timestamps, one insert per candidate, and no operator control plane. An older `content_sources` table exists, but it does not yet own Video Library ingestion.

## Wave 1: Registry Authority

1. Extend `content_sources` into the operator-owned YouTube ingestion registry without breaking its current poker/news/horse consumers.
2. Store stable channel IDs, uploads-playlist IDs, lifecycle, cadence, cursor, topic, ingestion mode, region/category, rights/playback defaults, expected yield, and independent health timestamps.
3. Add service-only run and quota ledgers plus an atomic source-observation RPC.
4. Seed current poker, gambling/slots, and official sports sources; preserve current rows and disable no source implicitly.

## Wave 2: Supported Incremental Ingestion

1. Replace the hardcoded creator loop with registry reads.
2. Use YouTube Data API channel and uploads-playlist calls for creator supply, and `videos.list(chart=mostPopular, videoCategoryId=17)` for regional sports discovery.
3. Stop at persisted high-water cursors, batch metadata and database writes, and default every third-party asset to embed-only rights.
4. Enforce a persisted daily quota budget and fail closed before exhaustion.

## Wave 3: Operator Controls And Health

1. Add an admin-only source registry API with list, health summary, create, and patch operations.
2. Add a mobile-first operator console for lifecycle, cadence, yield, cursor, and failure inspection.
3. Report candidate, qualified, inserted, duplicate, rejected, failed, and quota-unit counts by topic and source family.
4. Alert through the existing durable run-report path when freshness or yield thresholds fail.

## Wave 4: Verification And Release

1. Rehearse the additive migration on PostgreSQL and run source/API/runtime contracts.
2. Prove cursor replay, quota refusal, batching, category isolation, disabled-source exclusion, and partial-provider failure handling.
3. Install the migration once with preflight and readback.
4. Protected-merge, publish both World Hub and Open Claw, run one bounded ingestion cycle, and verify registry health plus newly qualified rows live.

## Phase 3 Acceptance Gates

- No Video Library discovery source is compiled into the scraper.
- Every active creator source has a stable channel ID or is visibly pending/quarantined; sports chart sources persist region/category/retrieval state.
- Incremental replay creates no duplicate canonical asset and advances a cursor only after its batch is committed.
- Provider usage cannot exceed the persisted daily quota budget.
- Configured active-source daily capacity is at least 500 qualified candidates across poker, casino/slots, and sports.
- Operators can inspect and change source lifecycle/cadence without a code release.
- Source health distinguishes last check, success, new item, failure streak, empty success, quota stop, and disabled state.
- Focused tests, required repository checks, migration readback, protected merge, exact production identities, bounded live ingestion, and affected-behavior proof all pass.
