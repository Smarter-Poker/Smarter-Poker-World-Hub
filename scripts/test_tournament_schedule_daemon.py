#!/usr/bin/env python3
"""Offline regression checks for the daily tournament generic fallback."""

from __future__ import annotations

import importlib.util
import io
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest import mock
import urllib.error


os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "offline-test-key")
MODULE_PATH = Path(__file__).with_name("tournament-schedule-daemon.py")
SPEC = importlib.util.spec_from_file_location("tournament_schedule_daemon", MODULE_PATH)
assert SPEC and SPEC.loader
DAEMON = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(DAEMON)


class GenericTournamentFallbackTests(unittest.TestCase):
    @staticmethod
    def _pa_page(name: str, state: str, title: str | None = None) -> str:
        return f'''
          <html><head><title>{title or name} Poker Tournaments</title></head>
          <body><h1>{name}</h1>
          <script type="application/ld+json">{{
            "@type":"Casino", "name":{name!r},
            "address":{{"addressRegion":{state!r}}}
          }}</script></body></html>
        '''.replace("'", '"')

    @staticmethod
    def _bravo_page(name: str, state: str) -> str:
        return f'''
          <html><head><title>{name} | Bravo Poker Live</title>
          <meta property="og:title" content="{name} Poker Room"></head>
          <body><h1>{name}</h1>
          <script type="application/ld+json">{{
            "@type":"Casino", "name":{name!r},
            "address":{{"addressRegion":{state!r}}}
          }}</script></body></html>
        '''.replace("'", '"')

    def test_pokeratlas_identity_accepts_matching_room_and_state(self):
        matched, _origins, reason = DAEMON.pokeratlas_room_page_identity(
            self._pa_page("South Point", "NV"), "South Point", "NV",
        )
        self.assertTrue(matched)
        self.assertEqual(reason, "matched")

    def test_pokeratlas_identity_rejects_same_state_city_collision(self):
        matched, _origins, reason = DAEMON.pokeratlas_room_page_identity(
            self._pa_page("Rivers Casino Philadelphia", "PA"),
            "Harrahs Philadelphia", "PA",
        )
        self.assertFalse(matched)
        self.assertEqual(reason, "room_name_identity_mismatch")

    def test_pokeratlas_identity_rejects_cross_state_room(self):
        matched, _origins, reason = DAEMON.pokeratlas_room_page_identity(
            self._pa_page("Bellagio", "NV"), "Del Lago Resort", "NY",
        )
        self.assertFalse(matched)
        self.assertEqual(reason, "json_ld_state_or_name_missing")

    def test_pokeratlas_schedule_response_accepts_exact_final_and_canonical_room(self):
        requested = "https://www.pokeratlas.com/poker-room/verified-room/tournaments"
        page = (
            '<link rel="canonical" href="/poker-room/verified-room">'
            '<meta property="og:url" content="https://pokeratlas.com/poker-room/'
            'verified-room/tournaments">'
        )
        self.assertEqual(
            DAEMON.pokeratlas_schedule_response_identity(requested, page, requested),
            (True, "matched"),
        )

    def test_pokeratlas_schedule_response_rejects_different_final_room(self):
        requested = "https://www.pokeratlas.com/poker-room/verified-room/tournaments"
        self.assertEqual(
            DAEMON.pokeratlas_schedule_response_identity(
                requested,
                self._pa_page("Verified Room", "NV"),
                "https://www.pokeratlas.com/poker-room/other-room/tournaments",
            ),
            (False, "final_room_path_mismatch"),
        )

    def test_pokeratlas_schedule_response_rejects_different_canonical_room(self):
        requested = "https://www.pokeratlas.com/poker-room/verified-room/tournaments"
        page = '<link rel="canonical" href="/poker-room/other-room/tournaments">'
        self.assertEqual(
            DAEMON.pokeratlas_schedule_response_identity(requested, page, requested),
            (False, "canonical_room_path_mismatch"),
        )

    def test_pokeratlas_schedule_response_rejects_missing_final_url(self):
        requested = "https://www.pokeratlas.com/poker-room/verified-room/tournaments"
        self.assertEqual(
            DAEMON.pokeratlas_schedule_response_identity(requested, "", ""),
            (False, "final_room_path_missing_or_invalid"),
        )

    def test_bravo_identity_accepts_matching_room(self):
        matched, reason = DAEMON.bravo_room_page_identity(
            self._bravo_page("South Point", "NV"), "South Point", "NV",
        )
        self.assertTrue(matched)
        self.assertEqual(reason, "matched")

    def test_bravo_identity_rejects_guessed_slug_for_another_room(self):
        matched, reason = DAEMON.bravo_room_page_identity(
            self._bravo_page("Rivers Casino Philadelphia", "PA"),
            "Harrahs Philadelphia", "PA",
        )
        self.assertFalse(matched)
        self.assertEqual(reason, "room_name_identity_mismatch")

    def test_bravo_identity_rejects_structured_cross_state_page(self):
        matched, reason = DAEMON.bravo_room_page_identity(
            self._bravo_page("South Point", "CA"), "South Point", "NV",
        )
        self.assertFalse(matched)
        self.assertEqual(reason, "structured_state_mismatch")

    def test_rejects_daytona_cash_promotion_copy(self):
        candidates = (
            "No Limit Hold'em 2AM $200 every 30 minutes Mega Money Wheel",
            "Power Hours No Limit Hold'em 11AM win $1,000 every 20 minutes",
            "Saturday 11AM $500 High Hand promotion",
            "Poker Tournament Monthly Leaderboard 7PM $750 prize",
        )
        for candidate in candidates:
            with self.subTest(candidate=candidate):
                self.assertFalse(DAEMON.is_generic_tournament_candidate(candidate))

    def test_accepts_explicitly_priced_tournament_candidate(self):
        candidate = "Friday 7:00 PM $150 Buy-In No Limit Hold'em Tournament"
        self.assertTrue(DAEMON.is_generic_tournament_candidate(candidate))

    def test_page_wide_navigation_cannot_legitimize_promotion(self):
        html = """
          <nav>Poker Tournament Schedule</nav>
          <div class="event promo-card">
            <h2>Power Hours</h2><p>No Limit Hold'em 11AM</p>
            <p>Win $1,000 every 20 minutes</p>
          </div>
        """
        rows = DAEMON.extract_html(
            html, "Daytona Beach Racing and Card Club", 2037,
            "offline-batch", "https://example.com/poker", "website", "FL",
        )
        self.assertEqual(rows, [])

    def test_semantic_event_container_produces_inferred_row(self):
        html = """
          <div class="poker-tournament event">
            Friday 7:00 PM $150 Buy-In No Limit Hold'em Tournament
          </div>
        """
        rows = DAEMON.extract_html(
            html, "Verified Room", 99, "offline-batch",
            "https://example.com/tournaments", "website", "NV",
        )
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["buy_in"], 150)
        self.assertEqual(rows[0]["day_of_week"], "Friday")
        self.assertEqual(rows[0]["data_quality"], "scraped_inferred")

    def test_dom_json_and_truncated_names_are_rejected(self):
        artifacts = (
            "@context", "false", "true", "content", "comp-jv7a5ybk",
            "color: #ffffff", "agency_aps_iFrame", "eventAttendanceMode",
            "at-above-post addthis_tool", "font_2 wixui-rich-text__text",
            "font_7 wixui-rich-text__text", "font_8 wixui-rich-text__text",
            "em Texas Hold", "em Friday @ 7PM Hold",
            "script", "id=",
            "social-wall-stream sqs-html-content",
            "sqs-block-content window.__webpack",
            "https://championsclubtexas.com/event/5k-midweek-plo/",
            "t miss out on the Best Promotion in town, The Big Blind",
        )
        for artifact in artifacts:
            with self.subTest(artifact=artifact):
                self.assertIsNone(DAEMON.sanitize_tournament_name(artifact))

    def test_valid_entity_encoded_name_is_decoded_as_text(self):
        self.assertEqual(
            "NLH w/Rebuys & Add-On",
            DAEMON.sanitize_tournament_name("NLH w/Rebuys &amp; Add-On"),
        )
        self.assertEqual(
            "High Roller - Final",
            DAEMON.sanitize_tournament_name("High Roller &mdash; Final"),
        )

    def test_explicit_artifact_is_not_replaced_with_generated_event_name(self):
        row = DAEMON.make_rec(
            "Verified Room", 99, "offline-batch", "Friday", None,
            "7:00 PM", 150, "NLH", None, None, "script",
            "https://example.com/tournaments", "website", "a" * 64,
            state="NV",
        )
        self.assertIsNone(row)

    def test_unlabelled_inferred_five_figure_buyin_is_rejected(self):
        row = DAEMON.make_rec(
            "Lucky Lady", 99, "offline-batch", "Friday", None,
            "7:00 PM", 95191, "NLH", None, None, "Friday Main Event",
            "https://example.com/tournaments", "website", "a" * 64,
            state="NV", quality="scraped_inferred", buyin_labelled=False,
        )
        self.assertIsNone(row)

    def test_labelled_clean_inferred_high_roller_is_preserved(self):
        row = DAEMON.make_rec(
            "Verified Room", 99, "offline-batch", "Friday", None,
            "7:00 PM", 10000, "NLH", None, None, "High Roller Main Event",
            "https://example.com/tournaments", "website", "a" * 64,
            state="NV", quality="scraped_inferred", buyin_labelled=True,
        )
        self.assertIsNotNone(row)
        self.assertEqual(row["buy_in"], 10000)

    def test_structured_verified_high_roller_does_not_use_blanket_ceiling(self):
        row = DAEMON.make_rec(
            "Verified Room", 99, "offline-batch", "Friday", None,
            "7:00 PM", 25000, "NLH", None, None, "Championship Event",
            "https://example.com/tournaments", "pokeratlas", "a" * 64,
            state="NV", quality="scraped_verified",
        )
        self.assertIsNotNone(row)
        self.assertEqual(row["buy_in"], 25000)

    def test_verified_pokeratlas_morning_schedule_is_preserved_with_source_identity(self):
        row = DAEMON.make_rec(
            "Horseshoe Las Vegas", 3123,
            "123e4567-e89b-42d3-a456-426614174000", "Daily", None,
            "9:00AM", 100, "NLH", None, None,
            "No Limit Hold'em 9:00AM $100 Buy In",
            "https://www.pokeratlas.com/poker-room/horseshoe-las-vegas/tournaments",
            "pokeratlas", "a" * 64, state="NV",
            quality="scraped_verified", buyin_labelled=True,
        )
        self.assertIsNotNone(row)
        self.assertEqual(row["scrape_source"], "pokeratlas")

    def test_unverified_or_spoofed_pre_ten_rows_fail_closed(self):
        valid_args = (
            "Horseshoe Las Vegas", 3123,
            "123e4567-e89b-42d3-a456-426614174000", "Daily", None,
            "9:00AM", 100, "NLH", None, None,
            "No Limit Hold'em 9:00AM $100 Buy In",
        )
        pokeratlas_url = (
            "https://www.pokeratlas.com/poker-room/"
            "horseshoe-las-vegas/tournaments"
        )
        cases = (
            (pokeratlas_url, "pokeratlas", "a" * 64, "scraped_inferred"),
            (pokeratlas_url, "cardplayer", "a" * 64, "scraped_verified"),
            ("https://example.com/tournaments", "pokeratlas", "a" * 64,
             "scraped_verified"),
            (pokeratlas_url, "pokeratlas", "0" * 64, "scraped_verified"),
        )
        for source_url, source_type, digest, quality in cases:
            with self.subTest(
                source_url=source_url, source_type=source_type, quality=quality,
            ):
                self.assertIsNone(DAEMON.make_rec(
                    *valid_args, source_url, source_type, digest,
                    state="NV", quality=quality, buyin_labelled=True,
                ))

        self.assertFalse(DAEMON.has_verified_morning_source_evidence(
            "9:00AM", pokeratlas_url, "pokeratlas", "a" * 64,
            "123e4567-e89b-42d3-a456-426614174000", "scraped_verified", 100,
            "2099-01-01T00:00:00Z",
        ))

    def test_sub_eight_rows_remain_rejected_even_when_source_verified(self):
        self.assertIsNone(DAEMON.make_rec(
            "Verified Room", 99,
            "123e4567-e89b-42d3-a456-426614174000", "Daily", None,
            "7:59AM", 100, "NLH", None, None, "Early Event",
            "https://www.pokeratlas.com/poker-room/verified-room/tournaments",
            "pokeratlas", "a" * 64, state="NV",
            quality="scraped_verified", buyin_labelled=True,
        ))

    def test_dated_daily_and_exact_weekday_share_one_public_identity(self):
        base = {
            "venue_id": 99,
            "venue_name": "Verified Room",
            "event_date": "2099-09-20",
            "start_time": "7:00 PM",
            "buy_in": 150,
            "game_type": "NLH",
            "tournament_name": "Friday Event",
            "human_verified": False,
            "data_quality": "scraped_inferred",
        }
        daily = {**base, "day_of_week": "Daily"}
        weekday = {**base, "day_of_week": "Friday"}
        self.assertEqual(DAEMON.dedup_key(daily), DAEMON.dedup_key(weekday))
        self.assertEqual(
            DAEMON.collapse_occurrence_duplicates([daily, weekday]),
            [daily],
        )

    def test_undated_recurring_weekdays_remain_distinct(self):
        base = {
            "venue_id": 99, "venue_name": "Verified Room",
            "event_date": "1970-01-01", "start_time": "7:00 PM",
            "buy_in": 150, "game_type": "NLH",
        }
        monday = {**base, "day_of_week": "Monday"}
        friday = {**base, "day_of_week": "Friday"}
        self.assertNotEqual(DAEMON.dedup_key(monday), DAEMON.dedup_key(friday))
        self.assertEqual(len(DAEMON.collapse_occurrence_duplicates([monday, friday])), 2)

    def test_expanded_schedule_children_are_concrete_dated_rows(self):
        template = DAEMON.make_rec(
            "Verified Room", 99, "offline-batch", "Daily", None,
            "7:00 PM", 150, "NLH", None, None, "Daily Event",
            "https://example.com/tournaments", "website", "a" * 64, state="NV",
        )
        rows = DAEMON.expand_to_dated_rows(template, daily_days=1)
        self.assertEqual(len(rows), 1)
        self.assertFalse(rows[0]["is_recurring"])
        self.assertIn("pnm_recurring_projection", rows[0]["flags"])
        self.assertNotEqual(rows[0]["event_date"], "1970-01-01")

    def test_dated_event_is_not_mislabeled_as_recurring_template(self):
        dated = DAEMON.make_rec(
            "Verified Room", 99, "offline-batch", "Friday", "2026-10-02",
            "7:00 PM", 150, "NLH", None, None, "Friday Event",
            "https://example.com/tournaments", "website", "a" * 64, state="NV",
        )
        recurring = DAEMON.make_rec(
            "Verified Room", 99, "offline-batch", "Friday", None,
            "7:00 PM", 150, "NLH", None, None, "Friday Weekly",
            "https://example.com/tournaments", "website", "b" * 64, state="NV",
        )
        self.assertFalse(dated["is_recurring"])
        self.assertTrue(recurring["is_recurring"])

    def test_valid_empty_requires_explicit_source_marker(self):
        self.assertTrue(DAEMON.source_confirms_valid_empty(
            '<section class="schedule no-tournaments">No events</section>',
        ))
        self.assertFalse(DAEMON.source_confirms_valid_empty(
            '<p>We do not know whether tournaments are scheduled.</p>',
        ))

    @mock.patch.object(DAEMON.time, "sleep")
    def test_identity_checked_empty_schedule_is_wired_to_venue_result(self, _sleep):
        page = self._pa_page("Verified Room", "NV").replace(
            "</body>", '<section class="tournament-schedule no-tournaments"></section></body>',
        )
        session = mock.Mock()
        session.source_errors = 0

        def fetch_page(url, **_kwargs):
            session.last_fetch_final_url = url
            return (
                page
                if url == "https://www.pokeratlas.com/poker-room/verified-room/tournaments"
                else ""
            )

        session.fetch_page.side_effect = fetch_page
        venue = {
            "id": 99, "name": "Verified Room", "city": "Las Vegas", "state": "NV",
            "pokeratlas_slug": "verified-room",
        }
        with mock.patch.object(DAEMON, "save_evidence", return_value="offline.json"):
            result = DAEMON.scrape_venue(venue, session, "offline-batch", {}, {})
        self.assertFalse(result["found"])
        self.assertTrue(result["valid_empty"])
        self.assertEqual(result["source"], "pokeratlas")
        self.assertEqual(
            result["primary_url"],
            "https://www.pokeratlas.com/poker-room/verified-room/tournaments",
        )

    @mock.patch.object(DAEMON.time, "sleep")
    def test_pokeratlas_redirect_to_different_room_never_writes_schedule(self, _sleep):
        page = self._pa_page("Verified Room", "NV").replace(
            "</body>", '''
              <section class="tournament-schedule">
                <div class="tournament">
                  <span class="hour">7:00pm</span>
                  <span class="name"><span>Friday Freezeout</span></span>
                  <span class="buy-in">$150</span>
                  <span class="type">No Limit Hold'em</span>
                </div>
              </section></body>
            ''',
        )

        class Session:
            source_errors = 0
            last_fetch_final_url = ""

            def note_source_error(self):
                self.source_errors += 1

            def fetch_page(self, url, **_kwargs):
                if url == "https://www.pokeratlas.com/poker-room/verified-room/tournaments":
                    self.last_fetch_final_url = (
                        "https://www.pokeratlas.com/poker-room/other-room/tournaments"
                    )
                    return page
                self.last_fetch_final_url = url
                return ""

        venue = {
            "id": 99, "name": "Verified Room", "city": "Las Vegas", "state": "NV",
            "pokeratlas_slug": "verified-room",
        }
        session = Session()
        with mock.patch.object(DAEMON, "save_evidence", return_value="offline.json"):
            result = DAEMON.scrape_venue(venue, session, "offline-batch", {}, {})
        self.assertFalse(result["found"])
        self.assertEqual(result["records"], [])
        self.assertGreaterEqual(session.source_errors, 1)

    def test_official_website_rejects_unrelated_casino_before_attribution(self):
        unrelated = """
          <html><head><title>Other Casino Poker Tournaments</title></head>
          <body><h1>Other Casino</h1><div class="poker-tournament event">
          Friday 7:00 PM $150 Buy-In No Limit Hold'em Tournament
          </div></body></html>
        """

        class Session:
            source_errors = 0
            last_fetch_status = 0
            last_fetch_final_url = ""

            def note_source_error(self):
                self.source_errors += 1

            def fetch_page(self, url, **_kwargs):
                self.last_fetch_status = 200
                self.last_fetch_final_url = url
                return unrelated if url.startswith("https://victim.test/") else ""

        venue = {
            "id": 99, "name": "Victim Casino", "city": "Las Vegas",
            "state": "NV", "website": "https://victim.test",
        }
        with mock.patch.object(DAEMON.time, "sleep"), mock.patch.object(
            DAEMON, "save_evidence", return_value="offline.json",
        ):
            result = DAEMON.scrape_venue(venue, Session(), "offline-batch", {}, {})
        self.assertFalse(result["found"])
        self.assertEqual(result["records"], [])

    def test_official_website_requires_origin_preserving_final_url(self):
        page = "<title>Victim Casino Tournaments</title><h1>Victim Casino</h1>"
        self.assertEqual(
            DAEMON.official_website_page_identity(
                page, "Victim Casino", "NV",
                "https://victim.test/poker",
                "https://other.test/poker",
            ),
            (False, "redirect_origin_mismatch"),
        )

    def test_global_same_name_rows_are_filtered_to_target_state(self):
        rows = [
            {"raw_text": "Rivers Casino Pittsburgh PA", "source_states": ["PA"]},
            {"raw_text": "Rivers Casino Wheeling WV", "source_states": ["WV"]},
        ]
        source_map = {"rivers casino": rows}
        self.assertEqual(
            DAEMON.match_global("Rivers Casino", source_map, "PA"),
            [rows[0]],
        )
        self.assertEqual(
            DAEMON.match_global("Rivers Casino", source_map, "WV"),
            [rows[1]],
        )

    def test_stateless_global_row_cannot_fan_out_to_same_name_multi_state_rooms(self):
        row = {
            "raw_text": "Rivers Casino Friday 7:00 PM $150 Buy-In",
            "source_states": [],
        }
        source_map = {"rivers casino": [row]}
        name_states = DAEMON.catalog_venue_name_states([
            {"name": "Rivers Casino", "state": "PA"},
            {"name": "Rivers Casino", "state": "WV"},
        ])

        self.assertEqual(
            DAEMON.match_global(
                "Rivers Casino", source_map, "PA", name_states,
            ),
            [],
        )
        self.assertEqual(
            DAEMON.match_global(
                "Rivers Casino", source_map, "WV", name_states,
            ),
            [],
        )


