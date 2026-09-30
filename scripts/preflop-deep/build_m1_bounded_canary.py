"""Build a reviewed M1-only bounded-canary manifest and activation migration.

This controller-only utility accepts one explicit JSON review packet, reuses
the worker's canonical Training projections and fail-closed manifest validator,
and emits inert files for protected review.  It never opens a network socket,
loads a database credential, connects to Postgres, or modifies the repository's
safety-hold ``phases.json``.
"""

from __future__ import annotations

import argparse
import ctypes
import errno
import hashlib
import json
import os
from pathlib import Path
import re
import secrets
import stat
import subprocess
import sys
import types


SCRIPT_DIRECTORY = Path(__file__).resolve().parent
INPUT_SCHEMA = "training-m1-bounded-canary-build-input.v1"
OUTPUT_RECEIPT_SCHEMA = "training-m1-bounded-canary-build-receipt.v1"
PIPELINE_DISTRIBUTION = "controller-local-bundle.v1"
PIPELINE_FILES = (
    "run_machine.py",
    "tree_gen.py",
    "pio_harvest.py",
    "orchestrate.py",
)
PIPELINE_PATHS = tuple(
    "scripts/preflop-deep/%s" % filename for filename in PIPELINE_FILES
)
CANONICAL_PROTECTED_REF = "refs/remotes/origin/main"
GIT_EXECUTABLE = "/usr/bin/git"
GIT_CHILD_PATH = "/usr/bin:/bin"
MAX_PIPELINE_FILE_BYTES = 16 * 1024 * 1024
EXPECTED_ROOT_FIELDS = frozenset((
    "schema",
    "migration_version",
    "manifest_version",
    "review",
    "pipeline",
    "pio",
    "phase",
    "canary",
    "self_test",
))
EXPECTED_REVIEW_FIELDS = frozenset((
    "approved_by",
    "expected_training_game_count",
    "expected_chip_ev_contract_count",
    "expected_icm_contract_count",
    "expected_tree_geometry",
))
EXPECTED_PIPELINE_FIELDS = frozenset((
    "commit",
    "distribution",
    "files_sha256",
    "bundle_sha256",
))
EXPECTED_PIO_FIELDS = frozenset((
    "machine_id",
    "solver_version",
    "binary_sha256",
    "source_combo_order_sha256",
))
EXPECTED_SELF_TEST_FIELDS = frozenset((
    "board",
    "pot_chips",
    "eff_chips",
    "rake",
    "accuracy_fraction",
    "oop_range",
    "oop_range_checksum",
    "ip_range",
    "ip_range_checksum",
    "oop_player",
    "ip_player",
    "ev_oop_min_bb",
    "ev_oop_max_bb",
))
LOWER_HEX_40 = re.compile(r"^[0-9a-f]{40}$")
LOWER_HEX_64 = re.compile(r"^[0-9a-f]{64}$")
MIGRATION_VERSION = re.compile(r"^[0-9]{14}$")


class CanaryBuildError(RuntimeError):
    """A fail-closed controller artifact validation error."""


def _require_posix_controller():
    if (os.name != "posix" or sys.platform not in ("darwin", "linux")
            or not all(hasattr(os, name) for name in (
                "O_DIRECTORY", "O_NOFOLLOW",
            ))):
        raise CanaryBuildError(
            "bounded-canary artifact creation requires a POSIX controller filesystem"
        )


def _strict_object(pairs):
    value = {}
    for key, item in pairs:
        if key in value:
            raise CanaryBuildError("JSON contains a duplicate object key: %s" % key)
        value[key] = item
    return value


def _reject_json_constant(value):
    raise CanaryBuildError("JSON contains a non-finite number: %s" % value)


def _strict_json_loads(raw):
    return json.loads(
        raw,
        object_pairs_hook=_strict_object,
        parse_constant=_reject_json_constant,
    )


def _git(repo, *arguments, check=True):
    try:
        executable = os.lstat(GIT_EXECUTABLE)
    except OSError:
        raise CanaryBuildError("trusted Git executable is unavailable") from None
    if (not stat.S_ISREG(executable.st_mode)
            or stat.S_ISLNK(executable.st_mode)
            or not os.access(GIT_EXECUTABLE, os.X_OK)):
        raise CanaryBuildError("trusted Git executable is not a regular executable")
    environment = {
        "PATH": GIT_CHILD_PATH,
        "LANG": "C",
        "LC_ALL": "C",
        "GIT_NO_REPLACE_OBJECTS": "1",
        "GIT_GRAFT_FILE": os.devnull,
        "GIT_NO_LAZY_FETCH": "1",
        "GIT_TERMINAL_PROMPT": "0",
        "GIT_CONFIG_NOSYSTEM": "1",
        "GIT_CONFIG_GLOBAL": os.devnull,
    }
    result = subprocess.run(
        [GIT_EXECUTABLE, "--no-replace-objects", "-C", str(repo), *arguments],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        env=environment,
        check=False,
    )
    if check and result.returncode != 0:
        raise CanaryBuildError("Git object verification failed")
    return result


def _reject_legacy_grafts(repo):
    git_marker = repo / ".git"
    try:
        marker_info = os.lstat(git_marker)
    except OSError:
        raise CanaryBuildError("repository Git directory could not be verified") from None
    if stat.S_ISDIR(marker_info.st_mode):
        common_directory = git_marker
    elif stat.S_ISREG(marker_info.st_mode):
        try:
            marker = git_marker.read_text(encoding="utf-8").strip()
        except (OSError, UnicodeError):
            raise CanaryBuildError("repository Git directory could not be verified") from None
        if not marker.startswith("gitdir: ") or "\n" in marker:
            raise CanaryBuildError("repository worktree Git directory is malformed")
        git_directory = Path(marker[8:])
        if not git_directory.is_absolute():
            git_directory = git_marker.parent / git_directory
        git_directory = git_directory.resolve()
        common_file = git_directory / "commondir"
        if common_file.exists():
            try:
                common_value = common_file.read_text(encoding="utf-8").strip()
            except (OSError, UnicodeError):
                raise CanaryBuildError(
                    "repository common Git directory is malformed"
                ) from None
            common_directory = Path(common_value)
            if not common_directory.is_absolute():
                common_directory = git_directory / common_directory
            common_directory = common_directory.resolve()
        else:
            common_directory = git_directory
    else:
        raise CanaryBuildError(
            "repository Git directory must not use links or reparse points"
        )
    graft_path = common_directory / "info" / "grafts"
    try:
        graft_info = os.lstat(graft_path)
    except FileNotFoundError:
        return
    except OSError:
        raise CanaryBuildError("Git graft state could not be verified") from None
    if (not stat.S_ISREG(graft_info.st_mode)
            or getattr(graft_info, "st_file_attributes", 0) & 0x400):
        raise CanaryBuildError("Git graft state must not use links or reparse points")
    try:
        if graft_path.read_bytes().strip():
            raise CanaryBuildError("legacy Git grafts may not alter protected ancestry")
    except OSError:
        raise CanaryBuildError("Git graft state could not be verified") from None


