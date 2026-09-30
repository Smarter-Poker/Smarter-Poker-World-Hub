import copy
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest import mock


SCRIPT_DIRECTORY = Path(__file__).resolve().parent
SPEC = importlib.util.spec_from_file_location(
    "build_m1_bounded_canary", SCRIPT_DIRECTORY / "build_m1_bounded_canary.py"
)
builder = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(builder)


def reviewed_packet(pipeline):
    return {
        "schema": builder.INPUT_SCHEMA,
        "migration_version": "20260930123000",
        "manifest_version": 5,
        "review": {
            "approved_by": "phase6-controller-ticket-20260930",
            "expected_training_game_count": 107,
            "expected_chip_ev_contract_count": 18,
            "expected_icm_contract_count": 7,
            "expected_tree_geometry": "srp_parameterized_four_action_v3",
        },
        "pipeline": pipeline,
        "pio": {
            "machine_id": "M1",
            "solver_version": "PioSOLVER-pro 3.8.0",
            "binary_sha256": "6" * 64,
            "source_combo_order_sha256": "7" * 64,
        },
        "phase": {
            "id": "hu_cash_100bb_BTNvsBB",
            "game_type": "hu_cash",
            "stack": 100,
            "street": "flop",
            "streets": ["flop", "turn"],
            "objective": "chip_ev",
            "pot_chips": 550,
            "eff_chips": 9750,
            "tree_geometry": "srp_parameterized_four_action_v3",
            "rake": "0.05 10",
            "accuracy_fraction": 0.005,
            "ip_range": "ip.txt",
            "ip_range_checksum": "8" * 64,
            "oop_range": "oop.txt",
            "oop_range_checksum": "9" * 64,
            "ip_player": "BTN",
            "oop_player": "BB",
            "harvest": [
                {"node": "r:0", "hero": "OOP", "position": "BB"},
                {"node": "r:0:c", "hero": "IP", "position": "BTN"},
            ],
        },
        "canary": {
            "machine_id": "M1",
            "partition_count": 2,
            "partition_index": 0,
            "phase_id": "hu_cash_100bb_BTNvsBB",
            "parent_artifact_id": "2d7b403c-e4d3-4c20-bff8-ed5db7ecb50a",
            "parent_scenario_hash": "hu_cash_BTN_100bb_2c4c7c",
            "parent_node": "r:0:c",
            "child_artifact_id": "21d75135-faa8-4c0d-acbe-91b55c98daf0",
            "child_scenario_hash": "turn_hu_cash_BTN_100bb_2c4c7c2d",
            "child_node": "r:0:c:b412:c:2d:c",
        },
        "self_test": {
            "board": "AhKdQc",
            "pot_chips": 550,
            "eff_chips": 9750,
            "rake": "0.05 10",
            "accuracy_fraction": 0.005,
            "oop_range": "oop.txt",
            "oop_range_checksum": "9" * 64,
            "ip_range": "ip.txt",
            "ip_range_checksum": "8" * 64,
            "oop_player": "BB",
            "ip_player": "BTN",
            "ev_oop_min_bb": -20,
            "ev_oop_max_bb": 20,
        },
    }