class GlobalSourceTruthTests(unittest.TestCase):
    class Session:
        def __init__(self, html, status=200, final_url=""):
            self.html = html
            self.last_fetch_status = status
            self.last_fetch_final_url = final_url
            self.source_errors = 0

        def fetch_page(self, _url, **_kwargs):
            return self.html

        def note_source_error(self):
            self.source_errors += 1

    def test_cardplayer_http_200_parser_zero_counts_source_error(self):
        session = self.Session(
            "<title>CardPlayer Poker Tournament Schedule</title><p>No rows parsed</p>",
            final_url="https://www.cardplayer.com/poker-tournaments",
        )
        with mock.patch.object(DAEMON, "save_evidence", return_value="ignored"):
            self.assertEqual(DAEMON.fetch_cardplayer(session), {})
        self.assertEqual(session.source_errors, 1)

    def test_hendonmob_unrelated_http_200_counts_source_error(self):
        session = self.Session(
            "<title>Other Casino Tournament Schedule</title>",
            final_url="https://pokerdb.thehendonmob.com/event.php",
        )
        self.assertEqual(DAEMON.fetch_hendonmob(session), {})
        self.assertEqual(session.source_errors, 1)

    def test_fixed_endpoint_404_counts_source_error(self):
        session = self.Session("", status=404)
        self.assertEqual(DAEMON.fetch_cardplayer(session), {})
        self.assertEqual(session.source_errors, 1)


