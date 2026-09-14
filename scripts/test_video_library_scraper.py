"""Exercise shipped scraper functions with isolated dependencies and real loopback HTTP."""
import ast
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import logging
import os
from pathlib import Path
import subprocess
import tempfile
import threading
import types
import unittest
from unittest.mock import Mock, patch
import urllib.request
import urllib.error
import uuid

SOURCE = Path(__file__).with_name('video_library_scraper.py')

class Query:
    def __init__(self, db, table):
        self.db, self.table, self.op, self.row, self.filters = db, table, 'select', None, {}
    def select(self, *_): return self
    def range(self, *_): return self
    def limit(self, *_): return self
    def or_(self, *_): return self
    def eq(self, key, value): self.filters[key] = value; return self
    def insert(self, row): self.op, self.row = 'insert', row; return self
    def update(self, row): self.op, self.row = 'update', row; return self
    def execute(self): return types.SimpleNamespace(data=self.db.execute(self))

class Database:
    def __init__(self):
        self.rows, self.inserts, self.updates = [], [], []
        self.insert_error = self.update_error = None
    def table(self, table): return Query(self, table)
    def execute(self, query):
        if query.op == 'insert':
            if self.insert_error: raise self.insert_error
            self.inserts.append(query.row); return [query.row]
        if query.op == 'update':
            if self.update_error: raise self.update_error
            self.updates.append(query.row); return [query.row]
        return self.rows

