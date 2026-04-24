# OpenClaw on Hetzner — Provisioning Log

**Provisioned:** 2026-04-23T23:39:20Z
**By:** AntiGravity (Phase 2A.1)

## Server
- **Hetzner ID:** 127861894
- **IP:** 178.104.160.250
- **Type:** CX23 (2 vCPU, 4 GB RAM, 40 GB disk) / Ubuntu 22.04.5 LTS / nbg1
- **Hostname:** openclaw-dispatcher
- **SSH:** `ssh -i ~/.ssh/openclaw_ed25519 root@178.104.160.250` (key-based; keychain has Hetzner API token under `smarter-poker / hetzner-api`)
- **Monthly Cost:** €4.99
- **SSH Key ID at Hetzner:** 111265593 (name: openclaw-deploy-key)

## Credentials
ALL stored in macOS Keychain — NOT in this file:
- `smarter-poker / hetzner-api` → Hetzner API token
- `smarter-poker / openclaw-server-ip` → 178.104.160.250
- `smarter-poker / openclaw-server-id` → 127861894
- `~/.ssh/openclaw_ed25519` → SSH private key (0600)

## Dispatcher
- Path: `/opt/openclaw/dispatcher.py`
- venv: `/opt/openclaw/venv/` (APScheduler 3.11.2, requests 2.33.1)
- systemd: `openclaw.service` (enabled, active)
- Logs: `journalctl -u openclaw -f`
- Log file: `/opt/openclaw/.smarter-poker/logs/openclaw-cron.log`
- Service user: `openclaw` (non-root, system user)

## Status at hand-off (2026-04-23T23:52Z)
- **systemd:** active (running), PID 10991, 20.7M memory, 6 min uptime
- **Registered jobs:** 16/16
- **Jobs executed successfully:** deploy-error-poll (*/2 min schedule) — 4 consecutive successful fires, all HTTP 200
- **Zero errors, zero exceptions**
- Mac LaunchAgent: **STILL RUNNING** (parallel-run begins in Phase 2A.2)

## Hetzner Inventory (post-cleanup)
| ID | Name | Type | Status | IP | Monthly |
|----|------|------|--------|-----|---------|
| 125093929 | club-arena-engine | cpx11 | running | 178.156.160.206 | €5.99 |
| 127861894 | openclaw-dispatcher | cx23 | running | 178.104.160.250 | €4.99 |
| **Total** | | | | | **€10.98** |

## Cleanup performed
- Deleted 4 orphaned cax41 servers (IDs: 126910918, 126910920, 126910922, 126910923)
- All had UUID names, no labels, created 2026-04-14T03:15:19Z — accidental batch provisioning
- **Savings: €147.96/mo (~$160/mo)**

## Token rotation — COMPLETED ✅
- **Old token** (`yKYOvu…`): REVOKED — returns HTTP 401
- **New token**: `openclaw-dispatcher-2026-04` (Read & Write) — stored in Keychain, verified HTTP 200
- **Rotated at:** 2026-04-24T00:43Z via Hetzner Console UI
- **Keychain updated:** `smarter-poker / hetzner-api` now holds the new token
