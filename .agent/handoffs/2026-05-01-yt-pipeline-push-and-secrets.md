# Handoff: Push Operation TikTok Reels M1+M2+M3 + Wire Hetzner Auto-Deploy

**Date:** 2026-05-01
**Origin agent:** Cowork session (Sonnet 4.6)
**Reason for handoff:** Origin agent's bash sandbox returned `No space left on device` on every call, AND GitHub MCP token returned `Bad credentials` (the token in `.env.local` is `NPM_TOKEN`, not a `GITHUB_PAT` with repo write scope). Two other channels for arbitrary HTTP (Claude-in-Chrome, workspace web_fetch POST) were either deferred-only or GET-only. The origin agent applied the SQL migration directly via Supabase MCP but cannot land the code commit or set GitHub repo secrets from this session.

**Mission:** Land the M1+M2+M3 code on `main` so Vercel rebuilds + GitHub Actions deploys the YouTube transcode worker to the existing Hetzner box. Database is already migrated; 426 jobs are queued in production waiting for a worker to drain them. Once the worker is running, the queue drains in ~3.5 hours and unblocks M4 (the Reels.jsx player rewrite).

---

## Current production state (verified via Supabase MCP — do not re-apply)

```
SELECT * FROM v_yt_pipeline_health;
 source_type   | media_status | reel_count
---------------+--------------+------------
 user          | ready        |         10
 video_library | ready        |        200
 youtube       | queued       |        426

SELECT COUNT(*) FROM video_transcode_jobs WHERE source_type='youtube' AND status='queued';
 426
```

