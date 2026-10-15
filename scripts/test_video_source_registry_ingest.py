import importlib.util
import unittest
import unittest.mock
from pathlib import Path

SPEC = importlib.util.spec_from_file_location(
    'video_source_registry_ingest', Path(__file__).with_name('video_source_registry_ingest.py')
)
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class RegistryIngestTests(unittest.TestCase):
    def test_duration_and_view_formatting(self):
        self.assertEqual(MODULE.duration_text('PT1H2M3S'), '1:02:03')
        self.assertEqual(MODULE.duration_text('PT45S'), '0:45')
        self.assertIsNone(MODULE.duration_text('bad'))
        self.assertEqual(MODULE.views_text(1200), '1K')

    def test_qualification_rejects_private_and_non_embeddable(self):
        source = {'id': 'source', 'name': 'Channel', 'ingest_topic': 'poker'}
        base = {
            'id': 'abc',
            'snippet': {'title': 'Hand', 'channelId': 'UC1', 'channelTitle': 'Channel',
                        'publishedAt': '2026-10-03T00:00:00Z',
                        'thumbnails': {'high': {'url': 'https://image'}}},
            'contentDetails': {'duration': 'PT45S'},
            'status': {'privacyStatus': 'private', 'embeddable': True},
        }
        row, reason = MODULE.RegistryIngestor.qualify(source, base)
        self.assertIsNone(row)
        self.assertEqual(reason, 'not_public')
        base['status'] = {'privacyStatus': 'public', 'embeddable': False}
        row, reason = MODULE.RegistryIngestor.qualify(source, base)
        self.assertIsNone(row)
        self.assertEqual(reason, 'not_embeddable')

    def test_qualification_keeps_made_for_kids_and_embed_lineage(self):
        source = {'id': 'source-uuid', 'name': 'NBA', 'ingest_topic': 'sports'}
        item = {
            'id': 'abc',
            'snippet': {'title': 'Highlight', 'channelId': 'UC1', 'channelTitle': 'NBA',
                        'publishedAt': '2026-10-03T00:00:00Z',
                        'thumbnails': {'high': {'url': 'https://image'}}},
            'contentDetails': {'duration': 'PT45S'},
            'status': {'privacyStatus': 'public', 'embeddable': True, 'madeForKids': True},
            'statistics': {'viewCount': '1250'},
        }
        row, reason = MODULE.RegistryIngestor.qualify(source, item)
        self.assertIsNone(reason)
        self.assertEqual(row['type'], 'sports')
        self.assertTrue(row['made_for_kids'])
        self.assertEqual(row['availability_source'], 'youtube_data_api_v3')
        self.assertTrue(row['embeddable'])

    def test_poker_sources_use_the_canonical_cash_library_type(self):
        source = {'id': 'source-uuid', 'name': 'Poker', 'ingest_topic': 'poker'}
        item = {
            'id': 'abcdefghijk',
            'snippet': {'title': 'Poker Hand', 'channelId': 'UC1', 'channelTitle': 'Poker',
                        'publishedAt': '2026-10-03T00:00:00Z',
                        'thumbnails': {'high': {'url': 'https://image'}}},
            'contentDetails': {'duration': 'PT45S'},
            'status': {'privacyStatus': 'public', 'embeddable': True},
        }
        row, reason = MODULE.RegistryIngestor.qualify(source, item)
        self.assertIsNone(reason)
        self.assertEqual(row['type'], 'cash')

    def test_creator_cursor_stops_before_old_items(self):
        ingestor = MODULE.RegistryIngestor(None, 'unused', dry_run=True)
        ingestor.resolve_channel = lambda source: {**source, 'provider_source_id': 'UC1', 'uploads_playlist_id': 'UU1'}
        ingestor.youtube = lambda resource, params: {'items': [
            {'contentDetails': {'videoId': 'new'}, 'snippet': {'publishedAt': '2026-10-03T00:00:00Z'}},
            {'contentDetails': {'videoId': 'old'}, 'snippet': {'publishedAt': '2026-10-01T00:00:00Z'}},
        ]}
        source = {'id': 'x', 'handle': '@x', 'max_candidates_per_run': 50,
                  'provider_cursor': {'video_id': 'old', 'published_at': '2026-10-01T00:00:00Z'}}
        ids, cursor = ingestor.creator_candidates(source)
        self.assertEqual(ids, ['new'])
        self.assertEqual(cursor['video_id'], 'new')


