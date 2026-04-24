# Workers VM — Provisioning Log (Phase 2B.1 deploy)

**Provisioned:** 2026-04-24T16:30:51Z
**By:** Cowork agent via computer-use-triggered .command (2026-04-24)

## Server
- **Hetzner ID:** 127930016
- **IP:** 178.104.180.220
- **Type:** CX23 (2 vCPU shared x86, 4 GB RAM, 40 GB SSD) / Ubuntu 22.04 / fsn1
- **Hostname:** workers-dispatcher
- **SSH:** `ssh -i ~/.ssh/workers_ed25519 root@178.104.180.220`
- **Role:** runs Docker container `smarter-poker-workers`
- **Separate from:** `openclaw-dispatcher` (127861894, 178.104.160.250)

## Container
- **Image:** `ghcr.io/smarter-poker/smarter-poker-workers:latest`
- **Port:** 127.0.0.1:8081 (not publicly exposed — reverse proxy in Phase 2B.2)
- **Compose file:** /opt/workers/docker-compose.yml
- **Env file:** /opt/workers/.env (0600, owned by workers:workers)

## Credentials (Keychain — never in this file)
- `smarter-poker/workers-server-ip` → 178.104.180.220
- `smarter-poker/workers-server-id` → 127930016
- `smarter-poker/github-pat-ghcr-read` → PAT with `read:packages` scope
- `~/.ssh/workers_ed25519` → SSH private key (0600)

## Next
Phase 2B.2 — port cron handlers from World Hub's `pages/api/cron/*.js`
into this service's `src/routes/*.ts`, wave by wave.
