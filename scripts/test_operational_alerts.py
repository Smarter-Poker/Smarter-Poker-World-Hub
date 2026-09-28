"""Every Python operational alert writer addresses its rows to the fleet.

Real modules and a real loopback HTTP recorder. Nothing here can reach
production: the transport is wrapped so any URL other than this test's
loopback server fails the test before a connection is made.
"""
import contextlib
import hashlib
import http.server
import importlib.util
import io
import json
from pathlib import Path
import subprocess
import sys
import threading
import unittest
from unittest.mock import patch
import urllib.request

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
# The owner's routing rule, stated independently of the code under test.
FLEET = '01a09b86-5ba8-7290-8657-1041f13dd3ca'


def load(name, filename):
    spec = importlib.util.spec_from_file_location(name, HERE / filename)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


alerts = load('operational_alerts', 'operational_alerts.py')
# The scrapers run `from operational_alerts import record_alert`; registering
# the module under that name binds them to this exact file.
sys.modules['operational_alerts'] = alerts
runtime = load('local_scraper_runtime', 'local_scraper_runtime.py')


def outcome(address, payload):
    try:
        return 'addressed', address(payload)
    except Exception:
        return 'refused', None


def reaches_the_store(text):
    """True when Python source names a way to write public.operational_alert_events
    itself: the recorder RPC (fn_record_operational_alert/fn_record_operational_alerts)
    or the table, whether through its REST endpoint, a supabase-py
    .table('operational_alert_events') call or a URL built from the table name.
    Naming the table at all is enough: a file that only reads the store is rare
    enough to justify adding it to the expected list below after review."""
    return 'fn_record_operational_alert' in text or 'operational_alert_events' in text


class LoopbackRecorder(unittest.TestCase):
    def setUp(self):
        self.requests = []
        owner = self

        class Handler(http.server.BaseHTTPRequestHandler):
            def log_message(self, *args):
                pass

            def do_POST(self):
                body = json.loads(self.rfile.read(int(self.headers['Content-Length'])))
                owner.requests.append({'path': self.path, 'body': body})
                self.send_response(200)
                self.end_headers()
                self.wfile.write(b'41')

        self.server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), Handler)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.url = 'http://127.0.0.1:' + str(self.server.server_port)
        real = urllib.request.urlopen

        def loopback_only(request, *args, **kwargs):
            target = request.full_url if isinstance(request, urllib.request.Request) else str(request)
            if not target.startswith(self.url + '/'):
                raise AssertionError('a test tried to leave the loopback recorder')
            return real(request, *args, **kwargs)

        self.guard = patch.object(urllib.request, 'urlopen', loopback_only)
        self.guard.start()

    def tearDown(self):
        self.guard.stop()
        self.server.shutdown()
        self.server.server_close()
        self.thread.join()


