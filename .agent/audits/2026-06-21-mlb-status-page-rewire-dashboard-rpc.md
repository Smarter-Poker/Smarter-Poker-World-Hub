# Audit: MLB Analytics `/status` page — deep bug-hunt + full upgrade

**Date:** 2026-06-21
**Scope:** `pages/hub/MLB-ANALYTICS/status.tsx`, `pages/api/mlb/status.ts`
**DB verified against:** live MLB project `nscdmxldtyszyvcxxwgr` (mlb-analytics-engine)

## How it was audited
Heavy read-only audit delegated to two subagents (frontend page; API + data layer).
All conclusions then **re-verified against the live database** before any fix — the
audit's headline claim ("endpoint is 500-ing") turned out to be **false**; live
verification showed the endpoint returns 200 but with broken/blank/inflated data.

## Confirmed bugs (verified vs live DB, not just code)
1. **Blank pipeline timestamps (HIGH).** Page read `run.run_at`; the live
   `get_mlb_status_metrics` RPC returns `run_at: null` for every row (real column
   is `run_ts`). Every "RECENT PIPELINE RUNS" row showed a stage + status pill with
   an empty time.
2. **Non-deterministic "latest run per stage" (HIGH).** Old RPC `ORDER BY run_at`
   (all null) → rows effectively unordered → API's "first occurrence per stage"
   could show a stale run rather than the newest.
3. **Inflated Best Bets count (HIGH).** Old RPC counted every intraday snapshot
   (showed 48); true latest-slate count is 5.
4. **Estimated + mislabeled table sizes (MED).** `pg_class.reltuples` estimates;
   `fact_games` key was actually sized from `raw_games`.
5. **Render-throw risks (MED).** `run.status.toUpperCase()` and
   `count.toLocaleString()` could throw on null/non-number.
6. **Opaque 500 / swallowed errors, no retry, no "last updated", no a11y (MED).**

## Fix shipped
Rewired both API and page to the live, tracked, hardened RPC **`get_status_dashboard()`**
(migrations `20260621003921`, `20260621004109`) which fixes every item above and is
strictly richer.

**API (`pages/api/mlb/status.ts`)** — single `get_status_dashboard()` call; builds
latest-run-per-stage from the newest-first feed; canonical stage ordering; computes
`isSystemFresh` from health staleness + pipeline errors; returns specific error
messages (no more opaque 500); cache lowered from `s-maxage=60/swr=300` to
`s-maxage=30/swr=60` (status pages must be fresh); error responses `no-store`.

**Page (`pages/hub/MLB-ANALYTICS/status.tsx`)** — rebuilt to surface: live "data as
of" ticker, pipeline health summary, SYSTEM HEALTH (last refresh, slate as-of, games
in run, live recs, unmodeled games, runline conflicts), TODAY'S SLATE (correct
counts), MODEL ACCURACY (Brier ML/props, games evaluated, daily samples, color-coded),
BET TIER DISTRIBUTION, DATA SOURCE FRESHNESS (9 sources, status + pulled-at + rows),
RECENT ALERTS, RECENT PIPELINE RUNS (real `run_ts`, duration, rows), DB TABLE COUNTS
(real `COUNT(*)`). Added retry button, aria labels/`aria-busy`/`role=status`,
focus-visible rings, robust null handling, mobile-first `tabular-nums`/`break-words`.

## SQL
**No new schema SQL required.** The consumed RPC `get_status_dashboard()` already
exists, is applied, and is tracked on the live MLB project (migrations
`20260621003921` + `20260621004109`). Verified via `list_migrations` and by executing
the RPC directly.

**Deprecated (left in place, harmless):** `get_mlb_status_metrics` — now unused (its
only consumer was this endpoint, confirmed by repo grep). Not dropped this session to
respect migration-safety (cross-project destructive change); flagged as a future
cleanup.

## 8 Immutable Rules check
No `.single()`; all hook/icon imports used; no module-scope `createClient`; API uses
`getMlbSupabase()` (not a raw client in the route); no `req.query.userId` trust; no
`.limit()` on arrays; no emoji (only `—`/`•` punctuation already present in deployed
sibling pages).

## Verification
Build gate (`npx next build` via `git-safe-push.sh`) + production `/api/health` SHA
match + live page/endpoint spot-check.
