"""Deterministic interruption/resume proof for the Phase-1 Reel publisher."""

import importlib.util
import json
import tempfile
import time
import unittest
from datetime import datetime, timezone
from pathlib import Path
from types import SimpleNamespace
from unittest import mock


BRIDGE_PATH = Path(__file__).resolve().parents[1] / 'scripts' / 'video_library_to_reels.py'


class VideoLibraryPublisherResumeTest(unittest.TestCase):
    def setUp(self):
        spec = importlib.util.spec_from_file_location(
            f'video_library_to_reels_resume_{id(self)}',
            BRIDGE_PATH,
        )
        self.bridge = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(self.bridge)
        self.temporary_directory = tempfile.TemporaryDirectory(
            prefix='sp-video-reels-resume-'
        )
        self.bridge.EVIDENCE_DIR = Path(self.temporary_directory.name)
        self.bridge.VERIFY_CONCURRENCY = 1
        self.bridge.time.sleep = lambda _seconds: None

    def tearDown(self):
        self.temporary_directory.cleanup()

    @staticmethod
    def _arguments():
        return SimpleNamespace(
            source=None,
            limit=2,
            sync_captions=False,
            audit_all=False,
            dry_run=False,
            deadline_at=time.monotonic() + 1_000,
        )

    @staticmethod
    def _oembed_response():
        class Response:
            status = 200

            def __enter__(self):
                return self

            def __exit__(self, *_args):
                return False

            @staticmethod
            def read(_limit):
                return json.dumps({
                    'title': 'Verified Poker Video',
                    'author_name': 'Verified Publisher',
                }).encode('utf-8')

        return Response()

    def test_subscription_login_region_and_embed_failures_are_quarantined(self):
        bridge = self.bridge
        cases = [
            ('This video is members-only', 'restricted', 'youtube_members_only'),
            ('Premium content requires a subscription', 'restricted', 'youtube_members_only'),
            ('Login required to continue', 'restricted', 'youtube_login_required'),
            ('Sign in to confirm your age', 'restricted', 'youtube_login_required'),
            ('This video is not available in your country', 'restricted', 'youtube_region_restricted'),
            ('Embedding disabled by request', 'embed_disabled', 'youtube_embed_disabled'),
        ]

        with mock.patch.object(
            bridge.urllib.request,
            'urlopen',
            side_effect=lambda *_args, **_kwargs: self._oembed_response(),
        ):
            for detail, expected_status, expected_reason in cases:
                with self.subTest(detail=detail):
                    bridge._run_isolated_ytdlp = lambda *_args, **_kwargs: SimpleNamespace(
                        returncode=1,
                        stdout='',
                        stderr=detail,
                    )
                    result = bridge.verify_youtube_video_scrapling('M7lc1UVf-VE')
                    self.assertFalse(result['available'])
                    self.assertEqual(result['status'], expected_status)
                    self.assertEqual(result['reason'], expected_reason)

    def test_ytdlp_access_metadata_must_be_public_age_free_and_embeddable(self):
        bridge = self.bridge
        cases = [
            ({'availability': 'premium_only', 'age_limit': 0, 'playable_in_embed': True}, 'restricted', 'youtube_premium_only'),
            ({'availability': 'subscriber_only', 'age_limit': 0, 'playable_in_embed': True}, 'restricted', 'youtube_subscriber_only'),
            ({'availability': 'needs_auth', 'age_limit': 0, 'playable_in_embed': True}, 'restricted', 'youtube_needs_auth'),
            ({'availability': 'public', 'age_limit': 18, 'playable_in_embed': True}, 'restricted', 'youtube_age_restricted'),
            ({'availability': 'public', 'age_limit': 0, 'playable_in_embed': False}, 'embed_disabled', 'youtube_embed_disabled'),
            ({'availability': 'public', 'age_limit': 0, 'playable_in_embed': True, 'live_status': 'is_upcoming'}, 'error', 'youtube_upcoming'),
            ({'availability': 'public', 'age_limit': 0, 'playable_in_embed': True}, 'verified', None),
        ]

        with mock.patch.object(
            bridge.urllib.request,
            'urlopen',
            side_effect=lambda *_args, **_kwargs: self._oembed_response(),
        ):
            for metadata, expected_status, expected_reason in cases:
                with self.subTest(metadata=metadata):
                    bridge._run_isolated_ytdlp = lambda *_args, **_kwargs: SimpleNamespace(
                        returncode=0,
                        stdout=json.dumps(metadata),
                        stderr='',
                    )
                    result = bridge.verify_youtube_video_scrapling('M7lc1UVf-VE')
                    self.assertEqual(result['available'], expected_status == 'verified')
                    self.assertEqual(result['status'], expected_status)
                    self.assertEqual(result['reason'], expected_reason)

    def test_deadline_checkpoint_resumes_from_database_without_duplicate_publish(self):
        bridge = self.bridge
        checked_at = lambda: datetime.now(timezone.utc).isoformat()
        assets = [
            {
                'id': '11111111-1111-4111-8111-111111111111',
                'youtube_video_id': 'M7lc1UVf-VE',
                'source_id': 'TEST',
                'source_name': 'Test',
                'title': 'First',
                'thumbnail_url': None,
                'published_at': '2026-09-06T01:00:00+00:00',
                'type': 'cash',
                'availability_status': 'unknown',
                'embeddable': None,
                'availability_checked_at': None,
            },
            {
                'id': '22222222-2222-4222-8222-222222222222',
                'youtube_video_id': 'D5R_ZQZDR1Q',
                'source_id': 'TEST',
                'source_name': 'Test',
                'title': 'Second',
                'thumbnail_url': None,
                'published_at': '2026-09-05T01:00:00+00:00',
                'type': 'tournament',
                'availability_status': 'unknown',
                'embeddable': None,
                'availability_checked_at': None,
            },
        ]
        publications = {}
        publish_order = []

        # The isolated yt-dlp child is proven by test_video_library_ytdlp_runtime;
        # here it is recorded so the gate order stays pinned: runtime, then the
        # anti-horse publisher check, then the dedicated Reel controls, and only
        # then any catalog read, probe, or publication.
        gate_order = []
        bridge.ensure_ytdlp_runtime = lambda: gate_order.append('ytdlp') or '2026.08.19'
        bridge.get_system_bot_id = (
            lambda: gate_order.append('publisher') or '33333333-3333-4333-8333-333333333333'
        )
        bridge.read_publication_controls = lambda: gate_order.append('controls') or {
            'video_library_reel_creation': True,
            'video_library_reel_publication': True,
        }
        real_existing = lambda: dict(publications)
        bridge._load_existing_publications = lambda: (
            gate_order.append('inventory') or real_existing()
        )
        bridge._load_embed_failure_rows = lambda: []
        bridge._catalog_pages = lambda _source=None: iter(
            [[dict(asset) for asset in assets]]
        )

        def verify(_row):
            timestamp = checked_at()
            return {
                'available': True,
                'status': 'verified',
                'reason': None,
                'verification_started_at': timestamp,
                'verification_checked_at': timestamp,
            }

        def record_verdict(video_id, _availability, **_kwargs):
            for asset in assets:
                if asset['youtube_video_id'] == video_id:
                    asset.update(
                        availability_status='verified',
                        embeddable=True,
                        availability_checked_at=checked_at(),
                    )
            return {
                'video_id': video_id,
                'hit_count': 0,
                'verification_status': 'resolved',
                'resolved': True,
            }

        def publish(row, _author_id):
            publish_order.append(row['id'])
            publications[row['id']] = {
                'id': f"reel-{row['id']}",
                'source_asset_id': row['id'],
                'source_post_id': f"post-{row['id']}",
                'caption': row['title'],
            }
            return {
                'social_post_id': publications[row['id']]['source_post_id'],
                'social_reel_id': publications[row['id']]['id'],
                'was_created': True,
            }

        bridge._verify_row = verify
        bridge._record_embed_verdict = record_verdict
        bridge._publish_row = publish
        bridge._feed_visible_asset_ids = lambda publication_rows: {
            item['row']['id'] for item in publication_rows
        }

        # Once one batch commits, emulate the internal deadline arriving before
        # the next network batch. Other deadline checks remain false.
        bridge._deadline_due = lambda _deadline, reserve=bridge.NETWORK_OPERATION_RESERVE_SECONDS: (
            bool(publish_order)
            and reserve == bridge.VERIFY_BATCH_START_RESERVE_SECONDS
        )
        first = bridge.run_bridge(self._arguments())

        self.assertEqual(gate_order, ['ytdlp', 'publisher', 'controls', 'inventory'])
        self.assertTrue(first['deadline_reached'])
        self.assertEqual(first['deadline_phase'], 'catalog_verification')
        self.assertEqual(publish_order, [assets[0]['id']])
        checkpoint = json.loads(
            (
                bridge.EVIDENCE_DIR / 'video_library_to_reels_checkpoint.json'
            ).read_text()
        )
        self.assertEqual(checkpoint['phase'], 'deadline')
        self.assertEqual(checkpoint['cursor']['asset_id'], assets[0]['id'])

        # Supabase verdict/publication state is the authoritative cursor. With
        # deadline pressure removed, row one is already current and only the
        # unfinished second row is selected and published.
        bridge._deadline_due = lambda *_args, **_kwargs: False
        second = bridge.run_bridge(self._arguments())

        self.assertFalse(second['deadline_reached'])
        self.assertEqual(second['already_current'], 1)
        self.assertEqual(second['candidates'], 1)
        self.assertEqual(
            publish_order,
            [assets[0]['id'], assets[1]['id']],
        )
        self.assertEqual(len(set(publish_order)), 2)


    def _forbid_work_after_gate(self):
        bridge = self.bridge
        reached = []

        def forbidden(name):
            def record(*_args, **_kwargs):
                reached.append(name)
                raise AssertionError(f'{name} must not run when the gate refuses')
            return record

        bridge.ensure_ytdlp_runtime = lambda: '2026.08.19'
        for name in (
            '_load_existing_publications', '_load_embed_failure_rows',
            '_catalog_pages', '_verify_row', 'verify_youtube_video_scrapling',
            '_record_embed_verdict', '_publish_row', '_rpc',
        ):
            setattr(bridge, name, forbidden(name))
        return reached

    def test_switched_off_controls_stop_before_any_probe_or_write(self):
        bridge = self.bridge
        reached = self._forbid_work_after_gate()
        bridge.get_system_bot_id = lambda: '00000000-0000-0000-0000-000000000001'
        for controls in (
            {'video_library_reel_creation': True, 'video_library_reel_publication': False},
            {'video_library_reel_creation': False, 'video_library_reel_publication': True},
            {'video_library_reel_creation': False, 'video_library_reel_publication': False},
        ):
            with self.subTest(controls=controls):
                bridge.read_publication_controls = lambda controls=controls: dict(controls)
                for dry_run in (False, True):
                    arguments = self._arguments()
                    arguments.dry_run = dry_run
                    stats = bridge.run_bridge(arguments)
                    self.assertEqual(stats['aborted_reason'], 'publication_controls_disabled')
                    self.assertEqual(stats['publication_controls'], controls)
                    self.assertEqual(stats['verification_attempted'], 0)
                    self.assertEqual(stats['created'] + stats['repaired_or_updated'], 0)
        self.assertEqual(reached, [])

    def test_unsafe_publisher_or_unreadable_controls_raise_before_any_probe(self):
        bridge = self.bridge
        reached = self._forbid_work_after_gate()
        controls_read = []

        def unsafe_publisher():
            raise bridge.PublisherIdentityError('configured publisher is a horse')

        bridge.get_system_bot_id = unsafe_publisher
        bridge.read_publication_controls = lambda: controls_read.append(True) or {}
        with self.assertRaises(bridge.PublisherIdentityError):
            bridge.run_bridge(self._arguments())
        # An unsafe author stops the run before the switch is even consulted.
        self.assertEqual(controls_read, [])

        def unreadable_controls():
            raise bridge.PublicationControlsError('Could not read video_reels_pipeline_controls')

        bridge.get_system_bot_id = lambda: '00000000-0000-0000-0000-000000000001'
        bridge.read_publication_controls = unreadable_controls
        with self.assertRaises(bridge.PublicationControlsError):
            bridge.run_bridge(self._arguments())
        self.assertTrue(issubclass(bridge.PublisherIdentityError, RuntimeError))
        self.assertTrue(issubclass(bridge.PublicationControlsError, RuntimeError))
        self.assertEqual(reached, [])

    def _configure_ops07_run(self, assets, availability_by_video, visible_asset_ids=None):
        bridge = self.bridge
        bridge.ensure_ytdlp_runtime = lambda: '2026.08.19'
        bridge.get_system_bot_id = lambda: '00000000-0000-0000-0000-000000000001'
        bridge.read_publication_controls = lambda: {
            'video_library_reel_creation': True,
            'video_library_reel_publication': True,
        }
        bridge._load_existing_publications = lambda: {}
        bridge._load_embed_failure_rows = lambda: []
        bridge._catalog_pages = lambda _source=None: iter([[dict(row) for row in assets]])
        bridge._deadline_due = lambda *_args, **_kwargs: False

        def verify(row):
            result = dict(availability_by_video[row['youtube_video_id']])
            result.setdefault('reason', None)
            result['verification_started_at'] = datetime.now(timezone.utc).isoformat()
            result['verification_checked_at'] = datetime.now(timezone.utc).isoformat()
            return result

        bridge._verify_row = verify
        bridge._record_embed_verdict = lambda video_id, availability, **_kwargs: {
            'video_id': video_id,
            'hit_count': 0,
            'verification_status': (
                'resolved' if availability['available'] else 'confirmed'
            ),
            'resolved': availability['available'],
        }
        bridge._publish_row = lambda row, _author_id: {
            'social_post_id': f"post-{row['id']}",
            'social_reel_id': f"reel-{row['id']}",
            'was_created': True,
        }
        if visible_asset_ids is not None:
            bridge._feed_visible_asset_ids = lambda _publications: set(visible_asset_ids)

    def test_ops07_reports_each_lifecycle_stage_by_topic_and_source_family(self):
        checked_at = (
            datetime.now(timezone.utc) - self.bridge.VERIFICATION_REFRESH_AGE * 2
        ).isoformat()
        poker_asset = {
            'id': '11111111-1111-4111-8111-111111111111',
            'youtube_video_id': 'M7lc1UVf-VE',
            'source_id': 'HCL',
            'source_name': 'Hustler Casino Live',
            'title': 'Poker Candidate',
            'thumbnail_url': None,
            'published_at': '2026-09-20T01:00:00+00:00',
            'type': 'cash',
            'availability_status': 'verified',
            'embeddable': True,
            'availability_checked_at': checked_at,
        }
        slots_asset = {
            'id': '22222222-2222-4222-8222-222222222222',
            'youtube_video_id': 'D5R_ZQZDR1Q',
            'source_id': 'NGS',
            'source_name': 'NG Slot',
            'title': 'Slots Candidate',
            'thumbnail_url': None,
            'published_at': '2026-09-19T01:00:00+00:00',
            'type': 'slots',
            'availability_status': 'unknown',
            'embeddable': None,
            'availability_checked_at': None,
        }
        self._configure_ops07_run(
            [poker_asset, slots_asset],
            {
                poker_asset['youtube_video_id']: {
                    'available': True,
                    'status': 'verified',
                },
                slots_asset['youtube_video_id']: {
                    'available': False,
                    'status': 'restricted',
                    'reason': 'youtube_members_only',
                },
            },
            visible_asset_ids={poker_asset['id']},
        )

        arguments = self._arguments()
        arguments.limit = None
        stats = self.bridge.run_bridge(arguments)

        self.assertEqual(
            stats['ops07']['by_topic']['poker'],
            {
                'candidate': 1,
                'verified': 1,
                'published': 1,
                'rejected': 0,
                'stale': 1,
                'feed_visible': 1,
            },
        )
        self.assertEqual(
            stats['ops07']['by_topic']['slots'],
            {
                'candidate': 1,
                'verified': 0,
                'published': 0,
                'rejected': 1,
                'stale': 0,
                'feed_visible': 0,
            },
        )
        self.assertEqual(
            stats['ops07']['by_source_family']['video_library'],
            {
                'candidate': 2,
                'verified': 1,
                'published': 1,
                'rejected': 1,
                'stale': 1,
                'feed_visible': 1,
            },
        )
        self.assertEqual(stats['feed_visibility_checked'], 1)
        self.assertEqual(stats['feed_visibility_failures'], 0)

    def test_successful_publication_without_feed_visibility_fails_closed(self):
        asset = {
            'id': '11111111-1111-4111-8111-111111111111',
            'youtube_video_id': 'M7lc1UVf-VE',
            'source_id': 'HCL',
            'source_name': 'Hustler Casino Live',
            'title': 'Poker Candidate',
            'thumbnail_url': None,
            'published_at': '2026-09-20T01:00:00+00:00',
            'type': 'cash',
            'availability_status': 'unknown',
            'embeddable': None,
            'availability_checked_at': None,
        }
        self._configure_ops07_run(
            [asset],
            {
                asset['youtube_video_id']: {
                    'available': True,
                    'status': 'verified',
                },
            },
            visible_asset_ids=set(),
        )

        stats = self.bridge.run_bridge(self._arguments())

        self.assertEqual(stats['created'], 1)
        self.assertEqual(stats['ops07']['by_topic']['poker']['published'], 1)
        self.assertEqual(stats['ops07']['by_topic']['poker']['feed_visible'], 0)
        self.assertEqual(stats['feed_visibility_checked'], 1)
        self.assertEqual(stats['feed_visibility_failures'], 1)
        self.assertEqual(stats['aborted_reason'], 'feed_visibility_unproven')
        self.assertTrue(self.bridge._stats_require_nonzero_exit(stats))

    def test_already_current_publication_cannot_bypass_feed_visibility_on_replay(self):
        asset = {
            'id': '11111111-1111-4111-8111-111111111111',
            'youtube_video_id': 'M7lc1UVf-VE',
            'source_id': 'HCL',
            'source_name': 'Hustler Casino Live',
            'title': 'Poker Candidate',
            'thumbnail_url': None,
            'published_at': '2026-09-20T01:00:00+00:00',
            'type': 'cash',
            'availability_status': 'verified',
            'embeddable': True,
            'availability_checked_at': datetime.now(timezone.utc).isoformat(),
        }
        self._configure_ops07_run(
            [asset],
            {},
            visible_asset_ids=set(),
        )
        self.bridge._load_existing_publications = lambda: {
            asset['id']: {
                'id': '33333333-3333-4333-8333-333333333333',
                'source_asset_id': asset['id'],
                'source_post_id': '22222222-2222-4222-8222-222222222222',
                'caption': asset['title'],
            },
        }
        self.bridge._verify_row = mock.Mock(
            side_effect=AssertionError('already-current rows must not be reverified')
        )
        self.bridge._publish_row = mock.Mock(
            side_effect=AssertionError('already-current rows must not be republished')
        )

        stats = self.bridge.run_bridge(self._arguments())

        self.assertEqual(stats['already_current'], 1)
        self.assertEqual(stats['candidates'], 0)
        self.assertEqual(stats['ops07']['by_topic']['poker']['verified'], 1)
        self.assertEqual(stats['ops07']['by_topic']['poker']['published'], 1)
        self.assertEqual(stats['ops07']['by_topic']['poker']['feed_visible'], 0)
        self.assertEqual(stats['feed_visibility_checked'], 1)
        self.assertEqual(stats['feed_visibility_failures'], 1)
        self.assertEqual(stats['aborted_reason'], 'feed_visibility_unproven')
        self.assertTrue(self.bridge._stats_require_nonzero_exit(stats))
        self.bridge._verify_row.assert_not_called()
        self.bridge._publish_row.assert_not_called()

    def test_dry_run_never_requires_or_claims_feed_visibility(self):
        asset = {
            'id': '11111111-1111-4111-8111-111111111111',
            'youtube_video_id': 'M7lc1UVf-VE',
            'source_id': 'HCL',
            'source_name': 'Hustler Casino Live',
            'title': 'Poker Candidate',
            'thumbnail_url': None,
            'published_at': '2026-09-20T01:00:00+00:00',
            'type': 'cash',
            'availability_status': 'unknown',
            'embeddable': None,
            'availability_checked_at': None,
        }
        self._configure_ops07_run(
            [asset],
            {
                asset['youtube_video_id']: {
                    'available': True,
                    'status': 'verified',
                },
            },
        )
        self.bridge._feed_visible_asset_ids = mock.Mock(
            side_effect=AssertionError('dry runs must not read feed visibility')
        )
        arguments = self._arguments()
        arguments.dry_run = True

        stats = self.bridge.run_bridge(arguments)

        self.assertEqual(stats['would_publish'], 1)
        self.assertEqual(stats['ops07']['by_topic']['poker']['candidate'], 1)
        self.assertEqual(stats['ops07']['by_topic']['poker']['verified'], 1)
        self.assertEqual(stats['ops07']['by_topic']['poker']['published'], 0)
        self.assertEqual(stats['ops07']['by_topic']['poker']['feed_visible'], 0)
        self.assertEqual(stats['feed_visibility_checked'], 0)
        self.assertEqual(stats['feed_visibility_failures'], 0)
        self.assertFalse(self.bridge._stats_require_nonzero_exit(stats))
        self.bridge._feed_visible_asset_ids.assert_not_called()

    def test_feed_visibility_readback_requires_the_complete_public_contract(self):
        bridge = self.bridge
        author_id = '00000000-0000-0000-0000-000000000001'
        asset_id = '11111111-1111-4111-8111-111111111111'
        post_id = '22222222-2222-4222-8222-222222222222'
        reel_id = '33333333-3333-4333-8333-333333333333'
        video_id = 'M7lc1UVf-VE'
        checked_at = datetime.now(timezone.utc).isoformat()
        asset = {
            'id': asset_id,
            'youtube_video_id': video_id,
            'source_id': 'HCL',
            'source_name': 'Hustler Casino Live',
            'title': 'Visible Poker Reel',
            'thumbnail_url': None,
            'published_at': '2026-09-20T01:00:00+00:00',
            'type': 'cash',
            'availability_status': 'verified',
            'embeddable': True,
            'availability_checked_at': checked_at,
        }
        reel = {
            'id': reel_id,
            'author_id': author_id,
            'source_post_id': post_id,
            'is_public': True,
            'is_deleted': False,
            'source_type': 'video_library',
            'youtube_video_id': video_id,
            'video_url': f'https://www.youtube.com/watch?v={video_id}',
            'original_youtube_url': f'https://www.youtube.com/watch?v={video_id}',
            'media_status': 'ready',
            'origin_type': 'video_library',
            'playback_type': 'youtube_embed',
            'topic': 'poker',
            'rights_status': 'embed_only',
            'source_asset_id': asset_id,
            'canonical_asset_key': f'youtube:{video_id}',
            'publication_key': f'video-library:{asset_id}',
            'native_processing_requested': False,
        }
        post = {
            'id': post_id,
            'author_id': author_id,
            'content_type': 'video',
            'visibility': 'public',
            'audience_mode': 'public',
            'is_deleted': False,
            'origin_type': 'video_library',
            'playback_type': 'youtube_embed',
            'topic': 'poker',
            'rights_status': 'embed_only',
            'source_asset_id': asset_id,
            'youtube_video_id': video_id,
            'canonical_asset_key': f'youtube:{video_id}',
            'publication_key': f'video-library:{asset_id}',
        }
        state = {
            'video_library_videos': [asset],
            'social_reels': [reel],
            'social_posts': [post],
            'youtube_embed_failures': [],
        }
        requests = []

        def request(method, table, body=None, params=None, prefer='return=minimal'):
            requests.append((method, table, params))
            rows = state[table]
            return None if rows is None else [dict(row) for row in rows]

        bridge._request = request
        publications = [{
            'row': asset,
            'author_id': author_id,
            'publication': {
                'social_post_id': post_id,
                'social_reel_id': reel_id,
                'was_created': True,
            },
        }]

        self.assertEqual(bridge._feed_visible_asset_ids(publications), {asset_id})
        self.assertEqual(
            [table for _method, table, _params in requests],
            [
                'video_library_videos',
                'social_reels',
                'social_posts',
                'youtube_embed_failures',
            ],
        )

        state['social_reels'][0]['is_deleted'] = True
        self.assertEqual(bridge._feed_visible_asset_ids(publications), set())
        state['social_reels'][0]['is_deleted'] = False
        state['youtube_embed_failures'] = [{'video_id': video_id}]
        self.assertEqual(bridge._feed_visible_asset_ids(publications), set())

        state['video_library_videos'] = None
        with self.assertRaisesRegex(RuntimeError, 'Could not prove feed visibility'):
            bridge._feed_visible_asset_ids(publications)


if __name__ == '__main__':
    unittest.main()