class SharedWriter(LoopbackRecorder):
    # Fails on the pre-fix writer: the payload was only {message, batch_id}.
    def test_record_alert_names_the_fleet_and_keeps_its_evidence(self):
        receipt = alerts.record_alert('charity-scraper', 'zero venues yielded data', 'batch-1', self.url, 'test-key')
        self.assertEqual(receipt, 41)
        [sent] = self.requests
        self.assertEqual(sent['path'], '/rest/v1/rpc/fn_record_operational_alert')
        self.assertEqual(sent['body']['p_payload'],
                         {'message': 'zero venues yielded data', 'batch_id': 'batch-1', 'target_task_id': FLEET})
        self.assertEqual({k: sent['body'][k] for k in ('p_source', 'p_alertname', 'p_status', 'p_severity')},
                         {'p_source': 'charity-scraper', 'p_alertname': 'ScraperFailure',
                          'p_status': 'firing', 'p_severity': 'critical'})

    # Guard, green before and after: routing never changes a failure's identity.
    def test_the_destination_never_enters_the_event_key(self):
        alerts.record_alert('tour-scraper', 'only 2 tours completed', 'batch-2', self.url, 'test-key')
        evidence = {'message': 'only 2 tours completed', 'batch_id': 'batch-2'}
        self.assertEqual(self.requests[0]['body']['p_event_key'],
                         hashlib.sha256(json.dumps(evidence, sort_keys=True).encode()).hexdigest())

    # Fails on the pre-fix writer, which had no destination rule at all.
    def test_no_destination_is_filled_the_fleet_is_kept_and_anything_else_is_refused(self):
        for requested in (None, '', '  ', FLEET):
            self.assertEqual(alerts.addressed({'x': 1, 'target_task_id': requested}), {'x': 1, 'target_task_id': FLEET})
        caller = {'x': 1}
        self.assertEqual(alerts.addressed(caller), {'x': 1, 'target_task_id': FLEET})
        self.assertEqual(caller, {'x': 1}, 'the caller payload is not mutated')
        self.assertRaises(TypeError, alerts.addressed, ['x'])
        for foreign in ('other-task', FLEET.upper(), ' ' + FLEET, 42, {}, False):
            with self.assertRaises(alerts.ForeignDestination):
                alerts.deliver(self.url, 'test-key', {
                    'p_source': 'charity-scraper', 'p_event_key': 'k', 'p_alertname': 'ScraperFailure',
                    'p_status': 'firing', 'p_severity': 'critical',
                    'p_payload': {'x': 1, 'target_task_id': foreign}})
        self.assertEqual(self.requests, [], 'a refused event is never sent')

    # Fails on the pre-fix code: both scrapers recorded unaddressed rows.
    def test_each_scraper_records_its_faults_through_the_shared_writer(self):
        for filename, source in (('scrape_charity_v5.py', 'charity-scraper'),
                                 ('scrape_tours_fast.py', 'tour-scraper')):
            with contextlib.redirect_stdout(io.StringIO()):
                scraper = load(filename[:-3], filename)
                with patch.object(scraper, 'SUPABASE_URL', self.url), patch.object(scraper, 'SERVICE_KEY', 'test-key'):
                    self.assertEqual(scraper.send_sms_alert('fault in ' + source), 41)
            sent = self.requests[-1]['body']
            self.assertEqual(sent['p_source'], source)
            self.assertEqual(sent['p_payload'],
                             {'message': 'fault in ' + source, 'batch_id': scraper.BATCH_ID, 'target_task_id': FLEET})
        self.assertEqual(len(self.requests), 2)

    # Guard: a Python file that posted to the recorder (or to the store's table
    # endpoint) itself would bypass the destination rule, so only the shared
    # writer and its checked mirror may reach the store.
    def test_only_the_shared_writer_and_its_checked_mirror_call_the_recorder(self):
        listed = subprocess.run(['git', '-C', str(ROOT), 'ls-files', '-z', '--', '*.py'],
                                capture_output=True, check=True).stdout.decode().split('\0')
        writers = sorted(
            path for path in listed
            if path and not Path(path).name.startswith('test_')
            and reaches_the_store((ROOT / path).read_text(errors='replace')))
        self.assertEqual(writers, ['scripts/local_scraper_runtime.py', 'scripts/operational_alerts.py'])

    def test_the_guard_sees_every_route_into_the_store(self):
        self.assertTrue(reaches_the_store("post(url + '/rest/v1/rpc/fn_record_operational_alert')"))
        self.assertTrue(reaches_the_store("post(url + '/rest/v1/rpc/fn_record_operational_alerts')"))
        self.assertTrue(reaches_the_store("post(url + '/rest/v1/operational_alert_events')"))
        self.assertTrue(reaches_the_store("client.table('operational_alert_events').insert(row).execute()"))
        self.assertTrue(reaches_the_store("TABLE = 'operational_alert_events'\npost(f'{URL}/rest/v1/{TABLE}')"))
        self.assertFalse(reaches_the_store("print('operational alerts are read elsewhere')"))


class RunnerMirror(unittest.TestCase):
    """local_scraper_runtime.py is copied alone outside its release, so it keeps
    a mirror of the shared writer's destination instead of importing it."""

    CASES = ({'x': 1}, {'x': 1, 'target_task_id': None}, {'x': 1, 'target_task_id': ''},
             {'x': 1, 'target_task_id': '  '}, {'x': 1, 'target_task_id': FLEET},
             {'x': 1, 'target_task_id': 'other-task'}, {'x': 1, 'target_task_id': FLEET.upper()},
             {'x': 1, 'target_task_id': 42}, {'x': 1, 'target_task_id': {}}, ['x'], None)

    # Fails on the pre-fix runner, which had neither the fleet id nor the rule.
    def test_the_runner_mirror_matches_the_shared_writer(self):
        self.assertEqual(alerts.FLEET_TASK_ID, FLEET)
        self.assertEqual(runtime.FLEET_TASK_ID, alerts.FLEET_TASK_ID)
        for payload in self.CASES:
            self.assertEqual(outcome(runtime.addressed, payload), outcome(alerts.addressed, payload), payload)


if __name__ == '__main__':
    unittest.main()
