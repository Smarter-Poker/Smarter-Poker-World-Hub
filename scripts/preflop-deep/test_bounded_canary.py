import copy
import contextlib
import hashlib
import io
import json
import os
import sys
import unittest


for legacy_name in (
    "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SERVICE_KEY", "SUPABASE_KEY",
    "SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_ANON_KEY",
    "NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY", "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    "SUPABASE_DB_URL", "SUPABASE_CONNECTION_POOL_URL", "SUPABASE_DB_HOST",
    "SUPABASE_DB_PORT", "SUPABASE_DB_USER", "SUPABASE_DB_PASSWORD",
    "SUPABASE_DB_NAME", "SUPABASE_DB_SSL", "SUPABASE_DB_CA",
    "SUPABASE_JWT_SECRET", "SUPABASE_PROJECT_REF", "VITE_SUPABASE_URL",
    "VITE_SUPABASE_ANON_KEY", "FALLBACK_SUPABASE_URL",
    "SUPABASE_URL_FALLBACK", "SUPABASE_URL_WITH_PASS", "DATABASE_URL",
    "DIRECT_URL", "POSTGRES_URL", "POSTGRES_PRISMA_URL",
    "POSTGRES_URL_NON_POOLING", "POSTGRES_PASSWORD", "PG_PASSWORD",
    "PGHOST", "PGPORT", "PGDATABASE", "PGUSER", "PGPASSWORD",
):
    os.environ.pop(legacy_name, None)

os.environ.update({
    "SOLVER_WORKER_API_URL": "https://smarter.poker/api/training/solver-worker",
    "SOLVER_WORKER_HMAC_SECRET": "1" * 64,
    "PIPELINE_COMMIT": "b" * 40,
    "PIO_SOLVER_VERSION": "PioSOLVER 3.0",
    "PIO_BINARY_CHECKSUM": "a" * 64,
    "APPROVED_MANIFEST_CHECKSUM": "c" * 64,
    "RANGE_DIRECTORY": ".",
})
sys.argv = ["test_bounded_canary.py", "M1", "2", "0"]

import orchestrate as worker  # noqa: E402


PARENT_ID = "2d7b403c-e4d3-4c20-bff8-ed5db7ecb50a"
CHILD_ID = "21d75135-faa8-4c0d-acbe-91b55c98daf0"
M2_PARENT_ID = "982f383b-8519-4bf9-b015-7e05819f03bb"
M2_CHILD_ID = "81148fb8-e8e5-41c0-a259-6cf12fdad062"


def make_phase(game_type, stack):
    return {
        "id": "%s_%dbb" % (game_type, stack),
        "game_type": game_type,
        "stack": stack,
        "street": "flop",
        "streets": ["flop", "turn"],
        "objective": "chip_ev",
        "pot_chips": 550,
        "eff_chips": stack * 100,
        "rake": "0.05 10",
        "accuracy_fraction": 0.005,
        "ip_range": "ip.txt",
        "ip_range_checksum": "d" * 64,
        "oop_range": "oop.txt",
        "oop_range_checksum": "e" * 64,
        "ip_player": "BTN",
        "oop_player": "BB",
        "harvest": [{"node": "r:0:c", "hero": "IP", "position": "BTN"}],
    }


def make_canary(machine_id, parent_id, child_id, flop, turn):
    partition_count, partition_index = worker.BOUNDED_CANARY_PARTITIONS[machine_id]
    return {
        "machine_id": machine_id,
        "partition_count": partition_count,
        "partition_index": partition_index,
        "phase_id": "hu_cash_100bb",
        "parent_artifact_id": parent_id,
        "parent_scenario_hash": "hu_cash_BTN_100bb_%s" % flop,
        "parent_node": "r:0:c",
        "child_artifact_id": child_id,
        "child_scenario_hash": "turn_hu_cash_BTN_100bb_%s%s" % (flop, turn),
        "child_node": "r:0:c:b412:c:%s:c" % turn,
    }


