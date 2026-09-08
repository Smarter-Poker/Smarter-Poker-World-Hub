#!/usr/bin/env python3
"""Hermetic tests for the V31 worker contract and Pio parser."""

from __future__ import annotations

import hashlib
import json
import sys
import tempfile
import unittest
import uuid
from pathlib import Path

HERE = Path(__file__).resolve().parent
if str(HERE) not in sys.path:
    sys.path.insert(0, str(HERE))

from contract import (  # noqa: E402
    COMBO_ORDER,
    MANIFEST_CONTRACT,
    RANGE_BUNDLE_CONTRACT,
    ContractError,
    load_manifest,
    pipeline_bundle_checksum,
)
from gateway import canonical_json, sign_request  # noqa: E402
from pio_upi import (  # noqa: E402
    PioError,
    analyze_node,
    harvest_node,
    run_self_test,
    setup_commands,
    target_context,
    texture_class,
    validate_pipeline_imports,
)
from worker import source_receipt_is_valid  # noqa: E402


def digest(payload: bytes) -> str:
    return hashlib.sha256(payload).hexdigest()


def vector(one: float | None = None, rest: str = "0") -> str:
    first = rest if one is None else str(one)
    return " ".join([first] + [rest] * 1325)


def base_scenario() -> dict:
    return {
        "scenario_id": "cash.srp.sb.bb.10.AsKd7c",
        "game_family": "cash",
        "objective": "cash_ev",
        "utility_context": "cash_ev",
        "table_size": 6,
        "pot_type": "limped",
        "oop_position": "SB",
        "ip_position": "BB",
        "depth_bucket": 10,
        "preflop_aggressor_solver_player": None,
        "flop_board": "AsKd7c",
        "pot_chips": 100,
        "effective_stack_chips": 1000,
        "chips_per_bb": 100,
        "rake": [0, 0, 0, 0],
        "icm_command": None,
        "oop_range_path": "ranges/oop.txt",
        "oop_range_checksum": "a" * 64,
        "ip_range_path": "ranges/ip.txt",
        "ip_range_checksum": "b" * 64,
        "tree_lines": [[50, 100], [100, 200]],
        "solve_accuracy": 0.5,
        "targets": [
            {
                "target_id": "cash.open.flop",
                "node": "r:0",
                "board": "AsKd7c",
                "node_role": "open",
                "facing_kind": "none",
                "facing_size_bucket": "none",
                "expected_children": ["c", "b50", "b1000"],
            }
        ],
    }


class NodeLineTests(unittest.TestCase):
    def line(self, node: str, preflop: int | None = None):
        return analyze_node(
            node,
            root_pot_chips=100,
            effective_stack_chips=1000,
            preflop_aggressor=preflop,
        )

    def test_every_phase4_role_is_derived_from_the_line(self):
        self.assertEqual(self.line("r:0").node_role, "open")
        self.assertEqual(self.line("r:0", 0).node_role, "cbet")
        self.assertEqual(self.line("r:0:c:c:2h", 1).node_role, "probe")
        self.assertEqual(self.line("r:0:c:c:2h", 0).node_role, "delayed_cbet")
        self.assertEqual(self.line("r:0:b50:c:2h").node_role, "barrel")
        self.assertEqual(self.line("r:0:b50").node_role, "facing_bet")
        self.assertEqual(self.line("r:0:b50:b150:b300").node_role, "facing_raise")
        self.assertEqual(self.line("r:0:c:b50:b150").node_role, "check_raise")
        self.assertEqual(self.line("r:0:b50:b150").node_role, "bet_raise")
        self.assertEqual(self.line("r:0:b1000").node_role, "all_in")
        with self.assertRaises(PioError):
            self.line("r:0", 1)

    def test_size_buckets_use_the_live_engine_denominators(self):
        facing_bet = self.line("r:0:b50")
        self.assertEqual(facing_bet.facing_size_bucket, "small")
        facing_raise = self.line("r:0:b50:b150")
        self.assertEqual(facing_raise.facing_size_bucket, "small")
        self.assertEqual(facing_raise.facing_target_chips, 150)
        self.assertEqual(facing_raise.facing_actor_total_chips, 1000)

    def test_target_cannot_relabel_a_proven_line(self):
        scenario = base_scenario()
        target = dict(scenario["targets"][0])
        target["node_role"] = "cbet"
        with self.assertRaises(PioError):
            target_context(scenario, target)

    def test_texture_mirror(self):
        validate_pipeline_imports()
        self.assertEqual(texture_class("AsKd7c"), "Arud")
        self.assertEqual(texture_class("QhJdTh"), "Btuc")
        self.assertEqual(texture_class("As2s3d4s"), "Atuc")


