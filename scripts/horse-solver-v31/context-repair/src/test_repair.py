import copy,json,pathlib,sys,tempfile,unittest
import joblib,numpy as np
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parent))
from prepare import B,load,write,sha
from candidate import domain,load as model_load
from fit import weights,train
from score import memory_bytes,compare
from launch import budgets
from common import validate_train_paths
class RepairTests(unittest.TestCase):
    def test_rank_roles_and_exclusions(self):
        design=load(B/'evidence/design.json');jobs=load(B/'spec.json');seen={}
        for j in jobs:
            m=j['meta'];self.assertNotIn(m['sig'],design['excluded_old80']);self.assertEqual(seen.setdefault(m['sig'],m['role']),m['role']);self.assertEqual(m['role'],design['global_rank_roles'][m['sig']])
        self.assertEqual(len(jobs),152);self.assertEqual(len({j['meta']['game_key_sha256'] for j in jobs}),152)
    def test_real_dispatcher_rejects_domain_and_tampering(self):
        s=load(B/'spec.json')[0]['phases'][0]['scenario'];key=domain(s)
        with tempfile.TemporaryDirectory(dir=B/'tmp') as td:
            p=pathlib.Path(td);(p/s['ip_position']).mkdir();m=p/s['ip_position']/'F.cbet.joblib';joblib.dump({'domain_sha256':key},m)
            write(p/'fit.json',dict(domains={key:dict(position=s['ip_position'])},model_sha256={str(m.relative_to(p)):sha(m)}))
            self.assertEqual(model_load(s,'F.cbet',p)['domain_sha256'],key)
            for field,value in (('pot_chips',601),('ip_position','BTN'),('ip_range_checksum','0'*64),('tree_lines',[]),('unknown_contract',True)):
                changed=copy.deepcopy(s);changed[field]=value
                with self.assertRaises(ValueError):model_load(changed,'F.cbet',p)
            m.write_bytes(b'tampered')
            with self.assertRaises(ValueError):model_load(s,'F.cbet',p)
    def test_padding_uses_train_only(self):
        rr='23456789TJQKA';d=load(B/'evidence/design.json')
        for bs in load(B/'safe-padding-v2.json').values():
            self.assertGreaterEqual(len(set(bs)),57)
            for b in bs:self.assertEqual(d['global_rank_roles']['3:'+''.join(sorted(b[::2],key=rr.index))],'TRAIN')
    def test_balanced_weights(self):
        mu=np.array([1.,3.]);q=np.array([[0.,6.],[0.,0.]])
        np.testing.assert_allclose(weights(mu,q,'matchup'),[.25,.75]);np.testing.assert_allclose(weights(mu,q,'balanced_regret'),[.75/1.375,.625/1.375])
    def test_real_fit_is_invariant_to_global_weight_scale(self):
        x=np.linspace(-2,2,120).reshape(-1,1);p=1/(1+np.exp(-x[:,0]));y=np.column_stack((p,1-p));w=np.linspace(.1,2,120)
        a=train(x,y,w,['c','f'],'test');b=train(x,y,w*100,['c','f'],'test')
        for ha,hb in zip(a['heads'],b['heads']):np.testing.assert_allclose(ha.predict(x),hb.predict(x),rtol=1e-10,atol=1e-10)
    def test_memory_units_and_invalid(self):
        self.assertEqual(memory_bytes(1_000_000),1_024_000_000)
        for k in (0,-1,float('nan'),None,True):
            with self.assertRaises(ValueError):memory_bytes(k)
    def test_relative_gain_and_absolute_separate(self):
        rows=[dict(family=f,baseline=10.,candidate=8.) for f in ('PAIR','MONO','UNP2T','UNPR')]
        self.assertTrue(compare(rows)['improved']);self.assertFalse(compare(rows)['absolute_pass'])
        rows[0]['candidate']=10.6;self.assertFalse(compare(rows)['improved'])
    def test_global_budget_includes_prior_context_and_repair(self):
        es=[]
        for i,prefix in enumerate(('F5D3-','F5CTX-','F5REPAIR-')):
            es.extend([dict(event='launch',out=prefix+'X',at='2026-11-17T00:00:00Z',solver_runs_max=1),dict(event='exit',out=prefix+'X',at='2026-11-17T01:00:00Z',rc=0)])
        b=budgets(es);self.assertEqual(b['d3_hours'],3);self.assertEqual(b['hours'],3);self.assertEqual(b['repair_hours'],1);self.assertEqual(b['repair_runs'],1)
    def test_feature_builder_rejects_eval_before_labels(self):
        import subprocess
        with tempfile.TemporaryDirectory(dir=B/'tmp') as td:
            out=pathlib.Path(td)/'out';r=subprocess.run([sys.executable,'-I','-B',str(B/'src/features.py'),'--jobs',str(B/'spec.json'),'--harvest',str(B/'tmp/nonexistent'),'--out',str(out)],capture_output=True,text=True,timeout=45)
            self.assertNotEqual(r.returncode,0);self.assertIn('ONLY new frozen TRAIN jobs admitted',r.stderr);self.assertEqual(list(out.iterdir()),[])
    def test_canonical_training_paths_refuse_same_id_alternate_harvest(self):
        report=load(B/'evidence/build-TRAIN.json');jobs=list(report['files']);dirs=[B/'m1'/('F5REPAIR-TRAIN-'+pathlib.Path(p).stem.rsplit('-',1)[1]) for p in jobs]
        validate_train_paths(jobs,dirs)
        changed=list(dirs);changed[0]=B/'tmp/same-ids-unvalidated'
        with self.assertRaisesRegex(AssertionError,'validated TRAIN harvest'):validate_train_paths(jobs,changed)
        with self.assertRaisesRegex(AssertionError,'canonical TRAIN job'):validate_train_paths([jobs[0]]*len(jobs),dirs)
    def test_train_technical_gate_with_real_A2_loader(self):
        import shutil
        import score
        from unittest.mock import patch
        with tempfile.TemporaryDirectory(dir=B/'tmp') as td:
            root=pathlib.Path(td);(root/'evidence').mkdir();(root/'driver').mkdir();od=root/'m1/F5REPAIR-TRAIN-N00';od.mkdir(parents=True)
            for p in (B/'driver').glob('*.py'):shutil.copyfile(p,root/'driver'/p.name)
            jp=root/'jobs-TRAIN-N00.json';j=dict(id='SYNTHETIC_TRAIN_TEST',meta=dict(family='PAIR'),phases=[dict(name='harvest',scenario=dict(pot_chips=600),arms=[])])
            write(jp,[j]);write(root/'evidence/build-TRAIN.json',dict(files={str(jp):dict(sha256=sha(jp))}))
            eq=dict(oop_mes_chips=300.,ip_mes_chips=300.,exploitability_chips=.6)
            original=dict(id=j['id'],status='ok',solver_runs=1,storage_rule='flop4-A2',storage_rule_rev=2,wash=False,storage_incidents=[],ws_kb_end=500000,
                provenance=dict(driver_sha256=sha(root/'driver/f4_lock_driver.py'),jobs_sha256=sha(jp),**{key:sha(root/'driver'/name) for name,key in (('f4_storage.py','storage_sha256'),('f1_readback.py','readback_sha256'),('f4_m1.py','m1helper_sha256'),('context_deadline.py','deadline_sha256'))}),
                phases=[dict(name='harvest',eq=eq,solve_accuracy=.001,rake=[.1,250],ws_kb_after_solve=500000,arms={})])
            op=od/(j['id']+'.json');op.write_text(json.dumps(original))
            with patch.object(score,'B',root):
                self.assertEqual(score.technical('TRAIN')[2]['usable_arms'],0)
                cases=[]
                for key,value in (('status','failed'),('solver_runs',2),('ws_kb_end',1250000),('storage_incidents',[dict(kind='synthetic')])):
                    o=copy.deepcopy(original);o[key]=value;cases.append(o)
                for key in ('driver_sha256','jobs_sha256','storage_sha256','deadline_sha256'):
                    o=copy.deepcopy(original);o['provenance'][key]='wrong';cases.append(o)
                o=copy.deepcopy(original);o['phases'][0]['eq']['exploitability_chips']=.7;cases.append(o)
                for o in cases:
                    op.write_text(json.dumps(o))
                    with self.assertRaises((AssertionError,ValueError,score.f4_results.ResultsError)):score.technical('TRAIN')
if __name__=='__main__':unittest.main()
