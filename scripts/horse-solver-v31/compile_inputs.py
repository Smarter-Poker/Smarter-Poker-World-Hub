#!/usr/bin/env python3
"""Compile supplied immutable solver inputs; never infer missing spot provenance.

Recipe v1 has ranges [{id,path,checksum,order_path,order_checksum,provenance}]
and models [{model_id,snapshot_path,snapshot_checksum}]. Range provenance names
origin (authored_reviewed or solver_export), source_reference, game_family,
table_size, depth_bucket, pot_type, player_position, action_line and reviewed_by.
Paths are relative to --source-root. Outputs are written into a NEW directory.
ICM is evaluated at every reachable integer stack, preserving the exact source
snapshot and payout units. No network, gateway, solver, or credentials are used.
Payouts are absolute remaining funded places: a sole terminal elimination earns
the place behind all survivors (including guaranteed last-place Spin payouts).
No guaranteed-payout baseline is silently subtracted.
"""
from __future__ import annotations

import argparse
from functools import lru_cache
import hashlib
import json
import math
from pathlib import Path
import re

from contract import (ContractError, ICM_MODEL_CONTRACT, RANGE_BUNDLE_CONTRACT,
                      canonical_hand_order_tokens, load_range_vector,
                      parse_source_combo_order, _json_bytes)

RECIPE_CONTRACT = "smarter-poker.horse-solver-v31-input-recipe.v1"
SNAPSHOT_CONTRACT = "smarter-poker.horse-solver-v31-icm-snapshot.v1"
PROVENANCE_KEYS = {"origin", "source_reference", "game_family", "table_size",
                   "depth_bucket", "pot_type", "player_position", "action_line", "reviewed_by"}


def encoded(value):
    return (json.dumps(value, sort_keys=True, separators=(",", ":"), allow_nan=False) + "\n").encode()


def sha(payload):
    return hashlib.sha256(payload).hexdigest()


def exact(value, keys, label):
    if not isinstance(value, dict) or set(value) != keys:
        raise ContractError(f"{label} has missing or unknown fields")
    return value


def integer(value, label, minimum=0):
    if isinstance(value, bool) or not isinstance(value, int) or value < minimum:
        raise ContractError(f"{label} must be an integer >= {minimum}")
    return value


def identifier(value):
    if not isinstance(value, str) or not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._-]{0,127}", value):
        raise ContractError("input identifier is invalid")
    return value


def source_file(root, relative, checksum):
    if not isinstance(relative, str) or not relative or "\\" in relative:
        raise ContractError("source path must be relative POSIX text")
    parts = relative.split("/")
    if relative.startswith("/") or any(part in ("", ".", "..") for part in parts):
        raise ContractError("source path escapes root")
    path = root.joinpath(*parts)
    if not path.resolve().is_relative_to(root.resolve()):
        raise ContractError("source symlink escapes root")
    payload = path.read_bytes()
    if not isinstance(checksum, str) or not re.fullmatch("[0-9a-f]{64}", checksum) or sha(payload) != checksum:
        raise ContractError("source checksum differs from immutable recipe")
    return path, payload


def exact_icm(stacks, payouts, hero):
    """Malmuth-Harville finish expectation; no independent-opponent rescaling."""
    if stacks[hero] == 0:
        # Only the two solve actors exchange chips, so at most one actor can
        # bust at a terminal outcome. They finish immediately behind every
        # surviving field player and receive that funded place's payout.
        if sum(value == 0 for value in stacks) != 1:
            raise ContractError("simultaneous eliminations require an explicit finish-order model")
        place_index = sum(value > 0 for value in stacks)
        return float(payouts[place_index]) if place_index < len(payouts) else 0.0
    alive = tuple(index for index, value in enumerate(stacks) if value > 0)
    hero_local = alive.index(hero)
    values = tuple(stacks[index] for index in alive)
    prizes = tuple(payouts[:len(alive)])

    @lru_cache(None)
    def expectation(mask):
        rank = len(alive) - mask.bit_count()
        if rank >= len(prizes) or not mask & (1 << hero_local):
            return 0.0
        total = sum(value for index, value in enumerate(values) if mask & (1 << index))
        result = values[hero_local] / total * prizes[rank]
        for index, value in enumerate(values):
            if index != hero_local and mask & (1 << index):
                result += value / total * expectation(mask ^ (1 << index))
        return result

    return expectation((1 << len(alive)) - 1)


