# HANDOFF: Deploy the auto-transcode cron entry to Hetzner Open Claw

**Created:** 2026-04-29 by Cowork-Claude
**For:** Anyone with `hetzner-api` entry in macOS keychain (or SSH key for the Hetzner Open Claw VM)
**Blocks:** task #83 closing

## 1. Goal

Roll the new `/api/cron/transcode-videos` schedule (added in commit
`7588197e06`) onto the Hetzner Open Claw VM so it actually fires every
minute. The Vercel handler is deployed; only the scheduler still needs
syncing.

## 2. Required capabilities

- `bash` access on Dan's Mac (or any host with the
  `smarter-poker / hetzner-api` keychain entry that
  `scripts/deploy-openclaw.sh` reads)
- The Hetzner SSH key the existing `deploy-openclaw.sh` already uses
  for prior deploys

## 3. Pre-conditions

- `origin/main` HEAD is at or after `7588197e06`
- `scripts/openclaw-cron-dispatcher.py` contains the line
  `('/api/cron/transcode-videos',          dict(minute='*/1')),`

## 4. Steps

```bash
cd ~/Documents/Smarter-Poker-World-Hub
git pull
bash scripts/deploy-openclaw.sh
```

The deploy script `scp`s the updated Python file and runs
`systemctl restart openclaw.service` on the Hetzner VM.

## 5. Verification

```bash
CRON_SECRET=$(grep '^CRON_SECRET=' .env.local | cut -d= -f2- | tr -d '"')
curl -sS -H "Authorization: Bearer $CRON_SECRET" \
  https://smarter.poker/api/cron/transcode-videos | head -3
```

Expected: `{"processed":0,"message":"nothing queued"}` (because the 3
existing HEVC posts were already transcoded out-of-band on 2026-04-29).
Upload a new iPhone video, wait 60–90s, re-run the curl — should now
report `{"processed":1, ..., "mode":"reencode"}` (or `"mode":"remux"`
if the source was already H.264).

Confirm the scheduler is firing it on the Hetzner side:

```bash
ssh -i "$SSH_KEY" "root@$SERVER_IP" \
  "journalctl -u openclaw -n 40 --no-pager | grep transcode"
```

Should see `cron transcode-videos http_200` once a minute.

## 6. Rollback

```bash
git revert 7588197e06
git push
bash scripts/deploy-openclaw.sh
```

## 7. Hand-back

1. Mark task `#83` complete.
2. Append a line to `.memory/SUMMARY.md` (local) under "Solved problems".
3. Delete `.agent/handoffs/2026-04-29-deploy-transcode-cron.md` in
   your verification commit.

## 8. References

- Handler: `pages/api/cron/transcode-videos.js`
- Dispatcher: `scripts/openclaw-cron-dispatcher.py` (entry near line 178)
- Deploy script: `scripts/deploy-openclaw.sh`
- Migration: applied as `20260430_video_transcode_tracking` (in DB)
