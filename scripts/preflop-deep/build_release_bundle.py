"""Build one controller-local solver bundle from immutable Git object bytes.

This controller-only utility never reads a dirty working tree and never accepts
or writes worker HMAC or database credentials. It packages the exact five
files already checksum-sealed by a protected manifest, then emits a sanitized
receipt for independent delivery verification.

Bundle creation is intentionally limited to a trusted POSIX controller running
macOS or Linux. Windows solver workers consume the resulting exact bytes; they
must not run this builder.
"""
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


PIPELINE_PATHS = (
    "scripts/preflop-deep/run_machine.py",
    "scripts/preflop-deep/tree_gen.py",
    "scripts/preflop-deep/pio_harvest.py",
    "scripts/preflop-deep/orchestrate.py",
)
MANIFEST_PATH = "scripts/preflop-deep/phases.json"
CANONICAL_PROTECTED_REF = "refs/remotes/origin/main"
MAX_BUNDLE_FILE_BYTES = 16 * 1024 * 1024
LOWER_HEX_40 = re.compile(r"^[0-9a-f]{40}$")
LOWER_HEX_64 = re.compile(r"^[0-9a-f]{64}$")


class BundleBuildError(RuntimeError):
    """A fail-closed release validation error."""


def _require_posix_controller():
    if (os.name != "posix" or sys.platform not in ("darwin", "linux") or not all(
            hasattr(os, name) for name in ("O_DIRECTORY", "O_NOFOLLOW"))):
        raise BundleBuildError(
            "controller bundle creation requires a POSIX controller filesystem"
        )


def _git(repo, *arguments, check=True):
    environment = {
        key: value for key, value in os.environ.items()
        if not key.upper().startswith("GIT_")
    }
    # A controller checkout is not itself release authority.  In particular,
    # local refs/replace entries must never be able to substitute a different
    # commit/tree while the receipt continues to name the requested commit.
    environment["GIT_NO_REPLACE_OBJECTS"] = "1"
    environment["GIT_GRAFT_FILE"] = os.devnull
    environment["GIT_NO_LAZY_FETCH"] = "1"
    environment["GIT_TERMINAL_PROMPT"] = "0"
    environment["GIT_CONFIG_NOSYSTEM"] = "1"
    environment["GIT_CONFIG_GLOBAL"] = os.devnull
    result = subprocess.run(
        ["git", "--no-replace-objects", "-C", str(repo), *arguments],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        env=environment,
        check=False,
    )
    if check and result.returncode != 0:
        raise BundleBuildError("Git object verification failed")
    return result


def _reject_legacy_grafts(repo):
    git_marker = repo / ".git"
    try:
        marker_info = os.lstat(git_marker)
    except OSError:
        raise BundleBuildError("repository Git directory could not be verified") from None
    if stat.S_ISDIR(marker_info.st_mode):
        common_directory = git_marker
    elif stat.S_ISREG(marker_info.st_mode):
        try:
            marker = git_marker.read_text(encoding="utf-8").strip()
        except (OSError, UnicodeError):
            raise BundleBuildError("repository Git directory could not be verified") from None
        if not marker.startswith("gitdir: ") or "\n" in marker:
            raise BundleBuildError("repository worktree Git directory is malformed")
        git_directory = Path(marker[8:])
        if not git_directory.is_absolute():
            git_directory = git_marker.parent / git_directory
        git_directory = git_directory.resolve()
        common_file = git_directory / "commondir"
        if common_file.exists():
            try:
                common_value = common_file.read_text(encoding="utf-8").strip()
            except (OSError, UnicodeError):
                raise BundleBuildError("repository common Git directory is malformed") from None
            common_directory = Path(common_value)
            if not common_directory.is_absolute():
                common_directory = git_directory / common_directory
            common_directory = common_directory.resolve()
        else:
            common_directory = git_directory
    else:
        raise BundleBuildError("repository Git directory must not use links or reparse points")
    graft_path = common_directory / "info" / "grafts"
    try:
        info = os.lstat(graft_path)
    except FileNotFoundError:
        return
    except OSError:
        raise BundleBuildError("Git graft state could not be verified") from None
    if not stat.S_ISREG(info.st_mode) or getattr(info, "st_file_attributes", 0) & 0x400:
        raise BundleBuildError("Git graft state must not use links or reparse points")
    try:
        if graft_path.read_bytes().strip():
            raise BundleBuildError("legacy Git grafts may not alter protected ancestry")
    except OSError:
        raise BundleBuildError("Git graft state could not be verified") from None


