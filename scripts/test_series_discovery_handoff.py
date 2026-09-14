#!/usr/bin/env python3
"""Exercise the discovery database-to-master handoff without network or writes."""
import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest import mock

os.environ["SUPABASE_SERVICE_ROLE_KEY"] = "offline-handoff-test-no-authority"
os.environ["SUPABASE_KEY"] = "offline-handoff-test-no-authority"

import scrape_poker_series_discovery as discovery
import poker_series_scraper as scraper


class DiscoverySourceHandoffTests(unittest.TestCase):
    def setUp(self):
        network = mock.patch(
            "urllib.request.urlopen",
            side_effect=AssertionError("Offline handoff test attempted network access"),
        )
        network.start()
        self.addCleanup(network.stop)

    def fetch_records(self, rows):
        def read(table, columns, filters):
            if table == "poker_series":
                # Emulate PostgREST projection: an omitted selected column
                # cannot accidentally survive in an over-generous test double.
                return [{k: row.get(k) for k in columns.split(",")} for row in rows]
            return []
        with mock.patch.object(discovery, "sb_get_paged", side_effect=read):
            return discovery.fetch_db_known_series()[1]

    def test_actual_selected_columns_retain_source_and_stable_parent(self):
        records = self.fetch_records([{
            "series_uid": "disc_fall-open-2099", "series_name": "Fall Open 2099",
            "source_url": "https://example.test/2099/fall-open",
            "scrape_url": "https://example.test/obsolete",
            "source": "publisher_listing",
        }])
        self.assertEqual(records[0]["id"], "disc_fall-open-2099")
        self.assertEqual(records[0].get("source_url"), "https://example.test/2099/fall-open")
        self.assertEqual(records[0].get("scrape_source"), "publisher_listing")

    def test_legacy_scrape_url_is_retained_when_source_url_is_empty(self):
        records = self.fetch_records([{
            "series_uid": "legacy-42", "series_name": "Legacy Open 2099",
            "source_url": None, "scrape_url": "https://example.test/legacy",
            "source": None,
        }])
        self.assertEqual(records[0].get("source_url"), "https://example.test/legacy")
        self.assertEqual(records[0].get("scrape_source"), "")

    def test_missing_identity_and_url_are_not_invented(self):
        records = self.fetch_records([{
            "series_uid": None, "series_name": "Unaddressed Open 2099",
            "source_url": None, "scrape_url": None, "source": None,
        }])
        self.assertIsNone(records[0]["id"])
        self.assertEqual(records[0].get("source_url"), "")
        self.assertEqual(records[0].get("scrape_source"), "")

    def test_database_export_and_actual_consumer_preserve_the_same_source(self):
        row = {
            "series_uid": "disc_fall-open-2099", "series_name": "Fall Open 2099",
            "source_url": "https://example.test/fall?edition=2099&room=one",
            "scrape_url": None, "source": "publisher_listing",
            "is_suppressed": False,
        }
        records = self.fetch_records([row])
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "master.json"
            with (
                mock.patch.object(discovery, "MASTER_LIST", path),
                mock.patch.object(scraper, "MASTER_LIST", path),
                mock.patch.object(scraper, "sb_get_paged", return_value=[row]),
                mock.patch.object(discovery, "sb_deactivate_by_id") as deactivate,
            ):
                discovery.build_master_list_and_dedup(records, [])
                exported = json.loads(path.read_text())["master_list"][0]
                consumed = scraper.load_missing_series(force=True)[0]
            deactivate.assert_not_called()
        self.assertEqual(exported["source_url"], row["source_url"])
        self.assertEqual(exported["scrape_source"], row["source"])
        self.assertEqual(consumed["source_url"], row["source_url"])
        self.assertEqual(consumed["id"], row["series_uid"])

    def test_source_handoff_keeps_database_quarantine_effective(self):
        row = {
            "series_uid": "quarantined-42", "series_name": "Quarantined Open 2099",
            "source_url": "https://example.test/quarantined",
            "is_suppressed": True,
        }
        records = self.fetch_records([row])
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "master.json"
            with (
                mock.patch.object(discovery, "MASTER_LIST", path),
                mock.patch.object(scraper, "MASTER_LIST", path),
                mock.patch.object(scraper, "sb_get_paged", return_value=[row]),
            ):
                discovery.build_master_list_and_dedup(records, [])
                self.assertEqual(scraper.load_missing_series(filter_slug="quarantined"), [])


if __name__ == "__main__":
    unittest.main()
