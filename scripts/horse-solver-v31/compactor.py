#!/usr/bin/env python3
"""Register and compact a V31 corpus without promotion authority."""

from __future__ import annotations

import argparse
import json
import math
import os
import time
import uuid
from pathlib import Path
from typing import Any

from contract import HEX64, JSON_MAX_SAFE_INTEGER, UUID, ApprovedManifest, ContractError, load_manifest
from gateway import GatewayClient, GatewayError, canonical_json
from pio_upi import PioError, target_context, validate_pipeline_imports


def board_rank_signature(board: str) -> str:
    """Return a suit-agnostic, flop-order-agnostic runout signature.

    A holdout that merely changes suits is the same game tree under Pio's suit
    isomorphism and cannot measure generalization of a texture-level compact
    cell.  Keeping the turn and river ranks ordered preserves street identity,
    while sorting the three flop ranks removes presentation-only card order.
    """

    if not isinstance(board, str) or len(board) not in (6, 8, 10):
        raise ContractError("holdout board has no canonical rank signature")
    cards = [board[index : index + 2] for index in range(0, len(board), 2)]
    ranks = "23456789TJQKA"
    suits = "cdhs"
    if len(set(cards)) != len(cards) or any(
        len(card) != 2 or card[0] not in ranks or card[1] not in suits for card in cards
    ):
        raise ContractError("holdout board has no canonical rank signature")
    flop = "".join(sorted((card[0] for card in cards[:3]), key=ranks.index))
    runout = "".join(card[0] for card in cards[3:])
    return f"{len(cards)}:{flop}:{runout}"


def declared_coverage(manifest: ApprovedManifest) -> list[dict[str, Any]]:
    unique: dict[bytes, dict[str, Any]] = {}
    machines: dict[bytes, set[str]] = {}
    board_ranks: dict[bytes, dict[str, set[str]]] = {}
    for scenario in manifest.raw["scenarios"]:
        for target in scenario["targets"]:
            context = target_context(scenario, target)
            key = canonical_json(context)
            unique[key] = context
            machine = target["machine_id"]
            machines.setdefault(key, set()).add(machine)
            board_ranks.setdefault(key, {"M1": set(), "M2": set()})[machine].add(
                board_rank_signature(target["board"])
            )
    if not unique:
        raise ContractError("manifest contains no compact-cell coverage")
    for key in unique:
        if machines[key] != {"M1", "M2"}:
            raise ContractError(
                "every compact context needs independently assigned M1 and M2 targets"
            )
        if board_ranks[key]["M1"] & board_ranks[key]["M2"]:
            raise ContractError(
                "M1 training and M2 holdout targets must use rank-disjoint boards"
            )
    return [unique[key] for key in sorted(unique)]


def dataset_item(
    status: Any, dataset_id: str, expected_runtime_cells: int
) -> dict[str, Any]:
    if (
        isinstance(expected_runtime_cells, bool)
        or not isinstance(expected_runtime_cells, int)
        or expected_runtime_cells <= 0
    ):
        raise GatewayError("declared compact coverage must be nonempty")
    datasets = status.get("datasets") if isinstance(status, dict) else None
    if not isinstance(datasets, list):
        raise GatewayError("certification status omitted datasets")
    for item in datasets:
        if isinstance(item, dict) and item.get("dataset_id") == dataset_id:
            for key in (
                "ingested_source_artifacts",
                "source_receipt_rows",
                "runtime_cells",
            ):
                status_count(item, key)
            state = item.get("state")
            if state not in {
                "building",
                "evaluating",
                "candidate",
                "active",
                "rejected",
                "retired",
            }:
                raise GatewayError("certification status returned an invalid dataset state")
            source_max = item.get("source_max_at")
            checksum = item.get("dataset_checksum")
            if source_max is not None and (
                not isinstance(source_max, str) or not source_max or len(source_max) > 80
            ):
                raise GatewayError("certification status returned an invalid source watermark")
            if checksum is not None and (
                not isinstance(checksum, str)
                or not HEX64.fullmatch(checksum)
                or checksum == "0" * 64
            ):
                raise GatewayError("certification status returned an invalid dataset checksum")
            if state in {"evaluating", "candidate", "active"} and (
                checksum is None or item["runtime_cells"] != expected_runtime_cells
            ):
                raise GatewayError(
                    "terminal certification status is unsealed or does not match declared coverage"
                )
            return item
    raise GatewayError("certification status omitted the registered dataset")


