#!/usr/bin/env python3
"""Explicit licensed exact-table reuse acceptance; no gateway or source artifacts."""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import time
from pathlib import Path

from contract import parse_source_combo_order
from pio_upi import (COMBO_CARDS, PioError, PioProcess, PioSetupSession, analyze_node,
                     parse_calc_ev, parse_calc_results, parse_children,
                     parse_strategy, parse_vector, run_icm_activation_self_test,
                     setup_commands)


def fixtures():
    models = {}
    for name, utilities in (("A", (0., 1000., 1750.)), ("B", (0., 500., 1500.))):
        models[name] = {"model_id": name, "oop_stack_chips": 2000,
                        "ip_stack_chips": 2000, "root_pot_chips": 500,
                        "payout_per_chip": 1.,
                        "points": tuple((side, stack, utility)
                                        for side in ("OOP", "IP")
                                        for stack, utility in zip((0, 2000, 4500), utilities))}
    cases = []
    for name, board in (("A", "KsQdJc9h2s"), ("A", "KhQcJd9s2c"),
                        ("B", "KhQcJd9s2c"), ("cash", "KhQcJd9s2c"),
                        ("A", "KhQcJd9s2c")):
        node = f"r:0:c:c:{board[6:8]}:c:c:{board[8:10]}:b250:b750"
        line = analyze_node(node, root_pot_chips=500, effective_stack_chips=2000,
                            preflop_aggressor=0)
        scenario = {"scenario_id": "analytic.icm-session." + name,
                    "game_family": "cash" if name == "cash" else "tourney_icm",
                    "objective": "cash_ev" if name == "cash" else "icm",
                    "utility_context": "cash_ev" if name == "cash" else "icm",
                    "table_size": 6, "pot_type": "srp", "oop_position": "SB",
                    "ip_position": "BB", "depth_bucket": 20, "chips_per_bb": 100,
                    "preflop_aggressor_solver_player": 0,
                    "rake": [.05, 40] if name == "cash" else None,
                    "icm_model_id": None if name == "cash" else name,
                    "pot_chips": 500, "effective_stack_chips": 2000,
                    "flop_board": board[:6], "solve_accuracy": .000001,
                    "tree_lines": [[0, 0, 0, 0, 250, 750, 750]],
                    "conditional_history": {"model": "authored_range_preserving_response",
                                            "target_node": node},
                    "targets": [{"target_id": "analytic.session.response", "node": node,
                                 "board": board, "node_role": line.node_role,
                                 "facing_kind": line.facing_kind,
                                 "facing_size_bucket": line.facing_size_bucket,
                                 "expected_children": ["c", "f"]}]}
        ranges = {side: [0.] * 1326 for side in ("OOP", "IP")}
        hands = {"OOP": (("As", "Ts"), ("7c", "6d")),
                 "IP": (("Kd", "Kh"),) if board.startswith("Ks") else (("Qh", "Qs"),)}
        for side in ranges:
            for hand in hands[side]:
                index = next(i for i, cards in enumerate(COMBO_CARDS) if set(cards) == set(hand))
                ranges[side][index] = 1.
        cases.append((scenario, models.get(name), ranges, node))
    return cases


