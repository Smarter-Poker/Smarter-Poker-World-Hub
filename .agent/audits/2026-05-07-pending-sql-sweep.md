# Audit: pending SQL sweep (2026-05-07)

**Run by:** Cowork Claude
**Trigger:** Dan: "make sure you've pushed and published anything pending and written any and all sql before moving on"
**Outcome:** 2 migrations applied, 5 confirmed no-ops, 1 confirmed superseded

## Verification of Antigravity's prior work

- ✅ Production `/api/health` serves SHA `5d477c63b4` — local HEAD matches.
- ✅ `git log` confirms commit `8d7d3da4c5` "fix(social-feed): FeedVideoPoster — self-healing thumbnail tile" landed on main.
- ✅ Working tree clean. Antigravity's stash-pop restored the parked WIP successfully (those changes are now committed in subsequent merges).
- The handoff `.agent/handoffs/2026-05-07-ship-thumbnail-poster-fix.md` was executed end-to-end as written.

## Pending SQL audit — 7 migrations on disk not in DB

I cross-referenced `ls supabase/migrations/2026050[67]*.sql` against `SELECT name FROM supabase_migrations.schema_migrations WHERE version LIKE '2026050%'`. Seven file names had no obvious applied counterpart. I queried the actual DB state for each before deciding to apply.

| # | Disk file | DB state check | Decision |
|---|---|---|---|
| 1 | `20260506000000_reencode_low_quality_reels.sql` | 2,372 low-quality YT reels still in `media_status='ready'` on Supabase storage | **APPLY** (with corrected pre-flight — see below) |
| 2 | `20260506130000_rebias_l1_l3_pio_to_premium_hands.sql` | 0 L1-L3 PIO rows lacking premium heroHand — already fixed by `fix_phase77_swap_collateral_drift` | NO-OP, skip |
| 3 | `20260506_security_fix_1_rls_and_views.sql` | 0 SECURITY DEFINER views remaining — already fixed | NO-OP, skip |
| 4 | `20260506_security_fix_2_search_path.sql` | 0 SECURITY DEFINER funcs missing `search_path` (3 sampled) — already fixed | NO-OP, skip |
| 5 | `20260506_security_fix_3_rls_policies_and_matviews.sql` | 0 anon SELECT grants on the 3 matviews — already fixed | NO-OP, skip |
| 6 | `20260507200000_backfill_spins007_l9_post_phase100b.sql` | superseded by `backfill_spins007_l9_v2` (applied 20260507202907) | SUPERSEDED, skip |
| 7 | `20260506010000_normalize_memory_charts_hand_matrix_format.sql` | applied as `normalize_memory_charts_to_object_format` (20260506011322) | APPLIED UNDER DIFFERENT NAME, skip |

## Migrations applied this session

### A. `reencode_low_quality_youtube_reels_targeted`

**Why the original (file 1) couldn't apply as-is:** the pre-flight assertion fired because 21 native user-uploaded reels (source_type='user', youtube_video_id=NULL, original_youtube_url=NULL) matched the candidate filter `media_status='ready' AND video_url ILIKE '%supabase.co/storage%'`. The migration's UPDATE clause already excluded them via `AND original_youtube_url IS NOT NULL`, but the assertion didn't have the same exclusion and would `RAISE EXCEPTION` and abort.

**What I shipped instead:** `20260507230000_reencode_low_quality_youtube_reels_targeted.sql` — same DELETE + UPDATE logic but with the pre-flight scoped to `original_youtube_url IS NOT NULL`. The 21 native uploads are correctly untouched. 2,372 YT-sourced reels reverted from native MP4 back to `media_status='queued'` for re-encoding.

### B. `backfill_transcode_jobs_for_reencode_queue_v2`

**Why this was needed:** the trigger `trg_social_reels_yt_queue_job` fires on INSERT only, not UPDATE. So the 2,372 UPDATEs in (A) put reels in `media_status='queued'` but did NOT enqueue any `video_transcode_jobs` rows. Reels would have been stuck forever — Hetzner worker only sees queued jobs, not queued reels.

**What I shipped:** `20260507230500_backfill_transcode_jobs_for_reencode_queue.sql` — manually INSERTs job rows mirroring the trigger function's exact field set, with `DISTINCT ON (video_url)` to handle the unique-key constraint on duplicate-URL reels. Created **749 jobs** covering 755 unique YT URLs across 2,373 queued reels (the 6 gap = URLs that already had a live/completed job, correctly deduped).

## State after sweep

```
SELECT
  (SELECT COUNT(*) FROM video_transcode_jobs WHERE status='queued' AND source_type='youtube') AS jobs_queued,
  (SELECT COUNT(DISTINCT video_url) FROM social_reels WHERE media_status='queued' AND source_type='youtube') AS unique_yt_urls,
  (SELECT COUNT(*) FROM social_reels WHERE media_status='queued' AND source_type='youtube') AS total_queued_reels;
-- → 749 / 755 / 2373
```

The Hetzner `yt-transcode-worker` will drain these 749 jobs. As each completes, downstream mirroring (`m7_2_mirror_all_video_posts` + similar) propagates the new HQ video_url to all reels sharing the source URL. All 2,373 reels eventually flip to `ready` with HQ video.

## Architectural finding (deferred)

The trigger `trg_social_reels_yt_queue_job` is INSERT-only. Any future UPDATE-based requeue migration will hit the same trap unless:
- (a) The trigger is extended to also fire on UPDATE when `media_status` flips to `queued`, OR
- (b) The standard pattern becomes "do the UPDATE then run a backfill INSERT in the same migration".

I did NOT change the trigger. Adding UPDATE semantics is a TIER-3 schema change with broader consequences (e.g., it would re-enqueue any existing reel whenever its media_status was UPDATEd for unrelated reasons). Worth a separate audit + design discussion.

## Files committed by this sweep

- `supabase/migrations/20260507230000_reencode_low_quality_youtube_reels_targeted.sql`
- `supabase/migrations/20260507230500_backfill_transcode_jobs_for_reencode_queue.sql`
- `.agent/audits/2026-05-07-pending-sql-sweep.md` (this file)

The original `supabase/migrations/20260506000000_reencode_low_quality_reels.sql` is left in place in the repo as historical record (it was committed in 66619c59c9). Future agents reading it should see the SUPERSEDES note in the new file.