class RequiredReadTests(unittest.TestCase):
    def test_primary_venue_cohort_failure_is_not_an_empty_success(self):
        DAEMON.WRITE_FAILURES = 0
        with mock.patch.object(DAEMON, "sb_get_checked", return_value=None):
            self.assertIsNone(DAEMON.load_venues())

    def test_retry_venue_cohort_failure_discards_partial_primary_rows(self):
        DAEMON.WRITE_FAILURES = 0
        primary = [{"id": 1, "name": "Room", "venue_type": "casino"}]
        with mock.patch.object(
            DAEMON, "sb_get_checked", side_effect=[primary, None],
        ):
            self.assertIsNone(DAEMON.load_venues())

    def test_missing_venue_pagination_failure_discards_partial_cohort(self):
        DAEMON.WRITE_FAILURES = 0
        venues = [{"id": 1, "name": "Room", "venue_type": "casino"}]
        full_page = [{"venue_id": 2}] * 1000
        with mock.patch.object(
            DAEMON, "sb_get_checked", side_effect=[venues, full_page, None],
        ):
            self.assertIsNone(DAEMON.load_missing_venues())


class MetricTruthTests(unittest.TestCase):
    def test_metric_failure_degrades_success_and_fails_valid_empty(self):
        success = DAEMON.classify_persisted_run(attempted=1, persisted=1)
        degraded = DAEMON.outcome_with_metric_failure(success)
        self.assertEqual(degraded["run_status"], "partial")
        self.assertIn("scraper_metrics_write_failed", degraded["status_reason"])

        empty = DAEMON.classify_persisted_run(
            attempted=0, persisted=0, valid_empty=True,
        )
        failed = DAEMON.outcome_with_metric_failure(empty)
        self.assertEqual(failed["run_status"], "failed")

    def test_persist_metric_counts_failure_for_cycle_health(self):
        DAEMON.WRITE_FAILURES = 0
        outcome = DAEMON.classify_persisted_run(attempted=1, persisted=1)
        with mock.patch.object(DAEMON, "write_scraper_metric", return_value=False):
            final, metric_failed = DAEMON.persist_scraper_metric(
                DAEMON.datetime.now(DAEMON.timezone.utc), outcome, 1, 1,
            )
        self.assertTrue(metric_failed)
        self.assertEqual(final["run_status"], "partial")
        self.assertEqual(DAEMON.WRITE_FAILURES, 1)


