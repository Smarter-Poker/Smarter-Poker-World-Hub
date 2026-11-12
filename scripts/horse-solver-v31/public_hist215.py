"""Strict data-only public_hist215_v1 wire codec. Does not fit or approve models.

No pickle/joblib loading, source relabeling, inference, uploads or activation.
Caller-supplied bindings must come from the separately approved final producer.
"""
from __future__ import annotations

import hashlib
import json
import math
import re
import struct
from typing import Any

from contract import ContractError

FORMAT = "public_hist215_v1"
MAX_ACTIONS = 16
# Structural admission ceiling only; the existing gateway's 4 MiB bound remains.
MAX_MODEL_BYTES = 8 * 1024 * 1024
MODEL_KEYS = {"format", "variant", "feature_count", "action_ids", "heads",
              "template_sha256", "feature_schema_sha256", "provenance_sha256"}
DIGEST = re.compile(r"^[0-9a-f]{64}$")
WORD = re.compile(r"^[0-9a-f]{16}$")
ACTION = re.compile(r"^[A-Za-z0-9_.:-]{1,96}$")
TRAINING_FORMAT = "public_hist215_training_v1"
TRAINING_DIGEST_KEYS = frozenset({
    "input_bundle_checksum", "manifest_checksum", "capture_receipt_checksum",
    "training_recipe_checksum", "source_partition_checksum", "producer_bundle_checksum",
    "solver_binary_checksum", "range_bundle_checksum", "icm_model_checksum",
    "feature_schema_checksum", "encoder_checksum", "physics_checksum",
    "dependency_lock_checksum", "runtime_parity_protocol_checksum",
})
TRAINING_KEYS = TRAINING_DIGEST_KEYS | {
    "format", "approved_input_bundle_id", "producer_commit", "whole_variant",
    "parameters", "machine_id", "source_count", "artifact_count", "board_count", "sources",
}
FROZEN_PARAMETERS = {"max_iter": 100, "max_leaf_nodes": 15, "min_samples_leaf": 10,
                     "l2_regularization_f64": "4024000000000000",
                     "early_stopping": False, "random_state": 731}
UUID = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$")


def _keys(value: Any, keys: set[str]) -> dict:
    if not isinstance(value, dict) or set(value) != keys:
        raise ContractError("public215 exact object keys required")
    return value


def _integer(value: Any, low: int, high: int) -> bool:
    return type(value) is int and low <= value <= high


def canonical_bytes(value: Any) -> bytes:
    """Sorted compact printable-ASCII JSON; numeric values are safe integers.

    All floating-point model/scenario scalars use exact IEEE754 word strings.
    Python booleans deliberately remain distinct from JSON integer indices.
    """
    def check(item: Any, depth: int = 0) -> None:
        if depth > 128:
            raise ContractError("public215 nesting bound")
        if item is None or type(item) is bool:
            return
        if type(item) is int and abs(item) <= (1 << 53) - 1:
            return
        if isinstance(item, str) and all(32 <= ord(c) <= 126 for c in item):
            return
        if isinstance(item, list):
            for child in item:
                check(child, depth + 1)
            return
        if isinstance(item, dict):
            for key, child in item.items():
                if not isinstance(key, str):
                    raise ContractError("public215 string keys required")
                check(key, depth + 1)
                check(child, depth + 1)
            return
        raise ContractError("public215 noncanonical value")
    check(value)
    return json.dumps(value, sort_keys=True, separators=(",", ":"),
                      ensure_ascii=False, allow_nan=False).encode("ascii")


def digest(value: Any) -> str:
    return hashlib.sha256(canonical_bytes(value)).hexdigest()


def encode_f64(value: float) -> str:
    if type(value) not in (float, int):
        raise ContractError("public215 finite float required")
    try:
        if not math.isfinite(value):
            raise ContractError("public215 finite float required")
        return struct.pack(">d", value).hex()
    except (OverflowError, struct.error) as error:
        raise ContractError("public215 finite float required") from error


def decode_f64(value: Any) -> float:
    if not isinstance(value, str) or not WORD.fullmatch(value):
        raise ContractError("public215 lowercase f64 word required")
    number = struct.unpack(">d", bytes.fromhex(value))[0]
    if not math.isfinite(number):
        raise ContractError("public215 nonfinite f64")
    return number


def _tree(tree: Any, max_feature: int = 214) -> None:
    if not isinstance(tree, list) or not 1 <= len(tree) <= 29:
        raise ContractError("public215 tree size")
    leaves = 0
    for node in tree:
        if isinstance(node, dict) and "value_f64" in node:
            _keys(node, {"value_f64"})
            decode_f64(node["value_f64"])
            leaves += 1
        else:
            _keys(node, {"feature", "threshold_f64", "left", "right", "missing_left"})
            if not _integer(node["feature"], 0, max_feature):
                raise ContractError("public215 feature index")
            if any(not _integer(node[k], 0, len(tree) - 1) for k in ("left", "right")):
                raise ContractError("public215 child index")
            if node["left"] == node["right"] or type(node["missing_left"]) is not bool:
                raise ContractError("public215 child/missing direction")
            decode_f64(node["threshold_f64"])
    if leaves > 15 or len(tree) != 2 * leaves - 1:
        raise ContractError("public215 leaf bound")
    seen: set[int] = set()
    def visit(index: int) -> None:
        if index in seen:
            raise ContractError("public215 cycle or shared child")
        seen.add(index)
        node = tree[index]
        if "value_f64" not in node:
            visit(node["left"])
            visit(node["right"])
    visit(0)
    if len(seen) != len(tree):
        raise ContractError("public215 unreachable node")


def serialize_model(model: Any, *, model_sha256: str, template_sha256: str,
                    feature_schema_sha256: str, provenance_sha256: str,
                    action_ids: list[str]) -> bytes:
    """Validate complete model against independent immutable bindings.

    This is wire admission only, never a training-provenance or quality verdict.
    Required 100 trees/head preserves the frozen no-early-stopping recipe.
    """
    _keys(model, MODEL_KEYS)
    bindings = {"template_sha256": template_sha256,
                "feature_schema_sha256": feature_schema_sha256,
                "provenance_sha256": provenance_sha256}
    for value in [model_sha256, *bindings.values()]:
        if not isinstance(value, str) or not DIGEST.fullmatch(value):
            raise ContractError("public215 binding digest")
    # The vector width is the bound descriptor's: v2 246. Any other descriptor
    # keeps the v1 width 215, exactly as v1 admission always did (the
    # descriptor itself is bound to the dataset contract by the callers).
    width = FEATURE_COUNT_BY_SCHEMA.get(feature_schema_sha256, 215)
    if model["format"] != FORMAT or type(model["feature_count"]) is not int or model["feature_count"] != width or model["variant"] not in ("direct", "coherent"):
        raise ContractError("public215 format")
    if any(model[key] != value for key, value in bindings.items()):
        raise ContractError("public215 binding mismatch")
    actions = model["action_ids"]
    if not isinstance(actions, list) or not 1 <= len(actions) <= MAX_ACTIONS or any(not isinstance(a, str) or not ACTION.fullmatch(a) or a in {"__proto__", "prototype", "constructor"} for a in actions) or len(set(actions)) != len(actions) or actions != action_ids:
        raise ContractError("public215 action order")
    heads = model["heads"]
    if not isinstance(heads, list) or len(heads) != 1 + 2 * len(actions):
        raise ContractError("public215 policy/Q/frequency heads")
    for head in heads:
        _keys(head, {"baseline_f64", "trees"})
        decode_f64(head["baseline_f64"])
        if not isinstance(head["trees"], list) or len(head["trees"]) != 100:
            raise ContractError("public215 frozen iterations")
        for tree in head["trees"]:
            _tree(tree, width - 1)
    payload = canonical_bytes(model)
    if len(payload) > MAX_MODEL_BYTES or hashlib.sha256(payload).hexdigest() != model_sha256:
        raise ContractError("public215 model digest/bytes")
    return payload