def _read_git_blob(repo, commit, path, object_format):
    try:
        listing = _git(repo, "ls-tree", "--full-tree", commit, "--", path).stdout.decode(
            "utf-8", "strict"
        ).strip()
    except UnicodeError:
        raise CanaryBuildError("Git tree listing is not valid UTF-8") from None
    fields = listing.split(None, 3)
    if len(fields) != 4 or fields[1] != "blob" or fields[3] != path:
        raise CanaryBuildError(
            "reviewed pipeline commit is missing an exact regular-file blob: %s" % path
        )
    if fields[0] not in ("100644", "100755"):
        raise CanaryBuildError("reviewed pipeline requires regular-file blobs")
    object_id = fields[2]
    expected_length = 40 if object_format == "sha1" else 64
    if not re.fullmatch(r"[0-9a-f]{%d}" % expected_length, object_id):
        raise CanaryBuildError("Git tree contains a malformed blob object ID")
    size_text = _git(repo, "cat-file", "-s", object_id).stdout.decode(
        "ascii", "strict"
    ).strip()
    if not size_text.isdigit() or int(size_text) > MAX_PIPELINE_FILE_BYTES:
        raise CanaryBuildError("reviewed pipeline file exceeds its size limit")
    payload = _git(repo, "cat-file", "blob", object_id).stdout
    if len(payload) != int(size_text) or len(payload) > MAX_PIPELINE_FILE_BYTES:
        raise CanaryBuildError("reviewed pipeline file exceeds its size limit")
    digest = hashlib.new(object_format)
    digest.update(("blob %d\0" % len(payload)).encode("ascii"))
    digest.update(payload)
    if digest.hexdigest() != object_id:
        raise CanaryBuildError("Git blob object ID does not match its exact bytes")
    return payload


def _read_local_pipeline_bytes(filename):
    """Read one controller pipeline file exactly once without following links."""
    path = SCRIPT_DIRECTORY / filename
    try:
        descriptor = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
    except OSError:
        raise CanaryBuildError(
            "local pipeline file is unavailable: %s" % filename
        ) from None
    try:
        info = os.fstat(descriptor)
        if (not stat.S_ISREG(info.st_mode)
                or info.st_size > MAX_PIPELINE_FILE_BYTES):
            raise CanaryBuildError(
                "local pipeline file is not an admitted regular file: %s" % filename
            )
        chunks = []
        remaining = info.st_size
        while remaining:
            chunk = os.read(descriptor, min(1024 * 1024, remaining))
            if not chunk:
                raise CanaryBuildError(
                    "local pipeline file changed while being read: %s" % filename
                )
            chunks.append(chunk)
            remaining -= len(chunk)
        if os.read(descriptor, 1):
            raise CanaryBuildError(
                "local pipeline file changed while being read: %s" % filename
            )
        return b"".join(chunks)
    except OSError:
        raise CanaryBuildError(
            "local pipeline file could not be verified: %s" % filename
        ) from None
    finally:
        os.close(descriptor)


def _read_sealed_local_pipeline(pipeline):
    """Return exact local bytes only when every file matches the sealed packet."""
    payloads = {}
    for filename in PIPELINE_FILES:
        payload = _read_local_pipeline_bytes(filename)
        if hashlib.sha256(payload).hexdigest() != pipeline["files_sha256"][filename]:
            raise CanaryBuildError(
                "local pipeline bytes do not match the reviewed Git blob: %s"
                % filename
            )
        payloads[filename] = payload
    return payloads


def _verify_reviewed_pipeline(repo, protected_ref, protected_main_commit, pipeline):
    _require_posix_controller()
    if not isinstance(pipeline, dict) or set(pipeline) != set(EXPECTED_PIPELINE_FIELDS):
        raise CanaryBuildError("pipeline must contain exactly its reviewed fields")
    commit = pipeline.get("commit")
    if not isinstance(commit, str) or not LOWER_HEX_40.fullmatch(commit):
        raise CanaryBuildError("pipeline.commit must be an exact lowercase Git SHA-1")
    if pipeline.get("distribution") != PIPELINE_DISTRIBUTION:
        raise CanaryBuildError(
            "pipeline.distribution is not controller-local-bundle.v1"
        )
    files_sha256 = pipeline.get("files_sha256")
    if (not isinstance(files_sha256, dict)
            or set(files_sha256) != set(PIPELINE_FILES)):
        raise CanaryBuildError(
            "pipeline.files_sha256 must seal the four exact pipeline files"
        )
    for filename in PIPELINE_FILES:
        checksum = files_sha256.get(filename)
        if (not isinstance(checksum, str)
                or not LOWER_HEX_64.fullmatch(checksum)
                or checksum == "0" * 64):
            raise CanaryBuildError(
                "%s checksum must be a nonzero lowercase SHA-256" % filename
            )
    bundle_checksum = pipeline.get("bundle_sha256")
    if (not isinstance(bundle_checksum, str)
            or not LOWER_HEX_64.fullmatch(bundle_checksum)
            or bundle_checksum == "0" * 64):
        raise CanaryBuildError(
            "pipeline bundle checksum must be a nonzero lowercase SHA-256"
        )
    repo = Path(repo).resolve()
    if not repo.is_dir():
        raise CanaryBuildError("repository path does not exist")
    if protected_ref != CANONICAL_PROTECTED_REF:
        raise CanaryBuildError(
            "protected ref must be the canonical refs/remotes/origin/main"
        )
    protected_main_commit = str(protected_main_commit or "").strip().lower()
    if not LOWER_HEX_40.fullmatch(protected_main_commit):
        raise CanaryBuildError(
            "an independently verified exact protected-main commit is required"
        )
    _reject_legacy_grafts(repo)
    resolved = _git(
        repo, "rev-parse", "--verify", "%s^{commit}" % commit
    ).stdout.decode("ascii", "strict").strip()
    if resolved != commit:
        raise CanaryBuildError("pipeline commit did not resolve to the exact object")
    protected_commit = _git(
        repo, "rev-parse", "--verify", "%s^{commit}" % protected_ref
    ).stdout.decode("ascii", "strict").strip()
    if protected_commit != protected_main_commit:
        raise CanaryBuildError(
            "canonical origin/main does not match the verified protected-main commit"
        )
    ancestry = _git(
        repo, "merge-base", "--is-ancestor", commit, protected_commit,
        check=False,
    )
    if ancestry.returncode != 0:
        raise CanaryBuildError("pipeline commit is not an ancestor of protected main")
    _git(
        repo, "fsck", "--strict", "--no-reflogs", "--no-dangling",
        commit, protected_commit,
    )
    object_format = _git(repo, "rev-parse", "--show-object-format").stdout.decode(
        "ascii", "strict"
    ).strip()
    if object_format not in ("sha1", "sha256"):
        raise CanaryBuildError("Git repository uses an unsupported object format")

    aggregate = hashlib.sha256()
    derived = {}
    for path, filename in zip(PIPELINE_PATHS, PIPELINE_FILES):
        payload = _read_git_blob(repo, commit, path, object_format)
        checksum = hashlib.sha256(payload).hexdigest()
        derived[filename] = checksum
        aggregate.update(filename.encode("ascii") + b"\0" + payload + b"\0")
    if pipeline["files_sha256"] != derived:
        raise CanaryBuildError(
            "review packet pipeline file checksums do not match immutable Git objects"
        )
    if pipeline["bundle_sha256"] != aggregate.hexdigest():
        raise CanaryBuildError(
            "review packet pipeline bundle checksum does not match immutable Git objects"
        )
    _read_sealed_local_pipeline(pipeline)
    return protected_commit


