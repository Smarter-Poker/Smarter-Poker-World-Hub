# Handoff: Refresh YouTube cookies on Hetzner + smoke test + bulk re-queue 8,800+ stuck reels

**Date:** 2026-05-04
**Origin agent:** Cowork session (Sonnet 4.6)
**Reason for handoff:** Origin can't SSH to the Hetzner box from this environment (no SSH private key available in the sandbox). Receiving agent runs from Dan's laptop where `~/.ssh/` has the key matching `ssh-ed25519 ...Vip/s smarter.poker@deploy` (the public key registered in Hetzner Cloud).

**Mission:** Restore YouTube conversion success rate from ~9% to ~85%+ by replacing the stale `cookies.txt` on the Hetzner YouTube transcode worker, then re-queue the ~8,800 reels that are currently `media_status='ready'` (iframe-forever) because their conversions failed with `from-browser or --cookies for the authentication`. After the new cookies land, those reels should successfully convert to native MP4.

---

## Production state at handoff time (verified via Supabase MCP)

```
total reels:                   11,205
└─ native (Supabase MP4):         978   ← currently working
└─ youtube iframe-forever:      9,015   ← stuck because YouTube blocks the box
└─ video_library iframe:          200   ← intentional per brief
└─ user uploads:                   12

queue depth:                        0   (empty — worker drained everything it could)
last completed job:           ~1h ago   (worker idle waiting for new work)
m4_gate query:                      0   (zero stuck-queued — but only because we
                                          flipped them all to iframe-forever in M7.6)
```

The conversion failure rate was 91%. Most failures look like:

```
yt-dlp_exit_1: from-browser or --cookies for the authentication. See
https://github.com/yt-dlp/yt-dlp/wiki/FAQ#how-do-i-pass-cookies-to-yt-dlp ...
```

YouTube detects the Hetzner datacenter IP and demands authenticated cookies before allowing downloads. The current `cookies.txt` on the box is stale or empty. The `sp-yt-cookie-refresh.timer` is intentionally `disable --now`'d in `.github/workflows/deploy-yt-worker.yml` line 123 ("Disable auto-refresh timer to prevent wiping manually harvested auth cookies") — meaning manual refresh is the expected workflow.

## Background — pipeline architecture

- **Worker:** `/opt/smarter-poker/yt-transcode-worker/index.js` running as systemd unit `sp-yt-transcode.service` under user `openclaw`.
- **Cookie file:** worker checks `/opt/smarter-poker/yt-transcode-worker/cookies.txt` at the start of every job. If present, passes `--cookies <file>` to `yt-dlp`. If missing, logs `No cookies.txt found — downloads may fail on datacenter IPs` and proceeds anyway.
- **Failure classification:** worker's `PERMANENT_PATTERNS` regex (M7.6 just added cookie-auth, region-blocked, members-only-with-channel-context) classifies `from-browser or --cookies for the authentication` as permanent. On permanent failure, the broadcast sets all sibling reels (same `original_youtube_url`) to `media_status='ready'` so they render as YouTube iframes instead of staying stuck in `'queued'`.
- **Re-queue path:** marking reels back to `media_status='queued'` and inserting fresh `video_transcode_jobs` rows triggers a fresh download attempt on the next worker tick.

## What you need before starting

- Mac (or Linux) terminal with SSH key matching the Hetzner public key
- Supabase service role key for the smoke-test SQL (in `.env.local` as `SUPABASE_SERVICE_ROLE_KEY`)
- ~10 min for cookie setup, then ~3 hours of background monitoring while the worker drains

---

## Step 1 — SSH sanity check + grab `<HETZNER_HOST>`

```bash
# Resolve the host IP via Hetzner API (token in .env.local under HETZNER_API_TOKEN — see Dan's prior credential paste)
HETZNER_TOKEN="vBhJ95aeev1eC5nf4DIeOrCFs0ePxpbDn9MRhTBm5A5JaFo2AipTuGYufhd3irEP"
HETZNER_HOST=$(curl -s -H "Authorization: Bearer $HETZNER_TOKEN" \
  https://api.hetzner.cloud/v1/servers \
  | jq -r '.servers[] | select(.name | contains("smarter") or contains("openclaw") or contains("transcode")) | .public_net.ipv4.ip' \
  | head -1)
echo "HETZNER_HOST=$HETZNER_HOST"

# Smoke test the connection
ssh openclaw@"$HETZNER_HOST" 'echo connected && yt-dlp --version && ls -la /opt/smarter-poker/yt-transcode-worker/cookies.txt 2>&1'
```

Expected: `connected` + a `yt-dlp` version + either an existing `cookies.txt` or `No such file or directory`.

If the SSH fails — Dan's key is stale or the host has been rebuilt. Stop and report back.

---

