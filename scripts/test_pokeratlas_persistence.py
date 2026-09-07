#!/usr/bin/env python3
"""Focused behavior tests for PokerAtlas retry-safe current-feed writes."""

import importlib.util
import io
import json
import logging
import os
import sys
import types
import unittest
import urllib.error
from contextlib import ExitStack
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest import mock


SCRIPTS_DIR = Path(__file__).resolve().parent
DAEMON_PATH = SCRIPTS_DIR / "pokeratlas-live-daemon.py"
sys.path.insert(0, str(SCRIPTS_DIR))


def _load_daemon():
    spec = importlib.util.spec_from_file_location(
        "pokeratlas_live_daemon_under_test", DAEMON_PATH
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
        with mock.patch("dotenv.load_dotenv"):
            with mock.patch.object(
                logging, "FileHandler", return_value=logging.NullHandler()
            ):
                with mock.patch.dict(
                    sys.modules,
                    {"browser_heal": types.SimpleNamespace()},
                ):
                    spec.loader.exec_module(module)
    return module


daemon = _load_daemon()


class _Response:
    def __init__(self, rows):
        self._body = json.dumps(rows).encode("utf-8")

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, traceback):
        return False

    def read(self):
        return self._body


class _Manager:
    def __init__(self, fetch_results=()):
        self.fetch_results = list(fetch_results)
        self.fetch_urls = []
        self.ensure_calls = 0
        self.total_cycles = 0
        self.consecutive_failures = 0
        self.empty_cycle_streak = 0
        self._session_dead = False
        self.session = object()

    def ensure_connected(self):
        self.ensure_calls += 1
        return True

    def fetch_with_fallback(self, url, expected_slug=None, expected_name=None):
        self.fetch_urls.append(url)
        return self.fetch_results.pop(0)


