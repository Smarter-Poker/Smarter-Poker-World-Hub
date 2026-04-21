# Vercel Autofix

Closes the blind-spot the Sentry autofix loop has: Vercel **build-time**
failures (OOM, missing module, TS errors) never reach Sentry, so until
now a human had to watch the Vercel dashboard and fix them.

## What it does

```
cron-01 (Hetzner)
  └─ vercel-autofix-poll.timer  (every 2 min)
       └─ poll.mjs
            ├─ Vercel API → list recent deployments per project
            ├─ Classify ERROR / stale-QUEUED (≥15 min) by log tail:
            │     OOM | missing-dep | tsc | generic
            ├─ Supabase `autofix_attempts` dedupe + budget gate
            └─ GitHub repository_dispatch `vercel-autofix`
                 └─ .github/workflows/vercel-autofix.yml
                      ├─ oom          → fix-oom.mjs        (deterministic)
                      ├─ missing-dep  → fix-missing-dep.mjs (deterministic)
                      ├─ tsc / generic→ fix-claude.mjs     (Haiku 4.5)
                      └─ open-pr.mjs  (common draft-PR step)
```

## Why Haiku 4.5 and not Opus 4.6

Cost cap of <$50/month across both autofix loops. Haiku 4.5 at
$1/$5 per MTok input/output, `max_tokens: 3072`, and ≤2 source files
keeps one attempt well under $0.10. Budget circuit-breaker at $1.60/day
via the `autofix_budget_exhausted()` RPC shared with the Sentry loop.

## Safety rails

- Draft PRs only — never auto-merges.
- Strategy scripts can only patch files they were shown.
- `allowedPaths` set prevents Claude-driven path traversal.
- Missing-dep scope allowlist: `@supabase @sentry @next @anthropic @radix-ui
  @tailwindcss @tanstack @types @vercel @testing-library @playwright`.
- Per-commit unique index blocks re-attempt churn.
- Cost cap kills the loop for the day if it spikes.

## Deploy

### 1. Apply the Supabase migration
```
psql "$SUPABASE_URL" < supabase/20260420_vercel_autofix_columns.sql
```

### 2. Install scripts on cron-01
```
sudo useradd -r -s /bin/false autofix  # if not present from sentry loop
sudo mkdir -p /opt/vercel-autofix-poller
sudo rsync -av scripts/ /opt/vercel-autofix-poller/
sudo chown -R autofix:autofix /opt/vercel-autofix-poller
cd /opt/vercel-autofix-poller && sudo -u autofix npm ci --production

sudo cp systemd/env.example /opt/vercel-autofix-poller/.env
sudo chmod 600 /opt/vercel-autofix-poller/.env
sudo chown autofix:autofix /opt/vercel-autofix-poller/.env
# fill in the values

sudo cp systemd/vercel-autofix-poll.{service,timer} /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now vercel-autofix-poll.timer
```

### 3. Ship the workflow + strategy scripts to each target repo
```
# World Hub
cp -r scripts/ $WH_REPO/scripts/vercel-autofix/
cp workflows/vercel-autofix.yml $WH_REPO/.github/workflows/
# Club Arena — same, once the real projectId is filled in
# club-commander-desktop — same, once the real projectId is filled in
```

### 4. Verify
```
# Force a failing build on a throwaway branch (e.g. a syntax error), push,
# watch the poller dispatch within 2 minutes:
journalctl -u vercel-autofix-poll.service -f
# Check GH Actions: a Vercel-autofix run should appear on the WH repo.
# Check Supabase: autofix_attempts should gain a row with source='vercel'.
```

## Projects

| Project     | projectId                                  | GitHub repo                                     |
|-------------|--------------------------------------------|-------------------------------------------------|
| hub-vanguard| `prj_op66GkZyZcygXQKm76iyycfVFAQx`         | `Smarter-Poker/Smarter-Poker-World-Hub`          |
| club-arena  | TBD — fill in before enabling              | `Smarter-Poker/club-arena`                       |
| club-commander-desktop | TBD — fill in before enabling   | `Smarter-Poker/club-commander-desktop`           |

## Ops tooling

The `Makefile` in this directory wraps deploy + inspection. The
`autofix-cli.mjs` talks to the Supabase control tables shared with the
Sentry loop, so ops commands work against both pipelines.

```
make test                                     # run poll.test.mjs locally
make deploy HOST=cron-01                      # rsync + npm ci + restart timer
make deploy-units                             # refresh systemd units
make apply-migration SUPABASE_DB_URL=postgres://...

make status                                   # systemctl status (remote)
make logs N=200                               # last 200 journalctl lines
make logs-follow                              # tail -f

# control plane — needs SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in env
make pause REASON="paid investigating"        # kill-switch on
make unpause                                  # clear it
make last N=20                                # last 20 autofix_attempts
make attempts STATUS=errored                  # filter by status
node autofix-cli.mjs status                   # kill-switch + budget snapshot
node autofix-cli.mjs budget                   # today's spend per bucket
```

The kill-switch and budget CLI commands affect both loops because both
pollers call the same `autofix_is_paused()` / `autofix_budget_exhausted()`
RPCs before dispatching.

## Runbook

**Poller hasn't dispatched in 10 minutes after a known failure:**
1. `journalctl -u vercel-autofix-poll.service -n 100` — check for log entries.
2. `systemctl status vercel-autofix-poll.timer` — confirm timer is active.
3. `sudo -u autofix DRY_RUN=1 node /opt/vercel-autofix-poller/poll.mjs` — run once, read the JSON log lines.
4. Check `autofix_attempts` for a row with matching `commit_sha` and status
   `skipped_unfixable` — the reason column says why.

**A PR was opened but you want it halted:**
- Close the PR in GitHub. The partial unique index lets a future commit to
  the same SHA attempt again; if you don't want that, also update the
  attempt row: `UPDATE autofix_attempts SET status='reverted' WHERE id=?;`

**Budget cap hit:**
- Rows gain `error_message='daily_budget_cap_hit'`. Wait until UTC midnight
  or manually raise the cap in the RPC.

## Current status

- **Phase A (this repo):** poller, strategies, workflow — written.
- **Phase B (next):** post-merge deploy verification + auto-revert if the
  PR's merge causes another ERROR. Same harness as Sentry's.