def make_manifest(include_canaries=True, execution_scope="bounded_canary",
                  phase_pairs=None):
    if phase_pairs is None:
        phase_pairs = (
            [("hu_cash", 100)]
            if execution_scope == worker.EXECUTION_SCOPE_BOUNDED_CANARY
            else [
                (game_type, stack)
                for game_type, stacks in worker.TRAINING_SOLVER_CONTRACTS.items()
                for stack in sorted(stacks)
            ]
        )
    phases = [make_phase(game_type, stack) for game_type, stack in phase_pairs]
    phase_contracts = worker.canonical_phase_contracts(phases)
    game_contracts = worker.canonical_training_game_contracts(phases)
    chip_ev_contracts = worker.canonical_contract_pairs(worker.TRAINING_SOLVER_CONTRACTS)
    icm_contracts = worker.canonical_contract_pairs(worker.TRAINING_ICM_CONTRACTS)
    manifest = {
        "version": 5,
        "execution_scope": execution_scope,
        "pipeline_bundle_checksum": "f" * 64,
        "range_combo_order": worker.h.COMBO_ORDER,
        "artifact_combo_order": worker.h.COMBO_ORDER,
        "source_combo_order_schema": worker.h.SOURCE_COMBO_ORDER_SCHEMA,
        "source_combo_order_sha256": "1" * 64,
        "release_gate": {
            "solver_ready": False,
            "reason": "bounded canary only",
            "bounded_canary_ready": True,
        },
        "phases": phases,
        "phase_contracts_schema": worker.PHASE_CONTRACT_SCHEMA,
        "phase_contracts": phase_contracts,
        "phase_contracts_sha256": worker.phase_contracts_checksum(phase_contracts),
        "training_game_contracts_schema": "training-game-solver-contracts.v1",
        "training_game_contracts": game_contracts,
        "training_game_contracts_sha256": worker.training_game_contracts_checksum(
            game_contracts
        ),
        "training_contract_scope": {
            "schema": "training-solver-contract-scope.v1",
            "objective": "chip_ev",
            "chip_ev_contract_count": len(chip_ev_contracts),
            "chip_ev_contracts": chip_ev_contracts,
            "chip_ev_contracts_checksum": worker.contract_scope_checksum(
                chip_ev_contracts
            ),
            "separate_icm_contract_count": len(icm_contracts),
            "separate_icm_contracts": icm_contracts,
            "separate_icm_engine_required": True,
        },
        "self_test": {
            "board": "AhKdQc",
            "pot_chips": 550,
            "eff_chips": 9750,
            "rake": "0.05 10",
            "accuracy_fraction": 0.005,
            "oop_range": "oop.txt",
            "oop_range_checksum": "e" * 64,
            "ip_range": "ip.txt",
            "ip_range_checksum": "d" * 64,
            "oop_player": "BB",
            "ip_player": "BTN",
            "ev_oop_min_bb": -20,
            "ev_oop_max_bb": 20,
        },
    }
    if include_canaries:
        canaries = [
            make_canary("M1", PARENT_ID, CHILD_ID, "2c4c7c", "2d"),
            make_canary(
                "M2", M2_PARENT_ID, M2_CHILD_ID, "2c4dQd", "2d"
            ),
        ]
        manifest.update({
            "bounded_canary_contracts_schema": worker.BOUNDED_CANARY_CONTRACT_SCHEMA,
            "bounded_canary_contracts": canaries,
            "bounded_canary_contracts_sha256": (
                worker.bounded_canary_contracts_checksum(canaries)
            ),
        })
    return manifest


def validate_manifest(manifest, mode="canary"):
    raw = json.dumps(manifest, sort_keys=True, separators=(",", ":"))
    worker.APPROVED_MANIFEST_CHECKSUM = hashlib.sha256(raw.encode()).hexdigest()
    return worker.validate_manifest(raw, mode), raw


