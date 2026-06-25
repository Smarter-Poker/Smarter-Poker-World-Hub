# Ingestion & API Integrity Audit (2026-06-25)

## Objective
Trace the data flow before the simulators and the API serialization layer to verify data integrity, specifically looking for:
1. Clipping of raw pitcher/batter stats during ingestion.
2. Missing opponent data points defaulting to "league average" instead of true empirical historicals or NULL.
3. API serialization limits clipping data points safely.

## Findings & Resolutions

### 1. Raw Stats Capping (Resolved)
**Issue:** The ingestion transformations in `engine/transformers/matchup_rates.py` applied artificial numerical `BOUNDS` to all incoming player stats before they ever reached the simulation. It capped Strikeout rates (K%) to a maximum of 55%, Walk rates (BB%) to 30%, and BABIP between 0.20-0.42. This clipped valid, empirical edge-case data (e.g. elite pitchers or terrible hitters).
**Fix:** Removed the `min(hi, max(lo, base[s] * f))` bounding logic entirely from `matchup_rates.py`, preserving the true unbounded historical rates to be naturally processed downstream.

### 2. "League Average" Defaults for Missing Opponent Data (Resolved)
**Issue:** Inside `engine/pipeline/daily_predict.py`, the `_rateset` lineup generator handles unprofiled batters (e.g., rookies). When calculating situational and bio-mechanical modifications, it defaulted the missing base metrics to hardcoded league averages (e.g., K = 0.22, BB = 0.08, HR = 0.03, BABIP = 0.30) via `.get("k", 0.22)`. This meant that a rookie facing an elite pitcher like Spencer Strider would default to a 22% strikeout rate rather than inheriting the opponent's true empirical suppression.
**Fix:** Injected the opposing pitcher's true empirical historical rates (`opp_meta.get("sim_rates")`) into the fallback chain. The code now defaults to `_opp_k`, `_opp_bb`, etc., ensuring we default to the true opponent data point instead of a generic league average. 

### 3. API Serialization Truncation (Resolved)
**Issue:** The frontend API endpoints (`/pages/api/mlb/hitters.ts` and `/pages/api/mlb/pitchers.ts`) were calling a Supabase `.rpc()` to retrieve the player directories. By default, PostgREST caps all set-returning functions to 1,000 rows. The hitter directory (~1,950 rows) and pitcher directory (~1,220 rows) were being silently truncated at serialization, causing data loss in the frontend dashboard.
**Fix:** Refactored both endpoints to bypass the RPC and query the underlying views directly (`v_hitter_profile` and `v_pitcher_profile`). Implemented a `fetchAllRows` utility that utilizes `.range(from, to)` pagination loops to pull the entire directory in batches, ensuring exactly 0 empirical data points are dropped.

## Summary
The pipeline has been audited and cleared of artificial capping bounds, hardcoded generic fallbacks, and backend 1,000-row API limitations. Data flows directly from empirical tables to the Monte-Carlo endpoints natively.
