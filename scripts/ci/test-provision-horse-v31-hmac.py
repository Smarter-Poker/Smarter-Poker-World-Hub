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

    def test_rerun_and_invalid_principal_refuse_before_access(self):
        with self.assertRaisesRegex(module.ProvisionError, 'reruns'):
            module.load_config({'V31_PRINCIPAL': 'M1', 'GITHUB_RUN_ATTEMPT': '2'})
        with self.assertRaisesRegex(module.ProvisionError, 'principal'):
            module.load_config({'V31_PRINCIPAL': 'M3'})

    def run_provision(self, folder, fail=False):
        class Api:
            writes = 0
            def list_entries(self):
                data = entries()
                if self.writes:
                    data[1]['updatedAt'] = 2
                return data
            def patch_value(self, entry_id, secret):
                self.writes += 1
                if fail:
                    raise module.ProvisionError('transport outcome unknown')
                self.assert_id = entry_id
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


if __name__ == '__main__':
    unittest.main()