def _exact_fields(value, expected, label):
    if not isinstance(value, dict) or set(value) != set(expected):
        missing = sorted(set(expected) - set(value or {}) if isinstance(value, dict) else expected)
        extra = sorted(set(value or {}) - set(expected) if isinstance(value, dict) else ())
        raise CanaryBuildError(
            "%s must contain exactly its reviewed fields (missing=%s extra=%s)"
            % (label, missing, extra)
        )
    return value


def _sealed_sha256(value, label):
    if (not isinstance(value, str) or not LOWER_HEX_64.fullmatch(value)
            or value == "0" * 64):
        raise CanaryBuildError("%s must be a nonzero lowercase SHA-256" % label)
    return value


def _printable_line(value, label, minimum, maximum):
    if (not isinstance(value, str) or value != value.strip()
            or not minimum <= len(value) <= maximum
            or any(ord(character) < 32 or ord(character) == 127 for character in value)):
        raise CanaryBuildError("%s must be one exact printable line" % label)
    return value


def _load_worker_contract(pipeline):
    """Execute only checksum-sealed local bytes matching immutable Git blobs."""
    module_name = "_training_m1_canary_contract"
    if module_name in sys.modules:
        return sys.modules[module_name]

    payloads = _read_sealed_local_pipeline(pipeline)

    legacy_names = (
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
    )
    configured_names = sorted(
        name for name in legacy_names if name in os.environ
    )
    if configured_names:
        raise CanaryBuildError(
            "isolated validator inherited database environment names: %s"
            % ",".join(configured_names)
        )
    saved_argv = sys.argv[:]
    try:
        sys.argv = [str(__file__), "M1", "2", "0", "--canary"]
        loaded_names = []
        for imported_name, filename in (
                ("tree_gen", "tree_gen.py"),
                ("pio_harvest", "pio_harvest.py"),
                (module_name, "orchestrate.py")):
            module = types.ModuleType(imported_name)
            module.__file__ = str(SCRIPT_DIRECTORY / filename)
            module.__package__ = ""
            sys.modules[imported_name] = module
            loaded_names.append(imported_name)
            try:
                code = compile(payloads[filename], module.__file__, "exec")
                exec(code, module.__dict__)
            except BaseException:
                for loaded_name in reversed(loaded_names):
                    sys.modules.pop(loaded_name, None)
                raise
        return sys.modules[module_name]
    except BaseException:
        sys.modules.pop(module_name, None)
        raise
    finally:
        sys.argv = saved_argv


def _read_review_packet(path):
    _require_posix_controller()
    path = Path(path)
    try:
        descriptor = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
    except OSError:
        raise CanaryBuildError("review packet is unavailable") from None
    try:
        info = os.fstat(descriptor)
        if not stat.S_ISREG(info.st_mode) or info.st_size > 2 * 1024 * 1024:
            raise CanaryBuildError(
                "review packet must be a regular JSON file under 2 MiB"
            )
        chunks = []
        total = 0
        while total <= 2 * 1024 * 1024:
            chunk = os.read(descriptor, 1024 * 1024)
            if not chunk:
                break
            chunks.append(chunk)
            total += len(chunk)
        if total > 2 * 1024 * 1024:
            raise CanaryBuildError(
                "review packet must be a regular JSON file under 2 MiB"
            )
        raw = b"".join(chunks)
        packet = _strict_json_loads(raw.decode("utf-8"))
    except CanaryBuildError:
        raise
    except (OSError, UnicodeError, ValueError):
        raise CanaryBuildError("review packet must be valid UTF-8 JSON") from None
    finally:
        os.close(descriptor)
    _exact_fields(packet, EXPECTED_ROOT_FIELDS, "review packet")
    return raw, packet


