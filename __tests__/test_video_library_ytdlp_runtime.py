"""Real-subprocess proof that the isolated yt-dlp child can import the
release-vendored package, and that a broken runtime aborts before any verdict.

The Open Claw release exposes ``yt_dlp`` only through
``PYTHONPATH=<release>/vendor``. The isolated runner scrubs the environment,
so these tests build a throwaway vendor directory holding a fake ``yt_dlp``
package, make it importable in this process only through that directory, and
execute the real runner. No network and no database are reachable: every
database entry point is replaced by a recorder that fails the test when used.
"""

import importlib
import importlib.util
import json
import logging
import os
import subprocess
import sys
import tempfile
import types
import unittest
from pathlib import Path
from unittest import mock


SCRIPTS_DIR = Path(__file__).resolve().parents[1] / 'scripts'
BRIDGE_PATH = SCRIPTS_DIR / 'video_library_to_reels.py'
SCRAPER_PATH = SCRIPTS_DIR / 'video_library_scraper.py'
FAKE_VERSION = '1999.01.02.424242'

FAKE_YTDLP_MAIN = '''\
import json
import os
import sys

if '--version' in sys.argv[1:]:
    print({version!r})
else:
    print(json.dumps({{
        'argv': sys.argv[1:],
        'pythonpath': os.environ.get('PYTHONPATH'),
        'home': os.environ.get('HOME'),
        'cwd': os.getcwd(),
        'environment_keys': sorted(os.environ),
    }}))
'''.format(version=FAKE_VERSION)

FAKE_SUPABASE_INIT = '''\
class _Query:
    def __init__(self):
        self._control_key = None

    def select(self, *_args, **_kwargs):
        return self

    def limit(self, *_args, **_kwargs):
        return self

    def eq(self, column, value):
        if column == 'control_key':
            self._control_key = value
        return self

    def execute(self):
        rows = [{'control_key': self._control_key, 'enabled': False, 'updated_at': None}]
        return type('Response', (), {'data': rows})()


class _Client:
    def table(self, _name):
        return _Query()


def create_client(_url, _key):
    return _Client()
'''


def _write_fake_ytdlp(vendor_dir, with_main=True):
    package_dir = Path(vendor_dir) / 'yt_dlp'
    package_dir.mkdir(parents=True)
    (package_dir / '__init__.py').write_text('')
    if with_main:
        (package_dir / '__main__.py').write_text(FAKE_YTDLP_MAIN)
    return package_dir


