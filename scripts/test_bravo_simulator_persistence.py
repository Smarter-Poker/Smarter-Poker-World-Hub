#!/usr/bin/env python3
"""Focused behavior tests for Bravo simulator retry-safe persistence."""

import importlib.util
import io
import json
import logging
import os
import sys
import tempfile
import unittest
import urllib.error
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest import mock


SCRIPTS_DIR = Path(__file__).resolve().parent
SIMULATOR_PATH = SCRIPTS_DIR / "bravo-simulator-daemon.py"
MIGRATION_PATH = (
    SCRIPTS_DIR.parent
    / "supabase/migrations/20260906210000_pnm_scraper_data_truth.sql"
)
sys.path.insert(0, str(SCRIPTS_DIR))


def _load_simulator():
    spec = importlib.util.spec_from_file_location(
        "bravo_simulator_daemon_under_test", SIMULATOR_PATH
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


class _Response:
    def __init__(self, rows):
        self._body = json.dumps(rows).encode("utf-8")

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, traceback):
        return False

    def read(self):
        return self._body


class _OneGameModel:
    def get_venues(self):
        return ["bellagio"]

    def get_venue_name(self, slug):
        return "Bellagio"

    def get_games_for_venue(self, slug):
        return ["$1/$3 NLH"]

    def get_pattern(self, slug, game):
        return {
            "context_baselines": {
                (6, 13): {
                    "tables": 1,
                    "waiting": 0,
                    "sample_count": 6,
                    "distinct_dates": 3,
                    "newest_snapshot": datetime(
                        2026, 9, 1, 18, tzinfo=timezone.utc
                    ),
                }
            },
            "buyin_range": "100-500",
        }


