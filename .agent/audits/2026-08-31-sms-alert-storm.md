# 2026-08-31 — SMS alert storm: one incident, four pages

Dan reported repeated SMS to his phone: `SMARTER.POKER SECRET DRIFT` and
`SMARTER.POKER WORKERS DOWN`, asking that they be fixed properly or removed.

## What was investigated

Both texts come from internal watchdogs in `scripts/openclaw-cron-dispatcher.py`
running on the Hetzner `openclaw-dispatcher` VM (`_workers_healthcheck_job`,
`_auth_drift_watchdog_job`), paging via Twilio.

## Finding 1 — the SECRET DRIFT alert was TRUE, not noise

`journalctl -u openclaw` shows `CRON_SECRET rejected by production (401)` on
every five-minute run from **10:50 to 13:55 UTC** on 2026-08-31, clearing at
14:00:03. Vercel runtime logs for the same day corroborate it from the other
side: 641 `401`s against `/api/cron/push-dispatch` alongside 1032 `200`s, plus
640 each on `/api/cron/transcode-videos` and `/api/cron/waitlist-sweep`, and
132 on `/api/internal/cron-auth-probe`.

`/etc/openclaw.env` has an mtime of `13:49:14 UTC`, matching the last service
restart — the host's copy of `CRON_SECRET` was corrected then, and the
watchdog cleared on its next run. Verified after the fact from the dispatcher:

    curl -H "Authorization: Bearer $CRON_SECRET" \
      https://smarter.poker/api/internal/cron-auth-probe
    -> 200 {"ok":true,"probe":"cron-auth","secretMalformed":false}

So the watchdog did its job. Removing it would have removed the only thing
that surfaced a three-hour silent-401 window.

## Finding 2 — the WORKERS DOWN alert is currently quiet

`journalctl -u openclaw | grep "healthcheck] workers DOWN"` returns nothing
across retained history, and `http://10.0.0.3:8081/health` answers 200 from
the dispatcher. The texts Dan saw predate `#1094`
("stop routing the two rebuilt jobs to the never-built workers VM"). No change
made to that monitor beyond the de-duplication fix below.

## Finding 3 — the actual defect: alert state died on every restart

The three watchdogs each held `{'consec_fail', 'alert_sent'}` in memory only.
`Restart=always` plus routine `systemctl restart` (deploy-openclaw.sh, or any
agent editing `/etc/openclaw.env`) wiped that state and re-armed the alert, so
the next failing probe paged again for a condition already reported.

Restarts on 2026-08-31: 09:01, 09:05, 11:49, 13:35, 13:36, 13:49 UTC — all
clean `Stopping...` / `Started` pairs, i.e. deliberate.
SMS sent for the SAME incident: **09:15, 11:55, 13:45, 13:55 UTC**. One page
per restart, not one per incident. That is what Dan was receiving.

## Fix

`scripts/openclaw-cron-dispatcher.py`:

- alert state is persisted to `/var/lib/openclaw/alert-state.json`
  (`OPENCLAW_ALERT_STATE`) after every watchdog run and reloaded at boot, so a
  restart no longer re-arms a page;
- `_alert()` additionally refuses to repeat identical alert text for the same
  monitor inside `ALERT_MIN_REPEAT_S` (default 6h) — a second belt for when the
  state file is missing or unwritable;
- a NEW failure text still pages immediately, and a recovery ALWAYS pages;
- every failing run still writes its ERROR line to the journal. The cooldown
  is a floor on repetition, never a ceiling on detection.

Verified before deploy with a two-process test that loads the module, pages,
then reloads it in a fresh process (a simulated restart): the duplicate is
suppressed, a new condition pages, the recovery pages, and a post-recovery
recurrence pages again.
