"""Synthetic regressions only. TMPDIR must name task-owned external scratch."""
import ast
import hashlib
import json
import os
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch
import numpy as np
sys.path.insert(0,str(Path(__file__).resolve().parent/'src'))
from data_access import SafeInputs
import model_registry as registry
from train_audit import combo_cards,clipped,serialized,projected,validate_whole_seat_selection,root_frequency_labels

class PipelineSafety(unittest.TestCase):
    def test_unknown_and_wrong_role_refuse_before_open_or_hash(self):
        entry={'/synthetic/TRAIN.json':dict(role='TRAIN',sha256='0'*64)}
        with patch('os.open',side_effect=AssertionError('must not open')),patch('hashlib.sha256',side_effect=AssertionError('must not hash')):
            for p,role in [('/synthetic/unknown.json','TRAIN'),('/synthetic/TRAIN.json','MODEL')]:
                with self.assertRaises(PermissionError):SafeInputs(entry).read(p,role)

    def test_excluded_role_laundering_refuses(self):
        for p in ('/synthetic/FINAL-DO-NOT-RUN/a.json','/synthetic/m1/F5TAIL-EVAL-X/a.json','/synthetic/EXAM/a.json','/synthetic/protected-holdout/a.json'):
            with self.assertRaises(ValueError):SafeInputs({p:dict(role='TRAIN',sha256='0'*64)})

    def test_admitted_read_tamper_and_symlink_refusal(self):
        with tempfile.TemporaryDirectory() as td:
            root=Path(td).resolve();p=root/'TRAIN.json';data=b'{"role":"TRAIN"}';p.write_bytes(data)
            g=SafeInputs({str(p):dict(role='TRAIN',sha256=hashlib.sha256(data).hexdigest())});self.assertEqual(g.read(p,'TRAIN'),data)
            p.write_bytes(b'changed')
            with self.assertRaises(ValueError):g.read(p,'TRAIN')
            p.unlink();q=root/'other';q.write_bytes(data);p.symlink_to(q)
            with self.assertRaises(OSError):g.read(p,'TRAIN')
            p.unlink();sub=root/'sub';sub.mkdir();(sub/'TRAIN.json').write_bytes(data);link=root/'alias';link.symlink_to(sub,target_is_directory=True)
            alias=link/'TRAIN.json';g=SafeInputs({str(alias):dict(role='TRAIN',sha256=hashlib.sha256(data).hexdigest())})
            with self.assertRaises(OSError):g.read(alias,'TRAIN')

    def test_combo_order_and_suit_bijection(self):
        import itertools
        cards=combo_cards();index={frozenset(c):i for i,c in enumerate(cards)}
        for perm in itertools.permutations('cdhs'):
            mp=dict(zip('cdhs',perm));mapped=[index[frozenset(c[0]+mp[c[1]] for c in hand)] for hand in cards]
            self.assertEqual(len(set(mapped)),1326)
            self.assertEqual(sum(not {'2c','3d','4h'}.intersection(hand) for hand in cards),1176)

    def test_clipping_threshold_and_serialization(self):
        f=np.array([[.049,.051,.9],[.05,.05,.9],[1/3,1/3,1/3]])
        np.testing.assert_allclose(clipped(f)[0],[0,.051/.951,.9/.951]);np.testing.assert_allclose(clipped(f)[1],f[1])
        expected=np.array([[.333333334,.333333333,.333333333]])
        np.testing.assert_allclose(serialized(f[2:]),expected,rtol=0,atol=1e-15)
        with self.assertRaises(ValueError):serialized([[float('nan'),1.]])

    def test_conditional_projection_is_not_minimax_certificate(self):
        # Value type .001, bluff .999; defender calls .25. A bluff then earns0,
        # so its off-path defense is strategically necessary. Conditional Qs
        # under teacher's value-only bet favor folding; greedy projection folds
        # always and allows profitable bluff deviation. No actual labels used.
        eps=.001;defender_q=np.array([[-1.,-3.]]);f=np.array([[.75,.25]])
        out=projected(defender_q,f);np.testing.assert_allclose(out,[[1.,0.]])
        bluff_ev_before=(1-.25)*1+.25*(-3)
        bluff_ev_after=out[0,0]*1+out[0,1]*(-3)
        self.assertAlmostEqual(bluff_ev_before,0);self.assertEqual(bluff_ev_after,1)
        self.assertLessEqual(eps*.5,.001)

    def test_conditional_cv_cannot_select_without_whole_seat_evidence(self):
        with self.assertRaises(ValueError):validate_whole_seat_selection(dict(role='CONDITIONAL_CV'),['A'])
        e=dict(role='TRAIN_VALIDATION',raw_teacher_oracle=False,held_out_global_ranks=True,technical_pass=True,rows=[dict(group='A',seat=s,upper_pct=2.) for s in ('IP','OOP')])
        self.assertEqual(validate_whole_seat_selection(e,['A']),2.)
        for broken in (dict(e,held_out_global_ranks=False),dict(e,raw_teacher_oracle=True),dict(e,rows=e['rows']*2)):
            with self.assertRaises(ValueError):validate_whole_seat_selection(broken,['A'])

    def test_registry_preserves_failure_and_separates_activation(self):
        r=dict(candidate_sha256='a'*64,plan_sha256='b'*64,status='REJECTED',scope='synthetic',evidence_reference='synthetic failure',live_play=False)
        with tempfile.TemporaryDirectory() as td:
            root=Path(td).resolve();registry.append(root,r);self.assertFalse(registry.activation_allowed(r))
            with self.assertRaises(ValueError):registry.append(root,dict(r,status='UNQUALIFIED'))
            row=registry.read_records(root)[0][0];self.assertEqual(row['status'],'REJECTED')
            row['live_play']=True;(root/'000000.json').write_text(json.dumps(row))
            with self.assertRaises(ValueError):registry.read_records(root)

    def test_root_frequency_labels_preserve_off_path_rows(self):
        h=dict(actions=['f','c'],matchups=[1.,0.],frequencies={'f':[.3,.75],'c':[.7,.25]})
        np.testing.assert_allclose(root_frequency_labels(h,[0,1],['c','f']),[[.7,.3],[.25,.75]])
        h['frequencies']['f'][1]=0;h['frequencies']['c'][1]=0
        with self.assertRaises(ValueError):root_frequency_labels(h,[0,1],['c','f'])

    def test_real_candidate_seal_refuses_before_historical_input_traversal(self):
        from selection_gate import require_train_selection
        with tempfile.TemporaryDirectory() as td:
            root=Path(td).resolve()
            with self.assertRaises(ValueError):require_train_selection(root)
            # Execute the maintained seal main with only its imports excluded;
            # a missing proof must refuse before the legacy broad freeze reader.
            source=Path(__file__).resolve().parent/'src/freeze_candidate.py'
            tree=ast.parse(source.read_text());main=next(n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name=='main')
            ns=dict(B=root,require_train_selection=require_train_selection,frozen=lambda: self.fail('legacy freeze opened before refusal'))
            exec(compile(ast.Module(body=[main],type_ignores=[]),str(source),'exec'),ns)
            with self.assertRaises(ValueError):ns['main']()

if __name__=='__main__':unittest.main()
