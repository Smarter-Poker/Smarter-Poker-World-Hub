#!/usr/bin/env python3
"""Focused behavioral tests for Bravo live persistence and cleanup safety."""

import importlib.util
import json
import logging
import os
import sys
import types
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest import mock


SCRIPTS_DIR = Path(__file__).resolve().parent
DAEMON_PATH = SCRIPTS_DIR / "bravo-live-daemon.py"
sys.path.insert(0, str(SCRIPTS_DIR))


def _load_daemon():
    spec = importlib.util.spec_from_file_location(
        "bravo_live_daemon_under_test", DAEMON_PATH
    )
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    with mock.patch.dict(os.environ, {
        "SUPABASE_KEY": "test-service-key",
        "NEXT_PUBLIC_SUPABASE_URL": "https://testproject.supabase.co",
        "BRAVO_EMAIL": "test@example.com",
        "BRAVO_PASS": "test-password",
    }, clear=False):
        with mock.patch("dotenv.load_dotenv"):
            with mock.patch.object(
                logging, "FileHandler", return_value=logging.NullHandler()
            ):
                with mock.patch.dict(
                    sys.modules, {"browser_heal": types.SimpleNamespace()}
                ):
                    spec.loader.exec_module(module)
    return module


daemon = _load_daemon()


class _Response:
    status = 201

    def __init__(self, rows):
        self._body = json.dumps(rows).encode("utf-8")

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, traceback):
        return False

    def read(self):
        return self._body


class BravoLivePersistenceTests(unittest.TestCase):
    row = {
        "id": -101,
        "bravo_slug": "test-room",
        "venue_name": "Test Room",
        "game_name": "1/3 NLH",
    }

    def test_commit_then_timeout_retries_same_deterministic_row(self):
        stored = {}
        bodies = []

        def commit_then_respond(request, timeout):
            payload = json.loads(request.data)
            bodies.append(request.data)
            for item in payload:
                stored[item["id"]] = item
            if len(bodies) == 1:
                raise TimeoutError("response lost after commit")
            return _Response(payload)

        with mock.patch.object(
            daemon.urllib.request, "urlopen", side_effect=commit_then_respond
        ):
            with mock.patch.object(daemon.time, "sleep"):
                confirmed = daemon.sb_upsert("venue_live_tables", [self.row])

        self.assertEqual(confirmed, {-101})
        self.assertEqual(len(stored), 1)
        self.assertEqual(bodies[0], bodies[1])

    def test_response_with_unexpected_id_never_confirms_batch(self):
        response = [{**self.row}, {**self.row, "id": -999}]
        with mock.patch.object(
            daemon.urllib.request, "urlopen", return_value=_Response(response)
        ) as urlopen:
            with mock.patch.object(daemon.time, "sleep"):
                confirmed = daemon.sb_upsert("venue_live_tables", [self.row])

        self.assertEqual(confirmed, set())
        self.assertEqual(urlopen.call_count, 3)

    def test_payload_dedupes_whitespace_and_stamps_observed_truth(self):
        result = {
            "venue_slug": "test-room",
            "venue_name": "Test Room",
            "scrape_timestamp": "2026-09-06T12:00:00+00:00",
            "scrape_html_hash": "fixture",
            "live_games": [
                {"game": " 1/3   NLH ", "tables": 1},
                {"game": "1/3 NLH", "tables": 2},
            ],
            "waitlist": [{"game": "1/3 NLH", "players_waiting": 3}],
        }
        payload = daemon.build_payload_from_results(
            [result], "00000000-0000-0000-0000-000000000123"
        )

        self.assertEqual(len(payload), 1)
        self.assertEqual(payload[0]["game_name"], "1/3 NLH")
        self.assertEqual(payload[0]["tables_running"], 2)
        self.assertEqual(payload[0]["players_waiting"], 3)
        self.assertEqual(payload[0]["observation_kind"], "observed")
        self.assertEqual(payload[0]["data_quality"], "scraped_verified")

    def test_delete_verification_distinguishes_empty_and_failed_contract(self):
        with mock.patch.object(
            daemon.urllib.request, "urlopen", return_value=_Response([])
        ):
            self.assertFalse(daemon.sb_has_rows("venue_live_tables", "source=eq.bravo"))
        with mock.patch.object(
            daemon.urllib.request, "urlopen", side_effect=TimeoutError("timeout")
        ):
            self.assertIsNone(
                daemon.sb_has_rows("venue_live_tables", "source=eq.bravo")
            )

    def test_process_lock_allows_only_one_writer(self):
        with TemporaryDirectory() as tmp:
            with mock.patch.object(daemon, "LOCK_FILE", Path(tmp) / "daemon.lock"):
                first = daemon._acquire_daemon_lock()
                self.addCleanup(first.close)
                second = daemon._acquire_daemon_lock()

        self.assertIsNone(second)


if __name__ == "__main__":
    unittest.main()
