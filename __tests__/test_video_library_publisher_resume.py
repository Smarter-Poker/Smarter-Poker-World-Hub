"""Deterministic interruption/resume proof for the Phase-1 Reel publisher."""

import importlib.util
import json
import subprocess
import tempfile
import time
import unittest
from datetime import datetime, timedelta, timezone
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
            release_recovery=False,
            verify_platform_supply=False,
            dry_run=False,
            deadline_at=time.monotonic() + 1_000,
        )

    @staticmethod
    def _response(body, status=200):
        class Response:
            def __init__(self, payload, response_status):
                self._payload = payload
                self.status = response_status

            def __enter__(self):
                return self

            def __exit__(self, *_args):
                return False

            def read(self, _limit=None):
                return self._payload

        return Response(body, status)

    @classmethod
    def _oembed_response(cls):
        return cls._response(json.dumps({
            'title': 'Verified Poker Video',
            'author_name': 'Verified Publisher',
        }).encode('utf-8'))

    @classmethod
    def _embed_response(
        cls,
        video_id='M7lc1UVf-VE',
        status='OK',
        playable=True,
        reason=None,
        include_flags=True,
        crawlable=True,
    ):
        playability = {
            'status': status,
            'playableInEmbed': playable,
        }
        if reason:
            playability['reason'] = reason
        player = {'previewPlayabilityStatus': playability}
        if include_flags:
            player['videoFlags'] = {
                'playableInEmbed': playable,
                'isCrawlable': crawlable,
            }
        config = {
            'PLAYER_VARS': {'embedded_player_response': json.dumps(player)},
            'VIDEO_ID': video_id,
            'INNERTUBE_API_KEY': 'public-test-key',
        }
        return cls._response(
            f'<script>ytcfg.set({json.dumps(config)});</script>'.encode('utf-8')
        )

    @classmethod
    def _player_response(
        cls,
        video_id='M7lc1UVf-VE',
        status='OK',
        playable=True,
        reason=None,
        is_private=False,
        streaming=True,
        made_for_kids=False,
    ):
        playability = {'status': status, 'playableInEmbed': playable}
        if reason:
            playability['reason'] = reason
        player = {
            'playabilityStatus': playability,
            'videoDetails': {
                'videoId': video_id,
                'isPrivate': is_private,
                'isMadeForKids': made_for_kids,
            },
        }
        if streaming:
            player['streamingData'] = {'formats': [{'itag': 18}]}
        return cls._response(json.dumps(player).encode('utf-8'))

    @classmethod
    def _verification_urlopen(cls, request, **_kwargs):
        if '/oembed?' in request.full_url:
            return cls._oembed_response()
        if '/embed/' in request.full_url:
            return cls._embed_response()
        if '/youtubei/v1/player?' in request.full_url:
            return cls._player_response()
        raise AssertionError(f'unexpected verification URL: {request.full_url}')

    def test_subscription_login_region_and_embed_failures_are_quarantined(self):
        bridge = self.bridge
        cases = [
            ('This video is members-only', 'error', 'youtube_restriction_signal_conflict'),
            ('Premium content requires a subscription', 'error', 'youtube_restriction_signal_conflict'),
            ('Login required to continue', 'error', 'youtube_auth_required'),
            ('Sign in to confirm your age', 'error', 'youtube_restriction_signal_conflict'),
            ('This video is not available in your country', 'error', 'youtube_restriction_signal_conflict'),
            ('Embedding disabled by request', 'error', 'youtube_restriction_signal_conflict'),
        ]

        with mock.patch.object(
            bridge.urllib.request,
            'urlopen',
            side_effect=self._verification_urlopen,
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
        identity = {
            'id': 'M7lc1UVf-VE',
            'live_status': 'not_live',
        }
        cases = [
            ({**identity, 'availability': 'premium_only', 'age_limit': 0, 'playable_in_embed': True}, 'error', 'youtube_restriction_signal_conflict'),
            ({**identity, 'availability': 'subscriber_only', 'age_limit': 0, 'playable_in_embed': True}, 'error', 'youtube_restriction_signal_conflict'),
            ({**identity, 'availability': 'needs_auth', 'age_limit': 0, 'playable_in_embed': True}, 'verified', None),
            ({**identity, 'availability': 'public', 'age_limit': 18, 'playable_in_embed': True}, 'restricted', 'youtube_age_restricted'),
            ({**identity, 'availability': 'public', 'age_limit': 0, 'playable_in_embed': False}, 'embed_disabled', 'youtube_embed_disabled'),
            ({**identity, 'availability': 'public', 'age_limit': 0, 'playable_in_embed': True, 'live_status': 'is_upcoming'}, 'error', 'youtube_upcoming'),
            ({**identity, 'availability': 'public', 'age_limit': 0, 'playable_in_embed': True}, 'verified', None),
        ]

        with mock.patch.object(
            bridge.urllib.request,
            'urlopen',
            side_effect=self._verification_urlopen,
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

    def test_embed_404_after_public_oembed_stays_operational_unknown(self):
        bridge = self.bridge
        calls = []

        def urlopen(request, **_kwargs):
            calls.append(request.full_url)
            if '/oembed?' in request.full_url:
                return self._oembed_response()
            if '/embed/' in request.full_url:
                raise bridge.urllib.error.HTTPError(
                    request.full_url, 404, 'test embed route failure', {}, None
                )
            raise AssertionError(f'unexpected verification URL: {request.full_url}')

        bridge._run_isolated_ytdlp = lambda *_args, **_kwargs: SimpleNamespace(
            returncode=0,
            stdout=json.dumps({
                'id': 'M7lc1UVf-VE',
                'availability': 'public',
                'age_limit': 0,
                'playable_in_embed': True,
                'live_status': 'not_live',
            }),
            stderr='',
        )
        with mock.patch.object(bridge.urllib.request, 'urlopen', side_effect=urlopen):
            result = bridge.verify_youtube_video_scrapling('M7lc1UVf-VE')

        self.assertEqual(result, {
            'available': False,
            'status': 'error',
            'reason': 'youtube_embed_http_404',
        })
        self.assertEqual(len(calls), 2)
        self.assertNotIn(result['status'], bridge.PERMANENT_FAILURE_STATUSES)

    def test_player_410_after_public_oembed_and_embed_stays_operational_unknown(self):
        bridge = self.bridge
        calls = []

        def urlopen(request, **_kwargs):
            calls.append(request.full_url)
            if '/oembed?' in request.full_url:
                return self._oembed_response()
            if '/embed/' in request.full_url:
                return self._embed_response()
            if '/youtubei/v1/player?' in request.full_url:
                raise bridge.urllib.error.HTTPError(
                    request.full_url, 410, 'test player route failure', {}, None
                )
            raise AssertionError(f'unexpected verification URL: {request.full_url}')

        bridge._run_isolated_ytdlp = lambda *_args, **_kwargs: SimpleNamespace(
            returncode=0,
            stdout=json.dumps({
                'id': 'M7lc1UVf-VE',
                'availability': 'public',
                'age_limit': 0,
                'playable_in_embed': True,
                'live_status': 'not_live',
            }),
            stderr='',
        )
        with mock.patch.object(bridge.urllib.request, 'urlopen', side_effect=urlopen):
            result = bridge.verify_youtube_video_scrapling('M7lc1UVf-VE')

        self.assertEqual(result, {
            'available': False,
            'status': 'error',
            'reason': 'youtube_player_http_410',
        })
        self.assertEqual(len(calls), 3)
        self.assertNotIn(result['status'], bridge.PERMANENT_FAILURE_STATUSES)

    def test_bot_challenge_is_operational_unless_the_anonymous_embed_proves_public(self):
        bridge = self.bridge
        bridge._run_isolated_ytdlp = lambda *_args, **_kwargs: SimpleNamespace(
            returncode=1,
            stdout='',
            stderr='Sign in to confirm you’re not a bot. This helps protect our community.',
        )
        with mock.patch.object(
            bridge.urllib.request,
            'urlopen',
            side_effect=self._verification_urlopen,
        ):
            result = bridge.verify_youtube_video_scrapling('M7lc1UVf-VE')
        self.assertEqual(result, {'available': True, 'status': 'verified', 'reason': None})

        def restricted_embed(request, **_kwargs):
            if '/oembed?' in request.full_url:
                return self._oembed_response()
            return self._embed_response(
                status='UNPLAYABLE',
                playable=False,
                reason='Sorry, this content is age-restricted',
            )

        with mock.patch.object(
            bridge.urllib.request,
            'urlopen',
            side_effect=restricted_embed,
        ):
            result = bridge.verify_youtube_video_scrapling('M7lc1UVf-VE')
        self.assertFalse(result['available'])
        self.assertEqual(result['status'], 'restricted')
        self.assertEqual(result['reason'], 'youtube_age_restricted')

    def test_production_host_dual_bot_challenge_uses_the_exact_public_embed_proof(self):
        bridge = self.bridge

        player_challenge = self._response(json.dumps({
            'playabilityStatus': {
                'status': 'LOGIN_REQUIRED',
                'reason': 'Sign in to confirm you’re not a bot',
            },
        }).encode('utf-8'))

        def challenged_public(request, **_kwargs):
            if '/oembed?' in request.full_url:
                return self._oembed_response()
            if '/embed/' in request.full_url:
                return self._embed_response()
            if '/youtubei/v1/player?' in request.full_url:
                return player_challenge
            raise AssertionError(request.full_url)

        bridge._run_isolated_ytdlp = lambda *_args, **_kwargs: SimpleNamespace(
            returncode=1,
            stdout='',
            stderr='Sign in to confirm you are not a bot',
        )
        with mock.patch.object(
            bridge.urllib.request,
            'urlopen',
            side_effect=challenged_public,
        ):
            result = bridge.verify_youtube_video_scrapling('M7lc1UVf-VE')
        self.assertEqual(result, {
            'available': True,
            'status': 'verified',
            'reason': None,
        })

        # A generic login failure is not the same signal. Both anonymous
        # clients must independently report the specific YouTube bot challenge.
        bridge._run_isolated_ytdlp = lambda *_args, **_kwargs: SimpleNamespace(
            returncode=1,
            stdout='',
            stderr='Login required to continue',
        )
        with mock.patch.object(
            bridge.urllib.request,
            'urlopen',
            side_effect=challenged_public,
        ):
            login = bridge.verify_youtube_video_scrapling('M7lc1UVf-VE')
        self.assertEqual(login, {
            'available': False,
            'status': 'error',
            'reason': 'youtube_auth_required',
        })

    def test_public_ytdlp_metadata_can_corroborate_a_challenged_player(self):
        bridge = self.bridge

        def challenged_player(request, **_kwargs):
            if '/oembed?' in request.full_url:
                return self._oembed_response()
            if '/embed/' in request.full_url:
                return self._embed_response()
            if '/youtubei/v1/player?' in request.full_url:
                return self._response(json.dumps({
                    'playabilityStatus': {
                        'status': 'LOGIN_REQUIRED',
                        'reason': 'Sign in to confirm you are not a bot',
                    },
                }).encode('utf-8'))
            raise AssertionError(request.full_url)

        bridge._run_isolated_ytdlp = lambda *_args, **_kwargs: SimpleNamespace(
            returncode=0,
            stdout=json.dumps({
                'id': 'M7lc1UVf-VE',
                'availability': 'public',
                'age_limit': 0,
                'playable_in_embed': True,
                'live_status': 'not_live',
            }),
            stderr='',
        )
        with mock.patch.object(
            bridge.urllib.request,
            'urlopen',
            side_effect=challenged_player,
        ):
            result = bridge.verify_youtube_video_scrapling('M7lc1UVf-VE')
        self.assertEqual(result, {
            'available': True,
            'status': 'verified',
            'reason': None,
        })

    def test_challenged_player_requires_exact_complete_public_ytdlp_metadata(self):
        bridge = self.bridge

        def challenged_player(request, **_kwargs):
            if '/oembed?' in request.full_url:
                return self._oembed_response()
            if '/embed/' in request.full_url:
                return self._embed_response()
            if '/youtubei/v1/player?' in request.full_url:
                return self._response(json.dumps({
                    'playabilityStatus': {
                        'status': 'LOGIN_REQUIRED',
                        'reason': 'Sign in to confirm you are not a bot',
                    },
                }).encode('utf-8'))
            raise AssertionError(request.full_url)

        cases = [
            (
                [],
                'yt_dlp_payload_malformed',
            ),
            (
                {
                    'availability': 'public',
                    'age_limit': 0,
                    'playable_in_embed': True,
                    'live_status': 'not_live',
                },
                'youtube_ytdlp_identity_mismatch',
            ),
            (
                {
                    'id': 'D5R_ZQZDR1Q',
                    'availability': 'public',
                    'age_limit': 0,
                    'playable_in_embed': True,
                    'live_status': 'not_live',
                },
                'youtube_ytdlp_identity_mismatch',
            ),
            (
                {
                    'id': 'M7lc1UVf-VE',
                    'availability': 'public',
                    'playable_in_embed': True,
                    'live_status': 'not_live',
                },
                'youtube_age_limit_unknown',
            ),
            (
                {
                    'id': 'M7lc1UVf-VE',
                    'availability': 'public',
                    'age_limit': None,
                    'playable_in_embed': True,
                    'live_status': 'not_live',
                },
                'youtube_age_limit_unknown',
            ),
            (
                {
                    'id': 'M7lc1UVf-VE',
                    'availability': 'public',
                    'age_limit': 0,
                    'playable_in_embed': True,
                },
                'youtube_live_status_unknown',
            ),
            (
                {
                    'id': 'M7lc1UVf-VE',
                    'availability': 'public',
                    'age_limit': 0,
                    'live_status': 'not_live',
                },
                'youtube_embed_playability_unknown',
            ),
            (
                {
                    'id': 'M7lc1UVf-VE',
                    'availability': 'public',
                    'age_limit': 0,
                    'playable_in_embed': None,
                    'live_status': 'not_live',
                },
                'youtube_embed_playability_unknown',
            ),
            (
                {
                    'id': 'M7lc1UVf-VE',
                    'availability': 'public',
                    'age_limit': 0,
                    'playable_in_embed': 'true',
                    'live_status': 'not_live',
                },
                'youtube_embed_playability_unknown',
            ),
        ]
        with mock.patch.object(
            bridge.urllib.request,
            'urlopen',
            side_effect=challenged_player,
        ):
            for metadata, reason in cases:
                with self.subTest(metadata=metadata):
                    bridge._run_isolated_ytdlp = lambda *_args, payload=metadata, **_kwargs: SimpleNamespace(
                        returncode=0,
                        stdout=json.dumps(payload),
                        stderr='',
                    )
                    result = bridge.verify_youtube_video_scrapling('M7lc1UVf-VE')
                    self.assertEqual(result, {
                        'available': False,
                        'status': 'error',
                        'reason': reason,
                    })

    def test_split_ytdlp_output_cannot_hide_an_explicit_restriction(self):
        bridge = self.bridge

        def challenged_player(request, **_kwargs):
            if '/oembed?' in request.full_url:
                return self._oembed_response()
            if '/embed/' in request.full_url:
                return self._embed_response()
            if '/youtubei/v1/player?' in request.full_url:
                return self._response(json.dumps({
                    'playabilityStatus': {
                        'status': 'LOGIN_REQUIRED',
                        'reason': 'Sign in to confirm you are not a bot',
                    },
                }).encode('utf-8'))
            raise AssertionError(request.full_url)

        with mock.patch.object(
            bridge.urllib.request,
            'urlopen',
            side_effect=challenged_player,
        ):
            bridge._run_isolated_ytdlp = lambda *_args, **_kwargs: SimpleNamespace(
                returncode=1,
                stdout='This video is private',
                stderr='Sign in to confirm you are not a bot',
            )
            explicit = bridge.verify_youtube_video_scrapling('M7lc1UVf-VE')
            self.assertEqual(explicit, {
                'available': False,
                'status': 'error',
                'reason': 'youtube_restriction_signal_conflict',
            })

            bridge._run_isolated_ytdlp = lambda *_args, **_kwargs: SimpleNamespace(
                returncode=1,
                stdout='',
                stderr='This is not a bot tutorial',
            )
            broad_phrase = bridge.verify_youtube_video_scrapling('M7lc1UVf-VE')
            self.assertEqual(broad_phrase, {
                'available': False,
                'status': 'error',
                'reason': 'yt_dlp_nonzero',
            })

    def test_timed_out_ytdlp_only_rescues_a_captured_exact_bot_challenge(self):
        bridge = self.bridge

        def challenged_player(request, **_kwargs):
            if '/oembed?' in request.full_url:
                return self._oembed_response()
            if '/embed/' in request.full_url:
                return self._embed_response()
            if '/youtubei/v1/player?' in request.full_url:
                return self._response(json.dumps({
                    'playabilityStatus': {
                        'status': 'LOGIN_REQUIRED',
                        'reason': 'Sign in to confirm you are not a bot',
                    },
                }).encode('utf-8'))
            raise AssertionError(request.full_url)

        with mock.patch.object(
            bridge.urllib.request,
            'urlopen',
            side_effect=challenged_player,
        ):
            generic_timeout = subprocess.TimeoutExpired(
                cmd=['yt-dlp'],
                timeout=40,
                output=b'waiting for response',
                stderr=b'',
            )
            bridge._run_isolated_ytdlp = mock.Mock(side_effect=generic_timeout)
            generic = bridge.verify_youtube_video_scrapling('M7lc1UVf-VE')
            self.assertEqual(generic, {
                'available': False,
                'status': 'error',
                'reason': 'yt_dlp_timeout',
            })

            challenge_timeout = subprocess.TimeoutExpired(
                cmd=['yt-dlp'],
                timeout=40,
                output=b'',
                stderr='Sign in to confirm you\u2019re   not a bot'.encode('utf-8'),
            )
            bridge._run_isolated_ytdlp = mock.Mock(side_effect=challenge_timeout)
            rescued = bridge.verify_youtube_video_scrapling('M7lc1UVf-VE')
            self.assertEqual(rescued, {
                'available': True,
                'status': 'verified',
                'reason': None,
            })

            conflicting_timeout = subprocess.TimeoutExpired(
                cmd=['yt-dlp'],
                timeout=40,
                output=b'This video is private',
                stderr=b'Sign in to confirm you are not a bot',
            )
            bridge._run_isolated_ytdlp = mock.Mock(side_effect=conflicting_timeout)
            conflict = bridge.verify_youtube_video_scrapling('M7lc1UVf-VE')
            self.assertEqual(conflict, {
                'available': False,
                'status': 'error',
                'reason': 'youtube_restriction_signal_conflict',
            })

    def test_ytdlp_spawn_error_stays_unknown_despite_public_anonymous_proof(self):
        bridge = self.bridge
        bridge._run_isolated_ytdlp = mock.Mock(side_effect=OSError('spawn failed'))
        with mock.patch.object(
            bridge.urllib.request,
            'urlopen',
            side_effect=self._verification_urlopen,
        ):
            result = bridge.verify_youtube_video_scrapling('M7lc1UVf-VE')
        self.assertEqual(result, {
            'available': False,
            'status': 'error',
            'reason': 'yt_dlp_execution_error',
        })

    def test_anonymous_player_separates_public_from_members_private_and_unsafe(self):
        bridge = self.bridge
        bridge._run_isolated_ytdlp = lambda *_args, **_kwargs: SimpleNamespace(
            returncode=1,
            stdout='',
            stderr='Sign in to confirm you are not a bot',
        )
        cases = (
            (
                self._player_response(
                    status='UNPLAYABLE',
                    playable=False,
                    reason="This video is available to this channel's members on level: Marco Luck",
                    streaming=False,
                ),
                'restricted',
                'youtube_members_only',
            ),
            (
                self._player_response(is_private=True),
                'error',
                'youtube_player_identity_or_privacy_unknown',
            ),
            (
                self._player_response(video_id='D5R_ZQZDR1Q'),
                'error',
                'youtube_player_identity_or_privacy_unknown',
            ),
            (
                self._player_response(streaming=False),
                'error',
                'youtube_player_stream_proof_missing',
            ),
            (
                self._player_response(made_for_kids=True),
                'error',
                'youtube_made_for_kids',
            ),
        )

        for player_response, expected_status, expected_reason in cases:
            def player_case(request, **_kwargs):
                if '/oembed?' in request.full_url:
                    return self._oembed_response()
                if '/embed/' in request.full_url:
                    return self._embed_response()
                if '/youtubei/v1/player?' in request.full_url:
                    return player_response
                raise AssertionError(request.full_url)

            with self.subTest(reason=expected_reason):
                with mock.patch.object(
                    bridge.urllib.request,
                    'urlopen',
                    side_effect=player_case,
                ):
                    result = bridge.verify_youtube_video_scrapling('M7lc1UVf-VE')
                self.assertFalse(result['available'])
                self.assertEqual(result['status'], expected_status)
                self.assertEqual(result['reason'], expected_reason)

    def test_anonymous_embed_public_proof_requires_all_playability_fields(self):
        bridge = self.bridge
        bridge._run_isolated_ytdlp = lambda *_args, **_kwargs: SimpleNamespace(
            returncode=1,
            stdout='',
            stderr='Sign in to confirm you are not a bot',
        )

        for response in (
            self._embed_response(include_flags=False),
            self._embed_response(crawlable=False),
            self._embed_response(playable=False),
        ):
            def incomplete(request, **_kwargs):
                if '/oembed?' in request.full_url:
                    return self._oembed_response()
                return response

            with self.subTest(response=response):
                with mock.patch.object(
                    bridge.urllib.request,
                    'urlopen',
                    side_effect=incomplete,
                ):
                    result = bridge.verify_youtube_video_scrapling('M7lc1UVf-VE')
                self.assertFalse(result['available'])
                self.assertEqual(result['status'], 'error')
                self.assertEqual(
                    result['reason'],
                    'youtube_embed_public_proof_incomplete',
                )

    def test_explicit_subscription_signal_conflicting_with_public_player_is_unknown(self):
        bridge = self.bridge
        bridge._run_isolated_ytdlp = lambda *_args, **_kwargs: SimpleNamespace(
            returncode=1,
            stdout='',
            stderr='This video is available to members-only subscribers',
        )
        with mock.patch.object(
            bridge.urllib.request,
            'urlopen',
            side_effect=self._verification_urlopen,
        ):
            result = bridge.verify_youtube_video_scrapling('M7lc1UVf-VE')
        self.assertEqual(
            result,
            {
                'available': False,
                'status': 'error',
                'reason': 'youtube_restriction_signal_conflict',
            },
        )

    def test_anonymous_embed_identity_mismatch_and_malformed_payload_fail_closed(self):
        bridge = self.bridge
        bridge._run_isolated_ytdlp = lambda *_args, **_kwargs: SimpleNamespace(
            returncode=1,
            stdout='',
            stderr='Sign in to confirm you are not a bot',
        )

        def mismatched(request, **_kwargs):
            if '/oembed?' in request.full_url:
                return self._oembed_response()
            return self._embed_response(video_id='D5R_ZQZDR1Q')

        with mock.patch.object(bridge.urllib.request, 'urlopen', side_effect=mismatched):
            mismatch = bridge.verify_youtube_video_scrapling('M7lc1UVf-VE')
        self.assertEqual(mismatch['status'], 'error')
        self.assertEqual(mismatch['reason'], 'youtube_embed_identity_mismatch')

        def malformed(request, **_kwargs):
            if '/oembed?' in request.full_url:
                return self._oembed_response()
            return self._response(b'<html>no player payload</html>')

        with mock.patch.object(bridge.urllib.request, 'urlopen', side_effect=malformed):
            missing = bridge.verify_youtube_video_scrapling('M7lc1UVf-VE')
        self.assertEqual(missing['status'], 'error')
        self.assertEqual(missing['reason'], 'youtube_embed_payload_missing')

    def test_platform_supply_matches_worker_pool_order_filters_and_dedupes(self):
        bridge = self.bridge
        calls = []

        def select_page(table, select, filters, order, limit, offset):
            calls.append((table, select, filters, order, limit, offset))
            if table == 'poker_clips':
                return [
                    {'video_id': 'M7lc1UVf-VE', 'source_url': 'https://www.youtube.com/watch?v=M7lc1UVf-VE'},
                    {'video_id': 'BAD_URL_ID0', 'source_url': 'https://www.youtube.com/watch?v=D5R_ZQZDR1Q'},
                ]
            if table == 'sports_clips':
                return [
                    {'video_id': 'M7lc1UVf-VE', 'source_url': 'https://youtu.be/M7lc1UVf-VE'},
                    {'video_id': 'D5R_ZQZDR1Q', 'source_url': 'https://www.youtube.com/shorts/D5R_ZQZDR1Q'},
                ]
            raise AssertionError(table)

        bridge._select_page = select_page
        rows = bridge._load_platform_supply_rows({'M7lc1UVf-VE'})
        self.assertEqual(
            [(row['platform_source'], row['youtube_video_id']) for row in rows],
            [('sports', 'D5R_ZQZDR1Q')],
        )
        self.assertEqual(
            [(call[0], call[2], call[3], call[4], call[5]) for call in calls],
            [
                ('poker_clips', {'is_active': 'eq.true', 'oembed_ok': 'not.is.false'}, 'published_at.desc.nullslast', 1000, 0),
                ('sports_clips', {}, 'created_at.desc.nullslast', 1000, 0),
            ],
        )

    def test_daily_limit_reserves_capacity_for_library_poker_and_sports(self):
        bridge = self.bridge

        def planned(prefix, count, platform_source=None):
            rows = []
            for index in range(count):
                row = {'youtube_video_id': f'{prefix}{index:08d}'[:11]}
                if platform_source:
                    row['platform_source'] = platform_source
                rows.append(((1, index, row['youtube_video_id'], 'due'), row))
            return rows

        catalog = planned('LBR', 750)
        platform = planned('PKR', 750, 'poker') + planned('SPT', 750, 'sports')
        selected_catalog, selected_platform = bridge._select_supply_candidates(
            catalog,
            platform,
            750,
        )

        self.assertEqual(len(selected_catalog), 400)
        self.assertEqual(
            sum(row['platform_source'] == 'poker' for _, row in selected_platform),
            175,
        )
        self.assertEqual(
            sum(row['platform_source'] == 'sports' for _, row in selected_platform),
            175,
        )
        self.assertEqual(len(selected_catalog) + len(selected_platform), 750)

        interleaved = bridge._interleave_supply_candidates(
            [row for _, row in selected_catalog],
            [row for _, row in selected_platform],
        )
        self.assertEqual(
            [lane for lane, _row in interleaved[:9]],
            ['catalog', 'poker', 'sports'] * 3,
        )
        self.assertEqual(len(interleaved), 750)

    def test_release_recovery_rechecks_only_incident_rows_and_transient_errors(self):
        bridge = self.bridge
        now = datetime.fromisoformat('2026-09-27T05:10:00+00:00')
        incident = {
            'id': '11111111-1111-4111-8111-111111111111',
            'availability_status': 'restricted',
            'availability_checked_at': bridge.VERIFIER_INCIDENT_START.isoformat(),
            'published_at': '2026-09-01T00:00:00+00:00',
        }
        plan = bridge._candidate_plan(incident, None, False, now, False, True)
        self.assertEqual(plan[3], 'verifier_incident_recovery')
        self.assertEqual(
            bridge._candidate_plan(incident, None, False, now, False, False),
            'permanent_cooldown',
        )

        incident_end = {
            **incident,
            'availability_checked_at': bridge.VERIFIER_INCIDENT_END.isoformat(),
        }
        self.assertEqual(
            bridge._candidate_plan(incident_end, None, False, now, False, True)[3],
            'verifier_incident_recovery',
        )

        after_incident = {
            **incident,
            'availability_checked_at': '2026-09-27T04:04:26+00:00',
        }
        self.assertEqual(
            bridge._candidate_plan(after_incident, None, False, now, False, True),
            'permanent_cooldown',
        )
        transient = {**after_incident, 'availability_status': 'error'}
        self.assertEqual(
            bridge._candidate_plan(transient, None, False, now, False, True),
            'transient_cooldown',
        )

        incident_error = {**incident, 'availability_status': 'error'}
        self.assertEqual(
            bridge._candidate_plan(incident_error, None, False, now, False, True)[3],
            'verifier_incident_recovery',
        )

        failure = {
            'video_id': 'M7lc1UVf-VE',
            'verification_status': 'confirmed',
            'last_seen_at': bridge.VERIFIER_INCIDENT_END.isoformat(),
            'last_verified_at': bridge.VERIFIER_INCIDENT_END.isoformat(),
        }
        self.assertEqual(
            bridge._failure_candidate_plan(failure, now, False, True)[3],
            'verifier_incident_recovery',
        )
        # The first recovery generation ran under a broken production-host
        # verifier. Its durable surface is history, not a reason to strand the
        # affected error rows forever.
        attempted = {**failure, 'surface': 'release_recovery_failure'}
        self.assertEqual(
            bridge._failure_candidate_plan(attempted, now, False, True)[3],
            'verifier_incident_recovery',
        )
        attempted = {
            **failure,
            'surface': f'{bridge.RELEASE_RECOVERY_SURFACE_PREFIX}failure',
        }
        self.assertEqual(
            bridge._failure_candidate_plan(attempted, now, False, True),
            'permanent_cooldown',
        )

    def test_release_recovery_retries_cancelled_batch_errors_once_but_not_restrictions(self):
        bridge = self.bridge
        now = datetime.fromisoformat('2026-09-27T05:10:00+00:00')
        retry_at = bridge.CANCELLED_RECOVERY_START.isoformat()

        catalog_error = {
            'id': '11111111-1111-4111-8111-111111111111',
            'availability_status': 'error',
            'availability_checked_at': retry_at,
            'published_at': '2026-09-01T00:00:00+00:00',
        }
        self.assertEqual(
            bridge._candidate_plan(
                catalog_error, None, False, now, False, True,
            )[3],
            'verifier_incident_recovery',
        )

        for permanent_status in ('private', 'restricted', 'unavailable', 'embed_disabled'):
            permanent = {
                **catalog_error,
                'availability_status': permanent_status,
            }
            self.assertEqual(
                bridge._candidate_plan(
                    permanent, None, False, now, False, True,
                ),
                'permanent_cooldown',
            )

        failure_error = {
            'video_id': 'M7lc1UVf-VE',
            'verification_status': 'error',
            'last_seen_at': retry_at,
            'last_verified_at': retry_at,
            'surface': 'release_recovery_catalog',
        }
        self.assertEqual(
            bridge._failure_candidate_plan(
                failure_error, now, False, True,
            )[3],
            'verifier_incident_recovery',
        )

        current_generation_attempt = {
            **failure_error,
            'surface': f'{bridge.RELEASE_RECOVERY_SURFACE_PREFIX}failure',
        }
        self.assertEqual(
            bridge._failure_candidate_plan(
                current_generation_attempt, now, False, True,
            ),
            'transient_cooldown',
        )

        confirmed = {
            **failure_error,
            'verification_status': 'confirmed',
            'resolved': False,
        }
        self.assertEqual(
            bridge._failure_candidate_plan(confirmed, now, False, True),
            'permanent_cooldown',
        )

        after_cancelled_batch = {
            **failure_error,
            'last_verified_at': '2026-09-27T04:56:42.443255+00:00',
        }
        self.assertEqual(
            bridge._failure_candidate_plan(
                after_cancelled_batch, now, False, True,
            ),
            'transient_cooldown',
        )

        newer_report = {
            **failure_error,
            'last_seen_at': (
                bridge.CANCELLED_RECOVERY_END + timedelta(microseconds=1)
            ).isoformat(),
        }
        self.assertEqual(
            bridge._failure_candidate_plan(
                newer_report, now, False, True,
            ),
            'transient_cooldown',
        )

    def test_release_recovery_windows_are_exact_and_inclusive(self):
        bridge = self.bridge
        now = datetime.fromisoformat('2026-09-27T05:10:00+00:00')

        for boundary in (
            bridge.VERIFIER_INCIDENT_START,
            bridge.VERIFIER_INCIDENT_END,
        ):
            catalog = {
                'id': '11111111-1111-4111-8111-111111111111',
                'availability_status': 'restricted',
                'availability_checked_at': boundary.isoformat(),
                'published_at': '2026-09-01T00:00:00+00:00',
            }
            failure = {
                'video_id': 'M7lc1UVf-VE',
                'verification_status': 'confirmed',
                'last_seen_at': boundary.isoformat(),
                'last_verified_at': boundary.isoformat(),
                'surface': 'release_recovery_failure',
            }
            self.assertEqual(
                bridge._candidate_plan(
                    catalog, None, False, now, False, True,
                )[3],
                'verifier_incident_recovery',
            )
            self.assertEqual(
                bridge._failure_candidate_plan(
                    failure, now, False, True,
                )[3],
                'verifier_incident_recovery',
            )

        for outside in (
            bridge.VERIFIER_INCIDENT_START - timedelta(microseconds=1),
            bridge.VERIFIER_INCIDENT_END + timedelta(microseconds=1),
        ):
            catalog = {
                'id': '11111111-1111-4111-8111-111111111111',
                'availability_status': 'restricted',
                'availability_checked_at': outside.isoformat(),
                'published_at': '2026-09-01T00:00:00+00:00',
            }
            failure = {
                'video_id': 'M7lc1UVf-VE',
                'verification_status': 'confirmed',
                'last_seen_at': outside.isoformat(),
                'last_verified_at': outside.isoformat(),
            }
            self.assertEqual(
                bridge._candidate_plan(
                    catalog, None, False, now, False, True,
                ),
                'permanent_cooldown',
            )
            self.assertEqual(
                bridge._failure_candidate_plan(
                    failure, now, False, True,
                ),
                'permanent_cooldown',
            )

        for boundary in (
            bridge.CANCELLED_RECOVERY_START,
            bridge.CANCELLED_RECOVERY_END,
        ):
            catalog = {
                'id': '11111111-1111-4111-8111-111111111111',
                'availability_status': 'error',
                'availability_checked_at': boundary.isoformat(),
                'published_at': '2026-09-01T00:00:00+00:00',
            }
            failure = {
                'video_id': 'M7lc1UVf-VE',
                'verification_status': 'error',
                'last_seen_at': boundary.isoformat(),
                'last_verified_at': boundary.isoformat(),
                'surface': 'release_recovery_catalog',
            }
            self.assertEqual(
                bridge._candidate_plan(
                    catalog, None, False, now, False, True,
                )[3],
                'verifier_incident_recovery',
            )
            self.assertEqual(
                bridge._failure_candidate_plan(
                    failure, now, False, True,
                )[3],
                'verifier_incident_recovery',
            )

        for outside in (
            bridge.CANCELLED_RECOVERY_START - timedelta(microseconds=1),
            bridge.CANCELLED_RECOVERY_END + timedelta(microseconds=1),
        ):
            catalog = {
                'id': '11111111-1111-4111-8111-111111111111',
                'availability_status': 'error',
                'availability_checked_at': outside.isoformat(),
                'published_at': '2026-09-01T00:00:00+00:00',
            }
            failure = {
                'video_id': 'M7lc1UVf-VE',
                'verification_status': 'error',
                'last_seen_at': outside.isoformat(),
                'last_verified_at': outside.isoformat(),
                'surface': 'release_recovery_catalog',
            }
            self.assertEqual(
                bridge._candidate_plan(
                    catalog, None, False, now, False, True,
                ),
                'transient_cooldown',
            )
            self.assertEqual(
                bridge._failure_candidate_plan(
                    failure, now, False, True,
                ),
                'transient_cooldown',
            )

    def test_current_unknown_attempt_never_inherits_an_older_confirmed_counter(self):
        bridge = self.bridge
        unknown = {
            'available': False,
            'status': 'error',
            'reason': 'youtube_player_unplayable_unknown',
        }
        preserved_confirmed = {
            'verification_status': 'confirmed',
            'resolved': False,
        }
        self.assertEqual(
            bridge._attempt_outcome(unknown, preserved_confirmed),
            'unknown',
        )

    def test_platform_supply_is_verified_into_the_shared_registry_without_publication(self):
        bridge = self.bridge
        bridge.ensure_ytdlp_runtime = lambda: '2026.08.19'
        bridge.get_system_bot_id = lambda: '33333333-3333-4333-8333-333333333333'
        bridge.read_publication_controls = lambda: {
            'video_library_reel_creation': True,
            'video_library_reel_publication': True,
        }
        bridge._load_existing_publications = lambda: {}
        bridge._load_embed_failure_rows = lambda: []
        bridge._catalog_pages = lambda _source=None: iter([[]])
        bridge._load_platform_supply_rows = lambda _excluded=None: [
            {
                'youtube_video_id': 'M7lc1UVf-VE',
                'source_url': 'https://www.youtube.com/watch?v=M7lc1UVf-VE',
                'platform_source': 'poker',
            },
            {
                'youtube_video_id': 'D5R_ZQZDR1Q',
                'source_url': 'https://youtu.be/D5R_ZQZDR1Q',
                'platform_source': 'sports',
            },
        ]
        checked_at = datetime.now(timezone.utc).isoformat()
        bridge._verify_row = lambda _row: {
            'available': True,
            'status': 'verified',
            'reason': None,
            'verification_started_at': checked_at,
            'verification_checked_at': checked_at,
        }
        verdicts = []

        def record(video_id, availability, **kwargs):
            verdicts.append((video_id, availability['status'], kwargs.get('surface')))
            return {
                'video_id': video_id,
                'hit_count': 0,
                'verification_status': 'resolved',
                'resolved': True,
            }

        bridge._record_embed_verdict = record
        bridge._publish_row = lambda *_args, **_kwargs: self.fail('platform rows must never publish as the official account')
        bridge._feed_visible_asset_ids = lambda _rows: set()
        bridge._deadline_due = lambda *_args, **_kwargs: False

        arguments = self._arguments()
        arguments.release_recovery = True
        stats = bridge.run_bridge(arguments)
        self.assertEqual(stats['platform_candidates'], 2)
        self.assertEqual(stats['platform_verification_attempted'], 2)
        self.assertEqual(stats['platform_verified'], 2)
        self.assertEqual(stats['created'], 0)
        self.assertEqual(
            verdicts,
            [
                ('M7lc1UVf-VE', 'verified', 'horse_poker_supply_verifier'),
                ('D5R_ZQZDR1Q', 'verified', 'horse_sports_supply_verifier'),
            ],
        )
        self.assertEqual(
            stats['platform_by_source'],
            {
                'poker': {
                    'candidate': 1,
                    'attempted': 1,
                    'verified': 1,
                    'rejected': 0,
                    'unknown': 0,
                },
                'sports': {
                    'candidate': 1,
                    'attempted': 1,
                    'verified': 1,
                    'rejected': 0,
                    'unknown': 0,
                },
            },
        )

    def test_release_recovery_never_overrides_a_newer_failure_report(self):
        bridge = self.bridge
        bridge.ensure_ytdlp_runtime = lambda: '2026.08.19'
        bridge.get_system_bot_id = lambda: '33333333-3333-4333-8333-333333333333'
        bridge.read_publication_controls = lambda: {
            'video_library_reel_creation': True,
            'video_library_reel_publication': True,
        }
        asset = {
            'id': '11111111-1111-4111-8111-111111111111',
            'youtube_video_id': 'M7lc1UVf-VE',
            'source_id': 'TEST',
            'source_name': 'Test',
            'title': 'Incident candidate',
            'thumbnail_url': None,
            'published_at': '2026-09-01T00:00:00+00:00',
            'type': 'cash',
            'availability_status': 'restricted',
            'embeddable': False,
            'availability_checked_at': bridge.VERIFIER_INCIDENT_END.isoformat(),
        }
        bridge._load_existing_publications = lambda: {}
        bridge._load_embed_failure_rows = lambda: []
        bridge._catalog_pages = lambda _source=None: iter([[asset]])
        bridge._load_platform_supply_rows = lambda _excluded=None: []
        bridge._deadline_due = lambda *_args, **_kwargs: False
        checked_at = datetime.now(timezone.utc).isoformat()
        bridge._verify_row = lambda _row: {
            'available': True,
            'status': 'verified',
            'reason': None,
            'verification_started_at': checked_at,
            'verification_checked_at': checked_at,
        }
        bridge._record_embed_verdict = lambda *_args, **_kwargs: {
            'video_id': 'M7lc1UVf-VE',
            'hit_count': 1,
            'verification_status': 'pending',
            'resolved': False,
        }
        bridge._publish_row = mock.Mock(
            side_effect=AssertionError('a newer report must block publication')
        )

        arguments = self._arguments()
        arguments.limit = 1
        arguments.release_recovery = True
        stats = bridge.run_bridge(arguments)

        self.assertEqual(stats['release_recovery_candidates'], 1)
        self.assertEqual(stats['release_recovery_race_deferred'], 1)
        self.assertEqual(stats['failure_race_deferred'], 1)
        self.assertEqual(stats['verified'], 0)
        self.assertEqual(stats['created'], 0)
        bridge._publish_row.assert_not_called()

    def test_release_recovery_reuses_a_pending_same_run_attempt_exactly_once(self):
        bridge = self.bridge
        bridge.ensure_ytdlp_runtime = lambda: '2026.08.19'
        bridge.get_system_bot_id = lambda: '33333333-3333-4333-8333-333333333333'
        bridge.read_publication_controls = lambda: {
            'video_library_reel_creation': True,
            'video_library_reel_publication': True,
        }
        asset = {
            'id': '11111111-1111-4111-8111-111111111111',
            'youtube_video_id': 'M7lc1UVf-VE',
            'source_id': 'TEST',
            'source_name': 'Test',
            'title': 'Incident candidate',
            'thumbnail_url': None,
            'published_at': '2026-09-01T00:00:00+00:00',
            'type': 'cash',
            'availability_status': 'restricted',
            'embeddable': False,
            'availability_checked_at': bridge.VERIFIER_INCIDENT_END.isoformat(),
        }
        failure = {
            'video_id': 'M7lc1UVf-VE',
            'verification_status': 'confirmed',
            'resolved': False,
            'last_seen_at': bridge.VERIFIER_INCIDENT_END.isoformat(),
            'last_verified_at': bridge.VERIFIER_INCIDENT_END.isoformat(),
            'surface': 'release_recovery_failure',
            'error_code': None,
        }
        bridge._load_existing_publications = lambda: {}
        bridge._load_embed_failure_rows = lambda: [failure]
        bridge._catalog_pages = lambda _source=None: iter([[asset]])
        # Deliberately violate the loader's exclusion contract to prove the
        # bridge itself cannot verify the same ID once as catalog, once as a
        # platform candidate, and again as a failure row in one operation.
        bridge._load_platform_supply_rows = lambda _excluded=None: [{
            'youtube_video_id': 'M7lc1UVf-VE',
            'source_url': 'https://www.youtube.com/watch?v=M7lc1UVf-VE',
            'platform_source': 'poker',
        }]
        bridge._deadline_due = lambda *_args, **_kwargs: False
        attempts = []
        checked_at = datetime.now(timezone.utc).isoformat()

        def verify(row):
            attempts.append(row['youtube_video_id'])
            return {
                'available': True,
                'status': 'verified',
                'reason': None,
                'verification_started_at': checked_at,
                'verification_checked_at': checked_at,
            }

        bridge._verify_row = verify
        bridge._record_embed_verdict = lambda *_args, **_kwargs: {
            'video_id': 'M7lc1UVf-VE',
            'hit_count': 1,
            'verification_status': 'pending',
            'resolved': False,
        }
        bridge._publish_row = mock.Mock(
            side_effect=AssertionError('a pending race must not publish')
        )

        arguments = self._arguments()
        arguments.release_recovery = True
        stats = bridge.run_bridge(arguments)

        self.assertEqual(attempts, ['M7lc1UVf-VE'])
        self.assertEqual(stats['platform_candidates'], 0)
        self.assertEqual(stats['failure_verification_reused'], 1)
        self.assertEqual(stats['failure_verification_attempted'], 0)
        self.assertEqual(stats['release_recovery_candidates'], 1)
        self.assertEqual(stats['release_recovery_unknown'], 1)
        self.assertEqual(stats['release_recovery_race_deferred'], 1)
        self.assertEqual(stats['failure_race_deferred'], 1)
        bridge._publish_row.assert_not_called()

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
        self.assertEqual(first['deadline_phase'], 'supply_verification')
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