def serialize_training_provenance(value: Any, *, expected_sha256: str) -> bytes:
    """Validate a final-training receipt's shape, NOT its approval or truth.

    The database must independently join every source to its approved fresh M1
    capture and check the partition/recipe/capture/parity authorities. A valid
    checksum or this serializer cannot authorize training or reuse research.
    """
    p = _keys(value, TRAINING_KEYS)
    if p["format"] != TRAINING_FORMAT or p["machine_id"] != "M1" or p["whole_variant"] not in ("direct", "coherent"):
        raise ContractError("public215 training identity")
    if not isinstance(p["approved_input_bundle_id"], str) or not UUID.fullmatch(p["approved_input_bundle_id"]):
        raise ContractError("public215 approved bundle UUID")
    if not isinstance(p["producer_commit"], str) or not re.fullmatch(r"[0-9a-f]{40}", p["producer_commit"]) or p["producer_commit"] == "0" * 40:
        raise ContractError("public215 producer commit")
    for checksum in [expected_sha256, *(p[k] for k in TRAINING_DIGEST_KEYS)]:
        if not isinstance(checksum, str) or not DIGEST.fullmatch(checksum) or checksum == "0" * 64:
            raise ContractError("public215 training digest")
    params = _keys(p["parameters"], set(FROZEN_PARAMETERS))
    if any(type(params[k]) is not type(v) or params[k] != v for k, v in FROZEN_PARAMETERS.items()):
        raise ContractError("public215 frozen parameters")
    if not _integer(p["source_count"], 1, (1 << 53) - 1) or not _integer(p["board_count"], 1, p["source_count"]):
        raise ContractError("public215 training census")
    sources = p["sources"]
    if not isinstance(sources, list) or len(sources) != p["source_count"]:
        raise ContractError("public215 source census")
    if not _integer(p["artifact_count"], 1, p["source_count"]):
        raise ContractError("public215 artifact census")
    ids, artifacts, boards = [], {}, set()
    for raw in sources:
        s = _keys(raw, {"source_row_id", "source_node", "board", "artifact_checksum", "node_checksum"})
        if not isinstance(s["source_row_id"], str) or not UUID.fullmatch(s["source_row_id"]):
            raise ContractError("public215 source row UUID")
        if not isinstance(s["source_node"], str) or not re.fullmatch(r"r:0(?::(?:c|f|b[1-9][0-9]{0,78}|[2-9TJQKA][cdhs]))*", s["source_node"]) or len(s["source_node"]) > 2048:
            raise ContractError("public215 source node")
        board = s["board"]
        if not isinstance(board, str) or not re.fullmatch(r"(?:[2-9TJQKA][cdhs]){3,5}", board) or len(set(board[i:i+2] for i in range(0, len(board), 2))) != len(board)//2:
            raise ContractError("public215 legal chronological board")
        for key in ("artifact_checksum", "node_checksum"):
            if not isinstance(s[key], str) or not DIGEST.fullmatch(s[key]) or s[key] == "0" * 64:
                raise ContractError("public215 source checksum")
        row = s["source_row_id"]
        if row in artifacts and artifacts[row] != s["artifact_checksum"]:
            raise ContractError("public215 source artifact identity conflict")
        artifacts[row] = s["artifact_checksum"]
        ids.append((row, s["source_node"]))
        boards.add(board)
    if ids != sorted(set(ids)) or len(artifacts) != p["artifact_count"] or len(boards) != p["board_count"]:
        raise ContractError("public215 ordered unique source/board census")
    payload = canonical_bytes(p)
    if hashlib.sha256(payload).hexdigest() != expected_sha256:
        raise ContractError("public215 training digest mismatch")
    return payload

