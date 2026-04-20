# Sentry autofix — architecture (as of 2026-04-20)

## Current architecture: cron-poll (CANONICAL)

The Sentry → Claude autofix loop is driven by a systemd timer running
every 15 minutes on **engine-01** (Hetzner, 178.156.160.206) at
`/opt/sentry-autofix-poller/`.

Flow:

1. `poll.mjs` queries Sentry's `/api/0/projects/{org}/{proj}/issues/`
   endpoint for each of the three tracked projects:
   - `javascript-nextjsmarter-poker-world-hubs` → `Smarter-Poker/Smarter-Poker-World-Hub`
   - `javascript-react` → `Smarter-Poker/club-arena` (dispatch target: `Smarter-Poker-Club-Arena`)
   - `javascript-react-3h` → `Smarter-Poker/club-commander-desktop`
2. Each new issue (deduped against `autofix_attempts` by `sentry_issue_id`)
   triggers a `repository_dispatch` of type `sentry-autofix` at the matching
   repo. The workflow `.github/workflows/sentry-autofix.yml` in each repo
   owns the rest of the loop: fetch event → call Claude → apply patch →
   open draft PR.
3. Dry-run phase 5.2.x: every fix lands as a **draft PR** labeled
   `sentry-autofix-draft`. Human merges after review. Phase 5.2.2 will flip
   auto-merge for allowlist-only paths.

### Why poll and not webhook?

The old webhook architecture suffered from HMAC rotation pain, Sentry
Internal Integration reprovisioning, Vercel cold-start timeouts
(Sentry retries after 15s), and obscure 401s when secrets drifted. The
poll architecture is:

- Stateless from Sentry's side (no integration config to maintain).
- Idempotent by design (dedup on `autofix_attempts.sentry_issue_id`).
- Cap-able via `POLL_MAX_DISPATCHES` (currently 5 per run).
- Kill-switchable in one env var (`POLL_ENABLED=false`).

## Retired components (do NOT restore)

- `pages/api/sentry/webhook.js` — deleted in this PR.
- `SENTRY_WEBHOOK_SECRET` — can be dropped from Vercel env.
- `/opt/sentry-autofix/docker-compose.yml` on engine-01 — renamed to
  `docker-compose.yml.retired-2026-04-20`; container `sp-sentry-autofix`
  stopped and removed.
- Sentry Internal Integration "World Hub Autofix Bridge" — safe to
  delete from Sentry's Settings → Custom Integrations (no longer
  receiving events).

## Operational runbook

- **Disable:** `ssh engine-01 'sed -i "s/^POLL_ENABLED=.*/POLL_ENABLED=false/" /opt/sentry-autofix-poller/.env'`
  (the next scheduled run will no-op exit).
- **Force run:** `ssh engine-01 'cd /opt/sentry-autofix-poller && POLL_DRY_RUN=true node poll.mjs --max=3'`.
- **Check timer:** `ssh engine-01 'systemctl status sentry-autofix-poller.timer'`.
- **Supabase attempts:** `select * from autofix_attempts order by created_at desc limit 20;`

## Related files

- `scripts/sentry-autofix/` in each repo — Claude runner (policy, prompt, patch apply, PR).
- `.github/workflows/sentry-autofix.yml` in each repo — the dispatched workflow.
- `/opt/sentry-autofix-poller/poll.mjs` — the poller on engine-01.
- `/etc/systemd/system/sentry-autofix-poller.{service,timer}` — systemd units.
