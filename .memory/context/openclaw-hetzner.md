# OpenClaw on Hetzner — Provisioning Log

**Provisioned:** 2026-04-23T23:39:20Z
**By:** AntiGravity (Phase 2A.1)

## Server
- **Hetzner ID:** 127861894
- **IP:** 178.104.160.250
- **Type:** CX23 (2 vCPU, 4 GB RAM, 40 GB disk) / Ubuntu 22.04 / nbg1
- **Hostname:** openclaw-dispatcher
- **SSH:** `ssh -i ~/.ssh/openclaw_ed25519 root@178.104.160.250` (key-based; keychain has Hetzner API token under `smarter-poker / hetzner-api`)
- **Monthly Cost:** €4.99

## Credentials
ALL stored in macOS Keychain — NOT in this file:
- `smarter-poker / hetzner-api` → Hetzner API token
- `smarter-poker / openclaw-server-ip` → 178.104.160.250
- `smarter-poker / openclaw-server-id` → 127861894
- `~/.ssh/openclaw_ed25519` → SSH private key (0600)

## Dispatcher
- Path: `/opt/openclaw/dispatcher.py`
- venv: `/opt/openclaw/venv/`
- systemd: `openclaw.service` (enabled, active)
- Logs: `journalctl -u openclaw -f`
- Log file: `/opt/openclaw/.smarter-poker/logs/openclaw-cron.log`

## Status at hand-off
- Registered jobs count: 16
- Last journal line: `deploy-error-poll executed successfully` (fired on schedule at 23:46 UTC)
- Mac LaunchAgent: **STILL RUNNING** (parallel-run begins in Phase 2A.2)

## Cleanup performed
- Deleted 4 orphaned cax41 servers (IDs: 126910918, 126910920, 126910922, 126910923)
- All had UUID names, no labels, created 2026-04-14 — likely accidental batch provisioning
- Savings: €147.96/mo (~$160/mo)

## Token rotation — DEFERRED
- The leaked token (`yKYOvu…`) is still live — Hetzner API tokens can ONLY be revoked via the Web Console UI (no API endpoint)
- Dan needs to log into https://console.hetzner.cloud/ → Security → API Tokens → revoke the old token and generate a new one
- Once rotated, update Keychain: `security add-generic-password -U -a smarter-poker -s hetzner-api -w '<NEW_TOKEN>'`