FEATURE_DESCRIPTOR_SHA256 = "0ca054f9bb0463bf6a298a80a29cb4b6d9e6bffcc193e4af9d497e2936ec849f"
# Feature contract v2 (holdem-public-hist215-v2, R8): the unchanged v1 215
# features, then these one-hots (indices 215..245). The v2 descriptor is the v1
# descriptor file plus exactly this block (feature_descriptor_v2), so no new
# pipeline file exists; its canonical digest is pinned here and in Club Arena.
FEATURE_CONTRACT_V1 = "holdem-public-hist215-v1"
FEATURE_CONTRACT_V2 = "holdem-public-hist215-v2"
V2_APPENDED = (
    "facing_size_bucket=mid",
    "hero_position=CO",
    "hero_position=HJ",
    "hero_position=UTG",
    "iprange=1eff0dca52c74b86d77a314c3554cb7357e42e3979bda3970e306dd242e63b19",
    "iprange=4c4aca48c0b577be5492f05d19eb294557a2cf87103dcf42773db40956b58bad",
    "iprange=8094ad2bd7fd8e75d410ec521e9749199cc43986319efd148940aa1e886258b8",
    "iprange=8d05309cf40a74905140d9a3c2b857b4aa0917f37c2434e43c95c8227e0a3c12",
    "iprange=8e091848a962599d769f99a352a6a1bc7aed2222ede6509f457aa4ac6f44a129",
    "iprange=940cbb36f68dfee091837aee988eed475ac6cf0f2b6107373014a6bca47eba3c",
    "iprange=b1d304ccba44f89fa02db583045f4e04a6a6a350ddae1ca4e8dc5a4beb20efb1",
    "iprange=c8a29032b419bc0f571b511b5c3b4ea5d34f19c07a92660643623102a4d5023c",
    "iprange=cfb46e1b5d5e73cfbcfe954cd5e9a774181eb9154b3d1ff23d58de6b08335400",
    "iprange=df7c2db33566dd6b1ab17146e5c86e45025159eb9b591efdfd0c403d102b50b0",
    "iprange=ebefaf9e605ad69e732d3c29d38c966f229b56437748534ceb9281a318ccd31a",
    "ooprange=22f7c9b7c5cd1a795476f2e5419b1829d6e13bbfe6dd7a682c56f8c6c72a387e",
    "ooprange=2eb11daeca4ffdaa8dac768fabfb388ed7a7ea0eae4c65e46618c6eda3444e46",
    "ooprange=45f108f17d60c7ca10db794ef2a2d1a1c354075f8e24e9eb94559baabaaea54b",
    "ooprange=6f32554c839177cb628055124548b524a033250bcc2d2c2612e8b8885b4bdd46",
    "ooprange=789b60c1614b66a8e8e9bfb7d457837683fda8aa798a1090564fea928a0c9ef2",
    "ooprange=8c26e3d32a0944a4f66c3afbf54efe80ac6e24a4cee7eaf8311dc95c54743f65",
    "ooprange=8e091848a962599d769f99a352a6a1bc7aed2222ede6509f457aa4ac6f44a129",
    "ooprange=940cbb36f68dfee091837aee988eed475ac6cf0f2b6107373014a6bca47eba3c",
    "ooprange=a70f8bc53d028a436d875c4374b9b8bb615e7eef33f14676bdb95fc64da0fe81",
    "ooprange=b342d9978e3f4dc9b96aeb9509cff1501f71bb3480db9f0e74db160241937b13",
    "ooprange=c8682c9598acfdb2947b0bf029bf812ba1f1c92b40b8fb452c81f28f46f99fed",
    "ooprange=d94b67df0b44afe07d24d6b9b1b69ab517afc327a3186c1535aebab6a949310c",
    "ooprange=df7c2db33566dd6b1ab17146e5c86e45025159eb9b591efdfd0c403d102b50b0",
    "opponent_position=CO",
    "opponent_position=HJ",
    "opponent_position=UTG",
)
FEATURE_DESCRIPTOR_V2_SHA256 = "c37e7aa2b2dde3f71cde7d224594de637ab66c928c6dffd94661fec3f7ac80c4"
FEATURE_CONTRACTS = {FEATURE_CONTRACT_V1: (FEATURE_DESCRIPTOR_SHA256, 215),
                     FEATURE_CONTRACT_V2: (FEATURE_DESCRIPTOR_V2_SHA256, 215 + len(V2_APPENDED))}
FEATURE_COUNT_BY_SCHEMA = {sha: count for sha, count in FEATURE_CONTRACTS.values()}


def feature_contract(version: Any) -> tuple[str, int]:
    """(descriptor sha256, feature count) of a dataset's explicit contract version."""
    if version not in FEATURE_CONTRACTS:
        raise ContractError("public215 unknown feature contract version")
    return FEATURE_CONTRACTS[version]


def feature_descriptor_v2(v1: dict) -> dict:
    """The v2 descriptor: the v1 descriptor with the appended block, nothing else."""
    v2 = dict(v1)
    v2.update({"format": "holdem-public-hist215-feature-schema-v2", "feature_count": 215 + len(V2_APPENDED),
               "feature_order": [*v1["feature_order"], *V2_APPENDED],
               "feature_groups": [*v1["feature_groups"], {"count": len(V2_APPENDED), "name": "v2_appended_public_categories", "offset": 215}],
               "predecessor_schema_sha256": FEATURE_DESCRIPTOR_SHA256,
               "appended_rule": "one_hot_exact_context_category_or_root_range_checksum_then_zero"})
    return v2


def maintained_feature_descriptor(version: Any) -> dict:
    """The maintained descriptor of a contract, each checked against its pinned digest."""
    from pathlib import Path
    raw = Path(__file__).with_name("public_hist215_feature_descriptor.json").read_bytes()
    if hashlib.sha256(raw).hexdigest() != FEATURE_DESCRIPTOR_SHA256:
        raise ContractError("public215 maintained full feature descriptor differs")
    sha, count = feature_contract(version)
    value = json.loads(raw)
    if version == FEATURE_CONTRACT_V2:
        value = feature_descriptor_v2(value)
    if digest(value) != sha or value["feature_count"] != count:
        raise ContractError("public215 maintained feature descriptor differs")
    return value
CONTEXT_KEYS = {"street", "game_family", "objective", "utility_context", "table_size", "pot_type",
                "hero_position", "opponent_position", "depth_bucket", "texture_class", "node_role",
                "facing_kind", "facing_size_bucket"}


def validate_context_metadata(entries: Any) -> None:
    if not isinstance(entries, list) or not entries:
        raise ContractError("public215 approved context metadata required")
    order = []
    for entry in entries:
        _keys(entry, {"context", "expected_children", "model_action_order", "template_checksum", "feature_schema_checksum"})
        c = _keys(entry["context"], CONTEXT_KEYS)
        if not _integer(c["table_size"], 2, 10) or not _integer(c["depth_bucket"], 1, (1 << 53)-1):
            raise ContractError("public215 context integers")
        if any(not isinstance(c[k], str) or not c[k] or len(c[k]) > 96 for k in CONTEXT_KEYS - {"table_size", "depth_bucket"}):
            raise ContractError("public215 context strings")
        actions = entry["expected_children"]
        if not isinstance(actions, list) or not 2 <= len(actions) <= MAX_ACTIONS or any(not isinstance(a, str) or not re.fullmatch(r"c|f|b[1-9][0-9]{0,78}", a) for a in actions) or len(set(actions)) != len(actions):
            raise ContractError("public215 approved ordered children")
        if entry["model_action_order"] != sorted(actions):
            raise ContractError("public215 frozen scientific model action order")
        if not isinstance(entry["template_checksum"], str) or not DIGEST.fullmatch(entry["template_checksum"]) or entry["template_checksum"] == "0" * 64 or entry["feature_schema_checksum"] not in FEATURE_COUNT_BY_SCHEMA or entry["feature_schema_checksum"] != entries[0]["feature_schema_checksum"]:
            raise ContractError("public215 metadata digest")
        order.append(canonical_bytes(c))
    if order != sorted(set(order)):
        raise ContractError("public215 context order/uniqueness")


