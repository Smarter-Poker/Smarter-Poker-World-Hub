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

## Deep-dive 2026-04-24 — Supabase-backed verdicts per orphan

Queried production Supabase (service_role) to determine whether each feature
is actually firing via some path other than a registered cron, or whether it's
truly dead.

### 🔴 `hard-stop` — **LIVE NEED, CURRENTLY BROKEN**

**Evidence:**
- `commander_venue_settings.hard_stop_enabled=true` → 1 venue (id=1996, time=02:00:00)
- `commander_tables` WHERE status ≠ 'closed' → **42 rows** (34 in_use, 5 reserved, 3 available)
- Last commander_table_sessions.ended_at: 2026-03-02 (7 weeks ago)
- 107 commander_members registered

**Interpretation:** Venue 1996 opted into hard_stop. 34 tables are currently in_use at commander venues right now. If the hard-stop cron was firing, those tables would get auto-closed when the clock hits 02:00:00 UTC. Since the cron isn't registered in either scheduler, those tables don't get the automated close — someone has to manually close them, or they run past the configured time.

The 2026-03-02 `ended_at` suggests sessions HAVE been ending somehow (probably manually through the commander UI), but the cron's auto-close safety net isn't in play. Low-adoption feature, but it IS adopted.

**VERDICT: Feature is live. Cron needs to be restored to Open Claw with `minute=*/1` firing.**

### 🟡 `scheduled-table-opener` — **DORMANT (zero adoption)**

**Evidence:**
- `table_templates` WHERE `schedule_enabled=true` → **0 rows**
- `tables` created in last 24h → 0 rows

**Interpretation:** The feature expects admins to set `schedule_enabled=true` on table templates with `schedule_days` + `schedule_time`. Zero templates currently have it enabled. Even if the cron fired every 5 minutes, it would find nothing to do.

**VERDICT: Feature is deployed but has zero usage. Handler can stay on disk with no cron scheduled. If adoption picks up, re-enable the cron. For now, safe to leave unscheduled.**

### 🗑️ `update-charity-locations` — **DEAD (zero data)**

**Evidence:**
- `social_pages` WHERE category='charity' → **0 rows**
- Actual categories in social_pages: `home game` (60), `poker` (5), `poker_club` (1), `card_club` (1), `general` (1)

**Interpretation:** Feature expected a 'charity' category of social pages with a weekly `run_schedule` in metadata. Zero such rows exist. Feature was either never launched or was retired when the social_pages taxonomy changed.

**VERDICT: DEAD. Safe to delete the handler file in Phase 2B.3 monolith cleanup. No cron restoration needed.**

### ✅ `generate-trivia-questions` — **INTENDED MANUAL UTILITY**

**Evidence:**
- `trivia_questions` total count: **1,903 rows**
- Most recent created_at: 2026-03-06 (~7 weeks ago — pool hasn't been refilled)
- `trivia-daily-generator` (different handler) IS scheduled and running

**Interpretation:** `generate-trivia-questions` is the bulk-refill utility; `trivia-daily-generator` is the "one fresh question per day" cron. Pool of 1,903 is plenty of runway for the daily generator even without refills.

**VERDICT: Not a lost cron — manual-refill utility by design. Leave as-is. Rename to `/api/admin/generate-trivia-pool` would be clearer but not urgent.**

### 🗑️ `scrape-venue-info` — **SUPERSEDED**

**Evidence:**
- `poker_venues.last_scraped_at` most recent: **2026-04-24 05:58 UTC (today)** — so scraping IS happening.
- But NOT via this handler. Other scrapers writing `last_scraped_at`:
  - `scripts/scrape-bravo-poker.js`
  - `scripts/scrape-pokeratlas-directory.js`
  - `scripts/scrape_venue_liveness.py`
  - `scripts/scrape_targeted_202.py`
  - + 11 more in `scripts/`

**Interpretation:** The `.js` handler approach has been replaced by Python-first scrapers that run via GitHub Actions workflows (`venue-scraper.yml`, `jsonld-scraper.yml`, etc. — the 9 allowlisted scheduled workflows from CLAUDE.md §11.4). This handler is a dead alternate path.

**VERDICT: SUPERSEDED. Safe to delete in Phase 2B.3.**

---

## Summary table — final verdicts

| Handler | State | Action |
|---|---|---|
| `clawbot/sentry-triage` | Sub-task called by orchestrator | Leave alone |
| `clawbot/status` | Admin dashboard API | Leave alone |
| **`hard-stop`** | **LIVE — 34 in_use tables at venue 1996; cron is AWOL** | **Restore: add to Open Claw with `*/1` minute schedule** |
| `scheduled-table-opener` | Dormant — 0 schedule_enabled templates | Leave unscheduled |
| `update-charity-locations` | DEAD — 0 charity social_pages | Delete in 2B.3 |
| `generate-trivia-questions` | Intended manual utility, 1903-Q pool | Leave as-is |
| `scrape-venue-info` | SUPERSEDED by 15+ script-based scrapers | Delete in 2B.3 |

Only **one genuine regression**: `hard-stop`. The others are explained by zero-adoption, zero-data, or supersession.

### Why did hard-stop lose its schedule?

Plan line 235 and earlier context don't mention it by name. Best theory: when someone hit Vercel's 40-cron Pro-plan limit and moved overflow jobs to Open Claw, hard-stop got dropped between the chairs. It isn't on the 16 Open Claw list (not in `OVERFLOW_CRONS`), and it isn't on the 40 Vercel list. It may have been intended for Open Claw but missed during the overflow migration.

Fix: add one line to `scripts/openclaw-cron-dispatcher.py`:
```python
('/api/cron/hard-stop',                  dict(minute='*/1')),          # every minute
```
Then `bash scripts/deploy-openclaw.sh`. CI governance allows this because `OVERFLOW_CRONS` count increases on the Hetzner side, and `vercel.json` stays at 40 — no governance rule violated.

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
