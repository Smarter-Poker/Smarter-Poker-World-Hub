# 2026-09-01 — Horses stopped posting: the dispatcher was authenticated to Vercel and rejected by workers

**Reported by Dan:** "horses haven't posted a single new post in a day, and
there are no new stories at the top of my feed (caused by no new posts)."

Dan's causal theory is correct. The stories row is empty *because* nothing
generated stories; there is no second, independent stories defect. Both come
from one credential split.

## Root cause

`scripts/openclaw-cron-dispatcher.py` sent the SAME `CRON_SECRET` to two
services that each validate it independently:

* **Vercel** (`https://smarter.poker`), and
* **the workers VM** (`WORKERS_BASE_URL`, private `10.0.0.3:8081`), whose
  `/cron/*` bearer middleware reads its own `CRON_SECRET` out of the
  container's compose env on that host.

Those are two credentials on two hosts with two rotation cadences. Vercel's was
rotated; the workers VM's never was. On 2026-08-31 `deploy-openclaw.yml`
stamped GitHub's two-week-stale value onto `/etc/openclaw.env` (see
`2026-08-31-sms-alert-storm.md`), all 89 routes 401'd, and the hand-repair that
followed put **Vercel's current** value on the box. That fixed every
Vercel-routed job and permanently broke every workers-routed one.

The cut is exact, from `journalctl -u openclaw` on the dispatcher:

    2026-08-31T08:59:01+0000  ✅ /api/cron/hard-stop → workers 200 [1.1s]
    2026-08-31T09:00:00+0000  ⚠️ /api/cron/anti-cheat-bot-timing → workers 401: {"error":"unauthorized"}

…and it never recovered. 24 hours to 2026-09-01 17:00 UTC:

    1440 /api/cron/hard-stop            96 /api/cron/horses-stories
     720 /api/cron/deploy-error-poll    12 /api/cron/horses-social-all
     288 /api/cron/bbj-detect            1 /api/cron/horse-batch/0..9 (each)
     ... 58 distinct paths, every one 401, zero 200s

Proved directly on the dispatcher against a route that does not exist (the
bearer middleware runs before routing, so it answers 401 for a bad secret and
404 for a good one — and executes nothing either way):

    /etc/openclaw.env  CRON_SECRET  → workers  {"error":"unauthorized"}
                                    → vercel   {"ok":true,"probe":"cron-auth"}
    /opt/openclaw/.env CRON_SECRET  → workers  404 Not Found      (accepted)
                                    → vercel   {"error":"Unauthorized"}

Two values, each accepted by exactly one hop.

### The matching database evidence

    social_posts    last row  2026-08-31 07:30:25 UTC   (horse-batch/3, 07:30)
    social_stories  last row  2026-08-31 08:50:06 UTC   (horses-stories, :50)

Before that, ten posts every ~2.5h and 4-20 stories an hour, without a gap.

`social_stories` carries a 24h `expires_at`. At the time of writing:
`total 224, live 0`, newest `expires_at 2026-09-01 08:50 UTC`. So the last
story aged out this morning and the row went empty — exactly as Dan described,
and exactly on schedule from the last successful write.

## Contributing defect — nothing could see it

This is the second half of the bug and the reason it ran for a day.

* `_workers_healthcheck_job` pings `WORKERS_BASE_URL/health`, which takes **no
  Authorization header**. It returned 200 throughout. "Workers UP" was true and
  useless.
* `_auth_drift_watchdog_job` — written on 2026-08-17 for precisely this class
  of fault ("a rotation reached 2 of 8 consumers") — probed **only Vercel**. It
  logged `[auth-drift] OK - verified: CRON_SECRET` every five minutes while 58
  jobs were dead.
* `fire_cron` logs a 401 at WARNING and APScheduler then logs
  `executed successfully`. A job can 401 1,440 times a day and nothing escalates.

## Fix

1. **`WORKERS_CRON_SECRET`** — one env var per hop. `fire_cron` presents it on
   workers-routed fires and `CRON_SECRET` on Vercel ones. It falls back to
   `CRON_SECRET` when unset, so a host where the two genuinely agree needs no
   configuration and nothing changes.
2. **The watchdog now proves the workers hop**, using the same
   404-means-accepted boundary described above. A workers-side 401 is a
   `failures` entry, so it pages like any other drift instead of being invisible.
   `verified:` now names `WORKERS_CRON_SECRET`, so the existing "NO CREDENTIAL
   WAS ACTUALLY VERIFIED" alarm covers this hop too.
3. **`deploy-openclaw.yml` deliberately does not manage the new variable.** The
   GitHub runner cannot reach the private workers VM, so it cannot prove a
   candidate before writing it — and writing an unproven secret is the original
   incident. The value is host-local in `/opt/openclaw/.env`, which the
   workflow's merge step seeds into `/etc/openclaw.env` only when absent and
   never overwrites.
4. **Guard:** `__tests__/openclaw-workers-secret.test.mjs`. Verified to fail on
   the pre-fix dispatcher (3 of 5 red) and pass on the fixed one.

## Still open — human only (RULE 0: credentials)

The durable end state is **one** secret again. Rotating the workers VM's
`CRON_SECRET` to match Vercel's requires shell access to the workers host
(`10.0.0.3`, reachable only from the private network; the dispatcher holds no
key for it) and the current Vercel value, which is marked *sensitive* and
cannot be read by any client. Until someone does that, the two-variable
arrangement is what keeps both hops working — and it is the safer arrangement
regardless, because it stops one host's rotation from silently killing the other.
