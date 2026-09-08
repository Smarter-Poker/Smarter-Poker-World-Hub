"""Fail-closed manifest and input validation for the certified V31 solver farm."""

from __future__ import annotations

import hashlib
import json
import math
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable


MANIFEST_CONTRACT = "smarter-poker.horse-solver-v31-manifest.v1"
RANGE_BUNDLE_CONTRACT = "smarter-poker.horse-solver-v31-range-bundle.v1"
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
    "icm_command",
    "oop_range_path",
    "oop_range_checksum",
    "ip_range_path",
    "ip_range_checksum",
    "tree_lines",
    "solve_accuracy",
    "targets",
}
TARGET_KEYS = {
    "target_id",
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
    text = str(value or "").lower()
    pattern = HEX40 if length == 40 else HEX64
    if not pattern.fullmatch(text) or text == "0" * length:
        raise ContractError(f"{label} must be a nonzero lowercase SHA-{length * 4}")
    return text


def _safe_relative_path(value: Any, label: str) -> str:
    text = str(value or "")
    if (
        not SAFE_PATH.fullmatch(text)
        or text.startswith("/")
        or "\\" in text
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
    for relative, checksum in sorted(normalized):
        path = _verify_file(root, relative, checksum)
        payload = path.read_bytes()
        digest.update(relative.encode("utf-8") + b"\0" + payload + b"\0")
    return digest.hexdigest()


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
    if (
        not isinstance(rake, list)
        or len(rake) != 4
        or any(_finite_number(value, f"scenarios[{index}].rake", 0) < 0 for value in rake)
    ):
        raise ContractError(f"scenarios[{index}].rake must contain four nonnegative numbers")
    icm_command = scenario["icm_command"]
    if objective == "icm":
        if (
            not isinstance(icm_command, str)
            or len(icm_command) > 2000
            or "\n" in icm_command
            or "\r" in icm_command
            or not re.fullmatch(r"set_icm(?:_point)? [0-9 .-]+", icm_command)
        ):
            raise ContractError(f"scenarios[{index}] requires one approved ICM command")
    elif icm_command is not None:
        raise ContractError(f"scenarios[{index}] chip/cash EV may not set ICM")
    _finite_number(scenario["solve_accuracy"], f"scenarios[{index}].solve_accuracy", 0.000001)
    tree_lines = scenario["tree_lines"]
    if not isinstance(tree_lines, list) or not tree_lines:
        raise ContractError(f"scenarios[{index}].tree_lines cannot be empty")
    for line_index, line in enumerate(tree_lines):
        if (
            not isinstance(line, list)
            or not line
            or any(_finite_number(value, f"tree_lines[{line_index}]") < 0 for value in line)
        ):
            raise ContractError(f"scenarios[{index}].tree_lines[{line_index}] is invalid")
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
    if (
        not isinstance(manifest["manifest_version"], str)
        or not manifest["manifest_version"].strip()
        or len(manifest["manifest_version"]) > 160
    ):
        raise ContractError("manifest_version is required")
    _nonzero_hex(manifest["pipeline_commit"], 40, "pipeline_commit")
    _nonzero_hex(manifest["pipeline_bundle_checksum"], 64, "pipeline_bundle_checksum")
    _nonzero_hex(manifest["solver_binary_checksum"], 64, "solver_binary_checksum")
    _nonzero_hex(manifest["range_bundle_checksum"], 64, "range_bundle_checksum")
    _nonzero_hex(manifest["source_combo_order_checksum"], 64, "source_combo_order_checksum")
    _nonzero_hex(manifest["icm_model_checksum"], 64, "icm_model_checksum")
    _nonzero_hex(manifest["input_bundle_checksum"], 64, "input_bundle_checksum")
    if not UUID.fullmatch(str(manifest["input_bundle_id"] or "").lower()):
        raise ContractError("input_bundle_id is invalid")
    if (
        not isinstance(manifest["solver_version"], str)
        or not manifest["solver_version"].strip()
        or len(manifest["solver_version"]) > 120
    ):
        raise ContractError("solver_version is required")
    _validate_quality_gates(manifest["quality_gates"])
    root = Path(input_root).resolve()
    range_receipts = _range_bundle(root, manifest) if verify_inputs else {}
    if verify_inputs:
        combo_path = _safe_relative_path(manifest["source_combo_order_path"], "source_combo_order_path")
        combo_checksum = _nonzero_hex(
            manifest["source_combo_order_checksum"], 64, "source_combo_order_checksum"
        )
        combo_file = _verify_file(root, combo_path, combo_checksum)
        if combo_file.read_text(encoding="utf-8").strip() != COMBO_ORDER:
            raise ContractError("source combo-order file does not contain the canonical V31 order")
        icm_path = _safe_relative_path(manifest["icm_model_path"], "icm_model_path")
        _verify_file(root, icm_path, manifest["icm_model_checksum"])
    scenarios = manifest["scenarios"]
    if not isinstance(scenarios, list) or not scenarios:
        raise ContractError("manifest scenarios cannot be empty")
    scenario_ids: set[str] = set()
    all_target_ids: set[str] = set()
    for index, raw in enumerate(scenarios):
        scenario = _validate_scenario(raw, index, root, range_receipts, verify_inputs)
        if scenario["scenario_id"] in scenario_ids:
            raise ContractError(f"duplicate scenario_id: {scenario['scenario_id']}")
        scenario_ids.add(scenario["scenario_id"])
        for target in scenario["targets"]:
            if target["target_id"] in all_target_ids:
                raise ContractError(f"duplicate target_id: {target['target_id']}")
            all_target_ids.add(target["target_id"])
    self_test = _exact_keys(manifest["self_test"], SELF_TEST_KEYS, "self_test")
    if self_test["scenario_id"] not in scenario_ids or self_test["solver_player"] not in (0, 1):
        raise ContractError("self_test scenario or solver player is invalid")
    if not NODE.fullmatch(str(self_test["node"] or "")):
        raise ContractError("self_test node is invalid")
    children = self_test["expected_children"]
    if not isinstance(children, list) or len(children) < 2 or any(not ACTION.fullmatch(str(x)) for x in children):
        raise ContractError("self_test expected_children is invalid")
    low = _finite_number(self_test["weighted_policy_ev_min_bb"], "self_test minimum")
    high = _finite_number(self_test["weighted_policy_ev_max_bb"], "self_test maximum")
    if low > high:
        raise ContractError("self_test EV bounds are reversed")
    _finite_number(self_test["max_exploitability_pct"], "self_test exploitability", 0)
    if verify_pipeline:
        actual_bundle = pipeline_bundle_checksum(Path(pipeline_root), manifest["pipeline_files"])
        if actual_bundle != manifest["pipeline_bundle_checksum"]:
            raise ContractError(f"pipeline bundle checksum mismatch: {actual_bundle}")
    return ApprovedManifest(manifest_path, root, manifest, checksum)
