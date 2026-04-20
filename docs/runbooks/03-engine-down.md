# 03 — Engine Down (Hetzner Game Server)

## When to use

- `https://engine.smarter.poker/health` returns non-200 or times out.
- pm2 reports the process as `errored` or cycling restart.
- Club Arena clients show "reconnecting…" banner persistently.
- Prometheus alert `engine_websocket_connections_total` drops > 80% in
  one minute.

## Prerequisites

- SSH access to `engine.smarter.poker` (Hetzner cloud server).
- `pm2` CLI familiarity.
- Ability to trigger a redeploy from GitHub (game-engine-deploy workflow).

## Symptoms

The Hetzner engine is a single process managed by pm2 with systemd as
the supervisor. Failure modes:

**A. Crash loop.** `pm2 list` shows `restart` count climbing every few
seconds. Usually a bad release — an unhandled exception on boot.

**B. Wedged process.** `pm2 list` shows `online` but `/health` times out
or the process hasn't logged in minutes. Usually a blocking operation
in an event loop — database call without timeout, infinite loop in game
tick.

**C. Host-level.** SSH itself times out, Hetzner dashboard shows alerts,
or iperf to the box is degraded. Hetzner-side issue or a noisy
neighbour.

## Procedure

### Step 1 — Quick health check

```bash
# From your laptop
curl -sw "\n%{http_code} %{time_total}s\n" \
  https://engine.smarter.poker/health

# SSH in
ssh engine.smarter.poker

# Process state
pm2 list
pm2 logs --lines 100
```

If SSH works, it's almost certainly A or B. If SSH fails, jump to Step 5.

### Step 2 — Diagnose crash loop (A)

```bash
pm2 logs engine --err --lines 200 --nostream
```

Look for the top of a stack trace. Common patterns:

- **`Error: getaddrinfo EAI_AGAIN supabase`** — DNS or Supabase unreachable
  from Hetzner. Check runbook 02.
- **`Error: Cannot find module 'X'`** — a new import slipped through
  without being installed. The current release is broken; roll back.
- **`Error: listen EADDRINUSE :::8080`** — port contention after an
  unclean shutdown. Kill orphan process:
  ```bash
  sudo lsof -i :8080
  sudo kill -9 <pid>
  pm2 restart engine
  ```

### Step 3 — Diagnose wedged process (B)

```bash
pm2 monit   # live resource view
# OR, for a heap dump:
pm2 sendSignal SIGUSR2 engine
```

If CPU is pegged at 100% on one core, the event loop is stuck in a
synchronous operation. Forced restart:

```bash
pm2 restart engine
# Watch it come back healthy
pm2 logs engine --lines 50
curl -s https://engine.smarter.poker/health | jq
```

Capture the heap dump from `/tmp/` before restart if possible — it's
your only forensic artifact.

### Step 4 — Roll back to previous release

If the current release is bad, the fastest fix is to redeploy the last
known-good commit via the GitHub Actions workflow:

```bash
# Find the last green run
gh run list --workflow engine-deploy.yml --limit 10

# Re-run the last green
gh run rerun <run-id>
```

Or on the engine box directly:

```bash
cd /srv/engine
git log --oneline -10
git checkout <last-good-sha>
npm ci --omit=dev
pm2 restart engine --update-env
```

Confirm health comes back green before walking away.

### Step 5 — Host-level issue (C)

1. Check Hetzner Cloud Console (https://console.hetzner.cloud) → Servers
   → `engine`. Look at the activity log for alerts.
2. Verify from a different network that SSH and `/health` are both
   unreachable — confirms it's not your local egress.
3. If the server is responsive to console but not network, restart the
   network interface via console's Rescue menu.
4. If the host is fully wedged, hard reset from the console. **This is
   a destructive op** — in-flight games will drop. Announce in
   `#incidents` first. Engine is designed to recover game state from
   Supabase on boot (see V8 Bible FIX-127 crash recovery).

### Step 6 — Verify engine recovery

```bash
# Health
curl -s https://engine.smarter.poker/health | jq

# Connection count recovering?
# From Grafana: engine_websocket_connections_total panel

# Active games resuming?
curl -s https://smarter.poker/api/admin/engine-status \
  -H "x-admin-secret: $ADMIN_SECRET" | jq '.tablesActive'
```

Watch for 10 minutes — pm2 restart counts should stop incrementing.

## Rollback

- **Bad release:** `git checkout <last-good-sha>` in `/srv/engine` and
  `pm2 restart`. This is itself the rollback.
- **Port-contention fix:** the `kill -9` above is already the mitigation;
  nothing to undo.
- **Host hard-reset:** there's no "undo" for a reset. Your followup is
  to make sure state recovery actually worked — manually inspect a few
  `games` rows in Supabase to confirm state is internally consistent.

## Escalation

- **If engine stays red after a rollback to last-good:** the issue isn't
  the release — it's the DB or a dependent service. Go to runbook 02.
- **If Hetzner dashboard reports an incident:** nothing to do but wait.
  Post updates to `#incidents` every 10 minutes with the Hetzner status
  ETA.
- **If a hard reset doesn't boot the server:** open a ticket with Hetzner
  support (support@hetzner.com) and page the engineering lead. The
  rescue system may be needed.

## Postmortem

Required for any engine outage > 5 minutes — this is the core game loop,
it's always SEV-1 or SEV-2.

Include: the failure mode (A/B/C), whether pm2's health check should
have caught it earlier (tune thresholds if no), whether crash recovery
successfully restored game state (check the post-incident hand-history
audit), and whether any player balances or hand results were affected.
If balances were affected, this also triggers runbook 05.