class PioHarvestTests(unittest.TestCase):
    def fake_pio(self, command: str) -> str:
        if command == "show_children r:0":
            return "r:0:c r:0:b50 r:0:b1000"
        if command == "show_strategy r:0":
            return "\n".join((vector(0.2), vector(0.8), vector(0.0)))
        if command == "show_range OOP r:0":
            return vector(1.0)
        if command == "calc_ev OOP r:0":
            return vector(180.0, "nan")
        if command == "calc_ev OOP r:0:c":
            return vector(100.0, "nan")
        if command == "calc_ev OOP r:0:b50":
            return vector(200.0, "nan")
        if command == "calc_ev OOP r:0:b1000":
            return vector(0.0, "nan")
        if command == "calc_exploitability":
            return "exploitability 0.1"
        raise AssertionError(f"unexpected Pio command: {command}")

    def test_full_suit_aware_node_contains_policy_action_ev_and_line_proof(self):
        scenario = base_scenario()
        node = harvest_node(
            self.fake_pio,
            scenario,
            scenario["targets"][0],
            manifest_checksum="c" * 64,
            source_combo_order_checksum="d" * 64,
            range_bundle_checksum="e" * 64,
        )
        self.assertEqual(node["line_proof"]["hero_solver_player"], 0)
        self.assertEqual(node["line_proof"]["root_pot_chips"], 100)
        self.assertEqual(node["line_proof"]["effective_stack_chips"], 1000)
        self.assertEqual(node["line_proof"]["chips_per_bb"], 100)
        self.assertEqual(node["node_context"]["node_role"], "open")
        self.assertEqual(node["action_specs"]["b50"]["size_value"], 0.5)
        self.assertEqual(node["action_specs"]["b1000"]["family"], "all_in")
        self.assertEqual(node["frequencies"]["b50"][0], 0.8)
        self.assertEqual(node["policy_evs_bb"][0], 1.8)
        self.assertEqual(node["action_evs_bb"]["b50"][0], 2.0)
        self.assertEqual(node["matchups"][0], 1.0)
        self.assertIsNone(node["policy_evs_bb"][1])
        self.assertNotIn("node_checksum", node)

    def test_approved_self_test_reads_real_solver_outputs(self):
        scenario = base_scenario()
        result = run_self_test(
            self.fake_pio,
            scenario,
            {
                "node": "r:0",
                "solver_player": 0,
                "expected_children": ["c", "b50", "b1000"],
                "weighted_policy_ev_min_bb": 1.7,
                "weighted_policy_ev_max_bb": 1.9,
                "max_exploitability_pct": 0.2,
            },
        )
        self.assertAlmostEqual(result["weighted_policy_ev_bb"], 1.8)

    def test_rake_and_exactly_one_icm_mode_precede_tree_build(self):
        scenario = base_scenario()
        commands = setup_commands(scenario, [1.0] * 1326, [1.0] * 1326)
        self.assertLess(commands.index("set_rake 0 0 0 0"), commands.index("build_tree"))
        self.assertFalse(any(command.startswith("set_icm") for command in commands))
        scenario["objective"] = "icm"
        scenario["icm_command"] = "set_icm 100 50 0"
        commands = setup_commands(scenario, [1.0] * 1326, [1.0] * 1326)
        self.assertEqual(sum(command.startswith("set_icm ") for command in commands), 1)
        self.assertLess(commands.index("set_icm 100 50 0"), commands.index("build_tree"))