def row_for(target, admitted=False, machine_id="M1"):
    partition_count, partition_index = worker.BOUNDED_CANARY_PARTITIONS["M1"]
    row = {
        "id": target["artifact_id"],
        "scenario_hash": target["scenario_hash"],
        "game_type": "hu_cash",
        "stack_depth": 100,
        "street": target["street"],
        "node": target["node"] if admitted else None,
        "hero_position": target["position"] if admitted else None,
        "admitted": admitted,
        "admission_mode": "bounded_canary",
        "partition_count": partition_count,
        "partition_index": partition_index,
        "canary_target_role": target["role"],
        "authorized_node": target["node"],
        "authorized_hero_position": target["position"],
        "canary_authorized": True,
    }
    if admitted:
        row.update({
            "solved_v2_at": "2026-09-10T00:00:00Z",
            "quality_status": "validated",
            "solver_version": worker.PIO_SOLVER_VERSION,
            "solver_binary_checksum": worker.PIO_BINARY_CHECKSUM,
            "machine_id": machine_id,
            "pipeline_commit": worker.PIPELINE_COMMIT,
            "manifest_version": 5,
            "manifest_checksum": worker.APPROVED_MANIFEST_CHECKSUM,
            "source_artifact_checksum": "9" * 64,
            "audited_at": "2026-09-10T00:00:00Z",
        })
    return row


