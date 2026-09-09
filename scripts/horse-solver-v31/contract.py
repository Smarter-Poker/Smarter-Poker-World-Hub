"""Fail-closed manifest and input validation for the certified V31 solver farm."""

from __future__ import annotations

import hashlib
import json
import math
import re
import uuid as uuidlib
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Iterable


MANIFEST_CONTRACT = "smarter-poker.horse-solver-v31-manifest.v1"
RANGE_BUNDLE_CONTRACT = "smarter-poker.horse-solver-v31-range-bundle.v1"
ICM_MODEL_CONTRACT = "smarter-poker.horse-solver-v31-icm-model.v1"
INPUT_BUNDLE_CONTRACT = "smarter-poker.horse-solver-v31-input-bundle.v2"
COMBO_ORDER = "card=rank*4+suit; combo=b*(b-1)/2+a; 2c2d=0..AhAs=1325"
HEX40 = re.compile(r"^[0-9a-f]{40}$")
HEX64 = re.compile(r"^[0-9a-f]{64}$")
UUID = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"
)
SAFE_ID = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_.:-]{1,159}$")
DATASET_KEY = re.compile(r"^[a-z0-9][a-z0-9._:-]{2,127}$")
SAFE_PATH = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._/-]{1,255}$")
CARD = re.compile(r"^[2-9TJQKA][cdhs]$")
NODE = re.compile(r"^r:0(?::(?:c|f|b[1-9][0-9]*|[2-9TJQKA][cdhs]))*$")
ACTION = re.compile(r"^(?:c|f|b[1-9][0-9]*)$")
BUNDLE_VERSION = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$")
REQUIRED_PIPELINE_FILES = frozenset(
    {
        "scripts/horse-solver-v31/contract.py",
        "scripts/horse-solver-v31/gateway.py",
        "scripts/horse-solver-v31/pio_upi.py",
        "scripts/horse-solver-v31/prepare_bundle.py",
        "scripts/horse-solver-v31/worker.py",
        "scripts/horse-solver-v31/compactor.py",
    }
)

ROOT_KEYS = {
    "contract",
    "enabled",
    "dataset_key",
    "manifest_version",
    "pipeline_commit",
    "pipeline_bundle_checksum",
    "pipeline_files",
    "solver_version",
    "solver_binary_checksum",
    "range_bundle_path",
    "range_bundle_checksum",
    "source_combo_order_path",
    "source_combo_order_checksum",
    "icm_model_path",
    "icm_model_checksum",
    "input_bundle_id",
    "input_bundle_checksum",
    "quality_gates",
    "self_test",
    "scenarios",
}
FILE_KEYS = {"path", "checksum"}
SCENARIO_KEYS = {
    "scenario_id",
    "game_family",
    "objective",
    "utility_context",
    "table_size",
    "pot_type",
    "oop_position",
    "ip_position",
    "depth_bucket",
    "preflop_aggressor_solver_player",
    "flop_board",
    "pot_chips",
    "effective_stack_chips",
    "chips_per_bb",
    "rake",
    "icm_model_id",
    "oop_range_path",
    "oop_range_checksum",
    "ip_range_path",
    "ip_range_checksum",
    "tree_lines",
    "solve_accuracy",
    "targets",
}
ICM_ROOT_KEYS = {"contract", "models"}
ICM_MODEL_KEYS = {"model_id", "oop_stack_chips", "ip_stack_chips", "points"}
ICM_POINT_KEYS = {"player", "stack_chips", "utility"}
TARGET_KEYS = {
    "target_id",
    "machine_id",
    "node",
    "board",
    "node_role",
    "facing_kind",
    "facing_size_bucket",
    "expected_children",
}
SELF_TEST_KEYS = {
    "scenario_id",
    "node",
    "solver_player",
    "expected_children",
    "weighted_policy_ev_min_bb",
    "weighted_policy_ev_max_bb",
    "max_exploitability_pct",
}
POSITIONS_BY_TABLE = {
    2: {"SB", "BB"},
    3: {"SB", "BB", "BTN"},
    4: {"SB", "BB", "CO", "BTN"},
    5: {"SB", "BB", "HJ", "CO", "BTN"},
    6: {"SB", "BB", "UTG", "HJ", "CO", "BTN"},
    7: {"SB", "BB", "UTG", "MP", "HJ", "CO", "BTN"},
    8: {"SB", "BB", "UTG", "UTG1", "MP", "HJ", "CO", "BTN"},
    9: {"SB", "BB", "UTG", "UTG1", "UTG2", "MP", "HJ", "CO", "BTN"},
    10: {"SB", "BB", "UTG", "UTG1", "UTG2", "UTG3", "MP", "HJ", "CO", "BTN"},
}


class ContractError(ValueError):
    """The approved manifest or one of its pinned files is not trustworthy."""