def _load_module(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class IsolatedYtDlpRuntimeTest(unittest.TestCase):
    def setUp(self):
        self.temporary_directory = tempfile.TemporaryDirectory(prefix='sp-ytdlp-runtime-')
        self.root = Path(self.temporary_directory.name)
        self.vendor = self.root / 'release' / 'vendor'
        self.vendor.mkdir(parents=True)
        self.addCleanup(self.temporary_directory.cleanup)

        self.assertNotIn('yt_dlp', sys.modules)
        self._saved_sys_path = list(sys.path)
        self.addCleanup(self._restore_import_state)

        load_environment = {
            'SP_ENV_FILE': str(self.root / 'absent.env'),
            'SP_LOG_DIR': str(self.root / 'logs'),
            'SP_EVIDENCE_DIR': str(self.root / 'evidence'),
        }
        fake_supabase = types.ModuleType('supabase')
        fake_supabase.create_client = lambda *_args, **_kwargs: None
        with mock.patch.dict(os.environ, load_environment), \
                mock.patch.dict(sys.modules, {'supabase': fake_supabase}), \
                mock.patch.object(sys, 'argv', ['video-library-runtime-test', '--help']), \
                mock.patch.object(logging, 'FileHandler', lambda *_a, **_k: logging.NullHandler()):
            os.environ.pop('NEXT_PUBLIC_SUPABASE_URL', None)
            os.environ.pop('SUPABASE_SERVICE_ROLE_KEY', None)
            self.bridge = _load_module(f'video_library_to_reels_runtime_{id(self)}', BRIDGE_PATH)
            self.scraper = _load_module(f'video_library_scraper_runtime_{id(self)}', SCRAPER_PATH)

        # Nothing below may reach the database or the network.
        self.database_calls = []
        self.bridge.SUPABASE_URL = 'http://127.0.0.1:9'
        self.bridge.SUPABASE_KEY = 'test-only-not-a-credential'
        self.bridge.EVIDENCE_DIR = self.root / 'evidence'
        self.bridge.EVIDENCE_DIR.mkdir(parents=True, exist_ok=True)
        for name in (
            '_request', '_rpc', '_select_page', 'get_system_bot_id',
            'read_publication_controls',
            '_load_existing_publications', '_load_embed_failure_rows',
            '_catalog_pages', '_record_embed_verdict', '_publish_row',
        ):
            setattr(self.bridge, name, self._database_recorder(name))

    def _restore_import_state(self):
        sys.path[:] = self._saved_sys_path
        sys.modules.pop('yt_dlp', None)
        importlib.invalidate_caches()

    def _database_recorder(self, name):
        def record(*_args, **_kwargs):
            self.database_calls.append(name)
            raise AssertionError(f'{name} must not be reached')
        return record

    def _vendor_fake_ytdlp(self, with_main=True):
        """Make the fake package importable here ONLY through the vendor path."""
        package_dir = _write_fake_ytdlp(self.vendor, with_main=with_main)
        sys.path.insert(0, str(self.vendor))
        importlib.invalidate_caches()
        spec = importlib.util.find_spec('yt_dlp')
        self.assertEqual(
            os.path.realpath(spec.origin),
            os.path.realpath(package_dir / '__init__.py'),
        )
        return package_dir

    def test_real_child_imports_the_vendored_package_in_both_scripts(self):
        self._vendor_fake_ytdlp()
        for label, module in (('publisher', self.bridge), ('scraper', self.scraper)):
            with self.subTest(script=label):
                completed = module._run_isolated_ytdlp(['--version'], timeout=60)
                self.assertEqual(
                    (completed.returncode, completed.stdout.strip()),
                    (0, FAKE_VERSION),
                    completed.stderr,
                )
                self.assertEqual(module.ensure_ytdlp_runtime(), FAKE_VERSION)

    def test_child_receives_only_the_derived_root_and_no_ambient_state(self):
        self._vendor_fake_ytdlp()
        ambient = {
            'PYTHONPATH': os.pathsep.join([str(self.root / 'ambient'), str(self.vendor)]),
            'PYTHONHOME_TEST_LEAK': 'leak',
            'SUPABASE_SERVICE_ROLE_KEY': 'test-only-must-not-leak',
        }
        for label, module in (('publisher', self.bridge), ('scraper', self.scraper)):
            with self.subTest(script=label), mock.patch.dict(os.environ, ambient):
                completed = module._run_isolated_ytdlp(['--probe'], timeout=60)
                self.assertEqual(completed.returncode, 0, completed.stderr)
                child = json.loads(completed.stdout)
                self.assertEqual(
                    os.path.realpath(child['pythonpath']),
                    os.path.realpath(self.vendor),
                )
                self.assertNotIn(os.pathsep, child['pythonpath'])
                self.assertNotIn('PYTHONHOME_TEST_LEAK', child['environment_keys'])
                self.assertNotIn('SUPABASE_SERVICE_ROLE_KEY', child['environment_keys'])
                self.assertIn('PYTHONNOUSERSITE', child['environment_keys'])
                self.assertEqual(
                    os.path.realpath(child['cwd']),
                    os.path.realpath(child['home']),
                )
                self.assertFalse(Path(child['home']).exists())
                self.assertEqual(
                    child['argv'],
                    ['--ignore-config', '--no-plugin-dirs', '--no-cache-dir', '--probe'],
                )

    def test_absent_package_fails_closed_with_a_distinct_error(self):
        for label, module in (('publisher', self.bridge), ('scraper', self.scraper)):
            with self.subTest(script=label), \
                    mock.patch.object(importlib.util, 'find_spec', return_value=None), \
                    mock.patch.object(subprocess, 'run') as run:
                with self.assertRaises(module.YtDlpUnavailableError):
                    module._run_isolated_ytdlp(['--version'], timeout=60)
                with self.assertRaises(module.YtDlpUnavailableError):
                    module.ensure_ytdlp_runtime()
                run.assert_not_called()
            self.assertTrue(issubclass(module.YtDlpUnavailableError, RuntimeError))

    def test_package_without_entry_point_is_rejected_before_execution(self):
        self._vendor_fake_ytdlp(with_main=False)
        for label, module in (('publisher', self.bridge), ('scraper', self.scraper)):
            with self.subTest(script=label), mock.patch.object(subprocess, 'run') as run:
                with self.assertRaisesRegex(module.YtDlpUnavailableError, 'unusable location'):
                    module.ensure_ytdlp_runtime()
                run.assert_not_called()

    def test_child_that_returns_no_version_fails_the_self_check(self):
        package_dir = self._vendor_fake_ytdlp()
        (package_dir / '__main__.py').write_text('import sys\nsys.exit("broken release")\n')
        for label, module in (('publisher', self.bridge), ('scraper', self.scraper)):
            with self.subTest(script=label):
                with self.assertRaisesRegex(module.YtDlpUnavailableError, 'self-check failed'):
                    module.ensure_ytdlp_runtime()

    def test_run_aborts_before_any_database_access_or_verdict(self):
        bridge = self.bridge
        with mock.patch.object(importlib.util, 'find_spec', return_value=None):
            with self.assertRaises(bridge.YtDlpUnavailableError):
                bridge.run_bridge(types.SimpleNamespace(
                    source=None, limit=2, sync_captions=False, audit_all=False,
                    dry_run=False, deadline_at=None,
                ))
            with mock.patch.object(sys, 'argv', ['video_library_to_reels.py', '--limit', '2', '--verify']):
                exit_code = bridge.main()
        self.assertEqual(exit_code, bridge.YTDLP_RUNTIME_EXIT_CODE)
        self.assertEqual(self.database_calls, [])
        evidence = [
            json.loads(path.read_text())
            for path in bridge.EVIDENCE_DIR.glob('video_library_to_reels_2*.json')
        ]
        self.assertEqual(len(evidence), 1)
        self.assertIn('yt-dlp runtime unavailable', evidence[0]['fatal_error'])
        self.assertEqual(evidence[0]['stats']['aborted_reason'], 'ytdlp_runtime_unavailable')
        self.assertEqual(evidence[0]['stats']['verification_attempted'], 0)

    def test_runtime_lost_mid_run_aborts_instead_of_recording_error_verdicts(self):
        bridge = self.bridge

        class OEmbedResponse:
            status = 200

            def __enter__(self):
                return self

            def __exit__(self, *_args):
                return False

            @staticmethod
            def read(_limit):
                return json.dumps({'title': 'Title', 'author_name': 'Author'}).encode('utf-8')

        bridge._run_isolated_ytdlp = lambda *_args, **_kwargs: types.SimpleNamespace(
            returncode=1, stdout='', stderr='/usr/bin/python3: No module named yt_dlp\n',
        )
        with mock.patch.object(bridge.urllib.request, 'urlopen', return_value=OEmbedResponse()):
            with self.assertRaises(bridge.YtDlpUnavailableError):
                bridge._verify_row({'youtube_video_id': 'M7lc1UVf-VE'})
        self.assertEqual(self.database_calls, [])

    def test_publisher_preflight_executes_the_child_before_the_schema_check(self):
        bridge = self.bridge
        order = []
        bridge.run_schema_preflight = lambda: order.append('schema')
        real_ensure = bridge.ensure_ytdlp_runtime
        bridge.ensure_ytdlp_runtime = lambda: order.append(real_ensure())
        with mock.patch.object(sys, 'argv', ['video_library_to_reels.py', '--preflight-only']):
            self._vendor_fake_ytdlp()
            self.assertEqual(bridge.main(), 0)
            self.assertEqual(order, [FAKE_VERSION, 'schema'])

            order.clear()
            with mock.patch.object(importlib.util, 'find_spec', return_value=None):
                self.assertEqual(bridge.main(), bridge.YTDLP_RUNTIME_EXIT_CODE)
            self.assertEqual(order, [])

    def _run_scraper_preflight(self, vendor_has_entry_point):
        """The systemd/deploy command shape: only PYTHONPATH=<vendor>, ``-s``."""
        release_vendor = self.root / ('good' if vendor_has_entry_point else 'broken') / 'vendor'
        release_vendor.mkdir(parents=True)
        _write_fake_ytdlp(release_vendor, with_main=vendor_has_entry_point)
        (release_vendor / 'supabase').mkdir()
        (release_vendor / 'supabase' / '__init__.py').write_text(FAKE_SUPABASE_INIT)
        environment = {
            'PATH': '/usr/bin:/bin',
            'HOME': str(self.root / 'home'),
            'PYTHONPATH': str(release_vendor),
            'PYTHONNOUSERSITE': '1',
            'PYTHONDONTWRITEBYTECODE': '1',
            'SP_ENV_FILE': str(self.root / 'absent.env'),
            'SP_LOG_DIR': str(self.root / 'subprocess-logs'),
            'SP_EVIDENCE_DIR': str(self.root / 'subprocess-evidence'),
            'NEXT_PUBLIC_SUPABASE_URL': 'http://127.0.0.1:9',
            'SUPABASE_SERVICE_ROLE_KEY': 'test-only-not-a-credential',
        }
        return subprocess.run(
            [sys.executable, '-s', str(SCRAPER_PATH), '--preflight-only'],
            capture_output=True, text=True, timeout=120, check=False,
            env=environment, cwd=str(self.root),
        )

    def test_scraper_preflight_command_runs_the_child_and_fails_a_broken_release(self):
        good = self._run_scraper_preflight(vendor_has_entry_point=True)
        self.assertEqual(good.returncode, 0, good.stderr)
        self.assertIn(f'Isolated yt-dlp runtime verified: version {FAKE_VERSION}', good.stderr)
        self.assertIn('schema contract verified', good.stderr)

        broken = self._run_scraper_preflight(vendor_has_entry_point=False)
        self.assertEqual(broken.returncode, 3, broken.stderr)
        self.assertIn('yt-dlp runtime unavailable', broken.stderr)
        self.assertNotIn('schema contract verified', broken.stderr)


class ScraperWorkersCredentialTest(unittest.TestCase):
    def test_report_uses_only_the_workers_secret_and_never_cron_secret(self):
        with tempfile.TemporaryDirectory(prefix='sp-scraper-secret-') as directory:
            load_environment = {
                'SP_ENV_FILE': str(Path(directory) / 'absent.env'),
                'SP_LOG_DIR': str(Path(directory) / 'logs'),
                'SP_EVIDENCE_DIR': str(Path(directory) / 'evidence'),
                'CRON_SECRET': 'test-only-vercel-hop-value',
            }
            fake_supabase = types.ModuleType('supabase')
            fake_supabase.create_client = lambda *_args, **_kwargs: None
            with mock.patch.dict(os.environ, load_environment), \
                    mock.patch.dict(sys.modules, {'supabase': fake_supabase}), \
                    mock.patch.object(sys, 'argv', ['video-library-runtime-test', '--help']), \
                    mock.patch.object(logging, 'FileHandler', lambda *_a, **_k: logging.NullHandler()):
                os.environ.pop('NEXT_PUBLIC_SUPABASE_URL', None)
                os.environ.pop('SUPABASE_SERVICE_ROLE_KEY', None)
                scraper = _load_module('video_library_scraper_secret_test', SCRAPER_PATH)
                self.assertEqual(scraper.CRON_SECRET, 'test-only-vercel-hop-value')
                os.environ['WORKERS_BASE_URL'] = 'http://127.0.0.1:9'
                os.environ.pop('WORKERS_CRON_SECRET', None)
                with mock.patch.object(scraper.urllib.request, 'urlopen') as urlopen:
                    with self.assertRaisesRegex(RuntimeError, 'WORKERS_CRON_SECRET is not set'):
                        scraper.report_to_api({'run_id': 'run-1'})
                    urlopen.assert_not_called()


if __name__ == '__main__':
    unittest.main()