## Step 2 — Export cookies from a logged-in YouTube tab

Pick the browser you're already signed into YouTube on. Run on YOUR LAPTOP (not the Hetzner box):

```bash
# Chrome (most common):
yt-dlp --cookies-from-browser chrome --cookies ~/yt-cookies.txt \
       --skip-download "https://www.youtube.com/watch?v=jNQXAC9IVRw"

# Firefox:
yt-dlp --cookies-from-browser firefox --cookies ~/yt-cookies.txt \
       --skip-download "https://www.youtube.com/watch?v=jNQXAC9IVRw"

# Safari:
yt-dlp --cookies-from-browser safari --cookies ~/yt-cookies.txt \
       --skip-download "https://www.youtube.com/watch?v=jNQXAC9IVRw"
```

(`jNQXAC9IVRw` is "Me at the zoo", a public probe URL.)

Verify:

```bash
head -3 ~/yt-cookies.txt   # line 1: "# Netscape HTTP Cookie File"
wc -l ~/yt-cookies.txt     # expect 50–200 lines
grep -c '\.youtube\.com'  ~/yt-cookies.txt   # expect 10+
```

**Failure path: macOS keychain blocks Chrome cookie extraction.** Then use the browser-extension fallback:

1. Install "Get cookies.txt LOCALLY" by `kairi003` (Chrome and Firefox). It's the de facto standard for this; do NOT use the older "cookies.txt" extensions which have been compromised.
2. While signed into `https://www.youtube.com`, click the extension → **Export** → save as `~/yt-cookies.txt`.

---

## Step 3 — Copy cookies to the Hetzner worker directory

```bash
scp ~/yt-cookies.txt openclaw@"$HETZNER_HOST":/tmp/cookies.txt
ssh openclaw@"$HETZNER_HOST" '
  set -e
  sudo mv /tmp/cookies.txt /opt/smarter-poker/yt-transcode-worker/cookies.txt
  sudo chown openclaw:openclaw /opt/smarter-poker/yt-transcode-worker/cookies.txt
  sudo chmod 600 /opt/smarter-poker/yt-transcode-worker/cookies.txt
  ls -la /opt/smarter-poker/yt-transcode-worker/cookies.txt
'
```

Expected output: `-rw------- 1 openclaw openclaw <bytes> ... cookies.txt`

---

## Step 4 — Restart the worker + tail logs to confirm cookies are picked up

```bash
ssh openclaw@"$HETZNER_HOST" '
  sudo systemctl restart sp-yt-transcode
  sleep 3
  sudo systemctl is-active sp-yt-transcode
  echo "--- last 30 log lines ---"
  sudo journalctl -u sp-yt-transcode -n 30 --no-pager
'
```

What to look for:
- `is-active` returns `active`
- Log shows `Starting yt-transcode-worker` and `Worker ID: ...` and `Concurrency: 6`
- When the next job runs, log will show `Using cookies: /opt/smarter-poker/yt-transcode-worker/cookies.txt`

If you see `No cookies.txt found — downloads may fail on datacenter IPs`, the file path is wrong or permissions are bad. Re-check Step 3.

---

## Step 5 — Smoke test: queue ONE re-conversion and watch it

Pick one previously-failed YouTube reel and queue a fresh job for it. Run from Supabase SQL editor (or via the Supabase MCP `execute_sql` if you have it):

```sql
-- Pick an iframe-forever reel that previously failed cookie-auth
WITH target AS (
  SELECT sr.id AS reel_id, sr.author_id, sr.video_url
  FROM social_reels sr
  WHERE sr.source_type = 'youtube'
    AND sr.media_status = 'ready'
    AND sr.video_url ILIKE '%youtube%'
    -- only re-queue if no live/completed job exists for this URL
    AND NOT EXISTS (
      SELECT 1 FROM video_transcode_jobs j
      WHERE j.youtube_url = sr.video_url
        AND j.status IN ('queued','processing','completed')
    )
  ORDER BY sr.created_at DESC
  LIMIT 1
)
INSERT INTO video_transcode_jobs (
  reel_id, user_id, source_url, youtube_url, source_type,
  status, target_format, target_bitrate
)
SELECT reel_id, author_id, video_url, video_url, 'youtube',
       'queued', 'h264_1080p', 2500000
FROM target
RETURNING id, reel_id, youtube_url;
```

Note the returned `id` (job UUID).

Also flip the reel back to `'queued'` so the M4 gate query reflects in-flight:

```sql
UPDATE social_reels SET media_status = 'queued'
WHERE id = '<reel_id from above>';
```

Then watch the Hetzner logs for that exact job:

```bash
ssh openclaw@"$HETZNER_HOST" 'sudo journalctl -u sp-yt-transcode -f --no-pager'
```

Within 60 s you should see:

```
[yt-worker ...] ▶ Job <job-uuid> — https://www.youtube.com/embed/...
[yt-worker ...]   Using cookies: /opt/smarter-poker/yt-transcode-worker/cookies.txt
[yt-worker ...]   Downloaded XX.X MB
[yt-worker ...]   Re-encoded → Y.Y MB
[yt-worker ...] ✓ Job <job-uuid> → https://kuklfnapbkmacvwxktbh.supabase.co/storage/...
```

If success: cookies work, proceed to Step 6.
If failure with `from-browser or --cookies` again: cookies were rejected. Re-check that you exported them from a YouTube account that's actually signed in (and that the account isn't restricted, age-locked, or member-only-tier required). Also try a DIFFERENT browser's cookies.

---

## Step 6 — Bulk re-queue the remaining ~8,800 stuck reels

After the smoke test passes, re-queue everything else. This INSERTs fresh jobs (one per distinct video_url, deduped by the partial unique index `uniq_video_transcode_jobs_yt_url_live`).

```sql
-- Re-queue: pick one reel per distinct video_url that needs conversion
WITH candidates AS (
  SELECT DISTINCT ON (sr.video_url)
    sr.id AS reel_id, sr.author_id, sr.video_url
  FROM social_reels sr
  WHERE sr.source_type = 'youtube'
    AND sr.media_status = 'ready'
    AND sr.video_url ILIKE '%youtube%'
    AND NOT EXISTS (
      SELECT 1 FROM video_transcode_jobs j
      WHERE j.youtube_url = sr.video_url
        AND j.status IN ('queued','processing','completed')
    )
  ORDER BY sr.video_url, sr.created_at  -- stable pick: oldest reel per URL
)
INSERT INTO video_transcode_jobs (
  reel_id, user_id, source_url, youtube_url, source_type,
  status, target_format, target_bitrate
)
SELECT reel_id, author_id, video_url, video_url, 'youtube',
       'queued', 'h264_1080p', 2500000
FROM candidates;

-- Flip ALL siblings of those URLs back to 'queued' so the gate query reflects
-- in-flight state (the worker's broadcast will flip them to 'native' on success
-- or back to 'ready' on permanent failure).
UPDATE social_reels SET media_status = 'queued'
WHERE source_type = 'youtube'
  AND media_status = 'ready'
  AND video_url IN (SELECT youtube_url FROM video_transcode_jobs WHERE status='queued' AND source_type='youtube');
```

Verify queue depth:

```sql
SELECT
  (SELECT COUNT(*) FROM video_transcode_jobs WHERE status='queued' AND source_type='youtube') AS queued,
  (SELECT COUNT(*) FROM video_transcode_jobs WHERE status='processing' AND source_type='youtube') AS in_flight,
  (SELECT COUNT(*) FROM social_reels WHERE source_type='youtube' AND media_status='queued') AS reels_awaiting,
  (SELECT COUNT(*) FROM social_reels WHERE source_type='native') AS native_now;
```

Expect: `queued ≈ 700–800` (one per distinct URL), `reels_awaiting ≈ 8800`, `native_now = 978` initially.

---

## Step 7 — Monitor the drain (~3 hours at 6-way concurrency)

Run periodically (every ~15 min):

```sql
SELECT
  (SELECT COUNT(*) FROM video_transcode_jobs WHERE status='queued' AND source_type='youtube') AS queued,
  (SELECT COUNT(*) FROM video_transcode_jobs WHERE status='processing' AND source_type='youtube') AS in_flight,
  (SELECT COUNT(*) FROM video_transcode_jobs WHERE status='completed' AND source_type='youtube'
    AND completed_at > NOW() - INTERVAL '15 minutes') AS completed_last_15min,
  (SELECT COUNT(*) FROM video_transcode_jobs WHERE status='failed' AND source_type='youtube'
    AND completed_at > NOW() - INTERVAL '15 minutes') AS failed_last_15min,
  (SELECT COUNT(*) FROM social_reels WHERE source_type='native') AS native_total,
  (SELECT COUNT(*) FROM social_reels WHERE source_type='youtube' AND media_status='queued') AS still_pending;
```

Healthy progression: `queued` decreasing, `native_total` increasing fast, `failed_last_15min` low. At 6-way concurrency × ~30 s/job, expect ~720 jobs/hour completed.

If `failed_last_15min` is HIGH and the failures are again `from-browser or --cookies`, the cookies expired (YouTube cookies often expire in 1–24 h). Re-do Steps 2–4.

If failures are `Sign in to confirm` or anti-bot challenge, YouTube has flagged your account or IP. Need to pivot to a residential proxy.

---

## Step 8 — Final state report

When `queued` and `in_flight` both reach 0, send Dan:

```sql
SELECT source_type, media_status, COUNT(*) AS n
FROM social_reels
GROUP BY source_type, media_status
ORDER BY n DESC;
```