class M1BoundedCanaryBuilderTests(unittest.TestCase):
    def setUp(self):
        self.repo_scratch = tempfile.TemporaryDirectory(dir=SCRIPT_DIRECTORY)
        self.repo = Path(self.repo_scratch.name) / "repo"
        self.repo.mkdir()
        self.git("init", "--quiet")
        pipeline_files = {}
        for path, filename in zip(builder.PIPELINE_PATHS, builder.PIPELINE_FILES):
            payload = (SCRIPT_DIRECTORY / filename).read_bytes()
            target = self.repo / path
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(payload)
            pipeline_files[filename] = payload
        self.git("add", ".")
        self.git(
            "-c", "user.name=Phase6 Test",
            "-c", "user.email=phase6@example.invalid",
            "commit", "--quiet", "-m", "immutable pipeline",
        )
        self.pipeline_commit = self.git("rev-parse", "HEAD")
        self.git(
            "update-ref", builder.CANONICAL_PROTECTED_REF,
            self.pipeline_commit,
        )
        aggregate = hashlib.sha256()
        files_sha256 = {}
        for filename in builder.PIPELINE_FILES:
            payload = pipeline_files[filename]
            files_sha256[filename] = hashlib.sha256(payload).hexdigest()
            aggregate.update(filename.encode("ascii") + b"\0" + payload + b"\0")
        self.pipeline = {
            "commit": self.pipeline_commit,
            "distribution": builder.PIPELINE_DISTRIBUTION,
            "files_sha256": files_sha256,
            "bundle_sha256": aggregate.hexdigest(),
        }

    def tearDown(self):
        self.repo_scratch.cleanup()

    def git(self, *arguments, input_bytes=None):
        result = subprocess.run(
            ["git", "-C", str(self.repo), *arguments],
            input=input_bytes,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            check=True,
        )
        return result.stdout.decode("utf-8").strip()

    def build(self, packet):
        scratch = tempfile.TemporaryDirectory(dir=SCRIPT_DIRECTORY)
        root = Path(scratch.name)
        input_path = root / "review.json"
        input_path.write_text(json.dumps(packet), encoding="utf-8")
        output = root / "output"
        receipt = builder.build(
            input_path,
            output,
            self.repo,
            builder.CANONICAL_PROTECTED_REF,
            self.pipeline_commit,
        )
        return scratch, output, receipt

    def assert_build_rejected(self, packet):
        with tempfile.TemporaryDirectory(dir=SCRIPT_DIRECTORY) as scratch:
            root = Path(scratch)
            input_path = root / "review.json"
            input_path.write_text(json.dumps(packet), encoding="utf-8")
            output = root / "output"
            with self.assertRaises(builder.CanaryBuildError):
                builder.build(
                    input_path,
                    output,
                    self.repo,
                    builder.CANONICAL_PROTECTED_REF,
                    self.pipeline_commit,
                )
            self.assertFalse(output.exists())

    def test_emits_one_canonical_manifest_and_literal_activation_migration(self):
        hold_before = (SCRIPT_DIRECTORY / "phases.json").read_bytes()
        scratch, output, receipt = self.build(reviewed_packet(self.pipeline))
        try:
            manifest = json.loads((output / "phases.json").read_text(encoding="utf-8"))
            sql = (output / receipt["migration_filename"]).read_text(encoding="utf-8")
            self.assertEqual(manifest["version"], 5)
            self.assertEqual(manifest["execution_scope"], "bounded_canary")
            self.assertFalse(manifest["release_gate"]["solver_ready"])
            self.assertTrue(manifest["release_gate"]["bounded_canary_ready"])
            self.assertEqual(len(manifest["training_game_contracts"]), 107)
            self.assertEqual(manifest["training_contract_scope"]["chip_ev_contract_count"], 18)
            self.assertEqual(manifest["training_contract_scope"]["separate_icm_contract_count"], 7)
            self.assertEqual(len(manifest["phases"]), 1)
            self.assertEqual(manifest["phases"][0]["tree_geometry"],
                             "srp_parameterized_four_action_v3")
            self.assertEqual(manifest["bounded_canary_contracts"][0]["machine_id"], "M1")
            self.assertEqual(manifest["bounded_canary_contracts"][0]["partition_index"], 0)
            self.assertIn("INSERT INTO public.training_solver_provenance_authority", sql)
            self.assertIn("INSERT INTO public.training_solver_bounded_canary_targets", sql)
            self.assertIn("admission_mode = 'bounded_canary'", sql)
            self.assertIn("-- TIER:        2", sql)
            self.assertIn("-- IRREVERSIBLE: no", sql)
            self.assertIn("-- WHY:", sql)
            self.assertIn("-- HOW (high level):", sql)
            self.assertIn("partition_index = 0", sql)
            self.assertIn("'turn', 'r:0:c:b412:c:2d:c', 'BTN'", sql)
            self.assertIn(
                "artifact.id = '2d7b403c-e4d3-4c20-bff8-ed5db7ecb50a'::uuid",
                sql,
            )
            self.assertIn(
                "artifact.id = '21d75135-faa8-4c0d-acbe-91b55c98daf0'::uuid",
                sql,
            )
            self.assertIn("artifact.game_type = 'hu_cash'", sql)
            self.assertIn("artifact.stack_depth = 100", sql)
            self.assertIn(
                "artifact.strategy_matrix_v2 ->> 'node' = 'r:0:c:b412:c:2d:c'",
                sql,
            )
            self.assertIn(
                "artifact.strategy_matrix_v2 ->> 'position' = 'BTN'",
                sql,
            )
            self.assertNotIn("ON CONFLICT", sql)
            self.assertNotIn("<exact-", sql)
            self.assertEqual(receipt["database_writes_performed"], 0)
            self.assertEqual(receipt["pipeline_commit"], self.pipeline_commit)
            self.assertEqual(
                receipt["protected_ref"], builder.CANONICAL_PROTECTED_REF
            )
            self.assertEqual(
                receipt["protected_ref_commit"], self.pipeline_commit
            )
            self.assertEqual((SCRIPT_DIRECTORY / "phases.json").read_bytes(), hold_before)
        finally:
            scratch.cleanup()

    def test_output_is_deterministic_for_the_same_review_packet(self):
        packet = reviewed_packet(self.pipeline)
        first_scratch, first_output, first_receipt = self.build(packet)
        second_scratch, second_output, second_receipt = self.build(packet)
        try:
            self.assertEqual(first_receipt, second_receipt)
            for name in ("phases.json", first_receipt["migration_filename"], "build-receipt.json"):
                self.assertEqual((first_output / name).read_bytes(), (second_output / name).read_bytes())
        finally:
            first_scratch.cleanup()
            second_scratch.cleanup()

    def test_rejects_every_non_exact_manifest_version_before_writing_output(self):
        for value in (4, 6, "5", 5.0, True, None):
            with self.subTest(value=value):
                packet = copy.deepcopy(reviewed_packet(self.pipeline))
                packet["manifest_version"] = value
                self.assert_build_rejected(packet)

    def test_git_subprocess_receives_no_controller_credentials(self):
        captured = {}

        def run(command, **kwargs):
            captured["command"] = command
            captured["environment"] = kwargs["env"]
            return subprocess.CompletedProcess(command, 0, stdout=b"", stderr=b"")

        sentinels = {
            "SUPABASE_SERVICE_ROLE_KEY": "must-not-reach-git",
            "DATABASE_URL": "must-not-reach-git",
            "SOLVER_WORKER_HMAC_SECRET": "must-not-reach-git",
            "GH_TOKEN": "must-not-reach-git",
            "GITHUB_TOKEN": "must-not-reach-git",
        }
        with mock.patch.dict(builder.os.environ, sentinels, clear=False), mock.patch.object(
                builder.subprocess, "run", side_effect=run):
            builder._git(self.repo, "status")

        self.assertEqual(captured["command"][0], builder.GIT_EXECUTABLE)
        self.assertEqual(
            captured["environment"],
            {
                "PATH": builder.GIT_CHILD_PATH,
                "LANG": "C",
                "LC_ALL": "C",
                "GIT_NO_REPLACE_OBJECTS": "1",
                "GIT_GRAFT_FILE": os.devnull,
                "GIT_NO_LAZY_FETCH": "1",
                "GIT_TERMINAL_PROMPT": "0",
                "GIT_CONFIG_NOSYSTEM": "1",
                "GIT_CONFIG_GLOBAL": os.devnull,
            },
        )
        for name in sentinels:
            self.assertNotIn(name, captured["environment"])

    def test_rejects_every_scope_or_identity_downgrade_before_writing_output(self):
        mutations = []
        wrong_machine = copy.deepcopy(reviewed_packet(self.pipeline))
        wrong_machine["pio"]["machine_id"] = "M2"
        mutations.append(wrong_machine)
        wrong_partition = copy.deepcopy(reviewed_packet(self.pipeline))
        wrong_partition["canary"]["partition_index"] = 1
        mutations.append(wrong_partition)
        wrong_geometry = copy.deepcopy(reviewed_packet(self.pipeline))
        wrong_geometry["phase"]["tree_geometry"] = "srp_parameterized_v2"
        mutations.append(wrong_geometry)
        wrong_scope = copy.deepcopy(reviewed_packet(self.pipeline))
        wrong_scope["review"]["expected_chip_ev_contract_count"] = 17
        mutations.append(wrong_scope)
        zero_range = copy.deepcopy(reviewed_packet(self.pipeline))
        zero_range["phase"]["ip_range_checksum"] = "0" * 64
        mutations.append(zero_range)
        wrong_child = copy.deepcopy(reviewed_packet(self.pipeline))
        wrong_child["canary"]["child_node"] = "r:0:c"
        mutations.append(wrong_child)
        unknown_field = copy.deepcopy(reviewed_packet(self.pipeline))
        unknown_field["database_url"] = "must-not-be-accepted"
        mutations.append(unknown_field)

        for index, packet in enumerate(mutations):
            with self.subTest(index=index):
                with tempfile.TemporaryDirectory(dir=SCRIPT_DIRECTORY) as scratch:
                    root = Path(scratch)
                    input_path = root / "review.json"
                    input_path.write_text(json.dumps(packet), encoding="utf-8")
                    output = root / "output"
                    with self.assertRaises(builder.CanaryBuildError):
                        builder.build(
                            input_path,
                            output,
                            self.repo,
                            builder.CANONICAL_PROTECTED_REF,
                            self.pipeline_commit,
                        )
                    self.assertFalse(output.exists())

    def test_rejects_forged_or_stale_pipeline_identity_from_git_objects(self):
        stale_file = copy.deepcopy(reviewed_packet(self.pipeline))
        stale_file["pipeline"]["files_sha256"]["run_machine.py"] = "a" * 64
        stale_bundle = copy.deepcopy(reviewed_packet(self.pipeline))
        stale_bundle["pipeline"]["bundle_sha256"] = "b" * 64
        for packet in (stale_file, stale_bundle):
            with self.subTest(kind="checksum"):
                self.assert_build_rejected(packet)

        packet = reviewed_packet(self.pipeline)
        with tempfile.TemporaryDirectory(dir=SCRIPT_DIRECTORY) as scratch:
            root = Path(scratch)
            input_path = root / "review.json"
            input_path.write_text(json.dumps(packet), encoding="utf-8")
            with self.assertRaises(builder.CanaryBuildError):
                builder.build(
                    input_path,
                    root / "wrong-ref",
                    self.repo,
                    "refs/heads/main",
                    self.pipeline_commit,
                )
            with self.assertRaises(builder.CanaryBuildError):
                builder.build(
                    input_path,
                    root / "wrong-main",
                    self.repo,
                    builder.CANONICAL_PROTECTED_REF,
                    "c" * 40,
                )

        tree = self.git("rev-parse", "HEAD^{tree}")
        foreign_commit = self.git(
            "-c", "user.name=Phase6 Test",
            "-c", "user.email=phase6@example.invalid",
            "commit-tree", tree,
            input_bytes=b"foreign commit\n",
        )
        foreign = copy.deepcopy(reviewed_packet(self.pipeline))
        foreign["pipeline"]["commit"] = foreign_commit
        self.assert_build_rejected(foreign)

    def test_rejects_when_local_pipeline_bytes_differ_from_attested_git_blob(self):
        target = self.repo / builder.PIPELINE_PATHS[0]
        target.write_bytes(target.read_bytes() + b"\n# reviewed but not local\n")
        self.git("add", builder.PIPELINE_PATHS[0])
        self.git(
            "-c", "user.name=Phase6 Test",
            "-c", "user.email=phase6@example.invalid",
            "commit", "--quiet", "-m", "different immutable pipeline",
        )
        mismatched_commit = self.git("rev-parse", "HEAD")
        self.git(
            "update-ref", builder.CANONICAL_PROTECTED_REF,
            mismatched_commit,
        )
        aggregate = hashlib.sha256()
        files_sha256 = {}
        for path, filename in zip(builder.PIPELINE_PATHS, builder.PIPELINE_FILES):
            payload = (self.repo / path).read_bytes()
            files_sha256[filename] = hashlib.sha256(payload).hexdigest()
            aggregate.update(filename.encode("ascii") + b"\0" + payload + b"\0")
        pipeline = {
            "commit": mismatched_commit,
            "distribution": builder.PIPELINE_DISTRIBUTION,
            "files_sha256": files_sha256,
            "bundle_sha256": aggregate.hexdigest(),
        }
        packet = reviewed_packet(pipeline)
        with tempfile.TemporaryDirectory(dir=SCRIPT_DIRECTORY) as scratch:
            root = Path(scratch)
            input_path = root / "review.json"
            input_path.write_text(json.dumps(packet), encoding="utf-8")
            output = root / "output"
            with self.assertRaisesRegex(
                    builder.CanaryBuildError,
                    "local pipeline bytes do not match the reviewed Git blob"):
                builder.build(
                    input_path,
                    output,
                    self.repo,
                    builder.CANONICAL_PROTECTED_REF,
                    mismatched_commit,
                )
            self.assertFalse(output.exists())

    def test_rejects_duplicate_keys_at_nested_depth(self):
        packet = reviewed_packet(self.pipeline)
        raw = json.dumps(packet)
        original = '"commit": "%s"' % self.pipeline_commit
        duplicate = '%s, %s' % (original, original)
        self.assertIn(original, raw)
        raw = raw.replace(original, duplicate, 1)
        with tempfile.TemporaryDirectory(dir=SCRIPT_DIRECTORY) as scratch:
            root = Path(scratch)
            input_path = root / "review.json"
            input_path.write_text(raw, encoding="utf-8")
            output = root / "output"
            with self.assertRaises(builder.CanaryBuildError):
                builder.build(
                    input_path,
                    output,
                    self.repo,
                    builder.CANONICAL_PROTECTED_REF,
                    self.pipeline_commit,
                )
            self.assertFalse(output.exists())

    def test_publication_is_posix_only_and_never_replaces_a_racing_entry(self):
        with mock.patch.object(builder.sys, "platform", "win32"):
            with self.assertRaises(builder.CanaryBuildError):
                builder._require_posix_controller()

        packet = reviewed_packet(self.pipeline)
        with tempfile.TemporaryDirectory(dir=SCRIPT_DIRECTORY) as scratch:
            root = Path(scratch)
            input_path = root / "review.json"
            input_path.write_text(json.dumps(packet), encoding="utf-8")
            output = root / "output"
            original_rename = builder._rename_directory_no_replace

            def inject_destination(parent_descriptor, source, destination):
                try:
                    os.mkdir(destination, 0o700, dir_fd=parent_descriptor)
                except FileExistsError:
                    pass
                return original_rename(
                    parent_descriptor, source, destination,
                )

            with mock.patch.object(
                    builder, "_rename_directory_no_replace",
                    side_effect=inject_destination):
                with self.assertRaises(builder.CanaryBuildError):
                    builder.build(
                        input_path,
                        output,
                        self.repo,
                        builder.CANONICAL_PROTECTED_REF,
                        self.pipeline_commit,
                    )
            self.assertTrue(output.is_dir())
            self.assertEqual(list(output.iterdir()), [])


if __name__ == "__main__":
    unittest.main()
