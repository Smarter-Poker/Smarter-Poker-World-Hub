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

## 2B.2(a) RE-VERIFIED GREEN — 2026-04-24T17:13Z

Initial 2B.2(a) attempt returned 403 on authed calls. Root cause: the
Hono `ipAllowlist` middleware in the container (dist/index.mjs line
260776) reads the client IP ONLY from `X-Forwarded-For` or `X-Real-IP`
HTTP headers — it does NOT fall back to the TCP socket peer. Compiled
source excerpt:

```js
const xff = c.req.header("X-Forwarded-For") ?? "";
const clientIp = xff.split(",")[0]?.trim() || c.req.header("X-Real-IP") || "";
if (!clientIp || !allowed.includes(clientIp)) {
  return c.json({ error: "forbidden" }, 403);
}
```

With openclaw sending a plain curl (no proxy headers), `clientIp=""` →
403. Fix: set `X-Forwarded-For: <openclaw-private-ip>` on every cron
call that targets a workers URL.

### Six-gate verification (all PASS)

| # | Test | Result |
|---|---|---|
| 8b | `GET /health` from openclaw via 10.0.0.3 (no headers) | ✅ 200 with JSON |
| 8c | `GET /cron/_scaffold-ping` authed + `X-Forwarded-For: 10.0.0.2` | ✅ 200 `{"ok":true,...}` |
| 8d | same as 8c but no Authorization header | ✅ 401 |
| 8e | authed but NO X-Forwarded-For | ✅ 403 (IP check) |
| 8f | authed + `X-Forwarded-For: 1.2.3.4` (unallowlisted) | ✅ 403 |
| 8g | from Dan's Mac to workers' PUBLIC IP (UFW block) | ✅ 000 (timeout) |

## CRITICAL for 2B.2(b) — dispatcher must send X-Forwarded-For

When the Open Claw dispatcher's `fire_cron()` eventually points at a
workers URL (e.g., flipping `/cron/video-library-*` from localhost-only
SCRIPT_JOBS to HTTP calls against `http://10.0.0.3:8081/cron/...`),
the HTTP request MUST include:

```
X-Forwarded-For: 10.0.0.2     # openclaw's private IP (or hostname:
                              # bind via DISPATCHER_PRIVATE_IP env var)
```

Otherwise the middleware rejects with 403 forbidden. This is a
one-line change in `scripts/openclaw-cron-dispatcher.py::fire_cron`:

```python
headers = {
    'Authorization': f'Bearer {CRON_SECRET}',
    'User-Agent':    'OpenClaw-CronDispatcher/1.3',
    'Accept':        'application/json',
    'X-Forwarded-For': os.environ.get('DISPATCHER_PRIVATE_IP', '10.0.0.2'),  # NEW
}
```

Workers endpoints consume the header; Vercel endpoints ignore it. Safe
to set unconditionally.

## 2B.2(b) GREEN — video-library routes flipped to workers HTTP (2026-04-24T22:49Z)

`scripts/openclaw-cron-dispatcher.py` upgraded to v1.4 with:

* `WORKERS_PREFERRED` map: 4 `/api/cron/video-library-*` paths → `/cron/video-library-*`
* `_workers_dispatch(path)` helper
* `WORKERS_BASE_URL` and `DISPATCHER_PRIVATE_IP` read from env
* `fire_cron()` now sends `X-Forwarded-For: <DISPATCHER_PRIVATE_IP>` on every call (safe no-op for Vercel, required for workers)
* `should_skip_on_secondary` narrowed — only skips SCRIPT_JOBS that are NOT workers-ported
* Registration on secondary: 57 registered / 0 skipped (was 53/4)

Hetzner `/opt/openclaw/.env` now has:
```
DISPATCHER_ROLE=secondary
WORKERS_BASE_URL=http://10.0.0.3:8081
DISPATCHER_PRIVATE_IP=10.0.0.2
```

### Verified green — all 4 fire successfully

Direct module call from openclaw (with full env loaded):

```
▶ Firing /api/cron/video-library-views → workers
✅ /api/cron/video-library-views → workers 200 [2.1s]
▶ Firing /api/cron/video-library-backfill → workers
✅ /api/cron/video-library-backfill → workers 200 [1.5s]
▶ Firing /api/cron/video-library-purge → workers
✅ /api/cron/video-library-purge → workers 200 [1.9s]
▶ Firing /api/cron/video-library-scraper → workers
✅ /api/cron/video-library-scraper → workers 200 [1.6s]
```

Direct `curl` probe (bypassing module):

```
video-library-views    → 200
video-library-backfill → 200
video-library-purge    → 200
video-library-scraper  → 200
```

### Next scheduled firings

* video-library-views    — Fri 22:00 UTC (weekly)
* video-library-backfill — Sat 23:00 UTC (weekly)
* video-library-purge    — Sun 00:00 UTC (weekly)
* video-library-scraper  — 06:00 UTC daily

The first scheduled auto-fire in production happens tonight at 06:00 UTC
(video-library-scraper). Journalctl should show `✅ .../video-library-scraper → workers 200` at that time.
