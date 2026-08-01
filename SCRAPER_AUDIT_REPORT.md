# Scraper & Live-Data Audit — Findings, Fixes, and What Still Needs You

**Date:** 31 July 2026
**Scope:** Why "Cash Games Running" stopped publishing; whether the scrapers are producing real new data daily; and a line-by-line audit of the poker-series, daily-nationwide-tournament, cash-game and venue scrapers plus their publish APIs and schedules.

---

## 1. Deployment verification (your first question)

All five Poker Near Me commits are confirmed on `origin/main` — I verified each with `git merge-base --is-ancestor`, not by trusting git output:

| Commit | What |
|---|---|
| `c4e73ffb59` | 184 PNM fixes, 83 files |
| `5e93850b97` | Supabase client typing (`tsc --noEmit` → 0) |
| `c03ba272be` | 3 fetches repointed at routes that exist |
| `94654f1aa0` | Watchdog acts on unhealthy heartbeats |
| `760b65eb68` | Shared browser self-heal in launchers |

Local `main` and `origin/main` were in sync at `d36ba71818`.

**What I could not verify:** that Vercel served the build to smarter.poker. This sandbox has no network route to smarter.poker or Supabase, and the Chrome bridge's `execute_javascript` / `get_page_content` fail with "Chrome is not running" while `list_tabs` works — that specific pattern is Chrome's **View → Developer → Allow JavaScript from Apple Events** being off. Turn that on and I can verify production directly next time. I left `https://smarter.poker/api/poker/live-tables` open in a tab for you.

---

## 2. Why "Cash Games Running" stopped — root cause

**One missing file took down three scraper families and stayed broken for weeks.**

A Playwright upgrade began expecting a new chromium revision. The old revision is not reused, so every Scrapling daemon started dying at session creation:

> `ERROR_SESSION_DEAD: Executable doesn't exist at .../ms-playwright/chromium-1208/...`

Dead since then: **bravo-live-daemon** (real cash games), **pokeratlas-live-daemon** (game catalogue), **poker-series pipeline** (crash-sleeping on a 6-hour loop).

Nothing recovered, for three compounding reasons:

1. The only auto-heal in the repo tested for a missing `.venv`. The venv was fine; only the browser was gone.
2. launchd invokes the daemons as `.venv/bin/python3 scripts/<daemon>.py` **directly**, so shell-level healing in the launchers never ran at all.
3. `scraper-watchdog-local.sh` judged health by heartbeat *freshness*. The daemons kept writing fresh heartbeats while stuck in a retry loop, so the watchdog logged them "OK" for weeks. It read `status` and threw it away.

**The simulator never stopped.** `bravo-simulator-daemon.py` has been running the whole time — I watched it advance from cycle 605 to 1092, currently 123 venues / 333 tables / 126 waiting. So cash-game data *was* publishing; what died was the real Bravo feed underneath it, which means the simulator has been extrapolating from history that gets staler every day.

**Separately, the UI made it invisible.** The "Cash Games Near Me" tab was unreachable: activating it only set `showLiveTab`, but `renderContent` checked `activeTab === 'map'` first and always returned the map. That is fixed and already on main (`c4e73ffb59`).

### What I fixed
- **`scripts/browser_heal.py`** (new) — probes `chromium.executable_path` and re-runs `playwright install chromium` when it is genuinely absent. Wired into every session-creation path: `bravo-live-daemon.connect()` and `_fast_path_connect()`, `pokeratlas-live-daemon.connect()`, `tournament-schedule-daemon.connect()`, `poker_series_scraper.create_session()`. Because it runs **in-process**, it works regardless of how launchd starts the daemon — which is the whole reason the previous fix didn't help.
- **Watchdog** now restarts on a non-running `status` or `consecutive_failures >= 3`, instead of only on a stale timestamp.
- **`scripts/ensure-browsers.sh`** (new) — the same heal for the four shell launchers.

---

## 3. Are the scrapers producing real new data daily?

Short answer: **no, and several never were.** 208 unique findings — 28 critical, 74 high.

| Kind | Count |
|---|---|
| bug | 71 |
| silent-failure | 48 |
| fabricated-data | 37 |
| gap | 20 |
| schedule | 12 |
| wiring | 10 |
| performance | 8 |

### The scheduling picture was the worst of it
- **Bravo and CardPlayer tournament scrapers only ran under a manual `workflow_dispatch` with `mode=full`.** The 06:00 UTC cron never touched either one. Now both run on the daily schedule.
- **None of the six daily tournament scrapers was scheduled anywhere** — no cron, no workflow, no plist.
- The series pipeline ran every 3 days via `*/3` day-of-month, which also skips at month boundaries. Now daily.

### Fabricated data being published as verified (37 findings)
This is the part I'd want you to look at hardest, because it goes to whether the database can be trusted:

