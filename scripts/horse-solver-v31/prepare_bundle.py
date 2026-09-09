#!/usr/bin/env python3
"""Prepare one immutable V31 manifest and its human approval payload."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import subprocess
import tempfile
from pathlib import Path
from typing import Any

from contract import (
    MANIFEST_CONTRACT,
    REQUIRED_PIPELINE_FILES,
    ROOT_KEYS,
    ContractError,
    _exact_keys,
    _json_bytes,
    _safe_relative_path,
    _under,
    input_bundle_checksum,
    input_bundle_id,
    load_manifest,
    sha256_file,
)


ZERO_CHECKSUM = "0" * 64
PLACEHOLDER_BUNDLE_ID = "00000000-0000-4000-8000-000000000000"


def canonical_json(value: Any) -> bytes:
    try:
        return json.dumps(
            value,
            ensure_ascii=False,
            allow_nan=False,
            separators=(",", ":"),
            sort_keys=True,
        ).encode("utf-8")
    except (TypeError, ValueError, OverflowError) as error:
        raise ContractError("prepared V31 bundle is not canonical JSON") from error


def file_receipt(kind: str, relative: str, checksum: str) -> dict[str, str]:
    return {"kind": kind, "path": relative, "checksum": checksum}


def base_approval_bundle(
    manifest: dict[str, Any],
    *,
    bundle_key: str,
    bundle_version: str,
    approval_note: str,
    manifest_path: str,
    manifest_checksum: str,
) -> dict[str, Any]:
    return {
        "bundle_key": bundle_key,
        "bundle_version": bundle_version,
        "range_bundle_checksum": manifest["range_bundle_checksum"],
        "source_combo_order_checksum": manifest["source_combo_order_checksum"],
        "icm_model_checksum": manifest["icm_model_checksum"],
        "files": [
            file_receipt(
                "range", manifest["range_bundle_path"], manifest["range_bundle_checksum"]
            ),
            file_receipt(
                "combo_order",
                manifest["source_combo_order_path"],
                manifest["source_combo_order_checksum"],
            ),
            file_receipt(
                "icm_model", manifest["icm_model_path"], manifest["icm_model_checksum"]
            ),
            file_receipt("scenario_manifest", manifest_path, manifest_checksum),
        ],
        "approval_note": approval_note,
    }


def verify_published_pipeline(manifest: dict[str, Any], pipeline_root: Path) -> None:
    paths = [str(item.get("path") or "") for item in manifest["pipeline_files"]]
    if set(paths) != REQUIRED_PIPELINE_FILES or len(paths) != len(REQUIRED_PIPELINE_FILES):
        raise ContractError("manifest does not name the complete V31 executable file set")
    try:
        head = subprocess.run(
            ["git", "rev-parse", "HEAD"],
            cwd=pipeline_root,
            check=True,
            capture_output=True,
            text=True,
        ).stdout.strip().lower()
        dirty = subprocess.run(
            ["git", "status", "--porcelain", "--", *sorted(REQUIRED_PIPELINE_FILES)],
            cwd=pipeline_root,
            check=True,
            capture_output=True,
            text=True,
        ).stdout.strip()
        published = subprocess.run(
            ["git", "merge-base", "--is-ancestor", head, "origin/main"],
            cwd=pipeline_root,
            check=False,
            capture_output=True,
            text=True,
        ).returncode
    except (OSError, subprocess.CalledProcessError) as error:
        raise ContractError("cannot prove the V31 pipeline's Git identity") from error
    if manifest["pipeline_commit"] != head:
        raise ContractError("manifest pipeline_commit is not the checked-out commit")
    if dirty:
        raise ContractError("V31 executable files contain uncommitted bytes")
    if published != 0:
        raise ContractError("V31 pipeline commit is not present on origin/main")


def assert_write_once_compatible(path: Path, payload: bytes) -> None:
    if path.is_symlink():
        raise ContractError(f"refusing a symbolic-link immutable output: {path}")
    if path.exists():
        if path.is_file() and path.read_bytes() == payload:
            return
        raise ContractError(f"refusing to replace an existing immutable output: {path}")


def write_once(path: Path, payload: bytes) -> None:
    assert_write_once_compatible(path, payload)
    if path.exists():
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary: Path | None = None
    try:
        with tempfile.NamedTemporaryFile(
            mode="wb",
            prefix=f".{path.name}.",
            suffix=".tmp",
            dir=path.parent,
            delete=False,
        ) as output:
            output.write(payload)
            output.flush()
            os.fsync(output.fileno())
            temporary = Path(output.name)
        try:
            os.link(temporary, path)
        except FileExistsError:
            assert_write_once_compatible(path, payload)
    finally:
        if temporary is not None and temporary.exists():
            temporary.unlink()


def prepare(args: argparse.Namespace) -> dict[str, Any]:
    pipeline_root = Path(__file__).resolve().parents[2]
    input_root = Path(args.input_root).resolve()
    draft_path = Path(args.manifest_draft).resolve()
    output_relative = _safe_relative_path(args.manifest_output, "manifest output path")
    approval_relative = _safe_relative_path(args.approval_output, "approval output path")
    output_path = _under(input_root, output_relative)
    approval_path = _under(input_root, approval_relative)
    if output_path == approval_path or draft_path in {output_path, approval_path}:
        raise ContractError("draft, manifest output, and approval output must be distinct")

    draft = _exact_keys(_json_bytes(draft_path.read_bytes(), "manifest draft"), ROOT_KEYS, "manifest")
    if draft["contract"] != MANIFEST_CONTRACT or draft["enabled"] is not True:
        raise ContractError("manifest draft must be an enabled V31 manifest")
    if draft["input_bundle_id"] != PLACEHOLDER_BUNDLE_ID:
        raise ContractError("manifest draft input_bundle_id is not the documented placeholder")
    if draft["input_bundle_checksum"] != ZERO_CHECKSUM:
        raise ContractError("manifest draft input_bundle_checksum is not the documented placeholder")

    verify_published_pipeline(draft, pipeline_root)
    approval = base_approval_bundle(
        draft,
        bundle_key=args.bundle_key,
        bundle_version=args.bundle_version,
        approval_note=args.approval_note,
        manifest_path=output_relative,
        manifest_checksum="1" * 64,
    )
    bundle_checksum = input_bundle_checksum(approval)
    bundle_id = input_bundle_id(bundle_checksum)

    manifest = json.loads(json.dumps(draft))
    manifest["input_bundle_id"] = bundle_id
    manifest["input_bundle_checksum"] = bundle_checksum
    manifest_bytes = canonical_json(manifest)
    manifest_checksum = hashlib.sha256(manifest_bytes).hexdigest()
    approval = base_approval_bundle(
        manifest,
        bundle_key=args.bundle_key,
        bundle_version=args.bundle_version,
        approval_note=args.approval_note,
        manifest_path=output_relative,
        manifest_checksum=manifest_checksum,
    )
    if input_bundle_checksum(approval) != bundle_checksum:
        raise ContractError("scenario manifest receipt changed the immutable input identity")

    output_path.parent.mkdir(parents=True, exist_ok=True)
    temporary_manifest: Path | None = None
    try:
        with tempfile.NamedTemporaryFile(
            mode="wb", prefix=".v31-manifest-", suffix=".json", dir=output_path.parent, delete=False
        ) as temporary:
            temporary.write(manifest_bytes)
            temporary.flush()
            os.fsync(temporary.fileno())
            temporary_manifest = Path(temporary.name)
        loaded = load_manifest(
            temporary_manifest,
            expected_checksum=manifest_checksum,
            input_root=input_root,
            pipeline_root=pipeline_root,
        )
        if (
            loaded.raw["input_bundle_id"] != bundle_id
            or loaded.raw["input_bundle_checksum"] != bundle_checksum
        ):
            raise ContractError("validated manifest lost its prepared input identity")
    finally:
        if temporary_manifest is not None and temporary_manifest.exists():
            temporary_manifest.unlink()

    approval_bytes = canonical_json(approval)
    # Refuse a pre-existing conflict before either immutable output is made.
    # A crash between the two atomic links is recoverable by an exact retry.
    assert_write_once_compatible(output_path, manifest_bytes)
    assert_write_once_compatible(approval_path, approval_bytes)
    write_once(output_path, manifest_bytes)
    write_once(approval_path, approval_bytes)
    return {
        "approved": False,
        "input_bundle_id": bundle_id,
        "input_bundle_checksum": bundle_checksum,
        "manifest_checksum": manifest_checksum,
        "manifest_path": str(output_path),
        "approval_payload_path": str(approval_path),
    }


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--manifest-draft", required=True)
    parser.add_argument("--input-root", required=True)
    parser.add_argument("--manifest-output", required=True)
    parser.add_argument("--approval-output", required=True)
    parser.add_argument("--bundle-key", required=True)
    parser.add_argument("--bundle-version", required=True)
    parser.add_argument("--approval-note", required=True)
    return parser.parse_args()


if __name__ == "__main__":
    try:
        print(json.dumps(prepare(parse_args()), sort_keys=True))
    except (ContractError, OSError, json.JSONDecodeError) as error:
        print(f"[v31-prepare] FAILED: {error}")
        raise SystemExit(1) from error
