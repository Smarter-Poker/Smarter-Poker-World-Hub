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

### RESOLVED 2026-09-04: two variables is the end state, not a workaround

Closed as `completed` on issue #1306. The consolidation was argued against on
safety grounds and the argument holds: a single shared value COUPLES the two
auth surfaces, so rotating it on one host silently kills the other. That is not
a hypothetical - it is exactly what happened on 2026-08-31, and the split is
what makes each hop independently provable. `WORKERS_CRON_SECRET` still falls
back to `CRON_SECRET` when unset, so a host where the two genuinely agree needs
no configuration.

### If anyone ever does want one secret, this is the procedure

Recorded HERE because issue #1306 pointed at this file for it and it was not in
it. Requires the VM address (Keychain, Hetzner id 127930016) and the current
Vercel value; roughly five minutes.

THE TWO HOPS PROVE THEMSELVES DIFFERENTLY. This is the detail that has now been
got wrong twice, so it is written out in full:

| hop | what to probe | accepted | rejected | other |
|---|---|---|---|---|
| Vercel | `/api/internal/cron-auth-probe` - dedicated, no side effects | **200** | 401 | 404 = probe endpoint not deployed |
| workers | a route that does **not** exist | **404** | 401 | - |

Vercel has a purpose-built no-side-effect endpoint (added 2026-08-16, see
`2026-08-16-three-cleanup-items-and-a-deploy-blocker.md`) precisely so nobody
has to probe a working route; it answers 200 when the secret is accepted. The
workers service has no such endpoint, so its proof relies on the bearer
middleware running BEFORE routing: a good secret on a path that does not exist
answers 404, a bad one answers 401, and neither executes anything.

```bash
# 1. On the workers VM:
docker ps                       # confirm the cron container is up

# 2. Put Vercel's current CRON_SECRET into the workers compose env:
docker compose up -d            # restart so the bearer middleware reads it

# 3a. Prove the VERCEL hop - 200 means accepted:
curl -s -o /dev/null -w '%{http_code}\n' -H "Authorization: Bearer <value>" \
  https://smarter.poker/api/internal/cron-auth-probe

# 3b. Prove the WORKERS hop - a route that does NOT exist, 404 means accepted:
curl -s -o /dev/null -w '%{http_code}\n' -H "Authorization: Bearer <value>" \
  http://10.0.0.3:8081/cron/does-not-exist
#     Do NOT substitute a real /cron/* route here. The workers side has no
#     dedicated probe, so a live route would EXECUTE the job.

# 4. ONLY after 3a=200 AND 3b=404: unset WORKERS_CRON_SECRET in
#    /etc/openclaw.env and /opt/openclaw/.env so fire_cron falls back to
#    CRON_SECRET, then: systemctl restart openclaw
```

Step 4 last, and only on both gates. Unsetting while the values still differ
recreates this incident - 58 routes silently 401ing with a green tick on every
run.

### Known gap left behind

The workers hop still has no dedicated probe endpoint, so its verification is
load-bearing on the ABSENCE of a route. A catch-all handler, a SPA fallback, or
any 404 handler that starts answering 200 would make the watchdog report the
workers secret as verified when it is not - silently, which is this incident's
signature. Tracked separately.