- A raw line-by-line `$` scan turned **banner ads and hotel rates into tournaments**.
- One event's structure sheet was written onto **every event in the series** — invented stacks, late-reg levels and bounties.
- **236 hardcoded, hand-written 2026 tour events** in `populate_tour_schedules.py` — the script makes zero network requests and publishes them as verified schedules.
- `runs_to_tables()` invented live table counts from prose like "Runs nightly".
- Invented `12:00 PM` start times for every CardPlayer and untimed HendonMob event.
- Guaranteed prize pools stored as **buy-ins**.
- `age_requirement` invented from a state guess and stored as scraped fact.
- Every row stamped `data_quality='scraped_verified'` / `scrape_confidence='high'` **with no verification performed**.
- The simulator wrote a **fabricated `scrape_html_hash`** — forensic evidence of a scrape that never happened — and `live-tables.js` certified it with `data_is_live=true` and a `last_scrape` timestamp.

All of the above are fixed: quality flags now derive from the actual extraction path, simulated rows are tagged `is_simulated` + `data_quality='modeled_estimate'` and are distinguishable end to end, and the invented values are gone.

### Silent failures (48 findings)
- A **`NameError` was discarding every PokerAtlas `__NEXT_DATA__` scrape** — the primary, richest source.
- An **undefined function silently returned zero events for the entire HendonMob source**.
- `run_series_pipeline.sh` read `$?` after a `| tee`, which is always 0 — **the pipeline reported success no matter how badly the Python steps failed**.
- Discovered series were inserted into `poker_venues` while the series surface reads `poker_series` — **new series never reached users**.
- A partial/aborted Bravo cycle **deleted every venue it had failed to scrape**.
- Upserts reported success from HTTP status alone and could not see partial rejections.

---

## 4. Two regressions I caught in my own swarm's work

I packaged the audit slice with `scripts/*.py` and `scripts/*.sh` only — no `.js`. An auditor therefore concluded seven node scripts "do not exist". All seven exist. Acting on that false premise, a fixer:

1. Replaced the CardPlayer **tournament** scraper (`scrape-cardplayer.js` → `venue_daily_tournaments`) with the CardPlayer **news** scraper (`scrape-cardplayer.py` → `poker_news`). Different sources, not substitutes — this silently dropped CardPlayer tournament coverage.
2. Left the actual Bravo scheduling bug unfixed while adding a comment claiming it was handled.

Both corrected in `ded339f03f`. I verified the fix by parsing the YAML and listing which invocations are reachable from the cron: PokerAtlas, Bravo and CardPlayer tournaments all now run daily, with CardPlayer news in its own job.

---

## 5. Verification performed

| Gate | Result |
|---|---|
| `npx tsc --noEmit` (World Hub, on your Mac) | **exit 0** |
| `py_compile` / `bash -n` / `node --check` / YAML parse on all 44 changed files | **all pass** |
| All 18 `run` blocks in daily-scraper.yml | **bash -n clean** |
| Pre-commit hook rules (forbidden auth calls, conflict markers) | **pass** |
| Adversarial diff review, 9 groups | **all ok**, 25 fixer-introduced defects caught and repaired |
| Heal module behaviour test | correctly matches the Playwright error, correctly ignores Cloudflare errors |

I also caught a defect in my *own* wiring during verification: `tournament-schedule-daemon.py` uses `log()` as a plain function, so my `log=log.warning` would have thrown `AttributeError` at runtime. Fixed before commit.

---

## 6. What needs you — three things

**1. Push (I cannot).** This sandbox has no network route to GitHub; SSH to github.com is refused at the proxy. Three commits are waiting on local `main`:

```
cd ~/Documents/Smarter-Poker-World-Hub && git push origin main
```

`6ac892afff` (177 scraper fixes) · `ded339f03f` (daily cron sources) · plus `browser_heal.py`.

**2. Restart the daemons after pushing.** They will then heal their own browser on the next connect — you should not need to run `playwright install` by hand. If you want them back immediately:

```
cd ~/Documents/Smarter-Poker-World-Hub && .venv/bin/python3 -m playwright install chromium
launchctl stop com.smarter-poker.bravo-daemon && launchctl start com.smarter-poker.bravo-daemon
launchctl stop com.smarter-poker.pokeratlas-daemon && launchctl start com.smarter-poker.pokeratlas-daemon
```

Confirm recovery with `cat data/bravo-logs/heartbeat.json` — you want `"status": "running"`, not `connect_failed`.

**3. Rotate the Supabase service-role key.** This is the urgent one. **64 files** in the repo contain a hardcoded service-role JWT as an env fallback — that key bypasses RLS and grants full read/write on the whole database. It is in git history, so rotating is the only real remedy; removing the literals is not sufficient. The fixes stop *new* code from depending on the fallback, but the exposed key must be replaced in Supabase and re-issued through the environment.

---

## 7. Still open (deliberately not fixed)

- **`populate_tour_schedules.py`** — 236 invented tour events. I did not delete them because removing them without a replacement source would empty your tour pages. They need a real scraper behind them, and until then they should not be marked verified.
- **Four core tables** (`poker_series`, `venue_live_tables`, `tournaments`, `tournament_alert_preferences`) still have no `CREATE TABLE` in any migration. Your schema exists only in production; a rebuild from migrations would fail.
- **No `timezone` column on `poker_venues`** — still the single highest-leverage addition for a nationwide product. It fixes open/closed status and multi-timezone tournament start times at once.
- **`ALERT_PHONE_NUMBER` repo secret** must be created before the next series run, or the six new alert steps will SMS an empty number.
- **`source_url` is still never written to `poker_events`**, so stored events have no provenance link.