class FakeQuery:
    def __init__(self, log):
        self.log = log

    def update(self, values):
        self.log.append(('update', values))
        return self

    def eq(self, column, value):
        self.log.append(('eq', column, value))
        return self

    def execute(self):
        self.log.append(('execute',))
        return self


class FakeSupabase:
    def __init__(self):
        self.log = []
        self.rpcs = []

    def table(self, name):
        self.log.append(('table', name))
        return FakeQuery(self.log)

    def rpc(self, name, params):
        self.rpcs.append((name, params))
        return FakeQuery(self.log)


class PermanentSourceAbsenceTests(unittest.TestCase):
    """2026-10-03 to 2026-10-14: seven vanished channels made every daily run exit 1."""

    def source(self):
        return {'id': 'source-uuid', 'name': 'Gone', 'ingest_topic': 'sports', 'handle': '@gone',
                'ingestion_mode': 'creator_uploads', 'provider_cursor': {}, 'max_candidates_per_run': 50}

    def ingestor_raising(self, error):
        db = FakeSupabase()
        ingestor = MODULE.RegistryIngestor(db, 'unused')

        def boom(source):
            raise error
        ingestor.creator_candidates = boom
        return ingestor, db

    def test_a_channel_youtube_cannot_find_is_quarantined_and_the_run_does_not_fail(self):
        ingestor, db = self.ingestor_raising(RuntimeError('youtube_channel_not_found'))
        result = ingestor.process(self.source())
        self.assertEqual(result['status'], 'quarantined')
        self.assertEqual(db.rpcs[0][1]['p_status'], 'failed')
        self.assertEqual(db.rpcs[0][1]['p_failure_code'], 'youtube_channel_not_found')
        self.assertIn(('update', {'lifecycle_status': 'quarantined', 'updated_at': unittest.mock.ANY}), db.log)
        self.assertIn(('eq', 'lifecycle_status', 'active'), db.log)
        self.assertEqual(MODULE.run_exit_code({'results': [result]}), 0)

    def test_an_uploads_playlist_youtube_answers_404_for_is_quarantined(self):
        ingestor, db = self.ingestor_raising(RuntimeError('youtube_http_404: {"error": {"code": 404}}'))
        result = ingestor.process(self.source())
        self.assertEqual(result['status'], 'quarantined')
        self.assertEqual(MODULE.run_exit_code({'results': [result]}), 0)

    def test_a_transient_failure_still_fails_the_run_and_quarantines_nothing(self):
        for error in (RuntimeError('youtube_transport: URLError'), RuntimeError('youtube_http_503: busy'),
                      RuntimeError('youtube_http_403: quotaExceeded'), RuntimeError('Server disconnected')):
            ingestor, db = self.ingestor_raising(error)
            result = ingestor.process(self.source())
            self.assertEqual(result['status'], 'failed', error)
            self.assertNotIn(('table', 'content_sources'), db.log, error)
            self.assertEqual(MODULE.run_exit_code({'results': [result]}), 1, error)

    def test_one_vanished_source_beside_a_real_failure_still_fails_the_run(self):
        self.assertEqual(MODULE.run_exit_code({'results': [{'status': 'quarantined'}, {'status': 'failed'}]}), 1)
        self.assertEqual(MODULE.run_exit_code({'results': [{'status': 'quarantined'}, {'status': 'succeeded'}]}), 0)

    def test_a_refused_quarantine_leaves_the_run_failed(self):
        ingestor, db = self.ingestor_raising(RuntimeError('youtube_channel_not_found'))

        def refuse(source):
            raise RuntimeError('permission denied')
        ingestor.quarantine = refuse
        result = ingestor.process(self.source())
        self.assertEqual(result['status'], 'failed')
        self.assertEqual(MODULE.run_exit_code({'results': [result]}), 1)

    def test_a_dry_run_quarantines_nothing(self):
        ingestor = MODULE.RegistryIngestor(FakeSupabase(), 'unused', dry_run=True)
        ingestor.quarantine(self.source())
        self.assertEqual(ingestor.supabase.log, [])


if __name__ == '__main__':
    unittest.main()
