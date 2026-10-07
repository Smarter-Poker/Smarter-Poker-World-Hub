import unittest
from pathlib import Path
import transition_m1_bounded_canary as transition

class TransitionTests(unittest.TestCase):
    def activation(self):
        sql=(Path(__file__).resolve().parents[2]/'supabase/migrations/20260930182000_activate_training_solver_m1_bounded_canary.sql').read_text()
        return sql.replace(transition.OLD_COMMIT, 'a'*40).replace(transition.OLD_MANIFEST,'b'*64)
    def test_preserves_generated_guards_and_atomicity(self):
        sql=self.activation()
        wrapped=transition.wrap_activation(sql,'a'*40,'b'*64)
        self.assertIn('-- ROLLBACK / RECOVERY:',wrapped)
        self.assertIn('-- COMMIT;',wrapped)
        remainder=sql.split('BEGIN;',1)[1].replace("SET LOCAL lock_timeout = '5s';", '').replace("SET LOCAL statement_timeout = '120s';", '')
        self.assertIn(remainder,wrapped)
        self.assertLess(wrapped.index("SET LOCAL lock_timeout"),wrapped.index('CREATE OR REPLACE FUNCTION'))
        self.assertLess(wrapped.index('TRAINING_M1_SCOPE_GUARD_PREIMAGE_MISMATCH'),wrapped.index('CREATE OR REPLACE FUNCTION'))
        self.assertIn('-- TIER:        3',wrapped)
        self.assertIn('-- IRREVERSIBLE: yes',wrapped)
        self.assertLess(wrapped.index('TRAINING_M1_OLD_PIN_HAS_RECEIPTS'),wrapped.index('INSERT INTO public.training_solver_provenance_authority'))
        self.assertIn('LOCK TABLE public.training_solver_worker_receipts IN SHARE MODE',wrapped)
        self.assertNotIn('DISABLE TRIGGER',wrapped)
    def test_rejects_unknown_or_stale_identity_and_missing_guards(self):
        for commit,manifest in [('placeholder','b'*64),(transition.OLD_COMMIT,'b'*64),('a'*40,transition.OLD_MANIFEST)]:
            with self.assertRaises(ValueError): transition.wrap_activation(self.activation(),commit,manifest)
        with self.assertRaises(ValueError):transition.wrap_activation(self.activation().replace(transition.IDS[1],'other'),'a'*40,'b'*64)
    def test_recovery_cannot_restore_old_or_unretire(self):
        sql=transition.recovery_sql('a'*40,'b'*64)
        self.assertIn("SET admission_mode = 'held'",sql)
        self.assertNotIn('retired_at = NULL',sql)
        self.assertNotIn("SET admission_mode = 'bounded_canary'",sql)
        self.assertIn("WHERE "+transition.predicate('a'*40,'b'*64),sql)
if __name__=='__main__':unittest.main()
