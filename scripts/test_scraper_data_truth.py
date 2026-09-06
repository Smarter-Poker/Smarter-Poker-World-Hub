#!/usr/bin/env python3
"""Executable behavior tests for scraper data-truth contracts."""

import unittest

from scraper_data_truth import (
    RUN_FAILED,
    RUN_PARTIAL,
    RUN_SUCCESS,
    RUN_VALID_EMPTY,
    classify_persisted_run,
    fully_persisted_venue_ids,
    is_modeled_live_row,
    is_observed_bravo_row,
    tour_stop_identity,
)


class ProvenanceTests(unittest.TestCase):
    def test_modeled_bravo_never_counts_as_observed(self):
        current = {"source": "bravo", "observation_kind": "modeled", "scrape_batch_id": "sim-1"}
        legacy = {"source": "bravo", "scrape_batch_id": "sim-legacy"}
        observed = {"source": "bravo", "observation_kind": "observed", "scrape_batch_id": "real-1"}
        self.assertTrue(is_modeled_live_row(current))
        self.assertTrue(is_modeled_live_row(legacy))
        self.assertFalse(is_observed_bravo_row(current))
        self.assertFalse(is_observed_bravo_row(legacy))
        self.assertTrue(is_observed_bravo_row(observed))

    def test_catalog_never_counts_as_observed_bravo(self):
        self.assertFalse(is_observed_bravo_row({
            "source": "pokeratlas", "observation_kind": "catalog"
        }))


class PersistenceTests(unittest.TestCase):
    def test_zero_persisted_is_failure(self):
        result = classify_persisted_run(attempted=17, persisted=0)
        self.assertEqual(result["run_status"], RUN_FAILED)
        self.assertEqual(result["status_reason"], "zero_rows_persisted")

    def test_partial_persist_is_partial(self):
        result = classify_persisted_run(attempted=17, persisted=12, rejected=5)
        self.assertEqual(result["run_status"], RUN_PARTIAL)

    def test_full_persist_is_success(self):
        result = classify_persisted_run(attempted=17, persisted=17)
        self.assertEqual(result["run_status"], RUN_SUCCESS)

    def test_valid_empty_must_be_explicit_and_clean(self):
        result = classify_persisted_run(
            attempted=0,
            persisted=0,
            valid_empty=True,
            status_reason="all_catalog_rows_already_observed",
        )
        self.assertEqual(result["run_status"], RUN_VALID_EMPTY)
        with self.assertRaises(ValueError):
            classify_persisted_run(attempted=1, persisted=0, valid_empty=True)

    def test_only_fully_persisted_venues_are_fresh(self):
        expected = {
            10: {("a",), ("b",)},
            20: {("c",)},
            30: set(),
        }
        self.assertEqual(
            fully_persisted_venue_ids(expected, {("a",), ("c",)}),
            {20},
        )


class TourIdentityTests(unittest.TestCase):
    def test_same_stop_name_in_different_years_is_not_a_duplicate(self):
        first = tour_stop_identity({"stop_name": "Main Tour", "stop_start_date": "2026-05-01"})
        second = tour_stop_identity({"stop_name": "  MAIN   TOUR ", "start_date": "2027-05-01"})
        self.assertNotEqual(first, second)
        self.assertEqual(first, ("main tour", "2026-05-01"))


if __name__ == "__main__":
    unittest.main()
