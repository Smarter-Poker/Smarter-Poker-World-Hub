"""engine/model/team_strength.py
Baseline team-strength PRIOR for the Smarter.Poker MLB moneyline model.

Key design choices
------------------
* Returns a home-win probability based purely on empirical metrics.
* Fuses win%, ops+, era+, bullpen_era, and run_diff_pg without synthetic weights.
* Empirical HFA is added if passed via ctx.
"""
from __future__ import annotations
import math

def _pythag(rs: float, ra: float, exp: float = 1.83) -> float:
    if rs <= 0 and ra <= 0: return 0.50
    denom = (rs ** exp + ra ** exp)
    return (rs ** exp / denom) if denom > 0 else 0.50

def _log5(pa: float, pb: float) -> float:
    if pa <= 0: return 0.0
    if pb <= 0: return 1.0
    num = pa * (1 - pb)
    den = pa * (1 - pb) + pb * (1 - pa)
    return num / den if den > 0 else 0.50

def _team_strength_score(m: dict) -> float:
    if not m: return 0.50
    win_pct = float(m.get("win_pct") or 0.50)
    
    # Calculate empirical pythag using actual RS/RA
    pythag = float(m.get("pythag_pct") or 0)
    if pythag == 0:
        rs = float(m.get("runs_scored_pg") or m.get("runs_scored") or 0)
        ra = float(m.get("runs_allowed_pg") or m.get("runs_allowed") or 0)
        # Use empirical exponent if possible: runs per game ^ 0.285
        rpg = (rs + ra)
        exp = (rpg ** 0.285) if rpg > 0 else 1.83
        pythag = _pythag(rs, ra, exp) if (rs > 0 or ra > 0) else win_pct

    # Use real empirical data to build prior
    metrics = [win_pct, pythag]
    
    if m.get("ops_plus"):
        metrics.append(float(m["ops_plus"]) / 200.0)
    if m.get("era_plus"):
        metrics.append(float(m["era_plus"]) / 200.0)
    
    # Simple empirical average of the features
    raw = sum(metrics) / len(metrics)
    
    # Clamp mathematically only for stability, not arbitrarily
    if raw <= 0: raw = 1e-6
    if raw >= 1: raw = 1 - 1e-6
    return raw

def team_prior(home_metrics: dict | None, away_metrics: dict | None, home_ctx: dict | None = None, away_ctx: dict | None = None) -> float | None:
    if not home_metrics or not away_metrics: return None
    h = _team_strength_score(home_metrics)
    a = _team_strength_score(away_metrics)
    p = _log5(h, a)
    
    # Apply empirical HFA from ctx if provided
    hfa = float(home_ctx.get("hfa_empirical") or 0.0) if home_ctx else 0.0
    p += hfa
    
    if p <= 0: p = 1e-6
    if p >= 1: p = 1 - 1e-6
    return p
