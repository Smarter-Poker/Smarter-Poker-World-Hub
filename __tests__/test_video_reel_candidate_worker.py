import importlib.util
import pathlib
import unittest

ROOT=pathlib.Path(__file__).resolve().parents[1]
SPEC=importlib.util.spec_from_file_location('candidate_worker',ROOT/'scripts/video_reel_candidate_worker.py')
worker=importlib.util.module_from_spec(SPEC); SPEC.loader.exec_module(worker)

class CandidateWorkerTest(unittest.TestCase):
    def test_duration_formats(self):
        self.assertEqual(worker.duration_seconds('PT1H2M3S'),3723)
        self.assertEqual(worker.duration_seconds('01:30'),90)
        self.assertEqual(worker.duration_seconds('1:02:03'),3723)
        self.assertEqual(worker.duration_seconds('99:99'),0)

    def test_validated_short_uses_complete_runtime(self):
        result=worker.select_segment({'duration':'PT58S'},{'format':'short','quality_score':80,'concepts':['bluff']})
        self.assertEqual(result[:3],(0,58,'validated_short'))

    def test_long_form_under_180_is_not_mislabeled_short(self):
        result=worker.select_segment({'duration':'PT120S'},{'format':'long_form','quality_score':80,'concepts':[]})
        self.assertEqual(result[2],'metadata_highlight')

    def test_oversize_short_metadata_is_bounded_long_form(self):
        start,end,kind,*_=worker.select_segment({'duration':'PT181S'},{'format':'short','quality_score':80,'concepts':[]})
        self.assertEqual(kind,'metadata_highlight')
        self.assertLessEqual(end-start,180)

    def test_long_form_prefers_meaningful_chapter(self):
        result=worker.select_segment({'duration':'PT20M'},{'format':'long_form','quality_score':82,'concepts':['bluff'],'chapters':[{'start_seconds':0,'title':'Video Start'},{'start_seconds':240,'title':'River Bluff Breakdown'}]})
        self.assertEqual(result[:3],(240,330,'chapter_highlight'))
        self.assertIn('chapter_boundary',result[4]['signals'])

    def test_long_form_fallback_is_bounded(self):
        start,end,kind,_,rationale=worker.select_segment({'duration':'20:00'},{'format':'long_form','quality_score':70,'concepts':[],'chapters':[]})
        self.assertEqual(kind,'metadata_highlight')
        self.assertLessEqual(end-start,180)
        self.assertGreaterEqual(end-start,15)
        self.assertIn('quality_score',rationale)

    def test_unknown_duration_refuses(self):
        with self.assertRaisesRegex(ValueError,'duration_unavailable'):
            worker.select_segment({'duration':'unknown'},{'format':'long_form'})

    def test_failure_codes_are_bounded_and_safe(self):
        code=worker.failure_code(RuntimeError('token=secret-without-colon'))
        self.assertEqual(code,'candidate_runtimeerror')
        self.assertNotIn('secret',code)
        self.assertLessEqual(len(code),120)

    def test_worker_custody_has_per_process_nonce(self):
        self.assertRegex(worker.WORKER,r'^[^:]+:\d+:[0-9a-f]{32}$')

    def test_registry_identity_accepts_only_uuid(self):
        self.assertIsNotNone(worker.UUID.fullmatch('123e4567-e89b-42d3-a456-426614174000'))
        self.assertIsNone(worker.UUID.fullmatch('legacy-source-name'))

if __name__=='__main__': unittest.main()