def _build_manifest(packet, worker):
    if packet["schema"] != INPUT_SCHEMA:
        raise CanaryBuildError("review packet schema is unsupported")
    if type(packet["manifest_version"]) is not int or packet["manifest_version"] != 5:
        raise CanaryBuildError("manifest_version must be the exact integer 5")
    if not isinstance(packet["migration_version"], str) or not MIGRATION_VERSION.fullmatch(
            packet["migration_version"]):
        raise CanaryBuildError("migration_version must be exactly 14 decimal digits")

    review = _exact_fields(packet["review"], EXPECTED_REVIEW_FIELDS, "review")
    approved_by = _printable_line(review["approved_by"], "approved_by", 3, 200)
    expected_review = {
        "expected_training_game_count": 107,
        "expected_chip_ev_contract_count": 18,
        "expected_icm_contract_count": 7,
        "expected_tree_geometry": worker.h.GEOMETRY_TAG,
    }
    for field, expected in expected_review.items():
        if review[field] != expected:
            raise CanaryBuildError("review.%s must be %r" % (field, expected))
    if worker.h.GEOMETRY_TAG != "srp_parameterized_four_action_v3":
        raise CanaryBuildError("canonical worker geometry is not v3")

    pipeline = _exact_fields(packet["pipeline"], EXPECTED_PIPELINE_FIELDS, "pipeline")
    if (not isinstance(pipeline["commit"], str)
            or not LOWER_HEX_40.fullmatch(pipeline["commit"])):
        raise CanaryBuildError("pipeline.commit must be an exact lowercase Git SHA-1")
    if pipeline["distribution"] != PIPELINE_DISTRIBUTION:
        raise CanaryBuildError("pipeline.distribution is not controller-local-bundle.v1")
    files_sha256 = pipeline["files_sha256"]
    if not isinstance(files_sha256, dict) or set(files_sha256) != set(PIPELINE_FILES):
        raise CanaryBuildError("pipeline.files_sha256 must seal the four exact pipeline files")
    for filename in PIPELINE_FILES:
        _sealed_sha256(files_sha256[filename], "%s checksum" % filename)
    bundle_sha256 = _sealed_sha256(pipeline["bundle_sha256"], "pipeline bundle checksum")

    pio = _exact_fields(packet["pio"], EXPECTED_PIO_FIELDS, "pio")
    if pio["machine_id"] != "M1":
        raise CanaryBuildError("the first bounded canary must target M1 only")
    solver_version = _printable_line(pio["solver_version"], "solver_version", 1, 120)
    solver_binary_sha256 = _sealed_sha256(pio["binary_sha256"], "Pio binary checksum")
    source_order_sha256 = _sealed_sha256(
        pio["source_combo_order_sha256"], "Pio show_hand_order checksum"
    )

    phase = _exact_fields(packet["phase"], worker.PHASE_CONTRACT_FIELDS, "phase")
    if phase["tree_geometry"] != worker.h.GEOMETRY_TAG:
        raise CanaryBuildError("phase must bind the canonical v3 tree geometry")
    for field in ("ip_range_checksum", "oop_range_checksum"):
        _sealed_sha256(phase[field], "phase.%s" % field)

    canary = _exact_fields(
        packet["canary"], worker.BOUNDED_CANARY_CONTRACT_FIELDS, "canary"
    )
    if (canary["machine_id"], canary["partition_count"], canary["partition_index"]) != (
            "M1", 2, 0):
        raise CanaryBuildError("canary must bind exactly M1 partition 2/0")
    if canary["phase_id"] != phase["id"]:
        raise CanaryBuildError("canary phase_id must identify the one reviewed phase")

    self_test = _exact_fields(packet["self_test"], EXPECTED_SELF_TEST_FIELDS, "self_test")
    for field in ("ip_range_checksum", "oop_range_checksum"):
        _sealed_sha256(self_test[field], "self_test.%s" % field)
    phase_bound_self_test_fields = (
        "pot_chips", "eff_chips", "rake", "accuracy_fraction",
        "oop_range", "oop_range_checksum", "ip_range", "ip_range_checksum",
        "oop_player", "ip_player",
    )
    for field in phase_bound_self_test_fields:
        if self_test[field] != phase[field]:
            raise CanaryBuildError("self_test.%s must match the reviewed phase" % field)

    chip_ev_contracts = worker.canonical_contract_pairs(worker.TRAINING_SOLVER_CONTRACTS)
    icm_contracts = worker.canonical_contract_pairs(worker.TRAINING_ICM_CONTRACTS)
    if len(chip_ev_contracts) != 18 or len(icm_contracts) != 7:
        raise CanaryBuildError("canonical Training scope is not exactly 18 chip-EV plus 7 ICM")
    phase_contracts = worker.canonical_phase_contracts([phase])
    game_contracts = worker.canonical_training_game_contracts([phase])
    if len(game_contracts) != 107:
        raise CanaryBuildError("canonical Training game projection is not exactly 107 games")
    bounded_contracts = worker.canonical_bounded_canary_contracts([canary])

    manifest = {
        "version": packet["manifest_version"],
        "execution_scope": worker.EXECUTION_SCOPE_BOUNDED_CANARY,
        "pipeline_distribution": PIPELINE_DISTRIBUTION,
        "pipeline_files_sha256": {
            filename: files_sha256[filename] for filename in sorted(files_sha256)
        },
        "pipeline_bundle_checksum": bundle_sha256,
        "range_combo_order": worker.h.COMBO_ORDER,
        "artifact_combo_order": worker.h.COMBO_ORDER,
        "source_combo_order_schema": worker.h.SOURCE_COMBO_ORDER_SCHEMA,
        "source_combo_order_sha256": source_order_sha256,
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
        "release_gate": {
            "solver_ready": False,
            "reason": "Only the checksum-sealed M1 bounded canary is authorized.",
            "bounded_canary_ready": True,
            "bounded_canary_reason": "One reviewed M1 parent/Turn-child pair only.",
        },
        "bounded_canary_contracts_schema": worker.BOUNDED_CANARY_CONTRACT_SCHEMA,
        "bounded_canary_contracts": bounded_contracts,
        "bounded_canary_contracts_sha256": worker.bounded_canary_contracts_checksum(
            bounded_contracts
        ),
        "self_test": self_test,
        "phases": [phase],
    }
    manifest_text = json.dumps(
        manifest, sort_keys=True, separators=(",", ":"),
        ensure_ascii=False, allow_nan=False,
    ) + "\n"
    manifest_sha256 = hashlib.sha256(manifest_text.encode("utf-8")).hexdigest()
    previous_checksum = worker.APPROVED_MANIFEST_CHECKSUM
    try:
        worker.APPROVED_MANIFEST_CHECKSUM = manifest_sha256
        validated, observed_checksum = worker.validate_manifest(manifest_text, "canary")
    except (SystemExit, ValueError, TypeError, KeyError) as error:
        raise CanaryBuildError("canonical manifest validation failed: %s" % error) from None
    finally:
        worker.APPROVED_MANIFEST_CHECKSUM = previous_checksum
        worker.ACTIVE_ADMISSION_MODE = None
    if observed_checksum != manifest_sha256 or validated != manifest:
        raise CanaryBuildError("canonical manifest validation changed the reviewed artifact")
    return manifest, manifest_text, manifest_sha256, approved_by, {
        "pipeline_commit": pipeline["commit"],
        "solver_version": solver_version,
        "solver_binary_sha256": solver_binary_sha256,
    }


