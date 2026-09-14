"""Run the real date-enrichment entry point with isolated HTTP/browser I/O.

The production failure was 13 parsed dates rejected by the insert provenance
trigger. These tests qualify request identity, fresh evidence and truthful ACKs;
they do not claim live browser or parser coverage.
"""
import contextlib
import hashlib
import io
import json
import os
from pathlib import Path
import runpy
import sys
import types
import unittest
from unittest import mock
from datetime import datetime, timezone
from urllib.parse import parse_qs, urlsplit

SCRIPT = Path(__file__).with_name('enrich_series_dates.py')
BODY = b'<script id="__NEXT_DATA__">{"props":{"pageProps":{"series":{"start_date":"2026-09-14","end_date":"2026-09-20"}}}}</script>'


class DateProvenanceTests(unittest.TestCase):
    def execute(self, rows=None, acknowledgement='exact', status=200, body=BODY):
        rows = rows if rows is not None else [
            {'id': 17, 'series_uid': 'pa_fall-open', 'series_name': 'Fall Open',
             'source_url': 'https://example.test/fall'}]
        requests, fetches, lifecycle = [], [], []
        class Session:
            def __init__(self, **kwargs): pass
            def start(self): lifecycle.append('start')
            def close(self): lifecycle.append('close')
            def fetch(self, url, **kwargs):
                fetches.append(url)
                return types.SimpleNamespace(status=status, body=body)
        modules = {name: types.ModuleType(name) for name in
                   ('scrapling', 'scrapling.fetchers', 'dateutil', 'dateutil.parser')}
        modules['scrapling.fetchers'].StealthySession = Session
        modules['dateutil.parser'].parse = mock.Mock(side_effect=AssertionError('Structured fixture must not need regex parser'))
        def http(request, **kwargs):
            self.assertEqual(kwargs['timeout'], 60)
            requests.append(request)
            if request.get_method() == 'GET':
                query = parse_qs(urlsplit(request.full_url).query)
                self.assertIn('id', query['select'][0].split(','))
                return io.BytesIO(json.dumps(rows).encode())
            self.assertEqual(request.get_method(), 'PATCH', 'No thin-row INSERT or upsert')
            query = parse_qs(urlsplit(request.full_url).query)
            identity = int(query['id'][0][3:]); uid = query['series_uid'][0][3:]
            self.assertEqual(query['start_date'], ['is.null'])
            self.assertEqual(query['select'], ['id,series_uid'])
            self.assertNotIn('resolution=', request.headers['Prefer'])
            patch = json.loads(request.data)
            self.assertNotIn('id', patch); self.assertNotIn('series_uid', patch)
            self.assertEqual(patch['scrape_html_hash'], hashlib.sha256(body).hexdigest())
            self.assertEqual(patch['data_quality'], 'scraped_inferred')
            stamp = datetime.fromisoformat(patch['scrape_timestamp'])
            self.assertEqual(stamp.utcoffset().total_seconds(), 0)
            self.assertLess(abs((datetime.now(timezone.utc) - stamp).total_seconds()), 5)
            returned = [{'id': identity, 'series_uid': uid}]
            if acknowledgement == 'http_error': raise OSError('fixture write refused')
            if acknowledgement == 'wrong_id': returned[0]['id'] += 1
            if acknowledgement == 'wrong_uid': returned[0]['series_uid'] = 'foreign'
            if acknowledgement == 'empty': returned = []
            if acknowledgement == 'object': returned = returned[0]
            if acknowledgement == 'duplicate': returned *= 2
            if acknowledgement == 'malformed': return io.BytesIO(b'not-json')
            return io.BytesIO(json.dumps(returned).encode())
        output = io.StringIO(); exit_code = 0
        with mock.patch.dict(sys.modules, modules), \
             mock.patch.dict(os.environ, {'SUPABASE_SERVICE_ROLE_KEY': 'offline-date-test-no-authority'}), \
             mock.patch('urllib.request.urlopen', side_effect=http), \
             mock.patch('time.sleep'), contextlib.redirect_stdout(output):
            try: runpy.run_path(str(SCRIPT), run_name='__main__')
            except SystemExit as exc: exit_code = exc.code
        return requests, fetches, lifecycle, output.getvalue(), exit_code

    def test_real_process_patches_existing_row_with_fetched_hash_and_utc_time(self):
        requests, fetches, lifecycle, output, code = self.execute()
        self.assertEqual(code, 0); self.assertEqual(len(requests), 2)
        self.assertEqual(fetches, ['https://example.test/fall'])
        self.assertEqual(lifecycle, ['start', 'close'])
        self.assertIn('1 rows confirmed written', output)

    def test_thirteen_original_failed_rows_are_individually_acknowledged(self):
        rows = [{'id': i, 'series_uid': f'pa_series-{i}', 'series_name': str(i)} for i in range(1, 14)]
        requests, fetches, lifecycle, output, code = self.execute(rows)
        self.assertEqual(code, 0); self.assertEqual(len(requests), 14)
        self.assertEqual(len(fetches), 13); self.assertIn('13 rows confirmed written', output)
        self.assertEqual(lifecycle[-1], 'close')

    def test_twenty_record_flush_and_final_buffer_both_acknowledge(self):
        rows = [{'id': i, 'series_uid': f'pa_series-{i}'} for i in range(1, 24)]
        requests, _, _, output, code = self.execute(rows)
        self.assertEqual(code, 0); self.assertEqual(len(requests), 24)
        self.assertIn('23 rows confirmed written', output)

    def test_absent_or_changed_parent_is_not_inserted_or_counted(self):
        *_, output, code = self.execute(acknowledgement='empty')
        self.assertEqual(code, 1); self.assertIn('0 rows confirmed written', output)

    def test_wrong_identity_response_is_not_success(self):
        for response in ('wrong_id', 'wrong_uid', 'object', 'duplicate', 'malformed'):
            with self.subTest(response=response):
                *_, output, code = self.execute(acknowledgement=response)
                self.assertEqual(code, 1); self.assertIn('0 rows confirmed written', output)

    def test_write_error_remains_failure_and_closes_browser(self):
        _, _, lifecycle, output, code = self.execute(acknowledgement='http_error')
        self.assertEqual(code, 1); self.assertEqual(lifecycle[-1], 'close')
        self.assertIn("'rows_lost': 1", output)

    def test_no_dates_cannot_fabricate_a_write(self):
        requests, _, _, output, code = self.execute(body=b'<h1>No dates available</h1>')
        self.assertEqual(code, 0); self.assertEqual(len(requests), 1)
        self.assertIn('0 rows confirmed written', output)

    def test_failed_fetch_cannot_reuse_old_evidence(self):
        requests, _, _, _, code = self.execute(status=503)
        self.assertEqual(code, 0); self.assertEqual(len(requests), 1)

    def test_uid_filter_cannot_expand_to_another_parent(self):
        rows = [{'id': 17, 'series_uid': 'pa_one&or=(id.gt.0)', 'source_url': 'https://example.test/fall'}]
        requests, _, _, _, code = self.execute(rows)
        self.assertEqual(code, 0)
        self.assertEqual(parse_qs(urlsplit(requests[1].full_url).query)['series_uid'], ['eq.pa_one&or=(id.gt.0)'])

    def test_empty_cohort_starts_no_browser(self):
        requests, fetches, lifecycle, _, code = self.execute([])
        self.assertEqual(code, 0); self.assertEqual(len(requests), 1)
        self.assertEqual(fetches, []); self.assertEqual(lifecycle, [])


if __name__ == '__main__':
    unittest.main()