def _sealed_digest(value, label):
    if not isinstance(value, str) or not LOWER_HEX_64.fullmatch(value) or value == "0" * 64:
        raise BundleBuildError("%s must be a nonzero lowercase SHA-256" % label)
    return value


def _read_blob(repo, commit, path, object_format):
    listing = _git(repo, "ls-tree", "--full-tree", commit, "--", path).stdout.decode(
        "utf-8", "strict"
    ).strip()
    fields = listing.split(None, 3)
    if len(fields) != 4 or fields[1] != "blob" or fields[3] != path:
        raise BundleBuildError("protected commit is missing an exact regular-file blob: %s" % path)
    if fields[0] == "120000":
        raise BundleBuildError("protected solver bundle may not contain symlink blobs")
    if fields[0] not in ("100644", "100755"):
        raise BundleBuildError("protected solver bundle requires regular-file blobs")
    object_id = fields[2]
    expected_object_id_length = 40 if object_format == "sha1" else 64
    if not re.fullmatch(r"[0-9a-f]{%d}" % expected_object_id_length, object_id):
        raise BundleBuildError("Git tree contains a malformed blob object ID")
    size_text = _git(repo, "cat-file", "-s", object_id).stdout.decode(
        "ascii", "strict"
    ).strip()
    if not size_text.isdigit() or int(size_text) > MAX_BUNDLE_FILE_BYTES:
        raise BundleBuildError("protected solver bundle file exceeds size limit: %s" % path)
    payload = _git(repo, "cat-file", "blob", object_id).stdout
    if len(payload) != int(size_text) or len(payload) > MAX_BUNDLE_FILE_BYTES:
        raise BundleBuildError("protected solver bundle file exceeds size limit: %s" % path)
    digest = hashlib.new(object_format)
    digest.update(("blob %d\0" % len(payload)).encode("ascii"))
    digest.update(payload)
    if digest.hexdigest() != object_id:
        raise BundleBuildError("Git blob object ID does not match its exact bytes: %s" % path)
    return payload


def _validate_destination(output):
    _require_posix_controller()
    raw = str(output)
    if not os.path.isabs(raw) or raw.startswith(("//", "\\\\")):
        raise BundleBuildError("output must be an absolute local directory")
    path = Path(os.path.abspath(raw))
    if path.exists():
        raise BundleBuildError("output directory must not already exist")
    parent = path.parent
    if not parent.is_dir():
        raise BundleBuildError("output parent directory does not exist")
    cursor = parent
    while True:
        info = os.lstat(cursor)
        if stat.S_ISLNK(info.st_mode) or getattr(info, "st_file_attributes", 0) & 0x400:
            raise BundleBuildError("output path may not use links or reparse points")
        if cursor.parent == cursor:
            break
        cursor = cursor.parent
    if parent.resolve() != parent:
        raise BundleBuildError("output path must use its canonical local spelling")
    parent_info = os.lstat(parent)
    if not stat.S_ISDIR(parent_info.st_mode):
        raise BundleBuildError("output parent directory is not a regular directory")
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