class ScraperContracts(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.db = Database()
        tree = ast.parse(SOURCE.read_text())
        functions = [n for n in tree.body if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef))]
        self.ns = dict(os=os, json=json, datetime=datetime, timezone=timezone,
            Path=Path, uuid=uuid, urllib=urllib, subprocess=subprocess,
            log=logging.getLogger('test'), time=types.SimpleNamespace(sleep=lambda _: None),
            threading=types.SimpleNamespace(Thread=Mock()), supabase=self.db,
            EVIDENCE_DIR=Path(self.tmp.name), CRON_SECRET='fallback-test-secret',
            CREATORS=[{'source_id': 'HCL', 'name': 'Test source', 'handle': 'test'}])
        exec(compile(ast.Module(body=functions, type_ignores=[]), str(SOURCE), 'exec'), self.ns)
        self.video = {'youtube_video_id': 'abcdefghijk', 'title': 'Test', 'source_id': 'HCL', 'type': 'live'}
        self.ns['fetch_channel_videos'] = Mock(return_value=[self.video])
        self.ns['backfill_metadata'] = Mock(return_value={'updated': 0, 'failed': 0, 'errors': []})
        self.ns['report_to_api'] = Mock(return_value={'accepted': True})

    def run_scrape(self, **kwargs): return self.ns['run_scraper'](**kwargs)
    def success(self, result): return self.ns['scrape_succeeded'](result)

    def test_success_has_unique_run_actual_completion_and_receipt(self):
        result = self.run_scrape()
        self.assertTrue(self.success(result)); self.assertEqual(result['total_new'], 1)
        self.assertEqual(uuid.UUID(result['run_id']).version, 4)
        self.assertLessEqual(result['ran_at'], result['completed_at'])
        self.assertEqual(self.db.inserts, [self.video])
        self.assertEqual(len(list(Path(self.tmp.name).glob('*.json'))), 1)

    def test_metadata_failure_prevents_success_even_after_creator_success(self):
        self.ns['backfill_metadata'].return_value = {'updated': 0, 'failed': 100, 'errors': ['yt-dlp blocked']}
        result = self.run_scrape()
        self.assertEqual(result['processed'], 1); self.assertEqual(result['metadata_failed'], 100)
        self.assertFalse(self.success(result))
        self.assertEqual(self.ns['report_to_api'].call_args.args[0]['metadata_failed'], 100)

    def test_metadata_exception_is_preserved_in_report(self):
        self.ns['backfill_metadata'].side_effect = RuntimeError('database unavailable')
        result = self.run_scrape()
        self.assertFalse(self.success(result)); self.assertIn('database unavailable', result['errors'][0])

    def test_insert_failure_is_not_a_successful_creator(self):
        self.db.insert_error = RuntimeError('permission denied')
        result = self.run_scrape()
        self.assertEqual((result['insert_failed'], result['failed'], result['total_new']), (1, 1, 0))
        self.assertFalse(self.success(result))

    def test_word_unique_in_unrelated_error_does_not_hide_failure(self):
        self.db.insert_error = RuntimeError('unique service unreachable')
        self.assertFalse(self.success(self.run_scrape()))

    def test_duplicate_constraint_without_exact_video_is_still_failure(self):
        error = RuntimeError('other primary key conflict'); error.code = '23505'
        self.db.insert_error = error
        self.assertFalse(self.success(self.run_scrape()))

    def test_exact_existing_video_is_noop(self):
        self.db.rows = [self.video]
        result = self.run_scrape()
        self.assertTrue(self.success(result)); self.assertEqual(result['total_new'], 0)
        self.assertEqual(self.db.inserts, [])

    def test_empty_creator_is_failure(self):
        self.ns['fetch_channel_videos'].return_value = []
        self.assertFalse(self.success(self.run_scrape()))

    def test_missing_report_ack_is_failed_and_saved_locally(self):
        self.ns['report_to_api'].side_effect = RuntimeError('commit unconfirmed')
        result = self.run_scrape()
        self.assertFalse(self.success(result))
        evidence = json.loads(next(Path(self.tmp.name).glob('*.json')).read_text())
        self.assertIn('commit unconfirmed', evidence['summary']['errors'][0])

    def test_dry_run_makes_no_database_or_report_writes(self):
        self.assertTrue(self.success(self.run_scrape(dry_run=True)))
        self.assertEqual(self.db.inserts, [])
        self.ns['backfill_metadata'].assert_not_called(); self.ns['report_to_api'].assert_not_called()

    def test_unknown_source_fails_instead_of_empty_success(self):
        with self.assertRaises(ValueError): self.run_scrape(filter_source='missing')

    def test_single_source_is_explicit_and_cannot_impersonate_daily_job(self):
        result = self.run_scrape(filter_source='HCL')
        self.assertEqual((result['scope'], result['source_id']), ('source', 'HCL'))
        self.ns['backfill_metadata'].assert_not_called()

    def test_cli_uses_observed_outcome_as_exit_status(self):
        source = SOURCE.read_text()
        tree = ast.parse(source)
        main = next(n for n in tree.body if isinstance(n, ast.If) and ast.unparse(n.test) == "__name__ == '__main__'")
        # Execute the actual daily CLI branch with argparse and dependency IO replaced.
        ns = dict(self.ns, argparse=__import__('argparse'), sys=__import__('sys'), __name__='__main__')
        for failed, expected in [(0, 0), (1, 1)]:
            ns['run_scraper'] = lambda **_: {'failed': failed}
            with patch.object(ns['sys'], 'argv', ['video_library_scraper.py']):
                with self.assertRaises(SystemExit) as raised:
                    exec(compile(ast.Module(body=[main], type_ignores=[]), str(SOURCE), 'exec'), ns)
            self.assertEqual(raised.exception.code, expected)

    def test_metadata_process_stderr_and_missing_rows_preserved(self):
        tree = ast.parse(SOURCE.read_text())
        function = next(n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name == 'backfill_metadata')
        exec(compile(ast.Module(body=[function], type_ignores=[]), str(SOURCE), 'exec'), self.ns)
        self.db.rows = [{'id': 'row', 'youtube_video_id': 'abcdefghijk', 'views_count': 0}]
        with patch.object(subprocess, 'run', return_value=types.SimpleNamespace(returncode=1, stdout='', stderr='upstream blocked')):
            result = self.ns['backfill_metadata'](1)
        self.assertEqual(result['failed'], 1); self.assertIn('upstream blocked', result['errors'][0])

    def test_metadata_write_failure_counts_only_that_row(self):
        tree = ast.parse(SOURCE.read_text())
        function = next(n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name == 'backfill_metadata')
        exec(compile(ast.Module(body=[function], type_ignores=[]), str(SOURCE), 'exec'), self.ns)
        self.db.rows = [{'id': 'row', 'youtube_video_id': 'abcdefghijk', 'views_count': 0}]
        self.db.update_error = RuntimeError('write refused')
        with patch.object(subprocess, 'run', return_value=types.SimpleNamespace(returncode=0,
            stdout=json.dumps({'id': 'abcdefghijk', 'view_count': 100}), stderr='')):
            result = self.ns['backfill_metadata'](1)
        self.assertEqual(result['failed'], 1); self.assertIn('write refused', result['errors'][0])

