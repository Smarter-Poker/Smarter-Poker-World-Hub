# Handoff: ship the 3 SQL-sweep files (audit + 2 migrations)

**Date:** 2026-05-07 (evening)
**From:** Cowork Claude (sandbox can't delete `.git/index.lock`)
**For:** Antigravity or Dan's Terminal session

## What's already done — do NOT redo

The two migrations have ALREADY been applied to production via the Supabase MCP `apply_migration` tool. They are recorded in `supabase_migrations.schema_migrations`:

- `reencode_low_quality_youtube_reels_targeted` — applied; queued 2,372 YT-sourced reels for re-encoding (21 native uploads correctly untouched)
- `backfill_transcode_jobs_for_reencode_queue_v2` — applied; created 749 jobs in `video_transcode_jobs` covering 755 unique YT URLs

Verified via:
```sql
SELECT
  (SELECT COUNT(*) FROM video_transcode_jobs WHERE status='queued' AND source_type='youtube') AS jobs_queued,
  (SELECT COUNT(DISTINCT video_url) FROM social_reels WHERE media_status='queued' AND source_type='youtube') AS unique_yt_urls;
-- → 749 / 755
```

The Hetzner `yt-transcode-worker` will drain these jobs autonomously over the next several hours. **Do not re-apply the migrations.**

## What needs shipping

Three new files in the working tree that need to be committed and pushed for repo source-of-truth parity (so future agents can `git log` and see what was applied):

```
?? .agent/audits/2026-05-07-pending-sql-sweep.md
?? supabase/migrations/20260507230000_reencode_low_quality_youtube_reels_targeted.sql
?? supabase/migrations/20260507230500_backfill_transcode_jobs_for_reencode_queue.sql
```

These are pure documentation/source-of-truth files — they record the SQL that was already applied. Pushing them does NOT re-run the SQL.

## Steps

```bash
cd ~/Documents/Smarter-Poker-World-Hub

# 1. Clear the stale .git/index.lock (Mac user perm; sandbox couldn't).
rm -f .git/index.lock

# 2. Verify only the 3 new files are present (no other agents' WIP to park).
git status --short

# 3. Push via the canonical script. It's `git add -A` so all 3 will stage.
bash scripts/git-safe-push.sh "docs(audit) + sql(reels): pending-SQL sweep — 2 migrations applied (reencode YT reels + backfill transcode jobs), 5 no-ops, 1 superseded"

# Wait for: DEPLOY_VERIFIED:true and SHA_MATCHED:true.
```

If `git status` shows other agents' WIP that you didn't expect, follow the same "stash → push → pop" pattern from the prior `2026-05-07-ship-thumbnail-poster-fix.md` handoff to avoid bundling their work into this commit.

## Success criteria

- ✅ `git-safe-push.sh` exits 0 with `DEPLOY_VERIFIED:true`.
- ✅ Production `/api/health` serves a new SHA containing the 3 files.
- ✅ `git log --oneline -3 -- supabase/migrations/20260507230000_reencode_low_quality_youtube_reels_targeted.sql` returns the new commit SHA.

The Vercel deploy from this push is purely doc/SQL-file additions — no code change, no behavioral change. Should pass the build gate trivially.
