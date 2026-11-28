# Venue schedule freshness is the collector's read (2026-11-28)

## What was seen

`https://smarter.poker/hub/venues/1828` (Lodge Poker Club, Austin TX) showed
"Data Last Updated: Aug 14, 2026" above "Tournament Schedule Data Is Being
Collected For This Venue".

## What is true (read from production, 2026-11-28 09:10-09:40 UTC)

- `poker_venues` 1828: `last_scraped` 2026-08-14 (legacy column, written by
  retired scrapers only), `schedule_last_scraped_at` / `last_scraped_at`
  2026-09-06, `scrape_status` `complete`, `has_tournaments` true. All 2,379 of
  its `venue_daily_tournaments` rows are `is_active = false`, so nothing
  qualifies and the page fell back to the legacy column.
- The collector is the Mac LaunchAgent `tournament-schedule-daemon.py`
  (installed runtime under
  `SmarterArchives/.../production-runtimes/pnm/tournaments`). The GitHub
  scraper workflows (`daily-scraper`, `venue-scraper`,
  `weekly-schedule-scraper`, `jsonld-scraper`, `charity-scraper-v5`,
  `hendonmob-auto-sync`, `poker-series-auto-pilot`) are all
  `disabled_manually`, by design (one scheduler per job,
  `.agent/audits/2026-09-03-one-scheduler-per-job.md`). Not changed.
- The daemon runs daily: 447 venues per cycle, about 148 with rows
  (`scraper_metrics`, 2026-11-14 to 2026-11-27, `run_status = partial`).
- For venue 1828, the per-venue evidence files from 2026-11-17 to 2026-11-27
  all say `found: false, valid_empty: true, primary_source: pokeratlas`. A
  saved PokerAtlas page for the room (2026-09-15) carries
  `<p class="no-tournaments"> Bad beat! We are told that Lodge Austin does not
  currently run any poker tournaments.`
- In the 2026-11-27 cycle **222 of 446** venues were in that state:
  source-confirmed empty every day, never recorded.

Staleness of the collector's read (`schedule_last_scraped_at`) over 564
active, unsuppressed venues: 132 under 7 days, 18 at 7-30 days, 167 at 30-90
days, 101 over 90 days, 146 never. By the legacy `last_scraped` column the
page was reading: 19 / 0 / 65 / 316 / 164. 223 tournament rooms have no fresh
row. Of the `pokeratlas`-sourced venues (382): 132 / 18 / 120 / 89 / 23.

## Root cause

Two defects, one on each side.

1. `flush_chunk` in `scripts/tournament-schedule-daemon.py` stamped freshness
   only for venues that produced rows, and returned early when a chunk had no
   rows at all. A `valid_empty` result (an identity-checked source showing its
   own empty marker) was counted for the cycle metric and then discarded. So a
   room that stopped listing tournaments kept the date of its last row
   forever, and its old rows were never retired by this path.
2. The venue page's badge read `poker_venues.last_scraped`, a column the
   collector never writes, and its empty state said collection was in
   progress whatever the data said.

## Fix

- `persist_confirmed_empty_schedules` (daemon): a venue with no rows from any
  source and a source-owned empty marker stamps `schedule_last_scraped_at`,
  `last_scraped_at`, `scrape_url`, `schedule_scrape_url`, `scrape_source` and
  `scrape_status = 'no_tournaments'` (an existing value meaning "verified no
  tournaments offered"), then retires its unconfirmed rows under the existing
  14-day grace. `has_tournaments` is left alone so the room stays in the daily
  cohort. Fetch failures never set `valid_empty`, so they still stamp nothing.
- `src/lib/poker-near-me/venueScheduleFreshness.mjs`: one derivation for the
  server render and `/api/poker/venues?id=`. States `current`, `stale`,
  `verified_empty`, `stale_empty`, `not_current`, `unknown`; stale after 7
  days. The page shows "Schedule Last Verified Nov 27, 2026", or
  "Schedule Last Verified Sep 6, 2026 · May Be Out Of Date", and an empty state
  that says what is known ("No Tournaments Are Currently Listed For This
  Venue.", "No Current Tournament Schedule Is Available For This Venue.",
  "No Tournament Schedule Is Available For This Venue Yet.").

No cron, sweep, backfill or repair job was added.

## Delivery state

Committed locally on `work/stale-20261128`, not pushed (swarm brief). After
merge the page change publishes through Vercel. The daemon change takes effect
only after the tournaments runtime is reinstalled from the protected revision
(`docs/runbooks/pnm-local-collectors.md`); its next daily cycle then stamps
the roughly 222 confirmed-empty venues. Until then 1828 renders
"Schedule Last Verified Sep 6, 2026 · May Be Out Of Date" with
"No Current Tournament Schedule Is Available For This Venue."

## Left alone

- PokerAtlas's empty marker is trusted as source truth; whether a large room
  such as WinStar really lists nothing there was not verified (PokerAtlas was
  unreachable from the agent sandbox).
- The Lodge website PDFs (`/wp-content/uploads/2025/11/...`) yield no rows
  because undated recurrences under a past-year upload directory are refused
  by design (`pdf_source_has_historical_archive_year`).
- `__tests__/newsletter-zero-broken-links-and-images.law.test.mjs` LAW 2B
  fails in this worktree; unrelated to this change.
