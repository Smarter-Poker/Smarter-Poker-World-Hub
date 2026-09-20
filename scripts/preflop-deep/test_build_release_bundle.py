"""Hermetic tests for the controller-only solver bundle builder."""
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest import mock
import zlib

import build_release_bundle as bundle_builder
from build_release_bundle import (
    BundleBuildError,
    CANONICAL_PROTECTED_REF,
    build_release_bundle,
)


FILES = ("run_machine.py", "tree_gen.py", "pio_harvest.py", "orchestrate.py")
PIO_VERSION = "PioSOLVER-pro 3.8.0 (Sep 22 2025, 11:05:45)"
PIO_SHA256 = "e21ea7ad1dbc2a9d826c25ac264688f632dd461b92de2bc35a53f6b78bcf5ceb"


class ControllerBundleBuilderTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name).resolve()
        self.repo = self.root / "repo"
        self.repo.mkdir()
        self.git("init", "-b", "main")
        self.git("config", "user.email", "solver-bundle-test@example.invalid")
        self.git("config", "user.name", "Solver Bundle Test")
        self.payloads = {
            name: ("# exact %s\n" % name).encode("ascii") for name in FILES
        }
        self.commit = self.write_release_commit()
        self.protected_main = self.commit
        self.git("update-ref", CANONICAL_PROTECTED_REF, self.commit)

    def git(self, *arguments, check=True):
        return subprocess.run(
            ["git", "-C", str(self.repo), *arguments],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            check=check,
        )

    def manifest_bytes(self):
        digest = hashlib.sha256()
        for name in FILES:
            digest.update(name.encode("ascii") + b"\0" + self.payloads[name] + b"\0")
        manifest = {
            "version": 5,
            "pipeline_distribution": "controller-local-bundle.v1",
            "pipeline_files_sha256": {
                name: hashlib.sha256(payload).hexdigest()
                for name, payload in self.payloads.items()
            },
            "pipeline_bundle_checksum": digest.hexdigest(),
            "release_gate": {"solver_ready": False},
        }
        return (json.dumps(manifest, sort_keys=True) + "\n").encode("utf-8")

    def write_release_commit(self):
        folder = self.repo / "scripts" / "preflop-deep"
        folder.mkdir(parents=True, exist_ok=True)
        for name, payload in self.payloads.items():
            (folder / name).write_bytes(payload)
        (folder / "phases.json").write_bytes(self.manifest_bytes())
        self.git("add", "scripts/preflop-deep")
        self.git("commit", "-m", "test release")
        return self.git("rev-parse", "HEAD").stdout.decode().strip()

    def build(self, name="bundle", commit=None,
              protected_ref=CANONICAL_PROTECTED_REF,
              protected_main_commit=None):
        output = self.root / name
        receipt = build_release_bundle(
            self.repo, commit or self.commit, protected_ref, output,
            PIO_VERSION, PIO_SHA256,
            protected_main_commit or self.protected_main,
        )
        return output, receipt

    def test_builds_exact_five_files_from_git_objects_not_dirty_tree(self):
        dirty = self.repo / "scripts" / "preflop-deep" / "tree_gen.py"
        dirty.write_bytes(b"# dirty CRLF mutation\r\n")
        output, receipt = self.build()
        self.assertEqual(
            {path.name for path in output.iterdir()},
            {"phases.json", *FILES},
        )
        self.assertEqual((output / "tree_gen.py").read_bytes(), self.payloads["tree_gen.py"])
        self.assertEqual(receipt["pipeline_commit"], self.commit)
        self.assertEqual(receipt["pio_identity"]["binary_sha256"], PIO_SHA256)
        self.assertNotIn("HMAC", json.dumps(receipt).upper())
        self.assertNotIn("SUPABASE", json.dumps(receipt).upper())

    def test_ignores_local_git_replacement_objects(self):
        original = self.payloads["orchestrate.py"]
        self.payloads["orchestrate.py"] = b"# malicious replacement\n"
        replacement = self.write_release_commit()
        self.protected_main = replacement
        self.git("update-ref", CANONICAL_PROTECTED_REF, replacement)
        self.git("replace", self.commit, replacement)

        output, receipt = self.build(commit=self.commit)

        self.assertEqual(receipt["pipeline_commit"], self.commit)
        self.assertEqual((output / "orchestrate.py").read_bytes(), original)
        self.assertNotEqual((output / "orchestrate.py").read_bytes(),
                            self.payloads["orchestrate.py"])

    def test_rejects_non_ancestor_commit(self):
        self.git("checkout", "--orphan", "foreign")
        self.git("rm", "-rf", ".")
        self.payloads["tree_gen.py"] = b"# foreign\n"
        foreign = self.write_release_commit()
        with self.assertRaisesRegex(BundleBuildError, "not an ancestor"):
            self.build(commit=foreign)

        with self.assertRaisesRegex(BundleBuildError, "canonical"):
            self.build(commit=foreign, protected_ref="foreign")

    def test_rejects_legacy_graft_ancestry_substitution(self):
        self.git("checkout", "--orphan", "grafted-foreign")
        self.git("rm", "-rf", ".")
        self.payloads["tree_gen.py"] = b"# grafted foreign release\n"
        foreign = self.write_release_commit()
        grafts = self.repo / ".git" / "info" / "grafts"
        grafts.write_text("%s %s\n" % (self.commit, foreign), encoding="ascii")

        with self.assertRaisesRegex(BundleBuildError, "grafts"):
            self.build(commit=foreign)
        self.assertFalse((self.root / "bundle").exists())

    def test_rejects_mismatched_controller_attested_protected_main(self):
        with self.assertRaisesRegex(BundleBuildError, "independently verified"):
            build_release_bundle(
                self.repo, self.commit, CANONICAL_PROTECTED_REF,
                self.root / "mismatched-main", PIO_VERSION, PIO_SHA256,
                "f" * 40,
            )

    def test_rejects_symlink_blob(self):
        path = self.repo / "scripts" / "preflop-deep" / "tree_gen.py"
        path.unlink()
        path.symlink_to("orchestrate.py")
        self.git("add", "scripts/preflop-deep/tree_gen.py")
        self.git("commit", "-m", "symlink payload")
        commit = self.git("rev-parse", "HEAD").stdout.decode().strip()
        self.protected_main = commit
        self.git("update-ref", CANONICAL_PROTECTED_REF, commit)
        with self.assertRaisesRegex(BundleBuildError, "symlink"):
            self.build(commit=commit)

    def test_rejects_stale_manifest_checksum_and_existing_output(self):
        path = self.repo / "scripts" / "preflop-deep" / "tree_gen.py"
        path.write_bytes(b"# committed CRLF mutation\r\n")
        self.git("add", "scripts/preflop-deep/tree_gen.py")
        self.git("commit", "-m", "stale checksum")
        commit = self.git("rev-parse", "HEAD").stdout.decode().strip()
        self.protected_main = commit
        self.git("update-ref", CANONICAL_PROTECTED_REF, commit)
        with self.assertRaisesRegex(BundleBuildError, "file checksum mismatch"):
            self.build(commit=commit)

        output = self.root / "existing"
        output.mkdir()
        with self.assertRaisesRegex(BundleBuildError, "must not already exist"):
            build_release_bundle(
                self.repo, self.commit, CANONICAL_PROTECTED_REF, output,
                PIO_VERSION, PIO_SHA256, self.protected_main,
            )

    def test_rejects_symlink_spelled_output_parent(self):
        real_parent = self.root / "real-parent"
        real_parent.mkdir()
        alias = self.root / "alias-parent"
        alias.symlink_to(real_parent, target_is_directory=True)
        with self.assertRaisesRegex(BundleBuildError, "links or reparse"):
            build_release_bundle(
                self.repo, self.commit, CANONICAL_PROTECTED_REF, alias / "bundle",
                PIO_VERSION, PIO_SHA256, self.commit,
            )

    def test_cli_defaults_to_canonical_ref_and_holds_without_partial_output(self):
        script = Path(__file__).with_name("build_release_bundle.py")
        output = self.root / "cli-bundle"
        command = [
            sys.executable, str(script),
            "--repo", str(self.repo),
            "--commit", self.commit,
            "--protected-main-commit", self.commit,
            "--output", str(output),
            "--pio-version", PIO_VERSION,
            "--pio-binary-sha256", PIO_SHA256,
        ]
        completed = subprocess.run(
            command, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=False,
        )
        self.assertEqual(completed.returncode, 0, completed.stderr.decode())
        receipt = json.loads(completed.stdout.decode())
        self.assertEqual(receipt["pipeline_commit"], self.commit)
        self.assertEqual(receipt["protected_ref_commit"], self.commit)
        self.assertEqual(len(tuple(output.iterdir())), 5)

        held = subprocess.run(
            command, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=False,
        )
        self.assertEqual(held.returncode, 1)
        self.assertEqual(held.stdout, b"")
        self.assertTrue(held.stderr.decode().startswith("HOLD: "))
        self.assertEqual(len(tuple(output.iterdir())), 5)
        self.assertEqual(list(self.root.glob(".solver-release-*")), [])

    def test_rejects_corrupted_loose_blob_even_when_git_can_read_it(self):
        listing = self.git(
            "ls-tree", self.commit, "--", "scripts/preflop-deep/orchestrate.py",
        ).stdout.decode().strip().split()
        object_id = listing[2]
        object_path = self.repo / ".git" / "objects" / object_id[:2] / object_id[2:]
        malicious = b"# substituted bytes under the wrong object id\n"
        raw = ("blob %d\0" % len(malicious)).encode("ascii") + malicious
        object_path.chmod(0o600)
        object_path.write_bytes(zlib.compress(raw))

        with self.assertRaisesRegex(BundleBuildError, "Git object verification failed"):
            self.build(name="corrupt-object")
        self.assertFalse((self.root / "corrupt-object").exists())

    def test_ignores_repository_selection_environment_overrides(self):
        with mock.patch.dict(os.environ, {
            "GIT_DIR": str(self.root / "not-the-repository"),
            "GIT_OBJECT_DIRECTORY": str(self.root / "not-the-objects"),
            "GIT_REPLACE_REF_BASE": "refs/evil/replace/",
        }):
            output, receipt = self.build(name="sanitized-environment")
        self.assertEqual(receipt["pipeline_commit"], self.commit)
        self.assertEqual((output / "orchestrate.py").read_bytes(),
                         self.payloads["orchestrate.py"])

    def test_aligns_pio_version_and_file_size_limits_with_worker(self):
        with self.assertRaisesRegex(BundleBuildError, "Pio version"):
            build_release_bundle(
                self.repo, self.commit, CANONICAL_PROTECTED_REF,
                self.root / "long-pio-version", "x" * 121, PIO_SHA256,
                self.commit,
            )
        with mock.patch("build_release_bundle.MAX_BUNDLE_FILE_BYTES", 8):
            with self.assertRaisesRegex(BundleBuildError, "size limit"):
                self.build(name="oversized")
        self.assertFalse((self.root / "oversized").exists())

    def test_post_publish_sync_failure_removes_bundle_and_temporary_directory(self):
        output = self.root / "sync-failure"
        real_fsync = __import__("os").fsync
        calls = 0

        def fail_parent_sync(descriptor):
            nonlocal calls
            calls += 1
            if calls == 7:
                raise OSError("simulated parent directory sync failure")
            return real_fsync(descriptor)

        with mock.patch("build_release_bundle.os.fsync", side_effect=fail_parent_sync):
            with self.assertRaisesRegex(BundleBuildError, "no bundle was published"):
                self.build(name=output.name)

        self.assertFalse(output.exists())
        self.assertEqual(list(self.root.glob(".solver-release-*")), [])

    def test_parent_directory_swap_cannot_redirect_publication(self):
        approved_parent = self.root / "approved-parent"
        approved_parent.mkdir()
        moved_parent = self.root / "moved-approved-parent"
        attacker_parent = self.root / "attacker-parent"
        attacker_parent.mkdir()
        real_mkdir = os.mkdir
        swapped = False

        def swap_parent_before_staging(path, mode=0o777, *, dir_fd=None):
            nonlocal swapped
            if not swapped and dir_fd is not None and str(path).startswith(".solver-release-"):
                approved_parent.rename(moved_parent)
                approved_parent.symlink_to(attacker_parent, target_is_directory=True)
                swapped = True
            return real_mkdir(path, mode, dir_fd=dir_fd)

        with mock.patch("build_release_bundle.os.mkdir", side_effect=swap_parent_before_staging):
            with self.assertRaisesRegex(BundleBuildError, "changed"):
                build_release_bundle(
                    self.repo, self.commit, CANONICAL_PROTECTED_REF,
                    approved_parent / "bundle", PIO_VERSION, PIO_SHA256,
                    self.commit,
                )

        self.assertTrue(swapped)
        self.assertFalse((attacker_parent / "bundle").exists())
        self.assertFalse((moved_parent / "bundle").exists())
        self.assertEqual(list(moved_parent.glob(".solver-release-*")), [])

    def test_staging_path_swap_during_rename_cannot_publish_substitute(self):
        output = self.root / "path-swap-bundle"
        real_rename = os.rename
        real_publish = bundle_builder._rename_directory_no_replace
        swapped = False
        displaced_name = ".verified-staging-displaced"

        def substitute_staging_path(parent_descriptor, source, destination):
            nonlocal swapped
            if not swapped and str(source).startswith(".solver-release-"):
                real_rename(
                    source, displaced_name,
                    src_dir_fd=parent_descriptor,
                    dst_dir_fd=parent_descriptor,
                )
                os.mkdir(source, 0o700, dir_fd=parent_descriptor)
                substitute_descriptor = os.open(
                    source,
                    os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW,
                    dir_fd=parent_descriptor,
                )
                try:
                    for name in ("phases.json", *FILES):
                        descriptor = os.open(
                            name,
                            os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW,
                            0o600,
                            dir_fd=substitute_descriptor,
                        )
                        try:
                            os.write(descriptor, b"malicious substitution\n")
                        finally:
                            os.close(descriptor)
                finally:
                    os.close(substitute_descriptor)
                swapped = True
            return real_publish(parent_descriptor, source, destination)

        with mock.patch(
                "build_release_bundle._rename_directory_no_replace",
                side_effect=substitute_staging_path):
            with self.assertRaisesRegex(BundleBuildError, "identity"):
                self.build(name=output.name)

        self.assertTrue(swapped)
        self.assertTrue(output.is_dir(),
                        "identity-mismatched attacker data must not be deleted")
        self.assertEqual((output / "phases.json").read_bytes(),
                         b"malicious substitution\n")
        self.assertTrue((self.root / displaced_name).is_dir())

    def test_destination_race_cannot_replace_existing_directory(self):
        output = self.root / "destination-race-bundle"
        real_publish = bundle_builder._rename_directory_no_replace
        raced = False

        def occupy_destination(parent_descriptor, source, destination):
            nonlocal raced
            if not raced:
                os.mkdir(destination, 0o700, dir_fd=parent_descriptor)
                destination_descriptor = os.open(
                    destination,
                    os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW,
                    dir_fd=parent_descriptor,
                )
                try:
                    marker = os.open(
                        "attacker-marker",
                        os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW,
                        0o600,
                        dir_fd=destination_descriptor,
                    )
                    os.close(marker)
                finally:
                    os.close(destination_descriptor)
                raced = True
            return real_publish(parent_descriptor, source, destination)

        with mock.patch(
                "build_release_bundle._rename_directory_no_replace",
                side_effect=occupy_destination):
            with self.assertRaisesRegex(BundleBuildError, "already exist"):
                self.build(name=output.name)

        self.assertTrue(raced)
        self.assertTrue((output / "attacker-marker").is_file())
        self.assertEqual(list(self.root.glob(".solver-release-*")), [])

    def test_rejects_non_posix_controller_before_creating_output(self):
        output = self.root / "windows-controller"
        with mock.patch("build_release_bundle.os.name", "nt"):
            with self.assertRaisesRegex(BundleBuildError, "POSIX"):
                self.build(name=output.name)
        self.assertFalse(output.exists())


if __name__ == "__main__":
    unittest.main(verbosity=2)
