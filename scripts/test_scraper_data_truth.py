#!/usr/bin/env python3
"""Executable behavior tests for scraper data-truth contracts."""

import unittest

from scraper_data_truth import (
    NON_PRODUCTION_POKERATLAS_VENUE_SLUGS,
    NON_US_POKERATLAS_REGION_SLUGS,
    NON_US_POKERATLAS_VENUE_SLUGS,
    RUN_FAILED,
    RUN_MAINTENANCE,
    RUN_PARTIAL,
    RUN_PROGRESS,
    RUN_SUCCESS,
    RUN_VALID_EMPTY,
    canonical_us_state_code,
    classify_persisted_run,
    fully_persisted_venue_ids,
    is_explicit_pokeratlas_cash_catalog_empty,
    is_noise_venue_label,
    is_verified_us_location,
    is_modeled_live_row,
    is_observed_bravo_row,
    normalize_venue_label,
    is_poker_tournament_event_text,
    pokeratlas_slug_from_url,
    stable_live_row_id,
    tour_stop_identity,
)


class ProvenanceTests(unittest.TestCase):
    def test_us_state_names_normalize_to_directory_codes(self):
        self.assertEqual(canonical_us_state_code("North Carolina"), "NC")
        self.assertEqual(canonical_us_state_code(" tx "), "TX")
        self.assertEqual(canonical_us_state_code("Ontario"), "")

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

    def test_fully_persisted_slice_with_fetch_error_has_an_accurate_reason(self):
        result = classify_persisted_run(attempted=17, persisted=17, errors=1)
        self.assertEqual(result["run_status"], RUN_PARTIAL)
        self.assertEqual(result["status_reason"], "cycle_completed_with_errors")

    def test_full_persist_is_success(self):
        result = classify_persisted_run(attempted=17, persisted=17)
        self.assertEqual(result["run_status"], RUN_SUCCESS)

    def test_impossible_persistence_counters_fail_before_metrics_write(self):
        with self.assertRaisesRegex(ValueError, "cannot exceed"):
            classify_persisted_run(attempted=1, persisted=2)
        with self.assertRaisesRegex(ValueError, "records_rejected"):
            classify_persisted_run(attempted=5, persisted=3, rejected=1)
        with self.assertRaisesRegex(ValueError, "cannot be negative"):
            classify_persisted_run(attempted=-1, persisted=0)

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

    def test_checkpoint_progress_and_maintenance_are_honest_zero_write_states(self):
        progress = classify_persisted_run(
            attempted=0, persisted=0, progress=True
        )
        maintenance = classify_persisted_run(
            attempted=0, persisted=0, maintenance=True
        )
        self.assertEqual(progress["run_status"], RUN_PROGRESS)
        self.assertEqual(maintenance["run_status"], RUN_MAINTENANCE)
        with self.assertRaises(ValueError):
            classify_persisted_run(
                attempted=0, persisted=0, progress=True, maintenance=True
            )
        with self.assertRaises(ValueError):
            classify_persisted_run(
                attempted=1, persisted=0, progress=True
            )

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

    def test_live_row_ids_are_negative_stable_and_batch_scoped(self):
        first = stable_live_row_id("bravo", "batch-1", "bellagio", "$1/$3 NLH")
        same = stable_live_row_id(" BRAVO ", "batch-1", "Bellagio", "$1/$3   NLH")
        next_batch = stable_live_row_id("bravo", "batch-2", "bellagio", "$1/$3 NLH")
        self.assertLess(first, 0)
        self.assertEqual(first, same)
        self.assertNotEqual(first, next_batch)
        with self.assertRaises(ValueError):
            stable_live_row_id("bravo", "", "bellagio", "$1/$3 NLH")


class TournamentEventTextTests(unittest.TestCase):
    def test_rejects_generic_casino_promotions_even_on_poker_pages(self):
        self.assertFalse(is_poker_tournament_event_text(
            "$100k Labor Day Weekend Giveaway Sunday, September 6 Durant Win "
            "Poker Room Tournament Schedule"
        ))
        self.assertFalse(is_poker_tournament_event_text(
            "$50,000 Lucky Ball Drawings Every Monday in September 10 winners "
            "Poker Tournament Calendar"
        ))

    def test_accepts_sparse_real_tournament_schedule_rows(self):
        accepted = (
            "$200 NLH Saturday September 12 5 PM",
            "$150 Deepstack Sep 10 7 PM",
            "$80 buy-in tournament October 4 6 PM",
            "$1,100 Pot-Limit Omaha Championship November 8 12 PM",
            "$250 Satellite Friday December 4 4 PM",
        )
        for candidate in accepted:
            with self.subTest(candidate=candidate):
                self.assertTrue(is_poker_tournament_event_text(candidate))

    def test_requires_local_poker_semantics_not_distant_page_navigation(self):
        candidate = "$99 Sunday Brunch September 13 11 AM " + ("hotel dining " * 40)
        candidate += "Poker Tournament Schedule"
        self.assertFalse(is_poker_tournament_event_text(candidate))


