#!/usr/bin/env python3
"""Behavior tests for fail-closed PokerAtlas discovery and venue ingest."""

import json
import sys
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest import mock


SCRIPTS_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPTS_DIR))

import discover_pokeratlas_slugs as discovery
import ingest_missing_pa_venues as ingest


class _Page:
    def __init__(self, html, *, status=200, url=''):
        self.status = status
        self.body = html.encode('utf-8')
        self.text = html
        self.url = url


class _AsyncSession:
    def __init__(self, page):
        self.page = page

    async def fetch(self, url, google_search=False):
        return self.page


class _AsyncSessionContext:
    async def __aenter__(self):
        return object()

    async def __aexit__(self, exc_type, exc, traceback):
        return False


def _room(slug, name, source):
    return {
        'slug': slug,
        'name': name,
        'tournament_url': f'https://www.pokeratlas.com/poker-room/{slug}/tournaments',
        'discovered_from': source,
        'discovered_at': '2026-09-06T12:00:00+00:00',
        'http_status': 200,
    }


def _venue_jsonld(*, name='Test Room', state='TX', country='US'):
    return json.dumps({
        '@context': 'https://schema.org',
        '@graph': [{
            '@type': 'Casino',
            'name': name,
            'address': {
                '@type': 'PostalAddress',
                'streetAddress': '100 Main Street',
                'addressLocality': 'Austin',
                'addressRegion': state,
                'postalCode': '78701',
                'addressCountry': country,
            },
        }],
    })