class EnrichmentTruthTests(unittest.TestCase):
    def setUp(self):
        DAEMON.WRITE_FAILURES = 0

    def test_detail_page_selects_only_one_exact_event_record(self):
        page = """
          <html><head><title>Deep Stack Championship | PokerAtlas</title>
          <link rel="canonical"
            href="https://www.pokeratlas.com/poker-tournament/deep-stack-2099">
          </head><body><h1>Deep Stack Championship</h1>
          <p>September 20, 2099 at 7:00 PM</p>
          <p>Buy-In: $300</p><p>Starting Chips: 30,000</p>
          </body></html>
        """
        records = [{
            "id": "event-a", "tournament_name": "Deep Stack Championship",
            "event_date": "2099-09-20", "start_time": "7:00 PM",
            "buy_in": 300,
        }, {
            "id": "event-b", "tournament_name": "Morning Turbo",
            "event_date": "2099-09-21", "start_time": "10:00 AM",
            "buy_in": 200,
        }]

        matched = DAEMON.select_record_for_pa_detail(
            page,
            "https://www.pokeratlas.com/poker-tournament/deep-stack-2099",
            records,
        )
        self.assertEqual(matched["id"], "event-a")
        self.assertNotEqual(matched["id"], "event-b")

    def test_detail_page_with_ambiguous_identity_selects_no_record(self):
        page = """
          <title>Friday Tournament | PokerAtlas</title>
          <h1>Friday Tournament</h1><p>September 20, 2099</p>
          <p>Buy-In: $300</p>
        """
        records = [{
            "id": suffix, "tournament_name": "Friday Tournament",
            "event_date": "2099-09-20", "buy_in": 300,
        } for suffix in ("event-a", "event-b")]
        self.assertIsNone(DAEMON.select_record_for_pa_detail(
            page,
            "https://www.pokeratlas.com/poker-tournament/friday-event",
            records,
        ))

    def test_enrichment_patch_requires_exact_returned_identity(self):
        class Response:
            status = 200

            def __enter__(self):
                return self

            def __exit__(self, *_args):
                return False

            def read(self):
                return b"[]"

        with mock.patch.object(
            DAEMON.urllib.request, "urlopen", return_value=Response(),
        ):
            self.assertFalse(DAEMON.sb_patch_exact_row(
                "venue_daily_tournaments", "event-a", {"starting_stack": 30000},
            ))
        self.assertEqual(DAEMON.WRITE_FAILURES, 1)

    def test_enrichment_source_has_no_venue_wide_detail_merge(self):
        source = Path(DAEMON.__file__).read_text()
        self.assertNotIn("venue_enrichment", source)