def _remove_exact_bundle_directory(parent_descriptor, directory_name,
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


def _rename_directory_no_replace(parent_descriptor, source, destination):
    """Atomically publish a directory without replacing an existing entry."""
    library = ctypes.CDLL(None, use_errno=True)
    source_bytes = os.fsencode(source)
    destination_bytes = os.fsencode(destination)
    if sys.platform == "darwin":
        operation = getattr(library, "renameatx_np", None)
        flag = 0x00000004  # RENAME_EXCL
    elif sys.platform == "linux":
        operation = getattr(library, "renameat2", None)
        flag = 0x00000001  # RENAME_NOREPLACE
    else:  # Guarded by _require_posix_controller; kept fail-closed.
        operation = None
        flag = 0
    if operation is None:
        raise BundleBuildError(
            "controller filesystem lacks atomic no-replace publication"
        )
    operation.argtypes = [
        ctypes.c_int, ctypes.c_char_p, ctypes.c_int, ctypes.c_char_p,
        ctypes.c_uint,
    ]
    operation.restype = ctypes.c_int
    ctypes.set_errno(0)
    result = operation(
        parent_descriptor, source_bytes,
        parent_descriptor, destination_bytes,
        flag,
    )
    if result == 0:
        return
    error_number = ctypes.get_errno()
    if error_number in (errno.EEXIST, errno.ENOTEMPTY):
        raise BundleBuildError("output directory must not already exist")
    raise BundleBuildError("atomic no-replace publication failed")


def _verify_bundle_descriptor(directory_descriptor, expected_payloads):
    expected_names = set(expected_payloads)
    if set(os.listdir(directory_descriptor)) != expected_names:
        raise BundleBuildError(
            "release directory does not contain the exact five approved files"
        )
    for name, expected in expected_payloads.items():
        source_descriptor = os.open(
            name, os.O_RDONLY | os.O_NOFOLLOW, dir_fd=directory_descriptor,
        )
        try:
            info = os.fstat(source_descriptor)
            if not stat.S_ISREG(info.st_mode) or info.st_size != len(expected):
                raise BundleBuildError(
                    "release bundle byte verification failed: %s" % name
                )
            observed = b""
            while len(observed) <= MAX_BUNDLE_FILE_BYTES:
                chunk = os.read(source_descriptor, 1024 * 1024)
                if not chunk:
                    break
                observed += chunk
        finally:
            os.close(source_descriptor)
        if observed != expected:
            raise BundleBuildError(
                "release bundle byte verification failed: %s" % name
            )


def build_release_bundle(repo, commit, protected_ref, output, pio_version,
                         pio_binary_sha256, protected_main_commit=None):
    _require_posix_controller()
    repo = Path(repo).resolve()
    if not repo.is_dir():
        raise BundleBuildError("repository path does not exist")
    commit = str(commit).strip().lower()
    if not LOWER_HEX_40.fullmatch(commit):
        raise BundleBuildError("commit must be an exact lowercase 40-character SHA")
    if protected_ref != CANONICAL_PROTECTED_REF:
        raise BundleBuildError(
            "protected ref must be the canonical refs/remotes/origin/main"
        )
    protected_main_commit = str(protected_main_commit or "").strip().lower()
    if not LOWER_HEX_40.fullmatch(protected_main_commit):
        raise BundleBuildError(
            "an independently verified exact protected-main commit is required"
        )
    if (not isinstance(pio_version, str) or not pio_version.strip()
            or pio_version != pio_version.strip() or len(pio_version) > 120
            or any(ord(character) < 32 or ord(character) == 127 for character in pio_version)):
        raise BundleBuildError("Pio version must be one exact printable line")
    pio_binary_sha256 = _sealed_digest(
        str(pio_binary_sha256).strip(), "Pio binary checksum"
    )

    _reject_legacy_grafts(repo)
    resolved = _git(repo, "rev-parse", "--verify", "%s^{commit}" % commit).stdout.decode().strip()
    if resolved != commit:
        raise BundleBuildError("commit did not resolve to the exact requested object")
    protected_commit = _git(
        repo, "rev-parse", "--verify", "%s^{commit}" % CANONICAL_PROTECTED_REF
    ).stdout.decode().strip()
    if protected_commit != protected_main_commit:
        raise BundleBuildError(
            "canonical origin/main does not match the independently verified protected-main commit"
        )
    ancestry = _git(
        repo, "merge-base", "--is-ancestor", commit, protected_commit, check=False
    )
    if ancestry.returncode != 0:
        raise BundleBuildError("commit is not an ancestor of the protected ref")
    _git(
        repo, "fsck", "--strict", "--no-reflogs", "--no-dangling",
        commit, protected_commit,
    )
    object_format = _git(repo, "rev-parse", "--show-object-format").stdout.decode().strip()
    if object_format not in ("sha1", "sha256"):
        raise BundleBuildError("Git repository uses an unsupported object format")

    manifest_bytes = _read_blob(repo, commit, MANIFEST_PATH, object_format)
    try:
        manifest = json.loads(manifest_bytes.decode("utf-8"))
    except (UnicodeError, ValueError):
        raise BundleBuildError("protected manifest is not valid UTF-8 JSON") from None
    if (not isinstance(manifest, dict)
            or manifest.get("pipeline_distribution") != "controller-local-bundle.v1"):
        raise BundleBuildError("protected manifest does not approve controller-local-bundle.v1")

    payloads = {}
    short_names = tuple(Path(path).name for path in PIPELINE_PATHS)
    checksums = manifest.get("pipeline_files_sha256")
    if not isinstance(checksums, dict) or set(checksums) != set(short_names):
        raise BundleBuildError("protected manifest must seal the four exact pipeline files")
    aggregate = hashlib.sha256()
    for path, short_name in zip(PIPELINE_PATHS, short_names):
        payload = _read_blob(repo, commit, path, object_format)
        expected = _sealed_digest(checksums.get(short_name), "%s checksum" % short_name)
        if hashlib.sha256(payload).hexdigest() != expected:
            raise BundleBuildError("protected pipeline file checksum mismatch: %s" % short_name)
        payloads[short_name] = payload
        aggregate.update(short_name.encode("ascii") + b"\0" + payload + b"\0")
    bundle_checksum = _sealed_digest(
        manifest.get("pipeline_bundle_checksum"), "pipeline bundle checksum"
    )
    if aggregate.hexdigest() != bundle_checksum:
        raise BundleBuildError("protected pipeline bundle checksum does not match Git object bytes")

    destination, expected_parent_identity = _validate_destination(Path(output))
    expected_payloads = {"phases.json": manifest_bytes, **payloads}
    expected_names = set(expected_payloads)
    parent_descriptor = None
    staging_descriptor = None
    staging_identity = None
    staging_name = None
    published = False
    try:
        parent_descriptor = os.open(
            destination.parent,
            os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW,
        )
        opened_parent = os.fstat(parent_descriptor)
        opened_parent_identity = (opened_parent.st_dev, opened_parent.st_ino)
        if (opened_parent_identity != expected_parent_identity
                or not _parent_identity_matches(
                    destination.parent, expected_parent_identity
                )):
            raise BundleBuildError("output parent directory changed during validation")
        if _directory_entry_exists(parent_descriptor, destination.name):
            raise BundleBuildError("output directory must not already exist")
        for _attempt in range(32):
            candidate = ".solver-release-%s" % secrets.token_hex(16)
            try:
                os.mkdir(candidate, 0o700, dir_fd=parent_descriptor)
                staging_name = candidate
                candidate_info = os.stat(
                    candidate, dir_fd=parent_descriptor, follow_symlinks=False,
                )
                if not stat.S_ISDIR(candidate_info.st_mode):
                    raise BundleBuildError(
                        "temporary release path is not a directory"
                    )
                staging_identity = (
                    candidate_info.st_dev, candidate_info.st_ino,
                )
                break
            except FileExistsError:
                continue
        if staging_name is None:
            raise BundleBuildError("could not reserve a unique staging directory")
        staging_descriptor = os.open(
            staging_name,
            os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW,
            dir_fd=parent_descriptor,
        )
        staging_info = os.fstat(staging_descriptor)
        if not stat.S_ISDIR(staging_info.st_mode):
            raise BundleBuildError("temporary release path is not a directory")
        if (staging_info.st_dev, staging_info.st_ino) != staging_identity:
            raise BundleBuildError(
                "temporary release directory identity changed during reservation"
            )
        for name, payload in [("phases.json", manifest_bytes), *payloads.items()]:
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
        _verify_bundle_descriptor(staging_descriptor, expected_payloads)
        os.fsync(staging_descriptor)
        if (not _parent_identity_matches(destination.parent, expected_parent_identity)
                or _directory_entry_exists(parent_descriptor, destination.name)):
            raise BundleBuildError("output parent or destination changed during build")
        source_info = os.stat(
            staging_name, dir_fd=parent_descriptor, follow_symlinks=False,
        )
        if (not stat.S_ISDIR(source_info.st_mode)
                or (source_info.st_dev, source_info.st_ino) != staging_identity):
            raise BundleBuildError(
                "temporary release directory identity changed before publication"
            )
        _rename_directory_no_replace(
            parent_descriptor, staging_name, destination.name,
        )
        published = True
        staging_name = None
        destination_info = os.stat(
            destination.name, dir_fd=parent_descriptor, follow_symlinks=False,
        )
        if (not stat.S_ISDIR(destination_info.st_mode)
                or (destination_info.st_dev, destination_info.st_ino)
                != staging_identity):
            raise BundleBuildError(
                "published release directory identity does not match verified staging"
            )
        published_descriptor = os.open(
            destination.name,
            os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW,
            dir_fd=parent_descriptor,
        )
        try:
            published_info = os.fstat(published_descriptor)
            if ((published_info.st_dev, published_info.st_ino)
                    != staging_identity):
                raise BundleBuildError(
                    "published release directory identity changed during verification"
                )
            _verify_bundle_descriptor(published_descriptor, expected_payloads)
            os.fsync(published_descriptor)
        finally:
            os.close(published_descriptor)
        os.fsync(parent_descriptor)
        if not _parent_identity_matches(destination.parent, expected_parent_identity):
            raise BundleBuildError("output parent directory changed before publication")
        final_info = os.stat(
            destination.name, dir_fd=parent_descriptor, follow_symlinks=False,
        )
        if (not stat.S_ISDIR(final_info.st_mode)
                or (final_info.st_dev, final_info.st_ino) != staging_identity):
            raise BundleBuildError(
                "published release directory identity changed before receipt"
            )
    except Exception as error:
        if staging_descriptor is not None:
            os.close(staging_descriptor)
            staging_descriptor = None
        cleanup_name = destination.name if published else staging_name
        cleanup_failed = bool(
            cleanup_name is not None
            and parent_descriptor is not None
            and not _remove_exact_bundle_directory(
                parent_descriptor, cleanup_name, expected_names,
                staging_identity,
            )
        )
        if parent_descriptor is not None:
            os.close(parent_descriptor)
            parent_descriptor = None
        if isinstance(error, BundleBuildError):
            if cleanup_failed:
                raise BundleBuildError(
                    "%s; cleanup could not be confirmed" % error
                ) from None
            raise
        if cleanup_failed:
            raise BundleBuildError(
                "release bundle write failed and cleanup could not be confirmed"
            ) from None
        raise BundleBuildError("release bundle write failed; no bundle was published") from None
    finally:
        if staging_descriptor is not None:
            os.close(staging_descriptor)
        if parent_descriptor is not None:
            os.close(parent_descriptor)

    return {
        "schema": "training-solver-controller-bundle-receipt.v1",
        "pipeline_commit": commit,
        "protected_ref_commit": protected_commit,
        "controller_attested_protected_main_commit": protected_main_commit,
        "manifest_sha256": hashlib.sha256(manifest_bytes).hexdigest(),
        "pipeline_bundle_sha256": bundle_checksum,
        "pipeline_files_sha256": dict(sorted(checksums.items())),
        "pio_identity": {
            "version": pio_version,
            "binary_sha256": pio_binary_sha256,
        },
        "file_count": 5,
    }


def main(argv=None):
    parser = argparse.ArgumentParser()
    parser.add_argument("--repo", required=True)
    parser.add_argument("--commit", required=True)
    parser.add_argument(
        "--protected-ref",
        default=CANONICAL_PROTECTED_REF,
        choices=(CANONICAL_PROTECTED_REF,),
    )
    parser.add_argument("--protected-main-commit", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--pio-version", required=True)
    parser.add_argument("--pio-binary-sha256", required=True)
    arguments = parser.parse_args(argv)
    try:
        receipt = build_release_bundle(
            arguments.repo, arguments.commit, arguments.protected_ref,
            arguments.output, arguments.pio_version,
            arguments.pio_binary_sha256, arguments.protected_main_commit,
        )
    except BundleBuildError as error:
        print("HOLD: %s" % error, file=sys.stderr)
        return 1
    print(json.dumps(receipt, sort_keys=True, separators=(",", ":")))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
