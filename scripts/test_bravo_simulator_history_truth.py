#!/usr/bin/env python3
"""Truth-gate tests for the observed-history cash-game estimator."""

import importlib.util
import io
import logging
import os
import re
import sys
import unittest
import urllib.error
from datetime import datetime, timezone
from pathlib import Path
from unittest import mock


SCRIPTS_DIR = Path(__file__).resolve().parent
SIMULATOR_PATH = SCRIPTS_DIR / "bravo-simulator-daemon.py"
sys.path.insert(0, str(SCRIPTS_DIR))


def _load_simulator():
    spec = importlib.util.spec_from_file_location(
        "bravo_simulator_history_truth_under_test", SIMULATOR_PATH
    )
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    with mock.patch.dict(
        os.environ,
        {
            "SUPABASE_KEY": "test-service-key",
            "NEXT_PUBLIC_SUPABASE_URL": "https://testproject.supabase.co",
        },
        clear=False,
    ):
        with mock.patch.object(
            logging, "FileHandler", return_value=logging.NullHandler()
        ):
            spec.loader.exec_module(module)
    return module


simulator = _load_simulator()


def _directory_venue(
    venue_id=1,
    name="Bellagio Poker Room",
    slug="bellagio-poker-room",
    pokeratlas_slug="bellagio-poker-room-las-vegas",
):
    return {
        "id": venue_id,
        "name": name,
        "slug": slug,
        "pokeratlas_slug": pokeratlas_slug,
        "venue_type": "casino",
        "is_active": True,
        "is_suppressed": False,
        "canonical_venue_id": None,
        "country": "US",
        "state": "NV",
        "city": "Las Vegas",
    }


def _observed_rows(
    slug="source-bellagio",
    venue_name="Bellagio Poker Room",
    timestamps=None,
):
    timestamps = timestamps or (
        "2026-08-17T01:05:00+00:00",
        "2026-08-17T01:35:00+00:00",
        "2026-08-24T01:05:00+00:00",
        "2026-08-24T01:35:00+00:00",
        "2026-08-31T01:05:00+00:00",
        "2026-08-31T01:35:00+00:00",
    )
    tables = (1, 2, 3, 3, 4, 5)
    waiting = (0, 1, 1, 2, 2, 3)
    return [
        {
            "bravo_slug": slug,
            "venue_name": venue_name,
            "game_type": "1/3 NLH",
            "stakes": "$1/$3",
            "tables": tables[index],
            "waiting": waiting[index],
            "snapshot_time": timestamp,
            "source": "bravo",
            "observation_kind": "observed",
            "batch_id": f"observed-{index}",
        }
        for index, timestamp in enumerate(timestamps)
    ]


def _build_model(directory, bravo_rows, pokeratlas_rows=None):
    model = simulator.PatternModel()
    history_results = [bravo_rows]
    if bravo_rows:
        history_results.append(pokeratlas_rows or [])
    with mock.patch.object(
        model, "_fetch_history", side_effect=history_results
    ) as fetch_history:
        with mock.patch.object(simulator, "sb_fetch", return_value=directory):
            model.build()
    return model, fetch_history


