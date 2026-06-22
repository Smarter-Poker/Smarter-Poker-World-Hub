# MLB Props — deep sweep, durability fix, audit-finding fixes (2026-06-22)

## TL;DR
Ran a multi-agent swarm audit (3 read-only subagents over the API, UI and the
font/caps transform) across everything built today on /hub/MLB-ANALYTICS/props,
fixed every actionable finding, and closed a real durability regression: the
engine's 15-min intraday daily_predict was re-upserting pred_props and nulling
best_price (raw_odds had no props for the slate), re-staling the page within
~15 min of every external price write. Page verified live (is_stale:false, 924 priced).

## Durability regression (headline)
- Symptom: page re-staled to 6-20 minutes after 6-22 was priced.
- Cause: com.smarterpoker.mlb.intraday LaunchAgent (StartInterval 900s) runs
  run_intraday -> daily_predict every 15 min; with no props in raw_odds it upserts
  best_price=NULL for prop rows, clobbering any external pred_props price write.
- Fix: price_props_hub.py now also runs odds_api.run(include_props=True) (the
  engine's own ingest, numpy-free) to populate raw_odds, so each daily_predict
  cycle re-prices natively + durably. The direct pred_props update stays as the
  immediate / Mac-off path. Workflow price-props.yml installs tenacity.
  Verified: total 597 (direct) -> 924 (engine re-priced from raw_odds);
  GitHub Actions run a3cde4fd success.

## Audit findings fixed (hub)
pages/api/mlb/props.ts
- Graded recap now counts voided bets (results.voided); record/units unchanged.
- Pathological estimated UNDER price (|fair| > 600) clamped to null so it cannot
  fabricate a Bet Score.
- (Numeric-timestamp dedup tweak was applied then reverted by an Antigravity
  reset; lexical compare of same-format ISO as_of_ts is functionally identical,
  so it is not a regression.)
pages/hub/MLB-ANALYTICS/props.tsx
- todayStr initialised synchronously (chicagoToday) so the first paint no longer
  treats a stale slate as live (empty-string compare bug).
- Empty-state condition fixed: filter === 'All' (was 'ALL', never matched).
- Void recap stat surfaced when voided > 0.
- Rank #N moved beside the score box, enlarged to 22px, white (per Dan's request).
- Restored stat-acronym casing (ERA/WHIP/FIP/SIERA/AVG/OBP/SLG/OPS/HR/RBI/...) the
  platform Title-Case pass had mangled, across props / players / portfolio /
  validation / teams/[team_id] / model-intel + MLB/ROI in best-bets & teams.

## Engine
- daily_predict.py stores best_price_under/best_book_under/best_lines_under
  (verified priced_under 603). Best under = highest American (best payout).
- price_props_hub.py PROP_MAP extended (batter_rbis->rbi, batter_runs_scored->runs)
  so the fallback pricer covers the full 9-prop vocabulary, not 7.

## SQL
- Applied earlier: ALTER pred_props ADD best_price_under, best_book_under, best_lines_under.
- Evaluated + intentionally skipped: ix_pred_props_slate_edge (redundant with the
  existing ix_pred_props_as_of_priced) and a result CHECK constraint (the engine, a
  separate codebase, writes result; a violation would break the pricing upsert and
  re-stale the page; the hub already maps void->Push gracefully).

## Verified
- prod /api/mlb/props: official_date 2026-06-22, is_stale:false, 924 priced,
  results.voided present.
- esbuild clean on every changed file. GH Actions price-props run a3cde4fd success.