class SimulatorPersistenceTests(unittest.TestCase):
    def _generated_row(self):
        fixed_uuid = "00000000-0000-0000-0000-000000000123"
        with mock.patch.object(simulator.uuid, "uuid4", return_value=fixed_uuid):
            rows = simulator.generate_snapshot(
                _OneGameModel(),
                datetime(2026, 9, 6, 18, tzinfo=timezone.utc),
            )
        self.assertEqual(len(rows), 1)
        return rows[0]

    def test_generated_modeled_row_has_batch_scoped_stable_primary_key(self):
        row = self._generated_row()
        expected_id = simulator.stable_live_row_id(
            "bravo", row["scrape_batch_id"], row["bravo_slug"], row["game_name"]
        )
        self.assertEqual(row["id"], expected_id)
        self.assertLess(row["id"], 0)
        self.assertEqual(row["observation_kind"], "modeled")
        self.assertEqual(row["data_quality"], "simulated")

    def test_migration_enforces_the_simulator_evidence_pair(self):
        migration = MIGRATION_PATH.read_text(encoding="utf-8")
        self.assertIn(
            "Pause every Bravo, PokerAtlas, simulator, and tournament writer",
            migration,
        )
        self.assertIn("Resume writers only after", migration)
        self.assertIn(
            "coalesce(scrape_batch_id, '') like 'sim-%'", migration
        )
        self.assertIn(
            "(observation_kind = 'modeled' and data_quality = 'simulated')",
            migration,
        )
        self.assertIn(
            "delete from public.venue_live_tables\n where observation_kind = 'modeled'",
            migration,
        )

    def test_context_requires_six_samples_across_three_distinct_dates(self):
        base = datetime(2026, 8, 22, 18, tzinfo=timezone.utc)

        def record(index, *, date_divisor=2, tables=1):
            snapshot = base + timedelta(days=7 * (index // date_divisor))
            return {
                "qualified": True,
                "dow": 5,
                "hour": 13,
                "central_date": snapshot.date().isoformat(),
                "snapshot": snapshot,
                "tables": tables,
                "waiting": index % 2,
            }

        self.assertEqual(
            simulator._build_context_baselines([record(i) for i in range(5)]),
            {},
        )
        self.assertEqual(
            simulator._build_context_baselines(
                [record(i, date_divisor=3) for i in range(6)]
            ),
            {},
        )

        qualified = simulator._build_context_baselines(
            [record(i, tables=(1 if i < 3 else 2)) for i in range(6)]
        )
        self.assertEqual(set(qualified), {(5, 13)})
        self.assertEqual(qualified[(5, 13)]["sample_count"], 6)
        self.assertEqual(qualified[(5, 13)]["distinct_dates"], 3)
        self.assertEqual(qualified[(5, 13)]["tables"], 2)

    def test_catalog_only_history_is_not_loaded_or_modeled(self):
        model = simulator.PatternModel()
        requested_sources = []

        def fetch(source):
            requested_sources.append(source)
            return []

        def load_directory():
            model._directory_count = 1

        with mock.patch.object(model, "_fetch_history", side_effect=fetch):
            with mock.patch.object(model, "_load_directory_venues", side_effect=load_directory):
                model.build()

        self.assertEqual(requested_sources, ["bravo"])
        self.assertEqual(model.get_venues(), [])
        self.assertIsNone(model.history_age_days())
        self.assertEqual(model.qualification_summary()["qualified_patterns"], 0)

    def test_modeled_rows_disguised_as_bravo_history_are_rejected(self):
        model = simulator.PatternModel()
        timestamps = [
            datetime(2026, 8, 22, 18, tzinfo=timezone.utc) + timedelta(days=7 * (i // 2))
            for i in range(6)
        ]
        rows = [{
            "bravo_slug": "bellagio",
            "venue_name": "Bellagio",
            "game_type": "$1/$3 NLH",
            "stakes": "$1/$3",
            "tables": 2,
            "waiting": 0,
            "snapshot_time": stamp.isoformat(),
            "source": "bravo",
            "batch_id": f"sim-{i}",
            "observation_kind": "modeled",
        } for i, stamp in enumerate(timestamps)]

        def fetch(source):
            return rows if source == "bravo" else []

        def load_directory():
            venue = {
                "id": 1,
                "name": "Bellagio",
                "_feed_slug": "bellagio",
                "_name_key": "bellagio",
                "_slug": "bellagio",
                "_pokeratlas_slug": "bellagio-hotel-casino-las-vegas",
            }
            model._directory_count = 1
            model._venue_names["bellagio"] = "Bellagio"
            model._directory_identity_index["bellagio"] = venue
            model._directory_name_index["bellagio"] = venue

        with mock.patch.object(model, "_fetch_history", side_effect=fetch):
            with mock.patch.object(model, "_load_directory_venues", side_effect=load_directory):
                model.build()

        self.assertEqual(model.get_venues(), [])
        self.assertEqual(model.qualification_summary()["qualified_rows"], 0)
        self.assertEqual(model.qualification_summary()["unqualified_bravo_rows"], 6)

    def test_stale_exact_context_emits_no_estimate(self):
        stale_model = _OneGameModel()
        stale = datetime(2026, 8, 1, 18, tzinfo=timezone.utc)
        pattern = stale_model.get_pattern("bellagio", "$1/$3 NLH")
        pattern["context_baselines"][(6, 13)]["newest_snapshot"] = stale
        with mock.patch.object(stale_model, "get_pattern", return_value=pattern):
            rows = simulator.generate_snapshot(
                stale_model,
                datetime(2026, 9, 6, 18, tzinfo=timezone.utc),
            )
        self.assertEqual(rows, [])

    def test_zero_history_cleanup_deletes_only_simulator_owned_rows(self):
        with mock.patch.object(
            simulator, "sb_delete_simulator_rows", return_value=True
        ) as delete_rows:
            self.assertTrue(simulator.retire_unqualified_simulator_rows())
        delete_rows.assert_called_once_with("venue_live_tables")

    def test_commit_then_timeout_retries_as_one_confirmed_upsert(self):
        row = self._generated_row()
        stored = {}
        requests = []

        def commit_then_respond(request, timeout):
            payload = json.loads(request.data)
            requests.append(request)
            for item in payload:
                stored[item["id"]] = item
            if len(requests) == 1:
                raise TimeoutError("response lost after commit")
            return _Response(payload)

        with mock.patch.object(
            simulator.urllib.request, "urlopen", side_effect=commit_then_respond
        ):
            with mock.patch.object(simulator.time, "sleep"):
                saved, failed_chunks = simulator.sb_insert(
                    "venue_live_tables", [row]
                )

        self.assertEqual((saved, failed_chunks), (1, 0))
        self.assertEqual(len(requests), 2)
        self.assertEqual(len(stored), 1)
        self.assertEqual(
            requests[0].get_header("Prefer"),
            "resolution=merge-duplicates,return=representation",
        )
        self.assertEqual(requests[0].data, requests[1].data)

    def test_unconfirmed_response_is_retried_and_reported_failed(self):
        row = self._generated_row()
        with mock.patch.object(
            simulator.urllib.request, "urlopen", return_value=_Response([])
        ) as urlopen:
            with mock.patch.object(simulator.time, "sleep"):
                saved, failed_chunks = simulator.sb_insert(
                    "venue_live_tables", [row]
                )

        self.assertEqual((saved, failed_chunks), (0, 1))
        self.assertEqual(urlopen.call_count, 3)

    def test_response_with_an_unexpected_id_is_not_counted_as_persisted(self):
        row = self._generated_row()
        response_rows = [row, {**row, "id": row["id"] - 1}]
        with mock.patch.object(
            simulator.urllib.request,
            "urlopen",
            return_value=_Response(response_rows),
        ) as urlopen:
            with mock.patch.object(simulator.time, "sleep"):
                saved, failed_chunks = simulator.sb_insert(
                    "venue_live_tables", [row]
                )

        self.assertEqual((saved, failed_chunks), (0, 1))
        self.assertEqual(urlopen.call_count, 3)

    def test_stale_delete_is_verified_before_success(self):
        responses = [_Response([]), _Response([])]
        with mock.patch.object(
            simulator.urllib.request, "urlopen", side_effect=responses
        ) as urlopen:
            self.assertTrue(
                simulator.sb_delete_simulator_rows(
                    "venue_live_tables", except_batch_id="sim-current"
                )
            )

        self.assertEqual(urlopen.call_count, 2)
        delete_request = urlopen.call_args_list[0].args[0]
        verify_request = urlopen.call_args_list[1].args[0]
        self.assertEqual(delete_request.get_method(), "DELETE")
        self.assertEqual(
            delete_request.get_header("Prefer"), "return=minimal"
        )
        self.assertEqual(verify_request.get_method(), "GET")
        self.assertIn("scrape_batch_id=like.sim-%25", verify_request.full_url)
        self.assertIn("scrape_batch_id=neq.sim-current", verify_request.full_url)

    def test_stale_delete_fails_when_verification_finds_a_row(self):
        responses = [_Response([]), _Response([{"id": -1}])]
        with mock.patch.object(
            simulator.urllib.request, "urlopen", side_effect=responses
        ):
            self.assertFalse(
                simulator.sb_delete_simulator_rows("venue_live_tables")
            )

    def test_os_lock_refuses_a_second_simulator(self):
        with tempfile.TemporaryDirectory() as directory:
            lock_path = Path(directory) / "simulator.lock"
            with mock.patch.object(simulator, "LOCK_FILE", lock_path):
                first = simulator._acquire_process_lock()
                self.addCleanup(first.close)
                with self.assertRaises(SystemExit):
                    simulator._acquire_process_lock()

    def test_missing_observation_kind_schema_fails_closed_without_retry(self):
        row = self._generated_row()
        error = urllib.error.HTTPError(
            url="https://testproject.supabase.co/rest/v1/venue_live_tables",
            code=400,
            msg="Bad Request",
            hdrs=None,
            fp=io.BytesIO(b'{"message":"observation_kind does not exist"}'),
        )
        self.addCleanup(error.close)
        with mock.patch.object(
            simulator.urllib.request, "urlopen", side_effect=error
        ) as urlopen:
            with mock.patch.object(simulator.time, "sleep"):
                saved, failed_chunks = simulator.sb_insert(
                    "venue_live_tables", [row]
                )

        self.assertEqual((saved, failed_chunks), (0, 1))
        self.assertEqual(urlopen.call_count, 1)


if __name__ == "__main__":
    unittest.main()
