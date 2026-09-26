# Program State

- **Current phase:** 1 of 10
- **Phase name:** Restore Safe Supply And Endless Delivery
- **Status:** Active release; source repairs are implemented, all three production publisher migrations are installed, and exact-candidate integration/publication is in progress
- **Branch:** `agent/codex-reels-supply-20260926/feat/reels-multiverse-supply`
- **Delivery PR:** `#1977` on remote branch `agent/cowork-video-p1/fix/video-reels-integrity-phase-1`
- **Workspace:** `/Volumes/SmarterWork/agent-work/codex-reels-supply-20260926`
- **Candidate revision recovered:** `270d0875be28c91a245a4e50af84ba7b1e244ab0`
- **Protected baseline at latest fetch:** `origin/main` `068c2653a24c4f1a81ef1572c516abf91d2ca9d7`
- **Operation owner:** this task owns source repair, database installation, protected PR completion, Vercel/Open Claw publication, and live verification
- **Next gate:** integrate the latest protected baseline, run exact-candidate checks, publish through PR #1977 and the Workers protected PR route, deploy World Hub/Open Claw/worker changes, and prove managed inventory plus more-than-50 continuation live.

## Policy Receipt

- **Read at:** `2026-09-26T15:06:06.679Z`
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

- Targeted and full local tests/build on the final candidate.
- Horse-video forward-migration ledger/function/policy readback with no new advisor findings.
- Protected PR checks green and squash merge revision recorded.
- Open Claw and World Hub production revisions verified against the merged source.
- Live anonymous and signed-in proof of managed poker, slots, and sports categories, horse/player-author equality, three-page continuation, deep-link recovery, stale storage, and mid-flight retry.

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
