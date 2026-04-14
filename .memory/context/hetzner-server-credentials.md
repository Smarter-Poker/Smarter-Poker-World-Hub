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

```
yKYOvufn7iTRIhFlB9TnSIdUYiqTCA3YtEqTmxPwvxpCIBjBFgAYIDNYv7aMi646
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

# List Hetzner servers via API
curl -H "Authorization: Bearer yKYOvufn7iTRIhFlB9TnSIdUYiqTCA3YtEqTmxPwvxpCIBjBFgAYIDNYv7aMi646" https://api.hetzner.cloud/v1/servers

# Reset root password via API (emergency only)
curl -X POST -H "Authorization: Bearer yKYOvufn7iTRIhFlB9TnSIdUYiqTCA3YtEqTmxPwvxpCIBjBFgAYIDNYv7aMi646" https://api.hetzner.cloud/v1/servers/125093929/actions/reset_password
```

## Related

- RealtimeSync.js (World Hub: `src/lib/poker-engine/RealtimeSync.js`) — hole card write logic
- GameController.js — creates Supabase client with service_role key
- Server repo structure may differ from World Hub — verify file paths on server
