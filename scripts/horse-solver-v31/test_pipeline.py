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
    ACTION,
    ICM_MODEL_CONTRACT,
    INPUT_BUNDLE_CONTRACT,
    MANIFEST_CONTRACT,
    NODE,
    RANGE_BUNDLE_CONTRACT,
    REQUIRED_PIPELINE_FILES,
    ApprovedManifest,
    ContractError,
    _finite_number,
    _json_bytes,
    canonical_hand_order_tokens,
    input_bundle_checksum,
    input_bundle_id,
    load_manifest,
    load_range_vector,
    pipeline_bundle_checksum,
)
from gateway import (  # noqa: E402
    GatewayError,
    canonical_json,
    decode_error_response,
    decode_success_response,
    sign_request,
)
from pio_upi import (  # noqa: E402
    PioError,
    PioProcess,
    analyze_node,
    harvest_node,
    parse_children,
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
    worker_heartbeat_receipt_is_valid,
)
import compactor  # noqa: E402
import prepare_bundle  # noqa: E402
import worker  # noqa: E402


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
    def test_gateway_response_parser_is_strict_and_operation_bound(self):
        payload = canonical_json(
            {"success": True, "operation": "dataset_contract", "result": {"state": "building"}}
        )
        self.assertEqual(
            decode_success_response(payload, "dataset_contract"), {"state": "building"}
        )
        for invalid in (
            b'{"success":true,"success":false,"operation":"dataset_contract","result":{}}',
            b'{"success":true,"operation":"dataset_contract","result":{"value":NaN}}',
            b'{"success":true,"operation":"dataset_contract","result":{},"extra":1}',
            b'{"success":true,"operation":"other","result":{}}',
        ):
            with self.subTest(invalid=invalid), self.assertRaises(GatewayError):
                decode_success_response(invalid, "dataset_contract")
        self.assertEqual(
            decode_error_response(b'{"success":false,"error":"denied"}', 409), "denied"
        )
        self.assertEqual(
            decode_error_response(b'{"success":false,"error":"one","error":"two"}', 409),
            "HTTP 409",
        )

    def test_strict_json_and_numeric_conversion_fail_as_contract_errors(self):
        with self.assertRaisesRegex(ContractError, "non-finite JSON number"):
            _json_bytes(b'{"value":NaN}', "test payload")
        with self.assertRaisesRegex(ContractError, "finite ingress range"):
            _json_bytes(b'{"value":1e400}', "test payload")
        with self.assertRaisesRegex(ContractError, "exact ingress range"):
            _json_bytes(b'{"value":9007199254740993}', "test payload")
        with self.assertRaisesRegex(ContractError, "exact ingress range"):
            _json_bytes(b'{"value":9007199254740993.0}', "test payload")
        with self.assertRaisesRegex(ContractError, "exact ingress range"):
            _json_bytes(b'{"value":9007199254740991.1}', "test payload")
        with self.assertRaisesRegex(ContractError, "exact ingress range"):
            _json_bytes(b'{"value":1e-400}', "test payload")
        self.assertEqual(
            _json_bytes(b'{"value":9007199254740991}', "test payload")["value"],
            (1 << 53) - 1,
        )
        self.assertEqual(
            _json_bytes(
                b'{"decimal_integer":1.0,"exponent_integer":1e2}', "test payload"
            ),
            {"decimal_integer": 1.0, "exponent_integer": 100.0},
        )
        with self.assertRaisesRegex(ContractError, "Unicode surrogate"):
            _json_bytes(b'{"value":"\\ud800"}', "test payload")
        self.assertEqual(
            _json_bytes('{"value":"😀"}'.encode("utf-8"), "test payload")["value"],
            "😀",
        )
        with self.assertRaisesRegex(ContractError, "nesting exceeds"):
            _json_bytes(("[" * 2000 + "0" + "]" * 2000).encode(), "test payload")
        with self.assertRaisesRegex(ContractError, "outside its allowed range"):
            _finite_number(10**10000, "oversized integer")
        self.assertIsNotNone(ACTION.fullmatch("b" + "1" * 79))
        self.assertIsNone(ACTION.fullmatch("b" + "1" * 80))
        self.assertIsNotNone(NODE.fullmatch("r:0:b75:c:2h"))
        oversized_action = "b" + "9" * 80
        self.assertIsNone(ACTION.fullmatch(oversized_action))
        self.assertIsNone(NODE.fullmatch(f"r:0:{oversized_action}"))
        with self.assertRaisesRegex(PioError, "at least two unique"):
            parse_children(f"r:0:c r:0:{oversized_action}", "r:0")
        self.assertIsNone(NODE.fullmatch("r:1"))

    def test_range_vectors_share_the_strict_numeric_ingress_contract(self):
        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary) / "range.txt"
            valid = [1] + [0] * 1325
            path.write_text(json.dumps(valid), encoding="utf-8")
            self.assertEqual(load_range_vector(path), [float(value) for value in valid])

            underflow = ["1", "1e-400"] + ["0"] * 1324
            path.write_text("[" + ",".join(underflow) + "]", encoding="utf-8")
            with self.assertRaisesRegex(ContractError, "exact ingress range"):
                load_range_vector(path)

            path.write_text(" ".join(underflow), encoding="utf-8")
            with self.assertRaisesRegex(ContractError, "exact ingress range"):
                load_range_vector(path)

            path.write_text(json.dumps(["1"] + [0] * 1325), encoding="utf-8")
            with self.assertRaisesRegex(ContractError, "must be numeric"):
                load_range_vector(path)

            path.write_bytes(b"\xff")
            with self.assertRaisesRegex(ContractError, "readable strict UTF-8"):
                load_range_vector(path)

    def test_worker_local_preflight_never_loads_a_gateway_secret(self):
        scenario = base_scenario()
        manifest = ApprovedManifest(
            Path("manifest.json"),
            Path("inputs"),
            {
                "solver_version": "PioSOLVER-test",
                "self_test": {
                    "scenario_id": scenario["scenario_id"],
                },
                "scenarios": [scenario],
            },
            "a" * 64,
            source_combo_order=canonical_hand_order_tokens(),
        )
        args = types.SimpleNamespace(
            machine="M1",
            manifest="manifest.json",
            input_root="inputs",
            work_directory=None,
            preflight_only=True,
        )
        executable = mock.MagicMock()
        executable.exists.return_value = True
        executable.is_file.return_value = True
        process = mock.MagicMock()
        process.__enter__.return_value.command = object()
        receipt = {"weighted_policy_ev_bb": 1.0, "exploitability_pct": 0.01}
        with mock.patch.dict(worker.os.environ, {"PIO_EXE": "pio"}, clear=False), mock.patch.object(
            worker, "load_manifest", return_value=manifest
        ), mock.patch.object(worker, "validate_pipeline_imports"), mock.patch.object(
            worker, "Path", return_value=executable
        ), mock.patch.object(worker.os, "access", return_value=True), mock.patch.object(
            worker, "verify_environment"
        ), mock.patch.object(worker, "PioProcess", return_value=process), mock.patch.object(
            worker, "solver_self_test", return_value=(scenario, receipt)
        ), mock.patch.object(
            worker.GatewayClient,
            "from_environment",
            side_effect=AssertionError("preflight tried to load a gateway secret"),
        ):
            worker.run(args)

    def test_preparer_writes_one_unapproved_manifest_and_exact_approval_payload(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            inputs = root / "inputs"
            inputs.mkdir()
            draft = {
                "contract": MANIFEST_CONTRACT,
                "enabled": True,
                "dataset_key": "phase4.prepare.test",
                "manifest_version": "v31.test",
                "pipeline_commit": "1" * 40,
                "pipeline_bundle_checksum": "2" * 64,
                "pipeline_files": [
                    {"path": path, "checksum": "3" * 64}
                    for path in sorted(REQUIRED_PIPELINE_FILES)
                ],
                "solver_version": "PioSOLVER-test",
                "solver_binary_checksum": "4" * 64,
                "range_bundle_path": "ranges/bundle.json",
                "range_bundle_checksum": "e" * 64,
                "source_combo_order_path": "inputs/combo-order.txt",
                "source_combo_order_checksum": "d" * 64,
                "icm_model_path": "inputs/icm-model.json",
                "icm_model_checksum": "f" * 64,
                "input_bundle_id": prepare_bundle.PLACEHOLDER_BUNDLE_ID,
                "input_bundle_checksum": prepare_bundle.ZERO_CHECKSUM,
                "quality_gates": {},
                "self_test": {},
                "scenarios": [],
            }
            draft_path = root / "draft.json"
            draft_path.write_bytes(canonical_json(draft))
            args = types.SimpleNamespace(
                manifest_draft=str(draft_path),
                input_root=str(inputs),
                manifest_output="manifests/v31.json",
                approval_output="approvals/v31.json",
                bundle_key="phase4.bootstrap.inputs",
                bundle_version="2",
                approval_note="reviewed fixture inputs",
            )

            def accept_manifest(path, **_kwargs):
                return types.SimpleNamespace(raw=json.loads(Path(path).read_text(encoding="utf-8")))

            with mock.patch.object(prepare_bundle, "verify_published_pipeline"), mock.patch.object(
                prepare_bundle, "load_manifest", side_effect=accept_manifest
            ):
                result = prepare_bundle.prepare(args)
                repeated = prepare_bundle.prepare(args)
            self.assertEqual(result, repeated)
            self.assertFalse(result["approved"])
            manifest_bytes = (inputs / "manifests" / "v31.json").read_bytes()
            approval = json.loads((inputs / "approvals" / "v31.json").read_text(encoding="utf-8"))
            manifest = json.loads(manifest_bytes)
            self.assertEqual(manifest["input_bundle_id"], result["input_bundle_id"])
            self.assertEqual(manifest["input_bundle_checksum"], result["input_bundle_checksum"])
            self.assertEqual(digest(manifest_bytes), result["manifest_checksum"])
            self.assertEqual(approval["files"][-1]["checksum"], result["manifest_checksum"])
            self.assertEqual(input_bundle_checksum(approval), result["input_bundle_checksum"])

            conflicting_args = types.SimpleNamespace(**vars(args))
            conflicting_args.manifest_output = "manifests/conflict.json"
            conflicting_args.approval_output = "approvals/conflict.json"
            (inputs / "approvals" / "conflict.json").write_text(
                "conflict", encoding="utf-8"
            )
            with mock.patch.object(
                prepare_bundle, "verify_published_pipeline"
            ), mock.patch.object(
                prepare_bundle, "load_manifest", side_effect=accept_manifest
            ), self.assertRaisesRegex(
                ContractError, "refusing to replace"
            ):
                prepare_bundle.prepare(conflicting_args)
            self.assertFalse((inputs / "manifests" / "conflict.json").exists())

    def test_input_bundle_identity_exists_before_the_manifest_receipt(self):
        bundle = {
            "bundle_key": "phase4.bootstrap.inputs",
            "bundle_version": "2",
            "range_bundle_checksum": "e" * 64,
            "source_combo_order_checksum": "d" * 64,
            "icm_model_checksum": "f" * 64,
            "approval_note": "bootstrap behavior probe only",
            "files": [
                {"kind": "range", "path": "ranges/test.txt", "checksum": "e" * 64},
                {
                    "kind": "combo_order",
                    "path": "combo/order.txt",
                    "checksum": "d" * 64,
                },
                {
                    "kind": "icm_model",
                    "path": "icm/model.json",
                    "checksum": "f" * 64,
                },
                {
                    "kind": "scenario_manifest",
                    "path": "manifests/phase4.json",
                    "checksum": "a" * 64,
                },
            ],
        }
        expected = "91b7ae079daa5100ac80001c50fcca145e5ced8048adf455b4f5e84a5e5aaf51"
        self.assertEqual(INPUT_BUNDLE_CONTRACT, "smarter-poker.horse-solver-v31-input-bundle.v2")
        self.assertEqual(input_bundle_checksum(bundle), expected)
        self.assertEqual(input_bundle_id(expected), "91b7ae07-9daa-5100-8c80-001c50fcca14")
        changed_manifest = json.loads(json.dumps(bundle))
        changed_manifest["files"][-1]["checksum"] = "b" * 64
        self.assertEqual(input_bundle_checksum(changed_manifest), expected)
        changed_input = json.loads(json.dumps(bundle))
        changed_input["files"][0]["checksum"] = "c" * 64
        with self.assertRaisesRegex(ContractError, "exactly one range receipt"):
            input_bundle_checksum(changed_input)
        uppercase_input = json.loads(json.dumps(bundle))
        uppercase_input["range_bundle_checksum"] = "E" * 64
        uppercase_input["files"][0]["checksum"] = "E" * 64
        with self.assertRaisesRegex(ContractError, "lowercase"):
            input_bundle_checksum(uppercase_input)
        ambiguous_path = json.loads(json.dumps(bundle))
        ambiguous_path["files"][0]["path"] = "ranges/v1..txt"
        with self.assertRaisesRegex(ContractError, "canonical relative path"):
            input_bundle_checksum(ambiguous_path)

        for field, invalid in (
            ("bundle_key", 123),
            ("bundle_version", 2),
            ("range_bundle_checksum", int("1" * 64)),
        ):
            non_string = json.loads(json.dumps(bundle))
            non_string[field] = invalid
            with self.subTest(field=field), self.assertRaisesRegex(
                ContractError, "JSON string"
            ):
                input_bundle_checksum(non_string)
        for field, invalid in (
            ("kind", 7),
            ("path", 12),
            ("checksum", int("1" * 64)),
        ):
            non_string_file = json.loads(json.dumps(bundle))
            non_string_file["files"][3][field] = invalid
            with self.subTest(file_field=field), self.assertRaisesRegex(
                ContractError, "JSON string"
            ):
                input_bundle_checksum(non_string_file)

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
        artifact = {
            "id": "11111111-1111-4111-8111-111111111111",
            "strategy_matrix_v2": {"nodes": [{"node": "r:0"}]},
        }
        receipt = {
            "source_row_id": artifact["id"],
            "source_artifact_checksum": "a" * 64,
            "node_count": 1,
            "idempotent": False,
        }
        self.assertTrue(source_receipt_is_valid(receipt, artifact))
        for field, invalid in (
            ("source_row_id", str(uuid.uuid4())),
            ("source_artifact_checksum", "0" * 64),
            ("source_artifact_checksum", "A" * 64),
            ("source_artifact_checksum", "g" * 64),
            ("node_count", 2),
            ("node_count", True),
            ("idempotent", 0),
        ):
            malformed = dict(receipt)
            malformed[field] = invalid
            with self.subTest(field=field, invalid=invalid):
                self.assertFalse(source_receipt_is_valid(malformed, artifact))
        extra = dict(receipt, ignored=True)
        self.assertFalse(source_receipt_is_valid(extra, artifact))

    def test_compactor_control_receipts_are_exact_and_typed(self):
        registration = {
            "dataset_id": "11111111-1111-4111-8111-111111111111",
            "state": "building",
            "idempotent": False,
        }
        cell = {"cell_key_checksum": "a" * 64}
        seal = {"dataset_checksum": "b" * 64, "idempotent": True}
        self.assertTrue(compactor.registration_receipt_is_valid(registration))
        self.assertTrue(compactor.build_cell_receipt_is_valid(cell))
        self.assertTrue(compactor.seal_receipt_is_valid(seal))
        self.assertFalse(
            compactor.registration_receipt_is_valid(dict(registration, ignored=True))
        )
        self.assertFalse(
            compactor.registration_receipt_is_valid({**registration, "idempotent": 0})
        )
        self.assertFalse(compactor.build_cell_receipt_is_valid({**cell, "ignored": True}))
        self.assertFalse(compactor.build_cell_receipt_is_valid({"cell_key_checksum": "0" * 64}))
        self.assertFalse(compactor.seal_receipt_is_valid({**seal, "idempotent": 1}))

    def test_compactor_rejects_an_unsealed_or_incomplete_terminal_dataset(self):
        dataset_id = "11111111-1111-4111-8111-111111111111"
        complete = {
            "dataset_id": dataset_id,
            "state": "active",
            "ingested_source_artifacts": 2,
            "source_receipt_rows": 2,
            "runtime_cells": 3,
            "source_max_at": "2026-09-09T00:00:00Z",
            "dataset_checksum": "a" * 64,
        }
        self.assertEqual(
            compactor.dataset_item({"datasets": [complete]}, dataset_id, 3), complete
        )
        for changed in (
            {**complete, "dataset_checksum": None},
            {**complete, "runtime_cells": 0},
            {**complete, "runtime_cells": 2},
        ):
            with self.subTest(changed=changed), self.assertRaisesRegex(
                GatewayError, "unsealed|declared coverage"
            ):
                compactor.dataset_item({"datasets": [changed]}, dataset_id, 3)

    def test_heartbeat_receipts_are_exact_and_reject_boolean_sequences(self):
        run_id = "11111111-1111-4111-8111-111111111111"
        worker_receipt = {
            "accepted": True,
            "idempotent": False,
            "machine_id": "M1",
            "run_id": run_id,
            "sequence": 1,
            "rows_per_hour": 12.5,
            "eta_at": None,
        }
        compact_receipt = {
            "accepted": True,
            "idempotent": False,
            "run_id": run_id,
            "sequence": 1,
            "compact_lag_seconds": 0,
        }
        self.assertTrue(worker_heartbeat_receipt_is_valid(worker_receipt, "M1", run_id, 1))
        self.assertTrue(compactor.compact_heartbeat_receipt_is_valid(compact_receipt, run_id, 1))
        self.assertTrue(
            worker_heartbeat_receipt_is_valid(
                {
                    "accepted": True,
                    "idempotent": True,
                    "machine_id": "M1",
                    "run_id": run_id,
                    "sequence": 1,
                },
                "M1",
                run_id,
                1,
            )
        )
        self.assertTrue(
            compactor.compact_heartbeat_receipt_is_valid(
                {
                    "accepted": True,
                    "idempotent": True,
                    "run_id": run_id,
                    "sequence": 1,
                },
                run_id,
                1,
            )
        )
        self.assertFalse(
            worker_heartbeat_receipt_is_valid(
                {**worker_receipt, "sequence": True}, "M1", run_id, 1
            )
        )
        self.assertFalse(
            worker_heartbeat_receipt_is_valid(
                {**worker_receipt, "rows_per_hour": float("nan")}, "M1", run_id, 1
            )
        )
        self.assertFalse(
            compactor.compact_heartbeat_receipt_is_valid(
                {**compact_receipt, "sequence": True}, run_id, 1
            )
        )
        self.assertFalse(
            compactor.compact_heartbeat_receipt_is_valid(
                {**compact_receipt, "ignored": True}, run_id, 1
            )
        )

    def test_checkpoint_parser_rejects_duplicate_keys_and_malformed_nodes_cleanly(self):
        with tempfile.TemporaryDirectory() as directory:
            checkpoint = Path(directory) / "artifact.json"
            checkpoint.write_text('{"id":"one","id":"two"}', encoding="utf-8")
            with self.assertRaisesRegex(ContractError, "duplicate JSON key"):
                load_checkpoint(checkpoint)
            checkpoint.write_text('{"value":NaN}', encoding="utf-8")
            with self.assertRaisesRegex(ContractError, "non-finite JSON number"):
                load_checkpoint(checkpoint)
            checkpoint.write_text('{"value":1e400}', encoding="utf-8")
            with self.assertRaisesRegex(ContractError, "finite ingress range"):
                load_checkpoint(checkpoint)
            checkpoint.write_text('{"value":9007199254740993}', encoding="utf-8")
            with self.assertRaisesRegex(ContractError, "exact ingress range"):
                load_checkpoint(checkpoint)
            checkpoint.write_text("[" * 130 + "0" + "]" * 130, encoding="utf-8")
            with self.assertRaisesRegex(ContractError, "nesting exceeds"):
                load_checkpoint(checkpoint)
            checkpoint.write_bytes(b"\xff")
            with self.assertRaisesRegex(ContractError, "strict UTF-8 JSON"):
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
            (input_root / "ranges").mkdir(parents=True)
            (input_root / "models").mkdir(parents=True)
            pipeline_receipts = []
            for index, relative in enumerate(sorted(REQUIRED_PIPELINE_FILES)):
                pipeline_file = pipeline_root / relative
                pipeline_file.parent.mkdir(parents=True, exist_ok=True)
                pipeline_file.write_text(f"# pinned pipeline file {index}\n", encoding="utf-8")
                pipeline_receipts.append(
                    {"path": relative, "checksum": digest(pipeline_file.read_bytes())}
                )
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
                "input_bundle_id": input_bundle_id("3" * 64),
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
            invalid_combo = b"\xff"
            (input_root / "combo.txt").write_bytes(invalid_combo)
            invalid_combo_manifest = json.loads(json.dumps(manifest))
            invalid_combo_manifest["source_combo_order_checksum"] = digest(invalid_combo)
            invalid_combo_bytes = canonical_json(invalid_combo_manifest)
            manifest_path.write_bytes(invalid_combo_bytes)
            with self.assertRaisesRegex(ContractError, "strict UTF-8"):
                load_manifest(
                    manifest_path,
                    expected_checksum=digest(invalid_combo_bytes),
                    input_root=input_root,
                    pipeline_root=pipeline_root,
                )
            (input_root / "combo.txt").write_bytes(combo_bytes)
            incomplete_manifest = json.loads(json.dumps(manifest))
            incomplete_manifest["pipeline_files"] = incomplete_manifest["pipeline_files"][:-1]
            incomplete_bytes = canonical_json(incomplete_manifest)
            manifest_path.write_bytes(incomplete_bytes)
            with self.assertRaisesRegex(ContractError, "complete V31 executable set"):
                load_manifest(
                    manifest_path,
                    expected_checksum=digest(incomplete_bytes),
                    input_root=input_root,
                    pipeline_root=pipeline_root,
                )
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
            non_string_manifest = json.loads(json.dumps(manifest))
            non_string_manifest["dataset_key"] = 123
            non_string_bytes = canonical_json(non_string_manifest)
            manifest_path.write_bytes(non_string_bytes)
            with self.assertRaisesRegex(ContractError, "JSON string"):
                load_manifest(
                    manifest_path,
                    expected_checksum=digest(non_string_bytes),
                    input_root=input_root,
                    pipeline_root=pipeline_root,
                    verify_inputs=False,
                    verify_pipeline=False,
                )
            uppercase_bundle_id = json.loads(json.dumps(manifest))
            uppercase_bundle_id["input_bundle_id"] = input_bundle_id("a" * 64).upper()
            uppercase_bundle_bytes = canonical_json(uppercase_bundle_id)
            manifest_path.write_bytes(uppercase_bundle_bytes)
            with self.assertRaisesRegex(ContractError, "input_bundle_id is invalid"):
                load_manifest(
                    manifest_path,
                    expected_checksum=digest(uppercase_bundle_bytes),
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