class PokerAtlasExplicitEmptyTests(unittest.TestCase):
    def test_accepts_only_the_source_explicit_no_information_state(self):
        self.assertTrue(is_explicit_pokeratlas_cash_catalog_empty(
            "<h2>Cash Games Offered</h2><p>Currently we don't have any cash "
            "game information for 20to1 Social Club.</p>"
        ))
        self.assertTrue(is_explicit_pokeratlas_cash_catalog_empty(
            "<h2>Juegos en efectivo ofrecidos</h2><p>Actualmente no tenemos "
            "información sobre juegos en efectivo en 20to1 Social Club.</p>"
        ))

    def test_does_not_convert_missing_markup_or_cloudflare_into_empty_catalog(self):
        self.assertFalse(is_explicit_pokeratlas_cash_catalog_empty(
            "<h2>Cash Games Offered</h2><div class='redesign-placeholder'></div>"
        ))
        self.assertFalse(is_explicit_pokeratlas_cash_catalog_empty(
            "<title>Attention Required!</title><h1>Sorry, you have been blocked</h1>"
        ))

    def test_copy_variants_are_limited_to_the_catalog_section(self):
        self.assertTrue(is_explicit_pokeratlas_cash_catalog_empty(
            "<h2>Cash Games Offered</h2><p>We don't currently have any "
            "information about cash games for this room.</p>"
        ))
        self.assertTrue(is_explicit_pokeratlas_cash_catalog_empty(
            "<h2>Cash Games Offered</h2><p>We currently don’t know about any "
            "cash games at 20to1 Social Club.</p>"
        ))
        self.assertFalse(is_explicit_pokeratlas_cash_catalog_empty(
            "<h2>Announcements</h2><p>There are no cash games tonight.</p>"
            "<h2>Cash Games Offered</h2><ol><li>1/2 No Limit Holdem</li></ol>"
        ))

    def test_hidden_script_style_and_noscript_copy_cannot_prove_empty(self):
        hidden = (
            "<h2>Cash Games Offered</h2>"
            "<script>We don't have any cash game information for this room.</script>"
            "<style>.x::after{content:'no cash game information available for';}</style>"
            "<noscript>We currently don't know about any cash games at this room.</noscript>"
        )
        self.assertFalse(is_explicit_pokeratlas_cash_catalog_empty(hidden))


class VenueIdentityTests(unittest.TestCase):
    def test_navigation_copy_is_not_a_venue(self):
        self.assertTrue(is_noise_venue_label("View Live Info + Wait List Registration"))
        self.assertTrue(is_noise_venue_label("  "))
        self.assertTrue(is_noise_venue_label(
            "brian7677 favorited Texas Card House Dallas about a minute ago"
        ))
        self.assertFalse(is_noise_venue_label("Deerfoot Inn &amp; Casino"))
        self.assertEqual(normalize_venue_label("Deerfoot  Inn &amp; Casino"), "Deerfoot Inn & Casino")
        self.assertIn("vancouver", NON_US_POKERATLAS_REGION_SLUGS)
        self.assertIn("caesars-windsor", NON_US_POKERATLAS_VENUE_SLUGS)
        self.assertIn(
            "casino-niagara-niagara-falls", NON_US_POKERATLAS_VENUE_SLUGS
        )
        self.assertIn("club-montmartre-paris", NON_US_POKERATLAS_VENUE_SLUGS)
        self.assertIn(
            "patc-las-vegas", NON_PRODUCTION_POKERATLAS_VENUE_SLUGS
        )

    def test_us_location_requires_a_real_us_state_and_no_foreign_country(self):
        self.assertTrue(is_verified_us_location({"state": "NV", "country": "US"}))
        self.assertTrue(is_verified_us_location({"addressRegion": "Oregon"}))
        self.assertFalse(is_verified_us_location({"state": "ON", "country": "CA"}))
        self.assertFalse(is_verified_us_location({"state": "NY", "country": "Canada"}))

    def test_pokeratlas_slug_extraction_ignores_route_suffixes(self):
        self.assertEqual(
            pokeratlas_slug_from_url(
                "https://www.pokeratlas.com/poker-room/bellagio-las-vegas/tournaments"
            ),
            "bellagio-las-vegas",
        )


class TourIdentityTests(unittest.TestCase):
    def test_same_stop_name_in_different_years_is_not_a_duplicate(self):
        first = tour_stop_identity({"stop_name": "Main Tour", "stop_start_date": "2026-05-01"})
        second = tour_stop_identity({"stop_name": "  MAIN   TOUR ", "start_date": "2027-05-01"})
        self.assertNotEqual(first, second)
        self.assertEqual(first, ("main tour", "2026-05-01"))

    def test_calendar_qualifier_does_not_duplicate_same_stop_and_date(self):
        source = tour_stop_identity({
            "stop_name": "WYNN SIGNATURE SERIES",
            "stop_start_date": "2026-08-17",
        })
        researched = tour_stop_identity({
            "stop_name": "Wynn Signature Series (August 2026)",
            "start_date": "2026-08-17",
        })
        self.assertEqual(source, researched)


if __name__ == "__main__":
    unittest.main()
