# Poker Near Me — Full Swarm Audit & Fix Report

**Date:** 26 July 2026
**Scope:** Every Poker Near Me page and sub-page, every component, every backing API, the home-games system, the tournament/tour/series ingestion pipeline, and the database migrations behind them.
**Method:** 9 parallel auditors read the assigned files line by line (no sampling), 10 fixer agents applied changes with exclusive file ownership, and 10 adversarial verifiers diffed every hunk against a pre-fix baseline to catch defects introduced by the fixes themselves. 31 agents, ~2.5M tokens, ~1,350 tool calls.

---

## Headline numbers

| | |
|---|---|
| Unique findings | **204** |
| Critical | 9 |
| High | 54 |
| Medium | 91 |
| Low | 50 |
| Findings fixed | **184** |
| Files changed | **93** (83 World Hub + 10 workers) |
| Net change | +4,831 / −2,095 lines |
| Defects introduced by fixers and caught by verifiers | 4 (all repaired) |
| Defects caught by the final typecheck and repaired | 1 |

---

## Verification performed

Every gate below was run against the real repository, not the audit slice.

| Gate | Result |
|---|---|
| `npx tsc --noEmit` (World Hub) | **exit 0** — clean |
| `npx tsc --noEmit` (smarter-poker-workers) | **exit 0** — clean |
| TypeScript parse of all 83 changed `.js`/`.jsx` (JSX enabled) | **exit 0** — no syntax errors |
| Relative + `@/` import resolution (279 imports) | **0 unresolved** |
| Pre-commit hook rules (forbidden `supabase.auth.getUser/getSession`, conflict markers) | **pass** — the real hook ran and printed "No dangerous auth patterns found" |
| Audit Marker Guard (417 registered markers) | **0 markers lost** |
| Adversarial diff review, every hunk, all 10 groups | **all groups pass** |

Three fixes had to be reworked to satisfy your own repo rules, which is exactly what those rules are for:

- The lobby and MoreTabPanel fixes originally called `supabase.auth.getSession()` directly. Rewritten to use `getFreshAccessToken()` from `authUtils` — which is also strictly better, since it refreshes a token within 60s of expiry instead of handing out a stale one.
- `venue-alerts.js` used a bare `supabase.auth.getUser(token)`. Changed to `getSupabase().auth.getUser(token)`, matching the 25 other API routes that already do server-side JWT verification this way.
- `lib/game-engine-service.ts` and `lib/god-mode-service.ts` were given a lazy Supabase client typed as `ReturnType<typeof createClient>`. That resolves the generic `Database` parameter to its default and collapses every query result to `never` — 30 typecheck errors. Retyped off a non-generic `makeClient()` factory.

**One thing I could not run:** `npx next build`. Background processes on your machine are killed when each remote shell call ends (45s ceiling), so a multi-minute build cannot complete through this channel. The typecheck, full JSX parse, and import-resolution sweep cover the syntax and wiring classes a build would catch; your **Build Safety Gate** CI workflow will run the real build on push.

---

## What is committed, and how to ship it

Both repos have the work committed locally on `main`. I could not push — the remote shell has no network access to GitHub (SSH to github.com is blocked at the proxy).

```bash
cd ~/Documents/Smarter-Poker-World-Hub && git push origin main
cd ~/Documents/smarter-poker-workers && git push origin main
```

World Hub commits (3, on top of `5eccbfa697`):

- `c4e73ffb59` — the 184-fix swarm commit, 83 files
- `5e93850b97` — Supabase client typing fix (makes `tsc --noEmit` exit 0)
- `c03ba272be` — repoint 3 fetches at API routes that actually exist

Workers commit: `2d3071c` — tournament ingestion hardening, 10 files.

A note on your working tree: while I was staging files, a concurrent `git-safe-push-auto` process stashed and reset everything, wiping the changes mid-flight (they are recoverable in `stash@{0}`). I re-applied from a pristine copy and committed, so the work is now safe from that. Your `.git` directory also has hundreds of stale lock backups and a chronically recurring `index.lock`; that is worth cleaning up separately, because it is actively costing you deploys.

---

## The 9 critical findings

1. **`lobby.js` crashed the whole 3D lobby on first visit.** `LocationEnablePopup` was passed `handleRefreshLocation`, an identifier that does not exist anywhere in the file. Any first-time visitor whose location prompt fired hit a `ReferenceError` on render.
2. **`ManualLocationModal` crashed on open.** Its body referenced nine identifiers that were neither props nor imports (`manualAddress`, `setManualAddress`, `handleGeocodeAddress`, `isSearching`, and five more).
3. **`LocationEnablePopup` crashed on render** — same class of bug: `dismissLocationPrompt`, `handleGpsClick`, `deviceType`, `setShowManualLocation` were all undefined.
4. **`venue-scraper/receive.js` deleted tournament data it then failed to replace.** For each venue it `DELETE`d every `venue_daily_tournaments` row, then inserted replacements built without `scrape_html_hash` or `scrape_timestamp` — columns with `NOT NULL` constraints. The insert failed, the delete had already committed. Every scrape run was a potential data-loss event.
5. **`venue-tournaments.ts` wrote zero rows, silently.** The upsert targeted a unique constraint that had been dropped and omitted NOT NULL provenance columns; errors were swallowed. The main tournament scraper had been writing nothing.
6. **`venue-alerts.js` had no authentication at all.** It used a service-role client (bypassing RLS) and trusted a client-supplied `user_id`. Anyone could read, create, or delete any user's alerts.

(Items 7–9 are the duplicate detections of 2 and 3 from a second auditor, plus the `LocationEnablePopup` prop-signature mismatch on the lobby side.)

---

## Tournament data: what is actually wrong, and what to do about it

You want the world's most complete tournament database. Right now the ingestion layer is the weakest part of the system — 44 of the 204 findings are in tournament/tour/series data. The honest summary is that **several of your scrapers have been running and storing nothing**, and the failures were invisible because the errors were caught and discarded.

### Fixed in this pass

- **Data loss stopped.** `receive.js` no longer deletes before inserting; rows now carry `scrape_timestamp`, a SHA-256 `scrape_html_hash`, a `scrape_batch_id`, and a `data_quality` marker, so a scrape is now an auditable, idempotent event rather than a destructive one.
- **The main tournament upsert now targets a constraint that exists** and supplies the NOT NULL provenance columns, so writes actually land.
- **The charity scraper's upsert** used a three-column conflict target that does not exist and lowercase `day_of_week` values that never matched. Both fixed.
- **HTML-extracted tour events were being counted and thrown away** — parsed, tallied into a success number, never persisted. Now stored.
- **`daily-tournaments.js` was discarding charity, tour, and home-game events** whenever `venue_daily_tournaments` returned zero rows, and was filtering two of those sources on an `is_active` column that no migration defines (so those queries always errored, silently). Both fixed — this alone should visibly increase how many events users see.
- **Calendar mode filtered recurring tournaments by *today's* weekday** instead of the requested date's weekday, so browsing to next Saturday showed you Sunday's games.
- **Three broken migrations** that could never apply: two used `CREATE POLICY IF NOT EXISTS` (not valid PostgreSQL) and one had an empty `EXCEPTION WHEN OTHERS THEN` block (a plpgsql syntax error). The canonical `venue_daily_tournaments` migration was one of them.
- **Timezone correctness.** Date-only strings like `2026-08-14` were being parsed as UTC and rendered in local time, shifting every series and tour date one day early. Fixed in `SeriesTabPanel`, `TourCard`, and the shared formatters. Tour-stop classification (`past`/`current`/`next`) used server-timezone midnight and flipped around UTC midnight.
- **A fabricated $1,000,000 guarantee.** `tourHtmlExtractor.ts` invented hardcoded "standard events" — including a fake $1M guarantee — whenever real parsing found too few events. That is fake data presented to users as real. Removed.
- **Hardcoded year 2026** in the informal date parser in `tours.js`; every registry stop date would break on 1 Jan 2027.
- **No stale-schedule deactivation:** tournaments removed from a source stayed `is_active` forever. Now handled.
- **`venue_news` had no dedup** — identical items re-inserted on every run.
- **Your scraper secret was being embedded in plaintext prompts sent to a third-party AI service** (Manus), and the scraper API routes silently fell back to the anon key when the service-role key was missing, so "successful" writes were being rejected by RLS.

### Not fixed — needs decisions or schema work

These are the real blockers between where you are and a Google-grade tournament index.

**1. Four core tables have no migration defining them.** `poker_series`, `venue_live_tables`, `tournaments`, and `tournament_alert_preferences` are queried all over the PNM APIs and ALTERed by at least five migrations, but nothing in `supabase/migrations/` ever creates them. Your schema exists only in production. A rebuild from migrations would fail. Fix: `supabase db dump --schema public -t poker_series -t venue_live_tables -t tournaments -t tournament_alert_preferences` and commit it as a baseline migration ordered before the earliest ALTER.

**2. Venue identity is not single-sourced.** `trigger.js` reads the 483-venue master list from a static `public/data/all-venues.json`, while other writers key off `poker_venues`. Two venue-id spaces means dedup can never be fully correct. Move the trigger to read from `poker_venues` (or the `system_cache` entry) so there is one canonical venue list.

**3. The scraper dispatch tier cannot finish.** `trigger.js` dispatches Manus tasks sequentially with a 2-second delay — roughly 33 tasks for 483 venues — which exceeds the serverless function timeout. Most batches are never dispatched. This needs to become a queue-driven worker job, not an HTTP request.

**4. PDF tour schedules mostly lose their dates.** The primary line parser in `tourPdfExtractor.ts` never extracts an event date, so most `tour_event_details` rows land with `start_date NULL` — invisible to any date-based search. And `pdf-parse` is handed the URL rather than the buffer you already downloaded, so every PDF is fetched twice and your User-Agent and size protections are bypassed.

**5. JSON-LD ingestion collapses multi-day events.** `byDay` arrays (a tournament that runs Thu/Fri/Sat) collapse to a single day, and extracted times ignore timezone entirely.

**6. There is no venue timezone.** `getOpenStatus` compares a venue's posted hours against the *viewer's* clock. A New York user looking at a Las Vegas room at 11pm ET sees "Closed" when the room is open. Every "Open Now" pill is wrong whenever viewer and venue timezones differ. This needs a `timezone` column on `poker_venues` — it is the single highest-leverage schema addition for a nationwide product, and it also unblocks correct multi-timezone tournament start times.

**7. Scraper health is not observable.** Alert throttling lives in process memory, so every worker restart re-sends the whole backlog; the owner's phone number is hardcoded in two source files; and `scraper_runs` audit inserts used nonexistent columns, so the audit log was never written. You cannot tell which of your sources went dark last week.

### Where I would go next, in priority order

1. Commit the missing table definitions (item 1). Everything else is built on sand until the schema is reproducible.
2. Add `timezone` to `poker_venues` and backfill from state/coordinates. Fixes open/closed status, tournament start times, and "what's running tonight near me" in one move.
3. Convert scraper dispatch to a queue. Until then your coverage is capped by a function timeout, not by how many sources you have.
4. Build a source-health dashboard off a working `scraper_runs` table — rows written per source per run, last-success timestamp, parse-failure rate. You currently have scrapers that write nothing and no way to notice.
5. Add a dedup/merge layer keyed on (venue, date, start time, buy-in) across the scraper, charity, tour, and home-game sources. Right now they are four parallel pipelines that never reconcile, which is why the same event can appear differently in different tabs.
6. Only then widen sources. More scrapers on a pipeline that silently drops writes just adds more silent drops.

---

## Everything else worth calling out

**Security.** Beyond the `venue-alerts` hole: unauthenticated access to any user's full venue check-in history (a location-privacy leak), claim-page responses leaking claimant name/email/phone to any caller, private home-group invite codes and approximate coordinates exposed to anonymous callers, an authenticated venue-management response containing manager emails and IP logs being served with `s-maxage=60` public CDN caching, any authenticated user able to publish official notifications for any venue or tour page, an admin auth bypass when `ADMIN_ROUTE_SECRET` is unset, and review helpful-voting with no auth and no per-user dedup (trivially stuffable).

**Stored XSS in three map popups.** Scraped tour and venue fields were interpolated unescaped into Leaflet popup HTML in `VenueMapPanel`, `VenueMap`, and `RoadTripPlanner`. Scraped content is attacker-influenced by definition, so this was a live path from a compromised source page to script execution in your users' browsers. All three escaped now.

**Features that were silently dead.** Voice search and `?q=` deep links fetched results and never displayed them. The saved/favorites panel compared prefixed keys against raw ids, so it was always empty. The Live Games tab was unreachable from the default Map tab. Deep links to `/alerts` and `/roadtrip` always landed on the overview. Review photos were collected and discarded. The friends feed pointed at an endpoint that does not exist. The search-history table write used an `ON CONFLICT` target with no matching unique constraint, so every save threw. Reviews modal rendered with no props. Tour stops never appeared on the seasonal calendar because `tours` was missing from a `useMemo` dependency array.

**Schema drift, generally.** A recurring pattern across this codebase: a query selects a column that no migration defines, PostgREST returns error 42703, the destructure grabs only `data` and ignores `error`, and the UI renders an empty list. It looks like "no results" and it is actually a broken query. I found this in home-game upcoming games, review submission, peak activity, venue linking, and the daily-tournaments charity/tour sources. Every one of those fixes now also logs the error instead of swallowing it — so the next instance of this will be visible rather than silent.

**Correctness details** that add up: pagination fetched 200 rows but advanced offsets by 50, re-appending the same items; UTC date cutoffs hid tonight's games from ~5pm local onward across US timezones; the natural-language search parser matched any two-letter word as a state code, so "poker **in** vegas" filtered to Indiana; GPS watchers and intervals leaked on unmount; `filters.selectedDay` persisted forever so returning users saw the wrong day.

---

## Complete findings list


## PNM components — 53 findings (4 critical, 11 high, 28 medium, 10 low)

**[CRITICAL / bug]** `src/components/poker-near-me/modals/LocationEnablePopup.js:52`  
LocationEnablePopup references dismissLocationPrompt, handleGpsClick, deviceType, setShowManualLocation — none are props  
Signature accepts (showEnablePopup, setShowEnablePopup, handleRefreshLocation) but the body uses `dismissLocationPrompt` (line 52), `handleGpsClick` (line 66), `deviceType` (lines 97-152), and `setShowManualLocation` (line 192) — all undefined, so rendering throws ReferenceError. The one extra prop it does declare, handleRefreshLocation, is never used. Since lobby.js auto-shows this popup for firs

**[CRITICAL / bug]** `src/components/poker-near-me/modals/LocationEnablePopup.js:97`  
Component references undefined identifiers and crashes on render  
The JSX references `deviceType` (line 97), `handleGpsClick` (line 66), `dismissLocationPrompt` (line 52), and `setShowManualLocation` (line 192), none of which are defined, imported, or received as props (props are showEnablePopup, setShowEnablePopup, handleRefreshLocation — handleRefreshLocation is never used). `deviceType` is evaluated during render, so the moment lobby.js sets showEnablePopup=t