class PokerAtlasPersistenceTests(unittest.TestCase):
    def test_checked_in_registry_keeps_broad_us_coverage_without_border_rooms(self):
        venues = daemon.load_pa_venues()
        slugs = {venue["slug"] for venue in venues}

        self.assertGreaterEqual(len(venues), 400)
        self.assertEqual(len(slugs), len(venues))
        self.assertFalse({
            "caesars-windsor",
            "casino-niagara-niagara-falls",
        } & slugs)
        self.assertTrue({
            "bay-101-san-jose",
            "bellagio-las-vegas",
            "commerce-casino-los-angeles",
        }.issubset(slugs))

    row = {
        "id": -101,
        "venue_name": "Test Room",
        "game_name": "$1/$3 NLH",
        "source": "pokeratlas",
    }

    venues = [{
        "slug": "test-room",
        "name": "Test Room",
        "discovered_from": "https://www.pokeratlas.com/poker-rooms/texas",
    }]

    def _cycle_context(self, base, **overrides):
        evidence_dir = base / "data" / "scrape-evidence"
        log_dir = base / "data" / "pokeratlas-logs"
        evidence_dir.mkdir(parents=True, exist_ok=True)
        log_dir.mkdir(parents=True, exist_ok=True)
        defaults = {
            "BASE_DIR": base,
            "EVIDENCE_DIR": evidence_dir,
            "LOG_DIR": log_dir,
            "HEARTBEAT_FILE": log_dir / "heartbeat.json",
        }
        defaults.update(overrides)
        stack = ExitStack()
        for name, value in defaults.items():
            stack.enter_context(mock.patch.object(daemon, name, value))
        stack.enter_context(mock.patch.object(daemon, "_maybe_rotate_log"))
        stack.enter_context(mock.patch.object(daemon, "cleanup_evidence_files"))
        stack.enter_context(mock.patch.object(daemon, "cleanup_log_files"))
        stack.enter_context(mock.patch.object(daemon, "write_heartbeat"))
        stack.enter_context(mock.patch.object(daemon, "write_scraper_metric", return_value=True))
        stack.enter_context(mock.patch.object(daemon.time, "sleep"))
        stack.enter_context(mock.patch.object(daemon, "load_pa_venues", return_value=self.venues))
        stack.enter_context(
            mock.patch.object(daemon.urllib.request, "urlopen", return_value=_Response([]))
        )
        stack.enter_context(mock.patch.object(daemon, "sb_upsert", side_effect=lambda table, rows, **kwargs: len(rows)))
        stack.enter_context(mock.patch.object(daemon, "save_history_snapshot", return_value=True))
        stack.enter_context(mock.patch.object(daemon, "save_game_history_snapshot", return_value=True))
        return stack

    def _write_sweep_state(self, base, **overrides):
        state = {
            "version": daemon.SWEEP_STATE_CONTRACT_VERSION,
            "map_fingerprint": daemon._venue_map_fingerprint(self.venues),
            "sweep_batch_id": "00000000-0000-0000-0000-000000000123",
            "sweep_started_at": "2026-09-06T12:00:00+00:00",
            "cursor": 0,
            "phase": "cleanup",
            "had_fresh_contract_page": True,
            "had_explicit_no_page": False,
            "had_catalog_data": True,
            "had_persisted_rows": True,
            "updated": "2026-09-06T12:00:00+00:00",
        }
        state.update(overrides)
        target = base / "data" / "pokeratlas-sweep-state.json"
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(json.dumps(state), encoding="utf-8")
        return state, target

    def test_las_vegas_room_title_is_not_a_region_redirect(self):
        html = "<title>Bellagio Poker Room Las Vegas</title>"
        self.assertFalse(
            daemon._is_las_vegas_region_redirect(
                "https://www.pokeratlas.com/poker-room/bellagio-las-vegas/cash-games",
                "bellagio-las-vegas",
                html,
                "https://www.pokeratlas.com/poker-room/bellagio-las-vegas/cash-games",
            )
        )

    def test_non_vegas_region_fallback_is_detected(self):
        html = "<title>Las Vegas Poker Cash Games</title>"
        self.assertTrue(
            daemon._is_las_vegas_region_redirect(
                "https://www.pokeratlas.com/poker-cash-games/connecticut",
                "connecticut",
                html,
                "https://www.pokeratlas.com/poker-cash-games/las-vegas-nevada",
            )
        )
        self.assertFalse(
            daemon._is_las_vegas_region_redirect(
                "https://www.pokeratlas.com/poker-cash-games/las-vegas-nevada",
                "las-vegas-nevada",
                html,
                "https://www.pokeratlas.com/poker-cash-games/las-vegas-nevada",
            )
        )

    def test_bellagio_request_rejects_an_aria_room_response(self):
        requested = (
            "https://www.pokeratlas.com/poker-room/"
            "bellagio-las-vegas/cash-games"
        )
        aria = """
          <html><head>
          <title>ARIA Resort & Casino Poker Room</title>
          <link rel="canonical"
            href="https://www.pokeratlas.com/poker-room/aria-resort-casino-las-vegas/cash-games">
          </head><body><h1>ARIA Resort & Casino</h1>
          <li class="cash-games-list-item">$1/$3 NLH</li></body></html>
        """
        matched, reason = daemon._pokeratlas_room_response_identity(
            requested,
            "bellagio-las-vegas",
            "Bellagio",
            aria,
            requested,
        )
        self.assertFalse(matched)
        self.assertEqual(reason, "canonical_room_path_mismatch")

    def test_source_owned_room_redirect_returns_quarantine_not_html(self):
        requested = (
            "https://www.pokeratlas.com/poker-room/"
            "ccg-poker-burr-ridge/cash-games"
        )
        final = (
            "https://www.pokeratlas.com/poker-room/"
            "ccg-poker-west-chicago/cash-games"
        )
        response = types.SimpleNamespace(
            status=200,
            url=final,
            html_content=(
                "<html><head><title>CCG Poker West Chicago</title></head>"
                "<body><h1>CCG Poker West Chicago</h1>"
                "<li class='cash-games-list-item'>$1/$2 NLH</li>"
                "</body></html>"
            ),
            body=b"",
        )
        manager = daemon.PokerAtlasSessionManager()
        manager.session = types.SimpleNamespace(fetch=lambda *args, **kwargs: response)

        result = manager.fetch_page(
            requested,
            expected_slug="ccg-poker-burr-ridge",
            expected_name="CCG Poker Burr Ridge",
        )

        self.assertIsInstance(result, daemon.RoomIdentityQuarantine)
        self.assertEqual(result.expected_slug, "ccg-poker-burr-ridge")
        self.assertEqual(result.reason, "final_room_path_mismatch")
        self.assertEqual(result.final_url, final)

    def test_body_only_room_mismatch_remains_transient_and_retryable(self):
        requested = (
            "https://www.pokeratlas.com/poker-room/"
            "bellagio-las-vegas/cash-games"
        )
        response = types.SimpleNamespace(
            status=200,
            url=requested,
            html_content=(
                "<html><head><title>ARIA Resort & Casino Poker Room</title></head>"
                "<body><h1>ARIA Resort & Casino</h1>"
                "<li class='cash-games-list-item'>$1/$3 NLH</li>"
                "</body></html>"
            ),
            body=b"",
        )
        manager = daemon.PokerAtlasSessionManager()
        manager.session = types.SimpleNamespace(fetch=lambda *args, **kwargs: response)

        result = manager.fetch_page(
            requested,
            expected_slug="bellagio-las-vegas",
            expected_name="Bellagio",
        )

        self.assertIsNone(result)

    def test_quarantined_room_advances_but_transient_failure_retries(self):
        venues = [
            {
                "slug": "ccg-poker-burr-ridge",
                "name": "CCG Poker Burr Ridge",
                "discovered_from": "https://www.pokeratlas.com/poker-rooms/illinois",
            },
            {
                "slug": "next-room",
                "name": "Next Room",
                "discovered_from": "https://www.pokeratlas.com/poker-rooms/illinois",
            },
        ]
        mismatch = daemon.RoomIdentityQuarantine(
            "ccg-poker-burr-ridge",
            "CCG Poker Burr Ridge",
            "final_room_path_mismatch",
            (
                "https://www.pokeratlas.com/poker-room/"
                "ccg-poker-west-chicago/cash-games"
            ),
        )

        with TemporaryDirectory() as tmp:
            base = Path(tmp)
            manager = _Manager([mismatch, None])
            with self._cycle_context(base):
                with mock.patch.object(daemon, "load_pa_venues", return_value=venues):
                    with mock.patch.object(daemon, "sb_delete") as delete:
                        result = daemon.run_scrape_cycle(manager)

            state = json.loads(
                (base / "data" / "pokeratlas-sweep-state.json").read_text()
            )
            quarantine = json.loads(
                (
                    base / "data" / "pokeratlas-room-identity-quarantine.json"
                ).read_text()
            )

        self.assertEqual(result["run_status"], daemon.RUN_FAILED)
        self.assertFalse(result["healthy_progress"])
        self.assertEqual(state["cursor"], 1)
        self.assertEqual(
            quarantine["rooms"]["ccg-poker-burr-ridge"]["reason"],
            "final_room_path_mismatch",
        )
        self.assertEqual(
            quarantine["rooms"]["ccg-poker-burr-ridge"]["map_fingerprint"],
            daemon._venue_map_fingerprint(venues),
        )
        self.assertNotIn("next-room", quarantine["rooms"])
        delete.assert_not_called()

    def test_fresh_map_bound_tombstone_is_a_healthy_audited_exclusion(self):
        venues = [
            {
                "slug": "ccg-poker-burr-ridge",
                "name": "CCG Poker Burr Ridge",
                "discovered_from": "https://www.pokeratlas.com/poker-rooms/illinois",
            },
            {
                "slug": "next-room",
                "name": "Next Room",
                "discovered_from": "https://www.pokeratlas.com/poker-rooms/illinois",
            },
        ]
        mismatch = daemon.RoomIdentityQuarantine(
            "ccg-poker-burr-ridge",
            "CCG Poker Burr Ridge",
            "final_room_path_mismatch",
            (
                "https://www.pokeratlas.com/poker-room/"
                "ccg-poker-west-chicago/cash-games"
            ),
        )
        with TemporaryDirectory() as tmp:
            base = Path(tmp)
            quarantine_path = (
                base / "data" / "pokeratlas-room-identity-quarantine.json"
            )
            self.assertTrue(daemon._record_room_identity_quarantine(
                quarantine_path,
                mismatch,
                (
                    "https://www.pokeratlas.com/poker-room/"
                    "ccg-poker-burr-ridge/cash-games"
                ),
                "00000000-0000-0000-0000-000000000123",
                daemon._venue_map_fingerprint(venues),
            ))
            manager = _Manager([daemon.NO_CASH_PAGE])
            with self._cycle_context(base):
                with mock.patch.object(daemon, "load_pa_venues", return_value=venues):
                    with mock.patch.object(daemon, "sb_delete", return_value=True):
                        with mock.patch.object(daemon, "sb_has_rows", return_value=False):
                            result = daemon.run_scrape_cycle(manager)

        self.assertEqual(result["run_status"], daemon.RUN_VALID_EMPTY)
        self.assertTrue(result["healthy_progress"])
        self.assertEqual(len(manager.fetch_urls), 1)
        self.assertTrue(manager.fetch_urls[0].endswith("/next-room/cash-games"))

    def test_unwritable_identity_quarantine_keeps_cursor_for_retry(self):
        mismatch = daemon.RoomIdentityQuarantine(
            "test-room",
            "Test Room",
            "canonical_room_path_mismatch",
            "https://www.pokeratlas.com/poker-room/other-room/cash-games",
        )
        with TemporaryDirectory() as tmp:
            base = Path(tmp)
            manager = _Manager([mismatch])
            with self._cycle_context(base):
                with mock.patch.object(
                    daemon, "_record_room_identity_quarantine", return_value=False,
                ):
                    with mock.patch.object(daemon, "sb_delete") as delete:
                        result = daemon.run_scrape_cycle(manager)

            state = json.loads(
                (base / "data" / "pokeratlas-sweep-state.json").read_text()
            )

        self.assertEqual(result["run_status"], daemon.RUN_FAILED)
        self.assertEqual(state["cursor"], 0)
        delete.assert_not_called()

    def test_checkpoint_failure_aborts_before_browser_or_database_work(self):
        with TemporaryDirectory() as tmp:
            base = Path(tmp)
            manager = _Manager([daemon.NO_CASH_PAGE])
            with self._cycle_context(base):
                with mock.patch.object(daemon, "_atomic_json_write", return_value=False):
                    with mock.patch.object(daemon, "sb_delete") as delete:
                        result = daemon.run_scrape_cycle(manager)

            self.assertFalse(result["healthy_progress"])
            self.assertEqual(manager.ensure_calls, 0)
            delete.assert_not_called()

    def test_map_change_resets_cursor_and_does_not_cleanup_abandoned_sweep(self):
        with TemporaryDirectory() as tmp:
            base = Path(tmp)
            old, state_path = self._write_sweep_state(
                base,
                map_fingerprint="outdated-map",
                cursor=0,
                phase="cleanup",
            )
            manager = _Manager([None])
            with self._cycle_context(base):
                with mock.patch.object(daemon, "sb_delete") as delete:
                    result = daemon.run_scrape_cycle(manager)

            state = json.loads(state_path.read_text(encoding="utf-8"))
            self.assertEqual(result["run_status"], daemon.RUN_FAILED)
            self.assertEqual(state["cursor"], 0)
            self.assertEqual(state["phase"], "scan")
            self.assertNotEqual(state["sweep_batch_id"], old["sweep_batch_id"])
            delete.assert_not_called()

    def test_completed_explicit_empty_sweep_deletes_and_verifies_legacy_rows(self):
        with TemporaryDirectory() as tmp:
            base = Path(tmp)
            manager = _Manager([daemon.NO_CASH_PAGE])
            queries = []
            with self._cycle_context(base):
                with mock.patch.object(
                    daemon, "sb_delete", side_effect=lambda table, query: queries.append(query) or True
                ):
                    with mock.patch.object(daemon, "sb_has_rows", return_value=False):
                        result = daemon.run_scrape_cycle(manager)

            self.assertEqual(result["run_status"], daemon.RUN_VALID_EMPTY)
            self.assertTrue(result["healthy_progress"])
            self.assertIn("scrape_batch_id.is.null", queries[0])

    def test_source_explicit_no_info_page_advances_without_live_zero(self):
        explicit_empty = """
          <h2>Cash Games Offered</h2>
          <p>Currently we don't have any cash game information for Test Room.</p>
        """
        with TemporaryDirectory() as tmp:
            base = Path(tmp)
            manager = _Manager([explicit_empty])
            with self._cycle_context(base):
                with mock.patch.object(daemon, "sb_delete", return_value=True):
                    with mock.patch.object(daemon, "sb_has_rows", return_value=False):
                        result = daemon.run_scrape_cycle(manager)

            cache = json.loads(
                (base / "data" / "pokeratlas-nocash-venues.json").read_text()
            )
            self.assertEqual(result["run_status"], daemon.RUN_VALID_EMPTY)
            self.assertTrue(result["healthy_progress"])
            self.assertIn("test-room", cache)

    def test_cleanup_retry_skips_browser_and_reports_maintenance(self):
        with TemporaryDirectory() as tmp:
            base = Path(tmp)
            self._write_sweep_state(base, had_persisted_rows=True)
            manager = _Manager()
            with self._cycle_context(base):
                with mock.patch.object(daemon, "sb_delete", return_value=True):
                    with mock.patch.object(daemon, "sb_has_rows", return_value=False):
                        result = daemon.run_scrape_cycle(manager)

            self.assertEqual(result["run_status"], daemon.RUN_MAINTENANCE)
            self.assertTrue(result["healthy_progress"])
            self.assertEqual(manager.ensure_calls, 0)

    def test_failed_cleanup_remains_checkpointed_for_retry(self):
        with TemporaryDirectory() as tmp:
            base = Path(tmp)
            _, state_path = self._write_sweep_state(base)
            manager = _Manager()
            with self._cycle_context(base):
                with mock.patch.object(daemon, "sb_delete", return_value=False):
                    result = daemon.run_scrape_cycle(manager)

            state = json.loads(state_path.read_text(encoding="utf-8"))
            self.assertEqual(result["run_status"], daemon.RUN_FAILED)
            self.assertEqual(state["phase"], "cleanup")
            self.assertEqual(manager.ensure_calls, 0)

    def test_next_sweep_checkpoint_failure_makes_cleanup_unhealthy(self):
        with TemporaryDirectory() as tmp:
            base = Path(tmp)
            old, state_path = self._write_sweep_state(base)
            manager = _Manager()
            with self._cycle_context(base):
                original_write = daemon._atomic_json_write

                def fail_next_sweep_state(path, payload):
                    if (
                        Path(path) == state_path
                        and payload.get("phase") == "scan"
                        and payload.get("sweep_batch_id") != old["sweep_batch_id"]
                    ):
                        return False
                    return original_write(path, payload)

                with mock.patch.object(daemon, "_atomic_json_write", side_effect=fail_next_sweep_state):
                    with mock.patch.object(daemon, "sb_delete", return_value=True):
                        with mock.patch.object(daemon, "sb_has_rows", return_value=False):
                            result = daemon.run_scrape_cycle(manager)

            self.assertEqual(result["run_status"], daemon.RUN_FAILED)
            self.assertFalse(result["healthy_progress"])
            retained = json.loads(state_path.read_text(encoding="utf-8"))
            self.assertEqual(retained["phase"], "cleanup")
            self.assertEqual(retained["sweep_batch_id"], old["sweep_batch_id"])

    def test_catalog_fully_covered_by_bravo_is_maintenance_not_valid_empty(self):
        with TemporaryDirectory() as tmp:
            base = Path(tmp)
            self._write_sweep_state(
                base,
                had_catalog_data=True,
                had_persisted_rows=False,
            )
            manager = _Manager()
            with self._cycle_context(base):
                with mock.patch.object(daemon, "sb_delete", return_value=True):
                    with mock.patch.object(daemon, "sb_has_rows", return_value=False):
                        result = daemon.run_scrape_cycle(manager)

            self.assertEqual(result["run_status"], daemon.RUN_MAINTENANCE)

    def test_metric_insert_failure_degrades_outcome_and_heartbeat(self):
        with TemporaryDirectory() as tmp:
            base = Path(tmp)
            self._write_sweep_state(base, had_persisted_rows=True)
            manager = _Manager()
            with self._cycle_context(base):
                with mock.patch.object(daemon, "sb_delete", return_value=True):
                    with mock.patch.object(daemon, "sb_has_rows", return_value=False):
                        with mock.patch.object(
                            daemon, "write_scraper_metric", return_value=False,
                        ):
                            with mock.patch.object(
                                daemon, "write_heartbeat",
                            ) as heartbeat:
                                result = daemon.run_scrape_cycle(manager)

        self.assertEqual(result["run_status"], daemon.RUN_FAILED)
        self.assertFalse(result["healthy_progress"])
        final_status, payload = heartbeat.call_args.args
        self.assertEqual(final_status, "save_failed")
        self.assertTrue(payload["metrics_insert_failed"])
        self.assertEqual(payload["run_status"], daemon.RUN_FAILED)

    def test_catalog_dedupes_whitespace_and_preserves_unknown_waitlist(self):
        payload = daemon.build_payload_from_results([{
            "venue_name": "Test Room",
            "venue_slug": "test-room",
            "scrape_timestamp": "2026-09-06T12:00:00+00:00",
            "scrape_html_hash": "abc123",
            "live_games": [
                {"game": "  1/3   No Limit Holdem  ", "buyin": "$100-$500", "runs": "Daily"},
                {"game": "1/3 No Limit Holdem", "buyin": "$100-$500", "runs": "Daily"},
            ],
            "waitlist": [],
        }], "00000000-0000-0000-0000-000000000123")

        self.assertEqual(len(payload), 1)
        self.assertEqual(payload[0]["game_name"], "1/3 No Limit Holdem")
        self.assertIsNone(payload[0]["tables_running"])
        self.assertIsNone(payload[0]["players_waiting"])

    def test_explicit_zero_waitlist_is_not_converted_to_unknown(self):
        payload = daemon.build_payload_from_results([{
            "venue_name": "Test Room",
            "venue_slug": "test-room",
            "scrape_timestamp": "2026-09-06T12:00:00+00:00",
            "scrape_html_hash": "abc123",
            "live_games": [{"game": "1/3 NLH", "buyin": "", "runs": ""}],
            "waitlist": [{"game": "1/3 NLH", "players_waiting": 0}],
        }], "00000000-0000-0000-0000-000000000123")

        self.assertEqual(payload[0]["players_waiting"], 0)

    def test_parser_only_emits_waitlist_when_source_label_is_present(self):
        html = """
        <li class="cash-games-list-item cds-item">
          <h2 class="venue-name">Test Room</h2>
          <div class="uber-row title"><ul><li> 1/3   NLH </li></ul></div>
          <span class="label">Runs:</span> Daily</li>
        </li>
        <li class="cash-games-list-item cds-item">
          <h2 class="venue-name">Other Room</h2>
          <div class="uber-row title"><ul><li>2/5 NLH</li></ul></div>
          <span class="label">Players Waiting:</span> 0</li>
        </li>
        """
        venues, _, _ = daemon.extract_games_from_region(html, "texas")
        by_name = {venue["venue_name"]: venue for venue in venues}

        self.assertEqual(by_name["Test Room"]["live_games"][0]["game"], "1/3 NLH")
        self.assertEqual(by_name["Test Room"]["waitlist"], [])
        self.assertEqual(
            by_name["Other Room"]["waitlist"],
            [{"game": "2/5 NLH", "players_waiting": 0}],
        )

    def test_process_lock_allows_only_one_writer(self):
        with TemporaryDirectory() as tmp:
            lock_path = Path(tmp) / "daemon.lock"
            with mock.patch.object(daemon, "DAEMON_LOCK_FILE", lock_path):
                first = daemon._acquire_daemon_lock()
                self.addCleanup(first.close)
                second = daemon._acquire_daemon_lock()

            self.assertIsNone(second)

    def test_history_replay_uses_same_ids_and_snapshot_time(self):
        venue = {
            "venue_name": "Test Room",
            "venue_slug": "test-room",
            "live_games": [{"game": "$1/$3 NLH", "buyin": "$100-$500"}],
            "waitlist": [],
        }
        writes = []

        def capture(table, rows, **kwargs):
            writes.append((table, rows))
            return len(rows)

        with mock.patch.object(daemon, "sb_upsert", side_effect=capture):
            self.assertTrue(daemon.save_history_snapshot(
                "00000000-0000-0000-0000-000000000123",
                [venue],
                snapshot_time="2026-09-06T12:00:00+00:00",
            ))
            self.assertTrue(daemon.save_game_history_snapshot(
                "00000000-0000-0000-0000-000000000123",
                [venue],
                snapshot_time="2026-09-06T12:00:00+00:00",
            ))
            self.assertTrue(daemon.save_history_snapshot(
                "00000000-0000-0000-0000-000000000123",
                [venue],
                snapshot_time="2026-09-06T12:00:00+00:00",
            ))
            self.assertTrue(daemon.save_game_history_snapshot(
                "00000000-0000-0000-0000-000000000123",
                [venue],
                snapshot_time="2026-09-06T12:00:00+00:00",
            ))

        first_venue, first_game, replay_venue, replay_game = [rows[0] for _, rows in writes]
        self.assertEqual(first_venue["id"], replay_venue["id"])
        self.assertEqual(first_game["id"], replay_game["id"])
        self.assertEqual(first_venue["snapshot_time"], replay_venue["snapshot_time"])
        self.assertEqual(first_game["snapshot_time"], replay_game["snapshot_time"])

    def test_commit_then_timeout_retries_without_duplicate_confirmation(self):
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
            daemon.urllib.request, "urlopen", side_effect=commit_then_respond
        ):
            with mock.patch.object(daemon.time, "sleep"):
                saved = daemon.sb_upsert("venue_live_tables", [self.row])

        self.assertEqual(saved, 1)
        self.assertEqual(len(stored), 1)
        self.assertEqual(len(requests), 2)
        self.assertEqual(requests[0].data, requests[1].data)
        self.assertEqual(
            requests[0].get_header("Prefer"),
            "resolution=merge-duplicates,return=representation",
        )

    def test_unconfirmed_response_is_retried_and_returns_zero(self):
        with mock.patch.object(
            daemon.urllib.request, "urlopen", return_value=_Response([])
        ) as urlopen:
            with mock.patch.object(daemon.time, "sleep"):
                saved = daemon.sb_upsert("venue_live_tables", [self.row])

        self.assertEqual(saved, 0)
        self.assertEqual(urlopen.call_count, 3)

    def test_wrong_returned_id_is_not_counted_as_persisted(self):
        with mock.patch.object(
            daemon.urllib.request,
            "urlopen",
            return_value=_Response([{**self.row, "id": -999}]),
        ) as urlopen:
            with mock.patch.object(daemon.time, "sleep"):
                saved = daemon.sb_upsert("venue_live_tables", [self.row])

        self.assertEqual(saved, 0)
        self.assertEqual(urlopen.call_count, 3)

    def test_expected_plus_unexpected_ids_is_not_accepted(self):
        response = [{**self.row}, {**self.row, "id": -999}]
        with mock.patch.object(
            daemon.urllib.request,
            "urlopen",
            return_value=_Response(response),
        ) as urlopen:
            with mock.patch.object(daemon.time, "sleep"):
                saved = daemon.sb_upsert("venue_live_tables", [self.row])

        self.assertEqual(saved, 0)
        self.assertEqual(urlopen.call_count, 3)

    def test_permanent_schema_rejection_fails_closed_without_retry(self):
        error = urllib.error.HTTPError(
            url="https://testproject.supabase.co/rest/v1/venue_live_tables",
            code=400,
            msg="Bad Request",
            hdrs=None,
            fp=io.BytesIO(b'{"message":"observation_kind does not exist"}'),
        )
        self.addCleanup(error.close)
        with mock.patch.object(
            daemon.urllib.request, "urlopen", side_effect=error
        ) as urlopen:
            with mock.patch.object(daemon.time, "sleep"):
                saved = daemon.sb_upsert("venue_live_tables", [self.row])

        self.assertEqual(saved, 0)
        self.assertEqual(urlopen.call_count, 1)


if __name__ == "__main__":
    unittest.main()