def snapshot(pio, ranges, node):
    children = parse_children(pio("show_children " + node), node)
    if children != ["c", "f"]:
        raise PioError("native ICM session target choices changed")
    result = {"children": children, "summary": parse_calc_results(pio("calc_results"))}
    for side in ("OOP", "IP"):
        evs, matchups = parse_calc_ev(pio(f"calc_ev {side} {node}"), label="native ICM session")
        actual_range = parse_vector(pio(f"show_range {side} {node}"), allow_nan=False,
                                    label="native ICM session range")
        live = [i for i, weight in enumerate(ranges[side]) if weight > 0]
        if [i for i, weight in enumerate(actual_range) if weight > 0] != live:
            raise PioError("native ICM session changed original range support")
        if any(not math.isfinite(evs[i]) or matchups[i] <= 0 for i in live):
            raise PioError("native ICM session lost finite positive matchup evidence")
        result[side] = {"evs": [evs[i] for i in live],
                        "matchups": [matchups[i] for i in live],
                        "ranges": [actual_range[i] for i in live]}
    strategies = parse_strategy(pio("show_strategy " + node), children)
    live = [i for i, weight in enumerate(ranges["OOP"]) if weight > 0]
    result["strategy"] = {action: [strategies[action][i] for i in live] for action in children}
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--pio-exe", type=Path, required=True)
    parser.add_argument("--solver-sha256", required=True)
    parser.add_argument("--solver-version", required=True)
    parser.add_argument("--hand-order", type=Path, required=True)
    parser.add_argument("--hand-order-sha256", required=True)
    parser.add_argument("--source-receipts", type=Path, required=True)
    args = parser.parse_args()
    digest = lambda path: hashlib.sha256(path.read_bytes()).hexdigest()
    if digest(args.pio_exe) != args.solver_sha256 or digest(args.hand_order) != args.hand_order_sha256:
        raise PioError("native session solver or hand-order identity mismatch")
    names = {"contract.py", "pio_upi.py", "worker.py", "native_icm_session_preflight.py"}
    receipts = json.loads(args.source_receipts.read_text(encoding="utf-8"))
    if not isinstance(receipts, dict) or set(receipts) != names:
        raise PioError("native session requires exact candidate source receipts")
    for name in sorted(names):
        if digest(Path(__file__).resolve().parent / name) != receipts[name]:
            raise PioError("native session candidate source identity mismatch")
    order = parse_source_combo_order(args.hand_order.read_text(encoding="utf-8"))
    results, timings, counts = {}, {}, {}
    for mode in ("cold", "reuse"):
        with PioProcess(args.pio_exe, expected_solver_version=args.solver_version,
                        expected_hand_order=order) as process:
            trace = []
            def command(text):
                trace.append(text)
                return process.command(text)
            pio = PioSetupSession(command) if mode == "reuse" else command
            run_icm_activation_self_test(pio)
            results[mode], timings[mode], counts[mode] = [], [], []
            for scenario, model, ranges, node in fixtures():
                trace.clear()
                start = time.monotonic()
                if mode == "reuse":
                    pio.setup(scenario, ranges["OOP"], ranges["IP"],
                              icm_model=model, manifest_checksum="a" * 64)
                else:
                    for text in setup_commands(scenario, ranges["OOP"], ranges["IP"], icm_model=model):
                        pio(text)
                timings[mode].append(time.monotonic() - start)
                counts[mode].append({"points": sum(c.startswith("set_icm_point ") for c in trace),
                                     "resets": trace.count("reset_icm_tables"),
                                     "activations": sum(c.startswith("set_icm ") for c in trace)})
                results[mode].append(snapshot(pio, ranges, node))
    errors = {"ev": 0., "strategy": 0., "matchups": 0., "ranges": 0.}
    def compare(a, b, key):
        errors[key] = max(errors[key], max(abs(x-y) for x, y in zip(a, b, strict=True)))
    for a, b in zip(results["cold"], results["reuse"], strict=True):
        for side in ("OOP", "IP"):
            compare(a[side]["evs"], b[side]["evs"], "ev")
            compare(a[side]["matchups"], b[side]["matchups"], "matchups")
            compare(a[side]["ranges"], b[side]["ranges"], "ranges")
        for action in a["children"]:
            compare(a["strategy"][action], b["strategy"][action], "strategy")
        for key in ("ev_oop_chips", "ev_ip_chips", "exploitability_chips"):
            compare([a["summary"][key]], [b["summary"][key]], "ev")
    if errors["ev"] > .0005 or errors["strategy"] > .00001 or max(errors["matchups"], errors["ranges"]) > 1e-8:
        raise PioError("native exact-table reuse differs from complete cold setup: " + str(errors))
    if [c["points"] for c in counts["reuse"]] != [6, 0, 6, 0, 6]:
        raise PioError("native exact-table reuse did not upload precisely the required tables")
    if [c["activations"] for c in counts["reuse"]] != [1, 1, 1, 0, 1]:
        raise PioError("native exact-table reuse skipped a per-tree activation")
    if [c["resets"] for c in counts["reuse"]] != [1, 0, 1, 1, 1]:
        raise PioError("native exact-table reuse did not preserve model/cash clearing")
    if max(abs(x-y) for x, y in zip(results["cold"][1]["OOP"]["evs"],
                                   results["cold"][2]["OOP"]["evs"], strict=True)) < 1.:
        raise PioError("native table A/B fixture does not distinguish active utility models")
    print(json.dumps({"contract": "smarter-poker.v31-native-icm-session-preflight.v1",
                      "passed": True, "source_receipts": receipts,
                      "solver_sha256": args.solver_sha256, "max_errors": errors,
                      "command_counts": counts, "solve_setup_seconds": timings,
                      "cases": ["cold-A", "same-A-new-board", "different-B", "cash-rake", "A-after-cash"],
                      "gateway_contacted": False, "source_artifact_written": False}, sort_keys=True))


if __name__ == "__main__":
    main()