def validate_manifest_metadata(manifest: dict, root: Any, combo_order: tuple[str, ...], *, verify_inputs: bool) -> None:
    """Connect approved context/action order and actual authored ROOT templates.

    Derives public context from maintained Pio line parser; never runs Pio.
    Template bytes are read only from pinned input receipts, not model claims.
    """
    from decimal import Decimal
    from pathlib import Path
    from contract import _json_bytes, _verify_file, _safe_relative_path
    from pio_upi import target_context, analyze_node
    schema, _ = feature_contract(manifest.get("feature_contract_version"))
    maintained_feature_descriptor(manifest["feature_contract_version"])
    entries = manifest["public215_contexts"]
    validate_context_metadata(entries)
    if entries[0]["feature_schema_checksum"] != schema:
        raise ContractError("public215 context descriptor differs from the declared feature contract")
    validate_protocols(manifest["public215_protocols"], entries)
    protocol_files = _keys(manifest["public215_protocol_files"], PROTOCOL_KEYS)
    for key, f in protocol_files.items():
        _keys(f, {"path", "checksum"})
        _safe_relative_path(f["path"], "public215 protocol path")
        if f["checksum"] != digest(manifest["public215_protocols"][key]):
            raise ContractError("public215 protocol body checksum differs")
        if verify_inputs and _verify_file(root, f["path"], f["checksum"]).read_bytes() != canonical_bytes(manifest["public215_protocols"][key]):
            raise ContractError("public215 protocol actual canonical file differs")
    files = manifest["public215_template_files"]
    if not isinstance(files, list) or len(files) != len(entries):
        raise ContractError("public215 template file census")
    by_sha, paths = {}, set()
    for raw in files:
        f = _keys(raw, {"path", "checksum"})
        path = _safe_relative_path(f["path"], "public215 template path")
        if path in paths or not isinstance(f["checksum"], str) or not DIGEST.fullmatch(f["checksum"]) or f["checksum"] in by_sha:
            raise ContractError("public215 template receipt duplicate/digest")
        paths.add(path); by_sha[f["checksum"]] = path
    if set(by_sha) != {e["template_checksum"] for e in entries}:
        raise ContractError("public215 template receipts missing")
    declared = {canonical_bytes(e["context"]): e for e in entries}
    observed, templates, m1_boards = set(), {}, {}
    if verify_inputs:
        ranks, suits = "23456789TJQKA", "cdhs"
        cards = [r+s for r in ranks for s in suits]
        expected = [{cards[a], cards[b]} for b in range(1, 52) for a in range(b)]
        if len(combo_order) != 1326 or any(set((s[:2], s[2:])) != pair for s, pair in zip(combo_order, expected)):
            raise ContractError("public215 canonical ROOT combo order differs")
        for checksum, path in by_sha.items():
            payload = _verify_file(root, path, checksum).read_bytes()
            t = _json_bytes(payload, "public215 template")
            if canonical_bytes(t) != payload:
                raise ContractError("public215 template must use exact canonical ASCII bytes")
            _keys(t, {"format", "context", "root_actor", "scenario", "opponent_weights"})
            if t["format"] != "public_hist215_template_v1":
                raise ContractError("public215 template format")
            templates[checksum] = t
    for scenario in manifest["scenarios"]:
        if scenario.get("purpose", "harvest") == "self_test":
            continue
        for target in scenario["targets"]:
            context = target_context(scenario, target)
            key = canonical_bytes(context)
            if key not in declared or declared[key]["expected_children"] != target["expected_children"]:
                raise ContractError("public215 actual target context/ordered children differ")
            observed.add(key)
            if target["machine_id"] == "M1":
                m1_boards.setdefault(key,set()).add(target["board"])
            if not verify_inputs:
                continue
            t = templates[declared[key]["template_checksum"]]
            actor = analyze_node(target["node"], root_pot_chips=scenario["pot_chips"], effective_stack_chips=scenario["effective_stack_chips"], preflop_aggressor=scenario["preflop_aggressor_solver_player"]).actor
            geometry = {"pot_chips_f64": encode_f64(scenario["pot_chips"]), "effective_stack_chips_f64": encode_f64(scenario["effective_stack_chips"]), "chips_per_bb_f64": encode_f64(scenario["chips_per_bb"]), "rake_f64": [encode_f64(v) for v in (scenario["rake"] or [0, 0])], "ip_range_checksum": scenario["ip_range_checksum"], "oop_range_checksum": scenario["oop_range_checksum"]}
            if t["context"] != context or t["root_actor"] != ("IP" if actor == 1 else "OOP") or t["scenario"] != geometry:
                raise ContractError("public215 template actual context/actor/geometry differs")
            side = "ip" if actor == 0 else "oop"
            raw = _verify_file(root, scenario[side+"_range_path"], scenario[side+"_range_checksum"]).read_bytes()
            text = raw.decode("utf-8").strip()
            _json_bytes(raw, "ROOT range") if text.startswith("[") else None
            weights = json.loads(text, parse_float=Decimal, parse_int=Decimal) if text.startswith("[") else [Decimal(w) for w in text.split()]
            scaled = [w * Decimal(10**12) for w in weights]
            if len(scaled) != 1326 or any(not w.is_finite() or w < 0 or w > 10**12 or w != w.to_integral_value() for w in scaled) or not any(scaled):
                raise ContractError("public215 exact ROOT range domain")
            if t["opponent_weights"] != [str(int(w)) for w in scaled]:
                raise ContractError("public215 template ROOT weights differ from approved source")
    for group in manifest["public215_protocols"]["runtime_parity_protocol"]["contexts"]:
        if any(case["board"] not in m1_boards.get(canonical_bytes(group["context"]),set()) for case in group["cases"]):
            raise ContractError("public215 public runtime case is not a planned M1 input")
    if observed != set(declared):
        raise ContractError("public215 approved metadata coverage differs")

BUILD_RECEIPT_KEYS = {"format", "dataset_id", "input_bundle_checksum", "model_checksum",
                      "training_provenance_checksum", "template_checksum", "feature_schema_checksum",
                      "encoder_checksum", "physics_checksum", "dependency_lock_checksum", "producer_commit",
                      "producer_bundle_checksum", "runtime", "cases", "cost"}
NATIVE_SOURCE_SHA256 = "83442cb6604dfaa30ec7ecc6ce38957355609e722b5df85b866365c97f0ccf9b"


