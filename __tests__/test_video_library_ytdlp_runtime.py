"""The Reel publisher still uses a release-pinned isolated yt-dlp verifier.

Phase 3 removed yt-dlp from discovery only. This retains the publisher runtime
contract without pretending the registry ingestor uses that binary.
"""

import importlib
import importlib.util
import logging
import os
import subprocess
import sys
import tempfile
import types
import unittest
from pathlib import Path
from unittest import mock

BRIDGE_PATH = Path(__file__).resolve().parents[1] / 'scripts' / 'video_library_to_reels.py'
FAKE_VERSION = '1999.01.02.424242'
sys.path.insert(0, str(BRIDGE_PATH.parent))
from test_video_source_registry_ingest import RegistryIngestTests  # noqa: E402,F401


def load_bridge(name):
    spec = importlib.util.spec_from_file_location(name, BRIDGE_PATH)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class PublisherYtDlpRuntimeTest(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix='sp-ytdlp-publisher-')
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.vendor = self.root / 'vendor'
        package = self.vendor / 'yt_dlp'
        package.mkdir(parents=True)
        (package / '__init__.py').write_text('')
        (package / '__main__.py').write_text(
            "import sys\nprint(%r) if '--version' in sys.argv else print('{}')\n" % FAKE_VERSION
        )
        self.saved_path = list(sys.path)
        self.addCleanup(self.restore)
        sys.path.insert(0, str(self.vendor))
        importlib.invalidate_caches()
        fake_supabase = types.ModuleType('supabase')
        fake_supabase.create_client = lambda *_args, **_kwargs: None
        environment = {'SP_ENV_FILE': str(self.root / 'missing'), 'SP_EVIDENCE_DIR': str(self.root / 'evidence')}
        with mock.patch.dict(os.environ, environment), mock.patch.dict(sys.modules, {'supabase': fake_supabase}), \
                mock.patch.object(sys, 'argv', ['publisher-test', '--help']), \
                mock.patch.object(logging, 'FileHandler', lambda *_args, **_kwargs: logging.NullHandler()):
            self.bridge = load_bridge(f'publisher_runtime_{id(self)}')

    def restore(self):
        sys.path[:] = self.saved_path
        sys.modules.pop('yt_dlp', None)
        importlib.invalidate_caches()

    def test_real_child_imports_only_the_vendored_runtime(self):
        completed = self.bridge._run_isolated_ytdlp(['--version'], timeout=30)
        self.assertEqual(completed.returncode, 0, completed.stderr)
        self.assertEqual(completed.stdout.strip(), FAKE_VERSION)
        self.assertEqual(self.bridge.ensure_ytdlp_runtime(), FAKE_VERSION)

    def test_missing_runtime_fails_before_execution(self):
        with mock.patch.object(importlib.util, 'find_spec', return_value=None), \
                mock.patch.object(subprocess, 'run') as run:
            with self.assertRaises(self.bridge.YtDlpUnavailableError):
                self.bridge.ensure_ytdlp_runtime()
            run.assert_not_called()


if __name__ == '__main__':
    unittest.main()
