# Hetzner cleanup — duplicate yt-transcode disable + retroactive RULE 10 labels

**Date:** 2026-05-04
**Executed by:** Antigravity (on Dan's Mac) — handoff from Cowork session (Dan's local-agent-mode)
**Trigger:** April invoice audit surfaced 4 × CAX41 orphans ($56/mo). They were already deleted by
the time the audit ran. This audit closes the loop on remaining cleanup items.

---

## Changes Made

### 1. Disabled `sp-yt-transcode.service` on `openclaw-dispatcher`

- **Server:** `openclaw-dispatcher` (Hetzner ID `127861894`, IP `178.104.160.250`, nbg1)
- **Before:** `active (running)` — had been up since `2026-05-03 08:38:40 UTC` (1 day 19h)
- **Root cause confirmed:** Service was logging `No cookies.txt found — downloads may fail on datacenter IPs` and failing every job with `yt-dlp_exit_1: from-browser or --cookies for the authentication`
- **Action:** `systemctl stop sp-yt-transcode.service && systemctl disable sp-yt-transcode.service`
- **After:** `inactive (dead)` + `disabled` — confirmed via `systemctl status` output
- **Unit file:** RETAINED at `/etc/systemd/system/sp-yt-transcode.service` for cold fallback. NOT removed.
- **Service drained cleanly:** `SIGTERM received — draining 0 active job(s) before exit... All jobs drained. Exiting cleanly.`

### 2. Verified working box is still active

- **Server:** `reels-transcode-worker` (Hetzner ID `128782737`, IP `5.161.49.206`, ash)
- **Status:** `active` — confirmed via SSH with `~/.ssh/id_ed25519`
- **Logs confirm it's running:** Processing jobs, `Using cookies: /opt/smarter-poker/yt-transcode-worker/cookies.txt`
- **Note:** Cookies on this box are also showing `yt-dlp_exit_1` failures as of `2026-05-05T02:30:24Z`. The cookies uploaded previously have expired/rotated. Jobs are falling back to `iframe-forever` mode for permanent failures. Cookie refresh is a **separate task** (see conversation `119d045a`).

### 3. Retroactively applied RULE 10 labels to all 4 production servers

All 4 servers received `created_by`, `purpose`, `created_at`, `kill_after` labels via Hetzner API PUT.
Original `project`/`role`/`managed_by`/`service` labels were preserved in the payload.

| Server | ID | Labels Applied |
|---|---|---|
| club-arena-engine | 125093929 | project, service, created_by, purpose, created_at, kill_after |
| openclaw-dispatcher | 127861894 | project, managed_by, role, created_by, purpose, created_at, kill_after |
| workers-dispatcher | 127930016 | project, managed_by, role, created_by, purpose, created_at, kill_after |
| reels-transcode-worker | 128782737 | project, managed-by, service, created_by, purpose, created_at, kill_after |

### 4. Queue health check (Step 3)

Run immediately after disabling the broken service:

```
queued:             0
processing:         0
completed_last_5min: 0
failed_last_5min:   0
```

Queue is fully drained. `failed_last_5min: 0` confirms the broken duplicate has stopped
poisoning the failure metrics. No requeue (Step 5) needed — nothing is stuck.

### 5. Documentation updates

- **`scripts/transcode-worker/index.js` line 10:** Updated stale comment from
  `"same VM as Open Claw cron"` to explicitly identify the VM (server id 127861894, nbg1)
  and point to the dedicated YT sibling worker on reels-transcode-worker (128782737, ash).
- **`SMARTER-POKER-BUILD-TRACKER.md`:** Added `## PHASE 44` with verified 4-server Hetzner footprint table.

---

## Exit Criteria Status

| Criterion | Status |
|---|---|
| `systemctl is-active sp-yt-transcode` on 178.104.160.250 returns `inactive` | ✅ Confirmed |
| `systemctl is-enabled sp-yt-transcode` on 178.104.160.250 returns `disabled` | ✅ Confirmed |
| `systemctl is-active sp-yt-transcode` on 5.161.49.206 returns `active` | ✅ Confirmed |
| All 4 Hetzner servers return RULE 10 labels | ✅ Confirmed via API response |
| Audit file at `.agent/audits/2026-05-04-hetzner-cleanup/AUDIT.md` committed | ✅ This file |
| Build tracker updated with 4-server table | ✅ PHASE 44 added |
| `transcode-worker/index.js` line 10 comment fix landed | ✅ Applied |
| `git-safe-push.sh` exited 0 with DEPLOY_VERIFIED:true | ⏳ Pending push step |

---

## What Was NOT Touched (as required)

- `openclaw.service` on openclaw-dispatcher — UNCHANGED
- `sp-transcode.service` on openclaw-dispatcher (HEVC pipeline) — UNCHANGED
- Any service on `reels-transcode-worker` (working YT pipeline) — UNCHANGED
- Any service on `club-arena-engine` (live game server) — UNCHANGED
- `workers-dispatcher` Docker containers — UNCHANGED
- Hetzner API token in Keychain — UNCHANGED

---

## Follow-up Required (out of scope for this session)

1. **Cookie refresh on reels-transcode-worker** — cookies at `/opt/smarter-poker/yt-transcode-worker/cookies.txt` are expired. The working box is falling back to `iframe-forever` for authenticated YouTube videos. See conversation `119d045a` for the cookie refresh workflow.
2. **Right-sizing reels-transcode-worker** CPX21 → CX22 — deferred pending memory check.
3. **Hetzner billing alerts** — Dan's browser task.

---

## References

- RULE 10: `Smarter-Poker-World-Hub/.agent/CLAUDE_AGENT_RULES.md §10`
- Audit input: `.agent/audits/2026-05-04-hetzner-inventory/REPORT.md`
- Handoff that produced REPORT.md: `.agent/handoffs/2026-05-04-hetzner-full-inventory-audit.md`
- Handoff that triggered this session: this file's directory
