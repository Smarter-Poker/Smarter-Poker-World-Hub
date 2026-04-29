# HANDOFF: Server-side HEVC → H.264 transcode for cross-browser video playback

**Created:** 2026-04-29 by Cowork-Claude
**For:** An agent with Hetzner SSH access AND Supabase Edge Functions deploy permission
**Severity:** P1 — every iPhone-recorded video uploaded to smarter.poker fails to play in Chrome/Firefox desktop. Confirmed user impact: Dan's reels show but click-to-play yields black screen.

## 1. Goal

Every uploaded video (any source, any codec) ends up as an H.264-in-MP4 file that plays in every modern browser. Currently iPhone uploads are HEVC/H.265-in-.mov which only Safari decodes. Chrome and Firefox desktop show a black box when the user taps to play.

## 2. Required capabilities

- Hetzner SSH access (server runs at the address in `~/Documents/Smarter-Poker-World-Hub/scripts/deploy-openclaw.sh` — the same VM that runs Open Claw cron)
  OR Supabase Edge Functions deploy access (the project's `supabase` CLI must be configured with the service role)
- Supabase service role key for the project (in `.env.local` as `SUPABASE_SERVICE_ROLE_KEY`)
- ffmpeg installed on the worker host (or `@ffmpeg-installer/ffmpeg` if going Node-only)

## 3. Pre-conditions

- Project ref `kuklfnapbkmacvwxktbh`
- Existing buckets:
  - `social-media` (50 GB cap) — original uploads land here under `videos/<userId>/<timestamp>_<name>.<ext>`
  - `social-media` thumbnails are at `thumbnails/<userId>/...`
- `social_posts.media_urls[0]` contains the original file URL
- `social_posts.thumbnail_url` contains the JPEG poster
- HEVC files have content-type `video/quicktime` and are typically named `IMG_*.mov`

## 4. Steps — pick ONE of the two architectures below

### Architecture A — Hetzner cron worker (preferred for cost)

A Node script that polls for un-transcoded videos every 60 seconds, downloads them, runs ffmpeg, uploads the H.264 MP4 back, and updates `media_urls`.

```
Project layout addition:
  scripts/transcode-worker/
    index.js         # main loop
    package.json     # ffmpeg, supabase-js
    systemd.service  # for systemd install
```

#### 4a-1. SQL — add tracking columns

```sql
ALTER TABLE social_posts
  ADD COLUMN IF NOT EXISTS transcode_status TEXT DEFAULT NULL,  -- NULL | 'queued' | 'running' | 'done' | 'failed'
  ADD COLUMN IF NOT EXISTS original_media_url TEXT DEFAULT NULL, -- preserved pre-transcode
  ADD COLUMN IF NOT EXISTS transcode_error TEXT DEFAULT NULL;

-- Backfill: mark all existing video posts whose URL ends in .mov / .hevc as queued
UPDATE social_posts
SET transcode_status = 'queued',
    original_media_url = media_urls->>0
WHERE content_type = 'video'
  AND transcode_status IS NULL
  AND (
    (media_urls->>0) ILIKE '%.mov'
    OR (media_urls->>0) ILIKE '%.hevc'
    OR (media_urls->>0) ILIKE '%.heic'
  );

-- Index for the worker's poll query
CREATE INDEX IF NOT EXISTS idx_social_posts_transcode_queued
  ON social_posts(transcode_status, created_at DESC)
  WHERE transcode_status IN ('queued','running');
```

Save as `supabase/migrations/20260430_video_transcode_tracking.sql` and apply via the Supabase MCP `apply_migration` tool.

#### 4a-2. Worker script

```js
// scripts/transcode-worker/index.js
import { createClient } from '@supabase/supabase-js';
import { spawn } from 'node:child_process';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createReadStream } from 'node:fs';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SERVICE_KEY) { console.error('missing SUPABASE_SERVICE_ROLE_KEY'); process.exit(1); }

const supa = createClient(SUPABASE_URL, SERVICE_KEY);
const POLL_MS = 60_000;

async function tick() {
  const { data: posts, error } = await supa
    .from('social_posts')
    .select('id, author_id, media_urls, original_media_url, transcode_status')
    .eq('transcode_status', 'queued')
    .order('created_at', { ascending: true })
    .limit(1);
  if (error) { console.warn('poll error', error.message); return; }
  if (!posts || posts.length === 0) return;
  const post = posts[0];
  const srcUrl = post.original_media_url || post.media_urls?.[0];
  if (!srcUrl) {
    await supa.from('social_posts').update({ transcode_status: 'failed', transcode_error: 'no source URL' }).eq('id', post.id);
    return;
  }

  await supa.from('social_posts').update({ transcode_status: 'running' }).eq('id', post.id);
  const dir = await mkdtemp(join(tmpdir(), 'tx-'));
  const inFile = join(dir, 'in.mov');
  const outFile = join(dir, 'out.mp4');
  try {
    // Download
    const r = await fetch(srcUrl);
    if (!r.ok) throw new Error('download_status_' + r.status);
    const buf = Buffer.from(await r.arrayBuffer());
    await import('node:fs/promises').then(fs => fs.writeFile(inFile, buf));

    // Transcode — H.264 baseline + AAC, web-safe.
    // -movflags +faststart puts the MOOV atom at the front so the player can start streaming early.
    await new Promise((resolve, reject) => {
      const ff = spawn('ffmpeg', [
        '-i', inFile,
        '-c:v', 'libx264', '-preset', 'fast', '-crf', '23',
        '-pix_fmt', 'yuv420p', '-profile:v', 'baseline', '-level', '3.1',
        '-c:a', 'aac', '-b:a', '128k',
        '-movflags', '+faststart',
        '-y', outFile,
      ]);
      ff.stderr.on('data', d => process.stdout.write(d));
      ff.on('close', code => code === 0 ? resolve() : reject(new Error('ffmpeg_exit_' + code)));
    });

    // Upload alongside the original — same path but .mp4 extension
    const newPath = (post.media_urls?.[0] || srcUrl)
      .replace(/^https?:\/\/[^/]+\/storage\/v1\/object\/public\/social-media\//, '')
      .replace(/\.(mov|hevc|heic|mkv|avi|m4v|3gpp?|3g2)(\?.*)?$/i, '.mp4');
    const file = await import('node:fs/promises').then(fs => fs.readFile(outFile));
    const { error: upErr } = await supa.storage.from('social-media').upload(newPath, file, {
      contentType: 'video/mp4',
      upsert: true,
    });
    if (upErr) throw upErr;

    const { data: pub } = supa.storage.from('social-media').getPublicUrl(newPath);
    const newUrl = pub.publicUrl;

    // Update social_posts (keep original_media_url for rollback) AND social_reels mirror
    const newMediaUrls = [newUrl, ...(post.media_urls || []).slice(1)];
    await supa.from('social_posts').update({
      media_urls: newMediaUrls,
      transcode_status: 'done',
      transcode_error: null,
      original_media_url: srcUrl,
    }).eq('id', post.id);
    await supa.from('social_reels').update({ video_url: newUrl }).eq('source_post_id', post.id);

    console.log('transcoded post', post.id, srcUrl, '->', newUrl);
  } catch (e) {
    console.warn('transcode failed', post.id, e.message);
    await supa.from('social_posts').update({
      transcode_status: 'failed',
      transcode_error: e.message?.slice(0, 500),
    }).eq('id', post.id);
  } finally {
    try { await rm(dir, { recursive: true, force: true }); } catch (_) {}
  }
}

setInterval(() => tick().catch(e => console.warn(e)), POLL_MS);
tick();
console.log('transcode worker started');
```

#### 4a-3. systemd

```
# /etc/systemd/system/sp-transcode.service on Hetzner
[Unit]
Description=Smarter Poker Video Transcode Worker
After=network.target

[Service]
Type=simple
User=openclaw
WorkingDirectory=/opt/smarter-poker/transcode-worker
EnvironmentFile=/etc/sp-transcode.env  # contains SUPABASE_SERVICE_ROLE_KEY=...
ExecStart=/usr/bin/node index.js
Restart=on-failure
RestartSec=15

[Install]
WantedBy=multi-user.target
```

#### 4a-4. Trigger transcode on upload (server-side hook)

Either modify `pages/api/social/create-post.js` to set `transcode_status = 'queued'` when `content_type === 'video'`, OR add a Postgres trigger:

```sql
CREATE OR REPLACE FUNCTION fn_queue_video_transcode() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.content_type = 'video'
     AND (NEW.media_urls->>0) IS NOT NULL
     AND (
       (NEW.media_urls->>0) ILIKE '%.mov'
       OR (NEW.media_urls->>0) ILIKE '%.hevc'
       OR (NEW.media_urls->>0) ILIKE '%.heic'
       OR (NEW.media_urls->>0) ILIKE '%.mkv'
       OR (NEW.media_urls->>0) ILIKE '%.avi'
     )
  THEN
    NEW.transcode_status := 'queued';
    NEW.original_media_url := (NEW.media_urls->>0);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tr_queue_video_transcode
  BEFORE INSERT ON social_posts
  FOR EACH ROW EXECUTE FUNCTION fn_queue_video_transcode();
```

### Architecture B — Supabase Edge Function (alternative)

Use a Deno Edge Function with `ffmpeg-static`. Caveat: Edge Functions have a 150MB request body limit and CPU time limits — won't handle large iPhone clips (240MB observed). Only viable if you also chunk + reassemble. Architecture A is simpler.

## 5. Verification

After deploying, verify with one new iPhone upload:

```sql
SELECT id, content_type,
       media_urls->>0 AS current_url,
       original_media_url,
       transcode_status,
       transcode_error
FROM social_posts
WHERE author_id = '47965354-0e56-43ef-931c-ddaab82af765'
ORDER BY created_at DESC LIMIT 5;
```

`transcode_status` should land on `done`, `media_urls[0]` should end in `.mp4`, `original_media_url` should be the original `.mov`. Then opening the post in Chrome desktop should play the video.

## 6. Rollback

```sql
-- Re-point media_urls back to the original
UPDATE social_posts
SET media_urls = jsonb_set(media_urls, '{0}', to_jsonb(original_media_url))
WHERE original_media_url IS NOT NULL AND transcode_status = 'done';

-- Disable trigger if it caused side effects
DROP TRIGGER IF EXISTS tr_queue_video_transcode ON social_posts;
```

Stop the worker:

```bash
systemctl stop sp-transcode && systemctl disable sp-transcode
```

## 7. Hand-back

After the first new upload transcodes successfully:

1. Update `.memory/SUMMARY.md` (local-only) under "Solved problems":
   ```
   - 2026-04-30 — HEVC transcode worker live (commit <sha>). New iPhone uploads now play in Chrome desktop within ~30s of post creation.
   ```
2. Mark task `#82` (Reels videos don't play when clicked) as completed.
3. Delete `.agent/handoffs/2026-04-29-server-side-hevc-transcode.md` in your verification commit.
4. Optional follow-up tasks to file:
   - Backfill all existing HEVC posts (already queued by the migration's UPDATE statement)
   - Generate a thumbnail via ffmpeg as part of transcode (replaces the canvas-based client thumbnail for legacy posts)
   - Add `transcode_status='running'` UI badge so users see "Optimizing for all browsers..." until done

## 8. References

- Existing TUS upload code: `src/lib/backgroundVideoUpload.js`
- Reels playback: `pages/hub/reels.js` line ~1790 (the `<video>` element with `onError` already added 2026-04-29)
- Open Claw cron pattern (similar systemd setup): `scripts/openclaw-cron-dispatcher.py` + `scripts/deploy-openclaw.sh`
- ffmpeg recipe rationale: H.264 baseline + AAC + faststart is the most-compatible web-safe container; renders on every browser since Safari 5 / Chrome 4.
