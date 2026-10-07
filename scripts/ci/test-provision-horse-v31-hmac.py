import importlib.util
import json
from pathlib import Path
import sys
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('v31_provision', Path(__file__).with_name('provision-horse-v31-hmac.py'))
module = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = module
spec.loader.exec_module(module)


def entries():
    return [dict(id=principal, key=f'HORSE_SOLVER_V31_{principal}_HMAC_SECRET',
                 type='sensitive', target=['production'], gitBranch=None, updatedAt=1)
            for principal in ('M1', 'M2', 'COMPACTOR')]


class ProvisionTests(unittest.TestCase):
    def test_exact_principal_selection_and_scope(self):
        for principal in module.PRINCIPALS:
            self.assertEqual(module.select_target(entries(), principal)['id'], principal)
        for principal in ('M3', '', 'SOLVER_WORKER_M1'):
            with self.assertRaises(module.ProvisionError):
                module.select_target(entries(), principal)
        invalid = entries()
        invalid[0]['target'] = ['production', 'preview']
        with self.assertRaises(module.ProvisionError):
            module.select_target(invalid, 'M1')

    def test_unrelated_change_is_rejected(self):
        before, after = entries(), entries()
        after[0]['updatedAt'] = 2
        self.assertEqual(module.verify_after(before, after, 'M1')['id'], 'M1')
        after[1]['updatedAt'] = 2
        with self.assertRaises(module.ProvisionError):
            module.verify_after(before, after, 'M1')

    def test_absent_creation_refuses_ambiguous_or_unrelated_changes(self):
        missing = entries()[1:]
        self.assertIsNone(module.select_target(missing, 'M1', allow_missing=True))
        self.assertEqual(module.verify_after(missing, entries(), 'M1')['id'], 'M1')
        for ambiguous in [entries() + [entries()[0]],
                          [dict(entries()[0], target=[])] + missing,
                          [dict(entries()[0], gitBranch='untrusted')] + missing]:
            with self.assertRaises(module.ProvisionError):
                module.select_target(ambiguous, 'M1', allow_missing=True)
        changed = entries()
        changed[1]['updatedAt'] = 2
        with self.assertRaises(module.ProvisionError):
            module.verify_after(missing, changed, 'M1')

    def test_preview_coexists_with_exact_production_and_remains_untouched(self):
        preview = dict(entries()[0], id='M1-preview', target=['preview'])
        before = entries() + [preview]
        after = entries() + [dict(preview)]
        after[0]['updatedAt'] = 2
        self.assertEqual(module.select_target(before, 'M1')['id'], 'M1')
        self.assertEqual(module.verify_after(before, after, 'M1')['id'], 'M1')
        after[-1]['updatedAt'] = 2
        with self.assertRaises(module.ProvisionError):
            module.verify_after(before, after, 'M1')
        for extra in [dict(preview, id='overlap', target=['production', 'preview']),
                      dict(preview, id='duplicate-production', target=['production'])]:
            with self.assertRaises(module.ProvisionError):
                module.select_target(before + [extra], 'M1')

    def test_preview_only_allows_production_creation_without_preview_rotation(self):
        preview = dict(entries()[0], id='M1-preview', target=['preview'])
        before = entries()[1:] + [preview]
        self.assertIsNone(module.select_target(before, 'M1', allow_missing=True))
        self.assertEqual(module.verify_after(before, entries() + [preview], 'M1')['id'], 'M1')

    def test_create_request_is_exact_sensitive_production_and_scrubbed(self):
        observed = {}
        class Response:
            def __enter__(self): return self
            def __exit__(self, *args): pass
            def read(self, size): return b''
        def opener(request, timeout):
            observed['request'] = request
            observed['body'] = json.loads(bytes(request.data))
            return Response()
        api = module.VercelApi('fake-test-token', module.PROJECT_ID, module.TEAM_ID, opener)
        api.create_value('M2', bytearray(b'01' * 32))
        self.assertEqual(observed['request'].get_method(), 'POST')
        self.assertEqual(observed['body'], {'key': 'HORSE_SOLVER_V31_M2_HMAC_SECRET',
            'type': 'sensitive', 'target': ['production'], 'value': '01' * 32})
        self.assertNotIn('upsert', observed['request'].full_url)
        self.assertEqual(set(observed['request'].data), {0})

    def test_rerun_and_invalid_principal_refuse_before_access(self):
        with self.assertRaisesRegex(module.ProvisionError, 'reruns'):
            module.load_config({'V31_PRINCIPAL': 'M1', 'GITHUB_RUN_ATTEMPT': '2'})
        with self.assertRaisesRegex(module.ProvisionError, 'principal'):
            module.load_config({'V31_PRINCIPAL': 'M3'})

    def run_provision(self, folder, fail=False, missing=False):
        class Api:
            writes = 0
            def list_entries(self):
                data = entries()
                if missing and not self.writes:
                    return [item for item in data if item['id'] != 'M2']
                if self.writes:
                    data[1]['updatedAt'] = 2
                return data
            def patch_value(self, entry_id, secret):
                self.writes += 1
                if fail:
                    raise module.ProvisionError('transport outcome unknown')
                self.assert_id = entry_id
            def create_value(self, principal, secret):
                self.assert_principal = principal
                self.patch_value(principal, secret)
        config = module.Config('M2', 'a' * 40, 'a' * 40, 'refs/heads/main', '123', '1',
            'v31-bounded-request', 'fake-test-token', module.PROJECT_ID, module.TEAM_ID,
            b'public-key', 'b' * 64, Path(folder) / 'artifact', None)
        api = Api()
        try:
            result = module.provision(config, api, random_bytes=lambda n: bytes([1]) * n,
                                      encryptor=lambda public, secret: b'x' * 512)
        except module.ProvisionError:
            if not fail:
                raise
            result = json.loads((config.artifact_dir / module.RECEIPT_FILENAME).read_text())
        self.assertEqual(api.writes, 1)
        self.assertEqual(result['principal'], 'M2')
        self.assertNotIn('fake-test-token', json.dumps(result))
        self.assertNotIn('01' * 32, json.dumps(result))
        self.assertEqual(sorted(p.name for p in config.artifact_dir.iterdir()),
                         sorted([module.CIPHERTEXT_FILENAME, module.RECEIPT_FILENAME]))
        return result

    def test_complete_receipt_and_unknown_receipt(self):
        with tempfile.TemporaryDirectory() as folder:
            self.assertEqual(self.run_provision(folder)['status'], 'complete')
        with tempfile.TemporaryDirectory() as folder:
            self.assertEqual(self.run_provision(folder, fail=True)['status'], 'mutation_unverified')

    def test_creation_receipts_preserve_known_and_unknown_outcomes(self):
        with tempfile.TemporaryDirectory() as folder:
            receipt = self.run_provision(folder, missing=True)
            self.assertEqual(receipt['status'], 'complete')
            self.assertEqual(receipt['mutationKind'], 'create')
            self.assertEqual(receipt['environmentVariableId'], 'M2')
            self.assertIsNone(receipt['updatedAtBefore'])
        with tempfile.TemporaryDirectory() as folder:
            receipt = self.run_provision(folder, missing=True, fail=True)
            self.assertEqual(receipt['status'], 'mutation_unverified')
            self.assertIsNone(receipt['environmentVariableId'])


if __name__ == '__main__':
    unittest.main()