class PatchRetryTests(unittest.TestCase):
    class _Response:
        status = 204

        def __enter__(self):
            return self

        def __exit__(self, *_args):
            return False

    def setUp(self):
        DAEMON.WRITE_FAILURES = 0

    @mock.patch.object(DAEMON.time, "sleep")
    def test_retries_statement_timeout_without_recording_terminal_failure(self, sleep):
        timeout = urllib.error.HTTPError(
            "https://example.test", 500, "Internal Server Error", {},
            io.BytesIO(b'{"code":"57014","message":"canceling statement due to statement timeout"}'),
        )
        with mock.patch.object(
            DAEMON.urllib.request,
            "urlopen",
            side_effect=[timeout, self._Response()],
        ) as urlopen:
            self.assertTrue(DAEMON.sb_patch_rows("example", "?id=eq.1", {"active": False}))

        self.assertEqual(urlopen.call_count, 2)
        sleep.assert_called_once_with(2)
        self.assertEqual(DAEMON.WRITE_FAILURES, 0)

    def test_deterministic_contract_error_fails_without_retry(self):
        bad_request = urllib.error.HTTPError(
            "https://example.test", 400, "Bad Request", {},
            io.BytesIO(b'{"code":"PGRST102","message":"invalid json"}'),
        )
        with mock.patch.object(
            DAEMON.urllib.request,
            "urlopen",
            side_effect=bad_request,
        ) as urlopen:
            self.assertFalse(DAEMON.sb_patch_rows("example", "?id=eq.1", {"active": False}))

        self.assertEqual(urlopen.call_count, 1)
        self.assertEqual(DAEMON.WRITE_FAILURES, 1)

    def test_stale_cleanup_patches_only_exact_old_row_ids(self):
        rows = [
            {"id": "00000000-0000-0000-0000-000000000010", "scrape_batch_id": "old", "last_scraped": "2000-01-01T00:00:00+00:00"},
            {"id": "00000000-0000-0000-0000-000000000011", "scrape_batch_id": "current", "last_scraped": "2000-01-01T00:00:00+00:00"},
            {"id": "00000000-0000-0000-0000-000000000012", "scrape_batch_id": None, "last_scraped": None},
            {"id": "00000000-0000-0000-0000-000000000013", "scrape_batch_id": "recent", "last_scraped": "2099-01-01T00:00:00+00:00"},
        ]
        with mock.patch.object(DAEMON, "sb_get_checked", return_value=rows), mock.patch.object(
            DAEMON, "sb_patch_rows", return_value=True,
        ) as patch_rows:
            self.assertTrue(DAEMON.deactivate_stale_rows(3410, "current"))

        patch_rows.assert_called_once_with(
            "venue_daily_tournaments",
            "?id=in.(00000000-0000-0000-0000-000000000010,00000000-0000-0000-0000-000000000012)&is_active=eq.true",
            {"is_active": False},
        )

    def test_past_event_sweep_uses_bounded_exact_id_updates(self):
        row_id = "10000000-0000-0000-0000-000000000001"
        with mock.patch.object(
            DAEMON, "sb_get_checked", side_effect=[[{"id": row_id}], []],
        ), mock.patch.object(DAEMON, "sb_patch_rows", return_value=True) as patch_rows:
            self.assertTrue(DAEMON.deactivate_past_events(max_rows=2))

        patch_rows.assert_called_once_with(
            "venue_daily_tournaments",
            f"?id=in.({row_id})&is_active=eq.true",
            {"is_active": False},
        )

    def test_recurring_freshness_sweep_uses_exact_ids(self):
        row_id = "20000000-0000-0000-0000-000000000001"
        with mock.patch.object(
            DAEMON, "sb_get_checked",
            side_effect=[[{"id": row_id}], [], [], [], [], [], [], [], []],
        ) as get_rows, mock.patch.object(
            DAEMON, "sb_patch_rows", return_value=True,
        ) as patch_rows:
            self.assertTrue(DAEMON.deactivate_stale_recurring_projections())

        self.assertEqual(get_rows.call_count, 9)
        patch_rows.assert_called_once_with(
            "venue_daily_tournaments",
            f"?id=in.({row_id})&is_active=eq.true",
            {"is_active": False, "data_quality": "stale"},
        )