def compile_model(model_id, snapshot, source_path, checksum):
    exact(snapshot, {"contract", "utility_unit", "field_stacks_chips", "payouts", "oop_index", "ip_index", "root_pot_chips"}, "snapshot")
    if snapshot["contract"] != SNAPSHOT_CONTRACT or snapshot["utility_unit"] != "payout":
        raise ContractError("snapshot contract or utility unit is invalid")
    stacks, payouts = snapshot["field_stacks_chips"], snapshot["payouts"]
    if not isinstance(stacks, list) or not 2 <= len(stacks) <= 10:
        raise ContractError("exact ICM requires 2..10 live field players")
    stacks = [integer(value, "field stack", 1) for value in stacks]
    if not isinstance(payouts, list) or not 1 <= len(payouts) <= len(stacks):
        raise ContractError("payout count is invalid")
    if any(isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or value < 0 for value in payouts):
        raise ContractError("payout must be finite and nonnegative")
    if sum(payouts) <= 0 or any(a < b for a, b in zip(payouts, payouts[1:])):
        raise ContractError("payouts must descend and have a positive pool")
    oop, ip = integer(snapshot["oop_index"], "OOP index"), integer(snapshot["ip_index"], "IP index")
    if oop == ip or max(oop, ip) >= len(stacks):
        raise ContractError("snapshot actor indexes are invalid")
    pot = integer(snapshot["root_pot_chips"], "root pot", 1)
    effective = min(stacks[oop], stacks[ip])
    pair_total = stacks[oop] + stacks[ip] + pot
    conserved_total = sum(stacks) + pot
    points = []
    for player, hero, other in (("OOP", oop, ip), ("IP", ip, oop)):
        for final_stack in range(stacks[hero] - effective, stacks[hero] + effective + pot + 1):
            terminal = list(stacks)
            terminal[hero], terminal[other] = final_stack, pair_total - final_stack
            if terminal[other] < 0 or sum(terminal) != conserved_total:
                raise ContractError("terminal chip accounting is invalid")
            points.append({"player": player, "stack_chips": final_stack,
                           "utility": exact_icm(terminal, payouts, hero)})
    return {"model_id": model_id, "oop_stack_chips": stacks[oop], "ip_stack_chips": stacks[ip],
            "root_pot_chips": pot, "source_snapshot_path": source_path,
            "source_snapshot_checksum": checksum, "points": points}


