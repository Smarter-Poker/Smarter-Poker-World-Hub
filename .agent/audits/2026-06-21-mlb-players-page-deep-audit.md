# MLB Players Page — Deep Audit, Bug Hunt & Optimization

**Date:** 2026-06-21
**Scope:** `https://smarter.poker/hub/MLB-ANALYTICS/players` and the player detail page it links to.
**Files changed:**
- `pages/api/mlb/players.ts` (directory API)
- `pages/api/mlb/players/[id].ts` (detail API)
- `pages/hub/MLB-ANALYTICS/players.tsx` (directory page)
- `pages/hub/MLB-ANALYTICS/players/[id].tsx` (detail page)

**Method:** Read-only audit delegated to two parallel subagents (frontend + API). Live
schema/data verified against the MLB engine Supabase project `nscdmxldtyszyvcxxwgr`
(views `v_hitter_profile`, `v_pitcher_profile`, `v_mlb_standings`). Decisions and fixes
made in the main thread.

> Data-source note: these routes do NOT use the World Hub DB (`kuklfnapbkmacvwxktbh`).
> They read the MLB engine DB via `utils/supabase/mlb.ts` (`getMlbSupabase()`), which is a
> deliberate, centralized second-DB client — the intent of Immutable Rule 4 is satisfied.

---

## 1. Bugs found & fixed

### BLOCKER / HIGH — directory ranking was showing the wrong players at the top
- **Pitchers floated to the top of the hitters list.** `v_hitter_profile` contains ~1,110
  non-batters (pitchers, 0 PA, NULL wRC+). The API ordered by `wrc_plus DESC` with Postgres'
  default `NULLS FIRST`, so the literal top of the hitter directory was Justin Verlander,
  Kenley Jansen, Jesse Chavez… all showing `-` for every stat.
  **Fix:** `players.ts` now filters `.gt('pa', 0)` (hitters) / `.gt('bf', 0)` (pitchers) and
  orders with `nullsFirst:false`, plus a `player_id` tiebreak for stable `.range()`
  pagination. Verified the qualified top is now Yordan Alvarez (185), Soto (168), Ohtani (164).
- **Silent 200 on DB failure (all directory paths).** A failed fetch returned HTTP 200 with
  empty arrays — the page could not tell "no data" from "DB down."
  **Fix:** hitter/pitcher fetches isolated with `Promise.allSettled`; if **both** fail the
  route returns **503** (client shows its error state); a partial failure keeps 200 + the good
  list + `fetchError` for the inline banner.

### HIGH — detail page leaked the engine model & could mask errors
- `[id].ts` used `select('*')`, shipping the entire `fangraphs_full` metrics JSONB blob to the
  browser on every profile load. **Fix:** explicit hitter/pitcher column lists; `fangraphs_full`
  dropped.
- A real DB error fell through and returned **404 "not found."** **Fix:** `hitterError`/
  `pitcherError` inspected → 500 on a genuine error; 404 only on true 0-rows.
- The two profile lookups ran **serially**. **Fix:** parallelized via `Promise.all`.
- Non-numeric `id` produced a 500. **Fix:** `/^\d+$/` validation → 400. Added `Cache-Control`.

### HIGH — detail "Advanced Metrics Vault" was a raw dump
- It rendered `Object.keys(profile)` directly, so any internal/timestamp field would surface as
  a user-facing tile, and a fragile substring formatter (`key.includes('rate')` x100, etc.)
  risked wrong numbers. **Fix:** replaced with a **curated, labelled** metric panel with
  tooltips and explicit per-metric formatting.

### MEDIUM — frontend
- Bench/Fringe tab ranked by wRC+, so a 4-PA hot streak (inflated wRC+) topped it. **Fix:**
  bench now sorts by PA (volume).
- Search ranking was non-deterministic on ties. **Fix:** rank by substring position then alpha.
- Standings-feed failure silently showed `Team 111`. **Fix:** static `MLB_TEAMS` fallback map.
- No distinct "feed returned zero players" state. **Fix:** added `noData` state.
- Removed unused `Head` import on the detail page (clean-build hygiene).

---

## 2. Upgrades / optimizations (secondary audit)

- **Detail page rebuilt** to surface the rich data that already existed but was never shown:
  - **Advanced Metrics** — hitters: xwOBA, ISO, Barrel%, Exit Velo; pitchers: xFIP, Stuff+,
    SIERA, FIP (each with a plain-English tooltip).
  - **Model Projection** (from `sim_rates`) — K/BB/HR/HBP rates + BABIP (the genuinely
    "AI/model" content).
  - **Recent Form** (from `streaks`) — hot/cold badge, hit/on-base/QS/scoreless streaks, a
    hitter **Last-5-Games** table, and a pitcher **Last Start** line. Rendered conditionally
    on data presence (coverage: streaks ~1,595/1,955 hitters, ~1,220/1,230 pitchers).
  - Hero meta line now shows team name, position/role, B/T, and age (replaced the raw
    `ID: <player_id>` line).
- **Accessibility:** `aria-label` on the search input; `aria-pressed` on tab buttons.
- **CLS:** explicit `width`/`height` on all external `<img>` (headshots, team logos).
- **SEO/copy accuracy:** corrected "2025 season" -> "2026"; aligned promises ("situational
  splits / AI prop ratings") with what is actually rendered ("recent form / model projections").
  `splits` JSONB is empty (`{}`) in the engine, so no splits section was built.

---

## 3. SQL

**No migration required.** Every defect was fixed at the application layer. The engine views,
columns, data, and indexes are all present and adequate:
- `agg_batter`/`agg_pitcher` PKs lead with `(id, as_of)` — they already support the views'
  `DISTINCT ON (...) ORDER BY ..., as_of DESC` and the detail `eq(player_id)` lookup.
- `dim_players` PK on `player_id` covers the detail filter.
- Directory/detail responses are edge-cached 60s, so per-request view computation is amortized.

No DDL was written for the World Hub DB (`kuklfnapbkmacvwxktbh`) because this page does not
touch it. A future *optional* optimization (engine repo, not this one): a lean materialized
"directory" view to avoid recomputing the full profile join for a 6-column list.

---

## 4. Verification
- `tsc --noEmit` across the whole project: **exit 0, zero diagnostics** (my 4 files included).
- Rule grep: no `.single()`, no raw `@supabase/supabase-js` import in routes, no emoji, no
  merge markers in the 4 changed files.
- Live ranking re-queried post-fix logic: qualified hitter leaderboard returns real stars.
- Production serve-SHA verification recorded at push time (see commit + `/api/health`).