class DiscoveryContractTests(unittest.TestCase):
    def _scrape(self, html):
        page = _Page(html, url='https://www.pokeratlas.com/poker-rooms/regions/texas')
        with mock.patch.object(discovery.StealthyFetcher, 'fetch', return_value=page):
            return discovery.scrape_region_page(page.url)

    def test_http_200_challenge_is_not_a_successful_page(self):
        venues, subregions, ok = self._scrape(
            '<html><title>Just a moment...</title><div id="cf-chl-widget"></div></html>'
        )
        self.assertFalse(ok)
        self.assertEqual(venues, [])
        self.assertEqual(subregions, [])

    def test_http_200_without_rooms_or_explicit_empty_marker_is_ambiguous(self):
        venues, _, ok = self._scrape('<html><title>Texas</title><main>Loading...</main></html>')
        self.assertFalse(ok)
        self.assertEqual(venues, [])

    def test_explicit_empty_directory_is_a_valid_empty_page(self):
        venues, _, ok = self._scrape(
            '<html><title>Texas Poker Rooms</title><main>No poker rooms were found</main></html>'
        )
        self.assertTrue(ok)
        self.assertEqual(venues, [])

    def test_empty_copy_inside_script_is_not_positive_empty_evidence(self):
        venues, _, ok = self._scrape(
            '<html><title>Texas Poker Rooms</title>'
            '<script>const emptyLabel = "No poker rooms were found";</script>'
            '<main>Loading...</main></html>'
        )
        self.assertFalse(ok)
        self.assertEqual(venues, [])

    def test_activity_link_does_not_reserve_slug_before_real_room_card(self):
        venues, _, ok = self._scrape('''
            <html><title>Texas Poker Rooms</title>
              <a href="/poker-room/texas-card-house-dallas">
                brian7677 favorited Texas Card House Dallas about a minute ago
              </a>
              <article class="poker-room-card">
                <a href="/poker-room/texas-card-house-dallas">Texas Card House Dallas</a>
              </article>
            </html>
        ''')
        self.assertTrue(ok)
        self.assertEqual(len(venues), 1)
        self.assertEqual(venues[0]['slug'], 'texas-card-house-dallas')
        self.assertEqual(venues[0]['name'], 'Texas Card House Dallas')

    def test_known_cross_border_room_is_not_a_publishable_us_identity(self):
        venues, _, ok = self._scrape('''
            <html><title>Upstate New York Poker Rooms</title>
              <a href="/poker-room/casino-niagara-niagara-falls">Casino Niagara</a>
              <a href="/poker-room/seneca-niagara-niagara-falls">Seneca Niagara</a>
            </html>
        ''')
        self.assertTrue(ok)
        self.assertEqual([venue['slug'] for venue in venues], [
            'seneca-niagara-niagara-falls',
        ])
        self.assertFalse(discovery.is_publishable_venue(_room(
            'casino-niagara-niagara-falls',
            'Casino Niagara',
            'https://www.pokeratlas.com/poker-rooms/upstate-ny',
        )))

    def test_failed_page_never_overwrites_existing_registry(self):
        with TemporaryDirectory() as tmp:
            root = Path(tmp)
            data_dir = root / 'data'
            data_dir.mkdir()
            target = data_dir / 'pokeratlas-slug-map.json'
            original = {'total_venues': 1, 'venues': [
                _room('existing-room', 'Existing Room', 'https://www.pokeratlas.com/poker-rooms/texas')
            ]}
            target.write_text(json.dumps(original), encoding='utf-8')
            first_url = 'https://www.pokeratlas.com/poker-rooms/regions/texas'
            second_url = 'https://www.pokeratlas.com/poker-rooms/regions/nevada'
            discovered = _room('new-room', 'New Room', first_url)

            with mock.patch.object(discovery, 'PROJECT_ROOT', root):
                with mock.patch.object(discovery, 'REGION_URLS', [first_url, second_url]):
                    with mock.patch.object(
                        discovery,
                        'scrape_region_page',
                        side_effect=[([discovered], [], True), ([], [], False)],
                    ):
                        with mock.patch.object(discovery.time, 'sleep'):
                            with self.assertRaises(SystemExit) as raised:
                                discovery.main()

            self.assertEqual(raised.exception.code, 1)
            self.assertEqual(json.loads(target.read_text(encoding='utf-8')), original)

    def test_complete_crawl_cannot_silently_retire_a_published_slug(self):
        with TemporaryDirectory() as tmp:
            root = Path(tmp)
            data_dir = root / 'data'
            data_dir.mkdir()
            target = data_dir / 'pokeratlas-slug-map.json'
            source = 'https://www.pokeratlas.com/poker-rooms/regions/texas'
            original = {'total_venues': 2, 'venues': [
                _room('room-one', 'Room One', source),
                _room('room-two', 'Room Two', source),
            ]}
            target.write_text(json.dumps(original), encoding='utf-8')

            with mock.patch.object(discovery, 'PROJECT_ROOT', root):
                with mock.patch.object(discovery, 'REGION_URLS', [source]):
                    with mock.patch.object(
                        discovery,
                        'scrape_region_page',
                        return_value=([_room('room-one', 'Room One', source)], [], True),
                    ):
                        with self.assertRaises(SystemExit) as raised:
                            discovery.main()

            self.assertEqual(raised.exception.code, 1)
            self.assertEqual(json.loads(target.read_text(encoding='utf-8')), original)

    def test_depth_limited_frontier_is_not_published_as_complete(self):
        with TemporaryDirectory() as tmp:
            root = Path(tmp)
            data_dir = root / 'data'
            data_dir.mkdir()
            target = data_dir / 'pokeratlas-slug-map.json'
            source = 'https://www.pokeratlas.com/poker-rooms/regions/texas'
            original = {'total_venues': 1, 'venues': [
                _room('room-one', 'Room One', source),
            ]}
            target.write_text(json.dumps(original), encoding='utf-8')
            deeper = 'https://www.pokeratlas.com/poker-rooms/austin'

            with mock.patch.object(discovery, 'PROJECT_ROOT', root):
                with mock.patch.object(discovery, 'REGION_URLS', [source]):
                    with mock.patch.object(discovery, 'MAX_DEPTH', 0):
                        with mock.patch.object(
                            discovery,
                            'scrape_region_page',
                            return_value=([_room('room-one', 'Room One', source)], [deeper], True),
                        ):
                            with self.assertRaises(SystemExit) as raised:
                                discovery.main()

            self.assertEqual(raised.exception.code, 1)
            self.assertEqual(json.loads(target.read_text(encoding='utf-8')), original)

    def test_complete_zero_failure_crawl_is_atomically_published(self):
        with TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / 'data').mkdir()
            source = 'https://www.pokeratlas.com/poker-rooms/regions/texas'
            room = _room('room-one', 'Room One', source)

            with mock.patch.object(discovery, 'PROJECT_ROOT', root):
                with mock.patch.object(discovery, 'REGION_URLS', [source]):
                    with mock.patch.object(
                        discovery,
                        'scrape_region_page',
                        return_value=([room], [], True),
                    ):
                        discovery.main()

            published = json.loads(
                (root / 'data' / 'pokeratlas-slug-map.json').read_text(encoding='utf-8')
            )
            self.assertIs(published['crawl_complete'], True)
            self.assertEqual(published['fetch_failures'], 0)
            self.assertEqual(published['venues'], [room])


