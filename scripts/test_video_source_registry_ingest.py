import importlib.util
import unittest
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


if __name__ == '__main__':
    unittest.main()
