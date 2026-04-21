# Sentry Autofix Poller

The cron-01 side of the Sentry autofix loop. This is the poller that
runs on Hetzner (`/opt/sentry-autofix-poller/poll.mjs`), pulls new
unresolved Sentry issues, dedupes against `autofix_attempts`, and
dispatches the `sentry-autofix` GitHub workflow in the target repo.

**This directory exists so the poller has a git home** — task #154 in
the build tracker. The in-repo `scripts/sentry-autofix/` directory
contains the *runner* (what executes inside the GH Actions job after
dispatch); this directory contains the *dispatcher* that decides which
issues run.

## Current gap

The canonical `poll.mjs` currently lives only on cron-01. To pull it
into the repo:

```
scp root@cron-01:/opt/sentry-autofix-poller/poll.mjs       poll.mjs
scp root@cron-01:/opt/sentry-autofix-poller/package.json   package.json
scp root@cron-01:/opt/sentry-autofix-poller/package-lock.json package-lock.json

# Matching systemd units:
scp root@cron-01:/etc/systemd/system/sentry-autofix-poll.service systemd/
scp root@cron-01:/etc/systemd/system/sentry-autofix-poll.timer   systemd/
```

After the initial import, use the `Makefile` pattern from
`scripts/vercel-autofix/Makefile` — `make deploy HOST=cron-01` — to
keep cron-01 in sync with the repo going forward. Never edit files
directly on cron-01 again.

## Architecture

```
cron-01 (Hetzner)
  └─ sentry-autofix-poll.timer  (every 5 min)
       └─ poll.mjs
            ├─ Sentry API → list unresolved issues per project
            ├─ Kill-switch check  (autofix_is_paused RPC)
            ├─ Budget check       (autofix_budget_exhausted('sentry') RPC)
            ├─ Dedupe against     autofix_attempts table
            └─ GitHub repository_dispatch 'sentry-autofix'
                 └─ .github/workflows/sentry-autofix.yml
                      └─ scripts/sentry-autofix/run.mjs  (in target repo)
```

The Vercel poller (`scripts/vercel-autofix/poll.mjs`) has the same
shape — both tap the same Supabase control plane tables and share
the kill-switch + budget buckets via `autofix_budget.source`
(`'sentry'` vs `'vercel'`, capped to `'_global'`).

## Ops

Use the shared operator CLI from `scripts/vercel-autofix/`:

```
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
  node ../vercel-autofix/autofix-cli.mjs status
  node ../vercel-autofix/autofix-cli.mjs attempts errored
  node ../vercel-autofix/autofix-cli.mjs pause "reason"
```

The CLI is pipeline-agnostic — it queries `autofix_attempts` and
`autofix_config` which both pollers share.
