"""
Harvester for the Smarter-Poker GTO training dataset.

Runs on the Windows solver machines. It plugs into whatever WORKING PioSOLVER
UPI transport the machine already has (Machine 1's or Machine 2's wrapper) via a
single `pio(cmd)->str` callable, so we don't re-solve the transport problem.
This module owns the part that MUST be identical on both machines: the harvest
sequence, the parsers, and the strategy_matrix_v2 JSON shape.

Per solved (matchup x flop) tree it extracts decision nodes (r:0 = OOP flop, and
r:0:c = IP c-bet after check). No full-tree dump -> no print_all_strats crash,
no C++ parser. A few UPI calls, milliseconds each.

strategy_matrix_v2 (clean, self-describing; fixes the two documented corruptions
- per-hand action sums now == 1, and EVs are real chip EVs in bb, not equity):
  {
    node, board, street, hero, position, oop_player, ip_player,
    pot_bb, eff_stack_bb, rake,
    actions:[{code,key,size_pct}],
    frequencies:{code:[1326 floats 0..1]},   # sum across codes == 1 per hand
    hand_evs_bb:[1326],                       # calc_ev Array0 /100
    ev_oop_bb, ev_ip_bb, exploitability_pct,
    combo_order, tree_geometry, solver
  }
Combo order is the verified map (2c2d=0 .. AhAs=1325).
"""
import json
import tree_gen  # canonical shared geometry (build_lines)

POT_CHIPS = 550
EFF_CHIPS = 9750
CHIPS_PER_BB = 100
GAME_TYPE = "6max_cash"
STACK_BB = 100
GEOMETRY_TAG = "srp_prod_v1"


def build_setup_commands(board, oop_weights, ip_weights):
    """UPI commands to configure + build + solve one SRP spot on `board`.
    oop_weights/ip_weights: space-separated 1326-weight strings."""
    cmds = [
        "set_pot 0 0 %d" % POT_CHIPS,     # machine: use its exact pot/eff command names
        "set_eff_stack %d" % EFF_CHIPS,
        "set_board %s" % board,
        "set_range OOP %s" % oop_weights,
        "set_range IP %s" % ip_weights,
        "set_isomorphism 1 0",
        "clear_lines",
    ]
    cmds += ["add_line " + " ".join(str(x) for x in ln) for ln in tree_gen.build_lines()]
    cmds += ["build_tree", "set_rake 0 0 0 0", "go 0.5", "wait_for_solver"]
    return cmds


def parse_children(raw, parent="r:0"):
    """Ordered action codes among children of `parent` (e.g. ['c','b182','b412'])."""
    codes = []
    pref = parent + ":"
    for tok in raw.split():
        if tok.startswith(pref) and tok.count(":") == parent.count(":") + 1:
            codes.append(tok[len(pref):])
    return codes


def parse_strategy(raw, action_codes):
    """show_strategy output -> {code:[1326 floats]} in child order (one line/action)."""
    numeric = []
    for ln in raw.splitlines():
        parts = ln.split()
        if len(parts) >= 1000:  # a 1326-number strategy line
            numeric.append([float(x) for x in parts])
    if len(numeric) != len(action_codes):
        raise ValueError("strategy lines %d != actions %d" % (len(numeric), len(action_codes)))
    return {code: numeric[i] for i, code in enumerate(action_codes)}


def parse_ev_array0(raw):
    """calc_ev output: first long numeric line = per-hand EV (Array 0), in chips."""
    for ln in raw.splitlines():
        parts = ln.split()
        if len(parts) >= 1000:
            return [float(x) for x in parts]
    raise ValueError("no 1326-length EV array found in calc_ev output")


def action_meta(code):
    if code == "c":
        return {"code": "c", "key": "check", "size_pct": 0}
    if code == "f":
        return {"code": "f", "key": "fold", "size_pct": 0}
    if code.startswith("b"):
        chips = int(code[1:])
        return {"code": code, "key": "bet_%d" % round(chips / POT_CHIPS * 100),
                "size_pct": round(chips / POT_CHIPS * 100)}
    return {"code": code, "key": code, "size_pct": None}


def harvest_node(pio, node, player, board, position, oop_player, ip_player,
                 ev_oop_bb, ev_ip_bb, exploit_pct):
    """Harvest one decision node for `player` (OOP|IP) -> (scenario_hash, strategy_matrix_v2).
    node='r:0' player='OOP' -> the OOP (e.g. BB) flop decision.
    node='r:0:c' player='IP' -> the IP (e.g. BTN) c-bet decision after OOP checks.
    Both nodes have pot 550 so bet sizes stay 33%/75%."""
    codes = parse_children(pio("show_children %s" % node), parent=node)
    freqs = parse_strategy(pio("show_strategy %s" % node), codes)
    hand_ev_chips = parse_ev_array0(pio("calc_ev %s %s" % (player, node)))
    # dead combos read nan -> JSON null (Postgres jsonb rejects NaN)
    hand_evs_bb = [None if v != v else round(v / CHIPS_PER_BB, 4) for v in hand_ev_chips]
    sm = {
        "node": node, "board": board, "street": "flop", "hero": player,
        "position": position, "oop_player": oop_player, "ip_player": ip_player,
        "pot_bb": POT_CHIPS / CHIPS_PER_BB, "eff_stack_bb": EFF_CHIPS / CHIPS_PER_BB, "rake": 0,
        "actions": [action_meta(c) for c in codes],
        "frequencies": {c: [round(x, 6) for x in freqs[c]] for c in codes},
        "hand_evs_bb": hand_evs_bb,
        "ev_oop_bb": ev_oop_bb, "ev_ip_bb": ev_ip_bb, "exploitability_pct": exploit_pct,
        "combo_order": "card=rank*4+suit; combo=b*(b-1)/2+a; 2c2d=0..AhAs=1325",
        "tree_geometry": GEOMETRY_TAG, "solver": "PioSOLVER",
    }
    scenario_hash = "%s_%s_%dbb_%s" % (GAME_TYPE, position, STACK_BB, board)
    return scenario_hash, sm


def harvest_root(pio, board, position, oop_player, ip_player, ev_oop_bb, ev_ip_bb, exploit_pct):
    return harvest_node(pio, "r:0", "OOP", board, position, oop_player, ip_player,
                        ev_oop_bb, ev_ip_bb, exploit_pct)


def validate_row(sm):
    """Acceptance gate: per-hand action frequencies must sum to ~1 for live hands."""
    codes = list(sm["frequencies"].keys())
    n = len(sm["frequencies"][codes[0]])
    bad = 0
    live = 0
    for i in range(n):
        s = sum(sm["frequencies"][c][i] for c in codes)
        if s > 0.001:
            live += 1
            if not (0.98 <= s <= 1.02):
                bad += 1
    frac_ok = 1.0 if live == 0 else 1 - bad / live
    return {"live_hands": live, "bad_sum_hands": bad, "frac_ok": round(frac_ok, 4)}
