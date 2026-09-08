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
import math
import re
import tree_gen  # canonical shared geometry (build_lines)

POT_CHIPS = 550
EFF_CHIPS = 9750
CHIPS_PER_BB = 100
GAME_TYPE = "6max_cash"
STACK_BB = 100
GEOMETRY_TAG = "srp_parameterized_v2"
COMBO_ORDER = "card=rank*4+suit; combo=b*(b-1)/2+a; 2c2d=0..AhAs=1325"
SOURCE_COMBO_ORDER_SCHEMA = "piosolver.show_hand_order.v1"
CARD_PATTERN = re.compile(r"^[2-9TJQKA][cdhs]$")
# Pio NodeID uses bNNN for both opening bets and raises. The decision state,
# not a different token prefix, determines whether an outgoing bNNN is a Bet
# or Raise. rNNN is not a Pio action token.
ACTION_PATTERN = re.compile(r"^b([1-9][0-9]*)$")
RAKE_PATTERN = re.compile(r"^(?:0|1|0\.\d*[1-9]) (?:0|[1-9][0-9]*)$")
STREET_CARD_COUNT = {"flop": 3, "turn": 4, "river": 5}
POSITIONS = {
    "UTG", "UTG+1", "UTG+2", "UTG1", "UTG2", "MP", "MP+1", "MP+2",
    "MP1", "MP2", "LJ", "HJ", "CO", "BTN", "SB", "BB",
}


def canonical_board_cards(board, street=None):
    """Return the one JSON-safe board representation admitted by Training."""
    if isinstance(board, str):
        cards = [board[index:index + 2] for index in range(0, len(board), 2)]
    elif isinstance(board, (list, tuple)):
        cards = list(board)
    else:
        raise ValueError("board must be a compact string or canonical card array")
    expected = STREET_CARD_COUNT.get(street) if street is not None else len(cards)
    if (expected not in STREET_CARD_COUNT.values()
            or len(cards) != expected
            or len(set(cards)) != expected
            or any(not isinstance(card, str) or not CARD_PATTERN.fullmatch(card)
                   for card in cards)):
        raise ValueError("board does not match its canonical street identity")
    return cards