class BoundedCanaryManifestTests(unittest.TestCase):
    def test_valid_canary_does_not_open_default_backlog(self):
        manifest = make_manifest()
        (validated, _), _ = validate_manifest(manifest, "canary")
        self.assertEqual(worker.bounded_canary_for_machine(validated)["machine_id"], "M1")
        with self.assertRaisesRegex(SystemExit, "manifest release gate is closed"):
            validate_manifest(manifest, "backlog")
        self.assertIsNone(worker.ACTIVE_ADMISSION_MODE)
        with self.assertRaisesRegex(RuntimeError, "admission mode is unavailable"):
            worker._worker_envelope("heartbeat", {}, 5, "f" * 64)

        forced_open = copy.deepcopy(manifest)
        forced_open["release_gate"]["solver_ready"] = True
        with self.assertRaisesRegex(SystemExit, "execution scope"):
            validate_manifest(forced_open, "backlog")

    def test_canary_rejects_unreferenced_extra_or_non_training_phase(self):
        extra = make_manifest(phase_pairs=[("hu_cash", 100), ("hu_cash", 40)])
        with self.assertRaisesRegex(SystemExit, "phase set must exactly match"):
            validate_manifest(extra)

        outside = make_manifest(phase_pairs=[("not_training", 100)])
        with self.assertRaisesRegex(SystemExit, "outside the exact Training"):
            validate_manifest(outside)

    def test_backlog_still_requires_every_chip_ev_contract(self):
        partial = make_manifest(
            execution_scope=worker.EXECUTION_SCOPE_BACKLOG,
            phase_pairs=[("hu_cash", 100)],
        )
        partial["release_gate"]["solver_ready"] = True
        with self.assertRaisesRegex(SystemExit, "phase coverage is incomplete"):
            validate_manifest(partial, "backlog")

        complete = make_manifest(
            execution_scope=worker.EXECUTION_SCOPE_BACKLOG,
        )
        complete["release_gate"]["solver_ready"] = True
        (validated, _), _ = validate_manifest(complete, "backlog")
        self.assertEqual(validated["execution_scope"], "training_backlog")

    def test_canary_requires_distinct_gate_contract_and_digest(self):
        missing = make_manifest(include_canaries=False)
        with self.assertRaisesRegex(SystemExit, "bounded canary contracts"):
            validate_manifest(missing)

        closed = make_manifest()
        closed["release_gate"]["bounded_canary_ready"] = False
        with self.assertRaisesRegex(SystemExit, "bounded canary gate is closed"):
            validate_manifest(closed)

        tampered = make_manifest()
        tampered["bounded_canary_contracts"][0]["child_artifact_id"] = M2_CHILD_ID
        with self.assertRaisesRegex(SystemExit, "checksum-seal"):
            validate_manifest(tampered)

        missing_machine = make_manifest()
        missing_machine["bounded_canary_contracts"].pop()
        missing_machine["bounded_canary_contracts_sha256"] = hashlib.sha256(
            json.dumps(
                missing_machine["bounded_canary_contracts"],
                sort_keys=True,
                separators=(",", ":"),
            ).encode()
        ).hexdigest()
        with self.assertRaisesRegex(SystemExit, "exactly M1 and M2"):
            validate_manifest(missing_machine)

    def test_canary_rejects_invalid_uuid_lineage_node_and_machine_duplicates(self):
        invalid_uuid = make_manifest()
        invalid_uuid["bounded_canary_contracts"][0]["parent_artifact_id"] = (
            "not-a-uuid"
        )
        invalid_uuid["bounded_canary_contracts_sha256"] = (
            worker.bounded_canary_contracts_checksum(
                invalid_uuid["bounded_canary_contracts"]
            )
        )
        with self.assertRaisesRegex(SystemExit, "lowercase UUIDv4"):
            validate_manifest(invalid_uuid)

        wrong_lineage = make_manifest()
        wrong_lineage["bounded_canary_contracts"][0]["child_scenario_hash"] = (
            "turn_hu_cash_BTN_100bb_2c4d7c2d"
        )
        wrong_lineage["bounded_canary_contracts_sha256"] = (
            worker.bounded_canary_contracts_checksum(
                wrong_lineage["bounded_canary_contracts"]
            )
        )
        with self.assertRaisesRegex(SystemExit, "exact Turn child"):
            validate_manifest(wrong_lineage)

        wrong_node = make_manifest()
        wrong_node["bounded_canary_contracts"][0]["child_node"] = "r:0:c"
        wrong_node["bounded_canary_contracts_sha256"] = (
            worker.bounded_canary_contracts_checksum(
                wrong_node["bounded_canary_contracts"]
            )
        )
        with self.assertRaisesRegex(SystemExit, "tree geometry"):
            validate_manifest(wrong_node)

        duplicate_machine = make_manifest()
        duplicate_machine["bounded_canary_contracts"][1]["machine_id"] = "M1"
        duplicate_machine["bounded_canary_contracts_sha256"] = (
            worker.bounded_canary_contracts_checksum(
                duplicate_machine["bounded_canary_contracts"]
            )
        )
        with self.assertRaisesRegex(SystemExit, "unique canonical machine"):
            validate_manifest(duplicate_machine)

    def test_canary_binds_each_machine_to_its_exact_two_way_partition(self):
        wrong_manifest_partition = make_manifest()
        wrong_manifest_partition["bounded_canary_contracts"][0][
            "partition_index"
        ] = 1
        wrong_manifest_partition["bounded_canary_contracts_sha256"] = (
            worker.bounded_canary_contracts_checksum(
                wrong_manifest_partition["bounded_canary_contracts"]
            )
        )
        with self.assertRaisesRegex(SystemExit, "bind M1 to 2/0"):
            validate_manifest(wrong_manifest_partition)

        (validated, _), _ = validate_manifest(make_manifest())
        with self.assertRaisesRegex(SystemExit, "CLI partition"):
            worker.bounded_canary_for_machine(validated, "M1", 1, 0)
        with self.assertRaisesRegex(SystemExit, "CLI partition"):
            worker.bounded_canary_for_machine(validated, "M1", 2, 1)
        self.assertEqual(
            worker.bounded_canary_for_machine(validated, "M2", 2, 1)[
                "machine_id"
            ],
            "M2",
        )