Plus the conversion success rate:

```sql
SELECT
  ROUND(100.0 * (SELECT COUNT(*) FROM video_transcode_jobs WHERE status='completed' AND source_type='youtube'
                 AND completed_at > NOW() - INTERVAL '6 hours') /
        NULLIF((SELECT COUNT(*) FROM video_transcode_jobs WHERE source_type='youtube'
                 AND completed_at > NOW() - INTERVAL '6 hours'), 0), 1) AS pct_success_last_6h;
```

Goal: `pct_success_last_6h` > 70%. If lower, cookies aren't covering enough of the catalog (members-only, region-block, deleted videos all stay permanent failures regardless).

---

## Failure modes + fallbacks

| Failure | Likely cause | Fix |
|---|---|---|
| SSH key denied | Dan's key not on the box (rebuild?) | Stop, report. Don't proceed. |
| `--cookies-from-browser` errors with keychain | macOS Chrome encrypts cookies | Use the "Get cookies.txt LOCALLY" extension instead. |
| Cookies file lands on box but `Using cookies` log line missing | Wrong path / permissions | `ssh ... 'sudo cat /opt/smarter-poker/yt-transcode-worker/cookies.txt | head -3'` should show `# Netscape HTTP Cookie File`. If empty or wrong path, redo Step 3. |
| Smoke test still fails with cookie-auth | Cookies are from an account YouTube has flagged, or are expired already | Sign out + back in to YouTube on your laptop, then re-export. Or try a DIFFERENT signed-in browser. |
| New `Sign in to confirm` errors | YouTube anti-bot challenge specific to the IP | Won't fix with cookies alone. Pivot to residential proxy (Bright Data / IPRoyal). Out of scope of this handoff. |
| Worker crash-loops after restart | Syntax error in another agent's recent commit, or memory pressure at 6-way concurrency | `journalctl -u sp-yt-transcode -n 100`; if OOM, drop `MAX_CONCURRENT_YT` from 6 to 4 in `/etc/sp-yt-transcode.env`. |
| `failed_last_15min` is 100% of jobs | Cookies invalidated during the run | Repeat Steps 2–4. Modern YT cookies expire fast (1–24h is typical). |

## What you (the receiving agent) must do

1. Steps 1–4: get cookies onto the box. Reply `cookies live, smoke test ready` if this succeeds.
2. Step 5: smoke test 1 reel. Reply with the journalctl output for that job ID, and whether it succeeded or failed.
3. If success → Steps 6–7: bulk re-queue + monitor. Report queue progress every ~30 min.
4. Step 8: final state snapshot when drain completes.

## Do NOT touch

- `.github/workflows/deploy-yt-worker.yml` line 123 `disable --now sp-yt-cookie-refresh.timer`. The team intentionally disabled auto-refresh to prevent wiping manually harvested cookies. Don't re-enable without explicit Dan approval.
- The HEVC pipeline (`scripts/transcode-worker/`, `pages/api/cron/transcode-videos.js`) — different system, not affected by YouTube cookies.
- `social_reels` rows where `source_type IN ('user', 'video_library')` — those are intentional iframe / native, not in scope for this re-queue.
- `social_reels` rows where the failure pattern is `Video unavailable`, `private`, `removed by uploader`, `members-only` (the actual phrase, not the channel-membership variant) — those are truly permanent, no cookies will help.

## References

- Production state captured 2026-05-04 21:06 UTC: 11,205 reels, 978 native, 9,015 iframe-forever, 200 video_library, 12 user.
- Worker commit chain: `f40ace490246d76d5e66a465a0e995e6c8439a46` (M7.5 index), `914547fdd590a4091a576b95866a92d2a3b8e98e` (M7.6 PERMANENT_PATTERNS expansion).
- Workflow runs successful for both, Hetzner deploy completed 2026-05-03 21:40 UTC.
- Failure pattern that triggered this handoff: `yt-dlp_exit_1: from-browser or --cookies for the authentication` on 458+ jobs.
- Prior handoffs (mission complete):
  - `.agent/handoffs/2026-05-01-yt-pipeline-push-and-secrets.md` — M1+M2+M3
  - `.agent/handoffs/2026-05-03-m4-player-rewrite.md` — M4
  - `.agent/handoffs/2026-05-03-m5-yt-worker-hardening.md` — M5
  - `.agent/handoffs/2026-05-03-m7-post-sync-and-capacity.md` — M7
- Worker log location: `journalctl -u sp-yt-transcode`
- Worker code: `/opt/smarter-poker/yt-transcode-worker/index.js` on Hetzner
- Cookie file (target): `/opt/smarter-poker/yt-transcode-worker/cookies.txt`
- Env file: `/etc/sp-yt-transcode.env`
