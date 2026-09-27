# Program State

- **Current phase:** 1 of 10
- **Phase name:** Restore Safe Supply And Endless Delivery
- **Status:** Active release; source, database, and worker delivery are green, while World Hub/Open Claw protected publication and live proof remain in progress
- **Branch:** `agent/codex-reels-supply-20260926/feat/reels-multiverse-supply`
- **Delivery PR:** `#1977` on remote branch `agent/cowork-video-p1/fix/video-reels-integrity-phase-1`
- **Workspace:** `/Volumes/SmarterWork/agent-work/codex-reels-supply-20260926`
- **Exact tested source revision:** `b36c0aecc1be4bf515c6a2adc8797ace7fc4aef9` (the checkpoint-only commit that follows does not change runtime source)
- **Protected baseline at latest fetch:** `origin/main` `990be89d230f2072fc50abe173132edb8e9a1e9a`
- **Operation owner:** this task owns source repair, database installation, protected PR completion, Vercel/Open Claw publication, and live verification
- **Next gate:** push the tested candidate to PR #1977, pass current-head protected checks, squash merge, verify Vercel/Open Claw exact-tree publication, run the guarded production publisher, and prove managed inventory plus more-than-50 continuation live.

## Policy Receipt

- **Read at:** `2026-09-27T00:24:51.917Z`
- **Policy version:** `2.9`
- **Manifest SHA-256:** `7663cc909626f7e9966931d27166ad8774addc801f7ad1898a2d7564bc13c378`
- **Owner policy:** `76228d75677eb76ca9dcfbf65fd68ddb7aac3941f61154acc456ae8230a9a4fa`
- **Operating law:** `a8bc3c04dce3354ebdd51a89c0b7d715af3344edcc794d33f6b3ad64506961d5`
- **Hardening standard:** `d5fc451ce5caf6d6b5e64597a13883e1246581678fe53c962339d0a66136993e`
- **Reference index:** `adce89c3f838f2f373cd504a00329d53906404d1dd42a647f672af6c16f95555`
- **Portable/canonical drift check:** passed

## Known Baseline Defects

- The YouTube insert trigger overwrites `video_library` provenance with `youtube`.
- Every new YouTube Reel is queued for a native download regardless of rights.
- The bridge inserts only `social_reels`; the main social feed reads `social_posts`.
- The bridge does not atomically publish or enforce a database idempotency key.
- Poker Reel APIs do not require a poker topic or ready playback state.
- Production health can report green while conversion work is failing.
- Production legacy loaders require `source_post_id`, excluding all 68 YouTube rows and leaving only seven native uploads.
- Production has zero horse video posts/Reels because the global fleet switch is disabled and the hourly route returns a successful skip.
- Production has zero eligible Video Library rows because all 2,171 rows have unknown availability and no embeddability verdict.
- The Social Media canonical carousel stops after one 50-item request and discards continuation.
- The production reader is poker-only; the candidate implements an explicit allowlisted poker, casino-slots, sports, for-you, and following category contract pending protected publication.

## Acceptance Evidence Still Required

- World Hub PR #1977 current-head checks green and protected squash merge revision recorded.
- Vercel and Open Claw production revisions verified against the merged source.
- Guarded production publication/readback with more than 2,000 eligible/feed-visible managed Reels or an explicit per-row rejection ledger.
- Live anonymous and signed-in proof of managed poker, slots, and sports categories, horse/player-author equality, three-page continuation, deep-link recovery, stale storage, mid-flight retry, source attribution, and the protected article reader.

## Evidence Recorded This Run