def serialize_build_receipt(value: Any, *, expected_sha256: str, model: dict,
                            provenance: dict, dataset_id: str, approved_cases: list[dict]) -> bytes:
    """Post-model wire admission only; never approves reported parity or costs.

    SQL independently recomputes features/all heads and checks protected runtime
    evidence. approved_cases comes from the pre-capture approved public protocol.
    The actual receipt checksum is outside model/provenance to avoid a hash cycle.
    """
    r = _keys(value, BUILD_RECEIPT_KEYS)
    if r["format"] != "public_hist215_build_receipt_v1" or not isinstance(dataset_id, str) or not UUID.fullmatch(dataset_id) or r["dataset_id"] != dataset_id:
        raise ContractError("public215 build receipt identity")
    expected = {"input_bundle_checksum": provenance["input_bundle_checksum"],
                "model_checksum": digest(model), "training_provenance_checksum": digest(provenance),
                "template_checksum": model["template_sha256"], "feature_schema_checksum": model["feature_schema_sha256"],
                "encoder_checksum": provenance["encoder_checksum"], "physics_checksum": provenance["physics_checksum"],
                "dependency_lock_checksum": provenance["dependency_lock_checksum"],
                "producer_commit": provenance["producer_commit"], "producer_bundle_checksum": provenance["producer_bundle_checksum"]}
    if any(r[k] != v for k, v in expected.items()):
        raise ContractError("public215 build binding mismatch")
    if not isinstance(expected_sha256, str) or not DIGEST.fullmatch(expected_sha256) or expected_sha256 == "0"*64:
        raise ContractError("public215 build receipt digest")
    serialize_training_provenance(provenance, expected_sha256=expected["training_provenance_checksum"])
    model_bytes = serialize_model(model, model_sha256=expected["model_checksum"], template_sha256=r["template_checksum"], feature_schema_sha256=r["feature_schema_checksum"], provenance_sha256=r["training_provenance_checksum"], action_ids=model["action_ids"])
    runtime = _keys(r["runtime"], {"node_version", "platform", "arch", "napi_version", "native_source_checksum", "native_binary_checksum"})
    if not isinstance(runtime["node_version"], str) or not re.fullmatch(r"v22\.(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)", runtime["node_version"]) or runtime["platform"] != "linux" or runtime["arch"] not in ("x64", "arm64") or type(runtime["napi_version"]) is not int or runtime["napi_version"] != 8 or runtime["native_source_checksum"] != NATIVE_SOURCE_SHA256 or not isinstance(runtime["native_binary_checksum"], str) or not DIGEST.fullmatch(runtime["native_binary_checksum"]) or runtime["native_binary_checksum"] == "0"*64:
        raise ContractError("public215 receiving runtime identity")
    cases = r["cases"]
    if not isinstance(cases, list) or not 2 <= len(cases) <= 32 or not isinstance(approved_cases, list) or len(approved_cases) != len(cases):
        raise ContractError("public215 deterministic case census")
    actions, heads = len(model["action_ids"]), len(model["heads"])
    physics, inference, identities = [], [], set()
    card_id = lambda c: "23456789TJQKA".index(c[0])*4+"cdhs".index(c[1])
    for c, approved in zip(cases, approved_cases):
        _keys(c, {"board", "own", "features_f64", "raw_heads_f64", "policy_ev_f64", "Q_f64", "frequency_f64", "physics_ms_f64", "inference_ms_f64"})
        _keys(approved, {"board", "own"})
        board, own = c["board"], c["own"]
        if not isinstance(board, str) or not re.fullmatch(r"(?:[2-9TJQKA][cdhs]){3,5}", board) or not isinstance(own, list) or len(own) != 2 or any(not isinstance(x, str) or not re.fullmatch(r"[2-9TJQKA][cdhs]", x) for x in own):
            raise ContractError("public215 case cards")
        cards = [board[i:i+2] for i in range(0,len(board),2)] + own
        identity = (board, *own)
        if len(set(cards)) != len(cards) or card_id(own[0]) >= card_id(own[1]) or identity in identities or approved != {"board": board, "own": own}:
            raise ContractError("public215 approved case order/deck")
        identities.add(identity)
        decoded = {}
        for key, size in (("features_f64",model["feature_count"]),("raw_heads_f64",heads),("Q_f64",actions),("frequency_f64",actions)):
            if not isinstance(c[key], list) or len(c[key]) != size:
                raise ContractError("public215 case vector census")
            decoded[key] = [decode_f64(x) for x in c[key]]
        decode_f64(c["policy_ev_f64"])
        freq = decoded["frequency_f64"]
        if any(x < 0 or x > 1 for x in freq) or abs(math.fsum(freq)-1) > 1e-12:
            raise ContractError("public215 case frequency mass")
        p, t = decode_f64(c["physics_ms_f64"]), decode_f64(c["inference_ms_f64"])
        if not 0 < p <= t <= 8000:
            raise ContractError("public215 case cold budget")
        physics.append(p); inference.append(t)
    cost = _keys(r["cost"], {"method", "clock", "cold_cases", "max_physics_ms_f64", "max_inference_ms_f64", "execution_limit_ms", "model_bytes", "head_count"})
    if cost["method"] != "cold_public215_features_and_all_heads_v1" or cost["clock"] != "process.hrtime.bigint" or not _integer(cost["cold_cases"], len(cases), len(cases)) or not _integer(cost["execution_limit_ms"], 8000, 8000) or not _integer(cost["model_bytes"], len(model_bytes), len(model_bytes)) or not _integer(cost["head_count"], heads, heads) or decode_f64(cost["max_physics_ms_f64"]) != max(physics) or decode_f64(cost["max_inference_ms_f64"]) != max(inference):
        raise ContractError("public215 build cost census/maxima")
    payload = canonical_bytes(r)
    if hashlib.sha256(payload).hexdigest() != expected_sha256:
        raise ContractError("public215 build receipt bytes")
    return payload

PROTOCOL_KEYS = {"training_recipe", "source_partition", "runtime_parity_protocol",
                 "dependency_lock", "physics_protocol", "feature_schema"}


def validate_protocols(protocols: Any, contexts: list[dict]) -> None:
    """Known pre-capture protocol bodies, never actual future build receipts."""
    _keys(protocols, PROTOCOL_KEYS)
    for body in protocols.values():
        if not isinstance(body, dict) or not body:
            raise ContractError("public215 canonical protocol body required")
        canonical_bytes(body)
    if digest(protocols["feature_schema"]) not in FEATURE_COUNT_BY_SCHEMA or digest(protocols["feature_schema"]) != contexts[0]["feature_schema_checksum"]:
        raise ContractError("public215 protocol full feature descriptor differs")
    p = _keys(protocols["runtime_parity_protocol"], {"format", "method", "clock", "platform", "node_major", "napi_version", "native_source_checksum", "execution_limit_ms", "contexts"})
    if p["format"] != "public_hist215_runtime_parity_protocol_v1" or p["method"] != "cold_public215_features_and_all_heads_v1" or p["clock"] != "process.hrtime.bigint" or p["platform"] != "linux" or not _integer(p["node_major"],22,22) or not _integer(p["napi_version"],8,8) or p["native_source_checksum"] != NATIVE_SOURCE_SHA256 or not _integer(p["execution_limit_ms"],8000,8000):
        raise ContractError("public215 runtime protocol identity")
    if not isinstance(p["contexts"], list) or len(p["contexts"]) != len(contexts):
        raise ContractError("public215 runtime protocol context census")
    actual=[]
    for group in p["contexts"]:
        _keys(group,{"context","cases"})
        _keys(group["context"],CONTEXT_KEYS)
        actual.append(canonical_bytes(group["context"]))
        if not isinstance(group["cases"],list) or not 2 <= len(group["cases"]) <= 32:
            raise ContractError("public215 pre-capture case census")
        seen=set()
        for case in group["cases"]:
            _keys(case,{"board","own"})
            board,own=case["board"],case["own"]
            if not isinstance(board,str) or not re.fullmatch(r"(?:[2-9TJQKA][cdhs]){3,5}",board) or not isinstance(own,list) or len(own)!=2 or any(not isinstance(c,str) or not re.fullmatch(r"[2-9TJQKA][cdhs]",c) for c in own):
                raise ContractError("public215 pre-capture case cards")
            cardid=lambda c:"23456789TJQKA".index(c[0])*4+"cdhs".index(c[1])
            cards=[board[i:i+2] for i in range(0,len(board),2)]+own
            identity=(board,*own)
            if len(set(cards))!=len(cards) or cardid(own[0])>=cardid(own[1]) or identity in seen or len(board)!={"flop":6,"turn":8,"river":10}.get(group["context"]["street"]):
                raise ContractError("public215 pre-capture case deck/street")
            seen.add(identity)
    if actual != [canonical_bytes(c["context"]) for c in contexts]:
        raise ContractError("public215 runtime context order/coverage")

