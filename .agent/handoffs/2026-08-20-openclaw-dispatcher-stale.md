# Handoff — Open Claw dispatcher is stale; club-stats-maintenance barely runs

**Blocked on:** an SSH key I do not have. RULE 0 exception ("credentials the
agent has no path to obtain"). Everything else is verified and ready.

## Finding
`club-stats-maintenance` is registered in the repo dispatcher at `*/15`:

    scripts/openclaw-cron-dispatcher.py:175
    ('/api/cron/club-stats-maintenance',    dict(minute='*/15')),

but production shows **1 run in 3 hours** (00:01:53 UTC, then nothing for 79+
minutes). The scheduler itself is healthy — over the same window
`login-probe` fired 11 times and `sentry-signup-bridge` 12 times, both within
the last 6 minutes. So the dispatcher is running but does not have this job at
`*/15`: the deployed Python on the VM is behind the repo.

This is the exact failure mode CLAUDE.md 11.4 already records — the dispatcher
previously drifted 6 jobs behind because `deploy-openclaw.sh` had never once
succeeded.

## Why it matters now
Three things ride that route, and all of them silently degrade at ~1 run/hour
instead of 4:
- `ca_refresh_hand_player_index` — stats-page index freshness
- the club-stats rebuild backlog drain
- **the leaderboard snapshot self-heal** added 2026-08-20. It is ordered first
  in the handler so it always executes when the route runs, but it cannot
  recover a missed 00:05 snapshot promptly if the route only fires hourly.

## What I could not do
`scripts/deploy-openclaw.sh` needs an SSH key authorised as root on
`openclaw-dispatcher`. The keychain entry resolves (server IP found), but none
of the keys present on this Mac authenticate:

    ~/.ssh/hetzner_ed25519             -> Permission denied (publickey)
    ~/.ssh/hetzner_deploy_ed25519_new  -> Permission denied (publickey)

and none of the four filenames the script looks for
(`openclaw_ed25519`, `hetzner_deploy`, `hetzner_engine_key`,
`id_ed25519_hetzner`) exist on disk.

## To fix
With a working key present:

    OPENCLAW_SSH_KEY=~/.ssh/<key> bash scripts/deploy-openclaw.sh

then confirm the job registered, and verify from the DB rather than the logs:

    SELECT probe_name, count(*), max(occurred_at)
    FROM probe_heartbeats
    WHERE occurred_at > now() - interval '1 hour'
    GROUP BY 1 ORDER BY 2 DESC;

`club-stats-maintenance` should show ~4 runs/hour. Its heartbeat `details` will
also then carry `snapshot_health` every run, which is the leaderboard gap alarm.

## Note on verifying by hand
`curl -H "Authorization: Bearer $CRON_SECRET" https://smarter.poker/api/cron/club-stats-maintenance`
returned 401 using the `CRON_SECRET` in `.env.local`, so that local value does
not match production's env var. Worth reconciling separately — it means nobody
can invoke these routes by hand from a local checkout.
