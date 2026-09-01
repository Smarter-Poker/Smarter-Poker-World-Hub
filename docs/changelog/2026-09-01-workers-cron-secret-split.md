# 2026-09-01 — Horses post again: split the dispatcher's two bearer tokens apart

**Symptom (Dan):** no new horse post for a day, and an empty stories row at the
top of the feed.

**Cause:** the Open Claw dispatcher sent one `CRON_SECRET` to two services that
each validate it independently — Vercel and the private workers VM. Vercel's
copy was rotated; the workers VM's was not. Repairing `/etc/openclaw.env` for
Vercel on 2026-08-31 therefore broke workers, and every workers-routed job
answered `401 {"error":"unauthorized"}` from **08:59:01 → 09:00:00 UTC** onward.
58 jobs, 24h+, zero successes — including `horses-social-all`, `horses-stories`
and all ten `horse-batch/N`. Last `social_posts` row 08-31 07:30:25 UTC; last
`social_stories` row 08-31 08:50:06 UTC; stories carry a 24h TTL, so the row
emptied this morning exactly as Dan described.

**Changes**

- `scripts/openclaw-cron-dispatcher.py`
  - new `WORKERS_CRON_SECRET` (falls back to `CRON_SECRET` when unset);
    `fire_cron` now picks the secret per hop instead of assuming one value.
  - `_auth_drift_watchdog_job` now proves the workers hop as well as Vercel,
    via a `/cron/*` path that does not exist — the bearer middleware runs ahead
    of routing, so 401 means rejected, 404 means accepted, and nothing executes.
    A workers 401 is now a paging failure rather than a WARNING nobody reads.
- `.github/workflows/deploy-openclaw.yml` — documents why `WORKERS_CRON_SECRET`
  is host-local and must not be stamped from GitHub secrets (the runner cannot
  reach the private VM to prove a candidate, and writing an unproven secret is
  the exact bug that started this).
- `__tests__/openclaw-workers-secret.test.mjs` — guard. Verified red on the
  pre-fix dispatcher (3 of 5), green after.
- `.agent/audits/2026-09-01-workers-cron-secret-split.md` — full evidence.

**Host state:** `WORKERS_CRON_SECRET` seeded into `/opt/openclaw/.env` and
`/etc/openclaw.env` on the dispatcher, proven accepted by the workers VM. It is
inert until this dispatcher lands, because the running code has no such setting.

**Restores posting on merge.** Merging triggers `deploy-openclaw.yml`, which
scp's the dispatcher and restarts the unit; the next `horses-stories` fire is
within 15 minutes of that.

**Still human-only (RULE 0, credentials):** rotating the workers VM's own
`CRON_SECRET` to match Vercel's, so the estate is back to one value. Needs
shell on `10.0.0.3` (private, no key on the dispatcher) plus the Vercel value,
which is marked sensitive and unreadable by any client.
