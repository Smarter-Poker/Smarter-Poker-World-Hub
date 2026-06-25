import re

with open('/Users/smarter.poker/mlb-analytics-engine/engine/pipeline/daily_predict.py', 'r') as f:
    content = f.read()

# Inside _rateset, add the opponent rates
insertion = """
                _sco = (opp_meta.get("fangraphs_full") or {}).get("quality") or {}
                _opp_rates = opp_meta.get("sim_rates") or {}
                _opp_k = _opp_rates.get("k", 0.22)
                _opp_bb = _opp_rates.get("bb", 0.08)
                _opp_hr = _opp_rates.get("hr", 0.03)
                _opp_babip = _opp_rates.get("babip", 0.30)
"""
content = content.replace('_sco = (opp_meta.get("fangraphs_full") or {}).get("quality") or {}', insertion.strip())

# Replace the hardcoded .get("k", 0.22) with .get("k", _opp_k), etc. inside _rateset ONLY.
# We can just replace the specific lines.
content = content.replace('r["k"] = _clip(r.get("k", 0.22) * (1.0 - _edge * 0.35))', 'r["k"] = _clip(r.get("k", _opp_k) * (1.0 - _edge * 0.35))')
content = content.replace('r["k"] = _clip(r.get("k", 0.22) * (1.0 + (_sw - 0.11) * 0.40))', 'r["k"] = _clip(r.get("k", _opp_k) * (1.0 + (_sw - 0.11) * 0.40))')
content = content.replace('r["bb"] = _clip(r.get("bb", 0.08) * (1.0 + (0.31 - _os) * 0.50))', 'r["bb"] = _clip(r.get("bb", _opp_bb) * (1.0 + (0.31 - _os) * 0.50))')
content = content.replace('r["bb"] = _clip(r.get("bb", 0.08) * (1.0 + (0.61 - _fs) * 0.20))', 'r["bb"] = _clip(r.get("bb", _opp_bb) * (1.0 + (0.61 - _fs) * 0.20))')
content = content.replace('r["bb"] = _clip(r.get("bb", 0.08) * (1.0 + ((_pit / _pa) - 3.9) * 0.05))', 'r["bb"] = _clip(r.get("bb", _opp_bb) * (1.0 + ((_pit / _pa) - 3.9) * 0.05))')
content = content.replace('r["babip"] = _clip(r.get("babip", 0.30) * (1.0 + (_hh - 0.40) * 0.15))', 'r["babip"] = _clip(r.get("babip", _opp_babip) * (1.0 + (_hh - 0.40) * 0.15))')
content = content.replace('r["hr"] = _clip(r.get("hr", 0.03) * (1.0 + (_br - 0.08) * 0.60))', 'r["hr"] = _clip(r.get("hr", _opp_hr) * (1.0 + (_br - 0.08) * 0.60))')
content = content.replace('r["babip"] = _clip(r.get("babip", 0.30) * (1.0 - (_iffb - 0.10) * 0.30 - (_sft - 0.15) * 0.15))', 'r["babip"] = _clip(r.get("babip", _opp_babip) * (1.0 - (_iffb - 0.10) * 0.30 - (_sft - 0.15) * 0.15))')
content = content.replace('r["hr"] = _clip(r.get("hr", 0.03) * max(0.2, min(1.0, 1.0 - (_gb - 0.43) * 0.80)))', 'r["hr"] = _clip(r.get("hr", _opp_hr) * max(0.2, min(1.0, 1.0 - (_gb - 0.43) * 0.80)))')
content = content.replace('r["k"] = _clip(r.get("k", 0.22) * (1.0 - (_zc - 0.85) * 0.50))', 'r["k"] = _clip(r.get("k", _opp_k) * (1.0 - (_zc - 0.85) * 0.50))')
content = content.replace('r["k"] = _clip(r.get("k", 0.22) * (1.0 - _prot))', 'r["k"] = _clip(r.get("k", _opp_k) * (1.0 - _prot))')
content = content.replace('r["bb"] = _clip(r.get("bb", 0.08) * (1.0 + _prot))', 'r["bb"] = _clip(r.get("bb", _opp_bb) * (1.0 + _prot))')
content = content.replace('r["babip"] = _clip(r.get("babip", 0.30) * (1.0 + _prot))', 'r["babip"] = _clip(r.get("babip", _opp_babip) * (1.0 + _prot))')
content = content.replace('r["hr"] = _clip(r.get("hr", 0.03) * (1.0 + _prot))', 'r["hr"] = _clip(r.get("hr", _opp_hr) * (1.0 + _prot))')
content = content.replace('r["k"] = _clip(r.get("k", 0.22) * (1.0 + (_tk - 0.22) * 0.10))', 'r["k"] = _clip(r.get("k", _opp_k) * (1.0 + (_tk - 0.22) * 0.10))')
content = content.replace('r["bb"] = _clip(r.get("bb", 0.08) * (1.0 + (_tbb - 0.085) * 0.10))', 'r["bb"] = _clip(r.get("bb", _opp_bb) * (1.0 + (_tbb - 0.085) * 0.10))')
content = content.replace('r["babip"] = _clip(r.get("babip", 0.30) * max(0.85, min(1.15, 1.0 + (babip_diff * 0.5))))', 'r["babip"] = _clip(r.get("babip", _opp_babip) * max(0.85, min(1.15, 1.0 + (babip_diff * 0.5))))')
content = content.replace('r["hr"] = _clip(r.get("hr", 0.03) * max(0.8, min(1.2, 1.0 + (hr_diff * 0.5))))', 'r["hr"] = _clip(r.get("hr", _opp_hr) * max(0.8, min(1.2, 1.0 + (hr_diff * 0.5))))')
content = content.replace('r["k"] = _clip(r.get("k", 0.22) * 0.98)', 'r["k"] = _clip(r.get("k", _opp_k) * 0.98)')
content = content.replace('r["k"] = _clip(r.get("k", 0.22) * (1.0 - coach_mod))', 'r["k"] = _clip(r.get("k", _opp_k) * (1.0 - coach_mod))')
content = content.replace('r["hr"] = _clip(r.get("hr", 0.03) * (1.0 + coach_mod))', 'r["hr"] = _clip(r.get("hr", _opp_hr) * (1.0 + coach_mod))')
content = content.replace('r["babip"] = _clip(r.get("babip", 0.30) * (1.0 + coach_mod))', 'r["babip"] = _clip(r.get("babip", _opp_babip) * (1.0 + coach_mod))')
content = content.replace('r["hr"] = _clip(r.get("hr", 0.03) * (1.0 + (_xiso - 0.145) * 0.80))', 'r["hr"] = _clip(r.get("hr", _opp_hr) * (1.0 + (_xiso - 0.145) * 0.80))')
content = content.replace('r["hr"] = _clip(r.get("hr", 0.03) * (1.0 + (_sl - 7.0) * 0.03))', 'r["hr"] = _clip(r.get("hr", _opp_hr) * (1.0 + (_sl - 7.0) * 0.03))')
content = content.replace('r["k"] = _clip(r.get("k", 0.22) * (1.0 + (_sl - 7.0) * 0.02))', 'r["k"] = _clip(r.get("k", _opp_k) * (1.0 + (_sl - 7.0) * 0.02))')
content = content.replace('r["babip"] = _clip(r.get("babip", 0.30) * (1.0 + (_su - 0.25) * 0.20))', 'r["babip"] = _clip(r.get("babip", _opp_babip) * (1.0 + (_su - 0.25) * 0.20))')
content = content.replace('r["hr"] = _clip(r.get("hr", 0.03) * (1.0 + (_bspd - 71.5) * 0.01))', 'r["hr"] = _clip(r.get("hr", _opp_hr) * (1.0 + (_bspd - 71.5) * 0.01))')
content = content.replace('r["babip"] = min(max(r.get("babip", 0.3), 0.15), 0.50)', 'r["babip"] = min(max(r.get("babip", _opp_babip), 0.15), 0.50)')


with open('/Users/smarter.poker/mlb-analytics-engine/engine/pipeline/daily_predict.py', 'w') as f:
    f.write(content)
