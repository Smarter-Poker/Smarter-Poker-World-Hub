#!/usr/bin/env python3
"""engine/tests/situational_ab.py — ship-gate for the v2 situational moneyline layer.

Complements (does NOT replace) the full walk-forward in run_backtest.py /
backtest_harness.py. Those replay the WHOLE model end-to-end. This module isolates
ONE question that gate-keeps Phase 1:

    "Does enabling situational_v2 make the team-strength PRIOR more predictive
     (lower Brier / log-loss) and more profitable (fair-line ROI) — without
     hurting calibration?"

It compares `team_strength.team_prior` (situational OFF — the disabled in-repo state)
against `situational_v2.team_prior_v2` (situational ON) over the same games.

Metric conventions match backtest_harness.py: Brier = (p - y)^2 (random baseline
0.25), and the fair-line ROI proxy = stake 1u at 1/market_novig when you take the
edge side (random/vig baseline ~ -4.5%). Closing prob -> CLV when available.

Modes (CLI):
    --selftest          synthetic games, validates the A/B math + that a real
                        signal is detected. No DB. Runs anywhere.
    --slates "glob"     graded-slate replay: baselines existing prob columns
                        (model/market/blended/closing) vs actual results. No DB.
    --db --start --end  REAL A/B over fact_games + agg_situational (their env).

The AUTHORITATIVE end-to-end gate remains: run run_backtest.py with SITUATIONAL_V2
off vs on and diff backtest_report.py. This module is the fast isolation check.
"""
from __future__ import annotations
import argparse
import glob as _glob
import json
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))  # engine/
from model.team_strength import team_prior                       # noqa: E402  (pure stdlib)
from model.situational_v2 import team_prior_v2, DEFAULT_CFG       # noqa: E402


# ---- metrics (match backtest_harness.brier_score; defined locally so this module
#      imports with NO DB dependency) -----------------------------------------------
def brier_score(p, y):
    return (p - y) ** 2


def log_loss(p, y, eps=1e-12):
    p = min(max(p, eps), 1 - eps)
    return -(y * math.log(p) + (1 - y) * math.log(1 - p))


def evaluate(probs, ys):
    """probs/ys are aligned home-win prob + actual(1/0). -> summary metrics."""
    n = len(ys)
    if n == 0:
        return {"n": 0}
    brier = sum(brier_score(p, y) for p, y in zip(probs, ys)) / n
    ll = sum(log_loss(p, y) for p, y in zip(probs, ys)) / n
    acc = sum(1 for p, y in zip(probs, ys) if (p >= 0.5) == (y == 1)) / n
    return {"n": n, "brier": round(brier, 4), "log_loss": round(ll, 4), "acc": round(acc, 4)}


def fairline_roi(picks):
    """picks: list of (p_side, market_novig_side, won_bool). Bet the side only when
    model prob beats the no-vig market prob (positive edge). Stake 1u; payout
    1/market_novig - 1 on a win, -1 on a loss. Returns (roi_pct, n_bets, units)."""
    units = 0.0
    bets = 0
    for p, mkt, won in picks:
        if mkt is None or p is None or p <= mkt:
            continue
        bets += 1
        if won:
            units += (1.0 / mkt - 1.0) if mkt > 0 else 1.0
        else:
            units -= 1.0
    roi = (units / bets * 100.0) if bets else 0.0
    return round(roi, 2), bets, round(units, 3)


# ---- graded-slate replay (no DB) -------------------------------------------------
def _home_rows_from_slate(path):
    """One row per game: home-side h2h prob columns + y(home won). Graded games only."""
    d = json.load(open(path))
    out = []
    for g in d.get("games", []):
        h = {m["selection"]: m for m in g.get("markets", []) if m["market"] == "h2h"}
        hm = h.get("home")
        if not hm or hm.get("result") in (None, ""):
            continue
        out.append({
            "model": hm.get("model_prob"), "market": hm.get("market_novig_prob"),
            "blended": hm.get("blended_prob"), "closing": hm.get("closing_prob"),
            "y": 1 if str(hm.get("result")).lower() == "win" else 0,
        })
    return out


def replay_slates(paths):
    rows = []
    files = []
    for pat in paths:
        files.extend(sorted(_glob.glob(pat)))
    for f in files:
        rows.extend(_home_rows_from_slate(f))
    print(f"== Graded-slate replay ==  files={len(files)} graded_games={len(rows)}")
    if not rows:
        print("  (no graded games found — nothing to evaluate)")
        return
    for col in ("model", "market", "blended", "closing"):
        probs = [r[col] for r in rows if r[col] is not None]
        ys = [r["y"] for r in rows if r[col] is not None]
        m = evaluate(probs, ys)
        print(f"  {col:8} {m}")
    # fair-line ROI of betting the model's edge side vs the no-vig market
    picks = []
    for r in rows:
        if r["model"] is None or r["market"] is None:
            continue
        picks.append((r["model"], r["market"], r["y"] == 1))            # home side
        picks.append((1 - r["model"], 1 - r["market"], r["y"] == 0))    # away side
    roi, bets, units = fairline_roi(picks)
    print(f"  model fair-line ROI: {roi}%  (bets={bets}, units={units})  [baseline ~ -4.5%]")