def status_count(item: dict[str, Any], key: str) -> int:
    value = item.get(key)
    if isinstance(value, bool) or not isinstance(value, int) or not 0 <= value <= JSON_MAX_SAFE_INTEGER:
        raise GatewayError(f"certification status returned an invalid {key}")
    return value


def registration_receipt_is_valid(value: Any) -> bool:
    return (
        isinstance(value, dict)
        and set(value) == {"dataset_id", "state", "idempotent"}
        and isinstance(value.get("dataset_id"), str)
        and UUID.fullmatch(value["dataset_id"]) is not None
        and value.get("state")
        in {"building", "evaluating", "candidate", "active", "rejected", "retired"}
        and isinstance(value.get("idempotent"), bool)
    )


def build_cell_receipt_is_valid(value: Any) -> bool:
    return (
        isinstance(value, dict)
        and set(value) == {"cell_key_checksum"}
        and isinstance(value.get("cell_key_checksum"), str)
        and HEX64.fullmatch(value["cell_key_checksum"]) is not None
        and value["cell_key_checksum"] != "0" * 64
    )


def seal_receipt_is_valid(value: Any) -> bool:
    return (
        isinstance(value, dict)
        and set(value) == {"dataset_checksum", "idempotent"}
        and isinstance(value.get("dataset_checksum"), str)
        and HEX64.fullmatch(value["dataset_checksum"]) is not None
        and value["dataset_checksum"] != "0" * 64
        and isinstance(value.get("idempotent"), bool)
    )


def compact_heartbeat_receipt_is_valid(value: Any, run_id: str, sequence: int) -> bool:
    if (
        not isinstance(value, dict)
        or value.get("accepted") is not True
        or value.get("run_id") != run_id
        or isinstance(value.get("sequence"), bool)
        or value.get("sequence") != sequence
        or not isinstance(value.get("idempotent"), bool)
    ):
        return False
    base = {"accepted", "idempotent", "run_id", "sequence"}
    if value["idempotent"]:
        return set(value) == base
    if set(value) != base | {"compact_lag_seconds"}:
        return False
    lag = value["compact_lag_seconds"]
    return lag is None or (
        not isinstance(lag, bool)
        and isinstance(lag, (int, float))
        and math.isfinite(float(lag))
        and lag >= 0
    )


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
        source_rows = 0 if item is None else status_count(item, "ingested_source_artifacts")
        receipts = 0 if item is None else status_count(item, "source_receipt_rows")
        cells = 0 if item is None else status_count(item, "runtime_cells")
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
        if not compact_heartbeat_receipt_is_valid(result, self.run_id, self.sequence):
            raise GatewayError("database returned an invalid compact-heartbeat receipt")
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
    if not registration_receipt_is_valid(registration):
        raise GatewayError("dataset registration returned an invalid receipt")
    dataset_id = registration["dataset_id"]
    heartbeat = CompactHeartbeat(client, manifest.raw["dataset_key"])
    item: dict[str, Any] | None = None
    heartbeat.pulse("starting", item)
    try:
        status = client.call("certification_status", {"dataset_id": dataset_id})
        item = dataset_item(status, dataset_id, len(coverage))
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
                built_receipt = client.call(
                    "build_cell",
                    {"dataset_id": dataset_id, "context": context},
                    timeout_seconds=280,
                )
                if not build_cell_receipt_is_valid(built_receipt):
                    raise GatewayError("database returned an invalid compact-cell receipt")
            except GatewayError as error:
                if error.status == 409 and "needs M1 and M2" in str(error):
                    status = client.call("certification_status", {"dataset_id": dataset_id})
                    item = dataset_item(status, dataset_id, len(coverage))
                    heartbeat.pulse("paused", item)
                    print(
                        "[v31-compactor] source corpus is not complete on both hosts; "
                        "no candidate was sealed"
                    )
                    return 2
                raise
            built += 1
            status = client.call("certification_status", {"dataset_id": dataset_id})
            item = dataset_item(status, dataset_id, len(coverage))
            heartbeat.pulse("building", item)
            print(f"[v31-compactor] built {built}/{len(coverage)} declared cells")

        heartbeat.pulse("validating", item)
        sealed = client.call(
            "seal_dataset", {"dataset_id": dataset_id}, timeout_seconds=280
        )
        if not seal_receipt_is_valid(sealed):
            raise GatewayError("database returned an invalid dataset-seal receipt")
        status = client.call("certification_status", {"dataset_id": dataset_id})
        item = dataset_item(status, dataset_id, len(coverage))
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
