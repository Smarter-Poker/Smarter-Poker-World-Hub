# YT Transcode Worker — Hetzner Deploy Steps

One-time deploy of the YouTube → native MP4 conversion worker on the
existing Hetzner box (the same one running `sp-transcode.service`).

These commands run from your **local laptop**. Replace `<HETZNER_IP>` with
the Ashburn box's public IP. Replace `<SERVICE_KEY>` with the value of
`SUPABASE_SERVICE_ROLE_KEY` from `.env.local` (paste it into the `.env`
file directly on the box, never into shell history with `echo`).

## 1. Install yt-dlp + python3 on the box

```bash
ssh openclaw@<HETZNER_IP> '
  set -e
  sudo apt-get update -y
  sudo apt-get install -y python3 python3-pip ffmpeg
  sudo pip3 install --upgrade --break-system-packages yt-dlp
  yt-dlp --version
'
```

`yt-dlp --version` should print something like `2024.xx.xx`. If `apt-get`
balks at `--break-system-packages` (older Ubuntu), drop that flag.

## 2. Create the worker directory and install deps

```bash
ssh openclaw@<HETZNER_IP> '
  sudo mkdir -p /opt/smarter-poker/yt-transcode-worker
  sudo chown openclaw:openclaw /opt/smarter-poker/yt-transcode-worker
'

# From the repo root on your laptop:
scp scripts/yt-transcode-worker/index.js \
    scripts/yt-transcode-worker/package.json \
    openclaw@<HETZNER_IP>:/opt/smarter-poker/yt-transcode-worker/

ssh openclaw@<HETZNER_IP> '
  cd /opt/smarter-poker/yt-transcode-worker
  npm install --omit=dev
'
```

## 3. Write the env file (root-owned, 0600)

```bash
ssh openclaw@<HETZNER_IP> '
  sudo tee /etc/sp-yt-transcode.env >/dev/null <<EOF
NEXT_PUBLIC_SUPABASE_URL=https://kuklfnapbkmacvwxktbh.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<SERVICE_KEY>
WORKER_ID=hetzner-ash-yt-01
MAX_CONCURRENT_YT=3
EOF
  sudo chmod 600 /etc/sp-yt-transcode.env
  sudo chown root:root /etc/sp-yt-transcode.env
'
```

## 4. Install + start the systemd unit

```bash
scp scripts/yt-transcode-worker/sp-yt-transcode.service \
    openclaw@<HETZNER_IP>:/tmp/sp-yt-transcode.service

ssh openclaw@<HETZNER_IP> '
  sudo mv /tmp/sp-yt-transcode.service /etc/systemd/system/sp-yt-transcode.service
  sudo systemctl daemon-reload
  sudo systemctl enable sp-yt-transcode
  sudo systemctl start sp-yt-transcode
  sudo systemctl status sp-yt-transcode --no-pager
'
```

## 5. Verify it's polling

```bash
ssh openclaw@<HETZNER_IP> 'sudo journalctl -u sp-yt-transcode -n 50 --no-pager'
```

You should see something like:

```
[yt-worker 2026-05-01T...] Starting yt-transcode-worker
[yt-worker 2026-05-01T...]   Worker ID:        hetzner-ash-yt-01
[yt-worker 2026-05-01T...]   Concurrency:      3
[yt-worker 2026-05-01T...]   Poll: idle 60s / busy 5s
```

## 6. Smoke test — queue ONE job by hand

In Supabase SQL editor:

```sql
-- Pick any existing YouTube reel
WITH r AS (
  SELECT id, author_id, video_url FROM social_reels
  WHERE video_url LIKE '%youtube%'
  LIMIT 1
)
INSERT INTO video_transcode_jobs (reel_id, user_id, source_url, youtube_url,
                                   source_type, status, target_format, target_bitrate)
SELECT r.id, r.author_id, r.video_url, r.video_url,
       'youtube', 'queued', 'h264_1080p', 2500000
FROM r;
```

Watch journalctl — should see the worker pick it up within 5 seconds. If
the job completes successfully, `social_reels.video_url` is now a Supabase
public URL and `source_type='native'`. The reel will start playing as a
native `<video>` element on the next page load.

## 7. Run the bulk backfill

Once the smoke test passes, run from your laptop:

```bash
node scripts/backfill-youtube-reels.js --dry-run    # preview counts + cost
node scripts/backfill-youtube-reels.js              # actually queue
```

Monitor:

```sql
SELECT * FROM v_yt_jobs_health;
SELECT * FROM v_yt_pipeline_health;
```

## Updating the worker later

```bash
scp scripts/yt-transcode-worker/index.js openclaw@<HETZNER_IP>:/opt/smarter-poker/yt-transcode-worker/index.js
ssh openclaw@<HETZNER_IP> 'sudo systemctl restart sp-yt-transcode'
```

## Tearing it down

```bash
ssh openclaw@<HETZNER_IP> '
  sudo systemctl stop sp-yt-transcode
  sudo systemctl disable sp-yt-transcode
  sudo rm /etc/systemd/system/sp-yt-transcode.service
  sudo rm /etc/sp-yt-transcode.env
  sudo rm -rf /opt/smarter-poker/yt-transcode-worker
  sudo systemctl daemon-reload
'
```
