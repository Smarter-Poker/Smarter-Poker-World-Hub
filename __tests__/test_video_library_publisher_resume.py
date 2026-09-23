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

        bridge.get_system_bot_id = (
            lambda: '33333333-3333-4333-8333-333333333333'
        )
        bridge._load_existing_publications = lambda: dict(publications)
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

        # Once one batch commits, emulate the internal deadline arriving before
        # the next network batch. Other deadline checks remain false.
        bridge._deadline_due = lambda _deadline, reserve=bridge.NETWORK_OPERATION_RESERVE_SECONDS: (
            bool(publish_order)
            and reserve == bridge.VERIFY_BATCH_START_RESERVE_SECONDS
        )
        first = bridge.run_bridge(self._arguments())

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


if __name__ == '__main__':
    unittest.main()
