# Video Library — deep dive

Date: 2026-08-15
Author: Cowork agent
Per Dan: "look into adding more and new content to the video library, deep
dive on what's in place, what should be improved, look for bugs, gaps,
stubs, regressions or wiring issues."

Shipped this pass: `a8619cb3` (credential purge), `5bbe50dc` (F2/F3/F4).

---

## HEADLINE: the library is stale, and nothing is ingesting

| metric | value |
|---|---|
| videos | **345** |
| sources | 24 |
| last scrape | **2026-04-22 — 116 days ago** |
| added in 30d | **0** |
| cash / tournament | 264 / 81 |
| untagged | 0 (Grok tagging did complete) |

"Adding more content" is not a feature request — the pipeline stopped four
months ago. Three independent reasons found, any one of which is fatal:

1. **yt-dlp is not installed on the Mac** (`which yt-dlp` -> nothing). The
   scraper is a yt-dlp wrapper, so it cannot run there at all.
2. **The Python cron dispatcher is not running.** The live process is
   `openclaw-cli gateway` (a different product). `launchctl list` shows
   series-scraper, tour-scraper and scraper-watchdog but **no video-library
   job**.
3. **The reels leg was misconfigured and has never once succeeded** — see F2.

Worth noting the timing: ingestion died around the same period as the
YouTube n-sig / bot-detection breakage that took down the reels transcode
worker (see `2026-08-15-360p-RESOLVED-verified-1080p.md`). Same root
technology, same era. Whoever restores this should assume the scraper needs
the same treatment: current yt-dlp + a working JS runtime for n-sig.

---

## CRITICAL — fixed in `a8619cb3`

**F1. Production credentials committed in plaintext across 19 tracked files.**
`scripts/apply_video_migrations.js` connected as Postgres **superuser** with
the password inline. The same shared password appeared in 15 files and a
second credential in 4 more, covering:

- Postgres superuser on production (full read/write, bypasses all RLS)
- PokerAtlas account login
- Bravo Poker Live admin + its API token

Two were `.agent/skills/*/SKILL.md` — they did not merely leak the password,
they **instructed every future agent to use it**.

All occurrences replaced with env reads (`SUPABASE_DB_PASSWORD`,
`SMARTER_POKER_SHARED_PASSWORD`, `BRAVO_API_TOKEN`).

**ROTATION IS STILL REQUIRED AND IS NOT DONE.** The values are in git
history on a pushed repo; redacting the tree does not un-publish them.
Rotate: (1) Supabase DB password, (2) PokerAtlas, (3) Bravo admin + token.
Left to Dan deliberately — platform-wide blast radius, not an agent's call.

---

## FIXED in `5bbe50dc`

**F4. Every `?type=` deep link showed an empty library.** The page
uppercased the param (`cash` -> `CASH`) and compared it to `v.type`, which
the DB CHECK constraint stores lowercase. Two hamburger-menu entries and the
sitemap links all hit "No Videos Found". (`?source=` correctly stays
uppercase — source ids really are uppercase.)

**F3. The scraper was blind past row 1000, in two places.** PostgREST caps a
select at 1000 rows; neither the dedupe load nor the dead-video purge paged.
Once the library outgrows 1000: re-scrapes re-attempt inserts for rows 1001+
and lean on the 23505 catch, and the purge silently stops checking so
dead/private videos accumulate forever. Latent at 345 rows — it bites the
moment ingestion resumes.

**F2. The video-library -> reels cron has never succeeded.** The dispatcher
mapped `/api/cron/video-library-reels` to `['--sync-captions']` but ran it
against `video_library_scraper.py`, whose argparse does not accept that flag
— exit code 2 every night at 07:00 UTC. The script that implements
`--sync-captions` is `video_library_to_reels.py`, referenced by no scheduler
at all. Added `SCRIPT_JOB_SCRIPTS` to override the script per cron path.

---

## OPEN — not yet fixed, ordered by value

**F5. Three hamburger items are dead.** `?filter=favorites|history|watchlater`
fall into a handler that just does `setSearchQuery('favorites')` — there is
no favourites/history/watch-later view in the page. User sees
`0 results for "favorites"`.

**F6. The 30-second watch reward is a permanent no-op.**
`DiamondEngine.award(2,'video_watch',...)` returns
`{success:false, reason:'no_catalog_action'}` because `metadata.actionKey`
is never passed. The UI advertises a 30s tier that pays nothing; the real
award only fires at 300s via `videoWatchHistory.js`.

**F7. Infinite scroll dies permanently after a filter change.** The
IntersectionObserver is created once with `[]` deps; the sentinel is
conditionally rendered, so narrowing to <30 results unmounts it and the
observer keeps watching a detached node. No loading past 30 until reload.

**F8. Scraper health reporting 404s.** It POSTs to
`/api/cron/video-library-scraper?report=1`, which does not exist. Every run
404s, swallowed by a bare except. There is no audit trail of scraper health
— which is precisely why a 116-day outage went unnoticed.

**F10.** `thumbnail_url` is scraped, stored, then ignored — every render
site reconstructs a maxres URL from the video id instead.

**F11.** Mixed id space: static videos use synthetic ids (`hcl1`), DB videos
use the YouTube id. History/favourites written under a static id become
unreachable once the DB twin supersedes it; Continue Watching just silently
shrinks.

**F12.** Autoplay / HD / Captions preferences are persisted and never
applied — the iframe hardcodes `autoplay=1` and passes no `cc_load_policy`.

**F13.** `/api/training/log-request` is called with no Authorization header,
so all Train-This-Spot analytics from this page are anonymous.

**F14.** Modal next/prev indexes against the filtered grid, so opening from
a rail (Continue Watching / New This Week / Up Next) frequently gives
`idx === -1` and jumps to the top of the grid.

**F15.** Four independent copies of the same `social_reels` interleave query
across `Reels.jsx` and `pages/hub/reels.js`, drifting independently.

**F16.** Scraper uses insert + catch-23505, not upsert, so titles/durations
never refresh — despite the dispatcher documenting these jobs as
"idempotent via Supabase upserts".

**F19.** `video_playlist_items` has no ordering column and no `user_id`.

---

## IMPROVEMENTS WORTH MAKING

1. **Server-side pagination.** The page downloads the ENTIRE table to every
   visitor on every load (`.range()` loop to exhaustion) then filters in JS.
   The supporting indexes already exist and are completely unused —
   `idx_vlv_source_scraped`, `idx_vlv_type_scraped`, `idx_vlv_views_count`,
   and a GIN trigram index on title. Search is currently `String.includes`.
2. **No GIN index on `tags`** though tags are searched and scored.
3. **`trending` sort decays YouTube view counts by OUR scrape date**, so a
   freshly scraped video always outranks a genuinely popular one.
4. **No unique constraints** on `video_favorites` / `video_watch_later`;
   blind inserts plus a SELECT-then-write in `updateWatchDuration` race
   under the tab-hide flush.
5. **No internal play counter** — all popularity signals are YouTube's.

## ON ADDING MORE CONTENT

Once ingestion is breathing again, the cheap wins are: the 24-creator list
in `video_library_scraper.py:93-124` is hardcoded and hasn't changed in
months (add creators there), and `--source` already allows targeted
backfills. But **do not add sources before fixing F3** — beyond 1000 rows
the dedupe and purge go blind.
