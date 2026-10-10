#!/usr/bin/env python3
"""Regression tests for the conservative tour-stop scraper contract."""

import unittest
from datetime import date
import io
import json
import sys
import types
from unittest import mock

import tour_stealth_scraper as scraper
# These legacy publishers are imported only to exercise their real parser and
# fail-disabled write guards. Their eager browser/client imports must not turn
# offline contracts into browser-package installation or credential access.
fetchers = types.ModuleType('scrapling.fetchers')
def forbidden_offline_transport(*_args, **_kwargs):
    raise AssertionError('offline parser contract attempted a browser transport')
fetchers.Fetcher = forbidden_offline_transport
fetchers.StealthySession = forbidden_offline_transport
fetchers.DynamicFetcher = forbidden_offline_transport
supabase_stub = types.ModuleType('supabase')
supabase_stub.create_client = lambda *_args, **_kwargs: None
dotenv_stub = types.ModuleType('dotenv')
dotenv_stub.load_dotenv = lambda *_args, **_kwargs: False
with mock.patch.dict(sys.modules, {'scrapling': types.ModuleType('scrapling'),
                                  'scrapling.fetchers': fetchers,
                                  'supabase': supabase_stub,
                                  'dotenv': dotenv_stub}):
    import scrape_tour_full_schedules as legacy_full
    import scrape_tour_native as legacy_native
    import scrape_tours_targeted as legacy_targeted


