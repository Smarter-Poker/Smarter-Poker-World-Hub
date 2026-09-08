#!/usr/bin/env python3
"""Register and compact a V31 corpus without promotion authority."""

from __future__ import annotations

import argparse
import json
import os
import time
import uuid
from pathlib import Path
from typing import Any

from contract import ApprovedManifest, ContractError, load_manifest
from gateway import GatewayClient, GatewayError, canonical_json
from pio_upi import PioError, target_context, validate_pipeline_imports


def declared_coverage(manifest: ApprovedManifest) -> list[dict[str, Any]]:
    unique: dict[bytes, dict[str, Any]] = {}
    machines: dict[bytes, set[str]] = {}
    boards: dict[bytes, dict[str, set[str]]] = {}
    for scenario in manifest.raw["scenarios"]:
        for target in scenario["targets"]:
            context = target_context(scenario, target)
            key = canonical_json(context)
            unique[key] = context
            machine = target["machine_id"]
            machines.setdefault(key, set()).add(machine)
            boards.setdefault(key, {"M1": set(), "M2": set()})[machine].add(
                target["board"]
            )
    if not unique:
        raise ContractError("manifest contains no compact-cell coverage")
    for key in unique:
        if machines[key] != {"M1", "M2"}:
            raise ContractError(
                "every compact context needs independently assigned M1 and M2 targets"
            )
        if boards[key]["M1"] & boards[key]["M2"]:
            raise ContractError(
                "M1 training and M2 holdout targets must use disjoint exact boards"
            )
    return [unique[key] for key in sorted(unique)]


def dataset_item(status: Any, dataset_id: str) -> dict[str, Any]:
    datasets = status.get("datasets") if isinstance(status, dict) else None
    if not isinstance(datasets, list):
        raise GatewayError("certification status omitted datasets")
    for item in datasets:
        if isinstance(item, dict) and item.get("dataset_id") == dataset_id:
            return item
    raise GatewayError("certification status omitted the registered dataset")


class CompactHeartbeat:
    def __init__(self, client: GatewayClient, dataset_key: str):
        self.client = client
        self.dataset_key = dataset_key
        self.run_id = str(uuid.uuid4())
        self.sequence = 0

    def pulse(
        self,
        state: str,
        item: dict[str, Any] | None,
        *,
        invalid_rows: int = 0,
        error_detail: str | None = None,
    ) -> Any:
        source_rows = int((item or {}).get("ingested_source_artifacts") or 0)
        receipts = int((item or {}).get("source_receipt_rows") or 0)
        cells = int((item or {}).get("runtime_cells") or 0)
        source_max = (item or {}).get("source_max_at")
        dataset_checksum = (item or {}).get("dataset_checksum")
        compacted_through = source_max if dataset_checksum else None
        result = self.client.call(
            "compact_heartbeat",
            {
                "run_id": self.run_id,
                "sequence": self.sequence,
                "state": state,
                "source_rows": source_rows,
                "receipt_rows": receipts,
                "cells": cells,
                "invalid_rows": invalid_rows,
                "source_max_at": source_max,
                "compacted_through": compacted_through,
                "dataset_checksum": dataset_checksum,
                "error_detail": error_detail[:2000] if error_detail else None,
            },
        )
        self.sequence += 1
        return result


def load(args: argparse.Namespace) -> ApprovedManifest:
    script_root = Path(__file__).resolve().parents[2]
    return load_manifest(
        args.manifest,
        expected_checksum=os.environ.get("APPROVED_MANIFEST_CHECKSUM", ""),
        input_root=args.input_root,
        pipeline_root=script_root,
    )


def compact_once(args: argparse.Namespace) -> int:
    manifest = load(args)
    validate_pipeline_imports()
    client = GatewayClient.from_environment("COMPACTOR", manifest.provenance)
    coverage = declared_coverage(manifest)
    registration = client.call(
        "register_dataset",
        {
            "input_bundle_id": manifest.raw["input_bundle_id"],
            "declared_coverage": coverage,
            "quality_gates": manifest.raw["quality_gates"],
        },
    )
    dataset_id = str(registration.get("dataset_id") or "")
    if not dataset_id:
        raise GatewayError("dataset registration returned no id")
    heartbeat = CompactHeartbeat(client, manifest.raw["dataset_key"])
    item: dict[str, Any] | None = None
    heartbeat.pulse("starting", item)
    try:
        status = client.call("certification_status", {"dataset_id": dataset_id})
        item = dataset_item(status, dataset_id)
        state = item.get("state")
        if state in {"evaluating", "candidate", "active"}:
            pulse_state = "active" if state == "active" else "candidate" if state == "candidate" else "completed"
            heartbeat.pulse(pulse_state, item)
            print(
                f"[v31-compactor] dataset {dataset_id} is already {state} "
                f"({str(item.get('dataset_checksum'))[:12]})"
            )
            return 0
        if state != "building":
            raise ContractError(f"dataset state {state} cannot be compacted")
        heartbeat.pulse("scanning", item)

        built = 0
        for context in coverage:
            try:
                client.call(
                    "build_cell",
                    {"dataset_id": dataset_id, "context": context},
                    timeout_seconds=280,
                )
            except GatewayError as error:
                if error.status == 409 and "needs M1 and M2" in str(error):
                    status = client.call("certification_status", {"dataset_id": dataset_id})
                    item = dataset_item(status, dataset_id)
                    heartbeat.pulse("paused", item)
                    print(
                        "[v31-compactor] source corpus is not complete on both hosts; "
                        "no candidate was sealed"
                    )
                    return 2
                raise
            built += 1
            status = client.call("certification_status", {"dataset_id": dataset_id})
            item = dataset_item(status, dataset_id)
            heartbeat.pulse("building", item)
            print(f"[v31-compactor] built {built}/{len(coverage)} declared cells")

        heartbeat.pulse("validating", item)
        sealed = client.call(
            "seal_dataset", {"dataset_id": dataset_id}, timeout_seconds=280
        )
        status = client.call("certification_status", {"dataset_id": dataset_id})
        item = dataset_item(status, dataset_id)
        if item.get("state") != "evaluating" or sealed.get("dataset_checksum") != item.get(
            "dataset_checksum"
        ):
            raise ContractError("database seal did not enter the evaluating state")
        heartbeat.pulse("completed", item)
        print(
            f"[v31-compactor] sealed {len(coverage)} cells as "
            f"{item['dataset_checksum']}; evaluation and promotion remain separate"
        )
        return 0
    except BaseException as error:
        try:
            heartbeat.pulse("failed", item, invalid_rows=1, error_detail=str(error))
        except BaseException as heartbeat_error:
            print(f"[v31-compactor] failed heartbeat was not accepted: {heartbeat_error}")
        raise


def run(args: argparse.Namespace) -> int:
    while True:
        code = compact_once(args)
        if not args.watch or code == 0:
            return code
        time.sleep(args.interval_seconds)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--manifest", required=True)
    parser.add_argument("--input-root", required=True)
    parser.add_argument("--watch", action="store_true")
    parser.add_argument("--interval-seconds", type=int, default=300)
    args = parser.parse_args()
    if args.interval_seconds < 60:
        parser.error("--interval-seconds must be at least 60")
    return args


if __name__ == "__main__":
    try:
        raise SystemExit(run(parse_args()))
    except (ContractError, GatewayError, PioError, OSError, json.JSONDecodeError) as error:
        print(f"[v31-compactor] FAILED: {error}")
        raise SystemExit(1) from error
