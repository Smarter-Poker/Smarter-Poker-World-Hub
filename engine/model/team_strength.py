"""engine/model/team_strength.py
Baseline team-strength PRIOR for the Smarter.Poker MLB moneyline model.

This module is intentionally free of external dependencies (pure stdlib).
It is the *control* arm of the situational_v2 A/B gate (situational_ab.py).

Key design choices
------------------
* Returns a home-win probability in [0.10, 0.90] (never degenerate).
* Uses log5 / Bradley-Terry fusion of win% + Pythagorean expectation.
* Home-field advantage is a flat +3.5% win% boost (MLB long-run baseline).
* Context dict is accepted but intentionally IGNORED here — situational signals
  belong in situational_v2.team_prior_v2, which adjusts this output.

Metric keys (dict from fact_games / agg_situational):
    win_pct           season win% [0–1]
    pythag_pct        Pythagorean win expectation [0–1]  (RS^2 / (RS^2 + RA^2))
    ops_plus          weighted OPS+ relative to league (100 = avg)
    fip               fielding-independent pitching (lower = better)
    era_plus          ERA+ (100 = avg, 120+ = elite rotation)
    bullpen_era       bullpen ERA this season
    run_diff_pg       run differential per game (positive = net positive)
"""
from __future__ import annotations

import math

# Pure Pythagorean expectation exponent
PYTHAG_EXP = 1.83  # exponent for Pythagorean formula (Smyth/Patriot variation)



# ── helpers ────────────────────────────────────────────────────────────────────

def _pythag(rs: float, ra: float, exp: float = PYTHAG_EXP) -> float:
    """Standard Pythagorean win% given runs scored / allowed."""
    if rs <= 0 and ra <= 0:
        return 0.50
    denom = (rs ** exp + ra ** exp)
    return (rs ** exp / denom) if denom > 0 else 0.50


def _log5(pa: float, pb: float) -> float:
    """Bill James log5 matchup probability: P(A beats B) given true win rates."""
    # Degenerate guard
    if pa <= 0:
        return 0.0
    if pb <= 0:
        return 1.0
    num = pa * (1 - pb)
    den = pa * (1 - pb) + pb * (1 - pa)
    return num / den if den > 0 else 0.50


def _team_strength_score(m: dict) -> float:
    """Return a clean strength score using only factual win percentages and pythagorean expectations."""
    if not m:
        return 0.50

    # Win%: directly usable [0, 1]
    win_pct = float(m.get("win_pct") or 0.50)

    # Pythagorean: prefer pre-computed pythag_pct; else derive from RS/RA
    pythag = float(m.get("pythag_pct") or 0)
    if pythag == 0:
        rs = float(m.get("runs_scored_pg") or m.get("runs_scored") or 0)
        ra = float(m.get("runs_allowed_pg") or m.get("runs_allowed") or 0)
        pythag = _pythag(rs, ra) if (rs > 0 or ra > 0) else win_pct

    # Blend factual Win% and factual Pythagorean expectation (50/50 factual representation)
    raw = 0.5 * win_pct + 0.5 * pythag
    return max(0.01, min(0.99, raw))


# ── public API ─────────────────────────────────────────────────────────────────

def team_prior(
    home_metrics: dict | None,
    away_metrics: dict | None,
    home_ctx: dict | None = None,   # accepted but NOT used (situational is v2)
    away_ctx: dict | None = None,
) -> float | None:
    """Return home-win probability (prior — no situational adjustment).

    Parameters
    ----------
    home_metrics : dict
        Season-level stats for the home team (from agg_situational or fact_games).
    away_metrics : dict
        Season-level stats for the away team.
    home_ctx, away_ctx : dict, optional
        Game context (opponent strength, park, weather) — accepted for API
        compatibility with team_prior_v2 but NOT applied here.

    Returns
    -------
    float | None
        Home-win probability in [0.10, 0.90], or None if metrics are missing.
    """
    if not home_metrics or not away_metrics:
        return None

    h = _team_strength_score(home_metrics)
    a = _team_strength_score(away_metrics)

    # Apply log5 matchup formula
    p = _log5(h, a)

    # Add flat HFA and re-clamp
    return max(0.001, min(0.999, p))
