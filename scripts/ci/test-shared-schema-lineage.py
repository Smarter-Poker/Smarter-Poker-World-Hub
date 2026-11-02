import copy
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('lineage', Path(__file__).with_name('check-shared-schema-lineage.py'))
lineage = importlib.util.module_from_spec(spec)
spec.loader.exec_module(lineage)


class LineageAdmissionTests(unittest.TestCase):
    def setUp(self):
        self.inventory = {'repositories': {'hub': {'files': [{'path': 'supabase/migrations/old.sql', 'sha256': 'a' * 64}]}}}
        self.report_proof = [{'path': p, 'sha256': d, 'postgresMajor': 17} for p, d in lineage.REPORT_TRANSITIONS]
        self.marketplace_proof = [{'path': p, 'sha256': d, 'postgresMajor': 17} for p, d in lineage.MARKETPLACE_TRANSITIONS]
        self.forward = {'hub': []}
        self.actual = {'supabase/migrations/old.sql': 'a' * 64, **dict(lineage.TRANSITIONS + lineage.REPORT_TRANSITIONS + lineage.MARKETPLACE_TRANSITIONS)}
        self.proof = [{'path': path, 'sha256': digest, 'postgresMajor': 17,
                       **{check: True for check in lineage.REQUIRED_CHECKS}}
                      for path, digest in lineage.TRANSITIONS]

    def admit(self):
        return lineage.extend_inventory(self.inventory, self.forward, self.actual, self.proof, self.report_proof, self.marketplace_proof)

    def test_exact_qualified_transitions_preserve_captured_inventory(self):
        original = copy.deepcopy(self.inventory)
        result = self.admit()
        self.assertEqual(self.inventory, original)
        self.assertEqual(result['repositories']['hub']['files'],
                         original['repositories']['hub']['files'] +
                         [{'path': p, 'sha256': digest} for p, digest in lineage.TRANSITIONS + lineage.REPORT_TRANSITIONS + lineage.MARKETPLACE_TRANSITIONS])

    def test_digest_requires_fresh_exact_proof(self):
        for proof in (None, [], self.report_proof[::-1], self.report_proof + self.report_proof):
            with self.assertRaises(ValueError):
                lineage.extend_inventory(self.inventory, self.forward, self.actual, self.proof, proof, self.marketplace_proof)
        for path, digest in lineage.REPORT_TRANSITIONS:
            self.actual[path] = 'd' * 64
            with self.assertRaises(ValueError):
                self.admit()
            self.actual[path] = digest

    def test_marketplace_requires_exact_fresh_native_proof(self):
        for proof in (None, [], self.marketplace_proof * 2,
                      [dict(self.marketplace_proof[0], postgresMajor=16)],
                      [dict(self.marketplace_proof[0], sha256='d' * 64)]):
            with self.assertRaises(ValueError):
                lineage.extend_inventory(self.inventory, self.forward, self.actual, self.proof, self.report_proof, proof)
        path, digest = lineage.MARKETPLACE_TRANSITIONS[0]
        self.actual[path] = 'd' * 64
        with self.assertRaises(ValueError):
            self.admit()

    def test_missing_or_modified_history_refused(self):
        for digest in (None, 'b' * 64):
            with self.subTest(digest=digest):
                if digest is None:
                    self.actual.pop('supabase/migrations/old.sql', None)
                else:
                    self.actual['supabase/migrations/old.sql'] = digest
                with self.assertRaises(ValueError):
                    self.admit()

    def test_extra_unqualified_migration_refused(self):
        self.actual['supabase/migrations/unreviewed.sql'] = 'c' * 64
        with self.assertRaises(ValueError):
            self.admit()

    def test_changed_repin_refused_even_with_a_prior_receipt(self):
        for path, digest in lineage.TRANSITIONS:
            with self.subTest(path=path):
                self.actual[path] = 'd' * 64
                with self.assertRaises(ValueError):
                    self.admit()
                self.actual[path] = digest

    def test_any_missing_transition_refused(self):
        for path, digest in lineage.TRANSITIONS:
            with self.subTest(path=path):
                del self.actual[path]
                with self.assertRaises(ValueError):
                    self.admit()
                self.actual[path] = digest

    def test_every_native_assertion_is_mandatory_and_boolean(self):
        for index in range(len(lineage.TRANSITIONS)):
            for key in lineage.REQUIRED_CHECKS:
                for value in (False, None, 1, 'true'):
                    with self.subTest(index=index, key=key, value=value):
                        proof = copy.deepcopy(self.proof)
                        proof[index][key] = value
                        with self.assertRaises(ValueError):
                            lineage.extend_inventory(self.inventory, self.forward, self.actual, proof, self.report_proof, self.marketplace_proof)

    def test_wrong_proof_identity_and_postgres_refused(self):
        for index in range(len(lineage.TRANSITIONS)):
            for key, value in [('path', 'different.sql'), ('sha256', 'f' * 64), ('postgresMajor', 16), ('postgresMajor', '17')]:
                with self.subTest(index=index, key=key):
                    proof = copy.deepcopy(self.proof)
                    proof[index][key] = value
                    with self.assertRaises(ValueError):
                        lineage.extend_inventory(self.inventory, self.forward, self.actual, proof, self.report_proof, self.marketplace_proof)

    def test_proof_requires_complete_ordered_sequence(self):
        for proof in (None, {}, [], self.proof[:1], self.proof[:-1], self.proof[1:], self.proof[::-1],
                      [self.proof[0], self.proof[0]], self.proof + self.proof):
            with self.subTest(proof=proof):
                with self.assertRaises(ValueError):
                    lineage.extend_inventory(self.inventory, self.forward, self.actual, proof, self.report_proof, self.marketplace_proof)

    def test_other_forward_entries_and_duplicate_history_refused(self):
        self.forward['hub'] = [{'path': 'other.sql'}]
        with self.assertRaises(ValueError):
            self.admit()
        self.forward['hub'] = []
        self.inventory['repositories']['hub']['files'] *= 2
        with self.assertRaises(ValueError):
            self.admit()

    def test_missing_and_duplicate_native_receipts_refused(self):
        receipt = lineage.EVIDENCE_PREFIX + json.dumps({'m1RepinTransitions': self.proof})
        self.assertEqual(lineage.native_proof(receipt), self.proof)
        for output in ('', receipt + '\n' + receipt):
            with self.assertRaises(ValueError):
                lineage.native_proof(output)

    def test_missing_new_receipt_cannot_reuse_the_old_single_transition_receipt(self):
        receipt = lineage.EVIDENCE_PREFIX + json.dumps({'m1VersionAttestationRepin': self.proof[0]})
        with self.assertRaises(KeyError):
            lineage.native_proof(receipt)

    def test_fingerprint_uses_repository_paths_and_exact_bytes(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            migration = root / 'supabase/migrations/nested/one.sql'
            migration.parent.mkdir(parents=True)
            migration.write_bytes(b'SELECT 1;\r\n')
            result = lineage.fingerprint(root)
            self.assertEqual(list(result), ['supabase/migrations/nested/one.sql'])
            migration.write_bytes(b'SELECT 1;\n')
            self.assertNotEqual(result, lineage.fingerprint(root))


if __name__ == '__main__':
    unittest.main()
