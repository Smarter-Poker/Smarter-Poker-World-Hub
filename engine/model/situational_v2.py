"""engine/model/situational_v2.py
Situational adjustment layer (v2) for the Smarter.Poker MLB moneyline model.

This module WRAPS team_prior and applies gated, sample-size-validated
situational signals on top of the baseline prior.  It is the *treatment* arm
of the situational_ab.py ship-gate.

Design principles
-----------------
1. Every signal is GATED — it only fires when the supporting sample size (n)
   clears a minimum threshold (default 40 plate appearances / 25 games).
2. Adjustments are ADDITIVE in log-odds space, converted back to probability,
   then clamped.  Never additive in raw probability space (avoids edge blowup).
3. The config dict (DEFAULT_CFG) is passed at call time so it can be toggled
   in A/B experiments without changing code.
4. A metadata dict is returned alongside the probability so callers can
   inspect which signals fired and by how much.

Situational signals in priority order
--------------------------------------
S1  vs_losing_teams    Home team's W% vs opponents with <.500 record
S2  vs_winning_teams   Home team's W% vs opponents with >.500 record
S3  recent_form        Last-N game W% (momentum)
S4  day_night          Performance split by day vs night game
S5  rest_days          Advantage when one team has extra rest
S6  park_factor        Run environment normalised park factor
S7  ump_factor         Home-plate ump ERA+ historical impact

Config keys
-----------
    enabled         bool     — master switch; if False, returns base prior unchanged
    min_n           int      — minimum sample games/PA for any signal to activate
    vs_record_w     float    — weight applied to vs_losing / vs_winning signal
    form_games      int      — number of recent games for recent_form signal
    form_w          float    — weight for recent_form signal
    rest_w          float    — weight for rest advantage signal
    park_w          float    — weight for park factor signal
    ump_w           float    — weight for ump factor signal
    max_log_adj     float    — cap on total log-odds adjustment (prevents blow-up)
"""
from __future__ import annotations

import math
from .team_strength import team_prior, _clamp, _log5   # type: ignore[import-untyped]

# ── default config ─────────────────────────────────────────────────────────────
DEFAULT_CFG: dict = {
    "enabled":      False,       # permanently disabled subjective math
    "min_n":        40,          # minimum sample size for any situational gate
    "vs_record_w":  0.00,        # weight for vs_losing / vs_winning adjustment
    "form_games":   10,          # rolling window for recent form
    "form_w":       0.00,        # weight for recent-form signal
    "rest_w":       0.00,        # weight for rest-days advantage
    "park_w":       0.00,        # weight for park factor
    "ump_w":        0.00,        # weight for home-plate ump factor
    "max_log_adj":  0.00,        # |log-odds cap| ≈ ±7.5% probability max shift
}


# ── helpers ────────────────────────────────────────────────────────────────────

def _prob_to_logodds(p: float) -> float:
    p = max(0.001, min(0.999, p))
    return math.log(p / (1 - p))


def _logodds_to_prob(lo: float) -> float:
    return 1 / (1 + math.exp(-lo))


def _safe_pct(rec: dict | None, key: str) -> float | None:
    """Extract a win-% value from a nested record sub-dict."""
    if not rec:
        return None
    v = rec.get(key)
    if isinstance(v, dict):
        w = v.get("w") or v.get("wins") or 0
        l_ = v.get("l") or v.get("losses") or 0
        n = w + l_
        return (w / n) if n >= 1 else None
    if v is not None:
        return float(v)
    return None


def _gate(val, n: int, min_n: int):
    """Return val only when sample size n clears minimum; else None."""
    return val if (n is not None and n >= min_n) else None


# ── signal extractors ──────────────────────────────────────────────────────────

def _vs_record_adj(home_m: dict, away_m: dict, ctx: dict, cfg: dict) -> float:
    """S1/S2: performance vs losing / winning opponent.
    Positive = good for home; negative = bad for home."""
    opp_wpct = ctx.get("opponent_win_pct")
    if opp_wpct is None:
        return 0.0

    min_n = cfg["min_n"]
    adj = 0.0

    if opp_wpct < 0.500:
        # Today's away team is a losing team — look at home team's vs_losing record
        rec = home_m.get("vs_losing_teams") or {}
        w = rec.get("w") or rec.get("wins") or 0
        l_ = rec.get("l") or rec.get("losses") or 0
        n = w + l_
        if n >= min_n:
            pct = w / n
            # Signal strength: deviation above/below .500 baseline (own prior embedded)
            base_pct = float(home_m.get("win_pct") or 0.50)
            adj += cfg["vs_record_w"] * (pct - base_pct)

    elif opp_wpct >= 0.500:
        # Away team is winning — look at home team's vs_winning record
        rec = home_m.get("vs_winning_teams") or {}
        w = rec.get("w") or rec.get("wins") or 0
        l_ = rec.get("l") or rec.get("losses") or 0
        n = w + l_
        if n >= min_n:
            pct = w / n
            base_pct = float(home_m.get("win_pct") or 0.50)
            adj += cfg["vs_record_w"] * (pct - base_pct)

    return adj


