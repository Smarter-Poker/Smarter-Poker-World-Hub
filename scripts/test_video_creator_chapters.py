"""Creator chapters are read from the creator's own YouTube description, never invented.

Run: python3 scripts/test_video_creator_chapters.py -v
"""
import importlib.util
import re
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent


def load(name):
    spec = importlib.util.spec_from_file_location(name, HERE / f'{name}.py')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


INGEST = load('video_source_registry_ingest')
WORKER = load('video_enrichment_worker')
parse = INGEST.parse_creator_chapters

DESCRIPTION = """Huge pot at the high stakes game tonight.

Timestamps:
0:00 Intro
1:15 - First Hand: AK vs QQ
4:02 | River Bluff Breakdown
12:30 Viewer Questions

Follow us on Twitter. 2 years ago we started."""


def starts(chapters):
    return [entry['start_seconds'] for entry in chapters]


class ParseCreatorChaptersTests(unittest.TestCase):
    def test_a_youtube_chapter_list_is_read_with_titles_as_written(self):
        chapters = parse(DESCRIPTION, 1500)
        self.assertEqual(starts(chapters), [0, 75, 242, 750])
        self.assertEqual([entry['title'] for entry in chapters],
                         ['Intro', 'First Hand: AK vs QQ', 'River Bluff Breakdown', 'Viewer Questions'])
        self.assertTrue(all(entry['source'] == 'creator_description' for entry in chapters))

    def test_hours_brackets_bullets_and_crlf(self):
        text = '00:00 start here\r\n- (10:00) the 3-bet pot\r\n• [1:02:03] FINAL TABLE\r\n'
        chapters = parse(text, 4000)
        self.assertEqual(starts(chapters), [0, 600, 3723])
        self.assertEqual([entry['title'] for entry in chapters], ['start here', 'the 3-bet pot', 'FINAL TABLE'])

    def test_blank_lines_inside_the_list_are_allowed_and_prose_ends_it(self):
        text = '0:00 Intro\n\n0:30 Hand One\n\n1:00 Hand Two\nThanks for watching\n5:00 Not A Chapter'
        self.assertEqual(starts(parse(text)), [0, 30, 60])

    def test_a_list_that_does_not_start_at_zero_is_not_chapters(self):
        comment_style = 'Best hands:\n1:23 river shove\n4:56 hero call\n9:10 cooler\n15:00 bad beat'
        self.assertEqual(parse(comment_style, 1200), [])

    def test_fewer_than_three_timestamps_is_not_chapters(self):
        self.assertEqual(parse('0:00 Intro\n2:00 The Hand', 600), [])

    def test_out_of_order_or_repeated_timestamps_reject_the_whole_list(self):
        self.assertEqual(parse('0:00 Intro\n5:00 Hand\n3:00 Back', 900), [])
        self.assertEqual(parse('0:00 Intro\n5:00 Hand\n5:00 Again\n7:00 End', 900), [])

    def test_a_chapter_shorter_than_ten_seconds_rejects_the_whole_list(self):
        self.assertEqual(parse('0:00 Intro\n0:09 Too Soon\n1:00 Hand', 600), [])
        self.assertEqual(starts(parse('0:00 Intro\n0:10 Just Enough\n1:00 Hand', 600)), [0, 10, 60])

    def test_a_chapter_past_the_end_of_the_video_rejects_the_whole_list(self):
        self.assertEqual(parse('0:00 Intro\n1:00 Hand\n9:55 Outro', 600), [])
        self.assertEqual(starts(parse('0:00 Intro\n1:00 Hand\n9:50 Outro', 600)), [0, 60, 590])

    def test_an_untitled_timestamp_rejects_the_whole_list(self):
        self.assertEqual(parse('0:00 Intro\n1:00\n2:00 Hand', 600), [])

    def test_invalid_clock_values_and_inline_times_are_not_timestamps(self):
        self.assertEqual(parse('0:00 Intro\n1:75 Bad\n2:00 Hand\n3:00 End'), [])
        self.assertEqual(parse('Starts at 0:00 sharp\n1:00 Hand\n2:00 Hand\n3:00 Hand'), [])
        self.assertEqual(parse('0:00pm meetup\n1:00pm\n2:00pm'), [])

    def test_empty_or_missing_descriptions_have_no_chapters(self):
        for value in (None, '', '   ', 42):
            self.assertEqual(parse(value), [])

    def test_titles_are_capped_and_lists_are_bounded(self):
        long_title = 'x' * 500
        chapters = parse(f'0:00 {long_title}\n1:00 A\n2:00 B')
        self.assertEqual(len(chapters[0]['title']), 160)
        too_many = '\n'.join(f'{minute}:00 Part {minute}' for minute in range(0, 102))
        self.assertEqual(parse(too_many), [])

    def test_iso_durations_and_item_chapters(self):
        self.assertEqual(INGEST.iso_duration_seconds('PT1H2M3S'), 3723)
        self.assertEqual(INGEST.iso_duration_seconds('PT45S'), 45)
        self.assertIsNone(INGEST.iso_duration_seconds('PT'))
        self.assertIsNone(INGEST.iso_duration_seconds('bad'))
        item = {'snippet': {'description': DESCRIPTION}, 'contentDetails': {'duration': 'PT25M'}}
        self.assertEqual(starts(INGEST.item_chapters(item)), [0, 75, 242, 750])
        item['contentDetails']['duration'] = 'PT10M'
        self.assertEqual(INGEST.item_chapters(item), [], 'a chapter after the end is refused')


