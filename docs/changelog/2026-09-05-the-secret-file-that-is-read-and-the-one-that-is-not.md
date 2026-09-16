# The secret file that is read, and the one that is not

**2026-09-05.** Every Open Claw cron job 401'd for 3 hours 30 minutes. The
pager that finally reached a phone was the Club Commander login-bridge probe,
which was itself perfectly healthy - 36/36 checks pass, both legs, verified by
hand during the incident. It was the messenger, not the patient.

## What happened, from the rows

| UTC | what |
|---|---|
| 03:20:56 | `CRON_SECRET` replaced on the hub Vercel project (`prj_op66Gk...`, by `admin-74513439`). Vercel's env record shows `createdAt == updatedAt` at this instant. |
| 03:24:01 | last green job: `/api/cron/push-dispatch -> vercel 200` |
| 03:25:00 | first `401 {"error":"Unauthorized"}` - every routed job, simultaneously |
| 03:25:01 | `[auth-drift] CRON_SECRET rejected by production (401)` - the watchdog saw it on the first tick |
| 03:30:04 | `SMARTER.POKER SECRET DRIFT` SMS sent (two-strike threshold, working as designed) |
| ~05:22 | `CRITICAL /api/internal/login-bridge-probe failed 2x in a row: HTTP 401` SMS - the one that got acted on |
| 06:55:03 | fixed; all jobs 200, `[auth-drift] OK - verified: CRON_SECRET, SUPABASE_SERVICE_ROLE_KEY, WORKERS_CRON_SECRET` |

The rotation was one-sided. Nothing carries a Vercel env change to the Hetzner
dispatcher, so the host kept presenting the old bearer to a hub that had
stopped accepting it.

**The detection was not the failure.** The auth-drift watchdog caught it in 60
seconds and paged in 10 minutes, exactly as built. What cost three hours was
what happened next.

## The part worth fixing: three values, and the obvious file is the wrong one

The repair found **three different 64-character secrets live at once**:

| holder | fingerprint |
|---|---|
| hub production (the only one that counts) | `1163b45ca65a` |
| `/etc/openclaw.env` on the dispatcher | `386d567caee2` |
| `/opt/openclaw/.env` on the dispatcher | `e292277afd39` |

`openclaw.service` carries `EnvironmentFile=-/etc/openclaw.env`, and
`_load_cron_secret()` returns `os.environ['CRON_SECRET']` on its first line.
So `/etc/openclaw.env` wins. `/opt/openclaw/.env` is the **deploy seed** -
`deploy-openclaw.yml` copies keys out of it once and then never overwrites them
again. Once the two disagree it is inert.

Both files parse. Both look correct read on their own. Nothing announced the
precedence. So the repair wrote the correct secret into `/opt/openclaw/.env`,
restarted the service, watched the box keep 401ing, and had to go looking for
why - a whole restart cycle spent fixing a file that cannot change anything.
The drift SMS did not help: it said "a rotation likely did not reach this
host" and named no path, and the path a person reaches for first is the one
under `/opt/openclaw` next to the code.

This is the second outage in this shape. The comment already in the dispatcher
records 2026-08-31: a stale `CRON_SECRET` stamped onto `/etc/openclaw.env`
took all 89 routes down, and the hand-repair that followed fixed Vercel's half
and permanently broke the workers' half for 24 hours.

## What changed

1. **The dispatcher reads both files at boot and says when they disagree.**
   `_check_shadowed_secret()` runs for `CRON_SECRET` and `WORKERS_CRON_SECRET`;
   a disagreement is an `ERROR` line and one SMS naming both paths, which one
   is in use, and that editing the other does nothing. Findings carry sha1
   fingerprints, never values - this text is destined for a phone. A missing
   seed file is not a disagreement, and agreement is silent, because a check
   that speaks every boot is ignored by the second week.

2. **The drift page names the file to edit.** `SMARTER.POKER SECRET DRIFT` now
   ends with `FIX IN /etc/openclaw.env ... then systemctl restart openclaw.
   Editing /opt/openclaw/.env does NOTHING - it is only the deploy seed.`
   That single sentence is the difference between a 3.5-hour outage and a
   2-minute one.

3. **`ETC_ENV_FILE` / `SEED_ENV_FILE`** are named constants (overridable by
   `OPENCLAW_ETC_ENV` / `OPENCLAW_SEED_ENV` so the check is testable off-box),
   with the precedence written down beside them.

Pinned by `__tests__/openclaw-secret-shadow.test.mjs` and
`scripts/ci/test-openclaw-secret-shadow.py`.

## What this does NOT fix

Rotating `CRON_SECRET` in Vercel still does not reach the dispatcher. Nothing
here propagates a secret; that would mean giving the box Vercel credentials.
The rule stays manual and is now the important half of it: **a rotation is two
edits.** Vercel, then `/etc/openclaw.env` on the Open Claw host, then
`systemctl restart openclaw`. Miss the second and the estate's scheduled work
stops within five minutes and the phone rings within ten.
