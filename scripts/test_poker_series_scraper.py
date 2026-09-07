#!/usr/bin/env python3
"""Offline contract tests for live series discovery and source quarantine."""

import io
import json
import os
import sys
import unittest
from datetime import date
from pathlib import Path
from unittest import mock

SCRIPT_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPT_DIR))
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "offline-test-key")

import poker_series_scraper as scraper  # noqa: E402
from poker_series_scraper import (  # noqa: E402
    build_series_parent_record,
    build_series_parent_refresh_patch,
    extract_pa_series_listing,
    extract_pokeratlas_html_events,
    fetch_with_retry,
    merge_series_catalog,
    pa_series_page_matches,
    select_physical_series_venue,
    series_events_fit_parent_window,
    source_series_identity_matches,
    venue_page_confirms_series,
)


class PokerSeriesDiscoveryTests(unittest.TestCase):
    def tearDown(self):
        scraper.CURRENT_SESSION = None
        scraper.STOP_REQUESTED = False

    def test_listing_extracts_unique_canonical_series(self):
        page = """
        <a href="/poker-tournament-series/2026-daytona-beach-summer-classic-daytona-beach-2026">
          2026 Daytona Beach Summer Classic
        </a>
        <a href="https://www.pokeratlas.com/poker-tournament-series/rgps-golden-expedition-dc-mgm-national-harbor-2026?ref=list">
          RGPS: Golden Expedition D.C.
        </a>
        <a href="/poker-tournament-series/2026-daytona-beach-summer-classic-daytona-beach-2026">duplicate</a>
        <a href="/poker-tournament-series/search">Search</a>
        """
        rows = extract_pa_series_listing(page)
        self.assertEqual(2, len(rows))
        self.assertEqual(
            "pa_2026-daytona-beach-summer-classic-daytona-beach-2026",
            rows[0]["id"],
        )
        self.assertEqual("pokeratlas_live_listing", rows[1]["scrape_source"])

    def test_series_event_name_sanitizer_rejects_markup_and_decodes_entities(self):
        self.assertIsNone(scraper.sanitize_series_event_name("><head><meta charSet="))
        self.assertIsNone(scraper.sanitize_series_event_name("&gt;&lt;head&gt;"))
        self.assertIsNone(scraper.sanitize_series_event_name("script"))
        self.assertIsNone(scraper.sanitize_series_event_name("id="))
        self.assertEqual(
            "NLH w/Rebuys & Add-On",
            scraper.sanitize_series_event_name("NLH w/Rebuys &amp; Add-On"),
        )
        self.assertEqual(
            "High Roller - Final",
            scraper.sanitize_series_event_name("High Roller &mdash; Final"),
        )

    def test_event_dates_must_fit_the_exact_parent_series_window(self):
        series = {"start_date": "2099-09-10", "end_date": "2099-09-20"}
        self.assertEqual(
            series_events_fit_parent_window(
                series,
                [{"start_date": "2099-09-12", "end_date": "2099-09-13"}],
            ),
            (True, "matched"),
        )
        self.assertEqual(
            series_events_fit_parent_window(
                series, [{"start_date": "2099-08-01"}],
            ),
            (False, "event_start_date_outside_parent_window"),
        )

    def test_missing_parent_window_does_not_invent_date_bounds(self):
        self.assertEqual(
            series_events_fit_parent_window(
                {"start_date": None, "end_date": None},
                [{"start_date": "2099-08-01"}],
            ),
            (True, "parent_window_unavailable"),
        )

    def test_missing_scrapling_fails_closed_without_urllib_source_fetch(self):
        real_import = __import__

        def import_without_scrapling(name, *args, **kwargs):
            if name == "scrapling.fetchers":
                raise ImportError("scrapling unavailable")
            return real_import(name, *args, **kwargs)

        before = scraper.RUN_ERRORS["series_errors"]
        with mock.patch("builtins.__import__", side_effect=import_without_scrapling), mock.patch.object(
            scraper.urllib.request, "urlopen",
        ) as urlopen:
            result = scraper.scrapling_fetch("https://example.test/schedule")

        self.assertEqual(("", 0, b"", ""), result)
        self.assertEqual(before + 1, scraper.RUN_ERRORS["series_errors"])
        urlopen.assert_not_called()

    @staticmethod
    def _next_data_html(payload):
        return (
            '<script id="__NEXT_DATA__" type="application/json">'
            + json.dumps(payload)
            + "</script>"
        )

    def test_next_data_requires_an_explicit_event_collection(self):
        partial_html = (
            '<script id="__NEXT_DATA__" type="application/json">'
            + json.dumps({
                "props": {"pageProps": {"event": {
                    "name": "Partial Event", "buyIn": 300,
                    "startDate": "2026-10-01",
                }}},
            })
            + "</script>"
        )
        partial = scraper.pa_next_data_reconciliation_evidence(
            partial_html, [{"event_uid": "partial"}],
        )
        self.assertFalse(partial["complete"])
        self.assertEqual(partial["reason"], "no_explicit_event_collection")

    def test_next_data_without_declared_total_is_additive_only(self):
        events = [
            {"name": "Event One", "buyIn": 300, "startDate": "2026-10-01"},
            {"name": "Event Two", "buyIn": 400, "startDate": "2026-10-02"},
        ]
        evidence = scraper.pa_next_data_reconciliation_evidence(
            self._next_data_html({
                "props": {"pageProps": {
                    "hasNextPage": False,
                    "events": events,
                }},
            }),
            [{"event_uid": "one"}, {"event_uid": "two"}],
        )
        self.assertFalse(evidence["complete"])
        self.assertEqual(evidence["reason"], "declared_event_count_missing")

    def test_next_data_nonterminal_page_is_additive_only(self):
        events = [
            {"name": "Event One", "buyIn": 300, "startDate": "2026-10-01"},
            {"name": "Event Two", "buyIn": 400, "startDate": "2026-10-02"},
        ]
        evidence = scraper.pa_next_data_reconciliation_evidence(
            self._next_data_html({
                "props": {"pageProps": {
                    "totalEvents": 2,
                    "hasNextPage": True,
                    "events": events,
                }},
            }),
            [{"event_uid": "one"}, {"event_uid": "two"}],
        )
        self.assertFalse(evidence["complete"])
        self.assertEqual(evidence["reason"], "pagination_not_terminal")

    def test_next_data_ancestor_total_binds_to_nested_collection(self):
        events = [
            {"name": "Event One", "buyIn": 300, "startDate": "2026-10-01"},
            {"name": "Event Two", "buyIn": 400, "startDate": "2026-10-02"},
        ]
        evidence = scraper.pa_next_data_reconciliation_evidence(
            self._next_data_html({
                "props": {"pageProps": {
                    "totalEvents": 99,
                    "hasNextPage": False,
                    "wrapper": {"events": events},
                }},
            }),
            [{"event_uid": "one"}, {"event_uid": "two"}],
        )
        self.assertFalse(evidence["complete"])
        self.assertEqual(evidence["reason"], "declared_event_count_mismatch")

    def test_next_data_matching_total_and_terminal_page_can_reconcile(self):
        events = [
            {"name": "Event One", "buyIn": 300, "startDate": "2026-10-01"},
            {"name": "Event Two", "buyIn": 400, "startDate": "2026-10-02"},
        ]
        complete_html = self._next_data_html({
            "props": {"pageProps": {
                "totalEvents": 2,
                "pageInfo": {"hasNextPage": False},
                "events": events,
            }},
        })
        complete = scraper.pa_next_data_reconciliation_evidence(
            complete_html, [{"event_uid": "one"}, {"event_uid": "two"}],
        )
        self.assertTrue(complete["complete"])
        self.assertEqual(complete["expected_event_count"], 2)

        mismatched_html = complete_html.replace('"totalEvents": 2', '"totalEvents": 3')
        mismatch = scraper.pa_next_data_reconciliation_evidence(
            mismatched_html, [{"event_uid": "one"}, {"event_uid": "two"}],
        )
        self.assertFalse(mismatch["complete"])
        self.assertEqual(mismatch["reason"], "declared_event_count_mismatch")

    def test_live_catalog_precedes_and_updates_master(self):
        master = [
            {"id": "pa_old", "name": "Old"},
            {"id": "pa_current", "name": "Stale Name", "curated": True},
        ]
        live = [
            {
                "id": "pa_current",
                "name": "Current Name",
                "source_url": "https://example.test/current",
            }
        ]
        rows = merge_series_catalog(master, live)
        self.assertEqual(["pa_current", "pa_old"], [row["id"] for row in rows])
        self.assertEqual("Current Name", rows[0]["name"])
        self.assertTrue(rows[0]["curated"])

    def test_exact_canonical_slug_is_authoritative(self):
        series = {
            "id": "pa_2026-daytona-beach-summer-classic-daytona-beach-2026",
            "name": "2026 Daytona Beach Summer Classic",
        }
        page = """
        <html><head>
        <link rel="canonical" href="https://www.pokeratlas.com/poker-tournament-series/2026-daytona-beach-summer-classic-daytona-beach-2026">
        <title>Daytona Beach Summer Classic | PokerAtlas</title>
        </head></html>
        """
        self.assertTrue(pa_series_page_matches(series, page, "unused"))

    def test_mismatched_canonical_series_is_quarantined(self):
        series = {"id": "2644", "name": "Rivers Casino Poker Series"}
        page = """
        <html><head>
        <link rel="canonical" href="https://www.pokeratlas.com/poker-tournament-series/electric-city-mini-event-2026">
        <title>Electric City Mini Event | PokerAtlas</title>
        </head><body><h1>Electric City Mini Event</h1></body></html>
        """
        self.assertFalse(pa_series_page_matches(series, page, "unused"))

    def test_room_canonical_cannot_authorize_choctaw_series(self):
        series = {"id": "pa_choctaw-classic", "name": "Choctaw Classic"}
        page = """
        <html><head>
        <link rel="canonical" href="https://www.pokeratlas.com/poker-room/choctaw">
        <title>Choctaw Poker Tournaments | PokerAtlas</title>
        </head><body><h1>Choctaw Poker Tournaments</h1></body></html>
        """
        self.assertFalse(pa_series_page_matches(
            series, page,
            "https://www.pokeratlas.com/poker-tournament-series/choctaw-classic",
        ))

    def test_room_canonical_cannot_authorize_wynn_series(self):
        series = {
            "id": "pa_wynn-signature-series",
            "name": "Wynn Signature Series",
        }
        page = """
        <html><head>
        <link rel="canonical" href="https://www.pokeratlas.com/poker-room/wynn">
        <title>Wynn Poker Tournaments | PokerAtlas</title>
        </head><body><h1>Wynn Poker Tournaments</h1></body></html>
        """
        self.assertFalse(pa_series_page_matches(
            series, page,
            "https://www.pokeratlas.com/poker-tournament-series/wynn-signature-series",
        ))

    def test_single_generic_token_is_not_series_identity(self):
        series = {"id": "pa_classic", "name": "Classic"}
        page = """
        <html><head><title>Classic Poker Tournament | PokerAtlas</title></head>
        <body><h1>Classic Poker Tournament</h1></body></html>
        """
        self.assertFalse(pa_series_page_matches(
            series, page,
            "https://www.pokeratlas.com/poker-tournament-series/classic",
        ))

    def test_aggregator_identity_ignores_generic_casino_series_words(self):
        self.assertFalse(source_series_identity_matches(
            "Isle Casino Poker Series",
            "2026 Gladiator Series Casino Lisboa",
        ))
        self.assertTrue(source_series_identity_matches(
            "Foxwoods Poker Classic",
            "2026 Foxwoods Poker Classic",
        ))

    def test_cardplayer_identity_cannot_cross_near_named_series(self):
        self.assertFalse(source_series_identity_matches(
            "Cherokee Poker Classic", "Cherokee Nation Poker Series",
        ))
        self.assertFalse(source_series_identity_matches(
            "Cherokee Nation Poker Series", "Cherokee Poker Classic",
        ))
        self.assertFalse(source_series_identity_matches(
            "Gulf Coast Poker Championship", "Northwest Poker Championship",
        ))
        self.assertFalse(source_series_identity_matches(
            "Northwest Poker Championship", "Gulf Coast Poker Championship",
        ))

    def test_venue_fallback_uses_physical_rows_and_requires_series_copy(self):
        venues = [
            {"id": 2642, "name": "Foxwoods Poker Classic", "venue_type": "series", "state": "CT"},
            {"id": 1835, "name": "Foxwoods Resort Casino", "venue_type": "casino", "state": "CT"},
        ]
        selected = select_physical_series_venue("Foxwoods Poker Classic", "CT", venues)
        self.assertEqual(selected["id"], 1835)
        self.assertFalse(venue_page_confirms_series(
            "Foxwoods Poker Classic", "Foxwoods Resort Casino",
            "<h1>Foxwoods Poker Room Daily Tournaments</h1>",
        ))
        self.assertTrue(venue_page_confirms_series(
            "Foxwoods Poker Classic", "Foxwoods Resort Casino",
            "<h1>Foxwoods Poker Classic Schedule</h1>",
        ))

    def test_venue_fallback_infers_series_state_before_name_matching(self):
        venues = [
            {"id": 2665, "name": "Fort McDowell Poker Series", "venue_type": "series", "state": "AZ"},
            {"id": 2276, "name": "Fort Worth Poker Club", "venue_type": "poker_club", "state": "TX"},
        ]
        self.assertIsNone(select_physical_series_venue(
            "Fort McDowell Poker Series", "", venues,
        ))

    def test_generic_listing_redirect_is_quarantined(self):
        series = {"id": "pa_missing-summer-classic-2026", "name": "Missing Summer Classic"}
        page = """
        <html><head>
        <link rel="canonical" href="https://www.pokeratlas.com/poker-tournament-series">
        <title>Poker Tournament Series | PokerAtlas</title>
        </head><body><h1>Poker Tournament Series</h1></body></html>
        """
        self.assertFalse(pa_series_page_matches(series, page, "unused"))

    def test_structured_html_containers_do_not_treat_guarantees_as_buyins(self):
        page = """
        <ol>
          <li class="panel panel-stripe tournament-item one-time">
            <span class="month">Sep</span><span class="day">2</span>
            <span class="hour">12:10pm</span>
            <span class="detail event-number">Series Event</span>
            <span class="detail starting-time-name">Day 1A</span>
            <span class="detail name">NLH Summer Classic</span>
            <div class="buy-in">$300</div><div class="type">NL Holdem</div>
            <li class="detail">30,000 chips</li><li class="detail">30 min levels</li>
            <li class="detail"><abbr title="$100,000 Guaranteed">$100K Gtd</abbr></li>
          </li>
          <li class="panel panel-stripe tournament-item one-time series-event">
            <span class="month">Sep</span><span class="day">3</span>
            <span class="hour">5:10pm</span>
            <span class="detail starting-time-name">- Day 1B</span>
            <span class="detail name">NLH Summer Classic</span>
            <div class="buy-in">$300</div><div class="type">NL Holdem</div>
            <li class="detail"><abbr title="$100,000 Guaranteed">$100K Gtd</abbr></li>
          </li>
        </ol>
        """
        rows = extract_pokeratlas_html_events(
            page,
            "pa_2026-daytona-beach-summer-classic-daytona-beach-2026",
            "2026 Daytona Beach Summer Classic",
            "00000000-0000-0000-0000-000000000001",
            "https://example.test/series",
            "a" * 64,
        )
        self.assertIsNotNone(rows)
        self.assertEqual(2, len(rows))
        self.assertEqual([300, 300], [row["buy_in"] for row in rows])
        self.assertEqual([100000, 100000], [row["guarantee"] for row in rows])
        self.assertEqual("Day 1A NLH Summer Classic", rows[0]["event_name"])
        self.assertEqual("Day 1B NLH Summer Classic", rows[1]["event_name"])
        self.assertEqual("pokeratlas_html", rows[0]["source"])
        self.assertEqual("scraped_inferred", rows[0]["data_quality"])

        parent = build_series_parent_record(
            {
                "series_uid": "pa_2026-daytona-beach-summer-classic-daytona-beach-2026",
                "series_name": "Verbose listing label",
                "canonical_series_name": "2026 Daytona Beach Summer Classic",
                "resolved_url": "https://example.test/series",
                "source": "pokeratlas_html",
                "found": True,
                "events": rows,
            },
            "00000000-0000-0000-0000-000000000001",
        )
        self.assertIsNotNone(parent)
        self.assertEqual("2026 Daytona Beach Summer Classic", parent["series_name"])
        self.assertEqual("scraped_inferred", parent["data_quality"])
        self.assertEqual(2, parent["events_count"])

    def test_structured_html_empty_stack_placeholder_does_not_abort_page(self):
        page = """
        <ol>
          <li class="panel panel-stripe tournament-item one-time">
            <span class="month">Mar</span><span class="day">25</span>
            <span class="hour">12:10pm</span>
            <span class="detail starting-time-name">Day 1A</span>
            <span class="detail name">NLH Road to Riches</span>
            <div class="buy-in">$300</div><div class="type">NL Holdem</div>
            <li class="detail">, chips</li><li class="detail">30 min levels</li>
          </li>
        </ol>
        """
        rows = extract_pokeratlas_html_events(
            page,
            "pa_100k-road-to-riches-march-26-live-casino-philadelphia-2026",
            "$100K Road to Riches - March '26",
            "00000000-0000-0000-0000-000000000001",
            "https://example.test/series",
            "a" * 64,
        )

        self.assertIsNotNone(rows)
        self.assertEqual(1, len(rows))
        self.assertIsNone(rows[0]["starting_stack"])
        self.assertEqual("Day 1A NLH Road to Riches", rows[0]["event_name"])

    def test_replacement_session_is_reused_by_later_series_sources(self):
        class Response:
            status = 200
            body = b"verified tournament schedule"

        class DeadSession:
            def __init__(self):
                self.closed = False

            def fetch(self, *_args, **_kwargs):
                raise RuntimeError("Target page, context or browser has been closed")

            def close(self):
                self.closed = True

        class ReplacementSession:
            def __init__(self):
                self.fetches = 0

            def fetch(self, *_args, **_kwargs):
                self.fetches += 1
                return Response()

        dead = DeadSession()
        replacement = ReplacementSession()
        with mock.patch.object(scraper, "create_session", return_value=replacement) as create:
            first = fetch_with_retry(dead, "https://example.test/one", retries=2)
            second = fetch_with_retry(dead, "https://example.test/two", retries=1)

        self.assertTrue(dead.closed)
        self.assertEqual(1, create.call_count)
        self.assertIs(scraper.CURRENT_SESSION, replacement)
        self.assertEqual(2, replacement.fetches)
        self.assertEqual(200, first[1])
        self.assertEqual(200, second[1])

    def test_main_cycle_contains_a_graceful_daemon_stop_gate(self):
        source = Path(scraper.__file__).read_text()
        self.assertIn("if STOP_REQUESTED:", source)
        self.assertIn("flushing confirmed work before exit", source)
        self.assertIn("suppressed series pending manual source repair", source)
        self.assertIn("sys.exit(1)", source)

    def test_numeric_official_source_is_fetched_once_and_identity_checked(self):
        wrong_page = """
        <html><head><title>Casino Lisboa Poker Tournaments</title></head>
        <body><h1>2026 Gladiator Series Casino Lisboa</h1></body></html>
        """
        with (
            mock.patch.object(
                scraper,
                "fetch_with_retry",
                return_value=(wrong_page, 200, wrong_page.encode(), "b" * 64),
            ) as fetch,
            mock.patch.object(scraper, "_try_cardplayer", return_value=[]),
            mock.patch.object(scraper, "_try_hendonmob", return_value=[]),
            mock.patch.object(scraper, "_try_bravo_venue", return_value=[]),
            mock.patch.object(scraper, "save_evidence", return_value="evidence.json"),
        ):
            result = scraper.scrape_series(
                {
                    "id": "2687",
                    "name": "Isle Casino Poker Series",
                    "source_url": "https://www.cardplayer.com/poker-tournaments/123",
                },
                object(),
                "00000000-0000-0000-0000-000000000001",
            )

        self.assertEqual(fetch.call_count, 1)
        self.assertFalse(result["found"])
        self.assertIn("source_identity_mismatch", result["flags"])

    def test_official_venue_page_rejects_wynn_signature_token_collision(self):
        page = """
          <html><head><title>Wynn Las Vegas Poker Room</title></head>
          <body><h1>Wynn Poker</h1><p>Enjoy our signature cocktails.</p>
          <div class="event">Daily poker tournaments September 20, 2099</div>
          </body></html>
        """
        self.assertFalse(venue_page_confirms_series(
            "Wynn Signature Series", "Wynn Las Vegas", page,
        ))

    def test_official_venue_page_rejects_choctaw_daily_classic_token_collision(self):
        page = """
          <html><head><title>Choctaw Casino Poker Tournaments</title></head>
          <body><h1>Choctaw Poker Room</h1>
          <p>Daily tournaments are available.</p>
          <p>Visit our classic steakhouse before September 20, 2099.</p>
          </body></html>
        """
        self.assertFalse(venue_page_confirms_series(
            "Choctaw Daily Classic", "Choctaw Casino Resort", page,
        ))

    def test_official_venue_page_accepts_source_owned_series_heading(self):
        page = """
          <title>Wynn Signature Series Schedule</title>
          <h1>Wynn Signature Series</h1>
          <div class="event">September 20, 2099 - $600 Buy-In</div>
        """
        self.assertTrue(venue_page_confirms_series(
            "Wynn Signature Series", "Wynn Las Vegas", page,
        ))

    def test_fetched_but_unresolved_series_marks_run_failed(self):
        for counter in scraper.RUN_ERRORS:
            scraper.RUN_ERRORS[counter] = 0
        self.assertTrue(scraper.record_unresolved_series_attempt({
            "found": False, "skipped": False, "events": [],
        }))
        self.assertEqual(scraper.RUN_ERRORS["series_errors"], 1)

    def test_paged_read_discards_partial_rows_on_later_page_failure(self):
        class Response:
            def __enter__(self):
                return self

            def __exit__(self, *_args):
                return False

            def read(self):
                return b'[{"series_uid":"first"}]'

        for counter in scraper.RUN_ERRORS:
            scraper.RUN_ERRORS[counter] = 0
        with mock.patch.object(
            scraper.urllib.request, "urlopen",
            side_effect=[Response(), OSError("page two failed")],
        ):
            self.assertIsNone(scraper.sb_get_paged(
                "poker_series", "?select=series_uid", limit=1,
            ))
        self.assertEqual(scraper.RUN_ERRORS["series_errors"], 1)

    def test_explicit_target_cannot_bypass_database_suppression(self):
        with (
            mock.patch.object(
                scraper.json,
                "load",
                return_value={"master_list": [{"id": "2751", "name": "Kings Poker Room Series"}]},
            ),
            mock.patch.object(
                scraper,
                "sb_get_paged",
                return_value=[{
                    "series_uid": "2751",
                    "state": "",
                    "events_scraped": False,
                    "events_count": 0,
                    "scrape_url": None,
                    "source_url": None,
                    "last_scraped": None,
                    "start_date": None,
                    "end_date": None,
                    "is_suppressed": True,
                }],
            ),
        ):
            rows = scraper.load_missing_series(filter_slug="2751")
        self.assertEqual(rows, [])

    def test_existing_suppressed_parent_refuses_child_writes(self):
        class Response:
            def __enter__(self):
                return self

            def __exit__(self, *_args):
                return False

            def read(self):
                return io.BytesIO(json.dumps([
                    {"series_uid": "2751", "is_suppressed": True}
                ]).encode()).read()

        result = {
            "series_uid": "2751",
            "series_name": "Kings Poker Room Series",
            "canonical_series_name": "Kings Poker Room Series",
            "resolved_url": "https://example.test/series",
            "source": "pokeratlas_html",
            "found": True,
            "events": [{
                "buy_in": 200,
                "start_date": "2026-09-20",
                "scrape_html_hash": "a" * 64,
                "scrape_timestamp": "2026-09-06T20:00:00+00:00",
                "source": "pokeratlas_html",
            }],
        }
        with mock.patch.object(scraper.urllib.request, "urlopen", return_value=Response()):
            self.assertFalse(scraper.sb_ensure_series_parent(
                result, "00000000-0000-0000-0000-000000000001"
            ))

    def test_existing_parent_refresh_has_complete_current_provenance(self):
        result = {
            "series_uid": "pa_current",
            "series_name": "Current Series",
            "canonical_series_name": "Current Series",
            "resolved_url": "https://www.pokeratlas.com/poker-tournament-series/current",
            "source": "pokeratlas_html",
            "found": True,
            "events": [{
                "event_uid": "event-one", "buy_in": 300,
                "start_date": "2099-09-20", "source": "pokeratlas_html",
                "scrape_html_hash": "a" * 64,
                "scrape_timestamp": "2099-09-01T12:00:00+00:00",
            }],
        }
        patch = build_series_parent_refresh_patch(result, "batch-current")
        self.assertEqual(patch["source"], "pokeratlas_html")
        self.assertEqual(patch["data_quality"], "scraped_inferred")
        self.assertEqual(patch["scrape_confidence"], "low")
        self.assertEqual(patch["scrape_html_hash"], "a" * 64)
        self.assertEqual(
            patch["source_url"],
            "https://www.pokeratlas.com/poker-tournament-series/current",
        )
        self.assertEqual(patch["scrape_batch_id"], "batch-current")

    def test_manual_parent_refresh_preserves_curated_provenance(self):
        result = {
            "series_uid": "manual-series", "series_name": "Manual Series",
            "resolved_url": "https://scraper.test/current", "source": "source_url",
            "found": True,
            "events": [{
                "buy_in": 500, "start_date": "2099-10-01",
                "scrape_html_hash": "b" * 64,
                "scrape_timestamp": "2099-09-01T12:00:00+00:00",
                "source": "source_url",
            }],
        }
        patch = build_series_parent_refresh_patch(
            result, "scraper-batch", preserve_manual=True,
        )
        for field in (
            "source", "source_url", "scrape_url", "data_quality",
            "scrape_confidence", "scrape_html_hash", "scrape_timestamp",
            "scrape_batch_id", "series_name",
        ):
            self.assertNotIn(field, patch)
        self.assertTrue(patch["events_scraped"])
        self.assertEqual(patch["events_count"], 1)


