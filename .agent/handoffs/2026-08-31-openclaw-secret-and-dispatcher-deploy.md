# HANDOFF — Open Claw: rotate the VM CRON_SECRET, then deploy the dispatcher

**Raised:** 2026-08-31 11:20 UTC, by the heads-up audit Phase 1 completion sweep.
**Severity:** HIGH — every Open-Claw-only job has been dead since ~09:00 UTC.
**Human action required:** YES, and only for step 1 (a credential this sandbox
has no authorized path to write). Everything else is done and merged.

---

## Two separate faults, both proven live

### 1. The VM's CRON_SECRET does not match production (pre-existing, ~09:00 UTC)
Already diagnosed in `.agent/handoffs/2026-08-31-cron-secret-mismatch-openclaw-401.md`.
Re-confirmed independently at 11:15 UTC by a method that does not depend on VM
access: every job that ran in that minute (`recovery-probe`, `login-probe`,
`sentry-signup-bridge`, `marketplace-health`, `trivia-tournament-tick`) is a
**Vercel-native** cron from `vercel.json`. Every **Open-Claw-only** job —
`push-dispatch`, `waitlist-sweep`, `spin-sweep`, `player-stats-refresh`,
`rakeback-period-settle` — has no run since ~09:00. The split is exactly along
"who authenticates the request", which is what a secret mismatch looks like.

**Fix:** put production's current `CRON_SECRET` into `/etc/openclaw.env` on the
dispatcher VM and restart the unit.

```bash
ssh root@178.104.160.250
#   set CRON_SECRET=<value from Vercel env / .env.vercel.prod.local> in /etc/openclaw.env
systemctl restart openclaw
journalctl -u openclaw -n 50 --no-pager      # expect 200s, not 401s
```

The correct value is the one in `~/Documents/Smarter-Poker-World-Hub/.env.vercel.prod.local`
on Dan's Mac — verified working against production this morning (manual calls
to `/api/cron/player-stats-refresh` and `/api/cron/rakeback-period-settle`
both returned 200 with that value). Do NOT paste the value into any repo file.

### 2. Two jobs were routed to a service that was never built (fixed in repo)
`WORKERS_PREFERRED` in `scripts/openclaw-cron-dispatcher.py` routed
`player-stats-refresh` and `rakeback-period-settle` to `WORKERS_BASE_URL`
(`smarter-poker-workers`, a repo Phase 2B has never created). Both now have
real handlers in `pages/api/cron/`, so the entries were removed.

**Fix (already merged to main, still needs the VM to receive it):**

```bash
cd ~/Documents/Smarter-Poker-World-Hub
git pull
bash scripts/deploy-openclaw.sh     # repo file and VM must not drift (CLAUDE.md 11.3)
```

Do both in the same trip — the secret alone leaves these two jobs pointed at a
dead VM, and the deploy alone leaves them 401ing.

---

## How to confirm it worked

```sql
select cron_name, last_status, last_run_at
from cron_health_log
where cron_name in ('player-stats-refresh','rakeback-period-settle','push-dispatch','waitlist-sweep')
order by last_run_at desc;
```

`player-stats-refresh` fires hourly at :15 — a fresh `success` row within the
hour proves both faults are closed.

## What is NOT blocked by this

The Phase 1 money fix (VIP fractional accrual) is in the DATABASE and is live
now — it does not depend on Open Claw at all. Verified: sub-1 rake credits are
being banked rather than discarded, at a rate of hundreds per hour.

The rakeback backlog (2,456 periods, 278,579.42 chips owed) can be settled at
any time without waiting for the VM, by calling the endpoint by hand with the
production secret:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" \
  "https://smarter.poker/api/cron/rakeback-period-settle?dry=1"   # reports only
curl -H "Authorization: Bearer $CRON_SECRET" \
  "https://smarter.poker/api/cron/rakeback-period-settle"         # pays
```

That is Dan's call to make, not an agent's — it moves real chips to 589 players.