class ManifestAndGatewayTests(unittest.TestCase):
    def test_source_receipt_requires_the_exact_id_and_nonzero_lowercase_sha256(self):
        artifact = {"id": "11111111-1111-4111-8111-111111111111"}
        self.assertTrue(source_receipt_is_valid(artifact["id"], "a" * 64, artifact))
        self.assertFalse(source_receipt_is_valid(str(uuid.uuid4()), "a" * 64, artifact))
        self.assertFalse(source_receipt_is_valid(artifact["id"], "0" * 64, artifact))
        self.assertFalse(source_receipt_is_valid(artifact["id"], "A" * 64, artifact))
        self.assertFalse(source_receipt_is_valid(artifact["id"], "g" * 64, artifact))

    def test_manifest_binds_pipeline_ranges_combo_order_and_icm_model(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            pipeline_root = root / "repo"
            input_root = root / "inputs"
            (pipeline_root / "scripts").mkdir(parents=True)
            (input_root / "ranges").mkdir(parents=True)
            (input_root / "models").mkdir(parents=True)
            pipeline_file = pipeline_root / "scripts" / "worker.py"
            pipeline_file.write_text("print('pinned')\n", encoding="utf-8")
            pipeline_receipts = [
                {"path": "scripts/worker.py", "checksum": digest(pipeline_file.read_bytes())}
            ]
            range_payload = ("1 " + "0 " * 1325).strip().encode()
            range_files = []
            for name in ("oop.txt", "ip.txt"):
                path = input_root / "ranges" / name
                path.write_bytes(range_payload)
                range_files.append(
                    {"path": f"ranges/{name}", "checksum": digest(range_payload)}
                )
            range_bundle = {
                "contract": RANGE_BUNDLE_CONTRACT,
                "files": range_files,
            }
            range_bundle_bytes = canonical_json(range_bundle)
            (input_root / "ranges" / "bundle.json").write_bytes(range_bundle_bytes)
            combo_bytes = (COMBO_ORDER + "\n").encode()
            (input_root / "combo.txt").write_bytes(combo_bytes)
            icm_bytes = b'{"contract":"reviewed-test-model"}\n'
            (input_root / "models" / "icm.json").write_bytes(icm_bytes)
            scenario = base_scenario()
            scenario["oop_range_checksum"] = digest(range_payload)
            scenario["ip_range_checksum"] = digest(range_payload)
            manifest = {
                "contract": MANIFEST_CONTRACT,
                "enabled": True,
                "dataset_key": "phase4.unit.test",
                "manifest_version": "1",
                "pipeline_commit": "1" * 40,
                "pipeline_bundle_checksum": pipeline_bundle_checksum(
                    pipeline_root, pipeline_receipts
                ),
                "pipeline_files": pipeline_receipts,
                "solver_version": "PioSOLVER-test",
                "solver_binary_checksum": "2" * 64,
                "range_bundle_path": "ranges/bundle.json",
                "range_bundle_checksum": digest(range_bundle_bytes),
                "source_combo_order_path": "combo.txt",
                "source_combo_order_checksum": digest(combo_bytes),
                "icm_model_path": "models/icm.json",
                "icm_model_checksum": digest(icm_bytes),
                "input_bundle_id": "11111111-1111-4111-8111-111111111111",
                "input_bundle_checksum": "3" * 64,
                "quality_gates": {
                    "max_frequency_mae": 0.1,
                    "max_sizing_mae": 0.1,
                    "max_policy_ev_mae_bb": 0.2,
                    "max_action_regret_bb": 0.1,
                    "min_regret_coverage": 0.8,
                },
                "self_test": {
                    "scenario_id": scenario["scenario_id"],
                    "node": "r:0",
                    "solver_player": 0,
                    "expected_children": ["c", "b50", "b1000"],
                    "weighted_policy_ev_min_bb": 1,
                    "weighted_policy_ev_max_bb": 2,
                    "max_exploitability_pct": 0.5,
                },
                "scenarios": [scenario],
            }
            manifest_path = root / "manifest.json"
            manifest_bytes = canonical_json(manifest)
            manifest_path.write_bytes(manifest_bytes)
            loaded = load_manifest(
                manifest_path,
                expected_checksum=digest(manifest_bytes),
                input_root=input_root,
                pipeline_root=pipeline_root,
            )
            self.assertEqual(loaded.provenance["manifest_checksum"], digest(manifest_bytes))
            (input_root / "ranges" / "oop.txt").write_text("0 " * 1326, encoding="utf-8")
            with self.assertRaises(ContractError):
                load_manifest(
                    manifest_path,
                    expected_checksum=digest(manifest_bytes),
                    input_root=input_root,
                    pipeline_root=pipeline_root,
                )

    def test_hmac_signature_binds_principal_time_nonce_and_body(self):
        signature = sign_request(
            bytes.fromhex("ab" * 32),
            "M1",
            "1700000000",
            "11111111-1111-4111-8111-111111111111",
            "cd" * 32,
        )
        self.assertEqual(len(signature), 64)
        self.assertNotEqual(
            signature,
            sign_request(
                bytes.fromhex("ab" * 32),
                "M2",
                "1700000000",
                "11111111-1111-4111-8111-111111111111",
                "cd" * 32,
            ),
        )


if __name__ == "__main__":
    unittest.main(verbosity=2)