class SimulatorHistoryTruthTests(unittest.TestCase):
    def test_zero_bravo_history_never_loads_catalog_or_builds_a_model(self):
        model, fetch_history = _build_model([_directory_venue()], [])

        self.assertEqual(fetch_history.call_count, 1)
        fetch_history.assert_called_once_with("bravo")
        self.assertEqual(model.get_venues(), [])
        self.assertIsNone(model.history_age_days())
        self.assertEqual(model.qualification_summary()["qualified_rows"], 0)

    def test_exact_context_uses_only_observed_median_and_canonical_directory_id(self):
        pokeratlas_metadata = [{
            "bravo_slug": "bellagio-poker-room-las-vegas",
            "venue_name": "Bellagio Poker Room",
            "game_type": "1/3 NLH",
            "stakes": "$1/$3",
            "buyin_range": "$100-$500",
            "tables": 99,
            "waiting": 99,
            "snapshot_time": "2026-08-31T01:35:00+00:00",
            "source": "pokeratlas",
            "observation_kind": "catalog",
            "batch_id": "pa-catalog",
        }]
        model, _ = _build_model(
            [_directory_venue()], _observed_rows(), pokeratlas_metadata
        )

        with mock.patch.object(
            simulator.uuid,
            "uuid4",
            return_value="00000000-0000-0000-0000-000000000999",
        ):
            rows = simulator.generate_snapshot(
                model, datetime(2026, 9, 7, 1, 15, tzinfo=timezone.utc)
            )

        self.assertEqual(len(rows), 1)
        row = rows[0]
        self.assertEqual(row["bravo_slug"], "bellagio-poker-room")
        self.assertEqual(row["venue_name"], "Bellagio Poker Room")
        self.assertEqual(row["game_name"], "1/3 NLH")
        self.assertEqual(row["tables_running"], 3)
        self.assertEqual(row["players_waiting"], 2)
        self.assertEqual(row["buyin_range"], "$100-$500")
        self.assertEqual(row["observation_kind"], "modeled")
        self.assertEqual(row["data_quality"], "simulated")
        self.assertTrue(row["scrape_batch_id"].startswith("sim-"))
        self.assertIsNone(row["scrape_html_hash"])

    def test_other_hour_and_stale_exact_context_publish_nothing(self):
        model, _ = _build_model([_directory_venue()], _observed_rows())

        other_hour = simulator.generate_snapshot(
            model, datetime(2026, 9, 7, 2, 15, tzinfo=timezone.utc)
        )
        stale_same_context = simulator.generate_snapshot(
            model, datetime(2026, 9, 28, 1, 15, tzinfo=timezone.utc)
        )

        self.assertEqual(other_hour, [])
        self.assertEqual(stale_same_context, [])

    def test_sample_floor_requires_three_distinct_central_dates(self):
        two_dates = (
            "2026-08-24T01:05:00+00:00",
            "2026-08-24T01:15:00+00:00",
            "2026-08-24T01:35:00+00:00",
            "2026-08-31T01:05:00+00:00",
            "2026-08-31T01:15:00+00:00",
            "2026-08-31T01:35:00+00:00",
        )
        model, _ = _build_model(
            [_directory_venue()], _observed_rows(timestamps=two_dates)
        )

        self.assertEqual(model.get_venues(), [])
        self.assertEqual(model.qualification_summary()["qualified_rows"], 6)

    def test_ambiguous_exact_name_join_fails_closed(self):
        directory = [
            _directory_venue(
                venue_id=1,
                name="Signal Poker Room",
                slug="signal-east",
                pokeratlas_slug="signal-east-pa",
            ),
            _directory_venue(
                venue_id=2,
                name="Signal Poker Room",
                slug="signal-west",
                pokeratlas_slug="signal-west-pa",
            ),
        ]
        model, _ = _build_model(
            directory,
            _observed_rows(slug="unmapped-signal", venue_name="Signal Poker Room"),
        )

        self.assertEqual(model.get_venues(), [])
        self.assertEqual(
            model.qualification_summary()["unmatched_or_ambiguous_rows"], 6
        )

    def test_legacy_sim_batches_and_modeled_rows_are_not_observations(self):
        rows = _observed_rows()
        for row in rows[:3]:
            row.pop("observation_kind")
            row["batch_id"] = "sim-legacy"
        for row in rows[3:]:
            row["observation_kind"] = "modeled"
            row["batch_id"] = "other-modeled"

        model, _ = _build_model([_directory_venue()], rows)

        self.assertEqual(model.get_venues(), [])
        self.assertEqual(model.qualification_summary()["qualified_rows"], 0)
        self.assertEqual(model.qualification_summary()["unqualified_bravo_rows"], 6)

    def test_zero_history_cleanup_deletes_only_simulator_owned_rows(self):
        with mock.patch.object(
            simulator, "sb_delete_simulator_rows", return_value=True
        ) as delete_rows:
            self.assertTrue(simulator.retire_unqualified_simulator_rows())

        delete_rows.assert_called_once_with("venue_live_tables")
        source = SIMULATOR_PATH.read_text(encoding="utf-8")
        self.assertRegex(
            source,
            re.compile(
                r"if age_days is None:\s+"
                r"unavailable_reason = 'no_qualified_observed_bravo_history'"
                r"[\s\S]+?elif not rows:[\s\S]+?"
                r"retire_unqualified_simulator_rows\(\)",
            ),
        )

    def test_history_fetch_drops_only_missing_optional_columns(self):
        def missing_column(column):
            return urllib.error.HTTPError(
                url="https://testproject.supabase.co/rest/v1/game_live_history",
                code=400,
                msg="Bad Request",
                hdrs=None,
                fp=io.BytesIO(
                    ('{"message":"column game_live_history.%s does not exist"}' % column).encode()
                ),
            )

        observation_error = missing_column("observation_kind")
        buyin_error = missing_column("buyin_range")
        self.addCleanup(observation_error.close)
        self.addCleanup(buyin_error.close)
        model = simulator.PatternModel()
        with mock.patch.object(
            simulator,
            "sb_fetch",
            side_effect=[observation_error, buyin_error, []],
        ) as fetch:
            self.assertEqual(model._fetch_history("bravo"), [])

        selects = [call.args[1]["select"] for call in fetch.call_args_list]
        self.assertIn("observation_kind", selects[0])
        self.assertIn("buyin_range", selects[0])
        self.assertNotIn("observation_kind", selects[1])
        self.assertIn("buyin_range", selects[1])
        self.assertNotIn("observation_kind", selects[2])
        self.assertNotIn("buyin_range", selects[2])


if __name__ == "__main__":
    unittest.main()