class BoundedCanaryRuntimeTests(unittest.TestCase):
    def setUp(self):
        (self.validated, self.checksum), self.raw = validate_manifest(make_manifest())
        self.contract = worker.bounded_canary_for_machine(self.validated)
        self.phase, self.targets = worker._bounded_canary_targets(
            self.validated, self.contract
        )
        self.original_request = worker._worker_request

    def tearDown(self):
        worker._worker_request = self.original_request

    def test_preflight_resolves_exact_two_reserved_uuids(self):
        calls = []

        def request(operation, payload, version, checksum):
            calls.append((operation, payload, version, checksum))
            return {"success": True, "operation": operation,
                    "rows": [row_for(target) for target in self.targets]}

        worker._worker_request = request
        plan = worker.prepare_bounded_canary_execution(
            self.validated, self.checksum, "M1", 2, 0
        )
        self.assertEqual([target["artifact_id"] for target in plan["targets"]],
                         [PARENT_ID, CHILD_ID])
        self.assertEqual(len(calls), 1)
        self.assertEqual(calls[0][0], "row_states")
        self.assertEqual(calls[0][1], {
            "scenario_hashes": [
                "hu_cash_BTN_100bb_2c4c7c",
                "turn_hu_cash_BTN_100bb_2c4c7c2d",
            ]
        })

    def test_preflight_rejects_missing_wrong_or_foreign_admitted_identity(self):
        cases = (
            [row_for(self.targets[0])],
            [
                {**row_for(self.targets[0]), "id": M2_PARENT_ID},
                row_for(self.targets[1]),
            ],
            [
                row_for(self.targets[0], admitted=True, machine_id="M2"),
                row_for(self.targets[1]),
            ],
        )
        messages = (
            "exactly two",
            "UUID or relational identity",
            "foreign, stale, or ambiguously certified",
        )
        for rows, message in zip(cases, messages):
            with self.subTest(message=message):
                worker._worker_request = lambda *_args, rows=rows: {
                    "success": True, "operation": "row_states", "rows": rows
                }
                with self.assertRaisesRegex(SystemExit, message):
                    worker.prepare_bounded_canary_execution(
                        self.validated, self.checksum, "M1", 2, 0
                    )

    def test_preflight_rejects_server_scope_partition_node_or_position_mismatch(self):
        mutations = (
            ("admission_mode", "backlog"),
            ("partition_count", 1),
            ("partition_index", 1),
            ("canary_target_role", "child"),
            ("authorized_node", "r:0"),
            ("authorized_hero_position", "CO"),
            ("canary_authorized", False),
        )
        for field, value in mutations:
            with self.subTest(field=field):
                rows = [row_for(target) for target in self.targets]
                rows[0][field] = value
                worker._worker_request = lambda *_args, rows=rows: {
                    "success": True, "operation": "row_states", "rows": rows
                }
                with self.assertRaisesRegex(SystemExit, "server authority"):
                    worker.prepare_bounded_canary_execution(
                        self.validated, self.checksum, "M1", 2, 0
                    )

    def test_preflight_resumes_only_missing_target_and_accepts_exact_complete_pair(self):
        parent_admitted = [
            row_for(self.targets[0], admitted=True),
            row_for(self.targets[1]),
        ]
        worker._worker_request = lambda *_args: {
            "success": True, "operation": "row_states", "rows": parent_admitted
        }
        plan = worker.prepare_bounded_canary_execution(
            self.validated, self.checksum, "M1", 2, 0
        )
        self.assertEqual(
            [target["artifact_id"] for target in plan["certified_targets"]],
            [PARENT_ID],
        )
        self.assertEqual(
            [target["artifact_id"] for target in plan["pending_targets"]],
            [CHILD_ID],
        )

        worker._worker_request = lambda *_args: {
            "success": True,
            "operation": "row_states",
            "rows": [row_for(target, admitted=True) for target in self.targets],
        }
        complete = worker.prepare_bounded_canary_execution(
            self.validated, self.checksum, "M1", 2, 0
        )
        self.assertEqual(complete["pending_targets"], [])
        self.assertEqual(len(complete["certified_targets"]), 2)

    def test_partial_and_final_retry_reject_wrong_persisted_node_or_position(self):
        wrong_node = row_for(self.targets[0], admitted=True)
        wrong_node["node"] = "r:0"
        worker._worker_request = lambda *_args: {
            "success": True,
            "operation": "row_states",
            "rows": [wrong_node, row_for(self.targets[1])],
        }
        with self.assertRaisesRegex(
            SystemExit, "foreign, stale, or ambiguously certified"
        ):
            worker.prepare_bounded_canary_execution(
                self.validated, self.checksum, "M1", 2, 0
            )

        worker._worker_request = lambda *_args: {
            "success": True,
            "operation": "row_states",
            "rows": [
                row_for(self.targets[0], admitted=True),
                {
                    **row_for(self.targets[1], admitted=True),
                    "hero_position": "CO",
                },
            ],
        }
        plan = {
            "manifest_checksum": self.checksum,
            "manifest_version": self.validated["version"],
            "machine_id": "M1",
            "partition_count": 2,
            "partition_index": 0,
            "targets": self.targets,
        }
        with self.assertRaisesRegex(SystemExit, "exact active machine tuple"):
            worker.verify_bounded_canary_admission(plan)

    def test_canary_harvests_and_ingests_only_parent_and_child_then_verifies(self):
        original = {
            name: getattr(worker, name) for name in (
                "fetch_text", "self_test", "load_range", "solve", "read_results",
                "write_backup", "patch_v2",
            )
        }
        original_harvest = worker.h.harvest_node
        original_validate = worker.h.validate_row
        original_makedirs = worker.os.makedirs
        calls = {"heartbeat": [], "solve": [], "harvest": [], "patch": [], "backup": []}

        worker._worker_request = lambda _operation, _payload, _version, _checksum: {
            "success": True,
            "operation": "row_states",
            "rows": [row_for(target) for target in self.targets],
        }
        plan = worker.prepare_bounded_canary_execution(
            self.validated, self.checksum, "M1"
        )

        def request(operation, payload, _version, _checksum):
            if operation == "heartbeat":
                calls["heartbeat"].append(copy.deepcopy(payload))
                return {"success": True, "operation": operation}
            if operation == "row_states":
                return {"success": True, "operation": operation,
                        "rows": [row_for(target, admitted=True)
                                 for target in self.targets]}
            raise AssertionError("unexpected gateway operation %s" % operation)

        try:
            worker._worker_request = request
            worker.fetch_text = lambda _name: self.raw
            worker.self_test = lambda *_args: None
            worker.load_range = lambda *_args: "sealed-range"
            worker.solve = lambda *args: calls["solve"].append(args)
            worker.read_results = lambda: (1.0, -1.0, 0.1)
            worker.h.harvest_node = lambda _pio, node, _hero, board, *_args: (
                calls["harvest"].append((node, board)) or ({}, {"node": node})
            )
            worker.h.validate_row = lambda *_args: {
                "bad_sum_hands": 0, "live_hands": 1000, "ev_ok": True
            }
            worker.os.makedirs = lambda *_args, **_kwargs: None
            worker.write_backup = lambda path, _payload: calls["backup"].append(path)

            def patch(row_id, scenario_hash, *_args):
                calls["patch"].append((row_id, scenario_hash))
                return {
                    "artifact_id": row_id,
                    "scenario_hash": scenario_hash,
                    "source_artifact_checksum": "9" * 64,
                    "replayed": False,
                }

            worker.patch_v2 = patch
            with contextlib.redirect_stdout(io.StringIO()):
                receipts = worker.run_bounded_canary(plan)
        finally:
            for name, value in original.items():
                setattr(worker, name, value)
            worker.h.harvest_node = original_harvest
            worker.h.validate_row = original_validate
            worker.os.makedirs = original_makedirs

        self.assertEqual(len(receipts), 2)
        self.assertEqual(len(calls["solve"]), 1)
        self.assertEqual(calls["harvest"], [
            ("r:0:c", "2c4c7c"),
            ("r:0:c:b412:c:2d:c", "2c4c7c2d"),
        ])
        self.assertEqual(calls["patch"], [
            (PARENT_ID, "hu_cash_BTN_100bb_2c4c7c"),
            (CHILD_ID, "turn_hu_cash_BTN_100bb_2c4c7c2d"),
        ])
        self.assertEqual([row["phase"] for row in calls["heartbeat"]], [
            "bounded-canary-startup", "bounded-canary-complete",
        ])
        self.assertEqual(calls["heartbeat"][-1]["rows_written"], 2)

    def test_partial_retry_ingests_only_missing_child_and_reverifies_pair(self):
        original = {
            name: getattr(worker, name) for name in (
                "fetch_text", "self_test", "load_range", "solve", "read_results",
                "write_backup", "patch_v2",
            )
        }
        original_harvest = worker.h.harvest_node
        original_validate = worker.h.validate_row
        original_makedirs = worker.os.makedirs
        calls = {"heartbeat": [], "harvest": [], "patch": []}

        worker._worker_request = lambda *_args: {
            "success": True,
            "operation": "row_states",
            "rows": [
                row_for(self.targets[0], admitted=True),
                row_for(self.targets[1]),
            ],
        }
        plan = worker.prepare_bounded_canary_execution(
            self.validated, self.checksum, "M1", 2, 0
        )

        def request(operation, payload, _version, _checksum):
            if operation == "heartbeat":
                calls["heartbeat"].append(copy.deepcopy(payload))
                return {"success": True, "operation": operation}
            if operation == "row_states":
                return {
                    "success": True,
                    "operation": operation,
                    "rows": [
                        row_for(target, admitted=True) for target in self.targets
                    ],
                }
            raise AssertionError("unexpected gateway operation %s" % operation)

        try:
            worker._worker_request = request
            worker.fetch_text = lambda _name: self.raw
            worker.self_test = lambda *_args: None
            worker.load_range = lambda *_args: "sealed-range"
            worker.solve = lambda *_args: None
            worker.read_results = lambda: (1.0, -1.0, 0.1)
            worker.h.harvest_node = lambda _pio, node, _hero, board, *_args: (
                calls["harvest"].append((node, board)) or ({}, {"node": node})
            )
            worker.h.validate_row = lambda *_args: {
                "bad_sum_hands": 0, "live_hands": 1000, "ev_ok": True
            }
            worker.os.makedirs = lambda *_args, **_kwargs: None
            worker.write_backup = lambda *_args: None

            def patch(row_id, scenario_hash, *_args):
                calls["patch"].append((row_id, scenario_hash))
                return {
                    "artifact_id": row_id,
                    "scenario_hash": scenario_hash,
                    "source_artifact_checksum": "9" * 64,
                    "replayed": False,
                }

            worker.patch_v2 = patch
            with contextlib.redirect_stdout(io.StringIO()):
                receipts = worker.run_bounded_canary(plan)
        finally:
            for name, value in original.items():
                setattr(worker, name, value)
            worker.h.harvest_node = original_harvest
            worker.h.validate_row = original_validate
            worker.os.makedirs = original_makedirs

        self.assertEqual(len(receipts), 1)
        self.assertEqual(calls["harvest"], [
            ("r:0:c:b412:c:2d:c", "2c4c7c2d"),
        ])
        self.assertEqual(calls["patch"], [
            (CHILD_ID, "turn_hu_cash_BTN_100bb_2c4c7c2d"),
        ])
        self.assertEqual(calls["heartbeat"][-1]["rows_written"], 1)

    def test_completed_retry_verifies_and_heartbeats_with_zero_writes(self):
        worker._worker_request = lambda *_args: {
            "success": True,
            "operation": "row_states",
            "rows": [row_for(target, admitted=True) for target in self.targets],
        }
        plan = worker.prepare_bounded_canary_execution(
            self.validated, self.checksum, "M1", 2, 0
        )
        calls = []

        def request(operation, payload, _version, _checksum):
            calls.append((operation, copy.deepcopy(payload)))
            if operation == "row_states":
                return {
                    "success": True,
                    "operation": operation,
                    "rows": [
                        row_for(target, admitted=True) for target in self.targets
                    ],
                }
            return {"success": True, "operation": operation}

        worker._worker_request = request
        with contextlib.redirect_stdout(io.StringIO()):
            worker.complete_bounded_canary_without_solver(plan)
        self.assertEqual([call[0] for call in calls], ["row_states", "heartbeat"])
        self.assertEqual(calls[-1][1]["rows_written"], 0)


if __name__ == "__main__":
    unittest.main(argv=[sys.argv[0]], verbosity=2)