def compile_recipe(recipe_path, source_root, output_root):
    recipe_bytes = recipe_path.read_bytes()
    recipe = exact(_json_bytes(recipe_bytes, "input recipe"), {"contract", "ranges", "models"}, "recipe")
    if recipe["contract"] != RECIPE_CONTRACT or not isinstance(recipe["ranges"], list) or not recipe["ranges"] or not isinstance(recipe["models"], list):
        raise ContractError("recipe needs supplied ranges and model array")
    outputs, receipts, range_files, models = {}, [], [], []
    seen = set()
    canonical = {frozenset((token[:2], token[2:])): index for index, token in enumerate(canonical_hand_order_tokens())}
    for item in recipe["ranges"]:
        exact(item, {"id", "path", "checksum", "order_path", "order_checksum", "provenance"}, "range recipe")
        name = identifier(item["id"])
        if name in seen:
            raise ContractError("duplicate range identifier")
        seen.add(name)
        provenance = exact(item["provenance"], PROVENANCE_KEYS, "range provenance")
        if provenance["origin"] not in ("authored_reviewed", "solver_export"):
            raise ContractError("range origin must be explicit")
        for key in ("source_reference", "game_family", "pot_type", "player_position", "action_line", "reviewed_by"):
            if not isinstance(provenance[key], str) or not provenance[key].strip():
                raise ContractError(f"range provenance {key} is missing")
        if provenance["game_family"] not in ("cash", "spin", "tourney_ev", "tourney_icm") or provenance["pot_type"] not in ("limped", "srp", "3bet", "4bet_plus"):
            raise ContractError("range context is unsupported")
        if integer(provenance["table_size"], "table size", 2) > 10 or provenance["depth_bucket"] not in (10, 20, 40, 80, 150):
            raise ContractError("range table/depth is unsupported; do not relabel legacy inputs")
        path, raw = source_file(source_root, item["path"], item["checksum"])
        _, order_bytes = source_file(source_root, item["order_path"], item["order_checksum"])
        order = parse_source_combo_order(order_bytes.decode("utf-8"))
        weights, remapped = load_range_vector(path), [0.0] * 1326
        for token, weight in zip(order, weights):
            remapped[canonical[frozenset((token[:2], token[2:]))]] = weight
        relative = f"ranges/{name}.txt"
        payload = (" ".join(format(value, ".17g") for value in remapped) + "\n").encode()
        outputs[relative] = payload
        outputs[f"sources/ranges/{name}.source"] = raw
        outputs[f"sources/ranges/{name}.order"] = order_bytes
        range_files.append({"path": relative, "checksum": sha(payload)})
        receipts.append({"kind": "range", "id": name, "source_checksum": sha(raw), "source_order_checksum": sha(order_bytes), "output_path": relative, "output_checksum": sha(payload), "provenance": provenance})
    seen = set()
    for item in recipe["models"]:
        exact(item, {"model_id", "snapshot_path", "snapshot_checksum"}, "model recipe")
        name = identifier(item["model_id"])
        if name in seen:
            raise ContractError("duplicate model identifier")
        seen.add(name)
        _, raw = source_file(source_root, item["snapshot_path"], item["snapshot_checksum"])
        relative = f"sources/models/{name}.json"
        snapshot = _json_bytes(raw, "ICM snapshot")
        model = compile_model(name, snapshot, relative, sha(raw))
        outputs[relative] = raw
        models.append(model)
        receipts.append({"kind": "icm", "id": name, "source_path": relative, "source_checksum": sha(raw), "algorithm": "exact_malmuth_harville", "sampling": "every_reachable_integer_stack", "utility_unit": "payout", "conserved_chips": sum(snapshot["field_stacks_chips"]) + snapshot["root_pot_chips"]})
    outputs["ranges/range-bundle.json"] = encoded({"contract": RANGE_BUNDLE_CONTRACT, "files": range_files})
    outputs["inputs/icm-model.json"] = encoded({"contract": ICM_MODEL_CONTRACT, "models": models})
    outputs["sources/input-recipe.json"] = recipe_bytes
    outputs["derivation-receipt.json"] = encoded({"contract": "smarter-poker.horse-solver-v31-input-derivation.v1", "recipe_checksum": sha(recipe_bytes), "approved": False, "derivations": receipts, "files": [{"path": path, "checksum": sha(payload)} for path, payload in sorted(outputs.items())]})
    # Compute and validate everything before claiming the write-once directory.
    output_root.mkdir(parents=True, exist_ok=False)
    for relative, payload in sorted(outputs.items()):
        destination = output_root / relative
        destination.parent.mkdir(parents=True, exist_ok=True)
        with destination.open("xb") as handle:
            handle.write(payload)
    return {"approved": False, "ranges": len(range_files), "models": len(models), "receipt_checksum": sha(outputs["derivation-receipt.json"])}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--recipe", type=Path, required=True)
    parser.add_argument("--source-root", type=Path, required=True)
    parser.add_argument("--output-root", type=Path, required=True)
    args = parser.parse_args()
    try:
        print(json.dumps(compile_recipe(args.recipe, args.source_root, args.output_root), sort_keys=True))
    except (ContractError, OSError, UnicodeError, ValueError) as error:
        parser.exit(1, f"Input compilation refused: {error}\n")


if __name__ == "__main__":
    main()