def _isolated_worker_environment():
    return {
        "PYTHONDONTWRITEBYTECODE": "1",
        "SOLVER_WORKER_API_URL": "https://smarter.poker/api/training/solver-worker",
        "SOLVER_WORKER_HMAC_SECRET": "1" * 64,
        "PIPELINE_COMMIT": "2" * 40,
        "PIO_SOLVER_VERSION": "controller-validation-only",
        "PIO_BINARY_CHECKSUM": "3" * 64,
        "APPROVED_MANIFEST_CHECKSUM": "4" * 64,
        "RANGE_DIRECTORY": str(SCRIPT_DIRECTORY),
    }


def _canonicalize_review_packet(packet):
    encoded = json.dumps(
        packet, sort_keys=True, separators=(",", ":"),
        ensure_ascii=False, allow_nan=False,
    ).encode("utf-8")
    try:
        result = subprocess.run(
            [sys.executable, str(Path(__file__).resolve()), "--canonicalize-internal"],
            cwd=SCRIPT_DIRECTORY,
            env=_isolated_worker_environment(),
            input=encoded,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            timeout=30,
            check=False,
        )
    except (OSError, subprocess.TimeoutExpired):
        raise CanaryBuildError("isolated canonical worker validation was unavailable") from None
    if result.returncode != 0:
        reason = result.stderr.decode("utf-8", "replace").strip()
        if len(reason) > 1000:
            reason = reason[:1000]
        raise CanaryBuildError(
            "isolated canonical worker validation failed: %s" % (reason or "unknown error")
        )
    if len(result.stdout) > 4 * 1024 * 1024:
        raise CanaryBuildError("isolated canonical worker validation exceeded its output bound")
    try:
        output = _strict_json_loads(result.stdout.decode("utf-8"))
        manifest = output["manifest"]
        manifest_text = output["manifest_text"]
        manifest_sha256 = output["manifest_sha256"]
        approved_by = output["approved_by"]
        identities = output["identities"]
    except (UnicodeError, ValueError, TypeError, KeyError):
        raise CanaryBuildError("isolated canonical worker validation returned invalid JSON") from None
    if (not isinstance(manifest_text, str)
            or hashlib.sha256(manifest_text.encode("utf-8")).hexdigest()
            != manifest_sha256
            or _strict_json_loads(manifest_text) != manifest):
        raise CanaryBuildError("isolated canonical manifest receipt did not match its bytes")
    return manifest, manifest_text, manifest_sha256, approved_by, identities


def _canonical_child_main():
    try:
        raw = sys.stdin.buffer.read(2 * 1024 * 1024 + 1)
        if len(raw) > 2 * 1024 * 1024:
            raise CanaryBuildError("review packet exceeds isolated validation bound")
        packet = _strict_json_loads(raw.decode("utf-8"))
        worker = _load_worker_contract(packet["pipeline"])
        manifest, manifest_text, digest, approved_by, identities = (
            _build_manifest(packet, worker)
        )
        response = {
            "manifest": manifest,
            "manifest_text": manifest_text,
            "manifest_sha256": digest,
            "approved_by": approved_by,
            "identities": identities,
        }
        sys.stdout.write(json.dumps(response, sort_keys=True, separators=(",", ":")))
        return 0
    except (CanaryBuildError, UnicodeError, ValueError, TypeError, KeyError) as error:
        print("HOLD: %s" % error, file=sys.stderr)
        return 1


def _sql_literal(value):
    return "'" + str(value).replace("'", "''") + "'"


def _manifest_authority_contract(phase, manifest):
    return {
        "game_type": phase["game_type"],
        "stack_depth": phase["stack"],
        "oop_player": phase["oop_player"],
        "ip_player": phase["ip_player"],
        "pot_chips": phase["pot_chips"],
        "eff_chips": phase["eff_chips"],
        "rake": phase["rake"],
        "accuracy_fraction": phase["accuracy_fraction"],
        "oop_range_checksum": phase["oop_range_checksum"],
        "ip_range_checksum": phase["ip_range_checksum"],
        "range_combo_order": manifest["range_combo_order"],
        "source_combo_order_sha256": manifest["source_combo_order_sha256"],
        "tree_geometry": phase["tree_geometry"],
        "streets": phase["streets"],
    }


def _canary_target_position(phase, canary):
    matching = []
    for target in phase["harvest"]:
        prefix = "%s_%s_%dbb_" % (
            phase["game_type"], target["position"], phase["stack"]
        )
        if (canary["parent_scenario_hash"].startswith(prefix)
                and canary["parent_node"] == target["node"]):
            matching.append(target["position"])
    if len(matching) != 1:
        raise CanaryBuildError(
            "canary parent must select exactly one reviewed harvest position"
        )
    return matching[0]