- Applied `video_library_official_publisher` through the authorized Supabase migration path at `2026-09-26T14:24:07Z`; installed ledger version `20260926142411`.
- Read back the configured official profile, proved `is_horse=false`, proved it has no `content_authors` row, and proved the prior horse publisher is now ineligible.
- Read back all three official-publisher triggers as enabled and all three functions as SECURITY DEFINER with fixed search paths; anonymous/authenticated execution remains revoked.
- Security-advisor counts remained exactly `1,436` and performance-advisor counts remained exactly `1,002` before and after installation, so the migration introduced no new findings.
- Applied the forward-only `video_library_slots_reels` migration through the authorized Supabase path at `2026-09-26T14:33Z`; installed ledger version `20260926143331`.
- Read back all three slots gates, slot topic mapping, official-publisher eligibility, and service-role-only publication grants. The migration changed no social rows; zero slots were exposed before verification.
- Advisor counts again remained exactly `1,436` security (`560` INFO / `876` WARN) and `1,002` performance (`948` INFO / `54` WARN) after the slots migration.
- Focused Node 20 contract run after cursor/category/scheduler changes: 75 passed, 0 failed.
- Focused Node 20 library/slot/Console/collection run: 32 passed, 0 failed.
- Node 20 imported-worker regression after the Supabase 2.112 eager-Realtime change: 8 passed, 0 failed; the maintained worker now supplies an explicit supported `ws` transport.
- Workers exact-source full test run before protected publication: pretest 4 passed and Vitest 471 passed across 63 files.
- The first `horse_video_reels_atomic_publisher` installation attempt at `2026-09-26T15:04:34Z` failed its own post-apply assertion because Supabase default privileges had already granted `service_role` more table/sequence privileges than the contract allows. The transaction rolled back completely: no migration-history row, table, function, semantic row, post, or Reel existed after the failure.
- Corrected the migration to revoke default `service_role` privileges before granting only table `SELECT, INSERT` and sequence `USAGE, SELECT`; the focused migration contract passed 10/10 and the corrected migration SHA-256 is `c884962b29cec2dcd61ab62d5f5e8ced0e4f9c0de8523336091ec05593c5a76f`.
- Applied the corrected `horse_video_reels_atomic_publisher` migration once at `2026-09-26T15:07:46Z`; installed ledger version `20260926150746`. Readback proved one exact SECURITY DEFINER overload, fixed `search_path=public, extensions`, service-role-only execute, RLS enabled with zero browser policies, service-role-only ledger/sequence privileges, all required indexes, both video modes enabled, and zero migration-created semantic rows, posts, or Reels.
- Advisor WARN totals remained unchanged after the horse migration. The new locked ledger intentionally added one INFO `rls_enabled_no_policy` finding and two INFO `unused_index` findings; the table exposes no browser grants or policies and the indexes back the RPC's 30/90-day semantic reuse checks.
- Final adversarial source review repaired category-preserving canonical deduplication, continuation scanning through initially empty/filtered pages, stale/deleted/cross-category Reel reconciliation, counter-update refresh starvation, and composite-RPC live-signature validation. The combined focused Node 20 verification passed 66/66 with zero ESLint errors.
- Freshly reread the canonical and portable policy set, repository instructions, Social Community skill/workflow, protected-file registry, migration safety rules, Video Library metal-frame rule, publication procedure, and this checkpoint after resumption. The owned worktree remains writable, uses the required `Smarter-Poker` identity, and had 37 GiB free at read time.
- Workers PR `#145` passed exact-candidate and protected-main CI, squash-merged as `be7a1dea6aaddd747c62246ccc7e417e1700fbf7`, deployed successfully, and reported the exact merged revision healthy in production. Its horse route has not been invoked yet because the World Hub/Open Claw source remains unpublished.
- The latest audit repaired all-category My/Saved/saved-status loading, slots/sports embed-failure adjudication, and category-preserving Reels share/deep-link construction. Final exact-candidate verification remains in progress.
- The share-to-feed API now reads the authoritative public Reel, ignores hostile client media/caption/topic fields, stores one canonical link wrapper, and converges concurrent requests through the durable publication key. The social feed reopens that canonical Reel and retains the ordinary article-reader path for non-Reel links.
- The command rail now uses canonical mixed-category URLs, while six-month-old `feed=foryou`, `feed=trending`, `feed=following`, and categoryless Reel bookmarks retain safe fallbacks. Mixed viewer loading/empty copy is category-neutral.
- Every viewer mounts at most one active player and warms only the immediately next media resource. The focused menu, stale-bookmark, single-carousel, hostile-share, and player-window run passed 56/56; the final post-copy focused run passed 45/45.
- The complete Phase 1 maintained suite passed 278 Node, 25 Vitest, and 15 Python tests (318 total) after the final player-window and route repairs. Current-main integration, full lint/build, browser proof, hosted checks, publication, and live behavior proof remain pending.
- Workers follow-up PR `#146` passed exact-source tests and protected CI, squash-merged as `664c663f8ab4a3acd24789978a8a76bb600cc38f`, deployed in run `36275731992`, and reported that exact merged revision healthy in production. The earlier PR #145 evidence remains historical; #146 is the current worker publication for Phase 1.
- Integrated protected World Hub main `990be89d230f2072fc50abe173132edb8e9a1e9a`, then repaired canonical category navigation, source attribution, publication visibility telemetry, hostile route/auth recovery, stale-cache cleanup after hydration, and query-only page preservation for mid-flight category drops.
- Final local hostile-state browser proof on desktop `1440x900` and mobile `393x852` passed: all canonical category/menu destinations were present, one active YouTube player was retained while advancing, slots displayed the responsible-gaming notice, stale Reel localStorage was removed, stale auth could not enter Following, old `feed=trending&id=...` bookmarks retained both values while adding `category=for-you`, and a synthetic 503 category switch kept the mounted Reel plus an explicit retry.
- Exact source revision `b36c0aecc1be4bf515c6a2adc8797ace7fc4aef9` passed the maintained Phase 1 suite with 284 Node, 25 Vitest, and 20 Python tests (329 total), repository-wide ESLint across 4,511 files in 112 bounded batches, `git diff --check`, and the complete Node 24 production build. The build also passed every bundled cross-product law suite, generated 504/504 static pages, and passed the Personal Assistant performance budget. Local static generation logged its existing fail-soft unregistered external API-key notice because the isolated worktree does not carry production credentials; the build exited zero and generated every page.
- Reconciled the concurrently advanced PR branch without force-pushing. Its three remote-only commits were GitHub merges of already-integrated protected-main revisions; `git merge-tree` completed without conflicts and produced a tree byte-identical to the locally qualified candidate. Merge commit `68d7be607d7173630f4f6c0fe0ed63b0bdd4726b` has identical first-parent and result tree `88eb53f112a5e99dd90d7700bbdfd791a79872fd`, so the recorded source, lint, build, and hostile-browser evidence remains applicable.
