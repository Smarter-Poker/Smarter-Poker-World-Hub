# Hetzner Game Server — Credentials & Access

**Type:** CONTEXT
**Date Captured:** 2026-04-13
**Project:** Club Arena / Game Server Infrastructure

---

## Server Details

- **IP:** 178.156.160.206
- **SSH:** `ssh root@178.156.160.206` (key-based auth, no password needed)
- **Hetzner Server ID:** 125093929
- **Server Name:** club-arena-engine
- **Spec:** CPX11 — 2 cores, 2GB RAM, 40GB disk
- **Docker Container:** `club-arena-engine`
- **Port Mapping:** 0.0.0.0:8080 → 8080/tcp
- **Repo Path on Server:** `/opt/club-arena`
- **Domain:** engine.smarter.poker

## Hetzner API Token

> **SECURITY NOTE (2026-04-21):** The previously-committed token was exposed
> in public git history (commits 0916679b, c60011f05). It MUST be rotated
> via https://console.hetzner.cloud/ → Security → API Tokens. Store the
> replacement in macOS Keychain or a password manager — **never** in this
> file, the repo, or any tracked location.
>
> Retrieve at runtime via: `security find-generic-password -a smarter-poker -s hetzner-api -w`
> (or set `HETZNER_API_TOKEN` in `~/.zshrc` / local shell env — also gitignored).

```
REDACTED — see macOS Keychain entry "hetzner-api" under account "smarter-poker"
```

## Common Operations

```bash
# SSH in
ssh root@178.156.160.206

# Restart game server
ssh root@178.156.160.206 "docker restart club-arena-engine"

# Pull latest code and restart
ssh root@178.156.160.206 "cd /opt/club-arena && git pull origin main && docker restart club-arena-engine"

# View logs
ssh root@178.156.160.206 "docker logs club-arena-engine --tail 100"

# List Hetzner servers via API (load token from keychain, do NOT inline)
TOKEN=$(security find-generic-password -a smarter-poker -s hetzner-api -w)
curl -H "Authorization: Bearer $TOKEN" https://api.hetzner.cloud/v1/servers

# Reset root password via API (emergency only)
curl -X POST -H "Authorization: Bearer $TOKEN" https://api.hetzner.cloud/v1/servers/125093929/actions/reset_password
```

## Related

- RealtimeSync.js (World Hub: `src/lib/poker-engine/RealtimeSync.js`) — hole card write logic
- GameController.js — creates Supabase client with service_role key
- Server repo structure may differ from World Hub — verify file paths on server
