# MLB Props page — deep audit + fixes (2026-06-21)

**Scope:** `https://smarter.poker/hub/MLB-ANALYTICS/props`
**Files:** `pages/api/mlb/props.ts`, `pages/hub/MLB-ANALYTICS/props.tsx`
**Data:** MLB Supabase project `nscdmxldtyszyvcxxwgr` (`mlb-analytics-engine`), table `pred_props`.

## TL;DR

A three-layer read-only audit (frontend, API/DB, shared components) was run via
subagents, then every finding was verified against the live database before any
fix. One genuine production bug was found and fixed (slate-date selection was a
day off due to a timezone mis-handling), plus a batch of correctness hardening
and UX completion work. All changes are application-layer — **no schema/RPC
migration was required** (verified the existing index already covers the new
query shape).

## Root cause — the one real bug (P0/P1)

`pred_props.as_of_ts` is written by the engine as the **slate date at UTC
midnight** (e.g. `2026-06-21` → `2026-06-21T00:00:00Z`). The API was treating
that value as a Chicago-local instant via `chicagoDayUtcRange()`, whose window
starts at 05:00Z. Consequences verified against live data (today's slate had 0
priced rows, June 20 had 1283):

- The engine's main run at `00:00:00Z` fell **before** the window start → excluded.
- The fallback then derived the slate date with `chicagoYmd(midnightUTC)`, which
  converts `2026-06-20T00:00:00Z` to Chicago `2026-06-19` — **a day early**.
- Net effect in production: the page showed June 20's props **labelled
  June 19**, and the frontend stale-banner (`official_date < today`) fired
  incorrectly.

**Fix:** key the slate strictly on the UTC date embedded in `as_of_ts`
(`utcDayRange()` + `slateYmdFromTs()`). Verified the slate query still uses
`ix_pred_props_as_of_priced` (Index Scan, ~7ms).

## Other fixes (verified)

API (`pages/api/mlb/props.ts`):
- De-duplicate to one row per `(player_id, prop, line)` keeping the latest
  `as_of_ts` (defensive; live data currently has 0 duplicate keys, but an
  intraday re-price run would otherwise double cards).
- Error logging on the 5 profile/stat fan-out queries + the `dim_players`
  fallback (previously silent `|| []`, which hid `Player #<id>` degradation).
- `topScore`/`topLock` computed with null-safe `reduce` instead of `Math.max(...spread)`.

Frontend (`pages/hub/MLB-ANALYTICS/props.tsx`):
- `isOver` now derives from the API-authoritative `prop.side` in both the card
  and the modal (removed the divergent `?? true` / proj-vs-line fallbacks that
  could show the wrong side).
- "MKT LINE" odds use the side-correct `prop.p_market` only (dropped the
  `market_novig_over` fallback that showed the OVER price on UNDER bets).
- List key is now identity-based (`player_id-prop-line`, no positional `idx`)
  for correct React reconciliation across filter/sort changes.
- Midnight-safe stale check: `todayStr` now re-evaluates on an interval.

## Completion / optimization (verified build-safe)

- Header reworked into a slate stat strip exposing all computed stats —
  **STRONG** and **TOP LOCK** are now shown (previously computed but never
  rendered), alongside TOTAL / ELITE / TOP.
- **Sort controls** added (Bet Score / EV% / Win% / Kelly), nulls always last.
- Live **SYNCING** indicator during SWR revalidation (`isValidating`).

## Verification

- Live-DB checks confirmed `as_of_ts` storage format, zero duplicate keys, the
  real prop vocabulary (filters match), and `best_lines` key shape (`book`).
- `EXPLAIN ANALYZE` on the new UTC-day query → Index Scan on
  `ix_pred_props_as_of_priced`, ~7ms.
- `esbuild` transpile of both files passed (clean syntax); `next.config.js` has
  `typescript.ignoreBuildErrors: true`; no emoji / `.single()` / unused hook
  imports / new raw `@supabase/supabase-js` imports introduced.

## Deferred (out of scope for this page)

- `src/lib/mlb_cached_data.ts#getCachedTopHitters` selects `player_class`
  (column not in the migrated `v_hitter_profile`) — used by other MLB pages,
  not props. Flagged for a follow-up.
- The `edgeHandler`→Next polyfill double-wraps the request; cosmetic tech debt.
