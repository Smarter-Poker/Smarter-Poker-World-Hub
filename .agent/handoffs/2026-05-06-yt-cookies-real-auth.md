# Handoff: deploy authenticated YouTube cookies to Hetzner

**Created:** 2026-05-06 ~11:24 UTC
**Author:** Cowork
**Owner needed:** Dan (only person with logged-in YouTube/Google session)
**Time:** ~10 min

## Why

The headless camoufox+scrapling Google login in `refresh-yt-cookies.py` is being blocked by Google's bot detection. Verified from workflow logs:

```
[cookie-refresh] Navigating to Google Login...
[cookie-refresh] Harvested 12 cookies                ← only 12, no LOGIN_INFO
[cookie-refresh] ✗ Cookie test FAILED: --cookies for the authentication
```

The `refresh-yt-cookies.yml` workflow (and the systemd timer) report success because the workflow's `yt-dlp probe` step has `|| true` masking the actual probe failure. So in practice every camoufox refresh writes an anonymous-only cookies.txt and **destroys whatever auth state was there before**.

Today during this session, two such refreshes (11:07 and 11:18 UTC) pushed anonymous cookies onto Hetzner. Subsequent jobs hit the cookie-auth permanent-failure path (`PERMANENT_PATTERNS` matches "Use --cookies-from-browser or --cookies"), broadcast iframe-forever to siblings, and dropped **~2,344 previously-working native reels back to iframe-forever** state. The video_url was already overwritten in the migration so they cannot be restored — they have to re-convert from YouTube once cookies work.

## What needs to happen

Dan exports a cookies.txt from his **logged-in Chrome**, base64-encodes it, and dispatches `.github/workflows/deploy-yt-cookies.yml` with it. That workflow:
- Validates the file (≥5 youtube.com entries, has LOGIN_INFO)
- scp's it to /opt/smarter-poker/yt-transcode-worker/cookies.txt
- Runs a yt-dlp probe to verify
- Restarts the worker

## Steps for Dan

### 1. Export cookies from Chrome

Use the `Get cookies.txt LOCALLY` extension (Chrome Web Store), or any Netscape-format cookie exporter, while logged into youtube.com as `smarterpoker45@gmail.com` (the account whose creds are stored in the `YT_GOOGLE_EMAIL` / `YT_GOOGLE_PASS` GitHub secrets).

Important: the exported file MUST contain a `LOGIN_INFO` cookie (the auth marker yt-dlp checks). Open the file and grep for `LOGIN_INFO` — if not present, you're not logged in.

Save as `cookies-yt.txt` somewhere local.

### 2. Base64-encode

```bash
base64 -i cookies-yt.txt | tr -d '\n' | pbcopy
```

The base64 string is now in your clipboard.

### 3. Dispatch the deploy workflow

Either via GitHub UI:
- https://github.com/Smarter-Poker/Smarter-Poker-World-Hub/actions/workflows/deploy-yt-cookies.yml
- Click **Run workflow**
- Paste the base64 into `cookies_b64`
- Leave `run_yt_dlp_test` checked
- Run

Or via gh CLI:
```bash
gh workflow run deploy-yt-cookies.yml \
  -f cookies_b64="$(pbpaste)" \
  -f run_yt_dlp_test=true
```

### 4. Verify

The workflow will print:
```
lines: NN
yt-entries: NN          ← must be ≥ 5
has LOGIN_INFO: 1       ← must be 1
```

And the yt-dlp probe step will show video metadata for the "Me at the zoo" public video. Both must pass — if `has LOGIN_INFO: 0`, the file is anonymous and you exported it while logged out.

## Once cookies are good

Re-queue the reels that got broadcast-flipped to iframe-forever during today's outage. SQL:

```sql
-- Find reels that flipped today and would benefit from re-conversion.
-- Filter to original_youtube_url IS NOT NULL (i.e., they came through the
-- YouTube pipeline before, so we know they're convertible).
WITH targets AS (
  SELECT id
  FROM social_reels
  WHERE media_status = 'ready'
    AND video_url ILIKE '%youtube%'
    AND original_youtube_url IS NOT NULL
    AND updated_at >= '2026-05-06 11:00:00+00'  -- the bleeding window
)
UPDATE social_reels SET media_status = 'queued'
WHERE id IN (SELECT id FROM targets);

-- Then manually insert jobs (the trigger only fires on INSERT not UPDATE):
WITH targets AS (
  SELECT DISTINCT ON (sr.video_url)
    sr.id AS reel_id, sr.author_id AS user_id, sr.video_url AS url
  FROM social_reels sr
  WHERE sr.media_status = 'queued'
    AND sr.source_type = 'youtube'
    AND sr.video_url ILIKE '%youtube%'
    AND NOT EXISTS (
      SELECT 1 FROM video_transcode_jobs j
      WHERE j.source_type = 'youtube'
        AND (j.youtube_url = sr.video_url OR j.source_url = sr.video_url)
        AND j.status IN ('queued','processing')
    )
  ORDER BY sr.video_url, sr.created_at ASC
)
INSERT INTO video_transcode_jobs (
  reel_id, user_id, source_url, youtube_url, source_type,
  status, target_format, target_bitrate
)
SELECT reel_id, user_id, url, url, 'youtube', 'queued', 'h264_1080p', 2500000
FROM targets
ON CONFLICT DO NOTHING;
```

## Recommended longer-term fixes (not urgent)

1. Fix the `refresh-yt-cookies.yml` workflow to FAIL hard when the yt-dlp probe fails — replace the `|| true` at the end of the probe step with a real status check on `has LOGIN_INFO`.
2. Disable the auto-refresh timer entirely (it's already disabled by deploy-yt-worker.yml after each deploy, but the refresh-yt-cookies.yml workflow re-enables it). Until camoufox auth works, automated refresh actively makes things worse.
3. Investigate whether residential proxy for camoufox would clear Google's bot detection on Hetzner IP.
