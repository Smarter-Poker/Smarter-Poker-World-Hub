# A cron that stops running must not look like a cron with nothing to do

2026-09-01

## Why

One bearer `CRON_SECRET` was serving two hosts that validate it independently.
Vercel's copy was rotated, the private workers VM's was not, so every
workers-routed cron returned 401 from **2026-08-31 08:59:01** to **2026-09-01
17:21:17 UTC**. PR #1214 fixed the secret.

For 25 hours, four anti-cheat sweeps did not run over live play, and **nothing
anywhere said so** — no alert, no issue, no dashboard row. The outage was noticed
because a human observed that the horses had stopped posting. Every other missed
job rode along behind that one incidental symptom.

`v_system_health_cron` only reflects `pg_cron` jobs. Nothing watched Open Claw.

## What this adds

One dispatcher entry, every 15 minutes, routed to the workers VM:

    /api/cron/cron-staleness-watchdog  ->  /cron/cron-staleness-watchdog

The handler ships in `smarter-poker-workers` (PR #45). It groups
`cron_execution_log` by job, derives each job's own normal cadence from its
recent history, and writes a `cron_health_log` row for any job well past it.

Two deliberate choices:

**Cadence is derived, not configured.** A hardcoded table of expected intervals
is a second copy of the dispatcher schedule, and a second copy drifts — silently,
in the direction of "everything looks fine". A job that has run every 30 minutes
for a fortnight and has not run for three hours is late no matter what any config
file believes.

**The median, not the mean.** The outage's own 25-hour hole is one enormous gap.
A mean would absorb it into the baseline and raise the threshold, so the same
failure would take longer to detect the second time.

## Scope

It covers **every** job on this dispatcher — money jobs, integrity sweeps,
scrapers, content. Do not add a second per-area staleness watchdog beside it.

## Rules honoured

No `vercel.json` cron entry and no GitHub Actions `schedule:` trigger, per
CLAUDE.md 11.3. Scheduled work goes through Open Claw, and the dispatcher is
deployed by `deploy-openclaw.yml` rather than by hand-editing the live VM.
No net-new file under `pages/api/cron/`, so CHECK 6's file-count baseline is
unmoved.

## What this does NOT catch

A job that runs on schedule and examines nothing. That happened here too and is
a separate failure mode: `collusion-scan` was reading 1000 of ~280,000 hands per
run because PostgREST clamps responses and returns 200, so it reported success
and zero findings every time. That is fixed in the same workers PR, with a
`hands_truncated` field so a partial scan can no longer look like a clean one.
