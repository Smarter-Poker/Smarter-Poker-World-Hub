# Workers VM — Provisioning Log (Phase 2B.1 deploy)

**Provisioned:** 2026-04-24T16:23Z
**By:** Cowork agent via computer-use-triggered .command (2026-04-24)

## Server
- **Hetzner ID:** 127930016
- **IP:** 178.104.180.220
- **Type:** CX23 (2 vCPU shared x86, 4 GB RAM, 40 GB disk) / Ubuntu 22.04 / fsn1-dc14
- **Hostname:** workers-dispatcher
- **SSH:** `ssh -i ~/.ssh/workers_ed25519 root@178.104.180.220`
- **Role:** runs Docker container `smarter-poker-workers`
- **Monthly cost:** €4.99
- **Separate from:** `openclaw-dispatcher` (127861894, 178.104.160.250)

## Why CX23 (not CPX21 as AG prompt originally specified)
The AG prompt called for CPX21 in nbg1. Hetzner has since migrated: CPX11/21 are
no longer available in any EU datacenter (only ash/hil in US). CX23 is the
current-gen x86 equivalent in fsn1 at the cheapest tier matching the spec
(2 vCPU, 4 GB RAM, 40 GB disk). When Phase 2B.2 brings Chromium/puppeteer
workloads that need AMD + more RAM, in-place resize to CPX32 (AMD, 4 vCPU,
8 GB, €16/mo) or CPX22 (AMD, 2 vCPU, 4 GB, €9.49/mo) via Hetzner API is a
single call — no re-provision needed.

## Container
- **Image:** `ghcr.io/smarter-poker/smarter-poker-workers:latest` (digest sha256:d23bf66174000770cb134c6395880895344e952dbc937953d4208baf8a7de890)
- **Port:** `127.0.0.1:8081` (localhost-only; public port NOT exposed — reverse proxy comes in Phase 2B.2)
- **Compose file:** /opt/workers/docker-compose.yml
- **Env file:** /opt/workers/.env (0600, owned by workers:workers)

## Credentials (Keychain — never in this file)
- `smarter-poker/workers-server-ip` → 178.104.180.220
- `smarter-poker/workers-server-id` → 127930016
- `~/.ssh/workers_ed25519` → SSH private key (0600)

## GHCR auth
The AG prompt assumed a Keychain entry `smarter-poker/github-pat-ghcr-read`.
That didn't exist. Fallback worked: `gh auth token` plus GitHub username from
`gh api user -q .login` (danbek4545). `docker login ghcr.io -u danbek4545`
succeeded where `-u Smarter-Poker` returned unauthorized. Keychain entry
should be created to make future redeploys self-contained:
`security add-generic-password -U -a smarter-poker -s github-pat-ghcr-read -w '<gh auth token>'`

## Verified
- ✅ systemd docker.service active, UFW enabled
- ✅ Container `smarter-poker-workers` Up, healthy
- ✅ /health returns 200: `{"status":"ok","service":"smarter-poker-workers","node":"v20.20.2"}`
- ❌ /cron/_scaffold-ping from openclaw: timed out (expected — port 8081 is localhost-only)

## Known gap — deferred to Phase 2B.2
The openclaw dispatcher cannot currently reach the workers container because
port 8081 is bound to 127.0.0.1 on the workers VM. Options (pick one in 2B.2):

1. **Caddy reverse proxy** on workers VM listening on :443 with TLS, IP-allowlisted
   to openclaw's public IP + workers own IP. Adds public port 443 with HTTPS.
2. **Hetzner private network** (free): attach both VMs to a 10.0.0.0/8 network,
   bind workers container to 10.x IP on port 8081. openclaw reaches via
   `http://10.x.x.x:8081`. No public exposure.

Recommendation: private network. Simpler, no TLS cert to manage, zero public
attack surface.

## Next
Phase 2B.2 — (a) set up Hetzner private network OR Caddy reverse proxy,
then (b) port remaining cron handlers from monolith `pages/api/cron/`
into `src/routes/` in the workers repo (16/53 already ported per
phase-2b2-wrap-14-of-16.md).

## 2B.2(a) Update — Private network wired (2026-04-24T16:51:44Z)
- Hetzner network `smarter-poker-internal` (id=12159885, 10.0.0.0/16) linking openclaw + workers
- openclaw private IP: 10.0.0.2
- workers  private IP: 10.0.0.3
- Container rebound: 0.0.0.0:8081 (was 127.0.0.1:8081)
- UFW: allow from 10.0.0.0/16 to port 8081/tcp; public 8081 still blocked
- ALLOWED_CRON_IPS now: 10.0.0.2,178.104.160.250,127.0.0.1

### Gate verification (RED)
- 8b openclaw→workers /health: PASS
- 8c openclaw→workers /cron/_scaffold-ping authed: FAIL
- 8d openclaw→workers unauthed → 401: FAIL
- 8e Mac→workers public → blocked: PASS