class FakeResult:
    def __init__(self, data):
        self.data = data


class FakeTable:
    def __init__(self, db, name):
        self.db, self.name, self.filters = db, name, []

    def update(self, values):
        self.db.updates.append((self.name, values))
        return self

    def eq(self, column, value):
        self.filters.append((column, value))
        return self

    def execute(self):
        return FakeResult([{'video_id': self.filters[-1][1]}] if self.db.record_exists else [])


class FakeDb:
    def __init__(self, record_exists=True):
        self.updates, self.record_exists = [], record_exists

    def table(self, name):
        return FakeTable(self, name)


class StoreChaptersTests(unittest.TestCase):
    def test_only_marked_creator_chapters_are_written(self):
        db = FakeDb()
        ingestor = INGEST.RegistryIngestor(db, 'unused')
        self.assertTrue(ingestor.store_chapters('uuid-1', parse(DESCRIPTION)))
        self.assertEqual(db.updates[0][0], 'video_enrichment_records')
        self.assertEqual(starts(db.updates[0][1]['chapters']), [0, 75, 242, 750])
        self.assertFalse(ingestor.store_chapters('uuid-1', []))
        self.assertFalse(ingestor.store_chapters('uuid-1', [{'start_seconds': 0, 'title': 'Video Start'}]))
        self.assertEqual(len(db.updates), 1)

    def test_a_missing_enrichment_record_is_reported_not_created(self):
        self.assertFalse(INGEST.RegistryIngestor(FakeDb(record_exists=False), 'unused').store_chapters('uuid-2', parse(DESCRIPTION)))

    def test_a_dry_run_writes_nothing(self):
        db = FakeDb()
        self.assertTrue(INGEST.RegistryIngestor(db, 'unused', dry_run=True).store_chapters('uuid-3', parse(DESCRIPTION)))
        self.assertEqual(db.updates, [])


class EnrichmentWorkerNeverInventsChaptersTests(unittest.TestCase):
    def test_the_worker_reports_creator_chapters_and_never_writes_the_column(self):
        self.assertEqual(WORKER.creator_chapter_output(parse(DESCRIPTION))['status'], 'creator_chapters')
        for stored in (None, [], [{'start_seconds': 0, 'title': 'Video Start'}], 'bad'):
            self.assertEqual(WORKER.creator_chapter_output(stored),
                             {'status': 'unavailable', 'reason': 'no_creator_chapters'})
        source = (HERE / 'video_enrichment_worker.py').read_text()
        self.assertNotRegex(source, r"update\(\{'chapters'")
        self.assertNotRegex(source, r'Video Start')

    def test_no_code_path_writes_the_video_start_placeholder(self):
        root = HERE.parent
        offenders = []
        for folder in ('scripts', 'pages', 'src', 'lib', 'supabase/functions'):
            base = root / folder
            if not base.exists():
                continue
            for path in base.rglob('*'):
                if path.suffix not in ('.py', '.js', '.jsx', '.mjs', '.ts', '.tsx') or path.name.startswith('test_'):
                    continue
                if re.search(r"""title['"]?\s*:\s*['"]Video Start['"]""", path.read_text(errors='ignore')):
                    offenders.append(str(path.relative_to(root)))
        self.assertEqual(offenders, [])


if __name__ == '__main__':
    unittest.main()
