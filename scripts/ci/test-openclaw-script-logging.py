#!/usr/bin/env python3
"""Exercise the maintained fire_script implementation without external services."""

import ast
import os
import pathlib
import subprocess
import unittest
from types import SimpleNamespace
from unittest.mock import patch


ROOT = pathlib.Path(__file__).resolve().parents[2]
DISPATCHER = ROOT / 'scripts' / 'openclaw-cron-dispatcher.py'


class Response:
    def __init__(self, status_code):
        self.status_code = status_code
        self.ok = 200 <= status_code < 300


class RequestError(Exception):
    pass


class ScriptLoggingTests(unittest.TestCase):
    def setUp(self):
        tree = ast.parse(DISPATCHER.read_text())
        function = next(
            node for node in tree.body
            if isinstance(node, ast.FunctionDef) and node.name == 'fire_script'
        )
        self.events = []
        self.posts = []
        self.patches = []
        self.warnings = []
        self.critical = []
        self.responses = [Response(201)]
        self.patch_responses = [Response(204)]
        self.run_result = SimpleNamespace(returncode=0)
        self.run_error = None
        self.monotonic = iter([10.0, 10.25, 10.5, 10.75, 11.0])

        def post(url, **kwargs):
            self.events.append('post')
            self.posts.append((url, kwargs))
            response = self.responses.pop(0)
            if isinstance(response, Exception):
                raise response
            return response

        def patch_request(url, **kwargs):
            self.events.append('patch')
            self.patches.append((url, kwargs))
            response = self.patch_responses.pop(0)
            if isinstance(response, Exception):
                raise response
            return response

        def run(*args, **kwargs):
            self.events.append('run')
            if self.run_error:
                raise self.run_error
            return self.run_result

        namespace = {
            'sys': SimpleNamespace(executable='/usr/bin/python3'),
            'SCRIPT_JOB_SCRIPTS': {},
            'SCRAPER_PY': '/opt/openclaw/worker.py',
            'log': SimpleNamespace(
                info=lambda *_: None,
                warning=lambda message: self.warnings.append(message),
                error=lambda *_: None,
            ),
            'time': SimpleNamespace(monotonic=lambda: next(self.monotonic), sleep=lambda *_: None),
            'datetime': SimpleNamespace(now=lambda _tz: SimpleNamespace(isoformat=lambda: '2026-10-05T00:00:00+00:00')),
            'timezone': SimpleNamespace(utc=object()),
            'uuid': SimpleNamespace(uuid4=lambda: 'a41b7f27-19ae-4d96-97df-047278613261'),
            'os': os,
            'requests': SimpleNamespace(
                post=post,
                patch=patch_request,
                RequestException=RequestError,
            ),
            'subprocess': SimpleNamespace(
                run=run,
                TimeoutExpired=subprocess.TimeoutExpired,
            ),
            'job_timeout': lambda _path: 30,
            '_critical_record': lambda *args: self.critical.append(args),
        }
        module = ast.Module(body=[function], type_ignores=[])
        exec(compile(module, str(DISPATCHER), 'exec'), namespace)
        self.fire_script = namespace['fire_script']

    def fire_with_test_credentials(self):
        return patch.dict(os.environ, {
            'NEXT_PUBLIC_SUPABASE_URL': 'https://supabase.example',
            'SUPABASE_SERVICE_ROLE_KEY': 'test-only-service-role-key',
        })

    def test_success_records_start_before_work_and_updates_the_same_row(self):
        with self.fire_with_test_credentials():
            self.fire_script('/api/cron/video-library-scraper', [])

        self.assertEqual(self.events, ['post', 'run', 'patch'])
        start_url, start = self.posts[0]
        finish_url, finish = self.patches[0]
        self.assertEqual(start_url, finish_url)
        self.assertEqual(start['params'], {'on_conflict': 'id'})
        self.assertFalse(start['allow_redirects'])
        self.assertEqual(start['json']['job_name'], '/cron/video-library-scraper')
        self.assertEqual(start['json']['status'], 'running')
        self.assertNotIn('started_at', start['json'])
        self.assertEqual(start['json']['id'], finish['params']['id'].removeprefix('eq.'))
        self.assertEqual(finish['json']['status'], 'success')
        self.assertEqual(finish['json']['result'], {'exit_code': 0})
        self.assertGreaterEqual(finish['json']['duration_ms'], 0)

    def test_nonzero_exit_records_a_sanitized_failure(self):
        self.run_result = SimpleNamespace(returncode=7)
        with self.fire_with_test_credentials():
            self.fire_script('/api/cron/video-library-enrichment', ['--limit', '50'])

        record = self.patches[0][1]['json']
        self.assertEqual(record['status'], 'error')
        self.assertEqual(record['error'], 'script_exit_nonzero')
        self.assertEqual(record['result'], {'exit_code': 7})
        self.assertEqual(len(self.critical), 1)

    def test_timeout_records_failure_and_keeps_the_worker_failure_signal(self):
        self.run_error = subprocess.TimeoutExpired('worker.py', 30)
        with self.fire_with_test_credentials():
            self.fire_script('/api/cron/video-library-reels', ['--limit', '750'])

        record = self.patches[0][1]['json']
        self.assertEqual(record['status'], 'error')
        self.assertEqual(record['error'], 'script_timeout')
        self.assertEqual(record['result'], {'timeout_seconds': 30})
        self.assertEqual(len(self.critical), 1)

    def test_transient_ambiguous_start_retry_reuses_identity_and_runs_once(self):
        self.responses = [RequestError('timeout'), Response(201)]
        with self.fire_with_test_credentials():
            self.fire_script('/api/cron/video-reel-candidates', [])

        self.assertEqual(len(self.posts), 2)
        self.assertEqual(self.posts[0][1]['json']['id'], self.posts[1][1]['json']['id'])
        self.assertEqual(self.events.count('run'), 1)

    def test_missing_telemetry_configuration_does_not_block_business_work(self):
        with patch.dict(os.environ, {}, clear=True):
            self.fire_script('/api/cron/video-library-scraper', [])

        self.assertEqual(self.events, ['run'])
        self.assertTrue(any('telemetry unavailable' in warning for warning in self.warnings))

    def test_redirect_is_not_mistaken_for_a_successful_ledger_write(self):
        self.responses = [Response(302)]
        with self.fire_with_test_credentials():
            self.fire_script('/api/cron/video-library-scraper', [])

        self.assertEqual(len(self.posts), 1)
        self.assertTrue(any('refused (HTTP 302)' in warning for warning in self.warnings))
        self.assertIn('run', self.events)


if __name__ == '__main__':
    unittest.main(verbosity=2)