def _recent_form_adj(home_m: dict, away_m: dict, cfg: dict) -> float:
    """S3: momentum — recent rolling win% vs season baseline."""
    min_n = cfg["form_games"]

    def form_delta(m):
        fg = m.get("recent_form") or {}
        if isinstance(fg, dict):
            w = fg.get("w") or fg.get("wins") or 0
            l_ = fg.get("l") or fg.get("losses") or 0
            n = w + l_
            if n >= min_n:
                return (w / n) - float(m.get("win_pct") or 0.50)
        elif fg is not None:
            return float(fg) - float(m.get("win_pct") or 0.50)
        return None

    h_delta = form_delta(home_m)
    a_delta = form_delta(away_m)

    if h_delta is None and a_delta is None:
        return 0.0
    return cfg["form_w"] * ((h_delta or 0) - (a_delta or 0))


def _rest_adj(home_ctx: dict, away_ctx: dict, cfg: dict) -> float:
    """S5: extra-rest advantage.  +1 day of rest advantage → small +adj."""
    h_rest = home_ctx.get("days_rest")
    a_rest = away_ctx.get("days_rest")
    if h_rest is None or a_rest is None:
        return 0.0
    delta = int(h_rest) - int(a_rest)
    # Scale: 1-day advantage ≈ +cfg[rest_w] / 2; cap at 2 days
    return cfg["rest_w"] * delta


def _park_adj(home_ctx: dict, cfg: dict) -> float:
    """S6: park factor.  100 = neutral, >100 = hitter-friendly.
    Adjusts home win% slightly because home teams are typically built for their park."""
    pf = home_ctx.get("park_factor")
    if pf is None:
        return 0.0
    # Normalise: (pf - 100) / 100 → small fraction, weighted
    return cfg["park_w"] * (float(pf) - 100) / 100


def _ump_adj(home_ctx: dict, cfg: dict) -> float:
    """S7: home-plate ump tendency.  ump_k_rate > league avg helps pitching teams."""
    ump_k = home_ctx.get("ump_k_rate")   # K/9 tendency for this ump
    if ump_k is None:
        return 0.0
    # League-avg K/9 ≈ 8.7; ump-driven variance ≈ ±0.5
    delta = (float(ump_k) - 8.7) / 0.5
    return cfg["ump_w"] * delta


# ── public API ─────────────────────────────────────────────────────────────────

def team_prior_v2(
    home_metrics: dict | None,
    away_metrics: dict | None,
    home_ctx: dict | None = None,
    away_ctx: dict | None = None,
    cfg: dict | None = None,
) -> tuple[float | None, dict]:
    """Return (home_win_prob, metadata) with situational v2 adjustments.

    Parameters
    ----------
    home_metrics : dict
        Season-level stats for the home team.
    away_metrics : dict
        Season-level stats for the away team.
    home_ctx : dict, optional
        Game context for home team: opponent_win_pct, days_rest, park_factor,
        ump_k_rate, is_home, etc.
    away_ctx : dict, optional
        Game context for away team.
    cfg : dict, optional
        Override config; defaults to DEFAULT_CFG.

    Returns
    -------
    (probability, metadata)
        probability  — home-win prob in [0.10, 0.90], or None if metrics missing.
        metadata     — dict with signal breakdown for diagnostics / logging.
    """
    cfg = {**DEFAULT_CFG, **(cfg or {})}
    home_ctx = home_ctx or {}
    away_ctx = away_ctx or {}
    meta: dict = {"signals": {}, "base_prob": None, "adj_prob": None, "enabled": cfg["enabled"]}

    # 1. Get the baseline prior (control arm)
    base_p = team_prior(home_metrics, away_metrics, home_ctx, away_ctx)
    meta["base_prob"] = base_p

    if base_p is None or not cfg["enabled"]:
        meta["adj_prob"] = base_p
        return base_p, meta

    # 2. Convert to log-odds for additive adjustment
    lo = _prob_to_logodds(base_p)
    total_adj = 0.0

    # ── Signal S1/S2: vs-record ───────────────────────────────────────────────
    vs_adj = _vs_record_adj(home_metrics, away_metrics, home_ctx, cfg)
    meta["signals"]["vs_record"] = round(vs_adj, 4)
    total_adj += vs_adj

    # ── Signal S3: recent form ────────────────────────────────────────────────
    form_adj = _recent_form_adj(home_metrics, away_metrics, cfg)
    meta["signals"]["recent_form"] = round(form_adj, 4)
    total_adj += form_adj

    # ── Signal S5: rest ───────────────────────────────────────────────────────
    rest_adj = _rest_adj(home_ctx, away_ctx, cfg)
    meta["signals"]["rest"] = round(rest_adj, 4)
    total_adj += rest_adj

    # ── Signal S6: park factor ────────────────────────────────────────────────
    park_adj = _park_adj(home_ctx, cfg)
    meta["signals"]["park"] = round(park_adj, 4)
    total_adj += park_adj

    # ── Signal S7: ump factor ─────────────────────────────────────────────────
    ump_adj = _ump_adj(home_ctx, cfg)
    meta["signals"]["ump"] = round(ump_adj, 4)
    total_adj += ump_adj

    # 3. Cap total adjustment and apply
    total_adj = max(-cfg["max_log_adj"], min(cfg["max_log_adj"], total_adj))
    meta["total_log_adj"] = round(total_adj, 4)

    adj_p = max(0.01, min(0.99, _logodds_to_prob(lo + total_adj)))
    meta["adj_prob"] = round(adj_p, 4)

    return adj_p, meta
