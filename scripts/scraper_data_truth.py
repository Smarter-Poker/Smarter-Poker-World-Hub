"""Shared, side-effect-free scraper provenance and persistence contracts.

The daemon entrypoints intentionally load credentials and browser runtimes at
import time, which makes them poor unit-test targets.  This module contains the
small decisions that must stay identical across those entrypoints and is safe
to import from both production processes and executable tests.
"""

from __future__ import annotations

from typing import Dict, Iterable, Mapping, Set, Tuple


OBSERVATION_OBSERVED = "observed"
OBSERVATION_CATALOG = "catalog"
OBSERVATION_MODELED = "modeled"

QUALITY_OBSERVED = "scraped_verified"
QUALITY_CATALOG = "catalog_verified"
QUALITY_MODELED = "simulated"
QUALITY_INFERRED = "scraped_inferred"

RUN_SUCCESS = "success"
RUN_VALID_EMPTY = "valid_empty"
RUN_PARTIAL = "partial"
RUN_FAILED = "failed"


def is_modeled_live_row(row: Mapping) -> bool:
    """Return whether a live-table row is modeled, including legacy rows.

    ``observation_kind`` is authoritative after the data-truth migration.  The
    batch/source fallbacks keep cleanup and readers safe while old rows age out.
    """

    kind = str(row.get("observation_kind") or "").strip().lower()
    if kind:
        return kind == OBSERVATION_MODELED
    batch = str(row.get("scrape_batch_id") or row.get("batch_id") or "")
    source = str(row.get("source") or "").strip().lower()
    return batch.startswith("sim-") or source in {
        "bravo-simulator",
        "bravo_simulator",
        "modeled_cash_game",
    }


def is_observed_bravo_row(row: Mapping) -> bool:
    """Only genuinely observed Bravo rows may suppress PokerAtlas catalog rows."""

    if str(row.get("source") or "").strip().lower() != "bravo":
        return False
    kind = str(row.get("observation_kind") or "").strip().lower()
    if kind:
        return kind == OBSERVATION_OBSERVED
    return not is_modeled_live_row(row)


def classify_persisted_run(
    *,
    attempted: int,
    persisted: int,
    rejected: int = 0,
    errors: int = 0,
    valid_empty: bool = False,
    status_reason: str = "",
) -> Dict[str, object]:
    """Classify a run from confirmed database output, never parser output.

    A run with zero confirmed rows is a failure unless the caller positively
    proves an allowed empty state.  ``valid_empty`` cannot hide rejects/errors
    or a partial write.
    """

    attempted = max(0, int(attempted or 0))
    persisted = max(0, int(persisted or 0))
    rejected = max(0, int(rejected or 0))
    errors = max(0, int(errors or 0))

    if valid_empty and (attempted > 0 or persisted > 0 or rejected > 0 or errors > 0):
        raise ValueError("valid_empty requires zero attempted, persisted, rejected, and errors")

    if valid_empty:
        run_status = RUN_VALID_EMPTY
        reason = status_reason or "source_confirmed_no_write_required"
    elif persisted <= 0:
        run_status = RUN_FAILED
        reason = status_reason or "zero_rows_persisted"
    elif rejected > 0 or errors > 0 or (attempted > 0 and persisted < attempted):
        run_status = RUN_PARTIAL
        reason = status_reason or "not_all_attempted_rows_persisted"
    else:
        run_status = RUN_SUCCESS
        reason = status_reason or "all_attempted_rows_persisted"

    return {
        "run_status": run_status,
        "records_attempted": attempted,
        "records_saved": persisted,
        "records_rejected": rejected,
        "errors": errors,
        "status_reason": reason,
    }


def fully_persisted_venue_ids(
    expected_keys_by_venue: Mapping[object, Iterable[Tuple]],
    persisted_keys: Iterable[Tuple],
) -> Set[object]:
    """Return venues for which every submitted row was confirmed persisted."""

    confirmed = set(persisted_keys)
    complete: Set[object] = set()
    for venue_id, keys in expected_keys_by_venue.items():
        expected = set(keys)
        if expected and expected.issubset(confirmed):
            complete.add(venue_id)
    return complete


def tour_stop_identity(row: Mapping) -> Tuple[str, str]:
    """Stable tour-stop identity: a recurring name may legitimately recur yearly."""

    name = " ".join(str(row.get("stop_name") or "").lower().split())
    start = str(row.get("stop_start_date") or row.get("start_date") or "")[:10]
    return name, start

