# MLB-ANALYTICS Teams Page — Re-Audit, Bug Hunt & Optimization (2026-06-21)

Scope: `/hub/MLB-ANALYTICS/teams` (list) + `/hub/MLB-ANALYTICS/teams/[team_id]` (detail)
and their APIs `pages/api/mlb/teams.ts`, `pages/api/mlb/teams/[team_id].ts`.
Follows the 2026-06-20 deep audit (`2026-06-20-mlb-teams-audit.md`), which had already
standardized the Bet Score scale, rebuilt the games tab, and merged the agg_team windows.

Data source: MLB engine Supabase project `nscdmxldtyszyvcxxwgr` (separate from the hub
project `kuklfnapbkmacvwxktbh`); schema owned by the Python engine. All changes here are
in the API/UI layer — **no MLB schema migration required** (see "SQL" below).

## Method
Heavy read-only audit delegated to two subagents (list vertical + detail vertical);
findings then **verified against the live production API** before fixing, because the
checked-in migration `supabase/migrations/20260618230000_mlb_complete_schema.sql` is a
stale/minimal mirror of the engine schema and led both subagents to false-positive
"missing streaks/splits/division" conclusions.

Live ground truth (prod SHA `dcedd54c`, 2026-06-21):
- `/api/mlb/teams` -> 30 clubs, each with `streaks`, `splits`, `division`, `adv_stats`.
- All 30 teams currently have `grade: null` (no active prop edges on this date);
  `summary.gradedCount = 0`, `globalEdgeActive = false`.
- `/api/mlb/teams/99999` (bogus id) -> **HTTP 200** with a fabricated team `{name:"99999"}`.

## Bugs / gaps fixed (verified-real)

1. **Unknown team id returned a fabricated 200 instead of 404.** `[team_id].ts` parsed
   the id from the URL path and `baseTeam = teamData || dimData || {team_id:id, name:id}`,
   so any garbage id (`/teams/99999`) rendered a "team" named after the raw id. The
   `.maybeSingle()` not-found guard (`if (profileRes.error && !dimData)`) never fired
   because `.maybeSingle()` returns `{data:null, error:null}` on 0 rows. **Fix:** validate
   `id` is a positive integer up front (also neutralizes the unsanitized value reaching
   `.eq()`/`.or()` filters); change the guard to `if (!teamData && !dimData)`; return
   `{notFound:true}` (404, no `error` key); drop the fabricated fallback. The detail
   page's existing "Team Not Found" UI is now reachable.

2. **Detail page never showed the Not-Found UI / could flash blank on cold load.** The
   loading guard was `!data && isValidating` (can be false on first tick -> blank `<main>`),
   and the SWR `fetcher` threw on any non-2xx, routing a 404 to the generic "System Error"
   card instead of the dedicated Not-Found UI. **Fix:** fetcher now treats a 404 as data
   (`{notFound:true}`) rather than a transport error; loading guard changed to
   `!data && !error`; removed the now-unused `isValidating`.

3. **APIs swallowed Supabase query errors.** Several `.error` results were ignored, so a
   missing-stats/missing-games incident left no server breadcrumb. **Fix:** `console.warn`
   on the secondary-query errors in both APIs (behavior unchanged, observability added).

## Optimizations / upgrades

- **List SWR polling** reduced from a 15s interval (no dedupe) to 30s + `dedupingInterval`
  10s — cuts the load on the 6-query `/api/mlb/teams` endpoint roughly in half per open tab.
- **Initial loading skeleton** on the list page: distinguishes "first fetch in flight"
  from "genuinely empty", so users no longer see "NO TARGETS ACQUIRED" during cold load.
- **Accessibility:** search input `aria-label`; sort `<select>` `aria-label`; MLB EDGE
  status indicator `role="img"` + state `aria-label` (was color-only); detail tabs given
  `role="tablist"/"tab"`, `aria-selected`, `type="button"`, and >=44px tap targets.
- **Dead-code cleanup:** removed 4 unused exported interfaces in `teams.tsx`, a no-op
  `e.preventDefault()` on the telemetry toggle (button is outside the `<Link>`), and two
  unused `--neon-magenta` CSS vars in `[team_id].tsx`.

## Confirmed NON-issues (false alarms from the stale migration)
- `streaks` / `splits` DO reach both pages (verified on live API) — record/L10/home/away
  splits render correctly; they are NOT permanently `0-0`.
- `division` IS populated, so the list does NOT drop all 30 teams.
- Null `grade` is handled safely everywhere: card uses `team.grade ? ... : 'No edge'`;
  sort uses `b.grade?.score || 0`. No client crash despite all-null grades today.
- 8 Immutable Rules: clean (no `.single()`, no emoji, no array `.limit()`, no client-side
  identity trust, factory-scoped MLB Supabase client, no merge markers).

## SQL
**None required.** Every fix is API/UI logic. MLB tables/views (`v_team_profile`,
`dim_teams`, `agg_team`, `fact_games`, `pred_props`, `v_hitter_profile`,
`v_pitcher_profile`) live in the engine-owned project and were not modified. The
checked-in `20260618230000_mlb_complete_schema.sql` is a known-stale documentation mirror
(missing `streaks`/`splits`/`wrc_plus`/`woba`/`as_of`); it is NOT edited here because
rewriting an already-applied migration changes nothing in the live DB and the engine owns
that schema. Reconciliation is a follow-up for the engine repo, not this page.

## Files changed
- `pages/api/mlb/teams/[team_id].ts`
- `pages/hub/MLB-ANALYTICS/teams/[team_id].tsx`
- `pages/hub/MLB-ANALYTICS/teams.tsx`
- `pages/api/mlb/teams.ts`

## Verification
- `@babel/parser` (typescript+jsx) clean on all 4 changed files.
- 8-rule greps clean (`.single()`, merge markers, raw supabase import, emoji: none).
- Post-deploy: `/api/mlb/teams/99999` must return 404; `/api/mlb/teams` 30 clubs;
  list + detail pages load without console errors. (See push verification below.)
