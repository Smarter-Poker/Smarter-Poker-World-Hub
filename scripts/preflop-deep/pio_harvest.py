"""
Harvester for the Smarter-Poker GTO training dataset.

Plugs into the machine's working PioSOLVER UPI transport via a single
`pio(cmd)->str` callable. Owns the parsers + the strategy_matrix_v2 JSON shape
(identical on both machines). build_setup_commands(pot, eff, rake) is
parameterized so each phase (cash vs tournament vs blind depth) sends Pio its own
set_pot / set_eff_stack / set_rake + the matching tree.

strategy_matrix_v2: per-hand action sums == 1; real chip EVs in bb; dead combos null.
Combo order: card=rank*4+suit; combo=b*(b-1)/2+a; 2c2d=0..AhAs=1325.
"""
import json
import tree_gen  # canonical shared geometry (build_lines)

POT_CHIPS = 550
EFF_CHIPS = 9750
CHIPS_PER_BB = 100
GAME_TYPE = "6max_cash"
STACK_BB = 100
GEOMETRY_TAG = "srp_prod_v1"


def build_setup_commands(board, oop_weights, ip_weights, pot=550, eff=9750, rake="0 0 0 0"):
    """UPI commands to configure + build + solve one SRP spot on `board`.
    pot/eff in chips, rake as Pio's set_rake args -> different per cash/MTT/depth."""
    cmds = [
        "set_pot 0 0 %d" % pot,           # machine: use its exact pot/eff command names
        "set_eff_stack %d" % eff,
        "set_board %s" % board,
        "set_range OOP %s" % oop_weights,
        "set_range IP %s" % ip_weights,
        "set_isomorphism 1 0",
        "clear_lines",
    ]
    cmds += ["add_line " + " ".join(str(x) for x in ln) for ln in tree_gen.build_lines(pot, eff)]
    cmds += ["build_tree", "set_rake %s" % rake, "go 0.5", "wait_for_solver"]
    return cmds


def parse_children(raw, parent="r:0"):
    """Ordered action codes among children of `parent`."""
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
        if len(parts) >= 1000:
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
    """Harvest one decision node for `player` (OOP|IP) -> (scenario_hash, strategy_matrix_v2)."""
    codes = parse_children(pio("show_children %s" % node), parent=node)
    freqs = parse_strategy(pio("show_strategy %s" % node), codes)
    hand_ev_chips = parse_ev_array0(pio("calc_ev %s %s" % (player, node)))
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