def _build_sql(manifest, manifest_sha256, approved_by, identities,
               migration_version):
    canary = manifest["bounded_canary_contracts"][0]
    phase = manifest["phases"][0]
    authority_contracts = json.dumps(
        [_manifest_authority_contract(phase, manifest)],
        sort_keys=True, separators=(",", ":"), allow_nan=False,
    )
    machine = "M1"
    version = str(manifest["version"])
    solver_version = identities["solver_version"]
    binary = identities["solver_binary_sha256"]
    commit = identities["pipeline_commit"]
    source_order = manifest["source_combo_order_sha256"]
    game_contracts = manifest["training_game_contracts_sha256"]
    target_position = _canary_target_position(phase, canary)
    target_identity_assertions = []
    for role, street in (("parent", "flop"), ("child", "turn")):
        target_identity_assertions.append("""  IF (
    SELECT count(*)
    FROM public.solved_spots_gold artifact
    WHERE artifact.id = {artifact_id}::uuid
      AND artifact.scenario_hash = {scenario_hash}
      AND artifact.street = {street}
      AND artifact.game_type = {game_type}
      AND artifact.stack_depth = {stack_depth}
      AND artifact.strategy_matrix_v2 ->> 'node' = {node}
      AND artifact.strategy_matrix_v2 ->> 'position' = {position}
  ) <> 1 THEN
    RAISE EXCEPTION 'TRAINING_SOLVER_M1_CANARY_{role}_IDENTITY_MISMATCH';
  END IF;""".format(
            artifact_id=_sql_literal(canary["%s_artifact_id" % role]),
            scenario_hash=_sql_literal(canary["%s_scenario_hash" % role]),
            street=_sql_literal(street),
            game_type=_sql_literal(phase["game_type"]),
            stack_depth=int(phase["stack"]),
            node=_sql_literal(canary["%s_node" % role]),
            position=_sql_literal(target_position),
            role=role.upper(),
        ))

    exact_predicate = """machine_id = {machine}
    AND solver_version = {solver_version}
    AND solver_binary_checksum = {binary}
    AND pipeline_commit = {commit}
    AND manifest_version = {version}
    AND manifest_checksum = {manifest}""".format(
        machine=_sql_literal(machine),
        solver_version=_sql_literal(solver_version),
        binary=_sql_literal(binary),
        commit=_sql_literal(commit),
        version=_sql_literal(version),
        manifest=_sql_literal(manifest_sha256),
    )

    target_rows = []
    for role, street in (("parent", "flop"), ("child", "turn")):
        target_rows.append("(" + ", ".join((
            _sql_literal(machine), _sql_literal(solver_version),
            _sql_literal(binary), _sql_literal(commit), _sql_literal(version),
            _sql_literal(manifest_sha256), _sql_literal(role),
            _sql_literal(canary["%s_artifact_id" % role]),
            _sql_literal(canary["%s_scenario_hash" % role]),
            _sql_literal(street), _sql_literal(canary["%s_node" % role]),
            _sql_literal(target_position),
            _sql_literal(approved_by),
        )) + ")")

    return """-- =====================================================================
-- {migration_version}_activate_training_solver_m1_bounded_canary.sql
-- =====================================================================
-- TIER:        2
-- AUTHOR:      Smarter.Poker Phase 6 controller
-- AFFECTS:     training_solver_provenance_authority,
--              training_solver_bounded_canary_targets,
--              training_solver_ingest_scopes (DML only)
-- IRREVERSIBLE: no
--
-- WHY:
--   Install the exact reviewed M1 authority tuple and two reserved warehouse
--   identities required by the cash-002 continuation cohort. Evidence and the
--   literal contract live in the dated Phase 6 M1 bounded-canary audit files.
--
-- HOW (high level):
--   - Fail closed unless prerequisite objects and exact target identities exist.
--   - Insert one checksum-sealed authority and exactly two canary targets.
--   - Move only the exact M1 tuple from held to bounded_canary for partition 2/0.
--   - Assert that exactly one bounded scope is active before commit.
-- =====================================================================
-- Generated by build_m1_bounded_canary.py from one reviewed packet.
-- Literal M1 held -> target install -> bounded-canary activation only.
BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

DO $phase6_m1_prerequisites$
BEGIN
  IF to_regclass('public.training_solver_provenance_authority') IS NULL
     OR to_regclass('public.training_solver_ingest_scopes') IS NULL
     OR to_regclass('public.training_solver_bounded_canary_targets') IS NULL
     OR to_regclass('public.solved_spots_gold') IS NULL
     OR NOT EXISTS (
       SELECT 1
       FROM pg_catalog.pg_attribute attribute_row
       WHERE attribute_row.attrelid =
         to_regclass('public.solved_spots_gold')
         AND attribute_row.attname = 'strategy_matrix_v2'
         AND attribute_row.attnum > 0
         AND NOT attribute_row.attisdropped
     ) THEN
    RAISE EXCEPTION 'TRAINING_SOLVER_M1_CANARY_PREREQUISITE_MISSING';
  END IF;
END;
$phase6_m1_prerequisites$;

DO $phase6_m1_target_identity$
BEGIN
{target_identity_assertions}
END;
$phase6_m1_target_identity$;

INSERT INTO public.training_solver_provenance_authority (
  machine_id, solver_version, solver_binary_checksum, pipeline_commit,
  manifest_version, manifest_checksum, source_combo_order_sha256,
  training_game_contracts_sha256, manifest_contracts, approved_by
) VALUES (
  {machine}, {solver_version}, {binary}, {commit}, {version}, {manifest},
  {source_order}, {game_contracts}, {authority_contracts}::jsonb, {approved_by}
);

INSERT INTO public.training_solver_bounded_canary_targets (
  machine_id, solver_version, solver_binary_checksum, pipeline_commit,
  manifest_version, manifest_checksum, target_role, artifact_id,
  scenario_hash, street, node, hero_position, approved_by
) VALUES
  {target_rows};

DO $phase6_m1_single_active_scope$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.training_solver_ingest_scopes other_scope
    JOIN public.training_solver_provenance_authority other_authority
      USING (
        machine_id, solver_version, solver_binary_checksum, pipeline_commit,
        manifest_version, manifest_checksum
      )
    WHERE other_scope.machine_id = 'M1'
      AND other_scope.admission_mode IN ('backlog', 'bounded_canary')
      AND other_authority.retired_at IS NULL
      AND (
        other_scope.solver_version IS DISTINCT FROM {solver_version}
        OR other_scope.solver_binary_checksum IS DISTINCT FROM {binary}
        OR other_scope.pipeline_commit IS DISTINCT FROM {commit}
        OR other_scope.manifest_version IS DISTINCT FROM {version}
        OR other_scope.manifest_checksum IS DISTINCT FROM {manifest}
      )
  ) THEN
    RAISE EXCEPTION 'TRAINING_SOLVER_MACHINE_INGEST_SCOPE_ALREADY_ACTIVE';
  END IF;
END;
$phase6_m1_single_active_scope$;

UPDATE public.training_solver_ingest_scopes
SET admission_mode = 'bounded_canary',
    partition_count = 2,
    partition_index = 0,
    configured_at = clock_timestamp(),
    configured_by = {approved_by}
WHERE {exact_predicate}
  AND admission_mode = 'held';

DO $phase6_m1_activation_assertion$
BEGIN
  IF (SELECT count(*)
      FROM public.training_solver_ingest_scopes
      WHERE {exact_predicate}
        AND admission_mode = 'bounded_canary'
        AND partition_count = 2
        AND partition_index = 0) <> 1 THEN
    RAISE EXCEPTION 'M1 bounded canary approval did not activate exactly one scope';
  END IF;
END;
$phase6_m1_activation_assertion$;

COMMIT;
""".format(
        migration_version=migration_version,
        machine=_sql_literal(machine),
        solver_version=_sql_literal(solver_version),
        binary=_sql_literal(binary),
        commit=_sql_literal(commit),
        version=_sql_literal(version),
        manifest=_sql_literal(manifest_sha256),
        source_order=_sql_literal(source_order),
        game_contracts=_sql_literal(game_contracts),
        authority_contracts=_sql_literal(authority_contracts),
        approved_by=_sql_literal(approved_by),
        target_rows=(",\n  ").join(target_rows),
        target_identity_assertions="\n".join(target_identity_assertions),
        exact_predicate=exact_predicate,
    )


