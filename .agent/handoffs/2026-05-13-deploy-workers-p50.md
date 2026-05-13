# RULE 0 Handoff: P50 Workers Deploy

**Created:** 2026-05-13  
**Priority:** MEDIUM — yt-transcode-worker has 7+ self-healer commits unreleased to Hetzner VM  
**Requires:** Mac with SSH key at `~/.ssh/openclaw_ed25519` + macOS Keychain access  
**Script:** `scripts/deploy-workers.sh` (created this session, commit 3bd76e43+)

---

## What this does

Syncs the latest `scripts/yt-transcode-worker/index.js` to the Hetzner
`reels-transcode-worker` VM (ID 128782737, IP `5.161.49.206`, ash region)
and restarts `sp-yt-transcode.service`.

The script was missing from disk — created this session. It follows the
same pattern as `scripts/deploy-openclaw.sh` (SSH key + Keychain IPs).

---

## Execution

From the repo root on your Mac:

```bash
# 1. Dry run first — shows SHA diff, no changes applied
bash scripts/deploy-workers.sh --dry-run

# 2. If the SHAs differ (they should — 7+ commits since last VM sync):
bash scripts/deploy-workers.sh
```

### Expected output (success)
```
[deploy-workers] reels-transcode-worker : 5.161.49.206 (ash)
[deploy-workers] Deploying yt-transcode-worker/index.js → 5.161.49.206:...
[deploy-workers] Restarting sp-yt-transcode.service ...
[deploy-workers] sp-yt-transcode.service: active
[deploy-workers] Recent logs:
[yt-worker ...] Starting yt-transcode-worker
[yt-worker ...]   Worker ID: hetzner-ash-yt-01
...
[deploy-workers] Workers deploy complete.
```

---

## If Keychain entries are missing

The script needs `reels-transcode-worker-ip` in Keychain. If it's not there,
set the env var instead:

```bash
REELS_WORKER_IP=5.161.49.206 bash scripts/deploy-workers.sh
```

Or add it to Keychain:
```bash
security add-generic-password -a smarter-poker -s reels-transcode-worker-ip -w 5.161.49.206
```

---

## What's changed in the worker since last deploy

Latest commits to `scripts/yt-transcode-worker/index.js`:

- `004cddd` — TDZ fix in Reels.jsx + dead destructure killing fallback sweep
- `38051f8` — feat: strandedReelRecoverySweep (7th self-healer)
- `b48b42d` — fix: harden VIP guard against race conditions
- `9b9933d` — feat: deadVideoHidingSweep (6th self-healer)
- `ed745c2` — feat: iframeThumbnailDeriveSweep (5th self-healer)
- `8d83422` — feat: nativePosterBackfillSweep (4th self-healer)
- `599dadcf` — fix: transientFailureRetrySweep (3rd self-healer)

The VM is running whichever version was last manually synced. These self-healers
fix 404/stuck reels; without them the worker keeps retrying but misses recovery paths.

---

## Verification after deploy

```bash
# Watch worker pick up queued jobs:
ssh -i ~/.ssh/openclaw_ed25519 openclaw@5.161.49.206 \
  'sudo journalctl -u sp-yt-transcode -f --no-pager'

# Check job queue health in Supabase:
# SELECT status, count(*) FROM video_transcode_jobs GROUP BY status;
```

---

## Hetzner VM reference

| VM | ID | IP | Region | Service |
|---|---|---|---|---|
| `reels-transcode-worker` | 128782737 | 5.161.49.206 | ash | sp-yt-transcode.service |
| `workers-dispatcher` | 127930016 | 178.104.180.220 | fsn1 | Docker cron handlers |

SSH user: `openclaw` | SSH key: `~/.ssh/openclaw_ed25519`
