"""Native filesystem, Git, process and HTTP proofs; no production requests."""
import contextlib
import hashlib
import http.server
import importlib.util
import io
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import threading
import time
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('runtime', Path(__file__).with_name('local_scraper_runtime.py'))
runtime = importlib.util.module_from_spec(spec)
spec.loader.exec_module(runtime)


class RuntimeProof(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.base = Path(self.tmp.name)
        self.root = self.base / 'runtime'
        self.root.mkdir()
        self.state = self.base / 'state'
        self.state.mkdir()
        self.inputs = self.base / 'inputs'
        self.inputs.mkdir()
        for name in runtime.INPUTS:
            (self.inputs / name).write_text('{"catalog":"existing"}')
        self.repo = self.base / 'repo'
        self.repo.mkdir()
        self.git('init', '-q')
        self.git('config', 'user.name', 'Runtime Proof')
        self.git('config', 'user.email', 'proof@example.invalid')
        for name in runtime.FILES:
            path = self.repo / name
            path.parent.mkdir(exist_ok=True)
            path.write_text('raise SystemExit(7)\n')
        (self.repo / 'scripts/local_scraper_runtime.py').write_bytes(Path(runtime.__file__).read_bytes())
        self.git('add', 'scripts')
        self.git('commit', '-qm', 'fixture')
        self.sha = self.git('rev-parse', 'HEAD').strip()
        self.git('update-ref', 'refs/remotes/origin/main', self.sha)
        self.requests = []
        self.reply = 41
        owner = self
        class Handler(http.server.BaseHTTPRequestHandler):
            def log_message(self, *args):
                pass
            def do_POST(self):
                owner.requests.append(json.loads(self.rfile.read(int(self.headers['Content-Length']))))
                self.send_response(200)
                self.end_headers()
                self.wfile.write(json.dumps(owner.reply).encode())
        self.server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), Handler)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.url_patch = patch.object(runtime, 'SUPABASE_URL', 'http://127.0.0.1:' + str(self.server.server_port))
        self.url_patch.start()
        runtime.atomic_write(self.root / 'auth.json', runtime.json_bytes({'url': runtime.SUPABASE_URL, 'key':'local-test-key-' * 4}))

    def tearDown(self):
        self.url_patch.stop()
        self.server.shutdown()
        self.server.server_close()
        self.thread.join()
        self.tmp.cleanup()

    def git(self, *args):
        return subprocess.check_output(['git', '-C', str(self.repo), *args], stderr=subprocess.DEVNULL).decode()

    def install(self, python=None):
        # Only third-party browser package availability is substituted. Git,
        # release bytes, filesystem publication, manifests and child execution
        # use the real implementation and disposable native resources.
        with patch.object(runtime, 'verify_python') as prerequisite:
            result = runtime.install(self.repo, self.sha, self.root, self.state, self.inputs, Path(python or sys.executable))
            prerequisite.assert_called_once()
            return result

    def test_coherent_release_preserves_state_and_replays_install(self):
        (self.state / 'pokeratlas-sweep-state.json').write_text('{"offset":33}')
        first = self.install()
        self.assertEqual(self.install(), first)
        release, manifest, _ = runtime.inspect_release(self.root)
        self.assertEqual(manifest['revision'], self.sha)
        self.assertEqual((release / 'data/pokeratlas-sweep-state.json').read_text(), '{"offset":33}')
        self.assertEqual(len(list((self.root / 'releases').iterdir())), 1)
        self.assertFalse((release / '.env').exists())

    def test_unpublished_or_missing_release_refuses_before_switch(self):
        self.install()
        original = (self.root / 'current').readlink()
        (self.repo / runtime.FILES[0]).write_text('print("candidate")')
        self.git('commit', '-am', 'unpublished')
        self.sha = self.git('rev-parse', 'HEAD').strip()
        with self.assertRaisesRegex(runtime.RuntimeFault, 'protected_main'):
            self.install()
        self.assertEqual((self.root / 'current').readlink(), original)

    def test_missing_code_is_detected_without_starting_daemon(self):
        self.install()
        (self.root / 'current' / runtime.FILES[0]).unlink()
        with self.assertRaisesRegex(runtime.RuntimeFault, 'release_file_missing'):
            runtime.inspect_release(self.root)
        with patch.object(runtime.subprocess, 'Popen') as child, contextlib.redirect_stderr(io.StringIO()):
            self.assertEqual(runtime.run(self.root), 1)
            child.assert_not_called()
        self.assertEqual(self.requests[0]['p_payload']['failure_code'], 'release_file_missing')

    def test_changed_code_and_reinstall_fail_closed(self):
        self.install()
        path = self.root / 'current' / runtime.FILES[0]
        os.chmod(path, 0o600)
        path.write_text('print("altered")')
        with self.assertRaisesRegex(runtime.RuntimeFault, 'release_file_changed'):
            runtime.inspect_release(self.root)
        with self.assertRaisesRegex(runtime.RuntimeFault, 'existing_release_changed'):
            self.install()
        self.assertEqual(path.read_text(), 'print("altered")')

    def test_interrupted_staging_leaves_current_and_data_intact(self):
        self.install()
        original = (self.root / 'current').readlink()
        write = runtime.atomic_write
        def fail(path, data, mode=0o600):
            if '.stage-' in str(path) and str(path).endswith('browser_heal.py'):
                raise OSError('injected disk failure')
            return write(path, data, mode)
        with patch.object(runtime, 'atomic_write', side_effect=fail), self.assertRaises(OSError):
            self.install()
        self.assertEqual((self.root / 'current').readlink(), original)
        runtime.inspect_release(self.root)
        self.assertFalse(list((self.root / 'releases').glob('.stage-*')))

    def test_venv_entrypoint_is_not_resolved_to_base_python(self):
        python = self.base / 'venv/bin/python3'
        python.parent.mkdir(parents=True)
        python.symlink_to(sys.executable)
        result = self.install(python)
        self.assertEqual(result['runtime']['python'], str(python))

    def test_native_child_failure_is_durable_once_across_restarts(self):
        self.install()
        with contextlib.redirect_stderr(io.StringIO()):
            self.assertEqual(runtime.run(self.root), 1)
            self.assertEqual(runtime.run(self.root), 1)
        self.assertEqual(len(self.requests), 1)
        self.assertEqual(self.requests[0]['p_payload']['failure_code'], 'daemon_exited_7')
        self.assertEqual(len(list((self.root / 'outbox').glob('*.json'))), 1)
        self.assertEqual(len(list((self.root / 'receipts').glob('*.json'))), 1)

    def test_delivery_loss_and_receipt_loss_replay_same_event_key(self):
        event = runtime.queue_fault(self.root, 'release_missing')
        key = json.loads(event.read_text())['p_event_key']
        with self.assertRaisesRegex(runtime.RuntimeFault, 'delivery_unavailable'):
            runtime.flush_outbox(self.root, opener=lambda *a, **k: (_ for _ in ()).throw(OSError('offline')))
        self.assertTrue(event.exists())
        write = runtime.atomic_write
        def fail_receipt(path, data, mode=0o600):
            if Path(path).parent.name == 'receipts':
                raise OSError('receipt disk failure')
            return write(path, data, mode)
        with patch.object(runtime, 'atomic_write', side_effect=fail_receipt), self.assertRaises(OSError):
            runtime.flush_outbox(self.root)
        runtime.flush_outbox(self.root)
        self.assertEqual([r['p_event_key'] for r in self.requests], [key, key])

    def test_boolean_zero_and_wrong_receipts_never_acknowledge(self):
        runtime.queue_fault(self.root, 'release_missing')
        for reply in [True, 0, '42', {'id':42}]:
            self.reply = reply
            with self.assertRaisesRegex(runtime.RuntimeFault, 'inbox_receipt_invalid'):
                runtime.flush_outbox(self.root)
        self.assertFalse((self.root / 'receipts').exists())

    def test_corrupt_local_receipt_is_visible_not_silently_accepted(self):
        event = runtime.queue_fault(self.root, 'release_missing')
        runtime.flush_outbox(self.root)
        (self.root / 'receipts' / event.name).write_text('{"id":true}')
        with self.assertRaisesRegex(runtime.RuntimeFault, 'receipt_invalid'):
            runtime.flush_outbox(self.root)

    def test_wrong_project_or_public_auth_permissions_refused(self):
        auth = self.root / 'auth.json'
        os.chmod(auth, 0o644)
        with self.assertRaisesRegex(runtime.RuntimeFault, 'credentials_permissions'):
            runtime.credentials(self.root)
        runtime.atomic_write(auth, runtime.json_bytes({'url':'https://wrong.invalid','key':'x'*40}))
        with self.assertRaisesRegex(runtime.RuntimeFault, 'credentials_wrong_project'):
            runtime.credentials(self.root)

    def test_symlinked_executable_and_invalid_manifest_refused(self):
        self.install()
        path = self.root / 'current' / runtime.FILES[0]
        content = path.read_bytes()
        path.unlink()
        external = self.base / 'external.py'
        external.write_bytes(content)
        path.symlink_to(external)
        with self.assertRaisesRegex(runtime.RuntimeFault, 'release_file_missing'):
            runtime.inspect_release(self.root)

    def test_existing_lock_prevents_a_second_daemon(self):
        self.install()
        with (self.root / 'run.lock').open('a') as lock:
            runtime.fcntl.flock(lock, runtime.fcntl.LOCK_EX)
            with patch.object(runtime.subprocess, 'Popen') as child:
                self.assertEqual(runtime.run(self.root), 0)
                child.assert_not_called()
        self.assertFalse(self.requests)

    def test_stop_kills_only_owned_unresponsive_process_group(self):
        child_file = self.base / 'child.py'
        pid_file = self.base / 'child.pid'
        child_file.write_text('import os,signal,time,pathlib\n'
                             'signal.signal(signal.SIGTERM,signal.SIG_IGN)\n'
                             'pathlib.Path(' + repr(str(pid_file)) + ').write_text(str(os.getpid()))\n'
                             'time.sleep(30)\n')
        harness = self.base / 'supervise.py'
        harness.write_text('import importlib.util,sys,os\n'
                          's=importlib.util.spec_from_file_location("r",' + repr(runtime.__file__) + ')\n'
                          'r=importlib.util.module_from_spec(s);s.loader.exec_module(r)\n'
                          'print(r.supervise([sys.executable,' + repr(str(child_file)) + '],None,dict(os.environ),0.2),flush=True)\n')
        neighbor = subprocess.Popen([sys.executable, '-c', 'import time;time.sleep(30)'])
        parent = subprocess.Popen([sys.executable, str(harness)], stdout=subprocess.PIPE, text=True)
        try:
            deadline = time.monotonic() + 5
            while not pid_file.exists() and time.monotonic() < deadline:
                time.sleep(0.02)
            self.assertTrue(pid_file.exists())
            child_pid = int(pid_file.read_text())
            parent.terminate()
            output, _ = parent.communicate(timeout=5)
            self.assertEqual(parent.returncode, 0)
            self.assertIn('True', output)
            self.assertIsNone(neighbor.poll())
            with self.assertRaises(ProcessLookupError):
                os.kill(child_pid, 0)
        finally:
            if parent.poll() is None:
                parent.kill()
                parent.wait()
            neighbor.terminate()
            neighbor.wait()


if __name__ == '__main__':
    unittest.main()
