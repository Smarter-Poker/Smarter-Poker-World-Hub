#!/usr/bin/env python3
"""Supervised M1/M2 worker for certified NLH V31 source artifacts."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import threading
import uuid
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterator

from contract import ApprovedManifest, ContractError, load_manifest, sha256_file
from gateway import GatewayClient, GatewayError, canonical_json
from pio_upi import (
    PioError,
    PioProcess,
    harvest_node,
    run_self_test,
    solve_scenario,
    validate_pipeline_imports,
)


ARTIFACT_NAMESPACE = uuid.UUID("a92cb6ce-40b1-43e5-a71a-e8fd9d3ef2f8")
HEX64 = re.compile(r"^[0-9a-f]{64}$")


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def atomic_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + f".{os.getpid()}.tmp")
    data = canonical_json(payload)
    with temporary.open("wb") as output:
        output.write(data)
        output.flush()
        os.fsync(output.fileno())
    os.replace(temporary, path)


def load_checkpoint(path: Path) -> dict[str, Any] | None:
    if not path.exists():
        return None
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeDecodeError, json.JSONDecodeError) as error:
        raise ContractError(f"artifact checkpoint is unreadable: {path}") from error
    if not isinstance(value, dict):
        raise ContractError(f"artifact checkpoint is not an object: {path}")
    return value


class WorkerHeartbeat:
    def __init__(self, client: GatewayClient, manifest: ApprovedManifest, machine: str, planned: int):
        self.client = client
        self.manifest = manifest
        self.machine = machine
        self.planned = planned
        self.run_id = str(uuid.uuid4())
        self.sequence = 0
        self.done = 0
        self.written = 0
        self.invalid = 0
        self.last_artifact_id: str | None = None
        self.last_artifact_checksum: str | None = None
        self._lock = threading.Lock()
        self._background_error: BaseException | None = None

    def pulse(self, state: str, phase_id: str, error_detail: str | None = None) -> Any:
        with self._lock:
            result = self.client.call(
                "worker_heartbeat",
                {
                    "run_id": self.run_id,
                    "sequence": self.sequence,
                    "phase_id": phase_id[:160],
                    "state": state,
                    "rows_planned": self.planned,
                    "rows_done": self.done,
                    "rows_written": self.written,
                    "invalid_rows": self.invalid,
                    "last_artifact_id": self.last_artifact_id,
                    "last_artifact_checksum": self.last_artifact_checksum,
                    "error_detail": error_detail[:2000] if error_detail else None,
                },
            )
            self.sequence += 1
            return result

    def raise_background_error(self) -> None:
        if self._background_error is not None:
            raise GatewayError(f"heartbeat keepalive failed: {self._background_error}")

    @contextmanager
    def keepalive(self, state: str, phase_id: str, interval_seconds: float = 300) -> Iterator[None]:
        stop = threading.Event()

        def run() -> None:
            while not stop.wait(interval_seconds):
                try:
                    self.pulse(state, phase_id)
                except BaseException as error:
                    self._background_error = error
                    stop.set()

        self.pulse(state, phase_id)
        thread = threading.Thread(target=run, daemon=True)
        thread.start()
        try:
            yield
        finally:
            stop.set()
            thread.join(timeout=interval_seconds + 5)
        self.raise_background_error()


def artifact_id(manifest: ApprovedManifest, machine: str, target_id: str) -> str:
    key = f"{manifest.raw['dataset_key']}:{manifest.checksum}:{machine}:{target_id}"
    return str(uuid.uuid5(ARTIFACT_NAMESPACE, key))


def scenario_hash(manifest: ApprovedManifest, scenario_id: str, target_id: str) -> str:
    value = (
        f"v31:{manifest.raw['dataset_key']}:{scenario_id}:{target_id}:"
        f"{manifest.checksum[:16]}"
    )
    if len(value) > 512:
        raise ContractError("scenario hash exceeds the database contract")
    return value


def artifact_path(work_directory: Path, machine: str, target_id: str) -> Path:
    safe = target_id.replace(":", "_")
    return work_directory / "artifacts" / machine / f"{safe}.json"


def source_receipt_is_valid(source_id: str, source_checksum: str, artifact: dict[str, Any]) -> bool:
    return (
        source_id == artifact.get("id")
        and HEX64.fullmatch(source_checksum) is not None
        and source_checksum != "0" * 64
    )


def mark_invalid(heartbeat: WorkerHeartbeat) -> None:
    """Count one attempted target that produced or contained invalid evidence."""
    heartbeat.done += 1
    heartbeat.invalid += 1


def artifact_matches(
    artifact: dict[str, Any],
    manifest: ApprovedManifest,
    machine: str,
    scenario: dict[str, Any],
    target: dict[str, Any],
) -> bool:
    expected_id = artifact_id(manifest, machine, target["target_id"])
    matrix = artifact.get("strategy_matrix_v2")
    nodes = matrix.get("nodes") if isinstance(matrix, dict) else None
    return (
        set(artifact) == {
            "id",
            "scenario_hash",
            "game_family",
            "stack_depth",
            "street",
            "solved_at",
            "strategy_matrix_v2",
        }
        and artifact.get("id") == expected_id
        and artifact.get("scenario_hash")
        == scenario_hash(manifest, scenario["scenario_id"], target["target_id"])
        and artifact.get("game_family") == scenario["game_family"]
        and artifact.get("stack_depth") == scenario["depth_bucket"]
        and artifact.get("street") == {6: "flop", 8: "turn", 10: "river"}.get(len(target["board"]))
        and isinstance(artifact.get("solved_at"), str)
        and isinstance(nodes, list)
        and len(nodes) == 1
        and nodes[0].get("node") == target["node"]
        and nodes[0].get("line_proof", {}).get("manifest_checksum") == manifest.checksum
    )


def make_artifact(
    manifest: ApprovedManifest,
    machine: str,
    scenario: dict[str, Any],
    target: dict[str, Any],
    node: dict[str, Any],
) -> dict[str, Any]:
    street = {6: "flop", 8: "turn", 10: "river"}.get(len(target["board"]))
    if street is None:
        raise ContractError("target board does not map to a postflop street")
    return {
        "id": artifact_id(manifest, machine, target["target_id"]),
        "scenario_hash": scenario_hash(
            manifest, scenario["scenario_id"], target["target_id"]
        ),
        "game_family": scenario["game_family"],
        "stack_depth": scenario["depth_bucket"],
        "street": street,
        "solved_at": utc_now(),
        "strategy_matrix_v2": {
            "schema": "smarter-poker.pio-artifact.v31.1",
            "combo_order": (
                "card=rank*4+suit; combo=b*(b-1)/2+a; 2c2d=0..AhAs=1325"
            ),
            "nodes": [node],
        },
    }


def verify_environment(manifest: ApprovedManifest, executable: Path) -> None:
    commit = os.environ.get("PIPELINE_COMMIT", "").strip().lower()
    approved_binary = os.environ.get("APPROVED_PIO_BINARY_CHECKSUM", "").strip().lower()
    if commit != manifest.raw["pipeline_commit"]:
        raise ContractError("PIPELINE_COMMIT does not match the approved manifest")
    if approved_binary != manifest.raw["solver_binary_checksum"]:
        raise ContractError("APPROVED_PIO_BINARY_CHECKSUM does not match the manifest")
    actual_binary = sha256_file(executable)
    if actual_binary != approved_binary:
        raise ContractError("PioSOLVER binary bytes do not match the approved checksum")


def ordered_scenarios(manifest: ApprovedManifest) -> list[dict[str, Any]]:
    scenarios = list(manifest.raw["scenarios"])
    self_test_id = manifest.raw["self_test"]["scenario_id"]
    return sorted(scenarios, key=lambda scenario: scenario["scenario_id"] != self_test_id)


def run(args: argparse.Namespace) -> None:
    script_root = Path(__file__).resolve().parents[2]
    expected_manifest = os.environ.get("APPROVED_MANIFEST_CHECKSUM", "")
    manifest = load_manifest(
        args.manifest,
        expected_checksum=expected_manifest,
        input_root=args.input_root,
        pipeline_root=script_root,
    )
    validate_pipeline_imports()
    executable_value = os.environ.get("PIO_EXE", "").strip()
    if not executable_value:
        raise ContractError("PIO_EXE must name the approved PioSOLVER executable")
    executable = Path(executable_value).expanduser().resolve()
    if not executable.exists() or not executable.is_file() or not os.access(executable, os.X_OK):
        raise ContractError("PIO_EXE is absent, not a regular file, or not executable")
    verify_environment(manifest, executable)
    client = GatewayClient.from_environment(args.machine, manifest.provenance)
    contract = client.call("dataset_contract", {})
    if contract.get("state") != "building":
        print(
            f"[v31-worker] dataset {manifest.raw['dataset_key']} is {contract.get('state')}; "
            "no source rows were changed"
        )
        return
    dataset_id = contract.get("dataset_id")
    planned = sum(len(scenario["targets"]) for scenario in manifest.raw["scenarios"])
    heartbeat = WorkerHeartbeat(client, manifest, args.machine, planned)
    heartbeat.pulse("starting", "startup")
    work_directory = Path(args.work_directory).resolve()
    work_directory.mkdir(parents=True, exist_ok=True)
    loaded_scenario: str | None = None

    try:
        with PioProcess(executable) as process:
            pio = process.command
            scenarios = ordered_scenarios(manifest)
            self_test = manifest.raw["self_test"]
            self_scenario = next(
                scenario for scenario in scenarios if scenario["scenario_id"] == self_test["scenario_id"]
            )
            with heartbeat.keepalive("self_test", f"self_test:{self_scenario['scenario_id']}"):
                solve_scenario(pio, self_scenario, manifest.input_root)
                receipt = run_self_test(pio, self_scenario, self_test)
            loaded_scenario = self_scenario["scenario_id"]
            print(
                "[v31-worker] self-test passed: "
                f"EV={receipt['weighted_policy_ev_bb']:.6f} bb, "
                f"exploitability={receipt['exploitability_pct']:.6f}"
            )

            for scenario in scenarios:
                checkpoints: dict[str, dict[str, Any] | None] = {}
                for target in scenario["targets"]:
                    try:
                        prior = load_checkpoint(
                            artifact_path(work_directory, args.machine, target["target_id"])
                        )
                    except ContractError:
                        mark_invalid(heartbeat)
                        raise
                    if prior is not None and not artifact_matches(
                        prior, manifest, args.machine, scenario, target
                    ):
                        mark_invalid(heartbeat)
                        raise ContractError(
                            f"checkpoint for {target['target_id']} belongs to another contract"
                        )
                    checkpoints[target["target_id"]] = prior
                if any(value is None for value in checkpoints.values()):
                    if loaded_scenario != scenario["scenario_id"]:
                        with heartbeat.keepalive("solving", f"solve:{scenario['scenario_id']}"):
                            solve_scenario(pio, scenario, manifest.input_root)
                        loaded_scenario = scenario["scenario_id"]
                for target in scenario["targets"]:
                    phase_id = f"harvest:{target['target_id']}"
                    artifact = checkpoints[target["target_id"]]
                    if artifact is None:
                        try:
                            with heartbeat.keepalive("harvesting", phase_id):
                                node = harvest_node(
                                    pio,
                                    scenario,
                                    target,
                                    manifest_checksum=manifest.checksum,
                                    source_combo_order_checksum=manifest.raw[
                                        "source_combo_order_checksum"
                                    ],
                                    range_bundle_checksum=manifest.raw["range_bundle_checksum"],
                                )
                            artifact = make_artifact(manifest, args.machine, scenario, target, node)
                        except (ContractError, PioError):
                            mark_invalid(heartbeat)
                            raise
                        path = artifact_path(work_directory, args.machine, target["target_id"])
                        atomic_json(path, artifact)
                    try:
                        result = client.call(
                            "ingest_artifact", {"dataset_id": dataset_id, "artifact": artifact}
                        )
                    except GatewayError as error:
                        if error.status is not None and 400 <= error.status < 500 and error.status != 429:
                            mark_invalid(heartbeat)
                        raise
                    source_id = str(result.get("source_row_id") or "")
                    source_checksum = str(result.get("source_artifact_checksum") or "")
                    if not source_receipt_is_valid(source_id, source_checksum, artifact):
                        mark_invalid(heartbeat)
                        raise GatewayError("database returned an invalid source-artifact receipt")
                    heartbeat.done += 1
                    heartbeat.written += 1
                    heartbeat.last_artifact_id = source_id
                    heartbeat.last_artifact_checksum = source_checksum
                    heartbeat.pulse("harvesting", phase_id)
                    print(
                        f"[v31-worker] {args.machine} wrote {target['target_id']} "
                        f"({heartbeat.done}/{planned}, {source_checksum[:12]})"
                    )
        if heartbeat.done != planned or heartbeat.written != planned or heartbeat.invalid != 0:
            raise ContractError("worker counters did not reconcile at completion")
        heartbeat.pulse("completed", "completed")
    except BaseException as error:
        try:
            heartbeat.pulse("failed", "failed", str(error))
        except BaseException as heartbeat_error:
            print(f"[v31-worker] failed heartbeat was not accepted: {heartbeat_error}")
        raise


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("machine", choices=("M1", "M2"))
    parser.add_argument("--manifest", required=True)
    parser.add_argument("--input-root", required=True)
    parser.add_argument("--work-directory", required=True)
    return parser.parse_args()


if __name__ == "__main__":
    try:
        run(parse_args())
    except (ContractError, GatewayError, PioError, OSError) as error:
        print(f"[v31-worker] FAILED: {error}")
        raise SystemExit(1) from error
