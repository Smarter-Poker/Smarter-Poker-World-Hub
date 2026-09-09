#!/usr/bin/env python3
"""Hermetic tests for the V31 worker contract and Pio parser."""

from __future__ import annotations

import hashlib
import json
import os
import sys
import tempfile
import textwrap
import types
import unittest
import uuid
from pathlib import Path
from unittest import mock

HERE = Path(__file__).resolve().parent
if str(HERE) not in sys.path:
    sys.path.insert(0, str(HERE))

from contract import (  # noqa: E402
    ICM_MODEL_CONTRACT,
    MANIFEST_CONTRACT,
    RANGE_BUNDLE_CONTRACT,
    ApprovedManifest,
    ContractError,
    canonical_hand_order_tokens,
    load_manifest,
    pipeline_bundle_checksum,
)
from gateway import canonical_json, sign_request  # noqa: E402
from pio_upi import (  # noqa: E402
    PioError,
    PioProcess,
    analyze_node,
    harvest_node,
    run_self_test,
    solve_scenario,
    setup_commands,
    target_context,
    texture_class,
    validate_pipeline_imports,
)
from worker import (  # noqa: E402
    artifact_id,
    artifact_matches,
    load_checkpoint,
    owned_targets,
    scenario_hash,
    source_receipt_is_valid,
)
import compactor  # noqa: E402


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
        "rake": [0, 0],
        "icm_model_id": None,
        "oop_range_path": "ranges/oop.txt",
        "oop_range_checksum": "a" * 64,
        "ip_range_path": "ranges/ip.txt",
        "ip_range_checksum": "b" * 64,
        "tree_lines": [[50, 100], [100, 200]],
        "solve_accuracy": 0.005,
        "targets": [
            {
                "target_id": "cash.open.flop",
                "machine_id": "M1",
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
        self.assertEqual(
            self.line("r:0:b50:b150:b300:b600").node_role,
            "facing_raise",
        )
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
        # A raise to 250 after a 50-chip bet is a 200-chip raise over a
        # 200-chip pot after the raiser calls: exactly 100%, therefore mid.
        # Dividing by the pot after the *next* player calls incorrectly makes
        # this 33% and routes the policy into the small bucket.
        self.assertEqual(
            self.line("r:0:b50:b250").facing_size_bucket,
            "mid",
        )

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
            return "\n".join((vector(180.0, "nan"), vector(4.0)))
        if command == "calc_ev OOP r:0:c":
            return "\n".join((vector(100.0, "nan"), vector(4.0)))
        if command == "calc_ev OOP r:0:b50":
            return "\n".join((vector(200.0, "nan"), vector(4.0)))
        if command == "calc_ev OOP r:0:b1000":
            return "\n".join((vector(0.0, "nan"), vector(4.0)))
        if command == "calc_results":
            return "\n".join(
                (
                    "running time: 10",
                    "EV OOP: 180",
                    "EV IP: -180",
                    "OOP's MES: 180.1",
                    "IP's MES: -179.9",
                    "Exploitable for: 0.1",
                )
            )
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
        self.assertEqual(node["matchups"][0], 4.0)
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
        self.assertLess(commands.index("reset_icm_tables"), commands.index("set_rake 0 0"))
        self.assertLess(commands.index("set_rake 0 0"), commands.index("build_tree"))
        self.assertFalse(any(command.startswith("set_icm") for command in commands))
        self.assertIn("set_accuracy 0.005 fraction", commands)
        self.assertEqual(commands[commands.index("set_accuracy 0.005 fraction") + 1], "go")
        scenario["objective"] = "icm"
        scenario["rake"] = None
        scenario["icm_model_id"] = "satellite.1000"
        model = {
            "model_id": "satellite.1000",
            "oop_stack_chips": 1000,
            "ip_stack_chips": 1400,
            "points": (
                ("OOP", 0, 0.0),
                ("OOP", 2000, 1.0),
                ("IP", 400, 0.2),
                ("IP", 2400, 1.0),
            ),
        }
        commands = setup_commands(
            scenario, [1.0] * 1326, [1.0] * 1326, icm_model=model
        )
        self.assertLess(commands.index("set_rake 0 0"), commands.index("reset_icm_tables"))
        self.assertLess(commands.index("reset_icm_tables"), commands.index("build_tree"))
        self.assertEqual(sum(command.startswith("set_icm ") for command in commands), 1)
        self.assertLess(commands.index("set_icm 1000 1400"), commands.index("build_tree"))
        self.assertEqual(sum(command.startswith("set_icm_point ") for command in commands), 4)

    def test_rake_and_icm_cannot_share_a_tree_and_go_never_uses_accuracy_as_seconds(self):
        scenario = base_scenario()
        scenario["objective"] = "icm"
        scenario["icm_model_id"] = "satellite.1000"
        with self.assertRaises(PioError):
            setup_commands(
                scenario,
                [1.0] * 1326,
                [1.0] * 1326,
                icm_model={
                    "model_id": "satellite.1000",
                    "oop_stack_chips": 1000,
                    "ip_stack_chips": 1000,
                    "points": (
                        ("OOP", 0, 0),
                        ("OOP", 2000, 1),
                        ("IP", 0, 0),
                        ("IP", 2000, 1),
                    ),
                },
            )

    def test_solve_scenario_uses_named_results_and_rejects_an_under_solved_tree(self):
        scenario = base_scenario()
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            (root / "ranges").mkdir()
            payload = " ".join(["1"] * 1326)
            (root / scenario["oop_range_path"]).write_text(payload, encoding="utf-8")
            (root / scenario["ip_range_path"]).write_text(payload, encoding="utf-8")
            manifest = ApprovedManifest(root / "manifest.json", root, {}, "a" * 64)
            commands: list[str] = []

            def pio(command: str) -> str:
                commands.append(command)
                if command == "calc_results":
                    return "\n".join(
                        (
                            "running time: 10",
                            "EV OOP: 1",
                            "EV IP: -1",
                            "OOP's MES: 1.6",
                            "IP's MES: -0.4",
                            "Exploitable for: 0.6",
                        )
                    )
                return ""

            with self.assertRaisesRegex(PioError, "stopped above"):
                solve_scenario(pio, scenario, manifest)
            self.assertIn("set_accuracy 0.005 fraction", commands)
            self.assertIn("go", commands)
            self.assertNotIn("go 0.005", commands)
            self.assertEqual(commands[-1], "calc_results")


class PioTransportTests(unittest.TestCase):
    def test_handshake_attestation_async_updates_ack_and_bidirectional_order_remap(self):
        approved_order = tuple(reversed(canonical_hand_order_tokens()))
        pio_to_canonical = list(reversed(range(1326)))
        with tempfile.TemporaryDirectory() as temporary:
            executable = Path(temporary) / "fake-pio"
            executable.write_text(
                textwrap.dedent(
                    f"""\
                    #!/usr/bin/env python3
                    import sys

                    HAND_ORDER = {approved_order!r}
                    PIO_TO_CANONICAL = {pio_to_canonical!r}

                    def emit(*lines):
                        for value in lines:
                            print(value, flush=True)

                    emit("Pio fake startup")
                    for raw in sys.stdin:
                        command = raw.rstrip("\\r\\n")
                        verb = command.split(" ", 1)[0]
                        if command == "set_end_string END":
                            emit("ERROR code 0:", "OK!", "Activation ok!", "set_end_string ok!", "END")
                        elif command == "show_version":
                            emit("PioSOLVER-test", "END")
                        elif command == "show_hand_order":
                            emit(" ".join(HAND_ORDER), "END")
                        elif command == "is_ready":
                            emit("is_ready ok!", "END")
                        elif verb == "set_range":
                            values = command.split()[2:]
                            if (len(values) != 1326 or float(values[0]) != 1
                                    or float(values[-1]) != 0):
                                emit("ERROR bad range order", "END")
                            else:
                                emit("set_range ok!", "END")
                        elif command == "show_range OOP r:0":
                            emit("SOLVER:", "running time: 1", "END")
                            emit(" ".join(str(value) for value in PIO_TO_CANONICAL), "END")
                        elif command == "clear_lines":
                            emit("wrong acknowledgement", "END")
                        else:
                            emit(f"{{verb}} ok!", "END")
                    """
                ),
                encoding="utf-8",
            )
            os.chmod(executable, 0o700)
            with PioProcess(
                executable,
                expected_solver_version="PioSOLVER-test",
                expected_hand_order=approved_order,
            ) as process:
                canonical = [0.0] * 1326
                canonical[-1] = 1.0
                self.assertEqual(
                    process.command("set_range OOP " + " ".join(str(value) for value in canonical)),
                    "set_range ok!",
                )
                remapped = [float(value) for value in process.command("show_range OOP r:0").split()]
                self.assertEqual(remapped, [float(value) for value in range(1326)])
                with self.assertRaisesRegex(PioError, "invalid acknowledgement"):
                    process.command("clear_lines")


class ManifestAndGatewayTests(unittest.TestCase):
    def test_compactor_never_bypasses_pinned_input_verification(self):
        sentinel = object()
        args = types.SimpleNamespace(manifest="manifest.json", input_root="inputs")
        with mock.patch.object(compactor, "load_manifest", return_value=sentinel) as loader:
            self.assertIs(compactor.load(args), sentinel)
        kwargs = loader.call_args.kwargs
        self.assertNotEqual(kwargs.get("verify_inputs"), False)
        self.assertNotEqual(kwargs.get("verify_pipeline"), False)

    def test_solver_hosts_own_disjoint_targets_and_every_context_has_a_real_holdout(self):
        train = base_scenario()
        holdout = json.loads(json.dumps(train))
        holdout["scenario_id"] = "cash.srp.sb.bb.10.AhQc6d"
        holdout["flop_board"] = "AhQc6d"
        holdout["targets"][0].update(
            {
                "target_id": "cash.open.flop.holdout",
                "machine_id": "M2",
                "board": "AhQc6d",
            }
        )
        manifest = ApprovedManifest(
            Path("manifest.json"), Path("inputs"), {"scenarios": [train, holdout]}, "a" * 64
        )
        self.assertEqual(len(compactor.declared_coverage(manifest)), 1)
        self.assertEqual(owned_targets(train, "M1"), train["targets"])
        self.assertEqual(owned_targets(train, "M2"), [])

        missing_holdout = ApprovedManifest(
            Path("manifest.json"), Path("inputs"), {"scenarios": [train]}, "a" * 64
        )
        with self.assertRaisesRegex(ContractError, "M1 and M2"):
            compactor.declared_coverage(missing_holdout)

        duplicated_board = json.loads(json.dumps(holdout))
        duplicated_board["scenario_id"] = "cash.srp.sb.bb.10.AhKc7d"
        duplicated_board["flop_board"] = "AhKc7d"
        duplicated_board["targets"][0]["board"] = "AhKc7d"
        with self.assertRaisesRegex(ContractError, "rank-disjoint boards"):
            compactor.declared_coverage(
                ApprovedManifest(
                    Path("manifest.json"),
                    Path("inputs"),
                    {"scenarios": [train, duplicated_board]},
                    "a" * 64,
                )
            )
        self.assertEqual(
            compactor.board_rank_signature("AsKd7c"),
            compactor.board_rank_signature("7hAcKd"),
        )
        self.assertNotEqual(
            compactor.board_rank_signature("AsKd7c"),
            compactor.board_rank_signature("AhQc6d"),
        )

    def test_source_receipt_requires_the_exact_id_and_nonzero_lowercase_sha256(self):
        artifact = {"id": "11111111-1111-4111-8111-111111111111"}
        self.assertTrue(source_receipt_is_valid(artifact["id"], "a" * 64, artifact))
        self.assertFalse(source_receipt_is_valid(str(uuid.uuid4()), "a" * 64, artifact))
        self.assertFalse(source_receipt_is_valid(artifact["id"], "0" * 64, artifact))
        self.assertFalse(source_receipt_is_valid(artifact["id"], "A" * 64, artifact))
        self.assertFalse(source_receipt_is_valid(artifact["id"], "g" * 64, artifact))

    def test_checkpoint_parser_rejects_duplicate_keys_and_malformed_nodes_cleanly(self):
        with tempfile.TemporaryDirectory() as directory:
            checkpoint = Path(directory) / "artifact.json"
            checkpoint.write_text('{"id":"one","id":"two"}', encoding="utf-8")
            with self.assertRaisesRegex(ContractError, "repeats JSON key"):
                load_checkpoint(checkpoint)
            checkpoint.write_text('{"value":NaN}', encoding="utf-8")
            with self.assertRaisesRegex(ContractError, "non-JSON number"):
                load_checkpoint(checkpoint)
            checkpoint.write_text('{"value":1e400}', encoding="utf-8")
            with self.assertRaisesRegex(ContractError, "non-finite JSON number"):
                load_checkpoint(checkpoint)
            checkpoint.write_bytes(b"\xff")
            with self.assertRaisesRegex(ContractError, "unreadable"):
                load_checkpoint(checkpoint)

        scenario = base_scenario()
        target = scenario["targets"][0]
        manifest = types.SimpleNamespace(
            checksum="a" * 64,
            raw={
                "dataset_key": "horse.v31.test",
                "source_combo_order_checksum": "b" * 64,
                "range_bundle_checksum": "c" * 64,
            },
        )
        malformed = {
            "id": artifact_id(manifest, "M1", target["target_id"]),
            "scenario_hash": scenario_hash(
                manifest, scenario["scenario_id"], target["target_id"]
            ),
            "game_family": "cash",
            "stack_depth": 10,
            "street": "flop",
            "solved_at": "2026-09-08T00:00:00.000Z",
            "strategy_matrix_v2": {
                "schema": "smarter-poker.pio-artifact.v31.1",
                "combo_order": "card=rank*4+suit; combo=b*(b-1)/2+a; 2c2d=0..AhAs=1325",
                "nodes": [None],
            },
        }
        self.assertFalse(artifact_matches(malformed, manifest, "M1", scenario, target))

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
            combo_bytes = (" ".join(canonical_hand_order_tokens()) + "\n").encode()
            (input_root / "combo.txt").write_bytes(combo_bytes)
            icm_bundle = {
                "contract": ICM_MODEL_CONTRACT,
                "models": [
                    {
                        "model_id": "satellite.1000",
                        "oop_stack_chips": 1000,
                        "ip_stack_chips": 1400,
                        "points": [
                            {"player": "OOP", "stack_chips": 0, "utility": 0},
                            {"player": "OOP", "stack_chips": 2000, "utility": 1},
                            {"player": "IP", "stack_chips": 400, "utility": 0.2},
                            {"player": "IP", "stack_chips": 2400, "utility": 1},
                        ],
                    }
                ],
            }
            icm_bytes = canonical_json(icm_bundle)
            (input_root / "models" / "icm.json").write_bytes(icm_bytes)
            scenario = base_scenario()
            scenario["oop_range_checksum"] = digest(range_payload)
            scenario["ip_range_checksum"] = digest(range_payload)
            icm_scenario = json.loads(json.dumps(scenario))
            icm_scenario.update(
                {
                    "scenario_id": "tourney.satellite.sb.bb.10.AsKd7c",
                    "game_family": "tourney_icm",
                    "objective": "icm",
                    "utility_context": "satellite",
                    "rake": None,
                    "icm_model_id": "satellite.1000",
                }
            )
            icm_scenario["targets"][0]["target_id"] = "satellite.open.flop"
            icm_scenario["targets"][0]["machine_id"] = "M2"
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
                "scenarios": [scenario, icm_scenario],
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
            self.assertEqual(loaded.source_combo_order, canonical_hand_order_tokens())
            self.assertEqual(loaded.icm_models["satellite.1000"]["ip_stack_chips"], 1400)
            for field, invalid in (
                ("solver_version", " PioSOLVER-test"),
                ("manifest_version", "1\nforged"),
            ):
                invalid_manifest = json.loads(json.dumps(manifest))
                invalid_manifest[field] = invalid
                invalid_bytes = canonical_json(invalid_manifest)
                manifest_path.write_bytes(invalid_bytes)
                with self.assertRaisesRegex(ContractError, "canonical printable text"):
                    load_manifest(
                        manifest_path,
                        expected_checksum=digest(invalid_bytes),
                        input_root=input_root,
                        pipeline_root=pipeline_root,
                        verify_inputs=False,
                        verify_pipeline=False,
                    )
            manifest_path.write_bytes(manifest_bytes)
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
