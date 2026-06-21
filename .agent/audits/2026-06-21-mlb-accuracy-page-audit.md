# Audit: MLB Analytics — /hub/MLB-ANALYTICS/accuracy

**Date:** 2026-06-21
**Agent:** Cowork (Claude)
**Scope:** `pages/hub/MLB-ANALYTICS/accuracy.tsx`, `pages/api/mlb/accuracy.ts`, and the
MLB Supabase data layer (`v_backtest_summary`, `sim_bets`) in project
`nscdmxldtyszyvcxxwgr` (the dedicated MLB analytics DB, NOT the hub DB).

## Method
Read-only audit delegated to subagents; all decisions/fixes made in the main thread.
Every claim about the data layer was verified against the **live** MLB database via the
Supabase MCP, not just migration files.

## Findings & fixes

### 1. (HIGH, fixed) Market filter was completely broken — 4 of 5 buttons dead
The API collapsed every market into one per-date row labelled `market: 'All'`. The page's
filter buttons (Moneyline / Totals / Run Line / Props) matched against real market names
(`h2h`, `total`, `run_line`, ...), which `'All'` never matched. Result: selecting anything
other than "All" always rendered "No data available for the selected filter" — the page's
entire by-market feature (and its stated SEO purpose) was dead.

**Fix:** API now returns per-market-per-date rows
(`date, market, n, brier, avg_clv, sum_unit_profit, bet_count`). The page maps each market
to its category and aggregates back to one row per date for the active filter, so all 5
buttons work and the table stays a clean daily time series.
Live per-category data confirmed present:
Props n=144,066 / Moneyline n=5,630 / Run Line n=2,252 / Totals n=2,214.

### 2. (HIGH, fixed) Portfolio Brier / CLV biased low (wrong denominator)
KPI Brier/CLV were `sum(metric*n) / totalN`, where `totalN` included predictions from rows
that have a NULL metric (e.g. `hrr`, `earned_runs`, `nrfi`). Those rows inflated the
denominator and pulled the average toward zero. The page displayed **Brier 0.142**; the
honest portfolio Brier is **0.165**. CLV had the same bug.

**Fix:** weight Brier/CLV only over rows where the metric exists
(`brierWeight`/`clvWeight`). ROI was already correct (total unit profit / total bets).
Ground-truth after fix: n=154,162, Brier 0.165, CLV 0.42, ROI +1.7%. Lock-In Gate still
PASSES (0.165 < 0.23, ROI > -3, n >= 300).

### 3. (MED, fixed) `select('*')` -> explicit column list
Wildcard select on the view replaced with the exact columns used, for stability against
future view changes and a smaller payload.

### 4. (MED, fixed) `sim_bets` fallback ROI was inconsistent with the primary path
Fallback computed `sum(pnl) / row_count`. Switched to `unit_profit` (already
stake-normalised to units) with `bet_count == row count`, so the fallback's ROI math is
identical to the view's. Fallback only runs if the view is empty/unavailable.

### 5. (LOW, fixed) Null-ROI cell styling
`Number(row.roi)` was evaluated before the null check, so `null` styled as the neutral
zero case. Now computed once with an explicit null guard.

### 6. (LOW, fixed) Stale SEO copy
Meta description said "for the 2025 season"; live data is the 2026 season. Changed to
"for the current MLB season."

### 7. (MED, fixed) TypeScript interfaces
Added `MarketRow` and `Kpi` interfaces; removed `any[]` on the response shapes.

## Data-layer verification (no DDL required)
The earlier "schema mismatch" flagged from migration files was a FALSE ALARM at the
production level — a newer migration reconciled the view. Live `v_backtest_summary` has
exactly the columns the API expects, is populated (839 rows, 2026-03-26 -> 2026-06-19,
154,162 graded predictions, 9,284 bets placed), and its ROI definition is correct.

Invariant verified: non-bet predictions carry zero `unit_profit` in both source tables
(`backtest_market_output`, `backtest_props`), so the view's
`sum(unit_profit) / count(rec LIKE '%BET%')` ROI is sound.

```sql
-- Verification (run read-only against nscdmxldtyszyvcxxwgr; no schema change applied)
select count(*) filter (where rec not like '%BET%' and coalesce(unit_profit,0) <> 0)
from backtest_market_output;   -- => 0
select count(*) filter (where rec not like '%BET%' and coalesce(unit_profit,0) <> 0)
from backtest_props;           -- => 0
```

**Conclusion:** No migration was written because no schema/RLS/RPC change was needed — the
fixes are application-layer only against an already-correct data model. SQL run during the
audit was strictly read-only verification (captured above).

## Considered & declined (avoid over-engineering)
- Aggregation RPC / materialized view: the plain view over 154k rows is fast and the API is
  HTTP-cached (`s-maxage=300` + SWR 5 min). Not worth new DB objects / refresh infra.
- Rolling-window KPI toggle / extra table columns: feature/design changes outside the
  page's "verified cumulative track record" purpose.

## Files changed
- `pages/api/mlb/accuracy.ts`
- `pages/hub/MLB-ANALYTICS/accuracy.tsx`
- `.agent/audits/2026-06-21-mlb-accuracy-page-audit.md` (this file)