class SessionTruthTests(unittest.TestCase):
    class _Response:
        def __init__(self, status, html="", body=b""):
            self.status = status
            self.html_content = html
            self.body = body

    def test_access_blocks_count_as_errors_but_guessed_404s_do_not(self):
        manager = DAEMON.DaemonSessionManager()
        manager.session = mock.Mock()
        manager.session.fetch.return_value = object()
        with mock.patch.object(
            manager, "_await",
            side_effect=[self._Response(404), self._Response(403)],
        ):
            self.assertEqual(manager.fetch_page("https://example.test/missing"), "")
            self.assertEqual(manager.source_errors, 0)
            self.assertEqual(manager.fetch_page("https://example.test/blocked"), "")
            self.assertEqual(manager.source_errors, 1)
            self.assertEqual(manager.fetch_attempts, 2)

    def test_http_200_empty_body_is_rejected_and_counted(self):
        manager = DAEMON.DaemonSessionManager()
        manager.session = mock.Mock()
        manager.session.fetch.return_value = object()
        with mock.patch.object(manager, "_await", return_value=self._Response(200, "   ")):
            self.assertEqual(manager.fetch_page("https://example.test/empty"), "")
        self.assertEqual(manager.source_errors, 1)
        self.assertEqual(manager.consecutive_fetch_failures, 1)

    def test_http_200_challenge_is_counted_and_never_returned_as_evidence(self):
        manager = DAEMON.DaemonSessionManager()
        manager.session = mock.Mock()
        manager.session.fetch.return_value = object()
        challenge = "<html><title>Just a moment...</title><div id='cf-chl-widget'></div></html>"
        with mock.patch.object(manager, "_await", return_value=self._Response(200, challenge)), mock.patch.object(
            manager, "connect", return_value=False,
        ):
            self.assertEqual(manager.fetch_page("https://example.test/challenge"), "")
        self.assertEqual(manager.source_errors, 1)
        self.assertEqual(manager.fetch_attempts, 1)

    def test_challenge_retry_must_return_real_nonempty_html(self):
        manager = DAEMON.DaemonSessionManager()
        manager.session = mock.Mock()
        manager.session.fetch.return_value = object()
        responses = [
            self._Response(200, "<title>Security verification</title>"),
            self._Response(200, "<html><h1>Verified tournament schedule</h1></html>"),
        ]
        with mock.patch.object(manager, "_await", side_effect=responses), mock.patch.object(
            manager, "connect", return_value=True,
        ):
            html = manager.fetch_page("https://example.test/recovered")
        self.assertIn("Verified tournament schedule", html)
        self.assertEqual(manager.source_errors, 1)
        self.assertEqual(manager.fetch_attempts, 2)
        self.assertEqual(manager.consecutive_fetch_failures, 0)