# ---- the A/B: team_prior vs team_prior_v2 ----------------------------------------
def ab_compare(games, cfg=None):
    """games: list of dicts {home_metrics, away_metrics, home_ctx, away_ctx,
       market_novig_home (optional), home_won (1/0)}. Compares the two priors."""
    cfg = cfg or {**DEFAULT_CFG, "enabled": True}
    base_p, v2_p, ys, base_picks, v2_picks = [], [], [], [], []
    moved = 0
    for g in games:
        hm, am = g.get("home_metrics"), g.get("away_metrics")
        hc, ac = g.get("home_ctx") or {}, g.get("away_ctx") or {}
        pb = team_prior(hm, am, hc, ac)
        pv, _ = team_prior_v2(hm, am, hc, ac, cfg)
        if pb is None or pv is None or g.get("home_won") is None:
            continue
        y = int(g["home_won"])
        base_p.append(pb); v2_p.append(pv); ys.append(y)
        if abs(pv - pb) >= 0.005:
            moved += 1
        mkt = g.get("market_novig_home")
        if mkt is not None:
            base_picks.append((pb, mkt, y == 1)); base_picks.append((1 - pb, 1 - mkt, y == 0))
            v2_picks.append((pv, mkt, y == 1)); v2_picks.append((1 - pv, 1 - mkt, y == 0))
    base = evaluate(base_p, ys); v2 = evaluate(v2_p, ys)
    out = {"base": base, "v2": v2, "games": len(ys), "games_moved": moved}
    if base.get("n"):
        out["brier_delta"] = round(v2.get("brier", 0) - base.get("brier", 0), 4)   # negative = v2 better
        out["logloss_delta"] = round(v2.get("log_loss", 0) - base.get("log_loss", 0), 4)
    if base_picks:
        out["base_roi"] = fairline_roi(base_picks)
        out["v2_roi"] = fairline_roi(v2_picks)
    return out


def make_db_games(start, end):  # pragma: no cover - needs DB env
    """Build the A/B game panel from fact_games + agg_situational (as-of each date).
    Mirrors backtest_harness look-ahead protection: situational metrics queried with
    as_of < game date. Only callable where supabase + creds are present."""
    from common import db
    client = db.get_client()
    games = db.fetch_all(client.table("fact_games").select("*")
                         .gte("official_date", start).lte("official_date", end).eq("final", True))
    sit = {(r["team_id"], r["as_of"]): r["metrics"]
           for r in db.fetch_all(client.table("agg_situational").select("team_id,as_of,metrics"))}
    panel = []
    for g in games:
        date = g["official_date"][:10]
        hm = sit.get((g["home_team_id"], date)) or _latest_metrics(sit, g["home_team_id"], date)
        am = sit.get((g["away_team_id"], date)) or _latest_metrics(sit, g["away_team_id"], date)
        if not hm or not am:
            continue
        panel.append({
            "home_metrics": hm, "away_metrics": am,
            "home_ctx": {"is_home": True}, "away_ctx": {"is_home": False},
            "home_won": 1 if (g.get("home_score") or 0) > (g.get("away_score") or 0) else 0,
        })
    return panel


def _latest_metrics(sit, team_id, date):  # pragma: no cover
    cands = [(d, m) for (t, d), m in sit.items() if t == team_id and d < date]
    return max(cands)[1] if cands else None


# ---- selftest (no DB) ------------------------------------------------------------
def selftest():
    fails = []
    if not abs(brier_score(1.0, 1) - 0.0) < 1e-9:
        fails.append("brier perfect should be 0")
    if not abs(evaluate([0.5, 0.5], [1, 0])["brier"] - 0.25) < 1e-9:
        fails.append("brier of 0.5 guesses should be 0.25")
    _roi, bets, _u = fairline_roi([(0.6, 0.5, True), (0.6, 0.5, False)])
    if bets != 2:
        fails.append("fairline_roi should take both +edge bets")

    # Construct a real signal: home teams are baseline .500 but genuinely strong
    # (large sample) vs LOSING opponents; today's opp is losing; outcomes follow the
    # true rate. v2 (adds vs_losing signal) should beat the flat base prior on Brier.
    import random
    random.seed(7)
    games = []
    for _i in range(120):
        hm = {"win_pct": 0.50, "pythag_pct": 0.50,
              "vs_losing_teams": {"w": 39, "l": 21, "pct": 0.65}}   # n=60, real edge
        am = {"win_pct": 0.50, "pythag_pct": 0.50}
        won = 1 if random.random() < 0.62 else 0     # home actually wins ~62%
        games.append({"home_metrics": hm, "away_metrics": am,
                      "home_ctx": {"is_home": True, "opponent_win_pct": 0.42},
                      "away_ctx": {"is_home": False, "opponent_win_pct": 0.58},
                      "market_novig_home": 0.50, "home_won": won})
    res = ab_compare(games)
    if res["games"] != 120:
        fails.append("ab_compare should evaluate all games")
    if not (res["games_moved"] > 100):
        fails.append("v2 should move most games when a gated signal is present")
    if not (res["brier_delta"] < 0):
        fails.append(f"v2 should lower Brier on real signal (delta={res.get('brier_delta')})")
    return fails, res


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--selftest", action="store_true")
    ap.add_argument("--slates", nargs="*", default=None)
    ap.add_argument("--db", action="store_true")
    ap.add_argument("--start"); ap.add_argument("--end")
    a = ap.parse_args()

    if a.selftest:
        f, res = selftest()
        print("== situational_ab selftest ==")
        print("  A/B on constructed signal:", json.dumps(res, indent=2))
        print(f"  {'PASS' if not f else 'FAIL'} ({len(f)} failures)")
        for x in f:
            print("   -", x)
        sys.exit(0 if not f else 1)
    elif a.db:
        games = make_db_games(a.start, a.end)
        print(f"== DB situational A/B {a.start}..{a.end}  games={len(games)} ==")
        print(json.dumps(ab_compare(games), indent=2))
    else:
        replay_slates(a.slates or ["exports/slate_*.json", "reports/*/slate.json"])
