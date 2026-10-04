import importlib.util, pathlib, unittest

ROOT=pathlib.Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('studio',ROOT/'scripts/video_native_studio_worker.py')
studio=importlib.util.module_from_spec(spec);spec.loader.exec_module(studio)

class StudioWorkerTest(unittest.TestCase):
    def test_failure_codes_never_persist_exception_text(self):
        self.assertEqual(studio.safe_code(RuntimeError('token=super-secret')),'studio_runtimeerror')
        self.assertEqual(studio.safe_code(ValueError('master_hash_mismatch')),'master_hash_mismatch')
    def test_srt_clock_handles_multi_minute_clips(self):
        self.assertEqual(studio.srt_time(125.25),'00:02:05,250')
    def test_action_focus_is_bounded(self):
        graph=studio.filter_graph({'crop_mode':'vertical_focus','focus_x':500,'branding':False})
        self.assertIn('(iw-ow)*1.000000',graph)
        self.assertNotIn('SMARTER.POKER',graph)
    def test_fit_blur_and_branding_are_explicit(self):
        graph=studio.filter_graph({'crop_mode':'fit_blur','branding':True})
        self.assertIn('boxblur=24',graph);self.assertIn('SMARTER.POKER',graph)
    def test_subtitles_use_safe_area(self):
        graph=studio.filter_graph({'crop_mode':'center_crop','branding':False},pathlib.Path('/tmp/captions.srt'))
        self.assertIn('MarginV=180',graph)
    def test_worker_custody_has_nonce(self):
        self.assertRegex(studio.WORKER,r'^[^:]+:\d+:[0-9a-f]{32}$')
    def test_storage_reconciliation_uses_exact_paths(self):
        calls=[]
        original_authority,original_remove=studio.load_authority,studio.remove_outputs
        studio.load_authority=lambda job: None
        studio.remove_outputs=lambda paths: calls.append(paths)
        try:
            with self.assertRaisesRegex(ValueError,'rights_revoked'):
                studio.process({'id':'rendition','candidate_id':'candidate'})
            self.assertEqual(calls,[])
        finally:
            studio.load_authority,studio.remove_outputs=original_authority,original_remove

if __name__=='__main__':unittest.main()
