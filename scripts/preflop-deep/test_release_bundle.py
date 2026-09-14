"""Hermetic release transport tests. Never start Pio or contact the gateway."""
import ast
import hashlib
import json
import os
from pathlib import Path
import stat
import tempfile
import unittest
from unittest.mock import patch


SOURCE = Path(__file__).with_name('run_machine.py').read_text(encoding='utf-8')
TREE = ast.parse(SOURCE)
FILES = ('run_machine.py', 'tree_gen.py', 'pio_harvest.py', 'orchestrate.py')
FUNCTIONS = ast.Module(body=[node for node in TREE.body if (
    isinstance(node, ast.FunctionDef) and node.name in (
        '_read_controller_release_bundle', '_reject_legacy_database_environment'
    )
) or (isinstance(node, ast.Assign) and any(
    isinstance(target, ast.Name) and target.id == 'FORBIDDEN_DATABASE_ENVIRONMENT'
    for target in node.targets
))], type_ignores=[])
SCOPE = {'os': os, 'stat': stat, 'hashlib': hashlib, 'json': json}
exec(compile(ast.fix_missing_locations(FUNCTIONS), 'run_machine.py', 'exec'), SCOPE)
READ = SCOPE['_read_controller_release_bundle']


class ReleaseBundleTests(unittest.TestCase):
    def setUp(self):
        # macOS exposes /var as a system symlink to /private/var. The release
        # guard is correct to reject links in a supplied bundle path, so keep
        # the fixture on the canonical temp path instead of weakening it.
        self.temp = tempfile.TemporaryDirectory(dir=os.path.realpath(tempfile.gettempdir()))
        self.addCleanup(self.temp.cleanup)
        self.bundle = Path(self.temp.name) / 'bundle'
        self.bundle.mkdir()
        self.payloads = {name: ('# ' + name + '\n').encode('ascii') for name in FILES}
        self.payloads['run_machine.py'] = SOURCE.encode('utf-8')
        for name, content in self.payloads.items():
            (self.bundle / name).write_bytes(content)
        digest = hashlib.sha256()
        for name in FILES:
            digest.update(name.encode('ascii') + b'\0' + self.payloads[name] + b'\0')
        self.manifest = {
            'pipeline_distribution': 'controller-local-bundle.v1',
            'pipeline_files_sha256': {name: hashlib.sha256(content).hexdigest()
                                      for name, content in self.payloads.items()},
            'pipeline_bundle_checksum': digest.hexdigest(),
            'source_combo_order_schema': 'piosolver.show_hand_order.v1',
            'source_combo_order_sha256': '1' * 64,
            'release_gate': {'solver_ready': False},
        }
        self.seal()

    def seal(self):
        self.raw = (json.dumps(self.manifest) + '\n').encode('utf-8')
        (self.bundle / 'phases.json').write_bytes(self.raw)
        self.approved = hashlib.sha256(self.raw).hexdigest()

    def read(self):
        return READ(str(self.bundle), self.approved, FILES)

    def test_valid_bundle_returns_exact_bytes_without_opening_gate(self):
        raw, manifest, payloads = self.read()
        self.assertEqual(raw, self.raw)
        self.assertEqual(payloads, self.payloads)
        self.assertFalse(manifest['release_gate']['solver_ready'])

    def test_changed_manifest_rejected_even_with_plausible_local_checksums(self):
        self.manifest['release_gate']['solver_ready'] = True
        old_approved = self.approved
        self.seal()
        with self.assertRaisesRegex(SystemExit, 'APPROVED_MANIFEST_CHECKSUM'):
            READ(str(self.bundle), old_approved, FILES)

    def test_each_changed_pipeline_file_rejected(self):
        for name in FILES:
            with self.subTest(name=name):
                (self.bundle / name).write_bytes(b'# modified\n')
                with self.assertRaisesRegex(SystemExit, 'file checksum mismatch'):
                    self.read()
                (self.bundle / name).write_bytes(self.payloads[name])

    def test_aggregate_digest_independently_enforced(self):
        self.manifest['pipeline_bundle_checksum'] = '2' * 64
        self.seal()
        with self.assertRaisesRegex(SystemExit, 'pipeline bundle does not match'):
            self.read()

    def test_missing_or_extra_checksum_entries_rejected(self):
        for name in ('missing', 'extra'):
            with self.subTest(case=name):
                saved = dict(self.manifest['pipeline_files_sha256'])
                if name == 'missing':
                    del self.manifest['pipeline_files_sha256']['tree_gen.py']
                else:
                    self.manifest['pipeline_files_sha256']['../foreign.py'] = '3' * 64
                self.seal()
                with self.assertRaisesRegex(SystemExit, 'every exact pipeline filename'):
                    self.read()
                self.manifest['pipeline_files_sha256'] = saved

    def test_invalid_digest_forms_rejected(self):
        original = self.manifest['pipeline_files_sha256']['tree_gen.py']
        for value in (None, 12, '0' * 64, 'F' * 64, 'a' * 63):
            with self.subTest(value=value):
                self.manifest['pipeline_files_sha256']['tree_gen.py'] = value
                self.seal()
                with self.assertRaisesRegex(SystemExit, 'nonzero lowercase SHA-256'):
                    self.read()
        self.manifest['pipeline_files_sha256']['tree_gen.py'] = original

    def test_legacy_distribution_has_no_network_fallback(self):
        self.manifest.pop('pipeline_distribution')
        self.seal()
        with self.assertRaisesRegex(SystemExit, 'does not approve'):
            self.read()

    def test_relative_and_network_paths_rejected(self):
        for path in ('', '.', 'relative/bundle', '//server/share', '\\\\server\\share'):
            with self.subTest(path=path):
                with self.assertRaises(SystemExit):
                    READ(path, self.approved, FILES)

    def test_extra_and_missing_files_rejected(self):
        extra = self.bundle / 'queue.py'
        extra.write_bytes(b'# unexpected module')
        with self.assertRaisesRegex(SystemExit, 'exactly the five approved files'):
            self.read()
        extra.unlink()
        (self.bundle / 'tree_gen.py').unlink()
        with self.assertRaisesRegex(SystemExit, 'exactly the five approved files'):
            self.read()

    def test_directory_instead_of_payload_rejected(self):
        path = self.bundle / 'tree_gen.py'
        path.unlink()
        path.mkdir()
        with self.assertRaisesRegex(SystemExit, 'regular files'):
            self.read()

    def test_oversized_payload_rejected_before_import(self):
        with (self.bundle / 'tree_gen.py').open('wb') as file:
            file.truncate(16 * 1024 * 1024 + 1)
        with self.assertRaisesRegex(SystemExit, 'size limit'):
            self.read()

    def test_reparse_directory_rejected(self):
        original = os.lstat
        def lstat(path):
            value = original(path)
            if os.path.abspath(path) == str(self.bundle):
                class Redirect:
                    st_mode = value.st_mode
                    st_file_attributes = 0x400
                return Redirect()
            return value
        with patch.object(os, 'lstat', side_effect=lstat):
            with self.assertRaisesRegex(SystemExit, 'reparse points'):
                self.read()

    def test_non_object_manifest_rejected(self):
        raw = b'[]'
        (self.bundle / 'phases.json').write_bytes(raw)
        with self.assertRaisesRegex(SystemExit, 'does not approve'):
            READ(str(self.bundle), hashlib.sha256(raw).hexdigest(), FILES)

    def test_bootstrap_installs_verified_files_without_network_or_solver(self):
        self.run_bootstrap()

    def test_running_launcher_must_match_bundle(self):
        with self.assertRaisesRegex(SystemExit, 'running launcher bytes do not match'):
            self.run_bootstrap(foreign_launcher=True)

    def run_bootstrap(self, foreign_launcher=False):
        target = Path(self.temp.name) / 'installed'
        target.mkdir()
        launcher = target / 'run_machine.py'
        launcher.write_bytes(b'# foreign' if foreign_launcher else self.payloads['run_machine.py'])
        end = next(index for index, node in enumerate(TREE.body)
                   if isinstance(node, ast.Import) and any(alias.name == 'atexit' for alias in node.names))
        module = ast.fix_missing_locations(ast.Module(body=TREE.body[:end], type_ignores=[]))
        environment = {
            'SOLVER_WORKER_API_URL': 'https://smarter.poker/api/training/solver-worker',
            'SOLVER_WORKER_HMAC_SECRET': '1' * 64,  # synthetic test fixture only
            'PIPELINE_COMMIT': 'b' * 40,
            'APPROVED_MANIFEST_CHECKSUM': self.approved,
            'SOLVER_RELEASE_BUNDLE_DIRECTORY': str(self.bundle),
        }
        cwd = os.getcwd()
        import sys
        old_path = list(sys.path)
        try:
            with patch.dict(os.environ, environment, clear=True), \
                    patch.object(sys, 'argv', ['run_machine.py', 'M1', '2', '0', '--canary']), \
                    patch('urllib.request.urlopen', side_effect=AssertionError('unexpected network')), \
                    patch('subprocess.Popen', side_effect=AssertionError('unexpected process')):
                exec(compile(module, str(launcher), 'exec'), {'__file__': str(launcher)})
            for name in FILES:
                self.assertEqual((target / name).read_bytes(), self.payloads[name])
        finally:
            os.chdir(cwd)
            sys.path[:] = old_path

    def test_database_environment_guard_remains_fail_closed(self):
        reject = SCOPE['_reject_legacy_database_environment']
        reject({'SYSTEMROOT': 'test'})
        for name in ('SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_URL', 'DATABASE_URL', 'PGPASSWORD'):
            with self.subTest(name=name):
                with self.assertRaisesRegex(SystemExit, 'remove legacy database'):
                    reject({name: 'synthetic-value'})

    def test_orchestrator_uses_only_launcher_verified_manifest(self):
        source = Path(__file__).with_name('orchestrate.py').read_text(encoding='utf-8')
        tree = ast.parse(source)
        body = [node for node in tree.body if isinstance(node, ast.FunctionDef) and node.name == 'fetch_text']
        module = ast.fix_missing_locations(ast.Module(body=body, type_ignores=[]))
        scope = {'hashlib': hashlib, 'APPROVED_MANIFEST_BYTES': self.raw,
                 'APPROVED_MANIFEST_CHECKSUM': self.approved}
        exec(compile(module, 'orchestrate.py', 'exec'), scope)
        with patch('urllib.request.urlopen', side_effect=AssertionError('unexpected network')):
            self.assertEqual(scope['fetch_text']('phases.json'), self.raw.decode('utf-8'))
            with self.assertRaisesRegex(SystemExit, 'only the approved phases.json'):
                scope['fetch_text']('../other.py')
            scope['APPROVED_MANIFEST_BYTES'] = None
            with self.assertRaisesRegex(SystemExit, 'supplied by the pinned launcher'):
                scope['fetch_text']('phases.json')
            scope['APPROVED_MANIFEST_BYTES'] = b'{}'
            with self.assertRaisesRegex(SystemExit, 'manifest checksum does not match'):
                scope['fetch_text']('phases.json')
        self.assertIn('orchestrate.APPROVED_MANIFEST_BYTES = manifest_bytes', SOURCE)
        self.assertNotIn('raw.githubusercontent.com', SOURCE)
        self.assertNotIn('raw.githubusercontent.com', source)


if __name__ == '__main__':
    unittest.main()