BUILD_ENVELOPE_KEYS = {"context", "policy_representation", "public_model", "public_template",
                       "public_training_provenance", "model_checksum", "template_checksum",
                       "feature_schema_checksum", "training_provenance_checksum",
                       "public_model_build_receipt", "model_build_receipt_checksum"}


def load_model_build_index(path: Any, *, expected_checksum: str, dataset_id: str, manifest: dict, prepare_only: bool = False) -> dict[bytes, dict]:
    """Read a bounded, pinned post-capture index; no fitting or approval effects."""
    from pathlib import Path
    from contract import _json_bytes
    if not isinstance(expected_checksum,str) or not DIGEST.fullmatch(expected_checksum) or expected_checksum=="0"*64:
        raise ContractError("public215 model index checksum")
    source=Path(path)
    limit=len(manifest["public215_contexts"])*4*1024*1024
    with source.open("rb") as file:
        payload=file.read(limit+1)
    if len(payload)>limit or hashlib.sha256(payload).hexdigest()!=expected_checksum:
        raise ContractError("public215 model index bytes")
    index=_keys(_json_bytes(payload,"public215 build index"),{"format","dataset_id","models"})
    if index["format"]!=("public_hist215_prepare_index_v1" if prepare_only else "public_hist215_build_index_v1") or index["dataset_id"]!=dataset_id or not isinstance(index["models"],list) or len(index["models"])!=len(manifest["public215_contexts"]):
        raise ContractError("public215 model index identity/census")
    metadata={canonical_bytes(e["context"]):e for e in manifest["public215_contexts"]}
    protocols=manifest["public215_protocols"]
    cases={canonical_bytes(g["context"]):g["cases"] for g in protocols["runtime_parity_protocol"]["contexts"]}
    result={}
    authority=None
    for e in index["models"]:
        _keys(e,BUILD_ENVELOPE_KEYS - {"public_model_build_receipt","model_build_receipt_checksum"} if prepare_only else BUILD_ENVELOPE_KEYS)
        key=canonical_bytes(e["context"])
        if key not in metadata or key in result or e["policy_representation"]!="public_hist215_v1":
            raise ContractError("public215 model context membership")
        approved=metadata[key]
        if e["template_checksum"]!=approved["template_checksum"] or e["feature_schema_checksum"]!=approved["feature_schema_checksum"] or digest(e["public_template"])!=e["template_checksum"] or e["public_template"].get("context")!=e["context"]:
            raise ContractError("public215 model approved template binding")
        p=e["public_training_provenance"]
        checks={"input_bundle_checksum":manifest["input_bundle_checksum"],"manifest_checksum":manifest["_actual_manifest_checksum"],
                "producer_commit":manifest["pipeline_commit"],"producer_bundle_checksum":manifest["pipeline_bundle_checksum"],
                "solver_binary_checksum":manifest["solver_binary_checksum"],"range_bundle_checksum":manifest["range_bundle_checksum"],"icm_model_checksum":manifest["icm_model_checksum"],
                "approved_input_bundle_id":manifest["input_bundle_id"],"feature_schema_checksum":e["feature_schema_checksum"],
                **{field:digest(protocols[name]) for field,name in [("training_recipe_checksum","training_recipe"),("source_partition_checksum","source_partition"),("runtime_parity_protocol_checksum","runtime_parity_protocol"),("dependency_lock_checksum","dependency_lock"),("physics_checksum","physics_protocol")]}}
        if not isinstance(p,dict) or any(p.get(k)!=v for k,v in checks.items()):
            raise ContractError("public215 training approved source/protocol binding")
        shared=canonical_bytes({k:p[k] for k in ("whole_variant","approved_input_bundle_id","capture_receipt_checksum","training_recipe_checksum","source_partition_checksum","feature_schema_checksum","encoder_checksum","physics_checksum","dependency_lock_checksum","runtime_parity_protocol_checksum")})
        if authority is not None and shared!=authority:
            raise ContractError("public215 model index mixes global training authority")
        authority=shared
        serialize_model(e["public_model"],model_sha256=e["model_checksum"],template_sha256=e["template_checksum"],feature_schema_sha256=e["feature_schema_checksum"],provenance_sha256=e["training_provenance_checksum"],action_ids=approved["model_action_order"])
        if p["whole_variant"]!=e["public_model"]["variant"] or digest(p)!=e["training_provenance_checksum"]:
            raise ContractError("public215 model training whole variant binding")
        if not prepare_only:
            serialize_build_receipt(e["public_model_build_receipt"],expected_sha256=e["model_build_receipt_checksum"],model=e["public_model"],provenance=p,dataset_id=dataset_id,approved_cases=cases[key])
        if len(canonical_bytes({"dataset_id":dataset_id,"context":e}))>4*1024*1024:
            raise ContractError("public215 model exceeds existing gateway transport ceiling")
        result[key]=e
    return result

SELECTION_RECEIPT_KEYS = {"format","dataset_id","input_bundle_checksum","source_partition_checksum",
    "selection_protocol_checksum","seed_commitment_checksum","capture_receipt_checksum",
    "training_recipe_checksum","runtime_parity_protocol_checksum","encoder_checksum","physics_checksum",
    "dependency_lock_checksum","feature_schema_checksum","frozen_models","selected"}


