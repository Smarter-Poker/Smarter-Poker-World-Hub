# MLB Model Intel — Deep Audit, Bug Hunt & Completion (2026-06-21)

Page: `https://smarter.poker/hub/MLB-ANALYTICS/model-intel`
Files: `pages/hub/MLB-ANALYTICS/model-intel.tsx`, `pages/api/mlb/model-intel.ts`,
`supabase/migrations/20260621150000_mlb_model_intel_rpc.sql`
DB: MLB analytics engine project `nscdmxldtyszyvcxxwgr` (separate from hub DB).

## Method
Read-only audit delegated to 3 subagents (wiring, sibling-parity, engine/DB data
availability) to protect context; all decisions + fixes done in the main thread.
Every number on the page was verified against the live MLB DB before wiring.

## Bugs / regressions found and FIXED
1. **Unused React hook import `useState`** (model-intel.tsx:1). Violated Code Safety
   Rule 2 and would trip CI build-safety-gate CHECK 2. Removed.
2. **Unused imports** `Shield`, `Database`, `Network`, `ArrowLeft` (lucide) and
   dead `formatCurrency` helper. Removed.
3. **`mutate` destructured but never used** — wired into a working Refresh button
   and the error-state Retry button (previously the error screen was a dead end).
4. **Factual mislabel:** the "LAST TRAINING" metric was actually the most recent
   backtest date (`asOfTs`). Engine audit confirmed **no real training-timestamp
   column exists anywhere** in the engine or DB, so the value was relabeled
   "Data through" (honest) rather than fabricating a training date.
5. **Cumulative-curve / total-bets truncation risk:** the API selected raw
   `v_backtest_summary` rows with `.limit(2000)`. Supabase clamps oversized limits,
   so once the view (currently 839 rows) passes the row cap the equity-curve
   baseline and bet totals would silently corrupt. Fixed by aggregating
   server-side in a bounded RPC (one row per date).
6. **Advertised-but-missing content:** the JSON-LD promised "feature importance,
   confidence distributions, edge detection, model self-assessment" — none were
   rendered. Replaced with real, queryable diagnostics (below) and honest JSON-LD.

## Completion / optimization (page brought to 100%)
- New RPC `public.get_mlb_model_intel()` returns, in one bounded call: KPIs,
  per-date history with correct cumulative P&L, per-market rollup, and the
  bet-type trust ledger. API calls the RPC with a paginated JS fallback off
  `v_backtest_summary` for resilience.
- KPI grid expanded to 8 real metrics: Graded Predictions (154,162), Bets Tracked
  (9,284), Overall ROI (+1.65%), Recent ROI (14d, +0.94%), Avg Brier (0.165,
  n-weighted), Avg CLV (+0.42), Markets (16), Model Version (`backtest-v1`, real).
- New **Performance by Market** table: n, bets, n-weighted Brier, CLV, portfolio
  ROI, units — per market.
- New **Bet-Type Trust Ledger** (from `bet_type_reliability`, 14 rows): sample,
  win%, ROI, CLV, and Allow/Caution/Suppress trust badge + score multiplier.
  Fulfills the "model self-assessment" claim with real data.
- New **How To Read This** glossary (Brier / CLV / ROI / Trust).
- Cumulative P&L chart: fixed (correct full-season baseline), added zero
  reference line + richer tooltip (daily P&L + bet count), animation disabled
  for snappier reloads.
- Mobile-first fixes: responsive H1 (`text-2xl sm:text-3xl`), chart padding
  `p-4 sm:p-6`, height `h-[300px] sm:h-[350px]`, tables in `overflow-x-auto`.
- Error state now has a Retry button; header has a Refresh button (5-min SWR
  refresh, `keepPreviousData`).
- Removed all non-ASCII punctuation (em-dash, middle dot) to satisfy the emoji
  gate; entities used in JSX where a glyph is wanted.

## Data sources (all verified populated on `nscdmxldtyszyvcxxwgr`)
- `v_backtest_summary` — 839 rows / 86 dates / 16 markets (date, market, n, brier,
  avg_clv, roi, sum_unit_profit, bet_count).
- `bet_type_reliability` — 14 rows, fresh (updated 2026-06-21).
- `sim_bets` — real `model_version` stamp.
- Deliberately NOT used: `market_baseline_brier` / `avg_clv_pts` in
  `v_model_calibration_latest` (NULL in latest snapshot — would render blanks);
  feature-importance and reliability-curve (computed in engine but not persisted).

## 8 Immutable Rules — compliance
No `.single()`; no unused hook imports; no module-scope `createClient` (MLB client
is a lazy factory, server-only); MLB API uses the shared `getMlbSupabase` (separate
engine DB — same pattern as all sibling MLB routes); no `req.query.userId` trust
(GET, no identity); no `.limit()` on JS arrays; no emoji/non-ASCII. Mobile-first
verified at 375px.

## SQL
`supabase/migrations/20260621150000_mlb_model_intel_rpc.sql` — applied to
`nscdmxldtyszyvcxxwgr` via MCP `apply_migration` (name `mlb_model_intel_rpc`) and
verified by calling the function (86 history points, 16 markets, 14 bet-types,
KPIs sane).

## Deploy
Shipped via `scripts/git-safe-push.sh` (build gate + deploy verification).