class IngestContractTests(unittest.IsolatedAsyncioTestCase):
    async def test_us_jsonld_graph_is_accepted(self):
        url = 'https://www.pokeratlas.com/poker-room/test-room'
        html = f'<html><script type="application/ld+json">{_venue_jsonld()}</script></html>'
        data, provenance = await ingest.scrape_venue_page(
            _AsyncSession(_Page(html, url=url)), url
        )
        self.assertEqual(data['state'], 'TX')
        self.assertEqual(data['country'], 'US')
        self.assertEqual(data['name_from_source'], 'Test Room')
        self.assertNotIn('error', provenance)

    async def test_full_us_state_name_is_normalized_to_postal_code(self):
        url = 'https://www.pokeratlas.com/poker-room/test-room'
        html = (
            '<html><script type="application/ld+json">'
            f'{_venue_jsonld(state="North Carolina")}'
            '</script></html>'
        )
        data, provenance = await ingest.scrape_venue_page(
            _AsyncSession(_Page(html, url=url)), url
        )
        self.assertEqual(data['state'], 'NC')
        self.assertNotIn('error', provenance)

    async def test_cross_border_canadian_room_is_rejected(self):
        url = 'https://www.pokeratlas.com/poker-room/casino-niagara-niagara-falls'
        html = (
            '<html><script type="application/ld+json">'
            f'{_venue_jsonld(name="Casino Niagara", state="ON", country="CA")}'
            '</script></html>'
        )
        data, error = await ingest.scrape_venue_page(
            _AsyncSession(_Page(html, url=url)), url
        )
        self.assertIsNone(data)
        self.assertEqual(error['error'], 'non_us_location')
        self.assertEqual(error['country'], 'CA')

    async def test_verified_foreign_room_is_out_of_scope_not_a_pipeline_failure(self):
        with mock.patch.object(
            ingest,
            'scrape_venue_page',
            new=mock.AsyncMock(return_value=(None, {
                'error': 'non_us_location',
                'state': 'ON',
                'country': 'CA',
            })),
        ):
            status, payload = await ingest.prepare_slug(
                object(), 'casino-niagara-niagara-falls'
            )
        self.assertEqual(status, 'reject')
        self.assertIsNone(payload)

    async def test_http_200_challenge_is_rejected_before_jsonld_fallbacks(self):
        url = 'https://www.pokeratlas.com/poker-room/test-room'
        data, error = await ingest.scrape_venue_page(
            _AsyncSession(_Page('<title>Just a moment...</title>', url=url)), url
        )
        self.assertIsNone(data)
        self.assertEqual(error['error'], 'challenge_page_with_http_200')

    async def test_region_redirect_cannot_supply_the_wrong_room_identity(self):
        requested = 'https://www.pokeratlas.com/poker-room/test-room'
        redirected = 'https://www.pokeratlas.com/poker-rooms/regions/texas'
        html = f'<html><script type="application/ld+json">{_venue_jsonld()}</script></html>'
        data, error = await ingest.scrape_venue_page(
            _AsyncSession(_Page(html, url=redirected)), requested
        )
        self.assertIsNone(data)
        self.assertEqual(error['error'], 'unexpected_room_redirect')
        self.assertEqual(error['final_slug'], '')

    async def test_unrelated_publisher_address_is_not_venue_identity(self):
        url = 'https://www.pokeratlas.com/poker-room/test-room'
        publisher = json.dumps({
            '@context': 'https://schema.org',
            '@type': 'Organization',
            'name': 'Directory Publisher',
            'address': {
                '@type': 'PostalAddress',
                'streetAddress': '100 Publisher Street',
                'addressLocality': 'Austin',
                'addressRegion': 'TX',
                'addressCountry': 'US',
            },
        })
        data, error = await ingest.scrape_venue_page(
            _AsyncSession(_Page(
                f'<html><script type="application/ld+json">{publisher}</script></html>',
                url=url,
            )),
            url,
        )
        self.assertIsNone(data)
        self.assertEqual(error['error'], 'no_address_in_jsonld')

    async def test_missing_state_is_unverified_and_remains_a_pipeline_failure(self):
        url = 'https://www.pokeratlas.com/poker-room/test-room'
        html = (
            '<html><script type="application/ld+json">'
            f'{_venue_jsonld(state="", country="US")}'
            '</script></html>'
        )
        data, error = await ingest.scrape_venue_page(
            _AsyncSession(_Page(html, url=url)), url
        )
        self.assertIsNone(data)
        self.assertEqual(error['error'], 'country_unverified_location')

    async def test_prepare_slug_never_writes_and_returns_rpc_payload(self):
        data = {
            'name_from_source': 'Test Room',
            'address': '100 Main Street',
            'city': 'Austin',
            'state': 'TX',
            'country': 'US',
        }
        provenance = {
            'scrape_url': 'https://www.pokeratlas.com/poker-room/test-room',
            'scrape_html_hash': 'a' * 64,
            'scrape_timestamp': '2026-09-06T12:00:00+00:00',
        }
        with TemporaryDirectory() as tmp:
            with mock.patch.object(
                ingest, 'scrape_venue_page', new=mock.AsyncMock(return_value=(data, provenance))
            ):
                with mock.patch.object(ingest, 'EVIDENCE_DIR', tmp):
                    with mock.patch.object(ingest, 'supabase_rpc') as rpc:
                        status, payload = await ingest.prepare_slug(object(), 'test-room')

        self.assertEqual(status, 'ready')
        self.assertEqual(payload['country'], 'US')
        self.assertEqual(payload['pokeratlas_slug'], 'test-room')
        rpc.assert_not_called()

    def test_atomic_ingest_uses_one_rpc_and_requires_canonical_results(self):
        batch_id = '00000000-0000-0000-0000-000000000123'
        row = {'pokeratlas_slug': 'test-room'}
        rpc_result = {
            'success': True,
            'batch_id': batch_id,
            'input_count': 1,
            'inserted_count': 1,
            'existing_count': 0,
            'input_slugs': ['test-room'],
            'inserted_slugs': ['test-room'],
            'venues': [{
                'id': 2140,
                'pokeratlas_slug': 'test-room',
                'canonical_venue_id': None,
            }],
        }
        with mock.patch.object(ingest, 'supabase_rpc', return_value=rpc_result) as rpc:
            self.assertEqual(ingest.atomic_ingest([row], batch_id), rpc_result)

        rpc.assert_called_once_with('fn_pokeratlas_ingest_venues', {
            'p_rows': [row],
            'p_batch_id': batch_id,
        })

    def test_atomic_ingest_rejects_a_retired_alias_response(self):
        batch_id = '00000000-0000-0000-0000-000000000123'
        result = {
            'success': True,
            'batch_id': batch_id,
            'input_count': 1,
            'inserted_count': 0,
            'existing_count': 1,
            'input_slugs': ['test-room'],
            'inserted_slugs': [],
            'venues': [{
                'id': 3428,
                'pokeratlas_slug': 'test-room',
                'canonical_venue_id': 1878,
            }],
        }
        with mock.patch.object(ingest, 'supabase_rpc', return_value=result):
            with self.assertRaisesRegex(ValueError, 'retired venue identity'):
                ingest.atomic_ingest([{'pokeratlas_slug': 'test-room'}], batch_id)

    async def test_failed_candidate_prevents_any_batch_rpc_call(self):
        with TemporaryDirectory() as tmp:
            slug_file = Path(tmp) / 'slugs.json'
            slug_file.write_text(json.dumps(['room-one', 'room-two']), encoding='utf-8')
            prepared = {'pokeratlas_slug': 'room-one'}
            with mock.patch.object(ingest, 'SUPABASE_KEY', 'test-service-key'):
                with mock.patch.object(
                    ingest, 'AsyncStealthySession', return_value=_AsyncSessionContext()
                ):
                    with mock.patch.object(
                        ingest,
                        'prepare_slug',
                        new=mock.AsyncMock(side_effect=[('ready', prepared), ('fail', None)]),
                    ):
                        with mock.patch.object(ingest.asyncio, 'sleep', new=mock.AsyncMock()):
                            with mock.patch.object(ingest, 'atomic_ingest') as atomic:
                                with self.assertRaises(SystemExit) as raised:
                                    await ingest.main(str(slug_file))

        self.assertEqual(raised.exception.code, 1)
        atomic.assert_not_called()

    async def test_complete_candidate_set_is_published_with_one_rpc_call(self):
        with TemporaryDirectory() as tmp:
            slug_file = Path(tmp) / 'slugs.json'
            slug_file.write_text(json.dumps(['room-one', 'room-two']), encoding='utf-8')
            rows = [
                {'pokeratlas_slug': 'room-one'},
                {'pokeratlas_slug': 'room-two'},
            ]
            persisted = {'inserted_count': 1, 'existing_count': 1}
            with mock.patch.object(ingest, 'SUPABASE_KEY', 'test-service-key'):
                with mock.patch.object(
                    ingest, 'AsyncStealthySession', return_value=_AsyncSessionContext()
                ):
                    with mock.patch.object(
                        ingest,
                        'prepare_slug',
                        new=mock.AsyncMock(side_effect=[('ready', rows[0]), ('ready', rows[1])]),
                    ):
                        with mock.patch.object(ingest.asyncio, 'sleep', new=mock.AsyncMock()):
                            with mock.patch.object(
                                ingest, 'atomic_ingest', return_value=persisted
                            ) as atomic:
                                await ingest.main(str(slug_file))

        atomic.assert_called_once_with(rows, ingest.BATCH_ID)

    def test_watchdog_uses_shared_identity_filters(self):
        source = (SCRIPTS_DIR / 'venue_gap_watchdog.sh').read_text(encoding='utf-8')
        self.assertIn('from scraper_data_truth import', source)
        self.assertIn('is_noise_venue_label', source)
        self.assertIn('NON_US_POKERATLAS_REGION_SLUGS', source)
        self.assertIn('NON_US_POKERATLAS_VENUE_SLUGS', source)
        self.assertIn('pokeratlas_slug_from_url', source)
        self.assertIn('pa_data.get("crawl_complete") is not True', source)
        self.assertIn('pa_data.get("total_venues") != len(pa_venues)', source)


if __name__ == '__main__':
    unittest.main()