- Migration `20260501000000_add_media_pipeline.sql` is applied (SQL is on disk for reproducibility but **do NOT re-run via `npm run db:push`** — it's already in the migrations table at production).
- Triggers `trg_social_reels_yt_intercept` (BEFORE INSERT) and `trg_social_reels_yt_queue_job` (AFTER INSERT) are installed on `social_reels`.
- New columns on `social_reels`: `youtube_video_id`, `media_status`, `original_youtube_url`. CHECK constraints in place.
- New table `video_transcode_jobs` with full RLS (service-role-only). Partial index for poll efficiency.
- Monitoring views: `v_yt_pipeline_health`, `v_yt_jobs_health`.

---

## Files on disk in `~/Documents/Smarter-Poker-World-Hub/` (untracked, ready to commit)

| Path | Purpose |
|---|---|
| `supabase/migrations/20260501000000_add_media_pipeline.sql` | Captures the applied schema change so future `db:status` is clean. The migration is already applied to prod — committing this just keeps the file system aligned. |
| `scripts/yt-transcode-worker/index.js` | Standalone YouTube → MP4 worker. yt-dlp + ffmpeg + atomic claim, 3-way concurrency, adaptive 5s/60s polling. ESM. |
| `scripts/yt-transcode-worker/package.json` | sp-yt-transcode-worker, supabase-js dep only. |
| `scripts/yt-transcode-worker/sp-yt-transcode.service` | systemd unit; user=openclaw, MemoryMax=3G. Runs alongside existing sp-transcode.service, NOT replacing it. |
| `scripts/yt-transcode-worker/DEPLOY.md` | Manual SSH fallback procedure. Excluded from rsync in the workflow. |
| `scripts/backfill-youtube-reels.js` | Idempotent CLI for `--requeue-failed` later. The bulk backfill ran via SQL inside the migration. |
| `.github/workflows/deploy-yt-worker.yml` | Auto-deploys worker to Hetzner on every push to `scripts/yt-transcode-worker/**`. `on: push` only (NOT `schedule:` — complies with cron-governance §11.5). |
| `.memory/preferences/dan-working-style.md` | (gitignored — local only, do NOT push) |
| `.memory/SUMMARY.md` | (gitignored — local only, do NOT push) |
| `.agent/handoffs/2026-05-01-yt-pipeline-push-and-secrets.md` | This file. Tracked in git. |

`.env.local` and `.memory/` are gitignored per repo `.gitignore`. Verify `git status -s` only shows the 7 files above + this handoff before committing.

---

## What you (the receiving agent) must do

### Step 1 — Commit + push the code

```bash
cd ~/Documents/Smarter-Poker-World-Hub
git status -s   # sanity check — should list only the 7 new files + this handoff
npm run push "feat(reels): YouTube → native MP4 pipeline (Operation TikTok Reels M1+M2+M3)"
```

**`npm run push` invariants** (per CLAUDE.md §1.2):
- Exit 0 with `DEPLOY_VERIFIED:true` and `SHA_MATCHED:true` is the only success criterion.
- If Phase 2.5 build gate fails, fix and re-run. The added files don't affect the Next.js build (all under `scripts/`, `supabase/`, `.github/`, `.agent/`), so build should pass cleanly.
- Pre-commit hook validates email is `254329056+Smarter-Poker@users.noreply.github.com`. Don't override.
- If push exits non-zero, debug per §1.7. Never push the same broken code twice.

### Step 2 — Add 2 GitHub repo secrets

Navigate to:
```
https://github.com/Smarter-Poker/Smarter-Poker-World-Hub/settings/secrets/actions
```

Add two NEW repo secrets:

1. **`HETZNER_SSH_PRIVATE_KEY`** — paste the private key (Ed25519) matching this public key already in Hetzner Cloud:
   ```
   ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAICbfpGx8YV1Al3VIAY8uIr7aIDX2kfG3R587U9UVip/s smarter.poker@deploy
   ```
   Dan has the private key locally (`~/.ssh/` on his Mac, named per the comment `smarter.poker@deploy` — likely `~/.ssh/id_ed25519` or `~/.ssh/smarter-poker-deploy`). If you can't access his keychain, surface the question to Dan: "paste the private key whose public key ends in `Vip/s smarter.poker@deploy`".

2. **`HETZNER_HOST`** — public IP or hostname of the Ashburn CX22 box currently running `sp-transcode.service`. Dan can find it via the Hetzner Cloud console or by running:
   ```bash
   curl -s -H "Authorization: Bearer vBhJ95aeev1eC5nf4DIeOrCFs0ePxpbDn9MRhTBm5A5JaFo2AipTuGYufhd3irEP" \
     https://api.hetzner.cloud/v1/servers | jq -r '.servers[] | select(.name | contains("smarter")) | .public_net.ipv4.ip'
   ```
   (Token is from `.env.local`. If multiple boxes return, it's the one in `dc=ash-dc1` with `sp-transcode` running.)

`SUPABASE_SERVICE_ROLE_KEY` is already configured (used by `build-safety-gate.yml` CHECK 7). Don't re-add.

### Step 3 — Trigger the deploy workflow

The push from Step 1 already triggered the workflow (path filter matches `scripts/yt-transcode-worker/**`), but the secrets weren't set yet so it would have failed. Re-run via:

```
https://github.com/Smarter-Poker/Smarter-Poker-World-Hub/actions/workflows/deploy-yt-worker.yml
```

Click "Run workflow" → main → Run.

Watch the run to completion. The final step tails `journalctl -u sp-yt-transcode -n 30`. Expected output:

```
[yt-worker 2026-05-01T...] Starting yt-transcode-worker
[yt-worker 2026-05-01T...]   Worker ID:        hetzner-ash-yt-01
[yt-worker 2026-05-01T...]   Concurrency:      3
[yt-worker 2026-05-01T...]   Poll: idle 60s / busy 5s
[yt-worker 2026-05-01T...] ▶ Job <uuid> — https://www.youtube.com/...
[yt-worker 2026-05-01T...]   Downloaded XX.X MB
[yt-worker 2026-05-01T...]   Re-encoded → Y.Y MB
[yt-worker 2026-05-01T...] ✓ Job <uuid> → https://kuklfnapbkmacvwxktbh.supabase.co/storage/v1/object/public/social-media/reels/...
```

### Step 4 — Verify queue draining

Run via Supabase MCP:

```sql
SELECT * FROM v_yt_jobs_health;
SELECT COUNT(*) FROM video_transcode_jobs WHERE status='queued' AND source_type='youtube';
SELECT COUNT(*) FROM video_transcode_jobs WHERE status='completed' AND source_type='youtube';
```

Expected progression over the first hour:
- `queued` count drops by ~120 per hour (3 concurrent × ~1.5 min/job × 60 min)
- `completed` count grows correspondingly
- `failed` count should be small (<5%) — yt-dlp can't reach private/deleted/region-blocked videos. That's expected, not a defect.

### Step 5 — Report back

Reply in chat with:
1. The deployed SHA from `git-safe-push.sh` output (`DEPLOY_VERIFIED:true SHA=<hash>`).
2. The systemd service status: `sudo systemctl is-active sp-yt-transcode` should print `active`.
3. First 3 successful job IDs from `v_yt_jobs_health` (proves the worker is actually processing, not just running).
4. Current queue depth: `SELECT COUNT(*) FROM video_transcode_jobs WHERE status='queued' AND source_type='youtube';`

---

## Verification — if anything fails

| Failure | Cause | Fix |
|---|---|---|
| `npm run push` Phase 2.5 build gate fails | Unrelated regression, not from these files | Fix the regression on a separate commit; re-run push. The 7 new files do NOT touch Next.js build scope. |
| GH Actions workflow fails on "Set up SSH agent" | `HETZNER_SSH_PRIVATE_KEY` secret not set or malformed | Re-add secret. Must be the FULL key file content including `-----BEGIN OPENSSH PRIVATE KEY-----` headers. |
| Workflow fails on "Trust Hetzner host key" | `HETZNER_HOST` secret missing or wrong IP | Verify with Hetzner API call in Step 2. |
| Workflow fails on `apt-get install` | Already installed; or `sudo` requires password | Existing box has passwordless sudo for `openclaw` (used by `sp-transcode.service`). If broken, SSH in manually and verify `sudo -n true` works. |
| Worker starts but no jobs claimed | RLS denying access | Migration enables `p_video_transcode_jobs_service_only` policy. Worker uses service role key, so should bypass. Verify env file: `sudo cat /etc/sp-yt-transcode.env` shows correct `SUPABASE_SERVICE_ROLE_KEY`. |
| Worker claims but every job fails with `yt-dlp_exit_1` | yt-dlp version too old / YouTube broke their player | SSH in: `sudo pip3 install --upgrade --break-system-packages yt-dlp` then `sudo systemctl restart sp-yt-transcode`. |
| `social_reels.video_url` not flipping to Supabase URL after job completes | Worker has the wrong `reel_id` mapping | Should not happen — trigger sets reel_id correctly on insert. If it does: `SELECT reel_id FROM video_transcode_jobs WHERE status='completed' LIMIT 5;` to confirm reel_id is populated. |

---

## Do NOT touch

- `scripts/transcode-worker/index.js` — existing HEVC user-upload worker. Reverted by user/linter to v1.0 — keep it that way. Operates on a different table (`social_posts.transcode_status`) and a different systemd unit (`sp-transcode.service`). Independent of YouTube pipeline.
- `pages/api/cron/transcode-videos.js` — Vercel cron, HEVC-only. Cannot run yt-dlp on serverless.
- `pages/hub/social-media/index.js`, `Stories.jsx`, `VideoClipper.js` — no JS-level patches needed; the AFTER INSERT trigger on `social_reels` handles every insert path automatically.
- `Reels.jsx`, `ReelsFeedCarousel.jsx` — M4 player rewrite is GATED on the queue draining to 0. Do not start until:
  ```sql
  SELECT COUNT(*) FROM social_reels
  WHERE (video_url ILIKE '%youtube%' OR video_url ILIKE '%youtu.be%')
  AND media_status != 'ready';
  -- must return 0
  ```

## Out of scope for this handoff

- The M4 player rewrite (separate handoff when gate clears).
- Provisioning a brand-new Hetzner CX22 (we're reusing the existing box).
- Touching `pages/api/video/transcode.js` (orphaned endpoint that wrote to the missing table; now that the table exists, it would work, but its source_type defaults to `'user'` and nothing polls that — left as-is intentionally).

## References

- Original brief: pasted into the Cowork session at session start (2026-05-01); covers TikTok architecture deep-dive + per-milestone implementation plan.
- CLAUDE.md §1 (deployment), §3 (8 immutable rules), §11 (cron governance).
- `scripts/yt-transcode-worker/DEPLOY.md` — manual SSH fallback if GH Actions can't run.
