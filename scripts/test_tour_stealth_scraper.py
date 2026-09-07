#!/usr/bin/env python3
"""Regression tests for the conservative tour-stop scraper contract."""

import unittest
from datetime import date
import io
import json
import sys
from unittest import mock

import tour_stealth_scraper as scraper
import scrape_tour_full_schedules as legacy_full
import scrape_tour_native as legacy_native
import scrape_tours_targeted as legacy_targeted


class TourStopExtractionTests(unittest.TestCase):
    def test_native_tour_writer_is_fail_disabled(self):
        event = {
            "tour_code": "MSPT",
            "event_number": 1,
            "event_name": "MSPT Main Event",
        }
        with mock.patch.object(legacy_native, "sb") as client:
            with self.assertRaisesRegex(RuntimeError, "retired native publisher"):
                legacy_native.seed_to_supabase(
                    [event], "MSPT", "00000000-0000-0000-0000-000000000001",
                )
        client.table.assert_not_called()

    def test_native_mspt_card_shift_and_guarantee_are_unpublishable(self):
        malformed = {
            "tour_code": "MSPT",
            "event_number": 511,
            "event_name": "MSPT Festival –",
            "stop_state": "Iowa MSPT Festival",
            "stop_start_date": None,
            "stop_end_date": None,
            "buy_in": 500000,
        }
        self.assertEqual(
            set(legacy_native.native_event_validation_errors(malformed, "MSPT")),
            {
                "missing_or_invalid_stop_start_date",
                "missing_or_invalid_stop_end_date",
                "invalid_stop_state",
                "invalid_buy_in",
            },
        )
        self.assertEqual(
            legacy_native.filter_publishable_native_events([malformed], "MSPT"),
            [],
        )

    def test_native_publisher_exits_before_fetch_without_dry_run(self):
        with mock.patch.object(sys, "argv", ["scrape_tour_native.py", "--tour", "MSPT"]), \
             mock.patch.object(legacy_native, "scrape_tour") as scrape:
            self.assertEqual(legacy_native.main(), 2)
        scrape.assert_not_called()

    def test_rejects_promotional_prize_copy_as_a_stop(self):
        page = """
          <section><h2>$50,000,000 GTD</h2>
          <p>Aug 23 - Sep 28, 2026</p></section>
          <section><h2>$100k Labor Day Giveaway</h2>
          <p>Sep 5 - 7, 2026</p></section>
        """
        self.assertEqual(
            scraper.extract_stops(page, "https://example.test/schedule", date(2026, 9, 6)),
            [],
        )

    def test_keeps_upcoming_stop_and_decodes_its_name(self):
        page = """
          <section><h2>Rivers Casino &amp; Resort Schenectady</h2>
          <p>Sep 18 - 28, 2026</p></section>
        """
        self.assertEqual(
            scraper.extract_stops(page, "https://example.test/schedule", date(2026, 9, 6)),
            [{
                "stop_name": "Rivers Casino & Resort Schenectady",
                "start": "2026-09-18",
                "end": "2026-09-28",
            }],
        )

    def test_ignores_dates_in_attributes_and_nearby_utility_ctas(self):
        page = """
          <section>
            <h2>WYNN SIGNATURE SERIES</h2>
            <h3 id="august-17-september-7">August 17-September 7, 2026</h3>
            <a href="/chip-counts"><span>CHIP COUNTS/REDRAWS</span></a>
            <img alt="Wynn Signature Series August 17-September 7, 2026">
          </section>
          <script>const hidden = "CHIP COUNTS/REDRAWS Aug 17-Sep 7, 2026";</script>
          <section>
            <h2>WYNN FALL CLASSIC</h2>
            <h3>September 28-October 25, 2026</h3>
          </section>
        """
        stops = scraper.extract_stops(
            page, "https://www.wynnlasvegas.com/casino/poker", date(2026, 9, 6)
        )
        self.assertEqual(
            stops,
            [
                {
                    "stop_name": "WYNN SIGNATURE SERIES",
                    "start": "2026-08-17",
                    "end": "2026-09-07",
                },
                {
                    "stop_name": "WYNN FALL CLASSIC",
                    "start": "2026-09-28",
                    "end": "2026-10-25",
                },
            ],
        )

    def test_filters_archived_ranges_but_keeps_recently_completed_stop(self):
        archived = "<h2>PokerStars Open Campione</h2><p>Jan 23 - Feb 1, 2026</p>"
        recent = "<h2>Wynn Signature Series</h2><p>Aug 25 - Sep 1, 2026</p>"
        self.assertEqual(
            scraper.extract_stops(archived, "https://example.test/schedule", date(2026, 9, 6)),
            [],
        )
        self.assertEqual(len(scraper.extract_stops(
            recent, "https://example.test/schedule", date(2026, 9, 6)
        )), 1)

    def test_recurring_stop_names_keep_distinct_start_dates(self):
        first = {"stop_name": "WPT Championship", "start": "2026-05-01", "end": "2026-05-10"}
        second = {"stop_name": "WPT Championship", "start": "2027-05-01", "end": "2027-05-10"}
        identities = {
            scraper.tour_stop_identity({
                "stop_name": stop["stop_name"], "stop_start_date": stop["start"],
            })
            for stop in (first, second)
        }
        self.assertEqual(len(identities), 2)

    def test_reconciliation_retires_only_same_source_future_inferred_rows(self):
        rows = [
            {
                "id": "retire-me",
                "stop_name": "Moved Classic",
                "stop_start_date": "2026-10-01",
                "stop_end_date": "2026-10-10",
                "data_quality": "scraped_inferred",
                "scrape_script": "tour_stealth_scraper.py",
                "source_url": "https://tour.test/schedule",
            },
            {
                "id": "keep-current",
                "stop_name": "Current Classic",
                "stop_start_date": "2026-11-01",
                "stop_end_date": "2026-11-10",
                "data_quality": "scraped_inferred",
                "scrape_script": "tour_stealth_scraper.py",
                "source_url": "https://tour.test/schedule",
            },
            {
                "id": "keep-curated",
                "stop_name": "Curated Stop",
                "stop_start_date": "2026-12-01",
                "stop_end_date": "2026-12-10",
                "data_quality": "manual_research",
                "scrape_script": "tour_stealth_scraper.py",
                "source_url": "https://tour.test/schedule",
            },
        ]
        current = [{
            "stop_name": "Current Classic",
            "start": "2026-11-01",
            "end": "2026-11-10",
        }]
        self.assertEqual(
            scraper.retirable_stop_ids(
                rows, current, "https://tour.test/schedule", date(2026, 9, 6)
            ),
            ["retire-me"],
        )

    def test_reappearing_stale_scraper_row_is_selected_for_exact_reactivation(self):
        current = [{
            "stop_name": "Returned Classic",
            "start": "2026-11-01",
            "end": "2026-11-10",
        }]
        rows = [{
            "id": "reactivate-me",
            "stop_name": "Returned Classic",
            "stop_start_date": "2026-11-01",
            "stop_end_date": "2026-11-10",
            "data_quality": "stale",
            "scrape_script": "tour_stealth_scraper.py",
            "source_url": "https://tour.test/schedule",
        }, {
            "id": "keep-curated-stale",
            "stop_name": "Returned Classic",
            "stop_start_date": "2026-11-01",
            "data_quality": "stale",
            "scrape_script": "manual_research.py",
            "source_url": "https://tour.test/schedule",
        }]
        matches = scraper.reactivatable_stop_matches(
            rows, current, "https://tour.test/schedule/",
        )
        self.assertEqual([row["id"] for row, _stop in matches], ["reactivate-me"])

    def test_curated_equivalent_blocks_duplicate_scraper_reactivation(self):
        current = [{
            "stop_name": "WYNN SIGNATURE SERIES",
            "start": "2026-08-17",
            "end": "2026-09-07",
        }]
        rows = [{
            "id": "quarantined-duplicate",
            "stop_name": "WYNN SIGNATURE SERIES",
            "stop_start_date": "2026-08-17",
            "stop_end_date": "2026-09-07",
            "data_quality": "stale",
            "scrape_script": "tour_stealth_scraper.py",
            "source_url": "https://www.wynnlasvegas.com/casino/poker",
        }, {
            "id": "curated-owner",
            "stop_name": "Wynn Signature Series (August 2026)",
            "stop_start_date": "2026-08-17",
            "stop_end_date": "2026-09-07",
            "data_quality": "manual_research",
            "scrape_script": None,
            "source_url": "https://www.wynnlasvegas.com/casino/poker",
        }]

        matches = scraper.reactivatable_stop_matches(
            rows, current, "https://www.wynnlasvegas.com/casino/poker",
        )

        self.assertEqual(matches, [])


