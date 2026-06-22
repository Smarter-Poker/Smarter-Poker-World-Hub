# Handoff: MLB engine — store UNDER prices + fix odds pricing pipeline

**Date:** 2026-06-22
**For:** an agent running with mlb-analytics-engine repo + engine deploy + MLB Supabase (`nscdmxldtyszyvcxxwgr`) credentials.
**Why a handoff:** these are engine-side (separate repo `~/Documents/mlb-analytics-engine`) + data-pipeline fixes that the World Hub agent cannot deploy or run.

## Context

The World Hub Props page (`/hub/MLB-ANALYTICS/props`) was showing phantom "ELITE 99 / +19.5% EV" scores on UNDER props. Root cause (verified in DB + engine code):

`pred_props.best_price` and `best_lines` store **only the best OVER price** — see `engine/pipeline/daily_predict.py` (~lines 1430–1441): the loop appends only `sides.get("over")` to `best_prices`. The UNDER offered price is never stored.

The hub re-derives the recommended side and, for UNDER recs, paired the under win-probability with the (only available) OVER price → fabricated EV. **Hub mitigation already shipped** (commit on `main`, `pages/api/mlb/props.ts`): unders are now scored against the **no-vig fair under price** (honest, but price-shop-free). That removes the phantom, but unders cannot show a *real* best book price until the engine stores it.

Second issue: **the odds pricing pipeline has not attached prices since 6-20.**
- `2026-06-22`: 1,651 pred rows, **0 priced** (best_price all null)
- `2026-06-21`: 3,128 pred rows, **0 priced**
- `2026-06-20`: 3,094 rows, 1,283 priced
Because today has no priced props, the page correctly falls back to the last graded slate (6-20) — which is why users see a "stale slate." The real fix is getting the odds step running again.

## Task 1 — store the best UNDER price + lines

In `engine/pipeline/daily_predict.py` (~1430–1441), build both sides:

```python
best_over, best_under = [], []
for b, sides in books.items():
    o, u = sides.get("over"), sides.get("under")
    if o is not None: best_over.append({"book": b, "price": o})
    if u is not None: best_under.append({"book": b, "price": u})
best_over.sort(key=lambda x: x["price"], reverse=True)
best_under.sort(key=lambda x: x["price"], reverse=True)   # best under = highest American
market_props[(pid, prop_key, line)] = {
    ...,
    "price": best_over[0]["price"] if best_over else None,
    "price_under": best_under[0]["price"] if best_under else None,
    "best_lines": best_over[:3],
    "best_lines_under": best_under[:3],
}
```

Add columns via a Supabase migration on `nscdmxldtyszyvcxxwgr` (save under the engine repo's migrations, apply via MCP `apply_migration`):

```sql
ALTER TABLE pred_props
  ADD COLUMN IF NOT EXISTS best_price_under integer,
  ADD COLUMN IF NOT EXISTS best_lines_under jsonb;
```

Then write those columns in the daily upsert.

**After the columns are populated**, update the hub API `pages/api/mlb/props.ts`: select `best_price_under, best_lines_under`, and in the mapping use:
```ts
const price = isOver ? overPrice : (p.best_price_under != null ? Number(p.best_price_under) : fairAmericanFromProb(pMarket));
const priceIsReal = isOver ? overPrice != null : p.best_price_under != null;
best_lines: isOver ? p.best_lines : p.best_lines_under,
```
(The `fairAmericanFromProb` fallback already exists, so unders degrade gracefully if a row lacks an under price.)

## Task 2 — fix the odds pricing pipeline (priority)

Diagnose why the odds-fetch/attach step produced **0 priced rows for 6-21 and 6-22** while predictions were generated. Likely a failed odds API call / key / rate-limit / schema change in the pricing step. Restore it so each day's slate gets `best_price` populated before first pitch. Confirm by querying:
```sql
SELECT as_of_ts::date, count(*) AS rows, count(best_price) AS priced
FROM pred_props WHERE as_of_ts >= now() - interval '3 days'
GROUP BY 1 ORDER BY 1 DESC;
```
A healthy day shows `priced` in the hundreds/thousands. Watch one fire-cycle in production.

## Acceptance

1. New slate rows carry `best_price` AND `best_price_under` (+ both `best_lines`/`best_lines_under`).
2. `pred_props` shows non-zero `priced` for the current day.
3. Hub props page (after the API tweak above) shows real book prices on UNDER cards, with honest Bet Scores.