def _validate_destination(output):
    _require_posix_controller()
    raw = str(output)
    if not os.path.isabs(raw) or raw.startswith(("//", "\\\\")):
        raise CanaryBuildError("output must be an absolute local directory")
    path = Path(os.path.abspath(raw))
    if path.exists():
        raise CanaryBuildError("output directory must not already exist")
    parent = path.parent
    if not parent.is_dir():
        raise CanaryBuildError("output parent directory does not exist")
    cursor = parent
    while True:
        info = os.lstat(cursor)
        if stat.S_ISLNK(info.st_mode) or getattr(
                info, "st_file_attributes", 0) & 0x400:
            raise CanaryBuildError("output path may not use links or reparse points")
        if cursor.parent == cursor:
            break
        cursor = cursor.parent
    if parent.resolve() != parent:
        raise CanaryBuildError("output path must use its canonical local spelling")
    parent_info = os.lstat(parent)
    if not stat.S_ISDIR(parent_info.st_mode):
        raise CanaryBuildError("output parent directory is not a regular directory")
    return path, (parent_info.st_dev, parent_info.st_ino)


def _parent_identity_matches(parent, expected_identity):
    try:
        current = os.stat(parent, follow_symlinks=False)
    except OSError:
        return False
    return (stat.S_ISDIR(current.st_mode)
            and (current.st_dev, current.st_ino) == expected_identity)


def _directory_entry_exists(parent_descriptor, name):
    try:
        os.stat(name, dir_fd=parent_descriptor, follow_symlinks=False)
    except FileNotFoundError:
        return False
    return True


def _rename_directory_no_replace(parent_descriptor, source, destination):
    library = ctypes.CDLL(None, use_errno=True)
    if sys.platform == "darwin":
        operation = getattr(library, "renameatx_np", None)
        flag = 0x00000004
    elif sys.platform == "linux":
        operation = getattr(library, "renameat2", None)
        flag = 0x00000001
    else:
        operation = None
        flag = 0
    if operation is None:
        raise CanaryBuildError(
            "controller filesystem lacks atomic no-replace publication"
        )
    operation.argtypes = [
        ctypes.c_int, ctypes.c_char_p, ctypes.c_int, ctypes.c_char_p,
        ctypes.c_uint,
    ]
    operation.restype = ctypes.c_int
    ctypes.set_errno(0)
    result = operation(
        parent_descriptor, os.fsencode(source),
        parent_descriptor, os.fsencode(destination),
        flag,
    )
    if result == 0:
        return
    error_number = ctypes.get_errno()
    if error_number in (errno.EEXIST, errno.ENOTEMPTY):
        raise CanaryBuildError("output directory must not already exist")
    raise CanaryBuildError("atomic no-replace publication failed")


def _verify_output_descriptor(directory_descriptor, expected_payloads):
    if set(os.listdir(directory_descriptor)) != set(expected_payloads):
        raise CanaryBuildError("output directory has unexpected entries")
    for name, expected in expected_payloads.items():
        descriptor = os.open(
            name, os.O_RDONLY | os.O_NOFOLLOW, dir_fd=directory_descriptor,
        )
        try:
            info = os.fstat(descriptor)
            if not stat.S_ISREG(info.st_mode) or info.st_size != len(expected):
                raise CanaryBuildError("output byte verification failed: %s" % name)
            observed = bytearray()
            while len(observed) <= 16 * 1024 * 1024:
                chunk = os.read(descriptor, 1024 * 1024)
                if not chunk:
                    break
                observed.extend(chunk)
            if bytes(observed) != expected:
                raise CanaryBuildError("output byte verification failed: %s" % name)
        finally:
            os.close(descriptor)


def _remove_exact_output_directory(parent_descriptor, directory_name,
                                   expected_names, expected_identity):
    descriptor = None
    try:
        descriptor = os.open(
            directory_name, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW,
            dir_fd=parent_descriptor,
        )
        directory_info = os.fstat(descriptor)
        if ((directory_info.st_dev, directory_info.st_ino)
                != expected_identity):
            return False
        entries = set(os.listdir(descriptor))
        if not entries.issubset(expected_names):
            return False
        for name in entries:
            info = os.stat(name, dir_fd=descriptor, follow_symlinks=False)
            if not stat.S_ISREG(info.st_mode):
                return False
        for name in entries:
            os.unlink(name, dir_fd=descriptor)
        named_info = os.stat(
            directory_name, dir_fd=parent_descriptor, follow_symlinks=False,
        )
        if ((named_info.st_dev, named_info.st_ino) != expected_identity):
            return False
        os.close(descriptor)
        descriptor = None
        os.rmdir(directory_name, dir_fd=parent_descriptor)
        os.fsync(parent_descriptor)
        return True
    except OSError:
        return False
    finally:
        if descriptor is not None:
            os.close(descriptor)


