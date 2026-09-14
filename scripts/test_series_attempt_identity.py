"""Actual unresolved-attempt writer and discovery/consumer identity contracts."""
import io
import json
import os
import sys
import tempfile
import types
import unittest
from pathlib import Path
from unittest import mock
from urllib.parse import parse_qs, urlsplit

sys.path.insert(0, str(Path(__file__).resolve().parent))
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "offline-test-key")
import poker_series_scraper as scraper
import scrape_poker_series_discovery as discovery


class SeriesAttemptIdentityTests(unittest.TestCase):
    def setUp(self):
        for key in scraper.RUN_ERRORS:
            scraper.RUN_ERRORS[key] = 0

    def write_attempt(self, series, *, parents=None, audit_ack=True, patch_ack=True):
        requests = []

        def serve(request, timeout):
            parsed = urlsplit(request.full_url)
            query = parse_qs(parsed.query)
            body = json.loads(request.data) if request.data else None
            requests.append((request.get_method(), parsed.path, query, body))
            if parsed.path.endswith("/data_audit_log"):
                self.assertEqual("POST", request.get_method())
                self.assertEqual("series_scrape_unresolved", body["action"])
                return io.BytesIO(json.dumps([body] if audit_ack else []).encode())
            if request.get_method() == "GET":
                return io.BytesIO(json.dumps(parents or []).encode())
            self.assertEqual("PATCH", request.get_method())
            self.assertEqual({"scrape_status": "failed"}, body)
            self.assertEqual(["not.is.true"], query["is_suppressed"])
            uid = None if query["series_uid"] == ["is.null"] else query["series_uid"][0][3:]
            identity = int(query["id"][0][3:])
            return io.BytesIO(json.dumps(
                [{"id": identity, "series_uid": uid}] if patch_ack else []
            ).encode())

        with mock.patch.object(scraper.urllib.request, "urlopen", side_effect=serve):
            ok = scraper.sb_record_unresolved_series(
                series, {"found": False, "flags": ["no_matching_events"]},
                "72e7d088-68b0-4e99-a45c-6199b8f6d7f",
            )
        return ok, requests

    def test_new_discovery_keeps_a_durable_attempt_without_updating_a_missing_parent(self):
        row = {"id": "pa_new-series", "name": "New Series", "source_url": "https://example.test/series"}
        ok, requests = self.write_attempt(row)
        self.assertTrue(ok)
        self.assertEqual(["POST", "GET"], [r[0] for r in requests])
        self.assertEqual(row, requests[0][3]["new_data"]["catalog"])
        self.assertEqual(0, requests[0][3]["new_data"]["events_written"])
        self.assertEqual(0, scraper.RUN_ERRORS["patch_failed"])
        self.assertTrue(scraper.record_unresolved_series_attempt({"found": False}))
        self.assertEqual(1, scraper.RUN_ERRORS["series_errors"])

    def test_null_uid_updates_only_the_real_primary_row_and_keeps_curated_provenance(self):
        ok, requests = self.write_attempt({"id": None, "database_id": 980, "name": "Borgata"})
        self.assertTrue(ok)
        self.assertEqual(["POST", "PATCH"], [r[0] for r in requests])
        self.assertEqual(["eq.980"], requests[-1][2]["id"])
        self.assertEqual(["is.null"], requests[-1][2]["series_uid"])
        self.assertIsNone(requests[0][3]["new_data"]["series_uid"])
        self.assertNotIn("scrape_timestamp", requests[-1][3])

    def test_existing_uid_is_bound_to_exact_primary_identity(self):
        uid = "pa_one&or=(id.gt.0)"
        ok, requests = self.write_attempt({"id": uid}, parents=[{"id": 24, "series_uid": uid}])
        self.assertTrue(ok)
        self.assertEqual(["eq." + uid], requests[-1][2]["series_uid"])
        self.assertEqual(["eq.24"], requests[-1][2]["id"])

    def test_missing_attempt_receipt_is_a_failure_and_prevents_status_writes(self):
        ok, requests = self.write_attempt({"id": "pa_one", "database_id": 24}, audit_ack=False)
        self.assertFalse(ok)
        self.assertEqual(1, len(requests))
        self.assertEqual(1, scraper.RUN_ERRORS["patch_failed"])

    def test_deleted_or_rekeyed_parent_is_still_a_real_failure(self):
        ok, requests = self.write_attempt({"id": "pa_one", "database_id": 24, "_db_id": None}, patch_ack=False)
        self.assertFalse(ok)
        self.assertEqual(2, len(requests))
        self.assertEqual(1, scraper.RUN_ERRORS["patch_failed"])

    def test_foreign_lookup_cannot_authorize_status_change(self):
        ok, requests = self.write_attempt({"id": "pa_one"}, parents=[{"id": 24, "series_uid": "pa_other"}])
        self.assertFalse(ok)
        self.assertNotIn("PATCH", [r[0] for r in requests])

    def test_missing_uid_never_fetches_an_invented_none_url(self):
        with mock.patch.object(scraper, "fetch_with_retry") as fetch:
            result = scraper.scrape_series({"id": None, "database_id": 980, "name": "Borgata"}, None, "batch")
        fetch.assert_not_called()
        self.assertFalse(result["found"])
        self.assertFalse(result["skipped"])
        self.assertEqual(["missing_series_uid"], result["flags"])

    def test_actual_run_routes_unresolved_identity_to_the_attempt_writer(self):
        row = {"id": None, "database_id": 980, "name": "Borgata"}
        fetchers = types.ModuleType("scrapling.fetchers")
        fetchers.StealthySession = object
        session = types.SimpleNamespace(close=lambda: None)
        with (mock.patch.dict(sys.modules, {"scrapling.fetchers": fetchers}),
              mock.patch.object(sys, "argv", ["scraper", "--series", "Borgata", "--pass-limit", "1"]),
              mock.patch.object(scraper, "network_ok", return_value=True),
              mock.patch.object(scraper, "create_session", return_value=session),
              mock.patch.object(scraper, "fetch_with_retry", return_value=("", 200, b"", "")),
              mock.patch.object(scraper, "load_missing_series", return_value=[row]),
              mock.patch.object(scraper.time, "sleep"),
              mock.patch.object(scraper, "sb_record_unresolved_series", return_value=True) as attempt,
              mock.patch.object(scraper, "sb_patch_series") as old_patch,
              mock.patch.object(scraper, "sb_audit", return_value=True)):
            scraper.main()
        old_patch.assert_not_called()
        self.assertEqual(1, attempt.call_count)
        self.assertEqual(row, attempt.call_args.args[0])
        self.assertEqual(["missing_series_uid"], attempt.call_args.args[1]["flags"])

    def test_actual_export_and_consumer_retain_distinct_null_uid_rows_and_quarantine(self):
        rows = [
            {"id": 980, "series_uid": None, "series_name": "Borgata Fall", "source_url": "https://example.test/fall", "is_suppressed": False},
            {"id": 981, "series_uid": None, "series_name": "Borgata Winter", "source_url": "https://example.test/winter", "is_suppressed": False},
            {"id": 982, "series_uid": None, "series_name": "Quarantined Open", "is_suppressed": True},
        ]
        def read(table, columns, filters):
            return [{key: r.get(key) for key in columns.split(",")} for r in rows] if table == "poker_series" else []
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "master.json"
            with (mock.patch.object(discovery, "sb_get_paged", side_effect=read),
                  mock.patch.object(discovery, "MASTER_LIST", path),
                  mock.patch.object(scraper, "MASTER_LIST", path),
                  mock.patch.object(scraper, "sb_get_paged", return_value=rows)):
                records = discovery.fetch_db_known_series()[1]
                discovery.build_master_list_and_dedup(records, [])
                self.assertEqual(3, len(scraper.merge_series_catalog(json.loads(path.read_text())["master_list"], [])))
                consumed = scraper.load_missing_series(force=True)
        self.assertEqual([980, 981], [r["database_id"] for r in consumed])
        self.assertEqual([980, 981], [r["_db_id"] for r in consumed])
        self.assertTrue(all(r["id"] is None for r in consumed))
        self.assertEqual(rows[0]["source_url"], consumed[0]["source_url"])


if __name__ == "__main__":
    unittest.main()
