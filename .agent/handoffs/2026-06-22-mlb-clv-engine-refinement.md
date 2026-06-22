# Handoff - MLB CLV engine refinement (reviewed, ready to apply)

**Created:** 2026-06-22
**Repo:** `mlb-analytics-engine` (separate from World-Hub). File: `engine/model/evaluate.py`.
**Why a handoff, not a direct ship:** this changes how a reported MODEL metric (CLV / bet_type_reliability) is computed inside the nightly grading pipeline, and full effect needs a historical backfill run in the engine runtime (DB creds + deps). That can't be verified from the Cowork sandbox, and the binding rule is "verify on real hardware." CLV is already FUNCTIONAL (values populated); this is a correctness/completeness refinement. Apply + backfill + eyeball, then it's done.

## What's wrong today
- **BUG 1 (correctness):** game-market CLV is anchored to the EARLIEST market no-vig prob (line drift), not the bet's ENTRY price. `avg_clv` for game markets is therefore near-zero by construction.
- **BUG 2 (completeness):** `run_line` CLV is always NULL - `closing_prob()` only resolves `h2h`/`total`, and `_closing_lines()` never computes a spread closing prob.

## Patch (exact, from a scope-verified read)

### Edit A - re-anchor game-market CLV to entry price
In `grade_games()` add the import near the other local imports:
```python
    from transformers.betting_stats import implied
```
Replace the CLV anchor (~lines 527-531):
```python
        cl = closing_prob(p["game_pk"], p["market"], p["selection"])
        # True CLV: closing no-vig implied prob minus the bet's ENTRY-price implied prob.
        _bp = p.get("best_price")
        op = implied(_bp) if _bp is not None else earliest_novig.get(
            (p["game_pk"], p["market"], p["selection"]), {}).get("prob")
        clv = round((cl - op) * 100, 2) if (cl is not None and op is not None) else None
```
(Keeps `*100,2` scale and the no-vig closing anchor; only the subtrahend changes from earliest-line to entry-price implied. Falls back to the old anchor when best_price is NULL.)

### Edit B - add run_line closing prob (must ship as a PAIR)
**B1.** `_closing_lines()` fetch filter: add `"spreads"` to `.in_("market", ["h2h","totals"])` -> `["h2h","totals","spreads"]`.
**B2.** In the per-book bucketing add a spreads arm (selection = team NAME; key both sides on the HOME handicap):
```python
        elif mk == "spreads" and line is not None:
            if sel == tname.get(g["home_team_id"]):
                byg[gp][book]["rl_home"] = (o["price"], line)
            elif sel == tname.get(g["away_team_id"]):
                byg[gp][book]["rl_away"] = (o["price"], line)
```
**B3.** In the per-game aggregation, mirror the totals block to produce `rl_home` (no-vig home-cover prob at the modal home line) and add `rl_home`/`rl_line` to the `out[gp]` dict (away +1.5 keyed as `-d["rl_away"][1]` so both sides group on the home handicap; `novig_two_way(home_price, away_price)[0]` = home cover prob).
**B4.** `closing_prob()` add a branch (pred_market_output run_line selections are `home_<line>` / `away_<line>`):
```python
        if market == "run_line" and c.get("rl_home") is not None:
            return c["rl_home"] if str(selection).startswith("home") else (1 - c["rl_home"])
```

## Backfill + verify (IMPORTANT: `--grade-only` does NOT run CLV)
CLV lives in the `evaluate` stage. Invoke the grader directly per slate date:
```bash
cd ~/mlb-analytics-engine/engine
for d in 2026-06-15 2026-06-16 2026-06-17 2026-06-18 2026-06-19 2026-06-20 2026-06-21 2026-06-22; do
  python -m model.evaluate "$d"
done
python -m pipeline.recompute_reliability
```
Then verify: `pred_market_output.clv_pts` is now non-NULL for `market='run_line'` rows, and `pred_calibration.avg_clv_pts` / `bet_type_reliability.avg_clv` shifted as expected. `grade_games` is idempotent (upserts on game_pk,as_of_ts,market,selection).

## Deploy
The nightly `evaluate` stage auto-picks up the new code once it's on the branch the nightly job runs (GitHub Actions `mlb_daily_pipeline.yml` checks out `main`). New code alone does NOT touch historical rows - run the backfill above for past slates (especially the all-NULL run_line column).

## Risk
Edit A and Edit B are independent; Edit B must ship B1-B4 together (B4 alone is a silent no-op). Both are scope-verified for NameErrors. Magnitude of game-market CLV will shift (entry price is vigged); run_line avg_clv goes from "thin sample" to a real value - both intended. Validate with the one-day backfill before trusting the multi-day loop.