class TourSourceContractTests(unittest.TestCase):
    def test_legacy_tour_publishers_are_fail_disabled(self):
        self.assertTrue(legacy_full.LEGACY_TOUR_WRITES_DISABLED)
        self.assertTrue(legacy_targeted.LEGACY_TOUR_WRITES_DISABLED)
        with mock.patch.object(legacy_full, "sb") as full_db:
            self.assertEqual(legacy_full.seed_to_supabase(
                [{"event_name": "Unsafe"}], "LIPS", "batch", False,
            ), 0)
        full_db.assert_not_called()
        with mock.patch.object(legacy_targeted, "sb") as targeted_db:
            self.assertEqual(legacy_targeted.seed_to_db(
                [{"event_name": "Unsafe"}], "LIPS", "batch", False,
            ), 0)
        targeted_db.assert_not_called()

    def test_legacy_parser_rejects_pokeratlas_tour_category_pages(self):
        page = b"""
          <html><head><title>CPPT Poker Tournaments</title></head>
          <body><h1>Card Player Poker Tour</h1>
          <div>$200 NLH Bounty South Point Casino</div></body></html>
        """
        self.assertFalse(legacy_full.source_page_matches_tour(
            page, "CPPT", "https://www.pokeratlas.com/poker-tournaments/cppt",
        ))
        self.assertEqual(legacy_full.parse_events_from_html(
            page, "CPPT", "https://www.pokeratlas.com/poker-tournaments/cppt", {},
        ), [])

    def test_legacy_parser_requires_source_owned_tour_identity(self):
        wrong = b"<title>World Poker Tour Schedule</title><h1>WPT Events</h1>"
        self.assertFalse(legacy_full.source_page_matches_tour(
            wrong, "WSOPC", "https://www.wsop.com/circuit/",
        ))
        valid = b"<title>WSOP Circuit Schedule</title><h1>WSOP Circuit</h1>"
        self.assertTrue(legacy_full.source_page_matches_tour(
            valid, "WSOPC", "https://www.wsop.com/circuit/",
        ))

    def test_registry_is_authoritative_without_builtin_top_up(self):
        rows = [{
            "tour_code": "WPT",
            "tour_name": "World Poker Tour",
            "schedule_url": "https://www.worldpokertour.com/schedule/",
            "official_website": None,
        }]
        with mock.patch.object(scraper, "sb_get", return_value=rows):
            self.assertEqual(scraper.load_tours(), [(
                "WPT", "World Poker Tour", "https://www.worldpokertour.com/schedule/",
            )])

    def test_unreadable_registry_fails_closed_without_stale_builtins(self):
        with mock.patch.object(scraper, "sb_get", return_value=None):
            self.assertEqual(scraper.load_tours(), [])

    def test_schedule_redirect_to_home_page_is_rejected(self):
        self.assertFalse(scraper.response_preserves_schedule_context(
            "https://tour.test/schedule/", "https://publisher.test/"
        ))
        self.assertTrue(scraper.response_preserves_schedule_context(
            "https://theborgata.com/casino/poker/tournaments",
            "https://borgata.mgmresorts.com/en/casino/poker.html",
        ))
        self.assertFalse(scraper.response_preserves_schedule_context(
            "https://tour.test/schedule/",
            "https://publisher.test/events/",
        ))
        self.assertFalse(scraper.response_preserves_schedule_context(
            "https://tour.test/schedule/",
            "https://tour.test/promotions/",
        ))

    def test_wsopc_request_rejects_generic_wpt_schedule_response(self):
        page = """
          <html><head><title>World Poker Tour Schedule</title>
          <link rel="canonical" href="https://www.wsop.com/tournaments/">
          </head><body><h1>WPT Tournament Schedule</h1>
          <section><h2>WPT Championship</h2>
          <p>September 18 - 28, 2099</p></section></body></html>
        """
        matched, reason = scraper.tour_page_identity(
            "WSOPC", "WSOP Circuit",
            "https://www.wsop.com/circuit/",
            "https://www.wsop.com/tournaments/",
            page,
        )
        self.assertFalse(matched)
        self.assertEqual(reason, "tour_identity_mismatch")

    def test_wsopc_generic_exact_route_still_requires_wsopc_identity(self):
        page = """
          <html><head><title>World Poker Tour Schedule</title>
          <link rel="canonical" href="https://www.wsop.com/tournaments/">
          </head><body><h1>WPT Tournament Schedule</h1>
          <section><h2>WPT Championship</h2>
          <p>September 18 - 28, 2099</p></section></body></html>
        """
        matched, reason = scraper.tour_page_identity(
            "WSOPC", "WSOP Circuit",
            "https://www.wsop.com/tournaments/",
            "https://www.wsop.com/tournaments/",
            page,
        )
        self.assertFalse(matched)
        self.assertEqual(reason, "tour_identity_mismatch")

    def test_cross_host_schedule_requires_source_owned_tour_identity(self):
        page = """
          <title>Borgata Poker Series Schedule</title>
          <h1>Borgata Poker Series</h1>
        """
        matched, reason = scraper.tour_page_identity(
            "BORGATA", "Borgata Poker Series",
            "https://www.theborgata.com/casino/poker/tournaments",
            "https://borgata.mgmresorts.com/en/casino/poker.html",
            page,
        )
        self.assertTrue(matched)
        self.assertEqual(reason, "source_owned_tour_code")

    def test_rows_are_inferred_and_have_exact_source_provenance(self):
        row = scraper.build_stop_row(
            "AUPT",
            {"stop_name": "Rivers Casino", "start": "2026-09-18", "end": "2026-09-28"},
            "https://anteupmagazine.com/where-to-play/tour/",
            "a" * 64,
            "2026-09-06T18:00:00+00:00",
        )
        self.assertEqual(row["data_quality"], "scraped_inferred")
        self.assertEqual(row["source_url"], row["scrape_url"])
        self.assertEqual(row["scrape_html_hash"], "a" * 64)

    def test_registry_patch_requires_one_confirmed_row(self):
        class Response:
            def __init__(self, rows):
                self.body = io.BytesIO(json.dumps(rows).encode())

            def __enter__(self):
                return self

            def __exit__(self, *_args):
                return False

            def read(self):
                return self.body.read()

        with mock.patch.object(
            scraper.urllib.request, "urlopen", return_value=Response([{"tour_code": "AUPT"}]),
        ):
            self.assertTrue(scraper.sb_patch("tour_source_registry", "tour_code=eq.AUPT", {}))
        with mock.patch.object(
            scraper.urllib.request, "urlopen", return_value=Response([]),
        ):
            self.assertFalse(scraper.sb_patch("tour_source_registry", "tour_code=eq.MISSING", {}))

    def test_registry_success_timestamp_is_never_sent_with_initial_status_patch(self):
        calls = []

        def patch(_table, filt, payload):
            calls.append((filt, payload))
            return len(calls) == 1

        with mock.patch.object(scraper, "sb_patch", side_effect=patch):
            self.assertFalse(scraper.update_tour_registry(
                "WSOPC", "2099-09-01T12:00:00+00:00", "active", 3,
            ))
        self.assertEqual(calls[0][1]["scrape_status"], "active")
        self.assertNotIn("last_successful_scrape", calls[0][1])
        self.assertTrue(any(
            payload.get("scrape_status") == "error" for _filt, payload in calls[2:]
        ))

    def test_write_failure_keeps_registry_error_and_final_heartbeat_degraded(self):
        class Session:
            def close(self):
                pass

        page = (
            "<html><head><title>WSOP Circuit Schedule</title></head><body>"
            "<h1>WSOP Circuit Poker Tournament Schedule</h1>"
            "<section><h2>WSOP Circuit Main Event</h2>"
            "<p>September 18 - 28, 2099</p><p>Buy-in event schedule</p>"
            "</section>" + (" poker tournament schedule event " * 80) + "</body></html>"
        )
        session = Session()
        registry_updates = []
        heartbeats = []
        with mock.patch.object(sys, "argv", ["tour_stealth_scraper.py"]), \
             mock.patch.object(scraper, "SUPABASE_KEY", "offline-key"), \
             mock.patch.object(
                 scraper, "load_tours", return_value=[(
                     "WSOPC", "WSOP Circuit", "https://www.wsop.com/circuit/",
                 )],
             ), \
             mock.patch.object(scraper, "create_session", return_value=session), \
             mock.patch.object(
                 scraper, "fetch_page", return_value=(
                     page, "a" * 64, session, "https://www.wsop.com/circuit/",
                 ),
             ), \
             mock.patch.object(scraper, "sb_get", return_value=[]), \
             mock.patch.object(scraper, "sb_insert", return_value=0), \
             mock.patch.object(
                 scraper, "update_tour_registry",
                 side_effect=lambda *args: registry_updates.append(args) or True,
             ), \
             mock.patch.object(
                 scraper, "write_heartbeat",
                 side_effect=lambda **kw: heartbeats.append(kw),
             ), \
             mock.patch.object(scraper.time, "sleep"):
            with self.assertRaises(SystemExit) as stopped:
                scraper.main()

        self.assertEqual(stopped.exception.code, 1)
        self.assertEqual(registry_updates[-1][2], "error")
        self.assertEqual(heartbeats[0]["status"], "running")
        self.assertEqual(heartbeats[0]["run_status"], "progress")
        self.assertEqual(heartbeats[-1]["status"], "degraded")
        self.assertEqual(heartbeats[-1]["run_status"], "failed")
        self.assertGreater(heartbeats[-1]["errors"], 0)


if __name__ == "__main__":
    unittest.main()