def _publish_artifacts(output_directory, payloads):
    output, expected_parent_identity = _validate_destination(
        Path(output_directory)
    )
    expected_names = set(payloads)
    parent_descriptor = None
    staging_descriptor = None
    staging_identity = None
    staging_name = None
    published = False
    try:
        parent_descriptor = os.open(
            output.parent, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW,
        )
        parent_info = os.fstat(parent_descriptor)
        if ((parent_info.st_dev, parent_info.st_ino) != expected_parent_identity
                or not _parent_identity_matches(
                    output.parent, expected_parent_identity
                )):
            raise CanaryBuildError("output parent changed during validation")
        if _directory_entry_exists(parent_descriptor, output.name):
            raise CanaryBuildError("output directory must not already exist")
        for _attempt in range(32):
            candidate = ".m1-canary-%s" % secrets.token_hex(16)
            try:
                os.mkdir(candidate, 0o700, dir_fd=parent_descriptor)
                staging_name = candidate
                info = os.stat(
                    candidate, dir_fd=parent_descriptor, follow_symlinks=False,
                )
                if not stat.S_ISDIR(info.st_mode):
                    raise CanaryBuildError("temporary output is not a directory")
                staging_identity = (info.st_dev, info.st_ino)
                break
            except FileExistsError:
                continue
        if staging_name is None:
            raise CanaryBuildError("could not reserve a staging directory")
        staging_descriptor = os.open(
            staging_name,
            os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW,
            dir_fd=parent_descriptor,
        )
        staging_info = os.fstat(staging_descriptor)
        if ((staging_info.st_dev, staging_info.st_ino) != staging_identity):
            raise CanaryBuildError("staging directory identity changed")
        for name, payload in payloads.items():
            descriptor = os.open(
                name,
                os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW,
                0o600,
                dir_fd=staging_descriptor,
            )
            try:
                with os.fdopen(descriptor, "wb", closefd=True) as target:
                    target.write(payload)
                    target.flush()
                    os.fsync(target.fileno())
            except Exception:
                try:
                    os.close(descriptor)
                except OSError:
                    pass
                raise
        _verify_output_descriptor(staging_descriptor, payloads)
        os.fsync(staging_descriptor)
        if (not _parent_identity_matches(output.parent, expected_parent_identity)
                or _directory_entry_exists(parent_descriptor, output.name)):
            raise CanaryBuildError("output parent or destination changed during build")
        source_info = os.stat(
            staging_name, dir_fd=parent_descriptor, follow_symlinks=False,
        )
        if ((source_info.st_dev, source_info.st_ino) != staging_identity):
            raise CanaryBuildError("staging directory changed before publication")
        _rename_directory_no_replace(
            parent_descriptor, staging_name, output.name,
        )
        published = True
        staging_name = None
        published_descriptor = os.open(
            output.name,
            os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW,
            dir_fd=parent_descriptor,
        )
        try:
            published_info = os.fstat(published_descriptor)
            if ((published_info.st_dev, published_info.st_ino)
                    != staging_identity):
                raise CanaryBuildError("published output identity changed")
            _verify_output_descriptor(published_descriptor, payloads)
            os.fsync(published_descriptor)
        finally:
            os.close(published_descriptor)
        os.fsync(parent_descriptor)
        if not _parent_identity_matches(
                output.parent, expected_parent_identity):
            raise CanaryBuildError(
                "output parent changed before publication receipt"
            )
        final_info = os.stat(
            output.name, dir_fd=parent_descriptor, follow_symlinks=False,
        )
        if (not stat.S_ISDIR(final_info.st_mode)
                or (final_info.st_dev, final_info.st_ino)
                != staging_identity):
            raise CanaryBuildError(
                "published output changed before publication receipt"
            )
    except Exception as error:
        if staging_descriptor is not None:
            os.close(staging_descriptor)
            staging_descriptor = None
        cleanup_name = output.name if published else staging_name
        cleanup_failed = bool(
            cleanup_name is not None
            and parent_descriptor is not None
            and not _remove_exact_output_directory(
                parent_descriptor, cleanup_name, expected_names,
                staging_identity,
            )
        )
        if isinstance(error, CanaryBuildError):
            if cleanup_failed:
                raise CanaryBuildError(
                    "%s; cleanup could not be confirmed" % error
                ) from None
            raise
        if cleanup_failed:
            raise CanaryBuildError(
                "artifact write failed and cleanup could not be confirmed"
            ) from None
        raise CanaryBuildError(
            "artifact write failed; no output was published"
        ) from None
    finally:
        if staging_descriptor is not None:
            os.close(staging_descriptor)
        if parent_descriptor is not None:
            os.close(parent_descriptor)


def build(review_packet, output_directory, repo, protected_ref,
          protected_main_commit):
    protected_main_commit = str(protected_main_commit or "").strip().lower()
    raw_input, packet = _read_review_packet(review_packet)
    protected_commit = _verify_reviewed_pipeline(
        repo, protected_ref, protected_main_commit, packet["pipeline"],
    )
    manifest, manifest_text, manifest_sha256, approved_by, identities = (
        _canonicalize_review_packet(packet)
    )
    sql_text = _build_sql(
        manifest, manifest_sha256, approved_by, identities,
        packet["migration_version"],
    )
    sql_name = "%s_activate_training_solver_m1_bounded_canary.sql" % (
        packet["migration_version"]
    )
    receipt = {
        "schema": OUTPUT_RECEIPT_SCHEMA,
        "input_sha256": hashlib.sha256(raw_input).hexdigest(),
        "manifest_sha256": manifest_sha256,
        "migration_sha256": hashlib.sha256(sql_text.encode("utf-8")).hexdigest(),
        "migration_filename": sql_name,
        "machine_id": "M1",
        "partition_count": 2,
        "partition_index": 0,
        "training_game_count": len(manifest["training_game_contracts"]),
        "chip_ev_contract_count": manifest["training_contract_scope"][
            "chip_ev_contract_count"
        ],
        "separate_icm_contract_count": manifest["training_contract_scope"][
            "separate_icm_contract_count"
        ],
        "phase_count": len(manifest["phases"]),
        "bounded_target_count": 2,
        "database_writes_performed": 0,
        "pipeline_commit": identities["pipeline_commit"],
        "protected_ref": protected_ref,
        "protected_ref_commit": protected_commit,
        "controller_attested_protected_main_commit": protected_main_commit,
    }
    receipt_text = json.dumps(
        receipt, sort_keys=True, separators=(",", ":"), allow_nan=False
    ) + "\n"

    _publish_artifacts(output_directory, {
        "phases.json": manifest_text.encode("utf-8"),
        sql_name: sql_text.encode("utf-8"),
        "build-receipt.json": receipt_text.encode("utf-8"),
    })
    return receipt


def main(argv=None):
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--repo", required=True)
    parser.add_argument(
        "--protected-ref",
        required=True,
        choices=(CANONICAL_PROTECTED_REF,),
    )
    parser.add_argument("--protected-main-commit", required=True)
    arguments = parser.parse_args(argv)
    try:
        receipt = build(
            arguments.input,
            arguments.output,
            arguments.repo,
            arguments.protected_ref,
            arguments.protected_main_commit,
        )
    except CanaryBuildError as error:
        print("HOLD: %s" % error, file=sys.stderr)
        return 1
    print(json.dumps(receipt, sort_keys=True, separators=(",", ":")))
    return 0


if __name__ == "__main__":
    if sys.argv[1:] == ["--canonicalize-internal"]:
        raise SystemExit(_canonical_child_main())
    raise SystemExit(main())