class RealReportHTTP(unittest.TestCase):
    def setUp(self):
        tree = ast.parse(SOURCE.read_text())
        self.ns = dict(os=os, json=json, urllib=urllib, CRON_SECRET='fallback')
        definitions = [n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name in ('report_to_api', 'scrape_succeeded')]
        exec(compile(ast.Module(body=definitions, type_ignores=[]), str(SOURCE), 'exec'), self.ns)
        self.received = []
        owner = self
        class Handler(BaseHTTPRequestHandler):
            def log_message(self, *_): pass
            def do_POST(self):
                body = json.loads(self.rfile.read(int(self.headers['Content-Length'])))
                owner.received.append((self.path, dict(self.headers), body))
                success = self.server.mode != 'failed'
                payload = {'accepted': True, 'success': success, 'run_id': body['run_id'], 'audit_id': body['run_id']}
                if self.server.mode == 'wrong_id': payload['audit_id'] = str(uuid.uuid4())
                if self.server.mode == 'unconfirmed': payload['accepted'] = False
                raw = json.dumps(payload).encode() if self.server.mode != 'html' else b'<html>404</html>'
                self.send_response(503 if self.server.mode in ('failed', 'unconfirmed') else 200)
                self.send_header('Content-Type', 'application/json'); self.send_header('Content-Length', str(len(raw)))
                self.end_headers(); self.wfile.write(raw)
        self.server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
        self.server.mode = 'success'
        self.thread = threading.Thread(target=self.server.serve_forever, kwargs={'poll_interval': 0.01})
        self.thread.start()
        self.addCleanup(self.close)
        self.env = patch.dict(os.environ, {'WORKERS_BASE_URL': f'http://127.0.0.1:{self.server.server_port}',
            'WORKERS_CRON_SECRET': 'private-test-secret', 'DISPATCHER_PRIVATE_IP': '10.0.0.4'})
        self.env.start(); self.addCleanup(self.env.stop)
    def close(self):
        self.server.shutdown(); self.server.server_close(); self.thread.join(timeout=2)
        self.assertFalse(self.thread.is_alive())
    def call(self, **changes):
        return self.ns['report_to_api']({'run_id': str(uuid.uuid4()), 'failed': 0, **changes})
    def test_real_worker_hop_and_specific_credential(self):
        self.assertTrue(self.call()['accepted'])
        path, headers, _ = self.received[0]
        self.assertEqual(path, '/cron/video-library-scraper?report=1')
        self.assertEqual(headers['Authorization'], 'Bearer private-test-secret')
        self.assertEqual(headers['X-Forwarded-For'], '10.0.0.4')
    def test_committed_failed_http_503_is_receipt_not_success(self):
        self.server.mode = 'failed'
        self.assertFalse(self.call(metadata_failed=100)['success'])
    def test_missing_ack_wrong_identity_and_html_never_succeed(self):
        for mode in ['unconfirmed', 'wrong_id', 'html']:
            self.server.mode = mode
            with self.subTest(mode=mode), self.assertRaises(RuntimeError): self.call()
    def test_missing_route_configuration_fails_without_network(self):
        with patch.dict(os.environ, {'WORKERS_BASE_URL': ''}):
            with self.assertRaises(RuntimeError): self.call()
        self.assertEqual(self.received, [])

if __name__ == '__main__': unittest.main()