def _reject_duplicate_keys(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    result: dict[str, Any] = {}
    for key, value in pairs:
        if key in result:
            raise ContractError(f"duplicate JSON key: {key}")
        result[key] = value
    return result


def _json_bytes(payload: bytes, label: str) -> Any:
    try:
        return json.loads(payload.decode("utf-8"), object_pairs_hook=_reject_duplicate_keys)
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise ContractError(f"{label} is not strict UTF-8 JSON") from error


def _exact_keys(value: Any, expected: set[str], label: str) -> dict[str, Any]:
    if not isinstance(value, dict) or set(value) != expected:
        raise ContractError(f"{label} must contain exactly: {','.join(sorted(expected))}")
    return value


def _nonzero_hex(value: Any, length: int, label: str) -> str:
    text = str(value or "")
    pattern = HEX40 if length == 40 else HEX64
    if not pattern.fullmatch(text) or text == "0" * length:
        raise ContractError(f"{label} must be a nonzero lowercase SHA-{length * 4}")
    return text


def _canonical_identity_text(value: Any, max_length: int, label: str) -> str:
    if (
        not isinstance(value, str)
        or not value
        or value != value.strip()
        or len(value) > max_length
        or any(ord(character) < 32 or ord(character) == 127 for character in value)
    ):
        raise ContractError(f"{label} must be canonical printable text")
    return value


def _safe_relative_path(value: Any, label: str) -> str:
    text = str(value or "")
    if (
        not SAFE_PATH.fullmatch(text)
        or text.startswith("/")
        or "\\" in text
        or ".." in text
        or any(part in ("", ".", "..") for part in text.split("/"))
    ):
        raise ContractError(f"{label} must be a canonical relative path")
    return text


def _under(root: Path, relative: str) -> Path:
    root = root.resolve()
    candidate = (root / relative).resolve()
    if candidate == root or root not in candidate.parents:
        raise ContractError(f"path escapes approved root: {relative}")
    return candidate


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    try:
        with path.open("rb") as source:
            for chunk in iter(lambda: source.read(1024 * 1024), b""):
                digest.update(chunk)
    except OSError as error:
        raise ContractError(f"cannot read pinned file: {path}") from error
    return digest.hexdigest()


def _verify_file(root: Path, relative: str, checksum: str) -> Path:
    path = _under(root, relative)
    actual = sha256_file(path)
    if actual != checksum:
        raise ContractError(f"checksum mismatch for {relative}: {actual}")
    return path


def pipeline_bundle_checksum(root: Path, receipts: Iterable[dict[str, str]]) -> str:
    digest = hashlib.sha256()
    seen: set[str] = set()
    normalized = []
    for index, receipt in enumerate(receipts):
        item = _exact_keys(receipt, FILE_KEYS, f"pipeline_files[{index}]")
        relative = _safe_relative_path(item["path"], f"pipeline_files[{index}].path")
        checksum = _nonzero_hex(item["checksum"], 64, f"pipeline_files[{index}].checksum")
        if relative in seen:
            raise ContractError(f"duplicate pipeline file: {relative}")
        seen.add(relative)
        normalized.append((relative, checksum))
    if not normalized:
        raise ContractError("pipeline_files cannot be empty")
    if seen != REQUIRED_PIPELINE_FILES:
        missing = ",".join(sorted(REQUIRED_PIPELINE_FILES - seen)) or "none"
        extra = ",".join(sorted(seen - REQUIRED_PIPELINE_FILES)) or "none"
        raise ContractError(
            f"pipeline_files must be the complete V31 executable set; missing={missing}; extra={extra}"
        )
    for relative, checksum in sorted(normalized):
        path = _verify_file(root, relative, checksum)
        payload = path.read_bytes()
        digest.update(relative.encode("utf-8") + b"\0" + payload + b"\0")
    return digest.hexdigest()


def _canonical_json_bytes(value: Any) -> bytes:
    try:
        return json.dumps(
            value,
            ensure_ascii=False,
            allow_nan=False,
            separators=(",", ":"),
            sort_keys=True,
        ).encode("utf-8")
    except (TypeError, ValueError, OverflowError) as error:
        raise ContractError("V31 input identity is not canonical JSON") from error


def input_bundle_identity(p_bundle: Any) -> dict[str, Any]:
    """Return the manifest-independent identity approved by PostgreSQL.

    The final scenario manifest must carry this identity's checksum and UUID,
    so its own receipt cannot participate in the identity hash. PostgreSQL
    separately requires that exact manifest receipt during dataset registration.
    """

    bundle = _exact_keys(
        p_bundle,
        {
            "bundle_key",
            "bundle_version",
            "range_bundle_checksum",
            "source_combo_order_checksum",
            "icm_model_checksum",
            "files",
            "approval_note",
        },
        "input approval bundle",
    )
    bundle_key = str(bundle["bundle_key"] or "")
    if not DATASET_KEY.fullmatch(bundle_key):
        raise ContractError("input approval bundle_key is invalid")
    bundle_version = str(bundle["bundle_version"] or "")
    if not BUNDLE_VERSION.fullmatch(bundle_version):
        raise ContractError("input approval bundle_version is invalid")
    range_checksum = _nonzero_hex(
        bundle["range_bundle_checksum"], 64, "input approval range_bundle_checksum"
    )
    combo_checksum = _nonzero_hex(
        bundle["source_combo_order_checksum"],
        64,
        "input approval source_combo_order_checksum",
    )
    icm_checksum = _nonzero_hex(
        bundle["icm_model_checksum"], 64, "input approval icm_model_checksum"
    )
    note = bundle["approval_note"]
    if not isinstance(note, str) or not note.strip() or len(note) > 2000:
        raise ContractError("input approval note is invalid")
    receipts = bundle["files"]
    if not isinstance(receipts, list) or not receipts:
        raise ContractError("input approval files cannot be empty")

    allowed_kinds = {
        "range",
        "combo_order",
        "icm_model",
        "payout_model",
        "scenario_manifest",
    }
    seen_paths: set[str] = set()
    normalized: list[dict[str, str]] = []
    for index, raw in enumerate(receipts):
        item = _exact_keys(raw, {"kind", "path", "checksum"}, f"input approval files[{index}]")
        kind = str(item["kind"] or "")
        if kind not in allowed_kinds:
            raise ContractError(f"input approval files[{index}].kind is invalid")
        path = _safe_relative_path(item["path"], f"input approval files[{index}].path")
        checksum = _nonzero_hex(
            item["checksum"], 64, f"input approval files[{index}].checksum"
        )
        if path in seen_paths:
            raise ContractError(f"input approval repeats file path: {path}")
        seen_paths.add(path)
        normalized.append({"kind": kind, "path": path, "checksum": checksum})

    expected = {
        "range": range_checksum,
        "combo_order": combo_checksum,
        "icm_model": icm_checksum,
    }
    for kind, checksum in expected.items():
        if sum(item["kind"] == kind for item in normalized) != 1:
            raise ContractError(f"input approval must bind exactly one {kind} receipt")
        matches = [
            item
            for item in normalized
            if item["kind"] == kind and item["checksum"] == checksum
        ]
        if len(matches) != 1:
            raise ContractError(f"input approval does not bind exactly one {kind} receipt")
    if sum(item["kind"] == "scenario_manifest" for item in normalized) != 1:
        raise ContractError("input approval must bind exactly one scenario_manifest receipt")

    identity_files = sorted(
        (item for item in normalized if item["kind"] != "scenario_manifest"),
        key=lambda item: (item["kind"], item["path"], item["checksum"]),
    )
    if not identity_files:
        raise ContractError("input approval has no immutable input receipts")
    return {
        "contract": INPUT_BUNDLE_CONTRACT,
        "bundle_key": bundle_key,
        "bundle_version": bundle_version,
        "range_bundle_checksum": range_checksum,
        "source_combo_order_checksum": combo_checksum,
        "icm_model_checksum": icm_checksum,
        "files": identity_files,
    }


def input_bundle_checksum(p_bundle: Any) -> str:
    return hashlib.sha256(_canonical_json_bytes(input_bundle_identity(p_bundle))).hexdigest()


def input_bundle_id(p_bundle_checksum: str) -> str:
    checksum = _nonzero_hex(p_bundle_checksum, 64, "input bundle checksum")
    value = list(checksum[:32])
    value[12] = "5"
    value[16] = "8"
    return str(uuidlib.UUID(hex="".join(value)))


def _cards(board: Any, minimum: int, maximum: int, label: str) -> list[str]:
    text = str(board or "")
    cards = [text[index : index + 2] for index in range(0, len(text), 2)]
    if (
        len(text) % 2
        or not minimum <= len(cards) <= maximum
        or len(set(cards)) != len(cards)
        or any(not CARD.fullmatch(card) for card in cards)
    ):
        raise ContractError(f"{label} is not a unique canonical board")
    return cards


def _finite_number(value: Any, label: str, minimum: float | None = None) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ContractError(f"{label} must be numeric")
    result = float(value)
    if not math.isfinite(result) or (minimum is not None and result < minimum):
        raise ContractError(f"{label} is outside its allowed range")
    return result


def load_range_vector(path: Path) -> list[float]:
    payload = path.read_text(encoding="utf-8").strip()
    try:
        decoded = json.loads(payload)
        values = decoded if isinstance(decoded, list) else None
    except json.JSONDecodeError:
        values = None
    if values is None:
        values = payload.split()
    try:
        result = [float(value) for value in values]
    except (TypeError, ValueError) as error:
        raise ContractError(f"range contains a nonnumeric value: {path}") from error
    if (
        len(result) != 1326
        or not any(value > 0 for value in result)
        or any(not math.isfinite(value) or value < 0 or value > 1 for value in result)
    ):
        raise ContractError(f"range must contain 1,326 finite weights in [0,1]: {path}")
    return result


def canonical_hand_order_tokens() -> tuple[str, ...]:
    """The canonical artifact order, expressed as one token per combo.

    Pio's live order is separately pinned and may differ.  This helper exists
    for fixtures and for proving that a supplied Pio order covers the same
    complete set of unordered two-card combinations.
    """

    deck = [rank + suit for rank in "23456789TJQKA" for suit in "cdhs"]
    return tuple(
        deck[low] + deck[high]
        for high in range(1, len(deck))
        for low in range(high)
    )


def parse_source_combo_order(payload: str) -> tuple[str, ...]:
    """Validate the exact 1,326-token order reported by ``show_hand_order``."""

    tokens = tuple(payload.split())
    if len(tokens) != 1326:
        raise ContractError("source combo-order file must contain exactly 1,326 hands")
    ranks = "23456789TJQKA"
    suits = "cdhs"
    seen: set[int] = set()
    for token in tokens:
        if (
            len(token) != 4
            or token[0] not in ranks
            or token[1] not in suits
            or token[2] not in ranks
            or token[3] not in suits
        ):
            raise ContractError("source combo-order file contains a malformed hand")
        first = ranks.index(token[0]) * 4 + suits.index(token[1])
        second = ranks.index(token[2]) * 4 + suits.index(token[3])
        if first == second:
            raise ContractError("source combo-order file contains a duplicate-card hand")
        low, high = sorted((first, second))
        canonical_index = high * (high - 1) // 2 + low
        if canonical_index in seen:
            raise ContractError("source combo-order file repeats a combination")
        seen.add(canonical_index)
    if seen != set(range(1326)):
        raise ContractError("source combo-order file omits a canonical combination")
    return tokens


def _positive_integer(value: Any, label: str, *, allow_zero: bool = False) -> int:
    if isinstance(value, bool) or not isinstance(value, int):
        raise ContractError(f"{label} must be an integer")
    if value < 0 or (not allow_zero and value == 0):
        raise ContractError(f"{label} is outside its allowed range")
    return value


def _icm_models(input_root: Path, manifest: dict[str, Any]) -> dict[str, dict[str, Any]]:
    """Load the byte-pinned ICM interpolation tables that actually drive Pio.

    The old manifest only hashed an opaque file while scenarios supplied an
    unrelated free-form command.  This contract makes every ICM scenario name
    a reviewed model whose complete stack/value table is converted to UPI by
    the worker.
    """

    relative = _safe_relative_path(manifest["icm_model_path"], "icm_model_path")
    checksum = _nonzero_hex(manifest["icm_model_checksum"], 64, "icm_model_checksum")
    model_path = _verify_file(input_root, relative, checksum)
    root = _exact_keys(
        _json_bytes(model_path.read_bytes(), "ICM model bundle"),
        ICM_ROOT_KEYS,
        "ICM model bundle",
    )
    if root["contract"] != ICM_MODEL_CONTRACT or not isinstance(root["models"], list):
        raise ContractError("ICM model bundle contract is invalid")
    models: dict[str, dict[str, Any]] = {}
    for model_index, raw_model in enumerate(root["models"]):
        model = _exact_keys(raw_model, ICM_MODEL_KEYS, f"ICM models[{model_index}]")
        model_id = str(model["model_id"] or "")
        if not SAFE_ID.fullmatch(model_id) or model_id in models:
            raise ContractError(f"ICM models[{model_index}].model_id is invalid or duplicate")
        oop_stack = _positive_integer(
            model["oop_stack_chips"], f"ICM models[{model_index}].oop_stack_chips"
        )
        ip_stack = _positive_integer(
            model["ip_stack_chips"], f"ICM models[{model_index}].ip_stack_chips"
        )
        points = model["points"]
        if not isinstance(points, list):
            raise ContractError(f"ICM models[{model_index}].points must be an array")
        by_player: dict[str, list[tuple[int, float]]] = {"OOP": [], "IP": []}
        seen_points: set[tuple[str, int]] = set()
        for point_index, raw_point in enumerate(points):
            point = _exact_keys(
                raw_point,
                ICM_POINT_KEYS,
                f"ICM models[{model_index}].points[{point_index}]",
            )
            player = point["player"]
            if player not in ("OOP", "IP"):
                raise ContractError("ICM point player must be OOP or IP")
            stack = _positive_integer(
                point["stack_chips"],
                f"ICM models[{model_index}].points[{point_index}].stack_chips",
                allow_zero=True,
            )
            utility = _finite_number(
                point["utility"],
                f"ICM models[{model_index}].points[{point_index}].utility",
                0,
            )
            identity = (player, stack)
            if identity in seen_points:
                raise ContractError("ICM model repeats a player/stack point")
            seen_points.add(identity)
            by_player[player].append((stack, utility))
        effective = min(oop_stack, ip_stack)
        for player, starting_stack in (("OOP", oop_stack), ("IP", ip_stack)):
            ordered = sorted(by_player[player])
            if len(ordered) < 2:
                raise ContractError(f"ICM model {model_id} needs at least two {player} points")
            if ordered[0][0] > starting_stack - effective or ordered[-1][0] < starting_stack + effective:
                raise ContractError(f"ICM model {model_id} does not cover every reachable {player} stack")
            if any(
                later[1] <= earlier[1]
                for earlier, later in zip(ordered, ordered[1:])
            ):
                raise ContractError(f"ICM model {model_id} utility must rise with {player} stack")
            by_player[player] = ordered
        models[model_id] = {
            "model_id": model_id,
            "oop_stack_chips": oop_stack,
            "ip_stack_chips": ip_stack,
            "points": tuple(
                (player, stack, utility)
                for player in ("OOP", "IP")
                for stack, utility in by_player[player]
            ),
        }
    return models


def _range_bundle(input_root: Path, manifest: dict[str, Any]) -> dict[str, str]:
    relative = _safe_relative_path(manifest["range_bundle_path"], "range_bundle_path")
    checksum = _nonzero_hex(manifest["range_bundle_checksum"], 64, "range_bundle_checksum")
    bundle_path = _verify_file(input_root, relative, checksum)
    bundle = _exact_keys(
        _json_bytes(bundle_path.read_bytes(), "range bundle"),
        {"contract", "files"},
        "range bundle",
    )
    if bundle["contract"] != RANGE_BUNDLE_CONTRACT or not isinstance(bundle["files"], list):
        raise ContractError("range bundle contract is invalid")
    receipts: dict[str, str] = {}
    for index, raw in enumerate(bundle["files"]):
        item = _exact_keys(raw, FILE_KEYS, f"range bundle files[{index}]")
        path = _safe_relative_path(item["path"], f"range bundle files[{index}].path")
        file_checksum = _nonzero_hex(item["checksum"], 64, f"range bundle files[{index}].checksum")
        if path in receipts:
            raise ContractError(f"duplicate range bundle path: {path}")
        _verify_file(input_root, path, file_checksum)
        receipts[path] = file_checksum
    if not receipts:
        raise ContractError("range bundle has no range files")
    return receipts


def _validate_quality_gates(value: Any) -> None:
    gates = _exact_keys(
        value,
        {
            "max_frequency_mae",
            "max_sizing_mae",
            "max_policy_ev_mae_bb",
            "max_action_regret_bb",
            "min_regret_coverage",
        },
        "quality_gates",
    )
    bounds = {
        "max_frequency_mae": (0, 0.15),
        "max_sizing_mae": (0, 0.25),
        "max_policy_ev_mae_bb": (0, 0.5),
        "max_action_regret_bb": (0, 0.25),
        "min_regret_coverage": (0.5, 1),
    }
    for key, (lower, upper) in bounds.items():
        number = _finite_number(gates[key], f"quality_gates.{key}")
        if not lower <= number <= upper:
            raise ContractError(f"quality_gates.{key} is outside [{lower},{upper}]")


def _validate_target(raw: Any, scenario: dict[str, Any], index: int) -> dict[str, Any]:
    target = _exact_keys(raw, TARGET_KEYS, f"target[{index}]")
    if not SAFE_ID.fullmatch(str(target["target_id"] or "")):
        raise ContractError(f"target[{index}].target_id is invalid")
    if target["machine_id"] not in ("M1", "M2"):
        raise ContractError(f"target[{index}].machine_id must be M1 or M2")
    node = str(target["node"] or "")
    if not NODE.fullmatch(node) or ":f" in node:
        raise ContractError(f"target[{index}].node is not a decision-node path")
    root_cards = _cards(scenario["flop_board"], 3, 3, "scenario.flop_board")
    board_cards = _cards(target["board"], 3, 5, f"target[{index}].board")
    node_cards = [token for token in node.split(":") if CARD.fullmatch(token)]
    if board_cards != root_cards + node_cards:
        raise ContractError(f"target[{index}] board does not match its Pio path")
    role = target["node_role"]
    facing = target["facing_kind"]
    bucket = target["facing_size_bucket"]
    open_roles = {"open", "cbet", "probe", "delayed_cbet", "barrel"}
    response_roles = {"facing_bet", "facing_raise", "check_raise", "bet_raise", "all_in"}
    if role not in open_roles | response_roles:
        raise ContractError(f"target[{index}] node role is invalid")
    coherent = (
        (role in open_roles and facing == "none" and bucket == "none")
        or (role == "all_in" and facing == "all_in" and bucket == "all_in")
        or (role == "facing_bet" and facing == "bet" and bucket in {"small", "mid", "big"})
        or (
            role in {"facing_raise", "check_raise", "bet_raise"}
            and facing == "raise"
            and bucket in {"small", "mid", "big"}
        )
    )
    if not coherent:
        raise ContractError(f"target[{index}] role, facing kind, and size bucket disagree")
    children = target["expected_children"]
    if (
        not isinstance(children, list)
        or len(children) < 2
        or len(children) != len(set(children))
        or any(not ACTION.fullmatch(str(action)) for action in children)
    ):
        raise ContractError(f"target[{index}].expected_children is invalid")
    return target


def _validate_scenario(
    raw: Any,
    index: int,
    input_root: Path,
    range_receipts: dict[str, str],
    icm_models: dict[str, dict[str, Any]],
    verify_inputs: bool,
) -> dict[str, Any]:
    scenario = _exact_keys(raw, SCENARIO_KEYS, f"scenarios[{index}]")
    scenario_id = str(scenario["scenario_id"] or "")
    if not SAFE_ID.fullmatch(scenario_id):
        raise ContractError(f"scenarios[{index}].scenario_id is invalid")
    family = scenario["game_family"]
    objective = scenario["objective"]
    utility = scenario["utility_context"]
    allowed = {
        "cash": {("cash_ev", "cash_ev")},
        "spin": {("chip_ev", "chip_ev"), ("icm", "spin_ladder")},
        "tourney_ev": {("chip_ev", "chip_ev")},
        "tourney_icm": {
            ("icm", "satellite"),
            ("icm", "bubble"),
            ("icm", "final_table"),
            ("icm", "in_money"),
            ("icm", "ladder"),
        },
    }
    if family not in allowed or (objective, utility) not in allowed[family]:
        raise ContractError(f"scenarios[{index}] family/objective/utility is invalid")
    table_size = scenario["table_size"]
    if isinstance(table_size, bool) or not isinstance(table_size, int) or table_size not in POSITIONS_BY_TABLE:
        raise ContractError(f"scenarios[{index}].table_size is invalid")
    positions = POSITIONS_BY_TABLE[table_size]
    if (
        scenario["oop_position"] not in positions
        or scenario["ip_position"] not in positions
        or scenario["oop_position"] == scenario["ip_position"]
    ):
        raise ContractError(f"scenarios[{index}] positions are invalid")
    if scenario["depth_bucket"] not in {10, 20, 40, 80, 150}:
        raise ContractError(f"scenarios[{index}].depth_bucket is invalid")
    if scenario["pot_type"] not in {"limped", "srp", "3bet", "4bet_plus"}:
        raise ContractError(f"scenarios[{index}].pot_type is invalid")
    preflop = scenario["preflop_aggressor_solver_player"]
    if preflop not in (None, 0, 1) or (scenario["pot_type"] == "limped") != (preflop is None):
        raise ContractError(f"scenarios[{index}] preflop aggressor contradicts pot type")
    _cards(scenario["flop_board"], 3, 3, f"scenarios[{index}].flop_board")
    for field in ("pot_chips", "effective_stack_chips", "chips_per_bb"):
        value = scenario[field]
        if isinstance(value, bool) or not isinstance(value, int) or value <= 0:
            raise ContractError(f"scenarios[{index}].{field} must be a positive integer")
    if scenario["effective_stack_chips"] != scenario["depth_bucket"] * scenario["chips_per_bb"]:
        raise ContractError(
            f"scenarios[{index}].effective_stack_chips must equal depth_bucket * chips_per_bb"
        )
    rake = scenario["rake"]
    icm_model_id = scenario["icm_model_id"]
    if objective == "icm":
        if rake is not None:
            raise ContractError(f"scenarios[{index}] ICM and rake are mutually exclusive")
        if not SAFE_ID.fullmatch(str(icm_model_id or "")):
            raise ContractError(f"scenarios[{index}] requires one approved ICM model id")
        if verify_inputs:
            model = icm_models.get(str(icm_model_id))
            if model is None:
                raise ContractError(f"scenarios[{index}] names an absent ICM model")
            if min(model["oop_stack_chips"], model["ip_stack_chips"]) != scenario[
                "effective_stack_chips"
            ]:
                raise ContractError(
                    f"scenarios[{index}] ICM stacks do not match effective_stack_chips"
                )
    else:
        if icm_model_id is not None:
            raise ContractError(f"scenarios[{index}] chip/cash EV may not name an ICM model")
        if not isinstance(rake, list) or len(rake) != 2:
            raise ContractError(f"scenarios[{index}].rake must be [fraction, integer cap]")
        fraction = _finite_number(rake[0], f"scenarios[{index}].rake fraction", 0)
        cap = _positive_integer(
            rake[1], f"scenarios[{index}].rake cap", allow_zero=True
        )
        if fraction > 1:
            raise ContractError(f"scenarios[{index}].rake fraction cannot exceed 1")
        if family != "cash" and (fraction != 0 or cap != 0):
            raise ContractError(f"scenarios[{index}] tournament/spin chip EV must use zero rake")
    accuracy = _finite_number(
        scenario["solve_accuracy"], f"scenarios[{index}].solve_accuracy", 0.000001
    )
    if accuracy > 0.01:
        raise ContractError(f"scenarios[{index}].solve_accuracy must be a fraction at most 0.01")
    tree_lines = scenario["tree_lines"]
    if not isinstance(tree_lines, list) or not tree_lines:
        raise ContractError(f"scenarios[{index}].tree_lines cannot be empty")
    seen_lines: set[tuple[int, ...]] = set()
    for line_index, line in enumerate(tree_lines):
        if (
            not isinstance(line, list)
            or not line
            or any(
                isinstance(value, bool)
                or not isinstance(value, int)
                or value < 0
                or value > scenario["effective_stack_chips"]
                for value in line
            )
        ):
            raise ContractError(f"scenarios[{index}].tree_lines[{line_index}] is invalid")
        identity = tuple(line)
        if identity in seen_lines:
            raise ContractError(f"scenarios[{index}] repeats a tree line")
        seen_lines.add(identity)
    for side in ("oop", "ip"):
        path = _safe_relative_path(
            scenario[f"{side}_range_path"], f"scenarios[{index}].{side}_range_path"
        )
        checksum = _nonzero_hex(
            scenario[f"{side}_range_checksum"], 64, f"scenarios[{index}].{side}_range_checksum"
        )
        if verify_inputs and range_receipts.get(path) != checksum:
            raise ContractError(f"scenarios[{index}] {side} range is absent from the approved bundle")
        if verify_inputs:
            load_range_vector(_verify_file(input_root, path, checksum))
    targets = scenario["targets"]
    if not isinstance(targets, list) or not targets:
        raise ContractError(f"scenarios[{index}] has no targets")
    seen_targets: set[str] = set()
    seen_nodes: set[str] = set()
    for target_index, raw_target in enumerate(targets):
        target = _validate_target(raw_target, scenario, target_index)
        if target["target_id"] in seen_targets or target["node"] in seen_nodes:
            raise ContractError(f"scenarios[{index}] has a duplicate target id or node")
        seen_targets.add(target["target_id"])
        seen_nodes.add(target["node"])
    return scenario


@dataclass(frozen=True)
class ApprovedManifest:
    path: Path
    input_root: Path
    raw: dict[str, Any]
    checksum: str
    source_combo_order: tuple[str, ...] = ()
    icm_models: dict[str, dict[str, Any]] = field(default_factory=dict)

    @property
    def provenance(self) -> dict[str, str]:
        return {
            "dataset_key": self.raw["dataset_key"],
            "solver_version": self.raw["solver_version"],
            "solver_binary_checksum": self.raw["solver_binary_checksum"],
            "pipeline_commit": self.raw["pipeline_commit"],
            "pipeline_bundle_checksum": self.raw["pipeline_bundle_checksum"],
            "manifest_version": self.raw["manifest_version"],
            "manifest_checksum": self.checksum,
            "range_bundle_checksum": self.raw["range_bundle_checksum"],
            "source_combo_order_checksum": self.raw["source_combo_order_checksum"],
            "icm_model_checksum": self.raw["icm_model_checksum"],
            "input_bundle_checksum": self.raw["input_bundle_checksum"],
        }


def load_manifest(
    path: str | Path,
    *,
    expected_checksum: str,
    input_root: str | Path,
    pipeline_root: str | Path,
    require_enabled: bool = True,
    verify_inputs: bool = True,
    verify_pipeline: bool = True,
) -> ApprovedManifest:
    manifest_path = Path(path).resolve()
    payload = manifest_path.read_bytes()
    checksum = hashlib.sha256(payload).hexdigest()
    expected = _nonzero_hex(expected_checksum, 64, "APPROVED_MANIFEST_CHECKSUM")
    if checksum != expected:
        raise ContractError(f"manifest checksum mismatch: {checksum}")
    manifest = _exact_keys(_json_bytes(payload, "manifest"), ROOT_KEYS, "manifest")
    if manifest["contract"] != MANIFEST_CONTRACT:
        raise ContractError("manifest contract is invalid")
    if manifest["enabled"] is not True:
        if require_enabled:
            raise ContractError("manifest release gate is disabled")
        return ApprovedManifest(manifest_path, Path(input_root).resolve(), manifest, checksum)
    if not DATASET_KEY.fullmatch(str(manifest["dataset_key"] or "")):
        raise ContractError("dataset_key is invalid")
    _canonical_identity_text(manifest["manifest_version"], 160, "manifest_version")
    _nonzero_hex(manifest["pipeline_commit"], 40, "pipeline_commit")
    _nonzero_hex(manifest["pipeline_bundle_checksum"], 64, "pipeline_bundle_checksum")
    _nonzero_hex(manifest["solver_binary_checksum"], 64, "solver_binary_checksum")
    _nonzero_hex(manifest["range_bundle_checksum"], 64, "range_bundle_checksum")
    _nonzero_hex(manifest["source_combo_order_checksum"], 64, "source_combo_order_checksum")
    _nonzero_hex(manifest["icm_model_checksum"], 64, "icm_model_checksum")
    input_checksum = _nonzero_hex(
        manifest["input_bundle_checksum"], 64, "input_bundle_checksum"
    )
    if not UUID.fullmatch(str(manifest["input_bundle_id"] or "").lower()):
        raise ContractError("input_bundle_id is invalid")
    if str(manifest["input_bundle_id"]).lower() != input_bundle_id(input_checksum):
        raise ContractError("input_bundle_id does not derive from input_bundle_checksum")
    _canonical_identity_text(manifest["solver_version"], 120, "solver_version")
    _validate_quality_gates(manifest["quality_gates"])
    root = Path(input_root).resolve()
    range_receipts = _range_bundle(root, manifest) if verify_inputs else {}
    source_combo_order: tuple[str, ...] = ()
    icm_models: dict[str, dict[str, Any]] = {}
    if verify_inputs:
        combo_path = _safe_relative_path(manifest["source_combo_order_path"], "source_combo_order_path")
        combo_checksum = _nonzero_hex(
            manifest["source_combo_order_checksum"], 64, "source_combo_order_checksum"
        )
        combo_file = _verify_file(root, combo_path, combo_checksum)
        source_combo_order = parse_source_combo_order(combo_file.read_text(encoding="utf-8"))
        icm_models = _icm_models(root, manifest)
    scenarios = manifest["scenarios"]
    if not isinstance(scenarios, list) or not scenarios:
        raise ContractError("manifest scenarios cannot be empty")
    scenario_ids: set[str] = set()
    scenario_by_id: dict[str, dict[str, Any]] = {}
    all_target_ids: set[str] = set()
    target_machines: set[str] = set()
    for index, raw in enumerate(scenarios):
        scenario = _validate_scenario(
            raw, index, root, range_receipts, icm_models, verify_inputs
        )
        if scenario["scenario_id"] in scenario_ids:
            raise ContractError(f"duplicate scenario_id: {scenario['scenario_id']}")
        scenario_ids.add(scenario["scenario_id"])
        scenario_by_id[scenario["scenario_id"]] = scenario
        for target in scenario["targets"]:
            if target["target_id"] in all_target_ids:
                raise ContractError(f"duplicate target_id: {target['target_id']}")
            all_target_ids.add(target["target_id"])
            target_machines.add(target["machine_id"])
    if target_machines != {"M1", "M2"}:
        raise ContractError("manifest must assign source targets to both M1 and M2")
    self_test = _exact_keys(manifest["self_test"], SELF_TEST_KEYS, "self_test")
    if self_test["scenario_id"] not in scenario_ids or self_test["solver_player"] not in (0, 1):
        raise ContractError("self_test scenario or solver player is invalid")
    if scenario_by_id[self_test["scenario_id"]]["objective"] == "icm":
        raise ContractError("self_test must use chip/cash EV so exploitability has chip units")
    if not NODE.fullmatch(str(self_test["node"] or "")):
        raise ContractError("self_test node is invalid")
    children = self_test["expected_children"]
    if (
        not isinstance(children, list)
        or len(children) < 2
        or len(children) != len(set(children))
        or any(not ACTION.fullmatch(str(x)) for x in children)
    ):
        raise ContractError("self_test expected_children is invalid")
    self_scenario = scenario_by_id[self_test["scenario_id"]]
    self_target = next(
        (target for target in self_scenario["targets"] if target["node"] == self_test["node"]),
        None,
    )
    if self_target is None or self_target["expected_children"] != children:
        raise ContractError("self_test must bind an exact declared target and child topology")
    low = _finite_number(self_test["weighted_policy_ev_min_bb"], "self_test minimum")
    high = _finite_number(self_test["weighted_policy_ev_max_bb"], "self_test maximum")
    if low > high:
        raise ContractError("self_test EV bounds are reversed")
    _finite_number(self_test["max_exploitability_pct"], "self_test exploitability", 0)
    if verify_pipeline:
        actual_bundle = pipeline_bundle_checksum(Path(pipeline_root), manifest["pipeline_files"])
        if actual_bundle != manifest["pipeline_bundle_checksum"]:
            raise ContractError(f"pipeline bundle checksum mismatch: {actual_bundle}")
    return ApprovedManifest(
        manifest_path,
        root,
        manifest,
        checksum,
        source_combo_order=source_combo_order,
        icm_models=icm_models,
    )