class PdfTruthTests(unittest.TestCase):
    class _Response:
        def __init__(self, body):
            self.body = body

        def read(self):
            return self.body

        def __enter__(self):
            return self

        def __exit__(self, *_args):
            return False

    def test_pdf_network_error_is_counted(self):
        session = mock.Mock()
        with mock.patch.object(DAEMON, "PDF_OK", True), mock.patch.object(
            DAEMON.urllib.request, "urlopen", side_effect=OSError("network down"),
        ):
            self.assertEqual(DAEMON.extract_pdf("https://example.test/schedule.pdf", session), "")
        session.note_source_error.assert_called_once_with()

    def test_pdf_parser_error_is_counted(self):
        session = mock.Mock()
        parser = mock.Mock()
        parser.open.side_effect = ValueError("malformed PDF")
        with mock.patch.object(DAEMON, "PDF_OK", True), mock.patch.object(
            DAEMON.urllib.request, "urlopen", return_value=self._Response(b"%PDF-invalid"),
        ), mock.patch.object(DAEMON, "pdfplumber", parser, create=True):
            self.assertEqual(DAEMON.extract_pdf("https://example.test/schedule.pdf", session), "")
        session.note_source_error.assert_called_once_with()


class DryRunTruthTests(unittest.TestCase):
    def test_clean_source_evidence_is_success(self):
        outcome = DAEMON.classify_dry_run_cycle(
            records_observed=3, venues_processed=1, valid_empty_venues=0,
            source_errors=0, venue_exceptions=0,
        )
        self.assertEqual(outcome["run_status"], "success")

    def test_source_error_fails_even_when_some_evidence_was_found(self):
        outcome = DAEMON.classify_dry_run_cycle(
            records_observed=3, venues_processed=1, valid_empty_venues=0,
            source_errors=1, venue_exceptions=0,
        )
        self.assertEqual(outcome["run_status"], "partial")

    def test_venue_exception_fails_even_when_some_evidence_was_found(self):
        outcome = DAEMON.classify_dry_run_cycle(
            records_observed=1, venues_processed=2, valid_empty_venues=0,
            source_errors=0, venue_exceptions=1,
        )
        self.assertEqual(outcome["run_status"], "partial")

    def test_zero_evidence_is_failure_without_explicit_valid_empty(self):
        outcome = DAEMON.classify_dry_run_cycle(
            records_observed=0, venues_processed=1, valid_empty_venues=0,
            source_errors=0, venue_exceptions=0,
        )
        self.assertEqual(outcome["run_status"], "failed")
        self.assertEqual(outcome["status_reason"], "dry_run_zero_source_evidence")

    def test_zero_evidence_can_be_valid_empty_only_for_every_venue(self):
        outcome = DAEMON.classify_dry_run_cycle(
            records_observed=0, venues_processed=2, valid_empty_venues=2,
            source_errors=0, venue_exceptions=0,
        )
        self.assertEqual(outcome["run_status"], "valid_empty")


class HeartbeatTruthTests(unittest.TestCase):
    def test_main_refreshes_progress_heartbeat_before_and_during_venue_loop(self):
        source = MODULE_PATH.read_text(encoding="utf-8")
        self.assertIn(
            "carrying forward the prior PID/status during that window",
            source,
        )
        self.assertGreaterEqual(source.count('run_status="progress"'), 5)

    def test_heartbeat_persists_accumulated_source_error_counts(self):
        with tempfile.TemporaryDirectory() as temp_dir, mock.patch.object(
            DAEMON, "LOG_DIR", Path(temp_dir),
        ):
            DAEMON.write_heartbeat(
                4, 25, 8, "batch", source_errors=3, venue_exceptions=2,
            )
            payload = json.loads((Path(temp_dir) / "heartbeat.json").read_text())
        self.assertEqual(payload["source_errors"], 3)
        self.assertEqual(payload["venue_exceptions"], 2)


if __name__ == "__main__":
    unittest.main()