def select_m2_public_candidates(protocol: dict, seed: bytes) -> list[dict]:
    """Frozen public-domain ranking. Seed never enters a returned value or log."""
    import hmac
    keys={"format","boards_per_context","context_id_rule","contexts","domain_separator","physical_board_rule",
          "rank_message","rank_order","rank_selection","reservation_checksum","seed_bytes","seed_commitment_checksum"}
    _keys(protocol,keys)
    if protocol["format"]!="public_hist215_m2_selection_protocol_v1" or protocol["rank_selection"]!="hmac_sha256_context_rank_first8_v1" or protocol["domain_separator"]!="public_hist215_m2_rank_v1" or not _integer(protocol["boards_per_context"],8,8) or not _integer(protocol["seed_bytes"],32,32) or type(seed) is not bytes or len(seed)!=32 or hashlib.sha256(seed).hexdigest()!=protocol["seed_commitment_checksum"]:
        raise ContractError("public215 M2 selection protocol/commitment mismatch")
    expected_rules={"context_id_rule":"sha256_sorted_compact_printable_ASCII_context_JSON_no_newline",
      "physical_board_rule":"exact canonical_example_board from frozen reservation; chronology retained; no suit or card-order reroll",
      "rank_message":"domain_separator + ASCII_NUL + context_id + ASCII_NUL + rank_signature",
      "rank_order":"ascending raw HMAC_SHA256(secret_seed,ASCII(rank_message)) bytes, then ascending rank_signature ASCII; first8"}
    if any(protocol[k]!=v for k,v in expected_rules.items()) or not isinstance(protocol["reservation_checksum"],str) or not DIGEST.fullmatch(protocol["reservation_checksum"]):
        raise ContractError("public215 M2 selection frozen rules differ")
    if not isinstance(protocol["contexts"],list) or not protocol["contexts"]:
        raise ContractError("public215 M2 selection context census")
    selected=[];context_ids=[]
    ranks="23456789TJQKA"
    for group in protocol["contexts"]:
        _keys(group,{"context","context_id","candidates"});_keys(group["context"],CONTEXT_KEYS)
        cid=digest(group["context"]);context_ids.append(cid)
        if group["context_id"]!=cid or not isinstance(group["candidates"],list) or len(group["candidates"])<8:
            raise ContractError("public215 M2 selection context identity")
        signatures=[];ranked=[]
        for candidate in group["candidates"]:
            _keys(candidate,{"board","rank_signature"})
            board=candidate["board"]
            if not isinstance(board,str) or not re.fullmatch(r"(?:[2-9TJQKA][cdhs]){3,5}",board) or len(set(board[i:i+2] for i in range(0,len(board),2)))!=len(board)//2 or len(board)!={"flop":6,"turn":8,"river":10}.get(group["context"]["street"]):
                raise ContractError("public215 M2 candidate deck/street")
            signature=str(len(board)//2)+":"+"".join(sorted(board[::2],key=ranks.index))
            if candidate["rank_signature"]!=signature:
                raise ContractError("public215 M2 global rank signature")
            signatures.append(signature)
            message=(protocol["domain_separator"]+"\0"+cid+"\0"+signature).encode("ascii")
            ranked.append((hmac.new(seed,message,hashlib.sha256).digest(),signature,board))
        if signatures!=sorted(set(signatures)):
            raise ContractError("public215 M2 candidate order/duplicate")
        for _,signature,board in sorted(ranked)[:8]:
            selected.append({"context_id":cid,"rank_signature":signature,"board":board})
    if context_ids!=sorted(set(context_ids)):
        raise ContractError("public215 M2 context order/duplicate")
    return sorted(selected,key=lambda s:(s["context_id"],s["rank_signature"]))


def verify_model_freeze_authority(authority: Any, *, manifest: dict, dataset_id: str, model_builds: dict[bytes,dict]) -> None:
    """Authenticated metadata response must agree before any seed file is opened."""
    keys={"format","dataset_id","input_bundle_checksum","capture_receipt_checksum","source_partition_checksum",
          "training_recipe_checksum","runtime_parity_protocol_checksum","encoder_checksum","physics_checksum",
          "dependency_lock_checksum","feature_schema_checksum","frozen_models","authority_checksum"}
    a=_keys(authority,keys)
    if not model_builds:raise ContractError("public215 complete frozen models required")
    p=next(iter(model_builds.values()))["public_training_provenance"]
    expected={"format":"public_hist215_model_freeze_authority_v1","dataset_id":dataset_id,
              "input_bundle_checksum":manifest["input_bundle_checksum"],
              **{k:p[k] for k in ("capture_receipt_checksum","source_partition_checksum","training_recipe_checksum","runtime_parity_protocol_checksum","encoder_checksum","physics_checksum","dependency_lock_checksum","feature_schema_checksum")},
              "frozen_models":[{"context":e["context"],**{k:e[k] for k in ("model_checksum","model_build_receipt_checksum","template_checksum","training_provenance_checksum")}} for _,e in sorted(model_builds.items())]}
    if a!={**expected,"authority_checksum":digest(expected)}:
        raise ContractError("public215 authenticated server model freeze differs from local final index")


def make_m2_selection_receipt(manifest: dict, *, dataset_id: str, model_builds: dict[bytes,dict], seed: bytes) -> tuple[dict,set[tuple[bytes,str]]]:
    """Called only after strict complete Linux model-build index validation."""
    from pio_upi import target_context
    partition=manifest["public215_protocols"]["source_partition"]
    protocol=partition["m2_selection"]
    selected=select_m2_public_candidates(protocol,seed)
    protocol_contexts={digest(g["context"]):g["context"] for g in protocol["contexts"]}
    if set(model_builds)!={canonical_bytes(c) for c in protocol_contexts.values()}:
        raise ContractError("public215 M2 complete frozen model map required")
    first=next(iter(model_builds.values()))["public_training_provenance"]
    frozen=[]
    for key,e in sorted(model_builds.items()):
        frozen.append({"context":e["context"],**{k:e[k] for k in ("model_checksum","model_build_receipt_checksum","template_checksum","training_provenance_checksum")}})
    declared=set()
    for scenario in manifest["scenarios"]:
        if scenario.get("purpose","harvest")=="self_test":continue
        for target in scenario["targets"]:
            if target["machine_id"]=="M2":
                pair=(canonical_bytes(target_context(scenario,target)),target["board"])
                if pair in declared:raise ContractError("public215 M2 duplicate approved candidate target")
                declared.add(pair)
    candidates={(canonical_bytes(g["context"]),c["board"]) for g in protocol["contexts"] for c in g["candidates"]}
    if declared!=candidates:raise ContractError("public215 M2 approved full candidate membership differs")
    forbidden=set(partition["old_R6_all_rank_signatures"])
    train={s for g in partition["training_contexts"] for s in g["rank_signatures"]}
    if any(c["rank_signature"] in forbidden|train for g in protocol["contexts"] for c in g["candidates"]):
        raise ContractError("public215 M2 candidate overlaps training/R6 rank groups")
    receipt={"format":"public_hist215_m2_selection_receipt_v1","dataset_id":dataset_id,
      "input_bundle_checksum":manifest["input_bundle_checksum"],"source_partition_checksum":digest(partition),
      "selection_protocol_checksum":digest(protocol),"seed_commitment_checksum":protocol["seed_commitment_checksum"],
      **{k:first[k] for k in ("capture_receipt_checksum","training_recipe_checksum","runtime_parity_protocol_checksum","encoder_checksum","physics_checksum","dependency_lock_checksum","feature_schema_checksum")},
      "frozen_models":frozen,"selected":selected}
    pairs={(canonical_bytes(protocol_contexts[s["context_id"]]),s["board"]) for s in selected}
    return receipt,pairs


# ---------------------------------------------------------------------------
# Round registration (2026-11-10). R8 was approved as 70 flop / 23 turn /
# 7 river and built as 0 / 67 / 33; nothing compared the built workload with
# the approval. Club Arena migration 20261110213931 records every round in
# gto_v31_round_registrations before its dataset exists and refuses dataset
# insert and seal unless the cells hash to the registered cell-set checksum.
# The trainer checks the same binding before any fit, so a training run on an
# unregistered or substituted cell set fails here, not at the seal.
REGISTRATION_CONTEXT_KEYS = ("street", "game_family", "objective", "utility_context", "table_size", "pot_type",
                             "hero_position", "opponent_position", "depth_bucket", "texture_class", "node_role",
                             "facing_kind", "facing_size_bucket")


def cell_composition(cells: Any) -> dict:
    """{"flop": n, "turn": n, "river": n} of a list of 13-key cell contexts."""
    if not isinstance(cells, list) or not cells:
        raise ContractError("registration cells must be a non-empty list")
    out = {"flop": 0, "turn": 0, "river": 0}
    for cell in cells:
        if not isinstance(cell, dict) or set(cell) != set(REGISTRATION_CONTEXT_KEYS) or cell["street"] not in out:
            raise ContractError("registration cell must be one 13-key V31 context")
        out[cell["street"]] += 1
    return out


def cell_set_checksum(cells: Any) -> str:
    """Digest of the contexts in canonical byte order (SQL fn_gto_v31_cell_set_checksum)."""
    cell_composition(cells)
    ordered = sorted(cells, key=canonical_bytes)
    if any(canonical_bytes(a) == canonical_bytes(b) for a, b in zip(ordered, ordered[1:])):
        raise ContractError("registration cells repeat")
    return digest(ordered)


def _composition_text(c: dict) -> str:
    return f"{c['flop']} flop / {c['turn']} turn / {c['river']} river"


def manifest_range_constructions(manifest: dict) -> dict[bytes, str]:
    """Each harvested cell's declared range_construction, keyed by its canonical 13-key context.

    Refuses a manifest that cannot be registered (Club Arena migration
    20261112185251): a harvest scenario that does not declare how its ranges
    were produced, one that declares "forced" (conditional_history /
    conditional_root_action: earlier actions fixed, full input ranges kept),
    and a cell whose scenarios disagree. Forced scenarios remain solvable for
    research; they can never be part of a registered round.
    """
    from contract import REGISTRABLE_RANGE_CONSTRUCTIONS, scenario_range_construction
    from pio_upi import PioError, target_context
    out: dict[bytes, str] = {}
    for scenario in manifest.get("scenarios", []):
        if scenario.get("purpose", "harvest") != "harvest":
            continue
        declared = scenario_range_construction(scenario)
        conditioned = "conditional_history" in scenario or "conditional_root_action" in scenario
        if declared == "forced" or conditioned:
            raise ContractError(
                f"scenario {scenario.get('scenario_id')} is a forced-line (conditional) solve that keeps unnarrowed "
                "ranges after earlier decisions; it cannot be registered")
        if declared not in REGISTRABLE_RANGE_CONSTRUCTIONS:
            raise ContractError(
                f"scenario {scenario.get('scenario_id')} does not declare range_construction (root, natural or "
                "subgame); a round with an unstated range assumption cannot be registered")
        for target in scenario["targets"]:
            try:
                key = canonical_bytes(target_context(scenario, target))
            except PioError as error:
                raise ContractError(f"range construction target is invalid: {error}") from error
            if out.setdefault(key, declared) != declared:
                raise ContractError("one cell is harvested under two different range constructions")
    return out


def verify_round_registration(registration: Any, manifest: dict, *,
                              constructions: dict[bytes, str] | None = None) -> dict:
    """The manifest's contexts are exactly the round's registered cells, built as registered.

    `registration` is the gto_v31_round_registrations row exported by the round
    writer (round_key, dataset_key, composition, cells, cell_set_checksum,
    cell_provenance, ...). `constructions` is manifest_range_constructions(manifest)
    when the caller already derived it. Returns the registration; raises
    ContractError naming both compositions, or the cell whose range
    construction is missing, forced or not the registered one.
    """
    if not isinstance(registration, dict):
        raise ContractError("round registration must be an object")
    for key in ("round_key", "dataset_key", "composition", "cells", "cell_set_checksum"):
        if key not in registration:
            raise ContractError(f"round registration lacks {key}")
    if registration["dataset_key"] != manifest.get("dataset_key"):
        raise ContractError("round registration is for another dataset")
    cells = registration["cells"]
    if cell_composition(cells) != registration["composition"]:
        raise ContractError("round registration composition is not the composition of its cells")
    if cell_set_checksum(cells) != registration["cell_set_checksum"]:
        raise ContractError("round registration checksum does not hash its cells")
    contexts = [entry["context"] for entry in manifest.get("public215_contexts", [])]
    declared = cell_composition(contexts)
    if cell_set_checksum(contexts) != registration["cell_set_checksum"]:
        raise ContractError(
            f"round {registration['round_key']} composition differs from its registration: registered "
            f"{_composition_text(registration['composition'])} ({len(cells)} cells), manifest "
            f"{_composition_text(declared)} ({len(contexts)} cells); no cell may be substituted")
    provenance = registration.get("cell_provenance")
    if not isinstance(provenance, list) or len(provenance) != len(cells) or any(
            not isinstance(entry, dict) or not isinstance(entry.get("cell"), dict) for entry in provenance):
        raise ContractError(
            f"round {registration['round_key']} registration has no range provenance for every cell")
    registered = {canonical_bytes(entry["cell"]): entry.get("range_construction") for entry in provenance}
    if set(registered) != {canonical_bytes(cell) for cell in cells}:
        raise ContractError(
            f"round {registration['round_key']} range provenance does not cover exactly the registered cells")
    if constructions is None:
        constructions = manifest_range_constructions(manifest)
    for cell in cells:
        key = canonical_bytes(cell)
        label = f"{cell['street']} {cell['node_role']} {cell['hero_position']} v {cell['opponent_position']} {cell['texture_class']}"
        if registered[key] not in ("root", "natural", "subgame"):
            raise ContractError(
                f"round {registration['round_key']} cell {label} is registered as {registered[key]!r}: only root, "
                "natural or subgame ranges can be registered, never forced")
        if key not in constructions:
            raise ContractError(
                f"round {registration['round_key']} cell {label} has no harvest scenario declaring its range construction")
        if constructions[key] != registered[key]:
            raise ContractError(
                f"round {registration['round_key']} cell {label} range construction differs from its registration: "
                f"registered {registered[key]}, manifest {constructions[key]}")
    return registration