def _combo_cards(index):
    high = int((1 + math.sqrt(1 + 8 * index)) // 2)
    while high * (high - 1) // 2 > index:
        high -= 1
    while (high + 1) * high // 2 <= index:
        high += 1
    low = index - high * (high - 1) // 2
    ranks = "23456789TJQKA"
    suits = "cdhs"
    return (
        ranks[low // 4] + suits[low % 4],
        ranks[high // 4] + suits[high % 4],
    )


def _decision_state_is_legal(sm, board_cards):
    """Mirror the SQL/JS legal-node and outgoing-action admission contract."""
    try:
        root_pot = float(sm["pot_bb"]) * CHIPS_PER_BB
        stack = float(sm["eff_stack_bb"]) * CHIPS_PER_BB
    except (KeyError, TypeError, ValueError):
        return False
    if (not math.isfinite(root_pot) or root_pot <= 0
            or not math.isfinite(stack) or stack <= 0):
        return False
    if (sm.get("hero") not in ("OOP", "IP")
            or sm.get("position") not in POSITIONS
            or sm.get("oop_player") not in POSITIONS
            or sm.get("ip_player") not in POSITIONS
            or sm.get("oop_player") == sm.get("ip_player")
            or sm.get("position") != (sm.get("oop_player")
                                      if sm.get("hero") == "OOP"
                                      else sm.get("ip_player"))):
        return False

    node = sm.get("node")
    if not isinstance(node, str) or len(node) > 4096:
        return False
    parts = node.split(":")
    if (len(parts) < 2 or len(parts) > 64 or parts[:2] != ["r", "0"]
            or any(not part for part in parts)):
        return False

    contributions = [0.0, 0.0]
    street_baseline = 0.0
    actor = 0
    round_state = "open"
    last_full_raise = 0.0
    wager_is_all_in = False
    raise_reopened = True
    runout = []
    for token in parts[2:]:
        if CARD_PATTERN.fullmatch(token):
            if (round_state != "closed"
                    or abs(contributions[0] - contributions[1]) > 0.000001
                    or wager_is_all_in or token in runout):
                return False
            runout.append(token)
            # Pio contribution targets are cumulative across streets. Only the
            # per-street baseline/action state resets when a runout is dealt.
            street_baseline = max(contributions)
            actor = 0
            round_state = "open"
            last_full_raise = 0.0
            wager_is_all_in = False
            raise_reopened = True
            continue
        if token == "c":
            if round_state in ("closed", "all_in_terminal"):
                return False
            target = max(contributions)
            if target < contributions[actor]:
                return False
            contributions[actor] = target
            if round_state == "open":
                round_state = "checked"
            elif round_state == "checked":
                round_state = "closed"
            elif round_state == "facing_wager":
                round_state = "all_in_terminal" if wager_is_all_in else "closed"
            else:
                return False
            actor = 1 - actor
            continue
        aggressive = ACTION_PATTERN.fullmatch(token)
        if not aggressive or round_state in ("closed", "all_in_terminal"):
            return False
        if round_state == "facing_wager" and not raise_reopened:
            return False
        target = int(aggressive.group(1))
        amount_faced = max(contributions)
        raise_size = target - amount_faced
        is_all_in = abs(target - stack) <= 0.000001
        if target <= amount_faced or target > stack:
            return False
        if (round_state != "facing_wager" and raise_size < CHIPS_PER_BB
                and not is_all_in):
            return False
        if (round_state == "facing_wager" and raise_size < last_full_raise
                and not is_all_in):
            return False
        contributions[actor] = target
        actor = 1 - actor
        round_state = "facing_wager"
        wager_is_all_in = is_all_in
        raise_reopened = (not is_all_in or last_full_raise == 0
                          or raise_size >= last_full_raise)
        if not is_all_in or raise_size >= last_full_raise:
            last_full_raise = raise_size

    if round_state in ("closed", "all_in_terminal"):
        return False
    if ("OOP" if actor == 0 else "IP") != sm.get("hero"):
        return False
    maximum_runout = len(board_cards) - STREET_CARD_COUNT["flop"]
    if len(runout) not in (0, maximum_runout):
        return False
    if runout and runout != board_cards[-len(runout):]:
        return False

    actions = sm.get("actions")
    frequencies = sm.get("frequencies")
    if (not isinstance(actions, list) or not 2 <= len(actions) <= 16
            or not isinstance(frequencies, dict)):
        return False
    codes = []
    targets = set()
    for action in actions:
        if not isinstance(action, dict):
            return False
        code = action.get("code")
        if (not isinstance(code, str) or code in codes
                or not (code in ("c", "f") or ACTION_PATTERN.fullmatch(code))
                or not isinstance(action.get("key"), str)
                or not action["key"].strip()):
            return False
        if code in ("c", "f"):
            size_pct = action.get("size_pct")
            if isinstance(size_pct, bool) or not isinstance(size_pct, (int, float)) or size_pct != 0:
                return False
            if code == "f" and round_state != "facing_wager":
                return False
            expected_key = (
                "call" if code == "c" and round_state == "facing_wager"
                else "check" if code == "c"
                else "fold"
            )
            if action.get("key") != expected_key:
                return False
        else:
            aggressive = ACTION_PATTERN.fullmatch(code)
            if not aggressive:
                return False
            if round_state == "facing_wager" and not raise_reopened:
                return False
            target = int(aggressive.group(1))
            size_chips = action.get("size_chips")
            if (isinstance(size_chips, bool) or not isinstance(size_chips, (int, float))
                    or size_chips != target
                    or target <= max(contributions) or target > stack
                    or target <= street_baseline or target in targets
                    or action.get("size_semantics") !=
                    "cumulative_postflop_contribution_target"):
                return False
            actor_increment = target - contributions[actor]
            raise_increment = target - max(contributions)
            if (round_state != "facing_wager" and actor_increment < CHIPS_PER_BB
                    and target != stack):
                return False
            if (round_state == "facing_wager" and raise_increment < last_full_raise
                    and target != stack):
                return False
            expected_key = "%s_chips_%d" % (
                "raise" if round_state == "facing_wager" else "bet", target
            )
            if action.get("key") != expected_key:
                return False
            targets.add(target)
        codes.append(code)
    if "c" not in codes or (round_state == "facing_wager" and "f" not in codes):
        return False
    return set(frequencies) == set(codes)


def _accuracy_fraction_command(value):
    if (isinstance(value, bool) or not isinstance(value, (int, float))
            or not math.isfinite(value) or value <= 0 or value > 0.01):
        raise ValueError("accuracy_fraction must be a finite fraction in (0, 0.01]")
    # UPI is line-oriented. Emit plain decimal text, never exponent notation or
    # a caller-provided string, so accuracy cannot become a second command.
    return ("%.12f" % float(value)).rstrip("0").rstrip(".")


def build_setup_commands(board, oop_weights, ip_weights, pot=550, eff=9750,
                         rake="0 0", accuracy_fraction=0.005):
    """UPI commands to configure + build + solve one SRP spot on `board`.
    pot/eff in chips, rake as Pio's set_rake args -> different per cash/MTT/depth."""
    if not isinstance(rake, str) or not RAKE_PATTERN.fullmatch(rake):
        raise ValueError("rake must be canonical Pio fraction and integer cap")
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
    # Rake is part of the game definition and must be configured before the
    # tree is built. Setting it after build_tree can leave the generated tree
    # carrying the previous/default rake while the exported metadata claims
    # the requested value.
    accuracy_token = _accuracy_fraction_command(accuracy_fraction)
    cmds += [
        "set_rake %s" % rake,
        "build_tree",
        "set_accuracy %s fraction" % accuracy_token,
        "go",
        "wait_for_solver",
    ]
    return cmds


def parse_children(raw, parent="r:0"):
    """Ordered action codes among children of `parent`."""
    codes = []
    pref = parent + ":"
    for tok in raw.split():
        if tok.startswith(pref) and tok.count(":") == parent.count(":") + 1:
            codes.append(tok[len(pref):])
    facing_wager = parent.rsplit(":", 1)[-1].startswith("b")
    if (len(codes) < 2 or len(codes) != len(set(codes))
            or any(code not in ("c", "f") and not ACTION_PATTERN.fullmatch(code)
                   for code in codes)
            or "c" not in codes
            or (facing_wager and "f" not in codes)
            or (not facing_wager and "f" in codes)):
        raise ValueError("decision node must expose at least two unique actions")
    return codes


def parse_strategy(raw, action_codes):
    """show_strategy output -> {code:[1326 floats]} in child order (one line/action)."""
    numeric = []
    for ln in raw.splitlines():
        parts = ln.split()
        if len(parts) >= 1000:
            values = [float(x) for x in parts]
            if (len(values) != 1326
                    or any(not math.isfinite(value) or value < 0 or value > 1
                           for value in values)):
                raise ValueError(
                    "strategy action vector must contain 1326 finite values that are probabilities in [0, 1]"
                )
            numeric.append(values)
    if len(numeric) != len(action_codes):
        raise ValueError("strategy lines %d != actions %d" % (len(numeric), len(action_codes)))
    return {code: numeric[i] for i, code in enumerate(action_codes)}


def parse_ev_array0(raw):
    """calc_ev output: first long numeric line = per-hand EV (Array 0), in chips."""
    for ln in raw.splitlines():
        parts = ln.split()
        if len(parts) >= 1000:
            values = [float(x) for x in parts]
            if len(values) != 1326:
                raise ValueError("EV vector must contain exactly 1326 values")
            if any(not math.isfinite(value) and not math.isnan(value) for value in values):
                raise ValueError("EV vector contains an infinite value")
            return values
    raise ValueError("no 1326-length EV array found in calc_ev output")


def action_meta(code, facing_wager=False):
    if code == "c":
        return {"code": "c", "key": "call" if facing_wager else "check", "size_pct": 0}
    if code == "f":
        return {"code": "f", "key": "fold", "size_pct": 0}
    if code.startswith("b"):
        chips = int(code[1:])
        # Pio's official UPI contract documents NodeID bets/raises as cumulative:
        # https://piosolver.com/docs/upi/ and https://piosolver.com/docs/upi/commands/
        # A UPI b token is the player's cumulative postflop contribution
        # target, including contributions made on prior streets. It is NOT the
        # amount added at this node and it does not reset on a turn/river card.
        # Keep the historical `size_chips` field for wire compatibility, but
        # publish its semantics explicitly. Training replays `node` to derive
        # the actor's increment and the current-street Bet / Raise-To target.
        action_name = "raise" if facing_wager else "bet"
        return {"code": code, "key": "%s_chips_%d" % (action_name, chips),
                "size_chips": chips,
                "size_semantics": "cumulative_postflop_contribution_target",
                "size_pct": None}
    raise ValueError("unsupported Pio decision action %r" % code)


def scenario_hash_for(prefix, game_type, position, stack_bb, board):
    """Build the one canonical row identity used by every harvested street."""
    return "%s%s_%s_%dbb_%s" % (
        prefix, game_type, position, stack_bb, board
    )


def harvest_node(pio, node, player, board, position, oop_player, ip_player,
                 ev_oop_bb, ev_ip_bb, exploitability_chips, pot_chips=POT_CHIPS,
                 eff_chips=EFF_CHIPS, rake="0 0", street=None,
                 game_type=GAME_TYPE, stack_bb=STACK_BB,
                 accuracy_fraction=0.005, source_combo_order_sha256=None,
                 oop_range_checksum=None, ip_range_checksum=None,
                 training_game_contracts_sha256=None):
    """Harvest one decision node for `player` (OOP|IP) -> (scenario_hash, strategy_matrix_v2)."""
    codes = parse_children(pio("show_children %s" % node), parent=node)
    freqs = parse_strategy(pio("show_strategy %s" % node), codes)
    hand_ev_chips = parse_ev_array0(pio("calc_ev %s %s" % (player, node)))
    hand_evs_bb = [None if v != v else round(v / CHIPS_PER_BB, 4) for v in hand_ev_chips]
    raw_cards = canonical_board_cards(board)
    resolved_street = street or {3: "flop", 4: "turn", 5: "river"}.get(len(raw_cards))
    if resolved_street not in ("flop", "turn", "river"):
        raise ValueError("cannot infer street from board %s" % board)
    board_cards = canonical_board_cards(raw_cards, resolved_street)
    board_compact = "".join(board_cards)
    accuracy_value = float(_accuracy_fraction_command(accuracy_fraction))
    if (isinstance(exploitability_chips, bool)
            or not isinstance(exploitability_chips, (int, float))
            or not math.isfinite(exploitability_chips)
            or exploitability_chips < 0):
        raise ValueError("calc_results exploitability must be finite nonnegative chips")
    achieved_fraction = float(exploitability_chips) / float(pot_chips)
    if achieved_fraction > accuracy_value + 0.000000001:
        raise ValueError("solver stopped above its sealed accuracy_fraction")
    if (not isinstance(source_combo_order_sha256, str)
            or not re.fullmatch(r"[0-9a-f]{64}", source_combo_order_sha256)
            or source_combo_order_sha256 == "0" * 64):
        raise ValueError("source Pio show_hand_order checksum is not sealed")
    for label, checksum in (
            ("OOP", oop_range_checksum), ("IP", ip_range_checksum)):
        if (not isinstance(checksum, str)
                or not re.fullmatch(r"[0-9a-f]{64}", checksum)
                or checksum == "0" * 64):
            raise ValueError("%s source range checksum is not sealed" % label)
    if (not isinstance(training_game_contracts_sha256, str)
            or not re.fullmatch(r"[0-9a-f]{64}", training_game_contracts_sha256)
            or training_game_contracts_sha256 == "0" * 64):
        raise ValueError("Training game contract ledger checksum is not sealed")
    sm = {
        "node": node, "board": board_cards, "street": resolved_street, "hero": player,
        "position": position, "oop_player": oop_player, "ip_player": ip_player,
        "pot_bb": pot_chips / CHIPS_PER_BB,
        "eff_stack_bb": eff_chips / CHIPS_PER_BB,
        "rake": rake,
        "actions": [
            action_meta(c, node.rsplit(":", 1)[-1].startswith("b")) for c in codes
        ],
        "frequencies": {c: [round(x, 6) for x in freqs[c]] for c in codes},
        "hand_evs_bb": hand_evs_bb,
        "ev_oop_bb": ev_oop_bb,
        "ev_ip_bb": ev_ip_bb,
        # Compatibility field retained only as a proven conversion. The raw
        # calc_results unit is chips per hand, not a percentage.
        "exploitability_pct": achieved_fraction * 100,
        "convergence": {
            "schema": "piosolver.calc-results.v1",
            "source_command": "calc_results",
            "accuracy_fraction": accuracy_value,
            "starting_pot_chips": pot_chips,
            "achieved_exploitability_chips": float(exploitability_chips),
            "achieved_exploitability_fraction": achieved_fraction,
        },
        "combo_order": COMBO_ORDER,
        "range_combo_order": COMBO_ORDER,
        "oop_range_checksum": oop_range_checksum,
        "ip_range_checksum": ip_range_checksum,
        "source_combo_order_schema": SOURCE_COMBO_ORDER_SCHEMA,
        "source_combo_order_sha256": source_combo_order_sha256,
        "training_game_contracts_sha256": training_game_contracts_sha256,
        "tree_geometry": GEOMETRY_TAG, "solver": "PioSOLVER",
    }
    prefix = "" if resolved_street == "flop" else resolved_street + "_"
    scenario_hash = scenario_hash_for(
        prefix, game_type, position, stack_bb, board_compact
    )
    return scenario_hash, sm


def harvest_root(pio, board, position, oop_player, ip_player, ev_oop_bb, ev_ip_bb,
                 exploitability_chips,
                 pot_chips=POT_CHIPS, eff_chips=EFF_CHIPS, rake="0 0",
                 game_type=GAME_TYPE, stack_bb=STACK_BB, accuracy_fraction=0.005,
                 source_combo_order_sha256=None, oop_range_checksum=None,
                 ip_range_checksum=None, training_game_contracts_sha256=None):
    return harvest_node(pio, "r:0", "OOP", board, position, oop_player, ip_player,
                        ev_oop_bb, ev_ip_bb, exploitability_chips, pot_chips, eff_chips,
                        rake, "flop", game_type, stack_bb, accuracy_fraction,
                        source_combo_order_sha256, oop_range_checksum,
                        ip_range_checksum, training_game_contracts_sha256)


def validate_row(sm, scenario_hash=None, game_type=None, stack_depth=None):
    """Full pre-persistence mirror of the Training catalog admission contract."""
    try:
        street = sm.get("street")
        board = canonical_board_cards(sm.get("board"), street)
        frequencies = sm.get("frequencies")
        codes = list(frequencies.keys()) if isinstance(frequencies, dict) else []
    except (AttributeError, ValueError):
        board = []
        codes = []
        frequencies = {}
    expected_hash = None
    if game_type is not None and stack_depth is not None and board and street:
        prefix = "" if street == "flop" else street + "_"
        expected_hash = scenario_hash_for(
            prefix, game_type, sm.get("position"), stack_depth, "".join(board)
        )
    stack_identity_ok = stack_depth is None
    if isinstance(stack_depth, int) and not isinstance(stack_depth, bool):
        try:
            effective_stack_bb = float(sm.get("eff_stack_bb"))
            stack_identity_ok = (
                math.isfinite(effective_stack_bb)
                and effective_stack_bb > 0
                and effective_stack_bb <= stack_depth
            )
        except (TypeError, ValueError):
            stack_identity_ok = False
    contract_ok = (
        bool(board)
        and isinstance(sm.get("board"), list)
        and sm.get("combo_order") == COMBO_ORDER
        and sm.get("range_combo_order") == COMBO_ORDER
        and isinstance(sm.get("oop_range_checksum"), str)
        and bool(re.fullmatch(r"[0-9a-f]{64}", sm["oop_range_checksum"]))
        and sm["oop_range_checksum"] != "0" * 64
        and isinstance(sm.get("ip_range_checksum"), str)
        and bool(re.fullmatch(r"[0-9a-f]{64}", sm["ip_range_checksum"]))
        and sm["ip_range_checksum"] != "0" * 64
        and sm.get("source_combo_order_schema") == SOURCE_COMBO_ORDER_SCHEMA
        and isinstance(sm.get("source_combo_order_sha256"), str)
        and bool(re.fullmatch(r"[0-9a-f]{64}", sm["source_combo_order_sha256"]))
        and sm["source_combo_order_sha256"] != "0" * 64
        and isinstance(sm.get("training_game_contracts_sha256"), str)
        and bool(re.fullmatch(r"[0-9a-f]{64}", sm["training_game_contracts_sha256"]))
        and sm["training_game_contracts_sha256"] != "0" * 64
        and sm.get("solver") == "PioSOLVER"
        and isinstance(sm.get("rake"), str)
        and bool(RAKE_PATTERN.fullmatch(sm["rake"]))
        and isinstance(sm.get("tree_geometry"), str)
        and bool(re.fullmatch(r"[a-z0-9]+(?:_[a-z0-9]+)*", sm["tree_geometry"]))
        and _decision_state_is_legal(sm, board)
        and (scenario_hash is None or expected_hash == scenario_hash)
        and stack_identity_ok
    )
    if len(codes) < 2 or not contract_ok:
        return {"live_hands": 0, "bad_sum_hands": 0, "frac_ok": 0,
                "missing_live_evs": 0, "contract_ok": False, "ev_ok": False}
    n = len(frequencies[codes[0]]) if isinstance(frequencies.get(codes[0]), list) else 0
    bad = 0
    live = 0
    missing_live_evs = 0
    evs = sm.get("hand_evs_bb")
    strategy_shape_ok = n == 1326 and all(
        isinstance(frequencies.get(code), list)
        and len(frequencies[code]) == n
        for code in codes)
    convergence = sm.get("convergence")
    convergence_ok = False
    if isinstance(convergence, dict):
        try:
            target_fraction = convergence.get("accuracy_fraction")
            starting_pot_chips = convergence.get("starting_pot_chips")
            achieved_chips = convergence.get("achieved_exploitability_chips")
            achieved_fraction = convergence.get("achieved_exploitability_fraction")
            convergence_ok = (
                convergence.get("schema") == "piosolver.calc-results.v1"
                and convergence.get("source_command") == "calc_results"
                and all(
                    isinstance(value, (int, float)) and not isinstance(value, bool)
                    and math.isfinite(value)
                    for value in (
                        target_fraction, starting_pot_chips,
                        achieved_chips, achieved_fraction,
                    )
                )
                and 0 < target_fraction <= 0.01
                and starting_pot_chips > 0
                and abs(starting_pot_chips - float(sm.get("pot_bb")) * CHIPS_PER_BB)
                    <= 0.000001
                and achieved_chips >= 0
                and achieved_fraction >= 0
                and abs(achieved_fraction - achieved_chips / starting_pot_chips)
                    <= 0.000000001
                and achieved_fraction <= target_fraction + 0.000000001
                and abs(float(sm.get("exploitability_pct")) - achieved_fraction * 100)
                    <= 0.0000001
            )
        except (TypeError, ValueError, ZeroDivisionError):
            convergence_ok = False
    summary_ev_ok = all(
        isinstance(sm.get(field), (int, float))
        and not isinstance(sm.get(field), bool)
        and math.isfinite(sm[field])
        for field in ("ev_oop_bb", "ev_ip_bb", "exploitability_pct")) \
        and sm["exploitability_pct"] >= 0 and convergence_ok
    ev_shape_ok = isinstance(evs, list) and len(evs) == n
    if not strategy_shape_ok:
        return {"live_hands": 0, "bad_sum_hands": 0, "frac_ok": 0,
                "missing_live_evs": 0, "contract_ok": contract_ok, "ev_ok": False}
    strategy_values_ok = all(
        isinstance(value, (int, float))
        and not isinstance(value, bool)
        and math.isfinite(value)
        and 0 <= value <= 1
        for code in codes
        for value in frequencies[code]
    )
    if not strategy_values_ok:
        return {"live_hands": 0, "bad_sum_hands": 1, "frac_ok": 0,
                "missing_live_evs": 0, "contract_ok": contract_ok, "ev_ok": False}
    board_set = set(board)
    for i in range(n):
        s = sum(frequencies[c][i] for c in codes)
        low_card, high_card = _combo_cards(i)
        if (low_card in board_set or high_card in board_set) and s != 0:
            bad += 1
            continue
        if s > 0.001:
            live += 1
            if not (0.99999 <= s <= 1.00001):
                bad += 1
            if (not ev_shape_ok or not isinstance(evs[i], (int, float))
                    or not math.isfinite(evs[i])):
                missing_live_evs += 1
    frac_ok = 1.0 if live == 0 else 1 - bad / live
    return {
        "live_hands": live,
        "bad_sum_hands": bad,
        "frac_ok": round(frac_ok, 4),
        "missing_live_evs": missing_live_evs,
        "contract_ok": contract_ok,
        "ev_ok": (contract_ok and strategy_shape_ok and strategy_values_ok and summary_ev_ok
                  and ev_shape_ok and missing_live_evs == 0 and bad == 0 and live > 0),
    }