class TourStopExtractionTests(unittest.TestCase):
    def test_generic_parser_does_not_publish_commented_out_schedule(self):
        page = '<h1>Official Poker Schedule</h1><!-- <h2>Archived Poker Championship</h2><p>October 20-30, 2026</p> -->'
        self.assertEqual(scraper.extract_stops(page, 'https://tour.test/schedule/', date(2026, 10, 10)), [])

    def test_rrpt_calendar_start_avoids_marketing_dates_and_unqualified_duration(self):
        url = 'https://roughriderpokertour.com/upcoming-events/'
        event = {'@type': 'Event', 'eventStatus': 'https://schema.org/EventScheduled',
                 'name': '&quot;RPT Minnesota Poker Return Part II&quot; - $10,000 Golden Tickets!',
                 'url': 'https://roughriderpokertour.com/events/minnesota-return/',
                 'startDate': '2026-10-15T09:30-5:00', 'endDate': '2026-10-18T23:41-5:00',
                 'location': [{'@type': 'Place', 'name': 'Jackpot Junction'}]}
        def page(entry):
            return '<h2>The Top 10 finishers receive Golden Tickets!</h2><p>November 19-22, 2026</p><script type="application/ld+json">' + json.dumps(entry) + '</script>'
        stops = scraper.extract_stops(page(event), url, date(2026, 10, 10), 'RRPT')
        self.assertEqual(stops, [{'stop_name': 'RPT Minnesota Poker Return Part II',
                                 'start': '2026-10-15', 'end': '2026-10-15',
                                 'source_scope': 'published event-calendar start', 'venue': 'Jackpot Junction'}])
        row = scraper.build_stop_row('RRPT', stops[0], url, 'a' * 64, '2026-10-10T00:00:00Z')
        self.assertIn('full festival duration and event pricing unqualified', row['notes'])
        self.assertNotIn('buy_in', row)
        self.assertEqual(scraper.extract_stops(page(dict(event, startDate='2026-11-5')), url, date(2026, 10, 10), 'RRPT')[0]['start'], '2026-11-05')
        for invalid in (dict(event, startDate='2026-02-30'), dict(event, startDate='November 5'),
                        dict(event, eventStatus='https://schema.org/EventCancelled'),
                        dict(event, name=None), dict(event, name={'title': 'Unknown'}),
                        dict(event, name=''), dict(event, url='https://[invalid/'),
                        dict(event, url='http://roughriderpokertour.com/events/minnesota/'),
                        dict(event, url='https://foreign.test/events/minnesota/'),
                        dict(event, url='https://roughriderpokertour.com/promotions/')):
            self.assertEqual(scraper.extract_stops(page(invalid), url, date(2026, 10, 10), 'RRPT'), [])
        self.assertEqual(scraper.extract_stops('<h2>The Road to Vegas Starts Here</h2><p>October 15-18, 2026</p>', url, date(2026, 10, 10), 'RRPT'), [])
        self.assertEqual(scraper.extract_stops('<!--' + page(event) + '-->', url, date(2026, 10, 10), 'RRPT'), [])
        self.assertEqual(scraper.extract_stops('<!--' + page(event) + '-->' + page(event), url, date(2026, 10, 10), 'RRPT'), stops)

    def test_verification_allows_form_captcha_script_but_refuses_interstitial(self):
        page = ('<title>Trailblazer Poker Tour</title>'
                '<script src="https://www.gstatic.com/recaptcha/releases/version/recaptcha__en.js"></script>'
                '<h1>Trailblazer Poker Tour</h1><p>Upcoming poker events and tournament schedule</p>'
                + '<p>Official venue schedule information</p>' * 40)
        self.assertTrue(scraper.verify_html(page))
        for challenge in ('<title>Just a moment...</title>',
                          '<title>CAPTCHA verification</title>',
                          '<title>Attention Required</title>',
                          '<h1>Access denied</h1>',
                          '<h1>Please complete the CAPTCHA</h1>',
                          '<h1>Verify you are human</h1>'):
            self.assertFalse(scraper.verify_html(challenge + page))
        self.assertFalse(scraper.verify_html('<script>poker tournament schedule</script>' * 60))

    def test_venetian_visible_series_paragraphs_not_cta_or_marketing_heading(self):
        page = '''<h2>DeepStack Extravaganza Poker Series</h2>
          <p><b>Current Series:<br /> </b>DeepStack Showdown (October)<br />
          September 28 – October 27, 2026<br />Nearly $1 Million guaranteed</p>
          <p><a href="/schedule.pdf">View Poker Tournament Schedule</a></p>
          <p><b>Next Series:<br /> </b>WPT Fall Festival<br />October 28 - November 15, 2026<br />Nearly $4 Million guaranteed</p>
          <p><b>Next Series:<br /> </b>DeepStack Extravaganza IV<br />November 16 – December 23, 2026</p>
          <p><b>Next Series:<br /> </b>DeepStack Extravaganza NYE<br />December 24, 2026 - January 10, 2027</p>
          <p><b>Next Series:<br /> </b>DeepStack Championship 2027<br />May-July TBD</p>'''
        stops = scraper.extract_stops(page, 'https://www.venetianlasvegas.com/resort/casino/poker/deepstack-extravaganza-poker-tournament.html', date(2026, 10, 10), 'VENETIAN')
        self.assertEqual([stop['stop_name'] for stop in stops], ['DeepStack Showdown (October)', 'WPT Fall Festival', 'DeepStack Extravaganza IV', 'DeepStack Extravaganza NYE'])
        self.assertEqual(stops[-1]['start'], '2026-12-24')
        self.assertEqual(stops[-1]['end'], '2027-01-10')
        self.assertEqual(scraper.extract_stops(page.replace('2026', '2024').replace('2027', '2025'), 'https://www.venetianlasvegas.com/schedule', date(2026, 10, 10), 'VENETIAN'), [])

    def test_rgps_dated_schedule_table_does_not_pair_navigation_or_prior_row(self):
        page = '''<h2>2023 RGPS Road Trip Past Events</h2><p>November 25 to December 1, 2026</p>
          <h2>2026 RunGood Poker Series Fall Schedule</h2><table><thead><tr><th>Dates</th><th>Venue</th><th>Location</th></tr></thead><tbody>
          <tr><td>October 12 to 18</td><td>Champions Club Texas</td><td>Houston, Texas</td></tr>
          <tr><td>October 20 to 25</td><td>Hard Rock Tulsa</td><td>Tulsa, Oklahoma</td></tr>
          <tr><td>November 27 to December 3</td><td><strong>Dream Factory Festival</strong> at Thunder Valley Casino Resort</td><td>Lincoln, California</td></tr>
          <tr><td>October 20 to 25</td><td>Hilton Aruba Casino</td><td>Aruba</td></tr>
          </tbody></table><footer>Copyright 2026</footer>'''
        url = 'https://www.rungood.com/blogs/tour-news-1/rungood-poker-series-announces-2026-fall-season-golden-expedition'
        stops = scraper.extract_stops(page, url, date(2026, 10, 10), 'RGPS')
        self.assertEqual(len(stops), 3)
        self.assertEqual(stops[0], {'stop_name': 'Champions Club Texas', 'start': '2026-10-12', 'end': '2026-10-18', 'venue': 'Champions Club Texas', 'city': 'Houston', 'state': 'TX'})
        self.assertEqual(stops[2]['end'], '2026-12-03')
        # Shopify's browser hydration inserts this source-owned wrapper. The
        # maintained StealthySession reads the hydrated page, not raw HTTP HTML.
        rendered = page.replace('</h2><table>', '</h2><div class="table-wrapper"><table>')
        self.assertEqual(scraper.extract_stops(rendered, url, date(2026, 10, 10), 'RGPS'), stops)
        self.assertEqual(scraper.extract_stops('<!--' + rendered + '-->', url, date(2026, 10, 10), 'RGPS'), [])
        self.assertEqual(scraper.extract_stops('<!--' + rendered + '-->' + rendered, url, date(2026, 10, 10), 'RGPS'), stops)
        self.assertEqual(scraper.extract_stops(page.replace('2026 RunGood', 'RunGood'), url, date(2026, 10, 10), 'RGPS'), [])

    def test_seminole_dated_rows_yield_only_source_owned_series_envelope(self):
        page = '''<h1 class="entry-title">2026 Rock &#8216;N&#8217; Roll Poker Open Schedule</h1>
          <table><thead><tr><th>Event</th><th>Date</th><th>Time</th><th>Buy-In</th><th>Tournament Description</th><th>Details</th></tr></thead><tbody>
          <tr><td>1</td><td>Tuesday, November 17, 2026</td><td>4PM</td><td>$300</td><td>Slater Scoops Quad Stack NLH - $100,000 GTD</td><td>Structure</td></tr>
          <tr><td>2A</td><td>Wednesday, November 18, 2026</td><td>10AM</td><td>$400</td><td>Deep Stack No Limit Hold'em Flight A</td><td>Structure</td></tr>
          <tr><td>79</td><td>Tuesday, December 1, 2026</td><td>12PM</td><td>$150</td><td>Satellite</td><td></td></tr>
          <tr><td>80</td><td>Tuesday, December 2, 2025</td><td>12PM</td><td>$150</td><td>Old Satellite</td><td></td></tr>
          </tbody></table>'''
        url = 'https://www.seminolehardrockpokeropen.com/2026-rock-n-roll-poker-open-schedule/'
        stops = scraper.extract_stops(page, url, date(2026, 10, 10), 'SHRPO')
        self.assertEqual(stops, [{'stop_name': '2026 Rock ‘N’ Roll Poker Open', 'start': '2026-11-17', 'end': '2026-12-01', 'source_scope': 'dated schedule envelope'}])
        # The actual maintained database/API family is SEMINOLE. SHRPO is only
        # its older source alias and must not strand the persisted code.
        self.assertEqual(scraper.extract_stops(page, url, date(2026, 10, 10), 'SEMINOLE'), stops)
        for code in ('SEMINOLE', 'SHRPO'):
            self.assertEqual(scraper.tour_page_identity(code, 'Seminole Hard Rock Poker Open',
                'https://www.seminolehardrockpokeropen.com/schedule/', url, page),
                (True, 'source_owned_seminole_schedule'))
        row = scraper.build_stop_row('SEMINOLE', stops[0], url, 'a' * 64, '2026-10-10T00:00:00Z')
        self.assertEqual(row['tour_code'], 'SEMINOLE')
        self.assertIn('schedule date envelope', row['notes'])
        self.assertNotIn('buy_in', row)
        self.assertNotIn('event_number', row)
        self.assertEqual(scraper.extract_stops(page.replace('2026', '2024'), url, date(2026, 10, 10), 'SHRPO'), [])

    def test_tch_source_owned_embedded_festival_spans_preserve_publication_truth(self):
        entries = [
            {'stop': 1.0, 'name': 'Stop 1 · Dallas & Las Colinas', 'venues': 'Dallas · Las Colinas', 'start_iso': '2026-08-25', 'end_iso': '2026-09-08', 'schedule_published': 1.0},
            {'stop': 2.0, 'name': 'Stop 2 · Dallas & Las Colinas', 'venues': 'Dallas · Las Colinas', 'start_iso': '2026-10-08', 'end_iso': '2026-10-19', 'guarantee': '$1,000,000 GTD', 'schedule_published': 1.0},
            {'stop': 3.0, 'name': 'Stop 3 · Spring', 'venues': 'Spring', 'start_iso': '2026-10-27', 'end_iso': '2026-11-09', 'schedule_published': 1.0},
            {'stop': 4.0, 'name': 'Stop 4 · Houston', 'venues': 'Houston', 'start_iso': '2026-12-26', 'end_iso': '2027-01-11', 'schedule_published': 0.0},
            {'stop': 5.0, 'name': 'Stop 5 · Austin', 'venues': 'Austin', 'start_iso': '2027-02-10', 'end_iso': '2027-02-22', 'schedule_published': 0.0},
        ]
        page = '<title>Home | Trailblazer Poker Tour</title><script type="application/json" class="ts-data">' + json.dumps(entries) + '</script>'
        url = 'https://trailblazer.texascardhouse.com/'
        self.assertEqual(scraper.tour_page_identity('TCH', 'Texas Card House Series', url, url, page), (True, 'source_owned_trailblazer_stops'))
        stops = scraper.extract_stops(page, url, date(2026, 10, 10), 'TCH')
        self.assertEqual(len(stops), 4)
        self.assertEqual(stops[0]['start'], '2026-10-08')
        self.assertEqual(stops[2]['start'], '2026-12-26')
        self.assertEqual(stops[2]['end'], '2027-01-11')
        self.assertFalse(stops[2]['schedule_published'])
        row = scraper.build_stop_row('TCH', stops[2], url, 'a' * 64, '2026-10-10T00:00:00Z')
        self.assertEqual(row['event_name'], 'Stop 4 · Houston')
        self.assertIn('individual schedule unpublished', row['notes'])
        for field in ('buy_in', 'event_number', 'stop_city', 'stop_state'):
            self.assertNotIn(field, row)

    def test_tch_rejects_invalid_spans_wrong_json_and_unqualified_year(self):
        good = {'stop': 2.0, 'name': 'Stop 2 · Spring', 'start_iso': '2026-10-27', 'end_iso': '2026-11-09'}
        invalid = [dict(good, start_iso=None), dict(good, start_iso='2026-02-30'),
                   dict(good, end_iso='2026-10-26'), dict(good, stop=3),
                   dict(good, start_iso='October 27'), dict(good, name='View Schedule')]
        url = 'https://trailblazer.texascardhouse.com/'
        page = '<script type="application/json" class="ts-data">' + json.dumps(invalid) + '</script><footer>2026</footer>'
        self.assertEqual(scraper.extract_stops(page, url, date(2026, 10, 10), 'TCH'), [])
        unrelated = '<script type="application/json" class="ev-data">' + json.dumps([good]) + '</script>'
        self.assertEqual(scraper.extract_stops(unrelated, url, date(2026, 10, 10), 'TCH'), [])
        forged = '<title>Trailblazer Poker Tour</title><script type="application/json" class="ts-data">' + json.dumps([good]) + '</script>'
        self.assertEqual(scraper.extract_stops(forged, 'https://foreign.test/', date(2026, 10, 10), 'TCH'), [])
        self.assertFalse(scraper.tour_page_identity('TCH', 'Texas Card House Series', 'https://foreign.test/', 'https://foreign.test/', forged)[0])

    def test_yearless_dates_are_not_guessed_or_rolled_forward(self):
        page = '<h2>WPT Championship</h2><p>Jan 1 - 10</p><footer>Copyright 2026</footer>'
        self.assertEqual(scraper.extract_stops(page, 'https://tour.test/schedule', date(2026, 10, 9)), [])
        self.assertIsNone(scraper._iso('Jan', 1, None))

    def test_explicit_schedule_year_keeps_expired_dates_expired(self):
        page = '<h1>2026 Schedule</h1><h2>WPT Championship</h2><p>Jan 1 - 10</p>'
        self.assertEqual(scraper.extract_stops(page, 'https://tour.test/schedule', date(2026, 10, 9)), [])

    def test_explicit_schedule_year_qualifies_current_range(self):
        page = '<h1>2026 Schedule</h1><h2>WPT Championship</h2><p>Oct 20 - 30</p>'
        self.assertEqual(scraper.extract_stops(page, 'https://tour.test/schedule', date(2026, 10, 9)),
                         [{'stop_name': 'WPT Championship', 'start': '2026-10-20', 'end': '2026-10-30'}])

    def test_key_loader_never_reads_environment_file(self):
        with mock.patch.dict(scraper.os.environ, {}, clear=True), mock.patch.object(scraper.Path, 'read_text') as read:
            self.assertIsNone(scraper._load_supabase_key())
            read.assert_not_called()

    def test_explicit_cross_year_range_uses_ending_year(self):
        page = '<h2>WPT Championship</h2><p>Dec 28 - Jan 4, 2027</p>'
        self.assertEqual(scraper.extract_stops(page, 'https://tour.test/schedule', date(2026, 10, 9)),
                         [{'stop_name': 'WPT Championship', 'start': '2026-12-28', 'end': '2027-01-04'}])

    def test_explicit_contradictory_end_year_is_not_repaired(self):
        page = '<h2>WPT Championship</h2><p>Dec 28 2026 - Jan 4 2025</p>'
        self.assertEqual(scraper.extract_stops(page, 'https://tour.test/schedule', date(2026, 10, 9)), [])
        page = '<h2>WPT Championship</h2><p>Dec 28 2026 - Jan 4</p>'
        self.assertEqual(scraper.extract_stops(page, 'https://tour.test/schedule', date(2026, 10, 9)),
                         [{'stop_name': 'WPT Championship', 'start': '2026-12-28', 'end': '2027-01-04'}])

    def test_stop_summary_does_not_invent_event_details(self):
        stop = {'stop_name': 'WPT Championship', 'start': '2026-12-28', 'end': '2027-01-04'}
        row = scraper.build_stop_row('WPT', stop, 'https://tour.test/schedule', 'a' * 64, '2026-10-09T22:00:00Z')
        self.assertEqual(row['event_name'], stop['stop_name'])
        self.assertEqual(row['data_quality'], 'scraped_inferred')
        self.assertNotIn('buy_in', row)
        self.assertNotIn('event_number', row)

    def test_current_wsop_circuit_cards_use_explicit_years_and_us_location(self):
        card = '<li data-competition-type="circuit"><p class="series-name">WSOP Circuit - Turning Stone</p><span class="date">Oct 15 2026 - Oct 26 2026</span><span class="location">Verona, NY, United States</span></li>'
        foreign = card.replace('Verona, NY, United States', 'Calgary, AB, Canada')
        stops = scraper.extract_stops(card + foreign, 'https://www.wsop.com/schedule/', date(2026, 10, 9), 'WSOPC')
        self.assertEqual(stops, [{'stop_name': 'WSOP Circuit - Turning Stone', 'start': '2026-10-15', 'end': '2026-10-26', 'venue': 'Turning Stone', 'city': 'Verona', 'state': 'NY'}])
        self.assertEqual(scraper.tour_page_identity('WSOPC', 'WSOP Circuit', 'https://www.wsop.com/schedule/', 'https://www.wsop.com/schedule/', card), (True, 'source_owned_circuit_cards'))

    def test_pgt_jsonld_requires_explicit_date_and_owned_organizer(self):
        event = {'@type': 'Event', 'name': "Poker Masters #1 - $10,500 No-Limit Hold'em", 'startDate': '2026-10-12T19:00:37Z', 'organizer': {'name': 'PokerGO Tour'}, 'location': {'name': 'PokerGO Studio, Las Vegas, Nevada'}}
        missing = dict(event, name='PGT Sprint'); missing.pop('startDate')
        foreign = dict(event, name='Foreign Event', organizer={'name': 'Other Tour'})
        page = '<script type="application/ld+json">' + json.dumps({'@type': 'ItemList', 'itemListElement': [{'item': event}, {'item': missing}, {'item': foreign}]}) + '</script><footer>2026</footer>'
        stops = scraper.extract_stops(page, 'https://www.pgt.com/schedule', date(2026, 10, 9), 'PGT')
        self.assertEqual(len(stops), 1)
        self.assertEqual(stops[0]['start'], '2026-10-12')
        row = scraper.build_stop_row('PGT', stops[0], 'https://www.pgt.com/schedule', 'a' * 64, '2026-10-09T22:00:00Z')
        self.assertIn('calendar point date only', row['notes'])
        self.assertNotIn('buy_in', row)

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
    def test_retirement_cas_refuses_concurrent_manual_owner_and_event_details(self):
        row = self.owned_row()
        self.assertEqual(scraper.retirable_stop_ids(
            [dict(row, event_number=7)], [dict(self.current_stop(), stop_name='Other')],
            row['source_url'], date(2026, 10, 10)), [])
        current = dict(row, tour_code='WPT', data_quality='manual_research', notes='Curator edit')
        class Response:
            def __enter__(self): return self
            def __exit__(self, *_args): return False
            def read(self): return b'[]'
        def changed_owner(req, **_kwargs):
            params = scraper.urllib.parse.parse_qs(scraper.urllib.parse.urlsplit(req.full_url).query)
            self.assertEqual(params['data_quality'], ['eq.scraped_inferred'])
            self.assertNotEqual(params['data_quality'], ['eq.' + current['data_quality']])
            return Response()
        with mock.patch.object(scraper.urllib.request, 'urlopen', side_effect=changed_owner):
            self.assertFalse(scraper.cas_stop_patch('WPT', row, {'data_quality': 'stale'}))
        self.assertEqual(current['data_quality'], 'manual_research')
        self.assertEqual(current['notes'], 'Curator edit')

    def test_duplicate_stale_summaries_and_event_details_are_not_reactivated(self):
        row = dict(self.owned_row(), data_quality='stale')
        stop = self.current_stop()
        self.assertEqual(scraper.reactivatable_stop_matches(
            [row, dict(row, id='duplicate-stale-owner')], [stop], row['source_url']), [])
        self.assertEqual(scraper.reactivatable_stop_matches(
            [dict(row, event_number=7)], [stop], row['source_url']), [])

    def owned_row(self):
        return {'id': '00000000-0000-0000-0000-000000000001', 'stop_name': 'Current Classic',
                'stop_start_date': '2099-11-01', 'stop_end_date': '2099-11-10', 'start_date': '2099-11-01',
                'data_quality': 'scraped_inferred', 'scrape_script': 'tour_stealth_scraper.py',
                'source_url': 'https://tour.test/schedule', 'scrape_timestamp': '2026-09-07T00:00:00+00:00',
                'scrape_html_hash': 'b' * 64, 'event_number': None}

    def current_stop(self):
        return {'stop_name': 'Current Classic', 'start': '2099-11-01', 'end': '2099-11-10'}

    def test_refresh_selects_owned_inferred_only_and_preserves_curated_owner(self):
        row, stop = self.owned_row(), self.current_stop()
        self.assertEqual(scraper.refreshable_stop_matches([row], [stop], row['source_url']), [(row, stop)])
        for changed in ({'data_quality': 'manual_research'}, {'data_quality': 'scraped_verified'},
                        {'scrape_script': 'other.py'}, {'source_url': 'https://other.test/schedule'},
                        {'event_number': 1}, {'stop_end_date': '2099-11-11'}):
            self.assertEqual(scraper.refreshable_stop_matches([dict(row, **changed)], [stop], row['source_url']), [])
        curated = dict(row, id='curated-owner', data_quality='manual_research')
        self.assertEqual(scraper.refreshable_stop_matches([row, curated], [stop], row['source_url']), [])

    def test_refresh_cas_readback_retains_dates_and_is_duplicate_safe(self):
        row, stop, requests = self.owned_row(), self.current_stop(), []
        now = '2026-10-10T04:30:00Z'
        class Response:
            def __init__(self, value): self.value = value
            def __enter__(self): return self
            def __exit__(self, *_args): return False
            def read(self): return json.dumps(self.value).encode()
        def write(req, **_kwargs):
            requests.append(req)
            patch = json.loads(req.data)
            return Response([dict(row, tour_code='WPT', **patch)])
        with mock.patch.object(scraper.urllib.request, 'urlopen', side_effect=write):
            self.assertTrue(scraper.refresh_stop_provenance('WPT', row, stop, row['source_url'], 'a' * 64, now))
        params = scraper.urllib.parse.parse_qs(scraper.urllib.parse.urlsplit(requests[0].full_url).query)
        self.assertEqual(params['id'], ['eq.' + row['id']])
        self.assertEqual(params['scrape_timestamp'], ['eq.' + row['scrape_timestamp']])
        self.assertEqual(params['scrape_script'], ['eq.tour_stealth_scraper.py'])
        self.assertEqual(params['source_url'], ['eq.' + row['source_url']])
        self.assertEqual(params['data_quality'], ['eq.scraped_inferred'])
        self.assertEqual(params['event_number'], ['is.null'])
        patch = json.loads(requests[0].data)
        for key in ('stop_name', 'stop_start_date', 'stop_end_date', 'event_name', 'event_number', 'buy_in'):
            self.assertNotIn(key, patch)
        # A retry starts from a fresh durable preimage, updates the same ID and
        # never enters the insertion path.
        refreshed = dict(row, **patch)
        with mock.patch.object(scraper.urllib.request, 'urlopen', return_value=Response([])):
            self.assertFalse(scraper.refresh_stop_provenance('WPT', row, stop, row['source_url'], 'a' * 64, now))
        with mock.patch.object(scraper.urllib.request, 'urlopen', return_value=Response([dict(refreshed, tour_code='WPT')])):
            self.assertTrue(scraper.refresh_stop_provenance('WPT', refreshed, stop, row['source_url'], 'a' * 64, now))
        with mock.patch.object(scraper.urllib.request, 'urlopen', return_value=Response([dict(refreshed, id='wrong-id', tour_code='WPT')])):
            self.assertFalse(scraper.refresh_stop_provenance('WPT', row, stop, row['source_url'], 'a' * 64, now))

    def test_refresh_refuses_foreign_preimage_before_transport(self):
        row = dict(self.owned_row(), scrape_script='manual.py')
        with mock.patch.object(scraper.urllib.request, 'urlopen') as transport:
            self.assertFalse(scraper.refresh_stop_provenance('WPT', row, self.current_stop(), row['source_url'], 'a' * 64, '2026-10-10T00:00:00Z'))
        transport.assert_not_called()

    def test_reactivation_cas_preserves_foreign_or_concurrently_changed_owners(self):
        row = dict(self.owned_row(), data_quality='stale', notes='Original source note',
                   event_name='Current Classic', stop_venue='Original Venue')
        stop, requests = self.current_stop(), []
        now = '2026-10-10T04:30:00Z'
        class Response:
            def __init__(self, value): self.value = value
            def __enter__(self): return self
            def __exit__(self, *_args): return False
            def read(self): return json.dumps(self.value).encode()
        def write(req, **_kwargs):
            requests.append(req)
            return Response([dict(row, **json.loads(req.data))])
        with mock.patch.object(scraper.urllib.request, 'urlopen', side_effect=write):
            self.assertTrue(scraper.reactivate_stop_from_preimage('WPT', row, stop, row['source_url'], 'a' * 64, now))
        params = scraper.urllib.parse.parse_qs(scraper.urllib.parse.urlsplit(requests[0].full_url).query)
        for key in ('id', 'stop_name', 'start_date', 'stop_start_date', 'stop_end_date',
                    'data_quality', 'scrape_script', 'source_url', 'scrape_timestamp',
                    'scrape_html_hash', 'notes', 'event_name', 'stop_venue'):
            self.assertEqual(params[key], ['eq.' + str(row[key])], key)
        self.assertEqual(params['data_quality'], ['eq.stale'])
        with mock.patch.object(scraper.urllib.request, 'urlopen', return_value=Response([])):
            self.assertFalse(scraper.reactivate_stop_from_preimage('WPT', row, stop, row['source_url'], 'a' * 64, now))
        with mock.patch.object(scraper.urllib.request, 'urlopen') as transport:
            self.assertFalse(scraper.reactivate_stop_from_preimage('WPT', dict(row, scrape_script='manual.py'), stop, row['source_url'], 'a' * 64, now))
            self.assertFalse(scraper.reactivate_stop_from_preimage('WPT', dict(row, data_quality='manual_research'), stop, row['source_url'], 'a' * 64, now))
        transport.assert_not_called()

    def test_existing_current_rows_count_actual_refresh_confirmation_and_failure(self):
        session = mock.Mock()
        for succeeds in (True, False):
            heartbeats, registry_updates = [], []
            row = self.owned_row()
            rows = [dict(row, id=f'00000000-0000-0000-0000-{index:012d}', stop_name=f'Current Classic {index}') for index in range(1, 11)]
            stops = [dict(self.current_stop(), stop_name=value['stop_name']) for value in rows]
            with mock.patch.object(sys, 'argv', ['tour_stealth_scraper.py']), \
                 mock.patch.object(scraper, 'SUPABASE_KEY', 'offline-key'), \
                 mock.patch.object(scraper, 'load_tours', return_value=[('WPT', 'World Poker Tour', row['source_url'])]), \
                 mock.patch.object(scraper, 'create_session', return_value=session), \
                 mock.patch.object(scraper, 'fetch_page', return_value=('poker schedule ' * 100, 'a' * 64, session, row['source_url'])), \
                 mock.patch.object(scraper, 'tour_page_identity', return_value=(True, 'source_owned')), \
                 mock.patch.object(scraper, 'extract_stops', return_value=stops), \
                 mock.patch.object(scraper, 'sb_get', return_value=rows), \
                 mock.patch.object(scraper, 'sb_insert', return_value=0) as insert, \
                 mock.patch.object(scraper, 'refresh_stop_provenance', return_value=succeeds) as refresh, \
                 mock.patch.object(scraper, 'update_tour_registry', side_effect=lambda *args: registry_updates.append(args) or True), \
                 mock.patch.object(scraper, 'write_heartbeat', side_effect=lambda **kw: heartbeats.append(kw)), \
                 mock.patch.object(scraper.time, 'sleep'):
                if succeeds:
                    scraper.main()
                else:
                    with self.assertRaises(SystemExit) as stopped:
                        scraper.main()
                    self.assertEqual(stopped.exception.code, 1)
            insert.assert_called_once_with('tour_stop_events', [])
            self.assertEqual(refresh.call_count, 10)
            self.assertEqual(heartbeats[-1]['records_attempted'], 10)
            self.assertEqual(heartbeats[-1]['records_written'], 10 * int(succeeds))
            self.assertEqual(heartbeats[-1]['records_rejected'], 10 * int(not succeeds))
            self.assertEqual(registry_updates[-1][2], 'active' if succeeds else 'error')

    def test_foreign_stale_identity_cannot_claim_a_servable_schedule(self):
        for writer in ('manual.py', 'tour_stealth_scraper.py'):
            self.assert_unservable_identity_fails_closed(writer)

    def assert_unservable_identity_fails_closed(self, writer):
        row = dict(self.owned_row(), data_quality='stale', scrape_script=writer)
        heartbeats, registry_updates = [], []
        session = mock.Mock()
        with mock.patch.object(sys, 'argv', ['tour_stealth_scraper.py']), \
             mock.patch.object(scraper, 'SUPABASE_KEY', 'offline-key'), \
             mock.patch.object(scraper, 'load_tours', return_value=[('WPT', 'World Poker Tour', row['source_url'])]), \
             mock.patch.object(scraper, 'create_session', return_value=session), \
             mock.patch.object(scraper, 'fetch_page', return_value=('poker schedule ' * 100, 'a' * 64, session, row['source_url'])), \
             mock.patch.object(scraper, 'tour_page_identity', return_value=(True, 'source_owned')), \
             mock.patch.object(scraper, 'extract_stops', return_value=[self.current_stop()]), \
             mock.patch.object(scraper, 'sb_get', return_value=[row]), \
             mock.patch.object(scraper, 'sb_insert', return_value=0) as insert, \
             mock.patch.object(scraper, 'sb_patch_exact_ids') as patch, \
             mock.patch.object(scraper, 'reactivate_stop_from_preimage', return_value=False) as reactivate, \
             mock.patch.object(scraper, 'update_tour_registry', side_effect=lambda *args: registry_updates.append(args) or True), \
             mock.patch.object(scraper, 'write_heartbeat', side_effect=lambda **kw: heartbeats.append(kw)), \
             mock.patch.object(scraper.time, 'sleep'):
            with self.assertRaises(SystemExit) as stopped:
                scraper.main()
            self.assertEqual(stopped.exception.code, 1)
        insert.assert_called_once_with('tour_stop_events', [])
        patch.assert_not_called()
        self.assertEqual(reactivate.call_count, int(writer == 'tour_stealth_scraper.py'))
        self.assertEqual(heartbeats[-1]['records_attempted'], 1)
        self.assertEqual(heartbeats[-1]['records_written'], 0)
        self.assertEqual(heartbeats[-1]['records_rejected'], 1)
        self.assertEqual(registry_updates[-1][2], 'error')

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
            '<li data-competition-type="circuit"><p class="series-name">WSOP Circuit - Turning Stone</p>'
            '<span class="date">September 18 2099 - September 28 2099</span>'
            '<span class="location">Verona, NY, United States</span></li>'
            + (" poker tournament schedule event " * 80) + "</body></html>"
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