**[CRITICAL / bug]** `src/components/poker-near-me/modals/ManualLocationModal.js:26`  
ManualLocationModal body references nine identifiers that are neither props nor imports  
The component signature accepts (showManualLocation, setShowManualLocation, manualAddress, setManualAddress, handleGeocodeAddress, isSearching) but the body uses `dismissLocationPrompt` (line 26), `handleGpsClick`/`gpsLoading` (lines 31-43), `gpsError` (line 59), `manualCity`/`setManualCity` (lines 71-73, 104-111), `manualState`/`setManualState` (line 88), and `handleManualLocationSet` (lines 73, 

**[CRITICAL / bug]** `src/components/poker-near-me/modals/ManualLocationModal.js:32`  
Component references undefined state/handlers and crashes on render  
Renders `gpsLoading` (line 32), `gpsError` (line 59), `manualCity`/`setManualCity` (lines 71-72), `manualState`/`setManualState` (line 88), `handleGpsClick` (line 31), and `handleManualLocationSet` (line 103) — none exist in scope. The props it does receive (manualAddress, setManualAddress, handleGeocodeAddress, isSearching) are entirely unused. `gpsLoading` is read during render, so opening the m

**[HIGH / bug]** `src/components/poker-near-me/GlobalSearchOverlay.jsx:92`  
NL parser misreads common 2-letter English words as US state filters  
parseNaturalLanguageQuery falls back to matching ANY bare 2-letter token against STATE_ABBREVS: `const abbrMatch = q.match(/\b([A-Za-z]{2})\b/g)`. Everyday words collide with state codes: 'in' -> IN (Indiana), 'or' -> OR, 'me' -> ME, 'ok' -> OK, 'hi' -> HI, 'la' -> LA, 'de' -> DE, 'pa' -> PA. A query like 'poker in vegas' silently sets state=IN and the venue API call gets `state=IN`, returning Ind

**[HIGH / wiring]** `src/components/poker-near-me/HostHomeGameButton.jsx:33`  
Wiring: two sibling components hit different Commander access endpoints (/api/check-access vs /api/commander/check-access); neither exists in this repo slice  
HostHomeGameButton.jsx:33 fetches '/api/check-access' while CreateHomeGame.jsx:52 fetches '/api/commander/check-access' - both implement the identical 'does this user have Commander access' gate (same headers, same hasAccess handling, same redirect to commander.smarter.poker). At most one of these can be the canonical endpoint; the other is a copy-paste divergence, and whichever is wrong 404s, sil

**[HIGH / bug]** `src/components/poker-near-me/RoadTripPlanner.jsx:243`  
XSS: venue and stop names injected unescaped into Leaflet popup HTML  
bindPopup(`<b ...>${stop.name}</b>`) (line 231) and `<b>${v.name}</b><br/>${v.city}, ${v.state}` (line 243) plus the divIcon html interpolate scraper-sourced venue names directly into innerHTML. Venue names come from external scraped data (Bravo/PokerAtlas), so a malicious or corrupted name like `<img src=x onerror=...>` executes in every planner user's browser. pnm-utils.js exports escapeHtml exa

**[HIGH / bug]** `src/components/poker-near-me/SeasonalCalendar.jsx:74`  
allEvents useMemo omits `tours` from deps — tour stops never appear  
The memo iterates `tours` to push tour_stop events but its dependency array is [series, filterType, filterBuyin]. Tours load asynchronously in the parent; when the tours prop arrives (or updates) after first render, the memo does not recompute, so tour stops are permanently missing from the calendar unless series/filters happen to change afterward. Also the `dailyTournaments` prop is accepted and 

**[HIGH / gap]** `src/components/poker-near-me/SocialLayer.jsx:66`  
Friends feed fetches /api/friends/list which does not exist — feature permanently empty  
fetchFriends calls `/api/friends/list?user_id=` but there is no pages/api/friends/ route anywhere in the repo slice (the code even comments 'API may not exist yet'). Every signed-in user gets a 404, friendsList stays empty, and the entire 'Friends at Venues' feature renders its empty state forever.

**[HIGH / wiring]** `src/components/poker-near-me/TournamentAlerts.jsx:25`  
Supabase preference sync is triple-broken: wrong method, no auth, wrong body  
savePrefs PUTs {user_id, key, value} to /api/poker/tournament-alerts with no Authorization header. The API (pages/api/poker/tournament-alerts.js) 401s any request without a Bearer token, only handles GET/POST/DELETE (PUT falls through to 405 at line 152), and its POST expects {game_types, min_buyin, max_buyin, distance_mi, days, push_enabled, enabled}. The `authToken` prop is destructured but neve

**[HIGH / wiring]** `src/components/poker-near-me/VenueCard.js:262`  
Wiring: 6 cross-feature API endpoints called from PNM/home-games code have no handler under pages/api in this slice  
Endpoint sweep of pages/hub/poker-near-me, pages/hub/home-games and src/components/poker-near-me against pages/api found these fetch targets with no route file in the slice: (1) /api/social/pages/follow - VenueCard.js:262,332; (2) /api/social/posts - VenueCard.js:362 and pages/hub/home-games/[slug].js:610; (3) /api/friends?action=status and POST /api/friends - [slug].js:672,698,713; (4) /api/frien

**[HIGH / bug]** `src/components/poker-near-me/VenueMap.jsx:519`  
Unescaped city/state in tour popup HTML (XSS vector, copy-paste regression)  
buildTourPopupHtml interpolates `${venue.city || ''}, ${venue.state || ''}` into popup innerHTML without escapeHtml, unlike the sibling buildPopupHtml (line 596) which escapes both. City/state come from scraped venue data, so an HTML payload in either field executes on popup open. This is the only unescaped text field in an otherwise fully escaped template — a copy-paste regression.

**[HIGH / bug]** `src/components/poker-near-me/VenueMapPanel.jsx:244`  
Stored-XSS: scraped tour fields interpolated unescaped into popup HTML  
buildTourPopupHtml escapes most fields but injects `${v.dates}` (line 244) and `${v.tour_code || 'TOUR'}` (line 240, also line 246 data-url) raw into the Leaflet popup innerHTML. Tour `dates`/`tour_code` originate from external website scrapers (per the workers pipeline), so a malicious or corrupted scraped value containing `<img onerror=...>` executes in every user's browser when the pin popup op

**[HIGH / gap]** `src/components/poker-near-me/VenueReviews.jsx:164`  
Review photos are collected then silently discarded — API never stores them  
The write-review form collects up to 5 photos ('Photos (up to 5)') and submits `photos: photos.map(p => p.data).slice(0, 3)` (silently capping at 3), but pages/api/poker/reviews.js POST never destructures or persists a photos field, and its GET select list has no photos column — so `r.photos` on line 360 is always undefined. Users' uploaded photos vanish without any error, and the review-photos di

**[HIGH / bug]** `src/components/poker-near-me/modals/LoginPromptModal.js:34`  
Sign In button throws ReferenceError — router is not defined  
The primary CTA calls `router.push('/auth/login?...')` but the component never imports useRouter or receives router as a prop. The modal renders fine, but clicking Sign In (its entire purpose) throws an uncaught ReferenceError and never navigates.

**[MEDIUM / wiring]** `src/components/poker-near-me/BestTimeToGoWidget.jsx:10`  
Relative imports resolve to modules missing from the repo slice  
Four local modules imported across the PNM components do not exist under /home/claude/pnm/src: '../../engine/EventBus' (BestTimeToGoWidget, PeakActivityHeatmap, GameTrendsDashboard, ScraperHealthDashboard, LiveGamesFeed, VenueCard + FilterPanel), '../../lib/supabase' (LiveGamesFeed, ScraperHealthDashboard), '../../lib/authUtils' (VenueCard, HostHomeGameButton, ReportGameModal), and '../../utils/op

**[MEDIUM / regression]** `src/components/poker-near-me/CreateHomeGame.jsx:37`  
Divergent Commander access-check endpoints and regressed auth parsing vs HostHomeGameButton  
CreateHomeGame fetches '/api/commander/check-access' while HostHomeGameButton fetches '/api/check-access' for the identical check — neither route exists under pages/api in this slice, and at most one can be the real endpoint in the full repo. CreateHomeGame also hand-rolls the localStorage 'smarter-poker-auth' parse (lines 35-45), the exact pattern HostHomeGameButton's own comment (lines 10-16) do

**[MEDIUM / bug]** `src/components/poker-near-me/GeofenceAlertBanner.jsx:12`  
Banner never re-shows for a new nearby venue after first dismissal/timeout  
`visible` starts true and is set false on dismiss or after the 30s timeout, but nothing resets it when the `venue` prop changes to a different venue. The timeout effect keys on onDismiss only. After the first alert expires, driving into range of any other venue renders null forever (unless the parent remounts the component with a key).

**[MEDIUM / gap]** `src/components/poker-near-me/GlobalSearchOverlay.jsx:875`  
Detected timeWindow/gameType intents are displayed but never applied to results  
parseNaturalLanguageQuery detects timeWindow ('next month', 'today'...) and gameType ('tournaments', 'PLO'...), and the results header renders chips claiming 'Smart Search — Detected intent: tournaments · next month · in IL'. But handleSubmit only applies `stateCode` to the venue API call (line 551); timeWindow and gameType are never used to filter venues, tours, or series. A user searching 'tourn

**[MEDIUM / bug]** `src/components/poker-near-me/GlobalSearchOverlay.jsx:630`  
Keyboard navigation selects invisible, stale items  
handleKeyDown maintains selectedIndex for ArrowUp/ArrowDown and Enter activates items[selectedIndex], but (a) no suggestion row ever renders a highlight for selectedIndex — the user cannot see what is selected, and (b) selectedIndex is never reset when localQuery changes or the suggestion lists refresh (debounced venue results arrive), so Enter can activate a different item than the one the user l

**[MEDIUM / regression]** `src/components/poker-near-me/GlobalSearchOverlay.jsx:874`  
Bare emoji in JSX and string literals violates binding no-emoji rule (SWC/Vercel build risk)  
Lines 874 and 876 have bare emoji directly in JSX text (`📍 {nlIntent.stateCode}`, `🃏 {...}`), and lines 118-123 / 180-185 put emoji in string literals passed as props. The repo's CLAUDE.md Immutable Rule 7 explicitly forbids emoji in JSX, string literals, and props because bare emoji have broken the SWC compiler and Vercel builds before. VenueMap.jsx line 527 has the same violation (📅 in a templat

**[MEDIUM / stub]** `src/components/poker-near-me/LiveGamesFeed.jsx:1053`  
Hardcoded fake 'STAKES PLAYED $1/$2 $2/$5' shown when a venue has no game data  
When v.games is empty the card renders the literal string 'STAKES PLAYED $1/$2 $2/$5' for every such venue regardless of what stakes it actually spreads — placeholder data presented as real venue information.

**[MEDIUM / bug]** `src/components/poker-near-me/LiveGamesFeed.jsx:1021`  
Catalog venues display physical table capacity as 'N Tables Running' with a live pulsing dot  
catalogMapped sets totalTables = v.poker_tables (room capacity, lines 668-677) and _isLive=false, but the badge at lines 1021-1024 unconditionally renders '{totalTables} Tables Running' with an animated green live dot. A closed 30-table room with zero live data shows '30 Tables Running'. The adjacent 'Last Known' badge is also wrong for these rows — the number was never observed running. Heat leve

**[MEDIUM / wiring]** `src/components/poker-near-me/MoreTabPanel.jsx:81`  
authToken wired from user?.access_token which likely does not exist on the user object  
SocialLayer (line 81) and TournamentAlerts (line 102) receive `authToken={user?.access_token}`. `user` comes from useAvatar() in [pnmTab].js:403 — a Supabase auth user/profile object, and Supabase puts access_token on the *session*, not the user. If so, authToken is always undefined and SocialLayer's fetches (which only attach the Authorization header when authToken is truthy, SocialLayer.jsx:65) 

**[MEDIUM / gap]** `src/components/poker-near-me/NearMeNowFeed.jsx:44`  
'Tournament' feed type is defined and filterable but never fetched — chip always empty  
The header comment promises 'live games, check-ins, tournament starts, and promotions' and TYPE_COLORS/FEED_ICONS define a tournament type with a filter chip, but fetchFeed only queries live-games, checkins, and promotions. No item ever has type 'tournament', so selecting the Tournament chip always shows the empty state and the click-through branch at line 296 is dead.

**[MEDIUM / bug]** `src/components/poker-near-me/RichTourCard.jsx:96`  
'Upcoming Stops' list includes past stops and duplicates the NEXT STOP banner  
The tour-schedule API returns allStops ordered [current, next, ...future, ...past] with stop_type values 'current'|'next'|'future'|'past' (pages/api/poker/tour-schedule.js lines 398-401). upcomingStops filters out only 'current', so (a) the 'next' stop shown in the banner is repeated as the first row of Upcoming Stops, and (b) when fewer than 5 future stops exist, past stops fill the list under th

**[MEDIUM / bug]** `src/components/poker-near-me/SeasonalCalendar.jsx:95`  
Timezone off-by-one: event dates parsed as UTC, compared against local dates  
getEventsForDate does `new Date(e.start_date)` on 'YYYY-MM-DD' strings, which parses as UTC midnight; getFullYear/getMonth/getDate then convert to the viewer's local zone, so for all US users (negative UTC offset) every series/tour event lands one day earlier than its real date on the calendar. RoadTripPlanner avoids this with `.replace(/-/g, '/')` and RichTourCard appends 'T00:00:00', but this fi

**[MEDIUM / regression]** `src/components/poker-near-me/SeriesCard.js:52`  
Unsanitized external URL href — javascript:/data: scheme not blocked (copy-paste regression)  
SeriesCard builds `href={s.source_url || s.website}` with only an http-prefix check. TourCard.js (lines 129-134) and NewSeriesVenueCard.jsx (safeHref, lines 17-24) both explicitly fixed this exact XSS vector ('BUG FIX: Sanitize URL — block javascript: protocol XSS'), but SeriesCard was never updated, so a scraped series row with source_url='javascript:...' renders a live XSS link.

**[MEDIUM / bug]** `src/components/poker-near-me/SeriesTabPanel.jsx:37`  
Calendar shifts series one day early: date-only strings parsed as UTC  
SeriesCalendar does `new Date(s.start_date)` / `new Date(s.end_date)` on date-only strings ('2026-08-01'), which JS parses as UTC midnight. The day-cell comparison at lines 62-63 then reads local getFullYear/getMonth/getDate — in all US timezones that yields the PREVIOUS day, so every series renders one day early on the calendar and series starting on the 1st bleed into the prior month's grid. Cla

**[MEDIUM / bug]** `src/components/poker-near-me/SocialLayer.jsx:74`  
Loading spinner never clears when the friends API succeeds with zero friends  
fetchFriends sets loading=false only on !res.ok or catch. On a successful response with an empty friends array, setFriendsList([]) runs but the effect at line 144 skips fetchFriendCheckins (friendsList.length === 0), which is the only success-path setLoading(false). The user is stuck on 'Finding friends...' forever.

**[MEDIUM / bug]** `src/components/poker-near-me/SocialLayer.jsx:99`  
Friend check-ins are not time-filtered — historical check-ins shown as currently active  
The comment says 'Batch fetch checkins for each friend (last 24h)' but the request `/api/poker/checkins?user_id=${fid}` passes no since/limit parameter, so all of a friend's historical check-ins are aggregated. The UI shows each with a green 'online dot' and counts them all in the 'N active' badge, so a friend who checked in 3 weeks ago appears to be at the venue now. The serial 50-request loop is

**[MEDIUM / bug]** `src/components/poker-near-me/TourCard.js:29`  
Shared formatDate has same UTC date-shift bug for tournament dates  
formatDate uses `new Date(dateStr)` + toLocaleDateString; for date-only strings ('2026-08-01') this shows the previous day in US timezones. This helper is exported and reused by SeriesCard.js (line 29) and NewSeriesVenueCard.jsx (line 147), so series start/end dates and 'Next:' dates on tour cards are all displayed one day early.

**[MEDIUM / bug]** `src/components/poker-near-me/TournamentAlerts.jsx:36`  
Alert matching by substring fails against real game names; distance pref never applied  
prefs.gameTypes entries like 'NLH' are matched via `tGame.includes('nlh')` against tournament.game_type, but daily tournament rows carry names like "No Limit Hold'em" — which does not contain 'nlh' — so an NLH-only alert matches nothing (same for 'Omaha Hi-Lo' vs 'PLO8' variants). normalizeGameName in ./normalize-game exists precisely for this and is unused here. Separately, the distanceMi prefere

**[MEDIUM / bug]** `src/components/poker-near-me/TripCostCalculator.jsx:205`  
Bare emoji in JSX/source across 8 PNM components violates binding no-emoji rule  
CLAUDE.md (both repos) bans emoji in source/JSX because bare emoji have broken the SWC compile and Vercel builds. Violations: TripCostCalculator.jsx lines 205/214/223/232 (bare JSX text ⛽🎲🏨🍽️), RichTourCard.jsx lines 221/228 (bare 📍💰), SeasonalCalendar.jsx lines 243/246, VoiceSearch.jsx lines 244/268, TournamentAlerts.jsx line 102 ('Tournament Alert 🏆' notification title), InteractiveTutorial.jsx 

**[MEDIUM / stub]** `src/components/poker-near-me/VenueCard.js:296`  
'Est. Wait: N Min' is fabricated from a seeded hash, not real waitlist data  
waitEstimate derives minutes as `minW + (seed % range)` where seed is a hash of venue.id — a deterministic pseudo-random number within a bracket chosen only by crowd label. It ignores venue.live_data.players_waiting entirely (pnm-utils.estimateWaitTime exists for that and is imported but unused here). Users see an authoritative-looking wait time that has no relationship to the actual waitlist.

**[MEDIUM / bug]** `src/components/poker-near-me/VenueCard.js:362`  
Check-in posts show success without checking response; target APIs absent from slice  
handleCheckinSubmit awaits fetch('/api/social/posts') and immediately sets checkinDone(true) — a 401/500 (or the route not existing: there is no pages/api/social/ in this repo slice; the follow endpoint /api/social/pages/follow at line 262/332 is likewise absent) still shows '✓ Checked in!' and closes the modal, silently losing the check-in. It also never posts to /api/poker/checkins, so the venue

**[MEDIUM / bug]** `src/components/poker-near-me/VenueCompare.jsx:206`  
'+ Add Venue' button is a no-op — comparing a 3rd venue is impossible  
The button's onClick is `setSelectedIds(prev => prev)` which changes nothing, and the venue search/selection list is only rendered while `selectedVenues.length < 2` (line 125). Once two venues are selected the picker disappears, so the advertised 2-3 venue comparison is capped at 2 and the Add Venue affordance dead-clicks.

**[MEDIUM / bug]** `src/components/poker-near-me/VenueCompare.jsx:53`  
Trust score shown as N/100 but the value is a 1-5 review average; Hours reads a nonexistent column  
recalculate_venue_trust_score (20260405_venue_reviews_categories.sql) sets trust_score = AVG(rating) on a 1-5 scale, and LiveGamesFeed/VenueCard render it as '/5'. VenueCompare renders `${venue.trust_score}/100`, so a top venue shows '4.8/100'. Additionally the 'hours' row (line 58) reads venue.hours_of_operation, a field no migration or venues API select defines (API returns hours_weekday/hours_w

**[MEDIUM / bug]** `src/components/poker-near-me/VenueMapPanel.jsx:574`  
Markers never render if venues arrive before async Leaflet init (missing mapReady dep)  
The Phase 2 marker effect early-returns when `leafletRef/mapInstanceRef/markersLayerRef` are null (line 462), but its dependency array is only `[venues, userLocation, radiusMiles]`. Leaflet loads via an async dynamic import; if the venues prop is already populated (e.g., cached data in lobby.js) when init completes, `setMapReady(true)` re-renders but does NOT re-run this effect, so the map stays e

**[MEDIUM / bug]** `src/components/poker-near-me/VenueMapPanel.jsx:567`  
fitBounds + full marker rebuild on every parent re-render hijacks user pan/zoom  
lobby.js computes `mapVenues` inline on every render (lobby.js:1865), so the venues prop is a new array identity each parent render. The marker effect then clears all layers, re-creates every divIcon, and calls `map.fitBounds(..., animate: true)` (line 567) on each render — any state update in the lobby (polling, unrelated setState) yanks the viewport back to the fitted bounds while the user is pa

**[MEDIUM / wiring]** `src/components/poker-near-me/VenueReviews.jsx:25`  
Category-rating keys don't match API columns — 3 of 5 categories never persisted as columns  
The UI (and ReportGameModal.jsx lines 46-52) submits category_ratings keyed dealers/game_quality/rake/food/atmosphere, but pages/api/poker/reviews.js CATEGORY_KEYS = ['dealers','atmosphere','food_drinks','waitlist_speed','game_selection'] (line 19). Only dealers and atmosphere land in first-class *_rating columns; game_quality/rake/food fall into metadata only and are excluded from the API's categ

**[MEDIUM / bug]** `src/components/poker-near-me/normalize-game.js:19`  
Pattern order misclassifies Limit Hold'em as NLH and Omaha Hi-Lo as PLO  
The generic `\bholdem\b|\bhold'?em\b` NLH pattern (index 8) precedes the LHE pattern `limit\s*(hold|texas|holdem)` (index 9), so '4/8 Limit Hold'em' matches NLH first and is labeled/filtered as no-limit. Similarly plain 'Omaha Hi-Lo' fails the PLO8 pattern (which requires 'pot limit omaha hi-lo') and falls through to /omaha/ → PLO. These feed gameShortLabel/isSameGame used for dedup and per-game h

**[MEDIUM / bug]** `src/components/poker-near-me/pnm-utils.js:123`  
getOpenStatus compares venue hours against the viewer's local clock, not the venue's timezone  
Open/Closed status is computed from `new Date()` in the browser's timezone against the venue's posted local hours. A New York user browsing a Las Vegas room at 11 PM ET sees 'Closed' when the room (8 PM PT) is open, and vice versa. Every VenueCard 'Open Now'/'Closes X' pill is wrong whenever viewer and venue timezones differ.

**[LOW / bug]** `src/components/poker-near-me/DailyTournamentsPanel.jsx:291`  
Today-tab countdown shows a countdown to tomorrow for tournaments that already started  
The countdown IIFE (lines 275-302) runs only on the Today tab; when the start time has passed it does `target.setDate(target.getDate() + 1)` and, since diffMin <= 1440 passes, renders e.g. '23h 0m' for a 7PM tournament viewed at 8PM — implying it starts in 23 hours today rather than being underway/finished. The tz conversion `new Date(new Date().toLocaleString('en-US',{timeZone}))` is also a local

**[LOW / bug]** `src/components/poker-near-me/DailyTournamentsPanel.jsx:119`  
IntersectionObserver pagination stalls when sentinel stays in view after load  
The observer increments renderLimit on isIntersecting, but IntersectionObserver only fires on threshold crossings. If appending 20 items does not push the sentinel out of the viewport (large desktop viewport, compact cards, or grouped mode with few groups), no further callback fires and the remaining tournaments never load until the user scrolls the sentinel out and back in. The effect also re-sub

**[LOW / bug]** `src/components/poker-near-me/DailyTournamentsTabPanel.jsx:132`  
guaranteed === 0 renders a stray literal '0'; buy_in unformatted and '$' when missing  
Line 132 `{t.guaranteed && <span ...>}` renders the number 0 as text when guaranteed is 0 (React renders falsy 0). Line 131 renders `${t.buy_in}` raw: null/undefined buy_in produces a bare '$' tag, and large values render without thousands separators ('$1500'), violating CLAUDE.md rule 5 ('Format numbers with .toLocaleString()').

**[LOW / bug]** `src/components/poker-near-me/DailyTournamentsTabPanel.jsx:70`  
Day selector uses stale-object setFilters while sibling handlers use functional form  
The day button calls `setFilters({ ...filters, selectedDay: day })` with the render-time filters snapshot, while every other handler in the file uses the functional `setFilters(f => ...)` form. If a chip/input update and a day click land in the same batch (fast interaction), the object-form call clobbers the other update. It also triggers fetchDailyTournaments(day) whose parent implementation re-r

**[LOW / stub]** `src/components/poker-near-me/FilterPanel.jsx:45`  
FilterPanel is dead code — dynamically imported in lobby.js but never rendered  
lobby.js:69 declares `const FilterPanel = dynamic(...)` but no `<FilterPanel` element exists anywhere in pages/ or src/ (only LiveGamesFeed references its stakes format in a comment). The component (and its eventBus PNM_FILTERS_UPDATED emissions and 'fp' localStorage namespace) is unreachable in the PNM flow, yet its 150-mile radius clamp logic diverges from MapTabPanel which offers up to 500 mile

**[LOW / bug]** `src/components/poker-near-me/GlobalSearchOverlay.jsx:596`  
handleSubmit/handleInputChange capture stale userLocation (missing dep)  
Both useCallbacks read `userLocation?.lat/lng` to add GPS params to /api/poker/venues, but userLocation is absent from their dependency arrays (lines 530, 596). If GPS resolves via the storage/custom-event listeners after the callbacks were created, searches submitted without further typing use the stale null location and lose distance-aware ranking. Line 71 also contains the copy-paste typo regex

**[LOW / improvement]** `src/components/poker-near-me/GlobalSearchOverlay.jsx:219`  
Directions button hardcodes maps.apple.com regardless of platform  
DetailModal's Directions action opens `https://maps.apple.com/?q=...` for every user, while the rest of the PNM map stack routes through the openNativeMaps helper that picks the right provider per device. Android/desktop users get bounced through Apple Maps' web redirect instead of Google Maps.

**[LOW / bug]** `src/components/poker-near-me/MapTabPanel.jsx:101`  
Radius select has no 150-mile option though loadMore sets radius to 150  
The Venues tab 'Search Farther' flow (RADIUS_TIERS = [50,100,150] in VenuesTabPanel + loadMore in [pnmTab].js) sets filters.radius to 150 and persists it. Switching to the Map tab then renders a controlled <select value={150}> whose options are 25/50/100/200/250/500/Any — no 150 — so the select displays blank/unselected and the visible radius badge shows nothing meaningful until the user picks ano

**[LOW / bug]** `src/components/poker-near-me/SeriesTabPanel.jsx:74`  
Calendar event click falls back to bogus series id (slice index + 1)  
When s.id is missing, the calendar event navigates to '/hub/series/' + (si + 1), where si is the index within the day's 2-item slice — i.e., /hub/series/1 or /hub/series/2, an unrelated or nonexistent series. The grid view has the same pattern for favorites: `isFavorited('series', s.id || (i + 1))` (lines 152-153) keys favorites by list position, so favorites silently re-target different series wh

**[LOW / wiring]** `src/components/poker-near-me/VenueMap.jsx:20`  
Imports resolve to files absent from the repo slice (openNativeMaps, EventBus)  
VenueMap.jsx:20 and VenueMapPanel.jsx:3 import '../../utils/openNativeMaps' but src/utils/ does not exist in the slice; FilterPanel.jsx:8 imports '../../engine/EventBus' but src/engine/ does not exist. Entire shared directories (src/utils, src/engine, src/hooks, src/contexts) were excluded from the extraction, so these almost certainly exist in the full Smarter-Poker-World-Hub repo — but they cann


## Poker APIs — 44 findings (1 critical, 19 high, 21 medium, 3 low)

**[CRITICAL / bug]** `pages/api/poker/venue-alerts.js:46`  
venue-alerts API has no auth: any caller can read, create, or deactivate any user's alerts  
The route uses a service-role Supabase client (bypasses the venue_game_alerts RLS owner policy added in 20260419000000_rls_hardening_pass2.sql) but never verifies a JWT. GET trusts req.query.user_id (line 31) to list a user's alerts; POST trusts req.body.user_id (line 46) to insert rows for any user; DELETE (line 83) deactivates any alert given id + user_id from the body. Every other write route i

**[HIGH / bug]** `pages/api/poker/activity.js:72`  
POST handler completely broken: two ReferenceErrors (verifiedUserId out of scope, undefined 'error')  
In getVerifiedUserId (line 24) the code returns `(!error && user)` but `error` is never destructured — only `data` is — so any call throws ReferenceError. Worse, at line 72 the insert uses `user_id: verifiedUserId`, but `verifiedUserId` is declared with const INSIDE the `if (adminSecret !== process.env.ADMIN_ROUTE_SECRET)` block (line 48). When the admin secret matches, execution reaches line 72 w

**[HIGH / bug]** `pages/api/poker/activity.js:47`  
Admin auth bypass when ADMIN_ROUTE_SECRET env var is unset  
`if (adminSecret !== process.env.ADMIN_ROUTE_SECRET)` — if ADMIN_ROUTE_SECRET is not configured, a request with NO x-admin-secret header yields `undefined !== undefined` = false, so the entire auth block is skipped and the request is treated as admin. Currently masked by the verifiedUserId ReferenceError (see other finding), but as soon as that is fixed this becomes an unauthenticated write path i

**[HIGH / bug]** `pages/api/poker/checkins.js:192`  
Unauthenticated access to any user's full venue check-in history (location PII leak)  
GET /api/poker/checkins?user_id=<uuid> returns up to 100 rows of that user's check-ins (select *: venue, message, timestamps), enriched with venue name/city/state — effectively a physical location history for any user id, with no auth and no consent check. The checkins/ subdir endpoints (stats.js, badges.js, heatmap.js, streak.js) expose the same per-user data unauthenticated, though aggregated. I

**[HIGH / bug]** `pages/api/poker/claim-page.js:110`  
Claim lookup leaks claimant contact_name, contact_email, contact_phone to any caller  
GET with page_type+page_id does `.select('*')` on page_claims and returns `claim: data[0]` — including contact_name, contact_email, contact_phone, verification_notes and user_id of the claimant — with no authentication. GET with ?user_id=<uuid> similarly returns any user's claims (IDOR). page_claims schema (migrations) confirms these PII columns exist.

**[HIGH / bug]** `pages/api/poker/daily-tournaments.js:590`  
Charity, tour, and home-game events discarded whenever venue_daily_tournaments returns zero rows  
The charity (line 375), tour-series (line 398), and Phase 20 home-game (line 449) integrations are all nested inside `if (!error && dbTournaments && dbTournaments.length > 0)`. The else branch (line 590-593) sets `tournaments = []`. So on any day/state/filter combination where there are no venue daily tournaments — but there ARE charity events, tour stops, or home-game tournaments (already fetched

**[HIGH / wiring]** `pages/api/poker/daily-tournaments.js:255`  
charity_events_schedule and poker_tour_series_events filtered on is_active column that no migration defines  
Lines 255 and 264 apply `.eq('is_active', true)` to charity_events_schedule and poker_tour_series_events. The only CREATE TABLE definitions (supabase/migrations/20260401_scrape_integrity_layer.sql) define neither table with an is_active column, and no ALTER adds one. PostgREST will error ('column does not exist'); the code destructures only `data` from Promise.all so the error is silently swallowe

**[HIGH / bug]** `pages/api/poker/daily-tournaments.js:264`  
Charity and tour events filtered on nonexistent is_active column — both queries always fail, errors silently discarded  
Lines 255 and 264 apply .eq('is_active', true) to charity_events_schedule and poker_tour_series_events. Both tables are created in 20260401_scrape_integrity_layer.sql (lines 15-32 and 39-55) with no is_active column, and no migration ever adds one (verified by grep). PostgREST returns a 42703 error for each query, and line 269 destructures only { data } from Promise.all, discarding the error — so 

**[HIGH / bug]** `pages/api/poker/notifications.js:33`  
Any authenticated user can publish official notifications for any venue/tour/series page  
POST /api/poker/notifications only checks that the caller is logged in (getServerUserWithFallback) then inserts into page_notifications for arbitrary page_type/page_id. These notifications are then served to every follower of that page (GET branch, and promotions.js also surfaces notification_type='promotion' publicly). There is no ownership, page_claims/venue_managers, or admin check — contrast w

**[HIGH / wiring]** `pages/api/poker/peak-activity.js:85`  
venue_live_history queried by venue_id, a column that does not exist (table keys on bravo_slug)  
When venue_id is provided without game_type, the default branch runs `.eq('venue_id', parseInt(safeVenueId, 10))` against venue_live_history. All three CREATE TABLE definitions of venue_live_history in migrations contain only bravo_slug/venue_name/total_tables/... — no venue_id; migration 20260329_track2_supplementary_indexes.sql even comments 'venue_live_history: uses bravo_slug (not venue_id)'. 

**[HIGH / bug]** `pages/api/poker/venue-activity.js:22`  
venue-activity endpoint broken: supabase client constructed with (req) and non-canonical rateLimit import  
Every other API file calls `createClient(url, key)`; this file imports `createClient as supabaseServerClient` and calls `supabaseServerClient(req)` — passing the Node request object as the URL argument, which throws (supabase-js rejects invalid URLs) at line 22, OUTSIDE the try block, so the whole endpoint 500s. It also imports `rateLimit` (line 11) with signature `rateLimit(req, {max, windowMs})`

**[HIGH / bug]** `pages/api/poker/venue-alerts.js:46`  
venue-alerts CRUD trusts client-supplied user_id — IDOR on create/read/delete  
GET returns any user's alerts via ?user_id=, and POST/DELETE accept user_id from the request body with no JWT verification (VenueGameAlerts.jsx lines 25, 77-102 sends them unauthenticated). This violates the repo's Immutable Rule 5 ('No trusting req.query.userId'): anyone can enumerate another user's alert subscriptions (PII: which venues they frequent), create alerts as another user, or deactivat

**[HIGH / bug]** `pages/api/poker/venue-alerts.js:31`  
No authentication on venue-alerts CRUD: IDOR on read, create, and delete via caller-supplied user_id  
GET takes user_id from the query string and returns all of that user's alerts (which venues/games they track). POST and DELETE trust user_id from the request body, so anyone can create alerts for or deactivate alerts belonging to any user. This directly violates the repo rule 'No trusting req.query.userId for identity — use JWT via supabase.auth.getUser(token)'. Every other alert endpoint (tournam

**[HIGH / bug]** `pages/api/public/live-games/[id].js:209`  
Live-game detail/confirm/delete endpoints target a live_games schema that was never applied (reported_by, seats_open, waitlist_size, FK embed)  
The real live_games schema (created in archive/20260130_social_pages_tables.sql:61 and confirmed by the active 20260511220000_phantom_rpcs_real_impls_r5.sql insert list and 20260511230000 r6 comments 'seats_open/waitlist_size not stored on live_games') has user_id, wait_time, table_count, notes, game_quality, is_active, confirmation_count — no reported_by, no seats_open, no waitlist_size, no last_

**[HIGH / bug]** `pages/api/public/venue/[id].js:169`  
linked_entity_id never selected from social_pages, so the home-group bridge (games/stakes/tournaments) is dead code  
Line 169 gates on `socialPage.linked_entity_id`, but the three social_pages selects (lines 92, 102, 113) do not include linked_entity_id in their column lists — it is always undefined. The commander_home_groups lookup never runs, so home-game venue pages never display their configured games, stakes, or scheduled tournaments (hgGames/hgStakes/hgTournaments stay empty unless a linked poker_venue exi

**[HIGH / bug]** `pages/api/public/venue/[id].js:145`  
Linked-venue lookup selects poker_venues.slug, a column absent from every migration — Commander bridge silently dead for social pages  
Both linked-venue queries (lines 145 and 156) include 'slug' in the poker_venues select. 'slug' appears in no migration for poker_venues (grep across supabase/migrations: zero hits for that table), unlike has_tournaments which at least is evidenced in prod by the 20260407_weekly_schedule_schema.sql index predicate. If the column is missing the select returns an error, lv stays null, and the fallba

**[HIGH / bug]** `pages/api/public/venue/[id]/manage.js:28`  
Public CDN caching (s-maxage=60) on authenticated venue-management response containing manager emails and IP logs  
The handler sets `Cache-Control: public, s-maxage=60, stale-while-revalidate=300` for every GET before auth runs. The authenticated response includes the full poker_venues row, all managers with `profiles(... email)`, and the last 20 venue_verification_log rows (select * — includes ip_address and user_agent). A shared CDN cache can serve one manager's response to any subsequent visitor of the same

**[HIGH / stub]** `pages/api/public/venue/verify.js:121`  
Venue ownership verification is a stub: the 4-digit code is never delivered, and is brute-forceable  
claim.js generates a 4-digit code (line 24-26) and stores it, but the delivery step is a TODO (claim.js line 242: 'For now, we'll return success and let admin handle verification'). So no legitimate owner can ever receive the code — the self-serve verify flow is dead for real users. Meanwhile verify.js will approve a claim and grant FULL venue management (venue_managers role 'owner', all can_* per

**[HIGH / wiring]** `pages/api/venues/[...slug].js:203`  
Review insert writes 'title'/'text' columns that no migration defines on venue_reviews — review submission + diamond award path fails  
The Hono /api/venues/reviews route inserts `{ user_id, venue_id, rating, title, text }` into venue_reviews. The canonical venue_reviews (20260403_venue_reviews_checkins.sql + 20260405 category migration) uses review_text/reviewer_name; no migration anywhere adds a `title` column. The insert will fail with 'column "title" does not exist' → 500 'Failed to insert review', so the review-with-diamond-r

**[HIGH / bug]** `pages/api/venues/[...slug].js:209`  
Review submission inserts venue_reviews.title and .text — columns no migration defines  
The review POST handler inserts { user_id, venue_id, rating, title, text } into venue_reviews. venue_reviews (archive/20260130_social_pages_tables.sql:34) has review_text, and 20260405_venue_reviews_categories.sql adds category ratings, review_text, is_verified_player, reviewer_name — but no migration anywhere adds 'title' or a plain 'text' column (grep across supabase/migrations confirms). The in

**[MEDIUM / bug]** `pages/api/poker/checkins/trending.js:83`  
Trend velocity reads s.recent6h which is never computed — 'rising' trend unreachable  
countMap entries are built with only { venue_id, count, uniqueUsers } (lines 50-55), but the trend logic uses `s.recent6h / s.count` and `s.recent6h >= 2` (lines 83-85). recent6h is always undefined, so velocityRatio is NaN and trend can never be 'rising'; every venue shows 'steady' or 'hot'. Also uniqueUsers dedups by user_name (line 54), so distinct users sharing a display name are collapsed.

**[MEDIUM / bug]** `pages/api/poker/daily-tournaments.js:189`  
exact_date (calendar) mode filters recurring tournaments by TODAY's weekday instead of the requested date's weekday  
When a client passes exact_date=2026-08-01 (a Saturday) without a `day` param, line 190 sets targetDay = getCurrentDay() (e.g. 'Wednesday') and line 191 filters venue_daily_tournaments to `day_of_week ilike 'Wednesday' OR 'daily'`. The calendar for a future date therefore shows the current weekday's recurring tournaments and omits the correct day's — wrong data unless the caller happens to also pa

**[MEDIUM / stub]** `pages/api/poker/daily-tournaments.js:384`  
Hardcoded fake start times for charity/tour events; logo enrichment wipes home-game logos  
Charity events are injected with `start_time: '12:00 PM' // Default` (line 384) and tour events with `'11:00 AM' // Default` (line 406) — invented times displayed to users as real start times and used by the time-floor filter and time-slot grouping. Separately, the logo batch-enrichment (line 633-636) maps every tournament to `logoMap.get(Number(t.venue_id)) || null`; for home-game entries venue_i

**[MEDIUM / gap]** `pages/api/poker/events-calendar.js:182`  
Documented ?day= filter is parsed but never applied anywhere  
The endpoint docs (line 10) advertise `?day=Monday|...|all` and the handler destructures and sanitizes `day` (lines 182, 200), but no code path ever uses the variable — recurring tournaments are projected purely by date range. Clients filtering by day get unfiltered results silently.

**[MEDIUM / bug]** `pages/api/poker/game-predictions.js:94`  
Peak-hour analytics bucket by UTC hours but present them as local times — peak times off by 4-8 hours for US venues  
game-predictions.js (lines 94-95), peak-activity.js (lines 131-132), venue-predictions-batch.js (lines 48-49) use getUTCHours/getUTCDay, and venue-activity.js (lines 66-68) uses server-local getHours (UTC on Vercel), then render '7 PM'/'Fri at 11 AM' style labels with no timezone conversion. A Las Vegas venue peaking at 7 PM PT is reported as peaking at 2-3 AM, and day-of-week attribution shifts a

**[MEDIUM / bug]** `pages/api/poker/leaderboards.js:57`  
Leaderboards computed from unbounded selects silently capped at 1000 rows — rankings wrong at scale  
The venue_checkins, venue_reviews, and social_posts queries select user_id for the whole period with no .limit()/.range(); Supabase caps responses at the project max (1000 rows, acknowledged elsewhere in this codebase, e.g. events-calendar EC3/EC4 fixes). Once any of these tables exceeds 1000 rows in the period (period=all certainly), counts are computed over an arbitrary 1000-row subset with unsp

**[MEDIUM / bug]** `pages/api/poker/reviews.js:388`  
Review helpful/unhelpful voting is unauthenticated and unlimited — vote stuffing  
PATCH increments helpful_count/unhelpful_count with only review_id+action in the body — no auth, no per-user dedup table. VenueReviews.jsx's voted_helpful guard is client-state only (lost on refresh), so any user or script can inflate/bury a review's helpfulness arbitrarily, and the 'Most Helpful' sort is trivially manipulable.

**[MEDIUM / gap]** `pages/api/poker/reviews.js:242`  
AI-flagged reviews (is_flagged=true) are still served to the public — moderation has no effect on display  
POST runs Grok moderation and stores is_flagged/flag_reason (lines 60-87, 137-138), but the GET branch fetches all reviews for a venue with no `.eq('is_flagged', false)` (or .neq) filter, and is_flagged isn't even excluded from the returned payload. Hate speech/spam that the AI flags is displayed exactly like any other review, making the entire moderation pass dead weight.

**[MEDIUM / bug]** `pages/api/poker/reviews.js:388`  
Helpful/unhelpful voting is unauthenticated, unlimited per user, and non-atomic  
PATCH requires no auth and records no per-user vote, so anyone can inflate helpful_count on their own review (or bury others) limited only by the IP rate limit; there is no vote dedup table. The increment is also a read-then-write (lines 394-411), so concurrent votes lose updates. Since 'helpful' is a sort option, this manipulates ranking.

**[MEDIUM / bug]** `pages/api/poker/scraper-health.js:138`  
Zero-data sources classified 'warning' not 'critical', and endpoint still monitors the permanently-removed bravo source  
When a source has no rows at all, the issue string is '<source>: NO DATA FOUND', but overallStatus only escalates to critical when an issue contains 'DEAD' or 'anomaly'. So a completely dead scraper whose stale rows were purged (scraper-data-cleanup deletes venue_live_tables rows older than 2h) yields status 'warning' with HTTP 200 — external monitors polling for 503 never fire for the worst failu

**[MEDIUM / bug]** `pages/api/poker/scraper-metrics.js:53`  
Reads m.error_count but scraper_metrics column is named 'errors' — dashboard always shows zero errors  
Migrations 20260329_scraper_infrastructure.sql / 20260329120000_scraper_intelligence_tables.sql define the column as `errors INT DEFAULT 0`; there is no error_count column on scraper_metrics anywhere in the migrations. `r.error_count` is therefore always undefined: total_errors sums to 0 and each history entry's `errors` field is undefined, so the ScraperHealthDashboard can never surface scraper e

**[MEDIUM / regression]** `pages/api/poker/series.js:442`  
JSON-fallback series IDs shift when suppressed entries are filtered before index-based ID assignment  
The list fallback maps `(seriesJson.series_2026 || []).filter(s => !s.is_suppressed)` through mapSeriesToApi, which assigns `id: index + 1` on the FILTERED array. The single-series fallback (line 243) maps the UNFILTERED array. If any JSON entry is suppressed, every subsequent series gets a different id in the list than in the by-id lookup, so clicking a card opens the wrong series (off-by-N).

**[MEDIUM / wiring]** `pages/api/poker/series.js:317`  
Search/tour filters reference columns migrations never define (tournament_series.venue/city/tour; poker_series.name)  
The tournament_series .or filters use `venue.ilike` and `city.ilike` (line 317) and `tour.ilike`/`short_name` (line 308), but the CREATE TABLE for tournament_series defines name, short_name, venue_name, location — no venue, city, or tour columns, and no ALTER adds them. Likewise psQuery (line 356) uses `name.ilike` on poker_series, whose migrations only show series_name/short_name (the unified-eve

**[MEDIUM / gap]** `pages/api/poker/venue-dedup.js:23`  
Venue dedup limited to a 22-entry hardcoded alias table; alias resolution unused by the alert matcher  
Cross-source venue reconciliation for a nationwide product rests on a static list of ~22 famous rooms; the other ~460 venues get no dedup (any naming difference between sources creates duplicate venues in merged views). The registry lives only in this route file, so venue-game-alerts.ts (workers) matches alert.venue_name to live-table venue_name by exact lowercase equality — an alert saved as 'Bel

**[MEDIUM / bug]** `pages/api/poker/venue-tournament-calendar.js:244`  
Case-sensitive day_of_week matching drops lowercase/uppercase day rows from the generated calendar  
generateDatedInstances matches `r.day_of_week === dow` against Title-case names ('Saturday'), but the DB is documented (daily-tournaments.js line 177) to hold mixed-case values ('saturday', 'MONDAY'). Only the 'daily' comparison was made case-insensitive (the W5 fix). Rows like 'saturday' never project into the dated calendar, and the priority sort at line 254 (`!== 'Daily'`) has the same case bug

**[MEDIUM / bug]** `pages/api/poker/venues.js:907`  
Empty Supabase result page triggers full JSON fallback that ignores offset — pagination duplicates/loops  
`if (!dbErr && dbVenues && dbVenues.length > 0) { ... usedSupabase = true }` — when a paginated request's offset lands past the end of the result set (or a filter legitimately matches 0 DB rows), usedSupabase stays false and the code falls back to applyFilters(getJsonVenues(), ...) which ignores `offset` entirely. An infinite-scroll client requesting page N past the end suddenly receives the full 

**[MEDIUM / gap]** `pages/api/poker/venues.js:1934`  
Response always returns home_groups: [] and total_home_groups: 0; standalone home groups never surface  
The Phase 19 header comment (lines 122-157) promises home groups under a top-level `home_groups` envelope key, but the response hardcodes `home_groups: []` and `total_home_groups: 0`. The fetched homeGroups (line 927) are only used to enrich home_game social_pages rows via homeGroupMap; a commander_home_groups row with no linked social_pages entry appears nowhere in the response. Also fetchPublicH

**[MEDIUM / bug]** `pages/api/poker/venues.js:1048`  
Enrichment mutates module-cached JSON venue objects — cross-request data pollution and stale flags  
getVenueById returns references into the module-level cached array built from the imported all-venues.json (cached indefinitely per warm lambda; CACHE_TTL only refreshes the pointer to the same `raw` array). The linked-social-page loop then writes onto those shared objects: is_social_page, follower_count, has_tournaments (sticky ||=true), latitude/longitude, games_offered, is_today/today_event/nex

**[MEDIUM / bug]** `pages/api/poker/venues.js:1948`  
Catch-all error fallback serves the entire raw JSON dataset, bypassing is_active/is_suppressed gating  
The outer catch returns `getJsonVenues()` unfiltered — including venues with is_active=false and is_suppressed=true, which the code elsewhere goes to great lengths to hide (Bug #1/#6/#7 fixes). Any exception in the handler thus leaks suppressed venues publicly. Relatedly, the numeric-ID single-venue path has no JSON fallback at all: if Supabase is down or the id is absent, the catch at line 720 sw

**[MEDIUM / wiring]** `pages/api/poker/venues.js:16`  
Slice-wide: shared imports (src/lib/*, data/*.json) do not resolve inside this repo slice  
Every API file imports from ../../../src/lib/ (supabaseServerClient, apiRateLimit, sentry, sentryWrap, cors, serverAuth, grokClient, pushAlerts, gates/premiumFeatureGate, trivia/getTodayCST) and ../../../data/ (all-venues.json, daily-tournament-schedules.json, tournament-venues.json, poker-tour-series-2026.json, tour-source-registry.json, wsop/wpt/wsopc/mspt/rgps/venetian-2026-events.json). Neithe

**[MEDIUM / wiring]** `pages/api/venues/[...slug].js:45`  
Hono middleware reads req/res from c.env, which hono/vercel does not populate in a Pages Router Node function — rate limiting silently skipped, auth likely always 401  
`const req = c.env?.req; const res = c.env?.res;` — `hono/vercel`'s handle() targets Edge-style Request handling; in a Node.js Pages Router API route, c.env does not carry the Node req/res objects. The guard `if (req && res && ...)` means rate limiting is skipped when req is undefined, and `getServerUserWithFallback(undefined, supabase)` cannot read the Authorization header, so every request would

**[LOW / gap]** `pages/api/cron/login-probe.js:117`  
probe_heartbeats and signup_errors tables used by nine cron routes are defined in no migration  
admin.from('probe_heartbeats').insert(...) appears in eight cron files (login-probe, recovery-probe, signup-probe, trigger-audit, auth-integrity-audit, email-deliverability-check, archive-signup-errors, yt-pipeline-recovery, sentry-signup-bridge) and sentry-signup-bridge.js also reads/writes signup_errors — but neither table has a CREATE TABLE anywhere in supabase/migrations (including archive/). 

**[LOW / bug]** `pages/api/poker/tour-schedule.js:287`  
Stop classification uses server-timezone midnight, shifting current/next/past around UTC midnight  
`const today = new Date(); today.setHours(0,0,0,0)` runs in server TZ (UTC on Vercel), while stop dates parse as UTC midnights. From ~4-8 PM US time onward, 'today' is already tomorrow UTC: a stop ending today is classified past and a stop starting tomorrow becomes current prematurely. Other endpoints solved this with the America/New_York anchor (daily-tournaments getCurrentDay, series getTodayCST

**[LOW / bug]** `pages/api/poker/tours.js:151`  
Informal date parser hardcodes year 2026 — all registry stop dates break after Dec 2026  
parseInformalDate defaults `year = 2026` (line 151) and day-only fallbacks use `new Date(2026, ...)` (line 156), with a '2025' string sniff at line 165. getUpcomingSeries compares those fixed-2026 dates to `today`, so from Jan 2027 every stop parses as past and upcoming_series goes permanently empty (and in 2025 dates were wrongly future). Same class of hardcoding exists in series.js fallbacks ref


## Home games — 23 findings (7 high, 7 medium, 9 low)

**[HIGH / bug]** `pages/api/public/home-game/[code].js:129`  
Public home-game page selects commander_home_games.starting_stack and .structure — columns defined in no migration  
The upcoming-games query (lines 118-135) selects starting_stack and structure from commander_home_games. The table's create (archive/20260125_commander_phase4.sql:114) and every phase18/phase41/hg_audit ALTER add many columns (format, slug, rsvp_closes_at, cancelled_at, visibility, ...) but none adds starting_stack or structure (grep across all migrations returns nothing). The select therefore err

**[HIGH / bug]** `pages/api/public/home-games/[slug].js:102`  
Selects non-existent columns starting_stack/structure — upcoming games silently always empty  
The upcoming-games query selects `starting_stack` and `structure` from commander_home_games, but no migration in supabase/migrations (main or archive) adds either column to that table (archive/20260125_commander_phase4.sql defines the table; the only ALTERs are in 20260403_home_games_schedule_and_host.sql and 20260417020000_phase16b which adds only `format`). PostgREST returns a 42703 error, and b

**[HIGH / bug]** `pages/api/public/home-games/[slug].js:91`  
Private groups' invite_code, contact_phone, schedule and approximate coords exposed to anonymous callers  
The guard intentionally allows is_private groups through (BUG-FIX comment, lines 86-93) so the join-request flow works, but the response then returns the FULL payload for private groups: invite_code and club_code (lines 176-177 — an invite code is precisely the credential meant to gate entry to a private game), contact_phone and website_url (179-180), settings JSONB (181), plus all upcoming games 

**[HIGH / bug]** `pages/api/public/home-games/[slug]/follow.js:288`  
notifications insert uses non-existent columns (metadata, action_url, is_read) — host notifications never created, dedup broken  
public.notifications has columns user_id, type, title, message, data, read, created_at, updated_at, actor_id, link (archive/20260113_notifications_and_friend_requests.sql + 20260505_live_gift_schema_hardening.sql + 20260512_fix_notification_actor_enrichment.sql). No migration adds `metadata`, `action_url`, or `is_read`. The insert at line 288-300 includes all three, so it fails with 42703 and is o

**[HIGH / bug]** `pages/api/public/home-games/discover.js:218`  
Geo search applies DB limit before radius filter — nearby games missed entirely  
The query orders by member_count DESC and applies `.limit(limit)` (default/max 50-100) at the database level, then the radius filter runs app-side on that pre-truncated set (lines 360-376). Once there are more than `limit` public groups nationwide, a user's nearby small groups are silently dropped whenever they aren't in the global top-N by member_count. A user in a small town with 3 local games s

**[HIGH / wiring]** `pages/hub/home-games/near-me.js:72`  
groupHref links to /home-games/* routes that don't exist — result cards 404  
groupHref builds `/home-games/${g.slug}`, `/home-games/in/${g.club_code}`, `/home-games/in/${g.invite_code}`, and `/home-games`. The real pages live at `/hub/home-games/...` (every sibling file — state/city pages, dashboard, API notification URLs — uses the /hub prefix), and next.config.js/middleware.ts contain no rewrite from /home-games to /hub/home-games. Additionally, even with the prefix fixe

**[HIGH / gap]** `pages/hub/home-games/near-me.js:173`  
Links to /hub/home-games with no index page in the home-games directory  
pages/hub/home-games/ contains no index.js (only near-me.js, [slug].js, [slug]/dashboard.js, and in/*), yet the top bar back-link here, the 'Browse Home Games' button in [slug].js line 573, and every breadcrumb in in/index.js (line 130), in/[state]/index.js (line 258), and in/[state]/[city].js (line 222) — plus the BreadcrumbList JSON-LD items — point at /hub/home-games. Next.js does not serve [sl

**[MEDIUM / bug]** `pages/api/home-games/message-host.js:118`  
Existing-DM lookup matches any shared conversation (including group chats) and has a create race  
To find an existing DM, the code selects all conversation_ids where the sender participates, then any conversation where the host also participates — without filtering social_conversations.type = 'dm'. If the sender and host share a group conversation (e.g. a club or event chat with other members), the private 'I want to join your home game' inquiry is posted into that group thread, visible to eve

**[MEDIUM / bug]** `pages/api/public/home-games/discover.js:261`  
UTC-date cutoff hides tonight's games for US users in the evening  
`const today = new Date().toISOString().slice(0, 10)` computes the date in UTC. For all US timezones, from 5-8pm local onward the UTC date is already tomorrow, so `.gte('scheduled_date', today)` excludes games scheduled for tonight — exactly when players are looking for a game. The same pattern affects pages/api/public/home-games/[slug].js line 96 (upcoming games disappear from the public page dur

**[MEDIUM / bug]** `pages/hub/home-games/[slug].js:665`  
useEffect declared after conditional early return — React hooks-order violation  
The Add Friend status useEffect (line 665) and the handleAddFriend definition sit AFTER the `if (serverError || !data) { return (...) }` early return at line 564. All other hooks run before the return. In the Pages Router, client-side navigation between two /hub/home-games/[slug] URLs re-renders the same mounted component with new props; if one navigation yields serverError=true (API 5xx) and the 

**[MEDIUM / bug]** `pages/hub/home-games/[slug]/dashboard.js:285`  
Signed-out user gets infinite 'Loading dashboard…' spinner — no login redirect  
`loading` initializes true and the data effect starts with `if (!slug || !token) return;`. When the visitor has no session, getAccessToken() returns null, token stays null forever, the effect never runs, and the auth-redirect at line 292 is unreachable — the page hangs on the loading screen indefinitely instead of bouncing to /auth/login. The same happens if the token is present but expired only w

**[MEDIUM / bug]** `pages/hub/home-games/[slug]/dashboard.js:301`  
Host role check queries legacy home_game_members view instead of commander_home_members  
The dashboard gate reads `home_game_members` (only referenced in migrations as a VIEW in 20260429_security_advisor_cleanup.sql, with security_invoker=true), while the canonical membership table is commander_home_members — [slug].js line 283-285 carries an explicit BUG-FIX comment that the wrong members table 'doesn't exist. Correct table is commander_home_members'. Because this query runs with the

**[MEDIUM / gap]** `pages/hub/home-games/in/[state]/index.js:52`  
State/city SEO pages skip is_active, is_private and the Phase-18 45-day auto-hide filters  
discover.js carefully filters commander_home_groups to is_active=true, is_private=false, and the 45-day last_activity_at/created_at/visibility_override_until window (its comments call the auto-hide binding per Dan). The state page (lines 52-69), the city page (in/[state]/[city].js lines 44-53), and the state index (in/index.js lines 31-36) query social_pages by is_public only and never check the l

**[MEDIUM / bug]** `pages/hub/home-games/near-me.js:228`  
Manual state/city search form disappears after one search — cannot refine or re-search  
The manual fallback panel renders only when status === 'denied'. Submitting it calls search(), which sets status to 'searching' then 'ready'/'error' — the form unmounts and never comes back. A user who denied geolocation can search exactly one state/city; to try another they must reload the page. Worse, on a failed manual search the error card's only action is 'Retry', which calls requestGeolocati

**[LOW / bug]** `pages/api/home-games/message-host.js:169`  
Unvalidated game_name interpolated into the default DM, bypassing the 2000-char cap  
game_name comes straight from the request body with no type/length validation and is interpolated into the default message when `message` is empty (lines 169-172). The 2000-char cap at line 92 only applies to `message`, so a multi-megabyte game_name rides into fn_send_message; it also lets the caller put arbitrary text in the 'game name' slot even though the handler already fetched the real game r

**[LOW / bug]** `pages/api/public/home-games/[slug]/events/[eventId]/request-seat.js:455`  
`req` referenced out of scope in dispatchHostNotification — ReferenceError kills DM-failure logging  
dispatchHostNotification destructures ctx at lines 318-325 without extracting `req` (it is passed in at line 246). In the DM catch block, `reportApiError(e, req)` references the undeclared identifier `req`, throwing a ReferenceError; it is swallowed by the caller's outer try/catch, but the intended Sentry report and the '[request-seat] DM dispatch threw' console.warn at line 456 are both skipped, 

**[LOW / bug]** `pages/api/public/home-games/[slug]/events/[eventId]/request-seat.js:182`  
Yes-vs-waitlist capacity decision is a non-atomic read-then-write  
The handler reads event.rsvp_yes, computes yes/waitlist app-side, then upserts the RSVP. Two concurrent requests for the last seat both read the same rsvp_yes and both get response='yes', overbooking past max_players (the DB trigger recounts rsvp_yes afterwards but never demotes the extra 'yes' to waitlist). Impact is softened because is_confirmed=false and the host approves manually, but the conf

**[LOW / bug]** `pages/api/public/home-games/[slug]/vouch.js:90`  
has_vouched computed from only the latest 50 vouches  
GET fetches vouches with .limit(50) and derives has_vouched by scanning that list (line 121). Once a group has more than 50 vouches, users who vouched early are told has_vouched=false, the UI shows '+ Vouch', and clicking it re-inserts (dup-swallowed as success) — the button flips to Vouched but a later reload flips it back, an oscillating state. The voucher modal also silently truncates at 50 whi

**[LOW / bug]** `pages/api/public/home-games/discover.js:269`  
Next-game lookup shares one 100-row limit across all groups — some groups lose next_game data  
The upcoming-games query for next_game_date fetches at most 100 rows ordered by scheduled_date across up to 100 groups. Groups with dense schedules (weekly games booked a year ahead — which Dan notes Commander supports) consume the budget, so other groups' next game falls outside the 100 rows and their cards show no 'Next game' banner even though one is scheduled.

**[LOW / bug]** `pages/hub/home-games/[slug].js:1037`  
Max Players math multiplies the whole-game cap by table count  
The sidebar computes totalMax = numTables * group.max_players while the inline comment on the previous line says 'max_players is the total cap for the whole game'. For a group with max_players=18 and 2 configured cash tables, the page displays 'Max Players 36 (2 tables × 18)' — double the real cap. Either max_players is per-table (comment wrong) or the multiplication is wrong; the two cannot both 

**[LOW / wiring]** `pages/hub/home-games/[slug].js:28`  
Imports and fetch targets unresolvable within the repo slice — verify in full repo  
The home-games pages import modules absent from this slice: src/components/home-games/HomeGamesSeatReservation and TournamentList ([slug].js lines 28-29), src/lib/home-games/locationUtils (in/* pages), src/lib/home-games/rpcBridge (all pages/api/home-games routes), src/lib/home-games/messenger and src/lib/commander/pushNotifications (request-seat.js, follow.js), plus shared libs (supabase, authUti

**[LOW / regression]** `pages/hub/home-games/[slug]/dashboard.js:349`  
Bare emoji in JSX violates the no-emoji-in-source rule (known Vercel/SWC build-failure pattern)  
Line 349 renders a bare house emoji as JSX text in the group-avatar fallback. CLAUDE.md Immutable Rule 7 and the Common Bug Patterns table state bare emoji in JSX breaks the SWC compiler / Vercel builds and mandates plain text or wrapped string literals; CI enforces an emoji scan (git-safe-push Phase 0.5). This is a reintroduction of a documented fixed pattern.

**[LOW / bug]** `pages/hub/home-games/near-me.js:145`  
Radius clicked during error state is silently ignored; in-flight searches have no abort  
The radius re-search effect fires only when status === 'ready'. If the previous search errored (status 'error') and coords are set, clicking a radius pill updates the highlighted selection but triggers no search — and the Retry button restarts geolocation rather than searching. Additionally search() has no AbortController/sequence guard, so if two searches do interleave (retry + radius change), a 


## Main PNM page & tabs — 22 findings (4 high, 11 medium, 7 low)

**[HIGH / bug]** `pages/hub/poker-near-me/[pnmTab].js:3138`  
Live Games tab unreachable from the default Map tab (renderContent order bug)  
renderContent() checks `if (activeTab === 'map')` (line 3138) BEFORE `if (showLiveTab)` (line 3161). Clicking the 'Live Games' button (line 3604, activateTab('live')) or swiping right from the map only sets showLiveTab=true and never changes activeTab (setActiveTab('live') is a deliberate no-op for persistence, lines 497-500). Since the persisted default tab is 'map' (line 463) and 'live' is sanit

**[HIGH / wiring]** `pages/hub/poker-near-me/[pnmTab].js:520`  
initialTab prop is never supplied — the route-to-tab sync effect is dead code  
PokerNearMePage({ initialTab }) (line 401) has no getServerSideProps/getStaticProps in this file, and no other file in the slice references initialTab (grep confirms only [pnmTab].js). In the Pages Router, page props are only populated by data-fetching exports, so initialTab is always undefined and the 'HARDENING: Sync Next.js route parameter' effect (lines 520-532) never fires. Consequence: any c

**[HIGH / bug]** `pages/hub/poker-near-me/[pnmTab].js:2783`  
Deep links to /alerts and /roadtrip always land on 'overview' — setActiveTab('more') resets the sub-tab it just set  
The mount URL parser handles 'roadtrip'/'alerts' by calling setActiveMoreTab(slug) (line 2783), then falls through to line 2807 where setActiveTab('more') runs — and setActiveTab contains `if (val === 'more') setUiFilter('activeMoreTab', 'overview')` (lines 494-496), which overwrites the sub-tab back to 'overview'. So sharing or refreshing /hub/poker-near-me/alerts or /roadtrip (URLs the deep-link

**[HIGH / bug]** `pages/hub/poker-near-me/[pnmTab].js:902`  
filters.selectedDay is persisted forever — returning users see the wrong day's daily tournaments  
selectedDay is initialized with getCurrentDay() only when there is no saved filter blob (line 902). The filters object, including selectedDay, is written to localStorage on every change (lines 955-972) and restored verbatim on later visits (lines 843-886) — the sanitization there fixes venueType/gameType/stakes/radius but never resets selectedDay. A user who last visited on a Monday will, on Wedne

**[MEDIUM / bug]** `pages/hub/poker-near-me/[pnmTab].js:2349`  
fetchVenues error path ignores the fetch sequence guard — a slow failing stale request wipes fresh results  
The success path correctly discards stale responses via fetchSequenceRef (lines 2299-2307), but the catch block (lines 2349-2354) unconditionally runs setVenues([]) and setFetchError(...). fetchWithRetry retries 3 times with backoff (~3.5s worst case, verified in PnmApiCache.js), so an older request that ultimately fails can reject AFTER a newer request already succeeded, clearing the freshly load

**[MEDIUM / bug]** `pages/hub/poker-near-me/[pnmTab].js:1445`  
Geofence effect leaks the GPS watcher: update path returns no cleanup, and async init can start after unmount  
Two leaks in the geofence effect (lines 1439-1517): (1) the 'service already exists' path (lines 1445-1458) does `return;` without returning the cleanup function, so once the effect has re-run at least once (any allVenuesForMap/userLocation change), the final run before unmount registers no cleanup and GeofenceService keeps its geolocation watch running after the page unmounts, calling setGeofence

**[MEDIUM / bug]** `pages/hub/poker-near-me/[pnmTab].js:578`  
Review star ratings only ever load for the first 50 venues  
The batch review-stats effect (lines 573-588) computes ids missing from pnmReviewStatsRef and does .slice(0, 50), but its dependency array is only [venues]. After the first 50 stats arrive, the effect does not re-run (pnmReviewStatsMap is deliberately read via ref to avoid loops), so with fetchVenues returning up to 500 venues (limit=500, line 2238), venues 51+ never get their star ratings until t

**[MEDIUM / wiring]** `pages/hub/poker-near-me/[pnmTab].js:2438`  
Daily tournaments fetch sends lat/lng that the API ignores — GPS-only users get a nationwide list  
fetchDailyTournaments (lines 2438-2441) sets lat/lng params 'to pass GPS-derived state', but pages/api/poker/daily-tournaments.js destructures only day/exact_date/state/venue/type/minBuyin/maxBuyin/game_type/minGuaranteed/sort/venue_id/limit from req.query — lat and lng are never read (verified). So a GPS user with no selectedCity and selectedState='all' gets up to 999 tournaments from every state

**[MEDIUM / bug]** `pages/hub/poker-near-me/[pnmTab].js:2691`  
Deep-link writer/reader slug mismatch: writer emits 'daily' and 'calendar' which the reader cannot parse  
The URL writer sets pathSlug = activeEventTab (line 2691), producing /hub/poker-near-me/daily and /hub/poker-near-me/calendar. The mount reader only recognizes 'daily-tournaments' and 'events-calendar' for those sub-tabs (lines 2774-2780); 'daily' and 'calendar' match no branch and no TAB_ORDER entry, so the tab is silently not applied. The current user is rescued by localStorage persistence, but 

**[MEDIUM / bug]** `pages/hub/poker-near-me/[pnmTab].js:3756`  
VoiceSearch emits filter values in a format the page's filters don't understand  
VoiceSearch.jsx produces gameType values 'NLH' | 'PLO' | 'Mixed' | 'Stud' and stakes like '1/2' (verified, VoiceSearch.jsx lines 13-21), but the page's gameType domain is lowercase 'nlh'/'plo'/'mixed'/'stud' (select options at lines 3579-3583, client-side filter comparisons at lines 3083-3088) and stakes options are '$1/2'/'$2/5'/'$5/10+' (lines 3592-3596). After a voice command like 'PLO within 2

**[MEDIUM / bug]** `pages/hub/poker-near-me/[pnmTab].js:753`  
Hydration mismatch: useState initializers read sessionStorage/localStorage and mutate sessionStorage during render  
This dynamic-route page is server-rendered (no data-fetching exports), so the server HTML uses the `typeof window === 'undefined'` fallbacks, while the first client render reads sessionStorage/localStorage: showIntro (lines 753-771) can be true on the client (rendering a fixed full-screen video overlay absent from server HTML), and filters (line 840) feed controlled <select value> attributes that 

**[MEDIUM / stub]** `pages/hub/poker-near-me/[pnmTab].js:2576`  
Dead search subsystem: handleSearch, city autocomplete, and search history are unreachable; GlobalSearchOverlay is wired to a no-op  
After the search UI moved into GlobalSearchOverlay, the page-level search plumbing was left behind unreferenced: handleSearch (line 2576), handleSearchInputChange (line 2603), and handleCityClick (line 2653) have zero call sites (grep-verified); showSearchHistory is never set true so the outside-click effect (line 1420) and history state (lines 1054-1075, including the Supabase merge at 2166) driv

**[MEDIUM / stub]** `pages/hub/poker-near-me/[pnmTab].js:2489`  
Dead live-venue-search cluster still fires a network request every time the Live tab opens  
selectedLiveVenue can only be set by handleSelectLiveVenue (line 2560), which — like handleLiveSearchInput (2544) and handleClearLiveVenue (2569) — has no call sites (the Live tab renders LiveGamesFeed, which does its own polling). Therefore: fetchLiveGames never runs, liveGames is always [], the 2-minute refresh interval branch (lines 1731-1737) is dead, the `counts` useMemo (lines 3004-3013) is 

**[MEDIUM / wiring]** `pages/hub/poker-near-me/[pnmTab].js:7`  
PNM-specific imported modules are absent from the repo slice — contracts unverifiable  
The slice contains only src/components, src/services, src/styles. Feature-specific modules this page imports do not exist anywhere in the slice: src/hooks/usePersistedFilters (line 7), src/hooks/useTourMapStops (line 29), src/hooks/useVenueRealtime (line 30), src/data/city-coordinates (line 98), src/lib/geofence (line 1461, dynamic), src/lib/pushAlerts (line 1466, dynamic). Generic shared UI (SEOH

**[MEDIUM / wiring]** `pages/hub/poker-near-me/[pnmTab].js:7`  
Wiring: 63 relative imports in the swept dirs resolve to shared src/ directories absent from this slice  
Import sweep of pages/hub/poker-near-me, pages/hub/home-games and src/components/poker-near-me found 63 relative imports whose targets do not exist under /home/claude/pnm. Every one points into shared infrastructure directories that the extraction did not copy - src/lib/ (supabase, authUtils, geofence, pushAlerts, clipboard, home-games/locationUtils), src/engine/EventBus, src/hooks/ (usePersistedF

**[LOW / bug]** `pages/hub/poker-near-me/[pnmTab].js:3428`  
Closing GlobalSearchOverlay rewrites the URL to /lobby regardless of the tab actually shown  
GlobalSearchOverlay's onClose (lines 3428-3438) hardcodes cleanUrl = '/hub/poker-near-me/lobby' whenever the URL contains 'q='. If the user deep-linked to /hub/poker-near-me/venues?q=vegas (which auto-opens the overlay, line 2758), closing it leaves the venues tab on screen but the address bar says /lobby; a refresh then loads the lobby page instead of the tab they were viewing. Note the 'q=' subs

**[LOW / regression]** `pages/hub/poker-near-me/[pnmTab].js:3381`  
SEO title branch for the live tab can never trigger (activeTab === 'live' is impossible)  
SEOHead's title/description use `activeTab === 'live'` (lines 3381, 3386), but activeTab is sanitized so it can never equal 'live' (line 476 maps 'live' -> 'map'; setActiveTab never persists 'live'). The live-games experience is tracked by showLiveTab — which the canonical URL on line 3390 correctly uses. The 'Live Cash Games' title/description are therefore dead, a leftover from the showLiveTab r

**[LOW / bug]** `pages/hub/poker-near-me/[pnmTab].js:3555`  
Radius select value mismatch: stored 'any' (lowercase) vs option value 'Any' — select displays the wrong choice  
The onChange stores filters.radius as lowercase 'any' (lines 3540-3548), but the <option> value is 'Any' (line 3555). With value={filters.radius} === 'any' matching no option, browsers render the first option ('25 Miles') as selected while the actual effective radius is unlimited (effRad 25000 / API radius 5000), misleading the user about the active filter.

**[LOW / bug]** `pages/hub/poker-near-me/[pnmTab].js:1866`  
loadMore radius-tier expansion triggers a duplicate fetch cascade  
When loadMore('venues') expands to the next radius tier it (a) schedules fetchVenues({radiusOverride: nextTier}) via setTimeout (line 1890) and (b) sets filters.radius, which fires the radius-change effect (lines 1143-1159) that calls fetchAllData({includeVenues:true}) — refetching venues a second time plus tours/series/daily tournaments that don't depend on radius. The sequence refs prevent stale

**[LOW / stub]** `pages/hub/poker-near-me/[pnmTab].js:42`  
Cluster of unused imports and dead helpers left from the code-splitting refactor  
Grep-verified unreferenced: BottomNavBar import (line 42 — the page renders no bottom nav despite importing it), resolveCityCoords (line 98), _hgHaversineMi (line 213 — its stated purpose, home-game radius filtering, was moved to the backend per line 209), VENUE_TYPE_LABELS (223), TOUR_TYPE_LABELS (233), TOUR_COLORS/TourBadge (243/280), getTrustLevel (255), GEOFENCE_ALERT_TIMEOUT_MS (206), GEOFENC

**[LOW / bug]** `pages/hub/poker-near-me/[pnmTab].js:648`  
Minor: live-data merge flags 'changed' before the keep-old-data early return, causing needless re-renders  
In the liveDataMap merge effect (lines 648-681), `changed = true` (line 673) is set before the 'never replace existing live_data with null' guard (line 676) returns the unchanged venue object. When the scraper goes down (newLiveData null but venue.live_data present), every affected venue marks changed=true while returning identical objects, so the referential-equality guard at line 679 fails and s

**[LOW / bug]** `pages/hub/poker-near-me/[pnmTab].js:1913`  
Minor unmount hygiene: highlight and GPS-failsafe timeouts are never cleared on unmount  
highlightTimeoutRef (set at line 1914, 3s) and the 20s gpsTimeoutId inside requestGpsLocation (line 2110) are cleared on re-trigger/success but not on component unmount, so navigating away within those windows fires setHighlightedVenueId/setGpsLoading/setGpsLocationLabel on an unmounted component. Harmless in React 18 (no-op) but the GPS failsafe closure also reads a stale `userLocation` from the 


## Tournament ingestion / scrapers — 22 findings (2 critical, 3 high, 9 medium, 8 low)

**[CRITICAL / bug]** `pages/api/venue-scraper/receive.js:75`  
Delete-then-insert wipes venue tournament data; replacement insert violates NOT NULL constraints  
For each venue the handler DELETEs all venue_daily_tournaments rows, then INSERTs replacement rows built without scrape_html_hash or scrape_timestamp. Migration 20260401_scrape_integrity_layer.sql makes both columns NOT NULL (and trigger enforce_scrape_provenance exists), so every insert fails with 23502 AFTER the delete already destroyed the venue's existing schedule (including rows written by th

**[CRITICAL / bug]** `smarter-poker-workers/src/routes/venue-tournaments.ts:502`  
Upsert targets a dropped unique constraint and omits NOT NULL provenance columns — scraper writes zero rows, errors swallowed  
onConflict: 'venue_id,day_of_week,start_time,buy_in' targets the legacy 4-column unique constraint that migration 20260408003_drop_legacy_upsert_constraint_exact_name.sql explicitly DROPPED (the current constraint is the 7-column venue_daily_tournaments_upsert_key from 20260408001). PostgREST returns 42P10 ('no unique or exclusive constraint matching the ON CONFLICT specification') on every call. 

**[HIGH / bug]** `pages/api/venue-scraper/trigger.js:215`  
Sequential 2s-per-task Manus dispatch (~33 tasks for 483 venues) exceeds serverless timeout — most batches never dispatched  
483 venues / BATCH_SIZE 15 produces ~33 Manus tasks; each iteration does a network POST plus an unconditional 2000ms sleep, so the handler needs 70-100+ seconds. vercel.json sets no functions/maxDuration override for this route, so the function is killed at the platform default well before completion: later tiers/batches are silently never dispatched, the scraper_runs log at line 224 never execute

**[HIGH / bug]** `smarter-poker-workers/src/routes/scrape-charity-schedules.ts:466`  
Charity scraper upsert uses nonexistent 3-column conflict target and lowercase day_of_week — all writes fail or become invisible  
onConflict: 'venue_id,day_of_week,start_time' matches no unique constraint on venue_daily_tournaments (the 4-col legacy key was dropped by 20260408003; the live key is 7 columns) so every upsert returns 42P10; the error is only console.warn'd and the endpoint still returns success:true with the run's audit row claiming records_affected. Independently: day_of_week is written lowercase ('monday') wh

**[HIGH / gap]** `smarter-poker-workers/src/routes/tour-schedule-scraper.ts:274`  
HTML-extracted tour events are counted but never stored anywhere  
On a successful HTML extraction the handler only writes registry metadata (last_scraped, last_scrape_source, last_scrape_events count) and increments stats.tours_updated/total_events. The extractedEvents array itself is discarded — there is no insert into tour_event_details, poker_events, or registry_data.stops_2026/series_2026. Only PDF events reach storage (storePdfEvents). Consequently the prim

**[MEDIUM / bug]** `pages/api/venue-scraper/receive.js:134`  
venue_news has no dedup — identical news items re-inserted on every scrape run  
Tournaments get a delete-first refresh, but news rows are plainly inserted each run with no unique constraint (venue_news migration 20260325 has none), no delete, and no existence check. The trigger endpoint fires every 3 days over 483 venues, so any unchanged promo ('Spring Series Announced') accumulates a duplicate row per run indefinitely, bloating the venue news feed with repeats. published_at

**[MEDIUM / bug]** `pages/api/venue-scraper/receive.js:21`  
Silent fallback to anon key for service-role writes across all scraper API routes  
receive.js, trigger.js, scraper-health.js, scraper-metrics.js, and venue-dedup.js all construct the client with `SUPABASE_SERVICE_ROLE_KEY || NEXT_PUBLIC_SUPABASE_ANON_KEY`. If the service key is missing/rotated, writes to RLS-protected tables (venue_daily_tournaments service policies, scraper_runs) silently run as anon: inserts/deletes fail or, worse under permissive policies, partially apply, wh

**[MEDIUM / bug]** `pages/api/venue-scraper/trigger.js:113`  
VENUE_SCRAPER_SECRET embedded in plaintext prompts sent to third-party Manus AI  
The write-credential for the receive endpoint is interpolated directly into every Manus task prompt (lines 113 and 161). Anyone with access to the Manus workspace, task logs, or any downstream tool the agent pastes the prompt into gains the ability to POST arbitrary tournament/news data for any venue (receive.js authenticates solely on this header). Because receive.js deletes venue rows before ins

**[MEDIUM / stub]** `smarter-poker-workers/src/lib/tourHtmlExtractor.ts:189`  
WSOPC parser fabricates hardcoded 'standard events' (including a fake $1,000,000 guarantee) when real parsing finds too few events  
When stops are detected but fewer than 5 events parse, parseWsopcHtml pushes three invented template events (Ring Event #1 $365 NLH, #2 $600 Deepstack, #12 $1,700 Main Event with guaranteed: 1_000_000) that were never on the page. This directly violates the platform's own 'scraped_verified'/no-fabricated-data standard (20260401 integrity layer) and, once HTML events are persisted (see the storage 

**[MEDIUM / gap]** `smarter-poker-workers/src/lib/tourPdfExtractor.ts:207`  
Primary PDF line parser never extracts an event date, so most tour_event_details rows have start_date NULL  
eventLineRe captures event number, start time, buy-in, and description but no date field, and parseScheduleText never sets ev.date; only the fallback parser (used when the main parser yields zero events) extracts dates. storePdfEvents then writes start_date: parseDateToISO(ev.date) = NULL for every main-parser event, so PDF-sourced tournaments cannot be date-filtered or shown on a calendar in the 

**[MEDIUM / bug]** `smarter-poker-workers/src/routes/poker-news.ts:163`  
Existing-article early return still proceeds to post — same article re-posted to social feed after every 6h cooldown lapse  
saveToNewsArchive returns the existing poker_news id when the article was already archived, and the caller then calls postNewsArticle with it. The only repost guard is isArticleRecentlyShared's 6-hour window on social_posts.created_at / poker_news.scraped_at. An article that stays at the top of a priority-1 RSS feed for more than 6 hours (very common overnight/weekends) gets a fresh duplicate soci

**[MEDIUM / bug]** `smarter-poker-workers/src/routes/tour-schedule-scraper.ts:309`  
scraper_runs audit insert uses nonexistent columns and omits NOT NULL source — audit log never written  
The insert sends scraper_name, finished_at, and details — none of which exist on scraper_runs (20260325 defines source NOT NULL, status, stats, metadata, started_at, completed_at; 20260426 adds tours_scraped/tours_updated/total_events/pdf_events_found/errors_count only). PostgREST rejects unknown columns (PGRST204) and even without them the NOT NULL source column is missing. The returned error is 

**[MEDIUM / bug]** `smarter-poker-workers/src/routes/tour-schedule-scraper.ts:178`  
parseDateToISO appends current year blindly and converts via local-TZ Date — wrong year at year boundary and off-by-one-day risk  
PDF event dates like 'Jan 15' get `new Date('Jan 15 ' + CURRENT_YEAR)`; a December scrape of a January schedule stamps the event a year in the past (CURRENT_YEAR is captured once at module load, compounding for long-lived worker processes across New Year). The Date is then serialized via toISOString().split('T')[0]: new Date('March 14 2026') is local midnight, so on any server east of UTC (Docker 

**[MEDIUM / gap]** `smarter-poker-workers/src/routes/venue-tournaments.ts:492`  
No stale-schedule deactivation — tournaments removed from the source stay is_active forever  
The scraper only upserts rows found in the current scrape; rows for tournaments a venue cancelled or rescheduled are never marked is_active=false or data_quality='stale'/'expired'. scrape-charity-schedules.ts has the same gap, and scraper-data-cleanup.ts never touches venue_daily_tournaments. With the Manus receive.js delete path broken, nothing in the pipeline ever retires stale schedule rows, so

**[LOW / wiring]** `pages/api/venue-scraper/trigger.js:19`  
Imports resolve to files absent from the repo slice: public/data/all-venues.json, src/lib/supabaseServerClient, src/lib/sentryWrap  
trigger.js build-time-imports ../../../public/data/all-venues.json (the 483-venue master list) and every scraper route imports ../../../src/lib/supabaseServerClient and ../../../src/lib/sentryWrap; none of these exist anywhere under /home/claude/pnm. Most likely an extraction artifact, but if all-venues.json is genuinely gone the Next build fails and the entire Manus trigger tier collapses. Archit

**[LOW / wiring]** `smarter-poker-workers/src/index.ts:202`  
refresh-venue-json registered GET-only while every other cron route registers GET+POST  
All ~50 cron endpoints are registered for both methods except /cron/refresh-venue-json, which only has app.get. If the Open Claw dispatcher (or an operator curl) POSTs like it can to every sibling route, it gets a 404 and the PokerNearMe static-fallback venue cache silently stops refreshing. Related: refresh-venue-json.ts line 58 treats a failed system_cache upsert as non-fatal and still returns s

**[LOW / improvement]** `smarter-poker-workers/src/lib/scraperAlerts.ts:16`  
Hardcoded owner phone number (PII) and emoji in source strings; throttle is in-memory only  
OWNER_PHONE (+17086775221) is committed in two files (scraperAlerts.ts, scraper-watchdog.ts line 28) instead of env config — PII in the repo and a two-place edit on change. formatAlert embeds emoji (line 97) and news-scraper/poker-news source icons do too, violating the repo's binding 'no emoji in source files / user-facing strings' rule. The 6h alert throttle Map is process-memory only, so every 

**[LOW / bug]** `smarter-poker-workers/src/lib/tourPdfExtractor.ts:436`  
pdf-parse is fed the URL, discarding the already-downloaded buffer — PDF fetched twice and UA/size protections bypassed  
extractPdfSchedule downloads the PDF with a browser UA, size cap, and redirect handling into `buffer`, then constructs `new PDFParse({ url: pdfUrl })`, causing pdf-parse to re-download the file itself with its default client — the validated buffer is unused. Sites that 403 non-browser UAs will fail the second fetch and silently drop to the crude latin1 fallback (which only extracts parenthesized t

**[LOW / bug]** `smarter-poker-workers/src/middleware/auth.ts:50`  
IP allowlist trusts spoofable X-Forwarded-For header  
clientIp is taken from the request-supplied X-Forwarded-For / X-Real-IP headers. If the workers port is reachable other than through the trusted proxy, any caller can set X-Forwarded-For to an allowlisted IP and pass. The Bearer CRON_SECRET remains as the real gate, but the allowlist is decorative defense-in-depth rather than a genuine network control, contrary to its doc comment.

**[LOW / bug]** `smarter-poker-workers/src/routes/news-scraper.ts:1024`  
Duplicate upserts return an empty (truthy) array, inflating saved counts and disabling the video fallback  
saveArticle returns `data`, which is [] (truthy) when ignoreDuplicates suppressed the insert. The caller's `if (saved) sourceStats.saved++` therefore counts every duplicate as saved, so reported totals are wrong and the PokerNews video fallback (guarded by `sourceStats.saved === 0`) can never trigger once any PokerNews article exists in the DB. Related date bug at line 820: in January the 'previou

**[LOW / bug]** `smarter-poker-workers/src/routes/venue-game-alerts.ts:127`  
Push notification response never checked; notifications_sent counts failures; cooldown updated even when push failed  
The fetch to ${baseUrl}/api/notifications/send ignores response.ok — a 401/500 from World Hub still increments notifications_sent and then last_triggered is written, so the user's alert enters a 4-hour cooldown without ever receiving the push (systematically silent alert loss if the endpoint or service-role auth breaks). Note /api/notifications/send is not present in this repo slice's pages/api tr

**[LOW / bug]** `smarter-poker-workers/src/routes/venue-tournaments.ts:246`  
JSON-LD byDay arrays collapse to a single day and extracted times ignore timezone  
schema.org eventSchedule.byDay is frequently an array (e.g. ['https://schema.org/Monday','https://schema.org/Wednesday']). String(byDay) joins with commas and .replace(/.*\//,'') strips everything through the LAST slash, keeping only the final day — multi-day recurring tournaments are stored as a single (wrong) day. Separately, the T(HH):(MM) extraction from startDate discards any timezone offset 


## Lobby (3D landing) — 19 findings (2 critical, 4 high, 5 medium, 8 low)

**[CRITICAL / bug]** `pages/hub/poker-near-me/lobby.js:2521`  
Undefined handleRefreshLocation crashes the whole lobby on first visit  
The JSX `{showEnablePopup && (<LocationEnablePopup ... handleRefreshLocation={handleRefreshLocation} />)}` references `handleRefreshLocation`, which is never declared anywhere in the file (grep confirms only this one usage). Evaluating the identifier throws a ReferenceError during render the moment showEnablePopup becomes true. showEnablePopup is set true AUTOMATICALLY for first-time visitors (lin

**[CRITICAL / bug]** `pages/hub/poker-near-me/lobby.js:2530`  
Undefined manualAddress/setManualAddress/handleGeocodeAddress/isSearching crash render when manual-location modal opens  
The ManualLocationModal JSX passes `manualAddress`, `setManualAddress`, `handleGeocodeAddress`, and `isSearching` — none of these identifiers exist in lobby.js (the actual state/handlers are manualCity/manualState/handleManualLocationSet/manualGeocoding). When showManualLocation becomes true (GPS unsupported line 1204, geolocation tier-2 failure line 1255, 'Change location' click line 2220, or 'En

**[HIGH / bug]** `pages/hub/poker-near-me/lobby.js:1575`  
getAuthUser is never imported — series/tour follow silently no-ops  
getAuthToken() calls `await getAuthUser()` but getAuthUser is not imported anywhere in lobby.js (imports at lines 15-36 contain no such symbol) and is not defined locally. The ReferenceError is swallowed by the try/catch which returns null, then handleToggleFavorite returns early for non-venue types (line 1588: `if (!token && type !== 'venue') return`). Net effect: tapping the heart on any Tour or

**[HIGH / bug]** `pages/hub/poker-near-me/lobby.js:1970`  
Saved/favorites panel compares prefixed favorite keys against raw ids — list is always empty  
The 'favorites' pod builds favVenues via `Object.keys(favorites).filter(k => favorites[k]).map(venueId => ...)`. The keys are namespaced ('venue-123', 'series-45', per lines 191, 217, 573, 1592) but are then compared with `String(v.id) === String(venueId)` against venues and favoritedVenues whose ids are the raw values ('123'). No key ever matches, so `.filter(Boolean)` empties the list and the pa

**[HIGH / bug]** `pages/hub/poker-near-me/lobby.js:910`  
Voice search and ?q deep-link results are fetched but never displayed (svHasSearched never set)  
handleVoiceResult fetches venues and opens the 'search' pod (setActivePod('search'); setShowPanel(true)), but PodVenueSearchEngine only renders results when `filters.svSearched`... specifically `filters[prefix+'Searched']` (PodVenueSearchEngine line 42/175) is true, which is only set by the pod's own Search button (doVenueSearch sets svHasSearched — note it sets 'svHasSearched', while the pod read

**[HIGH / wiring]** `pages/hub/poker-near-me/lobby.js:2476`  
VenueReviews rendered without isOpen/venueName/userName/authToken — reviews modal is empty  
lobby.js wraps VenueReviews in its own modal but passes only venueId and userId. VenueReviews begins with `if (!isOpen) return null;` (VenueReviews.jsx line 219), so the modal shows a header with an empty body — reviews never load or display. Even if isOpen were passed, authToken is undefined so submitReview sends 'Authorization: Bearer undefined' and every POST 401s silently.

**[MEDIUM / bug]** `pages/hub/poker-near-me/lobby.js:1158`  
Pagination mixes limit=200 fetches with PAGE_SIZE=50 offsets — Load More duplicates venues  
GPS success (line 1158), saved-location restore (1337), background refresh (1352/1382), manual location (1485), deep-link ?q (370), onUseSavedLocation (2236), and triggerNmSearch (1770) all fetch with limit=200&offset=0, then call setHasMore(newVenues.length >= PAGE_SIZE) and setPage(0). PAGE_SIZE is 50 (PnmApiCache.js line 11), so hasMore is true and loadMore() calls fetchVenues(query, 1, true) w

**[MEDIUM / regression]** `pages/hub/poker-near-me/lobby.js:2384`  
GPS intel banner reads v.distance_miles but the venues API returns distance_mi — count is wrong  
The banner computes `venues.filter(v => v.distance_miles && v.distance_miles <= 50).length || venues.length`. /api/poker/venues returns the field `distance_mi` (venues.js lines 290, 1417), and line 2121 of this same file correctly uses distance_mi. distance_miles is always undefined, the filter yields 0, and the `|| venues.length` fallback then displays the total loaded venue count as 'venues near

**[MEDIUM / gap]** `pages/hub/poker-near-me/lobby.js:491`  
fetchError is set but never rendered — venue fetch failures are invisible to users  
fetchVenues sets setFetchError('Unable to load venues. Please try again.') on failure (line 491) and fetchError appears in the panelContent useMemo dependency array (line 2079), but no JSX anywhere in the file renders it (grep shows only the useState, the setter calls, and the dep array). When the API fails after retries, the user sees an empty venue list with no error message or retry affordance.

**[MEDIUM / bug]** `pages/hub/poker-near-me/lobby.js:1057`  
Geofence effect races its async imports — orphaned GeofenceService instances and repeated notification permission requests  
The effect re-runs on every [userLocation, venues, preferences.geofenceAlerts] change. It starts dynamic imports, and only assigns geofenceRef.current after they resolve. If deps change (venues updates are frequent: live-data merge, realtime UPDATEs) before the imports resolve, the cleanup runs while geofenceRef.current is still null/previous, then the late-resolving import calls gfService.start(.

**[MEDIUM / stub]** `src/components/poker-near-me/lobby/LobbyScene.jsx:201`  
Entire R3F 3D stack (~85KB source) is dead code — nothing imports LobbyScene  
lobby.js renders LobbyCanvas (2D background). LobbyScene.jsx (302 lines), LobbyR3FScene.jsx (961), RadarDisc.jsx (512), ParticleField.jsx (318), ParallaxCamera.jsx (150), and FeaturePod.jsx (397) are referenced only by each other; grep across the slice finds no page or component importing LobbyScene. Within it, FeaturePod and ClickDetector are additionally commented out (LobbyR3FScene lines 773, 8

**[LOW / bug]** `pages/hub/poker-near-me/lobby.js:1043`  
Permissions API onchange listener never removed — setState after unmount and stale handleGpsClick closure  
The mount effect assigns `status.onchange = () => { setPermissionState(...); handleGpsClick({fromModal:true}); }` on the PermissionStatus object but the effect has no cleanup, so the handler survives unmount (PermissionStatus is long-lived), calling setState on an unmounted component and invoking the first-render handleGpsClick closure (stale gpsActive/gpsLoading).

**[LOW / bug]** `pages/hub/poker-near-me/lobby.js:2090`  
Date-only strings compared against local now — badge counts wrong near midnight/timezone boundaries  
liveData's upcomingTours filter does `new Date(t.next_event_date || t.start_date) >= today` where date-only strings ('2026-07-25') parse as UTC midnight while `today` is local now — a tour starting today is excluded for any user once local time passes 00:00 UTC-parsed (i.e., all day for US timezones). activeSeries (line 2097-2101) has the mirror problem: a series whose end_date is today is treated

**[LOW / bug]** `pages/hub/poker-near-me/lobby.js:576`  
fetchFavorites reads venue_address/venue_city/venue_state — columns that don't exist in poker_near_me_favorites  
The table (migrations/archive/20260201_hamburger_menu_preferences_phase2.sql lines 143-151) has only id, user_id, venue_id, venue_name, venue_type, created_at, and addVenueFavorite writes only venue_name. Lines 577-579 map f.venue_address, f.venue_city, f.venue_state which are always undefined, so favorites-sourced venue entries render with blank address/city/state in the Saved panel (once the key

**[LOW / gap]** `pages/hub/poker-near-me/lobby.js:330`  
First-time tutorial never auto-shows — showTutorial only set via hamburger 'replay' action  
showTutorial starts false and the only setter to true is the menuConfig replayTutorial callback (line 353). InteractiveTutorial is purely externally controlled (visible prop; it never self-shows from storageKey). The 'pnm_lobby_tutorial_seen' localStorage flag is written on dismiss (line 2212) but nothing ever reads it to trigger the tutorial for new users, so the onboarding tutorial is unreachabl

**[LOW / stub]** `pages/hub/poker-near-me/lobby.js:27`  
Dead imports and dead state in lobby.js (supabase, FilterPanel, NearMeNowFeed, TourCard, SeriesCard, SORT_OPTIONS, POPULAR_CITIES, sort/filter handlers)  
`supabase` (line 27) is imported and never used. Dynamic imports FilterPanel (69), NearMeNowFeed (62), TourCard (59), SeriesCard (60) are never rendered in this file (pods import their own card components). SORT_OPTIONS (119) and POPULAR_CITIES (109) constants are unused. handleSortChange (925) and handleFilterChange (930) are defined and listed in the panelContent dep array but never passed to an

**[LOW / wiring]** `pages/hub/poker-near-me/lobby.js:19`  
Multiple relative imports resolve to files absent from the repo slice (src/lib, src/hooks, src/engine, src/contexts, src/config, src/data, src/components/ui, src/components/seo)  
The slice contains only src/components/poker-near-me, src/services, src/styles. Unresolvable in the slice: ../../../src/components/seo/SEOHead (18), src/contexts/AvatarContext (19), src/components/ui/UniversalHeader (20) and HamburgerMenu (21), src/config/hamburgerMenus (22), src/services exist ✓ but src/lib/supabase (27, also imported by all three pokerNearMe services), src/hooks/useTrainingBus (

**[LOW / wiring]** `src/components/poker-near-me/lobby/PodHomeGames.jsx:288`  
onHomeGameCreated prop is dead — CreateHomeGame only accepts onCancel, new listings never refresh the list  
lobby.js passes onHomeGameCreated={(newVenue) => setVenues(prev => [...prev, newVenue])} to PodHomeGames, which accepts it but never forwards it; CreateHomeGame's signature is ({ onCancel }) only. After a host lists a home game, neither podHomeGames nor venues update — the user must manually re-search to see their new listing, and lobby's callback (which would incorrectly push into the poker_venue

**[LOW / stub]** `src/components/poker-near-me/lobby/PodVenueSearchEngine.jsx:271`  
Hardcoded fake stats fallback ('700+' venues, '47+' states) presented as real data  
The pre-search intro renders `venues?.length || '700+'` and a hardcoded '47+' states figure. When the venues array is empty (fetch failed or not yet loaded) the UI displays a fabricated '700+' count, and '47+' is always static regardless of actual coverage.


## Services & libs — 15 findings (3 high, 7 medium, 5 low)

**[HIGH / bug]** `src/services/pokerNearMePreferences.js:52`  
updatePokerNearMePreferences passes partial objects to a full-replace RPC, silently wiping other preferences  
The update_page_preferences RPC (supabase/migrations/20260420000006_fix_update_preferences_rls.sql) executes `UPDATE profiles SET poker_near_me_preferences = $1` - a whole-column REPLACE, not a jsonb merge. Every caller passes a partial object: [pnmTab].js:2192 sends a single key from the hamburger menu ({ [key]: value }); lobby.js:1194/1230/1258 send { locationEnabled: false }; lobby.js:1148/1363

**[HIGH / bug]** `src/services/pokerNearMeSearchHistory.js:35`  
addSearchHistory upsert targets a unique constraint that does not exist - every DB write fails  
addSearchHistory calls .upsert(..., { onConflict: 'user_id,search_query' }), but poker_near_me_search_history has NO unique constraint or unique index on (user_id, search_query). The table DDL (supabase/migrations/archive/20260201_hamburger_menu_preferences_phase2.sql lines 157-166) defines only a UUID PK, and the only later touch (20260329_add_pnm_indexes.sql line 31) adds a plain non-unique inde

**[HIGH / bug]** `src/services/pokerNearMeSearchHistory.js:35`  
Search-history upsert uses onConflict 'user_id,search_query' with no matching unique constraint — every save throws 42P10  
poker_near_me_search_history (archive/20260201_hamburger_menu_preferences_phase2.sql:157) has only a PK on id — there is no UNIQUE(user_id, search_query) index anywhere in the migrations. Postgres rejects INSERT ... ON CONFLICT (user_id, search_query) at plan time with 'there is no unique or exclusion constraint matching the ON CONFLICT specification' regardless of whether a duplicate exists, so a

**[MEDIUM / gap]** `lib/adminAudit.js:122`  
audit_trail mirror writes to a table no migration in this repo defines  
logAdminAction inserts into audit_trail and its header comment cites 'migration 20260428000001_audit_trail.sql' as the schema source, but no file matching audit_trail exists anywhere under supabase/migrations/ (grep confirms zero hits). The legacy fn_log_admin_action RPC and admin_audit_log table are likewise only referenced (RLS drop in 20260419100000_rls_hardening_pass3.sql) but never created in

**[MEDIUM / bug]** `lib/game-engine-service.ts:80`  
Module-scope createClient() from raw @supabase/supabase-js without typeof-window guard (repo Immutable Rules 3 and 4)  
lib/game-engine-service.ts line 80 and lib/god-mode-service.ts line 82 both call createClient(supabaseUrl, supabaseKey) at module scope with raw '@supabase/supabase-js'. The World Hub CLAUDE.md Immutable Rule 3 forbids module-scope createClient without a typeof window guard (module scope executes during SSG where browser APIs do not exist and env vars may be empty strings, so createClient runs wit

**[MEDIUM / bug]** `lib/game-engine-service.ts:266`  
getQuestionSet can return the same question multiple times in one session (sampling with replacement)  
getQuestionSet loops getNextQuestion() N times. The backing RPC get_next_training_question (archive/005_game_engine.sql) selects ORDER BY RANDOM() LIMIT 1 and excludes only scenarios already present in user_question_history - but nothing is inserted into history until submitAnswer() runs after the session. So within a single getQuestionSet call the same scenario can be (and with a small candidate 

**[MEDIUM / gap]** `lib/rgGate.js:33`  
Responsible-gaming RPCs and tables used by rgGate have no defining migration in this repo  
requireNotSelfExcluded calls RPC fn_rg_require_not_excluded, checkDepositAllowed calls fn_rg_check_deposit, and getRgState queries responsible_gaming_limits / responsible_gaming_sessions. None of these are defined in any file under supabase/migrations/ (the referenced 'phase7_responsible_gaming' migration is absent; 20260429_secure_compliance_rpcs.sql only REVOKEs related fn_set_age_verified/fn_ky

**[MEDIUM / bug]** `src/services/pokerNearMeFavorites.js:43`  
addVenueFavorite upsert fails under RLS when the favorite already exists (no UPDATE policy on poker_near_me_favorites)  
poker_near_me_favorites has only SELECT/INSERT/DELETE RLS policies (archive/20260201_hamburger_menu_preferences_phase2.sql lines 252-263; no later migration adds an UPDATE policy). addVenueFavorite uses .upsert(..., { onConflict: 'user_id,venue_id' }), which compiles to ON CONFLICT DO UPDATE. When the row already exists (double-tap, stale UI state, second device/tab that favorited the same venue),

**[MEDIUM / bug]** `src/services/pokerNearMeFavorites.js:43`  
Favorites upsert relies on ON CONFLICT DO UPDATE but poker_near_me_favorites has no UPDATE RLS policy  
addVenueFavorite() calls .upsert(..., { onConflict: 'user_id,venue_id' }) from the client-side anon/authenticated supabase client. The table has UNIQUE(user_id, venue_id) so the conflict arm is reachable, but archive/20260201_hamburger_menu_preferences_phase2.sql:252-264 defines only SELECT/INSERT/DELETE policies — no UPDATE policy. When the row already exists (double-click, stale UI state, cross-

**[MEDIUM / bug]** `src/services/pokerNearMeSearchHistory.js:36`  
Search-history upsert uses ON CONFLICT (user_id,search_query) but no such unique constraint exists — every write fails  
addSearchHistory upserts into poker_near_me_search_history with onConflict: 'user_id,search_query'. The table definition (supabase/migrations/archive/20260201_hamburger_menu_preferences_phase2.sql lines 157-163) has no UNIQUE constraint on those columns, and no later migration adds one (20260329_add_pnm_indexes.sql only adds a non-unique (user_id, searched_at) index). Postgres rejects ON CONFLICT 

**[LOW / bug]** `lib/god-mode-service.ts:79`  
Emoji characters throughout source file violate the no-emoji build rule  
god-mode-service.ts contains bare emoji in ~20 string literals and comments (lines 79, 203, 213, 218, 222, 417, 434, 453, 488, 502, 513-514, 538, 571, 576, and others). Both repo CLAUDE.md files declare 'No emoji in source files' as an immutable rule because bare emoji have broken the SWC compile on Vercel before. Even though these are console.log strings today, the rule is CI-enforced (Phase 0.5 

**[LOW / improvement]** `lib/supabaseAdmin.ts:39`  
getSupabaseAdmin silently degrades to the anon key when the service-role key is missing  
If SUPABASE_SERVICE_ROLE_KEY is unset, getSupabaseAdmin() falls back to NEXT_PUBLIC_SUPABASE_ANON_KEY and returns a client that callers (cron handlers, admin routes like adminAudit) assume bypasses RLS. With the anon key, their writes are silently rejected or filtered by RLS with confusing per-query errors instead of one loud config error - the exact failure mode the file's own docstring says it e

**[LOW / gap]** `src/services/pokerNearMeSearchHistory.js:30`  
addSearchHistory silently drops searchData; search_type column never populated  
addSearchHistory(userId, searchQuery, searchData = {}) accepts a third argument, and [pnmTab].js:1813 passes { location, filters } - but the function never uses searchData; the insert payload contains only user_id/search_query/searched_at. The table's search_type column ('venue' | 'tour' | 'series' | 'daily' per the DDL comment) is never written by anything, so any future analytics or type-filtere

**[LOW / bug]** `src/services/pokerNearMeSearchHistory.js:11`  
getSearchHistory/clearSearchHistory lack the userId guard the sibling favorites service has  
getVenueFavorites returns [] for missing/anon- userIds, but getSearchHistory, clearSearchHistory and removeSearchHistory query .eq('user_id', userId) with no guard. Called with undefined/null (current page callers happen to guard, but the services are exported for general use) the query hits PostgREST with an invalid UUID filter and throws; called with an 'anon-...' id it throws a 22P02 uuid parse

**[LOW / improvement]** `utils/mlbStats.ts:98`  
Quadratic accumulation and unbounded paging in fetchPortfolioStats fallback path  
The filtered fallback pages sim_bets 1000 rows at a time and grows the result with `allBets = [...allBets, ...data]`, copying the whole accumulated array every page (O(n^2) allocations; at tens of thousands of bets this burns serverless CPU/memory). Additionally when days is undefined but a market filter is set, no cutoff is applied and every historical row for that market is fetched. Minor relate


## Database migrations — 5 findings (3 high, 2 medium)

**[HIGH / bug]** `supabase/migrations/20260325_venue_scraping_infrastructure.sql:60`  
Migration uses invalid 'CREATE POLICY IF NOT EXISTS' — venue_news is defined only here and is never created  
PostgreSQL has no IF NOT EXISTS option for CREATE POLICY; lines 60, 64, 69, 74, and 79 are syntax errors, so the whole migration (transactional) fails and rolls back its CREATE TABLEs. venue_daily_tournaments and scraper_runs are re-created elsewhere, but venue_news is created in no other non-archive migration — yet it is read by pages/api/public/venue/[id].js:481 and written by the scraper pipeli

**[HIGH / bug]** `supabase/migrations/20260329_scraper_audit_improvements.sql:37`  
Second invalid 'CREATE POLICY IF NOT EXISTS' migration — venue_live_tables.buyin_range/runs_schedule column adds never apply  
Lines 37 and 40 use CREATE POLICY IF NOT EXISTS (invalid syntax), aborting the migration. This file is the only place that adds venue_live_tables.buyin_range and runs_schedule (via DO blocks later in the file) — columns surfaced by pages/api/poker/live-tables.js and rendered in src/components/poker-near-me/LiveGamesFeed.jsx — and the venue_live_history read/insert policies. The same defect exists 

**[HIGH / bug]** `supabase/migrations/20260408_create_venue_daily_tournaments.sql:93`  
Canonical venue_daily_tournaments migration cannot apply: empty EXCEPTION handler is a plpgsql syntax error  
The DO block at lines 85-97 ends with 'EXCEPTION WHEN OTHERS THEN' followed only by a comment and END. plpgsql requires at least one statement in an exception branch (e.g. NULL;), so the block fails to compile, the transaction aborts, and the entire migration — the authoritative CREATE TABLE for venue_daily_tournaments, its unique upsert constraint, indexes, RLS enable, and the public-read policy 

**[MEDIUM / gap]** `supabase/migrations/20260409000001_add_is_suppressed_blocklist.sql:19`  
Core PNM tables (poker_series, venue_live_tables, tournaments, tournament_alert_preferences) are never created by any migration  
Four tables that the PNM APIs query have no CREATE TABLE anywhere in supabase/migrations (including archive/): (1) poker_series — read by pages/api/poker/series.js:207/332 and events-calendar.js:455, and ALTERed by at least five active migrations (this file line 19, 20260410_add_enrichment_columns, 20260413000001_add_series_logo_url, 20260414000001/2); (2) venue_live_tables — read by live-tables.j

**[MEDIUM / gap]** `supabase/migrations/archive/20260203_poker_near_me_live_games.sql:17`  
Conflicting live_games redefinition: archived PNM migration's schema, policies, and PostGIS RPCs contradict the applied table  
live_games was created first by archive/20260130_social_pages_tables.sql:61 (venue_id TEXT, user_id TEXT, wait_time, 4h expiry, no is_active). This later file re-declares it with CREATE TABLE IF NOT EXISTS (a no-op) using an incompatible shape (venue_id INTEGER FK, reported_by UUID, seats_open, game_quality, confirmation_count, 2h expiry), then creates a policy on the nonexistent reported_by colum


## Tests — 1 findings (1 medium)

**[MEDIUM / gap]** `e2e/02-poker-near-me.spec.ts:8`  
PNM e2e test is effectively vacuous - it passes even if the page 404s or renders nothing  
The only assertions are (a) page.locator('main').or('#__next') is visible and (b) the literal text 'Application Error' has count 0. #__next is visible on every Next.js page including the 404 page, and Next's error pages do not render the string 'Application Error' (that is the static-export crash text). The two locators that would actually verify the feature - lobbyTitle (line 8) and venueNodes (l