class AuthoritativeEventReconciliationTests(unittest.TestCase):
    SOURCE_URL = (
        "https://www.pokeratlas.com/poker-tournament-series/"
        "2026-daytona-beach-summer-classic-daytona-beach-2026"
    )

    @staticmethod
    def _row(row_id, event_uid, *, source_url=None, quality="scraped_inferred",
             source="pokeratlas_html", start_date="2026-10-01",
             series_uid="pa_daytona"):
        notes = f"Source: {source_url}" if source_url else None
        return {
            "id": row_id,
            "event_uid": event_uid,
            "series_uid": series_uid,
            "source": source,
            "notes": notes,
            "data_quality": quality,
            "start_date": start_date,
            "end_date": None,
        }

    def setUp(self):
        for counter in scraper.RUN_ERRORS:
            scraper.RUN_ERRORS[counter] = 0

    def test_retirement_is_exact_source_scoped_and_preserves_history_and_curation(self):
        rows = [
            self._row("retire", "moved-event", source_url=self.SOURCE_URL),
            self._row("keep-current", "current-event", source_url=self.SOURCE_URL),
            self._row(
                "keep-manual", "manual-event", source_url=self.SOURCE_URL,
                quality="manual_research",
            ),
            self._row(
                "keep-other-source", "other-source-event",
                source_url="https://example.test/another-series",
            ),
            self._row("keep-no-provenance", "no-source-event"),
            self._row(
                "keep-history", "historical-event", source_url=self.SOURCE_URL,
                start_date="2026-08-01",
            ),
            self._row(
                "keep-other-series", "other-series-event", source_url=self.SOURCE_URL,
                series_uid="pa_other",
            ),
            self._row(
                "keep-already-stale", "stale-event", source_url=self.SOURCE_URL,
                quality="stale",
            ),
        ]

        self.assertEqual(
            scraper.retirable_series_event_ids(
                rows,
                current_event_uids={"current-event"},
                series_uid="pa_daytona",
                source_url=self.SOURCE_URL,
                today=date(2026, 9, 6),
            ),
            ["retire"],
        )

    def test_empty_or_unproven_current_set_can_never_retire_rows(self):
        rows = [self._row("do-not-retire", "old-event", source_url=self.SOURCE_URL)]
        self.assertEqual(
            scraper.retirable_series_event_ids(
                rows, set(), "pa_daytona", self.SOURCE_URL,
                today=date(2026, 9, 6),
            ),
            [],
        )
        self.assertEqual(
            scraper.retirable_series_event_ids(
                rows, {"current-event"}, "pa_daytona", "",
                today=date(2026, 9, 6),
            ),
            [],
        )

    def test_reconciliation_claim_without_collection_evidence_fails_closed(self):
        result = {
            "series_uid": "pa_daytona",
            "reconcile_complete": True,
            "reconcile_source_url": self.SOURCE_URL,
            "reconcile_event_uids": ["current-event"],
            "reconcile_expected_event_count": 1,
        }
        with mock.patch.object(
            scraper, "sb_get_series_events_for_reconciliation",
        ) as read_existing:
            self.assertFalse(scraper.reconcile_authoritative_series_events(result))
        read_existing.assert_not_called()
        self.assertEqual(scraper.RUN_ERRORS["patch_failed"], 1)

    def test_exact_id_patch_requires_every_requested_row_back(self):
        class Response:
            status = 200

            def __enter__(self):
                return self

            def __exit__(self, *_args):
                return False

            def read(self):
                return json.dumps([{"id": "event-id-1"}]).encode()

        with mock.patch.object(
            scraper.urllib.request, "urlopen", return_value=Response(),
        ) as urlopen:
            self.assertTrue(scraper.sb_mark_series_events_stale(["event-id-1"]))

        request = urlopen.call_args.args[0]
        self.assertIn("?id=in.(event-id-1)", request.full_url)
        self.assertEqual(json.loads(request.data), {"data_quality": "stale"})

    def test_exact_id_patch_fails_closed_on_incomplete_confirmation(self):
        class Response:
            status = 200

            def __enter__(self):
                return self

            def __exit__(self, *_args):
                return False

            def read(self):
                return b"[]"

        with mock.patch.object(
            scraper.urllib.request, "urlopen", return_value=Response(),
        ):
            self.assertFalse(scraper.sb_mark_series_events_stale(["event-id-1"]))
        self.assertEqual(scraper.RUN_ERRORS["patch_failed"], 1)

    def test_reconcile_reads_then_patches_only_computed_exact_ids(self):
        result = {
            "series_uid": "pa_daytona",
            "reconcile_complete": True,
            "reconcile_source_url": self.SOURCE_URL,
            "reconcile_event_uids": ["current-event"],
            "reconcile_expected_event_count": 1,
            "reconcile_evidence": "complete_pokeratlas_html_contract",
        }
        existing = [
            self._row(
                "retire", "moved-event", source_url=self.SOURCE_URL,
                start_date="2099-10-01",
            ),
            self._row(
                "keep", "current-event", source_url=self.SOURCE_URL,
                start_date="2099-10-02",
            ),
        ]
        with (
            mock.patch.object(
                scraper, "sb_get_series_events_for_reconciliation",
                return_value=existing,
            ),
            mock.patch.object(
                scraper, "sb_mark_series_events_stale", return_value=True,
            ) as stale,
        ):
            self.assertTrue(scraper.reconcile_authoritative_series_events(result))
        stale.assert_called_once_with(["retire"])

    def test_flush_reconciles_only_after_every_event_and_parent_patch_persist(self):
        result = {
            "series_uid": "pa_daytona",
            "series_name": "Daytona Summer Classic",
            "found": True,
            "events": [
                {
                    "event_uid": "current-event",
                    "series_uid": "pa_daytona",
                    "buy_in": 300,
                    "start_date": "2026-10-01",
                    "source": "pokeratlas_html",
                    "scrape_html_hash": "a" * 64,
                    "scrape_timestamp": "2026-09-06T20:00:00+00:00",
                }
            ],
            "source": "pokeratlas_html",
            "resolved_url": self.SOURCE_URL,
            "reconcile_complete": True,
            "reconcile_source_url": self.SOURCE_URL,
            "reconcile_event_uids": ["current-event"],
            "reconcile_expected_event_count": 1,
            "reconcile_evidence": "complete_pokeratlas_html_contract",
        }
        with (
            mock.patch.object(scraper, "sb_ensure_series_parent", return_value=True),
            mock.patch.object(
                scraper, "sb_upsert_events_confirmed", return_value={"current-event"},
            ),
            mock.patch.object(scraper, "sb_patch_series", return_value=True),
            mock.patch.object(
                scraper, "reconcile_authoritative_series_events", return_value=True,
            ) as reconcile,
        ):
            self.assertEqual(scraper.flush_chunk([result], "batch", False), 1)
        reconcile.assert_called_once_with(result)

    def test_flush_does_not_reconcile_a_partially_persisted_series(self):
        result = {
            "series_uid": "pa_daytona",
            "series_name": "Daytona Summer Classic",
            "found": True,
            "events": [
                {
                    "event_uid": "event-one",
                    "series_uid": "pa_daytona",
                    "buy_in": 300,
                    "start_date": "2026-10-01",
                    "source": "pokeratlas_html",
                    "scrape_html_hash": "a" * 64,
                    "scrape_timestamp": "2026-09-06T20:00:00+00:00",
                },
                {
                    "event_uid": "event-two",
                    "series_uid": "pa_daytona",
                    "buy_in": 400,
                    "start_date": "2026-10-02",
                    "source": "pokeratlas_html",
                    "scrape_html_hash": "a" * 64,
                    "scrape_timestamp": "2026-09-06T20:00:00+00:00",
                },
            ],
            "source": "pokeratlas_html",
            "resolved_url": self.SOURCE_URL,
            "reconcile_complete": True,
            "reconcile_source_url": self.SOURCE_URL,
            "reconcile_event_uids": ["event-one", "event-two"],
            "reconcile_expected_event_count": 2,
            "reconcile_evidence": "complete_pokeratlas_html_contract",
        }
        with (
            mock.patch.object(scraper, "sb_ensure_series_parent", return_value=True),
            mock.patch.object(
                scraper, "sb_upsert_events_confirmed", return_value={"event-one"},
            ),
            mock.patch.object(scraper, "sb_patch_series") as patch_parent,
            mock.patch.object(scraper, "reconcile_authoritative_series_events") as reconcile,
        ):
            self.assertEqual(scraper.flush_chunk([result], "batch", False), 1)
        patch_parent.assert_not_called()
        reconcile.assert_not_called()


if __name__ == "__main__":
    unittest.main(verbosity=2)
