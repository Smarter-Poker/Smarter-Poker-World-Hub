# Cron Handler Orphans — Audit 2026-04-24

**Question asked by Dan:** "check for any new ones as well that aren't included in the original scope of work"

**Scope of work (plan):** 16 Open Claw overflow crons + 40 Vercel crons = 56 handlers.

**Actual on disk:** 48 handler files under `pages/api/cron/` and `pages/api/clawbot/`.

**Delta:** 48 on disk, 56 scheduled — but the union of the two schedule lists only
references 49 unique paths, and 7 handler files on disk appear in neither schedule.

---

## The 7 orphans

### ✅ Bucket A — Expected non-scheduled (called by other code)

These aren't cron-fired. They live under `pages/api/clawbot/` (not `cron/`) and
get called internally.

1. **`pages/api/clawbot/sentry-triage.js`** — sub-task endpoint. Called by
   `pages/api/clawbot/orchestrator.js` (the one cron that IS scheduled). Dispatch
   happens at the orchestrator's cadence (daily 07:00 UTC), not directly.
2. **`pages/api/clawbot/status.js`** — status dashboard API. Called by the
   ClawBot admin UI, not by a schedule.

**Verdict:** leave alone. These are intentionally on-demand.

### ⚠️ Bucket B — Comments say "Called by Vercel Cron" but NOT in vercel.json

These have docstrings that explicitly claim to be cron-triggered, but no scheduler
fires them. Either they were removed from `vercel.json` without deleting the file,
or they're trying to be crons but never got wired.

3. **`pages/api/cron/hard-stop.js`** — "Called by Vercel Cron every minute."
   For each venue with `hard_stop_enabled`, auto-closes cash games at the
   scheduled hard-stop time. **If this is actually needed, it's been broken
   since the schedule was dropped.** Check: does hard_stop functionality work
   in production right now? If yes, something else is calling it. If no,
   either delete the file or re-add the cron schedule.
4. **`pages/api/cron/scheduled-table-opener.js`** — "Called by Vercel Cron
   every 5 minutes." Creates tables from `table_templates` with
   `schedule_enabled=true` when the current time matches `schedule_days` +
   `schedule_time`. **Same as #3 — either broken in prod or retired without
   file cleanup.**
5. **`pages/api/cron/update-charity-locations.js`** — "Runs daily at midnight
   CST." For each charity social page with a weekly `run_schedule` in metadata,
   updates today's location. **Same pattern.**

**Verdict:** Need Dan's input. For each one: is the functionality still live? If
yes, add back to Open Claw (new Phase 2A.4 wave). If no, delete the file.

### ❓ Bucket C — No schedule mentioned, unclear intent

No cron-timing comment in the file. May be manually-triggered endpoints that
live under `/api/cron/` for legacy URL reasons, OR forgotten orphans.

6. **`pages/api/cron/generate-trivia-questions.js`** — "TRIVIA QUESTION POOL
   MANAGER — Ensures sufficient pre-generated questions for seamless gameplay,
   5-layer QA gate." No schedule comment. **Could be manual-refill-only, or
   a cron that lost its schedule.** Note: `trivia-daily-generator` IS scheduled
   (daily 10:00 UTC per 014-cron-health.spec.ts), so this might be a manual
   companion endpoint.
7. **`pages/api/cron/scrape-venue-info.js`** — "Venue Info Freshness Checker."
   Scrapes venue homepages for phone/hours/address changes. No cron timing in
   docstring. **Likely orphaned scraper — no longer in any schedule.**

**Verdict:** Same as Bucket B — need Dan's input per file.

---

## Immediate recommended actions (none taken without Dan's call)

For each of Bucket B and C:

- If the feature IS running in production (verify by checking whether hard-stop
  is actually closing tables, scheduled-table-opener is creating tables, etc.):
  - Add the route back to Open Claw dispatcher with the correct schedule
  - Update vercel.json OR openclaw-cron-dispatcher.py (whichever pool is right)
  - CI governance CHECK 6 will prevent future regressions
- If the feature is dead:
  - Delete the file
  - Plan 2B.3 monolith cleanup already deletes `pages/api/cron/*` eventually,
    but getting ahead of it reduces confusion during audits

---

## Implication for the plan

The plan (smarter-poker-optimization-plan.md) lists "716+ API route count" and
"Cron scheduler SPOF: Mac (12 jobs) + Vercel (40 jobs)" as the current state.
The scheduler-count of 52 in the plan's Success Metrics table is OFF:

- 16 Open Claw (plan said 12 — the 4 video-library SCRIPT_JOBs were added after
  the plan was written, confirmed in `.memory/context/phase-2a2-full-cron-audit.md`)
- 40 Vercel crons
- 7 orphans on disk that fire from neither
- **Actual monolith cron file count: 48**

The plan's Phase 2B.3 "delete `pages/api/cron/` entirely" target needs to account
for the 7 orphans. They get deleted too, but we should decide WHAT their feature
does FIRST so we don't delete a hard-stop that's actively closing games via some
other trigger.

---

## Raw data

Artifacts of the scan (regenerated each time):
```
cd ~/Documents/Smarter-Poker-World-Hub
find pages/api/cron pages/api/clawbot -maxdepth 1 -type f \( -name '*.js' -o -name '*.ts' \) \
  | sed 's|pages/api/||;s/\.[jt]s$//' | sort > /tmp/disk.txt
grep -oE "/api/(cron|clawbot)/[a-z-]+" scripts/openclaw-cron-dispatcher.py \
  | sed 's|/api/||' | sort -u > /tmp/oc.txt
python3 -c "import json; d=json.load(open('vercel.json'));
  [print(c['path'].lstrip('/').replace('api/','')) for c in d.get('crons', [])]" \
  | sort -u > /tmp/vc.txt
comm -23 /tmp/disk.txt <(cat /tmp/oc.txt /tmp/vc.txt | sort -u)
```

Reproducibility: this 7-file list will change as handlers get ported to the
workers repo (source file remains on disk until Phase 2B.3 wave deletes it)
and as new scheduled jobs are added via CLAUDE.md §11 governance. Re-run
the scan at the start of Phase 2B.3 to confirm nothing has drifted.
